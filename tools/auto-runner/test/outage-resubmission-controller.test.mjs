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
    const existingChild = exactChild(baseState);
    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: baseState,
      existingChildren: [existingChild],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "confirmed_existing_child");
    assert.equal(result.reasonCode, "planned_child_reconciled");

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

test("submitted and confirmed markers with missing children block reconciliation before planning", () => {
  const config = tempConfig();
  try {
    const baseState = fixtureOutageState();
    const submitted = transitionOutageMarker(baseState, {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000333",
      specDigest: digestB,
      reasonCode: "child_submission_confirmed",
    });
    const confirmed = transitionOutageMarker(baseState, {
      status: "confirmed_running",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000444",
      specDigest: digestB,
      reasonCode: "submitted_child_reconciled",
    });

    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [],
      circuitRecords: [
        { at: "2026-07-15T00:55:00.000Z", providerDomain: "github_api", outageFingerprint: digestA, supervisorRunId: "supervised-20260715T005500Z-000000000001" },
        { at: "2026-07-15T00:56:00.000Z", providerDomain: "github_api", outageFingerprint: digestB, supervisorRunId: "supervised-20260715T005600Z-000000000002" },
      ],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "submitted_child_missing_requires_reconciliation");
    assert.equal(result.counts.realMutationCalls, 0);
    assert.equal(result.events.filter((item) => item.event === "submitted_child_missing_requires_reconciliation").length, 1);
    assert.equal(result.events.some((item) => item.event === "circuit_checked"), false);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);

    const repeated = runOutageResubmissionController({ config, source: source(), outageState: submitted, existingChildren: [], dryRun: true, now });
    assert.equal(repeated.reasonCode, "submitted_child_missing_requires_reconciliation");
    assert.deepEqual(repeated.outageState.mutationMarker, submitted.mutationMarker);

    result = runOutageResubmissionController({ config, source: source(), outageState: confirmed, existingChildren: [], dryRun: true, now });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "confirmed_child_missing_requires_reconciliation");
    assert.equal(result.counts.realMutationCalls, 0);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
  } finally {
    config.cleanup();
  }
});

test("submitted and confirmed markers reconcile exact children without duplicate submission", () => {
  const config = tempConfig();
  try {
    const baseState = fixtureOutageState();
    const submitted = transitionOutageMarker(baseState, {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000333",
      specDigest: digestB,
    });
    const submittedChild = exactChild(submitted, { runId: submitted.childSupervisorRunId });
    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [submittedChild],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "confirmed_existing_child");
    assert.equal(result.reasonCode, "submitted_child_reconciled");
    assert.equal(result.outageState.mutationMarker.status, "confirmed_running");
    assert.equal(result.counts.realMutationCalls, 0);

    const confirmed = transitionOutageMarker(baseState, {
      status: "confirmed_running",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000444",
      specDigest: digestB,
    });
    const runningChild = exactChild(confirmed, { runId: confirmed.childSupervisorRunId, state: "running" });
    result = runOutageResubmissionController({ config, source: source(), outageState: confirmed, existingChildren: [runningChild], dryRun: true, now });
    assert.equal(result.outcome, "observed");
    assert.equal(result.reasonCode, "confirmed_running_child_observed");

    const terminalChild = exactChild(confirmed, { runId: confirmed.childSupervisorRunId, state: "completed", terminalOutcome: "completed" });
    result = runOutageResubmissionController({ config, source: source(), outageState: confirmed, existingChildren: [terminalChild], dryRun: true, now });
    assert.equal(result.outcome, "recovered");
    assert.equal(result.reasonCode, "confirmed_child_recovered");
    assert.equal(result.outageState.mutationMarker.status, "recovered");
  } finally {
    config.cleanup();
  }
});

test("ambiguous or mismatched child candidates fail closed", () => {
  const config = tempConfig();
  try {
    const baseState = fixtureOutageState();
    const child = exactChild(baseState);
    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: baseState,
      existingChildren: [child, exactChild(baseState, { runId: "supervised-20260715T010000Z-000000000003" })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_child_ambiguous_requires_reconciliation");

    const intendedState = transitionOutageMarker(baseState, {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000004",
      specDigest: digestB,
    });
    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: intendedState,
      existingChildren: [exactChild(intendedState, { runId: intendedState.childSupervisorRunId, currentHeadSha: shaA })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.equal(result.childReconciliation.mismatches.includes("currentHeadSha"), true);
  } finally {
    config.cleanup();
  }
});

test("correlated duplicate children are detected before intended child narrowing", () => {
  const config = tempConfig();
  try {
    const baseState = fixtureOutageState();
    const submitted = transitionOutageMarker(baseState, {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000111",
      specDigest: digestB,
      reasonCode: "child_submission_confirmed",
    });
    const childA = exactChild(submitted, { runId: submitted.childSupervisorRunId });
    const childB = exactChild(submitted, {
      runId: "supervised-20260715T010000Z-000000000222",
      specSha256: digestB,
    });

    for (const status of ["submitted", "confirmed_running", "submission_uncertain"]) {
      const state = transitionOutageMarker(baseState, {
        status,
        childSupervisorRunId: childA.runId,
        specDigest: digestB,
        reasonCode: "existing_marker",
      });
      const result = runOutageResubmissionController({
        config,
        source: source(),
        outageState: state,
        existingChildren: [childA, childB],
        circuitRecords: [
          { at: "2026-07-15T00:55:00.000Z", providerDomain: "github_api", outageFingerprint: digestA, supervisorRunId: "supervised-20260715T005500Z-000000000001" },
          { at: "2026-07-15T00:56:00.000Z", providerDomain: "github_api", outageFingerprint: digestB, supervisorRunId: "supervised-20260715T005600Z-000000000002" },
        ],
        dryRun: true,
        now,
      });
      assert.equal(result.outcome, "blocked", status);
      assert.equal(result.reasonCode, "outage_child_ambiguous_requires_reconciliation", status);
      assert.equal(result.counts.githubMutationCalls, 0);
      assert.equal(result.counts.systemdCalls, 0);
      assert.equal(result.counts.realMutationCalls, 0);
      assert.equal(result.events.some((item) => item.event === "circuit_checked"), false);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
      assert.equal(result.events.filter((item) => item.event === "outage_child_reconciliation_blocked").length, 1);
    }
  } finally {
    config.cleanup();
  }
});

test("planned duplicate children block before eligibility and planning", () => {
  const config = tempConfig();
  try {
    const planned = fixtureOutageState();
    const childA = exactChild(planned, { runId: "supervised-20260715T010000Z-000000000111" });
    const childB = exactChild(planned, { runId: "supervised-20260715T010000Z-000000000222" });
    const result = runOutageResubmissionController({
      config,
      source: source({ terminal: false, provenInactive: false }),
      outageState: planned,
      existingChildren: [childA, childB],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_child_ambiguous_requires_reconciliation");
    assert.equal(result.events.some((item) => item.event === "source_eligibility_checked"), false);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("intended child reconciles with unrelated or fully distinguished attempts", () => {
  const config = tempConfig();
  try {
    const submitted = transitionOutageMarker(fixtureOutageState(), {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000111",
      specDigest: digestB,
    });
    const intended = exactChild(submitted, { runId: submitted.childSupervisorRunId });
    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [
        intended,
        exactChild(submitted, { runId: "supervised-20260715T010000Z-000000000999", sourceIssueNumber: 914, sourceBranchName: "feature/auto-914-unrelated" }),
      ],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "confirmed_existing_child");
    assert.equal(result.reasonCode, "submitted_child_reconciled");

    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [
        intended,
        exactChild(submitted, {
          runId: "supervised-20260715T010000Z-000000000998",
          outageResubmission: {
            ...intended.outageResubmission,
            attemptNumber: 2,
            markerKey: "c".repeat(64),
            outageFingerprint: "c".repeat(64),
          },
        }),
      ],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "confirmed_existing_child");
    assert.equal(result.reasonCode, "submitted_child_reconciled");
  } finally {
    config.cleanup();
  }
});

test("same-source partial child or differently named exact child blocks intended reconciliation", () => {
  const config = tempConfig();
  try {
    const submitted = transitionOutageMarker(fixtureOutageState(), {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000111",
      specDigest: digestB,
    });
    const intended = exactChild(submitted, { runId: submitted.childSupervisorRunId });
    const partial = exactChild(submitted, {
      runId: "supervised-20260715T010000Z-000000000333",
      outageResubmission: {},
    });
    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [intended, partial],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_child_ambiguous_requires_reconciliation");

    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [exactChild(submitted, { runId: "supervised-20260715T010000Z-000000000222" })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.equal(result.childReconciliation.mismatches.includes("childLogicalId"), true);
  } finally {
    config.cleanup();
  }
});

test("canonical child representations dedupe only when immutable identity is consistent", () => {
  const config = tempConfig();
  try {
    const submitted = transitionOutageMarker(fixtureOutageState(), {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000111",
      specDigest: digestB,
    });
    const child = exactChild(submitted, { runId: submitted.childSupervisorRunId });
    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [child, { ...child }],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "confirmed_existing_child");
    assert.equal(result.reasonCode, "submitted_child_reconciled");

    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [child, { ...child, specSha256: "c".repeat(64) }],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.equal(result.childReconciliation.mismatches.includes("childSpecDigest"), true);

    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [child, { ...child, baseSha: "c".repeat(40) }],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.equal(result.childReconciliation.mismatches.includes("baseSha"), true);
  } finally {
    config.cleanup();
  }
});

test("children with different issue branch or parent identity are unrelated", () => {
  const config = tempConfig();
  try {
    const submitted = transitionOutageMarker(fixtureOutageState(), {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000111",
      specDigest: digestB,
    });
    const intended = exactChild(submitted, { runId: submitted.childSupervisorRunId });
    for (const unrelated of [
      exactChild(submitted, { runId: "supervised-20260715T010000Z-000000000222", sourceIssueNumber: 914, sourceBranchName: "feature/auto-914-unrelated" }),
      exactChild(submitted, { runId: "supervised-20260715T010000Z-000000000333", parentSupervisorRunId: "supervised-20260715T020000Z-000000000333", parentRunnerRunId: "run-2026-07-15T020000Z" }),
    ]) {
      const result = runOutageResubmissionController({
        config,
        source: source(),
        outageState: submitted,
        existingChildren: [intended, unrelated],
        dryRun: true,
        now,
      });
      assert.equal(result.outcome, "confirmed_existing_child");
      assert.equal(result.reasonCode, "submitted_child_reconciled");
    }
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

function exactChild(state = fixtureOutageState(), overrides = {}) {
  const runId = overrides.runId || state.childSupervisorRunId || "supervised-20260715T010000Z-000000000002";
  return {
    runId,
    parentSupervisorRunId: source().supervisorRunId,
    parentRunnerRunId: source().runnerRunId,
    taskKey: source().taskKey,
    sourceIssueNumber: source().issueNumber,
    sourceBranchName: source().branchName,
    baseSha: source().baseSha,
    currentHeadSha: source().currentHeadSha,
    prNumber: source().prNumber,
    prHeadSha: source().prHeadSha,
    runnerProfile: source().runnerProfile,
    runnerConfigDigest: source().runnerConfigDigest,
    originalSupervisorSpecDigest: source().originalSupervisorSpecDigest,
    specSha256: state.mutationMarker.specDigest || digestB,
    state: "running",
    outageResubmission: {
      taskKey: source().taskKey,
      markerKey: state.mutationMarker.key,
      attemptNumber: state.mutationMarker.attemptNumber,
      outageFingerprint: state.outage.outageFingerprint,
      originalSupervisorSpecDigest: source().originalSupervisorSpecDigest,
      childSpecDigest: state.mutationMarker.specDigest || digestB,
    },
    ...overrides,
  };
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
