import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadPreEffectIntent, preparePreEffectIntent, reconcilePreEffectIntent, transitionPreEffectIntent } from "../lib/pre-effect-intent.mjs";

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
    assert.equal(reconcilePreEffectIntent(intent, { complete: false }).classification, "live_read_unavailable");
    assert.equal(reconcilePreEffectIntent(intent, { complete: true, present: true, ambiguous: true }).classification, "effect_ambiguous");
    assert.equal(reconcilePreEffectIntent(intent, { complete: true, present: true, identity: intent.identity, effect: { remoteBranch: "wrong" } }).classification, "effect_contradictory");
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});
