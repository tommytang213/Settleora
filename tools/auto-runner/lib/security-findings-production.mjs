import { runSecurityFindingsDryRun } from "./security-findings-dry-run.mjs";
import { normalizeSecurityFindingDispositionConfig } from "./security-findings-disposition.mjs";
import {
  consumeDispositionRunSlot as consumeDispositionRunSlotWithMax,
  readSecurityFindingDispositionRunState,
  writeSecurityFindingDispositionRunState,
} from "./security-findings-disposition-cap.mjs";

export const securityFindingsProductionPhaseVersion = 1;

export { readSecurityFindingDispositionRunState, writeSecurityFindingDispositionRunState };

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
  return consumeDispositionRunSlotWithMax(config, runId, packet, outcome, dispositionConfig.maxDispositionsPerRun);
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
    duplicateCount: result.duplicateCount || 0,
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
