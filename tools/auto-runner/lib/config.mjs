import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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
    "blocked",
  ],
  claimLabels: ["auto-claimed", "auto-running"],
  priorityLabels: ["priority-critical", "priority-high", "priority-ready"],
  maxIterations: 1,
  maxRuntimeMs: null,
  pollLimit: 30,
  allowStaleClaimSteal: false,
  staleClaimAfterHours: 12,
  allowAutoMerge: false,
  allowFollowupIssueCreation: false,
  maxFollowupIssuesPerRun: 3,
  maxReviewFixCycles: 1,
  reviewerCommand: "codex-vm-full",
  codexCommand: "codex-vm-full",
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
    once: false,
    maxIterations: null,
    maxRuntimeMs: null,
    reviewPackage: null,
    writeSummary: false,
    sinceMs: 24 * 60 * 60 * 1000,
    requirePrePrReview: false,
    configPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--run") args.run = true;
    else if (arg === "--once") args.once = true;
    else if (arg === "--require-pre-pr-review") args.requirePrePrReview = true;
    else if (arg === "--write-summary") args.writeSummary = true;
    else if (arg === "--review-package") args.reviewPackage = readValue(argv, ++index, arg);
    else if (arg === "--config") args.configPath = readValue(argv, ++index, arg);
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

  const specialMode = args.writeSummary || Boolean(args.reviewPackage);
  if (!specialMode && args.dryRun === args.run) {
    throw new Error("Pass exactly one of --dry-run or --run");
  }
  if (specialMode && (args.dryRun || args.run)) {
    throw new Error("--write-summary and --review-package do not take --dry-run or --run");
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
    maxIterations: cliArgs.maxIterations || fileConfig.maxIterations || defaultConfig.maxIterations,
    maxRuntimeMs: cliArgs.maxRuntimeMs ?? fileConfig.maxRuntimeMs ?? defaultConfig.maxRuntimeMs,
    requirePrePrReview: cliArgs.requirePrePrReview,
  };

  for (const dir of [
    config.logsRoot,
    path.join(config.logsRoot, "state"),
    path.join(config.logsRoot, "tasks"),
    path.join(config.logsRoot, "codex-runs"),
    path.join(config.logsRoot, "reports"),
    path.join(config.logsRoot, "reviews"),
    path.join(config.logsRoot, "summaries"),
    path.join(config.logsRoot, "locks"),
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  const localConfigPath = path.join(config.logsRoot, "runner-config.last.json");
  if (!existsSync(localConfigPath)) {
    writeFileSync(localConfigPath, `${JSON.stringify(config, null, 2)}\n`);
  }
  return config;
}
