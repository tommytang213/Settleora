#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const logsRoot = "/workspace/logs/ai-v3-controller";
const taskPromptDir = path.join(logsRoot, "tasks");
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

function assertSuccess(result, message) {
  if (result.error || result.status !== 0) {
    throw new Error(`${message}\n${formatCommandFailure(result)}`);
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

function mergePr(pr, expectedHeadSha) {
  const view = runCommand("gh", [
    "pr",
    "view",
    String(pr.number),
    "--json",
    "baseRefName,headRefOid,mergeStateStatus",
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

function runRealControllerIteration(selection, data, promptInfo, config) {
  const prompt = readFileSync(promptInfo.promptPath, "utf8");
  const codexCommand = resolveCodexCommand();
  const codex = runCommand(codexCommand.command, [], { input: prompt });
  assertSuccess(codex, `${defaultCodexCommand} task execution failed (${codexCommand.source}: ${codexCommand.command})`);

  const branch = runCommand("git", ["rev-parse", "--verify", promptInfo.branchName]);
  assertSuccess(branch, `Expected task branch was not created: ${promptInfo.branchName}`);

  const files = changedFiles(`origin/${data.state.integrationBranch}`, promptInfo.branchName);
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

  const currentHead = runCommand("git", ["rev-parse", promptInfo.branchName]);
  assertSuccess(currentHead, "Unable to resolve task branch head");
  const expectedHeadSha = currentHead.stdout.trim();
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
    mergePr(pr, expectedHeadSha);
    return { pr, merged: true, headSha: expectedHeadSha };
  }

  return { pr, merged: false, headSha: expectedHeadSha };
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
        Object.assign(item, runRealControllerIteration(selection, data, promptInfo, config));
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
