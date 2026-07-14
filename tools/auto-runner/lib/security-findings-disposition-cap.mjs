import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const securityFindingDispositionRunStateVersion = 1;

export function consumeDispositionRunSlot(config = {}, runId, packet = {}, outcome = "attempted", maxDispositionsPerRun = 1) {
  const state = readSecurityFindingDispositionRunState(config, runId);
  if (maxDispositionsPerRun === 0) {
    return { ok: false, reason: "security_findings_disposition_cap_zero", state };
  }
  if (state.lockedByUncertainOutcome) {
    return { ok: false, reason: "security_findings_disposition_cap_locked_by_uncertain_outcome", state };
  }
  if ((state.consumed || 0) >= maxDispositionsPerRun) {
    return { ok: false, reason: "security_findings_disposition_cap_exhausted", state };
  }
  const next = appendDispositionAttempt({
    ...state,
    consumed: (state.consumed || 0) + 1,
    lockedByUncertainOutcome: outcome === "uncertain",
  }, packet, outcome);
  return { ok: true, state: writeSecurityFindingDispositionRunState(config, runId, next).state };
}

export function recordDispositionRunOutcome(config = {}, runId, packet = {}, outcome = "confirmed") {
  const state = readSecurityFindingDispositionRunState(config, runId);
  const next = appendDispositionAttempt({
    ...state,
    lockedByUncertainOutcome: state.lockedByUncertainOutcome === true || outcome === "uncertain",
  }, packet, outcome);
  return writeSecurityFindingDispositionRunState(config, runId, next);
}

export function readSecurityFindingDispositionRunState(config = {}, runId = "unknown-run") {
  const statePath = dispositionRunStatePath(config, runId);
  if (!existsSync(statePath)) {
    return {
      stateVersion: securityFindingDispositionRunStateVersion,
      runId,
      consumed: 0,
      lockedByUncertainOutcome: false,
      attempts: [],
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    if (parsed.stateVersion !== securityFindingDispositionRunStateVersion || parsed.runId !== runId) {
      return {
        stateVersion: securityFindingDispositionRunStateVersion,
        runId,
        consumed: 0,
        lockedByUncertainOutcome: true,
        attempts: [],
        reason: "disposition_run_state_invalid",
      };
    }
    return parsed;
  } catch {
    return {
      stateVersion: securityFindingDispositionRunStateVersion,
      runId,
      consumed: 0,
      lockedByUncertainOutcome: true,
      attempts: [],
      reason: "disposition_run_state_corrupt",
    };
  }
}

export function writeSecurityFindingDispositionRunState(config = {}, runId = "unknown-run", state = {}) {
  const statePath = dispositionRunStatePath(config, runId);
  mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  const clean = {
    stateVersion: securityFindingDispositionRunStateVersion,
    runId,
    consumed: Number.isSafeInteger(state.consumed) ? state.consumed : 0,
    lockedByUncertainOutcome: Boolean(state.lockedByUncertainOutcome),
    attempts: Array.isArray(state.attempts) ? state.attempts.slice(-20).map((attempt) => ({
      packetDigest: attempt.packetDigest || null,
      correlationKey: attempt.correlationKey || null,
      outcome: attempt.outcome || "attempted",
      recordedAt: attempt.recordedAt || new Date().toISOString(),
    })) : [],
  };
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(clean, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, statePath);
  return { statePath, state: clean };
}

export function dispositionRunStatePath(config = {}, runId = "unknown-run") {
  return path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "security-findings", "disposition-runs", `${sanitizeRunId(runId)}.json`);
}

function appendDispositionAttempt(state = {}, packet = {}, outcome = "attempted") {
  return {
    ...state,
    attempts: [
      ...(Array.isArray(state.attempts) ? state.attempts : []),
      {
        packetDigest: packet.packetDigest || null,
        correlationKey: packet.correlationKey || null,
        outcome,
        recordedAt: new Date().toISOString(),
      },
    ],
  };
}

function sanitizeRunId(runId) {
  return String(runId || "unknown-run").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}
