import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { invokeGrok, runGrokIntegratedReview } from "../lib/grok-reviewer.mjs";
import { runCodexReviewInWorker } from "../lib/parallel-local-review.mjs";

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

test("Grok CLI invocation binds subscriber auth and verifies complete file coverage", async () => {
  process.env.XAI_API_KEY = "synthetic-api-key-do-not-use";
  try {
    const result = await invokeGrok({ files: [file], prompt: "synthetic", staged: "/tmp/settleora-review-fixture",
      model: "grok-4.7", binary: "/home/tommytang213/.local/bin/grok",
      spawnImpl: fakeSpawn([...read(), { type: "text", data: "PASS" }, end], (_binary, args, options) => {
        assert.equal(options.env.XAI_API_KEY, undefined);
        assert.ok(args.includes("strict"));
        assert.ok(args.includes("read_file"));
        assert.ok(args.includes("--no-subagents"));
        assert.ok(args.includes("--disable-web-search"));
      }), timeoutMs: 1000 });
    assert.equal(result.reason, null);
    assert.equal(result.coveredLines, 2);
    assert.equal(result.answer, "PASS");
  } finally { delete process.env.XAI_API_KEY; }
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

test("local Codex process runs off the main event loop alongside an external review", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-parallel-review-test-"));
  try {
    mkdirSync(path.join(root, "reviews"));
    const command = path.join(root, "slow-review");
    writeFileSync(command, "#!/bin/sh\nsleep 0.2\n"); chmodSync(command, 0o700);
    let codexDone = false;
    const codex = runCodexReviewInWorker({ dryRun: false, logsRoot: root, repoRoot: root,
      reviewerCommand: command, codexMechanicsReviewRetry: { maxAttempts: 1 } },
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
    const summary = { repository: "tommytang213/Settleora", baseSha: "a".repeat(40), currentHead: "b".repeat(40),
      changedFiles: ["src/example.js"], laneDecision: { lane: "workflow-docs-tooling", reviewerTier: "cheap_independent" },
      validation: { passed: true } };
    const diff = "diff --git a/src/example.js b/src/example.js\n--- a/src/example.js\n+++ b/src/example.js\n@@ -1 +1 @@\n-old\n+new\n";
    const spawnImpl = (_binary, args) => {
      const staged = args[args.indexOf("--cwd") + 1];
      const events = [];
      for (const [index, name] of ["context.json", "snapshot.diff"].entries()) {
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
      ...summary, issue: { title: "Synthetic", body: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456" },
    }, diff }, { spawnImpl: () => { throw new Error("must not call vendor"); } });
    assert.equal(secret.status, "blocked");
    assert.equal(secret.reason, "blocked_grok_context_secret_boundary");
    assert.equal(secret.liveCallAttempted, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
