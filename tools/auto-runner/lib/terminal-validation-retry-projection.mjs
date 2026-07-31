import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  supervisorModeToRunnerMode,
  validateRunnerRunId,
} from "./run-correlation.mjs";
import {
  allowedSpecFields,
  specPathForRunId,
  validateRunSpecShape,
} from "../supervisor/run-spec.mjs";
import { validateSessionLifecycleState } from "./session-lifecycle.mjs";

const MAX_ARTIFACT_BYTES = 1024 * 1024;
const MAX_RUNNER_SUMMARY_BYTES = 512 * 1024;
const TERMINAL_REASON_CODE = "checkpoint_validation_recovery_failed_closed";
const TERMINAL_DETAIL = "initial_validation_failure_commit_reconstruction_ambiguous";
const SUCCESSOR_SYSTEMIC_STOP = "recoverable-work-blocked:historical_candidate_task_workspace_untrusted";
const SUCCESSOR_RUNNER_CONFIG_PATH = "/workspace/auto-runner/config/settleora.json";
const SUCCESSOR_RUNNER_CONFIG_SHA256 = "644f69637cb69911f85bed367cfda13b2db889a36e11844226a5c188977dea1d";
const SUCCESSOR_RUNTIME_ROOT = "/workspace/auto-runner/runtime";
const SUCCESSOR_NODE_EXECUTABLE = "/usr/bin/node";
const SUCCESSOR_MAX_RUNTIME_MS = 14 * 24 * 60 * 60 * 1000;
const RUNNER_SUMMARY_FILENAME_PATTERN =
  /^run-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z(?:-[a-f0-9]{12})?\.json$/;
const MAX_RUNNER_SUMMARY_FILES = 2000;
const FAILED_CONTINUATION_STOP = "recoverable-work-blocked:terminal_projection_reloaded_checkpoint_mismatch";
const FAILED_CONTINUATION_RUNNER_CONFIG_SHA256 = "0c9a4c43c062a245b491af427dc4edc95cd8431e085647641ce6a832c55a08f7";
const FAILED_CONTINUATION_HEARTBEAT_INTERVAL_SECONDS = 60;
const FAILED_CONTINUATION_HEARTBEAT_LEASE_SECONDS = 300;
const FAILED_CONTINUATION_OWNER_PID = 2744812;
const FAILED_CONTINUATION_COUNT_FIELDS = Object.freeze([
  "attempted", "blocked", "completed", "failed", "merged", "processed", "skipped",
]);
const FAILED_CONTINUATION_BUDGET_FIELDS = Object.freeze([
  "acceptedLogicalTaskCount", "chargeId", "charged", "duplicate", "marker", "ok",
  "reasonCode", "state", "statePath",
]);
const FAILED_CONTINUATION_REPORT_RESOLUTION_FIELDS = Object.freeze([
  "diagnostics", "ok", "reason", "reportPath", "runnerRunId",
  "runnerSummaryJsonPath", "runnerSummaryMarkdownPath", "status",
]);
const FAILED_CONTINUATION_DIAGNOSTIC_FIELDS = Object.freeze([
  "file", "reason", "runnerRunId", "status",
]);
const EXACT_TERMINAL_ITERATION_FIELDS = Object.freeze([
  "autoMerge",
  "baseOriginMainSha",
  "branchName",
  "bundle",
  "changedFiles",
  "existingPrRecovery",
  "externalReview",
  "finishedAt",
  "index",
  "issue",
  "issueSource",
  "laneDecision",
  "logicalTaskBudget",
  "outcome",
  "phase",
  "pr",
  "recovery",
  "review",
  "runId",
  "runIssueState",
  "runnerCreatedCommitSha",
  "startedAt",
  "systemicStop",
  "validation",
]);
const FAILED_CONTINUATION_RECOVERY_FIELDS = Object.freeze([
  "action", "allowed", "found", "outcome", "reasonCode", "state", "stateCounts",
  "states", "target", "terminalDerivativeContinuationAdmission",
  "terminalDerivativeProjection",
]);
const FAILED_CONTINUATION_STATE_FIELDS = Object.freeze([
  "active", "attemptClass", "baseSha", "blocker", "branchName", "currentHeadSha",
  "firstIncompleteAction", "issueNumber", "nextSafeAction", "phase", "prNumber",
  "prUrl", "runId", "stopReason", "supervisorRunId", "taskKey",
]);
const FAILED_CONTINUATION_SUMMARY_FIELDS = Object.freeze([
  "acceptedLogicalTaskCount", "attemptedIssueCount", "attemptedIssueNumbers",
  "autoMergeCanaryApprovalMode", "baseOriginMainSha", "configPath", "finishedAt",
  "iterations", "logPath", "maxIterations", "maxRuntimeMs", "mode",
  "processedIssueCount", "processedIssueNumbers", "runId", "startedAt",
  "stopReason", "supervisorRunId",
]);
const FAILED_CONTINUATION_SUPERVISOR_STATE_FIELDS = Object.freeze([
  "childSignal", "childStatus", "childTerminalState", "createdAt", "finishedAt",
  "heartbeatGeneration", "initialOriginMainSha", "maxRuntime", "maxTasks",
  "reportPath", "reportResolution", "runId", "runnerArgv", "runnerConfigSha256",
  "runnerRunId", "runnerSummaryJsonPath", "runnerSummaryMarkdownPath", "specPath",
  "specSha256", "startedAt", "state", "stderrPath", "stdoutPath",
  "terminalReason", "unitName", "updatedAt",
]);
const FAILED_CONTINUATION_HEARTBEAT_FIELDS = Object.freeze([
  "counts", "currentIssue", "currentPr", "heartbeatGeneration",
  "heartbeatIntervalSeconds", "heartbeatLeaseSeconds", "leaseExpiresAt",
  "maxRuntime", "maxTasks", "monitoringDelivery", "ownerPid", "reportPath",
  "reportResolution", "runId", "runnerRunId", "schemaVersion", "startedAt",
  "state", "terminal", "unitName", "updatedAt",
]);
const FAILED_CONTINUATION_PROJECTION_FIELDS = Object.freeze([
  "boundArtifacts", "evidenceDigest", "ok", "projectionApplied",
  "projectionReasonCode",
]);

function historicalRunnerArgvForSpec(spec, runnerRunId) {
  const argv = [
    SUCCESSOR_NODE_EXECUTABLE,
    path.join(SUCCESSOR_RUNTIME_ROOT, "settleora-auto-runner.mjs"),
    "--run",
    "--supervisor-run-id",
    spec.runId,
    "--runner-run-id",
    runnerRunId,
    "--config",
    "[config-path]",
    "--expected-config-sha256",
    spec.runnerConfigSha256,
    "--max-iterations",
    String(spec.maxTasks),
    "--max-runtime",
    spec.maxRuntime,
  ];
  if (spec.recoveryOnlyTarget) {
    const recoveryTarget = spec.recoveryOnlyTarget;
    argv.push(
      "--outage-recovery-only",
      "--outage-target-task-key",
      recoveryTarget.taskKey,
      "--outage-target-issue",
      String(recoveryTarget.issueNumber),
      "--outage-target-branch",
      recoveryTarget.branchName,
      "--outage-target-base-sha",
      recoveryTarget.baseSha,
      "--outage-target-head-sha",
      recoveryTarget.currentHeadSha,
      "--outage-target-runner-run-id",
      recoveryTarget.runnerRunId,
      "--outage-target-supervisor-run-id",
      recoveryTarget.supervisorRunId,
    );
    if (recoveryTarget.terminalValidationRetryDerivativeNoPr === true) {
      argv.push("--outage-target-terminal-validation-retry-derivative");
    } else {
      argv.push(
        "--outage-target-original-spec-digest",
        recoveryTarget.originalSupervisorSpecDigest,
        "--outage-target-marker-key",
        recoveryTarget.markerKey,
        "--outage-target-fingerprint",
        recoveryTarget.outageFingerprint,
        "--outage-target-attempt",
        String(recoveryTarget.attemptNumber),
        "--outage-target-pr",
        String(recoveryTarget.prNumber),
        "--outage-target-pr-head-sha",
        recoveryTarget.prHeadSha,
      );
    }
  }
  return argv;
}

export function projectAuthenticatedTerminalValidationRetryDerivative({
  logsRoot,
  rawRecovery,
  rawRecoveryPath,
  lifecycle,
  lifecyclePath,
  target,
} = {}) {
  const denied = (reasonCode) => ({
    ok: false,
    projectionApplied: false,
    projectionReasonCode: reasonCode,
    rawRecovery,
    effectiveRecovery: rawRecovery,
    evidenceDigest: null,
    boundArtifacts: Object.freeze([]),
  });
  try {
    if (!exactRawCheckpoint(rawRecovery, target)) return denied("terminal_projection_raw_checkpoint_mismatch");
    if (!exactLifecycle(lifecycle, target)) return denied("terminal_projection_lifecycle_mismatch");

    const root = trustedDirectory(logsRoot);
    const recoveryArtifact = trustedJsonArtifact(root, rawRecoveryPath, "recovery");
    const lifecycleArtifact = trustedJsonArtifact(root, lifecyclePath, "session-lifecycle");
    const durableBudgetArtifact = trustedJsonArtifact(
      root,
      target.chargeMarkerRef,
      "logical-task-budget",
    );
    if (durableBudgetArtifact.value?.acceptedLogicalTaskCount !== target.acceptedLogicalTasks
      || canonical(durableBudgetArtifact.value?.charges?.[target.chargeId])
        !== canonical(target.durableChargeMarker)) {
      return denied("terminal_projection_durable_budget_mismatch");
    }
    const comparableRecovery = structuredClone(rawRecovery);
    delete comparableRecovery.statePath;
    if (canonical(recoveryArtifact.value) !== canonical(comparableRecovery)
      || canonical(lifecycleArtifact.value) !== canonical(lifecycle)) {
      return denied("terminal_projection_loaded_artifact_mismatch");
    }

    const stateRoot = path.join(root, "state");
    const allStates = trustedJsonFiles(stateRoot)
      .filter((artifact) => iterationStateFilenameIdentity(artifact) !== null);
    const directlyAssociatedStates = allStates
      .filter((artifact) => stateArtifactMayBelongToTarget(artifact, target));
    const latestDirectState = selectLatestIssueStateTimestamp(
      directlyAssociatedStates.map(({ value }) => value),
    );
    if (!latestDirectState.ok) return denied("terminal_projection_state_missing_ambiguous_or_superseded");
    const latestDirectArtifacts = directlyAssociatedStates
      .filter(({ value }) => value.finishedAt === latestDirectState.finishedAt);
    if (latestDirectArtifacts.length !== 1) {
      return denied("terminal_projection_state_missing_ambiguous_or_superseded");
    }
    const failedContinuationStateArtifact = exactFailedContinuationIteration(
      latestDirectArtifacts[0].value,
      target,
      durableBudgetArtifact.value,
    ) && exactStateArtifactFilenameIdentity(latestDirectArtifacts[0])
      ? latestDirectArtifacts[0]
      : null;
    if (failedContinuationStateArtifact
      && !successorRunArtifactsAreUnique(
        allStates,
        [failedContinuationStateArtifact.value],
      )) {
      return denied("terminal_projection_state_missing_ambiguous_or_superseded");
    }
    const predecessorDirectStates = failedContinuationStateArtifact
      ? directlyAssociatedStates.filter(({ path: artifactPath }) =>
        artifactPath !== failedContinuationStateArtifact.path)
      : directlyAssociatedStates;
    const predecessorDirectState = selectLatestIssueStateTimestamp(
      predecessorDirectStates.map(({ value }) => value),
    );
    if (!predecessorDirectState.ok) {
      return denied("terminal_projection_state_missing_ambiguous_or_superseded");
    }
    const successorRunAnchors = predecessorDirectStates
      .filter(({ value }) => value.finishedAt === predecessorDirectState.finishedAt)
      .map((artifact) => artifact.value);
    const issueStates = allStates.filter((artifact) =>
      stateArtifactMayBelongToTargetOrSuccessorRun(
        artifact,
        target,
        successorRunAnchors,
      ));
    if (!successorRunArtifactsAreUnique(allStates, successorRunAnchors)) {
      return denied("terminal_projection_state_missing_ambiguous_or_superseded");
    }
    const originalIssueStates = failedContinuationStateArtifact
      ? issueStates.filter(({ path: artifactPath }) =>
        artifactPath !== failedContinuationStateArtifact.path)
      : issueStates;
    const latestState = selectLatestIssueStateTimestamp(originalIssueStates.map(({ value }) => value));
    if (!latestState.ok) return denied("terminal_projection_state_missing_ambiguous_or_superseded");
    const latestFinishedAt = latestState.finishedAt;
    const terminalStates = issueStates.filter(({ value }) =>
      value.finishedAt === latestFinishedAt && exactTerminalIteration(value, target))
      .filter((artifact) => exactStateArtifactFilenameIdentity(artifact));
    if (terminalStates.length !== 1) return denied("terminal_projection_state_missing_ambiguous_or_superseded");
    const stateArtifact = terminalStates[0];

    const summaryRoot = path.join(root, "summaries");
    const summaryArtifact = trustedJsonArtifact(
      summaryRoot,
      path.join(summaryRoot, `${stateArtifact.value.runId}.json`),
    );
    if (!exactTerminalSummary(summaryArtifact.value, stateArtifact.value, target)) {
      return denied("terminal_projection_state_summary_mismatch");
    }
    const summaryMarkdownArtifact = trustedFileArtifact(
      summaryRoot,
      path.join(summaryRoot, `${stateArtifact.value.runId}.md`),
    );

    const specRoot = path.join(root, "supervisor", "run-specs");
    const specs = trustedNestedJsonFiles(specRoot, "spec.json")
      .filter(({ value }) => value?.runId === summaryArtifact.value.supervisorRunId)
      .filter((artifact) => exactSuccessorSpecArtifact(artifact, summaryArtifact.value, root));
    if (specs.length !== 1) {
      return denied("terminal_projection_successor_spec_missing_or_mismatch");
    }
    const specArtifact = specs[0];
    const supervisorStateRoot = path.join(
      root,
      "supervisor",
      "runs",
      digest(summaryArtifact.value.supervisorRunId),
    );
    const supervisorStateArtifact = trustedJsonArtifact(
      supervisorStateRoot,
      path.join(supervisorStateRoot, "state.json"),
    );
    if (!exactSuccessorSupervisorState(
      supervisorStateArtifact.value,
      stateArtifact.value,
      summaryArtifact.value,
      specArtifact,
      root,
    )) {
      return denied("terminal_projection_successor_supervisor_state_mismatch");
    }
    let lifecyclePredecessorArtifact = null;
    if (target?.allowReopenedLifecycle === true
      && lifecycle?.mutationAuthority?.handoff?.reason === "validation_retry_derivative_reopened") {
      const predecessorRoot = trustedDirectory(path.join(root, "session-lifecycle-predecessors"));
      lifecyclePredecessorArtifact = trustedJsonArtifact(
        predecessorRoot,
        path.join(predecessorRoot, `${lifecycle.mutationAuthority.handoff.checkpointDigest}.json`),
      );
      if (predecessorRoot !== path.dirname(lifecyclePredecessorArtifact.path)
        || !validateSessionLifecycleState(lifecyclePredecessorArtifact.value).ok
        || lifecyclePredecessorArtifact.value?.checkpoint?.digest
          !== lifecycle.mutationAuthority.handoff.checkpointDigest
        || lifecyclePredecessorArtifact.value?.sessions?.current
          !== lifecycle.mutationAuthority.handoff.retiredSessionId
        || lifecyclePredecessorArtifact.value?.sessions?.generation
          !== lifecycle.sessions.generation
            - (lifecycle.mutationAuthority.status === "active" ? 1 : 0)
        || !exactReopenedHandoffCheckpointOrdering(
          lifecycle,
          lifecyclePredecessorArtifact.value,
        )
        || !exactLifecycle(
          lifecyclePredecessorArtifact.value,
          { ...target, allowReopenedLifecycle: false },
        )) {
        return denied("terminal_projection_lifecycle_predecessor_mismatch");
      }
    }

    const effectiveRecovery = structuredClone(rawRecovery);
    effectiveRecovery.phase = "stopped";
    effectiveRecovery.stopReason = {
      reasonCode: TERMINAL_REASON_CODE,
      reason: TERMINAL_DETAIL,
    };
    effectiveRecovery.firstIncompleteAction = "run_validation_and_commit";
    effectiveRecovery.nextSafeAction = "stop_fail_closed";

    const predecessorBoundArtifacts = Object.freeze([
      publicArtifact(recoveryArtifact, "rawRecovery"),
      publicArtifact(lifecycleArtifact, "lifecycle"),
      publicArtifact(durableBudgetArtifact, "logicalTaskBudget"),
      ...(lifecyclePredecessorArtifact
        ? [publicArtifact(lifecyclePredecessorArtifact, "lifecyclePredecessor")]
        : []),
      publicArtifact(stateArtifact, "iterationState"),
      publicArtifact(summaryArtifact, "runnerSummary"),
      publicArtifact(summaryMarkdownArtifact, "runnerSummaryMarkdown"),
      publicArtifact(specArtifact, "supervisorSpec"),
      publicArtifact(supervisorStateArtifact, "supervisorState"),
    ]);
    const predecessorIdentity = {
      repository: target.repository,
      issueNumber: target.issueNumber,
      taskKey: target.taskKey,
      claimIdentity: target.claimIdentity,
      chargeId: target.chargeId,
      originalRunnerRunId: target.runnerRunId,
      originalSupervisorRunId: target.supervisorRunId,
      successorRunnerRunId: stateArtifact.value.runId,
      successorSupervisorRunId: summaryArtifact.value.supervisorRunId,
      branch: target.branch,
      baseSha: target.baseSha,
      headSha: target.headSha,
      treeSha: target.treeSha,
      changedFilesDigest: target.changedFilesDigest,
      diffDigest: target.diffDigest,
    };
    const predecessorEvidenceDigest = digest(canonical({
      artifacts: predecessorBoundArtifacts.map(({ role, sha256 }) => ({ role, sha256 })),
      identity: predecessorIdentity,
    }));
    const failedContinuationOverlay = failedContinuationStateArtifact
      ? authenticateFailedContinuationOverlay({
        root,
        allStates,
        stateArtifact: failedContinuationStateArtifact,
        target,
        predecessorStateArtifact: stateArtifact,
        predecessorSummaryArtifact: summaryArtifact,
        predecessorBoundArtifacts,
        predecessorEvidenceDigest,
      })
      : null;
    if (failedContinuationStateArtifact && !failedContinuationOverlay?.ok) {
      return denied(failedContinuationOverlay?.reasonCode
        || "terminal_projection_failed_continuation_overlay_mismatch");
    }
    const boundArtifacts = Object.freeze([
      ...predecessorBoundArtifacts,
      ...(failedContinuationOverlay?.artifacts || []),
    ]);
    const evidenceDigest = failedContinuationOverlay
      ? digest(canonical({
        artifacts: boundArtifacts.map(({ role, sha256 }) => ({ role, sha256 })),
        identity: {
          ...predecessorIdentity,
          failedContinuationOverlay: {
            runnerRunId: failedContinuationOverlay.runnerRunId,
            supervisorRunId: failedContinuationOverlay.supervisorRunId,
            predecessorEvidenceDigest: failedContinuationOverlay.predecessorEvidenceDigest,
          },
        },
      }))
      : predecessorEvidenceDigest;
    return {
      ok: true,
      projectionApplied: true,
      projectionReasonCode: "authenticated_terminal_validation_retry_derivative_projected",
      rawRecovery,
      effectiveRecovery,
      evidenceDigest,
      boundArtifacts,
    };
  } catch {
    return denied("terminal_projection_authoritative_read_unavailable");
  }
}

function authenticateFailedContinuationOverlay({
  root,
  allStates,
  stateArtifact,
  target,
  predecessorStateArtifact,
  predecessorSummaryArtifact,
  predecessorBoundArtifacts,
  predecessorEvidenceDigest,
}) {
  const fail = (reasonCode) => ({ ok: false, reasonCode });
  const iteration = stateArtifact.value;
  const summaryRoot = path.join(root, "summaries");
  const summaryScan = trustedRunnerSummaryScan(
    summaryRoot,
    `${iteration.runId}.json`,
  );
  const allSummaries = summaryScan.summaries;
  if (!summaryScan.selectedArtifact) {
    return fail("terminal_projection_failed_continuation_summary_mismatch");
  }
  const summaryArtifact = summaryScan.selectedArtifact;
  const summaryMarkdownArtifact = trustedFileArtifact(
    summaryRoot,
    path.join(summaryRoot, `${iteration.runId}.md`),
  );
  if (!exactFailedContinuationSummary(summaryArtifact.value, iteration, target, root)) {
    return fail("terminal_projection_failed_continuation_summary_mismatch");
  }
  if (!runnerSummaryCandidateCountWithinResolverLimit(allSummaries)) {
    return fail("terminal_projection_failed_continuation_summary_ambiguous");
  }
  const supervisorSummaries = allSummaries
    .filter(({ value }) =>
      value?.supervisorRunId === summaryArtifact.value.supervisorRunId);
  if (supervisorSummaries.length !== 1
    || supervisorSummaries[0].path !== summaryArtifact.path) {
    return fail("terminal_projection_failed_continuation_summary_ambiguous");
  }
  if (!successorRunArtifactsAreUnique(allStates, [{
    runId: iteration.runId,
    supervisorRunId: summaryArtifact.value.supervisorRunId,
  }])) {
    return fail("terminal_projection_state_missing_ambiguous_or_superseded");
  }
  const supervisorRunId = summaryArtifact.value.supervisorRunId;
  const specRoot = path.join(root, "supervisor", "run-specs");
  const specs = trustedNestedJsonFiles(specRoot, "spec.json")
    .filter(({ value }) => value?.runId === supervisorRunId)
    .filter((artifact) => exactFailedContinuationSpecArtifact(
      artifact,
      summaryArtifact.value,
      target,
      root,
    ));
  if (specs.length !== 1) return fail("terminal_projection_failed_continuation_spec_mismatch");
  const specArtifact = specs[0];
  const supervisorRoot = path.join(root, "supervisor", "runs", digest(supervisorRunId));
  const supervisorStateArtifact = trustedJsonArtifact(
    supervisorRoot,
    path.join(supervisorRoot, "state.json"),
  );
  const heartbeatArtifact = trustedJsonArtifact(
    supervisorRoot,
    path.join(supervisorRoot, "heartbeat.json"),
  );
  if (!exactFailedContinuationSupervisorState(
    supervisorStateArtifact.value,
    heartbeatArtifact.value,
    iteration,
    summaryArtifact.value,
    specArtifact,
    root,
    failedContinuationTruncatedDiagnostics(
      allSummaries,
      summaryArtifact,
      iteration.runId,
    ),
  )) return fail("terminal_projection_failed_continuation_supervisor_mismatch");
  if (Date.parse(predecessorStateArtifact.value.finishedAt) > Date.parse(specArtifact.value.createdAt)
    || Date.parse(predecessorSummaryArtifact.value.finishedAt) > Date.parse(specArtifact.value.createdAt)) {
    return fail("terminal_projection_failed_continuation_chronology_mismatch");
  }
  const embeddedProjection = iteration.recovery?.terminalDerivativeProjection;
  if (embeddedProjection?.evidenceDigest !== predecessorEvidenceDigest
    || canonical(embeddedProjection?.boundArtifacts)
      !== canonical(predecessorBoundArtifacts.map(({ role, sha256 }) => ({ role, sha256 })))) {
    return fail("terminal_projection_failed_continuation_predecessor_identity_mismatch");
  }
  return {
    ok: true,
    runnerRunId: iteration.runId,
    supervisorRunId,
    predecessorEvidenceDigest,
    artifacts: [
      publicArtifact(stateArtifact, "failedContinuationIterationState"),
      publicArtifact(summaryArtifact, "failedContinuationRunnerSummary"),
      publicArtifact(summaryMarkdownArtifact, "failedContinuationRunnerSummaryMarkdown"),
      publicArtifact(specArtifact, "failedContinuationSupervisorSpec"),
      publicArtifact(supervisorStateArtifact, "failedContinuationSupervisorState"),
      publicArtifact(heartbeatArtifact, "failedContinuationSupervisorHeartbeat"),
    ],
  };
}

export function exactRawCheckpoint(state, target) {
  const failureBatch = state?.ordinaryContinuation?.sourceFailureBatch;
  const candidate = failureBatch?.candidate;
  const identity = state?.ordinaryContinuation?.identity;
  return state?.phase === "checkpoint_validation_commit"
    && state?.stopReason === null
    && state?.firstIncompleteAction === "run_validation_and_commit"
    && state?.nextSafeAction === "run_validation_and_commit"
    && state?.issue?.number === target.issueNumber
    && state?.taskKey === target.taskKey
    && state?.run?.runId === target.runnerRunId
    && state?.run?.supervisorRunId === target.supervisorRunId
    && state?.branch?.name === target.branch
    && state?.branch?.baseSha === target.baseSha
    && state?.branch?.currentHeadSha === target.headSha
    && state?.branch?.expectedRemoteHeadSha === null
    && state?.featureBundle === null
    && state?.pr?.number === null && state?.pr?.url === null && state?.pr?.headSha === null
    && state?.ordinaryContinuation?.phase === "local_validation"
    && state.ordinaryContinuation.effects
    && typeof state.ordinaryContinuation.effects === "object"
    && !Array.isArray(state.ordinaryContinuation.effects)
    && Object.keys(state.ordinaryContinuation.effects).length === 0
    && exactTerminalFailureFindings(failureBatch?.findings, candidate, target)
    && identity?.baseSha === target.baseSha && identity?.headSha === target.headSha
    && identity?.treeSha === target.treeSha && identity?.changedFilesDigest === target.changedFilesDigest
    && identity?.diffDigest === target.diffDigest
    && canonical(identity?.changedFiles) === canonical(candidate?.changedFiles)
    && candidate?.baseSha === target.baseSha && candidate?.headSha === target.headSha
    && candidate?.treeSha === target.treeSha && candidate?.changedFilesDigest === target.changedFilesDigest
    && candidate?.diffDigest === target.diffDigest
    && exactRawValidationEvidence(state?.evidence, target)
    && exactRawCheckpointMutationMarkers(state?.mutationMarkers, target);
}

export function exactTerminalFailureFindings(findings, candidate, target) {
  return Array.isArray(findings) && findings.length > 0
    && findings.every((finding) =>
      finding?.sourceKind === "local_validation"
      && finding?.repository === target.repository
      && finding?.issueNumber === target.issueNumber
      && finding?.taskKey === target.taskKey
      && finding?.branchName === target.branch
      && canonical(finding?.identity) === canonical(candidate)
      && finding?.classification === "unsafe_or_ambiguous"
      && finding?.sourceFixEligible === false
      && finding?.retryable === false
      && finding?.reasonCode === "source_failure_unsafe_or_ambiguous"
      && finding?.nextAction === "stop_fail_closed");
}

export function exactRawValidationEvidence(evidence, target) {
  const validation = evidence?.localValidation;
  return validation?.status === "failed"
    && validation?.headSha === target.baseSha
    && validation?.baseSha === target.baseSha
    && validation?.changedFilesDigest === target.changedFilesDigest
    && validation?.stale === true
    && validation?.invalidatedBy === "validation_failure_candidate_commit"
    && validation?.invalidatedOldHeadSha === target.baseSha
    && validation?.invalidatedNewHeadSha === target.headSha
    && evidence?.externalReview === null
    && evidence?.codexReview === null
    && evidence?.ciChecks === null
    && evidence?.codeScanning === null
    && evidence?.mergeEligibility === null
    && evidence?.finalRefresh === null
    && evidence?.postMergeExpectations === null;
}

export function exactRawCheckpointMutationMarkerShape(markers) {
  if (!markers || typeof markers !== "object" || Array.isArray(markers)) return false;
  return canonical(Object.keys(markers).sort())
    === canonical(["branch_ownership_created", "claim", "logical_task_charge"]);
}

export function exactRawCheckpointMutationMarkers(markers, target) {
  if (!exactRawCheckpointMutationMarkerShape(markers)) return false;
  const claimKey = `issue-${target.issueNumber}`;
  const branchKey = `${target.branch}:${target.baseSha}`;
  const claim = markers.claim?.[claimKey];
  const charge = markers.logical_task_charge?.[target.chargeId];
  const branch = markers.branch_ownership_created?.[branchKey];
  return canonical(Object.keys(markers.claim || {})) === canonical([claimKey])
    && canonical(Object.keys(markers.logical_task_charge || {})) === canonical([target.chargeId])
    && canonical(Object.keys(markers.branch_ownership_created || {})) === canonical([branchKey])
    && claim?.status === "completed"
    && claim?.target === `https://github.com/${target.repository}/issues/${target.issueNumber}`
    && claim?.correlation === target.runnerRunId
    && charge?.status === "completed"
    && charge?.target === claimKey
    && charge?.correlation === target.chargeId
    && branch?.status === "completed"
    && branch?.target === target.branch
    && branch?.correlation === target.baseSha;
}

export function stateMayBelongToTarget(state, target) {
  const projectedStates = Array.isArray(state?.recovery?.states) ? state.recovery.states : [];
  return state?.issue?.number === target?.issueNumber
    || state?.taskKey === target?.taskKey
    || state?.branchName === target?.branch
    || projectedStates.some((projected) =>
      projected?.issueNumber === target?.issueNumber
      || projected?.taskKey === target?.taskKey
      || projected?.branchName === target?.branch);
}

function iterationStateFilenameIdentity(artifact) {
  const match = /^(.+)-(\d+)-(?:issue-(\d+)|no-issue)\.json$/u.exec(path.basename(artifact?.path || ""));
  if (!match) return null;
  try {
    validateRunnerRunId(match[1]);
  } catch {
    return null;
  }
  const index = Number(match[2]);
  const issueNumber = match[3] === undefined ? null : Number(match[3]);
  if (!Number.isSafeInteger(index) || index < 1
    || (issueNumber !== null && (!Number.isSafeInteger(issueNumber) || issueNumber < 1))) return null;
  return { runId: match[1], index, issueNumber };
}

export function stateArtifactMayBelongToTarget(artifact, target) {
  const filename = iterationStateFilenameIdentity(artifact);
  return filename?.issueNumber === target?.issueNumber
    || stateMayBelongToTarget(artifact?.value, target);
}

export function exactStateArtifactFilenameIdentity(artifact) {
  const filename = iterationStateFilenameIdentity(artifact);
  return filename !== null
    && artifact?.value?.runId === filename.runId
    && artifact?.value?.index === filename.index
    && artifact?.value?.issue?.number === filename.issueNumber;
}

export function stateArtifactMayBelongToTargetOrSuccessorRun(
  artifact,
  target,
  directlyAssociatedStates = [],
) {
  if (stateArtifactMayBelongToTarget(artifact, target)) return true;
  const filename = iterationStateFilenameIdentity(artifact);
  const successorRunIds = new Set(directlyAssociatedStates
    .map((state) => state?.runId)
    .filter((runId) => typeof runId === "string" && runId.length > 0));
  return successorRunIds.has(filename?.runId)
    || stateMayBelongToTargetOrSuccessorRun(
      artifact?.value,
      target,
      directlyAssociatedStates,
    );
}

export function successorRunArtifactsAreUnique(artifacts, directlyAssociatedStates = []) {
  const successorRunIds = new Set(directlyAssociatedStates
    .map((state) => state?.runId)
    .filter((runId) => typeof runId === "string" && runId.length > 0));
  if (successorRunIds.size !== 1) return false;
  const successorSupervisorRunIds = new Set(directlyAssociatedStates
    .map((state) => state?.supervisorRunId)
    .filter((runId) => typeof runId === "string" && runId.length > 0));
  if (successorSupervisorRunIds.size > 1) return false;
  const matching = artifacts.filter((artifact) =>
    successorRunIds.has(iterationStateFilenameIdentity(artifact)?.runId)
    || successorRunIds.has(artifact?.value?.runId)
    || successorSupervisorRunIds.has(artifact?.value?.supervisorRunId));
  return matching.length === 1;
}

export function stateMayBelongToTargetOrSuccessorRun(state, target, directlyAssociatedStates = []) {
  if (stateMayBelongToTarget(state, target)) return true;
  return directlyAssociatedStates.some((associated) =>
    (typeof state?.runId === "string" && state.runId.length > 0 && state.runId === associated?.runId)
    || (typeof state?.supervisorRunId === "string" && state.supervisorRunId.length > 0
      && state.supervisorRunId === associated?.supervisorRunId));
}

export function exactLifecycle(state, target) {
  const effects = state?.recovery?.effectsAlreadyPresent;
  const common = state?.repository === target.repository
    && state?.logicalTask?.issueNumber === target.issueNumber
    && state?.logicalTask?.taskKey === target.taskKey
    && state?.logicalTask?.runId === target.runnerRunId
    && state?.logicalTask?.supervisorRunId === target.supervisorRunId
    && state?.logicalTask?.claimIdentity === target.claimIdentity
    && state?.logicalTask?.chargeMarkerRef === target.chargeMarkerRef
    && state?.branch?.name === target.branch && state?.branch?.baseSha === target.baseSha
    && state?.branch?.headSha === target.headSha && state?.branch?.prNumber === null
    && state?.controller?.localSourceChangingRoundsPerEpoch === target.localSourceChangingRounds
    && state?.controller?.githubTriggeredFixEpochsPerPr === target.githubTriggeredFixEpochs
    && state?.controller?.lifetimeLocalSourceChangingRounds === target.lifetimeLocalSourceChangingRounds
    && state?.interruption?.class === "main_process_exit_without_terminal_report"
    && state?.interruption?.reasonCode === "interruption_main_process_exit_without_terminal_report"
    && state?.recovery?.status === "pending"
    && state?.recovery?.attempts === 1
    && typeof state?.recovery?.operationId === "string" && state.recovery.operationId.length > 0
    && state?.recovery?.phaseAfter === "checkpoint_validation_commit"
    && effects?.mutation === false && effects?.commit === true && effects?.push === false
    && effects?.pr === false && effects?.merge === false;
  if (!common) return false;
  const exactTerminal = state?.controller?.phase === "stopped"
    && state?.controller?.nextExactAction === TERMINAL_REASON_CODE
    && state?.report?.status === "stopped"
    && state?.mutationAuthority?.status === "terminal"
    && state?.mutationAuthority?.ownerSessionId === null
    && state?.mutationAuthority?.handoff === null
    && effects?.comment === false;
  if (exactTerminal) return true;
  if (target?.allowReopenedLifecycle !== true) return false;
  const handoff = state?.mutationAuthority?.handoff;
  const exactReopened = state?.controller?.phase === "checkpoint_validation_commit"
    && state?.controller?.nextExactAction === "run_validation_and_commit"
    && state?.report?.status === "in_progress"
    && handoff?.reason === "validation_retry_derivative_reopened"
    && /^[a-f0-9]{64}$/.test(String(handoff?.checkpointDigest || ""))
    && handoff.checkpointDigest !== state?.checkpoint?.digest
    && typeof effects?.comment === "boolean"
    && typeof handoff?.startedAt === "string"
    && Number.isFinite(Date.parse(handoff.startedAt));
  if (!exactReopened) return false;
  const expectedRequestId = digest(
    `${state.recovery.operationId}:${handoff.retiredSessionId}:validation-retry`,
  );
  const successorSessionId = `recovery-handoff:${digest(JSON.stringify([
    state.logicalTask.runId,
    state.recovery.operationId,
    expectedRequestId,
  ]))}`;
  if (handoff.requestId !== expectedRequestId) return false;
  const exactPending = state?.mutationAuthority?.status === "recovery_pending"
    && state?.mutationAuthority?.ownerSessionId === null
    && handoff?.retiredSessionId === state?.sessions?.current
    && handoff?.successorSessionId === null
    && !Object.prototype.hasOwnProperty.call(handoff, "completedAt")
    && state?.sessions?.retired?.includes(state.sessions.current);
  const exactActive = state?.mutationAuthority?.status === "active"
    && state?.mutationAuthority?.ownerSessionId === successorSessionId
    && state?.sessions?.current === successorSessionId
    && handoff?.successorSessionId === successorSessionId
    && typeof handoff?.completedAt === "string"
    && Number.isFinite(Date.parse(handoff.completedAt))
    && Date.parse(handoff.completedAt) >= Date.parse(handoff.startedAt)
    && state?.sessions?.retired?.includes(handoff?.retiredSessionId);
  return exactPending || exactActive;
}

export function exactReopenedHandoffCheckpointOrdering(lifecycle, predecessor) {
  const handoff = lifecycle?.mutationAuthority?.handoff;
  const predecessorWrittenAt = Date.parse(predecessor?.checkpoint?.writtenAt);
  const startedAt = Date.parse(handoff?.startedAt);
  const completedAt = handoff?.completedAt == null
    ? null
    : Date.parse(handoff.completedAt);
  const lifecycleWrittenAt = Date.parse(lifecycle?.checkpoint?.writtenAt);
  if (![predecessorWrittenAt, startedAt, lifecycleWrittenAt].every(Number.isFinite)
    || predecessorWrittenAt > startedAt
    || startedAt > lifecycleWrittenAt) {
    return false;
  }
  if (lifecycle?.mutationAuthority?.status === "active") {
    return Number.isFinite(completedAt)
      && startedAt <= completedAt
      && completedAt <= lifecycleWrittenAt;
  }
  return lifecycle?.mutationAuthority?.status === "recovery_pending"
    && completedAt === null;
}

export function exactTerminalIteration(value, target) {
  const terminal = value?.recovery?.states;
  const budget = value?.logicalTaskBudget;
  return canonical(Object.keys(value || {}).sort()) === canonical(EXACT_TERMINAL_ITERATION_FIELDS)
    && target?.durableBudgetExact === true
    && target?.acceptedLogicalTasks === 1
    && value?.index === 1
    && value?.outcome === "blocked_recovery_state"
    && canonical(value?.issue) === canonical({ number: target.issueNumber })
    && value?.issueSource === "startup_recovery"
    && value?.phase === "startup_recovery"
    && value?.laneDecision === null
    && Date.parse(value?.startedAt) <= Date.parse(value?.finishedAt)
    && canonical(value?.runIssueState) === canonical({
      attemptedIssueNumbers: [],
      attemptedIssueCount: 0,
      processedIssueNumbers: [target.issueNumber],
      processedIssueCount: 1,
    })
    && value?.branchName === target.branch
    && value?.baseOriginMainSha === target.baseSha
    && value?.runnerCreatedCommitSha === target.headSha
    && value?.pr === null && Array.isArray(value?.changedFiles) && value.changedFiles.length === 0
    && value?.existingPrRecovery === null && value?.bundle === null && value?.autoMerge === null
    && value?.validation === null && value?.review === null && value?.externalReview === null
    && value?.systemicStop === SUCCESSOR_SYSTEMIC_STOP
    && budget?.ok === true && budget?.duplicate === true && budget?.charged === false
    && budget?.chargeId === target.chargeId
    && budget?.acceptedLogicalTaskCount === target.acceptedLogicalTasks
    && budget?.statePath === target.chargeMarkerRef
    && budget?.state?.stateVersion === 1
    && budget?.state?.repository === target.repository
    && budget?.state?.budgetScopeId === target.supervisorRunId
    && budget?.state?.acceptedLogicalTaskCount === target.acceptedLogicalTasks
    && Object.keys(budget?.state?.charges || {}).length === target.acceptedLogicalTasks
    && canonical(budget?.state?.charges?.[target.chargeId]) === canonical(budget?.marker)
    && canonical(budget?.marker) === canonical(target?.durableChargeMarker)
    && exactDurableChargeMarker(budget?.marker, target)
    && budget?.marker?.chargeId === target.chargeId
    && budget?.marker?.identity?.repository === target.repository
    && budget?.marker?.identity?.issueNumber === target.issueNumber
    && budget?.marker?.identity?.taskLineageId === `issue-${target.issueNumber}`
    && budget?.marker?.identity?.claimIdentity === target.claimIdentity
    && Array.isArray(terminal) && terminal.length === 1
    && exactTerminalProjection(terminal[0], target);
}

function exactDurableChargeMarker(marker, target) {
  return canonical(Object.keys(marker || {}).sort()) === canonical([
    "acceptedAt", "chargeId", "chargedAt", "identity", "identityClass", "reason",
  ])
    && canonical(Object.keys(marker?.identity || {}).sort()) === canonical([
      "acceptedAt", "claimIdentity", "issueNumber", "repository", "taskLineageId",
    ])
    && marker.identityClass === "accepted_issue_claim"
    && marker.reason === "authoritative_claim_reread_passed"
    && marker.acceptedAt === marker.identity.acceptedAt
    && Number.isFinite(Date.parse(marker.acceptedAt))
    && Number.isFinite(Date.parse(marker.chargedAt))
    && Date.parse(marker.chargedAt) >= Date.parse(marker.acceptedAt)
    && marker.chargeId === target.chargeId;
}

function exactTerminalProjection(value, target) {
  return value?.taskKey === target.taskKey && value?.issueNumber === target.issueNumber
    && value?.branchName === target.branch && value?.baseSha === target.baseSha
    && value?.currentHeadSha === target.headSha && value?.prNumber === null && value?.prUrl === null
    && value?.phase === "stopped"
    && value?.stopReason?.reasonCode === TERMINAL_REASON_CODE
    && value?.stopReason?.reason === TERMINAL_DETAIL
    && value?.firstIncompleteAction === "run_validation_and_commit"
    && value?.nextSafeAction === "stop_fail_closed"
    && value?.runId === target.runnerRunId
    && value?.supervisorRunId === target.supervisorRunId;
}

export function exactTerminalSummary(summary, iteration, target) {
  return Array.isArray(summary?.iterations) && summary.iterations.length === 1
    && canonical(summary.iterations[0]) === canonical(iteration)
    && summary?.runId === iteration.runId
    && summary?.stopReason === iteration.systemicStop
    && typeof summary?.supervisorRunId === "string"
    && summary?.maxRuntimeMs === SUCCESSOR_MAX_RUNTIME_MS
    && summary?.configPath === SUCCESSOR_RUNNER_CONFIG_PATH
    && summary?.attemptedIssueCount === 0
    && Array.isArray(summary?.attemptedIssueNumbers) && summary.attemptedIssueNumbers.length === 0
    && summary?.processedIssueCount === 1
    && Array.isArray(summary?.processedIssueNumbers)
    && canonical(summary.processedIssueNumbers) === canonical([target.issueNumber])
    && summary?.acceptedLogicalTaskCount === 1 && summary?.maxIterations === 1
    && Date.parse(summary?.startedAt) <= Date.parse(summary?.finishedAt)
    && Date.parse(summary?.startedAt) <= Date.parse(iteration?.startedAt)
    && Date.parse(summary?.finishedAt) >= Date.parse(iteration?.finishedAt);
}

export function exactFailedContinuationIteration(value, target, durableBudgetState) {
  const projected = value?.recovery?.terminalDerivativeProjection;
  const state = value?.recovery?.state;
  const states = value?.recovery?.states;
  const budget = value?.logicalTaskBudget;
  return canonical(Object.keys(value || {}).sort()) === canonical(EXACT_TERMINAL_ITERATION_FIELDS)
    && canonical(Object.keys(value?.recovery || {}).sort())
      === canonical(FAILED_CONTINUATION_RECOVERY_FIELDS)
    && canonical(Object.keys(state || {}).sort()) === canonical(FAILED_CONTINUATION_STATE_FIELDS)
    && value?.index === 1
    && value?.outcome === "blocked_recovery_state"
    && canonical(value?.issue) === canonical({ number: target.issueNumber })
    && value?.issueSource === "startup_recovery"
    && value?.phase === "startup_recovery"
    && value?.laneDecision === null
    && value?.systemicStop === FAILED_CONTINUATION_STOP
    && Date.parse(value?.startedAt) <= Date.parse(value?.finishedAt)
    && value?.branchName === target.branch
    && value?.baseOriginMainSha === target.baseSha
    && value?.runnerCreatedCommitSha === target.headSha
    && value?.pr === null
    && value?.existingPrRecovery === null
    && value?.bundle === null
    && value?.autoMerge === null
    && Array.isArray(value?.changedFiles) && value.changedFiles.length === 0
    && value?.validation === null
    && value?.review === null
    && value?.externalReview === null
    && canonical(value?.runIssueState) === canonical({
      attemptedIssueNumbers: [],
      attemptedIssueCount: 0,
      processedIssueNumbers: [target.issueNumber],
      processedIssueCount: 1,
    })
    && budget?.ok === true
    && canonical(Object.keys(budget || {}).sort())
      === canonical(FAILED_CONTINUATION_BUDGET_FIELDS)
    && budget?.duplicate === true
    && budget?.charged === false
    && budget?.reasonCode === "startup_recovery_existing_charge_reused"
    && budget?.chargeId === target.chargeId
    && budget?.acceptedLogicalTaskCount === target.acceptedLogicalTasks
    && budget?.statePath === target.chargeMarkerRef
    && canonical(budget?.marker) === canonical(target.durableChargeMarker)
    && canonical(budget?.state?.charges?.[target.chargeId]) === canonical(target.durableChargeMarker)
    && budget?.state?.repository === target.repository
    && budget?.state?.budgetScopeId === target.supervisorRunId
    && budget?.state?.acceptedLogicalTaskCount === 1
    && Object.keys(budget?.state?.charges || {}).length === 1
    && canonical(budget?.state) === canonical(durableBudgetState)
    && value?.recovery?.found === true
    && value?.recovery?.allowed === true
    && value?.recovery?.action === "resume_recoverable_work"
    && value?.recovery?.reasonCode === "outage_recovery_target_discovered"
    && canonical(value?.recovery?.outcome) === canonical({
      ok: true,
      outcomeClass: "pending",
      reasonCode: "outage_recovery_target_discovered",
      nextAction: "wait",
      retryable: true,
      mutationAllowed: false,
    })
    && exactFailedContinuationRecoveryTarget(value?.recovery?.target, target)
    && value?.recovery?.terminalDerivativeContinuationAdmission === null
    && canonical(Object.keys(projected || {}).sort())
      === canonical(FAILED_CONTINUATION_PROJECTION_FIELDS)
    && projected?.ok === true
    && projected?.projectionApplied === true
    && projected?.projectionReasonCode
      === "authenticated_terminal_validation_retry_derivative_projected"
    && /^[a-f0-9]{64}$/u.test(String(projected?.evidenceDigest || ""))
    && Array.isArray(projected?.boundArtifacts)
    && projected.boundArtifacts.length >= 8
    && state?.taskKey === target.taskKey
    && state?.issueNumber === target.issueNumber
    && state?.branchName === target.branch
    && state?.baseSha === target.baseSha
    && state?.currentHeadSha === target.headSha
    && state?.prNumber === null
    && state?.prUrl === null
    && state?.phase === "checkpoint_validation_commit"
    && state?.active === true
    && state?.attemptClass === null
    && state?.blocker === null
    && state?.firstIncompleteAction === "run_validation_and_commit"
    && state?.nextSafeAction === "run_validation_and_commit"
    && state?.stopReason === null
    && state?.runId === target.runnerRunId
    && state?.supervisorRunId === target.supervisorRunId
    && Array.isArray(states) && states.length === 1
    && canonical(states[0]) === canonical(state)
    && canonical(value?.recovery?.stateCounts) === canonical({
      totalRecoverableCount: 1,
      exactMatchingCount: 1,
      ignoredNonmatchingCount: 0,
    });
}

function exactFailedContinuationRecoveryTarget(recoveryTarget, target) {
  return canonical(Object.keys(recoveryTarget || {}).sort()) === canonical([
    "attemptNumber", "baseSha", "branchName", "currentHeadSha", "issueNumber",
    "markerKey", "originalSupervisorSpecDigest", "outageFingerprint", "prHeadSha",
    "prNumber", "runnerRunId", "supervisorRunId", "taskKey",
    "terminalValidationRetryDerivativeNoPr",
  ])
    && recoveryTarget.taskKey === target.taskKey
    && recoveryTarget.issueNumber === target.issueNumber
    && recoveryTarget.branchName === target.branch
    && recoveryTarget.baseSha === target.baseSha
    && recoveryTarget.currentHeadSha === target.headSha
    && recoveryTarget.runnerRunId === target.runnerRunId
    && recoveryTarget.supervisorRunId === target.supervisorRunId
    && recoveryTarget.terminalValidationRetryDerivativeNoPr === true
    && recoveryTarget.prNumber === null
    && recoveryTarget.prHeadSha === null
    && recoveryTarget.attemptNumber === null
    && recoveryTarget.markerKey === null
    && recoveryTarget.originalSupervisorSpecDigest === null
    && recoveryTarget.outageFingerprint === null;
}

export function exactFailedContinuationSummary(summary, iteration, target, logsRoot) {
  return canonical(Object.keys(summary || {}).sort()) === canonical(FAILED_CONTINUATION_SUMMARY_FIELDS)
    && Array.isArray(summary?.iterations)
    && summary.iterations.length === 1
    && canonical(summary.iterations[0]) === canonical(iteration)
    && summary?.runId === iteration.runId
    && typeof summary?.supervisorRunId === "string"
    && summary?.stopReason === FAILED_CONTINUATION_STOP
    && summary?.attemptedIssueCount === 0
    && Array.isArray(summary?.attemptedIssueNumbers)
    && summary.attemptedIssueNumbers.length === 0
    && summary?.processedIssueCount === 1
    && canonical(summary?.processedIssueNumbers) === canonical([target.issueNumber])
    && summary?.acceptedLogicalTaskCount === target.acceptedLogicalTasks
    && summary?.autoMergeCanaryApprovalMode === "not_approved"
    && summary?.logPath === path.join(logsRoot, "run-logs", `${iteration.runId}.log`)
    && summary?.maxIterations === 1
    && summary?.maxRuntimeMs === SUCCESSOR_MAX_RUNTIME_MS
    && Date.parse(summary?.startedAt) <= Date.parse(summary?.finishedAt)
    && Date.parse(summary?.startedAt) <= Date.parse(iteration?.startedAt)
    && Date.parse(summary?.finishedAt) >= Date.parse(iteration?.finishedAt);
}

export function exactFailedContinuationSpec(spec, summary, target) {
  try {
    validateRunSpecShape(spec);
  } catch {
    return false;
  }
  const recoveryTarget = spec?.recoveryOnlyTarget;
  return Object.keys(spec).length === allowedSpecFields.size
    && Object.keys(spec).every((field) => allowedSpecFields.has(field))
    && spec?.specVersion === 1
    && spec?.runId === summary.supervisorRunId
    && spec?.mode === "trusted"
    && spec?.maxTasks === 1
    && spec?.maxRuntime === "14d"
    && spec?.profile === "default"
    && spec?.requestedBy === "operator"
    && spec?.outageResubmission === null
    && spec?.initialOriginMainSha === summary?.baseOriginMainSha
    && spec?.runnerConfigPath === SUCCESSOR_RUNNER_CONFIG_PATH
    && summary?.configPath === SUCCESSOR_RUNNER_CONFIG_PATH
    && spec?.runnerConfigSha256 === FAILED_CONTINUATION_RUNNER_CONFIG_SHA256
    && supervisorModeToRunnerMode(spec?.mode) === summary?.mode
    && spec?.sourceIssueNumber === target.issueNumber
    && spec?.sourceBranchName === target.branch
    && spec?.parentRunnerRunId === target.runnerRunId
    && spec?.parentSupervisorRunId === target.supervisorRunId
    && exactFailedContinuationRecoveryTarget(recoveryTarget, target)
    && Date.parse(spec?.createdAt) <= Date.parse(summary?.startedAt);
}

export function exactFailedContinuationSpecArtifact(artifact, summary, target, logsRoot) {
  try {
    return realpathSync(artifact?.path)
      === realpathSync(specPathForRunId(summary?.supervisorRunId, logsRoot))
      && exactFailedContinuationSpec(artifact?.value, summary, target);
  } catch {
    return false;
  }
}

export function exactFailedContinuationSupervisorState(
  state,
  heartbeat,
  iteration,
  summary,
  specArtifact,
  logsRoot,
  expectedRetainedDiagnostics = [],
) {
  const summaryJsonPath = path.join(logsRoot, "summaries", `${iteration.runId}.json`);
  const summaryMarkdownPath = path.join(logsRoot, "summaries", `${iteration.runId}.md`);
  const supervisorRunRoot = path.join(
    logsRoot,
    "supervisor",
    "runs",
    digest(summary.supervisorRunId),
  );
  const expectedUnitName = `settleora-auto-runner@${summary.supervisorRunId}.service`;
  const expectedArgv = historicalRunnerArgvForSpec(specArtifact.value, iteration.runId);
  const diagnostics = heartbeat?.reportResolution?.diagnostics;
  const exactState = state?.state === "blocked"
    && canonical(Object.keys(state || {}).sort())
      === canonical(FAILED_CONTINUATION_SUPERVISOR_STATE_FIELDS)
    && canonical(Object.keys(heartbeat || {}).sort())
      === canonical(FAILED_CONTINUATION_HEARTBEAT_FIELDS)
    && state?.runId === summary.supervisorRunId
    && state?.runnerRunId === iteration.runId
    && state?.childTerminalState === "blocked"
    && state?.childStatus === 2
    && state?.childSignal === null
    && state?.terminalReason === "child_exit_mapped"
    && state?.specPath === specArtifact.path
    && state?.specSha256 === specArtifact.sha256
    && state?.runnerConfigSha256 === FAILED_CONTINUATION_RUNNER_CONFIG_SHA256
    && state?.runnerConfigSha256 === specArtifact.value.runnerConfigSha256
    && state?.maxTasks === specArtifact.value.maxTasks
    && state?.maxRuntime === specArtifact.value.maxRuntime
    && state?.initialOriginMainSha === specArtifact.value.initialOriginMainSha
    && canonical(state?.runnerArgv) === canonical(expectedArgv)
    && state?.createdAt === specArtifact.value.createdAt
    && state?.unitName === expectedUnitName
    && state?.stdoutPath === path.join(supervisorRunRoot, "stdout.log")
    && state?.stderrPath === path.join(supervisorRunRoot, "stderr.log")
    && state?.runnerSummaryJsonPath === summaryJsonPath
    && state?.runnerSummaryMarkdownPath === summaryMarkdownPath
    && state?.reportPath === summaryMarkdownPath
    && state?.reportResolution?.ok === true
    && state?.reportResolution?.status === "matched"
    && state?.reportResolution?.reason === null
    && state?.reportResolution?.runnerRunId === iteration.runId
    && state?.reportResolution?.runnerSummaryJsonPath === summaryJsonPath
    && state?.reportResolution?.runnerSummaryMarkdownPath === summaryMarkdownPath
    && state?.reportResolution?.reportPath === summaryMarkdownPath
    && Date.parse(specArtifact.value.createdAt) <= Date.parse(state?.startedAt)
    && Date.parse(state?.startedAt) <= Date.parse(summary?.startedAt)
    && Date.parse(summary?.finishedAt) <= Date.parse(state?.finishedAt)
    && Date.parse(state?.finishedAt) <= Date.parse(state?.updatedAt)
    && Number.isSafeInteger(state?.heartbeatGeneration)
    && state.heartbeatGeneration === 3;
  return exactState
    && heartbeat?.schemaVersion === 2
    && heartbeat?.runId === state.runId
    && heartbeat?.runnerRunId === state.runnerRunId
    && heartbeat?.state === "blocked"
    && heartbeat?.terminal === true
    && heartbeat?.heartbeatGeneration === state.heartbeatGeneration
    && heartbeat?.maxTasks === state.maxTasks
    && heartbeat?.maxRuntime === state.maxRuntime
    && heartbeat?.unitName === state.unitName
    && heartbeat?.heartbeatIntervalSeconds
      === FAILED_CONTINUATION_HEARTBEAT_INTERVAL_SECONDS
    && heartbeat?.heartbeatLeaseSeconds
      === FAILED_CONTINUATION_HEARTBEAT_LEASE_SECONDS
    && heartbeat?.monitoringDelivery === null
    && heartbeat?.ownerPid === FAILED_CONTINUATION_OWNER_PID
    && heartbeat?.currentIssue === null
    && heartbeat?.currentPr === null
    && canonical(Object.keys(heartbeat?.counts || {}).sort())
      === canonical(FAILED_CONTINUATION_COUNT_FIELDS)
    && canonical(Object.keys(heartbeat?.reportResolution || {}).sort())
      === canonical(FAILED_CONTINUATION_REPORT_RESOLUTION_FIELDS)
    && Array.isArray(diagnostics)
    && diagnostics.length >= 1
    && diagnostics.every((diagnostic) =>
      canonical(Object.keys(diagnostic || {}).sort())
        === canonical(FAILED_CONTINUATION_DIAGNOSTIC_FIELDS))
    && canonical(diagnostics) === canonical(expectedRetainedDiagnostics)
    && (expectedRetainedDiagnostics.some((diagnostic) =>
      canonical(diagnostic) === canonical({
        file: `${iteration.runId}.json`,
        reason: null,
        runnerRunId: iteration.runId,
        status: "matched",
      })) || (expectedRetainedDiagnostics.length === 20
      && !expectedRetainedDiagnostics.some((diagnostic) =>
        diagnostic.file === `${iteration.runId}.json`)))
    && heartbeat?.counts?.attempted === 0
    && heartbeat?.counts?.processed === 0
    && heartbeat?.counts?.completed === 0
    && heartbeat?.counts?.failed === 0
    && heartbeat?.counts?.blocked === 0
    && heartbeat?.counts?.merged === 0
    && heartbeat?.counts?.skipped === 0
    && heartbeat?.reportPath === summaryMarkdownPath
    && canonical(heartbeat?.reportResolution) === canonical(state.reportResolution)
    && Date.parse(heartbeat?.startedAt) === Date.parse(state?.startedAt)
    && Date.parse(heartbeat?.updatedAt) >= Date.parse(state?.updatedAt)
    && Date.parse(heartbeat?.updatedAt)
      <= Date.parse(state?.updatedAt)
        + (FAILED_CONTINUATION_HEARTBEAT_INTERVAL_SECONDS * 1000)
    && Date.parse(heartbeat?.leaseExpiresAt)
      === Date.parse(heartbeat?.updatedAt)
        + (FAILED_CONTINUATION_HEARTBEAT_LEASE_SECONDS * 1000);
}

export function exactSuccessorSupervisorState(state, iteration, summary, specArtifact, logsRoot) {
  const summaryJsonPath = path.join(logsRoot, "summaries", `${iteration?.runId}.json`);
  const summaryMarkdownPath = path.join(logsRoot, "summaries", `${iteration?.runId}.md`);
  const expectedRunnerArgv = historicalRunnerArgvForSpec(
    specArtifact?.value,
    iteration?.runId,
  );
  return state?.state === "blocked"
    && state?.runId === summary?.supervisorRunId
    && state?.runnerRunId === iteration?.runId
    && state?.childTerminalState === "blocked"
    && state?.childStatus === 2
    && state?.childSignal === null
    && state?.terminalReason === "child_exit_mapped"
    && state?.specPath === specArtifact?.path
    && state?.specSha256 === specArtifact?.sha256
    && state?.runnerConfigSha256 === SUCCESSOR_RUNNER_CONFIG_SHA256
    && state?.maxTasks === 1
    && state?.maxRuntime === "14d"
    && state?.initialOriginMainSha === specArtifact?.value?.initialOriginMainSha
    && canonical(state?.runnerArgv) === canonical(expectedRunnerArgv)
    && state?.runnerSummaryJsonPath === summaryJsonPath
    && state?.runnerSummaryMarkdownPath === summaryMarkdownPath
    && state?.reportPath === summaryMarkdownPath
    && state?.reportResolution?.ok === true
    && state?.reportResolution?.status === "matched"
    && state?.reportResolution?.reason === null
    && state?.reportResolution?.runnerRunId === iteration?.runId
    && state?.reportResolution?.runnerSummaryJsonPath === summaryJsonPath
    && state?.reportResolution?.runnerSummaryMarkdownPath === summaryMarkdownPath
    && state?.reportResolution?.reportPath === summaryMarkdownPath
    && Date.parse(specArtifact?.value?.createdAt) <= Date.parse(state?.startedAt)
    && Date.parse(state?.startedAt) <= Date.parse(summary?.startedAt)
    && Date.parse(summary?.finishedAt) <= Date.parse(state?.finishedAt)
    && Number.isSafeInteger(state?.heartbeatGeneration) && state.heartbeatGeneration >= 1;
}

export function exactSuccessorSpec(spec, summary) {
  try {
    validateRunSpecShape(spec);
  } catch {
    return false;
  }
  return Object.keys(spec).length === allowedSpecFields.size
    && Object.keys(spec).every((field) => allowedSpecFields.has(field))
    && spec?.specVersion === 1 && spec?.runId === summary.supervisorRunId
    && spec?.mode === "trusted" && spec?.maxTasks === 1
    && spec?.maxRuntime === "14d" && spec?.profile === "default"
    && spec?.runnerConfigPath === SUCCESSOR_RUNNER_CONFIG_PATH
    && spec?.runnerConfigSha256 === SUCCESSOR_RUNNER_CONFIG_SHA256
    && summary?.maxRuntimeMs === SUCCESSOR_MAX_RUNTIME_MS
    && summary?.configPath === spec.runnerConfigPath
    && supervisorModeToRunnerMode(spec.mode) === summary?.mode
    && spec?.initialOriginMainSha === summary?.baseOriginMainSha
    && spec?.requestedBy === "operator" && spec?.sourceBranchName === null
    && spec?.sourceIssueNumber === null && spec?.parentRunnerRunId === null
    && spec?.parentSupervisorRunId === null && spec?.recoveryOnlyTarget === null
    && Date.parse(spec?.createdAt) <= Date.parse(summary?.startedAt);
}

export function exactSuccessorSpecArtifact(artifact, summary, logsRoot) {
  try {
    return realpathSync(artifact?.path) === realpathSync(specPathForRunId(summary?.supervisorRunId, logsRoot))
      && exactSuccessorSpec(artifact?.value, summary);
  } catch {
    return false;
  }
}

function trustedDirectory(value) {
  const resolved = realpathSync(path.resolve(value));
  const info = lstatSync(resolved);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("untrusted directory");
  return resolved;
}

function trustedJsonFiles(root) {
  return readdirSync(root).filter((name) => name.endsWith(".json"))
    .map((name) => trustedJsonArtifact(root, path.join(root, name)));
}

function trustedRunnerSummaryScan(root, selectedName) {
  const names = readdirSync(root)
    .filter((name) => RUNNER_SUMMARY_FILENAME_PATTERN.test(name))
    .sort();
  if (names.length > MAX_RUNNER_SUMMARY_FILES) {
    throw new Error("runner summary scan limit exceeded");
  }
  const summaries = [];
  let selectedArtifact = null;
  for (const name of names) {
    const artifact = trustedJsonArtifact(
      root,
      path.join(root, name),
      null,
      MAX_RUNNER_SUMMARY_BYTES,
    );
    if (name === selectedName) selectedArtifact = artifact;
    summaries.push({
      path: artifact.path,
      value: { supervisorRunId: artifact.value?.supervisorRunId },
    });
  }
  return { selectedArtifact, summaries };
}

export function failedContinuationTruncatedDiagnostics(
  summaryArtifacts,
  selectedSummaryArtifact,
  selectedRunnerRunId,
) {
  const artifactsByName = new Map(summaryArtifacts
    .filter(({ path: artifactPath }) =>
      RUNNER_SUMMARY_FILENAME_PATTERN.test(path.basename(artifactPath)))
    .map((artifact) => [path.basename(artifact.path), artifact]));
  return Array.from(artifactsByName.keys())
    .sort()
    .slice(0, 20)
    .map((name) => artifactsByName.get(name))
    .map(({ path: artifactPath, value }) =>
      artifactPath === selectedSummaryArtifact?.path
        ? {
          file: path.basename(artifactPath),
          reason: null,
          runnerRunId: selectedRunnerRunId,
          status: "matched",
        }
        : {
          file: path.basename(artifactPath),
          reason: value?.supervisorRunId
            ? "wrong_supervisor_run_id"
            : "missing_supervisor_run_id",
          runnerRunId: null,
          status: "skipped",
        });
}

export function runnerSummaryCandidateCountWithinResolverLimit(summaryArtifacts) {
  return Array.isArray(summaryArtifacts)
    && summaryArtifacts.length <= MAX_RUNNER_SUMMARY_FILES;
}

export function runnerSummaryCandidateSizeWithinResolverLimit(size) {
  return Number.isSafeInteger(size)
    && size > 0
    && size <= MAX_RUNNER_SUMMARY_BYTES;
}

function trustedNestedJsonFiles(root, basename) {
  return readdirSync(root).map((name) => path.join(root, name, basename))
    .map((artifactPath) => trustedJsonArtifact(root, artifactPath));
}

function trustedJsonArtifact(
  root,
  artifactPath,
  _artifactLabel = null,
  maxBytes = MAX_ARTIFACT_BYTES,
) {
  const artifact = trustedFileArtifact(root, artifactPath, maxBytes);
  return { ...artifact, value: JSON.parse(artifact.bytes.toString("utf8")) };
}

function trustedFileArtifact(root, artifactPath, maxBytes = MAX_ARTIFACT_BYTES) {
  const resolved = realpathSync(path.resolve(artifactPath));
  if (resolved !== path.resolve(artifactPath) || !resolved.startsWith(`${root}${path.sep}`)) throw new Error("untrusted path");
  const info = lstatSync(resolved);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077) !== 0
    || info.size <= 0 || info.size > maxBytes
    || (typeof process.getuid === "function" && info.uid !== process.getuid())) throw new Error("untrusted artifact");
  const bytes = readFileSync(resolved);
  return { path: resolved, sha256: digest(bytes), size: info.size, bytes };
}

function publicArtifact(artifact, role) {
  return Object.freeze({ role, path: artifact.path, sha256: artifact.sha256, size: artifact.size });
}

export function selectLatestIssueStateTimestamp(states) {
  if (!Array.isArray(states) || states.length === 0) return { ok: false, finishedAt: null };
  const normalized = [];
  for (const state of states) {
    const startedAtMs = typeof state?.startedAt === "string" ? Date.parse(state.startedAt) : Number.NaN;
    const finishedAtMs = typeof state?.finishedAt === "string" ? Date.parse(state.finishedAt) : Number.NaN;
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(finishedAtMs) || finishedAtMs < startedAtMs) {
      return { ok: false, finishedAt: null };
    }
    normalized.push({ startedAtMs, finishedAtMs, finishedAt: state.finishedAt });
  }
  normalized.sort((left, right) =>
    Math.max(right.startedAtMs, right.finishedAtMs) - Math.max(left.startedAtMs, left.finishedAtMs));
  const latest = normalized[0];
  const latestActivityAtMs = Math.max(latest.startedAtMs, latest.finishedAtMs);
  const tied = normalized.filter((state) =>
    Math.max(state.startedAtMs, state.finishedAtMs) === latestActivityAtMs);
  if (tied.length !== 1) return { ok: false, finishedAt: null };
  return { ok: true, finishedAt: latest.finishedAt };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
