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
  readOutageResubmissionInventory,
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
const nonretryableReasonAliases = Object.freeze([
  ["missing_secret", "missing_or_invalid_secret_config"],
  ["invalid_secret", "missing_or_invalid_secret_config"],
  ["missing_config", "missing_or_invalid_secret_config"],
  ["invalid_config", "missing_or_invalid_secret_config"],
  ["dirty_worktree", "dirty_worktree"],
  ["corrupt_state", "corrupt_state"],
  ["stale_recovery_evidence", "stale_recovery_evidence"],
  ["changed_base_head_pr_identity", "identity_drift"],
  ["identity_drift", "identity_drift"],
  ["merge_conflict", "merge_conflict"],
  ["failed_tests", "failed_tests"],
  ["failed_validation", "failed_validation"],
  ["code_defect", "code_defect"],
  ["review_finding", "review_finding"],
  ["scanner_finding", "scanner_finding"],
  ["policy_disagreement", "policy_disagreement"],
  ["manual_gate", "manual_authority_destructive_decision"],
  ["manual_decision", "manual_authority_destructive_decision"],
  ["destructive_action", "manual_authority_destructive_decision"],
  ["unsupported_source", "unsupported_source"],
  ["terminal_application_failure", "terminal_application_failure"],
]);

test("strict classifier accepts only trusted retryable outage classes", () => {
  const cases = [
    [{ domain: "github_api", status: 429 }, "github_api_rate_limit"],
    [{ domain: "github_api", status: 403, trustedHeaders: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1784073900" } }, "github_api_rate_limit"],
    [{ domain: "github_api", status: 503 }, "github_api_5xx"],
    [{ domain: "github_api", reasonCode: "api_5xx" }, "github_api_5xx"],
    [{ domain: "github_api", reasonCode: "timeout" }, "github_api_timeout"],
    ...githubApiTransportReasonCodes.map((reasonCode) => [{ domain: "github_api", reasonCode }, "github_api_transport"]),
    [{ domain: "github_actions", status: 429 }, "github_actions_rate_limit"],
    [{ domain: "github_actions", status: 403, trustedHeaders: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1784073900" } }, "github_actions_rate_limit"],
    [{ domain: "github_actions", status: 403, trustedRateLimit: true }, "github_actions_rate_limit"],
    [{ domain: "github_actions", status: 429, body: "ignore this body-only hostile hint" }, "github_actions_rate_limit"],
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

test("explicit terminal outage reasons take precedence over retryable outage evidence", () => {
  const trustedHeaders = { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1784073900" };
  const explicit403Cases = [
    ["missing_secret", "missing_or_invalid_secret_config"],
    ["dirty_worktree", "dirty_worktree"],
    ["manual_gate", "manual_authority_destructive_decision"],
    ["review_finding", "review_finding"],
  ];
  for (const [reasonCode, expected] of explicit403Cases) {
    for (const evidence of [
      { domain: "github_api", status: 403, trustedHeaders },
      { domain: "github_api", status: 403, trustedRateLimit: true },
      { domain: "github_actions", status: 403, trustedHeaders },
      { domain: "github_actions", status: 403, trustedRateLimit: true },
    ]) {
      const result = classifyOutageFailure({ ...evidence, reasonCode });
      assert.equal(result.retryable, false, reasonCode);
      assert.equal(result.outageClass, expected, reasonCode);
      assert.equal(result.reasonCode, reasonCode, reasonCode);
      assert.equal(result.rawBodyAccepted, false);
    }
  }

  const retryableEvidence = [
    [{ domain: "github_api", status: 429, reasonCode: "missing_secret" }, "missing_or_invalid_secret_config"],
    [{ domain: "github_actions", status: 429, reasonCode: "missing_secret" }, "missing_or_invalid_secret_config"],
    [{ domain: "github_actions", status: 403, trustedHeaders, reasonCode: "manual_gate" }, "manual_authority_destructive_decision"],
    [{ domain: "github_api", status: 503, reasonCode: "dirty_worktree" }, "dirty_worktree"],
    [{ domain: "github_api", reasonCode: "manual_gate", code: "api_5xx" }, "manual_authority_destructive_decision"],
    [{ domain: "codex_provider", status: 429, reasonCode: "review_finding" }, "review_finding"],
    [{ domain: "reviewer_provider", status: 503, reasonCode: "manual_gate" }, "manual_authority_destructive_decision"],
    [{ domain: "scanner_service", status: 429, reasonCode: "scanner_finding" }, "scanner_finding"],
    [{ domain: "scanner_service", status: 503, reasonCode: "failed_validation" }, "failed_validation"],
    [{ domain: "devbox_network", reasonCode: "terminal_application_failure", code: "tls_failure" }, "terminal_application_failure"],
    [{ domain: "github_api", status: 401, reasonCode: "manual_gate" }, "manual_authority_destructive_decision"],
    [{ domain: "github_api", status: 404, reasonCode: "review_finding" }, "review_finding"],
  ];
  for (const [input, expected] of retryableEvidence) {
    const result = classifyOutageFailure(input);
    assert.equal(result.retryable, false, expected);
    assert.equal(result.outageClass, expected);
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(result.rawBodyAccepted, false);
  }
});

test("bare status-derived and retryable outage classifications remain unchanged without explicit terminal reasons", () => {
  const trustedHeaders = { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1784073900" };
  const cases = [
    [{ domain: "github_api", status: 403, trustedHeaders }, true, "github_api_rate_limit"],
    [{ domain: "github_api", status: 403, trustedRateLimit: true }, true, "github_api_rate_limit"],
    [{ domain: "github_api", status: 403 }, false, "forbidden_403"],
    [{ domain: "github_api", status: 401 }, false, "auth_401"],
    [{ domain: "github_api", status: 404 }, false, "not_found_404"],
    [{ domain: "github_api", status: 503 }, true, "github_api_5xx"],
    [{ domain: "github_api", reasonCode: "api_5xx" }, true, "github_api_5xx"],
    [{ domain: "github_actions", status: 429 }, true, "github_actions_rate_limit"],
    [{ domain: "github_actions", status: 403, trustedHeaders }, true, "github_actions_rate_limit"],
    [{ domain: "github_actions", status: 403, trustedRateLimit: true }, true, "github_actions_rate_limit"],
    [{ domain: "github_actions", status: 403 }, false, "forbidden_403"],
    [{ domain: "github_actions", status: 401 }, false, "auth_401"],
    [{ domain: "github_actions", status: 404 }, false, "not_found_404"],
  ];
  for (const [input, retryable, expected] of cases) {
    const result = classifyOutageFailure(input);
    assert.equal(result.retryable, retryable, expected);
    assert.equal(result.outageClass, expected);
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
    [{ domain: "github_actions", status: 403, body: "rate limit maybe" }, "forbidden_403"],
    [{ domain: "unknown", status: 429 }, "unknown_ambiguous_failure"],
    ...nonretryableReasonAliases.map(([reasonCode, expected]) => [{ reasonCode }, expected]),
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
  const eligibleSchedule = eligibleGateSchedule();
  const closedCircuit = { state: "closed", reasonCode: "circuit_closed", allowProbe: false };
  assert.equal(applyOutageOperatorGate({ operatorControl: { pause: true } }).reasonCode, "operator_pause");
  assert.equal(applyOutageOperatorGate({ operatorControl: { stopAfterCurrent: true } }).reasonCode, "operator_stop");
  assert.equal(
    applyOutageOperatorGate({
      operatorControl: { pause: true },
      classification: retryable,
      circuit: { state: "open", reasonCode: "circuit_open_distinct_runs" },
      schedule: eligibleSchedule,
    }).reasonCode,
    "operator_pause",
  );
  assert.equal(
    applyOutageOperatorGate({
      operatorControl: { terminalStop: true },
      classification: retryable,
      circuit: closedCircuit,
      schedule: eligibleSchedule,
    }).reasonCode,
    "operator_stop",
  );
  assert.equal(
    applyOutageOperatorGate({
      operatorControl: {},
      classification: retryable,
      circuit: { state: "open", reasonCode: "circuit_open_distinct_runs" },
      schedule: eligibleSchedule,
    }).reasonCode,
    "circuit_open_distinct_runs",
  );
  assert.equal(
    applyOutageOperatorGate({
      classification: classifyOutageFailure({ domain: "github_api", status: 403 }),
      circuit: closedCircuit,
      schedule: eligibleSchedule,
    }).reasonCode,
    "outage_nonretryable",
  );
  assert.equal(
    applyOutageOperatorGate({
      classification: retryable,
      schedule: { allowed: false, reasonCode: "outage_resubmission_deferred_by_backoff" },
      circuit: closedCircuit,
    }).reasonCode,
    "outage_resubmission_deferred_by_backoff",
  );
  assert.equal(applyOutageOperatorGate({ classification: retryable, circuit: closedCircuit, schedule: eligibleSchedule }).allowed, true);
  assert.equal(
    applyOutageOperatorGate({
      classification: retryable,
      circuit: { state: "half_open", reasonCode: "circuit_half_open_probe_allowed", nextProbeAt: "2026-07-15T00:10:00.000Z", allowProbe: true },
      schedule: eligibleSchedule,
    }).action,
    "plan_resubmission",
  );
});

test("operator gate fails closed unless every positive prerequisite is canonical", () => {
  const retryable = classifyOutageFailure({ domain: "github_api", status: 503 });
  const eligibleSchedule = eligibleGateSchedule();
  const closedCircuit = { state: "closed", reasonCode: "circuit_closed", allowProbe: false };
  const positive = { classification: retryable, circuit: closedCircuit, schedule: eligibleSchedule };
  assert.equal(applyOutageOperatorGate(positive).action, "plan_resubmission");

  const cases = [
    ["missing classification", { circuit: closedCircuit, schedule: eligibleSchedule }, "outage_classification_missing"],
    ["null classification", { classification: null, circuit: closedCircuit, schedule: eligibleSchedule }, "outage_classification_missing"],
    ["empty classification", { classification: {}, circuit: closedCircuit, schedule: eligibleSchedule }, "outage_classification_invalid"],
    ["malformed retryable classification", { classification: { ...retryable, terminal: true }, circuit: closedCircuit, schedule: eligibleSchedule }, "outage_classification_invalid"],
    ["hostile classification field", { classification: { ...retryable, rawProviderBody: "Bearer secret" }, circuit: closedCircuit, schedule: eligibleSchedule }, "outage_classification_invalid"],
    ["nonretryable classification", { classification: classifyOutageFailure({ domain: "github_api", status: 403 }), circuit: closedCircuit, schedule: eligibleSchedule }, "outage_nonretryable"],
    ["missing schedule", { classification: retryable, circuit: closedCircuit }, "outage_schedule_evidence_missing"],
    ["null schedule", { classification: retryable, circuit: closedCircuit, schedule: null }, "outage_schedule_evidence_missing"],
    ["empty schedule", { classification: retryable, circuit: closedCircuit, schedule: {} }, "outage_schedule_evidence_invalid"],
    ["schedule false", { classification: retryable, circuit: closedCircuit, schedule: { allowed: false, reasonCode: "outage_resubmission_deferred_by_backoff" } }, "outage_resubmission_deferred_by_backoff"],
    ["malformed positive schedule", { classification: retryable, circuit: closedCircuit, schedule: { allowed: true } }, "outage_schedule_evidence_invalid"],
    ["hostile schedule reason", { classification: retryable, circuit: closedCircuit, schedule: { allowed: false, reasonCode: "../../secret" } }, "outage_not_eligible"],
    ["missing circuit", { classification: retryable, schedule: eligibleSchedule }, "outage_circuit_evidence_missing"],
    ["null circuit", { classification: retryable, circuit: null, schedule: eligibleSchedule }, "outage_circuit_evidence_missing"],
    ["empty circuit", { classification: retryable, circuit: {}, schedule: eligibleSchedule }, "outage_circuit_evidence_invalid"],
    ["unknown circuit", { classification: retryable, circuit: { state: "unknown", reasonCode: "circuit_closed" }, schedule: eligibleSchedule }, "outage_circuit_evidence_invalid"],
    ["hostile circuit field", { classification: retryable, circuit: { ...closedCircuit, rawPath: "/tmp/secret" }, schedule: eligibleSchedule }, "outage_circuit_evidence_invalid"],
  ];

  for (const [label, input, reasonCode] of cases) {
    const result = applyOutageOperatorGate(input);
    assert.equal(result.allowed, false, label);
    assert.equal(result.reasonCode, reasonCode, label);
    assert.notEqual(result.action, "plan_resubmission", label);
    assert.equal(JSON.stringify(result).includes("Bearer secret"), false, label);
    assert.equal(JSON.stringify(result).includes("/tmp/secret"), false, label);
  }
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
    const loaded = loadOutageResubmissionState(unsafe, state);
    assert.equal(loaded.reasonCode, "outage_resubmission_state_untrusted");
    assert.equal(JSON.stringify(loaded).includes(unsafe.logsRoot), false);
    assert.equal(JSON.stringify(loaded).includes("target.json"), false);
    rmSync(statePath, { force: true });
    writeFileSync(statePath, `${JSON.stringify(state)}\n`, { mode: 0o666 });
    chmodSync(statePath, 0o666);
    const unsafeModeLoad = loadOutageResubmissionState(unsafe, state);
    assert.equal(unsafeModeLoad.reasonCode, "outage_resubmission_state_untrusted");
    assert.equal(JSON.stringify(unsafeModeLoad).includes(unsafe.logsRoot), false);
  } finally {
    unsafe.cleanup();
  }
});

test("outage correlation verification requires PR number and head as an exact pair", () => {
  const state = fixtureState();
  const noPrState = createOutageResubmissionState({
    correlation: { ...state.correlation, prNumber: null, prHeadSha: null },
    outage: state.outage,
    schedule: state.schedule,
  });
  const cases = [
    ["both omitted", state, { issueNumber: 913 }, true, null],
    ["both exact", state, { prNumber: 917, prHeadSha: shaB }, true, null],
    ["number only", state, { prNumber: 917 }, false, "prHeadSha"],
    ["head only", state, { prHeadSha: shaB }, false, "prNumber"],
    ["wrong number", state, { prNumber: 918, prHeadSha: shaB }, false, "prNumber"],
    ["wrong head", state, { prNumber: 917, prHeadSha: shaA }, false, "prHeadSha"],
    ["stored no PR with omitted pair", noPrState, { issueNumber: 913 }, true, null],
    ["stored no PR with supplied PR", noPrState, { prNumber: 917, prHeadSha: shaB }, false, "prNumber"],
    ["stored PR with explicit null pair", state, { prNumber: null, prHeadSha: null }, false, "prNumber"],
    ["stored PR with null number", state, { prNumber: null, prHeadSha: shaB }, false, "prNumber"],
    ["stored PR with null head", state, { prNumber: 917, prHeadSha: null }, false, "prHeadSha"],
    ["malformed number", state, { prNumber: 0, prHeadSha: shaB }, false, "prNumber"],
    ["malformed head", state, { prNumber: 917, prHeadSha: "B".repeat(40) }, false, "prHeadSha"],
  ];
  for (const [label, stored, expected, ok, field] of cases) {
    const result = verifyOutageCorrelation(stored, expected);
    assert.equal(result.ok, ok, label);
    if (!ok) {
      assert.equal(result.reasonCode, "outage_resubmission_identity_drift", label);
      assert.equal(result.field, field, label);
      assert.equal(JSON.stringify(result).includes(shaA), false, label);
      assert.equal(JSON.stringify(result).includes(shaB), false, label);
    }
  }
});

test("outage state creation rejects partial or malformed PR identity before canonical null erasure", () => {
  const cases = [
    ["number only", { prNumber: 917 }],
    ["head only", { prHeadSha: shaB }],
    ["malformed number", { prNumber: "917", prHeadSha: shaB }],
    ["malformed head", { prNumber: 917, prHeadSha: "B".repeat(40) }],
  ];
  for (const [label, prIdentity] of cases) {
    const state = fixtureState();
    const { prNumber, prHeadSha, ...baseCorrelation } = state.correlation;
    assert.throws(
      () => createOutageResubmissionState({
        correlation: { ...baseCorrelation, ...prIdentity },
        outage: state.outage,
        schedule: state.schedule,
      }),
      /Invalid outage resubmission state/,
      label,
    );
  }
});

test("outage resubmission state rejects intermediate symlink escapes and unsafe root modes", () => {
  const recoverySymlink = tempConfig();
  try {
    const state = fixtureState();
    const external = mkdtempSync(path.join(tmpdir(), "settleora-outage-external-"));
    symlinkSync(external, path.join(recoverySymlink.logsRoot, "recovery"));
    assert.equal(readOutageResubmissionInventory(recoverySymlink).reasonCode, "untrusted_state");
    assert.throws(() => writeOutageResubmissionState(recoverySymlink, state), /unsafe outage resubmission state/);
    assert.deepEqual(readOutageResubmissionInventory(recoverySymlink).records, []);
    rmSync(external, { recursive: true, force: true });
  } finally {
    recoverySymlink.cleanup();
  }

  const outageRootSymlink = tempConfig();
  try {
    const state = fixtureState();
    const external = mkdtempSync(path.join(tmpdir(), "settleora-outage-external-"));
    mkdirSync(path.join(outageRootSymlink.logsRoot, "recovery"), { mode: 0o700 });
    symlinkSync(external, path.join(outageRootSymlink.logsRoot, "recovery", "outage-resubmission"));
    assert.equal(loadOutageResubmissionState(outageRootSymlink, state).reasonCode, "outage_resubmission_state_untrusted");
    assert.throws(() => writeOutageResubmissionState(outageRootSymlink, state), /unsafe outage resubmission state/);
    assert.deepEqual(readOutageResubmissionInventory(outageRootSymlink).records, []);
    rmSync(external, { recursive: true, force: true });
  } finally {
    outageRootSymlink.cleanup();
  }

  const rootSymlink = tempConfig();
  try {
    const external = mkdtempSync(path.join(tmpdir(), "settleora-outage-external-"));
    const linkedLogsRoot = `${rootSymlink.logsRoot}-link`;
    symlinkSync(external, linkedLogsRoot);
    assert.equal(loadOutageResubmissionState({ logsRoot: linkedLogsRoot }, fixtureState()).reasonCode, "outage_resubmission_state_untrusted");
    assert.throws(() => writeOutageResubmissionState({ logsRoot: linkedLogsRoot }, fixtureState()), /unsafe outage resubmission state/);
    rmSync(linkedLogsRoot, { force: true });
    rmSync(external, { recursive: true, force: true });
  } finally {
    rootSymlink.cleanup();
  }

  const unsafeMode = tempConfig();
  try {
    mkdirSync(path.join(unsafeMode.logsRoot, "recovery"), { mode: 0o700 });
    chmodSync(path.join(unsafeMode.logsRoot, "recovery"), 0o777);
    assert.equal(readOutageResubmissionInventory(unsafeMode).reasonCode, "untrusted_state");
    assert.throws(() => writeOutageResubmissionState(unsafeMode, fixtureState()), /unsafe outage resubmission state/);
  } finally {
    chmodSync(path.join(unsafeMode.logsRoot, "recovery"), 0o700);
    unsafeMode.cleanup();
  }
});

test("outage resubmission state proves final realpath containment and safe first-time creation", () => {
  const config = tempConfig();
  try {
    const state = fixtureState();
    const external = mkdtempSync(path.join(tmpdir(), "settleora-outage-prefix-lookalike-"));
    const statePath = outageResubmissionStatePath(config, state);
    mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
    const externalTarget = path.join(external, "target.json");
    writeFileSync(externalTarget, "unchanged\n", { mode: 0o600 });
    symlinkSync(externalTarget, statePath);
    assert.equal(loadOutageResubmissionState(config, state).reasonCode, "outage_resubmission_state_untrusted");
    assert.throws(() => writeOutageResubmissionState(config, state), /unsafe outage resubmission state/);
    assert.equal(readFileSync(externalTarget, "utf8"), "unchanged\n");
    rmSync(statePath, { force: true });
    rmSync(external, { recursive: true, force: true });
  } finally {
    config.cleanup();
  }

  const firstWrite = tempConfig();
  try {
    const state = fixtureState();
    const written = writeOutageResubmissionState(firstWrite, state);
    assert.equal(existsSync(path.join(firstWrite.logsRoot, "recovery", "outage-resubmission")), true);
    assert.equal(path.dirname(written.statePath), path.join(firstWrite.logsRoot, "recovery", "outage-resubmission"));
    assert.equal(loadOutageResubmissionState(firstWrite, state).ok, true);
    assert.equal(readOutageResubmissionInventory(firstWrite).validCount, 1);
    const repeated = writeOutageResubmissionState(firstWrite, loadOutageResubmissionState(firstWrite, state).state);
    assert.equal(loadOutageResubmissionState(firstWrite, state).ok, true);
    assert.equal(path.dirname(repeated.statePath), path.dirname(written.statePath));
  } finally {
    firstWrite.cleanup();
  }
});

test("outage resubmission state temporary writes do not follow external symlink targets", () => {
  const config = tempConfig();
  const originalDateNow = Date.now;
  try {
    const state = fixtureState();
    const statePath = outageResubmissionStatePath(config, state);
    const root = path.dirname(statePath);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const external = mkdtempSync(path.join(tmpdir(), "settleora-outage-temp-external-"));
    const externalTarget = path.join(external, "external-target.json");
    writeFileSync(externalTarget, "unchanged\n", { mode: 0o600 });
    Date.now = () => 1234567890;
    const tempName = `.${path.basename(statePath)}.${process.pid}.1234567890.tmp`;
    const tempPath = path.join(root, tempName);
    symlinkSync(externalTarget, tempPath);
    assert.throws(() => writeOutageResubmissionState(config, state), /EEXIST|file already exists/);
    assert.equal(readFileSync(externalTarget, "utf8"), "unchanged\n");
    assert.equal(existsSync(statePath), false);
    assert.equal(readOutageResubmissionInventory(config).totalRecordCount, 0);
    rmSync(tempPath, { force: true });
    rmSync(external, { recursive: true, force: true });
  } finally {
    Date.now = originalDateNow;
    config.cleanup();
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

function eligibleGateSchedule() {
  return planOutageResubmissionSchedule({
    config: {
      ...defaultOutageResubmissionConfig,
      allowBoundedOutageResubmission: true,
      minimumOutageAgeMs: 10 * 60 * 1000,
      baseBackoffMs: 5 * 60 * 1000,
      maxBackoffMs: 20 * 60 * 1000,
      jitterRatio: 0,
      maxAttempts: 3,
      maxWallClockMs: 24 * 60 * 60 * 1000,
    },
    firstFailureAt: "2026-07-14T23:00:00.000Z",
    lastFailureAt: "2026-07-14T23:30:00.000Z",
    attemptNumber: 1,
    now,
    rng: () => 0.5,
  });
}
