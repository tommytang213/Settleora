import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
});
const approvedSecretRoot = "/workspace/logs/settleora-auto-runner/secrets";
const smokeInputTokenEstimate = 900;
const smokeOutputTokenEstimate = 160;
const integratedOutputTokenEstimate = 700;
const integratedMaxEstimatedCostUsd = 0.25;
const integratedAllowedLanes = Object.freeze(["workflow-docs-tooling", "docs-planning"]);
const integratedAllowedPathPatterns = Object.freeze([
  /^tools\/auto-runner(?:\/|$)/,
  /^docs\/workflow(?:\/|$)/,
  /^scripts\/ai(?:\/|$)/,
  /^docs\/planning(?:\/|$)/,
  /^docs\/qa(?:\/|$)/,
]);
const secretLikePatterns = Object.freeze([
  /(^|\/)\.env($|[./-])/i,
  /(^|\/)(secret|secrets|credential|credentials|token|tokens|ssh)(\/|$)/i,
  /\/workspace\/logs\/settleora-auto-runner\/secrets\//i,
  /\b(api[_-]?key|authorization\s*[:=]|bearer\s+[A-Za-z0-9._~+/-]+|x-goog-api-key\s*[:=])\b/i,
]);

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
  };

  if (!tier || !tier.enabled) return finishIntegrated(config, base, startedAtMs, "skipped_external_reviewer_tier_disabled");
  if (route.tier !== "cheap_independent") return finishIntegrated(config, base, startedAtMs, "blocked_external_reviewer_route_not_eligible");
  if (!integratedAllowedLanes.includes(laneDecision.lane)) {
    return finishIntegrated(config, base, startedAtMs, "blocked_external_reviewer_lane_not_eligible");
  }
  if (!changedFiles.every(isIntegratedAllowedPath)) {
    return finishIntegrated(config, base, startedAtMs, "blocked_external_reviewer_path_not_eligible");
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
  let attemptedResult = {
    ...base,
    status: "blocked",
    reason: "blocked_provider_not_called",
  };
  try {
    const response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": keyResult.apiKey },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    const sanitizedText = sanitizeSecretText(responseText, keyResult.apiKey);
    if (!response.ok) {
      attemptedResult = {
        ...base,
        reason: "blocked_provider_http_error",
        sanitizedResponseSummary: bounded(sanitizedText),
      };
    } else {
      const parsed = JSON.parse(responseText);
      const text = extractGeminiText(parsed);
      const verdict = parseIntegratedVerdict(text);
      if (!verdict.ok) {
        attemptedResult = {
          ...base,
          reason: "blocked_malformed_json_verdict",
          actualUsage: sanitizeUsage(parsed.usageMetadata),
        };
      } else if (verdict.verdict.verdict !== "pass") {
        attemptedResult = {
          ...base,
          reason: "blocked_external_reviewer_non_pass",
          verdict: verdict.verdict.verdict,
          actualUsage: sanitizeUsage(parsed.usageMetadata),
          sanitizedResponseSummary: verdict.verdict,
        };
      } else {
        attemptedResult = {
          ...base,
          status: "pass",
          reason: "integrated_review_passed",
          verdict: "pass",
          actualUsage: sanitizeUsage(parsed.usageMetadata),
          sanitizedResponseSummary: verdict.verdict,
        };
      }
    }
  } catch (error) {
    attemptedResult = {
      ...base,
      reason: `blocked_provider_exception:${sanitizeSecretText(bounded(error.message, 160), keyResult.apiKey)}`,
    };
  }

  const finalBeforeReport = {
    ...attemptedResult,
    elapsedMs: Date.now() - startedAtMs,
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

export function parseIntegratedVerdict(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || "").trim());
  } catch (error) {
    return { ok: false, reason: error.message };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "verdict must be an object" };
  const keys = Object.keys(parsed).sort();
  if (keys.join(",") !== "confidence,findings,summary,verdict") {
    return { ok: false, reason: "verdict object has unsupported or missing fields" };
  }
  if (!["pass", "fail", "needs_tommy", "danger_gate", "unable_to_review"].includes(parsed.verdict)) {
    return { ok: false, reason: "verdict field is unsupported" };
  }
  if (!["low", "medium", "high"].includes(parsed.confidence)) return { ok: false, reason: "confidence field is unsupported" };
  if (typeof parsed.summary !== "string" || parsed.summary.length > 1000) {
    return { ok: false, reason: "summary must be a bounded string" };
  }
  if (!Array.isArray(parsed.findings) || parsed.findings.some((item) => typeof item !== "string" || item.length > 1000)) {
    return { ok: false, reason: "findings must be bounded strings" };
  }
  if (parsed.verdict === "pass" && parsed.findings.some((finding) => /\b(blocking|must fix|fail|danger)\b/i.test(finding))) {
    return { ok: false, reason: "pass verdict contains contradictory blocking finding language" };
  }
  return {
    ok: true,
    verdict: {
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      summary: parsed.summary,
      findings: parsed.findings.slice(0, 20),
    },
  };
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
  url.searchParams.set("key", keyResult.apiKey);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return finishSmoke(config, base, startedAtMs, "blocked_fetch_unavailable");

  base.liveCallAttempted = true;
  try {
    const response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    const sanitizedText = sanitizeSecretText(responseText, keyResult.apiKey);
    if (!response.ok) {
      return finishSmoke(config, { ...base, sanitizedResponseSummary: bounded(sanitizedText) }, startedAtMs, "blocked_provider_http_error");
    }
    const parsed = JSON.parse(responseText);
    const text = extractGeminiText(parsed);
    const verdict = parseSmokeVerdict(text);
    if (!verdict.ok) {
      return finishSmoke(config, { ...base, actualUsage: sanitizeUsage(parsed.usageMetadata) }, startedAtMs, "blocked_malformed_json_verdict");
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
  if (!resolved.startsWith(`${approvedSecretRoot}/`)) {
    return { ok: false, reason: "blocked_unapproved_secret_env_file_path" };
  }
  if (!existsSync(resolved)) return { ok: false, reason: "blocked_for_live_smoke_test_key_missing" };
  const parsed = parseEnvFile(readFileSync(resolved, "utf8"));
  const fromFile = String(parsed[envKey] || "").trim();
  if (!fromFile) return { ok: false, reason: "blocked_for_live_smoke_test_key_missing" };
  return { ok: true, source: `env-file:${resolved}`, apiKey: fromFile };
}

export function parseSmokeVerdict(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || "").trim());
  } catch (error) {
    return { ok: false, reason: error.message };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "verdict must be an object" };
  const keys = Object.keys(parsed).sort();
  if (keys.join(",") !== "findings,verdict") return { ok: false, reason: "verdict object has unsupported or missing fields" };
  if (!["pass", "fail"].includes(parsed.verdict)) return { ok: false, reason: "verdict must be pass or fail" };
  if (!Array.isArray(parsed.findings) || parsed.findings.some((item) => typeof item !== "string")) {
    return { ok: false, reason: "findings must be an array of strings" };
  }
  return { ok: true, verdict: { verdict: parsed.verdict, findings: parsed.findings.slice(0, 5) } };
}

export function sanitizeSecretText(value, secret) {
  let text = String(value || "");
  if (secret) text = text.split(secret).join("[REDACTED]");
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]");
  text = text.replace(/(x-goog-api-key|authorization|api[_-]?key)(["':=\s]+)[^\s"',}]+/gi, "$1$2[REDACTED]");
  return text;
}

function buildGeminiSmokePayload() {
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
      "Runner dangerous/trusted/auto-merge capabilities remain disabled.",
      "External reviewer output may only approve or block; it must not request GitHub mutations.",
      "Approved first lanes are workflow-docs-tooling and docs-planning only.",
    ],
    diffTruncated: Boolean(summary.diffTruncated),
  };
  return [
    "Return strict JSON only. No markdown, no prose outside JSON.",
    'Schema: {"verdict":"pass|fail|needs_tommy|danger_gate|unable_to_review","confidence":"low|medium|high","summary":"short string","findings":["short string"]}',
    "Pass only if this low-risk Settleora auto-runner pre-PR package is scoped, validated, and safe to proceed to PR creation.",
    "Fail or gate if the package touches blocked domains, has ambiguous scope, missing validation, secret-boundary risk, or reviewer-output GitHub mutation risk.",
    "",
    "Review package summary:",
    JSON.stringify(packageSummary, null, 2),
    "",
    "Sanitized bounded diff:",
    bounded(diff, 90_000),
  ].join("\n");
}

function buildIntegratedReviewPayload(prompt) {
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
    },
  };
}

function extractGeminiText(parsed) {
  return String(parsed?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "");
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
  switch (String(model || "")) {
    case "gemini-2.5-flash-lite":
      return supportedGeminiModelEndpoints["gemini-2.5-flash-lite"];
    case "gemini-2.5-flash":
      return supportedGeminiModelEndpoints["gemini-2.5-flash"];
    case "gemini-2.5-pro":
      return supportedGeminiModelEndpoints["gemini-2.5-pro"];
    default:
      return null;
  }
}

function finishSmoke(config, result, startedAtMs, reason) {
  const final = {
    ...result,
    status: result.status === "pass" ? "pass" : reason.startsWith("skipped") ? "skipped" : "blocked",
    reason: result.reason || reason,
    elapsedMs: Date.now() - startedAtMs,
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
  const filePath = path.join(root, `${safeTimestamp()}-gemini-reviewer-smoke.json`);
  writeFileSync(filePath, `${JSON.stringify(result, null, 2)}\n`);
  return filePath;
}

function writeIntegratedReport(config, result) {
  const root = path.join(config.logsRoot, "reviews", "integrated");
  mkdirSync(root, { recursive: true });
  const filePath = path.join(root, `${safeTimestamp()}-gemini-integrated-review.json`);
  writeFileSync(filePath, `${JSON.stringify(sanitizeReviewResult(result), null, 2)}\n`);
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
  writeFileSync(accounting.accountingPath, `${JSON.stringify({ entries: [...entries, entry] }, null, 2)}\n`);
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

function bounded(text, max = 1000) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}\n[truncated]` : value;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function isIntegratedAllowedPath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  return integratedAllowedPathPatterns.some((pattern) => pattern.test(normalized));
}

function hasSecretBoundaryViolation(changedFiles, diff) {
  const haystack = [...changedFiles, diff].join("\n");
  return secretLikePatterns.some((pattern) => pattern.test(haystack));
}
