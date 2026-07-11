import { existsSync, readFileSync } from "node:fs";
import { defaultLogsRoot } from "../lib/config.mjs";
import { heartbeatPathForRunId, terminalStates, unitNameForRunId } from "./supervisor-state.mjs";
import { atomicWriteTrustedJson, ensureTrustedRunPathContext, runArtifactKinds } from "./supervisor-paths.mjs";

export const defaultHeartbeatIntervalSeconds = 60;
export const defaultHeartbeatLeaseSeconds = 5 * 60;

export function buildHeartbeat({
  runId,
  runnerRunId = null,
  state,
  maxTasks,
  maxRuntime,
  counts = {},
  currentIssue = null,
  currentPr = null,
  reportPath = null,
  monitoringDelivery = null,
  now = new Date(),
} = {}) {
  const updatedAt = now.toISOString();
  return {
    runId,
    runnerRunId,
    state,
    unitName: unitNameForRunId(runId),
    updatedAt,
    leaseExpiresAt: new Date(now.getTime() + defaultHeartbeatLeaseSeconds * 1000).toISOString(),
    heartbeatIntervalSeconds: defaultHeartbeatIntervalSeconds,
    heartbeatLeaseSeconds: defaultHeartbeatLeaseSeconds,
    maxTasks,
    maxRuntime,
    counts: {
      completed: counts.completed || 0,
      merged: counts.merged || 0,
      failed: counts.failed || 0,
      blocked: counts.blocked || 0,
      skipped: counts.skipped || 0,
      attempted: counts.attempted || 0,
      processed: counts.processed || 0,
    },
    currentIssue: sanitizePublicRef(currentIssue),
    currentPr: sanitizePublicRef(currentPr),
    terminal: terminalStates.has(state),
    reportPath,
    monitoringDelivery,
  };
}

export function writeHeartbeat(runId, heartbeat, logsRoot = defaultLogsRoot) {
  const context = ensureTrustedRunPathContext({ runId, logsRoot });
  const heartbeatPath = context.artifactPath(runArtifactKinds.heartbeat);
  atomicWriteTrustedJson(context, runArtifactKinds.heartbeat, heartbeat);
  return { heartbeatPath, heartbeat };
}

export function readHeartbeat(runId, logsRoot = defaultLogsRoot) {
  const heartbeatPath = heartbeatPathForRunId(runId, logsRoot);
  if (!existsSync(heartbeatPath)) return { found: false, heartbeatPath, heartbeat: null };
  const heartbeat = JSON.parse(readFileSync(heartbeatPath, "utf8"));
  return { found: true, heartbeatPath, heartbeat, stale: isHeartbeatStale(heartbeat) };
}

export function isHeartbeatStale(heartbeat, now = new Date()) {
  if (!heartbeat || heartbeat.terminal) return false;
  return Date.parse(heartbeat.leaseExpiresAt || 0) < now.getTime();
}

function sanitizePublicRef(value) {
  if (!value) return null;
  return {
    number: Number.isSafeInteger(value.number) ? value.number : null,
    title: typeof value.title === "string" ? value.title.slice(0, 200) : null,
    headSha: typeof value.headSha === "string" && /^[a-f0-9]{40}$/.test(value.headSha) ? value.headSha : null,
  };
}
