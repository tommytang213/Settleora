import assert from "node:assert/strict";
import test from "node:test";

import {
  exactRawCheckpointMutationMarkerShape,
  exactRawCheckpoint,
  exactSuccessorSpec,
  selectLatestIssueStateTimestamp,
  stateMayBelongToTarget,
} from "../lib/terminal-validation-retry-projection.mjs";

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

test("terminal retry projection binds successor spec base and compatible runner mode", () => {
  const summary = {
    supervisorRunId: "supervised-20260730T093234Z-dcc42a3a61db",
    mode: "run",
    baseOriginMainSha: "e96376b03d1e11dddeec28be237201ce56681753",
    startedAt: "2026-07-30T09:32:43.000Z",
  };
  const spec = {
    specVersion: 1,
    runId: summary.supervisorRunId,
    mode: "trusted",
    maxTasks: 1,
    initialOriginMainSha: summary.baseOriginMainSha,
    requestedBy: "operator",
    sourceBranchName: null,
    sourceIssueNumber: null,
    parentRunnerRunId: null,
    parentSupervisorRunId: null,
    recoveryOnlyTarget: null,
    createdAt: "2026-07-30T09:32:34.000Z",
  };
  assert.equal(exactSuccessorSpec(spec, summary), true);
  assert.equal(exactSuccessorSpec({
    ...spec,
    initialOriginMainSha: "0".repeat(40),
  }, summary), false);
  assert.equal(exactSuccessorSpec(spec, { ...summary, mode: "dry-run" }), false);
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
  };
  const candidate = {
    repository: target.repository,
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
      sourceFailureBatch: { candidate },
    },
    mutationMarkers: {
      claim: {},
      logical_task_charge: {},
      branch_ownership_created: {},
    },
  };
  assert.equal(exactRawCheckpoint(state, target), true);
  assert.equal(exactRawCheckpoint({
    ...state,
    ordinaryContinuation: {
      ...state.ordinaryContinuation,
      identity: { ...candidate, repository: "other/Repository" },
    },
  }, target), false);
});
