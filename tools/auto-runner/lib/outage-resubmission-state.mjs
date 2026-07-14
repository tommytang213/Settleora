import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";

export const outageResubmissionStateVersion = 1;
export const outageResubmissionRootName = path.join("recovery", "outage-resubmission");

export const outageMarkerStatuses = Object.freeze([
  "planned",
  "submission_uncertain",
  "submitted",
  "confirmed_running",
  "recovered",
  "exhausted",
  "blocked",
]);

export function outageResubmissionStorageKey(correlation = {}) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalCorrelation(correlation)))
    .digest("hex");
}

export function outageResubmissionStatePath(config, keyOrState) {
  const key = typeof keyOrState === "string" ? keyOrState : outageResubmissionStorageKey(keyOrState?.correlation || keyOrState);
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid outage resubmission storage key");
  return path.join(config.logsRoot, outageResubmissionRootName, `${key}.json`);
}

export function createOutageResubmissionState({
  correlation,
  outage,
  schedule,
  circuit = null,
  parentResubmissionId = null,
  marker = null,
}) {
  const now = new Date().toISOString();
  const state = sanitizeState({
    stateVersion: outageResubmissionStateVersion,
    correlation: canonicalCorrelation(correlation),
    outage: canonicalOutage(outage),
    schedule: canonicalSchedule(schedule),
    circuit: circuit ? canonicalCircuit(circuit) : null,
    parentResubmissionId: bounded(parentResubmissionId, 120) || null,
    childSupervisorRunId: null,
    mutationMarker: marker || buildOutageResubmissionMarker({
      correlation,
      attemptNumber: schedule?.attemptNumber || outage?.attemptNumber || 1,
      specDigest: correlation?.originalSupervisorSpecDigest,
    }),
    attemptHistory: [],
    status: "planned",
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
  });
  const validation = validateOutageResubmissionState(state);
  if (!validation.ok) throw new Error(`Invalid outage resubmission state: ${validation.reason}`);
  return state;
}

export function writeOutageResubmissionState(config, state) {
  const validation = validateOutageResubmissionState(state);
  if (!validation.ok) throw new Error(`Invalid outage resubmission state: ${validation.reason}`);
  const statePath = outageResubmissionStatePath(config, state);
  const root = path.dirname(statePath);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  rejectUnsafeDirectory(root);
  const sanitized = sanitizeState({
    ...state,
    timestamps: { ...(state.timestamps || {}), updatedAt: new Date().toISOString() },
  });
  const tmp = path.join(root, `.${path.basename(statePath)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, statePath);
  return { statePath, state: sanitized };
}

export function loadOutageResubmissionState(config, keyOrState) {
  const statePath = outageResubmissionStatePath(config, keyOrState);
  if (!existsSync(statePath)) return failed("outage_resubmission_state_missing", { statePath });
  try {
    rejectUnsafeRegularFile(statePath);
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    const validation = validateOutageResubmissionState(parsed);
    if (!validation.ok) return failed("outage_resubmission_state_schema_invalid", { statePath, reason: validation.reason });
    return { ok: true, state: parsed, statePath };
  } catch (error) {
    return failed("outage_resubmission_state_corrupt", { statePath, reason: bounded(error.message, 240) });
  }
}

export function listOutageResubmissionStates(config) {
  const root = path.join(config.logsRoot, outageResubmissionRootName);
  if (!existsSync(root)) return [];
  rejectUnsafeDirectory(root);
  return readdirSync(root)
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .map((name) => loadOutageResubmissionState(config, name.slice(0, -5)))
    .filter((result) => result.ok)
    .map((result) => result.state)
    .sort((a, b) => String(a.timestamps?.updatedAt || "").localeCompare(String(b.timestamps?.updatedAt || "")));
}

export function buildOutageResubmissionMarker({ correlation, attemptNumber, specDigest }) {
  const attempt = Number.isSafeInteger(attemptNumber) ? attemptNumber : 1;
  const key = createHash("sha256")
    .update(JSON.stringify({
      correlation: canonicalCorrelation(correlation),
      attempt,
      specDigest: digestOrNull(specDigest),
    }))
    .digest("hex");
  return {
    kind: "outage_resubmission",
    key,
    status: "planned",
    attemptNumber: attempt,
    specDigest: digestOrNull(specDigest),
    updatedAt: new Date().toISOString(),
  };
}

export function transitionOutageMarker(state, { status, childSupervisorRunId = state.childSupervisorRunId || null, reasonCode = null } = {}) {
  if (!outageMarkerStatuses.includes(status)) throw new Error(`Invalid outage marker status: ${status}`);
  const next = sanitizeState({
    ...state,
    status,
    childSupervisorRunId: bounded(childSupervisorRunId, 80) || null,
    mutationMarker: {
      ...state.mutationMarker,
      status,
      childSupervisorRunId: bounded(childSupervisorRunId, 80) || null,
      reasonCode: bounded(reasonCode, 120) || null,
      updatedAt: new Date().toISOString(),
    },
  });
  const validation = validateOutageResubmissionState(next);
  if (!validation.ok) throw new Error(`Invalid outage resubmission state: ${validation.reason}`);
  return next;
}

export function recordOutageAttempt(state, attempt = {}) {
  const entry = sanitizeState({
    at: attempt.at || new Date().toISOString(),
    status: outageMarkerStatuses.includes(attempt.status) ? attempt.status : "planned",
    attemptNumber: Number.isSafeInteger(attempt.attemptNumber) ? attempt.attemptNumber : state.mutationMarker.attemptNumber,
    childSupervisorRunId: bounded(attempt.childSupervisorRunId, 80) || null,
    reasonCode: bounded(attempt.reasonCode, 120) || null,
  });
  return sanitizeState({
    ...state,
    attemptHistory: [...(state.attemptHistory || []), entry].slice(-50),
  });
}

export function verifyOutageCorrelation(state, expected = {}) {
  const actual = state?.correlation || {};
  for (const field of [
    "taskKey",
    "runnerRunId",
    "supervisorRunId",
    "issueNumber",
    "branchName",
    "baseSha",
    "currentHeadSha",
    "prNumber",
    "prHeadSha",
    "runnerProfile",
    "runnerConfigDigest",
    "originalSupervisorSpecDigest",
  ]) {
    if (field in expected && expected[field] !== actual[field]) {
      return { ok: false, reasonCode: "outage_resubmission_identity_drift", field };
    }
  }
  return { ok: true, reasonCode: "outage_resubmission_identity_match" };
}

export function validateOutageResubmissionState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return invalid("state must be an object");
  if (state.stateVersion !== outageResubmissionStateVersion) return invalid("unsupported outage resubmission state version");
  if (!state.correlation || typeof state.correlation !== "object") return invalid("missing correlation");
  if (!Number.isInteger(state.correlation.issueNumber)) return invalid("invalid issue number");
  for (const field of ["baseSha", "currentHeadSha"]) {
    if (!isSha(state.correlation[field])) return invalid(`invalid ${field}`);
  }
  if (state.correlation.prHeadSha !== null && !isSha(state.correlation.prHeadSha)) return invalid("invalid prHeadSha");
  for (const field of ["runnerConfigDigest", "originalSupervisorSpecDigest", "outageFingerprint"]) {
    if (!isDigest(state.correlation[field] || state.outage?.[field])) return invalid(`invalid ${field}`);
  }
  if (!outageMarkerStatuses.includes(state.status)) return invalid("invalid status");
  if (!state.mutationMarker || state.mutationMarker.kind !== "outage_resubmission") return invalid("invalid mutation marker");
  if (!/^[a-f0-9]{64}$/.test(String(state.mutationMarker.key || ""))) return invalid("invalid mutation marker key");
  if (!outageMarkerStatuses.includes(state.mutationMarker.status)) return invalid("invalid mutation marker status");
  if (!Array.isArray(state.attemptHistory) || state.attemptHistory.length > 50) return invalid("invalid attempt history");
  if (!state.timestamps || Number.isNaN(Date.parse(state.timestamps.createdAt || ""))) return invalid("invalid timestamps");
  return { ok: true };
}

function canonicalCorrelation(input = {}) {
  return {
    taskKey: bounded(input.taskKey, 80),
    runnerRunId: bounded(input.runnerRunId || input.runId, 80),
    supervisorRunId: bounded(input.supervisorRunId, 80),
    issueNumber: Number.isSafeInteger(input.issueNumber) ? input.issueNumber : null,
    branchName: bounded(input.branchName, 180),
    baseSha: shaOrNull(input.baseSha),
    currentHeadSha: shaOrNull(input.currentHeadSha || input.headSha),
    prNumber: Number.isSafeInteger(input.prNumber) ? input.prNumber : null,
    prHeadSha: shaOrNull(input.prHeadSha),
    runnerProfile: bounded(input.runnerProfile || input.profile, 80),
    runnerConfigDigest: digestOrNull(input.runnerConfigDigest || input.runnerConfigSha256),
    originalSupervisorSpecDigest: digestOrNull(input.originalSupervisorSpecDigest || input.specDigest),
    outageProviderDomain: bounded(input.outageProviderDomain || input.providerDomain, 80),
    outageFingerprint: digestOrNull(input.outageFingerprint),
  };
}

function canonicalOutage(input = {}) {
  return {
    providerDomain: bounded(input.providerDomain || input.domain, 80),
    outageClass: bounded(input.outageClass, 120),
    outageFingerprint: digestOrNull(input.outageFingerprint || input.fingerprint),
    firstFailureAt: isoOrNull(input.firstFailureAt),
    lastFailureAt: isoOrNull(input.lastFailureAt || input.firstFailureAt),
    reasonCode: bounded(input.reasonCode, 120),
  };
}

function canonicalSchedule(input = {}) {
  return {
    attemptNumber: Number.isSafeInteger(input.attemptNumber) ? input.attemptNumber : 1,
    nextEligibleAt: isoOrNull(input.nextEligibleAt),
    deadlineAt: isoOrNull(input.deadlineAt),
    maxAttempts: Number.isSafeInteger(input.maxAttempts) ? input.maxAttempts : null,
    maxWallClockMs: Number.isSafeInteger(input.maxWallClockMs) ? input.maxWallClockMs : null,
  };
}

function canonicalCircuit(input = {}) {
  return {
    state: bounded(input.state || "closed", 40),
    reasonCode: bounded(input.reasonCode, 120),
    openedAt: isoOrNull(input.openedAt),
    nextProbeAt: isoOrNull(input.nextProbeAt),
  };
}

function rejectUnsafeDirectory(dirPath) {
  const stat = lstatSync(dirPath);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) {
    throw new Error("unsafe outage resubmission state directory");
  }
  realpathSync(dirPath);
}

function rejectUnsafeRegularFile(filePath) {
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) {
    throw new Error("unsafe outage resubmission state file");
  }
  realpathSync(filePath);
}

function sanitizeState(value) {
  return sanitizePersistedEvidence(stripOutageRawKeys(value));
}

function stripOutageRawKeys(value) {
  if (Array.isArray(value)) return value.map((item) => stripOutageRawKeys(item));
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (/raw|provider(body|payload|response|request)|body|payload|prompt|secret|token|credential/i.test(key)) continue;
    output[key] = stripOutageRawKeys(child);
  }
  return output;
}

function shaOrNull(value) {
  return isSha(value) ? String(value) : null;
}

function digestOrNull(value) {
  return isDigest(value) ? String(value) : null;
}

function isSha(value) {
  return /^[a-f0-9]{40}$/.test(String(value || ""));
}

function isDigest(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function isoOrNull(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function bounded(value, max) {
  return String(value || "").slice(0, max);
}

function invalid(reason) {
  return { ok: false, reason };
}

function failed(reasonCode, extra = {}) {
  return { ok: false, reasonCode, ...extra };
}
