import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  advanceRecoveryPhase,
  bindRecoveryEvidence,
  createInitialRecoveryState,
  headBoundEvidenceKinds,
  loadRecoveryState,
  writeRecoveryState,
} from "../lib/recovery-state.mjs";
import { discoverStartupRecovery, executeStartupContinuation } from "../lib/recovery-continuation.mjs";

function tempConfig(extra = {}) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-production-recovery-"));
  return {
    logsRoot,
    allowExistingPrRecovery: true,
    sessionLifecycle: { allowRecoveryTakeover: true },
    cleanup: () => rmSync(logsRoot, { recursive: true, force: true }),
    ...extra,
  };
}

function recoveryState(overrides = {}) {
  return createInitialRecoveryState({
    taskKey: "20260713-2023",
    issue: { number: 893, title: "Recovery", url: "https://example.invalid/893" },
    runId: "run-2026-07-13T122300Z",
    supervisorRunId: "supervised-20260713T122300Z-abcdefabcdef",
    branchName: "tools/auto-runner-recovery-continuation-893-20260713-1927",
    baseSha: "b".repeat(40),
    currentHeadSha: "c".repeat(40),
    ...overrides,
  });
}

test("startup continuation executes first incomplete phase before polling", async () => {
  const config = tempConfig();
  try {
    const state = advanceRecoveryPhase(recoveryState(), {
      phase: "pr_create_recover",
      firstIncompleteAction: "open_or_recover_pr",
    });
    writeRecoveryState(config, state);
    const discovery = discoverStartupRecovery(config);
    let executed = false;
    const continued = await executeStartupContinuation(config, discovery, {
      pr_create_recover: async ({ state: loaded, boundary }) => {
        executed = true;
        assert.equal(loaded.issue.number, 893);
        assert.equal(boundary.nextSafeAction, "open_or_recover_pr");
        return { ok: true, outcome: "fixture_phase_executed", reasonCode: "fixture_ok", state: loaded };
      },
    });
    assert.equal(executed, true);
    assert.equal(continued.outcome, "fixture_phase_executed");
    assert.equal(continued.recovery.executedPhase, "pr_create_recover");
  } finally {
    config.cleanup();
  }
});

test("startup continuation blocks corrupt or unsafe state without polling fallback", async () => {
  const config = tempConfig();
  try {
    const state = advanceRecoveryPhase(recoveryState(), { phase: "stopped", firstIncompleteAction: "manual" });
    writeRecoveryState(config, state);
    const continued = await executeStartupContinuation(config, {
      allowed: true,
      found: true,
      action: "resume_recoverable_work",
      state,
    }, {
      default: async () => {
        throw new Error("handler must not run for unsafe boundary");
      },
    });
    assert.equal(continued.ok, false);
    assert.equal(continued.outcome, "blocked_recovery_state");
    assert.equal(continued.reasonCode, "not_safe_boundary");
  } finally {
    config.cleanup();
  }
});

test("production runner is wired past discovery-only recovery and legacy PR classifier", () => {
  const source = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("recovery_resume_pending"), false);
  assert.match(source, /executeStartupContinuation/);
  assert.match(source, /evaluateExistingPrRecovery\(/);
  assert.equal(source.includes("evaluateExistingPrRecoveryDecision(context)"), false);
  assert.match(source, /\["external_review", "codex_mechanics_security_review", "review_fix"\]\.includes\(boundary\.phase\)/);
});

test("stable-launched supervisor main persists startup failures before rethrow", () => {
  const worker = readFileSync("tools/auto-runner/supervisor/settleora-auto-runner-worker.mjs", "utf8");
  const exportedMain = worker.slice(worker.indexOf("export async function main()"), worker.indexOf("function waitForChild"));
  assert.match(exportedMain, /catch \(error\)[\s\S]*writeSupervisorState\(runId, \{ state: "failed"/);
  assert.match(exportedMain, /throw error/);
});

test("post-merge cleanup uses the supported head filter and terminalizes its own recovery state", () => {
  const source = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /\["pr", "list", "--repo", owner\.repository, "--state", "open", "--head", owner\.branchName/);
  assert.doesNotMatch(source, /--head", `\$\{repositoryOwner\}/);
  assert.match(source, /\(category === "recovery" \|\| category === "session"\) && exactOwner/);
  assert.match(source, /transitionSessionLifecyclePhase\(config, state\.sessionLifecycle, \{ phase: "completed", nextExactAction: "post_merge_cleanup_complete" \}\)/);
  assert.match(source, /advanceRecoveryPhase\(state, \{ phase: "completed"[^}]*nextSafeAction: "none" \}\)/);
  assert.match(source, /sessionAuthority = cleanupSessionLifecycleMatches\(state\.sessionLifecycle, owner\)/);
  assert.match(source, /category !== "session" \|\| cleanupSessionLifecycleMatches\(value, owner\)/);
  assert.match(source, /sessions\.includes\(ownerSession\)/);
  assert.match(source, /issueLinkageEvidence,\s*sessionLifecycle,\s*recoveryState,/s);
  assert.match(source, /primaryHandoffIgnoredPids: authorizedSupervisorProcessIds\(state\)/);
  assert.match(source, /matchAuthorizedSupervisorProcess\(\{/);
  assert.match(source, /expectedReportPaths: \{ durableReportPath: iteration\.report\.copyPath \}/);
});

test("only the controller-owning production runner path grants outage resubmission capability", () => {
  const source = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  const capabilityToken = ["outageResubmissionControllerAvailable", " true"].join(":");
  assert.equal(source.match(new RegExp(capabilityToken, "g"))?.length, 1);
  assert.ok((source.match(/outageResubmissionObserverAvailable: true/g) || []).length >= 5);
  assert.match(
    source,
    /const config = loadConfig\(cliArgs,\s*\{\s*outageResubmissionControllerAvailable: true,\s*\}\);\s*const trustPolicy = evaluateTrustPolicy\(config\);/s,
  );

  assert.match(source, /loadConfig\(\{ \.\.\.cliArgs, dryRun: true, run: false \}, \{ outageResubmissionObserverAvailable: true \}\)/);
  assert.match(source, /loadConfig\(\{ dryRun: false, run: false, configPath: cliArgs\.configPath \}, \{ outageResubmissionObserverAvailable: true \}\)/);
});

test("production runner records lifecycle phases, mutation markers, and head invalidation hooks", () => {
  const source = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  for (const phase of [
    "issue_poll_claim",
    "branch_setup",
    "implementation_or_bundle_slice",
    "checkpoint_validation_commit",
    "aggregate_validation",
    "external_review",
    "codex_mechanics_security_review",
    "review_fix",
    "push",
    "pr_create_recover",
    "ci_wait",
    "exact_head_final_refresh",
    "merge",
    "post_merge_current_main_checks_scanner_reconciliation",
    "completed",
    "stopped",
  ]) {
    assert.match(source, new RegExp(`["']${phase}["']`), phase);
  }
  assert.match(source, /recordIdempotentMutation/);
  assert.match(source, /recordTaskWorktreeOwnershipMarker\(config, recoveryRecorder, branchName\)/);
  assert.match(source, /marker\("worktree_ownership_created"/);
  assert.match(source, /invalidateEvidenceForHeadChange/);
  assert.match(source, /writeRecoveryState/);
});

test("feature-bundle production path records linked recovery state", () => {
  const source = readFileSync(new URL("../lib/feature-bundle-orchestrator.mjs", import.meta.url), "utf8");
  assert.match(source, /createBundleRecoveryRecorder/);
  assert.match(source, /featureBundle/);
  assert.match(source, /bundleStatePath/);
  assert.match(source, /checkpoint_commit/);
  assert.match(source, /post_merge_current_main_checks_scanner_reconciliation/);
});

test("review mutation guards precede recovery and split side effects", () => {
  const runner = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  for (const reason of [
    "ordinary_continuation_external_review_mutated_checkout",
    "ordinary_continuation_codex_review_mutated_checkout",
    "ordinary_continuation_structured_review_mutated_checkout",
    "ordinary_continuation_reviewer_checkpoint_missing",
    "ordinary_continuation_live_candidate_mismatch",
    "external_review_mutated_checkout",
    "review_fix_post_fix_external_review_mutated_checkout",
  ]) assert.match(runner, new RegExp(reason));
  assert.match(runner, /initial\.effects\?\.external_review\?\.evidence\?\.review/);
  assert.match(runner, /initial\.effects\?\.codex_review\?\.evidence\?\.review/);
  assert.match(runner, /ordinaryStructuredReviewCheckpoint\(initial\.effects\?\.structured_review\?\.evidence\)/);
  assert.match(runner, /providerPromptBindingDigest: review\.providerPromptBindingDigest/);
  assert.match(runner, /attestationSource: review\.attestationSource/);
  assert.equal((runner.match(/recoveryRecorder,\n\s+branchName,/g) || []).length, 4);
  assert.match(runner, /headChanged\(iteration\.runnerCreatedCommitSha, reasonCode, \{ ordinaryContinuation \}\)/);
  assert.match(runner, /if \(headChangeCheckpoint\) await headChangeCheckpoint\(runnerCreatedCommitSha\)/);
  assert.match(runner, /review_convergence: async \(continuation\).*runReviewFixCycle.*commitReviewFixAndRerunExactHeadReviews/s);

  const bundle = readFileSync(new URL("../lib/feature-bundle-orchestrator.mjs", import.meta.url), "utf8");
  const bundleFixCommit = bundle.indexOf("const commit = await commitExplicitPaths", bundle.indexOf("commitBundleReviewFixAndRerunExactHeadReviews"));
  const bundleHeadCheckpoint = bundle.indexOf("recovery?.headChanged(runnerCreatedCommitSha", bundleFixCommit);
  const bundleReviewPackage = bundle.indexOf("const reviewPackage = writeBundleReviewPackage", bundleFixCommit);
  assert.ok(bundleFixCommit >= 0 && bundleHeadCheckpoint > bundleFixCommit && bundleHeadCheckpoint < bundleReviewPackage);
  const reviewCall = bundle.indexOf("result.externalReview = await runGeminiIntegratedReview");
  const guard = bundle.indexOf("externalReviewMutationGuard", reviewCall);
  const splitRoute = bundle.indexOf('route === "split_or_block"', reviewCall);
  assert.ok(reviewCall >= 0 && guard > reviewCall && splitRoute > guard);
});

test("head-changing commit invalidates every stale evidence binding", () => {
  let state = recoveryState();
  for (const kind of headBoundEvidenceKinds) {
    state = bindRecoveryEvidence(state, kind, {
      status: "passed",
      headSha: "c".repeat(40),
      baseSha: "b".repeat(40),
      changedFiles: ["tools/auto-runner/settleora-auto-runner.mjs"],
    });
  }
  const config = tempConfig();
  try {
    writeRecoveryState(config, state);
    const loaded = loadRecoveryState(config, state);
    assert.equal(loaded.ok, true);
    const source = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
    assert.match(source, /headChanged\(iteration\.runnerCreatedCommitSha, "checkpoint_commit"\)/);
    const reviewFixCommit = source.indexOf("const commit = await commitExplicitPaths", source.indexOf("commitReviewFixAndRerunExactHeadReviews"));
    const reviewFixCheckpoint = source.indexOf("if (headChangeCheckpoint) await headChangeCheckpoint(runnerCreatedCommitSha)", reviewFixCommit);
    const reviewFixPackage = source.indexOf("const reviewPackage = await writeReviewPackage", reviewFixCommit);
    assert.ok(reviewFixCommit >= 0 && reviewFixCheckpoint > reviewFixCommit && reviewFixCheckpoint < reviewFixPackage);
  } finally {
    config.cleanup();
  }
});

test("normal review convergence checks mutation and budget before accepting post-fix evidence", () => {
  const source = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /evaluateNormalReviewConvergenceBudget\(config, iteration/);
  assert.match(source, /loadReviewConvergenceState\(config/);
  assert.match(source, /writeReviewConvergenceState\(config/);
  assert.match(source, /evaluateCycleBudget\(iteration\.reviewConvergenceState, config, iteration\.reviewConvergenceHistory\)/);
  assert.match(source, /accountNormalReviewFixCommit\(iteration, iteration\.runnerCreatedCommitSha, "review_fix_commit"\)/);
  assert.match(source, /accountNormalReviewFixCommit\(iteration, iteration\.runnerCreatedCommitSha, "codex_review_initial_fix_commit"\)/);
  assert.match(source, /accountNormalReviewFixCommit\(iteration, iteration\.runnerCreatedCommitSha, "codex_review_convergence_fix_commit"\)/);
  assert.match(source, /accountNormalReviewFixCommit\(iteration, iteration\.runnerCreatedCommitSha, "review_convergence_fix_commit"\)/);
  assert.match(source, /if \(iteration\.reviewMutationGuard\?\.mutationDetected\) \{\n\s+return stopForPostFixReviewMutation/);
  assert.match(source, /appendNormalReviewConvergenceHistory\(iteration/);
  assert.match(source, /persistNormalReviewConvergenceState\(config, iteration, "post_fix_reviewed"\)/);
  assert.equal((source.match(/refreshNormalLargeCandidateReviewAfterFix\(config, iteration, postFix\.changedFiles, issue, recoveryRecorder\)/g) || []).length, 3);
  assert.equal((source.match(/async function refreshNormalLargeCandidateReviewAfterFix\(config, iteration, changedFiles, issue, recoveryRecorder\)/g) || []).length, 1);
  assert.match(source, /Post-fix cumulative large-candidate review is incomplete/);
  assert.match(source, /routeNormalStructuredFindingsToConvergence\(iteration\)/);
  assert.match(source, /sanitizedResponseSummary: \{ verdict: "fail", findings: gemini \}/);
  assert.match(source, /recommended_next_action: "run_safe_fix_cycle"/);
  assert.match(source, /reviewConvergenceState: iteration\.reviewConvergenceState/);
  assert.doesNotMatch(source, /reviewFixAttempts: iteration\.reviewFixAttempts \|\| \[\]/);
  assert.match(source, /synchronizeRecoveredSourceChange\(state, ordinaryContinuation, "ordinary_source_failure_fix_committed"\)/);
  assert.match(source, /accountConvergenceEvent\(convergence, \{ kind: "source_changed", newHead, reasonCode \}\)/);
  assert.match(source, /if \(decision\.retryable\) \{[\s\S]*iteration\.outcome = "validation_retryable";[\s\S]*decision\.nextAction/);
  assert.match(source, /counters: ordinaryCountersFromReviewConvergence\(iteration\.reviewConvergenceState\)/);
  assert.match(source, /recoveryRecorder\.annotate\(\{ ordinaryContinuation: continuation \}\)/);
  assert.match(source, /boundary\.phase === "checkpoint_validation_commit"[\s\S]*reconstructInitialValidationFailureCheckpoint/);
  assert.match(source, /initial_validation_failure_commit_reconstruction_ambiguous/);
  assert.match(source, /commitMessage: `Auto-runner issue #\$\{issue\.number\}: source-fix \$\{batch\.batchIdentity\.slice\(0, 16\)\}`/);
  assert.match(source, /if \(replacementDecision\.retryable\) \{[\s\S]*iteration\.outcome = "validation_retryable";[\s\S]*replacementDecision\.nextAction/);
});

test("valid non-pass reviewers retain prompt binding for structured convergence", () => {
  const gemini = readFileSync(new URL("../lib/gemini-reviewer.mjs", import.meta.url), "utf8");
  const codex = readFileSync(new URL("../lib/codex-runner.mjs", import.meta.url), "utf8");
  assert.match(gemini, /reason === "blocked_external_reviewer_non_pass"/);
  assert.match(gemini, /\["fail", "needs_tommy", "danger_gate"\]\.includes\(result\.verdict\)/);
  assert.match(codex, /\["approve", "changes_requested", "needs_tommy", "danger_gate"\]\.includes\(finalResult\.verdict\?\.verdict\)/);
});

test("large review recovery re-requires binding and reviewer prompts carry boundary material", () => {
  const routing = readFileSync(new URL("../lib/large-candidate-review-routing.mjs", import.meta.url), "utf8");
  const gemini = readFileSync(new URL("../lib/gemini-reviewer.mjs", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  const bundle = readFileSync(new URL("../lib/feature-bundle-orchestrator.mjs", import.meta.url), "utf8");
  assert.match(routing, /runtimeStructuredRequired: true \} : seed/);
  assert.match(gemini, /integrationBoundaryMaterial: summary\.integrationBoundaryMaterial \|\| \[\]/);
  assert.match(runner, /integrationBoundaryMaterial: integrationBoundaryMaterial/);
  assert.match(bundle, /function writeBundleReviewPackage[\s\S]*?integrationBoundaries:[\s\S]*?integrationBoundaryMaterial: bundleIntegrationBoundaryMaterial[\s\S]*?writeFileSync\(packagePath/);
  assert.doesNotMatch(runner, /function integrationBoundaryMaterial[\s\S]*?slice\(0, 40_000\)/);
  assert.doesNotMatch(bundle, /function bundleIntegrationBoundaryMaterial[\s\S]*?slice\(0, 40_000\)/);
  assert.match(runner, /certifyNormalCumulativeLargeReview[\s\S]*?compareFingerprints\(beforeReview, await checkoutFingerprint\(\)\)/);
  assert.match(bundle, /phase: "bundle_structured_review"/);
  assert.match(bundle, /phase: "bundle_convergence_structured_review"/);
  assert.match(bundle, /executionAuthorityProven: slice\.executionAuthorityProven === true/);
  assert.doesNotMatch(bundle, /executionAuthorityProven: false/);
  assert.match(runner, /structuredLargeCandidateManualVerdict\(iteration\.largeCandidateReview\)/);
  assert.match(bundle, /structuredLargeCandidateManualVerdict\(result\.largeCandidateReview\)/);
  assert.match(runner, /repository: config\.repositorySlug \|\| "tommytang213\/Settleora"/);
  assert.match(runner, /refreshNormalLargeCandidateReviewAfterFix\(config, iteration, postFix\.changedFiles/);
  assert.match(bundle, /changedFiles\.filter\(\(changedPath\).*featureBundleAllowedPathMatches/);
  assert.match(runner, /loadNormalLargeCandidateRecoveryCheckpoint\(config, state\)/);
  assert.match(runner, /continueOrdinaryCandidateRecovery\(config, logger/);
  assert.match(runner, /continueOrdinaryCandidate\(initial/);
  assert.match(bundle, /materializeFeatureBundleSplit/);
  assert.match(bundle, /deterministic_split_materialized/);
  assert.match(bundle, /runPrStackExecution/);
});

test("stack local-fix recovery threads one injected Codex execution authority", () => {
  const source = readFileSync(new URL("../lib/pr-stack-executor.mjs", import.meta.url), "utf8");
  assert.match(source, /const codexPromptRunner = options\.runCodexPrompt \|\| runCodexPrompt/);
  assert.match(source, /applyFrozenLocalFindingBatch\(\{ config, runner, codexPromptRunner,/);
  assert.match(source, /const localFix = codexPromptRunner\(/);
  assert.doesNotMatch(source, /const localFix = runCodexPrompt\(/);
});

test("charged startup recovery is resumed before the accepted-task cap stops new work", () => {
  const source = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /let chargedRecoveryCapBypassConsumed = false;/);
  assert.match(source, /summary\.acceptedLogicalTaskCount >= config\.maxIterations\) \{\n\s+if \(chargedRecoveryCapBypassConsumed\) break;\n\s+chargedRecoveryAtCap = config\.outageRecoveryOnly \? discoverTargetedStartupRecovery\(config\) : discoverStartupRecovery\(config\);\n\s+if \(!chargedRecoveryAtCap\.found\) break;\n\s+chargedRecoveryCapBypassConsumed = true;/);
  assert.match(source, /runIteration\(config, logger, runId, index, issueTracker, chargedRecoveryAtCap\)/);
  assert.match(source, /const startupRecovery = startupRecoveryOverride \|\|/);
  assert.match(source, /iteration\.issueSource === "startup_recovery" && summary\.acceptedLogicalTaskCount >= config\.maxIterations\) \{\n\s+chargedRecoveryCapBypassConsumed = true;/);
  assert.doesNotMatch(source, /summary\.acceptedLogicalTaskCount < config\.maxIterations; index/);
});

test("operational projection checkpoints bracket long-running ordinary candidate phases", () => {
  const runner = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  for (const [phase, operation] of [
    ["local_validation", "iteration.validation = runValidationPlan"],
    ["external_review", "iteration.externalReview = await runIntegratedReviewSource"],
    ["local_codex_review", "iteration.review = runReviewPrompt"],
    ["push", "iteration.push = await pushBranch"],
    ["pr_create_recover", "iteration.pr = await openOrUpdatePr"],
    ["ci_wait", "iteration.ci = watchChecks"],
    ["exact_head_final_refresh", "iteration.autoMerge = await evaluateOrExecuteAutoMerge"],
  ]) {
    const operationOffset = runner.indexOf(operation);
    assert.notEqual(operationOffset, -1, `missing operation: ${operation}`);
    const phaseOffset = runner.lastIndexOf(`iteration.phase = "${phase}";`, operationOffset);
    const preCheckpoint = runner.indexOf("checkpoint(iteration);", phaseOffset);
    const postCheckpoint = runner.indexOf("checkpoint(iteration);", operationOffset);
    assert.ok(phaseOffset >= 0 && preCheckpoint > phaseOffset && preCheckpoint < operationOffset, `missing pre-operation checkpoint for ${phase}`);
    assert.ok(postCheckpoint > operationOffset && postCheckpoint - operationOffset < 1_800, `missing completion checkpoint for ${phase}`);
  }
});

test("delegated bundle and existing-PR recovery phases use the owning iteration checkpoint", () => {
  const runner = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  const bundle = readFileSync(new URL("../lib/feature-bundle-orchestrator.mjs", import.meta.url), "utf8");
  assert.match(runner, /const operationalCheckpoint = \(phase, projected = \{\}\) => \{[\s\S]*?checkpoint\(iteration\);/);
  assert.match(runner, /runFeatureBundleIteration\([\s\S]*?operationalCheckpoint,/);
  assert.match(runner, /recoverExistingPrIfConfigured\([\s\S]*?operationalCheckpoint,/);
  for (const phase of ["slice_validation", "external_review", "local_codex_review", "push", "pr_create_recover", "ci_wait", "exact_head_final_refresh"]) {
    assert.match(bundle, new RegExp(`checkpoint\\(\"feature_bundle_${phase}`), `missing bundle checkpoint for ${phase}`);
  }
  for (const phase of ["live_reconciliation", "evidence_regeneration", "merge_evaluation"]) {
    assert.match(runner, new RegExp(`operationalCheckpoint\\(\"existing_pr_${phase}`), `missing recovery checkpoint for ${phase}`);
  }
  assert.match(runner, /resumeStartupRecovery\(config, logger, runId, index, startupRecovery, operationalCheckpoint\)/);
  assert.match(runner, /runFeatureBundleIteration\(config, logger,[\s\S]*?recoveryState: state,[\s\S]*?operationalCheckpoint,/);
  assert.match(runner, /recoverExistingPrIfConfigured\(config, logger, issue, laneDecision, state,[\s\S]*?operationalCheckpoint,/);
  assert.match(runner, /continueOrdinaryCandidateRecovery\(config, logger,[\s\S]*?operationalCheckpoint/);
  assert.match(runner, /recoverExistingPrIfConfigured\(recoveryConfig, logger, issue, laneDecision, state,[\s\S]*?operationalCheckpoint/);
});

test("projection checkpoints retain recovery, implementation, convergence, split, and stack authority", () => {
  const runner = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  const bundle = readFileSync(new URL("../lib/feature-bundle-orchestrator.mjs", import.meta.url), "utf8");
  const control = readFileSync(new URL("../lib/control-plane.mjs", import.meta.url), "utf8");
  assert.match(runner, /iteration\.recovery = startupRecovery;[\s\S]*?iteration\.runnerCreatedCommitSha = startupRecovery\.state\?\.currentHeadSha[\s\S]*?iteration\.phase = "startup_recovery";/);
  assert.match(runner, /iteration\.phase = "implementation";[\s\S]*?runCodexPrompt\(config,[\s\S]*?iteration\.phase = "implementation_complete";/);
  assert.match(bundle, /reviewConvergenceState: state\?\.reviewConvergenceState \|\| result\.reviewConvergenceState \|\| null/);
  assert.match(bundle, /checkpoint\("feature_bundle_split_materialization"[\s\S]*?materializeFeatureBundleSplit[\s\S]*?checkpoint\("feature_bundle_split_materialization_complete"/);
  assert.match(bundle, /checkpoint\("feature_bundle_pr_stack_handoff"\)[\s\S]*?runPrStackExecution[\s\S]*?checkpoint\("feature_bundle_pr_stack_handoff_complete"\)/);
  assert.match(control, /iteration\.pr\?\.headRefOid[\s\S]*?iteration\.validation\?\.headSha[\s\S]*?iteration\.externalReview\?\.reviewedHead/);
  assert.match(control, /activeOwnerConflict: Boolean\(!lockOnlyPrStackAuthority && \(lock\.active \|\| active\.active\)[\s\S]*?!lock\.parsed\?\.runId[\s\S]*?!active\.parsed\?\.runId[\s\S]*?lock\.parsed\.runId !== active\.parsed\.runId/);
  assert.doesNotMatch(control, /(?:ciHead|scannerHead):[^\n]*expectedHeadSha/);
});

test("projection adapters prefer terminal summaries and normalize legacy check contexts", () => {
  const control = readFileSync(new URL("../lib/control-plane.mjs", import.meta.url), "utf8");
  const ctl = readFileSync(new URL("../settleora-auto-runnerctl.mjs", import.meta.url), "utf8");
  assert.match(control, /const retainedInactiveCheckpointIsNewer = Boolean\(active\.parsed/);
  assert.match(control, /const source = lockOnlyPrStackAuthority \? lock\.parsed : runnerAuthorityActive \? active\.parsed : useLatestSummary \? latestSummary\.summary : active\.parsed \|\| null/);
  assert.match(ctl, /\["PENDING", "EXPECTED"\]\.includes\(check\.state\)/);
  assert.match(ctl, /name: check\.name \|\| check\.context \|\| "unknown"/);
  assert.match(ctl, /summarizeCheckStatus\(normalized, policy\)/);
  assert.match(ctl, /specReader\(status\.supervisorRunId, null, bootstrap\.logsRoot\)/);
  assert.match(ctl, /configPathValidator\(status\.configPath, bootstrap\.logsRoot\)\.path/);
  assert.match(ctl, /status\.authorityHealth\?\.lockOnlyPrStackAuthority === true/);
  assert.match(ctl, /buildStatusExport\(cli\)/);
  assert.match(ctl, /deps\.loadProjectionConfig \|\| loadProjectionConfig/);
  assert.match(ctl, /status: status\.active \? "active" : projection\.status \|\| status\.latestTerminalOutcome/);
});

test("ordinary source-fix recovery admits only an exact descendant prepared commit for adoption", () => {
  const runner = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  assert.match(runner, /initial\.sourceFailureFixIntent\?\.status === "prepared"/);
  assert.match(runner, /\["merge-base", "--is-ancestor", initial\.identity\.headSha, liveHeadAtRecovery\]/);
  assert.match(runner, /preparedFixCanBeAdopted/);
});

test("post-merge cleanup explicitly hands authority to the exact successor runner lock", () => {
  const runner = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  assert.match(runner, /currentRunId: runId/);
  assert.match(runner, /lockRunOwnsRecovery = typeof currentRunId === "string"[\s\S]*?lock\?\.runId === currentRunId/);
  assert.match(runner, /lock\?\.runId === state\.run\?\.runId \|\| lockRunOwnsRecovery/);
  assert.match(runner, /processInventory = run\("ps", \["-eo", "pid=,args="\]\)/);
  assert.match(runner, /reportEvidenceComplete[\s\S]*?activeReferences\.lease = runnerLockAuthority \? 0 : 1/);
});
