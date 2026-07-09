import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { safeTimestamp } from "./logger.mjs";
import {
  estimateReviewerCostUsd,
  evaluateReviewerBudget,
  loadReviewerAccounting,
  mergeReviewerPolicyConfig,
} from "./reviewer-policy.mjs";

const defaultGeminiEndpoint = "https://generativelanguage.googleapis.com/v1beta";
const approvedSecretRoot = "/workspace/logs/settleora-auto-runner/secrets";
const smokeInputTokenEstimate = 900;
const smokeOutputTokenEstimate = 160;

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

  const keyResult = loadGeminiApiKey({
    env: options.env || process.env,
    envFilePath: profile.envFilePath || config.reviewerSmokeTest?.envFilePath || null,
    envKey: profile.apiKeyEnv || "GEMINI_API_KEY",
  });
  if (!keyResult.ok) return finishSmoke(config, base, startedAtMs, keyResult.reason);
  if (!liveRequested) return finishSmoke(config, base, startedAtMs, "blocked_live_external_reviewer_calls_not_opted_in");

  const payload = buildGeminiSmokePayload();
  const endpoint = profile.endpoint || defaultGeminiEndpoint;
  const url = `${endpoint.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(keyResult.apiKey)}`;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return finishSmoke(config, base, startedAtMs, "blocked_fetch_unavailable");

  base.liveCallAttempted = true;
  try {
    const response = await fetchImpl(url, {
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

function writeSmokeReport(config, result) {
  const root = path.join(config.logsRoot, "reviews", "smoke-tests");
  mkdirSync(root, { recursive: true });
  const filePath = path.join(root, `${safeTimestamp()}-gemini-reviewer-smoke.json`);
  writeFileSync(filePath, `${JSON.stringify(result, null, 2)}\n`);
  return filePath;
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
