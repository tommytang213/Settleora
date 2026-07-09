import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { safeTimestamp } from "./logger.mjs";
import { evaluateLowRiskAutoMergeCanaryApproval } from "./canary-policy.mjs";
import { filterForbiddenChangedFiles } from "./lane-policy.mjs";

export const lowRiskAutoMergeLanes = Object.freeze(["workflow-docs-tooling", "docs-planning"]);
export const autoMergeStopLabels = Object.freeze([
  "needs-tommy",
  "manual-gate",
  "danger-gate",
  "blocked",
  "auto-failed",
]);

const successfulCheckConclusions = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const cleanMergeStates = new Set(["CLEAN"]);

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
  };

  const block = (reason) => ({ ...result, reason });

  if (!config.allowAutoMerge) return block("auto_merge_disabled_by_config");
  if (config.canary) {
    const approval = evaluateLowRiskAutoMergeCanaryApproval(config);
    if (!approval.approved) return block(`low_risk_auto_merge_canary_not_approved:${approval.reason}`);
  }
  if (!laneDecision.allowedToImplement) return block("lane_not_allowed_to_implement");
  if (!lowRiskAutoMergeLanes.includes(laneDecision.lane)) return block("lane_not_low_risk_auto_merge_approved");
  if (!laneDecision.autoMergeEligible || laneDecision.contract?.autoMergeEligible !== true) {
    return block("contract_not_auto_merge_eligible");
  }
  if (laneDecision.manualMergeRequired || laneDecision.contract?.manualMergeRequired !== false) {
    return block("manual_merge_required");
  }
  if (forbiddenChangedFiles.length > 0) return block(`forbidden_changed_files:${forbiddenChangedFiles.join(",")}`);
  if (changedFiles.length === 0) return block("no_changed_files");
  if (!input.changedFilesExactlyMatchAllowedPaths) return block("changed_files_do_not_match_allowed_paths");
  if (input.externalReviewRequired && input.externalReview?.status !== "pass") {
    return block(`integrated_gemini_not_passed:${input.externalReview?.reason || "missing"}`);
  }
  if (input.codexMechanicsReviewApproved !== true && input.review?.verdict?.verdict !== "approve") {
    return block("codex_mechanics_review_not_approved");
  }
  if (!input.validation?.passed) return block("local_validation_not_passed");
  if (input.worktreeClean !== true) return block("worktree_not_clean");
  if (pr.state !== "OPEN") return block("pr_not_open");
  if (pr.isDraft) return block("pr_is_draft");
  if (pr.baseRefName !== "main") return block("pr_base_not_main");
  if (actualHeadSha !== expectedHeadSha) return block("pr_head_sha_mismatch");
  if (pr.mergeable !== "MERGEABLE") return block("pr_not_mergeable");
  if (!cleanMergeStates.has(pr.mergeStateStatus)) return block(`pr_merge_state_not_clean:${pr.mergeStateStatus || "unknown"}`);
  if (input.expectedOriginMainSha && input.currentOriginMainSha !== input.expectedOriginMainSha) {
    return block("origin_main_base_mismatch");
  }
  if (!checksPassed(requiredChecks)) return block("required_checks_not_successful");
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
      "number,url,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,comments,reviews",
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
  if (!decision.eligible) {
    return { ...decision, evidence: writeAutoMergeEvidence(config, decision, context) };
  }
  if (config.dryRun) {
    const dryRun = { ...decision, attempted: false, result: "dry_run_eligible", reason: "dry_run_no_merge" };
    return { ...dryRun, evidence: writeAutoMergeEvidence(config, dryRun, context) };
  }

  const prNumber = context.pr?.number || context.prNumber || context.pr?.url;
  const merge = runner("gh", ["pr", "merge", String(prNumber), "--merge"], { cwd: config.repoRoot });
  if (merge.error || merge.status !== 0) {
    const failed = { ...decision, attempted: true, eligible: false, result: "merge_failed", reason: bounded(merge.stderr || merge.stdout || merge.error) };
    return { ...failed, evidence: writeAutoMergeEvidence(config, failed, context) };
  }

  const mergeSha = context.mergeSha || readMergeSha(runner, config.repoRoot, prNumber);
  const branchRestore = restoreSourceBranchIfDeleted(config, context, runner);
  const closeIssue = runner("gh", ["issue", "close", String(context.issue.number), "--reason", "completed"], { cwd: config.repoRoot });
  const prComment = runner("gh", ["pr", "comment", String(prNumber), "--body", mergeSummaryBody(context, mergeSha)], { cwd: config.repoRoot });
  const issueComment = runner("gh", ["issue", "comment", String(context.issue.number), "--body", issueSummaryBody(context, mergeSha)], {
    cwd: config.repoRoot,
  });
  const merged = {
    ...decision,
    attempted: true,
    result: "merged",
    reason: "github_merge_commit_completed",
    mergeSha,
    sourceBranchRestoration: branchRestore,
    issueClosureResult: closeIssue.status === 0 && !closeIssue.error ? "closed_completed" : "close_failed",
    comments: {
      pr: commandStatus(prComment),
      issue: commandStatus(issueComment),
    },
  };
  return { ...merged, evidence: writeAutoMergeEvidence(config, merged, context) };
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

function checksPassed(checks) {
  return checks.length > 0 && checks.every((check) => check.status === "COMPLETED" && successfulCheckConclusions.has(check.conclusion));
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
    "Gates: contract, lane, changed files, Gemini when configured, Codex mechanics, local validation, exact-head checks, review threads, code scanning, and issue stop labels passed.",
  ].join("\n");
}

function issueSummaryBody(context, mergeSha) {
  return [
    "Completed by Settleora auto-runner low-risk auto-merge.",
    "",
    `PR: ${context.pr?.url || context.pr?.number || "unavailable"}`,
    `Reviewed PR head: ${context.expectedHeadSha || context.runnerCreatedCommitSha}`,
    `Merge SHA: ${mergeSha || "unavailable"}`,
  ].join("\n");
}

function commandStatus(result) {
  return { status: result.status, error: result.error || null };
}

function labelNames(labels) {
  return labels.map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
}

function sanitizeEvidence(value) {
  return JSON.parse(
    JSON.stringify(value).replace(
      /(GEMINI_API_KEY|authorization|x-goog-api-key|bearer\s+[A-Za-z0-9._~+/-]+|api[_-]?key|secret|token)/gi,
      "[REDACTED]",
    ),
  );
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
