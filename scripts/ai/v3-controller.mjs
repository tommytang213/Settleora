#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const logsRoot = "/workspace/logs/ai-v3-controller";
const taskPromptDir = path.join(logsRoot, "tasks");
const codexRunDir = path.join(logsRoot, "codex-runs");
const lockPath = path.join(logsRoot, "controller.lock");

const requiredFiles = {
  state: ".ai/state.json",
  taskQueue: ".ai/task-queue.json",
  milestone: ".ai/current-milestone.md",
  qaReport: ".ai/qa-report.md",
  qaFindings: ".ai/qa-findings.json",
};

const maxBugfixCyclesPerFinding = 2;
const maxSameValidationFailure = 2;
const codexCommandEnv = "SETTLEORA_AI_V3_CODEX_COMMAND";
const defaultCodexCommand = "codex-vm-full";

const forbiddenPathPatterns = [
  /^main$/,
  /^\.github\/workflows(?:\/|$)/,
  /^services\/api(?:\/|$)/,
  /^packages\/contracts\/openapi(?:\/|$)/,
  /^packages\/client-dart(?:\/|$)/,
  /^packages\/client-web(?:\/|$)/,
  /^infra(?:\/|$)/,
  /(^|\/)(auth|session|security)(\/|$)/i,
  /(^|\/)migrations?(\/|$)/i,
  /(^|\/)(settlement|payment|bill).*calculation/i,
  /(^|\/)(Dockerfile|docker-compose[^/]*\.ya?ml)$/i,
  /(^|\/)\.env(?:\.|$)/i,
];

const defaultForbiddenPaths = [
  "main",
  ".github/workflows/**",
  "services/api/**",
  "packages/contracts/openapi/**",
  "packages/client-dart/**",
  "packages/client-web/**",
  "infra/**",
  "apps/mobile/** unless the selected task explicitly allows mobile scope",
  "auth/session/security implementation files",
  "database schema/migrations",
  "bill/settlement/payment/money calculation implementation",
  "Docker/env/deployment config",
  "secrets or secret references",
];

function parseArgs(argv) {
  const config = {
    dryRun: false,
    run: false,
    maxIterations: 1,
    allowAutoMerge: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      config.dryRun = true;
    } else if (arg === "--run") {
      config.run = true;
    } else if (arg === "--allow-auto-merge") {
      config.allowAutoMerge = true;
    } else if (arg === "--max-iterations") {
      const value = Number.parseInt(argv[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--max-iterations must be a positive integer");
      }
      config.maxIterations = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (config.dryRun === config.run) {
    throw new Error("Pass exactly one of --dry-run or --run");
  }

  return config;
}

function hktTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${formatter.format(date).replace(",", "")} HKT (GMT+8)`;
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:]/g, "");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) {
    if (fallback !== undefined) {
      writeFileSync(filePath, `${JSON.stringify(fallback, null, 2)}\n`);
      return fallback;
    }
    throw new Error(`Required file is missing: ${filePath}`);
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Required file is missing: ${filePath}`);
  }
  return readFileSync(filePath, "utf8");
}

function ensureWorkspace() {
  if (!existsSync(".git")) {
    throw new Error("Run this controller from the repository root");
  }
  mkdirSync(taskPromptDir, { recursive: true });
  mkdirSync(codexRunDir, { recursive: true });
}

function processAppearsActive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") {
      return false;
    }
    return null;
  }
}

function acquireLock() {
  mkdirSync(logsRoot, { recursive: true });

  if (existsSync(lockPath)) {
    let lock;
    try {
      lock = JSON.parse(readFileSync(lockPath, "utf8"));
    } catch {
      throw new Error(`Controller lock exists and cannot be parsed: ${lockPath}`);
    }

    const active = processAppearsActive(lock.pid);
    if (active === true) {
      throw new Error(`Controller lock is held by active pid ${lock.pid}`);
    }
    if (active === null) {
      throw new Error(`Controller lock exists and staleness cannot be safely determined: ${lockPath}`);
    }
    rmSync(lockPath);
  }

  writeFileSync(
    lockPath,
    `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`,
    { flag: "wx" },
  );
}

function releaseLock() {
  if (!existsSync(lockPath)) {
    return;
  }

  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (lock.pid === process.pid) {
      rmSync(lockPath);
    }
  } catch {
    // Leave an unparseable lock in place for human inspection.
  }
}

function loadStateFiles() {
  const qaFindingsPath = requiredFiles.qaFindings;
  if (!existsSync(qaFindingsPath)) {
    writeFileSync(qaFindingsPath, "[]\n");
  }

  const data = {
    state: readJson(requiredFiles.state),
    taskQueue: readJson(requiredFiles.taskQueue),
    milestone: readText(requiredFiles.milestone),
    qaReport: readText(requiredFiles.qaReport),
    qaFindings: readJson(requiredFiles.qaFindings, []),
  };

  if (!Array.isArray(data.taskQueue)) {
    throw new Error(".ai/task-queue.json must be an array");
  }
  if (!Array.isArray(data.qaFindings)) {
    throw new Error(".ai/qa-findings.json must be an array");
  }
  if (!data.state.integrationBranch) {
    throw new Error(".ai/state.json must include integrationBranch");
  }

  return data;
}

function normalizeAreas(areas) {
  return Array.isArray(areas) ? areas.map(String) : [];
}

function areaTouchesForbidden(area) {
  const normalized = area.replace(/\*\*$/, "").replace(/\/$/, "");
  return forbiddenPathPatterns.some((pattern) => pattern.test(normalized));
}

function taskTouchesForbidden(task) {
  return normalizeAreas(task.allowedAreas).some(areaTouchesForbidden);
}

function findingTouchesForbidden(finding) {
  return normalizeAreas(finding.allowedAreas || finding.paths || finding.files).some(areaTouchesForbidden);
}

function isOpenQaFinding(finding) {
  return (
    finding &&
    finding.status !== "closed" &&
    finding.status !== "resolved" &&
    finding.controllerAction === "create_bugfix_task"
  );
}

function selectTask(data) {
  const stateBlock = stateBlocksAutoMerge(data.state);
  if (stateBlock) {
    return { stop: true, reason: `Controller state requires human review: ${stateBlock}` };
  }

  if (data.state.uiTestingReady === true || /ui[- ]test(?:ing)? ready/i.test(data.milestone)) {
    return { stop: true, reason: "Milestone is marked UI-test ready" };
  }

  const openFinding = data.qaFindings.find(isOpenQaFinding);
  if (openFinding) {
    if (findingTouchesForbidden(openFinding) || openFinding.humanRequired === true) {
      return { stop: true, reason: `QA finding requires human-gated or forbidden scope: ${openFinding.id || "unknown"}` };
    }

    const attempts = Number(openFinding.controllerAttempts || openFinding.bugfixCycles || 0);
    if (attempts >= maxBugfixCyclesPerFinding) {
      return { stop: true, reason: `QA finding retry limit reached: ${openFinding.id || "unknown"}` };
    }

    return {
      type: "qa-bugfix",
      task: {
        id: `QA-${openFinding.id || "finding"}`,
        title: openFinding.title || "QA bugfix task",
        risk: openFinding.risk || "medium",
        autoMergeAllowed: openFinding.autoMergeAllowed === true,
        allowedAreas: normalizeAreas(openFinding.allowedAreas || openFinding.paths || openFinding.files),
        validation: normalizeAreas(openFinding.validation),
        stopConditions: normalizeAreas(openFinding.stopConditions),
      },
      finding: openFinding,
    };
  }

  const pendingTask = data.taskQueue.find((task) => {
    if (!["queued", "pending"].includes(task.status)) {
      return false;
    }
    if (task.humanRequired === true || task.status === "human-required" || task.status === "blocked") {
      return false;
    }
    return !taskTouchesForbidden(task);
  });

  if (pendingTask) {
    return { type: "queued-task", task: pendingTask };
  }

  const blockedPendingTask = data.taskQueue.find((task) => ["queued", "pending"].includes(task.status));
  if (blockedPendingTask) {
    return { stop: true, reason: `No safe pending tasks remain; next pending task is human-gated or forbidden: ${blockedPendingTask.id}` };
  }

  if (data.state.uiTestingReady !== true) {
    return {
      type: "qa-finalization",
      task: {
        id: `${data.state.activeMilestoneId || "M"}-QA-FINALIZE`,
        title: "Milestone QA finalization and UI testing readiness check",
        risk: "low",
        autoMergeAllowed: false,
        allowedAreas: [".ai/**", "docs/**"],
        validation: ["git diff --check", "npm run validate:docs"],
        stopConditions: ["Human-gated blocker remains", "UI testing checklist is not ready"],
      },
    };
  }

  return { stop: true, reason: "No safe pending tasks remain" };
}

function renderList(items) {
  if (!items || items.length === 0) {
    return "- None specified";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function generatePrompt(selection, data) {
  const task = selection.task;
  const slug = slugify(task.title);
  const branchName = `ai/task/${task.id.toLowerCase()}-${slug}`;
  const timestamp = hktTimestamp();
  const prompt = `# Settleora AI V3 Controller Task

Start timestamp: ${timestamp}
Timezone: Asia/Hong_Kong / HKT / GMT+8

## Task

- ID: ${task.id}
- Title: ${task.title}
- Type: ${selection.type}
- Risk: ${task.risk || "unspecified"}
- Base branch: ${data.state.integrationBranch}
- Target branch: ${branchName}
- Auto-merge allowed by queue item: ${task.autoMergeAllowed === true}

## Required Reading

- PROGRAM_ARCHITECTURE.md
- README.md
- docs/workflow/CODEX_TASK_GUIDE.md
- AGENTS.md
- .ai/current-milestone.md
- .ai/state.json
- .ai/task-queue.json
- .ai/qa-report.md
- .ai/qa-findings.json
- Relevant docs for the changed area

## Allowed Paths

${renderList(normalizeAreas(task.allowedAreas))}

## Forbidden Paths And Changes

${renderList(defaultForbiddenPaths)}

Do not make silent runtime, API, security, schema, generated-client, deployment, secret, settlement, payment, bill calculation, or money logic changes.

## Git Rules

- Start from ${data.state.integrationBranch}.
- Create and work only on ${branchName}.
- Never push directly to main.
- Never merge into main.
- Never force push.
- Never delete branches.
- Never use git add ..
- Stage explicit paths only.
- Do not amend commits.
- Do not commit .codex/.

## Validation Commands

${renderList(normalizeAreas(task.validation))}

Also run:

- git status --short
- git diff --check origin/${data.state.integrationBranch}...HEAD
- node scripts/ai/v3-scope-guard.mjs --base origin/${data.state.integrationBranch} --head HEAD

## Report Requirements

- Task status and branch names.
- Source, integration, and task commit SHAs.
- Files changed.
- Validation commands and exact results.
- Scope guard result.
- PR URL when created.
- Human review or stop reason.
- Confirmation that no forbidden runtime, API, security, money, schema, deployment, secret, OpenAPI, generated-client, Docker, or CI changes were made.

## Stop Rules

${renderList(normalizeAreas(task.stopConditions))}

Stop immediately if the task requires forbidden scope, ambiguous GitHub state, failing validation that cannot be safely classified, secrets, auth/security changes, schema/migration changes, OpenAPI/generated-client changes, backend/API runtime changes, money/bill/settlement/payment calculation changes, Docker/deployment/env changes, or a merge into main.

End timestamp marker for prompt creation: ${timestamp}
Timezone: Asia/Hong_Kong / HKT / GMT+8
`;

  const promptPath = path.join(taskPromptDir, `${safeTimestamp()}-${task.id}-${slug}.md`);
  writeFileSync(promptPath, prompt);
  return { promptPath, branchName };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function attemptedCommand(command, args = []) {
  return [command, ...args].map((part) => JSON.stringify(String(part))).join(" ");
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    input: options.input,
  });

  return {
    command,
    args,
    status: result.status,
    signal: result.signal || null,
    error: result.error
      ? {
          code: result.error.code,
          name: result.error.name,
          message: result.error.message,
        }
      : null,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function formatCommandFailure(result) {
  const lines = [
    `Command: ${attemptedCommand(result.command, result.args)}`,
    `Status: ${result.status === null ? "null" : result.status}`,
  ];

  if (result.signal) {
    lines.push(`Signal: ${result.signal}`);
  }
  if (result.error) {
    lines.push(`Launch error: ${result.error.name || "Error"} ${result.error.code || ""} ${result.error.message || ""}`.trim());
  }
  if (result.stdout) {
    lines.push(`stdout:\n${result.stdout}`);
  }
  if (result.stderr) {
    lines.push(`stderr:\n${result.stderr}`);
  }

  return lines.join("\n");
}

function tailText(filePath, maxLines = 80) {
  if (!existsSync(filePath)) {
    return "";
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  return lines.slice(-maxLines).join("\n").trim();
}

function formatCodexFailure(result) {
  const lines = [
    `Command: ${attemptedCommand(result.command, result.args)}`,
    `Source: ${result.source}`,
    `Status: ${result.status === null ? "null" : result.status}`,
    `Codex log path: ${result.logPath}`,
  ];

  if (result.signal) {
    lines.push(`Signal: ${result.signal}`);
  }
  if (result.error) {
    lines.push(`Launch error: ${result.error.name || "Error"} ${result.error.code || ""} ${result.error.message || ""}`.trim());
  }

  const tail = tailText(result.logPath);
  if (tail) {
    lines.push(`Codex log tail:\n${tail}`);
  }

  return lines.join("\n");
}

function assertSuccess(result, message) {
  if (result.error || result.status !== 0) {
    throw new Error(`${message}\n${formatCommandFailure(result)}`);
  }
}

function parseJsonOutput(result, message) {
  assertSuccess(result, message);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${message}: unable to parse JSON output (${error.message})`);
  }
}

function resolveCodexCommand() {
  const override = process.env[codexCommandEnv]?.trim();
  if (override) {
    return {
      command: override,
      source: `${codexCommandEnv} override`,
      resolverCommand: null,
      resolverArgs: [],
    };
  }

  const resolverCommand = "bash";
  const resolverArgs = ["-lc", `command -v ${shellQuote(defaultCodexCommand)}`];
  const result = runCommand(resolverCommand, resolverArgs);
  if (!result.error && result.status === 0 && result.stdout.trim()) {
    return {
      command: result.stdout.trim().split(/\r?\n/)[0],
      source: "login-shell PATH",
      resolverCommand,
      resolverArgs,
    };
  }

  throw new Error(
    [
      `${defaultCodexCommand} could not be found before launch.`,
      `Resolver attempted: ${attemptedCommand(resolverCommand, resolverArgs)}`,
      `Current PATH: ${process.env.PATH || ""}`,
      formatCommandFailure(result),
    ].join("\n"),
  );
}

function runCodexCommand(codexCommand, prompt, promptInfo, iteration) {
  const logPath = path.join(
    codexRunDir,
    `${safeTimestamp()}-iteration-${iteration}-${selectionSafeId(promptInfo.branchName)}.log`,
  );
  const args = [];
  const header = [
    `Settleora AI V3 Codex run`,
    `Started: ${new Date().toISOString()}`,
    `Started HKT: ${hktTimestamp()}`,
    `Command: ${attemptedCommand(codexCommand.command, args)}`,
    `Source: ${codexCommand.source}`,
    `Prompt path: ${promptInfo.promptPath}`,
    `Target branch: ${promptInfo.branchName}`,
    "",
    "----- codex output -----",
    "",
  ].join("\n");
  writeFileSync(logPath, header);

  const outputFd = openSync(logPath, "a");
  let result;
  try {
    result = spawnSync(codexCommand.command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["pipe", outputFd, outputFd],
      input: prompt,
    });
  } finally {
    closeSync(outputFd);
  }

  appendFileSync(
    logPath,
    [
      "",
      "----- codex process result -----",
      `Finished: ${new Date().toISOString()}`,
      `Finished HKT: ${hktTimestamp()}`,
      `Status: ${result.status === null ? "null" : result.status}`,
      `Signal: ${result.signal || ""}`,
      result.error
        ? `Launch error: ${result.error.name || "Error"} ${result.error.code || ""} ${result.error.message || ""}`.trim()
        : "Launch error: none",
      "",
    ].join("\n"),
  );

  return {
    command: codexCommand.command,
    args,
    source: codexCommand.source,
    status: result.status,
    signal: result.signal || null,
    error: result.error
      ? {
          code: result.error.code,
          name: result.error.name,
          message: result.error.message,
        }
      : null,
    logPath,
  };
}

function selectionSafeId(value) {
  return slugify(String(value).replace(/^ai\/task\//, ""));
}

function changedFiles(baseRef, headRef) {
  const result = runCommand("git", ["diff", "--name-only", `${baseRef}...${headRef}`]);
  assertSuccess(result, "Unable to inspect changed files");
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function fileAllowedByTask(file, task) {
  return normalizeAreas(task.allowedAreas).some((area) => {
    if (area.endsWith("/**")) {
      return file.startsWith(area.slice(0, -3));
    }
    if (area.includes("*")) {
      return globToRegex(area).test(file);
    }
    return file === area || file.startsWith(`${area.replace(/\/$/, "")}/`);
  });
}

function verifyChangedFilesWithinScope(files, task) {
  const forbidden = files.filter((file) => forbiddenPathPatterns.some((pattern) => pattern.test(file)));
  if (forbidden.length > 0) {
    throw new Error(`Forbidden files touched:\n${forbidden.map((file) => `- ${file}`).join("\n")}`);
  }

  const outside = files.filter((file) => !fileAllowedByTask(file, task));
  if (outside.length > 0) {
    throw new Error(`Changed files outside selected task scope:\n${outside.map((file) => `- ${file}`).join("\n")}`);
  }
}

function readBranchText(branchName, filePath) {
  const result = runCommand("git", ["show", `${branchName}:${filePath}`]);
  assertSuccess(result, `Unable to read ${filePath} from ${branchName}`);
  return result.stdout;
}

function readBranchJson(branchName, filePath) {
  const text = readBranchText(branchName, filePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Unable to parse ${filePath} from ${branchName}: ${error.message}`);
  }
}

function nonEmpty(value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function stateBlocksAutoMerge(state) {
  if (state.humanReviewRequired === true) {
    return ".ai/state.json sets humanReviewRequired: true";
  }
  if (nonEmpty(state.stopReason)) {
    return ".ai/state.json sets a stopReason";
  }
  if (state.forbiddenChangeDetected === true) {
    return ".ai/state.json sets forbiddenChangeDetected: true";
  }
  return null;
}

const blockedTaskStatuses = new Set([
  "blocked",
  "human-required",
  "human_required",
  "needs-human-review",
  "needs_human_review",
  "manual-review-required",
  "manual_review_required",
  "qa_failed",
  "qa-failed",
  "validation-blocked",
  "validation_blocked",
  "failed-validation",
  "failed_validation",
]);

function taskQueueBlocksAutoMerge(taskQueue, taskId) {
  if (!Array.isArray(taskQueue)) {
    return ".ai/task-queue.json is not an array";
  }

  const task = taskQueue.find((item) => item && item.id === taskId);
  if (!task) {
    return `.ai/task-queue.json does not contain selected task ${taskId}`;
  }
  if (task.humanRequired === true) {
    return `.ai/task-queue.json task ${taskId} sets humanRequired: true`;
  }
  if (task.autoMergeAllowed === false) {
    return `.ai/task-queue.json task ${taskId} sets autoMergeAllowed: false`;
  }

  const status = String(task.status || "").trim().toLowerCase();
  if (blockedTaskStatuses.has(status)) {
    return `.ai/task-queue.json task ${taskId} has blocked status: ${task.status}`;
  }

  return null;
}

const validationBlockedPattern =
  /\b(validation blocked|could not run|failed validation|human-gated|manual review required|human review required|mobile validation (?:is )?blocked|blocked validation)\b/i;

function textBlocksAutoMerge(label, text) {
  const match = String(text || "").match(validationBlockedPattern);
  return match ? `${label} indicates blocked validation or human review: ${match[0]}` : null;
}

function inspectTaskBranchAutoMergeState(branchName, taskId) {
  const state = readBranchJson(branchName, requiredFiles.state);
  const stateBlock = stateBlocksAutoMerge(state);
  if (stateBlock) {
    return stateBlock;
  }

  const taskQueueText = readBranchText(branchName, requiredFiles.taskQueue);
  let taskQueue;
  try {
    taskQueue = JSON.parse(taskQueueText);
  } catch (error) {
    return `.ai/task-queue.json cannot be parsed: ${error.message}`;
  }

  const queueBlock = taskQueueBlocksAutoMerge(taskQueue, taskId);
  if (queueBlock) {
    return queueBlock;
  }

  const queueTextBlock = textBlocksAutoMerge(".ai/task-queue.json", taskQueueText);
  if (queueTextBlock) {
    return queueTextBlock;
  }

  const qaReportText = readBranchText(branchName, requiredFiles.qaReport);
  const qaReportBlock = textBlocksAutoMerge(".ai/qa-report.md", qaReportText);
  if (qaReportBlock) {
    return qaReportBlock;
  }

  return null;
}

function repoNameWithOwner() {
  const view = parseJsonOutput(
    runCommand("gh", ["repo", "view", "--json", "nameWithOwner"]),
    "Unable to inspect GitHub repository",
  );
  if (!view.nameWithOwner || !String(view.nameWithOwner).includes("/")) {
    throw new Error("Unable to determine GitHub repository nameWithOwner");
  }
  return view.nameWithOwner;
}

function ghApiPaginatedItems(endpoint, label) {
  const result = runCommand("gh", ["api", endpoint, "--paginate", "--jq", ".[] | @json"]);
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed\n${formatCommandFailure(result)}`);
  }

  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  try {
    return lines.map((line) => JSON.parse(line));
  } catch (error) {
    throw new Error(`${label} returned ambiguous JSON: ${error.message}`);
  }
}

function githubReviewBlocksAutoMerge(prNumber) {
  let nameWithOwner;
  try {
    nameWithOwner = repoNameWithOwner();
  } catch (error) {
    return `GitHub review inspection failed: ${error.message}`;
  }

  const [owner, repo] = nameWithOwner.split("/");
  let reviews;
  let comments;
  try {
    reviews = ghApiPaginatedItems(
      `repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
      `GitHub review inspection failed for PR ${prNumber}`,
    );
    comments = ghApiPaginatedItems(
      `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
      `GitHub inline comment inspection failed for PR ${prNumber}`,
    );
  } catch (error) {
    return error.message;
  }

  if (!Array.isArray(reviews) || !Array.isArray(comments)) {
    return "GitHub review/comment inspection returned ambiguous data";
  }

  const changesRequested = reviews.find((review) => review?.state === "CHANGES_REQUESTED");
  if (changesRequested) {
    const reviewer = changesRequested.user?.login || "unknown reviewer";
    return `PR ${prNumber} has CHANGES_REQUESTED from ${reviewer}`;
  }

  const codexReview = reviews.find((review) => {
    const reviewer = review?.user?.login || "";
    const body = review?.body || "";
    return reviewer === "chatgpt-codex-connector[bot]" && /\bP[0-2]\b|inline comment|suggest/i.test(body);
  });
  if (codexReview) {
    return `PR ${prNumber} has Codex review suggestions from chatgpt-codex-connector[bot]`;
  }

  const codexInlineComment = comments.find((comment) => {
    const author = comment?.user?.login || "";
    const body = comment?.body || "";
    return author === "chatgpt-codex-connector[bot]" || /\bP[0-2]\b/i.test(body);
  });
  if (codexInlineComment) {
    const author = codexInlineComment.user?.login || "unknown reviewer";
    return `PR ${prNumber} has blocking inline review comment from ${author}`;
  }

  return null;
}

function findOrCreatePr(branchName, task) {
  const existing = runCommand("gh", [
    "pr",
    "list",
    "--head",
    branchName,
    "--base",
    "ai/integration",
    "--state",
    "open",
    "--json",
    "number,url,headRefOid",
    "--jq",
    ".[0] // empty",
  ]);
  assertSuccess(existing, "Unable to inspect existing PRs");
  if (existing.stdout.trim()) {
    return JSON.parse(existing.stdout);
  }

  const created = runCommand("gh", [
    "pr",
    "create",
    "--base",
    "ai/integration",
    "--head",
    branchName,
    "--title",
    `${task.id}: ${task.title}`,
    "--body",
    "Created by the AI V3 controller. See controller logs under /workspace/logs/ai-v3-controller/.",
  ]);
  assertSuccess(created, "Unable to create PR");

  const createdView = runCommand("gh", [
    "pr",
    "view",
    branchName,
    "--json",
    "number,url,headRefOid",
  ]);
  assertSuccess(createdView, "Unable to inspect created PR");
  return JSON.parse(createdView.stdout);
}

function checksPass(prNumber) {
  const result = runCommand("gh", ["pr", "checks", String(prNumber), "--watch", "--fail-fast"]);
  return {
    passed: result.status === 0,
    output: `${result.stdout}${result.stderr}`,
  };
}

function autoMergeBlockReason(pr, expectedHeadSha, branchName, task, integrationBranch) {
  let view;
  try {
    view = parseJsonOutput(
      runCommand("gh", [
        "pr",
        "view",
        String(pr.number),
        "--json",
        "number,url,state,isDraft,baseRefName,headRefName,headRefOid,mergeStateStatus",
      ]),
      "Unable to re-check PR before auto-merge",
    );
  } catch (error) {
    return error.message;
  }

  if (view.baseRefName !== "ai/integration" || view.baseRefName !== integrationBranch) {
    return `PR ${pr.number} base is ${view.baseRefName}; expected ai/integration`;
  }
  if (view.headRefOid !== expectedHeadSha) {
    return `PR ${pr.number} head SHA changed from ${expectedHeadSha} to ${view.headRefOid}`;
  }
  if (view.mergeStateStatus !== "CLEAN") {
    return `PR ${pr.number} merge state is ${view.mergeStateStatus}; expected CLEAN`;
  }
  if (view.isDraft !== false) {
    return `PR ${pr.number} is still a draft`;
  }

  const checks = checksPass(pr.number);
  if (!checks.passed) {
    return `PR ${pr.number} checks failed or were ambiguous\n${checks.output}`;
  }

  try {
    const files = changedFiles(`origin/${integrationBranch}`, branchName);
    verifyChangedFilesWithinScope(files, task);
  } catch (error) {
    return error.message;
  }

  if (existsSync("scripts/ai/v3-scope-guard.mjs")) {
    const scopeGuard = runCommand("node", [
      "scripts/ai/v3-scope-guard.mjs",
      "--base",
      `origin/${integrationBranch}`,
      "--head",
      branchName,
    ]);
    if (scopeGuard.error || scopeGuard.status !== 0) {
      return `Scope guard failed before auto-merge\n${formatCommandFailure(scopeGuard)}`;
    }
  }

  try {
    const branchStateBlock = inspectTaskBranchAutoMergeState(branchName, task.id);
    if (branchStateBlock) {
      return branchStateBlock;
    }
  } catch (error) {
    return error.message;
  }

  return githubReviewBlocksAutoMerge(pr.number);
}

function mergePr(pr, expectedHeadSha) {
  const view = runCommand("gh", [
    "pr",
    "view",
    String(pr.number),
    "--json",
    "baseRefName,headRefOid,mergeStateStatus,isDraft",
  ]);
  assertSuccess(view, "Unable to re-check PR before merge");
  const current = JSON.parse(view.stdout);
  if (current.baseRefName !== "ai/integration") {
    throw new Error(`Refusing to merge PR ${pr.number}: base is ${current.baseRefName}`);
  }
  if (current.headRefOid !== expectedHeadSha) {
    throw new Error(`Refusing to merge PR ${pr.number}: head SHA changed`);
  }
  if (current.mergeStateStatus !== "CLEAN") {
    throw new Error(`Refusing to merge PR ${pr.number}: merge state is ${current.mergeStateStatus}`);
  }
  if (current.isDraft !== false) {
    throw new Error(`Refusing to merge PR ${pr.number}: PR is still a draft`);
  }

  const merged = runCommand("gh", [
    "pr",
    "merge",
    String(pr.number),
    "--merge",
    "--match-head-commit",
    expectedHeadSha,
  ]);
  assertSuccess(merged, "Unable to merge PR");
}

function runRealControllerIteration(selection, data, promptInfo, config, iteration) {
  const prompt = readFileSync(promptInfo.promptPath, "utf8");
  const codexCommand = resolveCodexCommand();
  const codex = runCodexCommand(codexCommand, prompt, promptInfo, iteration);
  if (codex.error || codex.status !== 0) {
    throw new Error(`${defaultCodexCommand} task execution failed\n${formatCodexFailure(codex)}`);
  }
  const codexRun = {
    command: codex.command,
    source: codex.source,
    status: codex.status,
    logPath: codex.logPath,
  };

  const branch = runCommand("git", ["rev-parse", "--verify", promptInfo.branchName]);
  assertSuccess(branch, `Expected task branch was not created: ${promptInfo.branchName}`);

  const files = changedFiles(`origin/${data.state.integrationBranch}`, promptInfo.branchName);
  const currentHead = runCommand("git", ["rev-parse", promptInfo.branchName]);
  assertSuccess(currentHead, "Unable to resolve task branch head");
  const expectedHeadSha = currentHead.stdout.trim();

  if (files.length === 0) {
    return {
      codexRun,
      pr: null,
      merged: false,
      headSha: expectedHeadSha,
      noChanges: true,
      noCommit: true,
      noChangesReason: `No changed files between origin/${data.state.integrationBranch} and ${promptInfo.branchName}; no PR needed.`,
    };
  }

  verifyChangedFilesWithinScope(files, selection.task);

  if (existsSync("scripts/ai/v3-scope-guard.mjs")) {
    assertSuccess(
      runCommand("node", [
        "scripts/ai/v3-scope-guard.mjs",
        "--base",
        `origin/${data.state.integrationBranch}`,
        "--head",
        promptInfo.branchName,
      ]),
      "Scope guard failed",
    );
  }

  assertSuccess(
    runCommand("git", ["push", "-u", "origin", promptInfo.branchName]),
    `Unable to push task branch ${promptInfo.branchName}`,
  );
  const pr = findOrCreatePr(promptInfo.branchName, selection.task);
  const checks = checksPass(pr.number);

  if (!checks.passed) {
    throw new Error(`PR checks failed or were ambiguous for PR ${pr.number}\n${checks.output}`);
  }

  if (config.allowAutoMerge && selection.task.autoMergeAllowed === true) {
    const blockReason = autoMergeBlockReason(
      pr,
      expectedHeadSha,
      promptInfo.branchName,
      selection.task,
      data.state.integrationBranch,
    );
    if (blockReason) {
      return {
        codexRun,
        pr,
        merged: false,
        headSha: expectedHeadSha,
        autoMergeBlocked: true,
        autoMergeBlockReason: blockReason,
      };
    }
    mergePr(pr, expectedHeadSha);
    return { codexRun, pr, merged: true, headSha: expectedHeadSha };
  }

  return { codexRun, pr, merged: false, headSha: expectedHeadSha };
}

function writeRunLog(payload) {
  const logPath = path.join(logsRoot, `run-${safeTimestamp()}.json`);
  writeFileSync(logPath, `${JSON.stringify(payload, null, 2)}\n`);
  return logPath;
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  ensureWorkspace();
  acquireLock();

  const run = {
    startedAt: new Date().toISOString(),
    startedAtHkt: hktTimestamp(),
    mode: config.dryRun ? "dry-run" : "run",
    maxIterations: config.maxIterations,
    iterations: [],
    validationFailures: {},
  };

  try {
    for (let iteration = 1; iteration <= config.maxIterations; iteration += 1) {
      const data = loadStateFiles();
      const selection = selectTask(data);

      if (selection.stop) {
        run.stopReason = selection.reason;
        console.log(`Controller stopped: ${selection.reason}`);
        break;
      }

      const promptInfo = generatePrompt(selection, data);
      const item = {
        iteration,
        taskId: selection.task.id,
        taskTitle: selection.task.title,
        taskType: selection.type,
        promptPath: promptInfo.promptPath,
        targetBranch: promptInfo.branchName,
      };
      run.iterations.push(item);

      console.log(`Selected task: ${selection.task.id} - ${selection.task.title}`);
      console.log(`Prompt path: ${promptInfo.promptPath}`);
      console.log(`Target branch: ${promptInfo.branchName}`);

      if (config.dryRun) {
        break;
      }

      try {
        Object.assign(item, runRealControllerIteration(selection, data, promptInfo, config, iteration));
        if (item.noChanges === true) {
          run.stopReason = item.noChangesReason || "Selected task produced no changed files; no PR needed.";
          console.log(`Controller stopped: ${run.stopReason}`);
          break;
        }
      } catch (error) {
        const key = `${selection.task.id}:${error.message.split("\n")[0]}`;
        run.validationFailures[key] = (run.validationFailures[key] || 0) + 1;
        item.error = error.message;
        if (run.validationFailures[key] >= maxSameValidationFailure) {
          throw new Error(`Repeated failure limit reached for ${selection.task.id}: ${error.message}`);
        }
        throw error;
      }
    }
  } finally {
    run.finishedAt = new Date().toISOString();
    run.finishedAtHkt = hktTimestamp();
    const logPath = writeRunLog(run);
    console.log(`Controller run log: ${logPath}`);
    releaseLock();
  }
}

try {
  main();
} catch (error) {
  releaseLock();
  console.error(error.message);
  process.exit(1);
}
