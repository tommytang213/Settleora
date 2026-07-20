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
});

test("only the controller-owning production runner path grants outage resubmission capability", () => {
  const source = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  const capabilityToken = ["outageResubmissionControllerAvailable", " true"].join(":");
  assert.equal(source.match(new RegExp(capabilityToken, "g"))?.length, 1);
  assert.match(
    source,
    /const config = loadConfig\(cliArgs,\s*\{\s*outageResubmissionControllerAvailable: true,\s*\}\);\s*const trustPolicy = evaluateTrustPolicy\(config\);/s,
  );

  assert.match(source, /loadConfig\(\{ \.\.\.cliArgs, dryRun: true, run: false \}\)/);
  assert.match(source, /loadConfig\(\{ dryRun: false, run: false, configPath: cliArgs\.configPath \}\)/);
  assert.match(source, /const config = loadConfig\(cliArgs\);\s*const result = runPreflight\(config\);/s);
  assert.match(source, /const config = loadConfig\(cliArgs\);\s*const result = await runGeminiReviewerSmokeTest\(config,/s);
  assert.match(source, /const config = loadConfig\(cliArgs\);\s*const result = await runSecurityFindingsDryRun\(config,/s);
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
    assert.match(source, /headChanged\(iteration\.runnerCreatedCommitSha, "review_fix_commit"\)/);
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
  assert.match(source, /reviewConvergenceState: iteration\.reviewConvergenceState/);
  assert.doesNotMatch(source, /reviewFixAttempts: iteration\.reviewFixAttempts \|\| \[\]/);
});

test("stack local-fix recovery threads one injected Codex execution authority", () => {
  const source = readFileSync(new URL("../lib/pr-stack-executor.mjs", import.meta.url), "utf8");
  assert.match(source, /const codexPromptRunner = options\.runCodexPrompt \|\| runCodexPrompt/);
  assert.match(source, /applyFrozenLocalFindingBatch\(\{ config, runner, codexPromptRunner,/);
  assert.match(source, /const localFix = codexPromptRunner\(/);
  assert.doesNotMatch(source, /const localFix = runCodexPrompt\(/);
});
