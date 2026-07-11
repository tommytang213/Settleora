#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { defaultLogsRoot } from "../lib/config.mjs";
import { getRefSha } from "../lib/git-workspace.mjs";
import { readAndVerifyRunSpec, validateRunId } from "./run-spec.mjs";
import { buildHeartbeat, writeHeartbeat } from "./heartbeat.mjs";
import { recordMonitoringEvent } from "./monitoring-outbox.mjs";
import { resolveRunnerSummaryForSupervisor } from "./runner-summary-resolver.mjs";
import { runnerArgvForSpec } from "./systemd-client.mjs";
import { readSupervisorState, writeSupervisorState } from "./supervisor-state.mjs";
import { ensureTrustedRunPathContext, runArtifactKinds } from "./supervisor-paths.mjs";

const exitCodes = {
  completed: 0,
  partial: 10,
  blocked: 11,
  failed: 12,
  cancelled: 13,
  stale: 14,
};

export async function runSupervisorWorker(
  runId,
  {
    logsRoot = defaultLogsRoot,
    repoRoot = "/workspace/repos/Settleora",
    spawnImpl = spawn,
    spawnSyncImpl = spawnSync,
    resolveSummary = resolveRunnerSummaryForSupervisor,
  } = {},
) {
  validateRunId(runId);
  const previous = readSupervisorState(runId, logsRoot).state;
  const verified = readAndVerifyRunSpec(runId, previous?.specSha256 || null, logsRoot);
  const currentMain = getRefSha("origin/main");
  if (currentMain !== verified.spec.initialOriginMainSha) {
    writeSupervisorState(runId, { state: "stale", staleReason: "origin_main_changed", currentMain }, logsRoot);
    return { terminal: "stale", exitCode: exitCodes.stale };
  }
  const pathContext = ensureTrustedRunPathContext({ runId, logsRoot });
  const stdoutPath = pathContext.artifactPath(runArtifactKinds.stdout);
  const stderrPath = pathContext.artifactPath(runArtifactKinds.stderr);
  const statePatch = {
    state: "starting",
    specPath: verified.specPath,
    specSha256: verified.specSha256,
    runnerConfigSha256: verified.config.sha256,
    maxTasks: verified.spec.maxTasks,
    maxRuntime: verified.spec.maxRuntime,
  };
  writeSupervisorState(runId, statePatch, logsRoot);
  let heartbeat = buildHeartbeat({ runId, state: "starting", maxTasks: verified.spec.maxTasks, maxRuntime: verified.spec.maxRuntime });
  writeHeartbeat(runId, heartbeat, logsRoot);
  recordMonitoringEvent("started", heartbeat, { logsRoot });

  const argv = runnerArgvForSpec(verified.spec);
  writeSupervisorState(runId, { state: "running", runnerArgv: redactArgv(argv), stdoutPath, stderrPath }, logsRoot);
  heartbeat = buildHeartbeat({ runId, state: "running", maxTasks: verified.spec.maxTasks, maxRuntime: verified.spec.maxRuntime });
  writeHeartbeat(runId, heartbeat, logsRoot);
  const stdout = createWriteStream(stdoutPath, { flags: "a", mode: 0o600 });
  const stderr = createWriteStream(stderrPath, { flags: "a", mode: 0o600 });
  const child = spawnImpl(argv[0], argv.slice(1), { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);

  let stopping = false;
  const requestStopAfterCurrent = () => {
    if (stopping) return;
    stopping = true;
    writeSupervisorState(runId, { state: "stopping_after_current" }, logsRoot);
    spawnSyncImpl(process.execPath, ["tools/auto-runner/settleora-auto-runner.mjs", "--stop-after-current"], {
      cwd: repoRoot,
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
    writeHeartbeat(runId, activeHeartbeat, logsRoot);
    recordMonitoringEvent("heartbeat", activeHeartbeat, { logsRoot });
  }, 60_000);

  const result = await waitForChild(child);
  clearInterval(interval);
  stdout.end();
  stderr.end();
  const childTerminalState = mapExitToState(result, stopping);
  const reportResolution = resolveSummary({
    logsRoot,
    supervisorRunId: runId,
    initialOriginMainSha: verified.spec.initialOriginMainSha,
    mode: verified.spec.mode,
  });
  const terminalDecision = decideTerminalState(childTerminalState, result, reportResolution);
  writeSupervisorState(runId, {
    state: terminalDecision.state,
    childTerminalState,
    childStatus: result.status,
    childSignal: result.signal,
    runnerRunId: reportResolution.runnerRunId || null,
    runnerSummaryJsonPath: reportResolution.runnerSummaryJsonPath || null,
    runnerSummaryMarkdownPath: reportResolution.runnerSummaryMarkdownPath || null,
    reportPath: reportResolution.reportPath || null,
    reportResolution: sanitizeReportResolution(reportResolution),
    terminalReason: terminalDecision.reason,
    finishedAt: new Date().toISOString(),
  }, logsRoot);
  const terminalHeartbeat = buildHeartbeat({
    runId,
    runnerRunId: reportResolution.runnerRunId || null,
    state: terminalDecision.state,
    maxTasks: verified.spec.maxTasks,
    maxRuntime: verified.spec.maxRuntime,
    reportPath: reportResolution.reportPath || null,
    reportResolution: sanitizeReportResolution(reportResolution),
  });
  writeHeartbeat(runId, terminalHeartbeat, logsRoot);
  recordMonitoringEvent(terminalDecision.state, terminalHeartbeat, { logsRoot });
  return {
    terminal: terminalDecision.state,
    childTerminalState,
    exitCode: exitCodes[terminalDecision.state] ?? 12,
    reportResolution,
  };
}

async function main() {
  const result = await runSupervisorWorker(process.argv[2]);
  process.exit(result.exitCode);
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

export function decideTerminalState(childTerminalState, childResult, reportResolution) {
  if (childResult.status === 0 && reportResolution.status !== "matched") {
    return {
      state: "failed",
      reason: reportResolution.status === "multiple_matches" ? "report_mapping_ambiguous" : "report_mapping_missing",
    };
  }
  return { state: childTerminalState, reason: reportResolution.status === "matched" ? "child_exit_mapped" : "child_exit_unmapped" };
}

function sanitizeReportResolution(resolution) {
  return {
    status: resolution.status || "unknown",
    ok: Boolean(resolution.ok),
    runnerRunId: resolution.runnerRunId || null,
    runnerSummaryJsonPath: resolution.runnerSummaryJsonPath || null,
    runnerSummaryMarkdownPath: resolution.runnerSummaryMarkdownPath || null,
    reportPath: resolution.reportPath || null,
    reason: resolution.reason || null,
    diagnostics: Array.isArray(resolution.diagnostics) ? resolution.diagnostics.slice(0, 20) : [],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
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
}
