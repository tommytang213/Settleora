#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";
import { defaultLogsRoot, loadConfig } from "../lib/config.mjs";
import { getRefSha } from "../lib/git-workspace.mjs";
import { safeTimestamp } from "../lib/logger.mjs";
import { readAndVerifyRunSpec, validateRunId } from "./run-spec.mjs";
import { buildHeartbeat, writeHeartbeat } from "./heartbeat.mjs";
import { recordMonitoringEvent } from "./monitoring-outbox.mjs";
import { resolveRunnerSummaryForSupervisor } from "./runner-summary-resolver.mjs";
import { runnerArgvForSpec } from "./systemd-client.mjs";
import { readSupervisorState, writeSupervisorState } from "./supervisor-state.mjs";
import { ensureTrustedRunPathContext, runArtifactKinds } from "./supervisor-paths.mjs";
import { absoluteRuntimeEntry, moduleRuntimeRoot } from "../lib/runtime-identity.mjs";
import { acquireRuntimeConsumer, releaseRuntimeConsumer } from "../lib/runtime-bundle.mjs";

const exitCodes = {
  completed: 0,
  partial: 10,
  blocked: 11,
  failed: 12,
  cancelled: 13,
  stale: 14,
};
let failureLogsRoot = defaultLogsRoot;

export async function runSupervisorWorker(
  runId,
  {
    logsRoot = defaultLogsRoot,
    repoRoot = "/workspace/repos/Settleora",
    spawnImpl = spawn,
    spawnSyncImpl = spawnSync,
    resolveSummary = resolveRunnerSummaryForSupervisor,
    runtimeRoot = moduleRuntimeRoot(),
    projectId = "Settleora",
  } = {},
) {
  validateRunId(runId);
  const previous = readSupervisorState(runId, logsRoot).state;
  const verified = readAndVerifyRunSpec(runId, previous?.specSha256 || null, logsRoot);
  const currentMain = getRefSha("origin/main", { cwd: repoRoot });
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
    runnerRunId: `run-${safeTimestamp()}-${runId.slice(-12)}`,
    startedAt: new Date().toISOString(),
  };
  writeSupervisorState(runId, statePatch, logsRoot);
  const runnerRunId = statePatch.runnerRunId;
  let heartbeatGeneration = 1;
  let heartbeat = buildHeartbeat({ runId, projectId, runnerRunId, state: "starting", maxTasks: verified.spec.maxTasks, maxRuntime: verified.spec.maxRuntime, startedAt: statePatch.startedAt, heartbeatGeneration });
  writeHeartbeat(runId, heartbeat, logsRoot);
  recordMonitoringEvent("started", heartbeat, { logsRoot });

  const argv = runnerArgvForSpec(verified.spec, { runnerRunId, runtimeRoot, logsRoot });
  writeSupervisorState(runId, { state: "running", runnerArgv: redactArgv(argv), stdoutPath, stderrPath }, logsRoot);
  heartbeat = buildHeartbeat({ runId, projectId, runnerRunId, state: "running", maxTasks: verified.spec.maxTasks, maxRuntime: verified.spec.maxRuntime, startedAt: statePatch.startedAt, heartbeatGeneration: ++heartbeatGeneration });
  writeHeartbeat(runId, heartbeat, logsRoot);
  const stdout = createWriteStream(stdoutPath, { flags: "a", mode: 0o600 });
  const stderr = createWriteStream(stderrPath, { flags: "a", mode: 0o600 });
  const runnerArgs = argv.slice(1);
  const child = spawnImpl(process.execPath, runnerArgs, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);

  let stopping = false;
  const requestStopAfterCurrent = () => {
    if (stopping) return;
    stopping = true;
    writeSupervisorState(runId, { state: "stopping_after_current" }, logsRoot);
    spawnSyncImpl(process.execPath, [
      absoluteRuntimeEntry(runtimeRoot, "settleora-auto-runner.mjs"),
      "--stop-after-current",
      "--config",
      verified.config.realPath,
      "--expected-config-sha256",
      verified.config.sha256,
    ], {
      cwd: runtimeRoot,
      encoding: "utf8",
    });
  };
  process.once("SIGTERM", requestStopAfterCurrent);
  process.once("SIGINT", requestStopAfterCurrent);

  const interval = setInterval(async () => {
    const activeHeartbeat = buildHeartbeat({
      runId,
      projectId,
      runnerRunId,
      state: stopping ? "stopping_after_current" : "running",
      maxTasks: verified.spec.maxTasks,
      maxRuntime: verified.spec.maxRuntime,
      startedAt: statePatch.startedAt,
      heartbeatGeneration: ++heartbeatGeneration,
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
  if (reportResolution.runnerRunId && reportResolution.runnerRunId !== runnerRunId) {
    reportResolution.status = "identity_mismatch";
    reportResolution.ok = false;
  }
  const terminalDecision = decideTerminalState(childTerminalState, result, reportResolution);
  writeSupervisorState(runId, {
    state: terminalDecision.state,
    childTerminalState,
    childStatus: result.status,
    childSignal: result.signal,
    runnerRunId,
    runnerSummaryJsonPath: reportResolution.runnerSummaryJsonPath || null,
    runnerSummaryMarkdownPath: reportResolution.runnerSummaryMarkdownPath || null,
    reportPath: reportResolution.reportPath || null,
    reportResolution: sanitizeReportResolution(reportResolution),
    startedAt: statePatch.startedAt,
    heartbeatGeneration: ++heartbeatGeneration,
    terminalReason: terminalDecision.reason,
    finishedAt: new Date().toISOString(),
  }, logsRoot);
  const terminalHeartbeat = buildHeartbeat({
    runId,
    projectId,
    runnerRunId,
    state: terminalDecision.state,
    maxTasks: verified.spec.maxTasks,
    maxRuntime: verified.spec.maxRuntime,
    reportPath: reportResolution.reportPath || null,
    reportResolution: sanitizeReportResolution(reportResolution),
    startedAt: statePatch.startedAt,
    heartbeatGeneration,
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

export async function main() {
  const runtimeConsumer = acquireRuntimeConsumer(moduleRuntimeRoot());
  try {
  const logsIndex = process.argv.indexOf("--logs-root");
  const selectedLogsRoot = logsIndex >= 0 ? process.argv[logsIndex + 1] : null;
  if (!selectedLogsRoot || !path.isAbsolute(selectedLogsRoot) || path.resolve(selectedLogsRoot) !== selectedLogsRoot) {
    throw new Error("supervisor worker requires canonical absolute --logs-root");
  }
  failureLogsRoot = selectedLogsRoot;
  const priorState = readSupervisorState(process.argv[2], selectedLogsRoot).state;
  const verifiedSpec = readAndVerifyRunSpec(process.argv[2], priorState?.specSha256 || null, selectedLogsRoot);
  const configPath = verifiedSpec.spec.runnerConfigPath;
  const config = loadConfig(
    { dryRun: true, run: false, configPath },
    { outageResubmissionObserverAvailable: true },
  );
  if (config.logsRoot !== selectedLogsRoot) throw new Error("supervisor worker logsRoot does not match config");
  if (config.runtimeMode === "external" && config.configTrustEvidence?.sha256 !== verifiedSpec.config.sha256) {
    throw new Error("supervisor worker config digest does not match immutable run spec");
  }
  failureLogsRoot = config.logsRoot;
  const result = await runSupervisorWorker(process.argv[2], {
    logsRoot: config.logsRoot,
    repoRoot: config.repoRoot,
    runtimeRoot: config.runtimeRoot,
    projectId: config.projectId,
  });
    process.exitCode = result.exitCode;
  } catch (error) {
    const runId = process.argv[2];
    if (runId) {
      try {
        writeSupervisorState(runId, { state: "failed", failure: error.message }, failureLogsRoot);
      } catch {
        // Preserve original failure.
      }
    }
    throw error;
  } finally {
    releaseRuntimeConsumer(runtimeConsumer);
  }
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
    console.error(error.message);
    process.exit(12);
  });
}
