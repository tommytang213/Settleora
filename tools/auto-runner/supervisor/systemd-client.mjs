import { spawnSync } from "node:child_process";
import { unitNameForRunId } from "./supervisor-state.mjs";
import { resolveProfile, validateRunId } from "./run-spec.mjs";

export function buildSystemdStartPlan(runId) {
  validateRunId(runId);
  return {
    unitName: unitNameForRunId(runId),
    startArgv: ["systemctl", "--user", "start", unitNameForRunId(runId)],
    isActiveArgv: ["systemctl", "--user", "is-active", unitNameForRunId(runId)],
    showArgv: ["systemctl", "--user", "show", unitNameForRunId(runId), "--property=ActiveState,SubState,Result"],
  };
}

export function startUserUnit(runId, { runner = spawnSync, waitMs = 5000 } = {}) {
  const plan = buildSystemdStartPlan(runId);
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

export function runnerArgvForSpec(spec) {
  const configPath = resolveProfile(spec.profile).runnerConfigPath;
  const argv = [
    process.execPath,
    "tools/auto-runner/settleora-auto-runner.mjs",
    "--run",
    "--supervisor-run-id",
    spec.runId,
    "--config",
    configPath,
    "--max-iterations",
    String(spec.maxTasks),
    "--max-runtime",
    spec.maxRuntime,
  ];
  if (spec.mode === "canary") argv.splice(3, 0, "--canary");
  return argv;
}
