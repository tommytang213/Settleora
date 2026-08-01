import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertRecoveryWritePathAllowed,
  authenticatePostIncidentOperationalAuthorization,
  buildSemanticRecoveryManifest,
  classifyRecoveryOverwriteIncident,
  constructPostIncidentSuccessor,
  evaluateSemanticRecoveryPersistenceSet,
  mandatorySemanticEvidenceClasses,
} from "../lib/post-incident-successor-recovery.mjs";
import {
  applySemanticRecoveryClaimOwnerMatrix,
  createDeterministicSemanticRecoveryVerifierRegistry,
  createProductionSemanticRecoveryVerifierRegistry,
  expectedSemanticRecoveryGrantDocument,
  semanticRecoveryClaimOwnerMatrix,
  semanticRecoveryClaimOwnerMatrixDigest,
  semanticRecoveryClaimOwnerMatrixVersion,
  semanticRecoveryGrantPath,
  semanticRecoveryProtectedControlRoot,
  semanticRecoveryVerifierSet,
  semanticRecoveryVerifierSetDigest,
  semanticRecoveryVerifierSetVersion,
} from "../lib/semantic-recovery-authority.mjs";
import { discoverStartupRecovery, executeStartupContinuation } from "../lib/recovery-continuation.mjs";
import { createInitialRecoveryState, recoveryStatePath, writeRecoveryState } from "../lib/recovery-state.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const oldHash = "6".repeat(64);
const incidentHash = "5".repeat(64);
const rootPath = "/sanitized/recovery/root.json";
const baseClaims = Object.freeze({
  repository: "example/repo", issueNumber: 7, taskKey: "task-1", claimIdentity: "example/repo#7", chargeId: "c".repeat(64),
  originalRunnerRunId: "run-original", originalSupervisorRunId: "supervisor-original",
  consumedRunnerRunId: "run-consumed", consumedSupervisorRunId: "supervisor-consumed",
  originalSpecIdentity: "1".repeat(64), originalStateIdentity: "2".repeat(64), originalIterationIdentity: "3".repeat(64), originalSummaryIdentity: "4".repeat(64),
  failedContinuationRunnerRunId: "run-failed", failedContinuationSupervisorRunId: "supervisor-failed",
  failedContinuationSpecIdentity: "7".repeat(64), failedContinuationStateIdentity: "8".repeat(64), failedContinuationHeartbeatIdentity: "9".repeat(64), failedContinuationSummaryIdentity: "a".repeat(64),
  consumedSpecIdentity: "b".repeat(64), consumedStateIdentity: "c".repeat(64), consumedIterationIdentity: "d".repeat(64), consumedSummaryIdentity: "e".repeat(64),
  branch: "feature/issue-7", baseSha: "a".repeat(40), headSha: "b".repeat(40), treeSha: "d".repeat(40), changedFilesDigest: "e".repeat(64), diffDigest: "f".repeat(64),
  acceptedLogicalTasks: 1, localSourceChangingRounds: 0, githubTriggeredFixEpochs: 0, lifetimeLocalSourceChangingRounds: 0,
  formerRootPath: rootPath, formerRootSha256: oldHash, formerEffectivePhase: "checkpoint_validation_commit", incidentPath: rootPath, incidentSha256: incidentHash,
  predecessorBytesAvailable: false, prEvidenceDigest: "f".repeat(64), runtimeSourceSha: "4".repeat(40), installedBundleDigest: "1".repeat(64), installedManifestDigest: "2".repeat(64), runtimeProfileDigest: "3".repeat(64), runtimeApprovalDigest: "4".repeat(64), launcherDigest: "5".repeat(64), healthUnitDigest: "6".repeat(64),
  lifecycleLineage: "terminal_validation_retry_to_distinct_successor", lifecycleSessionId: "session-predecessor", lifecycleMutationGeneration: 2,
  intentPosture: "one_no_effect_overlay_then_consumed_submission",
  validationEffect: false, reviewEffect: false, sourceEffect: false, pushEffect: false, prEffect: false, commentEffect: false, mergeEffect: false, issueEffect: false, productEffect: false,
  submissionCount: 1, submissionExhausted: true, successorEligible: true, earliestSafePhase: "checkpoint_validation_commit",
});

function fixture(claimOverrides = {}) {
  const claims = { ...structuredClone(baseClaims), ...claimOverrides };
  const records = {};
  const sources = [];
  for (const [index, authorityClass] of mandatorySemanticEvidenceClasses.entries()) {
    const definition = semanticRecoveryVerifierSet.verifiers[authorityClass];
    const ownedClaims = {};
    for (const [claim, ownership] of Object.entries(semanticRecoveryClaimOwnerMatrix)) {
      if ([...ownership.required, ...ownership.optional].includes(authorityClass)) ownedClaims[claim] = structuredClone(claims[claim]);
    }
    records[authorityClass] = { record: {
      claims: ownedClaims,
      provenanceIdentity: hash(`provenance:${authorityClass}`),
      store: { kind: definition.storeKind, path: `/synthetic/${authorityClass}.json`, role: `${authorityClass}_authority`, sha256: hash(`store:${authorityClass}`), byteCount: index + 1 },
    } };
    sources.push({ authorityClass, recordKey: "record" });
  }
  const artifacts = Array.from({ length: 16 }, (_, index) => ({ role: `artifact_${String(index).padStart(2, "0")}`, path: `/sanitized/artifact-${index}.json`, sha256: hash(`artifact:${index}`) }));
  artifacts[0] = { role: "current_incident_root", path: rootPath, sha256: incidentHash };
  const packet = {
    sources,
    artifacts,
    incidentIdentity: hash(JSON.stringify({ path: rootPath, sha256: incidentHash })),
    lifecycleSuccessorSession: "session-successor",
    lifecycleSuccessorGeneration: 3,
    formerBytesAvailable: false,
  };
  return { packet, records, claims };
}

const artifactAdapter = (artifact) => ({ ...artifact, authenticated: true, underlyingIdentity: artifact.sha256, byteCount: 1 });
function build(value) {
  return buildSemanticRecoveryManifest(value.packet, {
    verifierRegistry: createDeterministicSemanticRecoveryVerifierRegistry(value.records),
    authenticateBoundArtifact: artifactAdapter,
  });
}
function setOwnerClaim(value, claim, authorityClass, claimValue) { value.records[authorityClass].record.claims[claim] = claimValue; }
function setAllOwnerClaims(value, claim, claimValue) {
  for (const authorityClass of semanticRecoveryClaimOwnerMatrix[claim].required) setOwnerClaim(value, claim, authorityClass, claimValue);
}

function grantFilesystem(document, mutation = {}) {
  const operationId = document.operationId;
  const grantPath = semanticRecoveryGrantPath(operationId);
  const bytes = Buffer.from(JSON.stringify(canonicalize(document)));
  const metadata = new Map([
    ["/etc", { type: "directory", symlink: false, uid: 0, mode: 0o755, nlink: 2, size: 0, generation: 1 }],
    ["/etc/settleora-auto-runner", { type: "directory", symlink: false, uid: 0, mode: 0o755, nlink: 2, size: 0, generation: 1 }],
    [semanticRecoveryProtectedControlRoot, { type: "directory", symlink: false, uid: 0, mode: 0o755, nlink: 2, size: 0, generation: 1 }],
    [`${semanticRecoveryProtectedControlRoot}/grants`, { type: "directory", symlink: false, uid: 0, mode: 0o755, nlink: 2, size: 0, generation: 1 }],
    [grantPath, { type: "file", symlink: false, uid: 0, mode: 0o444, nlink: 1, size: bytes.length, generation: 1 }],
  ]);
  for (const [target, fields] of Object.entries(mutation.metadata || {})) metadata.set(target, { ...metadata.get(target), ...fields });
  let inspections = 0;
  return {
    inspect(target) {
      inspections += 1;
      const result = { ...metadata.get(target) };
      if (mutation.unstable && target === grantPath && inspections > 6) result.generation = 2;
      return result;
    },
    realpath(target) { return mutation.realpath?.[target] || target; },
    list() { return mutation.list || [`${operationId}.json`]; },
    read() { return mutation.bytes || bytes; },
  };
}

function authorize(built, mutation = {}) {
  const document = { ...expectedSemanticRecoveryGrantDocument(built.manifest), createdAt: "2026-08-01T00:00:00.000Z" };
  return authenticatePostIncidentOperationalAuthorization({ manifest: built.manifest, operationId: built.manifest.operation.operationId, filesystem: grantFilesystem(document, mutation) });
}

test("matrix and verifier set are deterministic source-owned contracts", () => {
  assert.equal(semanticRecoveryClaimOwnerMatrixVersion, 1);
  assert.equal(semanticRecoveryVerifierSetVersion, 1);
  assert.match(semanticRecoveryClaimOwnerMatrixDigest, /^[a-f0-9]{64}$/);
  assert.match(semanticRecoveryVerifierSetDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(semanticRecoveryClaimOwnerMatrix.pushEffect.required, ["github_no_effect", "incident_report"]);
  assert.deepEqual(semanticRecoveryClaimOwnerMatrix.chargeId.required, ["lifecycle", "logical_task_budget"]);
  assert.deepEqual(semanticRecoveryClaimOwnerMatrix.headSha.required, ["projection_deployment", "repository_git"]);
  assert.deepEqual(semanticRecoveryClaimOwnerMatrix.originalRunnerRunId.required, ["lifecycle", "supervisor_child_run"]);
  assert.deepEqual(semanticRecoveryClaimOwnerMatrix.successorEligible.required, ["lifecycle", "projection_deployment"]);
  const authoritySource = readFileSync(new URL("../lib/semantic-recovery-authority.mjs", import.meta.url), "utf8");
  assert.match(authoritySource, /authorityClass === "repository_git"[\s\S]*?rejectUnavailableProductionProducer\(authorityClass, descriptor\)/u);
  assert.doesNotMatch(authoritySource, /verifyLifecycleSource|verifyLogicalTaskBudgetSource|\.semanticRecoveryAuthority/u);
});

test("all required domain owners build one deterministic manifest and derived operation", () => {
  const built = build(fixture());
  assert.equal(built.ok, true);
  assert.equal(built.manifest.claimOwnerMatrix.digest, semanticRecoveryClaimOwnerMatrixDigest);
  assert.equal(built.manifest.sourceVerifierSet.digest, semanticRecoveryVerifierSetDigest);
  assert.match(built.manifest.operation.operationId, /^[a-f0-9]{64}$/);
  assert.match(built.manifest.operation.requestId, /^[a-f0-9]{64}$/);
  assert.equal(built.manifest.operation.action, "create_or_adopt_semantic_recovery_successor");
});

test("production repository verifier derives candidate claims from canonical Git objects", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-semantic-git-"));
  const git = (...args) => {
    const result = spawnSync("/usr/bin/git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("remote", "add", "origin", "https://github.com/example/repo.git");
    writeFileSync(path.join(root, "fixture.txt"), "base\n"); git("add", "fixture.txt"); git("commit", "-m", "base");
    const baseSha = git("rev-parse", "HEAD");
    git("switch", "-c", "feature/issue-7"); writeFileSync(path.join(root, "fixture.txt"), "head\n"); git("add", "fixture.txt"); git("commit", "-m", "head");
    const headSha = git("rev-parse", "HEAD"); const treeSha = git("rev-parse", "HEAD^{tree}");
    const changedFilesDigest = hash(JSON.stringify(["fixture.txt"]));
    const diffDigest = hash(spawnSync("/usr/bin/git", ["diff", "--binary", baseSha, headSha], { cwd: root }).stdout);
    const provenanceIdentity = hash(JSON.stringify(canonicalize({ repository: "example/repo", repoRoot: root, branch: "feature/issue-7", baseSha, headSha, treeSha, changedFilesDigest, diffDigest })));
    const registry = createProductionSemanticRecoveryVerifierRegistry({ repoRoot: root, logsRoot: root, repositorySlug: "example/repo" });
    const descriptor = { authorityClass: "repository_git", selection: { baseSha, branch: "feature/issue-7", headSha }, store: { kind: "repository_git_store", path: root, role: "candidate_repository", sha256: provenanceIdentity } };
    const verified = registry.verify("repository_git", descriptor);
    assert.deepEqual(verified.claims, { repository: "example/repo", branch: "feature/issue-7", baseSha, headSha, treeSha, changedFilesDigest, diffDigest });
    assert.throws(() => registry.verify("repository_git", { ...descriptor, store: { ...descriptor.store, sha256: "0".repeat(64) } }));
    writeFileSync(path.join(root, ".gitattributes"), "*.txt binary\n");
    assert.deepEqual(registry.verify("repository_git", descriptor).claims, verified.claims);
    assert.equal(spawnSync("git", ["config", "--local", "diff.noprefix", "true"], { cwd: root }).status, 0);
    assert.throws(() => registry.verify("repository_git", descriptor), /repository Git config unsafe/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("production repository verifier rejects Git-dir attribute overrides", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-semantic-git-info-"));
  const git = (...args) => {
    const result = spawnSync("/usr/bin/git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("remote", "add", "origin", "https://github.com/example/repo.git");
    writeFileSync(path.join(root, "fixture.txt"), "base\n"); git("add", "fixture.txt"); git("commit", "-m", "base");
    const baseSha = git("rev-parse", "HEAD");
    git("switch", "-c", "feature/issue-7"); writeFileSync(path.join(root, "fixture.txt"), "head\n"); git("add", "fixture.txt"); git("commit", "-m", "head");
    const headSha = git("rev-parse", "HEAD");
    writeFileSync(path.join(root, ".git", "info", "attributes"), "*.txt binary\n");
    const registry = createProductionSemanticRecoveryVerifierRegistry({ repoRoot: root, logsRoot: root, repositorySlug: "example/repo" });
    const descriptor = { authorityClass: "repository_git", selection: { baseSha, branch: "feature/issue-7", headSha }, store: { kind: "repository_git_store", path: root, role: "candidate_repository", sha256: "0".repeat(64) } };
    assert.throws(() => registry.verify("repository_git", descriptor), /repository Git attributes unsafe/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("uninstalled production producers reject self-declared class-tagged envelopes", () => {
  const logsRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-semantic-store-"));
  try {
    const value = fixture();
    const definition = semanticRecoveryVerifierSet.verifiers.incident_report;
    const storePath = path.join(logsRoot, "incident-authority.json");
    const document = canonicalize({
      contract: "settleora_semantic_recovery_incident_report_store",
      version: 1,
      producer: { id: definition.id, version: definition.version },
      repository: "example/repo",
      storeKind: definition.storeKind,
      role: "incident_report_authority",
      record: value.records.incident_report.record.claims,
    });
    const bytes = Buffer.from(JSON.stringify(document)); writeFileSync(storePath, bytes, { mode: 0o600 });
    const registry = createProductionSemanticRecoveryVerifierRegistry({ repoRoot: logsRoot, logsRoot, repositorySlug: "example/repo" });
    const descriptor = { authorityClass: "incident_report", store: { kind: definition.storeKind, path: storePath, role: "incident_report_authority", sha256: hash(bytes) } };
    assert.throws(() => registry.verify("incident_report", descriptor), /semantic source producer unavailable/u);
    assert.throws(() => registry.verify("incident_report", { ...descriptor, store: { ...descriptor.store, role: "caller_role" } }));
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("arbitrary two-class agreement cannot replace a missing domain owner", () => {
  const value = fixture();
  delete value.records.github_no_effect.record.claims.pushEffect;
  setOwnerClaim(value, "pushEffect", "repository_git", false);
  setOwnerClaim(value, "pushEffect", "lifecycle", false);
  assert.equal(build(value).reasonCode, "semantic_claim_required_owner_missing");
});

test("required-owner and present-corrobator disagreement fail closed", () => {
  const required = fixture(); setOwnerClaim(required, "chargeId", "lifecycle", "d".repeat(64));
  assert.equal(build(required).reasonCode, "semantic_claim_required_owner_disagreement");
  const unrelated = fixture(); setOwnerClaim(unrelated, "pushEffect", "repository_git", false);
  assert.equal(build(unrelated).reasonCode, "semantic_claim_ineligible_authority");
});

test("unknown claims and classes fail closed", () => {
  const unknown = fixture(); unknown.records.lifecycle.record.claims.unknownClaim = true;
  assert.equal(build(unknown).reasonCode, "semantic_evidence_unknown_claim");
  const duplicate = fixture(); duplicate.packet.sources[1].authorityClass = duplicate.packet.sources[0].authorityClass;
  assert.equal(build(duplicate).reasonCode, "semantic_evidence_source_authentication_failed");
});

test("caller claims, provenance, class injection, and verifier callbacks are not invoked", () => {
  const value = fixture();
  let invoked = false;
  value.packet.sources[0].claims = { pushEffect: false };
  value.packet.sources[0].provenanceIdentity = "0".repeat(64);
  const result = buildSemanticRecoveryManifest(value.packet, {
    verifierRegistry: createDeterministicSemanticRecoveryVerifierRegistry(value.records),
    authenticateSourceProvenance: () => { invoked = true; },
    authenticateBoundArtifact: artifactAdapter,
  });
  assert.equal(result.reasonCode, "semantic_evidence_source_authentication_failed");
  assert.equal(invoked, false);
});

test("missing source-owned registry fails closed", () => {
  assert.equal(buildSemanticRecoveryManifest(fixture().packet).reasonCode, "semantic_evidence_verifier_registry_missing");
});

test("malformed claim, Git, runtime, counter, charge and branch identities fail closed", () => {
  for (const [claim, malformed, reason] of [
    ["issueNumber", "7", "semantic_claim_shape_invalid"], ["chargeId", "charge-7", "semantic_claim_shape_invalid"],
    ["branch", "refs/heads/topic", "semantic_claim_shape_invalid"], ["headSha", "bad", "semantic_git_identity_invalid"],
    ["runtimeSourceSha", "bad", "semantic_runtime_or_run_identity_invalid"], ["submissionCount", 1.5, "semantic_claim_shape_invalid"],
  ]) {
    const value = fixture(); setAllOwnerClaims(value, claim, malformed);
    assert.equal(build(value).reasonCode, reason, claim);
  }
});

test("operation selectors are derived and mismatches fail closed", () => {
  const value = fixture(); value.packet.operationId = "0".repeat(64);
  assert.equal(build(value).reasonCode, "semantic_operation_request_selector_mismatch");
  const malformed = fixture(); malformed.packet.operationId = "../latest";
  assert.equal(build(malformed).reasonCode, "semantic_evidence_packet_invalid");
});

test("fixed root and exact direct-child grant path cannot be redirected", () => {
  const built = build(fixture());
  assert.equal(semanticRecoveryGrantPath(built.manifest.operation.operationId), `${semanticRecoveryProtectedControlRoot}/grants/${built.manifest.operation.operationId}.json`);
  assert.throws(() => semanticRecoveryGrantPath("../latest"));
});

test("root ownership, exact mode, link count, symlinks and ancestor writability are enforced", () => {
  const built = build(fixture());
  const grantPath = semanticRecoveryGrantPath(built.manifest.operation.operationId);
  for (const metadata of [
    { [grantPath]: { uid: 1000 } }, { [grantPath]: { mode: 0o400 } }, { [grantPath]: { nlink: 2 } },
    { [grantPath]: { symlink: true } }, { [semanticRecoveryProtectedControlRoot]: { uid: 1000 } },
    { [`${semanticRecoveryProtectedControlRoot}/grants`]: { mode: 0o775 } },
  ]) assert.equal(authorize(built, { metadata }).reasonCode, "semantic_protected_grant_authentication_failed");
});

test("canonical mismatch, unstable bytes, oversized bytes and ambiguous selection fail closed", () => {
  const built = build(fixture());
  const grantPath = semanticRecoveryGrantPath(built.manifest.operation.operationId);
  assert.equal(authorize(built, { realpath: { [grantPath]: "/different/grant.json" } }).reasonCode, "semantic_protected_grant_authentication_failed");
  assert.equal(authorize(built, { unstable: true }).reasonCode, "semantic_protected_grant_authentication_failed");
  assert.equal(authorize(built, { bytes: Buffer.alloc(256 * 1024 + 1) }).reasonCode, "semantic_protected_grant_authentication_failed");
  assert.equal(authorize(built, { list: [] }).reasonCode, "semantic_protected_grant_authentication_failed");
});

test("malformed, noncanonical and duplicate-key grant JSON fail closed", () => {
  const built = build(fixture());
  for (const bytes of [Buffer.from("{"), Buffer.from(`${JSON.stringify(expectedSemanticRecoveryGrantDocument(built.manifest), null, 2)}\n`), Buffer.from('{"contract":"a","contract":"b"}')]) {
    assert.equal(authorize(built, { bytes }).reasonCode, "semantic_protected_grant_authentication_failed");
  }
});

test("grant binds manifest, matrix, verifier, runtime, evidence and successor identities", () => {
  const built = build(fixture());
  assert.equal(authorize(built).authorized, true);
  for (const mutate of [
    (doc) => { doc.semanticManifestDigest = "0".repeat(64); },
    (doc) => { doc.claimOwnerMatrix.digest = "0".repeat(64); },
    (doc) => { doc.sourceVerifierSet.digest = "0".repeat(64); },
    (doc) => { doc.persistenceFence.authorityClass = "incident_report"; },
    (doc) => { doc.evidenceSources[0].provenanceIdentity = "0".repeat(64); },
    (doc) => { doc.runBindings.failedHeartbeat = "0".repeat(64); },
    (doc) => { doc.runtime.profileDigest = "0".repeat(64); },
    (doc) => { doc.oneShotExhaustion.exhausted = false; },
    (doc) => { doc.noEffectPosture.pushEffect = true; },
    (doc) => { doc.lifecycle.successorSession = "other"; },
    (doc) => { doc.successor.storageKey = "0".repeat(64); },
    (doc) => { doc.successor.storagePath = "/alternate/successor.json"; },
    (doc) => { doc.allowedAction = "write_incident"; },
  ]) {
    const document = structuredClone(expectedSemanticRecoveryGrantDocument(built.manifest)); mutate(document);
    const result = authenticatePostIncidentOperationalAuthorization({ manifest: built.manifest, operationId: built.manifest.operation.operationId, filesystem: grantFilesystem(document) });
    assert.equal(result.reasonCode, "semantic_protected_grant_binding_mismatch");
  }
});

test("selector alone and caller-created grant-shaped objects grant no authority", () => {
  const built = build(fixture());
  assert.equal(constructPostIncidentSuccessor({ manifest: built.manifest, mutationGeneration: 3 }).reasonCode, "post_incident_operational_authorization_required");
  assert.equal(constructPostIncidentSuccessor({ manifest: built.manifest, mutationGeneration: 3, operationGrant: { ...authorize(built) } }).reasonCode, "post_incident_operational_authorization_required");
});

test("synthetic verifier and filesystem adapters cannot construct or persist a successor", () => {
  const built = build(fixture());
  const grant = authorize(built);
  assert.equal(grant.synthetic, true);
  const construction = constructPostIncidentSuccessor({ manifest: built.manifest, mutationGeneration: 3, operationGrant: grant });
  assert.equal(construction.reasonCode, "post_incident_operational_authorization_required");
  const persistenceSource = readFileSync(new URL("../lib/post-incident-successor-recovery.mjs", import.meta.url), "utf8");
  const authoritySource = readFileSync(new URL("../lib/semantic-recovery-authority.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(persistenceSource, /persistOrAdoptPostIncidentSuccessor|atomicJsonNoReplace|linkSync|renameSync/u);
  assert.match(persistenceSource, /requestSourceOwnedSemanticRecoveryPersistence\(registry, fresh\.manifest, fresh\.grant\)/u);
  assert.doesNotMatch(authoritySource, /persistExactSemanticSuccessor\(manifest, grant, persist\)|typeof persist(?:\s|[),;])/u);
  assert.doesNotMatch(persistenceSource, /postIncidentSuccessorRoot/u);
});

test("prepared pair requires a final exact commit marker and recovers every crash point", () => {
  const prepared = { result: "prepared", digest: "a".repeat(64) };
  const successor = { storageKey: "b".repeat(64) };
  const commit = { result: "accepted", provenanceDigest: "c".repeat(64), successorDigest: "d".repeat(64) };
  const decide = (state) => evaluateSemanticRecoveryPersistenceSet({
    ...state,
    expectedPrepared: prepared,
    expectedSuccessor: successor,
    expectedCommit: commit,
  });
  assert.equal(decide({}).action, "write_prepared");
  assert.equal(decide({ prepared }).action, "write_successor");
  assert.equal(decide({ prepared, successor }).action, "write_commit");
  assert.equal(decide({ prepared, successor, commit }).action, "adopt");
  assert.equal(decide({ commit }).reasonCode, "post_incident_successor_commit_torn");
  assert.equal(decide({ prepared: { result: "accepted" } }).reasonCode, "post_incident_provenance_conflict");
});

test("protected predecessor and incident write paths remain blocked", () => {
  assert.equal(assertRecoveryWritePathAllowed(rootPath, { predecessorPath: rootPath, incidentPath: rootPath }).reasonCode, "protected_recovery_path_write_blocked");
  assert.equal(assertRecoveryWritePathAllowed("/sanitized/successor.json", { predecessorPath: rootPath, incidentPath: rootPath, successorPath: "/sanitized/successor.json" }).ok, true);
});

test("overwrite incident quarantine remains byte-authenticated and ordinary recovery remains compatible", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-classify-"));
  try {
    const incidentPath = path.join(root, "root.json"); writeFileSync(incidentPath, "incident\n", { mode: 0o600 });
    const actual = hash(readFileSync(incidentPath));
    const provenance = { ok: true, incidentPath, incidentArtifact: { role: "incident", path: incidentPath, sha256: actual }, taskKey: "task-1", issueNumber: 7, predecessorSha256: oldHash, incidentSha256: actual, bytesAvailable: false, consumedRunnerRunId: "run-consumed", consumedSupervisorRunId: "supervisor-consumed" };
    const state = { taskKey: "task-1", issue: { number: 7 }, run: { runId: "run-consumed", supervisorRunId: "supervisor-consumed" } };
    assert.equal(classifyRecoveryOverwriteIncident({ recoveryPath: incidentPath, state, authenticatedProvenance: provenance }).quarantined, true);
    linkSync(incidentPath, path.join(root, "incident-hardlink.json"));
    assert.equal(classifyRecoveryOverwriteIncident({ recoveryPath: incidentPath, state, authenticatedProvenance: provenance }).reasonCode, "incident_provenance_authentication_failed");
    assert.equal(classifyRecoveryOverwriteIncident({ recoveryPath: "/other.json", state: { taskKey: "other", issue: { number: 8 } }, authenticatedProvenance: provenance }).quarantined, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("startup quarantines configured incident before recoverability filtering without touching protected root when evidence is absent", () => {
  const logsRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-quarantine-"));
  try {
    const state = createInitialRecoveryState({ taskKey: "task-1", issue: { number: 7 }, runId: "run-original", branchName: "feature/issue-7", baseSha: "a".repeat(40), currentHeadSha: "b".repeat(40), phase: "completed" });
    writeRecoveryState({ logsRoot }, state);
    const incidentPath = recoveryStatePath({ logsRoot }, state); const actual = hash(readFileSync(incidentPath));
    const config = { logsRoot, repositorySlug: "example/repo", allowExistingPrRecovery: true, postIncidentRecovery: { authenticatedProvenance: { ok: true, repository: "example/repo", incidentPath, incidentArtifact: { role: "incident", path: incidentPath, sha256: actual }, taskKey: "task-1", issueNumber: 7, predecessorSha256: oldHash, incidentSha256: actual, bytesAvailable: false, originalRunnerRunId: "run-original", originalSupervisorRunId: "supervisor-original", consumedRunnerRunId: "run-consumed", consumedSupervisorRunId: "supervisor-consumed" }, semanticEvidencePacket: null, operationId: null } };
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.found, true); assert.equal(discovery.allowed, false); assert.equal(discovery.reasonCode, "semantic_evidence_packet_missing");
    assert.throws(() => writeRecoveryState(config, state), /protected_post_incident_recovery_state_write_blocked/u);
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("recovery writer blocks a quarantined incident selected through a symlink alias", () => {
  const logsRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-quarantine-alias-"));
  try {
    const state = createInitialRecoveryState({ taskKey: "task-1", issue: { number: 7 }, runId: "run-consumed", supervisorRunId: "supervisor-consumed", branchName: "feature/issue-7", baseSha: "a".repeat(40), currentHeadSha: "b".repeat(40), phase: "completed" });
    writeRecoveryState({ logsRoot }, state);
    const incidentPath = recoveryStatePath({ logsRoot }, state);
    const incidentAlias = path.join(logsRoot, "incident-alias.json");
    symlinkSync(incidentPath, incidentAlias);
    const incidentSha256 = hash(readFileSync(incidentPath));
    const authenticatedProvenance = { ok: true, repository: "example/repo", incidentPath: incidentAlias, incidentArtifact: { role: "incident", path: incidentAlias, sha256: incidentSha256 }, taskKey: "task-1", issueNumber: 7, predecessorSha256: oldHash, incidentSha256, bytesAvailable: false, originalRunnerRunId: "run-original", originalSupervisorRunId: "supervisor-original", consumedRunnerRunId: "run-consumed", consumedSupervisorRunId: "supervisor-consumed" };
    assert.throws(
      () => writeRecoveryState({ logsRoot, postIncidentRecovery: { authenticatedProvenance } }, state),
      /protected_post_incident_recovery_state_write_blocked/u,
    );
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("locked semantic execution remains fail-closed without native producers and grant", async () => {
  const result = await executeStartupContinuation(
    { repositorySlug: "example/repo", postIncidentRecovery: { semanticEvidencePacket: null, operationId: null } },
    { allowed: true, action: "create_or_adopt_semantic_recovery_successor" },
  );
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "blocked_recovery_state");
  assert.equal(result.reasonCode, "semantic_evidence_packet_invalid");
});

test("runner retains only the pure crash protocol and delegates every filesystem write to the protected producer", () => {
  const source = readFileSync(new URL("../lib/post-incident-successor-recovery.mjs", import.meta.url), "utf8");
  assert.match(source, /prepared === undefined[\s\S]*?write_prepared[\s\S]*?successor === undefined[\s\S]*?write_successor[\s\S]*?write_commit/u);
  assert.match(source, /commit !== undefined && \(prepared === undefined \|\| successor === undefined\)/u);
  assert.doesNotMatch(source, /writeFileSync|renameSync|linkSync|unlinkSync|mkdirSync|persistOrAdoptPostIncidentSuccessor/u);
});

test("the test suite never creates or mutates the real protected-control root", () => {
  assert.equal(semanticRecoveryProtectedControlRoot, "/etc/settleora-auto-runner/semantic-recovery-authority");
  assert.equal(import.meta.url.includes("/etc/"), false);
});
