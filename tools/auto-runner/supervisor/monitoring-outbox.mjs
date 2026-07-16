import { appendFileSync } from "node:fs";
import { defaultLogsRoot } from "../lib/config.mjs";
import { ensureTrustedRunPathContext, runArtifactKinds } from "./supervisor-paths.mjs";

export const monitoringEvents = new Set([
  "submitted",
  "started",
  "heartbeat",
  "completed",
  "partial",
  "blocked",
  "failed",
  "cancelled",
  "prolonged_outage_detected",
  "outage_resubmission_planned",
  "outage_resubmission_deferred",
  "outage_circuit_opened",
  "outage_half_open_probe",
  "outage_child_submission_confirmed",
  "outage_recovery_succeeded",
  "outage_attempts_exhausted",
  "outage_wall_clock_exhausted",
  "outage_terminal_nonretryable",
  "outage_operator_pause_stop",
  "outage_uncertain_submission",
]);

export function recordMonitoringEvent(eventName, payload, { logsRoot = defaultLogsRoot } = {}) {
  if (!monitoringEvents.has(eventName)) throw new Error(`Unsupported monitoring event: ${eventName}`);
  if (!payload?.runId) return { ok: false, reason: "missing_run_id" };
  const context = ensureTrustedRunPathContext({ runId: payload.runId, logsRoot });
  const entry = sanitizeMonitoringPayload({ event: eventName, at: new Date().toISOString(), payload });
  try {
    appendFileSync(context.artifactPath(runArtifactKinds.monitoringEvents), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    return { ok: true, path: context.artifactPath(runArtifactKinds.monitoringEvents) };
  } catch (error) {
    return { ok: false, reason: "event_write_failed", detail: error.message };
  }
}

export function sanitizeMonitoringPayload(value) {
  return JSON.parse(JSON.stringify(value, (key, val) => {
    if (/url|token|secret|authorization|header|env|config|diff|body|payload/i.test(key) && typeof val === "string") {
      return "[redacted]";
    }
    if (typeof val === "string" && val.length > 1000) return `${val.slice(0, 1000)}...[truncated]`;
    return val;
  }));
}
