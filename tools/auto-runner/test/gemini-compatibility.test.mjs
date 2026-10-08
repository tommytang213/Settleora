import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildGeminiSmokePayload, buildIntegratedReviewPayload, runGeminiIntegratedReview, runGeminiReviewerSmokeTest } from "../lib/gemini-reviewer.mjs";
import { geminiReviewerCapabilities, geminiReviewerRequestPolicy } from "../lib/gemini-request-policy.mjs";
import { sanitizeGeminiUsage, geminiUsageCost } from "../lib/gemini-usage.mjs";

const pricing = { inputUsdPerMillionTokens: 1.5, outputUsdPerMillionTokens: 9 };
const estimated = { inputTokens: 900, outputTokens: 1000, costUsd: 0.01035 };
const approved = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.5-flash"];
const blocked = ["gemini-2.5-pro", "gemini-3.1-pro-preview", "gemini-pro-latest", "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.8-flash", "gemini-3.5-flash-latest", "__proto__", "", null];
for (const model of approved) {
  test(`both payloads preserve the approved parameters for ${model}`, () => {
    const smoke = buildGeminiSmokePayload(model);
    const integrated = buildIntegratedReviewPayload("packet", model);
    assert.equal(geminiReviewerRequestPolicy(model).ok, true);
    for (const [payload, cap] of [[smoke, 320], [integrated, 1000]]) {
      assert.deepEqual(Object.keys(payload.generationConfig).sort(), ["maxOutputTokens", "responseJsonSchema", "responseMimeType", "temperature", "thinkingConfig"]);
      assert.equal(payload.generationConfig.maxOutputTokens, cap);
      assert.equal(payload.generationConfig.temperature, 0);
      assert.equal(payload.generationConfig.responseMimeType, "application/json");
      assert.equal(payload.generationConfig.responseJsonSchema.additionalProperties, false);
      assert.deepEqual(payload.generationConfig.thinkingConfig, { thinkingBudget: 0 });
    }
    smoke.generationConfig.thinkingConfig.thinkingBudget = 400;
    assert.equal(buildGeminiSmokePayload(model).generationConfig.thinkingConfig.thinkingBudget, 0);
  });
}
for (const model of blocked) {
  test(`no inherited recipe or new parameter defaults for ${model}`, () => {
    assert.equal(geminiReviewerRequestPolicy(model).ok, false);
    assert.throws(() => buildGeminiSmokePayload(model), /blocked_/);
    assert.throws(() => buildIntegratedReviewPayload("packet", model), /blocked_/);
  });
}
test("capability table and nested request recipes cannot be altered", () => {
  assert.throws(() => { geminiReviewerCapabilities["gemini-3.5-flash"].recipe.thinkingConfig.thinkingBudget = 300; }, TypeError);
});

test("usage sanitizer rejects coercion, negatives, fractions, unsafe integers and arrays", () => {
  for (const value of [null, "5", true, -1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(sanitizeGeminiUsage({ promptTokenCount: value, candidatesTokenCount: value, thoughtsTokenCount: value, totalTokenCount: value }),
      { promptTokenCount: null, candidatesTokenCount: null, thoughtsTokenCount: null, totalTokenCount: null });
  }
  assert.equal(sanitizeGeminiUsage([]), null);
});

test("thinking is billed once, including omitted counts recoverable from total", () => {
  for (const thoughts of [80, undefined]) {
    const charge = geminiUsageCost({ promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: thoughts, totalTokenCount: 200 }, estimated, pricing);
    assert.equal(charge.costUsd, 0.00105);
    assert.equal(charge.basis, "provider_usage");
  }
  assert.equal(geminiUsageCost({ promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 }, estimated, pricing).costUsd, 0.00033);
  assert.ok(geminiUsageCost({ promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 80 }, estimated, pricing).costUsd >= estimated.costUsd);
});

test("partial/inconsistent/overflow usage never erases the estimate or known charges", () => {
  for (const usage of [null, {}, { promptTokenCount: 0, candidatesTokenCount: null }, { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 80, totalTokenCount: 120 }, { promptTokenCount: -10, candidatesTokenCount: "20" }]) {
    const charge = geminiUsageCost(usage, estimated, pricing);
    assert.ok(charge.costUsd >= estimated.costUsd);
    assert.equal(charge.basis, "conservative_estimate_or_partial_usage");
  }
  assert.ok(geminiUsageCost({ thoughtsTokenCount: 9000 }, estimated, pricing).costUsd >= 0.081);
  assert.ok(geminiUsageCost({ totalTokenCount: 100000 }, estimated, pricing).costUsd >= 0.9);
  assert.ok(geminiUsageCost({ promptTokenCount: 1000000 }, estimated, pricing).costUsd >= 1.509);
  const huge = geminiUsageCost({ promptTokenCount: Number.MAX_SAFE_INTEGER, candidatesTokenCount: Number.MAX_SAFE_INTEGER, thoughtsTokenCount: Number.MAX_SAFE_INTEGER }, estimated, pricing);
  assert.ok(Number.isFinite(huge.costUsd) && huge.costUsd > 1000000);
  assert.equal(huge.basis, "conservative_estimate_or_partial_usage");
});

function config(logsRoot, model = "gemini-3.5-flash", overrides = {}) {
  return { logsRoot, reviewerTiers: { cheap_independent: { enabled: true, provider: "gemini", model, ...pricing } },
    geminiReviewerRetry: { maxRetries: 1, backoffMs: 0 }, ...overrides };
}
const packet = { summary: { changedFiles: ["tools/auto-runner/lib/example.mjs"], laneDecision: { lane: "workflow-docs-tooling" }, currentHead: "test-head" },
  diff: "diff --git a/tools/auto-runner/lib/example.mjs b/tools/auto-runner/lib/example.mjs\n--- a/tools/auto-runner/lib/example.mjs\n+++ b/tools/auto-runner/lib/example.mjs\n@@ -0,0 +1 @@\n+const n = 1;\n" };
function response(smoke, { finishReason = "STOP", usageMetadata = { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 80, totalTokenCount: 200 }, status = 200 } = {}) {
  const verdict = smoke ? { verdict: "pass", findings: [] } : { verdict: "pass", confidence: "high", summary: "reviewed", findings: [] };
  return { ok: status === 200, status, text: async () => JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(verdict) }] } }], usageMetadata }) };
}
async function isolated(run) {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-gemini-compat-"));
  try { await run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function execute(smoke, cfg, options) {
  return smoke ? runGeminiReviewerSmokeTest(cfg, { liveExternalReviewerCalls: true, ...options }) : runGeminiIntegratedReview(cfg, packet, options);
}
const env = { GEMINI_API_KEY: "test-offline-placeholder" };
for (const smoke of [true, false]) {
  test(`${smoke ? "smoke" : "integrated"} blocks incompatible models before key access/fetch/accounting`, async () => {
    for (const model of blocked.filter(Boolean)) await isolated(async (root) => {
      let calls = 0;
      const result = await execute(smoke, config(root, model), {
        env: new Proxy({}, { get() { throw Error("unexpected key access"); } }),
        fetchImpl: async () => { calls++; throw Error("unexpected fetch"); },
      });
      assert.equal(result.status, "blocked", model);
      assert.equal(result.reason, geminiReviewerRequestPolicy(model).reason, model);
      assert.equal(result.liveCallAttempted, false);
      assert.equal(calls, 0);
    });
  });
  test(`${smoke ? "smoke" : "integrated"} sends pinned recipe and accounts STOP and rejected MAX_TOKENS output`, async () => {
    for (const finishReason of ["STOP", "MAX_TOKENS"]) await isolated(async (root) => {
      let request;
      const result = await execute(smoke, config(root), { env, fetchImpl: async (_url, init) => { request = JSON.parse(init.body); return response(smoke, { finishReason }); } });
      assert.deepEqual(request.generationConfig.thinkingConfig, { thinkingBudget: 0 });
      assert.equal(request.generationConfig.temperature, 0);
      assert.equal(result.status, finishReason === "STOP" ? "pass" : "blocked");
      if (finishReason !== "STOP") assert.equal(result.reason, "blocked_provider_response_truncated");
      assert.equal(result.actualUsage.thoughtsTokenCount, 80);
      const entries = JSON.parse(readFileSync(path.join(root, "state/reviewer-accounting.json"))).entries;
      assert.equal(entries.length, 1);
      assert.equal(entries[0].costUsd, 0.00105);
      assert.equal(result.recordedCostUsd, 0.00105);
    });
  });
  test(`${smoke ? "smoke" : "integrated"} accounts unknown usage and blocks on malformed ledger`, async () => {
    await isolated(async (root) => {
      const result = await execute(smoke, config(root), { env, fetchImpl: async () => response(smoke, { usageMetadata: null }) });
      assert.equal(result.status, "pass");
      assert.ok(result.recordedCostUsd >= result.estimated.costUsd);
      writeFileSync(path.join(root, "state/reviewer-accounting.json"), "{bad-json");
      const blocked = await execute(smoke, config(root), { env, fetchImpl: async () => { throw Error("must not call"); } });
      assert.equal(blocked.liveCallAttempted, false);
      assert.match(blocked.reason, /^blocked_reviewer_accounting_parse_error:/);
    });
  });
}

test("all physical retry attempts are charged and the next review sees thinking cost", async () => isolated(async (root) => {
  let calls = 0;
  const cfg = config(root);
  const result = await execute(false, cfg, { env, fetchImpl: async () => { calls++; return response(false, { status: calls === 1 ? 503 : 200, ...(calls === 1 ? { usageMetadata: null } : {}) }); } });
  assert.equal(result.status, "pass");
  assert.equal(calls, 2);
  assert.ok(result.providerAttempts[0].charge.costUsd >= result.estimated.costUsd);
  assert.equal(result.providerAttempts[1].charge.costUsd, 0.00105);
  assert.equal(result.recordedCostUsd, Number((result.providerAttempts[0].charge.costUsd + 0.00105).toFixed(6)));
  const blocked = await execute(false, { ...cfg, reviewerBudget: { monthlyReviewerHardStopUsd: result.recordedCostUsd } }, { env, fetchImpl: async () => { calls++; throw Error("must not call"); } });
  assert.equal(blocked.reason, "blocked_reviewer_budget_hard_stop");
  assert.equal(calls, 2);
}));

test("retry cannot spend past the unchanged monthly hard stop", async () => isolated(async (root) => {
  const offline = await execute(false, config(root), { env: {} });
  let calls = 0;
  const result = await execute(false, config(root, "gemini-3.5-flash", { reviewerBudget: { monthlyReviewerHardStopUsd: offline.estimated.costUsd * 1.5 } }),
    { env, fetchImpl: async () => { calls++; return response(false, { status: 503, usageMetadata: null }); } });
  assert.equal(calls, 1);
  assert.equal(result.reason, "blocked_reviewer_budget_hard_stop");
  assert.ok(result.recordedCostUsd >= offline.estimated.costUsd);
}));

for (const smoke of [true, false]) {
  test(`${smoke ? "smoke" : "integrated"} records usage on HTTP errors without accepting a verdict`, async () => isolated(async (root) => {
    let calls = 0;
    const result = await execute(smoke, config(root), { env, fetchImpl: async () => { calls++; return response(smoke, { status: 400 }); } });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_provider_http_error");
    assert.equal(result.recordedCostUsd, 0.00105);
    assert.equal(calls, 1);
  }));
}
test("smoke accounting write failure blocks instead of reporting a pass", async () => isolated(async (root) => {
  writeFileSync(path.join(root, "state"), "offline fixture blocks directory creation");
  let calls = 0;
  const result = await execute(true, config(root), { env, fetchImpl: async () => { calls++; return response(true); } });
  assert.equal(calls, 1);
  assert.equal(result.status, "blocked");
  assert.match(result.reason, /^blocked_reviewer_accounting_write_error:/);
  assert.equal(JSON.parse(readFileSync(result.reportPath)).status, "blocked");
}));
