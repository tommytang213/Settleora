import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertMutationAuthority,
  beginSessionRotation,
  boundedContextSnapshot,
  classifyReportlessInterruption,
  completeSessionRotation,
  createSessionLifecycleState,
  evaluateContextBudget,
  interruptionClasses,
  loadSessionLifecycleState,
  migrateRecoveryStateToSessionLifecycle,
  normalizeContextBudgetPolicy,
  persistSessionLifecycleState,
  planInterruptionRecovery,
  prepareFreshSessionInvocation,
  validateSessionLifecycleState,
} from "../lib/session-lifecycle.mjs";

const sha = "a".repeat(40);
const digest = "b".repeat(64);
function fixture(extra = {}) {
  return createSessionLifecycleState({
    repository: "owner/repo", issueNumber: 929, taskKey: "20260720-2110", runId: "run-1",
    claimIdentity: "claim-1", chargeMarkerRef: "logical-task-budget/charge-1", sessionId: "session-1",
    branchName: "feature/session", baseSha: sha, headSha: sha, candidateDigest: digest,
    phase: "implementation_or_bundle_slice", nextExactAction: "continue_slice_a", reportPath: "/logs/report.md",
    ...extra,
  });
}

test("warning schedules checkpoint without changing counters or authority", () => {
  const state = fixture({ localSourceChangingRoundsPerEpoch: 3 });
  const result = evaluateContextBudget({ telemetry: { totalTokens: 80000, contextWindowTokens: 128000 }, checkpointComplete: false });
  assert.equal(result.action, "persist_checkpoint");
  assert.equal(state.controller.localSourceChangingRoundsPerEpoch, 3);
  assert.equal(assertMutationAuthority(state, "session-1").ok, true);
});

test("mandatory pressure rotates before a long operation", () => {
  const result = evaluateContextBudget({ telemetry: { totalTokens: 100000, contextWindowTokens: 128000 }, phase: "external_review", checkpointComplete: true });
  assert.equal(result.action, "rotate_before_next_operation");
});

test("missing telemetry uses conservative fallback at a long phase", () => {
  const result = evaluateContextBudget({ telemetry: {}, phase: "aggregate_validation", checkpointComplete: false });
  assert.equal(result.snapshot.fallbackUsed, true);
  assert.equal(result.action, "persist_checkpoint");
});

test("invalid threshold order and ranges fail closed", () => {
  assert.throws(() => normalizeContextBudgetPolicy({ warningPercent: 80, mandatoryPercent: 70 }));
  assert.equal(evaluateContextBudget({ policy: { warningPercent: 0 } }).ok, false);
});

test("unjournaled mutation prevents rotation", () => {
  const result = evaluateContextBudget({ telemetry: { totalTokens: 120000 }, mutationJournaled: false });
  assert.equal(result.reasonCode, "session_lifecycle_unjournaled_mutation");
});

test("hysteresis prevents a non-emergency rotation loop", () => {
  const result = evaluateContextBudget({ telemetry: { totalTokens: 100000 }, checkpointComplete: true, turnsSinceRotation: 1 });
  assert.equal(result.reasonCode, "rotation_cooldown_active");
});

test("emergency compaction bypasses cooldown after checkpoint", () => {
  const result = evaluateContextBudget({ telemetry: { compactionStatus: "failed" }, checkpointComplete: true, turnsSinceRotation: 0 });
  assert.equal(result.action, "rotate_before_next_operation");
});

test("telemetry is bounded and excludes unknown provider fields", () => {
  const snapshot = boundedContextSnapshot({ model: "m", modelVisibleBytes: 99999999, prompt: "secret", rawPayload: "secret" });
  assert.equal(snapshot.modelVisibleBytes, 12 * 1024 * 1024);
  assert.equal(Object.hasOwn(snapshot, "prompt"), false);
  assert.equal(Object.hasOwn(snapshot, "rawPayload"), false);
});

test("rotation retires old authority before granting new authority", () => {
  const old = fixture();
  const begun = beginSessionRotation(old, { reason: "mandatory", requestId: "rotation-1" });
  assert.equal(assertMutationAuthority(begun.state, "session-1").ok, false);
  assert.equal(begun.state.mutationAuthority.ownerSessionId, null);
  const completed = completeSessionRotation(begun.state, { requestId: "rotation-1", newSessionId: "session-2" });
  assert.equal(assertMutationAuthority(completed.state, "session-2").ok, true);
  assert.equal(assertMutationAuthority(completed.state, "session-1").ok, false);
});

test("duplicate rotation request and completion are idempotent", () => {
  const begun = beginSessionRotation(fixture(), { reason: "mandatory", requestId: "rotation-1" });
  const duplicate = beginSessionRotation(begun.state, { reason: "mandatory", requestId: "rotation-1" });
  assert.equal(duplicate.duplicate, true);
  const completed = completeSessionRotation(begun.state, { requestId: "rotation-1", newSessionId: "session-2" });
  const repeated = completeSessionRotation(completed.state, { requestId: "rotation-1", newSessionId: "session-2" });
  assert.equal(repeated.duplicate, true);
});

test("repeated rotations preserve task, charge, counters, reservations, and evidence", () => {
  let state = fixture({ localSourceChangingRoundsPerEpoch: 4, githubTriggeredFixEpochsPerPr: 2, lifetimeLocalSourceChangingRounds: 9, reservations: { push: { key: "p" } }, evidence: { review: { digest } } });
  for (let i = 2; i <= 5; i += 1) {
    const begun = beginSessionRotation(state, { reason: "phase", requestId: `r-${i}` });
    state = completeSessionRotation(begun.state, { requestId: `r-${i}`, newSessionId: `session-${i}` }).state;
  }
  assert.equal(state.logicalTask.chargeMarkerRef, "logical-task-budget/charge-1");
  assert.deepEqual(state.controller, fixture({ localSourceChangingRoundsPerEpoch: 4, githubTriggeredFixEpochsPerPr: 2, lifetimeLocalSourceChangingRounds: 9 }).controller);
  assert.equal(state.context.rotations, 4);
  assert.equal(state.reservations.push.key, "p");
  assert.equal(state.evidence.review.digest, digest);
});

test("checkpoint persistence and identity validation are durable", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-lifecycle-"));
  const config = { logsRoot: root, repositorySlug: "owner/repo" };
  const written = persistSessionLifecycleState(config, fixture());
  assert.equal(written.ok, true);
  assert.equal(loadSessionLifecycleState(config, { repository: "owner/repo", issueNumber: 929, taskKey: "20260720-2110", runId: "run-1", claimIdentity: "claim-1" }).ok, true);
  assert.equal(loadSessionLifecycleState(config, { repository: "owner/repo", issueNumber: 929, taskKey: "wrong", runId: "run-1", claimIdentity: "claim-1" }).ok, false);
  const persisted = JSON.parse(readFileSync(written.statePath, "utf8"));
  assert.equal(Object.hasOwn(persisted, "prompt"), false);
  assert.equal(Object.hasOwn(persisted, "rawProviderPayload"), false);
  assert.equal(Object.hasOwn(persisted, "history"), false);
});

test("checkpoint tampering fails closed", () => {
  const state = fixture();
  state.controller.nextExactAction = "tampered";
  assert.equal(validateSessionLifecycleState(state).reasonCode, "session_lifecycle_checkpoint_digest_mismatch");
});

test("all seven interruption classes are explicit", () => {
  assert.deepEqual(interruptionClasses, ["remote_compaction_failure", "provider_stream_disconnect", "main_process_exit_without_terminal_report", "wrapper_supervisor_interruption", "host_restart_process_loss", "partial_report_or_checkpoint_write", "ambiguous_or_contradictory_state"]);
});

for (const [name, input, expected] of [
  ["remote compaction", { compactionFailed: true, checkpointValid: true }, "remote_compaction_failure"],
  ["stream disconnect", { providerDisconnected: true, checkpointValid: true }, "provider_stream_disconnect"],
  ["process exit", { processExited: true, terminalReportTrusted: false, checkpointValid: true }, "main_process_exit_without_terminal_report"],
  ["wrapper interruption", { wrapperInterrupted: true, checkpointValid: true }, "wrapper_supervisor_interruption"],
  ["host restart", { hostRestarted: true, checkpointValid: true }, "host_restart_process_loss"],
  ["partial report", { partialReport: true, checkpointValid: true }, "partial_report_or_checkpoint_write"],
  ["ambiguous", { contradictory: true }, "ambiguous_or_contradictory_state"],
]) test(`classifies ${name}`, () => assert.equal(classifyReportlessInterruption(input).interruptionClass, expected));

test("active owner prevents recovery takeover even with stale report", () => {
  const result = classifyReportlessInterruption({ ownerAlive: true, leaseValid: true, processExited: false, partialReport: true });
  assert.equal(result.active, true);
});

test("dead owner recovery resumes earliest safe phase without replaying effects", () => {
  const state = fixture({ localSourceChangingRoundsPerEpoch: 7, githubTriggeredFixEpochsPerPr: 3 });
  const result = planInterruptionRecovery(state, { commitPresent: true, pushPresent: true, recoveryOperationId: "recovery-1" }, { processExited: true, checkpointValid: true });
  assert.equal(result.earliestSafePhase, "ci_wait");
  assert.equal(result.effectsAlreadyPresent.commit, true);
  assert.equal(result.effectsAlreadyPresent.push, true);
  assert.equal(result.state.controller.localSourceChangingRoundsPerEpoch, 7);
  assert.equal(result.state.logicalTask.chargeMarkerRef, "logical-task-budget/charge-1");
  assert.equal(assertMutationAuthority(result.state, "session-1").ok, false);
});

test("post-merge report finalization resumes hygiene only", () => {
  const result = planInterruptionRecovery(fixture(), { mergePresent: true }, { partialReport: true, checkpointValid: true });
  assert.equal(result.earliestSafePhase, "issue_parent_ledger_hygiene");
});

test("pending checks resume polling without a source epoch", () => {
  const state = fixture({ phase: "ci_wait", githubTriggeredFixEpochsPerPr: 5 });
  const result = planInterruptionRecovery(state, { pushPresent: true }, { hostRestarted: true, checkpointValid: true });
  assert.equal(result.earliestSafePhase, "ci_wait");
  assert.equal(result.state.controller.githubTriggeredFixEpochsPerPr, 5);
});

test("corrupt or mismatched recovery identity fails closed", () => {
  const state = fixture();
  const wrong = planInterruptionRecovery(state, { expectedIdentity: { repository: "other/repo" } }, { processExited: true, checkpointValid: true });
  assert.equal(wrong.ok, false);
});

test("valid recovery v1 migrates without reinterpreting counters or markers", () => {
  const migrated = migrateRecoveryStateToSessionLifecycle({
    stateVersion: 1, taskKey: "20260720-2110", issue: { number: 929 }, run: { runId: "run-1" },
    branch: { name: "feature/session", baseSha: sha, currentHeadSha: sha }, phase: "push", nextSafeAction: "push_existing_commit",
    mutationMarkers: { checkpoint_commit: { key: "c1" } }, evidence: { localValidation: { status: "passed" } },
  }, {
    repository: "owner/repo", issueNumber: 929, taskKey: "20260720-2110", runId: "run-1", claimIdentity: "claim-1",
    chargeMarkerRef: "logical-task-budget/charge-1", sessionId: "session-1", branchName: "feature/session", baseSha: sha, headSha: sha,
    localSourceChangingRoundsPerEpoch: 6, githubTriggeredFixEpochsPerPr: 2, lifetimeLocalSourceChangingRounds: 11,
  });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.state.controller.localSourceChangingRoundsPerEpoch, 6);
  assert.equal(migrated.state.reservations.checkpoint_commit.key, "c1");
});

test("repeated recovery planning is idempotent", () => {
  const first = planInterruptionRecovery(fixture(), { commitPresent: true, recoveryOperationId: "recovery-1" }, { processExited: true, checkpointValid: true });
  const second = planInterruptionRecovery(first.state, { commitPresent: true, recoveryOperationId: "recovery-2" }, { processExited: true, checkpointValid: true });
  assert.equal(second.duplicate, true);
  assert.equal(second.state.recovery.operationId, "recovery-1");
});

test("production-shaped fresh invocation rotates atomically with zero external mutations", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-invocation-"));
  const result = prepareFreshSessionInvocation({ logsRoot: root, repositorySlug: "owner/repo" }, {
    state: fixture(), telemetry: { totalTokens: 100000, contextWindowTokens: 128000, turn: 8 },
    phase: "external_review", newSessionId: "session-2", mutationJournaled: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.rotated, true);
  assert.equal(result.state.sessions.current, "session-2");
  assert.equal(result.state.controller.localSourceChangingRoundsPerEpoch, 0);
});
