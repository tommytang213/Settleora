#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { defaultLogsRoot } from "./lib/config.mjs";
import { getRefSha, getStatusShort } from "./lib/git-workspace.mjs";
import {
  buildRunSpec,
  generateRunId,
  resolveProfile,
  specPathForRunId,
  writeImmutableRunSpec,
  sha256Text,
  canonicalJson,
} from "./supervisor/run-spec.mjs";
import { buildHeartbeat, readHeartbeat } from "./supervisor/heartbeat.mjs";
import { recordMonitoringEvent } from "./supervisor/monitoring-outbox.mjs";
import { deriveSupervisorPaths, runArtifactKinds } from "./supervisor/supervisor-paths.mjs";
import { buildSystemdStartPlan, runnerArgvForSpec, startUserUnit } from "./supervisor/systemd-client.mjs";
import {
  latestSupervisorRun,
  listSupervisorRuns,
  readSupervisorState,
  reportPathForRun,
  unitNameForRunId,
  writeSupervisorState,
} from "./supervisor/supervisor-state.mjs";
import { loadConfig } from "./lib/config.mjs";
import { writeControlCommand } from "./lib/control-plane.mjs";

async function main() {
  const cli = parseCtlArgs(process.argv.slice(2));
  const config = loadConfig({ dryRun: true, run: false, configPath: null });
  if (cli.command === "submit") {
    const result = await submit(cli, config);
    print(result, cli.json);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  if (cli.command === "list") {
    print({ ok: true, runs: listSupervisorRuns(config.logsRoot) }, cli.json);
    return;
  }
  const runId = resolveRunSelection(cli, config.logsRoot);
  if (cli.command === "status" || cli.command === "report") {
    const status = readSupervisorState(runId, config.logsRoot);
    if (!status.found) {
      print({ ok: false, reason: "unknown_run", runId }, cli.json);
      process.exitCode = 2;
      return;
    }
    const report = supervisorReport(status.state);
    print({
      ok: true,
      runId,
      state: status.state,
      runnerRunId: report.runnerRunId,
      reportPath: report.reportPath,
      runnerSummaryJsonPath: report.runnerSummaryJsonPath,
      runnerSummaryMarkdownPath: report.runnerSummaryMarkdownPath,
      reportResolution: report.reportResolution,
    }, cli.json);
    return;
  }
  if (cli.command === "health") {
    const state = readSupervisorState(runId, config.logsRoot);
    const heartbeat = readHeartbeat(runId, config.logsRoot);
    const health = classifyHealth(state, heartbeat);
    print(health, true);
    process.exitCode = health.exitCode;
    return;
  }
  if (["pause", "stop-after-current", "extend"].includes(cli.command)) {
    const supervisorState = readSupervisorState(runId, config.logsRoot);
    if (!supervisorState.found) {
      print({ ok: false, reason: "unknown_run", runId }, cli.json);
      process.exitCode = 2;
      return;
    }
    const controlConfig = { ...config, logsRoot: defaultLogsRoot };
    const result = writeControlCommand(controlConfig, {
      controlCommand: cli.command === "stop-after-current" ? "stop-after-current" : cli.command,
      maxIterationsExtension: cli.maxTasksDelta,
      maxRuntimeExtensionMs: cli.maxRuntimeDeltaMs,
    });
    writeSupervisorState(runId, { state: cli.command, controlResult: result.ok ? "accepted" : result.reason }, config.logsRoot);
    print({ ok: result.ok, runId, control: cli.command, result }, cli.json);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  throw new Error(`Unhandled command: ${cli.command}`);
}

async function submit(cli, config) {
  const profile = resolveProfile(cli.profile, config.logsRoot);
  const runId = generateRunId();
  const initialOriginMainSha = getRefSha("origin/main");
  const specResult = buildRunSpec({
    runId,
    maxTasks: cli.maxTasks,
    maxRuntime: cli.maxRuntime,
    mode: cli.mode,
    profile: profile.profile,
    initialOriginMainSha,
    requestedBy: "operator",
    allowMissingConfig: cli.dryRun,
    logsRoot: config.logsRoot,
  });
  const specSha256 = sha256Text(canonicalJson(specResult.spec));
  const plan = buildSystemdStartPlan(runId);
  const runnerArgv = runnerArgvForSpec(specResult.spec);
  const heartbeat = buildHeartbeat({
    runId,
    state: "submitted",
    maxTasks: specResult.spec.maxTasks,
    maxRuntime: specResult.spec.maxRuntime,
  });
  const derivedPaths = deriveSupervisorPaths({ runId, logsRoot: config.logsRoot });
  const rendered = {
    ok: true,
    dryRun: cli.dryRun,
    runId,
    unitName: plan.unitName,
    state: cli.dryRun ? "dry_run" : "submitted",
    profile: profile.profile,
    maxTasks: specResult.spec.maxTasks,
    maxRuntime: specResult.spec.maxRuntime,
    initialOriginMainSha,
    spec: specResult.spec,
    specPath: specPathForRunId(runId, config.logsRoot),
    specSha256,
    configSha256: specResult.config.sha256,
    configExists: specResult.config.exists,
    runnerArgv,
    storageKey: derivedPaths.runStorageKey,
    statePath: derivedPaths.artifactPath(runArtifactKinds.state),
    heartbeatPath: derivedPaths.artifactPath(runArtifactKinds.heartbeat),
    heartbeat,
    monitoringEventShapes: ["submitted", "started", "heartbeat", "completed", "partial", "blocked", "failed", "cancelled"].map((event) => ({
      event,
      runId,
      state: event,
      payload: "sanitized bounded JSON",
    })),
    statusCommand: `node tools/auto-runner/settleora-auto-runnerctl.mjs status --run ${runId} --json`,
  };
  if (cli.dryRun) return rendered;

  const status = getStatusShort();
  if (status) throw new Error("Refusing supervisor submit with a dirty worktree");
  const runnerStatus = spawnSync(process.execPath, ["tools/auto-runner/settleora-auto-runner.mjs", "--status", "--json"], {
    cwd: config.repoRoot,
    encoding: "utf8",
  });
  if (runnerStatus.status !== 0) throw new Error("Unable to read existing runner status");
  const parsedRunnerStatus = JSON.parse(runnerStatus.stdout);
  if (parsedRunnerStatus.active || parsedRunnerStatus.lock?.exists) throw new Error("Existing runner is active or locked");
  const readiness = spawnSync(process.execPath, ["tools/auto-runner/settleora-auto-runner.mjs", "--readiness", "--config", profile.runnerConfigPath], {
    cwd: config.repoRoot,
    encoding: "utf8",
  });
  if (readiness.status !== 0) throw new Error("Runner readiness failed for selected config");
  const written = writeImmutableRunSpec(specResult.spec, config.logsRoot);
  const state = writeSupervisorState(runId, {
    state: "submitted",
    createdAt: specResult.spec.createdAt,
    specPath: written.specPath,
    specSha256: written.specSha256,
    runnerConfigSha256: specResult.config.sha256,
    unitName: plan.unitName,
    maxTasks: specResult.spec.maxTasks,
    maxRuntime: specResult.spec.maxRuntime,
    initialOriginMainSha,
  }, config.logsRoot);
  recordMonitoringEvent("submitted", { ...heartbeat, runId }, { logsRoot: config.logsRoot });
  const start = startUserUnit(runId);
  if (!start.ok) {
    writeSupervisorState(runId, { state: "submission_failed", submissionFailure: start.stderr }, config.logsRoot);
    return { ...rendered, ok: false, state: "submission_failed", start };
  }
  writeSupervisorState(runId, { state: start.state }, config.logsRoot);
  return { ...rendered, dryRun: false, state: start.state, statePath: state.statePath, start };
}

function parseCtlArgs(argv) {
  const cli = {
    command: argv[0],
    dryRun: false,
    json: false,
    latest: false,
    runId: null,
    profile: "default",
    maxTasks: 1,
    maxRuntime: "3h",
    mode: "canary",
    maxTasksDelta: null,
    maxRuntimeDeltaMs: null,
  };
  if (!cli.command) throw new Error("Missing command");
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") cli.dryRun = true;
    else if (arg === "--json") cli.json = true;
    else if (arg === "--latest") cli.latest = true;
    else if (arg === "--run") cli.runId = readValue(argv, ++index, arg);
    else if (arg === "--profile") cli.profile = readValue(argv, ++index, arg);
    else if (arg === "--mode") cli.mode = readValue(argv, ++index, arg);
    else if (arg === "--max-tasks") {
      const raw = readValue(argv, ++index, arg);
      if (cli.command === "extend") {
        if (!/^\+\d+$/.test(raw)) throw new Error("--max-tasks extension must use +N");
        cli.maxTasksDelta = Number.parseInt(raw.slice(1), 10);
        if (!Number.isSafeInteger(cli.maxTasksDelta) || cli.maxTasksDelta < 1 || cli.maxTasksDelta > 500) {
          throw new Error("--max-tasks extension must be between +1 and +500");
        }
      } else {
        cli.maxTasks = Number.parseInt(raw, 10);
      }
    } else if (arg === "--max-runtime") {
      const raw = readValue(argv, ++index, arg);
      if (cli.command === "extend") {
        if (!/^\+\d+(m|h|d)$/i.test(raw)) throw new Error("--max-runtime extension must use +Nh style syntax");
        cli.maxRuntimeDeltaMs = durationToMs(raw.slice(1));
        if (cli.maxRuntimeDeltaMs < 60 * 1000 || cli.maxRuntimeDeltaMs > 14 * 24 * 60 * 60 * 1000) {
          throw new Error("--max-runtime extension must be between +1m and +14d");
        }
      } else {
        cli.maxRuntime = raw;
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!["submit", "status", "list", "report", "health", "pause", "stop-after-current", "extend"].includes(cli.command)) {
    throw new Error(`Unknown command: ${cli.command}`);
  }
  if (["status", "report"].includes(cli.command) && !cli.runId && !cli.latest) cli.latest = true;
  if (["health", "pause", "stop-after-current", "extend"].includes(cli.command) && !cli.runId) throw new Error(`${cli.command} requires --run <run-id>`);
  return cli;
}

function resolveRunSelection(cli, logsRoot) {
  if (cli.runId) return cli.runId;
  const latest = latestSupervisorRun(logsRoot);
  if (!latest) throw new Error("No supervisor runs found");
  return latest.runId;
}

export function classifyHealth(state, heartbeat) {
  if (!state.found) return { ok: false, status: "missing", exitCode: 4 };
  if (!heartbeat.found) return { ok: false, status: "missing_heartbeat", exitCode: 4, state: state.state };
  if (heartbeat.stale) return { ok: false, status: "stale", exitCode: 3, state: state.state, heartbeat: heartbeat.heartbeat };
  const current = state.state?.state || heartbeat.heartbeat.state;
  const report = supervisorReport(state.state);
  if (current === "completed") {
    if (!report.reportPath || report.reportResolution?.status !== "matched") {
      return {
        ok: false,
        status: "report_mapping_missing",
        exitCode: 2,
        state: state.state,
        heartbeat: heartbeat.heartbeat,
        report,
      };
    }
    return { ok: true, status: "terminal_success", exitCode: 0, state: state.state, heartbeat: heartbeat.heartbeat, report };
  }
  if (["partial", "blocked", "failed", "cancelled", "submission_failed"].includes(current)) {
    return { ok: false, status: "terminal_unhealthy", exitCode: 2, state: state.state, heartbeat: heartbeat.heartbeat, report };
  }
  return { ok: true, status: "active", exitCode: 0, state: state.state, heartbeat: heartbeat.heartbeat };
}

function supervisorReport(state) {
  return {
    runnerRunId: state?.runnerRunId || null,
    reportPath: reportPathForRun(state),
    runnerSummaryJsonPath: state?.runnerSummaryJsonPath || null,
    runnerSummaryMarkdownPath: state?.runnerSummaryMarkdownPath || null,
    reportResolution: state?.reportResolution || null,
  };
}

function print(result, json) {
  if (json || result?.heartbeat) console.log(JSON.stringify(result, null, 2));
  else if (Array.isArray(result.runs)) console.log(result.runs.map((run) => `${run.runId} ${run.state}`).join("\n"));
  else console.log(JSON.stringify(result, null, 2));
}

function readValue(argv, index, name) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function durationToMs(value) {
  const match = String(value).match(/^(\d+)(m|h|d)$/i);
  if (!match) throw new Error("Invalid duration");
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
