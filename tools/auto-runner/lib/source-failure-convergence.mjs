import { createHash } from "node:crypto";

export const sourceFailureContractVersion = 1;
export const sourceFailureClassifications = Object.freeze([
  "source_fix_safe",
  "retryable_infrastructure",
  "retryable_provider",
  "pending",
  "credential_or_auth_required",
  "manual_action_required",
  "manual_decision_required",
  "unsafe_or_ambiguous",
  "out_of_contract",
  "no_progress_or_oscillation",
  "terminal_success",
]);

const supportedSources = new Set([
  "local_validation", "github_check", "codeql", "semgrep", "trivy",
  "gemini", "local_codex", "github_codex",
]);
const sourceDefect = /(assert|test failed|compiler|compilation|lint|typecheck|build failed|syntax error|analysis issues?|exit code 1)/i;
const pending = /(queued|pending|in.progress|waiting)/i;
const transient = /(timeout|timed out|rate.?limit|network|runner lost|runner unavailable|capacity|502|503|504|service unavailable)/i;
const auth = /(missing secret|secret.+not (?:set|found)|credential|authentication|unauthori[sz]ed|forbidden|permission denied|token.+(?:expired|rejected))/i;
const manual = /(manual action|approval required|signing|provisioning|deploy|production activation)/i;

export function normalizeSourceFailure(input = {}) {
  const sourceKind = supportedSources.has(input.sourceKind) ? input.sourceKind : "unsupported";
  const classification = sourceFailureClassifications.includes(input.classification)
    ? input.classification
    : classifySourceFailure({ ...input, sourceKind }).classification;
  const path = boundedPath(input.path);
  const line = Number.isSafeInteger(input.line) && input.line > 0 ? input.line : null;
  const identity = normalizeIdentity(input.identity || input);
  const diagnosticDigest = digest(boundedText(input.diagnostic || input.description || input.message || "", 2_000));
  const stable = {
    sourceKind,
    repository: boundedToken(input.repository, 160),
    issueNumber: positiveInteger(input.issueNumber),
    taskKey: boundedToken(input.taskKey, 120),
    branchName: boundedToken(input.branchName, 240),
    prNumber: positiveInteger(input.prNumber),
    identity,
    commandId: boundedToken(input.commandId || input.command || input.profile, 300),
    toolId: boundedToken(input.toolId || input.tool, 80),
    ruleId: boundedToken(input.ruleId || input.rule, 160),
    path,
    line,
    diagnosticDigest,
    classification,
    sourceFixEligible: classification === "source_fix_safe",
    retryable: classification === "retryable_infrastructure" || classification === "retryable_provider",
    reasonCode: boundedToken(input.reasonCode || defaultReason(classification), 200),
    nextAction: boundedToken(input.nextAction || nextAction(classification), 120),
  };
  return Object.freeze({
    ...stable,
    fingerprint: digest(stable),
  });
}

export function classifySourceFailure(input = {}) {
  const status = String(input.status || input.conclusion || "").toLowerCase();
  const text = boundedText(input.diagnostic || input.description || input.message || input.reasonCode || "", 2_000);
  if (status === "success" || status === "passed" || input.passed === true) return result("terminal_success");
  if (pending.test(`${status} ${text}`)) return result("pending");
  if (auth.test(text)) return result("credential_or_auth_required");
  if (manual.test(text)) return result("manual_action_required");
  if (transient.test(text)) return result(input.sourceKind === "local_validation" ? "retryable_infrastructure" : "retryable_provider");
  if (input.inContract === false) return result("out_of_contract");
  if (input.structuredEvidence !== true) return result("unsafe_or_ambiguous");
  if (["codeql", "semgrep", "trivy"].includes(input.sourceKind)) {
    if (!boundedPath(input.path) || !boundedToken(input.ruleId || input.rule, 160) || !validSha(input.headSha || input.identity?.headSha)) {
      return result("unsafe_or_ambiguous");
    }
    if (input.requestedAction && input.requestedAction !== "source_fix") return result("manual_action_required");
    return result("source_fix_safe");
  }
  if (["github_check", "local_validation"].includes(input.sourceKind)) {
    return sourceDefect.test(text) || input.failureType === "source" ? result("source_fix_safe") : result("unsafe_or_ambiguous");
  }
  if (["gemini", "local_codex", "github_codex"].includes(input.sourceKind) && boundedPath(input.path)) return result("source_fix_safe");
  return result("unsafe_or_ambiguous");
}

export function freezeSourceFailureBatch(findings = [], identity = {}) {
  const normalized = findings.map((finding) => normalizeSourceFailure({ ...finding, identity: finding.identity || identity }));
  const byFingerprint = new Map(normalized.map((finding) => [finding.fingerprint, finding]));
  const frozen = [...byFingerprint.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  const candidate = normalizeIdentity(identity);
  const batchIdentity = digest({ contractVersion: sourceFailureContractVersion, candidate, fingerprints: frozen.map((finding) => finding.fingerprint) });
  return Object.freeze({ contractVersion: sourceFailureContractVersion, batchIdentity, candidate, findings: Object.freeze(frozen) });
}

export function evaluateSourceFailureBatch(batch, history = [], limits = {}) {
  if (!batch || batch.contractVersion !== sourceFailureContractVersion || !batch.batchIdentity) return result("unsafe_or_ambiguous");
  const actionable = batch.findings.filter((finding) => finding.classification === "source_fix_safe");
  const blocking = batch.findings.find((finding) => !["source_fix_safe", "pending", "retryable_infrastructure", "retryable_provider", "terminal_success"].includes(finding.classification));
  if (blocking) return { ...result(blocking.classification), finding: blocking };
  if (actionable.length === 0) {
    const retry = batch.findings.find((finding) => finding.retryable);
    if (retry) return result(retry.classification);
    if (batch.findings.some((finding) => finding.classification === "pending")) return result("pending");
    return result("terminal_success");
  }
  const repeats = history.filter((entry) => entry.batchIdentity === batch.batchIdentity && entry.candidate?.headSha === batch.candidate?.headSha).length;
  if (repeats >= (limits.identicalBatchWithoutHeadChange ?? 2)) return result("no_progress_or_oscillation");
  return { ...result("source_fix_safe"), actionable };
}

export function sourceFailureStatusProjection({ batch = null, decision = null, recertificationPhase = null, counters = {}, lastFixResult = null } = {}) {
  return Object.freeze({
    schemaVersion: "operational_status_v1",
    sourceFailure: batch ? {
      classification: decision?.classification || null,
      originSources: [...new Set(batch.findings.map((finding) => finding.sourceKind))].sort(),
      frozenBatchIdentity: batch.batchIdentity,
      exactCandidate: batch.candidate,
      localSourceChangingRoundsPerEpoch: counters.localSourceChangingRoundsPerEpoch ?? 0,
      githubTriggeredFixEpochsPerPr: counters.githubTriggeredFixEpochsPerPr ?? 0,
      retryable: decision?.retryable === true,
      lastFixResult: boundedObject(lastFixResult),
      recertificationPhase: boundedToken(recertificationPhase, 80),
      hardStopReason: decision && !decision.sourceFixEligible && !decision.retryable && decision.classification !== "pending" ? decision.reasonCode : null,
      nextSafeAction: decision?.nextAction || null,
    } : null,
  });
}

function result(classification) { return { classification, sourceFixEligible: classification === "source_fix_safe", retryable: classification.startsWith("retryable_"), reasonCode: defaultReason(classification), nextAction: nextAction(classification) }; }
function defaultReason(value) { return `source_failure_${value}`; }
function nextAction(value) { return ({ source_fix_safe: "run_focused_source_fix", retryable_infrastructure: "retry_bounded", retryable_provider: "wait_or_retry_provider_bounded", pending: "wait", terminal_success: "continue", no_progress_or_oscillation: "stop_fail_closed" })[value] || "stop_fail_closed"; }
function normalizeIdentity(value = {}) { return Object.freeze({ baseSha: validSha(value.baseSha) ? value.baseSha : null, headSha: validSha(value.headSha) ? value.headSha : null, treeSha: validSha(value.treeSha) ? value.treeSha : null, diffDigest: validDigest(value.diffDigest) ? value.diffDigest : null, changedFilesDigest: validDigest(value.changedFilesDigest) ? value.changedFilesDigest : null }); }
function validSha(value) { return /^[a-f0-9]{40}$/.test(String(value || "")); }
function validDigest(value) { return /^[a-f0-9]{64}$/.test(String(value || "")); }
function positiveInteger(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null; }
function boundedToken(value, max) { const text = boundedText(value, max); return text || null; }
function boundedText(value, max) { return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/(?:gh[opsu]_|github_pat_|AIza|sk-)[A-Za-z0-9_-]+/g, "[redacted]").replace(/\s+/g, " ").trim().slice(0, max); }
function boundedPath(value) { const path = boundedText(value, 300).replace(/\\/g, "/"); return path && !path.startsWith("/") && !path.includes("..") ? path : null; }
function boundedObject(value) { if (value == null) return null; const text = JSON.stringify(value); return text.length <= 2_000 ? JSON.parse(text) : { digest: digest(text), truncated: true }; }
function digest(value) { return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
