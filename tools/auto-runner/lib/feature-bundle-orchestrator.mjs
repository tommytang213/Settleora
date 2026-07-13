import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
} from "./git-workspace.mjs";
import { filterForbiddenChangedFiles } from "./lane-policy.mjs";
import { runCodexPrompt, runReviewPrompt } from "./codex-runner.mjs";
import { collectReport } from "./report-collector.mjs";
import { bindValidationEvidence, planValidation, runValidationPlan } from "./validation-planner.mjs";
import { inspectPreReviewPrOwnership, openOrUpdatePr, pushBranch, watchChecks } from "./pr-manager.mjs";
import { hktTimestamp, safeTimestamp, slugify } from "./logger.mjs";
import { runGeminiIntegratedReview } from "./gemini-reviewer.mjs";
import { reviewerReadinessSummary } from "./reviewer-policy.mjs";
import {
  evaluateAutoMergeDecision,
  evaluatePrePushReviewGate,
  executeAutoMerge,
  inspectAutoMergeGithubState,
  requiresIndependentAiReview,
  writeAutoMergeEvidence,
} from "./auto-merge-policy.mjs";

export async function runFeatureBundleIteration(config, logger, { runId, index, issue, laneDecision, branchName = null, controlCheck = null }) {
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

    const codex = runCodexPrompt(config, { ...promptInfo, branchName: bundleBranchName }, `bundle-${slice.sequence}-${slice.id}`);
    if (!codex.skipped && (codex.error || codex.status !== 0)) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "codex_failed", reason: codex.error || `status ${codex.status}` });
      if (!config.dryRun) writeBundleState(config, state);
      return stopBundle(result, "auto_failed", "codex_failed", `Codex failed for bundle slice ${slice.id}.`, { codex });
    }

    const sliceChangedFiles = config.dryRun ? slice.allowedPaths.filter((item) => !item.includes("*")) : listChangedFiles(checkpointBase, "HEAD");
    const forbidden = filterForbiddenChangedFiles(sliceChangedFiles, { ...planned.laneDecision, allowedPaths: slice.allowedPaths });
    if (!config.dryRun && sliceChangedFiles.length === 0) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "bundle_slice_empty_change", reason: "Slice produced no changes." });
      writeBundleState(config, state);
      return stopBundle(result, "bundle_recovery_failed", "bundle_slice_empty_change", `Bundle slice ${slice.id} produced no changes.`);
    }
    if (forbidden.length > 0) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "bundle_slice_scope_escape", reason: forbidden.join(", ") });
      if (!config.dryRun) writeBundleState(config, state);
      return stopBundle(result, "scope_failed", "bundle_slice_scope_escape", `Bundle slice ${slice.id} changed forbidden files.`, { forbidden });
    }

    const validationPlan = planValidation(sliceChangedFiles, { ...planned.laneDecision, validationProfile: slice.validationProfile });
    const validation = runValidationPlan(config, validationPlan);
    if (!validation.passed) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "checkpoint_validation_failed", reason: "Checkpoint validation failed." });
      if (!config.dryRun) writeBundleState(config, state);
      return stopBundle(result, "validation_failed", "checkpoint_validation_failed", `Validation failed for bundle slice ${slice.id}.`, { validation });
    }

    const report = collectReport(config, promptInfo);
    if (!config.dryRun && !report.found) {
      state = markBundleStopped(state, { sliceId: slice.id, reasonCode: "slice_report_missing", reason: promptInfo.reportPath });
      writeBundleState(config, state);
      return stopBundle(result, "bundle_recovery_failed", "slice_report_missing", `Expected bundle slice report missing: ${promptInfo.reportPath}`);
    }

    const commit = commitExplicitPaths(config, sliceChangedFiles, `${slice.title}`);
    const checkpointSha = config.dryRun ? null : getRefSha("HEAD");
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
    return stopBundle(result, "bundle_recovery_failed", "bundle_dirty_after_slices", "Bundle worktree was dirty after checkpoint commits.");
  }
  const finalHead = config.dryRun ? null : getRefSha("HEAD");
  const aggregateFiles = config.dryRun ? [] : listChangedFiles("origin/main", "HEAD");
  const aggregateForbidden = filterForbiddenChangedFiles(aggregateFiles, planned.laneDecision);
  if (aggregateForbidden.length > 0) {
    return stopBundle(result, "scope_failed", "bundle_aggregate_scope_escape", "Aggregate bundle scope escaped parent lane.", {
      forbidden: aggregateForbidden,
    });
  }
  const finalValidationPlan = planValidation(aggregateFiles, planned.laneDecision);
  const finalValidation = bindValidationEvidence(runValidationPlan(config, finalValidationPlan), {
    headSha: finalHead,
    baseSha: baseOriginMainSha,
    changedFiles: aggregateFiles,
    profile: planned.laneDecision.validationProfile,
  });
  result.validation = finalValidation;
  if (!finalValidation.passed) {
    return stopBundle(result, "validation_failed", "bundle_final_validation_failed", "Final aggregate bundle validation failed.", {
      validation: finalValidation,
    });
  }

  result.preReviewPrOwnership = inspectPreReviewPrOwnership(config, bundleBranchName);
  if (!result.preReviewPrOwnership.clean) {
    return stopBundle(result, "auto_failed", "bundle_branch_or_pr_preexists", "Bundle branch or PR already exists before pre-PR review.");
  }
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
  result.externalReview = await runGeminiIntegratedReview(config, result.reviewPackage);
  result.review = runReviewPrompt(config, result.reviewPackage);
  const prePushGate = evaluatePrePushReviewGate({
    laneDecision: planned.laneDecision,
    externalReview: result.externalReview,
    reviewMutationGuard: { mutationDetected: false },
  });
  if (!prePushGate.ok || (!config.dryRun && result.review.verdict?.verdict !== "approve")) {
    return stopBundle(result, prePushGate.outcome || "codex_review_failed", prePushGate.reason || "bundle_review_failed", prePushGate.message || "Bundle review failed.");
  }

  result.push = pushBranch(config, bundleBranchName);
  if (!config.dryRun && (result.push.error || result.push.status !== 0)) {
    return stopBundle(result, "auto_failed", "bundle_push_failed", "Bundle branch push failed.");
  }
  result.pr = openOrUpdatePr(config, issue, bundleBranchName, bundlePrSummary({ result, state, plan }));
  if (!config.dryRun && result.pr.url) result.ci = watchChecks(config, result.pr.url);
  result.autoMerge = await evaluateOrExecuteBundleAutoMerge(config, { issue, result, branchName: bundleBranchName, changedFiles: aggregateFiles, forbidden: aggregateForbidden, laneDecision: planned.laneDecision });
  result.outcome = result.autoMerge.result === "merged" ? "auto_merged" : "approved_pr_opened";
  result.bundle.state = summarizeBundleState(state);
  return result;
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
    reviewPhase: "feature-bundle-final",
    issue: { number: issue.number, title: issue.title, labels: issue.labels || [], url: issue.url || null },
    bundle: summarizeBundleState(state),
    planDigest: plan.planDigest,
    laneDecision,
    reviewerPolicy: reviewerReadinessSummary(config, { changedFiles, laneDecision, stats: { additions: 0, deletions: 0 } }),
    changedFiles,
    currentHead: headSha,
    baseSha,
    validation,
    externalReviewRequired: requiresIndependentAiReview(laneDecision),
    diffTruncated: diff.truncated,
  };
  mkdirSync(path.dirname(packagePath), { recursive: true });
  writeFileSync(packagePath, `${JSON.stringify({ summary, diff: diff.text }, null, 2)}\n`);
  return { packagePath, summary, diff: diff.text };
}

async function evaluateOrExecuteBundleAutoMerge(config, { issue, result, branchName, changedFiles, forbidden, laneDecision }) {
  const baseContext = {
    config,
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
    const decision = evaluateAutoMergeDecision(baseContext);
    return { ...decision, evidence: writeAutoMergeEvidence(config, decision, baseContext) };
  }
  const githubState =
    config.dryRun || !result.pr?.url ? {} : inspectAutoMergeGithubState(config, { issue, prUrlOrNumber: result.pr.url });
  return executeAutoMerge(config, {
    ...baseContext,
    ...githubState,
    issue: githubState.issue || baseContext.issue,
    pr: { ...baseContext.pr, ...(githubState.pr || {}) },
    requiredChecks: githubState.requiredChecks || [],
    reviewThreads: githubState.reviewThreads || [],
    codeScanningAlerts: githubState.codeScanningAlerts || [],
    blockingMarkers: githubState.blockingMarkers || [],
  });
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
