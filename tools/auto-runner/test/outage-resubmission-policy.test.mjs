import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyOutageFailure,
  defaultOutageResubmissionConfig,
  applyOutageOperatorGate,
  evaluateOutageCircuit,
  normalizeOutageResubmissionConfig,
  outageFingerprint,
  planOutageResubmissionSchedule,
  retryableOutageClasses,
  resolveOutageCircuitProbe,
} from "../lib/outage-resubmission-policy.mjs";
import {
  buildOutageResubmissionMarker,
  createOutageResubmissionState,
  listOutageResubmissionStates,
  loadOutageResubmissionState,
  outageResubmissionStatePath,
  recordOutageAttempt,
  transitionOutageMarker,
  validateOutageResubmissionState,
  verifyOutageCorrelation,
  writeOutageResubmissionState,
} from "../lib/outage-resubmission-state.mjs";

const shaA = "a".repeat(40);
const shaB = "b".repeat(40);
const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
const now = new Date("2026-07-15T00:00:00.000Z");
const githubApiTransportReasonCodes = Object.freeze([
  "transport_disconnect",
  "transport_failure",
  "connection_reset",
  "dns_failure",
  "tls_failure",
  "network_unreachable",
  "routing_failure",
]);

test("strict classifier accepts only trusted retryable outage classes", () => {
  const cases = [
    [{ domain: "github_api", status: 429 }, "github_api_rate_limit"],
    [{ domain: "github_api", status: 403, trustedHeaders: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1784073900" } }, "github_api_rate_limit"],
    [{ domain: "github_api", status: 503 }, "github_api_5xx"],
    [{ domain: "github_api", reasonCode: "api_5xx" }, "github_api_5xx"],
    [{ domain: "github_api", reasonCode: "timeout" }, "github_api_timeout"],
    ...githubApiTransportReasonCodes.map((reasonCode) => [{ domain: "github_api", reasonCode }, "github_api_transport"]),
    [{ domain: "github_actions", reasonCode: "api_timeout" }, "github_actions_check_transport"],
    [{ domain: "github_actions", reasonCode: "api_5xx" }, "github_actions_api_outage"],
    [{ domain: "github_actions", reasonCode: "workflow_service_unavailable" }, "github_actions_service_unavailable"],
    [{ domain: "codex_provider", status: 429 }, "codex_provider_rate_limit"],
    [{ domain: "codex_provider", status: 500 }, "codex_provider_5xx"],
    [{ domain: "codex_provider", reasonCode: "timeout" }, "codex_provider_timeout"],
    [{ domain: "codex_provider", reasonCode: "transport_disconnect" }, "codex_provider_transport"],
    [{ domain: "reviewer_provider", status: 429 }, "reviewer_provider_rate_limit"],
    [{ domain: "reviewer_provider", status: 502 }, "reviewer_provider_5xx"],
    [{ domain: "reviewer_provider", reasonCode: "timeout" }, "reviewer_provider_timeout"],
    [{ domain: "reviewer_provider", reasonCode: "connection_reset" }, "reviewer_provider_transport"],
    [{ domain: "scanner_service", status: 429 }, "scanner_service_rate_limit"],
    [{ domain: "scanner_service", status: 503 }, "scanner_service_5xx"],
    [{ domain: "scanner_service", reasonCode: "timeout" }, "scanner_service_timeout"],
    [{ domain: "scanner_service", reasonCode: "transport_failure" }, "scanner_service_transport"],
    [{ domain: "devbox_network", reasonCode: "tls_failure" }, "devbox_network_transport"],
  ];
  const representedClasses = new Set(cases.map(([, expected]) => expected));
  assert.deepEqual([...representedClasses].sort(), [...retryableOutageClasses].sort());
  for (const [input, expected] of cases) {
    const result = classifyOutageFailure(input);
    assert.equal(result.retryable, true, expected);
    assert.equal(result.outageClass, expected);
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(result.rawBodyAccepted, false);
  }
});

test("github api normalized reasons preserve precedence and fail closed outside trusted domain vocabulary", () => {
  const cases = [
    [{ domain: "github_api", status: 401, reasonCode: "api_5xx" }, "auth_401"],
    [{ domain: "github_api", status: 403, reasonCode: "api_5xx" }, "forbidden_403"],
    [{ domain: "github_api", status: 404, reasonCode: "api_5xx" }, "not_found_404"],
    [
      { domain: "github_api", status: 403, reasonCode: "api_5xx", trustedHeaders: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1784073900" } },
      "github_api_rate_limit",
    ],
    [{ domain: "unknown", reasonCode: "api_5xx" }, "unknown_ambiguous_failure"],
    [{ domain: "__proto__", reasonCode: "api_5xx" }, "unknown_ambiguous_failure"],
    [{ domain: "github_api", reasonCode: "not_a_real_reason" }, "unknown_ambiguous_failure"],
    [{ domain: "github_api", body: "503 api_5xx timeout transport_failure" }, "unknown_ambiguous_failure"],
    [{ domain: "github_api" }, "unknown_ambiguous_failure"],
  ];
  for (const [input, expected] of cases) {
    const result = classifyOutageFailure(input);
    assert.equal(result.outageClass, expected);
    assert.equal(result.retryable, retryableOutageClasses.includes(expected), expected);
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(result.rawBodyAccepted, false);
  }
});

test("github actions and github api both accept normalized api_5xx without sharing unrelated domain codes", () => {
  assert.equal(classifyOutageFailure({ domain: "github_api", reasonCode: "api_5xx" }).outageClass, "github_api_5xx");
  assert.equal(classifyOutageFailure({ domain: "github_actions", reasonCode: "api_5xx" }).outageClass, "github_actions_api_outage");
  assert.equal(classifyOutageFailure({ domain: "github_api", reasonCode: "workflow_service_unavailable" }).outageClass, "unknown_ambiguous_failure");
  assert.equal(classifyOutageFailure({ domain: "github_actions", reasonCode: "network_unreachable" }).outageClass, "unknown_ambiguous_failure");
  assert.equal(classifyOutageFailure({ domain: "codex_provider", reasonCode: "api_5xx" }).outageClass, "unknown_ambiguous_failure");
});

test("strict classifier blocks nonretryable and hostile untrusted evidence", () => {
  const cases = [
    [{ domain: "github_api", status: 401, body: "retry me 503" }, "auth_401"],
    [{ domain: "github_api", status: 403, body: "rate limit maybe" }, "forbidden_403"],
    [{ domain: "github_api", status: 404 }, "not_found_404"],
    [{ reasonCode: "missing_secret" }, "missing_or_invalid_secret_config"],
    [{ reasonCode: "invalid_config" }, "missing_or_invalid_secret_config"],
    [{ reasonCode: "dirty_worktree" }, "dirty_worktree"],
    [{ reasonCode: "corrupt_state" }, "corrupt_state"],
    [{ reasonCode: "stale_recovery_evidence" }, "stale_recovery_evidence"],
    [{ reasonCode: "identity_drift" }, "identity_drift"],
    [{ reasonCode: "merge_conflict" }, "merge_conflict"],
    [{ reasonCode: "failed_tests" }, "failed_tests"],
    [{ reasonCode: "failed_validation" }, "failed_validation"],
    [{ reasonCode: "code_defect" }, "code_defect"],
    [{ reasonCode: "review_finding" }, "review_finding"],
    [{ reasonCode: "scanner_finding" }, "scanner_finding"],
    [{ reasonCode: "policy_disagreement" }, "policy_disagreement"],
    [{ reasonCode: "manual_gate" }, "manual_authority_destructive_decision"],
    [{ reasonCode: "unsupported_source" }, "unsupported_source"],
    [{ reasonCode: "terminal_application_failure" }, "terminal_application_failure"],
    [{ domain: "__proto__", body: "status 429 timeout dns_failure" }, "unknown_ambiguous_failure"],
  ];
  for (const [input, expected] of cases) {
    const result = classifyOutageFailure(input);
    assert.equal(result.retryable, false, expected);
    assert.equal(result.outageClass, expected);
    assert.equal(result.rawBodyAccepted, false);
  }
});

test("policy validation, minimum outage age, backoff, jitter, attempt cap, and wall-clock cap are bounded", () => {
  assert.equal(normalizeOutageResubmissionConfig({}).allowBoundedOutageResubmission, false);
  assert.throws(() => normalizeOutageResubmissionConfig({ minimumOutageAgeMs: 0 }), /minimumOutageAgeMs/);
  assert.throws(() => normalizeOutageResubmissionConfig({ jitterRatio: 0.75 }), /jitterRatio/);
  const config = {
    ...defaultOutageResubmissionConfig,
    allowBoundedOutageResubmission: true,
    minimumOutageAgeMs: 10 * 60 * 1000,
    baseBackoffMs: 5 * 60 * 1000,
    maxBackoffMs: 20 * 60 * 1000,
    jitterRatio: 0.2,
    maxAttempts: 2,
    maxWallClockMs: 60 * 60 * 1000,
  };
  let plan = planOutageResubmissionSchedule({
    config,
    firstFailureAt: "2026-07-14T23:55:00.000Z",
    lastFailureAt: "2026-07-14T23:55:00.000Z",
    attemptNumber: 1,
    now,
    rng: () => 0.5,
  });
  assert.equal(plan.allowed, false);
  assert.equal(plan.reasonCode, "outage_not_prolonged_yet");

  plan = planOutageResubmissionSchedule({
    config,
    firstFailureAt: "2026-07-14T23:05:00.000Z",
    lastFailureAt: "2026-07-14T23:54:00.000Z",
    attemptNumber: 1,
    now,
    rng: () => 0,
  });
  assert.equal(plan.reasonCode, "outage_resubmission_eligible");
  assert.equal(plan.jitteredBackoffMs, 4 * 60 * 1000);

  plan = planOutageResubmissionSchedule({
    config,
    firstFailureAt: "2026-07-14T23:05:00.000Z",
    lastFailureAt: "2026-07-14T23:54:00.000Z",
    attemptNumber: 2,
    now,
    rng: () => 1,
  });
  assert.equal(plan.reasonCode, "outage_resubmission_deferred_by_backoff");
  assert.equal(plan.jitteredBackoffMs, 12 * 60 * 1000);

  assert.equal(planOutageResubmissionSchedule({ config, firstFailureAt: "2026-07-14T22:00:00.000Z", attemptNumber: 3, now }).reasonCode, "outage_resubmission_attempts_exhausted");
  assert.equal(planOutageResubmissionSchedule({ config, firstFailureAt: "2026-07-14T22:00:00.000Z", attemptNumber: 1, now }).reasonCode, "outage_resubmission_wall_clock_exhausted");
});

test("circuit opens for matching fingerprints, distinct runs, and half-open cooldown", () => {
  const config = {
    ...defaultOutageResubmissionConfig,
    circuitFailureThreshold: 3,
    circuitDistinctRunThreshold: 2,
    circuitCooldownMs: 10 * 60 * 1000,
  };
  const fingerprint = outageFingerprint({ domain: "github_api", outageClass: "github_api_5xx", status: 503 });
  let circuit = evaluateOutageCircuit({
    config,
    now,
    providerDomain: "github_api",
    outageFingerprint: fingerprint,
    records: [1, 2, 3].map((index) => ({
      at: `2026-07-14T23:5${index}:00.000Z`,
      providerDomain: "github_api",
      outageFingerprint: fingerprint,
      supervisorRunId: `supervised-20260714T235${index}00Z-00000000000${index}`,
    })),
  });
  assert.equal(circuit.state, "open");
  assert.equal(circuit.reasonCode, "circuit_open_matching_fingerprint");

  circuit = evaluateOutageCircuit({
    config,
    now,
    providerDomain: "scanner_service",
    records: [
      { at: "2026-07-14T23:58:00.000Z", providerDomain: "scanner_service", outageFingerprint: "a".repeat(64), supervisorRunId: "supervised-20260714T235800Z-000000000001" },
      { at: "2026-07-14T23:59:00.000Z", providerDomain: "scanner_service", outageFingerprint: "b".repeat(64), supervisorRunId: "supervised-20260714T235900Z-000000000002" },
    ],
  });
  assert.equal(circuit.reasonCode, "circuit_open_distinct_runs");

  const halfOpen = evaluateOutageCircuit({
    config,
    now: new Date("2026-07-15T00:11:00.000Z"),
    existing: { state: "open", nextProbeAt: "2026-07-15T00:10:00.000Z" },
  });
  assert.equal(halfOpen.state, "half_open");
  assert.equal(halfOpen.allowProbe, true);
  assert.equal(resolveOutageCircuitProbe({ previous: halfOpen, success: true, now, config }).state, "closed");
  const reopened = resolveOutageCircuitProbe({ previous: halfOpen, success: false, now, config });
  assert.equal(reopened.state, "open");
  assert.equal(reopened.reasonCode, "circuit_probe_failed");
});

test("operator pause and stop precede schedule and circuit decisions", () => {
  const retryable = classifyOutageFailure({ domain: "github_api", status: 503 });
  assert.equal(applyOutageOperatorGate({ operatorControl: { pause: true }, classification: retryable }).reasonCode, "operator_pause");
  assert.equal(applyOutageOperatorGate({ operatorControl: { stopAfterCurrent: true }, classification: retryable }).reasonCode, "operator_stop");
  assert.equal(
    applyOutageOperatorGate({
      operatorControl: {},
      classification: retryable,
      circuit: { state: "open", reasonCode: "circuit_open_distinct_runs" },
      schedule: { allowed: true },
    }).reasonCode,
    "circuit_open_distinct_runs",
  );
  assert.equal(
    applyOutageOperatorGate({
      classification: classifyOutageFailure({ domain: "github_api", status: 403 }),
      schedule: { allowed: true },
    }).reasonCode,
    "outage_nonretryable",
  );
  assert.equal(
    applyOutageOperatorGate({
      classification: retryable,
      schedule: { allowed: false, reasonCode: "outage_resubmission_deferred_by_backoff" },
    }).reasonCode,
    "outage_resubmission_deferred_by_backoff",
  );
  assert.equal(applyOutageOperatorGate({ classification: retryable, schedule: { allowed: true } }).allowed, true);
});

test("outage resubmission state validates identity, atomic writes, markers, corruption, and unsafe paths", () => {
  const config = tempConfig();
  try {
    const state = fixtureState();
    const written = writeOutageResubmissionState(config, state);
    assert.equal(existsSync(written.statePath), true);
    assert.equal(loadOutageResubmissionState(config, state).ok, true);
    assert.equal(verifyOutageCorrelation(state, { issueNumber: 913, currentHeadSha: shaB }).ok, true);
    assert.equal(verifyOutageCorrelation(state, { currentHeadSha: shaA }).reasonCode, "outage_resubmission_identity_drift");

    const submitted = transitionOutageMarker(state, {
      status: "submitted",
      childSupervisorRunId: "supervised-20260715T000000Z-abcdefabcdef",
    });
    assert.equal(submitted.mutationMarker.status, "submitted");
    assert.equal(recordOutageAttempt(submitted, { status: "submission_uncertain" }).attemptHistory.length, 1);
    assert.match(buildOutageResubmissionMarker({ correlation: state.correlation, attemptNumber: 1, specDigest: digestB }).key, /^[a-f0-9]{64}$/);

    writeFileSync(`${written.statePath}.tmp`, "{partial");
    assert.equal(loadOutageResubmissionState(config, state).ok, true);
    writeFileSync(written.statePath, "{not json");
    assert.equal(loadOutageResubmissionState(config, state).reasonCode, "outage_resubmission_state_corrupt");
  } finally {
    config.cleanup();
  }

  const unsafe = tempConfig();
  try {
    const state = fixtureState();
    const statePath = outageResubmissionStatePath(unsafe, state);
    mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
    writeFileSync(path.join(unsafe.logsRoot, "target.json"), "{}\n", { mode: 0o600 });
    symlinkSync(path.join(unsafe.logsRoot, "target.json"), statePath);
    assert.equal(loadOutageResubmissionState(unsafe, state).reasonCode, "outage_resubmission_state_untrusted");
    rmSync(statePath, { force: true });
    writeFileSync(statePath, `${JSON.stringify(state)}\n`, { mode: 0o666 });
    chmodSync(statePath, 0o666);
    assert.equal(loadOutageResubmissionState(unsafe, state).reasonCode, "outage_resubmission_state_untrusted");
  } finally {
    unsafe.cleanup();
  }
});

test("persisted outage state schema rejects unknown fields and partial PR identity", () => {
  const cases = [
    ["root unknown", (state) => ({ ...state, unexpected: true })],
    ["correlation unknown", (state) => ({ ...state, correlation: { ...state.correlation, unexpected: true } })],
    ["outage unknown", (state) => ({ ...state, outage: { ...state.outage, unexpected: true } })],
    ["schedule unknown", (state) => ({ ...state, schedule: { ...state.schedule, unexpected: true } })],
    ["circuit unknown", (state) => ({ ...state, circuit: { state: "closed", reasonCode: null, openedAt: null, nextProbeAt: null, unexpected: true } })],
    ["mutation marker unknown", (state) => ({ ...state, mutationMarker: { ...state.mutationMarker, unexpected: true } })],
    ["attempt history unknown", (state) => recordOutageAttempt(state, { status: "planned", reasonCode: "planned" })],
    ["pr number without head", (state) => ({ ...state, correlation: { ...state.correlation, prNumber: 917, prHeadSha: null } })],
    ["pr head without number", (state) => ({ ...state, correlation: { ...state.correlation, prNumber: null, prHeadSha: shaB } })],
  ];

  for (const [label, mutate] of cases) {
    let state = fixtureState();
    if (label === "attempt history unknown") {
      state = mutate(state);
      state.attemptHistory = [{ ...state.attemptHistory[0], unexpected: true }];
    } else {
      state = mutate(state);
    }
    assert.equal(validateOutageResubmissionState(state).ok, false, label);
  }
});

test("persisted outage state schema rejects invalid identity and status combinations", () => {
  const invalidCases = [
    ["task key", (state) => ({ ...state, correlation: { ...state.correlation, taskKey: "../bad" } })],
    ["issue", (state) => ({ ...state, correlation: { ...state.correlation, issueNumber: 0 } })],
    ["branch", (state) => ({ ...state, correlation: { ...state.correlation, branchName: "main" } })],
    ["base sha", (state) => ({ ...state, correlation: { ...state.correlation, baseSha: "A".repeat(40) } })],
    ["current head", (state) => ({ ...state, correlation: { ...state.correlation, currentHeadSha: "bad" } })],
    ["pr number", (state) => ({ ...state, correlation: { ...state.correlation, prNumber: -1 } })],
    ["pr head", (state) => ({ ...state, correlation: { ...state.correlation, prHeadSha: "A".repeat(40) } })],
    ["profile", (state) => ({ ...state, correlation: { ...state.correlation, runnerProfile: "../default" } })],
    ["config digest", (state) => ({ ...state, correlation: { ...state.correlation, runnerConfigDigest: "bad" } })],
    ["original spec digest", (state) => ({ ...state, correlation: { ...state.correlation, originalSupervisorSpecDigest: "bad" } })],
    ["attempt", (state) => ({ ...state, schedule: { ...state.schedule, attemptNumber: 0 }, mutationMarker: { ...state.mutationMarker, attemptNumber: 0 } })],
    ["marker key", (state) => ({ ...state, mutationMarker: { ...state.mutationMarker, key: "bad" } })],
    ["fingerprint mismatch", (state) => ({ ...state, outage: { ...state.outage, outageFingerprint: digestB } })],
    ["uncertain missing child", (state) => ({ ...transitionOutageMarker(state, { status: "submission_uncertain", childSupervisorRunId: "supervised-20260715T000000Z-abcdefabcdef" }), childSupervisorRunId: null, mutationMarker: { ...transitionOutageMarker(state, { status: "submission_uncertain", childSupervisorRunId: "supervised-20260715T000000Z-abcdefabcdef" }).mutationMarker, childSupervisorRunId: null } })],
    ["submitted missing spec", (state) => ({ ...transitionOutageMarker(state, { status: "submitted", childSupervisorRunId: "supervised-20260715T000000Z-abcdefabcdef" }), mutationMarker: { ...transitionOutageMarker(state, { status: "submitted", childSupervisorRunId: "supervised-20260715T000000Z-abcdefabcdef" }).mutationMarker, specDigest: null } })],
    ["confirmed missing child", (state) => ({ ...transitionOutageMarker(state, { status: "confirmed_running", childSupervisorRunId: "supervised-20260715T000000Z-abcdefabcdef" }), childSupervisorRunId: null })],
    ["terminal missing reason", (state) => ({
      ...state,
      status: "blocked",
      mutationMarker: { ...state.mutationMarker, status: "blocked", reasonCode: null },
    })],
  ];
  for (const [label, mutate] of invalidCases) {
    assert.equal(validateOutageResubmissionState(mutate(fixtureState())).ok, false, label);
  }
});

test("schema-invalid outage state fails load and failed writes preserve prior valid file", () => {
  const config = tempConfig();
  try {
    const state = fixtureState();
    const written = writeOutageResubmissionState(config, state);
    const before = readFileSync(written.statePath, "utf8");
    assert.throws(
      () => writeOutageResubmissionState(config, { ...state, correlation: { ...state.correlation, prNumber: 917, prHeadSha: null } }),
      /Invalid outage resubmission state/,
    );
    assert.equal(readFileSync(written.statePath, "utf8"), before);
    writeFileSync(written.statePath, `${JSON.stringify({ ...state, unexpected: true }, null, 2)}\n`);
    const loaded = loadOutageResubmissionState(config, state);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.reasonCode, "outage_resubmission_state_schema_invalid");
  } finally {
    config.cleanup();
  }
});

test("outage state listing returns only valid bounded records and rejects untrusted fields", () => {
  const config = tempConfig();
  try {
    const state = fixtureState();
    assert.throws(
      () => writeOutageResubmissionState(config, { ...state, rawProviderBody: "Bearer secret should not persist" }),
      /unknown state field/,
    );
    assert.throws(
      () => writeOutageResubmissionState(config, { ...state, outage: { ...state.outage, rawBody: "GITHUB_TOKEN=secret" } }),
      /unknown outage field/,
    );
    const written = writeOutageResubmissionState(config, state);
    const text = readFileSync(written.statePath, "utf8");
    assert.equal(text.includes("rawProviderBody"), false);
    assert.equal(text.includes("rawBody"), false);
    assert.equal(text.includes("Bearer secret should not persist"), false);
    assert.equal(text.includes("GITHUB_TOKEN=secret"), false);
    assert.equal(listOutageResubmissionStates(config).length, 1);
  } finally {
    config.cleanup();
  }
});

function fixtureState() {
  return createOutageResubmissionState({
    correlation: {
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
      providerDomain: "github_api",
      outageFingerprint: digestA,
    },
    outage: {
      providerDomain: "github_api",
      outageClass: "github_api_5xx",
      outageFingerprint: digestA,
      firstFailureAt: "2026-07-14T23:00:00.000Z",
      lastFailureAt: "2026-07-14T23:30:00.000Z",
      reasonCode: "github_api_5xx",
    },
    schedule: {
      attemptNumber: 1,
      nextEligibleAt: "2026-07-15T00:00:00.000Z",
      deadlineAt: "2026-07-15T23:00:00.000Z",
      maxAttempts: 3,
      maxWallClockMs: 24 * 60 * 60 * 1000,
    },
  });
}

function tempConfig() {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-outage-resubmission-"));
  return {
    logsRoot,
    cleanup: () => rmSync(logsRoot, { recursive: true, force: true }),
  };
}
