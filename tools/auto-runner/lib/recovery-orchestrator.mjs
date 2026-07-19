import { createHash } from "node:crypto";
import { buildIssueLinkageEvidence } from "./auto-merge-policy.mjs";
import { digestChangedFiles } from "./config.mjs";
import { filterForbiddenChangedFiles } from "./lane-policy.mjs";
import {
  classifyRecoveryOutcome,
  recoveryHasMutationMarker,
  recordIdempotentMutation,
  retryBudgetStatus,
} from "./recovery-state.mjs";

export const recoveryStopLabels = Object.freeze([
  "needs-tommy",
  "manual-gate",
  "danger-gate",
  "blocked",
  "auto-failed",
]);

const runnerOwnedBranchPattern = /^(feature|focused)\/auto-(\d+)-|^feature-bundle\/auto-(\d+)-|^tools\/auto-runner-[a-z0-9-]+-(\d+)-\d{8}-\d{4}$/;
const strongReviewSensitiveLanes = new Set([
  "api-domain-runtime",
  "auth-session-security",
  "storage-file-privacy-authz",
  "money-settlement-payment",
  "schema-migrations",
  "openapi-generated-clients",
  "sync-import-export-restore",
  "docker-compose-ci-deployment",
]);
const forbiddenScannerFixActions = new Set(["dismiss_alert", "suppress_rule", "exclude_path", "weaken_workflow", "skip_tests"]);
const infrastructureWords = /(timeout|rate limit|unavailable|queued|cancelled|network|runner|capacity|502|503|504|service unavailable)/i;

export function evaluateExistingPrRecovery(input = {}) {
  const issue = input.issue || {};
  const pr = input.pr || {};
  const laneDecision = input.laneDecision || {};
  const state = input.recoveryState || null;
  const changedFiles = input.changedFiles || [];
  const stopLabel = labelNames(issue.labels || []).find((label) => recoveryStopLabels.includes(label));
  const linkage = buildIssueLinkageEvidence(pr, issue.number);
  const branchOwnership = parseRunnerOwnedBranch(pr.headRefName || input.branchName || "");
  const forbiddenChangedFiles = input.forbiddenChangedFiles || filterForbiddenChangedFiles(changedFiles, laneDecision);
  const block = (reasonCode, extra = {}) => ({
    ok: false,
    outcome: classifyRecoveryOutcome("unsafe_or_ambiguous", { reasonCode }),
    reasonCode,
    nextAction: "stop_fail_closed",
    linkage,
    branchOwnership,
    ...extra,
  });

  if (!input.allowExistingPrRecovery) return block("existing_pr_recovery_disabled_by_config");
  if (!issue.number || issue.state !== "OPEN") return block("existing_pr_recovery_issue_not_open");
  if (stopLabel) return block(`existing_pr_recovery_issue_stop_label:${stopLabel}`);
  if (input.conflictingPrCount > 0) return block("existing_pr_recovery_conflicting_pr");
  if (input.ambiguousPrCount > 1) return block("existing_pr_recovery_ambiguous_multiple_prs");
  if (!pr.number && !pr.url) return block("existing_pr_recovery_missing_pr");
  if (!branchOwnership.owned || branchOwnership.issueNumber !== issue.number) return block("existing_pr_recovery_unowned_pr_branch");
  if (input.expectedRepository && pr.repository && pr.repository !== input.expectedRepository) {
    return block("existing_pr_recovery_repository_mismatch");
  }
  if (pr.baseRefName !== "main") return block("existing_pr_recovery_base_not_main");
  if (!linkage.available || !linkage.linked) return block("existing_pr_recovery_pr_not_linked_to_issue");
  if (!pr.headRefOid) return block("existing_pr_recovery_missing_head_readback");
  if (input.expectedHeadSha && input.expectedHeadSha !== pr.headRefOid) return block("existing_pr_recovery_head_mismatch");
  if (forbiddenChangedFiles.length > 0) return block("existing_pr_recovery_changed_files_out_of_contract", { forbiddenChangedFiles });
  if (input.worktreeClean === false && !input.checkoutReconstructable) {
    return block("existing_pr_recovery_dirty_checkout_not_reconstructable");
  }
  const stateDecision = evaluateRecoveryStateCompatibility({ state, pr, issue, input });
  if (!stateDecision.ok) return block(stateDecision.reasonCode);

  const evidence = evaluateExactHeadEvidence({
    evidence: input.evidence || {},
    expectedHeadSha: pr.headRefOid,
    changedFiles,
    laneDecision,
  });
  if (!evidence.ok) {
    return {
      ok: true,
      reasonCode: evidence.reasonCode,
      outcome: classifyRecoveryOutcome("evidence_regeneration_required", { reasonCode: evidence.reasonCode }),
      nextAction: "regenerate_exact_head_evidence",
      pr,
      linkage,
      branchOwnership,
      evidence,
    };
  }
  if (pr.state === "MERGED" || input.mergeConfirmed) {
    return {
      ok: true,
      reasonCode: "existing_pr_recovery_merged_pr_confirmed",
      outcome: classifyRecoveryOutcome("current_main_reconciliation_required"),
      nextAction: input.postMergeCurrentMainEvidence?.cleared ? "resume_issue_parent_ledger_hygiene" : "reconcile_current_main",
      pr,
      linkage,
      branchOwnership,
      evidence,
    };
  }
  if (input.ciStatus === "pending") {
    return {
      ok: true,
      reasonCode: "existing_pr_recovery_ci_pending",
      outcome: classifyRecoveryOutcome("pending", { reasonCode: "existing_pr_recovery_ci_pending" }),
      nextAction: "resume_ci_wait",
      pr,
      linkage,
      branchOwnership,
      evidence,
    };
  }
  return {
    ok: true,
    reasonCode: "existing_pr_recovery_gates_passed",
    outcome: classifyRecoveryOutcome("success", { reasonCode: "existing_pr_recovery_gates_passed" }),
    nextAction: "resume_exact_head_final_refresh",
    pr,
    linkage,
    branchOwnership,
    evidence,
  };
}

export function evaluateReviewFixCycle(input = {}) {
  const finding = normalizeFinding(input.finding);
  const laneDecision = input.laneDecision || {};
  const state = input.recoveryState || null;
  const fingerprint = failureFingerprint({
    source: finding.source || "review",
    rule: finding.ruleId || finding.code,
    path: finding.path,
    line: finding.line,
    message: finding.message,
  });
  const budget = state
    ? retryBudgetStatus(state, "review_fix_safe", fingerprint)
    : { exhausted: Boolean(input.attemptCount && input.attemptCount >= 1), remaining: input.attemptCount ? 0 : 1 };
  const block = (reasonCode, outcomeClass = "unsafe_or_ambiguous") => ({
    allowed: false,
    reasonCode,
    outcome: classifyRecoveryOutcome(outcomeClass, { reasonCode }),
    fingerprint,
    nextAction: outcomeClass === "followup_issue_required" ? "create_or_reuse_followup" : "escalate_or_stop",
  });
  if (!finding.actionable) return block("review_fix_finding_not_structured");
  if (!finding.path) return block("review_fix_missing_path");
  if (finding.destructive || finding.scopeExpansion || finding.policyAmbiguity) {
    return block("review_fix_manual_decision_required", "manual_decision_required");
  }
  if (budget.exhausted) return block("review_fix_repeated_failure_budget_exhausted", "followup_issue_required");
  if (!laneDecision.allowedToImplement) return block("review_fix_lane_not_implementable");
  const forbidden = filterForbiddenChangedFiles([finding.path], laneDecision);
  if (forbidden.length > 0 || !pathAllowedByContract(finding.path, laneDecision.allowedPaths || [])) {
    return block("review_fix_out_of_contract");
  }
  if (finding.requiresDependencyUpgrade || finding.generatedClientEdit || finding.workflowWeakening) {
    return block("review_fix_forbidden_mutation");
  }
  return {
    allowed: true,
    reasonCode: "review_fix_safe_structured_finding",
    outcome: classifyRecoveryOutcome("review_fix_safe", { reasonCode: "review_fix_safe_structured_finding" }),
    fingerprint,
    nextAction: "run_focused_review_fix",
    requiresStrongRereview: Boolean(input.sensitiveLane || strongReviewSensitiveLanes.has(laneDecision.lane)),
  };
}

export function classifyCiFailure(input = {}) {
  const fingerprint = failureFingerprint({
    workflow: input.workflow,
    job: input.job,
    step: input.step,
    command: input.command,
    exitCode: input.exitCode,
    excerpt: input.sanitizedLogExcerpt,
  });
  if (input.conclusion === "success") {
    return { outcome: classifyRecoveryOutcome("success"), fingerprint, nextAction: "continue" };
  }
  if (infrastructureWords.test([input.workflow, input.job, input.step, input.sanitizedLogExcerpt].join(" "))) {
    return {
      outcome: classifyRecoveryOutcome("retryable_infrastructure", { reasonCode: "ci_retryable_infrastructure" }),
      fingerprint,
      nextAction: "wait_retry_bounded",
      mutate: false,
    };
  }
  if (!input.command && !input.step) {
    return {
      outcome: classifyRecoveryOutcome("unsafe_or_ambiguous", { reasonCode: "ci_missing_structured_failure" }),
      fingerprint,
      nextAction: "stop_fail_closed",
      mutate: false,
    };
  }
  if (input.scopeAllowed === false || input.requiresSecretOrConfigChange || input.requiresWorkflowWeakening || input.requiresDependencyUpgrade) {
    return {
      outcome: classifyRecoveryOutcome("manual_action_required", { reasonCode: "ci_fix_manual_or_forbidden" }),
      fingerprint,
      nextAction: "escalate_action",
      mutate: false,
    };
  }
  return {
    outcome: classifyRecoveryOutcome("ci_fix_safe", { reasonCode: "ci_code_fix_safe" }),
    fingerprint,
    nextAction: "run_focused_ci_fix",
    mutate: true,
  };
}

export function classifyScannerFinding(input = {}) {
  const fingerprint = failureFingerprint({
    tool: input.tool,
    ruleId: input.ruleId,
    path: input.path,
    line: input.line,
    ref: input.ref,
    commit: input.commit,
  });
  if (input.state === "fixed" || input.state === "dismissed_but_not_by_runner") {
    return { outcome: classifyRecoveryOutcome("success"), fingerprint, nextAction: "continue" };
  }
  if (forbiddenScannerFixActions.has(input.proposedAction)) {
    return {
      outcome: classifyRecoveryOutcome("manual_action_required", { reasonCode: "scanner_forbidden_disposition_or_suppression" }),
      fingerprint,
      nextAction: "escalate_action",
      mutate: false,
    };
  }
  if (input.dismissalReason || input.dismissedBy || input.suppressionRequested || input.workflowWeakeningRequested) {
    return {
      outcome: classifyRecoveryOutcome("manual_action_required", { reasonCode: "scanner_dismissal_or_suppression_rejected" }),
      fingerprint,
      nextAction: "escalate_action",
      mutate: false,
    };
  }
  if (input.baselineAware || input.diffInformed) {
    if (!input.prHeadEvidence?.cleared) {
      return {
        outcome: classifyRecoveryOutcome("evidence_regeneration_required", { reasonCode: "scanner_pr_head_evidence_required" }),
        fingerprint,
        nextAction: "regenerate_exact_head_scanner_evidence",
        mutate: false,
      };
    }
    if (!input.currentMainEvidence?.cleared) {
      return {
        outcome: classifyRecoveryOutcome("current_main_reconciliation_required", { reasonCode: "scanner_current_main_reconciliation_required" }),
        fingerprint,
        nextAction: "reconcile_current_main_scanner",
        mutate: false,
      };
    }
  }
  if (!input.tool || !input.ruleId || !input.path || !Number.isInteger(input.line)) {
    return {
      outcome: classifyRecoveryOutcome("unsafe_or_ambiguous", { reasonCode: "scanner_missing_structured_location" }),
      fingerprint,
      nextAction: "stop_fail_closed",
      mutate: false,
    };
  }
  if (input.scopeAllowed === false || input.requiresDependencyUpgrade || input.requiresSecretChange) {
    return {
      outcome: classifyRecoveryOutcome("manual_decision_required", { reasonCode: "scanner_fix_out_of_scope_or_manual" }),
      fingerprint,
      nextAction: "escalate_decision",
      mutate: false,
    };
  }
  return {
    outcome: classifyRecoveryOutcome("code_scanning_fix_safe", { reasonCode: "scanner_code_fix_safe" }),
    fingerprint,
    nextAction: "run_focused_scanner_fix",
    mutate: true,
  };
}

export function planFollowupForRepeatedFailure(state, failure = {}) {
  const fingerprint = failure.fingerprint || failureFingerprint(failure);
  const key = `${failure.kind || "failure"}:${fingerprint}`;
  if (state && recoveryHasMutationMarker(state, "followup_issue", key)) {
    return { action: "reuse_followup_issue", key, duplicate: true };
  }
  const nextState = state
    ? recordIdempotentMutation(state, {
        kind: "followup_issue",
        key,
        marker: { status: "planned", target: failure.title || "focused follow-up", correlation: failure.correlation || "" },
      })
    : null;
  return { action: "create_or_reuse_followup_issue", key, duplicate: false, state: nextState };
}

export function evaluateCurrentMainScannerReconciliation(input = {}) {
  const prHeadClean = input.prHeadEvidence?.cleared === true;
  const currentMainClean = input.currentMainEvidence?.cleared === true;
  if (!prHeadClean) {
    return {
      ok: false,
      outcome: classifyRecoveryOutcome("evidence_regeneration_required", { reasonCode: "current_main_reconciliation_missing_pr_head_evidence" }),
      nextAction: "regenerate_exact_head_scanner_evidence",
    };
  }
  if (!currentMainClean) {
    return {
      ok: false,
      outcome: classifyRecoveryOutcome("current_main_reconciliation_required", { reasonCode: "current_main_scanner_alert_still_open" }),
      nextAction: "keep_issue_open",
    };
  }
  return { ok: true, outcome: classifyRecoveryOutcome("success"), nextAction: "continue_hygiene" };
}

export function failureFingerprint(parts = {}) {
  const normalized = Object.fromEntries(
    Object.entries(parts)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value).slice(0, 240)]),
  );
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 24);
}

function evaluateRecoveryStateCompatibility({ state, pr, issue, input }) {
  if (!state) {
    return input.allowStateRebuildFromEvidence
      ? { ok: true, reasonCode: "recovery_state_rebuilt_from_sanitized_evidence" }
      : { ok: false, reasonCode: "existing_pr_recovery_state_missing" };
  }
  if (state.issue?.number !== issue.number) return { ok: false, reasonCode: "existing_pr_recovery_state_issue_mismatch" };
  if (state.branch?.name !== pr.headRefName) return { ok: false, reasonCode: "existing_pr_recovery_state_branch_mismatch" };
  if (state.branch?.currentHeadSha && state.branch.currentHeadSha !== pr.headRefOid) {
    return { ok: false, reasonCode: "existing_pr_recovery_state_head_mismatch" };
  }
  return { ok: true, reasonCode: "recovery_state_matches" };
}

function evaluateExactHeadEvidence({ evidence, expectedHeadSha, changedFiles, laneDecision }) {
  let changedFilesDigest;
  try {
    changedFilesDigest = digestChangedFiles(changedFiles);
  } catch {
    return { ok: false, reasonCode: "changed_files_invalid" };
  }
  const requiredKinds = ["validation", "externalReview", "codexReview"];
  for (const kind of requiredKinds) {
    const item = evidence[kind];
    if (!item || item.status !== "passed") return { ok: false, reasonCode: `missing_${kind}_evidence` };
    if (item.headSha !== expectedHeadSha) return { ok: false, reasonCode: `stale_${kind}_evidence` };
    if (!item.changedFilesDigest) return { ok: false, reasonCode: `${kind}_changed_files_digest_missing` };
    if (item.changedFilesDigest !== changedFilesDigest) {
      return { ok: false, reasonCode: `${kind}_changed_files_mismatch` };
    }
  }
  if (laneDecision?.requiresIndependentReview && evidence.externalReview?.tier !== "strong_independent") {
    return { ok: false, reasonCode: "strong_independent_review_required" };
  }
  return { ok: true, reasonCode: "exact_head_evidence_valid" };
}

function normalizeFinding(finding = {}) {
  return {
    actionable: Boolean(finding.actionable),
    source: finding.source || null,
    ruleId: finding.ruleId || finding.rule || null,
    code: finding.code || null,
    path: finding.path || finding.file || null,
    line: Number.isInteger(finding.line) ? finding.line : null,
    message: finding.message || finding.summary || null,
    destructive: Boolean(finding.destructive),
    scopeExpansion: Boolean(finding.scopeExpansion),
    policyAmbiguity: Boolean(finding.policyAmbiguity),
    requiresDependencyUpgrade: Boolean(finding.requiresDependencyUpgrade),
    generatedClientEdit: Boolean(finding.generatedClientEdit),
    workflowWeakening: Boolean(finding.workflowWeakening),
  };
}

function parseRunnerOwnedBranch(branchName) {
  const match = String(branchName || "").match(runnerOwnedBranchPattern);
  const issueNumber = match ? Number(match[2] || match[3] || match[4]) : null;
  return { owned: Boolean(match), issueNumber: Number.isInteger(issueNumber) ? issueNumber : null, branchName };
}

function pathAllowedByContract(filePath, allowedPaths) {
  if (!allowedPaths.length) return false;
  return allowedPaths.some((allowed) => {
    const normalized = String(allowed || "").replace(/^\.\//, "");
    if (normalized.endsWith("/**")) return filePath.startsWith(normalized.slice(0, -3));
    return filePath === normalized || filePath.startsWith(`${normalized.replace(/\/$/, "")}/`);
  });
}

function labelNames(labels) {
  return labels.map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
}
