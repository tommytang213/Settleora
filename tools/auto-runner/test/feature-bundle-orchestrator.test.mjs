import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { featureBundleOrchestratorTestInternals } from "../lib/feature-bundle-orchestrator.mjs";

const repoRoot = process.cwd();
const repositorySlug = "tommytang213/Settleora";

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
