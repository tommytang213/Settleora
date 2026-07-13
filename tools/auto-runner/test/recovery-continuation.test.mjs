import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  advanceRecoveryPhase,
  createInitialRecoveryState,
  recordIdempotentMutation,
  writeRecoveryState,
} from "../lib/recovery-state.mjs";
import {
  discoverStartupRecovery,
  evaluateCompletionHygieneResume,
  evaluateControlAtRecoveryBoundary,
  firstIncompleteContinuationAction,
  nextBundleSliceFromCheckpoint,
  planIdempotentGithubMutation,
  recoveryStatusSummary,
  shouldSkipCompletedBundleSlice,
} from "../lib/recovery-continuation.mjs";

function tempConfig(extra = {}) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-recovery-continuation-"));
  return {
    logsRoot,
    allowExistingPrRecovery: false,
    cleanup: () => rmSync(logsRoot, { recursive: true, force: true }),
    ...extra,
  };
}

function state(overrides = {}) {
  return createInitialRecoveryState({
    taskKey: "20260713-1927",
    issue: { number: 893, title: "Recovery", url: "https://example.invalid/893" },
    runId: "run-2026-07-13T112700Z",
    supervisorRunId: "supervised-20260713T112700Z-abcdefabcdef",
    branchName: "tools/auto-runner-recovery-continuation-893-20260713-1927",
    baseSha: "b".repeat(40),
    currentHeadSha: "c".repeat(40),
    ...overrides,
  });
}

test("startup resumes recoverable work before polling a new issue", () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    writeRecoveryState(config, state());
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.found, true);
    assert.equal(discovery.allowed, true);
    assert.equal(discovery.action, "resume_recoverable_work");
    assert.equal(discovery.state.issueNumber, 893);
  } finally {
    config.cleanup();
  }
});

test("startup blocks stale active recovery state when capability is default-off", () => {
  const config = tempConfig();
  try {
    writeRecoveryState(config, state());
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.found, true);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "recoverable_state_requires_explicit_recovery_capability");
  } finally {
    config.cleanup();
  }
});

test("multiple recoverable active states fail closed", () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    writeRecoveryState(config, state({ issue: { number: 893, title: "A", url: "u" } }));
    writeRecoveryState(config, state({ issue: { number: 891, title: "B", url: "u" }, branchName: "feature/auto-891-b" }));
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "multiple_recoverable_states");
  } finally {
    config.cleanup();
  }
});

test("interruption at major phase resumes first incomplete phase", () => {
  for (const phase of ["external_review", "ci_wait", "merge", "issue_parent_ledger_hygiene"]) {
    const resumed = firstIncompleteContinuationAction(
      advanceRecoveryPhase(state(), { phase, firstIncompleteAction: `${phase}_next` }),
    );
    assert.equal(resumed.ok, true);
    assert.equal(resumed.nextSafeAction, `${phase}_next`);
  }
});

test("completed phase is never re-executed via idempotent mutation markers", () => {
  let recovery = state();
  recovery = recordIdempotentMutation(recovery, { kind: "pr_comment", key: "status-20260713-1927" });
  const plan = planIdempotentGithubMutation(recovery, {
    kind: "pr_comment",
    key: "status-20260713-1927",
    target: "PR #905",
  });
  assert.equal(plan.mutate, false);
  assert.equal(plan.action, "skip_existing_marker");
});

test("feature-bundle completed slice is never rerun and incomplete slice resumes from checkpoint", () => {
  const bundle = {
    sliceOrder: ["slice-one", "slice-two", "slice-three"],
    slices: {
      "slice-one": { state: "completed", commitSha: "a".repeat(40) },
      "slice-two": { state: "started", commitSha: null },
      "slice-three": { state: "pending", commitSha: null },
    },
  };
  assert.equal(shouldSkipCompletedBundleSlice(bundle, "slice-one"), true);
  const next = nextBundleSliceFromCheckpoint(bundle);
  assert.equal(next.nextSliceId, "slice-two");
  assert.deepEqual(next.completedSliceIds, ["slice-one"]);
});

test("generated issue and comment mutation planning is idempotent", () => {
  let recovery = state();
  recovery = recordIdempotentMutation(recovery, { kind: "followup_issue", key: "review:abc" });
  recovery = recordIdempotentMutation(recovery, { kind: "issue_comment", key: "893-status" });
  assert.equal(planIdempotentGithubMutation(recovery, { kind: "followup_issue", key: "review:abc" }).mutate, false);
  assert.equal(planIdempotentGithubMutation(recovery, { kind: "issue_comment", key: "893-status" }).mutate, false);
  assert.equal(planIdempotentGithubMutation(recovery, { kind: "parent_comment", key: "800-progress" }).mutate, true);
});

test("merge is not repeated after confirmed marker", () => {
  const recovery = recordIdempotentMutation(state(), { kind: "merge", key: "pr-905-head-c" });
  assert.equal(planIdempotentGithubMutation(recovery, { kind: "merge", key: "pr-905-head-c" }).mutate, false);
});

test("pause and stop controls act only at safe boundaries", () => {
  assert.equal(evaluateControlAtRecoveryBoundary(state(), { pause: true }).action, "pause_at_safe_boundary");
  assert.equal(evaluateControlAtRecoveryBoundary(state(), { stopAfterCurrent: true }).action, "stop_after_current_boundary");
  assert.equal(
    evaluateControlAtRecoveryBoundary(advanceRecoveryPhase(state(), { phase: "completed", firstIncompleteAction: "none" })).reasonCode,
    "not_safe_boundary",
  );
});

test("supervisor restart preserves run task and report correlation in status summary", () => {
  const summary = recoveryStatusSummary(state());
  assert.equal(summary.taskKey, "20260713-1927");
  assert.equal(summary.runId, "run-2026-07-13T112700Z");
  assert.equal(summary.supervisorRunId, "supervised-20260713T112700Z-abcdefabcdef");
});

test("stale active lock style multiple recovery blocks and manual decisions mutate nothing", () => {
  const blocked = firstIncompleteContinuationAction(advanceRecoveryPhase(state(), { phase: "stopped", firstIncompleteAction: "manual" }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reasonCode, "not_safe_boundary");
});

test("completion hygiene resumes component-by-component without duplicates", () => {
  let recovery = state();
  recovery = recordIdempotentMutation(recovery, { kind: "issue_comment", key: "893-complete" });
  const resume = evaluateCompletionHygieneResume(recovery, [
    { kind: "issue_comment", key: "893-complete" },
    { kind: "parent_comment", key: "800-progress" },
    { kind: "ledger_hygiene", key: "893-ledger" },
  ]);
  assert.equal(resume.completed.length, 1);
  assert.equal(resume.pending.length, 2);
  assert.equal(resume.nextComponent.key, "800-progress");
});

test("ordinary and bundle paths share recovery summary shape", () => {
  const ordinary = recoveryStatusSummary(state());
  const bundle = recoveryStatusSummary({ ...state(), featureBundle: { bundleId: "bundle-893" } });
  assert.equal(ordinary.phase, bundle.phase);
  assert.equal(ordinary.nextSafeAction, bundle.nextSafeAction);
});

test("status summary remains bounded and sanitized", () => {
  const summary = recoveryStatusSummary({
    ...state(),
    rawPrompt: "GEMINI_API_KEY=secret",
    providerResponse: "Bearer abc",
  });
  assert.equal(Object.hasOwn(summary, "rawPrompt"), false);
  assert.equal(Object.hasOwn(summary, "providerResponse"), false);
  assert.equal(summary.branchName.includes("20260713-1927"), true);
});
