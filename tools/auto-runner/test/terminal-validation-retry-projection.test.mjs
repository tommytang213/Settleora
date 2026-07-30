import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { specPathForRunId } from "../supervisor/run-spec.mjs";
import {
  exactRawCheckpointMutationMarkerShape,
  exactRawCheckpointMutationMarkers,
  exactRawCheckpoint,
  exactRawValidationEvidence,
  exactLifecycle,
  exactStateArtifactFilenameIdentity,
  exactSuccessorSpecArtifact,
  exactTerminalIteration,
  exactTerminalSummary,
  exactTerminalFailureFindings,
  exactSuccessorSpec,
  selectLatestIssueStateTimestamp,
  stateArtifactMayBelongToTarget,
  stateArtifactMayBelongToTargetOrSuccessorRun,
  successorRunArtifactsAreUnique,
  stateMayBelongToTarget,
  stateMayBelongToTargetOrSuccessorRun,
} from "../lib/terminal-validation-retry-projection.mjs";

test("terminal retry projection binds the successor budget marker charge and task lineage", () => {
  const target = {
    durableBudgetExact: true,
    acceptedLogicalTasks: 1,
    issueNumber: 959,
    repository: "owner/repo",
    claimIdentity: "owner/repo#959",
    chargeId: "a".repeat(64),
    taskKey: "20260724T075849",
    branch: "feature/auto-959-preserved",
    baseSha: "1".repeat(40),
    headSha: "2".repeat(40),
    runnerRunId: "run-original",
    supervisorRunId: "supervised-original",
    chargeMarkerRef: "/trusted/logical-task-budget/original.json",
  };
  const marker = {
    chargeId: target.chargeId,
    identity: {
      repository: target.repository,
      issueNumber: target.issueNumber,
      taskLineageId: `issue-${target.issueNumber}`,
      claimIdentity: target.claimIdentity,
    },
  };
  const iteration = {
    index: 1,
    outcome: "blocked_recovery_state",
    issue: { number: target.issueNumber },
    issueSource: "startup_recovery",
    branchName: target.branch,
    baseOriginMainSha: target.baseSha,
    runnerCreatedCommitSha: target.headSha,
    pr: null,
    existingPrRecovery: null,
    bundle: null,
    autoMerge: null,
    changedFiles: [],
    validation: null,
    review: null,
    externalReview: null,
    systemicStop: "recoverable-work-blocked:historical_candidate_task_workspace_untrusted",
    logicalTaskBudget: {
      ok: true,
      duplicate: true,
      charged: false,
      chargeId: target.chargeId,
      acceptedLogicalTaskCount: 1,
      statePath: target.chargeMarkerRef,
      state: {
        stateVersion: 1,
        repository: target.repository,
        budgetScopeId: target.supervisorRunId,
        acceptedLogicalTaskCount: 1,
        charges: {
          [target.chargeId]: marker,
        },
      },
      marker,
    },
    recovery: {
      states: [{
        taskKey: target.taskKey,
        issueNumber: target.issueNumber,
        branchName: target.branch,
        baseSha: target.baseSha,
        currentHeadSha: target.headSha,
        prNumber: null,
        prUrl: null,
        phase: "stopped",
        stopReason: {
          reasonCode: "checkpoint_validation_recovery_failed_closed",
          reason: "initial_validation_failure_commit_reconstruction_ambiguous",
        },
        firstIncompleteAction: "run_validation_and_commit",
        nextSafeAction: "stop_fail_closed",
        runId: target.runnerRunId,
        supervisorRunId: target.supervisorRunId,
      }],
    },
  };
  assert.equal(exactTerminalIteration(iteration, target), true);
  assert.equal(exactTerminalIteration({
    ...iteration,
    logicalTaskBudget: {
      ...iteration.logicalTaskBudget,
      marker: { ...iteration.logicalTaskBudget.marker, chargeId: "b".repeat(64) },
    },
  }, target), false);
  for (const logicalTaskBudget of [
    { ...iteration.logicalTaskBudget, statePath: "/trusted/logical-task-budget/other.json" },
    {
      ...iteration.logicalTaskBudget,
      state: { ...iteration.logicalTaskBudget.state, budgetScopeId: "supervised-other" },
    },
    {
      ...iteration.logicalTaskBudget,
      state: {
        ...iteration.logicalTaskBudget.state,
        acceptedLogicalTaskCount: 2,
        charges: {
          ...iteration.logicalTaskBudget.state.charges,
          ["b".repeat(64)]: { ...marker, chargeId: "b".repeat(64) },
        },
      },
    },
  ]) {
    assert.equal(exactTerminalIteration({ ...iteration, logicalTaskBudget }, target), false);
  }
  assert.equal(exactTerminalIteration({
    ...iteration,
    logicalTaskBudget: {
      ...iteration.logicalTaskBudget,
      marker: {
        ...iteration.logicalTaskBudget.marker,
        identity: { ...iteration.logicalTaskBudget.marker.identity, taskLineageId: "issue-999" },
      },
    },
  }, target), false);
  for (const field of ["existingPrRecovery", "bundle", "autoMerge"]) {
    assert.equal(exactTerminalIteration({ ...iteration, [field]: { status: "completed" } }, target), false);
  }
  assert.equal(exactTerminalIteration({
    ...iteration,
    systemicStop: "recoverable-work-blocked:different_reason",
  }, target), false);
  for (const changedFiles of ["", { length: 0 }, null]) {
    assert.equal(exactTerminalIteration({ ...iteration, changedFiles }, target), false);
  }
});

test("terminal retry projection binds the runner summary to the iteration systemic stop", () => {
  const iteration = {
    runId: "run-successor",
    startedAt: "2026-07-30T09:32:43.249Z",
    finishedAt: "2026-07-30T09:32:51.858Z",
    systemicStop: "recoverable-work-blocked:historical_candidate_task_workspace_untrusted",
  };
  const target = { issueNumber: 959 };
  const summary = {
    iterations: [iteration],
    runId: iteration.runId,
    supervisorRunId: "supervised-successor",
    stopReason: iteration.systemicStop,
    maxRuntimeMs: 14 * 24 * 60 * 60 * 1000,
    configPath: "/workspace/auto-runner/config/settleora.json",
    attemptedIssueCount: 0,
    attemptedIssueNumbers: [],
    processedIssueCount: 1,
    processedIssueNumbers: [target.issueNumber],
    acceptedLogicalTaskCount: 1,
    maxIterations: 1,
    startedAt: "2026-07-30T09:32:43.185Z",
    finishedAt: "2026-07-30T09:32:51.859Z",
  };
  assert.equal(exactTerminalSummary(summary, iteration, target), true);
  assert.equal(exactTerminalSummary({ ...summary, stopReason: null }, iteration, target), false);
  assert.equal(exactTerminalSummary({
    ...summary,
    stopReason: "recoverable-work-blocked:different_reason",
  }, iteration, target), false);
  assert.equal(exactTerminalSummary({ ...summary, maxRuntimeMs: 60_000 }, iteration, target), false);
  assert.equal(exactTerminalSummary({ ...summary, configPath: "/different/config.json" }, iteration, target), false);
  assert.equal(exactTerminalSummary({
    ...summary,
    iterations: { 0: iteration, length: 1 },
  }, iteration, target), false);
  assert.equal(exactTerminalSummary({
    ...summary,
    attemptedIssueNumbers: { length: 0 },
  }, iteration, target), false);
  assert.equal(exactTerminalSummary({
    ...summary,
    processedIssueNumbers: { 0: target.issueNumber, length: 1 },
  }, iteration, target), false);
});

test("terminal retry projection binds every lifecycle convergence counter", () => {
  const target = {
    repository: "owner/repo",
    issueNumber: 959,
    taskKey: "20260724T075849",
    runnerRunId: "run-original",
    supervisorRunId: "supervised-original",
    claimIdentity: "owner/repo#959",
    chargeMarkerRef: "/trusted/budget.json",
    branch: "feature/auto-959-preserved",
    baseSha: "1".repeat(40),
    headSha: "2".repeat(40),
    localSourceChangingRounds: 2,
    githubTriggeredFixEpochs: 3,
    lifetimeLocalSourceChangingRounds: 4,
  };
  const lifecycle = {
    repository: target.repository,
    logicalTask: {
      issueNumber: target.issueNumber,
      taskKey: target.taskKey,
      runId: target.runnerRunId,
      supervisorRunId: target.supervisorRunId,
      claimIdentity: target.claimIdentity,
      chargeMarkerRef: target.chargeMarkerRef,
    },
    branch: { name: target.branch, baseSha: target.baseSha, headSha: target.headSha, prNumber: null },
    controller: {
      phase: "stopped",
      nextExactAction: "checkpoint_validation_recovery_failed_closed",
      localSourceChangingRoundsPerEpoch: target.localSourceChangingRounds,
      githubTriggeredFixEpochsPerPr: target.githubTriggeredFixEpochs,
      lifetimeLocalSourceChangingRounds: target.lifetimeLocalSourceChangingRounds,
    },
    report: { status: "stopped" },
    mutationAuthority: { status: "terminal", ownerSessionId: null, handoff: null },
    interruption: {
      class: "main_process_exit_without_terminal_report",
      reasonCode: "interruption_main_process_exit_without_terminal_report",
    },
    recovery: {
      status: "pending",
      attempts: 1,
      operationId: "recovery-operation",
      phaseAfter: "checkpoint_validation_commit",
      effectsAlreadyPresent: {
        mutation: false, commit: true, push: false, pr: false, merge: false, comment: false,
      },
    },
  };
  assert.equal(exactLifecycle(lifecycle, target), true);
  const reopenedPending = {
    ...lifecycle,
    checkpoint: { digest: "c".repeat(64) },
    sessions: { current: "terminal-session" },
    controller: {
      ...lifecycle.controller,
      phase: "checkpoint_validation_commit",
      nextExactAction: "run_validation_and_commit",
    },
    report: { status: "in_progress" },
    mutationAuthority: {
      status: "recovery_pending",
      ownerSessionId: null,
      handoff: {
        requestId: "d".repeat(64),
        retiredSessionId: "terminal-session",
        successorSessionId: null,
        reason: "validation_retry_derivative_reopened",
        checkpointDigest: "c".repeat(64),
        startedAt: "2026-07-30T20:00:00.000Z",
      },
    },
  };
  assert.equal(exactLifecycle(reopenedPending, target), false, "deployment posture remains terminal-only");
  assert.equal(exactLifecycle(reopenedPending, { ...target, allowReopenedLifecycle: true }), true);
  assert.equal(exactLifecycle({
    ...reopenedPending,
    mutationAuthority: {
      ...reopenedPending.mutationAuthority,
      handoff: { ...reopenedPending.mutationAuthority.handoff, checkpointDigest: "e".repeat(64) },
    },
  }, { ...target, allowReopenedLifecycle: true }), false);
  for (const [key, targetKey] of [
    ["localSourceChangingRoundsPerEpoch", "localSourceChangingRounds"],
    ["githubTriggeredFixEpochsPerPr", "githubTriggeredFixEpochs"],
    ["lifetimeLocalSourceChangingRounds", "lifetimeLocalSourceChangingRounds"],
  ]) {
    assert.equal(exactLifecycle({
      ...lifecycle,
      controller: { ...lifecycle.controller, [key]: target[targetKey] + 1 },
    }, target), false, key);
  }
});

test("terminal retry projection rejects any later or unknown mutation marker category", () => {
  const exact = {
    claim: { issue: {} },
    logical_task_charge: { charge: {} },
    branch_ownership_created: { branch: {} },
  };
  assert.equal(exactRawCheckpointMutationMarkerShape(exact), true);
  assert.equal(exactRawCheckpointMutationMarkerShape({ ...exact, pr_create: { pr: {} } }), false);
  assert.equal(exactRawCheckpointMutationMarkerShape({ ...exact, comment: { issue: {} } }), false);
  assert.equal(exactRawCheckpointMutationMarkerShape({ ...exact, push: {} }), false);
  assert.equal(exactRawCheckpointMutationMarkerShape({ ...exact, merge: {} }), false);
});

test("terminal retry projection rejects a newer unfinished or malformed issue state", () => {
  const terminal = {
    startedAt: "2026-07-30T09:32:43.249Z",
    finishedAt: "2026-07-30T09:32:51.858Z",
  };
  assert.deepEqual(selectLatestIssueStateTimestamp([terminal]), {
    ok: true,
    finishedAt: terminal.finishedAt,
  });
  assert.deepEqual(selectLatestIssueStateTimestamp([
    terminal,
    { startedAt: "2026-07-30T09:33:00.000Z", finishedAt: null },
  ]), { ok: false, finishedAt: null });
  assert.deepEqual(selectLatestIssueStateTimestamp([
    terminal,
    { startedAt: "not-a-date", finishedAt: "2026-07-30T09:34:00.000Z" },
  ]), { ok: false, finishedAt: null });
});

test("terminal retry projection selects the unique latest completed issue state", () => {
  const latest = {
    startedAt: "2026-07-30T09:32:43.249Z",
    finishedAt: "2026-07-30T09:32:51.858Z",
  };
  assert.deepEqual(selectLatestIssueStateTimestamp([
    {
      startedAt: "2026-07-30T09:15:04.521Z",
      finishedAt: "2026-07-30T09:15:08.192Z",
    },
    latest,
  ]), { ok: true, finishedAt: latest.finishedAt });
});

test("terminal retry projection associates malformed successor issue state by task or branch lineage", () => {
  const target = {
    issueNumber: 959,
    taskKey: "20260724T075849",
    branch: "feature/auto-959-preserved",
  };
  assert.equal(stateMayBelongToTarget({
    issue: null,
    taskKey: target.taskKey,
    branchName: target.branch,
  }, target), true);
  assert.equal(stateMayBelongToTarget({
    issue: { number: "malformed" },
    recovery: { states: [{ taskKey: target.taskKey }] },
  }, target), true);
  assert.equal(stateMayBelongToTarget({
    issue: { number: 999 },
    taskKey: "unrelated",
    branchName: "feature/unrelated",
  }, target), false);
});

test("terminal retry projection can carry direct association through successor run identity", () => {
  const target = {
    issueNumber: 959,
    taskKey: "20260724T075849",
    branch: "feature/auto-959-preserved",
  };
  const associated = {
    runId: "run-successor",
    issue: { number: target.issueNumber },
    taskKey: null,
    branchName: target.branch,
  };
  const malformedLater = {
    runId: associated.runId,
    issue: null,
    taskKey: null,
    branchName: null,
  };
  assert.equal(stateMayBelongToTarget(associated, target), true);
  assert.equal(stateMayBelongToTarget(malformedLater, target), false);
  assert.equal(stateMayBelongToTargetOrSuccessorRun(malformedLater, target, [associated]), true);
  assert.equal(stateMayBelongToTargetOrSuccessorRun({
    ...malformedLater,
    runId: "unrelated-successor",
  }, target, [associated]), false);
});

test("terminal retry projection treats a target-bound state filename as superseding evidence", () => {
  const target = {
    issueNumber: 959,
    taskKey: "20260724T075849",
    branch: "feature/auto-959-preserved",
    runnerRunId: "run-original",
    supervisorRunId: "supervised-original",
  };
  const malformed = {
    path: "/trusted/state/run-2026-07-30T100000Z-deadbeefcafe-2-issue-959.json",
    value: {
      finishedAt: "2026-07-30T10:00:01.000Z",
    },
  };
  assert.equal(stateArtifactMayBelongToTarget(malformed, target), true);
  assert.equal(exactStateArtifactFilenameIdentity(malformed), false);
  assert.equal(exactStateArtifactFilenameIdentity({
    ...malformed,
    value: {
      ...malformed.value,
      runId: "run-2026-07-30T100000Z-deadbeefcafe",
      index: 2,
      issue: { number: 959 },
    },
  }), true);
  assert.equal(stateArtifactMayBelongToTarget({
    ...malformed,
    path: "/trusted/state/run-2026-07-30T100000Z-deadbeefcafe-2-issue-999.json",
  }, target), false);
  assert.equal(stateArtifactMayBelongToTarget({
    ...malformed,
    path: "/trusted/state/run-invalid-2-issue-959.json",
  }, target), false);
});

test("terminal retry projection treats a successor-run filename as superseding evidence", () => {
  const target = {
    issueNumber: 959,
    taskKey: "20260724T075849",
    branch: "feature/auto-959-preserved",
    runnerRunId: "run-original",
    supervisorRunId: "supervised-original",
  };
  const successor = {
    runId: "run-2026-07-30T100000Z-deadbeefcafe",
    issue: { number: 959 },
    branchName: target.branch,
  };
  const malformedDifferentIssue = {
    path: `/trusted/state/${successor.runId}-2-issue-999.json`,
    value: { finishedAt: "2026-07-30T10:00:01.000Z" },
  };
  assert.equal(stateArtifactMayBelongToTarget(malformedDifferentIssue, target), false);
  assert.equal(stateArtifactMayBelongToTargetOrSuccessorRun(
    malformedDifferentIssue,
    target,
    [successor],
  ), true);
});

test("terminal retry projection rejects every additional successor-run artifact regardless of timestamp", () => {
  const runId = "run-2026-07-30T100000Z-deadbeefcafe";
  const anchor = { runId };
  const first = {
    path: `/trusted/state/${runId}-1-issue-959.json`,
    value: { runId, index: 1, issue: { number: 959 }, finishedAt: "2026-07-30T10:00:01.000Z" },
  };
  assert.equal(successorRunArtifactsAreUnique([first], [anchor]), true);
  for (const extraPath of [
    `/trusted/state/${runId}-2-issue-999.json`,
    `/trusted/state/${runId}-2-no-issue.json`,
    `/trusted/state/${runId}-1-issue-999.json`,
  ]) {
    assert.equal(successorRunArtifactsAreUnique([
      first,
      { path: extraPath, value: { finishedAt: "2026-07-30T09:00:00.000Z" } },
    ], [anchor]), false);
  }
  assert.equal(successorRunArtifactsAreUnique([
    first,
    {
      path: "/trusted/state/run-different-1-issue-999.json",
      value: { runId, finishedAt: "2026-07-30T09:00:00.000Z" },
    },
  ], [anchor]), false);
  assert.equal(successorRunArtifactsAreUnique([first], [anchor, { runId: "run-other" }]), false);
});

test("terminal retry projection binds successor spec base and compatible runner mode", () => {
  const summary = {
    supervisorRunId: "supervised-20260730T093234Z-dcc42a3a61db",
    mode: "run",
    baseOriginMainSha: "e96376b03d1e11dddeec28be237201ce56681753",
    startedAt: "2026-07-30T09:32:43.000Z",
    maxRuntimeMs: 14 * 24 * 60 * 60 * 1000,
    configPath: "/workspace/auto-runner/config/settleora.json",
  };
  const spec = {
    specVersion: 1,
    runId: summary.supervisorRunId,
    mode: "trusted",
    maxTasks: 1,
    maxRuntime: "14d",
    profile: "default",
    runnerConfigPath: "/workspace/auto-runner/config/settleora.json",
    runnerConfigSha256: "644f69637cb69911f85bed367cfda13b2db889a36e11844226a5c188977dea1d",
    initialOriginMainSha: summary.baseOriginMainSha,
    requestedBy: "operator",
    sourceBranchName: null,
    sourceIssueNumber: null,
    parentRunnerRunId: null,
    parentSupervisorRunId: null,
    outageResubmission: null,
    recoveryOnlyTarget: null,
    createdAt: "2026-07-30T09:32:34.000Z",
  };
  assert.equal(exactSuccessorSpec(spec, summary), true);
  assert.equal(exactSuccessorSpec({
    ...spec,
    initialOriginMainSha: "0".repeat(40),
  }, summary), false);
  assert.equal(exactSuccessorSpec({ ...spec, unexpectedField: true }, summary), false);
  for (const field of ["maxRuntime", "profile", "runnerConfigPath", "runnerConfigSha256", "outageResubmission"]) {
    const partial = { ...spec };
    delete partial[field];
    assert.equal(exactSuccessorSpec(partial, summary), false);
  }
  assert.equal(exactSuccessorSpec({ ...spec, runnerConfigSha256: null }, summary), false);
  assert.equal(exactSuccessorSpec(spec, { ...summary, mode: "dry-run" }), false);
  assert.equal(exactSuccessorSpec(spec, { ...summary, maxRuntimeMs: 60_000 }), false);
  assert.equal(exactSuccessorSpec(spec, { ...summary, configPath: "/different/config.json" }), false);
});

test("terminal retry projection requires the successor spec's canonical storage path", (t) => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-terminal-spec-"));
  t.after(() => rmSync(logsRoot, { recursive: true, force: true }));
  const summary = {
    supervisorRunId: "supervised-20260730T093234Z-dcc42a3a61db",
    mode: "run",
    baseOriginMainSha: "e96376b03d1e11dddeec28be237201ce56681753",
    startedAt: "2026-07-30T09:32:43.000Z",
    maxRuntimeMs: 14 * 24 * 60 * 60 * 1000,
    configPath: "/workspace/auto-runner/config/settleora.json",
  };
  const canonicalPath = specPathForRunId(summary.supervisorRunId, logsRoot);
  const value = {
    specVersion: 1,
    runId: summary.supervisorRunId,
    mode: "trusted",
    maxTasks: 1,
    maxRuntime: "14d",
    profile: "default",
    runnerConfigPath: "/workspace/auto-runner/config/settleora.json",
    runnerConfigSha256: "644f69637cb69911f85bed367cfda13b2db889a36e11844226a5c188977dea1d",
    initialOriginMainSha: summary.baseOriginMainSha,
    requestedBy: "operator",
    sourceBranchName: null,
    sourceIssueNumber: null,
    parentRunnerRunId: null,
    parentSupervisorRunId: null,
    outageResubmission: null,
    recoveryOnlyTarget: null,
    createdAt: "2026-07-30T09:32:34.000Z",
  };
  mkdirSync(path.dirname(canonicalPath), { recursive: true, mode: 0o700 });
  writeFileSync(canonicalPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  assert.equal(exactSuccessorSpecArtifact({ path: canonicalPath, value }, summary, logsRoot), true);
  assert.equal(exactSuccessorSpecArtifact({
    path: path.join(logsRoot, "supervisor", "run-specs", "not-canonical", "spec.json"),
    value,
  }, summary, logsRoot), false);
});

test("terminal retry projection binds raw continuation repository identity", () => {
  const target = {
    repository: "tommytang213/Settleora",
    issueNumber: 959,
    taskKey: "20260724T075849",
    runnerRunId: "run-original",
    supervisorRunId: "supervised-original",
    branch: "feature/auto-959-preserved",
    baseSha: "1".repeat(40),
    headSha: "2".repeat(40),
    treeSha: "3".repeat(40),
    changedFilesDigest: "4".repeat(64),
    diffDigest: "5".repeat(64),
    chargeId: "charge-959",
  };
  const candidate = {
    baseSha: target.baseSha,
    headSha: target.headSha,
    treeSha: target.treeSha,
    changedFilesDigest: target.changedFilesDigest,
    diffDigest: target.diffDigest,
    changedFiles: ["tools/auto-runner/example.mjs"],
  };
  const state = {
    phase: "checkpoint_validation_commit",
    stopReason: null,
    firstIncompleteAction: "run_validation_and_commit",
    nextSafeAction: "run_validation_and_commit",
    issue: { number: target.issueNumber },
    taskKey: target.taskKey,
    run: { runId: target.runnerRunId, supervisorRunId: target.supervisorRunId },
    branch: {
      name: target.branch,
      baseSha: target.baseSha,
      currentHeadSha: target.headSha,
      expectedRemoteHeadSha: null,
    },
    pr: { number: null, url: null, headSha: null },
    ordinaryContinuation: {
      identity: candidate,
      sourceFailureBatch: {
        candidate,
        findings: [{
          sourceKind: "local_validation",
          repository: target.repository,
          issueNumber: target.issueNumber,
          taskKey: target.taskKey,
          branchName: target.branch,
          identity: candidate,
          classification: "unsafe_or_ambiguous",
          sourceFixEligible: false,
          retryable: false,
          reasonCode: "source_failure_unsafe_or_ambiguous",
          nextAction: "stop_fail_closed",
        }],
      },
    },
    evidence: {
      localValidation: {
        status: "failed",
        headSha: target.baseSha,
        baseSha: target.baseSha,
        changedFilesDigest: target.changedFilesDigest,
        stale: true,
        invalidatedBy: "validation_failure_candidate_commit",
        invalidatedOldHeadSha: target.baseSha,
        invalidatedNewHeadSha: target.headSha,
      },
      externalReview: null,
      codexReview: null,
      ciChecks: null,
      codeScanning: null,
      mergeEligibility: null,
      finalRefresh: null,
      postMergeExpectations: null,
    },
    mutationMarkers: {
      claim: {
        [`issue-${target.issueNumber}`]: {
          status: "completed",
          target: `https://github.com/${target.repository}/issues/${target.issueNumber}`,
          correlation: target.runnerRunId,
        },
      },
      logical_task_charge: {
        [target.chargeId]: {
          status: "completed",
          target: `issue-${target.issueNumber}`,
          correlation: target.chargeId,
        },
      },
      branch_ownership_created: {
        [`${target.branch}:${target.baseSha}`]: {
          status: "completed",
          target: target.branch,
          correlation: target.baseSha,
        },
      },
    },
  };
  assert.equal(exactRawCheckpoint(state, target), true);
  assert.equal(exactRawCheckpoint({
    ...state,
    ordinaryContinuation: {
      ...state.ordinaryContinuation,
      sourceFailureBatch: {
        ...state.ordinaryContinuation.sourceFailureBatch,
        findings: [{
          ...state.ordinaryContinuation.sourceFailureBatch.findings[0],
          repository: "other/Repository",
        }],
      },
    },
  }, target), false);
});

test("terminal retry projection requires terminal classification on every source finding", () => {
  const target = {
    repository: "tommytang213/Settleora",
    issueNumber: 959,
    taskKey: "20260724T075849",
    branch: "feature/auto-959-preserved",
  };
  const candidate = {
    baseSha: "1".repeat(40),
    headSha: "2".repeat(40),
  };
  const finding = {
    sourceKind: "local_validation",
    repository: target.repository,
    issueNumber: target.issueNumber,
    taskKey: target.taskKey,
    branchName: target.branch,
    identity: candidate,
    classification: "unsafe_or_ambiguous",
    sourceFixEligible: false,
    retryable: false,
    reasonCode: "source_failure_unsafe_or_ambiguous",
    nextAction: "stop_fail_closed",
  };
  assert.equal(exactTerminalFailureFindings([finding], candidate, target), true);
  assert.equal(exactTerminalFailureFindings([{ ...finding, sourceFixEligible: true }], candidate, target), false);
  assert.equal(exactTerminalFailureFindings([{ ...finding, nextAction: "run_validation_and_commit" }], candidate, target), false);
});

test("terminal retry projection binds exact completed marker identities", () => {
  const target = {
    repository: "tommytang213/Settleora",
    issueNumber: 959,
    runnerRunId: "run-original",
    chargeId: "charge-959",
    branch: "feature/auto-959-preserved",
    baseSha: "1".repeat(40),
  };
  const markers = {
    claim: {
      "issue-959": {
        status: "completed",
        target: "https://github.com/tommytang213/Settleora/issues/959",
        correlation: target.runnerRunId,
      },
    },
    logical_task_charge: {
      [target.chargeId]: {
        status: "completed",
        target: "issue-959",
        correlation: target.chargeId,
      },
    },
    branch_ownership_created: {
      [`${target.branch}:${target.baseSha}`]: {
        status: "completed",
        target: target.branch,
        correlation: target.baseSha,
      },
    },
  };
  assert.equal(exactRawCheckpointMutationMarkers(markers, target), true);
  assert.equal(exactRawCheckpointMutationMarkers({
    ...markers,
    claim: { "issue-959": { ...markers.claim["issue-959"], status: "pending" } },
  }, target), false);
  assert.equal(exactRawCheckpointMutationMarkers({
    ...markers,
    branch_ownership_created: {
      [`${target.branch}:${target.baseSha}`]: {
        ...markers.branch_ownership_created[`${target.branch}:${target.baseSha}`],
        correlation: "0".repeat(40),
      },
    },
  }, target), false);
});

test("terminal retry projection requires exact failed validation evidence and no later evidence", () => {
  const target = {
    baseSha: "1".repeat(40),
    headSha: "2".repeat(40),
    changedFilesDigest: "3".repeat(64),
  };
  const evidence = {
    localValidation: {
      status: "failed",
      headSha: target.baseSha,
      baseSha: target.baseSha,
      changedFilesDigest: target.changedFilesDigest,
      stale: true,
      invalidatedBy: "validation_failure_candidate_commit",
      invalidatedOldHeadSha: target.baseSha,
      invalidatedNewHeadSha: target.headSha,
    },
    externalReview: null,
    codexReview: null,
    ciChecks: null,
    codeScanning: null,
    mergeEligibility: null,
    finalRefresh: null,
    postMergeExpectations: null,
  };
  assert.equal(exactRawValidationEvidence(evidence, target), true);
  assert.equal(exactRawValidationEvidence({
    ...evidence,
    localValidation: { ...evidence.localValidation, headSha: target.headSha },
  }, target), false);
  assert.equal(exactRawValidationEvidence({
    ...evidence,
    externalReview: { status: "passed", headSha: target.headSha },
  }, target), false);
});
