import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertPreEffectIntentAuthority, loadPreEffectIntent, preparePreEffectIntent, reconcilePreEffectIntent, transitionPreEffectIntent } from "../lib/pre-effect-intent.mjs";

const base = { repository: "owner/repo", sourceTaskKey: "20260720-2239", runId: "run-1", logicalTaskIdentity: "claim-1", sessionId: "session-1", authorityGeneration: 2, effectType: "push", branchName: "feature/a", baseSha: "a".repeat(40), headSha: "b".repeat(40), effect: { localCommitSha: "b".repeat(40), remoteBeforeSha: "a".repeat(40), remoteBranch: "feature/a" } };

test("pre-effect intent persists before execution and adopts exact live effect atomically", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "intent-"));
  try {
    const intent = preparePreEffectIntent({ logsRoot }, base, { intentId: "intent-1", now: new Date("2026-07-20T14:50:00Z") });
    assert.equal(loadPreEffectIntent({ logsRoot }, "intent-1").status, "prepared");
    const executing = transitionPreEffectIntent({ logsRoot }, intent, "executing");
    const result = reconcilePreEffectIntent(executing, { complete: true, present: true, identity: executing.identity, effect: executing.effect });
    assert.equal(result.classification, "effect_present_exact_adoptable");
    const adopted = transitionPreEffectIntent({ logsRoot }, executing, "adopted_after_recovery");
    assert.equal(transitionPreEffectIntent({ logsRoot }, adopted, "finalized").status, "finalized");
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("pre-effect intent fails closed on missing, ambiguous, or contradictory live evidence", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "intent-"));
  try {
    const intent = preparePreEffectIntent({ logsRoot }, base, { intentId: "intent-2" });
    assert.equal(reconcilePreEffectIntent(intent, { complete: true, present: false }).classification, "effect_absent_safe_to_execute");
    const executing = transitionPreEffectIntent({ logsRoot }, intent, "executing");
    assert.equal(reconcilePreEffectIntent(executing, { complete: true, present: false }).classification, "effect_absent_execution_uncertain");
    assert.equal(reconcilePreEffectIntent(intent, { complete: false }).classification, "live_read_unavailable");
    assert.equal(reconcilePreEffectIntent(intent, { complete: true, present: true, ambiguous: true }).classification, "effect_ambiguous");
    assert.equal(reconcilePreEffectIntent(intent, { complete: true, present: true, identity: intent.identity, effect: { remoteBranch: "wrong" } }).classification, "effect_contradictory");
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("pre-effect intent reader rejects symlinks, unsafe modes, malformed and oversized artifacts", () => {
  for (const kind of ["symlink", "mode", "malformed", "oversized"]) {
    const logsRoot = mkdtempSync(path.join(tmpdir(), "intent-trust-"));
    try {
      const intent = preparePreEffectIntent({ logsRoot }, base, { intentId: `trust-${kind}` });
      const root = path.join(logsRoot, "recovery", "pre-effect-intents");
      const actual = path.join(root, createHash("sha256").update(`trust-${kind}`).digest("hex") + ".json");
      if (kind === "symlink") { const target = `${actual}.target`; writeFileSync(target, readFileSync(actual)); rmSync(actual); symlinkSync(target, actual); }
      if (kind === "mode") chmodSync(actual, 0o644);
      if (kind === "malformed") writeFileSync(actual, "{bad", { mode: 0o600 });
      if (kind === "oversized") writeFileSync(actual, "x".repeat(256 * 1024 + 1), { mode: 0o600 });
      assert.throws(() => loadPreEffectIntent({ logsRoot }, `trust-${kind}`));
    } finally { rmSync(logsRoot, { recursive: true, force: true }); }
  }
});

test("pre-effect intent binds task charge session generation and rejects retired or wrong authority", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "intent-authority-"));
  try {
    const intent = preparePreEffectIntent({ logsRoot }, { ...base, claimIdentity: "claim-1", chargeIdentity: "charge-1" }, { intentId: "authority" });
    assert.equal(intent.identity.sessionId, "session-1");
    assert.throws(() => transitionPreEffectIntent({ logsRoot, currentAuthority: { runId: "run-1", sessionId: "session-1", authorityGeneration: 2, retired: true } }, intent, "executing"), /active session/);
    assert.throws(() => transitionPreEffectIntent({ logsRoot, currentAuthority: { runId: "run-1", sessionId: "wrong", authorityGeneration: 2, status: "active" } }, intent, "executing"), /authority mismatch/);
    assert.equal(transitionPreEffectIntent({ logsRoot, currentAuthority: { runId: "run-1", sessionId: "session-1", authorityGeneration: 2, status: "active" } }, intent, "executing").status, "executing");
    for (const status of ["retired", "retired_pending_successor", "recovery_pending"]) {
      assert.throws(() => assertPreEffectIntentAuthority(intent, { runId: "run-1", sessionId: "session-1", authorityGeneration: 2, status }), /active session/);
    }
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("pre-effect intent inventory rejects duplicate fingerprints and lifecycle stays monotonic", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "intent-duplicate-"));
  try {
    const intent = preparePreEffectIntent({ logsRoot }, base, { intentId: "duplicate" });
    const root = path.join(logsRoot, "recovery", "pre-effect-intents");
    writeFileSync(path.join(root, `${"f".repeat(64)}.json`), readFileSync(path.join(root, `${createHash("sha256").update("duplicate").digest("hex")}.json`)), { mode: 0o600 });
    assert.throws(() => loadPreEffectIntent({ logsRoot }, "duplicate"), /Duplicate/);
    rmSync(path.join(root, `${"f".repeat(64)}.json`));
    const executing = transitionPreEffectIntent({ logsRoot }, intent, "executing");
    assert.throws(() => transitionPreEffectIntent({ logsRoot }, executing, "prepared"), /Invalid/);
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});
