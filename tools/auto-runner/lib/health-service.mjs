import http from "node:http";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { defaultLogsRoot } from "./config.mjs";
import { processAppearsActive } from "./state-store.mjs";
import { validateRunnerRunId, validateSupervisorRunId } from "./run-correlation.mjs";
import { defaultHeartbeatIntervalSeconds, defaultHeartbeatLeaseSeconds, isHeartbeatStale } from "../supervisor/heartbeat.mjs";
import { classifySupervisorLifecycleState, terminalStates } from "../supervisor/supervisor-state.mjs";
import { storageKeyForLogicalId, storageKeyPattern } from "../supervisor/supervisor-paths.mjs";

export const healthSchemaVersion = 1;
export const defaultHealthHost = "127.0.0.1";
export const defaultHealthPort = 8787;
export const healthRoute = "/health/auto-runner";

const maxStateBytes = 256 * 1024;
const maxSummaryBytes = 512 * 1024;
const maxStringLength = 240;
const maxArrayLength = 20;
const activeLifecycleStates = new Set(["controllable", "stopping", "pre_active"]);
const successfulStopReasons = new Set([
  "completed",
  "max-iterations",
  "max_iterations",
  "max-runtime",
  "max_runtime",
  "budget-exhausted",
  "budget_exhausted",
]);

const reasonPriority = Object.freeze([
  "untrusted_state",
  "malformed_state",
  "multiple_active_supervisors",
  "report_mapping_ambiguous",
  "report_mapping_missing",
  "stale_heartbeat",
  "terminal_failed",
  "terminal_blocked",
  "terminal_partial",
  "submission_failed",
  "runner_disappeared",
  "orphaned_lock",
  "cancelled_attention",
  "active_fresh",
  "no_eligible_work",
  "budget_exhausted_success",
  "terminal_success",
  "initializing",
]);

export function evaluateAutoRunnerHealth({
  logsRoot = defaultLogsRoot,
  now = new Date(),
  runnerStatus = null,
} = {}) {
  const problems = [];
  const lock = readRunnerLock(logsRoot, now);
  if (lock.problem) problems.push(lock.problem);

  const selection = selectCurrentSupervisorRun(logsRoot);
  if (selection.problem) problems.push(selection.problem);
  if (selection.activeCount > 1) problems.push(problem("multiple_active_supervisors"));

  if (!selection.run) {
    const response = buildResponse({
      status: problems.length ? "unhealthy" : "healthy",
      mode: problems.length ? "failed" : "initializing",
      reasonCode: chooseReason(problems, "initializing"),
      supervisor: null,
      runner: buildRunnerSection({ lock, runnerStatus }),
      heartbeat: baseHeartbeatSection(),
      reportResolution: null,
      summary: null,
    });
    return { httpStatus: response.status === "healthy" ? 200 : 503, body: response };
  }

  const state = selection.run.state;
  const lifecycle = classifySupervisorLifecycleState(state.state);
  const heartbeat = readTrustedJsonFile(selection.run.heartbeatPath, { maxBytes: maxStateBytes, required: lifecycle !== "terminal" });
  if (heartbeat.problem) problems.push(heartbeat.problem);
  const heartbeatValue = heartbeat.value || null;
  const heartbeatStale = heartbeatValue ? isHeartbeatStale(heartbeatValue, now) : false;
  if (heartbeatStale && lifecycle !== "terminal") problems.push(problem("stale_heartbeat"));

  const reportResolution = sanitizeReportResolution(state.reportResolution || heartbeatValue?.reportResolution || null);
  if (requiresReportMapping(state)) {
    if (reportResolution?.status === "multiple_matches") problems.push(problem("report_mapping_ambiguous"));
    else if (reportResolution?.status !== "matched") problems.push(problem("report_mapping_missing"));
  }

  const activeRunner = runnerStatus || readRunnerActivity(logsRoot);
  if (activeLifecycleStates.has(lifecycle) && lifecycle !== "pre_active") {
    const expectedRunnerRunId = state.runnerRunId || heartbeatValue?.runnerRunId || null;
    const hasActiveRunner = Boolean(activeRunner.active);
    const activeMatches =
      hasActiveRunner &&
      (!expectedRunnerRunId || activeRunner.activeRunId === expectedRunnerRunId) &&
      (!activeRunner.supervisorRunId || activeRunner.supervisorRunId === state.runId);
    if (!activeMatches) problems.push(problem("runner_disappeared"));
  }

  if (lock.exists && !lock.active && lifecycle !== "controllable" && lock.orphaned) {
    problems.push(problem("orphaned_lock"));
  }

  const terminalProblem = terminalReasonProblem(state.state);
  if (terminalProblem) problems.push(problem(terminalProblem));

  const summary = readTrustedSummary(logsRoot, reportResolution, state);
  if (summary.problem) problems.push(summary.problem);

  const successReason = successReasonCode(state, summary.value);
  const reasonCode = chooseReason(problems, successReason);
  const mode = modeForReason(reasonCode, lifecycle);
  const status = unhealthyReasons.has(reasonCode) ? "unhealthy" : "healthy";

  const response = buildResponse({
    status,
    mode,
    reasonCode,
    supervisor: buildSupervisorSection(state),
    runner: buildRunnerSection({ lock, runnerStatus: activeRunner, runnerRunId: state.runnerRunId || heartbeatValue?.runnerRunId || null }),
    heartbeat: buildHeartbeatSection(heartbeatValue, now),
    reportResolution,
    summary: buildSummarySection(summary.value),
  });
  return { httpStatus: status === "healthy" ? 200 : 503, body: response };
}

const unhealthyReasons = new Set([
  "untrusted_state",
  "malformed_state",
  "multiple_active_supervisors",
  "report_mapping_ambiguous",
  "report_mapping_missing",
  "stale_heartbeat",
  "terminal_failed",
  "terminal_blocked",
  "terminal_partial",
  "submission_failed",
  "runner_disappeared",
  "orphaned_lock",
]);

function selectCurrentSupervisorRun(logsRoot) {
  const runsRoot = path.join(logsRoot, "supervisor", "runs");
  if (!existsSync(runsRoot)) return { run: null, activeCount: 0, problem: null };
  const rootTrust = trustedDirectory(runsRoot);
  if (!rootTrust.ok) return { run: null, activeCount: 0, problem: problem(rootTrust.reason) };

  const runs = [];
  for (const storageKey of readdirSync(rootTrust.realPath).filter((name) => storageKeyPattern.test(name)).sort()) {
    const runDir = path.join(rootTrust.realPath, storageKey);
    const runDirTrust = trustedDirectory(runDir);
    if (!runDirTrust.ok) return { run: null, activeCount: 0, problem: problem(runDirTrust.reason) };
    const statePath = path.join(runDirTrust.realPath, "state.json");
    if (!existsSync(statePath)) continue;
    const stateRead = readTrustedJsonFile(statePath, { maxBytes: maxStateBytes, required: true });
    if (stateRead.problem) return { run: null, activeCount: 0, problem: stateRead.problem };
    const state = stateRead.value;
    const normalized = normalizeSupervisorState(state);
    if (!normalized.ok) return { run: null, activeCount: 0, problem: problem(normalized.reason) };
    if (storageKeyForLogicalId(normalized.state.runId) !== storageKey) {
      return { run: null, activeCount: 0, problem: problem("untrusted_state") };
    }
    runs.push({
      state: normalized.state,
      statePath,
      heartbeatPath: path.join(runDirTrust.realPath, "heartbeat.json"),
      lifecycle: classifySupervisorLifecycleState(normalized.state.state),
    });
  }
  const active = runs.filter((run) => activeLifecycleStates.has(run.lifecycle));
  if (active.length === 1) return { run: active[0], activeCount: 1, problem: null };
  const terminal = runs
    .filter((run) => run.lifecycle === "terminal")
    .sort((a, b) => Date.parse(b.state.finishedAt || b.state.updatedAt || b.state.createdAt || 0) - Date.parse(a.state.finishedAt || a.state.updatedAt || a.state.createdAt || 0));
  return { run: terminal[0] || null, activeCount: active.length, problem: null };
}

function normalizeSupervisorState(state) {
  try {
    if (!state || typeof state !== "object" || Array.isArray(state)) return { ok: false, reason: "malformed_state" };
    const runId = validateSupervisorRunId(state.runId);
    if (typeof state.state !== "string") return { ok: false, reason: "malformed_state" };
    if (state.runnerRunId !== null && state.runnerRunId !== undefined) validateRunnerRunId(state.runnerRunId);
    return { ok: true, state: { ...state, runId } };
  } catch {
    return { ok: false, reason: "malformed_state" };
  }
}

function readTrustedJsonFile(filePath, { maxBytes, required }) {
  if (!existsSync(filePath)) return { value: null, problem: required ? problem("malformed_state") : null };
  const trust = trustedRegularFile(filePath, { maxBytes });
  if (!trust.ok) return { value: null, problem: problem(trust.reason) };
  try {
    return { value: JSON.parse(readFileSync(trust.realPath, "utf8")), problem: null };
  } catch {
    return { value: null, problem: problem("malformed_state") };
  }
}

function readTrustedSummary(logsRoot, reportResolution, state) {
  if (reportResolution?.status !== "matched") return { value: null, problem: null };
  const runnerRunId = reportResolution.runnerRunId || state.runnerRunId;
  if (!runnerRunId) return { value: null, problem: null };
  try {
    validateRunnerRunId(runnerRunId);
  } catch {
    return { value: null, problem: problem("malformed_state") };
  }
  const summaryPath = path.join(logsRoot, "summaries", `${runnerRunId}.json`);
  const read = readTrustedJsonFile(summaryPath, { maxBytes: maxSummaryBytes, required: true });
  if (read.problem) return read;
  if (read.value?.runId !== runnerRunId || read.value?.supervisorRunId !== state.runId) {
    return { value: null, problem: problem("malformed_state") };
  }
  return read;
}

function requiresReportMapping(state) {
  if (!state || state.state !== "completed") return false;
  return true;
}

function terminalReasonProblem(state) {
  if (!terminalStates.has(state)) return null;
  if (state === "failed") return "terminal_failed";
  if (state === "submission_failed") return "submission_failed";
  if (state === "blocked") return "terminal_blocked";
  if (state === "partial") return "terminal_partial";
  return null;
}

function successReasonCode(state, summary) {
  if (!state) return "initializing";
  if (state.state === "cancelled") return "cancelled_attention";
  const lifecycle = classifySupervisorLifecycleState(state.state);
  if (activeLifecycleStates.has(lifecycle)) return "active_fresh";
  const stopReason = normalizeToken(summary?.stopReason || state.stopReason || state.terminalReason);
  const outcomes = Array.isArray(summary?.iterations) ? summary.iterations.map((it) => normalizeToken(it?.outcome)) : [];
  if (stopReason === "no-eligible-work" || outcomes.includes("no-eligible-work") || outcomes.includes("no_eligible_work")) return "no_eligible_work";
  if (successfulStopReasons.has(stopReason)) {
    if (/budget|max/.test(stopReason)) return "budget_exhausted_success";
    return "terminal_success";
  }
  if (state.state === "completed") return "terminal_success";
  return "initializing";
}

function chooseReason(problems, fallback) {
  const codes = new Set(problems.map((item) => item.reasonCode));
  for (const reason of reasonPriority) {
    if (codes.has(reason)) return reason;
  }
  return fallback || "initializing";
}

function modeForReason(reasonCode, lifecycle) {
  if (reasonCode === "initializing") return "initializing";
  if (reasonCode === "active_fresh") return "active";
  if (reasonCode === "cancelled_attention") return "attention";
  if (unhealthyReasons.has(reasonCode)) return "failed";
  if (lifecycle === "terminal") return "idle";
  return "idle";
}

function readRunnerActivity(logsRoot) {
  const activePath = path.join(logsRoot, "state", "active-run.json");
  const active = readTrustedJsonFile(activePath, { maxBytes: maxStateBytes, required: false });
  const parsed = active.value || {};
  const processActive = processAppearsActive(parsed.pid) === true;
  return {
    active: processActive,
    activeRunId: processActive && typeof parsed.runId === "string" ? parsed.runId : null,
    supervisorRunId: processActive && typeof parsed.supervisorRunId === "string" ? parsed.supervisorRunId : null,
  };
}

function readRunnerLock(logsRoot, now) {
  const lockPath = path.join(logsRoot, "locks", "settleora-auto-runner.lock");
  if (!existsSync(lockPath)) return { exists: false, active: false, orphaned: false, problem: null };
  const read = readTrustedJsonFile(lockPath, { maxBytes: maxStateBytes, required: true });
  if (read.problem) return { exists: true, active: false, orphaned: true, problem: problem("orphaned_lock") };
  const parsed = read.value || {};
  const active = processAppearsActive(parsed.pid) === true;
  const startedAt = Date.parse(parsed.startedAt || 0);
  const ageSeconds = Number.isFinite(startedAt) ? Math.max(0, Math.floor((now.getTime() - startedAt) / 1000)) : null;
  return {
    exists: true,
    active,
    orphaned: !active && (ageSeconds === null || ageSeconds > defaultHeartbeatLeaseSeconds),
    ageSeconds,
    problem: null,
  };
}

function trustedDirectory(dirPath) {
  try {
    const stat = lstatSync(dirPath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return { ok: false, reason: "untrusted_state" };
    if ((stat.mode & 0o022) !== 0) return { ok: false, reason: "untrusted_state" };
    return { ok: true, realPath: realpathSync(dirPath) };
  } catch {
    return { ok: false, reason: "untrusted_state" };
  }
}

function trustedRegularFile(filePath, { maxBytes }) {
  try {
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false, reason: "untrusted_state" };
    if ((stat.mode & 0o022) !== 0) return { ok: false, reason: "untrusted_state" };
    if (stat.size > maxBytes) return { ok: false, reason: "malformed_state" };
    const realPath = realpathSync(filePath);
    if (!isContained(realpathSync(path.dirname(filePath)), realPath)) return { ok: false, reason: "untrusted_state" };
    return { ok: true, realPath };
  } catch {
    return { ok: false, reason: "untrusted_state" };
  }
}

function sanitizeReportResolution(value) {
  if (!value || typeof value !== "object") return null;
  return {
    status: boundedString(value.status) || null,
    runnerRunId: boundedString(value.runnerRunId) || null,
  };
}

function buildResponse({ status, mode, reasonCode, supervisor, runner, heartbeat, reportResolution, summary }) {
  return boundObject({
    schemaVersion: healthSchemaVersion,
    status,
    mode,
    reasonCode,
    supervisor,
    runner,
    heartbeat,
    reportResolution,
    summary,
  });
}

function buildSupervisorSection(state) {
  if (!state) return { latestRunId: null, currentRunId: null, state: null };
  return {
    latestRunId: boundedString(state.runId),
    currentRunId: activeLifecycleStates.has(classifySupervisorLifecycleState(state.state)) ? boundedString(state.runId) : null,
    state: boundedString(state.state),
    terminalOutcome: terminalStates.has(state.state) ? boundedString(state.state) : null,
    terminalReason: boundedString(state.terminalReason || state.stopReason || null),
    startedAt: isoOrNull(state.startedAt || state.createdAt || null),
    finishedAt: isoOrNull(state.finishedAt || null),
  };
}

function buildRunnerSection({ lock, runnerStatus, runnerRunId = null }) {
  return {
    latestRunId: boundedString(runnerRunId || runnerStatus?.activeRunId || null),
    active: Boolean(runnerStatus?.active || lock.active),
    lockPresent: Boolean(lock.exists),
    lockOrphaned: Boolean(lock.orphaned),
    orphanClassification: lock.exists ? (lock.active ? "active" : lock.orphaned ? "orphaned_after_grace" : "stale_within_grace") : "none",
  };
}

function baseHeartbeatSection() {
  return {
    lastAt: null,
    ageSeconds: null,
    heartbeatIntervalSeconds: defaultHeartbeatIntervalSeconds,
    heartbeatLeaseSeconds: defaultHeartbeatLeaseSeconds,
  };
}

function buildHeartbeatSection(heartbeat, now) {
  const lastAt = isoOrNull(heartbeat?.updatedAt || null);
  return {
    lastAt,
    ageSeconds: lastAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(lastAt)) / 1000)) : null,
    heartbeatIntervalSeconds: Number.isSafeInteger(heartbeat?.heartbeatIntervalSeconds)
      ? heartbeat.heartbeatIntervalSeconds
      : defaultHeartbeatIntervalSeconds,
    heartbeatLeaseSeconds: Number.isSafeInteger(heartbeat?.heartbeatLeaseSeconds)
      ? heartbeat.heartbeatLeaseSeconds
      : defaultHeartbeatLeaseSeconds,
    leaseExpiresAt: isoOrNull(heartbeat?.leaseExpiresAt || null),
  };
}

function buildSummarySection(summary) {
  if (!summary || typeof summary !== "object") return null;
  const iterations = Array.isArray(summary.iterations) ? summary.iterations : [];
  const counts = summary.outcomeCounts || {};
  return {
    tasksProcessed: safeCount(summary.processedIssueCount ?? counts.processed ?? iterations.length),
    prsOpened: safeCount(summary.prsOpened ?? counts.prsOpened ?? iterations.filter((it) => it?.pr).length),
    prsMerged: safeCount(summary.prsMerged ?? counts.merged ?? iterations.filter((it) => it?.autoMerge?.mergeSha).length),
    failedCount: safeCount(summary.failedOrBlockedIterations ?? counts.failed ?? iterations.filter((it) => /failed/.test(String(it?.outcome || ""))).length),
    blockedCount: safeCount(counts.blocked ?? iterations.filter((it) => /blocked|danger/.test(String(it?.outcome || ""))).length),
    latestMainSha: shaOrNull(summary.latestMainSha || summary.baseOriginMainSha || null),
    startedAt: isoOrNull(summary.startedAt || null),
    finishedAt: isoOrNull(summary.finishedAt || null),
  };
}

export function createAutoRunnerHealthServer(options = {}) {
  const server = http.createServer((request, response) => {
    handleHealthRequest(request, response, options);
  });
  return server;
}

export function handleHealthRequest(request, response, options = {}) {
  const { method, url } = request;
  const parsed = new URL(url || "/", "http://127.0.0.1");
  if (parsed.pathname !== healthRoute) {
    return writeJson(response, 404, { schemaVersion: healthSchemaVersion, status: "unhealthy", reasonCode: "not_found" });
  }
  if (method !== "GET") {
    response.setHeader("Allow", "GET");
    return writeJson(response, 405, { schemaVersion: healthSchemaVersion, status: "unhealthy", reasonCode: "method_not_allowed" });
  }
  const auth = validateRequestSecret(request, options);
  if (!auth.ok) return writeJson(response, 401, { schemaVersion: healthSchemaVersion, status: "unhealthy", reasonCode: "unauthorized" });
  try {
    const result = evaluateAutoRunnerHealth(options);
    return writeJson(response, result.httpStatus, result.body);
  } catch {
    return writeJson(response, 503, {
      schemaVersion: healthSchemaVersion,
      status: "unhealthy",
      mode: "failed",
      reasonCode: "malformed_state",
    });
  }
}

export function validateHealthServiceConfig({
  host = process.env.SETTLEORA_AUTO_RUNNER_HEALTH_HOST || defaultHealthHost,
  port = process.env.SETTLEORA_AUTO_RUNNER_HEALTH_PORT || defaultHealthPort,
  allowNonLoopback = process.env.SETTLEORA_AUTO_RUNNER_HEALTH_ALLOW_NON_LOOPBACK === "true",
  secretFile = process.env.SETTLEORA_AUTO_RUNNER_HEALTH_SECRET_FILE || null,
  logsRoot = defaultLogsRoot,
} = {}) {
  const normalizedHost = String(host || "").trim();
  if (!isLoopbackHost(normalizedHost) && !allowNonLoopback) {
    throw new Error("Health service host must be loopback unless explicit deployment config allows non-loopback");
  }
  if (!isLoopbackHost(normalizedHost) && !secretFile) {
    throw new Error("Non-loopback health service binding requires an external request-secret file");
  }
  const normalizedPort = Number(port);
  if (!Number.isSafeInteger(normalizedPort) || normalizedPort < 0 || normalizedPort > 65535) {
    throw new Error("Health service port must be 0..65535");
  }
  return { host: normalizedHost, port: normalizedPort, logsRoot, requestSecret: secretFile ? readRequestSecret(secretFile, logsRoot) : null };
}

function validateRequestSecret(request, options) {
  if (!options.requestSecret) return { ok: true };
  const supplied = request.headers["x-settleora-health-secret"] || "";
  return { ok: supplied === options.requestSecret };
}

function readRequestSecret(secretFile, logsRoot) {
  const absolute = path.resolve(secretFile);
  const allowedRoot = path.resolve(logsRoot, "secrets");
  const relative = path.relative(allowedRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Health request-secret file must be under the approved logs secrets boundary");
  }
  const trust = trustedRegularFile(absolute, { maxBytes: 4096 });
  if (!trust.ok) throw new Error("Health request-secret file is not trusted");
  const secret = readFileSync(trust.realPath, "utf8").trim();
  if (!/^[A-Za-z0-9._~+/-]{24,256}$/.test(secret)) throw new Error("Health request-secret file has invalid shape");
  return secret;
}

function writeJson(response, statusCode, body) {
  const text = JSON.stringify(boundObject(body));
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(text.length > 8192 ? JSON.stringify({ schemaVersion: healthSchemaVersion, status: "unhealthy", reasonCode: "response_too_large" }) : text);
}

function problem(reasonCode) {
  return { reasonCode };
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}

function boundedString(value) {
  if (typeof value !== "string") return null;
  return value.slice(0, maxStringLength);
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 999999) : 0;
}

function shaOrNull(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value) ? value : null;
}

function isoOrNull(value) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function boundObject(value) {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return boundedString(value);
  if (Array.isArray(value)) return value.slice(0, maxArrayLength).map((item) => boundObject(item));
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [boundedString(key), boundObject(child)]));
}

function isContained(rootRealPath, targetPath) {
  const relative = path.relative(rootRealPath, targetPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}
