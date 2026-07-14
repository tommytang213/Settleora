import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runOutageResubmissionController, evaluateSourceRunEligibility } from "../supervisor/outage-resubmission-controller.mjs";
import { createOutageResubmissionState, transitionOutageMarker } from "../lib/outage-resubmission-state.mjs";
import { createInitialRecoveryState } from "../lib/recovery-state.mjs";
import { resolveProfile } from "../supervisor/run-spec.mjs";
import { getRunnerStatus } from "../lib/control-plane.mjs";
import { evaluateAutoRunnerHealth } from "../lib/health-service.mjs";
import { monitoringEvents, recordMonitoringEvent } from "../supervisor/monitoring-outbox.mjs";

const shaA = "a".repeat(40);
const shaB = "b".repeat(40);
const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
const now = new Date("2026-07-15T01:00:00.000Z");

test("source eligibility is not inferred from age or stopped state alone", () => {
  const config = tempConfig();
  try {
    assert.equal(evaluateSourceRunEligibility({ config, source: { ...source(), terminal: false, provenInactive: false } }).reasonCode, "source_run_not_terminal_or_inactive");
    assert.equal(evaluateSourceRunEligibility({ config, source: { ...source(), runnerConfigDigest: null } }).reasonCode, "source_immutable_digest_missing");
    assert.equal(evaluateSourceRunEligibility({ config, source: { ...source(), manualGate: true } }).reasonCode, "source_manual_or_authority_gate");
    assert.equal(evaluateSourceRunEligibility({ config, source: { ...source(), completed: true } }).reasonCode, "source_work_already_complete");
    assert.equal(evaluateSourceRunEligibility({ config, source: source(), failure: { domain: "github_api", status: 403 } }).reasonCode, "source_failure_nonretryable");
    assert.equal(evaluateSourceRunEligibility({ config, source: source() }).eligible, true);
  } finally {
    config.cleanup();
  }
});

test("controller checks recovery before planning a new child", () => {
  const config = tempConfig();
  try {
    const recoveryState = createInitialRecoveryState({
      taskKey: "20260715-0013",
      issue: { number: 913, title: "Outage", url: "u" },
      runId: "run-2026-07-15T000000Z",
      supervisorRunId: "supervised-20260715T000000Z-000000000001",
      branchName: source().branchName,
      baseSha: shaA,
      currentHeadSha: shaB,
      phase: "ci_wait",
      firstIncompleteAction: "wait_for_checks",
    });
    const result = runOutageResubmissionController({ config, source: source(), recoveryState, dryRun: true, now });
    assert.equal(result.outcome, "resume_recovery");
    assert.equal(result.reasonCode, "existing_recoverable_state_first");
    assert.equal(result.events.map((item) => item.event).includes("recoverable_state_wins"), true);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("controller plans one exact correlated child in dry-run with zero live mutations", () => {
  const config = tempConfig();
  try {
    const result = runOutageResubmissionController({
      config,
      source: source(),
      currentIdentity: { branchName: source().branchName, baseSha: shaA, currentHeadSha: shaB, prNumber: 917 },
      dryRun: true,
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000999",
    });
    assert.equal(result.outcome, "planned");
    assert.equal(result.reasonCode, "dry_run_no_mutation");
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);
    assert.equal(result.child.spec.parentSupervisorRunId, source().supervisorRunId);
    assert.equal(result.child.spec.parentRunnerRunId, source().runnerRunId);
    assert.equal(result.child.spec.sourceIssueNumber, 913);
    assert.equal(result.child.spec.sourceBranchName, source().branchName);
    assert.equal(result.child.spec.outageResubmission.attemptNumber, 1);
    assert.match(result.child.specSha256, /^[a-f0-9]{64}$/);
  } finally {
    config.cleanup();
  }
});

test("controller reuses existing child and reconciles uncertain submission", () => {
  const config = tempConfig();
  try {
    const baseState = fixtureOutageState();
    const existingChild = {
      runId: "supervised-20260715T010000Z-000000000002",
      parentSupervisorRunId: source().supervisorRunId,
      parentRunnerRunId: source().runnerRunId,
      sourceIssueNumber: 913,
      sourceBranchName: source().branchName,
      outageResubmission: { markerKey: baseState.mutationMarker.key },
    };
    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: baseState,
      existingChildren: [existingChild],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "noop");
    assert.equal(result.reasonCode, "existing_child_resubmission_present");

    const uncertain = transitionOutageMarker(baseState, { status: "submission_uncertain", childSupervisorRunId: existingChild.runId });
    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: uncertain,
      existingChildren: [existingChild],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "confirmed_existing_child");
    assert.equal(result.outageState.mutationMarker.status, "confirmed_running");

    result = runOutageResubmissionController({ config, source: source(), outageState: uncertain, existingChildren: [], dryRun: true, now });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "uncertain_submission_requires_reconciliation");
  } finally {
    config.cleanup();
  }
});

test("controller blocks stale identity, active/stale locks, pause, stop, and circuit", () => {
  const config = tempConfig();
  try {
    assert.equal(runOutageResubmissionController({ config, source: source(), currentIdentity: { branchName: "feature/auto-999-wrong" }, dryRun: true, now }).reasonCode, "branch_identity_mismatch");
    assert.equal(runOutageResubmissionController({ config, source: source(), currentIdentity: { prNumber: 918 }, dryRun: true, now }).reasonCode, "pr_identity_mismatch");
    assert.equal(runOutageResubmissionController({ config, source: source(), lock: { active: true }, dryRun: true, now }).reasonCode, "active_lock");
    assert.equal(runOutageResubmissionController({ config, source: source(), lock: { stale: true, safeToClear: false }, dryRun: true, now }).reasonCode, "stale_lock_requires_existing_policy");
    assert.equal(runOutageResubmissionController({ config, source: source(), operatorControl: { pause: true }, dryRun: true, now }).reasonCode, "operator_pause");
    assert.equal(runOutageResubmissionController({ config, source: source(), operatorControlBeforeSubmit: { stopAfterCurrent: true }, dryRun: true, now }).reasonCode, "operator_stop");
    assert.equal(runOutageResubmissionController({
      config,
      source: source(),
      circuitRecords: [
        { at: "2026-07-15T00:55:00.000Z", providerDomain: "github_api", outageFingerprint: digestA, supervisorRunId: "supervised-20260715T005500Z-000000000001" },
        { at: "2026-07-15T00:56:00.000Z", providerDomain: "github_api", outageFingerprint: digestB, supervisorRunId: "supervised-20260715T005600Z-000000000002" },
      ],
      dryRun: true,
      now,
    }).reasonCode, "circuit_open_distinct_runs");
  } finally {
    config.cleanup();
  }
});

test("controller invalidates stale head evidence and treats merged or closed source as recovered", () => {
  const config = tempConfig();
  try {
    const recoveryState = createInitialRecoveryState({
      taskKey: "20260715-0013",
      issue: { number: 913, title: "Outage", url: "u" },
      runId: source().runnerRunId,
      supervisorRunId: source().supervisorRunId,
      branchName: source().branchName,
      baseSha: shaA,
      currentHeadSha: shaB,
    });
    let result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState: { ...recoveryState, phase: "completed" },
      currentIdentity: { branchName: source().branchName, baseSha: shaA, currentHeadSha: "c".repeat(40) },
      dryRun: true,
      now,
    });
    assert.equal(result.reasonCode, "stale_head_evidence_regeneration_required");
    assert.equal(result.recoveryState.branch.currentHeadSha, "c".repeat(40));
    assert.equal(result.recoveryState.nextSafeAction, "regenerate_exact_head_evidence");

    result = runOutageResubmissionController({
      config,
      source: source(),
      currentIdentity: { merged: true },
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "recovered");
  } finally {
    config.cleanup();
  }
});

test("controller enforces attempt and wall-clock exhaustion without child creation", () => {
  const config = tempConfig();
  try {
    assert.equal(runOutageResubmissionController({ config, source: { ...source(), attemptNumber: 4 }, dryRun: true, now }).reasonCode, "outage_resubmission_attempts_exhausted");
    assert.equal(runOutageResubmissionController({
      config,
      source: { ...source(), firstFailureAt: "2026-07-13T00:00:00.000Z", lastFailureAt: "2026-07-13T01:00:00.000Z" },
      dryRun: true,
      now,
    }).reasonCode, "outage_resubmission_wall_clock_exhausted");
  } finally {
    config.cleanup();
  }
});

test("status and health expose sanitized default-off outage state without mutation authority", () => {
  const config = tempConfig({ enabled: false });
  try {
    const outageState = fixtureOutageState();
    // Write state directly through the state module path exercised by controller dry-run tests.
    const planned = runOutageResubmissionController({
      config,
      source: source(),
      dryRun: true,
      now,
      childRunId: "supervised-20260715T010000Z-000000000123",
    });
    assert.equal(planned.counts.realMutationCalls, 0);
    assert.equal(outageState.status, "planned");

    const status = getRunnerStatus(config);
    assert.equal(status.outageResubmission.enabled, false);
    assert.equal(status.outageResubmission.defaultOff, true);
    assert.equal(status.outageResubmission.recordCount, 0);

    const health = evaluateAutoRunnerHealth({ logsRoot: config.logsRoot, now });
    assert.equal(health.body.outageResubmission.enabled, false);
    assert.equal(health.body.outageResubmission.defaultOff, true);
    assert.equal(JSON.stringify(health.body).includes("raw"), false);
    assert.equal(JSON.stringify(health.body).includes("secret"), false);
  } finally {
    config.cleanup();
  }
});

test("monitoring outbox allows bounded outage events and rejects unsupported events", () => {
  const config = tempConfig();
  try {
    assert.equal(monitoringEvents.has("outage_resubmission_planned"), true);
    const written = recordMonitoringEvent("outage_resubmission_planned", {
      runId: source().supervisorRunId,
      rawProviderBody: "secret raw body",
      reasonCode: "github_api_5xx",
    }, { logsRoot: config.logsRoot });
    assert.equal(written.ok, true);
    assert.throws(() => recordMonitoringEvent("outage_webhook_send", { runId: source().supervisorRunId }, { logsRoot: config.logsRoot }), /Unsupported/);
  } finally {
    config.cleanup();
  }
});

function source(overrides = {}) {
  return {
    taskKey: "20260715-0013",
    runnerRunId: "run-2026-07-15T000000Z",
    supervisorRunId: "supervised-20260715T000000Z-000000000001",
    issueNumber: 913,
    branchName: "feature/auto-913-bounded-outage-resubmission-20260715-0013",
    baseSha: shaA,
    currentHeadSha: shaB,
    prNumber: 917,
    prHeadSha: shaB,
    runnerProfile: "default",
    runnerConfigDigest: digestA,
    originalSupervisorSpecDigest: digestB,
    terminal: true,
    failure: { domain: "github_api", status: 503 },
    firstFailureAt: "2026-07-15T00:00:00.000Z",
    lastFailureAt: "2026-07-15T00:30:00.000Z",
    attemptNumber: 1,
    maxTasks: 1,
    maxRuntime: "3h",
    mode: "trusted",
    ...overrides,
  };
}

function fixtureOutageState() {
  return createOutageResubmissionState({
    correlation: {
      ...source(),
      providerDomain: "github_api",
      outageFingerprint: digestA,
    },
    outage: {
      providerDomain: "github_api",
      outageClass: "github_api_5xx",
      outageFingerprint: digestA,
      firstFailureAt: "2026-07-15T00:00:00.000Z",
      lastFailureAt: "2026-07-15T00:30:00.000Z",
      reasonCode: "github_api_5xx",
    },
    schedule: {
      attemptNumber: 1,
      nextEligibleAt: "2026-07-15T00:35:00.000Z",
      deadlineAt: "2026-07-16T00:00:00.000Z",
      maxAttempts: 3,
      maxWallClockMs: 24 * 60 * 60 * 1000,
    },
  });
}

function tempConfig({ enabled = true } = {}) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-outage-controller-"));
  const profilePath = resolveProfile("default", logsRoot).runnerConfigPath;
  mkdirSync(path.dirname(profilePath), { recursive: true, mode: 0o700 });
  writeFileSync(profilePath, '{"trustedRealRunApproved":true}\n', { mode: 0o600 });
  return {
    logsRoot,
    outageResubmission: {
      allowBoundedOutageResubmission: enabled,
      minimumOutageAgeMs: 10 * 60 * 1000,
      baseBackoffMs: 5 * 60 * 1000,
      maxBackoffMs: 30 * 60 * 1000,
      jitterRatio: 0,
      maxAttempts: 3,
      maxWallClockMs: 24 * 60 * 60 * 1000,
      circuitWindowMs: 60 * 60 * 1000,
      circuitFailureThreshold: 3,
      circuitDistinctRunThreshold: 2,
      circuitCooldownMs: 30 * 60 * 1000,
    },
    cleanup: () => rmSync(logsRoot, { recursive: true, force: true }),
  };
}
