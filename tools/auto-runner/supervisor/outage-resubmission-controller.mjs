import { readFileSync } from "node:fs";
import {
  applyOutageOperatorGate,
  classifyOutageFailure,
  evaluateOutageCircuit,
  normalizeOutageResubmissionConfig,
  planOutageResubmissionSchedule,
} from "../lib/outage-resubmission-policy.mjs";
import {
  createOutageResubmissionState,
  outageResubmissionStorageKey,
  readOutageResubmissionInventory,
  listOutageResubmissionStates,
  loadOutageResubmissionState,
  rebuildExhaustedOutageState,
  transitionOutageMarker,
  verifyOutageCorrelation,
  writeOutageResubmissionState,
} from "../lib/outage-resubmission-state.mjs";
import { firstIncompleteContinuationAction } from "../lib/recovery-continuation.mjs";
import { planInterruptionRecovery, persistSessionLifecycleState } from "../lib/session-lifecycle.mjs";
import {
  bindOutageResubmissionToRecoveryState,
  invalidateEvidenceForHeadChange,
  recoveryRequiresExactHeadEvidenceRegeneration,
  writeRecoveryState,
} from "../lib/recovery-state.mjs";
import { collectAuthoritativeRecoveryEvidence, plannerInputsFromAuthoritativeEvidence } from "../lib/authoritative-recovery-evidence.mjs";
import { buildRunSpec, generateRunId, sha256Text, canonicalJson, writeImmutableRunSpec } from "./run-spec.mjs";
import { resolveRunnerSummaryForSupervisor, resolverStatuses } from "./runner-summary-resolver.mjs";
import { writeSupervisorState } from "./supervisor-state.mjs";
import { startUserUnit } from "./systemd-client.mjs";

export function evaluateSourceRunEligibility(input = {}) {
  const policy = normalizeOutageResubmissionConfig(input.config?.outageResubmission || input.outageResubmission || {});
  const source = input.source || {};
  const block = (reasonCode, extra = {}) => ({ eligible: false, reasonCode, ...extra });
  if (!policy.allowBoundedOutageResubmission) return block("outage_resubmission_disabled");
  const validation = validateSourceEvidence(source);
  if (!validation.ok) return block(validation.reasonCode, { invalidField: validation.field });
  if (!source.terminal && !source.provenInactive) return block("source_run_not_terminal_or_inactive");
  if (source.manualGate || source.authorityGate || source.destructiveGate) return block("source_manual_or_authority_gate");
  if (source.completed || source.merged || source.issueClosed) return block("source_work_already_complete");
  if (source.staleEvidence) return block("source_stale_evidence");
  const classification = classifyOutageFailure(input.failure || source.failure || {});
  if (!classification.retryable) return block("source_failure_nonretryable", { classification });
  return { eligible: true, reasonCode: "source_run_eligible", classification, policy };
}

export function buildOutageResubmissionStatus(config = {}) {
  const policy = normalizeOutageResubmissionConfig(config.outageResubmission || {});
  const inventory = readOutageResubmissionInventory(config);
  const states = inventory.ok ? inventory.validStates : [];
  const activeStates = states.filter((state) => !isTerminalOutageStatus(state.status));
  const activeAmbiguity = activeStates.length > 1 ? summarizeActiveAmbiguity(activeStates) : null;
  const operatorActionRequired = inventory.operatorActionRequired || Boolean(activeAmbiguity);
  const active = activeStates.length === 1 ? activeStates[0] : null;
  const terminal = active || activeAmbiguity ? null : selectCurrentOutageState(states.filter((state) => isTerminalOutageStatus(state.status)));
  const statusSource = active || terminal || null;
  const reasonCode = inventory.reasonCode || activeAmbiguity?.reasonCode || null;
  const status = {
    enabled: policy.allowBoundedOutageResubmission,
    defaultOff: policy.allowBoundedOutageResubmission !== true,
    activeSourceRun: operatorActionRequired ? null : active ? summarizeOutageState(active) : null,
    attemptCount: statusSource?.mutationMarker?.attemptNumber || 0,
    maxAttempts: policy.maxAttempts,
    nextEligibleAt: operatorActionRequired ? null : active?.schedule?.nextEligibleAt || null,
    deadlineAt: statusSource?.schedule?.deadlineAt || null,
    circuitState: statusSource?.circuit?.state || "closed",
    lastSanitizedReason: reasonCode || statusSource?.mutationMarker?.reasonCode || statusSource?.outage?.reasonCode || null,
    childRunId: operatorActionRequired ? null : statusSource?.childSupervisorRunId || null,
    terminalOutcome: operatorActionRequired ? null : terminal?.status || null,
    recordCount: inventory.totalRecordCount,
    stateReadStatus: inventory.readStatus,
    reasonCode,
    operatorActionRequired,
    totalRecordCount: inventory.totalRecordCount,
    validRecordCount: inventory.validCount,
    invalidRecordCount: inventory.invalidCount,
    activeRecordCount: activeStates.length,
    ambiguousActiveRecordCount: activeAmbiguity?.count || 0,
    ambiguousActiveRecords: activeAmbiguity?.records || [],
  };
  return status;
}

export function runOutageResubmissionController(input = {}) {
  const events = [];
  const config = input.config || {};
  const policy = normalizeOutageResubmissionConfig(config.outageResubmission || input.outageResubmission || {});
  const now = input.now || new Date();
  const dryRun = input.dryRun !== false;
  const startUnit = input.startUserUnit || startUserUnit;
  const counts = { githubMutationCalls: 0, systemdCalls: 0, realMutationCalls: 0 };
  const event = (eventName, payload = {}) => {
    events.push({ event: eventName, ...sanitizeEvent(payload) });
  };

  event("operator_control_checked");
  const initialGate = applyOutageOperatorGate({ operatorControl: input.operatorControl || {} });
  if (initialGate.reasonCode === "operator_pause" || initialGate.reasonCode === "operator_stop") {
    event("operator_pause_stop", initialGate);
    return result("blocked", initialGate.reasonCode, { events, counts });
  }

  event("lock_state_checked");
  if (input.lock?.active) return result("blocked", "active_lock", { events, counts });
  if (input.lock?.stale && input.lock?.safeToClear !== true) return result("blocked", "stale_lock_requires_existing_policy", { events, counts });

  const inventory = readOutageResubmissionInventory(config);
  if (!inventory.ok) {
    event("outage_state_inventory_blocked", { reasonCode: inventory.reasonCode, invalidRecordCount: inventory.invalidCount });
    return result("blocked", "outage_resubmission_state_untrusted", { events, counts, outageStateInventory: summarizeOutageInventory(inventory) });
  }
  const activeOutageStates = inventory.validStates.filter((state) => !isTerminalOutageStatus(state.status));
  if (activeOutageStates.length > 1) {
    const activeAmbiguity = summarizeActiveAmbiguity(activeOutageStates);
    event("outage_state_inventory_blocked", { reasonCode: activeAmbiguity.reasonCode, activeRecordCount: activeAmbiguity.count });
    return result("blocked", activeAmbiguity.reasonCode, {
      events,
      counts,
      outageStateInventory: {
        ...summarizeOutageInventory(inventory),
        activeRecordCount: activeAmbiguity.count,
        ambiguousActiveRecords: activeAmbiguity.records,
      },
    });
  }

  const recovery = input.recoveryState || null;
  const source = input.source || {};
  const stateKey = input.outageStateKey || source.outageStateKey || null;
  let existingOutageState = input.outageState || null;
  let eligibility = null;
  let correlation = null;
  const canonical = resolveCanonicalOutageState({ config, source, failure: input.failure, stateKey });
  if (!canonical.ok) {
    event("outage_source_identity_blocked", { reasonCode: canonical.reasonCode, field: canonical.field, classification: canonical.classification });
    return result("blocked", canonical.reasonCode, { events, counts, classification: canonical.classification, invalidField: canonical.field });
  }
  if (canonical.explicitConflict) {
    event("outage_state_key_conflict_blocked", { reasonCode: canonical.reasonCode });
    return result("blocked", canonical.reasonCode, { events, counts, canonicalStateKey: canonical.stateKey });
  }
  eligibility = canonical.eligibility;
  correlation = canonical.correlation;
  if (!existingOutageState && canonical.loaded?.ok) {
    existingOutageState = canonical.loaded.state;
    event("canonical_outage_state_loaded", { stateKey: canonical.stateKey, status: existingOutageState.status });
  }
  if (!existingOutageState && canonical.loaded && !canonical.loaded.ok && canonical.loaded.reasonCode !== "outage_resubmission_state_missing") {
    event("outage_state_load_blocked", { reasonCode: canonical.loaded.reasonCode });
    return result("blocked", "outage_resubmission_state_untrusted", { events, counts, outageStateLoad: canonical.loaded });
  }

  if (existingOutageState) {
    const drift = verifyOutageCorrelation(existingOutageState, correlation);
    if (!drift.ok) {
      event("outage_identity_drift_blocked", { reasonCode: drift.reasonCode, field: drift.field });
      return result("blocked", drift.reasonCode, { events, counts, drift, outageState: existingOutageState });
    }
  }

  const currentCompletion = validateCurrentCompletionIdentity(source, input.currentIdentity);
  if (currentCompletion.complete) {
    return terminalizeSourceCompletion({
      config,
      existingOutageState,
      dryRun,
      events,
      counts,
      event,
      writeState: input.writeOutageState || writeOutageResubmissionState,
      reasonCode: currentCompletion.reasonCode,
    });
  }
  if (!currentCompletion.ok) return result("blocked", currentCompletion.reasonCode, { events, counts, outageState: existingOutageState });

  if (input.currentIdentity?.branchName && input.currentIdentity.branchName !== source.branchName) {
    return result("blocked", "branch_identity_mismatch", { events, counts, outageState: existingOutageState });
  }
  if (input.currentIdentity?.baseSha && input.currentIdentity.baseSha !== source.baseSha) {
    return result("blocked", "base_identity_mismatch", { events, counts, outageState: existingOutageState });
  }
  if (input.currentIdentity?.currentHeadSha && input.currentIdentity.currentHeadSha !== source.currentHeadSha) {
    const invalidatedRecoveryState = recovery
      ? invalidateEvidenceForHeadChange(recovery, {
          newHeadSha: input.currentIdentity.currentHeadSha,
          reasonCode: "outage_resubmission_head_changed",
        })
      : null;
    if (invalidatedRecoveryState && !dryRun) {
      try {
        (input.writeRecoveryState || writeRecoveryState)(config, invalidatedRecoveryState);
      } catch {
        event("stale_head_evidence_invalidation_persistence_failed", { reasonCode: "recovery_stale_head_invalidation_persistence_failed" });
        return result("blocked", "recovery_stale_head_invalidation_persistence_failed", { events, counts, recoveryState: recovery });
      }
    }
    event("stale_head_evidence_invalidated", {
      currentHeadSha: input.currentIdentity.currentHeadSha,
      persisted: Boolean(invalidatedRecoveryState && !dryRun),
      durable: Boolean(invalidatedRecoveryState && !dryRun),
    });
    return result("blocked", "stale_head_evidence_regeneration_required", { events, counts, recoveryState: invalidatedRecoveryState });
  }
  const currentPrIdentityForAdoption = validateCurrentPrIdentityForSource(source, input.currentIdentity);
  if (!currentPrIdentityForAdoption.ok) return result("blocked", currentPrIdentityForAdoption.reasonCode, { events, counts, outageState: existingOutageState });

  event("outage_marker_reconciled");
  const childReconciliation = reconcileExactChild(input.existingChildren || [], source, existingOutageState);
  if (!childReconciliation.ok) {
    event("outage_child_reconciliation_blocked", { reasonCode: childReconciliation.reasonCode });
    return result("blocked", childReconciliation.reasonCode, { events, counts, outageState: existingOutageState, childReconciliation });
  }
  const existingChild = childReconciliation.child;
  if (existingOutageState && isTerminalOutageStatus(existingOutageState.mutationMarker?.status || existingOutageState.status)) {
    event("terminal_outage_marker_preserved", { status: existingOutageState.status });
    return result("noop", "terminal_outage_marker_preserved", { events, counts, outageState: existingOutageState });
  }
  if (existingOutageState?.mutationMarker?.status === "submission_uncertain") {
    if (existingChild) {
      const terminal = terminalChildResult(existingOutageState, existingChild, { config, source });
      if (terminal) {
        if (!dryRun) writeOutageResubmissionState(config, terminal.outageState);
        event("uncertain_terminal_child_classified", { childSupervisorRunId: existingChild.runId, status: terminal.terminalStatus });
        return result(terminal.terminalStatus, terminal.reasonCode, { events, counts, outageState: terminal.outageState, childRunId: existingChild.runId, childRecoveryProof: terminal.childRecoveryProof });
      }
      const confirmed = transitionOutageMarker(existingOutageState, {
        status: "confirmed_running",
        childSupervisorRunId: existingChild.runId,
        reasonCode: "uncertain_submission_reconciled",
      });
      if (!dryRun) writeOutageResubmissionState(config, confirmed);
      event("uncertain_submission_reconciled", { childSupervisorRunId: existingChild.runId });
      return result("confirmed_existing_child", "uncertain_submission_reconciled", { events, counts, outageState: confirmed });
    }
    event("uncertain_submission_requires_reconciliation");
    return result("blocked", "uncertain_submission_requires_reconciliation", { events, counts, outageState: existingOutageState });
  }
  if (existingOutageState?.mutationMarker?.status === "submitted") {
    if (!existingChild) {
      event("submitted_child_missing_requires_reconciliation", { childSupervisorRunId: existingOutageState.childSupervisorRunId || null });
      return result("blocked", "submitted_child_missing_requires_reconciliation", { events, counts, outageState: existingOutageState });
    }
    const terminal = terminalChildResult(existingOutageState, existingChild, { config, source });
    if (terminal) {
      if (!dryRun) writeOutageResubmissionState(config, terminal.outageState);
      event("submitted_terminal_child_classified", { childSupervisorRunId: existingChild.runId, status: terminal.terminalStatus });
      return result(terminal.terminalStatus, terminal.reasonCode, { events, counts, outageState: terminal.outageState, childRunId: existingChild.runId, childRecoveryProof: terminal.childRecoveryProof });
    }
    const confirmed = transitionOutageMarker(existingOutageState, {
      status: "confirmed_running",
      childSupervisorRunId: existingChild.runId,
      specDigest: existingOutageState.mutationMarker?.specDigest || childDigest(existingChild),
      reasonCode: "submitted_child_reconciled",
    });
    if (!dryRun) writeOutageResubmissionState(config, confirmed);
    event("submitted_child_reconciled", { childSupervisorRunId: existingChild.runId });
    return result("confirmed_existing_child", "submitted_child_reconciled", { events, counts, outageState: confirmed, childRunId: existingChild.runId });
  }
  if (existingOutageState?.mutationMarker?.status === "confirmed_running") {
    if (!existingChild) {
      event("confirmed_child_missing_requires_reconciliation", { childSupervisorRunId: existingOutageState.childSupervisorRunId || null });
      return result("blocked", "confirmed_child_missing_requires_reconciliation", { events, counts, outageState: existingOutageState });
    }
    const terminal = terminalChildResult(existingOutageState, existingChild, { config, source });
    if (terminal) {
      if (!dryRun) writeOutageResubmissionState(config, terminal.outageState);
      event("confirmed_terminal_child_classified", { childSupervisorRunId: existingChild.runId, status: terminal.terminalStatus });
      return result(terminal.terminalStatus, terminal.reasonCode, { events, counts, outageState: terminal.outageState, childRunId: existingChild.runId, childRecoveryProof: terminal.childRecoveryProof });
    }
    event("confirmed_running_child_observed", { childSupervisorRunId: existingChild.runId });
    return result("observed", "confirmed_running_child_observed", { events, counts, outageState: existingOutageState, childRunId: existingChild.runId });
  }
  if (existingChild) {
    if (existingOutageState?.mutationMarker?.status === "planned") {
      const terminal = terminalChildResult(existingOutageState, existingChild, { config, source });
      if (terminal) {
        if (!dryRun) writeOutageResubmissionState(config, terminal.outageState);
        event("planned_terminal_child_classified", { childSupervisorRunId: existingChild.runId, status: terminal.terminalStatus });
        return result(terminal.terminalStatus, terminal.reasonCode, { events, counts, outageState: terminal.outageState, childRunId: existingChild.runId, childRecoveryProof: terminal.childRecoveryProof });
      }
      const reconciled = transitionOutageMarker(existingOutageState, {
        status: "confirmed_running",
        childSupervisorRunId: existingChild.runId,
        specDigest: childDigest(existingChild) || existingOutageState.mutationMarker?.specDigest,
        reasonCode: "planned_child_reconciled",
      });
      if (!dryRun) writeOutageResubmissionState(config, reconciled);
      event("planned_child_reconciled", { childSupervisorRunId: existingChild.runId });
      return result("confirmed_existing_child", "planned_child_reconciled", { events, counts, outageState: reconciled, childRunId: existingChild.runId });
    }
    event("existing_child_reused", { childSupervisorRunId: existingChild.runId });
    return result("noop", "existing_child_resubmission_present", { events, counts, childRunId: existingChild.runId });
  }

  event("recovery_state_inspected");

  event("source_eligibility_checked");
  eligibility = eligibility || evaluateSourceRunEligibility({ config, source, failure: input.failure });
  if (!eligibility.eligible) {
    event("terminal_nonretryable_block", { reasonCode: eligibility.reasonCode, classification: eligibility.classification });
    return result("blocked", eligibility.reasonCode, { events, counts, classification: eligibility.classification });
  }

  correlation = correlation || buildCorrelation(source, eligibility.classification);
  if (existingOutageState) {
    const drift = verifyOutageCorrelation(existingOutageState, correlation);
    if (!drift.ok) return result("blocked", drift.reasonCode, { events, counts, drift });
  }

  event("head_bound_evidence_checked");
  if (input.currentIdentity?.branchName && input.currentIdentity.branchName !== source.branchName) {
    return result("blocked", "branch_identity_mismatch", { events, counts });
  }
  if (input.currentIdentity?.baseSha && input.currentIdentity.baseSha !== source.baseSha) {
    return result("blocked", "base_identity_mismatch", { events, counts });
  }
  let invalidatedRecoveryState = null;
  if (input.currentIdentity?.currentHeadSha && input.currentIdentity.currentHeadSha !== source.currentHeadSha) {
    invalidatedRecoveryState = recovery
      ? invalidateEvidenceForHeadChange(recovery, {
          newHeadSha: input.currentIdentity.currentHeadSha,
          reasonCode: "outage_resubmission_head_changed",
        })
      : null;
    if (invalidatedRecoveryState && !dryRun) {
      try {
        (input.writeRecoveryState || writeRecoveryState)(config, invalidatedRecoveryState);
      } catch {
        event("stale_head_evidence_invalidation_persistence_failed", { reasonCode: "recovery_stale_head_invalidation_persistence_failed" });
        return result("blocked", "recovery_stale_head_invalidation_persistence_failed", { events, counts, recoveryState: recovery });
      }
    }
    event("stale_head_evidence_invalidated", {
      currentHeadSha: input.currentIdentity.currentHeadSha,
      persisted: Boolean(invalidatedRecoveryState && !dryRun),
      durable: Boolean(invalidatedRecoveryState && !dryRun),
    });
    return result("blocked", "stale_head_evidence_regeneration_required", { events, counts, recoveryState: invalidatedRecoveryState });
  }
  event("circuit_checked");
  let circuit;
  let schedule;
  try {
    circuit = evaluateOutageCircuit({
      config: policy,
      records: input.circuitRecords || [],
      now,
      providerDomain: eligibility.classification.providerDomain,
      outageFingerprint: eligibility.classification.fingerprint,
      existing: input.circuitState || null,
    });
    schedule = planOutageResubmissionSchedule({
      config: policy,
      firstFailureAt: source.firstFailureAt,
      lastFailureAt: source.lastFailureAt,
      attemptNumber: source.attemptNumber || 1,
      now,
      rng: input.rng || Math.random,
    });
  } catch (error) {
    event("source_schedule_identity_blocked", { reasonCode: error.message });
    return result("blocked", "source_schedule_evidence_invalid", { events, counts, classification: eligibility.classification });
  }
  const finalGate = applyOutageOperatorGate({
    operatorControl: input.operatorControl || {},
    circuit,
    schedule,
    classification: eligibility.classification,
  });
  if (!finalGate.allowed) {
    if (isExhaustionReason(finalGate.reasonCode)) {
      return terminalizeOutageExhaustion({
        config,
        source,
        existingOutageState,
        correlation,
        classification: eligibility.classification,
        schedule,
        circuit,
        finalGate,
        policy,
        dryRun,
        events,
        counts,
        event,
        writeState: input.writeOutageState || writeOutageResubmissionState,
      });
    }
    event(finalGate.reasonCode === "operator_pause" || finalGate.reasonCode === "operator_stop" ? "operator_pause_stop" : "resubmission_deferred", finalGate);
    return result("deferred", finalGate.reasonCode, { events, counts, circuit, schedule, classification: eligibility.classification });
  }

  if (config.allowExistingPrRecovery !== true) {
    const reasonCode = "recoverable_state_requires_explicit_recovery_capability";
    event("outage_recovery_capability_blocked", { reasonCode });
    return result("blocked", reasonCode, { events, counts, circuit, schedule, classification: eligibility.classification });
  }

  const currentPrIdentity = validateCurrentPrIdentityForSource(source, input.currentIdentity);
  if (!currentPrIdentity.ok) return result("blocked", currentPrIdentity.reasonCode, { events, counts });

  const plannedState = existingOutageState || createOutageResubmissionState({
    correlation,
    outage: {
      providerDomain: eligibility.classification.providerDomain,
      outageClass: eligibility.classification.outageClass,
      outageFingerprint: eligibility.classification.fingerprint,
      firstFailureAt: source.firstFailureAt,
      lastFailureAt: source.lastFailureAt,
      reasonCode: eligibility.classification.reasonCode,
    },
    schedule: {
      attemptNumber: source.attemptNumber || 1,
      nextEligibleAt: schedule.nextEligibleAt,
      deadlineAt: schedule.deadlineAt,
      maxAttempts: policy.maxAttempts,
      maxWallClockMs: policy.maxWallClockMs,
    },
    circuit,
  });

  const recoveryTarget = validateOutageRecoveryTargetForSource({
    source,
    recovery,
    recoveryStates: input.recoveryStates,
    outageState: plannedState,
  });
  if (!recoveryTarget.ok) {
    event("outage_recovery_target_blocked", { reasonCode: recoveryTarget.reasonCode, field: recoveryTarget.field });
    return result("blocked", recoveryTarget.reasonCode, { events, counts, outageState: plannedState, recoveryTarget });
  }

  event("resubmission_planned");

  let boundRecoveryState = recoveryTarget.state;
  if (!dryRun) {
    const binding = bindOutageResubmissionToRecoveryState(recoveryTarget.state, recoveryTarget.target);
    if (!binding.ok) {
      event("outage_recovery_binding_blocked", { reasonCode: binding.reasonCode });
      return result("blocked", binding.reasonCode, { events, counts, outageState: plannedState, recoveryTarget });
    }
    boundRecoveryState = binding.state;
    try {
      if (binding.changed) (input.writeRecoveryState || writeRecoveryState)(config, boundRecoveryState);
    } catch (error) {
      event("outage_recovery_binding_persistence_failed", { reasonCode: "recovery_outage_binding_persistence_failed" });
      return result("blocked", "recovery_outage_binding_persistence_failed", { events, counts, outageState: plannedState, recoveryTarget });
    }
    event(binding.changed ? "outage_recovery_binding_persisted" : "outage_recovery_binding_preserved", { markerKey: binding.binding.markerKey });
  }

  let child;
  try {
    child = buildChildRunPlan({ config, source, state: plannedState, recoveryTarget: recoveryTarget.target, now, childRunId: input.childRunId });
  } catch (error) {
    event("child_spec_identity_blocked", { reasonCode: error.message });
    return result("blocked", "child_spec_identity_invalid", { events, counts, outageState: plannedState });
  }
  const beforeSubmitGate = applyOutageOperatorGate({ operatorControl: input.operatorControlBeforeSubmit || input.operatorControl || {} });
  if (beforeSubmitGate.reasonCode === "operator_pause" || beforeSubmitGate.reasonCode === "operator_stop") {
    event("operator_pause_stop", beforeSubmitGate);
    return result("blocked", beforeSubmitGate.reasonCode, { events, counts, outageState: plannedState, child });
  }

  if (dryRun) {
    const dryState = transitionOutageMarker(plannedState, {
      status: "planned",
      childSupervisorRunId: child.spec.runId,
      specDigest: child.specSha256,
      reasonCode: "dry_run_planned",
    });
    event("dry_run_child_spec_planned", { childSupervisorRunId: child.spec.runId, specSha256: child.specSha256 });
    return result("planned", "dry_run_no_mutation", { events, counts, outageState: dryState, child, recoveryState: recoveryTarget.state });
  }

  if (config.sessionLifecycle?.enabled === true) {
    if (!input.sessionLifecycleState) return result("blocked", "session_lifecycle_state_missing", { events, counts });
    if (config.sessionLifecycle.allowRecoveryTakeover !== true) return result("blocked", "session_lifecycle_recovery_takeover_disabled", { events, counts });
    const lifecycle = consumeSupervisorInterruptionPlanner(input.sessionLifecycleState, {
      config,
      recoveryState: recovery,
      expectedEffects: input.lifecycleEffects || {},
      evidenceAdapters: input.lifecycleEvidenceAdapters || {},
    });
    if (!lifecycle.ok || lifecycle.active) {
      const reasonCode = lifecycle.reasonCode || "session_lifecycle_supervisor_takeover_blocked";
      event("session_lifecycle_takeover_blocked", { reasonCode });
      return result("blocked", reasonCode, { events, counts, sessionLifecycle: lifecycle });
    }
    const persistedLifecycle = persistSessionLifecycleState(config, lifecycle.state);
    if (!persistedLifecycle.ok) return result("blocked", persistedLifecycle.reasonCode, { events, counts, sessionLifecycle: persistedLifecycle });
    event("session_lifecycle_recovery_planned", { reasonCode: lifecycle.classification?.reasonCode, earliestSafePhase: lifecycle.earliestSafePhase });
  }

  const uncertain = transitionOutageMarker(plannedState, {
    status: "submission_uncertain",
    childSupervisorRunId: child.spec.runId,
    specDigest: child.specSha256,
    reasonCode: "submission_started",
  });
  writeOutageResubmissionState(config, uncertain);
  writeImmutableRunSpec(child.spec, config.logsRoot);
  writeSupervisorState(child.spec.runId, { state: "submitted", parentSupervisorRunId: source.supervisorRunId, specSha256: child.specSha256 }, config.logsRoot);
  counts.systemdCalls += 1;
  counts.realMutationCalls += 1;
  const submitted = startUnit(child.spec.runId);
  if (!submitted.ok) {
    writeSupervisorState(child.spec.runId, {
      state: submitted.state || "submission_failed",
      parentSupervisorRunId: source.supervisorRunId,
      terminalReason: "child_submission_failed",
      systemdStatus: submitted.status ?? null,
      systemdUnitName: submitted.unitName || null,
      finishedAt: now.toISOString(),
    }, config.logsRoot);
    const blocked = transitionOutageMarker(uncertain, { status: "blocked", childSupervisorRunId: child.spec.runId, reasonCode: "child_submission_failed" });
    writeOutageResubmissionState(config, blocked);
    return result("blocked", "child_submission_failed", { events, counts, outageState: blocked, child, submitted });
  }
  const confirmed = transitionOutageMarker(uncertain, { status: "submitted", childSupervisorRunId: child.spec.runId, specDigest: child.specSha256, reasonCode: "child_submission_confirmed" });
  writeOutageResubmissionState(config, confirmed);
  event("child_submission_confirmed", { childSupervisorRunId: child.spec.runId });
  return result("submitted", "child_submission_confirmed", { events, counts, outageState: confirmed, child, submitted, recoveryState: boundRecoveryState });
}

export function consumeSupervisorInterruptionPlanner(state, options = {}) {
  if (!options.config || !options.recoveryState) return { ok: false, reasonCode: "authoritative_recovery_evidence_required" };
  const recoveryState = options.recoveryState;
  const evidence = collectAuthoritativeRecoveryEvidence(options.config, {
    repository: state.repository,
    issueNumber: state.logicalTask.issueNumber,
    taskKey: state.logicalTask.taskKey,
    runId: state.logicalTask.runId,
    claimIdentity: state.logicalTask.claimIdentity,
    sessionId: state.sessions.current,
    supervisorRunId: recoveryState.run?.supervisorRunId,
    branchName: state.branch.name,
    baseBranch: recoveryState.branch?.baseBranch || "main",
    baseSha: state.branch.baseSha,
    headSha: state.branch.headSha,
    prNumber: recoveryState.pr?.number || null,
    checkpointDigest: state.checkpoint.digest,
    checkpointValid: true,
    authority: state.mutationAuthority,
  }, options.expectedEffects || {}, options.evidenceAdapters || {});
  const inputs = plannerInputsFromAuthoritativeEvidence(evidence);
  if (!inputs.ok) return { ...inputs, authoritativeEvidence: evidence };
  return planInterruptionRecovery(state, inputs.liveEffects, { supervisorInterrupted: true, checkpointValid: true, ...inputs.interruption });
}

function terminalizeSourceCompletion({
  config,
  existingOutageState,
  dryRun,
  events,
  counts,
  event,
  writeState,
  reasonCode,
}) {
  event("head_bound_evidence_checked");
  event("source_already_recovered", { reasonCode });
  if (!existingOutageState) {
    return result("recovered", reasonCode, { events, counts, durable: false });
  }
  if (isTerminalOutageStatus(existingOutageState.mutationMarker?.status || existingOutageState.status)) {
    event("terminal_outage_marker_preserved", { status: existingOutageState.status });
    return result("noop", "terminal_outage_marker_preserved", { events, counts, outageState: existingOutageState });
  }
  const recoveredState = transitionOutageMarker(existingOutageState, {
    status: "recovered",
    childSupervisorRunId: existingOutageState.childSupervisorRunId || null,
    specDigest: existingOutageState.mutationMarker?.specDigest || existingOutageState.correlation?.originalSupervisorSpecDigest,
    reasonCode,
  });
  event("outage_source_completion_recovered", {
    reasonCode,
    dedupeKey: `${recoveredState.mutationMarker.key}:recovered:${reasonCode}`,
  });
  if (!dryRun) {
    try {
      writeState(config, recoveredState);
    } catch (error) {
      event("outage_source_recovery_persistence_failed", { reasonCode, detail: error.message });
      return result("blocked", "outage_source_recovery_persistence_failed", {
        events,
        counts,
        outageState: existingOutageState,
      });
    }
  }
  return result("recovered", reasonCode, {
    events,
    counts,
    outageState: recoveredState,
    notificationIntent: {
      kind: "outage_source_recovered",
      dedupeKey: `${recoveredState.mutationMarker.key}:recovered:${reasonCode}`,
      reasonCode,
    },
    durable: dryRun ? false : true,
  });
}

function terminalizeOutageExhaustion({
  config,
  source,
  existingOutageState,
  correlation,
  classification,
  schedule,
  circuit,
  finalGate,
  policy,
  dryRun,
  events,
  counts,
  event,
  writeState,
}) {
  const reasonCode = finalGate.reasonCode;
  const terminalEvent = reasonCode === "outage_resubmission_attempts_exhausted" ? "outage_attempts_exhausted" : "outage_wall_clock_exhausted";
  const exhaustedState = existingOutageState
    ? rebuildExhaustedOutageState(existingOutageState, {
        correlation,
        outage: {
          providerDomain: classification.providerDomain,
          outageClass: classification.outageClass,
          outageFingerprint: classification.fingerprint,
          firstFailureAt: source.firstFailureAt,
          lastFailureAt: source.lastFailureAt,
          reasonCode: classification.reasonCode,
        },
        schedule: {
          attemptNumber: source.attemptNumber || policy.maxAttempts,
          nextEligibleAt: schedule.nextEligibleAt || schedule.deadlineAt,
          deadlineAt: schedule.deadlineAt,
          maxAttempts: policy.maxAttempts,
          maxWallClockMs: policy.maxWallClockMs,
        },
        circuit,
        attemptNumber: source.attemptNumber || policy.maxAttempts,
        reasonCode,
        specDigest: correlation.originalSupervisorSpecDigest,
      })
    : createOutageResubmissionState({
        correlation,
        outage: {
          providerDomain: classification.providerDomain,
          outageClass: classification.outageClass,
          outageFingerprint: classification.fingerprint,
          firstFailureAt: source.firstFailureAt,
          lastFailureAt: source.lastFailureAt,
          reasonCode: classification.reasonCode,
        },
        schedule: {
          attemptNumber: source.attemptNumber || policy.maxAttempts,
          nextEligibleAt: schedule.nextEligibleAt || schedule.deadlineAt,
          deadlineAt: schedule.deadlineAt,
          maxAttempts: policy.maxAttempts,
          maxWallClockMs: policy.maxWallClockMs,
        },
        circuit,
        status: "exhausted",
        reasonCode,
      });

  event(terminalEvent, { reasonCode, attemptNumber: exhaustedState.mutationMarker.attemptNumber });
  event("outage_terminal_exhaustion_intent", {
    reasonCode,
    dedupeKey: `${exhaustedState.mutationMarker.key}:exhausted:${reasonCode}`,
  });

  if (!dryRun) {
    try {
      writeState(config, exhaustedState);
    } catch (error) {
      event("outage_exhaustion_persistence_failed", { reasonCode, detail: error.message });
      return result("blocked", "outage_exhaustion_persistence_failed", {
        events,
        counts,
        circuit,
        schedule,
        classification,
        outageState: existingOutageState || null,
      });
    }
  }

  return result("exhausted", reasonCode, {
    events,
    counts,
    circuit,
    schedule,
    classification,
    outageState: exhaustedState,
    notificationIntent: {
      kind: "outage_terminal_exhaustion",
      event: terminalEvent,
      dedupeKey: `${exhaustedState.mutationMarker.key}:exhausted:${reasonCode}`,
      reasonCode,
    },
    durable: dryRun ? false : true,
  });
}

function buildChildRunPlan({ config, source, state, recoveryTarget, now, childRunId }) {
  const runId = childRunId || generateRunId(now);
  const spec = buildRunSpec({
    runId,
    maxTasks: source.maxTasks || 1,
    maxRuntime: source.maxRuntime || "3h",
    mode: source.mode || "trusted",
    profile: source.runnerProfile,
    initialOriginMainSha: source.baseSha,
    requestedBy: "outage-controller",
    parentSupervisorRunId: source.supervisorRunId,
    parentRunnerRunId: source.runnerRunId,
    sourceIssueNumber: source.issueNumber,
    sourceBranchName: source.branchName,
    outageResubmission: {
      attemptNumber: state.mutationMarker.attemptNumber,
      markerKey: state.mutationMarker.key,
      outageFingerprint: state.outage.outageFingerprint,
      originalSupervisorSpecDigest: source.originalSupervisorSpecDigest,
      taskKey: source.taskKey,
      currentHeadSha: source.currentHeadSha,
      prNumber: source.prNumber ?? null,
      prHeadSha: source.prHeadSha ?? null,
    },
    recoveryOnlyTarget: recoveryTarget,
    allowMissingConfig: true,
    logsRoot: config.logsRoot,
  }).spec;
  if (spec.runnerConfigSha256 !== source.runnerConfigDigest) {
    throw new Error("runner_config_digest_mismatch");
  }
  return { spec, specSha256: sha256Text(canonicalJson(spec)) };
}

function validateOutageRecoveryTargetForSource({ source, recovery, recoveryStates, outageState }) {
  const candidates = Array.isArray(recoveryStates) ? recoveryStates.filter(Boolean) : recovery ? [recovery] : [];
  if (candidates.length === 0) return { ok: false, reasonCode: "outage_recovery_target_missing" };
  if (candidates.length > 1) return { ok: false, reasonCode: "outage_recovery_target_ambiguous", count: candidates.length };
  const state = candidates[0];
  if (["completed", "stopped"].includes(state.phase)) return { ok: false, reasonCode: "outage_recovery_target_not_safe", field: "phase" };
  const boundary = firstIncompleteContinuationAction(state);
  if (!boundary.ok) return { ok: false, reasonCode: "outage_recovery_target_not_safe", field: boundary.phase || "phase" };
  const regeneration = recoveryRequiresExactHeadEvidenceRegeneration(state);
  if (regeneration.required) {
    return {
      ok: false,
      reasonCode: regeneration.reasonCode,
      staleEvidenceKinds: regeneration.staleEvidenceKinds,
    };
  }
  const target = recoveryOnlyTargetFromState(state, outageState);
  const targetPrProof = validateRecoveryOnlyTargetPrProof(target);
  if (!targetPrProof.ok) return targetPrProof;
  const checks = [
    ["taskKey", target.taskKey, source.taskKey],
    ["issueNumber", target.issueNumber, source.issueNumber],
    ["branchName", target.branchName, source.branchName],
    ["baseSha", target.baseSha, source.baseSha],
    ["currentHeadSha", target.currentHeadSha, source.currentHeadSha],
    ["prNumber", target.prNumber, source.prNumber ?? null],
    ["prHeadSha", target.prHeadSha, source.prHeadSha ?? null],
    ["runnerRunId", target.runnerRunId, source.runnerRunId],
    ["supervisorRunId", target.supervisorRunId, source.supervisorRunId],
    ["originalSupervisorSpecDigest", target.originalSupervisorSpecDigest, source.originalSupervisorSpecDigest],
    ["markerKey", target.markerKey, outageState?.mutationMarker?.key],
    ["outageFingerprint", target.outageFingerprint, outageState?.outage?.outageFingerprint || source.outageFingerprint],
    ["attemptNumber", target.attemptNumber, outageState?.mutationMarker?.attemptNumber || source.attemptNumber || 1],
  ];
  const mismatch = checks.find(([, actual, expected]) => actual !== expected);
  if (mismatch) return { ok: false, reasonCode: "outage_recovery_target_mismatch", field: mismatch[0] };
  return { ok: true, target, boundary, state };
}

function validateRecoveryOnlyTargetPrProof(target) {
  if (!Number.isSafeInteger(target.prNumber) || target.prNumber < 1 || target.prNumber > 9999999) {
    return { ok: false, reasonCode: "outage_recovery_target_mismatch", field: "prNumber" };
  }
  if (!isSha(target.prHeadSha)) {
    return { ok: false, reasonCode: "outage_recovery_target_mismatch", field: "prHeadSha" };
  }
  return { ok: true };
}

function resolveCanonicalOutageState({ config, source, failure, stateKey }) {
  const validation = validateExistingSourceIdentityForOutageState({ source, failure });
  if (!validation.ok) return validation;
  const correlation = buildCorrelation(source, validation.classification);
  const canonicalKey = outageResubmissionStorageKey(correlation);
  const explicitKey = typeof stateKey === "string" ? stateKey : stateKey ? outageResubmissionStorageKey(stateKey) : null;
  if (explicitKey && explicitKey !== canonicalKey) {
    return {
      ok: true,
      explicitConflict: true,
      reasonCode: "outage_resubmission_state_key_conflict",
      stateKey: canonicalKey,
      eligibility: null,
      correlation,
    };
  }
  const loaded = loadOutageResubmissionState(config, canonicalKey);
  return {
    ok: true,
    explicitConflict: false,
    reasonCode: loaded.ok ? "canonical_outage_state_loaded" : loaded.reasonCode,
    stateKey: canonicalKey,
    loaded,
    eligibility: null,
    correlation,
  };
}

function recoveryOnlyTargetFromState(state, outageState) {
  return {
    taskKey: state.taskKey || null,
    issueNumber: state.issue?.number || null,
    branchName: state.branch?.name || null,
    baseSha: state.branch?.baseSha || null,
    currentHeadSha: state.branch?.currentHeadSha || null,
    prNumber: state.pr?.number || null,
    prHeadSha: state.pr?.headSha || null,
    runnerRunId: state.run?.runId || null,
    supervisorRunId: state.run?.supervisorRunId || null,
    originalSupervisorSpecDigest: outageState?.correlation?.originalSupervisorSpecDigest || null,
    markerKey: outageState?.mutationMarker?.key || null,
    outageFingerprint: outageState?.outage?.outageFingerprint || null,
    attemptNumber: outageState?.mutationMarker?.attemptNumber || null,
  };
}

function reconcileExactChild(children, source, outageState) {
  const authoritative = (children || []).filter((child) => child && typeof child === "object");
  const canonical = canonicalizeChildRepresentations(authoritative);
  if (!canonical.ok) return canonical;
  const intendedRunId = outageState?.childSupervisorRunId || outageState?.mutationMarker?.childSupervisorRunId || null;

  const exact = [];
  const indeterminate = [];
  const identityMismatches = [];
  for (const child of canonical.children) {
    const correlation = classifyChildCorrelation(child, source, outageState);
    if (correlation.kind === "exact") exact.push(child);
    if (correlation.kind === "indeterminate") indeterminate.push({ child, missing: correlation.missing });
    if (correlation.kind === "identity_mismatch") identityMismatches.push({ child, mismatches: correlation.mismatches });
  }

  if (identityMismatches.length > 0) {
    return {
      ok: false,
      reasonCode: "outage_child_identity_mismatch_requires_reconciliation",
      mismatches: [...new Set(identityMismatches.flatMap((item) => item.mismatches))],
      candidates: identityMismatches.length,
      candidateIds: identityMismatches.map((item) => ({ runId: item.child.runId || null, specDigest: childDigest(item.child) })).slice(0, 10),
    };
  }

  if (exact.length > 1 || indeterminate.length > 0) {
    return {
      ok: false,
      reasonCode: "outage_child_ambiguous_requires_reconciliation",
      candidates: exact.length + indeterminate.length,
      candidateIds: [...exact, ...indeterminate.map((item) => item.child)].map((child) => ({ runId: child.runId || null, specDigest: childDigest(child) })).slice(0, 10),
    };
  }

  const child = exact[0] || null;
  if (intendedRunId && child && child.runId !== intendedRunId) {
    return { ok: false, reasonCode: "outage_child_identity_mismatch_requires_reconciliation", mismatches: ["childLogicalId"], intendedRunId, correlatedRunId: child.runId };
  }
  if (intendedRunId && !child) {
    const intended = canonical.children.find((candidate) => candidate.runId === intendedRunId) || null;
    if (intended) {
      return {
        ok: false,
        reasonCode: "outage_child_identity_mismatch_requires_reconciliation",
        mismatches: exactChildMismatches(intended, source, outageState),
        intendedRunId,
      };
    }
  }
  if (!child) return { ok: true, child: null, reasonCode: "exact_child_absent" };
  const mismatches = exactChildMismatches(child, source, outageState);
  if (mismatches.length > 0) {
    return { ok: false, reasonCode: "outage_child_identity_mismatch_requires_reconciliation", mismatches };
  }
  return { ok: true, child, reasonCode: "exact_child_found" };
}

function canonicalizeChildRepresentations(children) {
  const byRunId = new Map();
  for (const child of children) {
    if (!child.runId) continue;
    const digest = childDigest(child);
    const existing = byRunId.get(child.runId);
    if (!existing) {
      byRunId.set(child.runId, { ...child });
      continue;
    }
    const existingDigest = childDigest(existing);
    if ((existingDigest || null) !== (digest || null)) {
      return {
        ok: false,
        reasonCode: "outage_child_identity_mismatch_requires_reconciliation",
        mismatches: ["childSpecDigest"],
        candidateIds: [{ runId: child.runId, specDigest: existingDigest || null }, { runId: child.runId, specDigest: digest || null }],
      };
    }
    const conflicts = conflictingChildIdentityFields(existing, child);
    if (conflicts.length > 0) {
      return {
        ok: false,
        reasonCode: "outage_child_identity_mismatch_requires_reconciliation",
        mismatches: conflicts,
        candidateIds: [{ runId: child.runId, specDigest: digest || null }],
      };
    }
    byRunId.set(child.runId, mergeChildRepresentations(existing, child));
  }
  return { ok: true, children: [...byRunId.values()] };
}

function classifyChildCorrelation(child, source, outageState) {
  const sourceFields = sourceCorrelationChecks(child, source, outageState);
  const missingExpectedMarker = sourceFields
    .filter((check) => ["attemptNumber", "outageFingerprint", "markerKey", "childSpecDigest"].includes(check.field))
    .filter((check) => check.expected === null || check.expected === undefined)
    .map((check) => check.field);
  if (missingExpectedMarker.length > 0) return { kind: "indeterminate", missing: missingExpectedMarker };
  if (sourceFields.every((check) => correlationFieldMatches(check))) return { kind: "exact" };

  const markerIdentityFields = new Set(["attemptNumber", "outageFingerprint", "markerKey"]);
  const childArtifactFields = new Set(["childLogicalId", "childSpecDigest"]);
  const sourceCore = sourceFields.filter((check) => !markerIdentityFields.has(check.field) && !childArtifactFields.has(check.field));
  const hasCoreConflict = sourceCore.some((check) => {
    if (strictOptionalExactFields.has(check.field)) return false;
    return check.expected !== null && check.expected !== undefined && check.actual !== null && check.actual !== undefined && check.actual !== check.expected;
  });
  if (hasCoreConflict) return { kind: "unrelated" };

  const strongCoreFields = new Set(["parentSupervisorRunId", "parentRunnerRunId", "taskKey", "sourceIssueNumber", "sourceBranchName", "baseSha", "currentHeadSha", "runnerProfile", "runnerConfigDigest", "originalSupervisorSpecDigest"]);
  const hasStrongCoreMatch = sourceCore
    .filter((check) => strongCoreFields.has(check.field))
    .some((check) => check.expected !== null && check.expected !== undefined && check.actual === check.expected);
  if (!hasStrongCoreMatch) return { kind: "unrelated" };

  const markerIdentity = sourceFields.filter((check) => markerIdentityFields.has(check.field));
  const markerConflict = markerIdentity.some((check) => check.expected !== null && check.expected !== undefined && check.actual !== null && check.actual !== undefined && check.actual !== check.expected);
  if (markerConflict) {
    return {
      kind: "identity_mismatch",
      mismatches: markerIdentity.filter((check) => correlationFieldMismatches(check)).map((check) => check.field),
    };
  }

  const strictOptionalMismatches = sourceCore
    .filter((check) => strictOptionalExactFields.has(check.field))
    .filter((check) => correlationFieldMismatches(check))
    .map((check) => check.field);
  if (strictOptionalMismatches.length > 0) return { kind: "identity_mismatch", mismatches: strictOptionalMismatches };

  const missingCoreOrMarker = [...sourceCore, ...markerIdentity]
    .filter((check) => check.expected !== null && check.expected !== undefined && (check.actual === null || check.actual === undefined))
    .map((check) => check.field);
  if (missingCoreOrMarker.length > 0) return { kind: "indeterminate", missing: missingCoreOrMarker };

  const sameMarker = markerIdentity.every((check) => check.expected !== null && check.expected !== undefined && check.actual === check.expected);
  if (sameMarker) {
    const artifactMismatches = sourceFields
      .filter((check) => check.field === "childSpecDigest")
      .filter((check) => check.expected !== null && check.expected !== undefined && check.actual !== check.expected)
      .map((check) => check.field);
    if (artifactMismatches.length > 0) return { kind: "identity_mismatch", mismatches: artifactMismatches };
  }

  const missing = sourceFields
    .filter((check) => check.expected !== null && check.expected !== undefined && (check.actual === null || check.actual === undefined))
    .map((check) => check.field);
  if (missing.length > 0) return { kind: "indeterminate", missing };

  return { kind: "unrelated" };
}

function exactChildMismatches(child, source, outageState) {
  return sourceCorrelationChecks(child, source, outageState)
    .filter((check) => correlationFieldMismatches(check))
    .map((check) => check.field);
}

function sourceCorrelationChecks(child, source, outageState) {
  const marker = outageState?.mutationMarker || {};
  const outage = child.outageResubmission || {};
  return [
    ["parentSupervisorRunId", child.parentSupervisorRunId, source.supervisorRunId],
    ["parentRunnerRunId", child.parentRunnerRunId, source.runnerRunId],
    ["taskKey", child.taskKey || child.sourceTaskKey || outage.taskKey, source.taskKey],
    ["sourceIssueNumber", child.sourceIssueNumber, source.issueNumber],
    ["sourceBranchName", child.sourceBranchName, source.branchName],
    ["baseSha", firstDefined(child.baseSha, child.initialOriginMainSha, outage.baseSha), source.baseSha],
    ["currentHeadSha", firstDefined(child.currentHeadSha, child.headSha, outage.currentHeadSha), source.currentHeadSha],
    ["prNumber", firstDefined(child.prNumber, outage.prNumber, null), source.prNumber ?? null],
    ["prHeadSha", firstDefined(child.prHeadSha, outage.prHeadSha, null), source.prHeadSha ?? null],
    ["runnerProfile", firstDefined(child.runnerProfile, child.profile, outage.runnerProfile), source.runnerProfile],
    ["runnerConfigDigest", firstDefined(child.runnerConfigDigest, child.runnerConfigSha256, outage.runnerConfigDigest), source.runnerConfigDigest],
    ["originalSupervisorSpecDigest", firstDefined(child.originalSupervisorSpecDigest, outage.originalSupervisorSpecDigest), source.originalSupervisorSpecDigest],
    ["attemptNumber", outage.attemptNumber, marker.attemptNumber],
    ["outageFingerprint", outage.outageFingerprint, outageState?.outage?.outageFingerprint || source.outageFingerprint],
    ["markerKey", outage.markerKey, marker.key],
    ["childLogicalId", child.runId || outage.childLogicalId, outage.childLogicalId || child.runId],
    ["childSpecDigest", childDigest(child), marker.specDigest],
  ].map(([field, actual, expected]) => ({ field, actual, expected }));
}

function conflictingChildIdentityFields(left, right) {
  const fields = sourceCorrelationChecks(right, {
    taskKey: firstDefined(left.taskKey, left.sourceTaskKey, left.outageResubmission?.taskKey),
    supervisorRunId: left.parentSupervisorRunId,
    runnerRunId: left.parentRunnerRunId,
    issueNumber: left.sourceIssueNumber,
    branchName: left.sourceBranchName,
    baseSha: firstDefined(left.baseSha, left.initialOriginMainSha, left.outageResubmission?.baseSha),
    currentHeadSha: firstDefined(left.currentHeadSha, left.headSha, left.outageResubmission?.currentHeadSha),
    prNumber: firstDefined(left.prNumber, left.outageResubmission?.prNumber, null),
    prHeadSha: firstDefined(left.prHeadSha, left.outageResubmission?.prHeadSha, null),
    runnerProfile: firstDefined(left.runnerProfile, left.profile, left.outageResubmission?.runnerProfile),
    runnerConfigDigest: firstDefined(left.runnerConfigDigest, left.runnerConfigSha256, left.outageResubmission?.runnerConfigDigest),
    originalSupervisorSpecDigest: firstDefined(left.originalSupervisorSpecDigest, left.outageResubmission?.originalSupervisorSpecDigest),
  }, {
    mutationMarker: {
      attemptNumber: left.outageResubmission?.attemptNumber,
      key: left.outageResubmission?.markerKey,
      specDigest: childDigest(left),
    },
    outage: {
      outageFingerprint: left.outageResubmission?.outageFingerprint,
    },
  });
  return fields
    .filter((check) => !["childLogicalId"].includes(check.field))
    .filter((check) => correlationFieldMismatches(check))
    .map((check) => check.field);
}

const strictOptionalExactFields = new Set(["prNumber", "prHeadSha"]);

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function normalizeStrictOptional(value) {
  return value === undefined ? null : value;
}

function correlationFieldMatches(check) {
  if (strictOptionalExactFields.has(check.field)) {
    return normalizeStrictOptional(check.actual) === normalizeStrictOptional(check.expected);
  }
  return check.expected === null || check.expected === undefined || check.actual === check.expected;
}

function correlationFieldMismatches(check) {
  return !correlationFieldMatches(check);
}

function optionalPrIdentityMismatches({ actualPrNumber, actualPrHeadSha, expectedPrNumber, expectedPrHeadSha }) {
  const checks = [
    { field: "prNumber", actual: actualPrNumber, expected: expectedPrNumber ?? null },
    { field: "prHeadSha", actual: actualPrHeadSha, expected: expectedPrHeadSha ?? null },
  ];
  return checks
    .filter((check) => normalizeStrictOptional(check.actual) !== normalizeStrictOptional(check.expected))
    .map((check) => check.field);
}

function mergeChildRepresentations(left, right) {
  const merged = { ...left, ...right };
  merged.outageResubmission = { ...(left.outageResubmission || {}), ...(right.outageResubmission || {}) };
  return merged;
}

function childDigest(child) {
  return child?.specSha256 || child?.specDigest || child?.outageResubmission?.childSpecDigest || child?.outageResubmission?.specDigest || null;
}

function validateExistingSourceIdentityForOutageState({ source, failure }) {
  const validation = validateSourceEvidence(source);
  if (!validation.ok) return { ok: false, reasonCode: validation.reasonCode, field: validation.field };
  if (source.manualGate || source.authorityGate || source.destructiveGate) return { ok: false, reasonCode: "source_manual_or_authority_gate" };
  if (source.staleEvidence) return { ok: false, reasonCode: "source_stale_evidence" };
  const classification = classifyOutageFailure(failure || source.failure || {});
  if (!classification.retryable) return { ok: false, reasonCode: "source_failure_nonretryable", classification };
  return { ok: true, classification };
}

function isTerminalChild(child) {
  return child?.terminal === true || ["completed", "failed", "blocked", "cancelled", "partial"].includes(child?.state) || Boolean(child?.terminalOutcome);
}

function isTerminalOutageStatus(status) {
  return ["recovered", "exhausted", "blocked"].includes(status);
}

function terminalChildResult(outageState, child, context = {}) {
  if (!isTerminalChild(child)) return null;
  const proof = classifyExactChildRecoveryProof({ outageState, child, config: context.config, source: context.source });
  const terminalStatus = proof.recovered ? "recovered" : "blocked";
  const reasonCode = proof.recovered
    ? "confirmed_child_recovered"
    : proof.reasonCode || "confirmed_child_terminal_blocked";
  return {
    terminalStatus,
    reasonCode,
    childRecoveryProof: proof,
    outageState: transitionOutageMarker(outageState, {
      status: terminalStatus,
      childSupervisorRunId: child.runId,
      specDigest: outageState.mutationMarker?.specDigest || childDigest(child),
      reasonCode,
    }),
  };
}

function classifyExactChildRecoveryProof({ outageState, child, config = {}, source = {} }) {
  if (child?.terminalOutcome !== "completed" && child?.state !== "completed") {
    return { recovered: false, reasonCode: "confirmed_child_terminal_blocked" };
  }
  if (!config?.logsRoot) return { recovered: false, reasonCode: "child_completed_without_exact_recovery_proof", detail: "logs_root_missing" };
  const resolution = resolveRunnerSummaryForSupervisor({
    logsRoot: config.logsRoot,
    supervisorRunId: child.runId,
    initialOriginMainSha: firstDefined(child.initialOriginMainSha, child.baseSha, source.baseSha),
    mode: firstDefined(child.mode, source.mode, "trusted"),
  });
  if (resolution.status !== resolverStatuses.matched || !resolution.runnerSummaryJsonPath) {
    return { recovered: false, reasonCode: "child_completed_without_exact_recovery_proof", detail: "trusted_summary_not_matched", resolutionStatus: resolution.status || "unknown" };
  }
  let summary;
  try {
    summary = JSON.parse(readFileSync(resolution.runnerSummaryJsonPath, "utf8"));
  } catch {
    return { recovered: false, reasonCode: "child_completed_without_exact_recovery_proof", detail: "trusted_summary_unreadable" };
  }
  const base = validateTrustedChildSummary(summary, { child, source, resolution });
  if (!base.ok) return { recovered: false, reasonCode: "child_completed_without_exact_recovery_proof", detail: base.reason };
  const matches = (Array.isArray(summary.iterations) ? summary.iterations : [])
    .map((iteration, index) => ({ iteration, index }))
    .filter(({ iteration }) => iterationMatchesSource(iteration, source));
  if (matches.length !== 1) {
    return {
      recovered: false,
      reasonCode: "child_completed_without_exact_recovery_proof",
      detail: matches.length === 0 ? "source_iteration_missing" : "source_iteration_ambiguous",
    };
  }
  const proof = validateMergedIteration(matches[0].iteration, source);
  if (!proof.ok) return { recovered: false, reasonCode: "child_completed_without_exact_recovery_proof", detail: proof.reason };
  return {
    recovered: true,
    reasonCode: "confirmed_child_recovered",
    runnerRunId: summary.runId,
    mergeSha: proof.mergeSha,
    iterationIndex: matches[0].index,
  };
}

function validateTrustedChildSummary(summary, { child, source, resolution }) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return { ok: false, reason: "summary_not_object" };
  if (summary.runId !== resolution.runnerRunId) return { ok: false, reason: "summary_runner_run_id_mismatch" };
  if (child.runnerRunId && summary.runId !== child.runnerRunId) return { ok: false, reason: "child_runner_run_id_mismatch" };
  if (summary.supervisorRunId !== child.runId) return { ok: false, reason: "summary_supervisor_run_id_mismatch" };
  if (summary.baseOriginMainSha !== source.baseSha) return { ok: false, reason: "summary_base_mismatch" };
  if (!isIsoTimestamp(summary.startedAt) || !isIsoTimestamp(summary.finishedAt)) return { ok: false, reason: "summary_terminal_timestamps_invalid" };
  if (!Array.isArray(summary.iterations) || summary.iterations.length === 0) return { ok: false, reason: "summary_iterations_missing" };
  const terminal = validateRouteBTerminalSummary(summary);
  if (!terminal.ok) return terminal;
  return { ok: true };
}

function iterationMatchesSource(iteration = {}, source = {}) {
  return validateExactRouteBIterationIdentity(iteration, source).ok;
}

function validateExactRouteBIterationIdentity(iteration = {}, source = {}) {
  if (!iteration || typeof iteration !== "object" || Array.isArray(iteration)) return { ok: false, reason: "iteration_identity_not_object" };
  const sourceValidation = validateRouteBSourceIdentity(source);
  if (!sourceValidation.ok) return sourceValidation;
  const issue = validatePositiveIntegerField(iteration.issue?.number, source.issueNumber, "issue_number");
  if (!issue.ok) return issue;
  const pr = iteration.pr || {};
  const autoMerge = iteration.autoMerge || {};
  const prNumber = validatePositiveIntegerField(firstDefined(pr.number, autoMerge.prNumber), source.prNumber, "pr_number");
  if (!prNumber.ok) return prNumber;
  const branchName = firstDefined(iteration.branchName, pr.headRefName, autoMerge.headRefName, autoMerge.branchName, iteration.recovery?.state?.branchName);
  const branch = validateStringField(branchName, source.branchName, "branch_name");
  if (!branch.ok) return branch;
  const baseSha = firstDefined(iteration.baseOriginMainSha, autoMerge.baseSha, autoMerge.baseOriginMainSha);
  const base = validateShaField(baseSha, source.baseSha, "base_sha");
  if (!base.ok) return base;
  const headSha = firstDefined(iteration.runnerCreatedCommitSha, iteration.expectedHeadSha, pr.headRefOid, pr.headSha, autoMerge.prHeadSha, autoMerge.headSha);
  const head = validateShaField(headSha, source.currentHeadSha, "head_sha");
  if (!head.ok) return head;
  const prHeadSha = firstDefined(autoMerge.prHeadSha, pr.headRefOid, pr.headSha, iteration.runnerCreatedCommitSha);
  const prHead = validateShaField(prHeadSha, source.prHeadSha, "pr_head_sha");
  if (!prHead.ok) return prHead;
  return { ok: true };
}

function validateRouteBSourceIdentity(source = {}) {
  for (const [field, value] of [
    ["source_issue_number", source.issueNumber],
    ["source_pr_number", source.prNumber],
  ]) {
    if (!Number.isInteger(value) || value <= 0) return { ok: false, reason: `iteration_identity_${field}_invalid` };
  }
  for (const [field, value] of [
    ["source_branch_name", source.branchName],
  ]) {
    if (typeof value !== "string" || value.trim() === "" || value !== value.trim()) return { ok: false, reason: `iteration_identity_${field}_invalid` };
  }
  for (const [field, value] of [
    ["source_base_sha", source.baseSha],
    ["source_head_sha", source.currentHeadSha],
    ["source_pr_head_sha", source.prHeadSha],
  ]) {
    if (!isSha(value)) return { ok: false, reason: `iteration_identity_${field}_invalid` };
  }
  return { ok: true };
}

function validatePositiveIntegerField(actual, expected, field) {
  if (actual === undefined || actual === null) return { ok: false, reason: `iteration_identity_${field}_missing` };
  if (!Number.isInteger(actual) || actual <= 0) return { ok: false, reason: `iteration_identity_${field}_invalid` };
  if (actual !== expected) return { ok: false, reason: `iteration_identity_${field}_mismatch` };
  return { ok: true };
}

function validateStringField(actual, expected, field) {
  if (actual === undefined || actual === null) return { ok: false, reason: `iteration_identity_${field}_missing` };
  if (typeof actual !== "string" || actual.trim() === "" || actual !== actual.trim()) {
    return { ok: false, reason: `iteration_identity_${field}_invalid` };
  }
  if (actual !== expected) return { ok: false, reason: `iteration_identity_${field}_mismatch` };
  return { ok: true };
}

function validateShaField(actual, expected, field) {
  if (actual === undefined || actual === null) return { ok: false, reason: `iteration_identity_${field}_missing` };
  if (typeof actual !== "string" || actual.trim() === "" || actual !== actual.trim() || !isSha(actual)) {
    return { ok: false, reason: `iteration_identity_${field}_invalid` };
  }
  if (actual !== expected) return { ok: false, reason: `iteration_identity_${field}_mismatch` };
  return { ok: true };
}

const routeBTerminalSuccessStopReasons = new Set(["max-iterations-reached"]);
const routeBTerminalPositiveFields = Object.freeze({
  outcome: new Set(["completed", "success", "succeeded"]),
  result: new Set(["completed", "success", "succeeded"]),
  status: new Set(["completed", "success", "succeeded"]),
  terminalState: new Set(["completed"]),
  terminalOutcome: new Set(["completed"]),
});
const routeBTerminalNonProofValues = new Set([
  "no-eligible-work",
  "no_eligible_work",
  "max-runtime-reached",
  "max_runtime_reached",
  "blocked",
  "manual",
  "manual-gate",
  "authority",
  "authority-gate",
  "danger",
  "danger-gate",
  "partial",
  "cancelled",
  "canceled",
  "failed",
  "failure",
  "stopped",
  "recovery-blocked",
  "recoverable-work-blocked",
  "unknown",
  "missing-required",
]);
const routeBContradictoryTerminalPattern =
  /(^|[-_:])(no[-_]?eligible[-_]?work|max[-_]?runtime[-_]?reached|blocked|manual|authority|danger|partial|cancel(?:led|ed)?|fail(?:ed|ure)?|not[-_]?attempted|recovery[-_]?blocked|stopped|unknown|missing[-_]?required)([-_:]|$)/i;

function validateRouteBTerminalSummary(summary) {
  if (typeof summary.stopReason !== "string" || summary.stopReason.trim() === "") {
    return { ok: false, reason: "summary_stop_reason_missing" };
  }
  if (summary.stopReason !== summary.stopReason.trim()) return { ok: false, reason: "summary_stop_reason_invalid" };
  if (routeBContradictoryTerminalPattern.test(summary.stopReason)) {
    return { ok: false, reason: "summary_stop_reason_contradictory" };
  }
  if (!routeBTerminalSuccessStopReasons.has(summary.stopReason)) {
    return { ok: false, reason: knownRouteBNonProofStopReason(summary.stopReason)
      ? "summary_stop_reason_not_recovery_proof"
      : "summary_stop_reason_unknown" };
  }
  for (const [field, value] of Object.entries({
    outcome: summary.outcome,
    result: summary.result,
    status: summary.status,
    terminalState: summary.terminalState,
    terminalOutcome: summary.terminalOutcome,
  })) {
    if (value === undefined || value === null) continue;
    const validation = validateRouteBPositiveTerminalField(field, value);
    if (!validation.ok) return validation;
  }
  return { ok: true };
}

function knownRouteBNonProofStopReason(stopReason) {
  return ["no-eligible-work", "max-runtime-reached"].includes(stopReason);
}

function validateRouteBPositiveTerminalField(field, value) {
  if (typeof value !== "string" || value.trim() === "" || value !== value.trim()) {
    return { ok: false, reason: `summary_${field}_invalid` };
  }
  const normalized = value.toLowerCase();
  if (routeBContradictoryTerminalPattern.test(normalized) || routeBTerminalNonProofValues.has(normalized)) {
    return { ok: false, reason: `summary_${field}_contradictory` };
  }
  if (!routeBTerminalPositiveFields[field]?.has(normalized)) {
    return { ok: false, reason: `summary_${field}_unknown` };
  }
  return { ok: true };
}

function validateMergedIteration(iteration = {}, source = {}) {
  if (iteration.outcome !== "auto_merged") return { ok: false, reason: "iteration_outcome_not_auto_merged" };
  const autoMerge = iteration.autoMerge || {};
  if (autoMerge.attempted !== true) return { ok: false, reason: "auto_merge_not_attempted" };
  if (autoMerge.result !== "merged") return { ok: false, reason: "auto_merge_result_not_merged" };
  if (autoMerge.reason && /blocked|failed|manual|partial|not[-_]?attempted|max[-_]?iterations/i.test(autoMerge.reason)) {
    return { ok: false, reason: "auto_merge_contradictory_reason" };
  }
  if (autoMerge.prNumber !== undefined && autoMerge.prNumber !== null && autoMerge.prNumber !== source.prNumber) return { ok: false, reason: "auto_merge_pr_mismatch" };
  if (autoMerge.prHeadSha !== undefined && autoMerge.prHeadSha !== null && autoMerge.prHeadSha !== source.prHeadSha) return { ok: false, reason: "auto_merge_pr_head_mismatch" };
  if (!isSha(autoMerge.mergeSha)) return { ok: false, reason: "auto_merge_merge_sha_invalid" };
  return { ok: true, mergeSha: autoMerge.mergeSha };
}

function selectCurrentOutageState(states = []) {
  return states.reduce((selected, candidate) => {
    if (!selected) return candidate;
    return compareOutageStateRecency(candidate, selected) > 0 ? candidate : selected;
  }, null);
}

function compareOutageStateRecency(left, right) {
  const leftUpdatedAt = Date.parse(left?.timestamps?.updatedAt || "");
  const rightUpdatedAt = Date.parse(right?.timestamps?.updatedAt || "");
  if (leftUpdatedAt !== rightUpdatedAt) return leftUpdatedAt - rightUpdatedAt;
  return outageStateTieBreaker(left).localeCompare(outageStateTieBreaker(right));
}

function outageStateTieBreaker(state) {
  return [
    state?.mutationMarker?.key || "",
    state?.correlation?.taskKey || "",
    state?.correlation?.runnerRunId || "",
    state?.correlation?.supervisorRunId || "",
    String(state?.correlation?.issueNumber || ""),
    state?.correlation?.branchName || "",
    state?.correlation?.currentHeadSha || "",
    state?.correlation?.prHeadSha || "",
    state?.correlation?.outageFingerprint || "",
  ].join(":");
}

function isExhaustionReason(reasonCode) {
  return ["outage_resubmission_attempts_exhausted", "outage_resubmission_wall_clock_exhausted"].includes(reasonCode);
}

function validateSourceEvidence(source = {}) {
  const invalid = (field, reasonCode = "source_identity_invalid") => ({ ok: false, field, reasonCode });
  if (!isTaskKey(source.taskKey)) return invalid("taskKey", "source_correlation_incomplete");
  if (!isRunnerRunId(source.runnerRunId)) return invalid("runnerRunId", "source_correlation_incomplete");
  if (!isSupervisorRunId(source.supervisorRunId)) return invalid("supervisorRunId", "source_correlation_incomplete");
  if (!Number.isSafeInteger(source.issueNumber) || source.issueNumber < 1 || source.issueNumber > 9999999) return invalid("issueNumber", "source_issue_identity_invalid");
  if (!isBranchName(source.branchName)) return invalid("branchName", "source_branch_identity_invalid");
  if (!isSha(source.baseSha)) return invalid("baseSha", "source_base_identity_invalid");
  if (!isSha(source.currentHeadSha)) return invalid("currentHeadSha", "source_head_identity_invalid");
  if (!isProfileName(source.runnerProfile)) return invalid("runnerProfile", "source_profile_identity_invalid");
  if (!isDigest(source.runnerConfigDigest)) return invalid("runnerConfigDigest", "source_immutable_digest_missing");
  if (!isDigest(source.originalSupervisorSpecDigest)) return invalid("originalSupervisorSpecDigest", "source_immutable_digest_missing");
  if (!isIsoTimestamp(source.firstFailureAt)) return invalid("firstFailureAt", "source_failure_timestamp_invalid");
  if (!isIsoTimestamp(source.lastFailureAt)) return invalid("lastFailureAt", "source_failure_timestamp_invalid");
  if (Date.parse(source.lastFailureAt) < Date.parse(source.firstFailureAt)) return invalid("lastFailureAt", "source_failure_timestamp_order_invalid");
  if (source.attemptNumber !== undefined && source.attemptNumber !== null && (!Number.isSafeInteger(source.attemptNumber) || source.attemptNumber < 1 || source.attemptNumber > 20)) {
    return invalid("attemptNumber", "source_attempt_identity_invalid");
  }
  const hasPrNumber = source.prNumber !== undefined && source.prNumber !== null;
  const hasPrHeadSha = source.prHeadSha !== undefined && source.prHeadSha !== null;
  if (hasPrNumber !== hasPrHeadSha) return invalid(hasPrNumber ? "prHeadSha" : "prNumber", "source_pr_identity_unpaired");
  if (hasPrNumber && (!Number.isSafeInteger(source.prNumber) || source.prNumber < 1 || source.prNumber > 9999999)) return invalid("prNumber", "source_pr_identity_invalid");
  if (hasPrHeadSha && !isSha(source.prHeadSha)) return invalid("prHeadSha", "source_pr_identity_invalid");
  return { ok: true };
}

function validateCurrentCompletionIdentity(source, currentIdentity = null) {
  if (!currentIdentity?.merged && !currentIdentity?.issueClosed) return { ok: true, complete: false };
  if (currentIdentity.branchName !== source.branchName) return { ok: false, reasonCode: "branch_identity_mismatch" };
  if (currentIdentity.baseSha !== source.baseSha) return { ok: false, reasonCode: "base_identity_mismatch" };
  if (currentIdentity.currentHeadSha !== source.currentHeadSha) return { ok: false, reasonCode: "current_head_identity_mismatch" };
  const prMismatches = optionalPrIdentityMismatches({
    actualPrNumber: currentIdentity.prNumber,
    actualPrHeadSha: currentIdentity.prHeadSha,
    expectedPrNumber: source.prNumber,
    expectedPrHeadSha: source.prHeadSha,
  });
  if (prMismatches.includes("prNumber")) return { ok: false, reasonCode: "pr_identity_mismatch" };
  if (prMismatches.includes("prHeadSha")) return { ok: false, reasonCode: "pr_head_identity_mismatch" };
  if (currentIdentity.issueNumber !== undefined && currentIdentity.issueNumber !== source.issueNumber) return { ok: false, reasonCode: "issue_identity_mismatch" };
  return {
    ok: true,
    complete: true,
    reasonCode: currentIdentity.merged ? "source_current_pr_merged" : "source_current_issue_closed",
  };
}

function validateCurrentPrIdentityForSource(source, currentIdentity = null) {
  const prMismatches = optionalPrIdentityMismatches({
    actualPrNumber: currentIdentity?.prNumber,
    actualPrHeadSha: currentIdentity?.prHeadSha,
    expectedPrNumber: source.prNumber,
    expectedPrHeadSha: source.prHeadSha,
  });
  if (prMismatches.includes("prNumber")) return { ok: false, reasonCode: "pr_identity_mismatch" };
  if (prMismatches.includes("prHeadSha")) return { ok: false, reasonCode: "pr_head_identity_mismatch" };
  return { ok: true };
}

function summarizeOutageInventory(inventory) {
  return {
    readStatus: inventory.readStatus,
    reasonCode: inventory.reasonCode,
    operatorActionRequired: inventory.operatorActionRequired,
    totalRecordCount: inventory.totalRecordCount,
    validRecordCount: inventory.validCount,
    invalidRecordCount: inventory.invalidCount,
  };
}

function summarizeActiveAmbiguity(states = []) {
  return {
    reasonCode: "multiple_active_outage_states",
    count: states.length,
    records: states
      .slice()
      .sort((left, right) => outageStateTieBreaker(left).localeCompare(outageStateTieBreaker(right)))
      .slice(0, 10)
      .map((state) => ({
        taskKey: state?.correlation?.taskKey || null,
        runnerRunId: state?.correlation?.runnerRunId || null,
        supervisorRunId: state?.correlation?.supervisorRunId || null,
        issueNumber: state?.correlation?.issueNumber || null,
        markerKey: state?.mutationMarker?.key || null,
        status: state?.status || null,
      })),
  };
}

function summarizeOutageState(state) {
  return {
    taskKey: state.correlation?.taskKey || null,
    runnerRunId: state.correlation?.runnerRunId || null,
    supervisorRunId: state.correlation?.supervisorRunId || null,
    issueNumber: state.correlation?.issueNumber || null,
    branchName: state.correlation?.branchName || null,
    baseSha: state.correlation?.baseSha || null,
    currentHeadSha: state.correlation?.currentHeadSha || null,
    prNumber: state.correlation?.prNumber || null,
    prHeadSha: state.correlation?.prHeadSha || null,
    providerDomain: state.outage?.providerDomain || null,
    outageClass: state.outage?.outageClass || null,
    status: state.status || null,
  };
}

function buildCorrelation(source, classification) {
  const correlation = {
    taskKey: source.taskKey,
    runnerRunId: source.runnerRunId,
    supervisorRunId: source.supervisorRunId,
    issueNumber: source.issueNumber,
    branchName: source.branchName,
    baseSha: source.baseSha,
    currentHeadSha: source.currentHeadSha,
    runnerProfile: source.runnerProfile,
    runnerConfigDigest: source.runnerConfigDigest,
    originalSupervisorSpecDigest: source.originalSupervisorSpecDigest,
    outageProviderDomain: classification.providerDomain,
    outageFingerprint: classification.fingerprint,
    outageClass: classification.outageClass,
  };
  if (Object.hasOwn(source, "prNumber")) correlation.prNumber = source.prNumber;
  if (Object.hasOwn(source, "prHeadSha")) correlation.prHeadSha = source.prHeadSha;
  return correlation;
}

function result(outcome, reasonCode, extra = {}) {
  return { ok: !["blocked"].includes(outcome), outcome, reasonCode, ...extra };
}

function sanitizeEvent(value) {
  return JSON.parse(JSON.stringify(value, (key, child) => {
    if (/raw|body|payload|secret|token|authorization|configPath|command/i.test(key)) return undefined;
    if (typeof child === "string" && child.length > 240) return `${child.slice(0, 240)}...[truncated]`;
    return child;
  }));
}

function isDigest(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function isSha(value) {
  return /^[a-f0-9]{40}$/.test(String(value || ""));
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || value.length > 40) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

function isTaskKey(value) {
  return /^[A-Za-z0-9._-]{1,80}$/.test(String(value || "")) && !String(value || "").includes("..");
}

function isRunnerRunId(value) {
  return /^run-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z(?:-[a-f0-9]{12})?$/.test(String(value || ""));
}

function isSupervisorRunId(value) {
  return /^supervised-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(String(value || ""));
}

function isBranchName(value) {
  const branch = String(value || "");
  return /^(feature|focused|feature-bundle|tools)\/[A-Za-z0-9._/-]{1,180}$/.test(branch) && !branch.includes("..");
}

function isProfileName(value) {
  return /^[A-Za-z0-9._-]{1,80}$/.test(String(value || "")) && !String(value || "").includes("..");
}
