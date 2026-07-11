#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseCliArgs, loadConfig, defaultLogsRoot } from "./lib/config.mjs";
import { runPreflight } from "./lib/preflight.mjs";
import { evaluateCanaryIssuePolicy, evaluateTrustPolicy, writeCanaryEvidence } from "./lib/canary-policy.mjs";
import { createLogger, safeTimestamp, slugify } from "./lib/logger.mjs";
import { acquireRunnerLock, releaseRunnerLock, writeIterationState } from "./lib/state-store.mjs";
import { classifyIssueLane, filterForbiddenChangedFiles } from "./lib/lane-policy.mjs";
import { pollEligibleIssues, claimIssue, commentIssueOutcome, readIssueLive } from "./lib/github-issues.mjs";
import {
  createRunIssueTracker,
  markIssueAttempted,
  markIssueProcessed,
  selectDistinctEligibleIssue,
  trackerSnapshot,
  validateClaimReread,
} from "./lib/issue-selection.mjs";
import {
  commitExplicitPaths,
  createTaskBranch,
  ensureLaunchWorkspace,
  ensureTaskMutationWorkspace,
  fetchOriginMain,
  getBoundedDiff,
  getBoundedWorkingTreeDiff,
  getCurrentBranch,
  getRefSha,
  getStatusShort,
  listChangedFiles,
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
import { runReviewFixCanaryFixtureReview } from "./lib/review-fix-fixture.mjs";
import {
  buildPostReviewFixMechanicsContext,
  buildReviewFixPrompt,
  evaluateReviewFixMutationDecision,
  extractReviewFixTrigger,
  writeReviewFixEvidence,
} from "./lib/review-fix-policy.mjs";
import {
  buildIssueLinkageEvidence,
  evaluateExistingPrRecoveryDecision,
  executeAutoMerge,
  inspectAutoMergeGithubState,
  requiresIndependentAiReview,
  writeAutoMergeEvidence,
  evaluateAutoMergeDecision,
  evaluatePrePushReviewGate,
  shouldGenerateExistingPrRecoveryEvidence,
} from "./lib/auto-merge-policy.mjs";
import {
  applyControlAtSafeBoundary,
  clearActiveRunState,
  getRunnerStatus,
  listEvents,
  listRuns,
  renderEventsText,
  renderRunsText,
  renderStatusText,
  writeActiveRunState,
  writeControlCommand,
} from "./lib/control-plane.mjs";

async function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  if (cliArgs.writeSummary) {
    const config = { logsRoot: defaultLogsRoot };
    const result = writeRecentSummary(config, cliArgs.sinceMs);
    console.log(`Wrote summary: ${result.markdownPath}`);
    return;
  }
  if (cliArgs.status || cliArgs.listRuns || cliArgs.listEvents || cliArgs.controlCommand) {
    const config = loadConfig({ ...cliArgs, dryRun: true, run: false });
    if (cliArgs.status) {
      const status = getRunnerStatus(config);
      console.log(cliArgs.json ? JSON.stringify(status, null, 2) : renderStatusText(status));
      return;
    }
    if (cliArgs.listRuns) {
      const runs = listRuns(config);
      console.log(cliArgs.json ? JSON.stringify(runs, null, 2) : renderRunsText(runs));
      return;
    }
    if (cliArgs.listEvents) {
      const result = listEvents(config, cliArgs.eventRunId);
      console.log(cliArgs.json ? JSON.stringify(result, null, 2) : renderEventsText(result));
      process.exitCode = result.found ? 0 : 1;
      return;
    }
    const result = writeControlCommand(config, cliArgs);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
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
    supervisorRunId: config.supervisorRunId || null,
    mode: config.mode,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    baseOriginMainSha: null,
    iterations: [],
    attemptedIssueNumbers: [],
    attemptedIssueCount: 0,
    processedIssueNumbers: [],
    processedIssueCount: 0,
    stopReason: null,
    logPath: logger.logPath,
    autoMergeCanaryApprovalMode: trustPolicy.autoMergeCanaryApproval?.mode || "not_approved",
  };

  try {
    lockPath = acquireRunnerLock(config, {
      runId,
      mode: config.mode,
      configPath: config.configPath || null,
      maxIterations: config.maxIterations,
      maxRuntimeMs: config.maxRuntimeMs,
    });
    summary.baseOriginMainSha = getRefSha("origin/main");
    ensureLaunchWorkspace(config, logger);
    summary.maxIterations = config.maxIterations;
    summary.maxRuntimeMs = config.maxRuntimeMs;
    summary.configPath = config.configPath || null;
    writeActiveRunState(config, summary);
    logger.info(`Settleora auto-runner started in ${config.mode} mode.`);

    const startedAtMs = Date.now();
    const issueTracker = createRunIssueTracker(summary);
    for (let index = 1; index <= config.maxIterations; index += 1) {
      const control = applyControlAtSafeBoundary(config, summary);
      if (control.action === "stop") {
        summary.stopReason = control.reason;
        break;
      }
      summary.maxIterations = config.maxIterations;
      summary.maxRuntimeMs = config.maxRuntimeMs;
      if (config.maxRuntimeMs && Date.now() - startedAtMs >= config.maxRuntimeMs) {
        summary.stopReason = "max-runtime-reached";
        break;
      }
      Object.assign(summary, trackerSnapshot(issueTracker));
      const iteration = await runIteration(config, logger, runId, index, issueTracker);
      const canaryEvidence = writeCanaryEvidence(config, iteration);
      if (canaryEvidence) {
        iteration.canaryEvidence = canaryEvidence;
      }
      summary.iterations.push(iteration);
      if (iteration.issue?.number) {
        markIssueProcessed(issueTracker, iteration.issue.number);
        Object.assign(summary, trackerSnapshot(issueTracker));
        iteration.runIssueState = trackerSnapshot(issueTracker);
      }
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
      writeActiveRunState(config, summary);
    }
    if (!summary.stopReason) {
      summary.stopReason = "max-iterations-reached";
    }
  } finally {
    releaseRunnerLock(lockPath);
    summary.finishedAt = new Date().toISOString();
    const paths = writeRunSummary(config, summary);
    clearActiveRunState(config, paths.jsonPath);
    logger.info(`Settleora auto-runner finished: ${paths.markdownPath}`);
  }
}

async function runIteration(config, logger, runId, index, issueTracker = createRunIssueTracker()) {
  const iteration = {
    runId,
    index,
    startedAt: new Date().toISOString(),
    issue: null,
    laneDecision: null,
    outcome: null,
    systemicStop: null,
    runIssueState: trackerSnapshot(issueTracker),
  };

  const polled = pollEligibleIssues(config, logger);
  iteration.poll = { rawCount: polled.rawCount || 0, warning: polled.warning || null, searches: polled.searches || [] };
  if (polled.issues.length === 0) {
    iteration.outcome = "no_eligible_work";
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const selection = selectDistinctEligibleIssue(config, polled.issues, issueTracker, (issueNumber) =>
    readIssueLive(config, issueNumber),
  );
  iteration.candidateSelection = {
    events: selection.events,
    skipCount: selection.skipCount,
    attemptedIssueNumbers: trackerSnapshot(issueTracker).attemptedIssueNumbers,
    attemptedIssueCount: trackerSnapshot(issueTracker).attemptedIssueCount,
  };
  if (!selection.selected) {
    iteration.outcome = "no_eligible_work";
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const issue = selection.selected;
  markIssueAttempted(issueTracker, issue.number);
  iteration.runIssueState = trackerSnapshot(issueTracker);
  iteration.candidateSelection.attemptedIssueNumbers = iteration.runIssueState.attemptedIssueNumbers;
  iteration.candidateSelection.attemptedIssueCount = iteration.runIssueState.attemptedIssueCount;
  iteration.issue = {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    labels: issue.labels,
  };
  logger.info(`Iteration ${index}: selected issue #${issue.number} ${issue.title}`);

  const claim = claimIssue(config, issue, logger);
  iteration.claim = claim;
  const claimRead = config.dryRun ? { ok: true, skipped: true, reason: "dry-run" } : readIssueLive(config, issue.number);
  const claimReread = claimRead.skipped
    ? {
        ok: true,
        skipped: true,
        reason: claimRead.reason,
        event: { action: "claim_reread", selectedIssueNumber: issue.number, ok: true, skipped: true, reason: claimRead.reason },
      }
    : claimRead.ok ? validateClaimReread(config, issue, claimRead.issue) : {
      ok: false,
      reason: claimRead.reason || "claim_reread_failed",
      event: {
        action: "claim_reread",
        selectedIssueNumber: issue.number,
        ok: false,
        reason: claimRead.reason || "claim_reread_failed",
      },
    };
  iteration.claimReread = claimReread;
  if (!claimReread.ok) {
    iteration.outcome = "auto_failed";
    iteration.systemicStop = `claim-reread-failed:${claimReread.reason}`;
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const laneDecision = selection.laneDecision || classifyIssueLane(issue);
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

  const recovery = await recoverExistingPrIfConfigured(config, logger, issue, laneDecision);
  if (recovery) {
    iteration.existingPrRecovery = recovery;
    iteration.autoMerge = recovery.autoMerge;
    iteration.pr = recovery.pr;
    iteration.changedFiles = recovery.changedFiles;
    iteration.validation = recovery.validation;
    iteration.review = recovery.review;
    iteration.externalReview = recovery.externalReview;
    iteration.baseOriginMainSha = recovery.baseOriginMainSha;
    iteration.runnerCreatedCommitSha = recovery.expectedHeadSha;
    iteration.outcome = recovery.autoMerge?.result === "merged" ? "auto_merged" : "auto_failed";
    if (iteration.outcome !== "auto_merged") {
      iteration.issueComment = finishIssueOutcome(
        config,
        issue,
        iteration.outcome,
        `Auto-runner existing-PR recovery did not auto-merge #${issue.number}.\n\nPR: ${recovery.pr?.url || recovery.pr?.number || "unavailable"}\nReason: ${recovery.autoMerge?.reason || recovery.reason}`,
      );
    }
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const slug = slugify(issue.title, 40);
  const branchName = `feature/auto-${issue.number}-${slug}-${safeTimestamp().slice(0, 15).toLowerCase()}`;
  iteration.branchName = branchName;
  fetchOriginMain(config);
  iteration.baseOriginMainSha = config.dryRun ? null : getRefSha("origin/main");
  createTaskBranch(config, branchName);
  if (!config.dryRun) {
    iteration.mutationWorkspace = ensureTaskMutationWorkspace(config, {
      branchName,
      expectedOriginMainSha: iteration.baseOriginMainSha,
    });
  }

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

  let changedFiles = listWorkingTreeChangedFiles();
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

  let forbidden = filterForbiddenChangedFiles(changedFiles, laneDecision);
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

  iteration.commit = commitExplicitPaths(config, changedFiles, `Auto-runner issue #${issue.number}: ${issue.title}`);
  iteration.runnerCreatedCommitSha = config.dryRun ? null : getRefSha("HEAD");
  if (!config.dryRun) {
    changedFiles = listChangedFiles("origin/main", "HEAD");
    iteration.changedFiles = changedFiles;
    forbidden = filterForbiddenChangedFiles(changedFiles, laneDecision);
    iteration.forbiddenChangedFiles = forbidden;
    if (forbidden.length > 0) {
      iteration.outcome = "danger_gate";
      iteration.issueComment = finishIssueOutcome(
        config,
        issue,
        iteration.outcome,
        `Auto-runner blocked #${issue.number} because committed files crossed lane policy:\n\n${forbidden.join("\n")}`,
      );
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    if (getStatusShort() !== "") {
      iteration.outcome = "auto_failed";
      iteration.issueComment = finishIssueOutcome(
        config,
        issue,
        iteration.outcome,
        `Auto-runner blocked #${issue.number} because the exact-head commit left the worktree dirty before review.`,
      );
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
  }

  const beforeReview = await checkoutFingerprint();
  iteration.reviewPackage = await writeReviewPackage(config, {
    issue,
    promptInfo,
    laneDecision,
    changedFiles,
    validation: iteration.validation,
    report: iteration.report,
    diffBaseRef: "origin/main",
    diffHeadRef: "HEAD",
  });
  iteration.externalReview = await runIntegratedReviewSource(config, iteration.reviewPackage, "pre-fix");
  if (iteration.externalReview.status === "blocked") {
    const fixAttempt = await runReviewFixCycle(config, {
      issue,
      laneDecision,
      branchName,
      promptInfo,
      changedFiles,
      forbiddenChangedFiles: forbidden,
      validation: iteration.validation,
      report: iteration.report,
      externalReview: iteration.externalReview,
      review: null,
      attemptCount: iteration.reviewFixAttempts?.length || 0,
    });
    iteration.reviewFixAttempts = [...(iteration.reviewFixAttempts || []), fixAttempt];
    if (!fixAttempt.proceeded) {
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
        `Auto-runner did not open a PR for #${issue.number} because integrated Gemini pre-PR review returned ${iteration.externalReview.reason}. Review-fix status: ${fixAttempt.reason}.`,
      );
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    const postFix = await commitReviewFixAndRerunExactHeadReviews(config, {
      issue,
      laneDecision,
      promptInfo,
      report: iteration.report,
      fixAttempt,
    });
    changedFiles = postFix.changedFiles;
    forbidden = postFix.forbiddenChangedFiles;
    iteration.changedFiles = changedFiles;
    iteration.forbiddenChangedFiles = forbidden;
    iteration.validation = postFix.validation;
    iteration.commitAfterReviewFix = postFix.commit;
    iteration.runnerCreatedCommitSha = postFix.runnerCreatedCommitSha;
    iteration.reviewPackage = postFix.reviewPackage;
    iteration.externalReview = postFix.externalReview;
    iteration.review = postFix.review;
    iteration.reviewMutationGuard = postFix.reviewMutationGuard;
  }
  if (!iteration.review) {
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
  }

  if (config.requirePrePrReview && iteration.review.verdict.verdict !== "approve") {
    const fixAttempt = await runReviewFixCycle(config, {
      issue,
      laneDecision,
      branchName,
      promptInfo,
      changedFiles,
      forbiddenChangedFiles: forbidden,
      validation: iteration.validation,
      report: iteration.report,
      externalReview: iteration.externalReview,
      review: iteration.review,
      attemptCount: iteration.reviewFixAttempts?.length || 0,
    });
    iteration.reviewFixAttempts = [...(iteration.reviewFixAttempts || []), fixAttempt];
    if (fixAttempt.proceeded) {
      const postFix = await commitReviewFixAndRerunExactHeadReviews(config, {
        issue,
        laneDecision,
        promptInfo,
        report: iteration.report,
        fixAttempt,
      });
      changedFiles = postFix.changedFiles;
      forbidden = postFix.forbiddenChangedFiles;
      iteration.changedFiles = changedFiles;
      iteration.forbiddenChangedFiles = forbidden;
      iteration.validation = postFix.validation;
      iteration.commitAfterReviewFix = postFix.commit;
      iteration.runnerCreatedCommitSha = postFix.runnerCreatedCommitSha;
      iteration.reviewPackage = postFix.reviewPackage;
      iteration.externalReview = postFix.externalReview;
      iteration.review = postFix.review;
      iteration.reviewMutationGuard = postFix.reviewMutationGuard;
    }
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
    const fixAttempt = await runReviewFixCycle(config, {
      issue,
      laneDecision,
      branchName,
      promptInfo,
      changedFiles,
      forbiddenChangedFiles: forbidden,
      validation: iteration.validation,
      report: iteration.report,
      externalReview: iteration.externalReview,
      review: iteration.review,
      attemptCount: iteration.reviewFixAttempts?.length || 0,
    });
    iteration.reviewFixAttempts = [...(iteration.reviewFixAttempts || []), fixAttempt];
    if (fixAttempt.proceeded) {
      const postFix = await commitReviewFixAndRerunExactHeadReviews(config, {
        issue,
        laneDecision,
        promptInfo,
        report: iteration.report,
        fixAttempt,
      });
      changedFiles = postFix.changedFiles;
      forbidden = postFix.forbiddenChangedFiles;
      iteration.changedFiles = changedFiles;
      iteration.forbiddenChangedFiles = forbidden;
      iteration.validation = postFix.validation;
      iteration.commitAfterReviewFix = postFix.commit;
      iteration.runnerCreatedCommitSha = postFix.runnerCreatedCommitSha;
      iteration.reviewPackage = postFix.reviewPackage;
      iteration.externalReview = postFix.externalReview;
      iteration.review = postFix.review;
      iteration.reviewMutationGuard = postFix.reviewMutationGuard;
    }
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
  const prePushReviewGate = evaluatePrePushReviewGate({
    laneDecision,
    externalReview: iteration.externalReview,
    reviewMutationGuard: iteration.reviewMutationGuard,
  });
  if (!prePushReviewGate.ok) {
    iteration.outcome = prePushReviewGate.outcome;
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner did not open a PR for #${issue.number} because ${prePushReviewGate.message}.`,
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

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

async function recoverExistingPrIfConfigured(config, logger, issue, laneDecision) {
  if (!config.allowExistingPrRecovery) return null;
  const recoveryConfig = config.existingPrRecovery?.[issue.number] || config.existingPrRecovery?.[String(issue.number)] || null;
  if (!recoveryConfig) return null;
  logger.info(`Issue #${issue.number}: evaluating configured existing-PR recovery for PR ${recoveryConfig.prNumber || recoveryConfig.prUrl}.`);
  if (!config.allowAutoMerge) {
    return { reason: "existing_pr_recovery_requires_allow_auto_merge", autoMerge: { result: "blocked", reason: "auto_merge_disabled_by_config" } };
  }
  fetchOriginMain(config);
  const baseOriginMainSha = getRefSha("origin/main");
  const githubState = inspectAutoMergeGithubState(config, { issue, prUrlOrNumber: recoveryConfig.prNumber || recoveryConfig.prUrl });
  const prNumber = githubState.pr?.number || recoveryConfig.prNumber || recoveryConfig.prUrl;
  const changedFiles = Array.isArray(recoveryConfig.changedFiles) && recoveryConfig.changedFiles.length > 0
    ? recoveryConfig.changedFiles
    : readPrChangedFiles(config, prNumber);
  const forbidden = filterForbiddenChangedFiles(changedFiles, laneDecision);
  let exactHeadEvidence = recoveryConfig.exactHeadEvidence || {};
  const expectedHeadSha = recoveryConfig.expectedHeadSha || exactHeadEvidence.headSha || githubState.pr?.headRefOid || null;
  const prMetadata = {
    ...(githubState.pr || {}),
    body: recoveryConfig.prBody ?? githubState.pr?.body,
    title: recoveryConfig.prTitle ?? githubState.pr?.title,
  };
  let generatedRecoveryEvidence = null;
  if (shouldGenerateExistingPrRecoveryEvidence(laneDecision, exactHeadEvidence)) {
    generatedRecoveryEvidence = await generateExistingPrRecoveryEvidence(config, {
      issue,
      laneDecision,
      pr: prMetadata,
      changedFiles,
      expectedHeadSha,
    });
    exactHeadEvidence = {
      ...exactHeadEvidence,
      headSha: expectedHeadSha,
      validationPassed: generatedRecoveryEvidence.validation?.passed === true,
      geminiPass: generatedRecoveryEvidence.externalReview?.status === "pass",
      geminiHeadSha: expectedHeadSha,
      geminiChangedFiles: changedFiles,
      geminiProvider: generatedRecoveryEvidence.externalReview?.provider || exactHeadEvidence.geminiProvider || null,
      geminiTier: generatedRecoveryEvidence.externalReview?.tier || exactHeadEvidence.geminiTier || null,
      geminiEvidencePath:
        generatedRecoveryEvidence.externalReview?.reportPath ||
        generatedRecoveryEvidence.externalReview?.evidencePath ||
        exactHeadEvidence.geminiEvidencePath ||
        null,
      codexMechanicsApproved: generatedRecoveryEvidence.review?.verdict?.verdict === "approve",
      codexMechanicsHeadSha: expectedHeadSha,
      codexMechanicsChangedFiles: changedFiles,
      codexMechanicsEvidencePath: generatedRecoveryEvidence.review?.logPath || generatedRecoveryEvidence.review?.promptPath || null,
      codexMechanicsFailureReason: generatedRecoveryEvidence.review?.reviewFailureReason || null,
      codexMechanicsFailureCategory: generatedRecoveryEvidence.review?.reviewFailureCategory || null,
      codexMechanicsAttemptCount: generatedRecoveryEvidence.review?.attemptCount || null,
    };
  }
  const issueLinkageEvidence = buildIssueLinkageEvidence(prMetadata, issue.number);
  const context = {
    config,
    issue: githubState.issue || { ...issue, state: issue.state || "OPEN", labels: issue.labels || [] },
    laneDecision,
    changedFiles,
    forbiddenChangedFiles: forbidden,
    changedFilesExactlyMatchAllowedPaths: forbidden.length === 0,
    externalReviewRequired: requiresIndependentAiReview(laneDecision),
    externalReview: exactHeadEvidence.geminiPass
      ? {
          status: "pass",
          verdict: "pass",
          reason: "recovered_exact_head_gemini_evidence",
          reviewedHead: exactHeadEvidence.geminiHeadSha || exactHeadEvidence.headSha || null,
          changedFiles: exactHeadEvidence.geminiChangedFiles || changedFiles,
          provider: exactHeadEvidence.geminiProvider || "gemini",
          tier: exactHeadEvidence.geminiTier || "cheap_independent",
          reportPath: exactHeadEvidence.geminiEvidencePath || null,
        }
      : { status: "blocked", reason: "missing_recovered_exact_head_gemini_evidence" },
    review: generatedRecoveryEvidence?.review ||
      (exactHeadEvidence.codexMechanicsApproved
        ? {
            verdict: { verdict: "approve" },
            reviewedHead: exactHeadEvidence.codexMechanicsHeadSha || exactHeadEvidence.headSha || null,
            changedFiles: exactHeadEvidence.codexMechanicsChangedFiles,
            logPath: exactHeadEvidence.codexMechanicsEvidencePath || null,
          }
        : null),
    codexMechanicsReviewApproved: Boolean(exactHeadEvidence.codexMechanicsApproved),
    validation: { passed: Boolean(exactHeadEvidence.validationPassed), recovered: true },
    worktreeClean: getStatusShort() === "",
    branchName: githubState.pr?.headRefName || recoveryConfig.branchName || null,
    runnerCreatedCommitSha: expectedHeadSha,
    expectedHeadSha,
    expectedOriginMainSha: recoveryConfig.expectedOriginMainSha || baseOriginMainSha,
    currentOriginMainSha: baseOriginMainSha,
    pr: prMetadata,
    requiredChecks: githubState.requiredChecks || [],
    reviewThreads: githubState.reviewThreads || [],
    codeScanningAlerts: githubState.codeScanningAlerts || [],
    blockingMarkers: githubState.blockingMarkers || [],
    actualHeadSha: githubState.pr?.headRefOid || null,
    exactHeadEvidence,
    issueLinkageEvidence,
  };
  const recoveryDecision = evaluateExistingPrRecoveryDecision(context);
  if (!recoveryDecision.eligible) {
    const blocked = { ...recoveryDecision, evidence: writeAutoMergeEvidence(config, recoveryDecision, context) };
    return {
      reason: recoveryDecision.reason,
      pr: context.pr,
      changedFiles,
      validation: context.validation,
      review: context.review,
      externalReview: context.externalReview,
      generatedRecoveryEvidence,
      baseOriginMainSha,
      expectedHeadSha,
      autoMerge: blocked,
    };
  }
  const autoMerge = executeAutoMerge(config, context, {
    inspectState: (cfg, ctx) => inspectAutoMergeGithubState(cfg, { issue: ctx.issue, prUrlOrNumber: ctx.pr?.number || ctx.pr?.url }),
  });
  return {
    reason: recoveryDecision.reason,
    pr: context.pr,
    changedFiles,
    validation: context.validation,
    review: context.review,
    externalReview: context.externalReview,
    generatedRecoveryEvidence,
    baseOriginMainSha,
    expectedHeadSha,
    autoMerge,
  };
}

async function generateExistingPrRecoveryEvidence(config, { issue, laneDecision, pr, changedFiles, expectedHeadSha }) {
  if (config.dryRun) return { reason: "dry_run_no_recovery_evidence_generation" };
  const originalBranch = getCurrentBranch();
  const originalHead = getRefSha("HEAD");
  const restore = () => {
    if (originalBranch) {
      const result = spawnLike("git", ["switch", originalBranch], config.repoRoot);
      if (result.status === 0 && !result.error) return result;
    }
    return spawnLike("git", ["switch", "--detach", originalHead], config.repoRoot);
  };
  if (getStatusShort() !== "") {
    return {
      reason: "recovery_evidence_generation_worktree_not_clean",
      validation: { passed: false, results: [] },
      externalReview: { status: "blocked", reason: "recovery_evidence_generation_worktree_not_clean" },
      review: null,
    };
  }
  try {
    const fetch = spawnLike("git", ["fetch", "origin", pr.headRefName], config.repoRoot);
    if (fetch.status !== 0 || fetch.error) {
      return {
        reason: "recovery_evidence_generation_fetch_failed",
        validation: { passed: false, results: [] },
        externalReview: { status: "blocked", reason: "recovery_evidence_generation_fetch_failed" },
        review: null,
      };
    }
    const checkout = spawnLike("git", ["switch", "--detach", expectedHeadSha], config.repoRoot);
    if (checkout.status !== 0 || checkout.error) {
      return {
        reason: "recovery_evidence_generation_checkout_failed",
        validation: { passed: false, results: [] },
        externalReview: { status: "blocked", reason: "recovery_evidence_generation_checkout_failed" },
        review: null,
      };
    }
    const validation = runValidationPlan(config, planValidation(changedFiles, laneDecision));
    if (!validation.passed) {
      return {
        reason: "recovery_evidence_generation_validation_failed",
        validation,
        externalReview: { status: "blocked", reason: "recovery_evidence_generation_validation_failed" },
        review: null,
      };
    }
    const reviewPackage = await writeReviewPackage(config, {
      reviewPhase: "existing-pr-recovery",
      issue,
      promptInfo: { promptPath: `existing-pr-recovery:${pr.number || pr.url}` },
      laneDecision,
      changedFiles,
      validation,
      report: { found: true, expectedPath: "existing-pr-recovery" },
      diffText: readPrDiff(config, pr.number || pr.url),
    });
    const externalReview = await runIntegratedReviewSource(config, reviewPackage, "existing-pr-recovery");
    const review = externalReview.status === "pass" ? runReviewPrompt(config, reviewPackage) : null;
    return {
      reason: "recovery_evidence_generated",
      validation,
      reviewPackage,
      externalReview,
      review,
    };
  } finally {
    restore();
  }
}

function readPrChangedFiles(config, prNumber) {
  if (!prNumber || config.dryRun) return [];
  const result = spawnLike("gh", ["pr", "diff", String(prNumber), "--name-only"], config.repoRoot);
  if (result.status !== 0 || result.error) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort();
}

function readPrDiff(config, prNumber) {
  if (!prNumber || config.dryRun) return "";
  const result = spawnLike("gh", ["pr", "diff", String(prNumber)], config.repoRoot);
  if (result.status !== 0 || result.error) return "";
  return result.stdout || "";
}

function spawnLike(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error?.message || null };
}

async function evaluateOrExecuteAutoMerge(config, { issue, iteration, branchName, changedFiles, forbidden }) {
  const baseContext = {
    config,
    issue: { ...iteration.issue, state: issue.state || "OPEN", labels: issue.labels || [] },
    laneDecision: iteration.laneDecision,
    changedFiles,
    forbiddenChangedFiles: forbidden,
    changedFilesExactlyMatchAllowedPaths: forbidden.length === 0,
    externalReviewRequired: iteration.externalReview?.status !== "skipped" || requiresIndependentAiReview(iteration.laneDecision),
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

async function runReviewFixCycle(config, context) {
  const trigger = extractReviewFixTrigger(context);
  const decision = evaluateReviewFixMutationDecision({ ...context, config, trigger });
  const baseEvidence = {
    issue: {
      number: context.issue.number,
      title: context.issue.title,
      url: context.issue.url,
      labels: context.issue.labels || [],
    },
    lane: context.laneDecision.lane,
    branchName: context.branchName,
    baseSha: config.dryRun ? null : getRefSha("origin/main"),
    headShaBefore: config.dryRun ? null : getRefSha("HEAD"),
    changedFilesBefore: context.changedFiles || [],
    reviewerSource: trigger.source,
    sanitizedFindings: trigger.findings || [],
    validationBefore: summarizeValidation(context.validation),
    reviewBefore: summarizeReview(context.externalReview, context.review),
    decision,
    fixAttemptHappened: false,
    proceededToPrOrMergeEligibility: false,
  };
  if (!decision.allowed) {
    const evidence = writeReviewFixEvidence(config, { ...baseEvidence, stopReason: decision.reason });
    return {
      attempted: false,
      proceeded: false,
      reason: decision.reason,
      decision,
      evidence,
    };
  }

  const prompt = buildReviewFixPrompt({
    issue: context.issue,
    laneDecision: context.laneDecision,
    branchName: context.branchName,
    changedFiles: context.changedFiles || [],
    trigger,
    validation: context.validation,
  });
  const promptPath = path.join(
    config.logsRoot,
    "review-fix",
    `${safeTimestamp()}-issue-${context.issue.number}-${slugify(context.issue.title, 40)}-prompt.md`,
  );
  writeFileSync(promptPath, prompt);
  const codex = runCodexPrompt(
    config,
    {
      ...context.promptInfo,
      branchName: context.branchName,
      prompt,
      promptPath,
    },
    "review-fix",
  );
  const changedFilesAfter = listWorkingTreeChangedFiles();
  const forbiddenChangedFilesAfter = filterForbiddenChangedFiles(changedFilesAfter, context.laneDecision);
  const finishBlocked = (reason, extra = {}) => {
    const evidence = writeReviewFixEvidence(config, {
      ...baseEvidence,
      fixAttemptHappened: true,
      promptPath,
      codex: summarizeCodex(codex),
      changedFilesAfter,
      forbiddenChangedFilesAfter,
      stopReason: reason,
      ...extra,
    });
    return {
      attempted: true,
      proceeded: false,
      reason,
      decision,
      promptPath,
      codex,
      changedFilesAfter,
      forbiddenChangedFilesAfter,
      evidence,
      ...extra,
    };
  };

  if (!codex.skipped && (codex.error || codex.status !== 0)) {
    return finishBlocked("review_fix_codex_failed");
  }
  if (forbiddenChangedFilesAfter.length > 0) {
    return finishBlocked(`review_fix_forbidden_changed_files:${forbiddenChangedFilesAfter.join(",")}`);
  }
  if (changedFilesAfter.length === 0 && !config.dryRun) {
    return finishBlocked("review_fix_left_no_changed_files");
  }

  const validationPlan = planValidation(changedFilesAfter, context.laneDecision);
  const validationAfter = runValidationPlan(config, validationPlan);
  if (!validationAfter.passed) {
    return finishBlocked("review_fix_validation_failed", { validationAfter: summarizeValidation(validationAfter) });
  }

  const ownership = inspectPreReviewPrOwnership(config, context.branchName);
  if (!ownership.clean) {
    return finishBlocked("review_fix_pre_review_pr_ownership_failed", { preReviewPrOwnershipAfter: ownership });
  }

  const beforeReview = await checkoutFingerprint();
  const integratedReviewPackageAfter = await writeReviewPackage(config, {
    issue: context.issue,
    promptInfo: context.promptInfo,
    laneDecision: context.laneDecision,
    changedFiles: changedFilesAfter,
    validation: validationAfter,
    report: context.report,
  });
  const externalReviewAfter = await runIntegratedReviewSource(config, integratedReviewPackageAfter, "post-fix");
  if (externalReviewAfter.status === "blocked") {
    return finishBlocked("review_fix_integrated_review_still_blocking", {
      validationAfter: summarizeValidation(validationAfter),
      externalReviewAfter: summarizeExternalReview(externalReviewAfter),
      reviewPackageAfter: { packagePath: integratedReviewPackageAfter.packagePath },
    });
  }
  const postFixContext = buildPostReviewFixMechanicsContext({
    issue: context.issue,
    laneDecision: context.laneDecision,
    trigger,
    decision,
    changedFilesBefore: context.changedFiles || [],
    changedFilesAfter,
    forbiddenChangedFilesAfter,
    validationAfter,
    externalReviewAfter,
    preFixReport: context.report,
    currentHead: config.dryRun ? null : getRefSha("HEAD"),
  });
  if (!postFixContext.ok) {
    return finishBlocked(`review_fix_post_fix_mechanics_context_invalid:${postFixContext.reason}`, {
      validationAfter: summarizeValidation(validationAfter),
      externalReviewAfter: summarizeExternalReview(externalReviewAfter),
      reviewPackageAfter: { packagePath: integratedReviewPackageAfter.packagePath },
    });
  }
  const reviewPackageAfter = await writeReviewPackage(config, {
    issue: context.issue,
    promptInfo: context.promptInfo,
    laneDecision: context.laneDecision,
    changedFiles: changedFilesAfter,
    validation: validationAfter,
    report: context.report,
    reviewPhase: "post-review-fix-mechanics",
    reviewFixMechanicsContext: postFixContext.context,
  });
  const reviewAfter = runReviewPrompt(config, reviewPackageAfter);
  const afterReview = await checkoutFingerprint();
  const reviewMutationGuardAfter = compareFingerprints(beforeReview, afterReview);
  if (reviewMutationGuardAfter.mutationDetected) {
    return finishBlocked("review_fix_post_fix_review_mutated_checkout", {
      validationAfter: summarizeValidation(validationAfter),
      externalReviewAfter: summarizeExternalReview(externalReviewAfter),
      reviewAfter: summarizeCodexReview(reviewAfter),
      reviewMutationGuardAfter,
    });
  }
  if (reviewAfter.verdict?.verdict !== "approve") {
    return finishBlocked("review_fix_codex_mechanics_still_blocking", {
      validationAfter: summarizeValidation(validationAfter),
      externalReviewAfter: summarizeExternalReview(externalReviewAfter),
      reviewAfter: summarizeCodexReview(reviewAfter),
      reviewPackageAfter: { packagePath: reviewPackageAfter.packagePath },
    });
  }

  const evidence = writeReviewFixEvidence(config, {
    ...baseEvidence,
    fixAttemptHappened: true,
    proceededToPrOrMergeEligibility: true,
    promptPath,
    codex: summarizeCodex(codex),
    headShaAfter: config.dryRun ? null : getRefSha("HEAD"),
    changedFilesAfter,
    forbiddenChangedFilesAfter,
    validationAfter: summarizeValidation(validationAfter),
    externalReviewAfter: summarizeExternalReview(externalReviewAfter),
    reviewAfter: summarizeCodexReview(reviewAfter),
    reviewPackageAfter: { packagePath: reviewPackageAfter.packagePath },
    integratedReviewPackageAfter: { packagePath: integratedReviewPackageAfter.packagePath },
    stopReason: null,
  });
  return {
    attempted: true,
    proceeded: true,
    reason: "review_fix_passed_revalidation_and_reviews",
    decision,
    promptPath,
    codex,
    changedFilesAfter,
    forbiddenChangedFilesAfter,
    validationAfter,
    reviewPackageAfter,
    externalReviewAfter,
    reviewAfter,
    reviewMutationGuardAfter,
    evidence,
  };
}

function finishIssueOutcome(config, issue, outcome, body) {
  return commentIssueOutcome(config, issue, outcome, body);
}

async function commitReviewFixAndRerunExactHeadReviews(config, { issue, laneDecision, promptInfo, report, fixAttempt }) {
  const changedFilesBeforeCommit = fixAttempt.changedFilesAfter || [];
  const commit = commitExplicitPaths(config, changedFilesBeforeCommit, `Auto-runner issue #${issue.number}: review-fix follow-up`);
  const runnerCreatedCommitSha = config.dryRun ? null : getRefSha("HEAD");
  const changedFiles = config.dryRun ? changedFilesBeforeCommit : listChangedFiles("origin/main", "HEAD");
  const forbiddenChangedFiles = filterForbiddenChangedFiles(changedFiles, laneDecision);
  const validation = fixAttempt.validationAfter;
  if (!config.dryRun && getStatusShort() !== "") {
    return {
      changedFiles,
      forbiddenChangedFiles,
      validation,
      commit,
      runnerCreatedCommitSha,
      reviewPackage: fixAttempt.reviewPackageAfter,
      externalReview: { status: "blocked", reason: "review_fix_exact_head_dirty_after_commit" },
      review: { verdict: { verdict: "unable_to_review" } },
      reviewMutationGuard: { mutationDetected: true, reason: "review_fix_exact_head_dirty_after_commit" },
    };
  }
  const beforeReview = await checkoutFingerprint();
  const reviewPackage = await writeReviewPackage(config, {
    reviewPhase: "post-review-fix-exact-head",
    issue,
    promptInfo,
    laneDecision,
    changedFiles,
    validation,
    report,
    diffBaseRef: "origin/main",
    diffHeadRef: "HEAD",
  });
  const externalReview = await runIntegratedReviewSource(config, reviewPackage, "post-review-fix-exact-head");
  const review = runReviewPrompt(config, reviewPackage);
  const afterReview = await checkoutFingerprint();
  return {
    changedFiles,
    forbiddenChangedFiles,
    validation,
    commit,
    runnerCreatedCommitSha,
    reviewPackage,
    externalReview,
    review,
    reviewMutationGuard: compareFingerprints(beforeReview, afterReview),
  };
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
  const diff = Object.hasOwn(payload, "diffText")
    ? { text: String(payload.diffText || ""), truncated: false }
    : payload.diffBaseRef || payload.diffHeadRef
      ? getBoundedDiff(payload.diffBaseRef || "origin/main", payload.diffHeadRef || "HEAD")
    : getBoundedWorkingTreeDiff();
  const packagePath = path.join(
    config.logsRoot,
    "reviews",
    `${safeTimestamp()}-issue-${payload.issue.number}-${slugify(payload.issue.title, 40)}.json`,
  );
  const summary = {
    reviewPhase: payload.reviewPhase || "pre-pr-review",
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
    currentHead: config.dryRun ? null : getRefSha("HEAD"),
    validation: payload.validation,
    report: payload.report,
    reviewFixMechanicsContext: payload.reviewFixMechanicsContext || null,
    diffTruncated: diff.truncated,
  };
  writeFileSync(packagePath, `${JSON.stringify({ summary, diff: diff.text }, null, 2)}\n`);
  return { packagePath, summary, diff: diff.text };
}

async function runIntegratedReviewSource(config, reviewPackage, phase) {
  if (config.reviewFixCanaryFixture?.requestedEnabled) {
    return runReviewFixCanaryFixtureReview(config, reviewPackage, {
      phase,
      reviewedHead: config.dryRun ? null : getRefSha("HEAD"),
    });
  }
  return runGeminiIntegratedReview(config, reviewPackage);
}

function prSummary(iteration) {
  return [
    `Issue: #${iteration.issue.number}`,
    `Lane: ${iteration.laneDecision.lane}`,
    `Validation: ${iteration.validation.passed ? "passed" : "failed"}`,
    independentReviewSummaryLine(iteration),
    `Pre-PR AI review: ${iteration.review?.verdict?.verdict || "not-run"}`,
    `Report: ${iteration.report?.copyPath || iteration.report?.expectedPath || "not-found"}`,
  ].join("\n");
}

function independentReviewSummaryLine(iteration) {
  const required = requiresIndependentAiReview(iteration.laneDecision);
  const review = iteration.externalReview || {};
  if (!required) {
    return `Independent AI review: not required for lane ${iteration.laneDecision.lane}; status: ${review.status || "not-run"}; provider/tier: ${review.provider || "none"} ${review.tier || "none"}; verdict: ${review.verdict || review.status || "n/a"}`;
  }
  const passed = review.status === "pass" && (!review.verdict || review.verdict === "pass");
  return [
    "Independent AI review: required",
    `provider/tier: ${review.provider || "unknown"} ${review.tier || "unknown"}`,
    `verdict: ${passed ? "pass" : `blocked/fail-closed (${review.reason || review.status || "missing"})`}`,
    `exact head: ${review.reviewedHead || iteration.runnerCreatedCommitSha || "unknown"}`,
    `evidence: ${review.reportPath || review.evidencePath || "unknown"}`,
  ].join("; ");
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

function summarizeValidation(validation) {
  if (!validation) return null;
  return {
    passed: Boolean(validation.passed),
    commands: (validation.results || []).map((result) => ({
      command: result.command,
      status: result.status,
      error: result.error || null,
    })),
  };
}

function summarizeReview(externalReview, review) {
  return {
    externalReview: externalReview ? summarizeExternalReview(externalReview) : null,
    codexMechanicsReview: review ? summarizeCodexReview(review) : null,
  };
}

function summarizeExternalReview(externalReview) {
  if (!externalReview) return null;
  return {
    status: externalReview.status,
    reason: externalReview.reason,
    verdict: externalReview.verdict,
    provider: externalReview.provider,
    tier: externalReview.tier,
  };
}

function summarizeCodexReview(review) {
  if (!review) return null;
  return {
    skipped: Boolean(review.skipped),
    status: review.status,
    signal: review.signal || null,
    reviewStatus: review.reviewStatus || null,
    reviewFailureCategory: review.reviewFailureCategory || null,
    reviewFailureReason: review.reviewFailureReason || null,
    attemptCount: review.attemptCount || review.attempts?.length || null,
    attempts: review.attempts || [],
    verdict: review.verdict?.verdict || null,
    recommended_next_action: review.verdict?.recommended_next_action || null,
    blocking_findings: review.verdict?.blocking_findings || [],
    promptPath: review.promptPath || null,
    logPath: review.logPath || null,
    responsePayloadBoundary: review.responsePayloadBoundary || null,
    parseFailureReason: review.verdict?.review_json_diagnostics?.failure_reason || null,
  };
}

function summarizeCodex(codex) {
  if (!codex) return null;
  return {
    skipped: Boolean(codex.skipped),
    status: codex.status,
    error: codex.error || null,
    purpose: codex.purpose || null,
    logPath: codex.logPath || null,
  };
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
