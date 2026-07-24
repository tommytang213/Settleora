import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseCliArgs, loadConfig, normalizeAutoMergePolicy } from "../lib/config.mjs";

test("read-only observer config loading creates and chmods no project state", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-observer-config-"));
  try {
    const logsRoot = path.join(tempRoot, "observer-logs");
    const lifecycleRoot = path.join(logsRoot, "session-lifecycle");
    mkdirSync(lifecycleRoot, { recursive: true, mode: 0o755 });
    chmodSync(lifecycleRoot, 0o755);
    const configPath = path.join(tempRoot, "observer.json");
    writeFileSync(configPath, `${JSON.stringify({ logsRoot })}\n`);
    const loaded = loadConfig(
      { dryRun: true, run: false, configPath },
      { outageResubmissionObserverAvailable: true, readOnlyObserver: true },
    );
    assert.equal(loaded.logsRoot, logsRoot);
    assert.equal(statSync(lifecycleRoot).mode & 0o777, 0o755);
    assert.equal(existsSync(path.join(logsRoot, "runner-config.last.json")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
import {
  evaluateCanaryIssuePolicy,
  evaluateLowRiskAutoMergeCanaryApproval,
  evaluateProductionFollowupIssueApproval,
  evaluateReviewFixMutationApproval,
  evaluateTrustPolicy,
  writeCanaryEvidence,
} from "../lib/canary-policy.mjs";
import { parseReviewVerdict, runReviewPrompt } from "../lib/codex-runner.mjs";
import { sanitizePersistedEvidence } from "../lib/evidence-sanitizer.mjs";
import {
  createTaskBranch,
  ensureLaunchWorkspace,
  ensureTaskMutationWorkspace,
  getBoundedDiff,
  listWorkingTreeChangedFiles,
} from "../lib/git-workspace.mjs";
import {
  buildEligibleLabelSearches,
  claimIssue,
  commentIssueOutcome,
  dedupeIssuesByNumber,
  pollEligibleIssues,
  validateEligibleLabels,
} from "../lib/github-issues.mjs";
import {
  createRunIssueTracker,
  markIssueAttempted,
  markIssueProcessed,
  selectDistinctEligibleIssue,
  terminalAttemptOutcomes,
  trackerSnapshot,
  validateClaimReread,
} from "../lib/issue-selection.mjs";
import { classifyIssueLane, filterForbiddenChangedFiles, getValidationProfile, parseAutoRunnerContract } from "../lib/lane-policy.mjs";
import { runPreflight } from "../lib/preflight.mjs";
import { generateTaskPrompt } from "../lib/task-prompt.mjs";
import { inspectPreReviewPrOwnership } from "../lib/pr-manager.mjs";
import {
  buildGeminiSmokePayload,
  buildIntegratedReviewPayload,
  externalReviewVerdictJsonSchema,
  loadGeminiApiKey,
  parseIntegratedVerdict,
  resolveGeminiModelEndpoint,
  runGeminiIntegratedReview,
  runGeminiReviewerSmokeTest,
  sanitizeSecretText,
  smokeVerdictJsonSchema,
  supportedGeminiModelEndpoints,
  validateReviewerSecretMetadata,
} from "../lib/gemini-reviewer.mjs";
import {
  estimateReviewerCostUsd,
  evaluateReviewerBudget,
  reviewerReadinessSummary,
  routeReviewer,
} from "../lib/reviewer-policy.mjs";
import {
  buildIssueLinkageEvidence,
  cleanupIssueLifecycleLabels,
  evaluateExistingPrRecoveryDecision,
  evaluateAutoMergeDecision,
  evaluatePrePushReviewGate,
  shouldGenerateExistingPrRecoveryEvidence,
  executeAutoMerge,
  executeAutoMergeMergeOnly,
  normalizeAutoMergeWait,
  writeAutoMergeEvidence,
} from "../lib/auto-merge-policy.mjs";
import {
  applyControlAtSafeBoundary,
  getRunnerStatus,
  listEvents,
  listRuns,
  renderStatusText,
  writeActiveRunState,
  writeControlCommand,
} from "../lib/control-plane.mjs";
import {
  buildPostReviewFixMechanicsContext,
  buildReviewFixPrompt,
  evaluateReviewFixMutationDecision,
  extractReviewFixTrigger,
  normalizeReviewFixMutationConfig,
} from "../lib/review-fix-policy.mjs";
import { bindValidationEvidence, inferMobileBuildPlatformRequirements, mobileBuildPlatformChecks, planValidation, validationCommandCwd } from "../lib/validation-planner.mjs";
import { writeRecentSummary, writeRunSummary } from "../lib/summary-writer.mjs";
import { loadSummaryConfig, planOrdinaryRecoveryBranch } from "../settleora-auto-runner.mjs";
import { writeIterationState } from "../lib/state-store.mjs";
import { createInitialRecoveryState, writeRecoveryState } from "../lib/recovery-state.mjs";
import { autoMergeEffectsConfirmed } from "../lib/terminal-effects.mjs";
import {
  evaluateReviewFixCanaryFixtureApproval,
  normalizeReviewFixCanaryFixtureConfig,
  runReviewFixCanaryFixtureReview,
} from "../lib/review-fix-fixture.mjs";

const baseConfig = {
  dryRun: true,
  run: false,
  eligibleLabels: ["auto-ready", "auto-bundle"],
  stopLabels: ["needs-tommy", "manual-gate", "danger-gate", "auto-failed", "auto-running", "auto-pr-opened", "blocked"],
  claimLabels: ["auto-claimed", "auto-running"],
  priorityLabels: ["priority-critical", "priority-high", "priority-ready"],
  pollLimit: 30,
};

test("write-summary admits the selected project profile before choosing logsRoot", () => {
  const selected = { logsRoot: "/workspace/logs/auto-runner/AppB", projectId: "AppB" };
  let received = null;
  const result = loadSummaryConfig(
    { writeSummary: true, configPath: "/workspace/auto-runner/config/appb.json", run: true },
    (cli, capabilities) => {
      received = { cli, capabilities };
      return selected;
    },
  );
  assert.equal(result, selected);
  assert.equal(received.cli.configPath, "/workspace/auto-runner/config/appb.json");
  assert.equal(received.cli.dryRun, true);
  assert.equal(received.cli.run, false);
  assert.equal(received.capabilities.outageResubmissionObserverAvailable, true);
});

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

test("CLI parses status, event listing, and bounded control commands", () => {
  assert.equal(parseCliArgs(["--status"]).status, true);
  assert.equal(parseCliArgs(["--status", "--json"]).json, true);
  assert.equal(parseCliArgs(["--list-events", "--run", "run-123"]).eventRunId, "run-123");
  assert.equal(parseCliArgs(["--stop-after-current"]).controlCommand, "stop-after-current");
  assert.equal(parseCliArgs(["--pause"]).controlCommand, "pause");
  const extend = parseCliArgs(["--extend", "--max-iterations", "+4", "--max-runtime", "+12h"]);
  assert.equal(extend.controlCommand, "extend");
  assert.equal(extend.maxIterationsExtension, 4);
  assert.equal(extend.maxRuntimeExtensionMs, 12 * 60 * 60 * 1000);
  const maxPrs = parseCliArgs(["--dry-run", "--max-prs", "9"]);
  assert.equal(maxPrs.maxIterations, 9);
  const extendPrs = parseCliArgs(["--extend", "--max-prs", "+5"]);
  assert.equal(extendPrs.maxIterationsExtension, 5);
  assert.throws(() => parseCliArgs(["--extend", "--max-iterations", "-1"]), /explicit \+N/);
  assert.throws(() => parseCliArgs(["--extend", "--max-runtime", "12h"]), /explicit \+ duration/);
  assert.throws(() => parseCliArgs(["--extend", "--max-prs", "+999999"]), /between \+1 and \+500/);
});

test("CLI accepts supervisor correlation only for normal real runs", () => {
  const runId = "supervised-20260711T083159Z-427681e96152";
  const parsed = parseCliArgs(["--run", "--supervisor-run-id", runId]);
  assert.equal(parsed.supervisorRunId, runId);
  assert.equal(loadConfig({ ...parsed, configPath: null }).supervisorRunId, runId);
  assert.throws(() => parseCliArgs(["--run", "--supervisor-run-id", "bad"]), /Invalid supervisor run ID/);
  assert.throws(() => parseCliArgs(["--run", "--supervisor-run-id"]), /Missing value/);
  assert.throws(() => parseCliArgs(["--dry-run", "--supervisor-run-id", runId]), /only valid with a normal real --run/);
  assert.throws(() => parseCliArgs(["--preflight", "--supervisor-run-id", runId]), /only valid with a normal real --run/);
  assert.throws(() => parseCliArgs(["--status", "--supervisor-run-id", runId]), /only valid with a normal real --run/);
  assert.throws(() => parseCliArgs(["--reviewer-smoke-test", "--supervisor-run-id", runId]), /only valid with a normal real --run/);
});

test("CLI strictly parses outage recovery target numerics", () => {
  const baseTarget = targetForCliRecovery(cliRecoveryState());
  const cases = [
    {
      option: "--outage-target-issue",
      field: "issueNumber",
      valid: ["913", "9999999"],
    },
    {
      option: "--outage-target-pr",
      field: "prNumber",
      valid: ["917", "9999999"],
    },
    {
      option: "--outage-target-attempt",
      field: "attemptNumber",
      valid: ["1", "20"],
    },
  ];
  const invalidValues = [
    "913abc",
    "abc913",
    "7.9",
    "1e3",
    "+7",
    "-7",
    "0",
    "",
    " 7",
    "7 ",
    "9007199254740992",
  ];

  for (const item of cases) {
    for (const raw of item.valid) {
      const parsed = parseCliArgs(outageRecoveryCliArgs({ ...baseTarget, [item.field]: raw }));
      assert.equal(parsed.outageRecoveryTarget[item.field], Number(raw), `${item.option} accepts ${raw}`);
    }
    for (const raw of invalidValues) {
      assert.throws(
        () => parseCliArgs(outageRecoveryCliArgs({ ...baseTarget, [item.field]: raw })),
        (error) => {
          assert.match(error.message, new RegExp(item.option.replaceAll("-", "\\-")));
          if (raw.length > 0) {
            assert.equal(error.message.includes(raw), false, `${item.option} error must not echo ${raw}`);
          }
          return true;
        },
        `${item.option} rejects ${raw}`,
      );
    }
    assert.throws(
      () => {
        const argv = outageRecoveryCliArgs(baseTarget);
        argv.splice(argv.indexOf(item.option) + 1, 1);
        parseCliArgs(argv);
      },
      (error) => {
        assert.match(error.message, new RegExp(`Missing value for ${item.option.replaceAll("-", "\\-")}`));
        return true;
      },
      `${item.option} rejects missing value`,
    );
  }
});

test("malformed outage recovery target numerics exit before runner side effects", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-outage-recovery-bad-numeric-"));
  try {
    const repoRoot = path.join(tempRoot, "repo");
    const logsRoot = path.join(tempRoot, "logs");
    setupCleanRunnerLaunchRepo(repoRoot);
    const recovery = cliRecoveryState();
    const target = { ...targetForCliRecovery(recovery), issueNumber: "913abc" };
    const configPath = path.join(tempRoot, "runner-config.json");
    writeFileSync(configPath, `${JSON.stringify({ repoRoot, logsRoot, trustedRealRunApproved: true, allowExistingPrRecovery: true }, null, 2)}\n`);

    const result = spawnOutageRecoveryOnly(configPath, repoRoot, target);

    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert.match(result.stderr, /--outage-target-issue/);
    assert.equal(result.stderr.includes("913abc"), false);
    assert.equal(existsSync(logsRoot), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("recovery-only missing PR target pair exits before runner side effects", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-outage-recovery-missing-pr-"));
  try {
    const repoRoot = path.join(tempRoot, "repo");
    const logsRoot = path.join(tempRoot, "logs");
    setupCleanRunnerLaunchRepo(repoRoot);
    const recovery = cliRecoveryState();
    const target = targetForCliRecovery(recovery);
    delete target.prNumber;
    delete target.prHeadSha;
    const configPath = path.join(tempRoot, "runner-config.json");
    writeFileSync(configPath, `${JSON.stringify({ repoRoot, logsRoot, trustedRealRunApproved: true, allowExistingPrRecovery: true }, null, 2)}\n`);

    const result = spawnOutageRecoveryOnly(configPath, repoRoot, target);

    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert.match(result.stderr, /requires PR number\/head SHA/);
    assert.equal(existsSync(logsRoot), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("outage recovery-only blocked targets exit nonzero after writing summaries and cleanup", () => {
  const cases = [
    {
      name: "missing-exact-target",
      allowExistingPrRecovery: true,
      states: () => [],
      target: (recovery) => targetForCliRecovery(recovery),
      reasonCode: "outage_recovery_target_missing",
    },
    {
      name: "target-mismatch",
      allowExistingPrRecovery: true,
      states: (recovery) => [recovery],
      target: (recovery) => ({ ...targetForCliRecovery(recovery), issueNumber: 914 }),
      reasonCode: "outage_recovery_target_mismatch",
    },
    {
      name: "ambiguous-target",
      allowExistingPrRecovery: true,
      states: (recovery) => [recovery, recovery],
      target: (recovery) => targetForCliRecovery(recovery),
      reasonCode: "outage_recovery_target_ambiguous",
    },
    {
      name: "capability-disabled",
      allowExistingPrRecovery: false,
      states: (recovery) => [recovery],
      target: (recovery) => targetForCliRecovery(recovery),
      reasonCode: "recoverable_state_requires_explicit_recovery_capability",
    },
  ];

  for (const item of cases) {
    const tempRoot = mkdtempSync(path.join(tmpdir(), `settleora-outage-recovery-${item.name}-`));
    try {
      const repoRoot = path.join(tempRoot, "repo");
      const logsRoot = path.join(tempRoot, "logs");
      setupCleanRunnerLaunchRepo(repoRoot);
      const recovery = cliRecoveryState();
      const config = {
        repoRoot,
        logsRoot,
        trustedRealRunApproved: true,
        allowExistingPrRecovery: item.allowExistingPrRecovery,
      };
      let firstWritten = null;
      for (const [index, state] of item.states(recovery).entries()) {
        if (index === 1 && firstWritten) {
          const duplicatePath = path.join(path.dirname(firstWritten.statePath), `duplicate-${item.name}.json`);
          writeFileSync(duplicatePath, readFileSync(firstWritten.statePath, "utf8"), { mode: 0o600 });
          break;
        }
        firstWritten = writeRecoveryState(config, state);
      }
      const recoveryBefore = snapshotFiles(path.join(logsRoot, "recovery"));
      const configPath = path.join(tempRoot, "runner-config.json");
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

      const result = spawnOutageRecoveryOnly(configPath, repoRoot, item.target(recovery));

      assert.equal(result.status, 2, item.name);
      assert.equal(result.signal, null, item.name);
      const summary = readOnlyRunSummary(logsRoot);
      assert.equal(summary.stopReason, `recoverable-work-blocked:${item.reasonCode}`, item.name);
      assert.notEqual(summary.stopReason, "max-iterations-reached", item.name);
      assert.equal(summary.iterations.length, 1, item.name);
      assert.equal(summary.iterations[0].outcome, "blocked_recovery_state", item.name);
      assert.equal(summary.iterations[0].systemicStop, `recoverable-work-blocked:${item.reasonCode}`, item.name);
      assert.equal(summary.iterations[0].recovery.reasonCode, item.reasonCode, item.name);
      assert.equal(summary.iterations[0].poll, undefined, item.name);
      assert.equal(existsSync(path.join(logsRoot, "locks", "settleora-auto-runner.lock")), false, item.name);
      const active = JSON.parse(readFileSync(path.join(logsRoot, "state", "active-run.json"), "utf8"));
      assert.equal(active.active, false, item.name);
      assert.equal(Boolean(active.summaryPath), true, item.name);
      assert.deepEqual(snapshotFiles(path.join(logsRoot, "recovery")), recoveryBefore, item.name);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("recovery-only mandatory evidence fails before live reads and valid evidence permits continuation", () => {
  const cases = [
    ["missing", () => undefined],
    ["malformed", () => "raw-provider-payload SECRET_TOKEN"],
    ["stale-head", (e) => ({ ...e, headSha: "f".repeat(40) })],
    ["wrong-base", (e) => ({ ...e, baseSha: "f".repeat(40) })],
    ["wrong-task", (e) => ({ ...e, taskKey: "wrong-task" })],
    ["wrong-run", (e) => ({ ...e, runnerRunId: "run-2026-07-16T130000Z" })],
    ["wrong-issue", (e) => ({ ...e, issueNumber: 914 })],
    ["wrong-pr", (e) => ({ ...e, prNumber: 918 })],
    ["digest-mismatch", (e) => ({ ...e, changedFilesDigest: "f".repeat(64) })],
    ["files-mismatch", (e) => ({ ...e, changedFiles: ["tools/auto-runner/other.mjs"] })],
    ["validation-incomplete", (e) => ({ ...e, validationPassed: false })],
    ["gemini-incomplete", (e) => ({ ...e, geminiPass: false })],
    ["codex-incomplete", (e) => ({ ...e, codexMechanicsApproved: false })],
  ];
  for (const [name, mutate] of cases) {
    const tempRoot = mkdtempSync(path.join(tmpdir(), `settleora-recovery-evidence-order-${name}-`));
    try {
      const repoRoot = path.join(tempRoot, "repo");
      const logsRoot = path.join(tempRoot, "logs");
      const binRoot = path.join(tempRoot, "bin");
      const liveReadMarker = path.join(tempRoot, "live-read.marker");
      setupCleanRunnerLaunchRepo(repoRoot);
      mkdirSync(binRoot);
      writeFileSync(path.join(binRoot, "gh"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${liveReadMarker}"\nexit 71\n`);
      chmodSync(path.join(binRoot, "gh"), 0o700);
      const recovery = cliRecoveryState();
      const target = targetForCliRecovery(recovery);
      const changedFiles = ["tools/auto-runner/settleora-auto-runner.mjs"];
      const digest = createHash("sha256").update(JSON.stringify(changedFiles)).digest("hex");
      const evidence = {
        repositorySlug: "tommytang213/Settleora",
        issueNumber: target.issueNumber,
        prNumber: target.prNumber,
        baseSha: target.baseSha,
        headSha: target.prHeadSha,
        taskKey: target.taskKey,
        runnerRunId: target.runnerRunId,
        supervisorRunId: target.supervisorRunId,
        changedFiles,
        changedFilesDigest: digest,
        validationPassed: true,
        validationResults: [{ command: "node --test", status: 0 }],
        validationCompletedAt: "2026-07-16T12:00:00.000Z",
        geminiPass: true,
        geminiHeadSha: target.prHeadSha,
        geminiChangedFiles: changedFiles,
        geminiChangedFilesDigest: digest,
        geminiProvider: "gemini",
        geminiTier: "strong_independent",
        geminiCompletedAt: "2026-07-16T12:01:00.000Z",
        codexMechanicsApproved: true,
        codexMechanicsHeadSha: target.prHeadSha,
        codexMechanicsChangedFiles: changedFiles,
        codexMechanicsChangedFilesDigest: digest,
        codexMechanicsCompletedAt: "2026-07-16T12:02:00.000Z",
      };
      const config = {
        repoRoot,
        logsRoot,
        trustedRealRunApproved: true,
        allowExistingPrRecovery: true,
        existingPrRecovery: {
          [target.issueNumber]: {
            prNumber: target.prNumber,
            expectedHeadSha: target.prHeadSha,
            changedFiles,
            exactHeadEvidence: mutate(evidence),
          },
        },
      };
      writeRecoveryState(config, recovery);
      const configPath = path.join(tempRoot, "runner-config.json");
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
      const env = { ...process.env, PATH: `${binRoot}:${process.env.PATH}` };

      const first = spawnOutageRecoveryOnly(configPath, repoRoot, target, { env });
      const second = spawnOutageRecoveryOnly(configPath, repoRoot, target, { env });

      assert.equal(first.status, 2, name);
      assert.equal(second.status, 2, `${name}-retry`);
      assert.equal(existsSync(liveReadMarker), false, name);
      assert.doesNotMatch(`${first.stdout}\n${first.stderr}`, /SECRET_TOKEN|raw-provider-payload/, name);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  const source = readFileSync("tools/auto-runner/settleora-auto-runner.mjs", "utf8");
  const runnerGuard = source.indexOf("const recoveryOnlyStartupEvidenceCheck =");
  assert.ok(runnerGuard > 0);
  assert.ok(runnerGuard < source.indexOf('summary.baseOriginMainSha = getRefSha("origin/main")'));
  assert.ok(runnerGuard < source.indexOf("ensureLaunchWorkspace(config, logger)"));
  const resume = source.indexOf("async function resumeStartupRecovery");
  const guard = source.indexOf("validateRecoveryOnlyStartupEvidence(config, state)", resume);
  for (const prohibited of ["readIssueLive(config", "fetchOriginMain(config)", "inspectAutoMergeGithubState(config", "readPrChangedFiles(config"]) {
    assert.ok(guard < source.indexOf(prohibited, resume), prohibited);
  }
});

test("review package diff helper keeps approved aggregate-sized diffs complete by default", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-diff-bound-"));
  const previousCwd = process.cwd();
  try {
    runTempGit(tempRoot, ["init", "-b", "main"]);
    runTempGit(tempRoot, ["config", "user.email", "codex@example.invalid"]);
    runTempGit(tempRoot, ["config", "user.name", "Codex Test"]);
    writeFileSync(path.join(tempRoot, "large.mjs"), "export const before = true;\n");
    runTempGit(tempRoot, ["add", "large.mjs"]);
    runTempGit(tempRoot, ["commit", "-m", "base"]);
    const baseSha = runTempGit(tempRoot, ["rev-parse", "HEAD"]).stdout.trim();
    const lines = Array.from({ length: 700 }, (_item, index) => `export const generatedLine${index} = "${"x".repeat(180)}";`);
    writeFileSync(path.join(tempRoot, "large.mjs"), `${lines.join("\n")}\n`);
    runTempGit(tempRoot, ["add", "large.mjs"]);
    runTempGit(tempRoot, ["commit", "-m", "large diff"]);
    const headSha = runTempGit(tempRoot, ["rev-parse", "HEAD"]).stdout.trim();

    process.chdir(tempRoot);
    const result = getBoundedDiff(baseSha, headSha);

    assert.equal(result.text.length > 120_000, true);
    assert.equal(result.truncated, false);
    assert.match(result.text, /generatedLine699/);
  } finally {
    process.chdir(previousCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  }
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

test("canary real-run refuses unsafe mutation toggles except explicitly approved low-risk auto-merge canary", () => {
  const base = {
    ...loadConfig({
      ...parseCliArgs(["--run", "--canary"]),
      configPath: null,
    }),
    trustedRealRunCanaryApproved: true,
  };
  for (const unsafe of [
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
  const unapprovedAutoMerge = evaluateTrustPolicy({ ...base, allowAutoMerge: true });
  assert.equal(unapprovedAutoMerge.allowed, false);
  assert.match(unapprovedAutoMerge.reason, /low-risk approval/);
});

test("canary real-run allows auto-merge only for explicit external max-2 low-risk approval", () => {
  const approved = {
    ...loadConfig({
      ...parseCliArgs(["--run", "--canary", "--max-iterations", "2"]),
      configPath: null,
    }),
    configPath: "local-runner-config.json",
    trustedRealRunCanaryApproved: true,
    trustedRealRunApproved: false,
    lowRiskAutoMergeCanaryApproved: true,
    allowAutoMerge: true,
  };
  const policy = evaluateTrustPolicy(approved);
  assert.equal(policy.allowed, true);
  assert.equal(policy.autoMergeCanaryApproval.mode, "approved");

  const builtInLike = evaluateTrustPolicy({ ...approved, configPath: null });
  assert.equal(builtInLike.allowed, false);
  assert.match(builtInLike.reason, /external config path/);

  const tooMany = evaluateTrustPolicy({ ...approved, requestedMaxIterations: 3, maxIterations: 2 });
  assert.equal(tooMany.allowed, false);
  assert.match(tooMany.reason, /maxIterations must be <= 2/);
});

test("normal trusted production profile admits bounded follow-up and review-fix capabilities", () => {
  const config = {
    ...loadConfig({
      ...parseCliArgs(["--run"]),
      configPath: null,
    }),
    configPath: "/workspace/auto-runner/config/settleora.json",
    runtimeMode: "external",
    runtimeRoot: "/workspace/auto-runner/runtime",
    repoRoot: "/workspace/repos/Settleora",
    logsRoot: "/workspace/logs/auto-runner/Settleora",
    projectId: "Settleora",
    repositorySlug: "tommytang213/Settleora",
    runtimeBundleDigest: "a".repeat(64),
    runtimeIdentity: Object.freeze({
      version: 1,
      projectId: "Settleora",
      repositorySlug: "tommytang213/settleora",
      runtimeRoot: "/workspace/auto-runner/runtime",
      repoRoot: "/workspace/repos/Settleora",
      logsRoot: "/workspace/logs/auto-runner/Settleora",
      namespace: "b".repeat(64),
    }),
    runtimeManifest: Object.freeze({ bundleDigest: "a".repeat(64), sourceSha: "c".repeat(40) }),
    trustedRealRunApproved: true,
    allowAutoMerge: true,
    allowFollowupIssueCreation: true,
    allowReviewFixMutation: true,
    maxReviewFixCycles: 50,
    maxFollowupIssuesPerRun: 3,
    autoMergePolicy: { approvedLanes: ["workflow-docs-tooling"] },
    allowStaleClaimSteal: false,
    allowSystemdEnablement: false,
  };
  config.reviewFixMutation = normalizeReviewFixMutationConfig(config);
  const approval = evaluateReviewFixMutationApproval(config);
  assert.equal(approval.approved, true);
  assert.equal(approval.mode, "approved_production");
  const policy = evaluateTrustPolicy(config);
  assert.equal(policy.allowed, true);
  assert.equal(policy.mode, "normal");
  assert.equal(evaluateProductionFollowupIssueApproval(config).approved, true);
  assert.equal(evaluateTrustPolicy({ ...config, autoMergePolicy: { approvedLanes: [] } }).allowed, false);
  assert.equal(evaluateTrustPolicy({ ...config, maxFollowupIssuesPerRun: 4 }).allowed, false);
  assert.equal(evaluateTrustPolicy({ ...config, runtimeMode: "bundled", runtimeIdentity: null }).allowed, false);
  assert.equal(
    evaluateReviewFixMutationApproval({ ...config, autoMergePolicy: { approvedLanes: [] } }).approved,
    false,
  );
});

test("review-fix mutation defaults off and clamps explicit approval to fifty cycles", () => {
  const defaults = normalizeReviewFixMutationConfig({});
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.maxAttempts, 0);

  const approved = {
    ...loadConfig({
      ...parseCliArgs(["--run", "--canary", "--max-iterations", "1"]),
      configPath: null,
    }),
    configPath: "/workspace/logs/settleora-auto-runner/local-review-fix.json",
    trustedRealRunCanaryApproved: true,
    trustedRealRunApproved: false,
    lowRiskAutoMergeCanaryApproved: true,
    allowAutoMerge: true,
    allowReviewFixMutation: true,
    maxReviewFixCycles: 99,
  };
  const normalized = normalizeReviewFixMutationConfig(approved);
  assert.equal(normalized.enabled, true);
  assert.equal(normalized.maxAttempts, 50);
  assert.equal(normalized.hardMaxSourceChangingCycles, 50);
  const approval = evaluateReviewFixMutationApproval(approved);
  assert.equal(approval.approved, true);
  assert.equal(approval.mode, "approved_clamped");

  const trust = evaluateTrustPolicy({ ...approved, reviewFixMutation: normalized, maxReviewFixCycles: normalized.maxAttempts });
  assert.equal(trust.allowed, true);
  assert.equal(trust.reviewFixMutationApproval.approved, true);
});

test("built-in default config keeps review-fix canary fixture disabled", () => {
  const config = loadConfig({ ...parseCliArgs(["--dry-run"]), configPath: null });
  assert.equal(config.reviewFixCanaryFixture.enabled, false);
  assert.equal(config.reviewFixCanaryFixture.requestedEnabled, false);
  assert.equal(evaluateReviewFixCanaryFixtureApproval(config).approved, false);
});

test("status reports active run budgets, latest issue and safe control flags", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-status-"));
  try {
    mkdirSync(path.join(tempRoot, "state"), { recursive: true });
    mkdirSync(path.join(tempRoot, "summaries"), { recursive: true });
    mkdirSync(path.join(tempRoot, "locks"), { recursive: true });
    const config = { ...readinessConfig(tempRoot), maxIterations: 5 };
    const summary = {
      runId: "run-status-test",
      mode: "canary-run",
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      stopReason: null,
      logPath: path.join(tempRoot, "runner.log"),
      baseOriginMainSha: "base",
      iterations: [
        {
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          outcome: "approved_pr_opened",
          issue: { number: 839, title: "Mobile UI", url: "https://example.invalid/issues/839" },
          pr: { number: 841, url: "https://example.invalid/pull/841", headRefOid: "head841" },
          runnerCreatedCommitSha: "head841",
        },
        {
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          outcome: "validation_failed",
          issue: { number: 840, title: "Validation", url: "https://example.invalid/issues/840" },
        },
        {
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          outcome: "blocked_needs_tommy",
          issue: { number: 842, title: "Manual", url: "https://example.invalid/issues/842" },
        },
      ],
    };
    writeActiveRunState(config, summary);
    const control = writeControlCommand(config, { controlCommand: "pause" });
    assert.equal(control.ok, true);
    const status = getRunnerStatus(config);
    assert.equal(status.active, true);
    assert.equal(status.activeRunId, "run-status-test");
    assert.equal(status.maxPrs, 5);
    assert.equal(status.completedPrs, 3);
    assert.equal(status.estimatedRemainingPrs, 2);
    assert.equal(status.outcomeCounts.completed, 3);
    assert.equal(status.outcomeCounts.failed, 1);
    assert.equal(status.outcomeCounts.blocked, 1);
    assert.equal(status.currentOrLastIssue.number, 842);
    assert.equal(status.currentOrLastPr, null);
    assert.equal(status.control.pause, true);
    assert.doesNotMatch(JSON.stringify(status), /GEMINI_API_KEY|process\.env|authorization/i);
    assert.match(renderStatusText(status), /Runner active: yes/);
    assert.match(renderStatusText(status), /Outcome counts: completed=3 merged=0 failed=1 blocked=1 skipped=0/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("control commands fail gracefully without active run and apply extensions at safe boundary", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-control-"));
  try {
    mkdirSync(path.join(tempRoot, "state"), { recursive: true });
    mkdirSync(path.join(tempRoot, "summaries"), { recursive: true });
    mkdirSync(path.join(tempRoot, "locks"), { recursive: true });
    const config = readinessConfig(tempRoot);
    const missing = writeControlCommand(config, { controlCommand: "stop-after-current" });
    assert.equal(missing.ok, false);
    const summary = {
      runId: "run-control-test",
      mode: "canary-run",
      startedAt: new Date().toISOString(),
      iterations: [],
    };
    writeActiveRunState(config, summary);
    const written = writeControlCommand(config, {
      controlCommand: "extend",
      maxIterationsExtension: 3,
      maxRuntimeExtensionMs: 2 * 60 * 60 * 1000,
    });
    assert.equal(written.ok, true);
    assert.equal(config.maxIterations, 1);
    const boundary = applyControlAtSafeBoundary(config, summary);
    assert.equal(boundary.action, "continue");
    assert.equal(config.maxIterations, 4);
    assert.equal(config.maxRuntimeMs, 2 * 60 * 60 * 1000);
    const pause = writeControlCommand(config, { controlCommand: "pause" });
    assert.equal(pause.ok, true);
    assert.equal(applyControlAtSafeBoundary(config, summary).reason, "paused_by_control");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("run and event listing summarize existing summary evidence without fabrication", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-list-runs-"));
  try {
    mkdirSync(path.join(tempRoot, "summaries"), { recursive: true });
    const config = readinessConfig(tempRoot);
    const summary = {
      runId: "run-list-test",
      mode: "canary-run",
      startedAt: "2026-07-10T10:00:00.000Z",
      finishedAt: "2026-07-10T10:05:00.000Z",
      stopReason: "max-iterations-reached",
      iterations: [
        {
          startedAt: "2026-07-10T10:01:00.000Z",
          finishedAt: "2026-07-10T10:04:00.000Z",
          outcome: "auto_merged",
          branchName: "feature/auto-839-example",
          issue: { number: 839, title: "Example", url: "https://example.invalid/issues/839" },
          laneDecision: { lane: "client-ui-low-risk" },
          changedFiles: ["apps/mobile/lib/ui/example.dart"],
          runnerCreatedCommitSha: "head839",
          validation: { passed: true, results: [{ command: "git diff --check", status: 0 }] },
          externalReview: {
            status: "pass",
            provider: "gemini",
            tier: "cheap_independent",
            verdict: "pass",
            reviewedHead: "head839",
            reportPath: path.join(tempRoot, "reviews", "gemini.json"),
          },
          review: { verdict: { verdict: "approve" }, logPath: path.join(tempRoot, "reviews", "codex.log") },
          pr: { number: 841, url: "https://example.invalid/pull/841", headRefOid: "head839" },
          autoMerge: {
            result: "merged",
            reason: "github_merge_commit_completed",
            mergeSha: "merge839",
            waitAttempts: [
              { attempt: 1, reason: "required_checks_pending", checks: { state: "pending", total: 2, pending: 1, failed: 0 }, pendingCheckNames: ["CodeQL"], pendingChecksProgressing: false, elapsedMs: 0 },
              { attempt: 2, reason: "eligible", checks: { state: "success", total: 2, pending: 0, failed: 0 }, pendingCheckNames: [], pendingChecksProgressing: true, elapsedMs: 30000 },
            ],
            evidence: { evidencePath: path.join(tempRoot, "auto-merge", "839.json") },
          },
        },
      ],
    };
    writeRunSummary(config, summary);
    const runs = listRuns(config);
    assert.equal(runs[0].runId, "run-list-test");
    assert.equal(runs[0].latestIssue.number, 839);
    const events = listEvents(config, "run-list-test");
    assert.equal(events.found, true);
    assert.ok(events.events.some((item) => item.type === "review" && item.summary.includes("Independent AI review: required")));
    assert.ok(events.events.some((item) => item.type === "merge" && item.details.mergeSha === "merge839"));
    assert.ok(events.events.some((item) => item.type === "merge" && item.details.waitAttempts.length === 2));
    assert.match(renderStatusText(getRunnerStatus(config)), /PR\/iteration budget:/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("persisted run summary, iteration state, recent summary, and markdown omit raw model payloads", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-sanitized-summary-"));
  try {
    mkdirSync(path.join(tempRoot, "summaries"), { recursive: true });
    mkdirSync(path.join(tempRoot, "state"), { recursive: true });
    const config = readinessConfig(tempRoot);
    const rawOutputSentinel = "RAW_OUTPUT_SENTINEL_20260710";
    const responsePayloadSentinel = "RESPONSE_PAYLOAD_SENTINEL_20260710";
    const implementationTailSentinel = "IMPLEMENTATION_TAIL_SENTINEL_20260710";
    const providerSecretSentinel = "PROVIDER_SECRET_SENTINEL_20260710";
    const promptPath = path.join(tempRoot, "reviews", "codex-prompt.md");
    const logPath = path.join(tempRoot, "reviews", "codex.log");
    const stdoutPath = path.join(tempRoot, "reviews", "codex.stdout");
    const stderrPath = path.join(tempRoot, "reviews", "codex.stderr");
    const evidencePath = path.join(tempRoot, "reviews", "gemini.json");
    const iteration = {
      runId: "run-sanitized-test",
      index: 1,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      outcome: "auto_merged",
      issue: { number: 847, title: "Sanitize evidence", url: "https://example.invalid/issues/847" },
      laneDecision: { lane: "client-ui-low-risk" },
      changedFiles: ["tools/auto-runner/lib/summary-writer.mjs"],
      runnerCreatedCommitSha: "head-sanitized",
      validation: { passed: true, results: [{ command: "node --test tools/auto-runner/test/*.test.mjs", status: 0 }] },
      codex: {
        skipped: false,
        status: 0,
        signal: null,
        logPath: path.join(tempRoot, "codex-runs", "implementation.log"),
        tail: implementationTailSentinel,
      },
      externalReview: {
        status: "pass",
        reason: "integrated_review_passed",
        verdict: "pass",
        provider: "gemini",
        tier: "cheap_independent",
        model: "gemini-2.5-flash-lite",
        reviewedHead: "head-sanitized",
        changedFiles: ["tools/auto-runner/lib/summary-writer.mjs"],
        reportPath: evidencePath,
        rawRequest: providerSecretSentinel,
        rawResponse: providerSecretSentinel,
        authorization: providerSecretSentinel,
        nested: { apiKey: providerSecretSentinel, safeNumber: 7, safeBoolean: false, safeNull: null },
      },
      review: {
        skipped: false,
        promptPath,
        logPath,
        stdoutPath,
        stderrPath,
        status: 0,
        signal: null,
        rawOutput: rawOutputSentinel,
        responsePayload: responsePayloadSentinel,
        responsePayloadSource: "stdout",
        responsePayloadBoundary: "process.stdout",
        rawCandidateDiagnostics: { valid_verdict_count: 1, invalid_candidate_count: 0, saw_json: true },
        reviewStatus: "passed",
        reviewFailureCategory: null,
        reviewFailureReason: null,
        attempts: [
          {
            status: 0,
            signal: null,
            logPath,
            stdoutPath,
            stderrPath,
            responsePayloadSource: "stdout",
            responsePayloadBoundary: "process.stdout",
            reviewStatus: "passed",
            rawValidVerdictCount: 1,
            rawInvalidCandidateCount: 0,
          },
        ],
        attemptCount: 1,
        reviewedHead: "head-sanitized",
        changedFiles: ["tools/auto-runner/lib/summary-writer.mjs"],
        verdict: {
          verdict: "approve",
          confidence: "medium",
          review_output_boundary: { raw_log_path: logPath, raw_valid_verdict_count: 1, raw_invalid_candidate_count: 0 },
        },
      },
      reviewPackage: {
        packagePath: path.join(tempRoot, "reviews", "package.json"),
        summary: {
          currentHead: "head-sanitized",
          changedFiles: ["tools/auto-runner/lib/summary-writer.mjs"],
          validation: { passed: true },
          diffTruncated: false,
        },
        diff: "diff --git SENTINEL_DIFF_RAW",
      },
      autoMerge: {
        result: "merged",
        reason: "github_merge_commit_completed",
        mergeSha: "merge-sanitized",
        issueLabelCleanupResult: {
          status: "passed",
          labelsFound: ["workflow", "auto-running"],
          labelsRemoved: ["auto-running"],
          commandStatus: { view: { status: 0, error: null }, remove: { status: 0, error: null } },
        },
      },
      numbers: [1, 2],
      booleans: [true, false],
      nullValue: null,
    };
    const original = structuredClone(iteration);
    const summary = {
      runId: "run-sanitized-test",
      mode: "canary-run",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      stopReason: "max-iterations-reached",
      iterations: [iteration],
    };
    const paths = writeRunSummary(config, summary);
    const statePath = writeIterationState(config, iteration);
    const summaryText = readFileSync(paths.jsonPath, "utf8");
    const stateText = readFileSync(statePath, "utf8");
    const markdownText = readFileSync(paths.markdownPath, "utf8");

    for (const text of [summaryText, stateText, markdownText]) {
      assert.doesNotMatch(text, new RegExp(rawOutputSentinel));
      assert.doesNotMatch(text, new RegExp(responsePayloadSentinel));
      assert.doesNotMatch(text, new RegExp(implementationTailSentinel));
      assert.doesNotMatch(text, new RegExp(providerSecretSentinel));
      assert.doesNotMatch(text, /SENTINEL_DIFF_RAW/);
    }
    const persisted = JSON.parse(summaryText);
    const persistedIteration = persisted.iterations[0];
    assert.equal(persistedIteration.review.rawEvidence.rawPayloadPersisted, false);
    assert.equal(persistedIteration.review.promptPath, promptPath);
    assert.equal(persistedIteration.review.logPath, logPath);
    assert.equal(persistedIteration.review.attemptCount, 1);
    assert.equal(persistedIteration.review.reviewStatus, "passed");
    assert.equal(persistedIteration.review.verdict.verdict, "approve");
    assert.equal(persistedIteration.externalReview.status, "pass");
    assert.equal(persistedIteration.externalReview.provider, "gemini");
    assert.equal(persistedIteration.externalReview.reportPath, evidencePath);
    assert.deepEqual(persistedIteration.changedFiles, ["tools/auto-runner/lib/summary-writer.mjs"]);
    assert.equal(persistedIteration.validation.passed, true);
    assert.deepEqual(persistedIteration.numbers, [1, 2]);
    assert.deepEqual(persistedIteration.booleans, [true, false]);
    assert.equal(persistedIteration.nullValue, null);
    assert.deepEqual(iteration, original);

    writeFileSync(
      path.join(tempRoot, "summaries", "run-old-unsanitized.json"),
      `${JSON.stringify({ ...summary, runId: "run-old-unsanitized", iterations: [{ ...iteration, outcome: "blocked_needs_tommy" }] }, null, 2)}\n`,
    );
    const recent = writeRecentSummary(config, 60 * 60 * 1000);
    const recentText = `${readFileSync(recent.jsonPath, "utf8")}\n${readFileSync(recent.markdownPath, "utf8")}`;
    assert.doesNotMatch(recentText, new RegExp(rawOutputSentinel));
    assert.doesNotMatch(recentText, new RegExp(responsePayloadSentinel));
    assert.ok(listRuns(config).some((run) => run.runId === "run-sanitized-test"));
    const events = listEvents(config, "run-sanitized-test");
    assert.equal(events.found, true);
    assert.doesNotMatch(JSON.stringify(events), new RegExp(rawOutputSentinel));
    assert.ok(events.events.some((item) => item.type === "merge" && item.details.issueLabelCleanupResult.status === "passed"));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("run summaries preserve bounded supervisor correlation metadata", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-supervisor-summary-"));
  try {
    mkdirSync(path.join(tempRoot, "summaries"), { recursive: true });
    const config = readinessConfig(tempRoot);
    const supervisorRunId = "supervised-20260711T083159Z-427681e96152";
    const paths = writeRunSummary(config, {
      runId: "run-2026-07-11T083209Z",
      supervisorRunId,
      mode: "canary-run",
      startedAt: "2026-07-11T08:32:09.378Z",
      finishedAt: "2026-07-11T08:32:10.847Z",
      baseOriginMainSha: "a".repeat(40),
      iterations: [],
      stopReason: "no-eligible-work",
    });
    const json = JSON.parse(readFileSync(paths.jsonPath, "utf8"));
    const markdown = readFileSync(paths.markdownPath, "utf8");
    assert.equal(json.supervisorRunId, supervisorRunId);
    assert.match(markdown, new RegExp(`Supervisor run ID: \`${supervisorRunId}\``));

    const unsupervised = writeRunSummary(config, {
      runId: "run-2026-07-11T083210Z",
      mode: "run",
      startedAt: "2026-07-11T08:32:10.000Z",
      finishedAt: "2026-07-11T08:32:11.000Z",
      iterations: [],
      stopReason: "no-eligible-work",
    });
    assert.equal(JSON.parse(readFileSync(unsupervised.jsonPath, "utf8")).supervisorRunId, undefined);
    assert.match(readFileSync(unsupervised.markdownPath, "utf8"), /Supervisor run ID: none/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review-fix canary fixture requires external canary real-run approvals and review-fix mutation approval", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fixture-approval-"));
  try {
    const base = fixtureConfig(tempRoot, {
      run: true,
      dryRun: false,
      canary: true,
      configPath: "/workspace/logs/settleora-auto-runner/local-fixture.json",
    });
    assert.equal(evaluateReviewFixCanaryFixtureApproval(base).approved, true);
    assert.equal(evaluateReviewFixCanaryFixtureApproval({ ...base, trustedRealRunCanaryApproved: false }).approved, false);
    assert.equal(evaluateReviewFixCanaryFixtureApproval({ ...base, trustedRealRunApproved: true }).approved, false);
    assert.equal(evaluateReviewFixCanaryFixtureApproval({ ...base, allowAutoMerge: false }).approved, false);
    assert.equal(evaluateReviewFixCanaryFixtureApproval({ ...base, allowReviewFixMutation: false }).approved, false);
    assert.equal(evaluateReviewFixCanaryFixtureApproval({ ...base, run: false, dryRun: true }).approved, false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review-fix canary fixture malformed config fails closed", () => {
  const config = {
    configPath: "/workspace/logs/settleora-auto-runner/local-fixture.json",
    reviewFixCanaryFixture: { enabled: true, marker: "bad\nmarker" },
  };
  const normalized = normalizeReviewFixCanaryFixtureConfig(config);
  assert.equal(normalized.enabled, false);
  assert.equal(normalized.malformed, true);
  assert.match(normalized.reason, /marker/);
});

test("review-fix canary fixture allows only low-risk lanes and blocks broad or dangerous paths", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fixture-paths-"));
  try {
    const config = fixtureConfig(tempRoot);
    const broad = runReviewFixCanaryFixtureReview(config, workflowReviewPackage({
      laneDecision: reviewFixLaneDecision({ allowedPaths: ["docs/**"] }),
      changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
    }));
    assert.match(broad.reason, /unsafe_contract_allowed_path/);

    const dangerous = runReviewFixCanaryFixtureReview(config, workflowReviewPackage({
      laneDecision: reviewFixLaneDecision({ allowedPaths: ["services/api/Auth/Foo.cs"] }),
      changedFiles: ["services/api/Auth/Foo.cs"],
    }));
    assert.match(dangerous.reason, /unsafe_contract_allowed_path|forbidden_changed_files/);

    const productLane = runReviewFixCanaryFixtureReview(config, workflowReviewPackage({
      laneDecision: { ...reviewFixLaneDecision({ allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"] }), lane: "product-runtime" },
      changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
    }));
    assert.equal(productLane.reason, "lane_not_review_fix_fixture_approved");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review-fix canary fixture emits actionable fail when marker is absent and pass when present", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fixture-marker-"));
  const repo = createTempGitRepo();
  try {
    const changedFile = "docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md";
    const config = fixtureConfig(tempRoot, { repoRoot: repo });
    const packageInfo = workflowReviewPackage({
      changedFiles: [changedFile],
      laneDecision: reviewFixLaneDecision({ allowedPaths: [changedFile] }),
      summary: { validation: { passed: true, results: [] }, issue: { number: 902, title: "Fixture marker", labels: ["auto-canary-ready"], url: "https://example.invalid/902" } },
    });
    writeFileSync(path.join(repo, changedFile), "canary checkpoint without marker\n");
    const failResult = runReviewFixCanaryFixtureReview(config, packageInfo, { phase: "pre-fix" });
    assert.equal(failResult.status, "blocked");
    assert.equal(failResult.reason, "blocked_external_reviewer_non_pass");
    assert.equal(failResult.sanitizedResponseSummary.verdict, "fail");
    assert.equal(failResult.findingCount, 1);

    writeFileSync(path.join(repo, changedFile), "canary checkpoint\nreview-fix-cycle: completed\n");
    const passResult = runReviewFixCanaryFixtureReview(config, packageInfo, { phase: "post-fix" });
    assert.equal(passResult.status, "pass");
    assert.equal(passResult.reason, "review_fix_canary_fixture_marker_present");
    assert.equal(passResult.sanitizedResponseSummary.verdict, "pass");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("review-fix loop accepts fixture actionable finding only in explicit fixture mode", () => {
  const fixtureReview = {
    status: "blocked",
    reason: "blocked_external_reviewer_non_pass",
    provider: "review_fix_canary_fixture",
    sanitizedResponseSummary: {
      verdict: "fail",
      confidence: "high",
      summary: "marker absent",
      findings: ["Add marker."],
    },
  };
  const trigger = extractReviewFixTrigger({ externalReview: fixtureReview });
  assert.equal(trigger.actionable, true);
  assert.equal(trigger.source, "review_fix_canary_fixture");

  const config = {
    configPath: "/workspace/logs/settleora-auto-runner/local-review-fix.json",
    allowReviewFixMutation: true,
    allowAutoMerge: true,
    lowRiskAutoMergeCanaryApproved: true,
    trustedRealRunCanaryApproved: true,
    trustedRealRunApproved: false,
    maxReviewFixCycles: 1,
    reviewFixMutation: { enabled: true, maxAttempts: 1 },
    reviewFixCanaryFixture: { requestedEnabled: false, enabled: false },
  };
  const decision = evaluateReviewFixMutationDecision({
    config,
    issue: { number: 903, title: "Fixture disabled", labels: [], url: "https://example.invalid/903" },
    laneDecision: reviewFixLaneDecision({ allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"] }),
    changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
    validation: { passed: true },
    externalReview: fixtureReview,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "review_fix_fixture_trigger_without_fixture_mode");
});

test("review-fix canary fixture evidence is sanitized and omits raw marker and secrets", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-fixture-evidence-"));
  const repo = createTempGitRepo();
  try {
    const changedFile = "docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md";
    const config = fixtureConfig(tempRoot, { repoRoot: repo });
    writeFileSync(path.join(repo, changedFile), "missing configured marker\n");
    const result = runReviewFixCanaryFixtureReview(config, workflowReviewPackage({
      changedFiles: [changedFile],
      laneDecision: reviewFixLaneDecision({ allowedPaths: [changedFile] }),
      summary: { validation: { passed: true, results: [] }, issue: { number: 904, title: "Secret token fixture", labels: [], url: "https://example.invalid/904" } },
    }));
    const evidence = readFileSync(result.reportPath, "utf8");
    assert.match(evidence, /review-fix-cycle-completed/);
    assert.doesNotMatch(evidence, /review-fix-cycle: completed/);
    assert.doesNotMatch(evidence, /GEMINI_API_KEY|super-secret-token|authorization/i);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("post-review-fix mechanics context labels stale initial report and prioritizes final fixture pass", () => {
  const context = buildPostReviewFixMechanicsContext({
    issue: { number: 835, title: "Review-fix fixture canary", url: "https://example.invalid/835" },
    laneDecision: { lane: "workflow-docs-tooling" },
    trigger: {
      actionable: true,
      source: "review_fix_canary_fixture",
      verdict: "fail",
      findings: ["Configured review-fix canary fixture marker is absent."],
    },
    decision: {
      allowed: true,
      reason: "review_fix_mutation_gates_passed",
      maxAttempts: 1,
      attemptCount: 0,
    },
    changedFilesBefore: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
    changedFilesAfter: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
    forbiddenChangedFilesAfter: [],
    validationAfter: {
      passed: true,
      results: [{ command: "npm run validate:docs", status: 0 }],
    },
    externalReviewAfter: {
      status: "pass",
      reason: "review_fix_canary_fixture_marker_present",
      verdict: "pass",
      provider: "review_fix_canary_fixture",
      tier: "review_fix_canary_fixture",
      phase: "post-fix",
      markerId: "review-fix-cycle-completed",
      findingCount: 0,
      reviewedHead: "abc123",
      changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
      issue: { number: 835 },
    },
    preFixReport: {
      found: true,
      expectedPath: ".codex/reports/initial.md",
      copyPath: "/workspace/logs/settleora-auto-runner/reports/initial.md",
      statusMentioned: true,
      summary: "Initial implementation report says the marker was not added.",
    },
    currentHead: "abc123",
  });

  assert.equal(context.ok, true);
  assert.equal(context.context.phase, "post_review_fix_mechanics");
  assert.equal(context.context.authoritativeStatus, "post_fix_validation_and_final_review_passed");
  assert.equal(context.context.preFixReport.role, "pre_fix_report");
  assert.equal(context.context.preFixReport.staleAfterReviewFix, true);
  assert.match(context.context.preFixReport.reviewerInstruction, /background only/);
  assert.equal(context.context.finalIntegratedReview.status, "pass");
  assert.equal(context.context.finalIntegratedReview.markerId, "review-fix-cycle-completed");
  assert.match(context.context.reviewerInstruction, /Do not fail solely because preFixReport/);
  assert.doesNotMatch(JSON.stringify(context.context), /review-fix-cycle: completed/);
});

test("post-review-fix mechanics context fails closed without current final review evidence", () => {
  const base = {
    issue: { number: 835, title: "Review-fix fixture canary" },
    laneDecision: { lane: "workflow-docs-tooling" },
    trigger: { actionable: true, source: "review_fix_canary_fixture", verdict: "fail", findings: ["marker absent"] },
    decision: { allowed: true, reason: "review_fix_mutation_gates_passed" },
    changedFilesBefore: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
    changedFilesAfter: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
    forbiddenChangedFilesAfter: [],
    validationAfter: { passed: true, results: [] },
    currentHead: "abc123",
  };

  const missing = buildPostReviewFixMechanicsContext(base);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "post_fix_context_missing_final_integrated_review");

  const staleHead = buildPostReviewFixMechanicsContext({
    ...base,
    externalReviewAfter: {
      status: "pass",
      reason: "review_fix_canary_fixture_marker_present",
      verdict: "pass",
      changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
      issue: { number: 835 },
      reviewedHead: "stale",
    },
  });
  assert.equal(staleHead.ok, false);
  assert.equal(staleHead.reason, "post_fix_context_final_review_head_mismatch");

  const wrongFiles = buildPostReviewFixMechanicsContext({
    ...base,
    externalReviewAfter: {
      status: "pass",
      reason: "review_fix_canary_fixture_marker_present",
      verdict: "pass",
      changedFiles: ["tools/auto-runner/lib/review-fix-policy.mjs"],
      issue: { number: 835 },
      reviewedHead: "abc123",
    },
  });
  assert.equal(wrongFiles.ok, false);
  assert.equal(wrongFiles.reason, "post_fix_context_final_review_files_mismatch");
});

test("review-fix mutation decision requires actionable low-risk auto-merge contract and safe files", () => {
  const issue = {
    number: 900,
    title: "Review fix canary",
    labels: ["auto-canary-ready"],
    url: "https://example.invalid/issues/900",
  };
  const laneDecision = reviewFixLaneDecision({
    allowedPaths: ["tools/auto-runner/lib/review-fix-policy.mjs"],
  });
  const config = {
    configPath: "/workspace/logs/settleora-auto-runner/local-review-fix.json",
    allowReviewFixMutation: true,
    allowAutoMerge: true,
    lowRiskAutoMergeCanaryApproved: true,
    trustedRealRunCanaryApproved: true,
    trustedRealRunApproved: false,
    allowFollowupIssueCreation: false,
    allowStaleClaimSteal: false,
    allowSystemdEnablement: false,
    maxReviewFixCycles: 1,
  };
  const decision = evaluateReviewFixMutationDecision({
    config: { ...config, reviewFixMutation: normalizeReviewFixMutationConfig(config) },
    issue,
    laneDecision,
    changedFiles: ["tools/auto-runner/lib/review-fix-policy.mjs"],
    validation: { passed: true },
    review: {
      verdict: {
        verdict: "changes_requested",
        recommended_next_action: "run_safe_fix_cycle",
        blocking_findings: ["Tighten the policy guard."],
      },
    },
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "review_fix_mutation_gates_passed");

  const productionConfig = {
    ...config,
    ...productionRuntimeEvidence(),
    trustedRealRunCanaryApproved: false,
    trustedRealRunApproved: true,
    lowRiskAutoMergeCanaryApproved: false,
    allowFollowupIssueCreation: true,
    autoMergePolicy: { approvedLanes: [laneDecision.canonicalLane || laneDecision.lane] },
  };
  const productionDecision = evaluateReviewFixMutationDecision({
    config: { ...productionConfig, reviewFixMutation: normalizeReviewFixMutationConfig(productionConfig) },
    issue,
    laneDecision,
    changedFiles: ["tools/auto-runner/lib/review-fix-policy.mjs"],
    validation: { passed: true },
    review: {
      verdict: {
        verdict: "changes_requested",
        recommended_next_action: "run_safe_fix_cycle",
        blocking_findings: ["Tighten the production policy guard."],
      },
    },
  });
  assert.equal(productionDecision.allowed, true);
  assert.equal(productionDecision.reason, "review_fix_mutation_gates_passed");

  const broad = evaluateReviewFixMutationDecision({
    config: { ...config, reviewFixMutation: normalizeReviewFixMutationConfig(config) },
    issue,
    laneDecision: reviewFixLaneDecision({ allowedPaths: ["docs/**"] }),
    changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
    validation: { passed: true },
    review: {
      verdict: {
        verdict: "changes_requested",
        recommended_next_action: "run_safe_fix_cycle",
        blocking_findings: ["Fix docs."],
      },
    },
  });
  assert.match(broad.reason, /unsafe_contract_allowed_path/);
});

test("review-fix mutation blocks stop labels and non-actionable reviewer output while allowing trusted approved runs", () => {
  const config = {
    configPath: "/workspace/logs/settleora-auto-runner/local-review-fix.json",
    allowReviewFixMutation: true,
    allowAutoMerge: true,
    lowRiskAutoMergeCanaryApproved: true,
    trustedRealRunCanaryApproved: true,
    trustedRealRunApproved: false,
    maxReviewFixCycles: 1,
    reviewFixMutation: { enabled: true, maxAttempts: 1 },
  };
  const common = {
    config,
    issue: { number: 901, title: "Review fix blocked", labels: [], url: "https://example.invalid/issues/901" },
    laneDecision: reviewFixLaneDecision({ allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"] }),
    changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
    validation: { passed: true },
    review: {
      verdict: {
        verdict: "changes_requested",
        recommended_next_action: "run_safe_fix_cycle",
        blocking_findings: ["Fix the review finding."],
      },
    },
  };
  assert.match(evaluateReviewFixMutationDecision({ ...common, issue: { ...common.issue, labels: ["blocked"] } }).reason, /issue_stop_label/);
  assert.equal(evaluateReviewFixMutationDecision({
    ...common,
    config: {
      ...config,
      ...productionRuntimeEvidence(),
      trustedRealRunApproved: true,
      autoMergePolicy: { approvedLanes: [common.laneDecision.canonicalLane || common.laneDecision.lane] },
    },
  }).allowed, true);
  assert.match(
    evaluateReviewFixMutationDecision({
      ...common,
      review: {
        verdict: {
          verdict: "unable_to_review",
          recommended_next_action: "mark_auto_failed",
          blocking_findings: ["Malformed output."],
        },
      },
    }).reason,
    /codex_review_not_actionable/,
  );
});

test("preflight reports trusted run and canary refusal state", () => {
  const result = runPreflight({
    ...baseConfig,
    repoRoot: process.cwd(),
    logsRoot: "/workspace/logs/settleora-auto-runner",
    codexCommand: "codex-vm-full",
    trustedRealRunApproved: false,
    trustedRealRunCanaryApproved: false,
    lowRiskAutoMergeCanaryApproved: false,
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
  assert.match(canary.detail, /lowRiskAutoMergeCanaryApproved/);
});

test("preflight reports canary enabled state when approved", () => {
  const result = runPreflight({
    ...baseConfig,
    repoRoot: process.cwd(),
    logsRoot: "/workspace/logs/settleora-auto-runner",
    codexCommand: "codex-vm-full",
    trustedRealRunApproved: false,
    trustedRealRunCanaryApproved: true,
    lowRiskAutoMergeCanaryApproved: false,
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
    assert.doesNotMatch(readFileSync(result.readinessReports.markdownPath, "utf8"), /#888|#889/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("readiness preflight uses durable foundation completion and ignores later tracker closure", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-readiness-foundation-"));
  try {
    const runner = createReadinessRunner({ issueStates: { 800: "CLOSED", 805: "CLOSED", 910: "CLOSED" } });
    const result = runPreflight(readinessConfig(tempRoot), { runner });
    assert.equal(result.summary.fail, 0);
    assert.equal(result.checks.find((check) => check.name === "issue-800-state").status, "pass");
    assert.equal(result.checks.find((check) => check.name === "issue-910-state"), undefined);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("readiness preflight binds every GitHub read to a non-Settleora repository", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "appb-readiness-repository-"));
  try {
    const repositorySlug = "example/AppB";
    const runner = createReadinessRunner({ repositorySlug });
    const result = runPreflight({ ...readinessConfig(tempRoot), repositorySlug }, { runner });
    assert.equal(result.repo, repositorySlug);
    assert.equal(result.summary.fail, 0);
    assert.equal(result.checks.some((check) => check.name === "issue-800-state" || check.name === "issue-805-state"), false);
    const githubReads = runner.commands.filter((command) => command.startsWith("gh ") && !command.startsWith("gh --version") && !command.startsWith("gh auth "));
    assert.ok(githubReads.length > 0);
    assert.equal(githubReads.every((command) => command.includes(repositorySlug)), true);
    assert.equal(githubReads.some((command) => command.includes("tommytang213/Settleora")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("readiness preflight fails on foundation regression and GitHub issue polling failures", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-readiness-foundation-regression-"));
  try {
    const foundationRegression = runPreflight(readinessConfig(tempRoot), {
      runner: createReadinessRunner({ issueStates: { 800: "OPEN", 805: "CLOSED" } }),
    });
    assert.equal(foundationRegression.checks.find((check) => check.name === "issue-800-state").status, "fail");

    const githubFailure = runPreflight(readinessConfig(tempRoot), {
      runner: createReadinessRunner({ failIssueList: true }),
    });
    assert.equal(githubFailure.checks.find((check) => check.name === "github-issue-polling").status, "fail");
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
    assert.equal(result.checks.find((check) => check.name === "auto-merge-approved-domain-policy").status, "fail");
    assert.equal(result.checks.find((check) => check.name === "stale-claim-stealing-disabled").status, "fail");
    assert.equal(result.checks.find((check) => check.name === "config-parseable").status, "fail");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("readiness preflight distinguishes approved low-risk auto-merge canary config", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-readiness-auto-merge-canary-"));
  try {
    const result = runPreflight(
      {
        ...readinessConfig(tempRoot),
        configPath: "/workspace/logs/settleora-auto-runner/local-low-risk-canary.json",
        allowAutoMerge: true,
        trustedRealRunCanaryApproved: true,
        trustedRealRunApproved: false,
        lowRiskAutoMergeCanaryApproved: true,
        requestedMaxIterations: 2,
        maxIterations: 2,
      },
      { runner: createReadinessRunner() },
    );
    assert.equal(result.checks.find((check) => check.name === "config-parseable").status, "pass");
    const autoMerge = result.checks.find((check) => check.name === "auto-merge-approved-domain-policy");
    assert.equal(autoMerge.status, "pass");
    assert.match(autoMerge.detail, /explicit config-scoped low-risk auto-merge canary approval/);
    const canary = result.checks.find((check) => check.name === "trusted-real-run-canary-policy");
    assert.equal(canary.status, "pass");
    assert.match(canary.detail, /"autoMergeCanaryApproval"/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("readiness preflight rejects unsafe auto-merge config without canary approval", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-readiness-unsafe-auto-merge-"));
  try {
    const result = runPreflight(
      {
        ...readinessConfig(tempRoot),
        configPath: "/workspace/logs/settleora-auto-runner/local-unsafe.json",
        allowAutoMerge: true,
        trustedRealRunCanaryApproved: true,
      },
      { runner: createReadinessRunner() },
    );
    assert.equal(result.checks.find((check) => check.name === "config-parseable").status, "fail");
    assert.equal(result.checks.find((check) => check.name === "auto-merge-approved-domain-policy").status, "fail");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("readiness preflight accepts explicit approved-domain auto-merge config without low-risk canary approval", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-readiness-approved-domain-auto-merge-"));
  try {
    const result = runPreflight(
      {
        ...readinessConfig(tempRoot),
        configPath: "/workspace/logs/settleora-auto-runner/local-approved-domain.json",
        allowAutoMerge: true,
        autoMergePolicy: {
          approvedLanes: ["api-domain-runtime"],
          requiredChecks: ["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"],
          allowedSkippedChecks: [],
          allowedNeutralChecks: [],
        },
      },
      { runner: createReadinessRunner() },
    );
    const autoMerge = result.checks.find((check) => check.name === "auto-merge-approved-domain-policy");
    assert.equal(autoMerge.status, "pass");
    assert.match(autoMerge.detail, /approved-domain auto-merge config is explicit/);
    assert.doesNotMatch(autoMerge.detail, /low-risk auto-merge canary approval/);
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

test("reviewer routing never downgrades lane-required strong tier", () => {
  const route = routeReviewer({
    changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
    laneDecision: {
      lane: "workflow-docs-tooling",
      reviewerTier: "strong_independent",
      implementationSensitivity: "high",
    },
  });
  assert.equal(route.tier, "strong_independent");
  assert.equal(route.laneRequiredTier, "strong_independent");
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

test("Gemini smoke and integrated payloads include strict response schemas", () => {
  const integratedSchema = externalReviewVerdictJsonSchema();
  assert.deepEqual(integratedSchema.required, ["verdict", "confidence", "summary", "findings"]);
  assert.equal(integratedSchema.additionalProperties, false);
  assert.deepEqual(integratedSchema.propertyOrdering, ["verdict", "confidence", "summary", "findings"]);
  assert.deepEqual(integratedSchema.properties.verdict.enum, ["pass", "fail", "needs_tommy", "danger_gate", "unable_to_review"]);
  assert.deepEqual(integratedSchema.properties.confidence.enum, ["low", "medium", "high"]);
  assert.equal(integratedSchema.properties.findings.maxItems, 20);

  const integratedPayload = buildIntegratedReviewPayload("review prompt");
  assert.equal(integratedPayload.generationConfig.temperature, 0);
  assert.equal(integratedPayload.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(integratedPayload.generationConfig.responseJsonSchema, integratedSchema);
  assert.equal(integratedPayload.generationConfig.thinkingConfig.thinkingBudget, 0);

  const smokeSchema = smokeVerdictJsonSchema();
  assert.deepEqual(smokeSchema.required, ["verdict", "findings"]);
  assert.equal(smokeSchema.additionalProperties, false);
  assert.deepEqual(smokeSchema.properties.verdict.enum, ["pass", "fail"]);
  const smokePayload = buildGeminiSmokePayload();
  assert.equal(smokePayload.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(smokePayload.generationConfig.responseJsonSchema, smokeSchema);
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

test("Gemini smoke test rejects unsupported model names before external API call", async () => {
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
    assert.equal(result.reason, "blocked_unsupported_gemini_model");
    assert.equal(calls, 0);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Gemini model config resolves only to fixed Google endpoint constants", async () => {
  assert.deepEqual(Object.keys(supportedGeminiModelEndpoints).sort(), [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-3.1-pro-preview",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-pro-latest",
  ]);
  for (const [model, endpoint] of Object.entries(supportedGeminiModelEndpoints)) {
    assert.equal(resolveGeminiModelEndpoint(model), endpoint);
    const parsed = new URL(endpoint);
    assert.equal(parsed.origin, "https://generativelanguage.googleapis.com");
    assert.equal(parsed.pathname, `/v1beta/models/${model}:generateContent`);
  }
  for (const unsupported of [
    "gemini-2.5-flash/../../metadata",
    "gemini-2.5-flash?key=attacker",
    "https://metadata.invalid/v1beta/models/gemini-2.5-flash",
    "//metadata.invalid/v1beta/models/gemini-2.5-flash",
  ]) {
    assert.equal(resolveGeminiModelEndpoint(unsupported), null);
  }
  assert.equal(
    resolveGeminiModelEndpoint("gemini-pro-latest"),
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent",
  );
});

test("Gemini smoke sends API key only in headers, never URL or evidence", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-header-key-"));
  try {
    let capturedUrl = null;
    let capturedHeader = null;
    const result = await runGeminiReviewerSmokeTest(geminiSmokeConfig(tempRoot), {
      liveExternalReviewerCalls: true,
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async (url, init) => {
        capturedUrl = String(url);
        capturedHeader = init.headers["x-goog-api-key"];
        return fakeGeminiResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict: "pass", findings: [] }) }] } }] });
      },
    });
    assert.equal(result.status, "pass");
    assert.equal(capturedHeader, "super-secret-key");
    assert.doesNotMatch(capturedUrl, /super-secret-key|key=/);
    assert.doesNotMatch(readFileSync(result.reportPath, "utf8"), /super-secret-key/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Gemini approved secret metadata rejects unsafe files without reading values", () => {
  const secretRoot = "/workspace/logs/settleora-auto-runner/secrets";
  const projectSecretRoot = "/workspace/logs/auto-runner/Settleora/secrets";
  const filePath = path.join(secretRoot, `reviewer-test-${process.pid}-${Date.now()}.env`);
  const projectFilePath = path.join(projectSecretRoot, `reviewer-test-${process.pid}-${Date.now()}.env`);
  const symlinkTarget = mkdtempSync(path.join(tmpdir(), "settleora-reviewer-secret-target-"));
  const symlinkDir = path.join(projectSecretRoot, `reviewer-link-${process.pid}-${Date.now()}`);
  const symlinkFilePath = path.join(symlinkDir, "reviewer.env");
  mkdirSync(secretRoot, { recursive: true, mode: 0o700 });
  mkdirSync(projectSecretRoot, { recursive: true, mode: 0o700 });
  writeFileSync(filePath, "GEMINI_API_KEY=test\n", { mode: 0o600 });
  writeFileSync(projectFilePath, "GEMINI_API_KEY=test\n", { mode: 0o600 });
  chmodSync(symlinkTarget, 0o700);
  writeFileSync(path.join(symlinkTarget, "reviewer.env"), "GEMINI_API_KEY=test\n", { mode: 0o600 });
  symlinkSync(symlinkTarget, symlinkDir, "dir");
  try {
    assert.equal(validateReviewerSecretMetadata(filePath).ok, true);
    assert.equal(validateReviewerSecretMetadata(projectFilePath).ok, true);
    assert.equal(validateReviewerSecretMetadata(symlinkFilePath).reason, "blocked_secret_env_dir_symlink");
    chmodSync(filePath, 0o644);
    assert.equal(validateReviewerSecretMetadata(filePath).reason, "blocked_secret_env_file_mode");
  } finally {
    rmSync(filePath, { force: true });
    rmSync(projectFilePath, { force: true });
    rmSync(symlinkDir, { force: true });
    rmSync(symlinkTarget, { recursive: true, force: true });
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
    assert.equal(strong.model, "gemini-3.5-flash");
    assert.equal(new URL(requestedUrls[0]).origin, "https://generativelanguage.googleapis.com");
    assert.equal(new URL(requestedUrls[1]).origin, "https://generativelanguage.googleapis.com");
    assert.equal(new URL(requestedUrls[0]).pathname, "/v1beta/models/gemini-2.5-flash-lite:generateContent");
    assert.equal(new URL(requestedUrls[1]).pathname, "/v1beta/models/gemini-3.5-flash:generateContent");
    assert.doesNotMatch(readFileSync(cheap.reportPath, "utf8"), /super-secret-key/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("integrated Gemini reviewer skips when external tier is disabled", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-disabled-"));
  try {
    let calls = 0;
    const result = await runGeminiIntegratedReview(
      geminiIntegratedConfig(tempRoot, {
        reviewerTiers: { cheap_independent: { enabled: false } },
      }),
      workflowReviewPackage(),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        fetchImpl: async () => {
          calls += 1;
          throw new Error("should not call");
        },
      },
    );
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "skipped_external_reviewer_tier_disabled");
    assert.equal(calls, 0);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("eligible low-risk lane selects cheap Gemini reviewer and pass verdict proceeds", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-pass-"));
  try {
    const requestedUrls = [];
    const requestBodies = [];
    const result = await runGeminiIntegratedReview(geminiIntegratedConfig(tempRoot), workflowReviewPackage(), {
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async (url, request) => {
        requestedUrls.push(String(url));
        requestBodies.push(JSON.parse(request.body));
        return fakeGeminiResponse({
          candidates: [{ content: { parts: [{ text: integratedVerdictJson({ verdict: "pass" }) }] } }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
          rawProviderOnlyText: "raw-provider-secret",
        });
      },
    });
    assert.equal(result.status, "pass");
    assert.equal(result.tier, "cheap_independent");
    assert.equal(result.model, "gemini-2.5-flash-lite");
    assert.equal(result.changedFilesDigest, sha256Strings(["tools/auto-runner/lib/gemini-reviewer.mjs"]));
    assert.equal(new URL(requestedUrls[0]).origin, "https://generativelanguage.googleapis.com");
    assert.equal(requestBodies[0].generationConfig.responseMimeType, "application/json");
    assert.equal(requestBodies[0].generationConfig.responseJsonSchema.additionalProperties, false);
    assert.deepEqual(requestBodies[0].generationConfig.responseJsonSchema.required, ["verdict", "confidence", "summary", "findings"]);
    const report = readFileSync(result.reportPath, "utf8");
    const accounting = readFileSync(path.join(tempRoot, "state", "reviewer-accounting.json"), "utf8");
    assert.doesNotMatch(report, /super-secret-key|raw-provider-secret/);
    assert.doesNotMatch(accounting, /super-secret-key|raw-provider-secret|authorization/i);
    assert.match(accounting, /"mode":|"commandMode": "integrated-pre-pr-review"/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("client-ui-low-risk real-code lane selects cheap Gemini reviewer and pass verdict proceeds", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-client-ui-pass-"));
  try {
    const result = await runGeminiIntegratedReview(
      geminiIntegratedConfig(tempRoot),
      workflowReviewPackage({
        changedFiles: ["apps/mobile/lib/ui/settleora_components.dart", "apps/mobile/test/ui/settleora_component_guardrail_test.dart"],
        laneDecision: {
          lane: "client-ui-low-risk",
          allowedToImplement: true,
          dangerGate: false,
          allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart", "apps/mobile/test/ui/settleora_component_guardrail_test.dart"],
          laneManifestAllowedPaths: ["apps/mobile/lib/ui/**", "apps/mobile/test/ui/**"],
          validationProfile: "mobile-ui-low-risk",
          manualMergeRequired: false,
          autoMergeEligible: true,
        },
        diff: "diff --git a/apps/mobile/lib/ui/settleora_components.dart b/apps/mobile/lib/ui/settleora_components.dart\nindex 1111111..2222222 100644\n--- a/apps/mobile/lib/ui/settleora_components.dart\n+++ b/apps/mobile/lib/ui/settleora_components.dart\n@@ -1,0 +1,1 @@\n+const ok = true;\n",
        summary: { currentHead: "head123" },
      }),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        fetchImpl: async () =>
          fakeGeminiResponse({ candidates: [{ content: { parts: [{ text: integratedVerdictJson({ verdict: "pass" }) }] } }] }),
      },
    );
    assert.equal(result.status, "pass");
    assert.equal(result.tier, "cheap_independent");
    assert.equal(result.reviewedHead, "head123");
    assert.equal(result.changedFilesDigest, sha256Strings([
      "apps/mobile/lib/ui/settleora_components.dart",
      "apps/mobile/test/ui/settleora_component_guardrail_test.dart",
    ]));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("client-ui-low-risk real-code integrated reviewer fails closed when tier is disabled", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-client-ui-disabled-"));
  try {
    const result = await runGeminiIntegratedReview(
      geminiIntegratedConfig(tempRoot, {
        reviewerTiers: { cheap_independent: { enabled: false } },
      }),
      workflowReviewPackage({
        changedFiles: ["apps/mobile/lib/ui/settleora_components.dart"],
        laneDecision: {
          lane: "client-ui-low-risk",
          allowedToImplement: true,
          dangerGate: false,
          allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart"],
          laneManifestAllowedPaths: ["apps/mobile/lib/ui/**", "apps/mobile/test/ui/**"],
          validationProfile: "mobile-ui-low-risk",
          manualMergeRequired: false,
          autoMergeEligible: true,
        },
      }),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        fetchImpl: async () => {
          throw new Error("should not call");
        },
      },
    );
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "skipped_external_reviewer_tier_disabled");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("sensitive domain uses strong integrated Gemini review when lane metadata requires it", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-sensitive-"));
  try {
    let calls = 0;
    let prompt = "";
    const result = await runGeminiIntegratedReview(geminiIntegratedConfig(tempRoot), workflowReviewPackage({
      changedFiles: ["services/api/Auth/SessionRuntime.cs"],
      laneDecision: { lane: "auth-session-security", reviewerTier: "strong_independent" },
      diff: "diff --git a/services/api/Auth/SessionRuntime.cs b/services/api/Auth/SessionRuntime.cs\n",
    }), {
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async (_url, request) => {
        calls += 1;
        prompt = JSON.parse(request.body).contents[0].parts[0].text;
        return fakeGeminiResponse({ candidates: [{ content: { parts: [{ text: integratedVerdictJson({ verdict: "pass" }) }] } }] });
      },
    });
    assert.equal(result.status, "pass");
    assert.equal(result.tier, "strong_independent");
    assert.equal(result.model, "gemini-3.5-flash");
    assert.equal(calls, 1);
    assert.doesNotMatch(prompt, /Approved first lanes are workflow-docs-tooling, docs-planning, and client-ui-low-risk only/);
    assert.doesNotMatch(prompt, /Pass only if this low-risk Settleora/);
    assert.match(prompt, /Approved sensitive implementation lanes are reviewable/);
    assert.match(prompt, /manual actions/);
    assert.match(prompt, /secret\/auth credential mutation/);
    assert.match(prompt, /unable_to_review/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("required integrated Gemini reviewer with missing key fails closed before provider call", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-missing-key-"));
  try {
    let calls = 0;
    const result = await runGeminiIntegratedReview(geminiIntegratedConfig(tempRoot), workflowReviewPackage(), {
      env: {},
      fetchImpl: async () => {
        calls += 1;
        throw new Error("should not call");
      },
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_for_live_integrated_review_key_missing");
    assert.equal(result.liveCallAttempted, false);
    assert.equal(calls, 0);
    assert.doesNotMatch(readFileSync(result.reportPath, "utf8"), /GEMINI_API_KEY|super-secret/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("unsupported integrated Gemini model blocks before key loading or fetch", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-invalid-model-"));
  try {
    let calls = 0;
    const env = new Proxy(
      {},
      {
        get() {
          throw new Error("key should not be read");
        },
      },
    );
    const result = await runGeminiIntegratedReview(
      geminiIntegratedConfig(tempRoot, {
        reviewerTiers: { cheap_independent: { model: "https://metadata.invalid/latest" } },
      }),
      workflowReviewPackage(),
      {
        env,
        fetchImpl: async () => {
          calls += 1;
          throw new Error("should not call");
        },
      },
    );
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_unsupported_gemini_model");
    assert.equal(calls, 0);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("malformed and non-pass integrated Gemini verdicts fail closed", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-verdicts-"));
  try {
    const malformed = await runGeminiIntegratedReview(geminiIntegratedConfig(tempRoot), workflowReviewPackage(), {
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () => fakeGeminiResponse({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }),
    });
    assert.equal(malformed.status, "blocked");
    assert.equal(malformed.reason, "blocked_malformed_json_verdict");
    assert.equal(malformed.providerAttempts.length, 1);
    assert.equal(malformed.providerAttempts[0].transient, false);

    const nonPass = await runGeminiIntegratedReview(geminiIntegratedConfig(tempRoot), workflowReviewPackage(), {
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () =>
        fakeGeminiResponse({ candidates: [{ content: { parts: [{ text: integratedVerdictJson({ verdict: "fail" }) }] } }] }),
    });
    assert.equal(nonPass.status, "blocked");
    assert.equal(nonPass.reason, "blocked_external_reviewer_non_pass");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("integrated Gemini candidate and finish reason failures are structured and bounded", async () => {
  const cases = [
    {
      name: "empty candidate list",
      body: { candidates: [], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 0, totalTokenCount: 1 } },
      reason: "blocked_provider_no_candidates",
    },
    {
      name: "safety blocked candidate",
      body: { candidates: [{ finishReason: "SAFETY", safetyRatings: [{ category: "HARM_CATEGORY_DANGEROUS_CONTENT" }] }] },
      reason: "blocked_provider_candidate_safety_block",
    },
    {
      name: "truncated candidate",
      body: { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: integratedVerdictJson({ verdict: "pass" }) }] } }] },
      reason: "blocked_provider_response_truncated",
    },
    {
      name: "unexpected finish reason",
      body: { candidates: [{ finishReason: "OTHER", content: { parts: [{ text: integratedVerdictJson({ verdict: "pass" }) }] } }] },
      reason: "blocked_provider_unexpected_finish_reason",
    },
    {
      name: "empty text",
      body: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "" }] } }] },
      reason: "blocked_provider_empty_text",
    },
  ];
  for (const item of cases) {
    const tempRoot = mkdtempSync(path.join(tmpdir(), `settleora-integrated-${item.name.replaceAll(" ", "-")}-`));
    try {
      const result = await runGeminiIntegratedReview(geminiIntegratedConfig(tempRoot), workflowReviewPackage(), {
        env: { GEMINI_API_KEY: "super-secret-key" },
        fetchImpl: async () => fakeGeminiResponse(item.body),
      });
      assert.equal(result.status, "blocked", item.name);
      assert.equal(result.reason, item.reason, item.name);
      assert.equal(result.providerAttempts.length, 1, item.name);
      assert.equal(result.providerAttempts[0].transient, false, item.name);
      const report = readFileSync(result.reportPath, "utf8");
      assert.doesNotMatch(report, /super-secret-key/);
      assert.doesNotMatch(report, /rawProviderOnlyText/);
      assert.match(report, /"candidateCount"/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("transient integrated Gemini provider failure retries once and then passes", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-transient-pass-"));
  try {
    let calls = 0;
    const result = await runGeminiIntegratedReview(
      geminiIntegratedConfig(tempRoot, { geminiReviewerRetry: { maxRetries: 1, backoffMs: 0 } }),
      workflowReviewPackage(),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        sleep: async () => {},
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) throw new Error("fetch failed");
          return fakeGeminiResponse({ candidates: [{ content: { parts: [{ text: integratedVerdictJson({ verdict: "pass" }) }] } }] });
        },
      },
    );
    assert.equal(calls, 2);
    assert.equal(result.status, "pass");
    assert.equal(result.reason, "integrated_review_passed");
    assert.equal(result.transientAttemptCount, 1);
    assert.deepEqual(result.providerAttempts.map((attempt) => attempt.transient), [true, false]);
    assert.doesNotMatch(readFileSync(result.reportPath, "utf8"), /super-secret-key/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("transient integrated Gemini provider failure retries and still fails closed", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-transient-fail-"));
  try {
    let calls = 0;
    const result = await runGeminiIntegratedReview(
      geminiIntegratedConfig(tempRoot, { geminiReviewerRetry: { maxRetries: 1, backoffMs: 0 } }),
      workflowReviewPackage(),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        sleep: async () => {},
        fetchImpl: async () => {
          calls += 1;
          return fakeGeminiResponse({ error: { status: "UNAVAILABLE", message: "temporary unavailable" } }, 503);
        },
      },
    );
    assert.equal(calls, 2);
    assert.equal(result.status, "blocked");
    assert.match(result.reason, /^blocked_provider_transient_http_error:503/);
    assert.equal(result.transientAttemptCount, 2);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Gemini model endpoint resolution is explicit and fail closed", () => {
  assert.equal(
    supportedGeminiModelEndpoints["gemini-3.5-flash"],
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
  );
  assert.equal(resolveGeminiModelEndpoint("gemini-3.5-flash"), supportedGeminiModelEndpoints["gemini-3.5-flash"]);
  assert.equal(resolveGeminiModelEndpoint("gemini-9.9-unknown"), null);
  assert.equal(resolveGeminiModelEndpoint("gemini-flash-latest"), supportedGeminiModelEndpoints["gemini-flash-latest"]);
  assert.equal(resolveGeminiModelEndpoint("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash"), null);
});

test("strong Gemini profile uses stable model override instead of provider default", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-strong-stable-"));
  try {
    let requestedUrl = "";
    const result = await runGeminiIntegratedReview(
      geminiIntegratedConfig(tempRoot, {
        reviewerTiers: {
          strong_independent: {
            model: "gemini-3.5-flash",
            inputUsdPerMillionTokens: 1.5,
            outputUsdPerMillionTokens: 9,
          },
        },
        reviewerProviderProfiles: {
          "gemini-strong": {
            provider: "gemini",
            apiKeyEnv: "GEMINI_API_KEY",
            envFilePath: null,
            defaultModel: "gemini-2.5-flash-lite",
          },
        },
      }),
      workflowReviewPackage({
        changedFiles: ["services/api/Example.cs"],
        laneDecision: {
          lane: "api-domain-runtime",
          allowedToImplement: true,
          reviewerTier: "strong_independent",
        },
      }),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        fetchImpl: async (url) => {
          requestedUrl = url;
          return fakeGeminiResponse({ candidates: [{ content: { parts: [{ text: integratedVerdictJson({ verdict: "pass" }) }] } }] });
        },
      },
    );
    assert.equal(result.status, "pass");
    assert.equal(result.model, "gemini-3.5-flash");
    assert.equal(requestedUrl, supportedGeminiModelEndpoints["gemini-3.5-flash"]);
    assert.equal(result.pricing.inputUsdPerMillionTokens, 1.5);
    assert.equal(result.pricing.outputUsdPerMillionTokens, 9);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("integrated Gemini provider 404 blocks without fallback and stays sanitized", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-404-no-fallback-"));
  try {
    let calls = 0;
    const result = await runGeminiIntegratedReview(
      geminiIntegratedConfig(tempRoot, {
        geminiReviewerRetry: { maxRetries: 1, backoffMs: 0 },
        reviewerTiers: {
          strong_independent: {
            model: "gemini-3.5-flash",
            inputUsdPerMillionTokens: 1.5,
            outputUsdPerMillionTokens: 9,
          },
        },
      }),
      workflowReviewPackage({
        changedFiles: ["services/api/Example.cs"],
        laneDecision: {
          lane: "api-domain-runtime",
          allowedToImplement: true,
          reviewerTier: "strong_independent",
        },
      }),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        sleep: async () => {},
        fetchImpl: async (url) => {
          calls += 1;
          assert.equal(url, supportedGeminiModelEndpoints["gemini-3.5-flash"]);
          return fakeGeminiResponse({ error: { message: "api_key=super-secret-key model unavailable" } }, 404);
        },
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_provider_http_error");
    assert.equal(result.model, "gemini-3.5-flash");
    assert.equal(result.providerAttempts.length, 1);
    assert.equal(result.providerAttempts[0].transient, false);
    assert.doesNotMatch(JSON.stringify(result), /super-secret-key/);
    assert.doesNotMatch(readFileSync(result.reportPath, "utf8"), /super-secret-key|x-goog-api-key/i);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("runner example strong Gemini model and pricing stay synchronized", () => {
  const example = JSON.parse(readFileSync(path.join(process.cwd(), "tools/auto-runner/runner-config.example.json"), "utf8"));
  const strong = example.reviewerTiers.strong_independent;
  const tieBreaker = example.reviewerTiers.tie_breaker;
  const strongProfile = example.reviewerProviderProfiles["gemini-strong"];
  for (const tier of [strong, tieBreaker]) {
    assert.equal(tier.model, "gemini-3.5-flash");
    assert.equal(tier.inputUsdPerMillionTokens, 1.5);
    assert.equal(tier.outputUsdPerMillionTokens, 9);
    assert.doesNotMatch(tier.model, /latest|preview|experimental/i);
  }
  assert.equal(strongProfile.defaultModel, "gemini-3.5-flash");
  assert.equal(resolveGeminiModelEndpoint(strong.model), supportedGeminiModelEndpoints["gemini-3.5-flash"]);
});

test("integrated Gemini retry count and delay are bounded even with pathological config", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-retry-bounds-"));
  try {
    let calls = 0;
    const delays = [];
    const result = await runGeminiIntegratedReview(
      geminiIntegratedConfig(tempRoot, { geminiReviewerRetry: { maxRetries: 50, backoffMs: 999_999_999 } }),
      workflowReviewPackage(),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
        fetchImpl: async () => {
          calls += 1;
          return fakeGeminiResponse({ error: { status: "UNAVAILABLE", message: "temporary unavailable" } }, 503);
        },
      },
    );
    assert.equal(calls, 3);
    assert.deepEqual(delays, [10_000, 10_000]);
    assert.equal(result.status, "blocked");
    assert.match(result.reason, /^blocked_provider_transient_http_error:503/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Gemini provider error body is read through a byte bound and sanitized", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-gemini-large-error-"));
  try {
    const largeBody = `{"error":{"message":"api_key=super-secret-key ${"x".repeat(90_000)}"}}`;
    const response = fakeGeminiStreamResponse(largeBody, 500);
    const result = await runGeminiReviewerSmokeTest(geminiSmokeConfig(tempRoot), {
      liveExternalReviewerCalls: true,
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () => response,
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_provider_http_error");
    assert.equal(response.cancelled, true);
    assert.ok(result.sanitizedResponseSummary.length < 1100);
    assert.doesNotMatch(result.sanitizedResponseSummary, /super-secret-key/);
    assert.match(result.sanitizedResponseSummary, /\[truncated\]/);
    assert.doesNotMatch(readFileSync(result.reportPath, "utf8"), /super-secret-key/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("non-pass integrated Gemini verdict is not retried as a transient failure", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-non-pass-no-retry-"));
  try {
    let calls = 0;
    const result = await runGeminiIntegratedReview(
      geminiIntegratedConfig(tempRoot, { geminiReviewerRetry: { maxRetries: 1, backoffMs: 0 } }),
      workflowReviewPackage(),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        sleep: async () => {},
        fetchImpl: async () => {
          calls += 1;
          return fakeGeminiResponse({ candidates: [{ content: { parts: [{ text: integratedVerdictJson({ verdict: "fail" }) }] } }] });
        },
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "blocked_external_reviewer_non_pass");
    assert.equal(result.providerAttempts.length, 1);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("integrated Gemini reviewer blocks before provider call at budget hard stop and per-call cap", async () => {
  const hardStopRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-hard-stop-"));
  const capRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-cap-"));
  try {
    mkdirSync(path.join(hardStopRoot, "state"), { recursive: true });
    writeFileSync(
      path.join(hardStopRoot, "state", "reviewer-accounting.json"),
      `${JSON.stringify({ entries: [{ monthKey: new Date().toISOString().slice(0, 7), costUsd: 95 }] })}\n`,
    );
    let calls = 0;
    const hardStop = await runGeminiIntegratedReview(geminiIntegratedConfig(hardStopRoot), workflowReviewPackage(), {
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () => {
        calls += 1;
        throw new Error("should not call");
      },
    });
    assert.equal(hardStop.reason, "blocked_reviewer_budget_hard_stop");
    assert.equal(calls, 0);

    const overCap = await runGeminiIntegratedReview(
      geminiIntegratedConfig(capRoot, {
        reviewerTiers: {
          cheap_independent: {
            inputUsdPerMillionTokens: 1_000_000,
            outputUsdPerMillionTokens: 1_000_000,
          },
        },
      }),
      workflowReviewPackage(),
      {
        env: { GEMINI_API_KEY: "super-secret-key" },
        fetchImpl: async () => {
          calls += 1;
          throw new Error("should not call");
        },
      },
    );
    assert.equal(overCap.reason, "blocked_integrated_estimated_cost_over_cap");
    assert.equal(calls, 0);
  } finally {
    rmSync(hardStopRoot, { recursive: true, force: true });
    rmSync(capRoot, { recursive: true, force: true });
  }
});

test("integrated Gemini accounting parse and write failures fail closed", async () => {
  const parseRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-accounting-parse-"));
  const writeRoot = mkdtempSync(path.join(tmpdir(), "settleora-integrated-accounting-write-"));
  try {
    mkdirSync(path.join(parseRoot, "state"), { recursive: true });
    writeFileSync(path.join(parseRoot, "state", "reviewer-accounting.json"), "{not-json\n");
    let calls = 0;
    const parseFailure = await runGeminiIntegratedReview(geminiIntegratedConfig(parseRoot), workflowReviewPackage(), {
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () => {
        calls += 1;
        throw new Error("should not call");
      },
    });
    assert.match(parseFailure.reason, /^blocked_reviewer_accounting_parse_error/);
    assert.equal(calls, 0);

    const writeFailureConfig = geminiIntegratedConfig(writeRoot);
    rmSync(path.join(writeRoot, "state"), { recursive: true, force: true });
    writeFileSync(path.join(writeRoot, "state"), "not a directory\n");
    const writeFailure = await runGeminiIntegratedReview(writeFailureConfig, workflowReviewPackage(), {
      env: { GEMINI_API_KEY: "super-secret-key" },
      fetchImpl: async () =>
        fakeGeminiResponse({ candidates: [{ content: { parts: [{ text: integratedVerdictJson({ verdict: "pass" }) }] } }] }),
    });
    assert.match(writeFailure.reason, /^blocked_reviewer_accounting_write_error/);
  } finally {
    rmSync(parseRoot, { recursive: true, force: true });
    rmSync(writeRoot, { recursive: true, force: true });
  }
});

test("integrated Gemini verdict parser rejects extra prose, unknown verdicts, and contradictory pass findings", () => {
  assert.equal(parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass" })).ok, true);
  assert.equal(parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass", findings: ["No blocking findings remain."] })).ok, true);
  assert.equal(parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass", findings: ["No unresolved blocking findings were found."] })).ok, true);
  assert.equal(parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass", findings: ["The changes do not introduce any blocking issue."] })).ok, true);
  assert.equal(parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass", findings: ["Blocking findings: none."] })).ok, true);
  assert.equal(parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass", findings: ["No evidence in the reviewed diff suggests any blocking issue."] })).ok, true);
  assert.equal(parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass", findings: ["No findings require a blocking follow-up."] })).ok, true);
  assert.equal(parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass", findings: ["There are zero exact-head review concerns requiring a must fix change."] })).ok, true);
  assert.equal(parseIntegratedVerdict(integratedVerdictJson({ verdict: "fail" })).ok, true);
  assert.equal(parseIntegratedVerdict(`notes\n${integratedVerdictJson({ verdict: "pass" })}`).ok, false);
  assert.equal(parseIntegratedVerdict(`\`\`\`json\n${integratedVerdictJson({ verdict: "pass" })}\n\`\`\``).ok, false);
  assert.equal(parseIntegratedVerdict(integratedVerdictJson({ verdict: "approve" })).ok, false);
  assert.equal(parseIntegratedVerdict(JSON.stringify({ verdict: "pass", confidence: "high", summary: "ok", findings: [], extra: true })).ok, false);
  assert.equal(parseIntegratedVerdict(JSON.stringify({ verdict: "pass", confidence: "high", summary: "ok" })).ok, false);
  assert.equal(parseIntegratedVerdict(JSON.stringify({ verdict: "pass", confidence: "certain", summary: "ok", findings: [] })).ok, false);
  assert.equal(
    parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass", findings: ["blocking issue remains"] })).ok,
    false,
  );
  assert.equal(
    parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass", findings: ["A must fix change is required before merge"] })).ok,
    false,
  );
  assert.equal(
    parseIntegratedVerdict(integratedVerdictJson({ verdict: "pass", findings: ["The review identified a blocking issue in the exact-head checks"] })).ok,
    false,
  );
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

test("selection skips stale closed #863 after merge and selects #864 without duplicate work", () => {
  const config = selectionConfig();
  const tracker = createRunIssueTracker();
  const batchPoll = [selectionIssue(863, "Mobile accessibility: SummaryCard semantic grouping guardrail"), selectionIssue(864)];
  const first = selectDistinctEligibleIssue(config, batchPoll, tracker, liveIssueReader({
    863: selectionIssue(863, "Mobile accessibility: SummaryCard semantic grouping guardrail"),
    864: selectionIssue(864),
  }));
  assert.equal(first.selected.number, 863);
  markIssueAttempted(tracker, 863);
  markIssueProcessed(tracker, 863);

  const second = selectDistinctEligibleIssue(config, batchPoll, tracker, liveIssueReader({
    863: { ...selectionIssue(863, "Mobile accessibility: SummaryCard semantic grouping guardrail"), state: "CLOSED" },
    864: selectionIssue(864),
  }));
  assert.equal(second.selected.number, 864);
  assert.ok(second.events.some((event) => event.action === "candidate_skipped" && event.reason === "already_attempted_in_run"));
  assert.ok(second.events.some((event) => event.action === "distinct_candidate_selected" && event.issue.number === 864));
});

test("attempted set excludes prior issue even when stale live refresh still reports open and eligible", () => {
  const config = selectionConfig();
  const candidates = [selectionIssue(863), selectionIssue(864)];
  const tracker = createRunIssueTracker();
  markIssueAttempted(tracker, 863);
  const sameRun = selectDistinctEligibleIssue(config, candidates, tracker, liveIssueReader({
    863: selectionIssue(863),
    864: selectionIssue(864),
  }));
  assert.equal(sameRun.selected.number, 864);
  assert.equal(sameRun.events.find((event) => event.reason === "already_attempted_in_run").candidate.number, 863);

  const futureRun = selectDistinctEligibleIssue(config, candidates, createRunIssueTracker(), liveIssueReader({
    863: selectionIssue(863),
    864: selectionIssue(864),
  }));
  assert.equal(futureRun.selected.number, 863);
});

test("merge success remains authoritative when closure or label cleanup fails", () => {
  const config = selectionConfig();
  const tracker = createRunIssueTracker();
  markIssueAttempted(tracker, 863);
  markIssueProcessed(tracker, 863);
  const next = selectDistinctEligibleIssue(config, [selectionIssue(863), selectionIssue(864)], tracker, liveIssueReader({
    863: selectionIssue(863),
    864: selectionIssue(864),
  }));
  assert.equal(next.selected.number, 864);
  assert.deepEqual(trackerSnapshot(tracker).processedIssueNumbers, [863]);
});

test("all terminal outcomes prevent same-run reselection", () => {
  const config = selectionConfig();
  for (const outcome of terminalAttemptOutcomes) {
    const tracker = createRunIssueTracker();
    markIssueAttempted(tracker, 863);
    const selected = selectDistinctEligibleIssue(config, [selectionIssue(863), selectionIssue(864)], tracker, liveIssueReader({
      863: selectionIssue(863),
      864: selectionIssue(864),
    }));
    assert.equal(selected.selected.number, 864, outcome);
  }
});

test("live pre-claim validation fails closed for stale labels, stop labels, refresh errors, duplicates, and claim races", () => {
  const config = selectionConfig();
  const cases = [
    ["closed", { 863: { ...selectionIssue(863), state: "CLOSED" } }, "live_issue_not_open"],
    ["eligible removed", { 863: { ...selectionIssue(863), labels: ["workflow"] } }, "live_issue_missing_eligible_label"],
    ["stop label", { 863: { ...selectionIssue(863), labels: ["auto-canary-ready", "manual-gate"] } }, "live_issue_stop_label:manual-gate"],
    ["transient other claim", { 863: { ...selectionIssue(863), labels: ["auto-canary-ready", "auto-claimed"] } }, "live_issue_transient_claim_label:auto-claimed"],
  ];
  for (const [, liveIssues, reason] of cases) {
    const result = selectDistinctEligibleIssue(config, [selectionIssue(863)], createRunIssueTracker(), liveIssueReader(liveIssues));
    assert.equal(result.selected, null);
    assert.ok(result.events.some((event) => event.reason === reason), reason);
  }

  const readFailure = selectDistinctEligibleIssue(config, [selectionIssue(863)], createRunIssueTracker(), () => {
    throw new Error("invalid json");
  });
  assert.equal(readFailure.selected, null);
  assert.ok(readFailure.events.some((event) => event.reason === "live_issue_refresh_failed"));

  const duplicateThenValid = selectDistinctEligibleIssue(
    config,
    [selectionIssue(863), selectionIssue(863), selectionIssue(864)],
    createRunIssueTracker({ attemptedIssueNumbers: [863] }),
    liveIssueReader({ 863: selectionIssue(863), 864: selectionIssue(864) }),
  );
  assert.equal(duplicateThenValid.selected.number, 864);
  assert.equal(duplicateThenValid.events.filter((event) => event.reason === "already_attempted_in_run").length, 2);

  assert.equal(validateClaimReread(config, selectionIssue(863), { ...selectionIssue(863), labels: ["auto-canary-ready", "auto-claimed", "auto-running"] }).ok, true);
  assert.equal(validateClaimReread(config, selectionIssue(863), { ...selectionIssue(863), state: "CLOSED", labels: ["auto-canary-ready", "auto-claimed", "auto-running"] }).reason, "claim_reread_issue_not_open");
  assert.equal(validateClaimReread(config, selectionIssue(863), { ...selectionIssue(863), labels: ["auto-canary-ready", "auto-claimed", "auto-running", "manual-gate"] }).reason, "claim_reread_stop_label:manual-gate");
});

test("bounded selection scans stale candidates once and stops cleanly when none remain", () => {
  const config = { ...selectionConfig(), pollLimit: 3 };
  const tracker = createRunIssueTracker({ attemptedIssueNumbers: [861, 862] });
  const result = selectDistinctEligibleIssue(
    config,
    [selectionIssue(861), selectionIssue(862), selectionIssue(863), selectionIssue(864)],
    tracker,
    liveIssueReader({
      861: selectionIssue(861),
      862: selectionIssue(862),
      863: { ...selectionIssue(863), state: "CLOSED" },
      864: selectionIssue(864),
    }),
  );
  assert.equal(result.selected, null);
  assert.equal(result.events.at(-1).action, "no_eligible_work_after_exclusions");
  assert.equal(result.events.at(-1).scannedCandidateCount, 3);
});

test("profile policy excludes a candidate before claim selection and selects the next allowed lane", () => {
  const config = selectionConfig();
  const tracker = createRunIssueTracker();
  const protectedIssue = selectionIssue(865, "Protected UI canary", {
    body: contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
  });
  const workflowIssue = selectionIssue(9121, "Task-scoped workflow canary");
  const result = selectDistinctEligibleIssue(
    config,
    [protectedIssue, workflowIssue],
    tracker,
    liveIssueReader({ 865: protectedIssue, 9121: workflowIssue }),
    (_issue, laneDecision) => ({
      allowed: laneDecision.lane === "workflow-docs-tooling",
      reason: "lane_not_approved_by_active_profile",
    }),
  );
  assert.equal(result.selected.number, 9121);
  assert.deepEqual(trackerSnapshot(tracker).attemptedIssueNumbers, [865]);
  assert.equal(
    result.events.some((event) => event.reason?.startsWith("live_issue_profile_policy_not_allowed:")),
    true,
  );
});

test("selection evidence and status expose attempted counts without full issue bodies", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-selection-evidence-"));
  try {
    mkdirSync(path.join(tempRoot, "summaries"), { recursive: true });
    mkdirSync(path.join(tempRoot, "state"), { recursive: true });
    mkdirSync(path.join(tempRoot, "locks"), { recursive: true });
    const config = readinessConfig(tempRoot);
    const tracker = createRunIssueTracker({ attemptedIssueNumbers: [863] });
    const selected = selectDistinctEligibleIssue(
      selectionConfig(),
      [selectionIssue(863), selectionIssue(864, "Valid", { body: `${contractBody()}\nFULL_BODY_SENTINEL` })],
      tracker,
      liveIssueReader({
        863: selectionIssue(863),
        864: selectionIssue(864, "Valid", { body: `${contractBody()}\nFULL_BODY_SENTINEL` }),
      }),
    );
    const summary = {
      runId: "run-selection-test",
      mode: "canary-run",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      attemptedIssueNumbers: [863, 864],
      attemptedIssueCount: 2,
      processedIssueNumbers: [863],
      processedIssueCount: 1,
      iterations: [
        {
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          outcome: "approved_pr_opened",
          issue: { number: 864, title: "Valid", url: "https://example.invalid/864" },
          candidateSelection: {
            events: selected.events,
            attemptedIssueNumbers: [863, 864],
            attemptedIssueCount: 2,
          },
        },
      ],
    };
    const paths = writeRunSummary(config, summary);
    writeActiveRunState(config, summary);
    const text = `${readFileSync(paths.jsonPath, "utf8")}\n${readFileSync(paths.markdownPath, "utf8")}\n${JSON.stringify(listEvents(config, "run-selection-test"))}`;
    assert.doesNotMatch(text, /FULL_BODY_SENTINEL/);
    assert.match(text, /attemptedIssueCount|Attempted issues/);
    assert.ok(listEvents(config, "run-selection-test").events.some((event) => event.type === "selection" && event.details.reason === "already_attempted_in_run"));
    assert.equal(getRunnerStatus(config).attemptedIssueCount, 2);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
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

test("client-ui-low-risk contract accepts only narrow mobile shared UI paths", () => {
  const lane = classifyIssueLane({
    title: "Mobile shared UI copy polish",
    body: contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart", "apps/mobile/test/ui/settleora_component_guardrail_test.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready", "canary"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.equal(lane.lane, "client-ui-low-risk");
  assert.equal(lane.validationProfile, "mobile-ui-low-risk");
  assert.equal(lane.autoMergeEligible, true);
  assert.equal(lane.manualMergeRequired, false);
  assert.deepEqual(
    filterForbiddenChangedFiles(
      ["apps/mobile/lib/ui/settleora_components.dart", "apps/mobile/test/ui/settleora_component_guardrail_test.dart"],
      lane,
    ),
    [],
  );
  assert.deepEqual(filterForbiddenChangedFiles(["apps/mobile/lib/app/server_mode_shell.dart"], lane), [
    "apps/mobile/lib/app/server_mode_shell.dart",
  ]);
});

test("exact #852 MoneyText presentation-only contract suppresses only money settlement danger evidence", () => {
  const issue = issue852Fixture();
  const lane = classifyIssueLane(issue);

  assert.equal(lane.lane, "client-ui-low-risk");
  assert.equal(lane.allowedToImplement, true);
  assert.equal(lane.dangerGate, false);
  assert.equal(lane.validationProfile, "mobile-ui-low-risk");
  assert.equal(lane.autoMergeEligible, true);
  assert.equal(lane.manualMergeRequired, false);
  assert.deepEqual(lane.allowedPaths, [
    "apps/mobile/lib/ui/settleora_components.dart",
    "apps/mobile/test/ui/settleora_component_guardrail_test.dart",
  ]);
  assert.deepEqual(lane.dangerReasons, []);
  assert.deepEqual(lane.moneyPresentationException.detectedDangerReasons, ["money_settlement"]);
  assert.equal(lane.moneyPresentationException.applied, true);
  assert.ok(lane.moneyPresentationException.presentationProofMatches.includes("accessibility"));
  assert.ok(lane.moneyPresentationException.presentationProofMatches.includes("semantics"));
  assert.deepEqual(lane.moneyPresentationException.authorityMutationMatches, []);
  assert.equal(evaluateCanaryIssuePolicy(approvedLowRiskAutoMergeCanaryConfig(), lane).allowed, true);

  const evidenceJson = JSON.stringify(lane.moneyPresentationException);
  assert.doesNotMatch(evidenceJson, /Narrow fresh-implementation canary/);
  assert.doesNotMatch(evidenceJson, /Auto-runner contract/);
});

test("client-ui-low-risk presentation-only financial display nouns are accepted when tightly proven", () => {
  const accepted = [
    {
      title: "MoneyText single-announcement semantics",
      scope: "Accessibility semantics only for MoneyText. Keep visible amount and currency display text read-only.",
      proofs: ["accessibility", "semantics", "read_only_widget_rendering"],
    },
    {
      title: "Amount currency visible label accessibility",
      scope: "Accessibility update for the visible amount/currency label. Display text only; no state behavior changes.",
      proofs: ["accessibility", "visible_display_text"],
    },
    {
      title: "Currency code display copy only",
      scope: "UI copy only for CurrencyCodeLabel. Change visible display text for the currency code readout.",
      proofs: ["ui_copy", "visible_display_text"],
    },
    {
      title: "Payment status label copy only",
      scope: "Payment status label copy only for a read-only shared widget. No state transition or behavior work is in scope.",
      proofs: ["ui_copy", "read_only_widget_rendering"],
    },
    {
      title: "BalancePill copy polish",
      scope: "Presentation-only accessibility label for BalancePill. CamelCase Balance identifier is read-only shared widget rendering.",
      proofs: ["accessibility", "read_only_widget_rendering"],
    },
    {
      title: "Mobile UI canary: shared header semantic heading guardrail",
      scope: "Accessibility semantics only for the shared header. No financial display nouns are involved.",
      proofs: [],
      detected: [],
    },
  ];

  for (const item of accepted) {
    const lane = classifyIssueLane(clientUiIssue(item.title, item.scope));
    assert.equal(lane.allowedToImplement, true, item.title);
    assert.equal(lane.dangerGate, false, item.title);
    assert.deepEqual(lane.moneyPresentationException?.detectedDangerReasons || [], item.detected ?? ["money_settlement"], item.title);
    assert.equal(lane.moneyPresentationException?.applied || false, (item.detected ?? ["money_settlement"]).length > 0, item.title);
    for (const proof of item.proofs) {
      assert.ok(lane.moneyPresentationException.presentationProofMatches.includes(proof), `${item.title} proof ${proof}`);
    }
  }
});

test("client-ui-low-risk money authority and mutation counterexamples remain danger gated", () => {
  const blockedScopes = [
    ["calculate_total", "Accessibility label plus calculate total amount for MoneyText."],
    ["compute_balance", "Screen-reader copy and compute balance display for BalanceText."],
    ["rounding_precision_policy", "UI copy for currency amount plus rounding precision policy."],
    ["currency_conversion", "Accessible currency display and convert currency using exchange rate FX behavior."],
    ["edit_persist_amount", "Accessibility label while editing and persisting amount/currency values."],
    ["payment_action", "Payment button label copy and mark payment status as paid."],
    ["paid_status_without_payment_noun", "Accessible label and mark status as paid."],
    ["settlement_refund_transition", "Settlement status copy and transition refunded status."],
    ["settle_status_without_settlement_noun", "Accessible label and settle status action."],
    ["refund_status_without_settlement_noun", "Accessible label and refund status transition."],
    ["split_allocation", "Split allocation label and calculate allocation amount."],
    ["amount_auth_policy", "Accessible amount display and authorization policy based on amount."],
    ["api_domain_database_write", "Currency label copy and API domain database write for the amount."],
    ["ambiguous_financial_verb", "Accessible balance copy and adjust owed amount display."],
  ];

  for (const [name, scope] of blockedScopes) {
    const lane = classifyIssueLane(clientUiIssue(`Blocked ${name}`, scope));
    assert.equal(lane.allowedToImplement, false, name);
    assert.equal(lane.dangerGate, true, name);
    assert.ok(lane.dangerReasons.includes("money_settlement"), name);
    assert.equal(lane.moneyPresentationException.applied, false, name);
    assert.ok(lane.moneyPresentationException.authorityMutationMatches.length > 0, name);
  }
});

test("client-ui-low-risk presentation exception remains fail-closed for other danger categories and unsafe contracts", () => {
  const mixedDanger = [
    ["auth_security", "MoneyText amount accessibility semantics and auth session security label."],
    ["storage_privacy", "MoneyText amount accessibility semantics and storage privacy permission copy."],
    ["schema_migration", "MoneyText amount accessibility semantics and schema migration wording."],
    ["openapi_generated_client", "MoneyText amount accessibility semantics and OpenAPI generated client copy."],
    ["sync_import_export", "MoneyText amount accessibility semantics and sync import export copy."],
    ["docker_ci_deploy", "MoneyText amount accessibility semantics and Docker deployment config copy."],
    ["secrets_config", "MoneyText amount accessibility semantics and secret env var config copy."],
  ];

  for (const [reason, scope] of mixedDanger) {
    const lane = classifyIssueLane(clientUiIssue(`Mixed ${reason}`, scope));
    assert.equal(lane.allowedToImplement, false, reason);
    assert.equal(lane.dangerGate, true, reason);
    assert.ok(lane.dangerReasons.includes("money_settlement"), reason);
    assert.ok(lane.dangerReasons.includes(reason), reason);
    assert.equal(lane.moneyPresentationException.applied, false, reason);
    assert.equal(lane.moneyPresentationException.reason, "danger_reasons_not_exactly_money_settlement", reason);
  }

  const invalid = classifyIssueLane({
    title: "Invalid MoneyText accessibility semantics",
    body: "MoneyText accessibility semantics.\n\n## Auto-runner contract\n\n```json\n{\"contractVersion\":1}\n```",
    labels: ["auto-canary-ready"],
  });
  assert.equal(invalid.allowedToImplement, false);
  assert.equal(invalid.lane, "missing-or-invalid-contract");

  const missing = classifyIssueLane({
    title: "Missing MoneyText accessibility semantics",
    body: "MoneyText accessibility semantics.",
    labels: ["auto-canary-ready"],
  });
  assert.equal(missing.allowedToImplement, false);
  assert.equal(missing.lane, "missing-or-invalid-contract");

  const outsidePresentationPath = classifyIssueLane(clientUiIssue("MoneyText app path", "MoneyText accessibility semantics.", {
    allowedPaths: ["apps/mobile/lib/app/money_banner.dart"],
  }));
  assert.equal(outsidePresentationPath.allowedToImplement, false);
  assert.match(outsidePresentationPath.reason, /outside lane manifest/i);

  const dangerousMobilePath = classifyIssueLane(clientUiIssue("MoneyText dangerous path", "MoneyText accessibility semantics.", {
    allowedPaths: ["apps/mobile/lib/ui/payment/money_text.dart"],
  }));
  assert.equal(dangerousMobilePath.allowedToImplement, false);
  assert.equal(dangerousMobilePath.dangerGate, true);
  assert.ok(dangerousMobilePath.dangerReasons.includes("money_settlement"));

  const nonClientLane = classifyIssueLane({
    title: "Docs MoneyText accessibility semantics",
    body: `${contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["tools/auto-runner/README.md"],
      validationProfile: "workflow-tooling",
    })}

## Scope

MoneyText accessibility semantics and currency display wording.
`,
    labels: ["auto-ready"],
  });
  assert.equal(nonClientLane.allowedToImplement, false);
  assert.equal(nonClientLane.moneyPresentationException.reason, "lane_not_client_ui_low_risk");
});

test("client-ui-low-risk refuses broad mobile paths and forbidden domains", () => {
  for (const body of [
    contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/**"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/bills/**"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/auth/**"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["packages/client-dart/lib/generated/**"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
  ]) {
    const lane = classifyIssueLane({ title: "Unsafe mobile UI canary", body, labels: ["auto-canary-ready", "canary"] });
    assert.equal(lane.allowedToImplement, false);
    assert.match(lane.reason, /outside lane manifest/i);
  }

  const positiveScope = classifyIssueLane({
    title: "Mobile UI canary with unsafe scope",
    body: `${contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    })}

## Scope

Change auth session behavior, storage privacy checks, money settlement calculations, OpenAPI generated clients, schema migrations, and deployment config.
`,
    labels: ["auto-canary-ready", "canary"],
  });
  assert.equal(positiveScope.allowedToImplement, false);
  assert.equal(positiveScope.dangerGate, true);
  assert.ok(positiveScope.dangerReasons.includes("auth_security"));
  assert.ok(positiveScope.dangerReasons.includes("storage_privacy"));
  assert.ok(positiveScope.dangerReasons.includes("money_settlement"));
  assert.ok(positiveScope.dangerReasons.includes("openapi_generated_client"));
  assert.ok(positiveScope.dangerReasons.includes("schema_migration"));
  assert.ok(positiveScope.dangerReasons.includes("docker_ci_deploy"));
});

test("validation readiness preflight uses the configured protected root", () => {
  const config = { repoRoot: "/tmp/control-worktree", protectedRoot: "/tmp/protected-root" };
  assert.equal(validationCommandCwd(config, {
    command: "node",
    args: ["tools/auto-runner/settleora-auto-runner.mjs", "--preflight"],
  }), "/tmp/protected-root");
  assert.equal(validationCommandCwd(config, { command: "npm", args: ["run", "validate:docs"] }), "/tmp/control-worktree");
});

test("client-ui-low-risk validation profile uses bounded Flutter mobile UI checks", () => {
  const lane = classifyIssueLane({
    title: "Mobile shared UI canary",
    body: contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart", "apps/mobile/test/ui/settleora_component_guardrail_test.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready", "canary"],
  });
  const plan = planValidation(["apps/mobile/lib/ui/settleora_components.dart"], lane).map((item) => item.display);
  assert.deepEqual(plan, [
    "git status --short",
    "git diff --name-only",
    "git diff --check",
    "bash -lc cd apps/mobile && /opt/flutter/bin/flutter pub get",
    "bash -lc cd apps/mobile && /opt/flutter/bin/flutter analyze",
    "bash -lc cd apps/mobile && /opt/flutter/bin/flutter test test/ui/settleora_component_guardrail_test.dart",
  ]);
});

test("mobile-build-config lane is canonical focused high-sensitivity strong-review policy", () => {
  const lane = classifyIssueLane({
    title: "Mobile build config: Android manifest and iOS plist",
    body: `${contractBody({
      lane: "mobile-build-config",
      allowedPaths: [
        "apps/mobile/pubspec.yaml",
        "apps/mobile/pubspec.lock",
        "apps/mobile/android/app/src/main/AndroidManifest.xml",
        "apps/mobile/android/app/build.gradle.kts",
        "apps/mobile/android/gradle/wrapper/gradle-wrapper.properties",
        "apps/mobile/ios/Runner/Info.plist",
        "apps/mobile/ios/Runner.xcodeproj/project.pbxproj",
        "apps/mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme",
        "apps/mobile/ios/Flutter/Debug.xcconfig",
        "apps/mobile/ios/Podfile",
        "apps/mobile/macos/Runner/Info.plist",
        "apps/mobile/linux/CMakeLists.txt",
        "apps/mobile/windows/CMakeLists.txt",
        "apps/mobile/web/manifest.json",
      ],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    })}

## Scope

Update checked-in Flutter and native platform build configuration inputs only.
`,
    labels: ["auto-ready"],
  });

  assert.equal(lane.allowedToImplement, true);
  assert.equal(lane.lane, "mobile-build-config");
  assert.equal(lane.canonicalLane, "mobile-build-config");
  assert.equal(lane.implementationSensitivity, "high");
  assert.equal(lane.branchStrategy, "focused");
  assert.equal(lane.reviewerTier, "strong_independent");
  assert.equal(lane.validationProfile, "mobile-build-config");
  assert.deepEqual(lane.laneManifest.supportedValidationProfiles, ["mobile-build-config"]);
  assert.equal(lane.prCreationAllowed, true);
  assert.equal(lane.autoMergeEligible, true);
  assert.equal(lane.manualMergeRequired, false);
  assert.equal(lane.laneManifest.autoMergeAllowed, true);
  assert.deepEqual(filterForbiddenChangedFiles(lane.allowedPaths, lane), []);
});

test("mobile-build-config allows tracked platform build inputs without leaking into mobile application code", () => {
  const safePaths = [
    "apps/mobile/pubspec.yaml",
    "apps/mobile/pubspec.lock",
    "apps/mobile/assets/images/logo.png",
    "apps/mobile/l10n/app_en.arb",
    "apps/mobile/android/app/src/main/AndroidManifest.xml",
    "apps/mobile/android/app/src/debug/AndroidManifest.xml",
    "apps/mobile/android/app/src/main/kotlin/com/example/mobile/MainActivity.kt",
    "apps/mobile/android/app/src/main/res/values/styles.xml",
    "apps/mobile/android/app/build.gradle.kts",
    "apps/mobile/android/build.gradle.kts",
    "apps/mobile/android/settings.gradle.kts",
    "apps/mobile/android/gradle.properties",
    "apps/mobile/android/gradle/wrapper/gradle-wrapper.properties",
    "apps/mobile/ios/Flutter/AppFrameworkInfo.plist",
    "apps/mobile/ios/Flutter/Debug.xcconfig",
    "apps/mobile/ios/Runner/Info.plist",
    "apps/mobile/ios/Runner/AppDelegate.swift",
    "apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json",
    "apps/mobile/ios/Runner/Base.lproj/LaunchScreen.storyboard",
    "apps/mobile/ios/Runner.xcodeproj/project.pbxproj",
    "apps/mobile/ios/Runner.xcodeproj/project.xcworkspace/contents.xcworkspacedata",
    "apps/mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme",
    "apps/mobile/ios/Podfile",
    "apps/mobile/macos/Runner/Configs/Debug.xcconfig",
    "apps/mobile/macos/Runner/DebugProfile.entitlements",
    "apps/mobile/macos/Runner/Release.entitlements",
    "apps/mobile/macos/Runner/MainFlutterWindow.swift",
    "apps/mobile/linux/flutter/generated_plugin_registrant.cc",
    "apps/mobile/linux/runner/main.cc",
    "apps/mobile/windows/flutter/generated_plugins.cmake",
    "apps/mobile/windows/runner/Runner.rc",
    "apps/mobile/web/index.html",
  ];
  const lane = classifyIssueLane({
    title: "Mobile build config safe tracked examples",
    body: contractBody({
      lane: "mobile-build-config",
      allowedPaths: safePaths,
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-ready"],
  });

  assert.equal(lane.allowedToImplement, true);
  assert.deepEqual(filterForbiddenChangedFiles(safePaths, lane), []);
  assert.deepEqual(filterForbiddenChangedFiles(["apps/mobile/lib/app/server_mode_shell.dart"], lane), [
    "apps/mobile/lib/app/server_mode_shell.dart",
  ]);

  const mobileApplication = classifyIssueLane({
    title: "Mobile application remains product code only",
    body: contractBody({
      lane: "mobile-application",
      allowedPaths: ["apps/mobile/lib/app/server_mode_shell.dart"],
      validationProfile: "mobile",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(mobileApplication.allowedToImplement, true);
  assert.deepEqual(filterForbiddenChangedFiles(["apps/mobile/android/app/build.gradle.kts"], mobileApplication), [
    "apps/mobile/android/app/build.gradle.kts",
  ]);
});

test("mobile-build-config rejects generated caches signing credentials release and unrelated domains", () => {
  const lane = classifyIssueLane({
    title: "Mobile build config broad platform folders",
    body: contractBody({
      lane: "mobile-build-config",
      allowedPaths: ["apps/mobile/android/**", "apps/mobile/ios/**", "apps/mobile/pubspec.yaml"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);

  const forbidden = [
    "apps/mobile/build/app.apk",
    "apps/mobile/.dart_tool/package_config.json",
    "apps/mobile/android/app/build/intermediates/manifest.xml",
    "apps/mobile/android/.gradle/caches/modules-2/files.jar",
    "apps/mobile/ios/Pods/Manifest.lock",
    "apps/mobile/ios/Flutter/Generated.xcconfig",
    "apps/mobile/ios/Runner/GeneratedPluginRegistrant.h",
    "apps/mobile/ios/Runner/GeneratedPluginRegistrant.m",
    "apps/mobile/ios/Runner/GeneratedPluginRegistrant.swift",
    "apps/mobile/ios/DerivedData/Build/Products/Runner.app",
    "apps/mobile/ios/Runner/cert.p12",
    "apps/mobile/ios/Runner/cert.pfx",
    "apps/mobile/ios/Runner/cert.cer",
    "apps/mobile/ios/Runner/profile.mobileprovision",
    "apps/mobile/android/upload.jks",
    "apps/mobile/android/release.keystore",
    "apps/mobile/android/key.properties",
    "apps/mobile/android/local.properties",
    "apps/mobile/ios/id_rsa",
    "apps/mobile/ios/id_ed25519",
    "apps/mobile/.env",
    "apps/mobile/.env.production",
    "apps/mobile/ios/private_signing_key.pem",
    "apps/mobile/ios/testflight/upload.json",
    "packages/client-dart/lib/generated/api_client.dart",
    ".github/workflows/codemagic.yml",
    "infra/docker-compose.yml",
    "services/api/Auth/SessionRuntime.cs",
    "apps/mobile/lib/bills/generated_bill_repository.dart",
  ];
  assert.deepEqual(filterForbiddenChangedFiles(forbidden, lane), forbidden);

  for (const allowedPath of [
    "apps/mobile/android/.gradle/**",
    "apps/mobile/ios/Pods/**",
    "apps/mobile/ios/Flutter/Generated.xcconfig",
    "apps/mobile/ios/Runner/GeneratedPluginRegistrant.*",
    "apps/mobile/android/key.properties",
    "apps/mobile/ios/Runner/profile.mobileprovision",
    "apps/mobile/ios/private_signing_key.pem",
  ]) {
    const classified = classifyIssueLane({
      title: "Forbidden mobile build config path",
      body: contractBody({
        lane: "mobile-build-config",
        allowedPaths: [allowedPath],
        validationProfile: "mobile-build-config",
        manualMergeRequired: false,
        autoMergeEligible: true,
      }),
      labels: ["auto-ready"],
    });
    assert.equal(classified.allowedToImplement, false, allowedPath);
    assert.equal(classified.dangerGate, true, allowedPath);
    assert.ok(classified.reasonCodes.includes("contract_path_forbidden"), allowedPath);
  }

  const outsideLaneEnvPath = classifyIssueLane({
    title: "Forbidden mobile build config env path",
    body: contractBody({
      lane: "mobile-build-config",
      allowedPaths: ["apps/mobile/.env"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-ready"],
  });
  assert.equal(outsideLaneEnvPath.allowedToImplement, false);
  assert.ok(outsideLaneEnvPath.reasonCodes.includes("contract_path_outside_lane"));
});

test("mobile-build-config validation profile is exact and lane-scoped", () => {
  const lane = classifyIssueLane({
    title: "Mobile build config validation",
    body: contractBody({
      lane: "mobile-build-config",
      allowedPaths: ["apps/mobile/pubspec.yaml"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.deepEqual(getValidationProfile("mobile-build-config"), [
    ["git", ["status", "--short"]],
    ["git", ["diff", "--name-only"]],
    ["git", ["diff", "--check"]],
    ["bash", ["-lc", "PATH=/opt/flutter/bin:$PATH npm run doctor:mobile"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter pub get"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter analyze"]],
    ["bash", ["-lc", "cd apps/mobile && /opt/flutter/bin/flutter test"]],
  ]);
  assert.deepEqual(planValidation(["apps/mobile/pubspec.yaml"], { ...lane, validationProfile: null }).map((item) => item.display), [
    "git status --short",
    "git diff --name-only",
    "git diff --check",
    "bash -lc PATH=/opt/flutter/bin:$PATH npm run doctor:mobile",
    "bash -lc cd apps/mobile && /opt/flutter/bin/flutter pub get",
    "bash -lc cd apps/mobile && /opt/flutter/bin/flutter analyze",
    "bash -lc cd apps/mobile && /opt/flutter/bin/flutter test",
    "bash -lc cd apps/mobile && /opt/flutter/bin/flutter build apk --debug",
    "bash -lc cd apps/mobile/android && ./gradlew :app:dependencies --configuration debugRuntimeClasspath",
    "bash -lc cd apps/mobile/android && ./gradlew :app:assembleDebug",
    "bash -lc cd apps/mobile && /opt/flutter/bin/flutter build web",
  ]);
  assert.deepEqual(inferMobileBuildPlatformRequirements(["apps/mobile/pubspec.yaml"], lane).externalCheckIds, [
    mobileBuildPlatformChecks.iosExternalBuild,
    mobileBuildPlatformChecks.linuxExternalBuild,
    mobileBuildPlatformChecks.macosExternalBuild,
    mobileBuildPlatformChecks.windowsExternalBuild,
  ]);
  assert.throws(() => planValidation(["apps/mobile/pubspec.yaml"], { ...lane, validationProfile: "unknown-mobile-profile" }), /Unsupported validation profile/);

  const unrelatedLane = classifyIssueLane({
    title: "Mobile app cannot borrow build profile",
    body: contractBody({
      lane: "mobile-application",
      allowedPaths: ["apps/mobile/lib/app/server_mode_shell.dart"],
      validationProfile: "mobile-build-config",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(unrelatedLane.allowedToImplement, false);
  assert.ok(unrelatedLane.reasonCodes.includes("validation_profile_not_allowed"));
});

test("mobile-build-config positive scope blocks live signing release and manual actions", () => {
  const lane = classifyIssueLane({
    title: "Mobile build config signing release",
    body: `${contractBody({
      lane: "mobile-build-config",
      allowedPaths: ["apps/mobile/ios/Runner/Info.plist"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    })}

## Scope

Submit to TestFlight and rotate the signing release credential.
`,
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, false);
  assert.equal(lane.manualActionRequired, true);
  assert.ok(lane.manualReasonCodes.includes("mobile_store_release"));
});

test("#818-style workflow docs canary ignores dangerous terms in non-goals", () => {
  const lane = classifyIssueLane({
    title: "Auto-runner canary: Gemini integrated workflow docs checkpoint",
    body: issue818StyleBody(),
    labels: ["auto-canary-ready", "workflow", "canary"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.equal(lane.dangerGate, false);
  assert.equal(lane.lane, "workflow-docs-tooling");
  assert.deepEqual(lane.dangerReasons, []);
  assert.deepEqual(lane.allowedPaths, ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"]);
});

test("valid workflow docs contract still blocks dangerous positive scope text", () => {
  const lane = classifyIssueLane({
    title: "Workflow docs canary with unsafe request",
    body: `${contractBody({
      allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
      validationProfile: "docs-only",
    })}

## Scope

Change auth/session/security runtime and settlement payment calculation behavior while updating docs.

## Non-goals

- no Docker/CI/deployment/env/secret changes.
`,
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, false);
  assert.equal(lane.dangerGate, true);
  assert.match(lane.reason, /positive scope/i);
  assert.ok(lane.dangerReasons.includes("auth_security"));
  assert.ok(lane.dangerReasons.includes("money_settlement"));
});

test("valid contract with dangerous allowed path fails closed as danger gate", () => {
  const lane = classifyIssueLane({
    title: "Workflow docs canary with runtime path",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["services/api/Auth/**"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, false);
  assert.equal(lane.dangerGate, true);
  assert.ok(lane.dangerReasons.includes("auth_security"));
  assert.match(lane.reason, /outside lane manifest/i);
});

test("malformed contract with dangerous text fails closed without leaking secrets", () => {
  const lane = classifyIssueLane({
    title: "Malformed workflow contract",
    body: `## Auto-runner contract

\`\`\`json
{"contractVersion":1,
\`\`\`

## Scope

Change deployment config, token storage, and auth security runtime. Secret sample: super-secret-token.
`,
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, false);
  assert.equal(lane.dangerGate, true);
  assert.ok(lane.dangerReasons.includes("auth_security"));
  assert.ok(lane.dangerReasons.includes("docker_ci_deploy"));
  assert.doesNotMatch(JSON.stringify(lane), /super-secret-token/);
});

test("normal dangerous issue without contract remains danger gated", () => {
  const lane = classifyIssueLane({
    title: "Change settlement payment calculation",
    body: "Update money rounding and OpenAPI generated clients for deployment.",
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, false);
  assert.equal(lane.dangerGate, true);
  assert.ok(lane.dangerReasons.includes("money_settlement"));
  assert.ok(lane.dangerReasons.includes("openapi_generated_client"));
});

test("explicit domain lane matrix marks approved-domain runnable implementation auto-merge capable", () => {
  const cases = [
    {
      lane: "workflow-docs-tooling",
      paths: ["tools/auto-runner/lib/lane-policy.mjs"],
      profile: "runner-tests",
      sensitivity: "low",
      branchStrategy: "normal",
      reviewerTier: "cheap_independent",
      scope: "Implement workflow tooling policy code.",
    },
    {
      lane: "docs-planning",
      paths: ["docs/planning/ISSUE_PROGRESS_LEDGER.md"],
      profile: "docs-only",
      sensitivity: "low",
      branchStrategy: "normal",
      reviewerTier: "cheap_independent",
      scope: "Update planning ledger documentation.",
    },
    {
      lane: "mobile-application",
      paths: ["apps/mobile/lib/features/example.dart", "apps/mobile/test/features/example_test.dart"],
      profile: "mobile",
      sensitivity: "standard",
      branchStrategy: "normal",
      reviewerTier: "cheap_independent",
      scope: "Implement mobile application UI behavior.",
    },
    {
      lane: "web-user-ui",
      paths: ["apps/web-user/src/App.tsx"],
      profile: "web-ui",
      sensitivity: "standard",
      branchStrategy: "normal",
      reviewerTier: "cheap_independent",
      scope: "Implement web user UI.",
    },
    {
      lane: "web-admin-ui",
      paths: ["apps/web-admin/src/Admin.tsx"],
      profile: "web-ui",
      sensitivity: "sensitive",
      branchStrategy: "focused",
      reviewerTier: "strong_independent",
      scope: "Implement admin UI code for existing local app routes.",
    },
    {
      lane: "api-domain-runtime",
      paths: ["services/api/Features/Example/ExampleService.cs"],
      profile: "api-domain",
      sensitivity: "sensitive",
      branchStrategy: "focused",
      reviewerTier: "strong_independent",
      scope: "Implement API/domain runtime code under server authority.",
    },
    {
      lane: "auth-session-security",
      paths: ["services/api/Auth/SessionRuntime.cs"],
      profile: "api-security",
      sensitivity: "high",
      branchStrategy: "focused",
      reviewerTier: "strong_independent",
      scope: "Implement auth session security code under API authority.",
    },
    {
      lane: "storage-file-privacy-authz",
      paths: ["services/api/Storage/FileAuthorizationService.cs"],
      profile: "api-storage",
      sensitivity: "high",
      branchStrategy: "focused",
      reviewerTier: "strong_independent",
      scope: "Implement storage file privacy authorization code under API authority.",
    },
    {
      lane: "money-settlement-payment",
      paths: ["services/api/Settlement/SettlementPolicy.cs"],
      profile: "api-money",
      sensitivity: "high",
      branchStrategy: "focused",
      reviewerTier: "strong_independent",
      scope: "Implement money settlement payment calculation code under API/domain authority.",
    },
    {
      lane: "schema-migrations",
      paths: ["services/api/Infrastructure/Migrations/202607121903_AddFoo.cs"],
      profile: "api-migrations",
      sensitivity: "high",
      branchStrategy: "focused",
      reviewerTier: "strong_independent",
      scope: "Generate schema migration code for review.",
    },
    {
      lane: "openapi-generated-clients",
      paths: [
        "packages/contracts/openapi/settleora.v1.yaml",
        "packages/client-web/src/generated/client.ts",
        "packages/client-dart/lib/generated/api.dart",
      ],
      profile: "openapi-generated-clients",
      sensitivity: "high",
      branchStrategy: "focused",
      reviewerTier: "strong_independent",
      scope: "Update OpenAPI and generated clients through generation validation.",
    },
    {
      lane: "sync-import-export-restore",
      paths: ["services/api/Sync/ImportRestoreService.cs"],
      profile: "sync-import-export",
      sensitivity: "high",
      branchStrategy: "focused",
      reviewerTier: "strong_independent",
      scope: "Implement sync import export restore acceptance code with API authoritative guardrails.",
    },
    {
      lane: "docker-compose-ci-deployment",
      paths: ["infra/docker-compose.yml"],
      profile: "compose-ci",
      sensitivity: "high",
      branchStrategy: "focused",
      reviewerTier: "strong_independent",
      scope: "Change Docker Compose code only.",
    },
  ];

  for (const item of cases) {
    const lane = classifyIssueLane({
      title: `${item.lane} implementation`,
      body: `${contractBody({
        lane: item.lane,
        allowedPaths: item.paths,
        validationProfile: item.profile,
        manualMergeRequired: true,
        autoMergeEligible: true,
      })}

## Scope

${item.scope}
`,
      labels: ["auto-ready"],
    });
    assert.equal(lane.allowedToImplement, true, item.lane);
    assert.equal(lane.prCreationAllowed, true, item.lane);
    assert.equal(lane.autoMergeEligible, true, item.lane);
    assert.equal(lane.manualMergeRequired, true, item.lane);
    assert.equal(lane.implementationSensitivity, item.sensitivity, item.lane);
    assert.equal(lane.branchStrategy, item.branchStrategy, item.lane);
    assert.equal(lane.reviewerTier, item.reviewerTier, item.lane);
    assert.deepEqual(filterForbiddenChangedFiles(item.paths, lane), [], item.lane);
    assert.ok(lane.reasonCodes.includes("contract_valid"), item.lane);
  }
});

test("genuine manual actions and split-required work fail closed with reason codes", () => {
  const manualCases = [
    ["production_deploy", "Deploy this Docker change to production."],
    ["mobile_store_release", "Submit the mobile build to TestFlight."],
    ["destructive_data_operation", "Execute destructive migration and drop table in production."],
    ["secret_credential_mutation", "Rotate the API secret token."],
    ["public_admin_exposure", "Expose admin UI through DNS and TLS reverse proxy."],
    ["architecture_replacement", "Replace architecture direction for sync."],
    ["force_history_rewrite", "Force push rewritten history."],
    ["branch_deletion_cleanup", "Delete branch after merge."],
    ["day1_scope_cut", "Reduce Day 1 scope for settlement."],
    ["unresolved_product_decision", "Unresolved financial semantics decision requires Tommy decision."],
  ];
  for (const [code, scope] of manualCases) {
    const lane = classifyIssueLane({
      title: `Manual ${code}`,
      body: `${contractBody({
        lane: "docker-compose-ci-deployment",
        allowedPaths: ["infra/docker-compose.yml"],
        validationProfile: "compose-ci",
      })}

## Scope

${scope}
`,
      labels: ["auto-ready"],
    });
    assert.equal(lane.allowedToImplement, false, code);
    assert.equal(lane.manualActionRequired, true, code);
    assert.ok(lane.manualReasonCodes.includes(code), code);
    assert.ok(lane.reasonCodes.includes("manual_action_required"), code);
  }

  const split = classifyIssueLane({
    title: "Cross-domain feature bundle",
    body: contractBody({
      lane: "cross-domain",
      allowedPaths: ["services/api/**", "apps/mobile/lib/**"],
      validationProfile: "api-domain",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(split.allowedToImplement, false);
  assert.equal(split.splitRequired, true);
  assert.equal(split.branchStrategy, "split-required");
  assert.ok(split.reasonCodes.includes("split_required"));
});

test("legacy sensitive lane aliases map deterministically to focused runnable policy", () => {
  const security = classifyIssueLane({
    title: "Legacy security lane",
    body: contractBody({
      lane: "security-runtime",
      allowedPaths: ["services/api/Auth/SessionRuntime.cs"],
      validationProfile: "api-security",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(security.allowedToImplement, true);
  assert.equal(security.canonicalLane, "auth-session-security");
  assert.equal(security.branchStrategy, "focused");
  assert.equal(security.reviewerTier, "strong_independent");
});

test("canary mode accepts only approved low-risk lanes", () => {
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

  const lowRiskUi = classifyIssueLane({
    title: "Mobile shared UI canary",
    body: contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready", "canary"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, lowRiskUi).allowed, false);

  const approvedLowRiskUi = classifyIssueLane({
    title: "Mobile shared UI manual canary",
    body: contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart"],
      validationProfile: "mobile-ui-low-risk",
    }),
    labels: ["auto-canary-ready", "canary"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, approvedLowRiskUi).allowed, true);

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

test("approved low-risk auto-merge canary accepts exact lane globs and least-privilege subsets", () => {
  const config = approvedLowRiskAutoMergeCanaryConfig();
  const workflow = classifyIssueLane({
    title: "Bounded auto merge canary",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["tools/auto-runner/**", "docs/workflow/**"],
      validationProfile: "runner-tests",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, workflow).allowed, true);

  const workflowSingleFile = classifyIssueLane({
    title: "Auto-merge canary 1: workflow docs checkpoint",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
      validationProfile: "docs-only",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, workflowSingleFile).allowed, true);

  const planning = classifyIssueLane({
    title: "Bounded planning auto merge canary",
    body: contractBody({
      lane: "docs-planning",
      allowedPaths: ["docs/planning/**", "docs/qa/**"],
      validationProfile: "docs-only",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, planning).allowed, true);

  const planningSingleFile = classifyIssueLane({
    title: "Auto-merge canary 2: planning docs checkpoint",
    body: contractBody({
      lane: "docs-planning",
      allowedPaths: ["docs/planning/ISSUE_PROGRESS_LEDGER.md"],
      validationProfile: "docs-only",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, planningSingleFile).allowed, true);

  const qaSingleFile = classifyIssueLane({
    title: "Bounded QA docs auto merge canary",
    body: contractBody({
      lane: "docs-planning",
      allowedPaths: ["docs/qa/some-safe-file.md"],
      validationProfile: "docs-only",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, qaSingleFile).allowed, true);

  const lowRiskUi = classifyIssueLane({
    title: "Low-risk mobile UI auto merge canary",
    body: contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart", "apps/mobile/test/ui/settleora_component_guardrail_test.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready", "canary"],
  });
  assert.equal(evaluateCanaryIssuePolicy(config, lowRiskUi).allowed, true);
});

test("canary profile lane allowlist excludes historical canaries before implementation", () => {
  const config = {
    ...approvedLowRiskAutoMergeCanaryConfig(),
    autoMergePolicy: { approvedLanes: ["workflow-docs-tooling"] },
  };
  const historicalClientUi = classifyIssueLane({
    title: "Historical protected client UI canary",
    body: contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready", "canary"],
  });
  const decision = evaluateCanaryIssuePolicy(config, historicalClientUi);
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /not approved by the active profile/);
});

test("approved low-risk auto-merge canary rejects broad, runtime, traversal, and non-canary lane paths", () => {
  const config = approvedLowRiskAutoMergeCanaryConfig();
  for (const body of [
    contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["docs/**"],
      validationProfile: "runner-tests",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["**"],
      validationProfile: "runner-tests",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["."],
      validationProfile: "runner-tests",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["tools/auto-runner/**", "docs/workflow/**", "scripts/ai/**"],
      validationProfile: "runner-tests",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["services/api/Auth/**"],
      validationProfile: "runner-tests",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/**"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/ui/**", "apps/mobile/lib/auth/**"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["packages/client-dart/lib/generated/**"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
  ]) {
    const unsafe = classifyIssueLane({ title: "Unsafe canary", body, labels: ["auto-canary-ready"] });
    assert.equal(evaluateCanaryIssuePolicy(config, unsafe).allowed, false);
  }

  const traversal = parseAutoRunnerContract(contractBody({
    lane: "docs-planning",
    allowedPaths: ["docs/planning/../workflow/AUTONOMOUS_CODEX_RUNNER.md"],
    validationProfile: "docs-only",
    manualMergeRequired: false,
    autoMergeEligible: true,
  }));
  assert.equal(traversal.ok, false);
  assert.match(traversal.reason, /repo-relative forward-slash/);
});

test("low-risk auto-merge canary approval rejects unsafe config shapes", () => {
  const approved = approvedLowRiskAutoMergeCanaryConfig();
  assert.equal(evaluateLowRiskAutoMergeCanaryApproval(approved).approved, true);
  assert.equal(evaluateLowRiskAutoMergeCanaryApproval({ ...approved, trustedRealRunApproved: true }).approved, false);
  assert.equal(evaluateLowRiskAutoMergeCanaryApproval({ ...approved, allowStaleClaimSteal: true }).approved, false);
  assert.equal(evaluateLowRiskAutoMergeCanaryApproval({ ...approved, requestedMaxIterations: 3 }).approved, false);
});

test("built-in default and explicit false config block auto-merge", () => {
  const builtIn = loadConfig({ ...parseCliArgs(["--dry-run"]), configPath: null });
  assert.equal(builtIn.allowAutoMerge, false);
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ config: builtIn })).reason, "auto_merge_disabled_by_config");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ config: { ...builtIn, allowAutoMerge: false } })).eligible, false);
});

test("contract manual merge and non-eligible flags block auto-merge", () => {
  assert.equal(
    evaluateAutoMergeDecision({
      ...autoMergeContext(),
      laneDecision: autoMergeLane({ manualMergeRequired: true, autoMergeEligible: true }),
    }).reason,
    "manual_merge_required",
  );
  assert.equal(
    evaluateAutoMergeDecision({
      ...autoMergeContext(),
      laneDecision: autoMergeLane({ manualMergeRequired: false, autoMergeEligible: false }),
    }).reason,
    "contract_not_auto_merge_eligible",
  );
});

test("approved low-risk lane with exact allowed paths and exact-head checks allows merge decision", () => {
  const decision = evaluateAutoMergeDecision(autoMergeContext());
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "all_auto_merge_gates_passed");
  assert.equal(decision.prHeadSha, "head123");
});

test("approved-domain auto-merge accepts GitHub workflow-prefixed required check names", () => {
  const decision = evaluateAutoMergeDecision(autoMergeContext({
    requiredChecks: [
      { name: "Scaffold Validation / Validate scaffold", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "CodeQL / Analyze (csharp)", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Security Semgrep CE Scan / Semgrep CE scan", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Security Trivy Scan / Trivy repository scan", status: "COMPLETED", conclusion: "SUCCESS" },
    ],
  }));
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "all_auto_merge_gates_passed");
});

test("approved-domain auto-merge blocks unlisted exact-head check failures", () => {
  const decision = evaluateAutoMergeDecision(autoMergeContext({
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Unlisted exact-head check", status: "COMPLETED", conclusion: "FAILURE" },
    ],
  }));
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "required_checks_not_successful");
});

test("approved-domain all-observed exact-head check conclusions fail closed", () => {
  const terminalFailures = ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STALE", "STARTUP_FAILURE"];
  for (const conclusion of terminalFailures) {
    const decision = evaluateAutoMergeDecision(autoMergeContext({
      requiredChecks: [
        ...autoMergeRequiredChecks(),
        { name: `unlisted-${conclusion}`, status: "COMPLETED", conclusion },
      ],
    }));
    assert.equal(decision.eligible, false, conclusion);
    assert.equal(decision.reason, "required_checks_not_successful", conclusion);
  }

  const missingConclusion = evaluateAutoMergeDecision(autoMergeContext({
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Unlisted missing conclusion", status: "COMPLETED", conclusion: null },
    ],
  }));
  assert.equal(missingConclusion.eligible, false);
  assert.equal(missingConclusion.reason, "required_checks_not_successful");
});

test("approved-domain all-observed exact-head pending checks wait even when unlisted", () => {
  const decision = evaluateAutoMergeDecision(autoMergeContext({
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Unlisted pending check", status: "IN_PROGRESS", conclusion: null },
    ],
  }));
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "required_checks_pending");
});

test("approved-domain required check presence and exact-name matching stay fail closed", () => {
  const missing = evaluateAutoMergeDecision(autoMergeContext({
    requiredChecks: autoMergeRequiredChecks().filter((check) => check.name !== "CodeQL"),
  }));
  assert.equal(missing.eligible, false);
  assert.equal(missing.reason, "required_checks_not_successful");

  const spoof = evaluateAutoMergeDecision(autoMergeContext({
    requiredChecks: [
      { name: "Validate scaffold spoof", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "CodeQL", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Semgrep CE scan", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Trivy repository scan", status: "COMPLETED", conclusion: "SUCCESS" },
    ],
  }));
  assert.equal(spoof.eligible, false);
  assert.equal(spoof.reason, "required_checks_not_successful");
});

test("approved-domain skipped and neutral check conclusions require canonical allowlists", () => {
  const skippedAllowed = evaluateAutoMergeDecision(autoMergeContext({
    config: { autoMergePolicy: autoMergePolicyFixture({ allowedSkippedChecks: ["Optional docs"] }) },
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Optional docs", status: "COMPLETED", conclusion: "SKIPPED" },
    ],
  }));
  assert.equal(skippedAllowed.eligible, true);
  assert.equal(skippedAllowed.reason, "all_auto_merge_gates_passed");

  const skippedUnlisted = evaluateAutoMergeDecision(autoMergeContext({
    config: { autoMergePolicy: autoMergePolicyFixture({ allowedSkippedChecks: ["Optional docs"] }) },
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Other optional docs", status: "COMPLETED", conclusion: "SKIPPED" },
    ],
  }));
  assert.equal(skippedUnlisted.eligible, false);
  assert.equal(skippedUnlisted.reason, "required_checks_not_successful");

  const neutralAllowed = evaluateAutoMergeDecision(autoMergeContext({
    config: { autoMergePolicy: autoMergePolicyFixture({ allowedNeutralChecks: ["Optional advisory"] }) },
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Advisory / Optional advisory", status: "COMPLETED", conclusion: "NEUTRAL" },
    ],
  }));
  assert.equal(neutralAllowed.eligible, true);
  assert.equal(neutralAllowed.reason, "all_auto_merge_gates_passed");

  const neutralUnlisted = evaluateAutoMergeDecision(autoMergeContext({
    config: { autoMergePolicy: autoMergePolicyFixture({ allowedNeutralChecks: ["Optional advisory"] }) },
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Other optional advisory", status: "COMPLETED", conclusion: "NEUTRAL" },
    ],
  }));
  assert.equal(neutralUnlisted.eligible, false);
  assert.equal(neutralUnlisted.reason, "required_checks_not_successful");
});

test("approved-domain duplicate check records cannot mask failed or pending instances", () => {
  const duplicateFailure = evaluateAutoMergeDecision(autoMergeContext({
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Duplicate optional", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Duplicate optional", status: "COMPLETED", conclusion: "FAILURE" },
    ],
  }));
  assert.equal(duplicateFailure.eligible, false);
  assert.equal(duplicateFailure.reason, "required_checks_not_successful");

  const duplicatePending = evaluateAutoMergeDecision(autoMergeContext({
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Duplicate optional", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "Duplicate optional", status: "QUEUED", conclusion: null },
    ],
  }));
  assert.equal(duplicatePending.eligible, false);
  assert.equal(duplicatePending.reason, "required_checks_pending");

  const failedPlusPending = evaluateAutoMergeDecision(autoMergeContext({
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Mixed optional", status: "COMPLETED", conclusion: "FAILURE" },
      { name: "Other optional", status: "QUEUED", conclusion: null },
    ],
  }));
  assert.equal(failedPlusPending.eligible, false);
  assert.equal(failedPlusPending.reason, "required_checks_not_successful");

  const allowedSkippedPlusFailure = evaluateAutoMergeDecision(autoMergeContext({
    config: { autoMergePolicy: autoMergePolicyFixture({ allowedSkippedChecks: ["Duplicate optional"] }) },
    requiredChecks: [
      ...autoMergeRequiredChecks(),
      { name: "Duplicate optional", status: "COMPLETED", conclusion: "SKIPPED" },
      { name: "Duplicate optional", status: "COMPLETED", conclusion: "FAILURE" },
    ],
  }));
  assert.equal(allowedSkippedPlusFailure.eligible, false);
  assert.equal(allowedSkippedPlusFailure.reason, "required_checks_not_successful");
});

test("approved-domain auto-merge matrix covers all canonical runnable lanes including high-risk focused lanes", () => {
  const autoMergeCases = [
    ["workflow-docs-tooling", "cheap_independent", "normal", "tools/auto-runner/lib/auto-merge-policy.mjs", "runner-tests", "low"],
    ["mobile-application", "cheap_independent", "normal", "apps/mobile/lib/features/example.dart", "mobile", "standard"],
    ["mobile-build-config", "strong_independent", "focused", "apps/mobile/android/app/src/main/AndroidManifest.xml", "mobile-build-config", "high"],
    ["web-user-ui", "cheap_independent", "normal", "apps/web-user/src/App.tsx", "web-ui", "standard"],
    ["web-admin-ui", "strong_independent", "focused", "apps/web-admin/src/Admin.tsx", "web-ui", "sensitive"],
    ["api-domain-runtime", "strong_independent", "focused", "services/api/Features/Example/ExampleService.cs", "api-domain", "sensitive"],
    ["auth-session-security", "strong_independent", "focused", "services/api/Auth/SessionRuntime.cs", "api-security", "high"],
    ["storage-file-privacy-authz", "strong_independent", "focused", "services/api/Storage/FileAuthorizationService.cs", "api-storage", "high"],
    ["money-settlement-payment", "strong_independent", "focused", "services/api/Settlement/SettlementPolicy.cs", "api-money", "high"],
    ["schema-migrations", "strong_independent", "focused", "services/api/Infrastructure/Migrations/202607121903_AddFoo.cs", "api-migrations", "high"],
    ["openapi-generated-clients", "strong_independent", "focused", "packages/contracts/openapi/settleora.v1.yaml", "openapi-generated-clients", "high"],
    ["sync-import-export-restore", "strong_independent", "focused", "services/api/Sync/ImportRestoreService.cs", "sync-import-export", "high"],
    ["docker-compose-ci-deployment", "strong_independent", "focused", "infra/docker-compose.yml", "compose-ci", "high"],
  ];
  for (const [lane, tier, branchStrategy, filePath, profile, implementationSensitivity] of autoMergeCases) {
    const branchName = `${branchStrategy === "focused" ? "focused" : "feature"}/auto-1-test`;
    const laneDecision = autoMergeLane({
      lane,
      canonicalLane: lane,
      reviewerTier: tier,
      branchStrategy,
      allowedPaths: [filePath],
      laneManifestAllowedPaths: [filePath],
      validationProfile: profile,
      implementationSensitivity,
      laneManifest: { id: lane, decisionType: "runnable", autoMergeAllowed: true },
      contract: { allowedPaths: [filePath], validationProfile: profile, manualMergeRequired: false, autoMergeEligible: true },
    });
    const decision = evaluateAutoMergeDecision(autoMergeContext({
      laneDecision,
      changedFiles: [filePath],
      branchName,
      pr: { headRefName: branchName },
    }));
    assert.equal(decision.reason, "all_auto_merge_gates_passed", lane);
    assert.equal(decision.eligible, true, lane);
  }

  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ config: { allowAutoMerge: true, autoMergePolicy: { approvedLanes: [], requiredChecks: ["Validate scaffold"], allowedSkippedChecks: [] } } })).reason, "lane_not_in_approved_auto_merge_config");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ laneDecision: autoMergeLane({ lane: "cross-domain", canonicalLane: "cross-domain", splitRequired: true, branchStrategy: "split-required", laneManifest: { id: "cross-domain", decisionType: "split_required", autoMergeAllowed: false } }) })).reason, "lane_not_approved_domain_auto_merge_supported");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ laneDecision: autoMergeLane({ lane: "product-runtime", canonicalLane: "product-runtime", laneManifest: { id: "product-runtime", decisionType: "manual", autoMergeAllowed: false } }) })).reason, "lane_not_approved_domain_auto_merge_supported");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ laneDecision: autoMergeLane({ manualActionRequired: true }) })).reason, "manual_or_danger_gate_present");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ laneDecision: autoMergeLane({ branchStrategy: "focused" }) })).reason, "branch_strategy_mismatch");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ pr: { title: "No issue", body: "No linkage" } })).reason, "pr_missing_issue_linkage");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ validation: { passed: true } })).reason, "validation_exact_evidence_missing");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ externalReview: { status: "pass", verdict: "pass", reviewedHead: "head123", changedFiles: ["other"], tier: "cheap_independent", independent: true, completedAt: "2026-07-12T00:00:00.000Z" } })).reason, "independent_review_files_mismatch");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ review: { verdict: { verdict: "approve" }, reviewedHead: "head123", changedFiles: ["other"], completedAt: "2026-07-12T00:00:00.000Z" } })).reason, "codex_mechanics_review_files_mismatch");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ requiredChecks: [] })).reason, "required_checks_not_successful");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ codeScanningAlerts: [{ state: "open" }] })).reason, "open_code_scanning_alerts");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ reviewThreads: [{ isResolved: false }] })).reason, "unresolved_review_threads");
  assert.throws(() => normalizeAutoMergePolicy({ approvedLanes: ["security-runtime"], requiredChecks: ["Validate scaffold"] }), /alias/);
  assert.throws(() => normalizeAutoMergePolicy({ approvedLanes: ["unknown-lane"], requiredChecks: ["Validate scaffold"] }), /Unknown/);
  assert.deepEqual(normalizeAutoMergePolicy({}).allowedNeutralChecks, []);
  assert.throws(
    () => normalizeAutoMergePolicy({ allowedNeutralChecks: ["Workflow / Optional advisory"] }),
    /canonical check names/,
  );
});

test("high-risk approved-domain auto-merge keeps strong-review and exact-gate failures fail-closed", () => {
  const laneDecision = autoMergeLane({
    lane: "auth-session-security",
    canonicalLane: "auth-session-security",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
    allowedPaths: ["services/api/Auth/SessionRuntime.cs"],
    laneManifestAllowedPaths: ["services/api/Auth/SessionRuntime.cs"],
    validationProfile: "api-security",
    implementationSensitivity: "high",
    laneManifest: { id: "auth-session-security", decisionType: "runnable", autoMergeAllowed: true },
    contract: {
      allowedPaths: ["services/api/Auth/SessionRuntime.cs"],
      validationProfile: "api-security",
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  const base = {
    laneDecision,
    changedFiles: ["services/api/Auth/SessionRuntime.cs"],
    branchName: "focused/auto-1-test",
    pr: { headRefName: "focused/auto-1-test" },
  };

  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({
      ...base,
      externalReview: { status: "pass", verdict: "pass", reviewedHead: "head123", tier: "cheap_independent", changedFiles: base.changedFiles, changedFilesDigest: sha256Strings(base.changedFiles), provider: "gemini", independent: true, completedAt: "2026-07-12T00:00:00.000Z" },
    })).reason,
    "independent_review_tier_downgrade",
  );
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, laneDecision: { ...laneDecision, manualMergeRequired: true } })).reason, "manual_merge_required");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, laneDecision: { ...laneDecision, manualActionRequired: true } })).reason, "manual_or_danger_gate_present");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, pr: { headRefName: "focused/auto-1-test", headRefOid: "stale" }, actualHeadSha: "stale" })).reason, "pr_head_sha_mismatch");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, currentOriginMainSha: "base-new" })).reason, "origin_main_base_mismatch");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, changedFiles: ["services/api/Authz/SessionRuntime.cs"] })).reason, "forbidden_changed_files:services/api/Authz/SessionRuntime.cs");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, reviewThreads: [{ isResolved: false }] })).reason, "unresolved_review_threads");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, requiredChecks: autoMergeRequiredChecks({ CodeQL: { status: "COMPLETED", conclusion: "FAILURE" } }) })).reason, "required_checks_not_successful");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, codeScanningAlerts: [{ state: "open" }] })).reason, "open_code_scanning_alerts");
});

test("mobile-build-config auto-merge requires strong review exact gates and blocks forbidden platform boundaries", () => {
  const laneDecision = autoMergeLane({
    lane: "mobile-build-config",
    canonicalLane: "mobile-build-config",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
    allowedPaths: ["apps/mobile/android/app/src/main/AndroidManifest.xml"],
    laneManifestAllowedPaths: ["apps/mobile/android/**"],
    validationProfile: "mobile-build-config",
    implementationSensitivity: "high",
    laneManifest: { id: "mobile-build-config", decisionType: "runnable", autoMergeAllowed: true },
    contract: {
      allowedPaths: ["apps/mobile/android/app/src/main/AndroidManifest.xml"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  const base = {
    laneDecision,
    changedFiles: ["apps/mobile/android/app/src/main/AndroidManifest.xml"],
    branchName: "focused/auto-911-test",
    pr: { headRefName: "focused/auto-911-test" },
  };

  assert.equal(evaluateAutoMergeDecision(autoMergeContext(base)).reason, "all_auto_merge_gates_passed");
  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({
      ...base,
      externalReview: { status: "pass", verdict: "pass", reviewedHead: "head123", tier: "cheap_independent", changedFiles: base.changedFiles, changedFilesDigest: sha256Strings(base.changedFiles), provider: "gemini", independent: true, completedAt: "2026-07-12T00:00:00.000Z" },
    })).reason,
    "independent_review_tier_downgrade",
  );
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, laneDecision: { ...laneDecision, manualMergeRequired: true } })).reason, "manual_merge_required");
  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({ ...base, config: { allowAutoMerge: true, autoMergePolicy: autoMergePolicyFixture({ approvedLanes: [] }) } })).reason,
    "lane_not_in_approved_auto_merge_config",
  );
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, branchName: "feature/auto-911-test", pr: { headRefName: "feature/auto-911-test" } })).reason, "branch_strategy_mismatch");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, pr: { headRefName: "focused/auto-911-test", headRefOid: "stale" }, actualHeadSha: "stale" })).reason, "pr_head_sha_mismatch");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, currentOriginMainSha: "base-new" })).reason, "origin_main_base_mismatch");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, requiredChecks: autoMergeRequiredChecks({ "Validate scaffold": { status: "COMPLETED", conclusion: "FAILURE" } }) })).reason, "required_checks_not_successful");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, codeScanningAlerts: [{ state: "open" }] })).reason, "open_code_scanning_alerts");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ ...base, reviewThreads: [{ isResolved: false }] })).reason, "unresolved_review_threads");

  for (const filePath of [
    "apps/mobile/android/.gradle/caches/modules.jar",
    "apps/mobile/ios/Pods/Manifest.lock",
    "apps/mobile/android/release.keystore",
    "packages/client-dart/lib/generated/api_client.dart",
    ".github/workflows/mobile-release.yml",
  ]) {
    const decision = evaluateAutoMergeDecision(autoMergeContext({ ...base, changedFiles: [filePath] }));
    assert.match(decision.reason, /^forbidden_changed_files:/, filePath);
    assert.equal(decision.eligible, false, filePath);
  }
});

test("mobile-build-config appends platform proof from actual changed files and broad globs cannot bypass it", () => {
  const lane = classifyIssueLane({
    title: "Mobile build config broad Android contract",
    body: contractBody({
      lane: "mobile-build-config",
      allowedPaths: ["apps/mobile/android/**", "apps/mobile/ios/**"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-ready"],
  });
  const androidPlan = planValidation(["apps/mobile/android/app/src/main/AndroidManifest.xml"], lane);
  assert.deepEqual(androidPlan.mobileBuildPlatformRequirements.localCheckIds, [
    mobileBuildPlatformChecks.androidFlutterBuildApkDebug,
    mobileBuildPlatformChecks.androidGradleDebugRuntimeClasspath,
    mobileBuildPlatformChecks.androidGradleAssembleDebug,
  ]);
  assert.deepEqual(androidPlan.mobileBuildPlatformRequirements.externalCheckIds, []);
  assert.ok(androidPlan.some((item) => item.platformBuildCheckId === mobileBuildPlatformChecks.androidGradleAssembleDebug));

  const iosPlan = planValidation(["apps/mobile/ios/Runner/Info.plist"], lane);
  assert.deepEqual(iosPlan.mobileBuildPlatformRequirements.localCheckIds, []);
  assert.deepEqual(iosPlan.mobileBuildPlatformRequirements.externalCheckIds, [mobileBuildPlatformChecks.iosExternalBuild]);
});

test("mobile-build-config web and linux paths use supported local proof or fail-closed external proof", () => {
  const lane = autoMergeLane({
    lane: "mobile-build-config",
    canonicalLane: "mobile-build-config",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
    allowedPaths: ["apps/mobile/web/manifest.json"],
    laneManifestAllowedPaths: ["apps/mobile/web/**"],
    validationProfile: "mobile-build-config",
    implementationSensitivity: "high",
    laneManifest: { id: "mobile-build-config", decisionType: "runnable", autoMergeAllowed: true },
    contract: {
      allowedPaths: ["apps/mobile/web/manifest.json"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  assert.deepEqual(inferMobileBuildPlatformRequirements(["apps/mobile/web/manifest.json"], lane).localCheckIds, [
    mobileBuildPlatformChecks.webFlutterBuildWeb,
  ]);
  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({
      laneDecision: lane,
      changedFiles: ["apps/mobile/web/manifest.json"],
      branchName: "focused/auto-911-test",
      pr: { headRefName: "focused/auto-911-test" },
    })).reason,
    "all_auto_merge_gates_passed",
  );

  const linuxLane = { ...lane, allowedPaths: ["apps/mobile/linux/CMakeLists.txt"], laneManifestAllowedPaths: ["apps/mobile/linux/**"], contract: { ...lane.contract, allowedPaths: ["apps/mobile/linux/CMakeLists.txt"] } };
  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({
      laneDecision: linuxLane,
      changedFiles: ["apps/mobile/linux/CMakeLists.txt"],
      branchName: "focused/auto-911-test",
      pr: { headRefName: "focused/auto-911-test" },
      externalPlatformBuildEvidence: [],
    })).reason,
    `mobile_platform_external_check_missing:${mobileBuildPlatformChecks.linuxExternalBuild}`,
  );
});

test("mobile-build-config platform auto-merge blocks failed local Android proof", () => {
  const laneDecision = autoMergeLane({
    lane: "mobile-build-config",
    canonicalLane: "mobile-build-config",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
    allowedPaths: ["apps/mobile/android/app/build.gradle.kts"],
    laneManifestAllowedPaths: ["apps/mobile/android/**"],
    validationProfile: "mobile-build-config",
    implementationSensitivity: "high",
    laneManifest: { id: "mobile-build-config", decisionType: "runnable", autoMergeAllowed: true },
    contract: {
      allowedPaths: ["apps/mobile/android/app/build.gradle.kts"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  const changedFiles = ["apps/mobile/android/app/build.gradle.kts"];
  const fileDigest = sha256Strings(changedFiles);
  const requirements = inferMobileBuildPlatformRequirements(changedFiles, laneDecision);
  const validation = {
    passed: true,
    profile: "mobile-build-config",
    headSha: "head123",
    baseSha: "base123",
    changedFiles,
    changedFilesDigest: fileDigest,
    completedAt: "2026-07-12T00:00:00.000Z",
    results: [{ command: "fixture", status: 0 }],
    mobileBuildPlatformEvidence: {
      headSha: "head123",
      baseSha: "base123",
      changedFilesDigest: fileDigest,
      platforms: requirements.platforms,
      localCheckIds: requirements.localCheckIds,
      externalCheckIds: requirements.externalCheckIds,
      localChecks: requirements.localCheckIds.map((checkId) => ({
        checkId,
        command: `fixture ${checkId}`,
        status: checkId === mobileBuildPlatformChecks.androidGradleAssembleDebug ? 1 : 0,
        passed: checkId !== mobileBuildPlatformChecks.androidGradleAssembleDebug,
      })),
    },
  };
  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({
      laneDecision,
      changedFiles,
      branchName: "focused/auto-911-test",
      pr: { headRefName: "focused/auto-911-test" },
      validation,
    })).reason,
    `mobile_platform_local_check_failed:${mobileBuildPlatformChecks.androidGradleAssembleDebug}`,
  );
});

test("mobile-build-config iOS macOS Windows and dependency changes require exact successful platform evidence", () => {
  const baseLane = autoMergeLane({
    lane: "mobile-build-config",
    canonicalLane: "mobile-build-config",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
    allowedPaths: ["apps/mobile/ios/Runner/Info.plist"],
    laneManifestAllowedPaths: ["apps/mobile/ios/**", "apps/mobile/macos/**", "apps/mobile/windows/**", "apps/mobile/pubspec.yaml", "apps/mobile/pubspec.lock"],
    validationProfile: "mobile-build-config",
    implementationSensitivity: "high",
    laneManifest: { id: "mobile-build-config", decisionType: "runnable", autoMergeAllowed: true },
    contract: {
      allowedPaths: ["apps/mobile/ios/Runner/Info.plist"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  const cases = [
    ["apps/mobile/ios/Runner/Info.plist", mobileBuildPlatformChecks.iosExternalBuild],
    ["apps/mobile/macos/Runner/Info.plist", mobileBuildPlatformChecks.macosExternalBuild],
    ["apps/mobile/windows/CMakeLists.txt", mobileBuildPlatformChecks.windowsExternalBuild],
    ["apps/mobile/pubspec.lock", mobileBuildPlatformChecks.iosExternalBuild],
  ];
  for (const [filePath, checkId] of cases) {
    const laneDecision = {
      ...baseLane,
      allowedPaths: [filePath],
      contract: { ...baseLane.contract, allowedPaths: [filePath] },
    };
    const missing = evaluateAutoMergeDecision(autoMergeContext({
      laneDecision,
      changedFiles: [filePath],
      branchName: "focused/auto-911-test",
      pr: { headRefName: "focused/auto-911-test" },
      externalPlatformBuildEvidence: [],
    }));
    assert.equal(missing.reason, `mobile_platform_external_check_missing:${checkId}`, filePath);

    const skipped = evaluateAutoMergeDecision(autoMergeContext({
      laneDecision,
      changedFiles: [filePath],
      branchName: "focused/auto-911-test",
      pr: { headRefName: "focused/auto-911-test" },
      externalPlatformBuildEvidence: [{
        checkId,
        status: "COMPLETED",
        conclusion: "SKIPPED",
        headSha: "head123",
        baseSha: "base123",
        changedFilesDigest: sha256Strings([filePath]),
        platforms: inferMobileBuildPlatformRequirements([filePath], laneDecision).platforms,
      }],
    }));
    assert.equal(skipped.reason, `mobile_platform_external_check_not_successful:${checkId}`, filePath);

    const stale = evaluateAutoMergeDecision(autoMergeContext({
      laneDecision,
      changedFiles: [filePath],
      branchName: "focused/auto-911-test",
      pr: { headRefName: "focused/auto-911-test" },
      externalPlatformBuildEvidence: [{
        checkId,
        status: "COMPLETED",
        conclusion: "SUCCESS",
        headSha: "old-head",
        baseSha: "base123",
        changedFilesDigest: sha256Strings([filePath]),
        platforms: inferMobileBuildPlatformRequirements([filePath], laneDecision).platforms,
      }],
    }));
    assert.equal(stale.reason, `mobile_platform_external_check_head_mismatch:${checkId}`, filePath);
  }
});

test("mobile-build-config external platform evidence is bound to the inferred platform set", () => {
  const laneDecision = autoMergeLane({
    lane: "mobile-build-config",
    canonicalLane: "mobile-build-config",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
    allowedPaths: ["apps/mobile/pubspec.lock"],
    laneManifestAllowedPaths: ["apps/mobile/pubspec.lock"],
    validationProfile: "mobile-build-config",
    implementationSensitivity: "high",
    laneManifest: { id: "mobile-build-config", decisionType: "runnable", autoMergeAllowed: true },
    contract: {
      allowedPaths: ["apps/mobile/pubspec.lock"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  const changedFiles = ["apps/mobile/pubspec.lock"];
  const requirements = inferMobileBuildPlatformRequirements(changedFiles, laneDecision);
  const decision = evaluateAutoMergeDecision(autoMergeContext({
    laneDecision,
    changedFiles,
    branchName: "focused/auto-911-test",
    pr: { headRefName: "focused/auto-911-test" },
    externalPlatformBuildEvidence: requirements.externalCheckIds.map((checkId) => ({
      checkId,
      status: "COMPLETED",
      conclusion: "SUCCESS",
      headSha: "head123",
      baseSha: "base123",
      changedFilesDigest: sha256Strings(changedFiles),
      platforms: checkId === mobileBuildPlatformChecks.iosExternalBuild ? ["ios"] : requirements.platforms,
    })),
  }));
  assert.equal(
    decision.reason,
    `mobile_platform_external_check_platform_set_mismatch:${mobileBuildPlatformChecks.iosExternalBuild}`,
  );
});

test("mobile-build-config similarly named platform checks do not satisfy canonical evidence", () => {
  const laneDecision = autoMergeLane({
    lane: "mobile-build-config",
    canonicalLane: "mobile-build-config",
    reviewerTier: "strong_independent",
    branchStrategy: "focused",
    allowedPaths: ["apps/mobile/ios/Runner/Info.plist"],
    laneManifestAllowedPaths: ["apps/mobile/ios/**"],
    validationProfile: "mobile-build-config",
    implementationSensitivity: "high",
    laneManifest: { id: "mobile-build-config", decisionType: "runnable", autoMergeAllowed: true },
    contract: {
      allowedPaths: ["apps/mobile/ios/Runner/Info.plist"],
      validationProfile: "mobile-build-config",
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  const changedFiles = ["apps/mobile/ios/Runner/Info.plist"];
  const decision = evaluateAutoMergeDecision(autoMergeContext({
    laneDecision,
    changedFiles,
    branchName: "focused/auto-911-test",
    pr: { headRefName: "focused/auto-911-test" },
    externalPlatformBuildEvidence: [{
      checkId: `${mobileBuildPlatformChecks.iosExternalBuild}:extra`,
      status: "COMPLETED",
      conclusion: "SUCCESS",
      headSha: "head123",
      baseSha: "base123",
      changedFilesDigest: sha256Strings(changedFiles),
      platforms: inferMobileBuildPlatformRequirements(changedFiles, laneDecision).platforms,
    }],
  }));
  assert.equal(decision.reason, `mobile_platform_external_check_missing:${mobileBuildPlatformChecks.iosExternalBuild}`);
});

test("exact canonical GitHub platform checks populate production external evidence", () => {
  const filePath = "apps/mobile/ios/Runner/Info.plist";
  const laneDecision = autoMergeLane({
    lane: "mobile-build-config", canonicalLane: "mobile-build-config", reviewerTier: "strong_independent",
    branchStrategy: "focused", allowedPaths: [filePath], laneManifestAllowedPaths: ["apps/mobile/ios/**"],
    validationProfile: "mobile-build-config", implementationSensitivity: "high",
    laneManifest: { id: "mobile-build-config", decisionType: "runnable", autoMergeAllowed: true },
    contract: { allowedPaths: [filePath], validationProfile: "mobile-build-config", manualMergeRequired: false, autoMergeEligible: true },
  });
  const checkId = mobileBuildPlatformChecks.iosExternalBuild;
  const context = autoMergeContext({
    laneDecision, changedFiles: [filePath], branchName: "focused/auto-911-test", pr: { headRefName: "focused/auto-911-test" },
    externalPlatformBuildEvidence: [], requiredChecks: [{ name: checkId, status: "COMPLETED", conclusion: "SUCCESS" }],
  });
  assert.notEqual(evaluateAutoMergeDecision(context).reason, `mobile_platform_external_check_missing:${checkId}`);
});

test("api-domain auto-merge cannot carry manual-gated API domains through broad service paths", () => {
  const forbiddenPaths = [
    "services/api/Auth/SessionRuntime.cs",
    "services/api/Storage/FileAuthorizationService.cs",
    "services/api/Settlement/SettlementPolicy.cs",
    "services/api/Infrastructure/Migrations/202607121903_AddFoo.cs",
    "services/api/OpenApi/GeneratedClientRefresh.cs",
    "services/api/Sync/ImportRestoreService.cs",
  ];
  for (const filePath of forbiddenPaths) {
    const laneDecision = autoMergeLane({
      lane: "api-domain-runtime",
      canonicalLane: "api-domain-runtime",
      reviewerTier: "strong_independent",
      branchStrategy: "focused",
      allowedPaths: ["services/api/**"],
      laneManifestAllowedPaths: ["services/api/**"],
      validationProfile: "api-domain",
      implementationSensitivity: "sensitive",
      laneManifest: { id: "api-domain-runtime", decisionType: "runnable", autoMergeAllowed: true },
      contract: { allowedPaths: ["services/api/**"], validationProfile: "api-domain", manualMergeRequired: false, autoMergeEligible: true },
    });
    const decision = evaluateAutoMergeDecision(autoMergeContext({
      laneDecision,
      changedFiles: [filePath],
      branchName: "focused/auto-1-test",
      pr: { headRefName: "focused/auto-1-test" },
    }));
    assert.match(decision.reason, /^forbidden_changed_files:/, filePath);
    assert.equal(decision.eligible, false, filePath);
  }

  const classified = classifyIssueLane({
    title: "API domain auth session change",
    body: `${contractBody({
      lane: "api-domain-runtime",
      allowedPaths: ["services/api/Auth/SessionRuntime.cs"],
      validationProfile: "api-domain",
      manualMergeRequired: false,
      autoMergeEligible: true,
    })}

## Scope

Implement auth session runtime behavior.
`,
    labels: ["auto-ready"],
  });
  assert.equal(classified.allowedToImplement, false);
  assert.ok(classified.reasonCodes.includes("positive_scope_outside_lane"));
});

test("client-ui-low-risk lane with exact mobile UI paths allows merge decision", () => {
  const laneDecision = autoMergeLane({
    lane: "client-ui-low-risk",
    allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart", "apps/mobile/test/ui/settleora_component_guardrail_test.dart"],
    laneManifestAllowedPaths: ["apps/mobile/lib/ui/**", "apps/mobile/test/ui/**"],
    validationProfile: "mobile-ui-low-risk",
    contract: {
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart", "apps/mobile/test/ui/settleora_component_guardrail_test.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  const decision = evaluateAutoMergeDecision(
    autoMergeContext({
      laneDecision,
      changedFiles: ["apps/mobile/lib/ui/settleora_components.dart", "apps/mobile/test/ui/settleora_component_guardrail_test.dart"],
    }),
  );
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "all_auto_merge_gates_passed");
});

test("mobile-application low-risk validation binding preserves lane-derived platform evidence", () => {
  const laneDecision = { lane: "mobile-application", validationProfile: "mobile-ui-low-risk" };
  const checkId = mobileBuildPlatformChecks.androidFlutterBuildApkDebug;
  const evidence = bindValidationEvidence({ passed: true, results: [{ command: "flutter build apk --debug", status: 0, error: null, platformBuildCheckId: checkId }] }, {
    headSha: "a".repeat(40),
    baseSha: "b".repeat(40),
    changedFiles: ["apps/mobile/lib/example.dart"],
    profile: laneDecision.validationProfile,
    laneDecision,
  });
  assert.deepEqual(evidence.mobileBuildPlatformEvidence.platforms, ["android"]);
  assert.deepEqual(evidence.mobileBuildPlatformEvidence.localCheckIds, [checkId]);
  assert.deepEqual(evidence.mobileBuildPlatformEvidence.externalCheckIds, [
    mobileBuildPlatformChecks.iosExternalBuild,
    mobileBuildPlatformChecks.macosExternalBuild,
    mobileBuildPlatformChecks.windowsExternalBuild,
  ]);
  assert.equal(evidence.mobileBuildPlatformEvidence.localChecks[0].passed, true);
});

test("client-ui-low-risk real-code auto-merge blocks skipped missing stale or mismatched independent review", () => {
  const laneDecision = autoMergeLane({
    lane: "client-ui-low-risk",
    allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart"],
    laneManifestAllowedPaths: ["apps/mobile/lib/ui/**", "apps/mobile/test/ui/**"],
    validationProfile: "mobile-ui-low-risk",
    contract: {
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  const base = {
    laneDecision,
    changedFiles: ["apps/mobile/lib/ui/settleora_components.dart"],
  };
  assert.equal(
    evaluateAutoMergeDecision(
      autoMergeContext({
        ...base,
        externalReview: { status: "skipped", reason: "skipped_external_reviewer_tier_disabled" },
      }),
    ).reason,
    "independent_review_not_passed:skipped_external_reviewer_tier_disabled",
  );
  assert.equal(
    evaluateAutoMergeDecision(
      autoMergeContext({
        ...base,
        externalReview: null,
      }),
    ).reason,
    "independent_review_not_passed:missing",
  );
  assert.equal(
    evaluateAutoMergeDecision(
      autoMergeContext({
        ...base,
        externalReview: { status: "pass", verdict: "pass", reviewedHead: "oldhead", tier: "cheap_independent", changedFiles: base.changedFiles, independent: true, completedAt: "2026-07-12T00:00:00.000Z" },
      }),
    ).reason,
    "independent_review_head_mismatch",
  );
  assert.equal(
    evaluateAutoMergeDecision(
      autoMergeContext({
        ...base,
        externalReview: { status: "pass", verdict: "pass", reviewedHead: "head123", tier: "cheap_independent", changedFiles: ["apps/mobile/test/ui/other_test.dart"], independent: true, completedAt: "2026-07-12T00:00:00.000Z" },
      }),
    ).reason,
    "independent_review_files_mismatch",
  );
  assert.equal(
    evaluateAutoMergeDecision(
      autoMergeContext({
        ...base,
        externalReview: { status: "pass", verdict: "pass", reviewedHead: "head123", tier: "cheap_independent", changedFiles: base.changedFiles, independent: true, completedAt: "2026-07-12T00:00:00.000Z" },
      }),
    ).reason,
    "independent_review_file_digest_missing",
  );
  assert.equal(
    evaluateAutoMergeDecision(
      autoMergeContext({
        ...base,
        externalReview: { status: "pass", verdict: "pass", reviewedHead: "head123", tier: "cheap_independent", changedFiles: base.changedFiles, changedFilesDigest: "wrong", independent: true, completedAt: "2026-07-12T00:00:00.000Z" },
      }),
    ).reason,
    "independent_review_file_digest_mismatch",
  );
});

test("pre-push review gate blocks mutation and required independent-review failures before PR push", () => {
  const clientUiLane = autoMergeLane({ lane: "client-ui-low-risk" });
  assert.deepEqual(
    evaluatePrePushReviewGate({
      laneDecision: clientUiLane,
      externalReview: { status: "pass" },
      reviewMutationGuard: { mutationDetected: true },
    }),
    {
      ok: false,
      outcome: "auto_failed",
      reason: "exact_head_review_mutated_checkout",
      message: "exact-head review mutated the checkout",
    },
  );
  assert.deepEqual(
    evaluatePrePushReviewGate({
      config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
      laneDecision: clientUiLane,
      externalReview: { status: "skipped", reason: "skipped_external_reviewer_tier_disabled" },
      reviewMutationGuard: { mutationDetected: false },
      reviewConvergenceState: { sourceChangingCycle: 2, pr: { exactHead: "head123" } },
      reviewConvergenceHistory: [
        { findingFingerprints: ["a"], patchId: "p1" },
        { findingFingerprints: ["b"], patchId: "p2" },
      ],
    }),
    {
      ok: false,
      outcome: "review_convergence_required",
      reason: "exact_head_independent_review_not_passed_convergence_required:skipped_external_reviewer_tier_disabled",
      message: "exact-head independent review returned skipped_external_reviewer_tier_disabled; bounded review convergence remains available",
      convergence: {
        ok: true,
        reason: "bounded_review_convergence_available",
        budget: {
          requested: 50,
          normalized: 50,
          hardMaximum: 50,
          enabled: true,
          malformed: false,
          policy: "clamp_to_hard_max",
        },
        diagnosticEpoch: false,
        reviewStatus: "skipped",
        reviewReason: "skipped_external_reviewer_tier_disabled",
      },
    },
  );
  assert.deepEqual(
    evaluatePrePushReviewGate({
      laneDecision: clientUiLane,
      externalReview: { status: "skipped", reason: "skipped_external_reviewer_tier_disabled" },
      reviewMutationGuard: { mutationDetected: false },
    }),
    {
      ok: false,
      outcome: "review_changes_requested_retry_exhausted",
      reason: "exact_head_independent_review_not_passed:skipped_external_reviewer_tier_disabled",
      message: "exact-head independent review returned skipped_external_reviewer_tier_disabled",
    },
  );
  assert.deepEqual(
    evaluatePrePushReviewGate({
      laneDecision: autoMergeLane({ lane: "workflow-docs-tooling" }),
      externalReview: { status: "skipped", reason: "skipped_external_reviewer_tier_disabled" },
      reviewMutationGuard: { mutationDetected: false },
    }),
    {
      ok: false,
      outcome: "review_changes_requested_retry_exhausted",
      reason: "exact_head_independent_review_not_passed:skipped_external_reviewer_tier_disabled",
      message: "exact-head independent review returned skipped_external_reviewer_tier_disabled",
    },
  );
});

test("auto-merge decision enforces exact issue contract paths even under approved lane prefix", () => {
  const laneDecision = autoMergeLane({
    allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
    laneManifestAllowedPaths: ["tools/auto-runner/**", "docs/workflow/**"],
    validationProfile: "docs-only",
    contract: {
      allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  const decision = evaluateAutoMergeDecision(
    autoMergeContext({
      laneDecision,
      changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
    }),
  );
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "forbidden_changed_files:docs/workflow/AUTONOMOUS_CODEX_RUNNER.md");
});

test("canary auto-merge decision requires explicit low-risk approval", () => {
  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({ config: { allowAutoMerge: true, canary: true } })).reason,
    "low_risk_auto_merge_canary_not_approved:lowRiskAutoMergeCanaryApproved is not true",
  );
  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({ config: approvedLowRiskAutoMergeCanaryConfig() })).reason,
    "all_auto_merge_gates_passed",
  );
});

test("sensitive product/security/storage/money/schema/OpenAPI/deployment/secret/public/admin paths block auto-merge", () => {
  for (const filePath of [
    "services/api/Auth/Session.cs",
    "apps/mobile/lib/main.dart",
    "infra/docker-compose.yml",
    ".github/workflows/ci.yml",
    "packages/contracts/openapi/settleora.v1.yaml",
    "packages/client-web/src/generated/client.ts",
    "docs/workflow/.env.example",
    "admin/exposure.md",
    "services/api/Migrations/20260709.cs",
  ]) {
    const decision = evaluateAutoMergeDecision({
      ...autoMergeContext({
        changedFiles: [filePath],
        laneDecision: autoMergeLane({ allowedPaths: ["tools/auto-runner/**", "docs/workflow/**"] }),
      }),
      changedFilesExactlyMatchAllowedPaths: false,
    });
    assert.equal(decision.eligible, false, filePath);
    assert.match(decision.reason, /forbidden_changed_files|changed_files_do_not_match/);
  }
});

test("stale PR head and base mismatch block auto-merge", () => {
  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({ pr: { headRefOid: "other" }, actualHeadSha: "other" })).reason,
    "pr_head_sha_mismatch",
  );
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ currentOriginMainSha: "base-new" })).reason, "origin_main_base_mismatch");
});

test("auto-merge requires Codex mechanics review changed-file metadata", () => {
  assert.equal(
    evaluateAutoMergeDecision(
      autoMergeContext({
        review: { verdict: { verdict: "approve" }, reviewedHead: "head123" },
      }),
    ).reason,
    "codex_mechanics_review_files_missing",
  );
});

test("pending/failing checks, review threads, code scanning alerts, and issue stop labels block auto-merge", () => {
  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({ requiredChecks: autoMergeRequiredChecks({ "Validate scaffold": { status: "IN_PROGRESS", conclusion: null } }) })).reason,
    "required_checks_pending",
  );
  assert.equal(
    evaluateAutoMergeDecision(autoMergeContext({ requiredChecks: autoMergeRequiredChecks({ "Validate scaffold": { status: "COMPLETED", conclusion: "FAILURE" } }) })).reason,
    "required_checks_not_successful",
  );
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ reviewThreads: [{ isResolved: false }] })).reason, "unresolved_review_threads");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ codeScanningAlerts: [{ state: "open" }] })).reason, "open_code_scanning_alerts");
  assert.equal(evaluateAutoMergeDecision(autoMergeContext({ issue: { labels: ["auto-ready", "blocked"] } })).reason, "issue_stop_label:blocked");
});

test("auto-merge waits through blocked merge state after checks and then merges when GitHub refreshes clean", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-wait-clean-"));
  try {
    const calls = [];
    const runner = createAutoMergeRunner(calls);
    let inspections = 0;
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, autoMergeWait: { maxAttempts: 2, delayMs: 0 } },
      autoMergeContext({ pr: { mergeStateStatus: "BLOCKED" } }),
      {
        runner,
        sleep: () => {},
        inspectState: () => {
          inspections += 1;
          return {
            pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" },
            requiredChecks: autoMergeRequiredChecks(),
            reviewThreads: [],
            codeScanningAlerts: [],
            blockingMarkers: [],
          };
        },
      },
    );
    assert.equal(inspections, 2);
    assert.equal(result.result, "merged");
    assert.equal(result.waitAttempts.length, 2);
    assert.ok(calls.includes("gh pr merge 1 --repo tommytang213/Settleora --merge --match-head-commit head123"));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("auto-merge merge readback is bound to the configured repository", () => {
  for (const repositorySlug of ["tommytang213/Settleora", "example-owner/nondefault-repo"]) {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-readback-repo-"));
    try {
      const calls = [];
      const result = executeAutoMerge(
        { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, repositorySlug },
        autoMergeContext({ config: { repositorySlug }, pr: { headRepository: { id: "repo-1", nameWithOwner: repositorySlug } } }),
        {
          runner: mergeReadbackRunner(calls, { repositorySlug }),
          inspectState: () => ({
            pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" },
            requiredChecks: autoMergeRequiredChecks(),
            reviewThreads: [],
            codeScanningAlerts: [],
            blockingMarkers: [],
          }),
        },
      );
      assert.equal(result.result, "merged");
      assert.equal(result.mergeReadback.configuredRepositorySlug, repositorySlug);
      assert.equal(result.mergeReadback.headRepositorySlug, repositorySlug);
      assert.ok(calls.includes(`gh pr merge 1 --repo ${repositorySlug} --merge --match-head-commit head123`));
      assert.ok(calls.includes(`gh pr view 1 --repo ${repositorySlug} --json number,state,baseRefName,headRefOid,mergeCommit,mergedAt,headRepository,headRepositoryOwner,isCrossRepository`));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("merge-only auto-merge does not run per-PR issue hygiene or PR summary comments", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-only-"));
  try {
    const calls = [];
    const result = executeAutoMergeMergeOnly(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, repositorySlug: "tommytang213/Settleora" },
      autoMergeContext({ config: { repositorySlug: "tommytang213/Settleora" }, pr: { headRepository: { id: "repo-1", nameWithOwner: "tommytang213/Settleora" } } }),
      {
        runner: mergeReadbackRunner(calls, { repositorySlug: "tommytang213/Settleora" }),
        inspectState: () => ({
          pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" },
          requiredChecks: autoMergeRequiredChecks(),
          reviewThreads: [],
          codeScanningAlerts: [],
          blockingMarkers: [],
        }),
      },
    );
    assert.equal(result.result, "merged");
    assert.equal(result.mergeSha, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(result.completionHygiene.reason, "stack_merge_only_final_hygiene_authoritative");
    assert.ok(calls.includes("gh pr merge 1 --repo tommytang213/Settleora --merge --match-head-commit head123"));
    assert.ok(calls.includes("gh pr view 1 --repo tommytang213/Settleora --json number,state,baseRefName,headRefOid,mergeCommit,mergedAt,headRepository,headRepositoryOwner,isCrossRepository"));
    assert.equal(calls.some((call) => call.startsWith("gh issue ")), false);
    assert.equal(calls.some((call) => call.startsWith("gh pr comment ")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("merge-only auto-merge restores source branch after mocked merge auto-deletes branch", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-only-restore-"));
  try {
    const calls = [];
    let branchReads = 0;
    const result = executeAutoMergeMergeOnly(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, repositorySlug: "tommytang213/Settleora" },
      autoMergeContext({ config: { repositorySlug: "tommytang213/Settleora" }, pr: { headRepository: { id: "repo-1", nameWithOwner: "tommytang213/Settleora" } } }),
      {
        runner: (command, args) => {
          calls.push(`${command} ${args.join(" ")}`);
          if (command === "gh" && args[0] === "pr" && args[1] === "merge") return ok("");
          if (command === "gh" && args[0] === "pr" && args[1] === "view") return ok(mergeReadbackJson("tommytang213/Settleora"));
          if (command === "git" && args[0] === "ls-remote") {
            branchReads += 1;
            return branchReads === 1 ? ok("") : ok("head123\trefs/heads/feature/auto-1-test\n");
          }
          if (command === "git" && args[0] === "push") return ok("");
          if (command === "git" && args[0] === "rev-parse") return ok("base123\n");
          return fail(`unexpected ${command} ${args.join(" ")}`);
        },
        inspectState: () => ({
          pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" },
          requiredChecks: autoMergeRequiredChecks(),
          reviewThreads: [],
          codeScanningAlerts: [],
          blockingMarkers: [],
        }),
      },
    );
    assert.equal(result.result, "merged");
    assert.equal(result.sourceBranchRestoration.planned, true);
    assert.equal(result.sourceBranchRestoration.executed, true);
    assert.equal(result.sourceBranchRestoration.confirmed, true);
    assert.ok(calls.includes("git push origin head123:refs/heads/feature/auto-1-test"));
    assert.equal(calls.some((call) => call.startsWith("gh issue ")), false);
    assert.equal(calls.some((call) => call.startsWith("gh pr comment ")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("lifecycle branch restoration is routed through a canonical retained-branch intent", () => {
  const source = readFileSync("tools/auto-runner/lib/auto-merge-policy.mjs", "utf8");
  const restoration = source.slice(source.indexOf("function restoreSourceBranchIfDeleted"), source.indexOf("function sourceBranchRestorationConfirmed"));
  assert.match(restoration, /context\.sessionLifecycle/);
  assert.match(restoration, /effectType: "branch_retention_verify"/);
  assert.match(restoration, /executeCanonicalGithubEffectSync/);
});

test("canonical merge evidence projects review gates without provider payload objects", () => {
  const source = readFileSync("tools/auto-runner/lib/auto-merge-policy.mjs", "utf8");
  const mergeEffect = source.slice(source.indexOf("function executeCanonicalMergeEffect"), source.indexOf("function executeCanonicalPrComment"));
  assert.doesNotMatch(mergeEffect, /externalReview:\s*context\.externalReview/);
  assert.doesNotMatch(mergeEffect, /codexReview:\s*context\.review/);
  assert.match(mergeEffect, /externalReview:\s*\{ status:/);
  assert.match(mergeEffect, /codexReview:\s*\{ verdict:/);
});

test("merge-only auto-merge blocks completion when source branch restoration is unconfirmed", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-only-restore-fail-"));
  try {
    const calls = [];
    const result = executeAutoMergeMergeOnly(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, repositorySlug: "tommytang213/Settleora" },
      autoMergeContext({ config: { repositorySlug: "tommytang213/Settleora" }, pr: { headRepository: { id: "repo-1", nameWithOwner: "tommytang213/Settleora" } } }),
      {
        runner: (command, args) => {
          calls.push(`${command} ${args.join(" ")}`);
          if (command === "gh" && args[0] === "pr" && args[1] === "merge") return ok("");
          if (command === "gh" && args[0] === "pr" && args[1] === "view") return ok(mergeReadbackJson("tommytang213/Settleora"));
          if (command === "git" && args[0] === "ls-remote") return ok("");
          if (command === "git" && args[0] === "push") return ok("");
          if (command === "git" && args[0] === "rev-parse") return ok("base123\n");
          return fail(`unexpected ${command} ${args.join(" ")}`);
        },
        inspectState: () => ({
          pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" },
          requiredChecks: autoMergeRequiredChecks(),
          reviewThreads: [],
          codeScanningAlerts: [],
          blockingMarkers: [],
        }),
      },
    );
    assert.equal(result.result, "merge_failed");
    assert.match(result.reason, /source_branch_restoration_failed:source_branch_restore_unconfirmed/);
    assert.equal(result.sourceBranchRestoration.confirmed, false);
    assert.equal(calls.some((call) => call.startsWith("gh issue ")), false);
    assert.equal(calls.some((call) => call.startsWith("gh pr comment ")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("merge-only auto-merge does not confirm source branch restoration from suffix-matching remote refs", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-only-restore-suffix-"));
  try {
    const calls = [];
    let branchReads = 0;
    const result = executeAutoMergeMergeOnly(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, repositorySlug: "tommytang213/Settleora" },
      autoMergeContext({ config: { repositorySlug: "tommytang213/Settleora" }, pr: { headRepository: { id: "repo-1", nameWithOwner: "tommytang213/Settleora" } } }),
      {
        runner: (command, args) => {
          calls.push(`${command} ${args.join(" ")}`);
          if (command === "gh" && args[0] === "pr" && args[1] === "merge") return ok("");
          if (command === "gh" && args[0] === "pr" && args[1] === "view") return ok(mergeReadbackJson("tommytang213/Settleora"));
          if (command === "git" && args[0] === "ls-remote") {
            branchReads += 1;
            assert.equal(args[3], "refs/heads/feature/auto-1-test");
            return branchReads === 1 ? ok("") : ok("head123\trefs/heads/x/feature/auto-1-test\n");
          }
          if (command === "git" && args[0] === "push") return ok("");
          if (command === "git" && args[0] === "rev-parse") return ok("base123\n");
          return fail(`unexpected ${command} ${args.join(" ")}`);
        },
        inspectState: () => ({
          pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" },
          requiredChecks: autoMergeRequiredChecks(),
          reviewThreads: [],
          codeScanningAlerts: [],
          blockingMarkers: [],
        }),
      },
    );
    assert.equal(result.result, "merge_failed");
    assert.match(result.reason, /source_branch_restoration_failed:source_branch_restore_unconfirmed/);
    assert.equal(result.sourceBranchRestoration.confirmed, false);
    assert.ok(calls.includes("git push origin head123:refs/heads/feature/auto-1-test"));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("auto-merge readMergeSha no longer contains the default repository literal", () => {
  const source = readFileSync(new URL("../lib/auto-merge-policy.mjs", import.meta.url), "utf8");
  const match = source.match(/function readMergeSha[\s\S]*?\n}\n\nfunction mergeReadbackFailure/);
  assert.ok(match);
  assert.doesNotMatch(match[0], /tommytang213\/Settleora/);
});

test("auto-merge merge readback rejects missing malformed and unsupported repository context before gh", () => {
  const invalidSlugs = [
    undefined,
    "tommytang213",
    "Settleora",
    "tommytang213/Settleora/extra",
    "--repo/tommytang213",
    "tommytang213/Settle ora",
    "tommytang213/Settleora\n",
    "https://github.com/tommytang213/Settleora",
    "user:secret@github.com/tommytang213/Settleora",
    "github.com/owner",
  ];
  for (const repositorySlug of invalidSlugs) {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-readback-invalid-"));
    try {
      const calls = [];
      const result = executeAutoMerge(
        { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, repositorySlug },
        autoMergeContext({ config: { repositorySlug } }),
        {
          runner: (command, args) => {
            calls.push(`${command} ${args.join(" ")}`);
            if (command === "git" && args[0] === "rev-parse") return ok("base123\n");
            return fail(`unexpected ${command} ${args.join(" ")}`);
          },
          inspectState: () => ({ pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" }, requiredChecks: autoMergeRequiredChecks(), reviewThreads: [], codeScanningAlerts: [], blockingMarkers: [] }),
        },
      );
      assert.equal(result.result, "merge_failed", String(repositorySlug));
      assert.equal(result.reason, "configured_repository_invalid", String(repositorySlug));
      assert.equal(calls.some((call) => call.startsWith("gh ")), false, String(repositorySlug));
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("auto-merge merge readback rejects mismatched or incomplete PR proof", () => {
  const cases = [
    ["wrong source head", { headRefOid: "other-head" }, "merge_readback_failed:merge_readback_source_head_mismatch"],
    ["wrong base", { baseRefName: "develop" }, "merge_readback_failed:merge_readback_base_mismatch"],
    ["unmerged", { state: "OPEN" }, "merge_readback_failed:merge_readback_pr_not_merged"],
    ["missing merge sha", { mergeCommit: { oid: null } }, "merge_readback_failed:merge_readback_merge_sha_invalid"],
    ["wrong repository", { headRepository: { id: "repo-2", name: "other", nameWithOwner: "other-owner/other" }, headRepositoryOwner: { login: "other-owner" } }, "merge_readback_failed:merge_readback_head_repository_mismatch"],
    ["cross repository", { isCrossRepository: true }, "merge_readback_failed:merge_readback_cross_repository"],
  ];
  for (const [name, readbackOverrides, reason] of cases) {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-readback-reject-"));
    try {
      const result = executeAutoMerge(
        { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, repositorySlug: "tommytang213/Settleora" },
        autoMergeContext(),
        {
          runner: mergeReadbackRunner([], { repositorySlug: "tommytang213/Settleora", readbackOverrides }),
          inspectState: () => ({ pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" }, requiredChecks: autoMergeRequiredChecks(), reviewThreads: [], codeScanningAlerts: [], blockingMarkers: [] }),
        },
      );
      assert.equal(result.result, "merge_failed", name);
      assert.equal(result.reason, reason, name);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("auto-merge merge readback rejects unsupported GitHub host context", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-readback-host-"));
  try {
    const calls = [];
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, repositorySlug: "tommytang213/Settleora", githubHost: "github.example.invalid" },
      autoMergeContext(),
      {
        runner: mergeReadbackRunner(calls, { repositorySlug: "tommytang213/Settleora" }),
        inspectState: () => ({ pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" }, requiredChecks: autoMergeRequiredChecks(), reviewThreads: [], codeScanningAlerts: [], blockingMarkers: [] }),
      },
    );
    assert.equal(result.result, "merge_failed");
    assert.equal(result.reason, "merge_readback_failed:configured_repository_host_unsupported");
    assert.equal(calls.some((call) => call.startsWith("gh pr view")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("auto-merge wait expires when merge state never becomes clean and writes evidence", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-wait-expire-"));
  try {
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, autoMergeWait: { maxAttempts: 2, delayMs: 0 } },
      autoMergeContext({ pr: { mergeStateStatus: "UNKNOWN" } }),
      {
        runner: createAutoMergeRunner([]),
        sleep: () => {},
        inspectState: () => ({
          pr: { mergeable: "MERGEABLE", mergeStateStatus: "BLOCKED", headRefOid: "head123" },
          requiredChecks: autoMergeRequiredChecks(),
          reviewThreads: [],
          codeScanningAlerts: [],
          blockingMarkers: [],
        }),
      },
    );
    assert.equal(result.result, "blocked");
    assert.equal(result.reason, "auto_merge_wait_expired:pr_merge_state_not_clean:BLOCKED");
    assert.equal(result.waitAttempts.length, 2);
    assert.match(readFileSync(result.evidence.evidencePath, "utf8"), /auto_merge_wait_expired/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("auto-merge wait fails closed when PR head changes during refresh", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-wait-head-change-"));
  try {
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, autoMergeWait: { maxAttempts: 3, delayMs: 0 } },
      autoMergeContext({ pr: { mergeStateStatus: "BLOCKED" } }),
      {
        runner: createAutoMergeRunner([]),
        sleep: () => {},
        inspectState: () => ({
          pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "newhead" },
          requiredChecks: [{ name: "Validate", status: "COMPLETED", conclusion: "SUCCESS" }],
          reviewThreads: [],
          codeScanningAlerts: [],
          blockingMarkers: [],
        }),
      },
    );
    assert.equal(result.result, "blocked");
    assert.equal(result.reason, "pr_head_sha_mismatch");
    assert.equal(result.waitAttempts.length, 2);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("auto-merge wait continues past the prior six-attempt pending-check window and records progress", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-wait-long-pending-"));
  try {
    let inspections = 0;
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, autoMergeWait: { maxAttempts: 8, delayMs: 0 } },
      autoMergeContext({
        requiredChecks: autoMergeRequiredChecks({
          CodeQL: { status: "IN_PROGRESS", conclusion: null },
          "Validate scaffold": { status: "IN_PROGRESS", conclusion: null },
        }),
      }),
      {
        runner: createAutoMergeRunner([]),
        sleep: () => {},
        inspectState: () => {
          inspections += 1;
          if (inspections < 6) {
            return {
              pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" },
              requiredChecks: [
              { name: "CodeQL", status: "COMPLETED", conclusion: "SUCCESS" },
              { name: "Validate scaffold", status: "IN_PROGRESS", conclusion: null },
              { name: "Semgrep CE scan", status: "COMPLETED", conclusion: "SUCCESS" },
              { name: "Trivy repository scan", status: "COMPLETED", conclusion: "SUCCESS" },
            ],
              reviewThreads: [],
              codeScanningAlerts: [],
              blockingMarkers: [],
            };
          }
          return {
            pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" },
            requiredChecks: [
              { name: "CodeQL", status: "COMPLETED", conclusion: "SUCCESS" },
              { name: "Validate scaffold", status: "COMPLETED", conclusion: "SUCCESS" },
              { name: "Semgrep CE scan", status: "COMPLETED", conclusion: "SUCCESS" },
              { name: "Trivy repository scan", status: "COMPLETED", conclusion: "SUCCESS" },
            ],
            reviewThreads: [],
            codeScanningAlerts: [],
            blockingMarkers: [],
          };
        },
      },
    );
    assert.equal(result.result, "merged");
    assert.equal(result.waitAttempts.length, 7);
    assert.deepEqual(result.waitAttempts[0].pendingCheckNames, ["CodeQL", "Validate scaffold"]);
    assert.equal(result.waitAttempts[1].pendingChecksProgressing, true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("auto-merge wait expires fail-closed when checks remain pending beyond the bound", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-wait-pending-expire-"));
  try {
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, autoMergeWait: { maxAttempts: 3, delayMs: 0 } },
      autoMergeContext({ requiredChecks: autoMergeRequiredChecks({ CodeQL: { status: "IN_PROGRESS", conclusion: null } }) }),
      {
        runner: createAutoMergeRunner([]),
        sleep: () => {},
        inspectState: () => ({
          pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" },
          requiredChecks: autoMergeRequiredChecks({ CodeQL: { status: "IN_PROGRESS", conclusion: null } }),
          reviewThreads: [],
          codeScanningAlerts: [],
          blockingMarkers: [],
        }),
      },
    );
    assert.equal(result.result, "blocked");
    assert.equal(result.reason, "auto_merge_wait_expired:required_checks_pending");
    assert.equal(result.waitAttempts.length, 3);
    assert.deepEqual(result.waitAttempts[2].pendingCheckNames, ["CodeQL"]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("auto-merge wait returns the final exact-head inspection when pending checks become source failures", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-wait-failed-final-state-"));
  try {
    const failedChecks = autoMergeRequiredChecks({ CodeQL: { status: "COMPLETED", conclusion: "FAILURE", commandId: "codeql", diagnostic: "test failed assertion", structuredEvidence: true } });
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, autoMergeWait: { maxAttempts: 2, delayMs: 0 } },
      autoMergeContext({ requiredChecks: autoMergeRequiredChecks({ CodeQL: { status: "IN_PROGRESS", conclusion: null } }) }),
      { runner: createAutoMergeRunner([]), sleep: () => {}, inspectState: () => ({ pr: { mergeable: "MERGEABLE", mergeStateStatus: "BLOCKED", headRefOid: "head123", baseRefName: "main" }, requiredChecks: failedChecks, reviewThreads: [], codeScanningAlerts: [], blockingMarkers: [] }) },
    );
    assert.equal(result.result, "blocked");
    assert.equal(result.reason, "required_checks_not_successful");
    assert.equal(result.finalGithubState.inspectedHeadSha, "head123");
    assert.deepEqual(result.finalGithubState.requiredChecks, failedChecks);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("auto-merge does not wait on failed or cancelled checks", () => {
  for (const conclusion of ["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STALE", "STARTUP_FAILURE"]) {
    const tempRoot = mkdtempSync(path.join(tmpdir(), `settleora-auto-merge-terminal-${conclusion.toLowerCase()}-`));
    try {
      let inspections = 0;
      const result = executeAutoMerge(
        { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, autoMergeWait: { maxAttempts: 8, delayMs: 0 } },
        autoMergeContext({ requiredChecks: [...autoMergeRequiredChecks(), { name: "Unlisted terminal check", status: "COMPLETED", conclusion }] }),
        {
          runner: createAutoMergeRunner([]),
          sleep: () => {},
          inspectState: () => {
            inspections += 1;
            return {};
          },
        },
      );
      assert.equal(result.result, "blocked", conclusion);
      assert.equal(result.reason, "required_checks_not_successful", conclusion);
      assert.equal(inspections, 0, conclusion);
      assert.equal(result.waitAttempts, undefined, conclusion);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("auto-merge final refresh catches newly failed unlisted exact-head checks", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-final-refresh-unlisted-check-"));
  try {
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false, autoMergeWait: { maxAttempts: 1, delayMs: 0 } },
      autoMergeContext(),
      {
        runner: createAutoMergeRunner([]),
        inspectState: () => ({
          pr: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefOid: "head123" },
          requiredChecks: [
            ...autoMergeRequiredChecks(),
            { name: "Unlisted final refresh check", status: "COMPLETED", conclusion: "FAILURE" },
          ],
          reviewThreads: [],
          codeScanningAlerts: [],
          blockingMarkers: [],
        }),
      },
    );
    assert.equal(result.result, "blocked");
    assert.equal(result.reason, "final_refresh_blocked:required_checks_not_successful");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("auto-merge wait config clamps pathological values to safe bounds and buckets", () => {
  assert.deepEqual(normalizeAutoMergeWait({ maxAttempts: 999_999, delayMs: 999_999_999 }), {
    maxAttempts: 60,
    delayMs: 30000,
  });
  assert.deepEqual(normalizeAutoMergeWait({ maxAttempts: -10, delayMs: -1 }), {
    maxAttempts: 1,
    delayMs: 0,
  });
  assert.deepEqual(normalizeAutoMergeWait({ maxAttempts: 3, delayMs: 12_345 }), {
    maxAttempts: 3,
    delayMs: 5000,
  });
  assert.deepEqual(normalizeAutoMergeWait({ maxAttempts: "not-a-number", delayMs: "also-bad" }), {
    maxAttempts: 60,
    delayMs: 30000,
  });
});

test("existing low-risk canary PR recovery proceeds only with exact-head safe evidence and gates", () => {
  const decision = evaluateExistingPrRecoveryDecision(existingPrRecoveryContext());
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "existing_pr_recovery_gates_passed");
  assert.deepEqual(decision.issueLinkageEvidence.matchedSources, ["pr.title", "pr.body"]);
});

test("existing PR recovery regenerates missing Codex evidence outside independent-review lanes", () => {
  assert.equal(
    shouldGenerateExistingPrRecoveryEvidence(autoMergeLane({ lane: "workflow-docs-tooling" }), {
      validationPassed: true,
      codexMechanicsApproved: false,
    }),
    true,
  );
  assert.equal(
    shouldGenerateExistingPrRecoveryEvidence(autoMergeLane({ lane: "workflow-docs-tooling" }), {
      validationPassed: true,
      codexMechanicsApproved: true,
      codexMechanicsHeadSha: "head123",
      codexMechanicsChangedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
    }),
    true,
  );
  assert.equal(
    shouldGenerateExistingPrRecoveryEvidence(autoMergeLane({ lane: "client-ui-low-risk" }), {
      validationPassed: true,
      codexMechanicsApproved: true,
      codexMechanicsHeadSha: "head123",
      codexMechanicsChangedFiles: ["apps/mobile/lib/ui/settleora_components.dart"],
      geminiPass: true,
      geminiHeadSha: "head123",
    }),
    true,
  );
});

test("existing PR recovery issue links are exact text matches without dynamic regex behavior", () => {
  const nearMiss = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      pr: {
        title: "Auto-runner: #8250 pathological regex-looking text",
        body: "Mentions #8250 plus (a+)+ and .* but never the exact issue.",
      },
    }),
  );
  assert.equal(nearMiss.eligible, false);
  assert.match(nearMiss.reason, /pr_not_linked_to_issue/);

  const leadingZero = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      pr: {
        title: "Auto-runner: #0825 is not exact",
        body: "No exact issue reference.",
      },
    }),
  );
  assert.equal(leadingZero.eligible, false);
  assert.match(leadingZero.reason, /pr_not_linked_to_issue/);

  const embeddedToken = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      pr: {
        title: "Auto-runner token x#825 should not count",
        body: "No exact standalone reference.",
      },
    }),
  );
  assert.equal(embeddedToken.eligible, false);
  assert.match(embeddedToken.reason, /pr_not_linked_to_issue/);

  const exact = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      pr: {
        title: "Auto-runner recovery",
        body: "Closes #825. This also contains regex-looking text (a+)+.* that must stay literal.",
      },
    }),
  );
  assert.equal(exact.eligible, true);

  const invalidNumber = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      issue: { number: "825.*" },
      pr: {
        title: "Auto-runner: #825.*",
        body: "A regex-looking issue number must not become a pattern.",
      },
    }),
  );
  assert.equal(invalidNumber.eligible, false);
  assert.equal(invalidNumber.reason, "existing_pr_recovery_missing_pr_linkage_evidence");
});

test("existing PR recovery accepts exact title-only or body-only linkage when current title/body evidence is available", () => {
  const titleOnly = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      pr: {
        title: "Auto-runner recovery for #825",
        body: "Review evidence only; no issue number here.",
      },
    }),
  );
  assert.equal(titleOnly.eligible, true);
  assert.deepEqual(titleOnly.issueLinkageEvidence.matchedSources, ["pr.title"]);

  const bodyOnly = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      pr: {
        title: "Auto-runner recovery",
        body: "Closes or updates #825.",
      },
    }),
  );
  assert.equal(bodyOnly.eligible, true);
  assert.deepEqual(bodyOnly.issueLinkageEvidence.matchedSources, ["pr.body"]);
});

test("existing PR recovery blocks unavailable title/body linkage evidence", () => {
  const missingTitle = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      pr: {
        body: "Closes or updates #825.",
        title: undefined,
      },
    }),
  );
  assert.equal(missingTitle.eligible, false);
  assert.equal(missingTitle.reason, "existing_pr_recovery_missing_pr_linkage_evidence");

  const evidence = buildIssueLinkageEvidence({ title: "Auto-runner #825", body: "Body text" }, 825);
  assert.equal(evidence.available, true);
  assert.equal(evidence.linked, true);
  assert.deepEqual(evidence.evaluatedSources, ["pr.title", "pr.body"]);
});

test("existing PR recovery blocks stale head, broad files, review/code scanning blockers, stop labels, missing evidence, and manual blockers", () => {
  const cases = [
    ["stale", existingPrRecoveryContext({ pr: { headRefOid: "other" }, actualHeadSha: "other" }), /evidence_head_mismatch|pr_head_sha_mismatch/],
    [
      "broad",
      existingPrRecoveryContext({ changedFiles: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"], changedFilesExactlyMatchAllowedPaths: false }),
      /forbidden_changed_files|changed_files_do_not_match/,
    ],
    ["thread", existingPrRecoveryContext({ reviewThreads: [{ isResolved: false }] }), /unresolved_review_threads/],
    ["scan", existingPrRecoveryContext({ codeScanningAlerts: [{ state: "open" }] }), /open_code_scanning_alerts/],
    ["stop", existingPrRecoveryContext({ issue: { labels: ["auto-canary-ready", "auto-failed"] } }), /issue_stop_label:auto-failed/],
    ["missing evidence", existingPrRecoveryContext({ exactHeadEvidence: {} }), /missing_independent_review_evidence|missing_evidence_or_review/],
    ["manual", existingPrRecoveryContext({ blockingMarkers: ["blocking_comment_or_review_marker"] }), /blocking_markers/],
  ];
  for (const [name, context, pattern] of cases) {
    const decision = evaluateExistingPrRecoveryDecision(context);
    assert.equal(decision.eligible, false, name);
    assert.match(decision.reason, pattern, name);
  }
});

test("recovery-only exact-head evidence validation precedes generation branch", () => {
  const source = readFileSync(path.join(process.cwd(), "tools/auto-runner/settleora-auto-runner.mjs"), "utf8");
  const validator = source.indexOf("validateRecoveryOnlyExactHeadEvidence(config, recoveryConfig");
  const generation = source.indexOf("shouldGenerateExistingPrRecoveryEvidence(laneDecision, exactHeadEvidence)");
  assert.ok(validator > 0);
  assert.ok(generation > validator);
  const blockedBranch = source.slice(validator, generation);
  assert.match(blockedBranch, /autoMerge: \{ result: "blocked"/);
  assert.doesNotMatch(blockedBranch, /writeAutoMergeEvidence/);
  assert.doesNotMatch(blockedBranch, /generateExistingPrRecoveryEvidence/);
});

test("existing client-ui-low-risk PR recovery requires independent Gemini and Codex evidence on exact head and files", () => {
  const laneDecision = autoMergeLane({
    lane: "client-ui-low-risk",
    allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart"],
    laneManifestAllowedPaths: ["apps/mobile/lib/ui/**", "apps/mobile/test/ui/**"],
    validationProfile: "mobile-ui-low-risk",
    contract: {
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    },
  });
  const base = existingPrRecoveryContext({
    issue: { number: 839, title: "Mobile UI canary", labels: ["auto-canary-ready"] },
    pr: {
      title: "Auto-runner: #839 Mobile UI canary",
      body: "Closes or updates #839.",
      headRefName: "feature/auto-839-mobile-ui-canary-button-label-fit-guardr-2026-07-10t0851",
    },
    laneDecision,
    changedFiles: ["apps/mobile/lib/ui/settleora_components.dart"],
    exactHeadEvidence: {
      headSha: "head123",
      validationPassed: true,
      geminiPass: true,
      geminiHeadSha: "head123",
      geminiChangedFiles: ["apps/mobile/lib/ui/settleora_components.dart"],
      codexMechanicsApproved: true,
      codexMechanicsHeadSha: "head123",
      codexMechanicsChangedFiles: ["apps/mobile/lib/ui/settleora_components.dart"],
    },
  });
  assert.equal(evaluateExistingPrRecoveryDecision(base).eligible, true);
  assert.equal(
    evaluateExistingPrRecoveryDecision({
      ...base,
      exactHeadEvidence: { ...base.exactHeadEvidence, geminiPass: false },
    }).reason,
    "existing_pr_recovery_missing_independent_review_evidence",
  );
  assert.equal(
    evaluateExistingPrRecoveryDecision({
      ...base,
      exactHeadEvidence: { ...base.exactHeadEvidence, codexMechanicsApproved: false },
    }).reason,
    "existing_pr_recovery_missing_codex_mechanics_evidence",
  );
  assert.equal(
    evaluateExistingPrRecoveryDecision({
      ...base,
      exactHeadEvidence: { ...base.exactHeadEvidence, geminiChangedFiles: ["apps/mobile/test/ui/other_test.dart"] },
    }).reason,
    "existing_pr_recovery_gemini_files_mismatch",
  );
  assert.equal(
    evaluateExistingPrRecoveryDecision({
      ...base,
      exactHeadEvidence: { ...base.exactHeadEvidence, codexMechanicsChangedFiles: undefined },
      review: { verdict: { verdict: "approve" }, reviewedHead: "head123" },
    }).reason,
    "existing_pr_recovery_codex_review_files_missing",
  );
  assert.equal(
    evaluateExistingPrRecoveryDecision({
      ...base,
      exactHeadEvidence: { ...base.exactHeadEvidence, codexMechanicsChangedFiles: ["apps/mobile/test/ui/other_test.dart"] },
    }).reason,
    "existing_pr_recovery_codex_review_files_mismatch",
  );
});

test("existing PR recovery treats pending checks as refreshable wait state after evidence gates pass", () => {
  const decision = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      requiredChecks: autoMergeRequiredChecks({ "Validate scaffold": { status: "IN_PROGRESS", conclusion: null } }),
    }),
  );
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "existing_pr_recovery_waiting_for_refreshable_gate:required_checks_pending");
  assert.equal(decision.autoMergeDecision.reason, "required_checks_pending");
});

test("existing PR recovery applies all-observed exact-head check policy", () => {
  const failed = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      requiredChecks: [
        ...autoMergeRequiredChecks(),
        { name: "Unlisted recovered PR check", status: "COMPLETED", conclusion: "FAILURE" },
      ],
    }),
  );
  assert.equal(failed.eligible, false);
  assert.equal(failed.reason, "existing_pr_recovery_gate_blocked:required_checks_not_successful");
  assert.equal(failed.autoMergeDecision.reason, "required_checks_not_successful");

  const pending = evaluateExistingPrRecoveryDecision(
    existingPrRecoveryContext({
      requiredChecks: [
        ...autoMergeRequiredChecks(),
        { name: "Unlisted recovered PR pending check", status: "IN_PROGRESS", conclusion: null },
      ],
    }),
  );
  assert.equal(pending.eligible, true);
  assert.equal(pending.reason, "existing_pr_recovery_waiting_for_refreshable_gate:required_checks_pending");
});

test("source branch restoration is executed after mocked merge auto-deletes branch", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-"));
  try {
    const calls = [];
    let branchReads = 0;
    const runner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "gh" && args[0] === "pr" && args[1] === "merge") return ok("");
      if (command === "gh" && args[0] === "pr" && args[1] === "view" && String(args[args.indexOf("--json") + 1] || "").includes("mergeCommit")) return ok(mergeReadbackJson("tommytang213/Settleora"));
      if (command === "gh" && args[0] === "pr" && args[1] === "view") return ok(preMergePrJson());
      if (command === "gh" && args[0] === "api" && args[1] === "graphql") return ok(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }));
      if (command === "gh" && args[0] === "api" && String(args[1]).includes("code-scanning/alerts")) return ok("[]");
      if (command === "git" && args[0] === "ls-remote") {
        branchReads += 1;
        return branchReads === 1 ? ok("") : ok("head123\trefs/heads/feature/auto-1-test\n");
      }
      if (command === "git" && args[0] === "push") return ok("");
      if (command === "gh" && args[0] === "issue" && args[1] === "view") {
        return ok(JSON.stringify({ labels: [{ name: "workflow" }, { name: "auto-running" }] }));
      }
      if (command === "gh" && args[0] === "issue" && args[1] === "edit") return ok("");
      if (command === "gh" && args[0] === "issue" && args[1] === "close") return ok("");
      if (command === "gh" && args[0] === "pr" && args[1] === "comment") return ok("");
      if (command === "gh" && args[0] === "issue" && args[1] === "comment") return ok("");
      return fail(`unexpected ${command} ${args.join(" ")}`);
    };
    const result = executeAutoMerge({ repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false }, autoMergeContext(), { runner });
    assert.equal(result.result, "merged");
    assert.equal(result.mergeSha, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(result.sourceBranchRestoration.executed, true);
    assert.equal(result.sourceBranchRestoration.confirmed, true);
    assert.ok(calls.includes("git push origin head123:refs/heads/feature/auto-1-test"));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("successful auto-merge removes only present transient issue labels", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-label-cleanup-merge-"));
  try {
    const calls = [];
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false },
      autoMergeContext({ issue: { labels: ["workflow", "auto-running", "auto-claimed", "auto-pr-opened", "area:mobile-ui"] } }),
      { runner: createAutoMergeRunner(calls) },
    );
    assert.equal(result.result, "merged");
    assert.equal(result.issueLabelCleanupResult.status, "passed");
    assert.deepEqual(result.issueLabelCleanupResult.labelsRemoved, ["auto-running", "auto-claimed"]);
    const editCall = calls.find((call) => call.startsWith("gh issue edit 1 --repo"));
    assert.equal(editCall, "gh issue edit 1 --repo tommytang213/Settleora --remove-label auto-running,auto-claimed");
    assert.doesNotMatch(editCall, /workflow|area:mobile-ui/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("label cleanup succeeds as no-op when no transient labels are present", () => {
  const calls = [];
  const result = cleanupIssueLifecycleLabels(
    { repoRoot: process.cwd(), dryRun: false },
    autoMergeContext({ issue: { labels: ["workflow", "canary"] } }),
    (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "gh" && args[0] === "issue" && args[1] === "view") {
        return ok(JSON.stringify({ labels: [{ name: "workflow" }, { name: "canary" }] }));
      }
      return fail(`unexpected ${command} ${args.join(" ")}`);
    },
  );
  assert.equal(result.status, "passed_noop");
  assert.deepEqual(result.labelsRemoved, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "gh issue view 1 --repo tommytang213/Settleora --json labels");
});

test("label cleanup records view and removal failures without changing merge success", () => {
  const viewFailure = cleanupIssueLifecycleLabels(
    { repoRoot: process.cwd(), dryRun: false },
    autoMergeContext(),
    (command, args) => {
      if (command === "gh" && args[0] === "issue" && args[1] === "view") return fail("view denied");
      return ok("");
    },
  );
  assert.equal(viewFailure.status, "failed");
  assert.match(viewFailure.failureReason, /view denied/);

  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-label-cleanup-remove-fail-"));
  try {
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false },
      autoMergeContext(),
      {
        runner: (command, args) => {
          if (command === "gh" && args[0] === "pr" && args[1] === "merge") return ok("");
          if (command === "gh" && args[0] === "pr" && args[1] === "view" && String(args[args.indexOf("--json") + 1] || "").includes("mergeCommit")) return ok(mergeReadbackJson("tommytang213/Settleora"));
          if (command === "gh" && args[0] === "pr" && args[1] === "view") return ok(preMergePrJson());
          if (command === "gh" && args[0] === "api" && args[1] === "graphql") return ok(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }));
          if (command === "gh" && args[0] === "api" && String(args[1]).includes("code-scanning/alerts")) return ok("[]");
          if (command === "git" && args[0] === "ls-remote") return ok("head123\trefs/heads/feature/auto-1-test\n");
          if (command === "gh" && args[0] === "issue" && args[1] === "view") {
            return ok(JSON.stringify({ labels: [{ name: "workflow" }, { name: "auto-running" }] }));
          }
          if (command === "gh" && args[0] === "issue" && args[1] === "edit") return fail("remove denied");
          if (command === "gh" && args[0] === "issue" && args[1] === "close") return ok("");
          if (command === "gh" && args[0] === "pr" && args[1] === "comment") return ok("");
          if (command === "gh" && args[0] === "issue" && args[1] === "comment") return ok("");
          return fail(`unexpected ${command} ${args.join(" ")}`);
        },
      },
    );
    assert.equal(result.result, "merged");
    assert.equal(result.issueClosureResult, "closed_completed");
    assert.equal(result.issueLabelCleanupResult.status, "failed");
    assert.match(result.issueLabelCleanupResult.failureReason, /remove denied/);
    assert.match(readFileSync(result.evidence.evidencePath, "utf8"), /issueLabelCleanupResult/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("label cleanup requires valid repository context before runner invocation", () => {
  const calls = [];
  const withoutRepo = cleanupIssueLifecycleLabels(
    { repoRoot: process.cwd(), dryRun: false },
    { ...autoMergeContext({ config: {} }), config: {}, pr: { number: 1, url: "https://example.invalid/pull/1" } },
    (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      return ok("");
    },
  );
  assert.equal(withoutRepo.status, "failed");
  assert.equal(withoutRepo.failureReason, "repository_slug_required");
  assert.deepEqual(calls, []);

  const malformed = cleanupIssueLifecycleLabels(
    { repoRoot: process.cwd(), repositorySlug: "tommytang213 Settleora", dryRun: false },
    autoMergeContext(),
    (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      return ok("");
    },
  );
  assert.equal(malformed.status, "failed");
  assert.equal(malformed.failureReason, "repository_slug_required");
  assert.deepEqual(calls, []);
});

test("label cleanup uses non-default repository and rejects repository mismatch", () => {
  const repositorySlug = "octo-org/OtherRepo";
  const calls = [];
  const result = cleanupIssueLifecycleLabels(
    { repoRoot: process.cwd(), repositorySlug, dryRun: false },
    autoMergeContext({
      config: { repositorySlug },
      pr: { url: `https://github.com/${repositorySlug}/pull/1`, headRepository: { nameWithOwner: repositorySlug, id: "repo-2" } },
    }),
    (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "gh" && args[0] === "issue" && args[1] === "view") {
        assert.equal(args[args.indexOf("--repo") + 1], repositorySlug);
        return ok(JSON.stringify({ labels: [{ name: "workflow" }, { name: "auto-running" }, { name: "area:infra" }] }));
      }
      if (command === "gh" && args[0] === "issue" && args[1] === "edit") {
        assert.equal(args[args.indexOf("--repo") + 1], repositorySlug);
        return ok("");
      }
      return fail(`unexpected ${command} ${args.join(" ")}`);
    },
  );
  assert.equal(result.status, "passed");
  assert.deepEqual(result.labelsRemoved, ["auto-running"]);
  assert.deepEqual(result.labelsRetained, ["workflow", "area:infra"]);
  assert.deepEqual(calls, [
    `gh issue view 1 --repo ${repositorySlug} --json labels`,
    `gh issue edit 1 --repo ${repositorySlug} --remove-label auto-running`,
  ]);

  const mismatchCalls = [];
  const mismatch = cleanupIssueLifecycleLabels(
    { repoRoot: process.cwd(), repositorySlug, dryRun: false },
    autoMergeContext({
      config: { repositorySlug },
      pr: { url: `https://github.com/${repositorySlug}/pull/1`, headRepository: { nameWithOwner: "tommytang213/Settleora", id: "repo-1" } },
    }),
    (command, args) => {
      mismatchCalls.push(`${command} ${args.join(" ")}`);
      return ok("");
    },
  );
  assert.equal(mismatch.status, "failed");
  assert.equal(mismatch.failureReason, "repository_pr_head_mismatch");
  assert.deepEqual(mismatchCalls, []);
});

test("label cleanup fails closed on malformed label readback and sanitizes command failure", () => {
  const malformed = cleanupIssueLifecycleLabels(
    { repoRoot: process.cwd(), repositorySlug: "tommytang213/Settleora", dryRun: false },
    autoMergeContext(),
    () => ok(JSON.stringify({ labels: { name: "auto-running" } })),
  );
  assert.equal(malformed.status, "failed");
  assert.equal(malformed.failureReason, "issue_label_view_malformed_labels");

  const failed = cleanupIssueLifecycleLabels(
    { repoRoot: process.cwd(), repositorySlug: "tommytang213/Settleora", dryRun: false },
    autoMergeContext(),
    (command, args) => {
      if (command === "gh" && args[0] === "issue" && args[1] === "view") return fail("view denied token ghp_abcdefghijklmnopqrstuvwxyz123456");
      return ok("");
    },
  );
  assert.equal(failed.status, "failed");
  assert.doesNotMatch(failed.failureReason, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
});

test("issue close failure and label cleanup failure are independently represented", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-label-close-independent-"));
  try {
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: false },
      autoMergeContext(),
      {
        runner: (command, args) => {
          if (command === "gh" && args[0] === "pr" && args[1] === "merge") return ok("");
          if (command === "gh" && args[0] === "pr" && args[1] === "view" && String(args[args.indexOf("--json") + 1] || "").includes("mergeCommit")) return ok(mergeReadbackJson("tommytang213/Settleora"));
          if (command === "gh" && args[0] === "pr" && args[1] === "view") return ok(preMergePrJson());
          if (command === "gh" && args[0] === "api" && args[1] === "graphql") return ok(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }));
          if (command === "gh" && args[0] === "api" && String(args[1]).includes("code-scanning/alerts")) return ok("[]");
          if (command === "git" && args[0] === "ls-remote") return ok("head123\trefs/heads/feature/auto-1-test\n");
          if (command === "gh" && args[0] === "issue" && args[1] === "view") {
            return ok(JSON.stringify({ labels: [{ name: "auto-running" }] }));
          }
          if (command === "gh" && args[0] === "issue" && args[1] === "edit") return fail("remove failed");
          if (command === "gh" && args[0] === "issue" && args[1] === "close") return fail("close failed");
          if (command === "gh" && args[0] === "pr" && args[1] === "comment") return ok("");
          if (command === "gh" && args[0] === "issue" && args[1] === "comment") return ok("");
          return fail(`unexpected ${command} ${args.join(" ")}`);
        },
      },
    );
    assert.equal(result.result, "merged");
    assert.equal(result.issueLabelCleanupResult.status, "failed");
    assert.equal(result.issueClosureResult, "close_failed");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("dry-run auto-merge previews exact transient labels only", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-label-cleanup-dry-run-"));
  try {
    const result = executeAutoMerge(
      { repoRoot: process.cwd(), logsRoot: tempRoot, dryRun: true },
      autoMergeContext({ issue: { labels: ["workflow", "auto-running", "auto-pr-opened", "canary"] } }),
      { runner: createAutoMergeRunner([]) },
    );
    assert.equal(result.result, "dry_run_eligible");
    assert.equal(result.issueLabelCleanupResult.status, "dry_run_preview");
    assert.deepEqual(result.issueLabelCleanupResult.labelsRemoved, ["auto-running", "auto-pr-opened"]);
    assert.deepEqual(result.issueLabelCleanupResult.labelsFound, ["workflow", "auto-running", "auto-pr-opened", "canary"]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("auto-merge evidence is sanitized and does not leak secrets", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-auto-merge-evidence-"));
  try {
    const evidence = writeAutoMergeEvidence(
      { logsRoot: tempRoot },
      { eligible: false, reason: "authorization Bearer live-token GEMINI_API_KEY super-secret-token", result: "blocked" },
      autoMergeContext({ changedFiles: ["tools/auto-runner/lib/auto-merge-policy.mjs"] }),
    );
    const text = readFileSync(evidence.evidencePath, "utf8");
    assert.doesNotMatch(text, /live-token|GEMINI_API_KEY|super-secret-token/i);
    assert.match(text, /\[REDACTED\]/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("canary evidence is sanitized and does not leak secret-like data", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-canary-evidence-"));
  try {
    const evidence = writeCanaryEvidence(
      { canary: true, dryRun: true, canaryEvidenceRoot: tempRoot },
      {
        issue: {
          number: 825,
          title: "authorization Bearer live-token GEMINI_API_KEY super-secret-token",
          labels: ["auto-canary-ready"],
        },
        laneDecision: { lane: "workflow-docs-tooling", contract: { allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"] } },
        canaryPolicy: { allowed: false, reason: "api_key=secret-token" },
        outcome: "blocked_needs_tommy",
      },
    );
    const text = readFileSync(evidence.evidencePath, "utf8");
    assert.doesNotMatch(text, /live-token|GEMINI_API_KEY|super-secret-token|secret-token/i);
    assert.match(text, /\[REDACTED\]/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
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

test("manual placeholder lanes and uncontracted sensitive issues remain blocked", () => {
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
  assert.ok(disabledLane.reasonCodes.includes("lane_disabled_or_manual"));

  for (const body of [
    "Change auth config for sessions",
    "Update deployment config",
    "Change settlement payment calculation",
  ]) {
    const lane = classifyIssueLane({ title: "Danger", body, labels: ["auto-ready"] });
    assert.equal(lane.allowedToImplement, false);
    assert.equal(lane.dangerGate, true);
    assert.ok(
      lane.reasonCodes.includes("missing_contract_for_sensitive_scope") ||
        lane.reasonCodes.includes("invalid_contract_for_sensitive_scope") ||
        lane.reasonCodes.includes("manual_action_required"),
    );
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

test("contract path matcher handles exact paths and directory glob boundaries deterministically", () => {
  const exact = classifyIssueLane({
    title: "Exact workflow doc",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(exact.allowedToImplement, true);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"], exact), []);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"], exact), [
    "docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md",
  ]);

  const directory = classifyIssueLane({
    title: "Workflow docs directory",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["docs/workflow/**"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(directory.allowedToImplement, true);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"], directory), []);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/workflow2/AUTONOMOUS_CODEX_RUNNER.md"], directory), [
    "docs/workflow2/AUTONOMOUS_CODEX_RUNNER.md",
  ]);
});

test("contract path matcher supports only reviewed wildcard forms used by lane manifests", () => {
  const cases = [
    {
      lane: "auth-session-security",
      profile: "api-security",
      glob: "docs/architecture/AUTH_*.md",
      good: "docs/architecture/AUTH_MFA_PASSKEY_ARCHITECTURE.md",
      bad: "docs/architecture/SESSION_MFA_PASSKEY_ARCHITECTURE.md",
    },
    {
      lane: "money-settlement-payment",
      profile: "api-money",
      glob: "docs/architecture/*MONEY*.md",
      good: "docs/architecture/DAY1_MONEY_ROUNDING_AUTHORITY_AUDIT.md",
      bad: "docs/architecture/DAY1_SETTLEMENT_AUTHORITY_AUDIT.md",
    },
    {
      lane: "schema-migrations",
      profile: "api-migrations",
      glob: "services/api/**/Migrations/**",
      good: "services/api/Settleora.Api/Migrations/202607121903_AddFoo.cs",
      bad: "services/api/Settleora.Api/MigrationNotes/202607121903_AddFoo.cs",
    },
    {
      lane: "schema-migrations",
      profile: "api-migrations",
      glob: "services/api/**/*.csproj",
      good: "services/api/Settleora.Api/Settleora.Api.csproj",
      bad: "services/api/Settleora.Api/Settleora.Api.cs",
    },
    {
      lane: "sync-import-export-restore",
      profile: "sync-import-export",
      glob: "apps/mobile/lib/**/sync/**",
      good: "apps/mobile/lib/features/sync/pending_operation.dart",
      bad: "apps/mobile/lib/features/async/pending_operation.dart",
    },
    {
      lane: "docker-compose-ci-deployment",
      profile: "compose-ci",
      glob: "tools/validate-*.mjs",
      good: "tools/validate-scaffold.mjs",
      bad: "tools/scaffold-validate.mjs",
    },
  ];

  for (const item of cases) {
    const lane = classifyIssueLane({
      title: `${item.lane} wildcard contract`,
      body: contractBody({
        lane: item.lane,
        allowedPaths: [item.glob],
        validationProfile: item.profile,
      }),
      labels: ["auto-ready"],
    });
    assert.equal(lane.allowedToImplement, true, item.glob);
    assert.deepEqual(filterForbiddenChangedFiles([item.good], lane), [], item.glob);
    assert.deepEqual(filterForbiddenChangedFiles([item.bad], lane), [item.bad], item.glob);
  }
});

test("contract path parser fails closed for unsupported wildcard, traversal, absolute, and oversized paths", () => {
  for (const allowedPath of [
    "docs/workflow/foo**bar.md",
    "docs/workflow/**suffix.md",
    "docs/workflow/../planning/ISSUE_PROGRESS_LEDGER.md",
    "/docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
    "docs\\workflow\\AUTONOMOUS_CODEX_RUNNER.md",
    "docs/workflow/\u0001bad.md",
    `docs/workflow/${"a".repeat(260)}.md`,
  ]) {
    const parsed = parseAutoRunnerContract(contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: [allowedPath],
      validationProfile: "docs-only",
    }));
    assert.equal(parsed.ok, false, allowedPath);
    assert.match(parsed.reason, /bounded repo-relative forward-slash globs/);
  }
});

test("contract path matcher treats regex metacharacters as literal path text", () => {
  const lane = classifyIssueLane({
    title: "QA doc with regex-looking name",
    body: contractBody({
      lane: "docs-planning",
      allowedPaths: ["docs/qa/path+(a)[b].md"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/qa/path+(a)[b].md"], lane), []);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/qa/pathaaaaab.md"], lane), ["docs/qa/pathaaaaab.md"]);
});

test("contract path matcher preserves canary and sensitive lane boundaries without prefix escape", () => {
  const canary = classifyIssueLane({
    title: "Canary component guardrail",
    body: contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: ["apps/mobile/lib/ui/settleora_components.dart", "apps/mobile/test/ui/settleora_component_guardrail_test.dart"],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
    }),
    labels: ["auto-canary-ready", "canary"],
  });
  assert.equal(canary.allowedToImplement, true);
  assert.deepEqual(filterForbiddenChangedFiles(["apps/mobile/lib/ui/settleora_components.dart"], canary), []);
  assert.deepEqual(filterForbiddenChangedFiles(["apps/mobile/lib/ui_private/settleora_components.dart"], canary), [
    "apps/mobile/lib/ui_private/settleora_components.dart",
  ]);

  const auth = classifyIssueLane({
    title: "Auth path boundary",
    body: contractBody({
      lane: "auth-session-security",
      allowedPaths: ["services/api/Auth/**"],
      validationProfile: "api-security",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(auth.allowedToImplement, true);
  assert.deepEqual(filterForbiddenChangedFiles(["services/api/Auth/SessionRuntime.cs"], auth), []);
  assert.deepEqual(filterForbiddenChangedFiles(["services/api/Authz/SessionRuntime.cs"], auth), [
    "services/api/Authz/SessionRuntime.cs",
  ]);
});

test("contract path matcher rejects malformed changed paths and no longer constructs RegExp", () => {
  const lane = classifyIssueLane({
    title: "Workflow docs",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["docs/workflow/**"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.deepEqual(
    filterForbiddenChangedFiles([
      "../docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
      "/docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
      "docs\\workflow\\AUTONOMOUS_CODEX_RUNNER.md",
      `docs/workflow/${"x".repeat(520)}.md`,
    ], lane),
    [
      "../docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
      "/docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
      "docs\\workflow\\AUTONOMOUS_CODEX_RUNNER.md",
      `docs/workflow/${"x".repeat(520)}.md`,
    ],
  );

  const source = readFileSync(path.resolve("tools/auto-runner/lib/lane-policy.mjs"), "utf8");
  assert.doesNotMatch(source, /function globToRegExp|new RegExp/);
});

test("review verdict parsing approves valid verdict JSON surrounded by prose", () => {
  const approve = parseReviewVerdict(`notes\n${reviewVerdictJson()}\nextra review notes`);
  assert.equal(approve.verdict, "approve");
  assert.equal(approve.reviewed_base_sha, "e".repeat(40));
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

  const missingReviewedBase = parseReviewVerdict(reviewVerdictJson({ reviewed_base_sha: undefined }));
  assert.equal(missingReviewedBase.verdict, "unable_to_review");
  assert.match(missingReviewedBase.blocking_findings[0], /reviewed_base_sha/);

  const branchReviewedBase = parseReviewVerdict(reviewVerdictJson({ reviewed_base_sha: "main" }));
  assert.equal(branchReviewedBase.verdict, "unable_to_review");
  assert.match(branchReviewedBase.blocking_findings[0], /40-character SHA/);

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

test("review prompt fails closed for conflicting verdicts across stdout and stderr", () => {
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

    assert.equal(result.verdict.verdict, "unable_to_review");
    assert.equal(result.responsePayloadSource, "stdout");
    assert.equal(result.responsePayloadBoundary, "process.stdout");
    assert.equal(result.verdict.review_json_diagnostics.valid_verdict_count, 2);
    assert.equal(result.verdict.review_json_diagnostics.invalid_candidate_count, 1);
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

test("review prompt accepts one identical verdict duplicated into the diagnostic stream", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-boundary-"));
  try {
    const logsRoot = path.join(tempRoot, "logs");
    mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
    const duplicated = reviewVerdictJson();
    const reviewer = writeFakeReviewer(tempRoot, [
      `printf '%s\\n' ${shellArg(duplicated)}`,
      `printf '%s\\n' ${shellArg(`Diagnostic transcript repeated final response:\n${duplicated}`)} >&2`,
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
    assert.equal(result.reviewStatus, "passed");
    assert.equal(result.responsePayloadBoundary, "process.stdout");
    assert.equal(result.rawCandidateDiagnostics.valid_verdict_count, 2);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review prompt rejects cross-stream verdicts that differ beyond persisted finding bounds", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-boundary-"));
  try {
    const logsRoot = path.join(tempRoot, "logs");
    mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
    const sharedFindings = Array.from({ length: 20 }, (_, index) => `shared-${index}`);
    const stdoutVerdict = reviewVerdictJson({ non_blocking_findings: [...sharedFindings, "stdout-only"] });
    const stderrVerdict = reviewVerdictJson({ non_blocking_findings: [...sharedFindings, "stderr-only"] });
    const reviewer = writeFakeReviewer(tempRoot, [
      `printf '%s\\n' ${shellArg(stdoutVerdict)}`,
      `printf '%s\\n' ${shellArg(stderrVerdict)} >&2`,
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
    assert.equal(result.reviewFailureCategory, "ambiguous");
    assert.equal(result.rawCandidateDiagnostics.valid_verdict_count, 2);
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

test("review prompt falls back to stderr only when stdout is empty and stderr has one verdict", () => {
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

    assert.equal(result.verdict.verdict, "approve");
    assert.equal(result.reviewedBaseSha, "e".repeat(40));
    assert.equal(result.responsePayloadSource, "stderr");
    assert.equal(result.responsePayloadBoundary, "process.stderr:fallback_single_verdict_stdout_empty");
    assert.equal(result.verdict.review_json_diagnostics.valid_verdict_count, 1);
    assert.equal(result.rawCandidateDiagnostics.valid_verdict_count, 1);
    assert.equal(result.verdict.review_output_boundary.response_payload_source, "stderr");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("persisted Codex review evidence retains its bounded completion timestamp", () => {
  const completedAt = "2026-07-19T19:46:04.000Z";
  const sanitized = sanitizePersistedEvidence({
    rawOutput: "provider transcript",
    reviewStatus: "completed",
    completedAt,
    reviewedHead: "a".repeat(40),
    reviewedBaseSha: "e".repeat(40),
    verdict: { verdict: "approve", reviewed_base_sha: "e".repeat(40) },
  });

  assert.equal(sanitized.completedAt, completedAt);
  assert.equal(sanitized.rawOutput, undefined);
});

test("Codex prompt attestation requires the reviewer-returned base to match the package base", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-base-binding-"));
  try {
    const logsRoot = path.join(tempRoot, "logs");
    mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
    const reviewer = writeFakeReviewer(tempRoot, [`printf '%s\\n' ${shellArg(reviewVerdictJson())}`]);
    const common = { dryRun: false, logsRoot, repoRoot: process.cwd(), reviewerCommand: reviewer };
    const matching = runReviewPrompt(common, { summary: { repository: "tommytang213/Settleora", baseSha: "e".repeat(40) } });
    const mismatched = runReviewPrompt(common, { summary: { repository: "tommytang213/Settleora", baseSha: "d".repeat(40) } });

    assert.equal(matching.attestationSource, "provider_prompt_binding");
    assert.equal(matching.attestedCandidateIdentity.baseSha, "e".repeat(40));
    assert.equal(mismatched.reviewedBaseSha, "e".repeat(40));
    assert.equal(mismatched.attestationSource, undefined);
    assert.equal(mismatched.attestedCandidateIdentity, undefined);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review prompt rejects conflicting stdout and stderr verdicts without fallback", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-conflict-"));
  try {
    const logsRoot = path.join(tempRoot, "logs");
    mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
    const reviewer = writeFakeReviewer(tempRoot, [
      `printf '%s\\n' ${shellArg(reviewVerdictJson())}`,
      `printf '%s\\n' ${shellArg(reviewVerdictJson({ verdict: "changes_requested" }))} >&2`,
    ]);
    const result = runReviewPrompt(
      {
        dryRun: false,
        logsRoot,
        repoRoot: process.cwd(),
        reviewerCommand: reviewer,
      },
      { packagePath: path.join(tempRoot, "package.json"), summary: { issue: { number: 805 }, currentHead: "head1", changedFiles: ["a.md"] } },
    );

    assert.equal(result.verdict.verdict, "unable_to_review");
    assert.equal(result.responsePayloadBoundary, "process.stdout");
    assert.equal(result.rawCandidateDiagnostics.valid_verdict_count, 2);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review prompt retries missing selected response once and records attempts", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-retry-"));
  try {
    const logsRoot = path.join(tempRoot, "logs");
    mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
    const counter = path.join(tempRoot, "count");
    const reviewer = writeFakeReviewer(tempRoot, [
      `count=0; test -f ${shellArg(counter)} && count=$(cat ${shellArg(counter)})`,
      "count=$((count + 1))",
      `printf '%s' "$count" > ${shellArg(counter)}`,
      "if [ \"$count\" = \"1\" ]; then exit 0; fi",
      `printf '%s\\n' ${shellArg(reviewVerdictJson())}`,
    ]);
    const result = runReviewPrompt(
      {
        dryRun: false,
        logsRoot,
        repoRoot: process.cwd(),
        reviewerCommand: reviewer,
        codexMechanicsReviewRetry: { maxAttempts: 2 },
      },
      { packagePath: path.join(tempRoot, "package.json"), summary: { issue: { number: 805 }, currentHead: "head1", changedFiles: ["a.md"] } },
    );

    assert.equal(result.verdict.verdict, "approve");
    assert.equal(result.attemptCount, 2);
    assert.equal(result.attempts[0].reviewFailureCategory, "transport");
    assert.equal(result.reviewedHead, "head1");
    assert.deepEqual(result.changedFiles, ["a.md"]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review prompt does not retry substantive changes_requested verdict", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-no-retry-"));
  try {
    const logsRoot = path.join(tempRoot, "logs");
    mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
    const reviewer = writeFakeReviewer(tempRoot, [
      `printf '%s\\n' ${shellArg(reviewVerdictJson({ verdict: "changes_requested" }))}`,
    ]);
    const result = runReviewPrompt(
      {
        dryRun: false,
        logsRoot,
        repoRoot: process.cwd(),
        reviewerCommand: reviewer,
        codexMechanicsReviewRetry: { maxAttempts: 2 },
      },
      { packagePath: path.join(tempRoot, "package.json"), summary: { issue: { number: 805 }, currentHead: "head1", changedFiles: ["a.md"] } },
    );

    assert.equal(result.verdict.verdict, "changes_requested");
    assert.equal(result.attemptCount, 1);
    assert.equal(result.reviewFailureCategory, "substantive");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("review prompt does not retry substantive non-approve verdict with nonzero process status", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-no-retry-nonzero-"));
  try {
    const logsRoot = path.join(tempRoot, "logs");
    mkdirSync(path.join(logsRoot, "reviews"), { recursive: true });
    const reviewer = writeFakeReviewer(tempRoot, [
      `printf '%s\\n' ${shellArg(reviewVerdictJson({ verdict: "changes_requested" }))}`,
      "exit 1",
    ]);
    const result = runReviewPrompt(
      {
        dryRun: false,
        logsRoot,
        repoRoot: process.cwd(),
        reviewerCommand: reviewer,
        codexMechanicsReviewRetry: { maxAttempts: 2 },
      },
      { packagePath: path.join(tempRoot, "package.json"), summary: { issue: { number: 805 }, currentHead: "head1", changedFiles: ["a.md"] } },
    );

    assert.equal(result.verdict.verdict, "changes_requested");
    assert.equal(result.status, 1);
    assert.equal(result.attemptCount, 1);
    assert.equal(result.reviewFailureCategory, "substantive");
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

test("real-run launch workspace allows clean main and non-main but rejects dirty worktrees", () => {
  const repo = createTempGitRepo();
  const loggerWarnings = [];
  const logger = { warn: (message, data) => loggerWarnings.push({ message, data }) };
  try {
    const mainLaunch = ensureLaunchWorkspace({ run: true, dryRun: false, repoRoot: repo }, logger);
    assert.equal(mainLaunch.branch, "main");
    assert.equal(mainLaunch.dirty, false);
    assert.match(mainLaunch.originMainSha, /^[a-f0-9]{40}$/);

    git(repo, ["switch", "-c", "control-plane-launch"]);
    const branchLaunch = ensureLaunchWorkspace({ run: true, dryRun: false, repoRoot: repo }, logger);
    assert.equal(branchLaunch.branch, "control-plane-launch");
    assert.equal(branchLaunch.dirty, false);

    git(repo, ["switch", "--detach", "origin/main"]);
    assert.throws(
      () => ensureLaunchWorkspace({ run: true, dryRun: false, repoRoot: repo }, logger),
      /Refusing real-run launch from a detached or unnamed checkout/,
    );
    git(repo, ["switch", "control-plane-launch"]);

    writeFileSync(path.join(repo, "dirty.txt"), "dirty\n");
    assert.throws(
      () => ensureLaunchWorkspace({ run: true, dryRun: false, repoRoot: repo }, logger),
      /Refusing real-run launch with a dirty worktree/,
    );

    const dryLaunch = ensureLaunchWorkspace({ run: false, dryRun: true, repoRoot: repo }, logger);
    assert.equal(dryLaunch.dirty, true);
    assert.match(loggerWarnings.at(-1).message, /Dry-run observed a dirty worktree/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("task mutation workspace accepts only the exact clean generated task branch", () => {
  const repo = createTempGitRepo();
  const config = { run: true, dryRun: false, repoRoot: repo };
  const branchName = "feature/auto-123-workspace-safety";
  try {
    const baseSha = git(repo, ["rev-parse", "origin/main"]).stdout.trim();
    assert.throws(
      () => ensureTaskMutationWorkspace(config, { branchName, expectedOriginMainSha: baseSha }),
      /Refusing task mutation on main/,
    );

    createTaskBranch(config, branchName);
    const accepted = ensureTaskMutationWorkspace(config, { branchName, expectedOriginMainSha: baseSha });
    assert.equal(accepted.branch, branchName);
    assert.equal(accepted.originMainSha, baseSha);
    assert.equal(accepted.headSha, baseSha);
    assert.equal(accepted.dirty, false);

    writeFileSync(path.join(repo, "dirty.txt"), "dirty\n");
    assert.throws(
      () => ensureTaskMutationWorkspace(config, { branchName, expectedOriginMainSha: baseSha }),
      /Refusing task mutation with a dirty worktree/,
    );
    rmSync(path.join(repo, "dirty.txt"), { force: true });

    git(repo, ["switch", "-c", "feature/wrong-branch", "origin/main"]);
    assert.throws(
      () => ensureTaskMutationWorkspace(config, { branchName, expectedOriginMainSha: baseSha }),
      /Refusing task mutation from unexpected branch/,
    );

    git(repo, ["switch", "--detach", "origin/main"]);
    assert.throws(
      () => ensureTaskMutationWorkspace(config, { branchName, expectedOriginMainSha: baseSha }),
      /Refusing task mutation from a detached or unnamed branch/,
    );

    createTaskBranch(config, branchName);
    writeFileSync(path.join(repo, "tools/auto-runner/README.md"), "changed after branch\n");
    git(repo, ["add", "--", "tools/auto-runner/README.md"]);
    git(repo, ["commit", "-m", "move branch head"]);
    assert.throws(
      () => ensureTaskMutationWorkspace(config, { branchName, expectedOriginMainSha: baseSha }),
      /task branch HEAD does not match expected origin\/main/,
    );

    git(repo, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
    assert.throws(
      () => ensureTaskMutationWorkspace(config, { branchName, expectedOriginMainSha: baseSha }),
      /origin\/main changed after branch creation/,
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("implementation path verifies mutation workspace after task branch creation before Codex implementation", () => {
  const source = readFileSync("tools/auto-runner/settleora-auto-runner.mjs", "utf8");
  const branchIndex = source.indexOf("createTaskBranch(config, branchName);");
  const guardIndex = source.indexOf("ensureTaskMutationWorkspace(config", branchIndex);
  const promptIndex = source.indexOf("generateTaskPrompt(config, issue, laneDecision, branchName)", branchIndex);
  const codexIndex = source.indexOf("const codexResult = runCodexPrompt(config", branchIndex);
  assert.notEqual(branchIndex, -1);
  assert.notEqual(guardIndex, -1);
  assert.notEqual(promptIndex, -1);
  assert.notEqual(codexIndex, -1);
  assert.ok(branchIndex < guardIndex);
  assert.ok(guardIndex < promptIndex);
  assert.ok(promptIndex < codexIndex);
});

test("enabled session lifecycle builds and persists an exact implementation invocation", () => {
  const source = readFileSync("tools/auto-runner/settleora-auto-runner.mjs", "utf8");
  assert.match(source, /createSessionLifecycleState\(\{/);
  assert.match(source, /persistSessionLifecycleState\(config, lifecycle\)/);
  assert.match(source, /promptInfo\.sessionLifecycle = lifecycleInvocation/);
});

test("ordinary recovery is born with the final task branch identity", () => {
  assert.equal(
    planOrdinaryRecoveryBranch({
      issue: { number: 983, title: "Runnable documentation evidence B" },
      laneDecision: { branchStrategy: "feature" },
      taskTimestamp: "2026-07-24T043318Z",
    }),
    "feature/auto-983-runnable-documentation-evidence-b-2026-07-24t0433",
  );
  assert.equal(
    planOrdinaryRecoveryBranch({
      issue: { number: 900, title: "Bundle recovery fixture", labels: ["auto-bundle"] },
      laneDecision: { branchStrategy: "feature" },
      taskTimestamp: "2026-07-24T043318Z",
    }),
    "feature-bundle/auto-900-bundle-recovery-fixture-2026-07-24t0433",
  );
  const source = readFileSync("tools/auto-runner/settleora-auto-runner.mjs", "utf8");
  const iteration = source.slice(source.indexOf("logger.info(`Iteration"), source.indexOf("const claim = claimIssue"));
  assert.ok(iteration.indexOf("const laneDecision =") < iteration.indexOf("const plannedBranchName ="));
  assert.match(iteration, /const plannedBranchName =/);
  assert.match(iteration, /branchName: plannedBranchName/);
  assert.match(iteration, /fetchOriginMain\(config\)/);
  assert.match(iteration, /baseSha: initialBaseSha/);
  assert.doesNotMatch(iteration, /pending\/issue-/);
});

test("existing-PR recovery creates lifecycle authority before merge execution", () => {
  const source = readFileSync("tools/auto-runner/settleora-auto-runner.mjs", "utf8");
  const recovery = source.slice(source.indexOf("async function recoverExistingPrIfConfigured"), source.indexOf("async function generateExistingPrRecoveryEvidence"));
  const lifecycleIndex = recovery.indexOf("createSessionLifecycleState({");
  const mergeIndex = recovery.indexOf("executeAutoMerge(config, context");
  assert.ok(lifecycleIndex >= 0 && mergeIndex > lifecycleIndex);
  assert.match(recovery, /if \(sessionLifecycle\) issue\.sessionLifecycle = sessionLifecycle/);
  assert.match(recovery, /sessionLifecycle,/);
  const iteration = source.slice(source.indexOf("const recovery = await recoverExistingPrIfConfigured"), source.indexOf("const slug = slugify"));
  assert.match(iteration, /recoveryTerminalEffectConfirmed/);
  assert.match(iteration, /const recoveryLifecycle = issue\.sessionLifecycle \|\| recovery\.sessionLifecycle/);
  assert.match(iteration, /transitionSessionLifecyclePhase\(config, recoveryLifecycle/);
  assert.match(iteration, /autoMergeEffectsConfirmed\(config, recoveryLifecycle, recovery\.autoMerge\)/);
  assert.match(source, /findPreEffectIntents\(config,[\s\S]*!\["finalized", "failed_closed"\]\.includes\(intent\.status\)/);
});

test("merged lifecycle terminal effects block failed supported project hygiene", () => {
  const merged = {
    result: "merged",
    mergeReadback: { ok: true },
    sourceBranchRestoration: { confirmed: true },
    comments: { pr: { status: 0 } },
    completionHygiene: {
      comment: { status: "updated" },
      closure: { status: "skipped" },
      labelCleanup: { status: "skipped" },
      parentProgress: { status: "updated" },
      ledger: { status: "reused" },
      project: { status: "failed", reason: "project_status_mapping_incomplete" },
    },
  };
  assert.equal(autoMergeEffectsConfirmed({}, null, merged), false);
  assert.equal(autoMergeEffectsConfirmed({}, null, {
    ...merged,
    completionHygiene: { ...merged.completionHygiene, project: { status: "not_updated", reason: "project_status_mapping_not_configured" } },
  }), true);
  assert.equal(autoMergeEffectsConfirmed({}, null, {
    ...merged,
    completionHygiene: { ...merged.completionHygiene, project: { status: "not_updated", reason: "project_status_mapping_not_configured" }, ledger: { status: "preview", reason: "followup_issue_creation_disabled" } },
  }), true);
  assert.equal(autoMergeEffectsConfirmed({}, null, {
    ...merged,
    completionHygiene: { ...merged.completionHygiene, project: { status: "not_updated", reason: "project_status_mapping_not_configured" }, ledger: { status: "preview", reason: "unexpected_preview" } },
  }), false);
});

test("feature-bundle results propagate lifecycle authority to terminal issue effects", () => {
  const runner = readFileSync("tools/auto-runner/settleora-auto-runner.mjs", "utf8");
  const bundlePath = runner.slice(runner.indexOf("const bundleResult = await runFeatureBundleIteration"), runner.indexOf("const recovery = await recoverExistingPrIfConfigured"));
  assert.match(bundlePath, /issue\.sessionLifecycle = bundleResult\.sessionLifecycle/);
  const bundle = readFileSync("tools/auto-runner/lib/feature-bundle-orchestrator.mjs", "utf8");
  assert.match(bundle, /result\.sessionLifecycle = sessionLifecycle/);
  assert.match(bundlePath, /finishIssueOutcome[\s\S]*const bundleLifecycle = issue\.sessionLifecycle \|\| bundleResult\.sessionLifecycle/);
  assert.match(bundlePath, /autoMergeEffectsConfirmed\(config, bundleLifecycle, bundleResult\.autoMerge\)[\s\S]*transitionSessionLifecyclePhase\(config, bundleLifecycle/);
});

test("stack CLI constructs and injects one live fixed-argv runner", () => {
  const source = readFileSync("tools/auto-runner/settleora-auto-runner.mjs", "utf8");
  const stackIndex = source.indexOf("if (cliArgs.runPrStack)");
  const loadIndex = source.indexOf("const config = loadConfig(cliArgs);", stackIndex);
  const runnerIndex = source.indexOf("const liveRunner = createLiveFixedArgvRunner(config);", stackIndex);
  const reviewAdaptersIndex = source.indexOf("const liveReviewAdapters = createLivePrStackReviewAdapters(config);", stackIndex);
  const lockIndex = source.indexOf("acquireRunnerLock(config", stackIndex);
  const executionIndex = source.indexOf("runPrStackExecution(config, cliArgs, { runner: liveRunner, ...liveReviewAdapters })", stackIndex);
  assert.notEqual(stackIndex, -1);
  assert.notEqual(loadIndex, -1);
  assert.notEqual(runnerIndex, -1);
  assert.notEqual(reviewAdaptersIndex, -1);
  assert.notEqual(lockIndex, -1);
  assert.notEqual(executionIndex, -1);
  assert.ok(loadIndex < runnerIndex);
  assert.ok(runnerIndex < reviewAdaptersIndex);
  assert.ok(reviewAdaptersIndex < lockIndex);
  assert.ok(lockIndex < executionIndex);
  assert.match(source, /settleoraFixedArgvRunner = true/);
  assert.match(source, /settleoraRunnerMode = "live"/);
  assert.match(source, /shell_execution_refused/);
  assert.match(source, /spawnSync\(command, args,[\s\S]*shell: false/);
  assert.match(source, /runStrongReview: async/);
  assert.match(source, /runCodexReview: async/);
  assert.match(source, /reviewerTier: "strong_independent"/);
  const reviewAdapterBody = source.slice(reviewAdaptersIndex, source.indexOf("function boundRunnerOutput", reviewAdaptersIndex));
  assert.match(reviewAdapterBody, /incomingContract\.manualMergeRequired \?\? incomingLaneDecision\.manualMergeRequired \?\? true/);
  assert.match(reviewAdapterBody, /incomingContract\.autoMergeEligible \?\? incomingLaneDecision\.autoMergeEligible \?\? false/);
  assert.doesNotMatch(reviewAdapterBody, /manualGateSatisfied/);
  assert.doesNotMatch(reviewAdapterBody, /manualMergeRequired: !mechanicsPhase/);
  assert.doesNotMatch(reviewAdapterBody, /autoMergeEligible: mechanicsPhase/);
});

test("live fixed-argv runner preserves machine stdout while sanitizing persisted excerpts", () => {
  const source = readFileSync("tools/auto-runner/settleora-auto-runner.mjs", "utf8");
  const runnerIndex = source.indexOf("function createLiveFixedArgvRunner");
  const stdoutIndex = source.indexOf("const stdout = boundRunnerOutput(result.stdout || \"\", maxOutputBytes);", runnerIndex);
  const returnIndex = source.indexOf("stdout,", stdoutIndex);
  const evidenceIndex = source.indexOf("stdoutExcerpt: stdoutEvidence", stdoutIndex);
  const sanitizerIndex = source.indexOf("function sanitizeRunnerOutputEvidence", runnerIndex);
  assert.notEqual(stdoutIndex, -1);
  assert.notEqual(returnIndex, -1);
  assert.notEqual(evidenceIndex, -1);
  assert.notEqual(sanitizerIndex, -1);
  assert.ok(stdoutIndex < returnIndex);
  assert.ok(returnIndex < evidenceIndex);
  assert.ok(sanitizerIndex > runnerIndex);
  assert.match(source, /sanitizeRunnerOutputEvidence\(stdout, 1000\)/);
  assert.match(source, /sanitizeRunnerOutputEvidence\(stderr, 1000\)/);
  const boundBody = source.slice(source.indexOf("function boundRunnerOutput"), sanitizerIndex);
  assert.doesNotMatch(boundBody, /replace\(/);
});

test("production auto-merge inspection callers pass explicit live runner authority", () => {
  const runnerSource = readFileSync("tools/auto-runner/settleora-auto-runner.mjs", "utf8");
  const recoveryIndex = runnerSource.indexOf("async function recoverExistingPrIfConfigured");
  const recoveryRunnerIndex = runnerSource.indexOf("const autoMergeRunner = config.dryRun ? null : createLiveFixedArgvRunner(config);", recoveryIndex);
  const recoveryInspectIndex = runnerSource.indexOf("inspectAutoMergeGithubState(config, { issue, prUrlOrNumber: recoveryConfig.prNumber || recoveryConfig.prUrl, laneDecision }, { runner: autoMergeRunner })", recoveryIndex);
  const recoveryWaitIndex = runnerSource.indexOf("inspectState: (cfg, ctx) => inspectAutoMergeGithubState(cfg, { issue: ctx.issue, prUrlOrNumber: ctx.pr?.number || ctx.pr?.url, laneDecision }, { runner: autoMergeRunner })", recoveryIndex);
  assert.notEqual(recoveryRunnerIndex, -1);
  assert.notEqual(recoveryInspectIndex, -1);
  assert.notEqual(recoveryWaitIndex, -1);
  assert.ok(recoveryRunnerIndex < recoveryInspectIndex);
  assert.ok(recoveryInspectIndex < recoveryWaitIndex);

  const normalIndex = runnerSource.indexOf("async function evaluateOrExecuteAutoMerge");
  const normalRunnerIndex = runnerSource.indexOf("const autoMergeRunner = config.dryRun ? null : createLiveFixedArgvRunner(config);", normalIndex);
  const normalInspectIndex = runnerSource.indexOf("inspectAutoMergeGithubState(config, { issue, prUrlOrNumber: iteration.pr.url, laneDecision: iteration.laneDecision }, { runner: autoMergeRunner })", normalIndex);
  const normalExecuteIndex = runnerSource.indexOf("}, { runner: autoMergeRunner });", normalInspectIndex);
  assert.notEqual(normalRunnerIndex, -1);
  assert.notEqual(normalInspectIndex, -1);
  assert.notEqual(normalExecuteIndex, -1);
  assert.ok(normalRunnerIndex < normalInspectIndex);
  assert.ok(normalInspectIndex < normalExecuteIndex);

  const policySource = readFileSync("tools/auto-runner/lib/auto-merge-policy.mjs", "utf8");
  const waitIndex = policySource.indexOf("function executeAutoMergeWithWait");
  assert.match(policySource.slice(waitIndex, waitIndex + 700), /inspectAutoMergeGithubState\(cfg,[\s\S]*\{ runner \}/);
});

test("production source-failure paths forward recovery decisions and bound initial recursion", () => {
  const runnerSource = readFileSync("tools/auto-runner/settleora-auto-runner.mjs", "utf8");
  assert.match(runnerSource, /source_failure_fix: async \(continuation, \{ batch, decision, intent \}\)/);
  assert.match(runnerSource, /localSourceChangingRoundsPerEpoch \|\| 0\) >= 50/);
  assert.match(runnerSource, /accountNormalReviewFixCommit\(iteration, postFix\.runnerCreatedCommitSha, "recursive_source_failure_fix_commit"\)/);
});

test("review-fix prompt respects exact authorized non-tooling lane paths", () => {
  const prompt = buildReviewFixPrompt({
    issue: { number: 944, title: "mobile source fix" }, branchName: "feature/auto-944-x",
    laneDecision: { lane: "mobile-application", allowedPaths: ["apps/mobile/lib/**"], contract: { autoMergeEligible: true, manualMergeRequired: false } },
    changedFiles: ["apps/mobile/lib/example.dart"], validation: { passed: false }, trigger: { source: "local_validation", findings: [] },
  });
  assert.match(prompt, /unless both the active lane and the exact allowedPaths/);
  assert.doesNotMatch(prompt, /public\/admin exposure, mobile,/);
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
  git(repo, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return repo;
}

function autoMergeLane(overrides = {}) {
  const lane = overrides.lane || "workflow-docs-tooling";
  return {
    lane,
    canonicalLane: overrides.canonicalLane || lane,
    allowedToImplement: true,
    dangerGate: false,
    allowedPaths: ["tools/auto-runner/**", "docs/workflow/**"],
    laneManifestAllowedPaths: ["tools/auto-runner/**", "docs/workflow/**", "scripts/ai/**"],
    validationProfile: "runner-tests",
    manualMergeRequired: false,
    autoMergeEligible: true,
    prCreationAllowed: true,
    branchStrategy: "normal",
    reviewerTier: "cheap_independent",
    laneManifest: {
      id: "workflow-docs-tooling",
      decisionType: "runnable",
      autoMergeAllowed: true,
    },
    contract: {
      manualMergeRequired: false,
      autoMergeEligible: true,
      allowedPaths: ["tools/auto-runner/**", "docs/workflow/**"],
      ...overrides.contract,
    },
    ...overrides,
  };
}

function autoMergeContext(overrides = {}) {
  const laneDecision = overrides.laneDecision || autoMergeLane();
  const changedFiles = overrides.changedFiles || ["tools/auto-runner/lib/auto-merge-policy.mjs"];
  const fileDigest = sha256Strings(changedFiles);
  const platformRequirements = inferMobileBuildPlatformRequirements(changedFiles, laneDecision);
  const platformEvidence = {
    headSha: "head123",
    baseSha: "base123",
    changedFilesDigest: fileDigest,
    platforms: platformRequirements.platforms,
    localCheckIds: platformRequirements.localCheckIds,
    externalCheckIds: platformRequirements.externalCheckIds,
    localChecks: platformRequirements.localCheckIds.map((checkId) => ({
      checkId,
      command: `fixture ${checkId}`,
      status: 0,
      passed: true,
    })),
  };
  const defaultRequiredChecks = [
    { name: "Validate scaffold", status: "COMPLETED", conclusion: "SUCCESS" },
    { name: "CodeQL", status: "COMPLETED", conclusion: "SUCCESS" },
    { name: "Semgrep CE scan", status: "COMPLETED", conclusion: "SUCCESS" },
    { name: "Trivy repository scan", status: "COMPLETED", conclusion: "SUCCESS" },
  ];
  const pr = {
    number: 1,
    url: "https://example.invalid/pull/1",
    state: "OPEN",
    isDraft: false,
    baseRefName: "main",
    headRefName: "feature/auto-1-test",
    headRefOid: "head123",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    title: "Auto-runner: #1 Low risk auto merge",
    body: "Closes or updates #1.",
    ...(overrides.pr || {}),
  };
  const issue = {
    number: 1,
    title: "Low risk auto merge",
    url: "https://example.invalid/issues/1",
    state: "OPEN",
    labels: ["auto-ready"],
    ...(overrides.issue || {}),
  };
  return {
    config: {
      repositorySlug: "tommytang213/Settleora",
      allowAutoMerge: true,
      autoMergePolicy: {
        approvedLanes: [laneDecision.canonicalLane || laneDecision.lane],
        requiredChecks: ["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"],
        allowedSkippedChecks: [],
        allowedNeutralChecks: [],
      },
      ...(overrides.config || {}),
    },
    issue,
    laneDecision,
    changedFiles,
    forbiddenChangedFiles: overrides.forbiddenChangedFiles ?? filterForbiddenChangedFiles(changedFiles, laneDecision),
    changedFilesExactlyMatchAllowedPaths: overrides.changedFilesExactlyMatchAllowedPaths ?? true,
    externalReviewRequired: overrides.externalReviewRequired ?? true,
    externalReview: Object.hasOwn(overrides, "externalReview")
      ? overrides.externalReview
      : {
          status: "pass",
          verdict: "pass",
          reason: "integrated_review_passed",
          reviewedHead: "head123",
          baseSha: "base123",
          changedFiles,
          changedFilesDigest: fileDigest,
          provider: "gemini",
          tier: laneDecision.reviewerTier || "cheap_independent",
          independent: true,
          completedAt: "2026-07-12T00:00:00.000Z",
          budget: { status: "pass" },
        },
    review: overrides.review || {
      verdict: { verdict: "approve" },
      reviewedHead: "head123",
      baseSha: "base123",
      changedFiles,
      changedFilesDigest: fileDigest,
      completedAt: "2026-07-12T00:00:00.000Z",
      blockingFindings: [],
    },
    codexMechanicsReviewApproved: overrides.codexMechanicsReviewApproved ?? true,
    validation: overrides.validation || {
      passed: true,
      profile: laneDecision.validationProfile,
      headSha: "head123",
      baseSha: "base123",
      changedFiles,
      changedFilesDigest: fileDigest,
      mobileBuildPlatformEvidence: platformEvidence,
      completedAt: "2026-07-12T00:00:00.000Z",
      results: [{ command: "npm run validate:scaffold", status: 0 }],
    },
    externalPlatformBuildEvidence: Object.hasOwn(overrides, "externalPlatformBuildEvidence")
      ? overrides.externalPlatformBuildEvidence
      : platformRequirements.externalCheckIds.map((checkId) => ({
          checkId,
          status: "COMPLETED",
          conclusion: "SUCCESS",
          headSha: "head123",
          baseSha: "base123",
          changedFilesDigest: fileDigest,
          platforms: platformRequirements.platforms,
        })),
    worktreeClean: overrides.worktreeClean ?? true,
    pr,
    actualHeadSha: overrides.actualHeadSha || pr.headRefOid,
    expectedHeadSha: overrides.expectedHeadSha || "head123",
    runnerCreatedCommitSha: overrides.runnerCreatedCommitSha || "head123",
    branchName: overrides.branchName || "feature/auto-1-test",
    currentOriginMainSha: overrides.currentOriginMainSha || "base123",
    expectedOriginMainSha: overrides.expectedOriginMainSha || "base123",
    requiredChecks: overrides.requiredChecks || defaultRequiredChecks,
    reviewThreads: overrides.reviewThreads || [],
    codeScanningAlerts: overrides.codeScanningAlerts || [],
    blockingMarkers: overrides.blockingMarkers || [],
  };
}

function autoMergeRequiredChecks(overrides = {}) {
  return ["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"].map((name) => ({
    name,
    status: overrides[name]?.status || "COMPLETED",
    conclusion: Object.hasOwn(overrides[name] || {}, "conclusion") ? overrides[name].conclusion : "SUCCESS",
  }));
}

function autoMergePolicyFixture(overrides = {}) {
  return {
    approvedLanes: ["workflow-docs-tooling"],
    requiredChecks: ["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"],
    allowedSkippedChecks: [],
    allowedNeutralChecks: [],
    ...overrides,
  };
}

function sha256Strings(values = []) {
  return canonicalChangedFilesDigest(values);
}

function canonicalChangedFilesDigest(values = []) {
  return createHash("sha256").update(JSON.stringify([...new Set(values || [])].sort())).digest("hex");
}

function existingPrRecoveryContext(overrides = {}) {
  const changedFiles = overrides.changedFiles || ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"];
  const pr = {
    number: 828,
    url: "https://github.com/tommytang213/Settleora/pull/828",
    state: "OPEN",
    isDraft: false,
    baseRefName: "main",
    headRefName: "feature/auto-825-auto-merge-canary-1-workflow-docs-checkp-2026-07-09t1724",
    headRefOid: "head123",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    title: "Auto-runner: #825 Auto-merge canary 1: workflow docs checkpoint",
    body: "Closes or updates #825.\nIntegrated Gemini review: pass\nPre-PR AI review: approve",
    ...(overrides.pr || {}),
  };
  const context = autoMergeContext({
    config: { allowAutoMerge: true, allowExistingPrRecovery: true, ...(overrides.config || {}) },
    issue: {
      number: 825,
      title: "Auto-merge canary 1: workflow docs checkpoint",
      state: "OPEN",
      labels: ["auto-canary-ready", "canary", "workflow"],
      ...(overrides.issue || {}),
    },
    laneDecision: overrides.laneDecision || autoMergeLane({
      allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
      laneManifestAllowedPaths: ["tools/auto-runner/**", "docs/workflow/**"],
      validationProfile: "docs-only",
      contract: {
        allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
        manualMergeRequired: false,
        autoMergeEligible: true,
      },
    }),
    changedFiles,
    changedFilesExactlyMatchAllowedPaths: overrides.changedFilesExactlyMatchAllowedPaths ?? true,
    pr,
    expectedHeadSha: overrides.expectedHeadSha || "head123",
    actualHeadSha: overrides.actualHeadSha || pr.headRefOid,
    reviewThreads: overrides.reviewThreads || [],
    codeScanningAlerts: overrides.codeScanningAlerts || [],
    blockingMarkers: overrides.blockingMarkers || [],
    requiredChecks: overrides.requiredChecks,
  });
  const recoveryDigest = canonicalChangedFilesDigest(changedFiles);
  return {
    ...context,
    validation: {
      ...context.validation,
      changedFilesDigest: recoveryDigest,
    },
    externalReview: context.externalReview
      ? {
          ...context.externalReview,
          changedFilesDigest: recoveryDigest,
        }
      : context.externalReview,
    review: context.review
      ? {
          ...context.review,
          changedFilesDigest: recoveryDigest,
        }
      : context.review,
    exactHeadEvidence: overrides.exactHeadEvidence ?? {
      headSha: "head123",
      changedFiles,
      changedFilesDigest: recoveryDigest,
      validationPassed: true,
      validationResults: [{ command: "npm run validate:docs", status: 0 }],
      validationCompletedAt: "2026-07-12T00:00:00.000Z",
      geminiPass: true,
      geminiHeadSha: "head123",
      geminiChangedFiles: changedFiles,
      geminiChangedFilesDigest: recoveryDigest,
      geminiTier: "cheap_independent",
      geminiProvider: "gemini",
      geminiCompletedAt: "2026-07-12T00:00:00.000Z",
      geminiBudget: { status: "pass" },
      codexMechanicsApproved: true,
      codexMechanicsHeadSha: "head123",
      codexMechanicsChangedFiles: changedFiles,
      codexMechanicsChangedFilesDigest: recoveryDigest,
      codexMechanicsCompletedAt: "2026-07-12T00:00:00.000Z",
    },
  };
}

function createAutoMergeRunner(calls) {
  return (command, args) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (command === "gh" && args[0] === "pr" && args[1] === "merge") return ok("");
    if (command === "gh" && args[0] === "pr" && args[1] === "view" && args.includes("--json") && String(args[args.indexOf("--json") + 1] || "").includes("mergeCommit")) {
      return ok(JSON.stringify({
        number: 1,
        state: "MERGED",
        baseRefName: "main",
        headRefOid: "head123",
        mergeCommit: { oid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        mergedAt: "2026-07-18T00:00:00Z",
        headRepository: { id: "repo-1", name: "Settleora", nameWithOwner: "tommytang213/Settleora" },
        headRepositoryOwner: { login: "tommytang213" },
        isCrossRepository: false,
      }));
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "view" && args.includes("--json")) {
      return ok(JSON.stringify({
        number: 1,
        url: "https://example.invalid/pull/1",
        state: "OPEN",
        isDraft: false,
        baseRefName: "main",
        headRefName: "feature/auto-1-test",
        headRefOid: "head123",
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        title: "Auto-runner: #1 Low risk auto merge",
        body: "Closes or updates #1.",
        statusCheckRollup: autoMergeRequiredChecks(),
        comments: [],
        reviews: [],
      }));
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "view") return ok("merge123\n");
    if (command === "gh" && args[0] === "api" && args[1] === "graphql") {
      return ok(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }));
    }
    if (command === "gh" && args[0] === "api" && String(args[1]).includes("code-scanning/alerts")) return ok("[]");
    if (command === "git" && args[0] === "ls-remote") return ok("head123\trefs/heads/feature/auto-1-test\n");
    if (command === "git" && args[0] === "rev-parse") return ok("base123\n");
    if (command === "gh" && args[0] === "issue" && args[1] === "view") {
      return ok(JSON.stringify({ labels: [{ name: "workflow" }, { name: "auto-running" }, { name: "auto-claimed" }] }));
    }
    if (command === "gh" && args[0] === "issue" && args[1] === "edit") return ok("");
    if (command === "gh" && args[0] === "issue" && args[1] === "close") return ok("");
    if (command === "gh" && args[0] === "pr" && args[1] === "comment") return ok("");
    if (command === "gh" && args[0] === "issue" && args[1] === "comment") return ok("");
    return fail(`unexpected ${command} ${args.join(" ")}`);
  };
}

function mergeReadbackRunner(calls, { repositorySlug, readbackOverrides = {} } = {}) {
  return (command, args) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (command === "gh" && args[0] === "pr" && args[1] === "merge") return ok("");
    if (command === "gh" && args[0] === "pr" && args[1] === "view") {
      return ok(JSON.stringify({
        number: 1,
        state: "MERGED",
        baseRefName: "main",
        headRefOid: "head123",
        mergeCommit: { oid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        mergedAt: "2026-07-18T00:00:00Z",
        headRepository: { id: "repo-1", name: repositorySlug.split("/")[1], nameWithOwner: repositorySlug },
        headRepositoryOwner: { login: repositorySlug.split("/")[0] },
        isCrossRepository: false,
        ...readbackOverrides,
      }));
    }
    if (command === "git" && args[0] === "ls-remote") return ok("head123\trefs/heads/feature/auto-1-test\n");
    if (command === "git" && args[0] === "rev-parse") return ok("base123\n");
    if (command === "gh" && args[0] === "issue" && args[1] === "view") return ok(JSON.stringify({ labels: [] }));
    if (command === "gh" && args[0] === "issue" && args[1] === "edit") return ok("");
    if (command === "gh" && args[0] === "issue" && args[1] === "close") return ok("");
    if (command === "gh" && args[0] === "pr" && args[1] === "comment") return ok("");
    if (command === "gh" && args[0] === "issue" && args[1] === "comment") return ok("");
    return fail(`unexpected ${command} ${args.join(" ")}`);
  };
}

function mergeReadbackJson(repositorySlug, overrides = {}) {
  return JSON.stringify({
    number: 1,
    state: "MERGED",
    baseRefName: "main",
    headRefOid: "head123",
    mergeCommit: { oid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    mergedAt: "2026-07-18T00:00:00Z",
    headRepository: { id: "repo-1", name: repositorySlug.split("/")[1], nameWithOwner: repositorySlug },
    headRepositoryOwner: { login: repositorySlug.split("/")[0] },
    isCrossRepository: false,
    ...overrides,
  });
}

function preMergePrJson(overrides = {}) {
  return JSON.stringify({
    number: 1,
    url: "https://example.invalid/pull/1",
    state: "OPEN",
    isDraft: false,
    baseRefName: "main",
    headRefName: "feature/auto-1-test",
    headRefOid: "head123",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    title: "Auto-runner: #1 Low risk auto merge",
    body: "Closes or updates #1.",
    statusCheckRollup: autoMergeRequiredChecks(),
    comments: [],
    reviews: [],
    ...overrides,
  });
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
    repositorySlug: "tommytang213/Settleora",
    logsRoot,
    codexCommand: "codex-vm-full",
    trustedRealRunApproved: false,
    trustedRealRunCanaryApproved: false,
    lowRiskAutoMergeCanaryApproved: false,
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

function selectionConfig(overrides = {}) {
  return {
    ...baseConfig,
    eligibleLabels: ["auto-canary-ready"],
    pollLimit: 10,
    ...overrides,
  };
}

function productionRuntimeEvidence() {
  return {
    runtimeMode: "external",
    runtimeRoot: "/workspace/auto-runner/runtime",
    repoRoot: "/workspace/repos/Settleora",
    logsRoot: "/workspace/logs/auto-runner/Settleora",
    projectId: "Settleora",
    repositorySlug: "tommytang213/Settleora",
    runtimeBundleDigest: "a".repeat(64),
    runtimeIdentity: Object.freeze({
      version: 1,
      projectId: "Settleora",
      repositorySlug: "tommytang213/settleora",
      runtimeRoot: "/workspace/auto-runner/runtime",
      repoRoot: "/workspace/repos/Settleora",
      logsRoot: "/workspace/logs/auto-runner/Settleora",
      namespace: "b".repeat(64),
    }),
    runtimeManifest: Object.freeze({ bundleDigest: "a".repeat(64), sourceSha: "c".repeat(40) }),
  };
}

function selectionIssue(number, title = `Issue ${number}`, overrides = {}) {
  return {
    number,
    title,
    state: "OPEN",
    labels: ["auto-canary-ready", "workflow"],
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["tools/auto-runner/README.md"],
      validationProfile: "docs-only",
      manualMergeRequired: false,
      autoMergeEligible: true,
      requiredReading: ["PROGRAM_ARCHITECTURE.md"],
    }),
    url: `https://example.invalid/issues/${number}`,
    createdAt: `2026-07-10T20:${String(number % 60).padStart(2, "0")}:00Z`,
    ...overrides,
  };
}

function liveIssueReader(issuesByNumber) {
  return (issueNumber) => {
    const issue = issuesByNumber[issueNumber] || issuesByNumber[String(issueNumber)];
    if (!issue) return { ok: false, reason: "missing_fixture_live_issue" };
    return { ok: true, issue };
  };
}

function approvedLowRiskAutoMergeCanaryConfig() {
  return {
    canary: true,
    dryRun: false,
    run: true,
    configPath: "/workspace/logs/settleora-auto-runner/local-low-risk-canary.json",
    trustedRealRunApproved: false,
    trustedRealRunCanaryApproved: true,
    trustedRealRunCanaryMaxIterations: 2,
    lowRiskAutoMergeCanaryApproved: true,
    allowAutoMerge: true,
    autoMergePolicy: {
      approvedLanes: ["workflow-docs-tooling", "docs-planning", "client-ui-low-risk"],
    },
    allowFollowupIssueCreation: false,
    allowStaleClaimSteal: false,
    allowReviewFixMutation: false,
    maxReviewFixCycles: 0,
    allowSystemdEnablement: false,
    maxIterations: 2,
    requestedMaxIterations: 2,
  };
}

function fixtureConfig(logsRoot, overrides = {}) {
  mkdirSync(path.join(logsRoot, "review-fix"), { recursive: true });
  const raw = {
    ...readinessConfig(logsRoot),
    repoRoot: process.cwd(),
    run: true,
    dryRun: false,
    canary: true,
    configPath: "/workspace/logs/settleora-auto-runner/local-fixture.json",
    trustedRealRunCanaryApproved: true,
    trustedRealRunApproved: false,
    lowRiskAutoMergeCanaryApproved: true,
    allowAutoMerge: true,
    allowReviewFixMutation: true,
    maxReviewFixCycles: 1,
    reviewFixMutation: {
      enabled: true,
      maxAttempts: 1,
      requestedMaxAttempts: 1,
      maxAllowedAttempts: 1,
    },
    reviewFixCanaryFixture: {
      enabled: true,
      marker: "review-fix-cycle: completed",
      markerId: "review-fix-cycle-completed",
    },
    ...overrides,
  };
  raw.reviewFixMutation = normalizeReviewFixMutationConfig(raw);
  raw.reviewFixCanaryFixture = normalizeReviewFixCanaryFixtureConfig(raw);
  return raw;
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
        model: "gemini-3.5-flash",
        inputUsdPerMillionTokens: 1.5,
        outputUsdPerMillionTokens: 9,
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
        defaultModel: "gemini-3.5-flash",
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

function geminiIntegratedConfig(logsRoot, overrides = {}) {
  return geminiSmokeConfig(logsRoot, {
    reviewerSmokeTest: { tier: "cheap_independent", maxEstimatedCostUsd: 0.05 },
    ...overrides,
    reviewerTiers: {
      cheap_independent: {
        enabled: true,
        provider: "gemini",
        providerProfile: "gemini-cheap",
        command: null,
        model: "gemini-2.5-flash-lite",
        inputUsdPerMillionTokens: 0.1,
        outputUsdPerMillionTokens: 0.4,
        ...(overrides.reviewerTiers?.cheap_independent || {}),
      },
      strong_independent: {
        enabled: true,
        provider: "gemini",
        providerProfile: "gemini-strong",
        command: null,
        model: "gemini-3.5-flash",
        inputUsdPerMillionTokens: 1.5,
        outputUsdPerMillionTokens: 9,
        ...(overrides.reviewerTiers?.strong_independent || {}),
      },
      tie_breaker: {
        enabled: false,
        provider: null,
        providerProfile: "unconfigured-tie-breaker",
        command: null,
        model: null,
        inputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
        ...(overrides.reviewerTiers?.tie_breaker || {}),
      },
      codex_mechanics: {
        enabled: true,
        provider: "codex",
        providerProfile: "codex-mechanics-default",
        command: "codex-vm-full",
        model: "codex-subscription",
        inputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
        ...(overrides.reviewerTiers?.codex_mechanics || {}),
      },
    },
  });
}

function workflowReviewPackage(overrides = {}) {
  const changedFiles = overrides.changedFiles || ["tools/auto-runner/lib/gemini-reviewer.mjs"];
  const laneDecision = overrides.laneDecision || {
    lane: "workflow-docs-tooling",
    allowedToImplement: true,
    dangerGate: false,
    allowedPaths: ["tools/auto-runner/**", "docs/workflow/**"],
    laneManifestAllowedPaths: ["tools/auto-runner/**", "docs/workflow/**", "scripts/ai/**"],
    validationProfile: "runner-tests",
    manualMergeRequired: true,
    autoMergeEligible: false,
    prCreationAllowed: true,
  };
  const diff =
    overrides.diff ||
    "diff --git a/tools/auto-runner/lib/gemini-reviewer.mjs b/tools/auto-runner/lib/gemini-reviewer.mjs\nindex 1111111..2222222 100644\n--- a/tools/auto-runner/lib/gemini-reviewer.mjs\n+++ b/tools/auto-runner/lib/gemini-reviewer.mjs\n@@ -1,0 +1,1 @@\n+const ok = true;\n";
  return {
    packagePath: "/workspace/logs/settleora-auto-runner/reviews/test-package.json",
    summary: {
      issue: {
        number: 800,
        title: "Auto-runner integrated Gemini review",
        labels: ["auto-ready"],
        url: "https://example.invalid/issues/800",
      },
      laneDecision,
      changedFiles,
      validation: { passed: true, results: [{ command: "node --test tools/auto-runner/test/*.test.mjs", status: 0 }] },
      report: { found: true, expectedPath: ".codex/reports/test.md" },
      diffTruncated: false,
      ...(overrides.summary || {}),
    },
    diff,
  };
}

function integratedVerdictJson(overrides = {}) {
  return JSON.stringify({
    verdict: "pass",
    confidence: "high",
    summary: "Scoped low-risk workflow tooling change is ready for PR creation.",
    findings: [],
    ...overrides,
  });
}

function fakeGeminiResponse(body, status = 200) {
  const normalizedBody = normalizeFakeGeminiBody(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(normalizedBody);
    },
  };
}

function normalizeFakeGeminiBody(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.candidates)) return body;
  return {
    ...body,
    candidates: body.candidates.map((candidate) => (
      candidate && typeof candidate === "object" && !Object.hasOwn(candidate, "finishReason")
        ? { finishReason: "STOP", ...candidate }
        : candidate
    )),
  };
}

function fakeGeminiStreamResponse(text, status = 200) {
  const bytes = new TextEncoder().encode(String(text || ""));
  let offset = 0;
  let cancelled = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    get cancelled() {
      return cancelled;
    },
    body: {
      getReader() {
        return {
          async read() {
            if (cancelled || offset >= bytes.byteLength) return { done: true };
            const end = Math.min(offset + 4096, bytes.byteLength);
            const value = bytes.subarray(offset, end);
            offset = end;
            return { done: false, value };
          },
          async cancel() {
            cancelled = true;
          },
        };
      },
    },
    async text() {
      throw new Error("unbounded response.text() should not be used for stream responses");
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
  const issueStates = overrides.issueStates || {};
  const runner = (command, args) => {
    commands.push(`${command} ${args.join(" ")}`);
    if (command === "git" && args[0] === "ls-remote") return ok("2d1cbe475bf15ed2dc481d1e29b8cfc0a8c54dd3\trefs/heads/main\n");
    if (command === "git" && args[0] === "merge-base") return ok("");
    if (command === "gh" && args[0] === "--version") return ok("gh version 2.0.0\n");
    if (command === "gh" && args[0] === "auth") return ok("Logged in to github.com\n");
    if (command === "gh" && args[0] === "repo") return ok(`${overrides.repositorySlug || "tommytang213/Settleora"}\n`);
    if (command === "gh" && args[0] === "issue" && args[1] === "view") {
      const number = Number(args[2]);
      const state = issueStates[number] || (number === 800 || number === 805 ? "CLOSED" : "OPEN");
      return ok(
        JSON.stringify({
          number,
          state,
          title: number === 805 ? "Auto-runner canary" : "Auto-runner foundation",
          url: `https://example.invalid/issues/${number}`,
        }),
      );
    }
    if (command === "gh" && args[0] === "issue" && args[1] === "list") {
      if (overrides.failIssueList) return fail("GitHub API unavailable");
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

function clientUiIssue(title, scope, contractOverrides = {}) {
  return {
    title,
    body: `${contractBody({
      lane: "client-ui-low-risk",
      allowedPaths: [
        "apps/mobile/lib/ui/settleora_components.dart",
        "apps/mobile/test/ui/settleora_component_guardrail_test.dart",
      ],
      validationProfile: "mobile-ui-low-risk",
      manualMergeRequired: false,
      autoMergeEligible: true,
      requiredReading: [
        "PROGRAM_ARCHITECTURE.md",
        "README.md",
        "docs/workflow/CODEX_TASK_GUIDE.md",
        "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
        "tools/auto-runner/README.md",
        "apps/mobile/lib/ui/settleora_components.dart",
        "apps/mobile/test/ui/settleora_component_guardrail_test.dart",
      ],
      ...contractOverrides,
    })}

## Scope

${scope}
`,
    labels: ["auto-canary-ready", "canary", "workflow"],
  };
}

function issue852Fixture() {
  return JSON.parse(readFileSync("tools/auto-runner/test/fixtures/issue-852-moneytext.json", "utf8"))[0];
}

function issue818StyleBody() {
  return `${contractBody({
    allowedPaths: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md"],
    validationProfile: "docs-only",
    requiredReading: [
      "PROGRAM_ARCHITECTURE.md",
      "README.md",
      "docs/workflow/CODEX_TASK_GUIDE.md",
      "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
      "docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md",
      "docs/planning/ISSUE_PROGRESS_LEDGER.md",
      "tools/auto-runner/README.md",
    ],
  })}

## Lane

\`workflow-docs-tooling\`.

## Scope

Docs/workflow canary only. Add one short non-sensitive checkpoint entry to \`docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md\`.

## Allowed paths

- \`docs/workflow/AUTONOMOUS_CODEX_RUNNER_CANARY.md\`

## Non-goals

- no product runtime;
- no API behavior;
- no auth/session/security runtime;
- no storage/privacy/authz runtime;
- no money/settlement/bill/payment calculation;
- no schema/migration;
- no OpenAPI/generated-client changes;
- no Docker/CI/deployment/env/secret changes;
- no production/mobile/public/admin exposure;
- no auto-merge.

## Validation required

- \`git diff --check\`
- \`npm run validate:docs\`
- \`npm run validate:scaffold\`
`;
}

function reviewVerdictJson(overrides = {}) {
  return JSON.stringify({
    verdict: "approve",
    reviewed_base_sha: "e".repeat(40),
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

function reviewFixLaneDecision({ allowedPaths }) {
  return {
    lane: "workflow-docs-tooling",
    allowedToImplement: true,
    manualGate: false,
    dangerGate: false,
    dangerReasons: [],
    contract: {
      contractVersion: 1,
      lane: "workflow-docs-tooling",
      allowedPaths,
      validationProfile: "workflow-tooling",
      manualMergeRequired: false,
      autoMergeEligible: true,
      requiredReading: ["PROGRAM_ARCHITECTURE.md"],
    },
    allowedPaths,
    laneManifestAllowedPaths: ["tools/auto-runner/**", "docs/workflow/**", "scripts/ai/**"],
    validationProfile: "workflow-tooling",
    manualMergeRequired: false,
    autoMergeEligible: true,
    prCreationAllowed: true,
    followupIssueCreationAllowed: false,
    reviewFixMutationAllowed: false,
  };
}

function setupCleanRunnerLaunchRepo(repoRoot) {
  mkdirSync(repoRoot, { recursive: true });
  runTempGit(repoRoot, ["init", "-b", "feature/auto-913-test"]);
  runTempGit(repoRoot, ["config", "user.email", "codex@example.invalid"]);
  runTempGit(repoRoot, ["config", "user.name", "Codex Test"]);
  writeFileSync(path.join(repoRoot, "README.md"), "temporary runner launch repo\n");
  runTempGit(repoRoot, ["add", "README.md"]);
  runTempGit(repoRoot, ["commit", "-m", "base"]);
  const head = runTempGit(repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
  runTempGit(repoRoot, ["update-ref", "refs/remotes/origin/main", head]);
}

function cliRecoveryState(overrides = {}) {
  return createInitialRecoveryState({
    taskKey: "20260715-1957",
    issue: { number: 913, title: "Bounded outage resubmission", url: "https://example.invalid/913" },
    runId: "run-2026-07-15T120000Z",
    supervisorRunId: "supervised-20260715T120000Z-abcdefabcdef",
    branchName: "feature/auto-913-bounded-outage-resubmission-20260715-0013",
    baseSha: "b".repeat(40),
    currentHeadSha: "c".repeat(40),
    pr: {
      number: 917,
      url: "https://example.invalid/pull/917",
      headSha: "c".repeat(40),
      headRefName: "feature/auto-913-bounded-outage-resubmission-20260715-0013",
      baseRefName: "main",
      state: "OPEN",
    },
    outageResubmission: cliOutageBinding(),
    ...overrides,
  });
}

function targetForCliRecovery(recoveryState) {
  return {
    taskKey: recoveryState.taskKey,
    issueNumber: recoveryState.issue.number,
    branchName: recoveryState.branch.name,
    baseSha: recoveryState.branch.baseSha,
    currentHeadSha: recoveryState.branch.currentHeadSha,
    prNumber: recoveryState.pr.number,
    prHeadSha: recoveryState.pr.headSha,
    runnerRunId: recoveryState.run.runId,
    supervisorRunId: recoveryState.run.supervisorRunId,
    originalSupervisorSpecDigest: recoveryState.outageResubmission?.originalSupervisorSpecDigest,
    markerKey: recoveryState.outageResubmission?.markerKey,
    outageFingerprint: recoveryState.outageResubmission?.outageFingerprint,
    attemptNumber: recoveryState.outageResubmission?.attemptNumber,
  };
}

function outageRecoveryCliArgs(target) {
  const args = [
    "--run",
    "--supervisor-run-id",
    "supervised-20260715T120000Z-000000000917",
    "--outage-recovery-only",
    "--outage-target-task-key",
    target.taskKey,
    "--outage-target-issue",
    String(target.issueNumber),
    "--outage-target-branch",
    target.branchName,
    "--outage-target-base-sha",
    target.baseSha,
    "--outage-target-head-sha",
    target.currentHeadSha,
    "--outage-target-runner-run-id",
    target.runnerRunId,
    "--outage-target-supervisor-run-id",
    target.supervisorRunId,
    "--outage-target-original-spec-digest",
    target.originalSupervisorSpecDigest,
    "--outage-target-marker-key",
    target.markerKey,
    "--outage-target-fingerprint",
    target.outageFingerprint,
    "--outage-target-attempt",
    String(target.attemptNumber),
  ];
  if (Object.hasOwn(target, "prNumber")) {
    args.splice(args.indexOf("--outage-target-runner-run-id"), 0, "--outage-target-pr", String(target.prNumber));
  }
  if (Object.hasOwn(target, "prHeadSha")) {
    args.splice(args.indexOf("--outage-target-runner-run-id"), 0, "--outage-target-pr-head-sha", target.prHeadSha);
  }
  return args;
}

function cliOutageBinding(overrides = {}) {
  return {
    taskKey: "20260715-1957",
    issueNumber: 913,
    branchName: "feature/auto-913-bounded-outage-resubmission-20260715-0013",
    baseSha: "b".repeat(40),
    currentHeadSha: "c".repeat(40),
    prNumber: 917,
    prHeadSha: "c".repeat(40),
    runnerRunId: "run-2026-07-15T120000Z",
    supervisorRunId: "supervised-20260715T120000Z-abcdefabcdef",
    originalSupervisorSpecDigest: "d".repeat(64),
    markerKey: "e".repeat(64),
    outageFingerprint: "f".repeat(64),
    attemptNumber: 1,
    ...overrides,
  };
}

function spawnOutageRecoveryOnly(configPath, cwd, target, options = {}) {
  const args = [
    path.join(process.cwd(), "tools/auto-runner/settleora-auto-runner.mjs"),
    "--run",
    "--config",
    configPath,
    "--supervisor-run-id",
    "supervised-20260715T120000Z-000000000917",
    "--outage-recovery-only",
    "--outage-target-task-key",
    target.taskKey,
    "--outage-target-issue",
    String(target.issueNumber),
    "--outage-target-branch",
    target.branchName,
    "--outage-target-base-sha",
    target.baseSha,
    "--outage-target-head-sha",
    target.currentHeadSha,
    "--outage-target-runner-run-id",
    target.runnerRunId,
    "--outage-target-supervisor-run-id",
    target.supervisorRunId,
    "--outage-target-original-spec-digest",
    target.originalSupervisorSpecDigest,
    "--outage-target-marker-key",
    target.markerKey,
    "--outage-target-fingerprint",
    target.outageFingerprint,
    "--outage-target-attempt",
    String(target.attemptNumber),
  ];
  if (Object.hasOwn(target, "prNumber")) {
    args.splice(args.indexOf("--outage-target-runner-run-id"), 0, "--outage-target-pr", String(target.prNumber));
  }
  if (Object.hasOwn(target, "prHeadSha")) {
    args.splice(args.indexOf("--outage-target-runner-run-id"), 0, "--outage-target-pr-head-sha", target.prHeadSha);
  }
  return spawnSync(
    process.execPath,
    args,
    { cwd, encoding: "utf8", ...options },
  );
}

function readOnlyRunSummary(logsRoot) {
  const summaryDir = path.join(logsRoot, "summaries");
  const files = readdirSync(summaryDir).filter((name) => /^run-.*\.json$/.test(name));
  assert.equal(files.length, 1);
  return JSON.parse(readFileSync(path.join(summaryDir, files[0]), "utf8"));
}

function snapshotFiles(root) {
  if (!existsSync(root)) return {};
  return Object.fromEntries(
    readdirSync(root)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => [name, readFileSync(path.join(root, name), "utf8")]),
  );
}

function runTempGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}
