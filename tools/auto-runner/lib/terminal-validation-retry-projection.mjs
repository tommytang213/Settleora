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

const MAX_ARTIFACT_BYTES = 1024 * 1024;
const TERMINAL_REASON_CODE = "checkpoint_validation_recovery_failed_closed";
const TERMINAL_DETAIL = "initial_validation_failure_commit_reconstruction_ambiguous";
const SUCCESSOR_SYSTEMIC_STOP = "recoverable-work-blocked:historical_candidate_task_workspace_untrusted";
const SUCCESSOR_RUNNER_CONFIG_PATH = "/workspace/auto-runner/config/settleora.json";
const SUCCESSOR_RUNNER_CONFIG_SHA256 = "644f69637cb69911f85bed367cfda13b2db889a36e11844226a5c188977dea1d";
const SUCCESSOR_MAX_RUNTIME_MS = 14 * 24 * 60 * 60 * 1000;
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
    const successorRunAnchors = directlyAssociatedStates
      .filter(({ value }) => value.finishedAt === latestDirectState.finishedAt)
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
    const latestState = selectLatestIssueStateTimestamp(issueStates.map(({ value }) => value));
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

    const effectiveRecovery = structuredClone(rawRecovery);
    effectiveRecovery.phase = "stopped";
    effectiveRecovery.stopReason = {
      reasonCode: TERMINAL_REASON_CODE,
      reason: TERMINAL_DETAIL,
    };
    effectiveRecovery.firstIncompleteAction = "run_validation_and_commit";
    effectiveRecovery.nextSafeAction = "stop_fail_closed";

    const boundArtifacts = Object.freeze([
      publicArtifact(recoveryArtifact, "rawRecovery"),
      publicArtifact(lifecycleArtifact, "lifecycle"),
      publicArtifact(stateArtifact, "iterationState"),
      publicArtifact(summaryArtifact, "runnerSummary"),
      publicArtifact(summaryMarkdownArtifact, "runnerSummaryMarkdown"),
      publicArtifact(specArtifact, "supervisorSpec"),
      publicArtifact(supervisorStateArtifact, "supervisorState"),
    ]);
    const evidenceDigest = digest(canonical({
      artifacts: boundArtifacts.map(({ role, sha256 }) => ({ role, sha256 })),
      identity: {
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
      },
    }));
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
    && state?.pr?.number === null && state?.pr?.url === null && state?.pr?.headSha === null
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
  const matching = artifacts.filter((artifact) =>
    successorRunIds.has(iterationStateFilenameIdentity(artifact)?.runId)
    || successorRunIds.has(artifact?.value?.runId));
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
    && handoff?.checkpointDigest === state?.checkpoint?.digest
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

export function exactTerminalIteration(value, target) {
  const terminal = value?.recovery?.states;
  const budget = value?.logicalTaskBudget;
  return canonical(Object.keys(value || {}).sort()) === canonical(EXACT_TERMINAL_ITERATION_FIELDS)
    && target?.durableBudgetExact === true
    && target?.acceptedLogicalTasks === 1
    && value?.index === 1
    && value?.outcome === "blocked_recovery_state"
    && value?.issue?.number === target.issueNumber
    && value?.issueSource === "startup_recovery"
    && value?.phase === "startup_recovery"
    && value?.laneDecision === null
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
    && budget?.marker?.chargeId === target.chargeId
    && budget?.marker?.identity?.repository === target.repository
    && budget?.marker?.identity?.issueNumber === target.issueNumber
    && budget?.marker?.identity?.taskLineageId === `issue-${target.issueNumber}`
    && budget?.marker?.identity?.claimIdentity === target.claimIdentity
    && Array.isArray(terminal) && terminal.length === 1
    && exactTerminalProjection(terminal[0], target);
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
    && Date.parse(summary?.startedAt) <= Date.parse(iteration?.startedAt)
    && Date.parse(summary?.finishedAt) >= Date.parse(iteration?.finishedAt);
}

export function exactSuccessorSupervisorState(state, iteration, summary, specArtifact, logsRoot) {
  const summaryJsonPath = path.join(logsRoot, "summaries", `${iteration?.runId}.json`);
  const summaryMarkdownPath = path.join(logsRoot, "summaries", `${iteration?.runId}.md`);
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
    && Date.parse(state?.startedAt) <= Date.parse(iteration?.startedAt)
    && Date.parse(state?.finishedAt) >= Date.parse(iteration?.finishedAt)
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

function trustedNestedJsonFiles(root, basename) {
  return readdirSync(root).map((name) => path.join(root, name, basename))
    .map((artifactPath) => trustedJsonArtifact(root, artifactPath));
}

function trustedJsonArtifact(root, artifactPath) {
  const artifact = trustedFileArtifact(root, artifactPath);
  return { ...artifact, value: JSON.parse(artifact.bytes.toString("utf8")) };
}

function trustedFileArtifact(root, artifactPath) {
  const resolved = realpathSync(path.resolve(artifactPath));
  if (resolved !== path.resolve(artifactPath) || !resolved.startsWith(`${root}${path.sep}`)) throw new Error("untrusted path");
  const info = lstatSync(resolved);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077) !== 0
    || info.size <= 0 || info.size > MAX_ARTIFACT_BYTES
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
