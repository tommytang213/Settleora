import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { planFeatureBundleIssue } from "./feature-bundle-contract.mjs";
import {
  createInitialBundleState,
  loadBundleState,
  markBundleSliceCompleted,
  markBundleSliceStarted,
  markBundleStopped,
  recoverBundleState,
  summarizeBundleState,
  writeBundleState,
} from "./feature-bundle-state.mjs";
import {
  commitExplicitPaths,
  createTaskBranch,
  fetchOriginMain,
  getBoundedDiff,
  getCurrentBranch,
  getRefSha,
  getStatusShort,
  listChangedFiles,
  listWorkingTreeChangedFiles,
  runGit,
  sourceStateIdentityForCommit,
} from "./git-workspace.mjs";
import { filterForbiddenChangedFiles } from "./lane-policy.mjs";
import { runCodexPrompt, runReviewPrompt } from "./codex-runner.mjs";
import { createSessionLifecycleState, persistSessionLifecycleState, synchronizeSessionLifecycleCounters } from "./session-lifecycle.mjs";
import { collectReport } from "./report-collector.mjs";
import { bindValidationEvidence, planValidation, runValidationPlan } from "./validation-planner.mjs";
import { inspectPreReviewPrOwnership, openOrUpdatePr, pushBranch, watchChecks } from "./pr-manager.mjs";
import { hktTimestamp, safeTimestamp, slugify } from "./logger.mjs";
import { runGeminiIntegratedReview } from "./gemini-reviewer.mjs";
import { reviewerReadinessSummary } from "./reviewer-policy.mjs";
import { persistCumulativeLargeCandidateReview, persistLargeCandidateSplitDecision, structuredLargeCandidateFindings, structuredLargeCandidateManualVerdict } from "./large-candidate-review-routing.mjs";
import {
  accountConvergenceEvent,
  buildLiveReviewConvergenceContext,
  claimedReviewFindingFingerprints,
  evaluateCycleBudget,
  markDiagnosticReviewFixTerminal,
  reviewFindingFingerprintsFromSupportedContainers,
} from "./review-convergence-controller.mjs";
import {
  buildReviewFixPrompt,
  evaluateReviewFixMutationDecision,
  extractReviewFixTrigger,
} from "./review-fix-policy.mjs";
import {
  evaluateAutoMergeDecision,
  evaluatePrePushReviewGate,
  executeAutoMerge,
  inspectAutoMergeGithubState,
  requiresIndependentAiReview,
  writeAutoMergeEvidence,
} from "./auto-merge-policy.mjs";
import {
  advanceRecoveryPhase,
  bindRecoveryEvidence,
  createInitialRecoveryState,
  invalidateEvidenceForHeadChange,
  persistCompleteHeadEvidence,
  recordIdempotentMutation,
  writeRecoveryState,
} from "./recovery-state.mjs";

export async function runFeatureBundleIteration(config, logger, { runId, index, issue, laneDecision, branchName = null, controlCheck = null, recoveryState = null, autoMergeRunner = null }) {
  const planned = planFeatureBundleIssue(issue);
  if (!planned.ok) {
    return {
      ok: false,
      outcome: "bundle_contract_failed",
      reason: planned.reason,
      reasonCode: planned.reasonCode,
      laneDecision,
    };
  }
  const plan = planned.plan;
  let bundleBranchName =
    branchName || `feature-bundle/auto-${issue.number}-${slugify(issue.title, 36)}-${safeTimestamp().slice(0, 15).toLowerCase()}`;
  const result = {
    ok: true,
    outcome: null,
    bundle: {
      id: plan.id,
      planDigest: plan.planDigest,
      sliceCount: plan.sliceCount,
      branchName: bundleBranchName,
      slices: [],
    },
    laneDecision: planned.laneDecision,
  };

  fetchOriginMain(config);
  const baseOriginMainSha = config.dryRun ? null : getRefSha("origin/main");
  result.baseOriginMainSha = baseOriginMainSha;
  let state = null;
  if (!config.dryRun) {
    const loaded = recoverExistingBundleCheckout(config, { plan, baseOriginMainSha });
    if (loaded.ok) {
      state = loaded.state;
      bundleBranchName = state.branch;
      result.bundle.branchName = bundleBranchName;
      result.bundle.recovery = loaded.recovery;
    } else if (loaded.reasonCode !== "bundle_state_missing") {
      return stopBundle(result, "bundle_recovery_failed", loaded.reasonCode, loaded.reason);
    }
  }
  if (!state) {
    createTaskBranch(config, bundleBranchName);
    const startingHead = config.dryRun ? baseOriginMainSha : getRefSha("HEAD");
    state = createInitialBundleState({
      plan,
      runId,
      supervisorRunId: config.supervisorRunId || null,
      branchName: bundleBranchName,
      baseSha: baseOriginMainSha,
      currentHeadSha: startingHead,
      taskKey: plan.taskKey || "auto-runner",
    });
  }
  if (!config.dryRun) {
    writeBundleState(config, state);
  }
  const recovery = createBundleRecoveryRecorder(config, {
    existingState: recoveryState,
    taskKey: plan.taskKey || "auto-runner",
    issue,
    runId,
    supervisorRunId: config.supervisorRunId || null,
    branchName: bundleBranchName,
    baseSha: baseOriginMainSha,
    currentHeadSha: config.dryRun ? null : getRefSha("HEAD"),
    featureBundle: {
      bundleId: plan.id,
      planDigest: plan.planDigest,
      bundleStatePath: state.statePath || null,
      sliceOrder: plan.slices.map((slice) => slice.id),
    },
  });
  let sessionLifecycle = recovery?.state?.sessionLifecycle || recoveryState?.sessionLifecycle || createBundleSessionLifecycle(config, {
    issue,
    plan,
    runId,
    branchName: bundleBranchName,
    baseSha: baseOriginMainSha,
    headSha: config.dryRun ? baseOriginMainSha : getRefSha("HEAD"),
    recoveryState: recovery?.state || recoveryState,
  });
  result.sessionLifecycle = sessionLifecycle;
  recovery?.advance("implementation_or_bundle_slice", "run_next_bundle_slice");

  let checkpointBase = config.dryRun ? "origin/main" : getRefSha("HEAD");
  for (const slice of plan.slices) {
    if (state.slices[slice.id]?.state === "completed") {
      checkpointBase = state.slices[slice.id].commitSha || checkpointBase;
      result.bundle.slices.push({ id: slice.id, sequence: slice.sequence, skipped: true, reason: "already_completed" });
      continue;
    }
    const control = controlCheck ? controlCheck({ slice, state, result }) : null;
    if (control?.stop) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "control_stop_between_slices", reason: control.reason });
      if (!config.dryRun) writeBundleState(config, state);
      recovery?.stop("control_stop_between_slices", control.reason, "stop_after_current_boundary");
      return stopBundle(result, "blocked", "control_stop_between_slices", control.reason || "Runner control stopped between slices.");
    }

    const promptInfo = generateBundleSlicePrompt(config, { issue, laneDecision: planned.laneDecision, plan, slice, branchName: bundleBranchName, state });
    state = markBundleSliceStarted(state, {
      sliceId: slice.id,
      promptPath: promptInfo.promptPath,
      reportPath: promptInfo.reportPath,
      currentHeadSha: config.dryRun ? null : getRefSha("HEAD"),
    });
    if (!config.dryRun) writeBundleState(config, state);
    recovery?.advance("implementation_or_bundle_slice", `run_bundle_slice:${slice.id}`);

    const codex = runCodexPrompt(config, {
      ...promptInfo,
      branchName: bundleBranchName,
      ...(sessionLifecycle ? { sessionLifecycle: bundleLifecycleInvocation(sessionLifecycle, `bundle-${slice.sequence}-${slice.id}`) } : {}),
    }, `bundle-${slice.sequence}-${slice.id}`);
    if (codex.sessionLifecycle?.state) {
      sessionLifecycle = codex.sessionLifecycle.state;
      result.sessionLifecycle = sessionLifecycle;
    }
    if (!codex.skipped && (codex.error || codex.status !== 0)) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "codex_failed", reason: codex.error || `status ${codex.status}` });
      if (!config.dryRun) writeBundleState(config, state);
      recovery?.stop("bundle_slice_codex_failed", codex.error || `status ${codex.status}`, "retry_bounded_or_manual");
      return stopBundle(result, "auto_failed", "codex_failed", `Codex failed for bundle slice ${slice.id}.`, { codex });
    }

    const sliceChangedFiles = config.dryRun ? slice.allowedPaths.filter((item) => !item.includes("*")) : listChangedFiles(checkpointBase, "HEAD");
    const forbidden = filterForbiddenChangedFiles(sliceChangedFiles, { ...planned.laneDecision, allowedPaths: slice.allowedPaths });
    if (!config.dryRun && sliceChangedFiles.length === 0) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "bundle_slice_empty_change", reason: "Slice produced no changes." });
      writeBundleState(config, state);
      recovery?.stop("bundle_slice_empty_change", `Slice ${slice.id} produced no changes.`, "manual_recovery_required");
      return stopBundle(result, "bundle_recovery_failed", "bundle_slice_empty_change", `Bundle slice ${slice.id} produced no changes.`);
    }
    if (forbidden.length > 0) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "bundle_slice_scope_escape", reason: forbidden.join(", ") });
      if (!config.dryRun) writeBundleState(config, state);
      recovery?.stop("bundle_slice_scope_escape", forbidden.join(","), "stop_fail_closed");
      return stopBundle(result, "scope_failed", "bundle_slice_scope_escape", `Bundle slice ${slice.id} changed forbidden files.`, { forbidden });
    }

    recovery?.advance("checkpoint_validation_commit", `validate_bundle_slice:${slice.id}`);
    const validationPlan = planValidation(sliceChangedFiles, { ...planned.laneDecision, validationProfile: slice.validationProfile });
    const validation = runValidationPlan(config, validationPlan);
    recovery?.evidence("localValidation", {
      status: validation.passed ? "passed" : "failed",
      headSha: config.dryRun ? null : getRefSha("HEAD"),
      baseSha: checkpointBase,
      changedFiles: sliceChangedFiles,
      summary: `bundle slice ${slice.id} validation`,
    });
    if (!validation.passed) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "checkpoint_validation_failed", reason: "Checkpoint validation failed." });
      if (!config.dryRun) writeBundleState(config, state);
      recovery?.stop("bundle_checkpoint_validation_failed", `Slice ${slice.id} validation failed.`, "retry_bounded_or_manual");
      return stopBundle(result, "validation_failed", "checkpoint_validation_failed", `Validation failed for bundle slice ${slice.id}.`, { validation });
    }

    const report = collectReport(config, promptInfo);
    if (!config.dryRun && !report.found) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "slice_report_missing", reason: promptInfo.reportPath });
      writeBundleState(config, state);
      recovery?.stop("bundle_slice_report_missing", promptInfo.reportPath, "manual_recovery_required");
      return stopBundle(result, "bundle_recovery_failed", "slice_report_missing", `Expected bundle slice report missing: ${promptInfo.reportPath}`);
    }

    const commit = await commitExplicitPaths(config, sliceChangedFiles, `${slice.title}`, { effectContext: sessionLifecycle });
    const checkpointSha = config.dryRun ? null : getRefSha("HEAD");
    recovery?.headChanged(checkpointSha, `bundle_slice_commit:${slice.id}`);
    recovery?.marker("checkpoint_commit", `bundle-${plan.id}-${slice.id}-${checkpointSha || "dry-run"}`, {
      target: slice.id,
      correlation: runId,
    });
    const boundValidation = bindValidationEvidence(validation, {
      headSha: checkpointSha,
      baseSha: checkpointBase,
      changedFiles: sliceChangedFiles,
      profile: slice.validationProfile,
    });
    state = markBundleSliceCompleted(state, {
      sliceId: slice.id,
      validation: boundValidation,
      commitSha: checkpointSha || `${slice.id}-dry-run`,
      reportPath: report.copyPath || report.expectedPath || promptInfo.reportPath,
      currentHeadSha: checkpointSha,
    });
    if (!config.dryRun) writeBundleState(config, state);
    checkpointBase = checkpointSha || checkpointBase;
    result.bundle.slices.push({
      id: slice.id,
      sequence: slice.sequence,
      promptPath: promptInfo.promptPath,
      reportPath: promptInfo.reportPath,
      changedFiles: sliceChangedFiles,
      validation: boundValidation,
      commit,
      commitSha: checkpointSha,
    });
  }

  if (!config.dryRun && getStatusShort() !== "") {
    recovery?.stop("bundle_dirty_after_slices", "Bundle worktree dirty after checkpoint commits.", "stop_fail_closed");
    return stopBundle(result, "bundle_recovery_failed", "bundle_dirty_after_slices", "Bundle worktree was dirty after checkpoint commits.");
  }
  let finalHead = config.dryRun ? null : getRefSha("HEAD");
  let aggregateFiles = config.dryRun ? [] : listChangedFiles("origin/main", "HEAD");
  let aggregateForbidden = filterForbiddenChangedFiles(aggregateFiles, planned.laneDecision);
  if (aggregateForbidden.length > 0) {
    recovery?.stop("bundle_aggregate_scope_escape", aggregateForbidden.join(","), "stop_fail_closed");
    return stopBundle(result, "scope_failed", "bundle_aggregate_scope_escape", "Aggregate bundle scope escaped parent lane.", {
      forbidden: aggregateForbidden,
    });
  }
  recovery?.advance("aggregate_validation", "run_bundle_aggregate_validation");
  const finalValidationPlan = planValidation(aggregateFiles, planned.laneDecision);
  const finalValidation = bindValidationEvidence(runValidationPlan(config, finalValidationPlan), {
    headSha: finalHead,
    baseSha: baseOriginMainSha,
    changedFiles: aggregateFiles,
    profile: planned.laneDecision.validationProfile,
  });
  recovery?.evidence("localValidation", {
    status: finalValidation.passed ? "passed" : "failed",
    headSha: finalHead,
    baseSha: baseOriginMainSha,
    changedFiles: aggregateFiles,
    changedFilesDigest: finalValidation.changedFilesDigest,
    summary: "bundle aggregate validation",
  });
  result.validation = finalValidation;
  if (!finalValidation.passed) {
    recovery?.stop("bundle_final_validation_failed", "Final aggregate validation failed.", "retry_bounded_or_manual");
    return stopBundle(result, "validation_failed", "bundle_final_validation_failed", "Final aggregate bundle validation failed.", {
      validation: finalValidation,
    });
  }

  result.preReviewPrOwnership = inspectPreReviewPrOwnership(config, bundleBranchName);
  if (!result.preReviewPrOwnership.clean) {
    recovery?.stop("bundle_branch_or_pr_preexists", "Bundle branch or PR pre-existed before review.", "stop_fail_closed");
    return stopBundle(result, "auto_failed", "bundle_branch_or_pr_preexists", "Bundle branch or PR already exists before pre-PR review.");
  }
  recovery?.advance("external_review", "run_bundle_external_review");
  result.reviewPackage = writeBundleReviewPackage(config, {
    issue,
    laneDecision: planned.laneDecision,
    plan,
    state,
    changedFiles: aggregateFiles,
    validation: finalValidation,
    headSha: finalHead,
    baseSha: baseOriginMainSha,
  });
  const reviewFingerprintBefore = captureBundleReviewCheckoutFingerprint(config);
  result.externalReview = await runGeminiIntegratedReview(config, result.reviewPackage);
  if (result.externalReview?.route?.largeCandidateRouting?.route === "split_or_block") {
    result.largeCandidateReview = persistBundleLargeCandidateSplit(config, { issue, plan, reviewPackage: result.reviewPackage, changedFiles: aggregateFiles, headSha: finalHead, baseSha: baseOriginMainSha, externalReview: result.externalReview });
    return stopBundle(result, "blocked_needs_tommy", result.largeCandidateReview.reasonCode, "Mixed bundle requires a proven semantics-preserving split or the minimum architecture decision.");
  }
  const externalReviewMutationGuard = compareBundleReviewCheckoutFingerprint(reviewFingerprintBefore, captureBundleReviewCheckoutFingerprint(config), {
    phase: "bundle_external_review",
  });
  if (externalReviewMutationGuard.mutationDetected) {
    result.reviewMutationGuard = externalReviewMutationGuard;
    return stopForBundleReviewMutation({ config, result, state, recovery, guard: externalReviewMutationGuard, phase: "bundle_external_review" });
  }
  const codexReviewFingerprintBefore = captureBundleReviewCheckoutFingerprint(config);
  recovery?.advance("codex_mechanics_security_review", "run_bundle_codex_review");
  result.review = runReviewPrompt(config, { ...result.reviewPackage, sessionLifecycle });
  if (result.review.sessionLifecycle) {
    sessionLifecycle = result.review.sessionLifecycle;
    result.sessionLifecycle = sessionLifecycle;
  }
  const codexReviewMutationGuard = compareBundleReviewCheckoutFingerprint(codexReviewFingerprintBefore, captureBundleReviewCheckoutFingerprint(config), {
    phase: "bundle_codex_review",
  });
  if (codexReviewMutationGuard.mutationDetected) {
    result.reviewMutationGuard = codexReviewMutationGuard;
    return stopForBundleReviewMutation({ config, result, state, recovery, guard: codexReviewMutationGuard, phase: "bundle_codex_review" });
  }
  result.reviewMutationGuard = mergeBundleReviewMutationGuards(externalReviewMutationGuard, codexReviewMutationGuard);
  result.largeCandidateReview = result.externalReview?.route?.largeCandidateRouting?.route === "large_bundle_escalation"
    ? await certifyLargeBundleCumulativeReview({ config, issue, reviewPackage: result.reviewPackage, changedFiles: aggregateFiles, headSha: finalHead, baseSha: baseOriginMainSha, externalReview: result.externalReview, codexReview: result.review, sessionLifecycle })
    : { ok: true, state: "external_review_complete", verdict: "pass", route: "normal" };
  const structuredReviewMutationGuard = compareBundleReviewCheckoutFingerprint(codexReviewFingerprintBefore, captureBundleReviewCheckoutFingerprint(config), {
    phase: "bundle_structured_review",
  });
  result.reviewMutationGuard = mergeBundleReviewMutationGuards(externalReviewMutationGuard, codexReviewMutationGuard, structuredReviewMutationGuard);
  if (structuredReviewMutationGuard.mutationDetected) {
    return stopForBundleReviewMutation({ config, result, state, recovery, guard: structuredReviewMutationGuard, phase: "bundle_structured_review" });
  }
  if (result.largeCandidateReview.sessionLifecycle) {
    sessionLifecycle = result.largeCandidateReview.sessionLifecycle;
    result.sessionLifecycle = sessionLifecycle;
  }
  if (result.externalReview?.route?.largeCandidateRouting?.route === "large_bundle_escalation" && !result.largeCandidateReview.ok) {
    const manualVerdict = structuredLargeCandidateManualVerdict(result.largeCandidateReview);
    if (manualVerdict) return stopBundle(result, manualVerdict === "danger_gate" ? "danger_gate" : "blocked_needs_tommy", `structured_review_${manualVerdict}`, "Structured reviewer required a manual decision; no fix cycle or push was attempted.");
    if (!routeBundleStructuredFindingsToConvergence(result)) {
      return stopBundle(result, "auto_failed", result.largeCandidateReview.reasonCode || "large_candidate_review_incomplete", "Complete cumulative large-candidate dual review evidence was not established.");
    }
    recovery?.advance("review_fix", "route_structured_large_candidate_findings");
  }
  recovery?.evidence("externalReview", {
    status: result.externalReview.status === "pass" ? "passed" : "blocked",
    headSha: result.externalReview.reviewedHead || finalHead,
    baseSha: baseOriginMainSha,
    changedFiles: aggregateFiles,
    changedFilesDigest: result.externalReview.changedFilesDigest,
    evidencePath: result.externalReview.reportPath || result.externalReview.evidencePath,
    summary: result.externalReview.reason,
  });
  recovery?.evidence("codexReview", {
    status: result.review.verdict?.verdict === "approve" ? "passed" : "blocked",
    headSha: finalHead,
    baseSha: baseOriginMainSha,
    changedFiles: aggregateFiles,
    changedFilesDigest: result.review.changedFilesDigest,
    evidencePath: result.review.logPath || result.review.promptPath,
    summary: result.review.reviewFailureReason || result.review.verdict?.verdict,
  });
  const finalEvidence = persistBundleExactHeadEvidence(recovery, {
    validation: finalValidation,
    externalReview: result.externalReview,
    review: result.review,
    headSha: finalHead,
    baseSha: baseOriginMainSha,
    changedFiles: aggregateFiles,
  });
  if (finalEvidence && !finalEvidence.ok) {
    recovery?.stop("bundle_exact_head_evidence_incomplete", finalEvidence.reasonCode || "bundle_exact_head_evidence_incomplete", "regenerate_exact_head_evidence");
    return stopBundle(result, "auto_failed", finalEvidence.reasonCode || "bundle_exact_head_evidence_incomplete", "Bundle exact-head evidence was incomplete or stale.");
  }
  const reviewConvergence = buildLiveReviewConvergenceContext({
    config,
    issue,
    laneDecision: planned.laneDecision,
    branchName: bundleBranchName,
    baseRef: "main",
    exactHead: finalHead,
    sourceChangingCycle: state.sourceChangingCycle,
    reviewConvergenceState: state.reviewConvergenceState || null,
    relationships: {
      bundleId: plan.id,
      sliceOrder: plan.slices.map((slice) => slice.id),
    },
  });
  result.reviewConvergence = reviewConvergence.context;
  state = { ...state, reviewConvergenceState: reviewConvergence.gateInput.reviewConvergenceState };
  if (!config.dryRun) writeBundleState(config, state);
  let prePushGate = evaluatePrePushReviewGate({
    ...reviewConvergence.gateInput,
    laneDecision: planned.laneDecision,
    externalReview: result.externalReview,
    reviewMutationGuard: result.reviewMutationGuard,
  });
  const convergence = await runBundleReviewConvergence(config, {
    issue,
    laneDecision: planned.laneDecision,
    plan,
    state,
    result,
    branchName: bundleBranchName,
    baseSha: baseOriginMainSha,
    changedFiles: aggregateFiles,
    forbiddenChangedFiles: aggregateForbidden,
    validation: finalValidation,
    reviewPackage: result.reviewPackage,
    prePushGate,
    recovery,
    sessionLifecycle,
    writeState: (nextState) => {
      state = nextState;
      if (!config.dryRun) writeBundleState(config, state);
    },
  });
  state = convergence.state;
  sessionLifecycle = convergence.sessionLifecycle || sessionLifecycle;
  result.sessionLifecycle = sessionLifecycle;
  if (convergence.result) {
    result.validation = convergence.result.validation;
    result.externalReview = convergence.result.externalReview;
    result.review = convergence.result.review;
    result.reviewPackage = convergence.result.reviewPackage || result.reviewPackage;
    result.reviewMutationGuard = convergence.result.reviewMutationGuard;
    aggregateFiles = convergence.result.changedFiles || aggregateFiles;
    aggregateForbidden = convergence.result.forbiddenChangedFiles || aggregateForbidden;
    finalHead = convergence.result.headSha || state.lastVerifiedHead || finalHead;
    prePushGate = convergence.prePushGate || prePushGate;
  }
  if (!convergence.ok) {
    result.outcome = convergence.outcome;
    result.bundle.state = summarizeBundleState(state);
    result.recovery = recovery?.summary();
    return stopBundle(result, convergence.outcome, convergence.reasonCode, convergence.reason, {
      reviewConvergence: convergence.summary,
    });
  }
  if (!prePushGate.ok || (!config.dryRun && result.review.verdict?.verdict !== "approve")) {
    recovery?.stop("bundle_review_failed", prePushGate.reason || result.review.verdict?.verdict || "bundle_review_failed", "run_focused_fix_or_escalate");
    return stopBundle(result, prePushGate.outcome || "codex_review_failed", prePushGate.reason || "bundle_review_failed", prePushGate.message || "Bundle review failed.");
  }

  recovery?.advance("push", "push_bundle_branch");
  result.push = await pushBranch(config, bundleBranchName, { effectContext: sessionLifecycle });
  if (!config.dryRun && (result.push.error || result.push.status !== 0)) {
    recovery?.stop("bundle_push_failed", result.push.error || `status ${result.push.status}`, "retry_bounded_or_manual");
    return stopBundle(result, "auto_failed", "bundle_push_failed", "Bundle branch push failed.");
  }
  recovery?.marker("push", `branch-${bundleBranchName}`, { target: bundleBranchName, correlation: finalHead || runId });
  recovery?.advance("pr_create_recover", "open_bundle_pr");
  result.pr = await openOrUpdatePr(config, issue, bundleBranchName, bundlePrSummary({ result, state, plan }), { effectContext: sessionLifecycle });
  if (result.pr?.url || result.pr?.number) {
    recovery?.setPr(result.pr);
    recovery?.marker("pr_create", `bundle-${plan.id}-issue-${issue.number}`, {
      target: result.pr.url || String(result.pr.number),
      correlation: finalHead || runId,
    });
  }
  if (!config.dryRun && result.pr.url) {
    recovery?.advance("ci_wait", "wait_bundle_checks");
    result.ci = watchChecks(config, result.pr.url);
    recovery?.evidence("ciChecks", { status: "recorded", headSha: finalHead, baseSha: baseOriginMainSha, changedFiles: aggregateFiles });
  }
  recovery?.advance("exact_head_final_refresh", "evaluate_bundle_merge_or_pr_state");
  result.autoMerge = await evaluateOrExecuteBundleAutoMerge(config, { issue, result, branchName: bundleBranchName, changedFiles: aggregateFiles, forbidden: aggregateForbidden, laneDecision: planned.laneDecision, autoMergeRunner, sessionLifecycle });
  result.outcome = result.autoMerge.result === "merged" ? "auto_merged" : "approved_pr_opened";
  if (result.autoMerge.result === "merged") {
    recovery?.marker("merge", `bundle-pr-${result.pr?.number || result.pr?.url}-${finalHead || "head"}`, {
      target: result.pr?.url || String(result.pr?.number || ""),
      correlation: result.autoMerge.mergeSha || finalHead || runId,
    });
    recovery?.advance("post_merge_current_main_checks_scanner_reconciliation", "reconcile_current_main");
  }
  recovery?.complete(result.outcome);
  result.recovery = recovery?.summary();
  result.bundle.state = summarizeBundleState(state);
  return result;
}

function routeBundleStructuredFindingsToConvergence(result) {
  const gemini = structuredLargeCandidateFindings(result.largeCandidateReview, "gemini").map(bundleConvergenceFinding);
  const codex = structuredLargeCandidateFindings(result.largeCandidateReview, "codex-local").map(bundleConvergenceFinding);
  if (gemini.length + codex.length === 0) return false;
  if (gemini.length > 0) result.externalReview = {
    ...result.externalReview,
    status: "blocked",
    verdict: "fail",
    sanitizedResponseSummary: { verdict: "fail", findings: gemini },
    reason: "blocked_external_reviewer_non_pass",
  };
  if (codex.length > 0) result.review = {
    ...result.review,
    verdict: {
      ...(result.review?.verdict || {}),
      verdict: "changes_requested",
      recommended_next_action: "run_safe_fix_cycle",
      blocking_findings: codex,
    },
  };
  return true;
}

function bundleConvergenceFinding(finding) {
  return { severity: finding.severity, path: finding.path, message: finding.summary };
}

export async function runBundleReviewConvergence(config, input, deps = {}) {
  const writeState = input.writeState || (() => {});
  let state = input.state;
  let currentResult = {
    validation: input.validation,
    externalReview: input.result?.externalReview,
    review: input.result?.review,
    reviewPackage: input.reviewPackage,
    reviewMutationGuard: input.result?.reviewMutationGuard || { mutationDetected: false },
  };
  let changedFiles = input.changedFiles || [];
  let forbiddenChangedFiles = input.forbiddenChangedFiles || [];
  let prePushGate = input.prePushGate;
  const attempts = [];
  const dependencies = {
    runFixCycle: deps.runFixCycle || runBundleReviewFixCycle,
    commitAndRerun: deps.commitAndRerun || commitBundleReviewFixAndRerunExactHeadReviews,
    evaluatePrePushGate: deps.evaluatePrePushGate || evaluatePrePushReviewGate,
    persistExactHeadEvidence: deps.persistExactHeadEvidence || persistBundleExactHeadEvidence,
    sourceStateIdentity: deps.sourceStateIdentity || sourceStateIdentityForCommit,
  };

  while (true) {
    const codexNeedsConvergence = !config.dryRun && currentResult.review?.verdict?.verdict && currentResult.review.verdict.verdict !== "approve";
    const gateNeedsConvergence = !prePushGate.ok && prePushGate.outcome === "review_convergence_required";
    if (!codexNeedsConvergence && !gateNeedsConvergence) {
      return { ok: true, state, result: { ...currentResult, changedFiles, forbiddenChangedFiles, headSha: state.lastVerifiedHead }, prePushGate, attempts, sessionLifecycle: input.sessionLifecycle };
    }

    const source = codexNeedsConvergence ? "codex_mechanics_security_review" : "independent_review";
    const reason = codexNeedsConvergence
      ? currentResult.review.reviewFailureReason || currentResult.review.verdict?.verdict || "codex_review_failed"
      : prePushGate.reason || "review_convergence_required";
    state = markBundleReviewConvergenceRequired(state, {
      exactHead: state.lastVerifiedHead,
      outcome: "review_convergence_required",
      reason,
      message: codexNeedsConvergence
        ? "Exact-head Codex mechanics/security review requires bounded bundle convergence."
        : prePushGate.message,
      source,
    });
    writeState(state);

    const cycleDecision = evaluateCycleBudget(state.reviewConvergenceState, config, state.reviewConvergenceHistory || []);
    if (!cycleDecision.ok) {
      input.recovery?.stop(`bundle_review_convergence_${cycleDecision.terminalReason || "blocked"}`, cycleDecision.reason, "stop_fail_closed");
      return {
        ok: false,
        outcome: terminalOutcomeForConvergence(cycleDecision.terminalReason),
        reasonCode: cycleDecision.terminalReason || "bundle_review_convergence_blocked",
        reason: cycleDecision.reason,
        state,
        attempts,
        summary: { budget: cycleDecision },
      };
    }
    if (cycleDecision.transitionedState) {
      state = {
        ...state,
        reviewConvergenceState: cycleDecision.transitionedState,
      };
      writeState(state);
      cycleDecision.transitionedState = state.reviewConvergenceState;
    }

    input.recovery?.advance("review_fix", source === "codex_mechanics_security_review" ? "run_bundle_codex_review_convergence" : "run_bundle_review_convergence");
    const fixAttempt = await dependencies.runFixCycle(config, {
      issue: input.issue,
      laneDecision: input.laneDecision,
      plan: input.plan,
      state,
      branchName: input.branchName,
      changedFiles,
      forbiddenChangedFiles,
      validation: currentResult.validation,
      externalReview: currentResult.externalReview,
      review: currentResult.review,
      reviewPackage: currentResult.reviewPackage,
      attemptCount: state.reviewConvergenceState.sourceChangingCycle,
      reviewConvergenceState: state.reviewConvergenceState,
      diagnosticAuthorization: cycleDecision.diagnosticAuthorization,
      source,
      sessionLifecycle: input.sessionLifecycle,
    });
    attempts.push(fixAttempt);
    if (fixAttempt.sessionLifecycle) input.sessionLifecycle = fixAttempt.sessionLifecycle;
    if (!fixAttempt.proceeded) {
      input.recovery?.stop("bundle_review_convergence_fix_not_proceeded", fixAttempt.reason, terminalNextAction(fixAttempt.reason));
      if (state.reviewConvergenceState?.diagnosticReviewFix?.status === "pending") {
        state = {
          ...state,
          reviewConvergenceState: markDiagnosticReviewFixTerminal(state.reviewConvergenceState, fixAttempt.reason),
        };
      }
      state = markBundleStopped(state, { reasonCode: fixAttempt.reason || "bundle_review_convergence_fix_not_proceeded", reason: fixAttempt.reason });
      writeState(state);
      return {
        ok: false,
        outcome: outcomeForFixStop(fixAttempt.reason),
        reasonCode: fixAttempt.reason || "bundle_review_convergence_fix_not_proceeded",
        reason: `Bundle review convergence could not safely continue: ${fixAttempt.reason}.`,
        state,
        attempts,
        summary: { fixAttempt },
      };
    }

    const postFix = await dependencies.commitAndRerun(config, {
      issue: input.issue,
      laneDecision: input.laneDecision,
      plan: input.plan,
      state,
      branchName: input.branchName,
      baseSha: input.baseSha,
      fixAttempt,
      sessionLifecycle: input.sessionLifecycle,
    });
    if (postFix.sessionLifecycle) input.sessionLifecycle = postFix.sessionLifecycle;
    changedFiles = postFix.changedFiles || changedFiles;
    forbiddenChangedFiles = postFix.forbiddenChangedFiles || forbiddenChangedFiles;
    currentResult = {
      validation: bindValidationEvidence(postFix.validation, {
        headSha: postFix.runnerCreatedCommitSha,
        baseSha: input.baseSha,
        changedFiles,
        profile: input.laneDecision.validationProfile,
      }),
      externalReview: postFix.externalReview,
      review: postFix.review,
      reviewPackage: postFix.reviewPackage,
      largeCandidateReview: postFix.largeCandidateReview,
      reviewMutationGuard: postFix.reviewMutationGuard,
    };
    if (postFix.externalReview?.route?.largeCandidateRouting?.route === "large_bundle_escalation" && !postFix.largeCandidateReview?.ok) {
      const manualVerdict = structuredLargeCandidateManualVerdict(postFix.largeCandidateReview);
      if (manualVerdict) {
        const outcome = manualVerdict === "danger_gate" ? "danger_gate" : "blocked_needs_tommy";
        state = markBundleStopped(state, { reasonCode: `structured_review_${manualVerdict}`, reason: "Structured reviewer required a manual decision." });
        writeState(state);
        return { ok: false, outcome, reasonCode: `structured_review_${manualVerdict}`, reason: "Structured reviewer required a manual decision; no further mutation or push was attempted.", state, attempts, summary: { largeCandidateReview: postFix.largeCandidateReview } };
      }
      if (routeBundleStructuredFindingsToConvergence(postFix)) {
        currentResult = {
          ...currentResult,
          externalReview: postFix.externalReview,
          review: postFix.review,
          largeCandidateReview: postFix.largeCandidateReview,
        };
        continue;
      }
      state = markBundleStopped(state, { reasonCode: postFix.largeCandidateReview?.reasonCode || "large_candidate_review_incomplete", reason: "Post-fix structured large-candidate certification failed." });
      writeState(state);
      return { ok: false, outcome: "auto_failed", reasonCode: postFix.largeCandidateReview?.reasonCode || "large_candidate_review_incomplete", reason: "Post-fix structured large-candidate certification failed.", state, attempts, summary: { largeCandidateReview: postFix.largeCandidateReview } };
    }
    if (currentResult.reviewMutationGuard?.mutationDetected) {
      input.recovery?.stop("bundle_review_mutation_detected_after_convergence", currentResult.reviewMutationGuard.reason, "operator_recovery_required");
      state = markBundleStopped(state, {
        reasonCode: "bundle_review_mutation_detected_after_convergence",
        reason: currentResult.reviewMutationGuard.reason,
      });
      state = {
        ...state,
        reviewConvergenceState: {
          ...(state.reviewConvergenceState || {}),
          reviewMutationGuard: currentResult.reviewMutationGuard,
          continuation: {
            ...(state.reviewConvergenceState?.continuation || {}),
            status: "stopped",
            outcome: "bundle_review_mutation_detected",
            reason: currentResult.reviewMutationGuard.reason,
            recordedAt: new Date().toISOString(),
          },
        },
      };
      writeState(state);
      return {
        ok: false,
        outcome: "auto_failed",
        reasonCode: "bundle_review_mutation_detected_after_convergence",
        reason: currentResult.reviewMutationGuard.reason,
        state,
        attempts,
        summary: { reviewMutationGuard: currentResult.reviewMutationGuard },
      };
    }
    const sourceIdentity = postFix.runnerCreatedCommitSha
      ? dependencies.sourceStateIdentity({ baseRef: input.baseSha, headRef: postFix.runnerCreatedCommitSha })
      : { exactHead: null, treeId: null, patchId: null, patchIdReason: "dry_run_or_missing_head" };
    const accounted = accountConvergenceEvent(state.reviewConvergenceState, {
      kind: "source_changed",
      newHead: postFix.runnerCreatedCommitSha,
      reasonCode: "bundle_review_convergence_fix_commit",
    });
    state = {
      ...state,
      lastVerifiedHead: postFix.runnerCreatedCommitSha || state.lastVerifiedHead,
      sourceChangingCycle: accounted.state.sourceChangingCycle,
      reviewConvergenceState: accounted.state,
      reviewConvergenceHistory: [
        ...(state.reviewConvergenceHistory || []),
        {
          findingFingerprints: currentBundleReviewFindingFingerprints({
            externalReview: currentResult.externalReview,
            review: currentResult.review,
          }),
          claimedFixedFingerprints: claimedReviewFindingFingerprints({
            fixAttempt,
            externalReview: currentResult.externalReview,
            review: currentResult.review,
            source,
          }),
          exactHead: sourceIdentity.exactHead,
          treeId: sourceIdentity.treeId,
          patchId: sourceIdentity.patchId,
          patchIdKind: sourceIdentity.patchId ? "stable_patch_id" : null,
          patchIdReason: sourceIdentity.patchIdReason,
        },
      ],
      finalization: {
        ...state.finalization,
        validation: currentResult.validation,
        reviewPackage: postFix.reviewPackage?.packagePath || postFix.reviewPackage || state.finalization?.reviewPackage || null,
        externalReview: currentResult.externalReview,
        codexReview: currentResult.review,
      },
    };
    input.recovery?.headChanged(postFix.runnerCreatedCommitSha, "bundle_review_convergence_fix_commit");
    input.recovery?.marker("checkpoint_commit", `bundle-review-convergence-${postFix.runnerCreatedCommitSha || "dry-run"}`, {
      target: input.branchName,
      correlation: input.issue?.number || "",
    });
    const evidence = dependencies.persistExactHeadEvidence(input.recovery, {
      validation: currentResult.validation,
      externalReview: currentResult.externalReview,
      review: currentResult.review,
      headSha: postFix.runnerCreatedCommitSha,
      baseSha: input.baseSha,
      changedFiles,
    });
    if (evidence && !evidence.ok) {
      input.recovery?.stop("bundle_exact_head_evidence_incomplete_after_convergence", evidence.reasonCode, "regenerate_exact_head_evidence");
      state = markBundleStopped(state, { reasonCode: evidence.reasonCode || "bundle_exact_head_evidence_incomplete_after_convergence", reason: evidence.reason });
      writeState(state);
      return {
        ok: false,
        outcome: "auto_failed",
        reasonCode: evidence.reasonCode || "bundle_exact_head_evidence_incomplete_after_convergence",
        reason: "Bundle exact-head evidence was incomplete after convergence.",
        state,
        attempts,
        summary: { evidence },
      };
    }
    writeState(state);

    const reviewConvergence = buildLiveReviewConvergenceContext({
      config,
      issue: input.issue,
      laneDecision: input.laneDecision,
      branchName: input.branchName,
      baseRef: "main",
      exactHead: postFix.runnerCreatedCommitSha,
      sourceChangingCycle: state.sourceChangingCycle,
      reviewConvergenceState: state.reviewConvergenceState,
      relationships: {
        bundleId: input.plan?.id,
        sliceOrder: input.plan?.slices?.map((slice) => slice.id) || [],
      },
    });
    state = { ...state, reviewConvergenceState: reviewConvergence.gateInput.reviewConvergenceState };
    prePushGate = dependencies.evaluatePrePushGate({
      ...reviewConvergence.gateInput,
      laneDecision: input.laneDecision,
      externalReview: currentResult.externalReview,
      reviewMutationGuard: currentResult.reviewMutationGuard || { mutationDetected: false },
    });
  }
}

async function runBundleReviewFixCycle(config, context) {
  const trigger = extractReviewFixTrigger(context);
  const decision = evaluateReviewFixMutationDecision({ ...context, config, trigger });
  if (!decision.allowed) {
    return { attempted: false, proceeded: false, reason: decision.reason, decision };
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
    `${safeTimestamp()}-issue-${context.issue.number}-${slugify(context.issue.title, 40)}-bundle-review-fix.md`,
  );
  mkdirSync(path.dirname(promptPath), { recursive: true });
  writeFileSync(promptPath, prompt);
  let lifecycleState = context.sessionLifecycle;
  if (lifecycleState) {
    const synchronized = synchronizeSessionLifecycleCounters(config, lifecycleState, context.reviewConvergenceState?.counters || {
      localSourceChangingRoundsPerEpoch: 0, githubTriggeredFixEpochsPerPr: 0, lifetimeLocalSourceChangingRounds: 0,
    });
    if (!synchronized.ok) return { attempted: false, proceeded: false, reason: synchronized.reasonCode, decision, promptPath };
    lifecycleState = synchronized.state;
  }
  const codex = runCodexPrompt(config, {
    branchName: context.branchName,
    prompt,
    promptPath,
    ...(lifecycleState ? { sessionLifecycle: bundleLifecycleInvocation(lifecycleState, "bundle-review-fix") } : {}),
  }, "bundle-review-fix");
  if (codex.sessionLifecycle?.state) context.sessionLifecycle = codex.sessionLifecycle.state;
  if (!codex.skipped && (codex.error || codex.status !== 0)) {
    return { attempted: true, proceeded: false, reason: "review_fix_codex_failed", decision, promptPath, codex };
  }
  const changedFilesAfter = listWorkingTreeChangedFiles();
  const forbiddenChangedFilesAfter = filterForbiddenChangedFiles(changedFilesAfter, context.laneDecision);
  if (forbiddenChangedFilesAfter.length > 0) {
    return { attempted: true, proceeded: false, reason: `review_fix_forbidden_changed_files:${forbiddenChangedFilesAfter.join(",")}`, decision, promptPath, codex, changedFilesAfter, forbiddenChangedFilesAfter };
  }
  if (!config.dryRun && changedFilesAfter.length === 0) {
    return { attempted: true, proceeded: false, reason: "review_fix_left_no_changed_files", decision, promptPath, codex, changedFilesAfter, forbiddenChangedFilesAfter };
  }
  const validationPlan = planValidation(changedFilesAfter, context.laneDecision);
  const validationAfter = runValidationPlan(config, validationPlan);
  if (!validationAfter.passed) {
    return { attempted: true, proceeded: false, reason: "review_fix_validation_failed", decision, promptPath, codex, changedFilesAfter, forbiddenChangedFilesAfter, validationAfter };
  }
  return {
    attempted: true,
    proceeded: true,
    reason: "review_fix_passed_revalidation",
    decision,
    promptPath,
    codex,
    changedFilesAfter,
    forbiddenChangedFilesAfter,
    validationAfter,
    sessionLifecycle: codex.sessionLifecycle?.state || context.sessionLifecycle || null,
  };
}

function createBundleSessionLifecycle(config, input) {
  if (config.dryRun || config.sessionLifecycle?.enabled !== true) return null;
  const recovery = input.recoveryState || {};
  const state = createSessionLifecycleState({
    repository: config.repositorySlug,
    issueNumber: input.issue.number,
    taskKey: input.plan.taskKey || recovery.taskKey || "auto-runner",
    runId: input.runId,
    claimIdentity: recovery.claim?.identity || `issue-${input.issue.number}`,
    chargeMarkerRef: recovery.logicalTaskBudget?.chargeId || recovery.mutationMarkers?.logical_task_charge?.key || `accepted:${input.runId}:${input.issue.number}`,
    branchName: input.branchName,
    baseSha: input.baseSha,
    headSha: input.headSha,
    sessionId: `${input.runId}:bundle:0`,
    phase: "implementation_or_bundle_slice",
    nextExactAction: "run_next_bundle_slice",
    contextPolicy: config.sessionLifecycle.contextBudget,
    localSourceChangingRoundsPerEpoch: recovery.reviewConvergence?.counters?.localSourceChangingRoundsPerEpoch || 0,
    githubTriggeredFixEpochsPerPr: recovery.reviewConvergence?.counters?.githubTriggeredFixEpochsPerPr || 0,
    lifetimeLocalSourceChangingRounds: recovery.reviewConvergence?.counters?.lifetimeLocalSourceChangingRounds || 0,
    reservations: recovery.mutationMarkers || {},
    evidence: recovery.evidence || {},
    reportCorrelationKey: input.plan.taskKey || recovery.taskKey || "auto-runner",
  });
  const persisted = persistSessionLifecycleState(config, state);
  if (!persisted.ok) throw new Error(persisted.reasonCode);
  return persisted.state;
}

function bundleLifecycleInvocation(state, phase) {
  return {
    state,
    newSessionId: `${state.logicalTask.runId}:${phase}:${state.sessions.generation + 1}:${randomUUID()}`,
    phase,
    telemetry: {},
    mutationJournaled: true,
  };
}

async function commitBundleReviewFixAndRerunExactHeadReviews(config, { issue, laneDecision, plan, state, branchName, baseSha, fixAttempt, sessionLifecycle }) {
  const changedFilesBeforeCommit = fixAttempt.changedFilesAfter || [];
  const commit = await commitExplicitPaths(config, changedFilesBeforeCommit, `Feature bundle issue #${issue.number}: review-fix follow-up`, { effectContext: fixAttempt.sessionLifecycle || sessionLifecycle });
  const runnerCreatedCommitSha = config.dryRun ? null : getRefSha("HEAD");
  const changedFiles = config.dryRun ? changedFilesBeforeCommit : listChangedFiles("origin/main", "HEAD");
  const forbiddenChangedFiles = filterForbiddenChangedFiles(changedFiles, laneDecision);
  const validation = fixAttempt.validationAfter;
  const reviewPackage = writeBundleReviewPackage(config, {
    issue,
    laneDecision,
    plan,
    state: { ...state, lastVerifiedHead: runnerCreatedCommitSha || state.lastVerifiedHead },
    changedFiles,
    validation,
    headSha: runnerCreatedCommitSha,
    baseSha,
  });
  const externalReviewFingerprintBefore = captureBundleReviewCheckoutFingerprint(config);
  const externalReview = await runGeminiIntegratedReview(config, reviewPackage);
  const externalReviewMutationGuard = compareBundleReviewCheckoutFingerprint(externalReviewFingerprintBefore, captureBundleReviewCheckoutFingerprint(config), {
    phase: "bundle_convergence_external_review",
  });
  if (externalReviewMutationGuard.mutationDetected) {
    return {
      changedFiles,
      forbiddenChangedFiles,
      validation,
      commit,
      runnerCreatedCommitSha,
      reviewPackage,
      externalReview,
      review: null,
      reviewMutationGuard: externalReviewMutationGuard,
    };
  }
  const codexReviewFingerprintBefore = captureBundleReviewCheckoutFingerprint(config);
  const review = runReviewPrompt(config, { ...reviewPackage, sessionLifecycle: fixAttempt.sessionLifecycle || sessionLifecycle || null });
  const codexReviewMutationGuard = compareBundleReviewCheckoutFingerprint(codexReviewFingerprintBefore, captureBundleReviewCheckoutFingerprint(config), {
    phase: "bundle_convergence_codex_review",
  });
  const largeCandidateReview = externalReview?.route?.largeCandidateRouting?.route === "large_bundle_escalation"
    ? await certifyLargeBundleCumulativeReview({ config, issue, reviewPackage, changedFiles, headSha: runnerCreatedCommitSha, baseSha, externalReview, codexReview: review, sessionLifecycle: review.sessionLifecycle || fixAttempt.sessionLifecycle || sessionLifecycle })
    : { ok: true, state: "external_review_complete", verdict: "pass", route: "normal" };
  const structuredReviewMutationGuard = compareBundleReviewCheckoutFingerprint(codexReviewFingerprintBefore, captureBundleReviewCheckoutFingerprint(config), {
    phase: "bundle_convergence_structured_review",
  });
  return {
    changedFiles,
    forbiddenChangedFiles,
    validation,
    commit,
    runnerCreatedCommitSha,
    reviewPackage,
    externalReview,
    review,
    largeCandidateReview,
    sessionLifecycle: largeCandidateReview.sessionLifecycle || review.sessionLifecycle || fixAttempt.sessionLifecycle || sessionLifecycle || null,
    reviewMutationGuard: mergeBundleReviewMutationGuards(externalReviewMutationGuard, codexReviewMutationGuard, structuredReviewMutationGuard),
  };
}

async function certifyLargeBundleCumulativeReview({ config, issue, reviewPackage, changedFiles, headSha, baseSha, externalReview, codexReview, sessionLifecycle = null }) {
  let structuredLifecycle = codexReview?.sessionLifecycle || sessionLifecycle;
  const invoke = (provider, structuredReview) => runBundleStructuredReviewCall(config, reviewPackage, provider, structuredReview, structuredLifecycle, (next) => { structuredLifecycle = next; });
  const certification = await persistCumulativeLargeCandidateReview({
    config,
    taskKey: config.taskKey || `issue-${issue?.number || "unknown"}`,
    candidateIdentity: {
      repository: config.repositorySlug || "tommytang213/Settleora",
      baseSha,
      headSha,
      treeSha: config.dryRun ? headSha : getRefSha("HEAD^{tree}"),
      diffDigest: reviewPackage?.summary?.rawDiffSha256 || createHash("sha256").update(String(reviewPackage?.diff || "")).digest("hex"),
      changedFilesDigest: createHash("sha256").update(JSON.stringify([...changedFiles].sort())).digest("hex"),
    },
    changedFiles,
    integrationBoundaries: ["tools/auto-runner/settleora-auto-runner.mjs", "tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"],
    integrationBoundaryMaterial: bundleIntegrationBoundaryMaterial(config.repoRoot, ["tools/auto-runner/settleora-auto-runner.mjs", "tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"]),
    externalReview,
    codexReview,
    invokeSection: ({ provider, section, manifest }) => invoke(provider, { phase: "section", section, manifest }),
    invokeIntegration: ({ provider, manifest, sections }) => invoke(provider, { phase: "integration", manifest, sections }),
  });
  return { ...certification, sessionLifecycle: structuredLifecycle };
}

function bundleIntegrationBoundaryMaterial(repoRoot = process.cwd(), paths) {
  return paths.map((relativePath) => {
    const content = readFileSync(path.join(repoRoot, relativePath), "utf8");
    return { path: relativePath, sha256: createHash("sha256").update(content).digest("hex"), content };
  });
}

async function runBundleStructuredReviewCall(config, reviewPackage, provider, structuredReview, sessionLifecycle = null, onLifecycle = null) {
  const scopedPackage = { ...reviewPackage, summary: { ...reviewPackage.summary, structuredReview: { phase: structuredReview.phase, sectionId: structuredReview.section?.id || null, changedPaths: structuredReview.section?.changedPaths || [], sections: (structuredReview.sections || []).map((entry) => ({ id: entry.id, status: entry.status, findings: (entry.findings || []).slice(0, 20) })), coverageSections: structuredReview.manifest.sections.map((entry) => ({ id: entry.id, changedPaths: entry.changedPaths })), manifestDigest: structuredReview.manifest.manifestDigest } } };
  const evidence = provider === "gemini" ? await runGeminiIntegratedReview(config, scopedPackage) : runReviewPrompt(config, { ...scopedPackage, sessionLifecycle });
  if (evidence?.sessionLifecycle && onLifecycle) onLifecycle(evidence.sessionLifecycle);
  const pass = provider === "gemini" ? evidence?.status === "pass" && evidence?.verdict === "pass" : evidence?.verdict?.verdict === "approve";
  const reasonCode = evidence?.reason || evidence?.reviewFailureReason || null;
  const reviewerVerdict = provider === "gemini" ? evidence?.verdict || evidence?.sanitizedResponseSummary?.verdict : evidence?.verdict?.verdict;
  return { ...(structuredReview.section ? { id: structuredReview.section.id } : {}), status: pass ? "pass" : "blocked", reviewerVerdict, manifestDigest: structuredReview.manifest.manifestDigest, findings: bundleStructuredFindings(evidence), evidencePath: evidence?.reportPath || evidence?.logPath || null, reasonCode, contextLimited: /context|token|truncat|over.?budget/i.test(reasonCode || ""), attestationSource: evidence?.attestationSource, providerPromptBindingDigest: evidence?.providerPromptBindingDigest, attestedCandidateIdentity: evidence?.attestedCandidateIdentity, attestedIntegrationBoundaries: evidence?.attestedIntegrationBoundaries };
}

function bundleStructuredFindings(evidence) {
  return [
    ...(evidence?.sanitizedResponseSummary?.findings || []),
    ...(evidence?.verdict?.blocking_findings || []),
    ...(evidence?.verdict?.non_blocking_findings || []),
    ...(evidence?.findings || []),
  ].slice(0, 20).map((finding) => typeof finding === "string"
    ? { severity: "reviewer", path: null, summary: finding.slice(0, 500) }
    : { severity: finding?.severity || "reviewer", path: finding?.path || null, summary: String(finding?.summary || finding?.message || "").slice(0, 500) });
}

function persistBundleLargeCandidateSplit(config, { issue, plan, reviewPackage, changedFiles, headSha, baseSha, externalReview }) {
  const slices = (plan?.slices || []).map((slice) => ({
    ...slice,
    changedFiles: slice.changedFiles || slice.allowedPaths || [],
    issueNumber: slice.issueNumber || issue.number,
    taskKey: slice.taskKey || `${config.taskKey || `issue-${issue.number}`}:${slice.id}`,
    allowedPathsProven: slice.allowedPathsProven === true,
    semanticOwnDeltaProven: slice.semanticOwnDeltaProven === true,
    executionAuthorityProven: slice.executionAuthorityProven === true,
    dependsOn: slice.dependsOn || [],
  }));
  return persistLargeCandidateSplitDecision({
    config,
    taskKey: config.taskKey || `issue-${issue.number}`,
    candidateIdentity: { repository: config.repositorySlug || "tommytang213/Settleora", baseSha, headSha, treeSha: reviewPackage.summary?.treeSha, diffDigest: reviewPackage.summary?.rawDiffSha256, changedFilesDigest: createHash("sha256").update(JSON.stringify([...changedFiles].sort())).digest("hex") },
    classification: externalReview.route.largeCandidateRouting,
    changedFiles,
    slices,
  });
}

function markBundleReviewConvergenceRequired(state, { exactHead, outcome, reason, message, source }) {
  return {
    ...state,
    reviewConvergenceState: {
      ...(state.reviewConvergenceState || {}),
      continuation: {
        status: "required",
        outcome,
        reason,
        message,
        exactHead,
        source,
        recordedAt: new Date().toISOString(),
      },
    },
  };
}

function terminalOutcomeForConvergence(terminalReason) {
  if (terminalReason === "UNSAFE_SCOPE_CHANGE") return "scope_failed";
  if (terminalReason === "VALIDATION_BLOCKED") return "validation_failed";
  if (terminalReason === "REVIEW_PROVIDER_BLOCKED") return "auto_failed";
  if (terminalReason === "MANUAL_DECISION_REQUIRED") return "blocked_needs_tommy";
  return "review_changes_requested_retry_exhausted";
}

function outcomeForFixStop(reason = "") {
  if (String(reason).includes("forbidden_changed_files") || String(reason).includes("unsafe") || String(reason).includes("outside_contract")) return "scope_failed";
  if (String(reason).includes("validation")) return "validation_failed";
  if (String(reason).includes("manual") || String(reason).includes("needs_tommy")) return "blocked_needs_tommy";
  return "review_changes_requested_retry_exhausted";
}

function terminalNextAction(reason = "") {
  if (String(reason).includes("forbidden") || String(reason).includes("unsafe") || String(reason).includes("outside_contract")) return "stop_fail_closed";
  if (String(reason).includes("manual") || String(reason).includes("needs_tommy")) return "manual_recovery_required";
  return "create_or_reuse_followup_or_escalate";
}

export function generateBundleSlicePrompt(config, { issue, laneDecision, plan, slice, branchName, state }) {
  const timestampKey = `${safeTimestamp().replace(/[^0-9TZ]/g, "").slice(0, 15)}-${slice.sequence}-${slice.id}`;
  const reportPath = path.join(
    config.repoRoot,
    ".codex",
    "reports",
    `settleora-codex-report-${timestampKey}-issue-${issue.number}-bundle-${slice.id}.md`,
  );
  const promptPath = path.join(config.logsRoot, "tasks", `${timestampKey}-issue-${issue.number}-bundle-${slice.id}.md`);
  const completed = Object.values(state.slices || {})
    .filter((item) => item.state === "completed")
    .map((item) => ({ id: item.id, commitSha: item.commitSha, validation: item.checkpointValidation?.passed === true }));
  const prompt = `# Settleora Feature-Bundle Slice Task

HKT generated time: ${hktTimestamp()}
Task timestamp key: ${timestampKey}

- Parent issue: #${issue.number}
- Target branch: \`${branchName}\`
- Base SHA: \`${state.baseSha || "dry-run"}\`
- Current checkpoint head: \`${state.lastVerifiedHead || "dry-run"}\`
- Bundle ID: \`${plan.id}\`
- Bundle plan digest: \`${plan.planDigest}\`
- Slice: ${slice.sequence}/${plan.sliceCount} \`${slice.id}\` - ${slice.title}
- Slice objective: ${slice.objective}
- Slice allowed paths: ${slice.allowedPaths.join(", ")}
- Slice validation profile: \`${slice.validationProfile}\`
- Parent lane: \`${laneDecision.lane}\`
- Parent allowed paths: ${laneDecision.allowedPaths.join(", ")}
- Expected local report path: \`${reportPath}\`

## Prior Checkpoints

\`\`\`json
${JSON.stringify(completed, null, 2)}
\`\`\`

## Stop Conditions

Stop if this slice needs files outside its slice scope, changes parent contract boundaries, changes secrets, runtime/product/API/security/money/schema/deployment/OpenAPI/generated-client scope, invalidates earlier checkpoint evidence, or cannot produce the expected report.
`;
  mkdirSync(path.dirname(promptPath), { recursive: true });
  writeFileSync(promptPath, prompt);
  return { promptPath, reportPath, timestampKey, prompt };
}

function writeBundleReviewPackage(config, { issue, laneDecision, plan, state, changedFiles, validation, headSha, baseSha }) {
  const diff = config.dryRun ? { text: "", truncated: false } : getBoundedDiff("origin/main", "HEAD");
  const packagePath = path.join(config.logsRoot, "reviews", `${safeTimestamp()}-issue-${issue.number}-feature-bundle.json`);
  const summary = {
    repository: config.repositorySlug || "tommytang213/Settleora",
    reviewPhase: "feature-bundle-final",
    issue: { number: issue.number, title: issue.title, labels: issue.labels || [], url: issue.url || null },
    bundle: summarizeBundleState(state),
    featureBundle: { architectureConsistent: plan.architectureConsistent === true },
    planDigest: plan.planDigest,
    laneDecision,
    reviewerPolicy: reviewerReadinessSummary(config, { changedFiles, laneDecision, stats: { additions: 0, deletions: 0 } }),
    changedFiles,
    currentHead: headSha,
    baseSha,
    treeSha: config.dryRun ? headSha : getRefSha("HEAD^{tree}"),
    validation,
    externalReviewRequired: requiresIndependentAiReview(laneDecision),
    integrationBoundaries: ["tools/auto-runner/settleora-auto-runner.mjs", "tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"],
    integrationBoundaryMaterial: bundleIntegrationBoundaryMaterial(config.repoRoot, ["tools/auto-runner/settleora-auto-runner.mjs", "tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"]),
    rawDiffSha256: createHash("sha256").update(diff.text).digest("hex"),
    diffTruncated: diff.truncated,
  };
  mkdirSync(path.dirname(packagePath), { recursive: true });
  writeFileSync(packagePath, `${JSON.stringify({ summary, diff: diff.text }, null, 2)}\n`);
  return { packagePath, summary, diff: diff.text };
}

async function evaluateOrExecuteBundleAutoMerge(config, { issue, result, branchName, changedFiles, forbidden, laneDecision, autoMergeRunner = null, sessionLifecycle = null }, deps = {}) {
  const dependencies = {
    inspectState: deps.inspectState || inspectAutoMergeGithubState,
    executeMerge: deps.executeMerge || executeAutoMerge,
    evaluateDecision: deps.evaluateDecision || evaluateAutoMergeDecision,
    writeEvidence: deps.writeEvidence || writeAutoMergeEvidence,
  };
  const baseContext = {
    config,
    sessionLifecycle,
    issue: { number: issue.number, title: issue.title, state: issue.state || "OPEN", labels: issue.labels || [] },
    laneDecision,
    changedFiles,
    forbiddenChangedFiles: forbidden,
    changedFilesExactlyMatchAllowedPaths: forbidden.length === 0,
    externalReviewRequired: result.externalReview?.status !== "skipped" || requiresIndependentAiReview(laneDecision),
    externalReview: result.externalReview,
    review: result.review,
    codexMechanicsReviewApproved: result.review?.verdict?.verdict === "approve",
    validation: result.validation,
    worktreeClean: config.dryRun ? true : getStatusShort() === "",
    branchName,
    runnerCreatedCommitSha: config.dryRun ? null : getRefSha("HEAD"),
    expectedHeadSha: config.dryRun ? null : getRefSha("HEAD"),
    expectedOriginMainSha: result.baseOriginMainSha,
    currentOriginMainSha: result.baseOriginMainSha,
    pr: {
      state: "OPEN",
      isDraft: false,
      baseRefName: "main",
      headRefName: branchName,
      headRefOid: config.dryRun ? null : getRefSha("HEAD"),
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      url: result.pr?.url,
    },
    requiredChecks: [],
    reviewThreads: [],
    codeScanningAlerts: [],
    blockingMarkers: [],
  };
  if (!config.allowAutoMerge) {
    const decision = dependencies.evaluateDecision(baseContext);
    return { ...decision, evidence: dependencies.writeEvidence(config, decision, baseContext) };
  }
  const runnerPreflight = validateFeatureBundleAutoMergeRunner({ config, runner: autoMergeRunner });
  if (!runnerPreflight.ok) {
    const decision = {
      eligible: false,
      result: "blocked",
      reason: runnerPreflight.reasonCode,
      reasonCode: runnerPreflight.reasonCode,
      blockingMarkers: [runnerPreflight.reasonCode],
      runnerAuthority: runnerPreflight.evidence || null,
    };
    return { ...decision, evidence: dependencies.writeEvidence(config, decision, baseContext) };
  }
  const githubState =
    config.dryRun || !result.pr?.url ? {} : dependencies.inspectState(config, { issue, prUrlOrNumber: result.pr.url }, { runner: autoMergeRunner });
  const mergeContext = {
    ...baseContext,
    ...githubState,
    issue: githubState.issue || baseContext.issue,
    pr: { ...baseContext.pr, ...(githubState.pr || {}) },
    requiredChecks: githubState.requiredChecks || [],
    reviewThreads: githubState.reviewThreads || [],
    codeScanningAlerts: githubState.codeScanningAlerts || [],
    blockingMarkers: githubState.blockingMarkers || [],
    autoMergeCommandEvidence: githubState.commandEvidence || [],
    autoMergeRunnerIdentity: autoMergeRunner?.settleoraRunnerIdentity || null,
  };
  return dependencies.executeMerge(config, mergeContext, { runner: autoMergeRunner });
}

function validateFeatureBundleAutoMergeRunner({ config = {}, runner = null } = {}) {
  if (config.dryRun) {
    return { ok: true, dryRun: true, evidence: { dryRun: true, runnerIdentity: runner?.settleoraRunnerIdentity || null } };
  }
  if (typeof runner !== "function" || runner.settleoraRunnerMode === "noop" || runner.settleoraNoopRunner === true) {
    return { ok: false, reasonCode: "feature_bundle_auto_merge_runner_missing", reason: "Feature-bundle auto-merge requires an injected live runner." };
  }
  if (runner.settleoraFixedArgvRunner !== true || runner.settleoraRunnerMode !== "live") {
    return { ok: false, reasonCode: "feature_bundle_auto_merge_runner_malformed", reason: "Feature-bundle auto-merge runner must be live fixed-argv." };
  }
  const identity = runner.settleoraRunnerIdentity || {};
  if (identity.kind !== "live-fixed-argv" || !identity.repositorySlug || !identity.repoRoot) {
    return { ok: false, reasonCode: "feature_bundle_auto_merge_runner_malformed", reason: "Feature-bundle auto-merge runner identity is incomplete." };
  }
  const expectedRepository = String(config.repositorySlug || "");
  const expectedRoot = path.resolve(config.repoRoot || process.cwd());
  if (identity.repositorySlug !== expectedRepository || path.resolve(identity.repoRoot) !== expectedRoot) {
    return {
      ok: false,
      reasonCode: "feature_bundle_auto_merge_runner_repository_mismatch",
      reason: "Feature-bundle auto-merge runner identity does not match configured repository.",
      evidence: {
        expectedRepository,
        actualRepository: identity.repositorySlug,
        expectedRoot,
        actualRoot: identity.repoRoot,
      },
    };
  }
  return { ok: true, evidence: { runnerIdentity: identity } };
}

function bundlePrSummary({ result, state, plan }) {
  return [
    `Feature bundle: ${plan.id}`,
    `Bundle plan digest: ${plan.planDigest}`,
    `Slices: ${plan.slices.map((slice) => `${slice.sequence}. ${slice.id}`).join(", ")}`,
    `Checkpoint commits: ${Object.entries(summarizeBundleState(state).checkpointCommits || {}).map(([id, sha]) => `${id}=${sha}`).join(", ") || "none"}`,
    `Final validation: ${result.validation?.passed ? "passed" : "failed"}`,
    `External review: ${result.externalReview?.status || "not-run"} ${result.externalReview?.reason || ""}`,
    `Codex mechanics/security review: ${result.review?.verdict?.verdict || "not-run"}`,
    "Manual merge remains required when the issue contract requires it.",
  ].join("\n");
}

function stopBundle(result, outcome, reasonCode, reason, extra = {}) {
  return {
    ...result,
    ...extra,
    ok: false,
    outcome,
    stopReason: { reasonCode, reason },
  };
}

function stopForBundleReviewMutation({ config, result, state, recovery, guard, phase }) {
  const reason = guard.reason || `Bundle review command mutated checkout during ${phase}.`;
  const stoppedState = markBundleStopped(state, { reasonCode: "bundle_review_mutation_detected", reason });
  if (config && !config.dryRun) writeBundleState(config, stoppedState);
  recovery?.stop("bundle_review_mutation_detected", reason, "operator_recovery_required");
  return stopBundle(result, "auto_failed", "bundle_review_mutation_detected", reason, {
    reviewMutationGuard: guard,
    bundle: {
      ...result.bundle,
      state: summarizeBundleState(stoppedState),
    },
    recovery: recovery?.summary(),
  });
}

function captureBundleReviewCheckoutFingerprint(config = {}) {
  if (config.dryRun) {
    return {
      dryRun: true,
      branch: null,
      head: null,
      status: "",
      untracked: [],
    };
  }
  const cwd = config.repoRoot || process.cwd();
  const branch = runGit(["branch", "--show-current"], { cwd });
  const head = runGit(["rev-parse", "HEAD"], { cwd });
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], { cwd });
  const status = runGit(["status", "--porcelain=v1"], { cwd });
  const gitResults = [branch, head, status, untracked];
  return {
    dryRun: false,
    branch: branch.stdout.trim(),
    head: head.stdout.trim(),
    status: status.stdout.split(/\r?\n/).filter(Boolean).sort().join("\n"),
    untracked: untracked.stdout.split(/\r?\n/).filter(Boolean).sort(),
    gitReadErrors: gitResults.filter((result) => result.error || result.status !== 0).map((result) => ({
      command: result.command,
      status: result.status,
      error: result.error || result.stderr || result.stdout,
    })),
  };
}

function compareBundleReviewCheckoutFingerprint(before, after, { phase } = {}) {
  if (before?.dryRun || after?.dryRun) {
    return { mutationDetected: false, phase: phase || "bundle_review", before, after, reason: null, changedFields: [] };
  }
  const changedFields = [];
  if (before?.branch !== after?.branch) changedFields.push("branch");
  if (before?.head !== after?.head) changedFields.push("head");
  if (before?.status !== after?.status) changedFields.push("status");
  if (JSON.stringify(before?.untracked || []) !== JSON.stringify(after?.untracked || [])) changedFields.push("untracked");
  if ((before?.gitReadErrors || []).length > 0 || (after?.gitReadErrors || []).length > 0) changedFields.push("git_read_error");
  const mutationDetected = changedFields.length > 0;
  return {
    mutationDetected,
    phase: phase || "bundle_review",
    changedFields,
    before,
    after,
    reason: mutationDetected
      ? `Bundle review command mutated checkout during ${phase || "bundle_review"}: ${changedFields.join(",")}`
      : null,
  };
}

function mergeBundleReviewMutationGuards(...guards) {
  const changedFields = [...new Set(guards.flatMap((guard) => guard?.changedFields || []))].sort();
  const mutation = guards.find((guard) => guard?.mutationDetected);
  return {
    mutationDetected: Boolean(mutation),
    phase: mutation?.phase || guards.map((guard) => guard?.phase).filter(Boolean).join("+") || "bundle_review",
    changedFields,
    reason: mutation?.reason || null,
    guards,
  };
}

function currentBundleReviewFindingFingerprints({ externalReview, review } = {}) {
  return reviewFindingFingerprintsFromSupportedContainers({ externalReview, review }).sort();
}

function createBundleRecoveryRecorder(config, input) {
  if (config.dryRun) return null;
  let state = input.existingState || createInitialRecoveryState({
    taskKey: input.taskKey,
    issue: input.issue,
    runId: input.runId,
    supervisorRunId: input.supervisorRunId,
    branchName: input.branchName,
    baseSha: input.baseSha,
    currentHeadSha: input.currentHeadSha,
    phase: "branch_setup",
    firstIncompleteAction: "recover_or_create_bundle_branch",
    featureBundle: input.featureBundle,
  });
  let statePath = null;
  const persist = (nextState) => {
    const written = writeRecoveryState(config, nextState);
    state = written.state;
    statePath = written.statePath;
    return state;
  };
  persist({
    ...state,
    featureBundle: {
      ...(state.featureBundle || {}),
      ...(input.featureBundle || {}),
    },
  });
  return {
    get state() {
      return state;
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
    headChanged(newHeadSha, reasonCode) {
      return persist(invalidateEvidenceForHeadChange(state, { newHeadSha, reasonCode }));
    },
    marker(kind, key, marker = {}) {
      return persist(recordIdempotentMutation(state, { kind, key, marker }));
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
        action: "production_bundle_recovery_state_recorded",
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
          featureBundle: state.featureBundle || null,
          stopReason: state.stopReason,
        },
      };
    },
  };
}

function persistBundleExactHeadEvidence(recovery, { validation, externalReview, review, headSha, baseSha, changedFiles }) {
  if (!recovery) return null;
  const changedFilesDigest = validation?.changedFilesDigest || externalReview?.changedFilesDigest || review?.changedFilesDigest || null;
  return recovery.completeHeadEvidence?.(
    {
      localValidation: {
        status: validation?.passed ? "passed" : "failed",
        headSha,
        baseSha,
        changedFiles,
        changedFilesDigest,
        source: "local_validation",
        profile: validation?.profile,
        summary: "bundle final exact-head validation",
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
}

function gitObjectExists(config, sha) {
  if (!sha) return false;
  const result = runGit(["cat-file", "-e", `${sha}^{commit}`], { cwd: config.repoRoot });
  return !result.error && result.status === 0;
}

function fileExists(filePath) {
  return Boolean(filePath && existsSync(filePath));
}

function recoverExistingBundleCheckout(config, { plan, baseOriginMainSha }) {
  const loaded = recoverBundleState(config, {
    plan,
    branchName: "__probe__",
    baseSha: baseOriginMainSha,
    currentHeadSha: "__probe__",
    worktreeClean: getStatusShort() === "",
    evidence: {},
  });
  if (loaded.reasonCode === "bundle_state_missing") return loaded;
  if (!loaded.state) {
    return loaded.reasonCode === "bundle_state_branch_mismatch" || loaded.reasonCode === "bundle_state_head_mismatch"
      ? loadStateForBranchSwitch(config, { plan, baseOriginMainSha })
      : loaded;
  }
  return loaded;
}

function loadStateForBranchSwitch(config, { plan, baseOriginMainSha }) {
  const state = readBundleStateForRecovery(config, plan);
  if (!state.ok) return state;
  if (state.state.baseSha !== baseOriginMainSha) {
    return { ok: false, reasonCode: "bundle_state_base_mismatch", reason: "Bundle base changed." };
  }
  const switchResult = runGit(["switch", state.state.branch], { cwd: config.repoRoot });
  if (switchResult.error || switchResult.status !== 0) {
    return { ok: false, reasonCode: "bundle_state_branch_checkout_failed", reason: switchResult.stderr || switchResult.error };
  }
  const recovered = recoverBundleState(config, {
    plan,
    branchName: state.state.branch,
    baseSha: baseOriginMainSha,
    currentHeadSha: getRefSha("HEAD"),
    worktreeClean: getStatusShort() === "",
    evidence: {
      commitExists: (sha) => gitObjectExists(config, sha),
      reportExists: (reportPath) => fileExists(reportPath),
    },
  });
  if (!recovered.ok) return recovered;
  return {
    ok: true,
    state: recovered.state,
    recovery: {
      reasonCode: recovered.reasonCode,
      nextSliceId: recovered.nextSliceId,
      completedSliceIds: recovered.completedSliceIds,
    },
  };
}

function readBundleStateForRecovery(config, plan) {
  try {
    return loadBundleState(config, plan);
  } catch (error) {
    return { ok: false, reasonCode: "bundle_state_load_failed", reason: error.message };
  }
}

export const featureBundleOrchestratorTestInternals = {
  evaluateOrExecuteBundleAutoMerge,
  validateFeatureBundleAutoMergeRunner,
};
