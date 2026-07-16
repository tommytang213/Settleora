import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { safeTimestamp, slugify } from "./logger.mjs";
import { filterForbiddenChangedFiles, laneManifest } from "./lane-policy.mjs";

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
const broadAllowedPathGlobs = new Set(["**", "./**"]);
const manualActionPathPatterns = Object.freeze([
  /^\.env(?:\.|$)/i,
  /(^|\/)(secret|secrets|credential|credentials|ssh)(\/|$)/i,
  /(^|\/)(production|public|admin-exposure|store-release|testflight|app-store|play-store)(\/|$)/i,
]);
const secretLikePatterns = Object.freeze([
  /(GEMINI_API_KEY|authorization|x-goog-api-key|bearer\s+[A-Za-z0-9._~+/-]+|api[_-]?key|secret|token)/gi,
  /\/workspace\/logs\/settleora-auto-runner\/secrets\//gi,
]);

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

  if (normalized.malformed) return block("review_fix_budget_malformed");
  if (!config.allowReviewFixMutation || !normalized.enabled) return block("review_fix_mutation_disabled_by_config");
  if (!config.configPath) return block("review_fix_requires_external_config");
  if (attemptCount >= normalized.maxAttempts) return block("review_fix_attempt_limit_reached");
  if (config.allowStaleClaimSteal) return block("review_fix_refuses_stale_claim_stealing");
  if (config.allowFollowupIssueCreation) return block("review_fix_refuses_followup_issue_creation");
  if (config.allowSystemdEnablement) return block("review_fix_refuses_systemd_enablement");
  if (trigger.source === "review_fix_canary_fixture" && !config.reviewFixCanaryFixture?.enabled) {
    return block("review_fix_fixture_trigger_without_fixture_mode");
  }
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
  const contractPathDecision = evaluateReviewFixContractPaths({ laneDecision, changedFiles });
  if (!contractPathDecision.ok) return block(contractPathDecision.reason);
  const strongGateDecision = evaluateReviewFixStrongGates({ laneDecision, validation: input.validation, review: input.review, externalReview: input.externalReview, mergePolicy: input.mergePolicy });
  if (!strongGateDecision.ok) return block(strongGateDecision.reason);
  if (input.validation?.passed !== true) return block("local_validation_not_passed_before_review_fix");
  if (!trigger.actionable) return block(trigger.reason || "review_finding_not_actionable");

  return {
    ...result,
    allowed: true,
    reason: "review_fix_mutation_gates_passed",
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

export function evaluateReviewFixStrongGates({ laneDecision = {}, validation = {}, review = {}, externalReview = {}, mergePolicy = {} } = {}) {
  if (!reviewFixSensitiveLanes.includes(laneDecision.lane)) return { ok: true, reason: "standard_lane_gates_ok" };
  const tier = externalReview?.tier || laneDecision.reviewerTier || laneDecision.laneManifest?.reviewerTier || null;
  if (validation?.passed !== true || validation.profile === "docs-only") return { ok: false, reason: "sensitive_lane_requires_strong_validation" };
  if (!["strong_independent", "tie_breaker"].includes(tier)) return { ok: false, reason: "sensitive_lane_requires_strong_independent_review" };
  if (review?.verdict?.verdict && !["approved", "pass"].includes(review.verdict.verdict)) return { ok: false, reason: "sensitive_lane_codex_review_not_approved" };
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

function isUnsafeAllowedPathGlob(glob, lane) {
  const normalized = normalizePath(glob);
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\\") || broadAllowedPathGlobs.has(normalized)) {
    return true;
  }
  if (/\/\*\*\/|^\*$/.test(normalized)) return true;
  if (manualActionPathPatterns.some((pattern) => pattern.test(normalized))) return true;
  const manifest = laneManifest[lane];
  if (!manifest?.allowedPaths) return true;
  return !matchesAnyAllowedPath(normalized.replace(/\/\*\*$/, "/"), manifest.allowedPaths);
}

function matchesAnyAllowedPath(filePath, allowedPaths) {
  const normalized = normalizePath(filePath);
  return (allowedPaths || []).some((glob) => {
    const allowed = normalizePath(glob);
    if (allowed.endsWith("/**")) return normalized === allowed.slice(0, -3) || normalized.startsWith(allowed.slice(0, -2));
    if (allowed.includes("*")) {
      const escaped = allowed.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
      return new RegExp(`^${escaped}$`).test(normalized);
    }
    return normalized === allowed || normalized.startsWith(`${allowed}/`);
  });
}

function sanitizeFindings(findings) {
  return findings.map((finding) => sanitizeText(finding, 800)).filter(Boolean).slice(0, 20);
}

function sanitizeEvidence(value) {
  return JSON.parse(JSON.stringify(value).replace(secretLikePatterns[0], "[REDACTED]").replace(secretLikePatterns[1], "[REDACTED]"));
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
  return String(value || "")
    .replace(secretLikePatterns[0], "[REDACTED]")
    .replace(secretLikePatterns[1], "[REDACTED]")
    .slice(0, max);
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
