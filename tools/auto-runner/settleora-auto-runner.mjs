#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  canonicalizeChangedFiles,
  digestChangedFiles,
  parseCliArgs,
  loadConfig,
  defaultLogsRoot,
  validateRecoveryOnlyExistingPrTarget,
  validateRecoveryOnlyExactHeadEvidence,
} from "./lib/config.mjs";
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
  sourceStateIdentityForCommit,
  workingTreeDiffHash,
} from "./lib/git-workspace.mjs";
import { generateTaskPrompt } from "./lib/task-prompt.mjs";
import { runCodexPrompt, runReviewPrompt } from "./lib/codex-runner.mjs";
import { collectReport } from "./lib/report-collector.mjs";
import { bindValidationEvidence, planValidation, runValidationPlan } from "./lib/validation-planner.mjs";
import { inspectPreReviewPrOwnership, openOrUpdatePr, pushBranch, watchChecks } from "./lib/pr-manager.mjs";
import { writeRecentSummary, writeRunSummary } from "./lib/summary-writer.mjs";
import { reviewerReadinessSummary } from "./lib/reviewer-policy.mjs";
import { createLargeCandidateRoutingState, loadLargeCandidateRoutingState, persistCumulativeLargeCandidateReview, persistLargeCandidateSplitDecision, structuredLargeCandidateFindings, structuredLargeCandidateManualVerdict } from "./lib/large-candidate-review-routing.mjs";
import { runGeminiIntegratedReview, runGeminiReviewerSmokeTest } from "./lib/gemini-reviewer.mjs";
import { runReviewFixCanaryFixtureReview } from "./lib/review-fix-fixture.mjs";
import {
  accountConvergenceEvent,
  buildLiveReviewConvergenceContext,
  claimedReviewFindingFingerprints,
  evaluateCycleBudget,
  markDiagnosticReviewFixTerminal,
  reviewFindingsFromSupportedContainers,
  reviewFindingFingerprintsFromSupportedContainers,
} from "./lib/review-convergence-controller.mjs";
import {
  loadReviewConvergenceState,
  writeReviewConvergenceState,
} from "./lib/review-convergence-state.mjs";
import {
  buildPostReviewFixMechanicsContext,
  buildReviewFixPrompt,
  evaluateReviewFixMutationDecision,
  evaluateSourceFailureFixMutationDecision,
  extractReviewFixTrigger,
  writeReviewFixEvidence,
} from "./lib/review-fix-policy.mjs";
import {
  buildIssueLinkageEvidence,
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
  writeCurrentIterationState,
  writeControlCommand,
} from "./lib/control-plane.mjs";
import { runFeatureBundleIteration } from "./lib/feature-bundle-orchestrator.mjs";
import { discoverStartupRecovery, discoverTargetedStartupRecovery, executeStartupContinuation, evaluateControlAtRecoveryBoundary, projectStartupRecoveryIssueIdentity, shouldAdvanceFixtureIssueCursor } from "./lib/recovery-continuation.mjs";
import { autoMergeEffectsConfirmed } from "./lib/terminal-effects.mjs";
import {
  advanceRecoveryPhase,
  bindRecoveryEvidence,
  createInitialRecoveryState,
  invalidateEvidenceForHeadChange,
  persistCompleteHeadEvidence,
  recordIdempotentMutation,
  recordRecoveryAttempt,
  writeRecoveryState,
} from "./lib/recovery-state.mjs";
import { evaluateExistingPrRecovery } from "./lib/recovery-orchestrator.mjs";
import { runSecurityFindingsDryRun } from "./lib/security-findings-dry-run.mjs";
import { runSecurityFindingsProductionPhase, securityFindingsProductionPhaseEnabled } from "./lib/security-findings-production.mjs";
import { runPrStackExecution } from "./lib/pr-stack-executor.mjs";
import { chargeAcceptedLogicalTask, loadLogicalTaskBudget } from "./lib/logical-task-budget.mjs";
import { createSessionLifecycleState, persistSessionLifecycleState, synchronizeSessionLifecycleCounters, transitionSessionLifecyclePhase } from "./lib/session-lifecycle.mjs";
import { findPreEffectIntents } from "./lib/pre-effect-intent.mjs";
import { continueOrdinaryCandidate, createOrdinaryContinuationState, ordinaryCandidateIdentityMatches } from "./lib/ordinary-candidate-continuation.mjs";
import { evaluateSourceFailureBatch, freezeSourceFailureBatch, sourceFailuresFromGithubEvidence, sourceFailuresFromValidation } from "./lib/source-failure-convergence.mjs";

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
    if (!cliArgs.configPath) {
      throw new Error("--review-package requires an explicit --config path");
    }
    const config = loadConfig({ dryRun: false, run: false, configPath: cliArgs.configPath });
    const packageText = readFileSync(cliArgs.reviewPackage, "utf8");
    const parsedPackage = JSON.parse(packageText);
    const result = await runGeminiIntegratedReview(config, {
      packagePath: cliArgs.reviewPackage,
      summary: parsedPackage.summary || parsedPackage,
      diff: parsedPackage.diff || "",
    });
    console.error(`External review package: ${result.status} (${result.reason})`);
    console.error(`Evidence: ${result.reportPath}`);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "pass" ? 0 : 1;
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
  if (cliArgs.securityFindingsDryRun) {
    const config = loadConfig(cliArgs);
    const result = await runSecurityFindingsDryRun(config, { taskKey: "security-findings-dry-run" });
    console.log(cliArgs.json ? JSON.stringify(result, null, 2) : renderSecurityFindingsDryRunText(result));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  if (cliArgs.runPrStack) {
    const config = loadConfig(cliArgs);
    const liveRunner = createLiveFixedArgvRunner(config);
    const liveReviewAdapters = createLivePrStackReviewAdapters(config);
    let lockPath = null;
    try {
      lockPath = acquireRunnerLock(config, {
        runId: `pr-stack-${safeTimestamp()}`,
        mode: config.mode,
        configPath: config.configPath || null,
        stackPlanPath: cliArgs.stackPlanPath,
      });
      const result = await runPrStackExecution(config, cliArgs, { runner: liveRunner, ...liveReviewAdapters });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.ok || result.outcome === "waiting" ? 0 : 1;
    } finally {
      releaseRunnerLock(lockPath);
    }
    return;
  }

  const config = loadConfig(cliArgs, {
    outageResubmissionControllerAvailable: true,
  });
  const trustPolicy = evaluateTrustPolicy(config);
  if (!trustPolicy.allowed) {
    throw new Error(`Trusted real-run refused: ${trustPolicy.reason}`);
  }
  const runId = config.runnerRunId || `run-${safeTimestamp()}`;
  const logger = createLogger(config.logsRoot, runId);
  const recoveryOnlyStartupDiscovery = config.outageRecoveryOnly ? discoverTargetedStartupRecovery(config) : null;
  const recoveryOnlyStartupEvidenceCheck = recoveryOnlyStartupDiscovery?.found && recoveryOnlyStartupDiscovery.allowed
    ? validateRecoveryOnlyStartupEvidence(config, { issue: { number: config.outageRecoveryTarget?.issueNumber } })
    : { ok: true };
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
    acceptedLogicalTaskCount: 0,
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
    if (!recoveryOnlyStartupEvidenceCheck.ok) {
      summary.iterations.push({
        runId,
        index: 1,
        startedAt: summary.startedAt,
        finishedAt: new Date().toISOString(),
        issue: null,
        outcome: "blocked_recovery_state",
        systemicStop: `recoverable-work-blocked:${recoveryOnlyStartupEvidenceCheck.reason}`,
        recovery: { reasonCode: recoveryOnlyStartupEvidenceCheck.reason },
      });
      summary.stopReason = `recoverable-work-blocked:${recoveryOnlyStartupEvidenceCheck.reason}`;
    } else {
    summary.baseOriginMainSha = getRefSha("origin/main");
    ensureLaunchWorkspace(config, logger);
    summary.maxIterations = config.maxIterations;
    summary.maxRuntimeMs = config.maxRuntimeMs;
    summary.configPath = config.configPath || null;
    writeActiveRunState(config, summary);
    logger.info(`Settleora auto-runner started in ${config.mode} mode.`);

    if (!config.dryRun && !config.outageRecoveryOnly) {
      const durableBudget = loadLogicalTaskBudget(config, config.supervisorRunId || runId);
      if (!durableBudget.ok) {
        summary.stopReason = `logical-task-budget:${durableBudget.reasonCode}`;
        throw new Error(`Logical task budget startup failed closed: ${durableBudget.reasonCode}`);
      }
      summary.acceptedLogicalTaskCount = durableBudget.state.acceptedLogicalTaskCount;
    }

    const startedAtMs = Date.now();
    const issueTracker = createRunIssueTracker(summary);
    let chargedRecoveryCapBypassConsumed = false;
    for (let index = 1; ; index += 1) {
      let chargedRecoveryAtCap = null;
      if (config.dryRun) {
        if (index > config.maxIterations) break;
      } else if (summary.acceptedLogicalTaskCount >= config.maxIterations) {
        if (chargedRecoveryCapBypassConsumed) break;
        chargedRecoveryAtCap = config.outageRecoveryOnly ? discoverTargetedStartupRecovery(config) : discoverStartupRecovery(config);
        if (!chargedRecoveryAtCap.found) break;
        chargedRecoveryCapBypassConsumed = true;
      }
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
      config.operationalIterationCheckpoint = (current) => writeCurrentIterationState(config, summary, current);
      const iteration = await runIteration(config, logger, runId, index, issueTracker, chargedRecoveryAtCap);
      const canaryEvidence = writeCanaryEvidence(config, iteration);
      if (canaryEvidence) {
        iteration.canaryEvidence = canaryEvidence;
      }
      summary.iterations.push(iteration);
      if (Number.isSafeInteger(iteration.logicalTaskBudget?.acceptedLogicalTaskCount)) {
        summary.acceptedLogicalTaskCount = iteration.logicalTaskBudget.acceptedLogicalTaskCount;
      }
      if (!config.dryRun && iteration.issueSource === "startup_recovery" && summary.acceptedLogicalTaskCount >= config.maxIterations) {
        chargedRecoveryCapBypassConsumed = true;
      }
      if (iteration.issue?.number) {
        markIssueProcessed(issueTracker, iteration.issue.number);
        Object.assign(summary, trackerSnapshot(issueTracker));
        iteration.runIssueState = trackerSnapshot(issueTracker);
      }
      writeIterationState(config, iteration);
      if (config.fixtureIssues && shouldAdvanceFixtureIssueCursor(iteration)) {
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
      summary.stopReason = config.dryRun ? "max-iterations-reached" : "max-accepted-logical-tasks-reached";
    }
    }
  } finally {
    releaseRunnerLock(lockPath);
    summary.finishedAt = new Date().toISOString();
    const paths = writeRunSummary(config, summary);
    clearActiveRunState(config, paths.jsonPath);
    logger.info(`Settleora auto-runner finished: ${paths.markdownPath}`);
  }
  if (isFatalRunStopReason(summary.stopReason)) {
    process.exitCode = 2;
  }
}

function isFatalRunStopReason(stopReason) {
  return typeof stopReason === "string" && stopReason.startsWith("recoverable-work-blocked:");
}

async function runIteration(config, logger, runId, index, issueTracker = createRunIssueTracker(), startupRecoveryOverride = null) {
  const checkpoint = config.operationalIterationCheckpoint || (() => {});
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
  checkpoint(iteration);
  const operationalCheckpoint = (phase, projected = {}) => {
    iteration.phase = phase;
    Object.assign(iteration, projected);
    checkpoint(iteration);
  };

  const startupRecovery = startupRecoveryOverride || (config.outageRecoveryOnly ? discoverTargetedStartupRecovery(config) : discoverStartupRecovery(config));
  if (startupRecovery.found) {
    config.logicalTaskBudgetScopeId ||= startupRecovery.state?.supervisorRunId || startupRecovery.state?.runId || config.supervisorRunId || runId;
    const recoveryBudget = config.dryRun
      ? { ok: true, charged: false, duplicate: false, preview: true, acceptedLogicalTaskCount: 0, reasonCode: "dry_run_recovery_not_charged" }
      : startupRecovery.allowed
      ? chargeStartupRecoveryLogicalTask(config, runId, startupRecovery)
      : { ok: true, charged: false, skipped: true, reasonCode: "startup_recovery_not_allowed" };
    iteration.logicalTaskBudget = recoveryBudget;
    checkpoint(iteration);
    if (!recoveryBudget.ok) {
      iteration.recovery = startupRecovery;
      iteration.issueSource = "startup_recovery";
      iteration.issue = Number.isSafeInteger(startupRecovery.state?.issue?.number) ? { number: startupRecovery.state.issue.number } : null;
      iteration.outcome = "blocked_logical_task_budget";
      iteration.systemicStop = `logical-task-budget:${recoveryBudget.reasonCode}`;
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    iteration.recovery = startupRecovery;
    iteration.issueSource = "startup_recovery";
    iteration.issue = Number.isSafeInteger(startupRecovery.state?.issue?.number)
      ? { number: startupRecovery.state.issue.number }
      : Number.isSafeInteger(startupRecovery.state?.issueNumber)
        ? { number: startupRecovery.state.issueNumber }
        : null;
    iteration.branchName = startupRecovery.state?.branchName || startupRecovery.state?.branch?.name || null;
    iteration.baseOriginMainSha = startupRecovery.state?.baseSha || null;
    iteration.runnerCreatedCommitSha = startupRecovery.state?.currentHeadSha || null;
    iteration.pr = startupRecovery.state?.pr || null;
    iteration.phase = "startup_recovery";
    checkpoint(iteration);
    const continuation = startupRecovery.allowed
      ? await resumeStartupRecovery(config, logger, runId, index, startupRecovery, operationalCheckpoint)
      : await executeStartupContinuation(config, startupRecovery);
    iteration.recovery = continuation.recovery || startupRecovery;
    iteration.issueSource = "startup_recovery";
    const recoveryIssue = startupRecovery.state
      ? projectStartupRecoveryIssueIdentity(startupRecovery, continuation)
      : null;
    iteration.issue = recoveryIssue?.ok ? recoveryIssue.issue : null;
    checkpoint(iteration);
    iteration.existingPrRecovery = continuation.result?.existingPrRecovery || null;
    iteration.bundle = continuation.result?.bundle || null;
    iteration.autoMerge = continuation.result?.autoMerge || null;
    iteration.pr = continuation.result?.pr || null;
    iteration.changedFiles = continuation.result?.changedFiles || [];
    iteration.validation = continuation.result?.validation || null;
    iteration.review = continuation.result?.review || null;
    iteration.externalReview = continuation.result?.externalReview || null;
    iteration.baseOriginMainSha = continuation.result?.baseOriginMainSha || startupRecovery.state?.baseSha || null;
    iteration.runnerCreatedCommitSha = continuation.result?.expectedHeadSha || startupRecovery.state?.currentHeadSha || null;
    iteration.outcome = recoveryIssue && !recoveryIssue.ok ? "blocked_recovery_state" : continuation.outcome;
    const recoveryReasonCode = recoveryIssue && !recoveryIssue.ok ? recoveryIssue.reasonCode : continuation.reasonCode;
    iteration.systemicStop = continuation.ok === false || (recoveryIssue && !recoveryIssue.ok)
      ? `recoverable-work-blocked:${recoveryReasonCode}`
      : continuation.outcome === "recovery_stopped_at_safe_boundary"
        ? `recoverable-work-stopped:${recoveryReasonCode}`
        : null;
    iteration.finishedAt = new Date().toISOString();
    checkpoint(iteration);
    logger.info(
      startupRecovery.allowed
        ? `Recoverable auto-runner state for issue #${startupRecovery.state?.issueNumber} executed phase ${iteration.recovery?.executedPhase || "unknown"}.`
        : `Recoverable auto-runner state blocked polling: ${startupRecovery.reasonCode}`,
    );
    return iteration;
  }

  if (config.outageRecoveryOnly) {
    iteration.recovery = startupRecovery;
    iteration.outcome = "blocked_recovery_state";
    iteration.systemicStop = "recoverable-work-blocked:outage_recovery_target_missing";
    iteration.finishedAt = new Date().toISOString();
    logger.info("Recovery-only outage child found no exact recoverable target; polling is disabled.");
    return iteration;
  }

  if (securityFindingsProductionPhaseEnabled(config)) {
    iteration.securityFindings = await runSecurityFindingsProductionPhase(config, { runId, iterationIndex: index });
    if (!iteration.securityFindings.ok || iteration.securityFindings.outcome === "blocked_uncertain_disposition_recovery_required") {
      iteration.outcome = iteration.securityFindings.outcome || "security_findings_phase_blocked";
      iteration.systemicStop = `security-findings:${iteration.securityFindings.reason || "blocked"}`;
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
  } else {
    iteration.securityFindings = {
      enabled: false,
      reason: "security_findings_production_phase_disabled",
    };
  }

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
  checkpoint(iteration);
  logger.info(`Iteration ${index}: selected issue #${issue.number} ${issue.title}`);

  let recoveryRecorder = createProductionRecoveryRecorder(config, {
    taskKey: safeTimestamp().slice(0, 13).replace(/[^0-9T]/g, ""),
    issue,
    runId,
    supervisorRunId: config.supervisorRunId || null,
    branchName: `pending/issue-${issue.number}-${runId}`,
    baseSha: config.dryRun ? null : getRefSha("origin/main"),
    currentHeadSha: config.dryRun ? null : getRefSha("HEAD"),
    phase: "issue_poll_claim",
    firstIncompleteAction: "claim_issue",
  });
  const claim = claimIssue(config, issue, logger);
  iteration.claim = claim;
  recoveryRecorder?.marker("claim", `issue-${issue.number}`, { target: issue.url || `#${issue.number}`, correlation: runId });
  recoveryRecorder?.advance("branch_setup", "create_or_recover_task_branch");
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
    recoveryRecorder?.stop("claim_reread_failed", claimReread.reason, "manual_recovery_required");
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const acceptedAt = new Date().toISOString();
  iteration.logicalTaskBudget = config.dryRun
    ? { ok: true, charged: false, duplicate: false, preview: true, acceptedLogicalTaskCount: 0, reasonCode: "dry_run_claim_not_accepted" }
    : chargeAcceptedLogicalTask(config, {
        budgetScopeId: config.logicalTaskBudgetScopeId || config.supervisorRunId || runId,
        maxTasks: config.maxIterations,
        issue,
        taskLineageId: `issue-${issue.number}`,
        claimIdentity: `${config.repositorySlug}#${issue.number}`,
        acceptedAt,
      });
  checkpoint(iteration);
  if (!iteration.logicalTaskBudget.ok) {
    iteration.outcome = "blocked_logical_task_budget";
    iteration.systemicStop = `logical-task-budget:${iteration.logicalTaskBudget.reasonCode}`;
    recoveryRecorder?.stop(
      iteration.logicalTaskBudget.reasonCode,
      iteration.logicalTaskBudget.reason || iteration.logicalTaskBudget.reasonCode,
      "stop_fail_closed",
    );
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }
  if (!config.dryRun) recoveryRecorder?.marker("logical_task_charge", iteration.logicalTaskBudget.chargeId, {
    target: `issue-${issue.number}`,
    correlation: iteration.logicalTaskBudget.chargeId,
  });

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
    recoveryRecorder?.stop("canary_policy_blocked", iteration.canaryPolicy.reason, "stop_fail_closed");
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
    recoveryRecorder?.stop("lane_policy_blocked", laneDecision.reason, "stop_fail_closed");
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  if ((issue.labels || []).includes("auto-bundle")) {
    const autoMergeRunner = config.dryRun ? null : createLiveFixedArgvRunner(config);
    iteration.phase = "feature_bundle";
    checkpoint(iteration);
    const bundleResult = await runFeatureBundleIteration(config, logger, {
      runId,
      index,
      issue,
      laneDecision,
      recoveryState: recoveryRecorder?.state || null,
      autoMergeRunner,
      operationalCheckpoint,
      controlCheck: () => {
        const control = applyControlAtSafeBoundary(config, { runId, iterations: [], stopReason: null });
        return control.action === "stop" ? { stop: true, reason: control.reason } : null;
      },
    });
    iteration.bundle = bundleResult.bundle;
    iteration.branchName = bundleResult.bundle?.branchName || null;
    iteration.baseOriginMainSha = bundleResult.baseOriginMainSha || null;
    iteration.changedFiles = bundleResult.validation?.changedFiles || bundleResult.bundle?.slices?.flatMap((slice) => slice.changedFiles || []) || [];
    iteration.validation = bundleResult.validation || null;
    iteration.reviewPackage = bundleResult.reviewPackage || null;
    iteration.externalReview = bundleResult.externalReview || null;
    iteration.review = bundleResult.review || null;
    iteration.push = bundleResult.push || null;
    iteration.pr = bundleResult.pr || null;
    iteration.ci = bundleResult.ci || null;
    iteration.autoMerge = bundleResult.autoMerge || null;
    iteration.recovery = bundleResult.recovery || recoveryRecorder?.summary();
    if (bundleResult.sessionLifecycle) {
      iteration.sessionLifecycle = bundleResult.sessionLifecycle;
      issue.sessionLifecycle = bundleResult.sessionLifecycle;
    }
    iteration.runnerCreatedCommitSha = config.dryRun ? null : (bundleResult.stopReason ? null : getRefSha("HEAD"));
    iteration.outcome = bundleResult.outcome || (bundleResult.ok ? "approved_pr_opened" : "auto_failed");
    iteration.phase = "feature_bundle_complete";
    checkpoint(iteration);
    if (!config.dryRun) {
      const detail = bundleResult.pr?.url ? `\n\nPR: ${bundleResult.pr.url}` : "";
      const reason = bundleResult.stopReason?.reason ? `\nReason: ${bundleResult.stopReason.reason}` : "";
      iteration.issueComment = finishIssueOutcome(
        config,
        issue,
        iteration.outcome,
        `Auto-runner feature-bundle result for #${issue.number}: ${iteration.outcome}.${detail}${reason}`,
      );
      const bundleLifecycle = issue.sessionLifecycle || bundleResult.sessionLifecycle;
      const bundleTerminalEffectsConfirmed = iteration.issueComment?.status === 0 && autoMergeEffectsConfirmed(config, bundleLifecycle, bundleResult.autoMerge);
      if (bundleLifecycle && bundleTerminalEffectsConfirmed) {
        const successfulBundleOutcome = ["auto_merged", "approved_pr_opened"].includes(iteration.outcome);
        const targetPhase = successfulBundleOutcome ? "completed" : "stopped";
        const terminal = bundleLifecycle.controller?.phase === targetPhase
          ? { ok: true, state: bundleLifecycle }
          : transitionSessionLifecyclePhase(config, bundleLifecycle, { phase: targetPhase, nextExactAction: successfulBundleOutcome ? "bundle_complete" : "bundle_stopped" });
        if (!terminal.ok) throw new Error(terminal.reasonCode);
        iteration.sessionLifecycle = terminal.state;
        issue.sessionLifecycle = terminal.state;
      }
    }
    iteration.finishedAt = new Date().toISOString();
    checkpoint(iteration);
    return iteration;
  }

  iteration.phase = "existing_pr_recovery";
  checkpoint(iteration);
  const recovery = await recoverExistingPrIfConfigured(config, logger, issue, laneDecision, null, {
    runId,
    index,
    chargeMarkerRef: iteration.logicalTaskBudget?.statePath,
    operationalCheckpoint,
  });
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
    iteration.phase = "existing_pr_recovery_complete";
    checkpoint(iteration);
    if (iteration.outcome !== "auto_merged" && !recovery.terminalMutationBlocked) {
      iteration.issueComment = finishIssueOutcome(
        config,
        issue,
        iteration.outcome,
        `Auto-runner existing-PR recovery did not auto-merge #${issue.number}.\n\nPR: ${recovery.pr?.url || recovery.pr?.number || "unavailable"}\nReason: ${recovery.autoMerge?.reason || recovery.reason}`,
      );
    }
    const recoveryLifecycle = issue.sessionLifecycle || recovery.sessionLifecycle;
    const recoveryTerminalEffectConfirmed = (iteration.outcome === "auto_merged" || iteration.issueComment?.status === 0) && autoMergeEffectsConfirmed(config, recoveryLifecycle, recovery.autoMerge);
    if (recoveryLifecycle && recoveryTerminalEffectConfirmed) {
      const targetPhase = iteration.outcome === "auto_merged" ? "completed" : "stopped";
      const terminal = recoveryLifecycle.controller?.phase === targetPhase
        ? { ok: true, state: recoveryLifecycle }
        : transitionSessionLifecyclePhase(config, recoveryLifecycle, {
            phase: targetPhase,
            nextExactAction: iteration.outcome === "auto_merged" ? "existing_pr_recovery_complete" : "existing_pr_recovery_stopped",
          });
      if (!terminal.ok) throw new Error(terminal.reasonCode);
      iteration.sessionLifecycle = terminal.state;
      issue.sessionLifecycle = terminal.state;
    }
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const slug = slugify(issue.title, 40);
  const branchPrefix = laneDecision.branchStrategy === "focused" ? "focused" : "feature";
  const branchName = `${branchPrefix}/auto-${issue.number}-${slug}-${safeTimestamp().slice(0, 15).toLowerCase()}`;
  iteration.branchName = branchName;
  fetchOriginMain(config);
  iteration.baseOriginMainSha = config.dryRun ? null : getRefSha("origin/main");
  createTaskBranch(config, branchName);
  recoveryRecorder?.setBranch({
    branchName,
    baseSha: iteration.baseOriginMainSha,
    currentHeadSha: config.dryRun ? null : getRefSha("HEAD"),
  });
  recoveryRecorder?.advance("implementation_or_bundle_slice", "run_implementation");
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
  recoveryRecorder?.annotate({
    taskKey: promptInfo.timestampKey,
    lane: laneDecision.lane,
    expectedReportPaths: {
      repoReportPath: promptInfo.reportPath,
      promptPath: promptInfo.promptPath,
    },
  });

  let lifecycleInvocation = null;
  if (!config.dryRun && config.sessionLifecycle?.enabled === true) {
    const controllerSessionId = `${runId}:controller:${index}`;
    const lifecycle = createSessionLifecycleState({
      repository: config.repositorySlug,
      issueNumber: issue.number,
      taskKey: promptInfo.timestampKey,
      runId,
      claimIdentity: `${config.repositorySlug}#${issue.number}`,
      chargeMarkerRef: iteration.logicalTaskBudget.statePath,
      sessionId: controllerSessionId,
      branchName,
      baseSha: iteration.baseOriginMainSha,
      headSha: getRefSha("HEAD"),
      phase: "implementation_or_bundle_slice",
      nextExactAction: "run_implementation",
      contextPolicy: config.sessionLifecycle.contextBudget,
      reservations: recoveryRecorder?.state?.mutationMarkers || {},
      evidence: recoveryRecorder?.state?.evidence || {},
      reportPath: promptInfo.reportPath,
    });
    const persistedLifecycle = persistSessionLifecycleState(config, lifecycle);
    if (!persistedLifecycle.ok) throw new Error(persistedLifecycle.reasonCode);
    lifecycleInvocation = { state: persistedLifecycle.state, newSessionId: `${runId}:implementation:${index}`, phase: "implementation_or_bundle_slice", telemetry: {}, mutationJournaled: true };
  }
  if (lifecycleInvocation) promptInfo.sessionLifecycle = lifecycleInvocation;
  if (lifecycleInvocation) iteration.sessionLifecycle = lifecycleInvocation.state;
  if (lifecycleInvocation) issue.sessionLifecycle = lifecycleInvocation.state;
  iteration.phase = "implementation";
  checkpoint(iteration);
  const codexResult = runCodexPrompt(config, { ...promptInfo, branchName }, "implementation");
  if (codexResult.sessionLifecycle?.state && promptInfo.sessionLifecycle) {
    promptInfo.sessionLifecycle = { ...promptInfo.sessionLifecycle, state: codexResult.sessionLifecycle.state };
    iteration.sessionLifecycle = codexResult.sessionLifecycle.state;
    issue.sessionLifecycle = codexResult.sessionLifecycle.state;
  }
  iteration.codex = codexResult;
  iteration.phase = "implementation_complete";
  checkpoint(iteration);
  if (!codexResult.skipped && (codexResult.error || codexResult.status !== 0)) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(config, issue, iteration.outcome, codexFailureBody(issue, codexResult));
    recoveryRecorder?.attempt("retryable_infrastructure", "codex_failed", codexResult.error || `status-${codexResult.status}`);
    recoveryRecorder?.stop("codex_failed", codexResult.error || `status ${codexResult.status}`, "retry_bounded_or_manual");
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }
  recoveryRecorder?.advance("checkpoint_validation_commit", "run_validation_and_commit");

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
    recoveryRecorder?.stop("implementation_no_changes", "Implementation produced no changes.", "stop_terminal");
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
    recoveryRecorder?.stop("changed_files_forbidden", forbidden.join(","), "stop_fail_closed");
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
    recoveryRecorder?.stop("pr_creation_not_allowed", laneDecision.lane, "stop_fail_closed");
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  const validationPlan = planValidation(changedFiles, laneDecision);
  iteration.phase = "local_validation";
  checkpoint(iteration);
  iteration.validation = runValidationPlan(config, validationPlan);
  iteration.phase = "local_validation_complete";
  recoveryRecorder?.evidence("localValidation", {
    status: iteration.validation.passed ? "passed" : "failed",
    headSha: config.dryRun ? null : getRefSha("HEAD"),
    baseSha: iteration.baseOriginMainSha,
    changedFiles,
    summary: "checkpoint validation",
  });
  checkpoint(iteration);
  if (!iteration.validation.passed) {
    iteration.commit = await commitExplicitPaths(config, changedFiles, `Auto-runner issue #${issue.number}: initial candidate before source classification`, { effectContext: promptInfo.sessionLifecycle?.state });
    iteration.runnerCreatedCommitSha = config.dryRun ? getRefSha("HEAD") : getRefSha("HEAD");
    recoveryRecorder?.headChanged(iteration.runnerCreatedCommitSha, "validation_failure_candidate_commit");
    const initialIdentity = {
      baseSha: iteration.baseOriginMainSha,
      headSha: iteration.runnerCreatedCommitSha,
      treeSha: getRefSha("HEAD^{tree}"),
      diffDigest: createHash("sha256").update(getBoundedDiff(iteration.baseOriginMainSha, iteration.runnerCreatedCommitSha).text).digest("hex"),
      changedFiles,
      changedFilesDigest: createHash("sha256").update(JSON.stringify([...changedFiles].sort())).digest("hex"),
    };
    const failures = sourceFailuresFromValidation(iteration.validation, { repository: config.repositorySlug, issueNumber: issue.number, taskKey: config.taskKey || promptInfo.timestampKey, branchName, identity: initialIdentity, profile: laneDecision.validationProfile, inContract: true });
    const batch = freezeSourceFailureBatch(failures, initialIdentity);
    const decision = evaluateSourceFailureBatch(batch, iteration.sourceFailureHistory || []);
    iteration.sourceFailureBatch = batch;
    iteration.sourceFailureHistory = [...(iteration.sourceFailureHistory || []), { batchIdentity: batch.batchIdentity, candidate: batch.candidate }];
    checkpoint(iteration);
    if (!decision.sourceFixEligible) {
      iteration.outcome = "validation_failed";
      iteration.issueComment = finishIssueOutcome(config, issue, iteration.outcome, validationFailureBody(issue, iteration.validation));
      recoveryRecorder?.stop("checkpoint_validation_not_source_fix_safe", "Validation failure was not safely classified as source-caused.", "stop_fail_closed");
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    recoveryRecorder?.marker("source_failure_fix_intent", batch.batchIdentity, { target: branchName, correlation: runId });
    const findings = batch.findings.map((failure) => ({ provider: failure.sourceKind, severity: "high", path: failure.path || changedFiles[0] || "", title: "Post-Codex local validation failure", body: failure.diagnosticExcerpt || failure.diagnosticDigest, safelyFixable: true }));
    const fixAttempt = await runReviewFixCycle(config, { issue, laneDecision, branchName, promptInfo, changedFiles, forbiddenChangedFiles: forbidden, validation: iteration.validation, report: { found: true, recovered: true }, externalReview: null, review: { verdict: { verdict: "changes_requested", recommended_next_action: "run_safe_fix_cycle", blocking_findings: findings } }, iteration, sourceFailureFix: { batch, decision, candidateHead: initialIdentity.headSha, baseSha: initialIdentity.baseSha } });
    if (!fixAttempt.proceeded) {
      iteration.outcome = "validation_failed";
      iteration.issueComment = finishIssueOutcome(config, issue, iteration.outcome, `Auto-runner source-failure fix stopped safely: ${fixAttempt.reason}.`);
      recoveryRecorder?.stop("source_failure_fix_not_proceeded", fixAttempt.reason, "stop_fail_closed");
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    let postFix = await commitReviewFixAndRerunExactHeadReviews(config, { issue, laneDecision, promptInfo, report: { found: true, recovered: true }, fixAttempt, recoveryRecorder, branchName });
    while (postFix.runnerCreatedCommitSha && !postFix.validation?.passed && !postFix.forbiddenChangedFiles?.length) {
      const replacementIdentity = ordinaryIdentityForHead(iteration.baseOriginMainSha, postFix.runnerCreatedCommitSha);
      const replacementFailures = sourceFailuresFromValidation(postFix.validation, {
        repository: config.repositorySlug,
        issueNumber: issue.number,
        taskKey: config.taskKey || promptInfo.timestampKey,
        branchName,
        identity: replacementIdentity,
        profile: laneDecision.validationProfile,
        inContract: true,
      });
      const replacementBatch = freezeSourceFailureBatch(replacementFailures, replacementIdentity);
      const replacementDecision = evaluateSourceFailureBatch(replacementBatch, iteration.sourceFailureHistory || []);
      iteration.sourceFailureBatch = replacementBatch;
      iteration.sourceFailureHistory = [...(iteration.sourceFailureHistory || []), { batchIdentity: replacementBatch.batchIdentity, candidate: replacementBatch.candidate }].slice(-100);
      iteration.validation = postFix.validation;
      iteration.runnerCreatedCommitSha = postFix.runnerCreatedCommitSha;
      iteration.changedFiles = postFix.changedFiles;
      checkpoint(iteration);
      if (!replacementDecision.sourceFixEligible) break;
      const replacementFindings = replacementBatch.findings.map((failure) => ({ provider: failure.sourceKind, severity: "high", path: failure.path || postFix.changedFiles[0] || "", title: "Recursive post-fix validation failure", body: failure.diagnosticExcerpt || failure.diagnosticDigest, safelyFixable: true }));
      const replacementAttempt = await runReviewFixCycle(config, { issue, laneDecision, branchName, promptInfo, changedFiles: postFix.changedFiles, forbiddenChangedFiles: [], validation: postFix.validation, report: { found: true, recovered: true }, externalReview: null, review: { verdict: { verdict: "changes_requested", recommended_next_action: "run_safe_fix_cycle", blocking_findings: replacementFindings } }, iteration, sourceFailureFix: { batch: replacementBatch, decision: replacementDecision, candidateHead: replacementIdentity.headSha, baseSha: replacementIdentity.baseSha } });
      if (!replacementAttempt.proceeded) break;
      postFix = await commitReviewFixAndRerunExactHeadReviews(config, { issue, laneDecision, promptInfo, report: { found: true, recovered: true }, fixAttempt: replacementAttempt, recoveryRecorder, branchName, commitMessage: `Auto-runner issue #${issue.number}: recursive source-fix ${replacementBatch.batchIdentity.slice(0, 16)}` });
    }
    if (!postFix.runnerCreatedCommitSha || !postFix.validation?.passed || postFix.forbiddenChangedFiles?.length) {
      iteration.outcome = "validation_failed";
      iteration.issueComment = finishIssueOutcome(config, issue, iteration.outcome, "Auto-runner source-failure replacement candidate did not pass complete recertification.");
      recoveryRecorder?.stop("source_failure_recertification_failed", "Replacement candidate failed validation or scope proof.", "stop_fail_closed");
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    iteration.sourceFailureCandidateCommitted = true;
    iteration.runnerCreatedCommitSha = postFix.runnerCreatedCommitSha;
    iteration.validation = postFix.validation;
    changedFiles = postFix.changedFiles;
    iteration.changedFiles = changedFiles;
    forbidden = postFix.forbiddenChangedFiles;
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
    recoveryRecorder?.stop("expected_report_missing", promptInfo.reportPath, "manual_recovery_required");
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
    recoveryRecorder?.stop("pre_review_pr_ownership_failed", "Unexpected PR or remote branch before review.", "stop_fail_closed");
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }

  if (!iteration.sourceFailureCandidateCommitted) {
    iteration.commit = await commitExplicitPaths(config, changedFiles, `Auto-runner issue #${issue.number}: ${issue.title}`, { effectContext: promptInfo.sessionLifecycle?.state });
    iteration.runnerCreatedCommitSha = config.dryRun ? null : getRefSha("HEAD");
  }
  recoveryRecorder?.headChanged(iteration.runnerCreatedCommitSha, "checkpoint_commit");
  recoveryRecorder?.marker("checkpoint_commit", `issue-${issue.number}-${iteration.runnerCreatedCommitSha || "dry-run"}`, {
    target: branchName,
    correlation: runId,
  });
  recoveryRecorder?.advance("aggregate_validation", "bind_exact_head_validation");
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
      recoveryRecorder?.stop("committed_files_forbidden", forbidden.join(","), "stop_fail_closed");
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
      recoveryRecorder?.stop("dirty_after_commit", "Exact-head commit left worktree dirty.", "stop_fail_closed");
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
  }
  iteration.validation = bindValidationEvidence(iteration.validation, {
    headSha: iteration.runnerCreatedCommitSha,
    baseSha: iteration.baseOriginMainSha,
    changedFiles,
    profile: laneDecision.validationProfile,
  });
  recoveryRecorder?.evidence("localValidation", {
    status: "passed",
    headSha: iteration.runnerCreatedCommitSha,
    baseSha: iteration.baseOriginMainSha,
    changedFiles,
    changedFilesDigest: iteration.validation.changedFilesDigest,
    summary: "exact-head validation",
  });
  checkpoint(iteration);

  if (recoveryRecorder) {
    const identity = {
      repository: config.repositorySlug || "tommytang213/Settleora",
      baseSha: iteration.baseOriginMainSha,
      headSha: iteration.runnerCreatedCommitSha,
      treeSha: getRefSha("HEAD^{tree}"),
      diffDigest: createHash("sha256").update(getBoundedDiff(iteration.baseOriginMainSha, iteration.runnerCreatedCommitSha).text).digest("hex"),
      changedFiles,
    };
    const ordinaryContinuation = createOrdinaryContinuationState({ logicalTaskKey: config.taskKey || `issue-${issue.number}`, executionKey: runId, issueNumber: issue.number, branchName, identity });
    const registered = await continueOrdinaryCandidate(ordinaryContinuation, {
      candidate_reconciliation: async () => ({ ok: true, evidence: identity }),
      local_validation: async () => ({ ok: true, evidence: { changedFilesDigest: iteration.validation.changedFilesDigest } }),
      external_review: async () => ({ ok: true, wait: true, completed: false, reasonCode: "external_review_pending" }),
      onCheckpoint: async (continuation) => recoveryRecorder.annotate({ ordinaryContinuation: continuation }),
    });
    if (!registered.ok || registered.state?.phase !== "external_review") throw new Error(registered.reasonCode || "ordinary_continuation_registration_failed");
  }

  const beforeReview = await checkoutFingerprint();
  recoveryRecorder?.advance("external_review", "run_external_review");
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
  iteration.phase = "external_review";
  checkpoint(iteration);
  iteration.externalReview = await runIntegratedReviewSource(config, iteration.reviewPackage, "pre-fix");
  iteration.phase = "external_review_complete";
  iteration.reviewMutationGuard = compareFingerprints(beforeReview, await checkoutFingerprint());
  checkpoint(iteration);
  if (iteration.reviewMutationGuard.mutationDetected) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(config, issue, iteration.outcome, `Auto-runner blocked #${issue.number} because external pre-PR review mutated the checkout.`);
    recoveryRecorder?.stop("external_review_mutated_checkout", "External pre-PR review mutated the checkout.", "stop_fail_closed");
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }
  recoveryRecorder?.evidence("externalReview", {
    status: iteration.externalReview.status === "pass" ? "passed" : "blocked",
    headSha: iteration.externalReview.reviewedHead || iteration.runnerCreatedCommitSha,
    baseSha: iteration.baseOriginMainSha,
    changedFiles,
    changedFilesDigest: iteration.externalReview.changedFilesDigest,
    evidencePath: iteration.externalReview.reportPath || iteration.externalReview.evidencePath,
    summary: iteration.externalReview.reason,
  });
  if (iteration.externalReview.status === "blocked") {
    if (iteration.externalReview?.route?.largeCandidateRouting?.route === "split_or_block") {
      iteration.largeCandidateReview = persistNormalLargeCandidateSplit(config, iteration, changedFiles);
      iteration.outcome = "blocked_needs_tommy";
      recoveryRecorder?.stop(iteration.largeCandidateReview.reasonCode, "Mixed candidate lacks a proven semantics-preserving split.", "minimum_scope_architecture_decision_required");
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    recoveryRecorder?.advance("review_fix", "run_external_review_fix");
    if (!config.dryRun) {
      const budget = evaluateNormalReviewConvergenceBudget(config, iteration, {
        issue,
        laneDecision,
        branchName,
        baseRef: "main",
        exactHead: iteration.runnerCreatedCommitSha,
        externalReview: iteration.externalReview,
        review: iteration.review,
        relationships: { parentPr: null, dependentPrs: [] },
      });
      if (!budget.ok) return stopForNormalReviewConvergenceBudget(config, issue, iteration, budget, recoveryRecorder);
    }
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
      attemptCount: iteration.reviewConvergenceState?.sourceChangingCycle ?? 0,
      reviewConvergenceState: iteration.reviewConvergenceState,
      diagnosticAuthorization: iteration.reviewConvergenceBudget?.diagnosticAuthorization,
    });
    iteration.reviewFixAttempts = [...(iteration.reviewFixAttempts || []), fixAttempt];
    if (promptInfo.sessionLifecycle?.state) iteration.sessionLifecycle = promptInfo.sessionLifecycle.state;
    if (!fixAttempt.proceeded) {
      markNormalDiagnosticReviewFixTerminal(config, iteration, fixAttempt.reason);
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
      recoveryRecorder?.attempt("review_fix_safe", "external_review_blocked", fixAttempt.reason);
      recoveryRecorder?.stop("external_review_fix_not_proceeded", fixAttempt.reason, "create_or_reuse_followup_or_escalate");
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    const postFix = await commitReviewFixAndRerunExactHeadReviews(config, {
      issue,
      laneDecision,
      promptInfo,
      report: iteration.report,
      fixAttempt,
      recoveryRecorder,
      branchName,
    });
    changedFiles = postFix.changedFiles;
    forbidden = postFix.forbiddenChangedFiles;
    iteration.changedFiles = changedFiles;
    iteration.forbiddenChangedFiles = forbidden;
    iteration.validation = bindValidationEvidence(postFix.validation, {
      headSha: postFix.runnerCreatedCommitSha,
      baseSha: iteration.baseOriginMainSha,
      changedFiles,
      profile: laneDecision.validationProfile,
    });
    iteration.commitAfterReviewFix = postFix.commit;
    iteration.runnerCreatedCommitSha = postFix.runnerCreatedCommitSha;
    recoveryRecorder?.marker("checkpoint_commit", `review-fix-${iteration.runnerCreatedCommitSha || "dry-run"}`, {
      target: branchName,
      correlation: runId,
    });
    accountNormalReviewFixCommit(iteration, iteration.runnerCreatedCommitSha, "review_fix_commit");
    iteration.reviewPackage = postFix.reviewPackage;
    iteration.externalReview = postFix.externalReview;
    iteration.review = postFix.review;
    iteration.reviewMutationGuard = postFix.reviewMutationGuard;
    checkpoint(iteration);
    if (iteration.reviewMutationGuard?.mutationDetected) {
      return stopForPostFixReviewMutation(config, issue, iteration, recoveryRecorder, "review_fix_review_mutated_checkout");
    }
    const sourceIdentity = normalSourceIdentityForCommit(iteration);
    appendNormalReviewConvergenceHistory(iteration, {
      externalReview: iteration.externalReview,
      review: iteration.review,
      fixAttempt,
      sourceIdentity,
    });
    persistNormalReviewConvergenceState(config, iteration, "post_fix_reviewed");
    recordPostFixExactHeadEvidence(recoveryRecorder, {
      validation: iteration.validation,
      externalReview: iteration.externalReview,
      review: iteration.review,
      headSha: iteration.runnerCreatedCommitSha,
      baseSha: iteration.baseOriginMainSha,
      changedFiles,
    });
  }
  if (!iteration.review) {
    recoveryRecorder?.advance("codex_mechanics_security_review", "run_codex_mechanics_review");
    iteration.phase = "local_codex_review";
    checkpoint(iteration);
    iteration.review = runReviewPrompt(config, { ...iteration.reviewPackage, sessionLifecycle: iteration.sessionLifecycle || iteration.issue?.sessionLifecycle || null });
    iteration.phase = "local_codex_review_complete";
    if (iteration.review.sessionLifecycle) {
      iteration.sessionLifecycle = iteration.review.sessionLifecycle;
      issue.sessionLifecycle = iteration.review.sessionLifecycle;
      if (promptInfo.sessionLifecycle) promptInfo.sessionLifecycle = { ...promptInfo.sessionLifecycle, state: iteration.review.sessionLifecycle };
    }
    checkpoint(iteration);
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
      recoveryRecorder?.stop("review_mutated_checkout", "Pre-PR review mutated the checkout.", "stop_fail_closed");
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
  }
  iteration.largeCandidateReview = iteration.externalReview?.route?.largeCandidateRouting?.route === "large_bundle_escalation"
    ? await certifyNormalCumulativeLargeReview(config, iteration, changedFiles)
    : { ok: true, state: "external_review_complete", verdict: "pass", route: "normal" };
  iteration.reviewMutationGuard = compareFingerprints(beforeReview, await checkoutFingerprint());
  if (iteration.reviewMutationGuard.mutationDetected) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(config, issue, iteration.outcome, `Auto-runner blocked #${issue.number} because structured pre-PR review mutated the checkout.`);
    recoveryRecorder?.stop("structured_review_mutated_checkout", "Structured pre-PR review mutated the checkout.", "stop_fail_closed");
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }
  if (iteration.largeCandidateReview.sessionLifecycle) {
    iteration.sessionLifecycle = iteration.largeCandidateReview.sessionLifecycle;
    issue.sessionLifecycle = iteration.largeCandidateReview.sessionLifecycle;
  }
  if (iteration.externalReview?.route?.largeCandidateRouting?.route === "large_bundle_escalation" && !iteration.largeCandidateReview.ok) {
    const manualVerdict = structuredLargeCandidateManualVerdict(iteration.largeCandidateReview);
    if (manualVerdict) {
      iteration.outcome = manualVerdict === "danger_gate" ? "danger_gate" : "blocked_needs_tommy";
      iteration.issueComment = finishIssueOutcome(config, issue, iteration.outcome, `Structured large-candidate review returned ${manualVerdict}; no fix cycle or push was attempted.`);
      recoveryRecorder?.stop(`structured_review_${manualVerdict}`, "Structured reviewer required a manual decision.", "manual_review_decision_required");
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    if (routeNormalStructuredFindingsToConvergence(iteration)) {
      recoveryRecorder?.advance("review_fix", "route_structured_large_candidate_findings");
    } else {
    iteration.outcome = "auto_failed";
    iteration.externalReview = { ...iteration.externalReview, status: "blocked", reason: iteration.largeCandidateReview.reasonCode || "large_candidate_review_incomplete" };
    recoveryRecorder?.stop(iteration.externalReview.reason, "Complete cumulative large-candidate dual review evidence was not established.", "rerun_complete_dual_review");
    iteration.finishedAt = new Date().toISOString();
    return iteration;
    }
  }
  recoveryRecorder?.evidence("codexReview", {
    status: iteration.review.verdict?.verdict === "approve" ? "passed" : "blocked",
    headSha: iteration.runnerCreatedCommitSha,
    baseSha: iteration.baseOriginMainSha,
    changedFiles,
    changedFilesDigest: iteration.review.changedFilesDigest,
    evidencePath: iteration.review.logPath || iteration.review.promptPath,
    summary: iteration.review.reviewFailureReason || iteration.review.verdict?.verdict,
  });

  if (config.requirePrePrReview && (iteration.review.verdict.verdict !== "approve" || iteration.externalReview?.status !== "pass")) {
    if (!config.dryRun) {
      const budget = evaluateNormalReviewConvergenceBudget(config, iteration, {
        issue,
        laneDecision,
        branchName,
        baseRef: "main",
        exactHead: iteration.runnerCreatedCommitSha,
        externalReview: iteration.externalReview,
        review: iteration.review,
        relationships: { parentPr: null, dependentPrs: [] },
      });
      if (!budget.ok) return stopForNormalReviewConvergenceBudget(config, issue, iteration, budget, recoveryRecorder);
    }
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
      attemptCount: iteration.reviewConvergenceState?.sourceChangingCycle ?? 0,
      reviewConvergenceState: iteration.reviewConvergenceState,
      diagnosticAuthorization: iteration.reviewConvergenceBudget?.diagnosticAuthorization,
    });
    iteration.reviewFixAttempts = [...(iteration.reviewFixAttempts || []), fixAttempt];
    if (promptInfo.sessionLifecycle?.state) iteration.sessionLifecycle = promptInfo.sessionLifecycle.state;
    if (fixAttempt.proceeded) {
      const postFix = await commitReviewFixAndRerunExactHeadReviews(config, {
        issue,
        laneDecision,
        promptInfo,
        report: iteration.report,
        fixAttempt,
        recoveryRecorder,
        branchName,
      });
      changedFiles = postFix.changedFiles;
      forbidden = postFix.forbiddenChangedFiles;
      iteration.changedFiles = changedFiles;
      iteration.forbiddenChangedFiles = forbidden;
      iteration.validation = bindValidationEvidence(postFix.validation, {
        headSha: postFix.runnerCreatedCommitSha,
        baseSha: iteration.baseOriginMainSha,
        changedFiles,
        profile: laneDecision.validationProfile,
      });
      iteration.commitAfterReviewFix = postFix.commit;
      iteration.runnerCreatedCommitSha = postFix.runnerCreatedCommitSha;
      recoveryRecorder?.marker("checkpoint_commit", `codex-review-initial-${iteration.runnerCreatedCommitSha || "dry-run"}`, {
        target: branchName,
        correlation: runId,
      });
      accountNormalReviewFixCommit(iteration, iteration.runnerCreatedCommitSha, "codex_review_initial_fix_commit");
      iteration.reviewPackage = postFix.reviewPackage;
      iteration.externalReview = postFix.externalReview;
      iteration.review = postFix.review;
      checkpoint(iteration);
      if (!await refreshNormalLargeCandidateReviewAfterFix(config, iteration, postFix.changedFiles, issue, recoveryRecorder)) return iteration;
      iteration.reviewMutationGuard = postFix.reviewMutationGuard;
      if (iteration.reviewMutationGuard?.mutationDetected) {
        return stopForPostFixReviewMutation(config, issue, iteration, recoveryRecorder, "codex_review_initial_fix_review_mutated_checkout");
      }
      const sourceIdentity = normalSourceIdentityForCommit(iteration);
      appendNormalReviewConvergenceHistory(iteration, {
        externalReview: iteration.externalReview,
        review: iteration.review,
        fixAttempt,
        sourceIdentity,
      });
      persistNormalReviewConvergenceState(config, iteration, "post_fix_reviewed");
      recordPostFixExactHeadEvidence(recoveryRecorder, {
        validation: iteration.validation,
        externalReview: iteration.externalReview,
        review: iteration.review,
        headSha: iteration.runnerCreatedCommitSha,
        baseSha: iteration.baseOriginMainSha,
        changedFiles,
      });
    } else {
      markNormalDiagnosticReviewFixTerminal(config, iteration, fixAttempt.reason);
    }
  }

  if (config.requirePrePrReview && config.dryRun && iteration.review.verdict.verdict !== "approve") {
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
    recoveryRecorder?.stop("codex_review_not_approved", iteration.review.verdict.verdict, "run_focused_fix_or_escalate");
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }
  while (true) {
    if (!config.dryRun && ((iteration.review?.verdict?.verdict && iteration.review.verdict.verdict !== "approve") || iteration.externalReview?.status === "blocked")) {
      recoveryRecorder?.advance("review_fix", "run_bounded_codex_review_convergence");
      const budget = evaluateNormalReviewConvergenceBudget(config, iteration, {
        issue,
        laneDecision,
        branchName,
        baseRef: "main",
        exactHead: iteration.runnerCreatedCommitSha,
        externalReview: iteration.externalReview,
        review: iteration.review,
        relationships: { parentPr: null, dependentPrs: [] },
      });
      if (!budget.ok) return stopForNormalReviewConvergenceBudget(config, issue, iteration, budget, recoveryRecorder);
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
        attemptCount: iteration.reviewConvergenceState?.sourceChangingCycle ?? 0,
        reviewConvergenceState: iteration.reviewConvergenceState,
        diagnosticAuthorization: iteration.reviewConvergenceBudget?.diagnosticAuthorization,
      });
      iteration.reviewFixAttempts = [...(iteration.reviewFixAttempts || []), fixAttempt];
      if (promptInfo.sessionLifecycle?.state) iteration.sessionLifecycle = promptInfo.sessionLifecycle.state;
      if (!fixAttempt.proceeded) {
        markNormalDiagnosticReviewFixTerminal(config, iteration, fixAttempt.reason);
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
          `Auto-runner did not open a PR for #${issue.number} because bounded Codex review convergence could not safely continue: ${fixAttempt.reason}.`,
        );
        recoveryRecorder?.stop("codex_review_convergence_fix_not_proceeded", fixAttempt.reason, "create_or_reuse_followup_or_escalate");
        iteration.finishedAt = new Date().toISOString();
        return iteration;
      }
      const postFix = await commitReviewFixAndRerunExactHeadReviews(config, {
        issue,
        laneDecision,
        promptInfo,
        report: iteration.report,
        fixAttempt,
        recoveryRecorder,
        branchName,
      });
      changedFiles = postFix.changedFiles;
      forbidden = postFix.forbiddenChangedFiles;
      iteration.changedFiles = changedFiles;
      iteration.forbiddenChangedFiles = forbidden;
      iteration.validation = bindValidationEvidence(postFix.validation, {
        headSha: postFix.runnerCreatedCommitSha,
        baseSha: iteration.baseOriginMainSha,
        changedFiles,
        profile: laneDecision.validationProfile,
      });
      iteration.commitAfterReviewFix = postFix.commit;
      iteration.runnerCreatedCommitSha = postFix.runnerCreatedCommitSha;
      recoveryRecorder?.marker("checkpoint_commit", `codex-review-convergence-${iteration.runnerCreatedCommitSha || "dry-run"}`, {
        target: branchName,
        correlation: runId,
      });
      accountNormalReviewFixCommit(iteration, iteration.runnerCreatedCommitSha, "codex_review_convergence_fix_commit");
      iteration.reviewPackage = postFix.reviewPackage;
      iteration.externalReview = postFix.externalReview;
      iteration.review = postFix.review;
      checkpoint(iteration);
      if (!await refreshNormalLargeCandidateReviewAfterFix(config, iteration, postFix.changedFiles, issue, recoveryRecorder)) return iteration;
      iteration.reviewMutationGuard = postFix.reviewMutationGuard;
      if (iteration.reviewMutationGuard?.mutationDetected) {
        return stopForPostFixReviewMutation(config, issue, iteration, recoveryRecorder, "codex_review_convergence_fix_review_mutated_checkout");
      }
      const sourceIdentity = normalSourceIdentityForCommit(iteration);
      appendNormalReviewConvergenceHistory(iteration, {
        externalReview: iteration.externalReview,
        review: iteration.review,
        fixAttempt,
        sourceIdentity,
      });
      persistNormalReviewConvergenceState(config, iteration, "post_fix_reviewed");
      recordPostFixExactHeadEvidence(recoveryRecorder, {
        validation: iteration.validation,
        externalReview: iteration.externalReview,
        review: iteration.review,
        headSha: iteration.runnerCreatedCommitSha,
        baseSha: iteration.baseOriginMainSha,
        changedFiles,
      });
      continue;
    }
    const reviewConvergence = buildLiveReviewConvergenceContext({
      config,
      issue,
      laneDecision,
      branchName,
      baseRef: "main",
      exactHead: iteration.runnerCreatedCommitSha,
      reviewConvergenceState: iteration.reviewConvergenceState,
      reviewConvergenceHistory: iteration.reviewConvergenceHistory || [],
      sourceChangingCycle: iteration.reviewConvergenceState?.sourceChangingCycle ?? 0,
      relationships: { parentPr: null, dependentPrs: [] },
    });
    iteration.reviewConvergence = reviewConvergence.context;
    iteration.reviewConvergenceState = reviewConvergence.gateInput.reviewConvergenceState;
    const prePushReviewGate = evaluatePrePushReviewGate({
      ...reviewConvergence.gateInput,
      laneDecision,
      externalReview: iteration.externalReview,
      reviewMutationGuard: iteration.reviewMutationGuard,
    });
    iteration.prePushReviewGate = prePushReviewGate;
    if (prePushReviewGate.ok) break;
    if (prePushReviewGate.outcome !== "review_convergence_required") {
      iteration.outcome = prePushReviewGate.outcome;
      iteration.issueComment = finishIssueOutcome(
        config,
        issue,
        iteration.outcome,
        `Auto-runner did not open a PR for #${issue.number} because ${prePushReviewGate.message}.`,
      );
      recoveryRecorder?.stop("pre_push_review_gate_failed", prePushReviewGate.reason || prePushReviewGate.message, "stop_fail_closed");
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    recoveryRecorder?.advance("review_fix", "run_bounded_review_convergence");
    const budget = evaluateNormalReviewConvergenceBudget(config, iteration, {
      issue,
      laneDecision,
      branchName,
      baseRef: "main",
      exactHead: iteration.runnerCreatedCommitSha,
      externalReview: iteration.externalReview,
      review: iteration.review,
      relationships: { parentPr: null, dependentPrs: [] },
    });
    if (!budget.ok) return stopForNormalReviewConvergenceBudget(config, issue, iteration, budget, recoveryRecorder);
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
      attemptCount: iteration.reviewConvergenceState?.sourceChangingCycle ?? 0,
      reviewConvergenceState: iteration.reviewConvergenceState,
      diagnosticAuthorization: iteration.reviewConvergenceBudget?.diagnosticAuthorization,
    });
    iteration.reviewFixAttempts = [...(iteration.reviewFixAttempts || []), fixAttempt];
    if (promptInfo.sessionLifecycle?.state) iteration.sessionLifecycle = promptInfo.sessionLifecycle.state;
    if (!fixAttempt.proceeded) {
      markNormalDiagnosticReviewFixTerminal(config, iteration, fixAttempt.reason);
      iteration.outcome = "review_changes_requested_retry_exhausted";
      iteration.issueComment = finishIssueOutcome(
        config,
        issue,
        iteration.outcome,
        `Auto-runner did not open a PR for #${issue.number} because bounded review convergence could not safely continue: ${fixAttempt.reason}.`,
      );
      recoveryRecorder?.stop("review_convergence_fix_not_proceeded", fixAttempt.reason, "create_or_reuse_followup_or_escalate");
      iteration.finishedAt = new Date().toISOString();
      return iteration;
    }
    const postFix = await commitReviewFixAndRerunExactHeadReviews(config, {
      issue,
      laneDecision,
      promptInfo,
      report: iteration.report,
      fixAttempt,
      recoveryRecorder,
      branchName,
    });
    changedFiles = postFix.changedFiles;
    forbidden = postFix.forbiddenChangedFiles;
    iteration.changedFiles = changedFiles;
    iteration.forbiddenChangedFiles = forbidden;
    iteration.validation = bindValidationEvidence(postFix.validation, {
      headSha: postFix.runnerCreatedCommitSha,
      baseSha: iteration.baseOriginMainSha,
      changedFiles,
      profile: laneDecision.validationProfile,
    });
    iteration.commitAfterReviewFix = postFix.commit;
    iteration.runnerCreatedCommitSha = postFix.runnerCreatedCommitSha;
    recoveryRecorder?.marker("checkpoint_commit", `review-convergence-${iteration.runnerCreatedCommitSha || "dry-run"}`, {
      target: branchName,
      correlation: runId,
    });
    accountNormalReviewFixCommit(iteration, iteration.runnerCreatedCommitSha, "review_convergence_fix_commit");
    iteration.reviewPackage = postFix.reviewPackage;
    iteration.externalReview = postFix.externalReview;
    iteration.review = postFix.review;
    checkpoint(iteration);
    if (!await refreshNormalLargeCandidateReviewAfterFix(config, iteration, postFix.changedFiles, issue, recoveryRecorder)) return iteration;
    iteration.reviewMutationGuard = postFix.reviewMutationGuard;
    if (iteration.reviewMutationGuard?.mutationDetected) {
      return stopForPostFixReviewMutation(config, issue, iteration, recoveryRecorder, "review_convergence_fix_review_mutated_checkout");
    }
    const sourceIdentity = normalSourceIdentityForCommit(iteration);
    appendNormalReviewConvergenceHistory(iteration, {
      externalReview: iteration.externalReview,
      review: iteration.review,
      fixAttempt,
      sourceIdentity,
    });
    persistNormalReviewConvergenceState(config, iteration, "post_fix_reviewed");
    recordPostFixExactHeadEvidence(recoveryRecorder, {
      validation: iteration.validation,
      externalReview: iteration.externalReview,
      review: iteration.review,
      headSha: iteration.runnerCreatedCommitSha,
      baseSha: iteration.baseOriginMainSha,
      changedFiles,
    });
  }

  recoveryRecorder?.advance("push", "push_branch");
  iteration.phase = "push";
  checkpoint(iteration);
  iteration.push = await pushBranch(config, branchName, { effectContext: promptInfo.sessionLifecycle?.state });
  iteration.phase = "push_complete";
  checkpoint(iteration);
  if (!config.dryRun && (iteration.push.error || iteration.push.status !== 0)) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner failed while pushing branch ${branchName} for #${issue.number}.`,
    );
    recoveryRecorder?.attempt("retryable_infrastructure", "push_failed", iteration.push.error || `status-${iteration.push.status}`);
    recoveryRecorder?.stop("push_failed", iteration.push.error || `status ${iteration.push.status}`, "retry_bounded_or_manual");
    iteration.finishedAt = new Date().toISOString();
    return iteration;
  }
  recoveryRecorder?.marker("push", `branch-${branchName}`, { target: branchName, correlation: iteration.runnerCreatedCommitSha || runId });
  recoveryRecorder?.advance("pr_create_recover", "open_or_recover_pr");
  iteration.phase = "pr_create_recover";
  checkpoint(iteration);
  iteration.pr = await openOrUpdatePr(config, issue, branchName, prSummary(iteration), { effectContext: promptInfo.sessionLifecycle?.state });
  iteration.phase = "pr_create_recover_complete";
  checkpoint(iteration);
  if (iteration.pr?.url || iteration.pr?.number) {
    recoveryRecorder?.setPr(iteration.pr);
    recoveryRecorder?.marker("pr_create", `issue-${issue.number}`, {
      target: iteration.pr.url || String(iteration.pr.number),
      correlation: iteration.runnerCreatedCommitSha || runId,
    });
  }
  if (!config.dryRun && iteration.pr.url) {
    recoveryRecorder?.advance("ci_wait", "wait_for_checks");
    iteration.phase = "ci_wait";
    checkpoint(iteration);
    iteration.ci = watchChecks(config, iteration.pr.url);
    iteration.phase = "ci_wait_complete";
    checkpoint(iteration);
    recoveryRecorder?.evidence("ciChecks", {
      status: "recorded",
      headSha: iteration.runnerCreatedCommitSha,
      baseSha: iteration.baseOriginMainSha,
      changedFiles,
      summary: "GitHub check wait completed",
    });
  }
  recoveryRecorder?.advance("exact_head_final_refresh", "evaluate_merge_or_pr_state");
  iteration.phase = "exact_head_final_refresh";
  checkpoint(iteration);
  iteration.autoMerge = await evaluateOrExecuteAutoMerge(config, {
    issue,
    iteration,
    branchName,
    changedFiles,
    forbidden,
  });
  iteration.phase = "exact_head_final_refresh_complete";
  checkpoint(iteration);
  if (iteration.autoMerge.result === "merged") {
    recoveryRecorder?.advance("merge", "merge_confirmed");
    recoveryRecorder?.marker("merge", `pr-${iteration.pr?.number || iteration.pr?.url}-${iteration.runnerCreatedCommitSha || "head"}`, {
      target: iteration.pr?.url || String(iteration.pr?.number || ""),
      correlation: iteration.autoMerge.mergeSha || iteration.runnerCreatedCommitSha || runId,
    });
    recoveryRecorder?.advance("post_merge_current_main_checks_scanner_reconciliation", "reconcile_current_main");
    iteration.outcome = "auto_merged";
  } else if (config.allowAutoMerge && !config.dryRun) {
    iteration.outcome = "auto_failed";
    iteration.issueComment = finishIssueOutcome(
      config,
      issue,
      iteration.outcome,
      `Auto-runner opened a PR for #${issue.number} but did not auto-merge it.\n\nPR: ${iteration.pr?.url || "URL unavailable"}\nReason: ${iteration.autoMerge.reason}`,
    );
    recoveryRecorder?.stop("auto_merge_failed", iteration.autoMerge.reason, "manual_recovery_required");
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
      recoveryRecorder?.marker("issue_comment", `issue-${issue.number}-pr-opened`, {
        target: issue.url || `#${issue.number}`,
        correlation: iteration.pr?.url || "",
      });
    }
  }
  const ordinaryLifecycle = issue.sessionLifecycle || iteration.sessionLifecycle;
  const ordinaryTerminalEffectsConfirmed = (iteration.outcome === "auto_merged" || iteration.issueComment?.status === 0)
    && autoMergeEffectsConfirmed(config, ordinaryLifecycle, iteration.autoMerge);
  if (ordinaryLifecycle && ordinaryTerminalEffectsConfirmed) {
    const successfulOutcome = ["auto_merged", "approved_pr_opened"].includes(iteration.outcome);
    const terminal = transitionSessionLifecyclePhase(config, ordinaryLifecycle, {
      phase: successfulOutcome ? "completed" : "stopped",
      nextExactAction: iteration.outcome === "auto_merged"
        ? "ordinary_auto_merge_complete"
        : iteration.outcome === "approved_pr_opened"
          ? "ordinary_pr_opened_complete"
          : "ordinary_failure_terminalized",
    });
    if (!terminal.ok) throw new Error(terminal.reasonCode);
    iteration.sessionLifecycle = terminal.state;
    issue.sessionLifecycle = terminal.state;
  }
  recoveryRecorder?.complete(iteration.outcome);
  iteration.recovery = recoveryRecorder?.summary();
  iteration.finishedAt = new Date().toISOString();
  return iteration;
}

function chargeStartupRecoveryLogicalTask(config, runId, recovery) {
  const issue = { number: recovery.state?.issueNumber };
  if (!Number.isSafeInteger(issue?.number) || issue.number <= 0) return { ok: false, reasonCode: "startup_recovery_issue_identity_missing" };
  const budgetScopeId = config.logicalTaskBudgetScopeId || recovery.state?.supervisorRunId || recovery.state?.runId || config.supervisorRunId || runId;
  const loaded = loadLogicalTaskBudget(config, budgetScopeId);
  if (!loaded.ok) return loaded;
  const alreadyCharged = Object.values(loaded.state.charges || {}).some((marker) =>
    marker.identity?.repository === config.repositorySlug &&
    marker.identity?.issueNumber === issue.number &&
    marker.identity?.taskLineageId === `issue-${issue.number}` &&
    marker.identity?.claimIdentity === `${config.repositorySlug}#${issue.number}`,
  );
  if (!alreadyCharged) {
    const live = readIssueLive(config, issue.number);
    if (!live.ok) return { ok: false, reasonCode: live.reason || "startup_recovery_claim_reread_failed" };
    const reread = validateClaimReread(config, issue, live.issue);
    if (!reread.ok) return { ok: false, reasonCode: reread.reason || "startup_recovery_claim_reread_failed" };
  }
  return chargeAcceptedLogicalTask(config, {
    budgetScopeId,
    maxTasks: config.maxIterations,
    issue,
    taskLineageId: `issue-${issue.number}`,
    claimIdentity: `${config.repositorySlug}#${issue.number}`,
    acceptedAt: new Date().toISOString(),
  });
}

function createProductionRecoveryRecorder(config, input) {
  if (config.dryRun) return null;
  let state = createInitialRecoveryState(input);
  let statePath = null;
  const persist = (nextState) => {
    const written = writeRecoveryState(config, nextState);
    state = written.state;
    statePath = written.statePath;
    return state;
  };
  persist(state);
  return {
    get state() {
      return state;
    },
    setBranch({ branchName, baseSha, currentHeadSha }) {
      return persist({
        ...state,
        branch: {
          ...state.branch,
          name: branchName || state.branch.name,
          baseSha: baseSha || state.branch.baseSha,
          currentHeadSha: currentHeadSha || state.branch.currentHeadSha,
        },
      });
    },
    setPr(pr) {
      return persist({
        ...state,
        pr: {
          number: Number.isInteger(pr?.number) ? pr.number : state.pr?.number || null,
          url: pr?.url || state.pr?.url || null,
          headSha: pr?.headSha || pr?.headRefOid || state.branch.currentHeadSha || null,
          headRefName: pr?.headRefName || state.branch.name || null,
          baseRefName: pr?.baseRefName || "main",
          state: pr?.state || "OPEN",
        },
      });
    },
    advance(phase, firstIncompleteAction, nextSafeAction = firstIncompleteAction) {
      return persist(advanceRecoveryPhase(state, { phase, firstIncompleteAction, nextSafeAction }));
    },
    evidence(kind, evidence) {
      return persist(bindRecoveryEvidence(state, kind, evidence));
    },
    completeHeadEvidence(evidenceByKind, identity = {}) {
      const persisted = persistCompleteHeadEvidence(config, state, evidenceByKind, identity);
      if (persisted.ok) {
        state = persisted.state;
        statePath = persisted.statePath;
      }
      return persisted;
    },
    headChanged(newHeadSha, reasonCode, metadata = {}) {
      return persist({ ...invalidateEvidenceForHeadChange(state, { newHeadSha, reasonCode }), ...metadata });
    },
    marker(kind, key, marker = {}) {
      return persist(recordIdempotentMutation(state, { kind, key, marker }));
    },
    annotate(metadata = {}) {
      return persist({
        ...state,
        ...metadata,
        taskKey: metadata.taskKey || state.taskKey,
      });
    },
    attempt(outcomeClass, fingerprint, reasonCode) {
      return persist(recordRecoveryAttempt(state, { outcomeClass, fingerprint, reasonCode, phase: state.phase }));
    },
    stop(reasonCode, reason, nextSafeAction = "stop_fail_closed") {
      return persist({
        ...advanceRecoveryPhase(state, { phase: "stopped", firstIncompleteAction: state.firstIncompleteAction, nextSafeAction }),
        stopReason: { reasonCode, reason: String(reason || "").slice(0, 300) },
      });
    },
    complete(outcome) {
      return persist({
        ...advanceRecoveryPhase(state, { phase: "completed", firstIncompleteAction: "none", nextSafeAction: "none" }),
        stopReason: null,
        completion: { outcome: String(outcome || "completed").slice(0, 80), completedAt: new Date().toISOString() },
      });
    },
    summary() {
      return {
        action: "production_recovery_state_recorded",
        statePath,
        state: {
          taskKey: state.taskKey,
          issueNumber: state.issue?.number || null,
          branchName: state.branch?.name || null,
          baseSha: state.branch?.baseSha || null,
          currentHeadSha: state.branch?.currentHeadSha || null,
          prNumber: state.pr?.number || null,
          prUrl: state.pr?.url || null,
          phase: state.phase,
          nextSafeAction: state.nextSafeAction,
          stopReason: state.stopReason,
        },
      };
    },
  };
}

async function resumeStartupRecovery(config, logger, runId, index, startupRecovery, operationalCheckpoint = null) {
  return executeStartupContinuation(config, startupRecovery, {
    controlCheck: (state) => evaluateControlAtRecoveryBoundary(state, applyControlAtSafeBoundary(config, { runId, iterations: [], stopReason: null })),
    default: async ({ state, boundary }) => {
      const startupEvidenceCheck = validateRecoveryOnlyStartupEvidence(config, state);
      if (!startupEvidenceCheck.ok) {
        return {
          ok: false,
          outcome: "blocked_recovery_state",
          reasonCode: startupEvidenceCheck.reason,
          state,
        };
      }
      const live = readIssueLive(config, state.issue.number);
      if (!live.ok) {
        return { ok: false, outcome: "blocked_recovery_state", reasonCode: live.reason || "recovery_issue_read_failed", state };
      }
      const issue = live.issue || state.issue;
      const laneDecision = classifyIssueLane(issue);
      if (state.featureBundle) {
        const autoMergeRunner = config.dryRun ? null : createLiveFixedArgvRunner(config);
        const bundle = await runFeatureBundleIteration(config, logger, {
          runId,
          index,
          issue,
          laneDecision,
          branchName: state.branch.name,
          recoveryState: state,
          autoMergeRunner,
          operationalCheckpoint,
          controlCheck: () => {
            const control = applyControlAtSafeBoundary(config, { runId, iterations: [], stopReason: null });
            return control.action === "stop" ? { stop: true, reason: control.reason } : null;
          },
        });
        return { ok: bundle.ok !== false, outcome: bundle.outcome || "recovery_bundle_continued", reasonCode: bundle.stopReason?.reasonCode, bundle, state };
      }
      if (["external_review", "codex_mechanics_security_review", "review_fix"].includes(boundary.phase)) {
        const checkpoint = loadNormalLargeCandidateRecoveryCheckpoint(config, state);
        if (checkpoint.ok) {
          return continueOrdinaryCandidateRecovery(config, logger, { issue, laneDecision, state, checkpoint, boundary, operationalCheckpoint });
        }
      }
      if (!["push", "pr_create_recover", "ci_wait", "ci_scanner_fix", "exact_head_final_refresh", "merge", "source_branch_restoration", "post_merge_current_main_checks_scanner_reconciliation", "issue_parent_ledger_hygiene"].includes(boundary.phase)) {
        const stopped = advanceRecoveryPhase(state, {
          phase: "stopped",
          firstIncompleteAction: boundary.firstIncompleteAction,
          nextSafeAction: "manual_recovery_required",
        });
        writeRecoveryState(config, {
          ...stopped,
          stopReason: {
            reasonCode: "unsupported_early_phase_recovery",
            reason: `Startup continuation cannot safely reconstruct phase ${boundary.phase} without re-running implementation.`,
          },
        });
        return { ok: false, outcome: "blocked_recovery_state", reasonCode: "unsupported_early_phase_recovery", state: stopped };
      }
      const existingPrRecovery = await recoverExistingPrIfConfigured(config, logger, issue, laneDecision, state, {
        runId: state.runId || state.logicalTask?.runId,
        operationalCheckpoint,
      });
      if (!existingPrRecovery) {
        return { ok: false, outcome: "blocked_recovery_state", reasonCode: "recovery_existing_pr_context_missing", state };
      }
      return {
        ok: existingPrRecovery.autoMerge?.result !== "blocked",
        outcome: existingPrRecovery.autoMerge?.result === "merged" ? "auto_merged" : "recovery_existing_pr_continued",
        reasonCode: existingPrRecovery.reason,
        existingPrRecovery,
        ...existingPrRecovery,
        state,
      };
    },
  });
}

async function continueOrdinaryCandidateRecovery(config, logger, { issue, laneDecision, state, checkpoint, boundary, operationalCheckpoint = null }) {
  const identity = checkpoint.candidateIdentity;
  let initial = state.ordinaryContinuation || createOrdinaryContinuationState({
    logicalTaskKey: state.logicalTask?.taskKey || state.taskKey,
    executionKey: config.runnerRunId || null,
    issueNumber: issue.number,
    branchName: state.branch.name,
    identity: { ...identity, changedFiles: listChangedFiles(identity.baseSha, identity.headSha) },
    phase: "candidate_reconciliation",
    counters: { acceptedLogicalTasks: 1, sourceRounds: state.reviewConvergenceState?.counters?.lifetimeLocalSourceChangingRounds || 0, githubEpochs: state.reviewConvergenceState?.counters?.githubTriggeredFixEpochsPerPr || 0 },
  });
  fetchOriginMain(config);
  const liveHeadAtRecovery = getRefSha("HEAD");
  const preparedFixCanBeAdopted = Boolean(
    initial.sourceFailureFixIntent?.status === "prepared"
    && initial.sourceFailureFixIntent?.candidateHead === initial.identity.headSha
    && liveHeadAtRecovery !== initial.identity.headSha
    && spawnSync("git", ["merge-base", "--is-ancestor", initial.identity.headSha, liveHeadAtRecovery], { cwd: config.repoRoot, encoding: "utf8" }).status === 0
    && spawnSync("git", ["rev-list", "--count", `${initial.identity.headSha}..${liveHeadAtRecovery}`], { cwd: config.repoRoot, encoding: "utf8" }).stdout.trim() === "1"
    && spawnSync("git", ["show", "-s", "--format=%s", liveHeadAtRecovery], { cwd: config.repoRoot, encoding: "utf8" }).stdout.trim() === `Auto-runner issue #${issue.number}: source-fix ${initial.sourceFailureFixIntent?.batchIdentity?.slice(0, 16)}`
  );
  if (getCurrentBranch() !== initial.branchName || (!preparedFixCanBeAdopted && liveHeadAtRecovery !== initial.identity.headSha) || getRefSha("origin/main") !== initial.identity.baseSha || getStatusShort() !== "") {
    return { ok: false, outcome: "blocked", reasonCode: "ordinary_continuation_live_candidate_mismatch", ordinaryContinuation: initial, largeCandidateReviewRecovery: checkpoint, state };
  }
  const actualChangedFiles = listChangedFiles(initial.identity.baseSha, initial.identity.headSha);
  const actualIdentity = {
    baseSha: initial.identity.baseSha,
    headSha: initial.identity.headSha,
    treeSha: getRefSha(`${initial.identity.headSha}^{tree}`),
    diffDigest: createHash("sha256").update(getBoundedDiff(initial.identity.baseSha, initial.identity.headSha).text).digest("hex"),
    changedFiles: actualChangedFiles,
    changedFilesDigest: createHash("sha256").update(JSON.stringify([...actualChangedFiles].sort())).digest("hex"),
  };
  if (!ordinaryCandidateIdentityMatches(initial.identity, actualIdentity)) {
    return { ok: false, outcome: "blocked", reasonCode: "ordinary_continuation_candidate_identity_mismatch", ordinaryContinuation: initial, largeCandidateReviewRecovery: checkpoint, state };
  }
  if (preparedFixCanBeAdopted) {
    const replacementIdentity = ordinaryIdentityForHead(initial.identity.baseSha, liveHeadAtRecovery);
    initial = {
      ...initial,
      identity: replacementIdentity,
      phase: "local_validation",
      effects: initial.effects?.candidate_reconciliation ? { candidate_reconciliation: initial.effects.candidate_reconciliation } : {},
      counters: {
        ...initial.counters,
        localSourceChangingRoundsPerEpoch: initial.counters.localSourceChangingRoundsPerEpoch + 1,
        lifetimeLocalSourceChangingRounds: initial.counters.lifetimeLocalSourceChangingRounds + 1,
      },
      lastSourceFailureFix: { adoptedCommit: liveHeadAtRecovery, batchIdentity: initial.sourceFailureFixIntent.batchIdentity },
      sourceFailureFixIntent: null,
      sourceFailureBatch: null,
    };
    await writeRecoveryState(config, { ...state, ordinaryContinuation: initial });
  }
  const context = {
    issue,
    laneDecision,
    checkpoint,
    validation: null,
    reviewPackage: null,
    externalReview: initial.effects?.external_review?.evidence?.review || null,
    review: initial.effects?.codex_review?.evidence?.review || null,
    largeCandidateReview: ordinaryStructuredReviewCheckpoint(initial.effects?.structured_review?.evidence),
    pr: null,
  };
  const persist = async (ordinaryContinuation) => writeRecoveryState(config, { ...state, ordinaryContinuation });
  const result = await continueOrdinaryCandidate(initial, {
    candidate_reconciliation: async (continuation) => {
      const candidate = continuation.identity;
      fetchOriginMain(config);
      if (getCurrentBranch() !== state.branch.name || getRefSha("HEAD") !== candidate.headSha || getRefSha("origin/main") !== candidate.baseSha || getStatusShort() !== "") return { ok: false, reasonCode: "ordinary_continuation_candidate_mismatch" };
      return { ok: true, evidence: candidate };
    },
    local_validation: async (continuation) => {
      operationalCheckpoint?.("ordinary_recovery_local_validation");
      const candidate = continuation.identity;
      const changedFiles = listChangedFiles(candidate.baseSha, candidate.headSha);
      const forbidden = filterForbiddenChangedFiles(changedFiles, laneDecision);
      if (forbidden.length) return { ok: false, reasonCode: "ordinary_continuation_scope_mismatch" };
      context.validation = bindValidationEvidence(runValidationPlan(config, planValidation(changedFiles, laneDecision)), { headSha: candidate.headSha, baseSha: candidate.baseSha, changedFiles, profile: laneDecision.validationProfile });
      operationalCheckpoint?.("ordinary_recovery_local_validation_complete", { validation: context.validation });
      return context.validation.passed
        ? { ok: true, evidence: { changedFilesDigest: context.validation.changedFilesDigest } }
        : { ok: true, sourceFailures: sourceFailuresFromValidation(context.validation, { repository: config.repositorySlug, issueNumber: issue.number, taskKey: continuation.logicalTaskKey, branchName: continuation.branchName, identity: candidate, profile: laneDecision.validationProfile, inContract: true }) };
    },
    adopt_source_failure_fix: async (continuation, { intent }) => {
      if (intent?.candidateHead !== continuation.identity.headSha || getStatusShort() !== "") return { ok: false, reasonCode: "source_failure_fix_not_adoptable" };
      const liveHead = getRefSha("HEAD");
      if (liveHead === continuation.identity.headSha) return { ok: false, reasonCode: "source_failure_fix_not_applied" };
      const changedFiles = listChangedFiles(continuation.identity.baseSha, liveHead);
      if (filterForbiddenChangedFiles(changedFiles, laneDecision).length > 0) return { ok: false, reasonCode: "source_failure_fix_adoption_out_of_contract" };
      return { ok: true, sourceChanged: true, identity: ordinaryIdentityForHead(continuation.identity.baseSha, liveHead), evidence: { adoptedCommit: liveHead, batchIdentity: intent.batchIdentity } };
    },
    source_failure_fix: async (continuation, { batch, intent }) => {
      operationalCheckpoint?.("ordinary_recovery_source_failure_fix_intent", { batchIdentity: batch.batchIdentity, candidateHead: continuation.identity.headSha });
      const findings = batch.findings.map((finding) => ({
        provider: finding.sourceKind,
        severity: "high",
        path: finding.path || continuation.identity.changedFiles[0] || "",
        title: `${finding.sourceKind} source failure`,
        body: finding.diagnosticExcerpt || finding.diagnosticDigest,
        safelyFixable: true,
      }));
      const promptInfo = { promptPath: null, ...(state.sessionLifecycle ? { sessionLifecycle: { state: state.sessionLifecycle } } : {}) };
      const fixAttempt = await runReviewFixCycle(config, {
        issue,
        laneDecision,
        branchName: continuation.branchName,
        promptInfo,
        changedFiles: continuation.identity.changedFiles,
        forbiddenChangedFiles: [],
        validation: context.validation,
        report: { found: true, recovered: true },
        externalReview: null,
        review: { verdict: { verdict: "changes_requested", recommended_next_action: "run_safe_fix_cycle", blocking_findings: findings } },
        reviewConvergenceState: state.reviewConvergenceState,
        sourceFailureFix: { batch, decision, candidateHead: continuation.identity.headSha, baseSha: continuation.identity.baseSha },
      });
      if (!fixAttempt.proceeded) return { ok: false, reasonCode: fixAttempt.reason || "source_failure_fix_not_proceeded" };
      const postFix = await commitReviewFixAndRerunExactHeadReviews(config, { issue, laneDecision, promptInfo, report: { found: true, recovered: true }, fixAttempt, branchName: continuation.branchName, commitMessage: `Auto-runner issue #${issue.number}: source-fix ${batch.batchIdentity.slice(0, 16)}` });
      if (!postFix.runnerCreatedCommitSha || postFix.runnerCreatedCommitSha === continuation.identity.headSha || postFix.forbiddenChangedFiles?.length) {
        return { ok: false, reasonCode: "source_failure_fix_candidate_invalid" };
      }
      operationalCheckpoint?.("ordinary_recovery_source_failure_fix_complete", { batchIdentity: batch.batchIdentity, newHead: postFix.runnerCreatedCommitSha });
      return { ok: true, sourceChanged: true, identity: ordinaryIdentityForHead(continuation.identity.baseSha, postFix.runnerCreatedCommitSha), evidence: { commit: postFix.runnerCreatedCommitSha, batchIdentity: intent.batchIdentity } };
    },
    external_review: async (continuation) => {
      operationalCheckpoint?.("ordinary_recovery_external_review");
      const candidate = continuation.identity;
      const before = await checkoutFingerprint();
      const changedFiles = candidate.changedFiles;
      context.reviewPackage = await writeReviewPackage(config, { issue, promptInfo: { promptPath: null }, laneDecision, changedFiles, validation: context.validation || state.evidence?.localValidation, report: { found: true, recovered: true }, diffBaseRef: candidate.baseSha, diffHeadRef: candidate.headSha });
      context.externalReview = await runIntegratedReviewSource(config, context.reviewPackage, "startup-recovery");
      operationalCheckpoint?.("ordinary_recovery_external_review_complete", { externalReview: context.externalReview });
      if (compareFingerprints(before, await checkoutFingerprint()).mutationDetected) return { ok: false, reasonCode: "ordinary_continuation_external_review_mutated_checkout" };
      const manual = recoveredReviewerManualVerdict(context.externalReview);
      if (manual) return { ok: false, outcome: manual, reasonCode: context.externalReview.reason || `ordinary_continuation_external_review_${manual}` };
      return { ok: true, evidence: { status: context.externalReview.status === "pass" ? "passed" : "changes_requested", evidencePath: context.externalReview.reportPath, review: ordinaryReviewerCheckpoint(context.externalReview, "external") } };
    },
    codex_review: async (continuation) => {
      operationalCheckpoint?.("ordinary_recovery_local_codex_review");
      const candidate = continuation.identity;
      const before = await checkoutFingerprint();
      context.reviewPackage ||= await writeReviewPackage(config, { issue, promptInfo: { promptPath: null }, laneDecision, changedFiles: candidate.changedFiles, validation: context.validation || state.evidence?.localValidation, report: { found: true, recovered: true }, diffBaseRef: candidate.baseSha, diffHeadRef: candidate.headSha });
      context.review = runReviewPrompt(config, context.reviewPackage);
      operationalCheckpoint?.("ordinary_recovery_local_codex_review_complete", { review: context.review });
      if (compareFingerprints(before, await checkoutFingerprint()).mutationDetected) return { ok: false, reasonCode: "ordinary_continuation_codex_review_mutated_checkout" };
      const manual = recoveredReviewerManualVerdict(context.review);
      if (manual) return { ok: false, outcome: manual, reasonCode: context.review?.reviewFailureReason || `ordinary_continuation_codex_review_${manual}` };
      return { ok: true, evidence: { status: context.review?.verdict?.verdict === "approve" ? "passed" : "changes_requested", evidencePath: context.review.logPath, review: ordinaryReviewerCheckpoint(context.review, "codex") } };
    },
    structured_review: async (continuation) => {
      operationalCheckpoint?.("ordinary_recovery_structured_review");
      const candidate = continuation.identity;
      if (!context.externalReview || !context.review) return { ok: false, reasonCode: "ordinary_continuation_reviewer_checkpoint_missing" };
      if (context.externalReview?.route?.largeCandidateRouting?.route !== "large_bundle_escalation") return { ok: true, evidence: { route: "normal" } };
      const before = await checkoutFingerprint();
      const iteration = { issue, baseOriginMainSha: candidate.baseSha, runnerCreatedCommitSha: candidate.headSha, reviewPackage: context.reviewPackage, externalReview: context.externalReview, review: context.review };
      context.largeCandidateReview = await certifyNormalCumulativeLargeReview(config, iteration, candidate.changedFiles);
      operationalCheckpoint?.("ordinary_recovery_structured_review_complete", { largeCandidateReview: context.largeCandidateReview });
      if (compareFingerprints(before, await checkoutFingerprint()).mutationDetected) return { ok: false, reasonCode: "ordinary_continuation_structured_review_mutated_checkout" };
      const manual = structuredLargeCandidateManualVerdict(context.largeCandidateReview);
      const findings = ordinaryStructuredFindings(context.largeCandidateReview);
      return manual ? { ok: false, outcome: manual, reasonCode: context.largeCandidateReview.reasonCode || `ordinary_continuation_structured_review_${manual}` } : { ok: true, evidence: { status: context.largeCandidateReview.ok ? "passed" : "changes_requested", reasonCode: context.largeCandidateReview.reasonCode || null, findings, state: context.largeCandidateReview.state } };
    },
    review_convergence: async (continuation) => {
      const candidate = continuation.identity;
      if (context.externalReview?.status === "pass" && context.review?.verdict?.verdict === "approve" && (!context.largeCandidateReview || context.largeCandidateReview.ok)) return { ok: true, evidence: { exactHeadReviewPassed: true } };
      const promptInfo = { promptPath: null, ...(state.sessionLifecycle ? { sessionLifecycle: { state: state.sessionLifecycle } } : {}) };
      const structuredFindings = context.largeCandidateReview?.ok === false ? ordinaryStructuredFindings(context.largeCandidateReview) : [];
      const reviewForFix = structuredFindings.length ? { ...context.review, verdict: { verdict: "changes_requested", recommended_next_action: "run_safe_fix_cycle", blocking_findings: structuredFindings } } : context.review;
      operationalCheckpoint?.("ordinary_recovery_review_convergence");
      const fixAttempt = await runReviewFixCycle(config, { issue, laneDecision, branchName: state.branch.name, promptInfo, changedFiles: candidate.changedFiles, forbiddenChangedFiles: [], validation: context.validation, report: { found: true, recovered: true }, externalReview: context.externalReview, review: reviewForFix, largeCandidateReview: context.largeCandidateReview, reviewConvergenceState: state.reviewConvergenceState });
      if (!fixAttempt.proceeded) return { ok: false, outcome: "review_convergence_required", reasonCode: fixAttempt.reason || "ordinary_continuation_review_fix_blocked" };
      const postFix = await commitReviewFixAndRerunExactHeadReviews(config, {
        issue,
        laneDecision,
        promptInfo,
        report: { found: true, recovered: true },
        fixAttempt,
        headChangeCheckpoint: async (headSha) => {
          const changedFiles = listChangedFiles(candidate.baseSha, headSha);
          const next = createOrdinaryContinuationState({
            logicalTaskKey: continuation.logicalTaskKey,
            executionKey: continuation.executionKey,
            issueNumber: continuation.issueNumber,
            branchName: continuation.branchName,
            identity: { baseSha: candidate.baseSha, headSha, treeSha: getRefSha(`${headSha}^{tree}`), diffDigest: createHash("sha256").update(getBoundedDiff(candidate.baseSha, headSha).text).digest("hex"), changedFiles },
            phase: "candidate_reconciliation",
            counters: { ...continuation.counters, sourceRounds: continuation.counters.sourceRounds + 1 },
          });
          await persist(next);
        },
      });
      if (postFix.reviewMutationGuard?.mutationDetected || postFix.externalReview?.status !== "pass" || postFix.review?.verdict?.verdict !== "approve" || postFix.forbiddenChangedFiles?.length) return { ok: false, outcome: "review_convergence_required", reasonCode: "ordinary_continuation_post_fix_recertification_failed" };
      const changedFiles = postFix.changedFiles;
      operationalCheckpoint?.("ordinary_recovery_review_convergence_complete", { validation: postFix.validation, externalReview: postFix.externalReview, review: postFix.review });
      const next = { baseSha: candidate.baseSha, headSha: postFix.runnerCreatedCommitSha, treeSha: getRefSha(`${postFix.runnerCreatedCommitSha}^{tree}`), diffDigest: createHash("sha256").update(getBoundedDiff(candidate.baseSha, postFix.runnerCreatedCommitSha).text).digest("hex"), changedFiles };
      return { ok: true, sourceChanged: true, identity: next };
    },
    push: async (continuation) => {
      operationalCheckpoint?.("ordinary_recovery_push");
      const candidate = continuation.identity;
      const pushed = await pushBranch(config, state.branch.name, { effectContext: state.sessionLifecycle });
      operationalCheckpoint?.("ordinary_recovery_push_complete", { push: pushed });
      return pushed.status === 0 ? { ok: true, evidence: { headSha: candidate.headSha } } : { ok: false, reasonCode: "ordinary_continuation_push_failed" };
    },
    pr_create_or_update: async (continuation) => {
      operationalCheckpoint?.("ordinary_recovery_pr_create_recover");
      context.pr = await openOrUpdatePr(config, issue, state.branch.name, `Recovered exact-head continuation for ${continuation.identity.headSha}.`, { effectContext: state.sessionLifecycle });
      operationalCheckpoint?.("ordinary_recovery_pr_create_recover_complete", { pr: context.pr });
      return context.pr?.url ? { ok: true, evidence: { url: context.pr.url, number: context.pr.number } } : { ok: false, reasonCode: "ordinary_continuation_pr_failed" };
    },
    github_convergence: async (continuation) => {
      operationalCheckpoint?.("ordinary_recovery_github_convergence");
      const candidate = continuation.identity;
      const prEvidence = context.pr || initial.effects?.pr_create_or_update?.evidence || {};
      const prNumber = prEvidence.number || Number(String(prEvidence.url || "").split("/").at(-1));
      if (!Number.isInteger(prNumber)) return { ok: false, reasonCode: "ordinary_continuation_pr_identity_missing" };
      const recoveryConfig = {
        ...config,
        allowExistingPrRecovery: true,
        existingPrRecovery: {
          ...(config.existingPrRecovery || {}),
          [issue.number]: {
            prNumber,
            branchName: state.branch.name,
            expectedHeadSha: candidate.headSha,
            expectedOriginMainSha: candidate.baseSha,
            expectedRepository: config.repositorySlug,
            checkoutReconstructable: true,
            allowStateRebuildFromEvidence: true,
            exactHeadEvidence: { repositorySlug: config.repositorySlug, issueNumber: issue.number, prNumber, taskKey: initial.logicalTaskKey, runnerRunId: state.run?.runId || config.runnerRunId, headSha: candidate.headSha, baseSha: candidate.baseSha, changedFiles: candidate.changedFiles, recoveryStateRebuildable: true },
          },
        },
      };
      const recovered = await recoverExistingPrIfConfigured(recoveryConfig, logger, issue, laneDecision, state, { runId: state.run?.runId || config.runnerRunId, operationalCheckpoint });
      operationalCheckpoint?.("ordinary_recovery_github_convergence_complete", { autoMerge: recovered?.autoMerge || null, pr: recovered?.pr || context.pr });
      if (recovered?.autoMerge?.result === "merged") {
        if (!autoMergeEffectsConfirmed(config, state.sessionLifecycle, recovered.autoMerge)) {
          return { ok: false, reasonCode: "ordinary_continuation_merge_hygiene_unconfirmed" };
        }
        return { ok: true, evidence: compactOrdinaryMergeEvidence(recovered.autoMerge, prNumber) };
      }
      if (recovered?.autoMerge?.strictRecoveryDecision?.nextAction === "resume_ci_wait" || /pending|wait/i.test(recovered?.autoMerge?.reason || recovered?.reason || "")) return { ok: true, wait: true, reasonCode: "github_convergence_pending", evidence: { prNumber } };
      const finalGithubState = recovered?.githubState || recovered?.autoMerge?.finalGithubState || null;
      if (!finalGithubState || (finalGithubState.inspectedHeadSha && finalGithubState.inspectedHeadSha !== candidate.headSha)) return { ok: false, reasonCode: "ordinary_continuation_final_github_inspection_missing_or_stale" };
      const sourceFailures = sourceFailuresFromGithubEvidence(finalGithubState, { repository: config.repositorySlug, issueNumber: issue.number, taskKey: continuation.logicalTaskKey, branchName: continuation.branchName, prNumber, identity: candidate, inContract: true });
      if (sourceFailures.length > 0) return { ok: true, sourceFailures };
      return { ok: false, reasonCode: recovered?.autoMerge?.reason || recovered?.reason || "ordinary_continuation_github_convergence_blocked" };
    },
    merge: async () => ({ ok: true, evidence: { adoptedFromGithubConvergence: true } }),
    post_merge_hygiene: async (continuation) => {
      const evidence = continuation.effects?.github_convergence?.evidence;
      const autoMerge = ordinaryMergeEvidenceAsAutoMerge(evidence);
      return autoMerge.result === "merged" && autoMergeEffectsConfirmed(config, state.sessionLifecycle, autoMerge)
        ? { ok: true, evidence }
        : { ok: false, reasonCode: "ordinary_continuation_post_merge_hygiene_unconfirmed" };
    },
    adoptEffect: async (phase, continuation, adopted) => adoptOrdinaryContinuationEffect(config, issue, phase, continuation, adopted, state.sessionLifecycle),
    onCheckpoint: persist,
  });
  logger.info(`Issue #${issue.number}: ordinary continuation advanced to ${result.state?.phase || result.outcome}.`);
  return { ...result, ordinaryContinuation: result.state, largeCandidateReviewRecovery: checkpoint, state };
}

function adoptOrdinaryContinuationEffect(config, issue, phase, continuation, adopted, sessionLifecycle) {
  const targetDigest = adopted.targetDigest;
  if (phase === "push") {
    const live = spawnSync("git", ["ls-remote", "--heads", "origin", `refs/heads/${continuation.branchName}`], { cwd: config.repoRoot, encoding: "utf8" });
    const head = live.status === 0 && live.stdout.trim() ? live.stdout.trim().split(/\s+/)[0] : null;
    return head === continuation.identity.headSha ? { ok: true, targetDigest } : { ok: false, reasonCode: "ordinary_continuation_push_live_mismatch" };
  }
  if (phase === "pr_create_or_update") {
    const live = spawnSync("gh", ["pr", "list", "--head", continuation.branchName, "--state", "open", "--json", "number,baseRefName,headRefOid"], { cwd: config.repoRoot, encoding: "utf8" });
    let prs = []; try { prs = JSON.parse(live.stdout || "[]"); } catch { return { ok: false, reasonCode: "ordinary_continuation_pr_live_unavailable" }; }
    return live.status === 0 && prs.length === 1 && prs[0].baseRefName === "main" && prs[0].headRefOid === continuation.identity.headSha ? { ok: true, targetDigest } : { ok: false, reasonCode: "ordinary_continuation_pr_live_mismatch" };
  }
  if (phase === "merge") {
    fetchOriginMain(config);
    const proof = spawnSync("git", ["merge-base", "--is-ancestor", continuation.identity.headSha, "origin/main"], { cwd: config.repoRoot, encoding: "utf8" });
    return proof.status === 0 ? { ok: true, targetDigest } : { ok: false, reasonCode: "ordinary_continuation_merge_live_mismatch" };
  }
  if (phase === "github_convergence") {
    fetchOriginMain(config);
    const proof = spawnSync("git", ["merge-base", "--is-ancestor", continuation.identity.headSha, "origin/main"], { cwd: config.repoRoot, encoding: "utf8" });
    const autoMerge = ordinaryMergeEvidenceAsAutoMerge(adopted.evidence);
    return proof.status === 0 && autoMerge.result === "merged" && autoMergeEffectsConfirmed(config, sessionLifecycle, autoMerge)
      ? { ok: true, targetDigest }
      : { ok: false, reasonCode: "ordinary_continuation_github_convergence_live_mismatch" };
  }
  if (phase === "post_merge_hygiene") {
    const autoMerge = ordinaryMergeEvidenceAsAutoMerge(adopted.evidence);
    return autoMerge.result === "merged" && autoMergeEffectsConfirmed(config, sessionLifecycle, autoMerge)
      ? { ok: true, targetDigest }
      : { ok: false, reasonCode: "ordinary_continuation_hygiene_effects_unconfirmed" };
  }
  return { ok: false, reasonCode: `ordinary_continuation_live_adoption_unsupported:${phase}` };
}

function ordinaryIdentityForHead(baseSha, headSha) {
  const changedFiles = listChangedFiles(baseSha, headSha);
  return {
    baseSha,
    headSha,
    treeSha: getRefSha(`${headSha}^{tree}`),
    diffDigest: createHash("sha256").update(getBoundedDiff(baseSha, headSha).text).digest("hex"),
    changedFiles,
    changedFilesDigest: createHash("sha256").update(JSON.stringify([...changedFiles].sort())).digest("hex"),
  };
}

function compactOrdinaryMergeEvidence(autoMerge, prNumber) {
  return {
    result: autoMerge.result,
    mergeSha: autoMerge.mergeSha,
    prNumber,
    mergeReadback: autoMerge.mergeReadback,
    sourceBranchRestoration: autoMerge.sourceBranchRestoration,
    completionHygiene: autoMerge.completionHygiene,
    comments: { pr: autoMerge.comments?.pr },
  };
}

function ordinaryMergeEvidenceAsAutoMerge(evidence = {}) {
  return {
    result: evidence?.result,
    mergeSha: evidence?.mergeSha,
    mergeReadback: evidence?.mergeReadback,
    sourceBranchRestoration: evidence?.sourceBranchRestoration,
    completionHygiene: evidence?.completionHygiene,
    comments: evidence?.comments,
  };
}

function ordinaryReviewerCheckpoint(review = {}, provider) {
  return {
    status: review.status,
    reason: review.reason,
    verdict: review.verdict,
    provider: review.provider || provider,
    tier: review.tier,
    reviewedHead: review.reviewedHead,
    baseSha: review.baseSha,
    changedFilesDigest: review.changedFilesDigest,
    reportPath: review.reportPath,
    logPath: review.logPath,
    route: review.route,
    findings: review.findings,
    attestationSource: review.attestationSource,
    providerPromptBindingDigest: review.providerPromptBindingDigest,
    attestedCandidateIdentity: review.attestedCandidateIdentity,
    attestedIntegrationBoundaries: review.attestedIntegrationBoundaries,
    contextLimited: review.contextLimited,
  };
}

function refreshOrdinaryContinuationAfterSourceChange(config, recoveryRecorder, iteration, issue, branchName, reasonCode) {
  if (!recoveryRecorder || !iteration.runnerCreatedCommitSha) return null;
  const changedFiles = listChangedFiles(iteration.baseOriginMainSha, iteration.runnerCreatedCommitSha);
  const prior = recoveryRecorder.state?.ordinaryContinuation;
  const identity = {
    repository: config.repositorySlug || "tommytang213/Settleora",
    baseSha: iteration.baseOriginMainSha,
    headSha: iteration.runnerCreatedCommitSha,
    treeSha: getRefSha(`${iteration.runnerCreatedCommitSha}^{tree}`),
    diffDigest: createHash("sha256").update(getBoundedDiff(iteration.baseOriginMainSha, iteration.runnerCreatedCommitSha).text).digest("hex"),
    changedFiles,
  };
  const ordinaryContinuation = createOrdinaryContinuationState({
    logicalTaskKey: prior?.logicalTaskKey || config.taskKey || `issue-${issue.number}`,
    executionKey: prior?.executionKey || config.runnerRunId || null,
    issueNumber: issue.number,
    branchName,
    identity,
    phase: "candidate_reconciliation",
    counters: {
      acceptedLogicalTasks: prior?.counters?.acceptedLogicalTasks ?? 1,
      sourceRounds: (prior?.counters?.sourceRounds ?? 0) + 1,
      githubEpochs: prior?.counters?.githubEpochs ?? 0,
    },
  });
  return recoveryRecorder.headChanged(iteration.runnerCreatedCommitSha, reasonCode, { ordinaryContinuation });
}

function ordinaryStructuredReviewCheckpoint(evidence) {
  if (!evidence) return null;
  if (!["passed", "changes_requested"].includes(evidence.status)) return { ok: false, reasonCode: "ordinary_continuation_structured_checkpoint_invalid", findings: [] };
  return { ok: evidence.status === "passed", reasonCode: evidence.reasonCode || null, findings: Array.isArray(evidence.findings) ? evidence.findings : [], state: evidence.state || null };
}

function ordinaryStructuredFindings(review) {
  if (Array.isArray(review?.findings) && review.findings.length) return review.findings;
  return ["gemini", "codex-local"].flatMap((provider) => structuredLargeCandidateFindings(review, provider).map((finding) => ({ ...(typeof finding === "string" ? { summary: finding } : finding), provider })));
}

function loadNormalLargeCandidateRecoveryCheckpoint(config, state) {
  const baseSha = state.branch?.baseSha || state.baseSha || null;
  const headSha = state.branch?.currentHeadSha || state.currentHeadSha || null;
  if (!baseSha || !headSha) return { ok: false, reasonCode: "large_candidate_recovery_identity_missing" };
  const changedFiles = listChangedFiles(baseSha, headSha);
  const diff = getBoundedDiff(baseSha, headSha);
  const candidateIdentity = {
    repository: config.repositorySlug || "tommytang213/Settleora",
    baseSha,
    headSha,
    treeSha: getRefSha(`${headSha}^{tree}`),
    diffDigest: createHash("sha256").update(diff.text).digest("hex"),
    changedFilesDigest: createHash("sha256").update(JSON.stringify([...changedFiles].sort())).digest("hex"),
  };
  const seed = createLargeCandidateRoutingState({ taskKey: state.taskKey || `issue-${state.issue?.number || "unknown"}`, candidateIdentity, changedFiles });
  const loaded = loadLargeCandidateRoutingState(config, seed);
  if (!loaded.ok && loaded.reasonCode === "large_candidate_routing_state_missing") return { ok: true, statePath: loaded.statePath, routeState: "external_review_normal_ready", candidateIdentity, coverageManifest: null, reviewerResults: [], checkpointMissing: true };
  if (!loaded.ok) return loaded;
  return { ok: true, statePath: loaded.statePath, routeState: loaded.state.routeState, candidateIdentity: loaded.state.candidateIdentity, coverageManifest: loaded.state.coverageManifest, reviewerResults: loaded.state.reviewerResults };
}

function recoveredReviewerManualVerdict(evidence) {
  const verdict = evidence?.verdict?.verdict || evidence?.verdict || evidence?.sanitizedResponseSummary?.verdict || null;
  return verdict === "danger_gate" ? "danger_gate" : verdict === "needs_tommy" ? "blocked_needs_tommy" : null;
}

function validateRecoveryOnlyStartupEvidence(config, state) {
  if (!config.outageRecoveryOnly) return { ok: true };
  const issueNumber = state?.issue?.number;
  const recoveryConfig = config.existingPrRecovery?.[issueNumber] || config.existingPrRecovery?.[String(issueNumber)] || null;
  if (!recoveryConfig) {
    return { ok: false, reason: "recovery_existing_pr_context_missing" };
  }
  const targetCheck = validateRecoveryOnlyExistingPrTarget(config, recoveryConfig);
  if (!targetCheck.ok) return targetCheck;
  const exactHeadEvidence = recoveryConfig.exactHeadEvidence;
  return validateRecoveryOnlyExactHeadEvidence(config, recoveryConfig, {
    expectedHeadSha: recoveryConfig.expectedHeadSha || exactHeadEvidence?.headSha || null,
    changedFiles: exactHeadEvidence?.changedFiles || null,
  });
}

async function recoverExistingPrIfConfigured(config, logger, issue, laneDecision, recoveryState = null, lifecycleInput = {}) {
  const operationalCheckpoint = (phase, projected = {}) => lifecycleInput.operationalCheckpoint?.(phase, projected);
  if (!config.allowExistingPrRecovery) return null;
  const recoveryConfig = config.existingPrRecovery?.[issue.number] || config.existingPrRecovery?.[String(issue.number)] || null;
  if (!recoveryConfig) return null;
  let sessionLifecycle = recoveryState?.sessionLifecycle || null;
  if (!config.dryRun && config.sessionLifecycle?.enabled === true && !sessionLifecycle) {
    const configuredEvidence = recoveryConfig.exactHeadEvidence || {};
    const lifecycleRunId = lifecycleInput.runId || configuredEvidence.runnerRunId || config.outageRecoveryTarget?.runnerRunId || `existing-pr-${issue.number}`;
    const lifecycleTaskKey = configuredEvidence.taskKey || config.outageRecoveryTarget?.taskKey || `existing-pr-${issue.number}`;
    const lifecycleHead = recoveryConfig.expectedHeadSha || configuredEvidence.headSha || config.outageRecoveryTarget?.currentHeadSha;
    const lifecycleBranch = recoveryConfig.branchName || config.outageRecoveryTarget?.branchName;
    fetchOriginMain(config);
    const lifecycleBase = recoveryConfig.expectedOriginMainSha || configuredEvidence.baseSha || config.outageRecoveryTarget?.baseSha || getRefSha("origin/main");
    if (!/^[a-f0-9]{40}$/.test(String(lifecycleHead || "")) || !/^[a-f0-9]{40}$/.test(String(lifecycleBase || "")) || !lifecycleBranch) {
      return { reason: "existing_pr_lifecycle_identity_incomplete", terminalMutationBlocked: true, autoMerge: { result: "blocked", reason: "existing_pr_lifecycle_identity_incomplete" } };
    }
    const lifecycle = createSessionLifecycleState({
      repository: config.repositorySlug,
      issueNumber: issue.number,
      taskKey: lifecycleTaskKey,
      runId: lifecycleRunId,
      claimIdentity: `${config.repositorySlug}#${issue.number}`,
      chargeMarkerRef: lifecycleInput.chargeMarkerRef || recoveryState?.logicalTaskBudget?.chargeId || `accepted:${lifecycleRunId}:${issue.number}`,
      sessionId: `${lifecycleRunId}:existing-pr:${lifecycleInput.index || 0}`,
      branchName: lifecycleBranch,
      baseSha: lifecycleBase,
      headSha: lifecycleHead,
      phase: "exact_head_final_refresh",
      nextExactAction: "evaluate_existing_pr_merge",
      contextPolicy: config.sessionLifecycle.contextBudget,
      reservations: recoveryState?.mutationMarkers || {},
      evidence: recoveryState?.evidence || {},
      reportCorrelationKey: lifecycleTaskKey,
    });
    const persisted = persistSessionLifecycleState(config, lifecycle);
    if (!persisted.ok) return { reason: persisted.reasonCode, terminalMutationBlocked: true, autoMerge: { result: "blocked", reason: persisted.reasonCode } };
    sessionLifecycle = persisted.state;
  }
  if (sessionLifecycle) issue.sessionLifecycle = sessionLifecycle;
  const targetCheck = validateRecoveryOnlyExistingPrTarget(config, recoveryConfig);
  if (!targetCheck.ok) {
    return { reason: targetCheck.reason, autoMerge: { result: "blocked", reason: targetCheck.reason } };
  }
  logger.info(`Issue #${issue.number}: evaluating configured existing-PR recovery for PR ${recoveryConfig.prNumber || recoveryConfig.prUrl}.`);
  if (!config.allowAutoMerge) {
    return { reason: "existing_pr_recovery_requires_allow_auto_merge", autoMerge: { result: "blocked", reason: "auto_merge_disabled_by_config" } };
  }
  fetchOriginMain(config);
  const baseOriginMainSha = getRefSha("origin/main");
  const autoMergeRunner = config.dryRun ? null : createLiveFixedArgvRunner(config);
  operationalCheckpoint("existing_pr_live_reconciliation");
  const githubState = inspectAutoMergeGithubState(config, { issue, prUrlOrNumber: recoveryConfig.prNumber || recoveryConfig.prUrl, laneDecision }, { runner: autoMergeRunner });
  operationalCheckpoint("existing_pr_live_reconciliation_complete", { pr: githubState.pr || null });
  const prNumber = githubState.pr?.number || recoveryConfig.prNumber || recoveryConfig.prUrl;
  const changedFiles = Array.isArray(recoveryConfig.changedFiles) && recoveryConfig.changedFiles.length > 0
    ? recoveryConfig.changedFiles
    : readPrChangedFiles(config, prNumber);
  let canonicalChangedFiles = changedFiles;
  let canonicalChangedFilesDigest = null;
  try {
    canonicalChangedFiles = canonicalizeChangedFiles(changedFiles);
    canonicalChangedFilesDigest = digestChangedFiles(canonicalChangedFiles);
  } catch {
    canonicalChangedFiles = changedFiles;
  }
  const forbidden = filterForbiddenChangedFiles(changedFiles, laneDecision);
  let exactHeadEvidence = recoveryConfig.exactHeadEvidence || {};
  const expectedHeadSha = recoveryConfig.expectedHeadSha || exactHeadEvidence.headSha || githubState.pr?.headRefOid || null;
  const prMetadata = {
    ...(githubState.pr || {}),
    body: recoveryConfig.prBody ?? githubState.pr?.body,
    title: recoveryConfig.prTitle ?? githubState.pr?.title,
  };
  const exactEvidenceCheck = validateRecoveryOnlyExactHeadEvidence(config, recoveryConfig, { expectedHeadSha, changedFiles });
  if (!exactEvidenceCheck.ok) {
    return {
      reason: exactEvidenceCheck.reason,
      pr: prMetadata,
      changedFiles,
      validation: { passed: false, recovered: true, reason: exactEvidenceCheck.reason },
      review: null,
      externalReview: { status: "blocked", reason: exactEvidenceCheck.reason },
      generatedRecoveryEvidence: null,
      baseOriginMainSha,
      expectedHeadSha,
      autoMerge: { result: "blocked", reason: exactEvidenceCheck.reason, recovery: true },
    };
  }
  let generatedRecoveryEvidence = null;
  if (shouldGenerateExistingPrRecoveryEvidence(laneDecision, exactHeadEvidence)) {
    operationalCheckpoint("existing_pr_evidence_regeneration");
    generatedRecoveryEvidence = await generateExistingPrRecoveryEvidence(config, {
      issue,
      laneDecision,
      pr: prMetadata,
      changedFiles,
      expectedHeadSha,
    });
    operationalCheckpoint("existing_pr_evidence_regeneration_complete", {
      validation: generatedRecoveryEvidence.validation || null,
      review: generatedRecoveryEvidence.review || null,
      externalReview: generatedRecoveryEvidence.externalReview || null,
    });
    if (generatedRecoveryEvidence.sessionLifecycle) {
      sessionLifecycle = generatedRecoveryEvidence.sessionLifecycle;
      issue.sessionLifecycle = sessionLifecycle;
    }
    exactHeadEvidence = {
      ...exactHeadEvidence,
      repositorySlug: config.repositorySlug,
      issueNumber: issue.number,
      prNumber: recoveryConfig.prNumber,
      baseSha: config.outageRecoveryTarget?.baseSha || exactHeadEvidence.baseSha || null,
      taskKey: config.outageRecoveryTarget?.taskKey || exactHeadEvidence.taskKey || null,
      runnerRunId: config.outageRecoveryTarget?.runnerRunId || exactHeadEvidence.runnerRunId || null,
      supervisorRunId: config.outageRecoveryTarget?.supervisorRunId || exactHeadEvidence.supervisorRunId || null,
      headSha: expectedHeadSha,
      changedFiles: canonicalChangedFiles,
      validationPassed: generatedRecoveryEvidence.validation?.passed === true,
      geminiPass: generatedRecoveryEvidence.externalReview?.status === "pass",
      geminiHeadSha: expectedHeadSha,
      geminiChangedFiles: canonicalChangedFiles,
      geminiChangedFilesDigest: generatedRecoveryEvidence.externalReview?.changedFilesDigest || null,
      geminiProvider: generatedRecoveryEvidence.externalReview?.provider || exactHeadEvidence.geminiProvider || null,
      geminiTier: generatedRecoveryEvidence.externalReview?.tier || exactHeadEvidence.geminiTier || null,
      geminiCompletedAt: generatedRecoveryEvidence.externalReview?.completedAt || null,
      geminiBudget: generatedRecoveryEvidence.externalReview?.budget || null,
      geminiEvidencePath:
        generatedRecoveryEvidence.externalReview?.reportPath ||
        generatedRecoveryEvidence.externalReview?.evidencePath ||
        exactHeadEvidence.geminiEvidencePath ||
        null,
      codexMechanicsApproved: generatedRecoveryEvidence.review?.verdict?.verdict === "approve",
      codexMechanicsHeadSha: expectedHeadSha,
      codexMechanicsChangedFiles: canonicalChangedFiles,
      codexMechanicsChangedFilesDigest: generatedRecoveryEvidence.review?.changedFilesDigest || null,
      codexMechanicsCompletedAt: generatedRecoveryEvidence.review?.completedAt || null,
      codexMechanicsEvidencePath: generatedRecoveryEvidence.review?.logPath || generatedRecoveryEvidence.review?.promptPath || null,
      codexMechanicsFailureReason: generatedRecoveryEvidence.review?.reviewFailureReason || null,
      codexMechanicsFailureCategory: generatedRecoveryEvidence.review?.reviewFailureCategory || null,
      codexMechanicsAttemptCount: generatedRecoveryEvidence.review?.attemptCount || null,
      validationResults: generatedRecoveryEvidence.validation?.results || null,
      validationCompletedAt: generatedRecoveryEvidence.validation?.completedAt || null,
      changedFilesDigest: generatedRecoveryEvidence.validation?.changedFilesDigest || null,
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
          baseSha: exactHeadEvidence.baseSha || recoveryConfig.expectedOriginMainSha || baseOriginMainSha,
          changedFiles: exactHeadEvidence.geminiChangedFiles || changedFiles,
          changedFilesDigest: exactHeadEvidence.geminiChangedFilesDigest || exactHeadEvidence.changedFilesDigest || null,
          provider: exactHeadEvidence.geminiProvider || "gemini",
          tier: exactHeadEvidence.geminiTier || "cheap_independent",
          independent: true,
          completedAt: exactHeadEvidence.geminiCompletedAt || exactHeadEvidence.completedAt || null,
          budget: exactHeadEvidence.geminiBudget || null,
          reportPath: exactHeadEvidence.geminiEvidencePath || null,
        }
      : { status: "blocked", reason: "missing_recovered_exact_head_gemini_evidence" },
    review: generatedRecoveryEvidence?.review ||
      (exactHeadEvidence.codexMechanicsApproved
        ? {
            verdict: { verdict: "approve" },
            reviewedHead: exactHeadEvidence.codexMechanicsHeadSha || exactHeadEvidence.headSha || null,
            baseSha: exactHeadEvidence.baseSha || recoveryConfig.expectedOriginMainSha || baseOriginMainSha,
            changedFiles: exactHeadEvidence.codexMechanicsChangedFiles,
            changedFilesDigest: exactHeadEvidence.codexMechanicsChangedFilesDigest || exactHeadEvidence.changedFilesDigest || null,
            completedAt: exactHeadEvidence.codexMechanicsCompletedAt || exactHeadEvidence.completedAt || null,
            logPath: exactHeadEvidence.codexMechanicsEvidencePath || null,
          }
        : null),
    codexMechanicsReviewApproved: Boolean(exactHeadEvidence.codexMechanicsApproved),
    validation: exactHeadEvidence.validationPassed
      ? bindValidationEvidence(
          {
            passed: true,
            recovered: true,
            results: exactHeadEvidence.validationResults,
            completedAt: exactHeadEvidence.validationCompletedAt || exactHeadEvidence.completedAt || null,
          },
          {
            headSha: expectedHeadSha,
            baseSha: recoveryConfig.expectedOriginMainSha || baseOriginMainSha,
            changedFiles,
            profile: laneDecision.validationProfile,
          },
        )
      : { passed: false, recovered: true },
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
    sessionLifecycle,
  };
  const strictRecoveryDecision = evaluateExistingPrRecovery({
    allowExistingPrRecovery: config.allowExistingPrRecovery,
    allowStateRebuildFromEvidence: Boolean(recoveryConfig.allowStateRebuildFromEvidence || exactHeadEvidence.recoveryStateRebuildable),
    issue: context.issue,
    pr: context.pr,
    laneDecision,
    changedFiles,
    forbiddenChangedFiles: forbidden,
    evidence: {
      validation: context.validation?.passed
        ? {
            status: "passed",
            headSha: expectedHeadSha,
            changedFilesDigest: context.validation.changedFilesDigest || exactHeadEvidence.changedFilesDigest || null,
          }
        : null,
      externalReview: context.externalReview?.status === "pass"
        ? {
            status: "passed",
            headSha: context.externalReview.reviewedHead || expectedHeadSha,
            tier: context.externalReview.tier || exactHeadEvidence.geminiTier,
            changedFilesDigest: context.externalReview.changedFilesDigest || exactHeadEvidence.changedFilesDigest || null,
          }
        : null,
      codexReview: context.review?.verdict?.verdict === "approve"
        ? {
            status: "passed",
            headSha: context.review.reviewedHead || expectedHeadSha,
            changedFilesDigest: context.review.changedFilesDigest || exactHeadEvidence.changedFilesDigest || null,
          }
        : null,
    },
    recoveryState,
    worktreeClean: context.worktreeClean,
    checkoutReconstructable: Boolean(recoveryConfig.checkoutReconstructable),
    expectedRepository: recoveryConfig.expectedRepository || "tommytang213/Settleora",
    expectedHeadSha,
    conflictingPrCount: githubState.conflictingPrCount || 0,
    ambiguousPrCount: githubState.ambiguousPrCount || 0,
    ciStatus: githubState.checkConclusion === "PENDING" || githubState.checkStatus === "pending" ? "pending" : null,
    mergeConfirmed: githubState.pr?.state === "MERGED",
    postMergeCurrentMainEvidence: exactHeadEvidence.postMergeCurrentMainEvidence || null,
  });
  if (!strictRecoveryDecision.ok || strictRecoveryDecision.nextAction === "regenerate_exact_head_evidence") {
    const blocked = {
      eligible: false,
      result: "blocked",
      reason: strictRecoveryDecision.reasonCode,
      recovery: true,
      strictRecoveryDecision,
      evidence: writeAutoMergeEvidence(config, { result: "blocked", reason: strictRecoveryDecision.reasonCode }, context),
    };
    return {
      reason: strictRecoveryDecision.reasonCode,
      pr: context.pr,
      changedFiles,
      validation: context.validation,
      review: context.review,
      externalReview: context.externalReview,
      generatedRecoveryEvidence,
      baseOriginMainSha,
      expectedHeadSha,
      githubState,
      autoMerge: blocked,
    };
  }
  const recoveryDecision = evaluateAutoMergeDecision(context);
  if (!recoveryDecision.eligible && strictRecoveryDecision.nextAction !== "resume_ci_wait") {
    const blocked = { ...recoveryDecision, recovery: true, strictRecoveryDecision, evidence: writeAutoMergeEvidence(config, recoveryDecision, context) };
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
      githubState,
      autoMerge: blocked,
    };
  }
  operationalCheckpoint("existing_pr_merge_evaluation", { pr: context.pr, validation: context.validation, review: context.review, externalReview: context.externalReview });
  const autoMerge = executeAutoMerge(config, context, {
    runner: autoMergeRunner,
    inspectState: (cfg, ctx) => inspectAutoMergeGithubState(cfg, { issue: ctx.issue, prUrlOrNumber: ctx.pr?.number || ctx.pr?.url, laneDecision }, { runner: autoMergeRunner }),
  });
  operationalCheckpoint("existing_pr_merge_evaluation_complete", { autoMerge });
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
    githubState: autoMerge.finalGithubState || githubState,
    sessionLifecycle,
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
    const review = externalReview.status === "pass" ? runReviewPrompt(config, { ...reviewPackage, sessionLifecycle: issue.sessionLifecycle || null }) : null;
    return {
      reason: "recovery_evidence_generated",
      validation,
      reviewPackage,
      externalReview,
      review,
      sessionLifecycle: review?.sessionLifecycle || issue.sessionLifecycle || null,
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

function createLiveFixedArgvRunner(config = {}) {
  const repositorySlug = String(config.repositorySlug || "");
  const repoRoot = path.resolve(config.repoRoot || process.cwd());
  const maxOutputBytes = Number.isInteger(config.prStackExecution?.runnerMaxOutputBytes)
    ? Math.max(1024, Math.min(config.prStackExecution.runnerMaxOutputBytes, 1024 * 1024))
    : 128 * 1024;
  const timeoutMs = Number.isInteger(config.prStackExecution?.runnerTimeoutMs)
    ? Math.max(1000, Math.min(config.prStackExecution.runnerTimeoutMs, 120000))
    : 30000;
	  const runner = (command, args = [], options = {}) => {
	    const startedAt = new Date().toISOString();
	    if (typeof command !== "string" || command.trim() !== command || command.length === 0 || /\s/.test(command)) {
	      return { status: 1, stdout: "", stderr: "fixed_argv_command_required", error: "fixed_argv_command_required" };
    }
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
      return { status: 1, stdout: "", stderr: "fixed_argv_args_required", error: "fixed_argv_args_required" };
    }
    if (options.shell === true) {
      return { status: 1, stdout: "", stderr: "shell_execution_refused", error: "shell_execution_refused" };
    }
    const cwd = path.resolve(options.cwd || repoRoot);
	    const result = spawnSync(command, args, {
      cwd,
      input: typeof options.input === "string" || Buffer.isBuffer(options.input) ? options.input : undefined,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      timeout: options.timeoutMs || timeoutMs,
	      maxBuffer: maxOutputBytes,
	    });
	    const stdout = boundRunnerOutput(result.stdout || "", maxOutputBytes);
	    const stderr = boundRunnerOutput(result.stderr || "", maxOutputBytes);
	    const error = result.error?.message ? sanitizeRunnerOutputEvidence(result.error.message, 2000) : null;
	    const completedAt = new Date().toISOString();
	    const stdoutEvidence = sanitizeRunnerOutputEvidence(stdout, 1000);
	    const stderrEvidence = sanitizeRunnerOutputEvidence(stderr, 1000);
	    return {
	      status: result.status ?? (result.error ? 1 : 0),
	      stdout,
	      stderr,
	      error,
	      commandEvidence: {
	        runnerIdentity: runner.settleoraRunnerIdentity,
	        command,
	        args: args.map((arg) => sanitizeRunnerArg(arg)),
	        cwd,
	        repositorySlug,
	        startedAt,
	        completedAt,
	        timeoutMs: options.timeoutMs || timeoutMs,
	        maxOutputBytes,
	        status: result.status ?? (result.error ? 1 : 0),
	        signal: result.signal || null,
	        error,
	        stdoutSha256: createHash("sha256").update(stdout).digest("hex"),
	        stderrSha256: createHash("sha256").update(stderr).digest("hex"),
	        stdoutExcerpt: stdoutEvidence,
	        stderrExcerpt: stderrEvidence,
	      },
	    };
	  };
  runner.settleoraFixedArgvRunner = true;
  runner.settleoraRunnerMode = "live";
  runner.settleoraRunnerIdentity = {
    kind: "live-fixed-argv",
    repositorySlug,
    repoRoot,
    timeoutMs,
    maxOutputBytes,
  };
  return runner;
}

function createLivePrStackReviewAdapters(config) {
  const buildPackage = async ({ reviewPhase, pr, changedFiles, validation, headSha, baseSha, fullCandidatePrDelta, externalReview = null }) => {
    const mechanicsPhase = reviewPhase === "pr-stack-final-codex-exact-head";
    const incomingLaneDecision = fullCandidatePrDelta?.laneDecision || validation?.laneDecision || { lane: "workflow-docs-tooling" };
    const incomingContract = incomingLaneDecision.contract || {};
    const manualMergeRequired = incomingContract.manualMergeRequired ?? incomingLaneDecision.manualMergeRequired ?? true;
    const autoMergeEligible = incomingContract.autoMergeEligible ?? incomingLaneDecision.autoMergeEligible ?? false;
    return writeReviewPackage(config, {
    reviewPhase,
    issue: pr?.issue || config.prStackIssue || { number: pr?.issueNumber || pr?.number || 921, title: pr?.title || `PR #${pr?.number || "unknown"}`, labels: [] },
    promptInfo: { promptPath: `pr-stack:${reviewPhase}:pr-${pr?.number || "unknown"}:${headSha || "unknown"}` },
    laneDecision: {
      ...incomingLaneDecision,
      validationProfile: validation?.profile || fullCandidatePrDelta?.laneDecision?.validationProfile || validation?.laneDecision?.validationProfile || "runner-tests",
      reviewerTier: "strong_independent",
      manualMergeRequired,
      autoMergeEligible,
      contract: {
        ...incomingContract,
        manualMergeRequired,
        autoMergeEligible,
      },
    },
    changedFiles,
    validation,
    manualMergeRequired,
    autoMergeEligible,
    report: { found: true, expectedPath: `pr-stack:${reviewPhase}` },
    headSha,
    baseSha,
    externalReview: mechanicsPhase && externalReview ? {
      status: externalReview.status,
      verdict: externalReview.verdict,
      tier: externalReview.tier,
      provider: externalReview.provider,
      providerProfile: externalReview.providerProfile,
      model: externalReview.model,
      reviewedHead: externalReview.reviewedHead,
      baseSha: externalReview.baseSha,
      changedFilesDigest: externalReview.changedFilesDigest,
      reportPath: externalReview.reportPath,
      completedAt: externalReview.completedAt,
      independent: externalReview.independent,
    } : externalReview,
    fullCandidatePrDelta,
    reviewFixMechanicsContext: mechanicsPhase ? {
      objective: "Converge and merge the exact-head PR #919 -> PR #920 development-stage stack through protected controller gates while PR #917 remains frozen.",
      humanDirectedMergeGate: true,
      taskKey: config.taskKey || null,
      exactHead: headSha,
      exactBase: baseSha,
      currentTaskSupersedesOlderShaProse: true,
      githubChecksAndScannersAreSubsequentOuterControllerGates: true,
      reportFinalizationOccursAfterLiveReadback: true,
      forbiddenScope: "product runtime/API/auth/security/money/schema/deployment/storage/client/secrets",
    } : null,
    diffBaseRef: baseSha,
    diffHeadRef: headSha,
    });
  };
  return {
    runStrongReview: async ({ pr, changedFiles, validation, headSha, baseSha, fullCandidatePrDelta }) => {
      const reviewPackage = await buildPackage({ reviewPhase: "pr-stack-final-strong-exact-head", pr, changedFiles, validation, headSha, baseSha, fullCandidatePrDelta });
      const review = await runIntegratedReviewSource(config, reviewPackage, "pr-stack-final-strong-exact-head");
      return {
        ...review,
        reviewedHead: review.reviewedHead || headSha,
        reviewedBaseSha: review.reviewedBaseSha,
        baseSha: review.baseSha || baseSha,
        changedFiles: review.changedFiles || changedFiles,
        changedFilesDigest: review.changedFilesDigest || digestRunnerStringSet(changedFiles),
        fullCandidatePrDelta: review.fullCandidatePrDelta || fullCandidatePrDelta,
      };
    },
    runCodexReview: async ({ pr, changedFiles, validation, externalReview, headSha, baseSha, fullCandidatePrDelta, sessionLifecycle = null }) => {
      const reviewPackage = await buildPackage({ reviewPhase: "pr-stack-final-codex-exact-head", pr, changedFiles, validation, headSha, baseSha, fullCandidatePrDelta, externalReview });
      const review = runReviewPrompt(config, { ...reviewPackage, sessionLifecycle });
      return {
        ...review,
        reviewedHead: review.reviewedHead || headSha,
        reviewedBaseSha: review.reviewedBaseSha,
        baseSha: review.baseSha || baseSha,
        changedFiles: review.changedFiles || changedFiles,
        changedFilesDigest: review.changedFilesDigest || digestRunnerStringSet(changedFiles),
        fullCandidatePrDelta: review.fullCandidatePrDelta || fullCandidatePrDelta,
      };
    },
  };
}

function boundRunnerOutput(value, max = 128 * 1024) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}[truncated]` : text;
}

function sanitizeRunnerOutputEvidence(value, max = 128 * 1024) {
  const text = boundRunnerOutput(value, max).replace(/[A-Za-z0-9_=-]{32,}/g, "[redacted]");
  return text.length > max ? `${text.slice(0, max)}[truncated]` : text;
}

function sanitizeRunnerArg(value) {
  const text = String(value || "");
  const bounded = text.length > 240 ? `${text.slice(0, 240)}[truncated]` : text;
  return bounded.replace(/[A-Za-z0-9_=-]{32,}/g, "[redacted]");
}

function digestRunnerStringSet(values = []) {
  return createHash("sha256").update(values.map((value) => String(value || "")).filter(Boolean).sort().join("\n")).digest("hex");
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
    sessionLifecycle: iteration.sessionLifecycle || null,
  };
  if (!config.allowAutoMerge) {
    const decision = evaluateAutoMergeDecision(baseContext);
    return { ...decision, evidence: writeAutoMergeEvidence(config, decision, baseContext) };
  }
  if (!config.dryRun) {
    fetchOriginMain(config);
    baseContext.currentOriginMainSha = getRefSha("origin/main");
  }
  const autoMergeRunner = config.dryRun ? null : createLiveFixedArgvRunner(config);
  const githubState =
    config.dryRun || !iteration.pr?.url
      ? {}
      : inspectAutoMergeGithubState(config, { issue, prUrlOrNumber: iteration.pr.url, laneDecision: iteration.laneDecision }, { runner: autoMergeRunner });
  return executeAutoMerge(config, {
    ...baseContext,
    ...githubState,
    issue: githubState.issue || baseContext.issue,
    pr: { ...baseContext.pr, ...(githubState.pr || {}) },
    requiredChecks: githubState.requiredChecks || baseContext.requiredChecks,
    reviewThreads: githubState.reviewThreads || baseContext.reviewThreads,
    codeScanningAlerts: githubState.codeScanningAlerts || baseContext.codeScanningAlerts,
    blockingMarkers: githubState.blockingMarkers || baseContext.blockingMarkers,
  }, { runner: autoMergeRunner });
}

async function runReviewFixCycle(config, context) {
  const trigger = extractReviewFixTrigger(context);
  const decision = context.sourceFailureFix
    ? evaluateSourceFailureFixMutationDecision({ ...context, config, trigger })
    : evaluateReviewFixMutationDecision({ ...context, config, trigger });
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
  let reviewFixLifecycle = null;
  if (context.promptInfo?.sessionLifecycle) {
    const synchronized = synchronizeSessionLifecycleCounters(config, context.promptInfo.sessionLifecycle.state, context.reviewConvergenceState?.counters || {
      localSourceChangingRoundsPerEpoch: 0,
      githubTriggeredFixEpochsPerPr: 0,
      lifetimeLocalSourceChangingRounds: 0,
    });
    if (!synchronized.ok) return { attempted: false, proceeded: false, reason: synchronized.reasonCode };
    reviewFixLifecycle = { ...context.promptInfo.sessionLifecycle, state: synchronized.state, newSessionId: `${synchronized.state.logicalTask.runId}:review-fix:${randomUUID()}`, phase: "review_fix" };
  }
  const codex = runCodexPrompt(
    config,
    {
      ...context.promptInfo,
      branchName: context.branchName,
      prompt,
      promptPath,
      ...(reviewFixLifecycle ? { sessionLifecycle: reviewFixLifecycle } : {}),
    },
    "review-fix",
  );
  if (codex.sessionLifecycle?.state && context.promptInfo?.sessionLifecycle) {
    context.promptInfo.sessionLifecycle = { ...reviewFixLifecycle, state: codex.sessionLifecycle.state };
    context.issue.sessionLifecycle = codex.sessionLifecycle.state;
    if (context.iteration) context.iteration.sessionLifecycle = codex.sessionLifecycle.state;
  }
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
    if (context.sourceFailureFix) {
      const evidence = writeReviewFixEvidence(config, {
        ...baseEvidence,
        fixAttemptHappened: true,
        promptPath,
        codex: summarizeCodex(codex),
        changedFilesAfter,
        forbiddenChangedFilesAfter,
        validationAfter: summarizeValidation(validationAfter),
        stopReason: null,
      });
      return { attempted: true, proceeded: true, reason: "source_fix_requires_recursive_validation_convergence", decision, promptPath, codex, changedFilesAfter, forbiddenChangedFilesAfter, validationAfter, evidence };
    }
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
  const externalMutationGuardAfter = compareFingerprints(beforeReview, await checkoutFingerprint());
  if (externalMutationGuardAfter.mutationDetected) {
    return finishBlocked("review_fix_post_fix_external_review_mutated_checkout", {
      validationAfter: summarizeValidation(validationAfter),
      externalReviewAfter: summarizeExternalReview(externalReviewAfter),
      externalMutationGuardAfter,
    });
  }
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
  const reviewAfter = runReviewPrompt(config, { ...reviewPackageAfter, sessionLifecycle: context.issue.sessionLifecycle || context.sessionLifecycle || null });
  if (reviewAfter.sessionLifecycle) {
    context.issue.sessionLifecycle = reviewAfter.sessionLifecycle;
    context.sessionLifecycle = reviewAfter.sessionLifecycle;
    if (context.promptInfo.sessionLifecycle) context.promptInfo.sessionLifecycle = { ...context.promptInfo.sessionLifecycle, state: reviewAfter.sessionLifecycle };
  }
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
  const result = commentIssueOutcome(config, issue, outcome, body, { effectContext: issue.sessionLifecycle || null });
  if (issue.sessionLifecycle && !["auto_merged", "approved_pr_opened"].includes(outcome)
    && result?.status === 0 && !lifecycleHasPendingCanonicalIntents(config, issue.sessionLifecycle)) {
    const terminal = transitionSessionLifecyclePhase(config, issue.sessionLifecycle, {
      phase: "stopped",
      nextExactAction: `terminal_outcome:${outcome}`,
    });
    if (!terminal.ok) throw new Error(terminal.reasonCode);
    issue.sessionLifecycle = terminal.state;
  }
  return result;
}

function lifecycleHasPendingCanonicalIntents(config, lifecycle) {
  if (!lifecycle) return false;
  try {
    return findPreEffectIntents(config, (intent) => intent.runId === lifecycle.logicalTask?.runId
      && intent.claimIdentity === lifecycle.logicalTask?.claimIdentity
      && !["finalized", "failed_closed"].includes(intent.status)).length > 0;
  } catch {
    return true;
  }
}

async function commitReviewFixAndRerunExactHeadReviews(config, { issue, laneDecision, promptInfo, report, fixAttempt, recoveryRecorder, branchName, headChangeCheckpoint, commitMessage = null }) {
  const changedFilesBeforeCommit = fixAttempt.changedFilesAfter || [];
  const commit = await commitExplicitPaths(config, changedFilesBeforeCommit, commitMessage || `Auto-runner issue #${issue.number}: review-fix follow-up`, { effectContext: promptInfo?.sessionLifecycle?.state });
  const runnerCreatedCommitSha = config.dryRun ? null : getRefSha("HEAD");
  if (runnerCreatedCommitSha) {
    if (headChangeCheckpoint) await headChangeCheckpoint(runnerCreatedCommitSha);
    else refreshOrdinaryContinuationAfterSourceChange(config, recoveryRecorder, {
        baseOriginMainSha: getRefSha("origin/main"),
        runnerCreatedCommitSha,
      }, issue, branchName, "review_fix_commit");
  }
  const changedFiles = config.dryRun ? changedFilesBeforeCommit : listChangedFiles("origin/main", "HEAD");
  const forbiddenChangedFiles = filterForbiddenChangedFiles(changedFiles, laneDecision);
  const validation = fixAttempt.validationAfter;
  if (validation?.passed === false) {
    return {
      changedFiles,
      forbiddenChangedFiles,
      validation,
      commit,
      runnerCreatedCommitSha,
      reviewPackage: null,
      externalReview: { status: "pending", reason: "recursive_source_failure_revalidation_required" },
      review: { verdict: { verdict: "unable_to_review" } },
      reviewMutationGuard: { mutationDetected: false },
    };
  }
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
  const afterExternalReview = await checkoutFingerprint();
  const externalReviewMutationGuard = compareFingerprints(beforeReview, afterExternalReview);
  if (externalReviewMutationGuard.mutationDetected) {
    return { changedFiles, forbiddenChangedFiles, validation, commit, runnerCreatedCommitSha, reviewPackage, externalReview, review: { verdict: { verdict: "unable_to_review" } }, reviewMutationGuard: externalReviewMutationGuard };
  }
  const review = runReviewPrompt(config, { ...reviewPackage, sessionLifecycle: issue.sessionLifecycle || promptInfo?.sessionLifecycle?.state || null });
  if (review.sessionLifecycle) {
    issue.sessionLifecycle = review.sessionLifecycle;
    if (promptInfo?.sessionLifecycle) promptInfo.sessionLifecycle = { ...promptInfo.sessionLifecycle, state: review.sessionLifecycle };
  }
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

function currentReviewFindingFingerprints({ externalReview, review } = {}) {
  return reviewFindingFingerprintsFromSupportedContainers({ externalReview, review });
}

function normalSourceIdentityForCommit(iteration) {
  if (!iteration.runnerCreatedCommitSha) {
    return { exactHead: null, treeId: null, patchId: null, patchIdReason: "dry_run_or_missing_head" };
  }
  return sourceStateIdentityForCommit({
    baseRef: iteration.baseOriginMainSha,
    headRef: iteration.runnerCreatedCommitSha,
  });
}

function appendNormalReviewConvergenceHistory(iteration, { externalReview, review, fixAttempt, sourceIdentity = {} }) {
  iteration.reviewConvergenceHistory = [
    ...(iteration.reviewConvergenceHistory || []),
    {
      findingFingerprints: currentReviewFindingFingerprints({ externalReview, review }),
      claimedFixedFingerprints: claimedReviewFindingFingerprints({
        fixAttempt,
        externalReview,
        review,
        source: fixAttempt?.decision?.trigger?.source || fixAttempt?.trigger?.source,
      }),
      exactHead: sourceIdentity.exactHead || null,
      treeId: sourceIdentity.treeId || null,
      patchId: sourceIdentity.patchId || null,
      patchIdKind: sourceIdentity.patchId ? "stable_patch_id" : null,
      patchIdReason: sourceIdentity.patchIdReason || null,
    },
  ];
}

function evaluateNormalReviewConvergenceBudget(config, iteration, context) {
  const seed = buildLiveReviewConvergenceContext({
    ...context,
    config,
    reviewConvergenceState: iteration.reviewConvergenceState,
    reviewConvergenceHistory: iteration.reviewConvergenceHistory || [],
    sourceChangingCycle: iteration.reviewConvergenceState?.sourceChangingCycle ?? 0,
  });
  if (!iteration.reviewConvergenceState) {
    const loaded = loadReviewConvergenceState(config, seed.gateInput.reviewConvergenceState);
    if (loaded.ok) {
      iteration.reviewConvergenceState = loaded.state;
      iteration.reviewConvergenceHistory = loaded.state.history || loaded.state.reviewConvergenceHistory || iteration.reviewConvergenceHistory || [];
    }
  }
  const built = buildLiveReviewConvergenceContext({
    ...context,
    config,
    reviewConvergenceState: iteration.reviewConvergenceState || seed.gateInput.reviewConvergenceState,
    reviewConvergenceHistory: iteration.reviewConvergenceHistory || [],
    sourceChangingCycle: iteration.reviewConvergenceState?.sourceChangingCycle ?? seed.gateInput.reviewConvergenceState.sourceChangingCycle,
    currentFindings: reviewFindingsFromSupportedContainers({
      externalReview: context.externalReview,
      review: context.review,
    }),
  });
  iteration.reviewConvergence = built.context;
  iteration.reviewConvergenceState = built.gateInput.reviewConvergenceState;
  iteration.reviewConvergenceHistory = built.gateInput.reviewConvergenceHistory;
  persistNormalReviewConvergenceState(config, iteration, "budget_evaluated");
  const decision = evaluateCycleBudget(iteration.reviewConvergenceState, config, iteration.reviewConvergenceHistory);
  if (decision.transitionedState) {
    iteration.reviewConvergenceState = decision.transitionedState;
    persistNormalReviewConvergenceState(config, iteration, "diagnostic_epoch_started");
    decision.transitionedState = iteration.reviewConvergenceState;
  }
  iteration.reviewConvergenceBudget = decision;
  return decision;
}

function accountNormalReviewFixCommit(iteration, newHead, reasonCode) {
  const state = iteration.reviewConvergenceState || buildLiveReviewConvergenceContext({
    sourceChangingCycle: 0,
    exactHead: null,
  }).gateInput.reviewConvergenceState;
  const accounted = accountConvergenceEvent(state, { kind: "source_changed", newHead, reasonCode });
  iteration.reviewConvergenceState = accounted.state;
  return accounted;
}

function markNormalDiagnosticReviewFixTerminal(config, iteration, reason) {
  if (iteration.reviewConvergenceState?.diagnosticReviewFix?.status !== "pending") return;
  iteration.reviewConvergenceState = markDiagnosticReviewFixTerminal(iteration.reviewConvergenceState, reason);
  persistNormalReviewConvergenceState(config, iteration, "diagnostic_epoch_terminal");
}

function persistNormalReviewConvergenceState(config, iteration, phase) {
  if (!iteration.reviewConvergenceState?.pr?.exactHead) return null;
  const written = writeReviewConvergenceState(config, {
    ...iteration.reviewConvergenceState,
    history: iteration.reviewConvergenceHistory || [],
    reviewConvergenceHistory: iteration.reviewConvergenceHistory || [],
    phase,
  });
  iteration.reviewConvergenceState = written.state;
  iteration.reviewConvergenceStatePath = written.statePath;
  return written;
}

function stopForNormalReviewConvergenceBudget(config, issue, iteration, budget, recoveryRecorder) {
  iteration.outcome =
    budget.terminalReason === "MANUAL_DECISION_REQUIRED"
      ? "blocked_needs_tommy"
      : budget.terminalReason === "UNSAFE_SCOPE_CHANGE"
        ? "danger_gate"
        : "review_changes_requested_retry_exhausted";
  iteration.issueComment = finishIssueOutcome(
    config,
    issue,
    iteration.outcome,
    `Auto-runner did not open a PR for #${issue.number} because bounded review convergence stopped: ${budget.reason || budget.terminalReason}.`,
  );
  recoveryRecorder?.stop(
    `normal_review_convergence_${budget.terminalReason || "blocked"}`,
    budget.reason || budget.terminalReason,
    "stop_fail_closed",
  );
  iteration.finishedAt = new Date().toISOString();
  return iteration;
}

function stopForPostFixReviewMutation(config, issue, iteration, recoveryRecorder, reasonCode) {
  iteration.outcome = "auto_failed";
  iteration.issueComment = finishIssueOutcome(
    config,
    issue,
    iteration.outcome,
    `Auto-runner blocked #${issue.number} because post-fix exact-head review mutated the checkout.`,
  );
  recoveryRecorder?.stop(reasonCode, iteration.reviewMutationGuard?.reason || "post-fix exact-head review mutated the checkout", "operator_recovery_required");
  iteration.finishedAt = new Date().toISOString();
  return iteration;
}

function recordPostFixExactHeadEvidence(recoveryRecorder, { validation, externalReview, review, headSha, baseSha, changedFiles }) {
  if (!recoveryRecorder) return null;
  const changedFilesDigest = validation?.changedFilesDigest || externalReview?.changedFilesDigest || review?.changedFilesDigest || null;
  const persisted = recoveryRecorder.completeHeadEvidence?.(
    {
      localValidation: {
        status: validation?.passed ? "passed" : "failed",
        headSha,
        baseSha,
        changedFiles,
        changedFilesDigest,
        evidencePath: validation?.evidencePath || validation?.reportPath,
        source: "local_validation",
        profile: validation?.profile,
        summary: "post-fix exact-head validation",
      },
      externalReview: {
        status: externalReview?.status === "pass" ? "passed" : "blocked",
        headSha: externalReview?.reviewedHead || headSha,
        baseSha,
        changedFiles,
        changedFilesDigest: externalReview?.changedFilesDigest,
        evidencePath: externalReview?.reportPath || externalReview?.evidencePath,
        source: externalReview?.source || "external_review",
        provider: externalReview?.provider,
        tier: externalReview?.tier,
        resultId: externalReview?.resultId || externalReview?.reviewId,
        summary: externalReview?.reason || externalReview?.status,
      },
      codexReview: {
        status: review?.verdict?.verdict === "approve" ? "passed" : "blocked",
        headSha: review?.reviewedHead || headSha,
        baseSha,
        changedFiles,
        changedFilesDigest: review?.changedFilesDigest,
        evidencePath: review?.logPath || review?.promptPath,
        source: review?.source || "codex_mechanics_security_review",
        provider: review?.provider || "codex",
        resultId: review?.resultId || review?.reviewId,
        summary: review?.reviewFailureReason || review?.verdict?.verdict,
      },
    },
    { headSha, baseSha, changedFiles, changedFilesDigest },
  );
  if (persisted && !persisted.ok) {
    throw new Error(`Post-fix exact-head evidence persistence failed: ${persisted.reasonCode || "unknown"}`);
  }
  return persisted;
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
    taskKey: config.taskKey || null,
    repository: config.repositorySlug || "tommytang213/Settleora",
    manualMergeRequired: payload.manualMergeRequired ?? payload.laneDecision?.manualMergeRequired ?? null,
    autoMergeEligible: payload.autoMergeEligible ?? payload.laneDecision?.autoMergeEligible ?? null,
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
    currentHead: payload.headSha || (config.dryRun ? null : getRefSha("HEAD")),
    baseSha: payload.baseSha || payload.baseRefSha || payload.baseOriginMainSha || (config.dryRun ? null : getRefSha("origin/main")),
    treeSha: config.dryRun ? payload.headSha || null : getRefSha("HEAD^{tree}"),
    rawDiffSha256: createHash("sha256").update(diff.text).digest("hex"),
    validation: payload.validation,
    report: payload.report,
    externalReview: payload.externalReview || null,
    fullCandidatePrDelta: payload.fullCandidatePrDelta || null,
    integrationBoundaries: ["tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"],
    integrationBoundaryMaterial: integrationBoundaryMaterial(config.repoRoot, ["tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"]),
    reviewFixMechanicsContext: payload.reviewFixMechanicsContext || null,
    diffTruncated: diff.truncated,
  };
  writeFileSync(packagePath, `${JSON.stringify({ summary, diff: diff.text }, null, 2)}\n`);
  return { packagePath, summary, diff: diff.text };
}

function integrationBoundaryMaterial(repoRoot = process.cwd(), paths) {
  return paths.map((relativePath) => {
    const content = readFileSync(path.join(repoRoot, relativePath), "utf8");
    return { path: relativePath, sha256: createHash("sha256").update(content).digest("hex"), content };
  });
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

async function certifyNormalCumulativeLargeReview(config, iteration, changedFiles) {
  const reviewPackage = iteration.reviewPackage || {};
  let structuredLifecycle = iteration.review?.sessionLifecycle || iteration.sessionLifecycle || null;
  const invoke = async (provider, structuredReview) => {
    const result = await runNormalStructuredReviewCall(config, reviewPackage, provider, structuredReview, structuredLifecycle);
    if (result.nextSessionLifecycle) structuredLifecycle = result.nextSessionLifecycle;
    const { nextSessionLifecycle, ...evidence } = result;
    return evidence;
  };
  const headSha = iteration.runnerCreatedCommitSha || reviewPackage.summary?.currentHead || (config.dryRun ? null : getRefSha("HEAD"));
  const baseSha = iteration.baseOriginMainSha || reviewPackage.summary?.baseSha || (config.dryRun ? null : getRefSha("origin/main"));
  const certification = await persistCumulativeLargeCandidateReview({
    config,
    taskKey: config.taskKey || `issue-${iteration.issue?.number || "unknown"}`,
    candidateIdentity: {
      repository: config.repositorySlug || "tommytang213/Settleora",
      baseSha,
      headSha,
      treeSha: config.dryRun ? headSha : getRefSha("HEAD^{tree}"),
      diffDigest: reviewPackage.summary?.rawDiffSha256 || createHash("sha256").update(String(reviewPackage.diff || "")).digest("hex"),
      changedFilesDigest: createHash("sha256").update(JSON.stringify([...changedFiles].sort())).digest("hex"),
    },
    changedFiles,
    integrationBoundaries: ["tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"],
    externalReview: iteration.externalReview,
    codexReview: iteration.review,
    invokeSection: ({ provider, section, manifest }) => invoke(provider, { phase: "section", section, manifest }),
    invokeIntegration: ({ provider, manifest, sections }) => invoke(provider, { phase: "integration", manifest, sections }),
  });
  return { ...certification, sessionLifecycle: structuredLifecycle };
}

async function refreshNormalLargeCandidateReviewAfterFix(config, iteration, changedFiles, issue, recoveryRecorder) {
  if (iteration.externalReview?.route?.largeCandidateRouting?.route !== "large_bundle_escalation") {
    iteration.largeCandidateReview = { ok: true, route: "normal", state: "external_review_normal_ready" };
    return true;
  }
  const beforeStructuredReview = await checkoutFingerprint();
  iteration.largeCandidateReview = await certifyNormalCumulativeLargeReview(config, iteration, changedFiles);
  const structuredReviewMutationGuard = compareFingerprints(beforeStructuredReview, await checkoutFingerprint());
  if (structuredReviewMutationGuard.mutationDetected) {
    iteration.reviewMutationGuard = structuredReviewMutationGuard;
    stopForPostFixReviewMutation(config, issue, iteration, recoveryRecorder, "structured_post_fix_review_mutated_checkout");
    return false;
  }
  const manualVerdict = structuredLargeCandidateManualVerdict(iteration.largeCandidateReview);
  if (manualVerdict) {
    iteration.outcome = manualVerdict === "danger_gate" ? "danger_gate" : "blocked_needs_tommy";
    iteration.issueComment = finishIssueOutcome(config, issue, iteration.outcome, `Post-fix structured review returned ${manualVerdict}; no further mutation or push was attempted.`);
    recoveryRecorder?.stop(`structured_review_${manualVerdict}`, "Structured reviewer required a manual decision.", "manual_review_decision_required");
    iteration.finishedAt = new Date().toISOString();
    return false;
  }
  if (iteration.largeCandidateReview.sessionLifecycle) {
    iteration.sessionLifecycle = iteration.largeCandidateReview.sessionLifecycle;
    issue.sessionLifecycle = iteration.largeCandidateReview.sessionLifecycle;
  }
  if (iteration.largeCandidateReview.ok) return true;
  if (routeNormalStructuredFindingsToConvergence(iteration)) {
    recoveryRecorder?.advance("review_fix", "route_post_fix_structured_large_candidate_findings");
    return true;
  }
  iteration.externalReview = {
    ...iteration.externalReview,
    status: "blocked",
    reason: iteration.largeCandidateReview.reasonCode || "large_candidate_review_incomplete",
  };
  iteration.outcome = "auto_failed";
  iteration.issueComment = finishIssueOutcome(
    config,
    issue,
    iteration.outcome,
    `Auto-runner did not open a PR for #${issue.number} because cumulative large-candidate review did not re-certify the post-fix head.`,
  );
  recoveryRecorder?.stop(
    iteration.largeCandidateReview.reasonCode || "large_candidate_review_incomplete",
    "Post-fix cumulative large-candidate review is incomplete.",
    "resume_large_candidate_review",
  );
  iteration.finishedAt = new Date().toISOString();
  return false;
}

function routeNormalStructuredFindingsToConvergence(iteration) {
  const gemini = structuredLargeCandidateFindings(iteration.largeCandidateReview, "gemini").map(convergenceFinding);
  const codex = structuredLargeCandidateFindings(iteration.largeCandidateReview, "codex-local").map(convergenceFinding);
  if (gemini.length + codex.length === 0) return false;
  if (gemini.length > 0) iteration.externalReview = {
    ...iteration.externalReview,
    status: "blocked",
    verdict: "fail",
    sanitizedResponseSummary: { verdict: "fail", findings: gemini },
    reason: "blocked_external_reviewer_non_pass",
  };
  if (codex.length > 0) iteration.review = {
    ...iteration.review,
    verdict: {
      ...(iteration.review?.verdict || {}),
      verdict: "changes_requested",
      recommended_next_action: "run_safe_fix_cycle",
      blocking_findings: codex,
    },
  };
  return true;
}

function convergenceFinding(finding) {
  return { severity: finding.severity, path: finding.path, message: finding.summary };
}

async function runNormalStructuredReviewCall(config, reviewPackage, provider, structuredReview, sessionLifecycle) {
  const scopedPackage = { ...reviewPackage, summary: { ...reviewPackage.summary, structuredReview: { phase: structuredReview.phase, sectionId: structuredReview.section?.id || null, changedPaths: structuredReview.section?.changedPaths || [], sections: (structuredReview.sections || []).map((entry) => ({ id: entry.id, status: entry.status, findings: (entry.findings || []).slice(0, 20) })), coverageSections: structuredReview.manifest.sections.map((entry) => ({ id: entry.id, changedPaths: entry.changedPaths })), manifestDigest: structuredReview.manifest.manifestDigest } } };
  const evidence = provider === "gemini" ? await runIntegratedReviewSource(config, scopedPackage, `large-${structuredReview.phase}`) : runReviewPrompt(config, { ...scopedPackage, sessionLifecycle });
  const pass = provider === "gemini" ? evidence?.status === "pass" && evidence?.verdict === "pass" : evidence?.verdict?.verdict === "approve";
  const reasonCode = evidence?.reason || evidence?.reviewFailureReason || null;
  const reviewerVerdict = provider === "gemini" ? evidence?.verdict || evidence?.sanitizedResponseSummary?.verdict : evidence?.verdict?.verdict;
  return { ...(structuredReview.section ? { id: structuredReview.section.id } : {}), status: pass ? "pass" : "blocked", reviewerVerdict, manifestDigest: structuredReview.manifest.manifestDigest, findings: normalStructuredFindings(evidence), evidencePath: evidence?.reportPath || evidence?.logPath || null, reasonCode, contextLimited: /context|token|truncat|over.?budget/i.test(reasonCode || ""), attestationSource: evidence?.attestationSource, providerPromptBindingDigest: evidence?.providerPromptBindingDigest, attestedCandidateIdentity: evidence?.attestedCandidateIdentity, attestedIntegrationBoundaries: evidence?.attestedIntegrationBoundaries, nextSessionLifecycle: evidence?.sessionLifecycle || null };
}

function normalStructuredFindings(evidence) {
  return [
    ...(evidence?.sanitizedResponseSummary?.findings || []),
    ...(evidence?.verdict?.blocking_findings || []),
    ...(evidence?.verdict?.non_blocking_findings || []),
    ...(evidence?.findings || []),
  ].slice(0, 20).map((finding) => typeof finding === "string"
    ? { severity: "reviewer", path: null, summary: finding.slice(0, 500) }
    : { severity: finding?.severity || "reviewer", path: finding?.path || null, summary: String(finding?.summary || finding?.message || "").slice(0, 500) });
}

function persistNormalLargeCandidateSplit(config, iteration, changedFiles) {
  const summary = iteration.reviewPackage?.summary || {};
  return persistLargeCandidateSplitDecision({
    config,
    taskKey: config.taskKey || `issue-${iteration.issue?.number || "unknown"}`,
    candidateIdentity: {
      repository: config.repositorySlug || "tommytang213/Settleora",
      baseSha: iteration.baseOriginMainSha || summary.baseSha,
      headSha: iteration.runnerCreatedCommitSha || summary.currentHead,
      treeSha: summary.treeSha,
      diffDigest: summary.rawDiffSha256,
      changedFilesDigest: createHash("sha256").update(JSON.stringify([...changedFiles].sort())).digest("hex"),
    },
    classification: iteration.externalReview.route.largeCandidateRouting,
    changedFiles,
    slices: iteration.featureBundle?.slices || [],
  });
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

function renderSecurityFindingsDryRunText(result) {
  const lines = [
    `Security findings dry-run: ${result.ok ? "ok" : "failed"} (${result.reason || "unknown"})`,
    `Repository: ${result.repository}`,
    `Normalized: ${result.normalizedCount}`,
    `Duplicate: ${result.duplicateCount}`,
    `New: ${result.newCount}`,
    `Ambiguous: ${result.ambiguousCount}`,
    `Source failures: ${result.failureCount}`,
    `False-positive candidates: ${result.falsePositiveCandidateCount || 0}`,
    `Packets ready/blocked: ${result.packetReadyCount || 0}/${result.packetBlockedCount || 0}`,
    `Reviews ready: ${result.reviewReadyCount || 0}`,
    `Tie-breakers required: ${result.tieBreakerRequiredCount || 0}`,
    `Disposition ready/blocked: ${result.dispositionReadyCount || 0}/${result.dispositionBlockedCount || 0}`,
    `Reconciliation ready: ${result.reconciliationReadyCount || 0}`,
    `Completion ready: ${result.completionReadyCount || 0}`,
  ];
  for (const [sourceKind, source] of Object.entries(result.sources || {})) {
    lines.push(`- ${sourceKind}: ${source.status}; count=${source.count}; reason=${source.reason || "none"}`);
  }
  if (result.statePath) lines.push(`State: ${result.statePath}`);
  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
