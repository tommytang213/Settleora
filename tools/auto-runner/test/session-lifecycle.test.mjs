import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertMutationAuthority,
  beginSessionRotation,
  boundedContextSnapshot,
  classifyReportlessInterruption,
  checkpointLockOwnerStatus,
  completeSessionRotation,
  createSessionLifecycleState,
  evaluateContextBudget,
  interruptionClasses,
  loadSessionLifecycleState,
  loadSessionLifecycleForRecovery,
  migrateRecoveryStateToSessionLifecycle,
  normalizeContextBudgetPolicy,
  parseProcStartIdentity,
  persistSessionLifecycleState,
  sessionLifecyclePath,
  planInterruptionRecovery,
  prepareFreshSessionInvocation,
  transitionSessionLifecyclePhase,
  validateSessionLifecycleState,
} from "../lib/session-lifecycle.mjs";
import { consumeSupervisorInterruptionPlanner } from "../supervisor/outage-resubmission-controller.mjs";

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

test("terminal phases retire mutation authority and reject contradictory state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-lifecycle-terminal-"));
  const config = { logsRoot: root, repositorySlug: "owner/repo" };
  const initial = fixture();
  const persisted = persistSessionLifecycleState(config, initial);
  assert.equal(persisted.ok, true);
  const completed = transitionSessionLifecyclePhase(config, persisted.state, { phase: "completed", nextExactAction: "done" });
  assert.equal(completed.ok, true);
  assert.equal(completed.state.report.status, "completed");
  assert.equal(completed.state.mutationAuthority.status, "terminal");
  assert.equal(completed.state.mutationAuthority.ownerSessionId, null);
  assert.equal(assertMutationAuthority(completed.state, "session-1").ok, false);
  const contradictory = structuredClone(completed.state);
  contradictory.mutationAuthority = { ownerSessionId: "session-1", generation: 1, status: "active", handoff: null };
  contradictory.checkpoint.digest = null;
  assert.equal(validateSessionLifecycleState(contradictory).reasonCode, "session_lifecycle_terminal_state_contradictory");
});

test("mandatory pressure rotates before a long operation", () => {
  const result = evaluateContextBudget({ telemetry: { totalTokens: 100000, contextWindowTokens: 128000 }, phase: "external_review", checkpointComplete: true });
  assert.equal(result.action, "rotate_before_next_operation");
});

test("warning pressure at a long phase checkpoints but does not rotate", () => {
  const result = evaluateContextBudget({ telemetry: { totalTokens: 80000, contextWindowTokens: 128000 }, phase: "external_review", checkpointComplete: true });
  assert.equal(result.action, "checkpoint_ready");
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

test("checkpoint persistence rejects a retired generation racing its successor", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-lifecycle-cas-"));
  const config = { logsRoot: root, repositorySlug: "owner/repo" };
  const original = fixture();
  const first = persistSessionLifecycleState(config, original);
  assert.equal(first.ok, true);
  const begun = beginSessionRotation(first.state, { reason: "mandatory", requestId: "rotation-cas" });
  const pending = persistSessionLifecycleState(config, begun.state);
  assert.equal(pending.ok, true);
  const completed = completeSessionRotation(pending.state, { requestId: "rotation-cas", newSessionId: "session-2" });
  const successor = persistSessionLifecycleState(config, completed.state);
  assert.equal(successor.ok, true);

  const staleWrite = persistSessionLifecycleState(config, first.state);
  assert.equal(staleWrite.ok, false);
  assert.equal(staleWrite.reasonCode, "session_lifecycle_checkpoint_compare_and_swap_failed");
  const reloaded = loadSessionLifecycleState(config, {
    repository: "owner/repo", issueNumber: 929, taskKey: "20260720-2110", runId: "run-1", claimIdentity: "claim-1",
  });
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.state.sessions.current, "session-2");
  assert.equal(reloaded.state.sessions.generation, 2);
});

test("recovery-pending checkpoint persists one exact successor generation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-recovery-successor-"));
  const config = { logsRoot: root, repositorySlug: "owner/repo" };
  const initial = persistSessionLifecycleState(config, fixture());
  assert.equal(initial.ok, true);
  const planned = planInterruptionRecovery(initial.state, { recoveryOperationId: "recovery-successor" }, { processExited: true, checkpointValid: true });
  assert.equal(planned.ok, true);
  const pending = persistSessionLifecycleState(config, planned.state);
  assert.equal(pending.ok, true);
  const completed = completeSessionRotation(pending.state, { requestId: pending.state.mutationAuthority.handoff.requestId, newSessionId: "session-recovery-successor" });
  assert.equal(completed.ok, true);
  const persisted = persistSessionLifecycleState(config, completed.state);
  assert.equal(persisted.ok, true);
  assert.equal(persisted.state.sessions.generation, 2);
  assert.equal(assertMutationAuthority(persisted.state, "session-recovery-successor").ok, true);
});

test("checkpoint persistence rejects a stale writer from the same authority generation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-lifecycle-same-generation-cas-"));
  const config = { logsRoot: root, repositorySlug: "owner/repo" };
  const first = persistSessionLifecycleState(config, fixture());
  assert.equal(first.ok, true);
  const newer = structuredClone(first.state);
  newer.controller.nextExactAction = "newer_action";
  const written = persistSessionLifecycleState(config, newer);
  assert.equal(written.ok, true);
  const stale = structuredClone(first.state);
  stale.controller.nextExactAction = "stale_action";
  const rejected = persistSessionLifecycleState(config, stale);
  assert.equal(rejected.reasonCode, "session_lifecycle_checkpoint_compare_and_swap_failed");
  assert.equal(loadSessionLifecycleState(config, {
    repository: "owner/repo", issueNumber: 929, taskKey: "20260720-2110", runId: "run-1", claimIdentity: "claim-1",
  }).state.controller.nextExactAction, "newer_action");
});

test("process start identity parses proc stat commands containing spaces", () => {
  const fields = ["S", ...Array.from({ length: 18 }, (_value, index) => String(index + 1)), "987654", "21"];
  assert.equal(parseProcStartIdentity(`123 (runner worker name) ${fields.join(" ")}\n`), "987654");
  assert.equal(parseProcStartIdentity("123 malformed"), null);
});

test("checkpoint persistence reclaims a lock whose exact process owner is dead", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-lifecycle-dead-lock-"));
  const config = { logsRoot: root, repositorySlug: "owner/repo" };
  const first = persistSessionLifecycleState(config, fixture());
  assert.equal(first.ok, true);
  const lockPath = `${sessionLifecyclePath(config, first.state)}.lock`;
  writeFileSync(lockPath, `${JSON.stringify({ pid: 2147483647, processStart: "1", token: "00000000-0000-4000-8000-000000000000" })}\n`, { mode: 0o600 });
  const next = structuredClone(first.state);
  next.controller.nextExactAction = "recovered_after_dead_lock";
  const recovered = persistSessionLifecycleState(config, next);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state.controller.nextExactAction, "recovered_after_dead_lock");
});

test("checkpoint lock owner probing fails closed on unreadable or malformed process state", () => {
  const owner = { pid: 123, processStart: "456", token: "00000000-0000-4000-8000-000000000000" };
  assert.equal(checkpointLockOwnerStatus(owner, () => { const error = new Error("denied"); error.code = "EACCES"; throw error; }), "unknown");
  assert.equal(checkpointLockOwnerStatus(owner, () => "malformed"), "unknown");
  assert.equal(checkpointLockOwnerStatus(owner, () => { const error = new Error("gone"); error.code = "ENOENT"; throw error; }), "inactive");
});

test("checkpoint persistence never reclaims a lock held by the current process identity", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-lifecycle-active-lock-"));
  const config = { logsRoot: root, repositorySlug: "owner/repo" };
  const first = persistSessionLifecycleState(config, fixture());
  assert.equal(first.ok, true);
  const processStart = parseProcStartIdentity(readFileSync(`/proc/${process.pid}/stat`, "utf8"));
  const lockPath = `${sessionLifecyclePath(config, first.state)}.lock`;
  writeFileSync(lockPath, `${JSON.stringify({ pid: process.pid, processStart, token: "00000000-0000-4000-8000-000000000000" })}\n`, { mode: 0o600 });
  const blocked = persistSessionLifecycleState(config, first.state);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reasonCode, "session_lifecycle_checkpoint_write_locked");
});

test("startup recovery resolves one checkpoint without guessing claim identity", () => {
  const root = mkdtempSync(path.join(tmpdir(), "session-recovery-lookup-"));
  const config = { logsRoot: root, repositorySlug: "owner/repo" };
  assert.equal(persistSessionLifecycleState(config, fixture()).ok, true);
  const loaded = loadSessionLifecycleForRecovery(config, {
    repository: "owner/repo", issueNumber: 929, taskKey: "20260720-2110", runId: "run-1",
    branchName: "feature/session", baseSha: sha, headSha: sha,
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.state.logicalTask.claimIdentity, "claim-1");
  assert.equal(loadSessionLifecycleForRecovery(config, {
    repository: "owner/repo", issueNumber: 929, taskKey: "20260720-2110", runId: "run-1",
    branchName: "feature/session", baseSha: sha, headSha: "b".repeat(40),
  }).recoveryHeadAdvanced, true);
});

test("startup recovery rejects malformed or symlinked lifecycle artifacts", () => {
  for (const kind of ["malformed", "symlink"]) {
    const root = mkdtempSync(path.join(tmpdir(), `session-recovery-untrusted-${kind}-`));
    const config = { logsRoot: root, repositorySlug: "owner/repo" };
    const persisted = persistSessionLifecycleState(config, fixture());
    assert.equal(persisted.ok, true);
    const inventory = path.join(root, "session-lifecycle");
    const candidate = path.join(inventory, `${(kind === "malformed" ? "c" : "d").repeat(64)}.json`);
    if (kind === "malformed") writeFileSync(candidate, "{bad", { mode: 0o600 });
    else symlinkSync(persisted.statePath, candidate);
    const loaded = loadSessionLifecycleForRecovery(config, {
      repository: "owner/repo", issueNumber: 929, taskKey: "20260720-2110", runId: "run-1",
      branchName: "feature/session", baseSha: sha, headSha: sha,
    });
    assert.equal(loaded.ok, false);
    assert.match(loaded.reasonCode, /corrupt|untrusted/);
  }
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

test("prepared and executing reservations never masquerade as completed effects", () => {
  for (const status of ["prepared", "executing", "failed_closed"]) {
    const state = fixture({ reservations: { checkpoint_commit: { key: "c1", status } } });
    const result = planInterruptionRecovery(state, {}, { processExited: true, checkpointValid: true });
    assert.equal(result.effectsAlreadyPresent.commit, false);
  }
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
  assert.equal(migrated.state.reservations.checkpoint_commit.status, "confirmed");
  const recovered = planInterruptionRecovery(migrated.state, {}, { processExited: true, checkpointValid: true });
  assert.equal(recovered.effectsAlreadyPresent.commit, false);
  assert.equal(recovered.earliestSafePhase, "push");
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

test("supervisor rejects caller-supplied synthetic liveness", () => {
  const result = consumeSupervisorInterruptionPlanner(fixture(), { ownerAlive: false, checkpointValid: true });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "authoritative_recovery_evidence_required");
});

test("production invocation sources wire lifecycle through feature bundle and review fix", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const feature = readFileSync(path.join(root, "lib/feature-bundle-orchestrator.mjs"), "utf8");
  const runner = readFileSync(path.join(root, "settleora-auto-runner.mjs"), "utf8");
  const startup = readFileSync(path.join(root, "lib/recovery-continuation.mjs"), "utf8");
  const codexRunner = readFileSync(path.join(root, "lib/codex-runner.mjs"), "utf8");
  assert.match(feature, /sessionLifecycle: bundleLifecycleInvocation\(sessionLifecycle/);
  assert.match(feature, /sessionLifecycle: bundleLifecycleInvocation\(lifecycleState/);
  assert.match(feature, /context\.sessionLifecycle = codex\.sessionLifecycle\.state/);
  assert.match(runner, /promptInfo\.sessionLifecycle = lifecycleInvocation/);
  assert.match(runner, /context\.issue\.sessionLifecycle = codex\.sessionLifecycle\.state/);
  assert.match(codexRunner, /controller-successor/);
  assert.match(codexRunner, /sessionLifecycle = controllerReturn/);
  const prStack = readFileSync(new URL("../lib/pr-stack-executor.mjs", import.meta.url), "utf8");
  const convergence = readFileSync(new URL("../lib/review-convergence-controller.mjs", import.meta.url), "utf8");
  assert.match(prStack, /sessionLifecycle: state\?\.sessionLifecycle \|\| plan\?\.sessionLifecycle \|\| null/);
  assert.match(prStack, /newSessionId: `\$\{sessionLifecycle\.logicalTask\.runId\}:pr-stack-batch-fix:/);
  assert.match(prStack, /sessionLifecycle: lifecycleInvocation/);
  assert.match(prStack, /sessionLifecycle: codex\.sessionLifecycle\?\.state \|\| sessionLifecycle/);
  assert.match(convergence, /sessionLifecycle: codex\.sessionLifecycle \|\| null/);
  assert.match(convergence, /continuedInput = \{ \.\.\.input, sessionLifecycle: codex\.sessionLifecycle \|\| input\.sessionLifecycle \|\| null \}/);
  assert.match(startup, /consumeStartupInterruptionPlanner\(config, state/);
  assert.match(startup, /repository: loaded\.state\.repository/);
  assert.match(startup, /branchName: loaded\.state\.branch\.name/);
  assert.doesNotMatch(startup, /loaded\.state\.candidate/);
});
