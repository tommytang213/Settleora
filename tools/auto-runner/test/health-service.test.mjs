import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultLogsRoot } from "../lib/config.mjs";
import {
  createAutoRunnerHealthServer,
  evaluateAutoRunnerHealth,
  healthRoute,
  validateHealthServiceConfig,
  validateHealthServiceConfigWithFixedRoot,
} from "../lib/health-service.mjs";
import {
  claimTerminalNotification,
  defaultNotifierStatePath,
  readNotifierState,
} from "../lib/notifier-dedupe-state.mjs";
import { buildHeartbeat } from "../supervisor/heartbeat.mjs";
import { storageKeyForLogicalId } from "../supervisor/supervisor-paths.mjs";

const baseSha = "a".repeat(40);
const defaultNow = new Date("2026-07-12T06:00:00.000Z");

test("auto-runner health initializes healthy with no history and no lock", () => {
  withLogs((logsRoot) => {
    const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 200);
    assert.equal(result.body.status, "healthy");
    assert.equal(result.body.mode, "initializing");
    assert.equal(result.body.reasonCode, "initializing");
    assert.equal(result.body.runner.lockPresent, false);
  });
});

test("auto-runner health fails closed on corrupt canonical outage state inventory", () => {
  withLogs((logsRoot) => {
    const root = path.join(logsRoot, "recovery", "outage-resubmission");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(root, `${"a".repeat(64)}.json`), "{not-json", { mode: 0o600 });
    const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "malformed_state");
    assert.equal(result.body.outageResubmission.operatorActionRequired, true);
    assert.equal(result.body.outageResubmission.recordCount, 1);
    assert.equal(result.body.outageResubmission.invalidRecordCount, 1);
    assert.equal(result.body.outageResubmission.validRecordCount, 0);
    assert.equal(JSON.stringify(result.body).includes("{not-json"), false);
    assert.equal(JSON.stringify(result.body).includes(root), false);
  });
});

test("auto-runner health fails closed on untrusted canonical outage state inventory", () => {
  withLogs((logsRoot) => {
    const root = path.join(logsRoot, "recovery", "outage-resubmission");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const target = path.join(root, "target.json");
    writeFileSync(target, "{}\n", { mode: 0o600 });
    symlinkSync(target, path.join(root, `${"b".repeat(64)}.json`));
    const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "untrusted_state");
    assert.equal(result.body.outageResubmission.reasonCode, "untrusted_state");
    assert.equal(result.body.outageResubmission.operatorActionRequired, true);
    assert.equal(result.body.outageResubmission.recordCount, 1);
    assert.equal(result.body.outageResubmission.invalidRecordCount, 1);
    assert.equal(JSON.stringify(result.body).includes(target), false);
  });
});

test("auto-runner health fails closed on intermediate outage state symlink without leaking paths", () => {
  withLogs((logsRoot) => {
    const external = mkdtempSync(path.join(tmpdir(), "settleora-health-outage-external-"));
    try {
      symlinkSync(external, path.join(logsRoot, "recovery"));
      const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
      assert.equal(result.httpStatus, 503);
      assert.equal(result.body.reasonCode, "untrusted_state");
      assert.equal(result.body.outageResubmission.reasonCode, "untrusted_state");
      assert.equal(result.body.outageResubmission.operatorActionRequired, true);
      assert.equal(JSON.stringify(result.body).includes(external), false);
      assert.equal(JSON.stringify(result.body).includes(logsRoot), false);
    } finally {
      rmSync(external, { recursive: true, force: true });
    }
  });
});

test("auto-runner health surfaces sanitized outage status from runner status", () => {
  withLogs((logsRoot) => {
    const result = evaluateAutoRunnerHealth({
      logsRoot,
      now: defaultNow,
      runnerStatus: {
        active: false,
        activeRunId: null,
        supervisorRunId: null,
        outageResubmission: {
          enabled: true,
          defaultOff: false,
          activeSourceRun: "supervised-20260712T055900Z-aaaaaaaaaaaa",
          attemptCount: 1,
          maxAttempts: 3,
          nextEligibleAt: "2026-07-12T06:05:00.000Z",
          deadlineAt: "2026-07-12T07:00:00.000Z",
          circuitState: "half_open",
          lastSanitizedReason: "github_api_5xx",
          childRunId: null,
          terminalOutcome: null,
          recordCount: 1,
        },
      },
    });
    assert.equal(result.httpStatus, 200);
    assert.equal(result.body.outageResubmission.enabled, true);
    assert.equal(result.body.outageResubmission.circuitState, "half_open");
    assert.equal(result.body.outageResubmission.lastSanitizedReason, "github_api_5xx");
  });
});

test("auto-runner health classifies fresh active heartbeat as healthy active", () => {
  withLogs((logsRoot) => {
    const runId = writeRun(logsRoot, {
      state: "running",
      runnerRunId: "run-2026-07-12T055900Z",
      heartbeatAt: "2026-07-12T05:59:00.000Z",
    });
    const result = evaluateAutoRunnerHealth({
      logsRoot,
      now: defaultNow,
      runnerStatus: { active: true, activeRunId: "run-2026-07-12T055900Z", supervisorRunId: runId },
    });
    assert.equal(result.httpStatus, 200);
    assert.equal(result.body.mode, "active");
    assert.equal(result.body.reasonCode, "active_fresh");
    assert.equal(result.body.heartbeat.heartbeatLeaseSeconds, 300);
  });
});

test("auto-runner health requires active runner supervisor correlation", () => {
  withLogs((logsRoot) => {
    writeRun(logsRoot, {
      state: "running",
      runnerRunId: "run-2026-07-12T055900Z",
      heartbeatAt: "2026-07-12T05:59:00.000Z",
    });
    const result = evaluateAutoRunnerHealth({
      logsRoot,
      now: defaultNow,
      runnerStatus: { active: true, activeRunId: "run-2026-07-12T055900Z", supervisorRunId: null },
    });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "runner_disappeared");
  });
});

test("auto-runner health returns stale heartbeat only while active", () => {
  withLogs((logsRoot) => {
    const runId = writeRun(logsRoot, {
      state: "running",
      runnerRunId: "run-2026-07-12T055000Z",
      heartbeatAt: "2026-07-12T05:50:00.000Z",
    });
    const result = evaluateAutoRunnerHealth({
      logsRoot,
      now: defaultNow,
      runnerStatus: { active: true, activeRunId: "run-2026-07-12T055000Z", supervisorRunId: runId },
    });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "stale_heartbeat");
  });
});

test("auto-runner health keeps successful terminal runs healthy indefinitely", () => {
  withLogs((logsRoot) => {
    writeRun(logsRoot, {
      state: "completed",
      runnerRunId: "run-2026-07-12T050000Z",
      heartbeatAt: "2026-07-12T05:05:00.000Z",
      finishedAt: "2026-07-12T05:05:00.000Z",
      summary: { iterations: [{ outcome: "auto_merged", pr: { number: 882 }, autoMerge: { mergeSha: "b".repeat(40) } }] },
    });
    const result = evaluateAutoRunnerHealth({ logsRoot, now: new Date("2026-07-30T00:00:00.000Z") });
    assert.equal(result.httpStatus, 200);
    assert.equal(result.body.mode, "idle");
    assert.equal(result.body.reasonCode, "terminal_success");
    assert.equal(result.body.summary.prsMerged, 1);
  });
});

test("auto-runner health treats no eligible work and budget exhaustion as healthy idle", () => {
  withLogs((logsRoot) => {
    writeRun(logsRoot, {
      runId: "supervised-20260712T050000Z-000000000001",
      state: "completed",
      runnerRunId: "run-2026-07-12T050000Z",
      stopReason: "no-eligible-work",
      summary: { stopReason: "no-eligible-work", iterations: [{ outcome: "no_eligible_work" }] },
    });
    let result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 200);
    assert.equal(result.body.reasonCode, "no_eligible_work");

    writeRun(logsRoot, {
      runId: "supervised-20260712T051000Z-000000000002",
      state: "completed",
      runnerRunId: "run-2026-07-12T051000Z",
      stopReason: "max-iterations-reached",
      summary: { stopReason: "max-iterations-reached", iterations: [{ outcome: "auto_merged" }] },
    });
    result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 200);
    assert.equal(result.body.reasonCode, "budget_exhausted_success");
  });
});

test("auto-runner health treats operator cancellation as attention when otherwise consistent", () => {
  withLogs((logsRoot) => {
    writeRun(logsRoot, {
      state: "cancelled",
      runnerRunId: null,
      terminalReason: "operator_requested",
      reportStatus: null,
      summary: null,
    });
    const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 200);
    assert.equal(result.body.mode, "attention");
    assert.equal(result.body.reasonCode, "cancelled_attention");
  });
});

test("auto-runner health classifies failed terminal states as unhealthy", () => {
  for (const [state, expected] of [
    ["failed", "terminal_failed"],
    ["submission_failed", "submission_failed"],
    ["blocked", "terminal_blocked"],
    ["partial", "terminal_partial"],
  ]) {
    withLogs((logsRoot) => {
      writeRun(logsRoot, { state, runnerRunId: null, reportStatus: null, summary: null });
      const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
      assert.equal(result.httpStatus, 503, state);
      assert.equal(result.body.reasonCode, expected, state);
    });
  }
});

test("auto-runner health fails closed for missing and ambiguous report mappings", () => {
  for (const [reportStatus, expected] of [
    [null, "report_mapping_missing"],
    ["missing", "report_mapping_missing"],
    ["multiple_matches", "report_mapping_ambiguous"],
  ]) {
    withLogs((logsRoot) => {
      writeRun(logsRoot, {
        state: "completed",
        runnerRunId: "run-2026-07-12T050000Z",
        reportStatus,
        summary: reportStatus === "matched" ? {} : null,
      });
      const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
      assert.equal(result.httpStatus, 503, reportStatus || "null");
      assert.equal(result.body.reasonCode, expected);
    });
  }
});

test("auto-runner health detects disappeared active runner and orphaned lock without deletion", () => {
  withLogs((logsRoot) => {
    writeRun(logsRoot, {
      state: "running",
      runnerRunId: "run-2026-07-12T055000Z",
      heartbeatAt: "2026-07-12T05:59:00.000Z",
    });
    let result = evaluateAutoRunnerHealth({
      logsRoot,
      now: defaultNow,
      runnerStatus: { active: false, activeRunId: null, supervisorRunId: null },
    });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "runner_disappeared");

    rmSync(path.join(logsRoot, "supervisor"), { recursive: true, force: true });
    const lockPath = path.join(logsRoot, "locks", "settleora-auto-runner.lock");
    mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
    writeFileSync(lockPath, JSON.stringify({ pid: 99999999, startedAt: "2026-07-12T05:00:00.000Z" }));
    result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "orphaned_lock");
    assert.equal(existsSync(lockPath), true);
  });
});

test("auto-runner health fails closed for untrusted, malformed, symlinked, oversized, and multiple-active state", () => {
  withLogs((logsRoot) => {
    const runId = writeRun(logsRoot, { state: "completed", runnerRunId: "run-2026-07-12T050000Z" });
    const statePath = stateFile(logsRoot, runId);
    writeFileSync(statePath, "{not json");
    const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "malformed_state");
    assert.doesNotMatch(JSON.stringify(result.body), /settleora|\/tmp|not json/);
  });

  withLogs((logsRoot) => {
    const runId = "supervised-20260712T050000Z-000000000001";
    const dir = runDir(logsRoot, runId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const outside = path.join(logsRoot, "outside.json");
    writeFileSync(outside, "{}");
    symlinkSync(outside, path.join(dir, "state.json"));
    const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "untrusted_state");
  });

  withLogs((logsRoot) => {
    const runId = writeRun(logsRoot, { state: "completed", runnerRunId: "run-2026-07-12T050000Z" });
    chmodSync(stateFile(logsRoot, runId), 0o666);
    const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "untrusted_state");
  });

  withLogs((logsRoot) => {
    const runId = "supervised-20260712T050000Z-000000000001";
    const dir = runDir(logsRoot, runId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(dir, "state.json"), `${"x".repeat(300 * 1024)}`, { mode: 0o600 });
    const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "malformed_state");
  });

  withLogs((logsRoot) => {
    writeRun(logsRoot, { runId: "supervised-20260712T050000Z-000000000001", state: "running", runnerRunId: "run-2026-07-12T050000Z" });
    writeRun(logsRoot, { runId: "supervised-20260712T050100Z-000000000002", state: "running", runnerRunId: "run-2026-07-12T050100Z" });
    const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "multiple_active_supervisors");
  });
});

test("auto-runner health reason precedence is deterministic", () => {
  withLogs((logsRoot) => {
    const runId = writeRun(logsRoot, {
      state: "running",
      runnerRunId: "run-2026-07-12T055000Z",
      heartbeatAt: "2026-07-12T05:50:00.000Z",
    });
    chmodSync(stateFile(logsRoot, runId), 0o666);
    const result = evaluateAutoRunnerHealth({
      logsRoot,
      now: defaultNow,
      runnerStatus: { active: false, activeRunId: null, supervisorRunId: null },
    });
    assert.equal(result.body.reasonCode, "untrusted_state");
  });
});

test("auto-runner health HTTP route is JSON-only, sanitized, bounded, and method/path limited", async () => {
  await withServer(async ({ baseUrl }) => {
    const ok = await fetch(`${baseUrl}${healthRoute}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "application/json");
    assert.equal(ok.headers.get("cache-control"), "no-store");
    const body = await ok.json();
    assert.equal(body.reasonCode, "initializing");
    assert.doesNotMatch(JSON.stringify(body), /SECRET|GEMINI_API_KEY|\/workspace|diff --git|prompt/i);

    const missing = await fetch(`${baseUrl}/debug/logs?path=/workspace/secret`);
    assert.equal(missing.status, 404);
    assert.doesNotMatch(await missing.text(), /workspace|secret|debug/);

    const method = await fetch(`${baseUrl}${healthRoute}`, { method: "POST" });
    assert.equal(method.status, 405);
    assert.equal(method.headers.get("allow"), "GET");
  });
});

test("production health CLI rejects filesystem path arguments", () => {
  const logsRoot = runHealthCli("--logs-root", "/tmp/evil");
  assert.notEqual(logsRoot.status, 0);
  assert.match(logsRoot.stderr, /Unknown argument: --logs-root/);

  const secretFile = runHealthCli("--secret-file", "/tmp/evil");
  assert.notEqual(secretFile.status, 0);
  assert.match(secretFile.stderr, /Unknown argument: --secret-file/);
});

test("production health config uses fixed approved logs root", () => {
  const previousLogsRoot = process.env.SETTLEORA_AUTO_RUNNER_HEALTH_LOGS_ROOT;
  const previousSecretFile = process.env.SETTLEORA_AUTO_RUNNER_HEALTH_SECRET_FILE;
  process.env.SETTLEORA_AUTO_RUNNER_HEALTH_LOGS_ROOT = "/tmp/evil-health-root";
  process.env.SETTLEORA_AUTO_RUNNER_HEALTH_SECRET_FILE = "/tmp/evil-secret";
  try {
    const config = validateHealthServiceConfig({ port: 0 });
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 0);
    assert.equal(config.logsRoot, path.resolve(defaultLogsRoot));
    assert.equal(config.requestSecret, null);
  } finally {
    restoreEnv("SETTLEORA_AUTO_RUNNER_HEALTH_LOGS_ROOT", previousLogsRoot);
    restoreEnv("SETTLEORA_AUTO_RUNNER_HEALTH_SECRET_FILE", previousSecretFile);
  }
});

test("health HTTP request cannot influence filesystem roots or state paths", async () => {
  await withServer(async ({ baseUrl, logsRoot }) => {
    const before = snapshotTree(logsRoot);
    const response = await fetch(`${baseUrl}${healthRoute}?logsRoot=/tmp/evil&statePath=/tmp/evil`, {
      headers: {
        "x-settleora-health-logs-root": "/tmp/evil",
        "x-settleora-health-secret-file": "/tmp/evil-secret",
      },
      body: undefined,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(snapshotTree(logsRoot), before);
    assert.equal(existsSync(path.join(path.dirname(logsRoot), "evil")), false);
  });
});

test("auto-runner health bind config defaults loopback and requires secret for non-loopback", () => {
  withLogs((logsRoot) => {
    const config = validateHealthServiceConfigWithFixedRoot({ logsRoot, port: 0 });
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 0);
    assert.throws(() => validateHealthServiceConfigWithFixedRoot({ logsRoot, host: "0.0.0.0" }), /loopback/);
    assert.throws(() => validateHealthServiceConfigWithFixedRoot({ logsRoot, host: "192.168.1.10", allowNonLoopback: true }), /request-secret root/);
    const secretPath = path.join(logsRoot, "secrets", "health-secret");
    mkdirSync(path.dirname(secretPath), { recursive: true, mode: 0o700 });
    writeFileSync(secretPath, "abcdefghijklmnopqrstuvwxyz123456\n", { mode: 0o600 });
    const lan = validateHealthServiceConfigWithFixedRoot({ logsRoot, host: "192.168.1.10", allowNonLoopback: true });
    assert.equal(lan.requestSecret, "abcdefghijklmnopqrstuvwxyz123456");

    const outside = path.join(logsRoot, "outside-secrets");
    mkdirSync(outside, { recursive: true, mode: 0o700 });
    const outsideSecret = path.join(outside, "health-secret");
    writeFileSync(outsideSecret, "abcdefghijklmnopqrstuvwxyz123456\n", { mode: 0o600 });
    rmSync(secretPath);
    symlinkSync(outside, path.join(logsRoot, "secrets", "linked"));
    symlinkSync(path.join(logsRoot, "secrets", "linked", "health-secret"), secretPath);
    assert.throws(
      () => validateHealthServiceConfigWithFixedRoot({
        logsRoot,
        host: "192.168.1.10",
        allowNonLoopback: true,
      }),
      /not trusted|secrets boundary/,
    );
  });
});

test("auto-runner health fails closed for untrusted active runner state without history", () => {
  withLogs((logsRoot) => {
    const activePath = path.join(logsRoot, "state", "active-run.json");
    mkdirSync(path.dirname(activePath), { recursive: true, mode: 0o700 });
    writeFileSync(activePath, "{}\n", { mode: 0o666 });
    chmodSync(activePath, 0o666);
    const result = evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(result.httpStatus, 503);
    assert.equal(result.body.reasonCode, "untrusted_state");
    assert.doesNotMatch(JSON.stringify(result.body), /active-run|\/tmp/);
  });
});

test("notifier dedupe claims once per supervisor run and event kind, prunes, and rejects untrusted state", () => {
  withLogs((logsRoot) => {
    const statePath = path.join(logsRoot, "monitoring", "notifier-state.json");
    const runId = "supervised-20260712T050000Z-000000000001";
    let claim = claimTerminalNotification({ supervisorRunId: runId, eventKind: "completed", statePath, logsRoot, now: defaultNow });
    assert.equal(claim.claimed, true);
    claim = claimTerminalNotification({ supervisorRunId: runId, eventKind: "completed", statePath, logsRoot, now: defaultNow });
    assert.equal(claim.claimed, false);
    claim = claimTerminalNotification({ supervisorRunId: runId, eventKind: "no-eligible-work", statePath, logsRoot, now: defaultNow });
    assert.equal(claim.claimed, true);
    claim = claimTerminalNotification({
      supervisorRunId: "supervised-20260712T050100Z-000000000002",
      eventKind: "completed",
      statePath,
      logsRoot,
      now: defaultNow,
    });
    assert.equal(claim.claimed, true);
    assert.equal(statSync(statePath).mode & 0o077, 0);

    for (let index = 3; index < 120; index += 1) {
      const minute = String(index % 60).padStart(2, "0");
      const second = String(Math.floor(index / 60)).padStart(2, "0");
      claimTerminalNotification({
        supervisorRunId: `supervised-20260712T05${minute}${second}Z-${String(index).padStart(12, "0")}`,
        eventKind: "completed",
        statePath,
        logsRoot,
        now: new Date(defaultNow.getTime() + index * 1000),
      });
    }
    assert.equal(readNotifierState({ statePath, logsRoot }).entries.length, 100);

    chmodSync(statePath, 0o666);
    assert.throws(() => readNotifierState({ statePath, logsRoot }), /not trusted/);
    assert.equal(defaultNotifierStatePath.endsWith("/monitoring/notifier-state.json"), true);
  });
});

test("health GET does not mutate notifier dedupe state", () => {
  withLogs((logsRoot) => {
    const statePath = path.join(logsRoot, "monitoring", "notifier-state.json");
    claimTerminalNotification({
      supervisorRunId: "supervised-20260712T050000Z-000000000001",
      eventKind: "completed",
      statePath,
      logsRoot,
      now: defaultNow,
    });
    const before = readFileSync(statePath, "utf8");
    evaluateAutoRunnerHealth({ logsRoot, now: defaultNow });
    assert.equal(readFileSync(statePath, "utf8"), before);
  });
});

test("health systemd template restarts only read-only monitor while mutation supervisor remains no-restart", () => {
  const health = readFileSync("tools/auto-runner/systemd/settleora-auto-runner-health.service", "utf8");
  const supervisor = readFileSync("tools/auto-runner/systemd/settleora-auto-runner@.service", "utf8");
  assert.match(health, /Restart=on-failure/);
  assert.match(health, /UMask=0077/);
  assert.match(health, /--host 127\.0\.0\.1/);
  assert.doesNotMatch(health, /0\.0\.0\.0|WEBHOOK|TOKEN|API_KEY/);
  assert.match(supervisor, /Restart=no/);
});

function withLogs(fn) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-health-"));
  const logsRoot = path.join(tempRoot, "logs");
  try {
    mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
    fn(logsRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function withServer(fn) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-health-server-"));
  const logsRoot = path.join(tempRoot, "logs");
  mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
  const server = createAutoRunnerHealthServer({ logsRoot, now: defaultNow });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    await fn({ baseUrl: `http://127.0.0.1:${address.port}`, logsRoot });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function snapshotTree(root) {
  if (!existsSync(root)) return [];
  const entries = [];
  const visit = (dir) => {
    for (const name of readdirSorted(dir)) {
      const item = path.join(dir, name);
      const stat = statSync(item);
      entries.push(`${path.relative(root, item)}:${stat.isDirectory() ? "dir" : "file"}:${stat.size}`);
      if (stat.isDirectory()) visit(item);
    }
  };
  visit(root);
  return entries;
}

function readdirSorted(dir) {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function runHealthCli(...args) {
  return spawnSync(process.execPath, ["tools/auto-runner/settleora-auto-runner-health-service.mjs", ...args], {
    encoding: "utf8",
  });
}

function writeRun(logsRoot, {
  runId = "supervised-20260712T050000Z-000000000001",
  runnerRunId = "run-2026-07-12T050000Z",
  state,
  terminalReason = "child_exit_mapped",
  stopReason = null,
  heartbeatAt = "2026-07-12T05:00:00.000Z",
  finishedAt = terminalState(state) ? "2026-07-12T05:05:00.000Z" : null,
  reportStatus = state === "completed" ? "matched" : null,
  summary = {},
} = {}) {
  const dir = runDir(logsRoot, runId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const reportResolution = reportStatus
    ? {
        status: reportStatus,
        ok: reportStatus === "matched",
        runnerRunId,
      }
    : null;
  const stateValue = {
    runId,
    state,
    runnerRunId,
    createdAt: "2026-07-12T05:00:00.000Z",
    startedAt: "2026-07-12T05:00:00.000Z",
    updatedAt: heartbeatAt,
    finishedAt,
    terminalReason,
    stopReason,
    reportResolution,
  };
  writeFileSync(path.join(dir, "state.json"), `${JSON.stringify(stateValue, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(
    path.join(dir, "heartbeat.json"),
    `${JSON.stringify(buildHeartbeat({
      runId,
      runnerRunId,
      state,
      reportResolution,
      now: new Date(heartbeatAt),
    }), null, 2)}\n`,
    { mode: 0o600 },
  );
  if (summary && runnerRunId && reportStatus === "matched") {
    const summaries = path.join(logsRoot, "summaries");
    mkdirSync(summaries, { recursive: true, mode: 0o700 });
    const summaryValue = {
      runId: runnerRunId,
      supervisorRunId: runId,
      mode: "canary-run",
      baseOriginMainSha: baseSha,
      startedAt: "2026-07-12T05:00:00.000Z",
      finishedAt: finishedAt || "2026-07-12T05:05:00.000Z",
      ...summary,
    };
    writeFileSync(path.join(summaries, `${runnerRunId}.json`), `${JSON.stringify(summaryValue, null, 2)}\n`, { mode: 0o600 });
    writeFileSync(path.join(summaries, `${runnerRunId}.md`), "# summary\n", { mode: 0o600 });
  }
  return runId;
}

function runDir(logsRoot, runId) {
  return path.join(logsRoot, "supervisor", "runs", storageKeyForLogicalId(runId));
}

function stateFile(logsRoot, runId) {
  return path.join(runDir(logsRoot, runId), "state.json");
}

function terminalState(state) {
  return ["completed", "partial", "blocked", "failed", "cancelled", "submission_failed", "stale"].includes(state);
}
