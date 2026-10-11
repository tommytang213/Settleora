import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { invokeGrok, parseGrokVerdict, runGrokIntegratedReview } from "../lib/grok-reviewer.mjs";
import { runCodexReviewInWorker } from "../lib/parallel-local-review.mjs";
import { resolveRecoveredReviewerProviderPin } from "../lib/reviewer-provider-pin.mjs";
import { reviewerReadinessSummary } from "../lib/reviewer-policy.mjs";
import { independentReviewerProvider, runIndependentIntegratedReview, runIndependentReviewerSmokeTest } from "../lib/independent-reviewer.mjs";

function fakeSpawn(events, inspect = () => {}) {
  return (binary, args, options) => {
    inspect(binary, args, options);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let killed = false;
    child.kill = () => { killed = true; queueMicrotask(() => child.emit("close", 1)); };
    queueMicrotask(() => {
      for (const event of events) { if (!killed) child.stdout.write(`${JSON.stringify(event)}\n`); }
      child.stdout.end(); child.stderr.end();
      if (!killed) child.emit("close", 0);
    });
    return child;
  };
}

const file = { fullPath: "/tmp/settleora-review-fixture/snapshot.diff", lines: ["first", "second"] };
const read = (target = file.fullPath, body = "1→first\n2→second") => [
  { type: "tool_call", toolCallId: "read-1", toolName: "read_file", rawInput: { target_file: target, offset: 1, limit: 2 } },
  { type: "tool_call_update", toolCallId: "read-1", status: "completed", content: [{ content: { text: body } }] },
];
const end = { type: "end", stopReason: "end_turn", usage: { input_tokens: 100, output_tokens: 20 } };

test("recovery keeps its recorded independent reviewer across configuration changes", () => {
  const grokConfig = { reviewerProviderPin: "grok", reviewerTiers: { strong_independent: { provider: "grok" } } };
  const geminiConfig = { reviewerProviderPin: "gemini", reviewerTiers: { strong_independent: { provider: "gemini" } } };
  assert.deepEqual(resolveRecoveredReviewerProviderPin(grokConfig, { reviewerProviderPin: "grok" }), { ok: true, provider: "grok" });
  assert.equal(resolveRecoveredReviewerProviderPin(grokConfig, { reviewerProviderPin: "gemini" }).reason, "recovery_reviewer_provider_pin_mismatch");
  assert.equal(resolveRecoveredReviewerProviderPin(grokConfig, {}).reason, "recovery_reviewer_provider_pin_missing");
  assert.deepEqual(resolveRecoveredReviewerProviderPin(geminiConfig, {}), { ok: true, provider: "gemini" });
  assert.equal(resolveRecoveredReviewerProviderPin(geminiConfig, { reviewerProviderPin: "grok" }).reason, "recovery_reviewer_provider_pin_mismatch");
  const mixedTiers = { reviewerProviderPin: "grok", reviewerTiers: { strong_independent: { provider: "gemini", enabled: false }, cheap_independent: { provider: "grok", enabled: true } } };
  assert.deepEqual(resolveRecoveredReviewerProviderPin(mixedTiers, { reviewerProviderPin: "grok" }), { ok: true, provider: "grok" });
});

test("Grok verdict parser accepts one bounded JSON object after CLI preface", () => {
  const verdict = JSON.stringify({ verdict: "fail", confidence: "high", summary: "A concrete defect", findings: ["A changed function fails for input x."] });
  assert.equal(parseGrokVerdict(`I'll review the package.\n${verdict}`).verdict.verdict, "fail");
  assert.equal(parseGrokVerdict(`${verdict}\n${verdict}`).ok, false);
  assert.equal(parseGrokVerdict("No JSON response").ok, false);
});

test("Grok CLI invocation binds subscriber auth and verifies complete file coverage", async () => {
  process.env.XAI_API_KEY = "test";
  process.env.GH_TOKEN = "test";
  try {
    const result = await invokeGrok({ files: [file], prompt: "synthetic", staged: "/tmp/settleora-review-fixture",
      model: "grok-4.7", binary: "/home/tommytang213/.local/bin/grok",
      spawnImpl: fakeSpawn([...read(), { type: "text", data: "PASS" }, end], (_binary, args, options) => {
        assert.equal(options.env.XAI_API_KEY, undefined);
        assert.equal(options.env.GH_TOKEN, undefined);
        assert.ok(args.includes("strict"));
        assert.ok(args.includes("read_file"));
        assert.ok(args.includes("--no-subagents"));
        assert.ok(args.includes("--disable-web-search"));
      }), timeoutMs: 1000 });
    assert.equal(result.reason, null);
    assert.equal(result.coveredLines, 2);
    assert.equal(result.answer, "PASS");
  } finally { delete process.env.XAI_API_KEY; delete process.env.GH_TOKEN; }
});

test("Grok accepts a staged relative read path with complete coverage", async () => {
  const result = await invokeGrok({ files: [file], prompt: "synthetic", staged: "/tmp/settleora-review-fixture",
    model: "grok-4.7", binary: "grok", spawnImpl: fakeSpawn([
      ...read("snapshot.diff"), { type: "text", data: "PASS" }, end,
    ]), timeoutMs: 1000 });
  assert.equal(result.reason, null);
  assert.equal(result.coveredLines, 2);
});

test("subscription Grok does not bypass the reviewer hard stop", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-grok-budget-test-"));
  try {
    mkdirSync(path.join(root, "state"));
    writeFileSync(path.join(root, "state", "reviewer-accounting.json"), JSON.stringify({ entries: [
      { monthKey: new Date().toISOString().slice(0, 7), costUsd: 100 },
    ] }));
    const result = reviewerReadinessSummary({ logsRoot: root, reviewerTiers: {
      cheap_independent: { enabled: true, provider: "grok", providerProfile: "grok", model: "grok-4.7" },
    }, reviewerProviderProfiles: { grok: { provider: "grok", command: "grok" } } },
    { changedFiles: ["docs/workflow/example.md"] });
    assert.equal(result.budget.block, true);
    assert.equal(result.budget.subscriptionFunded, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a pinned Gemini package cannot be sent through a later Grok config", async () => {
  const config = { reviewerProviderPin: "grok", reviewerTiers: {
    strong_independent: { enabled: true, provider: "grok", providerProfile: "grok", model: "grok-4.7" },
  } };
  const packageInfo = { summary: { reviewerProviderPin: "gemini", changedFiles: ["tools/auto-runner/lib/example.mjs"],
    laneDecision: { lane: "workflow-docs-tooling", reviewerTier: "strong_independent" },
    currentHead: "b".repeat(40) },
  diff: "diff --git a/tools/auto-runner/lib/example.mjs b/tools/auto-runner/lib/example.mjs\n--- a/tools/auto-runner/lib/example.mjs\n+++ b/tools/auto-runner/lib/example.mjs\n@@ -1 +1 @@\n-old\n+new\n" };
  assert.equal(independentReviewerProvider(config, packageInfo), null);
  const result = await runIndependentIntegratedReview(config, packageInfo);
  assert.equal(result.reason, "blocked_reviewer_provider_pin_mismatch");
  assert.equal(result.liveCallAttempted, false);
  const legacy = { ...packageInfo, summary: { ...packageInfo.summary, reviewerProviderPin: undefined,
    reviewerPolicy: { tiers: { strong_independent: { provider: "gemini" } } } } };
  assert.equal(independentReviewerProvider(config, legacy), null);
  assert.equal(independentReviewerProvider(config, { ...legacy, summary: { ...legacy.summary, reviewerPolicy: undefined } }), null);
  assert.equal(independentReviewerProvider({ ...config, reviewerProviderPin: null },
    { ...legacy, summary: { ...legacy.summary, reviewerPolicy: undefined } }), null);
  const split = { ...packageInfo, summary: { ...packageInfo.summary,
    laneDecision: { lane: "workflow-docs-tooling", splitRequired: true },
    diffStats: { additions: 1000, deletions: 0 } } };
  assert.equal(independentReviewerProvider(config, split), "split_or_escalate");
  const splitResult = await runIndependentIntegratedReview(config, split);
  assert.equal(splitResult.reason, "blocked_external_reviewer_split_required");
  assert.equal(splitResult.route.largeCandidateRouting.route, "split_or_block");
});

test("Grok invocation stops at the reviewer hard budget before spawn", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-grok-hard-stop-test-"));
  try {
    mkdirSync(path.join(root, "state"));
    writeFileSync(path.join(root, "state", "reviewer-accounting.json"), JSON.stringify({ entries: [
      { monthKey: new Date().toISOString().slice(0, 7), costUsd: 100 },
    ] }));
    const config = { logsRoot: root, reviewerTiers: { strong_independent: {
      enabled: true, provider: "grok", providerProfile: "grok", model: "grok-4.7",
    } }, reviewerProviderProfiles: { grok: { provider: "grok", command: "grok" } } };
    const diff = "diff --git a/docs/workflow/example.md b/docs/workflow/example.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/workflow/example.md\n@@ -0,0 +1 @@\n+Synthetic.\n";
    const result = await runGrokIntegratedReview(config, { summary: { baseSha: "a".repeat(40), currentHead: "b".repeat(40),
      changedFiles: ["docs/workflow/example.md"], laneDecision: { lane: "workflow-docs-tooling", reviewerTier: "strong_independent" } }, diff },
    { spawnImpl: () => { throw Error("must not spawn"); } });
    assert.equal(result.reason, "blocked_reviewer_budget_hard_stop");
    assert.equal(result.liveCallAttempted, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("live subscriber smoke assembles a complete synthetic package before CLI invocation", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-grok-smoke-test-"));
  try {
    const config = { logsRoot: root, repoRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."),
      reviewerTiers: { cheap_independent: { enabled: true, provider: "grok", providerProfile: "grok", model: "grok-4.7" } },
      reviewerProviderProfiles: { grok: { provider: "grok", command: "grok" } } };
    const result = await runIndependentReviewerSmokeTest(config, { liveExternalReviewerCalls: true,
      spawnImpl: () => { throw Error("synthetic_smoke_reached_cli"); } });
    assert.equal(result.reason, "blocked_grok_invocation:Error");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("three fixed feature-bundle gate files clear package preflight", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-grok-bundle-shape-test-"));
  try {
    const paths = ["tools/auto-runner/settleora-auto-runner.mjs",
      "tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"];
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const material = paths.map((sourcePath) => { const content = readFileSync(path.join(repoRoot, sourcePath), "utf8");
      return { path: sourcePath, content, sha256: createHash("sha256").update(content).digest("hex") }; });
    const config = { logsRoot: root, reviewerTiers: { strong_independent: {
      enabled: true, provider: "grok", providerProfile: "grok", model: "grok-4.7",
    } }, reviewerProviderProfiles: { grok: { provider: "grok", command: "grok" } } };
    const diff = "diff --git a/docs/workflow/example.md b/docs/workflow/example.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/workflow/example.md\n@@ -0,0 +1 @@\n+Synthetic.\n";
    const result = await runGrokIntegratedReview(config, { summary: { baseSha: "a".repeat(40), currentHead: "b".repeat(40),
      changedFiles: ["docs/workflow/example.md"], taskContract: { objective: "Review synthetic docs" },
      laneDecision: { lane: "workflow-docs-tooling", reviewerTier: "strong_independent" },
      integrationBoundaries: paths, integrationBoundaryMaterial: material }, diff },
    { spawnImpl: () => { throw Error("preflight completed"); } });
    assert.equal(result.reason, "blocked_grok_invocation:Error");
    const omitted = await runGrokIntegratedReview(config, { summary: { baseSha: "a".repeat(40), currentHead: "b".repeat(40),
      changedFiles: ["docs/workflow/example.md"], taskContract: { objective: "Review synthetic docs" },
      laneDecision: { lane: "workflow-docs-tooling", reviewerTier: "strong_independent" } }, diff },
    { spawnImpl: () => { throw Error("must not spawn"); } });
    assert.equal(omitted.reason, "blocked_grok_boundary_material_invalid_or_sensitive");
    const unsafeContent = ["token=", "not-a-real-value-12345"].join("");
    const unsafe = { ...material[0], content: unsafeContent,
      sha256: createHash("sha256").update(unsafeContent).digest("hex") };
    const blocked = await runGrokIntegratedReview(config, { summary: { baseSha: "a".repeat(40), currentHead: "b".repeat(40),
      changedFiles: ["docs/workflow/example.md"], taskContract: { objective: "Review synthetic docs" },
      laneDecision: { lane: "workflow-docs-tooling", reviewerTier: "strong_independent" },
      integrationBoundaries: paths, integrationBoundaryMaterial: [unsafe, ...material.slice(1)] }, diff },
    { spawnImpl: () => { throw Error("must not spawn"); } });
    assert.equal(blocked.reason, "blocked_grok_boundary_material_invalid_or_sensitive");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Grok review cannot pass with a missed line or outside-file read", async () => {
  const missing = await invokeGrok({ files: [file], prompt: "synthetic", staged: "/tmp/settleora-review-fixture",
    model: "grok-4.7", binary: "grok", spawnImpl: fakeSpawn([
      ...read(file.fullPath, "1→first"), { type: "text", data: "PASS" }, end,
    ]), timeoutMs: 1000 });
  assert.notEqual(missing.reason, null);
  const outside = await invokeGrok({ files: [file], prompt: "synthetic", staged: "/tmp/settleora-review-fixture",
    model: "grok-4.7", binary: "grok", spawnImpl: fakeSpawn([...read("/tmp/outside/snapshot.diff"), end]), timeoutMs: 1000 });
  assert.equal(outside.reason, "blocked_grok_unapproved_tool_or_path");
});

test("Grok coverage survives a multibyte read marker split between stdout chunks", async () => {
  const events = [...read(), { type: "text", data: "done" }, end];
  const output = Buffer.from(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  const marker = output.indexOf(Buffer.from("→"));
  assert.ok(marker > 0);
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => {};
    queueMicrotask(() => {
      child.stdout.write(output.subarray(0, marker + 1));
      child.stdout.end(output.subarray(marker + 1));
      child.stderr.end();
      child.emit("close", 0);
    });
    return child;
  };
  const result = await invokeGrok({ files: [file], prompt: "synthetic", staged: "/tmp/settleora-review-fixture",
    model: "grok-4.7", binary: "grok", spawnImpl, timeoutMs: 1000 });
  assert.equal(result.reason, null);
  assert.equal(result.coveredLines, 2);
});

test("local Codex process runs off the main event loop alongside an external review", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-parallel-review-test-"));
  try {
    mkdirSync(path.join(root, "reviews"));
    const command = path.join(root, "slow-review");
    writeFileSync(command, "#!/bin/sh\nsleep 0.2\n"); chmodSync(command, 0o700);
    let codexDone = false;
    const codex = runCodexReviewInWorker({ dryRun: false, logsRoot: root, repoRoot: root,
      reviewerCommand: command, codexMechanicsReviewRetry: { maxAttempts: 1 },
      operationalIterationCheckpoint: () => { throw Error("controller only"); } },
    { summary: { changedFiles: ["example.txt"], baseSha: "a".repeat(40), currentHead: "b".repeat(40) }, diff: "synthetic" });
    codex.then(() => { codexDone = true; });
    const external = new Promise((resolve) => setTimeout(() => resolve({ codexDoneAtExternalCompletion: codexDone }), 20));
    const [codexResult, externalResult] = await Promise.all([codex, external]);
    assert.equal(externalResult.codexDoneAtExternalCompletion, false);
    assert.equal(codexResult.reviewedHead, "b".repeat(40));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("integrated Grok adapter accepts only a complete screened and head-bound response", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-grok-integrated-test-"));
  try {
    const config = { logsRoot: root, dryRun: false, reviewerTiers: {
      cheap_independent: { enabled: true, provider: "grok", providerProfile: "grok", model: "grok-4.7", inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 },
      strong_independent: { enabled: true, provider: "grok", providerProfile: "grok", model: "grok-4.7", inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 },
    }, reviewerProviderProfiles: { grok: { provider: "grok", command: "/home/tommytang213/.local/bin/grok", defaultModel: "grok-4.7" } } };
    const boundaryPaths = ["tools/auto-runner/settleora-auto-runner.mjs", "tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"];
    const summary = { repository: "tommytang213/Settleora", baseSha: "a".repeat(40), currentHead: "b".repeat(40),
      changedFiles: ["src/example.js"], laneDecision: { lane: "workflow-docs-tooling", reviewerTier: "cheap_independent" },
      validation: { passed: true }, taskContract: { objective: "Review synthetic change" }, integrationBoundaries: boundaryPaths,
      integrationBoundaryMaterial: boundaryPaths.map((sourcePath) => ({ path: sourcePath, content: "// Read-only gate fixture\n",
        sha256: createHash("sha256").update("// Read-only gate fixture\n").digest("hex") })) };
    const diff = "diff --git a/src/example.js b/src/example.js\n--- a/src/example.js\n+++ b/src/example.js\n@@ -1 +1 @@\n-old\n+new\n";
    const spawnImpl = (_binary, args) => {
      const staged = args[args.indexOf("--cwd") + 1];
      assert.doesNotMatch(readFileSync(path.join(staged, "context.json"), "utf8"), /Read-only gate fixture/);
      const events = [];
      for (const [index, name] of ["context.json", "snapshot.diff", "boundary-0.txt", "boundary-1.txt", "boundary-2.txt"].entries()) {
        const fullPath = path.join(staged, name);
        const lines = readFileSync(fullPath, "utf8").trimEnd().split("\n");
        const id = `read-${index}`;
        events.push({ type: "tool_call", toolCallId: id, toolName: "read_file",
          rawInput: { target_file: fullPath, offset: 1, limit: lines.length } });
        events.push({ type: "tool_call_update", toolCallId: id, status: "completed",
          content: [{ content: { text: lines.map((line, i) => `${i + 1}→${line}`).join("\n") } }] });
      }
      events.push({ type: "text", data: JSON.stringify({ verdict: "pass", confidence: "medium", summary: "No introduced defect", findings: [] }) }, end);
      return fakeSpawn(events)();
    };
    const result = await runGrokIntegratedReview(config, { summary, diff }, { spawnImpl, timeoutMs: 1000 });
    assert.equal(result.status, "pass");
    assert.equal(result.provider, "grok");
    assert.equal(result.reviewedHead, summary.currentHead);
    assert.equal(result.attestedCandidateIdentity.headSha, summary.currentHead);
    assert.equal(result.providerMetadata.coveredLines, result.providerMetadata.totalLines);
    const secret = await runGrokIntegratedReview(config, { summary: {
      ...summary, issue: { title: "Synthetic", body: ["api_key=", "sk-", "abcdefghijklmnopqrstuvwxyz123456"].join("") },
    }, diff }, { spawnImpl: () => { throw new Error("must not call vendor"); } });
    assert.equal(secret.status, "blocked");
    assert.equal(secret.reason, "blocked_grok_context_secret_boundary");
    assert.equal(secret.liveCallAttempted, false);
    assert.notEqual(secret.reportPath, result.reportPath);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
