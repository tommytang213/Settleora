import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { featureBundleOrchestratorTestInternals, resolveBundleParallelReviewerCheckpoint, runDurableBundleParallelReviews } from "../lib/feature-bundle-orchestrator.mjs";
import { sanitizeBundleState } from "../lib/feature-bundle-state.mjs";

const repoRoot = process.cwd();
const repositorySlug = "tommytang213/Settleora";

test("bundle recovery preserves a manual Grok verdict before Codex completes", async () => {
  const headSha = "a".repeat(40);
  const baseSha = "b".repeat(40);
  const changedFiles = ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"];
  const changedFilesDigest = createHash("sha256").update(JSON.stringify(changedFiles)).digest("hex");
  const reviewPackage = { summary: { currentHead: headSha, baseSha, changedFiles } };
  const initial = { finalization: { state: "reviewing" } };
  let persisted = initial;
  let finishCodex;
  const codexPending = new Promise((resolve) => { finishCodex = resolve; });
  const external = { status: "blocked", reason: "blocked_external_reviewer_non_pass",
    verdict: "needs_tommy", reviewedHead: headSha, baseSha, changedFilesDigest };
  const codex = { status: 0, reviewStatus: "completed", verdict: { verdict: "approve" },
    reviewedHead: headSha, reviewedBaseSha: baseSha, baseSha, changedFilesDigest };
  const pending = runDurableBundleParallelReviews({}, reviewPackage, initial,
    (next) => { persisted = next; }, null,
    { runExternal: async () => external, runCodex: async () => codexPending });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(persisted.finalization.parallelReviewerVerdicts.attempts, 1);
  assert.equal(persisted.finalization.parallelReviewerVerdicts.external.verdict, "needs_tommy");
  assert.equal(persisted.finalization.parallelReviewerVerdicts.codex, null);
  const recovered = resolveBundleParallelReviewerCheckpoint(persisted.finalization.parallelReviewerVerdicts,
    { headSha, baseSha, changedFilesDigest });
  assert.equal(recovered.outcome, "blocked_needs_tommy");
  const resumed = await runDurableBundleParallelReviews({}, reviewPackage, persisted,
    () => { throw new Error("saved manual verdict must not be overwritten"); }, null,
    { runExternal: async () => { throw new Error("external rerun"); },
      runCodex: async () => { throw new Error("codex rerun"); } });
  assert.equal(resumed.outcome, "blocked_needs_tommy");
  finishCodex(codex);
  assert.equal((await pending).outcome, "blocked_needs_tommy");
});

test("bundle recovery reuses completed Codex evidence and adopts its successor after Grok fails", async () => {
  const headSha = "c".repeat(40);
  const baseSha = "d".repeat(40);
  const changedFiles = ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"];
  const changedFilesDigest = createHash("sha256").update(JSON.stringify(changedFiles)).digest("hex");
  const reviewPackage = { summary: { currentHead: headSha, baseSha, changedFiles } };
  const initial = { finalization: { state: "reviewing" } };
  const successor = { phase: "codex-successor", headSha };
  const codex = { status: 0, reviewStatus: "completed", verdict: { verdict: "approve" },
    reviewedHead: headSha, reviewedBaseSha: baseSha, baseSha, changedFilesDigest,
    changedFiles, completedAt: "2026-10-11T19:00:00.000Z", sessionLifecycle: successor };
  let persisted = initial;
  let finishExternal;
  const externalPending = new Promise((resolve) => { finishExternal = resolve; });
  const first = runDurableBundleParallelReviews({}, reviewPackage, initial,
    (next) => { persisted = sanitizeBundleState(next); }, null,
    { runExternal: async () => externalPending, runCodex: async () => codex });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(persisted.finalization.parallelReviewerSessionLifecycle,
    { headSha, lifecycle: successor });
  assert.deepEqual(persisted.finalization.parallelReviewerVerdicts.codex.changedFiles, changedFiles);
  assert.equal(persisted.finalization.parallelReviewerVerdicts.codex.completedAt, codex.completedAt);
  finishExternal({ status: "blocked", reason: "provider_timeout" });
  assert.equal((await first).ok, false);
  const manualSaved = sanitizeBundleState({ ...persisted, finalization: { ...persisted.finalization,
    parallelReviewerVerdicts: { ...persisted.finalization.parallelReviewerVerdicts,
      external: { status: "blocked", reason: "blocked_external_reviewer_non_pass", verdict: "needs_tommy",
        reviewedHead: headSha, baseSha, changedFilesDigest } } } });
  const manualAdopted = [];
  const manualRecovery = await runDurableBundleParallelReviews({}, reviewPackage, manualSaved,
    () => { throw new Error("manual gate must not mutate checkpoint"); }, null,
    { adoptSessionLifecycle: (value) => manualAdopted.push(value),
      runExternal: async () => { throw new Error("manual rerun"); },
      runCodex: async () => { throw new Error("manual rerun"); } });
  assert.equal(manualRecovery.outcome, "blocked_needs_tommy");
  assert.deepEqual(manualAdopted, [successor]);
  const adopted = [];
  let codexReruns = 0;
  const resumed = await runDurableBundleParallelReviews({}, reviewPackage, persisted,
    (next) => { persisted = sanitizeBundleState(next); }, null,
    { runExternal: async () => ({ status: "pass", verdict: "pass", reviewedHead: headSha,
      baseSha, changedFilesDigest }),
    runCodex: async () => { codexReruns += 1; throw new Error("unexpected Codex rerun"); },
    adoptSessionLifecycle: (value) => adopted.push(value) });
  assert.equal(resumed.ok, true);
  assert.equal(codexReruns, 0);
  assert.deepEqual(adopted, [successor]);
  assert.deepEqual(resumed.review.sessionLifecycle, successor);
  assert.deepEqual(resumed.review.changedFiles, changedFiles);
  assert.equal(resumed.review.completedAt, codex.completedAt);
});

test("post-fix bundle review checks checkout mutation before handling a failed parallel review", () => {
  const source = readFileSync(new URL("../lib/feature-bundle-orchestrator.mjs", import.meta.url), "utf8");
  const postFix = source.slice(source.indexOf("async function commitBundleReviewFixAndRerunExactHeadReviews"),
    source.indexOf("async function certifyLargeBundleCumulativeReview"));
  assert.match(postFix, /const externalReviewMutationGuard = compareBundleReviewCheckoutFingerprint\([\s\S]*?if \(parallelReviews && !parallelReviews\.ok\)/);
  assert.match(postFix, /parallelReviewFailure: externalReviewMutationGuard\.mutationDetected[\s\S]*?"bundle_review_mutation_detected"/);
});

function config(overrides = {}) {
  return {
    dryRun: false,
    allowAutoMerge: true,
    repoRoot,
    repositorySlug,
    logsRoot: path.join(repoRoot, ".tmp", "feature-bundle-test-logs"),
    ...overrides,
  };
}

function liveRunner(calls = [], identity = {}) {
  const runner = (command, args = [], options = {}) => {
    calls.push({ command, args, options, runner });
    return {
      status: 0,
      stdout: "{}",
      stderr: "",
      error: null,
      commandEvidence: {
        runnerIdentity: runner.settleoraRunnerIdentity,
        command,
        args,
        cwd: options.cwd || repoRoot,
        status: 0,
      },
    };
  };
  runner.settleoraFixedArgvRunner = true;
  runner.settleoraRunnerMode = "live";
  runner.settleoraRunnerIdentity = {
    kind: "live-fixed-argv",
    repositorySlug,
    repoRoot,
    timeoutMs: 30000,
    maxOutputBytes: 131072,
    ...identity,
  };
  return runner;
}

function fakeBundleInput(runner) {
  return {
    issue: { number: 926, title: "Feature bundle", labels: ["auto-bundle"] },
    result: {
      pr: { url: "https://github.com/tommytang213/Settleora/pull/926" },
      externalReview: { status: "pass" },
      review: { verdict: { verdict: "approve" } },
      validation: { passed: true },
      baseOriginMainSha: "b7e20eee76c88cb02f35c6b7f6280a84e1965571",
    },
    branchName: "feature/auto-926",
    changedFiles: ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"],
    forbidden: [],
    laneDecision: { lane: "workflow-docs-tooling", validationProfile: "runner-tests" },
    autoMergeRunner: runner,
  };
}

test("feature-bundle auto-merge passes the same live runner to inspection and execution", async () => {
  const runner = liveRunner();
  let inspectedRunner = null;
  let executedRunner = null;
  const result = await featureBundleOrchestratorTestInternals.evaluateOrExecuteBundleAutoMerge(config(), fakeBundleInput(runner), {
    inspectState(_config, request, options) {
      inspectedRunner = options.runner;
      assert.equal(request.prUrlOrNumber, "https://github.com/tommytang213/Settleora/pull/926");
      assert.equal(request.issue.number, 926);
      return {
        issue: { number: 926, title: "Feature bundle", state: "OPEN", labels: [] },
        pr: { number: 926, url: request.prUrlOrNumber, state: "OPEN", isDraft: false, headRefOid: "abc", baseRefName: "main" },
        requiredChecks: [],
        reviewThreads: [],
        codeScanningAlerts: [],
        blockingMarkers: [],
        commandEvidence: [{ command: "gh", args: ["pr", "view", request.prUrlOrNumber, "--repo", repositorySlug], runnerIdentity: runner.settleoraRunnerIdentity }],
      };
    },
    executeMerge(_config, context, options) {
      executedRunner = options.runner;
      assert.equal(context.autoMergeRunnerIdentity, runner.settleoraRunnerIdentity);
      assert.equal(context.autoMergeCommandEvidence[0].args.includes("--repo"), true);
      assert.equal(context.autoMergeCommandEvidence[0].args.includes(repositorySlug), true);
      return { result: "blocked", reason: "test_stop_before_mutation", evidence: { evidencePath: "test" }, context };
    },
  });
  assert.equal(inspectedRunner, runner);
  assert.equal(executedRunner, runner);
  assert.equal(result.context.autoMergeCommandEvidence[0].runnerIdentity, runner.settleoraRunnerIdentity);
});

test("feature-bundle auto-merge fails before inspection when runner is missing or unusable", async () => {
  for (const [name, runner, reasonCode] of [
    ["missing", null, "feature_bundle_auto_merge_runner_missing"],
    ["noop", Object.assign(() => ({ status: 0, stdout: "", stderr: "", error: null }), { settleoraRunnerMode: "noop", settleoraNoopRunner: true }), "feature_bundle_auto_merge_runner_missing"],
    ["malformed", Object.assign(() => ({ status: 0, stdout: "", stderr: "", error: null }), { settleoraRunnerMode: "live" }), "feature_bundle_auto_merge_runner_malformed"],
    ["repository mismatch", liveRunner([], { repositorySlug: "other/Settleora" }), "feature_bundle_auto_merge_runner_repository_mismatch"],
  ]) {
    let inspected = false;
    let executed = false;
    const result = await featureBundleOrchestratorTestInternals.evaluateOrExecuteBundleAutoMerge(config(), fakeBundleInput(runner), {
      inspectState() {
        inspected = true;
        return {};
      },
      executeMerge() {
        executed = true;
        return {};
      },
      writeEvidence() {
        return { evidencePath: "test" };
      },
    });
    assert.equal(result.reasonCode, reasonCode, name);
    assert.equal(inspected, false, name);
    assert.equal(executed, false, name);
  }
});

test("feature-bundle dry-run is explicit and performs no live inspection", async () => {
  let inspected = false;
  let executed = false;
  const result = await featureBundleOrchestratorTestInternals.evaluateOrExecuteBundleAutoMerge(
    config({ dryRun: true }),
    fakeBundleInput(null),
    {
      inspectState() {
        inspected = true;
        return {};
      },
      executeMerge(_config, context, options) {
        executed = true;
        assert.equal(options.runner, null);
        return { result: "dry_run_eligible", context };
      },
      writeEvidence() {
        return { evidencePath: "test" };
      },
    },
  );
  assert.equal(inspected, false);
  assert.equal(executed, true);
  assert.equal(result.result, "dry_run_eligible");
});

test("static inventory shows production auto-merge inspection callers pass explicit runners", () => {
  const inventory = [
    { caller: "settleora-auto-runner normal live", path: "tools/auto-runner/settleora-auto-runner.mjs", explicitRunner: true, class: "production live" },
    { caller: "settleora-auto-runner existing PR recovery", path: "tools/auto-runner/settleora-auto-runner.mjs", explicitRunner: true, class: "recovery live" },
    { caller: "auto-merge execute final refresh", path: "tools/auto-runner/lib/auto-merge-policy.mjs", explicitRunner: true, class: "production live" },
    { caller: "auto-merge wait refresh", path: "tools/auto-runner/lib/auto-merge-policy.mjs", explicitRunner: true, class: "production live" },
    { caller: "stack final gates", path: "tools/auto-runner/lib/pr-stack-executor.mjs", explicitRunner: true, class: "recovery live" },
    { caller: "feature-bundle auto-merge", path: "tools/auto-runner/lib/feature-bundle-orchestrator.mjs", explicitRunner: true, class: "feature-bundle live" },
  ];
  assert.equal(inventory.every((item) => item.explicitRunner), true);
  assert.equal(inventory.some((item) => item.class === "feature-bundle live"), true);
});
