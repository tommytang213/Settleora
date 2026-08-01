import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertRecoveryWritePathAllowed,
  buildSemanticRecoveryManifest as buildSemanticRecoveryManifestProduction,
  classifyRecoveryOverwriteIncident,
  constructPostIncidentSuccessor,
  mandatorySemanticEvidenceClasses,
  persistOrAdoptPostIncidentSuccessor,
} from "../lib/post-incident-successor-recovery.mjs";
import { discoverStartupRecovery } from "../lib/recovery-continuation.mjs";
import { createInitialRecoveryState, recoveryStatePath, writeRecoveryState } from "../lib/recovery-state.mjs";

const oldHash = "6".repeat(64);
const incidentHash = "5".repeat(64);
const rootPath = "/sanitized/recovery/root.json";
const authenticateArtifact = (artifact, source) => ({ ...artifact, authenticated: true, underlyingIdentity: artifact.sha256, authorityClass: source.authorityClass, claims: source.claims });
const authenticateBoundArtifact = (artifact) => ({ ...artifact, authenticated: true, underlyingIdentity: artifact.sha256 });
const buildSemanticRecoveryManifest = (value) => buildSemanticRecoveryManifestProduction(value, { authenticateArtifact, authenticateBoundArtifact });
const claims = {
  repository: "example/repo", issueNumber: 7, taskKey: "task-1", claimIdentity: "example/repo#7", chargeId: "c".repeat(64),
  originalRunnerRunId: "run-original", originalSupervisorRunId: "supervisor-original", consumedRunnerRunId: "run-consumed", consumedSupervisorRunId: "supervisor-consumed",
  branch: "feature/issue-7", baseSha: "a".repeat(40), headSha: "b".repeat(40), treeSha: "d".repeat(40), changedFilesDigest: "e".repeat(64), diffDigest: "f".repeat(64),
  acceptedLogicalTasks: 1, localSourceChangingRounds: 0, githubTriggeredFixEpochs: 0, lifetimeLocalSourceChangingRounds: 0,
  formerRootPath: rootPath, formerRootSha256: oldHash, formerEffectivePhase: "checkpoint_validation_commit", incidentPath: rootPath, incidentSha256: incidentHash,
  lifecycleLineage: "terminal_validation_retry_to_distinct_successor", lifecycleSessionId: "session-predecessor", lifecycleMutationGeneration: 2, intentPosture: "one_no_effect_overlay_then_consumed_submission",
  validationEffect: false, reviewEffect: false, sourceEffect: false, pushEffect: false, prEffect: false, commentEffect: false, mergeEffect: false, issueEffect: false, productEffect: false,
  submissionCount: 1, submissionExhausted: true, successorEligible: true, earliestSafePhase: "checkpoint_validation_commit",
};

function packet(overrides = {}) {
  const sources = mandatorySemanticEvidenceClasses.map((authorityClass, index) => ({
    authorityClass,
    artifact: { role: `${authorityClass}_evidence`, path: `/sanitized/${authorityClass}.json`, sha256: String(index + 1).repeat(64).slice(0, 64) },
    claims: structuredClone(claims),
  }));
  const artifacts = Array.from({ length: 16 }, (_, index) => ({ role: `artifact_${String(index).padStart(2, "0")}`, path: `/sanitized/artifact-${index}.json`, sha256: (index.toString(16) || "0").repeat(64).slice(0, 64) }));
  return { sources, artifacts, incidentIdentity: "incident-1", lifecycleSuccessorSession: "session-successor", lifecycleSuccessorGeneration: 3, operationId: "operation-1", requestId: "request-1", formerBytesAvailable: false, ...overrides };
}

function recoveryState(overrides = {}) {
  return {
    taskKey: claims.taskKey,
    issue: { number: claims.issueNumber },
    run: { runId: claims.originalRunnerRunId, supervisorRunId: claims.originalSupervisorRunId },
    branch: { name: claims.branch, baseSha: claims.baseSha, currentHeadSha: claims.headSha },
    ordinaryContinuation: { identity: { claimIdentity: claims.claimIdentity } },
    mutationMarkers: { logical_task_charge: { [claims.chargeId]: { status: "completed" } } },
    sessionLifecycle: { sessionId: claims.lifecycleSessionId, mutationAuthority: { generation: 2 } },
    ...overrides,
  };
}

test("all mandatory independent classes agree and canonical manifest is ordering-stable", () => {
  const first = buildSemanticRecoveryManifest(packet());
  const reordered = packet();
  reordered.sources.reverse(); reordered.artifacts.reverse();
  const second = buildSemanticRecoveryManifest(reordered);
  assert.equal(first.ok, true); assert.equal(first.manifestDigest, second.manifestDigest);
  assert.equal(first.manifest.historicalPredecessor.bytesAvailable, false);
  assert.equal(Object.keys(first.manifest.sourceToClaimBindings).length, Object.keys(claims).length);
});

test("duplicate authority class does not count as independent", () => {
  const value = packet(); value.sources[1].authorityClass = value.sources[0].authorityClass;
  assert.equal(buildSemanticRecoveryManifest(value).reasonCode, "semantic_evidence_class_not_independent");
});

test("different class labels over one underlying artifact are not independent", () => {
  const value = packet(); value.sources[1].artifact = structuredClone(value.sources[0].artifact);
  const result = buildSemanticRecoveryManifest(value);
  assert.equal(result.reasonCode, "semantic_evidence_class_not_independent");
  assert.deepEqual(result.diagnostics, ["duplicate_underlying_artifact"]);
});

test("production source claims and authority class come from authenticated bytes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-evidence-bytes-"));
  try {
    const value = packet();
    value.sources = value.sources.map((source, index) => {
      const artifactPath = path.join(root, `${index}.json`);
      const document = { contract: "semantic_recovery_evidence_source", version: 1, authorityClass: source.authorityClass, claims: source.claims };
      writeFileSync(artifactPath, JSON.stringify(document), { mode: 0o600 });
      return { authorityClass: "caller_label_is_ignored", artifact: { role: source.artifact.role, path: artifactPath, sha256: createHash("sha256").update(readFileSync(artifactPath)).digest("hex") }, claims: { repository: "forged" } };
    });
    for (const artifact of value.artifacts) {
      artifact.path = path.join(root, `bound-${artifact.role}.json`); writeFileSync(artifact.path, artifact.role, { mode: 0o600 });
      artifact.sha256 = createHash("sha256").update(readFileSync(artifact.path)).digest("hex");
    }
    const result = buildSemanticRecoveryManifestProduction(value);
    assert.equal(result.ok, true);
    assert.equal(result.manifest.claims.repository, claims.repository);
    writeFileSync(value.artifacts[0].path, "altered", { mode: 0o600 });
    assert.equal(buildSemanticRecoveryManifestProduction(value).reasonCode, "semantic_bound_artifact_authentication_failed");
    writeFileSync(value.artifacts[0].path, value.artifacts[0].role, { mode: 0o600 });
    writeFileSync(value.sources[0].artifact.path, "{}", { mode: 0o600 });
    assert.equal(buildSemanticRecoveryManifestProduction(value).reasonCode, "semantic_evidence_source_authentication_failed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("production source parses the exact bytes that passed digest authentication", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-evidence-single-read-"));
  try {
    const value = packet();
    value.sources = value.sources.map((source, index) => {
      const artifactPath = path.join(root, `${index}.json`);
      const document = { contract: "semantic_recovery_evidence_source", version: 1, authorityClass: source.authorityClass, claims: source.claims };
      writeFileSync(artifactPath, JSON.stringify(document), { mode: 0o600 });
      return { artifact: { role: source.artifact.role, path: artifactPath, sha256: createHash("sha256").update(readFileSync(artifactPath)).digest("hex") } };
    });
    for (const artifact of value.artifacts) {
      artifact.path = path.join(root, `bound-${artifact.role}.json`); writeFileSync(artifact.path, artifact.role, { mode: 0o600 });
      artifact.sha256 = createHash("sha256").update(readFileSync(artifact.path)).digest("hex");
    }
    assert.equal(buildSemanticRecoveryManifestProduction(value).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing class and missing claim fail closed", () => {
  const missingClass = packet(); missingClass.sources.pop();
  assert.equal(buildSemanticRecoveryManifest(missingClass).reasonCode, "semantic_evidence_class_missing");
  const missingClaim = packet(); for (const source of missingClaim.sources) delete source.claims.treeSha;
  assert.equal(buildSemanticRecoveryManifest(missingClaim).reasonCode, "semantic_evidence_claim_missing");
});

test("contradictory identity and unknown claim fail closed", () => {
  const conflict = packet(); conflict.sources[0].claims.branch = "different";
  assert.equal(buildSemanticRecoveryManifest(conflict).reasonCode, "semantic_evidence_contradiction");
  const unknown = packet(); unknown.sources[0].claims.nonce = "nondeterministic";
  assert.equal(buildSemanticRecoveryManifest(unknown).reasonCode, "semantic_evidence_unknown_claim");
});

test("wrong roots and false predecessor-byte posture fail closed", () => {
  const sameHash = packet(); for (const source of sameHash.sources) source.claims.formerRootSha256 = incidentHash;
  assert.equal(buildSemanticRecoveryManifest(sameHash).reasonCode, "semantic_root_identity_invalid");
  assert.equal(buildSemanticRecoveryManifest(packet({ formerBytesAvailable: true })).reasonCode, "semantic_predecessor_bytes_posture_invalid");
  const wrongPath = packet(); for (const source of wrongPath.sources) source.claims.incidentPath = "/other/root.json";
  assert.equal(buildSemanticRecoveryManifest(wrongPath).reasonCode, "semantic_incident_path_lineage_invalid");
});

test("malformed Git object and diff identities fail closed", () => {
  for (const field of ["baseSha", "headSha", "treeSha", "changedFilesDigest", "diffDigest"]) {
    const value = packet(); for (const source of value.sources) source.claims[field] = "malformed";
    assert.equal(buildSemanticRecoveryManifest(value).reasonCode, "semantic_git_identity_invalid", field);
  }
});

test("malformed corroborated claim types and counters fail closed", () => {
  for (const [field, malformed] of [["issueNumber", "7"], ["taskKey", { bad: true }], ["branch", "bad branch"], ["localSourceChangingRounds", -1], ["submissionCount", 1.5]]) {
    const value = packet(); for (const source of value.sources) source.claims[field] = malformed;
    assert.equal(buildSemanticRecoveryManifest(value).reasonCode, "semantic_claim_shape_invalid", field);
  }
});

test("corroborated branch must be a valid short Git branch name", () => {
  for (const branch of ["foo..bar", "refs/heads/topic", "-topic", "topic.lock", "topic@{one", "topic//child"]) {
    const value = packet(); for (const source of value.sources) source.claims.branch = branch;
    assert.equal(buildSemanticRecoveryManifest(value).reasonCode, "semantic_claim_shape_invalid", branch);
  }
});

test("altered historical or child artifact and identity/counter/effect disagreements fail closed", () => {
  for (const field of ["chargeId", "acceptedLogicalTasks", "branch", "headSha", "lifecycleLineage", "intentPosture", "submissionCount", "sourceEffect"]) {
    const value = packet(); value.sources[0].claims[field] = field.endsWith("Effect") ? true : "altered";
    assert.equal(buildSemanticRecoveryManifest(value).reasonCode, "semantic_evidence_contradiction", field);
  }
  const artifact = packet(); artifact.artifacts[0].sha256 = "wrong";
  assert.equal(buildSemanticRecoveryManifest(artifact).reasonCode, "semantic_artifact_binding_invalid");
});

test("distinct successor binds provenance and stays non-executable", () => {
  const built = buildSemanticRecoveryManifest(packet());
  const constructed = constructPostIncidentSuccessor({ manifest: built.manifest, recoveryState: { stopReason: { reasonCode: "untrusted_incident_field" } }, mutationGeneration: 3, operationalAuthorization: { authorized: true, manifestDigest: built.manifestDigest, operationId: "operation-1" } });
  assert.equal(constructed.ok, true); assert.notEqual(constructed.storageKey, path.basename(rootPath, ".json"));
  assert.equal(constructed.successor.postIncidentSuccessor.executable, false);
  assert.equal(constructed.successor.phase, "checkpoint_validation_commit");
  assert.equal(constructed.successor.nextSafeAction, "await_separate_execution_authorization");
  assert.equal(constructed.successor.sessionLifecycle.sessionId, "session-successor");
  assert.equal(constructed.successor.sessionLifecycle.previousSessionId, "session-predecessor");
  assert.equal(constructed.successor.run.runId, claims.originalRunnerRunId);
  assert.equal(constructed.successor.sessionLifecycle.logicalTask.runId, claims.originalRunnerRunId);
  assert.equal("stopReason" in constructed.successor, false);
});

test("successor construction requires a separate exact operation authorization", () => {
  const built = buildSemanticRecoveryManifest(packet());
  assert.equal(constructPostIncidentSuccessor({ manifest: built.manifest, recoveryState: {}, mutationGeneration: 1 }).reasonCode, "post_incident_operational_authorization_required");
  const altered = structuredClone(built.manifest); altered.claims.branch = "altered";
  assert.equal(constructPostIncidentSuccessor({ manifest: altered, recoveryState: {}, mutationGeneration: 1, operationalAuthorization: { authorized: true, manifestDigest: built.manifestDigest, operationId: "operation-1" } }).reasonCode, "semantic_manifest_digest_mismatch");
  assert.equal(constructPostIncidentSuccessor({ manifest: built.manifest, recoveryState: recoveryState(), mutationGeneration: 2, operationalAuthorization: { authorized: true, manifestDigest: built.manifestDigest, operationId: "operation-1" } }).reasonCode, "post_incident_mutation_generation_mismatch");
  const wrongLifecycle = structuredClone(built.manifest); wrongLifecycle.lifecycleSuccessor.previousSessionId = "wrong";
  assert.equal(constructPostIncidentSuccessor({ manifest: wrongLifecycle, mutationGeneration: 3, operationalAuthorization: { authorized: true, manifestDigest: built.manifestDigest, operationId: "operation-1" } }).reasonCode, "semantic_manifest_digest_mismatch");
});

test("successor persistence is idempotent and conflicting adoption fails closed", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-successor-"));
  try {
    const built = buildSemanticRecoveryManifest(packet());
    const construction = constructPostIncidentSuccessor({ manifest: built.manifest, recoveryState: recoveryState(), mutationGeneration: 3, operationalAuthorization: { authorized: true, manifestDigest: built.manifestDigest, operationId: "operation-1" } });
    const config = { logsRoot: root, postIncidentSuccessorRoot: path.join(root, "successors") };
    mkdirSync(config.postIncidentSuccessorRoot, { mode: 0o700 });
    mkdirSync(path.join(config.postIncidentSuccessorRoot, "provenance"), { mode: 0o700 });
    const created = persistOrAdoptPostIncidentSuccessor(config, construction, built.manifest);
    const adopted = persistOrAdoptPostIncidentSuccessor(config, construction, built.manifest);
    assert.equal(created.adopted, false); assert.equal(adopted.adopted, true);
    const collision = { ...construction, successor: { ...construction.successor, taskKey: "collision" } };
    assert.equal(persistOrAdoptPostIncidentSuccessor(config, collision, built.manifest).reasonCode, "post_incident_persistence_binding_invalid");
    const competingPacket = packet({ operationId: "operation-2", requestId: "request-2" });
    const competingBuilt = buildSemanticRecoveryManifest(competingPacket);
    const competing = constructPostIncidentSuccessor({ manifest: competingBuilt.manifest, recoveryState: recoveryState(), mutationGeneration: 3, operationalAuthorization: { authorized: true, manifestDigest: competingBuilt.manifestDigest, operationId: "operation-2" } });
    assert.equal(persistOrAdoptPostIncidentSuccessor(config, competing, competingBuilt.manifest).reasonCode, "post_incident_provenance_conflict");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("protected raw paths block and unrelated successor path is allowed", () => {
  assert.equal(assertRecoveryWritePathAllowed(rootPath, { predecessorPath: rootPath, incidentPath: rootPath }).reasonCode, "protected_recovery_path_write_blocked");
  assert.equal(assertRecoveryWritePathAllowed("/sanitized/successor.json", { predecessorPath: rootPath, incidentPath: rootPath, successorPath: "/sanitized/successor.json" }).ok, true);
});

test("overwrite quarantine authenticates incident bytes and does not block unrelated recovery", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-classify-"));
  try {
    const incidentPath = path.join(root, "root.json"); writeFileSync(incidentPath, "incident\n", { mode: 0o600 });
    const actual = createHash("sha256").update(readFileSync(incidentPath)).digest("hex");
    const provenance = { ok: true, incidentPath, incidentArtifact: { role: "incident", path: incidentPath, sha256: actual }, taskKey: "task-1", issueNumber: 7, predecessorSha256: oldHash, incidentSha256: actual, bytesAvailable: false };
    assert.equal(classifyRecoveryOverwriteIncident({ recoveryPath: incidentPath, state: { taskKey: "task-1", issue: { number: 7 } }, authenticatedProvenance: provenance }).quarantined, true);
    const altered = structuredClone(provenance); altered.incidentArtifact.sha256 = incidentHash;
    assert.equal(classifyRecoveryOverwriteIncident({ recoveryPath: incidentPath, state: { taskKey: "task-1", issue: { number: 7 } }, authenticatedProvenance: altered }).reasonCode, "incident_provenance_authentication_failed");
    assert.equal(classifyRecoveryOverwriteIncident({ recoveryPath: incidentPath, state: { taskKey: "altered", issue: { number: 999 } }, authenticatedProvenance: provenance }).reasonCode, "incident_identity_contradiction");
    assert.equal(classifyRecoveryOverwriteIncident({ recoveryPath: incidentPath, state: { taskKey: "task-1", issue: { number: 7 } }, authenticatedProvenance: { ...provenance, incidentSha256: incidentHash } }).reasonCode, "incident_provenance_contradiction");
    assert.equal(classifyRecoveryOverwriteIncident({ recoveryPath: incidentPath, state: { taskKey: "task-1", issue: { number: 7 } }, authenticatedProvenance: { ...provenance, predecessorSha256: actual } }).reasonCode, "incident_provenance_contradiction");
    const otherPath = path.join(root, "other.json"); writeFileSync(otherPath, "other\n", { mode: 0o600 });
    const otherSha = createHash("sha256").update(readFileSync(otherPath)).digest("hex");
    assert.equal(classifyRecoveryOverwriteIncident({ recoveryPath: incidentPath, state: { taskKey: "task-1", issue: { number: 7 } }, authenticatedProvenance: { ...provenance, incidentArtifact: { role: "incident", path: otherPath, sha256: otherSha }, incidentSha256: otherSha } }).reasonCode, "incident_path_contradiction");
    assert.equal(classifyRecoveryOverwriteIncident({ recoveryPath: "/other.json", state: { taskKey: "other", issue: { number: 8 } }, authenticatedProvenance: provenance }).quarantined, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("production discovery quarantines an authenticated incident before ordinary recovery", () => {
  const logsRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-quarantine-"));
  try {
    const state = createInitialRecoveryState({ taskKey: "task-1", issue: { number: 7 }, runId: "run-original", branchName: "feature/issue-7", baseSha: "a".repeat(40), currentHeadSha: "b".repeat(40) });
    const config = { logsRoot, allowExistingPrRecovery: true, postIncidentRecovery: { authenticatedProvenance: { ok: true, incidentPath: recoveryStatePath({ logsRoot }, state), taskKey: "task-1", issueNumber: 7, predecessorSha256: oldHash, incidentSha256: incidentHash, bytesAvailable: false } } };
    writeRecoveryState(config, state);
    const incidentPath = recoveryStatePath({ logsRoot }, state);
    const actual = createHash("sha256").update(readFileSync(incidentPath)).digest("hex");
    config.postIncidentRecovery.authenticatedProvenance.incidentPath = incidentPath;
    config.postIncidentRecovery.authenticatedProvenance.incidentSha256 = actual;
    config.postIncidentRecovery.authenticatedProvenance.incidentArtifact = { role: "incident", path: incidentPath, sha256: actual };
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "semantic_evidence_packet_missing");
    assert.equal(discovery.quarantine.readOnly, true);
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("production discovery quarantines configured completed incident before recoverability filtering", () => {
  const logsRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-quarantine-completed-"));
  try {
    const state = createInitialRecoveryState({ taskKey: "task-1", issue: { number: 7 }, runId: "run-original", branchName: "feature/issue-7", baseSha: "a".repeat(40), currentHeadSha: "b".repeat(40), phase: "completed" });
    writeRecoveryState({ logsRoot }, state);
    const incidentPath = recoveryStatePath({ logsRoot }, state);
    const actual = createHash("sha256").update(readFileSync(incidentPath)).digest("hex");
    const config = { logsRoot, allowExistingPrRecovery: true, postIncidentRecovery: { authenticatedProvenance: { ok: true, incidentPath, incidentArtifact: { role: "incident", path: incidentPath, sha256: actual }, taskKey: "task-1", issueNumber: 7, predecessorSha256: oldHash, incidentSha256: actual, bytesAvailable: false } } };
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.found, true); assert.equal(discovery.allowed, false); assert.equal(discovery.quarantine.readOnly, true);
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("symlinked successor roots fail before persistence", () => {
  const logsRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-symlink-root-"));
  const target = mkdtempSync(path.join(os.tmpdir(), "settleora-symlink-target-"));
  try {
    const root = path.join(logsRoot, "successors"); symlinkSync(target, root, "dir");
    const built = buildSemanticRecoveryManifest(packet());
    const construction = constructPostIncidentSuccessor({ manifest: built.manifest, recoveryState: recoveryState(), mutationGeneration: 3, operationalAuthorization: { authorized: true, manifestDigest: built.manifestDigest, operationId: "operation-1" } });
    assert.equal(persistOrAdoptPostIncidentSuccessor({ logsRoot, postIncidentSuccessorRoot: root }, construction, built.manifest).reasonCode, "post_incident_successor_root_unsafe");
  } finally { rmSync(logsRoot, { recursive: true, force: true }); rmSync(target, { recursive: true, force: true }); }
});

test("in-root symlinked persistence directories fail before writes", () => {
  const logsRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-in-root-symlink-"));
  try {
    const target = path.join(logsRoot, "target"); mkdirSync(target, { mode: 0o700 }); mkdirSync(path.join(target, "provenance"), { mode: 0o700 });
    const root = path.join(logsRoot, "successors"); symlinkSync(target, root, "dir");
    const built = buildSemanticRecoveryManifest(packet());
    const construction = constructPostIncidentSuccessor({ manifest: built.manifest, mutationGeneration: 3, operationalAuthorization: { authorized: true, manifestDigest: built.manifestDigest, operationId: "operation-1" } });
    assert.equal(persistOrAdoptPostIncidentSuccessor({ logsRoot, postIncidentSuccessorRoot: root }, construction, built.manifest).reasonCode, "post_incident_successor_root_unsafe");
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("symlinked successor destination cannot be adopted", () => {
  const logsRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-symlink-destination-"));
  try {
    const built = buildSemanticRecoveryManifest(packet());
    const construction = constructPostIncidentSuccessor({ manifest: built.manifest, recoveryState: recoveryState(), mutationGeneration: 3, operationalAuthorization: { authorized: true, manifestDigest: built.manifestDigest, operationId: "operation-1" } });
    const root = path.join(logsRoot, "successors"); mkdirSync(root, { recursive: true, mode: 0o700 });
    const target = path.join(logsRoot, "external.json"); writeFileSync(target, `${JSON.stringify(construction.successor)}\n`, { mode: 0o600 });
    symlinkSync(target, path.join(root, `${construction.storageKey}.json`));
    assert.equal(persistOrAdoptPostIncidentSuccessor({ logsRoot, postIncidentSuccessorRoot: root }, construction, built.manifest).reasonCode, "post_incident_successor_destination_unsafe");
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});
