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
  status = marker?.status || "planned",
  childSupervisorRunId = marker?.childSupervisorRunId || null,
  reasonCode = marker?.reasonCode || null,
}) {
  const now = new Date().toISOString();
  const mutationMarker = marker || buildOutageResubmissionMarker({
    correlation,
    attemptNumber: schedule?.attemptNumber || outage?.attemptNumber || 1,
    specDigest: correlation?.originalSupervisorSpecDigest,
  });
  const state = sanitizeState({
    stateVersion: outageResubmissionStateVersion,
    correlation: canonicalCorrelation(correlation),
    outage: canonicalOutage(outage),
    schedule: canonicalSchedule(schedule),
    circuit: circuit ? canonicalCircuit(circuit) : null,
    parentResubmissionId: bounded(parentResubmissionId, 120) || null,
    childSupervisorRunId: bounded(childSupervisorRunId, 80) || null,
    mutationMarker: {
      ...mutationMarker,
      status,
      childSupervisorRunId: bounded(childSupervisorRunId, 80) || null,
      reasonCode: bounded(reasonCode, 120) || null,
    },
    attemptHistory: [],
    status,
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
  const context = trustedOutageStatePathContext(config, { create: true });
  const statePath = trustedOutageStateFilePath(context, state);
  rejectUnsafeFinalStateFileIfPresent(context, statePath);
  const root = context.outageRootRealPath;
  const sanitized = sanitizeState({
    ...state,
    timestamps: { ...(state.timestamps || {}), updatedAt: new Date().toISOString() },
  });
  const sanitizedValidation = validateOutageResubmissionState(sanitized);
  if (!sanitizedValidation.ok) throw new Error(`Invalid outage resubmission state: ${sanitizedValidation.reason}`);
  const tmp = path.join(root, `.${path.basename(statePath)}.${process.pid}.${Date.now()}.tmp`);
  assertContainedPath(root, tmp);
  writeFileSync(tmp, `${JSON.stringify(sanitized, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  renameSync(tmp, statePath);
  return { statePath, state: sanitized };
}

export function loadOutageResubmissionState(config, keyOrState) {
  let context;
  let statePath;
  try {
    context = trustedOutageStatePathContext(config, { create: false });
    if (!context.outageRootExists) {
      statePath = outageResubmissionStatePath({ logsRoot: context.logsRootRealPath }, keyOrState);
      return failed("outage_resubmission_state_missing", { statePath });
    }
    statePath = trustedOutageStateFilePath(context, keyOrState);
  } catch {
    return failed("outage_resubmission_state_untrusted", { statePath: null });
  }
  if (!existsSync(statePath)) return failed("outage_resubmission_state_missing", { statePath });
  try {
    rejectUnsafeRegularFile(statePath, context.outageRootRealPath);
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    const validation = validateOutageResubmissionState(parsed);
    if (!validation.ok) return failed("outage_resubmission_state_schema_invalid", { statePath, reason: validation.reason });
    return { ok: true, state: parsed, statePath };
  } catch (error) {
    if (/unsafe outage resubmission state file/.test(String(error.message || ""))) {
      return failed("outage_resubmission_state_untrusted", { statePath: null });
    }
    return failed("outage_resubmission_state_corrupt", { statePath, reason: bounded(error.message, 240) });
  }
}

export function readOutageResubmissionInventory(config) {
  const empty = {
    ok: true,
    readStatus: "trusted",
    reasonCode: null,
    operatorActionRequired: false,
    totalRecordCount: 0,
    validCount: 0,
    invalidCount: 0,
    records: [],
    validStates: [],
    invalidRecords: [],
  };
  let context;
  try {
    context = trustedOutageStatePathContext(config, { create: false });
  } catch {
    return {
      ...empty,
      ok: false,
      readStatus: "untrusted",
      reasonCode: "untrusted_state",
      operatorActionRequired: true,
    };
  }
  if (!context.outageRootExists) return empty;
  const root = context.outageRootRealPath;
  const records = [];
  for (const name of readdirSync(root).filter((entry) => /^[a-f0-9]{64}\.json$/.test(entry)).sort()) {
    const key = name.slice(0, -5);
    const loaded = loadOutageResubmissionState(config, key);
    if (loaded.ok) {
      records.push({ ok: true, key, status: "valid", state: loaded.state });
    } else {
      records.push({
        ok: false,
        key,
        status: reasonStatus(loaded.reasonCode),
        reasonCode: inventoryReasonCode(loaded.reasonCode),
      });
    }
  }
  const invalidRecords = records.filter((record) => !record.ok);
  const validStates = records.filter((record) => record.ok).map((record) => record.state);
  const reasonCode = invalidRecords.find((record) => record.reasonCode === "untrusted_state") ? "untrusted_state" : invalidRecords.length ? "malformed_state" : null;
  return {
    ok: invalidRecords.length === 0,
    readStatus: invalidRecords.length === 0 ? "trusted" : reasonCode,
    reasonCode,
    operatorActionRequired: invalidRecords.length > 0,
    totalRecordCount: records.length,
    validCount: validStates.length,
    invalidCount: invalidRecords.length,
    records,
    validStates,
    invalidRecords,
  };
}

export function listOutageResubmissionStates(config) {
  const inventory = readOutageResubmissionInventory(config);
  if (!inventory.ok) return [];
  return inventory.validStates
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
    childSupervisorRunId: null,
    reasonCode: null,
  };
}

export function transitionOutageMarker(state, {
  status,
  childSupervisorRunId = state.childSupervisorRunId || null,
  reasonCode = null,
  specDigest = state.mutationMarker?.specDigest || null,
} = {}) {
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
      specDigest: digestOrNull(specDigest),
      updatedAt: new Date().toISOString(),
    },
  });
  const validation = validateOutageResubmissionState(next);
  if (!validation.ok) throw new Error(`Invalid outage resubmission state: ${validation.reason}`);
  return next;
}

export function rebuildExhaustedOutageState(state, {
  correlation,
  outage,
  schedule,
  circuit = state.circuit || null,
  attemptNumber,
  reasonCode,
  specDigest = correlation?.originalSupervisorSpecDigest,
} = {}) {
  const canonicalNextCorrelation = canonicalCorrelation(correlation || state.correlation);
  const canonicalNextOutage = canonicalOutage(outage || state.outage);
  const canonicalNextSchedule = canonicalSchedule(schedule || state.schedule);
  const attempt = Number.isSafeInteger(attemptNumber) ? attemptNumber : canonicalNextSchedule.attemptNumber;
  const marker = buildOutageResubmissionMarker({
    correlation: canonicalNextCorrelation,
    attemptNumber: attempt,
    specDigest,
  });
  const next = sanitizeState({
    ...state,
    correlation: canonicalNextCorrelation,
    outage: canonicalNextOutage,
    schedule: {
      ...canonicalNextSchedule,
      attemptNumber: attempt,
    },
    circuit: circuit ? canonicalCircuit(circuit) : null,
    childSupervisorRunId: null,
    mutationMarker: {
      ...marker,
      status: "exhausted",
      reasonCode: bounded(reasonCode, 120) || null,
    },
    status: "exhausted",
    timestamps: {
      ...(state.timestamps || {}),
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
  if ("providerDomain" in expected && !("outageProviderDomain" in expected)) {
    return { ok: false, reasonCode: "outage_resubmission_identity_drift", field: "outageProviderDomain" };
  }
  const requestPrPair = validateExpectedPrIdentity(expected);
  if (!requestPrPair.ok) {
    return { ok: false, reasonCode: requestPrPair.reasonCode, field: requestPrPair.field };
  }
  const actualPrPairPresent = actual.prNumber !== null && actual.prHeadSha !== null;
  if (actualPrPairPresent && !requestPrPair.supplied) {
    return { ok: false, reasonCode: "outage_resubmission_pr_identity_required", field: "prNumber" };
  }
  if (!actualPrPairPresent && requestPrPair.supplied) {
    return { ok: false, reasonCode: "outage_resubmission_pr_identity_presence_mismatch", field: "prNumber" };
  }
  for (const field of [
    "taskKey",
    "runnerRunId",
    "supervisorRunId",
    "issueNumber",
    "branchName",
    "baseSha",
    "currentHeadSha",
    "runnerProfile",
    "runnerConfigDigest",
    "originalSupervisorSpecDigest",
    "outageProviderDomain",
    "outageFingerprint",
  ]) {
    if (field in expected && expected[field] !== actual[field]) {
      return { ok: false, reasonCode: "outage_resubmission_identity_drift", field };
    }
  }
  if (requestPrPair.supplied) {
    if (expected.prNumber !== actual.prNumber) {
      return { ok: false, reasonCode: "outage_resubmission_pr_identity_mismatch", field: "prNumber" };
    }
    if (expected.prHeadSha !== actual.prHeadSha) {
      return { ok: false, reasonCode: "outage_resubmission_pr_identity_mismatch", field: "prHeadSha" };
    }
  }
  if ("outageProviderDomain" in expected && expected.outageProviderDomain !== state?.outage?.providerDomain) {
    return { ok: false, reasonCode: "outage_resubmission_identity_drift", field: "outageProviderDomain" };
  }
  if ("outageFingerprint" in expected && expected.outageFingerprint !== state?.outage?.outageFingerprint) {
    return { ok: false, reasonCode: "outage_resubmission_identity_drift", field: "outageFingerprint" };
  }
  if ("outageClass" in expected && expected.outageClass !== state?.outage?.outageClass) {
    return { ok: false, reasonCode: "outage_resubmission_identity_drift", field: "outageClass" };
  }
  return { ok: true, reasonCode: "outage_resubmission_identity_match" };
}

export function validateOutageResubmissionState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return invalid("state must be an object");
  const rootFields = rejectUnknownFields(state, "state", [
    "stateVersion",
    "correlation",
    "outage",
    "schedule",
    "circuit",
    "parentResubmissionId",
    "childSupervisorRunId",
    "mutationMarker",
    "attemptHistory",
    "status",
    "timestamps",
  ]);
  if (!rootFields.ok) return rootFields;
  if (state.stateVersion !== outageResubmissionStateVersion) return invalid("unsupported outage resubmission state version");
  const correlation = validateCorrelation(state.correlation);
  if (!correlation.ok) return correlation;
  const outage = validateOutage(state.outage);
  if (!outage.ok) return outage;
  const schedule = validateSchedule(state.schedule);
  if (!schedule.ok) return schedule;
  const circuit = validateCircuit(state.circuit);
  if (!circuit.ok) return circuit;
  if (state.parentResubmissionId !== null && !isBoundedSafeText(state.parentResubmissionId, 1, 120)) return invalid("invalid parentResubmissionId");
  if (state.childSupervisorRunId !== null && !isSupervisorRunId(state.childSupervisorRunId)) return invalid("invalid childSupervisorRunId");
  if (!outageMarkerStatuses.includes(state.status)) return invalid("invalid status");
  const marker = validateMutationMarker(state.mutationMarker);
  if (!marker.ok) return marker;
  if (state.mutationMarker.status !== state.status) return invalid("mutation marker status mismatch");
  if (state.mutationMarker.attemptNumber !== state.schedule.attemptNumber) return invalid("mutation marker attempt mismatch");
  if (state.schedule.attemptNumber > state.schedule.maxAttempts && state.status !== "exhausted") return invalid("attemptNumber exceeds maxAttempts");
  if ((state.correlation.outageProviderDomain || null) !== state.outage.providerDomain) return invalid("outage provider mismatch");
  if (state.correlation.outageFingerprint !== state.outage.outageFingerprint) return invalid("outage fingerprint mismatch");
  if (state.mutationMarker.childSupervisorRunId !== null && state.childSupervisorRunId !== state.mutationMarker.childSupervisorRunId) {
    return invalid("child supervisor run id mismatch");
  }
  if (["submission_uncertain", "submitted", "confirmed_running"].includes(state.status)) {
    if (!state.childSupervisorRunId) return invalid(`${state.status} requires child supervisor run id`);
    if (!isDigest(state.mutationMarker.specDigest)) return invalid(`${state.status} requires child spec digest`);
  }
  if (["recovered", "exhausted", "blocked"].includes(state.status)) {
    if (!state.mutationMarker.reasonCode || !isBoundedSafeText(state.mutationMarker.reasonCode, 1, 120)) return invalid("terminal status requires bounded reason evidence");
  }
  if (state.status === "planned" && state.childSupervisorRunId !== null && state.mutationMarker.reasonCode !== "dry_run_planned") {
    return invalid("planned child identity requires dry-run planning reason");
  }
  if (!Array.isArray(state.attemptHistory) || state.attemptHistory.length > 50) return invalid("invalid attempt history");
  for (const entry of state.attemptHistory) {
    const attempt = validateAttemptHistoryEntry(entry);
    if (!attempt.ok) return attempt;
  }
  const timestamps = validateTimestamps(state.timestamps);
  if (!timestamps.ok) return timestamps;
  return { ok: true };
}

function validateCorrelation(correlation) {
  if (!isPlainObject(correlation)) return invalid("missing correlation");
  const fields = rejectUnknownFields(correlation, "correlation", [
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
    "outageProviderDomain",
    "outageFingerprint",
  ]);
  if (!fields.ok) return fields;
  if (!isTaskKey(correlation.taskKey)) return invalid("invalid taskKey");
  if (!isRunnerRunId(correlation.runnerRunId)) return invalid("invalid runnerRunId");
  if (!isSupervisorRunId(correlation.supervisorRunId)) return invalid("invalid supervisorRunId");
  if (!Number.isSafeInteger(correlation.issueNumber) || correlation.issueNumber < 1 || correlation.issueNumber > 9999999) return invalid("invalid issue number");
  if (!isBranchName(correlation.branchName)) return invalid("invalid branchName");
  if (!isSha(correlation.baseSha)) return invalid("invalid baseSha");
  if (!isSha(correlation.currentHeadSha)) return invalid("invalid currentHeadSha");
  if ((correlation.prNumber === null) !== (correlation.prHeadSha === null)) return invalid("prNumber and prHeadSha must be paired");
  if (correlation.prNumber !== null && (!Number.isSafeInteger(correlation.prNumber) || correlation.prNumber < 1 || correlation.prNumber > 9999999)) return invalid("invalid prNumber");
  if (correlation.prHeadSha !== null && !isSha(correlation.prHeadSha)) return invalid("invalid prHeadSha");
  if (!isProfileName(correlation.runnerProfile)) return invalid("invalid runnerProfile");
  if (!isDigest(correlation.runnerConfigDigest)) return invalid("invalid runnerConfigDigest");
  if (!isDigest(correlation.originalSupervisorSpecDigest)) return invalid("invalid originalSupervisorSpecDigest");
  if (!isBoundedSafeText(correlation.outageProviderDomain, 1, 80)) return invalid("invalid outageProviderDomain");
  if (!isDigest(correlation.outageFingerprint)) return invalid("invalid outageFingerprint");
  return { ok: true };
}

function validateOutage(outage) {
  if (!isPlainObject(outage)) return invalid("missing outage");
  const fields = rejectUnknownFields(outage, "outage", [
    "providerDomain",
    "outageClass",
    "outageFingerprint",
    "firstFailureAt",
    "lastFailureAt",
    "reasonCode",
  ]);
  if (!fields.ok) return fields;
  if (!isBoundedSafeText(outage.providerDomain, 1, 80)) return invalid("invalid outage providerDomain");
  if (!isBoundedSafeText(outage.outageClass, 1, 120)) return invalid("invalid outageClass");
  if (!isDigest(outage.outageFingerprint)) return invalid("invalid outage outageFingerprint");
  if (!isIsoTimestamp(outage.firstFailureAt) || !isIsoTimestamp(outage.lastFailureAt)) return invalid("invalid outage timestamps");
  if (Date.parse(outage.lastFailureAt) < Date.parse(outage.firstFailureAt)) return invalid("outage timestamp order invalid");
  if (!isBoundedSafeText(outage.reasonCode, 1, 120)) return invalid("invalid outage reasonCode");
  return { ok: true };
}

function validateSchedule(schedule) {
  if (!isPlainObject(schedule)) return invalid("missing schedule");
  const fields = rejectUnknownFields(schedule, "schedule", [
    "attemptNumber",
    "nextEligibleAt",
    "deadlineAt",
    "maxAttempts",
    "maxWallClockMs",
  ]);
  if (!fields.ok) return fields;
  if (!Number.isSafeInteger(schedule.attemptNumber) || schedule.attemptNumber < 1 || schedule.attemptNumber > 20) return invalid("invalid attemptNumber");
  if (!isIsoTimestamp(schedule.nextEligibleAt) || !isIsoTimestamp(schedule.deadlineAt)) return invalid("invalid schedule timestamps");
  if (Date.parse(schedule.deadlineAt) < Date.parse(schedule.nextEligibleAt)) return invalid("schedule deadline before next eligible");
  if (!Number.isSafeInteger(schedule.maxAttempts) || schedule.maxAttempts < 1 || schedule.maxAttempts > 20) return invalid("invalid maxAttempts");
  if (!Number.isSafeInteger(schedule.maxWallClockMs) || schedule.maxWallClockMs < 60 * 1000 || schedule.maxWallClockMs > 30 * 24 * 60 * 60 * 1000) {
    return invalid("invalid maxWallClockMs");
  }
  return { ok: true };
}

function validateCircuit(circuit) {
  if (circuit === null) return { ok: true };
  if (!isPlainObject(circuit)) return invalid("invalid circuit");
  const fields = rejectUnknownFields(circuit, "circuit", ["state", "reasonCode", "openedAt", "nextProbeAt"]);
  if (!fields.ok) return fields;
  if (!["closed", "open", "half_open"].includes(circuit.state)) return invalid("invalid circuit state");
  if (circuit.reasonCode !== null && !isBoundedSafeText(circuit.reasonCode, 1, 120)) return invalid("invalid circuit reasonCode");
  if (circuit.openedAt !== null && !isIsoTimestamp(circuit.openedAt)) return invalid("invalid circuit openedAt");
  if (circuit.nextProbeAt !== null && !isIsoTimestamp(circuit.nextProbeAt)) return invalid("invalid circuit nextProbeAt");
  return { ok: true };
}

function validateMutationMarker(marker) {
  if (!isPlainObject(marker)) return invalid("invalid mutation marker");
  const fields = rejectUnknownFields(marker, "mutationMarker", [
    "kind",
    "key",
    "status",
    "attemptNumber",
    "specDigest",
    "updatedAt",
    "childSupervisorRunId",
    "reasonCode",
  ]);
  if (!fields.ok) return fields;
  if (marker.kind !== "outage_resubmission") return invalid("invalid mutation marker kind");
  if (!isDigest(marker.key)) return invalid("invalid mutation marker key");
  if (!outageMarkerStatuses.includes(marker.status)) return invalid("invalid mutation marker status");
  if (!Number.isSafeInteger(marker.attemptNumber) || marker.attemptNumber < 1 || marker.attemptNumber > 20) return invalid("invalid mutation marker attemptNumber");
  if (!isDigest(marker.specDigest)) return invalid("invalid mutation marker specDigest");
  if (!isIsoTimestamp(marker.updatedAt)) return invalid("invalid mutation marker updatedAt");
  if (marker.childSupervisorRunId !== null && !isSupervisorRunId(marker.childSupervisorRunId)) return invalid("invalid mutation marker childSupervisorRunId");
  if (marker.reasonCode !== null && !isBoundedSafeText(marker.reasonCode, 1, 120)) return invalid("invalid mutation marker reasonCode");
  return { ok: true };
}

function validateAttemptHistoryEntry(entry) {
  if (!isPlainObject(entry)) return invalid("invalid attempt history entry");
  const fields = rejectUnknownFields(entry, "attemptHistory", ["at", "status", "attemptNumber", "childSupervisorRunId", "reasonCode"]);
  if (!fields.ok) return fields;
  if (!isIsoTimestamp(entry.at)) return invalid("invalid attempt history timestamp");
  if (!outageMarkerStatuses.includes(entry.status)) return invalid("invalid attempt history status");
  if (!Number.isSafeInteger(entry.attemptNumber) || entry.attemptNumber < 1 || entry.attemptNumber > 20) return invalid("invalid attempt history attemptNumber");
  if (entry.childSupervisorRunId !== null && !isSupervisorRunId(entry.childSupervisorRunId)) return invalid("invalid attempt history childSupervisorRunId");
  if (entry.reasonCode !== null && !isBoundedSafeText(entry.reasonCode, 1, 120)) return invalid("invalid attempt history reasonCode");
  return { ok: true };
}

function validateTimestamps(timestamps) {
  if (!isPlainObject(timestamps)) return invalid("invalid timestamps");
  const fields = rejectUnknownFields(timestamps, "timestamps", ["createdAt", "updatedAt"]);
  if (!fields.ok) return fields;
  if (!isIsoTimestamp(timestamps.createdAt) || !isIsoTimestamp(timestamps.updatedAt)) return invalid("invalid timestamps");
  if (Date.parse(timestamps.updatedAt) < Date.parse(timestamps.createdAt)) return invalid("timestamp order invalid");
  return { ok: true };
}

function rejectUnknownFields(value, label, allowed) {
  if (!isPlainObject(value)) return invalid(`${label} must be an object`);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) return invalid(`unknown ${label} field: ${key}`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return invalid(`missing ${label} field: ${key}`);
  }
  return { ok: true };
}

function canonicalCorrelation(input = {}) {
  const prIdentity = normalizeAtomicPrIdentity(input);
  return {
    taskKey: bounded(input.taskKey, 80),
    runnerRunId: bounded(input.runnerRunId || input.runId, 80),
    supervisorRunId: bounded(input.supervisorRunId, 80),
    issueNumber: Number.isSafeInteger(input.issueNumber) ? input.issueNumber : null,
    branchName: bounded(input.branchName, 180),
    baseSha: shaOrNull(input.baseSha),
    currentHeadSha: shaOrNull(input.currentHeadSha || input.headSha),
    prNumber: prIdentity.prNumber,
    prHeadSha: prIdentity.prHeadSha,
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

function trustedOutageStatePathContext(config, { create = false } = {}) {
  const logsRoot = path.resolve(String(config?.logsRoot || ""));
  rejectUnsafeDirectory(logsRoot);
  const logsRootRealPath = realpathSync(logsRoot);
  const recoveryPath = path.join(logsRootRealPath, "recovery");
  const recovery = ensureContainedPrivateDirectory(logsRootRealPath, recoveryPath, { create });
  if (!recovery.exists) {
    return {
      logsRootRealPath,
      recoveryRealPath: null,
      outageRootRealPath: null,
      outageRootExists: false,
    };
  }
  const outageRootPath = path.join(recovery.realPath, "outage-resubmission");
  const outageRoot = ensureContainedPrivateDirectory(recovery.realPath, outageRootPath, { create });
  if (!outageRoot.exists) {
    return {
      logsRootRealPath,
      recoveryRealPath: recovery.realPath,
      outageRootRealPath: null,
      outageRootExists: false,
    };
  }
  assertContainedPath(logsRootRealPath, recovery.realPath);
  assertContainedPath(logsRootRealPath, outageRoot.realPath);
  return {
    logsRootRealPath,
    recoveryRealPath: recovery.realPath,
    outageRootRealPath: outageRoot.realPath,
    outageRootExists: true,
  };
}

function ensureContainedPrivateDirectory(rootRealPath, dirPath, { create }) {
  const resolved = path.resolve(dirPath);
  assertContainedPath(rootRealPath, resolved);
  if (!existsSync(resolved)) {
    if (!create) return { exists: false, realPath: null };
    mkdirSync(resolved, { mode: 0o700 });
  }
  rejectUnsafeDirectory(resolved);
  const realPath = realpathSync(resolved);
  assertContainedPath(rootRealPath, realPath);
  return { exists: true, realPath };
}

function trustedOutageStateFilePath(context, keyOrState) {
  const statePath = outageResubmissionStatePath({ logsRoot: context.logsRootRealPath }, keyOrState);
  const resolved = path.resolve(statePath);
  assertContainedPath(context.outageRootRealPath, resolved);
  return resolved;
}

function rejectUnsafeFinalStateFileIfPresent(context, statePath) {
  if (!existsSync(statePath)) return;
  rejectUnsafeRegularFile(statePath, context.outageRootRealPath);
}

function rejectUnsafeDirectory(dirPath) {
  const stat = lstatSync(dirPath);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) {
    throw new Error("unsafe outage resubmission state directory");
  }
  realpathSync(dirPath);
}

function rejectUnsafeRegularFile(filePath, trustedRootRealPath) {
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) {
    throw new Error("unsafe outage resubmission state file");
  }
  const realPath = realpathSync(filePath);
  assertContainedPath(trustedRootRealPath, realPath);
}

function assertContainedPath(rootRealPath, targetPath) {
  if (!rootRealPath) throw new Error("unsafe outage resubmission state directory");
  const root = path.resolve(rootRealPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("unsafe outage resubmission state path");
  }
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

function normalizeAtomicPrIdentity(value = {}) {
  const hasPrNumber = Object.hasOwn(value, "prNumber");
  const hasPrHeadSha = Object.hasOwn(value, "prHeadSha");
  if (!hasPrNumber && !hasPrHeadSha) return { prNumber: null, prHeadSha: null };
  if (hasPrNumber !== hasPrHeadSha) return { prNumber: "__invalid_pr_pair__", prHeadSha: "__invalid_pr_pair__" };
  if (value.prNumber === null && value.prHeadSha === null) return { prNumber: null, prHeadSha: null };
  if (Number.isSafeInteger(value.prNumber) && value.prNumber >= 1 && value.prNumber <= 9999999 && isSha(value.prHeadSha)) {
    return { prNumber: value.prNumber, prHeadSha: value.prHeadSha };
  }
  return { prNumber: "__invalid_pr_pair__", prHeadSha: "__invalid_pr_pair__" };
}

function validateExpectedPrIdentity(expected = {}) {
  const hasPrNumber = Object.hasOwn(expected, "prNumber");
  const hasPrHeadSha = Object.hasOwn(expected, "prHeadSha");
  if (!hasPrNumber && !hasPrHeadSha) return { ok: true, supplied: false };
  if (hasPrNumber !== hasPrHeadSha) {
    return { ok: false, reasonCode: "outage_resubmission_pr_identity_partial", field: hasPrNumber ? "prHeadSha" : "prNumber" };
  }
  if (expected.prNumber === null && expected.prHeadSha === null) {
    return { ok: false, reasonCode: "outage_resubmission_pr_identity_presence_mismatch", field: "prNumber" };
  }
  if (expected.prNumber === null || expected.prHeadSha === null) {
    return {
      ok: false,
      reasonCode: "outage_resubmission_pr_identity_partial",
      field: expected.prNumber === null ? "prNumber" : "prHeadSha",
    };
  }
  if (!Number.isSafeInteger(expected.prNumber) || expected.prNumber < 1 || expected.prNumber > 9999999) {
    return { ok: false, reasonCode: "outage_resubmission_pr_identity_mismatch", field: "prNumber" };
  }
  if (!isSha(expected.prHeadSha)) return { ok: false, reasonCode: "outage_resubmission_pr_identity_mismatch", field: "prHeadSha" };
  return { ok: true, supplied: true };
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

function isIsoTimestamp(value) {
  if (typeof value !== "string" || value.length > 40) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
}

function isTaskKey(value) {
  return /^[A-Za-z0-9._-]{1,80}$/.test(String(value || "")) && !String(value || "").includes("..");
}

function isRunnerRunId(value) {
  return /^run-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$/.test(String(value || ""));
}

function isSupervisorRunId(value) {
  return /^supervised-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(String(value || ""));
}

function isBranchName(value) {
  const branch = String(value || "");
  return /^(feature|focused|feature-bundle|tools)\/[A-Za-z0-9._/-]{1,180}$/.test(branch) && !branch.includes("..");
}

function isProfileName(value) {
  return /^[A-Za-z0-9._-]{1,80}$/.test(String(value || "")) && !String(value || "").includes("..");
}

function isBoundedSafeText(value, min, max) {
  const text = String(value || "");
  return text.length >= min && text.length <= max && /^[A-Za-z0-9._:/@-]+$/.test(text) && !text.includes("..");
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

function inventoryReasonCode(reasonCode) {
  if (/untrusted|unsafe/.test(String(reasonCode || ""))) return "untrusted_state";
  return "malformed_state";
}

function reasonStatus(reasonCode) {
  return inventoryReasonCode(reasonCode) === "untrusted_state" ? "untrusted" : "invalid";
}
