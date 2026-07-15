import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runOutageResubmissionController, evaluateSourceRunEligibility } from "../supervisor/outage-resubmission-controller.mjs";
import {
  createOutageResubmissionState,
  loadOutageResubmissionState,
  outageResubmissionStatePath,
  transitionOutageMarker,
  verifyOutageCorrelation,
  writeOutageResubmissionState,
} from "../lib/outage-resubmission-state.mjs";
import { outageFingerprint } from "../lib/outage-resubmission-policy.mjs";
import { createInitialRecoveryState } from "../lib/recovery-state.mjs";
import { canonicalJson, readAndVerifyRunSpec, resolveProfile, sha256Text, writeImmutableRunSpec } from "../supervisor/run-spec.mjs";
import { getRunnerStatus } from "../lib/control-plane.mjs";
import { evaluateAutoRunnerHealth } from "../lib/health-service.mjs";
import { monitoringEvents, recordMonitoringEvent } from "../supervisor/monitoring-outbox.mjs";

const shaA = "a".repeat(40);
const shaB = "b".repeat(40);
const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
const githubApi503Fingerprint = outageFingerprint({
  domain: "github_api",
  outageClass: "github_api_5xx",
  status: 503,
  reasonCode: "unknown",
});
const githubApi502Fingerprint = outageFingerprint({
  domain: "github_api",
  outageClass: "github_api_5xx",
  status: 502,
  reasonCode: "unknown",
});
const profileConfig = '{"trustedRealRunApproved":true}\n';
const profileConfigDigest = "2642cfcf41be23ff01aa228eb94455d0e67aa12945ca2d335bed7e9bc99774a4";
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

test("source eligibility requires complete bounded source identity before planning", () => {
  const config = tempConfig();
  try {
    const cases = [
      ["branchName", undefined, "source_branch_identity_invalid"],
      ["branchName", "../main", "source_branch_identity_invalid"],
      ["baseSha", undefined, "source_base_identity_invalid"],
      ["baseSha", "A".repeat(40), "source_base_identity_invalid"],
      ["currentHeadSha", undefined, "source_head_identity_invalid"],
      ["currentHeadSha", "not-a-sha", "source_head_identity_invalid"],
      ["firstFailureAt", undefined, "source_failure_timestamp_invalid"],
      ["firstFailureAt", "2026-07-15 00:00:00", "source_failure_timestamp_invalid"],
      ["lastFailureAt", undefined, "source_failure_timestamp_invalid"],
      ["lastFailureAt", "2026-07-15T00:00:00.000Z", "source_failure_timestamp_order_invalid", { firstFailureAt: "2026-07-15T00:30:00.000Z" }],
      ["attemptNumber", 0, "source_attempt_identity_invalid"],
      ["attemptNumber", 1.5, "source_attempt_identity_invalid"],
      ["attemptNumber", 21, "source_attempt_identity_invalid"],
      ["prHeadSha", null, "source_pr_identity_unpaired", { prNumber: 917 }],
      ["prNumber", null, "source_pr_identity_unpaired", { prHeadSha: shaB }],
      ["prHeadSha", "c".repeat(39), "source_pr_identity_invalid"],
      ["issueNumber", 0, "source_issue_identity_invalid"],
      ["runnerProfile", "../default", "source_profile_identity_invalid"],
      ["runnerConfigDigest", "a".repeat(63), "source_immutable_digest_missing"],
      ["originalSupervisorSpecDigest", "b".repeat(63), "source_immutable_digest_missing"],
    ];
    for (const [field, value, reasonCode, extra = {}] of cases) {
      const sourceInput = { ...source(), ...extra, [field]: value };
      const result = evaluateSourceRunEligibility({ config, source: sourceInput });
      assert.equal(result.eligible, false, field);
      assert.equal(result.reasonCode, reasonCode, field);
      assert.equal(result.invalidField, field, field);

      const controller = runOutageResubmissionController({ config, source: sourceInput, dryRun: true, now });
      assert.equal(controller.outcome, "blocked", field);
      assert.equal(controller.reasonCode, reasonCode, field);
      assert.equal(controller.counts.githubMutationCalls, 0, field);
      assert.equal(controller.counts.systemdCalls, 0, field);
      assert.equal(controller.counts.realMutationCalls, 0, field);
      assert.equal(controller.events.some((item) => item.event === "resubmission_planned"), false, field);
    }

    assert.equal(evaluateSourceRunEligibility({ config, source: { ...source(), prNumber: null, prHeadSha: null } }).eligible, true);
    assert.equal(evaluateSourceRunEligibility({ config, source: source() }).eligible, true);

    const exhausted = runOutageResubmissionController({ config, source: { ...source(), attemptNumber: 4 }, dryRun: true, now });
    assert.equal(exhausted.outcome, "exhausted");
    assert.equal(exhausted.reasonCode, "outage_resubmission_attempts_exhausted");
    assert.equal(exhausted.outageState.mutationMarker.attemptNumber, 4);
  } finally {
    config.cleanup();
  }
});

test("controller checks recovery before planning a new child", () => {
  const config = tempConfig();
  try {
    const recoveryState = incompleteRecoveryState();
    const result = runOutageResubmissionController({ config, source: source(), recoveryState, dryRun: true, now });
    assert.equal(result.outcome, "resume_recovery");
    assert.equal(result.reasonCode, "existing_recoverable_state_first");
    assert.equal(result.events.map((item) => item.event).includes("recoverable_state_wins"), true);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("pending outage children reconcile before incomplete source recovery", () => {
  const config = tempConfig();
  try {
    const recoveryState = incompleteRecoveryState();
    const baseState = fixtureOutageState();
    const uncertain = transitionOutageMarker(baseState, {
      status: "submission_uncertain",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000311",
      specDigest: digestB,
      reasonCode: "submission_started",
    });
    let result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      outageState: uncertain,
      existingChildren: [exactChild(uncertain, { runId: uncertain.childSupervisorRunId })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "confirmed_existing_child");
    assert.equal(result.reasonCode, "uncertain_submission_reconciled");
    assert.equal(result.events.some((item) => item.event === "recoverable_state_wins"), false);
    assert(result.events.findIndex((item) => item.event === "outage_marker_reconciled") < result.events.findIndex((item) => item.event === "uncertain_submission_reconciled"));
    assert.equal(result.counts.realMutationCalls, 0);

    result = runOutageResubmissionController({ config, source: source(), recoveryState, outageState: uncertain, existingChildren: [], dryRun: true, now });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "uncertain_submission_requires_reconciliation");
    assert.equal(result.events.some((item) => item.event === "recoverable_state_wins"), false);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("submitted and confirmed outage children win before incomplete source recovery", () => {
  const config = tempConfig();
  try {
    const recoveryState = incompleteRecoveryState();
    const baseState = fixtureOutageState();
    const submitted = transitionOutageMarker(baseState, {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000321",
      specDigest: digestB,
      reasonCode: "child_submission_confirmed",
    });
    let result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      outageState: submitted,
      existingChildren: [exactChild(submitted, { runId: submitted.childSupervisorRunId })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "confirmed_existing_child");
    assert.equal(result.reasonCode, "submitted_child_reconciled");
    assert.equal(result.events.some((item) => item.event === "recoverable_state_wins"), false);

    result = runOutageResubmissionController({ config, source: source(), recoveryState, outageState: submitted, existingChildren: [], dryRun: true, now });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "submitted_child_missing_requires_reconciliation");

    const confirmed = transitionOutageMarker(baseState, {
      status: "confirmed_running",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000322",
      specDigest: digestB,
      reasonCode: "submitted_child_reconciled",
    });
    result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      outageState: confirmed,
      existingChildren: [exactChild(confirmed, { runId: confirmed.childSupervisorRunId, state: "running" })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "observed");
    assert.equal(result.reasonCode, "confirmed_running_child_observed");
    assert.equal(result.events.some((item) => item.event === "recoverable_state_wins"), false);
    assert.equal(result.events.some((item) => item.event === "circuit_checked"), false);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("terminal outage children classify before incomplete source recovery", () => {
  const config = tempConfig();
  try {
    const recoveryState = incompleteRecoveryState();
    const confirmed = transitionOutageMarker(fixtureOutageState(), {
      status: "confirmed_running",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000331",
      specDigest: digestB,
      reasonCode: "submitted_child_reconciled",
    });
    let result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      outageState: confirmed,
      existingChildren: [exactChild(confirmed, { runId: confirmed.childSupervisorRunId, state: "completed", terminalOutcome: "completed" })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "recovered");
    assert.equal(result.reasonCode, "confirmed_child_recovered");
    assert.equal(result.events.some((item) => item.event === "recoverable_state_wins"), false);

    result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      outageState: confirmed,
      existingChildren: [exactChild(confirmed, { runId: confirmed.childSupervisorRunId, state: "failed", terminalOutcome: "failed" })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "confirmed_child_terminal_blocked");
    assert.equal(result.events.some((item) => item.event === "recoverable_state_wins"), false);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("incomplete recovery resumes only after no pending outage child requires action", () => {
  const config = tempConfig();
  try {
    const recoveryState = incompleteRecoveryState();
    let result = runOutageResubmissionController({ config, source: source(), recoveryState, dryRun: true, now });
    assert.equal(result.outcome, "resume_recovery");
    assert.equal(result.reasonCode, "existing_recoverable_state_first");
    assert.ok(result.events.findIndex((item) => item.event === "outage_marker_reconciled") < result.events.findIndex((item) => item.event === "recoverable_state_wins"));

    result = runOutageResubmissionController({ config, source: source(), recoveryState, outageState: fixtureOutageState(), existingChildren: [], dryRun: true, now });
    assert.equal(result.outcome, "resume_recovery");
    assert.equal(result.reasonCode, "existing_recoverable_state_first");
    assert.equal(result.events.some((item) => item.event === "source_eligibility_checked"), false);
    assert.equal(result.events.some((item) => item.event === "circuit_checked"), false);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
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
    assert.equal(result.child.spec.outageResubmission.taskKey, source().taskKey);
    assert.equal(result.child.spec.outageResubmission.currentHeadSha, source().currentHeadSha);
    assert.equal(result.child.spec.outageResubmission.prNumber, source().prNumber);
    assert.equal(result.child.spec.outageResubmission.prHeadSha, source().prHeadSha);
    assert.match(result.child.specSha256, /^[a-f0-9]{64}$/);
  } finally {
    config.cleanup();
  }
});

test("complete child spec identity survives canonical write read and reconciles from disk only", () => {
  const config = tempConfig();
  try {
    const sourceInput = source({ runnerConfigDigest: config.runnerConfigDigest });
    const planned = runOutageResubmissionController({
      config,
      source: sourceInput,
      dryRun: true,
      now,
      childRunId: "supervised-20260715T010000Z-000000000120",
    });
    const state = transitionOutageMarker(planned.outageState, {
      status: "submitted",
      childSupervisorRunId: planned.child.spec.runId,
      specDigest: planned.child.specSha256,
      reasonCode: "child_submission_confirmed",
    });
    const written = writeImmutableRunSpec(planned.child.spec, config.logsRoot);
    assert.equal(written.specSha256, planned.child.specSha256);

    const loaded = readAndVerifyRunSpec(planned.child.spec.runId, planned.child.specSha256, config.logsRoot);
    assert.equal(loaded.spec.outageResubmission.taskKey, sourceInput.taskKey);
    assert.equal(loaded.spec.outageResubmission.currentHeadSha, sourceInput.currentHeadSha);
    assert.equal(loaded.spec.outageResubmission.prNumber, sourceInput.prNumber);
    assert.equal(loaded.spec.outageResubmission.prHeadSha, sourceInput.prHeadSha);

    let result = runOutageResubmissionController({
      config,
      source: sourceInput,
      outageState: state,
      existingChildren: [{ ...loaded.spec, specSha256: loaded.specSha256 }],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "confirmed_existing_child");
    assert.equal(result.reasonCode, "submitted_child_reconciled");
    assert.equal(result.counts.realMutationCalls, 0);

    const confirmed = transitionOutageMarker(state, {
      status: "confirmed_running",
      childSupervisorRunId: planned.child.spec.runId,
      specDigest: planned.child.specSha256,
      reasonCode: "submitted_child_reconciled",
    });
    result = runOutageResubmissionController({
      config,
      source: sourceInput,
      outageState: confirmed,
      existingChildren: [{ ...loaded.spec, specSha256: loaded.specSha256, state: "running" }],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "observed");
    assert.equal(result.reasonCode, "confirmed_running_child_observed");
  } finally {
    config.cleanup();
  }
});

test("child spec digest changes when persisted source identity changes", () => {
  const config = tempConfig();
  try {
    const first = runOutageResubmissionController({ config, source: source(), dryRun: true, now, childRunId: "supervised-20260715T010000Z-000000000121" });
    const changedTask = {
      ...first.child.spec,
      outageResubmission: {
        ...first.child.spec.outageResubmission,
        taskKey: "20260715-9999",
      },
    };
    const changedHead = {
      ...first.child.spec,
      outageResubmission: {
        ...first.child.spec.outageResubmission,
        currentHeadSha: "c".repeat(40),
        prHeadSha: "c".repeat(40),
      },
    };
    assert.notEqual(sha256Text(canonicalJson(changedTask)), first.child.specSha256);
    assert.notEqual(sha256Text(canonicalJson(changedHead)), first.child.specSha256);
  } finally {
    config.cleanup();
  }
});

test("child planning blocks when source runner config digest no longer matches the immutable spec", () => {
  const config = tempConfig();
  try {
    const result = runOutageResubmissionController({
      config,
      source: source({ runnerConfigDigest: digestA }),
      dryRun: true,
      now,
      childRunId: "supervised-20260715T010000Z-000000000123",
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "child_spec_identity_invalid");
    assert.equal(result.counts.realMutationCalls, 0);
    assert.equal(result.events.some((item) => item.event === "child_spec_identity_blocked"), true);
  } finally {
    config.cleanup();
  }
});

test("persisted outage state load failures block before child reconciliation or planning", () => {
  const config = tempConfig();
  try {
    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageStateKey: "c".repeat(64),
      existingChildren: [exactChild(fixtureOutageState())],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_resubmission_state_untrusted");
    assert.equal(result.outageStateLoad.reasonCode, "outage_resubmission_state_missing");
    assert.equal(result.events.some((item) => item.event === "outage_state_load_blocked"), true);
    assert.equal(result.events.some((item) => item.event === "outage_marker_reconciled"), false);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.realMutationCalls, 0);

    const state = fixtureOutageState();
    const statePath = outageResubmissionStatePath(config, state);
    mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
    writeFileSync(statePath, `${JSON.stringify({ ...state, unexpected: true }, null, 2)}\n`, { mode: 0o600 });
    result = runOutageResubmissionController({
      config,
      source: source(),
      outageStateKey: state.correlation,
      existingChildren: [exactChild(state)],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_resubmission_state_untrusted");
    assert.equal(result.outageStateLoad.reasonCode, "outage_resubmission_state_schema_invalid");
    assert.equal(result.events.some((item) => item.event === "outage_marker_reconciled"), false);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("disk-reloaded incomplete historical child specs fail closed without mutable inference", () => {
  const config = tempConfig();
  try {
    const sourceInput = source({ runnerConfigDigest: config.runnerConfigDigest });
    const planned = runOutageResubmissionController({
      config,
      source: sourceInput,
      dryRun: true,
      now,
      childRunId: "supervised-20260715T010000Z-000000000122",
    });
    const state = transitionOutageMarker(planned.outageState, {
      status: "submitted",
      childSupervisorRunId: planned.child.spec.runId,
      specDigest: planned.child.specSha256,
      reasonCode: "child_submission_confirmed",
    });
    const complete = planned.child.spec;
    for (const outageResubmission of [
      { ...complete.outageResubmission, taskKey: undefined },
      { ...complete.outageResubmission, currentHeadSha: undefined },
      { ...complete.outageResubmission, prNumber: null, prHeadSha: null },
    ]) {
      const incomplete = {
        ...complete,
        outageResubmission: Object.fromEntries(Object.entries(outageResubmission).filter(([, value]) => value !== undefined)),
        specSha256: planned.child.specSha256,
      };
      const result = runOutageResubmissionController({
        config,
        source: sourceInput,
        outageState: state,
        existingChildren: [incomplete],
        dryRun: true,
        now,
      });
      assert.equal(result.outcome, "blocked");
      assert.match(result.reasonCode, /^outage_child_(ambiguous|identity_mismatch)_requires_reconciliation$/);
      assert.equal(result.counts.realMutationCalls, 0);
    }
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

test("planned duplicate children block before schedule and planning", () => {
  const config = tempConfig();
  try {
    const planned = fixtureOutageState();
    const childA = exactChild(planned, { runId: "supervised-20260715T010000Z-000000000111" });
    const childB = exactChild(planned, { runId: "supervised-20260715T010000Z-000000000222" });
    const result = runOutageResubmissionController({
      config,
      source: source(),
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
      currentIdentity: currentCompletion({ merged: true }),
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "recovered");
    assert.equal(result.reasonCode, "source_current_pr_merged");
  } finally {
    config.cleanup();
  }
});

test("exact current completion persists nonterminal outage state as recovered", () => {
  const config = tempConfig();
  try {
    for (const [status, identity, reasonCode] of [
      ["planned", currentCompletion({ merged: true }), "source_current_pr_merged"],
      ["planned", currentCompletion({ issueClosed: true, merged: false }), "source_current_issue_closed"],
      ["submitted", currentCompletion({ merged: true }), "source_current_pr_merged"],
      ["confirmed_running", currentCompletion({ issueClosed: true, merged: false }), "source_current_issue_closed"],
    ]) {
      const baseState = fixtureOutageState();
      const state = status === "planned"
        ? baseState
        : transitionOutageMarker(baseState, {
            status,
            childSupervisorRunId: status === "submitted" ? "supervised-20260715T010000Z-000000000401" : "supervised-20260715T010000Z-000000000402",
            specDigest: digestB,
            reasonCode: status === "submitted" ? "child_submission_confirmed" : "submitted_child_reconciled",
          });
      writeOutageResubmissionState(config, state);
      const result = runOutageResubmissionController({
        config,
        source: source(),
        outageState: state,
        existingChildren: [],
        recoveryState: incompleteRecoveryState(),
        currentIdentity: identity,
        dryRun: false,
        now,
      });
      assert.equal(result.outcome, "recovered", status);
      assert.equal(result.reasonCode, reasonCode, status);
      assert.equal(result.durable, true, status);
      assert.equal(result.outageState.status, "recovered", status);
      assert.equal(result.outageState.mutationMarker.reasonCode, reasonCode, status);
      assert.equal(result.notificationIntent.kind, "outage_source_recovered", status);
      assert.equal(result.events.some((item) => item.event === "recoverable_state_wins"), false, status);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, status);
      assert.equal(result.counts.githubMutationCalls, 0, status);
      assert.equal(result.counts.systemdCalls, 0, status);
      assert.equal(result.counts.realMutationCalls, 0, status);

      const loaded = loadOutageResubmissionState(config, state.correlation);
      assert.equal(loaded.ok, true, status);
      assert.equal(loaded.state.status, "recovered", status);
      assert.equal(loaded.state.mutationMarker.reasonCode, reasonCode, status);
    }

    const status = getRunnerStatus(config);
    assert.equal(status.outageResubmission.activeSourceRun, null);
    assert.equal(status.outageResubmission.terminalOutcome, "recovered");
    const health = evaluateAutoRunnerHealth({ logsRoot: config.logsRoot, now, runnerStatus: status });
    assert.equal(health.body.outageResubmission.activeSourceRun, null);
    assert.equal(health.body.outageResubmission.terminalOutcome, "recovered");
  } finally {
    config.cleanup();
  }
});

test("source completion dry-run, repeated terminal, mismatch, and persistence failure are bounded", () => {
  const config = tempConfig();
  try {
    const planned = fixtureOutageState();
    writeOutageResubmissionState(config, planned);
    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: planned,
      currentIdentity: currentCompletion({ merged: true }),
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "recovered");
    assert.equal(result.durable, false);
    assert.equal(loadOutageResubmissionState(config, planned.correlation).state.status, "planned");
    assert.equal(result.counts.realMutationCalls, 0);

    const recovered = transitionOutageMarker(planned, {
      status: "recovered",
      reasonCode: "source_current_pr_merged",
    });
    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: recovered,
      currentIdentity: currentCompletion({ merged: true }),
      dryRun: false,
      now,
    });
    assert.equal(result.outcome, "noop");
    assert.equal(result.reasonCode, "terminal_outage_marker_preserved");
    assert.equal(result.notificationIntent, undefined);
    assert.equal(result.events.some((item) => item.event === "outage_source_completion_recovered"), false);
    assert.equal(result.counts.realMutationCalls, 0);

    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: planned,
      currentIdentity: currentCompletion({ merged: true, prHeadSha: "c".repeat(40) }),
      dryRun: false,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "pr_head_identity_mismatch");
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);

    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: planned,
      currentIdentity: currentCompletion({ issueClosed: true, merged: false }),
      dryRun: false,
      now,
      writeOutageState: () => {
        throw new Error("synthetic_recovered_write_failure");
      },
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_source_recovery_persistence_failed");
    assert.equal(result.outageState, planned);
    assert.equal(result.notificationIntent, undefined);
    assert.equal(loadOutageResubmissionState(config, planned.correlation).state.status, "planned");
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("controller enforces attempt and wall-clock exhaustion without child creation", () => {
  const config = tempConfig();
  try {
    let result = runOutageResubmissionController({ config, source: { ...source(), attemptNumber: 4 }, dryRun: true, now });
    assert.equal(result.outcome, "exhausted");
    assert.equal(result.reasonCode, "outage_resubmission_attempts_exhausted");
    assert.equal(result.outageState.status, "exhausted");
    assert.equal(result.outageState.mutationMarker.reasonCode, "outage_resubmission_attempts_exhausted");
    assert.equal(result.outageState.mutationMarker.attemptNumber, 4);
    assert.equal(result.notificationIntent.kind, "outage_terminal_exhaustion");
    assert.equal(result.durable, false);
    assert.equal(result.events.filter((item) => item.event === "outage_terminal_exhaustion_intent").length, 1);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);

    result = runOutageResubmissionController({
      config,
      source: { ...source(), firstFailureAt: "2026-07-13T00:00:00.000Z", lastFailureAt: "2026-07-13T01:00:00.000Z" },
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "exhausted");
    assert.equal(result.reasonCode, "outage_resubmission_wall_clock_exhausted");
    assert.equal(result.outageState.status, "exhausted");
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("terminal exhaustion rebuilds stale existing marker with current attempt identity", () => {
  const config = tempConfig();
  try {
    const existing = fixtureOutageState();
    writeOutageResubmissionState(config, existing);
    const result = runOutageResubmissionController({
      config,
      source: { ...source(), attemptNumber: 4 },
      outageState: existing,
      dryRun: false,
      now,
    });
    assert.equal(result.outcome, "exhausted");
    assert.equal(result.reasonCode, "outage_resubmission_attempts_exhausted");
    assert.equal(result.durable, true);
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);
    assert.equal(result.outageState.schedule.attemptNumber, 4);
    assert.equal(result.outageState.schedule.maxAttempts, 3);
    assert.equal(result.outageState.mutationMarker.attemptNumber, 4);
    assert.equal(result.outageState.mutationMarker.specDigest, source().originalSupervisorSpecDigest);
    assert.notEqual(result.outageState.mutationMarker.key, existing.mutationMarker.key);
    assert.equal(result.outageState.childSupervisorRunId, null);
    assert.equal(result.notificationIntent.dedupeKey, `${result.outageState.mutationMarker.key}:exhausted:outage_resubmission_attempts_exhausted`);
    assert.equal(result.events.find((item) => item.event === "outage_attempts_exhausted").attemptNumber, 4);

    const loaded = loadOutageResubmissionState(config, existing.correlation);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.state.status, "exhausted");
    assert.equal(loaded.state.schedule.attemptNumber, 4);
    assert.equal(loaded.state.mutationMarker.attemptNumber, 4);
    assert.equal(loaded.state.mutationMarker.key, result.outageState.mutationMarker.key);
    assert.equal(loaded.state.mutationMarker.reasonCode, "outage_resubmission_attempts_exhausted");

    const status = getRunnerStatus(config);
    assert.equal(status.outageResubmission.activeSourceRun, null);
    assert.equal(status.outageResubmission.attemptCount, 4);
    assert.equal(status.outageResubmission.maxAttempts, 3);
    assert.equal(status.outageResubmission.terminalOutcome, "exhausted");
    assert.equal(status.outageResubmission.lastSanitizedReason, "outage_resubmission_attempts_exhausted");
    const health = evaluateAutoRunnerHealth({ logsRoot: config.logsRoot, now, runnerStatus: status });
    assert.equal(health.body.outageResubmission.activeSourceRun, null);
    assert.equal(health.body.outageResubmission.attemptCount, 4);
    assert.equal(health.body.outageResubmission.terminalOutcome, "exhausted");
  } finally {
    config.cleanup();
  }
});

test("wall-clock exhaustion rebuilds existing marker with current attempt identity", () => {
  const config = tempConfig();
  try {
    const existing = fixtureOutageState();
    const result = runOutageResubmissionController({
      config,
      source: { ...source(), attemptNumber: 2, firstFailureAt: "2026-07-13T00:00:00.000Z", lastFailureAt: "2026-07-13T01:00:00.000Z" },
      outageState: existing,
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "exhausted");
    assert.equal(result.reasonCode, "outage_resubmission_wall_clock_exhausted");
    assert.equal(result.outageState.schedule.attemptNumber, 2);
    assert.equal(result.outageState.mutationMarker.attemptNumber, 2);
    assert.notEqual(result.outageState.mutationMarker.key, existing.mutationMarker.key);
    assert.equal(result.events.find((item) => item.event === "outage_wall_clock_exhausted").attemptNumber, 2);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("repeated exhausted invocation is terminal no-op without duplicate notification", () => {
  const config = tempConfig();
  try {
    const exhausted = runOutageResubmissionController({ config, source: { ...source(), attemptNumber: 4 }, dryRun: true, now }).outageState;
    const repeated = runOutageResubmissionController({ config, source: { ...source(), attemptNumber: 4 }, outageState: exhausted, dryRun: true, now });
    assert.equal(repeated.outcome, "noop");
    assert.equal(repeated.reasonCode, "terminal_outage_marker_preserved");
    assert.equal(repeated.notificationIntent, undefined);
    assert.equal(repeated.events.some((item) => item.event === "outage_terminal_exhaustion_intent"), false);
    assert.equal(repeated.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(repeated.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("operator pause defers terminal exhaustion write until next unpaused pass", () => {
  const config = tempConfig();
  try {
    let result = runOutageResubmissionController({ config, source: { ...source(), attemptNumber: 4 }, operatorControl: { pause: true }, dryRun: false, now });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "operator_pause");
    assert.equal(getRunnerStatus(config).outageResubmission.recordCount, 0);

    result = runOutageResubmissionController({ config, source: { ...source(), attemptNumber: 4 }, dryRun: false, now });
    assert.equal(result.outcome, "exhausted");
    assert.equal(loadOutageResubmissionState(config, result.outageState.correlation).state.status, "exhausted");
  } finally {
    config.cleanup();
  }
});

test("exhaustion persistence failure preserves prior state and does not claim durable terminal outcome", () => {
  const config = tempConfig();
  try {
    const existing = fixtureOutageState();
    const result = runOutageResubmissionController({
      config,
      source: { ...source(), attemptNumber: 4 },
      outageState: existing,
      dryRun: false,
      now,
      writeOutageState: () => {
        throw new Error("synthetic_write_failure");
      },
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_exhaustion_persistence_failed");
    assert.equal(result.outageState, existing);
    assert.equal(result.durable, undefined);
    assert.equal(result.notificationIntent, undefined);
    assert.equal(result.counts.realMutationCalls, 0);
    assert.equal(result.events.some((item) => item.event === "outage_exhaustion_persistence_failed"), true);
  } finally {
    config.cleanup();
  }
});

test("existing outage identity drift fails closed before planning or child adoption", () => {
  const config = tempConfig();
  try {
    for (const [label, sourceOverride, expectedField] of [
      ["provider", { failure: { domain: "scanner_service", status: 503 } }, "outageProviderDomain"],
      ["fingerprint", { failure: { domain: "github_api", status: 502 } }, "outageFingerprint"],
      ["class", { failure: { domain: "github_api", reasonCode: "timeout" } }, "outageFingerprint"],
    ]) {
      const result = runOutageResubmissionController({
        config,
        source: source(sourceOverride),
        outageState: fixtureOutageState(),
        existingChildren: [exactChild(fixtureOutageState())],
        dryRun: true,
        now,
      });
      assert.equal(result.outcome, "blocked", label);
      assert.equal(result.reasonCode, "outage_resubmission_identity_drift", label);
      assert.equal(result.drift.field, expectedField, label);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, label);
      assert.equal(result.events.some((item) => item.event === "circuit_checked"), false, label);
      assert.equal(result.events.some((item) => item.event === "existing_child_reused"), false, label);
      assert.equal(result.counts.githubMutationCalls, 0, label);
      assert.equal(result.counts.systemdCalls, 0, label);
      assert.equal(result.counts.realMutationCalls, 0, label);
    }
  } finally {
    config.cleanup();
  }
});

test("outage correlation verifier requires canonical outage identity keys", () => {
  const state = fixtureOutageState();
  assert.equal(verifyOutageCorrelation(state, {
    issueNumber: 913,
    outageProviderDomain: "github_api",
    outageFingerprint: githubApi503Fingerprint,
    outageClass: "github_api_5xx",
  }).ok, true);
  assert.deepEqual(verifyOutageCorrelation(state, { issueNumber: 913, providerDomain: "github_api" }), {
    ok: false,
    reasonCode: "outage_resubmission_identity_drift",
    field: "outageProviderDomain",
  });
  assert.equal(verifyOutageCorrelation(state, { outageProviderDomain: "scanner_service" }).field, "outageProviderDomain");
  assert.equal(verifyOutageCorrelation(state, { outageFingerprint: githubApi502Fingerprint }).field, "outageFingerprint");
  assert.equal(verifyOutageCorrelation(state, { outageClass: "github_api_timeout" }).field, "outageClass");
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
    runnerConfigDigest: profileConfigDigest,
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
      outageProviderDomain: "github_api",
      outageFingerprint: githubApi503Fingerprint,
    },
    outage: {
      providerDomain: "github_api",
      outageClass: "github_api_5xx",
      outageFingerprint: githubApi503Fingerprint,
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

function incompleteRecoveryState() {
  return createInitialRecoveryState({
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

function currentCompletion(overrides = {}) {
  return {
    merged: false,
    issueClosed: false,
    issueNumber: source().issueNumber,
    branchName: source().branchName,
    baseSha: source().baseSha,
    currentHeadSha: source().currentHeadSha,
    prNumber: source().prNumber,
    prHeadSha: source().prHeadSha,
    ...overrides,
  };
}

function tempConfig({ enabled = true } = {}) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-outage-controller-"));
  const profilePath = resolveProfile("default", logsRoot).runnerConfigPath;
  mkdirSync(path.dirname(profilePath), { recursive: true, mode: 0o700 });
  writeFileSync(profilePath, profileConfig, { mode: 0o600 });
  return {
    logsRoot,
    runnerConfigDigest: profileConfigDigest,
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
