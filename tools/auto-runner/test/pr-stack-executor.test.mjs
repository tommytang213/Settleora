import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig, parseCliArgs } from "../lib/config.mjs";
import { buildReadOnlyLiveStackFixturePlan, createDependentPrStackPlan } from "../lib/pr-stack-controller.mjs";
import {
  createInitialPrStackState,
  createProductionPrStackAdapter,
  finalExternalGateStatus,
  loadExecutableStackPlan,
  prStackExecutorTestInternals,
  runPrStackExecution,
  validateExecutableStackPlan,
  validatePrStackState,
  writePrStackState,
} from "../lib/pr-stack-executor.mjs";

const sha = (char) => char.repeat(40);

test("CLI accepts the documented stack mode and rejects incomplete or mixed stack invocations", () => {
  assert.throws(() => parseCliArgs(["--run-pr-stack"]), /requires an explicit --config/);
  assert.throws(() => parseCliArgs(["--run-pr-stack", "--config", "/tmp/config.json"]), /requires --stack-plan/);
  assert.throws(() => parseCliArgs(["--run-pr-stack", "--config", "config.json", "--stack-plan", "/tmp/plan.json"]), /absolute --config/);
  assert.throws(() => parseCliArgs(["--run-pr-stack", "--config", "/tmp/config.json", "--stack-plan", "plan.json"]), /absolute --stack-plan/);
  assert.throws(() => parseCliArgs(["--run-pr-stack", "--config", "/tmp/config.json", "--stack-plan", "/tmp/plan.json", "--run"]), /mutually exclusive/);
  const parsed = parseCliArgs(["--run-pr-stack", "--config", "/tmp/config.json", "--stack-plan", "/tmp/plan.json"]);
  assert.equal(parsed.runPrStack, true);
  assert.equal(parsed.stackPlanPath, "/tmp/plan.json");
});

test("stack mode loads as pr-stack-run and cannot be enabled by default config", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-stack-config-"));
  const configPath = path.join(root, "config.json");
  const logsRoot = path.join(root, "logs");
  writeFileSync(configPath, JSON.stringify({ logsRoot, repoRoot: process.cwd(), repositorySlug: "tommytang213/Settleora" }), { mode: 0o600 });
  const config = loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", path.join(logsRoot, "plan.json")]));
  assert.equal(config.mode, "pr-stack-run");
  assert.equal(config.prStackExecution.enabled, false);
});

test("explicit task-scoped config and owner-only plan are required under logs root", () => {
  const { config, planPath } = stackFixture();
  const loaded = loadExecutableStackPlan(config, planPath);
  assert.equal(loaded.ok, true);

  const defaultBlocked = loadExecutableStackPlan({ ...config, prStackExecution: { enabled: false, allowRun: false, capabilities: {} } }, planPath);
  assert.equal(defaultBlocked.reasonCode, "stack_execution_disabled_by_config");
  const outside = path.join(os.tmpdir(), `outside-${Date.now()}.json`);
  writeFileSync(outside, JSON.stringify(makePlan()), { mode: 0o600 });
  assert.equal(loadExecutableStackPlan(config, outside).reasonCode, "stack_plan_outside_logs_root");
});

test("read-only live fixture remains non executable and PR 917 is refused", () => {
  const { config } = stackFixture();
  const readOnly = buildReadOnlyLiveStackFixturePlan(pr(919, "main", "feature/auto-913-parent", sha("a")), pr(920, "feature/auto-913-parent", "feature/auto-913-child", sha("b")));
  assert.equal(validateExecutableStackPlan(config, readOnly.plan, { source: readOnly }).reasonCode, "readonly_stack_fixture_not_executable");
  const bad = makePlan({ prs: [pr(917, "main", "feature/auto-913-bad", sha("a")), pr(920, "feature/auto-913-bad", "feature/auto-913-child", sha("b"))] });
  assert.equal(validateExecutableStackPlan(config, bad).reasonCode, "stack_pr_917_refused");
});

test("malformed state blocks before any adapter call", async () => {
  const fixture = stackFixture();
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  writeFileSync(statePath, "{bad", { mode: 0o600 });
  let calls = 0;
  const result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter: { inspectPr: () => { calls += 1; return { ok: true }; } } });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "stack_state_corrupt");
  assert.equal(calls, 0);
});

test("executor follows nextStackAction through convergence, gates, merge, current-main, retarget, own-delta, ready, child merge, and hygiene", async () => {
  const fixture = stackFixture();
  const calls = [];
  const adapter = scriptedAdapter(calls);
  const expected = [
    "inspect:919", "converge:919",
    "gates:919",
    "merge:919",
    "current-main:919",
    "retarget:920",
    "own-delta:920", "ready:920",
    "inspect:920", "converge:920",
    "gates:920",
    "merge:920",
    "hygiene",
  ];
  for (let i = 0; i < expected.length; i += 1) {
    const result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter });
  assert.equal(result.ok, true, result.reasonCode);
  }
  assert.deepEqual(calls, expected);
  const state = JSON.parse(readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.terminal.reasonCode, "stack_complete");
});

test("parent material findings are passed to existing PR convergence and sanitized #919 fixture does not merge", async () => {
  const fixture = stackFixture();
  const findings = [
    { title: "Use one digest format for recovery evidence", path: "tools/auto-runner/lib/config.mjs", body: "digest-format mismatch" },
    { title: "Require recovery evidence to carry run identity", path: "tools/auto-runner/lib/config.mjs", body: "missing runner/supervisor run identity" },
  ];
  let received = null;
  const result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      inspectPr: async () => ({ ok: true, headRefOid: sha("a"), findings }),
      convergeExistingPr: async ({ findings: passed }) => {
        received = passed;
        return { ok: false, reasonCode: "existing_pr_convergence_required", reason: "material findings" };
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "existing_pr_convergence_required");
  assert.equal(received.length, 2);
});

test("production stack convergence invokes shared batch-fix callback with complete inventory once", async () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, allowReviewFixMutation: true, maxReviewFixCycles: 50 };
  const findings = [
    { provider: "codex", title: "A", path: "tools/auto-runner/lib/pr-stack-executor.mjs", body: "first" },
    { provider: "codex", title: "B", path: "tools/auto-runner/lib/pr-stack-executor.mjs", body: "second" },
  ];
  const calls = [];
  const adapter = createProductionPrStackAdapter(config, {
    runBatchFix: async ({ fixTask, convergence }) => {
      calls.push({ fixTask, convergence });
      return { ok: true, newHead: sha("c") };
    },
  });
  const result = await adapter.convergeExistingPr({ pr: fixture.plan.orderedPrs[0], findings, state: createInitialPrStackState({ plan: fixture.plan }), plan: fixture.plan });
  assert.equal(result.ok, true, result.reasonCode);
  assert.equal(result.newHead, sha("c"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].convergence.findingInventory.length, 2);
  assert.equal(calls[0].fixTask.findingFingerprints.length, 2);
});

test("batch-fix source target rejects protected base remote tag sha option and path-like refs", () => {
  const forbidden = [
    "main",
    "master",
    "feature/auto-913-parent",
    "origin/feature/auto-913-child",
    "refs/heads/feature/auto-913-child",
    "tags/v1",
    sha("a"),
    "-feature",
    "feature//bad",
    "feature/../bad",
    " HEAD",
    "HEAD",
  ];
  for (const branch of forbidden) {
    assert.equal(
      prStackExecutorTestInternals.safeSourceBranchTarget(branch, { baseRefName: "feature/auto-913-parent", defaultBranch: "main" }),
      false,
      branch,
    );
  }
  assert.equal(
    prStackExecutorTestInternals.safeSourceBranchTarget("feature/auto-913-child", { baseRefName: "feature/auto-913-parent", defaultBranch: "main" }),
    true,
  );
});

test("target PR worktree proof fetches fixed argv and proves branch head and live PR identity before Codex", () => {
  const fixture = stackFixture();
  const calls = [];
  const runner = targetWorktreeRunner(calls, { branch: "feature/auto-913-parent", head: sha("a"), remoteHead: sha("a") });
  const proof = prStackExecutorTestInternals.proveTargetBatchFixWorktree({
    config: { ...fixture.config, repoRoot: fixture.root, protectedRoot: path.join(fixture.root, "protected") },
    pr: fixture.plan.orderedPrs[0],
    runner,
  });
  assert.equal(proof.ok, true, proof.reasonCode);
  assert.equal(proof.worktreePath, fixture.root);
  assert.equal(proof.actualHead, sha("a"));
  assert.equal(proof.repositoryIdentity.headRepositorySlug, "tommytang213/Settleora");
  assert.deepEqual(calls, [
    "gh pr view 919 --repo tommytang213/Settleora --json number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository",
    "git remote get-url --push origin",
    "git status --porcelain=v1 --untracked-files=all",
    "git fetch origin feature/auto-913-parent",
    "git rev-parse origin/feature/auto-913-parent",
    "git branch --show-current",
    "git rev-parse HEAD",
    "git branch --show-current",
    "git rev-parse HEAD",
  ]);
});

test("target PR worktree proof rejects protected root dirty worktree wrong branch and remote advance before Codex", () => {
  const fixture = stackFixture();
  const pr = fixture.plan.orderedPrs[0];
  const protectedResult = prStackExecutorTestInternals.proveTargetBatchFixWorktree({
    config: { ...fixture.config, repoRoot: fixture.root, protectedRoot: fixture.root },
    pr,
    runner: targetWorktreeRunner([], {}),
  });
  assert.equal(protectedResult.reasonCode, "existing_pr_batch_fix_protected_root_refused");

  const dirty = prStackExecutorTestInternals.proveTargetBatchFixWorktree({
    config: { ...fixture.config, repoRoot: fixture.root, protectedRoot: path.join(fixture.root, "protected") },
    pr,
    runner: targetWorktreeRunner([], { statusPorcelain: " M tools/auto-runner/lib/pr-stack-executor.mjs" }),
  });
  assert.equal(dirty.reasonCode, "existing_pr_batch_fix_worktree_dirty");

  const wrongBranch = prStackExecutorTestInternals.proveTargetBatchFixWorktree({
    config: { ...fixture.config, repoRoot: fixture.root, protectedRoot: path.join(fixture.root, "protected") },
    pr,
    runner: targetWorktreeRunner([], { branch: "feature/other", head: sha("b"), remoteHead: sha("a") }),
  });
  assert.equal(wrongBranch.reasonCode, "existing_pr_batch_fix_wrong_branch_before_codex");

  const advanced = prStackExecutorTestInternals.proveTargetBatchFixWorktree({
    config: { ...fixture.config, repoRoot: fixture.root, protectedRoot: path.join(fixture.root, "protected") },
    pr,
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("a"), remoteHead: sha("c"), liveHead: sha("a") }),
  });
  assert.equal(advanced.reasonCode, "existing_pr_batch_fix_remote_head_stale");
});

test("repository identity gate rejects fork and mismatched live PR repositories before Codex mutation", () => {
  const fixture = stackFixture();
  const pr = fixture.plan.orderedPrs[0];
  const cases = [
    {
      name: "same repository",
      options: {},
      ok: true,
    },
    {
      name: "fork with colliding branch",
      options: { headRepositorySlug: "other/Settleora", isCrossRepository: true },
      reasonCode: "pr_head_repository_mismatch",
    },
    {
      name: "head repository mismatch",
      options: { headRepositorySlug: "tommytang213/Other" },
      reasonCode: "pr_head_repository_mismatch",
    },
    {
      name: "base repository mismatch",
      options: { baseRepositorySlug: "other/Settleora" },
      reasonCode: "pr_base_repository_mismatch",
    },
    {
      name: "missing head repository",
      options: { headRepositorySlug: null },
      reasonCode: "pr_head_repository_missing",
    },
    {
      name: "repository name without owner",
      options: { headRepositoryNameOnly: true },
      reasonCode: "pr_head_repository_missing",
    },
    {
      name: "wrong owner same repo name",
      options: { headRepositorySlug: "other/Settleora" },
      reasonCode: "pr_head_repository_mismatch",
    },
    {
      name: "same owner wrong repo name",
      options: { headRepositorySlug: "tommytang213/Other" },
      reasonCode: "pr_head_repository_mismatch",
    },
  ];
  for (const testCase of cases) {
    const calls = [];
    const result = prStackExecutorTestInternals.proveTargetBatchFixWorktree({
      config: { ...fixture.config, repoRoot: fixture.root, protectedRoot: path.join(fixture.root, "protected") },
      pr,
      runner: targetWorktreeRunner(calls, { branch: "feature/auto-913-parent", head: sha("a"), remoteHead: sha("a"), ...testCase.options }),
    });
    if (testCase.ok) assert.equal(result.ok, true, testCase.name);
    else {
      assert.equal(result.reasonCode, testCase.reasonCode, testCase.name);
      assert.equal(calls.some((call) => call.startsWith("git fetch origin")), false, testCase.name);
      assert.equal(calls.some((call) => call.startsWith("git push origin")), false, testCase.name);
    }
  }
});

test("canonical origin repository parsing accepts safe GitHub origins and rejects credentials or unsupported hosts", () => {
  assert.equal(prStackExecutorTestInternals.canonicalRepositoryFromOriginUrl("https://github.com/tommytang213/Settleora.git", { expectedRepositorySlug: "tommytang213/Settleora" }).repositorySlug, "tommytang213/Settleora");
  assert.equal(prStackExecutorTestInternals.canonicalRepositoryFromOriginUrl("git@github.com:tommytang213/Settleora.git", { expectedRepositorySlug: "tommytang213/Settleora" }).repositorySlug, "tommytang213/Settleora");
  assert.equal(prStackExecutorTestInternals.canonicalRepositoryFromOriginUrl("git@github.com-settleora:tommytang213/Settleora.git", { expectedRepositorySlug: "tommytang213/Settleora" }).repositorySlug, "tommytang213/Settleora");
  const credentialBearing = prStackExecutorTestInternals.canonicalRepositoryFromOriginUrl("https://user:secret@github.com/tommytang213/Settleora.git", { expectedRepositorySlug: "tommytang213/Settleora" });
  assert.equal(credentialBearing.reasonCode, "origin_repository_credentials_refused");
  assert.equal(JSON.stringify(credentialBearing).includes("secret"), false);
  assert.equal(prStackExecutorTestInternals.canonicalRepositoryFromOriginUrl("https://example.com/tommytang213/Settleora.git", { expectedRepositorySlug: "tommytang213/Settleora" }).reasonCode, "origin_repository_unsupported");
});

test("local candidate commit is created before validation evidence can bind to the candidate head", () => {
  const fixture = stackFixture();
  const calls = [];
  let committed = false;
  const runner = (command, args) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
      return { status: 0, stdout: `${committed ? sha("c") : sha("a")}\n`, stderr: "", error: null };
    }
    if (command === "git" && args[0] === "commit") {
      committed = true;
      return fakeRunner(command, args);
    }
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD^") return { status: 0, stdout: `${sha("a")}\n`, stderr: "", error: null };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD^{tree}") return { status: 0, stdout: `${sha("d")}\n`, stderr: "", error: null };
    return fakeRunner(command, args);
  };
  const candidate = prStackExecutorTestInternals.createOrReuseLocalCandidateCommit({
    config: fixture.config,
    runner,
    cwd: fixture.root,
    exactHead: sha("a"),
    changedFiles: ["tools/auto-runner/lib/pr-stack-executor.mjs"],
    message: "Auto-runner stack review-fix batch",
  });
  assert.equal(candidate.ok, true, candidate.reasonCode);
  assert.equal(candidate.parent, sha("a"));
  assert.equal(candidate.newHead, sha("c"));
  assert.ok(calls.indexOf("git commit -m Auto-runner stack review-fix batch") < calls.lastIndexOf("git rev-parse HEAD"));
});

test("validation or review failure can preserve and reuse an unpushed local candidate without recreating it", () => {
  const fixture = stackFixture();
  let commitCalls = 0;
  const runner = (command, args) => {
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: `${sha("c")}\n`, stderr: "", error: null };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD^") return { status: 0, stdout: `${sha("a")}\n`, stderr: "", error: null };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD^{tree}") return { status: 0, stdout: `${sha("d")}\n`, stderr: "", error: null };
    if (command === "git" && args[0] === "status") return { status: 0, stdout: "", stderr: "", error: null };
    if (command === "git" && args[0] === "commit") commitCalls += 1;
    return fakeRunner(command, args);
  };
  const candidate = prStackExecutorTestInternals.createOrReuseLocalCandidateCommit({
    config: fixture.config,
    runner,
    cwd: fixture.root,
    exactHead: sha("a"),
    changedFiles: ["tools/auto-runner/lib/pr-stack-executor.mjs"],
    message: "Auto-runner stack review-fix batch",
  });
  assert.equal(candidate.ok, true, candidate.reasonCode);
  assert.equal(candidate.reused, true);
  assert.equal(candidate.newHead, sha("c"));
  assert.equal(commitCalls, 0);
});

test("push intent is durable before push and crash-after-push reconciliation finalizes without replay", () => {
  const fixture = stackFixture();
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  const intent = prStackExecutorTestInternals.persistPushIntent({
    config: fixture.config,
    markerKey: "existing_pr_batch_fix:919:a:d",
    pr: fixture.plan.orderedPrs[0],
    branch: "feature/auto-913-parent",
    oldHead: sha("a"),
    newHead: sha("c"),
    changedFiles: ["tools/auto-runner/lib/pr-stack-executor.mjs"],
    fingerprintDigest: sha("d"),
    reviewed,
    pushTarget: `origin ${sha("c")}:feature/auto-913-parent`,
    sourceCycleReservation: testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), fingerprintDigest: sha("d") }),
  });
  assert.equal(JSON.parse(readFileSync(intent.intentPath, "utf8")).status, "push_intent");
  const persisted = JSON.parse(readFileSync(intent.intentPath, "utf8"));
  assert.equal(persisted.configuredRepositorySlug, "tommytang213/Settleora");
  assert.equal(persisted.baseRepositorySlug, "tommytang213/Settleora");
  assert.equal(persisted.headRepositorySlug, "tommytang213/Settleora");
  assert.equal(persisted.originRepositorySlug, "tommytang213/Settleora");
  const runner = targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("c"), liveHead: sha("c") });
  const reconciled = prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...fixture.config, repoRoot: fixture.root },
    pr: fixture.plan.orderedPrs[0],
    intent,
    runner,
    requireCandidate: true,
  });
  assert.equal(reconciled.ok, true, reconciled.reasonCode);
  assert.equal(JSON.parse(readFileSync(intent.intentPath, "utf8")).status, "push_confirmed");
});

test("push intent supports preserved multi-commit chains from remote parent to candidate", () => {
  const fixture = stackFixture();
  const reviewed = sourceChangingConvergenceResult({
    prNumber: 919,
    oldHead: sha("a"),
    newHead: sha("d"),
    overrides: {
      sourceIdentity: {
        parent: sha("c"),
        tree: sha("e"),
        commitChain: [sha("a"), sha("b"), sha("c"), sha("d")],
      },
    },
  }).result;
  const intent = prStackExecutorTestInternals.persistPushIntent({
    config: fixture.config,
    markerKey: "existing_pr_batch_fix:919:a:f",
    pr: fixture.plan.orderedPrs[0],
    branch: "feature/auto-913-parent",
    oldHead: sha("a"),
    newHead: sha("d"),
    changedFiles: ["tools/auto-runner/lib/pr-stack-executor.mjs"],
    fingerprintDigest: sha("f"),
    reviewed,
    pushTarget: `origin ${sha("d")}:feature/auto-913-parent`,
    sourceCycleReservation: testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("d"), candidateParent: sha("c"), tree: sha("e"), commitChain: [sha("a"), sha("b"), sha("c"), sha("d")], fingerprintDigest: sha("f") }),
  });
  assert.deepEqual(intent.commitChain, [sha("a"), sha("b"), sha("c"), sha("d")]);
  const reconciled = prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...fixture.config, repoRoot: fixture.root },
    pr: fixture.plan.orderedPrs[0],
    intent,
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("d"), remoteHead: sha("d"), liveHead: sha("d"), commitChain: [sha("a"), sha("b"), sha("c"), sha("d")] }),
    requireCandidate: true,
  });
  assert.equal(reconciled.ok, true, reconciled.reasonCode);
  const badChain = prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...fixture.config, repoRoot: fixture.root },
    pr: fixture.plan.orderedPrs[0],
    intent: { ...intent, commitChain: [sha("a"), sha("b"), sha("d")] },
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("d"), remoteHead: sha("d"), liveHead: sha("d"), commitChain: [sha("a"), sha("b"), sha("c"), sha("d")] }),
  });
  assert.equal(badChain.reasonCode, "push_intent_candidate_parent_mismatch");
});

test("push intent repository identity validator rejects mismatches before push confirmation", () => {
  const fixture = stackFixture();
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  const intent = prStackExecutorTestInternals.persistPushIntent({
    config: fixture.config,
    markerKey: "existing_pr_batch_fix:919:a:d",
    pr: fixture.plan.orderedPrs[0],
    branch: "feature/auto-913-parent",
    oldHead: sha("a"),
    newHead: sha("c"),
    changedFiles: ["tools/auto-runner/lib/pr-stack-executor.mjs"],
    fingerprintDigest: sha("d"),
    reviewed,
    pushTarget: `origin ${sha("c")}:feature/auto-913-parent`,
    sourceCycleReservation: testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), fingerprintDigest: sha("d") }),
  });
  assert.equal(prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...fixture.config, repoRoot: fixture.root },
    pr: fixture.plan.orderedPrs[0],
    intent: { ...intent, headRepositorySlug: "other/Settleora" },
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("c"), liveHead: sha("c") }),
  }).reasonCode, "push_intent_head_repository_mismatch");
  const originMismatchCalls = [];
  assert.equal(prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...fixture.config, repoRoot: fixture.root },
    pr: fixture.plan.orderedPrs[0],
    intent,
    runner: targetWorktreeRunner(originMismatchCalls, { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("c"), liveHead: sha("c"), originUrl: "https://github.com/other/Settleora.git" }),
  }).reasonCode, "origin_repository_mismatch");
  assert.equal(originMismatchCalls.some((call) => call.startsWith("git push origin")), false);
  assert.equal(prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...fixture.config, repoRoot: fixture.root },
    pr: fixture.plan.orderedPrs[0],
    intent,
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("c"), liveHead: sha("c"), headRepositorySlug: "other/Settleora", isCrossRepository: true }),
  }).reasonCode, "pr_head_repository_mismatch");
});

test("startup push-intent reconciliation rejects fork repositories even with matching branch and SHA", () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" };
  const pr = fixture.plan.orderedPrs[0];
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  prStackExecutorTestInternals.persistPushIntent({
    config,
    markerKey: `existing_pr_batch_fix:919:${sha("a")}:${sha("f")}`,
    pr,
    branch: "feature/auto-913-parent",
    oldHead: sha("a"),
    newHead: sha("c"),
    changedFiles: reviewed.changedFiles,
    fingerprintDigest: sha("f"),
    reviewed,
    pushTarget: `origin ${sha("c")}:feature/auto-913-parent`,
    sourceCycleReservation: testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), fingerprintDigest: sha("f"), taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" }),
  });
  const result = prStackExecutorTestInternals.discoverTaskScopedPendingPushIntents({
    config,
    state: createInitialPrStackState({ plan: fixture.plan }),
    pr,
    livePr: {
      headRefOid: sha("c"),
      baseRepositorySlug: "tommytang213/Settleora",
      headRepositorySlug: "other/Settleora",
      originRepositorySlug: "tommytang213/Settleora",
      isCrossRepository: true,
    },
  });
  assert.equal(result.reasonCode, "pr_head_repository_mismatch");
});

test("push intent reconciliation fails closed on conflicting remote or live head and does not replay push", () => {
  const fixture = stackFixture();
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  const intent = prStackExecutorTestInternals.persistPushIntent({
    config: fixture.config,
    markerKey: "existing_pr_batch_fix:919:a:d",
    pr: fixture.plan.orderedPrs[0],
    branch: "feature/auto-913-parent",
    oldHead: sha("a"),
    newHead: sha("c"),
    changedFiles: ["tools/auto-runner/lib/pr-stack-executor.mjs"],
    fingerprintDigest: sha("d"),
    reviewed,
    pushTarget: `origin ${sha("c")}:feature/auto-913-parent`,
    sourceCycleReservation: testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), fingerprintDigest: sha("d") }),
  });
  const runner = targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("z"), remoteHead: sha("z"), liveHead: sha("z") });
  const result = prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...fixture.config, repoRoot: fixture.root },
    pr: fixture.plan.orderedPrs[0],
    intent,
    runner,
  });
  assert.equal(result.reasonCode, "push_intent_conflicting_head");
});

test("canonical nested source-changing result preserves exact validation strong review and compact Codex evidence", async () => {
  const fixture = stackFixture();
  const result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      inspectPr: async () => ({ ok: true, headRefOid: sha("a"), findings: [{ title: "finding" }] }),
      convergeExistingPr: async () => ({
        ...sourceChangingConvergenceResult({
          prNumber: 919,
          oldHead: sha("a"),
          newHead: sha("c"),
          changedFiles: ["tools/auto-runner/lib/pr-stack-executor.mjs", "tools/auto-runner/test/pr-stack-executor.test.mjs"],
          overrides: {
            outer: {
              validation: { headSha: sha("a"), passed: true },
              externalReview: { reviewedHead: sha("a"), status: "pass" },
              review: { reviewedHead: sha("a"), verdict: { verdict: "approve" } },
            },
          },
        }),
      }),
    },
  });
  assert.equal(result.ok, true, result.reasonCode);
  const state = JSON.parse(readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.evidence.validation["919"].headSha, sha("c"));
  assert.equal(state.evidence.strongReview["919"].reviewedHead, sha("c"));
  assert.equal(state.evidence.codexReview["919"].reviewedHead, sha("c"));
  assert.equal(state.evidence.batchFix["919"].changedFilesDigest, digestStrings(["tools/auto-runner/lib/pr-stack-executor.mjs", "tools/auto-runner/test/pr-stack-executor.test.mjs"]));
  assert.equal(state.evidence.gatesPassed["919"], undefined);
  assert.equal(state.evidence.merged["919"], undefined);
});

test("source rebound rejects top-level field drift old heads mismatched base files digest tree and ambiguous markers", () => {
  const valid = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") });
  assert.equal(prStackExecutorTestInternals.normalizeSourceChangingConvergenceResult({ ok: true, newHead: sha("c"), validation: valid.result.validation }, { prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_rebound_result_shape_invalid");
  assert.equal(prStackExecutorTestInternals.normalizeSourceChangingConvergenceResult(sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c"), overrides: { validation: { headSha: sha("a") } } }), { prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_rebound_validation_head_mismatch");
  assert.equal(prStackExecutorTestInternals.normalizeSourceChangingConvergenceResult(sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c"), overrides: { externalReview: { baseSha: sha("b") } } }), { prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_rebound_strong_review_base_mismatch");
  assert.equal(prStackExecutorTestInternals.normalizeSourceChangingConvergenceResult(sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c"), overrides: { validation: { changedFilesDigest: sha("b") } } }), { prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_rebound_validation_file_digest_mismatch");
  assert.equal(prStackExecutorTestInternals.normalizeSourceChangingConvergenceResult(sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c"), overrides: { sourceIdentity: { tree: null } } }), { prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_rebound_tree_missing");
  const ambiguous = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") });
  ambiguous.result.durableMutationMarkers.extra = { ...Object.values(ambiguous.result.durableMutationMarkers)[0] };
  assert.equal(prStackExecutorTestInternals.normalizeSourceChangingConvergenceResult(ambiguous, { prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_rebound_mutation_marker_ambiguous");
});

test("task-scoped pending push intent is reconciled before stale-head blocking and does not dispatch convergence", async () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" };
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  const intent = prStackExecutorTestInternals.persistPushIntent({
    config,
    markerKey: `existing_pr_batch_fix:919:${sha("a")}:${sha("f")}`,
    pr: fixture.plan.orderedPrs[0],
    branch: "feature/auto-913-parent",
    oldHead: sha("a"),
    newHead: sha("c"),
    changedFiles: reviewed.changedFiles,
    fingerprintDigest: sha("f"),
    reviewed,
    pushTarget: `origin ${sha("c")}:feature/auto-913-parent`,
    sourceCycleReservation: testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), fingerprintDigest: sha("f"), taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" }),
  });
  let convergenceCalls = 0;
  const calls = [];
  const result = await runPrStackExecution(config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      inspectPr: async () => ({ ok: true, headRefOid: sha("c"), findings: [] }),
      reconcilePendingPushIntent: async ({ config: cfg, state, pr, livePr }) => prStackExecutorTestInternals.reconcileTaskScopedPendingPushIntent({
        config: { ...cfg, repoRoot: fixture.root },
        state,
        pr,
        livePr,
        runner: targetWorktreeRunner(calls, { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("c"), liveHead: sha("c") }),
      }),
      convergeExistingPr: async () => {
        convergenceCalls += 1;
        return { ok: true };
      },
    },
  });
  assert.equal(result.ok, true, result.reasonCode);
  assert.equal(convergenceCalls, 0);
  assert.equal(JSON.parse(readFileSync(intent.intentPath, "utf8")).status, "push_confirmed");
  const state = JSON.parse(readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.sourceCycles["919"], 1);
  assert.equal(state.exactHeads["919"], sha("c"));
  assert.equal(state.evidence.validation["919"].headSha, sha("c"));
  assert.equal(calls.includes(`git push origin ${sha("c")}:feature/auto-913-parent`), false);
});

test("push intent discovery ignores unrelated intents and fails closed on malformed or multiple matching intents", () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" };
  const pr = fixture.plan.orderedPrs[0];
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  prStackExecutorTestInternals.persistPushIntent({
    config: { ...config, taskKey: "other" },
    markerKey: `existing_pr_batch_fix:919:${sha("a")}:${sha("f")}`,
    pr,
    branch: "feature/auto-913-parent",
    oldHead: sha("a"),
    newHead: sha("c"),
    changedFiles: reviewed.changedFiles,
    fingerprintDigest: sha("f"),
    reviewed,
    pushTarget: `origin ${sha("c")}:feature/auto-913-parent`,
    sourceCycleReservation: testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), fingerprintDigest: sha("f"), taskKey: "other", runId: "run-1", supervisorRunId: "supervisor-1" }),
  });
  assert.equal(prStackExecutorTestInternals.discoverTaskScopedPendingPushIntents({ config, state: createInitialPrStackState({ plan: fixture.plan }), pr, livePr: { headRefOid: sha("c") } }).intents.length, 0);
  writeFileSync(path.join(config.logsRoot, "source-cycle-intents", "bad.json"), "{bad", { mode: 0o600 });
  assert.equal(prStackExecutorTestInternals.discoverTaskScopedPendingPushIntents({ config, state: createInitialPrStackState({ plan: fixture.plan }), pr, livePr: { headRefOid: sha("c") } }).reasonCode, "push_intent_malformed");

  const second = stackFixture();
  const secondConfig = { ...second.config, taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" };
  for (const suffix of ["one", "two"]) {
    const intent = prStackExecutorTestInternals.persistPushIntent({
      config: secondConfig,
      markerKey: `existing_pr_batch_fix:919:${sha("a")}:${sha("f")}`,
      pr: second.plan.orderedPrs[0],
      branch: "feature/auto-913-parent",
      oldHead: sha("a"),
      newHead: sha("c"),
      changedFiles: reviewed.changedFiles,
      fingerprintDigest: sha("f"),
      reviewed,
      pushTarget: `origin ${sha("c")}:feature/auto-913-parent`,
      sourceCycleReservation: testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), fingerprintDigest: sha("f"), taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" }),
    });
    const copyPath = path.join(secondConfig.logsRoot, "source-cycle-intents", `${suffix}.json`);
    writeFileSync(copyPath, JSON.stringify({ ...JSON.parse(readFileSync(intent.intentPath, "utf8")), intentPath: copyPath }, null, 2), { mode: 0o600 });
  }
  assert.equal(prStackExecutorTestInternals.reconcileTaskScopedPendingPushIntent({
    config: { ...secondConfig, repoRoot: second.root },
    state: createInitialPrStackState({ plan: second.plan }),
    pr: second.plan.orderedPrs[0],
    livePr: { headRefOid: sha("c") },
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("c"), liveHead: sha("c") }),
  }).reasonCode, "push_intent_ambiguous");
});

test("push intent classifications cover not completed unpushed candidate confirmed fetchable local and idempotence", () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" };
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  const intent = prStackExecutorTestInternals.persistPushIntent({
    config,
    markerKey: `existing_pr_batch_fix:919:${sha("a")}:${sha("f")}`,
    pr: fixture.plan.orderedPrs[0],
    branch: "feature/auto-913-parent",
    oldHead: sha("a"),
    newHead: sha("c"),
    changedFiles: reviewed.changedFiles,
    fingerprintDigest: sha("f"),
    reviewed,
    pushTarget: `origin ${sha("c")}:feature/auto-913-parent`,
    sourceCycleReservation: testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), fingerprintDigest: sha("f"), taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" }),
  });
  assert.equal(prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...config, repoRoot: fixture.root },
    pr: fixture.plan.orderedPrs[0],
    intent,
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("a"), remoteHead: sha("a"), liveHead: sha("a") }),
  }).reasonCode, "push_intent_not_completed");
  assert.equal(prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...config, repoRoot: fixture.root },
    pr: fixture.plan.orderedPrs[0],
    intent,
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("a"), liveHead: sha("a") }),
  }).reasonCode, "push_intent_unpushed_candidate");
  const confirmed = prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...config, repoRoot: fixture.root },
    pr: fixture.plan.orderedPrs[0],
    intent,
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("a"), remoteHead: sha("c"), liveHead: sha("c") }),
  });
  assert.equal(confirmed.ok, true, confirmed.reasonCode);
  const idempotent = prStackExecutorTestInternals.finalizePushIntent({ config: { ...config, repoRoot: fixture.root }, pr: fixture.plan.orderedPrs[0], intent: JSON.parse(readFileSync(intent.intentPath, "utf8")), remoteHead: sha("c"), liveHead: sha("c") });
  assert.equal(idempotent.ok, true);
  assert.equal(idempotent.idempotent, true);
});

test("source-cycle reservations enforce creation budget ordinal and duplicate ownership", () => {
  const fixture = stackFixture();
  const pr = fixture.plan.orderedPrs[0];
  const state = createInitialPrStackState({ plan: fixture.plan });
  const budget = prStackExecutorTestInternals.evaluateSourceCycleBudget({
    config: { ...fixture.config, prStackExecution: { ...fixture.config.prStackExecution, maxSourceCyclesPerPr: 2 } },
    state,
    pr,
    findings: [{ title: "finding" }],
  });
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  const reserved = prStackExecutorTestInternals.persistSourceCycleReservation({
    config: { ...fixture.config, prStackExecution: { ...fixture.config.prStackExecution, maxSourceCyclesPerPr: 2 } },
    state,
    pr,
    budget,
    oldHead: sha("a"),
    newHead: sha("c"),
    changedFiles: reviewed.changedFiles,
    fingerprintDigest: sha("f"),
    reviewed,
  });
  assert.equal(reserved.ok, true, reserved.reasonCode);
  assert.equal(reserved.reservation.consumedBefore, 0);
  assert.equal(reserved.reservation.consumedAfter, 1);
  assert.equal(reserved.reservation.maxAtReservation, 2);

  const duplicate = prStackExecutorTestInternals.persistSourceCycleReservation({
    config: { ...fixture.config, prStackExecution: { ...fixture.config.prStackExecution, maxSourceCyclesPerPr: 2 } },
    state,
    pr,
    budget,
    oldHead: sha("a"),
    newHead: sha("d"),
    changedFiles: reviewed.changedFiles,
    fingerprintDigest: sha("g"),
    reviewed: sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("d"), fingerprintDigest: sha("g") }).result,
  });
  assert.equal(duplicate.reasonCode, "source_cycle_reservation_conflict");

  state.sourceCycles["919"] = 2;
  const exhausted = prStackExecutorTestInternals.evaluateSourceCycleBudget({
    config: { ...fixture.config, prStackExecution: { ...fixture.config.prStackExecution, maxSourceCyclesPerPr: 2 } },
    state,
    pr,
    findings: [{ title: "finding" }],
  });
  assert.equal(exhausted.reasonCode, "source_cycle_budget_exhausted");
  assert.equal(prStackExecutorTestInternals.persistSourceCycleReservation({
    config: { ...fixture.config, prStackExecution: { ...fixture.config.prStackExecution, maxSourceCyclesPerPr: 2 } },
    state,
    pr,
    budget: exhausted,
    oldHead: sha("a"),
    newHead: sha("e"),
    changedFiles: reviewed.changedFiles,
    fingerprintDigest: sha("h"),
    reviewed,
  }).reasonCode, "source_cycle_budget_exhausted");
});

test("production commitAndPush requires explicit validated stack state before reservation or push", async () => {
  const fixture = stackFixture();
  const pr = fixture.plan.orderedPrs[0];
  const state = createInitialPrStackState({ plan: fixture.plan });
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  const budget = prStackExecutorTestInternals.evaluateSourceCycleBudget({
    config: fixture.config,
    state,
    pr,
    findings: [{ title: "finding" }],
  });
  const calls = [];
  const adapters = prStackExecutorTestInternals.createProductionBatchFixAdapters(fixture.config, {
    runner: productionPushRunner(calls, { branch: "feature/auto-913-parent", oldHead: sha("a"), candidateHead: sha("c") }),
  });
  const missing = await adapters.commitAndPush({
    exactHead: sha("a"),
    changedFiles: reviewed.changedFiles,
    reviewed,
    pr,
    fingerprintDigest: sha("f"),
    markerKey: `existing_pr_batch_fix:919:${sha("a")}:${sha("f")}`,
    sourceCycleBudget: budget,
    plan: fixture.plan,
  });
  assert.equal(missing.reasonCode, "source_cycle_operation_state_missing");
  assert.equal(calls.some((call) => call.startsWith("git push origin")), false);
  assert.equal(calls.some((call) => call.includes("source-cycle-reservations")), false);
});

test("production commitAndPush binds reservation to exact durable state and pushes after readback", async () => {
  const fixture = stackFixture();
  const pr = fixture.plan.orderedPrs[0];
  const state = createInitialPrStackState({ plan: fixture.plan });
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  const budget = prStackExecutorTestInternals.evaluateSourceCycleBudget({
    config: fixture.config,
    state,
    pr,
    findings: [{ title: "finding" }],
  });
  const context = prStackExecutorTestInternals.createSourceCycleOperationContext({ config: fixture.config, plan: fixture.plan, state, pr, sourceCycleBudget: budget });
  assert.equal(context.ok, true, context.reasonCode);
  const calls = [];
  const adapters = prStackExecutorTestInternals.createProductionBatchFixAdapters(fixture.config, {
    runner: productionPushRunner(calls, { branch: "feature/auto-913-parent", oldHead: sha("a"), candidateHead: sha("c") }),
  });
  const pushed = await adapters.commitAndPush({
    exactHead: sha("a"),
    changedFiles: reviewed.changedFiles,
    reviewed,
    pr,
    fingerprintDigest: sha("f"),
    markerKey: `existing_pr_batch_fix:919:${sha("a")}:${sha("f")}`,
    sourceCycleBudget: budget,
    sourceCycleOperationContext: context.context,
    plan: fixture.plan,
  });
  assert.equal(pushed.ok, true, pushed.reasonCode);
  assert.equal(pushed.sourceCycleReservation.status, "source_cycle_finalized");
  assert.equal(pushed.sourceCycleReservation.consumedAfter, 1);
  assert.equal(calls.filter((call) => call === `git push origin ${sha("c")}:feature/auto-913-parent`).length, 1);
});

test("source-cycle operation context rejects malformed stale or foreign state before reservation", () => {
  const fixture = stackFixture();
  const pr = fixture.plan.orderedPrs[0];
  const state = createInitialPrStackState({ plan: fixture.plan });
  const budget = prStackExecutorTestInternals.evaluateSourceCycleBudget({ config: fixture.config, state, pr, findings: [{ title: "finding" }] });
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  assert.equal(prStackExecutorTestInternals.createSourceCycleOperationContext({ config: fixture.config, plan: fixture.plan, state: { ...state, stateVersion: 0 }, pr, sourceCycleBudget: budget }).reasonCode, "stack_state_unknown_version");
  assert.equal(prStackExecutorTestInternals.createSourceCycleOperationContext({ config: fixture.config, plan: fixture.plan, state: { ...state, activePrNumber: 920 }, pr, sourceCycleBudget: budget }).reasonCode, "source_cycle_operation_pr_mismatch");
  assert.equal(prStackExecutorTestInternals.createSourceCycleOperationContext({ config: fixture.config, plan: fixture.plan, state: { ...state, exactHeads: { ...state.exactHeads, 919: sha("b") } }, pr, sourceCycleBudget: budget }).reasonCode, "source_cycle_operation_head_mismatch");
  assert.equal(prStackExecutorTestInternals.createSourceCycleOperationContext({ config: fixture.config, plan: fixture.plan, state: { ...state, sourceCycles: { ...state.sourceCycles, 919: 1 } }, pr, sourceCycleBudget: budget }).reasonCode, "source_cycle_reservation_conflict");
  const context = prStackExecutorTestInternals.createSourceCycleOperationContext({ config: fixture.config, plan: fixture.plan, state, pr, sourceCycleBudget: budget });
  assert.equal(context.ok, true);
  assert.equal(prStackExecutorTestInternals.validateSourceCycleOperationContext({
    config: fixture.config,
    plan: fixture.plan,
    context: { ...context.context, state: { ...context.context.state, repository: "other/Settleora" } },
    pr,
    exactHead: sha("a"),
    newHead: sha("c"),
    changedFiles: reviewed.changedFiles,
    fingerprintDigest: sha("f"),
    reviewed,
    sourceCycleBudget: budget,
  }).reasonCode, "stack_state_identity_mismatch");
});

test("source-cycle reservation shape rejects over-budget malformed PR epoch chain and candidate drift", () => {
  const fixture = stackFixture();
  const pr = fixture.plan.orderedPrs[0];
  const state = createInitialPrStackState({ plan: fixture.plan });
  const valid = testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), maxAtReservation: 2 });
  assert.equal(prStackExecutorTestInternals.validateSourceCycleReservation({ config: { ...fixture.config, prStackExecution: { ...fixture.config.prStackExecution, maxSourceCyclesPerPr: 2 } }, state, pr, reservation: valid, oldHead: sha("a"), newHead: sha("c"), expectStatus: "source_cycle_reserved", requireCurrentCount: true }).ok, true);
  assert.equal(prStackExecutorTestInternals.validateSourceCycleReservation({ config: fixture.config, state, pr, reservation: { ...valid, consumedBefore: 2, consumedAfter: 3, reservedOrdinal: 3, maxAtReservation: 2 }, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_cycle_reservation_over_budget");
  assert.equal(prStackExecutorTestInternals.validateSourceCycleReservation({ config: fixture.config, state, pr, reservation: { ...valid, consumedAfter: 3, reservedOrdinal: 3 }, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_cycle_reservation_malformed");
  assert.equal(prStackExecutorTestInternals.validateSourceCycleReservation({ config: fixture.config, state, pr, reservation: { ...valid, prNumber: 920 }, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_cycle_reservation_pr_mismatch");
  assert.equal(prStackExecutorTestInternals.validateSourceCycleReservation({ config: fixture.config, state, pr, reservation: { ...valid, sourceCycleEpoch: 2 }, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_cycle_reservation_epoch_mismatch");
  assert.equal(prStackExecutorTestInternals.validateSourceCycleReservation({ config: fixture.config, state, pr, reservation: { ...valid, commitChainDigest: sha("z") }, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_cycle_reservation_chain_mismatch");
  assert.equal(prStackExecutorTestInternals.validateSourceCycleReservation({ config: fixture.config, state, pr, reservation: { ...valid, finalCandidateHead: sha("d"), candidateNewHead: sha("d") }, oldHead: sha("a"), newHead: sha("c") }).reasonCode, "source_cycle_reservation_candidate_mismatch");
});

test("stale-head reconciliation requires finalized reservation and never treats exhausted budget as success", async () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1", prStackExecution: { ...fixture.config.prStackExecution, maxSourceCyclesPerPr: 2 } };
  const pr = fixture.plan.orderedPrs[0];
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.sourceCycles["919"] = 2;
  writePrStackState(statePath, state);
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  prStackExecutorTestInternals.persistPushIntent({
    config,
    markerKey: `existing_pr_batch_fix:919:${sha("a")}:${sha("f")}`,
    pr,
    branch: "feature/auto-913-parent",
    oldHead: sha("a"),
    newHead: sha("c"),
    changedFiles: reviewed.changedFiles,
    fingerprintDigest: sha("f"),
    reviewed,
    pushTarget: `origin ${sha("c")}:feature/auto-913-parent`,
    sourceCycleReservation: testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), fingerprintDigest: sha("f"), maxAtReservation: 2, consumedBefore: 2, taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" }),
  });
  let convergenceCalls = 0;
  const calls = [];
  const result = await runPrStackExecution(config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      inspectPr: async () => ({ ok: true, headRefOid: sha("c"), findings: [{ title: "finding" }] }),
      reconcilePendingPushIntent: async ({ config: cfg, state: current, pr: currentPr, livePr }) => prStackExecutorTestInternals.reconcileTaskScopedPendingPushIntent({
        config: { ...cfg, repoRoot: fixture.root },
        state: current,
        pr: currentPr,
        livePr,
        runner: targetWorktreeRunner(calls, { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("c"), liveHead: sha("c") }),
      }),
      convergeExistingPr: async () => {
        convergenceCalls += 1;
        return sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("d") });
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "source_cycle_reservation_over_budget");
  assert.equal(convergenceCalls, 0);
  assert.equal(calls.includes(`git push origin ${sha("c")}:feature/auto-913-parent`), false);
  assert.equal(JSON.parse(readFileSync(statePath, "utf8")).sourceCycles["919"], 2);
});

test("remote candidate reconciliation finalizes exactly once and fails closed without matching marker", async () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" };
  const pr = fixture.plan.orderedPrs[0];
  const reviewed = sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }).result;
  const reservation = testSourceCycleReservation({ oldHead: sha("a"), newHead: sha("c"), fingerprintDigest: sha("f"), taskKey: "task-1", runId: "run-1", supervisorRunId: "supervisor-1" });
  const intent = prStackExecutorTestInternals.persistPushIntent({
    config,
    markerKey: `existing_pr_batch_fix:919:${sha("a")}:${sha("f")}`,
    pr,
    branch: "feature/auto-913-parent",
    oldHead: sha("a"),
    newHead: sha("c"),
    changedFiles: reviewed.changedFiles,
    fingerprintDigest: sha("f"),
    reviewed,
    pushTarget: `origin ${sha("c")}:feature/auto-913-parent`,
    sourceCycleReservation: reservation,
  });
  const confirmed = prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...config, repoRoot: fixture.root },
    pr,
    intent,
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("c"), liveHead: sha("c") }),
  });
  assert.equal(confirmed.ok, true, confirmed.reasonCode);
  assert.equal(confirmed.sourceCycleReservation.consumedAfter, 1);
  const confirmedIntent = JSON.parse(readFileSync(intent.intentPath, "utf8"));
  const incompleteReboundState = createInitialPrStackState({ plan: fixture.plan });
  const discoveredConfirmed = prStackExecutorTestInternals.discoverTaskScopedPendingPushIntents({
    config,
    state: incompleteReboundState,
    pr,
    livePr: { headRefOid: sha("c") },
  });
  assert.equal(discoveredConfirmed.ok, true, discoveredConfirmed.reasonCode);
  assert.equal(discoveredConfirmed.intents.length, 1);
  assert.equal(discoveredConfirmed.intents[0].status, "push_confirmed");
  const restartCalls = [];
  const recovered = prStackExecutorTestInternals.reconcileTaskScopedPendingPushIntent({
    config: { ...config, repoRoot: fixture.root },
    state: incompleteReboundState,
    pr,
    livePr: { headRefOid: sha("c") },
    runner: targetWorktreeRunner(restartCalls, { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("c"), liveHead: sha("c") }),
  });
  assert.equal(recovered.ok, true, recovered.reasonCode);
  assert.equal(recovered.sourceCycleReservation.consumedAfter, 1);
  assert.equal(restartCalls.some((call) => call.startsWith("git push origin")), false);
  const reboundState = createInitialPrStackState({ plan: fixture.plan });
  reboundState.sourceCycles["919"] = 1;
  reboundState.exactHeads["919"] = sha("c");
  reboundState.orderedPrs[0].headRefOid = sha("c");
  const alreadyRebound = prStackExecutorTestInternals.discoverTaskScopedPendingPushIntents({
    config,
    state: reboundState,
    pr,
    livePr: { headRefOid: sha("c") },
  });
  assert.equal(alreadyRebound.ok, true, alreadyRebound.reasonCode);
  assert.equal(alreadyRebound.intents.length, 0);
  const terminalPath = path.join(config.logsRoot, "source-cycle-intents", "terminal-rebound.json");
  writeFileSync(terminalPath, JSON.stringify({ ...confirmedIntent, status: "rebound_finalized", intentPath: terminalPath }, null, 2), { mode: 0o600 });
  const terminalIgnored = prStackExecutorTestInternals.discoverTaskScopedPendingPushIntents({
    config,
    state: reboundState,
    pr,
    livePr: { headRefOid: sha("c") },
  });
  assert.equal(terminalIgnored.ok, true, terminalIgnored.reasonCode);
  assert.equal(terminalIgnored.intents.length, 0);
  const idempotent = prStackExecutorTestInternals.reconcilePushIntent({
    config: { ...config, repoRoot: fixture.root },
    pr,
    intent: confirmedIntent,
    runner: targetWorktreeRunner([], { branch: "feature/auto-913-parent", head: sha("c"), remoteHead: sha("c"), liveHead: sha("c") }),
  });
  assert.equal(idempotent.ok, true, idempotent.reasonCode);
  assert.equal(idempotent.idempotent, true);
  const staleCountState = createInitialPrStackState({ plan: fixture.plan });
  staleCountState.sourceCycles["919"] = 1;
  const pendingWithoutFinalizedReservationPath = path.join(config.logsRoot, "source-cycle-intents", "pending-without-finalized-reservation.json");
  writeFileSync(
    pendingWithoutFinalizedReservationPath,
    JSON.stringify({
      ...confirmedIntent,
      status: "push_intent",
      intentPath: pendingWithoutFinalizedReservationPath,
      sourceCycleReservation: { ...confirmedIntent.sourceCycleReservation, status: "source_cycle_reserved", finalizedAt: null },
    }, null, 2),
    { mode: 0o600 },
  );
  const missingMarker = prStackExecutorTestInternals.discoverTaskScopedPendingPushIntents({
    config,
    state: staleCountState,
    pr,
    livePr: { headRefOid: sha("c") },
  });
  assert.equal(missingMarker.reasonCode, "source_cycle_reservation_conflict");
});

test("new source head consumes one parent cycle and waits do not consume cycles", async () => {
  const fixture = stackFixture();
  let result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      inspectPr: async () => ({ ok: true, headRefOid: sha("a"), findings: [] }),
      convergeExistingPr: async () => sourceChangingConvergenceResult({ prNumber: 919, oldHead: sha("a"), newHead: sha("c") }),
    },
  });
    assert.equal(result.ok, true, result.reasonCode);
  let state = JSON.parse(readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.sourceCycles["919"], 1);
  assert.equal(state.exactHeads["919"], sha("c"));
  assert.equal(state.orderedPrs[0].headRefOid, sha("c"));
  assert.equal(state.evidence.reviewConverged["919"].newHead, sha("c"));

  result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      completeFinalGates: async ({ pr }) => {
        assert.equal(pr.headRefOid, sha("c"));
        return { ok: false, waiting: true, reasonCode: "ci_check_completion_wait" };
      },
    },
  });
  assert.equal(result.outcome, "waiting");
  state = JSON.parse(readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.sourceCycles["919"], 1);

  const waitFixture = stackFixture();
  const waitStatePath = path.join(path.dirname(waitFixture.planPath), "stack-state.json");
  const waitState = createInitialPrStackState({ plan: waitFixture.plan });
  waitState.evidence.reviewConverged["919"] = { ok: true };
  writePrStackState(waitStatePath, waitState);
  result = await runPrStackExecution(waitFixture.config, { stackPlanPath: waitFixture.planPath }, {
    adapter: { completeFinalGates: async () => ({ ok: false, waiting: true, reasonCode: "ci_check_completion_wait" }) },
  });
  assert.equal(result.outcome, "waiting");
  state = JSON.parse(readFileSync(waitStatePath, "utf8"));
  assert.equal(state.sourceCycles["919"], 0);
});

test("source-changing cycles are independently available up to 50 per PR", () => {
  const plan = makePlan();
  const state = createInitialPrStackState({ plan });
  state.sourceCycles["919"] = 50;
  state.sourceCycles["920"] = 49;
  assert.equal(validatePrStackState(state, plan).ok, true);
});

test("persisted source-cycle budget is passed through and exhausted budgets block before convergence mutation", async () => {
  const fixture = stackFixture();
  let receivedBudget = null;
  let convergeCalls = 0;
  let result = await runPrStackExecution(
    { ...fixture.config, prStackExecution: { ...fixture.config.prStackExecution, maxSourceCyclesPerPr: 2 } },
    { stackPlanPath: fixture.planPath },
    {
      adapter: {
        inspectPr: async () => ({ ok: true, headRefOid: sha("a"), findings: [{ title: "finding", material: true }] }),
        convergeExistingPr: async ({ sourceCycleBudget }) => {
          convergeCalls += 1;
          receivedBudget = sourceCycleBudget;
          return { ok: true, headRefOid: sha("a") };
        },
      },
    },
  );
  assert.equal(result.ok, true, result.reasonCode);
  assert.equal(convergeCalls, 1);
  assert.equal(receivedBudget.consumed, 0);
  assert.equal(receivedBudget.remaining, 2);

  const exhaustedFixture = stackFixture();
  const statePath = path.join(path.dirname(exhaustedFixture.planPath), "stack-state.json");
  const state = createInitialPrStackState({ plan: exhaustedFixture.plan });
  state.sourceCycles["919"] = 2;
  writePrStackState(statePath, state);
  result = await runPrStackExecution(
    { ...exhaustedFixture.config, prStackExecution: { ...exhaustedFixture.config.prStackExecution, maxSourceCyclesPerPr: 2 } },
    { stackPlanPath: exhaustedFixture.planPath },
    {
      adapter: {
        inspectPr: async () => ({ ok: true, headRefOid: sha("a"), findings: [{ title: "finding", material: true }] }),
        convergeExistingPr: async () => {
          convergeCalls += 1;
          return { ok: true };
        },
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "source_cycle_budget_exhausted");
  assert.equal(convergeCalls, 1);
});

test("malformed or wrong-PR source-cycle state fails closed while independent PR counters remain separate", async () => {
  const fixture = stackFixture();
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.sourceCycles["919"] = "1";
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  let result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      inspectPr: async () => ({ ok: true, headRefOid: sha("a"), findings: [{ title: "finding" }] }),
      convergeExistingPr: async () => ({ ok: true }),
    },
  });
  assert.equal(result.reasonCode, "source_cycle_state_malformed");

  const childFixture = stackFixtureAtChild({ retargeted: true, ownDelta: true, ready: true });
  const childStatePath = path.join(path.dirname(childFixture.planPath), "stack-state.json");
  const childState = JSON.parse(readFileSync(childStatePath, "utf8"));
  childState.sourceCycles["919"] = 50;
  childState.sourceCycles["920"] = 0;
  writePrStackState(childStatePath, childState);
  result = await runPrStackExecution(
    { ...childFixture.config, prStackExecution: { ...childFixture.config.prStackExecution, maxSourceCyclesPerPr: 1 } },
    { stackPlanPath: childFixture.planPath },
    {
      adapter: {
        inspectPr: async () => ({ ok: true, headRefOid: sha("b"), findings: [{ title: "child finding" }] }),
        convergeExistingPr: async () => ({ ok: true, headRefOid: sha("b") }),
      },
    },
  );
  assert.equal(result.ok, true, result.reasonCode);
});

test("canonical commit-chain validation accepts multi-commit rebound and rejects digest or adjacency drift", () => {
  const chain = [sha("a"), sha("b"), sha("c"), sha("d")];
  const valid = sourceChangingConvergenceResult({
    prNumber: 919,
    oldHead: sha("a"),
    newHead: sha("d"),
    overrides: { sourceIdentity: { parent: sha("c"), commitChain: chain } },
  });
  const normalized = prStackExecutorTestInternals.normalizeSourceChangingConvergenceResult(valid, { prNumber: 919, oldHead: sha("a"), newHead: sha("d") });
  assert.equal(normalized.ok, true, normalized.reasonCode);
  assert.deepEqual(normalized.sourceIdentity.commitChain, chain);
  assert.equal(normalized.sourceIdentity.parent, sha("c"));
  assert.equal(
    prStackExecutorTestInternals.normalizeSourceChangingConvergenceResult(
      sourceChangingConvergenceResult({
        prNumber: 919,
        oldHead: sha("a"),
        newHead: sha("d"),
        overrides: { sourceIdentity: { parent: sha("c"), commitChain: chain, commitChainDigest: sha("f") } },
      }),
      { prNumber: 919, oldHead: sha("a"), newHead: sha("d") },
    ).reasonCode,
    "source_rebound_commit_chain_digest_mismatch",
  );
  assert.equal(
    prStackExecutorTestInternals.validateCanonicalCommitChain([sha("a"), sha("c"), sha("b"), sha("d")], { oldHead: sha("a"), newHead: sha("d"), candidateParent: sha("c") }).reasonCode,
    "source_rebound_candidate_parent_mismatch",
  );
});

test("parent merge proof and current-main proof are required before child retarget", async () => {
  const fixture = stackFixture();
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.reviewConverged["919"] = { ok: true };
  state.evidence.gatesPassed["919"] = { ok: true };
  state.evidence.merged["919"] = { ok: true, merged: true };
  state.activePrNumber = 920;
  writePrStackState(statePath, state);
  const result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter: { fetchCurrentMain: async () => ({ ok: false, reasonCode: "changed_origin_main_requires_refresh" }) } });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "changed_origin_main_requires_refresh");
});

test("child retarget is exact-once and head/base guarded", async () => {
  const fixture = stackFixtureAtChild();
  let retargets = 0;
  const adapter = {
    retargetPrBase: async ({ expectedHead, expectedCurrentBase }) => {
      retargets += 1;
      assert.equal(expectedHead, sha("b"));
      assert.equal(expectedCurrentBase, "feature/auto-913-parent");
      return { ok: true };
    },
    proveSemanticOwnDelta: async ({ pr }) => ({ ok: true, before: pr.ownDelta, after: { ...pr.ownDelta, reversePatchApplies: true } }),
    markReadyForReview: async () => ({ ok: true }),
  };
  assert.equal((await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter })).ok, true);
  assert.equal((await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter })).ok, true);
  assert.equal(retargets, 1);
});

test("semantic own-delta proof is mandatory and ready transition requires it", async () => {
  const fixture = stackFixtureAtChild({ retargeted: true });
  let ready = 0;
  const missing = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter: { proveSemanticOwnDelta: async () => ({ ok: false }) } });
  assert.equal(missing.reasonCode, "semantic_own_delta_missing_evidence");
  const ok = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      proveSemanticOwnDelta: async ({ pr }) => ({ ok: true, before: pr.ownDelta, after: { ...pr.ownDelta, reversePatchApplies: true } }),
      markReadyForReview: async () => { ready += 1; return { ok: true }; },
    },
  });
  assert.equal(ok.ok, true, ok.reasonCode);
  assert.equal(ready, 1);
});

test("final hygiene occurs only after every PR has merge proof", async () => {
  const fixture = stackFixtureAtChild({ retargeted: true, ownDelta: true, ready: true, childConverged: true, childGates: true });
  let hygiene = 0;
  let result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter: { mergePr: async () => ({ ok: true, mergeSha: sha("d") }) } });
  assert.equal(result.ok, true, result.reasonCode);
  result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter: { runFinalHygiene: async () => { hygiene += 1; return { ok: true }; } } });
  assert.equal(result.ok, true);
  assert.equal(hygiene, 1);
});

test("production final hygiene requires the injected live runner and records command evidence", async () => {
  const fixture = stackFixture();
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.merged["919"] = { ok: true, mergeSha: sha("c") };
  state.evidence.merged["920"] = { ok: true, mergeSha: sha("d") };

  const missing = await createProductionPrStackAdapter(fixture.config).runFinalHygiene({ config: fixture.config, plan: fixture.plan, state });
  assert.equal(missing.ok, false);
  assert.equal(missing.reasonCode, "final_hygiene_runner_missing");

  const dryRunAdapter = createProductionPrStackAdapter({ ...fixture.config, dryRun: true }, { runner: finalHygieneRunner([]) });
  const dryRun = await dryRunAdapter.runFinalHygiene({ config: { ...fixture.config, dryRun: true }, plan: fixture.plan, state });
  assert.equal(dryRun.ok, false);
  assert.equal(dryRun.reasonCode, "final_hygiene_dry_run_cannot_complete_stack");

  const calls = [];
  const adapter = createProductionPrStackAdapter(fixture.config, { runner: finalHygieneRunner(calls) });
  const result = await adapter.runFinalHygiene({ config: fixture.config, plan: fixture.plan, state });
  assert.equal(result.ok, true, result.reasonCode);
  assert.equal(result.result.commandEvidence.some((entry) => entry.command === "gh" && entry.args.includes("--repo") && entry.args.includes("tommytang213/Settleora")), true);
  assert.equal(calls.some((call) => call.startsWith("gh issue comment 921")), true);
  assert.equal(calls.some((call) => call.startsWith("gh issue comment 800")), true);
});

test("production final hygiene rejects claimed success when a required component fails", async () => {
  const fixture = stackFixture();
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.merged["919"] = { ok: true, mergeSha: sha("c") };
  state.evidence.merged["920"] = { ok: true, mergeSha: sha("d") };
  const adapter = createProductionPrStackAdapter(fixture.config, {
    runner: finalHygieneRunner([], { failFirstIssueComment: true }),
  });
  const result = await adapter.runFinalHygiene({ config: fixture.config, plan: fixture.plan, state });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "final_hygiene_component_failed");
  assert.equal(result.component, "comment");
});

test("production merge adapter carries real gate changed-file evidence", async () => {
  const fixture = stackFixture();
  const changedFiles = ["tools/auto-runner/lib/pr-stack-executor.mjs"];
  const digest = digestStrings(changedFiles);
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.gatesPassed["919"] = {
    ok: true,
    changedFiles,
    changedFilesExactlyMatchAllowedPaths: true,
    allowedPathProof: {
      ok: true,
      exactHead: sha("a"),
      changedFiles,
      changedFilesDigest: digestJson(changedFiles),
      rejectedPaths: [],
      changedFilesExactlyMatchAllowedPaths: true,
    },
    laneDecision: {
      lane: "workflow-docs-tooling",
      canonicalLane: "workflow-docs-tooling",
      branchStrategy: "normal",
      validationProfile: "runner-tests",
      reviewerTier: "strong_independent",
      allowedToImplement: true,
      autoMergeEligible: true,
      manualMergeRequired: false,
      contract: { autoMergeEligible: true, manualMergeRequired: false },
      laneManifest: { decisionType: "runnable", autoMergeAllowed: true },
      allowedPaths: ["tools/auto-runner/**"],
    },
    validation: {
      passed: true,
      results: [{ command: "node --test tools/auto-runner/test/pr-stack-executor.test.mjs", status: 0 }],
      completedAt: new Date().toISOString(),
      headSha: sha("a"),
      baseSha: sha("e"),
      changedFiles,
      changedFilesDigest: digest,
      profile: "runner-tests",
    },
    externalReview: {
      status: "pass",
      tier: "strong_independent",
      verdict: "pass",
      reviewedHead: sha("a"),
      baseSha: sha("e"),
      changedFiles,
      changedFilesDigest: digest,
      independent: true,
      provider: "gemini",
      providerProfile: "gemini-strong",
      evidencePath: "/workspace/logs/settleora-auto-runner/reviews/strong.json",
      completedAt: new Date().toISOString(),
    },
    review: {
      reviewedHead: sha("a"),
      baseSha: sha("e"),
      changedFiles,
      changedFilesDigest: digest,
      verdict: { verdict: "approve" },
      completedAt: new Date().toISOString(),
    },
    reviewEvidence: {
      strongIndependent: {
        status: "pass",
        tier: "strong_independent",
        verdict: "pass",
        reviewedHead: sha("a"),
        baseSha: sha("e"),
        changedFiles,
        changedFilesDigest: digest,
        independent: true,
        provider: "gemini",
        providerProfile: "gemini-strong",
        evidencePath: "/workspace/logs/settleora-auto-runner/reviews/strong.json",
        completedAt: new Date().toISOString(),
      },
      codex: {
        reviewedHead: sha("a"),
        baseSha: sha("e"),
        changedFiles,
        changedFilesDigest: digest,
        verdict: { verdict: "approve" },
        completedAt: new Date().toISOString(),
      },
    },
    codexMechanicsReviewApproved: true,
    baseSha: sha("e"),
    expectedOriginMainSha: sha("e"),
    requiredChecks: [
      check("Validate scaffold"),
      check("CodeQL"),
      check("Semgrep CE scan"),
      check("Trivy repository scan"),
    ],
    issueLinkageEvidence: { available: true, linked: true, matchedSources: ["stack-plan"] },
  };
  const config = {
    ...fixture.config,
    dryRun: true,
    allowAutoMerge: true,
    autoMergePolicy: { approvedLanes: ["workflow-docs-tooling"] },
  };
  const adapter = createProductionPrStackAdapter(config, { runner: fakeRunner });
  const result = await adapter.mergePr({ config, state, pr: fixture.plan.orderedPrs[0], expectedHead: sha("a") });
  assert.equal(result.ok, true);
  assert.equal(result.result.result, "dry_run_eligible");
});

test("production own-delta adapter recomputes the current PR patch", async () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, repoRoot: fixture.root };
  const patch = [
    "diff --git a/tools/auto-runner/919.mjs b/tools/auto-runner/919.mjs",
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    "+++ b/tools/auto-runner/919.mjs",
    "@@ -0,0 +1 @@",
    "+export const value = 1;",
    "",
  ].join("\n");
  const adapter = createProductionPrStackAdapter(config, {
    runner: (_command, args) => {
      if (args.includes("--name-only")) return { status: 0, stdout: "tools/auto-runner/919.mjs\n", stderr: "", error: null };
      if (args.includes("--patch")) return { status: 0, stdout: patch, stderr: "", error: null };
      if (args.includes("patch-id")) return { status: 0, stdout: `${sha("d")} 0000\n`, stderr: "", error: null };
      if (args.includes("apply")) return { status: 0, stdout: "", stderr: "", error: null };
      return fakeRunner();
    },
  });
  const result = await adapter.proveSemanticOwnDelta({ pr: fixture.plan.orderedPrs[0] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.after.fileSet, ["tools/auto-runner/919.mjs"]);
  assert.ok(result.after.stablePatchId);
  assert.notEqual(result.after.normalizedPatchDigest, fixture.plan.orderedPrs[0].ownDelta.normalizedPatchDigest);
});

test("production own-delta adapter fails without patch-to-tree proof", async () => {
  const fixture = stackFixture();
  const adapter = createProductionPrStackAdapter({ ...fixture.config, repoRoot: fixture.root }, {
    runner: (_command, args) => {
      if (args.includes("--name-only")) return { status: 0, stdout: "tools/auto-runner/919.mjs\n", stderr: "", error: null };
      if (args.includes("--patch")) return { status: 0, stdout: "diff --git a/tools/auto-runner/919.mjs b/tools/auto-runner/919.mjs\n", stderr: "", error: null };
      if (args.includes("patch-id")) return { status: 0, stdout: `${sha("d")} 0000\n`, stderr: "", error: null };
      if (args.includes("apply")) return { status: args.includes("--reverse") ? 1 : 0, stdout: "", stderr: "no reverse", error: null };
      return fakeRunner();
    },
  });
  const proofInput = await adapter.proveSemanticOwnDelta({ pr: fixture.plan.orderedPrs[0] });
  assert.equal(proofInput.ok, true);
  const childFixture = stackFixtureAtChild({ retargeted: true });
  const result = await runPrStackExecution(childFixture.config, { stackPlanPath: childFixture.planPath }, {
    adapter: { proveSemanticOwnDelta: async ({ pr }) => ({ ok: true, before: pr.ownDelta, after: proofInput.after }) },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "semantic_own_delta_failed");
});

test("current-main proof fetches origin main and verifies parent merge ancestry", async () => {
  const fixture = stackFixtureAtChild();
  const state = JSON.parse(readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8"));
  const calls = [];
  const adapter = createProductionPrStackAdapter(fixture.config, {
    runner: (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (args[0] === "fetch") return fakeRunner();
      if (args[0] === "rev-parse") return { status: 0, stdout: `${sha("e")}\n`, stderr: "", error: null };
      if (args[0] === "merge-base") return fakeRunner();
      return fakeRunner();
    },
  });
  const proof = await adapter.fetchCurrentMain({ config: fixture.config, state, pr: fixture.plan.orderedPrs[0] });
  assert.equal(proof.ok, true);
  assert.equal(proof.currentMain, sha("e"));
  assert.ok(calls.includes("git fetch origin main"));
  assert.ok(calls.includes(`git merge-base --is-ancestor ${sha("e")} origin/main`));
});

test("current-main proof blocks when origin main advances after prior proof", async () => {
  const fixture = stackFixtureAtChild();
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.evidence.currentMainProof["919"] = { ok: true, currentMain: sha("d") };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const adapter = createProductionPrStackAdapter(fixture.config, {
    runner: (_command, args) => {
      if (args[0] === "fetch") return fakeRunner();
      if (args[0] === "rev-parse") return { status: 0, stdout: `${sha("e")}\n`, stderr: "", error: null };
      if (args[0] === "merge-base") return fakeRunner();
      return fakeRunner();
    },
  });
  const proof = await adapter.fetchCurrentMain({ config: fixture.config, state, pr: fixture.plan.orderedPrs[0] });
  assert.equal(proof.ok, false);
  assert.equal(proof.reasonCode, "current_main_changed_requires_refresh");
});

test("production retarget reads fresh PR proof before mutation and readback after mutation", async () => {
  const fixture = stackFixtureAtChild();
  const calls = [];
  const adapter = createProductionPrStackAdapter(fixture.config, {
    runner: (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (args[0] === "pr" && args[1] === "view") {
        const base = calls.some((call) => call.includes("pr edit")) ? "main" : "feature/auto-913-parent";
        return { status: 0, stdout: JSON.stringify({ number: 920, state: "OPEN", isDraft: true, baseRefName: base, headRefName: "feature/auto-913-child", headRefOid: sha("b") }), stderr: "", error: null };
      }
      if (args[0] === "pr" && args[1] === "edit") return fakeRunner();
      return fakeRunner();
    },
  });
  const result = await adapter.retargetPrBase({ pr: fixture.plan.orderedPrs[1], newBase: "main", expectedHead: sha("b"), expectedCurrentBase: "feature/auto-913-parent" });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    "gh pr view 920 --repo tommytang213/Settleora --json number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository",
    "gh pr edit 920 --repo tommytang213/Settleora --base main",
    "gh pr view 920 --repo tommytang213/Settleora --json number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository",
  ]);
});

test("production retarget blocks stale proof before mutation", async () => {
  const fixture = stackFixtureAtChild();
  let edits = 0;
  const adapter = createProductionPrStackAdapter(fixture.config, {
    runner: (_command, args) => {
      if (args[0] === "pr" && args[1] === "view") {
        return { status: 0, stdout: JSON.stringify({ number: 920, state: "OPEN", isDraft: true, baseRefName: "feature/auto-913-parent", headRefName: "feature/auto-913-child", headRefOid: sha("z") }), stderr: "", error: null };
      }
      if (args[0] === "pr" && args[1] === "edit") edits += 1;
      return fakeRunner();
    },
  });
  const result = await adapter.retargetPrBase({ pr: fixture.plan.orderedPrs[1], newBase: "main", expectedHead: sha("b"), expectedCurrentBase: "feature/auto-913-parent" });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "retarget_pr_head_stale");
  assert.equal(edits, 0);
});

test("retarget post-readback updates ordered PR base and restart consumes persisted main base", async () => {
  const fixture = stackFixtureAtChild();
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  let retargets = 0;
  let result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      retargetPrBase: async () => {
        retargets += 1;
        return { ok: true, newBase: "main", after: { baseRefName: "main" } };
      },
    },
  });
  assert.equal(result.ok, true);
  let state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.orderedPrs[1].baseRefName, "main");
  assert.equal(state.evidence.retargeted["920"].after.baseRefName, "main");

  const calls = [];
  result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      retargetPrBase: async () => { calls.push("retarget"); return { ok: true }; },
      proveSemanticOwnDelta: async ({ pr }) => {
        calls.push(`own-delta:${pr.baseRefName}`);
        return { ok: true, before: pr.ownDelta, after: { ...pr.ownDelta, reversePatchApplies: true } };
      },
      markReadyForReview: async ({ pr }) => {
        calls.push(`ready:${pr.baseRefName}`);
        return { ok: true, after: { isDraft: false, baseRefName: pr.baseRefName } };
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(retargets, 1);
  assert.deepEqual(calls, ["own-delta:main", "ready:main"]);
  state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.orderedPrs[1].baseRefName, "main");
});

test("durable mutation intents persist before retarget ready and merge mutations", async () => {
  const retargetFixture = stackFixtureAtChild();
  let retargetSawIntent = false;
  let retargetCalls = 0;
  const repoAdapter = (overrides = {}) => ({
    capabilities: { repositoryBoundOperations: true },
    readRepositoryOperationContext: async () => ({ ok: true, worktreePath: retargetFixture.config.repoRoot, originRepositorySlug: "tommytang213/Settleora" }),
    inspectPr: async ({ prNumber }) => ({
      ok: true,
      pr: prNumber === 920
        ? { number: 920, state: "OPEN", isDraft: true, baseRefName: "feature/auto-913-parent", headRefName: "feature/auto-913-child", headRefOid: sha("b"), headRepositorySlug: "tommytang213/Settleora", baseRepositorySlug: "tommytang213/Settleora", isCrossRepository: false }
        : { number: 919, state: "OPEN", isDraft: false, baseRefName: "main", headRefName: "feature/auto-913-parent", headRefOid: sha("a"), headRepositorySlug: "tommytang213/Settleora", baseRepositorySlug: "tommytang213/Settleora", isCrossRepository: false },
      headRefOid: prNumber === 920 ? sha("b") : sha("a"),
    }),
    ...overrides,
  });
  const retarget = await runPrStackExecution(retargetFixture.config, { stackPlanPath: retargetFixture.planPath }, {
    adapter: repoAdapter({
      retargetPrBase: async () => {
        retargetCalls += 1;
        retargetSawIntent = readdirSync(path.join(retargetFixture.config.logsRoot, "stack-operation-intents")).some((name) => name.endsWith(".json"));
        return { ok: true, after: { baseRefName: "main" } };
      },
    }),
  });
  assert.equal(retarget.ok, true, retarget.reasonCode);
  assert.equal(retargetCalls, 1);
  assert.equal(retargetSawIntent, true);

  const readyFixture = stackFixtureAtChild({ retargeted: true });
  persistReadyBaseRebound(readyFixture);
  let readySawIntent = false;
  const ready = await runPrStackExecution(readyFixture.config, { stackPlanPath: readyFixture.planPath }, {
    adapter: {
      capabilities: { repositoryBoundOperations: true },
      readRepositoryOperationContext: async () => ({ ok: true, worktreePath: readyFixture.config.repoRoot, originRepositorySlug: "tommytang213/Settleora" }),
      inspectPr: async () => ({ ok: true, pr: { number: 920, state: "OPEN", isDraft: true, baseRefName: "main", headRefName: "feature/auto-913-child", headRefOid: sha("b"), headRepositorySlug: "tommytang213/Settleora", baseRepositorySlug: "tommytang213/Settleora", isCrossRepository: false }, headRefOid: sha("b") }),
      proveSemanticOwnDelta: async ({ pr }) => ({ ok: true, before: pr.ownDelta, after: { ...pr.ownDelta, reversePatchApplies: true } }),
      markReadyForReview: async () => {
        readySawIntent = readdirSync(path.join(readyFixture.config.logsRoot, "stack-operation-intents")).some((name) => name.endsWith(".json"));
        return { ok: true, after: { isDraft: false } };
      },
    },
  });
  assert.equal(ready.ok, true, ready.reasonCode);
  assert.equal(readySawIntent, true);

  const mergeFixture = stackFixture();
  const mergeStatePath = path.join(path.dirname(mergeFixture.planPath), "stack-state.json");
  const mergeState = createInitialPrStackState({ plan: mergeFixture.plan });
  mergeState.evidence.reviewConverged["919"] = { ok: true };
  mergeState.evidence.gatesPassed["919"] = gateEvidence();
  writePrStackState(mergeStatePath, mergeState);
  let mergeSawIntent = false;
  const merged = await runPrStackExecution(mergeFixture.config, { stackPlanPath: mergeFixture.planPath }, {
    adapter: {
      capabilities: { repositoryBoundOperations: true },
      readRepositoryOperationContext: async () => ({ ok: true, worktreePath: mergeFixture.config.repoRoot, originRepositorySlug: "tommytang213/Settleora" }),
      inspectPr: async () => ({ ok: true, pr: { number: 919, state: "OPEN", isDraft: false, baseRefName: "main", headRefName: "feature/auto-913-parent", headRefOid: sha("a"), headRepositorySlug: "tommytang213/Settleora", baseRepositorySlug: "tommytang213/Settleora", isCrossRepository: false }, headRefOid: sha("a") }),
      mergePr: async () => {
        mergeSawIntent = readdirSync(path.join(mergeFixture.config.logsRoot, "stack-operation-intents")).some((name) => name.endsWith(".json"));
        return { ok: true, mergeSha: sha("m") };
      },
    },
  });
  assert.equal(merged.ok, true);
  assert.equal(mergeSawIntent, true);
});

test("completed retarget ready and merge operations recover without duplicate mutation or source-cycle count", async () => {
  const retargetFixture = stackFixtureAtChild();
  let retargetCalls = 0;
  const retarget = await runPrStackExecution(retargetFixture.config, { stackPlanPath: retargetFixture.planPath }, {
    adapter: {
      capabilities: { repositoryBoundOperations: true },
      readRepositoryOperationContext: async () => ({ ok: true, worktreePath: retargetFixture.config.repoRoot, originRepositorySlug: "tommytang213/Settleora" }),
      inspectPr: async () => ({ ok: true, pr: { number: 920, state: "OPEN", isDraft: true, baseRefName: "main", headRefName: "feature/auto-913-child", headRefOid: sha("b"), headRepositorySlug: "tommytang213/Settleora", baseRepositorySlug: "tommytang213/Settleora", isCrossRepository: false }, headRefOid: sha("b") }),
      retargetPrBase: async () => { retargetCalls += 1; return { ok: true }; },
    },
  });
  assert.equal(retarget.ok, true, retarget.reasonCode);
  assert.equal(retargetCalls, 0);
  let state = JSON.parse(readFileSync(path.join(path.dirname(retargetFixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.sourceCycles["920"], 0);
  assert.equal(state.evidence.retargeted["920"].newBase, "main");

  const readyFixture = stackFixtureAtChild({ retargeted: true });
  persistReadyBaseRebound(readyFixture);
  let readyCalls = 0;
  const ready = await runPrStackExecution(readyFixture.config, { stackPlanPath: readyFixture.planPath }, {
    adapter: {
      capabilities: { repositoryBoundOperations: true },
      readRepositoryOperationContext: async () => ({ ok: true, worktreePath: readyFixture.config.repoRoot, originRepositorySlug: "tommytang213/Settleora" }),
      inspectPr: async () => ({ ok: true, pr: { number: 920, state: "OPEN", isDraft: false, baseRefName: "main", headRefName: "feature/auto-913-child", headRefOid: sha("b"), headRepositorySlug: "tommytang213/Settleora", baseRepositorySlug: "tommytang213/Settleora", isCrossRepository: false }, headRefOid: sha("b") }),
      proveSemanticOwnDelta: async ({ pr }) => ({ ok: true, before: pr.ownDelta, after: { ...pr.ownDelta, reversePatchApplies: true } }),
      markReadyForReview: async () => { readyCalls += 1; return { ok: true }; },
    },
  });
  assert.equal(ready.ok, true, ready.reasonCode);
  assert.equal(readyCalls, 0);
  state = JSON.parse(readFileSync(path.join(path.dirname(readyFixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.sourceCycles["920"], 0);
  assert.equal(state.evidence.ready["920"].after.isDraft, false);

  const mergeFixture = stackFixture();
  const mergeStatePath = path.join(path.dirname(mergeFixture.planPath), "stack-state.json");
  const mergeState = createInitialPrStackState({ plan: mergeFixture.plan });
  mergeState.evidence.reviewConverged["919"] = { ok: true };
  mergeState.evidence.gatesPassed["919"] = gateEvidence();
  writePrStackState(mergeStatePath, mergeState);
  let mergeCalls = 0;
  const merged = await runPrStackExecution(mergeFixture.config, { stackPlanPath: mergeFixture.planPath }, {
    adapter: {
      capabilities: { repositoryBoundOperations: true },
      readRepositoryOperationContext: async () => ({ ok: true, worktreePath: mergeFixture.config.repoRoot, originRepositorySlug: "tommytang213/Settleora" }),
      inspectPr: async () => ({ ok: true, pr: { number: 919, state: "MERGED", isDraft: false, baseRefName: "main", headRefName: "feature/auto-913-parent", headRefOid: sha("a"), headRepositorySlug: "tommytang213/Settleora", baseRepositorySlug: "tommytang213/Settleora", isCrossRepository: false, mergeCommitOid: sha("m"), mergedAt: "2026-07-18T00:00:00Z" }, headRefOid: sha("a") }),
      proveMergedPr: async () => ({ ok: true, merged: true, mergeSha: sha("m"), sourceHeadSha: sha("a") }),
      mergePr: async () => { mergeCalls += 1; return { ok: true }; },
    },
  });
  assert.equal(merged.ok, true);
  assert.equal(mergeCalls, 0);
  state = JSON.parse(readFileSync(mergeStatePath, "utf8"));
  assert.equal(state.sourceCycles["919"], 0);
  assert.equal(state.evidence.merged["919"].mergeSha, sha("m"));
});

test("production final gates collect real evidence and wait on pending checks or scanners", async () => {
  const fixture = stackFixture();
  const adapter = createProductionPrStackAdapter({ ...fixture.config, dryRun: true }, {
    runner: (_command, args) => {
      if (_command === "gh" && args.includes("--name-only")) return { status: 0, stdout: "tools/auto-runner/919.mjs\n", stderr: "", error: null };
      if (_command === "gh" && args.includes("--patch")) return { status: 0, stdout: "diff --git a/tools/auto-runner/919.mjs b/tools/auto-runner/919.mjs\n", stderr: "", error: null };
      if (args.includes("patch-id")) return { status: 0, stdout: `${sha("d")} 0000\n`, stderr: "", error: null };
      if (args.includes("apply")) return fakeRunner(_command, args);
      if (args[0] === "rev-parse" && args[1] === "--verify") return { status: 1, stdout: "", stderr: "", error: null };
      if (args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: `${sha("a")}\n`, stderr: "", error: null };
      if (args[0] === "rev-parse") return { status: 0, stdout: `${sha("e")}\n`, stderr: "", error: null };
      if (args[0] === "diff") return { status: 0, stdout: "", stderr: "", error: null };
      if (args[0] === "status") return fakeRunner(_command, args);
      return fakeRunner(_command, args);
    },
  });
  const gateState = createInitialPrStackState({ plan: fixture.plan });
  gateState.evidence.gatesPassed["919"] = gateEvidence({ changedFiles: ["tools/auto-runner/919.mjs"] });
  const result = await adapter.completeFinalGates({ config: { ...fixture.config, dryRun: true }, state: gateState, pr: { ...fixture.plan.orderedPrs[0], issue: autoRunnerIssue() } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.changedFiles, ["tools/auto-runner/919.mjs"]);

  const waitFixture = stackFixture();
  const waitStatePath = path.join(path.dirname(waitFixture.planPath), "stack-state.json");
  const waitState = createInitialPrStackState({ plan: waitFixture.plan });
  waitState.evidence.reviewConverged["919"] = { ok: true };
  writePrStackState(waitStatePath, waitState);
  const waiting = await runPrStackExecution(waitFixture.config, { stackPlanPath: waitFixture.planPath }, {
    adapter: { completeFinalGates: async () => ({ ok: false, waiting: true, reasonCode: "scanner_result_wait" }) },
  });
  assert.equal(waiting.outcome, "waiting");
  assert.equal(waiting.reasonCode, "scanner_result_wait");
});

test("production final gates run exact-head validation and reviews when convergence had no source change", async () => {
  const fixture = stackFixture();
  const changedFiles = ["tools/auto-runner/919.mjs"];
  const digest = digestStrings(changedFiles);
  const calls = [];
  const adapter = createProductionPrStackAdapter({ ...fixture.config, dryRun: true }, {
    runner: finalGateRunner(changedFiles),
    runValidationPlan: (_config, plan) => {
      calls.push(`validation:${plan.profile}`);
      return { passed: true, results: [{ command: "test", status: 0 }], completedAt: "2026-07-18T00:00:00.000Z", profile: plan.profile };
    },
    runStrongReview: async ({ headSha, baseSha, changedFiles: files, validation }) => {
      calls.push("strong");
      assert.equal(validation.headSha, sha("a"));
      return { status: "pass", tier: "strong_independent", verdict: "pass", reviewedHead: headSha, baseSha, changedFiles: files, changedFilesDigest: digest, independent: true, provider: "gemini", providerProfile: "gemini-strong", evidencePath: "/workspace/logs/strong.json", completedAt: "2026-07-18T00:00:01.000Z" };
    },
    runCodexReview: async ({ headSha, baseSha, changedFiles: files, externalReview }) => {
      calls.push("codex");
      assert.equal(externalReview.reviewedHead, sha("a"));
      return { reviewedHead: headSha, baseSha, changedFiles: files, changedFilesDigest: digest, verdict: { verdict: "approve" }, evidencePath: "/workspace/logs/compact.json", completedAt: "2026-07-18T00:00:02.000Z" };
    },
  });
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.reviewConverged["919"] = { ok: true, headRefOid: sha("a"), findings: [] };
  const result = await adapter.completeFinalGates({ config: { ...fixture.config, dryRun: true }, state, pr: { ...fixture.plan.orderedPrs[0], issue: autoRunnerIssue() } });
  assert.equal(result.ok, true, result.reasonCode);
  assert.deepEqual(calls, ["validation:runner-tests", "strong", "codex"]);
  assert.equal(result.validation.headSha, sha("a"));
  assert.equal(result.strongReview.reviewedHead, sha("a"));
  assert.equal(result.codexReview.reviewedHead, sha("a"));
});

test("production final gates fail closed when exact-head review adapters or bound evidence are missing", async () => {
  const fixture = stackFixture();
  const changedFiles = ["tools/auto-runner/919.mjs"];
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.reviewConverged["919"] = { ok: true, headRefOid: sha("a"), findings: [] };

  const unconfigured = createProductionPrStackAdapter({ ...fixture.config, dryRun: true }, {
    runner: finalGateRunner(changedFiles),
  });
  const missing = await unconfigured.completeFinalGates({ config: { ...fixture.config, dryRun: true }, state, pr: { ...fixture.plan.orderedPrs[0], issue: autoRunnerIssue() } });
  assert.equal(missing.ok, false);
  assert.equal(missing.reasonCode, "exact_head_review_adapter_unconfigured");

  const staleCodex = createProductionPrStackAdapter({ ...fixture.config, dryRun: true }, {
    runner: finalGateRunner(changedFiles),
    runValidationPlan: (_config, plan) => ({ passed: true, results: [{ command: "test", status: 0 }], completedAt: "2026-07-18T00:00:00.000Z", profile: plan.profile }),
    runStrongReview: async ({ headSha, baseSha, changedFiles: files }) => ({ status: "pass", tier: "strong_independent", verdict: "pass", reviewedHead: headSha, baseSha, changedFiles: files, changedFilesDigest: digestStrings(files), independent: true, provider: "gemini", providerProfile: "gemini-strong", evidencePath: "/workspace/logs/strong.json", completedAt: "2026-07-18T00:00:01.000Z" }),
    runCodexReview: async ({ baseSha, changedFiles: files }) => ({ reviewedHead: sha("b"), baseSha, changedFiles: files, changedFilesDigest: digestStrings(files), verdict: { verdict: "approve" }, evidencePath: "/workspace/logs/compact.json", completedAt: "2026-07-18T00:00:02.000Z" }),
  });
  const stale = await staleCodex.completeFinalGates({ config: { ...fixture.config, dryRun: true }, state, pr: { ...fixture.plan.orderedPrs[0], issue: autoRunnerIssue() } });
  assert.equal(stale.ok, false);
  assert.equal(stale.reasonCode, "codex_review_head_mismatch");
});

test("final gates prove changed files against the real lane contract and reject out-of-contract paths", async () => {
  const fixture = stackFixture();
  const adapter = createProductionPrStackAdapter({ ...fixture.config, dryRun: true }, {
    runner: (_command, args) => {
      if (_command === "gh" && args.includes("--name-only")) return { status: 0, stdout: "tools/auto-runner/919.mjs\n", stderr: "", error: null };
      if (_command === "gh" && args.includes("--patch")) return { status: 0, stdout: "diff --git a/tools/auto-runner/919.mjs b/tools/auto-runner/919.mjs\n", stderr: "", error: null };
      if (args.includes("patch-id")) return { status: 0, stdout: `${sha("d")} 0000\n`, stderr: "", error: null };
      if (args.includes("apply")) return fakeRunner(_command, args);
      if (args[0] === "rev-parse" && args[1] === "--verify") return { status: 1, stdout: "", stderr: "", error: null };
      if (args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: `${sha("a")}\n`, stderr: "", error: null };
      if (args[0] === "rev-parse") return { status: 0, stdout: `${sha("e")}\n`, stderr: "", error: null };
      if (args[0] === "diff") return { status: 0, stdout: "", stderr: "", error: null };
      if (args[0] === "status") return fakeRunner(_command, args);
      return fakeRunner(_command, args);
    },
  });
  const okState = createInitialPrStackState({ plan: fixture.plan });
  okState.evidence.gatesPassed["919"] = gateEvidence({ changedFiles: ["tools/auto-runner/919.mjs"] });
  const ok = await adapter.completeFinalGates({ config: { ...fixture.config, dryRun: true }, state: okState, pr: { ...fixture.plan.orderedPrs[0], issue: autoRunnerIssue() } });
  assert.equal(ok.ok, true, ok.reasonCode);
  assert.equal(ok.changedFilesExactlyMatchAllowedPaths, true);
  assert.deepEqual(ok.allowedPathProof.changedFiles, ["tools/auto-runner/919.mjs"]);
  assert.deepEqual(ok.allowedPathProof.rejectedPaths, []);

  const blockedConfig = {
    ...fixture.config,
    dryRun: true,
    prStackIssue: autoRunnerIssue(["docs/workflow/**"]),
  };
  const blockedAdapter = createProductionPrStackAdapter(blockedConfig, {
    runner: (_command, args) => {
      if (_command === "gh" && args.includes("--name-only")) return { status: 0, stdout: "tools/auto-runner/919.mjs\n", stderr: "", error: null };
      if (_command === "gh" && args.includes("--patch")) return { status: 0, stdout: "diff --git a/tools/auto-runner/919.mjs b/tools/auto-runner/919.mjs\n", stderr: "", error: null };
      if (args.includes("patch-id")) return { status: 0, stdout: `${sha("d")} 0000\n`, stderr: "", error: null };
      if (args.includes("apply")) return fakeRunner(_command, args);
      if (args[0] === "rev-parse" && args[1] === "--verify") return { status: 1, stdout: "", stderr: "", error: null };
      if (args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: `${sha("a")}\n`, stderr: "", error: null };
      if (args[0] === "rev-parse") return { status: 0, stdout: `${sha("e")}\n`, stderr: "", error: null };
      if (args[0] === "diff") return { status: 0, stdout: "", stderr: "", error: null };
      if (args[0] === "status") return fakeRunner(_command, args);
      return fakeRunner(_command, args);
    },
  });
  const blockedState = createInitialPrStackState({ plan: fixture.plan });
  blockedState.evidence.gatesPassed["919"] = gateEvidence({ changedFiles: ["tools/auto-runner/919.mjs"] });
  const blocked = await blockedAdapter.completeFinalGates({ config: blockedConfig, state: blockedState, pr: { ...fixture.plan.orderedPrs[0], issue: autoRunnerIssue(["docs/workflow/**"]) } });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reasonCode, "changed_files_do_not_match_allowed_paths");
});

test("merge consumes the exact-head allowed-path proof and invalidates stale head or file-set changes", async () => {
  const fixture = stackFixture();
  const changedFiles = ["tools/auto-runner/lib/pr-stack-executor.mjs"];
  const digest = digestStrings(changedFiles);
  const baseGate = {
    ok: true,
    changedFiles,
    changedFilesExactlyMatchAllowedPaths: true,
    allowedPathProof: {
      ok: true,
      exactHead: sha("a"),
      changedFiles,
      changedFilesDigest: digestJson(changedFiles),
      rejectedPaths: [],
      changedFilesExactlyMatchAllowedPaths: true,
    },
    laneDecision: {
      lane: "workflow-docs-tooling",
      canonicalLane: "workflow-docs-tooling",
      branchStrategy: "normal",
      validationProfile: "runner-tests",
      reviewerTier: "strong_independent",
      allowedToImplement: true,
      autoMergeEligible: true,
      manualMergeRequired: false,
      contract: { autoMergeEligible: true, manualMergeRequired: false },
      laneManifest: { decisionType: "runnable", autoMergeAllowed: true },
      allowedPaths: ["tools/auto-runner/**"],
    },
    validation: { passed: true, results: [{ command: "test", status: 0 }], completedAt: new Date().toISOString(), headSha: sha("a"), baseSha: sha("e"), changedFiles, changedFilesDigest: digest, profile: "runner-tests" },
    externalReview: { status: "pass", tier: "strong_independent", verdict: "pass", reviewedHead: sha("a"), baseSha: sha("e"), changedFiles, changedFilesDigest: digest, independent: true, provider: "gemini", providerProfile: "gemini-strong", evidencePath: "/workspace/logs/settleora-auto-runner/reviews/strong.json", completedAt: new Date().toISOString() },
    review: { reviewedHead: sha("a"), baseSha: sha("e"), changedFiles, changedFilesDigest: digest, verdict: { verdict: "approve" }, completedAt: new Date().toISOString() },
    codexMechanicsReviewApproved: true,
    baseSha: sha("e"),
    expectedOriginMainSha: sha("e"),
    requiredChecks: [check("Validate scaffold"), check("CodeQL"), check("Semgrep CE scan"), check("Trivy repository scan")],
    issueLinkageEvidence: { available: true, linked: true, matchedSources: ["stack-plan"] },
  };
  const config = { ...fixture.config, dryRun: true, allowAutoMerge: true, autoMergePolicy: { approvedLanes: ["workflow-docs-tooling"] } };
  const adapter = createProductionPrStackAdapter(config, { runner: fakeRunner });
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.gatesPassed["919"] = baseGate;
  assert.equal((await adapter.mergePr({ config, state, pr: fixture.plan.orderedPrs[0], expectedHead: sha("a") })).ok, true);

  state.evidence.gatesPassed["919"] = { ...baseGate, allowedPathProof: { ...baseGate.allowedPathProof, exactHead: sha("b") } };
  const staleHead = await adapter.mergePr({ config, state, pr: fixture.plan.orderedPrs[0], expectedHead: sha("a") });
  assert.equal(staleHead.ok, false);
  assert.equal(staleHead.reasonCode, "changed_files_do_not_match_allowed_paths");

  state.evidence.gatesPassed["919"] = { ...baseGate, allowedPathProof: { ...baseGate.allowedPathProof, changedFiles: ["docs/workflow/x.md"], changedFilesDigest: digestJson(["docs/workflow/x.md"]) } };
  const staleFiles = await adapter.mergePr({ config, state, pr: fixture.plan.orderedPrs[0], expectedHead: sha("a") });
  assert.equal(staleFiles.ok, false);
  assert.equal(staleFiles.reasonCode, "changed_files_do_not_match_allowed_paths");
});

test("head, base, digest mismatch, and partial final-gate review evidence block merge", async () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, dryRun: true, allowAutoMerge: true, autoMergePolicy: { approvedLanes: ["workflow-docs-tooling"] } };
  const adapter = createProductionPrStackAdapter(config, { runner: fakeRunner });
  const state = createInitialPrStackState({ plan: fixture.plan });

  state.evidence.gatesPassed["919"] = gateEvidence({ strongReview: { reviewedHead: sha("b") } });
  assert.equal((await adapter.mergePr({ config, state, pr: fixture.plan.orderedPrs[0], expectedHead: sha("a") })).reasonCode, "strong_review_head_mismatch");

  state.evidence.gatesPassed["919"] = gateEvidence({ codexReview: { baseSha: sha("f") } });
  assert.equal((await adapter.mergePr({ config, state, pr: fixture.plan.orderedPrs[0], expectedHead: sha("a") })).reasonCode, "codex_review_base_mismatch");

  state.evidence.gatesPassed["919"] = gateEvidence({ strongReview: { changedFilesDigest: digestStrings(["other.mjs"]) } });
  assert.equal((await adapter.mergePr({ config, state, pr: fixture.plan.orderedPrs[0], expectedHead: sha("a") })).reasonCode, "strong_review_file_digest_mismatch");

  const partial = gateEvidence();
  delete partial.reviewEvidence.codex;
  delete partial.review;
  delete partial.codexReview;
  state.evidence.gatesPassed["919"] = partial;
  assert.equal((await adapter.mergePr({ config, state, pr: fixture.plan.orderedPrs[0], expectedHead: sha("a") })).reasonCode, "codex_review_missing");
});

test("strong final gate rejects cheap, stale, malformed, self, and Codex independent evidence", async () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, dryRun: true, allowAutoMerge: true, autoMergePolicy: { approvedLanes: ["workflow-docs-tooling"] } };
  const adapter = createProductionPrStackAdapter(config, { runner: fakeRunner });
  const state = createInitialPrStackState({ plan: fixture.plan });
  const check = async (strongReview, reasonCode) => {
    state.evidence.gatesPassed["919"] = gateEvidence({ strongReview });
    const result = await adapter.mergePr({ config, state, pr: fixture.plan.orderedPrs[0], expectedHead: sha("a") });
    assert.equal(result.reasonCode, reasonCode);
  };
  await check({ tier: "cheap_independent" }, "strong_review_tier_unapproved");
  await check({ provider: "codex" }, "strong_review_provider_not_independent");
  await check({ selfReview: true }, "strong_review_not_strong_independent_pass");
  await check({ status: "blocked" }, "strong_review_not_strong_independent_pass");
  await check({ changedFiles: ["other.mjs"] }, "strong_review_files_mismatch");
});

test("mandatory check evidence waits on empty partial and pending rollups and blocks failures", () => {
  assert.equal(finalExternalGateStatus({ requiredChecks: [] }).reasonCode, "ci_check_completion_wait");
  assert.equal(finalExternalGateStatus({ requiredChecks: [check("Validate scaffold")] }).reasonCode, "ci_check_completion_wait");
  assert.equal(finalExternalGateStatus({ requiredChecks: [
    check("Validate scaffold"),
    { ...check("CodeQL"), status: "IN_PROGRESS", conclusion: null },
    check("Semgrep CE scan"),
    check("Trivy repository scan"),
  ] }).reasonCode, "ci_check_completion_wait");
  assert.equal(finalExternalGateStatus({ requiredChecks: [
    check("Validate scaffold"),
    { ...check("CodeQL"), conclusion: "FAILURE" },
    check("Semgrep CE scan"),
    check("Trivy repository scan"),
  ] }).reasonCode, "required_check_failed");
  assert.equal(finalExternalGateStatus({ requiredChecks: [
    check("Validate scaffold"),
    check("CodeQL"),
    check("Semgrep CE scan"),
    check("Trivy repository scan"),
  ] }).ok, true);
});

test("merge reads actual clean worktree state and dirty or unreadable status blocks", async () => {
  const fixture = stackFixture();
  const config = { ...fixture.config, dryRun: true, allowAutoMerge: true, autoMergePolicy: { approvedLanes: ["workflow-docs-tooling"] } };
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.gatesPassed["919"] = gateEvidence();
  const run = (runner) => createProductionPrStackAdapter(config, { runner }).mergePr({ config, state, pr: fixture.plan.orderedPrs[0], expectedHead: sha("a") });

  let statusCall = null;
  const clean = await run((command, args, options) => {
    if (command === "git" && args[0] === "status") statusCall = { args, cwd: options.cwd };
    return fakeRunner(command, args, options);
  });
  assert.equal(clean.ok, true);
  assert.deepEqual(statusCall.args, ["status", "--porcelain=v1", "--untracked-files=all"]);
  assert.equal(statusCall.cwd, config.repoRoot);

  for (const dirty of [" M tools/auto-runner/lib/pr-stack-executor.mjs\n", "M  tools/auto-runner/lib/pr-stack-executor.mjs\n", "?? tools/auto-runner/new.mjs\n"]) {
    const result = await run((command, args, options) => {
      if (command === "git" && args[0] === "status") return { status: 0, stdout: dirty, stderr: "", error: null };
      return fakeRunner(command, args, options);
    });
    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, "worktree_not_clean");
  }

  const unreadable = await run((command, args, options) => {
    if (command === "git" && args[0] === "status") return { status: 128, stdout: "", stderr: "not a git repository", error: null };
    return fakeRunner(command, args, options);
  });
  assert.equal(unreadable.ok, false);
  assert.equal(unreadable.reasonCode, "merge_worktree_status_unreadable");

  const wrongHead = await run((command, args, options) => {
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: `${sha("b")}\n`, stderr: "", error: null };
    return fakeRunner(command, args, options);
  });
  assert.equal(wrongHead.ok, false);
  assert.equal(wrongHead.reasonCode, "merge_worktree_head_mismatch");
});

test("gate wait evidence patches preserve existing maps, are idempotent, and malformed patches fail closed", async () => {
  const fixture = stackFixture();
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.reviewConverged["919"] = { ok: true };
  state.evidence.merged["918"] = { ok: true, merged: true };
  state.evidence.currentMainProof["918"] = { ok: true, currentMain: sha("e") };
  writePrStackState(statePath, state);
  const adapter = {
    completeFinalGates: async () => ({
      ok: false,
      waiting: true,
      reasonCode: "ci_check_completion_wait",
      evidencePatch: { finalGateSnapshots: { 919: { ok: false, exactHead: sha("a"), requiredChecks: [{ name: "Validate scaffold", status: "IN_PROGRESS" }] } } },
    }),
  };
  let result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter });
  assert.equal(result.outcome, "waiting");
  let persisted = JSON.parse(readFileSync(statePath, "utf8"));
  assert.deepEqual(persisted.evidence.reviewConverged["919"], { ok: true });
  assert.equal(persisted.evidence.merged["918"].merged, true);
  assert.equal(persisted.evidence.currentMainProof["918"].currentMain, sha("e"));
  assert.equal(persisted.evidence.finalGateSnapshots["919"].requiredChecks[0].status, "IN_PROGRESS");
  assert.equal(persisted.sourceCycles["919"], 0);

  result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter });
  assert.equal(result.outcome, "waiting");
  persisted = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(Object.keys(persisted.evidence.reviewConverged).length, 1);
  assert.equal(persisted.evidence.finalGateSnapshots["919"].requiredChecks[0].status, "IN_PROGRESS");

  const badFixture = stackFixture();
  const badStatePath = path.join(path.dirname(badFixture.planPath), "stack-state.json");
  const badState = createInitialPrStackState({ plan: badFixture.plan });
  badState.evidence.reviewConverged["919"] = { ok: true };
  writePrStackState(badStatePath, badState);
  const bad = await runPrStackExecution(badFixture.config, { stackPlanPath: badFixture.planPath }, {
    adapter: { completeFinalGates: async () => ({ ok: false, waiting: true, reasonCode: "ci_check_completion_wait", evidencePatch: { gatesPassed: ["bad"] } }) },
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.reasonCode, "stack_evidence_patch_invalid");
  const badPersisted = JSON.parse(readFileSync(badStatePath, "utf8"));
  assert.equal(badPersisted.currentPhase, "blocked");
  assert.equal(badPersisted.evidence.gatesPassed["919"], undefined);
});

test("unknown action, stale head, repository mismatch, production profile, and forbidden capabilities block", async () => {
  const fixture = stackFixture();
  assert.equal(loadExecutableStackPlan({ ...fixture.config, repositorySlug: "other/repo" }, fixture.planPath).reasonCode, "stack_repository_mismatch");
  assert.equal(validateExecutableStackPlan({ ...fixture.config, prStackExecution: { ...fixture.config.prStackExecution, productionProfileActive: true } }, fixture.plan).reasonCode, "stack_production_profile_activation_refused");
  const caps = { ...fixture.config.prStackExecution.capabilities, issuePolling: true };
  assert.equal(validateExecutableStackPlan({ ...fixture.config, prStackExecution: { ...fixture.config.prStackExecution, capabilities: caps } }, fixture.plan).reasonCode, "stack_forbidden_capability_enabled:issuePolling");
  const result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      inspectPr: async () => ({ ok: true, headRefOid: sha("c"), findings: [] }),
      convergeExistingPr: async () => ({ ok: true }),
    },
  });
  assert.equal(result.reasonCode, "stack_pr_head_stale");
});

test("secrets and raw provider-looking payloads are redacted from stack state", async () => {
  const fixture = stackFixture();
  await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      inspectPr: async () => ({ ok: true, headRefOid: sha("a"), findings: [] }),
      convergeExistingPr: async () => ({ ok: true, token: "not-a-real-api-key-for-stack-state-test", stdout: "Bearer abc.def" }),
    },
  });
  const text = readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8");
  assert.doesNotMatch(text, /not-a-real-api-key|Bearer abc/);
  assert.match(text, /\[REDACTED\]/);
});

test("resume from blocker state path advances without changing immutable identity", async () => {
  const fixture = stackFixture();
  const blockerPath = path.join(path.dirname(fixture.planPath), "state.json");
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.terminal = { reasonCode: "controller_wiring_missing", reason: "old blocker" };
  writePrStackState(blockerPath, state);
  const config = { ...fixture.config, prStackExecution: { ...fixture.config.prStackExecution, statePath: blockerPath } };
  const result = await runPrStackExecution(config, { stackPlanPath: fixture.planPath }, { adapter: scriptedAdapter([]) });
  assert.equal(result.ok, true);
  const after = JSON.parse(readFileSync(blockerPath, "utf8"));
  assert.equal(after.stackId, state.stackId);
  assert.deepEqual(after.orderedPrs, state.orderedPrs);
  assert.notEqual(after.terminal?.reasonCode, "controller_wiring_missing");
});

test("exact [919, 920] fixture produces complete expected production sequence without live GitHub mutation", async () => {
  const fixture = stackFixture();
  const calls = [];
  const adapter = scriptedAdapter(calls);
  for (let i = 0; i < 13; i += 1) {
    await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter });
  }
  assert.deepEqual(calls, [
    "inspect:919", "converge:919",
    "gates:919",
    "merge:919",
    "current-main:919",
    "retarget:920",
    "own-delta:920", "ready:920",
    "inspect:920", "converge:920",
    "gates:920",
    "merge:920",
    "hygiene",
  ]);
});

test("retarget and ready durable proof survives a source-head change and restart requires fresh own-delta only", async () => {
  const fixture = stackFixtureAtChild({ retargeted: true, ownDelta: true, ready: true });
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  let state = JSON.parse(readFileSync(statePath, "utf8"));
  state.orderedPrs[1].baseRefName = "main";
  state.orderedPrs[1].isDraft = false;
  state.evidence.retargeted["920"] = { ok: true, newBase: "main", after: { baseRefName: "main" } };
  state.evidence.ready["920"] = { ok: true, after: { isDraft: false } };
  state.evidence.gatesPassed["920"] = { ok: true };
  state.evidence.validation = { 920: { ok: true } };
  state.evidence.strongReview = { 920: { ok: true } };
  state.evidence.codexReview = { 920: { ok: true } };
  writePrStackState(statePath, state);

  let result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      inspectPr: async () => ({ ok: true, headRefOid: sha("b"), findings: [] }),
      convergeExistingPr: async () => sourceChangingConvergenceResult({ prNumber: 920, oldHead: sha("b"), newHead: sha("c") }),
    },
  });
  assert.equal(result.ok, true);
  state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.sourceCycles["920"], 1);
  assert.equal(state.exactHeads["920"], sha("c"));
  assert.equal(state.orderedPrs[1].headRefOid, sha("c"));
  assert.equal(state.orderedPrs[1].baseRefName, "main");
  assert.equal(state.orderedPrs[1].isDraft, false);
  assert.equal(state.evidence.retargeted["920"].newBase, "main");
  assert.equal(state.evidence.ready["920"].after.isDraft, false);
  assert.equal(state.evidence.ownDeltaPreserved["920"], undefined);
  assert.equal(state.evidence.gatesPassed["920"], undefined);
  assert.equal(state.evidence.validation["920"].headSha, sha("c"));
  assert.equal(state.evidence.strongReview["920"].reviewedHead, sha("c"));
  assert.equal(state.evidence.codexReview["920"].reviewedHead, sha("c"));

  const calls = [];
  result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      retargetPrBase: async () => { calls.push("retarget"); return { ok: true }; },
      markReadyForReview: async () => { calls.push("ready"); return { ok: true }; },
      proveSemanticOwnDelta: async ({ pr }) => {
        calls.push(`own-delta:${pr.baseRefName}:${pr.isDraft}:${pr.headRefOid}`);
        return { ok: true, before: pr.ownDelta, after: { ...pr.ownDelta, reversePatchApplies: true } };
      },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [`own-delta:main:false:${sha("c")}`]);
});

test("contradictory live base or draft state blocks ready and retarget proof", async () => {
  const fixture = stackFixtureAtChild();
  const adapter = createProductionPrStackAdapter(fixture.config, {
    runner: (_command, args) => {
      if (args[0] === "pr" && args[1] === "view") {
        return { status: 0, stdout: JSON.stringify({ number: 920, state: "OPEN", isDraft: false, baseRefName: "feature/auto-913-parent", headRefName: "feature/auto-913-child", headRefOid: sha("b") }), stderr: "", error: null };
      }
      throw new Error("mutation should not run");
    },
  });
  const retarget = await adapter.retargetPrBase({ pr: fixture.plan.orderedPrs[1], newBase: "main", expectedHead: sha("b"), expectedCurrentBase: "feature/auto-913-parent" });
  assert.equal(retarget.ok, false);
  assert.equal(retarget.reasonCode, "retarget_pr_draft_state_changed");

  const ready = await adapter.markReadyForReview({ pr: { ...fixture.plan.orderedPrs[1], baseRefName: "main" }, expectedHead: sha("b") });
  assert.equal(ready.ok, false);
  assert.equal(ready.reasonCode, "ready_pr_base_stale");
});

test("production ready transition uses injected fixed argv runner with pre-proof and post-readback", async () => {
  const fixture = stackFixtureAtChild({ retargeted: true });
  const calls = [];
  const adapter = createProductionPrStackAdapter(fixture.config, {
    runner: (command, args) => {
      calls.push({ command, args });
      if (args[0] === "pr" && args[1] === "view") {
        const isAfterReady = calls.some((call) => call.args[0] === "pr" && call.args[1] === "ready");
        return { status: 0, stdout: JSON.stringify({ number: 920, state: "OPEN", isDraft: !isAfterReady, baseRefName: "main", headRefName: "feature/auto-913-child", headRefOid: sha("b") }), stderr: "", error: null };
      }
      if (args[0] === "pr" && args[1] === "ready") return fakeRunner();
      throw new Error("unexpected command");
    },
  });
  const result = await adapter.markReadyForReview({ pr: { ...fixture.plan.orderedPrs[1], baseRefName: "main" }, expectedHead: sha("b") });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map((call) => `${call.command} ${call.args.join(" ")}`), [
    "gh pr view 920 --repo tommytang213/Settleora --json number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository",
    "gh pr ready 920 --repo tommytang213/Settleora",
    "gh pr view 920 --repo tommytang213/Settleora --json number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository",
  ]);
});

test("ready transition refuses mutation before fresh identity proof and fake runner makes zero real GitHub calls", async () => {
  const fixture = stackFixtureAtChild({ retargeted: true });
  let readyCalls = 0;
  const adapter = createProductionPrStackAdapter(fixture.config, {
    runner: (_command, args) => {
      if (args[0] === "pr" && args[1] === "view") {
        return { status: 0, stdout: JSON.stringify({ number: 920, state: "OPEN", isDraft: true, baseRefName: "main", headRefName: "feature/auto-913-child", headRefOid: sha("z") }), stderr: "", error: null };
      }
      if (args[0] === "pr" && args[1] === "ready") readyCalls += 1;
      return fakeRunner();
    },
  });
  const result = await adapter.markReadyForReview({ pr: { ...fixture.plan.orderedPrs[1], baseRefName: "main" }, expectedHead: sha("b") });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "ready_pr_head_stale");
  assert.equal(readyCalls, 0);
});

test("full [919, 920] sequence advances across a post-ready source-head change", async () => {
  const fixture = stackFixture();
  const calls = [];
  const adapter = {
    ...scriptedAdapter(calls),
    convergeExistingPr: async ({ pr }) => {
      calls.push(`converge:${pr.number}`);
      return pr.number === 920 ? sourceChangingConvergenceResult({ prNumber: 920, oldHead: sha("b"), newHead: sha("c") }) : { ok: true, headRefOid: pr.headRefOid };
    },
  };
  for (let i = 0; i < 7; i += 1) {
    const result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter });
    assert.equal(result.ok, true, result.reasonCode);
  }
  let state = JSON.parse(readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.exactHeads["920"], sha("c"));
  assert.equal(state.orderedPrs[1].baseRefName, "main");
  assert.equal(state.orderedPrs[1].isDraft, false);
  assert.equal(state.evidence.ownDeltaPreserved["920"], undefined);

  for (let i = 0; i < 4; i += 1) {
    const result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter });
    assert.equal(result.ok, true, result.reasonCode);
  }
  state = JSON.parse(readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.terminal.reasonCode, "stack_complete");
  assert.deepEqual(calls, [
    "inspect:919", "converge:919",
    "gates:919",
    "merge:919",
    "current-main:919",
    "retarget:920",
    "own-delta:920", "ready:920",
    "inspect:920", "converge:920",
    "own-delta:920",
    "gates:920",
    "merge:920",
    "hygiene",
  ]);
});

function stackFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-stack-"));
  const logsRoot = path.join(root, "logs");
  const configPath = path.join(root, "config.json");
  const configJson = {
    repoRoot: process.cwd(),
    logsRoot,
    repositorySlug: "tommytang213/Settleora",
    prStackIssue: autoRunnerIssue(["tools/auto-runner/**"]),
    prStackExecution: {
      enabled: true,
      allowRun: true,
      maxStackSize: 4,
      capabilities: {
        existingPrConvergence: true,
        exactHeadReviewRequest: true,
        ciScannerPolling: true,
        exactHeadMerge: true,
        baseRetarget: true,
        readyTransition: true,
        semanticProof: true,
        finalHygiene: true,
      },
    },
  };
  writeFileSync(configPath, JSON.stringify(configJson), { mode: 0o600 });
  const config = loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", path.join(logsRoot, "stack", "plan.json")]));
  const plan = makePlan();
  const planPath = path.join(logsRoot, "stack", "plan.json");
  mkdirSync(path.dirname(planPath), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(planPath), 0o700);
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  return { root, logsRoot, config, plan, planPath };
}

function autoRunnerIssue(allowedPaths = ["tools/auto-runner/**"]) {
  return {
    number: 921,
    state: "OPEN",
    labels: ["auto-ready"],
    body: [
      "## Auto-runner contract",
      "",
      "```json",
      JSON.stringify({
        contractVersion: 1,
        lane: "workflow-docs-tooling",
        allowedPaths,
        validationProfile: "runner-tests",
        manualMergeRequired: false,
        autoMergeEligible: true,
        requiredReading: ["PROGRAM_ARCHITECTURE.md"],
      }),
      "```",
    ].join("\n"),
  };
}

function stackFixtureAtChild(flags = {}) {
  const fixture = stackFixture();
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.reviewConverged["919"] = { ok: true };
  state.evidence.gatesPassed["919"] = { ok: true };
  state.evidence.merged["919"] = { ok: true, merged: true, mergeSha: sha("e") };
  state.evidence.currentMainProof["919"] = { ok: true, currentMain: sha("e") };
  if (flags.retargeted) state.evidence.retargeted["920"] = { ok: true };
  if (flags.ownDelta) state.evidence.ownDeltaPreserved["920"] = { ok: true };
  if (flags.ready) state.evidence.ready["920"] = { ok: true };
  if (flags.childConverged) state.evidence.reviewConverged["920"] = { ok: true };
  if (flags.childGates) state.evidence.gatesPassed["920"] = { ok: true };
  state.activePrNumber = 920;
  writePrStackState(statePath, state);
  return fixture;
}

function persistReadyBaseRebound(fixture) {
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.evidence.retargeted["920"] = { ok: true, newBase: "main", after: { baseRefName: "main" } };
  state.orderedPrs = state.orderedPrs.map((entry) => entry.number === 920 ? { ...entry, baseRefName: "main" } : entry);
  writePrStackState(statePath, state);
}

function makePlan({ prs } = {}) {
  return createDependentPrStackPlan({
    repository: "tommytang213/Settleora",
    stackId: "live-acceptance-919-920",
    issueNumber: 921,
    prs: prs || [
      pr(919, "main", "feature/auto-913-parent", sha("a"), false),
      pr(920, "feature/auto-913-parent", "feature/auto-913-child", sha("b"), true),
    ],
  });
}

function pr(number, baseRefName, headRefName, headRefOid, isDraft = false) {
  return {
    number,
    title: `PR ${number}`,
    baseRefName,
    headRefName,
    headRefOid,
    isDraft,
    state: "OPEN",
    ownDelta: {
      fileSet: [`tools/auto-runner/${number}.mjs`],
      diffstat: { files: 1 },
      numstat: { added: 1, deleted: 0 },
      stablePatchId: `patch-${number}`,
      normalizedPatch: `diff-${number}`,
      forwardPatchApplies: true,
      reversePatchApplies: true,
    },
  };
}

function check(name) {
  return { name, status: "COMPLETED", conclusion: "SUCCESS" };
}

function gateEvidence({ changedFiles = ["tools/auto-runner/lib/pr-stack-executor.mjs"], strongReview = {}, codexReview = {} } = {}) {
  const digest = digestStrings(changedFiles);
  const worktreeProof = exactWorktreeProof();
  const strongIndependent = {
    status: "pass",
    tier: "strong_independent",
    verdict: "pass",
    reviewedHead: sha("a"),
    baseSha: sha("e"),
    changedFiles,
    changedFilesDigest: digest,
    independent: true,
    provider: "gemini",
    providerProfile: "gemini-strong",
    evidencePath: "/workspace/logs/settleora-auto-runner/reviews/strong.json",
    completedAt: "2026-07-17T00:00:00.000Z",
    ...strongReview,
  };
  const codex = {
    reviewedHead: sha("a"),
    baseSha: sha("e"),
    changedFiles,
    changedFilesDigest: digest,
    verdict: { verdict: "approve" },
    completedAt: "2026-07-17T00:00:01.000Z",
    ...codexReview,
  };
  return {
    ok: true,
    exactHead: sha("a"),
    changedFiles,
    changedFilesDigest: digest,
    changedFilesExactlyMatchAllowedPaths: true,
    allowedPathProof: {
      ok: true,
      exactHead: sha("a"),
      changedFiles,
      changedFilesDigest: digestJson(changedFiles),
      rejectedPaths: [],
      changedFilesExactlyMatchAllowedPaths: true,
    },
    laneDecision: {
      lane: "workflow-docs-tooling",
      canonicalLane: "workflow-docs-tooling",
      branchStrategy: "normal",
      validationProfile: "runner-tests",
      reviewerTier: "strong_independent",
      allowedToImplement: true,
      autoMergeEligible: true,
      manualMergeRequired: false,
      contract: { autoMergeEligible: true, manualMergeRequired: false },
      laneManifest: { decisionType: "runnable", autoMergeAllowed: true },
      allowedPaths: ["tools/auto-runner/**"],
    },
    validation: {
      passed: true,
      results: [{ command: "test", status: 0 }],
      completedAt: "2026-07-17T00:00:02.000Z",
      headSha: sha("a"),
      baseSha: sha("e"),
      changedFiles,
      changedFilesDigest: digest,
      profile: "runner-tests",
      treeSha: worktreeProof.treeSha,
      canonicalWorktreePath: worktreeProof.worktreePath,
      preWorktreeProof: worktreeProof,
      postWorktreeProof: worktreeProof,
      preWorktreeProofDigest: digestJson(worktreeProof),
      postWorktreeProofDigest: digestJson(worktreeProof),
      rawDiffDigest: sha("r"),
      packageDigest: sha("p"),
    },
    reviewEvidence: { strongIndependent, codex },
    strongReview: strongIndependent,
    codexReview: codex,
    externalReview: strongIndependent,
    review: codex,
    codexMechanicsReviewApproved: true,
    baseSha: sha("e"),
    expectedOriginMainSha: sha("e"),
    currentOriginMainSha: sha("e"),
    requiredChecks: [check("Validate scaffold"), check("CodeQL"), check("Semgrep CE scan"), check("Trivy repository scan")],
    issueLinkageEvidence: { available: true, linked: true, matchedSources: ["stack-plan"] },
  };
}

function exactWorktreeProof(overrides = {}) {
  return {
    schemaVersion: 1,
    proofType: "test",
    worktreePath: process.cwd(),
    configuredRepository: "tommytang213/Settleora",
    originRepositorySlug: "tommytang213/Settleora",
    expectedPrNumber: 919,
    expectedHeadBranch: "feature/auto-913-parent",
    branchName: "feature/auto-913-parent",
    detachedHead: false,
    expectedHead: sha("a"),
    actualHead: sha("a"),
    treeSha: sha("e"),
    cleanIndex: true,
    cleanTrackedWorktree: true,
    clean: true,
    noStagedChanges: true,
    noNonIgnoredUntrackedFiles: true,
    statusPorcelain: "",
    activeOperation: false,
    activeGitOperations: { ok: true, MERGE_HEAD: false, REBASE_HEAD: false, CHERRY_PICK_HEAD: false, REVERT_HEAD: false, BISECT_LOG: false, activeOperation: false },
    provedAt: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

function sourceChangingConvergenceResult({ prNumber, oldHead, newHead, baseSha = sha("e"), changedFiles = ["tools/auto-runner/lib/pr-stack-executor.mjs"], tree = sha("d"), fingerprintDigest = sha("f"), overrides = {} } = {}) {
  const changedFilesDigest = digestStrings(changedFiles);
  const commitChain = overrides.sourceIdentity?.commitChain || [oldHead, newHead];
  const commitChainDigest = digestStringList(commitChain);
  const sourceCycleReservation = overrides.sourceCycleReservation || testSourceCycleReservation({
    prNumber,
    oldHead,
    newHead,
    candidateParent: commitChain.at(-2),
    tree,
    commitChain,
    changedFiles,
    fingerprintDigest,
    status: "source_cycle_finalized",
  });
  const validation = {
    passed: true,
    results: [{ command: "node --test tools/auto-runner/test/pr-stack-executor.test.mjs", status: 0 }],
    completedAt: "2026-07-18T00:00:00.000Z",
    headSha: newHead,
    baseSha,
    changedFiles,
    changedFilesDigest,
    profile: "runner-tests",
    evidencePath: "/workspace/logs/validation.json",
    ...(overrides.validation || {}),
  };
  const externalReview = {
    status: "pass",
    tier: "strong_independent",
    verdict: "pass",
    reviewedHead: newHead,
    baseSha,
    changedFiles,
    changedFilesDigest,
    independent: true,
    provider: "gemini",
    providerProfile: "gemini-strong",
    evidencePath: "/workspace/logs/strong.json",
    completedAt: "2026-07-18T00:00:01.000Z",
    ...(overrides.externalReview || {}),
  };
  const review = {
    reviewedHead: newHead,
    baseSha,
    changedFiles,
    changedFilesDigest,
    verdict: { verdict: "approve" },
    evidencePath: "/workspace/logs/compact.json",
    completedAt: "2026-07-18T00:00:02.000Z",
    ...(overrides.review || {}),
  };
  const markerKey = `existing_pr_batch_fix:${prNumber}:${oldHead}:${fingerprintDigest}`;
  const marker = {
    markerKey,
    prNumber,
    oldHead,
    newHead,
    findingFingerprints: [`${prNumber}:finding`],
    fingerprintDigest,
    changedFiles,
    changedFilesDigest,
    validation,
    externalReview,
    review,
    sourceIdentity: {
      oldHead,
      headSha: newHead,
      newHead,
      parent: oldHead,
      tree,
      commitChain,
      commitChainDigest,
      baseSha,
      changedFilesDigest,
      configuredRepositorySlug: "tommytang213/Settleora",
      baseRepositorySlug: "tommytang213/Settleora",
      headRepositorySlug: "tommytang213/Settleora",
      originRepositorySlug: "tommytang213/Settleora",
      repositoryIds: { baseRepositoryId: "repo-1", headRepositoryId: "repo-1" },
      sourceCycleReservation,
      ...(overrides.sourceIdentity || {}),
    },
    pushedAt: "2026-07-18T00:00:03.000Z",
    ...(overrides.marker || {}),
  };
  const nested = {
    ok: true,
    newHead,
    findingFingerprints: marker.findingFingerprints,
    fingerprintDigest,
    changedFiles,
    changedFilesDigest,
    validation,
    externalReview,
    review,
    sourceIdentity: marker.sourceIdentity,
    durableMutationMarkers: { [markerKey]: marker },
    completedAt: "2026-07-18T00:00:04.000Z",
    ...(overrides.nested || {}),
  };
  return { ok: true, newHead, result: nested, ...overrides.outer };
}

function testSourceCycleReservation({ prNumber = 919, oldHead = sha("a"), newHead = sha("c"), candidateParent = oldHead, tree = sha("d"), commitChain = [oldHead, newHead], changedFiles = ["tools/auto-runner/lib/pr-stack-executor.mjs"], fingerprintDigest = sha("f"), status = "source_cycle_reserved", consumedBefore = 0, maxAtReservation = 50, epoch = 1, taskKey = null, runId = null, supervisorRunId = null } = {}) {
  const consumedAfter = consumedBefore + 1;
  const commitChainDigest = digestStringList(commitChain);
  const changedFilesDigest = digestStrings(changedFiles);
  const reservationId = digestJson({
    repository: "tommytang213/Settleora",
    prNumber,
    epoch,
    consumedAfter,
    oldHead,
    newHead,
    commitChainDigest,
    changedFilesDigest,
    fingerprintDigest,
  });
  return {
    status,
    reservationId,
    reservationPath: `/workspace/logs/source-cycle-reservations/${reservationId}.json`,
    repository: "tommytang213/Settleora",
    configuredRepositorySlug: "tommytang213/Settleora",
    baseRepositorySlug: "tommytang213/Settleora",
    headRepositorySlug: "tommytang213/Settleora",
    originRepositorySlug: "tommytang213/Settleora",
    repositoryIds: { baseRepositoryId: "repo-1", headRepositoryId: "repo-1" },
    prNumber,
    sourceBranch: prNumber === 920 ? "feature/auto-913-child" : "feature/auto-913-parent",
    sourceCycleEpoch: epoch,
    policyDigest: digestJson({ repositorySlug: "tommytang213/Settleora", maxSourceCyclesPerPr: maxAtReservation }),
    maxAtReservation,
    consumedBefore,
    reservedOrdinal: consumedAfter,
    consumedAfter,
    remainingBefore: maxAtReservation - consumedBefore,
    oldHead,
    finalCandidateHead: newHead,
    candidateNewHead: newHead,
    candidateParent,
    candidateTree: tree,
    commitChain,
    commitChainDigest,
    findingInventoryDigest: fingerprintDigest,
    findingFingerprints: [`${prNumber}:finding`],
    changedFiles,
    changedFilesDigest,
    validationHead: newHead,
    strongReviewHead: newHead,
    codexReviewHead: newHead,
    taskKey,
    runId,
    supervisorRunId,
    createdAt: "2026-07-18T00:00:00.000Z",
    finalizedAt: status === "source_cycle_finalized" ? "2026-07-18T00:00:03.000Z" : null,
  };
}

function digestStrings(items) {
  return createHash("sha256").update([...items].sort().join("\n")).digest("hex");
}

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value || {})).digest("hex");
}

function digestStringList(items) {
  return createHash("sha256").update((Array.isArray(items) ? items : []).join("\n")).digest("hex");
}

function finalGateRunner(changedFiles = ["tools/auto-runner/919.mjs"]) {
  return (command, args = []) => {
    if (command === "gh" && args[0] === "pr" && args[1] === "view") return fakeRunner(command, args);
    if (command === "git" && args[0] === "remote" && args[1] === "get-url") return fakeRunner(command, args);
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return fakeRunner(command, args);
    if (command === "gh" && args.includes("--name-only")) return { status: 0, stdout: `${changedFiles.join("\n")}\n`, stderr: "", error: null };
    if (command === "gh" && args.includes("--patch")) return { status: 0, stdout: changedFiles.map((file) => `diff --git a/${file} b/${file}\n`).join(""), stderr: "", error: null };
    if (args.includes("patch-id")) return { status: 0, stdout: `${sha("d")} 0000\n`, stderr: "", error: null };
    if (args.includes("apply")) return fakeRunner();
    if (args[0] === "rev-parse" && args[1] === "--verify") return { status: 1, stdout: "", stderr: "", error: null };
    if (args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: `${sha("a")}\n`, stderr: "", error: null };
    if (args[0] === "rev-parse") return { status: 0, stdout: `${sha("e")}\n`, stderr: "", error: null };
    if (args[0] === "diff") return { status: 0, stdout: "", stderr: "", error: null };
    if (args[0] === "status") return fakeRunner();
    return fakeRunner();
  };
}

function finalHygieneRunner(calls, options = {}) {
  let failedComment = false;
  return (command, args = [], runnerOptions = {}) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { status: 0, stdout: `${runnerOptions.cwd || process.cwd()}\n`, stderr: "", error: null };
    if (command === "git" && args[0] === "remote" && args[1] === "get-url") return { status: 0, stdout: "git@github.com:tommytang213/Settleora.git\n", stderr: "", error: null };
    if (command === "gh" && args[0] === "issue" && args[1] === "view") {
      const number = Number(args.find((arg) => /^\d+$/.test(String(arg))));
      return {
        status: 0,
        stdout: JSON.stringify({
          number,
          title: number === 800 ? "Umbrella tracker" : "Live stack acceptance",
          body: number === 800 ? "Keep #800 open until final acceptance." : "Close rule: keep open until live acceptance completes. Remaining gates: live acceptance.",
          state: "OPEN",
          labels: [],
          comments: [],
          url: `https://github.com/tommytang213/Settleora/issues/${number}`,
        }),
        stderr: "",
        error: null,
      };
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "view") {
      return {
        status: 0,
        stdout: JSON.stringify({
          number: 920,
          url: "https://github.com/tommytang213/Settleora/pull/920",
          title: "Child",
          state: "MERGED",
          headRefName: "feature/auto-913-child",
          headRefOid: sha("b"),
          baseRefName: "main",
          mergeCommit: { oid: sha("d") },
          mergedAt: "2026-07-18T00:00:00Z",
        }),
        stderr: "",
        error: null,
      };
    }
    if (command === "gh" && args[0] === "issue" && args[1] === "comment") {
      if (options.failFirstIssueComment && !failedComment) {
        failedComment = true;
        return { status: 1, stdout: "", stderr: "simulated comment failure", error: null };
      }
      return { status: 0, stdout: "", stderr: "", error: null };
    }
    if (command === "gh" && args[0] === "issue" && args[1] === "edit") return { status: 0, stdout: "", stderr: "", error: null };
    return { status: 0, stdout: "", stderr: "", error: null };
  };
}

function targetWorktreeRunner(calls, options = {}) {
  const branch = options.branch ?? "feature/auto-913-parent";
  const liveBranch = options.liveBranch ?? "feature/auto-913-parent";
  const head = options.head ?? sha("a");
  const remoteHead = options.remoteHead ?? sha("a");
  const liveHead = options.liveHead ?? remoteHead;
  const base = options.base ?? "main";
  const originUrl = options.originUrl ?? "git@github.com:tommytang213/Settleora.git";
  return (command, args = [], runnerOptions = {}) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (command === "gh" && args[0] === "pr" && args[1] === "view") {
      const configuredSlug = options.baseRepositorySlug ?? "tommytang213/Settleora";
      const headSlug = options.headRepositorySlug === undefined ? "tommytang213/Settleora" : options.headRepositorySlug;
      const [headOwner, headName] = String(headSlug || "").split("/");
      const headRepository = options.headRepositoryNameOnly
        ? { id: "repo-1", name: "Settleora" }
        : headSlug
          ? { id: options.headRepositoryId ?? "repo-1", name: headName, nameWithOwner: headSlug }
          : null;
      return {
        status: 0,
        stdout: JSON.stringify({
          number: Number(args[2]),
          state: "OPEN",
          isDraft: false,
          baseRefName: base,
          headRefName: liveBranch,
          headRefOid: liveHead,
          baseRepositorySlug: configuredSlug,
          baseRepositoryId: options.baseRepositoryId ?? "repo-1",
          headRepository,
          headRepositoryOwner: options.headRepositoryNameOnly ? null : headOwner ? { login: headOwner } : null,
          isCrossRepository: options.isCrossRepository ?? false,
        }),
        stderr: "",
        error: null,
      };
    }
    if (command === "git" && args[0] === "remote" && args[1] === "get-url") return { status: 0, stdout: `${originUrl}\n`, stderr: "", error: null };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { status: 0, stdout: `${runnerOptions.cwd || process.cwd()}\n`, stderr: "", error: null };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--verify") return { status: options.activeOperation ? 0 : 1, stdout: options.activeOperation ? `${sha("x")}\n` : "", stderr: "", error: null };
    if (command === "git" && args[0] === "status") return { status: 0, stdout: options.statusPorcelain || "", stderr: "", error: null };
    if (command === "git" && args[0] === "diff") return { status: 0, stdout: options.diffPorcelain || "", stderr: "", error: null };
    if (command === "git" && args[0] === "fetch") return fakeRunner(command, args);
    if (command === "git" && args[0] === "branch") return { status: 0, stdout: `${branch}\n`, stderr: "", error: null };
    if (command === "git" && args[0] === "rev-parse" && String(args[1]).startsWith("origin/")) return { status: 0, stdout: `${remoteHead}\n`, stderr: "", error: null };
    if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { status: 0, stdout: `${head}\n`, stderr: "", error: null };
    if (command === "git" && args[0] === "rev-list") return fakeRevList(args, options.commitChain);
    if (command === "git" && args[0] === "merge-base") {
      return options.mergeBaseFails ? { status: 1, stdout: "", stderr: "not ancestor", error: null } : fakeRunner(command, args);
    }
    if (command === "git" && args[0] === "merge") return fakeRunner(command, args);
    if (command === "git" && args[0] === "switch") return fakeRunner(command, args);
    return fakeRunner(command, args);
  };
}

function productionPushRunner(calls, { branch, oldHead, candidateHead }) {
  let pushed = false;
  return (command, args = []) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (command === "git" && args[0] === "push") {
      pushed = true;
      return { status: 0, stdout: "", stderr: "", error: null };
    }
    const remoteHead = pushed ? candidateHead : oldHead;
    return targetWorktreeRunner(calls, {
      branch,
      liveBranch: branch,
      head: candidateHead,
      remoteHead,
      liveHead: remoteHead,
    })(command, args);
  };
}

function fakeRunner(command, args = []) {
  if (command === "gh" && args[0] === "pr" && args[1] === "view") {
    return {
      status: 0,
      stdout: JSON.stringify({
        number: Number(args[2]),
        state: "OPEN",
        isDraft: false,
        baseRefName: "main",
        headRefName: Number(args[2]) === 920 ? "feature/auto-913-child" : "feature/auto-913-parent",
        headRefOid: Number(args[2]) === 920 ? sha("b") : sha("a"),
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        headRepository: { id: "repo-1", name: "Settleora", nameWithOwner: "tommytang213/Settleora" },
        headRepositoryOwner: { login: "tommytang213" },
        isCrossRepository: false,
        statusCheckRollup: [check("Validate scaffold"), check("CodeQL"), check("Semgrep CE scan"), check("Trivy repository scan")],
        comments: [],
        reviews: [],
      }),
      stderr: "",
      error: null,
    };
  }
  if (command === "git" && args[0] === "remote" && args[1] === "get-url") {
    return { status: 0, stdout: "git@github.com:tommytang213/Settleora.git\n", stderr: "", error: null };
  }
  if (command === "git" && args[0] === "rev-list") return fakeRevList(args);
  if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") {
    return { status: 0, stdout: `${process.cwd()}\n`, stderr: "", error: null };
  }
  if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
    return { status: 0, stdout: `${sha("a")}\n`, stderr: "", error: null };
  }
  if (command === "git" && args[0] === "rev-parse") {
    return { status: 0, stdout: `${sha("e")}\n`, stderr: "", error: null };
  }
  if (command === "git" && args[0] === "status") {
    return { status: 0, stdout: "", stderr: "", error: null };
  }
  return { status: 0, stdout: "", stderr: "", error: null };
}

function fakeRevList(args = [], explicitChain = null) {
  if (args.includes("--parents")) {
    const child = args.at(-1);
    const chain = normalizeFakeChain(explicitChain);
    const index = chain.indexOf(child);
    const parent = index > 0 ? chain[index - 1] : sha("a");
    return { status: 0, stdout: `${child} ${parent}\n`, stderr: "", error: null };
  }
  const range = args.at(-1) || "";
  const [oldHead, newHead] = range.split("..");
  const explicit = normalizeFakeChain(explicitChain);
  const commits = explicit.length > 0 && explicit[0] === oldHead && explicit.at(-1) === newHead
    ? explicit.slice(1)
    : [newHead].filter(Boolean);
  return { status: 0, stdout: `${commits.join("\n")}\n`, stderr: "", error: null };
}

function normalizeFakeChain(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function scriptedAdapter(calls) {
  return {
    inspectPr: async ({ prNumber }) => {
      calls.push(`inspect:${prNumber}`);
      return { ok: true, headRefOid: prNumber === 919 ? sha("a") : sha("b"), findings: [] };
    },
    convergeExistingPr: async ({ pr }) => {
      calls.push(`converge:${pr.number}`);
      return { ok: true, headRefOid: pr.headRefOid };
    },
    completeFinalGates: async ({ pr }) => {
      calls.push(`gates:${pr.number}`);
      return { ok: true, exactHead: pr.headRefOid };
    },
    mergePr: async ({ pr }) => {
      calls.push(`merge:${pr.number}`);
      return { ok: true, mergeSha: pr.number === 919 ? sha("m") : sha("n") };
    },
    fetchCurrentMain: async ({ pr }) => {
      calls.push(`current-main:${pr.number}`);
      return { ok: true, currentMain: sha("m") };
    },
    retargetPrBase: async ({ pr }) => {
      calls.push(`retarget:${pr.number}`);
      return { ok: true };
    },
    proveSemanticOwnDelta: async ({ pr }) => {
      calls.push(`own-delta:${pr.number}`);
      return { ok: true, before: pr.ownDelta, after: { ...pr.ownDelta, reversePatchApplies: true } };
    },
    markReadyForReview: async ({ pr }) => {
      calls.push(`ready:${pr.number}`);
      return { ok: true };
    },
    runFinalHygiene: async () => {
      calls.push("hygiene");
      return { ok: true };
    },
  };
}
