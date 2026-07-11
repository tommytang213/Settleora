import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { defaultLogsRoot } from "../lib/config.mjs";
import { validateRunId } from "./run-spec.mjs";
import {
  atomicWriteTrustedJson,
  deriveSupervisorPaths,
  ensureTrustedRunPathContext,
  storageKeyPattern,
  runArtifactKinds,
} from "./supervisor-paths.mjs";

export const terminalStates = new Set(["completed", "partial", "blocked", "failed", "cancelled", "stale", "submission_failed"]);

export function unitNameForRunId(runId) {
  validateRunId(runId);
  return `settleora-auto-runner@${runId}.service`;
}

export function statePathForRunId(runId, logsRoot = defaultLogsRoot) {
  return deriveSupervisorPaths({ runId, logsRoot }).artifactPath(runArtifactKinds.state);
}

export function heartbeatPathForRunId(runId, logsRoot = defaultLogsRoot) {
  return deriveSupervisorPaths({ runId, logsRoot }).artifactPath(runArtifactKinds.heartbeat);
}

export function writeSupervisorState(runId, patch, logsRoot = defaultLogsRoot) {
  const context = ensureTrustedRunPathContext({ runId, logsRoot });
  const statePath = context.artifactPath(runArtifactKinds.state);
  const previous = readSupervisorState(runId, logsRoot).state || {};
  const state = sanitizeState({
    ...previous,
    runId,
    unitName: previous.unitName || unitNameForRunId(runId),
    updatedAt: new Date().toISOString(),
    ...patch,
  });
  atomicWriteTrustedJson(context, runArtifactKinds.state, state);
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
    .filter((name) => storageKeyPattern.test(name))
    .map((storageKey) => {
      const statePath = path.join(root, storageKey, "state.json");
      if (!existsSync(statePath)) return null;
      try {
        const state = sanitizeState(JSON.parse(readFileSync(statePath, "utf8")));
        return state?.runId ? { found: true, state } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
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
  return state?.reportPath || state?.runnerSummaryMarkdownPath || state?.runnerSummaryPath || null;
}
