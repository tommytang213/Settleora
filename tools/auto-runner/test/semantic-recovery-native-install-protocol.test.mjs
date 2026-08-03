import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
  completeVerifiedNativeInstallResult,
  persistNativeInstallJournalTransition,
  publishOrAdoptVerifiedNativeInstall,
  validateRootResultTransition,
} from "../lib/semantic-recovery-native-install-publication.mjs";
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
    [nativeInstallBootstrapEntrypoint]: 'import "./semantic-recovery-native-producer.mjs";\n',
    [nativeInstallProducerEntrypoint]: 'import "./lib/producer-support.mjs";\n',
    "tools/auto-runner/lib/producer-support.mjs": "export const fixture = true;\n",
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
  assert.equal(authenticated.manifest.support.length, 5);
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
  const reconstructed = independentlyVerifyRootNativeInstallPackage({ installPackage: null, authenticatedSource, request, projections });
  assert.equal(reconstructed.ok, true);
  assert.equal(independentlyVerifyRootNativeInstallPackage({ installPackage: reconstructed.package, authenticatedSource, request, projections }).ok, true);
  const defect = { plan: structuredClone(reconstructed.package.plan), artifacts: reconstructed.package.artifacts.map((entry) => ({ ...entry, bytes: Buffer.from(entry.bytes) })) };
  defect.artifacts[0].bytes[0] ^= 0xff;
  assert.throws(() => independentlyVerifyRootNativeInstallPackage({ installPackage: defect, authenticatedSource, request, projections }), /package mismatch/u);
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

test("exact fixture installation fsyncs every created file/directory and both publication boundaries before verified completion", () => {
  const installPackage = installPackageFixture();
  const filesystem = new PublicationMemoryFilesystem();
  const journal = publicationJournal();
  const result = publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem, journal });
  assert.equal(result.installed, true);
  assert.equal(verifyInstalledSemanticRecoveryNativeProducer({ plan: installPackage.plan, filesystem: filesystem.finalView() }).ok, true);
  assert.equal(filesystem.events.filter((entry) => entry.startsWith("fsync-file:")).length, installPackage.artifacts.length);
  assert.equal(filesystem.events.filter((entry) => entry.startsWith("fsync-dir:")).length >= (installPackage.plan.directories.length - 1) * 2 + installPackage.artifacts.length + 1, true);
  assert.equal(filesystem.events.at(-2), "fsync-parent");
  assert.equal(filesystem.events.at(-1), "fsync-ancestor");
  assert.deepEqual(journal.transitions, ["root_plan_verified->publication_intent_durable", "publication_intent_durable->publication_started", "publication_started->installed_verified"]);
});

test("exact existing installation adopts without rewrite while conflict and residue remain untouched", () => {
  const installPackage = installPackageFixture();
  const filesystem = new PublicationMemoryFilesystem();
  publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem, journal: publicationJournal() });
  const before = canonicalJson([...filesystem.final].map(([target, entry]) => [target, entry.metadata, entry.bytes?.toString("base64")]));
  filesystem.events.length = 0;
  const journal = publicationJournal();
  const adopted = publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem, journal });
  assert.equal(adopted.adopted, true);
  assert.equal(canonicalJson([...filesystem.final].map(([target, entry]) => [target, entry.metadata, entry.bytes?.toString("base64")])), before);
  assert.equal(filesystem.events[0], "authority");
  assert.equal(filesystem.events.filter((entry) => entry.startsWith("fsync-installed-file:")).length, installPackage.plan.files.length);
  assert.equal(filesystem.events.filter((entry) => entry.startsWith("fsync-installed-dir:")).length, installPackage.plan.directories.length);
  assert.deepEqual(journal.transitions, ["root_plan_verified->adopted_verified"]);
  const conflict = new PublicationMemoryFilesystem(); conflict.final = new Map([[semanticRecoveryProtectedLayout.root, directory()], [`${semanticRecoveryProtectedLayout.root}/extra`, file(Buffer.from("x"))]]);
  const conflictBefore = canonicalJson([...conflict.final]);
  assert.throws(() => publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem: conflict, journal: publicationJournal() }), /conflicts/u);
  assert.equal(canonicalJson([...conflict.final]), conflictBefore);
  const residue = new PublicationMemoryFilesystem(); residue.residue = true;
  assert.throws(() => publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem: residue, journal: publicationJournal() }), /residue/u);
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
    publishOrAdoptVerifiedNativeInstall({ installPackage: original, correlation: "issue-1012-fixture", filesystem, journal: publicationJournal() });
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
  assert.equal(resumeNativeInstallProtocol({ ownerJournal: journal }).action, "readback_only");
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
  assert.deepEqual(action, { action: "readback_only", mutationAllowed: false, sudoAllowed: false, reasonCode: "native_install_publication_ambiguous" });
  const adopted = resumeNativeInstallProtocol({ ownerJournal: journal, installedReadback: { ok: true, planDigest: "3".repeat(64) } });
  assert.equal(adopted.action, "adopt_verified_result");
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
    () => publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem, journal }),
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
  const result = publishOrAdoptVerifiedNativeInstall({ installPackage, correlation: "issue-1012-fixture", filesystem, journal });
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
  const recoveryArgv = buildNativeInstallSudoArgv({
    handoffMode: "recover_readback", sourceCommit: "a".repeat(40), bootstrapBlob: "b".repeat(40), correlation: "issue-1012-fixture",
    operationId: "c".repeat(64), ownerJournalDigest: "d".repeat(64), ownerJournalSha256: "e".repeat(64),
  });
  assert.equal(recoveryArgv.at(nativeInstallSudoArgv.length), "recover_readback");
  assert.equal(validateInteractiveSudoBoundary({ argv: recoveryArgv, env: {}, tty: true, stdinKind: "tty_password_only_no_program_bytes", stdoutKind: "bounded_capture", stderrKind: "bounded_capture" }).ok, true);
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
  assert.match(source, /handoff_mode.*recover_readback/u);
  assert.match(source, /controller_mode='--root-bootstrap-recover'/u);
  assert.match(source, /operation_id\}\.package\.json/u);
  assert.equal(source.indexOf("root recovery artifact unsafe") < source.indexOf("fetch --quiet"), true);
  assert.equal(source.indexOf("owner_directory_fd = os.open", 0) < source.indexOf("git -c core.hooksPath=/dev/null", 0), true);
  assert.equal(source.indexOf("os.fsync(root_directory_fd)") < source.indexOf("fetch --quiet"), true);
  assert.match(source, /os\.O_RDONLY \| os\.O_NOFOLLOW, dir_fd=owner_directory_fd/u);
  assert.match(source, /first\.st_size > MAXIMUM_JOURNAL_BYTES/u);
  assert.match(source, /os\.fchown\(fd, 0, 0\)[\s\S]*os\.fchmod\(fd, 0o400\)[\s\S]*os\.fsync\(fd\)/u);
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
  assert.match(source, /recovery root journal absent/u);
});

test("real Python rename_noreplace helper interoperates through stdin using exact package bytes without protected-root access", () => {
  const installPackage = installPackageFixture();
  const packageBytes = Buffer.from(canonicalJson({ plan: installPackage.plan, artifacts: installPackage.artifacts.map(({ bytes, ...entry }) => ({ ...entry, bytesBase64: bytes.toString("base64") })) }));
  const helper = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../lib/semantic-recovery-native-rename-noreplace.py");
  const result = spawnSync("/usr/bin/python3", ["-I", helper, "--self-test"], { input: packageBytes, encoding: "utf8", env: { HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), { byteCount: packageBytes.length, reasonCode: "native_install_python_rename_noreplace_verified", sha256: sha256(packageBytes) });
  assert.equal(readFileSync(helper).includes(Buffer.from("RENAME_NOREPLACE = 1")), true);
});
