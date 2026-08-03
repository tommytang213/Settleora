import { createHash } from "node:crypto";
import {
  chmodSync, chownSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, realpathSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

export const nativeInstallSourceContract = "settleora_semantic_recovery_native_install_source";
export const nativeInstallSourceVersion = 1;
export const nativeInstallBootstrapEntrypoint = "tools/auto-runner/semantic-recovery-native-install.mjs";
export const nativeInstallBootstrapScript = "tools/auto-runner/semantic-recovery-native-install-bootstrap.sh";
export const nativeInstallProducerEntrypoint = "tools/auto-runner/semantic-recovery-native-producer.mjs";
export const nativeInstallRenameNoReplaceHelper = "tools/auto-runner/lib/semantic-recovery-native-rename-noreplace.py";

const oidPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const correlationPattern = /^[a-z0-9][a-z0-9._:-]{7,127}$/u;
const maximumObjectBytes = 16 * 1024 * 1024;
const maximumTreeEntries = 100_000;
const maximumAggregateBytes = 512 * 1024 * 1024;

export function normalizeNativeInstallSourceHint(value) {
  assertExactKeys(value, ["bootstrapBlob", "contract", "repository", "sourceCommit", "taskCorrelation", "version"]);
  if (value.contract !== nativeInstallSourceContract || value.version !== nativeInstallSourceVersion
      || !repositoryPattern.test(String(value.repository || "")) || !oidPattern.test(String(value.sourceCommit || ""))
      || !oidPattern.test(String(value.bootstrapBlob || ""))
      || !correlationPattern.test(String(value.taskCorrelation || ""))) {
    throw new Error("native install source hint invalid");
  }
  return deepFreeze(structuredClone(value));
}

/*
 * The object reader is the narrow seam between the bootstrap and an authenticated,
 * root-owned Git object database. It returns raw object bytes, never a checkout path.
 * Both repository identity and the selected commit are independently re-read here;
 * the caller's values are hints, not authority.
 */
export function authenticateNativeInstallGitSource({ hint, objectReader } = {}) {
  const normalized = normalizeNativeInstallSourceHint(hint);
  if (!objectReader || typeof objectReader.resolveRepository !== "function" || typeof objectReader.readObject !== "function") {
    throw new Error("native install object reader invalid");
  }
  const resolved = objectReader.resolveRepository();
  assertExactKeys(resolved, ["commit", "repository", "transport"]);
  if (String(resolved.repository || "").toLowerCase() !== normalized.repository.toLowerCase()
      || resolved.commit !== normalized.sourceCommit || resolved.transport !== "authenticated_github_https") {
    throw new Error("native install repository authority mismatch");
  }

  const objects = new Map();
  let aggregateBytes = 0;
  const readObject = (oid, expectedType) => {
    if (!oidPattern.test(String(oid || ""))) throw new Error("native install Git object id invalid");
    const cached = objects.get(oid);
    if (cached) {
      if (cached.type !== expectedType) throw new Error("native install Git object type conflict");
      return cached;
    }
    const value = objectReader.readObject(oid);
    assertExactKeys(value, ["bytes", "oid", "type"]);
    const bytes = Buffer.from(value.bytes);
    if (value.oid !== oid || value.type !== expectedType || bytes.length > maximumObjectBytes
        || gitObjectOid(value.type, bytes) !== oid) {
      throw new Error("native install Git object identity mismatch");
    }
    aggregateBytes += bytes.length;
    if (aggregateBytes > maximumAggregateBytes) throw new Error("native install Git object closure too large");
    const authenticated = { oid, type: value.type, bytes };
    objects.set(oid, authenticated);
    return authenticated;
  };

  const commit = readObject(normalized.sourceCommit, "commit");
  const commitHeaders = parseCommitHeaders(commit.bytes);
  const files = new Map();
  const directories = new Map();
  const activeTrees = new Set();
  let entryCount = 0;

  const visitTree = (treeOid, directory) => {
    if (activeTrees.has(treeOid)) throw new Error("native install Git tree cycle");
    activeTrees.add(treeOid);
    const tree = readObject(treeOid, "tree");
    const entries = parseTree(tree.bytes);
    directories.set(directory, { oid: treeOid, entryCount: entries.length });
    for (const entry of entries) {
      entryCount += 1;
      if (entryCount > maximumTreeEntries) throw new Error("native install Git tree closure too large");
      const source = directory === "" ? entry.name : `${directory}/${entry.name}`;
      if (files.has(source) || directories.has(source)) throw new Error("native install Git path conflict");
      if (entry.mode === "40000") {
        visitTree(entry.oid, source);
        continue;
      }
      const blob = readObject(entry.oid, "blob");
      files.set(source, { source, mode: entry.mode, oid: entry.oid, bytes: blob.bytes });
    }
    activeTrees.delete(treeOid);
  };
  visitTree(commitHeaders.tree, "");

  const required = selectExecutableClosure(files, nativeInstallBootstrapEntrypoint);
  if (!files.has(nativeInstallBootstrapScript)) throw new Error("native install owner bootstrap script missing");
  if (files.get(nativeInstallBootstrapScript).oid !== normalized.bootstrapBlob) {
    throw new Error("native install trusted bootstrap blob mismatch");
  }
  required.add(nativeInstallBootstrapScript);
  if (!files.has(nativeInstallRenameNoReplaceHelper)) throw new Error("native install rename_noreplace helper missing");
  required.add(nativeInstallRenameNoReplaceHelper);
  if (!required.has(nativeInstallProducerEntrypoint)) {
    throw new Error("native install bootstrap does not bind producer entrypoint");
  }
  const supportFiles = [...required].sort().map((source) => {
    const member = files.get(source);
    const executable = source === nativeInstallBootstrapEntrypoint || source === nativeInstallProducerEntrypoint || source === nativeInstallBootstrapScript;
    if (member.mode !== (executable ? "100755" : "100644")) throw new Error("native install support Git mode invalid");
    return deepFreeze({
      source,
      gitBlobOid: member.oid,
      sha256: sha256(member.bytes),
      byteCount: member.bytes.length,
      executable,
      bytes: Buffer.from(member.bytes),
    });
  });
  const objectManifest = [...objects.values()].map(({ oid, type, bytes }) => ({ oid, type, byteCount: bytes.length }))
    .sort((left, right) => left.oid.localeCompare(right.oid));
  const sourceManifest = {
    bootstrapBlob: normalized.bootstrapBlob,
    contract: nativeInstallSourceContract,
    version: nativeInstallSourceVersion,
    repository: normalized.repository,
    sourceCommit: normalized.sourceCommit,
    rootTree: commitHeaders.tree,
    taskCorrelation: normalized.taskCorrelation,
    treeCount: [...objects.values()].filter((entry) => entry.type === "tree").length,
    blobCount: [...objects.values()].filter((entry) => entry.type === "blob").length,
    objectCount: objects.size,
    traversedEntryCount: entryCount,
    support: supportFiles.map(stripBytes),
    objects: objectManifest,
  };
  return deepFreeze({
    manifest: { ...sourceManifest, sourceManifestDigest: sha256(canonicalJson(sourceManifest)) },
    supportFiles,
  });
}

export function verifyAuthenticatedNativeInstallSource(value) {
  try {
    assertExactKeys(value, ["manifest", "supportFiles"]);
    const manifest = value.manifest;
    assertExactKeys(manifest, [
      "blobCount", "bootstrapBlob", "contract", "objectCount", "objects", "repository", "rootTree", "sourceCommit",
      "sourceManifestDigest", "support", "taskCorrelation", "traversedEntryCount", "treeCount", "version",
    ]);
    const { sourceManifestDigest, ...core } = manifest;
    if (manifest.contract !== nativeInstallSourceContract || manifest.version !== nativeInstallSourceVersion
        || !repositoryPattern.test(manifest.repository) || !oidPattern.test(manifest.sourceCommit)
        || !oidPattern.test(manifest.rootTree) || !oidPattern.test(manifest.bootstrapBlob)
        || sourceManifestDigest !== sha256(canonicalJson(core))
        || !correlationPattern.test(String(manifest.taskCorrelation || ""))
        || !Number.isSafeInteger(manifest.traversedEntryCount) || manifest.traversedEntryCount < 1
        || !Array.isArray(manifest.objects) || manifest.objectCount !== manifest.objects.length
        || manifest.objects.some((entry) => {
          assertExactKeys(entry, ["byteCount", "oid", "type"]);
          return !oidPattern.test(String(entry.oid || "")) || !["commit", "tree", "blob"].includes(entry.type)
            || !Number.isSafeInteger(entry.byteCount) || entry.byteCount < 0 || entry.byteCount > maximumObjectBytes;
        })
        || new Set(manifest.objects.map((entry) => entry.oid)).size !== manifest.objects.length
        || manifest.treeCount !== manifest.objects.filter((entry) => entry.type === "tree").length
        || manifest.blobCount !== manifest.objects.filter((entry) => entry.type === "blob").length
        || !manifest.objects.some((entry) => entry.oid === manifest.sourceCommit && entry.type === "commit")
        || !manifest.objects.some((entry) => entry.oid === manifest.rootTree && entry.type === "tree")
        || !Array.isArray(value.supportFiles) || canonicalJson(value.supportFiles.map(stripBytes)) !== canonicalJson(manifest.support)
        || value.supportFiles.length < 2 || !value.supportFiles.some((entry) => entry.source === nativeInstallBootstrapEntrypoint)
        || !value.supportFiles.some((entry) => entry.source === nativeInstallProducerEntrypoint)
        || value.supportFiles.find((entry) => entry.source === nativeInstallBootstrapScript)?.gitBlobOid !== manifest.bootstrapBlob) {
      throw new Error("native install authenticated source invalid");
    }
    for (const member of value.supportFiles) {
      assertExactKeys(member, ["byteCount", "bytes", "executable", "gitBlobOid", "sha256", "source"]);
      const bytes = Buffer.from(member.bytes);
      if (!safeRepositoryPath(member.source) || !oidPattern.test(member.gitBlobOid) || !digestPattern.test(member.sha256)
          || member.byteCount !== bytes.length || member.sha256 !== sha256(bytes)
          || member.gitBlobOid !== gitObjectOid("blob", bytes) || typeof member.executable !== "boolean"
          || !manifest.objects.some((entry) => entry.oid === member.gitBlobOid && entry.type === "blob" && entry.byteCount === member.byteCount)) {
        throw new Error("native install authenticated support invalid");
      }
    }
    return { ok: true, reasonCode: "native_install_source_verified", sourceManifestDigest };
  } catch {
    return { ok: false, reasonCode: "native_install_source_invalid", sourceManifestDigest: null };
  }
}

export function reverifyMaterializedNativeInstallClosure({ authenticatedSource, materializedReader } = {}) {
  const sourceVerification = verifyAuthenticatedNativeInstallSource(authenticatedSource);
  if (!sourceVerification.ok || typeof materializedReader !== "function") {
    throw new Error("native install materialized source dependencies invalid");
  }
  for (const member of authenticatedSource.supportFiles) {
    const value = materializedReader(member.source);
    assertExactKeys(value, ["bytes", "gid", "mode", "nlink", "realpath", "source", "symlink", "type", "uid"]);
    const bytes = Buffer.from(value.bytes);
    const expectedMode = member.executable ? 0o555 : 0o444;
    if (value.source !== member.source || value.type !== "file" || value.symlink !== false || value.uid !== 0 || value.gid !== 0
        || value.mode !== expectedMode || value.nlink !== 1 || value.realpath !== member.source
        || !bytes.equals(member.bytes) || gitObjectOid("blob", bytes) !== member.gitBlobOid || sha256(bytes) !== member.sha256) {
      throw new Error("native install materialized source changed");
    }
  }
  return { ok: true, reasonCode: "native_install_materialized_source_verified", sourceManifestDigest: sourceVerification.sourceManifestDigest };
}

export function materializeAuthenticatedNativeInstallClosure({ authenticatedSource } = {}) {
  if (process.getuid?.() !== 0 || process.geteuid?.() !== 0 || process.getgid?.() !== 0 || process.getegid?.() !== 0
      || !verifyAuthenticatedNativeInstallSource(authenticatedSource).ok) {
    throw new Error("native install materialization requires authenticated real root");
  }
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-native-install-root-"));
  chownSync(root, 0, 0);
  chmodSync(root, 0o700);
  const createdDirectories = new Set([root]);
  for (const member of authenticatedSource.supportFiles) {
    const destination = path.join(root, member.source);
    let cursor = path.dirname(destination);
    const pending = [];
    while (!createdDirectories.has(cursor)) { pending.push(cursor); cursor = path.dirname(cursor); }
    for (const directory of pending.reverse()) {
      mkdirSync(directory, { mode: 0o700 });
      chownSync(directory, 0, 0);
      chmodSync(directory, 0o700);
      createdDirectories.add(directory);
      fsyncDirectory(path.dirname(directory));
    }
    const mode = member.executable ? 0o555 : 0o444;
    const fd = openSync(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode);
    try { writeFileSync(fd, member.bytes); fsyncSync(fd); } finally { closeSync(fd); }
    chownSync(destination, 0, 0);
    chmodSync(destination, mode);
    fsyncDirectory(path.dirname(destination));
  }
  for (const directory of [...createdDirectories].sort((left, right) => right.length - left.length)) {
    chmodSync(directory, 0o555);
    fsyncDirectory(directory);
  }
  fsyncDirectory(path.dirname(root));
  reverifyMaterializedNativeInstallClosure({
    authenticatedSource,
    materializedReader(source) {
      const target = path.join(root, source);
      const info = lstatSync(target);
      return {
        source,
        type: info.isFile() ? "file" : "other",
        symlink: info.isSymbolicLink(),
        uid: info.uid,
        gid: info.gid,
        mode: info.mode & 0o7777,
        nlink: info.nlink,
        realpath: path.relative(root, realpathSync(target)).split(path.sep).join("/"),
        bytes: readFileSync(target),
      };
    },
  });
  return root;
}

export function gitObjectOid(type, bytes) {
  if (!["blob", "tree", "commit"].includes(type) || !Buffer.isBuffer(Buffer.from(bytes))) {
    throw new Error("native install Git object invalid");
  }
  const payload = Buffer.from(bytes);
  return createHash("sha1").update(Buffer.from(`${type} ${payload.length}\0`)).update(payload).digest("hex");
}

function parseCommitHeaders(bytes) {
  const text = strictUtf8(bytes, "commit");
  const separator = text.indexOf("\n\n");
  if (separator < 0) throw new Error("native install Git commit invalid");
  const headers = text.slice(0, separator).split("\n");
  const trees = headers.filter((line) => line.startsWith("tree ")).map((line) => line.slice(5));
  if (trees.length !== 1 || !oidPattern.test(trees[0]) || headers.some((line) => line.includes("\0"))) {
    throw new Error("native install Git commit invalid");
  }
  return { tree: trees[0] };
}

function parseTree(bytes) {
  const entries = [];
  let offset = 0;
  const names = new Set();
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    const nul = bytes.indexOf(0x00, space + 1);
    if (space <= offset || nul <= space + 1 || nul + 21 > bytes.length) throw new Error("native install Git tree invalid");
    const mode = bytes.subarray(offset, space).toString("ascii");
    const nameBytes = bytes.subarray(space + 1, nul);
    const name = strictUtf8(nameBytes, "tree path");
    const oid = bytes.subarray(nul + 1, nul + 21).toString("hex");
    if (!/^(100644|100755|120000|40000)$/u.test(mode) || !safeTreeName(name) || !oidPattern.test(oid) || names.has(name)) {
      throw new Error("native install Git tree entry invalid");
    }
    if (mode === "120000") throw new Error("native install Git symlink entry forbidden");
    entries.push({ mode, name, oid });
    names.add(name);
    offset = nul + 21;
  }
  if (offset !== bytes.length) throw new Error("native install Git tree truncated");
  return entries;
}

function selectExecutableClosure(files, entrypoint) {
  const required = new Set();
  const pending = [entrypoint];
  while (pending.length > 0) {
    const source = pending.pop();
    if (required.has(source)) continue;
    const member = files.get(source);
    if (!member || !source.endsWith(".mjs") || !safeRepositoryPath(source)) {
      throw new Error(`native install support dependency missing: ${source}`);
    }
    required.add(source);
    for (const specifier of relativeModuleSpecifiers(member.bytes)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), specifier));
      if (!specifier.endsWith(".mjs") || !resolved.startsWith("tools/auto-runner/") || !safeRepositoryPath(resolved)) {
        throw new Error("native install support dependency escapes closure");
      }
      pending.push(resolved);
    }
  }
  return required;
}

function relativeModuleSpecifiers(bytes) {
  const text = strictUtf8(bytes, "support");
  const found = new Set();
  for (const pattern of [
    /(?:^|\n)\s*(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["'](\.[^"']+)["']/gu,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/gu,
  ]) {
    for (const match of text.matchAll(pattern)) found.add(match[1]);
  }
  return [...found].sort();
}

function safeTreeName(value) {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".."
    && !value.includes("/") && !value.includes("\0") && !value.includes("\\") && Buffer.byteLength(value) <= 255;
}
function safeRepositoryPath(value) {
  return typeof value === "string" && !value.startsWith("/") && path.posix.normalize(value) === value
    && !value.split("/").includes("..") && !value.includes("\0") && !value.includes("\\");
}
function strictUtf8(bytes, label) {
  const value = Buffer.from(bytes);
  const text = value.toString("utf8");
  if (!Buffer.from(text).equals(value)) throw new Error(`native install Git ${label} encoding invalid`);
  return text;
}
function stripBytes(value) {
  const { bytes: _bytes, ...rest } = value;
  return rest;
}
function assertExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error("native install closed schema invalid");
  }
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value) && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function fsyncDirectory(target) {
  const fd = openSync(target, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
