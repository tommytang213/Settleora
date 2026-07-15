import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  advanceRecoveryPhase,
  bindOutageResubmissionToRecoveryState,
  bindRecoveryEvidence,
  classifyRecoveryOutcome,
  createInitialRecoveryState,
  headBoundEvidenceKinds,
  invalidateEvidenceForHeadChange,
  listRecoverableRecoveryStates,
  loadRecoveryState,
  recordIdempotentMutation,
  recordRecoveryAttempt,
  recoveryHasMutationMarker,
  recoveryOutcomeClasses,
  recoveryPhases,
  recoveryStatePath,
  recoverRecoveryState,
  retryBudgetStatus,
  writeRecoveryState,
} from "../lib/recovery-state.mjs";

function tempConfig() {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-recovery-state-"));
  return {
    logsRoot,
    cleanup: () => rmSync(logsRoot, { recursive: true, force: true }),
  };
}

function initial(overrides = {}) {
  return createInitialRecoveryState({
    taskKey: "20260713-1927",
    issue: { number: 893, title: "Recovery", url: "https://example.invalid/893" },
    runId: "run-2026-07-13T112700Z",
    supervisorRunId: "supervised-20260713T112700Z-abcdefabcdef",
    branchName: "tools/auto-runner-recovery-continuation-893-20260713-1927",
    baseSha: "b".repeat(40),
    currentHeadSha: "b".repeat(40),
    ...overrides,
  });
}

test("each recovery outcome class has stable reason code and next action", () => {
  for (const outcomeClass of recoveryOutcomeClasses) {
    const classified = classifyRecoveryOutcome(outcomeClass);
    assert.equal(classified.ok, true);
    assert.equal(classified.outcomeClass, outcomeClass);
    assert.equal(typeof classified.reasonCode, "string");
    assert.equal(typeof classified.nextAction, "string");
  }
  assert.equal(classifyRecoveryOutcome("not_real").reasonCode, "unknown_outcome_class");
});

test("recovery phases cover ordered runner continuation points", () => {
  for (const phase of [
    "issue_poll_claim",
    "branch_setup",
    "implementation_or_bundle_slice",
    "checkpoint_validation_commit",
    "aggregate_validation",
    "external_review",
    "codex_mechanics_security_review",
    "review_fix",
    "push",
    "pr_create_recover",
    "ci_wait",
    "ci_scanner_fix",
    "exact_head_final_refresh",
    "merge",
    "source_branch_restoration",
    "post_merge_current_main_checks_scanner_reconciliation",
    "issue_parent_ledger_hygiene",
    "completed",
    "stopped",
  ]) {
    assert.equal(recoveryPhases.includes(phase), true, phase);
  }
});

test("retry budgets are independent by failure class and fingerprint", () => {
  let state = initial();
  state = recordRecoveryAttempt(state, {
    outcomeClass: "retryable_infrastructure",
    fingerprint: "checks-timeout",
    reasonCode: "github_checks_timeout",
  });
  state = recordRecoveryAttempt(state, {
    outcomeClass: "retryable_provider",
    fingerprint: "gemini-429",
    reasonCode: "provider_rate_limited",
  });
  assert.equal(retryBudgetStatus(state, "retryable_infrastructure", "checks-timeout").remaining, 1);
  assert.equal(retryBudgetStatus(state, "retryable_provider", "gemini-429").remaining, 0);
  assert.equal(retryBudgetStatus(state, "retryable_infrastructure", "other").count, 0);
});

test("identical repeated failure exhausts bounded budget", () => {
  let state = initial();
  state = recordRecoveryAttempt(state, {
    outcomeClass: "retryable_infrastructure",
    fingerprint: "same-ci-outage",
    reasonCode: "runner_unavailable",
  });
  assert.equal(retryBudgetStatus(state, "retryable_infrastructure", "same-ci-outage").exhausted, false);
  state = recordRecoveryAttempt(state, {
    outcomeClass: "retryable_infrastructure",
    fingerprint: "same-ci-outage",
    reasonCode: "runner_unavailable",
  });
  const status = retryBudgetStatus(state, "retryable_infrastructure", "same-ci-outage");
  assert.equal(status.exhausted, true);
  assert.equal(state.stopReason.reasonCode, "retryable_infrastructure_budget_exhausted");
});

test("head change invalidates validation review CI scanner and merge evidence", () => {
  let state = initial();
  for (const kind of headBoundEvidenceKinds) {
    state = bindRecoveryEvidence(state, kind, {
      status: "passed",
      headSha: "b".repeat(40),
      baseSha: "a".repeat(40),
      changedFiles: ["tools/auto-runner/lib/recovery-state.mjs"],
    });
  }
  state = invalidateEvidenceForHeadChange(state, { newHeadSha: "c".repeat(40), reasonCode: "review_fix_committed" });
  for (const kind of headBoundEvidenceKinds) {
    assert.equal(state.evidence[kind].stale, true, kind);
    assert.equal(state.evidence[kind].invalidatedNewHeadSha, "c".repeat(40));
  }
  assert.equal(state.nextSafeAction, "regenerate_exact_head_evidence");
});

test("base or branch drift fails closed", () => {
  const config = tempConfig();
  try {
    const state = initial();
    writeRecoveryState(config, state);
    assert.equal(recoverRecoveryState(config, { ...state, branchName: "wrong" }).reasonCode, "recovery_branch_mismatch");
    assert.equal(recoverRecoveryState(config, { ...state, baseSha: "a".repeat(40) }).reasonCode, "recovery_base_mismatch");
    assert.equal(recoverRecoveryState(config, { ...state, currentHeadSha: "c".repeat(40) }).reasonCode, "recovery_head_mismatch");
    assert.equal(recoverRecoveryState(config, { ...state, worktreeClean: false }).reasonCode, "recovery_dirty_worktree");
  } finally {
    config.cleanup();
  }
});

test("corrupt partial missing and newer-version recovery state fails closed", () => {
  const config = tempConfig();
  try {
    const state = initial();
    const statePath = recoveryStatePath(config, state);
    assert.equal(loadRecoveryState(config, state).reasonCode, "recovery_state_missing");
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, "{not json");
    assert.equal(loadRecoveryState(config, state).reasonCode, "recovery_state_corrupt");
    writeFileSync(statePath, `${JSON.stringify({ ...state, stateVersion: 999 }, null, 2)}\n`);
    assert.equal(loadRecoveryState(config, state).reasonCode, "recovery_state_schema_invalid");
    writeFileSync(statePath, `${JSON.stringify({ ...state, branch: undefined }, null, 2)}\n`);
    assert.equal(loadRecoveryState(config, state).reasonCode, "recovery_state_schema_invalid");
  } finally {
    config.cleanup();
  }
});

test("sanitized state contains no raw prompts provider output secrets or log dumps", () => {
  const config = tempConfig();
  try {
    let state = initial();
    state = bindRecoveryEvidence(state, "externalReview", {
      headSha: "b".repeat(40),
      rawPrompt: "please print GEMINI_API_KEY=secret",
      providerResponse: "Bearer abc.def.ghi",
      summary: "authorization: Bearer abc.def.ghi token=secret",
    });
    const written = writeRecoveryState(config, state);
    const text = readFileSync(written.statePath, "utf8");
    assert.equal(text.includes("rawPrompt"), false);
    assert.equal(text.includes("providerResponse"), false);
    assert.equal(text.includes("GEMINI_API_KEY=secret"), false);
    assert.equal(text.includes("Bearer abc.def.ghi"), false);
    assert.equal(text.includes("token=secret"), false);
  } finally {
    config.cleanup();
  }
});

test("atomic write reload survives interrupted temporary-file scenarios", () => {
  const config = tempConfig();
  try {
    const state = initial();
    const written = writeRecoveryState(config, state);
    writeFileSync(`${written.statePath}.123.tmp`, "{partial");
    const loaded = loadRecoveryState(config, state);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.state.issue.number, 893);
    assert.equal(existsSync(`${written.statePath}.123.tmp`), true);
  } finally {
    config.cleanup();
  }
});

test("idempotent mutation markers prevent duplicate component mutations", () => {
  let state = initial();
  state = recordIdempotentMutation(state, {
    kind: "pr_create",
    key: "issue-893-pr",
    marker: { status: "completed", target: "https://example.invalid/pr/1", correlation: "20260713-1927" },
  });
  assert.equal(recoveryHasMutationMarker(state, "pr_create", "issue-893-pr"), true);
  assert.equal(recoveryHasMutationMarker(state, "merge", "issue-893-pr"), false);
});

test("outage resubmission binding is idempotent and conflict-safe", () => {
  const binding = {
    originalSupervisorSpecDigest: "a".repeat(64),
    markerKey: "b".repeat(64),
    outageFingerprint: "c".repeat(64),
    attemptNumber: 2,
  };
  const state = initial();
  const bound = bindOutageResubmissionToRecoveryState(state, binding);
  assert.equal(bound.ok, true);
  assert.equal(bound.changed, true);
  assert.equal(bound.state.outageResubmission.taskKey, state.taskKey);
  assert.equal(bound.state.outageResubmission.issueNumber, state.issue.number);
  assert.equal(bound.state.outageResubmission.runnerRunId, state.run.runId);
  assert.equal(bound.state.outageResubmission.supervisorRunId, state.run.supervisorRunId);
  assert.equal(bound.state.outageResubmission.originalSupervisorSpecDigest, binding.originalSupervisorSpecDigest);
  assert.equal(bound.state.outageResubmission.markerKey, binding.markerKey);
  assert.equal(bound.state.outageResubmission.outageFingerprint, binding.outageFingerprint);
  assert.equal(bound.state.outageResubmission.attemptNumber, binding.attemptNumber);

  const repeated = bindOutageResubmissionToRecoveryState(bound.state, binding);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.state.outageResubmission, bound.state.outageResubmission);

  const conflict = bindOutageResubmissionToRecoveryState(bound.state, { ...binding, markerKey: "d".repeat(64) });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reasonCode, "recovery_outage_binding_conflict");

  const invalid = bindOutageResubmissionToRecoveryState(state, { ...binding, attemptNumber: 0 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reasonCode, "recovery_outage_binding_invalid");
});

test("outage resubmission binding persists sanitized bytes", () => {
  const config = tempConfig();
  try {
    const state = initial();
    const bound = bindOutageResubmissionToRecoveryState(state, {
      originalSupervisorSpecDigest: "a".repeat(64),
      markerKey: "b".repeat(64),
      outageFingerprint: "c".repeat(64),
      attemptNumber: 1,
      rawBody: "secret raw payload",
      token: "secret-token",
    });
    const written = writeRecoveryState(config, bound.state);
    const text = readFileSync(written.statePath, "utf8");
    assert.equal(text.includes("rawBody"), false);
    assert.equal(text.includes("secret raw payload"), false);
    assert.equal(text.includes("secret-token"), false);
    assert.equal(loadRecoveryState(config, state).state.outageResubmission.markerKey, "b".repeat(64));
  } finally {
    config.cleanup();
  }
});

test("startup listing returns non-terminal recoverable states only", () => {
  const config = tempConfig();
  try {
    writeRecoveryState(config, initial({ issue: { number: 893, title: "A", url: "u" } }));
    writeRecoveryState(config, advanceRecoveryPhase(initial({ issue: { number: 894, title: "B", url: "u" } }), {
      phase: "completed",
      firstIncompleteAction: "none",
    }));
    const states = listRecoverableRecoveryStates(config);
    assert.equal(states.length, 1);
    assert.equal(states[0].issue.number, 893);
  } finally {
    config.cleanup();
  }
});
