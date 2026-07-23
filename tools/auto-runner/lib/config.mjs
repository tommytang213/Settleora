import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { laneManifest } from "./lane-policy.mjs";
import { defaultReviewerBudget, defaultReviewerTiers, mergeReviewerPolicyConfig } from "./reviewer-policy.mjs";
import { normalizeLargeBundleReviewApprovalConfig } from "./reviewer-policy.mjs";
import { normalizeReviewFixMutationConfig } from "./review-fix-policy.mjs";
import { normalizeReviewFixCanaryFixtureConfig } from "./review-fix-fixture.mjs";
import { validateRunnerRunId, validateSupervisorRunId } from "./run-correlation.mjs";
import { defaultOutageResubmissionConfig, normalizeOutageResubmissionConfig } from "./outage-resubmission-policy.mjs";
import { defaultContextBudgetPolicy, normalizeContextBudgetPolicy } from "./session-lifecycle.mjs";
import { moduleRuntimeRoot, validateProjectRuntimeIdentity } from "./runtime-identity.mjs";
import { verifyRuntimeBundle } from "./runtime-bundle.mjs";
import { bindTrustedRepositoryContext } from "./git-workspace.mjs";

export const defaultLogsRoot = "/workspace/logs/settleora-auto-runner";
const mandatoryAutoMergeChecks = Object.freeze(["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"]);
const defaultTrustedControlRoot = path.join(defaultLogsRoot, "trusted-control");
const liveStackAcceptanceRootName = "live-stack-acceptance";
const liveStackAcceptanceConfigName = "config.json";
const liveStackCorrelationPattern = /^[0-9]{8}-[0-9]{4}(?:-[a-z0-9][a-z0-9-]{0,48})?$/;
const maxTrustedConfigBytes = 1024 * 1024;
const externalProfileRoot = "/workspace/auto-runner/config";

export const defaultConfig = Object.freeze({
  runtimeMode: "development",
  runtimeRoot: moduleRuntimeRoot(),
  projectId: "Settleora",
  repoRoot: path.resolve(moduleRuntimeRoot(), "../.."),
  logsRoot: defaultLogsRoot,
  repositorySlug: "tommytang213/Settleora",
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
  outageResubmission: defaultOutageResubmissionConfig,
  sessionLifecycle: {
    enabled: false,
    allowRecoveryTakeover: false,
    contextBudget: defaultContextBudgetPolicy,
  },
	  prStackExecution: {
	    enabled: false,
	    allowRun: false,
	    productionProfileActive: false,
	    maxStackSize: 4,
	    statePath: null,
	    protectedPlanAuthorizationPath: null,
    capabilities: {
      existingPrConvergence: false,
      exactHeadReviewRequest: false,
      ciScannerPolling: false,
      exactHeadMerge: false,
      baseRetarget: false,
      readyTransition: false,
      semanticProof: false,
      finalHygiene: false,
      issuePolling: false,
      generatedIssueCreation: false,
      unrelatedPrDiscovery: false,
      systemdSupervisorLaunch: false,
      outageChildLaunch: false,
      canaryMutation: false,
      productionDeploy: false,
      secretAuthConfigMutation: false,
      publicAdminNetworkExposure: false,
      branchDeletion: false,
      forcePushRebaseAmendReset: false,
      directMainPush: false,
      productAuthorityChanges: false,
    },
  },
  autoMergeWait: {
    maxAttempts: 60,
    delayMs: 30000,
  },
  geminiReviewerRetry: {
    maxRetries: 1,
    backoffMs: 2000,
  },
  allowFollowupIssueCreation: false,
  securityFindings: {
    allowSecurityFindingsProductionPhase: false,
    allowSecurityFindingIngestion: false,
    allowSecurityFindingClassification: false,
    allowSecurityFindingProposalPlanning: false,
    allowSecurityFindingIssueCreation: false,
    allowFalsePositiveEvidence: false,
    allowSecurityFindingDisposition: false,
    allowProvenFalsePositiveDisposition: false,
    allowSecurityFindingCompletionHygiene: false,
    dispositionDryRunOnly: true,
    packetTtlMinutes: 60,
    maxDispositionsPerRun: 1,
    allowedDispositionReasons: {
      code_scanning_alert: ["false positive"],
      dependabot_alert: ["inaccurate"],
    },
    requirePostDispositionReconciliation: true,
    dryRunOnly: true,
    persistState: true,
    enabledSourceKinds: [
      "dependabot_alert",
      "dependabot_pr",
      "code_scanning_alert",
    ],
    maxPages: 2,
    perPage: 50,
    maxItems: 100,
    maxRetries: 0,
    timeoutMs: 20000,
    maxStateRecords: 500,
    maxArtifactEntries: 10,
    maxArtifactEntryBytes: 2097152,
    maxProposalsPerRun: 5,
    classificationPolicyVersion: 1,
    reconciliationRequired: true,
    allowPartialPlanning: false,
    allowedRepository: "tommytang213/Settleora",
  },
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
  largeBundleReviewApproval: {
    enabled: false,
    approvals: [],
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

function parseOutageTargetPositiveInteger(raw, optionName) {
  if (!/^[1-9][0-9]*$/.test(String(raw))) {
    throw new Error(`Invalid positive integer for ${optionName}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid positive integer for ${optionName}`);
  }
  return value;
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
    runnerRunId: null,
    expectedConfigSha256: null,
    outageRecoveryOnly: false,
    outageRecoveryTarget: null,
    securityFindingsDryRun: false,
    securityFindingsDispositionDryRun: false,
    runPrStack: false,
    stackPlanPath: null,
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
    else if (arg === "--runner-run-id") args.runnerRunId = validateRunnerRunId(readValue(argv, ++index, arg));
    else if (arg === "--expected-config-sha256") args.expectedConfigSha256 = readValue(argv, ++index, arg);
    else if (arg === "--outage-recovery-only") args.outageRecoveryOnly = true;
    else if (arg === "--outage-target-task-key") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), taskKey: readValue(argv, ++index, arg) };
    else if (arg === "--outage-target-issue") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), issueNumber: parseOutageTargetPositiveInteger(readValue(argv, ++index, arg), arg) };
    else if (arg === "--outage-target-branch") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), branchName: readValue(argv, ++index, arg) };
    else if (arg === "--outage-target-base-sha") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), baseSha: readValue(argv, ++index, arg) };
    else if (arg === "--outage-target-head-sha") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), currentHeadSha: readValue(argv, ++index, arg) };
    else if (arg === "--outage-target-pr") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), prNumber: parseOutageTargetPositiveInteger(readValue(argv, ++index, arg), arg) };
    else if (arg === "--outage-target-pr-head-sha") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), prHeadSha: readValue(argv, ++index, arg) };
    else if (arg === "--outage-target-runner-run-id") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), runnerRunId: readValue(argv, ++index, arg) };
    else if (arg === "--outage-target-supervisor-run-id") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), supervisorRunId: readValue(argv, ++index, arg) };
    else if (arg === "--outage-target-original-spec-digest") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), originalSupervisorSpecDigest: readValue(argv, ++index, arg) };
    else if (arg === "--outage-target-marker-key") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), markerKey: readValue(argv, ++index, arg) };
    else if (arg === "--outage-target-fingerprint") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), outageFingerprint: readValue(argv, ++index, arg) };
    else if (arg === "--outage-target-attempt") args.outageRecoveryTarget = { ...(args.outageRecoveryTarget || {}), attemptNumber: parseOutageTargetPositiveInteger(readValue(argv, ++index, arg), arg) };
    else if (arg === "--security-findings-dry-run") args.securityFindingsDryRun = true;
    else if (arg === "--security-findings-disposition-dry-run") {
      args.securityFindingsDryRun = true;
      args.securityFindingsDispositionDryRun = true;
    }
    else if (arg === "--run-pr-stack") args.runPrStack = true;
    else if (arg === "--stack-plan") args.stackPlanPath = readValue(argv, ++index, arg);
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
  const specialMode = args.writeSummary || Boolean(args.reviewPackage) || args.preflight || args.reviewerSmokeTest || controlMode || args.securityFindingsDryRun || args.runPrStack;
  if (!specialMode && args.dryRun === args.run) {
    throw new Error("Pass exactly one of --dry-run or --run");
  }
  if ((args.writeSummary || args.reviewPackage || controlMode) && (args.dryRun || (args.run && !args.listEvents) || args.preflight || args.canary || args.reviewerSmokeTest)) {
    throw new Error("Special modes do not take --dry-run, --run, --canary, --preflight, or --reviewer-smoke-test");
  }
  if (args.supervisorRunId && (!args.run || args.dryRun || specialMode)) {
    throw new Error("--supervisor-run-id is only valid with a normal real --run");
  }
  if (args.runnerRunId && (!args.supervisorRunId || !args.run || args.dryRun || specialMode)) {
    throw new Error("--runner-run-id is only valid with a supervised normal real --run");
  }
  if (args.expectedConfigSha256 && ((!args.runnerRunId && !args.controlCommand) || !/^[a-f0-9]{64}$/u.test(args.expectedConfigSha256))) {
    throw new Error("--expected-config-sha256 requires a supervised run or control and a SHA-256 digest");
  }
  if (args.outageRecoveryOnly && (!args.run || args.dryRun || specialMode || args.canary || !args.supervisorRunId)) {
    throw new Error("--outage-recovery-only is only valid for supervised non-canary real --run");
  }
  if (!args.outageRecoveryOnly && args.outageRecoveryTarget) {
    throw new Error("--outage-target-* arguments require --outage-recovery-only");
  }
  if (args.outageRecoveryOnly) {
    args.outageRecoveryTarget = normalizeOutageRecoveryCliTarget(args.outageRecoveryTarget || {});
    args.maxIterations = 1;
  }
  if (args.securityFindingsDryRun && (args.dryRun || args.run || args.preflight || args.canary || args.reviewerSmokeTest || args.writeSummary || args.reviewPackage || controlMode)) {
    throw new Error("--security-findings-dry-run runs as its own non-mutating mode");
  }
  if (args.securityFindingsDryRun && !args.configPath) {
    throw new Error("--security-findings-dry-run requires an explicit --config path");
  }
  if (args.runPrStack) {
    if (args.dryRun || args.run || args.preflight || args.canary || args.reviewerSmokeTest || args.writeSummary || args.reviewPackage || controlMode || args.securityFindingsDryRun) {
      throw new Error("--run-pr-stack runs as its own explicit mode and is mutually exclusive with normal runner modes");
    }
    if (!args.configPath) throw new Error("--run-pr-stack requires an explicit --config path");
    if (!args.stackPlanPath) throw new Error("--run-pr-stack requires --stack-plan <absolute-path>");
    if (!path.isAbsolute(args.configPath)) throw new Error("--run-pr-stack requires an absolute --config path");
    if (!path.isAbsolute(args.stackPlanPath)) throw new Error("--run-pr-stack requires an absolute --stack-plan path");
  } else if (args.stackPlanPath) {
    throw new Error("--stack-plan is only valid with --run-pr-stack");
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
  if (args.json && !(args.status || args.listRuns || args.listEvents || args.securityFindingsDryRun)) {
    throw new Error("--json is only valid with --status, --list-runs, --list-events, or --security-findings-dry-run");
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

export function loadConfig(cliArgs, trustedCapabilities = {}) {
  const readOnlyObserver = trustedCapabilities?.readOnlyObserver === true && cliArgs.run !== true && cliArgs.runPrStack !== true;
  let fileConfig = {};
  let configTrustEvidence = null;
  if (cliArgs.configPath) {
    const loaded = readTrustedConfigFile(cliArgs.configPath, {
      runPrStack: cliArgs.runPrStack,
      bootstrapTrustedRoot: trustedCapabilities?.prStackTrustedRoot,
      trustHooks: trustedCapabilities?.configTrustHooks || null,
    });
    fileConfig = loaded.config;
    configTrustEvidence = loaded.evidence;
    if (cliArgs.expectedConfigSha256 && configTrustEvidence.sha256 !== cliArgs.expectedConfigSha256) {
      throw new Error("runner config digest does not match immutable supervisor run spec");
    }
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
    runnerRunId: cliArgs.runnerRunId || null,
    outageRecoveryOnly: Boolean(cliArgs.outageRecoveryOnly),
    outageRecoveryTarget: cliArgs.outageRecoveryTarget || null,
  };
  if (cliArgs.preflight) {
    config.mode = cliArgs.readiness ? "readiness" : "preflight";
    config.dryRun = true;
    config.run = false;
  }
  if (cliArgs.securityFindingsDryRun) {
    config.mode = "security-findings-dry-run";
    config.dryRun = true;
    config.run = false;
    config.securityFindingsDispositionDryRun = Boolean(cliArgs.securityFindingsDispositionDryRun);
  }
  if (cliArgs.runPrStack) {
    config.mode = "pr-stack-run";
    config.dryRun = false;
    config.run = true;
    config.stackPlanPath = cliArgs.stackPlanPath;
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
  config.configTrustEvidence = configTrustEvidence;
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
  config.largeBundleReviewApproval = normalizeLargeBundleReviewApprovalConfig(config.largeBundleReviewApproval);
  config.reviewerProviderProfiles = normalizeReviewerProviderProfiles(config.reviewerProviderProfiles);
  config.autoMergePolicy = normalizeAutoMergePolicy(config.autoMergePolicy);
  config.reviewFixMutation = normalizeReviewFixMutationConfig(config);
  config.maxReviewFixCycles = config.reviewFixMutation.maxAttempts;
  config.reviewFixCanaryFixture = normalizeReviewFixCanaryFixtureConfig(config);
  config.outageResubmission = normalizeOutageResubmissionConfig(config.outageResubmission);
  config.sessionLifecycle = {
    enabled: config.sessionLifecycle?.enabled === true,
    allowRecoveryTakeover: config.sessionLifecycle?.allowRecoveryTakeover === true,
    contextBudget: normalizeContextBudgetPolicy(config.sessionLifecycle?.contextBudget),
  };
  if (config.outageRecoveryOnly) {
    config.outageRecoveryTarget = normalizeOutageRecoveryCliTarget(config.outageRecoveryTarget || {});
    config.maxIterations = 1;
    config.requestedMaxIterations = 1;
  }
  config.prStackExecution = normalizePrStackExecutionConfig(config.prStackExecution);
  if (
    config.outageResubmission.allowBoundedOutageResubmission === true &&
    trustedCapabilities?.outageResubmissionControllerAvailable !== true &&
    !(trustedCapabilities?.outageResubmissionObserverAvailable === true && cliArgs.run !== true)
  ) {
    throw new Error("Bounded outage resubmission requires trusted controller capability.");
  }

  if (config.runtimeMode === "external") {
    config.runtimeIdentity = validateProjectRuntimeIdentity(config, {
      actualRuntimeRoot: moduleRuntimeRoot(),
      trusted: true,
    });
    if (!/^[a-f0-9]{64}$/.test(String(config.runtimeBundleDigest || ""))) {
      throw new Error("external runtime mode requires an explicit runtimeBundleDigest");
    }
    config.runtimeManifest = verifyRuntimeBundle(config.runtimeIdentity.runtimeRoot, config.runtimeBundleDigest);
    verifyProjectNamespaceMarker(config, { create: !readOnlyObserver });
    bindTrustedRepositoryContext(config.runtimeIdentity.repoRoot);
  }

  if (!readOnlyObserver) {
    for (const dir of [
      config.logsRoot,
      path.join(config.logsRoot, "state"),
      path.join(config.logsRoot, "tasks"),
      path.join(config.logsRoot, "codex-runs"),
      path.join(config.logsRoot, "reports"),
      path.join(config.logsRoot, "run-logs"),
      path.join(config.logsRoot, "reviews"),
      path.join(config.logsRoot, "review-fix"),
      path.join(config.logsRoot, "recovery"),
      path.join(config.logsRoot, "summaries"),
      path.join(config.logsRoot, "locks"),
      path.join(config.logsRoot, "canary"),
      path.join(config.logsRoot, "auto-merge"),
      path.join(config.logsRoot, "pr-stacks"),
    ]) {
      if (config.runtimeMode === "external") ensureOperationalDirectory(dir, config.logsRoot);
      else mkdirSync(dir, { recursive: true });
    }
    const lifecycleRoot = path.join(config.logsRoot, "session-lifecycle");
    if (existsSync(lifecycleRoot)) {
      const lifecycleRootInfo = lstatSync(lifecycleRoot);
      if (!lifecycleRootInfo.isDirectory() || lifecycleRootInfo.isSymbolicLink() || (typeof process.getuid === "function" && lifecycleRootInfo.uid !== process.getuid())) throw new Error("Session lifecycle root is untrusted.");
    } else {
      mkdirSync(lifecycleRoot, { recursive: true, mode: 0o700 });
    }
    chmodSync(lifecycleRoot, 0o700);
  }
  config.canaryEvidenceRoot = path.join(config.logsRoot, "canary");
  if (config.runtimeMode !== "external") {
    config.runtimeIdentity = validateProjectRuntimeIdentity(config, {
      actualRuntimeRoot: moduleRuntimeRoot(),
      trusted: false,
    });
  }

  const localConfigPath = path.join(config.logsRoot, "runner-config.last.json");
  if (!readOnlyObserver && !existsSync(localConfigPath)) {
    writeFileSync(localConfigPath, `${JSON.stringify(config, null, 2)}\n`);
  }
  return config;
}

export function ensureOperationalDirectory(directory, logsRoot) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = lstatSync(directory);
  const real = info.isDirectory() && !info.isSymbolicLink() ? realpathSync(directory) : null;
  const relative = real ? path.relative(logsRoot, real) : "..";
  if (!real || relative.startsWith("..") || path.isAbsolute(relative)
      || (typeof process.getuid === "function" && info.uid !== process.getuid())
      || (info.mode & 0o022) !== 0) {
    throw new Error(`Operational logs directory is unsafe: ${path.basename(directory)}`);
  }
  return real;
}

export function verifyProjectNamespaceMarker(config, { create = false } = {}) {
  const markerPath = path.join(config.logsRoot, ".project-namespace.json");
  const expected = {
    version: 1,
    namespace: config.runtimeIdentity.namespace,
    projectId: config.projectId,
    repositorySlug: config.repositorySlug,
    repositoryCommonDirDigest: createHash("sha256").update(config.runtimeIdentity.repositoryCommonDir).digest("hex"),
  };
  if (!existsSync(markerPath)) {
    if (!create) throw new Error("trusted project namespace marker is required");
    writeFileSync(markerPath, `${JSON.stringify(expected)}\n`, { flag: "wx", mode: 0o600 });
  }
  const info = lstatSync(markerPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4096 || (info.mode & 0o077) !== 0
      || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
    throw new Error("trusted project namespace marker is unsafe");
  }
  let actual;
  try {
    actual = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    throw new Error("trusted project namespace marker is invalid");
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("trusted project namespace marker does not match repository identity");
  }
  return expected;
}

function normalizeOutageRecoveryCliTarget(value = {}) {
  const target = {
    taskKey: String(value.taskKey || "").trim(),
    issueNumber: value.issueNumber,
    branchName: String(value.branchName || "").trim(),
    baseSha: String(value.baseSha || "").trim(),
    currentHeadSha: String(value.currentHeadSha || "").trim(),
    prNumber: value.prNumber ?? null,
    prHeadSha: value.prHeadSha === null || value.prHeadSha === undefined ? null : String(value.prHeadSha || "").trim(),
    runnerRunId: String(value.runnerRunId || "").trim(),
    supervisorRunId: String(value.supervisorRunId || "").trim(),
    originalSupervisorSpecDigest: String(value.originalSupervisorSpecDigest || "").trim(),
    markerKey: String(value.markerKey || "").trim(),
    outageFingerprint: String(value.outageFingerprint || "").trim(),
    attemptNumber: value.attemptNumber,
  };
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(target.taskKey) || target.taskKey.includes("..")) throw new Error("Invalid outage target task key");
  if (!Number.isSafeInteger(target.issueNumber) || target.issueNumber < 1 || target.issueNumber > 9999999) throw new Error("Invalid outage target issue");
  if (!/^(feature|focused|feature-bundle|tools)\/[A-Za-z0-9._/-]{1,180}$/.test(target.branchName) || target.branchName.includes("..")) throw new Error("Invalid outage target branch");
  if (!/^[a-f0-9]{40}$/.test(target.baseSha)) throw new Error("Invalid outage target base SHA");
  if (!/^[a-f0-9]{40}$/.test(target.currentHeadSha)) throw new Error("Invalid outage target head SHA");
  if ((target.prNumber === null) !== (target.prHeadSha === null)) throw new Error("Outage target PR number/head SHA must be paired");
  if (target.prNumber === null || target.prHeadSha === null) throw new Error("Outage recovery-only target requires PR number/head SHA");
  if (target.prNumber !== null && (!Number.isSafeInteger(target.prNumber) || target.prNumber < 1 || target.prNumber > 9999999)) throw new Error("Invalid outage target PR number");
  if (target.prHeadSha !== null && !/^[a-f0-9]{40}$/.test(target.prHeadSha)) throw new Error("Invalid outage target PR head SHA");
  if (!/^run-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z(?:-[a-f0-9]{12})?$/.test(target.runnerRunId)) throw new Error("Invalid outage target runner run ID");
  validateSupervisorRunId(target.supervisorRunId);
  for (const [label, digest] of [
    ["original spec digest", target.originalSupervisorSpecDigest],
    ["marker key", target.markerKey],
    ["fingerprint", target.outageFingerprint],
  ]) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`Invalid outage target ${label}`);
  }
  if (!Number.isSafeInteger(target.attemptNumber) || target.attemptNumber < 1 || target.attemptNumber > 20) throw new Error("Invalid outage target attempt");
  return target;
}

export function validateRecoveryOnlyExistingPrTarget(config = {}, recoveryConfig = {}) {
  if (!config.outageRecoveryOnly) return { ok: true };
  const target = config.outageRecoveryTarget || null;
  if (!target?.prNumber || !target?.prHeadSha) {
    return { ok: false, reason: "outage_recovery_existing_pr_target_missing" };
  }
  const configuredPrNumber = recoveryConfig.prNumber;
  const configuredHeadSha = recoveryConfig.expectedHeadSha || recoveryConfig.exactHeadEvidence?.headSha || null;
  if (!Number.isSafeInteger(configuredPrNumber) || configuredPrNumber !== target.prNumber) {
    return { ok: false, reason: "outage_recovery_existing_pr_target_mismatch" };
  }
  if (configuredHeadSha !== target.prHeadSha) {
    return { ok: false, reason: "outage_recovery_existing_pr_target_mismatch" };
  }
  return { ok: true };
}

export function validateRecoveryOnlyExactHeadEvidence(config = {}, recoveryConfig = {}, { expectedHeadSha = null, changedFiles = null } = {}) {
  if (!config.outageRecoveryOnly) return { ok: true };
  const target = config.outageRecoveryTarget || null;
  const evidence = recoveryConfig?.exactHeadEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { ok: false, reason: "outage_recovery_exact_head_evidence_incomplete" };
  }
  const headSha = expectedHeadSha || recoveryConfig.expectedHeadSha || evidence.headSha || null;
  if (!target?.prNumber || !target?.prHeadSha || headSha !== target.prHeadSha || evidence.headSha !== target.prHeadSha) {
    return { ok: false, reason: "outage_recovery_exact_head_evidence_invalid" };
  }
  let canonicalChangedFiles;
  try {
    canonicalChangedFiles = canonicalizeChangedFiles(changedFiles || evidence.changedFiles);
  } catch {
    return { ok: false, reason: "outage_recovery_exact_head_evidence_invalid" };
  }
  const canonicalChangedFilesDigest = digestChangedFiles(canonicalChangedFiles);
  const requiredChecks = [
    evidence.repositorySlug === (config.repositorySlug || defaultConfig.repositorySlug),
    evidence.issueNumber === target.issueNumber,
    evidence.prNumber === target.prNumber,
    evidence.baseSha === target.baseSha,
    evidence.taskKey === target.taskKey,
    evidence.runnerRunId === target.runnerRunId,
    evidence.supervisorRunId === target.supervisorRunId,
    validRunnerRunId(evidence.runnerRunId),
    validSupervisorRunId(evidence.supervisorRunId),
    Array.isArray(evidence.changedFiles),
    evidence.changedFilesDigest === canonicalChangedFilesDigest,
    evidence.validationPassed === true,
    Array.isArray(evidence.validationResults),
    isNonEmptyString(evidence.validationCompletedAt || evidence.completedAt),
    evidence.geminiPass === true,
    evidence.geminiHeadSha === target.prHeadSha,
    Array.isArray(evidence.geminiChangedFiles),
    isNonEmptyString(evidence.geminiChangedFilesDigest || evidence.changedFilesDigest),
    isNonEmptyString(evidence.geminiProvider),
    isNonEmptyString(evidence.geminiTier),
    isNonEmptyString(evidence.geminiCompletedAt || evidence.completedAt),
    evidence.codexMechanicsApproved === true,
    evidence.codexMechanicsHeadSha === target.prHeadSha,
    Array.isArray(evidence.codexMechanicsChangedFiles),
    isNonEmptyString(evidence.codexMechanicsChangedFilesDigest || evidence.changedFilesDigest),
    isNonEmptyString(evidence.codexMechanicsCompletedAt || evidence.completedAt),
  ];
  if (requiredChecks.some((ok) => !ok)) {
    return { ok: false, reason: "outage_recovery_exact_head_evidence_incomplete" };
  }
  if (!sameCanonicalChangedFiles(evidence.changedFiles, canonicalChangedFiles)) {
    return { ok: false, reason: "outage_recovery_exact_head_evidence_invalid" };
  }
  if (!sameCanonicalChangedFiles(evidence.geminiChangedFiles, canonicalChangedFiles)) {
    return { ok: false, reason: "outage_recovery_exact_head_evidence_invalid" };
  }
  if (!sameCanonicalChangedFiles(evidence.codexMechanicsChangedFiles, canonicalChangedFiles)) {
    return { ok: false, reason: "outage_recovery_exact_head_evidence_invalid" };
  }
  for (const digest of [
    evidence.changedFilesDigest,
    evidence.geminiChangedFilesDigest,
    evidence.codexMechanicsChangedFilesDigest,
  ]) {
    if (digest !== canonicalChangedFilesDigest) return { ok: false, reason: "outage_recovery_exact_head_evidence_invalid" };
  }
  return { ok: true };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sameCanonicalChangedFiles(left = [], right = []) {
  let a;
  let b;
  try {
    a = canonicalizeChangedFiles(left);
    b = canonicalizeChangedFiles(right);
  } catch {
    return false;
  }
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function canonicalizeChangedFiles(values = []) {
  if (!Array.isArray(values)) {
    throw new Error("changedFiles must be an array");
  }
  const normalized = [];
  const seen = new Set();
  for (const raw of values) {
    if (typeof raw !== "string") throw new Error("changedFiles entries must be strings");
    const value = raw.trim().replaceAll("\\", "/");
    if (!value) throw new Error("changedFiles entries must be non-empty");
    if (path.isAbsolute(value) || /^[A-Za-z]:\//.test(value) || value.startsWith("//")) {
      throw new Error("changedFiles entries must be repository-relative");
    }
    const segments = value.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error("changedFiles entries must not contain empty or traversal segments");
    }
    if (seen.has(value)) throw new Error("changedFiles entries must not contain duplicates");
    seen.add(value);
    normalized.push(value);
  }
  return normalized.sort();
}

export function digestChangedFiles(values = []) {
  return createHash("sha256").update(JSON.stringify(canonicalizeChangedFiles(values))).digest("hex");
}

function validRunnerRunId(value) {
  try {
    validateRunnerRunId(value);
    return true;
  } catch {
    return false;
  }
}

function validSupervisorRunId(value) {
  try {
    validateSupervisorRunId(value);
    return true;
  } catch {
    return false;
  }
}

function readTrustedConfigFile(configPath, { runPrStack = false, bootstrapTrustedRoot = null, trustHooks = null } = {}) {
  const resolved = path.resolve(configPath);
  if (!runPrStack) {
    const installedBundle = existsSync(path.join(moduleRuntimeRoot(), "runtime-bundle-manifest.json"));
    if (installedBundle) {
      const loaded = readExternalProfileConfig(resolved, trustHooks);
      if (loaded.config.runtimeMode !== "external") {
        throw new Error("external_runtime_requires_external_profile: Installed runtime requires runtimeMode external.");
      }
      return loaded;
    }
    const parsed = JSON.parse(readFileSync(resolved, "utf8"));
    if (parsed.runtimeMode === "external") return readExternalProfileConfig(resolved, trustHooks);
    return { config: parsed, evidence: null };
  }
  if (!path.isAbsolute(configPath) || resolved !== configPath) throw new Error("config_path_not_canonical: Config path must be absolute and canonical.");
  const trustedRootProof = validateTrustedRootDirectory(resolveExternalConfigTrustRoot({ bootstrapTrustedRoot }));
  const layoutProof = validateLiveStackAcceptanceConfigPath(resolved, trustedRootProof);
  const walked = validateTrustedConfigPathComponents(trustedRootProof, resolved, layoutProof.relativePath);
  const real = resolveTrustedConfigRealpath(resolved, trustedRootProof);
  trustHooks?.beforeOpen?.({ configPath: resolved, canonicalConfigPath: real, trustedRootProof, layoutProof, walked });
  const opened = openTrustedConfigNoFollow(resolved, trustHooks);
  const { fd, strategy } = opened;
  let stat;
  let buffer;
  try {
    trustHooks?.afterOpen?.({ fd, configPath: resolved, canonicalConfigPath: real, trustedRootProof, layoutProof, walked });
    stat = fstatSync(fd);
    if (!sameFileIdentity(walked.terminalStat, stat)) throw new Error("config_identity_mismatch: Config file identity changed between validation and descriptor open.");
    validateTrustedConfigRegularFile(stat);
    const postOpenLstat = lstatSync(resolved);
    if (!sameFileIdentity(postOpenLstat, stat)) throw new Error("config_identity_mismatch: Config file identity changed after descriptor open.");
    const postOpenReal = resolveTrustedConfigRealpath(resolved, trustedRootProof);
    if (postOpenReal !== real) throw new Error("config_identity_mismatch: Config file canonical path changed during validation.");
    trustHooks?.beforeRead?.({ fd, configPath: resolved, canonicalConfigPath: real, trustedRootProof, layoutProof, stat });
    buffer = readBoundedTrustedDescriptorBytes(fd, stat, maxTrustedConfigBytes);
    trustHooks?.afterRead?.({ fd, configPath: resolved, canonicalConfigPath: real, trustedRootProof, layoutProof, stat, bytesRead: buffer.length });
    const postReadStat = fstatSync(fd);
    if (!sameFileIdentity(stat, postReadStat) || postReadStat.size !== stat.size) {
      throw new Error("config_identity_mismatch: Config file identity or size changed during descriptor read.");
    }
  } catch (error) {
    if (error?.code === "ELOOP") throw new Error("config_symlink_escape: Config symlink was refused by no-follow open.");
    if (error?.code === "ENOENT") throw new Error("config_missing: Config file disappeared during trusted read.");
    throw error;
  } finally {
    closeSync(fd);
  }
  if (!isUtf8(buffer)) throw new Error("config_utf8_invalid: Config file must be valid UTF-8.");
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`config_json_invalid: Config JSON is malformed: ${error.message}`);
  }
  if (runPrStack) {
    validateParsedPrStackConfigIdentity(parsed, trustedRootProof);
  }
  return {
    config: parsed,
    evidence: {
      externalRootSource: trustedRootProof.source,
      canonicalRoot: trustedRootProof.realpath,
      path: resolved,
      realpath: real,
      canonicalConfigPath: real,
      trustedRoot: trustedRootProof.realpath,
      relativePurposePath: layoutProof.relativePath,
      taskCorrelation: layoutProof.taskCorrelation,
      size: stat.size,
      mode: stat.mode & 0o777,
      uid: stat.uid,
      type: "regular_file",
      device: stat.dev,
      inode: stat.ino,
      identity: fileIdentity(stat),
      noFollowStrategy: strategy,
      digestSha256: createHash("sha256").update(buffer).digest("hex"),
      repositorySlug: parsed.repositorySlug || parsed.repository || defaultConfig.repositorySlug,
      repoRoot: parsed.repoRoot || parsed.protectedRoot || defaultConfig.repoRoot,
      worktreeRoot: parsed.worktreeRoot || parsed.controlPlaneWorktree || null,
      loadedAt: new Date().toISOString(),
    },
  };
}

function readExternalProfileConfig(configPath, trustHooks = null) {
  if (!path.isAbsolute(configPath) || path.resolve(configPath) !== configPath) {
    throw new Error("config_path_not_canonical: External profile path must be absolute and canonical.");
  }
  validateExternalProfilePath(configPath);
  const before = lstatSync(configPath);
  if (before.isSymbolicLink() || realpathSync(configPath) !== configPath) {
    throw new Error("config_canonical_alias_mismatch: External profile must not be a symlink or alias.");
  }
  validateTrustedConfigRegularFile(before);
  const { fd, strategy } = openTrustedConfigNoFollow(configPath, trustHooks);
  try {
    const opened = fstatSync(fd);
    if (!sameFileIdentity(before, opened)) throw new Error("config_identity_mismatch: External profile changed before open.");
    validateTrustedConfigRegularFile(opened);
    const buffer = readBoundedTrustedDescriptorBytes(fd, opened, maxTrustedConfigBytes);
    const after = fstatSync(fd);
    if (!sameFileIdentity(opened, after) || opened.size !== after.size) {
      throw new Error("config_identity_mismatch: External profile changed during read.");
    }
    if (!isUtf8(buffer)) throw new Error("config_utf8_invalid: External profile must be valid UTF-8.");
    return {
      config: JSON.parse(buffer.toString("utf8")),
      evidence: {
        strategy,
        realPath: configPath,
        ownerUid: opened.uid,
        mode: opened.mode & 0o777,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      },
    };
  } finally {
    closeSync(fd);
  }
}

export function validateExternalProfilePath(configPath, fixedRoot = externalProfileRoot) {
  if (path.dirname(configPath) !== fixedRoot || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.json$/u.test(path.basename(configPath))) {
    throw new Error("config_outside_external_profile_root: External profile must be a direct JSON child of the fixed config root.");
  }
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  const segments = fixedRoot.split(path.sep).filter(Boolean);
  let current = path.parse(fixedRoot).root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const info = lstatSync(current);
    if (info.isSymbolicLink() || !info.isDirectory() || realpathSync(current) !== current) {
      throw new Error("config_external_profile_ancestor_unsafe: External profile ancestors must be canonical directories.");
    }
    if ((info.mode & 0o022) !== 0) {
      throw new Error("config_external_profile_ancestor_unsafe: External profile ancestors must be owner-controlled.");
    }
    if (current === fixedRoot && currentUid !== null && info.uid !== currentUid) {
      throw new Error("config_external_profile_root_owner_invalid: External profile root must be owned by the runner user.");
    }
  }
  return fixedRoot;
}

function resolveExternalConfigTrustRoot({ bootstrapTrustedRoot = null } = {}) {
  const explicit = bootstrapTrustedRoot || null;
  const configured = process.env.SETTLEORA_STACK_TRUST_ROOT || null;
  if (explicit && configured && path.resolve(explicit) !== path.resolve(configured)) {
    throw new Error("bootstrap_root_conflict: explicit and configured bootstrap logs roots conflict.");
  }
  const raw = explicit || configured || defaultLogsRoot;
  const source = explicit ? "trusted_capability" : configured ? "process_env" : "repository_default";
  if (!raw || typeof raw !== "string" || !path.isAbsolute(raw)) {
    throw new Error("bootstrap_root_missing_invalid: --run-pr-stack requires an externally anchored bootstrap logs root.");
  }
  return { admission: validateExternalBootstrapRootPath(raw), source };
}

function validateExternalBootstrapRootPath(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("\0")) {
    throw new Error("bootstrap_root_missing_invalid: --run-pr-stack requires an externally anchored bootstrap logs root.");
  }
  if (!path.isAbsolute(raw)) {
    throw new Error("bootstrap_root_missing_invalid: --run-pr-stack requires an externally anchored bootstrap logs root.");
  }
  const resolved = path.resolve(raw);
  if (resolved !== raw) {
    throw new Error("bootstrap_root_path_not_canonical: --run-pr-stack bootstrap logs root must be an absolute canonical path.");
  }
  if (!isInsidePath(resolved, defaultLogsRoot)) {
    throw new Error("bootstrap_root_outside_runner_logs: --run-pr-stack bootstrap logs root must stay under the runner logs root.");
  }
  const relative = path.relative(defaultLogsRoot, resolved);
  const relativeSegments = relative ? relative.split(path.sep) : [];
  if (
    relativeSegments.some((segment) => (
      segment === "." ||
      segment === ".." ||
      segment.length === 0 ||
      !/^[A-Za-z0-9._-]+$/.test(segment)
    ))
  ) {
    throw new Error("bootstrap_root_path_not_canonical: --run-pr-stack bootstrap logs root must use safe canonical path segments.");
  }
  const admitted = path.join(defaultLogsRoot, ...relativeSegments);
  if (admitted !== resolved) {
    throw new Error("bootstrap_root_path_not_canonical: --run-pr-stack bootstrap logs root must be an absolute canonical path.");
  }
  return Object.freeze({ root: admitted, relativeSegments });
}

function validateTrustedRootDirectory({ admission, source }) {
  const root = admitTrustedBootstrapRootFromSafeSegments(admission);
  let baseStat;
  try {
    baseStat = lstatSync(defaultLogsRoot);
  } catch {
    throw new Error("bootstrap_root_missing_invalid: --run-pr-stack bootstrap logs root is missing.");
  }
  if (baseStat.isSymbolicLink()) throw new Error("bootstrap_root_symlink: --run-pr-stack bootstrap logs root must not be a symlink.");
  let current = defaultLogsRoot;
  let linkStat = baseStat;
  for (const segment of admission.relativeSegments) {
    current = path.join(current, segment);
    try {
      linkStat = lstatSync(current);
    } catch {
      throw new Error("bootstrap_root_missing_invalid: --run-pr-stack bootstrap logs root is missing.");
    }
    if (linkStat.isSymbolicLink()) throw new Error("bootstrap_root_symlink: --run-pr-stack bootstrap logs root must not be a symlink.");
    if (!linkStat.isDirectory()) throw new Error("bootstrap_root_type_invalid: --run-pr-stack bootstrap logs root must be a directory.");
  }
  const real = realpathSync(root);
  if (real !== root) throw new Error("bootstrap_root_canonical_alias_mismatch: --run-pr-stack bootstrap logs root realpath must match the canonical path.");
  const stat = statSync(real);
  if (!stat.isDirectory()) throw new Error("bootstrap_root_type_invalid: --run-pr-stack bootstrap logs root must be a directory.");
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && stat.uid !== currentUid) throw new Error("bootstrap_root_owner_invalid: --run-pr-stack bootstrap logs root owner must match the current operator.");
  if ((stat.mode & 0o002) !== 0) throw new Error("bootstrap_root_mode_untrusted: --run-pr-stack bootstrap logs root must not be world-writable.");
  return { realpath: real, mode: stat.mode & 0o777, uid: stat.uid, source };
}

function admitTrustedBootstrapRootFromSafeSegments(admission) {
  if (!admission || typeof admission !== "object" || !Array.isArray(admission.relativeSegments)) {
    throw new Error("bootstrap_root_missing_invalid: --run-pr-stack requires an externally anchored bootstrap logs root.");
  }
  if (
    admission.relativeSegments.some((segment) => (
      typeof segment !== "string" ||
      segment === "." ||
      segment === ".." ||
      segment.length === 0 ||
      !/^[A-Za-z0-9._-]+$/.test(segment)
    ))
  ) {
    throw new Error("bootstrap_root_path_not_canonical: --run-pr-stack bootstrap logs root must use safe canonical path segments.");
  }
  const admitted = path.join(defaultLogsRoot, ...admission.relativeSegments);
  if (admitted !== admission.root || !isInsidePath(admitted, defaultLogsRoot)) {
    throw new Error("bootstrap_root_outside_runner_logs: --run-pr-stack bootstrap logs root must stay under the runner logs root.");
  }
  return admitted;
}

function validateLiveStackAcceptanceConfigPath(configPath, trustedRootProof) {
  const root = trustedRootProof.realpath;
  if (!isInsidePath(configPath, root)) {
    throw new Error("config_outside_bootstrap_root: --run-pr-stack config path must be under externally anchored bootstrap logs root.");
  }
  const relative = path.relative(root, configPath);
  const parts = relative.split(path.sep);
  if (
    parts.length !== 3 ||
    parts[0] !== liveStackAcceptanceRootName ||
    parts[2] !== liveStackAcceptanceConfigName
  ) {
    throw new Error("config_wrong_purpose_layout: --run-pr-stack config path must be live-stack-acceptance/<task-correlation>/config.json.");
  }
  const taskCorrelation = parts[1];
  if (!liveStackCorrelationPattern.test(taskCorrelation)) {
    throw new Error("config_invalid_correlation_segment: --run-pr-stack live-stack-acceptance correlation segment is invalid.");
  }
  return { relativePath: relative.split(path.sep).join("/"), taskCorrelation };
}

function validateTrustedConfigPathComponents(trustedRootProof, configPath, relativePath) {
  const parts = relativePath.split("/").filter(Boolean);
  let current = trustedRootProof.realpath;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error?.code === "ELOOP") throw new Error("config_symlink_escape: Config path contains a symlink loop.");
      throw new Error("config_missing: Config path component is missing.");
    }
    if (stat.isSymbolicLink()) throw new Error("config_symlink_escape: Config path must not contain symlinks.");
    if (index < parts.length - 1) {
      if (!stat.isDirectory()) throw new Error("config_parent_type_invalid: Config parent path must contain only directories.");
      validateTrustedConfigDirectory(stat);
    } else {
      validateTrustedConfigRegularFile(stat);
    }
  }
  return { terminalStat: lstatSync(configPath) };
}

function validateTrustedConfigDirectory(stat) {
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && stat.uid !== currentUid) throw new Error("config_parent_owner_invalid: Config parent owner must match the current operator.");
  if ((stat.mode & 0o077) !== 0) throw new Error("config_parent_mode_untrusted: Config parent directories must be owner-only.");
}

function validateTrustedConfigRegularFile(stat) {
  if (!stat.isFile()) throw new Error("config_file_type_invalid: Config path must be a regular file.");
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && stat.uid !== currentUid) throw new Error("config_owner_invalid: Config file owner must match the current operator.");
  if ((stat.mode & 0o022) !== 0) throw new Error("config_mode_group_world_writable: Config file must not be group/world writable.");
  if ((stat.mode & 0o077) !== 0) throw new Error("config_mode_not_restrictive: Config file must be owner-only.");
  if (stat.size > maxTrustedConfigBytes) throw new Error("config_size_exceeded: Config file exceeds the bounded size limit.");
}

function readBoundedTrustedDescriptorBytes(fd, stat, maxBytes) {
  if (stat.size > maxBytes) throw new Error("config_size_exceeded: Config file exceeds the bounded size limit.");
  const buffer = Buffer.allocUnsafe(stat.size);
  let offset = 0;
  while (offset < buffer.length) {
    const bytesRead = readSync(fd, buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) throw new Error("config_identity_mismatch: Config file size changed during descriptor read.");
    offset += bytesRead;
  }
  return buffer;
}

function resolveTrustedConfigRealpath(configPath, trustedRootProof) {
  const real = realpathSync(configPath);
  if (real !== configPath) throw new Error("config_canonical_alias_mismatch: Config path realpath must match the canonical path.");
  if (!isInsidePath(real, trustedRootProof.realpath)) throw new Error("config_outside_bootstrap_root: --run-pr-stack config path must be under externally anchored bootstrap logs root.");
  return real;
}

function openTrustedConfigNoFollow(configPath, hooks = null) {
  const constants = hooks?.fsConstants || fsConstants;
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new Error("config_no_follow_unavailable: O_NOFOLLOW is unavailable for trusted config open.");
  }
  try {
    return {
      fd: openSync(configPath, constants.O_RDONLY | constants.O_NOFOLLOW),
      strategy: "openSync:O_RDONLY|O_NOFOLLOW",
    };
  } catch (error) {
    if (error?.code === "ELOOP") throw new Error("config_symlink_escape: Config symlink was refused by no-follow open.");
    if (error?.code === "ENOENT") throw new Error("config_missing: Config disappeared before descriptor open.");
    throw new Error(`config_open_failed: Config could not be opened safely: ${error.message}`);
  }
}

function fileIdentity(stat) {
  return `${stat.dev}:${stat.ino}`;
}

function sameFileIdentity(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}

function validateParsedPrStackConfigIdentity(parsed, trustedRootProof) {
  const repository = parsed.repositorySlug || parsed.repository || defaultConfig.repositorySlug;
  if (repository !== defaultConfig.repositorySlug) {
    throw new Error("config_identity_mismatch: --run-pr-stack config repository must match the approved repository identity.");
  }
  const repoRoot = parsed.repoRoot || parsed.protectedRoot || defaultConfig.repoRoot;
  if (repoRoot && path.resolve(repoRoot) !== path.resolve(defaultConfig.repoRoot) && path.resolve(repoRoot) !== process.cwd()) {
    throw new Error("config_repo_root_mismatch: --run-pr-stack config repo root/worktree must match the invocation.");
  }
  const worktree = parsed.worktreeRoot || parsed.worktree || null;
  if (worktree && path.resolve(worktree) !== path.resolve(defaultConfig.repoRoot) && path.resolve(worktree) !== process.cwd()) {
    throw new Error("config_repo_root_mismatch: --run-pr-stack config repo root/worktree must match the invocation.");
  }
  for (const [field, value] of [["logsRoot", parsed.logsRoot], ["trustedControlRoot", parsed.trustedControlRoot]]) {
    const canonical = validateParsedPrStackConfigRoot(field, value, trustedRootProof);
    if (canonical !== null) parsed[field] = canonical;
  }
}

function validateParsedPrStackConfigRoot(field, value, trustedRootProof) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`config_root_incompatible: --run-pr-stack config ${field} must remain compatible with the externally anchored bootstrap logs root.`);
  }
  const candidate = path.resolve(value);
  const trustedRoot = trustedRootProof.realpath;
  if (candidate !== trustedRoot && !isInsidePath(candidate, trustedRoot)) {
    throw new Error(`config_root_incompatible: --run-pr-stack config ${field} must remain compatible with the externally anchored bootstrap logs root.`);
  }

  const relative = path.relative(trustedRoot, candidate);
  const parts = relative ? relative.split(path.sep) : [];
  let current = trustedRoot;
  for (const segment of parts) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") return candidate;
      if (error?.code === "ELOOP") throw new Error(`config_root_symlink_escape: --run-pr-stack config ${field} root path contains a symlink loop.`);
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`config_root_symlink_escape: --run-pr-stack config ${field} root path must not contain symlinks.`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`config_root_type_invalid: --run-pr-stack config ${field} root path components must be directories.`);
    }
    const real = realpathSync(current);
    if (real !== current || (real !== trustedRoot && !isInsidePath(real, trustedRoot))) {
      throw new Error(`config_root_incompatible: --run-pr-stack config ${field} root realpath must remain under the externally anchored bootstrap logs root.`);
    }
  }
  return parts.length === 0 ? trustedRoot : candidate;
}

function isInsidePath(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
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

export function normalizePrStackExecutionConfig(raw = {}) {
  const required = [
    "existingPrConvergence",
    "exactHeadReviewRequest",
    "ciScannerPolling",
    "exactHeadMerge",
    "baseRetarget",
    "readyTransition",
    "semanticProof",
    "finalHygiene",
  ];
  const forbidden = [
    "issuePolling",
    "generatedIssueCreation",
    "unrelatedPrDiscovery",
    "systemdSupervisorLaunch",
    "outageChildLaunch",
    "canaryMutation",
    "productionDeploy",
    "secretAuthConfigMutation",
    "publicAdminNetworkExposure",
    "branchDeletion",
    "forcePushRebaseAmendReset",
    "directMainPush",
    "productAuthorityChanges",
  ];
  if (raw && typeof raw !== "object") throw new Error("prStackExecution must be an object");
  const capabilities = {};
  for (const key of [...required, ...forbidden]) capabilities[key] = raw.capabilities?.[key] === true;
	  const maxStackSize = raw.maxStackSize ?? 4;
  if (!Number.isInteger(maxStackSize) || maxStackSize < 2 || maxStackSize > 4) {
    throw new Error("prStackExecution.maxStackSize must be an integer between 2 and 4");
  }
	  if (raw.statePath !== null && raw.statePath !== undefined && (typeof raw.statePath !== "string" || !path.isAbsolute(raw.statePath))) {
	    throw new Error("prStackExecution.statePath must be an absolute path when set");
	  }
	  if (raw.protectedPlanAuthorizationPath !== null && raw.protectedPlanAuthorizationPath !== undefined && (typeof raw.protectedPlanAuthorizationPath !== "string" || !path.isAbsolute(raw.protectedPlanAuthorizationPath))) {
	    throw new Error("prStackExecution.protectedPlanAuthorizationPath must be an absolute path when set");
	  }
	  const boundedOptionalInteger = (value, name, minimum, maximum) => {
	    if (value === null || value === undefined) return null;
	    if (!Number.isInteger(value) || value < minimum || value > maximum) {
	      throw new Error(`prStackExecution.${name} must be an integer between ${minimum} and ${maximum}`);
	    }
	    return value;
	  };
	  return Object.freeze({
	    enabled: raw.enabled === true,
	    allowRun: raw.allowRun === true,
	    productionProfileActive: raw.productionProfileActive === true,
	    maxStackSize,
	    maxDispatchActions: boundedOptionalInteger(raw.maxDispatchActions, "maxDispatchActions", 1, 100),
	    runnerTimeoutMs: boundedOptionalInteger(raw.runnerTimeoutMs, "runnerTimeoutMs", 1000, 120000),
	    runnerMaxOutputBytes: boundedOptionalInteger(raw.runnerMaxOutputBytes, "runnerMaxOutputBytes", 1024, 1048576),
	    statePath: raw.statePath || null,
	    protectedPlanAuthorizationPath: raw.protectedPlanAuthorizationPath || null,
	    capabilities: Object.freeze(capabilities),
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
