import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { userInfo } from "node:os";
import { loadLogicalTaskBudget } from "./logical-task-budget.mjs";
import { resumedGitRepositoryAuthorityIsTrusted } from "./preserved-recovery-deployment.mjs";
import { authenticateAssociatedRecoverableState } from "./recovery-state.mjs";
import { loadSessionLifecycleForRecovery } from "./session-lifecycle.mjs";

export function collectSemanticDeploymentEvidenceContext({
  projectAuthority,
  repositoryRoot,
  incidentPath,
  incidentSha256,
  associatedRecoveryPath,
  associatedRecoverySha256,
  command = defaultCommand,
} = {}) {
  if (!projectAuthority || repositoryRoot !== projectAuthority.repoRoot) throw new Error("semantic extraction project authority invalid");
  const association = authenticateAssociatedRecoverableState({
    config: { logsRoot: projectAuthority.logsRoot, repositorySlug: projectAuthority.repositorySlug },
    incidentPath,
    incidentSha256,
    associatedRecoveryPath,
    associatedRecoverySha256,
  });
  if (!association.ok) throw new Error(association.reasonCode);
  const incident = association.incidentState;
  const repository = incident.sessionLifecycle?.repository;
  if (typeof repository !== "string" || repository.toLowerCase() !== projectAuthority.repositorySlug) {
    throw new Error("semantic extraction repository identity contradiction");
  }
  const original = { runner: incident.run.runId, supervisor: incident.run.supervisorRunId };
  const runArtifacts = discoverRunRoleArtifacts(projectAuthority.logsRoot, incident, original);
  const candidate = authenticateRepositoryCandidate({
    repositoryRoot,
    repository,
    branch: incident.branch.name,
    baseSha: incident.branch.baseSha,
    expected: incident.ordinaryContinuation.identity,
    command,
  });
  const lifecycle = loadSessionLifecycleForRecovery({
    logsRoot: projectAuthority.logsRoot,
    repositorySlug: repository,
  }, {
    repository,
    issueNumber: incident.issue.number,
    taskKey: incident.taskKey,
    runId: original.runner,
    supervisorRunId: original.supervisor,
    branchName: incident.branch.name,
    baseSha: incident.branch.baseSha,
    headSha: incident.branch.currentHeadSha,
  }, { allowLegacySupervisorBackfill: false });
  if (!lifecycle.ok) {
    throw new Error(`semantic extraction lifecycle contradiction: ${lifecycle.reasonCode || "unknown"}`);
  }
  const lifecycleArtifact = authenticateArtifact(lifecycle.statePath);
  const budget = loadLogicalTaskBudget({ logsRoot: projectAuthority.logsRoot }, original.supervisor);
  if (!budget.ok) throw new Error("semantic extraction budget unavailable");
  const budgetArtifact = authenticateArtifact(budget.statePath);
  const chargeIds = Object.keys(budget.state.charges || {});
  if (budget.state.acceptedLogicalTaskCount !== 1 || chargeIds.length !== 1
      || chargeIds[0] !== association.binding.chargeId) throw new Error("semantic extraction budget contradiction");
  const intentLineage = authenticateIntentLineageArtifacts({
    logsRoot: projectAuthority.logsRoot,
    repositoryRoot,
    repository,
    incident,
    candidate,
    originalIteration: runArtifacts.original.iteration,
    budgetArtifact,
  });
  const github = readGithubNoEffect({
    repositoryRoot,
    repository,
    issueNumber: incident.issue.number,
    branch: incident.branch.name,
    mainSha: candidate.mainSha,
    incidentUpdatedAt: incident.timestamps.updatedAt,
    command,
  });
  const predecessor = runArtifacts.failed.iteration.value.recovery?.terminalDerivativeProjection;
  const formerRootSha256 = predecessor?.boundArtifacts?.find((artifact) => artifact.role === "rawRecovery")?.sha256;
  if (predecessor?.ok !== true || !digest64(formerRootSha256) || formerRootSha256 === incidentSha256) {
    throw new Error("semantic extraction predecessor evidence unavailable");
  }
  if (incident.ordinaryContinuation?.phase !== "local_validation"
      || lifecycle.state.controller?.phase !== "stopped"
      || lifecycle.state.controller?.nextExactAction !== "checkpoint_validation_recovery_failed_closed"
      || lifecycle.state.recovery?.phaseBefore !== "implementation_or_bundle_slice"
      || lifecycle.state.interruption?.class !== "main_process_exit_without_terminal_report") {
    throw new Error("semantic extraction predecessor lifecycle contradiction");
  }
  const counters = incident.ordinaryContinuation.counters;
  const lifecycleState = lifecycle.state;
  if (lifecycleState.mutationAuthority.status !== "terminal"
      || lifecycleState.recovery.status !== "pending"
      || lifecycleState.recovery.effectsAlreadyPresent.mutation !== false
      || lifecycleState.recovery.effectsAlreadyPresent.commit !== true
      || ["push", "pr", "merge", "comment"].some((key) => lifecycleState.recovery.effectsAlreadyPresent[key] !== false)) {
    throw new Error("semantic extraction lifecycle effect posture invalid");
  }
  if (new Set([original.runner, runArtifacts.failed.runner, runArtifacts.consumed.runner]).size !== 3
      || new Set([original.supervisor, runArtifacts.failed.supervisor, runArtifacts.consumed.supervisor]).size !== 3) {
    throw new Error("semantic extraction run roles not distinct");
  }
  const associatedRecoveryBinding = deepFreeze({
    ...association.binding,
    failedContinuationRunnerRunId: runArtifacts.failed.runner,
    failedContinuationSupervisorRunId: runArtifacts.failed.supervisor,
    consumedRunnerRunId: runArtifacts.consumed.runner,
    consumedSupervisorRunId: runArtifacts.consumed.supervisor,
  });
  const recoveryArtifacts = [authenticateArtifact(incidentPath), authenticateArtifact(associatedRecoveryPath)];
  const runtimeArtifacts = Object.entries(projectAuthority.artifacts).map(([role, artifact]) => {
    let authenticated;
    try { authenticated = authenticateArtifactBytes(artifact.path, { allowReadOnlyPublicMode: true }).artifact; }
    catch { throw new Error(`semantic extraction project artifact authentication failed: ${role}`); }
    if (authenticated.path !== artifact.path || authenticated.sha256 !== artifact.sha256) {
      throw new Error(`semantic extraction project artifact authentication failed: ${role}`);
    }
    return { ...authenticated, identity: `deployment_project_authority:${role}:${authenticated.identity}` };
  });
  return deepFreeze({
    projectAuthority,
    repository,
    incident,
    association: associatedRecoveryBinding,
    candidate,
    lifecycleArtifact,
    lifecycleState,
    budgetArtifact,
    budgetState: budget.state,
    intentLineage,
    associatedState: association.associatedState,
    recoveryArtifacts,
    runArtifacts,
    github,
    formerRootSha256,
    formerEffectivePhase: lifecycle.state.recovery.phaseAfter,
    incidentPath,
    incidentSha256,
    counters,
    domainEvidence: {
      repository_git: candidate.evidence,
      lifecycle: [lifecycleArtifact, ...runArtifacts.allArtifacts],
      logical_task_budget: [budgetArtifact, runArtifacts.consumed.iteration],
      intent_lineage: intentLineage.artifacts,
      projection_deployment: [
        ...candidate.evidence, recoveryArtifacts[0], runArtifacts.failed.iteration, runArtifacts.consumed.iteration,
        ...runtimeArtifacts, ...github.evidence,
      ],
      supervisor_child_run: runArtifacts.allArtifacts,
      incident_report: [...recoveryArtifacts, ...runtimeArtifacts],
      github_no_effect: github.evidence,
    },
  });
}

export function createSemanticDeploymentAuthorityReaders({ readAuthorityContext = null } = {}) {
  if (readAuthorityContext !== null && typeof readAuthorityContext !== "function") {
    throw new Error("semantic deployment authority context reader invalid");
  }
  const read = (context) => readAuthorityContext ? readAuthorityContext() : context;
  return Object.freeze({
    repository_git: (context) => withAuthorityContext(read(context), "repository_git", (owned) => ({
      repository: owned.repository, ...repositoryClaims(owned),
    })),
    lifecycle: (context) => withAuthorityContext(read(context), "lifecycle", (owned) => ({
      ...lifecycleTaskClaims(owned), ...runRoleClaims(owned), ...lifecycleCounterClaims(owned),
      lifecycleLineage: lifecycleLineage(owned),
      lifecycleSessionId: owned.lifecycleState.sessions.current,
      lifecycleMutationGeneration: owned.lifecycleState.mutationAuthority.generation,
      successorEligible: successorEligible(owned),
      earliestSafePhase: owned.lifecycleState.recovery.phaseAfter,
    })),
    logical_task_budget: (context) => withAuthorityContext(read(context), "logical_task_budget", (owned) => ({
      ...budgetTaskClaims(owned), ...budgetCounterClaims(owned),
      submissionCount: owned.budgetState.acceptedLogicalTaskCount,
      submissionExhausted: submissionExhausted(owned),
    })),
    intent_lineage: (context) => withAuthorityContext(read(context), "intent_lineage", intentLineageClaims),
    projection_deployment: (context) => withAuthorityContext(read(context), "projection_deployment", (owned) => ({
      ...repositoryClaims(owned), ...incidentClaims(owned), ...runtimeClaims(owned),
      prEvidenceDigest: owned.github.digest,
      lifecycleLineage: lifecycleLineage(owned),
      lifecycleSessionId: owned.lifecycleState.sessions.current,
      lifecycleMutationGeneration: owned.lifecycleState.mutationAuthority.generation,
      successorEligible: successorEligible(owned),
      earliestSafePhase: owned.lifecycleState.recovery.phaseAfter,
    })),
    supervisor_child_run: (context) => withAuthorityContext(read(context), "supervisor_child_run", (owned) => ({
      ...runRoleClaims(owned), ...supervisorIntentClaims(owned),
      submissionCount: owned.budgetState.acceptedLogicalTaskCount,
      submissionExhausted: submissionExhausted(owned),
    })),
    incident_report: (context) => withAuthorityContext(read(context), "incident_report", (owned) => ({
      ...incidentClaims(owned), ...runtimeClaims(owned), ...incidentNoEffectClaims(owned),
    })),
    github_no_effect: (context) => withAuthorityContext(read(context), "github_no_effect", (owned) => ({
      repository: owned.repository, prEvidenceDigest: owned.github.digest, ...externalNoEffectClaims(owned),
    })),
  });
}

export function reauthenticateSemanticRecoveryGithubNoEffect({ repositoryRoot, manifest, command = defaultCommand } = {}) {
  if (!manifest || typeof manifest !== "object" || !path.isAbsolute(repositoryRoot || "")
      || realpathSync(repositoryRoot) !== repositoryRoot
      || typeof manifest.currentIncident?.path !== "string"
      || !digest64(manifest.currentIncident?.sha256)
      || !digest64(manifest.claims?.prEvidenceDigest)) {
    throw new Error("semantic recovery GitHub fence input invalid");
  }
  const incident = authenticateJson(manifest.currentIncident.path);
  if (incident.sha256 !== manifest.currentIncident.sha256
      || typeof incident.value?.timestamps?.updatedAt !== "string") {
    throw new Error("semantic recovery GitHub fence incident invalid");
  }
  const fresh = readGithubNoEffect({
    repositoryRoot,
    repository: manifest.claims.repository,
    issueNumber: manifest.claims.issueNumber,
    branch: manifest.claims.branch,
    mainSha: null,
    incidentUpdatedAt: incident.value.timestamps.updatedAt,
    command,
  });
  if (fresh.digest !== manifest.claims.prEvidenceDigest
      || Object.values(fresh.claims).some((effect) => effect !== false)) {
    throw new Error("semantic recovery later GitHub effect detected");
  }
  return deepFreeze({ ok: true, digest: fresh.digest, reasonCode: "semantic_recovery_github_no_effect_reauthenticated" });
}

function withAuthorityContext(context, authorityClass, claims) {
  if (!context || typeof context !== "object") throw new Error(`semantic ${authorityClass} context unavailable`);
  return projection(context, authorityClass, claims(context));
}

function projection(context, authorityClass, claims) {
  const evidence = context?.domainEvidence?.[authorityClass];
  if (!Array.isArray(evidence) || evidence.length < 1) throw new Error(`semantic ${authorityClass} evidence missing`);
  const provenanceIdentity = sha256(canonicalJson({
    evidence: evidence.map(({ path: evidencePath, sha256: digest, identity }) => ({ path: evidencePath, sha256: digest, identity })),
  }));
  return {
    authorityClass,
    repository: context.repository,
    provenanceIdentity,
    claims: structuredClone(claims),
  };
}

function lifecycleTaskClaims(context) {
  const task = context.lifecycleState.logicalTask;
  const chargeIds = Object.keys(context.lifecycleState.reservations?.logical_task_charge || {});
  if (!task || task.issueNumber !== context.incident.issue.number
      || task.taskKey !== context.incident.taskKey
      || task.claimIdentity !== `${context.repository}#${task.issueNumber}`
      || task.runId !== context.runArtifacts.original.runner
      || task.supervisorRunId !== context.runArtifacts.original.supervisor
      || chargeIds.length !== 1 || chargeIds[0] !== context.association.chargeId) {
    throw new Error("semantic extraction lifecycle task identity invalid");
  }
  return {
    issueNumber: task.issueNumber,
    taskKey: task.taskKey,
    claimIdentity: task.claimIdentity,
    chargeId: chargeIds[0],
  };
}
function budgetTaskClaims(context) {
  const chargeId = context.association.chargeId;
  const marker = context.budgetState.charges?.[chargeId];
  const identity = marker?.identity;
  const consumedState = context.runArtifacts.consumed.iteration.value.recovery?.state;
  if (!marker || marker.chargeId !== chargeId || marker.identityClass !== "accepted_issue_claim"
      || identity?.repository !== context.repository
      || identity.issueNumber !== consumedState?.issueNumber
      || identity.claimIdentity !== `${context.repository}#${consumedState.issueNumber}`
      || consumedState.taskKey !== context.incident.taskKey) {
    throw new Error("semantic extraction budget task identity invalid");
  }
  return {
    issueNumber: identity.issueNumber,
    taskKey: consumedState.taskKey,
    claimIdentity: identity.claimIdentity,
    chargeId,
  };
}
function repositoryClaims(context) {
  return {
    branch: context.candidate.branch,
    baseSha: context.candidate.baseSha,
    headSha: context.candidate.headSha,
    treeSha: context.candidate.treeSha,
    changedFilesDigest: context.candidate.changedFilesDigest,
    diffDigest: context.candidate.diffDigest,
  };
}
function lifecycleCounterClaims(context) {
  const controller = context.lifecycleState.controller;
  if (!controller || controller.localSourceChangingRoundsPerEpoch !== context.counters.localSourceChangingRoundsPerEpoch
      || controller.githubTriggeredFixEpochsPerPr !== context.counters.githubTriggeredFixEpochsPerPr
      || controller.lifetimeLocalSourceChangingRounds !== context.counters.lifetimeLocalSourceChangingRounds) {
    throw new Error("semantic extraction lifecycle counters invalid");
  }
  return {
    acceptedLogicalTasks: Object.keys(context.lifecycleState.reservations?.logical_task_charge || {}).length,
    localSourceChangingRounds: controller.localSourceChangingRoundsPerEpoch,
    githubTriggeredFixEpochs: controller.githubTriggeredFixEpochsPerPr,
    lifetimeLocalSourceChangingRounds: controller.lifetimeLocalSourceChangingRounds,
  };
}
function budgetCounterClaims(context) {
  const controller = context.runArtifacts.consumed.iteration.value.recovery?.lifecycle?.state?.controller;
  if (!controller || controller.localSourceChangingRoundsPerEpoch !== context.counters.localSourceChangingRoundsPerEpoch
      || controller.githubTriggeredFixEpochsPerPr !== context.counters.githubTriggeredFixEpochsPerPr
      || controller.lifetimeLocalSourceChangingRounds !== context.counters.lifetimeLocalSourceChangingRounds) {
    throw new Error("semantic extraction consumed budget counters invalid");
  }
  return {
    acceptedLogicalTasks: context.budgetState.acceptedLogicalTaskCount,
    localSourceChangingRounds: controller.localSourceChangingRoundsPerEpoch,
    githubTriggeredFixEpochs: controller.githubTriggeredFixEpochsPerPr,
    lifetimeLocalSourceChangingRounds: controller.lifetimeLocalSourceChangingRounds,
  };
}
function runRoleClaims(context) {
  const roles = context.runArtifacts;
  return {
    originalRunnerRunId: roles.original.runner,
    originalSupervisorRunId: roles.original.supervisor,
    failedContinuationRunnerRunId: roles.failed.runner,
    failedContinuationSupervisorRunId: roles.failed.supervisor,
    consumedRunnerRunId: roles.consumed.runner,
    consumedSupervisorRunId: roles.consumed.supervisor,
    originalSpecIdentity: roles.original.spec.sha256,
    originalStateIdentity: roles.original.supervisorState.sha256,
    originalIterationIdentity: roles.original.iteration.sha256,
    originalSummaryIdentity: roles.original.summary.sha256,
    failedContinuationSpecIdentity: roles.failed.spec.sha256,
    failedContinuationStateIdentity: roles.failed.supervisorState.sha256,
    failedContinuationHeartbeatIdentity: roles.failed.heartbeat.sha256,
    failedContinuationSummaryIdentity: roles.failed.summary.sha256,
    consumedSpecIdentity: roles.consumed.spec.sha256,
    consumedStateIdentity: roles.consumed.supervisorState.sha256,
    consumedIterationIdentity: roles.consumed.iteration.sha256,
    consumedSummaryIdentity: roles.consumed.summary.sha256,
  };
}
function incidentClaims(context) {
  return {
    formerRootPath: context.incidentPath,
    formerRootSha256: context.formerRootSha256,
    formerEffectivePhase: context.formerEffectivePhase,
    incidentPath: context.incidentPath,
    incidentSha256: context.incidentSha256,
    predecessorBytesAvailable: false,
  };
}
function runtimeClaims(context) {
  const authority = context.projectAuthority;
  return {
    runtimeSourceSha: authority.runtimeSourceSha,
    installedBundleDigest: authority.runtimeBundleDigest,
    installedManifestDigest: authority.artifacts.runtimeManifest.sha256,
    runtimeProfileDigest: authority.artifacts.approvedProfile.sha256,
    runtimeApprovalDigest: authority.artifacts.runtimeApproval.sha256,
    launcherDigest: authority.artifacts.runtimeLauncher.sha256,
    healthUnitDigest: authority.artifacts.healthUnit.sha256,
  };
}
function lifecycleLineage(context) {
  if (context.runArtifacts.failed.iteration.value.recovery?.terminalDerivativeProjection?.ok !== true
      || context.runArtifacts.consumed.iteration.value?.outcome !== "terminal_lifecycle_reconciled") {
    throw new Error("semantic extraction lifecycle lineage invalid");
  }
  return "terminal_validation_retry_to_distinct_successor";
}
function successorEligible(context) {
  return context.lifecycleState.recovery.status === "pending"
    && context.lifecycleState.recovery.effectsAlreadyPresent.commit === true
    && context.lifecycleState.recovery.effectsAlreadyPresent.mutation === false;
}
function submissionExhausted(context) {
  return context.budgetState.acceptedLogicalTaskCount === 1
    && Object.keys(context.budgetState.charges || {}).length === 1
    && context.runArtifacts.consumed.iteration.value?.outcome === "terminal_lifecycle_reconciled";
}
function intentLineageClaims(context) {
  if (context.intentLineage.proof.commitEffectFinalized !== true
      || context.intentLineage.proof.reportPromptBound !== true
      || context.intentLineage.proof.noLaterSourceEffect !== true) {
    throw new Error("semantic extraction intent lineage invalid");
  }
  return {
    intentPosture: "one_no_effect_overlay_then_consumed_submission",
    validationEffect: false,
    reviewEffect: false,
    sourceEffect: false,
  };
}
function supervisorIntentClaims(context) {
  const roles = context.runArtifacts;
  const failedTarget = roles.failed.spec.value.recoveryOnlyTarget;
  const noEffect = failedTarget?.terminalValidationRetryDerivativeNoPr === true
    && roles.failed.iteration.value.recovery?.terminalDerivativeProjection?.ok === true
    && roles.consumed.iteration.value?.outcome === "terminal_lifecycle_reconciled"
    && [roles.failed.iteration.value, roles.consumed.iteration.value]
      .every((value) => value.pr?.number == null && value.remoteHeadSha == null
        && Object.keys(value.effects || {}).length === 0);
  if (!noEffect) throw new Error("semantic extraction supervisor intent posture invalid");
  return {
    intentPosture: "one_no_effect_overlay_then_consumed_submission",
    validationEffect: false,
    reviewEffect: false,
    sourceEffect: false,
  };
}
function externalNoEffectClaims(context) {
  return structuredClone(context.github.claims);
}

function incidentNoEffectClaims(context) {
  const incident = context.incident;
  const effects = incident.ordinaryContinuation?.effects || {};
  const states = [incident, context.associatedState];
  const markers = states.map((state) => state?.mutationMarkers || {});
  const prFields = ["baseRefName", "headRefName", "headSha", "number", "state", "url"];
  const claims = {
    pushEffect: markers.some((value) => Object.keys(value.push || {}).length !== 0),
    prEffect: markers.some((value) => Object.keys(value.pr_create || {}).length !== 0)
      || states.some((state) => !state?.pr || Object.keys(state.pr).sort().join("\n") !== prFields.join("\n")
        || prFields.some((field) => state.pr[field] !== null)),
    commentEffect: markers.some((value) => Object.keys(value.issue_comment || {}).length !== 0
      || Object.keys(value.parent_comment || {}).length !== 0 || Object.keys(value.pr_comment || {}).length !== 0),
    mergeEffect: markers.some((value) => Object.keys(value.merge || {}).length !== 0),
    issueEffect: markers.some((value) => Object.keys(value.issue_close || {}).length !== 0),
    productEffect: Object.keys(effects).length !== 0 || states.some((state) => state?.generatedWork !== null
      || state?.featureBundle !== null || state?.outageResubmission !== null),
  };
  if (Object.values(claims).some(Boolean)) throw new Error("semantic extraction incident effect posture invalid");
  return claims;
}

function discoverRunRoleArtifacts(logsRoot, incident, original) {
  const stateRoot = path.join(logsRoot, "state");
  const iterations = readdirSync(stateRoot).filter((name) => name.endsWith(".json"))
    .map((name) => authenticateJson(path.join(stateRoot, name)))
    .filter((artifact) => artifact.value?.issue?.number === incident.issue.number);
  const matchesCandidate = (value) => value?.issue?.number === incident.issue.number
    && value.branchName === incident.branch.name
    && value.baseOriginMainSha === incident.branch.baseSha
    && value.runnerCreatedCommitSha === incident.branch.currentHeadSha;
  const matchesRecovery = (value) => value?.taskKey === incident.taskKey
    && value.issueNumber === incident.issue.number
    && value.branchName === incident.branch.name
    && value.baseSha === incident.branch.baseSha
    && value.currentHeadSha === incident.branch.currentHeadSha
    && (value.runnerRunId ?? value.runId) === original.runner
    && value.supervisorRunId === original.supervisor;
  const consumedCandidates = iterations.filter((artifact) => artifact.value?.outcome === "terminal_lifecycle_reconciled"
    && matchesCandidate(artifact.value) && matchesRecovery(artifact.value.recovery?.state));
  const failedCandidates = iterations.filter((artifact) => artifact.value?.recovery?.terminalDerivativeProjection?.ok === true
    && matchesCandidate(artifact.value) && matchesRecovery(artifact.value.recovery?.state)
    && matchesRecovery(artifact.value.recovery?.target));
  const originalCandidates = iterations.filter((artifact) => artifact.value?.runId === original.runner
    && artifact.value?.index === 1 && matchesCandidate(artifact.value));
  if (consumedCandidates.length !== 1 || failedCandidates.length !== 1 || originalCandidates.length !== 1) {
    throw new Error("semantic extraction run role selection ambiguous");
  }
  const role = (iteration, roleName, expectedSupervisor = null) => {
    const runner = iteration.value.runId;
    const summary = authenticateJson(path.join(logsRoot, "summaries", `${runner}.json`));
    const supervisor = summary.value.supervisorRunId;
    if (expectedSupervisor && supervisor !== expectedSupervisor) throw new Error("semantic extraction supervisor role mismatch");
    const supervisorKey = sha256(supervisor);
    const spec = authenticateJson(path.join(logsRoot, "supervisor", "run-specs", supervisorKey, "spec.json"));
    const supervisorState = authenticateJson(path.join(logsRoot, "supervisor", "runs", supervisorKey, "state.json"));
    const heartbeatPath = path.join(logsRoot, "supervisor", "runs", supervisorKey, "heartbeat.json");
    const heartbeat = authenticateJson(heartbeatPath);
    const summaryIterations = summary.value.iterations?.filter((value) => value?.runId === runner
      && value.index === iteration.value.index && value.outcome === iteration.value.outcome && matchesCandidate(value)) || [];
    if (summary.value.runId !== runner || summary.value.supervisorRunId !== supervisor
        || summaryIterations.length !== 1
        || spec.value.runId !== supervisor || supervisorState.value.runId !== supervisor
        || supervisorState.value.runnerRunId !== runner || heartbeat.value.runId !== supervisor
        || heartbeat.value.runnerRunId !== runner) {
      throw new Error("semantic extraction run artifacts contradict");
    }
    if (roleName === "failed") {
      const target = spec.value.recoveryOnlyTarget;
      if (spec.value.sourceIssueNumber !== incident.issue.number || spec.value.sourceBranchName !== incident.branch.name
          || spec.value.parentRunnerRunId !== original.runner || spec.value.parentSupervisorRunId !== original.supervisor
          || !matchesRecovery(target) || target.terminalValidationRetryDerivativeNoPr !== true) {
        throw new Error("semantic extraction failed run lineage invalid");
      }
    }
    return { runner, supervisor, iteration, summary, spec, supervisorState, heartbeat };
  };
  const roles = {
    original: role(originalCandidates[0], "original", original.supervisor),
    failed: role(failedCandidates[0], "failed"),
    consumed: role(consumedCandidates[0], "consumed"),
  };
  return { ...roles, allArtifacts: Object.values(roles).flatMap((entry) => [entry.iteration, entry.summary, entry.spec, entry.supervisorState, entry.heartbeat]) };
}

function authenticateIntentLineageArtifacts({
  logsRoot,
  repositoryRoot,
  repository,
  incident,
  candidate,
  originalIteration,
  budgetArtifact,
}) {
  const iteration = originalIteration.value;
  const taskPrompt = iteration.taskPrompt;
  const expected = incident.expectedReportPaths;
  const reportRoot = path.join(repositoryRoot, ".codex", "reports");
  const promptRoot = path.join(logsRoot, "tasks");
  if (!expected || taskPrompt?.promptPath !== expected.promptPath || taskPrompt?.reportPath !== expected.repoReportPath
      || taskPrompt?.timestampKey !== incident.taskKey
      || iteration.sessionLifecycle?.report?.path !== expected.repoReportPath
      || iteration.sessionLifecycle?.report?.correlationKey !== incident.taskKey
      || path.dirname(expected.repoReportPath) !== reportRoot
      || path.dirname(expected.promptPath) !== promptRoot
      || !path.basename(expected.repoReportPath).startsWith(`settleora-codex-report-${incident.taskKey}-issue-${incident.issue.number}-`)
      || !path.basename(expected.promptPath).startsWith(`${incident.taskKey}-issue-${incident.issue.number}-`)) {
    throw new Error("semantic extraction report or prompt identity invalid");
  }
  const report = authenticateArtifact(expected.repoReportPath);
  const prompt = authenticateArtifact(expected.promptPath);
  const commit = iteration.commit;
  const canonicalEffect = commit?.canonicalEffect;
  if (commit?.skipped !== false || commit.commit !== candidate.headSha
      || canonicalJson([...(commit.files || [])].sort()) !== canonicalJson(candidate.changedFiles)
      || canonicalEffect?.ok !== true || canonicalEffect.action !== "executed"
      || canonicalEffect.classification !== "effect_present_exact_adoptable"
      || canonicalEffect.status !== "finalized" || canonicalEffect.execution?.ok !== true
      || canonicalEffect.execution?.status !== 0 || !/^[0-9a-f-]{36}$/u.test(String(canonicalEffect.intentId || ""))
      || !digest64(canonicalEffect.fingerprint)
      || candidate.commitSubject !== `Auto-runner issue #${incident.issue.number}: initial candidate before source classification`) {
    throw new Error("semantic extraction finalized commit evidence invalid");
  }
  const intentRoot = path.join(logsRoot, "recovery", "pre-effect-intents");
  if (realpathSync(intentRoot) !== intentRoot) throw new Error("semantic extraction intent root noncanonical");
  const matches = readdirSync(intentRoot)
    .filter((name) => /^[a-f0-9]{64}\.json$/u.test(name))
    .map((name) => authenticateJson(path.join(intentRoot, name)))
    .filter((artifact) => artifact.value?.intentId === canonicalEffect.intentId);
  if (matches.length !== 1) throw new Error("semantic extraction commit intent ambiguous");
  const intent = matches[0];
  const value = intent.value;
  const identity = value.identity;
  const effect = value.effect;
  if (value.effectType !== "commit" || value.status !== "finalized" || value.repository.toLowerCase() !== repository.toLowerCase()
      || value.runId !== iteration.runId || value.sourceTaskKey !== incident.taskKey
      || value.claimIdentity !== `${repository}#${incident.issue.number}`
      || value.logicalTaskIdentity !== `${repository}#${incident.issue.number}`
      || value.chargeIdentity !== budgetArtifact.path || value.fingerprint !== canonicalEffect.fingerprint
      || identity?.repository?.toLowerCase() !== repository.toLowerCase() || identity.sourceTaskKey !== incident.taskKey
      || identity.runId !== iteration.runId || identity.branchName !== candidate.branch
      || identity.baseSha !== candidate.baseSha || identity.headSha !== candidate.baseSha
      || identity.claimIdentity !== `${repository}#${incident.issue.number}`
      || effect?.treeSha !== candidate.treeSha || effect.messageDigest !== candidate.commitMessageDigest
      || canonicalJson(effect.expectedParents) !== canonicalJson([candidate.baseSha])
      || canonicalJson([...(effect.stagedPaths || [])].sort()) !== canonicalJson(candidate.changedFiles)) {
    throw new Error("semantic extraction commit intent contradiction");
  }
  const continuation = incident.ordinaryContinuation;
  const finding = continuation?.sourceFailureBatch?.findings?.[0];
  const noLaterSourceEffect = Object.keys(continuation?.effects || {}).length === 0
    && continuation?.sourceFailureHistory?.length === 1
    && continuation?.sourceFailureBatch?.findings?.length === 1
    && finding?.sourceFixEligible === false && finding?.retryable === false
    && finding?.classification === "unsafe_or_ambiguous"
    && (continuation?.processedGithubFindingFingerprints?.length ?? 0) === 0
    && continuation?.preparedGithubSourceFailureBatch === null
    && continuation?.sourceFailureCommitEffect === null;
  if (!noLaterSourceEffect) throw new Error("semantic extraction later source effect detected");
  return {
    artifacts: [intent, report, prompt, originalIteration],
    proof: {
      commitEffectFinalized: true,
      reportPromptBound: true,
      noLaterSourceEffect: true,
      intentId: canonicalEffect.intentId,
      intentSha256: intent.sha256,
      reportSha256: report.sha256,
      promptSha256: prompt.sha256,
    },
  };
}

function authenticateRepositoryCandidate({ repositoryRoot, repository, branch, baseSha, expected, command }) {
  const forbiddenGitEnvironment = ["GIT_REPLACE_REF_BASE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR", "GIT_DIR", "GIT_WORK_TREE", "GIT_SHALLOW_FILE"];
  if (forbiddenGitEnvironment.some((key) => process.env[key])) {
    throw new Error("semantic extraction Git object environment untrusted");
  }
  const authorityEnvironment = {
    PATH: "/usr/bin:/bin", HOME: userInfo().homedir, LANG: "C", LC_ALL: "C", GIT_NO_REPLACE_OBJECTS: "1",
  };
  const gitEnvironment = {
    ...authorityEnvironment, GIT_OPTIONAL_LOCKS: "0",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0",
  };
  if (realpathSync(repositoryRoot) !== repositoryRoot
      || !resumedGitRepositoryAuthorityIsTrusted(repositoryRoot, repository, authorityEnvironment)) {
    throw new Error("semantic extraction repository authority untrusted");
  }
  const safeGitArguments = [
    "--no-replace-objects", "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false",
  ];
  const git = (args, encoding = "utf8") => command("/usr/bin/git", [...safeGitArguments, ...args], {
    cwd: repositoryRoot, encoding, env: gitEnvironment,
  });
  const topLevel = String(git(["rev-parse", "--show-toplevel"])).trim();
  const gitDir = path.resolve(repositoryRoot, String(git(["rev-parse", "--git-dir"])).trim());
  const commonDir = path.resolve(repositoryRoot, String(git(["rev-parse", "--git-common-dir"])).trim());
  const currentBranch = String(git(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  const canonicalHead = String(git(["rev-parse", "HEAD^{commit}"])).trim();
  const localMain = String(git(["rev-parse", "refs/heads/main^{commit}"])).trim();
  const originMain = String(git(["rev-parse", "refs/remotes/origin/main^{commit}"])).trim();
  const shallow = String(git(["rev-parse", "--is-shallow-repository"])).trim();
  const readConfigSnapshot = () => {
    const localConfigDigest = sha256(Buffer.from(git(["config", "--local", "--null", "--list"], null)));
    let worktreeConfigEnabled = false;
    try { worktreeConfigEnabled = String(git(["config", "--local", "--type=bool", "--get", "extensions.worktreeConfig"])).trim() === "true"; }
    catch { worktreeConfigEnabled = false; }
    const worktreeConfigDigest = worktreeConfigEnabled
      ? sha256(Buffer.from(git(["config", "--worktree", "--null", "--list"], null)))
      : null;
    return { localConfigDigest, worktreeConfigDigest, worktreeConfigEnabled };
  };
  const configSnapshot = readConfigSnapshot();
  if (path.resolve(topLevel) !== repositoryRoot || realpathSync(gitDir) !== gitDir || realpathSync(commonDir) !== commonDir
      || shallow !== "false"
      || Buffer.from(git(["status", "--porcelain=v1", "-z"], null)).length !== 0
      || currentBranch !== "main" || canonicalHead !== localMain || localMain !== originMain) {
    throw new Error("semantic extraction repository identity unsafe");
  }
  const objectAuthorityRoots = [...new Set([gitDir, commonDir])];
  const unsafeObjectPaths = objectAuthorityRoots.flatMap((root) => [
    path.join(root, "info", "grafts"),
    path.join(root, "objects", "info", "alternates"),
    path.join(root, "objects", "info", "http-alternates"),
  ]);
  const replaceRefs = String(git(["for-each-ref", "--format=%(refname)", "refs/replace"])).trim();
  if (replaceRefs || unsafeObjectPaths.some(existsSync)) {
    throw new Error("semantic extraction Git object authority untrusted");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/u.test(branch)
      || String(git(["check-ref-format", "--branch", branch])).trim() !== branch) {
    throw new Error("semantic extraction candidate ref invalid");
  }
  const headSha = String(git(["rev-parse", `refs/heads/${branch}^{commit}`])).trim();
  const treeSha = String(git(["rev-parse", `${headSha}^{tree}`])).trim();
  const parentShas = String(git(["show", "-s", "--format=%P", headSha])).trim().split(/\s+/u).filter(Boolean);
  if (parentShas.length !== 1 || parentShas[0] !== baseSha
      || String(git(["rev-list", "--count", `${baseSha}..${headSha}`])).trim() !== "1") {
    throw new Error("semantic extraction candidate topology mismatch");
  }
  git(["merge-base", "--is-ancestor", baseSha, headSha]);
  git(["merge-base", "--is-ancestor", baseSha, localMain]);
  let candidateMerged = true;
  try { git(["merge-base", "--is-ancestor", headSha, localMain]); } catch { candidateMerged = false; }
  if (candidateMerged) throw new Error("semantic extraction candidate already merged");
  for (const object of [baseSha, headSha]) {
    if (String(git(["cat-file", "-t", object])).trim() !== "commit") throw new Error("semantic extraction Git object invalid");
  }
  const changedFiles = Buffer.from(git(["diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", baseSha, headSha], null)).toString("utf8").split("\0").filter(Boolean).sort();
  const diff = Buffer.from(git(["diff", "--no-ext-diff", "--no-textconv", "--binary", baseSha, headSha], null));
  const commitSubject = String(git(["show", "-s", "--format=%s", headSha])).trimEnd();
  const readWorktreeTopology = (candidateHead) => parseWorktreeRecords(
    Buffer.from(git(["worktree", "list", "--porcelain", "-z"], null)).toString("utf8"),
  ).map((worktree) => {
    if (realpathSync(worktree.path) !== worktree.path
        || Buffer.from(command("/usr/bin/git", [...safeGitArguments, "status", "--porcelain=v1", "-z"], {
          cwd: worktree.path, encoding: null, env: gitEnvironment,
        })).length !== 0) {
      throw new Error("semantic extraction linked worktree unsafe");
    }
    if (worktree.branch === `refs/heads/${branch}` && worktree.head !== candidateHead) {
      throw new Error("semantic extraction candidate worktree identity mismatch");
    }
    return { path: worktree.path, head: worktree.head, branch: worktree.branch, bare: worktree.bare, detached: worktree.detached };
  });
  const worktreeTopology = readWorktreeTopology(headSha);
  const initialSnapshot = {
    canonicalHead, commonDir, configSnapshot, currentBranch, gitDir, headSha, localMain, originMain,
    replaceRefs, repositoryRoot, shallow, topLevel: path.resolve(topLevel), treeSha, worktreeTopology,
  };
  const proof = {
    branch, baseSha, headSha, treeSha, mainSha: localMain,
    changedFilesDigest: sha256(JSON.stringify(changedFiles)),
    diffDigest: sha256(diff),
  };
  for (const field of ["headSha", "treeSha", "changedFilesDigest", "diffDigest"]) {
    if (proof[field] !== expected[field]) throw new Error(`semantic extraction Git ${field} mismatch`);
  }
  const finalHeadSha = String(git(["rev-parse", `refs/heads/${branch}^{commit}`])).trim();
  const finalTopLevel = path.resolve(String(git(["rev-parse", "--show-toplevel"])).trim());
  const finalGitDir = path.resolve(repositoryRoot, String(git(["rev-parse", "--git-dir"])).trim());
  const finalCommonDir = path.resolve(repositoryRoot, String(git(["rev-parse", "--git-common-dir"])).trim());
  const finalSnapshot = {
    canonicalHead: String(git(["rev-parse", "HEAD^{commit}"])).trim(),
    commonDir: finalCommonDir,
    configSnapshot: readConfigSnapshot(),
    currentBranch: String(git(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim(),
    gitDir: finalGitDir,
    headSha: finalHeadSha,
    localMain: String(git(["rev-parse", "refs/heads/main^{commit}"])).trim(),
    originMain: String(git(["rev-parse", "refs/remotes/origin/main^{commit}"])).trim(),
    replaceRefs: String(git(["for-each-ref", "--format=%(refname)", "refs/replace"])).trim(),
    repositoryRoot,
    shallow: String(git(["rev-parse", "--is-shallow-repository"])).trim(),
    topLevel: finalTopLevel,
    treeSha: String(git(["rev-parse", `${finalHeadSha}^{tree}`])).trim(),
    worktreeTopology: readWorktreeTopology(finalHeadSha),
  };
  if (canonicalJson(finalSnapshot) !== canonicalJson(initialSnapshot)
      || Buffer.from(git(["status", "--porcelain=v1", "-z"], null)).length !== 0
      || realpathSync(finalTopLevel) !== repositoryRoot || realpathSync(finalGitDir) !== finalGitDir
      || realpathSync(finalCommonDir) !== finalCommonDir || unsafeObjectPaths.some(existsSync)
      || !resumedGitRepositoryAuthorityIsTrusted(repositoryRoot, repository, authorityEnvironment)) {
    throw new Error("semantic extraction Git authority changed during read");
  }
  return {
    ...proof, changedFiles, commitSubject, commitMessageDigest: sha256(commitSubject),
    evidence: [{
      path: gitDir,
      sha256: sha256(canonicalJson({ ...proof, canonicalHead, commonDir, currentBranch, gitDir, repositoryRoot, worktreeTopology })),
      identity: `source_owned_git_read:${commonDir}:${gitDir}`,
    }],
  };
}

function readGithubNoEffect({ repositoryRoot, repository, issueNumber, branch, mainSha, incidentUpdatedAt, command }) {
  const incidentCheckpointMs = typeof incidentUpdatedAt === "string" ? Date.parse(incidentUpdatedAt) : Number.NaN;
  if (!Number.isFinite(incidentCheckpointMs)) throw new Error("semantic extraction GitHub incident checkpoint invalid");
  const githubEnvironment = {
    PATH: "/usr/bin:/bin", HOME: userInfo().homedir, LANG: "C", LC_ALL: "C",
    GH_PROMPT_DISABLED: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  };
  const gh = (args) => command("/usr/bin/gh", args, { cwd: repositoryRoot, encoding: "utf8", env: githubEnvironment });
  const repositoryRecord = JSON.parse(String(gh(["api", `repos/${repository}`])) || "{}");
  const mainRef = JSON.parse(String(gh(["api", `repos/${repository}/git/ref/heads/main`])) || "{}");
  const remoteRefs = JSON.parse(String(gh(["api", `repos/${repository}/git/matching-refs/heads/${encodeURIComponent(branch)}`])) || "[]");
  const prs = JSON.parse(String(gh(["pr", "list", "--repo", repository, "--state", "all", "--head", branch, "--json", "number,state,headRefOid,mergedAt,updatedAt"])) || "[]");
  const issue = JSON.parse(String(gh(["issue", "view", String(issueNumber), "--repo", repository, "--json", "number,state,updatedAt,comments"])) || "{}");
  const observedMainSha = mainRef.object?.sha;
  if (!Array.isArray(remoteRefs) || remoteRefs.length !== 0 || prs.length !== 0 || issue.number !== issueNumber || issue.state !== "OPEN"
      || repositoryRecord.full_name?.toLowerCase() !== repository.toLowerCase() || repositoryRecord.default_branch !== "main"
      || mainRef.ref !== "refs/heads/main" || mainRef.object?.type !== "commit" || !/^[a-f0-9]{40}$/u.test(String(observedMainSha || ""))
      || (mainSha !== null && observedMainSha !== mainSha)
      || !Array.isArray(issue.comments) || !Number.isFinite(Date.parse(issue.updatedAt))
      || Date.parse(issue.updatedAt) > incidentCheckpointMs) throw new Error("semantic extraction later GitHub effect detected");
  const comments = issue.comments.map((comment) => ({
    id: String(comment.id || ""),
    author: String(comment.author?.login || ""),
    createdAt: String(comment.createdAt || ""),
    updatedAt: comment.updatedAt == null ? null : String(comment.updatedAt || ""),
    bodySha256: sha256(String(comment.body || "")),
  })).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(comments.map(({ id }) => id)).size !== comments.length
      || comments.some((comment) => !comment.id || !comment.author || !Number.isFinite(Date.parse(comment.createdAt))
        || Date.parse(comment.createdAt) > incidentCheckpointMs
        || (comment.updatedAt !== null && (!Number.isFinite(Date.parse(comment.updatedAt))
          || Date.parse(comment.updatedAt) > incidentCheckpointMs)))) {
    throw new Error("semantic extraction GitHub comment checkpoint invalid");
  }
  const proof = {
    repository: { fullName: repositoryRecord.full_name, defaultBranch: repositoryRecord.default_branch, mainSha: observedMainSha },
    remoteHead: null,
    prs: [],
    issue: {
      number: issue.number, state: issue.state, updatedAt: issue.updatedAt,
      commentCount: comments.length, commentManifestDigest: sha256(canonicalJson(comments)),
    },
  };
  const digest = sha256(canonicalJson(proof));
  return {
    digest,
    claims: {
      pushEffect: remoteRefs.length !== 0,
      prEffect: prs.length !== 0,
      commentEffect: false,
      mergeEffect: prs.some((pr) => pr.mergedAt !== null),
      issueEffect: issue.state !== "OPEN",
      productEffect: false,
    },
    evidence: [{ path: `github://${repository}/issues/${issueNumber}`, sha256: digest, identity: "authenticated_gh_cli_read" }],
  };
}

function parseWorktreeRecords(output) {
  const fields = output.split("\0");
  const records = [];
  let current = null;
  for (const field of fields) {
    if (!field) continue;
    const separator = field.indexOf(" ");
    const key = separator === -1 ? field : field.slice(0, separator);
    const value = separator === -1 ? true : field.slice(separator + 1);
    if (key === "worktree") {
      if (current) records.push(current);
      current = { path: path.resolve(value), head: null, branch: null, bare: false, detached: false };
    } else if (current && key === "HEAD") current.head = value;
    else if (current && key === "branch") current.branch = value;
    else if (current && key === "bare") current.bare = true;
    else if (current && key === "detached") current.detached = true;
  }
  if (current) records.push(current);
  if (records.length < 1 || records.some((record) => !record.head || !/^[a-f0-9]{40}$/u.test(record.head))) {
    throw new Error("semantic extraction worktree topology invalid");
  }
  return records;
}

function authenticateArtifact(file) {
  return authenticateArtifactBytes(file).artifact;
}

function authenticateArtifactBytes(file, { allowReadOnlyPublicMode = false } = {}) {
  const lexical = path.resolve(file);
  if (realpathSync(lexical) !== lexical) throw new Error("semantic extraction artifact noncanonical");
  const before = lstatSync(lexical);
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  const unsafeMode = allowReadOnlyPublicMode ? (before.mode & 0o022) !== 0 : (before.mode & 0o077) !== 0;
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > 1024 * 1024
      || unsafeMode || (uid !== null && before.uid !== uid)) throw new Error("semantic extraction artifact unsafe");
  let descriptor;
  try {
    descriptor = openSync(lexical, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const opened = fstatSync(descriptor);
    if (!sameFileIdentity(before, opened)) throw new Error("semantic extraction artifact changed before read");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const finalPath = lstatSync(lexical);
    if (!sameFileIdentity(opened, after) || !sameFileIdentity(opened, finalPath) || bytes.length !== opened.size) {
      throw new Error("semantic extraction artifact changed during read");
    }
    return {
      artifact: { path: lexical, sha256: sha256(bytes), identity: `${opened.dev}:${opened.ino}:${opened.size}` },
      bytes,
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
function authenticateJson(file) {
  const { artifact, bytes } = authenticateArtifactBytes(file);
  return { ...artifact, value: JSON.parse(bytes.toString("utf8")) };
}
function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.mode === right.mode
    && left.uid === right.uid && left.gid === right.gid && left.nlink === right.nlink;
}
function defaultCommand(executable, args, options) { return execFileSync(executable, args, { ...options, maxBuffer: 4 * 1024 * 1024, timeout: 30_000 }); }
function digest64(value) { return /^[a-f0-9]{64}$/u.test(String(value || "")); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
