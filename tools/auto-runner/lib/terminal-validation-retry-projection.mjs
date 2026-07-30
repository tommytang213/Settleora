import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { supervisorModeToRunnerMode } from "./run-correlation.mjs";

const MAX_ARTIFACT_BYTES = 1024 * 1024;
const TERMINAL_REASON_CODE = "checkpoint_validation_recovery_failed_closed";
const TERMINAL_DETAIL = "initial_validation_failure_commit_reconstruction_ambiguous";

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
      .filter((artifact) => /^run-.+-\d+-issue-\d+\.json$/.test(path.basename(artifact.path)));
    const directlyAssociatedStates = allStates
      .filter((artifact) => stateMayBelongToTarget(artifact.value, target));
    const latestDirectState = selectLatestIssueStateTimestamp(
      directlyAssociatedStates.map(({ value }) => value),
    );
    if (!latestDirectState.ok) return denied("terminal_projection_state_missing_ambiguous_or_superseded");
    const successorRunAnchors = directlyAssociatedStates
      .filter(({ value }) => value.finishedAt === latestDirectState.finishedAt)
      .map((artifact) => artifact.value);
    const issueStates = allStates.filter(({ value }) =>
      stateMayBelongToTargetOrSuccessorRun(
        value,
        target,
        successorRunAnchors,
      ));
    const latestState = selectLatestIssueStateTimestamp(issueStates.map(({ value }) => value));
    if (!latestState.ok) return denied("terminal_projection_state_missing_ambiguous_or_superseded");
    const latestFinishedAt = latestState.finishedAt;
    const terminalStates = issueStates.filter(({ value }) =>
      value.finishedAt === latestFinishedAt && exactTerminalIteration(value, target));
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

    const specRoot = path.join(root, "supervisor", "run-specs");
    const specs = trustedNestedJsonFiles(specRoot, "spec.json")
      .filter(({ value }) => value?.runId === summaryArtifact.value.supervisorRunId);
    if (specs.length !== 1 || !exactSuccessorSpec(specs[0].value, summaryArtifact.value)) {
      return denied("terminal_projection_successor_spec_missing_or_mismatch");
    }
    const specArtifact = specs[0];

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
      publicArtifact(specArtifact, "supervisorSpec"),
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
    && Array.isArray(failureBatch?.findings) && failureBatch.findings.length > 0
    && failureBatch.findings.every((finding) => finding?.repository === target.repository)
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

export function stateMayBelongToTargetOrSuccessorRun(state, target, directlyAssociatedStates = []) {
  if (stateMayBelongToTarget(state, target)) return true;
  return directlyAssociatedStates.some((associated) =>
    (typeof state?.runId === "string" && state.runId.length > 0 && state.runId === associated?.runId)
    || (typeof state?.supervisorRunId === "string" && state.supervisorRunId.length > 0
      && state.supervisorRunId === associated?.supervisorRunId));
}

function exactLifecycle(state, target) {
  const effects = state?.recovery?.effectsAlreadyPresent;
  return state?.repository === target.repository
    && state?.logicalTask?.issueNumber === target.issueNumber
    && state?.logicalTask?.taskKey === target.taskKey
    && state?.logicalTask?.runId === target.runnerRunId
    && state?.logicalTask?.supervisorRunId === target.supervisorRunId
    && state?.logicalTask?.claimIdentity === target.claimIdentity
    && state?.branch?.name === target.branch && state?.branch?.baseSha === target.baseSha
    && state?.branch?.headSha === target.headSha && state?.branch?.prNumber === null
    && state?.controller?.phase === "stopped"
    && state?.controller?.nextExactAction === TERMINAL_REASON_CODE
    && state?.report?.status === "stopped"
    && state?.mutationAuthority?.status === "terminal"
    && state?.mutationAuthority?.ownerSessionId === null
    && state?.mutationAuthority?.handoff === null
    && state?.recovery?.status === "pending"
    && state?.recovery?.attempts === 1
    && typeof state?.recovery?.operationId === "string" && state.recovery.operationId.length > 0
    && state?.recovery?.phaseAfter === "checkpoint_validation_commit"
    && effects?.mutation === false && effects?.commit === true && effects?.push === false
    && effects?.pr === false && effects?.merge === false && effects?.comment === false;
}

function exactTerminalIteration(value, target) {
  const terminal = value?.recovery?.states;
  const budget = value?.logicalTaskBudget;
  return value?.index === 1
    && value?.outcome === "blocked_recovery_state"
    && value?.issue?.number === target.issueNumber
    && value?.issueSource === "startup_recovery"
    && value?.branchName === target.branch
    && value?.baseOriginMainSha === target.baseSha
    && value?.runnerCreatedCommitSha === target.headSha
    && value?.pr === null && value?.changedFiles?.length === 0
    && value?.validation === null && value?.review === null && value?.externalReview === null
    && budget?.ok === true && budget?.duplicate === true && budget?.charged === false
    && budget?.chargeId === target.chargeId && budget?.acceptedLogicalTaskCount === 1
    && budget?.marker?.identity?.repository === target.repository
    && budget?.marker?.identity?.issueNumber === target.issueNumber
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

function exactTerminalSummary(summary, iteration, target) {
  return summary?.iterations?.length === 1
    && canonical(summary.iterations[0]) === canonical(iteration)
    && summary?.runId === iteration.runId
    && typeof summary?.supervisorRunId === "string"
    && summary?.attemptedIssueCount === 0 && summary?.attemptedIssueNumbers?.length === 0
    && summary?.processedIssueCount === 1 && canonical(summary?.processedIssueNumbers) === canonical([target.issueNumber])
    && summary?.acceptedLogicalTaskCount === 1 && summary?.maxIterations === 1
    && Date.parse(summary?.startedAt) <= Date.parse(iteration?.startedAt)
    && Date.parse(summary?.finishedAt) >= Date.parse(iteration?.finishedAt);
}

export function exactSuccessorSpec(spec, summary) {
  return spec?.specVersion === 1 && spec?.runId === summary.supervisorRunId
    && spec?.mode === "trusted" && spec?.maxTasks === 1
    && supervisorModeToRunnerMode(spec.mode) === summary?.mode
    && spec?.initialOriginMainSha === summary?.baseOriginMainSha
    && spec?.requestedBy === "operator" && spec?.sourceBranchName === null
    && spec?.sourceIssueNumber === null && spec?.parentRunnerRunId === null
    && spec?.parentSupervisorRunId === null && spec?.recoveryOnlyTarget === null
    && Date.parse(spec?.createdAt) <= Date.parse(summary?.startedAt);
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
  const resolved = realpathSync(path.resolve(artifactPath));
  if (resolved !== path.resolve(artifactPath) || !resolved.startsWith(`${root}${path.sep}`)) throw new Error("untrusted path");
  const info = lstatSync(resolved);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077) !== 0
    || info.size <= 0 || info.size > MAX_ARTIFACT_BYTES
    || (typeof process.getuid === "function" && info.uid !== process.getuid())) throw new Error("untrusted artifact");
  const bytes = readFileSync(resolved);
  return { path: resolved, sha256: digest(bytes), size: info.size, value: JSON.parse(bytes.toString("utf8")) };
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
