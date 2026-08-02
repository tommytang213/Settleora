import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { loadLogicalTaskBudget } from "./logical-task-budget.mjs";
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
  const github = readGithubNoEffect({
    repositoryRoot,
    repository,
    issueNumber: incident.issue.number,
    branch: incident.branch.name,
    incidentUpdatedAt: incident.timestamps.updatedAt,
    command,
  });
  const predecessor = runArtifacts.failed.iteration.value.recovery?.terminalDerivativeProjection;
  const formerRootSha256 = predecessor?.boundArtifacts?.find((artifact) => artifact.role === "rawRecovery")?.sha256;
  if (predecessor?.ok !== true || !digest64(formerRootSha256) || formerRootSha256 === incidentSha256) {
    throw new Error("semantic extraction predecessor evidence unavailable");
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
  const recoveryArtifacts = [authenticateArtifact(incidentPath), authenticateArtifact(associatedRecoveryPath)];
  const runtimeArtifacts = Object.entries(projectAuthority.artifacts).map(([role, artifact]) => ({
    path: artifact.path,
    sha256: artifact.sha256,
    identity: `deployment_project_authority:${role}`,
  }));
  return deepFreeze({
    projectAuthority,
    repository,
    incident,
    association: association.binding,
    candidate,
    lifecycleState,
    budgetState: budget.state,
    runArtifacts,
    github,
    formerRootSha256,
    incidentPath,
    incidentSha256,
    counters,
    domainEvidence: {
      repository_git: candidate.evidence,
      lifecycle: [lifecycleArtifact, budgetArtifact, recoveryArtifacts[0], ...runArtifacts.allArtifacts],
      logical_task_budget: [budgetArtifact, recoveryArtifacts[0], runArtifacts.consumed.iteration],
      intent_lineage: [lifecycleArtifact, runArtifacts.failed.iteration],
      projection_deployment: [
        ...candidate.evidence, recoveryArtifacts[0], runArtifacts.failed.iteration, runArtifacts.consumed.iteration,
        ...runtimeArtifacts, ...github.evidence,
      ],
      supervisor_child_run: [lifecycleArtifact, ...runArtifacts.allArtifacts],
      incident_report: [...recoveryArtifacts, ...runtimeArtifacts],
      github_no_effect: github.evidence,
    },
  });
}

export function createSemanticDeploymentAuthorityReaders() {
  return Object.freeze({
    repository_git: (context) => projection(context, "repository_git", {
      repository: context.repository, ...repositoryClaims(context),
    }),
    lifecycle: (context) => projection(context, "lifecycle", {
      ...taskClaims(context), ...runRoleClaims(context), ...counterClaims(context),
      lifecycleLineage: "terminal_validation_retry_to_distinct_successor",
      lifecycleSessionId: context.lifecycleState.sessions.current,
      lifecycleMutationGeneration: context.lifecycleState.mutationAuthority.generation,
      successorEligible: true,
      earliestSafePhase: "checkpoint_validation_commit",
    }),
    logical_task_budget: (context) => projection(context, "logical_task_budget", {
      ...taskClaims(context), ...counterClaims(context), submissionCount: 1, submissionExhausted: true,
    }),
    intent_lineage: (context) => projection(context, "intent_lineage", intentClaims()),
    projection_deployment: (context) => projection(context, "projection_deployment", {
      ...repositoryClaims(context), ...incidentClaims(context), ...runtimeClaims(context),
      prEvidenceDigest: context.github.digest,
      lifecycleLineage: "terminal_validation_retry_to_distinct_successor",
      lifecycleSessionId: context.lifecycleState.sessions.current,
      lifecycleMutationGeneration: context.lifecycleState.mutationAuthority.generation,
      successorEligible: true,
      earliestSafePhase: "checkpoint_validation_commit",
    }),
    supervisor_child_run: (context) => projection(context, "supervisor_child_run", {
      ...runRoleClaims(context), ...intentClaims(), submissionCount: 1, submissionExhausted: true,
    }),
    incident_report: (context) => projection(context, "incident_report", {
      ...incidentClaims(context), ...runtimeClaims(context), ...externalNoEffectClaims(),
    }),
    github_no_effect: (context) => projection(context, "github_no_effect", {
      repository: context.repository, prEvidenceDigest: context.github.digest, ...externalNoEffectClaims(),
    }),
  });
}

function projection(context, authorityClass, claims) {
  const evidence = context?.domainEvidence?.[authorityClass];
  if (!Array.isArray(evidence) || evidence.length < 1) throw new Error(`semantic ${authorityClass} evidence missing`);
  const provenanceIdentity = sha256(canonicalJson({
    authorityClass,
    evidence: evidence.map(({ path: evidencePath, sha256: digest, identity }) => ({ path: evidencePath, sha256: digest, identity })),
  }));
  return {
    authorityClass,
    repository: context.repository,
    provenanceIdentity,
    claims: structuredClone(claims),
  };
}

function taskClaims(context) {
  return {
    issueNumber: context.incident.issue.number,
    taskKey: context.incident.taskKey,
    claimIdentity: `${context.repository}#${context.incident.issue.number}`,
    chargeId: context.association.chargeId,
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
function counterClaims(context) {
  return {
    acceptedLogicalTasks: context.budgetState.acceptedLogicalTaskCount,
    localSourceChangingRounds: context.counters.localSourceChangingRoundsPerEpoch,
    githubTriggeredFixEpochs: context.counters.githubTriggeredFixEpochsPerPr,
    lifetimeLocalSourceChangingRounds: context.counters.lifetimeLocalSourceChangingRounds,
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
    formerEffectivePhase: "checkpoint_validation_commit",
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
function intentClaims() {
  return { intentPosture: "one_no_effect_overlay_then_consumed_submission", validationEffect: false, reviewEffect: false, sourceEffect: false };
}
function externalNoEffectClaims() {
  return { pushEffect: false, prEffect: false, commentEffect: false, mergeEffect: false, issueEffect: false, productEffect: false };
}

function discoverRunRoleArtifacts(logsRoot, incident, original) {
  const stateRoot = path.join(logsRoot, "state");
  const iterations = readdirSync(stateRoot).filter((name) => name.endsWith(".json"))
    .map((name) => authenticateJson(path.join(stateRoot, name)))
    .filter((artifact) => artifact.value?.issue?.number === incident.issue.number);
  const consumedCandidates = iterations.filter((artifact) => artifact.value?.outcome === "terminal_lifecycle_reconciled"
    && artifact.value?.branchName === incident.branch.name);
  const failedCandidates = iterations.filter((artifact) => artifact.value?.recovery?.terminalDerivativeProjection?.ok === true);
  const originalCandidates = iterations.filter((artifact) => artifact.value?.runId === original.runner && artifact.value?.index === 1);
  if (consumedCandidates.length !== 1 || failedCandidates.length !== 1 || originalCandidates.length !== 1) {
    throw new Error("semantic extraction run role selection ambiguous");
  }
  const role = (iteration, expectedSupervisor = null) => {
    const runner = iteration.value.runId;
    const summary = authenticateJson(path.join(logsRoot, "summaries", `${runner}.json`));
    const supervisor = summary.value.supervisorRunId;
    if (expectedSupervisor && supervisor !== expectedSupervisor) throw new Error("semantic extraction supervisor role mismatch");
    const supervisorKey = sha256(supervisor);
    const spec = authenticateJson(path.join(logsRoot, "supervisor", "run-specs", supervisorKey, "spec.json"));
    const supervisorState = authenticateJson(path.join(logsRoot, "supervisor", "runs", supervisorKey, "state.json"));
    const heartbeatPath = path.join(logsRoot, "supervisor", "runs", supervisorKey, "heartbeat.json");
    const heartbeat = authenticateJson(heartbeatPath);
    if (spec.value.runId !== supervisor || supervisorState.value.runId !== supervisor
        || supervisorState.value.runnerRunId !== runner || heartbeat.value.runnerRunId !== runner) {
      throw new Error("semantic extraction run artifacts contradict");
    }
    return { runner, supervisor, iteration, summary, spec, supervisorState, heartbeat };
  };
  const roles = {
    original: role(originalCandidates[0], original.supervisor),
    failed: role(failedCandidates[0]),
    consumed: role(consumedCandidates[0]),
  };
  return { ...roles, allArtifacts: Object.values(roles).flatMap((entry) => [entry.iteration, entry.summary, entry.spec, entry.supervisorState, entry.heartbeat]) };
}

function authenticateRepositoryCandidate({ repositoryRoot, repository, branch, baseSha, expected, command }) {
  const git = (args, encoding = "utf8") => command("git", ["--no-replace-objects", "-c", "core.hooksPath=/dev/null", ...args], { cwd: repositoryRoot, encoding });
  const remote = String(git(["remote", "get-url", "origin"])).trim().replace(/\.git$/u, "");
  if (!remote.toLowerCase().endsWith(`github.com/${repository}`.toLowerCase())) throw new Error("semantic extraction repository remote mismatch");
  const headSha = String(git(["rev-parse", `refs/heads/${branch}^{commit}`])).trim();
  const treeSha = String(git(["rev-parse", `${headSha}^{tree}`])).trim();
  const changedFiles = Buffer.from(git(["diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", baseSha, headSha], null)).toString("utf8").split("\0").filter(Boolean).sort();
  const diff = Buffer.from(git(["diff", "--no-ext-diff", "--no-textconv", "--binary", baseSha, headSha], null));
  const proof = {
    branch, baseSha, headSha, treeSha,
    changedFilesDigest: sha256(JSON.stringify(changedFiles)),
    diffDigest: sha256(diff),
  };
  for (const field of ["headSha", "treeSha", "changedFilesDigest", "diffDigest"]) {
    if (proof[field] !== expected[field]) throw new Error(`semantic extraction Git ${field} mismatch`);
  }
  return { ...proof, evidence: [{ path: path.join(repositoryRoot, ".git"), sha256: sha256(canonicalJson(proof)), identity: "source_owned_git_read" }] };
}

function readGithubNoEffect({ repositoryRoot, repository, issueNumber, branch, incidentUpdatedAt, command }) {
  const remote = String(command("git", ["ls-remote", "--heads", "origin", branch], { cwd: repositoryRoot, encoding: "utf8" })).trim();
  const prs = JSON.parse(String(command("gh", ["pr", "list", "--repo", repository, "--state", "all", "--head", branch, "--json", "number,state,headRefOid,mergedAt,updatedAt"], { cwd: repositoryRoot, encoding: "utf8" })) || "[]");
  const issue = JSON.parse(String(command("gh", ["issue", "view", String(issueNumber), "--repo", repository, "--json", "number,state,updatedAt,comments"], { cwd: repositoryRoot, encoding: "utf8" })) || "{}");
  if (remote || prs.length !== 0 || issue.number !== issueNumber || issue.state !== "OPEN"
      || Date.parse(issue.updatedAt) > Date.parse(incidentUpdatedAt)) throw new Error("semantic extraction later GitHub effect detected");
  const proof = { remoteHead: null, prs: [], issue: { number: issue.number, state: issue.state, updatedAt: issue.updatedAt, commentCount: issue.comments.length } };
  const digest = sha256(canonicalJson(proof));
  return { digest, evidence: [{ path: `github://${repository}/issues/${issueNumber}`, sha256: digest, identity: "authenticated_gh_cli_read" }] };
}

function authenticateArtifact(file) {
  return authenticateArtifactBytes(file).artifact;
}

function authenticateArtifactBytes(file) {
  const lexical = path.resolve(file);
  if (realpathSync(lexical) !== lexical) throw new Error("semantic extraction artifact noncanonical");
  const before = lstatSync(lexical);
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > 1024 * 1024
      || (before.mode & 0o077) !== 0 || (uid !== null && before.uid !== uid)) throw new Error("semantic extraction artifact unsafe");
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
