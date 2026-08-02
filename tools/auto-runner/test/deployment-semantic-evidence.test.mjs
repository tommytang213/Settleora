import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectSemanticIncidentForDeployment } from "../lib/deployment-semantic-evidence.mjs";
import { authenticateAssociatedRecoverableState, createInitialRecoveryState } from "../lib/recovery-state.mjs";
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
    taskKey: "20260101T010101", issue: { number: 7, title: "Fixture", url: "https://example.test/issues/7" },
    runId: "run-original", supervisorRunId: "supervisor-original", branchName: "feature/issue-7",
    baseSha: "a".repeat(40), currentHeadSha: "b".repeat(40), phase: "implementation_or_bundle_slice", firstIncompleteAction: "implement",
  });
  const associatedState = createInitialRecoveryState({
    taskKey: "20260101T01", issue: { number: 7, title: "Fixture", url: "https://example.test/issues/7" },
    runId: "run-original", supervisorRunId: "supervisor-original", branchName: "feature/issue-7",
    baseSha: "a".repeat(40), currentHeadSha: "a".repeat(40), phase: "implementation_or_bundle_slice", firstIncompleteAction: "run_implementation",
  });
  const markers = {
    claim: { "issue-7": { status: "completed", target: "https://example.test/issues/7", correlation: "run-original" } },
    logical_task_charge: { ["c".repeat(64)]: { status: "completed", target: "issue-7", correlation: "c".repeat(64) } },
    branch_ownership_created: { [`feature/issue-7:${"a".repeat(40)}`]: { status: "completed", target: "feature/issue-7", correlation: "a".repeat(40) } },
  };
  incidentState.mutationMarkers = structuredClone(markers);
  associatedState.mutationMarkers = structuredClone(markers);
  incidentState.timestamps.createdAt = associatedState.timestamps.createdAt;
  incidentState.expectedReportPaths = {
    repoReportPath: path.join(root, `settleora-codex-report-${incidentState.taskKey}-issue-7-fixture.md`),
    promptPath: path.join(root, `${incidentState.taskKey}-issue-7-fixture.md`),
  };
  incidentState.ordinaryContinuation = {
    identity: { baseSha: "a".repeat(40), headSha: "b".repeat(40), treeSha: "d".repeat(40), changedFilesDigest: "e".repeat(64), diffDigest: "f".repeat(64) },
    counters: { acceptedLogicalTasks: 1, localSourceChangingRoundsPerEpoch: 0, githubTriggeredFixEpochsPerPr: 0, lifetimeLocalSourceChangingRounds: 0 },
  };
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
  const claims = {
    repository: "example/repo", issueNumber: 7, taskKey: "20260101T010101", claimIdentity: "example/repo#7", chargeId: "c".repeat(64),
    originalRunnerRunId: "run-original", originalSupervisorRunId: "supervisor-original",
    failedContinuationRunnerRunId: "run-failed", failedContinuationSupervisorRunId: "supervisor-failed",
    consumedRunnerRunId: "run-consumed", consumedSupervisorRunId: "supervisor-consumed",
    originalSpecIdentity: "1".repeat(64), originalStateIdentity: "2".repeat(64), originalIterationIdentity: "3".repeat(64), originalSummaryIdentity: "4".repeat(64),
    failedContinuationSpecIdentity: "7".repeat(64), failedContinuationStateIdentity: "8".repeat(64), failedContinuationHeartbeatIdentity: "9".repeat(64), failedContinuationSummaryIdentity: "a".repeat(64),
    consumedSpecIdentity: "b".repeat(64), consumedStateIdentity: "c".repeat(64), consumedIterationIdentity: "d".repeat(64), consumedSummaryIdentity: "e".repeat(64),
    branch: "feature/issue-7", baseSha: "a".repeat(40), headSha: "b".repeat(40), treeSha: "d".repeat(40), changedFilesDigest: "e".repeat(64), diffDigest: "f".repeat(64),
    acceptedLogicalTasks: 1, localSourceChangingRounds: 0, githubTriggeredFixEpochs: 0, lifetimeLocalSourceChangingRounds: 0,
    formerRootPath: paths.incident, formerRootSha256: "6".repeat(64), formerEffectivePhase: "checkpoint_validation_commit",
    incidentPath: paths.incident, incidentSha256: digests.incident, predecessorBytesAvailable: false,
    prEvidenceDigest: "f".repeat(64), runtimeSourceSha: "4".repeat(40), installedBundleDigest: "1".repeat(64),
    installedManifestDigest: digests.runtimeManifest, runtimeProfileDigest: digests.approvedProfile,
    runtimeApprovalDigest: digests.runtimeApproval, launcherDigest: digests.runtimeLauncher, healthUnitDigest: digests.healthUnit,
    lifecycleLineage: "terminal_validation_retry_to_distinct_successor", lifecycleSessionId: "session-predecessor", lifecycleMutationGeneration: 2,
    intentPosture: "one_no_effect_overlay_then_consumed_submission",
    validationEffect: false, reviewEffect: false, sourceEffect: false, pushEffect: false, prEffect: false,
    commentEffect: false, mergeEffect: false, issueEffect: false, productEffect: false,
    submissionCount: 1, submissionExhausted: true, successorEligible: true, earliestSafePhase: "checkpoint_validation_commit",
  };
  const targetFields = [
    "repository", "issueNumber", "taskKey", "claimIdentity", "chargeId", "branch", "baseSha", "headSha", "treeSha",
    "changedFilesDigest", "diffDigest", "originalRunnerRunId", "originalSupervisorRunId", "failedContinuationRunnerRunId",
    "failedContinuationSupervisorRunId", "consumedRunnerRunId", "consumedSupervisorRunId", "acceptedLogicalTasks",
    "localSourceChangingRounds", "githubTriggeredFixEpochs", "lifetimeLocalSourceChangingRounds",
  ];
  const target = Object.fromEntries(targetFields.map((field) => [field, structuredClone(claims[field])]));
  Object.assign(claims, claimOverrides);
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
      provenanceIdentity: sha256(`${authorityClass}:fixture`),
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
  const namespace = "9".repeat(64);
  const projectAuthorityCore = {
    projectId: "Example", repositorySlug: "example/repo", namespace,
    repoRoot: path.join(root, "repo"), runtimeRoot: path.join(root, "runtime"), logsRoot,
    configPath: paths.runtimeConfig, approvedProfilePath: paths.approvedProfile, healthUnitPath: paths.healthUnit,
    runtimeSourceSha: claims.runtimeSourceSha, runtimeBundleDigest: claims.installedBundleDigest,
    artifacts: Object.fromEntries(Object.entries(paths).filter(([key]) => key !== "incident").map(([key, artifactPath]) => [key, { path: artifactPath, sha256: digests[key], byteCount: bytesByKey[key].length }])),
  };
  const projectAuthority = { ...projectAuthorityCore, evidenceDigest: sha256(canonicalJson(projectAuthorityCore)) };
  const provenance = {
    ok: true, repository: claims.repository, taskKey: claims.taskKey, issueNumber: claims.issueNumber,
    incidentPath: paths.incident, incidentSha256: digests.incident,
    incidentArtifact: { role: "current_incident_root", path: paths.incident, sha256: digests.incident },
    predecessorSha256: claims.formerRootSha256, bytesAvailable: false,
    originalRunnerRunId: claims.originalRunnerRunId, originalSupervisorRunId: claims.originalSupervisorRunId,
    consumedRunnerRunId: claims.consumedRunnerRunId, consumedSupervisorRunId: claims.consumedSupervisorRunId,
  };
  const association = authenticateAssociatedRecoverableState({
    config: { logsRoot, repositorySlug: claims.repository },
    incidentPath: paths.incident,
    incidentSha256: digests.incident,
    associatedRecoveryPath: paths.associatedRecovery,
    associatedRecoverySha256: digests.associatedRecovery,
  });
  assert.equal(association.ok, true, JSON.stringify(association));
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
  return { root, paths, claims, document, documentEvidence, projectAuthority, recoverableStates, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function inspect(fixture, recoverableStates = fixture.recoverableStates) {
  return inspectSemanticIncidentForDeployment({ document: fixture.document, documentEvidence: fixture.documentEvidence, projectAuthority: fixture.projectAuthority, recoverableStates });
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
    const canonicalQuiescence = inspectDeploymentQuiescence(fixture.projectAuthority.logsRoot, {
      semanticDeploymentEvidence: { document: fixture.document, evidence: fixture.documentEvidence },
      deploymentProjectAuthority: fixture.projectAuthority,
      repositoryRoot: fixture.projectAuthority.repoRoot,
    });
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
    const quiescence = inspectDeploymentQuiescence(fixture.projectAuthority.logsRoot, {
      semanticDeploymentEvidence: { document: fixture.document, evidence: fixture.documentEvidence },
      deploymentProjectAuthority: fixture.projectAuthority,
      repositoryRoot: fixture.projectAuthority.repoRoot,
    });
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
