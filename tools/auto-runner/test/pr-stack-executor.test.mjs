import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig, parseCliArgs } from "../lib/config.mjs";
import { buildReadOnlyLiveStackFixturePlan, createDependentPrStackPlan } from "../lib/pr-stack-controller.mjs";
import {
  createInitialPrStackState,
  createProductionPrStackAdapter,
  loadExecutableStackPlan,
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

test("new source head consumes one parent cycle and waits do not consume cycles", async () => {
  const fixture = stackFixture();
  let result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: {
      inspectPr: async () => ({ ok: true, headRefOid: sha("a"), findings: [] }),
      convergeExistingPr: async () => ({ ok: true, newHead: sha("c") }),
    },
  });
  assert.equal(result.ok, true);
  let state = JSON.parse(readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.sourceCycles["919"], 1);

  result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, {
    adapter: { completeFinalGates: async () => ({ ok: false, waiting: true, reasonCode: "ci_check_completion_wait" }) },
  });
  assert.equal(result.outcome, "waiting");
  state = JSON.parse(readFileSync(path.join(path.dirname(fixture.planPath), "stack-state.json"), "utf8"));
  assert.equal(state.sourceCycles["919"], 1);
});

test("source-changing cycles are independently available up to 50 per PR", () => {
  const plan = makePlan();
  const state = createInitialPrStackState({ plan });
  state.sourceCycles["919"] = 50;
  state.sourceCycles["920"] = 49;
  assert.equal(validatePrStackState(state, plan).ok, true);
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
  assert.equal(ok.ok, true);
  assert.equal(ready, 1);
});

test("final hygiene occurs only after every PR has merge proof", async () => {
  const fixture = stackFixtureAtChild({ retargeted: true, ownDelta: true, ready: true, childConverged: true, childGates: true });
  let hygiene = 0;
  let result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter: { mergePr: async () => ({ ok: true, mergeSha: sha("d") }) } });
  assert.equal(result.ok, true);
  result = await runPrStackExecution(fixture.config, { stackPlanPath: fixture.planPath }, { adapter: { runFinalHygiene: async () => { hygiene += 1; return { ok: true }; } } });
  assert.equal(result.ok, true);
  assert.equal(hygiene, 1);
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
      changedFiles,
      changedFilesDigest: digest,
      profile: "runner-tests",
    },
    externalReview: {
      status: "pass",
      tier: "strong_independent",
      verdict: "pass",
      reviewedHead: sha("a"),
      changedFiles,
      changedFilesDigest: digest,
      independent: true,
      provider: "gemini",
      completedAt: new Date().toISOString(),
    },
    review: {
      reviewedHead: sha("a"),
      changedFiles,
      changedFilesDigest: digest,
      verdict: { verdict: "approve" },
      completedAt: new Date().toISOString(),
    },
    codexMechanicsReviewApproved: true,
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
  assert.match(text, /\[redacted\]/);
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

function stackFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-stack-"));
  const logsRoot = path.join(root, "logs");
  const configPath = path.join(root, "config.json");
  const configJson = {
    repoRoot: process.cwd(),
    logsRoot,
    repositorySlug: "tommytang213/Settleora",
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

function stackFixtureAtChild(flags = {}) {
  const fixture = stackFixture();
  const statePath = path.join(path.dirname(fixture.planPath), "stack-state.json");
  const state = createInitialPrStackState({ plan: fixture.plan });
  state.evidence.reviewConverged["919"] = { ok: true };
  state.evidence.gatesPassed["919"] = { ok: true };
  state.evidence.merged["919"] = { ok: true, merged: true, mergeSha: sha("m") };
  state.evidence.currentMainProof["919"] = { ok: true, currentMain: sha("m") };
  if (flags.retargeted) state.evidence.retargeted["920"] = { ok: true };
  if (flags.ownDelta) state.evidence.ownDeltaPreserved["920"] = { ok: true };
  if (flags.ready) state.evidence.ready["920"] = { ok: true };
  if (flags.childConverged) state.evidence.reviewConverged["920"] = { ok: true };
  if (flags.childGates) state.evidence.gatesPassed["920"] = { ok: true };
  state.activePrNumber = 920;
  writePrStackState(statePath, state);
  return fixture;
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

function digestStrings(items) {
  return createHash("sha256").update([...items].sort().join("\n")).digest("hex");
}

function fakeRunner() {
  return { status: 0, stdout: "", stderr: "", error: null };
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
