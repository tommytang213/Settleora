import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { defaultLogsRoot, parseDuration } from "../lib/config.mjs";
import {
  configPathForProfile,
  deriveSupervisorPaths,
  ensureTrustedRunPathContext,
  validateProfileName,
  writeTrustedJson,
} from "./supervisor-paths.mjs";

export const specVersion = 1;
export const defaultMaxTasks = 1;
export const defaultMaxRuntime = "3h";
export const minRuntimeMs = 60 * 1000;
export const maxRuntimeMs = 14 * 24 * 60 * 60 * 1000;
export const approvedConfigRoots = [
  path.join(defaultLogsRoot, "configs"),
  path.join(defaultLogsRoot, "canary"),
];
export const supervisorRoot = path.join(defaultLogsRoot, "supervisor");
export const allowedModes = new Set(["canary", "trusted"]);
export const allowedSpecFields = new Set([
  "specVersion",
  "runId",
  "createdAt",
  "maxTasks",
  "maxRuntime",
  "mode",
  "profile",
  "runnerConfigSha256",
  "initialOriginMainSha",
  "requestedBy",
]);

export function generateRunId(date = new Date()) {
  return `supervised-${date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "")}-${randomBytes(6).toString("hex")}`;
}

export function validateRunId(runId) {
  if (!/^supervised-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(String(runId || ""))) {
    throw new Error("Invalid supervisor run ID");
  }
  return runId;
}

export function normalizeMaxTasks(value = defaultMaxTasks) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error("MaxTasks must be a positive integer in the range 1..500");
  }
  return parsed;
}

export function normalizeMaxRuntime(value = defaultMaxRuntime) {
  const raw = String(value || "").trim();
  const runtimeMs = parseDuration(raw);
  if (runtimeMs < minRuntimeMs || runtimeMs > maxRuntimeMs) {
    throw new Error("MaxRuntime must be in the range 1m..14d");
  }
  if (!/^\d+(m|h|d)$/i.test(raw)) {
    throw new Error("MaxRuntime must include an explicit unit: m, h, or d");
  }
  return raw.toLowerCase();
}

export function normalizeMode(mode = "canary") {
  const value = String(mode || "").trim();
  if (!allowedModes.has(value)) {
    throw new Error("mode must be canary or trusted");
  }
  return value;
}

export function canonicalJson(value) {
  return `${canonicalSerialize(value)}\n`;
}

export function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function specPathForRunId(runId, logsRoot = defaultLogsRoot) {
  validateRunId(runId);
  return deriveSupervisorPaths({ runId, logsRoot }).specPath;
}

export function runDirForRunId(runId, logsRoot = defaultLogsRoot) {
  validateRunId(runId);
  return deriveSupervisorPaths({ runId, logsRoot }).runDir;
}

export function resolveProfile(profile = "default", logsRoot = defaultLogsRoot) {
  const name = validateProfileName(profile);
  return {
    profile: name,
    runnerConfigPath: configPathForProfile(name, logsRoot),
  };
}

function validateRegularPrivateFile(filePath, { approvedRoots = null, requireOwnerOnly = false, allowMissing = false } = {}) {
  const absolute = path.resolve(filePath);
  if (!existsSync(absolute)) {
    if (allowMissing) return { path: absolute, exists: false, sha256: null, realPath: null };
    throw new Error(`Required file does not exist: ${absolute}`);
  }
  const stat = lstatSync(absolute);
  if (!stat.isFile()) {
    throw new Error(`Path must be a regular file: ${absolute}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Symlink paths are not allowed: ${absolute}`);
  }
  if ((stat.mode & 0o022) !== 0) {
    throw new Error(`Group/world-writable files are not allowed: ${absolute}`);
  }
  if (requireOwnerOnly && (stat.mode & 0o077) !== 0) {
    throw new Error(`Run spec must be owner-only: ${absolute}`);
  }
  const realPath = realpathSync(absolute);
  if (approvedRoots) {
    const inside = approvedRoots.some((root) => {
      const rootReal = existsSync(root) ? realpathSync(root) : path.resolve(root);
      const relative = path.relative(rootReal, realPath);
      return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
    });
    if (!inside) {
      throw new Error(`Path is outside approved roots: ${absolute}`);
    }
  }
  return { path: absolute, exists: true, sha256: sha256File(realPath), realPath };
}

export function buildRunSpec({
  runId = generateRunId(),
  createdAt = new Date().toISOString(),
  maxTasks = defaultMaxTasks,
  maxRuntime = defaultMaxRuntime,
  mode = "canary",
  profile = "default",
  initialOriginMainSha,
  requestedBy = "operator",
  allowMissingConfig = false,
  logsRoot = defaultLogsRoot,
} = {}) {
  validateRunId(runId);
  const resolvedProfile = resolveProfile(profile, logsRoot);
  const normalizedConfigPath = path.resolve(resolvedProfile.runnerConfigPath);
  const config = validateRegularPrivateFile(normalizedConfigPath, {
    approvedRoots: configRootsForLogsRoot(logsRoot),
    allowMissing: allowMissingConfig,
  });
  if (!/^[a-f0-9]{40}$/.test(String(initialOriginMainSha || ""))) {
    throw new Error("initialOriginMainSha must be a 40-character git SHA");
  }
  const spec = {
    specVersion,
    runId,
    createdAt,
    maxTasks: normalizeMaxTasks(maxTasks),
    maxRuntime: normalizeMaxRuntime(maxRuntime),
    mode: normalizeMode(mode),
    profile: resolvedProfile.profile,
    runnerConfigSha256: config.sha256,
    initialOriginMainSha,
    requestedBy: normalizeRequestedBy(requestedBy),
  };
  validateRunSpecShape(spec);
  return { spec, config };
}

export function validateRunSpecShape(spec) {
  for (const key of Object.keys(spec || {})) {
    if (!allowedSpecFields.has(key)) throw new Error(`Unknown run-spec field: ${key}`);
  }
  if (spec.specVersion !== specVersion) throw new Error("Unsupported run-spec version");
  validateRunId(spec.runId);
  if (Number.isNaN(Date.parse(spec.createdAt))) throw new Error("createdAt must be an ISO timestamp");
  normalizeMaxTasks(spec.maxTasks);
  normalizeMaxRuntime(spec.maxRuntime);
  normalizeMode(spec.mode);
  validateProfileName(spec.profile);
  if (spec.runnerConfigSha256 !== null && !/^[a-f0-9]{64}$/.test(String(spec.runnerConfigSha256 || ""))) {
    throw new Error("runnerConfigSha256 must be null or a SHA-256 digest");
  }
  if (!/^[a-f0-9]{40}$/.test(String(spec.initialOriginMainSha || ""))) {
    throw new Error("initialOriginMainSha must be a 40-character git SHA");
  }
  normalizeRequestedBy(spec.requestedBy);
  return spec;
}

export function writeImmutableRunSpec(spec, logsRoot = defaultLogsRoot) {
  validateRunSpecShape(spec);
  const context = ensureTrustedRunPathContext({ runId: spec.runId, logsRoot });
  const specPath = writeTrustedJson(context, "spec", spec, { exclusive: true });
  return { specPath, specSha256: sha256Text(canonicalJson(spec)) };
}

export function readAndVerifyRunSpec(runId, expectedSpecSha256 = null, logsRoot = defaultLogsRoot) {
  const specPath = specPathForRunId(runId, logsRoot);
  validateRegularPrivateFile(specPath, { requireOwnerOnly: true });
  const parsed = JSON.parse(readFileSync(specPath, "utf8"));
  validateRunSpecShape(parsed);
  if (parsed.runId !== runId) throw new Error("Run-spec runId mismatch");
  const canonical = canonicalJson(parsed);
  const digest = sha256Text(canonical);
  if (expectedSpecSha256 && digest !== expectedSpecSha256) {
    throw new Error("Run spec digest mismatch");
  }
  const configPath = resolveProfile(parsed.profile, logsRoot).runnerConfigPath;
  const config = validateRegularPrivateFile(configPath, { approvedRoots: configRootsForLogsRoot(logsRoot) });
  if (parsed.runnerConfigSha256 && config.sha256 !== parsed.runnerConfigSha256) {
    throw new Error("Runner config digest mismatch");
  }
  return { spec: parsed, specPath, specSha256: digest, config };
}

export function configRootsForLogsRoot(logsRoot = defaultLogsRoot) {
  return [path.join(logsRoot, "configs"), path.join(logsRoot, "canary")];
}

function canonicalSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerialize(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`)
    .join(",")}}`;
}

function normalizeRequestedBy(value) {
  const normalized = String(value || "").trim();
  if (!/^[a-zA-Z0-9_.@-]{1,64}$/.test(normalized)) throw new Error("requestedBy is invalid");
  return normalized;
}
