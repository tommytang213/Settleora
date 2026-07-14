import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runSecurityFindingsDryRun } from "./security-findings-dry-run.mjs";
import { normalizeSecurityFindingDispositionConfig } from "./security-findings-disposition.mjs";

export const securityFindingsProductionPhaseVersion = 1;

export function securityFindingsProductionPhaseEnabled(config = {}) {
  const raw = config.securityFindings || {};
  return Boolean(raw.allowSecurityFindingsProductionPhase);
}

export async function runSecurityFindingsProductionPhase(config = {}, options = {}) {
  const runId = options.runId || "unknown-run";
  const result = {
    ok: false,
    phase: "security_findings_production",
    enabled: securityFindingsProductionPhaseEnabled(config),
    runId,
    recoveryFirst: true,
    dispositionCap: null,
    dryRunEquivalent: null,
    outcome: "skipped",
    reason: null,
    mutationCalls: 0,
  };
  if (!result.enabled) {
    result.ok = true;
    result.reason = "security_findings_production_phase_disabled";
    return result;
  }
  if (config.dryRun || config.mode === "dry-run") {
    result.reason = "security_findings_production_refuses_dry_run";
    return result;
  }
  const dispositionConfig = normalizeSecurityFindingDispositionConfig(config);
  const capState = readSecurityFindingDispositionRunState(config, runId);
  result.dispositionCap = summarizeCap(capState, dispositionConfig.maxDispositionsPerRun);
  if (capState.lockedByUncertainOutcome) {
    result.ok = true;
    result.outcome = "blocked_uncertain_disposition_recovery_required";
    result.reason = "security_findings_disposition_cap_locked_by_uncertain_outcome";
    return result;
  }

  const phaseConfig = {
    ...config,
    dryRun: true,
    run: false,
    mode: "security-findings-production-preview",
    securityFindings: {
      ...(config.securityFindings || {}),
      dryRunOnly: true,
      dispositionDryRunOnly: true,
      allowSecurityFindingDisposition: false,
      allowProvenFalsePositiveDisposition: false,
    },
  };
  const dryRunEquivalent = await runSecurityFindingsDryRun(phaseConfig, {
    ...options,
    allowImplicitConfig: false,
    taskKey: options.taskKey || "security-findings-production-phase",
    runId,
  });
  result.dryRunEquivalent = sanitizeSecurityFindingPhaseResult(dryRunEquivalent);
  result.mutationCalls = dryRunEquivalent.mutationCalls || 0;
  result.ok = dryRunEquivalent.ok;
  result.outcome = dryRunEquivalent.ok ? "security_findings_phase_complete" : "security_findings_phase_blocked";
  result.reason = dryRunEquivalent.reason;
  return result;
}

export function consumeDispositionRunSlot(config = {}, runId, packet = {}, outcome = "attempted") {
  const dispositionConfig = normalizeSecurityFindingDispositionConfig(config);
  const state = readSecurityFindingDispositionRunState(config, runId);
  if (dispositionConfig.maxDispositionsPerRun === 0) {
    return { ok: false, reason: "security_findings_disposition_cap_zero", state };
  }
  if (state.lockedByUncertainOutcome) {
    return { ok: false, reason: "security_findings_disposition_cap_locked_by_uncertain_outcome", state };
  }
  if ((state.consumed || 0) >= dispositionConfig.maxDispositionsPerRun) {
    return { ok: false, reason: "security_findings_disposition_cap_exhausted", state };
  }
  const next = {
    ...state,
    consumed: (state.consumed || 0) + 1,
    attempts: [
      ...(state.attempts || []),
      {
        packetDigest: packet.packetDigest || null,
        correlationKey: packet.correlationKey || null,
        outcome,
        recordedAt: new Date().toISOString(),
      },
    ],
    lockedByUncertainOutcome: outcome === "uncertain",
  };
  return { ok: true, state: writeSecurityFindingDispositionRunState(config, runId, next).state };
}

export function readSecurityFindingDispositionRunState(config = {}, runId = "unknown-run") {
  const statePath = dispositionRunStatePath(config, runId);
  if (!existsSync(statePath)) {
    return {
      stateVersion: securityFindingsProductionPhaseVersion,
      runId,
      consumed: 0,
      lockedByUncertainOutcome: false,
      attempts: [],
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    if (parsed.stateVersion !== securityFindingsProductionPhaseVersion || parsed.runId !== runId) {
      return {
        stateVersion: securityFindingsProductionPhaseVersion,
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
      stateVersion: securityFindingsProductionPhaseVersion,
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
    stateVersion: securityFindingsProductionPhaseVersion,
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

function dispositionRunStatePath(config = {}, runId = "unknown-run") {
  return path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "security-findings", "disposition-runs", `${sanitizeRunId(runId)}.json`);
}

function sanitizeRunId(runId) {
  return String(runId || "unknown-run").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

function summarizeCap(state = {}, max) {
  return {
    max,
    consumed: state.consumed || 0,
    remaining: Math.max(0, max - (state.consumed || 0)),
    lockedByUncertainOutcome: Boolean(state.lockedByUncertainOutcome),
  };
}

function sanitizeSecurityFindingPhaseResult(result = {}) {
  return {
    ok: Boolean(result.ok),
    reason: result.reason || null,
    sourceCounts: result.sourceCounts || {},
    classificationCounts: result.classificationCounts || {},
    routeCounts: result.routeCounts || {},
    proposalCount: result.proposalCount || 0,
    reuseCount: result.reuseCount || 0,
    retryCount: result.retryCount || 0,
    dispositionReadyCount: result.dispositionReadyCount || 0,
    dispositionBlockedCount: result.dispositionBlockedCount || 0,
    reconciliationReadyCount: result.reconciliationReadyCount || 0,
    completionReadyCount: result.completionReadyCount || 0,
    failuresByReason: result.failuresByReason || {},
    mutationCalls: result.mutationCalls || 0,
  };
}

