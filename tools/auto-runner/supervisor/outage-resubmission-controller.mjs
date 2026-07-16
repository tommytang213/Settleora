import {
  readOutageResubmissionInventory,
} from "../lib/outage-resubmission-state.mjs";
import { normalizeOutageResubmissionConfig } from "../lib/outage-resubmission-policy.mjs";

export function buildOutageResubmissionStatus(config = {}) {
  const policy = normalizeOutageResubmissionConfig(config.outageResubmission || {});
  const inventory = readOutageResubmissionInventory(config);
  const states = inventory.ok ? inventory.validStates : [];
  const active = selectCurrentOutageState(states.filter((state) => !isTerminalOutageStatus(state.status)));
  const terminal = active ? null : selectCurrentOutageState(states.filter((state) => isTerminalOutageStatus(state.status)));
  const statusSource = active || terminal || null;
  return {
    enabled: policy.allowBoundedOutageResubmission,
    defaultOff: policy.allowBoundedOutageResubmission !== true,
    activeSourceRun: inventory.operatorActionRequired ? null : active ? summarizeOutageState(active) : null,
    attemptCount: statusSource?.mutationMarker?.attemptNumber || 0,
    maxAttempts: policy.maxAttempts,
    nextEligibleAt: inventory.operatorActionRequired ? null : active?.schedule?.nextEligibleAt || null,
    deadlineAt: statusSource?.schedule?.deadlineAt || null,
    circuitState: statusSource?.circuit?.state || "closed",
    lastSanitizedReason: inventory.reasonCode || statusSource?.mutationMarker?.reasonCode || statusSource?.outage?.reasonCode || null,
    childRunId: inventory.operatorActionRequired ? null : statusSource?.childSupervisorRunId || null,
    terminalOutcome: inventory.operatorActionRequired ? null : terminal?.status || null,
    recordCount: inventory.totalRecordCount,
    stateReadStatus: inventory.readStatus,
    reasonCode: inventory.reasonCode,
    operatorActionRequired: inventory.operatorActionRequired,
    totalRecordCount: inventory.totalRecordCount,
    validRecordCount: inventory.validCount,
    invalidRecordCount: inventory.invalidCount,
  };
}

function selectCurrentOutageState(states = []) {
  return states.reduce((selected, candidate) => {
    if (!selected) return candidate;
    return compareOutageStateRecency(candidate, selected) > 0 ? candidate : selected;
  }, null);
}

function compareOutageStateRecency(left, right) {
  const leftUpdatedAt = Date.parse(left?.timestamps?.updatedAt || "");
  const rightUpdatedAt = Date.parse(right?.timestamps?.updatedAt || "");
  if (leftUpdatedAt !== rightUpdatedAt) return leftUpdatedAt - rightUpdatedAt;
  return outageStateTieBreaker(left).localeCompare(outageStateTieBreaker(right));
}

function outageStateTieBreaker(state) {
  return [
    state?.mutationMarker?.key || "",
    state?.correlation?.taskKey || "",
    state?.correlation?.runnerRunId || "",
    state?.correlation?.supervisorRunId || "",
    String(state?.correlation?.issueNumber || ""),
    state?.correlation?.branchName || "",
    state?.correlation?.currentHeadSha || "",
    state?.correlation?.prHeadSha || "",
    state?.correlation?.outageFingerprint || "",
  ].join(":");
}

function isTerminalOutageStatus(status) {
  return ["recovered", "exhausted", "blocked"].includes(status);
}

function summarizeOutageState(state) {
  if (!state) return null;
  return {
    taskKey: state.correlation?.taskKey || null,
    runnerRunId: state.correlation?.runnerRunId || null,
    supervisorRunId: state.correlation?.supervisorRunId || null,
    issueNumber: state.correlation?.issueNumber || null,
    branchName: state.correlation?.branchName || null,
    currentHeadSha: state.correlation?.currentHeadSha || null,
    status: state.status,
    markerStatus: state.mutationMarker?.status || null,
    reasonCode: state.mutationMarker?.reasonCode || state.outage?.reasonCode || null,
  };
}
