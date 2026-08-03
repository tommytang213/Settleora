import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import test from "node:test";
import {
  applySemanticRecoveryClaimOwnerMatrix,
  deriveSemanticRecoveryOperationRequest,
  semanticRecoveryAuthorityClasses,
  semanticRecoveryClaimOwnerMatrix,
  semanticRecoveryClaimOwnerMatrixDigest,
  semanticRecoveryClaimOwnerMatrixVersion,
  semanticRecoveryVerifierSet,
  semanticRecoveryVerifierSetDigest,
  semanticRecoveryVerifierSetVersion,
} from "../lib/semantic-recovery-authority.mjs";
import {
  normalizeSemanticRecoveryNativeProducerRequest,
  planSemanticRecoveryGrant,
  planSemanticRecoveryNativeInstall,
  verifyInstalledSemanticRecoveryNativeProducer,
  verifySemanticRecoveryGrantPlan,
  verifySemanticRecoveryNativeInstallPlan,
} from "../lib/semantic-recovery-native-producer.mjs";
import {
  authenticateNativeSemanticRecoveryStore,
  expectedPersistenceRecords,
  persistExactSemanticRecoverySuccessorFromNativeProducer,
  readbackProtectedSemanticRecoverySuccessor,
  semanticRecoveryProtectedLayout,
  semanticRecoveryProtectedStorePath,
} from "../lib/semantic-recovery-protected-store.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" && !Buffer.isBuffer(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const oldHash = "6".repeat(64);
const incidentHash = "5".repeat(64);
const rootPath = "/sanitized/recovery/root.json";
const claims = Object.freeze({
  repository: "example/repo", issueNumber: 7, taskKey: "task-1", claimIdentity: "example/repo#7", chargeId: "c".repeat(64),
  originalRunnerRunId: "run-original", originalSupervisorRunId: "supervisor-original", consumedRunnerRunId: "run-consumed", consumedSupervisorRunId: "supervisor-consumed",
  originalSpecIdentity: "1".repeat(64), originalStateIdentity: "2".repeat(64), originalIterationIdentity: "3".repeat(64), originalSummaryIdentity: "4".repeat(64),
  failedContinuationRunnerRunId: "run-failed", failedContinuationSupervisorRunId: "supervisor-failed", failedContinuationSpecIdentity: "7".repeat(64), failedContinuationStateIdentity: "8".repeat(64), failedContinuationHeartbeatIdentity: "9".repeat(64), failedContinuationSummaryIdentity: "a".repeat(64),
  consumedSpecIdentity: "b".repeat(64), consumedStateIdentity: "c".repeat(64), consumedIterationIdentity: "d".repeat(64), consumedSummaryIdentity: "e".repeat(64),
  branch: "feature/issue-7", baseSha: "a".repeat(40), headSha: "b".repeat(40), treeSha: "d".repeat(40), changedFilesDigest: "e".repeat(64), diffDigest: "f".repeat(64),
  acceptedLogicalTasks: 1, localSourceChangingRounds: 0, githubTriggeredFixEpochs: 0, lifetimeLocalSourceChangingRounds: 0,
  formerRootPath: rootPath, formerRootSha256: oldHash, formerEffectivePhase: "checkpoint_validation_commit", incidentPath: rootPath, incidentSha256: incidentHash, predecessorBytesAvailable: false, prEvidenceDigest: "f".repeat(64),
  runtimeSourceSha: "4".repeat(40), installedBundleDigest: "1".repeat(64), installedManifestDigest: "2".repeat(64), runtimeProfileDigest: "3".repeat(64), runtimeApprovalDigest: "4".repeat(64), launcherDigest: "5".repeat(64), healthUnitDigest: "6".repeat(64),
  lifecycleLineage: "terminal_validation_retry_to_distinct_successor", lifecycleSessionId: "session-predecessor", lifecycleMutationGeneration: 2,
  intentPosture: "one_no_effect_overlay_then_consumed_submission", validationEffect: false, reviewEffect: false, sourceEffect: false, pushEffect: false, prEffect: false, commentEffect: false, mergeEffect: false, issueEffect: false, productEffect: false,
  submissionCount: 1, submissionExhausted: true, successorEligible: true, earliestSafePhase: "checkpoint_validation_commit",
});
const runtime = Object.freeze({ sourceSha: claims.runtimeSourceSha, bundleDigest: claims.installedBundleDigest, manifestDigest: claims.installedManifestDigest, profileDigest: claims.runtimeProfileDigest, approvalDigest: claims.runtimeApprovalDigest, launcherDigest: claims.launcherDigest, healthUnitDigest: claims.healthUnitDigest });

function request(overrides = {}) {
  return {
    contract: "settleora_semantic_recovery_native_producer_request", version: 1,
    operation: "install_native_semantic_recovery_producer", repository: claims.repository,
    source: { deploymentEvidenceDocument: "/workspace/auto-runner/config/fixture/deployment-evidence.json", sha256: "7".repeat(64) },
    runtime: structuredClone(runtime), observedAt: "2026-08-03T12:00:00.000Z", expiresAt: "2026-08-03T12:10:00.000Z", ...overrides,
  };
}

function ownedClaims(authorityClass) {
  return Object.fromEntries(Object.entries(semanticRecoveryClaimOwnerMatrix)
    .filter(([, ownership]) => [...ownership.required, ...ownership.optional].includes(authorityClass))
    .map(([claim]) => [claim, structuredClone(claims[claim])]));
}

function planFixture() {
  const reads = [];
  const authorityReaders = Object.fromEntries(semanticRecoveryAuthorityClasses.map((authorityClass) => [authorityClass, (context) => {
    assert.equal(context.authorityClass, authorityClass);
    return { authorityClass, repository: claims.repository, claims: ownedClaims(authorityClass), provenanceIdentity: sha256(`native:${authorityClass}:${context.generation}`) };
  }]));
  const supportFiles = ["tools/auto-runner/semantic-recovery-native-producer.mjs", "tools/auto-runner/lib/semantic-recovery-native-producer.mjs"].map((source) => {
    const bytes = Buffer.from(`support:${source}`);
    return { source, bytes, byteCount: bytes.length, sha256: sha256(bytes), executable: source === "tools/auto-runner/semantic-recovery-native-producer.mjs" };
  });
  const value = planSemanticRecoveryNativeInstall({
    request: request(), authorityReaders,
    readAuthorityContext(authorityClass) { reads.push(authorityClass); return { authorityClass, generation: 1 }; },
    supportFiles, now: new Date("2026-08-03T12:01:00.000Z"),
  });
  assert.deepEqual(reads, semanticRecoveryAuthorityClasses);
  return value;
}

class ProtectedMemoryFilesystem {
  constructor() {
    this.entries = new Map();
    for (const directory of ["/etc", "/etc/settleora-auto-runner", semanticRecoveryProtectedLayout.root]) this.ensureDirectory(directory, { uid: 0, mode: 0o755 });
  }
  exists(target) { return this.entries.has(target); }
  inspect(target) { const value = this.entries.get(target); return value ? { ...value.metadata } : null; }
  realpath(target) { return this.entries.get(target)?.realpath || target; }
  read(target) { const value = this.entries.get(target); if (!value?.bytes) throw new Error("missing file"); return Buffer.from(value.bytes); }
  list(directory) { const prefix = `${directory}/`; return [...this.entries.keys()].filter((entry) => entry.startsWith(prefix) && !entry.slice(prefix.length).includes("/")).map((entry) => entry.slice(prefix.length)).sort(); }
  ensureDirectory(target, { uid = 0, mode = 0o755 } = {}) { if (!this.entries.has(target)) this.entries.set(target, { metadata: { type: "directory", symlink: false, uid, gid: 0, mode, nlink: 2, size: 0, generation: 1 }, realpath: target }); }
  writeExclusive(target, bytes, { uid = 0, mode = 0o444 } = {}) { if (this.exists(target)) throw new Error("exists"); this.entries.set(target, { bytes: Buffer.from(bytes), metadata: { type: "file", symlink: false, uid, gid: 0, mode, nlink: 1, size: bytes.length, generation: 1 }, realpath: target }); }
  fsync() {}
  publishNoClobber(incoming, final) { if (this.exists(final)) throw new Error("exists"); const value = this.entries.get(incoming); this.entries.set(final, { bytes: Buffer.from(value.bytes), metadata: { ...value.metadata }, realpath: final }); this.entries.delete(incoming); }
  installPlan(generated) { for (const directory of generated.plan.directories) this.ensureDirectory(directory.destination, directory); for (const artifact of generated.artifacts) this.writeExclusive(artifact.destination, artifact.bytes || Buffer.from(`support:${artifact.source}`), artifact); }
  mutate(target, fields) { const value = this.entries.get(target); value.metadata = { ...value.metadata, ...fields }; }
  replace(target, document) { const value = this.entries.get(target); value.bytes = Buffer.from(canonicalJson(document)); value.metadata.size = value.bytes.length; value.metadata.generation += 1; }
}

function persistenceFixture() {
  const incidentIdentity = sha256("incident");
  const lifecycleSuccessor = { previousSessionId: claims.lifecycleSessionId, sessionId: "session-successor", mutationGeneration: 3 };
  const core = {
    contract: "settleora_post_incident_semantic_recovery", version: 1, sourceAuthority: "production", incidentIdentity,
    identities: { repository: claims.repository, issueNumber: claims.issueNumber, taskKey: claims.taskKey, claimIdentity: claims.claimIdentity, chargeId: claims.chargeId, branch: claims.branch, baseSha: claims.baseSha, headSha: claims.headSha, treeSha: claims.treeSha, changedFilesDigest: claims.changedFilesDigest, diffDigest: claims.diffDigest },
    claims: structuredClone(claims),
    evidenceSources: semanticRecoveryAuthorityClasses.map((authorityClass) => ({ authorityClass, verifier: semanticRecoveryVerifierSet.verifiers[authorityClass], provenanceIdentity: sha256(`provenance:${authorityClass}`), store: { kind: semanticRecoveryVerifierSet.verifiers[authorityClass].storeKind, path: semanticRecoveryProtectedStorePath(authorityClass), role: `${authorityClass}_authority`, sha256: sha256(`store:${authorityClass}`), byteCount: 100 } })),
    claimOwnerMatrix: { version: semanticRecoveryClaimOwnerMatrixVersion, digest: semanticRecoveryClaimOwnerMatrixDigest }, sourceVerifierSet: { version: semanticRecoveryVerifierSetVersion, digest: semanticRecoveryVerifierSetDigest }, sourceToClaimBindings: {},
    historicalPredecessor: { path: rootPath, sha256: oldHash, bytesAvailable: false }, currentIncident: { path: rootPath, sha256: incidentHash, authority: "immutable_incident_evidence_only" },
    artifacts: [{ role: "current_incident_root", path: rootPath, sha256: incidentHash, authenticated: true, byteCount: 100 }], oneShotExhaustion: { submissionCount: 1, exhausted: true },
    noEffectProof: { validationEffect: false, reviewEffect: false, sourceEffect: false, pushEffect: false, prEffect: false, commentEffect: false, mergeEffect: false, issueEffect: false, productEffect: false },
    lifecycleSuccessor, allowedNextAction: "separately_authorized_successor_create_or_adopt", forbiddenActions: [], diagnostics: { contradictions: [], omissions: [] },
  };
  const manifestDigest = sha256(canonicalJson(core));
  const operation = deriveSemanticRecoveryOperationRequest({ manifestDigest, incidentIdentity, lifecycleSuccessorSession: lifecycleSuccessor.sessionId, lifecycleSuccessorGeneration: lifecycleSuccessor.mutationGeneration });
  const storageKey = sha256(canonicalJson({ manifestDigest, operationId: operation.operationId }));
  const manifest = { ...core, operation: { operationId: operation.operationId, requestId: operation.requestId, action: operation.action }, intendedSuccessor: { storageKey, storagePath: `${semanticRecoveryProtectedLayout.successorsRoot}/${storageKey}.json`, provenancePath: `${semanticRecoveryProtectedLayout.successorProvenanceRoot}/${sha256(canonicalJson({ contract: "post_incident_semantic_successor", incidentIdentity }))}.json`, commitPath: `${semanticRecoveryProtectedLayout.successorCommitsRoot}/${storageKey}.json`, lifecycleSuccessorSession: lifecycleSuccessor.sessionId, operationId: operation.operationId }, manifestDigest };
  const grant = { authorized: true, synthetic: false, sha256: sha256("grant"), operationId: operation.operationId, requestId: operation.requestId, manifestDigest };
  const construction = { ok: true, reasonCode: "post_incident_successor_constructed", storageKey, successor: { task: manifest.identities, phase: "checkpoint_validation_commit", firstIncompleteAction: "reconstruct_and_validate_preserved_candidate", nextSafeAction: "await_separate_execution_authorization", mutationGeneration: 3 } };
  return { manifest, grant, construction };
}

test("native planner emits eight independent fixed protected stores and verifies deterministic readback", () => {
  const before = existsSync(semanticRecoveryProtectedLayout.root);
  const first = planFixture();
  const second = planFixture();
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.plan.sourceDescriptors.length, 8);
  assert.equal(new Set(first.plan.sourceDescriptors.map((entry) => entry.store.sha256)).size, 8);
  assert.equal(first.plan.serviceEffects.length, 0);
  assert.equal(verifySemanticRecoveryNativeInstallPlan(first).ok, true);
  const filesystem = new ProtectedMemoryFilesystem();
  filesystem.installPlan(first);
  assert.equal(verifyInstalledSemanticRecoveryNativeProducer({ plan: first.plan, filesystem }).ok, true);
  for (const descriptor of first.plan.sourceDescriptors) {
    const record = authenticateNativeSemanticRecoveryStore({ authorityClass: descriptor.authorityClass, descriptor, definition: semanticRecoveryVerifierSet.verifiers[descriptor.authorityClass], repository: claims.repository, now: new Date("2026-08-03T12:02:00.000Z"), filesystem });
    assert.deepEqual(record.claims, ownedClaims(descriptor.authorityClass));
  }
  filesystem.mutate(first.plan.files[0].destination, { mode: 0o666 });
  assert.equal(verifyInstalledSemanticRecoveryNativeProducer({ plan: first.plan, filesystem }).reasonCode, "semantic_native_install_readback_drift");
  assert.equal(existsSync(semanticRecoveryProtectedLayout.root), before);
});

test("planner closes request, path, command, environment, expiry and store-independence injection", () => {
  assert.throws(() => normalizeSemanticRecoveryNativeProducerRequest({ ...request(), command: "id" }), /unsupported/u);
  assert.throws(() => normalizeSemanticRecoveryNativeProducerRequest(request({ source: { deploymentEvidenceDocument: "/tmp/deployment-evidence.json", sha256: "7".repeat(64) } })), /invalid/u);
  assert.throws(() => normalizeSemanticRecoveryNativeProducerRequest(request({ operation: "copy_json" })), /invalid/u);
  const deps = planFixture();
  const duplicate = structuredClone(deps.plan);
  duplicate.sourceDescriptors[1].store.sha256 = duplicate.sourceDescriptors[0].store.sha256;
  const { planDigest: ignored, ...core } = duplicate;
  duplicate.planDigest = sha256(canonicalJson(core));
  assert.equal(verifySemanticRecoveryNativeInstallPlan({ plan: duplicate, artifacts: deps.artifacts }).ok, false);
});

test("protected source readers reject descriptor, class, producer, store, metadata and ambiguity drift", () => {
  const generated = planFixture();
  const original = generated.plan.sourceDescriptors[0];
  const authenticate = (filesystem, descriptor = original, now = new Date("2026-08-03T12:02:00.000Z")) => authenticateNativeSemanticRecoveryStore({ authorityClass: original.authorityClass, descriptor, definition: semanticRecoveryVerifierSet.verifiers[original.authorityClass], repository: claims.repository, now, filesystem });
  for (const mutate of [
    (value) => { value.authorityClass = "lifecycle"; },
    (value) => { value.store.path = "/etc/settleora-auto-runner/semantic-recovery-authority/stores/foreign.json"; },
    (value) => { value.store.kind = "foreign"; },
    (value) => { value.store.role = "foreign"; },
    (value) => { value.store.sha256 = "0".repeat(64); },
  ]) {
    const filesystem = new ProtectedMemoryFilesystem(); filesystem.installPlan(generated);
    const descriptor = structuredClone(original); mutate(descriptor);
    assert.throws(() => authenticate(filesystem, descriptor));
  }
  for (const fields of [{ uid: 1000 }, { gid: 1000 }, { mode: 0o644 }, { nlink: 2 }, { symlink: true }]) {
    const filesystem = new ProtectedMemoryFilesystem(); filesystem.installPlan(generated); filesystem.mutate(original.store.path, fields);
    assert.throws(() => authenticate(filesystem));
  }
  const stale = new ProtectedMemoryFilesystem(); stale.installPlan(generated);
  assert.throws(() => authenticate(stale, original, new Date("2026-08-03T12:11:00.000Z")), /stale/u);
  const ambiguous = new ProtectedMemoryFilesystem(); ambiguous.installPlan(generated); ambiguous.writeExclusive(`${semanticRecoveryProtectedLayout.storesRoot}/extra.json`, Buffer.from("{}"), { uid: 0, mode: 0o444 });
  assert.throws(() => authenticate(ambiguous), /ambiguous/u);
  const copied = new ProtectedMemoryFilesystem(); copied.installPlan(generated);
  const second = generated.plan.sourceDescriptors[1];
  const bytes = copied.read(original.store.path); copied.entries.delete(second.store.path); copied.writeExclusive(second.store.path, bytes, { uid: 0, mode: 0o444 });
  const relabelled = structuredClone(second); relabelled.store.sha256 = sha256(bytes);
  assert.throws(() => authenticateNativeSemanticRecoveryStore({ authorityClass: second.authorityClass, descriptor: relabelled, definition: semanticRecoveryVerifierSet.verifiers[second.authorityClass], repository: claims.repository, now: new Date("2026-08-03T12:02:00.000Z"), filesystem: copied }));
});

test("grant plan preserves one exact fixed-path read-only operation and excludes execution", () => {
  const { manifest } = persistenceFixture();
  const generated = planSemanticRecoveryGrant({ manifest });
  assert.equal(generated.plan.effect.destination, `${semanticRecoveryProtectedLayout.grantsRoot}/${manifest.operation.operationId}.json`);
  assert.equal(generated.plan.effect.mode, 0o444);
  assert.equal(generated.plan.successorExecutionIncluded, false);
  assert.equal(verifySemanticRecoveryGrantPlan(generated).ok, true);
  const wrong = structuredClone(generated.plan); wrong.effect.destination = "/tmp/grant.json";
  assert.equal(verifySemanticRecoveryGrantPlan({ plan: wrong, artifact: generated.artifact }).ok, false);
  const forged = structuredClone(manifest); forged.claims.taskKey = "foreign";
  assert.throws(() => planSemanticRecoveryGrant({ manifest: forged }), /digest/u);
});

test("protected persistence reauthenticates, publishes once, adopts exact bytes, and never authorizes continuation", () => {
  const fixture = persistenceFixture();
  const filesystem = new ProtectedMemoryFilesystem();
  let reads = 0;
  const reauthenticate = () => { reads += 1; return { ok: true, manifestDigest: fixture.manifest.manifestDigest, grantSha256: fixture.grant.sha256, operationId: fixture.manifest.operation.operationId }; };
  const created = persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, effectiveUid: 1000, reauthenticate });
  assert.equal(created.reasonCode, "semantic_recovery_successor_created");
  assert.equal(created.authorizedToContinue, false);
  const expected = expectedPersistenceRecords(fixture.manifest, fixture.grant, fixture.construction);
  const bytes = filesystem.read(expected.paths.storagePath);
  const adopted = persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, effectiveUid: 1000, reauthenticate });
  assert.equal(adopted.reasonCode, "semantic_recovery_successor_adopted");
  assert.deepEqual(filesystem.read(expected.paths.storagePath), bytes);
  assert.equal(reads, 2);
  assert.equal(readbackProtectedSemanticRecoverySuccessor({ ...fixture, filesystem }).ok, true);
});

test("protected persistence recovers exact crash windows and rejects conflicts, synthetic grants and drift", () => {
  for (const crashAfter of ["provenance", "successor", "commit"]) {
    const fixture = persistenceFixture();
    const filesystem = new ProtectedMemoryFilesystem();
    const authority = () => ({ ok: true, manifestDigest: fixture.manifest.manifestDigest, grantSha256: fixture.grant.sha256, operationId: fixture.manifest.operation.operationId });
    assert.equal(persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, reauthenticate: authority, crashAfter }).reasonCode, "semantic_native_persistence_interrupted");
    const recovered = persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, reauthenticate: authority });
    assert.equal(recovered.ok, true, crashAfter);
  }
  const fixture = persistenceFixture();
  const synthetic = { ...fixture.grant, synthetic: true };
  assert.equal(persistExactSemanticRecoverySuccessorFromNativeProducer({ manifest: fixture.manifest, grant: synthetic, construction: fixture.construction, filesystem: new ProtectedMemoryFilesystem(), reauthenticate: () => ({ ok: true }) }).reasonCode, "semantic_native_persistence_identity_invalid");
  const drift = persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem: new ProtectedMemoryFilesystem(), reauthenticate: () => ({ ok: true, manifestDigest: "0".repeat(64), grantSha256: fixture.grant.sha256, operationId: fixture.manifest.operation.operationId }) });
  assert.equal(drift.reasonCode, "semantic_native_persistence_authority_drift");
  const filesystem = new ProtectedMemoryFilesystem();
  const authority = () => ({ ok: true, manifestDigest: fixture.manifest.manifestDigest, grantSha256: fixture.grant.sha256, operationId: fixture.manifest.operation.operationId });
  assert.equal(persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, reauthenticate: authority }).ok, true);
  const expected = expectedPersistenceRecords(fixture.manifest, fixture.grant, fixture.construction);
  filesystem.replace(expected.paths.storagePath, { conflict: true });
  assert.equal(readbackProtectedSemanticRecoverySuccessor({ ...fixture, filesystem }).reasonCode, "semantic_successor_readback_conflict");
  filesystem.mutate(expected.paths.storagePath, { nlink: 2 });
  assert.equal(readbackProtectedSemanticRecoverySuccessor({ ...fixture, filesystem }).reasonCode, "semantic_successor_readback_authentication_failed");
});

test("claim-owner disagreement remains authoritative", () => {
  const projections = semanticRecoveryAuthorityClasses.map((authorityClass) => ({ authorityClass, claims: ownedClaims(authorityClass) }));
  projections.find((entry) => entry.authorityClass === "github_no_effect").claims.repository = "foreign/repo";
  assert.equal(applySemanticRecoveryClaimOwnerMatrix(projections).reasonCode, "semantic_claim_required_owner_disagreement");
});
