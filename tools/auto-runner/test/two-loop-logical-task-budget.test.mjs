import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  accountConvergenceEvent,
  accountGithubTriggeredFixEpoch,
  evaluateLocalConvergenceEvidence,
  evaluateCycleBudget,
  evaluateTwoLoopLimits,
} from "../lib/review-convergence-controller.mjs";
import {
  createInitialReviewConvergenceState,
  loadReviewConvergenceState,
  migrateReviewConvergenceState,
  validateReviewConvergenceState,
  writeReviewConvergenceState,
} from "../lib/review-convergence-state.mjs";
import {
  chargeAcceptedLogicalTask,
  loadLogicalTaskBudget,
  projectLogicalTaskBudget,
} from "../lib/logical-task-budget.mjs";

const sha = (character) => character.repeat(40);
const fingerprint = (character) => character.repeat(64);

function convergence(overrides = {}) {
  return createInitialReviewConvergenceState({
    repository: "tommytang213/Settleora",
    issueNumber: 923,
    taskKey: "task-923",
    prNumber: 1001,
    branchName: "feature/two-loop",
    baseRef: "main",
    exactHead: sha("a"),
    ...overrides,
  });
}

function evidence(status = "passed", overrides = {}) {
  return { status, exactHead: sha("a"), baseSha: sha("b"), changedFilesDigest: fingerprint("c"), ...overrides };
}

test("local convergence requires validation and two fresh reviews on one exact candidate", () => {
  const state = convergence();
  const candidateIdentity = { exactHead: sha("a"), baseSha: sha("b"), changedFilesDigest: fingerprint("c") };
  assert.equal(evaluateLocalConvergenceEvidence(state, {
    candidateIdentity,
    validation: evidence(),
    geminiReview: evidence(),
    codexReview: evidence(),
  }).ok, true);
  assert.equal(evaluateLocalConvergenceEvidence(state, {
    candidateIdentity,
    validation: evidence(),
    geminiReview: evidence("passed", { exactHead: sha("d") }),
    codexReview: evidence(),
  }).reasonCode, "local_convergence_candidate_identity_mismatch");
  assert.equal(evaluateLocalConvergenceEvidence(state, {
    candidateIdentity,
    validation: evidence(),
    geminiReview: evidence(),
    codexReview: evidence("passed", { stale: true }),
  }).reasonCode, "local_convergence_evidence_stale");
});

test("local source batches increment local and lifetime exactly once while waits consume nothing", () => {
  const state = convergence();
  const wait = accountConvergenceEvent(state, { kind: "wait" });
  assert.equal(wait.consumedSourceCycle, false);
  assert.deepEqual(wait.state.counters, state.counters);
  const changed = accountConvergenceEvent(state, { kind: "source_changed", newHead: sha("d") });
  assert.equal(changed.state.counters.localSourceChangingRoundsPerEpoch, 1);
  assert.equal(changed.state.counters.lifetimeLocalSourceChangingRounds, 1);
  const replay = accountConvergenceEvent(changed.state, { kind: "source_changed", newHead: sha("d") });
  assert.equal(replay.consumedSourceCycle, false);
  assert.equal(replay.state.counters.lifetimeLocalSourceChangingRounds, 1);
});

test("one frozen GitHub batch starts one epoch, resets local only, and deduplicates replay", () => {
  let state = convergence({ localSourceChangingRoundsPerEpoch: 7, lifetimeLocalSourceChangingRounds: 19 });
  const first = accountGithubTriggeredFixEpoch(state, { findingFingerprints: [fingerprint("1"), fingerprint("1")] });
  assert.equal(first.incremented, true);
  assert.equal(first.state.epoch, 2);
  assert.equal(first.state.counters.localSourceChangingRoundsPerEpoch, 0);
  assert.equal(first.state.counters.githubTriggeredFixEpochsPerPr, 1);
  assert.equal(first.state.counters.lifetimeLocalSourceChangingRounds, 19);
  const replay = accountGithubTriggeredFixEpoch(first.state, { findingFingerprints: [fingerprint("1")] });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.state.counters.githubTriggeredFixEpochsPerPr, 1);
  const newHeadReplay = accountGithubTriggeredFixEpoch({
    ...first.state,
    pr: { ...first.state.pr, exactHead: sha("d") },
  }, { findingFingerprints: [fingerprint("1")] });
  assert.equal(newHeadReplay.duplicate, true);
  assert.equal(newHeadReplay.state.counters.githubTriggeredFixEpochsPerPr, 1);
  const mixed = accountGithubTriggeredFixEpoch(newHeadReplay.state, { findingFingerprints: [fingerprint("1"), fingerprint("2")] });
  assert.equal(mixed.incremented, true);
  assert.deepEqual(mixed.newFingerprints, [fingerprint("2")]);
  assert.equal(mixed.state.counters.githubTriggeredFixEpochsPerPr, 2);
});

test("the fiftieth GitHub epoch is admitted and the fifty-first is blocked", () => {
  const state = convergence({ githubTriggeredFixEpochsPerPr: 49 });
  const fiftieth = accountGithubTriggeredFixEpoch(state, { findingFingerprints: [fingerprint("2")] });
  assert.equal(fiftieth.ok, true);
  assert.equal(fiftieth.state.counters.githubTriggeredFixEpochsPerPr, 50);
  const fiftyFirst = accountGithubTriggeredFixEpoch(fiftieth.state, { findingFingerprints: [fingerprint("3")] });
  assert.equal(fiftyFirst.reasonCode, "GITHUB_TRIGGERED_FIX_EPOCH_LIMIT_EXHAUSTED");
});

test("50/50 nested limits fail closed and lifetime telemetry never blocks", () => {
  const local = convergence({ localSourceChangingRoundsPerEpoch: 50, lifetimeLocalSourceChangingRounds: 5000 });
  assert.equal(evaluateTwoLoopLimits(local).terminalReason, "LOCAL_SOURCE_CHANGING_ROUND_LIMIT_EXHAUSTED");
  const github = convergence({ githubTriggeredFixEpochsPerPr: 50, lifetimeLocalSourceChangingRounds: 5000 });
  assert.equal(evaluateTwoLoopLimits(github).terminalReason, "GITHUB_TRIGGERED_FIX_EPOCH_LIMIT_EXHAUSTED");
  const telemetry = convergence({ lifetimeLocalSourceChangingRounds: Number.MAX_SAFE_INTEGER });
  assert.equal(evaluateTwoLoopLimits(telemetry).ok, true);
});

test("durable restart preserves loop phase/counters and rejects cross-PR identity", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-two-loop-"));
  const config = { logsRoot };
  const state = { ...convergence({ localSourceChangingRoundsPerEpoch: 3, githubTriggeredFixEpochsPerPr: 2, lifetimeLocalSourceChangingRounds: 8 }), loopPhase: "github_wait" };
  writeReviewConvergenceState(config, state);
  const loaded = loadReviewConvergenceState(config, state);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.state.counters, state.counters);
  assert.equal(loaded.state.loopPhase, "github_wait");
  assert.equal(loadReviewConvergenceState(config, { ...state, prNumber: 2002, pr: { ...state.pr, number: 2002 } }).reasonCode, "review_convergence_state_identity_mismatch");
});

test("legacy cumulative state migrates once and becomes a non-authoritative lifetime projection", () => {
  const legacy = { ...convergence(), stateVersion: 1, counterAuthority: undefined, counterMigration: undefined, counters: undefined, sourceChangingCycle: 37 };
  const migrated = migrateReviewConvergenceState(legacy);
  assert.equal(migrated.stateVersion, 2);
  assert.equal(migrated.counterAuthority, "two_loop_v1");
  assert.equal(migrated.counters.localSourceChangingRoundsPerEpoch, 37);
  assert.equal(migrated.counters.lifetimeLocalSourceChangingRounds, 37);
  assert.equal(migrated.counterMigration.sourceVersion, "legacy_source_changing_cycle_v1");
  assert.equal(migrated.counterMigration.legacyProjectionAuthoritative, false);
  assert.equal(validateReviewConvergenceState(migrated).ok, true);
});

test("pre-dedupe two-loop state with unprovable multi-head history fails closed", () => {
  const frozenFingerprint = "a".repeat(64);
  const migrated = migrateReviewConvergenceState({
    ...convergence(),
    processedGithubFindingFingerprints: undefined,
    counters: {
      localSourceChangingRoundsPerEpoch: 2,
      githubTriggeredFixEpochsPerPr: 2,
      lifetimeLocalSourceChangingRounds: 2,
    },
    sourceChangingCycle: 2,
    findingInventory: [{ fingerprint: frozenFingerprint }],
  });
  assert.equal(migrated.counterMigration.resultingAuthority, "invalid_contradictory_state");
  assert.equal(migrated.counterMigration.contradiction, "processed_github_finding_history_unprovable");
  assert.equal(validateReviewConvergenceState(migrated).reason, "processed_github_findings_invalid");
});

test("pre-dedupe epoch or marker evidence fails closed even when the legacy counter is zero", () => {
  for (const priorEvidence of [
    { epoch: 2 },
    { counterMarkers: { prior: { kind: "github_triggered_fix_epoch" } } },
    { counterMarkers: { malformedPrior: {} } },
  ]) {
    const migrated = migrateReviewConvergenceState({
      ...convergence(),
      processedGithubFindingFingerprints: undefined,
      counters: {
        localSourceChangingRoundsPerEpoch: 0,
        githubTriggeredFixEpochsPerPr: 0,
        lifetimeLocalSourceChangingRounds: 0,
      },
      ...priorEvidence,
    });
    assert.equal(migrated.counterMigration.contradiction, "processed_github_finding_history_unprovable");
  }
});

test("contradictory legacy projection and two-loop lifetime authority fail closed", () => {
  const contradictory = { ...convergence(), sourceChangingCycle: 4, counters: { ...convergence().counters, lifetimeLocalSourceChangingRounds: 5 } };
  assert.equal(validateReviewConvergenceState(contradictory).reason, "counter_projection_contradiction");
  assert.equal(migrateReviewConvergenceState({ ...contradictory, stateVersion: 1 }).counterMigration.resultingAuthority, "invalid_contradictory_state");
});

test("legacy cumulative projection cannot block a valid later GitHub epoch", () => {
  const state = convergence({ sourceChangingCycle: 80, localSourceChangingRoundsPerEpoch: 0, lifetimeLocalSourceChangingRounds: 80, githubTriggeredFixEpochsPerPr: 2 });
  assert.equal(evaluateCycleBudget(state, { allowReviewFixMutation: true, maxReviewFixCycles: 50, configPath: "cfg.json" }, []).ok, true);
});

test("one cumulative candidate can consume rounds through 50 but never reserve round 51", () => {
  const state = convergence({ sourceChangingCycle: 49, localSourceChangingRoundsPerEpoch: 49, lifetimeLocalSourceChangingRounds: 49 });
  const admitted = accountConvergenceEvent(state, { kind: "source_changed", newHead: sha("d"), roundsConsumed: 1 });
  assert.equal(admitted.consumedSourceCycle, true);
  assert.equal(admitted.state.counters.localSourceChangingRoundsPerEpoch, 50);
  const rejected = accountConvergenceEvent(state, { kind: "source_changed", newHead: sha("e"), roundsConsumed: 2 });
  assert.equal(rejected.consumedSourceCycle, false);
  assert.equal(rejected.reason, "local_source_changing_round_limit_exhausted");
});

function budgetConfig(logsRoot) {
  return { logsRoot, repositorySlug: "tommytang213/Settleora", maxIterations: 2 };
}

function chargeInput(issueNumber = 932, overrides = {}) {
  return {
    budgetScopeId: "supervisor-run-1",
    maxTasks: 2,
    issueNumber,
    taskLineageId: `issue-${issueNumber}`,
    claimIdentity: `tommytang213/Settleora#${issueNumber}`,
    acceptedAt: "2026-07-20T06:00:00.000Z",
    ...overrides,
  };
}

test("pre-claim skips charge zero and accepted tasks charge exactly once across restart/session/fix replay", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-task-budget-"));
  const config = budgetConfig(logsRoot);
  assert.equal(loadLogicalTaskBudget(config, "supervisor-run-1").state.acceptedLogicalTaskCount, 0);
  const first = chargeAcceptedLogicalTask(config, chargeInput());
  assert.equal(first.charged, true);
  assert.equal(first.acceptedLogicalTaskCount, 1);
  for (const acceptedAt of ["2026-07-20T06:01:00.000Z", "2026-07-20T06:02:00.000Z"]) {
    const replay = chargeAcceptedLogicalTask(config, chargeInput(932, { acceptedAt }));
    assert.equal(replay.duplicate, true);
    assert.equal(replay.acceptedLogicalTaskCount, 1);
  }
});

test("task outcomes and nested review cycles do not alter accepted logical-task count", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-task-outcome-"));
  const config = budgetConfig(logsRoot);
  chargeAcceptedLogicalTask(config, chargeInput());
  let state = convergence();
  for (let index = 0; index < 5; index += 1) state = accountConvergenceEvent(state, { kind: "source_changed", newHead: String(index + 1).repeat(40) }).state;
  state = accountGithubTriggeredFixEpoch(state, { findingFingerprints: [fingerprint("9")] }).state;
  assert.equal(loadLogicalTaskBudget(config, "supervisor-run-1").state.acceptedLogicalTaskCount, 1);
});

test("different accepted task charges distinctly and max-task stop ignores internal work", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-task-max-"));
  const config = budgetConfig(logsRoot);
  assert.equal(chargeAcceptedLogicalTask(config, chargeInput(932)).ok, true);
  assert.equal(chargeAcceptedLogicalTask(config, chargeInput(923)).acceptedLogicalTaskCount, 2);
  const blocked = chargeAcceptedLogicalTask(config, chargeInput(924));
  assert.equal(blocked.reasonCode, "accepted_logical_task_budget_exhausted");
});

test("accepted-task charging serializes concurrent writers and recovers an inactive owner", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-task-lock-"));
  const config = budgetConfig(logsRoot);
  const first = chargeAcceptedLogicalTask(config, chargeInput(932));
  const lockPath = `${first.statePath}.lock`;
  mkdirSync(lockPath, { mode: 0o700 });
  writeFileSync(path.join(lockPath, "owner.json"), `${JSON.stringify({ pid: process.pid, token: fingerprint("a"), createdAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  assert.equal(chargeAcceptedLogicalTask(config, chargeInput(923)).reasonCode, "logical_task_budget_lock_busy");
  writeFileSync(path.join(lockPath, "owner.json"), `${JSON.stringify({ pid: 99999999, token: fingerprint("b"), createdAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  const recovered = chargeAcceptedLogicalTask(config, chargeInput(923));
  assert.equal(recovered.ok, true, recovered.reasonCode);
  assert.equal(recovered.acceptedLogicalTaskCount, 2);
});

test("corrupt or missing charge identity fails closed and projection is sanitized", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-task-corrupt-"));
  const config = budgetConfig(logsRoot);
  const charged = chargeAcceptedLogicalTask(config, chargeInput());
  const projection = projectLogicalTaskBudget(charged.state);
  assert.equal(projection.acceptedLogicalTaskCount, 1);
  assert.equal(projection.charges[0].identityClass, "accepted_issue_claim");
  assert.equal(Object.hasOwn(projection.charges[0], "claimIdentity"), false);
  writeFileSync(charged.statePath, "{broken", { mode: 0o600 });
  assert.equal(chargeAcceptedLogicalTask(config, chargeInput()).reasonCode, "logical_task_budget_state_corrupt");
  const missing = chargeAcceptedLogicalTask(budgetConfig(mkdtempSync(path.join(tmpdir(), "settleora-task-missing-"))), { ...chargeInput(), claimIdentity: null });
  assert.equal(missing.reasonCode, "logical_task_charge_identity_invalid");
});
