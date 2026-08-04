import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, linkSync, lstatSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  authenticateNativeInstallGitSource,
  gitObjectOid,
  nativeInstallBootstrapEntrypoint,
  nativeInstallBootstrapScript,
  nativeInstallProducerEntrypoint,
  nativeInstallRenameNoReplaceHelper,
  normalizeNativeInstallSourceHint,
  reverifyMaterializedNativeInstallClosure,
  verifyAuthenticatedNativeInstallSource,
} from "../lib/semantic-recovery-native-install-source.mjs";
import {
  createNativeInstallJournal,
  buildNativeInstallSudoArgv,
  correlateNativeInstallJournals,
  nativeInstallSudoArgv,
  nativeInstallTrustedBootstrapPath,
  nativeInstallOperationIdentity,
  resumeNativeInstallProtocol,
  sanitizeNativeInstallProcessResult,
  transitionNativeInstallJournal,
  validateInteractiveSudoBoundary,
  validateNativeInstallJournal,
} from "../lib/semantic-recovery-native-install-journal.mjs";
import { independentlyVerifyRootNativeInstallPackage } from "../lib/semantic-recovery-native-install-verifier.mjs";
import {
  buildFixedNativeInstallRootResult,
  classifyFixedNativeInstallPublishedResidue,
  classifyFixedNativeInstallRootResultTemporaries,
  completeVerifiedNativeInstallResult,
  persistNativeInstallJournalTransition,
  publishNativeInstallRootResultNoReplace,
  publishOrAdoptVerifiedNativeInstall,
  readNativeInstallRootResultTemporaryFromDirectory,
  recoverNativeInstallRootResultNoReplaceLinks,
  selectFixedNativeInstallRootResultObservation,
  validateRootResultTransition,
} from "../lib/semantic-recovery-native-install-publication.mjs";
import {
  decideNativeInstallHandoffControllerStep,
  renderNativeInstallRemoteControllerFlowSource,
  renderNativeInstallWindowsSshCoordinatorSource,
} from "../lib/semantic-recovery-native-install-handoff.mjs";
import {
  classifyNativeInstallRootFailure,
  classifyNativeInstallRootReaderProcess,
} from "../lib/semantic-recovery-native-install-diagnostics.mjs";
import { corroborateNativeInstallRootReaderOutputs } from "../semantic-recovery-native-install.mjs";
import {
  classifyPublicSemanticRecoveryGithubProcessFailure,
  createPublicSemanticRecoveryGithubSnapshotReader,
  readPublicSemanticRecoveryGithubRoute,
} from "../semantic-recovery-native-producer.mjs";
import {
  semanticRecoveryAuthorityClasses,
  semanticRecoveryClaimOwnerMatrix,
} from "../lib/semantic-recovery-authority.mjs";
import {
  planSemanticRecoveryNativeInstall,
  verifySemanticRecoveryNativeInstallPlan,
  verifyInstalledSemanticRecoveryNativeProducer,
} from "../lib/semantic-recovery-native-producer.mjs";
import { semanticRecoveryProtectedLayout } from "../lib/semantic-recovery-protected-store.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" && !Buffer.isBuffer(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const hint = (overrides = {}) => ({
  contract: "settleora_semantic_recovery_native_install_source",
  version: 1,
  repository: "example/repo",
  sourceCommit: "0".repeat(40),
  bootstrapBlob: "1".repeat(40),
  taskCorrelation: "issue-1012-fixture",
  ...overrides,
});

function gitFixture(overrides = {}) {
  const objects = new Map();
  const put = (type, bytes) => {
    const value = Buffer.from(bytes);
    const oid = gitObjectOid(type, value);
    objects.set(oid, { oid, type, bytes: value });
    return oid;
  };
  const files = new Map(Object.entries({
    [nativeInstallBootstrapEntrypoint]: 'import "./semantic-recovery-native-producer.mjs";\nimport "./lib/semantic-recovery-native-install-diagnostics.mjs";\n',
    [nativeInstallProducerEntrypoint]: 'import "./lib/producer-support.mjs";\n',
    "tools/auto-runner/lib/producer-support.mjs": "export const fixture = true;\n",
    "tools/auto-runner/lib/semantic-recovery-native-install-diagnostics.mjs": "export const fixtureDiagnostic = true;\n",
    [nativeInstallRenameNoReplaceHelper]: "# fixture helper\n",
    [nativeInstallBootstrapScript]: "#!/usr/bin/bash\nexit 1\n",
    "unrelated/complete-tree-proof.txt": "unrelated blob is still authenticated\n",
    ...(overrides.files || {}),
  }));
  const blobOids = new Map([...files].map(([source, value]) => [source, put("blob", Buffer.from(value))]));
  const buildTree = (prefix = "") => {
    const directFiles = [...blobOids].filter(([source]) => path.posix.dirname(source) === (prefix || "."));
    const childNames = new Set([...blobOids.keys()].filter((source) => prefix === "" ? source.includes("/") : source.startsWith(`${prefix}/`) && source.slice(prefix.length + 1).includes("/"))
      .map((source) => source.slice(prefix.length === 0 ? 0 : prefix.length + 1).split("/")[0]));
    const entries = [];
    for (const child of childNames) {
      const childPrefix = prefix === "" ? child : `${prefix}/${child}`;
      entries.push({ mode: "40000", name: child, oid: buildTree(childPrefix) });
    }
    for (const [source, oid] of directFiles) entries.push({ mode: [nativeInstallBootstrapEntrypoint, nativeInstallProducerEntrypoint, nativeInstallBootstrapScript].includes(source) ? "100755" : "100644", name: path.posix.basename(source), oid });
    entries.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
    return put("tree", Buffer.concat(entries.map((entry) => Buffer.concat([
      Buffer.from(`${entry.mode} ${entry.name}\0`), Buffer.from(entry.oid, "hex"),
    ]))));
  };
  const rootTree = buildTree();
  const commitBytes = Buffer.from(`tree ${rootTree}\nauthor Fixture <fixture@example.invalid> 0 +0000\ncommitter Fixture <fixture@example.invalid> 0 +0000\n\nfixture\n`);
  const commit = put("commit", commitBytes);
  const selectedHint = hint({ sourceCommit: commit, bootstrapBlob: blobOids.get(nativeInstallBootstrapScript), ...(overrides.hint || {}) });
  const objectReader = {
    resolveRepository: () => ({ repository: overrides.repository || selectedHint.repository, commit: overrides.commit || commit, transport: overrides.transport || "authenticated_github_https" }),
    readObject(oid) {
      const value = objects.get(oid);
      if (!value) throw new Error("fixture object missing");
      if (overrides.corruptOid === oid) return { ...value, bytes: Buffer.concat([value.bytes, Buffer.from("x")]) };
      return value;
    },
  };
  return { hint: selectedHint, objects, objectReader, commit, rootTree, blobOids };
}

test("root source authentication rehashes commit, every tree and every blob before selecting the exact support closure", () => {
  const fixture = gitFixture();
  const authenticated = authenticateNativeInstallGitSource({ hint: fixture.hint, objectReader: fixture.objectReader });
  assert.equal(authenticated.manifest.objectCount, fixture.objects.size);
  assert.equal(authenticated.manifest.blobCount, fixture.blobOids.size);
  assert.equal(authenticated.manifest.support.length, 6);
  assert.equal(authenticated.manifest.support.some((entry) => entry.source === "unrelated/complete-tree-proof.txt"), false);
  assert.equal(verifyAuthenticatedNativeInstallSource(authenticated).ok, true);
  assert.equal(authenticated.supportFiles.every((entry) => entry.gitBlobOid === gitObjectOid("blob", entry.bytes)), true);
});

test("the exact candidate Git tree authenticates with the real source and helper modes", () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const git = (args, encoding = null) => {
    const child = spawnSync("/usr/bin/git", ["-C", repositoryRoot, ...args], {
      cwd: repositoryRoot,
      env: { HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
      encoding,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 30_000,
    });
    assert.equal(child.status, 0, Buffer.from(child.stderr || "").toString("utf8"));
    assert.equal(child.signal, null);
    return child.stdout;
  };
  const sourceCommit = git(["rev-parse", "HEAD^{commit}"], "utf8").trim();
  const bootstrapBlob = git(["rev-parse", `${sourceCommit}:${nativeInstallBootstrapScript}`], "utf8").trim();
  const objectReader = {
    resolveRepository: () => ({ repository: "tommytang213/Settleora", commit: sourceCommit, transport: "authenticated_github_https" }),
    readObject(oid) {
      const type = git(["cat-file", "-t", oid], "utf8").trim();
      return { oid, type, bytes: git(["cat-file", type, oid]) };
    },
  };
  const authenticated = authenticateNativeInstallGitSource({
    hint: hint({ repository: "tommytang213/Settleora", sourceCommit, bootstrapBlob, taskCorrelation: "issue-1012-exact-candidate" }),
    objectReader,
  });
  assert.equal(verifyAuthenticatedNativeInstallSource(authenticated).ok, true);
  assert.equal(authenticated.manifest.sourceCommit, sourceCommit);
  assert.equal(authenticated.supportFiles.find((entry) => entry.source === nativeInstallProducerEntrypoint)?.executable, true);
});

test("wrong repository, source, transport, object bytes, dependency and symlink tree entry fail closed", () => {
  for (const overrides of [
    { repository: "other/repo" },
    { commit: "f".repeat(40) },
    { transport: "local_checkout" },
  ]) {
    const fixture = gitFixture(overrides);
    assert.throws(() => authenticateNativeInstallGitSource({ hint: fixture.hint, objectReader: fixture.objectReader }), /authority mismatch/u);
  }
  const corrupt = gitFixture();
  corrupt.objectReader.readObject = (oid) => {
    const value = corrupt.objects.get(oid);
    return oid === corrupt.rootTree ? { ...value, bytes: Buffer.concat([value.bytes, Buffer.from("x")]) } : value;
  };
  assert.throws(() => authenticateNativeInstallGitSource({ hint: corrupt.hint, objectReader: corrupt.objectReader }), /identity mismatch/u);
  const missing = gitFixture({ files: { [nativeInstallProducerEntrypoint]: 'import "./lib/missing.mjs";\n' } });
  assert.throws(() => authenticateNativeInstallGitSource({ hint: missing.hint, objectReader: missing.objectReader }), /dependency missing/u);

  const symlink = gitFixture();
  const root = symlink.objects.get(symlink.rootTree);
  const firstModeEnd = root.bytes.indexOf(0x20);
  root.bytes = Buffer.concat([Buffer.from("120000"), root.bytes.subarray(firstModeEnd)]);
  const forgedRoot = gitObjectOid("tree", root.bytes);
  symlink.objects.delete(symlink.rootTree);
  symlink.objects.set(forgedRoot, { oid: forgedRoot, type: "tree", bytes: root.bytes });
  const commitObject = symlink.objects.get(symlink.commit);
  commitObject.bytes = Buffer.from(commitObject.bytes.toString("utf8").replace(symlink.rootTree, forgedRoot));
  const forgedCommit = gitObjectOid("commit", commitObject.bytes);
  symlink.objects.delete(symlink.commit);
  symlink.objects.set(forgedCommit, { oid: forgedCommit, type: "commit", bytes: commitObject.bytes });
  const forgedHint = hint({ sourceCommit: forgedCommit });
  symlink.objectReader.resolveRepository = () => ({ repository: forgedHint.repository, commit: forgedCommit, transport: "authenticated_github_https" });
  assert.throws(() => authenticateNativeInstallGitSource({ hint: forgedHint, objectReader: symlink.objectReader }), /symlink entry forbidden/u);
});

test("a transport-truncated raw tree blocks after its tree and commit identities are correctly rebound", () => {
  const fixture = gitFixture();
  const root = fixture.objects.get(fixture.rootTree);
  root.bytes = root.bytes.subarray(0, root.bytes.length - 1);
  const truncatedRoot = gitObjectOid("tree", root.bytes);
  fixture.objects.delete(fixture.rootTree);
  fixture.objects.set(truncatedRoot, { oid: truncatedRoot, type: "tree", bytes: root.bytes });
  const commitObject = fixture.objects.get(fixture.commit);
  commitObject.bytes = Buffer.from(commitObject.bytes.toString("utf8").replace(fixture.rootTree, truncatedRoot));
  const reboundCommit = gitObjectOid("commit", commitObject.bytes);
  fixture.objects.delete(fixture.commit);
  fixture.objects.set(reboundCommit, { oid: reboundCommit, type: "commit", bytes: commitObject.bytes });
  const reboundHint = hint({ sourceCommit: reboundCommit });
  fixture.objectReader.resolveRepository = () => ({ repository: reboundHint.repository, commit: reboundCommit, transport: "authenticated_github_https" });
  assert.throws(() => authenticateNativeInstallGitSource({ hint: reboundHint, objectReader: fixture.objectReader }), /Git tree invalid|Git tree truncated/u);
});

test("materialized readback requires root metadata, one link, canonical relative realpath and exact Git/blob bytes", () => {
  const authenticated = authenticateNativeInstallGitSource(gitFixture());
  const values = new Map(authenticated.supportFiles.map((entry) => [entry.source, {
    source: entry.source, type: "file", symlink: false, uid: 0, gid: 0, mode: entry.executable ? 0o555 : 0o444,
    nlink: 1, realpath: entry.source, bytes: entry.bytes,
  }]));
  assert.equal(reverifyMaterializedNativeInstallClosure({ authenticatedSource: authenticated, materializedReader: (source) => values.get(source) }).ok, true);
  for (const mutation of [
    { mode: 0o777 }, { uid: 1000 }, { gid: 1000 }, { nlink: 2 }, { symlink: true }, { realpath: "outside" }, { bytes: Buffer.from("forged") },
  ]) {
    const target = authenticated.supportFiles[0].source;
    const changed = new Map(values);
    changed.set(target, { ...values.get(target), ...mutation });
    assert.throws(() => reverifyMaterializedNativeInstallClosure({ authenticatedSource: authenticated, materializedReader: (source) => changed.get(source) }), /changed/u);
  }
});

test("closed root hint refuses every unprivileged plan, manifest, path, command, and environment projection", () => {
  for (const [field, value] of [["plan", {}], ["manifest", {}], ["path", "/tmp/x"], ["command", "node"], ["environment", { TOKEN: "x" }]]) {
    assert.throws(() => normalizeNativeInstallSourceHint({ ...hint(), [field]: value }), /closed schema/u, field);
  }
});

const baseClaims = Object.freeze({
  repository: "example/repo", issueNumber: 1012, taskKey: "fixture-task", claimIdentity: "example/repo#1012", chargeId: "c".repeat(64),
  originalRunnerRunId: "run-original", originalSupervisorRunId: "supervisor-original", consumedRunnerRunId: "run-consumed", consumedSupervisorRunId: "supervisor-consumed",
  originalSpecIdentity: "1".repeat(64), originalStateIdentity: "2".repeat(64), originalIterationIdentity: "3".repeat(64), originalSummaryIdentity: "4".repeat(64),
  failedContinuationRunnerRunId: "run-failed", failedContinuationSupervisorRunId: "supervisor-failed", failedContinuationSpecIdentity: "7".repeat(64), failedContinuationStateIdentity: "8".repeat(64), failedContinuationHeartbeatIdentity: "9".repeat(64), failedContinuationSummaryIdentity: "a".repeat(64),
  consumedSpecIdentity: "b".repeat(64), consumedStateIdentity: "c".repeat(64), consumedIterationIdentity: "d".repeat(64), consumedSummaryIdentity: "e".repeat(64),
  branch: "feature/issue-1012", baseSha: "a".repeat(40), headSha: "b".repeat(40), treeSha: "d".repeat(40), changedFilesDigest: "e".repeat(64), diffDigest: "f".repeat(64),
  acceptedLogicalTasks: 1, localSourceChangingRounds: 0, githubTriggeredFixEpochs: 0, lifetimeLocalSourceChangingRounds: 0,
  formerRootPath: "/sanitized/root.json", formerRootSha256: "6".repeat(64), formerEffectivePhase: "checkpoint_validation_commit", incidentPath: "/sanitized/root.json", incidentSha256: "5".repeat(64), predecessorBytesAvailable: false, prEvidenceDigest: "f".repeat(64),
  runtimeSourceSha: "4".repeat(40), installedBundleDigest: "1".repeat(64), installedManifestDigest: "2".repeat(64), runtimeProfileDigest: "3".repeat(64), runtimeApprovalDigest: "4".repeat(64), launcherDigest: "5".repeat(64), healthUnitDigest: "6".repeat(64),
  lifecycleLineage: "terminal_validation_retry_to_distinct_successor", lifecycleSessionId: "session-predecessor", lifecycleMutationGeneration: 2,
  intentPosture: "one_no_effect_overlay_then_consumed_submission", validationEffect: false, reviewEffect: false, sourceEffect: false, pushEffect: false, prEffect: false, commentEffect: false, mergeEffect: false, issueEffect: false, productEffect: false,
  submissionCount: 1, submissionExhausted: true, successorEligible: true, earliestSafePhase: "checkpoint_validation_commit",
});

function ownedClaims(authorityClass) {
  return Object.fromEntries(Object.entries(semanticRecoveryClaimOwnerMatrix)
    .filter(([, ownership]) => [...ownership.required, ...ownership.optional].includes(authorityClass))
    .map(([claim]) => [claim, structuredClone(baseClaims[claim])]));
}
function installPackageFixture(options = {}) {
  const producer = Buffer.from('import "./lib/semantic-recovery-native-producer.mjs";');
  const library = Buffer.from('import "./required-dependency.mjs";');
  const dependency = Buffer.from("export {};");
  const supportFiles = options.supportFiles || [
    [nativeInstallProducerEntrypoint, producer, true],
    ["tools/auto-runner/lib/semantic-recovery-native-producer.mjs", library, false],
    ["tools/auto-runner/lib/required-dependency.mjs", dependency, false],
  ].map(([source, bytes, executable]) => ({ source, bytes, byteCount: bytes.length, sha256: sha256(bytes), executable }));
  const request = {
    contract: "settleora_semantic_recovery_native_producer_request", version: 1, operation: "install_native_semantic_recovery_producer",
    repository: baseClaims.repository,
    source: { deploymentEvidenceDocument: "/workspace/auto-runner/config/fixture/deployment-evidence.json", sha256: "7".repeat(64) },
    runtime: { sourceSha: baseClaims.runtimeSourceSha, bundleDigest: baseClaims.installedBundleDigest, manifestDigest: baseClaims.installedManifestDigest, profileDigest: baseClaims.runtimeProfileDigest, approvalDigest: baseClaims.runtimeApprovalDigest, launcherDigest: baseClaims.launcherDigest, healthUnitDigest: baseClaims.healthUnitDigest },
    observedAt: "2026-08-03T12:00:00.000Z", expiresAt: "2026-08-03T12:10:00.000Z",
  };
  const readers = Object.fromEntries(semanticRecoveryAuthorityClasses.map((authorityClass) => [authorityClass, () => ({
    authorityClass, repository: baseClaims.repository, claims: ownedClaims(authorityClass), provenanceIdentity: sha256(`provenance:${authorityClass}`),
  })]));
  return planSemanticRecoveryNativeInstall({ request, authorityReaders: readers, readAuthorityContext: (authorityClass) => ({ authorityClass }), producerSourceSha: options.producerSourceSha || "8".repeat(40), supportFiles, now: new Date("2026-08-03T12:01:00.000Z") });
}

test("independent verifier reconstructs the exact package without calling the planner and rejects a planner defect", () => {
  const authenticatedSource = authenticateNativeInstallGitSource(gitFixture());
  const request = installPackageFixture().plan.request;
  const projections = semanticRecoveryAuthorityClasses.map((authorityClass) => ({
    authorityClass,
    repository: request.repository,
    claims: ownedClaims(authorityClass),
    provenanceIdentity: sha256(`provenance:${authorityClass}`),
  }));
  const authoritySourceCommit = authenticatedSource.manifest.sourceCommit;
  const reconstructed = independentlyVerifyRootNativeInstallPackage({ installPackage: null, authenticatedSource, request, projections, authoritySourceCommit });
  assert.equal(reconstructed.ok, true);
  assert.equal(independentlyVerifyRootNativeInstallPackage({ installPackage: reconstructed.package, authenticatedSource, request, projections, authoritySourceCommit }).ok, true);
  const defect = { plan: structuredClone(reconstructed.package.plan), artifacts: reconstructed.package.artifacts.map((entry) => ({ ...entry, bytes: Buffer.from(entry.bytes) })) };
  defect.artifacts[0].bytes[0] ^= 0xff;
  assert.throws(() => independentlyVerifyRootNativeInstallPackage({ installPackage: defect, authenticatedSource, request, projections, authoritySourceCommit }), /package mismatch/u);
  assert.throws(() => independentlyVerifyRootNativeInstallPackage({ installPackage: null, authenticatedSource, request, projections, authoritySourceCommit: "f".repeat(40) }), /independent inputs invalid/u);
});

test("root operation identity cannot be reset by selecting a fresh owner correlation", () => {
  const first = nativeInstallOperationIdentity({ repository: "example/repo", sourceCommit: "a".repeat(40), taskCorrelation: "issue-1012-first" });
  const second = nativeInstallOperationIdentity({ repository: "EXAMPLE/REPO", sourceCommit: "a".repeat(40), taskCorrelation: "issue-1012-second" });
  assert.equal(first, second);
  assert.notEqual(first, nativeInstallOperationIdentity({ repository: "example/repo", sourceCommit: "b".repeat(40) }));
});

class PublicationMemoryFilesystem {
  constructor() { this.final = null; this.stage = null; this.events = []; this.residue = false; this.stageResidue = false; }
  assertAuthorityBoundary() { this.events.push("authority"); }
  finalExists() { return this.final !== null; }
  assertNoPublicationResidue() { if (this.residue || this.stageResidue) throw new Error("residue"); }
  createStage(correlation, mode, uid, gid) { this.events.push(`stage:${correlation}`); this.stage = new Map(); this.stageResidue = true; this.stage.set(semanticRecoveryProtectedLayout.root, directory(mode, uid, gid)); return "stage"; }
  createDirectory(_stage, relative, mode, uid, gid) { const target = path.posix.join(semanticRecoveryProtectedLayout.root, relative); this.stage.set(target, directory(mode, uid, gid)); this.events.push(`mkdir:${relative}`); }
  createFile(_stage, relative, bytes, mode, uid, gid) { const target = path.posix.join(semanticRecoveryProtectedLayout.root, relative); this.stage.set(target, file(bytes, mode, uid, gid)); this.events.push(`write:${relative}`); }
  sealStage(_stage, mode, uid, gid) { assert.equal(this.stage.get(semanticRecoveryProtectedLayout.root).metadata.mode, 0o700); this.stage.set(semanticRecoveryProtectedLayout.root, directory(mode, uid, gid)); this.events.push("seal-stage"); }
  fsyncFile(_stage, relative) { this.events.push(`fsync-file:${relative}`); }
  fsyncDirectory(_stage, relative) { this.events.push(`fsync-dir:${relative}`); }
  fsyncInstalled(plan) {
    for (const entry of plan.files) this.events.push(`fsync-installed-file:${entry.destination}`);
    for (const entry of [...plan.directories].reverse()) this.events.push(`fsync-installed-dir:${entry.destination}`);
    this.events.push("fsync-parent", "fsync-ancestor");
  }
  fsyncPublicationParent() { this.events.push("fsync-parent"); }
  fsyncPublicationAncestor() { this.events.push("fsync-ancestor"); }
  stageView() { return view(this.stage); }
  finalView() { return view(this.final); }
  publishNoReplace() { if (this.final) throw new Error("exists"); this.events.push("rename-noreplace"); this.final = this.stage; this.stage = null; }
  stageExists() { return this.stage !== null; }
  stageResidueExists() { return this.stageResidue; }
  finalizePublishedStage() { if (this.stage !== null) throw new Error("stage present"); this.stageResidue = false; this.events.push("finalize-stage"); }
}
function directory(mode = 0o755, uid = 0, gid = 0) { return { metadata: { type: "directory", symlink: false, uid, gid, mode, nlink: 2, size: 0 }, bytes: null }; }
function file(bytes, mode = 0o444, uid = 0, gid = 0) { return { metadata: { type: "file", symlink: false, uid, gid, mode, nlink: 1, size: bytes.length }, bytes: Buffer.from(bytes) }; }
function view(entries) {
  return {
    inspect: (target) => entries?.get(target)?.metadata ? { ...entries.get(target).metadata } : null,
    read: (target) => Buffer.from(entries.get(target).bytes),
    realpath: (target) => entries.get(target)?.realpath ?? target,
    list(directoryPath) {
      const prefix = `${directoryPath}/`;
      return [...entries.keys()].filter((target) => target.startsWith(prefix) && !target.slice(prefix.length).includes("/")).map((target) => target.slice(prefix.length)).sort();
    },
  };
}

function rebindInstallPackage(installPackage, mutate) {
  const plan = structuredClone(installPackage.plan);
  const artifacts = installPackage.artifacts.map((entry) => ({ ...structuredClone({ ...entry, bytes: undefined }), bytes: Buffer.from(entry.bytes) }));
  mutate({ plan, artifacts });
  delete plan.planDigest;
  const manifestCore = structuredClone(plan);
  delete manifestCore.installManifestDigest;
  manifestCore.files = manifestCore.files.filter((entry) => entry.kind !== "install_manifest");
  plan.installManifestDigest = sha256(canonicalJson(manifestCore));
  const manifestDocument = structuredClone(plan);
  manifestDocument.files = manifestDocument.files.filter((entry) => entry.kind !== "install_manifest");
  const manifestBytes = Buffer.from(canonicalJson(manifestDocument));
  const manifestFile = plan.files.find((entry) => entry.kind === "install_manifest");
  const manifestArtifact = artifacts.find((entry) => entry.kind === "install_manifest");
  manifestFile.sha256 = sha256(manifestBytes); manifestFile.byteCount = manifestBytes.length;
  manifestArtifact.sha256 = manifestFile.sha256; manifestArtifact.byteCount = manifestBytes.length; manifestArtifact.bytes = manifestBytes;
  plan.planDigest = sha256(canonicalJson(plan));
  return { plan, artifacts };
}
function publicationJournal() {
  const transitions = [];
  let state = "root_plan_verified";
  return { transitions, transition(expected, next) { assert.equal(state, expected); transitions.push(`${expected}->${next}`); state = next; } };
}
function freshAuthority(installPackage) { return () => installPackage; }

test("exact fixture installation fsyncs every created file/directory and both publication boundaries before verified completion", () => {
  const installPackage = installPackageFixture();
  const filesystem = new PublicationMemoryFilesystem();
  const journal = publicationJournal();
  const result = publishOrAdoptVerifiedNativeInstall({
    installPackage, correlation: "issue-1012-fixture", filesystem, journal,
    reauthenticate() { filesystem.events.push("authority-edge"); return installPackage; },
  });
  assert.equal(result.installed, true);
  assert.equal(verifyInstalledSemanticRecoveryNativeProducer({ plan: installPackage.plan, filesystem: filesystem.finalView() }).ok, true);
  assert.equal(filesystem.events.filter((entry) => entry.startsWith("fsync-file:")).length, installPackage.artifacts.length);
  assert.equal(filesystem.events.filter((entry) => entry.startsWith("fsync-dir:")).length >= (installPackage.plan.directories.length - 1) * 2 + installPackage.artifacts.length + 1, true);
  assert.equal(filesystem.events.indexOf("authority-edge") > filesystem.events.indexOf("fsync-parent"), true);
  assert.equal(filesystem.events.indexOf("authority-edge") < filesystem.events.indexOf("rename-noreplace"), true);
  assert.equal(filesystem.events.at(-2), "fsync-parent");
  assert.equal(filesystem.events.at(-1), "fsync-ancestor");
  assert.deepEqual(journal.transitions, ["root_plan_verified->publication_intent_durable", "publication_intent_durable->publication_started", "publication_started->installed_verified"]);
});

test("publication-edge root reauthentication is mandatory and changed authority blocks before intent or rename", () => {
  const installPackage = installPackageFixture();
  const filesystem = new PublicationMemoryFilesystem();
  const journal = publicationJournal();
  assert.throws(() => publishOrAdoptVerifiedNativeInstall({
    installPackage,
    correlation: "issue-1012-fixture",
    filesystem,
    journal,
    reauthenticate: freshAuthority(rebindInstallPackage(installPackage, ({ artifacts }) => { artifacts.at(-1).bytes[0] ^= 0xff; })),
  }), /authority changed at publication edge/u);
  assert.equal(filesystem.events.includes("rename-noreplace"), false);
  assert.deepEqual(journal.transitions, []);
  assert.equal(filesystem.stageExists("stage"), true);
});

test("exact existing installation adopts without rewrite while conflict and residue remain untouched", () => {
  const installPackage = installPackageFixture();
  const filesystem = new PublicationMemoryFilesystem();
  publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem, journal: publicationJournal(), reauthenticate: freshAuthority(installPackage) });
  const before = canonicalJson([...filesystem.final].map(([target, entry]) => [target, entry.metadata, entry.bytes?.toString("base64")]));
  filesystem.events.length = 0;
  const journal = publicationJournal();
  const adopted = publishOrAdoptVerifiedNativeInstall({
    installPackage, correlation: "issue-1012-fixture", filesystem, journal,
    reauthenticate() { filesystem.events.push("authority-edge"); return installPackage; },
  });
  assert.equal(adopted.adopted, true);
  assert.equal(canonicalJson([...filesystem.final].map(([target, entry]) => [target, entry.metadata, entry.bytes?.toString("base64")])), before);
  assert.equal(filesystem.events[0], "authority");
  assert.equal(filesystem.events.filter((entry) => entry.startsWith("fsync-installed-file:")).length, installPackage.plan.files.length);
  assert.equal(filesystem.events.filter((entry) => entry.startsWith("fsync-installed-dir:")).length, installPackage.plan.directories.length);
  assert.equal(filesystem.events.indexOf("authority-edge") > filesystem.events.lastIndexOf("fsync-ancestor"), true);
  assert.deepEqual(journal.transitions, ["root_plan_verified->adopted_verified"]);
  const conflict = new PublicationMemoryFilesystem(); conflict.final = new Map([[semanticRecoveryProtectedLayout.root, directory()], [`${semanticRecoveryProtectedLayout.root}/extra`, file(Buffer.from("x"))]]);
  const conflictBefore = canonicalJson([...conflict.final]);
  assert.throws(() => publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem: conflict, journal: publicationJournal(), reauthenticate: freshAuthority(installPackage) }), /conflicts/u);
  assert.equal(canonicalJson([...conflict.final]), conflictBefore);
  const residue = new PublicationMemoryFilesystem(); residue.residue = true;
  assert.throws(() => publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem: residue, journal: publicationJournal(), reauthenticate: freshAuthority(installPackage) }), /residue/u);
  assert.equal(residue.stage, null);
});

test("deep path, forbidden-effect and installed metadata fixtures reach their specific validators after valid outer bindings", () => {
  const original = installPackageFixture();
  const planMutations = [
    ["traversal", ({ plan, artifacts }) => { const file = plan.files.find((entry) => entry.kind === "authority_store"); const artifact = artifacts.find((entry) => entry.destination === file.destination); file.destination = `${semanticRecoveryProtectedLayout.root}/stores/../escape.json`; artifact.destination = file.destination; }, "semantic_native_install_file_invalid"],
    ["absolute", ({ plan, artifacts }) => { const file = plan.files.find((entry) => entry.kind === "authority_store"); const artifact = artifacts.find((entry) => entry.destination === file.destination); file.destination = "/tmp/escape.json"; artifact.destination = file.destination; }, "semantic_native_install_file_invalid"],
    ["grant", ({ plan }) => { const file = plan.files.find((entry) => entry.kind === "authority_store"); file.kind = "operation_grant"; }, "semantic_native_install_file_kind_invalid"],
    ["successor", ({ plan }) => { const file = plan.files.find((entry) => entry.kind === "authority_store"); file.kind = "semantic_successor"; }, "semantic_native_install_file_kind_invalid"],
  ];
  for (const effectKind of ["service", "socket", "timer", "sudoers", "user", "group", "credential", "secret", "network", "arbitrary_command"]) {
    planMutations.push([effectKind, ({ plan }) => { plan.serviceEffects = [{ kind: effectKind, action: "inject" }]; }, "semantic_native_install_plan_invalid"]);
  }
  for (const [name, mutate, detail] of planMutations) {
    const rebound = rebindInstallPackage(original, mutate);
    const result = verifySemanticRecoveryNativeInstallPlan(rebound);
    assert.equal(result.ok, false, name);
    assert.equal(result.detailCode, detail, name);
  }

  const mutations = [
    ["symlink", (entry) => { entry.metadata.symlink = true; }, "semantic_native_installed_file_symlink_drift"],
    ["owner", (entry) => { entry.metadata.uid = 1000; }, "semantic_native_installed_file_owner_drift"],
    ["group", (entry) => { entry.metadata.gid = 1000; }, "semantic_native_installed_file_group_drift"],
    ["mode", (entry) => { entry.metadata.mode = 0o666; }, "semantic_native_installed_file_mode_drift"],
    ["hardlink", (entry) => { entry.metadata.nlink = 2; }, "semantic_native_installed_file_link_count_drift"],
    ["bytes", (entry) => { entry.bytes[0] ^= 0xff; }, "semantic_native_installed_file_digest_drift"],
    ["realpath", (entry) => { entry.realpath = "/outside"; }, "semantic_native_installed_file_realpath_drift"],
  ];
  for (const [name, mutate, detail] of mutations) {
    const filesystem = new PublicationMemoryFilesystem();
    publishOrAdoptVerifiedNativeInstall({ installPackage: original, correlation: "issue-1012-fixture", filesystem, journal: publicationJournal(), reauthenticate: freshAuthority(original) });
    const target = original.plan.files[0].destination;
    mutate(filesystem.final.get(target));
    const result = verifyInstalledSemanticRecoveryNativeProducer({ plan: original.plan, filesystem: filesystem.finalView() });
    assert.equal(result.ok, false, name);
    assert.equal(result.detailCode, detail, name);
  }
});

const journalIdentity = Object.freeze({
  correlation: "issue-1012-fixture", repository: "example/repo", sourceCommit: "a".repeat(40), operationId: "b".repeat(64), observedAt: "2026-08-03T12:00:00.000Z",
});
const emptyResult = (reasonCode, extras = {}) => ({ outcome: "none", reasonCode, requestDigest: null, sourceManifestDigest: null, planDigest: null, installedDigest: null, process: null, ...extras });

test("journal compare-and-swap persists temp, file fsync, replace, directory fsync and exact readback", () => {
  const initial = createNativeInstallJournal(journalIdentity);
  let current = initial;
  const events = [];
  const store = {
    read: () => current,
    claimTransition() { events.push("claim-transition"); },
    writeExclusive(bytes) { events.push("write-temp"); this.bytes = bytes; return "temp"; },
    fsyncFile() { events.push("fsync-file"); },
    replace() { events.push("replace"); current = JSON.parse(this.bytes.toString("utf8")); },
    fsyncDirectory() { events.push("fsync-directory"); },
  };
  const next = transitionNativeInstallJournal({
    current: initial, expectedState: "prepared", nextState: "awaiting_interactive_sudo", observedAt: "2026-08-03T12:00:01.000Z",
    persist: (value) => persistNativeInstallJournalTransition({ ...value, store }),
  });
  assert.deepEqual(events, ["claim-transition", "write-temp", "fsync-file", "replace", "fsync-directory"]);
  assert.equal(current.journalDigest, next.journalDigest);
  assert.equal(validateNativeInstallJournal(current).state, "awaiting_interactive_sudo");
});

test("journal interruption windows, corruption, stale correlation and duplicate sudo/publication fail closed", () => {
  const initial = createNativeInstallJournal(journalIdentity);
  assert.throws(() => transitionNativeInstallJournal({ current: initial, expectedState: "sudo_started", nextState: "root_authority_rederived", observedAt: "2026-08-03T12:00:01.000Z", persist() {} }), /transition invalid/u);
  assert.throws(() => validateNativeInstallJournal({ ...initial, sequence: 9 }), /invalid/u);
  let awaiting = transitionNativeInstallJournal({ current: initial, expectedState: "prepared", nextState: "awaiting_interactive_sudo", observedAt: "2026-08-03T12:00:01.000Z", persist() {} });
  let sudo = transitionNativeInstallJournal({ current: awaiting, expectedState: "awaiting_interactive_sudo", nextState: "sudo_started", observedAt: "2026-08-03T12:00:02.000Z", result: emptyResult("native_install_sudo_started"), persist() {} });
  assert.equal(sudo.sudoAttemptCount, 1);
  assert.throws(() => transitionNativeInstallJournal({ current: sudo, expectedState: "awaiting_interactive_sudo", nextState: "sudo_started", observedAt: "2026-08-03T12:00:03.000Z", persist() {} }), /transition invalid/u);
  assert.equal(resumeNativeInstallProtocol({ ownerJournal: sudo, processEvidence: { correlation: sudo.correlation, active: false } }).action, "block_process_result_unknown");
  const wrong = createNativeInstallJournal({ ...journalIdentity, correlation: "issue-1012-other" });
  assert.throws(() => resumeNativeInstallProtocol({ ownerJournal: sudo, rootJournal: wrong }), /correlate/u);
  for (const state of ["installed_verified", "adopted_verified"]) {
    let verified = createNativeInstallJournal(journalIdentity);
    const route = state === "installed_verified"
      ? [["prepared", "awaiting_interactive_sudo"], ["awaiting_interactive_sudo", "sudo_started"], ["sudo_started", "root_authority_rederived"], ["root_authority_rederived", "root_plan_verified"], ["root_plan_verified", "publication_intent_durable"], ["publication_intent_durable", "publication_started"], ["publication_started", "installed_verified"]]
      : [["prepared", "awaiting_interactive_sudo"], ["awaiting_interactive_sudo", "sudo_started"], ["sudo_started", "root_authority_rederived"], ["root_authority_rederived", "root_plan_verified"], ["root_plan_verified", "adopted_verified"]];
    for (const [expectedState, nextState] of route) {
      verified = transitionNativeInstallJournal({ current: verified, expectedState, nextState, observedAt: new Date(Date.parse(verified.updatedAt) + 1000).toISOString(), result: nextState.endsWith("verified") ? { ...emptyResult(`native_install_${nextState}`, { requestDigest: "1".repeat(64), sourceManifestDigest: "2".repeat(64), planDigest: "3".repeat(64), installedDigest: "4".repeat(64) }), outcome: nextState === "adopted_verified" ? "adopted" : "verified" } : null, persist() {} });
    }
    assert.equal(verified.state, state);
    assert.throws(() => transitionNativeInstallJournal({ current: verified, expectedState: state, nextState: "blocked", observedAt: new Date(Date.parse(verified.updatedAt) + 1000).toISOString(), result: { ...emptyResult("native_install_blocked"), outcome: "blocked" }, persist() {} }), /transition invalid/u);
  }
});

function rootResult(state, sequence, overrides = {}) {
  return {
    contract: "settleora_semantic_recovery_native_install_root_result", version: 2,
    correlation: journalIdentity.correlation, repository: journalIdentity.repository,
    sourceCommit: journalIdentity.sourceCommit, operationId: journalIdentity.operationId,
    state, outcome: state === "completed" ? "completed" : state === "blocked" ? "blocked" : state === "adopted_verified" ? "adopted" : state === "publication_ambiguous" ? "ambiguous" : "verified",
    reasonCode: `native_install_${state}`, planDigest: "3".repeat(64), installedDigest: state === "publication_ambiguous" ? null : "4".repeat(64),
    rootJournalDigest: sequence.toString(16).padStart(64, "0"), rootJournalSequence: sequence,
    ...overrides,
  };
}

test("root results are append-only journal-sequenced monotonic records that reject stale or conflicting regressions", () => {
  assert.equal(validateRootResultTransition(rootResult("publication_ambiguous", 7), rootResult("installed_verified", 8)), true);
  assert.equal(validateRootResultTransition(rootResult("installed_verified", 8), rootResult("completed", 9)), true);
  assert.equal(validateRootResultTransition(rootResult("publication_ambiguous", 7), rootResult("completed", 9)), true);
  for (const [before, after] of [
    [rootResult("completed", 9), rootResult("publication_ambiguous", 10)],
    [rootResult("blocked", 5), rootResult("completed", 6)],
    [rootResult("installed_verified", 8), rootResult("completed", 8)],
    [rootResult("installed_verified", 8), rootResult("completed", 9, { sourceCommit: "f".repeat(40) })],
  ]) assert.throws(() => validateRootResultTransition(before, after), /monotonic transition invalid/u);
});

test("root-result publication uses an atomic same-directory no-clobber link and recovers an exact post-link crash", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-root-result-"));
  try {
    const value = rootResult("blocked", 3, {
      reasonCode: "native_install_root_github_rate_budget_refused",
      planDigest: null,
      installedDigest: null,
    });
    const bytes = Buffer.from(`${canonicalJson(value)}\n`);
    const temporary = path.join(root, `.${value.operationId}.${"1".repeat(24)}.tmp`);
    const finalPath = path.join(root, `${value.operationId}.${value.rootJournalSequence}.${value.rootJournalDigest}.json`);
    writeFileSync(temporary, bytes, { mode: 0o444 });
    chmodSync(temporary, 0o444);
    const published = publishNativeInstallRootResultNoReplace({
      temporary,
      finalPath,
      bytes,
      operationId: value.operationId,
      expectedUid: process.getuid(),
      expectedGid: process.getgid(),
    });
    assert.deepEqual(published, value);
    assert.equal(existsSync(temporary), false);
    assert.equal(readFileSync(finalPath).equals(bytes), true);
    assert.equal(lstatSync(finalPath).nlink, 1);

    const duplicate = path.join(root, `.${value.operationId}.${"2".repeat(24)}.tmp`);
    writeFileSync(duplicate, bytes, { mode: 0o444 });
    chmodSync(duplicate, 0o444);
    assert.deepEqual(publishNativeInstallRootResultNoReplace({
      temporary: duplicate,
      finalPath,
      bytes,
      operationId: value.operationId,
      expectedUid: process.getuid(),
      expectedGid: process.getgid(),
    }), value);
    assert.equal(existsSync(duplicate), false);

    const later = rootResult("blocked", 4, {
      reasonCode: "native_install_root_authority_evidence_refused",
      planDigest: null,
      installedDigest: null,
      rootJournalDigest: "d".repeat(64),
    });
    const laterBytes = Buffer.from(`${canonicalJson(later)}\n`);
    const stranded = path.join(root, `.${later.operationId}.${"3".repeat(24)}.tmp`);
    const laterFinal = path.join(root, `${later.operationId}.${later.rootJournalSequence}.${later.rootJournalDigest}.json`);
    writeFileSync(stranded, laterBytes, { mode: 0o444 });
    chmodSync(stranded, 0o444);
    assert.throws(() => publishNativeInstallRootResultNoReplace({
      temporary: stranded,
      finalPath: laterFinal,
      bytes: laterBytes,
      operationId: later.operationId,
      expectedUid: process.getuid(),
      expectedGid: process.getgid(),
      linkNoReplace(source, destination) {
        linkSync(source, destination);
        const error = new Error("injected post-link transport loss");
        error.code = "EIO";
        throw error;
      },
    }), /no-clobber publication failed/u);
    assert.equal(existsSync(stranded), true);
    assert.equal(existsSync(laterFinal), true);
    assert.equal(lstatSync(stranded).nlink, 2);
    assert.equal(lstatSync(laterFinal).nlink, 2);

    assert.deepEqual(recoverNativeInstallRootResultNoReplaceLinks({
      root,
      operationId: later.operationId,
      expectedUid: process.getuid(),
      expectedGid: process.getgid(),
    }), { recovered: 1 });
    assert.equal(existsSync(stranded), false);
    assert.equal(lstatSync(laterFinal).nlink, 1);
    assert.equal(readFileSync(laterFinal).equals(laterBytes), true);

    const atomicValue = rootResult("blocked", 5, {
      reasonCode: "native_install_root_operation_blocked",
      planDigest: null,
      installedDigest: null,
      rootJournalDigest: "e".repeat(64),
    });
    const atomicBytes = Buffer.from(`${canonicalJson(atomicValue)}\n`);
    const atomicTemporary = path.join(root, `.${atomicValue.operationId}.${"4".repeat(24)}.tmp`);
    const atomicPrefix = `..atomic-${sha256(path.basename(atomicTemporary)).slice(0, 32)}-`;
    const atomicStaging = path.join(root, `${atomicPrefix}${"5".repeat(24)}.partial`);
    writeFileSync(atomicStaging, atomicBytes, { mode: 0o444 });
    chmodSync(atomicStaging, 0o444);
    linkSync(atomicStaging, atomicTemporary);
    assert.equal(lstatSync(atomicStaging).nlink, 2);
    assert.deepEqual(readNativeInstallRootResultTemporaryFromDirectory({
      root,
      operationId: atomicValue.operationId,
      expectedUid: process.getuid(),
      expectedGid: process.getgid(),
    }), atomicValue);
    assert.equal(existsSync(atomicStaging), true);
    assert.deepEqual(recoverNativeInstallRootResultNoReplaceLinks({
      root,
      operationId: atomicValue.operationId,
      expectedUid: process.getuid(),
      expectedGid: process.getgid(),
    }), { recovered: 1 });
    assert.equal(existsSync(atomicStaging), false);
    assert.equal(existsSync(atomicTemporary), true);
    assert.equal(lstatSync(atomicTemporary).nlink, 1);
    unlinkSync(atomicTemporary);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("root failure diagnostics preserve only fixed allowlisted reason codes", () => {
  const pythonFailure = {
    status: 1,
    signal: null,
    error: null,
    stdout: "",
    stderr: "Traceback (most recent call last):\nRuntimeError: semantic_native_public_github_rate_budget_refused\n",
  };
  assert.equal(classifyPublicSemanticRecoveryGithubProcessFailure(pythonFailure), "semantic_native_public_github_rate_budget_refused");
  assert.throws(() => readPublicSemanticRecoveryGithubRoute("repos/tommytang213/Settleora", {
    minimumRateRemaining: 30,
    command: () => pythonFailure,
  }), /semantic_native_public_github_rate_budget_refused/u);
  assert.equal(classifyNativeInstallRootFailure(new Error("semantic_native_public_github_rate_budget_refused")), "native_install_root_github_rate_budget_refused");
  assert.equal(classifyNativeInstallRootReaderProcess({
    status: 1, signal: null, error: null, stdout: "",
    stderr: "native installation blocked: native_install_root_github_rate_budget_refused\n",
  }), "native_install_root_github_rate_budget_refused");
  assert.equal(classifyNativeInstallRootFailure(new Error("native_install_root_secret_token_exposed")), "native_install_root_operation_blocked");
  assert.equal(classifyNativeInstallRootReaderProcess({
    status: 1, signal: null, error: null, stdout: "",
    stderr: "native installation blocked: native_install_root_secret_token_exposed\n",
  }), "native_install_root_authority_reader_failed");
  for (const stderr of [Buffer.alloc(0), "x".repeat(64 * 1024 + 1)]) {
    assert.equal(classifyNativeInstallRootReaderProcess({
      status: 0, signal: null, error: null, stdout: "{}\n", stderr,
    }), "native_install_root_authority_reader_stderr_refused");
    assert.equal(classifyPublicSemanticRecoveryGithubProcessFailure({
      status: 0, signal: null, error: null, stdout: "{}", stderr,
    }), "semantic_native_public_github_stderr_refused");
  }
  const secret = "Bearer fake-health-token";
  const classified = classifyNativeInstallRootFailure(new Error(secret));
  assert.equal(classified, "native_install_root_operation_blocked");
  assert.doesNotMatch(classified, /secret|Bearer|token/u);
});

test("source-owned handoff accepts readback-required arm results without a second sudo attempt", () => {
  for (const reasonCode of ["native_install_interactive_handoff_completed", "native_install_interactive_handoff_requires_readback"]) {
    assert.deepEqual(decideNativeInstallHandoffControllerStep({ mode: "arm", result: { reasonCode, sudoAttemptCount: 1 } }), {
      action: "resume_readback_only", sudoAllowed: false, terminal: false,
    });
  }
  assert.throws(() => decideNativeInstallHandoffControllerStep({
    mode: "arm", result: { reasonCode: "native_install_unexpected", sudoAttemptCount: 1 },
  }), /reason mismatch/u);
  assert.throws(() => decideNativeInstallHandoffControllerStep({
    mode: "arm", result: { reasonCode: "native_install_interactive_handoff_requires_readback", sudoAttemptCount: 2 },
  }), /sudo attempt identity/u);
  assert.deepEqual(decideNativeInstallHandoffControllerStep({
    mode: "resume",
    result: { reasonCode: "native_install_root_result_blocked", sudoAttemptCount: 1, rootFailureReasonCode: "native_install_root_github_rate_budget_refused" },
  }), {
    action: "block", sudoAllowed: false, terminal: true, rootFailureReasonCode: "native_install_root_github_rate_budget_refused",
  });
  assert.deepEqual(decideNativeInstallHandoffControllerStep({
    mode: "resume",
    result: { reasonCode: "native_install_result_requires_readback", sudoAttemptCount: 1 },
  }), {
    action: "validate_installed_readback", sudoAllowed: false, terminal: false,
  });
  assert.throws(() => decideNativeInstallHandoffControllerStep({
    mode: "resume",
    result: { reasonCode: "native_install_root_result_blocked", sudoAttemptCount: 1, rootFailureReasonCode: "native_install_root_secret_token_exposed" },
  }), /root failure reason invalid/u);
});

test("generated Windows OpenSSH coordinator restores only validated ProgramData and closes preflight stdin", () => {
  const source = renderNativeInstallWindowsSshCoordinatorSource();
  assert.match(source, /CommonApplicationData/u);
  assert.match(source, /ConvertTo-CanonicalTrustedDrivePath \$programData 'ssh_programdata'/u);
  assert.match(source, /EnvironmentVariables\.Clear\(\)/u);
  assert.match(source, /EnvironmentVariables\['ProgramData'\] = \$programData/u);
  assert.match(source, /RedirectStandardInput = \$true[\s\S]*StandardInput\.Close\(\)/u);
  assert.match(source, /execute_stdin_must_remain_interactive/u);
  assert.doesNotMatch(source, /GetEnvironmentVariables\(|EnvironmentVariables\['APPDATA'\]|EnvironmentVariables\['SSH_AUTH_SOCK'\]/u);
});

test("generated remote handoff flow resumes both valid arm outcomes and contains one arm invocation", () => {
  const source = renderNativeInstallRemoteControllerFlowSource();
  assert.match(source, /native_install_interactive_handoff_completed\|native_install_interactive_handoff_requires_readback/u);
  assert.match(source, /run_immutable_controller --resume/u);
  assert.match(source, /native_install_root_result_blocked\|native_install_root_result_requires_recovery/u);
  assert.match(source, /native_install_root_github_rate_budget_refused/u);
  assert.match(source, /persist_result BLOCKED "\$FAILURE_REASON" "\$admin_outcome" "\$resume_reason" false/u);
  assert.equal((source.match(/run_immutable_controller --arm-interactive-sudo/gu) || []).length, 1);
  assert.doesNotMatch(source, /--recover-interactive-sudo|rawSensitiveOutputRetained":true/u);
});


test("closed handoff renderer CLI emits only the selected source-owned fragment", () => {
  const renderer = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../render-semantic-recovery-native-install-handoff.mjs");
  const windows = spawnSync(process.execPath, [renderer, "--windows-ssh-coordinator"], { encoding: "utf8" });
  assert.equal(windows.status, 0, windows.stderr);
  assert.match(windows.stdout, /EnvironmentVariables\['ProgramData'\]/u);
  assert.equal(windows.stderr, "");
  const remote = spawnSync(process.execPath, [renderer, "--remote-controller-flow"], { encoding: "utf8" });
  assert.equal(remote.status, 0, remote.stderr);
  assert.match(remote.stdout, /native_install_interactive_handoff_requires_readback/u);
  const invalid = spawnSync(process.execPath, [renderer, "--arbitrary"], { encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.equal(invalid.stdout, "");
});


test("root-result observation prefers the latest monotonic final or temporary state and rejects conflicts", () => {
  const ambiguous = rootResult("publication_ambiguous", 7);
  const verified = rootResult("installed_verified", 8);
  const completed = rootResult("completed", 9);
  assert.deepEqual(selectFixedNativeInstallRootResultObservation(null, ambiguous), { value: ambiguous, publication: "temporary" });
  assert.deepEqual(selectFixedNativeInstallRootResultObservation(verified, null), { value: verified, publication: "final" });
  assert.deepEqual(selectFixedNativeInstallRootResultObservation(ambiguous, verified), { value: verified, publication: "temporary" });
  assert.deepEqual(selectFixedNativeInstallRootResultObservation(completed, verified), { value: completed, publication: "final" });
  assert.throws(() => selectFixedNativeInstallRootResultObservation(
    rootResult("blocked", 5, { planDigest: null, installedDigest: null }),
    completed,
  ), /monotonic transition invalid/u);
  assert.throws(() => selectFixedNativeInstallRootResultObservation(
    verified,
    structuredClone({ ...verified, reasonCode: "native_install_changed" }),
  ), /observation conflict/u);
});

test("root-result retry publishes an authenticated older state before appending completion", () => {
  const ambiguous = rootResult("publication_ambiguous", 7);
  const completed = rootResult("completed", 9, { installedDigest: "4".repeat(64) });
  assert.deepEqual(classifyFixedNativeInstallRootResultTemporaries(null, completed, [ambiguous]), { action: "publish_prior", index: 0 });
  assert.deepEqual(classifyFixedNativeInstallRootResultTemporaries(ambiguous, completed, [completed, completed]), { action: "reuse_current", index: 0 });
  assert.deepEqual(classifyFixedNativeInstallRootResultTemporaries(ambiguous, completed, []), { action: "create", index: null });
  assert.throws(
    () => classifyFixedNativeInstallRootResultTemporaries(null, completed, [ambiguous, rootResult("installed_verified", 8)]),
    /conflicting root result temporary/u,
  );
});

test("already-published result coalesces only exact raced temporaries and rejects poison residue", () => {
  const completed = rootResult("completed", 9, { installedDigest: "4".repeat(64) });
  assert.deepEqual(classifyFixedNativeInstallPublishedResidue(completed, [structuredClone(completed), structuredClone(completed)]), {
    action: "remove_exact", count: 2,
  });
  assert.throws(
    () => classifyFixedNativeInstallPublishedResidue(completed, [rootResult("publication_ambiguous", 7)]),
    /conflicting root result temporary/u,
  );
});

test("publication-edge corroboration requires planner and verifier encoded packages and compares decoded expected bytes", () => {
  const installPackage = installPackageFixture();
  const encoded = {
    plan: installPackage.plan,
    artifacts: installPackage.artifacts.map(({ bytes, ...artifact }) => ({ ...artifact, bytesBase64: bytes.toString("base64") })),
  };
  const output = { package: encoded, planDigest: installPackage.plan.planDigest, requestDigest: installPackage.plan.requestDigest, sourceManifestDigest: "5".repeat(64) };
  const corroborated = corroborateNativeInstallRootReaderOutputs([structuredClone(output), structuredClone(output)], installPackage);
  assert.equal(Buffer.isBuffer(corroborated.package.artifacts[0].bytes), true);
  assert.throws(() => corroborateNativeInstallRootReaderOutputs([output], installPackage), /planner\/verifier mismatch/u);
  const changed = structuredClone(output); changed.planDigest = "6".repeat(64);
  assert.throws(() => corroborateNativeInstallRootReaderOutputs([output, changed], installPackage), /planner\/verifier mismatch/u);
});

test("root GitHub reader uses fixed public TLS transport with no HOME, token, config, redirect, or route argv", () => {
  let captured;
  const value = readPublicSemanticRecoveryGithubRoute("repos/tommytang213/Settleora", { command(executable, args, options) {
    captured = { executable, args, options };
    return { status: 0, signal: null, error: null, stderr: "", stdout: "{\"default_branch\":\"main\"}\n" };
  } });
  assert.deepEqual(value, { default_branch: "main" });
  assert.equal(captured.executable, "/usr/bin/python3");
  assert.deepEqual(captured.args.slice(0, 2), ["-I", "-c"]);
  assert.equal(captured.args.includes("repos/tommytang213/Settleora"), false);
  assert.deepEqual(JSON.parse(captured.options.input), { minimumRateRemaining: 0, route: "repos/tommytang213/Settleora" });
  assert.deepEqual(captured.options.env, { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" });
  assert.match(captured.args[2], /HTTPSConnection\("api\.github\.com", 443/u);
  assert.match(captured.args[2], /response\.status != 200/u);
  assert.match(captured.args[2], /X-RateLimit-Remaining/u);
  assert.throws(() => readPublicSemanticRecoveryGithubRoute("https://attacker.invalid/"), /semantic_native_public_github_route_invalid/u);
});

test("one root reader reuses one rate-reserved GitHub snapshot while separate readers remain independent", () => {
  const calls = [];
  const read = (route, options) => { calls.push({ route, options }); return { route, ordinal: calls.length }; };
  const first = createPublicSemanticRecoveryGithubSnapshotReader({ minimumRateRemaining: 24, read });
  assert.deepEqual(first("route-a"), { route: "route-a", ordinal: 1 });
  assert.deepEqual(first("route-a"), { route: "route-a", ordinal: 1 });
  first("route-b");
  const second = createPublicSemanticRecoveryGithubSnapshotReader({ minimumRateRemaining: 12, read });
  assert.deepEqual(second("route-a"), { route: "route-a", ordinal: 3 });
  assert.deepEqual(calls, [
    { route: "route-a", options: { minimumRateRemaining: 24 } },
    { route: "route-b", options: { minimumRateRemaining: 24 } },
    { route: "route-a", options: { minimumRateRemaining: 12 } },
  ]);
  const fullPage = createPublicSemanticRecoveryGithubSnapshotReader({
    read: () => Array.from({ length: 100 }, (_, index) => ({ index })),
  });
  assert.throws(() => fullPage("full-page"), /paginated snapshot unsupported/u);
});

test("recovery reader is explicitly historical and canonical control records use an ignored durable staging namespace", () => {
  const installer = readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../semantic-recovery-native-install.mjs"), "utf8");
  const publication = readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../lib/semantic-recovery-native-install-publication.mjs"), "utf8");
  const bootstrap = readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../semantic-recovery-native-install-bootstrap.sh"), "utf8");
  assert.match(installer, /historicalVerification: phase === "recovery"/u);
  assert.match(installer, /verificationNow: value\.historicalVerification \? observedAt : new Date\(\)/u);
  assert.match(publication, /\.\.atomic-[\s\S]*\.partial/u);
  assert.match(publication, /fchmodSync\(fd, mode\)[\s\S]*fsyncSync\(fd\)[\s\S]*linkSync\(staging, finalPath\)/u);
  assert.equal(publication.indexOf("linkSync(staging, finalPath)") < publication.indexOf("unlinkSync(staging)"), true);
  assert.match(publication, /finishAtomicNoClobberLink\(\{ root, finalPath: claim/u);
  assert.match(bootstrap, /os\.link\(temporary, final,[\s\S]*os\.fsync\(directory_fd\)[\s\S]*os\.unlink\(temporary,[\s\S]*os\.fsync\(directory_fd\)/u);
  assert.match(bootstrap, /pathname\.st_nlink == 2[\s\S]*root file link recovery ambiguous/u);
  assert.match(bootstrap, /"ownerJournal": owner/u);
  assert.doesNotMatch(bootstrap, /owner_name =/u);
});

test("the production root-result builder emits the exact accepted versioned schema", () => {
  let journal = createNativeInstallJournal(journalIdentity);
  const route = [
    ["prepared", "awaiting_interactive_sudo", null],
    ["awaiting_interactive_sudo", "sudo_started", emptyResult("native_install_sudo_started")],
    ["sudo_started", "root_authority_rederived", { ...emptyResult("native_install_root_authority_rederived", { requestDigest: "1".repeat(64) }), outcome: "verified" }],
    ["root_authority_rederived", "root_plan_verified", { ...emptyResult("native_install_root_plan_verified", { requestDigest: "1".repeat(64), planDigest: "3".repeat(64) }), outcome: "verified" }],
    ["root_plan_verified", "adopted_verified", { ...emptyResult("native_install_adopted_verified", { requestDigest: "1".repeat(64), planDigest: "3".repeat(64), installedDigest: "4".repeat(64) }), outcome: "adopted" }],
    ["adopted_verified", "completed", { ...emptyResult("native_install_completed", { requestDigest: "1".repeat(64), planDigest: "3".repeat(64), installedDigest: "4".repeat(64) }), outcome: "completed" }],
  ];
  for (const [expectedState, nextState, result] of route) {
    journal = transitionNativeInstallJournal({ current: journal, expectedState, nextState, observedAt: new Date(Date.parse(journal.updatedAt) + 1000).toISOString(), result, persist() {} });
  }
  const result = buildFixedNativeInstallRootResult({ correlation: journal.correlation, repository: journal.repository, sourceCommit: journal.sourceCommit, journal });
  assert.equal(result.version, 2);
  assert.equal(result.rootJournalSequence, journal.sequence);
  assert.equal(result.rootJournalDigest, journal.journalDigest);
  assert.equal(result.state, "completed");
});

test("root journal is bound to the exact armed owner transition digest", () => {
  let owner = createNativeInstallJournal(journalIdentity);
  owner = transitionNativeInstallJournal({ current: owner, expectedState: "prepared", nextState: "awaiting_interactive_sudo", observedAt: "2026-08-03T12:00:01.000Z", persist() {} });
  owner = transitionNativeInstallJournal({ current: owner, expectedState: "awaiting_interactive_sudo", nextState: "sudo_started", observedAt: "2026-08-03T12:00:02.000Z", result: emptyResult("native_install_sudo_started"), persist() {} });
  const root = createNativeInstallJournal({ ...journalIdentity, ownerTransitionDigest: owner.journalDigest, observedAt: "2026-08-03T12:00:02.000Z" });
  assert.equal(correlateNativeInstallJournals({ ownerJournal: owner, rootJournal: root }).ok, true);
  const wrong = createNativeInstallJournal({ ...journalIdentity, ownerTransitionDigest: "f".repeat(64), observedAt: "2026-08-03T12:00:02.000Z" });
  assert.throws(() => correlateNativeInstallJournals({ ownerJournal: owner, rootJournal: wrong }), /correlate/u);
});

test("restart before every journal boundary never duplicates sudo or publication and only ambiguity permits readback", () => {
  const steps = [
    ["prepared", "awaiting_interactive_sudo", null],
    ["awaiting_interactive_sudo", "sudo_started", emptyResult("native_install_sudo_started")],
    ["sudo_started", "root_authority_rederived", emptyResult("native_install_root_authority_rederived", { requestDigest: "1".repeat(64), sourceManifestDigest: "2".repeat(64) })],
    ["root_authority_rederived", "root_plan_verified", emptyResult("native_install_root_plan_verified", { requestDigest: "1".repeat(64), sourceManifestDigest: "2".repeat(64), planDigest: "3".repeat(64) })],
    ["root_plan_verified", "publication_intent_durable", emptyResult("native_install_publication_intent_durable", { planDigest: "3".repeat(64) })],
    ["publication_intent_durable", "publication_started", { ...emptyResult("native_install_publication_started", { planDigest: "3".repeat(64) }), outcome: "ambiguous" }],
    ["publication_started", "publication_ambiguous", { ...emptyResult("native_install_publication_ambiguous", { planDigest: "3".repeat(64) }), outcome: "ambiguous" }],
    ["publication_ambiguous", "installed_verified", { ...emptyResult("native_install_installed_verified", { planDigest: "3".repeat(64), installedDigest: "4".repeat(64) }), outcome: "verified" }],
    ["installed_verified", "completed", { ...emptyResult("native_install_completed", { planDigest: "3".repeat(64), installedDigest: "4".repeat(64) }), outcome: "completed" }],
  ];
  let journal = createNativeInstallJournal(journalIdentity);
  for (let index = 0; index < steps.length; index += 1) {
    const before = resumeNativeInstallProtocol({ ownerJournal: journal });
    assert.equal(before.mutationAllowed, false, journal.state);
    assert.equal(before.sudoAllowed, journal.state === "awaiting_interactive_sudo", journal.state);
    if (["publication_started", "publication_ambiguous"].includes(journal.state)) assert.equal(before.action, "readback_only", journal.state);
    const [expectedState, nextState, result] = steps[index];
    journal = transitionNativeInstallJournal({
      current: journal,
      expectedState,
      nextState,
      observedAt: new Date(Date.parse(journalIdentity.observedAt) + (index + 1) * 1000).toISOString(),
      result,
      persist() {},
    });
    assert.equal(journal.sudoAttemptCount <= 1, true);
    assert.equal(journal.publicationAttemptCount <= 1, true);
  }
  assert.equal(journal.sudoAttemptCount, 1);
  assert.equal(journal.publicationAttemptCount, 1);
  const resume = resumeNativeInstallProtocol({ ownerJournal: journal });
  assert.equal(resume.action, "readback_only");
  assert.equal(resume.reasonCode, "native_install_result_requires_readback");
  assert.equal(resume.sudoAttemptCount, 1);
});

test("publication transport ambiguity always selects exact readback and never automatic replay", () => {
  const initial = createNativeInstallJournal(journalIdentity);
  const pathToAmbiguous = [
    ["prepared", "awaiting_interactive_sudo", null],
    ["awaiting_interactive_sudo", "sudo_started", emptyResult("native_install_sudo_started")],
    ["sudo_started", "root_authority_rederived", emptyResult("native_install_root_authority_rederived", { requestDigest: "1".repeat(64), sourceManifestDigest: "2".repeat(64) })],
    ["root_authority_rederived", "root_plan_verified", emptyResult("native_install_root_plan_verified", { requestDigest: "1".repeat(64), sourceManifestDigest: "2".repeat(64), planDigest: "3".repeat(64) })],
    ["root_plan_verified", "publication_intent_durable", emptyResult("native_install_publication_intent_durable", { planDigest: "3".repeat(64) })],
    ["publication_intent_durable", "publication_started", { ...emptyResult("native_install_publication_started", { planDigest: "3".repeat(64) }), outcome: "ambiguous" }],
    ["publication_started", "publication_ambiguous", { ...emptyResult("native_install_publication_ambiguous", { planDigest: "3".repeat(64) }), outcome: "ambiguous" }],
  ];
  let journal = initial;
  for (let index = 0; index < pathToAmbiguous.length; index += 1) {
    const [expectedState, nextState, result] = pathToAmbiguous[index];
    journal = transitionNativeInstallJournal({ current: journal, expectedState, nextState, observedAt: new Date(Date.parse(journalIdentity.observedAt) + (index + 1) * 1000).toISOString(), result, persist() {} });
  }
  const action = resumeNativeInstallProtocol({ ownerJournal: journal });
  assert.deepEqual(action, {
    action: "readback_only", mutationAllowed: false, sudoAllowed: false,
    reasonCode: "native_install_publication_ambiguous", sudoAttemptCount: 1,
  });
  const adopted = resumeNativeInstallProtocol({ ownerJournal: journal, installedReadback: { ok: true, planDigest: "3".repeat(64) } });
  assert.equal(adopted.action, "adopt_verified_result");
  assert.equal(adopted.sudoAttemptCount, 1);
});

test("lost rename transport with surviving private container stays ambiguous and never reports success", () => {
  const installPackage = installPackageFixture();
  const filesystem = new PublicationMemoryFilesystem();
  let calls = 0;
  filesystem.publishNoReplace = function publishThenLoseTransport() {
    calls += 1;
    this.final = this.stage;
    this.stage = null;
    throw new Error("transport lost");
  };
  const journal = publicationJournal();
  assert.throws(
    () => publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem, journal, reauthenticate: freshAuthority(installPackage) }),
    /transport ambiguous/u,
  );
  assert.equal(calls, 1);
  assert.deepEqual(journal.transitions, [
    "root_plan_verified->publication_intent_durable",
    "publication_intent_durable->publication_started",
    "publication_started->publication_ambiguous",
  ]);
  assert.equal(filesystem.stageResidue, true);
});

test("a post-rename durability failure is recorded ambiguous and reconciles by exact readback without replay", () => {
  const installPackage = installPackageFixture();
  const filesystem = new PublicationMemoryFilesystem();
  let parentFsyncs = 0;
  let publications = 0;
  const originalFsync = filesystem.fsyncPublicationParent.bind(filesystem);
  filesystem.fsyncPublicationParent = function failFirstPostRenameFsync() {
    parentFsyncs += 1;
    if (parentFsyncs === 2) throw new Error("simulated post-rename fsync loss");
    originalFsync();
  };
  const originalPublish = filesystem.publishNoReplace.bind(filesystem);
  filesystem.publishNoReplace = function publishOnce() { publications += 1; originalPublish(); };
  const journal = publicationJournal();
  const result = publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem, journal, reauthenticate: freshAuthority(installPackage) });
  assert.equal(result.reasonCode, "native_install_ambiguous_publication_verified");
  assert.equal(publications, 1);
  assert.deepEqual(journal.transitions, [
    "root_plan_verified->publication_intent_durable",
    "publication_intent_durable->publication_started",
    "publication_started->publication_ambiguous",
    "publication_ambiguous->installed_verified",
  ]);
  assert.equal(verifyInstalledSemanticRecoveryNativeProducer({ plan: installPackage.plan, filesystem: filesystem.finalView() }).ok, true);
});

test("verified completion journal and result failures resume by readback without publication replay", () => {
  const installPackage = installPackageFixture();
  const filesystem = new PublicationMemoryFilesystem();
  let publications = 0;
  const originalPublish = filesystem.publishNoReplace.bind(filesystem);
  filesystem.publishNoReplace = function publishOnce() { publications += 1; originalPublish(); };
  let durable = createNativeInstallJournal(journalIdentity);
  const advance = (expectedState, nextState, result = null, persist = () => {}) => {
    const next = transitionNativeInstallJournal({ current: durable, expectedState, nextState, observedAt: new Date(Date.parse(durable.updatedAt) + 1000).toISOString(), result, persist });
    durable = next;
    return next;
  };
  advance("prepared", "awaiting_interactive_sudo");
  advance("awaiting_interactive_sudo", "sudo_started", emptyResult("native_install_sudo_started"));
  advance("sudo_started", "root_authority_rederived", { ...emptyResult("native_install_root_authority_rederived", { requestDigest: installPackage.plan.requestDigest, sourceManifestDigest: "2".repeat(64) }), outcome: "verified" });
  advance("root_authority_rederived", "root_plan_verified", { ...emptyResult("native_install_root_plan_verified", { requestDigest: installPackage.plan.requestDigest, sourceManifestDigest: "2".repeat(64), planDigest: installPackage.plan.planDigest }), outcome: "verified" });
  publishOrAdoptVerifiedNativeInstall({
    installPackage,
    correlation: durable.correlation,
    filesystem,
    journal: { transition(expectedState, nextState, result) { advance(expectedState, nextState, emptyResult(result.reasonCode, result)); } },
    reauthenticate: freshAuthority(installPackage),
  });
  assert.equal(durable.state, "installed_verified");
  const completion = { reasonCode: "native_install_completed", requestDigest: installPackage.plan.requestDigest, sourceManifestDigest: "2".repeat(64), planDigest: installPackage.plan.planDigest };
  assert.throws(() => completeVerifiedNativeInstallResult({
    journal: durable, installPackage, filesystem, completion,
    transition() { throw new Error("simulated pre-durable completion transition failure"); },
    publishResult() { assert.fail("result publication must not run before completion is durable"); },
  }), /pre-durable/u);
  assert.equal(durable.state, "installed_verified");
  let resultAttempts = 0;
  assert.throws(() => completeVerifiedNativeInstallResult({
    journal: durable, installPackage, filesystem, completion,
    transition: ({ current, expectedState, nextState, result }) => {
      const next = transitionNativeInstallJournal({ current, expectedState, nextState, observedAt: new Date(Date.parse(current.updatedAt) + 1000).toISOString(), result: emptyResult(result.reasonCode, result), persist({ next: persisted }) { durable = persisted; } });
      durable = next;
      return next;
    },
    publishResult() { resultAttempts += 1; throw new Error("simulated result transport loss"); },
  }), /result transport/u);
  assert.equal(durable.state, "completed");
  const resumed = completeVerifiedNativeInstallResult({
    journal: durable, installPackage, filesystem, completion,
    transition() { assert.fail("completed recovery must not repeat the journal transition"); },
    publishResult(current) { resultAttempts += 1; assert.equal(current.state, "completed"); },
  });
  assert.equal(resumed.journal.state, "completed");
  assert.equal(resultAttempts, 2);
  assert.equal(publications, 1);
  assert.equal(filesystem.finalExists(), true);
});

test("real TTY/PAM process outcomes are abstracted and argv/environment/journal evidence contain digests only", () => {
  const secret = "health-token-super-secret";
  const sudoArgv = buildNativeInstallSudoArgv({
    sourceCommit: "a".repeat(40), bootstrapBlob: "b".repeat(40), correlation: "issue-1012-fixture",
    operationId: "c".repeat(64), ownerJournalDigest: "d".repeat(64), ownerJournalSha256: "e".repeat(64),
  });
  assert.deepEqual(sudoArgv.slice(0, nativeInstallSudoArgv.length), nativeInstallSudoArgv);
  assert.equal(nativeInstallSudoArgv.at(-1), nativeInstallTrustedBootstrapPath);
  assert.equal(sudoArgv.includes("-c"), false);
  assert.equal(sudoArgv.some((entry) => /set -e|git fetch|[\n\r]/u.test(entry)), false);
  assert.equal(validateInteractiveSudoBoundary({ argv: sudoArgv, env: {}, tty: true, stdinKind: "tty_password_only_no_program_bytes", stdoutKind: "bounded_capture", stderrKind: "bounded_capture" }).ok, true);
  assert.throws(() => buildNativeInstallSudoArgv({
    handoffMode: "recover_readback", sourceCommit: "a".repeat(40), bootstrapBlob: "b".repeat(40), correlation: "issue-1012-fixture",
    operationId: "c".repeat(64), ownerJournalDigest: "d".repeat(64), ownerJournalSha256: "e".repeat(64),
  }), /identity invalid/u);
  assert.throws(() => buildNativeInstallSudoArgv({ handoffMode: "publish", sourceCommit: "a".repeat(40), bootstrapBlob: "b".repeat(40), correlation: "issue-1012-fixture", operationId: "c".repeat(64), ownerJournalDigest: "d".repeat(64), ownerJournalSha256: "e".repeat(64) }), /identity invalid/u);
  for (const changed of [
    { argv: [...sudoArgv, secret] }, { env: { TOKEN: secret } }, { tty: false }, { stdinKind: "password_pipe" },
  ]) {
    assert.throws(() => validateInteractiveSudoBoundary({ argv: sudoArgv, env: {}, tty: true, stdinKind: "tty_password_only_no_program_bytes", stdoutKind: "bounded_capture", stderrKind: "bounded_capture", ...changed }), /boundary invalid/u);
  }
  for (const fixture of [
    { name: "success", status: 0, signal: null, timedOut: false, processLost: false },
    { name: "pam_refusal", status: 1, signal: null, timedOut: false, processLost: false },
    { name: "cancellation", status: 130, signal: null, timedOut: false, processLost: false },
    { name: "tty_eof", status: 2, signal: null, timedOut: false, processLost: false },
    { name: "process_loss", status: null, signal: null, timedOut: false, processLost: true },
    { name: "timeout", status: null, signal: "SIGTERM", timedOut: true, processLost: false },
  ]) {
    const { name, ...processFixture } = fixture;
    const result = sanitizeNativeInstallProcessResult({ ...processFixture, stdout: secret, stderr: secret });
    assert.doesNotMatch(canonicalJson(result), /health-token|super-secret/u);
    assert.equal(result.stdoutSha256, sha256(secret), name);
    assert.equal(result.stderrSha256, sha256(secret), name);
  }
  const process = sanitizeNativeInstallProcessResult({ status: 1, signal: null, timedOut: false, processLost: false, stdout: secret, stderr: secret });
  const armed = transitionNativeInstallJournal({
    current: createNativeInstallJournal(journalIdentity), expectedState: "prepared", nextState: "awaiting_interactive_sudo",
    observedAt: "2026-08-03T12:00:01.000Z", persist() {},
  });
  const journal = transitionNativeInstallJournal({
    current: armed, expectedState: "awaiting_interactive_sudo", nextState: "sudo_started",
    observedAt: "2026-08-03T12:00:02.000Z", result: emptyResult("native_install_sudo_refused", { process }), persist() {},
  });
  for (const evidence of [sudoArgv, {}, process, journal, resumeNativeInstallProtocol({ ownerJournal: journal, processEvidence: { correlation: journal.correlation, active: false } })]) {
    assert.doesNotMatch(canonicalJson(evidence), /health-token|super-secret/u);
  }
});

test("trusted bootstrap records the exact armed receipt before authenticated network acquisition", () => {
  const source = readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../semantic-recovery-native-install-bootstrap.sh"), "utf8");
  assert.match(source, /trusted_path='\/usr\/libexec\/settleora-semantic-recovery-native-install-bootstrap'/u);
  assert.match(source, /stat -Lc '%F:%u:%g:%a:%h'/u);
  assert.match(source, /git hash-object -- "\$trusted_path"/u);
  assert.match(source, /\[\[ "\$handoff_mode" == install \]\] \|\| block/u);
  assert.doesNotMatch(source, /recover_readback|root-bootstrap-recover|root-recovery-internal/u);
  assert.equal(source.indexOf("owner_directory_fd = os.open", 0) < source.indexOf("git -c core.hooksPath=/dev/null", 0), true);
  assert.equal(source.indexOf("os.fsync(root_directory_fd)") < source.indexOf("fetch --quiet"), true);
  assert.match(source, /os\.O_RDONLY \| os\.O_NOFOLLOW, dir_fd=owner_directory_fd/u);
  assert.match(source, /first\.st_size > MAXIMUM_JOURNAL_BYTES/u);
  assert.match(source, /os\.fchown\(fd, 0, 0\)[\s\S]*os\.fchmod\(fd, 0o400\)[\s\S]*os\.fsync\(fd\)/u);
  assert.match(source, /fetch --quiet --no-tags --depth=1 "\$repository_url" refs\/heads\/main/u);
  assert.doesNotMatch(source, /fetch[^\n]*"\$source_commit"|checkout --quiet/u);
  assert.match(source, /ls-tree", "-r", "-z", "--full-tree"/u);
  assert.match(source, /mode not in \(b"100644", b"100755"\)[\s\S]*object_type != b"blob"/u);
  assert.match(source, /blob_oid\(payload\) != raw_oid\.decode\("ascii"\)/u);
  assert.equal(source.indexOf("blob_oid(payload)") < source.indexOf('| /usr/bin/node "$checkout_root/$controller_path"'), true);
  assert.match(source, /os\.open\("\/etc", os\.O_RDONLY \| os\.O_DIRECTORY \| os\.O_NOFOLLOW\)/u);
  assert.match(source, /open_exact_root_directory\(etc_directory_fd, "settleora-auto-runner"/u);
  assert.doesNotMatch(source, /stat -L[^\n]*\/etc\/settleora-auto-runner/u);
  const embeddedPython = [...source.matchAll(/<<'PY'\n([\s\S]*?)\nPY\n/gu)].map((match) => match[1]);
  assert.equal(embeddedPython.length, 2);
  for (const program of embeddedPython) {
    const compiled = spawnSync("/usr/bin/python3", ["-I", "-c", "import sys; compile(sys.stdin.read(), '<trusted-bootstrap>', 'exec')"], {
      input: program, encoding: "utf8", env: { HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
    });
    assert.equal(compiled.status, 0, compiled.stderr);
  }
  assert.doesNotMatch(source, /cp --no-dereference|chown 0:0 "\$snapshot/u);
  assert.doesNotMatch(source, /^\s*(?:eval|source)\b|\bcurl\b|\bwget\b/mu);
});

test("authenticated root planners retain OS root while applying the fixed source-owner validation policy", () => {
  const source = readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../semantic-recovery-native-install.mjs"), "utf8");
  const reader = source.slice(source.indexOf("function runIndependentRootReaders"), source.indexOf("function reconcileRootResult"));
  assert.doesNotMatch(reader, /\buid:\s*sourceIdentity|\bgid:\s*sourceIdentity/u);
  assert.match(reader, /HOME:\s*"\/root"/u);
  const policy = source.slice(source.indexOf("function activateRootAuthorityOwnershipPolicy"), source.indexOf("function assertFixedRootRuntime"));
  assert.match(policy, /assertFixedRootRuntime\(\)/u);
  assert.match(policy, /process\.getuid = \(\) => identity\.uid/u);
  assert.match(source, /existing root journal requires recovery-only handoff/u);
  assert.doesNotMatch(source, /--recover-interactive-sudo|--root-bootstrap-recover|--root-recovery-internal/u);
  assert.equal(source.indexOf("const finalAuthority = runIndependentRootReaders") > source.indexOf("const published = publishOrAdoptVerifiedNativeInstall"), true);
  assert.match(source, /reauthenticate\(\)[\s\S]*runIndependentRootReaders/u);
  const producer = readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../semantic-recovery-native-producer.mjs"), "utf8");
  assert.match(producer, /initial\.candidate\?\.mainSha !== producerSourceSha/u);
  assert.match(producer, /final\.candidate\?\.mainSha !== producerSourceSha/u);
  const deploymentReader = readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../lib/deployment-semantic-evidence-extractors.mjs"), "utf8");
  assert.match(deploymentReader, /safe\.directory=\$\{repositoryRoot\}/u);
});

test("command-scoped safe.directory admits only the exact authenticated different-owner repository", () => {
  const repositoryRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
  const environment = {
    HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin",
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TEST_ASSUME_DIFFERENT_OWNER: "1",
  };
  const refused = spawnSync("/usr/bin/git", ["-C", repositoryRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8", env: environment });
  assert.notEqual(refused.status, 0);
  const admitted = spawnSync("/usr/bin/git", ["-c", `safe.directory=${repositoryRoot}`, "-C", repositoryRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8", env: environment });
  assert.equal(admitted.status, 0, admitted.stderr);
  assert.equal(admitted.stdout.trim(), repositoryRoot);
  const wrong = spawnSync("/usr/bin/git", ["-c", `safe.directory=${path.dirname(repositoryRoot)}`, "-C", repositoryRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8", env: environment });
  assert.notEqual(wrong.status, 0);
});

test("real Python rename_noreplace helper interoperates through stdin using exact package bytes without protected-root access", () => {
  const installPackage = installPackageFixture();
  const packageBytes = Buffer.from(canonicalJson({ plan: installPackage.plan, artifacts: installPackage.artifacts.map(({ bytes, ...entry }) => ({ ...entry, bytesBase64: bytes.toString("base64") })) }));
  const helper = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../lib/semantic-recovery-native-rename-noreplace.py");
  const result = spawnSync("/usr/bin/python3", ["-I", helper, "--self-test"], { input: packageBytes, encoding: "utf8", env: { HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), { byteCount: packageBytes.length, reasonCode: "native_install_python_rename_noreplace_verified", sha256: sha256(packageBytes) });
  const helperSource = readFileSync(helper, "utf8");
  const installerSource = readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../semantic-recovery-native-install.mjs"), "utf8");
  const publicationSource = readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../lib/semantic-recovery-native-install-publication.mjs"), "utf8");
  assert.match(helperSource, /RENAME_NOREPLACE = 1/u);
  assert.match(helperSource, /sys\.argv == \[sys\.argv\[0\], "--publish-root"\]/u);
  assert.doesNotMatch(helperSource, /--root-result|RESULT_ROOT|RESULT_TEMP/u);
  assert.doesNotMatch(helperSource, /sys\.argv\[[3-9][0-9]*\]/u);
  assert.doesNotMatch(helperSource, /AT_FDCWD/u);
  assert.match(helperSource, /os\.listdir\(parent_fd\)/u);
  assert.match(helperSource, /os\.listdir\(directory_fd\)/u);
  assert.doesNotMatch(installerSource, /helper,[^\n]*stage, finalRoot/u);
  assert.match(installerSource, /spawnSync\(fixedPython, \["-I", helper, "--publish-root"\]/u);
  assert.match(publicationSource, /linkNoReplace = linkSync/u);
  assert.match(publicationSource, /linkNoReplace\(temporary, finalPath\)/u);
  assert.match(publicationSource, /recoverNativeInstallRootResultNoReplaceLinks/u);
  assert.doesNotMatch(publicationSource, /new RegExp/u);
});
