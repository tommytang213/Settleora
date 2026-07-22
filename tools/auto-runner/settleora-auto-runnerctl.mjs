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
  classifySupervisorLifecycleState,
  readSupervisorState,
  reportPathForRun,
  unitNameForRunId,
  writeSupervisorState,
} from "./supervisor/supervisor-state.mjs";
import { loadConfig } from "./lib/config.mjs";
import { getRunnerStatus, writeControlCommand } from "./lib/control-plane.mjs";
import { evaluateSupervisorControlPolicy } from "./supervisor/control-policy.mjs";
import { buildOperationalStatusProjection, renderOperationalStatusMarkdown } from "./lib/operational-status-projection.mjs";

async function main() {
  const cli = parseCtlArgs(process.argv.slice(2));
  const config = loadConfig({ dryRun: true, run: false, configPath: null });
  if (cli.command === "submit") {
    const result = await submit(cli, config);
    print(result, cli.json);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  if (cli.command === "export-status" && cli.json && cli.markdown) throw new Error("export-status accepts exactly one output format");
  if (cli.command !== "export-status" && cli.markdown) throw new Error("--markdown is supported only by export-status");
  if (cli.command === "list") {
    print({ ok: true, runs: listSupervisorRuns(config.logsRoot) }, cli.json);
    return;
  }
  if (cli.command === "export-status") {
    const projection = await buildOperationalStatusProjection(createProjectionAdapters(config));
    if (cli.markdown) process.stdout.write(renderOperationalStatusMarkdown(projection));
    else console.log(JSON.stringify(projection, null, 2));
    process.exitCode = projection.status === "blocked" ? 2 : 0;
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
    const result = controlSupervisorRun(runId, cli, config);
    print(result, cli.json);
    process.exitCode = result.exitCode;
    return;
  }
  throw new Error(`Unhandled command: ${cli.command}`);
}

export function controlSupervisorRun(runId, cli, config, deps = {}) {
  const readState = deps.readSupervisorState || readSupervisorState;
  const getStatus = deps.getRunnerStatus || getRunnerStatus;
  const writeControl = deps.writeControlCommand || writeControlCommand;
  const writeState = deps.writeSupervisorState || writeSupervisorState;
  const now = deps.now || (() => new Date());

  const supervisorState = readState(runId, config.logsRoot);
  if (!supervisorState.found) {
    return { ok: false, exitCode: 2, reason: "unknown_run", runId, command: cli.command };
  }

  const lifecycleState = supervisorState.state?.state || null;
  const controlConfig = { ...config, logsRoot: defaultLogsRoot };
  const runnerStatus = getStatus(controlConfig);
  const decision = evaluateSupervisorControlPolicy({
    supervisorRunId: runId,
    lifecycleState,
    runnerStatus,
    command: cli.command,
    maxTasksDelta: cli.maxTasksDelta,
    maxRuntimeDeltaMs: cli.maxRuntimeDeltaMs,
  });
  const responseBase = {
    runId,
    command: cli.command,
    lifecycleState,
    allowed: decision.allowed,
    accepted: false,
    idempotent: decision.idempotent,
    reason: decision.reason,
    correlation: decision.correlation,
  };

  if (!decision.allowed) {
    return { ok: false, exitCode: decision.reason === "unknown_control_command" ? 2 : 1, ...responseBase };
  }

  if (decision.idempotent) {
    return { ok: true, exitCode: 0, ...responseBase, accepted: true };
  }

  const writeResult = writeControl(controlConfig, {
    controlCommand: cli.command === "stop-after-current" ? "stop-after-current" : cli.command,
    maxIterationsExtension: cli.maxTasksDelta,
    maxRuntimeExtensionMs: cli.maxRuntimeDeltaMs,
  });
  const lastControl = buildLastControlMetadata({
    command: cli.command,
    requestedAt: now().toISOString(),
    status: writeResult.ok ? "accepted" : "failed",
    reason: writeResult.ok ? decision.reason : writeResult.reason || "control_write_failed",
    maxTasksDelta: cli.maxTasksDelta,
    maxRuntimeDeltaMs: cli.maxRuntimeDeltaMs,
    correlation: decision.correlation,
  });
  writeState(runId, { lastControl }, config.logsRoot);
  return {
    ok: writeResult.ok,
    exitCode: writeResult.ok ? 0 : 1,
    ...responseBase,
    accepted: writeResult.ok,
    reason: writeResult.ok ? decision.reason : writeResult.reason || "control_write_failed",
    control: lastControl,
  };
}

function buildLastControlMetadata({
  command,
  requestedAt,
  status,
  reason,
  maxTasksDelta,
  maxRuntimeDeltaMs,
  correlation,
}) {
  return {
    command,
    requestedAt,
    status,
    reason,
    maxTasksDelta: Number.isSafeInteger(maxTasksDelta) ? maxTasksDelta : null,
    maxRuntimeDeltaMs: Number.isSafeInteger(maxRuntimeDeltaMs) ? maxRuntimeDeltaMs : null,
    correlation: {
      selectedSupervisorRunId: correlation.selectedSupervisorRunId,
      activeSupervisorRunId: correlation.activeSupervisorRunId,
      activeRunId: correlation.activeRunId,
      matched: correlation.matched,
    },
  };
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
    markdown: false,
  };
  if (!cli.command) throw new Error("Missing command");
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") cli.dryRun = true;
    else if (arg === "--json") cli.json = true;
    else if (arg === "--markdown") cli.markdown = true;
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
  if (!["submit", "status", "list", "report", "health", "pause", "stop-after-current", "extend", "export-status"].includes(cli.command)) {
    throw new Error(`Unknown command: ${cli.command}`);
  }
  if (["status", "report"].includes(cli.command) && !cli.runId && !cli.latest) cli.latest = true;
  if (["health", "pause", "stop-after-current", "extend"].includes(cli.command) && !cli.runId) throw new Error(`${cli.command} requires --run <run-id>`);
  return cli;
}

export function createProjectionAdapters(config, deps = {}) {
  const run = deps.spawnSync || spawnSync;
  const statusReader = deps.getRunnerStatus || getRunnerStatus;
  const supervisorReader = deps.readSupervisorProjection || readProjectionSupervisor;
  let cachedStatus;
  const runnerStatus = () => (cachedStatus ||= statusReader(config));
  const gitRead = (args) => {
    const result = run("git", ["--no-optional-locks", ...args], { cwd: config.repoRoot, encoding: "utf8" });
    return result.status === 0 && !result.error ? { ok: true, value: String(result.stdout || "").trim() } : { ok: false };
  };
  return {
    repository: { read: () => {
      const branch = gitRead(["branch", "--show-current"]);
      const head = gitRead(["rev-parse", "HEAD"]);
      const main = gitRead(["rev-parse", "origin/main"]);
      const status = gitRead(["status", "--porcelain=v1"]);
      if ([branch, head, main, status].some((entry) => !entry.ok)) return { ok: false, reasonCode: "repository_read_failed" };
      return { repositorySlug: config.repositorySlug, currentBranch: branch.value, headSha: head.value, originMainSha: main.value, clean: status.value === "" };
    } },
    github: { read: () => readProjectionGithub(config, runnerStatus(), run) },
    local: { read: () => {
      const projected = projectRunnerStatus(runnerStatus());
      const supervisor = supervisorReader(config, runnerStatus());
      if (supervisor?.ok === false) return supervisor;
      projected.supervisor = supervisor?.value || {};
      return projected;
    } },
    ledger: { read: () => readProjectionLedger(gitRead, runnerStatus()) },
  };
}

function readProjectionLedger(gitRead, status) {
  const ledger = gitRead(["show", "HEAD:docs/planning/ISSUE_PROGRESS_LEDGER.md"]);
  if (!ledger.ok) return { ok: false, reasonCode: "ledger_read_failed" };
  const issueNumber = Number(status.currentOrLastIssue?.number);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) return { issueState: null, stale: null };
  if (ledger.value.length > 1024 * 1024) return { ok: false, reasonCode: "ledger_read_too_large" };
  const relevantLines = ledger.value.split("\n").filter((line) => [...line.matchAll(/#([1-9]\d{0,8})\b/g)].some((match) => Number(match[1]) === issueNumber)).slice(0, 100).map((line) => line.slice(0, 240));
  const open = relevantLines.some((line) => /\b(?:remains|is|stays) open\b/i.test(line));
  const closed = relevantLines.some((line) => /\b(?:is |was )?closed\b/i.test(line));
  if (open && closed) return { ok: false, reasonCode: "ledger_issue_posture_ambiguous" };
  const observedMainSha = ledger.value.match(/(?:merge commit\/current main|current main(?: sha)?)[^0-9a-f]{0,100}`?([0-9a-f]{40})/i)?.[1] || null;
  return { issueState: open ? "OPEN" : closed ? "CLOSED" : null, observedMainSha, stale: null };
}

function readProjectionSupervisor(config, status) {
  const runId = status.supervisorRunId;
  if (!runId) return { ok: true, value: {} };
  const stateResult = readSupervisorState(runId, config.logsRoot);
  if (!stateResult.found || !stateResult.state) return { ok: false, reasonCode: "supervisor_state_read_failed" };
  let heartbeatResult;
  try { heartbeatResult = readHeartbeat(runId, config.logsRoot); } catch { return { ok: false, reasonCode: "supervisor_heartbeat_read_failed" }; }
  const state = stateResult.state;
  const heartbeat = heartbeatResult.heartbeat;
  if (state.runId !== runId || (heartbeat && heartbeat.runId !== runId)) return { ok: false, reasonCode: "supervisor_identity_conflict" };
  if (status.active && !state.runnerRunId) return { ok: false, reasonCode: "active_supervisor_runner_correlation_missing" };
  if (status.active && !heartbeat) return { ok: false, reasonCode: "active_supervisor_heartbeat_missing" };
  if (status.active && heartbeatResult.stale) return { ok: false, reasonCode: "active_supervisor_heartbeat_stale" };
  if (status.active && heartbeat?.terminal) return { ok: false, reasonCode: "active_supervisor_terminal_conflict" };
  if (status.activeRunId && state.runnerRunId && status.activeRunId !== state.runnerRunId) return { ok: false, reasonCode: "supervisor_runner_identity_conflict" };
  if (heartbeat?.runnerRunId && state.runnerRunId && heartbeat.runnerRunId !== state.runnerRunId) return { ok: false, reasonCode: "supervisor_heartbeat_identity_conflict" };
  return { ok: true, value: { runId, state: state.state, heartbeatPosture: !heartbeat ? "missing" : heartbeat.terminal ? "terminal" : heartbeatResult.stale ? "stale" : "fresh", leasePosture: !heartbeat ? "missing" : heartbeat.terminal ? "terminal" : heartbeatResult.stale ? "expired" : "valid", reportCorrelation: state.runnerRunId || null } };
}

function readProjectionGithub(config, status, run) {
  const issueNumber = status.currentOrLastIssue?.number;
  const prNumber = status.currentOrLastPr?.number;
  const result = { repositorySlug: config.repositorySlug };
  if (Number.isSafeInteger(Number(issueNumber)) && Number(issueNumber) > 0) {
    const issue = readGhJson(run, config, ["issue", "view", String(issueNumber), "--repo", config.repositorySlug, "--json", "number,state,labels"]);
    if (!issue) return { ok: false, reasonCode: "github_issue_read_failed" };
    result.issue = { number: issue.number, state: issue.state, manualGate: (issue.labels || []).some((label) => ["manual-gate", "needs-tommy"].includes(label.name)), dangerGate: (issue.labels || []).some((label) => label.name === "danger-gate") };
  }
  if (Number.isSafeInteger(Number(prNumber)) && Number(prNumber) > 0) {
    const pr = readGhJson(run, config, ["pr", "view", String(prNumber), "--repo", config.repositorySlug, "--json", "number,state,headRefName,headRefOid,baseRefName"]);
    if (!pr) return { ok: false, reasonCode: "github_pr_read_failed" };
    result.pr = { number: pr.number, state: pr.state, headRefName: pr.headRefName, headSha: pr.headRefOid, baseRefName: pr.baseRefName };
  }
  return result;
}

function readGhJson(run, config, args) {
  const response = run("gh", args, { cwd: config.repoRoot, encoding: "utf8" });
  if (response.status !== 0 || response.error) return null;
  try { return JSON.parse(response.stdout || "{}"); } catch { return null; }
}

function projectRunnerStatus(status = {}) {
  const issue = status.currentOrLastIssue || {};
  const pr = status.currentOrLastPr || {};
  const projection = status.operationalProjection || {};
  return {
    active: status.active === true,
    status: status.active ? "active" : status.latestTerminalOutcome || "idle",
    task: {
      logicalTaskKey: projection.counters?.acceptedTaskBudget?.chargeIdentity || status.activeRunId || null,
      runId: status.activeRunId || null,
      issueNumber: issue.number || null,
      branch: pr.headRefName || null,
      baseBranch: pr.baseRefName || null,
      headSha: pr.headSha || null,
      prNumber: pr.number || null,
    },
    lifecycle: projection.lifecycle || { phase: status.stopReason || null, terminalPosture: status.latestTerminalOutcome || null },
    counters: projection.counters || {},
    recovery: projection.recovery || {},
    session: projection.session || {},
    review: projection.review || {},
    largeCandidate: projection.largeCandidate || {},
    effects: projection.effects || {},
    supervisor: status.supervisor || {},
    blockers: status.blockers || [],
    nextSafeAction: projection.nextSafeAction || null,
  };
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
  if (classifySupervisorLifecycleState(current) === "terminal") {
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
