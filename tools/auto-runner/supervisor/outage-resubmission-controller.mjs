import {
  readOutageResubmissionInventory,
} from "../lib/outage-resubmission-state.mjs";
import { normalizeOutageResubmissionConfig } from "../lib/outage-resubmission-policy.mjs";

export function buildOutageResubmissionStatus(config = {}) {
  const policy = normalizeOutageResubmissionConfig(config.outageResubmission || {});
  const inventory = readOutageResubmissionInventory(config);
  const states = inventory.ok ? inventory.validStates : [];
  const activeStates = states.filter((state) => !isTerminalOutageStatus(state.status));
  const activeAmbiguity = activeStates.length > 1 ? summarizeActiveAmbiguity(activeStates) : null;
  const operatorActionRequired = inventory.operatorActionRequired || Boolean(activeAmbiguity);
  const active = activeStates.length === 1 ? activeStates[0] : null;
  const terminal = active || activeAmbiguity ? null : selectCurrentOutageState(states.filter((state) => isTerminalOutageStatus(state.status)));
  const statusSource = active || terminal || null;
  const reasonCode = inventory.reasonCode || activeAmbiguity?.reasonCode || null;
  return {
    enabled: policy.allowBoundedOutageResubmission,
    defaultOff: policy.allowBoundedOutageResubmission !== true,
    activeSourceRun: operatorActionRequired ? null : active ? summarizeOutageState(active) : null,
    attemptCount: statusSource?.mutationMarker?.attemptNumber || 0,
    maxAttempts: policy.maxAttempts,
    nextEligibleAt: operatorActionRequired ? null : active?.schedule?.nextEligibleAt || null,
    deadlineAt: statusSource?.schedule?.deadlineAt || null,
    circuitState: statusSource?.circuit?.state || "closed",
    lastSanitizedReason: reasonCode || statusSource?.mutationMarker?.reasonCode || statusSource?.outage?.reasonCode || null,
    childRunId: operatorActionRequired ? null : statusSource?.childSupervisorRunId || null,
    terminalOutcome: operatorActionRequired ? null : terminal?.status || null,
    recordCount: inventory.totalRecordCount,
    stateReadStatus: inventory.readStatus,
    reasonCode,
    operatorActionRequired,
    totalRecordCount: inventory.totalRecordCount,
    validRecordCount: inventory.validCount,
    invalidRecordCount: inventory.invalidCount,
    activeRecordCount: activeStates.length,
    ambiguousActiveRecordCount: activeAmbiguity?.count || 0,
    ambiguousActiveRecords: activeAmbiguity?.records || [],
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

function summarizeActiveAmbiguity(states = []) {
  return {
    reasonCode: "multiple_active_outage_states",
    count: states.length,
    records: states
      .slice()
      .sort((left, right) => outageStateTieBreaker(left).localeCompare(outageStateTieBreaker(right)))
      .slice(0, 10)
      .map((state) => ({
        taskKey: state?.correlation?.taskKey || null,
        runnerRunId: state?.correlation?.runnerRunId || null,
        supervisorRunId: state?.correlation?.supervisorRunId || null,
        issueNumber: state?.correlation?.issueNumber || null,
        markerKey: state?.mutationMarker?.key || null,
        status: state?.status || null,
      })),
  };
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
