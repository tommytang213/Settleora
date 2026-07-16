import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runOutageResubmissionController as runController, evaluateSourceRunEligibility } from "../supervisor/outage-resubmission-controller.mjs";
import {
  createOutageResubmissionState,
  loadOutageResubmissionState,
  outageResubmissionStatePath,
  transitionOutageMarker,
  verifyOutageCorrelation,
  writeOutageResubmissionState,
} from "../lib/outage-resubmission-state.mjs";
import { outageFingerprint } from "../lib/outage-resubmission-policy.mjs";
import {
  bindRecoveryEvidence,
  createInitialRecoveryState,
  invalidateEvidenceForHeadChange,
  loadRecoveryState,
  writeRecoveryState,
} from "../lib/recovery-state.mjs";
import { canonicalJson, readAndVerifyRunSpec, resolveProfile, sha256Text, writeImmutableRunSpec } from "../supervisor/run-spec.mjs";
import { readSupervisorState } from "../supervisor/supervisor-state.mjs";
import { getRunnerStatus } from "../lib/control-plane.mjs";
import { evaluateAutoRunnerHealth } from "../lib/health-service.mjs";
import { monitoringEvents, recordMonitoringEvent } from "../supervisor/monitoring-outbox.mjs";

const shaA = "a".repeat(40);
const shaB = "b".repeat(40);
const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
const digestC = "c".repeat(64);
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
const profileConfig = '{"trustedRealRunApproved":true,"allowExistingPrRecovery":true}\n';
const profileConfigDigest = "1e0f2e46bf002c58a643e4fc8e902fc70094d72f8f7a3c3136ac1bfe20d67b63";
const now = new Date("2026-07-15T01:00:00.000Z");

function runOutageResubmissionController(input = {}) {
  if (input.omitCurrentIdentityForTest === true || input.currentIdentity !== undefined) {
    const { omitCurrentIdentityForTest, ...rest } = input;
    return runController(rest);
  }
  const sourceInput = input.source || source();
  const currentIdentity = sourceInput.prNumber === null && sourceInput.prHeadSha === null
    ? { branchName: sourceInput.branchName, baseSha: sourceInput.baseSha, currentHeadSha: sourceInput.currentHeadSha }
    : liveIdentityForSource(sourceInput);
  return runController({ ...input, currentIdentity });
}

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

test("source eligibility accepts normalized github api outage evidence without live mutation", () => {
  const config = tempConfig();
  try {
    const normalized = source({ failure: { domain: "github_api", reasonCode: "api_5xx" } });
    const eligible = evaluateSourceRunEligibility({ config, source: normalized });
    assert.equal(eligible.eligible, true);
    assert.equal(eligible.classification.outageClass, "github_api_5xx");
    assert.equal(eligible.classification.rawBodyAccepted, false);
    assert.match(eligible.classification.fingerprint, /^[a-f0-9]{64}$/);

    const planned = runOutageResubmissionController({
      config,
      source: normalized,
      recoveryState: incompleteRecoveryState(),
      dryRun: true,
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000991",
    });
    assert.equal(planned.outcome, "planned");
    assert.equal(planned.reasonCode, "dry_run_no_mutation");
    assert.equal(planned.outageState.outage.outageClass, "github_api_5xx");
    assert.equal(planned.outageState.outage.providerDomain, "github_api");
    assert.equal(planned.counts.githubMutationCalls, 0);
    assert.equal(planned.counts.systemdCalls, 0);
    assert.equal(planned.counts.realMutationCalls, 0);

    const unknown = evaluateSourceRunEligibility({ config, source: source({ failure: { domain: "github_api", reasonCode: "not_a_real_reason" } }) });
    assert.equal(unknown.eligible, false);
    assert.equal(unknown.reasonCode, "source_failure_nonretryable");
    assert.equal(unknown.classification.outageClass, "unknown_ambiguous_failure");

    for (const failure of [
      { domain: "github_api", status: 401, reasonCode: "api_5xx" },
      { domain: "github_api", status: 403, reasonCode: "api_5xx" },
      { domain: "github_api", status: 404, reasonCode: "api_5xx" },
    ]) {
      const blocked = runOutageResubmissionController({ config, source: source({ failure }), recoveryState: incompleteRecoveryState(), dryRun: true, now });
      assert.equal(blocked.outcome, "blocked");
      assert.equal(blocked.reasonCode, "source_failure_nonretryable");
      assert.equal(blocked.counts.githubMutationCalls, 0);
      assert.equal(blocked.counts.systemdCalls, 0);
      assert.equal(blocked.counts.realMutationCalls, 0);
    }
  } finally {
    config.cleanup();
  }
});

test("source eligibility accepts trusted github actions rate limits without live mutation", () => {
  const config = tempConfig();
  try {
    const trustedHeaders = { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1784073900" };
    const acceptedCases = [
      [{ domain: "github_actions", status: 429 }, "github_actions_rate_limit"],
      [{ domain: "github_actions", status: 403, trustedHeaders }, "github_actions_rate_limit"],
      [{ domain: "github_actions", status: 403, trustedRateLimit: true }, "github_actions_rate_limit"],
      [{ domain: "github_actions", status: 429, body: "rate limit maybe from raw body" }, "github_actions_rate_limit"],
    ];

    for (const [failure, expectedClass] of acceptedCases) {
      const sourceInput = source({ failure });
      const eligible = evaluateSourceRunEligibility({ config, source: sourceInput });
      assert.equal(eligible.eligible, true, expectedClass);
      assert.equal(eligible.classification.outageClass, expectedClass);
      assert.equal(eligible.classification.providerDomain, "github_actions");
      assert.equal(eligible.classification.rawBodyAccepted, false);

      const planned = runOutageResubmissionController({
        config,
        source: sourceInput,
        recoveryState: incompleteRecoveryState(),
        dryRun: true,
        now,
        rng: () => 0.5,
        childRunId: "supervised-20260715T010000Z-000000000994",
      });
      assert.equal(planned.outcome, "planned", expectedClass);
      assert.equal(planned.reasonCode, "dry_run_no_mutation", expectedClass);
      assert.equal(planned.outageState.outage.outageClass, expectedClass);
      assert.equal(planned.outageState.outage.providerDomain, "github_actions");
      assert.equal(planned.counts.githubMutationCalls, 0);
      assert.equal(planned.counts.systemdCalls, 0);
      assert.equal(planned.counts.realMutationCalls, 0);
    }

    const blockedCases = [
      [{ domain: "github_actions", status: 403 }, "forbidden_403"],
      [{ domain: "github_actions", status: 401 }, "auth_401"],
      [{ domain: "github_actions", status: 404 }, "not_found_404"],
      [{ domain: "github_actions", status: 429, reasonCode: "missing_secret" }, "missing_or_invalid_secret_config"],
      [{ domain: "github_actions", status: 403, trustedHeaders, reasonCode: "manual_gate" }, "manual_authority_destructive_decision"],
      [{ domain: "unknown", status: 429 }, "unknown_ambiguous_failure"],
    ];
    for (const [failure, expectedClass] of blockedCases) {
      const blocked = runOutageResubmissionController({
        config,
        source: source({ failure }),
        recoveryState: incompleteRecoveryState(),
        dryRun: true,
        now,
      });
      assert.equal(blocked.outcome, "blocked", expectedClass);
      assert.equal(blocked.reasonCode, "source_failure_nonretryable", expectedClass);
      assert.equal(blocked.classification.outageClass, expectedClass);
      assert.equal(blocked.events.some((item) => item.event === "resubmission_planned"), false);
      assert.equal(blocked.counts.githubMutationCalls, 0);
      assert.equal(blocked.counts.systemdCalls, 0);
      assert.equal(blocked.counts.realMutationCalls, 0);
    }
  } finally {
    config.cleanup();
  }
});

test("source eligibility blocks explicit terminal reasons even with trusted retryable evidence", () => {
  const config = tempConfig();
  try {
    const terminal = source({
      failure: {
        domain: "github_api",
        status: 403,
        reasonCode: "missing_secret",
        trustedHeaders: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1784073900" },
      },
    });
    const ineligible = evaluateSourceRunEligibility({ config, source: terminal });
    assert.equal(ineligible.eligible, false);
    assert.equal(ineligible.reasonCode, "source_failure_nonretryable");
    assert.equal(ineligible.classification.outageClass, "missing_or_invalid_secret_config");

    const blocked = runOutageResubmissionController({
      config,
      source: terminal,
      recoveryState: incompleteRecoveryState(),
      dryRun: true,
      now,
      childRunId: "supervised-20260715T010000Z-000000000992",
    });
    assert.equal(blocked.outcome, "blocked");
    assert.equal(blocked.reasonCode, "source_failure_nonretryable");
    assert.equal(blocked.classification.outageClass, "missing_or_invalid_secret_config");
    assert.equal(blocked.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(blocked.events.some((item) => item.event === "dry_run_child_spec_planned"), false);
    assert.equal(blocked.counts.githubMutationCalls, 0);
    assert.equal(blocked.counts.systemdCalls, 0);
    assert.equal(blocked.counts.realMutationCalls, 0);

    for (const failure of [
      { domain: "github_api", status: 403, trustedRateLimit: true },
      { domain: "github_api", reasonCode: "api_5xx" },
    ]) {
      const planned = runOutageResubmissionController({
        config,
        source: source({ failure }),
        recoveryState: incompleteRecoveryState(),
        dryRun: true,
        now,
        childRunId: "supervised-20260715T010000Z-000000000993",
      });
      assert.equal(planned.outcome, "planned");
      assert.equal(planned.reasonCode, "dry_run_no_mutation");
      assert.equal(planned.counts.githubMutationCalls, 0);
      assert.equal(planned.counts.systemdCalls, 0);
      assert.equal(planned.counts.realMutationCalls, 0);
    }
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
    assert.equal(result.outcome, "planned");
    assert.equal(result.reasonCode, "dry_run_no_mutation");
    assert.equal(result.child.spec.recoveryOnlyTarget.taskKey, source().taskKey);
    assert.equal(result.child.spec.recoveryOnlyTarget.issueNumber, source().issueNumber);
    assert.equal(result.child.spec.recoveryOnlyTarget.currentHeadSha, source().currentHeadSha);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("recovery capability false or omitted blocks new outage child before side effects", () => {
  const cases = [
    ["omitted", tempConfig({ allowExistingPrRecovery: undefined })],
    ["explicit false", tempConfig({ allowExistingPrRecovery: false })],
  ];
  for (const [label, config] of cases) {
    try {
      const beforeFiles = listRelativeFiles(config.logsRoot);
      const result = runOutageResubmissionController({
        config,
        source: source(),
        recoveryState: incompleteRecoveryState(),
        dryRun: false,
        now,
        rng: () => 0.5,
        childRunId: "supervised-20260715T010000Z-000000000124",
      });
      assert.equal(result.outcome, "blocked", label);
      assert.equal(result.reasonCode, "recoverable_state_requires_explicit_recovery_capability", label);
      assert.equal(result.child, undefined, label);
      assert.equal(result.childRunId, undefined, label);
      assert.equal(result.outageState, undefined, label);
      assert.equal(result.events.some((item) => item.event === "outage_recovery_capability_blocked"), true, label);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, label);
      assert.equal(result.events.some((item) => item.event === "outage_recovery_target_blocked"), false, label);
      assert.equal(result.events.some((item) => item.event === "dry_run_child_spec_planned"), false, label);
      assert.equal(result.counts.githubMutationCalls, 0, label);
      assert.equal(result.counts.systemdCalls, 0, label);
      assert.equal(result.counts.realMutationCalls, 0, label);
      assert.deepEqual(listRelativeFiles(config.logsRoot), beforeFiles, label);
    } finally {
      config.cleanup();
    }
  }
});

test("pending outage children reconcile before incomplete source recovery", () => {
  const config = tempConfig({ allowExistingPrRecovery: false });
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
  const config = tempConfig({ allowExistingPrRecovery: false });
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
  const config = tempConfig({ allowExistingPrRecovery: false });
  try {
    const recoveryState = incompleteRecoveryState();
    const baseState = fixtureOutageState();
    const submitted = transitionOutageMarker(baseState, {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000330",
      specDigest: digestB,
      reasonCode: "child_submission_confirmed",
    });
    let result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      outageState: submitted,
      existingChildren: [exactChild(submitted, { runId: submitted.childSupervisorRunId, state: "failed", terminalOutcome: "failed" })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "confirmed_child_terminal_blocked");
    assert.equal(result.outageState.mutationMarker.status, "blocked");
    assert.equal(result.events.some((item) => item.event === "submitted_terminal_child_classified"), true);
    assert.equal(result.events.some((item) => item.event === "submitted_child_reconciled"), false);

    const uncertain = transitionOutageMarker(baseState, {
      status: "submission_uncertain",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000329",
      specDigest: digestB,
      reasonCode: "submission_started",
    });
    result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      outageState: uncertain,
      existingChildren: [exactMergedChild(config, uncertain, { runId: uncertain.childSupervisorRunId })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "recovered");
    assert.equal(result.reasonCode, "confirmed_child_recovered");
    assert.equal(result.outageState.mutationMarker.status, "recovered");
    assert.equal(result.events.some((item) => item.event === "uncertain_terminal_child_classified"), true);
    assert.equal(result.events.some((item) => item.event === "uncertain_submission_reconciled"), false);

    const confirmed = transitionOutageMarker(baseState, {
      status: "confirmed_running",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000331",
      specDigest: digestB,
      reasonCode: "submitted_child_reconciled",
    });
    result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      outageState: confirmed,
      existingChildren: [exactMergedChild(config, confirmed, { runId: confirmed.childSupervisorRunId })],
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

test("incomplete recovery target plans only after no pending outage child requires action", () => {
  const config = tempConfig();
  try {
    const recoveryState = incompleteRecoveryState();
    let result = runOutageResubmissionController({ config, source: source(), recoveryState, dryRun: true, now });
    assert.equal(result.outcome, "planned");
    assert.equal(result.reasonCode, "dry_run_no_mutation");
    assert.ok(result.events.findIndex((item) => item.event === "outage_marker_reconciled") < result.events.findIndex((item) => item.event === "resubmission_planned"));

    result = runOutageResubmissionController({ config, source: source(), recoveryState, outageState: fixtureOutageState(), existingChildren: [], dryRun: true, now });
    assert.equal(result.outcome, "planned");
    assert.equal(result.reasonCode, "dry_run_no_mutation");
    assert.equal(result.events.some((item) => item.event === "source_eligibility_checked"), true);
    assert.equal(result.events.some((item) => item.event === "circuit_checked"), true);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), true);
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
      recoveryState: incompleteRecoveryState(),
      currentIdentity: { branchName: source().branchName, baseSha: shaA, currentHeadSha: shaB, prNumber: 917, prHeadSha: shaB },
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
    assert.equal(JSON.parse(readFileSync(resolveProfile(result.child.spec.profile, config.logsRoot).runnerConfigPath, "utf8")).allowExistingPrRecovery, true);
    assert.match(result.child.specSha256, /^[a-f0-9]{64}$/);
  } finally {
    config.cleanup();
  }
});

test("failed outage child submission terminalizes child supervisor state", () => {
  const config = tempConfig();
  try {
    const result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState: incompleteRecoveryState(),
      dryRun: false,
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000998",
      startUserUnit: (runId) => ({
        ok: false,
        unitName: `settleora-auto-runner@${runId}.service`,
        state: "submission_failed",
        status: 1,
        stderr: "synthetic systemd failure with local path /tmp/should-not-persist",
      }),
    });

    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "child_submission_failed");
    assert.equal(result.outageState.status, "blocked");
    assert.equal(result.outageState.mutationMarker.status, "blocked");
    assert.equal(result.outageState.childSupervisorRunId, result.child.spec.runId);
    assert.equal(result.counts.systemdCalls, 1);
    assert.equal(result.counts.realMutationCalls, 1);

    const childState = readSupervisorState(result.child.spec.runId, config.logsRoot);
    assert.equal(childState.found, true);
    assert.equal(childState.state.state, "submission_failed");
    assert.equal(childState.state.parentSupervisorRunId, source().supervisorRunId);
    assert.equal(childState.state.terminalReason, "child_submission_failed");
    assert.equal(childState.state.systemdStatus, 1);
    assert.equal(childState.state.systemdUnitName, `settleora-auto-runner@${result.child.spec.runId}.service`);
    assert.equal("stderr" in childState.state, false);
  } finally {
    config.cleanup();
  }
});

test("successful outage child submission persists expected spec digest for worker verification", () => {
  const config = tempConfig();
  try {
    const result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState: incompleteRecoveryState(),
      dryRun: false,
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000997",
      startUserUnit: (runId) => ({
        ok: true,
        unitName: `settleora-auto-runner@${runId}.service`,
        state: "submitted",
      }),
    });

    assert.equal(result.outcome, "submitted");
    assert.equal(result.reasonCode, "child_submission_confirmed");
    const childState = readSupervisorState(result.child.spec.runId, config.logsRoot);
    assert.equal(childState.found, true);
    assert.equal(childState.state.state, "submitted");
    assert.equal(childState.state.parentSupervisorRunId, source().supervisorRunId);
    assert.equal(childState.state.specSha256, result.child.specSha256);
    assert.equal(readAndVerifyRunSpec(result.child.spec.runId, childState.state.specSha256, config.logsRoot).spec.runId, result.child.spec.runId);
  } finally {
    config.cleanup();
  }
});

test("child submission persists outage binding into recovery state before child artifacts", () => {
  const config = tempConfig();
  try {
    const recoveryState = incompleteRecoveryState();
    assert.equal(recoveryState.outageResubmission, null);
    writeRecoveryState(config, recoveryState);
    const result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      dryRun: false,
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000996",
      startUserUnit: (runId) => ({ ok: true, unitName: `settleora-auto-runner@${runId}.service`, state: "submitted" }),
    });

    assert.equal(result.outcome, "submitted");
    assert.equal(result.events.some((item) => item.event === "outage_recovery_binding_persisted"), true);
    const loadedRecovery = loadRecoveryState(config, recoveryState);
    assert.equal(loadedRecovery.ok, true);
    assert.deepEqual(result.child.spec.recoveryOnlyTarget, {
      taskKey: loadedRecovery.state.outageResubmission.taskKey,
      issueNumber: loadedRecovery.state.outageResubmission.issueNumber,
      branchName: loadedRecovery.state.outageResubmission.branchName,
      baseSha: loadedRecovery.state.outageResubmission.baseSha,
      currentHeadSha: loadedRecovery.state.outageResubmission.currentHeadSha,
      prNumber: loadedRecovery.state.outageResubmission.prNumber,
      prHeadSha: loadedRecovery.state.outageResubmission.prHeadSha,
      runnerRunId: loadedRecovery.state.outageResubmission.runnerRunId,
      supervisorRunId: loadedRecovery.state.outageResubmission.supervisorRunId,
      originalSupervisorSpecDigest: loadedRecovery.state.outageResubmission.originalSupervisorSpecDigest,
      markerKey: loadedRecovery.state.outageResubmission.markerKey,
      outageFingerprint: loadedRecovery.state.outageResubmission.outageFingerprint,
      attemptNumber: loadedRecovery.state.outageResubmission.attemptNumber,
    });
    assert.equal(readSupervisorState(result.child.spec.runId, config.logsRoot).found, true);
    assert.equal(JSON.stringify(loadedRecovery.state).includes("raw"), false);
    assert.equal(JSON.stringify(loadedRecovery.state).includes("secret"), false);
  } finally {
    config.cleanup();
  }
});

test("recovery binding persistence failure blocks before child mutation", () => {
  const config = tempConfig();
  try {
    const beforeFiles = listRelativeFiles(config.logsRoot);
    const result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState: incompleteRecoveryState(),
      dryRun: false,
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000995",
      writeRecoveryState: () => {
        throw new Error("synthetic binding write failure with /tmp/path and raw body");
      },
      startUserUnit: () => {
        throw new Error("must_not_start");
      },
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "recovery_outage_binding_persistence_failed");
    assert.equal(result.child, undefined);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);
    assert.deepEqual(listRelativeFiles(config.logsRoot), beforeFiles);
    assert.equal(JSON.stringify(result.events).includes("/tmp/path"), false);
    assert.equal(JSON.stringify(result.events).includes("raw body"), false);
  } finally {
    config.cleanup();
  }
});

test("identical recovery binding is idempotent and conflicting binding blocks child submission", () => {
  const config = tempConfig();
  const conflictConfig = tempConfig();
  try {
    const dry = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState: incompleteRecoveryState(),
      dryRun: true,
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000994",
    });
    let recoveryState = incompleteRecoveryState({ outageResubmission: dry.child.spec.recoveryOnlyTarget });
    writeRecoveryState(config, recoveryState);
    let result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      dryRun: false,
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000993",
      startUserUnit: (runId) => ({ ok: true, unitName: `settleora-auto-runner@${runId}.service`, state: "submitted" }),
    });
    assert.equal(result.outcome, "submitted");
    assert.equal(result.events.some((item) => item.event === "outage_recovery_binding_preserved"), true);

    recoveryState = incompleteRecoveryState({ outageResubmission: { ...dry.child.spec.recoveryOnlyTarget, markerKey: "f".repeat(64) } });
    result = runOutageResubmissionController({
      config: conflictConfig,
      source: source(),
      recoveryState,
      dryRun: false,
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000992",
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "recovery_outage_binding_conflict");
    assert.equal(result.events.some((item) => item.event === "outage_recovery_binding_blocked"), true);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
    conflictConfig.cleanup();
  }
});

test("complete child spec identity survives canonical write read and reconciles from disk only", () => {
  const config = tempConfig();
  try {
    const sourceInput = source({ runnerConfigDigest: config.runnerConfigDigest });
    const planned = runOutageResubmissionController({
      config,
      source: sourceInput,
      recoveryState: incompleteRecoveryState(),
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
    const first = runOutageResubmissionController({ config, source: source(), recoveryState: incompleteRecoveryState(), dryRun: true, now, childRunId: "supervised-20260715T010000Z-000000000121" });
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
      recoveryState: incompleteRecoveryState(),
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
    assert.equal(result.reasonCode, "outage_resubmission_state_key_conflict");
    assert.match(result.canonicalStateKey, /^[a-f0-9]{64}$/);
    assert.equal(result.events.some((item) => item.event === "outage_state_key_conflict_blocked"), true);
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
    assert.equal(result.outageStateInventory.reasonCode, "malformed_state");
    assert.equal(result.events.some((item) => item.event === "outage_state_inventory_blocked"), true);
    assert.equal(result.events.some((item) => item.event === "outage_marker_reconciled"), false);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("canonical persisted outage state loads by source correlation before planning", () => {
  const config = tempConfig();
  try {
    const baseState = fixtureOutageState();
    const submitted = transitionOutageMarker(baseState, {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000431",
      specDigest: digestB,
      reasonCode: "child_submission_confirmed",
    });
    writeOutageResubmissionState(config, submitted);

    let result = runOutageResubmissionController({
      config,
      source: source(),
      existingChildren: [exactChild(submitted, { runId: submitted.childSupervisorRunId, state: "running" })],
      dryRun: true,
      now,
      childRunId: "supervised-20260715T010000Z-000000000432",
    });
    assert.equal(result.outcome, "confirmed_existing_child");
    assert.equal(result.reasonCode, "submitted_child_reconciled");
    assert.equal(result.outageState.childSupervisorRunId, submitted.childSupervisorRunId);
    assert.equal(result.events.some((item) => item.event === "canonical_outage_state_loaded"), true);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.childRunId, submitted.childSupervisorRunId);
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);

    result = runOutageResubmissionController({
      config,
      source: source(),
      outageStateKey: submitted.correlation,
      existingChildren: [exactMergedChild(config, submitted, { runId: submitted.childSupervisorRunId })],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "recovered");
    assert.equal(result.reasonCode, "confirmed_child_recovered");
    assert.equal(result.events.some((item) => item.event === "canonical_outage_state_loaded"), true);
    assert.equal(result.events.some((item) => item.event === "submitted_child_reconciled"), false);
  } finally {
    config.cleanup();
  }
});

test("invalid canonical outage inventory blocks controller without explicit state key", () => {
  const config = tempConfig();
  try {
    const state = fixtureOutageState();
    writeOutageResubmissionState(config, state);
    const root = path.dirname(outageResubmissionStatePath(config, state));
    writeFileSync(path.join(root, `${"f".repeat(64)}.json`), "{not-json", { mode: 0o600 });

    const result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState: incompleteRecoveryState(),
      existingChildren: [exactChild(state)],
      dryRun: true,
      now,
    });

    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_resubmission_state_untrusted");
    assert.deepEqual(result.outageStateInventory, {
      readStatus: "malformed_state",
      reasonCode: "malformed_state",
      operatorActionRequired: true,
      totalRecordCount: 2,
      validRecordCount: 1,
      invalidRecordCount: 1,
    });
    assert.equal(result.events.some((item) => item.event === "outage_state_inventory_blocked"), true);
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
      recoveryState: incompleteRecoveryState(),
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

test("planned markers terminalize exact terminal children without confirmed_running intermediate", () => {
  const config = tempConfig();
  try {
    const terminalCases = [
      ["completed", { state: "completed", terminalOutcome: "completed" }, "recovered", "confirmed_child_recovered"],
      ["failed", { state: "failed", terminalOutcome: "failed" }, "blocked", "confirmed_child_terminal_blocked"],
      ["blocked", { state: "blocked", terminalOutcome: "blocked" }, "blocked", "confirmed_child_terminal_blocked"],
      ["partial", { state: "partial", terminalOutcome: "partial" }, "blocked", "confirmed_child_terminal_blocked"],
      ["cancelled", { state: "cancelled", terminalOutcome: "cancelled" }, "blocked", "confirmed_child_terminal_blocked"],
      ["terminal boolean", { terminal: true, terminalOutcome: "failed" }, "blocked", "confirmed_child_terminal_blocked"],
    ];

    for (const [label, childStatus, outcome, reasonCode] of terminalCases) {
      const planned = fixtureOutageState();
      let child = exactChild(planned, { runId: "supervised-20260715T010000Z-000000000341", ...childStatus });
      if (label === "completed") {
        child = exactMergedChild(config, planned, { runId: "supervised-20260715T010000Z-000000000341" });
      }
      let result = runOutageResubmissionController({
        config,
        source: source(),
        outageState: planned,
        recoveryState: incompleteRecoveryState(),
        existingChildren: [child],
        dryRun: false,
        now,
        childRunId: "supervised-20260715T010000Z-000000000342",
        startUserUnit: () => {
          throw new Error("must_not_start");
        },
      });
      assert.equal(result.outcome, outcome, label);
      assert.equal(result.reasonCode, reasonCode, label);
      assert.equal(result.outageState.mutationMarker.status, outcome, label);
      assert.notEqual(result.outageState.mutationMarker.reasonCode, "planned_child_reconciled", label);
      assert.equal(result.events.some((item) => item.event === "planned_terminal_child_classified"), true, label);
      assert.equal(result.events.some((item) => item.event === "planned_child_reconciled"), false, label);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, label);
      assert.equal(result.counts.githubMutationCalls, 0, label);
      assert.equal(result.counts.systemdCalls, 0, label);
      assert.equal(result.counts.realMutationCalls, 0, label);

      const repeated = runOutageResubmissionController({
        config,
        source: source(),
        outageState: result.outageState,
        recoveryState: incompleteRecoveryState(),
        existingChildren: [child],
        dryRun: false,
        now,
      });
      assert.equal(repeated.outcome, "noop", label);
      assert.equal(repeated.reasonCode, "terminal_outage_marker_preserved", label);
      assert.equal(repeated.events.some((item) => item.event === "planned_child_reconciled"), false, label);
      assert.equal(repeated.counts.realMutationCalls, 0, label);
    }
  } finally {
    config.cleanup();
  }
});

test("completed terminal child requires exact trusted merge proof", () => {
  const cases = [
    ["no summary", null],
    ["wrong child run", { summaryOverrides: { supervisorRunId: "supervised-20260715T010000Z-000000000999" } }],
    ["wrong supervisor run", { childOverrides: { runnerRunId: "run-2026-07-15T010100Z" }, summaryOverrides: { supervisorRunId: "supervised-20260715T010000Z-000000000998" } }],
    ["missing issue", { iterationMutator: (iteration) => { delete iteration.issue; } }],
    ["null issue", { iterationOverrides: { issue: null } }],
    ["malformed issue", { iterationOverrides: { issue: { number: "913" } } }],
    ["no matching source iteration", { iterations: [mergedSummaryIteration(source({ issueNumber: 914 }))] }],
    ["multiple matching iterations", { iterations: [mergedSummaryIteration(), mergedSummaryIteration(source(), { index: 2 })] }],
    ["wrong issue", { iterations: [mergedSummaryIteration(source({ issueNumber: 914 }))] }],
    ["missing pr", { iterationOverrides: { pr: {}, autoMerge: { attempted: true, result: "merged", prHeadSha: shaB, mergeSha: "c".repeat(40) } } }],
    ["null pr", { iterationOverrides: { pr: null, autoMerge: { attempted: true, result: "merged", prHeadSha: shaB, mergeSha: "c".repeat(40) } } }],
    ["malformed pr", { iterationOverrides: { pr: { number: "917", headRefName: source().branchName, headRefOid: shaB }, autoMerge: { attempted: true, result: "merged", prHeadSha: shaB, mergeSha: "c".repeat(40) } } }],
    ["wrong pr", { iterations: [mergedSummaryIteration(source({ prNumber: 918 }))] }],
    ["missing branch", { iterationMutator: (iteration) => { delete iteration.branchName; delete iteration.pr.headRefName; } }],
    ["null branch", { iterationOverrides: { branchName: null, pr: { number: 917, headRefName: null, headRefOid: shaB, baseRefName: "main", state: "MERGED" } } }],
    ["empty branch", { iterationOverrides: { branchName: " " } }],
    ["wrong branch", { iterationOverrides: { branchName: "feature/auto-913-other-branch" } }],
    ["missing base", { iterationMutator: (iteration) => { delete iteration.baseOriginMainSha; } }],
    ["null base", { iterationOverrides: { baseOriginMainSha: null } }],
    ["malformed base", { iterationOverrides: { baseOriginMainSha: "not-a-sha" } }],
    ["wrong base", { iterationOverrides: { baseOriginMainSha: "d".repeat(40) } }],
    ["missing current head", { iterationMutator: (iteration) => { delete iteration.runnerCreatedCommitSha; delete iteration.expectedHeadSha; delete iteration.pr.headRefOid; delete iteration.pr.headSha; delete iteration.autoMerge.prHeadSha; delete iteration.autoMerge.headSha; } }],
    ["null current head", { iterationOverrides: { runnerCreatedCommitSha: null, pr: { number: 917, headRefName: source().branchName, headRefOid: null, baseRefName: "main", state: "MERGED" }, autoMerge: { attempted: true, result: "merged", prNumber: 917, prHeadSha: null, mergeSha: "c".repeat(40) } } }],
    ["malformed current head", { iterationOverrides: { runnerCreatedCommitSha: "not-a-sha", pr: { number: 917, headRefName: source().branchName, headRefOid: "not-a-sha", baseRefName: "main", state: "MERGED" }, autoMerge: { attempted: true, result: "merged", prNumber: 917, prHeadSha: "not-a-sha", mergeSha: "c".repeat(40) } } }],
    ["wrong pr head", { iterationOverrides: { runnerCreatedCommitSha: shaA, pr: { number: 917, headRefName: source().branchName, headRefOid: shaA } } }],
    ["stale head", { iterationOverrides: { runnerCreatedCommitSha: shaA, pr: { number: 917, headRefName: source().branchName, headRefOid: shaA, baseRefName: "main", state: "MERGED" }, autoMerge: { attempted: true, result: "merged", prNumber: 917, prHeadSha: shaA, mergeSha: "c".repeat(40) } } }],
    ["malformed pr head", { iterationOverrides: { autoMerge: { attempted: true, result: "merged", prNumber: 917, prHeadSha: "not-a-sha", mergeSha: "c".repeat(40) } } }],
    ["partial pr pair", { iterationOverrides: { autoMerge: { attempted: true, result: "merged", prNumber: 917, mergeSha: "c".repeat(40) } }, iterationMutator: (iteration) => { delete iteration.runnerCreatedCommitSha; delete iteration.pr.headRefOid; } }],
    ["missing stop reason", { summaryMutator: (summary) => { delete summary.stopReason; } }],
    ["null stop reason", { stopReason: null }],
    ["unknown stop reason", { stopReason: "child-said-ok" }],
    ["no eligible work", { stopReason: "no-eligible-work" }],
    ["max runtime", { stopReason: "max-runtime-reached" }],
    ["recovery blocked summary", { stopReason: "recoverable-work-blocked:recovery_exact_head_evidence_regeneration_required" }],
    ["manual summary", { stopReason: "recoverable-work-stopped:manual-gate" }],
    ["authority gate summary", { stopReason: "authority-gate" }],
    ["danger gate summary", { stopReason: "danger-gate" }],
    ["partial summary", { stopReason: "partial" }],
    ["cancelled summary", { stopReason: "cancelled" }],
    ["failed summary", { stopReason: "failed" }],
    ["blocked summary", { stopReason: "blocked" }],
    ["contradictory summary outcome", { summaryOverrides: { outcome: "failed" } }],
    ["contradictory summary status", { summaryOverrides: { status: "blocked" } }],
    ["malicious stop reason sanitized", { stopReason: "recoverable-work-blocked:token=super-secret-token" }],
    ["auto merge not attempted", { iterationOverrides: { autoMerge: { attempted: false, result: "merged", prNumber: 917, prHeadSha: shaB, mergeSha: "c".repeat(40) } } }],
    ["merge failed", { iterationOverrides: { outcome: "auto_failed", autoMerge: { attempted: true, result: "merge_failed", reason: "merge_failed", prNumber: 917, prHeadSha: shaB, mergeSha: null } } }],
    ["canonical non-merged result", { iterationOverrides: { outcome: "recovery_existing_pr_continued", autoMerge: { attempted: true, result: "blocked", reason: "manual_gate", prNumber: 917, prHeadSha: shaB, mergeSha: null } } }],
    ["max iterations without merge", { stopReason: "max-iterations-reached", iterationOverrides: { outcome: "recovery_existing_pr_continued", autoMerge: { attempted: true, result: "merge_failed", reason: "merge_failed", prNumber: 917, prHeadSha: shaB, mergeSha: null } } }],
    ["claimed merge without sha", { iterationOverrides: { autoMerge: { attempted: true, result: "merged", prNumber: 917, prHeadSha: shaB, mergeSha: null } } }],
    ["invalid merge sha", { iterationOverrides: { autoMerge: { attempted: true, result: "merged", prNumber: 917, prHeadSha: shaB, mergeSha: "not-a-sha" } } }],
    ["merge sha with non-merged result", { iterationOverrides: { outcome: "auto_failed", autoMerge: { attempted: true, result: "merge_failed", reason: "merge_failed", prNumber: 917, prHeadSha: shaB, mergeSha: "c".repeat(40) } } }],
    ["contradictory merged reason", { iterationOverrides: { autoMerge: { attempted: true, result: "merged", reason: "manual_gate_blocked", prNumber: 917, prHeadSha: shaB, mergeSha: "c".repeat(40) } } }],
  ];

  for (const [label, proofOptions] of cases) {
    const config = tempConfig();
    try {
      const planned = fixtureOutageState();
      const child = exactChild(planned, {
        runId: "supervised-20260715T010000Z-000000000351",
        state: "completed",
        terminalOutcome: "completed",
        runnerRunId: "run-2026-07-15T010000Z",
      });
      if (proofOptions) {
        writeTrustedChildSummary(config, child, proofOptions);
      }
      if (label === "wrong child run" || label === "wrong supervisor run") {
        const summaryPath = path.join(config.logsRoot, "summaries", `${child.runnerRunId}.json`);
        const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
        writeFileSync(summaryPath, `${JSON.stringify({ ...summary, supervisorRunId: proofOptions.summaryOverrides.supervisorRunId }, null, 2)}\n`, { mode: 0o600 });
      }

      const result = runOutageResubmissionController({
        config,
        source: source(),
        outageState: planned,
        recoveryState: incompleteRecoveryState(),
        existingChildren: [child],
        dryRun: false,
        now,
        startUserUnit: () => {
          throw new Error("must_not_start");
        },
      });
      assert.equal(result.outcome, "blocked", label);
      assert.equal(result.reasonCode, "child_completed_without_exact_recovery_proof", label);
      assert.equal(result.outageState.mutationMarker.status, "blocked", label);
      assert.equal(result.events.some((item) => item.event === "planned_terminal_child_classified"), true, label);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, label);
      assert.equal(result.events.some((item) => item.reasonCode === "confirmed_child_recovered"), false, label);
      assert.equal(result.counts.githubMutationCalls, 0, label);
      assert.equal(result.counts.systemdCalls, 0, label);
      assert.equal(result.counts.realMutationCalls, 0, label);
      assert.equal(JSON.stringify(result).includes("not-a-sha"), false, label);
      assert.equal(JSON.stringify(result).includes("super-secret-token"), false, label);
    } finally {
      config.cleanup();
    }
  }
});

test("exact Route B identity selects one exact iteration among unrelated near matches", () => {
  const config = tempConfig();
  try {
    const planned = fixtureOutageState();
    const child = exactChild(planned, {
      runId: "supervised-20260715T010000Z-000000000354",
      state: "completed",
      terminalOutcome: "completed",
      runnerRunId: "run-2026-07-15T010300Z",
    });
    writeTrustedChildSummary(config, child, {
      iterations: [
        mergedSummaryIteration(source({ issueNumber: 914 })),
        mergedSummaryIteration(source(), { index: 2 }),
        mergedSummaryIteration(source({ prNumber: 918 }), { index: 3 }),
      ],
    });
    const result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: planned,
      recoveryState: incompleteRecoveryState(),
      existingChildren: [child],
      dryRun: false,
      now,
    });
    assert.equal(result.outcome, "recovered");
    assert.equal(result.reasonCode, "confirmed_child_recovered");
    assert.equal(result.childRecoveryProof.iterationIndex, 1);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("malformed and ambiguous trusted child summaries fail closed without raw reflection", () => {
  const config = tempConfig();
  try {
    const planned = fixtureOutageState();
    const child = exactChild(planned, {
      runId: "supervised-20260715T010000Z-000000000352",
      state: "completed",
      terminalOutcome: "completed",
      runnerRunId: "run-2026-07-15T010000Z",
    });
    const summariesRoot = path.join(config.logsRoot, "summaries");
    mkdirSync(summariesRoot, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(summariesRoot, `${child.runnerRunId}.json`), `{ "${child.runId}": `, { mode: 0o600 });
    writeFileSync(path.join(summariesRoot, `${child.runnerRunId}.md`), "# summary\n", { mode: 0o600 });

    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: planned,
      recoveryState: incompleteRecoveryState(),
      existingChildren: [child],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "child_completed_without_exact_recovery_proof");
    assert.equal(JSON.stringify(result).includes(child.runId), true);
    assert.equal(JSON.stringify(result).includes("{ \""), false);

    const otherRunner = "run-2026-07-15T010100Z";
    writeTrustedChildSummary(config, { ...child, runnerRunId: otherRunner }, { runnerRunId: otherRunner });
    writeTrustedChildSummary(config, child);
    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: planned,
      recoveryState: incompleteRecoveryState(),
      existingChildren: [child],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "child_completed_without_exact_recovery_proof");
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
  } finally {
    config.cleanup();
  }
});

test("exact child merge proof recovers from disk and is idempotent", () => {
  const config = tempConfig();
  try {
    const planned = fixtureOutageState();
    writeOutageResubmissionState(config, planned);
    const child = exactMergedChild(config, planned, { runId: planned.childSupervisorRunId || "supervised-20260715T010000Z-000000000353" }, { runnerRunId: "run-2026-07-15T010200Z" });
    const result = runOutageResubmissionController({
      config,
      source: source(),
      outageStateKey: planned.correlation,
      recoveryState: incompleteRecoveryState(),
      existingChildren: [child],
      dryRun: false,
      now,
    });
    assert.equal(result.outcome, "recovered");
    assert.equal(result.reasonCode, "confirmed_child_recovered");
    assert.equal(result.childRecoveryProof.mergeSha, "c".repeat(40));
    const loaded = loadOutageResubmissionState(config, planned.correlation);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.state.status, "recovered");

    const repeated = runOutageResubmissionController({
      config,
      source: source(),
      outageState: loaded.state,
      recoveryState: incompleteRecoveryState(),
      existingChildren: [child],
      dryRun: false,
      now,
    });
    assert.equal(repeated.outcome, "noop");
    assert.equal(repeated.reasonCode, "terminal_outage_marker_preserved");
    assert.equal(repeated.events.some((item) => item.reasonCode === "confirmed_child_recovered"), false);
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

    const terminalChild = exactMergedChild(config, confirmed, { runId: confirmed.childSupervisorRunId });
    result = runOutageResubmissionController({ config, source: source(), outageState: confirmed, existingChildren: [terminalChild], dryRun: true, now });
    assert.equal(result.outcome, "recovered");
    assert.equal(result.reasonCode, "confirmed_child_recovered");
    assert.equal(result.outageState.mutationMarker.status, "recovered");
  } finally {
    config.cleanup();
  }
});

test("optional PR identity matrix requires exact absent or present pairs", () => {
  const config = tempConfig();
  try {
    const sourceCases = [
      ["pre-pr source", source({ prNumber: null, prHeadSha: null })],
      ["post-pr source", source()],
    ];
    const childCases = [
      ["absent pair", { prNumber: null, prHeadSha: null }],
      ["identical present", { prNumber: 917, prHeadSha: shaB }],
      ["different number same head", { prNumber: 918, prHeadSha: shaB }],
      ["same number different head", { prNumber: 917, prHeadSha: shaA }],
      ["different pair", { prNumber: 918, prHeadSha: shaA }],
      ["number only", { prNumber: 917, prHeadSha: null }],
      ["head only", { prNumber: null, prHeadSha: shaB }],
    ];

    for (const [sourceLabel, sourceInput] of sourceCases) {
      const state = fixtureOutageStateForSource(sourceInput);
      for (const [childLabel, prIdentity] of childCases) {
        const child = exactChildForSource(state, sourceInput, prIdentity);
        const result = runOutageResubmissionController({
          config,
          source: sourceInput,
          outageState: state,
          existingChildren: [child],
          dryRun: true,
          now,
        });
        const shouldMatch = sourceInput.prNumber === prIdentity.prNumber && sourceInput.prHeadSha === prIdentity.prHeadSha;
        const label = `${sourceLabel} / ${childLabel}`;
        if (shouldMatch) {
          assert.equal(result.outcome, "confirmed_existing_child", label);
          assert.equal(result.reasonCode, "planned_child_reconciled", label);
          assert.equal(result.counts.realMutationCalls, 0, label);
        } else {
          assert.equal(result.outcome, "blocked", label);
          assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation", label);
          assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, label);
          assert.equal(result.counts.githubMutationCalls, 0, label);
          assert.equal(result.counts.systemdCalls, 0, label);
          assert.equal(result.counts.realMutationCalls, 0, label);
          assert.equal(
            result.childReconciliation.mismatches.some((field) => field === "prNumber" || field === "prHeadSha"),
            true,
            label,
          );
        }
      }
    }
  } finally {
    config.cleanup();
  }
});

test("live current identity must preserve the strict optional PR pair", () => {
  const config = tempConfig();
  try {
    for (const [label, currentIdentity] of [
      ["no current identity object", undefined],
      ["empty current identity object", {}],
    ]) {
      const input = {
        config,
        source: source(),
        recoveryState: recoveryStateForSource(source()),
        dryRun: true,
        now,
        childRunId: "supervised-20260715T010000Z-000000000720",
      };
      if (currentIdentity === undefined) input.omitCurrentIdentityForTest = true;
      else input.currentIdentity = currentIdentity;
      const result = runOutageResubmissionController(input);
      assert.equal(result.outcome, "blocked", label);
      assert.equal(result.reasonCode, "pr_identity_mismatch", label);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, label);
      assert.equal(result.counts.githubMutationCalls, 0, label);
      assert.equal(result.counts.systemdCalls, 0, label);
      assert.equal(result.counts.realMutationCalls, 0, label);
    }

    const cases = [
      ["absent live pair for PR source", source(), { branchName: source().branchName, baseSha: source().baseSha, currentHeadSha: source().currentHeadSha }, "pr_identity_mismatch"],
      ["partial live number", source(), { branchName: source().branchName, baseSha: source().baseSha, currentHeadSha: source().currentHeadSha, prNumber: 917 }, "pr_head_identity_mismatch"],
      ["partial live head", source(), { branchName: source().branchName, baseSha: source().baseSha, currentHeadSha: source().currentHeadSha, prHeadSha: source().prHeadSha }, "pr_identity_mismatch"],
      ["live present for pre-PR source", source({ prNumber: null, prHeadSha: null }), { branchName: source().branchName, baseSha: source().baseSha, currentHeadSha: source().currentHeadSha, prNumber: 917, prHeadSha: source().prHeadSha }, "pr_identity_mismatch"],
      ["number drift", source(), { branchName: source().branchName, baseSha: source().baseSha, currentHeadSha: source().currentHeadSha, prNumber: 918, prHeadSha: source().prHeadSha }, "pr_identity_mismatch"],
      ["head drift", source(), { branchName: source().branchName, baseSha: source().baseSha, currentHeadSha: source().currentHeadSha, prNumber: 917, prHeadSha: shaA }, "pr_head_identity_mismatch"],
    ];

    for (const [label, sourceInput, currentIdentity, reasonCode] of cases) {
      const result = runOutageResubmissionController({
        config,
        source: sourceInput,
        recoveryState: recoveryStateForSource(sourceInput),
        currentIdentity,
        dryRun: true,
        now,
        childRunId: "supervised-20260715T010000Z-000000000721",
      });
      assert.equal(result.outcome, "blocked", label);
      assert.equal(result.reasonCode, reasonCode, label);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, label);
      assert.equal(result.counts.githubMutationCalls, 0, label);
      assert.equal(result.counts.systemdCalls, 0, label);
      assert.equal(result.counts.realMutationCalls, 0, label);
    }

    for (const [label, sourceInput, currentIdentity] of [
      ["absent/absent", source({ prNumber: null, prHeadSha: null }), { branchName: source().branchName, baseSha: source().baseSha, currentHeadSha: source().currentHeadSha }],
      ["identical present", source(), { branchName: source().branchName, baseSha: source().baseSha, currentHeadSha: source().currentHeadSha, prNumber: 917, prHeadSha: source().prHeadSha }],
    ]) {
      const result = runOutageResubmissionController({
        config,
        source: sourceInput,
        recoveryState: recoveryStateForSource(sourceInput),
        currentIdentity,
        dryRun: true,
        now,
        childRunId: "supervised-20260715T010000Z-000000000722",
      });
      assert.equal(result.outcome, "planned", label);
      assert.equal(result.reasonCode, "dry_run_no_mutation", label);
    }
  } finally {
    config.cleanup();
  }
});

test("unexpected child PR identity blocks every reconciliation status without planning replacement", () => {
  const config = tempConfig();
  try {
    const sourceInput = source({ prNumber: null, prHeadSha: null });
    const baseState = fixtureOutageStateForSource(sourceInput);
    const unexpectedPr = { prNumber: 917, prHeadSha: shaB };
    const statusCases = [
      ["no existing marker", null, exactChildForSource(baseState, sourceInput, unexpectedPr)],
      ["planned marker", baseState, exactChildForSource(baseState, sourceInput, unexpectedPr)],
      ["submission_uncertain", transitionOutageMarker(baseState, {
        status: "submission_uncertain",
        childSupervisorRunId: "supervised-20260715T010000Z-000000000611",
        specDigest: digestB,
      }), null],
      ["submitted", transitionOutageMarker(baseState, {
        status: "submitted",
        childSupervisorRunId: "supervised-20260715T010000Z-000000000612",
        specDigest: digestB,
      }), null],
      ["confirmed_running", transitionOutageMarker(baseState, {
        status: "confirmed_running",
        childSupervisorRunId: "supervised-20260715T010000Z-000000000613",
        specDigest: digestB,
      }), null],
      ["terminal completed child", transitionOutageMarker(baseState, {
        status: "confirmed_running",
        childSupervisorRunId: "supervised-20260715T010000Z-000000000614",
        specDigest: digestB,
      }), null, { state: "completed", terminalOutcome: "completed" }],
      ["terminal failed child", transitionOutageMarker(baseState, {
        status: "confirmed_running",
        childSupervisorRunId: "supervised-20260715T010000Z-000000000615",
        specDigest: digestB,
      }), null, { state: "failed", terminalOutcome: "failed" }],
      ["terminal blocked child", transitionOutageMarker(baseState, {
        status: "confirmed_running",
        childSupervisorRunId: "supervised-20260715T010000Z-000000000616",
        specDigest: digestB,
      }), null, { state: "blocked", terminalOutcome: "blocked" }],
    ];

    for (const [label, state, explicitChild, childOverrides = {}] of statusCases) {
      const runId = state?.childSupervisorRunId || state?.mutationMarker?.childSupervisorRunId || "supervised-20260715T010000Z-000000000610";
      const child = explicitChild || exactChildForSource(state, sourceInput, {
        ...unexpectedPr,
        runId,
        ...childOverrides,
      });
      const result = runOutageResubmissionController({
        config,
        source: sourceInput,
        outageState: state,
        recoveryState: recoveryStateForSource(sourceInput),
        existingChildren: [child],
        dryRun: true,
        now,
        rng: () => 0.5,
        childRunId: "supervised-20260715T010000Z-000000000699",
      });
      assert.equal(result.outcome, "blocked", label);
      assert.match(result.reasonCode, /^outage_child_(ambiguous|identity_mismatch)_requires_reconciliation$/, label);
      assert.equal(result.reasonCode === "existing_child_resubmission_present", false, label);
      assert.equal(result.reasonCode === "confirmed_child_recovered", false, label);
      assert.equal(result.reasonCode === "planned_child_reconciled", false, label);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, label);
      assert.equal(result.events.some((item) => item.event === "child_submission_confirmed"), false, label);
      assert.equal(result.counts.githubMutationCalls, 0, label);
      assert.equal(result.counts.systemdCalls, 0, label);
      assert.equal(result.counts.realMutationCalls, 0, label);
      assert.deepEqual(Object.keys(result.childReconciliation.candidateIds[0]).sort(), ["runId", "specDigest"], label);
      if (result.childReconciliation.mismatches) {
        assert.equal(
          result.childReconciliation.mismatches.some((field) => field === "prNumber" || field === "prHeadSha"),
          true,
          label,
        );
      } else {
        assert.equal(result.childReconciliation.candidates > 0, true, label);
      }
    }
  } finally {
    config.cleanup();
  }
});

test("same-source children without authoritative marker fields are not adopted", () => {
  const config = tempConfig();
  try {
    const baseState = fixtureOutageState();
    const authorized = exactChild(baseState);
    const missingCases = [
      ["no trusted outage state", null, authorized],
      ["no outage metadata", baseState, { ...authorized, outageResubmission: null }],
      ["missing marker key", baseState, { ...authorized, outageResubmission: { ...authorized.outageResubmission, markerKey: undefined } }],
      ["missing fingerprint", baseState, { ...authorized, outageResubmission: { ...authorized.outageResubmission, outageFingerprint: undefined } }],
      ["missing attempt", baseState, { ...authorized, outageResubmission: { ...authorized.outageResubmission, attemptNumber: undefined } }],
      ["missing spec digest", baseState, sameMarkerMissingSpecDigestChild(baseState)],
    ];

    for (const [label, outageState, child] of missingCases) {
      const result = runOutageResubmissionController({
        config,
        source: source(),
        outageState,
        recoveryState: incompleteRecoveryState(),
        existingChildren: [child],
        dryRun: true,
        now,
        childRunId: "supervised-20260715T010000Z-000000000731",
      });
      assert.equal(result.outcome, "blocked", label);
      assert.match(result.reasonCode, /^outage_child_(ambiguous|identity_mismatch)_requires_reconciliation$/, label);
      assert.equal(result.reasonCode === "existing_child_resubmission_present", false, label);
      assert.equal(result.reasonCode === "confirmed_child_recovered", false, label);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, label);
      assert.equal(result.counts.githubMutationCalls, 0, label);
      assert.equal(result.counts.systemdCalls, 0, label);
      assert.equal(result.counts.realMutationCalls, 0, label);
    }

    for (const [field, value] of [
      ["markerKey", "1".repeat(64)],
      ["outageFingerprint", "2".repeat(64)],
      ["attemptNumber", 2],
      ["childSpecDigest", digestC],
    ]) {
      const child = exactChild(baseState, {
        outageResubmission: {
          ...authorized.outageResubmission,
          [field]: value,
        },
        ...(field === "childSpecDigest" ? { specSha256: digestC } : {}),
      });
      const result = runOutageResubmissionController({
        config,
        source: source(),
        outageState: baseState,
        recoveryState: incompleteRecoveryState(),
        existingChildren: [child],
        dryRun: true,
        now,
        childRunId: "supervised-20260715T010000Z-000000000732",
      });
      assert.equal(result.outcome, "blocked", field);
      assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation", field);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, field);
      assert.equal(result.counts.realMutationCalls, 0, field);
    }
  } finally {
    config.cleanup();
  }
});

test("optional PR identity mismatches block intended, duplicate, and canonical representation reconciliation", () => {
  const config = tempConfig();
  try {
    const sourceInput = source({ prNumber: null, prHeadSha: null });
    const submitted = transitionOutageMarker(fixtureOutageStateForSource(sourceInput), {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000711",
      specDigest: digestB,
    });
    const intended = exactChildForSource(submitted, sourceInput, {
      runId: submitted.childSupervisorRunId,
      prNumber: 917,
      prHeadSha: shaB,
    });

    let result = runOutageResubmissionController({
      config,
      source: sourceInput,
      outageState: submitted,
      existingChildren: [intended],
      dryRun: true,
      now,
    });
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.equal(result.childReconciliation.mismatches.includes("prNumber"), true);
    assert.equal(result.events.some((item) => item.event === "submitted_child_reconciled"), false);

    result = runOutageResubmissionController({
      config,
      source: sourceInput,
      outageState: submitted,
      existingChildren: [
        exactChildForSource(submitted, sourceInput, { runId: submitted.childSupervisorRunId }),
        exactChildForSource(submitted, sourceInput, {
          runId: "supervised-20260715T010000Z-000000000712",
          prNumber: 917,
          prHeadSha: shaB,
        }),
      ],
      dryRun: true,
      now,
    });
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.equal(result.events.some((item) => item.event === "submitted_child_reconciled"), false);

    result = runOutageResubmissionController({
      config,
      source: sourceInput,
      outageState: submitted,
      existingChildren: [
        exactChildForSource(submitted, sourceInput, { runId: submitted.childSupervisorRunId }),
        exactChildForSource(submitted, sourceInput, {
          runId: submitted.childSupervisorRunId,
          prNumber: 917,
          prHeadSha: shaB,
        }),
      ],
      dryRun: true,
      now,
    });
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.equal(result.childReconciliation.mismatches.includes("prNumber"), true);
    assert.equal(result.counts.realMutationCalls, 0);
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

test("intended child reconciles with unrelated children but stale marker attempts fail closed", () => {
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
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.deepEqual(result.childReconciliation.mismatches.sort(), ["attemptNumber", "markerKey", "outageFingerprint"].sort());
    assert.equal(result.events.some((item) => item.event === "submitted_child_reconciled"), false);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.realMutationCalls, 0);
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

test("same-marker child spec digest drift blocks before adoption or planning", () => {
  const config = tempConfig();
  try {
    const baseState = fixtureOutageState();
    for (const [label, state] of [
      ["planned", baseState],
      ["submitted", transitionOutageMarker(baseState, {
        status: "submitted",
        childSupervisorRunId: "supervised-20260715T010000Z-000000000111",
        specDigest: digestB,
      })],
      ["confirmed_running", transitionOutageMarker(baseState, {
        status: "confirmed_running",
        childSupervisorRunId: "supervised-20260715T010000Z-000000000222",
        specDigest: digestB,
      })],
    ]) {
      const result = runOutageResubmissionController({
        config,
        source: source(),
        outageState: state,
        existingChildren: [sameMarkerSpecDriftChild(state, { runId: state.childSupervisorRunId || "supervised-20260715T010000Z-000000000333" })],
        dryRun: true,
        now,
      });
      assert.equal(result.outcome, "blocked", label);
      assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation", label);
      assert.equal(result.childReconciliation.mismatches.includes("childSpecDigest"), true, label);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, label);
      assert.equal(result.counts.githubMutationCalls, 0, label);
      assert.equal(result.counts.systemdCalls, 0, label);
      assert.equal(result.counts.realMutationCalls, 0, label);
    }

    let result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: baseState,
      existingChildren: [sameMarkerSpecDriftChild(baseState, { runId: "supervised-20260715T010000Z-000000000444" })],
      dryRun: true,
      now,
    });
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.equal(result.childReconciliation.mismatches.includes("childSpecDigest"), true);

    const submitted = transitionOutageMarker(baseState, {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000555",
      specDigest: digestB,
    });
    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [
        exactChild(submitted, { runId: submitted.childSupervisorRunId }),
        sameMarkerSpecDriftChild(submitted, { runId: "supervised-20260715T010000Z-000000000666" }),
      ],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.equal(result.childReconciliation.mismatches.includes("childSpecDigest"), true);
    assert.equal(result.events.some((item) => item.event === "submitted_child_reconciled"), false);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.realMutationCalls, 0);

    result = runOutageResubmissionController({
      config,
      source: source(),
      outageState: submitted,
      existingChildren: [sameMarkerMissingSpecDigestChild(submitted)],
      dryRun: true,
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "outage_child_identity_mismatch_requires_reconciliation");
    assert.equal(result.childReconciliation.mismatches.includes("childSpecDigest"), true);
    assert.equal(result.counts.realMutationCalls, 0);
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
    assert.equal(runOutageResubmissionController({ config, source: source(), recoveryState: incompleteRecoveryState(), operatorControlBeforeSubmit: { stopAfterCurrent: true }, dryRun: true, now }).reasonCode, "operator_stop");
    assert.equal(runOutageResubmissionController({
      config,
      source: source(),
      recoveryState: incompleteRecoveryState(),
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

test("controller persists stale head invalidation before returning without later mutations", () => {
  const config = tempConfig();
  try {
    let recoveryState = incompleteRecoveryState();
    for (const kind of ["localValidation", "codexReview", "ciChecks"]) {
      recoveryState = bindRecoveryEvidence(recoveryState, kind, { status: "passed", headSha: shaB, baseSha: shaA });
    }
    writeRecoveryState(config, recoveryState);
    const beforeFiles = listRelativeFiles(config.logsRoot);
    const writes = [];
    const result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      currentIdentity: liveIdentityForSource(source(), { currentHeadSha: "c".repeat(40), prHeadSha: "c".repeat(40) }),
      dryRun: false,
      writeRecoveryState: (writerConfig, state) => {
        writes.push({ kind: "recovery", head: state.branch.currentHeadSha, nextSafeAction: state.nextSafeAction });
        return writeRecoveryState(writerConfig, state);
      },
      writeOutageState: () => {
        writes.push({ kind: "outage" });
        throw new Error("must_not_write_outage");
      },
      startUserUnit: () => {
        writes.push({ kind: "systemd" });
        throw new Error("must_not_start");
      },
      now,
    });
    assert.equal(result.reasonCode, "stale_head_evidence_regeneration_required");
    assert.deepEqual(writes, [{ kind: "recovery", head: "c".repeat(40), nextSafeAction: "regenerate_exact_head_evidence" }]);
    assert.equal(result.recoveryState.branch.currentHeadSha, "c".repeat(40));
    assert.equal(result.recoveryState.nextSafeAction, "regenerate_exact_head_evidence");
    assert.equal(result.events.some((item) => item.event === "stale_head_evidence_invalidated" && item.persisted === true), true);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.events.some((item) => item.event === "outage_marker_reconciled"), false);
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);
    assert.deepEqual(listRelativeFiles(config.logsRoot), beforeFiles);
    const loaded = loadRecoveryState(config, recoveryState);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.state.branch.currentHeadSha, "c".repeat(40));
    assert.equal(loaded.state.nextSafeAction, "regenerate_exact_head_evidence");
    for (const kind of ["localValidation", "codexReview", "ciChecks"]) {
      assert.equal(loaded.state.evidence[kind].stale, true, kind);
      assert.equal(loaded.state.evidence[kind].invalidatedOldHeadSha, shaB, kind);
      assert.equal(loaded.state.evidence[kind].invalidatedNewHeadSha, "c".repeat(40), kind);
    }
  } finally {
    config.cleanup();
  }
});

test("controller stale head invalidation dry-run writer-failure no-state and idempotent boundaries", () => {
  const config = tempConfig();
  try {
    const recoveryState = bindRecoveryEvidence(incompleteRecoveryState(), "ciChecks", { status: "passed", headSha: shaB, baseSha: shaA });
    const written = writeRecoveryState(config, recoveryState);
    const before = readFileSync(written.statePath, "utf8");

    let writes = 0;
    let result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      currentIdentity: liveIdentityForSource(source(), { currentHeadSha: "c".repeat(40), prHeadSha: "c".repeat(40) }),
      dryRun: true,
      writeRecoveryState: () => {
        writes += 1;
        throw new Error("dry run must not persist");
      },
      now,
    });
    assert.equal(result.reasonCode, "stale_head_evidence_regeneration_required");
    assert.equal(result.recoveryState.branch.currentHeadSha, "c".repeat(40));
    assert.equal(result.recoveryState.evidence.ciChecks.stale, true);
    assert.equal(writes, 0);
    assert.equal(readFileSync(written.statePath, "utf8"), before);
    assert.equal(result.events.some((item) => item.event === "stale_head_evidence_invalidated" && item.persisted === false), true);

    const afterDryRun = readFileSync(written.statePath, "utf8");
    result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      currentIdentity: liveIdentityForSource(source(), { currentHeadSha: "c".repeat(40), prHeadSha: "c".repeat(40) }),
      dryRun: false,
      writeRecoveryState: () => {
        throw new Error("synthetic stale-head write failure with /tmp/raw-secret");
      },
      startUserUnit: () => {
        throw new Error("must_not_start");
      },
      now,
    });
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reasonCode, "recovery_stale_head_invalidation_persistence_failed");
    assert.equal(result.recoveryState.branch.currentHeadSha, shaB);
    assert.equal(readFileSync(written.statePath, "utf8"), afterDryRun);
    assert.equal(JSON.stringify(result.events).includes("/tmp/raw-secret"), false);
    assert.equal(result.events.some((item) => item.event === "stale_head_evidence_invalidated"), false);
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);

    writes = 0;
    result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState: null,
      currentIdentity: liveIdentityForSource(source(), { currentHeadSha: "c".repeat(40), prHeadSha: "c".repeat(40) }),
      dryRun: false,
      writeRecoveryState: () => {
        writes += 1;
        throw new Error("must_not_fabricate_recovery_state");
      },
      now,
    });
    assert.equal(result.reasonCode, "stale_head_evidence_regeneration_required");
    assert.equal(result.recoveryState, null);
    assert.equal(writes, 0);

    let persisted = writeRecoveryState(config, recoveryState).state;
    result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState: persisted,
      currentIdentity: liveIdentityForSource(source(), { currentHeadSha: "c".repeat(40), prHeadSha: "c".repeat(40) }),
      dryRun: false,
      now,
    });
    assert.equal(result.reasonCode, "stale_head_evidence_regeneration_required");
    persisted = loadRecoveryState(config, recoveryState).state;
    const firstInvalidatedAt = persisted.evidence.ciChecks.invalidatedAt;
    result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState: persisted,
      currentIdentity: liveIdentityForSource(source(), { currentHeadSha: "c".repeat(40), prHeadSha: "c".repeat(40) }),
      dryRun: false,
      now,
    });
    assert.equal(result.reasonCode, "stale_head_evidence_regeneration_required");
    const repeatedInvalidation = loadRecoveryState(config, recoveryState).state;
    assert.equal(repeatedInvalidation.evidence.ciChecks.invalidatedAt, firstInvalidatedAt);
    assert.equal(repeatedInvalidation.evidence.ciChecks.invalidatedOldHeadSha, shaB);
    assert.equal(repeatedInvalidation.evidence.ciChecks.invalidatedNewHeadSha, "c".repeat(40));

    writes = 0;
    result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      currentIdentity: liveIdentityForSource(source()),
      dryRun: true,
      writeRecoveryState: () => {
        writes += 1;
        throw new Error("must_not_write_on_equal_head");
      },
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000991",
    });
    assert.equal(result.reasonCode, "dry_run_no_mutation");
    assert.equal(writes, 0);
  } finally {
    config.cleanup();
  }
});

test("controller rejects stale outage recovery targets before planning or mutation", () => {
  const cases = [
    {
      name: "next-safe-action",
      build: () => ({ ...incompleteRecoveryState(), nextSafeAction: "regenerate_exact_head_evidence" }),
    },
    {
      name: "stale-evidence",
      build: () => ({
        ...incompleteRecoveryState(),
        evidence: {
          ciChecks: {
            status: "passed",
            headSha: shaA,
            baseSha: shaA,
            stale: true,
            invalidatedBy: "review_fix_committed",
            invalidatedAt: "2026-07-15T00:45:00.000Z",
            invalidatedOldHeadSha: shaA,
            invalidatedNewHeadSha: shaB,
          },
        },
      }),
    },
    {
      name: "persisted-identical-head-drift",
      build: () => invalidateEvidenceForHeadChange(
        bindRecoveryEvidence(incompleteRecoveryState(), "ciChecks", { status: "passed", headSha: shaA, baseSha: shaA }),
        { newHeadSha: shaB, reasonCode: "review_fix_committed" },
      ),
    },
  ];

  for (const { name, build } of cases) {
    const config = tempConfig();
    try {
      const staleRecoveryState = build();
      const written = writeRecoveryState(config, staleRecoveryState);
      const before = readFileSync(written.statePath, "utf8");
      const writes = [];
      const result = runOutageResubmissionController({
        config,
        source: source(),
        recoveryState: staleRecoveryState,
        dryRun: false,
        writeRecoveryState: () => {
          writes.push("recovery");
          throw new Error("must_not_write_recovery");
        },
        writeOutageState: () => {
          writes.push("outage");
          throw new Error("must_not_write_outage");
        },
        startUserUnit: () => {
          writes.push("systemd");
          throw new Error("must_not_start");
        },
        now,
        rng: () => 0.5,
        childRunId: "supervised-20260715T010000Z-000000000991",
      });

      assert.equal(result.outcome, "blocked", name);
      assert.equal(result.reasonCode, "recovery_exact_head_evidence_regeneration_required", name);
      assert.deepEqual(writes, [], name);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false, name);
      assert.equal(result.events.some((item) => item.event === "outage_marker_created"), false, name);
      assert.equal(result.events.some((item) => item.event === "outage_recovery_state_bound"), false, name);
      assert.equal(result.events.some((item) => item.event === "dry_run_child_spec_planned"), false, name);
      assert.equal(result.counts.githubMutationCalls, 0, name);
      assert.equal(result.counts.systemdCalls, 0, name);
      assert.equal(result.counts.realMutationCalls, 0, name);
      assert.equal(readFileSync(written.statePath, "utf8"), before, name);
      assert.equal(loadRecoveryState(config, staleRecoveryState).ok, true, name);
    } finally {
      config.cleanup();
    }
  }
});

test("controller still allows clean exact outage recovery target planning", () => {
  const config = tempConfig();
  try {
    const recoveryState = incompleteRecoveryState();
    writeRecoveryState(config, recoveryState);
    const result = runOutageResubmissionController({
      config,
      source: source(),
      recoveryState,
      dryRun: true,
      now,
      rng: () => 0.5,
      childRunId: "supervised-20260715T010000Z-000000000991",
    });
    assert.equal(result.outcome, "planned");
    assert.equal(result.reasonCode, "dry_run_no_mutation");
    assert.equal(result.events.some((item) => item.event === "resubmission_planned"), true);
    assert.equal(result.counts.githubMutationCalls, 0);
    assert.equal(result.counts.systemdCalls, 0);
    assert.equal(result.counts.realMutationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("controller treats merged or closed source as recovered", () => {
  const config = tempConfig();
  try {
    const result = runOutageResubmissionController({
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
    for (const [status, sourceFlags, identity, reasonCode] of [
      ["planned", { merged: true, completed: true }, currentCompletion({ merged: true }), "source_current_pr_merged"],
      ["planned", { issueClosed: true, completed: true }, currentCompletion({ issueClosed: true, merged: false }), "source_current_issue_closed"],
      ["submitted", { merged: true, completed: true }, currentCompletion({ merged: true }), "source_current_pr_merged"],
      ["confirmed_running", { issueClosed: true, completed: true }, currentCompletion({ issueClosed: true, merged: false }), "source_current_issue_closed"],
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
      assert.equal(evaluateSourceRunEligibility({ config, source: source(sourceFlags) }).reasonCode, "source_work_already_complete", status);
      const result = runOutageResubmissionController({
        config,
        source: source(sourceFlags),
        outageState: state,
        existingChildren: [sameMarkerSpecDriftChild(state)],
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
      assert.equal(result.events.some((item) => item.event === "outage_marker_reconciled"), false, status);
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
      source: source({ merged: true, completed: true }),
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
      source: source({ merged: true, completed: true }),
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
      source: source({ merged: true, completed: true }),
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

    const prePrSource = source({ prNumber: null, prHeadSha: null, merged: true, completed: true });
    const prePrPlanned = fixtureOutageStateForSource(prePrSource);
    writeOutageResubmissionState(config, prePrPlanned);
    for (const [identity, reasonCode] of [
      [{ merged: true, prNumber: 917, prHeadSha: shaB }, "pr_identity_mismatch"],
      [{ issueClosed: true, merged: false, prHeadSha: shaB }, "pr_head_identity_mismatch"],
    ]) {
      result = runOutageResubmissionController({
        config,
        source: prePrSource,
        outageState: prePrPlanned,
        currentIdentity: {
          issueNumber: prePrSource.issueNumber,
          branchName: prePrSource.branchName,
          baseSha: prePrSource.baseSha,
          currentHeadSha: prePrSource.currentHeadSha,
          ...identity,
        },
        dryRun: false,
        now,
      });
      assert.equal(result.outcome, "blocked");
      assert.equal(result.reasonCode, reasonCode);
      assert.equal(loadOutageResubmissionState(config, prePrPlanned.correlation).state.status, "planned");
      assert.equal(result.events.some((item) => item.event === "outage_source_completion_recovered"), false);
      assert.equal(result.events.some((item) => item.event === "outage_marker_reconciled"), false);
      assert.equal(result.events.some((item) => item.event === "resubmission_planned"), false);
      assert.equal(result.counts.githubMutationCalls, 0);
      assert.equal(result.counts.systemdCalls, 0);
      assert.equal(result.counts.realMutationCalls, 0);
    }

    result = runOutageResubmissionController({
      config,
      source: source({ issueClosed: true, completed: true }),
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

test("status and health select active outage state from complete trusted inventory beyond display bounds", () => {
  const config = tempConfig();
  try {
    const candidates = Array.from({ length: 25 }, (_, index) => fixtureOutageStateForIndex(index));
    const activeIndex = storageKeyOrder(config, candidates)[0].index;
    for (const [index, baseState] of candidates.entries()) {
      const updatedAt = isoAtMinutes(index + 1);
      const state = index === activeIndex
        ? withStateUpdatedAt(transitionOutageMarker(baseState, {
          status: "confirmed_running",
          childSupervisorRunId: "supervised-20260715T010000Z-000000000abc",
          specDigest: digestC,
          reasonCode: "submitted_child_reconciled",
        }), "2026-07-15T00:05:00.000Z", {
          schedule: {
            ...baseState.schedule,
            attemptNumber: 2,
            nextEligibleAt: "2026-07-15T01:45:00.000Z",
            deadlineAt: "2026-07-16T01:45:00.000Z",
          },
          circuit: {
            state: "half_open",
            reasonCode: "github_api_5xx",
            openedAt: "2026-07-15T01:00:00.000Z",
            nextProbeAt: "2026-07-15T01:45:00.000Z",
          },
          mutationMarker: {
            ...baseState.mutationMarker,
            status: "confirmed_running",
            attemptNumber: 2,
            specDigest: digestC,
            childSupervisorRunId: "supervised-20260715T010000Z-000000000abc",
            reasonCode: "active_beyond_old_bound",
          },
          childSupervisorRunId: "supervised-20260715T010000Z-000000000abc",
          status: "confirmed_running",
        })
        : withStateUpdatedAt(transitionOutageMarker(baseState, {
          status: "recovered",
          reasonCode: "terminal_fixture",
        }), updatedAt);
      writeOutageFixtureState(config, state);
    }
    const ordered = storageKeyOrderFromDisk(config);
    assert.equal(ordered.findIndex((entry) => entry.key === storageKeyForState(config, candidates[activeIndex])) < ordered.length - 20, true);

    const beforeBytes = readOutageFixtureBytes(config);
    const status = getRunnerStatus(config).outageResubmission;
    const health = evaluateAutoRunnerHealth({ logsRoot: config.logsRoot, now }).body.outageResubmission;
    assert.equal(status.recordCount, 25);
    assert.equal(status.totalRecordCount, 25);
    assert.equal(status.validRecordCount, 25);
    assert.equal(status.invalidRecordCount, 0);
    assert.equal(status.activeSourceRun.taskKey, candidates[activeIndex].correlation.taskKey);
    assert.equal(status.activeSourceRun.status, "confirmed_running");
    assert.equal(status.attemptCount, 2);
    assert.equal(status.nextEligibleAt, "2026-07-15T01:45:00.000Z");
    assert.equal(status.deadlineAt, "2026-07-16T01:45:00.000Z");
    assert.equal(status.circuitState, "half_open");
    assert.equal(status.lastSanitizedReason, "active_beyond_old_bound");
    assert.equal(status.childRunId, "supervised-20260715T010000Z-000000000abc");
    assert.equal(status.terminalOutcome, null);
    assert.deepEqual(health.activeSourceRun, status.activeSourceRun);
    assert.equal(health.terminalOutcome, null);
    assert.deepEqual(readOutageFixtureBytes(config), beforeBytes);
  } finally {
    config.cleanup();
  }
});

test("active outage state outranks newer terminal records across complete inventory", () => {
  const config = tempConfig();
  try {
    const active = withStateUpdatedAt(transitionOutageMarker(fixtureOutageStateForIndex(40), {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000def",
      specDigest: digestC,
      reasonCode: "child_submission_confirmed",
    }), "2026-07-15T00:01:00.000Z");
    writeOutageFixtureState(config, active);
    for (let index = 0; index < 24; index += 1) {
      writeOutageFixtureState(config, withStateUpdatedAt(transitionOutageMarker(fixtureOutageStateForIndex(index), {
        status: "recovered",
        reasonCode: "newer_terminal_fixture",
      }), isoAtMinutes(10 + index)));
    }

    const status = getRunnerStatus(config).outageResubmission;
    const health = evaluateAutoRunnerHealth({ logsRoot: config.logsRoot, now }).body.outageResubmission;
    assert.equal(status.recordCount, 25);
    assert.equal(status.activeSourceRun.taskKey, active.correlation.taskKey);
    assert.equal(status.terminalOutcome, null);
    assert.equal(health.activeSourceRun.taskKey, active.correlation.taskKey);
    assert.equal(health.terminalOutcome, null);
  } finally {
    config.cleanup();
  }
});

test("active outage selection is deterministic by updatedAt and stable tie breaker", () => {
  const config = tempConfig();
  try {
    const older = withStateUpdatedAt(transitionOutageMarker(fixtureOutageStateForIndex(60), {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000060",
      specDigest: digestC,
      reasonCode: "older_active",
    }), "2026-07-15T00:10:00.000Z");
    const newer = withStateUpdatedAt(transitionOutageMarker(fixtureOutageStateForIndex(61), {
      status: "confirmed_running",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000061",
      specDigest: digestC,
      reasonCode: "newest_active",
    }), "2026-07-15T00:30:00.000Z");
    const tiedA = withStateUpdatedAt(transitionOutageMarker(fixtureOutageStateForIndex(62), {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000062",
      specDigest: digestC,
      reasonCode: "tie_a",
    }), "2026-07-15T00:20:00.000Z");
    const tiedB = withStateUpdatedAt(transitionOutageMarker(fixtureOutageStateForIndex(63), {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000063",
      specDigest: digestC,
      reasonCode: "tie_b",
    }), "2026-07-15T00:20:00.000Z");
    for (const state of [tiedA, older, newer, tiedB]) writeOutageFixtureState(config, state);
    assert.equal(getRunnerStatus(config).outageResubmission.activeSourceRun.taskKey, newer.correlation.taskKey);

    const reverseConfig = tempConfig();
    try {
      for (const state of [newer, tiedB, older, tiedA].reverse()) writeOutageFixtureState(reverseConfig, state);
      assert.equal(getRunnerStatus(reverseConfig).outageResubmission.activeSourceRun.taskKey, newer.correlation.taskKey);
    } finally {
      reverseConfig.cleanup();
    }

    const tieConfigA = tempConfig();
    const tieConfigB = tempConfig();
    try {
      for (const state of [tiedA, tiedB]) writeOutageFixtureState(tieConfigA, state);
      for (const state of [tiedB, tiedA]) writeOutageFixtureState(tieConfigB, state);
      const expectedTieWinner = [tiedA, tiedB].sort((left, right) => stableOutageTieKey(right).localeCompare(stableOutageTieKey(left)))[0];
      assert.equal(getRunnerStatus(tieConfigA).outageResubmission.activeSourceRun.taskKey, expectedTieWinner.correlation.taskKey);
      assert.equal(getRunnerStatus(tieConfigB).outageResubmission.activeSourceRun.taskKey, expectedTieWinner.correlation.taskKey);
    } finally {
      tieConfigA.cleanup();
      tieConfigB.cleanup();
    }
  } finally {
    config.cleanup();
  }
});

test("terminal outage fallback selects most recently updated terminal from complete inventory", () => {
  const config = tempConfig();
  try {
    const terminals = Array.from({ length: 25 }, (_, index) => withStateUpdatedAt(transitionOutageMarker(fixtureOutageStateForIndex(90 + index), {
      status: index === 7 ? "blocked" : "recovered",
      reasonCode: index === 7 ? "selected_terminal_fixture" : "terminal_fixture",
    }), index === 7 ? "2026-07-15T02:00:00.000Z" : isoAtMinutes(index + 1)));
    for (const state of terminals.slice().reverse()) writeOutageFixtureState(config, state);

    const status = getRunnerStatus(config).outageResubmission;
    const health = evaluateAutoRunnerHealth({ logsRoot: config.logsRoot, now }).body.outageResubmission;
    assert.equal(status.recordCount, 25);
    assert.equal(status.activeSourceRun, null);
    assert.equal(status.terminalOutcome, "blocked");
    assert.equal(status.lastSanitizedReason, "selected_terminal_fixture");
    assert.equal(status.attemptCount, terminals[7].mutationMarker.attemptNumber);
    assert.equal(health.activeSourceRun, null);
    assert.equal(health.terminalOutcome, "blocked");
    assert.equal(health.lastSanitizedReason, "selected_terminal_fixture");
  } finally {
    config.cleanup();
  }
});

test("invalid outage inventory suppresses active and terminal details while preserving full counts", () => {
  const config = tempConfig();
  try {
    const active = transitionOutageMarker(fixtureOutageStateForIndex(130), {
      status: "confirmed_running",
      childSupervisorRunId: "supervised-20260715T010000Z-000000000130",
      specDigest: digestC,
      reasonCode: "valid_active",
    });
    writeOutageFixtureState(config, active);
    const root = path.dirname(outageResubmissionStatePath(config, active));
    writeFileSync(path.join(root, `${"f".repeat(64)}.json`), "{not-json", { mode: 0o600 });

    const status = getRunnerStatus(config).outageResubmission;
    const healthResult = evaluateAutoRunnerHealth({ logsRoot: config.logsRoot, now });
    assert.equal(status.operatorActionRequired, true);
    assert.equal(status.reasonCode, "malformed_state");
    assert.equal(status.recordCount, 2);
    assert.equal(status.totalRecordCount, 2);
    assert.equal(status.validRecordCount, 1);
    assert.equal(status.invalidRecordCount, 1);
    assert.equal(status.activeSourceRun, null);
    assert.equal(status.childRunId, null);
    assert.equal(status.terminalOutcome, null);
    assert.equal(healthResult.httpStatus, 503);
    assert.equal(healthResult.body.outageResubmission.operatorActionRequired, true);
    assert.equal(healthResult.body.outageResubmission.validRecordCount, 1);
    assert.equal(healthResult.body.outageResubmission.invalidRecordCount, 1);
    assert.equal(healthResult.body.outageResubmission.activeSourceRun, null);
    assert.equal(JSON.stringify(healthResult.body).includes("{not-json"), false);
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
      recoveryState: incompleteRecoveryState(),
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

function fixtureOutageStateForSource(sourceInput) {
  return createOutageResubmissionState({
    correlation: {
      ...sourceInput,
      outageProviderDomain: "github_api",
      outageFingerprint: githubApi503Fingerprint,
    },
    outage: {
      providerDomain: "github_api",
      outageClass: "github_api_5xx",
      outageFingerprint: githubApi503Fingerprint,
      firstFailureAt: sourceInput.firstFailureAt,
      lastFailureAt: sourceInput.lastFailureAt,
      reasonCode: "github_api_5xx",
    },
    schedule: {
      attemptNumber: sourceInput.attemptNumber || 1,
      nextEligibleAt: "2026-07-15T00:35:00.000Z",
      deadlineAt: "2026-07-16T00:00:00.000Z",
      maxAttempts: 3,
      maxWallClockMs: 24 * 60 * 60 * 1000,
    },
  });
}

function incompleteRecoveryState(overrides = {}) {
  return createInitialRecoveryState({
    taskKey: "20260715-0013",
    issue: { number: 913, title: "Outage", url: "u" },
    runId: "run-2026-07-15T000000Z",
    supervisorRunId: "supervised-20260715T000000Z-000000000001",
    branchName: source().branchName,
    baseSha: shaA,
    currentHeadSha: shaB,
    pr: { number: source().prNumber, url: "u", headSha: source().prHeadSha, headRefName: source().branchName, baseRefName: "main", state: "OPEN" },
    phase: "ci_wait",
    firstIncompleteAction: "wait_for_checks",
    ...overrides,
  });
}

function recoveryStateForSource(sourceInput) {
  return createInitialRecoveryState({
    taskKey: sourceInput.taskKey,
    issue: { number: sourceInput.issueNumber, title: "Outage", url: "u" },
    runId: sourceInput.runnerRunId,
    supervisorRunId: sourceInput.supervisorRunId,
    branchName: sourceInput.branchName,
    baseSha: sourceInput.baseSha,
    currentHeadSha: sourceInput.currentHeadSha,
    pr: sourceInput.prNumber === null && sourceInput.prHeadSha === null
      ? null
      : { number: sourceInput.prNumber, url: "u", headSha: sourceInput.prHeadSha, headRefName: sourceInput.branchName, baseRefName: "main", state: "OPEN" },
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

function exactMergedChild(config, state = fixtureOutageState(), overrides = {}, summaryOptions = {}) {
  const child = exactChild(state, {
    state: "completed",
    terminalOutcome: "completed",
    runnerRunId: summaryOptions.runnerRunId || `run-2026-07-15T01${String(summaryOptions.minute || 0).padStart(2, "0")}00Z`,
    ...overrides,
  });
  writeTrustedChildSummary(config, child, summaryOptions);
  return child;
}

function writeTrustedChildSummary(config, child, options = {}) {
  const sourceInput = options.sourceInput || source();
  const runnerRunId = options.runnerRunId || child.runnerRunId;
  const iteration = options.iterationOverrides
    ? mergedSummaryIteration(sourceInput, options.iterationOverrides)
    : mergedSummaryIteration(sourceInput);
  if (typeof options.iterationMutator === "function") options.iterationMutator(iteration);
  const summary = {
    runId: runnerRunId,
    supervisorRunId: child.runId,
    mode: "run",
    startedAt: options.startedAt || "2026-07-15T01:00:00.000Z",
    finishedAt: options.finishedAt || "2026-07-15T01:05:00.000Z",
    baseOriginMainSha: options.baseOriginMainSha || sourceInput.baseSha,
    stopReason: Object.hasOwn(options, "stopReason") ? options.stopReason : "max-iterations-reached",
    iterations: options.iterations || [iteration],
    ...(options.summaryOverrides || {}),
  };
  if (typeof options.summaryMutator === "function") options.summaryMutator(summary);
  const summariesRoot = path.join(config.logsRoot, "summaries");
  mkdirSync(summariesRoot, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(summariesRoot, `${runnerRunId}.json`), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(path.join(summariesRoot, `${runnerRunId}.md`), "# summary\n", { mode: 0o600 });
  return summary;
}

function mergedSummaryIteration(sourceInput = source(), overrides = {}) {
  return {
    runId: overrides.runId || "run-2026-07-15T010000Z",
    index: overrides.index || 1,
    startedAt: overrides.startedAt || "2026-07-15T01:00:00.000Z",
    finishedAt: overrides.finishedAt || "2026-07-15T01:04:00.000Z",
    issue: { number: sourceInput.issueNumber, title: "Outage" },
    branchName: sourceInput.branchName,
    baseOriginMainSha: sourceInput.baseSha,
    runnerCreatedCommitSha: sourceInput.currentHeadSha,
    pr: {
      number: sourceInput.prNumber,
      headRefName: sourceInput.branchName,
      headRefOid: sourceInput.currentHeadSha,
      baseRefName: "main",
      state: "MERGED",
    },
    outcome: "auto_merged",
    autoMerge: {
      attempted: true,
      eligible: true,
      result: "merged",
      reason: "merged",
      prNumber: sourceInput.prNumber,
      prHeadSha: sourceInput.prHeadSha,
      mergeSha: "c".repeat(40),
    },
    ...overrides,
  };
}

function exactChildForSource(state = fixtureOutageState(), sourceInput = source(), overrides = {}) {
  const runId = overrides.runId || state?.childSupervisorRunId || "supervised-20260715T010000Z-000000000602";
  const prNumber = Object.hasOwn(overrides, "prNumber") ? overrides.prNumber : sourceInput.prNumber;
  const prHeadSha = Object.hasOwn(overrides, "prHeadSha") ? overrides.prHeadSha : sourceInput.prHeadSha;
  const { prNumber: _prNumber, prHeadSha: _prHeadSha, ...rest } = overrides;
  return {
    runId,
    parentSupervisorRunId: sourceInput.supervisorRunId,
    parentRunnerRunId: sourceInput.runnerRunId,
    taskKey: sourceInput.taskKey,
    sourceIssueNumber: sourceInput.issueNumber,
    sourceBranchName: sourceInput.branchName,
    baseSha: sourceInput.baseSha,
    currentHeadSha: sourceInput.currentHeadSha,
    prNumber,
    prHeadSha,
    runnerProfile: sourceInput.runnerProfile,
    runnerConfigDigest: sourceInput.runnerConfigDigest,
    originalSupervisorSpecDigest: sourceInput.originalSupervisorSpecDigest,
    specSha256: state?.mutationMarker?.specDigest || digestB,
    state: "running",
    outageResubmission: {
      taskKey: sourceInput.taskKey,
      markerKey: state?.mutationMarker?.key,
      attemptNumber: state?.mutationMarker?.attemptNumber,
      outageFingerprint: state?.outage?.outageFingerprint || sourceInput.outageFingerprint,
      originalSupervisorSpecDigest: sourceInput.originalSupervisorSpecDigest,
      childSpecDigest: state?.mutationMarker?.specDigest || digestB,
    },
    ...rest,
  };
}

function sameMarkerSpecDriftChild(state = fixtureOutageState(), overrides = {}) {
  return exactChild(state, {
    runId: "supervised-20260715T010000Z-000000000777",
    specSha256: digestC,
    outageResubmission: {
      ...exactChild(state).outageResubmission,
      childSpecDigest: digestC,
    },
    ...overrides,
  });
}

function sameMarkerMissingSpecDigestChild(state = fixtureOutageState(), overrides = {}) {
  const child = exactChild(state, {
    runId: "supervised-20260715T010000Z-000000000778",
    ...overrides,
  });
  const { childSpecDigest, specDigest, ...outageResubmission } = child.outageResubmission;
  const { specSha256, specDigest: topLevelSpecDigest, ...withoutDigest } = child;
  return {
    ...withoutDigest,
    outageResubmission,
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

function liveIdentityForSource(sourceInput = source(), overrides = {}) {
  return {
    branchName: sourceInput.branchName,
    baseSha: sourceInput.baseSha,
    currentHeadSha: sourceInput.currentHeadSha,
    prNumber: sourceInput.prNumber,
    prHeadSha: sourceInput.prHeadSha,
    ...overrides,
  };
}

function fixtureOutageStateForIndex(index, overrides = {}) {
  const suffix = String(index).padStart(6, "0");
  const hexSuffix = index.toString(16).padStart(12, "0").slice(-12);
  return createOutageResubmissionState({
    correlation: {
      ...source({
        taskKey: `20260715-0013-${suffix}`,
        runnerRunId: `run-2026-07-15T00${String(index % 60).padStart(2, "0")}00Z`,
        supervisorRunId: `supervised-20260715T00${String(index % 60).padStart(2, "0")}00Z-${hexSuffix}`,
        attemptNumber: overrides.schedule?.attemptNumber || overrides.attemptNumber || 1,
      }),
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
      attemptNumber: overrides.schedule?.attemptNumber || overrides.attemptNumber || 1,
      nextEligibleAt: overrides.schedule?.nextEligibleAt || "2026-07-15T00:35:00.000Z",
      deadlineAt: overrides.schedule?.deadlineAt || "2026-07-16T00:00:00.000Z",
      maxAttempts: 3,
      maxWallClockMs: 24 * 60 * 60 * 1000,
    },
    circuit: overrides.circuit || null,
  });
}

function withStateUpdatedAt(state, updatedAt, overrides = {}) {
  return {
    ...state,
    ...overrides,
    timestamps: {
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt,
    },
    mutationMarker: {
      ...state.mutationMarker,
      ...(overrides.mutationMarker || {}),
      updatedAt,
    },
  };
}

function writeOutageFixtureState(config, state) {
  const statePath = outageResubmissionStatePath(config, state);
  mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function storageKeyForState(config, state) {
  return path.basename(outageResubmissionStatePath(config, state), ".json");
}

function storageKeyOrder(config, states) {
  return states
    .map((state, index) => ({ index, key: storageKeyForState(config, state) }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function storageKeyOrderFromDisk(config) {
  const root = path.dirname(outageResubmissionStatePath(config, fixtureOutageState()));
  return readdirSync(root)
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .sort()
    .map((name) => ({ key: name.slice(0, -5) }));
}

function readOutageFixtureBytes(config) {
  const root = path.dirname(outageResubmissionStatePath(config, fixtureOutageState()));
  return Object.fromEntries(readdirSync(root).sort().map((name) => [name, readFileSync(path.join(root, name), "utf8")]));
}

function stableOutageTieKey(state) {
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

function isoAtMinutes(minutes) {
  return new Date(Date.parse("2026-07-15T00:00:00.000Z") + minutes * 60 * 1000).toISOString();
}

function tempConfig(options = {}) {
  const { enabled = true } = options;
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-outage-controller-"));
  const profilePath = resolveProfile("default", logsRoot).runnerConfigPath;
  mkdirSync(path.dirname(profilePath), { recursive: true, mode: 0o700 });
  writeFileSync(profilePath, profileConfig, { mode: 0o600 });
  const config = {
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
  if (Object.hasOwn(options, "allowExistingPrRecovery")) {
    config.allowExistingPrRecovery = options.allowExistingPrRecovery;
  } else {
    config.allowExistingPrRecovery = true;
  }
  return config;
}

function listRelativeFiles(root, base = root) {
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRelativeFiles(absolute, base));
    } else {
      files.push(path.relative(base, absolute));
    }
  }
  return files.sort();
}
