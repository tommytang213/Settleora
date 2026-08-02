import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectSemanticIncidentForDeployment } from "../lib/deployment-semantic-evidence.mjs";
import {
  collectSemanticDeploymentEvidenceContext,
  createSemanticDeploymentAuthorityReaders,
} from "../lib/deployment-semantic-evidence-extractors.mjs";
import { chargeAcceptedLogicalTask, logicalTaskChargeIdentity } from "../lib/logical-task-budget.mjs";
import { authenticateAssociatedRecoverableState, createInitialRecoveryState } from "../lib/recovery-state.mjs";
import { createSessionLifecycleState, sessionLifecyclePath } from "../lib/session-lifecycle.mjs";
import { deployRuntimeBundle, inspectDeploymentQuiescence } from "../lib/runtime-bundle.mjs";
import {
  semanticRecoveryAuthorityClasses,
  semanticRecoveryClaimOwnerMatrix,
  semanticRecoveryVerifierSet,
} from "../lib/semantic-recovery-authority.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => Array.isArray(value)
  ? value.map(canonicalize)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
    : value;
const canonicalJson = (value) => JSON.stringify(canonicalize(value));

function snapshotFiles(root, relative = "") {
  return readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) return snapshotFiles(root, child);
    const filePath = path.join(root, child);
    const info = statSync(filePath);
    return [{ path: child, mode: info.mode & 0o777, sha256: sha256(readFileSync(filePath)) }];
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function makeFixture({ claimOverrides = {}, documentMutator = null, sourceMutator = null } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-semantic-deploy-"));
  chmodSync(root, 0o700);
  const configRoot = path.join(root, "config");
  const evidenceRoot = path.join(configRoot, "evidence-v1");
  const logsRoot = path.join(root, "logs");
  const recoveryRoot = path.join(logsRoot, "recovery");
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  mkdirSync(recoveryRoot, { recursive: true, mode: 0o700 });
  const repositoryRoot = path.join(root, "repo");
  mkdirSync(repositoryRoot, { mode: 0o700 });
  const git = (args, options = {}) => execFileSync("/usr/bin/git", args, { cwd: repositoryRoot, encoding: options.encoding ?? "utf8" });
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.name", "Settleora Test"]);
  git(["config", "user.email", "settleora-test@example.invalid"]);
  git(["remote", "add", "origin", "https://github.com/example/repo.git"]);
  writeFileSync(path.join(repositoryRoot, ".gitignore"), ".codex/reports/\n", { mode: 0o600 });
  writeFileSync(path.join(repositoryRoot, "fixture.txt"), "base\n", { mode: 0o600 });
  git(["add", ".gitignore", "fixture.txt"]); git(["commit", "-q", "-m", "base"]);
  const baseSha = git(["rev-parse", "HEAD"]).trim();
  git(["switch", "-q", "-c", "feature/issue-7"]);
  writeFileSync(path.join(repositoryRoot, "fixture.txt"), "base\ncandidate\n", { mode: 0o600 });
  git(["add", "fixture.txt"]); git(["commit", "-q", "-m", "Auto-runner issue #7: initial candidate before source classification"]);
  const headSha = git(["rev-parse", "HEAD"]).trim();
  const treeSha = git(["rev-parse", "HEAD^{tree}"]).trim();
  const changedFilesDigest = sha256(JSON.stringify(["fixture.txt"]));
  const diffDigest = sha256(execFileSync("/usr/bin/git", ["diff", "--no-ext-diff", "--no-textconv", "--binary", baseSha, headSha], { cwd: repositoryRoot }));
  git(["switch", "-q", "main"]);
  git(["update-ref", "refs/remotes/origin/main", baseSha]);
  const paths = {
    incident: path.join(recoveryRoot, "incident.json"),
    associatedRecovery: path.join(recoveryRoot, "associated.json"),
    runtimeManifest: path.join(root, "runtime-manifest.json"),
    runtimeConfig: path.join(configRoot, "runtime.json"),
    approvedProfile: path.join(configRoot, "approved.json"),
    runtimeApproval: path.join(root, "runtime-approval.json"),
    runtimeLauncher: path.join(root, "runtime-launcher.mjs"),
    healthUnit: path.join(root, "health.service"),
  };
  const incidentState = createInitialRecoveryState({
    taskKey: "20260101T010101", issue: { number: 7, title: "Fixture", url: "https://github.com/example/repo/issues/7" },
    runId: "run-original", supervisorRunId: "supervisor-original", branchName: "feature/issue-7",
    baseSha, currentHeadSha: headSha, phase: "implementation_or_bundle_slice", firstIncompleteAction: "implement",
  });
  const associatedState = createInitialRecoveryState({
    taskKey: "20260101T01", issue: { number: 7, title: "Fixture", url: "https://github.com/example/repo/issues/7" },
    runId: "run-original", supervisorRunId: "supervisor-original", branchName: "feature/issue-7",
    baseSha, currentHeadSha: baseSha, phase: "implementation_or_bundle_slice", firstIncompleteAction: "run_implementation",
  });
  const chargeIdentity = {
    repository: "example/repo", issueNumber: 7, taskLineageId: "20260101T010101",
    claimIdentity: "example/repo#7", acceptedAt: "2026-01-01T01:01:01.000Z",
  };
  const chargeId = logicalTaskChargeIdentity(chargeIdentity);
  const markers = {
    claim: { "issue-7": { status: "completed", target: "https://github.com/example/repo/issues/7", correlation: "run-original" } },
    logical_task_charge: { [chargeId]: { status: "completed", target: "issue-7", correlation: chargeId } },
    branch_ownership_created: { [`feature/issue-7:${baseSha}`]: { status: "completed", target: "feature/issue-7", correlation: baseSha } },
  };
  incidentState.mutationMarkers = structuredClone(markers);
  associatedState.mutationMarkers = structuredClone(markers);
  incidentState.timestamps.createdAt = associatedState.timestamps.createdAt;
  incidentState.expectedReportPaths = {
    repoReportPath: path.join(repositoryRoot, ".codex", "reports", `settleora-codex-report-${incidentState.taskKey}-issue-7-fixture.md`),
    promptPath: path.join(logsRoot, "tasks", `${incidentState.taskKey}-issue-7-fixture.md`),
  };
  incidentState.ordinaryContinuation = {
    identity: { baseSha, headSha, treeSha, changedFilesDigest, diffDigest },
    counters: { acceptedLogicalTasks: 1, localSourceChangingRoundsPerEpoch: 0, githubTriggeredFixEpochsPerPr: 0, lifetimeLocalSourceChangingRounds: 0 },
    effects: {}, phase: "local_validation", sourceFailureHistory: [], processedGithubFindingFingerprints: [],
    sourceFailureBatch: { findings: [{ sourceFixEligible: false, retryable: false, classification: "unsafe_or_ambiguous" }] },
    preparedGithubSourceFailureBatch: null, sourceFailureCommitEffect: null,
  };
  incidentState.ordinaryContinuation.sourceFailureHistory = [{ reasonCode: "fixture_unsafe_source_failure" }];
  incidentState.sessionLifecycle = { repository: "example/repo", mutationAuthority: { status: "terminal", generation: 2 }, sessions: { current: "session-predecessor" } };
  incidentState.phase = "stopped";
  incidentState.firstIncompleteAction = "lifecycle_stopped";
  incidentState.nextSafeAction = "lifecycle_stopped";
  const bytesByKey = {
    incident: Buffer.from(JSON.stringify(incidentState)),
    associatedRecovery: Buffer.from(JSON.stringify(associatedState)),
    runtimeManifest: Buffer.from("runtime-manifest"),
    runtimeConfig: Buffer.from("runtime-config"),
    approvedProfile: Buffer.from("approved-profile"),
    runtimeApproval: Buffer.from("runtime-approval"),
    runtimeLauncher: Buffer.from("runtime-launcher"),
    healthUnit: Buffer.from("health-unit"),
  };
  for (const [key, target] of Object.entries(paths)) writeFileSync(target, bytesByKey[key], { mode: 0o600 });
  const digests = Object.fromEntries(Object.entries(bytesByKey).map(([key, bytes]) => [key, sha256(bytes)]));
  const runtimeClaims = {
    runtimeSourceSha: "4".repeat(40), installedBundleDigest: "1".repeat(64),
    installedManifestDigest: digests.runtimeManifest, runtimeProfileDigest: digests.approvedProfile,
    runtimeApprovalDigest: digests.runtimeApproval, launcherDigest: digests.runtimeLauncher, healthUnitDigest: digests.healthUnit,
  };
  const projectAuthorityCore = {
    projectId: "Example", repositorySlug: "example/repo", namespace: "9".repeat(64),
    repoRoot: repositoryRoot, runtimeRoot: path.join(root, "runtime"), logsRoot,
    configPath: paths.runtimeConfig, approvedProfilePath: paths.approvedProfile, healthUnitPath: paths.healthUnit,
    runtimeSourceSha: runtimeClaims.runtimeSourceSha, runtimeBundleDigest: runtimeClaims.installedBundleDigest,
    artifacts: Object.fromEntries(Object.entries(paths).filter(([key]) => key !== "incident").map(([key, artifactPath]) => [key, { path: artifactPath, sha256: digests[key], byteCount: bytesByKey[key].length }])),
  };
  const projectAuthority = { ...projectAuthorityCore, evidenceDigest: sha256(canonicalJson(projectAuthorityCore)) };
  createCollectorArtifacts({ logsRoot, incidentState, baseSha, headSha, chargeIdentity, chargeId });
  const sourceCommand = createFixtureCommand({ issueNumber: 7, mainSha: baseSha });
  const extractionContext = collectSemanticDeploymentEvidenceContext({
    projectAuthority: structuredClone(projectAuthority), repositoryRoot, incidentPath: paths.incident, incidentSha256: digests.incident,
    associatedRecoveryPath: paths.associatedRecovery, associatedRecoverySha256: digests.associatedRecovery, command: sourceCommand,
  });
  const authorityReaders = createSemanticDeploymentAuthorityReaders();
  const claims = Object.assign({}, ...semanticRecoveryAuthorityClasses.map((authorityClass) => authorityReaders[authorityClass](extractionContext).claims), claimOverrides);
  const targetFields = [
    "repository", "issueNumber", "taskKey", "claimIdentity", "chargeId", "branch", "baseSha", "headSha", "treeSha",
    "changedFilesDigest", "diffDigest", "originalRunnerRunId", "originalSupervisorRunId", "failedContinuationRunnerRunId",
    "failedContinuationSupervisorRunId", "consumedRunnerRunId", "consumedSupervisorRunId", "acceptedLogicalTasks",
    "localSourceChangingRounds", "githubTriggeredFixEpochs", "lifetimeLocalSourceChangingRounds",
  ];
  const target = Object.fromEntries(targetFields.map((field) => [field, structuredClone(claims[field])]));
  const sources = [];
  for (const authorityClass of semanticRecoveryAuthorityClasses) {
    const definition = semanticRecoveryVerifierSet.verifiers[authorityClass];
    const ownedClaims = {};
    for (const [claim, ownership] of Object.entries(semanticRecoveryClaimOwnerMatrix)) {
      if ([...ownership.required, ...ownership.optional].includes(authorityClass)) ownedClaims[claim] = structuredClone(claims[claim]);
    }
    const role = `${authorityClass}_authority`;
    const sourcePath = path.join(evidenceRoot, `${authorityClass}.json`);
    const source = {
      authorityClass,
      claims: ownedClaims,
      contract: "settleora_semantic_deployment_evidence_source",
      producer: { id: definition.id, version: definition.version },
      provenanceIdentity: authorityReaders[authorityClass](extractionContext).provenanceIdentity,
      repository: claims.repository,
      store: { kind: definition.storeKind, role },
      version: 1,
    };
    sourceMutator?.(source, authorityClass);
    const sourceBytes = Buffer.from(canonicalJson(source));
    writeFileSync(sourcePath, sourceBytes, { mode: 0o600 });
    sources.push({ authorityClass, store: { kind: definition.storeKind, path: sourcePath, role, sha256: sha256(sourceBytes) } });
  }
  const artifacts = [
    ["current_incident_root", "incident"], ["associated_recoverable_state", "associatedRecovery"], ["installed_runtime_manifest", "runtimeManifest"],
    ["runtime_config", "runtimeConfig"], ["approved_runtime_profile", "approvedProfile"],
    ["runtime_approval", "runtimeApproval"], ["runtime_launcher", "runtimeLauncher"], ["health_unit", "healthUnit"],
  ].map(([role, key]) => ({ role, path: paths[key], sha256: digests[key] }));
  const packet = {
    sources,
    artifacts,
    incidentIdentity: sha256(canonicalJson({ path: paths.incident, sha256: digests.incident })),
    lifecycleSuccessorSession: "session-successor",
    lifecycleSuccessorGeneration: 3,
    formerBytesAvailable: false,
  };
  const ownerAttestation = {
    authority: "authenticated_external_profile_owner",
    scope: "runtime_deployment_quiescence_only",
    sourceManifestDigest: sha256(canonicalJson(sources.map(({ authorityClass, store }) => ({ authorityClass, store }))
      .sort((left, right) => left.authorityClass.localeCompare(right.authorityClass)))),
    artifactManifestDigest: sha256(canonicalJson(artifacts.map(({ role, path: artifactPath, sha256: artifactSha256 }) => ({ role, path: artifactPath, sha256: artifactSha256 }))
      .sort((left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path)))),
    targetDigest: sha256(canonicalJson(target)),
  };
  const namespace = projectAuthority.namespace;
  const provenance = {
    ok: true, repository: claims.repository, taskKey: claims.taskKey, issueNumber: claims.issueNumber,
    incidentPath: paths.incident, incidentSha256: digests.incident,
    incidentArtifact: { role: "current_incident_root", path: paths.incident, sha256: digests.incident },
    predecessorSha256: claims.formerRootSha256, bytesAvailable: false,
    originalRunnerRunId: claims.originalRunnerRunId, originalSupervisorRunId: claims.originalSupervisorRunId,
    consumedRunnerRunId: claims.consumedRunnerRunId, consumedSupervisorRunId: claims.consumedSupervisorRunId,
  };
  const association = { ok: true, binding: extractionContext.association };
  const document = {
    contract: "settleora_semantic_incident_deployment_evidence", version: 1,
    project: { projectId: projectAuthority.projectId, repositorySlug: projectAuthority.repositorySlug, namespace },
    config: { path: paths.runtimeConfig, sha256: digests.runtimeConfig },
    approvedProfile: { path: paths.approvedProfile, sha256: digests.approvedProfile },
    healthUnit: { path: paths.healthUnit, sha256: digests.healthUnit }, target,
    associatedRecovery: { path: association.binding.path, sha256: association.binding.sha256, stateDigest: association.binding.stateDigest, bindingDigest: sha256(canonicalJson(association.binding)) },
    evidenceRoot, ownerAttestation, authenticatedProvenance: provenance, semanticEvidencePacket: packet,
  };
  documentMutator?.(document);
  const documentEvidence = {
    strategy: "O_NOFOLLOW", realPath: path.join(evidenceRoot, "deployment-evidence.json"), ownerUid: process.getuid?.() ?? 0,
    mode: 0o600, sha256: sha256(canonicalJson(document)), packageRoot: evidenceRoot,
    packageAggregateDigest: "7".repeat(64), packageManifestDigest: "8".repeat(64), memberManifestDigest: "9".repeat(64),
  };
  const recoverableStates = [{ statePath: paths.associatedRecovery, taskKey: "20260101T01", issue: { number: 7 }, run: { runId: "run-original", supervisorRunId: "supervisor-original" } }];
  return {
    root, repositoryRoot, paths, claims, document, documentEvidence, projectAuthority, recoverableStates,
    sourceCommand, cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function inspect(fixture, recoverableStates = fixture.recoverableStates) {
  return inspectSemanticIncidentForDeployment({
    document: fixture.document, documentEvidence: fixture.documentEvidence,
    projectAuthority: fixture.projectAuthority, recoverableStates, sourceCommand: fixture.sourceCommand,
  });
}

function withFixtureEnvironment(fixture, operation) {
  return operation();
}

function createCollectorArtifacts({ logsRoot, incidentState, baseSha, headSha, chargeIdentity, chargeId }) {
  const budget = chargeAcceptedLogicalTask({ logsRoot, repositorySlug: "example/repo", maxIterations: 1 }, {
    budgetScopeId: "supervisor-original", repository: chargeIdentity.repository, issueNumber: chargeIdentity.issueNumber,
    taskLineageId: chargeIdentity.taskLineageId, claimIdentity: chargeIdentity.claimIdentity,
    acceptedAt: chargeIdentity.acceptedAt, maxTasks: 1,
  });
  assert.equal(budget.ok, true, JSON.stringify(budget));
  assert.equal(budget.chargeId, chargeId);
  const reportPath = incidentState.expectedReportPaths.repoReportPath;
  const promptPath = incidentState.expectedReportPaths.promptPath;
  mkdirSync(path.dirname(reportPath), { recursive: true, mode: 0o700 });
  mkdirSync(path.dirname(promptPath), { recursive: true, mode: 0o700 });
  writeFileSync(reportPath, "fixture report\n", { mode: 0o600 });
  writeFileSync(promptPath, "fixture prompt\n", { mode: 0o600 });
  const intentId = "11111111-2222-4333-8444-555555555555";
  const intentFingerprint = "8".repeat(64);
  const commitMessage = "Auto-runner issue #7: initial candidate before source classification";
  const intentRoot = path.join(logsRoot, "recovery", "pre-effect-intents");
  mkdirSync(intentRoot, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(intentRoot, `${sha256("fixture-commit-intent")}.json`), JSON.stringify({
    schemaVersion: 1,
    intentId,
    effectType: "commit",
    status: "finalized",
    repository: "example/repo",
    runId: "run-original",
    sessionId: "session-commit",
    authorityGeneration: 3,
    claimIdentity: "example/repo#7",
    logicalTaskIdentity: "example/repo#7",
    chargeIdentity: budget.statePath,
    reservationIdentity: null,
    sourceTaskKey: incidentState.taskKey,
    fingerprint: intentFingerprint,
    identity: {
      authorityGeneration: 3,
      baseSha,
      branchName: "feature/issue-7",
      candidateIdentity: baseSha,
      chargeIdentity: budget.statePath,
      claimIdentity: "example/repo#7",
      headSha: baseSha,
      logicalTaskIdentity: "example/repo#7",
      repository: "example/repo",
      reservationIdentity: null,
      runId: "run-original",
      sessionId: "session-commit",
      sourceTaskKey: incidentState.taskKey,
    },
    effect: {
      expectedParents: [baseSha],
      messageDigest: sha256(commitMessage),
      stagedPaths: ["fixture.txt"],
      treeSha: incidentState.ordinaryContinuation.identity.treeSha,
    },
    diagnostics: ["canonical_effect_executed"],
  }), { mode: 0o600 });

  const lifecycle = createSessionLifecycleState({
    repository: "example/repo", issueNumber: 7, taskKey: incidentState.taskKey,
    runId: "run-original", supervisorRunId: "supervisor-original", claimIdentity: "example/repo#7",
    chargeMarkerRef: budget.statePath, branchName: "feature/issue-7", baseSha, headSha,
    sessionId: "session-predecessor", phase: "implementation_or_bundle_slice", nextExactAction: "implement",
    reportPath: "/tmp/settleora-fixture-report.md", reportStatus: "in_progress",
  });
  lifecycle.sessions.generation = 2;
  lifecycle.mutationAuthority = { ownerSessionId: null, generation: 2, status: "terminal", handoff: null };
  lifecycle.controller.phase = "stopped";
  lifecycle.controller.nextExactAction = "checkpoint_validation_recovery_failed_closed";
  lifecycle.report.status = "stopped";
  lifecycle.interruption = {
    class: "main_process_exit_without_terminal_report",
    reasonCode: "interruption_main_process_exit_without_terminal_report",
    detectedAt: "2026-01-01T01:02:00.000Z",
  };
  lifecycle.recovery = {
    operationId: "11111111-1111-4111-8111-111111111111", status: "pending", attempts: 1,
    effectsAlreadyPresent: { mutation: false, commit: true, push: false, pr: false, merge: false, comment: false },
    phaseBefore: "implementation_or_bundle_slice", phaseAfter: "checkpoint_validation_commit",
  };
  lifecycle.reservations.logical_task_charge = {
    [chargeId]: { status: "completed", target: "issue-7", correlation: chargeId },
  };
  lifecycle.checkpoint.parentDigest = null;
  lifecycle.checkpoint.digest = null;
  const checkpointCopy = structuredClone(lifecycle);
  checkpointCopy.timestamps.updatedAt = null;
  lifecycle.checkpoint.digest = sha256(JSON.stringify(checkpointCopy));
  const lifecycleFile = sessionLifecyclePath({ logsRoot }, lifecycle);
  mkdirSync(path.dirname(lifecycleFile), { recursive: true, mode: 0o700 });
  writeFileSync(lifecycleFile, `${JSON.stringify(lifecycle, null, 2)}\n`, { mode: 0o600 });

  const stateRoot = path.join(logsRoot, "state");
  const summariesRoot = path.join(logsRoot, "summaries");
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  mkdirSync(summariesRoot, { recursive: true, mode: 0o700 });
  const roles = [
    ["original", "run-original", "supervisor-original", {
      issue: { number: 7 }, runId: "run-original", index: 1, branchName: "feature/issue-7",
      baseOriginMainSha: baseSha, runnerCreatedCommitSha: headSha, outcome: "validation_failed",
      taskPrompt: { promptPath, reportPath, timestampKey: incidentState.taskKey },
      sessionLifecycle: { report: { path: reportPath, correlationKey: incidentState.taskKey, status: "in_progress" } },
      commit: {
        skipped: false,
        files: ["fixture.txt"],
        commit: headSha,
        canonicalEffect: {
          ok: true,
          action: "executed",
          classification: "effect_present_exact_adoptable",
          intentId,
          fingerprint: intentFingerprint,
          status: "finalized",
          execution: { ok: true, status: 0 },
        },
      },
    }],
    ["failed", "run-failed", "supervisor-failed", {
      issue: { number: 7 }, runId: "run-failed", branchName: "feature/issue-7",
      baseOriginMainSha: baseSha, runnerCreatedCommitSha: headSha, outcome: "blocked_recovery_state",
      recovery: {
        state: runRecoveryIdentity(incidentState, baseSha, headSha),
        target: runRecoveryIdentity(incidentState, baseSha, headSha),
        terminalDerivativeProjection: { ok: true, boundArtifacts: [{ role: "rawRecovery", sha256: "6".repeat(64) }] },
      },
    }],
    ["consumed", "run-consumed", "supervisor-consumed", {
      issue: { number: 7 }, runId: "run-consumed", outcome: "terminal_lifecycle_reconciled", branchName: "feature/issue-7",
      baseOriginMainSha: baseSha, runnerCreatedCommitSha: headSha,
      recovery: {
        state: runRecoveryIdentity(incidentState, baseSha, headSha),
        lifecycle: { state: { controller: {
          localSourceChangingRoundsPerEpoch: 0, githubTriggeredFixEpochsPerPr: 0,
          lifetimeLocalSourceChangingRounds: 0,
        } } },
      },
    }],
  ];
  for (const [name, runner, supervisor, iteration] of roles) {
    writeFileSync(path.join(stateRoot, `${name}.json`), JSON.stringify(iteration), { mode: 0o600 });
    writeFileSync(path.join(summariesRoot, `${runner}.json`), JSON.stringify({
      runId: runner, supervisorRunId: supervisor, processedIssueNumbers: [7], iterations: [iteration],
    }), { mode: 0o600 });
    const key = sha256(supervisor);
    const specRoot = path.join(logsRoot, "supervisor", "run-specs", key);
    const runRoot = path.join(logsRoot, "supervisor", "runs", key);
    mkdirSync(specRoot, { recursive: true, mode: 0o700 });
    mkdirSync(runRoot, { recursive: true, mode: 0o700 });
    const failedSpec = name === "failed" ? {
      sourceIssueNumber: 7, sourceBranchName: "feature/issue-7",
      parentRunnerRunId: "run-original", parentSupervisorRunId: "supervisor-original",
      recoveryOnlyTarget: { ...runRecoveryIdentity(incidentState, baseSha, headSha), terminalValidationRetryDerivativeNoPr: true },
    } : {};
    writeFileSync(path.join(specRoot, "spec.json"), JSON.stringify({ runId: supervisor, ...failedSpec }), { mode: 0o600 });
    writeFileSync(path.join(runRoot, "state.json"), JSON.stringify({ runId: supervisor, runnerRunId: runner }), { mode: 0o600 });
    writeFileSync(path.join(runRoot, "heartbeat.json"), JSON.stringify({ runId: supervisor, runnerRunId: runner }), { mode: 0o600 });
  }
}

function runRecoveryIdentity(incidentState, baseSha, headSha) {
  return {
    taskKey: incidentState.taskKey, issueNumber: 7, branchName: "feature/issue-7", baseSha,
    currentHeadSha: headSha, runnerRunId: "run-original", supervisorRunId: "supervisor-original",
  };
}

function createFixtureCommand({ issueNumber, mainSha }) {
  return (executable, args, options = {}) => {
    if (executable === "/usr/bin/git") return execFileSync(executable, args, options);
    assert.equal(executable, "/usr/bin/gh");
    assert.equal(options.env.PATH, "/usr/bin:/bin");
    assert.equal(options.env.GH_CONFIG_DIR, undefined);
    assert.equal(options.env.GH_HOST, undefined);
    const joined = args.join(" ");
    if (joined === "api repos/example/repo") {
      return JSON.stringify({ full_name: "example/repo", default_branch: "main" });
    }
    if (joined === "api repos/example/repo/git/ref/heads/main") {
      return JSON.stringify({ ref: "refs/heads/main", object: { type: "commit", sha: mainSha } });
    }
    if (joined.includes("git/matching-refs/heads/")) return "[]";
    if (joined.startsWith("pr list ")) return "[]";
    if (joined.startsWith("issue view ")) {
      return JSON.stringify({
        number: issueNumber,
        state: "OPEN",
        updatedAt: "2020-01-01T00:00:00.000Z",
        comments: [{
          id: "comment-fixture", author: { login: "fixture-owner" }, body: "checkpoint",
          createdAt: "2020-01-01T00:00:00.000Z", updatedAt: null,
        }],
      });
    }
    throw new Error(`unexpected fixture command: ${executable} ${joined}`);
  };
}

test("semantic overwrite incident is admitted only for deterministic read-only deployment quiescence", () => {
  const fixture = makeFixture();
  try {
    const first = inspect(fixture);
    const second = inspect(fixture);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.reasonCode, "semantic_incident_deployment_only_admitted");
    assert.equal(first.evidenceDigest, second.evidenceDigest);
    assert.equal(first.manifestDigest, second.manifestDigest);
    assert.equal(first.proof.allowedAction, "runtime_deployment_quiescence_only");
    assert.equal(first.proof.protectedGrantRead, false);
    assert.equal(first.proof.protectedProducerInvoked, false);
    assert.equal(first.proof.successorConstructed, false);
    assert.equal(first.proof.successorPersisted, false);
    assert.equal(first.proof.sourceClasses.length, 8);
    const canonicalQuiescence = withFixtureEnvironment(fixture, () => inspectDeploymentQuiescence(fixture.projectAuthority.logsRoot, {
      semanticDeploymentEvidence: { document: fixture.document, evidence: fixture.documentEvidence },
      deploymentProjectAuthority: fixture.projectAuthority,
      repositoryRoot: fixture.projectAuthority.repoRoot,
      semanticSourceCommand: fixture.sourceCommand,
    }));
    assert.equal(canonicalQuiescence.semanticIncidentAdmitted, true);
    assert.equal(canonicalQuiescence.semanticEvidenceDigest, first.evidenceDigest);
  } finally { fixture.cleanup(); }
});

test("deployment-only semantic evidence accepts read-only service mode but rejects writable artifacts", () => {
  const fixture = makeFixture();
  try {
    chmodSync(fixture.paths.healthUnit, 0o644);
    assert.equal(inspect(fixture).ok, true);
    chmodSync(fixture.paths.healthUnit, 0o664);
    assert.equal(inspect(fixture).reasonCode, "semantic_bound_artifact_authentication_failed");
  } finally { fixture.cleanup(); }
  const byteDrift = makeFixture();
  try {
    writeFileSync(byteDrift.paths.healthUnit, "changed-health-unit", { mode: 0o600 });
    assert.equal(inspect(byteDrift).reasonCode, "semantic_bound_artifact_authentication_failed");
  } finally { byteDrift.cleanup(); }
});

test("live Git source authentication rejects dirty worktrees and transport authority", () => {
  const dirty = makeFixture();
  try {
    writeFileSync(path.join(dirty.repositoryRoot, "untracked.txt"), "drift\n", { mode: 0o600 });
    assert.equal(inspect(dirty).reasonCode, "semantic_deployment_live_source_revalidation_failed");
  } finally { dirty.cleanup(); }
  const transport = makeFixture();
  try {
    execFileSync("/usr/bin/git", ["config", "filter.fixture.clean", "malicious"], { cwd: transport.repositoryRoot });
    assert.equal(inspect(transport).reasonCode, "semantic_deployment_live_source_revalidation_failed");
  } finally { transport.cleanup(); }
});

test("live Git source authentication rejects replacement, graft, and alternate object authority", () => {
  for (const mutate of [
    (f) => execFileSync("/usr/bin/git", ["replace", f.claims.baseSha, f.claims.headSha], { cwd: f.repositoryRoot }),
    (f) => {
      mkdirSync(path.join(f.repositoryRoot, ".git", "info"), { recursive: true });
      writeFileSync(path.join(f.repositoryRoot, ".git", "info", "grafts"), `${f.claims.baseSha}\n`, { mode: 0o600 });
    },
    (f) => {
      mkdirSync(path.join(f.repositoryRoot, ".git", "objects", "info"), { recursive: true });
      writeFileSync(path.join(f.repositoryRoot, ".git", "objects", "info", "alternates"), "/tmp/foreign\n", { mode: 0o600 });
    },
    (f) => {
      mkdirSync(path.join(f.repositoryRoot, ".git", "objects", "info"), { recursive: true });
      writeFileSync(path.join(f.repositoryRoot, ".git", "objects", "info", "http-alternates"), "https://invalid.example/objects\n", { mode: 0o600 });
    },
  ]) {
    const fixture = makeFixture();
    try {
      mutate(fixture);
      assert.equal(inspect(fixture).reasonCode, "semantic_deployment_live_source_revalidation_failed");
    } finally { fixture.cleanup(); }
  }
});

test("live Git source binds canonical main, origin main, candidate exclusion, and every linked worktree", () => {
  for (const mutate of [
    (f) => execFileSync("/usr/bin/git", ["switch", "-q", "feature/issue-7"], { cwd: f.repositoryRoot }),
    (f) => execFileSync("/usr/bin/git", ["update-ref", "refs/remotes/origin/main", f.claims.headSha], { cwd: f.repositoryRoot }),
    (f) => {
      const linked = path.join(f.root, "linked-candidate");
      execFileSync("/usr/bin/git", ["worktree", "add", "-q", linked, "feature/issue-7"], { cwd: f.repositoryRoot });
      writeFileSync(path.join(linked, "untracked.txt"), "drift\n", { mode: 0o600 });
    },
  ]) {
    const fixture = makeFixture();
    try {
      mutate(fixture);
      assert.equal(inspect(fixture).reasonCode, "semantic_deployment_live_source_revalidation_failed");
    } finally { fixture.cleanup(); }
  }
});

test("live Git source rejects a candidate ref update inside the final collector read", () => {
  const fixture = makeFixture();
  try {
    const trusted = fixture.sourceCommand;
    let candidateRefReads = 0;
    fixture.sourceCommand = (executable, args, options) => {
      if (executable === "/usr/bin/git" && args.at(-2) === "rev-parse"
          && args.at(-1) === "refs/heads/feature/issue-7^{commit}"
          && ++candidateRefReads === 2) {
        execFileSync("/usr/bin/git", ["update-ref", "refs/heads/feature/issue-7", fixture.claims.baseSha], { cwd: fixture.repositoryRoot });
      }
      return trusted(executable, args, options);
    };
    assert.equal(inspect(fixture).reasonCode, "semantic_deployment_live_source_revalidation_failed");
    assert.equal(candidateRefReads, 2);
  } finally { fixture.cleanup(); }
});

test("live Git source rejects local configuration drift inside the final collector read", () => {
  const fixture = makeFixture();
  try {
    const trusted = fixture.sourceCommand;
    let candidateRefReads = 0;
    fixture.sourceCommand = (executable, args, options) => {
      if (executable === "/usr/bin/git" && args.at(-2) === "rev-parse"
          && args.at(-1) === "refs/heads/feature/issue-7^{commit}"
          && ++candidateRefReads === 2) {
        execFileSync("/usr/bin/git", ["config", "--local", "core.fsmonitor", "/bin/false"], { cwd: fixture.repositoryRoot });
      }
      return trusted(executable, args, options);
    };
    assert.equal(inspect(fixture).reasonCode, "semantic_deployment_live_source_revalidation_failed");
    assert.equal(candidateRefReads, 2);
  } finally { fixture.cleanup(); }
});

test("live source revalidation compares complete authority contexts before every class and once finally", () => {
  const fixture = makeFixture();
  try {
    const trusted = fixture.sourceCommand;
    const lifecycleRoot = path.join(fixture.projectAuthority.logsRoot, "session-lifecycle");
    const lifecyclePath = path.join(lifecycleRoot, readdirSync(lifecycleRoot).find((name) => name.endsWith(".json")));
    const originalBytes = readFileSync(lifecyclePath);
    let completeCollections = 0;
    let transientInstalled = false;
    fixture.sourceCommand = (executable, args, options) => {
      if (completeCollections === 1 && !transientInstalled && executable === "/usr/bin/git") {
        const changed = JSON.parse(originalBytes);
        changed.reviewOnlyTransient = true;
        changed.checkpoint.digest = null;
        const checkpointCopy = structuredClone(changed);
        checkpointCopy.timestamps.updatedAt = null;
        changed.checkpoint.digest = sha256(JSON.stringify(checkpointCopy));
        writeFileSync(lifecyclePath, `${JSON.stringify(changed, null, 2)}\n`, { mode: 0o600 });
        transientInstalled = true;
      }
      const result = trusted(executable, args, options);
      if (executable === "/usr/bin/gh" && args.join(" ").startsWith("issue view ")) {
        completeCollections += 1;
        if (completeCollections === 2 && transientInstalled) writeFileSync(lifecyclePath, originalBytes, { mode: 0o600 });
      }
      return result;
    };
    assert.equal(inspect(fixture).reasonCode, "semantic_deployment_live_source_revalidation_failed");
    assert.equal(completeCollections, 2);
  } finally { fixture.cleanup(); }
});

test("GitHub source uses a trusted absolute client and binds exact comment identities and fingerprints", () => {
  const later = makeFixture();
  try {
    const trusted = later.sourceCommand;
    later.sourceCommand = (executable, args, options) => {
      const result = trusted(executable, args, options);
      if (!args.join(" ").startsWith("issue view ")) return result;
      const issue = JSON.parse(result);
      issue.comments.push({
        id: "later-comment", author: { login: "fixture-owner" }, body: "later",
        createdAt: "2030-01-01T00:00:00.000Z", updatedAt: null,
      });
      return JSON.stringify(issue);
    };
    assert.equal(inspect(later).reasonCode, "semantic_deployment_live_source_revalidation_failed");
  } finally { later.cleanup(); }
  const fingerprint = makeFixture();
  try {
    const trusted = fingerprint.sourceCommand;
    fingerprint.sourceCommand = (executable, args, options) => {
      const result = trusted(executable, args, options);
      if (!args.join(" ").startsWith("issue view ")) return result;
      const issue = JSON.parse(result);
      issue.comments[0].body = "changed checkpoint";
      return JSON.stringify(issue);
    };
    assert.equal(inspect(fingerprint).reasonCode, "semantic_deployment_live_source_claim_drift");
  } finally { fingerprint.cleanup(); }
});

test("intent lineage authenticates exact prompt, report, finalized commit intent, and candidate subject", () => {
  for (const selectPath of [
    (f) => f.document.authenticatedProvenance.incidentPath && path.join(f.repositoryRoot, ".codex", "reports", "settleora-codex-report-20260101T010101-issue-7-fixture.md"),
    (f) => path.join(f.projectAuthority.logsRoot, "tasks", "20260101T010101-issue-7-fixture.md"),
    (f) => path.join(f.projectAuthority.logsRoot, "recovery", "pre-effect-intents", `${sha256("fixture-commit-intent")}.json`),
  ]) {
    const fixture = makeFixture();
    try {
      const target = selectPath(fixture);
      writeFileSync(target, `${readFileSync(target, "utf8")}drift`, { mode: 0o600 });
      assert.match(inspect(fixture).reasonCode, /^semantic_deployment_live_source_(?:provenance_drift|revalidation_failed)$/u);
    } finally { fixture.cleanup(); }
  }
  const subject = makeFixture();
  try {
    execFileSync("/usr/bin/git", ["branch", "-f", "feature/issue-7", "main"], { cwd: subject.repositoryRoot });
    assert.equal(inspect(subject).reasonCode, "semantic_deployment_live_source_revalidation_failed");
  } finally { subject.cleanup(); }
});

test("all eight live source projections retain independently derived provenance", () => {
  const fixture = makeFixture();
  try {
    const projections = readdirSync(fixture.document.evidenceRoot)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(path.join(fixture.document.evidenceRoot, name), "utf8")));
    assert.equal(projections.length, 8);
    assert.equal(new Set(projections.map((projection) => projection.provenanceIdentity)).size, 8);
  } finally { fixture.cleanup(); }
});

test("run-role rereads reject unrelated candidate, task lineage, and summary identities", () => {
  for (const [artifact, mutate] of [
    ["state/failed.json", (value) => { value.branchName = "feature/unrelated"; }],
    ["state/consumed.json", (value) => { value.recovery.state.taskKey = "20260101T999999"; }],
    ["summaries/run-failed.json", (value) => { value.runId = "run-unrelated"; }],
  ]) {
    const fixture = makeFixture();
    try {
      const target = path.join(fixture.projectAuthority.logsRoot, artifact);
      const value = JSON.parse(readFileSync(target, "utf8"));
      mutate(value);
      writeFileSync(target, JSON.stringify(value), { mode: 0o600 });
      assert.equal(inspect(fixture).reasonCode, "semantic_deployment_live_source_revalidation_failed");
    } finally { fixture.cleanup(); }
  }
});

test("semantic deployment admission rejects missing, duplicate, wrong, or drifted source authority", () => {
  for (const mutate of [
    (f) => f.document.semanticEvidencePacket.sources.pop(),
    (f) => { f.document.semanticEvidencePacket.sources[1].authorityClass = f.document.semanticEvidencePacket.sources[0].authorityClass; },
    (f) => { f.document.semanticEvidencePacket.sources[0].store.sha256 = "0".repeat(64); },
  ]) {
    const fixture = makeFixture();
    try { mutate(fixture); assert.equal(inspect(fixture).ok, false); } finally { fixture.cleanup(); }
  }
  const verifierDrift = makeFixture({ sourceMutator: (source, authorityClass) => { if (authorityClass === "repository_git") source.producer.version = 2; } });
  try { assert.equal(inspect(verifierDrift).ok, false); } finally { verifierDrift.cleanup(); }
  const matrixDrift = makeFixture({ sourceMutator: (source, authorityClass) => { if (authorityClass === "lifecycle") source.claims.chargeId = "d".repeat(64); } });
  try { assert.equal(inspect(matrixDrift).ok, false); } finally { matrixDrift.cleanup(); }
});

test("semantic deployment admission rejects every material incident, identity, runtime, posture, and effect drift", () => {
  const claimCases = [
    ["branch", "feature/wrong"], ["baseSha", "1".repeat(40)], ["headSha", "2".repeat(40)], ["treeSha", "3".repeat(40)],
    ["diffDigest", "1".repeat(64)], ["changedFilesDigest", "2".repeat(64)], ["chargeId", "3".repeat(64)],
    ["acceptedLogicalTasks", 2], ["submissionCount", 2], ["lifecycleMutationGeneration", 4],
    ["pushEffect", true], ["commentEffect", true], ["productEffect", true], ["submissionExhausted", false],
  ];
  for (const [claim, value] of claimCases) {
    const fixture = makeFixture({ claimOverrides: { [claim]: value } });
    try { assert.equal(inspect(fixture).ok, false, claim); } finally { fixture.cleanup(); }
  }
  const incidentDigest = makeFixture({ documentMutator: (doc) => { doc.authenticatedProvenance.incidentArtifact.sha256 = "0".repeat(64); } });
  try { assert.equal(inspect(incidentDigest).ok, false); } finally { incidentDigest.cleanup(); }
  const incidentPath = makeFixture({ documentMutator: (doc) => { doc.authenticatedProvenance.incidentPath = `${doc.authenticatedProvenance.incidentPath}.other`; } });
  try { assert.equal(inspect(incidentPath).ok, false); } finally { incidentPath.cleanup(); }
  const runtimeSource = makeFixture();
  try { runtimeSource.projectAuthority.runtimeSourceSha = "1".repeat(40); assert.equal(inspect(runtimeSource).ok, false); } finally { runtimeSource.cleanup(); }
  const runtimeProfile = makeFixture();
  try { runtimeProfile.projectAuthority.artifacts.approvedProfile.sha256 = "2".repeat(64); assert.equal(inspect(runtimeProfile).ok, false); } finally { runtimeProfile.cleanup(); }
});

test("semantic deployment admission requires one associated recovery and exact project isolation", () => {
  const fixture = makeFixture();
  try {
    assert.equal(inspect(fixture, []).reasonCode, "semantic_deployment_unresolved_recovery_count_invalid");
    assert.equal(inspect(fixture, [...fixture.recoverableStates, ...fixture.recoverableStates]).reasonCode, "semantic_deployment_unresolved_recovery_count_invalid");
    const wrong = structuredClone(fixture.recoverableStates); wrong[0].issue.number = 8;
    assert.equal(inspect(fixture, wrong).reasonCode, "semantic_deployment_unresolved_recovery_identity_mismatch");
    fixture.document.project.namespace = "0".repeat(64);
    assert.equal(inspect(fixture).reasonCode, "semantic_deployment_evidence_document_invalid");
  } finally { fixture.cleanup(); }
  const configuredMismatch = makeFixture();
  try {
    configuredMismatch.projectAuthority.configuredPostIncidentRecovery = {
      authenticatedProvenance: { ...structuredClone(configuredMismatch.document.authenticatedProvenance), taskKey: "other-task" },
      semanticEvidencePacket: structuredClone(configuredMismatch.document.semanticEvidencePacket),
      operationId: "1".repeat(64),
    };
    assert.equal(inspect(configuredMismatch).reasonCode, "semantic_deployment_evidence_document_invalid");
  } finally { configuredMismatch.cleanup(); }
});

test("unexpected deployment evidence fields or grant-like files cannot expand authority", () => {
  const fixture = makeFixture();
  try {
    writeFileSync(path.join(fixture.document.evidenceRoot, "unexpected-grant.json"), "{}", { mode: 0o600 });
    assert.equal(inspect(fixture).ok, true);
    fixture.document.operationGrant = { authorized: true };
    assert.equal(inspect(fixture).reasonCode, "semantic_deployment_evidence_document_invalid");
  } finally { fixture.cleanup(); }
  const packetGrant = makeFixture();
  try {
    packetGrant.document.semanticEvidencePacket.operationGrant = { authorized: true };
    packetGrant.documentEvidence.sha256 = sha256(canonicalJson(packetGrant.document));
    assert.equal(inspect(packetGrant).reasonCode, "semantic_deployment_packet_shape_invalid");
  } finally { packetGrant.cleanup(); }
  const ownerAttestationDrift = makeFixture();
  try {
    ownerAttestationDrift.document.ownerAttestation.targetDigest = "0".repeat(64);
    ownerAttestationDrift.documentEvidence.sha256 = sha256(canonicalJson(ownerAttestationDrift.document));
    assert.equal(inspect(ownerAttestationDrift).reasonCode, "semantic_deployment_evidence_document_invalid");
  } finally { ownerAttestationDrift.cleanup(); }
});

test("quiescence proof equality rejects semantic evidence drift before exchange", () => {
  const fixture = makeFixture();
  const installRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-semantic-deploy-equality-"));
  try {
    const admitted = inspect(fixture);
    assert.equal(admitted.ok, true);
    const quiescence = {
      active: false, unresolvedExternalEffects: false, pendingEffects: false,
      preservedRecoveryAdmitted: false, targetIdentityDigest: null,
      semanticIncidentAdmitted: true, semanticEvidenceDigest: admitted.evidenceDigest,
      semanticManifestDigest: admitted.manifestDigest, semanticDeploymentProof: admitted.proof,
      projectAuthorityDigest: fixture.projectAuthority.evidenceDigest,
      reasonCode: admitted.reasonCode, projectionFailureReasonCode: null, projectionFailureClass: null,
      revalidationRequired: true,
    };
    assert.throws(() => deployRuntimeBundle({
      sourceRoot: path.resolve("tools/auto-runner"), destination: path.join(installRoot, "runtime"),
      repoRoot: path.resolve("."), logsRoot: fixture.projectAuthority.logsRoot,
      sourceSha: "f".repeat(40), quiescence,
      finalQuiescenceVerifier: () => ({ ...quiescence, semanticEvidenceDigest: "0".repeat(64) }),
    }), /quiescence proof changed/);
  } finally { rmSync(installRoot, { recursive: true, force: true }); fixture.cleanup(); }
});

test("trusted semantic deployment dry-run is fully non-mutating", () => {
  const fixture = makeFixture();
  const installRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-semantic-deploy-dry-run-"));
  try {
    const before = snapshotFiles(fixture.root);
    const quiescence = withFixtureEnvironment(fixture, () => inspectDeploymentQuiescence(fixture.projectAuthority.logsRoot, {
      semanticDeploymentEvidence: { document: fixture.document, evidence: fixture.documentEvidence },
      deploymentProjectAuthority: fixture.projectAuthority,
      repositoryRoot: fixture.projectAuthority.repoRoot,
      semanticSourceCommand: fixture.sourceCommand,
    }));
    const result = deployRuntimeBundle({
      sourceRoot: path.resolve("tools/auto-runner"), destination: path.join(installRoot, "runtime"),
      repoRoot: fixture.projectAuthority.repoRoot, logsRoot: fixture.projectAuthority.logsRoot,
      sourceSha: "f".repeat(40), dryRun: true, quiescence,
    });
    assert.equal(result.dryRun, true);
    assert.equal(existsSync(path.join(installRoot, "runtime")), false);
    assert.deepEqual(snapshotFiles(fixture.root), before);
  } finally { rmSync(installRoot, { recursive: true, force: true }); fixture.cleanup(); }
});

test("parent operational root cannot hide nested project state when project authority is bound", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-project-root-binding-"));
  try {
    const project = path.join(root, "Project"); mkdirSync(project, { mode: 0o700 });
    mkdirSync(path.join(project, "pre-effect-intents"));
    writeFileSync(path.join(project, "pre-effect-intents", "pending.json"), JSON.stringify({ intent: "pending" }));
    assert.equal(inspectDeploymentQuiescence(root).reasonCode, "default_quiescent");
    assert.throws(() => inspectDeploymentQuiescence(root, {
      repositoryRoot: "/repo",
      deploymentProjectAuthority: { logsRoot: project, repoRoot: "/repo", evidenceDigest: "1".repeat(64) },
    }), /project authority/);
    assert.equal(inspectDeploymentQuiescence(project).unresolvedExternalEffects, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
