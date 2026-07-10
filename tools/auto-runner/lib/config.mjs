import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defaultReviewerBudget, defaultReviewerTiers, mergeReviewerPolicyConfig } from "./reviewer-policy.mjs";
import { normalizeReviewFixMutationConfig } from "./review-fix-policy.mjs";
import { normalizeReviewFixCanaryFixtureConfig } from "./review-fix-fixture.mjs";

export const defaultLogsRoot = "/workspace/logs/settleora-auto-runner";

export const defaultConfig = Object.freeze({
  repoRoot: "/workspace/repos/Settleora",
  logsRoot: defaultLogsRoot,
  eligibleLabels: ["auto-ready", "auto-bundle"],
  stopLabels: [
    "needs-tommy",
    "manual-gate",
    "danger-gate",
    "auto-failed",
    "auto-running",
    "auto-pr-opened",
    "blocked",
  ],
  claimLabels: ["auto-claimed", "auto-running"],
  priorityLabels: ["priority-critical", "priority-high", "priority-ready"],
  maxIterations: 1,
  maxRuntimeMs: null,
  pollLimit: 30,
  trustedRealRunApproved: false,
  trustedRealRunCanaryApproved: false,
  trustedRealRunCanaryMaxIterations: 2,
  lowRiskAutoMergeCanaryApproved: false,
  allowStaleClaimSteal: false,
  staleClaimAfterHours: 12,
  allowAutoMerge: false,
  allowExistingPrRecovery: false,
  autoMergeWait: {
    maxAttempts: 60,
    delayMs: 30000,
  },
  geminiReviewerRetry: {
    maxRetries: 1,
    backoffMs: 2000,
  },
  allowFollowupIssueCreation: false,
  allowReviewFixMutation: false,
  reviewFixCanaryFixture: {
    enabled: false,
    marker: null,
    markerId: null,
  },
  allowSystemdEnablement: false,
  maxFollowupIssuesPerRun: 3,
  maxReviewFixCycles: 0,
  reviewerCommand: "codex-vm-full",
  codexCommand: "codex-vm-full",
  reviewerTiers: defaultReviewerTiers,
  reviewerBudget: defaultReviewerBudget,
  reviewerProviderProfiles: {
    gemini: {
      provider: "gemini",
      apiKeyEnv: "GEMINI_API_KEY",
      envFilePath: null,
      defaultModel: "gemini-2.5-flash-lite",
    },
  },
  reviewerSmokeTest: {
    tier: "cheap_independent",
    maxEstimatedCostUsd: 0.05,
    envFilePath: null,
  },
});

export function parseDuration(value) {
  const match = String(value || "").trim().match(/^(\d+)(m|h|d)?$/i);
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] || "m").toLowerCase();
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  if (unit === "d") return amount * 24 * 60 * 60 * 1000;
  throw new Error(`Invalid duration unit: ${unit}`);
}

export function parseCliArgs(argv) {
  const args = {
    dryRun: false,
    run: false,
    preflight: false,
    readiness: false,
    reviewerSmokeTest: false,
    liveExternalReviewerCalls: false,
    reviewerSmokeTier: null,
    once: false,
    maxIterations: null,
    maxRuntimeMs: null,
    reviewPackage: null,
    writeSummary: false,
    sinceMs: 24 * 60 * 60 * 1000,
    requirePrePrReview: false,
    canary: false,
    configPath: null,
    fixtureIssuesPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--run") args.run = true;
    else if (arg === "--canary" || arg === "--trusted-real-run-canary") args.canary = true;
    else if (arg === "--preflight") args.preflight = true;
    else if (arg === "--readiness" || arg === "--overnight-readiness") {
      args.preflight = true;
      args.readiness = true;
    }
    else if (arg === "--reviewer-smoke-test") args.reviewerSmokeTest = true;
    else if (arg === "--live-external-reviewer-calls") args.liveExternalReviewerCalls = true;
    else if (arg === "--once") args.once = true;
    else if (arg === "--require-pre-pr-review") args.requirePrePrReview = true;
    else if (arg === "--write-summary") args.writeSummary = true;
    else if (arg === "--review-package") args.reviewPackage = readValue(argv, ++index, arg);
    else if (arg === "--config") args.configPath = readValue(argv, ++index, arg);
    else if (arg === "--fixture-issues") args.fixtureIssuesPath = readValue(argv, ++index, arg);
    else if (arg === "--reviewer-smoke-tier") args.reviewerSmokeTier = readValue(argv, ++index, arg);
    else if (arg === "--since") args.sinceMs = parseDuration(readValue(argv, ++index, arg));
    else if (arg === "--max-runtime") args.maxRuntimeMs = parseDuration(readValue(argv, ++index, arg));
    else if (arg === "--max-iterations") {
      const value = Number.parseInt(readValue(argv, ++index, arg), 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--max-iterations must be a positive integer");
      }
      args.maxIterations = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const specialMode = args.writeSummary || Boolean(args.reviewPackage) || args.preflight || args.reviewerSmokeTest;
  if (!specialMode && args.dryRun === args.run) {
    throw new Error("Pass exactly one of --dry-run or --run");
  }
  if ((args.writeSummary || args.reviewPackage) && (args.dryRun || args.run || args.preflight || args.canary || args.reviewerSmokeTest)) {
    throw new Error("--write-summary and --review-package do not take --dry-run, --run, --canary, --preflight, or --reviewer-smoke-test");
  }
  if (args.preflight && (args.dryRun || args.run)) {
    throw new Error("--preflight runs as its own non-mutating mode; do not pass --dry-run or --run");
  }
  if (args.reviewerSmokeTest && (args.dryRun || args.run || args.preflight || args.canary)) {
    throw new Error("--reviewer-smoke-test runs as its own non-mutating mode; do not pass --dry-run, --run, --canary, or --preflight");
  }
  if (args.liveExternalReviewerCalls && !args.reviewerSmokeTest) {
    throw new Error("--live-external-reviewer-calls is only valid with --reviewer-smoke-test");
  }
  if (args.fixtureIssuesPath && !args.dryRun) {
    throw new Error("--fixture-issues is dry-run only; pass --dry-run");
  }
  if (args.fixtureIssuesPath && (args.writeSummary || args.reviewPackage || args.preflight)) {
    throw new Error("--fixture-issues can only be used with the normal dry-run loop");
  }
  if (args.canary && !args.dryRun && !args.run) {
    throw new Error("--canary must be paired with --dry-run or --run");
  }
  if (args.once) {
    args.maxIterations = 1;
  }

  return args;
}

function readValue(argv, index, name) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

export function loadConfig(cliArgs) {
  let fileConfig = {};
  if (cliArgs.configPath) {
    fileConfig = JSON.parse(readFileSync(cliArgs.configPath, "utf8"));
  }
  const config = {
    ...defaultConfig,
    ...fileConfig,
    mode: cliArgs.run ? "run" : "dry-run",
    dryRun: cliArgs.dryRun,
    run: cliArgs.run,
    canary: cliArgs.canary,
    maxIterations: cliArgs.maxIterations || fileConfig.maxIterations || defaultConfig.maxIterations,
    requestedMaxIterations: cliArgs.maxIterations || fileConfig.maxIterations || defaultConfig.maxIterations,
    maxRuntimeMs: cliArgs.maxRuntimeMs ?? fileConfig.maxRuntimeMs ?? defaultConfig.maxRuntimeMs,
    requirePrePrReview: cliArgs.requirePrePrReview,
  };
  if (cliArgs.preflight) {
    config.mode = cliArgs.readiness ? "readiness" : "preflight";
    config.dryRun = true;
    config.run = false;
  }
  if (cliArgs.reviewerSmokeTest) {
    config.mode = "reviewer-smoke-test";
    config.dryRun = true;
    config.run = false;
    config.liveExternalReviewerCalls = Boolean(cliArgs.liveExternalReviewerCalls);
    config.reviewerSmokeTest = {
      ...(config.reviewerSmokeTest || {}),
      tier: cliArgs.reviewerSmokeTier || config.reviewerSmokeTest?.tier || "cheap_independent",
    };
  }
  config.configPath = cliArgs.configPath || null;
  if (config.canary) {
    config.mode = config.run ? "canary-run" : "canary-dry-run";
    config.maxIterations = Math.min(config.maxIterations, config.trustedRealRunCanaryMaxIterations);
  }
  if (cliArgs.fixtureIssuesPath) {
    config.fixtureIssuesPath = cliArgs.fixtureIssuesPath;
    config.fixtureIssues = parseFixtureIssues(cliArgs.fixtureIssuesPath);
    config.fixtureIssueCursor = 0;
  }
  const reviewerPolicy = mergeReviewerPolicyConfig(config);
  config.reviewerTiers = reviewerPolicy.reviewerTiers;
  config.reviewerBudget = reviewerPolicy.reviewerBudget;
  config.reviewFixMutation = normalizeReviewFixMutationConfig(config);
  config.maxReviewFixCycles = config.reviewFixMutation.maxAttempts;
  config.reviewFixCanaryFixture = normalizeReviewFixCanaryFixtureConfig(config);

  for (const dir of [
    config.logsRoot,
    path.join(config.logsRoot, "state"),
    path.join(config.logsRoot, "tasks"),
    path.join(config.logsRoot, "codex-runs"),
    path.join(config.logsRoot, "reports"),
    path.join(config.logsRoot, "reviews"),
    path.join(config.logsRoot, "review-fix"),
    path.join(config.logsRoot, "summaries"),
    path.join(config.logsRoot, "locks"),
    path.join(config.logsRoot, "canary"),
    path.join(config.logsRoot, "auto-merge"),
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  config.canaryEvidenceRoot = path.join(config.logsRoot, "canary");

  const localConfigPath = path.join(config.logsRoot, "runner-config.last.json");
  if (!existsSync(localConfigPath)) {
    writeFileSync(localConfigPath, `${JSON.stringify(config, null, 2)}\n`);
  }
  return config;
}

function parseFixtureIssues(fixtureIssuesPath) {
  const parsed = JSON.parse(readFileSync(fixtureIssuesPath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("--fixture-issues must point to a JSON array of issue objects");
  }
  return parsed.map((issue, index) => {
    if (!Number.isInteger(issue.number) || !issue.title) {
      throw new Error(`Fixture issue at index ${index} must include integer number and title`);
    }
    return {
      body: "",
      labels: [],
      url: `fixture://issue/${issue.number}`,
      createdAt: "1970-01-01T00:00:00Z",
      updatedAt: "1970-01-01T00:00:00Z",
      ...issue,
    };
  });
}
