import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { unitNameForRunId } from "./supervisor-state.mjs";
import { validateRunId } from "./run-spec.mjs";
import { absoluteRuntimeEntry, moduleRuntimeRoot } from "../lib/runtime-identity.mjs";

export function buildSystemdStartPlan(runId, { runtimeRoot = moduleRuntimeRoot(), configPath = null, repoRoot = null, logsRoot = null } = {}) {
  validateRunId(runId);
  if (configPath !== null) validateSystemdPath(configPath, "configPath");
  const safeRepoRoot = validateSystemdPath(repoRoot, "repoRoot");
  const safeLogsRoot = validateSystemdPath(logsRoot, "logsRoot");
  const safeRuntimeRoot = validateSystemdPath(runtimeRoot, "runtimeRoot");
  absoluteRuntimeEntry(safeRuntimeRoot, "supervisor/settleora-auto-runner-worker.mjs");
  const launcher = path.join(path.dirname(safeRuntimeRoot), `.${path.basename(safeRuntimeRoot)}.launcher.mjs`);
  const unitTemplate = readFileSync(absoluteRuntimeEntry(safeRuntimeRoot, "systemd/settleora-auto-runner@.service"), "utf8");
  return {
    unitName: unitNameForRunId(runId),
    expectedExecArgv: [
      "/usr/bin/env", "node", launcher, "--runtime-root", safeRuntimeRoot, "--entry", "supervisor/settleora-auto-runner-worker.mjs", "--",
      runId, "--logs-root", safeLogsRoot,
    ],
    unitTemplate,
    reloadArgv: ["systemctl", "--user", "daemon-reload"],
    inspectArgv: ["systemctl", "--user", "cat", unitNameForRunId(runId), "--no-pager"],
    inspectExecArgv: ["systemctl", "--user", "show", unitNameForRunId(runId), "--property=ExecStart", "--value"],
    startArgv: ["systemctl", "--user", "start", unitNameForRunId(runId)],
    isActiveArgv: ["systemctl", "--user", "is-active", unitNameForRunId(runId)],
    showArgv: ["systemctl", "--user", "show", unitNameForRunId(runId), "--property=ActiveState,SubState,Result"],
  };
}

function validateSystemdPath(value, label) {
  if (
    typeof value !== "string"
    || !/^\/[A-Za-z0-9._/-]+$/u.test(value)
    || path.normalize(value) !== value
    || value.includes("//")
    || value.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`canonical shell-neutral supervisor ${label} is required`);
  }
  return value;
}

export function startUserUnit(runId, { runner = spawnSync, waitMs = 5000, runtimeRoot, configPath, repoRoot, logsRoot } = {}) {
  const plan = buildSystemdStartPlan(runId, { runtimeRoot, configPath, repoRoot, logsRoot });
  const reloaded = runner(plan.reloadArgv[0], plan.reloadArgv.slice(1), { encoding: "utf8", windowsHide: true });
  if (reloaded.error || reloaded.status !== 0) {
    return { ok: false, unitName: plan.unitName, state: "submission_failed", status: reloaded.status, stderr: "supervisor unit reload failed" };
  }
  const inspected = runner(plan.inspectArgv[0], plan.inspectArgv.slice(1), { encoding: "utf8", windowsHide: true });
  const installedUnit = String(inspected.stdout || "").replace(/^# \/[^\n]+\n/u, "");
  if (inspected.error || inspected.status !== 0 || installedUnit !== plan.unitTemplate) {
    return { ok: false, unitName: plan.unitName, state: "submission_failed", status: inspected.status, stderr: "installed supervisor unit identity mismatch" };
  }
  const inspectedExec = runner(plan.inspectExecArgv[0], plan.inspectExecArgv.slice(1), { encoding: "utf8", windowsHide: true });
  const execMatch = /argv\[\]=([^;]+)\s+;/u.exec(String(inspectedExec.stdout || ""));
  const loadedArgv = execMatch ? execMatch[1].trim().split(/\s+/u) : [];
  if (inspectedExec.error || inspectedExec.status !== 0 || JSON.stringify(loadedArgv) !== JSON.stringify(plan.expectedExecArgv)) {
    return { ok: false, unitName: plan.unitName, state: "submission_failed", status: inspectedExec.status, stderr: "loaded supervisor unit identity mismatch" };
  }
  const start = runner(plan.startArgv[0], plan.startArgv.slice(1), { encoding: "utf8", windowsHide: true });
  if (start.error || start.status !== 0) {
    return { ok: false, unitName: plan.unitName, state: "submission_failed", status: start.status, stderr: start.stderr || start.error?.message || "" };
  }
  const deadline = Date.now() + waitMs;
  let active = null;
  do {
    active = runner(plan.isActiveArgv[0], plan.isActiveArgv.slice(1), { encoding: "utf8", windowsHide: true });
    const text = String(active.stdout || "").trim();
    if (["active", "activating"].includes(text)) {
      return { ok: true, unitName: plan.unitName, state: text === "active" ? "running" : "starting" };
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  } while (Date.now() < deadline);
  return { ok: false, unitName: plan.unitName, state: "submission_failed", status: active?.status ?? null, stderr: active?.stderr || "unit did not become active" };
}

export function runnerArgvForSpec(spec, { runnerRunId = null, runtimeRoot = moduleRuntimeRoot(), logsRoot } = {}) {
  const configPath = spec.runnerConfigPath;
  const argv = [
    process.execPath,
    absoluteRuntimeEntry(runtimeRoot, "settleora-auto-runner.mjs"),
    "--run",
    "--supervisor-run-id",
    spec.runId,
    "--config",
    configPath,
    "--expected-config-sha256",
    spec.runnerConfigSha256,
    "--max-iterations",
    String(spec.maxTasks),
    "--max-runtime",
    spec.maxRuntime,
  ];
  if (runnerRunId) argv.splice(argv.indexOf("--config"), 0, "--runner-run-id", runnerRunId);
  if (spec.recoveryOnlyTarget) {
    if (spec.recoveryOnlyTarget.prNumber === null || spec.recoveryOnlyTarget.prHeadSha === null) {
      throw new Error("recovery-only target requires PR number/head SHA");
    }
    argv.push(
      "--outage-recovery-only",
      "--outage-target-task-key",
      spec.recoveryOnlyTarget.taskKey,
      "--outage-target-issue",
      String(spec.recoveryOnlyTarget.issueNumber),
      "--outage-target-branch",
      spec.recoveryOnlyTarget.branchName,
      "--outage-target-base-sha",
      spec.recoveryOnlyTarget.baseSha,
      "--outage-target-head-sha",
      spec.recoveryOnlyTarget.currentHeadSha,
      "--outage-target-runner-run-id",
      spec.recoveryOnlyTarget.runnerRunId,
      "--outage-target-supervisor-run-id",
      spec.recoveryOnlyTarget.supervisorRunId,
      "--outage-target-original-spec-digest",
      spec.recoveryOnlyTarget.originalSupervisorSpecDigest,
      "--outage-target-marker-key",
      spec.recoveryOnlyTarget.markerKey,
      "--outage-target-fingerprint",
      spec.recoveryOnlyTarget.outageFingerprint,
      "--outage-target-attempt",
      String(spec.recoveryOnlyTarget.attemptNumber),
    );
    argv.push(
      "--outage-target-pr",
      String(spec.recoveryOnlyTarget.prNumber),
      "--outage-target-pr-head-sha",
      spec.recoveryOnlyTarget.prHeadSha,
    );
  }
  if (spec.mode === "canary") argv.splice(3, 0, "--canary");
  return argv;
}
