import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertSourceProcessIdentity, createSemanticRecoveryReadOnlyFilesystem, parseSemanticRecoverySourceProcessResponse, readSemanticRecoverySupportFilesFromGit, semanticRecoveryPlanExecutionRoute } from "../semantic-recovery-native-producer.mjs";
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
  authenticateSemanticRecoveryGithubNoEffectSnapshot,
  authenticateNativeSemanticRecoveryStore,
  expectedPersistenceRecords,
  persistExactSemanticRecoverySuccessorFromNativeProducer,
  readbackProtectedSemanticRecoverySuccessor,
  semanticRecoveryProtectedLayout,
  semanticRecoveryProtectedStorePath,
} from "../lib/semantic-recovery-protected-store.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const gitBlobSha1 = (value) => createHash("sha1").update(Buffer.from(`blob ${value.length}\0`)).update(value).digest("hex");
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
  const supportFiles = [
    "tools/auto-runner/semantic-recovery-native-producer.mjs",
    "tools/auto-runner/lib/semantic-recovery-native-producer.mjs",
    "tools/auto-runner/lib/required-dependency.mjs",
  ].map((source) => {
    const bytes = Buffer.from(source === "tools/auto-runner/semantic-recovery-native-producer.mjs"
      ? 'import "./lib/semantic-recovery-native-producer.mjs";'
      : source.endsWith("semantic-recovery-native-producer.mjs") ? 'import "./required-dependency.mjs";'
        : "export {};");
    return { source, bytes, byteCount: bytes.length, sha256: sha256(bytes), executable: source === "tools/auto-runner/semantic-recovery-native-producer.mjs" };
  });
  const value = planSemanticRecoveryNativeInstall({
    request: request(), authorityReaders,
    readAuthorityContext(authorityClass) { reads.push(authorityClass); return { authorityClass, generation: 1 }; },
    producerSourceSha: "8".repeat(40),
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
  const snapshotCore = {
    contract: "settleora_semantic_recovery_github_no_effect_snapshot", version: 1,
    repository: manifest.claims.repository, issueNumber: manifest.claims.issueNumber, branch: manifest.claims.branch,
    operationId: operation.operationId, requestId: operation.requestId, manifestDigest,
    evidenceDigest: manifest.claims.prEvidenceDigest,
    effectClaims: { pushEffect: false, prEffect: false, commentEffect: false, mergeEffect: false, issueEffect: false, productEffect: false },
    observedAt: "2026-08-03T10:00:00.000Z", expiresAt: "2026-08-03T10:00:30.000Z",
  };
  const githubNoEffectSnapshot = { ...snapshotCore, snapshotDigest: sha256(canonicalJson(snapshotCore)) };
  const clock = () => new Date("2026-08-03T10:00:01.000Z");
  return { manifest, grant, construction, githubNoEffectSnapshot, clock };
}

function persistenceAuthority(fixture, overrides = {}) {
  return {
    ok: true,
    manifestDigest: fixture.manifest.manifestDigest,
    grantSha256: fixture.grant.sha256,
    operationId: fixture.manifest.operation.operationId,
    githubNoEffectSnapshot: fixture.githubNoEffectSnapshot,
    ...overrides,
  };
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
  const incomplete = first.artifacts.map((artifact, index) => index === 0 ? { ...artifact, bytes: undefined } : artifact);
  assert.equal(verifySemanticRecoveryNativeInstallPlan({ plan: first.plan, artifacts: incomplete }).ok, false);
  const filesystem = new ProtectedMemoryFilesystem();
  filesystem.installPlan(first);
  assert.equal(verifyInstalledSemanticRecoveryNativeProducer({ plan: first.plan, filesystem }).ok, true);
  for (const descriptor of first.plan.sourceDescriptors) {
    const record = authenticateNativeSemanticRecoveryStore({ authorityClass: descriptor.authorityClass, descriptor, definition: semanticRecoveryVerifierSet.verifiers[descriptor.authorityClass], repository: claims.repository, now: new Date("2026-08-03T12:02:00.000Z"), filesystem });
    assert.deepEqual(record.claims, ownedClaims(descriptor.authorityClass));
  }
  filesystem.mutate(first.plan.files[0].destination, { mode: 0o666 });
  assert.equal(verifyInstalledSemanticRecoveryNativeProducer({ plan: first.plan, filesystem }).reasonCode, "semantic_native_install_readback_drift");
  const extra = new ProtectedMemoryFilesystem(); extra.installPlan(first); extra.writeExclusive(`${semanticRecoveryProtectedLayout.producerRoot}/extra.mjs`, Buffer.from("export {};"), { uid: 0, mode: 0o444 });
  assert.equal(verifyInstalledSemanticRecoveryNativeProducer({ plan: first.plan, filesystem: extra }).reasonCode, "semantic_native_install_readback_drift");
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
  for (const select of [
    (entry) => entry.kind === "producer_policy",
    (entry) => entry.destination === semanticRecoveryProtectedLayout.producerExecutable,
  ]) {
    const omitted = structuredClone(deps);
    const removed = omitted.plan.files.find(select);
    omitted.plan.files = omitted.plan.files.filter((entry) => entry !== removed);
    omitted.artifacts = omitted.artifacts.filter((entry) => entry.destination !== removed.destination);
    const { planDigest: staleDigest, ...omittedCore } = omitted.plan;
    omitted.plan.planDigest = sha256(canonicalJson(omittedCore));
    assert.equal(verifySemanticRecoveryNativeInstallPlan(omitted).ok, false);
  }
  const unboundBundle = structuredClone(deps);
  unboundBundle.plan.producerBundleDigest = "0".repeat(64);
  const { planDigest: staleBundleDigest, ...unboundBundleCore } = unboundBundle.plan;
  unboundBundle.plan.planDigest = sha256(canonicalJson(unboundBundleCore));
  assert.equal(verifySemanticRecoveryNativeInstallPlan(unboundBundle).ok, false);
  const omittedTransitive = rederiveOmittedTransitivePlan(deps);
  assert.equal(verifySemanticRecoveryNativeInstallPlan(omittedTransitive).ok, false);
  const omittedInstalled = new ProtectedMemoryFilesystem();
  omittedInstalled.installPlan(omittedTransitive);
  assert.equal(verifyInstalledSemanticRecoveryNativeProducer({ plan: omittedTransitive.plan, filesystem: omittedInstalled }).ok, false);
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
  const traversal = structuredClone(generated);
  traversal.plan.operationId = "../../producer/overwritten-policy";
  traversal.plan.effect.destination = `${semanticRecoveryProtectedLayout.grantsRoot}/${traversal.plan.operationId}.json`;
  traversal.artifact.bytes = Buffer.from("attacker bytes");
  traversal.artifact.byteCount = traversal.artifact.bytes.length;
  traversal.artifact.sha256 = sha256(traversal.artifact.bytes);
  traversal.plan.effect = { ...traversal.plan.effect, ...Object.fromEntries(Object.entries(traversal.artifact).filter(([key]) => key !== "bytes")) };
  const { planDigest: staleTraversalDigest, ...traversalCore } = traversal.plan;
  traversal.plan.planDigest = sha256(canonicalJson(traversalCore));
  assert.equal(verifySemanticRecoveryGrantPlan(traversal).ok, false);
  const metadataDrift = { plan: structuredClone(generated.plan), artifact: { ...generated.artifact, bytes: Buffer.from(generated.artifact.bytes) } };
  metadataDrift.artifact.uid = 1000;
  assert.equal(verifySemanticRecoveryGrantPlan(metadataDrift).ok, false);
  const extraField = { plan: structuredClone(generated.plan), artifact: { ...generated.artifact, bytes: Buffer.from(generated.artifact.bytes) } };
  extraField.plan.command = "install-anything";
  const { planDigest: staleExtraDigest, ...extraCore } = extraField.plan;
  extraField.plan.planDigest = sha256(canonicalJson(extraCore));
  assert.equal(verifySemanticRecoveryGrantPlan(extraField).ok, false);
  const forged = structuredClone(manifest); forged.claims.taskKey = "foreign";
  assert.throws(() => planSemanticRecoveryGrant({ manifest: forged }), /digest/u);
});

test("production grant planning is closed behind installed readback and manifest derivation", () => {
  const source = readFileSync(new URL("../semantic-recovery-native-producer.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source.slice(0, source.indexOf("export async function main")), /realpathSync\("\/workspace\/repos\/Settleora"\)/u);
  const planner = source.slice(source.indexOf("function planGrantFromInstalled"), source.indexOf("function verifyInstalled"));
  assert.match(planner, /assertExactKeys\(value, \["installPackage", "operationId", "semanticEvidencePacket"\]\)/u);
  assert.match(planner, /assertInstalledProducerInvocation\(\)/u);
  assert.match(planner, /verifySemanticRecoveryNativeInstallPlan\(decoded\)[\s\S]*verifyInstalledSemanticRecoveryNativeProducer/u);
  assert.match(planner, /runSourceProcess\(trustedSourceIdentity\(\), sourceGrantPlanMode/u);
  assert.match(planner, /corroboration\.manifest\.operation\?\.operationId !== value\.operationId/u);
  assert.equal((planner.match(/verifyInstalledSemanticRecoveryNativeProducer/g) || []).length, 2);
  assert.doesNotMatch(planner, /buildSemanticRecoveryManifest/u);
  assert.doesNotMatch(planner, /planSemanticRecoveryGrant\(value\)/u);
  const child = source.slice(source.indexOf("function executeSourceGrantPlan"), source.indexOf("function productionRecoveryConfig"));
  assert.match(child, /assertInstalledProducerInvocation\(\{ rootRequired: false \}\)/u);
  assert.match(child, /assertSourceProcessIdentity\(sourceIdentity\)/u);
  assert.match(child, /buildSemanticRecoveryManifest\(value\.semanticEvidencePacket/u);
  assert.match(child, /reauthenticateSemanticRecoveryGithubNoEffect/u);
  const manifest = persistenceFixture().manifest;
  const response = { ok: true, reasonCode: "semantic_evidence_corroborated", manifest, manifestDigest: manifest.manifestDigest };
  assert.deepEqual(parseSemanticRecoverySourceProcessResponse("--derive-grant-manifest-internal", canonicalJson(response)), response);
  assert.throws(() => parseSemanticRecoverySourceProcessResponse("--derive-grant-manifest-internal", canonicalJson({ ...response, command: "id" })), /unsupported/u);
});

test("protected persistence reauthenticates, publishes once, adopts exact bytes, and never authorizes continuation", () => {
  const fixture = persistenceFixture();
  const filesystem = new ProtectedMemoryFilesystem();
  let reads = 0;
  const reauthenticate = () => { reads += 1; return persistenceAuthority(fixture); };
  const created = persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, effectiveUid: 1000, reauthenticate });
  assert.equal(created.reasonCode, "semantic_recovery_successor_created");
  assert.equal(created.authorizedToContinue, false);
  const expected = expectedPersistenceRecords(fixture.manifest, fixture.grant, fixture.construction, fixture.githubNoEffectSnapshot);
  const bytes = filesystem.read(expected.paths.storagePath);
  const adopted = persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, effectiveUid: 1000, reauthenticate });
  assert.equal(adopted.reasonCode, "semantic_recovery_successor_adopted");
  assert.deepEqual(filesystem.read(expected.paths.storagePath), bytes);
  const renewedSnapshotCore = {
    ...fixture.githubNoEffectSnapshot,
    observedAt: "2026-08-03T10:01:00.000Z",
    expiresAt: "2026-08-03T10:01:30.000Z",
  };
  delete renewedSnapshotCore.snapshotDigest;
  const renewedSnapshot = { ...renewedSnapshotCore, snapshotDigest: sha256(canonicalJson(renewedSnapshotCore)) };
  const adoptedAfterHistoricalSnapshotExpiry = persistExactSemanticRecoverySuccessorFromNativeProducer({
    ...fixture,
    filesystem,
    effectiveUid: 1000,
    clock: () => new Date("2026-08-03T10:01:01.000Z"),
    reauthenticate: () => { reads += 1; return persistenceAuthority(fixture, { githubNoEffectSnapshot: renewedSnapshot }); },
  });
  assert.equal(adoptedAfterHistoricalSnapshotExpiry.reasonCode, "semantic_recovery_successor_adopted");
  assert.equal(adoptedAfterHistoricalSnapshotExpiry.githubNoEffectSnapshotDigest, fixture.githubNoEffectSnapshot.snapshotDigest);
  assert.equal(reads, 3);
  assert.equal(readbackProtectedSemanticRecoverySuccessor({ ...fixture, filesystem }).ok, true);
});

test("protected persistence recovers exact crash windows and rejects conflicts, synthetic grants and drift", () => {
  for (const crashAfter of ["provenance", "successor", "commit"]) {
    const fixture = persistenceFixture();
    const filesystem = new ProtectedMemoryFilesystem();
    const authority = () => persistenceAuthority(fixture);
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
  const authority = () => persistenceAuthority(fixture);
  assert.equal(persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, reauthenticate: authority }).ok, true);
  const expected = expectedPersistenceRecords(fixture.manifest, fixture.grant, fixture.construction, fixture.githubNoEffectSnapshot);
  filesystem.replace(expected.paths.storagePath, { conflict: true });
  assert.equal(readbackProtectedSemanticRecoverySuccessor({ ...fixture, filesystem }).reasonCode, "semantic_successor_readback_conflict");
  filesystem.mutate(expected.paths.storagePath, { nlink: 2 });
  assert.equal(readbackProtectedSemanticRecoverySuccessor({ ...fixture, filesystem }).reasonCode, "semantic_successor_readback_authentication_failed");
  filesystem.mutate(expected.paths.storagePath, { nlink: 1 });
  filesystem.writeExclusive(`${semanticRecoveryProtectedLayout.successorsRoot}/${expected.storageKey}.duplicate`, filesystem.read(expected.paths.storagePath), { uid: 0, mode: 0o444 });
  assert.equal(readbackProtectedSemanticRecoverySuccessor({ ...fixture, filesystem }).reasonCode, "semantic_successor_readback_duplicate");
});

test("protected persistence binds one fresh exact-operation GitHub snapshot through commit publication", () => {
  const fixture = persistenceFixture();
  const filesystem = new ProtectedMemoryFilesystem();
  assert.equal(authenticateSemanticRecoveryGithubNoEffectSnapshot(fixture.githubNoEffectSnapshot, fixture.manifest, { now: fixture.clock() }), true);
  const stable = () => persistenceAuthority(fixture);
  const created = persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, reauthenticate: stable });
  assert.equal(created.ok, true);
  const expected = expectedPersistenceRecords(fixture.manifest, fixture.grant, fixture.construction, fixture.githubNoEffectSnapshot);
  assert.equal(expected.provenance.githubNoEffectSnapshot.snapshotDigest, fixture.githubNoEffectSnapshot.snapshotDigest);
  assert.equal(expected.commit.githubNoEffectSnapshotDigest, fixture.githubNoEffectSnapshot.snapshotDigest);
  for (const mutate of [
    (snapshot) => { snapshot.operationId = "0".repeat(64); },
    (snapshot) => { snapshot.requestId = "0".repeat(64); },
    (snapshot) => { snapshot.effectClaims.commentEffect = true; },
    (snapshot) => { snapshot.snapshotDigest = "0".repeat(64); },
    (snapshot) => { snapshot.expiresAt = "2026-08-03T10:01:00.000Z"; },
  ]) {
    const snapshot = structuredClone(fixture.githubNoEffectSnapshot);
    mutate(snapshot);
    assert.throws(() => authenticateSemanticRecoveryGithubNoEffectSnapshot(snapshot, fixture.manifest, { now: fixture.clock() }), /snapshot invalid/u);
  }
  const expired = new ProtectedMemoryFilesystem();
  const lateClock = () => new Date("2026-08-03T10:00:30.000Z");
  assert.equal(persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem: expired, reauthenticate: stable, clock: lateClock }).reasonCode, "semantic_native_persistence_github_snapshot_invalid");
  const commitExpiry = new ProtectedMemoryFilesystem();
  let ticks = 0;
  const expiringClock = () => new Date(ticks++ < 2 ? "2026-08-03T10:00:29.000Z" : "2026-08-03T10:00:30.000Z");
  assert.equal(persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem: commitExpiry, reauthenticate: stable, clock: expiringClock }).reasonCode, "semantic_native_persistence_github_snapshot_expired_before_commit");
  assert.equal(readbackProtectedSemanticRecoverySuccessor({ ...fixture, filesystem: commitExpiry }).reasonCode, "semantic_successor_readback_partial");
});

test("a commit marker with either predecessor missing is torn and never backfilled", () => {
  for (const missing of ["storagePath", "provenancePath"]) {
    const fixture = persistenceFixture();
    const filesystem = new ProtectedMemoryFilesystem();
    const authority = () => persistenceAuthority(fixture);
    assert.equal(persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, reauthenticate: authority }).ok, true);
    const expected = expectedPersistenceRecords(fixture.manifest, fixture.grant, fixture.construction, fixture.githubNoEffectSnapshot);
    filesystem.entries.delete(expected.paths[missing]);
    assert.equal(readbackProtectedSemanticRecoverySuccessor({ ...fixture, filesystem }).reasonCode, "semantic_successor_readback_torn_commit");
    assert.equal(persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, reauthenticate: authority }).reasonCode, "semantic_successor_readback_torn_commit");
    assert.equal(filesystem.exists(expected.paths[missing]), false);
  }
});

test("out-of-order successor residue is never rebound to a later GitHub snapshot", () => {
  const fixture = persistenceFixture();
  const filesystem = new ProtectedMemoryFilesystem();
  const authority = () => persistenceAuthority(fixture);
  assert.equal(persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, reauthenticate: authority }).ok, true);
  const expected = expectedPersistenceRecords(fixture.manifest, fixture.grant, fixture.construction, fixture.githubNoEffectSnapshot);
  filesystem.entries.delete(expected.paths.provenancePath);
  filesystem.entries.delete(expected.paths.commitPath);
  assert.equal(
    persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem, reauthenticate: authority }).reasonCode,
    "semantic_successor_readback_publication_order_conflict",
  );
  assert.equal(filesystem.exists(expected.paths.provenancePath), false);
  assert.equal(filesystem.exists(expected.paths.commitPath), false);

  const incomingOnly = new ProtectedMemoryFilesystem();
  incomingOnly.ensureDirectory(semanticRecoveryProtectedLayout.successorsRoot, { uid: 0, mode: 0o755 });
  incomingOnly.ensureDirectory(semanticRecoveryProtectedLayout.successorIncomingRoot, { uid: 0, mode: 0o755 });
  const incomingPath = `${semanticRecoveryProtectedLayout.successorIncomingRoot}/${path.posix.basename(expected.paths.storagePath)}.${sha256(expected.paths.storagePath).slice(0, 16)}.incoming`;
  incomingOnly.writeExclusive(incomingPath, Buffer.from(canonicalJson(expected.successor)), { uid: 0, mode: 0o444 });
  assert.equal(
    persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem: incomingOnly, reauthenticate: authority }).reasonCode,
    "semantic_successor_readback_publication_order_conflict",
  );
  assert.equal(incomingOnly.exists(incomingPath), true);

  const allIncoming = new ProtectedMemoryFilesystem();
  allIncoming.ensureDirectory(semanticRecoveryProtectedLayout.successorsRoot, { uid: 0, mode: 0o755 });
  allIncoming.ensureDirectory(semanticRecoveryProtectedLayout.successorIncomingRoot, { uid: 0, mode: 0o755 });
  allIncoming.ensureDirectory(semanticRecoveryProtectedLayout.successorProvenanceRoot, { uid: 0, mode: 0o755 });
  allIncoming.ensureDirectory(semanticRecoveryProtectedLayout.successorCommitsRoot, { uid: 0, mode: 0o755 });
  const allIncomingPaths = [
    [expected.paths.provenancePath, expected.provenance],
    [expected.paths.storagePath, expected.successor],
    [expected.paths.commitPath, expected.commit],
  ].map(([finalPath, document]) => {
    const incoming = `${semanticRecoveryProtectedLayout.successorIncomingRoot}/${path.posix.basename(finalPath)}.${sha256(finalPath).slice(0, 16)}.incoming`;
    allIncoming.writeExclusive(incoming, Buffer.from(canonicalJson(document)), { uid: 0, mode: 0o444 });
    return incoming;
  });
  assert.equal(
    persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem: allIncoming, reauthenticate: authority }).reasonCode,
    "semantic_native_persistence_publication_residue_conflict",
  );
  assert.equal(allIncomingPaths.every((incoming) => allIncoming.exists(incoming)), true);

  const successorHardlinkShapeWithoutProvenance = new ProtectedMemoryFilesystem();
  successorHardlinkShapeWithoutProvenance.ensureDirectory(semanticRecoveryProtectedLayout.successorsRoot, { uid: 0, mode: 0o755 });
  successorHardlinkShapeWithoutProvenance.ensureDirectory(semanticRecoveryProtectedLayout.successorIncomingRoot, { uid: 0, mode: 0o755 });
  successorHardlinkShapeWithoutProvenance.ensureDirectory(semanticRecoveryProtectedLayout.successorProvenanceRoot, { uid: 0, mode: 0o755 });
  successorHardlinkShapeWithoutProvenance.ensureDirectory(semanticRecoveryProtectedLayout.successorCommitsRoot, { uid: 0, mode: 0o755 });
  const successorIncoming = `${semanticRecoveryProtectedLayout.successorIncomingRoot}/${path.posix.basename(expected.paths.storagePath)}.${sha256(expected.paths.storagePath).slice(0, 16)}.incoming`;
  const successorBytes = Buffer.from(canonicalJson(expected.successor));
  successorHardlinkShapeWithoutProvenance.writeExclusive(expected.paths.storagePath, successorBytes, { uid: 0, mode: 0o444 });
  successorHardlinkShapeWithoutProvenance.writeExclusive(successorIncoming, successorBytes, { uid: 0, mode: 0o444 });
  assert.equal(
    persistExactSemanticRecoverySuccessorFromNativeProducer({ ...fixture, filesystem: successorHardlinkShapeWithoutProvenance, reauthenticate: authority }).reasonCode,
    "semantic_successor_readback_publication_order_conflict",
  );
  assert.equal(successorHardlinkShapeWithoutProvenance.exists(expected.paths.storagePath), true);
  assert.equal(successorHardlinkShapeWithoutProvenance.exists(successorIncoming), true);
});

test("installed producer bundle, fixed runtime and real source identity close the privilege boundary", () => {
  const source = readFileSync(new URL("../semantic-recovery-native-producer.mjs", import.meta.url), "utf8");
  const persistence = readFileSync(new URL("../lib/semantic-recovery-protected-store.mjs", import.meta.url), "utf8");
  assert.match(source, /readSemanticRecoverySupportFilesFromGit\(\{[\s\S]*repository: producerSourceContext\.repository,[\s\S]*producerSourceSha/u);
  assert.match(source, /git\/commits\/\$\{producerSourceSha\}/u);
  assert.match(source, /git\/trees\/\$\{commit\.tree\.sha\}\?recursive=1/u);
  assert.match(source, /gitObjectSha1\("blob", bytes\) !== entry\.sha/u);
  assert.doesNotMatch(source, /readSemanticRecoverySupportFiles\(repositoryRoot/u);
  assert.match(source, /--persist-successor/u);
  assert.match(source, /assertInstalledProducerInvocation\(\)/u);
  assert.equal(source.startsWith("#!/usr/bin/node\n"), true);
  assert.doesNotMatch(source, /#!\/usr\/bin\/env/u);
  assert.match(source, /spawnSync\(fixedNodeRuntimePath/u);
  assert.match(source, /uid: sourceIdentity\.uid/u);
  assert.equal(assertSourceProcessIdentity({ uid: 1000, gid: 1000 }, { realUid: 1000, effectiveUid: 1000, realGid: 1000, effectiveGid: 1000 }), true);
  assert.throws(() => assertSourceProcessIdentity({ uid: 1000, gid: 1000 }, { realUid: 0, effectiveUid: 1000, realGid: 0, effectiveGid: 1000 }), /identity mismatch/u);
  assert.throws(() => assertSourceProcessIdentity({ uid: 1000, gid: 1000 }, { realUid: 1000, effectiveUid: 1000, realGid: 0, effectiveGid: 1000 }), /identity mismatch/u);
  assert.equal(semanticRecoveryPlanExecutionRoute({ realUid: 1000, effectiveUid: 1000, invocationPath: "/workspace/repository/producer.mjs" }), "unprivileged_source_process");
  assert.equal(semanticRecoveryPlanExecutionRoute({ realUid: 0, effectiveUid: 0, invocationPath: semanticRecoveryProtectedLayout.producerExecutable }), "installed_root_source_subprocess");
  assert.throws(() => semanticRecoveryPlanExecutionRoute({ realUid: 0, effectiveUid: 0, invocationPath: "/workspace/repository/producer.mjs" }), /requires installed producer/u);
  assert.throws(() => semanticRecoveryPlanExecutionRoute({ realUid: 0, effectiveUid: 1000, invocationPath: semanticRecoveryProtectedLayout.producerExecutable }), /requires installed producer/u);
  assert.match(source, /normalizeSemanticRecoveryNativeProducerRequest\(request\)[\s\S]*?authenticateSemanticDeploymentEvidencePackage/u);
  const generated = planFixture();
  const encodedPlan = { plan: generated.plan, artifacts: generated.artifacts.map(({ bytes, ...artifact }) => ({ ...artifact, bytesBase64: bytes.toString("base64") })) };
  assert.deepEqual(parseSemanticRecoverySourceProcessResponse("--plan-install-internal", canonicalJson(encodedPlan)), encodedPlan);
  assert.deepEqual(parseSemanticRecoverySourceProcessResponse("--authenticate-successor-internal", canonicalJson({ authentication: { ok: false }, construction: null, githubNoEffectSnapshot: null })), { authentication: { ok: false }, construction: null, githubNoEffectSnapshot: null });
  assert.throws(() => parseSemanticRecoverySourceProcessResponse("--plan-install-internal", canonicalJson({ authentication: {}, construction: null })), /unsupported/u);
  assert.match(persistence, /const initialReadback = readbackProtectedSemanticRecoverySuccessor[\s\S]*?semantic_successor_readback_authentication_failed[\s\S]*?expected = expectedPersistenceRecords[\s\S]*?recoverExactInterruptedPublicationSet\(expected\)[\s\S]*?const recoveredReadback = readbackProtectedSemanticRecoverySuccessor/u);
  assert.match(persistence, /finalPresent && incomingPresent[\s\S]*?authenticateExactInterruptedHardLink\(incomingPath, finalPath\)/u);
  assert.match(persistence, /authenticateExactInterruptedHardLink\(incomingPath, finalPath\);\s*if \(!authenticated\.bytes\.equals\(expectedBytes\)\)/u);
  assert.match(persistence, /opened\.dev !== incoming\.dev[\s\S]*?incoming\.ino !== final\.ino[\s\S]*?opened\.nlink !== 2/u);
  assert.match(persistence, /linkSync\(incomingPath, finalPath\);\s*fsyncDirectory\(path\.posix\.dirname\(finalPath\)\);\s*unlinkSync\(incomingPath\);\s*fsyncDirectory\(path\.posix\.dirname\(incomingPath\)\)/u);
  assert.match(persistence, /authenticated\.bytes\.equals\(expectedBytes\)[\s\S]*?fsyncDirectory\(path\.posix\.dirname\(finalPath\)\);\s*unlinkSync\(incomingPath\);\s*fsyncDirectory\(path\.posix\.dirname\(incomingPath\)\)/u);
  assert.match(persistence, /assertExactInterruptedPublicationState\(expected\);[\s\S]*?recoverExactInterruptedHardLink/u);
  assert.match(persistence, /contiguous[\s\S]*?prefix[\s\S]*?one in-flight/u);
});

test("producer support bytes come from authenticated GitHub blobs with recomputed object identities", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-semantic-producer-git-"));
  try {
    const producerSourceSha = "a".repeat(40);
    const treeSha = "b".repeat(40);
    const sourceBytes = Buffer.from('import "./lib/support.mjs";\nexport const committed = true;\n');
    const supportBytes = Buffer.from("export const support = true;\n");
    const sourceSha = gitBlobSha1(sourceBytes);
    const supportSha = gitBlobSha1(supportBytes);
    const blobs = new Map([[sourceSha, sourceBytes], [supportSha, supportBytes]]);
    const command = (_executable, args) => {
      const route = args[1];
      if (route.endsWith(`/git/commits/${producerSourceSha}`)) return JSON.stringify({ sha: producerSourceSha, tree: { sha: treeSha } });
      if (route.endsWith(`/git/trees/${treeSha}?recursive=1`)) return JSON.stringify({
        sha: treeSha, truncated: false, tree: [
          { path: "tools/auto-runner/semantic-recovery-native-producer.mjs", mode: "100755", type: "blob", sha: sourceSha, size: sourceBytes.length },
          { path: "tools/auto-runner/lib/support.mjs", mode: "100644", type: "blob", sha: supportSha, size: supportBytes.length },
        ],
      });
      const oid = route.split("/").at(-1);
      const bytes = blobs.get(oid);
      return JSON.stringify({ sha: oid, size: bytes.length, encoding: "base64", content: bytes.toString("base64") });
    };
    const files = readSemanticRecoverySupportFilesFromGit({ repositoryRoot: root, repository: "example/repo", producerSourceSha, command });
    const executable = files.find((entry) => entry.source === "tools/auto-runner/semantic-recovery-native-producer.mjs");
    assert.deepEqual(executable.bytes, sourceBytes);
    const forged = (_executable, args) => {
      const value = JSON.parse(command(_executable, args));
      if (args[1].endsWith(`/git/blobs/${sourceSha}`)) {
        const attackerBytes = Buffer.from(sourceBytes);
        attackerBytes[attackerBytes.length - 2] ^= 1;
        return JSON.stringify({ ...value, content: attackerBytes.toString("base64") });
      }
      return JSON.stringify(value);
    };
    assert.throws(() => readSemanticRecoverySupportFilesFromGit({ repositoryRoot: root, repository: "example/repo", producerSourceSha, command: forged }), /blob identity mismatch/u);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("real installed-filesystem adapter exposes stable read-only directory membership", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-semantic-producer-readonly-"));
  try {
    writeFileSync(path.join(root, "member.json"), "{}", { mode: 0o600 });
    const filesystem = createSemanticRecoveryReadOnlyFilesystem();
    assert.deepEqual(filesystem.list(root), ["member.json"]);
    assert.equal(filesystem.inspect(path.join(root, "member.json")).type, "file");
    assert.equal(filesystem.read(path.join(root, "member.json")).toString("utf8"), "{}");
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("claim-owner disagreement remains authoritative", () => {
  const projections = semanticRecoveryAuthorityClasses.map((authorityClass) => ({ authorityClass, claims: ownedClaims(authorityClass) }));
  projections.find((entry) => entry.authorityClass === "github_no_effect").claims.repository = "foreign/repo";
  assert.equal(applySemanticRecoveryClaimOwnerMatrix(projections).reasonCode, "semantic_claim_required_owner_disagreement");
});

function rederiveOmittedTransitivePlan(original) {
  const attacked = structuredClone(original);
  const missingSource = "tools/auto-runner/lib/required-dependency.mjs";
  const missing = attacked.plan.files.find((entry) => entry.source === missingSource);
  attacked.plan.files = attacked.plan.files.filter((entry) => entry.destination !== missing.destination);
  attacked.artifacts = attacked.artifacts.filter((entry) => entry.destination !== missing.destination);
  attacked.plan.producerBundleDigest = sha256(canonicalJson(attacked.plan.files
    .filter((entry) => entry.kind === "producer_runtime")
    .map(({ source, sha256: digest, byteCount }) => ({ source, sha256: digest, byteCount }))
    .sort((left, right) => left.source.localeCompare(right.source))));
  const replaceDocument = (destination, mutate) => {
    const artifact = attacked.artifacts.find((entry) => entry.destination === destination);
    const document = JSON.parse(Buffer.from(artifact.bytes).toString("utf8"));
    mutate(document);
    artifact.bytes = Buffer.from(canonicalJson(document));
    artifact.byteCount = artifact.bytes.length;
    artifact.sha256 = sha256(artifact.bytes);
    const planned = attacked.plan.files.find((entry) => entry.destination === destination);
    planned.byteCount = artifact.byteCount;
    planned.sha256 = artifact.sha256;
  };
  replaceDocument(semanticRecoveryProtectedLayout.producerPolicy, (document) => {
    document.producerBundleDigest = attacked.plan.producerBundleDigest;
  });
  for (const descriptor of attacked.plan.sourceDescriptors) {
    replaceDocument(descriptor.store.path, (document) => {
      document.producer.bundleDigest = attacked.plan.producerBundleDigest;
    });
    descriptor.store.sha256 = attacked.artifacts.find((entry) => entry.destination === descriptor.store.path).sha256;
  }
  const manifestDocument = structuredClone(attacked.plan);
  delete manifestDocument.planDigest;
  manifestDocument.files = manifestDocument.files.filter((entry) => entry.kind !== "install_manifest");
  const { installManifestDigest: staleManifestDigest, ...manifestCore } = manifestDocument;
  attacked.plan.installManifestDigest = sha256(canonicalJson(manifestCore));
  manifestDocument.installManifestDigest = attacked.plan.installManifestDigest;
  replaceDocument(semanticRecoveryProtectedLayout.installManifest, (document) => {
    for (const key of Object.keys(document)) delete document[key];
    Object.assign(document, manifestDocument);
  });
  const { planDigest: stalePlanDigest, ...planCore } = attacked.plan;
  attacked.plan.planDigest = sha256(canonicalJson(planCore));
  return attacked;
}
