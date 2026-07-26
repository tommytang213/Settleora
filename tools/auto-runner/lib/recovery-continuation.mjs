import path from "node:path";
import {
  advanceRecoveryPhase,
  classifyRecoveryOutcome,
  loadRecoveryState,
  listRecoverableRecoveryStates,
  recoveryRequiresExactHeadEvidenceRegeneration,
  recoveryHasMutationMarker,
  writeRecoveryState,
} from "./recovery-state.mjs";
import { assertMutationAuthority, completeSessionRotation, loadSessionLifecycleForRecovery, migrateRecoveryStateToSessionLifecycle, planInterruptionRecovery, persistSessionLifecycleState, transitionSessionLifecyclePhase } from "./session-lifecycle.mjs";
import { collectAuthoritativeRecoveryEvidence, plannerInputsFromAuthoritativeEvidence } from "./authoritative-recovery-evidence.mjs";
import { findPreEffectIntents, handoffPreEffectIntentAuthority, intentIssueAuthorityMatches } from "./pre-effect-intent.mjs";
import { loadLogicalTaskBudget } from "./logical-task-budget.mjs";

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
  "post_merge_ephemeral_cleanup",
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
  const validationRetryTerminal = isValidationFailureRetryAuthorized(loaded.state) ? loaded.state : null;
  let state = normalizeValidationFailureContinuation(loaded.state);
  const lifecycleRecovery = consumeStartupInterruptionPlanner(config, state, recovery.interruption || {});
  if (!lifecycleRecovery.ok) {
    return {
      ok: false,
      outcome: "blocked_recovery_state",
      reasonCode: lifecycleRecovery.reasonCode,
      recovery: { ...recovery, lifecycle: lifecycleRecovery },
    };
  }
  if (lifecycleRecovery.terminal) {
    state = advanceRecoveryPhase(state, {
      phase: lifecycleRecovery.terminalPhase,
      firstIncompleteAction: `lifecycle_${lifecycleRecovery.terminalPhase}`,
      nextSafeAction: `lifecycle_${lifecycleRecovery.terminalPhase}`,
    });
    state = { ...state, sessionLifecycle: lifecycleRecovery.state };
    writeRecoveryState(config, state);
    return {
      ok: true,
      outcome: "terminal_lifecycle_reconciled",
      reasonCode: lifecycleRecovery.reasonCode,
      recovery: { ...recovery, lifecycle: lifecycleRecovery, state: summarizeRecoverableState(state) },
      result: { terminalPhase: lifecycleRecovery.terminalPhase },
    };
  }
  if (lifecycleRecovery.state) state = { ...state, sessionLifecycle: lifecycleRecovery.state };
  if (lifecycleRecovery.earliestSafePhase && lifecycleRecovery.earliestSafePhase !== state.phase) {
    state = advanceRecoveryPhase(state, {
      phase: lifecycleRecovery.earliestSafePhase,
      firstIncompleteAction: lifecycleRecovery.earliestSafePhase,
      nextSafeAction: lifecycleRecovery.earliestSafePhase,
    });
  }
  writeRecoveryState(config, state);
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
  if (validationRetryTerminal && isRepeatedUnsafeValidationResult(result)) {
    const current = loadRecoveryState(config, recovery.state);
    let terminal = {
      ...(current.ok ? current.state : state),
      phase: "stopped",
      firstIncompleteAction: validationRetryTerminal.firstIncompleteAction,
      nextSafeAction: "stop_fail_closed",
      stopReason: {
        reasonCode: "checkpoint_validation_recovery_failed_closed",
        reason: result?.reasonCode || validationRetryTerminal.stopReason?.reason || "Recovered validation remained unsafe or unclassified.",
      },
    };
    if (terminal.sessionLifecycle) {
      const lifecycleTerminal = transitionSessionLifecyclePhase(config, terminal.sessionLifecycle, {
        phase: "stopped",
        nextExactAction: "checkpoint_validation_recovery_failed_closed",
      });
      if (!lifecycleTerminal.ok) {
        result.reasonCode = lifecycleTerminal.reasonCode;
        return {
          ok: false,
          outcome: "blocked_recovery_state",
          reasonCode: lifecycleTerminal.reasonCode,
          recovery: { ...recovery, state: summarizeRecoverableState(current.ok ? current.state : state) },
          result,
        };
      }
      terminal = { ...terminal, sessionLifecycle: lifecycleTerminal.state };
    }
    writeRecoveryState(config, terminal);
    result.state = terminal;
  }
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
  const identity = {
    repository: config.repositorySlug,
    issueNumber: recoveryState.issue?.number,
    taskKey: recoveryState.taskKey,
    runId: recoveryState.run?.runId,
    supervisorRunId: recoveryState.run?.supervisorRunId,
    branchName: recoveryState.branch?.name,
    baseSha: recoveryState.branch?.baseSha,
    headSha: recoveryState.branch?.currentHeadSha,
  };
  if (config.sessionLifecycle?.enabled !== true) {
    if (!config.logsRoot) return { ok: true, skipped: true, reasonCode: "session_lifecycle_disabled" };
    const existing = loadSessionLifecycleForRecovery(config, identity);
    if (existing.ok) return { ok: false, reasonCode: "session_lifecycle_disabled_existing_state" };
    if (existing.reasonCode !== "session_lifecycle_state_missing") return existing;
    return { ok: true, skipped: true, reasonCode: "session_lifecycle_disabled" };
  }
  if (config.sessionLifecycle?.allowRecoveryTakeover !== true) return { ok: false, reasonCode: "session_lifecycle_recovery_takeover_disabled" };
  let loaded = loadSessionLifecycleForRecovery(config, identity);
  if (!loaded.ok && loaded.reasonCode === "session_lifecycle_state_missing") {
    loaded = reconstructMissingSessionLifecycle(config, recoveryState, identity);
  }
  if (!loaded.ok) return loaded;
  const taskIntents = findPreEffectIntents(config, (intent) => intent.repository === loaded.state.repository
    && intent.sourceTaskKey === loaded.state.logicalTask.taskKey
    && intent.runId === loaded.state.logicalTask.runId);
  if (taskIntents.some((intent) => !intentMatchesRecoveryAuthority(intent, {
    issueNumber: loaded.state.logicalTask.issueNumber,
    claimIdentity: loaded.state.logicalTask.claimIdentity,
    chargeIdentity: loaded.state.logicalTask.chargeMarkerRef,
    branchName: loaded.state.branch.name,
    baseSha: loaded.state.branch.baseSha,
    headSha: loaded.state.branch.headSha,
  }))) return { ok: false, reasonCode: "session_lifecycle_intent_identity_mismatch" };
  const pendingIntents = taskIntents.filter((intent) => !["finalized", "failed_closed"].includes(intent.status));
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
    // Finalized intents are still authoritative crash-window evidence. A process can
    // exit after the canonical effect is finalized but before the legacy marker is
    // persisted, so excluding them would incorrectly rewind already-completed work.
    preEffectIntentIds: taskIntents.map((intent) => intent.intentId),
    commentFingerprints: taskIntents.map((intent) => intent.effect?.contentFingerprint).filter(Boolean),
    commentCanonicalFingerprints: taskIntents.map((intent) => intent.effect?.bodyDigest).filter(Boolean),
  }, evidenceAdapters);
  const inputs = plannerInputsFromAuthoritativeEvidence(authoritative);
  if (!inputs.ok) return { ...inputs, authoritativeEvidence: authoritative };
  const reconciledLifecycle = reconcileAuthoritativeLifecycleHead(loaded.state, authoritative);
  if (!reconciledLifecycle.ok) return reconciledLifecycle;
  let lifecycleState = reconciledLifecycle.state;
  if (reconciledLifecycle.changed) {
    const headPersisted = persistSessionLifecycleState(config, lifecycleState);
    if (!headPersisted.ok) return headPersisted;
    lifecycleState = headPersisted.state;
  }
  const trustedInterruption = loaded.migrated === true
    ? { processExited: true, terminalReportTrusted: false, checkpointValid: true, ...inputs.interruption, ...interruption }
    : { ...inputs.interruption, ...interruption };
  const planned = planInterruptionRecovery(lifecycleState, inputs.liveEffects, trustedInterruption);
  if (!planned.ok) return planned;
  if (planned.active) return { ok: false, reasonCode: planned.reasonCode };
  if (planned.terminal) return { ...planned, state: lifecycleState, statePath: loaded.statePath };
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

function normalizeValidationFailureContinuation(state) {
  if (!isValidationFailureRetryAuthorized(state)) return state;
  // This legacy stop shape is not authority to change source. It re-enters only
  // the validation checkpoint so the preserved candidate can be classified
  // under the now-available production toolchain; implementation stays skipped.
  const nextAction = "run_validation_and_commit";
  return advanceRecoveryPhase({ ...state, stopReason: null }, {
    phase: "checkpoint_validation_commit",
    firstIncompleteAction: nextAction,
    nextSafeAction: nextAction,
  });
}

function isValidationFailureRetryAuthorized(state) {
  const findings = state?.ordinaryContinuation?.sourceFailureBatch?.findings;
  return state?.phase === "stopped"
    && state?.evidence?.localValidation?.status === "failed"
    && Array.isArray(findings)
    && findings.length > 0
    && state.branch?.currentHeadSha === state.ordinaryContinuation?.identity?.headSha
    && state.stopReason?.reasonCode === "checkpoint_validation_not_source_fix_safe"
    && state.firstIncompleteAction === "run_validation_and_commit"
    && state.nextSafeAction === "stop_fail_closed"
    && findings.every((finding) => finding?.sourceFixEligible === false
      && finding?.nextAction === "stop_fail_closed"
      && finding?.classification === "unsafe_or_ambiguous");
}

function isRepeatedUnsafeValidationResult(result) {
  const continuation = result?.ordinaryContinuation
    || result?.state?.ordinaryContinuation
    || result?.state;
  const findings = continuation?.sourceFailureBatch?.findings;
  return result?.ok === false
    && continuation?.phase === "local_validation"
    && Array.isArray(findings)
    && findings.length > 0
    && findings.every((finding) => finding?.sourceFixEligible === false
      && finding?.nextAction === "stop_fail_closed"
      && finding?.classification === "unsafe_or_ambiguous");
}

export function reconstructMissingSessionLifecycle(config, recoveryState, identity) {
  const claimIdentity = `${config.repositorySlug}#${identity.issueNumber}`;
  const recoverySupervisorRunId = recoveryState.run?.supervisorRunId || null;
  const budgetScopeId = recoverySupervisorRunId || recoveryState.run?.runId;
  if (!budgetScopeId || (identity.supervisorRunId || null) !== recoverySupervisorRunId) {
    return { ok: false, reasonCode: "session_lifecycle_migration_supervisor_mismatch" };
  }
  const claimMarker = recoveryState.mutationMarkers?.claim?.[`issue-${identity.issueNumber}`];
  const branchMarkerKey = `${identity.branchName}:${identity.baseSha}`;
  const branchMarker = recoveryState.mutationMarkers?.branch_ownership_created?.[branchMarkerKey];
  if (Object.keys(recoveryState.mutationMarkers?.claim || {}).length !== 1
    || claimMarker?.status !== "completed"
    || claimMarker?.correlation !== identity.runId
    || Object.keys(recoveryState.mutationMarkers?.branch_ownership_created || {}).length !== 1
    || branchMarker?.status !== "completed"
    || branchMarker?.target !== identity.branchName
    || branchMarker?.correlation !== identity.baseSha) {
    return { ok: false, reasonCode: "session_lifecycle_migration_ownership_mismatch" };
  }
  const continuationIdentity = recoveryState.ordinaryContinuation?.identity;
  const sourceFailureCandidate = recoveryState.ordinaryContinuation?.sourceFailureBatch?.candidate;
  if (continuationIdentity?.baseSha !== identity.baseSha
    || continuationIdentity?.headSha !== identity.headSha
    || (identity.headSha !== identity.baseSha
      && (sourceFailureCandidate?.baseSha !== identity.baseSha
        || sourceFailureCandidate?.headSha !== identity.headSha))) {
    return { ok: false, reasonCode: "session_lifecycle_migration_candidate_mismatch" };
  }
  const budget = loadLogicalTaskBudget(config, budgetScopeId);
  if (!budget.ok) return { ok: false, reasonCode: budget.reasonCode };
  const chargeIds = Object.entries(budget.state.charges || {}).filter(([, marker]) =>
    marker.identity?.repository === config.repositorySlug
      && marker.identity?.issueNumber === identity.issueNumber
      && marker.identity?.taskLineageId === `issue-${identity.issueNumber}`
      && marker.identity?.claimIdentity === claimIdentity);
  const recoveryChargeIds = Object.keys(recoveryState.mutationMarkers?.logical_task_charge || {});
  const chargeMarker = recoveryState.mutationMarkers?.logical_task_charge?.[recoveryChargeIds[0]];
  if (chargeIds.length !== 1 || recoveryChargeIds.length !== 1 || chargeIds[0][0] !== recoveryChargeIds[0]
    || chargeMarker?.status !== "completed"
    || chargeMarker?.target !== `issue-${identity.issueNumber}`
    || chargeMarker?.correlation !== recoveryChargeIds[0]) {
    return { ok: false, reasonCode: "session_lifecycle_migration_charge_mismatch" };
  }
  const reportPath = recoveryState.expectedReportPaths?.repoReportPath;
  const promptPath = recoveryState.expectedReportPaths?.promptPath;
  const reportRoot = path.join(config.repoRoot, ".codex", "reports");
  const promptRoot = path.join(config.logsRoot, "tasks");
  const reportPrefix = `settleora-codex-report-${identity.taskKey}-issue-${identity.issueNumber}-`;
  const promptPrefix = `${identity.taskKey}-issue-${identity.issueNumber}-`;
  if (!isCanonicalCorrelatedPath(reportPath, reportRoot, reportPrefix)
    || !isCanonicalCorrelatedPath(promptPath, promptRoot, promptPrefix)) {
    return { ok: false, reasonCode: "session_lifecycle_migration_report_correlation_mismatch" };
  }
  let intents;
  try {
    intents = findPreEffectIntents(config, (intent) => intent.repository === config.repositorySlug
      && intent.sourceTaskKey === identity.taskKey
      && intent.runId === identity.runId);
  } catch {
    return { ok: false, reasonCode: "session_lifecycle_migration_intent_state_untrusted" };
  }
  if (intents.some((intent) => !intentMatchesRecoveryAuthority(intent, {
    issueNumber: identity.issueNumber,
    claimIdentity,
    chargeIdentity: budget.statePath,
    branchName: identity.branchName,
    baseSha: identity.baseSha,
    headSha: identity.headSha,
  }))) return { ok: false, reasonCode: "session_lifecycle_migration_intent_identity_mismatch" };
  if (intents.some((intent) => !["finalized", "failed_closed"].includes(intent.status))) {
    return { ok: false, reasonCode: "session_lifecycle_migration_pending_intents" };
  }
  const counters = recoveryState.ordinaryContinuation?.counters;
  if (!counters || counters.acceptedLogicalTasks !== 1
    || !["localSourceChangingRoundsPerEpoch", "githubTriggeredFixEpochsPerPr", "lifetimeLocalSourceChangingRounds"]
      .every((key) => Number.isSafeInteger(counters[key]) && counters[key] >= 0)) {
    return { ok: false, reasonCode: "session_lifecycle_migration_counter_mismatch" };
  }
  const migrated = migrateRecoveryStateToSessionLifecycle(recoveryState, {
    repository: config.repositorySlug,
    issueNumber: identity.issueNumber,
    taskKey: identity.taskKey,
    runId: identity.runId,
    supervisorRunId: recoverySupervisorRunId,
    claimIdentity,
    chargeMarkerRef: budget.statePath,
    sessionId: `${identity.runId}:recovery-bootstrap:1`,
    branchName: identity.branchName,
    baseSha: identity.baseSha,
    headSha: identity.headSha,
    localSourceChangingRoundsPerEpoch: counters.localSourceChangingRoundsPerEpoch,
    githubTriggeredFixEpochsPerPr: counters.githubTriggeredFixEpochsPerPr,
    lifetimeLocalSourceChangingRounds: counters.lifetimeLocalSourceChangingRounds,
    reportPath,
    reportCorrelationKey: identity.taskKey,
  });
  if (!migrated.ok) return migrated;
  const written = persistSessionLifecycleState(config, migrated.state);
  if (!written.ok) return written;
  const readback = loadSessionLifecycleForRecovery(config, identity);
  return readback.ok ? { ...readback, migrated: true } : readback;
}

function isCanonicalCorrelatedPath(candidate, root, requiredPrefix) {
  if (typeof candidate !== "string" || typeof root !== "string") return false;
  const resolved = path.resolve(candidate);
  return path.dirname(resolved) === path.resolve(root)
    && path.basename(resolved).startsWith(requiredPrefix)
    && path.basename(resolved).endsWith(".md");
}

export function intentMatchesRecoveryAuthority(intent, expected) {
  const identity = intent?.identity;
  return intent.logicalTaskIdentity === expected.claimIdentity
    && intent.claimIdentity === expected.claimIdentity
    && intent.chargeIdentity === expected.chargeIdentity
    && identity?.repository === intent.repository
    && identity?.sourceTaskKey === intent.sourceTaskKey
    && identity?.runId === intent.runId
    && identity?.logicalTaskIdentity === expected.claimIdentity
    && identity?.claimIdentity === expected.claimIdentity
    && identity?.chargeIdentity === expected.chargeIdentity
    // Canonical commit intents are task/claim/charge/branch effects and may omit
    // the nested issue projection. An explicit contradiction still fails closed.
    // Every non-commit effect remains issue-bound.
    && intentIssueAuthorityMatches(intent, expected.issueNumber)
    && identity?.branchName === expected.branchName
    && identity?.baseSha === expected.baseSha
    // Intent heads describe effect-time state (a commit intent uses its parent),
    // so live authoritative reconciliation validates them against the effect.
    // Stable task/charge/branch/base authority remains exact here.
    && /^[a-f0-9]{40}$/.test(String(identity?.headSha || ""));
}

export function reconcileAuthoritativeLifecycleHead(state, authoritative) {
  const liveHead = authoritative?.git?.headSha;
  let next = state;
  let changed = false;
  if (liveHead !== state?.branch?.headSha) {
    const exactCommit = authoritative?.intents?.some((intent) => intent.effectType === "commit"
      && (intent.classification === "effect_present_exact_adoptable" || (intent.classification === "effect_confirmed" && intent.confirmedHeadMatches === true)));
    if (!exactCommit || !/^[a-f0-9]{40}$/.test(String(liveHead || ""))) {
      return { ok: false, reasonCode: "session_lifecycle_authoritative_head_unproven" };
    }
    next = { ...next, branch: { ...next.branch, headSha: liveHead, candidateDigest: null } };
    changed = true;
  }
  const livePr = authoritative?.github?.pr;
  if (livePr && !next?.branch?.prNumber) {
    const exactPrCreate = authoritative?.intents?.some((intent) => intent.effectType === "pr_create" && ["effect_present_exact_adoptable", "effect_confirmed"].includes(intent.classification));
    if (!exactPrCreate || !Number.isSafeInteger(livePr.number) || livePr.headRefName !== next.branch.name || livePr.headSha !== next.branch.headSha) {
      return { ok: false, reasonCode: "session_lifecycle_authoritative_pr_unproven" };
    }
    next = { ...next, branch: { ...next.branch, prNumber: livePr.number } };
    changed = true;
  }
  return { ok: true, changed, state: next };
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
