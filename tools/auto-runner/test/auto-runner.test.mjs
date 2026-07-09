import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseCliArgs, loadConfig } from "../lib/config.mjs";
import { evaluateCanaryIssuePolicy, evaluateTrustPolicy, writeCanaryEvidence } from "../lib/canary-policy.mjs";
import { parseReviewVerdict, runReviewPrompt } from "../lib/codex-runner.mjs";
import { listWorkingTreeChangedFiles } from "../lib/git-workspace.mjs";
import {
  buildEligibleLabelSearches,
  claimIssue,
  commentIssueOutcome,
  dedupeIssuesByNumber,
  pollEligibleIssues,
  validateEligibleLabels,
} from "../lib/github-issues.mjs";
import { classifyIssueLane, filterForbiddenChangedFiles, parseAutoRunnerContract } from "../lib/lane-policy.mjs";
import { runPreflight } from "../lib/preflight.mjs";
import { generateTaskPrompt } from "../lib/task-prompt.mjs";
import { inspectPreReviewPrOwnership } from "../lib/pr-manager.mjs";
import { loadGeminiApiKey, runGeminiReviewerSmokeTest, sanitizeSecretText } from "../lib/gemini-reviewer.mjs";
import {
  estimateReviewerCostUsd,
  evaluateReviewerBudget,
  reviewerReadinessSummary,
  routeReviewer,
} from "../lib/reviewer-policy.mjs";

const baseConfig = {
  dryRun: true,
  run: false,
  eligibleLabels: ["auto-ready", "auto-bundle"],
  stopLabels: ["needs-tommy", "manual-gate", "danger-gate", "auto-failed", "auto-running", "auto-pr-opened", "blocked"],
  claimLabels: ["auto-claimed", "auto-running"],
  priorityLabels: ["priority-critical", "priority-high", "priority-ready"],
  pollLimit: 30,
};

test("CLI rejects fixture issues outside dry-run", () => {
  assert.throws(
    () => parseCliArgs(["--run", "--fixture-issues", "tools/auto-runner/test/fixtures/issues.safe.json"]),
    /dry-run only/,
  );
});

test("CLI treats preflight as standalone mode", () => {
  const parsed = parseCliArgs(["--preflight"]);
  assert.equal(parsed.preflight, true);
  assert.throws(() => parseCliArgs(["--preflight", "--dry-run"]), /non-mutating mode/);
});

test("trust policy refuses normal --run by default", () => {
  const config = loadConfig({
    ...parseCliArgs(["--run"]),
    configPath: null,
  });
  const policy = evaluateTrustPolicy(config);
  assert.equal(policy.allowed, false);
  assert.match(policy.reason, /trustedRealRunApproved/);
});

test("canary real-run requires explicit approval config", () => {
  const config = loadConfig({
    ...parseCliArgs(["--run", "--canary"]),
    configPath: null,
  });
  const policy = evaluateTrustPolicy(config);
  assert.equal(policy.allowed, false);
  assert.match(policy.reason, /trustedRealRunCanaryApproved/);
});

test("canary real-run refuses unsafe mutation toggles", () => {
  const base = {
    ...loadConfig({
      ...parseCliArgs(["--run", "--canary"]),
      configPath: null,
    }),
    trustedRealRunCanaryApproved: true,
  };
  for (const unsafe of [
    { allowAutoMerge: true },
    { allowFollowupIssueCreation: true },
    { allowStaleClaimSteal: true },
    { allowReviewFixMutation: true },
    { maxReviewFixCycles: 1 },
    { allowSystemdEnablement: true },
  ]) {
    const policy = evaluateTrustPolicy({ ...base, ...unsafe });
    assert.equal(policy.allowed, false);
    assert.match(policy.reason, /disabled mutation toggles/);
  }
});

test("preflight reports trusted run and canary refusal state", () => {
  const result = runPreflight({
    ...baseConfig,
    repoRoot: process.cwd(),
    logsRoot: "/workspace/logs/settleora-auto-runner",
    codexCommand: "codex-vm-full",
    trustedRealRunApproved: false,
    trustedRealRunCanaryApproved: false,
    trustedRealRunCanaryMaxIterations: 2,
    allowAutoMerge: false,
    allowFollowupIssueCreation: false,
    allowStaleClaimSteal: false,
    allowReviewFixMutation: false,
    maxReviewFixCycles: 0,
    allowSystemdEnablement: false,
    maxIterations: 1,
    canaryEvidenceRoot: "/workspace/logs/settleora-auto-runner/canary",
  });
  const normal = result.checks.find((check) => check.name === "trusted-real-run-policy");
  const canary = result.checks.find((check) => check.name === "trusted-real-run-canary-policy");
  assert.match(normal.detail, /normalRunWouldRefuse/);
  assert.match(normal.detail, /trustedRealRunApproved/);
  assert.match(canary.detail, /canaryRunWouldRefuse/);
  assert.match(canary.detail, /trustedRealRunCanaryApproved/);
});

test("preflight reports canary enabled state when approved", () => {
  const result = runPreflight({
    ...baseConfig,
    repoRoot: process.cwd(),
    logsRoot: "/workspace/logs/settleora-auto-runner",
    codexCommand: "codex-vm-full",
    trustedRealRunApproved: false,
    trustedRealRunCanaryApproved: true,
    trustedRealRunCanaryMaxIterations: 2,
    allowAutoMerge: false,
    allowFollowupIssueCreation: false,
    allowStaleClaimSteal: false,
    allowReviewFixMutation: false,
    maxReviewFixCycles: 0,
    allowSystemdEnablement: false,
    maxIterations: 1,
    canaryEvidenceRoot: "/workspace/logs/settleora-auto-runner/canary",
  });
  const canary = result.checks.find((check) => check.name === "trusted-real-run-canary-policy");
  assert.equal(canary.status, "pass");
  assert.match(canary.detail, /"canaryRunWouldRefuse":false/);
});

test("readiness preflight succeeds with safe defaults and reports manual gates", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-readiness-safe-"));
  try {
    const runner = createReadinessRunner();
    const result = runPreflight(readinessConfig(tempRoot), { runner });
    assert.equal(result.summary.fail, 0);
    assert.ok(result.summary.pass > 0);
    assert.ok(result.readinessReports.jsonPath.endsWith(".json"));
    assert.ok(result.readinessReports.markdownPath.endsWith(".md"));
    assert.match(readFileSync(result.readinessReports.markdownPath, "utf8"), /Remaining Manual Gates/);
    assert.match(readFileSync(result.readinessReports.markdownPath, "utf8"), /trusted overnight operation/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("readiness preflight fails when risky gates are enabled without approval", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-readiness-risky-"));
  try {
    const result = runPreflight(
      {
        ...readinessConfig(tempRoot),
        allowAutoMerge: true,
        allowFollowupIssueCreation: true,
        allowStaleClaimSteal: true,
        allowReviewFixMutation: true,
        allowSystemdEnablement: true,
        maxReviewFixCycles: 1,
      },
      { runner: createReadinessRunner() },
    );
    assert.ok(result.summary.fail >= 6);
    assert.equal(result.checks.find((check) => check.name === "auto-merge-disabled").status, "fail");
    assert.equal(result.checks.find((check) => check.name === "stale-claim-stealing-disabled").status, "fail");
    assert.equal(result.checks.find((check) => check.name === "config-parseable").status, "fail");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("readiness preflight reports active stale claim labels without mutating them", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-readiness-claims-"));
  try {
    const runner = createReadinessRunner({
      activeClaims: [
        {
          number: 901,
          title: "Stale auto claim",
          labels: [{ name: "auto-running" }],
          updatedAt: "2000-01-01T00:00:00Z",
          url: "https://example.invalid/issues/901",
        },
      ],
    });
    const result = runPreflight(readinessConfig(tempRoot), { runner });
    const claims = result.checks.find((check) => check.name === "active-claim-labels");
    assert.equal(claims.status, "warn");
    assert.match(claims.detail, /Stale auto claim/);
    assertNoMutatingReadinessCommands(runner.commands);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("readiness preflight does not call codex or mutate GitHub, branches, PRs, merges, or issues", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-readiness-nonmutating-"));
  try {
    const runner = createReadinessRunner();
    runPreflight(readinessConfig(tempRoot), { runner });
    assertNoMutatingReadinessCommands(runner.commands);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("reviewer budget estimates token cost from tier prices", () => {
  assert.equal(
    estimateReviewerCostUsd({
      inputTokens: 1_500_000,
      outputTokens: 250_000,
      inputUsdPerMillionTokens: 0.2,
      outputUsdPerMillionTokens: 0.8,
    }),
    0.5,
  );
});

test("reviewer budget warns at threshold and blocks at hard stop", () => {
  const reviewerBudget = {
    monthlyReviewerBudgetUsd: 80,
    monthlyReviewerHardStopUsd: 95,
    totalMonthlyAutomationBudgetUsd: 300,
    codexSubscriptionBudgetUsd: 200,
    warnAtPercent: 80,
  };
  const warn = evaluateReviewerBudget({ reviewerBudget, currentMonthlySpendUsd: 63, estimatedCostUsd: 1 });
  assert.equal(warn.warn, true);
  assert.equal(warn.block, false);
  assert.equal(warn.projectedReviewerSpendUsd, 64);

  const stop = evaluateReviewerBudget({ reviewerBudget, currentMonthlySpendUsd: 94, estimatedCostUsd: 1.01 });
  assert.equal(stop.warn, true);
  assert.equal(stop.hardStop, true);
  assert.equal(stop.block, true);
});

test("reviewer routing defaults docs and workflow tooling to cheap independent review", () => {
  const docs = routeReviewer({
    changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md", "docs/planning/ISSUE_PROGRESS_LEDGER.md"],
    laneDecision: { lane: "docs-planning" },
  });
  assert.equal(docs.tier, "cheap_independent");
  assert.equal(docs.block, undefined);

  const tooling = routeReviewer({
    changedFiles: ["tools/auto-runner/lib/config.mjs", "tools/auto-runner/test/auto-runner.test.mjs"],
    laneDecision: { lane: "workflow-docs-tooling" },
    stats: { additions: 40, deletions: 10 },
  });
  assert.equal(tooling.tier, "cheap_independent");
});

test("reviewer routing escalates sensitive paths to strong independent review", () => {
  const route = routeReviewer({
    changedFiles: ["services/api/Auth/SessionRuntime.cs", "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
    laneDecision: { lane: "security-runtime" },
  });
  assert.equal(route.tier, "strong_independent");
  assert.equal(route.strongRequired, true);
  assert.match(route.sensitiveFiles.join("\n"), /services\/api/);
});

test("reviewer routing blocks or escalates huge cross-domain PRs", () => {
  const files = [
    ...Array.from({ length: 12 }, (_, index) => `docs/workflow/file-${index}.md`),
    ...Array.from({ length: 12 }, (_, index) => `tools/auto-runner/lib/file-${index}.mjs`),
    ...Array.from({ length: 12 }, (_, index) => `docs/planning/file-${index}.md`),
    ...Array.from({ length: 5 }, (_, index) => `.ai/file-${index}.json`),
  ];
  const route = routeReviewer({ changedFiles: files, laneDecision: { lane: "workflow-docs-tooling" } });
  assert.equal(route.tier, "block_split_or_escalate");
  assert.equal(route.block, true);
});

test("reviewer readiness report includes sanitized providers and no secrets", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-reviewer-readiness-"));
  try {
    const config = {
      ...readinessConfig(tempRoot),
      reviewerTiers: {
        cheap_independent: {
          enabled: true,
          providerProfile: "cheap-profile",
          command: "/usr/local/bin/reviewer --api-key super-secret-token",
          model: "cheap-model",
          inputUsdPerMillionTokens: 0.1,
          outputUsdPerMillionTokens: 0.4,
        },
      },
    };
    const summary = reviewerReadinessSummary(config, {
      changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
      estimatedInputTokens: 10_000,
      estimatedOutputTokens: 1_000,
    });
    assert.equal(summary.tiers.cheap_independent.providerProfile, "cheap-profile");
    assert.equal(summary.tiers.cheap_independent.commandConfigured, true);
    assert.equal("command" in summary.tiers.cheap_independent, false);
    assert.doesNotMatch(JSON.stringify(summary), /super-secret-token/);

    const runner = createReadinessRunner();
    const result = runPreflight(config, { runner });
    const markdown = readFileSync(result.readinessReports.markdownPath, "utf8");
    assert.match(markdown, /Reviewer Budget Policy/);
    assert.doesNotMatch(markdown, /super-secret-token/);
    assertNoMutatingReadinessCommands(runner.commands);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Gemini smoke test missing key fails safely without external call or secret output", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-smoke-missing-key-"));
  try {
    let calls = 0;
    const result = await runGeminiReviewerSmokeTest(geminiSmokeConfig(tempRoot), {
      liveExternalReviewerCalls: true,
      env: {},
      fetchImpl: async () => {
        calls += 1;
        throw new Error("should not call");
      },
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_for_live_smoke_test_key_missing");
    assert.equal(result.liveCallAttempted, false);
    assert.equal(calls, 0);
    assert.doesNotMatch(readFileSync(result.reportPath, "utf8"), /GEMINI_API_KEY|super-secret/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Gemini secret redaction removes raw key and auth-like fields", () => {
  const sanitized = sanitizeSecretText(
    'provider error api_key="super-secret-key" authorization Bearer live-token x-goog-api-key: other-key super-secret-key',
    "super-secret-key",
  );
  assert.doesNotMatch(sanitized, /super-secret-key/);
  assert.doesNotMatch(sanitized, /live-token/);
  assert.doesNotMatch(sanitized, /other-key/);
  assert.match(sanitized, /\[REDACTED\]/);
});

test("Gemini API key loader only accepts env or approved external secrets path", () => {
  assert.equal(loadGeminiApiKey({ env: { GEMINI_API_KEY: "from-env" } }).source, "env:GEMINI_API_KEY");
  assert.equal(
    loadGeminiApiKey({ env: {}, envFilePath: "/workspace/repos/Settleora/.env" }).reason,
    "blocked_unapproved_secret_env_file_path",
  );
});

test("Gemini smoke test fails closed for malformed JSON verdict", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-smoke-malformed-"));
  try {
    let calls = 0;
    const result = await runGeminiReviewerSmokeTest(geminiSmokeConfig(tempRoot), {
      liveExternalReviewerCalls: true,
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () => {
        calls += 1;
        return fakeGeminiResponse({
          candidates: [{ content: { parts: [{ text: "not json" }] } }],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, totalTokenCount: 15 },
        });
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_malformed_json_verdict");
    assert.equal(result.actualUsage.totalTokenCount, 15);
    assert.doesNotMatch(readFileSync(result.reportPath, "utf8"), /super-secret-key/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Gemini smoke test blocks before live call when reviewer budget hard stop would be exceeded", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-smoke-budget-"));
  try {
    mkdirSync(path.join(tempRoot, "state"), { recursive: true });
    writeFileSync(
      path.join(tempRoot, "state", "reviewer-accounting.json"),
      `${JSON.stringify({ entries: [{ monthKey: new Date().toISOString().slice(0, 7), costUsd: 95 }] })}\n`,
    );
    let calls = 0;
    const config = geminiSmokeConfig(tempRoot, {
      reviewerSmokeTest: { tier: "cheap_independent", maxEstimatedCostUsd: 5 },
      reviewerTiers: {
        cheap_independent: {
          enabled: true,
          provider: "gemini",
          providerProfile: "gemini-cheap",
          model: "gemini-2.5-flash-lite",
          inputUsdPerMillionTokens: 1000,
          outputUsdPerMillionTokens: 1000,
        },
      },
    });
    const result = await runGeminiReviewerSmokeTest(config, {
      liveExternalReviewerCalls: true,
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () => {
        calls += 1;
        throw new Error("should not call");
      },
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_reviewer_budget_hard_stop");
    assert.equal(result.budget.block, true);
    assert.equal(calls, 0);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Gemini smoke test skips disabled provider tiers without external API call", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-smoke-disabled-"));
  try {
    let calls = 0;
    const result = await runGeminiReviewerSmokeTest(geminiSmokeConfig(tempRoot, {
      reviewerTiers: {
        cheap_independent: {
          enabled: false,
          provider: "gemini",
          providerProfile: "gemini-cheap",
          model: "gemini-2.5-flash-lite",
        },
      },
    }), {
      liveExternalReviewerCalls: true,
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () => {
        calls += 1;
        throw new Error("should not call");
      },
    });
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "skipped_provider_tier_disabled");
    assert.equal(calls, 0);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Gemini smoke test blocks invalid model names before external API call", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-smoke-invalid-model-"));
  try {
    let calls = 0;
    const result = await runGeminiReviewerSmokeTest(geminiSmokeConfig(tempRoot, {
      reviewerTiers: {
        cheap_independent: {
          enabled: true,
          provider: "gemini",
          providerProfile: "gemini-cheap",
          model: "https://metadata.invalid/latest",
        },
      },
    }), {
      liveExternalReviewerCalls: true,
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () => {
        calls += 1;
        throw new Error("should not call");
      },
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_invalid_gemini_model");
    assert.equal(calls, 0);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("reviewer smoke CLI mode is standalone and does not mutate repo or GitHub", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-smoke-cli-"));
  const before = gitStatusShort();
  try {
    const configPath = path.join(tempRoot, "gemini-smoke-config.json");
    writeFileSync(configPath, `${JSON.stringify(geminiSmokeConfig(tempRoot), null, 2)}\n`);
    const result = spawnSync(
      "node",
      ["tools/auto-runner/settleora-auto-runner.mjs", "--reviewer-smoke-test", "--config", configPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        windowsHide: true,
        env: { ...process.env, GEMINI_API_KEY: "" },
      },
    );
    const after = gitStatusShort();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(after, before);
    assert.match(result.stdout, /"mode": "reviewer-smoke-test"/);
    assert.match(result.stdout, /blocked_for_live_smoke_test_key_missing/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /\bgh issue edit\b|\bgh issue comment\b|\bgh pr create\b|\bgit push\b|\bgit switch\b/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Gemini smoke test selects configured cheap and strong Gemini tier models", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-smoke-routing-"));
  try {
    const requestedUrls = [];
    const fetchImpl = async (url) => {
      requestedUrls.push(String(url));
      return fakeGeminiResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict: "pass", findings: [] }) }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      });
    };
    const config = geminiSmokeConfig(tempRoot, { reviewerSmokeTest: { tier: "cheap_independent", maxEstimatedCostUsd: 1 } });
    const cheap = await runGeminiReviewerSmokeTest(config, {
      tierId: "cheap_independent",
      liveExternalReviewerCalls: true,
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl,
    });
    const strong = await runGeminiReviewerSmokeTest(config, {
      tierId: "strong_independent",
      liveExternalReviewerCalls: true,
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl,
    });
    assert.equal(cheap.status, "pass");
    assert.equal(cheap.model, "gemini-2.5-flash-lite");
    assert.equal(strong.status, "pass");
    assert.equal(strong.model, "gemini-2.5-pro");
    assert.match(requestedUrls[0], /gemini-2\.5-flash-lite/);
    assert.match(requestedUrls[1], /gemini-2\.5-pro/);
    assert.doesNotMatch(readFileSync(cheap.reportPath, "utf8"), /super-secret-key/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("fixture polling sorts eligible issues and skips stop labels", () => {
  const config = {
    ...baseConfig,
    fixtureIssues: [
      { number: 3, title: "stop", labels: ["auto-ready", "auto-pr-opened"], createdAt: "2026-01-03T00:00:00Z" },
      { number: 2, title: "second", labels: ["auto-ready"], createdAt: "2026-01-02T00:00:00Z" },
      { number: 1, title: "first", labels: ["auto-ready", "priority-high"], createdAt: "2026-01-01T00:00:00Z" },
    ],
    fixtureIssueCursor: 0,
  };
  const result = pollEligibleIssues(config, { warn() {} });
  assert.equal(result.fixture, true);
  assert.deepEqual(
    result.issues.map((issue) => issue.number),
    [1, 2],
  );
  config.fixtureIssueCursor = 1;
  assert.deepEqual(
    pollEligibleIssues(config, { warn() {} }).issues.map((issue) => issue.number),
    [2],
  );
});

test("eligible label searches use one simple non-parenthesized query per label", () => {
  assert.deepEqual(buildEligibleLabelSearches("tommytang213/Settleora", ["auto-canary-ready"]), [
    {
      label: "auto-canary-ready",
      search: "repo:tommytang213/Settleora is:issue is:open label:auto-canary-ready",
    },
  ]);
  assert.deepEqual(
    buildEligibleLabelSearches("tommytang213/Settleora", ["auto-ready", "auto-bundle"]).map((item) => item.search),
    [
      "repo:tommytang213/Settleora is:issue is:open label:auto-ready",
      "repo:tommytang213/Settleora is:issue is:open label:auto-bundle",
    ],
  );
});

test("eligible label validation fails closed for empty or unsafe labels", () => {
  assert.deepEqual(validateEligibleLabels([" auto-ready ", "auto-bundle", "auto-canary-ready"]), [
    "auto-ready",
    "auto-bundle",
    "auto-canary-ready",
  ]);
  for (const labels of [[], [""], [" "], ["auto ready"], ["auto-ready)"], ["label:auto-ready"], ["auto-ready OR label:x"]]) {
    assert.throws(() => validateEligibleLabels(labels), /eligibleLabels/);
  }
});

test("multiple eligible label poll results are deduped by issue number", () => {
  const issues = dedupeIssuesByNumber([
    { number: 805, title: "canary", labels: ["auto-canary-ready"] },
    { number: 806, title: "normal", labels: ["auto-ready"] },
    { number: 805, title: "canary duplicate", labels: ["auto-canary-ready", "auto-ready"] },
  ]);
  assert.deepEqual(
    issues.map((issue) => issue.number),
    [805, 806],
  );
  assert.equal(issues[0].title, "canary");
});

test("dry-run issue claim and terminal outcomes preview bounded mutations", () => {
  const issue = { number: 10, title: "safe", labels: ["auto-ready"] };
  const claim = claimIssue(baseConfig, issue, { warn() {} });
  assert.deepEqual(claim.preview.addLabels, ["auto-claimed", "auto-running"]);
  assert.match(claim.preview.comment, /claimed this issue/);

  const prOpened = commentIssueOutcome(baseConfig, issue, "approved_pr_opened", "opened");
  assert.deepEqual(prOpened.preview.addLabels, ["auto-pr-opened"]);
  assert.deepEqual(prOpened.preview.removeLabels, ["auto-running", "auto-claimed"]);

  const validationFailed = commentIssueOutcome(baseConfig, issue, "validation_failed", "failed");
  assert.deepEqual(validationFailed.preview.addLabels, ["auto-failed"]);
  assert.deepEqual(validationFailed.preview.removeLabels, ["auto-running", "auto-claimed"]);

  const noChanges = commentIssueOutcome(baseConfig, issue, "no_changes", "none");
  assert.deepEqual(noChanges.preview.addLabels, []);
  assert.deepEqual(noChanges.preview.removeLabels, ["auto-running", "auto-claimed"]);
});

test("failure and gated terminal outcomes remove active claim labels", () => {
  const issue = { number: 11, title: "terminal", labels: ["auto-ready"] };
  const expectations = [
    ["danger_gate", ["danger-gate"]],
    ["blocked_needs_tommy", ["needs-tommy"]],
    ["auto_failed", ["auto-failed"]],
    ["review_changes_requested_retry_exhausted", ["auto-failed"]],
  ];
  for (const [outcome, addLabels] of expectations) {
    const result = commentIssueOutcome(baseConfig, issue, outcome, outcome);
    assert.deepEqual(result.preview.addLabels, addLabels);
    assert.deepEqual(result.preview.removeLabels, ["auto-running", "auto-claimed"]);
  }
});

test("post-Codex changed-file collection detects tracked modified files", () => {
  const repo = createTempGitRepo();
  try {
    writeFileSync(path.join(repo, "docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"), "changed\n");
    assert.deepEqual(listWorkingTreeChangedFiles({ cwd: repo }), [
      "docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md",
    ]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("post-Codex changed-file collection detects staged and untracked files deterministically", () => {
  const repo = createTempGitRepo();
  try {
    writeFileSync(path.join(repo, "tools/auto-runner/README.md"), "staged\n");
    git(repo, ["add", "tools/auto-runner/README.md"]);
    mkdirSync(path.join(repo, "tools/auto-runner/lib"), { recursive: true });
    writeFileSync(path.join(repo, "tools/auto-runner/lib/new-helper.mjs"), "export const ok = true;\n");
    assert.deepEqual(listWorkingTreeChangedFiles({ cwd: repo }), [
      "tools/auto-runner/README.md",
      "tools/auto-runner/lib/new-helper.mjs",
    ]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("post-Codex changed-file collection returns no files when worktree and index are clean", () => {
  const repo = createTempGitRepo();
  try {
    assert.deepEqual(listWorkingTreeChangedFiles({ cwd: repo }), []);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("post-Codex changed files outside contract allowlist fail scope filtering", () => {
  const lane = classifyIssueLane({
    title: "Canary docs only",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  const repo = createTempGitRepo();
  try {
    writeFileSync(path.join(repo, "tools/auto-runner/README.md"), "outside contract\n");
    const changedFiles = listWorkingTreeChangedFiles({ cwd: repo });
    assert.deepEqual(changedFiles, ["tools/auto-runner/README.md"]);
    assert.deepEqual(filterForbiddenChangedFiles(changedFiles, lane), ["tools/auto-runner/README.md"]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("valid workflow/tooling contract permits only contract and lane paths", () => {
  const lane = classifyIssueLane({
    title: "Auto-runner workflow hardening",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["tools/auto-runner/**", "docs/workflow/**"],
      validationProfile: "workflow-tooling",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.equal(lane.validationProfile, "workflow-tooling");
  assert.deepEqual(filterForbiddenChangedFiles(["tools/auto-runner/lib/config.mjs", "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"], lane), []);
  assert.deepEqual(filterForbiddenChangedFiles(["services/api/Auth/Foo.cs"], lane), ["services/api/Auth/Foo.cs"]);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/planning/ISSUE_PROGRESS_LEDGER.md"], lane), [
    "docs/planning/ISSUE_PROGRESS_LEDGER.md",
  ]);
});

test("valid docs/planning contract is accepted for planning docs only", () => {
  const lane = classifyIssueLane({
    title: "Update issue ledger checkpoint",
    body: contractBody({
      lane: "docs-planning",
      allowedPaths: ["docs/planning/**"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.equal(lane.lane, "docs-planning");
  assert.deepEqual(filterForbiddenChangedFiles(["docs/planning/ISSUE_PROGRESS_LEDGER.md"], lane), []);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"], lane), [
    "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
  ]);
});

test("canary mode accepts only workflow/tooling and docs/planning lanes", () => {
  const config = { canary: true };
  const workflow = classifyIssueLane({
    title: "Auto-runner workflow hardening",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["tools/auto-runner/**"],
      validationProfile: "runner-tests",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, workflow).allowed, true);

  const planning = classifyIssueLane({
    title: "Update issue ledger checkpoint",
    body: contractBody({
      lane: "docs-planning",
      allowedPaths: ["docs/planning/**"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, planning).allowed, true);

  const danger = classifyIssueLane({
    title: "Product runtime placeholder",
    body: contractBody({
      lane: "product-runtime",
      allowedPaths: ["apps/mobile/**"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, danger).allowed, false);
});

test("canary mode rejects auto-merge and non-manual-merge contracts", () => {
  const config = { canary: true };
  const autoMerge = classifyIssueLane({
    title: "Unsafe auto merge contract",
    body: contractBody({ autoMergeEligible: true }),
    labels: ["auto-ready"],
  });
  assert.equal(autoMerge.allowedToImplement, true);
  assert.equal(evaluateCanaryIssuePolicy(config, autoMerge).allowed, false);

  const nonManual = classifyIssueLane({
    title: "Unsafe non manual merge contract",
    body: contractBody({ manualMergeRequired: false }),
    labels: ["auto-ready"],
  });
  assert.equal(nonManual.allowedToImplement, true);
  assert.equal(evaluateCanaryIssuePolicy(config, nonManual).allowed, false);
});

test("auto-ready alone is insufficient without issue body contract", () => {
  const lane = classifyIssueLane({
    title: "Auto-runner workflow hardening",
    body: "Workflow tooling task limited to tools/auto-runner and docs/workflow.",
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, false);
  assert.equal(lane.lane, "missing-or-invalid-contract");
  assert.match(lane.reason, /missing/i);
});

test("contract parser fails closed for malformed and unknown safety fields", () => {
  const malformed = parseAutoRunnerContract("## Auto-runner contract\n\n```json\n{\"contractVersion\":1,\n```");
  assert.equal(malformed.ok, false);
  assert.match(malformed.reason, /malformed/i);

  const unknown = parseAutoRunnerContract(contractBody({ extra: "unsafe" }));
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /unsupported field/i);
});

test("contract lane/profile/path validation fails closed", () => {
  const unknownLane = classifyIssueLane({
    title: "Unknown lane",
    body: contractBody({ lane: "runtime-free-for-all" }),
    labels: ["auto-ready"],
  });
  assert.equal(unknownLane.allowedToImplement, false);
  assert.match(unknownLane.reason, /unsupported/i);

  const injectedProfile = classifyIssueLane({
    title: "Injected profile",
    body: contractBody({ validationProfile: "docs-only; rm -rf /" }),
    labels: ["auto-ready"],
  });
  assert.equal(injectedProfile.allowedToImplement, false);
  assert.match(injectedProfile.reason, /unsupported validation profile/i);

  const unsafePath = classifyIssueLane({
    title: "Unsafe path",
    body: contractBody({ allowedPaths: ["tools/**"] }),
    labels: ["auto-ready"],
  });
  assert.equal(unsafePath.allowedToImplement, false);
  assert.match(unsafePath.reason, /outside lane manifest/i);
});

test("product and danger lanes remain manual or danger gated", () => {
  const disabledLane = classifyIssueLane({
    title: "Product runtime placeholder",
    body: contractBody({
      lane: "product-runtime",
      allowedPaths: ["apps/mobile/**"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(disabledLane.allowedToImplement, false);
  assert.equal(disabledLane.dangerGate, true);

  for (const body of [
    "Change auth config for sessions",
    "Update deployment config",
    "Change settlement payment calculation",
  ]) {
    const lane = classifyIssueLane({ title: "Danger", body, labels: ["auto-ready"] });
    assert.equal(lane.allowedToImplement, false);
    assert.equal(lane.dangerGate, true);
  }
});

test("changed file outside contract allowlist is rejected even inside lane", () => {
  const lane = classifyIssueLane({
    title: "Runner tests only",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["tools/auto-runner/test/**"],
      validationProfile: "runner-tests",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.deepEqual(filterForbiddenChangedFiles(["tools/auto-runner/test/auto-runner.test.mjs"], lane), []);
  assert.deepEqual(filterForbiddenChangedFiles(["tools/auto-runner/lib/lane-policy.mjs"], lane), [
    "tools/auto-runner/lib/lane-policy.mjs",
  ]);
});

test("review verdict parsing approves valid verdict JSON surrounded by prose", () => {
  const approve = parseReviewVerdict(`notes\n${reviewVerdictJson()}\nextra review notes`);
  assert.equal(approve.verdict, "approve");
  assert.equal(approve.json_source, "extracted_surrounded_json");
  assert.deepEqual(approve.review_json_diagnostics, {
    valid_verdict_count: 1,
    invalid_candidate_count: 0,
    selected_json_source: "extracted_surrounded_json",
    failure_reason: null,
    saw_json: true,
  });
});

test("review verdict parsing records fenced and raw JSON sources", () => {
  const fenced = parseReviewVerdict(`\`\`\`json\n${reviewVerdictJson()}\n\`\`\`\nnotes`);
  assert.equal(fenced.verdict, "approve");
  assert.equal(fenced.json_source, "fenced_json");
  assert.equal(fenced.review_json_diagnostics.valid_verdict_count, 1);
  assert.equal(fenced.review_json_diagnostics.invalid_candidate_count, 0);
  assert.equal(fenced.review_json_diagnostics.selected_json_source, "fenced_json");

  const raw = parseReviewVerdict(reviewVerdictJson());
  assert.equal(raw.verdict, "approve");
  assert.equal(raw.json_source, "raw_json");
  assert.equal(raw.review_json_diagnostics.valid_verdict_count, 1);
  assert.equal(raw.review_json_diagnostics.invalid_candidate_count, 0);
  assert.equal(raw.review_json_diagnostics.selected_json_source, "raw_json");
});

test("review verdict parsing ignores invalid schema example when exactly one valid verdict follows", () => {
  const schemaExample = reviewVerdictJson({
    verdict: "approve | changes_requested | needs_tommy | danger_gate | unable_to_review",
  });
  const result = parseReviewVerdict(`Required JSON shape:\n${schemaExample}\nFinal verdict:\n${reviewVerdictJson()}`);
  assert.equal(result.verdict, "approve");
  assert.equal(result.json_source, "extracted_surrounded_json");
  assert.equal(result.review_json_diagnostics.valid_verdict_count, 1);
  assert.equal(result.review_json_diagnostics.invalid_candidate_count, 1);
  assert.equal(result.review_json_diagnostics.selected_json_source, "extracted_surrounded_json");
  assert.equal(result.review_json_diagnostics.failure_reason, null);
});

test("review verdict parsing fails closed for invalid or ambiguous verdict contracts", () => {
  const invalid = parseReviewVerdict(reviewVerdictJson({ verdict: "ship_it" }));
  assert.equal(invalid.verdict, "unable_to_review");
  assert.match(invalid.blocking_findings[0], /invalid/);
  assert.equal(invalid.review_json_diagnostics.valid_verdict_count, 0);
  assert.equal(invalid.review_json_diagnostics.invalid_candidate_count, 1);
  assert.match(invalid.review_json_diagnostics.failure_reason, /invalid/);

  const missing = parseReviewVerdict(JSON.stringify({ verdict: "approve", confidence: "high" }));
  assert.equal(missing.verdict, "unable_to_review");
  assert.match(missing.blocking_findings[0], /missing required field/);
  assert.equal(missing.review_json_diagnostics.invalid_candidate_count, 1);

  const unknown = parseReviewVerdict(reviewVerdictJson({ unexpected: "unsafe" }));
  assert.equal(unknown.verdict, "unable_to_review");
  assert.match(unknown.blocking_findings[0], /unsupported field/);
  assert.equal(unknown.review_json_diagnostics.invalid_candidate_count, 1);

  const malformed = parseReviewVerdict(`\`\`\`json\n{"verdict":"approve",\n\`\`\`\n${reviewVerdictJson()}`);
  assert.equal(malformed.verdict, "unable_to_review");
  assert.match(malformed.blocking_findings[0], /could not be parsed/);
  assert.equal(malformed.review_json_diagnostics.valid_verdict_count, 0);
  assert.equal(malformed.review_json_diagnostics.invalid_candidate_count, 1);

  const multiple = parseReviewVerdict(`${reviewVerdictJson()}\n${reviewVerdictJson({ verdict: "changes_requested" })}`);
  assert.equal(multiple.verdict, "unable_to_review");
  assert.match(multiple.blocking_findings[0], /multiple verdict JSON objects/);
  assert.equal(multiple.review_json_diagnostics.valid_verdict_count, 2);
  assert.equal(multiple.review_json_diagnostics.invalid_candidate_count, 0);
});

test("review verdict parsing fails closed for placeholder enum without valid verdict", () => {
  const placeholder = parseReviewVerdict(
    reviewVerdictJson({ verdict: "approve | changes_requested | needs_tommy | danger_gate | unable_to_review" }),
  );
  assert.equal(placeholder.verdict, "unable_to_review");
  assert.match(placeholder.blocking_findings[0], /field verdict is invalid/);
  assert.equal(placeholder.review_json_diagnostics.valid_verdict_count, 0);
  assert.equal(placeholder.review_json_diagnostics.invalid_candidate_count, 1);
});

test("review verdict parsing fails closed when JSON is not an object", () => {
  const verdict = parseReviewVerdict(`[${reviewVerdictJson()}]`);
  assert.equal(verdict.verdict, "unable_to_review");
  assert.match(verdict.blocking_findings[0], /must be a JSON object|did not contain valid verdict JSON/);
  assert.equal(verdict.review_json_diagnostics.valid_verdict_count, 0);
  assert.equal(verdict.review_json_diagnostics.invalid_candidate_count, 1);
});

test("review prompt parses only stdout response payload and ignores transcript verdicts in raw log", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-boundary-"));
  try {
    const logsRoot = path.join(tempRoot, "logs");
    mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
    const reviewer = writeFakeReviewer(tempRoot, [
      `printf '%s\\n' ${shellArg(`${reviewVerdictJson()}\nReviewer notes after JSON.`)}`,
      `printf '%s\\n' ${shellArg(`Required JSON shape:\n${reviewVerdictJson({ verdict: "approve | changes_requested | needs_tommy | danger_gate | unable_to_review" })}\nTranscript verdict:\n${reviewVerdictJson({ verdict: "changes_requested" })}`)} >&2`,
    ]);
    const result = runReviewPrompt(
      {
        dryRun: false,
        logsRoot,
        repoRoot: process.cwd(),
        reviewerCommand: reviewer,
      },
      { packagePath: path.join(tempRoot, "package.json"), summary: { issue: { number: 805 } } },
    );

    assert.equal(result.verdict.verdict, "approve");
    assert.equal(result.responsePayloadSource, "stdout");
    assert.equal(result.responsePayloadBoundary, "process.stdout");
    assert.equal(result.verdict.review_json_diagnostics.valid_verdict_count, 1);
    assert.equal(result.verdict.review_json_diagnostics.invalid_candidate_count, 0);
    assert.equal(result.rawCandidateDiagnostics.valid_verdict_count, 2);
    assert.equal(result.rawCandidateDiagnostics.invalid_candidate_count, 1);
    assert.equal(result.verdict.review_output_boundary.raw_log_path, result.logPath);
    assert.equal(result.verdict.review_output_boundary.raw_valid_verdict_count, 2);
    assert.match(readFileSync(result.logPath, "utf8"), /selected reviewer response payload: stdout/);
    assert.match(readFileSync(result.logPath, "utf8"), /reviewer stderr \/ diagnostic transcript/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review prompt still fails closed for multiple verdicts inside selected stdout payload", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-boundary-"));
  try {
    const logsRoot = path.join(tempRoot, "logs");
    mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
    const reviewer = writeFakeReviewer(tempRoot, [
      `printf '%s\\n' ${shellArg(`${reviewVerdictJson()}\n${reviewVerdictJson({ verdict: "changes_requested" })}`)}`,
    ]);
    const result = runReviewPrompt(
      {
        dryRun: false,
        logsRoot,
        repoRoot: process.cwd(),
        reviewerCommand: reviewer,
      },
      { packagePath: path.join(tempRoot, "package.json"), summary: { issue: { number: 805 } } },
    );

    assert.equal(result.verdict.verdict, "unable_to_review");
    assert.match(result.verdict.blocking_findings[0], /multiple verdict JSON objects/);
    assert.equal(result.verdict.review_json_diagnostics.valid_verdict_count, 2);
    assert.equal(result.verdict.review_output_boundary.response_payload_boundary, "process.stdout");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review prompt fails closed when stdout response boundary is missing instead of parsing stderr log", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-boundary-"));
  try {
    const logsRoot = path.join(tempRoot, "logs");
    mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
    const reviewer = writeFakeReviewer(tempRoot, [
      `printf '%s\\n' ${shellArg(`Transcript-only verdict:\n${reviewVerdictJson()}`)} >&2`,
    ]);
    const result = runReviewPrompt(
      {
        dryRun: false,
        logsRoot,
        repoRoot: process.cwd(),
        reviewerCommand: reviewer,
      },
      { packagePath: path.join(tempRoot, "package.json"), summary: { issue: { number: 805 } } },
    );

    assert.equal(result.verdict.verdict, "unable_to_review");
    assert.match(result.verdict.blocking_findings[0], /did not contain verdict JSON/);
    assert.equal(result.verdict.review_json_diagnostics.valid_verdict_count, 0);
    assert.equal(result.rawCandidateDiagnostics.valid_verdict_count, 1);
    assert.equal(result.verdict.review_output_boundary.response_payload_source, "stdout");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("generated implementation prompts prohibit implementation Codex GitHub mutation", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-task-prompt-"));
  try {
    mkdirSync(path.join(tempRoot, "repo", ".codex", "reports"), { recursive: true });
    mkdirSync(path.join(tempRoot, "logs", "tasks"), { recursive: true });
    const prompt = generateTaskPrompt(
      {
        repoRoot: path.join(tempRoot, "repo"),
        logsRoot: path.join(tempRoot, "logs"),
      },
      {
        number: 800,
        title: "Runner hardening",
        labels: ["auto-ready"],
        body: "Issue body",
        url: "https://example.invalid/800",
      },
      {
        lane: "workflow-docs-tooling",
        reason: "test",
        allowedPaths: ["tools/auto-runner/**"],
        validationProfile: "runner-tests",
        autoMergeEligible: false,
        manualMergeRequired: true,
        contract: { requiredReading: [] },
      },
      "feature/test",
    ).prompt;
    assert.match(prompt, /Do not push to any remote\./);
    assert.match(prompt, /Do not open or update pull requests\./);
    assert.match(prompt, /Do not merge\./);
    assert.match(prompt, /Do not change GitHub labels, issues, or comments\./);
    assert.match(prompt, /The runner owns explicit-path staging, commit, push, PR creation\/update, CI watching, and issue outcome labels\/comments/);
    assert.match(prompt, /Do not commit; leave intended file changes in the local checkout/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pre-review PR ownership guard is clean and non-mutating in dry-run", () => {
  const ownership = inspectPreReviewPrOwnership({ dryRun: true }, "feature/test");
  assert.equal(ownership.clean, true);
  assert.equal(ownership.remoteBranchExists, false);
  assert.deepEqual(ownership.prs, []);
  assert.equal(ownership.reason, "dry-run");
});

test("canary dry-run writes bounded evidence without GitHub mutation", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-canary-evidence-"));
  try {
    const config = {
      canary: true,
      dryRun: true,
      canaryEvidenceRoot: tempRoot,
    };
    const evidence = writeCanaryEvidence(config, {
      issue: { number: 123, title: "Canary fixture", labels: ["auto-ready"], url: "fixture://issue/123" },
      laneDecision: classifyIssueLane({
        title: "Canary fixture",
        body: contractBody(),
        labels: ["auto-ready"],
      }),
      canaryPolicy: { allowed: true, reason: "accepted" },
      changedFiles: ["tools/auto-runner/lib/canary-policy.mjs"],
      validation: { passed: true, results: [{ command: "node --test", status: 0 }] },
      review: { verdict: { verdict: "approve" } },
      pr: { url: "dry-run-preview" },
      outcome: "dry_run_preview_complete",
    });
    assert.match(evidence.evidencePath, /issue-123-canary-fixture/);
    const written = JSON.parse(readFileSync(evidence.evidencePath, "utf8"));
    assert.equal(written.selectedMode, "canary-dry-run");
    assert.equal(written.issue.number, 123);
    assert.equal(written.validation.passed, true);
    assert.equal(written.terminalOutcome, "dry_run_preview_complete");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

function createTempGitRepo() {
  const repo = mkdtempSync(path.join(tmpdir(), "settleora-auto-runner-git-"));
  mkdirSync(path.join(repo, "docs/workflow"), { recursive: true });
  mkdirSync(path.join(repo, "tools/auto-runner"), { recursive: true });
  writeFileSync(path.join(repo, "docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"), "initial\n");
  writeFileSync(path.join(repo, "tools/auto-runner/README.md"), "initial\n");
  git(repo, ["init", "--initial-branch=main"]);
  git(repo, ["config", "user.name", "Settleora Test"]);
  git(repo, ["config", "user.email", "settleora-test@example.invalid"]);
  git(repo, ["add", "--", "docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md", "tools/auto-runner/README.md"]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr || result.stdout || result.error?.message}`);
  return result;
}

function writeFakeReviewer(root, bodyLines) {
  const filePath = path.join(root, "fake-reviewer.sh");
  writeFileSync(filePath, ["#!/usr/bin/env bash", "set -euo pipefail", ...bodyLines, ""].join("\n"));
  chmodSync(filePath, 0o755);
  return filePath;
}

function readinessConfig(logsRoot) {
  mkdirSync(logsRoot, { recursive: true });
  return {
    ...baseConfig,
    repoRoot: process.cwd(),
    logsRoot,
    codexCommand: "codex-vm-full",
    trustedRealRunApproved: false,
    trustedRealRunCanaryApproved: false,
    trustedRealRunCanaryMaxIterations: 2,
    allowAutoMerge: false,
    allowFollowupIssueCreation: false,
    allowStaleClaimSteal: false,
    staleClaimAfterHours: 12,
    allowReviewFixMutation: false,
    maxReviewFixCycles: 0,
    allowSystemdEnablement: false,
    maxIterations: 1,
    canaryEvidenceRoot: path.join(logsRoot, "canary"),
    configPath: null,
  };
}

function geminiSmokeConfig(logsRoot, overrides = {}) {
  mkdirSync(path.join(logsRoot, "state"), { recursive: true });
  mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
  return {
    ...readinessConfig(logsRoot),
    reviewerBudget: {
      monthlyReviewerBudgetUsd: 80,
      monthlyReviewerHardStopUsd: 95,
      totalMonthlyAutomationBudgetUsd: 300,
      codexSubscriptionBudgetUsd: 200,
      warnAtPercent: 80,
    },
    reviewerTiers: {
      cheap_independent: {
        enabled: true,
        provider: "gemini",
        providerProfile: "gemini-cheap",
        command: null,
        model: "gemini-2.5-flash-lite",
        inputUsdPerMillionTokens: 0.1,
        outputUsdPerMillionTokens: 0.4,
      },
      strong_independent: {
        enabled: true,
        provider: "gemini",
        providerProfile: "gemini-strong",
        command: null,
        model: "gemini-2.5-pro",
        inputUsdPerMillionTokens: 1.25,
        outputUsdPerMillionTokens: 10,
      },
      tie_breaker: {
        enabled: false,
        provider: null,
        providerProfile: "unconfigured-tie-breaker",
        command: null,
        model: null,
        inputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
      },
      codex_mechanics: {
        enabled: true,
        provider: "codex",
        providerProfile: "codex-mechanics-default",
        command: "codex-vm-full",
        model: "codex-subscription",
        inputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
      },
      ...(overrides.reviewerTiers || {}),
    },
    reviewerProviderProfiles: {
      gemini: {
        provider: "gemini",
        apiKeyEnv: "GEMINI_API_KEY",
        envFilePath: null,
        defaultModel: "gemini-2.5-flash-lite",
      },
      "gemini-cheap": {
        provider: "gemini",
        apiKeyEnv: "GEMINI_API_KEY",
        envFilePath: null,
        defaultModel: "gemini-2.5-flash-lite",
      },
      "gemini-strong": {
        provider: "gemini",
        apiKeyEnv: "GEMINI_API_KEY",
        envFilePath: null,
        defaultModel: "gemini-2.5-pro",
      },
      ...(overrides.reviewerProviderProfiles || {}),
    },
    reviewerSmokeTest: {
      tier: "cheap_independent",
      maxEstimatedCostUsd: 0.05,
      envFilePath: null,
      ...(overrides.reviewerSmokeTest || {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !["reviewerTiers", "reviewerProviderProfiles", "reviewerSmokeTest"].includes(key))),
  };
}

function fakeGeminiResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function gitStatusShort() {
  return spawnSync("git", ["status", "--short"], { cwd: process.cwd(), encoding: "utf8", windowsHide: true }).stdout;
}

function createReadinessRunner(overrides = {}) {
  const commands = [];
  const activeClaims = overrides.activeClaims || [];
  const autoPrOpenedIssues = overrides.autoPrOpenedIssues || [];
  const openPrs = overrides.openPrs || [];
  const runner = (command, args) => {
    commands.push(`${command} ${args.join(" ")}`);
    if (command === "git" && args[0] === "ls-remote") return ok("2d1cbe475bf15ed2dc481d1e29b8cfc0a8c54dd3\trefs/heads/main\n");
    if (command === "git" && args[0] === "merge-base") return ok("");
    if (command === "gh" && args[0] === "--version") return ok("gh version 2.0.0\n");
    if (command === "gh" && args[0] === "auth") return ok("Logged in to github.com\n");
    if (command === "gh" && args[0] === "repo") return ok("tommytang213/Settleora\n");
    if (command === "gh" && args[0] === "issue" && args[1] === "view") {
      const number = Number(args[2]);
      return ok(
        JSON.stringify({
          number,
          state: number === 805 ? "CLOSED" : "OPEN",
          title: number === 805 ? "Auto-runner canary" : "Auto-runner foundation",
          url: `https://example.invalid/issues/${number}`,
        }),
      );
    }
    if (command === "gh" && args[0] === "issue" && args[1] === "list") {
      const search = args[args.indexOf("--search") + 1] || "";
      if (search.includes("label:auto-claimed") || search.includes("label:auto-running")) return ok(JSON.stringify(activeClaims));
      if (search.includes("label:auto-pr-opened")) return ok(JSON.stringify(autoPrOpenedIssues));
      return ok("[]");
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "list") return ok(JSON.stringify(openPrs));
    if (command === "df") return ok("Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 2000000 1 1999999 1% /workspace\n");
    return fail(`unexpected command: ${command} ${args.join(" ")}`);
  };
  runner.commands = commands;
  return runner;
}

function ok(stdout = "") {
  return { status: 0, stdout, stderr: "", error: null };
}

function fail(stderr = "") {
  return { status: 1, stdout: "", stderr, error: null };
}

function assertNoMutatingReadinessCommands(commands) {
  const joined = commands.join("\n");
  assert.doesNotMatch(joined, /\bgh issue edit\b/);
  assert.doesNotMatch(joined, /\bgh issue comment\b/);
  assert.doesNotMatch(joined, /\bgh issue create\b/);
  assert.doesNotMatch(joined, /\bgh pr create\b/);
  assert.doesNotMatch(joined, /\bgh pr merge\b/);
  assert.doesNotMatch(joined, /\bgit push\b/);
  assert.doesNotMatch(joined, /\bgit switch\b/);
  assert.doesNotMatch(joined, /\bgit commit\b/);
  assert.doesNotMatch(joined, /\bcodex-vm-full\b/);
}

function shellArg(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function contractBody(overrides = {}) {
  const contract = {
    contractVersion: 1,
    lane: "workflow-docs-tooling",
    allowedPaths: ["tools/auto-runner/**", "docs/workflow/**"],
    validationProfile: "workflow-tooling",
    manualMergeRequired: true,
    autoMergeEligible: false,
    requiredReading: [
      "PROGRAM_ARCHITECTURE.md",
      "docs/workflow/CODEX_TASK_GUIDE.md",
      "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
    ],
    ...overrides,
  };
  return `## Auto-runner contract

\`\`\`json
${JSON.stringify(contract, null, 2)}
\`\`\`
`;
}

function reviewVerdictJson(overrides = {}) {
  return JSON.stringify({
    verdict: "approve",
    confidence: "high",
    requirement_match: "pass",
    code_quality: "pass",
    scope_control: "pass",
    validation_adequacy: "pass",
    blocking_findings: [],
    non_blocking_findings: [],
    recommended_next_action: "open_pr",
    ...overrides,
  });
}
