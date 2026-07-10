import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { safeTimestamp, slugify } from "./logger.mjs";
import { filterForbiddenChangedFiles } from "./lane-policy.mjs";

export const reviewFixMutationLanes = Object.freeze(["workflow-docs-tooling", "docs-planning"]);
export const reviewFixStopLabels = Object.freeze([
  "needs-tommy",
  "manual-gate",
  "danger-gate",
  "blocked",
  "auto-failed",
  "auto-running",
  "auto-pr-opened",
]);

const maxReviewFixAttempts = 1;
const broadAllowedPathGlobs = new Set(["**", "./**", "docs/**", "tools/**", "tools/auto-runner", "docs"]);
const lowRiskPathPatternsByLane = Object.freeze({
  "workflow-docs-tooling": Object.freeze([/^tools\/auto-runner(?:\/|$)/, /^docs\/workflow(?:\/|$)/]),
  "docs-planning": Object.freeze([/^docs\/planning(?:\/|$)/, /^docs\/qa(?:\/|$)/]),
});
const dangerousPathPatterns = Object.freeze([
  /^\.env(?:\.|$)/i,
  /^infra(?:\/|$)/,
  /^services(?:\/|$)/,
  /^packages\/contracts\/openapi(?:\/|$)/,
  /^packages\/client-(web|dart)(?:\/|$)/,
  /^apps(?:\/|$)/,
  /^\.github(?:\/|$)/,
  /^scripts\/ai(?:\/|$)/,
  /(^|\/)(auth|authentication|authorization|session|security|credential|token|secret|secrets|ssh)(\/|$)/i,
  /(^|\/)(storage|privacy|vault|permission|authz|file)(\/|$)/i,
  /(^|\/)(money|settlement|payment|bill|rounding|currency|balance)(\/|$)/i,
  /(^|\/)(schema|migration|migrations|database|ef|openapi|generated)(\/|$)/i,
  /(^|\/)(docker|compose|deployment|deploy|public|admin|mobile|ocr|sync|import|export|backup|restore)(\/|$)/i,
]);
const secretLikePatterns = Object.freeze([
  /(GEMINI_API_KEY|authorization|x-goog-api-key|bearer\s+[A-Za-z0-9._~+/-]+|api[_-]?key|secret|token)/gi,
  /\/workspace\/logs\/settleora-auto-runner\/secrets\//gi,
]);

export function normalizeReviewFixMutationConfig(config = {}) {
  const externalApproval = Boolean(config.configPath && config.allowReviewFixMutation);
  const requested = Number(config.maxReviewFixCycles);
  const normalizedAttempts =
    externalApproval && Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 0), maxReviewFixAttempts) : 0;
  return {
    enabled: externalApproval && normalizedAttempts > 0,
    maxAttempts: normalizedAttempts,
    requestedMaxAttempts: Number.isFinite(requested) ? requested : 0,
    maxAllowedAttempts: maxReviewFixAttempts,
    configPathUsed: config.configPath || null,
    allowedLanes: [...reviewFixMutationLanes],
    requiresExternalConfig: true,
  };
}

export function evaluateReviewFixMutationDecision(input) {
  const config = input.config || {};
  const normalized = config.reviewFixMutation || normalizeReviewFixMutationConfig(config);
  const laneDecision = input.laneDecision || {};
  const issue = input.issue || {};
  const changedFiles = input.changedFiles || [];
  const attemptCount = Number(input.attemptCount || 0);
  const trigger = input.trigger || extractReviewFixTrigger(input);
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
  };
  const block = (reason) => ({ ...result, reason });

  if (!config.allowReviewFixMutation || !normalized.enabled) return block("review_fix_mutation_disabled_by_config");
  if (!config.configPath) return block("review_fix_requires_external_config");
  if (attemptCount >= normalized.maxAttempts) return block("review_fix_attempt_limit_reached");
  if (config.allowStaleClaimSteal) return block("review_fix_refuses_stale_claim_stealing");
  if (config.allowFollowupIssueCreation) return block("review_fix_refuses_followup_issue_creation");
  if (config.allowSystemdEnablement) return block("review_fix_refuses_systemd_enablement");
  if (config.trustedRealRunApproved) return block("review_fix_refuses_broad_trusted_real_run");
  if (!laneDecision.allowedToImplement) return block("lane_not_allowed_to_implement");
  if (!reviewFixMutationLanes.includes(laneDecision.lane)) return block("lane_not_review_fix_approved");
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
  if (!changedFiles.every((file) => isLowRiskPathForLane(file, laneDecision.lane))) return block("changed_file_not_low_risk_path");
  if (input.validation?.passed !== true) return block("local_validation_not_passed_before_review_fix");
  if (!trigger.actionable) return block(trigger.reason || "review_finding_not_actionable");

  return { ...result, allowed: true, reason: "review_fix_mutation_gates_passed" };
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
      source: "integrated_gemini",
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
  return [
    "# Settleora Review-Fix Mutation",
    "",
    "You are fixing only structured pre-PR review findings on the existing task branch.",
    "",
    "Authority:",
    `- Issue: #${issue.number} ${issue.title}`,
    `- Branch: ${branchName}`,
    `- Lane: ${laneDecision.lane}`,
    `- Allowed paths: ${(laneDecision.allowedPaths || []).join(", ")}`,
    `- Contract autoMergeEligible: ${contract.autoMergeEligible === true}`,
    `- Contract manualMergeRequired: ${contract.manualMergeRequired === false ? "false" : String(contract.manualMergeRequired)}`,
    "",
    "Strict limits:",
    "- Stay on the existing branch.",
    "- Edit only files inside the exact issue allowedPaths listed above.",
    "- Fix only the review findings below.",
    "- Do not do broad refactors, unrelated cleanup, formatting churn, hidden scope expansion, generated-client edits, or dependency changes.",
    "- Do not touch secrets, .env files, local provider config, authorization headers, runtime product code, API behavior, auth/session/security, storage/privacy, money/settlement, schema/migrations, OpenAPI, generated clients, Docker, deployment, public/admin exposure, mobile, OCR, sync, import, export, backup, or restore behavior.",
    "- Do not push, open/update PRs, comment on GitHub, merge, delete branches, or run live provider calls.",
    "- Preserve the no `git add .` rule. The runner stages explicit paths only after validation and review pass.",
    "",
    "Changed files before fix:",
    ...changedFiles.map((file) => `- ${file}`),
    "",
    "Validation before fix:",
    `- Passed: ${validation?.passed === true}`,
    "",
    `Review source: ${trigger.source}`,
    "Review findings to fix:",
    ...sanitizeFindings(trigger.findings || []).map((finding) => `- ${finding}`),
    "",
    "After editing, leave the changes unstaged for the runner to validate and review again.",
    "",
  ].join("\n");
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

function isUnsafeAllowedPathGlob(glob, lane) {
  const normalized = normalizePath(glob);
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\\") || broadAllowedPathGlobs.has(normalized)) {
    return true;
  }
  if (/\/\*\*\/|^\*$/.test(normalized)) return true;
  if (dangerousPathPatterns.some((pattern) => pattern.test(normalized))) return true;
  const lanePatterns = lowRiskPathPatternsByLane[lane] || [];
  return !lanePatterns.some((pattern) => pattern.test(normalized.replace(/\/\*\*$/, "/")));
}

function isLowRiskPathForLane(filePath, lane) {
  const normalized = normalizePath(filePath);
  if (dangerousPathPatterns.some((pattern) => pattern.test(normalized))) return false;
  const lanePatterns = lowRiskPathPatternsByLane[lane] || [];
  return lanePatterns.some((pattern) => pattern.test(normalized));
}

function sanitizeFindings(findings) {
  return findings.map((finding) => sanitizeText(finding, 800)).filter(Boolean).slice(0, 20);
}

function sanitizeEvidence(value) {
  return JSON.parse(JSON.stringify(value).replace(secretLikePatterns[0], "[REDACTED]").replace(secretLikePatterns[1], "[REDACTED]"));
}

function sanitizeText(value, max) {
  return String(value || "")
    .replace(secretLikePatterns[0], "[REDACTED]")
    .replace(secretLikePatterns[1], "[REDACTED]")
    .slice(0, max);
}

function labelNames(labels = []) {
  return labels.map((label) => (typeof label === "string" ? label : label?.name)).filter(Boolean);
}

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}
