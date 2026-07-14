import { createHash } from "node:crypto";

export const outagePolicyVersion = 1;

export const retryableOutageClasses = Object.freeze([
  "github_api_rate_limit",
  "github_api_5xx",
  "github_api_timeout",
  "github_api_transport",
  "github_actions_api_outage",
  "github_actions_check_transport",
  "github_actions_service_unavailable",
  "codex_provider_rate_limit",
  "codex_provider_5xx",
  "codex_provider_timeout",
  "codex_provider_transport",
  "reviewer_provider_rate_limit",
  "reviewer_provider_5xx",
  "reviewer_provider_timeout",
  "reviewer_provider_transport",
  "scanner_service_rate_limit",
  "scanner_service_5xx",
  "scanner_service_timeout",
  "scanner_service_transport",
  "devbox_network_transport",
]);

export const nonretryableOutageClasses = Object.freeze([
  "auth_401",
  "forbidden_403",
  "not_found_404",
  "missing_or_invalid_secret_config",
  "dirty_worktree",
  "corrupt_state",
  "stale_recovery_evidence",
  "identity_drift",
  "merge_conflict",
  "failed_tests",
  "failed_validation",
  "code_defect",
  "review_finding",
  "scanner_finding",
  "policy_disagreement",
  "manual_authority_destructive_decision",
  "unsupported_source",
  "unknown_ambiguous_failure",
  "terminal_application_failure",
]);

const retryableReasonCodes = new Set([
  "timeout",
  "connection_reset",
  "dns_failure",
  "tls_failure",
  "transport_disconnect",
  "transport_failure",
  "network_unreachable",
  "routing_failure",
  "service_unavailable",
  "workflow_service_unavailable",
  "check_status_transport_failure",
  "api_timeout",
  "api_5xx",
  "provider_429",
  "provider_5xx",
]);

const nonretryableReasonCodes = new Map([
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

export const defaultOutageResubmissionConfig = Object.freeze({
  allowBoundedOutageResubmission: false,
  minimumOutageAgeMs: 15 * 60 * 1000,
  baseBackoffMs: 5 * 60 * 1000,
  maxBackoffMs: 60 * 60 * 1000,
  jitterRatio: 0.2,
  maxAttempts: 3,
  maxWallClockMs: 24 * 60 * 60 * 1000,
  circuitWindowMs: 60 * 60 * 1000,
  circuitFailureThreshold: 3,
  circuitDistinctRunThreshold: 2,
  circuitCooldownMs: 30 * 60 * 1000,
});

export function normalizeOutageResubmissionConfig(input = {}) {
  const source = { ...defaultOutageResubmissionConfig, ...(input || {}) };
  return {
    allowBoundedOutageResubmission: source.allowBoundedOutageResubmission === true,
    minimumOutageAgeMs: boundedInteger(source.minimumOutageAgeMs, "minimumOutageAgeMs", 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    baseBackoffMs: boundedInteger(source.baseBackoffMs, "baseBackoffMs", 60 * 1000, 24 * 60 * 60 * 1000),
    maxBackoffMs: boundedInteger(source.maxBackoffMs, "maxBackoffMs", 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    jitterRatio: boundedNumber(source.jitterRatio, "jitterRatio", 0, 0.5),
    maxAttempts: boundedInteger(source.maxAttempts, "maxAttempts", 1, 20),
    maxWallClockMs: boundedInteger(source.maxWallClockMs, "maxWallClockMs", 5 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    circuitWindowMs: boundedInteger(source.circuitWindowMs, "circuitWindowMs", 5 * 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    circuitFailureThreshold: boundedInteger(source.circuitFailureThreshold, "circuitFailureThreshold", 2, 100),
    circuitDistinctRunThreshold: boundedInteger(source.circuitDistinctRunThreshold, "circuitDistinctRunThreshold", 2, 100),
    circuitCooldownMs: boundedInteger(source.circuitCooldownMs, "circuitCooldownMs", 60 * 1000, 7 * 24 * 60 * 60 * 1000),
  };
}

export function classifyOutageFailure(input = {}) {
  const status = Number.isInteger(input.status) ? input.status : null;
  const domain = normalizeToken(input.domain || input.provider || "unknown");
  const reasonCode = normalizeToken(input.reasonCode || input.code || "");
  const trustedRateLimit = hasTrustedRateLimitEvidence(input);
  const nonretryable = statusToNonretryable(status) || nonretryableReasonCodes.get(reasonCode);
  if (nonretryable && !(status === 403 && trustedRateLimit)) {
    return classification(false, nonretryable, domain, reasonCode || `http_${status}`, input);
  }
  const retryableClass = retryableClassFor({ status, domain, reasonCode, trustedRateLimit });
  if (retryableClass) return classification(true, retryableClass, domain, reasonCode || `http_${status}`, input);
  return classification(false, "unknown_ambiguous_failure", domain, reasonCode || "unknown", input);
}

export function planOutageResubmissionSchedule({
  config,
  firstFailureAt,
  lastFailureAt,
  attemptNumber,
  now = new Date(),
  rng = Math.random,
} = {}) {
  const policy = normalizeOutageResubmissionConfig(config);
  const nowMs = toTime(now, "now");
  const firstMs = toTime(firstFailureAt, "firstFailureAt");
  const lastMs = toTime(lastFailureAt || firstFailureAt, "lastFailureAt");
  const attempt = boundedInteger(attemptNumber, "attemptNumber", 1, policy.maxAttempts + 1);
  const deadlineMs = firstMs + policy.maxWallClockMs;
  if (!policy.allowBoundedOutageResubmission) {
    return { allowed: false, reasonCode: "outage_resubmission_disabled", deadlineAt: iso(deadlineMs) };
  }
  if (attempt > policy.maxAttempts) {
    return { allowed: false, reasonCode: "outage_resubmission_attempts_exhausted", deadlineAt: iso(deadlineMs) };
  }
  if (nowMs >= deadlineMs) {
    return { allowed: false, reasonCode: "outage_resubmission_wall_clock_exhausted", deadlineAt: iso(deadlineMs) };
  }
  const minimumEligibleMs = firstMs + policy.minimumOutageAgeMs;
  const backoffMs = Math.min(policy.maxBackoffMs, policy.baseBackoffMs * 2 ** Math.max(0, attempt - 1));
  const jitterOffset = Math.round(backoffMs * policy.jitterRatio * (boundedRng(rng) * 2 - 1));
  const jitteredBackoffMs = Math.max(1000, backoffMs + jitterOffset);
  const nextEligibleMs = Math.min(deadlineMs, Math.max(minimumEligibleMs, lastMs + jitteredBackoffMs));
  if (nowMs < minimumEligibleMs) {
    return {
      allowed: false,
      reasonCode: "outage_not_prolonged_yet",
      nextEligibleAt: iso(nextEligibleMs),
      deadlineAt: iso(deadlineMs),
      backoffMs,
      jitteredBackoffMs,
    };
  }
  if (nextEligibleMs > deadlineMs) {
    return { allowed: false, reasonCode: "outage_resubmission_next_after_deadline", nextEligibleAt: iso(nextEligibleMs), deadlineAt: iso(deadlineMs) };
  }
  return {
    allowed: nowMs >= nextEligibleMs,
    reasonCode: nowMs >= nextEligibleMs ? "outage_resubmission_eligible" : "outage_resubmission_deferred_by_backoff",
    nextEligibleAt: iso(nextEligibleMs),
    deadlineAt: iso(deadlineMs),
    backoffMs,
    jitteredBackoffMs,
  };
}

export function evaluateOutageCircuit({
  config,
  records = [],
  now = new Date(),
  providerDomain = null,
  outageFingerprint = null,
  existing = null,
} = {}) {
  const policy = normalizeOutageResubmissionConfig(config);
  const nowMs = toTime(now, "now");
  if (existing?.state === "open") {
    const nextProbeMs = toTime(existing.nextProbeAt || existing.openedAt, "nextProbeAt");
    if (nowMs < nextProbeMs) {
      return { state: "open", reasonCode: "circuit_cooldown_active", nextProbeAt: iso(nextProbeMs), allowProbe: false };
    }
    return { state: "half_open", reasonCode: "circuit_half_open_probe_allowed", nextProbeAt: iso(nextProbeMs), allowProbe: true };
  }
  const windowStart = nowMs - policy.circuitWindowMs;
  const recent = records
    .filter((record) => toTime(record.at || record.lastFailureAt || record.firstFailureAt, "recordAt") >= windowStart)
    .filter((record) => !providerDomain || normalizeToken(record.providerDomain) === normalizeToken(providerDomain));
  const fingerprintMatches = outageFingerprint
    ? recent.filter((record) => record.outageFingerprint === outageFingerprint)
    : [];
  const distinctRuns = new Set(recent.map((record) => record.supervisorRunId || record.runnerRunId || record.runId).filter(Boolean));
  if (fingerprintMatches.length >= policy.circuitFailureThreshold) {
    return circuitOpen("circuit_open_matching_fingerprint", nowMs, policy);
  }
  if (distinctRuns.size >= policy.circuitDistinctRunThreshold) {
    return circuitOpen("circuit_open_distinct_runs", nowMs, policy);
  }
  return { state: "closed", reasonCode: "circuit_closed", allowProbe: false };
}

export function resolveOutageCircuitProbe({ previous, success, now = new Date(), config } = {}) {
  const policy = normalizeOutageResubmissionConfig(config);
  const nowMs = toTime(now, "now");
  if (previous?.state !== "half_open") {
    return { state: previous?.state || "closed", reasonCode: "circuit_probe_not_active", allowProbe: false };
  }
  if (success === true) {
    return { state: "closed", reasonCode: "circuit_probe_succeeded", closedAt: iso(nowMs), allowProbe: false };
  }
  return {
    state: "open",
    reasonCode: "circuit_probe_failed",
    openedAt: iso(nowMs),
    nextProbeAt: iso(nowMs + policy.circuitCooldownMs),
    allowProbe: false,
  };
}

export function applyOutageOperatorGate({ operatorControl = {}, circuit = null, schedule = null, classification = null } = {}) {
  if (operatorControl.pause === true) {
    return { allowed: false, reasonCode: "operator_pause", action: "pause_before_outage_resubmission" };
  }
  if (operatorControl.stopAfterCurrent === true || operatorControl.terminalStop === true) {
    return { allowed: false, reasonCode: "operator_stop", action: "stop_before_outage_resubmission" };
  }
  if (classification && classification.retryable !== true) {
    return { allowed: false, reasonCode: "outage_nonretryable", action: "terminal_block" };
  }
  if (circuit?.state === "open") {
    return { allowed: false, reasonCode: circuit.reasonCode || "circuit_open", action: "defer_for_circuit" };
  }
  if (schedule?.allowed === false) {
    return { allowed: false, reasonCode: schedule.reasonCode || "outage_not_eligible", action: "defer_for_schedule" };
  }
  return { allowed: true, reasonCode: "outage_resubmission_gate_open", action: "plan_resubmission" };
}

export function outageFingerprint(input = {}) {
  return createHash("sha256")
    .update(JSON.stringify({
      domain: normalizeToken(input.domain || input.provider || "unknown"),
      outageClass: normalizeToken(input.outageClass || input.class || "unknown"),
      status: Number.isInteger(input.status) ? input.status : null,
      reasonCode: normalizeToken(input.reasonCode || input.code || ""),
    }))
    .digest("hex");
}

function retryableClassFor({ status, domain, reasonCode, trustedRateLimit }) {
  if (domain === "github_api") {
    if (status === 429 || (status === 403 && trustedRateLimit)) return "github_api_rate_limit";
    if (status >= 500 && status <= 599) return "github_api_5xx";
    if (reasonCode === "timeout" || reasonCode === "api_timeout") return "github_api_timeout";
    if (["connection_reset", "dns_failure", "tls_failure", "transport_failure"].includes(reasonCode)) return "github_api_transport";
  }
  if (domain === "github_actions") {
    if (status >= 500 && status <= 599 || reasonCode === "api_5xx") return "github_actions_api_outage";
    if (["timeout", "api_timeout", "check_status_transport_failure", "transport_failure"].includes(reasonCode)) return "github_actions_check_transport";
    if (reasonCode === "workflow_service_unavailable" || reasonCode === "service_unavailable") return "github_actions_service_unavailable";
  }
  if (domain === "codex_provider") return providerClass("codex_provider", status, reasonCode);
  if (domain === "reviewer_provider") return providerClass("reviewer_provider", status, reasonCode);
  if (domain === "scanner_service") return providerClass("scanner_service", status, reasonCode);
  if (domain === "devbox_network" && retryableReasonCodes.has(reasonCode)) return "devbox_network_transport";
  return null;
}

function providerClass(prefix, status, reasonCode) {
  if (status === 429 || reasonCode === "provider_429") return `${prefix}_rate_limit`;
  if ((status >= 500 && status <= 599) || reasonCode === "provider_5xx") return `${prefix}_5xx`;
  if (reasonCode === "timeout") return `${prefix}_timeout`;
  if (["transport_disconnect", "transport_failure", "connection_reset", "dns_failure", "tls_failure"].includes(reasonCode)) return `${prefix}_transport`;
  return null;
}

function statusToNonretryable(status) {
  if (status === 401) return "auth_401";
  if (status === 403) return "forbidden_403";
  if (status === 404) return "not_found_404";
  return null;
}

function hasTrustedRateLimitEvidence(input) {
  if (input.trustedRateLimit === true) return true;
  const headers = input.trustedHeaders || {};
  const remaining = headers["x-ratelimit-remaining"] ?? headers["X-RateLimit-Remaining"];
  const reset = headers["x-ratelimit-reset"] ?? headers["X-RateLimit-Reset"];
  return String(remaining) === "0" && /^\d{10,}$/.test(String(reset || ""));
}

function classification(retryable, outageClass, domain, reasonCode, input) {
  const sanitized = {
    retryable,
    outageClass,
    providerDomain: domain,
    reasonCode: normalizeToken(reasonCode),
    status: Number.isInteger(input.status) ? input.status : null,
  };
  return {
    ...sanitized,
    terminal: !retryable,
    fingerprint: outageFingerprint({ ...sanitized, domain }),
    rawBodyAccepted: false,
  };
}

function circuitOpen(reasonCode, nowMs, policy) {
  return {
    state: "open",
    reasonCode,
    openedAt: iso(nowMs),
    nextProbeAt: iso(nowMs + policy.circuitCooldownMs),
    allowProbe: false,
  };
}

function normalizeToken(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").slice(0, 80);
  return normalized || "unknown";
}

function boundedInteger(value, field, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer in the range ${min}..${max}`);
  }
  return value;
}

function boundedNumber(value, field, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be a number in the range ${min}..${max}`);
  }
  return value;
}

function boundedRng(rng) {
  const value = typeof rng === "function" ? rng() : 0.5;
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function toTime(value, field) {
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) throw new Error(`${field} must be an ISO timestamp or Date`);
  return ms;
}

function iso(ms) {
  return new Date(ms).toISOString();
}
