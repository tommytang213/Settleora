import {
  advanceRecoveryPhase,
  classifyRecoveryOutcome,
  loadRecoveryState,
  listRecoverableRecoveryStates,
  recoveryRequiresExactHeadEvidenceRegeneration,
  recoveryHasMutationMarker,
  writeRecoveryState,
} from "./recovery-state.mjs";
import { assertMutationAuthority, completeSessionRotation, loadSessionLifecycleForRecovery, planInterruptionRecovery, persistSessionLifecycleState } from "./session-lifecycle.mjs";
import { collectAuthoritativeRecoveryEvidence, plannerInputsFromAuthoritativeEvidence } from "./authoritative-recovery-evidence.mjs";
import { findPreEffectIntents, handoffPreEffectIntentAuthority } from "./pre-effect-intent.mjs";

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

const unsafeDynamicHandlerKeys = new Set([
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "__proto__",
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "prototype",
  "toLocaleString",
  "toString",
  "valueOf",
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

export function discoverTargetedStartupRecovery(config) {
  const target = config.outageRecoveryTarget || null;
  if (!config.outageRecoveryOnly || !target) {
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: "outage_recovery_target_missing",
      states: [],
    };
  }
  const states = listRecoverableRecoveryStates(config);
  if (states.length === 0) {
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: "outage_recovery_target_missing",
      states: [],
    };
  }
  const partition = partitionRecoveryStatesByTarget(states, target);
  if (partition.exactMatches.length === 0) {
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: "outage_recovery_target_mismatch",
      states: [],
      stateCounts: partition.counts,
    };
  }
  if (partition.exactMatches.length > 1) {
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: "outage_recovery_target_ambiguous",
      states: partition.exactMatches.map(summarizeRecoverableState),
      stateCounts: partition.counts,
    };
  }
  const state = partition.exactMatches[0];
  if (!config.allowExistingPrRecovery) {
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: "recoverable_state_requires_explicit_recovery_capability",
      state: summarizeRecoverableState(state),
      states: partition.exactMatches.map(summarizeRecoverableState),
      stateCounts: partition.counts,
    };
  }
  const boundary = firstIncompleteContinuationAction(state);
  if (!boundary.ok) {
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: "outage_recovery_target_not_safe",
      state: summarizeRecoverableState(state),
      states: partition.exactMatches.map(summarizeRecoverableState),
      stateCounts: partition.counts,
    };
  }
  const regeneration = recoveryRequiresExactHeadEvidenceRegeneration(state);
  if (regeneration.required) {
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: regeneration.reasonCode,
      state: summarizeRecoverableState(state),
      states: partition.exactMatches.map(summarizeRecoverableState),
      stateCounts: partition.counts,
    };
  }
  return {
    found: true,
    allowed: true,
    action: "resume_recoverable_work",
    reasonCode: "outage_recovery_target_discovered",
    outcome: classifyRecoveryOutcome("pending", { reasonCode: "outage_recovery_target_discovered" }),
    state: summarizeRecoverableState(state),
    states: partition.exactMatches.map(summarizeRecoverableState),
    stateCounts: partition.counts,
    target,
  };
}

export async function executeStartupContinuation(config, recovery, handlers = {}) {
  if (!recovery?.allowed || !recovery.state) {
    return {
      ok: false,
      outcome: "blocked_recovery_state",
      reasonCode: recovery?.reasonCode || "recovery_not_allowed",
      recovery,
    };
  }
  const loaded = loadRecoveryState(config, recovery.state);
  if (!loaded.ok) {
    return {
      ok: false,
      outcome: "blocked_recovery_state",
      reasonCode: loaded.reasonCode,
      recovery,
    };
  }
  let state = loaded.state;
  const lifecycleRecovery = consumeStartupInterruptionPlanner(config, state, recovery.interruption || {});
  if (!lifecycleRecovery.ok) {
    return {
      ok: false,
      outcome: "blocked_recovery_state",
      reasonCode: lifecycleRecovery.reasonCode,
      recovery: { ...recovery, lifecycle: lifecycleRecovery },
    };
  }
  if (lifecycleRecovery.earliestSafePhase && lifecycleRecovery.earliestSafePhase !== state.phase) {
    state = advanceRecoveryPhase(state, {
      phase: lifecycleRecovery.earliestSafePhase,
      firstIncompleteAction: lifecycleRecovery.earliestSafePhase,
      nextSafeAction: lifecycleRecovery.earliestSafePhase,
    });
    writeRecoveryState(config, state);
  }
  const boundary = firstIncompleteContinuationAction(state);
  if (!boundary.ok) {
    return {
      ok: false,
      outcome: "blocked_recovery_state",
      reasonCode: boundary.reasonCode,
      recovery: { ...recovery, state: summarizeRecoverableState(state) },
    };
  }
  const controlCheck = selectOwnCallableHandler(handlers, "controlCheck");
  const control = controlCheck ? controlCheck(state) : { ok: true, action: "continue" };
  if (control?.action && control.action !== "continue") {
    const stopped = advanceRecoveryPhase(state, {
      phase: "stopped",
      firstIncompleteAction: boundary.firstIncompleteAction,
      nextSafeAction: control.action,
    });
    writeRecoveryState(config, { ...stopped, stopReason: { reasonCode: control.reasonCode || control.action, reason: control.reason || "" } });
    return {
      ok: true,
      outcome: "recovery_stopped_at_safe_boundary",
      reasonCode: control.reasonCode || control.action,
      recovery: { ...recovery, state: summarizeRecoverableState(stopped) },
    };
  }
  const handler =
    selectOwnCallableHandler(handlers, boundary.phase) ||
    selectOwnCallableHandler(handlers, boundary.nextSafeAction) ||
    selectOwnCallableHandler(handlers, "default");
  if (!handler) {
    return {
      ok: false,
      outcome: "blocked_recovery_state",
      reasonCode: "missing_recovery_phase_handler",
      recovery: { ...recovery, state: summarizeRecoverableState(state), boundary },
    };
  }
  const result = await handler({ state, boundary, loaded });
  return {
    ok: result?.ok !== false,
    outcome: result?.outcome || "recovery_continuation_executed",
    reasonCode: result?.reasonCode || "recovery_phase_executed",
    recovery: {
      ...recovery,
      action: "resume_recoverable_work",
      executedPhase: boundary.phase,
      executedAction: boundary.nextSafeAction,
      state: result?.state ? summarizeRecoverableState(result.state) : summarizeRecoverableState(state),
    },
    result,
  };
}

export function consumeStartupInterruptionPlanner(config, recoveryState, interruption = {}, evidenceAdapters = {}) {
  if (config.sessionLifecycle?.enabled !== true) return { ok: true, skipped: true, reasonCode: "session_lifecycle_disabled" };
  const identity = {
    repository: config.repositorySlug,
    issueNumber: recoveryState.issue?.number,
    taskKey: recoveryState.taskKey,
    runId: recoveryState.run?.runId,
    branchName: recoveryState.branch?.name,
    baseSha: recoveryState.branch?.baseSha,
    headSha: recoveryState.branch?.currentHeadSha,
  };
  const loaded = loadSessionLifecycleForRecovery(config, identity);
  if (!loaded.ok) return loaded;
  const pendingIntents = findPreEffectIntents(config, (intent) => !["finalized", "failed_closed"].includes(intent.status)
    && intent.repository === loaded.state.repository
    && intent.sourceTaskKey === loaded.state.logicalTask.taskKey
    && intent.runId === loaded.state.logicalTask.runId
    && intent.claimIdentity === loaded.state.logicalTask.claimIdentity);
  const authoritative = collectAuthoritativeRecoveryEvidence(config, {
    repository: loaded.state.repository,
    issueNumber: loaded.state.logicalTask.issueNumber,
    taskKey: loaded.state.logicalTask.taskKey,
    runId: loaded.state.logicalTask.runId,
    claimIdentity: loaded.state.logicalTask.claimIdentity,
    sessionId: loaded.state.sessions.current,
    supervisorRunId: recoveryState.run?.supervisorRunId,
    branchName: loaded.state.branch.name,
    baseBranch: recoveryState.branch?.baseBranch || "main",
    baseSha: loaded.state.branch.baseSha,
    headSha: loaded.state.branch.headSha,
    prNumber: recoveryState.pr?.number || null,
    checkpointDigest: loaded.state.checkpoint.digest,
    checkpointValid: true,
    authority: loaded.state.mutationAuthority,
  }, {
    sourceMutationPresent: hasAnyMutationMarker(recoveryState, "sourceMutation"),
    commitSha: hasAnyMutationMarker(recoveryState, "checkpoint_commit") ? recoveryState.branch?.currentHeadSha : null,
    commitMarker: hasAnyMutationMarker(recoveryState, "checkpoint_commit"),
    pushSha: hasAnyMutationMarker(recoveryState, "push") ? recoveryState.branch?.currentHeadSha : null,
    pushMarker: hasAnyMutationMarker(recoveryState, "push"),
    prHeadSha: recoveryState.pr?.headSha || null,
    mergedHeadSha: recoveryState.pr?.headSha || recoveryState.branch?.currentHeadSha,
    mergeMarker: hasAnyMutationMarker(recoveryState, "merge"),
    commentMarker: hasAnyMutationMarker(recoveryState, "issue_comment"),
    issueClosureMarker: hasAnyMutationMarker(recoveryState, "issue_close"),
    hygieneMarker: hasAnyMutationMarker(recoveryState, "ledger_hygiene"),
    issueNumber: recoveryState.issue?.number,
    preEffectIntentIds: pendingIntents.map((intent) => intent.intentId),
    commentFingerprints: pendingIntents.map((intent) => intent.effect?.contentFingerprint).filter(Boolean),
    commentCanonicalFingerprints: pendingIntents.map((intent) => intent.effect?.bodyDigest).filter(Boolean),
  }, evidenceAdapters);
  const inputs = plannerInputsFromAuthoritativeEvidence(authoritative);
  if (!inputs.ok) return { ...inputs, authoritativeEvidence: authoritative };
  const planned = planInterruptionRecovery(loaded.state, inputs.liveEffects, { ...inputs.interruption, ...interruption });
  if (!planned.ok) return planned;
  if (planned.active) return { ok: false, reasonCode: planned.reasonCode };
  const pending = persistSessionLifecycleState(config, planned.state);
  if (!pending.ok) return pending;
  const successorSessionId = `${planned.state.logicalTask.runId}:recovery:${planned.state.recovery.operationId}`;
  const completed = completeSessionRotation(pending.state, {
    requestId: pending.state.mutationAuthority.handoff?.requestId,
    newSessionId: successorSessionId,
  });
  if (!completed.ok) return completed;
  const authority = assertMutationAuthority(completed.state, successorSessionId);
  if (!authority.ok) return authority;
  const persisted = persistSessionLifecycleState(config, completed.state);
  if (!persisted.ok) return persisted;
  try {
    for (const intent of pendingIntents) {
      const classification = authoritative.intents.find((entry) => entry.intentId === intent.intentId)?.classification;
      if (intent.sessionId === successorSessionId && intent.authorityGeneration === authority.generation) continue;
      handoffPreEffectIntentAuthority(config, intent.intentId, { runId: loaded.state.logicalTask.runId, oldSessionId: intent.sessionId, oldAuthorityGeneration: intent.authorityGeneration, newSessionId: successorSessionId, newAuthorityGeneration: authority.generation, status: "active", resetForAuthoritativeAbsence: classification === "effect_absent_execution_uncertain" });
    }
  } catch {
    return { ok: false, reasonCode: "pre_effect_intent_authority_handoff_failed", state: persisted.state };
  }
  return { ...planned, state: persisted.state, statePath: persisted.statePath, successorSessionId, mutationGeneration: authority.generation, handedOffIntentIds: pendingIntents.map((intent) => intent.intentId) };
}

function hasAnyMutationMarker(state, kind) {
  const markers = state?.mutationMarkers?.[kind];
  return Boolean(markers && typeof markers === "object" && Object.keys(markers).length > 0);
}

function selectOwnCallableHandler(handlers, key) {
  if (!handlers || typeof handlers !== "object" || typeof key !== "string" || key.length === 0) {
    return null;
  }
  if (unsafeDynamicHandlerKeys.has(key)) {
    return null;
  }
  if (!Object.hasOwn(handlers, key)) {
    return null;
  }
  const handler = handlers[key];
  return typeof handler === "function" ? handler : null;
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

export function projectStartupRecoveryIssueIdentity(recovery = {}, continuation = {}) {
  const issueNumber = recovery?.state?.issueNumber;
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    return { ok: false, reasonCode: "startup_recovery_issue_identity_missing", issue: null };
  }
  const projectedCandidates = [
    continuation?.result?.issue?.number,
    continuation?.result?.existingPrRecovery?.issue?.number,
    continuation?.result?.autoMerge?.issueNumber,
  ].filter((value) => value !== undefined && value !== null);
  if (projectedCandidates.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    return { ok: false, reasonCode: "startup_recovery_issue_identity_malformed", issue: null };
  }
  if (projectedCandidates.some((value) => value !== issueNumber)) {
    return { ok: false, reasonCode: "startup_recovery_issue_identity_conflict", issue: null };
  }
  return { ok: true, reasonCode: "startup_recovery_issue_identity_validated", issue: { number: issueNumber } };
}

export function shouldAdvanceFixtureIssueCursor(iteration) {
  return Boolean(iteration?.issue?.number) && iteration?.issueSource !== "startup_recovery";
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

function partitionRecoveryStatesByTarget(states, target) {
  const exactMatches = [];
  let nonMatchCount = 0;
  for (const state of states) {
    const comparison = compareRecoveryStateToTarget(state, target);
    if (comparison.ok) {
      exactMatches.push(state);
    } else {
      nonMatchCount += 1;
    }
  }
  return {
    exactMatches,
    counts: {
      totalRecoverableCount: states.length,
      exactMatchingCount: exactMatches.length,
      ignoredNonmatchingCount: nonMatchCount,
    },
  };
}

function compareRecoveryStateToTarget(state, target) {
  const checks = [
    ["taskKey", state.taskKey || null, target.taskKey],
    ["issueNumber", state.issue?.number || null, target.issueNumber],
    ["branchName", state.branch?.name || null, target.branchName],
    ["baseSha", state.branch?.baseSha || null, target.baseSha],
    ["currentHeadSha", state.branch?.currentHeadSha || null, target.currentHeadSha],
    ["prNumber", state.pr?.number || null, target.prNumber],
    ["prHeadSha", state.pr?.headSha || null, target.prHeadSha],
    ["runnerRunId", state.run?.runId || null, target.runnerRunId],
    ["supervisorRunId", state.run?.supervisorRunId || null, target.supervisorRunId],
    ["originalSupervisorSpecDigest", state.outageResubmission?.originalSupervisorSpecDigest || null, target.originalSupervisorSpecDigest],
    ["markerKey", state.outageResubmission?.markerKey || null, target.markerKey],
    ["outageFingerprint", state.outageResubmission?.outageFingerprint || null, target.outageFingerprint],
    ["attemptNumber", state.outageResubmission?.attemptNumber || null, target.attemptNumber],
  ];
  const mismatch = checks.find(([, actual, expected]) => actual !== expected);
  if (mismatch) return { ok: false, reasonCode: "outage_recovery_target_mismatch", field: mismatch[0] };
  return { ok: true };
}
