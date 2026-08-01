import { createHash } from "node:crypto";
import path from "node:path";
import {
  advanceRecoveryPhase,
  classifyRecoveryOutcome,
  isEligibleValidationRetryCheckpoint,
  loadRecoveryState,
  listRecoverableRecoveryStates,
  recoveryRequiresExactHeadEvidenceRegeneration,
  recoveryHasMutationMarker,
  recoveryStatePath,
  validationRetryDerivativeTerminalPhase,
  writeRecoveryState,
} from "./recovery-state.mjs";
import { assertMutationAuthority, completeSessionRotation, loadSessionLifecycleForRecovery, migrateRecoveryStateToSessionLifecycle, planInterruptionRecovery, persistSessionLifecycleState, recoverySuccessorSessionId, reopenKnownValidationRetryDerivative, transitionSessionLifecyclePhase } from "./session-lifecycle.mjs";
import { collectAuthoritativeRecoveryEvidence, plannerInputsFromAuthoritativeEvidence } from "./authoritative-recovery-evidence.mjs";
import { findPreEffectIntents, handoffPreEffectIntentAuthority, intentIssueAuthorityMatches } from "./pre-effect-intent.mjs";
import { loadLogicalTaskBudget } from "./logical-task-budget.mjs";
import { projectAuthenticatedTerminalValidationRetryDerivative } from "./terminal-validation-retry-projection.mjs";
import { validateOrdinaryContinuationPhaseEffects } from "./ordinary-candidate-continuation.mjs";
import { buildSemanticRecoveryManifest, classifyRecoveryOverwriteIncident, inspectConfiguredRecoveryOverwriteIncident } from "./post-incident-successor-recovery.mjs";

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
  const configuredQuarantine = detectConfiguredPostIncidentQuarantineBeforeFiltering(config);
  if (configuredQuarantine) return configuredQuarantine;
  const states = listRecoverableRecoveryStates(config);
  if (states.length === 0) {
    return { found: false, action: "poll_eligible_issues", states: [] };
  }
  const quarantine = detectConfiguredPostIncidentQuarantine(config, states);
  if (quarantine) return quarantine;
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

function detectConfiguredPostIncidentQuarantineBeforeFiltering(config) {
  const contract = config.postIncidentRecovery || null;
  if (!contract?.authenticatedProvenance) return null;
  const inspection = inspectConfiguredRecoveryOverwriteIncident(contract.authenticatedProvenance);
  if (!inspection?.quarantined) return null;
  const corroboration = contract.semanticEvidencePacket
    ? buildSemanticRecoveryManifest(contract.semanticEvidencePacket)
    : { ok: false, reasonCode: "semantic_evidence_packet_missing" };
  return {
    found: true, allowed: false, action: "stop_fail_closed",
    reasonCode: corroboration.ok ? "post_incident_semantic_operation_authorization_required" : corroboration.reasonCode,
    quarantine: { ...inspection, state: undefined },
    semanticManifestDigest: corroboration.ok ? corroboration.manifestDigest : null,
    state: inspection.state ? summarizeRecoverableState(inspection.state) : null,
    states: inspection.state ? [summarizeRecoverableState(inspection.state)] : [],
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
  const configuredQuarantine = detectConfiguredPostIncidentQuarantineBeforeFiltering(config);
  if (configuredQuarantine) return configuredQuarantine;
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
  const partition = partitionRecoveryStatesByTarget(config, states, target);
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
  const rawState = partition.exactMatches[0];
  const quarantine = detectConfiguredPostIncidentQuarantine(config, [rawState]);
  if (quarantine) return { ...quarantine, stateCounts: partition.counts };
  const state = rawState;
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
  const projection = projectTargetedTerminalDerivative(config, rawState);
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
      terminalDerivativeProjection: boundedProjectionEvidence(projection),
    };
  }
  const regeneration = recoveryRequiresExactHeadEvidenceRegeneration(
    projection.ok ? projection.effectiveRecovery : state,
  );
  if (regeneration.required && !projection.ok) {
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: regeneration.reasonCode,
      state: summarizeRecoverableState(state),
      states: partition.exactMatches.map(summarizeRecoverableState),
      stateCounts: partition.counts,
      terminalDerivativeProjection: boundedProjectionEvidence(projection),
    };
  }
  const continuationAdmission = boundedTerminalDerivativeContinuationAdmission(config, state, target);
  const discovered = {
    found: true,
    allowed: true,
    action: "resume_recoverable_work",
    reasonCode: "outage_recovery_target_discovered",
    outcome: classifyRecoveryOutcome("pending", { reasonCode: "outage_recovery_target_discovered" }),
    state: summarizeRecoverableState(state),
    states: partition.exactMatches.map(summarizeRecoverableState),
    stateCounts: partition.counts,
    target,
    terminalDerivativeProjection: boundedProjectionEvidence(projection),
    terminalDerivativeContinuationAdmission: continuationAdmission,
  };
  const effectiveRecovery = projection.ok
    ? projection.effectiveRecovery
    : continuationAdmission?.ok
      ? replaySafeTerminalDerivativeContinuation(state)
      : null;
  if (effectiveRecovery) {
    Object.defineProperty(discovered, "projectedRecoveryState", {
      value: effectiveRecovery,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
  return discovered;
}

function detectConfiguredPostIncidentQuarantine(config, states) {
  const contract = config.postIncidentRecovery || null;
  if (!contract?.authenticatedProvenance) return null;
  for (const state of states) {
    const statePath = state.statePath || recoveryStatePath(config, state);
    const classification = classifyRecoveryOverwriteIncident({
      recoveryPath: statePath,
      state,
      authenticatedProvenance: contract.authenticatedProvenance,
    });
    if (!classification.quarantined) continue;
    const corroboration = contract.semanticEvidencePacket
      ? buildSemanticRecoveryManifest(contract.semanticEvidencePacket)
      : { ok: false, reasonCode: "semantic_evidence_packet_missing" };
    return {
      found: true,
      allowed: false,
      action: "stop_fail_closed",
      reasonCode: corroboration.ok
        ? "post_incident_semantic_operation_authorization_required"
        : corroboration.reasonCode,
      quarantine: classification,
      semanticManifestDigest: corroboration.ok ? corroboration.manifestDigest : null,
      state: summarizeRecoverableState(state),
      states: states.map(summarizeRecoverableState),
    };
  }
  return null;
}


export function projectTargetedTerminalDerivative(
  config,
  rawState,
  rawStatePath = rawState?.statePath,
) {
  const identity = rawState?.ordinaryContinuation?.identity;
  const counters = rawState?.ordinaryContinuation?.counters;
  const chargeIds = Object.keys(rawState?.mutationMarkers?.logical_task_charge || {});
  if (chargeIds.length !== 1 || !identity) return { ok: false };
  const target = {
    repository: config.repositorySlug,
    issueNumber: rawState.issue?.number,
    taskKey: rawState.taskKey,
    runnerRunId: rawState.run?.runId,
    supervisorRunId: rawState.run?.supervisorRunId,
    claimIdentity: `${config.repositorySlug}#${rawState.issue?.number}`,
    chargeId: chargeIds[0],
    branch: rawState.branch?.name,
    baseSha: rawState.branch?.baseSha,
    headSha: rawState.branch?.currentHeadSha,
    treeSha: identity.treeSha,
    changedFilesDigest: identity.changedFilesDigest,
    diffDigest: identity.diffDigest,
    acceptedLogicalTasks: counters?.acceptedLogicalTasks,
    localSourceChangingRounds: counters?.localSourceChangingRoundsPerEpoch,
    githubTriggeredFixEpochs: counters?.githubTriggeredFixEpochsPerPr,
    lifetimeLocalSourceChangingRounds: counters?.lifetimeLocalSourceChangingRounds,
    allowReopenedLifecycle: true,
  };
  const budget = loadLogicalTaskBudget(config, target.supervisorRunId || target.runnerRunId);
  const budgetCharges = budget.state?.charges || {};
  const charge = budgetCharges[target.chargeId];
  if (!budget.ok
    || budget.state?.acceptedLogicalTaskCount !== 1
    || Object.keys(budgetCharges).length !== 1
    || charge?.identity?.repository !== target.repository
    || charge?.identity?.issueNumber !== target.issueNumber
    || charge?.identity?.taskLineageId !== `issue-${target.issueNumber}`
    || charge?.identity?.claimIdentity !== target.claimIdentity) {
    return { ok: false };
  }
  target.durableBudgetExact = true;
  target.durableChargeMarker = charge;
  target.chargeMarkerRef = budget.statePath;
  const lifecycle = loadSessionLifecycleForRecovery(config, {
    repository: target.repository,
    issueNumber: target.issueNumber,
    taskKey: target.taskKey,
    runId: target.runnerRunId,
    supervisorRunId: target.supervisorRunId,
    branchName: target.branch,
    baseSha: target.baseSha,
    headSha: target.headSha,
  }, { allowLegacySupervisorBackfill: false });
  if (!lifecycle.ok) return { ok: false };
  return projectAuthenticatedTerminalValidationRetryDerivative({
    logsRoot: config.logsRoot,
    rawRecovery: rawState,
    rawRecoveryPath: rawStatePath,
    lifecycle: lifecycle.state,
    lifecyclePath: lifecycle.statePath,
    target,
  });
}

export function projectAuthoritativeLoadedTerminalDerivative(
  config,
  loaded,
) {
  if (loaded?.ok !== true || !loaded.state || typeof loaded.statePath !== "string") {
    return {
      ok: false,
      projectionApplied: false,
      projectionReasonCode: "terminal_projection_authoritative_checkpoint_missing",
    };
  }
  return projectTargetedTerminalDerivative(config, loaded.state, loaded.statePath);
}

function boundedProjectionEvidence(projection) {
  if (!projection?.ok) return null;
  return Object.freeze({
    ok: true,
    projectionApplied: true,
    projectionReasonCode: projection.projectionReasonCode,
    evidenceDigest: projection.evidenceDigest,
    boundArtifacts: Object.freeze(projection.boundArtifacts.map(({ role, sha256 }) =>
      Object.freeze({ role, sha256 }))),
  });
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
  const supplied = handlers.authoritativeLoadedRecovery;
  const loaded = supplied?.ok === true && supplied.state && supplied.statePath
    ? supplied
    : loadRecoveryState(config, recovery.state);
  if (!loaded.ok) {
    return {
      ok: false,
      outcome: "blocked_recovery_state",
      reasonCode: loaded.reasonCode,
      recovery,
    };
  }
  let reloadedProjection = null;
  if (recovery.terminalDerivativeProjection?.ok) {
    reloadedProjection = projectAuthoritativeLoadedTerminalDerivative(config, loaded);
    if (!reloadedProjection.ok
      || reloadedProjection.evidenceDigest !== recovery.terminalDerivativeProjection.evidenceDigest) {
      return {
        ok: false,
        outcome: "blocked_recovery_state",
        reasonCode: "terminal_projection_reloaded_checkpoint_mismatch",
        recovery,
      };
    }
  }
  const persistedContinuationAdmission = config.outageRecoveryTarget?.terminalValidationRetryDerivativeNoPr === true
    ? validateTerminalDerivativeContinuationAdmission(
      config,
      loaded.state,
      config.outageRecoveryTarget,
    )
    : { ok: false };
  const loadedState = reloadedProjection?.effectiveRecovery
    || (persistedContinuationAdmission.ok
      ? replaySafeTerminalDerivativeContinuation(loaded.state)
      : loaded.state);
  // A matching authenticated reload projection is itself the bounded reopen
  // authority. The legacy raw-state predicate remains only for ordinary
  // non-projected compatibility and must not downgrade an exact projection.
  const validationRetryTerminal = reloadedProjection?.ok
    ? loadedState
    : isValidationFailureRetryAuthorized(loadedState) ? loadedState : null;
  let state = normalizeValidationFailureContinuation(loadedState, {
    projectedAuthority: reloadedProjection?.ok === true,
  });
  const prepareAuthoritativeRecovery = selectOwnCallableHandler(handlers, "prepareAuthoritativeRecovery");
  const preparation = prepareAuthoritativeRecovery
    ? await prepareAuthoritativeRecovery({
      state,
      loaded,
      recovery,
      terminalDerivativeProjection: boundedProjectionEvidence(reloadedProjection),
    })
    : { ok: true };
  if (preparation?.ok === false) {
    return {
      ok: false,
      outcome: "blocked_recovery_state",
      reasonCode: preparation.reasonCode || "authoritative_recovery_task_workspace_unavailable",
      recovery: { ...recovery, state: summarizeRecoverableState(preparation.state || state) },
    };
  }
  if (preparation?.state) state = preparation.state;
  if (reloadedProjection) {
    const preReopenLoaded = loadRecoveryState(config, loaded.state);
    const preReopenProjection = preReopenLoaded.ok
      ? projectAuthoritativeLoadedTerminalDerivative(config, preReopenLoaded)
      : { ok: false };
    if (!preReopenProjection.ok
      || preReopenProjection.evidenceDigest !== reloadedProjection.evidenceDigest) {
      return {
        ok: false,
        outcome: "blocked_recovery_state",
        reasonCode: "terminal_projection_pre_reopen_mismatch",
        recovery,
      };
    }
  }
  if (reloadedProjection && !validateOrdinaryContinuationPhaseEffects(
    loaded.state?.ordinaryContinuation,
    { requireInitialLocalValidation: true },
  )) {
    return {
      ok: false,
      outcome: "blocked_recovery_state",
      reasonCode: "terminal_derivative_initial_continuation_posture_invalid",
      recovery,
    };
  }
  const lifecycleRecovery = consumeStartupInterruptionPlanner(config, state, {
    ...(recovery.interruption || {}),
    validationRetryDerivativeAuthorized: reloadedProjection?.ok === true
      || validationRetryTerminal?.stopReason?.reasonCode === "checkpoint_validation_recovery_failed_closed",
    validationRetryDerivativeTerminalPhase: validationRetryTerminal
      ? validationRetryDerivativeTerminalPhase(validationRetryTerminal)
      : null,
  }, preparation?.evidenceAdapters || {}, {
    revalidateValidationRetryDerivative: reloadedProjection
      ? () => {
        const projection = projectTargetedTerminalDerivative(
          config,
          loaded.state,
          loaded.statePath,
        );
        return {
          ok: projection.ok && projection.evidenceDigest === reloadedProjection.evidenceDigest,
          reasonCode: "terminal_projection_at_reopen_mismatch",
        };
      }
      : null,
  });
  if (!lifecycleRecovery.ok) {
    return {
      ok: false,
      outcome: "blocked_recovery_state",
      reasonCode: lifecycleRecovery.reasonCode,
      recovery: { ...recovery, lifecycle: lifecycleRecovery },
    };
  }
  if (lifecycleRecovery.terminal) {
    if (reloadedProjection?.ok === true) {
      return {
        ok: false,
        outcome: "blocked_recovery_state",
        reasonCode: "projected_recovery_unexpected_terminal_before_successor_rotation",
        recovery: { ...recovery, lifecycle: lifecycleRecovery },
      };
    }
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
  if (reloadedProjection) {
    state = {
      ...state,
      terminalDerivativeContinuationAdmission: createTerminalDerivativeContinuationAdmission(
        config,
        loaded.state,
        reloadedProjection,
        lifecycleRecovery.state,
      ),
    };
  }
  if (!validationRetryTerminal && lifecycleRecovery.earliestSafePhase && lifecycleRecovery.earliestSafePhase !== state.phase) {
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
  const result = await handler({ state, boundary, loaded, preparation });
  if (validationRetryTerminal && isRepeatedUnsafeValidationResult(result)) {
    let terminal = {
      ...(result?.state || state),
      phase: "stopped",
      firstIncompleteAction: validationRetryTerminal.firstIncompleteAction,
      nextSafeAction: "stop_fail_closed",
      stopReason: {
        reasonCode: "checkpoint_validation_recovery_retry_exhausted",
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
          recovery: { ...recovery, state: summarizeRecoverableState(result?.state || state) },
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

export function consumeStartupInterruptionPlanner(
  config,
  recoveryState,
  interruption = {},
  evidenceAdapters = {},
  { revalidateValidationRetryDerivative = null } = {},
) {
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
  if (interruption.validationRetryDerivativeAuthorized === true) {
    const revalidation = typeof revalidateValidationRetryDerivative === "function"
      ? revalidateValidationRetryDerivative()
      : { ok: false, reasonCode: "terminal_projection_at_reopen_revalidation_missing" };
    if (!revalidation?.ok) return {
      ok: false,
      reasonCode: revalidation?.reasonCode || "terminal_projection_at_reopen_mismatch",
    };
    const reopened = reopenKnownValidationRetryDerivative(config, lifecycleState, inputs.liveEffects, {
      terminalPhaseAfter: interruption.validationRetryDerivativeTerminalPhase,
    });
    if (!reopened.ok) return reopened;
    lifecycleState = reopened.state;
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
  const successor = recoverySuccessorSessionId(pending.state);
  if (!successor.ok) return successor;
  const successorSessionId = successor.sessionId;
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

function normalizeValidationFailureContinuation(state, { projectedAuthority = false } = {}) {
  if (!projectedAuthority && !isValidationFailureRetryAuthorized(state)) return state;
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
  return state?.phase === "stopped"
    && state?.evidence?.localValidation?.status === "failed"
    && state.branch?.currentHeadSha === state.ordinaryContinuation?.identity?.headSha
    && isEligibleValidationRetryCheckpoint(state);
}

function isRepeatedUnsafeValidationResult(result) {
  const continuation = result?.ordinaryContinuation
    || result?.state?.ordinaryContinuation
    || result?.state;
  const findings = continuation?.sourceFailureBatch?.findings;
  const terminalReason = [
    "checkpoint_validation_not_source_fix_safe",
    "initial_validation_failure_commit_reconstruction_ambiguous",
    "source_failure_unsafe_or_ambiguous",
  ].includes(result?.reasonCode)
    || ["historical_candidate_", "preserved_recovery_"]
      .some((prefix) => String(result?.reasonCode || "").startsWith(prefix));
  return result?.ok === false
    && terminalReason
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

function partitionRecoveryStatesByTarget(config, states, target) {
  const exactMatches = [];
  let nonMatchCount = 0;
  for (const state of states) {
    const comparison = compareRecoveryStateToTarget(config, state, target);
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

function compareRecoveryStateToTarget(config, state, target) {
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
  if (mismatch) {
    if (target.terminalValidationRetryDerivativeNoPr === true
      && validateTerminalDerivativeContinuationAdmission(config, state, target).ok) {
      return { ok: true, terminalDerivativeContinuation: true };
    }
    return { ok: false, reasonCode: "outage_recovery_target_mismatch", field: mismatch[0] };
  }
  return { ok: true };
}

function createTerminalDerivativeContinuationAdmission(config, originalState, projection, lifecycle) {
  const identity = originalState.ordinaryContinuation?.identity;
  const evidence = {
    version: 1,
    repository: config.repositorySlug,
    issueNumber: originalState.issue?.number,
    taskKey: originalState.taskKey,
    runnerRunId: originalState.run?.runId,
    supervisorRunId: originalState.run?.supervisorRunId,
    branchName: originalState.branch?.name,
    baseSha: originalState.branch?.baseSha,
    originalHeadSha: originalState.branch?.currentHeadSha,
    originalTreeSha: identity?.treeSha,
    originalChangedFilesDigest: identity?.changedFilesDigest,
    originalDiffDigest: identity?.diffDigest,
    projectionEvidenceDigest: projection.evidenceDigest,
    lifecycleRequestId: lifecycle?.mutationAuthority?.handoff?.requestId,
    lifecyclePredecessorDigest: lifecycle?.mutationAuthority?.handoff?.checkpointDigest,
    originalContinuationPhase: originalState.ordinaryContinuation?.phase,
    originalContinuationEffectsDigest: createHash("sha256")
      .update(JSON.stringify(originalState.ordinaryContinuation?.effects || {}))
      .digest("hex"),
  };
  return {
    ...evidence,
    admissionDigest: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
  };
}

export function validateTerminalDerivativeContinuationAdmission(config, state, target, {
  loadLifecycle = loadSessionLifecycleForRecovery,
} = {}) {
  const admission = state?.terminalDerivativeContinuationAdmission;
  if (!admission || admission.version !== 1) return { ok: false };
  const { admissionDigest, ...evidence } = admission;
  if (!/^[a-f0-9]{64}$/.test(String(admissionDigest || ""))
    || admissionDigest !== createHash("sha256").update(JSON.stringify(evidence)).digest("hex")
    || admission.repository !== config.repositorySlug
    || admission.issueNumber !== target.issueNumber
    || admission.taskKey !== target.taskKey
    || admission.runnerRunId !== target.runnerRunId
    || admission.supervisorRunId !== target.supervisorRunId
    || admission.branchName !== target.branchName
    || admission.baseSha !== target.baseSha
    || admission.originalHeadSha !== target.currentHeadSha
    || !/^[a-f0-9]{40}$/.test(String(admission.originalTreeSha || ""))
    || !/^[a-f0-9]{64}$/.test(String(admission.originalChangedFilesDigest || ""))
    || !/^[a-f0-9]{64}$/.test(String(admission.originalDiffDigest || ""))
    || !/^[a-f0-9]{64}$/.test(String(admission.projectionEvidenceDigest || ""))
    || !/^[a-f0-9]{64}$/.test(String(admission.lifecycleRequestId || ""))
    || !/^[a-f0-9]{64}$/.test(String(admission.lifecyclePredecessorDigest || ""))
    || admission.originalContinuationPhase !== "local_validation"
    || admission.originalContinuationEffectsDigest
      !== createHash("sha256").update(JSON.stringify({})).digest("hex")) {
    return { ok: false };
  }
  const authoritativeLifecycle = loadLifecycle(config, {
    repository: admission.repository,
    issueNumber: state.issue?.number,
    taskKey: state.taskKey,
    runId: state.run?.runId,
    supervisorRunId: state.run?.supervisorRunId,
    branchName: state.branch?.name,
    baseSha: state.branch?.baseSha,
    headSha: state.branch?.currentHeadSha,
  }, { allowLegacySupervisorBackfill: false });
  const handoff = authoritativeLifecycle.state?.mutationAuthority?.handoff;
  if (!authoritativeLifecycle.ok
    || handoff?.reason !== "validation_retry_derivative_reopened"
    || handoff?.requestId !== admission.lifecycleRequestId
    || handoff?.checkpointDigest !== admission.lifecyclePredecessorDigest) {
    return { ok: false };
  }
  const current = state.ordinaryContinuation?.identity;
  const originalCandidates = [
    state.claimAuthority?.authority?.candidateIdentity,
    state.ordinaryContinuation?.sourceFailureBatch?.candidate,
    ...(state.ordinaryContinuation?.sourceFailureHistory || []).map((entry) => entry?.candidate),
  ].filter(Boolean);
  const sourceRepositories = [
    ...(state.ordinaryContinuation?.sourceFailureBatch?.findings || []),
  ].map((finding) => finding?.repository).filter(Boolean).concat(
    (state.ordinaryContinuation?.sourceFailureHistory || [])
      .map((entry) => entry?.repository)
      .filter(Boolean),
  );
  const originalBound = originalCandidates.some((candidate) =>
    candidate.headSha === admission.originalHeadSha
      && candidate.treeSha === admission.originalTreeSha
      && candidate.changedFilesDigest === admission.originalChangedFilesDigest
      && candidate.diffDigest === admission.originalDiffDigest);
  const prIsAbsent = state.pr?.number == null && state.pr?.headSha == null;
  const prIsCurrent = Number.isSafeInteger(state.pr?.number)
    && state.pr.number > 0
    && state.pr.headSha === state.branch?.currentHeadSha
    && state.pr.headRefName === state.branch?.name
    && state.pr.baseRefName === "main";
  if (!originalBound
    || sourceRepositories.length === 0
    || sourceRepositories.some((repository) => repository !== admission.repository)
    || state.issue?.number !== admission.issueNumber
    || state.taskKey !== admission.taskKey
    || state.run?.runId !== admission.runnerRunId
    || state.run?.supervisorRunId !== admission.supervisorRunId
    || state.branch?.name !== admission.branchName
    || state.branch?.baseSha !== admission.baseSha
    || state.featureBundle !== null
    || current?.headSha !== state.branch?.currentHeadSha
    || !/^[a-f0-9]{40}$/.test(String(current?.treeSha || ""))
    || !/^[a-f0-9]{64}$/.test(String(current?.changedFilesDigest || ""))
    || !/^[a-f0-9]{64}$/.test(String(current?.diffDigest || ""))
    || (!prIsAbsent && !prIsCurrent)) {
    return { ok: false };
  }
  return { ok: true, admissionDigest, projectionEvidenceDigest: admission.projectionEvidenceDigest };
}

function boundedTerminalDerivativeContinuationAdmission(config, state, target) {
  const validated = validateTerminalDerivativeContinuationAdmission(config, state, target);
  return validated.ok
    ? Object.freeze({ ...validated, reviewGatesRequireReplay: true })
    : null;
}

export function replaySafeTerminalDerivativeContinuation(state) {
  return Object.freeze({
    ...state,
    featureBundle: null,
    ordinaryContinuation: Object.freeze({
      ...state.ordinaryContinuation,
      phase: "local_validation",
      effects: Object.freeze({}),
    }),
  });
}
