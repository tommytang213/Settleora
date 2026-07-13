import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { laneManifest } from "./lane-policy.mjs";
import { defaultReviewerBudget, defaultReviewerTiers, mergeReviewerPolicyConfig } from "./reviewer-policy.mjs";
import { normalizeReviewFixMutationConfig } from "./review-fix-policy.mjs";
import { normalizeReviewFixCanaryFixtureConfig } from "./review-fix-fixture.mjs";
import { validateSupervisorRunId } from "./run-correlation.mjs";

export const defaultLogsRoot = "/workspace/logs/settleora-auto-runner";
const mandatoryAutoMergeChecks = Object.freeze(["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"]);

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
  autoMergePolicy: {
    approvedLanes: [],
    requiredChecks: [
      "Validate scaffold",
      "CodeQL",
      "Semgrep CE scan",
      "Trivy repository scan",
    ],
    allowedSkippedChecks: [],
    allowedNeutralChecks: [],
  },
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

export function parseDurationExtension(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("+")) {
    throw new Error("Runtime extension must use explicit + duration, for example +12h");
  }
  const durationMs = parseDuration(raw.slice(1));
  if (durationMs < 60 * 1000 || durationMs > 14 * 24 * 60 * 60 * 1000) {
    throw new Error("Runtime extension must be between +1m and +14d");
  }
  return durationMs;
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
    status: false,
    listRuns: false,
    listEvents: false,
    json: false,
    eventRunId: null,
    controlCommand: null,
    maxIterationsExtension: null,
    maxRuntimeExtensionMs: null,
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
    supervisorRunId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--run") {
      if (args.listEvents && argv[index + 1] && !argv[index + 1].startsWith("--")) {
        args.eventRunId = readValue(argv, ++index, arg);
      } else {
        args.run = true;
      }
    }
    else if (arg === "--canary" || arg === "--trusted-real-run-canary") args.canary = true;
    else if (arg === "--preflight") args.preflight = true;
    else if (arg === "--readiness" || arg === "--overnight-readiness") {
      args.preflight = true;
      args.readiness = true;
    }
    else if (arg === "--reviewer-smoke-test") args.reviewerSmokeTest = true;
    else if (arg === "--live-external-reviewer-calls") args.liveExternalReviewerCalls = true;
    else if (arg === "--status") args.status = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--list-runs") args.listRuns = true;
    else if (arg === "--list-events") args.listEvents = true;
    else if (arg === "--run-id") args.eventRunId = readValue(argv, ++index, arg);
    else if (arg === "--stop-after-current") args.controlCommand = "stop-after-current";
    else if (arg === "--pause") args.controlCommand = "pause";
    else if (arg === "--extend") args.controlCommand = "extend";
    else if (arg === "--once") args.once = true;
    else if (arg === "--require-pre-pr-review") args.requirePrePrReview = true;
    else if (arg === "--write-summary") args.writeSummary = true;
    else if (arg === "--review-package") args.reviewPackage = readValue(argv, ++index, arg);
    else if (arg === "--config") args.configPath = readValue(argv, ++index, arg);
    else if (arg === "--fixture-issues") args.fixtureIssuesPath = readValue(argv, ++index, arg);
    else if (arg === "--supervisor-run-id") args.supervisorRunId = validateSupervisorRunId(readValue(argv, ++index, arg));
    else if (arg === "--reviewer-smoke-tier") args.reviewerSmokeTier = readValue(argv, ++index, arg);
    else if (arg === "--since") args.sinceMs = parseDuration(readValue(argv, ++index, arg));
    else if (arg === "--max-runtime") {
      const value = readValue(argv, ++index, arg);
      if (args.controlCommand === "extend") {
        args.maxRuntimeExtensionMs = parseDurationExtension(value);
      } else {
        args.maxRuntimeMs = parseDuration(value);
      }
    }
    else if (arg === "--max-iterations" || arg === "--max-prs") {
      const raw = readValue(argv, ++index, arg);
      if (args.controlCommand === "extend") {
        if (!/^\+\d+$/.test(raw)) {
          throw new Error("Iteration/PR budget extension must use explicit +N syntax");
        }
        const value = Number.parseInt(raw.slice(1), 10);
        if (!Number.isSafeInteger(value) || value < 1 || value > 500) {
          throw new Error("Iteration/PR budget extension must be between +1 and +500");
        }
        args.maxIterationsExtension = value;
      } else {
        const value = Number.parseInt(raw, 10);
        if (!Number.isInteger(value) || value < 1) {
          throw new Error(`${arg} must be a positive integer`);
        }
        args.maxIterations = value;
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const controlMode = args.status || args.listRuns || args.listEvents || Boolean(args.controlCommand);
  const specialMode = args.writeSummary || Boolean(args.reviewPackage) || args.preflight || args.reviewerSmokeTest || controlMode;
  if (!specialMode && args.dryRun === args.run) {
    throw new Error("Pass exactly one of --dry-run or --run");
  }
  if ((args.writeSummary || args.reviewPackage || controlMode) && (args.dryRun || (args.run && !args.listEvents) || args.preflight || args.canary || args.reviewerSmokeTest)) {
    throw new Error("Special modes do not take --dry-run, --run, --canary, --preflight, or --reviewer-smoke-test");
  }
  if (args.supervisorRunId && (!args.run || args.dryRun || specialMode)) {
    throw new Error("--supervisor-run-id is only valid with a normal real --run");
  }
  if (args.preflight && (args.dryRun || args.run)) {
    throw new Error("--preflight runs as its own non-mutating mode; do not pass --dry-run or --run");
  }
  if (args.reviewerSmokeTest && (args.dryRun || args.run || args.preflight || args.canary)) {
    throw new Error("--reviewer-smoke-test runs as its own non-mutating mode; do not pass --dry-run, --run, --canary, or --preflight");
  }
  if (args.liveExternalReviewerCalls && !args.reviewerSmokeTest && !args.reviewPackage) {
    throw new Error("--live-external-reviewer-calls is only valid with --reviewer-smoke-test or --review-package");
  }
  if (args.fixtureIssuesPath && !args.dryRun) {
    throw new Error("--fixture-issues is dry-run only; pass --dry-run");
  }
  if (args.fixtureIssuesPath && (args.writeSummary || args.reviewPackage || args.preflight)) {
    throw new Error("--fixture-issues can only be used with the normal dry-run loop");
  }
  if (args.json && !(args.status || args.listRuns || args.listEvents)) {
    throw new Error("--json is only valid with --status, --list-runs, or --list-events");
  }
  if (args.listEvents && !args.eventRunId) {
    throw new Error("--list-events requires --run-id <run-id> or --list-events --run <run-id>");
  }
  if (args.controlCommand === "extend" && !args.maxIterationsExtension && !args.maxRuntimeExtensionMs) {
    throw new Error("--extend requires --max-iterations +N or --max-runtime +12h");
  }
  if (args.controlCommand && (args.maxIterations !== null || args.maxRuntimeMs !== null)) {
    throw new Error("Control commands accept only extension-form budget arguments");
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
    supervisorRunId: cliArgs.supervisorRunId || null,
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
  config.reviewerProviderProfiles = normalizeReviewerProviderProfiles(config.reviewerProviderProfiles);
  config.autoMergePolicy = normalizeAutoMergePolicy(config.autoMergePolicy);
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
    path.join(config.logsRoot, "recovery"),
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

export function normalizeAutoMergePolicy(policy = {}) {
  const approvedLanes = policy.approvedLanes ?? [];
  if (!Array.isArray(approvedLanes)) {
    throw new Error("autoMergePolicy.approvedLanes must be an array");
  }
  if (approvedLanes.length > 64) {
    throw new Error("autoMergePolicy.approvedLanes exceeds the bounded lane limit");
  }
  const normalizedApproved = [];
  const seen = new Set();
  for (const laneId of approvedLanes) {
    if (typeof laneId !== "string" || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(laneId)) {
      throw new Error(`Invalid auto-merge lane id: ${laneId}`);
    }
    if (seen.has(laneId)) {
      throw new Error(`Duplicate auto-merge lane id: ${laneId}`);
    }
    seen.add(laneId);
    const lane = laneManifest[laneId];
    if (!lane) {
      throw new Error(`Unknown auto-merge lane id: ${laneId}`);
    }
    if (lane.aliasFor) {
      throw new Error(`Auto-merge approved lanes must use canonical lane ids, not alias ${laneId}`);
    }
    if (
      lane.decisionType !== "runnable" ||
      !lane.implementationAllowed ||
      lane.manualGateBeforeImplementation ||
      lane.branchStrategy === "split-required" ||
      !lane.autoMergeAllowed
    ) {
      throw new Error(`Lane is not eligible for approved-domain auto-merge config: ${laneId}`);
    }
    normalizedApproved.push(laneId);
  }

  const configuredRequiredChecks = normalizeStringList(policy.requiredChecks ?? defaultConfig.autoMergePolicy.requiredChecks, "autoMergePolicy.requiredChecks");
  const requiredChecks = [...new Set([...mandatoryAutoMergeChecks, ...configuredRequiredChecks])];
  if (requiredChecks.length === 0) {
    throw new Error("autoMergePolicy.requiredChecks must not be empty");
  }
  return Object.freeze({
    approvedLanes: Object.freeze(normalizedApproved),
    requiredChecks: Object.freeze(requiredChecks),
    allowedSkippedChecks: Object.freeze(normalizeCheckAllowlist(policy.allowedSkippedChecks ?? [], "autoMergePolicy.allowedSkippedChecks")),
    allowedNeutralChecks: Object.freeze(normalizeCheckAllowlist(policy.allowedNeutralChecks ?? [], "autoMergePolicy.allowedNeutralChecks")),
  });
}

function normalizeStringList(value, fieldName) {
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);
  if (value.length > 128) throw new Error(`${fieldName} exceeds the bounded list limit`);
  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0 || item.length > 160) {
      throw new Error(`${fieldName} contains an invalid entry`);
    }
    const text = item.trim();
    if (seen.has(text)) throw new Error(`${fieldName} contains duplicate entry: ${text}`);
    seen.add(text);
    normalized.push(text);
  }
  return normalized;
}

function normalizeCheckAllowlist(value, fieldName) {
  const normalized = normalizeStringList(value, fieldName);
  for (const item of normalized) {
    if (item.includes(" / ")) {
      throw new Error(`${fieldName} entries must use canonical check names, not workflow-prefixed names`);
    }
  }
  return normalized;
}

function normalizeReviewerProviderProfiles(profiles = {}) {
  const normalized = {};
  for (const [profileId, profile] of Object.entries(profiles || {})) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/.test(profileId)) {
      throw new Error(`Invalid reviewer provider profile id: ${profileId}`);
    }
    if (profile.endpoint || profile.baseUrl || profile.url) {
      throw new Error(`Reviewer provider profile ${profileId} must not configure arbitrary endpoints`);
    }
    if (profile.provider !== "gemini") {
      throw new Error(`Unsupported reviewer provider for profile ${profileId}: ${profile.provider}`);
    }
    normalized[profileId] = {
      provider: "gemini",
      apiKeyEnv: profile.apiKeyEnv || "GEMINI_API_KEY",
      envFilePath: profile.envFilePath || null,
      defaultModel: profile.defaultModel || null,
    };
  }
  return normalized;
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
