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
    commandId: boundedIdentifier(input.commandId || input.profile, 160),
    toolId: boundedToken(input.toolId || input.tool, 80),
    ruleId: boundedToken(input.ruleId || input.rule, 160),
    path,
    line,
    diagnosticDigest,
    diagnosticExcerpt: boundedDiagnostic(input.diagnostic || input.description || input.message || ""),
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
  if (/^(queued|pending|in_progress|waiting)$/.test(status)) return result("pending");
  if (auth.test(text)) return result("credential_or_auth_required");
  if (manual.test(text)) return result("manual_action_required");
  if (input.inContract === false) return result("out_of_contract");
  if (input.structuredEvidence !== true) return result("unsafe_or_ambiguous");
  if (input.failureType === "source" && ["github_check", "local_validation"].includes(input.sourceKind)) return result("source_fix_safe");
  if (transient.test(text)) return result(input.sourceKind === "local_validation" ? "retryable_infrastructure" : "retryable_provider");
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
  const candidate = normalizeIdentity(identity);
  const normalized = findings.map((finding) => {
    const suppliedHead = finding.headSha || finding.identity?.headSha || null;
    const stale = suppliedHead && suppliedHead !== candidate.headSha;
    return normalizeSourceFailure({
      ...finding,
      identity: candidate,
      headSha: candidate.headSha,
      ...(stale ? { classification: "unsafe_or_ambiguous", reasonCode: "source_failure_stale_candidate_head", nextAction: "stop_fail_closed" } : {}),
    });
  });
  const byFingerprint = new Map(normalized.map((finding) => [finding.fingerprint, finding]));
  const frozen = [...byFingerprint.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  const batchIdentity = digest({ contractVersion: sourceFailureContractVersion, candidate, fingerprints: frozen.map((finding) => finding.fingerprint) });
  return Object.freeze({ contractVersion: sourceFailureContractVersion, batchIdentity, candidate, findings: Object.freeze(frozen) });
}

export function evaluateSourceFailureBatch(batch, history = [], limits = {}) {
  if (!batch || batch.contractVersion !== sourceFailureContractVersion || !batch.batchIdentity) return result("unsafe_or_ambiguous");
  const repeats = history.filter((entry) => entry.batchIdentity === batch.batchIdentity && entry.candidate?.headSha === batch.candidate?.headSha).length;
  if (repeats >= (limits.identicalBatchWithoutHeadChange ?? 2)) return result("no_progress_or_oscillation");
  const actionable = batch.findings.filter((finding) => finding.classification === "source_fix_safe");
  const blocking = batch.findings.find((finding) => !["source_fix_safe", "pending", "retryable_infrastructure", "retryable_provider", "terminal_success"].includes(finding.classification));
  if (blocking) return { ...result(blocking.classification), finding: blocking };
  if (actionable.length === 0) {
    const retry = batch.findings.find((finding) => finding.retryable);
    if (retry) return result(retry.classification);
    if (batch.findings.some((finding) => finding.classification === "pending")) return result("pending");
    return result("terminal_success");
  }
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

export function sourceFailuresFromValidation(validation = {}, context = {}) {
  if (validation.passed === true) return [];
  const failed = (validation.results || []).find((entry) => entry?.error || entry?.status !== 0);
  if (!failed) return [{ ...context, sourceKind: "local_validation", structuredEvidence: false, diagnostic: "validation failed without a bounded command result" }];
  const diagnostic = [failed.error, failed.stderr, failed.stdout].filter(Boolean).join(" ").slice(0, 2_000);
  return [{
    ...context,
    sourceKind: "local_validation",
    structuredEvidence: typeof failed.command === "string" && (Number.isInteger(failed.status) || Boolean(failed.error)),
    commandId: validation.profile || context.profile || "validation",
    diagnostic,
    failureType: sourceDefect.test(diagnostic) ? "source" : null,
    status: failed.status,
  }];
}

export function sourceFailuresFromGithubEvidence(evidence = {}, context = {}) {
  const failures = [];
  for (const check of evidence.requiredChecks || []) {
    const conclusion = String(check.conclusion || "").toLowerCase();
    const status = String(check.status || "").toLowerCase();
    if (["success", "neutral", "skipped"].includes(conclusion) || ["success", "completed_success"].includes(status)) continue;
    failures.push({
      ...context,
      sourceKind: "github_check",
      structuredEvidence: Boolean(check.name && (check.step || check.command) && check.sanitizedLogExcerpt),
      status: conclusion || status,
      commandId: check.name,
      diagnostic: check.sanitizedLogExcerpt || check.reason || check.name || "check failed without structured diagnostics",
      failureType: check.failureType || null,
      inContract: check.scopeAllowed !== false,
    });
  }
  for (const alert of evidence.codeScanningAlerts || []) {
    if (String(alert.state || "open").toLowerCase() !== "open") continue;
    const tool = String(alert.tool?.name || alert.tool || alert.sourceKind || "").toLowerCase();
    const sourceKind = tool.includes("codeql") ? "codeql" : tool.includes("semgrep") ? "semgrep" : tool.includes("trivy") ? "trivy" : "unsupported";
    failures.push({
      ...context,
      sourceKind,
      structuredEvidence: sourceKind !== "unsupported",
      toolId: tool,
      ruleId: alert.rule?.id || alert.ruleId,
      path: alert.most_recent_instance?.location?.path || alert.mostRecentInstance?.location?.path || alert.path,
      line: alert.most_recent_instance?.location?.start_line || alert.mostRecentInstance?.location?.startLine || alert.line,
      headSha: alert.most_recent_instance?.commit_sha || alert.mostRecentInstance?.commitSha || alert.commitSha || alert.headSha,
      diagnostic: alert.rule?.description || alert.description || "structured code-scanning alert",
      requestedAction: alert.requestedAction || "source_fix",
      inContract: alert.scopeAllowed !== false,
    });
  }
  return failures;
}

function result(classification) { return { classification, sourceFixEligible: classification === "source_fix_safe", retryable: classification.startsWith("retryable_"), reasonCode: defaultReason(classification), nextAction: nextAction(classification) }; }
function defaultReason(value) { return `source_failure_${value}`; }
function nextAction(value) { return ({ source_fix_safe: "run_focused_source_fix", retryable_infrastructure: "retry_bounded", retryable_provider: "wait_or_retry_provider_bounded", pending: "wait", terminal_success: "continue", no_progress_or_oscillation: "stop_fail_closed" })[value] || "stop_fail_closed"; }
function normalizeIdentity(value = {}) { return Object.freeze({ baseSha: validSha(value.baseSha) ? value.baseSha : null, headSha: validSha(value.headSha) ? value.headSha : null, treeSha: validSha(value.treeSha) ? value.treeSha : null, diffDigest: validDigest(value.diffDigest) ? value.diffDigest : null, changedFilesDigest: validDigest(value.changedFilesDigest) ? value.changedFilesDigest : null, changedFiles: Object.freeze(Array.isArray(value.changedFiles) ? [...new Set(value.changedFiles.map(boundedPath).filter(Boolean))].sort().slice(0, 500) : []) }); }
function validSha(value) { return /^[a-f0-9]{40}$/.test(String(value || "")); }
function validDigest(value) { return /^[a-f0-9]{64}$/.test(String(value || "")); }
function positiveInteger(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null; }
function boundedToken(value, max) { const text = boundedText(value, max); return text || null; }
function boundedIdentifier(value, max) { const text = boundedText(value, max); return /^[A-Za-z0-9_.:/ -]+$/.test(text) ? text : text ? `sha256:${digest(text)}` : null; }
function boundedDiagnostic(value) { return boundedText(value, 1_200).replace(/(?:authorization|password|passwd|secret|token|api[-_ ]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]").replace(/https?:\/\/\S+[?&][^\s]+/g, "[signed-url-redacted]"); }
function boundedText(value, max) { return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/(?:gh[opsu]_|github_pat_|AIza|sk-)[A-Za-z0-9_-]+/g, "[redacted]").replace(/\s+/g, " ").trim().slice(0, max); }
function boundedPath(value) { const path = boundedText(value, 300).replace(/\\/g, "/"); return path && !path.startsWith("/") && !path.includes("..") ? path : null; }
function boundedObject(value) { if (value == null) return null; const text = JSON.stringify(value); return text.length <= 2_000 ? JSON.parse(text) : { digest: digest(text), truncated: true }; }
function digest(value) { return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
