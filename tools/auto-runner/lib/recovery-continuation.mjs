import { classifyRecoveryOutcome, listRecoverableRecoveryStates, recoveryHasMutationMarker } from "./recovery-state.mjs";

export const safeBoundaryPhases = Object.freeze([
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
]);

export function discoverStartupRecovery(config) {
  const states = listRecoverableRecoveryStates(config);
  if (states.length === 0) {
    return { found: false, action: "poll_eligible_issues", states: [] };
  }
  const active = states[0];
  if (states.length > 1) {
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: "multiple_recoverable_states",
      outcome: classifyRecoveryOutcome("unsafe_or_ambiguous", { reasonCode: "multiple_recoverable_states" }),
      states: states.map(summarizeRecoverableState),
    };
  }
  if (!config.allowExistingPrRecovery) {
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: "recoverable_state_requires_explicit_recovery_capability",
      outcome: classifyRecoveryOutcome("manual_action_required", {
        reasonCode: "recoverable_state_requires_explicit_recovery_capability",
      }),
      state: summarizeRecoverableState(active),
      states: states.map(summarizeRecoverableState),
    };
  }
  return {
    found: true,
    allowed: true,
    action: "resume_recoverable_work",
    reasonCode: "recoverable_state_discovered",
    outcome: classifyRecoveryOutcome("pending", { reasonCode: "recoverable_state_discovered" }),
    state: summarizeRecoverableState(active),
    states: states.map(summarizeRecoverableState),
  };
}

export function firstIncompleteContinuationAction(state) {
  if (!state) return { ok: false, reasonCode: "missing_recovery_state" };
  if (!safeBoundaryPhases.includes(state.phase)) {
    return { ok: false, reasonCode: "not_safe_boundary", phase: state.phase };
  }
  return {
    ok: true,
    phase: state.phase,
    firstIncompleteAction: state.firstIncompleteAction,
    nextSafeAction: state.nextSafeAction || state.firstIncompleteAction,
  };
}

export function shouldSkipCompletedBundleSlice(bundleState, sliceId) {
  const slice = bundleState?.slices?.[sliceId];
  return Boolean(slice && slice.state === "completed" && slice.commitSha);
}

export function nextBundleSliceFromCheckpoint(bundleState) {
  if (!bundleState?.sliceOrder?.length) return { ok: false, reasonCode: "missing_bundle_slice_order" };
  const nextSliceId = bundleState.sliceOrder.find((sliceId) => !shouldSkipCompletedBundleSlice(bundleState, sliceId)) || null;
  return {
    ok: true,
    nextSliceId,
    completedSliceIds: bundleState.sliceOrder.filter((sliceId) => shouldSkipCompletedBundleSlice(bundleState, sliceId)),
  };
}

export function planIdempotentGithubMutation(state, { kind, key, target }) {
  if (recoveryHasMutationMarker(state, kind, key)) {
    return { action: "skip_existing_marker", kind, key, target, mutate: false };
  }
  return { action: "perform_once", kind, key, target, mutate: true };
}

export function evaluateCompletionHygieneResume(state, components = []) {
  const pending = components.filter((component) => !recoveryHasMutationMarker(state, component.kind, component.key));
  return {
    pending,
    completed: components.filter((component) => recoveryHasMutationMarker(state, component.kind, component.key)),
    nextComponent: pending[0] || null,
  };
}

export function evaluateControlAtRecoveryBoundary(state, control = {}) {
  const boundary = firstIncompleteContinuationAction(state);
  if (!boundary.ok) return { ok: false, action: "stop_fail_closed", reasonCode: boundary.reasonCode };
  if (control.pause) return { ok: true, action: "pause_at_safe_boundary", reasonCode: "operator_pause" };
  if (control.stopAfterCurrent) return { ok: true, action: "stop_after_current_boundary", reasonCode: "operator_stop_after_current" };
  return { ok: true, action: "continue", reasonCode: "safe_boundary_continue" };
}

export function recoveryStatusSummary(input = {}) {
  const state = input.state || (input.stateVersion ? input : null);
  if (!state) return { active: false };
  return summarizeRecoverableState(state);
}

function summarizeRecoverableState(state) {
  return {
    active: true,
    taskKey: state.taskKey || null,
    issueNumber: state.issue?.number || null,
    branchName: state.branch?.name || null,
    baseSha: state.branch?.baseSha || null,
    currentHeadSha: state.branch?.currentHeadSha || null,
    prNumber: state.pr?.number || null,
    prUrl: state.pr?.url || null,
    phase: state.phase || null,
    firstIncompleteAction: state.firstIncompleteAction || null,
    nextSafeAction: state.nextSafeAction || null,
    stopReason: state.stopReason || null,
    attemptClass: state.attempts?.at(-1)?.outcomeClass || null,
    blocker: state.stopReason?.reasonCode || null,
    runId: state.run?.runId || null,
    supervisorRunId: state.run?.supervisorRunId || null,
  };
}
