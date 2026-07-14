import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { safeTimestamp } from "./logger.mjs";
import { evaluateLowRiskAutoMergeCanaryApproval } from "./canary-policy.mjs";
import { filterForbiddenChangedFiles } from "./lane-policy.mjs";
import { inferMobileBuildPlatformRequirements } from "./validation-planner.mjs";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";
import { completeMergedIssueHygiene } from "./completion-hygiene.mjs";

export const lowRiskAutoMergeLanes = Object.freeze(["workflow-docs-tooling", "docs-planning", "client-ui-low-risk"]);
export const approvedDomainAutoMergeLanes = Object.freeze([
  "workflow-docs-tooling",
  "docs-planning",
  "client-ui-low-risk",
  "mobile-application",
  "mobile-build-config",
  "web-user-ui",
  "web-admin-ui",
  "api-domain-runtime",
  "auth-session-security",
  "storage-file-privacy-authz",
  "money-settlement-payment",
  "schema-migrations",
  "openapi-generated-clients",
  "sync-import-export-restore",
  "docker-compose-ci-deployment",
]);
export const autoMergeStopLabels = Object.freeze([
  "needs-tommy",
  "manual-gate",
  "danger-gate",
  "blocked",
  "auto-failed",
]);
export const transientIssueLifecycleLabels = Object.freeze([
  "auto-running",
  "auto-claimed",
  "auto-pr-opened",
  "auto-failed",
]);

const cleanMergeStates = new Set(["CLEAN"]);
const refreshableMergeStates = new Set(["BLOCKED", "UNKNOWN", "UNSTABLE", "HAS_HOOKS", ""]);
const defaultAutoMergeWait = Object.freeze({ maxAttempts: 60, delayMs: 30_000 });
const maxAutoMergeWaitAttempts = 60;
const autoMergeWaitDelayBucketsMs = Object.freeze([0, 5000, 15000, 30000]);
const independentReviewRequiredLanes = new Set(approvedDomainAutoMergeLanes);
const strongIndependentTiers = new Set(["strong_independent", "tie_breaker"]);
const umbrellaLabelPatterns = [/umbrella/i, /epic/i, /parent/i, /tracker/i];
const mandatoryRequiredChecks = Object.freeze(["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"]);

export function evaluateAutoMergeDecision(input) {
  const config = input.config || {};
  const laneDecision = input.laneDecision || {};
  const issue = input.issue || {};
  const pr = input.pr || {};
  const changedFiles = input.changedFiles || [];
  const forbiddenChangedFiles =
    input.forbiddenChangedFiles || filterForbiddenChangedFiles(changedFiles, laneDecision);
  const requiredChecks = input.requiredChecks || [];
  const reviewThreads = input.reviewThreads || [];
  const codeScanningAlerts = input.codeScanningAlerts || [];
  const issueLabels = labelNames(input.issueLabels || issue.labels || []);
  const blockingMarkers = input.blockingMarkers || [];
  const expectedHeadSha = input.expectedHeadSha || input.runnerCreatedCommitSha || null;
  const actualHeadSha = input.actualHeadSha || pr.headRefOid || null;
  const result = {
    eligible: false,
    attempted: false,
    result: "blocked",
    reason: null,
    prHeadSha: actualHeadSha,
    expectedHeadSha,
    mergeSha: null,
    issueClosureResult: null,
    issueLabelCleanupResult: null,
  };

  const block = (reason) => ({ ...result, reason });

  if (!config.allowAutoMerge) return block("auto_merge_disabled_by_config");
  if (config.canary) {
    const approval = evaluateLowRiskAutoMergeCanaryApproval(config);
    if (!approval.approved) return block(`low_risk_auto_merge_canary_not_approved:${approval.reason}`);
  }
  if (!laneDecision.allowedToImplement) return block("lane_not_allowed_to_implement");
  const laneApproval = evaluateApprovedLanePolicy(config, laneDecision);
  if (!laneApproval.ok) return block(laneApproval.reason);
  if (!laneDecision.autoMergeEligible || laneDecision.contract?.autoMergeEligible !== true) {
    return block("contract_not_auto_merge_eligible");
  }
  if (laneDecision.manualMergeRequired || laneDecision.contract?.manualMergeRequired !== false) {
    return block("manual_merge_required");
  }
  if (forbiddenChangedFiles.length > 0) return block(`forbidden_changed_files:${forbiddenChangedFiles.join(",")}`);
  if (changedFiles.length === 0) return block("no_changed_files");
  if (!input.changedFilesExactlyMatchAllowedPaths) return block("changed_files_do_not_match_allowed_paths");
  if (pr.state !== "OPEN") return block("pr_not_open");
  if (pr.isDraft) return block("pr_is_draft");
  if (pr.baseRefName !== "main") return block("pr_base_not_main");
  if (!branchStrategyMatches(laneDecision, input.branchName || pr.headRefName)) return block("branch_strategy_mismatch");
  const linkageEvidence = input.issueLinkageEvidence || buildIssueLinkageEvidence(pr, issue.number);
  if (!linkageEvidence.available) return block("missing_issue_linkage_evidence");
  if (!linkageEvidence.linked) return block("pr_missing_issue_linkage");
  if (actualHeadSha !== expectedHeadSha) return block("pr_head_sha_mismatch");
  if (input.expectedOriginMainSha && input.currentOriginMainSha !== input.expectedOriginMainSha) {
    return block("origin_main_base_mismatch");
  }
  const validation = evaluateValidationEvidence(input, { expectedHeadSha, expectedBaseSha: input.expectedOriginMainSha, changedFiles, laneDecision });
  if (!validation.ok) return block(validation.reason);
  const platformBuildEvidence = evaluateMobilePlatformBuildEvidence(input, { expectedHeadSha, expectedBaseSha: input.expectedOriginMainSha, changedFiles, laneDecision });
  if (!platformBuildEvidence.ok) return block(platformBuildEvidence.reason);
  const independentReview = evaluateIndependentReviewEvidence(input);
  if (!independentReview.ok) return block(independentReview.reason);
  const codexReview = evaluateCodexReviewEvidence(input, { expectedHeadSha, expectedBaseSha: input.expectedOriginMainSha, changedFiles });
  if (!codexReview.ok) return block(codexReview.reason);
  if (input.worktreeClean !== true) return block("worktree_not_clean");
  if (pr.mergeable !== "MERGEABLE") return block("pr_not_mergeable");
  const checkStatus = summarizeCheckStatus(requiredChecks, config.autoMergePolicy);
  if (checkStatus.state === "pending") return block("required_checks_pending");
  if (checkStatus.state !== "success") return block("required_checks_not_successful");
  if (!cleanMergeStates.has(pr.mergeStateStatus)) return block(`pr_merge_state_not_clean:${pr.mergeStateStatus || "unknown"}`);
  if (reviewThreads.some((thread) => !thread.isResolved)) return block("unresolved_review_threads");
  if (codeScanningAlerts.some((alert) => String(alert.state || "").toLowerCase() === "open")) {
    return block("open_code_scanning_alerts");
  }
  if (blockingMarkers.length > 0) return block(`blocking_markers:${blockingMarkers.join(",")}`);
  if (issue.state !== "OPEN") return block("issue_not_open");
  const stopLabel = issueLabels.find((label) => autoMergeStopLabels.includes(label));
  if (stopLabel) return block(`issue_stop_label:${stopLabel}`);

  return {
    ...result,
    eligible: true,
    result: "eligible",
    reason: "all_auto_merge_gates_passed",
  };
}

export function evaluateExistingPrRecoveryDecision(input) {
  const config = input.config || {};
  const issue = input.issue || {};
  const pr = input.pr || {};
  const evidence = input.exactHeadEvidence || {};
  const linkageEvidence = input.issueLinkageEvidence || buildIssueLinkageEvidence(pr, issue.number);
  const changedFiles = input.changedFiles || [];
  const baseDecision = evaluateAutoMergeDecision(input);
  const result = {
    eligible: false,
    result: "blocked",
    reason: null,
    prHeadSha: input.actualHeadSha || pr.headRefOid || null,
    expectedHeadSha: input.expectedHeadSha || null,
    recovery: true,
  };
  const block = (reason) => ({ ...result, reason, issueLinkageEvidence: linkageEvidence, autoMergeDecision: baseDecision });

  if (!config.allowExistingPrRecovery) return block("existing_pr_recovery_disabled_by_config");
  if (!pr.number && !pr.url) return block("existing_pr_recovery_missing_pr");
  if (!pr.headRefName || !/^(feature|focused)\/auto-\d+-/.test(pr.headRefName)) return block("existing_pr_recovery_unowned_pr_branch");
  if (!linkageEvidence.available) return block("existing_pr_recovery_missing_pr_linkage_evidence");
  if (!linkageEvidence.linked) return block("existing_pr_recovery_pr_not_linked_to_issue");
  if (requiresIndependentAiReview(input.laneDecision) && !evidence.geminiPass) {
    return block("existing_pr_recovery_missing_independent_review_evidence");
  }
  if (!evidence.geminiPass && !evidence.codexMechanicsApproved) {
    return block("existing_pr_recovery_missing_evidence_or_review");
  }
  if (!evidence.codexMechanicsApproved) {
    return block("existing_pr_recovery_missing_codex_mechanics_evidence");
  }
  if (evidence.headSha && evidence.headSha !== result.prHeadSha) return block("existing_pr_recovery_evidence_head_mismatch");
  if (evidence.geminiPass && evidence.geminiHeadSha && evidence.geminiHeadSha !== result.prHeadSha) {
    return block("existing_pr_recovery_gemini_head_mismatch");
  }
  if (evidence.geminiPass && Array.isArray(evidence.geminiChangedFiles) && !sameStringSet(evidence.geminiChangedFiles, changedFiles)) {
    return block("existing_pr_recovery_gemini_files_mismatch");
  }
  if (evidence.codexMechanicsApproved && evidence.codexMechanicsHeadSha && evidence.codexMechanicsHeadSha !== result.prHeadSha) {
    return block("existing_pr_recovery_codex_review_head_mismatch");
  }
  if (evidence.codexMechanicsApproved && !Array.isArray(evidence.codexMechanicsChangedFiles)) {
    return block("existing_pr_recovery_codex_review_files_missing");
  }
  if (evidence.codexMechanicsApproved && !sameStringSet(evidence.codexMechanicsChangedFiles, changedFiles)) {
    return block("existing_pr_recovery_codex_review_files_mismatch");
  }
  if (changedFiles.length === 0) return block("existing_pr_recovery_missing_changed_files");
  if (!baseDecision.eligible && !shouldWaitForAutoMergeDecision(baseDecision)) {
    return block(`existing_pr_recovery_gate_blocked:${baseDecision.reason}`);
  }
  return {
    ...result,
    eligible: true,
    result: "eligible",
    reason: baseDecision.eligible ? "existing_pr_recovery_gates_passed" : `existing_pr_recovery_waiting_for_refreshable_gate:${baseDecision.reason}`,
    issueLinkageEvidence: linkageEvidence,
    autoMergeDecision: baseDecision,
  };
}

export function buildIssueLinkageEvidence(pr = {}, issueNumber) {
  const normalizedNumber = normalizeIssueNumber(issueNumber);
  const hasTitle = Object.hasOwn(pr, "title") && typeof pr.title === "string";
  const hasBody = Object.hasOwn(pr, "body") && typeof pr.body === "string";
  const sources = [];
  if (hasTitle) {
    sources.push({ source: "pr.title", text: pr.title });
  }
  if (hasBody) {
    sources.push({ source: "pr.body", text: pr.body });
  }
  const matchedSources = normalizedNumber
    ? sources.filter((source) => referencesIssueNumber(source.text, normalizedNumber)).map((source) => source.source)
    : [];
  return sanitizeEvidence({
    issueNumber: normalizedNumber,
    available: Boolean(normalizedNumber && hasTitle && hasBody),
    evaluatedSources: sources.map((source) => source.source),
    matchedSources,
    linked: matchedSources.length > 0,
    titleLength: hasTitle ? pr.title.length : null,
    bodyLength: hasBody ? pr.body.length : null,
    titlePreview: hasTitle ? bounded(pr.title, 240) : null,
    bodyPreview: hasBody ? bounded(pr.body, 480) : null,
  });
}

export function writeAutoMergeEvidence(config, decision, context = {}) {
  const evidenceRoot = path.join(config.logsRoot, "auto-merge");
  mkdirSync(evidenceRoot, { recursive: true });
  const issueNumber = context.issue?.number || "unknown";
  const evidencePath = path.join(evidenceRoot, `${safeTimestamp()}-issue-${issueNumber}.json`);
  const evidence = sanitizeEvidence({
    generatedAt: new Date().toISOString(),
    issue: context.issue
      ? {
          number: context.issue.number,
          title: context.issue.title,
          url: context.issue.url,
          state: context.issue.state,
          labels: labelNames(context.issue.labels || []),
        }
      : null,
    lane: context.laneDecision?.lane || null,
    changedFiles: context.changedFiles || [],
    autoMerge: decision,
    issueLinkageEvidence: context.issueLinkageEvidence || decision.issueLinkageEvidence || null,
  });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { evidencePath };
}

export function inspectAutoMergeGithubState(config, { issue, prUrlOrNumber }) {
  if (config.dryRun) {
    return {
      pr: { state: "OPEN", isDraft: false, baseRefName: "main", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" },
      issue,
      requiredChecks: [],
      reviewThreads: [],
      codeScanningAlerts: [],
      blockingMarkers: [],
    };
  }
  const prView = defaultRunner(
    "gh",
    [
      "pr",
      "view",
      String(prUrlOrNumber),
      "--json",
      "number,url,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,title,body,statusCheckRollup,comments,reviews",
    ],
    { cwd: config.repoRoot },
  );
  const issueView = defaultRunner("gh", ["issue", "view", String(issue.number), "--json", "number,title,state,labels,url"], {
    cwd: config.repoRoot,
  });
  const blockingMarkers = [];
  let pr = {};
  let currentIssue = issue;
  try {
    pr = JSON.parse(prView.stdout || "{}");
  } catch (error) {
    blockingMarkers.push(`pr_view_parse_failed:${error.message}`);
  }
  try {
    currentIssue = { ...issue, ...JSON.parse(issueView.stdout || "{}") };
  } catch (error) {
    blockingMarkers.push(`issue_view_parse_failed:${error.message}`);
  }
  if (prView.error || prView.status !== 0) blockingMarkers.push("pr_view_failed");
  if (issueView.error || issueView.status !== 0) blockingMarkers.push("issue_view_failed");

  const reviewThreads = inspectReviewThreads(config, pr.number, blockingMarkers);
  const codeScanningAlerts = inspectCodeScanningAlerts(config, pr.headRefName, blockingMarkers);
  blockingMarkers.push(...detectBlockingMarkers(pr.comments || [], pr.reviews || []));
  return {
    pr,
    issue: currentIssue,
    requiredChecks: flattenCheckRollup(pr.statusCheckRollup || []),
    reviewThreads,
    codeScanningAlerts,
    blockingMarkers,
  };
}

export function executeAutoMerge(config, context, options = {}) {
  const runner = options.runner || defaultRunner;
  const decision = evaluateAutoMergeDecision(context);
  const wait = normalizeAutoMergeWait(config.autoMergeWait);
  if (!decision.eligible && shouldWaitForAutoMergeDecision(decision) && wait.maxAttempts > 1) {
    return executeAutoMergeWithWait(config, context, { ...options, runner, wait, firstDecision: decision });
  }
  if (!decision.eligible) {
    return { ...decision, evidence: writeAutoMergeEvidence(config, decision, context) };
  }
  if (config.dryRun) {
    const dryRun = {
      ...decision,
      attempted: false,
      result: "dry_run_eligible",
      reason: "dry_run_no_merge",
      issueLabelCleanupResult: cleanupIssueLifecycleLabels(config, context, runner),
    };
    return { ...dryRun, evidence: writeAutoMergeEvidence(config, dryRun, context) };
  }

  const prNumber = context.pr?.number || context.prNumber || context.pr?.url;
  const defaultInspectState =
    runner === defaultRunner
      ? (cfg, ctx) => inspectAutoMergeGithubState(cfg, { issue: ctx.issue, prUrlOrNumber: ctx.pr?.number || ctx.pr?.url || ctx.prNumber })
      : () => ({});
  const refreshed = (options.inspectState || defaultInspectState)(config, context);
  const finalContext = mergeAutoMergeContext(context, refreshed);
  if (!config.dryRun && finalContext.expectedOriginMainSha) {
    const origin = runner("git", ["rev-parse", "origin/main"], { cwd: config.repoRoot });
    finalContext.currentOriginMainSha = origin.status === 0 && !origin.error ? origin.stdout.trim() : finalContext.currentOriginMainSha;
  }
  const finalDecision = evaluateAutoMergeDecision(finalContext);
  if (!finalDecision.eligible) {
    const raced = { ...finalDecision, result: "blocked", reason: `final_refresh_blocked:${finalDecision.reason}` };
    return { ...raced, evidence: writeAutoMergeEvidence(config, raced, finalContext) };
  }
  const merge = runner("gh", ["pr", "merge", String(prNumber), "--merge", "--match-head-commit", String(finalDecision.expectedHeadSha)], { cwd: config.repoRoot });
  if (merge.error || merge.status !== 0) {
    const failed = { ...finalDecision, attempted: true, eligible: false, result: "merge_failed", reason: bounded(merge.stderr || merge.stdout || merge.error) };
    return { ...failed, evidence: writeAutoMergeEvidence(config, failed, finalContext) };
  }

  const mergeSha = context.mergeSha || readMergeSha(runner, config.repoRoot, prNumber);
  const branchRestore = restoreSourceBranchIfDeleted(config, finalContext, runner);
  const hygiene = completeMergedIssueHygiene(
    config,
    {
      ...finalContext,
      mergeSha,
      sourceHeadSha: finalDecision.expectedHeadSha,
      closeRuleSatisfied: true,
      currentMainResult: "merge_completed",
      ciSecurityResult: "exact_head_checks_passed",
    },
    {
      runner: (command, args) => runner(command, args, { cwd: config.repoRoot }),
    },
  );
  const prComment = runner("gh", ["pr", "comment", String(prNumber), "--body", mergeSummaryBody(finalContext, mergeSha)], { cwd: config.repoRoot });
  const merged = {
    ...finalDecision,
    attempted: true,
    result: "merged",
    reason: "github_merge_commit_completed",
    mergeSha,
    sourceBranchRestoration: branchRestore,
    completionHygiene: hygiene,
    issueLabelCleanupResult: legacyLabelCleanupResult(hygiene.labelCleanup),
    issueClosureResult:
      hygiene.closure?.status === "updated"
        ? "closed_completed"
        : hygiene.closure?.status === "skipped"
          ? `skipped:${hygiene.closure.reason}`
          : "close_failed",
    comments: {
      pr: commandStatus(prComment),
      issue: hygiene.comment,
      parent: hygiene.parentProgress,
    },
  };
  return { ...merged, evidence: writeAutoMergeEvidence(config, merged, finalContext) };
}

function executeAutoMergeWithWait(config, initialContext, options) {
  const runner = options.runner || defaultRunner;
  const inspectState = options.inspectState || ((cfg, ctx) => inspectAutoMergeGithubState(cfg, { issue: ctx.issue, prUrlOrNumber: ctx.pr?.url || ctx.pr?.number || ctx.prNumber }));
  const sleep = options.sleep || sleepSync;
  const wait = options.wait;
  const attempts = [];
  let context = initialContext;
  let decision = options.firstDecision || evaluateAutoMergeDecision(context);
  let previousAttempt = null;
  const startedAtMs = Date.now();

  for (let attempt = 1; attempt <= wait.maxAttempts; attempt += 1) {
    const attemptSnapshot = snapshotAttempt(attempt, decision, context, previousAttempt, startedAtMs);
    attempts.push(attemptSnapshot);
    previousAttempt = attemptSnapshot;
    if (decision.eligible) {
      const result = executeAutoMerge(config, context, { ...options, runner, autoMergeWait: { maxAttempts: 1 } });
      return { ...result, waitAttempts: attempts };
    }
    if (!shouldWaitForAutoMergeDecision(decision) || attempt === wait.maxAttempts) break;
    sleep(wait.delayMs);
    const refreshed = inspectState(config, context);
    context = mergeAutoMergeContext(context, refreshed);
    if (!config.dryRun && context.expectedOriginMainSha) {
      const origin = runner("git", ["rev-parse", "origin/main"], { cwd: config.repoRoot });
      context.currentOriginMainSha = origin.status === 0 && !origin.error ? origin.stdout.trim() : context.currentOriginMainSha;
    }
    decision = evaluateAutoMergeDecision(context);
  }

  const timedOut = shouldWaitForAutoMergeDecision(decision);
  const finalDecision = {
    ...decision,
    result: "blocked",
    reason: timedOut ? `auto_merge_wait_expired:${decision.reason}` : decision.reason,
    waitAttempts: attempts,
  };
  return { ...finalDecision, evidence: writeAutoMergeEvidence(config, finalDecision, context) };
}

function legacyLabelCleanupResult(labelCleanup = {}) {
  if (labelCleanup.status === "updated") {
    return {
      status: "passed",
      labelsRemoved: labelCleanup.removed || labelCleanup.attemptedRemove || [],
      attemptedRemove: labelCleanup.attemptedRemove || labelCleanup.removed || [],
      preserved: labelCleanup.preserved || [],
    };
  }
  if (labelCleanup.status === "skipped") {
    return {
      status: "passed_noop",
      labelsRemoved: [],
      attemptedRemove: labelCleanup.attemptedRemove || [],
      preserved: labelCleanup.preserved || [],
      reason: labelCleanup.reason || "no_transient_labels",
    };
  }
  return {
    status: "failed",
    labelsRemoved: [],
    attemptedRemove: labelCleanup.attemptedRemove || [],
    preserved: labelCleanup.preserved || [],
    failureReason: labelCleanup.reason || "label_cleanup_failed",
  };
}

export function normalizeAutoMergeWait(wait = {}) {
  const requestedAttempts = Number(wait.maxAttempts);
  const maxAttempts = Number.isSafeInteger(requestedAttempts)
    ? Math.min(Math.max(requestedAttempts, 1), maxAutoMergeWaitAttempts)
    : defaultAutoMergeWait.maxAttempts;
  const requestedDelayMs = Number(wait.delayMs);
  const delayMs = Number.isFinite(requestedDelayMs)
    ? nearestDelayBucket(Math.max(0, requestedDelayMs))
    : defaultAutoMergeWait.delayMs;
  return { maxAttempts, delayMs };
}

function shouldWaitForAutoMergeDecision(decision) {
  const reason = String(decision?.reason || "");
  if (reason === "required_checks_pending") return true;
  const mergeState = reason.match(/^pr_merge_state_not_clean:(.*)$/)?.[1];
  if (mergeState === undefined) return false;
  return refreshableMergeStates.has(mergeState.toUpperCase()) || refreshableMergeStates.has(mergeState);
}

export function requiresIndependentAiReview(laneDecision = {}) {
  return (
    independentReviewRequiredLanes.has(laneDecision.lane) ||
    laneDecision.reviewerTier === "cheap_independent" ||
    laneDecision.reviewerTier === "strong_independent" ||
    laneDecision.reviewerTier === "tie_breaker"
  );
}

export function evaluatePrePushReviewGate(input = {}) {
  const laneDecision = input.laneDecision || {};
  const externalReview = input.externalReview || null;
  if (input.reviewMutationGuard?.mutationDetected) {
    return {
      ok: false,
      outcome: "auto_failed",
      reason: "exact_head_review_mutated_checkout",
      message: "exact-head review mutated the checkout",
    };
  }
  if (requiresIndependentAiReview(laneDecision) && externalReview?.status !== "pass") {
    return {
      ok: false,
      outcome: "review_changes_requested_retry_exhausted",
      reason: `exact_head_independent_review_not_passed:${externalReview?.reason || externalReview?.status || "missing"}`,
      message: `exact-head independent review returned ${externalReview?.reason || externalReview?.status || "missing"}`,
    };
  }
  return { ok: true, reason: "pre_push_review_gates_passed" };
}

export function shouldGenerateExistingPrRecoveryEvidence(laneDecision = {}, exactHeadEvidence = {}) {
  return Boolean(
    !exactHeadEvidence.validationPassed ||
      !exactHeadEvidence.codexMechanicsApproved ||
      !exactHeadEvidence.codexMechanicsHeadSha ||
      !Array.isArray(exactHeadEvidence.codexMechanicsChangedFiles) ||
      (requiresIndependentAiReview(laneDecision) &&
        (!exactHeadEvidence.geminiPass ||
          !exactHeadEvidence.geminiHeadSha ||
          !Array.isArray(exactHeadEvidence.geminiChangedFiles))),
  );
}

function evaluateApprovedLanePolicy(config = {}, laneDecision = {}) {
  const canonicalLane = laneDecision.canonicalLane || laneDecision.lane;
  if (!approvedDomainAutoMergeLanes.includes(canonicalLane)) return { ok: false, reason: "lane_not_approved_domain_auto_merge_supported" };
  if (laneDecision.splitRequired || laneDecision.branchStrategy === "split-required") return { ok: false, reason: "split_required_lanes_do_not_auto_merge" };
  if (laneDecision.manualActionRequired || laneDecision.manualGate || laneDecision.dangerGate) return { ok: false, reason: "manual_or_danger_gate_present" };
  if (laneDecision.laneManifest?.decisionType !== "runnable") return { ok: false, reason: "lane_manifest_not_runnable" };
  if (laneDecision.laneManifest?.autoMergeAllowed !== true) return { ok: false, reason: "lane_manifest_auto_merge_not_supported" };
  const approved = config.autoMergePolicy?.approvedLanes || [];
  const canaryApproval = Boolean(config.canary && lowRiskAutoMergeLanes.includes(canonicalLane));
  if (!canaryApproval && !approved.includes(canonicalLane)) return { ok: false, reason: "lane_not_in_approved_auto_merge_config" };
  return { ok: true };
}

function branchStrategyMatches(laneDecision = {}, branchName = "") {
  const branch = String(branchName || "");
  if (laneDecision.branchStrategy === "focused") return /^focused\/auto-\d+-/.test(branch);
  if (laneDecision.branchStrategy === "normal") return /^feature\/auto-\d+-/.test(branch);
  return false;
}

function evaluateValidationEvidence(input, { expectedHeadSha, expectedBaseSha, changedFiles, laneDecision }) {
  const validation = input.validation || {};
  if (validation.passed !== true) return { ok: false, reason: "local_validation_not_passed" };
  if (!Array.isArray(validation.results) || validation.results.length === 0) return { ok: false, reason: "validation_exact_evidence_missing" };
  if (!validation.completedAt) return { ok: false, reason: "validation_completed_at_missing" };
  if (validation.headSha !== expectedHeadSha) return { ok: false, reason: "validation_head_mismatch" };
  if (expectedBaseSha && validation.baseSha !== expectedBaseSha) return { ok: false, reason: "validation_base_mismatch" };
  if (!Array.isArray(validation.changedFiles)) return { ok: false, reason: "validation_files_missing" };
  if (!sameStringSet(validation.changedFiles, changedFiles)) return { ok: false, reason: "validation_files_mismatch" };
  if (validation.changedFilesDigest !== digestStrings(changedFiles)) return { ok: false, reason: "validation_file_digest_mismatch" };
  if (validation.profile !== laneDecision.validationProfile) return { ok: false, reason: "validation_profile_mismatch" };
  return { ok: true };
}

function evaluateMobilePlatformBuildEvidence(input, { expectedHeadSha, expectedBaseSha, changedFiles, laneDecision }) {
  const canonicalLane = laneDecision.canonicalLane || laneDecision.lane;
  if (canonicalLane !== "mobile-build-config") return { ok: true };
  const requirements = inferMobileBuildPlatformRequirements(changedFiles, laneDecision);
  if (requirements.localCheckIds.length === 0 && requirements.externalCheckIds.length === 0) return { ok: true };
  const validationEvidence = input.validation?.mobileBuildPlatformEvidence || {};
  if (validationEvidence.headSha !== expectedHeadSha) return { ok: false, reason: "mobile_platform_validation_head_mismatch" };
  if (expectedBaseSha && validationEvidence.baseSha !== expectedBaseSha) return { ok: false, reason: "mobile_platform_validation_base_mismatch" };
  if (validationEvidence.changedFilesDigest !== digestStrings(changedFiles)) {
    return { ok: false, reason: "mobile_platform_validation_file_digest_mismatch" };
  }
  if (!sameStringSet(validationEvidence.platforms || [], requirements.platforms)) {
    return { ok: false, reason: "mobile_platform_set_mismatch" };
  }
  if (!sameStringSet(validationEvidence.localCheckIds || [], requirements.localCheckIds)) {
    return { ok: false, reason: "mobile_platform_local_check_set_mismatch" };
  }
  if (!sameStringSet(validationEvidence.externalCheckIds || [], requirements.externalCheckIds)) {
    return { ok: false, reason: "mobile_platform_external_check_set_mismatch" };
  }
  const localChecks = Array.isArray(validationEvidence.localChecks) ? validationEvidence.localChecks : [];
  for (const checkId of requirements.localCheckIds) {
    const check = localChecks.find((item) => item.checkId === checkId);
    if (!check) return { ok: false, reason: `mobile_platform_local_check_missing:${checkId}` };
    if (check.passed !== true || check.status !== 0) return { ok: false, reason: `mobile_platform_local_check_failed:${checkId}` };
  }
  const externalEvidence = Array.isArray(input.externalPlatformBuildEvidence) ? input.externalPlatformBuildEvidence : [];
  for (const checkId of requirements.externalCheckIds) {
    const check = externalEvidence.find((item) => item.checkId === checkId);
    if (!check) return { ok: false, reason: `mobile_platform_external_check_missing:${checkId}` };
    if (check.status !== "COMPLETED" || check.conclusion !== "SUCCESS") {
      return { ok: false, reason: `mobile_platform_external_check_not_successful:${checkId}` };
    }
    if (check.headSha !== expectedHeadSha) return { ok: false, reason: `mobile_platform_external_check_head_mismatch:${checkId}` };
    if (expectedBaseSha && check.baseSha !== expectedBaseSha) {
      return { ok: false, reason: `mobile_platform_external_check_base_mismatch:${checkId}` };
    }
    if (check.changedFilesDigest !== digestStrings(changedFiles)) {
      return { ok: false, reason: `mobile_platform_external_check_file_digest_mismatch:${checkId}` };
    }
  }
  return { ok: true };
}

function evaluateIndependentReviewEvidence(input) {
  const review = input.externalReview || {};
  const required = Boolean(input.externalReviewRequired) || requiresIndependentAiReview(input.laneDecision);
  if (!required) return { ok: true };
  if (review.status !== "pass") {
    return { ok: false, reason: `independent_review_not_passed:${review.reason || review.status || "missing"}` };
  }
  const requiredTier = input.laneDecision?.reviewerTier || "cheap_independent";
  if (requiredTier === "cheap_independent" && !["cheap_independent", "strong_independent", "tie_breaker"].includes(review.tier)) {
    return { ok: false, reason: "independent_review_tier_downgrade" };
  }
  if (requiredTier === "strong_independent" && !strongIndependentTiers.has(review.tier)) {
    return { ok: false, reason: "independent_review_tier_downgrade" };
  }
  if (review.verdict && review.verdict !== "pass") {
    return { ok: false, reason: "independent_review_malformed_or_non_pass_verdict" };
  }
  const reviewedHead = review.reviewedHead || review.headSha || review.prHeadSha || null;
  const expectedHead = input.expectedHeadSha || input.runnerCreatedCommitSha || null;
  const actualHead = input.actualHeadSha || input.pr?.headRefOid || null;
  if (!reviewedHead) return { ok: false, reason: "independent_review_head_missing" };
  if (reviewedHead && reviewedHead !== (actualHead || expectedHead)) {
    return { ok: false, reason: "independent_review_head_mismatch" };
  }
  if (!Array.isArray(review.changedFiles)) return { ok: false, reason: "independent_review_files_missing" };
  if (Array.isArray(review.changedFiles) && !sameStringSet(review.changedFiles, input.changedFiles || [])) {
    return { ok: false, reason: "independent_review_files_mismatch" };
  }
  if (!review.changedFilesDigest) return { ok: false, reason: "independent_review_file_digest_missing" };
  if (review.changedFilesDigest !== digestStrings(input.changedFiles || [])) {
    return { ok: false, reason: "independent_review_file_digest_mismatch" };
  }
  if (review.baseSha && input.expectedOriginMainSha && review.baseSha !== input.expectedOriginMainSha) {
    return { ok: false, reason: "independent_review_base_mismatch" };
  }
  if (review.independent === false || review.provider === "codex") return { ok: false, reason: "independent_review_provider_not_independent" };
  if (!review.completedAt && !review.finishedAt) return { ok: false, reason: "independent_review_timestamp_missing" };
  if (review.budget?.status && review.budget.status !== "pass") return { ok: false, reason: "independent_review_budget_not_passed" };
  return { ok: true };
}

function evaluateCodexReviewEvidence(input, { expectedHeadSha, expectedBaseSha, changedFiles }) {
  const review = input.review || {};
  if (input.codexMechanicsReviewApproved !== true && review.verdict?.verdict !== "approve") {
    return { ok: false, reason: "codex_mechanics_review_not_approved" };
  }
  const codexReviewHead = review.reviewedHead || review.headSha || null;
  if (!codexReviewHead) return { ok: false, reason: "codex_mechanics_review_head_missing" };
  if (codexReviewHead !== expectedHeadSha) return { ok: false, reason: "codex_mechanics_review_head_mismatch" };
  if (expectedBaseSha && review.baseSha && review.baseSha !== expectedBaseSha) return { ok: false, reason: "codex_mechanics_review_base_mismatch" };
  if (!Array.isArray(review.changedFiles)) return { ok: false, reason: "codex_mechanics_review_files_missing" };
  if (!sameStringSet(review.changedFiles, changedFiles)) return { ok: false, reason: "codex_mechanics_review_files_mismatch" };
  if (review.changedFilesDigest && review.changedFilesDigest !== digestStrings(changedFiles)) return { ok: false, reason: "codex_mechanics_review_file_digest_mismatch" };
  if (review.mutationDetected === true || review.checkoutMutationDetected === true) return { ok: false, reason: "codex_mechanics_review_mutated_checkout" };
  if (Array.isArray(review.blockingFindings) && review.blockingFindings.length > 0) return { ok: false, reason: "codex_mechanics_review_blocking_findings" };
  if (!review.completedAt && !review.finishedAt) return { ok: false, reason: "codex_mechanics_review_timestamp_missing" };
  return { ok: true };
}

function mergeAutoMergeContext(context, githubState = {}) {
  const refreshedHeadSha = githubState.pr?.headRefOid || context.actualHeadSha || context.pr?.headRefOid || null;
  return {
    ...context,
    ...githubState,
    issue: githubState.issue || context.issue,
    pr: { ...(context.pr || {}), ...(githubState.pr || {}) },
    actualHeadSha: refreshedHeadSha,
    requiredChecks: githubState.requiredChecks || context.requiredChecks || [],
    reviewThreads: githubState.reviewThreads || context.reviewThreads || [],
    codeScanningAlerts: githubState.codeScanningAlerts || context.codeScanningAlerts || [],
    blockingMarkers: githubState.blockingMarkers || context.blockingMarkers || [],
  };
}

function snapshotAttempt(attempt, decision, context, previousAttempt = null, startedAtMs = Date.now()) {
  const checks = summarizeCheckStatus(context.requiredChecks || []);
  const pendingCheckNames = (context.requiredChecks || [])
    .filter((check) => check.status !== "COMPLETED")
    .map((check) => check.name || "unknown")
    .sort();
  const pendingChecksDecreasing =
    previousAttempt?.checks?.pending !== undefined ? checks.pending < previousAttempt.checks.pending : false;
  return sanitizeEvidence({
    attempt,
    elapsedMs: Date.now() - startedAtMs,
    reason: decision.reason,
    eligible: Boolean(decision.eligible),
    prHeadSha: decision.prHeadSha,
    expectedHeadSha: decision.expectedHeadSha,
    mergeStateStatus: context.pr?.mergeStateStatus || null,
    mergeable: context.pr?.mergeable || null,
    checks,
    pendingCheckNames,
    pendingChecksDecreasing,
    pendingChecksProgressing: pendingChecksDecreasing,
    blockingMarkers: context.blockingMarkers || [],
  });
}

function nearestDelayBucket(delayMs) {
  let selected = autoMergeWaitDelayBucketsMs[0];
  for (const bucket of autoMergeWaitDelayBucketsMs) {
    if (delayMs >= bucket) selected = bucket;
  }
  return selected;
}

function inspectReviewThreads(config, prNumber, blockingMarkers) {
  if (!prNumber) {
    blockingMarkers.push("review_thread_inspection_missing_pr_number");
    return [{ isResolved: false }];
  }
  const query = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}}}}}`;
  const result = defaultRunner(
    "gh",
    [
      "api",
      "graphql",
      "-f",
      "owner=tommytang213",
      "-f",
      "name=Settleora",
      "-F",
      `number=${prNumber}`,
      "-f",
      `query=${query}`,
    ],
    { cwd: config.repoRoot },
  );
  if (result.error || result.status !== 0) {
    blockingMarkers.push("review_thread_inspection_failed");
    return [{ isResolved: false }];
  }
  try {
    return JSON.parse(result.stdout || "{}").data.repository.pullRequest.reviewThreads.nodes || [];
  } catch {
    blockingMarkers.push("review_thread_parse_failed");
    return [{ isResolved: false }];
  }
}

function inspectCodeScanningAlerts(config, headRefName, blockingMarkers) {
  if (!headRefName) {
    blockingMarkers.push("code_scanning_ref_missing");
    return [{ state: "open" }];
  }
  const result = defaultRunner(
    "gh",
    ["api", `/repos/tommytang213/Settleora/code-scanning/alerts?state=open&ref=refs/heads/${encodeURIComponent(headRefName)}`],
    { cwd: config.repoRoot },
  );
  if (result.error || result.status !== 0) {
    blockingMarkers.push("code_scanning_inspection_failed");
    return [{ state: "open" }];
  }
  try {
    const parsed = JSON.parse(result.stdout || "[]");
    return Array.isArray(parsed) ? parsed : [{ state: "open" }];
  } catch {
    blockingMarkers.push("code_scanning_parse_failed");
    return [{ state: "open" }];
  }
}

function flattenCheckRollup(rollup) {
  return rollup.map((check) => ({
    name: check.name || check.context || "unknown",
    status: check.status || (check.state === "SUCCESS" ? "COMPLETED" : check.state),
    conclusion: check.conclusion || check.state,
  }));
}

function detectBlockingMarkers(comments, reviews) {
  const text = [...comments, ...reviews].map((item) => `${item.body || ""} ${item.state || ""}`).join("\n");
  const markers = [];
  if (/\b(needs-tommy|danger-gate|blocked|manual gate|do not merge|changes requested)\b/i.test(text)) {
    markers.push("blocking_comment_or_review_marker");
  }
  return markers;
}

function summarizeCheckStatus(checks, policy = {}) {
  const requiredNames = uniqueStrings([...mandatoryRequiredChecks, ...(policy?.requiredChecks || [])]);
  const allowlistNames = uniqueStrings([
    ...(policy?.allowedSkippedChecks || []),
    ...(policy?.allowedNeutralChecks || []),
  ]);
  const allowedSkipped = new Set(policy?.allowedSkippedChecks || []);
  const allowedNeutral = new Set(policy?.allowedNeutralChecks || []);
  if (checks.length === 0) return { state: "missing", total: 0, pending: 0, failed: 0, missingRequired: requiredNames };
  const matched = new Set();
  for (const required of requiredNames) {
    if (checks.some((check) => checkNameMatchesRequired(check.name, required))) matched.add(required);
  }
  const missingRequired = requiredNames.filter((name) => !matched.has(name));
  if (missingRequired.length > 0) return { state: "missing", total: checks.length, pending: 0, failed: 0, missingRequired };
  const canonicalCandidates = uniqueStrings([...requiredNames, ...allowlistNames]);
  const pending = checks.filter((check) => normalizeCheckStatusValue(check.status) !== "COMPLETED").length;
  const failed = checks.filter((check) => {
    if (normalizeCheckStatusValue(check.status) !== "COMPLETED") return false;
    const conclusion = normalizeCheckStatusValue(check.conclusion);
    const canonicalName = canonicalCheckName(check.name, canonicalCandidates);
    if (conclusion === "SUCCESS") return false;
    if (conclusion === "SKIPPED") return !allowedSkipped.has(canonicalName);
    if (conclusion === "NEUTRAL") return !allowedNeutral.has(canonicalName);
    return true;
  }).length;
  if (failed > 0) return { state: "failed", total: checks.length, pending, failed, missingRequired };
  if (pending > 0) return { state: "pending", total: checks.length, pending, failed, missingRequired };
  return { state: "success", total: checks.length, pending, failed, missingRequired };
}

function sameStringSet(left = [], right = []) {
  const normalize = (items) => items.map((item) => String(item || "")).filter(Boolean).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function digestStrings(values = []) {
  return createHash("sha256").update(values.map((value) => String(value || "")).filter(Boolean).sort().join("\n")).digest("hex");
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "")).filter(Boolean))];
}

function checkNameMatchesRequired(actual, required) {
  const actualName = String(actual || "");
  const requiredName = String(required || "");
  return actualName === requiredName || actualName.endsWith(` / ${requiredName}`) || actualName.startsWith(`${requiredName} / `);
}

function canonicalCheckName(actual, candidates = []) {
  return candidates.find((candidate) => checkNameMatchesRequired(actual, candidate)) || String(actual || "unknown");
}

function normalizeCheckStatusValue(value) {
  return String(value || "").trim().toUpperCase();
}

function isUmbrellaIssue(issue = {}) {
  const labels = labelNames(issue.labels || []);
  const text = `${issue.title || ""}\n${labels.join("\n")}`;
  return umbrellaLabelPatterns.some((pattern) => pattern.test(text));
}

function sleepSync(delayMs) {
  if (!delayMs) return;
  const end = Date.now() + delayMs;
  while (Date.now() < end) {
    // Bounded synchronous wait keeps the runner single-process and avoids merge races.
  }
}

function restoreSourceBranchIfDeleted(config, context, runner) {
  const branchName = context.branchName || context.pr?.headRefName;
  const headSha = context.expectedHeadSha || context.runnerCreatedCommitSha;
  if (!branchName || !headSha) return { planned: false, reason: "missing_branch_or_sha" };
  const remote = runner("git", ["ls-remote", "--heads", "origin", branchName], { cwd: config.repoRoot });
  if (remote.status === 0 && remote.stdout.trim()) return { planned: false, executed: false, reason: "source_branch_exists" };
  const push = runner("git", ["push", "origin", `${headSha}:refs/heads/${branchName}`], { cwd: config.repoRoot });
  return { planned: true, executed: push.status === 0 && !push.error, status: push.status, stderr: bounded(push.stderr || push.error || "") };
}

function readMergeSha(runner, cwd, prNumber) {
  const result = runner("gh", ["pr", "view", String(prNumber), "--json", "mergeCommit", "-q", ".mergeCommit.oid"], { cwd });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null;
}

function mergeSummaryBody(context, mergeSha) {
  return [
    "Settleora auto-runner low-risk auto-merge completed.",
    "",
    `Issue: #${context.issue.number}`,
    `Reviewed PR head: ${context.expectedHeadSha || context.runnerCreatedCommitSha}`,
    `Merge SHA: ${mergeSha || "unavailable"}`,
    independentReviewSummaryLine(context),
    "Gates: contract, lane, changed files, independent AI review where required, Codex mechanics, local validation, exact-head checks, review threads, code scanning, and issue stop labels passed.",
  ].join("\n");
}

function issueSummaryBody(context, mergeSha) {
  return [
    "Completed by Settleora auto-runner low-risk auto-merge.",
    "",
    `PR: ${context.pr?.url || context.pr?.number || "unavailable"}`,
    `Reviewed PR head: ${context.expectedHeadSha || context.runnerCreatedCommitSha}`,
    `Merge SHA: ${mergeSha || "unavailable"}`,
    independentReviewSummaryLine(context),
  ].join("\n");
}

function independentReviewSummaryLine(context) {
  const required = Boolean(context.externalReviewRequired) || requiresIndependentAiReview(context.laneDecision);
  const review = context.externalReview || {};
  if (!required) {
    return `Independent AI review: not required; provider/tier: ${review.provider || "none"} ${review.tier || "none"}; verdict: ${review.verdict || review.status || "n/a"}; exact head: ${review.reviewedHead || context.expectedHeadSha || context.runnerCreatedCommitSha || "unknown"}; evidence: ${review.reportPath || review.evidencePath || "n/a"}`;
  }
  const passed = review.status === "pass" && (!review.verdict || review.verdict === "pass");
  return [
    "Independent AI review: required",
    `provider/tier: ${review.provider || "unknown"} ${review.tier || "unknown"}`,
    `verdict: ${passed ? "pass" : `blocked/fail-closed (${review.reason || review.status || "missing"})`}`,
    `exact head: ${review.reviewedHead || context.expectedHeadSha || context.runnerCreatedCommitSha || "unknown"}`,
    `evidence: ${review.reportPath || review.evidencePath || "unknown"}`,
  ].join("; ");
}

function commandStatus(result) {
  return { status: result.status, error: result.error || null };
}

export function cleanupIssueLifecycleLabels(config, context, runner = defaultRunner) {
  const issueNumber = context.issue?.number;
  const base = {
    issueNumber: issueNumber || null,
    transientAllowlist: [...transientIssueLifecycleLabels],
    labelsFound: [],
    labelsRemoved: [],
    status: "skipped",
    commandStatus: null,
    failureReason: null,
    dryRun: Boolean(config.dryRun),
  };
  if (!issueNumber) return { ...base, failureReason: "missing_issue_number" };
  if (config.dryRun) {
    const labelsFound = labelNames(context.issue?.labels || []);
    const labelsRemoved = labelsFound.filter((label) => transientIssueLifecycleLabels.includes(label));
    return {
      ...base,
      labelsFound,
      labelsRemoved,
      status: "dry_run_preview",
      commandStatus: { view: { status: 0, error: null }, remove: { status: null, error: null } },
    };
  }

  const view = runner("gh", ["issue", "view", String(issueNumber), "--json", "labels"], { cwd: config.repoRoot });
  if (view.error || view.status !== 0) {
    return {
      ...base,
      status: "failed",
      commandStatus: { view: commandStatus(view), remove: null },
      failureReason: bounded(view.stderr || view.stdout || view.error || "issue_label_view_failed"),
    };
  }
  let labelsFound = [];
  try {
    labelsFound = labelNames(JSON.parse(view.stdout || "{}").labels || []);
  } catch (error) {
    return {
      ...base,
      status: "failed",
      commandStatus: { view: commandStatus(view), remove: null },
      failureReason: `issue_label_view_parse_failed:${bounded(error.message, 240)}`,
    };
  }
  const labelsRemoved = labelsFound.filter((label) => transientIssueLifecycleLabels.includes(label));
  if (labelsRemoved.length === 0) {
    return {
      ...base,
      labelsFound,
      labelsRemoved,
      status: "passed_noop",
      commandStatus: { view: commandStatus(view), remove: { status: null, error: null } },
    };
  }
  const remove = runner("gh", ["issue", "edit", String(issueNumber), "--remove-label", labelsRemoved.join(",")], {
    cwd: config.repoRoot,
  });
  if (remove.error || remove.status !== 0) {
    return {
      ...base,
      labelsFound,
      labelsRemoved: [],
      status: "failed",
      commandStatus: { view: commandStatus(view), remove: commandStatus(remove) },
      failureReason: bounded(remove.stderr || remove.stdout || remove.error || "issue_label_remove_failed"),
    };
  }
  return {
    ...base,
    labelsFound,
    labelsRemoved,
    status: "passed",
    commandStatus: { view: commandStatus(view), remove: commandStatus(remove) },
  };
}

function labelNames(labels) {
  return labels.map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
}

function referencesIssueNumber(text, issueNumber) {
  const normalizedNumber = normalizeIssueNumber(issueNumber);
  if (!normalizedNumber) return false;
  const needle = `#${normalizedNumber}`;
  const haystack = String(text || "");
  let offset = 0;
  while (offset < haystack.length) {
    const index = haystack.indexOf(needle, offset);
    if (index === -1) return false;
    const previous = haystack[index - 1] || "";
    const next = haystack[index + needle.length] || "";
    if (!/[A-Za-z0-9_]/.test(previous) && !/[A-Za-z0-9_]/.test(next)) return true;
    offset = index + needle.length;
  }
  return false;
}

function normalizeIssueNumber(issueNumber) {
  const number = typeof issueNumber === "number" ? issueNumber : Number(issueNumber);
  if (!Number.isSafeInteger(number) || number <= 0 || number > 999_999_999) return null;
  return String(number);
}

function sanitizeEvidence(value) {
  return sanitizePersistedEvidence(value);
}

function bounded(value, max = 1000) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
}

function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    command: `${command} ${args.join(" ")}`,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}
