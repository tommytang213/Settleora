import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { defaultLogsRoot, parseDuration, validateExternalProfilePath } from "../lib/config.mjs";
import { validateSupervisorRunId } from "../lib/run-correlation.mjs";
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
  "runnerConfigPath",
  "runnerConfigSha256",
  "initialOriginMainSha",
  "requestedBy",
  "parentSupervisorRunId",
  "parentRunnerRunId",
  "sourceIssueNumber",
  "sourceBranchName",
  "outageResubmission",
  "recoveryOnlyTarget",
]);

export function generateRunId(date = new Date()) {
  return `supervised-${date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "")}-${randomBytes(6).toString("hex")}`;
}

export function validateRunId(runId) {
  return validateSupervisorRunId(runId);
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
  parentSupervisorRunId = null,
  parentRunnerRunId = null,
  sourceIssueNumber = null,
  sourceBranchName = null,
  outageResubmission = null,
  recoveryOnlyTarget = null,
  allowMissingConfig = false,
  logsRoot = defaultLogsRoot,
  runnerConfigPath = null,
} = {}) {
  validateRunId(runId);
  const resolvedProfile = resolveProfile(profile, logsRoot);
  const normalizedConfigPath = path.resolve(runnerConfigPath || resolvedProfile.runnerConfigPath);
  if (!path.isAbsolute(runnerConfigPath || resolvedProfile.runnerConfigPath)
      || normalizedConfigPath !== (runnerConfigPath || resolvedProfile.runnerConfigPath)) {
    throw new Error("runnerConfigPath must be canonical and absolute");
  }
  const config = validateRunnerConfigPath(normalizedConfigPath, logsRoot, { allowMissing: allowMissingConfig });
  if (!/^[a-f0-9]{40}$/.test(String(initialOriginMainSha || ""))) {
    throw new Error("initialOriginMainSha must be a 40-character git SHA");
  }
  const normalizedRecoveryOnlyTarget = normalizeOptionalRecoveryOnlyTarget(recoveryOnlyTarget);
  const normalizedOutageResubmission = normalizeOptionalOutageResubmission(outageResubmission);
  const requestedMaxTasks = normalizeMaxTasks(maxTasks);
  const effectiveMaxTasks = normalizedRecoveryOnlyTarget ? 1 : requestedMaxTasks;
  const spec = {
    specVersion,
    runId,
    createdAt,
    maxTasks: effectiveMaxTasks,
    maxRuntime: normalizeMaxRuntime(maxRuntime),
    mode: normalizeMode(mode),
    profile: resolvedProfile.profile,
    runnerConfigPath: normalizedConfigPath,
    runnerConfigSha256: config.sha256,
    initialOriginMainSha,
    requestedBy: normalizeRequestedBy(requestedBy),
    parentSupervisorRunId: normalizeOptionalSupervisorRunId(parentSupervisorRunId),
    parentRunnerRunId: normalizeOptionalRunnerRunId(parentRunnerRunId),
    sourceIssueNumber: normalizeOptionalIssueNumber(sourceIssueNumber),
    sourceBranchName: normalizeOptionalBranchName(sourceBranchName),
    outageResubmission: normalizedOutageResubmission,
    recoveryOnlyTarget: normalizedRecoveryOnlyTarget,
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
  if (spec.runnerConfigPath !== undefined
      && (!path.isAbsolute(spec.runnerConfigPath) || path.resolve(spec.runnerConfigPath) !== spec.runnerConfigPath)) {
    throw new Error("runnerConfigPath must be canonical and absolute");
  }
  if (spec.runnerConfigSha256 !== null && !/^[a-f0-9]{64}$/.test(String(spec.runnerConfigSha256 || ""))) {
    throw new Error("runnerConfigSha256 must be null or a SHA-256 digest");
  }
  if (!/^[a-f0-9]{40}$/.test(String(spec.initialOriginMainSha || ""))) {
    throw new Error("initialOriginMainSha must be a 40-character git SHA");
  }
  normalizeRequestedBy(spec.requestedBy);
  normalizeOptionalSupervisorRunId(spec.parentSupervisorRunId);
  normalizeOptionalRunnerRunId(spec.parentRunnerRunId);
  normalizeOptionalIssueNumber(spec.sourceIssueNumber);
  normalizeOptionalBranchName(spec.sourceBranchName);
  normalizeOptionalOutageResubmission(spec.outageResubmission);
  normalizeOptionalRecoveryOnlyTarget(spec.recoveryOnlyTarget);
  validateRecoveryOnlyContract(spec);
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
  const configPath = parsed.runnerConfigPath || resolveProfile(parsed.profile, logsRoot).runnerConfigPath;
  const config = validateRunnerConfigPath(configPath, logsRoot);
  if (parsed.runnerConfigSha256 && config.sha256 !== parsed.runnerConfigSha256) {
    throw new Error("Runner config digest mismatch");
  }
  return { spec: { ...parsed, runnerConfigPath: config.path }, specPath, specSha256: digest, config };
}

export function configRootsForLogsRoot(logsRoot = defaultLogsRoot) {
  return [path.join(logsRoot, "configs"), path.join(logsRoot, "canary")];
}

export function validateRunnerConfigPath(configPath, logsRoot = defaultLogsRoot, { allowMissing = false } = {}) {
  const approvedRoots = configRootsForLogsRoot(logsRoot);
  const absolute = path.resolve(configPath);
  const isDevelopmentProfile = approvedRoots.some((root) => {
    const relative = path.relative(path.resolve(root), absolute);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
  if (!isDevelopmentProfile) validateExternalProfilePath(absolute);
  return validateRegularPrivateFile(absolute, {
    approvedRoots: isDevelopmentProfile ? approvedRoots : null,
    allowMissing,
  });
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

function normalizeOptionalSupervisorRunId(value) {
  if (value === null || value === undefined) return null;
  return validateRunId(value);
}

function normalizeOptionalRunnerRunId(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value || "").trim();
  if (!/^run-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z(?:-[a-f0-9]{12})?$/.test(normalized)) throw new Error("parentRunnerRunId is invalid");
  return normalized;
}

function normalizeOptionalIssueNumber(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > 9999999) throw new Error("sourceIssueNumber is invalid");
  return value;
}

function normalizeOptionalBranchName(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value || "").trim();
  if (!/^(feature|focused|feature-bundle|tools)\/[A-Za-z0-9._/-]{1,180}$/.test(normalized) || normalized.includes("..")) {
    throw new Error("sourceBranchName is invalid");
  }
  return normalized;
}

function normalizeOptionalOutageResubmission(value) {
  if (value === null || value === undefined) return null;
  const allowedKeys = new Set([
    "attemptNumber",
    "markerKey",
    "outageFingerprint",
    "originalSupervisorSpecDigest",
    "taskKey",
    "currentHeadSha",
    "prNumber",
    "prHeadSha",
  ]);
  for (const key of Object.keys(value || {})) {
    if (!allowedKeys.has(key)) throw new Error(`Unknown outageResubmission field: ${key}`);
  }
  const taskKey = String(value.taskKey || "").trim();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(taskKey) || taskKey.includes("..")) {
    throw new Error("outageResubmission.taskKey is invalid");
  }
  const currentHeadSha = String(value.currentHeadSha || "").trim();
  if (!/^[a-f0-9]{40}$/.test(currentHeadSha)) throw new Error("outageResubmission.currentHeadSha is invalid");
  const prNumber = value.prNumber === null || value.prNumber === undefined ? null : value.prNumber;
  const prHeadSha = value.prHeadSha === null || value.prHeadSha === undefined ? null : String(value.prHeadSha || "").trim();
  if (prNumber !== null && (!Number.isSafeInteger(prNumber) || prNumber < 1 || prNumber > 9999999)) {
    throw new Error("outageResubmission.prNumber is invalid");
  }
  if (prHeadSha !== null && !/^[a-f0-9]{40}$/.test(prHeadSha)) throw new Error("outageResubmission.prHeadSha is invalid");
  if ((prNumber === null) !== (prHeadSha === null)) {
    throw new Error("outageResubmission.prNumber and prHeadSha must be paired");
  }
  if (!Number.isSafeInteger(value.attemptNumber) || value.attemptNumber < 1 || value.attemptNumber > 20) {
    throw new Error("outageResubmission.attemptNumber is invalid");
  }
  for (const key of ["markerKey", "outageFingerprint", "originalSupervisorSpecDigest"]) {
    if (!/^[a-f0-9]{64}$/.test(String(value[key] || ""))) throw new Error(`outageResubmission.${key} is invalid`);
  }
  return {
    attemptNumber: value.attemptNumber,
    markerKey: value.markerKey,
    outageFingerprint: value.outageFingerprint,
    originalSupervisorSpecDigest: value.originalSupervisorSpecDigest,
    taskKey,
    currentHeadSha,
    prNumber,
    prHeadSha,
  };
}

function normalizeOptionalRecoveryOnlyTarget(value) {
  if (value === null || value === undefined) return null;
  const allowedKeys = new Set([
    "taskKey",
    "issueNumber",
    "branchName",
    "baseSha",
    "currentHeadSha",
    "prNumber",
    "prHeadSha",
    "runnerRunId",
    "supervisorRunId",
    "originalSupervisorSpecDigest",
    "markerKey",
    "outageFingerprint",
    "attemptNumber",
  ]);
  for (const key of Object.keys(value || {})) {
    if (!allowedKeys.has(key)) throw new Error(`Unknown recoveryOnlyTarget field: ${key}`);
  }
  const taskKey = String(value.taskKey || "").trim();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(taskKey) || taskKey.includes("..")) {
    throw new Error("recoveryOnlyTarget.taskKey is invalid");
  }
  const issueNumber = normalizeOptionalIssueNumber(value.issueNumber);
  if (issueNumber === null) throw new Error("recoveryOnlyTarget.issueNumber is invalid");
  const branchName = normalizeOptionalBranchName(value.branchName);
  if (branchName === null) throw new Error("recoveryOnlyTarget.branchName is invalid");
  const baseSha = String(value.baseSha || "").trim();
  if (!/^[a-f0-9]{40}$/.test(baseSha)) throw new Error("recoveryOnlyTarget.baseSha is invalid");
  const currentHeadSha = String(value.currentHeadSha || "").trim();
  if (!/^[a-f0-9]{40}$/.test(currentHeadSha)) throw new Error("recoveryOnlyTarget.currentHeadSha is invalid");
  const prNumber = value.prNumber === null || value.prNumber === undefined ? null : value.prNumber;
  const prHeadSha = value.prHeadSha === null || value.prHeadSha === undefined ? null : String(value.prHeadSha || "").trim();
  if (prNumber !== null && (!Number.isSafeInteger(prNumber) || prNumber < 1 || prNumber > 9999999)) {
    throw new Error("recoveryOnlyTarget.prNumber is invalid");
  }
  if (prHeadSha !== null && !/^[a-f0-9]{40}$/.test(prHeadSha)) throw new Error("recoveryOnlyTarget.prHeadSha is invalid");
  if ((prNumber === null) !== (prHeadSha === null)) {
    throw new Error("recoveryOnlyTarget.prNumber and prHeadSha must be paired");
  }
  const runnerRunId = normalizeOptionalRunnerRunId(value.runnerRunId);
  if (runnerRunId === null) throw new Error("recoveryOnlyTarget.runnerRunId is invalid");
  const supervisorRunId = normalizeOptionalSupervisorRunId(value.supervisorRunId);
  if (supervisorRunId === null) throw new Error("recoveryOnlyTarget.supervisorRunId is invalid");
  if (!Number.isSafeInteger(value.attemptNumber) || value.attemptNumber < 1 || value.attemptNumber > 20) {
    throw new Error("recoveryOnlyTarget.attemptNumber is invalid");
  }
  for (const key of ["markerKey", "outageFingerprint", "originalSupervisorSpecDigest"]) {
    if (!/^[a-f0-9]{64}$/.test(String(value[key] || ""))) throw new Error(`recoveryOnlyTarget.${key} is invalid`);
  }
  return {
    taskKey,
    issueNumber,
    branchName,
    baseSha,
    currentHeadSha,
    prNumber,
    prHeadSha,
    runnerRunId,
    supervisorRunId,
    originalSupervisorSpecDigest: value.originalSupervisorSpecDigest,
    markerKey: value.markerKey,
    outageFingerprint: value.outageFingerprint,
    attemptNumber: value.attemptNumber,
  };
}

function validateRecoveryOnlyContract(spec) {
  const hasOutage = spec.outageResubmission !== null && spec.outageResubmission !== undefined;
  const hasTarget = spec.recoveryOnlyTarget !== null && spec.recoveryOnlyTarget !== undefined;
  if (hasOutage !== hasTarget) {
    throw new Error("outage resubmission specs require paired recoveryOnlyTarget");
  }
  if (!hasTarget) return;
  const target = spec.recoveryOnlyTarget;
  const outage = spec.outageResubmission;
  if (target.prNumber === null || target.prHeadSha === null || outage.prNumber === null || outage.prHeadSha === null) {
    throw new Error("recovery-only target requires PR number/head SHA");
  }
  if (spec.maxTasks !== 1) {
    throw new Error("recovery-only run specs must store maxTasks 1");
  }
  const duplicateChecks = [
    ["parentSupervisorRunId", spec.parentSupervisorRunId, target.supervisorRunId],
    ["parentRunnerRunId", spec.parentRunnerRunId, target.runnerRunId],
    ["sourceIssueNumber", spec.sourceIssueNumber, target.issueNumber],
    ["sourceBranchName", spec.sourceBranchName, target.branchName],
    ["baseSha", spec.initialOriginMainSha, target.baseSha],
    ["taskKey", outage.taskKey, target.taskKey],
    ["currentHeadSha", outage.currentHeadSha, target.currentHeadSha],
    ["prNumber", outage.prNumber, target.prNumber],
    ["prHeadSha", outage.prHeadSha, target.prHeadSha],
    ["originalSupervisorSpecDigest", outage.originalSupervisorSpecDigest, target.originalSupervisorSpecDigest],
    ["markerKey", outage.markerKey, target.markerKey],
    ["outageFingerprint", outage.outageFingerprint, target.outageFingerprint],
    ["attemptNumber", outage.attemptNumber, target.attemptNumber],
  ];
  for (const [field, actual, expected] of duplicateChecks) {
    if (actual !== expected) throw new Error(`recovery-only target identity mismatch: ${field}`);
  }
  if (spec.mode === "canary") throw new Error("recovery-only outage child cannot use canary mode");
}
