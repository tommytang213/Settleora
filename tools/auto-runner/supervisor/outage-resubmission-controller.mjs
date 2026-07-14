import {
  applyOutageOperatorGate,
  classifyOutageFailure,
  evaluateOutageCircuit,
  normalizeOutageResubmissionConfig,
  planOutageResubmissionSchedule,
} from "../lib/outage-resubmission-policy.mjs";
import {
  createOutageResubmissionState,
  listOutageResubmissionStates,
  loadOutageResubmissionState,
  transitionOutageMarker,
  verifyOutageCorrelation,
  writeOutageResubmissionState,
} from "../lib/outage-resubmission-state.mjs";
import { firstIncompleteContinuationAction } from "../lib/recovery-continuation.mjs";
import { invalidateEvidenceForHeadChange } from "../lib/recovery-state.mjs";
import { buildRunSpec, generateRunId, sha256Text, canonicalJson, writeImmutableRunSpec } from "./run-spec.mjs";
import { writeSupervisorState } from "./supervisor-state.mjs";
import { startUserUnit } from "./systemd-client.mjs";

export function evaluateSourceRunEligibility(input = {}) {
  const policy = normalizeOutageResubmissionConfig(input.config?.outageResubmission || input.outageResubmission || {});
  const source = input.source || {};
  const block = (reasonCode, extra = {}) => ({ eligible: false, reasonCode, ...extra });
  if (!policy.allowBoundedOutageResubmission) return block("outage_resubmission_disabled");
  if (!source.taskKey || !source.runnerRunId || !source.supervisorRunId || !Number.isSafeInteger(source.issueNumber)) {
    return block("source_correlation_incomplete");
  }
  if (!source.runnerProfile || !isDigest(source.runnerConfigDigest) || !isDigest(source.originalSupervisorSpecDigest)) {
    return block("source_immutable_digest_missing");
  }
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
  let states = [];
  try {
    states = listOutageResubmissionStates(config).slice(-20);
  } catch {
    states = [];
  }
  const active = states.find((state) => !["recovered", "exhausted", "blocked"].includes(state.status)) || null;
  return {
    enabled: policy.allowBoundedOutageResubmission,
    defaultOff: policy.allowBoundedOutageResubmission !== true,
    activeSourceRun: active ? summarizeOutageState(active) : null,
    attemptCount: active?.mutationMarker?.attemptNumber || 0,
    maxAttempts: policy.maxAttempts,
    nextEligibleAt: active?.schedule?.nextEligibleAt || null,
    deadlineAt: active?.schedule?.deadlineAt || null,
    circuitState: active?.circuit?.state || "closed",
    lastSanitizedReason: active?.outage?.reasonCode || active?.mutationMarker?.reasonCode || null,
    childRunId: active?.childSupervisorRunId || null,
    terminalOutcome: active && ["recovered", "exhausted", "blocked"].includes(active.status) ? active.status : null,
    recordCount: states.length,
  };
}

export function runOutageResubmissionController(input = {}) {
  const events = [];
  const config = input.config || {};
  const policy = normalizeOutageResubmissionConfig(config.outageResubmission || input.outageResubmission || {});
  const now = input.now || new Date();
  const dryRun = input.dryRun !== false;
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

  event("recovery_state_inspected");
  const recovery = input.recoveryState || null;
  if (recovery && !["completed", "stopped"].includes(recovery.phase)) {
    const boundary = firstIncompleteContinuationAction(recovery);
    if (boundary.ok) {
      event("recoverable_state_wins", { phase: recovery.phase, nextSafeAction: recovery.nextSafeAction });
      return result("resume_recovery", "existing_recoverable_state_first", { events, counts, recoveryBoundary: boundary });
    }
  }

  const source = input.source || {};
  const stateKey = input.outageStateKey || source.outageStateKey || null;
  let existingOutageState = input.outageState || null;
  if (!existingOutageState && stateKey) {
    const loaded = loadOutageResubmissionState(config, stateKey);
    if (loaded.ok) existingOutageState = loaded.state;
  }

  event("outage_marker_reconciled");
  const childReconciliation = reconcileExactChild(input.existingChildren || [], source, existingOutageState);
  if (!childReconciliation.ok) {
    event("outage_child_reconciliation_blocked", { reasonCode: childReconciliation.reasonCode });
    return result("blocked", childReconciliation.reasonCode, { events, counts, outageState: existingOutageState, childReconciliation });
  }
  const existingChild = childReconciliation.child;
  if (existingOutageState && ["recovered", "exhausted", "blocked"].includes(existingOutageState.mutationMarker?.status || existingOutageState.status)) {
    event("terminal_outage_marker_preserved", { status: existingOutageState.status });
    return result("noop", "terminal_outage_marker_preserved", { events, counts, outageState: existingOutageState });
  }
  if (existingOutageState?.mutationMarker?.status === "submission_uncertain") {
    if (existingChild) {
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
    if (isTerminalChild(existingChild)) {
      const terminalStatus = existingChild.terminalOutcome === "completed" || existingChild.state === "completed" ? "recovered" : "blocked";
      const classified = transitionOutageMarker(existingOutageState, {
        status: terminalStatus,
        childSupervisorRunId: existingChild.runId,
        specDigest: existingOutageState.mutationMarker?.specDigest || childDigest(existingChild),
        reasonCode: terminalStatus === "recovered" ? "confirmed_child_recovered" : "confirmed_child_terminal_blocked",
      });
      if (!dryRun) writeOutageResubmissionState(config, classified);
      event("confirmed_terminal_child_classified", { childSupervisorRunId: existingChild.runId, status: terminalStatus });
      return result(terminalStatus, terminalStatus === "recovered" ? "confirmed_child_recovered" : "confirmed_child_terminal_blocked", {
        events,
        counts,
        outageState: classified,
        childRunId: existingChild.runId,
      });
    }
    event("confirmed_running_child_observed", { childSupervisorRunId: existingChild.runId });
    return result("observed", "confirmed_running_child_observed", { events, counts, outageState: existingOutageState, childRunId: existingChild.runId });
  }
  if (existingChild) {
    if (existingOutageState?.mutationMarker?.status === "planned") {
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

  event("source_eligibility_checked");
  const eligibility = evaluateSourceRunEligibility({ config, source, failure: input.failure });
  if (!eligibility.eligible) {
    event("terminal_nonretryable_block", { reasonCode: eligibility.reasonCode, classification: eligibility.classification });
    return result("blocked", eligibility.reasonCode, { events, counts, classification: eligibility.classification });
  }

  const correlation = buildCorrelation(source, eligibility.classification);
  if (existingOutageState) {
    const drift = verifyOutageCorrelation(existingOutageState, correlation);
    if (!drift.ok) return result("blocked", drift.reasonCode, { events, counts, drift });
  }

  event("head_bound_evidence_checked");
  if (input.currentIdentity?.merged || input.currentIdentity?.issueClosed) {
    event("source_already_recovered");
    return result("recovered", "source_already_complete", { events, counts });
  }
  if (input.currentIdentity?.branchName && input.currentIdentity.branchName !== source.branchName) {
    return result("blocked", "branch_identity_mismatch", { events, counts });
  }
  if (input.currentIdentity?.prNumber && source.prNumber && input.currentIdentity.prNumber !== source.prNumber) {
    return result("blocked", "pr_identity_mismatch", { events, counts });
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
    event("stale_head_evidence_invalidated", { currentHeadSha: input.currentIdentity.currentHeadSha });
    return result("blocked", "stale_head_evidence_regeneration_required", { events, counts, recoveryState: invalidatedRecoveryState });
  }

  event("circuit_checked");
  const circuit = evaluateOutageCircuit({
    config: policy,
    records: input.circuitRecords || [],
    now,
    providerDomain: eligibility.classification.providerDomain,
    outageFingerprint: eligibility.classification.fingerprint,
    existing: input.circuitState || null,
  });
  const schedule = planOutageResubmissionSchedule({
    config: policy,
    firstFailureAt: source.firstFailureAt,
    lastFailureAt: source.lastFailureAt,
    attemptNumber: source.attemptNumber || 1,
    now,
    rng: input.rng || Math.random,
  });
  const finalGate = applyOutageOperatorGate({
    operatorControl: input.operatorControl || {},
    circuit,
    schedule,
    classification: eligibility.classification,
  });
  if (!finalGate.allowed) {
    event(finalGate.reasonCode === "operator_pause" || finalGate.reasonCode === "operator_stop" ? "operator_pause_stop" : "resubmission_deferred", finalGate);
    return result("deferred", finalGate.reasonCode, { events, counts, circuit, schedule, classification: eligibility.classification });
  }

  event("resubmission_planned");
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

  const child = buildChildRunPlan({ config, source, state: plannedState, now, childRunId: input.childRunId });
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
    return result("planned", "dry_run_no_mutation", { events, counts, outageState: dryState, child });
  }

  const uncertain = transitionOutageMarker(plannedState, {
    status: "submission_uncertain",
    childSupervisorRunId: child.spec.runId,
    specDigest: child.specSha256,
    reasonCode: "submission_started",
  });
  writeOutageResubmissionState(config, uncertain);
  writeImmutableRunSpec(child.spec, config.logsRoot);
  writeSupervisorState(child.spec.runId, { state: "submitted", parentSupervisorRunId: source.supervisorRunId }, config.logsRoot);
  counts.systemdCalls += 1;
  counts.realMutationCalls += 1;
  const submitted = startUserUnit(child.spec.runId);
  if (!submitted.ok) {
    const blocked = transitionOutageMarker(uncertain, { status: "blocked", childSupervisorRunId: child.spec.runId, reasonCode: "child_submission_failed" });
    writeOutageResubmissionState(config, blocked);
    return result("blocked", "child_submission_failed", { events, counts, outageState: blocked, child, submitted });
  }
  const confirmed = transitionOutageMarker(uncertain, { status: "submitted", childSupervisorRunId: child.spec.runId, specDigest: child.specSha256, reasonCode: "child_submission_confirmed" });
  writeOutageResubmissionState(config, confirmed);
  event("child_submission_confirmed", { childSupervisorRunId: child.spec.runId });
  return result("submitted", "child_submission_confirmed", { events, counts, outageState: confirmed, child, submitted });
}

function buildChildRunPlan({ config, source, state, now, childRunId }) {
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
    },
    allowMissingConfig: true,
    logsRoot: config.logsRoot,
  }).spec;
  return { spec, specSha256: sha256Text(canonicalJson(spec)) };
}

function reconcileExactChild(children, source, outageState) {
  const authoritative = (children || []).filter((child) => child && typeof child === "object");
  const intendedRunId = outageState?.childSupervisorRunId || outageState?.mutationMarker?.childSupervisorRunId || null;
  const candidates = authoritative.filter((child) => {
    if (intendedRunId) return child.runId === intendedRunId;
    return (
      child.parentSupervisorRunId === source.supervisorRunId &&
      child.parentRunnerRunId === source.runnerRunId &&
      child.sourceIssueNumber === source.issueNumber &&
      child.sourceBranchName === source.branchName
    );
  });
  if (candidates.length > 1) return { ok: false, reasonCode: "outage_child_ambiguous_requires_reconciliation", candidates: candidates.length };
  const child = candidates[0] || null;
  if (!child) return { ok: true, child: null, reasonCode: "exact_child_absent" };
  const mismatches = exactChildMismatches(child, source, outageState);
  if (mismatches.length > 0) {
    return { ok: false, reasonCode: "outage_child_identity_mismatch_requires_reconciliation", mismatches };
  }
  return { ok: true, child, reasonCode: "exact_child_found" };
}

function exactChildMismatches(child, source, outageState) {
  const marker = outageState?.mutationMarker || {};
  const outage = child.outageResubmission || {};
  const checks = [
    ["parentSupervisorRunId", child.parentSupervisorRunId, source.supervisorRunId],
    ["parentRunnerRunId", child.parentRunnerRunId, source.runnerRunId],
    ["taskKey", child.taskKey || child.sourceTaskKey || outage.taskKey, source.taskKey],
    ["sourceIssueNumber", child.sourceIssueNumber, source.issueNumber],
    ["sourceBranchName", child.sourceBranchName, source.branchName],
    ["baseSha", child.baseSha || child.initialOriginMainSha || outage.baseSha, source.baseSha],
    ["currentHeadSha", child.currentHeadSha || child.headSha || outage.currentHeadSha, source.currentHeadSha],
    ["prNumber", child.prNumber || outage.prNumber || null, source.prNumber || null],
    ["prHeadSha", child.prHeadSha || outage.prHeadSha || null, source.prHeadSha || null],
    ["runnerProfile", child.runnerProfile || child.profile || outage.runnerProfile, source.runnerProfile],
    ["runnerConfigDigest", child.runnerConfigDigest || child.runnerConfigSha256 || outage.runnerConfigDigest, source.runnerConfigDigest],
    ["originalSupervisorSpecDigest", child.originalSupervisorSpecDigest || outage.originalSupervisorSpecDigest, source.originalSupervisorSpecDigest],
    ["attemptNumber", outage.attemptNumber, marker.attemptNumber],
    ["outageFingerprint", outage.outageFingerprint, outageState?.outage?.outageFingerprint || source.outageFingerprint],
    ["markerKey", outage.markerKey, marker.key],
    ["childLogicalId", child.runId || outage.childLogicalId, outage.childLogicalId || child.runId],
    ["childSpecDigest", childDigest(child), marker.specDigest],
  ];
  return checks
    .filter(([, actual, expected]) => expected !== null && expected !== undefined && actual !== expected)
    .map(([field]) => field);
}

function childDigest(child) {
  return child?.specSha256 || child?.specDigest || child?.outageResubmission?.childSpecDigest || child?.outageResubmission?.specDigest || null;
}

function isTerminalChild(child) {
  return child?.terminal === true || ["completed", "failed", "blocked", "cancelled", "partial"].includes(child?.state) || Boolean(child?.terminalOutcome);
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
  return {
    taskKey: source.taskKey,
    runnerRunId: source.runnerRunId,
    supervisorRunId: source.supervisorRunId,
    issueNumber: source.issueNumber,
    branchName: source.branchName,
    baseSha: source.baseSha,
    currentHeadSha: source.currentHeadSha,
    prNumber: source.prNumber || null,
    prHeadSha: source.prHeadSha || null,
    runnerProfile: source.runnerProfile,
    runnerConfigDigest: source.runnerConfigDigest,
    originalSupervisorSpecDigest: source.originalSupervisorSpecDigest,
    providerDomain: classification.providerDomain,
    outageFingerprint: classification.fingerprint,
  };
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
