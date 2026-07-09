#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseCliArgs, loadConfig, defaultLogsRoot } from "./lib/config.mjs";
import { runPreflight } from "./lib/preflight.mjs";
import { evaluateCanaryIssuePolicy, evaluateTrustPolicy, writeCanaryEvidence } from "./lib/canary-policy.mjs";
import { createLogger, safeTimestamp, slugify } from "./lib/logger.mjs";
import { acquireRunnerLock, releaseRunnerLock, writeIterationState } from "./lib/state-store.mjs";
import { classifyIssueLane, filterForbiddenChangedFiles } from "./lib/lane-policy.mjs";
import { pollEligibleIssues, claimIssue, commentIssueOutcome } from "./lib/github-issues.mjs";
import {
  commitExplicitPaths,
  createTaskBranch,
  ensureTaskStartWorkspace,
  fetchOriginMain,
  getBoundedWorkingTreeDiff,
  getCurrentBranch,
  getRefSha,
  getStatusShort,
  listWorkingTreeChangedFiles,
  workingTreeDiffHash,
} from "./lib/git-workspace.mjs";
import { generateTaskPrompt } from "./lib/task-prompt.mjs";
import { runCodexPrompt, runReviewPrompt } from "./lib/codex-runner.mjs";
import { collectReport } from "./lib/report-collector.mjs";
import { planValidation, runValidationPlan } from "./lib/validation-planner.mjs";
import { inspectPreReviewPrOwnership, openOrUpdatePr, pushBranch, watchChecks } from "./lib/pr-manager.mjs";
import { writeRecentSummary, writeRunSummary } from "./lib/summary-writer.mjs";
import { reviewerReadinessSummary } from "./lib/reviewer-policy.mjs";
import { runGeminiIntegratedReview, runGeminiReviewerSmokeTest } from "./lib/gemini-reviewer.mjs";
import { executeAutoMerge, inspectAutoMergeGithubState, writeAutoMergeEvidence, evaluateAutoMergeDecision } from "./lib/auto-merge-policy.mjs";

async function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  if (cliArgs.writeSummary) {
    const config = { logsRoot: defaultLogsRoot };
    const result = writeRecentSummary(config, cliArgs.sinceMs);
    console.log(`Wrote summary: ${result.markdownPath}`);
    return;
  }
  if (cliArgs.reviewPackage) {
    const config = loadConfig({ dryRun: false, run: false, configPath: cliArgs.configPath });
    const packageText = readFileSync(cliArgs.reviewPackage, "utf8");
    const result = runReviewPrompt(config, {
      packagePath: cliArgs.reviewPackage,
      summary: JSON.parse(packageText).summary || JSON.parse(packageText),
    });
    console.log(JSON.stringify(result.verdict, null, 2));
    return;
  }
  if (cliArgs.preflight) {
    const config = loadConfig(cliArgs);
    const result = runPreflight(config);
    console.error(
      `Readiness preflight: ${result.summary.pass} pass, ${result.summary.warn} warn, ${result.summary.fail} fail`,
    );
    console.error(`Readiness reports: ${result.readinessReports.markdownPath} ${result.readinessReports.jsonPath}`);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.summary.fail > 0 ? 1 : 0;
    return;
  }
  if (cliArgs.reviewerSmokeTest) {
    const config = loadConfig(cliArgs);
    const result = await runGeminiReviewerSmokeTest(config, {
      liveExternalReviewerCalls: cliArgs.liveExternalReviewerCalls,
      tierId: cliArgs.reviewerSmokeTier || config.reviewerSmokeTest?.tier,
    });
    console.error(`Gemini reviewer smoke test: ${result.status} (${result.reason})`);
    console.error(`Smoke report: ${result.reportPath}`);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode =
      result.status === "pass" || result.status === "skipped" || result.reason === "blocked_for_live_smoke_test_key_missing"
        ? 0
        : 1;
    return;
  }

  const config = loadConfig(cliArgs);
  const trustPolicy = evaluateTrustPolicy(config);
  if (!trustPolicy.allowed) {
    throw new Error(`Trusted real-run refused: ${trustPolicy.reason}`);
  }
  const runId = `run-${safeTimestamp()}`;
  const logger = createLogger(config.logsRoot, runId);
  let lockPath = null;
  const summary = {
    runId,
    mode: config.mode,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    baseOriginMainSha: null,
    iterations: [],
    stopReason: null,
    logPath: logger.logPath,
  };

  try {
    lockPath = acquireRunnerLock(config);
    const workspace = ensureTaskStartWorkspace(config, logger);
    summary.baseOriginMainSha = workspace.originMainSha;
    logger.info(`Settleora auto-runner started in ${config.mode} mode.`);

    const startedAtMs = Date.now();
    for (let index = 1; index <= config.maxIterations; index += 1) {
      if (config.maxRuntimeMs && Date.now() - startedAtMs >= config.maxRuntimeMs) {
        summary.stopReason = "max-runtime-reached";
        break;
      }
      const iteration = await runIteration(config, logger, runId, index);
      const canaryEvidence = writeCanaryEvidence(config, iteration);
      if (canaryEvidence) {
        iteration.canaryEvidence = canaryEvidence;
      }
      summary.iterations.push(iteration);
      writeIterationState(config, iteration);
      if (config.fixtureIssues && iteration.issue) {
        config.fixtureIssueCursor = (config.fixtureIssueCursor || 0) + 1;
      }
      if (iteration.systemicStop) {
        summary.stopReason = iteration.systemicStop;
        break;
      }
      if (iteration.outcome === "no_eligible_work") {
        summary.stopReason = "no-eligible-work";
        break;
      }
    }
    if (!summary.stopReason) {
      summary.stopReason = "max-iterations-reached";
    }
  } finally {
    releaseRunnerLock(lockPath);
    summary.finishedAt = new Date().toISOString();
    const paths = writeRunSummary(config, summary);
    logger.info(`Settleora auto-runner finished: ${paths.markdownPath}`);
  }
}

async function runIteration(config, logger, runId, index) {
  const iteration = {
    runId,
    index,
    startedAt: new Date().toISOString(),
    issue: null,
    laneDecision: null,
    outcome: null,
    systemicStop: null,
  };

  const polled = pollEligibleIssues(config, logger);
  iteration.poll = { rawCount: polled.rawCount || 0, warning: polled.warning || null, searches: polled.searches || [] };
  if (polled.issues.length === 0) {
    iteration.outcome = "no_eligible_work";
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const issue = polled.issues[0];
  iteration.issue = {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    labels: issue.labels,
  };
  logger.info(`Iteration ${index}: selected issue #${issue.number} ${issue.title}`);

  const claim = claimIssue(config, issue, logger);
  iteration.claim = claim;

  const laneDecision = classifyIssueLane(issue);
  iteration.laneDecision = laneDecision;
  iteration.canaryPolicy = evaluateCanaryIssuePolicy(config, laneDecision);
  if (!iteration.canaryPolicy.allowed) {
    iteration.outcome = laneDecision.dangerGate ? "danger_gate" : "blocked_needs_tommy";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner canary policy did not implement #${issue.number}.\n\nOutcome: ${iteration.outcome}\nReason: ${iteration.canaryPolicy.reason}`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }
  if (!laneDecision.allowedToImplement) {
    iteration.outcome = laneDecision.dangerGate ? "danger_gate" : "blocked_needs_tommy";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner did not implement #${issue.number}.\n\nOutcome: ${iteration.outcome}\nReason: ${laneDecision.reason}`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const slug = slugify(issue.title, 40);
  const branchName = `feature/auto-${issue.number}-${slug}-${safeTimestamp().slice(0, 15).toLowerCase()}`;
  iteration.branchName = branchName;
  fetchOriginMain(config);
  iteration.baseOriginMainSha = config.dryRun ? null : getRefSha("origin/main");
  createTaskBranch(config, branchName);

  const promptInfo = generateTaskPrompt(config, issue, laneDecision, branchName);
  iteration.taskPrompt = {
    promptPath: promptInfo.promptPath,
    reportPath: promptInfo.reportPath,
    timestampKey: promptInfo.timestampKey,
  };

  const codexResult = runCodexPrompt(config, { ...promptInfo, branchName }, "implementation");
  iteration.codex = codexResult;
  if (!codexResult.skipped && (codexResult.error || codexResult.status !== 0)) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(config, issue, iteration.outcome, codexFailureBody(issue, codexResult));
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const changedFiles = listWorkingTreeChangedFiles();
  iteration.changedFiles = changedFiles;
  if (changedFiles.length === 0 && !config.dryRun) {
    iteration.outcome = "no_changes";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner made no changes for #${issue.number}; no PR was opened.`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const forbidden = filterForbiddenChangedFiles(changedFiles, laneDecision);
  iteration.forbiddenChangedFiles = forbidden;
  if (forbidden.length > 0) {
    iteration.outcome = "danger_gate";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner blocked #${issue.number} because changed files crossed lane policy:\n\n${forbidden.join("\n")}`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  if (!laneDecision.prCreationAllowed) {
    iteration.outcome = "blocked_needs_tommy";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner did not open a PR for #${issue.number} because lane ${laneDecision.lane} does not allow PR creation.`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const validationPlan = planValidation(changedFiles, laneDecision);
  iteration.validation = runValidationPlan(config, validationPlan);
  if (!iteration.validation.passed) {
    iteration.outcome = "validation_failed";
    iteration.issueComment = finishIssueOutcome(config, issue, iteration.outcome, validationFailureBody(issue, iteration.validation));
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  iteration.report = collectReport(config, promptInfo);
  if (!config.dryRun && !iteration.report.found) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Expected report missing: ${promptInfo.reportPath}`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  iteration.preReviewPrOwnership = inspectPreReviewPrOwnership(config, branchName);
  if (!iteration.preReviewPrOwnership.clean) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      preReviewPrOwnershipFailureBody(issue, iteration.preReviewPrOwnership),
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const beforeReview = await checkoutFingerprint();
  iteration.reviewPackage = await writeReviewPackage(config, {
    issue,
    promptInfo,
    laneDecision,
    changedFiles,
    validation: iteration.validation,
    report: iteration.report,
  });
  iteration.externalReview = await runGeminiIntegratedReview(config, iteration.reviewPackage);
  if (iteration.externalReview.status === "blocked") {
    iteration.outcome =
      iteration.externalReview.reason === "blocked_external_reviewer_route_not_eligible" ||
      iteration.externalReview.reason === "blocked_external_reviewer_lane_not_eligible" ||
      iteration.externalReview.reason === "blocked_external_reviewer_path_not_eligible"
        ? "blocked_needs_tommy"
        : "review_changes_requested_retry_exhausted";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner did not open a PR for #${issue.number} because integrated Gemini pre-PR review returned ${iteration.externalReview.reason}.`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }
  iteration.review = runReviewPrompt(config, iteration.reviewPackage);
  const afterReview = await checkoutFingerprint();
  iteration.reviewMutationGuard = compareFingerprints(beforeReview, afterReview);
  if (iteration.reviewMutationGuard.mutationDetected) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner blocked #${issue.number} because pre-PR review mutated the checkout.`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  if (config.requirePrePrReview && iteration.review.verdict.verdict !== "approve") {
    iteration.outcome =
      iteration.review.verdict.verdict === "danger_gate"
        ? "danger_gate"
        : iteration.review.verdict.verdict === "needs_tommy"
          ? "blocked_needs_tommy"
        : "review_changes_requested_retry_exhausted";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner did not open a PR for #${issue.number} because pre-PR review returned ${iteration.review.verdict.verdict}.`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }
  if (!config.dryRun && iteration.review.verdict.verdict !== "approve") {
    iteration.outcome = "review_changes_requested_retry_exhausted";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner did not open a PR for #${issue.number} because pre-PR review returned ${iteration.review.verdict.verdict}.`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  iteration.commit = commitExplicitPaths(config, changedFiles, `Auto-runner issue #${issue.number}: ${issue.title}`);
  iteration.runnerCreatedCommitSha = config.dryRun ? null : getRefSha("HEAD");
  iteration.push = pushBranch(config, branchName);
  if (!config.dryRun && (iteration.push.error || iteration.push.status !== 0)) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner failed while pushing branch ${branchName} for #${issue.number}.`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }
  iteration.pr = openOrUpdatePr(config, issue, branchName, prSummary(iteration));
  if (!config.dryRun && iteration.pr.url) {
    iteration.ci = watchChecks(config, iteration.pr.url);
  }
  iteration.autoMerge = await evaluateOrExecuteAutoMerge(config, {
    issue,
    iteration,
    branchName,
    changedFiles,
    forbidden,
  });
  if (iteration.autoMerge.result === "merged") {
    iteration.outcome = "auto_merged";
  } else if (config.allowAutoMerge && !config.dryRun) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner opened a PR for #${issue.number} but did not auto-merge it.\n\nPR: ${iteration.pr?.url || "URL unavailable"}\nReason: ${iteration.autoMerge.reason}`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  } else {
    iteration.outcome = config.dryRun ? "dry_run_preview_complete" : "approved_pr_opened";
  }
  if (!config.dryRun) {
    if (iteration.outcome === "approved_pr_opened") {
      iteration.issueComment = finishIssueOutcome(
        config,
        issue,
        iteration.outcome,
        `Auto-runner opened or updated a PR for #${issue.number}: ${iteration.pr?.url || "URL unavailable"}`,
      );
    }
  }
  iteration.finishedAt = new Date().toISOString();
  return iteration;
}

async function evaluateOrExecuteAutoMerge(config, { issue, iteration, branchName, changedFiles, forbidden }) {
  const baseContext = {
    config,
    issue: { ...iteration.issue, state: issue.state || "OPEN", labels: issue.labels || [] },
    laneDecision: iteration.laneDecision,
    changedFiles,
    forbiddenChangedFiles: forbidden,
    changedFilesExactlyMatchAllowedPaths: forbidden.length === 0,
    externalReviewRequired: iteration.externalReview?.status !== "skipped",
    externalReview: iteration.externalReview,
    review: iteration.review,
    codexMechanicsReviewApproved: iteration.review?.verdict?.verdict === "approve",
    validation: iteration.validation,
    worktreeClean: config.dryRun ? true : getStatusShort() === "",
    branchName,
    runnerCreatedCommitSha: iteration.runnerCreatedCommitSha,
    expectedHeadSha: iteration.runnerCreatedCommitSha,
    expectedOriginMainSha: iteration.baseOriginMainSha,
    currentOriginMainSha: iteration.baseOriginMainSha,
    pr: {
      state: config.dryRun ? "OPEN" : null,
      isDraft: false,
      baseRefName: "main",
      headRefName: branchName,
      headRefOid: iteration.runnerCreatedCommitSha,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      url: iteration.pr?.url,
    },
    requiredChecks: [],
    reviewThreads: [],
    codeScanningAlerts: [],
    blockingMarkers: [],
  };
  if (!config.allowAutoMerge) {
    const decision = evaluateAutoMergeDecision(baseContext);
    return { ...decision, evidence: writeAutoMergeEvidence(config, decision, baseContext) };
  }
  if (!config.dryRun) {
    fetchOriginMain(config);
    baseContext.currentOriginMainSha = getRefSha("origin/main");
  }
  const githubState =
    config.dryRun || !iteration.pr?.url
      ? {}
      : inspectAutoMergeGithubState(config, { issue, prUrlOrNumber: iteration.pr.url });
  return executeAutoMerge(config, {
    ...baseContext,
    ...githubState,
    issue: githubState.issue || baseContext.issue,
    pr: { ...baseContext.pr, ...(githubState.pr || {}) },
    requiredChecks: githubState.requiredChecks || baseContext.requiredChecks,
    reviewThreads: githubState.reviewThreads || baseContext.reviewThreads,
    codeScanningAlerts: githubState.codeScanningAlerts || baseContext.codeScanningAlerts,
    blockingMarkers: githubState.blockingMarkers || baseContext.blockingMarkers,
  });
}

function finishIssueOutcome(config, issue, outcome, body) {
  return commentIssueOutcome(config, issue, outcome, body);
}

async function checkoutFingerprint() {
  return {
    branch: getCurrentBranch(),
    status: getStatusShort(),
    changedFiles: listWorkingTreeChangedFiles(),
    diffHash: await workingTreeDiffHash(),
    head: getRefSha("HEAD"),
  };
}

function compareFingerprints(before, after) {
  const mutationDetected =
    before.branch !== after.branch ||
    before.status !== after.status ||
    before.diffHash !== after.diffHash ||
    before.head !== after.head ||
    before.changedFiles.join("\n") !== after.changedFiles.join("\n");
  return { mutationDetected, before, after };
}

async function writeReviewPackage(config, payload) {
  const diff = getBoundedWorkingTreeDiff();
  const packagePath = path.join(
    config.logsRoot,
    "reviews",
    `${safeTimestamp()}-issue-${payload.issue.number}-${slugify(payload.issue.title, 40)}.json`,
  );
  const summary = {
    issue: {
      number: payload.issue.number,
      title: payload.issue.title,
      labels: payload.issue.labels,
      url: payload.issue.url,
    },
    taskPromptPath: payload.promptInfo.promptPath,
    laneDecision: payload.laneDecision,
    reviewerPolicy: reviewerReadinessSummary(config, {
      changedFiles: payload.changedFiles,
      laneDecision: payload.laneDecision,
      stats: { additions: 0, deletions: 0 },
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
    }),
    changedFiles: payload.changedFiles,
    validation: payload.validation,
    report: payload.report,
    diffTruncated: diff.truncated,
  };
  writeFileSync(packagePath, `${JSON.stringify({ summary, diff: diff.text }, null, 2)}\n`);
  return { packagePath, summary, diff: diff.text };
}

function prSummary(iteration) {
  return [
    `Issue: #${iteration.issue.number}`,
    `Lane: ${iteration.laneDecision.lane}`,
    `Validation: ${iteration.validation.passed ? "passed" : "failed"}`,
    `Integrated Gemini review: ${iteration.externalReview?.status || "not-run"} (${iteration.externalReview?.reason || "n/a"})`,
    `Pre-PR AI review: ${iteration.review?.verdict?.verdict || "not-run"}`,
    `Report: ${iteration.report?.copyPath || iteration.report?.expectedPath || "not-found"}`,
  ].join("\n");
}

function codexFailureBody(issue, codexResult) {
  return [
    `Auto-runner failed while invoking Codex for #${issue.number}.`,
    "",
    `Status: ${codexResult.status}`,
    `Log: ${codexResult.logPath}`,
    "",
    "Check nordvpn/watchdog/codex doctor and Codex auth if this is an environment failure.",
    "",
    "Tail:",
    codexResult.tail || "unavailable",
  ].join("\n");
}

function validationFailureBody(issue, validation) {
  const failed = validation.results.find((result) => result.status !== 0 || result.error);
  return [
    `Auto-runner validation failed for #${issue.number}.`,
    "",
    `Command: ${failed?.command || "unknown"}`,
    `Status: ${failed?.status}`,
    failed?.stderr || failed?.stdout || failed?.error || "",
  ].join("\n");
}

function preReviewPrOwnershipFailureBody(issue, ownership) {
  const prs = (ownership.prs || []).map((pr) => `#${pr.number} ${pr.state} ${pr.url}`).join("\n") || "none";
  return [
    `Auto-runner blocked #${issue.number} because GitHub mutation was detected before the runner-owned PR step.`,
    "",
    `Remote task branch exists: ${ownership.remoteBranchExists ? "yes" : "no"}`,
    `Remote task branch SHA: ${ownership.remoteBranchSha || "none"}`,
    `Pre-review PRs for task branch:`,
    prs,
    ownership.commandFailed ? `Inspection error: ${JSON.stringify(ownership.errors)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
