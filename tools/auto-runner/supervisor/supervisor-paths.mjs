import { createHash } from "node:crypto";
import {
  constants,
  existsSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  writeFileSync,
  closeSync,
} from "node:fs";
import path from "node:path";
import { defaultLogsRoot } from "../lib/config.mjs";

export const storageKeyPattern = /^[a-f0-9]{64}$/;
export const runArtifactKinds = Object.freeze({
  state: "state",
  heartbeat: "heartbeat",
  stdout: "stdout",
  stderr: "stderr",
  monitoringEvents: "monitoringEvents",
});

const runArtifactBasenames = Object.freeze({
  [runArtifactKinds.state]: "state.json",
  [runArtifactKinds.heartbeat]: "heartbeat.json",
  [runArtifactKinds.stdout]: "stdout.log",
  [runArtifactKinds.stderr]: "stderr.log",
  [runArtifactKinds.monitoringEvents]: "monitoring-events.jsonl",
});

export function storageKeyForLogicalId(logicalId) {
  const value = String(logicalId || "");
  if (!value) throw new Error("Logical identifier is required");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function validateStorageKey(storageKey) {
  const value = String(storageKey || "");
  if (!storageKeyPattern.test(value)) throw new Error("Invalid supervisor storage key");
  return value;
}

export function validateProfileName(profile = "default") {
  const value = String(profile || "").trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(value)) throw new Error("Invalid profile name");
  return value;
}

export function profileStorageKey(profile = "default") {
  return storageKeyForLogicalId(validateProfileName(profile));
}

export function deriveSupervisorPaths({ runId, logsRoot = defaultLogsRoot } = {}) {
  const runStorageKey = storageKeyForLogicalId(runId);
  return {
    logsRoot,
    supervisorRoot: path.join(logsRoot, "supervisor"),
    runStorageKey,
    runSpecDir: path.join(logsRoot, "supervisor", "run-specs", runStorageKey),
    runDir: path.join(logsRoot, "supervisor", "runs", runStorageKey),
    specPath: path.join(logsRoot, "supervisor", "run-specs", runStorageKey, "spec.json"),
    artifactPath(kind) {
      const basename = fixedArtifactBasename(kind);
      return path.join(logsRoot, "supervisor", "runs", runStorageKey, basename);
    },
  };
}

export function configPathForProfile(profile = "default", logsRoot = defaultLogsRoot) {
  const storageKey = profileStorageKey(profile);
  return path.join(logsRoot, "configs", "profiles", storageKey, "config.json");
}

export function fixedArtifactBasename(kind) {
  const basename = runArtifactBasenames[kind];
  if (!basename) throw new Error(`Unsupported supervisor artifact kind: ${kind}`);
  return basename;
}

export function ensureTrustedRunPathContext({ runId, logsRoot = defaultLogsRoot } = {}) {
  const derived = deriveSupervisorPaths({ runId, logsRoot });
  const supervisorRoot = ensurePrivateDirectory(derived.supervisorRoot);
  const runSpecsRoot = ensurePrivateDirectory(path.join(supervisorRoot, "run-specs"));
  const runsRoot = ensurePrivateDirectory(path.join(supervisorRoot, "runs"));
  const runSpecDir = ensureChildDirectory(runSpecsRoot, derived.runStorageKey);
  const runDir = ensureChildDirectory(runsRoot, derived.runStorageKey);
  return {
    ...derived,
    supervisorRoot,
    runSpecsRoot,
    runsRoot,
    runSpecDir,
    runDir,
    specPath: containedPath(runSpecDir, "spec.json"),
    artifactPath(kind) {
      return containedPath(runDir, fixedArtifactBasename(kind));
    },
  };
}

export function writeTrustedJson(context, kind, value, { exclusive = false } = {}) {
  const targetPath = kind === "spec" ? context.specPath : context.artifactPath(kind);
  writeOwnerOnlyFile(targetPath, `${canonicalSerialize(value)}\n`, { exclusive });
  return targetPath;
}

export function atomicWriteTrustedJson(context, kind, value) {
  const targetPath = context.artifactPath(kind);
  const dir = path.dirname(targetPath);
  const tmp = containedPath(dir, `.${path.basename(targetPath)}.${process.pid}.tmp`);
  writeOwnerOnlyFile(tmp, `${canonicalSerialize(value)}\n`);
  renameSync(tmp, targetPath);
  return targetPath;
}

function writeOwnerOnlyFile(targetPath, text, { exclusive = false } = {}) {
  const flags = constants.O_WRONLY | constants.O_CREAT | (exclusive ? constants.O_EXCL : constants.O_TRUNC);
  const fd = openSync(targetPath, flags, 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeFileSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

function ensurePrivateDirectory(dirPath) {
  if (existsSync(dirPath)) rejectUnsafePath(dirPath, { directory: true });
  mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  rejectUnsafePath(dirPath, { directory: true });
  return realpathSync(dirPath);
}

function ensureChildDirectory(rootRealPath, storageKey) {
  validateStorageKey(storageKey);
  const dirPath = containedPath(rootRealPath, storageKey);
  if (existsSync(dirPath)) rejectUnsafePath(dirPath, { directory: true });
  mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  rejectUnsafePath(dirPath, { directory: true });
  return realpathSync(dirPath);
}

function rejectUnsafePath(targetPath, { directory = false } = {}) {
  const stat = lstatSync(targetPath);
  if (stat.isSymbolicLink()) throw new Error(`Symlink paths are not allowed: ${targetPath}`);
  if (directory && !stat.isDirectory()) throw new Error(`Path must be a directory: ${targetPath}`);
  if (!directory && !stat.isFile()) throw new Error(`Path must be a regular file: ${targetPath}`);
  if ((stat.mode & 0o022) !== 0) throw new Error(`Group/world-writable paths are not allowed: ${targetPath}`);
}

function containedPath(rootRealPath, basename) {
  if (basename !== path.basename(basename) || basename.includes("/") || basename.includes("\\")) {
    throw new Error("Supervisor artifact basename must be fixed");
  }
  const targetPath = path.resolve(rootRealPath, basename);
  const relative = path.relative(rootRealPath, targetPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Supervisor path escaped trusted root");
  }
  return targetPath;
}

function canonicalSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerialize(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`)
    .join(",")}}`;
}
