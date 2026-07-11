import { classifySupervisorLifecycleState } from "./supervisor-state.mjs";

const supervisorControlCommands = new Set(["pause", "stop-after-current", "extend"]);

export function evaluateSupervisorControlPolicy({
  supervisorRunId,
  lifecycleState,
  runnerStatus,
  command,
  maxTasksDelta = null,
  maxRuntimeDeltaMs = null,
} = {}) {
  const lifecycleClass = classifySupervisorLifecycleState(lifecycleState);
  const correlation = buildCorrelation({ supervisorRunId, runnerStatus });
  const base = {
    command,
    lifecycleState,
    lifecycleClass,
    correlation,
    maxTasksDelta,
    maxRuntimeDeltaMs,
    allowed: false,
    accepted: false,
    idempotent: false,
  };

  if (!supervisorControlCommands.has(command)) return { ...base, reason: "unknown_control_command" };
  if (lifecycleClass === "terminal") return { ...base, reason: "terminal_run" };
  if (lifecycleClass === "pre_active") return { ...base, reason: "pre_active_run" };
  if (lifecycleClass === "unknown") return { ...base, reason: "unknown_supervisor_state" };
  if (lifecycleClass === "stopping") {
    if (command === "stop-after-current") {
      return { ...base, allowed: true, accepted: true, idempotent: true, reason: "already_stopping" };
    }
    return { ...base, reason: "already_stopping" };
  }

  if (!runnerStatus?.active) return { ...base, reason: "no_active_runner" };
  if (!correlation.activeSupervisorRunId) return { ...base, reason: "active_runner_uncorrelated" };
  if (!correlation.matched) return { ...base, reason: "active_runner_mismatch" };

  return { ...base, allowed: true, reason: "active_runner_correlated" };
}

function buildCorrelation({ supervisorRunId, runnerStatus }) {
  const activeSupervisorRunId = typeof runnerStatus?.supervisorRunId === "string" && runnerStatus.supervisorRunId.length
    ? runnerStatus.supervisorRunId
    : null;
  return {
    selectedSupervisorRunId: supervisorRunId || null,
    activeSupervisorRunId,
    activeRunId: runnerStatus?.activeRunId || null,
    runnerActive: Boolean(runnerStatus?.active),
    matched: Boolean(supervisorRunId && activeSupervisorRunId && activeSupervisorRunId === supervisorRunId),
  };
}
