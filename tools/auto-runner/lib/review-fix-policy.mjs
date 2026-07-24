import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { safeTimestamp, slugify } from "./logger.mjs";
import { filterForbiddenChangedFiles, laneManifest } from "./lane-policy.mjs";
import { validateDiagnosticReviewFixAuthorization } from "./review-convergence-state.mjs";

export const reviewFixMutationLanes = Object.freeze(
  Object.entries(laneManifest)
    .filter(([_id, lane]) => lane?.implementationAllowed === true && lane?.decisionType === "runnable")
    .map(([id]) => id),
);
export const reviewFixSensitiveLanes = Object.freeze([
  "auth-session-security",
  "storage-file-privacy-authz",
  "money-settlement-payment",
  "schema-migrations",
  "openapi-generated-clients",
  "sync-import-export-restore",
  "docker-compose-ci-deployment",
  "web-admin-ui",
  "mobile-build-config",
]);
export const reviewFixStopLabels = Object.freeze([
  "needs-tommy",
  "manual-gate",
  "danger-gate",
  "blocked",
  "auto-failed",
  "auto-running",
  "auto-pr-opened",
]);

export const defaultReviewFixSourceCycles = 50;
export const hardMaxReviewFixSourceCycles = 50;
export const defaultNoProgressSourceCycles = 3;
const maxContractGlobLength = 240;
const maxContractGlobSegments = 64;
const maxContractGlobWildcards = 16;
const broadAllowedPathGlobs = new Set(["**", "./**"]);
const manualActionPathPatterns = Object.freeze([
  /^\.env(?:\.|$)/i,
  /(^|\/)(secret|secrets|credential|credentials|ssh)(\/|$)/i,
  /(^|\/)(production|public|admin-exposure|store-release|testflight|app-store|play-store)(\/|$)/i,
]);
const secretRedactionMarker = "[REDACTED]";
const maxSanitizedEvidenceDepth = 8;
const maxSanitizedEvidenceArrayItems = 200;
const maxSanitizedEvidenceObjectFields = 200;
const maxRawSanitizedStringLength = 20_000;
const maxSecretRedactionPasses = 1;
const maxSecretRedactionReplacements = 1_000;
const canonicalUnquotedValueDelimiters = new Set([",", ";", "&", "?", "}", "]", ")", "\r", "\n"]);
const canonicalQuotedTailDelimiters = new Set(["\r", "\n"]);
// Escaped reviewer evidence is scanned with a fixed quote-token depth: plain,
// one escaped layer (\") and one additional layer (\\"). Deeper quote escaping
// inside a secret-shaped assignment is ambiguous and fails closed for that span.
const maxEscapedStructuralQuoteDepth = 2;
const maxEscapedDelimiterBackslashDepth = 16;
const secretLexicalBoundarySource = "(^|[?&#=:\\s,{[(;\\]])";
const directSecretKeySource = "((?=[A-Za-z0-9_-]*(?:auth|api|token|secret|password|passwd|credential|key|cookie|csrf|xsrf|jwt|session|bearer))[A-Za-z][A-Za-z0-9_-]{0,80})";
const protectedSecretLogPathPattern = /\/workspace\/logs\/settleora-auto-runner\/secrets\/(?:\[REDACTED\]|[^\s"',;)}\]]*)/gi;
const malformedDoubleQuotedAuthorizationHeaderPattern = /\b(authorization)\s*:\s*(Bearer|Basic)\s+"([^"',;&?}\]\)\r\n]*)(?=[',;&?}\]\)\r\n]|$)/gi;
const malformedSingleQuotedAuthorizationHeaderPattern = /\b(authorization)\s*:\s*(Bearer|Basic)\s+'([^'",;&?}\]\)\r\n]*)(?=[";,&?}\]\)\r\n]|$)/gi;
const authorizationHeaderPattern = /\b(authorization)\s*:\s*(Bearer|Basic)\s+(?:\[REDACTED\]|[^\s,;&}\]\r\n]+)/gi;
const standaloneAuthorizationPattern = /\b(Bearer|Basic)\s+(?:[A-Za-z0-9._~+/-]+=*|\[REDACTED\])/gi;
const authorizationAssignmentPattern = new RegExp(
  `${secretLexicalBoundarySource}(["']?)(authorization)\\2\\s*([:=])\\s*(?!(?:Bearer|Basic)\\s+)(?:"([^"\\r\\n]*)"|'([^'\\r\\n]*)'|(\\[REDACTED\\])|([^"'\\s,;&?}\\]\\r\\n]+))`,
  "gi",
);
const secretHeaderPattern = /(^|[\r\n])([ \t]*)([A-Za-z][A-Za-z0-9_-]{0,80})\s*:\s*([^\r\n]*)/g;
const quotedSecretHeaderPattern = /(["'])([ \t]*)([A-Za-z][A-Za-z0-9_-]{0,80})\s*:\s*(?!["'])([^\r\n"']*)/g;
const obviousCredentialPatterns = Object.freeze([
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
]);
const canonicalSecretKeyNames = new Set([
  "auth",
  "authheader",
  "apikey",
  "xapikey",
  "xgoogapikey",
  "geminiapikey",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "clientsecret",
  "token",
  "secret",
  "password",
  "passwd",
  "authorization",
  "authorizationheader",
  "bearer",
  "clientkey",
  "cookie",
  "csrf",
  "jwt",
  "privatetoken",
  "session",
  "setcookie",
  "xsrf",
]);
const secretAssignmentPattern = new RegExp(
  [
    secretLexicalBoundarySource,
    "([\"']?)",
    "([A-Za-z][A-Za-z0-9_-]{0,80})",
    "\\2",
    "\\s*([:=])\\s*",
    "(?:",
    "\"([^\"\\r\\n]*)\"",
    "|'([^'\\r\\n]*)'",
    "|(\\[REDACTED\\])",
    "|([^\\s,;&?}\\]\\r\\n]+)",
    ")",
  ].join(""),
  "gi",
);
const malformedDoubleQuotedDirectSecretAssignmentSource = [
    secretLexicalBoundarySource,
    "([\"']?)",
    directSecretKeySource,
    "\\2",
    "\\s*([:=])\\s*",
    "\"([^\"',;&?}\\]\\)\\r\\n]*)",
    "(?=[',;&?}\\]\\)\\r\\n]|$)",
  ].join("");
const malformedDoubleQuotedDirectSecretAssignmentPattern = new RegExp(malformedDoubleQuotedDirectSecretAssignmentSource, "gi");
const malformedDoubleQuotedDirectSecretAssignmentPatternWithIndices = new RegExp(malformedDoubleQuotedDirectSecretAssignmentSource, "gid");
const malformedSingleQuotedDirectSecretAssignmentSource = [
    secretLexicalBoundarySource,
    "([\"']?)",
    directSecretKeySource,
    "\\2",
    "\\s*([:=])\\s*",
    "'([^'\",;&?}\\]\\)\\r\\n]*)",
    "(?=[\",;&?}\\]\\)\\r\\n]|$)",
  ].join("");
const malformedSingleQuotedDirectSecretAssignmentPattern = new RegExp(malformedSingleQuotedDirectSecretAssignmentSource, "gi");
const malformedSingleQuotedDirectSecretAssignmentPatternWithIndices = new RegExp(malformedSingleQuotedDirectSecretAssignmentSource, "gid");
const directSecretAssignmentSource = [
    secretLexicalBoundarySource,
    "([\"']?)",
    directSecretKeySource,
    "\\2",
    "\\s*([:=])\\s*",
    "(?:",
    "\"([^\"\\r\\n]*)\"",
    "|'([^'\\r\\n]*)'",
    "|(\\[REDACTED\\])",
    "|([^\\\\\"'\\s,;&?}\\]\\r\\n]+)",
    ")",
  ].join("");
const directSecretAssignmentPattern = new RegExp(directSecretAssignmentSource, "gi");
const directSecretAssignmentPatternWithIndices = new RegExp(directSecretAssignmentSource, "gid");
const canonicalSecretAssignmentPrefixPatternWithIndices = new RegExp(
  [
    secretLexicalBoundarySource,
    "([\"']?)",
    directSecretKeySource,
    "\\2",
    "\\s*([:=])\\s*",
  ].join(""),
  "gid",
);
const malformedDoubleQuotedMarkerAdjacentSecretAssignmentPattern = new RegExp(
  [
    "(\\[REDACTED\\])",
    "([\"']?)",
    directSecretKeySource,
    "\\2",
    "\\s*([:=])\\s*",
    "\"([^\"',;&?}\\]\\)\\r\\n]*)",
    "(?=[',;&?}\\]\\)\\r\\n]|$)",
  ].join(""),
  "gi",
);
const malformedSingleQuotedMarkerAdjacentSecretAssignmentPattern = new RegExp(
  [
    "(\\[REDACTED\\])",
    "([\"']?)",
    directSecretKeySource,
    "\\2",
    "\\s*([:=])\\s*",
    "'([^'\",;&?}\\]\\)\\r\\n]*)",
    "(?=[\",;&?}\\]\\)\\r\\n]|$)",
  ].join(""),
  "gi",
);
const markerAdjacentSecretAssignmentPattern = new RegExp(
  [
    "(\\[REDACTED\\])",
    "([\"']?)",
    directSecretKeySource,
    "\\2",
    "\\s*([:=])\\s*",
    "(?:",
    "\"([^\"\\r\\n]*)\"",
    "|'([^'\\r\\n]*)'",
    "|(\\[REDACTED\\])",
    "|([^\\\\\"'\\s,;&?}\\]\\r\\n]+)",
    ")",
  ].join(""),
  "gi",
);
const markerAdjacentSecretAssignmentPatternWithIndices = new RegExp(markerAdjacentSecretAssignmentPattern.source, "gid");
const canonicalMarkerAdjacentSecretAssignmentPrefixPatternWithIndices = new RegExp(
  [
    "(\\[REDACTED\\])",
    "([\"']?)",
    directSecretKeySource,
    "\\2",
    "\\s*([:=])\\s*",
  ].join(""),
  "gid",
);
const authorizationHeaderPatternWithIndices = new RegExp(authorizationHeaderPattern.source, "gid");
const standaloneAuthorizationPatternWithIndices = new RegExp(standaloneAuthorizationPattern.source, "gid");
const structuredStringBounds = Object.freeze({
  provider: 80,
  source: 120,
  severity: 40,
  path: 512,
  file: 512,
  location: 1000,
  title: 800,
  message: 800,
  body: 1600,
  details: 1600,
  ruleId: 160,
  rule: 160,
  check: 160,
  authorityInvariant: 800,
  invariant: 800,
  classification: 80,
});
const structuredBooleanFields = Object.freeze(["manual", "duplicate", "material", "safelyFixable"]);

export function normalizeReviewFixMutationConfig(config = {}) {
  const externalApproval = Boolean(config.configPath && config.allowReviewFixMutation);
  const requestedRaw = Object.hasOwn(config, "maxReviewFixCycles")
    ? config.maxReviewFixCycles
    : defaultReviewFixSourceCycles;
  const requested = Number(requestedRaw);
  const malformed = !Number.isFinite(requested) || requested < 0;
  const normalizedAttempts = externalApproval && !malformed
    ? Math.min(Math.trunc(requested), hardMaxReviewFixSourceCycles)
    : 0;
  return {
    enabled: externalApproval && normalizedAttempts > 0,
    maxAttempts: normalizedAttempts,
    maxSourceChangingCycles: normalizedAttempts,
    requestedMaxAttempts: Number.isFinite(requested) ? requested : requestedRaw,
    requestedMaxSourceChangingCycles: Number.isFinite(requested) ? requested : requestedRaw,
    maxAllowedAttempts: hardMaxReviewFixSourceCycles,
    hardMaxSourceChangingCycles: hardMaxReviewFixSourceCycles,
    defaultMaxSourceChangingCycles: defaultReviewFixSourceCycles,
    malformed,
    overHardMaxPolicy: "clamp_to_hard_max",
    configPathUsed: config.configPath || null,
    allowedLanes: [...reviewFixMutationLanes],
    sensitiveLanes: [...reviewFixSensitiveLanes],
    requiresExternalConfig: true,
  };
}

export function evaluateReviewFixMutationDecision(input) {
  const config = input.config || {};
  const normalized = config.reviewFixMutation || normalizeReviewFixMutationConfig(config);
  const laneDecision = input.laneDecision?.lane && !input.laneDecision.laneManifest
    ? {
        ...input.laneDecision,
        laneManifest: laneManifest[input.laneDecision.lane],
        laneManifestAllowedPaths: laneManifest[input.laneDecision.lane]?.allowedPaths || [],
        implementationSensitivity: laneManifest[input.laneDecision.lane]?.sensitivity || input.laneDecision.implementationSensitivity || "low",
        reviewerTier: input.laneDecision.reviewerTier || laneManifest[input.laneDecision.lane]?.reviewerTier,
      }
    : input.laneDecision || {};
  const issue = input.issue || {};
  const changedFiles = input.changedFiles || [];
  const attemptCount = Number(input.attemptCount || 0);
  const rawTrigger = input.trigger || extractReviewFixTrigger(input);
  const trigger = {
    ...rawTrigger,
    findings: sanitizeFindings(rawTrigger.findings || []),
  };
  const forbiddenChangedFiles =
    input.forbiddenChangedFiles || filterForbiddenChangedFiles(changedFiles, laneDecision);
  const issueLabels = labelNames(input.issueLabels || issue.labels || []);
  const result = {
    allowed: false,
    reason: null,
    enabled: normalized.enabled,
    maxAttempts: normalized.maxAttempts,
    attemptCount,
    trigger,
    sanitizedFindings: trigger.findings || [],
    diagnostic: false,
  };
  const block = (reason) => ({ ...result, reason });

  if (normalized.malformed) return block("review_fix_budget_malformed");
  if (!config.allowReviewFixMutation || !normalized.enabled) return block("review_fix_mutation_disabled_by_config");
  if (!config.configPath) return block("review_fix_requires_external_config");
  let diagnosticAuthorization = null;
  if (attemptCount >= normalized.maxAttempts) {
    const diagnosticDecision = validateDiagnosticReviewFixAuthorization({
      reviewConvergenceState: input.reviewConvergenceState,
      diagnosticAuthorization: input.diagnosticAuthorization,
      normalizedMax: normalized.maxAttempts,
      attemptCount,
    });
    if (!diagnosticDecision.ok) return block("review_fix_attempt_limit_reached");
    diagnosticAuthorization = {
      kind: "diagnostic_review_fix_authorization",
      attemptId: diagnosticDecision.attemptId,
    };
  }
  if (config.allowStaleClaimSteal) return block("review_fix_refuses_stale_claim_stealing");
  if (config.allowFollowupIssueCreation && !config.trustedRealRunApproved) return block("review_fix_refuses_followup_issue_creation");
  if (config.allowSystemdEnablement) return block("review_fix_refuses_systemd_enablement");
  if (config.trustedRealRunApproved && !config.allowAutoMerge) return block("production_review_fix_requires_auto_merge");
  if (trigger.source === "review_fix_canary_fixture" && !config.reviewFixCanaryFixture?.enabled) {
    return block("review_fix_fixture_trigger_without_fixture_mode");
  }
  if (!laneDecision.allowedToImplement) return block("lane_not_allowed_to_implement");
  if (!reviewFixMutationLanes.includes(laneDecision.lane)) return block("lane_not_review_fix_approved");
  if (
    config.trustedRealRunApproved &&
    !Array.isArray(config.autoMergePolicy?.approvedLanes)
  ) return block("production_review_fix_approved_lanes_missing");
  if (
    config.trustedRealRunApproved &&
    !config.autoMergePolicy.approvedLanes.includes(laneDecision.canonicalLane || laneDecision.lane)
  ) return block("lane_not_approved_for_production_auto_merge");
  if (!laneDecision.autoMergeEligible || laneDecision.contract?.autoMergeEligible !== true) {
    return block("contract_not_auto_merge_eligible");
  }
  if (laneDecision.manualMergeRequired || laneDecision.contract?.manualMergeRequired !== false) {
    return block("manual_merge_required");
  }
  if (laneDecision.dangerGate || (laneDecision.dangerReasons || []).length > 0) return block("danger_gate_scope");
  const stopLabel = issueLabels.find((label) => reviewFixStopLabels.includes(label));
  if (stopLabel) return block(`issue_stop_label:${stopLabel}`);
  const unsafeContractPath = (laneDecision.allowedPaths || []).find((glob) => isUnsafeAllowedPathGlob(glob, laneDecision.lane));
  if (unsafeContractPath) return block(`unsafe_contract_allowed_path:${unsafeContractPath}`);
  if (forbiddenChangedFiles.length > 0) return block(`forbidden_changed_files:${forbiddenChangedFiles.join(",")}`);
  if (changedFiles.length === 0) return block("no_changed_files");
  const contractPathDecision = evaluateReviewFixContractPaths({ laneDecision, changedFiles });
  if (!contractPathDecision.ok) return block(contractPathDecision.reason);
  const strongGateDecision = evaluateReviewFixStrongGates({ laneDecision, validation: input.validation, review: input.review, externalReview: input.externalReview, mergePolicy: input.mergePolicy, trigger });
  if (!strongGateDecision.ok) return block(strongGateDecision.reason);
  if (input.validation?.passed !== true) return block("local_validation_not_passed_before_review_fix");
  if (!trigger.actionable) return block(trigger.reason || "review_finding_not_actionable");

  return {
    ...result,
    allowed: true,
    reason: "review_fix_mutation_gates_passed",
    diagnostic: Boolean(diagnosticAuthorization),
    diagnosticAuthorization,
    laneSensitivity: laneDecision.laneManifest?.sensitivity || laneManifest[laneDecision.lane]?.sensitivity || "unknown",
    requiredReviewerTier: requiredReviewFixReviewerTier(laneDecision),
    cycleBudget: {
      requested: normalized.requestedMaxSourceChangingCycles,
      normalized: normalized.maxSourceChangingCycles,
      hardMaximum: normalized.hardMaxSourceChangingCycles,
      policy: normalized.overHardMaxPolicy,
    },
  };
}

export function evaluateReviewFixContractPaths({ laneDecision = {}, changedFiles = [] } = {}) {
  const allowedPaths = laneDecision.allowedPaths || [];
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) {
    return { ok: false, reason: "missing_contract_allowed_paths" };
  }
  const unsafe = allowedPaths.find((glob) => isUnsafeAllowedPathGlob(glob, laneDecision.lane));
  if (unsafe) return { ok: false, reason: `unsafe_contract_allowed_path:${unsafe}` };
  const outOfContract = changedFiles.map((file) => normalizePath(file)).find((file) => !matchesAnyAllowedPath(file, allowedPaths));
  if (outOfContract) return { ok: false, reason: `changed_file_outside_contract:${outOfContract}` };
  const manualActionPath = changedFiles.map((file) => normalizePath(file)).find((file) => manualActionPathPatterns.some((pattern) => pattern.test(file)));
  if (manualActionPath) return { ok: false, reason: `manual_action_path:${manualActionPath}` };
  if (laneDecision.lane === "openapi-generated-clients") {
    const generatedOnly = changedFiles
      .map((file) => normalizePath(file))
      .some((file) => /^packages\/client-(web|dart)\/.*\/generated(?:\/|$)/.test(file));
    const hasContractOrGenerator = changedFiles
      .map((file) => normalizePath(file))
      .some((file) => /^packages\/contracts\/openapi(?:\/|$)/.test(file) || /^tools\/(?:generate|validate)-clients\.mjs$/.test(file));
    if (generatedOnly && !hasContractOrGenerator) return { ok: false, reason: "generated_clients_require_authoritative_generator_or_contract_change" };
  }
  return { ok: true, reason: "contract_paths_ok" };
}

export function evaluateSourceFailureFixMutationDecision(input = {}) {
  const config = input.config || {};
  const laneDecision = input.laneDecision || {};
  const sourceFixContext = input.sourceFailureFix || {};
  const batch = sourceFixContext.batch || null;
  const decision = sourceFixContext.decision || null;
  const changedFiles = Array.isArray(input.changedFiles) ? input.changedFiles : [];
  const forbidden = Array.isArray(input.forbiddenChangedFiles) ? input.forbiddenChangedFiles : [];
  const labels = (input.issue?.labels || []).map((label) => typeof label === "string" ? label : label?.name).filter(Boolean);
  const normalized = config.reviewFixMutation || normalizeReviewFixMutationConfig(config);
  const block = (reason) => ({ allowed: false, reason, mode: "source_failure_fix" });
  if (!normalized.enabled || !config.allowReviewFixMutation || !config.configPath) return block("source_failure_fix_mutation_disabled_by_config");
  if (!batch || batch.contractVersion !== 1 || !/^[a-f0-9]{64}$/.test(batch.batchIdentity || "") || !Array.isArray(batch.findings) || batch.findings.length === 0) return block("source_failure_fix_batch_invalid");
  if (!decision?.sourceFixEligible || decision.classification !== "source_fix_safe") return block("source_failure_fix_batch_not_safe");
  const identity = batch.candidate || {};
  if (![identity.baseSha, identity.headSha, identity.treeSha].every((value) => /^[a-f0-9]{40}$/.test(value || "")) || !/^[a-f0-9]{64}$/.test(identity.diffDigest || "") || !Array.isArray(identity.changedFiles)) return block("source_failure_fix_candidate_identity_invalid");
  if (identity.headSha !== sourceFixContext.candidateHead || identity.baseSha !== sourceFixContext.baseSha) return block("source_failure_fix_candidate_identity_mismatch");
  if (JSON.stringify([...identity.changedFiles].sort()) !== JSON.stringify([...changedFiles].sort())) return block("source_failure_fix_changed_files_mismatch");
  if (batch.findings.some((finding) => finding.classification !== "source_fix_safe" || finding.sourceFixEligible !== true || finding.identity?.headSha !== identity.headSha || !finding.repository || !finding.issueNumber || !finding.taskKey || !finding.branchName || finding.repository !== config.repositorySlug || finding.issueNumber !== input.issue?.number || finding.branchName !== input.branchName || (["local_validation", "github_check"].includes(finding.sourceKind) && !finding.commandId) || (finding.sourceKind === "local_validation" && finding.commandId !== laneDecision.validationProfile))) return block("source_failure_fix_finding_not_authorized");
  if (batch.findings.some((finding) => /(suppress|disable|exclude|skip (?:the )?tests?|hand.?edit generated|ignore scanner|remove check|weaken workflow|expand dependenc)/i.test(finding.diagnosticExcerpt || ""))) return block("source_failure_fix_unsafe_remediation_requested");
  if (!laneDecision.allowedToImplement || !reviewFixMutationLanes.includes(laneDecision.lane)) return block("lane_not_source_failure_fix_approved");
  if (!laneDecision.autoMergeEligible || laneDecision.contract?.autoMergeEligible !== true || laneDecision.manualMergeRequired || laneDecision.contract?.manualMergeRequired !== false) return block("source_failure_fix_manual_or_non_auto_contract");
  if (laneDecision.dangerGate || (laneDecision.dangerReasons || []).length > 0) return block("danger_gate_scope");
  const stopLabel = labels.find((label) => reviewFixStopLabels.includes(label));
  if (stopLabel) return block(`issue_stop_label:${stopLabel}`);
  if (forbidden.length > 0) return block(`forbidden_changed_files:${forbidden.join(",")}`);
  const paths = evaluateReviewFixContractPaths({ laneDecision, changedFiles });
  if (!paths.ok) return block(paths.reason);
  return { allowed: true, reason: "source_failure_fix_mutation_gates_passed", mode: "source_failure_fix", validationPassedBeforeFix: input.validation?.passed === true, failedValidationExplicitlyAuthorized: input.validation?.passed === false, cycleBudget: { normalized: normalized.maxSourceChangingCycles, hardMaximum: normalized.hardMaxSourceChangingCycles } };
}

export function evaluateReviewFixStrongGates({ laneDecision = {}, validation = {}, review = {}, externalReview = {}, mergePolicy = {}, trigger = null } = {}) {
  if (!reviewFixSensitiveLanes.includes(laneDecision.lane)) return { ok: true, reason: "standard_lane_gates_ok" };
  if (validation?.passed !== true || validation.profile === "docs-only") return { ok: false, reason: "sensitive_lane_requires_strong_validation" };
  const tier = externalReview?.tier || null;
  if (!["strong_independent", "tie_breaker"].includes(tier)) return { ok: false, reason: "sensitive_lane_requires_strong_independent_review" };
  if (externalReview?.status !== "pass" || !["pass", "approved"].includes(externalReview?.verdict || externalReview?.sanitizedResponseSummary?.verdict || "pass")) {
    return { ok: false, reason: "sensitive_lane_requires_passed_strong_independent_review" };
  }
  const verdict = review?.verdict?.verdict || null;
  const actionablePreFixCodexTrigger =
    verdict === "changes_requested" &&
    trigger?.actionable === true &&
    trigger.source === "codex_mechanics" &&
    trigger.verdict === "changes_requested";
  if (verdict && !["approved", "pass"].includes(verdict) && !actionablePreFixCodexTrigger) return { ok: false, reason: "sensitive_lane_codex_review_not_approved" };
  if (mergePolicy?.exactHeadRequired === false) return { ok: false, reason: "sensitive_lane_requires_exact_head_merge_policy" };
  return { ok: true, reason: "sensitive_lane_strong_gates_ok" };
}

export function requiredReviewFixReviewerTier(laneDecision = {}) {
  if (reviewFixSensitiveLanes.includes(laneDecision.lane)) return "strong_independent";
  return laneDecision.reviewerTier || laneDecision.laneManifest?.reviewerTier || "cheap_independent";
}

export function extractReviewFixTrigger(input = {}) {
  const externalReview = input.externalReview || null;
  const review = input.review || null;
  const externalVerdict = externalReview?.sanitizedResponseSummary || null;
  if (
    externalReview?.status === "blocked" &&
    externalReview.reason === "blocked_external_reviewer_non_pass" &&
    externalVerdict &&
    ["fail", "needs_tommy", "danger_gate"].includes(externalVerdict.verdict) &&
    externalVerdict.verdict === "fail" &&
    Array.isArray(externalVerdict.findings) &&
    externalVerdict.findings.length > 0
  ) {
    return {
      actionable: true,
      source: externalReview.provider === "review_fix_canary_fixture" ? "review_fix_canary_fixture" : "integrated_gemini",
      verdict: externalVerdict.verdict,
      findings: sanitizeFindings(externalVerdict.findings),
    };
  }
  const verdict = review?.verdict || null;
  if (
    verdict?.verdict === "changes_requested" &&
    verdict.recommended_next_action === "run_safe_fix_cycle" &&
    Array.isArray(verdict.blocking_findings) &&
    verdict.blocking_findings.length > 0
  ) {
    return {
      actionable: true,
      source: "codex_mechanics",
      verdict: verdict.verdict,
      findings: sanitizeFindings(verdict.blocking_findings),
    };
  }
  if (externalReview?.status === "blocked") {
    return { actionable: false, source: "integrated_gemini", reason: `external_review_not_actionable:${externalReview.reason || "unknown"}`, findings: [] };
  }
  if (verdict?.verdict) {
    return { actionable: false, source: "codex_mechanics", reason: `codex_review_not_actionable:${verdict.verdict}`, findings: [] };
  }
  return { actionable: false, source: "unknown", reason: "missing_review_trigger", findings: [] };
}

export function buildReviewFixPrompt({ issue, laneDecision, branchName, changedFiles, trigger, validation }) {
  const contract = laneDecision.contract || {};
  const safeIssueTitle = sanitizeText(issue.title || "", 240);
  const safeBranchName = sanitizeText(branchName || "", 240);
  const safeLane = sanitizeText(laneDecision.lane || "", 120);
  const safeAllowedPaths = (laneDecision.allowedPaths || []).map((item) => sanitizeText(item, 240));
  const safeChangedFiles = (changedFiles || []).map((item) => sanitizeText(item, 512));
  return [
    "# Settleora Review-Fix Mutation",
    "",
    "You are fixing only structured pre-PR review findings on the existing task branch.",
    "",
    "Authority:",
    `- Issue: #${issue.number} ${safeIssueTitle}`,
    `- Branch: ${safeBranchName}`,
    `- Lane: ${safeLane}`,
    `- Allowed paths: ${safeAllowedPaths.join(", ")}`,
    `- Contract autoMergeEligible: ${contract.autoMergeEligible === true}`,
    `- Contract manualMergeRequired: ${contract.manualMergeRequired === false ? "false" : String(contract.manualMergeRequired)}`,
    "",
    "Strict limits:",
    "- Stay on the existing branch.",
    "- Edit only files inside the exact issue allowedPaths listed above.",
    "- Fix only the review findings below.",
    "- Do not do broad refactors, unrelated cleanup, formatting churn, hidden scope expansion, generated-client edits, or dependency changes.",
    "- Never touch secrets, .env files, local provider config, authorization headers, signing, production activation, deployment, or public/admin exposure.",
    "- Runtime, API, mobile, auth/session/security, storage/privacy, money/settlement, schema/migrations, OpenAPI/generated-client, Docker, OCR, sync, import/export, backup, and restore files remain prohibited unless both the active lane and the exact allowedPaths above explicitly authorize that domain; do not expand beyond those paths.",
    "- Do not push, open/update PRs, comment on GitHub, merge, delete branches, or run live provider calls.",
    "- Preserve the no `git add .` rule. The runner stages explicit paths only after validation and review pass.",
    "",
    "Changed files before fix:",
    ...safeChangedFiles.map((file) => `- ${file}`),
    "",
    "Validation before fix:",
    `- Passed: ${validation?.passed === true}`,
    "",
    `Review source: ${trigger.source}`,
    "Review findings to fix:",
    ...sanitizeFindings(trigger.findings || []).map((finding) => `- ${formatFindingForPrompt(finding)}`),
    "",
    "After editing, leave the changes unstaged for the runner to validate and review again.",
    "",
  ].join("\n");
}

export function buildPostReviewFixMechanicsContext(input = {}) {
  const issue = input.issue || {};
  const laneDecision = input.laneDecision || {};
  const trigger = input.trigger || {};
  const decision = input.decision || {};
  const changedFilesBefore = normalizeChangedFiles(input.changedFilesBefore || []);
  const changedFilesAfter = normalizeChangedFiles(input.changedFilesAfter || []);
  const forbiddenChangedFilesAfter = normalizeChangedFiles(input.forbiddenChangedFilesAfter || []);
  const validationAfter = input.validationAfter || null;
  const externalReviewAfter = input.externalReviewAfter || null;
  const preFixReport = input.preFixReport || null;
  const currentHead = input.currentHead || null;
  const currentIssueNumber = Number(issue.number);
  const block = (reason) => ({ ok: false, reason, context: null });

  if (!Number.isInteger(currentIssueNumber) || currentIssueNumber <= 0) {
    return block("post_fix_context_missing_issue_number");
  }
  if (!laneDecision.lane) return block("post_fix_context_missing_lane");
  if (!changedFilesAfter.length) return block("post_fix_context_missing_changed_files_after");
  if (forbiddenChangedFilesAfter.length > 0) return block(`post_fix_context_forbidden_changed_files:${forbiddenChangedFilesAfter.join(",")}`);
  if (validationAfter?.passed !== true) return block("post_fix_context_validation_after_not_passed");
  if (!externalReviewAfter || typeof externalReviewAfter !== "object") return block("post_fix_context_missing_final_integrated_review");
  if (!["pass", "skipped"].includes(externalReviewAfter.status)) {
    return block(`post_fix_context_final_integrated_review_not_passed:${externalReviewAfter.status || "missing"}`);
  }
  if (externalReviewAfter.issue?.number && Number(externalReviewAfter.issue.number) !== currentIssueNumber) {
    return block("post_fix_context_final_review_issue_mismatch");
  }
  const finalReviewChangedFiles = normalizeChangedFiles(externalReviewAfter.changedFiles || []);
  if (finalReviewChangedFiles.length > 0 && finalReviewChangedFiles.join("\n") !== changedFilesAfter.join("\n")) {
    return block("post_fix_context_final_review_files_mismatch");
  }
  if (currentHead && externalReviewAfter.reviewedHead && externalReviewAfter.reviewedHead !== currentHead) {
    return block("post_fix_context_final_review_head_mismatch");
  }
  if (!trigger.actionable || !trigger.source || !(trigger.findings || []).length) {
    return block("post_fix_context_missing_structured_trigger");
  }
  if (!decision.allowed) return block(`post_fix_context_review_fix_decision_not_allowed:${decision.reason || "missing"}`);

  return {
    ok: true,
    reason: "post_review_fix_mechanics_context_ready",
    context: {
      phase: "post_review_fix_mechanics",
      authoritativeStatus: "post_fix_validation_and_final_review_passed",
      issue: {
        number: currentIssueNumber,
        title: issue.title || null,
        url: issue.url || null,
      },
      lane: laneDecision.lane,
      currentHead,
      preFixReport: preFixReport
        ? {
            role: "pre_fix_report",
            staleAfterReviewFix: true,
            found: Boolean(preFixReport.found),
            expectedPath: preFixReport.expectedPath || null,
            copyPath: preFixReport.copyPath || null,
            statusMentioned: Boolean(preFixReport.statusMentioned),
            summary: sanitizeText(preFixReport.summary || "", 1200),
            reviewerInstruction:
              "This report describes the initial implementation before the review-fix cycle and is background only, not current truth.",
          }
        : null,
      structuredReviewFixTrigger: {
        source: trigger.source,
        verdict: trigger.verdict || null,
        findings: sanitizeFindings(trigger.findings || []),
      },
      reviewFixDecision: {
        allowed: Boolean(decision.allowed),
        reason: decision.reason || null,
        maxAttempts: decision.maxAttempts ?? null,
        attemptCount: decision.attemptCount ?? null,
      },
      changedFilesBefore,
      changedFilesAfter,
      forbiddenChangedFilesAfter,
      postFixValidation: summarizeValidationForContext(validationAfter),
      finalIntegratedReview: summarizeExternalReviewForContext(externalReviewAfter),
      reviewerInstruction:
        "Judge the current post-fix checkout from changedFilesAfter, postFixValidation, finalIntegratedReview, and the diff. Do not fail solely because preFixReport says an earlier missing item was absent when post-fix evidence shows it is now resolved.",
      secretBoundaryConfirmation:
        "This context contains sanitized marker IDs/status only and no raw fixture marker values, provider payloads, local config bodies, /workspace/logs contents, credentials, tokens, or secrets.",
    },
  };
}

export function writeReviewFixEvidence(config, evidence) {
  const evidenceRoot = path.join(config.logsRoot, "review-fix");
  mkdirSync(evidenceRoot, { recursive: true });
  const issueNumber = evidence.issue?.number || "unknown";
  const issueTitle = evidence.issue?.title || "untitled";
  const evidencePath = path.join(evidenceRoot, `${safeTimestamp()}-issue-${issueNumber}-${slugify(issueTitle, 40)}.json`);
  const sanitized = sanitizeEvidence({
    generatedAt: new Date().toISOString(),
    ...evidence,
    secretBoundaryConfirmation: "No secrets, tokens, provider payloads, reviewer.env values, authorization headers, or raw local config data are included.",
  });
  writeFileSync(evidencePath, `${JSON.stringify(sanitized, null, 2)}\n`);
  return { evidencePath };
}

export function redactSecretLikeText(value) {
  const bounded = String(value ?? "").slice(0, maxRawSanitizedStringLength);
  const state = { replacements: 0, limitHit: false };
  let redacted = bounded;
  // Wrapper values are attacker-controlled reviewer text. Keep this stack-safe:
  // bounded length, bounded passes, bounded replacements, and no recursive calls.
  for (let pass = 0; pass < maxSecretRedactionPasses; pass += 1) {
    const before = redacted;
    redacted = redactSecretLikeTextPass(redacted, state, { includeWrappers: true });
    if (state.limitHit) return secretRedactionMarker;
    if (redacted === before) return redacted.slice(0, maxRawSanitizedStringLength);
  }
  return redacted.slice(0, maxRawSanitizedStringLength);
}

function redactSecretLikeTextPass(value, state, { includeWrappers }) {
  let redacted = String(value ?? "").slice(0, maxRawSanitizedStringLength)
    .replace(protectedSecretLogPathPattern, (match) => noteRedaction(state, match, secretRedactionMarker))
    .replace(malformedDoubleQuotedAuthorizationHeaderPattern, (match, key, scheme) => replaceMalformedAuthorizationHeader(state, match, key, scheme))
    .replace(malformedSingleQuotedAuthorizationHeaderPattern, (match, key, scheme) => replaceMalformedAuthorizationHeader(state, match, key, scheme))
    .replace(authorizationHeaderPattern, (match, key, scheme) => noteRedaction(state, match, `${key}: ${scheme} ${secretRedactionMarker}`))
    .replace(secretHeaderPattern, (...args) => replaceSecretHeader(state, ...args))
    .replace(quotedSecretHeaderPattern, (...args) => replaceSecretHeader(state, ...args))
    .replace(authorizationAssignmentPattern, (...args) => replaceSecretAssignment(state, ...args));
  redacted = redactCanonicalSecretAssignments(redacted, state);
  redacted = redactEscapedSecretAssignments(redacted, state);
  if (state.limitHit) return secretRedactionMarker;
  redacted = redacted
    .replace(malformedDoubleQuotedMarkerAdjacentSecretAssignmentPattern, (...args) => replaceMalformedSecretAssignment(state, "\"", ...args))
    .replace(malformedSingleQuotedMarkerAdjacentSecretAssignmentPattern, (...args) => replaceMalformedSecretAssignment(state, "'", ...args))
    .replace(markerAdjacentSecretAssignmentPattern, (...args) => replaceSecretAssignment(state, ...args))
    .replace(malformedDoubleQuotedDirectSecretAssignmentPattern, (...args) => replaceMalformedSecretAssignment(state, "\"", ...args))
    .replace(malformedSingleQuotedDirectSecretAssignmentPattern, (...args) => replaceMalformedSecretAssignment(state, "'", ...args))
    .replace(directSecretAssignmentPattern, (...args) => replaceSecretAssignment(state, ...args))
    .replace(standaloneAuthorizationPattern, (match, scheme) => noteRedaction(state, match, `${scheme} ${secretRedactionMarker}`));
  if (includeWrappers) {
    redacted = redacted.replace(secretAssignmentPattern, (...args) => replaceSecretAssignment(state, ...args));
  }
  for (const pattern of obviousCredentialPatterns) {
    redacted = redacted.replace(pattern, (match) => noteRedaction(state, match, secretRedactionMarker));
  }
  return redacted.slice(0, maxRawSanitizedStringLength);
}

function redactEscapedSecretAssignments(value, state) {
  const bounded = String(value ?? "").slice(0, maxRawSanitizedStringLength);
  const canonical = canonicalizeEscapedStructuralQuotes(bounded);
  if (!canonical.hasEscapedQuote && !canonical.hasOverDepthQuote) return bounded;
  const replacements = [];
  collectEscapedAssignmentReplacements(canonical, replacements, malformedDoubleQuotedDirectSecretAssignmentPatternWithIndices, {
    keyIndex: 3,
    valueIndexes: [5],
    wholeOnOverDepth: true,
  });
  collectEscapedAssignmentReplacements(canonical, replacements, malformedSingleQuotedDirectSecretAssignmentPatternWithIndices, {
    keyIndex: 3,
    valueIndexes: [5],
    wholeOnOverDepth: true,
  });
  collectEscapedAssignmentReplacements(canonical, replacements, markerAdjacentSecretAssignmentPatternWithIndices, {
    keyIndex: 3,
    valueIndexes: [5, 6, 8],
    alreadyRedactedIndex: 7,
    wholeOnOverDepth: true,
  });
  collectEscapedAssignmentReplacements(canonical, replacements, directSecretAssignmentPatternWithIndices, {
    keyIndex: 3,
    valueIndexes: [5, 6, 8],
    alreadyRedactedIndex: 7,
    wholeOnOverDepth: true,
  });
  collectEscapedAuthorizationReplacements(canonical, replacements);
  return applyEscapedReplacements(bounded, state, replacements);
}

function canonicalizeEscapedStructuralQuotes(value) {
  const normalized = [];
  const map = [];
  const overDepth = [];
  const quoteDepth = [];
  let hasEscapedQuote = false;
  let hasOverDepthQuote = false;
  for (let index = 0; index < value.length;) {
    if (value[index] === "\\") {
      let slashEnd = index;
      while (slashEnd < value.length && value[slashEnd] === "\\") slashEnd += 1;
      const quote = value[slashEnd];
      if (quote === "\"" || quote === "'") {
        const depth = slashEnd - index;
        normalized.push(quote);
        map.push([index, slashEnd + 1]);
        const tooDeep = depth > maxEscapedStructuralQuoteDepth;
        overDepth.push(tooDeep);
        quoteDepth.push(depth);
        hasEscapedQuote = true;
        hasOverDepthQuote ||= tooDeep;
        index = slashEnd + 1;
        continue;
      }
    }
    normalized.push(value[index]);
    map.push([index, index + 1]);
    overDepth.push(false);
    quoteDepth.push(0);
    index += 1;
  }
  return { normalized: normalized.join(""), map, overDepth, quoteDepth, hasEscapedQuote, hasOverDepthQuote };
}

function redactCanonicalSecretAssignments(value, state) {
  const bounded = String(value ?? "").slice(0, maxRawSanitizedStringLength);
  const canonical = canonicalizeEscapedStructuralQuotes(bounded);
  const replacements = [];
  collectCanonicalSecretValueReplacements(canonical, replacements, canonicalSecretAssignmentPrefixPatternWithIndices, {
    keyIndex: 3,
  });
  collectCanonicalSecretValueReplacements(canonical, replacements, canonicalMarkerAdjacentSecretAssignmentPrefixPatternWithIndices, {
    keyIndex: 3,
  });
  return applyEscapedReplacements(bounded, state, replacements);
}

function collectCanonicalSecretValueReplacements(canonical, replacements, pattern, options) {
  pattern.lastIndex = 0;
  for (const match of canonical.normalized.matchAll(pattern)) {
    if (!match.indices?.[0]) continue;
    const key = match[options.keyIndex];
    if (!isCanonicalSecretKey(key)) continue;
    const valueStart = match.indices[0][1];
    const span = scanCanonicalSecretValueSpan(canonical, valueStart, { key });
    if (!span) continue;
    replacements.push(originalReplacementRange(canonical, [span.start, span.end], span.replacement || secretRedactionMarker));
  }
}

function scanCanonicalSecretValueSpan(canonical, valueStart, { key }) {
  const value = canonical.normalized;
  if (valueStart >= value.length) return null;
  if (value.slice(valueStart, valueStart + secretRedactionMarker.length).toUpperCase() === secretRedactionMarker) return null;
  const first = value[valueStart];
  if (first === "\"" || first === "'") {
    return scanCanonicalQuotedSecretValueSpan(canonical, valueStart, first);
  }
  return scanCanonicalUnquotedSecretValueSpan(canonical, valueStart, { key });
}

function scanCanonicalQuotedSecretValueSpan(canonical, quoteStart, quoteChar) {
  const value = canonical.normalized;
  if (canonical.overDepth[quoteStart]) return null;
  const structuralDepth = canonical.quoteDepth[quoteStart] ?? 0;
  const contentStart = quoteStart + 1;
  for (let index = contentStart; index < value.length; index += 1) {
    if (value[index] === "\r" || value[index] === "\n") {
      const boundary = findCanonicalQuotedTailBoundary(value, contentStart);
      return safeCanonicalValueSpan(canonical, quoteStart, boundary);
    }
    if (value[index] !== quoteChar) continue;
    const depth = canonical.quoteDepth[index] ?? 0;
    if (depth !== structuralDepth) continue;
    if (!isCanonicalQuotedValueBoundary(value[index + 1])) {
      const boundary = findCanonicalUnquotedValueBoundary(canonical, index + 1);
      return safeCanonicalValueSpan(canonical, quoteStart, boundary);
    }
    return safeCanonicalValueSpan(canonical, contentStart, index);
  }
  const boundary = findCanonicalQuotedTailBoundary(value, contentStart);
  return safeCanonicalValueSpan(canonical, quoteStart, boundary);
}

function scanCanonicalUnquotedSecretValueSpan(canonical, valueStart, { key }) {
  const value = canonical.normalized;
  if (String(key).toLowerCase() === "authorization") {
    const authorizationSpan = scanCanonicalAuthorizationAssignmentValueSpan(canonical, valueStart);
    if (authorizationSpan !== undefined) return authorizationSpan;
  }
  const boundary = findCanonicalUnquotedValueBoundary(canonical, valueStart);
  return safeCanonicalValueSpan(canonical, valueStart, boundary);
}

function scanCanonicalAuthorizationAssignmentValueSpan(canonical, valueStart) {
  const value = canonical.normalized;
  const scheme = value.slice(valueStart).match(/^(Bearer|Basic)(?=$|[\s,;&?}\]\)\r\n])/i);
  if (!scheme) return undefined;
  const boundary = findCanonicalUnquotedValueBoundary(canonical, valueStart, {
    escapeAwareDelimiters: true,
    failClosedOnAmbiguousEscape: true,
  });
  let credentialStart = valueStart + scheme[1].length;
  while (credentialStart < boundary && /[ \t]/.test(value[credentialStart])) credentialStart += 1;
  if (credentialStart >= boundary) return null;
  const existingMarkerEnd = credentialStart + secretRedactionMarker.length;
  if (
    value.slice(credentialStart, existingMarkerEnd).toUpperCase() === secretRedactionMarker &&
    isCanonicalQuotedValueBoundary(value[existingMarkerEnd])
  ) {
    return null;
  }
  return safeCanonicalValueSpan(canonical, valueStart, boundary, `${scheme[1]} ${secretRedactionMarker}`);
}

function findCanonicalUnquotedValueBoundary(canonical, start, options = {}) {
  const value = canonical.normalized;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (canonicalUnquotedValueDelimiters.has(char)) {
      if (!options.escapeAwareDelimiters) return index;
      const escapeState = canonicalDelimiterEscapeState(canonical, index);
      if (escapeState.ambiguous) return options.failClosedOnAmbiguousEscape ? value.length : index;
      if (escapeState.escaped) continue;
      return index;
    }
    if ((char === "\"" || char === "'") && (canonical.quoteDepth[index] ?? 0) === 0) return index;
  }
  return value.length;
}

function canonicalDelimiterEscapeState(canonical, delimiterIndex) {
  const value = canonical.normalized;
  let slashCount = 0;
  for (let index = delimiterIndex - 1; index >= 0 && value[index] === "\\"; index -= 1) {
    slashCount += 1;
    if (slashCount > maxEscapedDelimiterBackslashDepth) {
      return { escaped: true, ambiguous: true };
    }
  }
  return { escaped: slashCount % 2 === 1, ambiguous: false };
}

function findCanonicalQuotedTailBoundary(value, start) {
  for (let index = start; index < value.length; index += 1) {
    if (canonicalQuotedTailDelimiters.has(value[index])) return index;
  }
  return value.length;
}

function isCanonicalQuotedValueBoundary(char) {
  return char === undefined || canonicalUnquotedValueDelimiters.has(char) || /\s/.test(char);
}

function safeCanonicalValueSpan(canonical, start, end, replacement = secretRedactionMarker) {
  if (end <= start) return null;
  const raw = canonical.normalized.slice(start, end);
  if (raw.toUpperCase() === secretRedactionMarker || isPartialRedactionMarkerValue(raw)) return null;
  return { start, end, replacement };
}

function collectEscapedAssignmentReplacements(canonical, replacements, pattern, options) {
  pattern.lastIndex = 0;
  for (const match of canonical.normalized.matchAll(pattern)) {
    if (!match.indices) continue;
    const key = match[options.keyIndex];
    if (!isCanonicalSecretKey(key)) continue;
    if (options.alreadyRedactedIndex && match[options.alreadyRedactedIndex] !== undefined) continue;
    const wholeRange = match.indices[0];
    if (!wholeRange) continue;
    const wholeOverDepth = rangeHasOverDepth(canonical, wholeRange);
    const valueIndex = options.valueIndexes.find((index) => match.indices[index]);
    const valueRange = valueIndex ? match.indices[valueIndex] : null;
    if (!valueRange) continue;
    const rawValue = match[valueIndex];
    if (isPartialRedactionMarkerValue(rawValue)) continue;
    if (String(key).toLowerCase() === "authorization" && /^(?:Bearer|Basic)$/i.test(String(rawValue || ""))) continue;
    const range = wholeOverDepth && options.wholeOnOverDepth ? wholeRange : valueRange;
    replacements.push(originalReplacementRange(canonical, range, secretRedactionMarker));
  }
}

function collectEscapedAuthorizationReplacements(canonical, replacements) {
  for (const pattern of [authorizationHeaderPatternWithIndices, standaloneAuthorizationPatternWithIndices]) {
    pattern.lastIndex = 0;
    for (const match of canonical.normalized.matchAll(pattern)) {
      if (!match.indices?.[0]) continue;
      const replacement = pattern === standaloneAuthorizationPatternWithIndices
        ? `${match[1]} ${secretRedactionMarker}`
        : `${match[1]}: ${match[2]} ${secretRedactionMarker}`;
      replacements.push(originalReplacementRange(canonical, match.indices[0], replacement));
    }
  }
}

function rangeHasOverDepth(canonical, range) {
  for (let index = range[0]; index < range[1]; index += 1) {
    if (canonical.overDepth[index]) return true;
  }
  return false;
}

function originalReplacementRange(canonical, range, replacement) {
  const start = canonical.map[range[0]]?.[0] ?? 0;
  const end = canonical.map[Math.max(range[1] - 1, range[0])]?.[1] ?? start;
  return { start, end, replacement };
}

function applyEscapedReplacements(value, state, replacements) {
  const ordered = [...replacements]
    .filter((item) => item && item.end > item.start)
    .sort((left, right) => left.start - right.start || right.end - left.end);
  const accepted = [];
  let coveredUntil = -1;
  for (const item of ordered) {
    if (item.start < coveredUntil) continue;
    accepted.push(item);
    coveredUntil = item.end;
  }
  if (!accepted.length) return value;
  let output = "";
  let cursor = 0;
  for (const item of accepted) {
    output += value.slice(cursor, item.start);
    output += noteRedaction(state, value.slice(item.start, item.end), item.replacement);
    cursor = item.end;
    if (state.limitHit) return secretRedactionMarker;
  }
  output += value.slice(cursor);
  return output.slice(0, maxRawSanitizedStringLength);
}

function noteRedaction(state, match, replacement) {
  if (replacement !== match) {
    state.replacements += 1;
    if (state.replacements > maxSecretRedactionReplacements) state.limitHit = true;
  }
  return replacement;
}

function replaceSecretHeader(state, _match, lineStart, indent, key, value) {
  if (!isCanonicalSecretKey(key)) return _match;
  const authorizationScheme = String(key).toLowerCase() === "authorization"
    ? String(value || "").trim().match(/^(Bearer|Basic)(?:\s+.*)?$/i)
    : null;
  if (authorizationScheme) {
    return noteRedaction(state, _match, `${lineStart}${indent}${key}: ${authorizationScheme[1]} ${secretRedactionMarker}`);
  }
  return noteRedaction(state, _match, `${lineStart}${indent}${key}: ${secretRedactionMarker}`);
}

function replaceMalformedAuthorizationHeader(state, _match, key, scheme) {
  return noteRedaction(state, _match, `${key}: ${scheme} ${secretRedactionMarker}`);
}

function replaceSecretAssignment(state, _match, prefix, quote, key, separator, doubleQuoted, singleQuoted, alreadyRedacted, unquoted) {
  if (!isCanonicalSecretKey(key)) {
    return redactWrappedSecretAssignment(state, _match, prefix, quote, key, separator, doubleQuoted, singleQuoted, alreadyRedacted, unquoted);
  }
  if (alreadyRedacted !== undefined) return _match;
  if (isPartialRedactionMarkerValue(unquoted)) return _match;
  // Preserve the auth scheme token; standaloneAuthorizationPattern redacts the credential value.
  if (String(key).toLowerCase() === "authorization" && /^(?:Bearer|Basic)$/i.test(String(unquoted || ""))) {
    return _match;
  }
  const quoteChar = doubleQuoted !== undefined ? "\"" : singleQuoted !== undefined ? "'" : "";
  return noteRedaction(state, _match, `${prefix}${quote}${key}${quote}${separator}${quoteChar}${secretRedactionMarker}${quoteChar}`);
}

function replaceMalformedSecretAssignment(state, valueQuote, _match, prefix, quote, key, separator, value) {
  if (!isCanonicalSecretKey(key)) return _match;
  if (isPartialRedactionMarkerValue(value)) return _match;
  return noteRedaction(state, _match, `${prefix}${quote}${key}${quote}${separator}${valueQuote}${secretRedactionMarker}${valueQuote}`);
}

function redactWrappedSecretAssignment(state, _match, prefix, quote, key, separator, doubleQuoted, singleQuoted, alreadyRedacted, unquoted) {
  if (alreadyRedacted !== undefined) return _match;
  const rawValue = doubleQuoted ?? singleQuoted ?? unquoted;
  if (rawValue === undefined) return _match;
  const redactedValue = redactSecretLikeTextPass(rawValue, state, { includeWrappers: false });
  if (state.limitHit) return secretRedactionMarker;
  if (redactedValue === rawValue) return _match;
  const quoteChar = doubleQuoted !== undefined ? "\"" : singleQuoted !== undefined ? "'" : "";
  return noteRedaction(state, _match, `${prefix}${quote}${key}${quote}${separator}${quoteChar}${redactedValue}${quoteChar}`);
}

function isPartialRedactionMarkerValue(value) {
  const partial = secretRedactionMarker.slice(0, -1);
  const normalized = String(value ?? "").toUpperCase();
  return normalized === partial || normalized === `"${partial}` || normalized === `'${partial}`;
}

function isCanonicalSecretKey(key) {
  const canonical = String(key || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return canonicalSecretKeyNames.has(canonical) ||
    canonical.endsWith("token") ||
    canonical.endsWith("secret") ||
    canonical.endsWith("password") ||
    canonical.endsWith("passwd") ||
    canonical.endsWith("apikey") ||
    canonical.endsWith("credential") ||
    canonical.endsWith("privatekey");
}

function isUnsafeAllowedPathGlob(glob, lane) {
  const normalized = normalizePath(glob);
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\\") || broadAllowedPathGlobs.has(normalized)) {
    return true;
  }
  if (!compileAllowedPathGlob(normalized).ok) return true;
  if (manualActionPathPatterns.some((pattern) => pattern.test(normalized))) return true;
  const manifest = laneManifest[lane];
  if (!manifest?.allowedPaths) return true;
  const manifestProbe = normalized.endsWith("/**") ? normalized.slice(0, -3) : normalized;
  return !matchesAnyAllowedPath(manifestProbe, manifest.allowedPaths);
}

function matchesAnyAllowedPath(filePath, allowedPaths) {
  const normalized = normalizePath(filePath);
  return (allowedPaths || []).some((glob) => {
    const allowed = normalizePath(glob);
    const compiled = compileAllowedPathGlob(allowed);
    if (!compiled.ok) return false;
    return matchCompiledAllowedPath(normalized, compiled);
  });
}

function compileAllowedPathGlob(glob) {
  const normalized = normalizePath(glob);
  if (!normalized || normalized.length > maxContractGlobLength || normalized.startsWith("/") || normalized.includes("\\") || normalized.includes("..")) {
    return { ok: false, reason: "malformed_glob" };
  }
  const segments = normalized.split("/");
  if (segments.length > maxContractGlobSegments || segments.some((segment) => segment.length === 0)) {
    return { ok: false, reason: "malformed_glob_segments" };
  }
  let wildcardCount = 0;
  for (const [index, segment] of segments.entries()) {
    if (segment.includes("**") && segment !== "**") return { ok: false, reason: "malformed_double_star_segment" };
    if (segment === "**" && index !== segments.length - 1) return { ok: false, reason: "malformed_double_star_position" };
    wildcardCount += countChars(segment, "*");
  }
  if (wildcardCount > maxContractGlobWildcards) return { ok: false, reason: "glob_too_complex" };
  return { ok: true, segments };
}

function matchCompiledAllowedPath(filePath, compiled) {
  const pathSegments = normalizePath(filePath).split("/").filter(Boolean);
  return matchSegments(pathSegments, 0, compiled.segments, 0);
}

function matchSegments(pathSegments, pathIndex, globSegments, globIndex) {
  while (globIndex < globSegments.length) {
    const globSegment = globSegments[globIndex];
    if (globSegment === "**") {
      return globIndex === globSegments.length - 1;
    }
    if (pathIndex >= pathSegments.length || !matchPathSegment(pathSegments[pathIndex], globSegment)) return false;
    pathIndex += 1;
    globIndex += 1;
  }
  return pathIndex === pathSegments.length;
}

function matchPathSegment(value, pattern) {
  let valueIndex = 0;
  const parts = pattern.split("*");
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part) continue;
    const found = value.indexOf(part, valueIndex);
    if (found === -1) return false;
    if (index === 0 && found !== 0) return false;
    valueIndex = found + part.length;
  }
  const lastPart = parts[parts.length - 1];
  return pattern.endsWith("*") || value.endsWith(lastPart);
}

function countChars(value, char) {
  let count = 0;
  for (const current of String(value)) if (current === char) count += 1;
  return count;
}

function sanitizeFindings(findings) {
  const seen = new Set();
  const sanitized = [];
  for (const finding of Array.isArray(findings) ? findings : []) {
    const safe = sanitizeFinding(finding);
    if (!safe) continue;
    const key = stableFindingKey(safe);
    if (seen.has(key)) continue;
    seen.add(key);
    sanitized.push(safe);
    if (sanitized.length >= 20) break;
  }
  return sanitized;
}

export function sanitizeStructuredReviewFinding(finding, defaults = {}) {
  const normalized = finding && typeof finding === "object" && !Array.isArray(finding)
    ? {
        ...finding,
        provider: defaults.provider || finding.provider,
        source: defaults.source || finding.source,
        severity: defaults.severity || finding.severity,
      }
    : {
        provider: defaults.provider,
        source: defaults.source,
        severity: defaults.severity,
        title: String(finding || ""),
        body: String(finding || ""),
      };
  return sanitizeFinding(normalized);
}

export function sanitizeStructuredReviewFindings(findings, defaults = {}) {
  const seen = new Set();
  const sanitized = [];
  for (const finding of Array.isArray(findings) ? findings : []) {
    const safe = sanitizeStructuredReviewFinding(finding, defaults);
    if (!safe) continue;
    const key = stableFindingKey(safe);
    if (seen.has(key)) continue;
    seen.add(key);
    sanitized.push(safe);
  }
  return sanitized;
}

function sanitizeEvidence(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeText(value, maxRawSanitizedStringLength);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (depth >= maxSanitizedEvidenceDepth) return "[SANITIZED_DEPTH_LIMIT]";
  if (Array.isArray(value)) {
    return value.slice(0, maxSanitizedEvidenceArrayItems).map((item) => sanitizeEvidence(item, depth + 1));
  }
  if (typeof value === "object") {
    const safe = {};
    for (const [rawKey, rawItem] of Object.entries(value).slice(0, maxSanitizedEvidenceObjectFields)) {
      const key = sanitizeText(rawKey, 160);
      if (!key) continue;
      safe[key] = sanitizeEvidence(rawItem, depth + 1);
    }
    return safe;
  }
  return sanitizeText(String(value), maxRawSanitizedStringLength);
}

function summarizeValidationForContext(validation) {
  return {
    passed: Boolean(validation?.passed),
    commands: (validation?.results || []).map((result) => ({
      command: result.command,
      status: result.status,
      error: result.error || null,
    })),
  };
}

function summarizeExternalReviewForContext(review) {
  return {
    status: review.status || null,
    reason: review.reason || null,
    verdict: review.verdict || null,
    provider: review.provider || null,
    tier: review.tier || null,
    phase: review.phase || null,
    markerId: review.markerId || null,
    findingCount: review.findingCount ?? null,
    reviewedHead: review.reviewedHead || null,
    reportPath: review.reportPath || null,
  };
}

function sanitizeText(value, max) {
  return redactSecretLikeText(value).slice(0, max);
}

function sanitizeFinding(finding) {
  if (typeof finding === "string") return sanitizeText(finding, 800);
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) return null;
  const safe = {};
  for (const [field, max] of Object.entries(structuredStringBounds)) {
    if (Object.hasOwn(finding, field) && finding[field] !== null && finding[field] !== undefined) {
      const value = sanitizeText(finding[field], max);
      if (value) safe[field] = value;
    }
  }
  for (const field of structuredBooleanFields) {
    if (typeof finding[field] === "boolean") safe[field] = finding[field];
  }
  const line = normalizeLineValue(finding.line);
  if (line !== null) safe.line = line;
  const range = sanitizeRange(finding.range);
  if (range) safe.range = range;
  const hasAuthorizingContext = safe.path || safe.file || safe.title || safe.message || safe.body || safe.details || safe.ruleId || safe.rule || safe.check;
  if (!hasAuthorizingContext) {
    return {
      classification: "malformed_finding",
      material: false,
      safelyFixable: false,
      title: "malformed finding omitted",
    };
  }
  return safe;
}

function sanitizeRange(range) {
  if (!range) return null;
  if (typeof range === "string") {
    const value = sanitizeText(range, 120);
    return value ? { label: value } : null;
  }
  if (!Array.isArray(range) && typeof range === "object") {
    const safe = {};
    for (const key of ["startLine", "endLine", "start", "end", "line"]) {
      const value = normalizeLineValue(range[key]);
      if (value !== null) safe[key] = value;
    }
    for (const key of ["label", "path", "file"]) {
      if (range[key] !== null && range[key] !== undefined) {
        const value = sanitizeText(range[key], key === "label" ? 120 : 512);
        if (value) safe[key] = value;
      }
    }
    return Object.keys(safe).length ? safe : null;
  }
  if (Array.isArray(range)) {
    const values = range.slice(0, 4).map(normalizeLineValue).filter((value) => value !== null);
    return values.length ? { lines: values } : null;
  }
  return null;
}

function normalizeLineValue(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 1_000_000) return null;
  return numeric;
}

function stableFindingKey(finding) {
  return typeof finding === "string" ? `string:${finding}` : `object:${JSON.stringify(finding)}`;
}

function formatFindingForPrompt(finding) {
  if (typeof finding === "string") return finding;
  return JSON.stringify(finding);
}


function normalizeChangedFiles(files) {
  return (Array.isArray(files) ? files : [])
    .map((file) => normalizePath(file))
    .filter(Boolean)
    .sort();
}

function labelNames(labels = []) {
  return labels.map((label) => (typeof label === "string" ? label : label?.name)).filter(Boolean);
}

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}
