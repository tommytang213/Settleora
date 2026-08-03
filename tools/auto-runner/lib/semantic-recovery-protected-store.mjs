import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const semanticRecoveryProtectedRoot = "/etc/settleora-auto-runner/semantic-recovery-authority";
export const semanticRecoveryProtectedLayout = deepFreeze({
  root: semanticRecoveryProtectedRoot,
  producerRoot: `${semanticRecoveryProtectedRoot}/producer`,
  producerExecutable: `${semanticRecoveryProtectedRoot}/producer/semantic-recovery-native-producer.mjs`,
  producerPolicy: `${semanticRecoveryProtectedRoot}/producer/policy.json`,
  installManifest: `${semanticRecoveryProtectedRoot}/install-manifest.json`,
  storesRoot: `${semanticRecoveryProtectedRoot}/stores`,
  grantsRoot: `${semanticRecoveryProtectedRoot}/grants`,
  successorsRoot: `${semanticRecoveryProtectedRoot}/successors`,
  successorIncomingRoot: `${semanticRecoveryProtectedRoot}/successors/incoming`,
  successorProvenanceRoot: `${semanticRecoveryProtectedRoot}/successors/provenance`,
  successorCommitsRoot: `${semanticRecoveryProtectedRoot}/successors/commits`,
});

export const nativeSemanticSourceContract = "settleora_semantic_recovery_native_source";
export const nativeSemanticSourceVersion = 1;
export const nativeSemanticPersistenceContract = "settleora_semantic_recovery_native_persistence";
export const nativeSemanticPersistenceVersion = 1;
export const semanticRecoveryGithubNoEffectSnapshotContract = "settleora_semantic_recovery_github_no_effect_snapshot";
export const semanticRecoveryGithubNoEffectSnapshotVersion = 1;
export const semanticRecoveryGithubNoEffectSnapshotLifetimeMs = 30_000;

const digestPattern = /^[a-f0-9]{64}$/u;
const maximumJsonBytes = 256 * 1024;
const expectedDirectoryMode = 0o755;
const expectedFileMode = 0o444;

export function semanticRecoveryProtectedStorePath(authorityClass) {
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(String(authorityClass || ""))) {
    throw new Error("semantic native authority class invalid");
  }
  return path.posix.join(semanticRecoveryProtectedLayout.storesRoot, `${authorityClass}.json`);
}

export function authenticateNativeSemanticRecoveryStore({
  authorityClass,
  descriptor,
  definition,
  repository,
  now = new Date(),
  filesystem = null,
} = {}) {
  assertExactKeys(descriptor, ["authorityClass", "store"]);
  assertExactKeys(descriptor.store, ["kind", "path", "role", "sha256"]);
  const expectedPath = semanticRecoveryProtectedStorePath(authorityClass);
  const expectedRole = `${authorityClass}_authority`;
  if (descriptor.authorityClass !== authorityClass
      || descriptor.store.kind !== definition?.storeKind
      || descriptor.store.path !== expectedPath
      || descriptor.store.role !== expectedRole
      || !isDigest(descriptor.store.sha256)) {
    throw new Error("semantic native source descriptor mismatch");
  }
  const expectedStoreNames = [
    "github_no_effect.json", "incident_report.json", "intent_lineage.json", "lifecycle.json",
    "logical_task_budget.json", "projection_deployment.json", "repository_git.json", "supervisor_child_run.json",
  ];
  if (canonicalJson(listProtectedDirectory(semanticRecoveryProtectedLayout.storesRoot, { filesystem }).sort()) !== canonicalJson(expectedStoreNames)) {
    throw new Error("semantic native source store selection ambiguous");
  }
  const authenticated = authenticateProtectedJson(expectedPath, {
    filesystem,
    maximumBytes: maximumJsonBytes,
    expectedMode: expectedFileMode,
  });
  if (authenticated.sha256 !== descriptor.store.sha256) {
    throw new Error("semantic native source digest mismatch");
  }
  const document = authenticated.document;
  assertExactKeys(document, [
    "authorityClass", "claims", "contract", "expiresAt", "producer",
    "provenanceIdentity", "repository", "requestDigest", "sourceEvidenceDigest",
    "store", "version",
  ]);
  assertExactKeys(document.producer, ["bundleDigest", "id", "version"]);
  assertExactKeys(document.store, ["kind", "role"]);
  if (document.contract !== nativeSemanticSourceContract
      || document.version !== nativeSemanticSourceVersion
      || document.authorityClass !== authorityClass
      || document.repository !== repository
      || document.producer.id !== definition.id
      || document.producer.version !== definition.version
      || !isDigest(document.producer.bundleDigest)
      || document.store.kind !== definition.storeKind
      || document.store.role !== expectedRole
      || !plainObject(document.claims)
      || !isDigest(document.provenanceIdentity)
      || !isDigest(document.requestDigest)
      || !isDigest(document.sourceEvidenceDigest)
      || document.sourceEvidenceDigest !== sha256(canonicalJson({ authorityClass, provenanceIdentity: document.provenanceIdentity }))
      || !validTimestamp(document.expiresAt)
      || Date.parse(document.expiresAt) <= now.getTime()) {
    throw new Error("semantic native source document invalid or stale");
  }
  return deepFreeze({
    claims: structuredClone(document.claims),
    provenanceIdentity: sha256(canonicalJson({
      authority: "production_native",
      authorityClass,
      producer: document.producer,
      requestDigest: document.requestDigest,
      sourceEvidenceDigest: document.sourceEvidenceDigest,
      store: { path: expectedPath, sha256: authenticated.sha256 },
    })),
    nativeProvenanceIdentity: document.provenanceIdentity,
    requestDigest: document.requestDigest,
    producerBundleDigest: document.producer.bundleDigest,
    expiresAt: document.expiresAt,
    store: {
      kind: definition.storeKind,
      path: expectedPath,
      role: expectedRole,
      sha256: authenticated.sha256,
      byteCount: authenticated.byteCount,
    },
  });
}

export function readbackProtectedSemanticRecoverySuccessor({ manifest, grant, construction, filesystem = null } = {}) {
  let identity;
  try { identity = expectedPersistenceIdentity(manifest, grant, construction); }
  catch { return failed("semantic_successor_readback_identity_invalid"); }
  try {
    const final = readOptionalProtectedJson(identity.paths.storagePath, { filesystem });
    const provenance = readOptionalProtectedJson(identity.paths.provenancePath, { filesystem });
    const commit = readOptionalProtectedJson(identity.paths.commitPath, { filesystem });
    const incoming = listProtectedDirectory(semanticRecoveryProtectedLayout.successorIncomingRoot, { filesystem });
    const selectedIncomingNames = [identity.paths.storagePath, identity.paths.provenancePath, identity.paths.commitPath]
      .map((finalPath) => path.posix.basename(incomingPathFor(finalPath)));
    const selectedIncoming = incoming.filter((name) => selectedIncomingNames.includes(name));
    if (selectedIncoming.length !== 0) return failed("semantic_successor_readback_incoming_residue");
    for (const [directory, finalPath] of [
      [semanticRecoveryProtectedLayout.successorsRoot, identity.paths.storagePath],
      [semanticRecoveryProtectedLayout.successorProvenanceRoot, identity.paths.provenancePath],
      [semanticRecoveryProtectedLayout.successorCommitsRoot, identity.paths.commitPath],
    ]) {
      const basename = path.posix.basename(finalPath);
      const key = basename.slice(0, -5);
      const matches = listProtectedDirectory(directory, { filesystem }).filter((name) => name.startsWith(key));
      if (matches.some((name) => name !== basename) || matches.filter((name) => name === basename).length > 1) {
        return failed("semantic_successor_readback_duplicate");
      }
    }
    if (!final && !provenance && !commit) return failed("semantic_successor_not_persisted");
    if (commit && (!final || !provenance)) return failed("semantic_successor_readback_torn_commit");
    if (!final || !provenance || !commit) return failed("semantic_successor_readback_partial");
    const githubNoEffectSnapshot = provenance.document?.githubNoEffectSnapshot;
    authenticateSemanticRecoveryGithubNoEffectSnapshot(githubNoEffectSnapshot, manifest, { requireFresh: false });
    const expected = expectedPersistenceRecords(manifest, grant, construction, githubNoEffectSnapshot);
    if (canonicalJson(final.document) !== canonicalJson(expected.successor)
        || canonicalJson(provenance.document) !== canonicalJson(expected.provenance)
        || canonicalJson(commit.document) !== canonicalJson(expected.commit)) {
      return failed("semantic_successor_readback_conflict");
    }
    if (final.sha256 !== expected.commit.successorSha256
        || provenance.sha256 !== expected.commit.provenanceSha256) {
      return failed("semantic_successor_readback_digest_mismatch");
    }
    return deepFreeze({
      ok: true,
      reasonCode: "semantic_recovery_successor_readback_authenticated",
      state: "persisted",
      authorizedToContinue: false,
      storageKey: expected.storageKey,
      operationId: manifest.operation.operationId,
      requestId: manifest.operation.requestId,
      manifestDigest: manifest.manifestDigest,
      successorSha256: final.sha256,
      provenanceSha256: provenance.sha256,
      commitSha256: commit.sha256,
      githubNoEffectSnapshotDigest: githubNoEffectSnapshot.snapshotDigest,
      paths: expected.paths,
    });
  } catch {
    return failed("semantic_successor_readback_authentication_failed");
  }
}

// This is the root-executable persistence core. Production callers must use
// the real filesystem and uid 0. The adapter seam exists only for deterministic
// tests; it never creates a validated production grant or runner authority.
export function persistExactSemanticRecoverySuccessorFromNativeProducer({
  manifest,
  grant,
  construction,
  reauthenticate,
  filesystem = null,
  effectiveUid = typeof process.getuid === "function" ? process.getuid() : null,
  crashAfter = null,
  clock = () => new Date(),
} = {}) {
  if (!filesystem && effectiveUid !== 0) return failed("semantic_native_persistence_root_required");
  if (typeof reauthenticate !== "function") return failed("semantic_native_persistence_reauthentication_missing");
  let identity;
  try { identity = expectedPersistenceIdentity(manifest, grant, construction); }
  catch { return failed("semantic_native_persistence_identity_invalid"); }
  let fresh;
  try { fresh = reauthenticate(); }
  catch { return failed("semantic_native_persistence_reauthentication_failed"); }
  if (fresh?.ok !== true
      || fresh.manifestDigest !== manifest.manifestDigest
      || fresh.grantSha256 !== grant.sha256
      || fresh.operationId !== manifest.operation.operationId) {
    return failed("semantic_native_persistence_authority_drift");
  }
  const readback = readbackProtectedSemanticRecoverySuccessor({ manifest, grant, construction, filesystem });
  if (readback.ok) return { ...readback, reasonCode: "semantic_recovery_successor_adopted" };
  if (!["semantic_successor_not_persisted", "semantic_successor_readback_partial", "semantic_successor_readback_incoming_residue"].includes(readback.reasonCode)) {
    return readback;
  }
  let githubNoEffectSnapshot;
  try {
    githubNoEffectSnapshot = selectSemanticRecoveryGithubNoEffectSnapshot({
      freshSnapshot: fresh.githubNoEffectSnapshot,
      manifest,
      provenancePath: identity.paths.provenancePath,
      filesystem,
      now: clock(),
    });
  } catch { return failed("semantic_native_persistence_github_snapshot_invalid"); }
  let expected;
  try { expected = expectedPersistenceRecords(manifest, grant, construction, githubNoEffectSnapshot); }
  catch { return failed("semantic_native_persistence_identity_invalid"); }
  if (!filesystem) {
    try { recoverExactInterruptedPublicationSet(expected); }
    catch { return failed("semantic_native_persistence_publication_residue_conflict"); }
  }
  try {
    ensureProtectedSuccessorDirectories({ filesystem });
    publishRecordNoClobber(expected.paths.provenancePath, expected.provenance, { filesystem });
    if (crashAfter === "provenance") throw crashError();
    publishRecordNoClobber(expected.paths.storagePath, expected.successor, { filesystem });
    if (crashAfter === "successor") throw crashError();
    try { authenticateSemanticRecoveryGithubNoEffectSnapshot(githubNoEffectSnapshot, manifest, { now: clock(), requireFresh: true }); }
    catch { return failed("semantic_native_persistence_github_snapshot_expired_before_commit"); }
    publishRecordNoClobber(expected.paths.commitPath, expected.commit, { filesystem });
    if (crashAfter === "commit") throw crashError();
  } catch (error) {
    if (error?.code === "SEMANTIC_TEST_CRASH") return failed("semantic_native_persistence_interrupted");
    return failed("semantic_native_persistence_publication_failed");
  }
  const committed = readbackProtectedSemanticRecoverySuccessor({ manifest, grant, construction, filesystem });
  return committed.ok
    ? { ...committed, reasonCode: "semantic_recovery_successor_created" }
    : committed;
}

export function expectedPersistenceRecords(manifest, grant, construction = null, githubNoEffectSnapshot = null) {
  const identity = expectedPersistenceIdentity(manifest, grant, construction);
  authenticateSemanticRecoveryGithubNoEffectSnapshot(githubNoEffectSnapshot, manifest, { requireFresh: false });
  const { storageKey, paths, successorState } = identity;
  const successor = {
    contract: nativeSemanticPersistenceContract,
    version: nativeSemanticPersistenceVersion,
    kind: "successor",
    storageKey,
    operationId: manifest.operation.operationId,
    requestId: manifest.operation.requestId,
    manifestDigest: manifest.manifestDigest,
    lifecycleSessionId: manifest.lifecycleSuccessor.sessionId,
    lifecycleMutationGeneration: manifest.lifecycleSuccessor.mutationGeneration,
    taskIdentity: manifest.identities,
    successor: successorState,
  };
  const provenance = {
    contract: nativeSemanticPersistenceContract,
    version: nativeSemanticPersistenceVersion,
    kind: "provenance",
    storageKey,
    operationId: manifest.operation.operationId,
    requestId: manifest.operation.requestId,
    manifestDigest: manifest.manifestDigest,
    grantSha256: grant.sha256,
    githubNoEffectSnapshot,
    evidenceSources: manifest.evidenceSources.map((source) => ({
      authorityClass: source.authorityClass,
      path: source.store.path,
      sha256: source.store.sha256,
      provenanceIdentity: source.provenanceIdentity,
    })),
    boundArtifacts: manifest.artifacts,
    noEffectProof: manifest.noEffectProof,
    oneShotExhaustion: manifest.oneShotExhaustion,
    runtime: Object.fromEntries([
      ["sourceSha", manifest.claims.runtimeSourceSha],
      ["bundleDigest", manifest.claims.installedBundleDigest],
      ["manifestDigest", manifest.claims.installedManifestDigest],
      ["profileDigest", manifest.claims.runtimeProfileDigest],
      ["approvalDigest", manifest.claims.runtimeApprovalDigest],
      ["launcherDigest", manifest.claims.launcherDigest],
      ["healthUnitDigest", manifest.claims.healthUnitDigest],
    ]),
  };
  const successorSha256 = sha256(canonicalJson(successor));
  const provenanceSha256 = sha256(canonicalJson(provenance));
  const commit = {
    contract: nativeSemanticPersistenceContract,
    version: nativeSemanticPersistenceVersion,
    kind: "commit",
    storageKey,
    operationId: manifest.operation.operationId,
    requestId: manifest.operation.requestId,
    manifestDigest: manifest.manifestDigest,
    successorSha256,
    provenanceSha256,
    githubNoEffectSnapshotDigest: githubNoEffectSnapshot.snapshotDigest,
    authorizedToContinue: false,
  };
  return deepFreeze({ storageKey, paths, successor, provenance, commit });
}

function expectedPersistenceIdentity(manifest, grant, construction = null) {
  if (!plainObject(manifest) || !plainObject(grant)
      || manifest.sourceAuthority !== "production"
      || grant.authorized !== true
      || grant.synthetic === true
      || grant.manifestDigest !== manifest.manifestDigest
      || grant.operationId !== manifest.operation?.operationId
      || grant.requestId !== manifest.operation?.requestId) {
    throw new Error("semantic persistence authority invalid");
  }
  const paths = manifest.intendedSuccessor;
  const storageKey = paths?.storageKey;
  const expectedStoragePath = path.posix.join(semanticRecoveryProtectedLayout.successorsRoot, `${storageKey}.json`);
  const expectedProvenancePath = path.posix.join(semanticRecoveryProtectedLayout.successorProvenanceRoot, `${sha256(canonicalJson({ contract: "post_incident_semantic_successor", incidentIdentity: manifest.incidentIdentity }))}.json`);
  const expectedCommitPath = path.posix.join(semanticRecoveryProtectedLayout.successorCommitsRoot, `${storageKey}.json`);
  if (!isDigest(storageKey)
      || paths.storagePath !== expectedStoragePath
      || paths.provenancePath !== expectedProvenancePath
      || paths.commitPath !== expectedCommitPath) {
    throw new Error("semantic persistence path invalid");
  }
  const successorState = construction?.successor;
  if (!plainObject(successorState) || construction.storageKey !== storageKey
      || construction.ok !== true || construction.reasonCode !== "post_incident_successor_constructed") {
    throw new Error("semantic persistence construction invalid");
  }
  return deepFreeze({
    storageKey,
    paths: { storagePath: paths.storagePath, provenancePath: paths.provenancePath, commitPath: paths.commitPath },
    successorState,
  });
}

export function authenticateSemanticRecoveryGithubNoEffectSnapshot(snapshot, manifest, { now = new Date(), requireFresh = true } = {}) {
  assertExactKeys(snapshot, [
    "branch", "contract", "effectClaims", "evidenceDigest", "expiresAt", "issueNumber", "manifestDigest",
    "observedAt", "operationId", "repository", "requestId", "snapshotDigest", "version",
  ]);
  assertExactKeys(snapshot.effectClaims, ["commentEffect", "issueEffect", "mergeEffect", "prEffect", "productEffect", "pushEffect"]);
  const { snapshotDigest, ...core } = snapshot;
  const observedMs = Date.parse(snapshot.observedAt);
  const expiresMs = Date.parse(snapshot.expiresAt);
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (snapshot.contract !== semanticRecoveryGithubNoEffectSnapshotContract
      || snapshot.version !== semanticRecoveryGithubNoEffectSnapshotVersion
      || snapshot.repository !== manifest?.claims?.repository
      || snapshot.issueNumber !== manifest?.claims?.issueNumber
      || snapshot.branch !== manifest?.claims?.branch
      || snapshot.operationId !== manifest?.operation?.operationId
      || snapshot.requestId !== manifest?.operation?.requestId
      || snapshot.manifestDigest !== manifest?.manifestDigest
      || snapshot.evidenceDigest !== manifest?.claims?.prEvidenceDigest
      || Object.values(snapshot.effectClaims).some((effect) => effect !== false)
      || !isDigest(snapshotDigest) || snapshotDigest !== sha256(canonicalJson(core))
      || !Number.isFinite(observedMs) || !Number.isFinite(expiresMs)
      || expiresMs - observedMs !== semanticRecoveryGithubNoEffectSnapshotLifetimeMs
      || (requireFresh && (!Number.isFinite(nowMs) || nowMs < observedMs || nowMs >= expiresMs))) {
    throw new Error("semantic recovery GitHub no-effect snapshot invalid");
  }
  return true;
}

function selectSemanticRecoveryGithubNoEffectSnapshot({ freshSnapshot, manifest, provenancePath, filesystem, now }) {
  const existing = readOptionalProtectedJson(provenancePath, { filesystem })
    || readOptionalProtectedJson(incomingPathFor(provenancePath), { filesystem });
  const selected = existing?.document?.githubNoEffectSnapshot || freshSnapshot;
  authenticateSemanticRecoveryGithubNoEffectSnapshot(selected, manifest, { now, requireFresh: true });
  return selected;
}

function authenticateProtectedJson(file, { filesystem = null, maximumBytes = maximumJsonBytes, expectedMode = expectedFileMode } = {}) {
  if (filesystem) return authenticateProtectedJsonWithAdapter(file, filesystem, maximumBytes, expectedMode);
  assertProtectedPath(file);
  const fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  try {
    const first = fstatSync(fd);
    const pathname = lstatSync(file);
    if (!first.isFile() || first.isSymbolicLink() || first.uid !== 0 || first.gid !== 0 || first.nlink !== 1
        || (first.mode & 0o7777) !== expectedMode || first.size < 1 || first.size > maximumBytes
        || statIdentity(first) !== statIdentity(pathname)) throw new Error("semantic protected file unsafe");
    const bytes = readFileSync(fd);
    const second = fstatSync(fd);
    if (statIdentity(first) !== statIdentity(second) || bytes.length !== first.size || !isUtf8(bytes)
        || realpathSync(file) !== file) throw new Error("semantic protected file changed");
    return { path: file, document: parseCanonicalJson(bytes), sha256: sha256(bytes), byteCount: bytes.length };
  } finally { closeSync(fd); }
}

function authenticateProtectedJsonWithAdapter(file, filesystem, maximumBytes, expectedMode) {
  assertFilesystemAdapter(filesystem);
  assertProtectedPath(file, filesystem);
  const first = filesystem.inspect(file);
  const bytes = Buffer.from(filesystem.read(file));
  const second = filesystem.inspect(file);
  if (!first || first.type !== "file" || first.symlink === true || first.uid !== 0 || first.gid !== 0 || first.nlink !== 1
      || first.mode !== expectedMode || first.size < 1 || first.size > maximumBytes
      || canonicalJson(first) !== canonicalJson(second) || bytes.length !== first.size || !isUtf8(bytes)) {
    throw new Error("semantic protected file unsafe");
  }
  return { path: file, document: parseCanonicalJson(bytes), sha256: sha256(bytes), byteCount: bytes.length };
}

function assertProtectedPath(file, filesystem = null) {
  const lexical = path.posix.resolve(String(file || ""));
  if (lexical !== file || (lexical !== semanticRecoveryProtectedRoot && !lexical.startsWith(`${semanticRecoveryProtectedRoot}/`))) {
    throw new Error("semantic protected path invalid");
  }
  const chain = ["/etc", "/etc/settleora-auto-runner", semanticRecoveryProtectedRoot];
  const relative = path.posix.relative(semanticRecoveryProtectedRoot, path.posix.dirname(lexical));
  let cursor = semanticRecoveryProtectedRoot;
  for (const part of relative.split("/").filter(Boolean)) {
    cursor = path.posix.join(cursor, part);
    chain.push(cursor);
  }
  for (const directory of [...new Set(chain)]) {
    const info = filesystem ? filesystem.inspect(directory) : lstatSync(directory);
    const typeOk = filesystem ? info?.type === "directory" : info.isDirectory();
    const symlink = filesystem ? info?.symlink === true : info.isSymbolicLink();
    const mode = filesystem ? info?.mode : info.mode & 0o7777;
    const real = filesystem ? filesystem.realpath(directory) : realpathSync(directory);
    if (!typeOk || symlink || info.uid !== 0 || info.gid !== 0 || (mode & 0o022) !== 0 || real !== directory) {
      throw new Error("semantic protected directory unsafe");
    }
  }
}

function readOptionalProtectedJson(file, { filesystem }) {
  const present = filesystem ? filesystem.exists(file) : existsSync(file);
  return present ? authenticateProtectedJson(file, { filesystem }) : null;
}

function listProtectedDirectory(directory, { filesystem }) {
  const present = filesystem ? filesystem.exists(directory) : existsSync(directory);
  if (!present) return [];
  assertProtectedPath(path.posix.join(directory, "placeholder"), filesystem);
  return filesystem ? filesystem.list(directory) : readdirSync(directory);
}

function ensureProtectedSuccessorDirectories({ filesystem }) {
  const directories = [
    semanticRecoveryProtectedLayout.successorsRoot,
    semanticRecoveryProtectedLayout.successorIncomingRoot,
    semanticRecoveryProtectedLayout.successorProvenanceRoot,
    semanticRecoveryProtectedLayout.successorCommitsRoot,
  ];
  if (filesystem) {
    for (const directory of directories) filesystem.ensureDirectory(directory, { uid: 0, mode: expectedDirectoryMode });
    return;
  }
  for (const directory of directories) {
    if (!existsSync(directory)) mkdirSync(directory, { mode: expectedDirectoryMode });
    assertProtectedPath(path.posix.join(directory, "placeholder"));
  }
}

function publishRecordNoClobber(finalPath, document, { filesystem }) {
  const bytes = Buffer.from(canonicalJson(document));
  const incomingPath = path.posix.join(
    semanticRecoveryProtectedLayout.successorIncomingRoot,
    path.posix.basename(incomingPathFor(finalPath)),
  );
  if (filesystem) {
    if (filesystem.exists(finalPath)) {
      const existing = authenticateProtectedJson(finalPath, { filesystem });
      if (!existing.bytes?.equals?.(bytes) && canonicalJson(existing.document) !== bytes.toString("utf8")) throw new Error("semantic protected final conflict");
      return;
    }
    if (filesystem.exists(incomingPath)) {
      const incoming = authenticateProtectedJson(incomingPath, { filesystem });
      if (canonicalJson(incoming.document) !== bytes.toString("utf8")) throw new Error("semantic protected incoming conflict");
    } else {
      filesystem.writeExclusive(incomingPath, bytes, { uid: 0, mode: expectedFileMode });
    }
    filesystem.fsync(incomingPath);
    filesystem.publishNoClobber(incomingPath, finalPath);
    filesystem.fsync(path.posix.dirname(finalPath));
    return;
  }
  recoverExactInterruptedHardLink(incomingPath, finalPath, bytes);
  if (existsSync(finalPath)) {
    const existing = authenticateProtectedJson(finalPath);
    if (canonicalJson(existing.document) !== bytes.toString("utf8")) throw new Error("semantic protected final conflict");
    return;
  }
  if (existsSync(incomingPath)) {
    const incoming = authenticateProtectedJson(incomingPath);
    if (canonicalJson(incoming.document) !== bytes.toString("utf8")) throw new Error("semantic protected incoming conflict");
  } else {
    const fd = openSync(incomingPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW || 0), expectedFileMode);
    try {
      fchmodSync(fd, expectedFileMode);
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally { closeSync(fd); }
  }
  if (existsSync(finalPath)) throw new Error("semantic protected final appeared");
  linkSync(incomingPath, finalPath);
  unlinkSync(incomingPath);
  const parentFd = openSync(path.posix.dirname(finalPath), fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY || 0));
  try { fsyncSync(parentFd); } finally { closeSync(parentFd); }
}

function recoverExactInterruptedHardLink(incomingPath, finalPath, expectedBytes) {
  if (!existsSync(incomingPath) || !existsSync(finalPath)) return;
  assertProtectedPath(incomingPath);
  assertProtectedPath(finalPath);
  const incoming = lstatSync(incomingPath);
  const final = lstatSync(finalPath);
  if (!incoming.isFile() || incoming.isSymbolicLink() || !final.isFile() || final.isSymbolicLink()
      || incoming.dev !== final.dev || incoming.ino !== final.ino || incoming.nlink !== 2 || final.nlink !== 2
      || incoming.uid !== 0 || incoming.gid !== 0 || (incoming.mode & 0o7777) !== expectedFileMode
      || realpathSync(incomingPath) !== incomingPath || realpathSync(finalPath) !== finalPath) {
    throw new Error("semantic protected publication residue conflict");
  }
  const bytes = readFileSync(incomingPath);
  const after = lstatSync(incomingPath);
  if (incoming.dev !== after.dev || incoming.ino !== after.ino || incoming.size !== after.size
      || !bytes.equals(expectedBytes)) throw new Error("semantic protected publication residue changed");
  unlinkSync(incomingPath);
  const parentFd = openSync(path.posix.dirname(finalPath), fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY || 0));
  try { fsyncSync(parentFd); } finally { closeSync(parentFd); }
}

function recoverExactInterruptedPublicationSet(expected) {
  for (const [finalPath, document] of [
    [expected.paths.provenancePath, expected.provenance],
    [expected.paths.storagePath, expected.successor],
    [expected.paths.commitPath, expected.commit],
  ]) {
    const incomingPath = incomingPathFor(finalPath);
    recoverExactInterruptedHardLink(incomingPath, finalPath, Buffer.from(canonicalJson(document)));
  }
}

function incomingPathFor(finalPath) {
  return path.posix.join(
    semanticRecoveryProtectedLayout.successorIncomingRoot,
    `${path.posix.basename(finalPath)}.${sha256(finalPath).slice(0, 16)}.incoming`,
  );
}

function assertFilesystemAdapter(filesystem) {
  for (const method of ["exists", "inspect", "list", "read", "realpath"]) {
    if (typeof filesystem?.[method] !== "function") throw new Error("semantic protected filesystem adapter invalid");
  }
}

function parseCanonicalJson(bytes) {
  if (!Buffer.isBuffer(bytes) || !isUtf8(bytes)) throw new Error("semantic protected JSON encoding invalid");
  const text = bytes.toString("utf8");
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("semantic protected JSON parse failed"); }
  if (canonicalJson(value) !== text) throw new Error("semantic protected canonical JSON required");
  return value;
}

function assertExactKeys(value, expected) {
  if (!plainObject(value) || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error("unsupported or missing fields");
  }
}
function crashError() { const error = new Error("semantic test crash"); error.code = "SEMANTIC_TEST_CRASH"; return error; }
function validTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function statIdentity(info) { return [info.dev, info.ino, info.mode, info.nlink, info.uid, info.gid, info.size, info.mtimeMs, info.ctimeMs].join(":"); }
function failed(reasonCode, diagnostics = []) { return { ok: false, reasonCode, diagnostics: [...new Set(diagnostics)].sort() }; }
function isDigest(value) { return digestPattern.test(String(value || "")); }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (plainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
