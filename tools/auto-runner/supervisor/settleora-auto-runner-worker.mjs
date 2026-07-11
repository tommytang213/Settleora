#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { defaultLogsRoot } from "../lib/config.mjs";
import { getRefSha } from "../lib/git-workspace.mjs";
import { readAndVerifyRunSpec, runDirForRunId, validateRunId } from "./run-spec.mjs";
import { buildHeartbeat, writeHeartbeat } from "./heartbeat.mjs";
import { deliverNotification } from "./notification-client.mjs";
import { runnerArgvForSpec } from "./systemd-client.mjs";
import { readSupervisorState, writeSupervisorState } from "./supervisor-state.mjs";

const exitCodes = {
  completed: 0,
  partial: 10,
  blocked: 11,
  failed: 12,
  cancelled: 13,
  stale: 14,
};

async function main() {
  const runId = process.argv[2];
  validateRunId(runId);
  const previous = readSupervisorState(runId, defaultLogsRoot).state;
  const verified = readAndVerifyRunSpec(runId, previous?.specSha256 || null, defaultLogsRoot);
  const currentMain = getRefSha("origin/main");
  if (currentMain !== verified.spec.initialOriginMainSha) {
    writeSupervisorState(runId, { state: "stale", staleReason: "origin_main_changed", currentMain }, defaultLogsRoot);
    process.exit(exitCodes.stale);
  }
  const runDir = runDirForRunId(runId, defaultLogsRoot);
  const stdoutPath = path.join(runDir, "stdout.log");
  const stderrPath = path.join(runDir, "stderr.log");
  const statePatch = {
    state: "starting",
    specPath: verified.specPath,
    specSha256: verified.specSha256,
    runnerConfigSha256: verified.config.sha256,
    maxTasks: verified.spec.maxTasks,
    maxRuntime: verified.spec.maxRuntime,
  };
  writeSupervisorState(runId, statePatch, defaultLogsRoot);
  let heartbeat = buildHeartbeat({ runId, state: "starting", maxTasks: verified.spec.maxTasks, maxRuntime: verified.spec.maxRuntime });
  writeHeartbeat(runId, heartbeat, defaultLogsRoot);
  await deliverNotification("started", heartbeat, process.env, defaultLogsRoot);

  const argv = runnerArgvForSpec(verified.spec);
  writeSupervisorState(runId, { state: "running", runnerArgv: redactArgv(argv), stdoutPath, stderrPath }, defaultLogsRoot);
  heartbeat = buildHeartbeat({ runId, state: "running", maxTasks: verified.spec.maxTasks, maxRuntime: verified.spec.maxRuntime });
  writeHeartbeat(runId, heartbeat, defaultLogsRoot);
  const stdout = createWriteStream(stdoutPath, { flags: "a", mode: 0o600 });
  const stderr = createWriteStream(stderrPath, { flags: "a", mode: 0o600 });
  const child = spawn(argv[0], argv.slice(1), { cwd: "/workspace/repos/Settleora", stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);

  let stopping = false;
  const requestStopAfterCurrent = () => {
    if (stopping) return;
    stopping = true;
    writeSupervisorState(runId, { state: "stopping_after_current" }, defaultLogsRoot);
    spawnSync(process.execPath, ["tools/auto-runner/settleora-auto-runner.mjs", "--stop-after-current"], {
      cwd: "/workspace/repos/Settleora",
      encoding: "utf8",
    });
  };
  process.once("SIGTERM", requestStopAfterCurrent);
  process.once("SIGINT", requestStopAfterCurrent);

  const interval = setInterval(async () => {
    const activeHeartbeat = buildHeartbeat({
      runId,
      state: stopping ? "stopping_after_current" : "running",
      maxTasks: verified.spec.maxTasks,
      maxRuntime: verified.spec.maxRuntime,
    });
    writeHeartbeat(runId, activeHeartbeat, defaultLogsRoot);
    await deliverNotification("heartbeat", activeHeartbeat, process.env, defaultLogsRoot);
  }, 60_000);

  const result = await waitForChild(child);
  clearInterval(interval);
  const terminal = mapExitToState(result, stopping);
  const reportPath = newestSummaryPath();
  writeSupervisorState(runId, {
    state: terminal,
    childStatus: result.status,
    childSignal: result.signal,
    reportPath,
    finishedAt: new Date().toISOString(),
  }, defaultLogsRoot);
  const terminalHeartbeat = buildHeartbeat({
    runId,
    state: terminal,
    maxTasks: verified.spec.maxTasks,
    maxRuntime: verified.spec.maxRuntime,
    reportPath,
  });
  writeHeartbeat(runId, terminalHeartbeat, defaultLogsRoot);
  await deliverNotification(terminal, terminalHeartbeat, process.env, defaultLogsRoot);
  process.exit(exitCodes[terminal] ?? 12);
}

function waitForChild(child) {
  return new Promise((resolve) => {
    child.on("exit", (status, signal) => resolve({ status, signal }));
    child.on("error", (error) => resolve({ status: null, signal: null, error: error.message }));
  });
}

function mapExitToState(result, stopping) {
  if (stopping) return "cancelled";
  if (result.status === 0) return "completed";
  if (result.signal) return "failed";
  if (result.status === 2) return "blocked";
  if (result.status === 10) return "partial";
  return "failed";
}

function redactArgv(argv) {
  return argv.map((part, index) => (argv[index - 1] === "--config" ? "[config-path]" : part));
}

function newestSummaryPath() {
  return null;
}

main().catch((error) => {
  const runId = process.argv[2];
  if (runId) {
    try {
      writeSupervisorState(runId, { state: "failed", failure: error.message }, defaultLogsRoot);
    } catch {
      // Preserve original failure.
    }
  }
  console.error(error.message);
  process.exit(12);
});
