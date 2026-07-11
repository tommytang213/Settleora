export const supervisorRunIdPattern = /^supervised-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/;
export const runnerRunIdPattern = /^run-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$/;

export function validateSupervisorRunId(runId) {
  const value = String(runId || "");
  if (!supervisorRunIdPattern.test(value)) {
    throw new Error("Invalid supervisor run ID");
  }
  return value;
}

export function validateRunnerRunId(runId) {
  const value = String(runId || "");
  if (!runnerRunIdPattern.test(value)) {
    throw new Error("Invalid runner run ID");
  }
  return value;
}

export function supervisorModeToRunnerMode(mode) {
  if (mode === "canary") return "canary-run";
  if (mode === "trusted") return "run";
  return null;
}
