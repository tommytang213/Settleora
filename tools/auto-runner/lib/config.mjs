import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { laneManifest } from "./lane-policy.mjs";
import { defaultReviewerBudget, defaultReviewerTiers, mergeReviewerPolicyConfig } from "./reviewer-policy.mjs";
import { normalizeLargeBundleReviewApprovalConfig } from "./reviewer-policy.mjs";
import { normalizeReviewFixMutationConfig } from "./review-fix-policy.mjs";
import { normalizeReviewFixCanaryFixtureConfig } from "./review-fix-fixture.mjs";
import { validateRunnerRunId, validateSupervisorRunId } from "./run-correlation.mjs";
import { defaultOutageResubmissionConfig, normalizeOutageResubmissionConfig } from "./outage-resubmission-policy.mjs";

export const defaultLogsRoot = "/workspace/logs/settleora-auto-runner";
const mandatoryAutoMergeChecks = Object.freeze(["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"]);

export const defaultConfig = Object.freeze({
  repoRoot: "/workspace/repos/Settleora",
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
    outageRecoveryOnly: false,
    outageRecoveryTarget: null,
    securityFindingsDryRun: false,
    securityFindingsDispositionDryRun: false,
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
  const specialMode = args.writeSummary || Boolean(args.reviewPackage) || args.preflight || args.reviewerSmokeTest || controlMode || args.securityFindingsDryRun;
  if (!specialMode && args.dryRun === args.run) {
    throw new Error("Pass exactly one of --dry-run or --run");
  }
  if ((args.writeSummary || args.reviewPackage || controlMode) && (args.dryRun || (args.run && !args.listEvents) || args.preflight || args.canary || args.reviewerSmokeTest)) {
    throw new Error("Special modes do not take --dry-run, --run, --canary, --preflight, or --reviewer-smoke-test");
  }
  if (args.supervisorRunId && (!args.run || args.dryRun || specialMode)) {
    throw new Error("--supervisor-run-id is only valid with a normal real --run");
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
  config.largeBundleReviewApproval = normalizeLargeBundleReviewApprovalConfig(config.largeBundleReviewApproval);
  config.reviewerProviderProfiles = normalizeReviewerProviderProfiles(config.reviewerProviderProfiles);
  config.autoMergePolicy = normalizeAutoMergePolicy(config.autoMergePolicy);
  config.reviewFixMutation = normalizeReviewFixMutationConfig(config);
  config.maxReviewFixCycles = config.reviewFixMutation.maxAttempts;
  config.reviewFixCanaryFixture = normalizeReviewFixCanaryFixtureConfig(config);
  config.outageResubmission = normalizeOutageResubmissionConfig(config.outageResubmission);
  if (config.outageRecoveryOnly) {
    config.outageRecoveryTarget = normalizeOutageRecoveryCliTarget(config.outageRecoveryTarget || {});
    config.maxIterations = 1;
    config.requestedMaxIterations = 1;
  }
  if (
    config.outageResubmission.allowBoundedOutageResubmission === true &&
    trustedCapabilities?.outageResubmissionControllerAvailable !== true
  ) {
    throw new Error("Bounded outage resubmission requires trusted controller capability.");
  }

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
  if (!/^run-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$/.test(target.runnerRunId)) throw new Error("Invalid outage target runner run ID");
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
    evidence.prNumber === target.prNumber,
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
