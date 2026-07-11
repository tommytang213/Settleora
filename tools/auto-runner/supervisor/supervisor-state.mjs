import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { defaultLogsRoot } from "../lib/config.mjs";
import { atomicWriteJson, runDirForRunId, validateRunId } from "./run-spec.mjs";

export const terminalStates = new Set(["completed", "partial", "blocked", "failed", "cancelled", "stale", "submission_failed"]);

export function unitNameForRunId(runId) {
  validateRunId(runId);
  return `settleora-auto-runner@${runId}.service`;
}

export function statePathForRunId(runId, logsRoot = defaultLogsRoot) {
  return path.join(runDirForRunId(runId, logsRoot), "state.json");
}

export function heartbeatPathForRunId(runId, logsRoot = defaultLogsRoot) {
  return path.join(runDirForRunId(runId, logsRoot), "heartbeat.json");
}

export function writeSupervisorState(runId, patch, logsRoot = defaultLogsRoot) {
  const statePath = statePathForRunId(runId, logsRoot);
  const previous = readSupervisorState(runId, logsRoot).state || {};
  const state = sanitizeState({
    ...previous,
    runId,
    unitName: previous.unitName || unitNameForRunId(runId),
    updatedAt: new Date().toISOString(),
    ...patch,
  });
  atomicWriteJson(statePath, state);
  return { statePath, state };
}

export function readSupervisorState(runId, logsRoot = defaultLogsRoot) {
  try {
    validateRunId(runId);
    const statePath = statePathForRunId(runId, logsRoot);
    if (!existsSync(statePath)) return { found: false, statePath, state: null };
    return { found: true, statePath, state: sanitizeState(JSON.parse(readFileSync(statePath, "utf8"))) };
  } catch (error) {
    return { found: false, error: error.message, state: null };
  }
}

export function listSupervisorRuns(logsRoot = defaultLogsRoot, limit = 20) {
  const root = path.join(logsRoot, "supervisor", "runs");
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => /^supervised-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(name))
    .map((runId) => readSupervisorState(runId, logsRoot))
    .filter((entry) => entry.found)
    .map((entry) => entry.state)
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0))
    .slice(0, limit);
}

export function latestSupervisorRun(logsRoot = defaultLogsRoot) {
  return listSupervisorRuns(logsRoot, 1)[0] || null;
}

export function sanitizeState(value) {
  return JSON.parse(JSON.stringify(value, (key, val) => {
    if (/url|token|secret|authorization|header|env/i.test(key) && typeof val === "string") return "[redacted]";
    if (typeof val === "string" && val.length > 2048) return `${val.slice(0, 2048)}...[truncated]`;
    return val;
  }));
}

export function reportPathForRun(state) {
  return state?.reportPath || state?.runnerSummaryPath || null;
}
