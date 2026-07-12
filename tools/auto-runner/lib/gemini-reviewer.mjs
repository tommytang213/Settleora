import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { safeTimestamp } from "./logger.mjs";
import {
  estimateReviewerCostUsd,
  evaluateReviewerBudget,
  loadReviewerAccounting,
  mergeReviewerPolicyConfig,
  routeReviewer,
} from "./reviewer-policy.mjs";

const geminiApiOrigin = "https://generativelanguage.googleapis.com";
export const supportedGeminiModelEndpoints = Object.freeze({
  "gemini-2.5-flash-lite": `${geminiApiOrigin}/v1beta/models/gemini-2.5-flash-lite:generateContent`,
  "gemini-2.5-flash": `${geminiApiOrigin}/v1beta/models/gemini-2.5-flash:generateContent`,
  "gemini-2.5-pro": `${geminiApiOrigin}/v1beta/models/gemini-2.5-pro:generateContent`,
  "gemini-pro-latest": `${geminiApiOrigin}/v1beta/models/gemini-pro-latest:generateContent`,
  "gemini-flash-latest": `${geminiApiOrigin}/v1beta/models/gemini-flash-latest:generateContent`,
  "gemini-flash-lite-latest": `${geminiApiOrigin}/v1beta/models/gemini-flash-lite-latest:generateContent`,
  "gemini-3.1-pro-preview": `${geminiApiOrigin}/v1beta/models/gemini-3.1-pro-preview:generateContent`,
});
const approvedSecretRoot = "/workspace/logs/settleora-auto-runner/secrets";
const smokeInputTokenEstimate = 900;
const smokeOutputTokenEstimate = 320;
const integratedOutputTokenEstimate = 1000;
const integratedMaxEstimatedCostUsd = 0.25;
const maxGeminiProviderResponseBytes = 64 * 1024;
const maxGeminiRequestMs = 45_000;
const maxGeminiReviewerRetries = 2;
const maxGeminiRetryBackoffMs = 10_000;
const geminiRetryDelayBucketsMs = Object.freeze([0, 100, 500, 1000, 2000, 5000, 10_000]);
const secretLikePatterns = Object.freeze([
  /(^|\/)\.env($|[./-])/i,
]);
const secretLikePathPatterns = Object.freeze([
  /(^|\/)\.env($|[./-])/i,
  /(^|\/)(secrets?|credentials?|tokens?|ssh)(\/|$)/i,
  /\/workspace\/logs\/settleora-auto-runner\/secrets\//i,
]);
const credentialValuePatterns = Object.freeze([
  /\b(api[_-]?key|authorization|x-goog-api-key)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{12,}/i,
  /\bbearer\s+[A-Za-z0-9._~+/-]{12,}/i,
  /\b[A-Za-z_][A-Za-z0-9_]*_(TOKEN|SECRET|KEY)\s*=\s*["']?[A-Za-z0-9._~+/-]{12,}/,
]);
const integratedVerdictFields = Object.freeze(["verdict", "confidence", "summary", "findings"]);
const integratedVerdictValues = Object.freeze(["pass", "fail", "needs_tommy", "danger_gate", "unable_to_review"]);
const confidenceValues = Object.freeze(["low", "medium", "high"]);
const smokeVerdictFields = Object.freeze(["verdict", "findings"]);
const smokeVerdictValues = Object.freeze(["pass", "fail"]);
const maxIntegratedSummaryChars = 1000;
const maxIntegratedFindingChars = 1000;
const maxIntegratedFindings = 20;
const maxSmokeFindingChars = 500;
const maxSmokeFindings = 5;
const successfulGeminiFinishReasons = new Set(["STOP"]);
const truncatedGeminiFinishReasons = new Set(["MAX_TOKENS"]);
const safetyBlockedGeminiFinishReasons = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]);

export async function runGeminiIntegratedReview(config, packageInfo, options = {}) {
  const startedAtMs = Date.now();
  const summary = packageInfo?.summary || {};
  const laneDecision = summary.laneDecision || {};
  const changedFiles = Array.isArray(summary.changedFiles) ? summary.changedFiles : [];
  const diff = String(packageInfo?.diff || "");
  const route = routeReviewer({
    changedFiles,
    laneDecision,
    stats: summary.diffStats || {},
  });
  const { reviewerTiers, reviewerBudget } = mergeReviewerPolicyConfig(config);
  const tierId = route.tier;
  const tier = reviewerTiers[tierId];
  const providerProfiles = config.reviewerProviderProfiles || {};
  const profile = providerProfiles[tier?.providerProfile] || providerProfiles.gemini || {};
  const model = tier?.model || profile.defaultModel || "gemini-2.5-flash-lite";
  const estimatedInputTokens = estimateTokens(buildIntegratedReviewPrompt(summary, diff));
  const estimatedOutputTokens = integratedOutputTokenEstimate;
  const estimatedCostUsd = estimateReviewerCostUsd({
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    inputUsdPerMillionTokens: tier?.inputUsdPerMillionTokens || 0,
    outputUsdPerMillionTokens: tier?.outputUsdPerMillionTokens || 0,
  });

  const base = {
    mode: "integrated-pre-pr-review",
    provider: "gemini",
    independent: true,
    tier: tierId,
    providerProfile: tier?.providerProfile || null,
    model,
    pricing: {
      inputUsdPerMillionTokens: tier?.inputUsdPerMillionTokens || 0,
      outputUsdPerMillionTokens: tier?.outputUsdPerMillionTokens || 0,
    },
    route,
    lane: laneDecision.lane || null,
    changedFiles,
    changedFilesDigest: digestStrings(changedFiles),
    packageDigest: sha256Text(stableJson({ summary, diff })),
    baseSha: summary.baseSha || summary.baseRefSha || summary.baseOriginMainSha || null,
    verdictSchemaVersion: 1,
    reviewedHead: summary.currentHead || summary.headSha || summary.runnerCreatedCommitSha || null,
    issueNumber: summary.issue?.number || null,
    liveCallAttempted: false,
    status: "blocked",
    reason: null,
    verdict: "not_run",
    estimated: {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      costUsd: estimatedCostUsd,
      capUsd: integratedMaxEstimatedCostUsd,
    },
    budget: null,
    accounting: null,
    actualUsage: null,
    elapsedMs: null,
    reportPath: null,
    completedAt: null,
  };

  if (!tier || !tier.enabled) return finishIntegrated(config, base, startedAtMs, "skipped_external_reviewer_tier_disabled");
  if (route.tier === "block_split_or_escalate") {
    return finishIntegrated(config, base, startedAtMs, "blocked_external_reviewer_split_required");
  }
  if (hasSecretBoundaryViolation(changedFiles, diff)) {
    return finishIntegrated(config, base, startedAtMs, "blocked_secret_boundary_violation");
  }
  if (tier.provider !== "gemini") return finishIntegrated(config, base, startedAtMs, "blocked_provider_tier_not_gemini");
  const endpoint = resolveGeminiModelEndpoint(model);
  if (!endpoint) return finishIntegrated(config, base, startedAtMs, "blocked_unsupported_gemini_model");
  if (estimatedCostUsd > integratedMaxEstimatedCostUsd) {
    return finishIntegrated(config, base, startedAtMs, "blocked_integrated_estimated_cost_over_cap");
  }

  let accounting;
  try {
    accounting = loadReviewerAccounting(config);
  } catch (error) {
    return finishIntegrated(config, base, startedAtMs, `blocked_reviewer_accounting_parse_error:${bounded(error.message, 160)}`);
  }
  const budget = evaluateReviewerBudget({
    reviewerBudget,
    currentMonthlySpendUsd: accounting.currentMonthlySpendUsd,
    estimatedCostUsd,
  });
  base.budget = budget;
  base.accounting = {
    accountingPath: accounting.accountingPath,
    monthKey: accounting.monthKey,
    currentMonthlySpendUsd: accounting.currentMonthlySpendUsd,
  };
  if (budget.block) return finishIntegrated(config, base, startedAtMs, "blocked_reviewer_budget_hard_stop");

  const keyResult = loadGeminiApiKey({
    env: options.env || process.env,
    envFilePath: profile.envFilePath || null,
    envKey: profile.apiKeyEnv || "GEMINI_API_KEY",
  });
  if (!keyResult.ok) return finishIntegrated(config, base, startedAtMs, keyResult.reason.replace("smoke_test", "integrated_review"));

  const prompt = buildIntegratedReviewPrompt(summary, diff);
  const payload = buildIntegratedReviewPayload(prompt);
  const url = new URL(endpoint);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return finishIntegrated(config, base, startedAtMs, "blocked_fetch_unavailable");

  base.liveCallAttempted = true;
  const attemptedResult = await callIntegratedGeminiWithRetry({
    config,
    base,
    url: url.toString(),
    payload,
    fetchImpl,
    apiKey: keyResult.apiKey,
    sleep: options.sleep,
  });

  const finalBeforeReport = {
    ...attemptedResult,
    elapsedMs: Date.now() - startedAtMs,
    completedAt: new Date().toISOString(),
  };
  finalBeforeReport.reportPath = writeIntegratedReport(config, finalBeforeReport);
  try {
    writeReviewerAccounting(config, accounting, finalBeforeReport);
  } catch (error) {
    return finishIntegrated(
      config,
      {
        ...finalBeforeReport,
        status: "blocked",
        reason: `blocked_reviewer_accounting_write_error:${bounded(error.message, 160)}`,
      },
      startedAtMs,
      `blocked_reviewer_accounting_write_error:${bounded(error.message, 160)}`,
      { rewriteReport: true },
    );
  }
  return finalBeforeReport;
}

async function callIntegratedGeminiWithRetry({ config, base, url, payload, fetchImpl, apiKey, sleep }) {
  const retry = normalizeGeminiRetry(config.geminiReviewerRetry);
  const attempts = [];
  let lastResult = {
    ...base,
    status: "blocked",
    reason: "blocked_provider_not_called",
  };
  for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
    lastResult = await callIntegratedGeminiOnce({ base, url, payload, fetchImpl, apiKey });
    attempts.push(sanitizeAttempt({ attempt, status: lastResult.status, reason: lastResult.reason, transient: isTransientProviderResult(lastResult) }));
    if (!isTransientProviderResult(lastResult) || attempt === retry.maxAttempts) break;
    await (sleep || sleepPromise)(retry.backoffMs);
  }
  return {
    ...lastResult,
    providerAttempts: attempts,
    transientAttemptCount: attempts.filter((attempt) => attempt.transient).length,
  };
}

async function callIntegratedGeminiOnce({ base, url, payload, fetchImpl, apiKey }) {
  let responseBody = { text: "", truncated: false };
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: timeoutSignal(),
      body: JSON.stringify(payload),
    });
    responseBody = await readBoundedProviderResponseText(response);
    const responseText = responseBody.text;
    const sanitizedText = sanitizeSecretText(responseText, apiKey);
    if (!response.ok) {
      const transient = isTransientHttpStatus(response.status) || /\b(UNAVAILABLE|timeout|timed out|rate limit|429|503)\b/i.test(sanitizedText);
      return {
        ...base,
        reason: transient ? `blocked_provider_transient_http_error:${response.status || "unknown"}` : "blocked_provider_http_error",
        providerMetadata: {
          httpStatus: response.status || null,
          responseTextBytes: byteLength(responseText),
          responseTruncated: Boolean(responseBody.truncated),
          summary: bounded(sanitizedText),
        },
      };
    }
    const parsed = JSON.parse(responseText);
    const candidateCheck = evaluateGeminiCandidateResponse(parsed, responseBody);
    if (!candidateCheck.ok) {
      return {
        ...base,
        reason: candidateCheck.reason,
        actualUsage: sanitizeUsage(parsed.usageMetadata),
        providerMetadata: candidateCheck.metadata,
      };
    }
    const text = candidateCheck.text;
    const verdict = parseIntegratedVerdict(text);
    if (!verdict.ok) {
      return {
        ...base,
        reason: verdict.reason === "malformed_json" ? "blocked_malformed_json_verdict" : "blocked_verdict_schema_validation_failed",
        actualUsage: sanitizeUsage(parsed.usageMetadata),
        providerMetadata: {
          ...candidateCheck.metadata,
          verdictReason: verdict.reason,
          verdictDetail: bounded(verdict.detail || verdict.reason, 240),
        },
      };
    }
    if (verdict.verdict.verdict !== "pass") {
      return {
        ...base,
        reason: "blocked_external_reviewer_non_pass",
        verdict: verdict.verdict.verdict,
        actualUsage: sanitizeUsage(parsed.usageMetadata),
        sanitizedResponseSummary: verdict.verdict,
        providerMetadata: candidateCheck.metadata,
      };
    }
    return {
      ...base,
      status: "pass",
      reason: "integrated_review_passed",
      verdict: "pass",
      actualUsage: sanitizeUsage(parsed.usageMetadata),
      sanitizedResponseSummary: verdict.verdict,
      providerMetadata: candidateCheck.metadata,
    };
  } catch (error) {
    const message = sanitizeSecretText(bounded(error.message, 160), apiKey);
    const transient = isTransientProviderError(message);
    return {
      ...base,
      reason: `${transient ? "blocked_provider_transient_exception" : "blocked_provider_exception"}:${message}`,
      providerMetadata: {
        responseTextBytes: byteLength(responseBody.text),
        responseTruncated: Boolean(responseBody.truncated),
      },
    };
  }
}

export function parseIntegratedVerdict(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || "").trim());
  } catch (error) {
    return { ok: false, reason: "malformed_json", detail: error.message };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "schema_validation", detail: "verdict must be an object" };
  const keys = Object.keys(parsed).sort();
  if (keys.join(",") !== "confidence,findings,summary,verdict") {
    return { ok: false, reason: "schema_validation", detail: "verdict object has unsupported or missing fields" };
  }
  if (!integratedVerdictValues.includes(parsed.verdict)) {
    return { ok: false, reason: "schema_validation", detail: "verdict field is unsupported" };
  }
  if (!confidenceValues.includes(parsed.confidence)) return { ok: false, reason: "schema_validation", detail: "confidence field is unsupported" };
  if (typeof parsed.summary !== "string" || parsed.summary.length > maxIntegratedSummaryChars) {
    return { ok: false, reason: "schema_validation", detail: "summary must be a bounded string" };
  }
  if (
    !Array.isArray(parsed.findings) ||
    parsed.findings.length > maxIntegratedFindings ||
    parsed.findings.some((item) => typeof item !== "string" || item.length > maxIntegratedFindingChars)
  ) {
    return { ok: false, reason: "schema_validation", detail: "findings must be bounded strings" };
  }
  if (parsed.verdict === "pass" && parsed.findings.some(hasContradictoryPassFindingLanguage)) {
    return { ok: false, reason: "schema_validation", detail: "pass verdict contains contradictory blocking finding language" };
  }
  return {
    ok: true,
    verdict: {
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      summary: parsed.summary,
      findings: parsed.findings.slice(0, maxIntegratedFindings),
    },
  };
}

function hasContradictoryPassFindingLanguage(finding) {
  const text = String(finding || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!/\b(blocking|must fix|fail|failed|failing|failure|danger)\b/.test(text)) return false;
  const negatedBlocker =
    /\b(no|zero|without|none)\b(?:\s+\w+){0,8}\s+\b(blocking|must fix|failures?|failing|failure|danger)\b/.test(text) ||
    /\b(no|zero|without|none)\b(?:\s+\w+){0,8}\s+\b(findings?|issues?|concerns?)\b(?:\s+\w+){0,8}\s+\b(blocking|must fix|failures?|failing|failure|danger)\b/.test(text) ||
    /\b(blocking|must fix|failures?|failing|failure|danger)\b(?:\s+\w+){0,8}\s+\b(no|zero|none)\b/.test(text) ||
    /\b(does not|did not|do not|doesn t|didn t|not)\b(?:\s+\w+){0,8}\s+\b(introduce|create|leave|find|detect|identify|surface|show|contain)\b(?:\s+\w+){0,8}\s+\b(blocking|must fix|failures?|failing|failure|danger)\b/.test(text) ||
    /\b(no|zero|without|none)\b(?:\s+\w+){0,8}\s+\b(require|requires|required|requiring|warrant|warrants|warranting)\b(?:\s+\w+){0,8}\s+\b(blocking|must fix|failures?|failing|failure|danger)\b/.test(text);
  if (negatedBlocker) {
    return false;
  }
  if (/\b(blocking|must fix|failures?|failing|failure|danger)\s+(findings?|issues?|concerns?)?\s*(remain|remains|remaining|found|present|detected)\b/.test(text)) {
    return true;
  }
  if (/\b(remain|remains|remaining|found|present|detected|introduced|created|identified)\b(?:\s+\w+){0,8}\s+\b(blocking|must fix|failures?|failing|failure|danger)\b/.test(text)) {
    return true;
  }
  if (/\b(blocking|must fix|failures?|failing|failure|danger)\b(?:\s+\w+){0,8}\s+\b(require|requires|required|requiring|needs?|needed|warrants?)\b/.test(text)) {
    return true;
  }
  return false;
}

export async function runGeminiReviewerSmokeTest(config, options = {}) {
  const startedAtMs = Date.now();
  const liveRequested = Boolean(options.liveExternalReviewerCalls ?? config.liveExternalReviewerCalls);
  const tierId = options.tierId || config.reviewerSmokeTest?.tier || "cheap_independent";
  const { reviewerTiers, reviewerBudget } = mergeReviewerPolicyConfig(config);
  const tier = reviewerTiers[tierId];
  const providerProfiles = config.reviewerProviderProfiles || {};
  const profile = providerProfiles[tier?.providerProfile] || providerProfiles.gemini || {};
  const model = tier?.model || profile.defaultModel || "gemini-2.5-flash-lite";
  const estimatedCostUsd = estimateReviewerCostUsd({
    inputTokens: smokeInputTokenEstimate,
    outputTokens: smokeOutputTokenEstimate,
    inputUsdPerMillionTokens: tier?.inputUsdPerMillionTokens || 0,
    outputUsdPerMillionTokens: tier?.outputUsdPerMillionTokens || 0,
  });
  const accounting = loadReviewerAccounting(config);
  const budget = evaluateReviewerBudget({
    reviewerBudget,
    currentMonthlySpendUsd: accounting.currentMonthlySpendUsd,
    estimatedCostUsd,
  });

  const base = {
    mode: "reviewer-smoke-test",
    provider: "gemini",
    tier: tierId,
    providerProfile: tier?.providerProfile || null,
    model,
    liveRequested,
    liveCallAttempted: false,
    verdict: "not_run",
    status: "blocked",
    reason: null,
    budget,
    estimated: {
      inputTokens: smokeInputTokenEstimate,
      outputTokens: smokeOutputTokenEstimate,
      costUsd: estimatedCostUsd,
      capUsd: config.reviewerSmokeTest?.maxEstimatedCostUsd ?? 0.05,
    },
    actualUsage: null,
    elapsedMs: null,
    reportPath: null,
  };

  if (!tier) return finishSmoke(config, base, startedAtMs, "blocked_unknown_tier");
  if (!tier.enabled) return finishSmoke(config, base, startedAtMs, "skipped_provider_tier_disabled");
  if (tier.provider !== "gemini") return finishSmoke(config, base, startedAtMs, "skipped_provider_tier_not_gemini");
  if (budget.block) return finishSmoke(config, base, startedAtMs, "blocked_reviewer_budget_hard_stop");
  if (estimatedCostUsd > base.estimated.capUsd) return finishSmoke(config, base, startedAtMs, "blocked_smoke_estimated_cost_over_cap");
  const endpoint = resolveGeminiModelEndpoint(model);
  if (!endpoint) return finishSmoke(config, base, startedAtMs, "blocked_unsupported_gemini_model");

  const keyResult = loadGeminiApiKey({
    env: options.env || process.env,
    envFilePath: profile.envFilePath || config.reviewerSmokeTest?.envFilePath || null,
    envKey: profile.apiKeyEnv || "GEMINI_API_KEY",
  });
  if (!keyResult.ok) return finishSmoke(config, base, startedAtMs, keyResult.reason);
  if (!liveRequested) return finishSmoke(config, base, startedAtMs, "blocked_live_external_reviewer_calls_not_opted_in");

  const payload = buildGeminiSmokePayload();
  const url = new URL(endpoint);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return finishSmoke(config, base, startedAtMs, "blocked_fetch_unavailable");

  base.liveCallAttempted = true;
  try {
    const response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": keyResult.apiKey },
      signal: timeoutSignal(),
      body: JSON.stringify(payload),
    });
    const responseBody = await readBoundedProviderResponseText(response);
    const responseText = responseBody.text;
    const sanitizedText = sanitizeSecretText(responseText, keyResult.apiKey);
    if (!response.ok) {
      return finishSmoke(config, { ...base, sanitizedResponseSummary: bounded(sanitizedText) }, startedAtMs, "blocked_provider_http_error");
    }
    const parsed = JSON.parse(responseText);
    const candidateCheck = evaluateGeminiCandidateResponse(parsed, responseBody);
    if (!candidateCheck.ok) {
      return finishSmoke(
        config,
        { ...base, actualUsage: sanitizeUsage(parsed.usageMetadata), providerMetadata: candidateCheck.metadata },
        startedAtMs,
        candidateCheck.reason,
      );
    }
    const text = candidateCheck.text;
    const verdict = parseSmokeVerdict(text);
    if (!verdict.ok) {
      return finishSmoke(
        config,
        {
          ...base,
          actualUsage: sanitizeUsage(parsed.usageMetadata),
          providerMetadata: {
            ...candidateCheck.metadata,
            verdictReason: verdict.reason,
            verdictDetail: bounded(verdict.detail || verdict.reason, 240),
          },
        },
        startedAtMs,
        verdict.reason === "malformed_json" ? "blocked_malformed_json_verdict" : "blocked_verdict_schema_validation_failed",
      );
    }
    return finishSmoke(
      config,
      {
        ...base,
        status: "pass",
        verdict: verdict.verdict.verdict,
        reason: "live_smoke_passed",
        actualUsage: sanitizeUsage(parsed.usageMetadata),
        sanitizedResponseSummary: {
          textBytes: text.length,
          verdict: verdict.verdict.verdict,
          findingsCount: verdict.verdict.findings.length,
        },
        providerMetadata: candidateCheck.metadata,
      },
      startedAtMs,
      "live_smoke_passed",
    );
  } catch (error) {
    return finishSmoke(config, base, startedAtMs, `blocked_provider_exception:${sanitizeSecretText(error.message, keyResult.apiKey)}`);
  }
}

export function loadGeminiApiKey({ env = process.env, envFilePath = null, envKey = "GEMINI_API_KEY" } = {}) {
  const fromEnv = String(env[envKey] || "").trim();
  if (fromEnv) return { ok: true, source: `env:${envKey}`, apiKey: fromEnv };
  if (!envFilePath) return { ok: false, reason: "blocked_for_live_smoke_test_key_missing" };
  const resolved = path.resolve(envFilePath);
  const metadata = validateReviewerSecretMetadata(resolved);
  if (!metadata.ok) return { ok: false, reason: metadata.reason };
  if (!existsSync(resolved)) return { ok: false, reason: "blocked_for_live_smoke_test_key_missing" };
  const parsed = parseEnvFile(readFileSync(resolved, "utf8"));
  const fromFile = String(parsed[envKey] || "").trim();
  if (!fromFile) return { ok: false, reason: "blocked_for_live_smoke_test_key_missing" };
  return { ok: true, source: `env-file:${resolved}`, apiKey: fromFile };
}

export function validateReviewerSecretMetadata(envFilePath) {
  const resolved = path.resolve(envFilePath || "");
  if (!resolved.startsWith(`${approvedSecretRoot}/`)) return { ok: false, reason: "blocked_unapproved_secret_env_file_path" };
  if (!existsSync(resolved)) return { ok: false, reason: "blocked_for_live_smoke_test_key_missing" };
  const link = lstatSync(resolved);
  if (link.isSymbolicLink()) return { ok: false, reason: "blocked_secret_env_file_symlink" };
  const file = statSync(resolved);
  if (!file.isFile()) return { ok: false, reason: "blocked_secret_env_file_not_regular" };
  if ((file.mode & 0o777) !== 0o600) return { ok: false, reason: "blocked_secret_env_file_mode" };
  if (file.uid !== process.getuid?.()) return { ok: false, reason: "blocked_secret_env_file_owner" };
  if (file.size <= 0 || file.size > 4096) return { ok: false, reason: "blocked_secret_env_file_size" };
  const dir = statSync(path.dirname(resolved));
  if (!dir.isDirectory()) return { ok: false, reason: "blocked_secret_env_dir_not_directory" };
  if ((dir.mode & 0o777) !== 0o700) return { ok: false, reason: "blocked_secret_env_dir_mode" };
  if (dir.uid !== process.getuid?.()) return { ok: false, reason: "blocked_secret_env_dir_owner" };
  return { ok: true, path: resolved, size: file.size, fileMode: "0600", dirMode: "0700" };
}

export function parseSmokeVerdict(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || "").trim());
  } catch (error) {
    return { ok: false, reason: "malformed_json", detail: error.message };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "schema_validation", detail: "verdict must be an object" };
  const keys = Object.keys(parsed).sort();
  if (keys.join(",") !== "findings,verdict") return { ok: false, reason: "schema_validation", detail: "verdict object has unsupported or missing fields" };
  if (!smokeVerdictValues.includes(parsed.verdict)) return { ok: false, reason: "schema_validation", detail: "verdict must be pass or fail" };
  if (
    !Array.isArray(parsed.findings) ||
    parsed.findings.length > maxSmokeFindings ||
    parsed.findings.some((item) => typeof item !== "string" || item.length > maxSmokeFindingChars)
  ) {
    return { ok: false, reason: "schema_validation", detail: "findings must be an array of bounded strings" };
  }
  return { ok: true, verdict: { verdict: parsed.verdict, findings: parsed.findings.slice(0, maxSmokeFindings) } };
}

export function sanitizeSecretText(value, secret) {
  let text = String(value || "");
  if (secret) text = text.split(secret).join("[REDACTED]");
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]");
  text = text.replace(/(x-goog-api-key|authorization|api[_-]?key)(["':=\s]+)[^\s"',}]+/gi, "$1$2[REDACTED]");
  return text;
}

function normalizeGeminiRetry(retry = {}) {
  const configuredRetries = Number.isInteger(retry.maxRetries) && retry.maxRetries >= 0 ? retry.maxRetries : 1;
  const maxRetries = Math.min(configuredRetries, maxGeminiReviewerRetries);
  const configuredBackoffMs = Number.isFinite(Number(retry.backoffMs)) && Number(retry.backoffMs) >= 0 ? Number(retry.backoffMs) : 2000;
  const backoffMs = Math.min(configuredBackoffMs, maxGeminiRetryBackoffMs);
  return { maxRetries, maxAttempts: maxRetries + 1, backoffMs };
}

function isTransientProviderResult(result) {
  return /^blocked_provider_transient_(http_error|exception)/.test(String(result?.reason || ""));
}

function isTransientHttpStatus(status) {
  return [429, 503].includes(Number(status));
}

function isTransientProviderError(message) {
  return /\b(fetch failed|network|timeout|timed out|ECONNRESET|ETIMEDOUT|UNAVAILABLE|503|429)\b/i.test(String(message || ""));
}

function sanitizeAttempt(attempt) {
  return JSON.parse(sanitizeSecretText(JSON.stringify(attempt), ""));
}

function sleepPromise(delayMs) {
  const safeDelayMs = boundedGeminiRetryDelayMs(delayMs);
  if (safeDelayMs <= 0) return Promise.resolve();
  if (safeDelayMs <= 100) return new Promise((resolve) => setTimeout(resolve, 100));
  if (safeDelayMs <= 500) return new Promise((resolve) => setTimeout(resolve, 500));
  if (safeDelayMs <= 1000) return new Promise((resolve) => setTimeout(resolve, 1000));
  if (safeDelayMs <= 2000) return new Promise((resolve) => setTimeout(resolve, 2000));
  if (safeDelayMs <= 5000) return new Promise((resolve) => setTimeout(resolve, 5000));
  return new Promise((resolve) => setTimeout(resolve, 10_000));
}

async function readBoundedProviderResponseText(response, maxBytes = maxGeminiProviderResponseBytes) {
  const boundedMaxBytes = Number.isSafeInteger(maxBytes) && maxBytes > 0 ? Math.min(maxBytes, maxGeminiProviderResponseBytes) : maxGeminiProviderResponseBytes;
  if (!response?.body || typeof response.body.getReader !== "function") {
    const text = String(await response.text());
    return truncateProviderTextByBytes(text, boundedMaxBytes);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let bytesRead = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      const remaining = boundedMaxBytes - bytesRead;
      if (chunk.byteLength > remaining) {
        if (remaining > 0) chunks.push(decoder.decode(chunk.subarray(0, remaining), { stream: true }));
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(decoder.decode(chunk, { stream: true }));
      bytesRead += chunk.byteLength;
    }
  } finally {
    chunks.push(decoder.decode());
  }

  return {
    text: `${chunks.join("")}${truncated ? "\n[truncated]" : ""}`,
    truncated,
  };
}

function boundedGeminiRetryDelayMs(delayMs) {
  const value = Number(delayMs);
  if (!Number.isFinite(value) || value < 0) return 0;
  const capped = Math.min(value, maxGeminiRetryBackoffMs);
  return geminiRetryDelayBucketsMs.find((bucket) => bucket >= capped) ?? maxGeminiRetryBackoffMs;
}

function truncateProviderTextByBytes(text, maxBytes) {
  const encoded = new TextEncoder().encode(String(text || ""));
  if (encoded.byteLength <= maxBytes) return { text: String(text || ""), truncated: false };
  return {
    text: `${new TextDecoder().decode(encoded.subarray(0, maxBytes))}\n[truncated]`,
    truncated: true,
  };
}

export function buildGeminiSmokePayload() {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Return strict JSON only.",
              "Review this synthetic Settleora auto-runner smoke packet. It contains no private repo diff.",
              "Schema: {\"verdict\":\"pass|fail\",\"findings\":[\"short string\"]}",
              "Packet: {\"changedFiles\":[\"tools/auto-runner/lib/example.mjs\"],\"risk\":\"workflow-tooling-smoke\",\"forbiddenMutation\":false}",
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: smokeOutputTokenEstimate,
      responseMimeType: "application/json",
      responseJsonSchema: smokeVerdictJsonSchema(),
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

function buildIntegratedReviewPrompt(summary, diff) {
  const packageSummary = {
    taskSummary: summary.issue
      ? {
          issue: summary.issue,
          lane: summary.laneDecision?.lane || null,
          changedFiles: summary.changedFiles || [],
        }
      : null,
    scope: {
      laneDecision: summary.laneDecision || null,
      nonGoals: [
        "No GitHub mutation from reviewer output.",
        "No auth/session/security runtime, storage/privacy, money, schema, OpenAPI, generated-client, Docker, CI, deployment, OCR, sync/import/export, mobile release, public/admin exposure, or production changes.",
      ],
    },
    validation: summary.validation || null,
    architectureRules: [
      "Repo source is the source of truth.",
      "Repository defaults keep approved-domain auto-merge disabled unless external config explicitly enables it for canonical lanes.",
      "External reviewer output may only approve or block; it must not request GitHub mutations.",
      "Approved sensitive implementation lanes are reviewable only when package evidence shows the lane, architecture, validation, manual-action, secret, exact-head, CI, and policy gates all pass.",
      "Production deploys, destructive execution, secret/auth credential mutation, public/admin exposure, branch deletion, force-like history, and unresolved product/policy/financial decisions remain manual actions.",
      "If the complete diff or package cannot be assessed, return unable_to_review.",
    ],
    diffTruncated: Boolean(summary.diffTruncated),
  };
  return [
    "Return strict JSON only. No markdown, no prose outside JSON.",
    "Use the provider-enforced schema. Do not add fields.",
    "Pass only if this Settleora auto-runner pre-PR package's actual lane decision, changed files, validation, and boundaries make it safe to proceed to PR creation.",
    "Fail or gate if the package touches unapproved or manual-action domains, has ambiguous scope, missing validation, secret-boundary risk, stale/incomplete evidence, or reviewer-output GitHub mutation risk.",
    "",
    "Review package summary:",
    JSON.stringify(packageSummary, null, 2),
    "",
    "Sanitized bounded diff:",
    bounded(diff, 90_000),
  ].join("\n");
}

export function buildIntegratedReviewPayload(prompt) {
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: integratedOutputTokenEstimate,
      responseMimeType: "application/json",
      responseJsonSchema: externalReviewVerdictJsonSchema(),
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

function evaluateGeminiCandidateResponse(parsed, responseBody = {}) {
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const promptFeedback = parsed?.promptFeedback && typeof parsed.promptFeedback === "object" ? parsed.promptFeedback : null;
  const candidate = candidates[0] || null;
  const text = extractGeminiText(parsed);
  const metadata = {
    candidateCount: candidates.length,
    finishReason: candidate?.finishReason || null,
    finishMessage: bounded(candidate?.finishMessage || "", 240) || null,
    safetyRatingsCount: Array.isArray(candidate?.safetyRatings) ? candidate.safetyRatings.length : 0,
    promptBlockReason: promptFeedback?.blockReason || null,
    responseTextBytes: byteLength(responseBody.text),
    candidateTextBytes: byteLength(text),
    responseTruncated: Boolean(responseBody.truncated),
    usage: sanitizeUsage(parsed?.usageMetadata),
  };
  if (metadata.promptBlockReason) return { ok: false, reason: "blocked_provider_prompt_safety_block", metadata, text };
  if (candidates.length === 0) return { ok: false, reason: "blocked_provider_no_candidates", metadata, text };
  if (safetyBlockedGeminiFinishReasons.has(String(metadata.finishReason || ""))) {
    return { ok: false, reason: "blocked_provider_candidate_safety_block", metadata, text };
  }
  if (truncatedGeminiFinishReasons.has(String(metadata.finishReason || "")) || metadata.responseTruncated) {
    return { ok: false, reason: "blocked_provider_response_truncated", metadata, text };
  }
  if (!successfulGeminiFinishReasons.has(String(metadata.finishReason || ""))) {
    return { ok: false, reason: "blocked_provider_unexpected_finish_reason", metadata, text };
  }
  if (!text.trim()) return { ok: false, reason: "blocked_provider_empty_text", metadata, text };
  return { ok: true, metadata, text };
}

function extractGeminiText(parsed) {
  return String(parsed?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "");
}

export function externalReviewVerdictJsonSchema() {
  return Object.freeze({
    type: "object",
    properties: {
      verdict: { type: "string", enum: [...integratedVerdictValues], description: "Overall external review verdict." },
      confidence: { type: "string", enum: [...confidenceValues], description: "Confidence in the verdict." },
      summary: { type: "string", description: "Bounded summary of the decision." },
      findings: {
        type: "array",
        minItems: 0,
        maxItems: maxIntegratedFindings,
        items: { type: "string", description: "Bounded blocking or non-blocking finding." },
      },
    },
    required: [...integratedVerdictFields],
    additionalProperties: false,
    propertyOrdering: [...integratedVerdictFields],
  });
}

export function smokeVerdictJsonSchema() {
  return Object.freeze({
    type: "object",
    properties: {
      verdict: { type: "string", enum: [...smokeVerdictValues], description: "Smoke verdict." },
      findings: {
        type: "array",
        minItems: 0,
        maxItems: maxSmokeFindings,
        items: { type: "string", description: "Bounded smoke finding." },
      },
    },
    required: [...smokeVerdictFields],
    additionalProperties: false,
    propertyOrdering: [...smokeVerdictFields],
  });
}

function parseEnvFile(text) {
  const result = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return result;
}

export function resolveGeminiModelEndpoint(model) {
  const normalized = String(model || "");
  if (!/^gemini-[A-Za-z0-9][A-Za-z0-9.-]{0,80}$/.test(normalized)) return null;
  return `${geminiApiOrigin}/v1beta/models/${normalized}:generateContent`;
}

function finishSmoke(config, result, startedAtMs, reason) {
  const final = {
    ...result,
    status: result.status === "pass" ? "pass" : reason.startsWith("skipped") ? "skipped" : "blocked",
    reason: result.reason || reason,
    elapsedMs: Date.now() - startedAtMs,
    completedAt: new Date().toISOString(),
  };
  final.reportPath = writeSmokeReport(config, final);
  return final;
}

function finishIntegrated(config, result, startedAtMs, reason, options = {}) {
  const final = {
    ...result,
    status: result.status === "pass" ? "pass" : reason.startsWith("skipped") ? "skipped" : "blocked",
    reason: result.reason || reason,
    elapsedMs: Date.now() - startedAtMs,
  };
  if (!final.reportPath || options.rewriteReport) {
    final.reportPath = writeIntegratedReport(config, final);
  }
  return final;
}

function writeSmokeReport(config, result) {
  const root = path.join(config.logsRoot, "reviews", "smoke-tests");
  mkdirSync(root, { recursive: true });
  const filePath = path.join(root, `${safeTimestamp()}-${safeFileToken(result.tier)}-${process.pid}-${Date.now()}-gemini-reviewer-smoke.json`);
  writeOwnerOnlyJson(filePath, result);
  return filePath;
}

function writeIntegratedReport(config, result) {
  const root = path.join(config.logsRoot, "reviews", "integrated");
  mkdirSync(root, { recursive: true });
  const filePath = path.join(root, `${safeTimestamp()}-${safeFileToken(result.tier)}-${process.pid}-${Date.now()}-gemini-integrated-review.json`);
  writeOwnerOnlyJson(filePath, sanitizeReviewResult(result));
  return filePath;
}

function writeReviewerAccounting(config, accounting, result) {
  const entries = Array.isArray(accounting.entries) ? accounting.entries : [];
  const usage = result.actualUsage || {};
  const actualInputTokens = usage.promptTokenCount;
  const actualOutputTokens = usage.candidatesTokenCount;
  const actualCostUsd =
    Number.isFinite(actualInputTokens) && Number.isFinite(actualOutputTokens)
      ? estimateReviewerCostUsd({
          inputTokens: actualInputTokens,
          outputTokens: actualOutputTokens,
          inputUsdPerMillionTokens: result.pricing?.inputUsdPerMillionTokens || 0,
          outputUsdPerMillionTokens: result.pricing?.outputUsdPerMillionTokens || 0,
        })
      : null;
  const recordedCostUsd = actualCostUsd ?? result.estimated.costUsd;
  const entry = {
    timestamp: new Date().toISOString(),
    monthKey: accounting.monthKey,
    commandMode: result.mode,
    provider: result.provider,
    tier: result.tier,
    model: result.model,
    estimatedInputTokens: result.estimated.inputTokens,
    estimatedOutputTokens: result.estimated.outputTokens,
    estimatedCostUsd: result.estimated.costUsd,
    actualUsage: result.actualUsage,
    recordedCostUsd,
    costUsd: recordedCostUsd,
    status: result.status,
    sanitizedReportPath: result.reportPath,
  };
  writeOwnerOnlyJson(accounting.accountingPath, { entries: [...entries, entry] });
}

function sanitizeReviewResult(result) {
  return JSON.parse(sanitizeSecretText(JSON.stringify(result), ""));
}

function sanitizeUsage(usageMetadata) {
  if (!usageMetadata || typeof usageMetadata !== "object") return null;
  return {
    promptTokenCount: numberOrNull(usageMetadata.promptTokenCount),
    candidatesTokenCount: numberOrNull(usageMetadata.candidatesTokenCount),
    totalTokenCount: numberOrNull(usageMetadata.totalTokenCount),
  };
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function byteLength(text) {
  return new TextEncoder().encode(String(text || "")).byteLength;
}

function bounded(text, max = 1000) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}\n[truncated]` : value;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function hasSecretBoundaryViolation(changedFiles, diff) {
  return (
    changedFiles.some((file) => secretLikePathPatterns.some((pattern) => pattern.test(file))) ||
    secretLikePatterns.some((pattern) => pattern.test(diff)) ||
    credentialValuePatterns.some((pattern) => pattern.test(diff))
  );
}

function timeoutSignal() {
  if (typeof AbortSignal?.timeout === "function") return AbortSignal.timeout(maxGeminiRequestMs);
  return undefined;
}

function sha256Text(text) {
  return createHash("sha256").update(String(text || "")).digest("hex");
}

function digestStrings(values = []) {
  return sha256Text(values.map((value) => String(value || "")).filter(Boolean).sort().join("\n"));
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(flattenKeys(value)).sort());
}

function flattenKeys(value, keys = {}) {
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys[key] = true;
      flattenKeys(child, keys);
    }
  }
  return keys;
}

function writeOwnerOnlyJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tempPath, filePath);
}

function safeFileToken(value) {
  return String(value || "unknown").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "unknown";
}
