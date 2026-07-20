import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bridgeLegacyEffectState, executeCanonicalEffect, executeCanonicalEffectSync } from "../lib/canonical-effect-executor.mjs";

const sha = (c) => c.repeat(40);
function fixture() {
  const logsRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-canonical-effect-"));
  const currentAuthority = { runId: "run-1", sessionId: "session-1", authorityGeneration: 2, status: "active" };
  const intent = { repository: "owner/repo", sourceTaskKey: "task-1", runId: "run-1", logicalTaskIdentity: "logical-1", claimIdentity: "claim-1", chargeIdentity: "charge-1", sessionId: "session-1", authorityGeneration: 2, effectType: "push", branchName: "feature/a", baseSha: sha("a"), headSha: sha("b"), effect: { localCommitSha: sha("b"), remoteBeforeSha: sha("a"), remoteBranch: "feature/a" } };
  return { config: { logsRoot, currentAuthority }, intent };
}
function liveIdentity(intent) { return { repository: intent.repository, sourceTaskKey: intent.sourceTaskKey, runId: intent.runId, logicalTaskIdentity: intent.logicalTaskIdentity, claimIdentity: intent.claimIdentity, chargeIdentity: intent.chargeIdentity, sessionId: intent.sessionId, authorityGeneration: intent.authorityGeneration, branchName: intent.branchName, baseSha: intent.baseSha, headSha: intent.headSha }; }

test("executes only an absent effect and confirms exact readback", async () => {
  const { config, intent } = fixture(); let reads = 0; let executions = 0;
  const result = await executeCanonicalEffect(config, { intent, intentOptions: { intentId: "push-1" } }, { readLive: () => (++reads === 1 ? { complete: true, present: false } : { complete: true, present: true, identity: liveIdentity(intent), effect: intent.effect }), execute: () => { executions += 1; return { ok: true, status: 0 }; } });
  assert.equal(result.ok, true); assert.equal(result.action, "executed"); assert.equal(executions, 1); assert.equal(result.status, "finalized");
});

test("adopts an exact live effect without executing", async () => {
  const { config, intent } = fixture(); let executions = 0;
  const result = await executeCanonicalEffect(config, { intent, intentOptions: { intentId: "push-2" } }, { readLive: () => ({ complete: true, present: true, identity: liveIdentity(intent), effect: intent.effect }), execute: () => { executions += 1; } });
  assert.equal(result.action, "adopted"); assert.equal(executions, 0);
});

for (const [name, live] of [["ambiguous", { complete: true, ambiguous: true }], ["contradictory", { complete: true, present: true, identity: {}, effect: {} }]]) test(`fails closed for ${name} live state`, async () => {
  const { config, intent } = fixture(); let executions = 0;
  const result = await executeCanonicalEffect(config, { intent, intentOptions: { intentId: `push-${name}` } }, { readLive: () => live, execute: () => { executions += 1; } });
  assert.equal(result.ok, false); assert.equal(executions, 0); assert.equal(result.status, "failed_closed");
});

test("keeps an unavailable initial live read pending for later reconciliation", async () => {
  const { config, intent } = fixture(); let executions = 0;
  const result = await executeCanonicalEffect(config, { intent, intentOptions: { intentId: "push-unavailable" } }, { readLive: () => ({ complete: false }), execute: () => { executions += 1; } });
  assert.equal(result.ok, false); assert.equal(result.action, "pending_reconciliation"); assert.equal(result.status, "prepared"); assert.equal(executions, 0);
});

for (const sync of [false, true]) test(`adopts an exact effect after an uncertain ${sync ? "sync" : "async"} execution error`, async () => {
  const { config, intent } = fixture(); let reads = 0;
  const adapters = { readLive: () => (++reads === 1 ? { complete: true, present: false } : { complete: true, present: true, identity: liveIdentity(intent), effect: intent.effect }), execute: () => { throw new Error("transport lost after effect"); } };
  const input = { intent: { ...intent, effect: { ...intent.effect, sync } }, intentOptions: { intentId: `push-uncertain-${sync}` } };
  const live = (stored) => ({ ...liveIdentity(intent), ...stored.identity });
  adapters.readLive = (stored) => (++reads === 1 ? { complete: true, present: false } : { complete: true, present: true, identity: live(stored), effect: stored.effect });
  const result = sync ? executeCanonicalEffectSync(config, input, adapters) : await executeCanonicalEffect(config, input, adapters);
  assert.equal(result.ok, true); assert.equal(result.action, "adopted"); assert.equal(result.status, "finalized");
});

test("legacy bridge is explicitly non-authoritative and cannot adopt a crash window", () => {
  assert.deepEqual(bridgeLegacyEffectState({ legacy: { fingerprint: "x" }, crashWindow: true }), { ok: false, authoritative: null, projection: "legacy_non_authoritative", reasonCode: "canonical_pre_effect_intent_required_for_adoption" });
  assert.equal(bridgeLegacyEffectState({ canonicalIntent: { fingerprint: "a" }, legacy: { fingerprint: "b" } }).reasonCode, "legacy_canonical_conflict");
});
