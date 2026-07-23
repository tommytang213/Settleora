import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildTerminalNotificationMessage,
  defaultNtfyNotifierConfigPath,
  publishNtfyMessage,
  readNtfyNotifierConfig,
  runTerminalNotifier,
  selectEligibleTerminalNotification,
  sequenceIdForDedupeKey,
  validateNtfyNotifierConfig,
} from "../lib/ntfy-terminal-notifier.mjs";
import { dedupeKey, readNotifierState } from "../lib/notifier-dedupe-state.mjs";
import { buildHeartbeat } from "../supervisor/heartbeat.mjs";
import { storageKeyForLogicalId } from "../supervisor/supervisor-paths.mjs";

const baseSha = "a".repeat(40);
const now = new Date("2026-07-12T07:10:00.000Z");
const config = {
  schemaVersion: 1,
  baseUrl: "http://127.0.0.1:8080",
  activityTopic: "activity_topic",
  accessToken: "tk_abcdefghijklmnopqrstuvwxyz123456",
};

test("terminal notifier sends nothing with no history or active run", async () => {
  await withLogs(async (logsRoot) => {
    let calls = 0;
    let result = await runTerminalNotifier({ logsRoot, config, now, publisher: async () => { calls += 1; return { ok: true }; } });
    assert.equal(result.ok, true);
    assert.equal(result.sent, false);
    assert.equal(result.reason, "initializing");
    assert.equal(calls, 0);

    writeRun(logsRoot, { state: "running", runnerRunId: "run-2026-07-12T070000Z" });
    result = await runTerminalNotifier({ logsRoot, config, now, publisher: async () => { calls += 1; return { ok: true }; } });
    assert.equal(result.sent, false);
    assert.equal(result.reason, "runner_disappeared");
    assert.equal(calls, 0);
  });
});

test("terminal notifier sends a completed run once, records after 2xx, and skips repeats", async () => {
  await withLogs(async (logsRoot) => {
    const statePath = notifierStatePath(logsRoot);
    writeRun(logsRoot, {
      runId: "supervised-20260712T070000Z-000000000001",
      state: "completed",
      runnerRunId: "run-2026-07-12T070000Z",
      summary: { iterations: [{ outcome: "completed", pr: { number: 883 } }], prsOpened: 1 },
    });
    const sent = [];
    const publisher = async (request) => {
      sent.push(request);
      assert.equal(request.message.title, "Settleora auto-runner completed");
      assert.equal(request.message.priority, "default");
      assert.match(request.message.tags, /heavy_check_mark/);
      return { ok: true, statusCode: 200 };
    };
    let result = await runTerminalNotifier({ logsRoot, statePath, config, now, publisher });
    assert.equal(result.sent, true);
    assert.equal(sent.length, 1);
    assert.equal(readNotifierState({ statePath, logsRoot }).entries.length, 1);

    result = await runTerminalNotifier({ logsRoot, statePath, config, now, publisher });
    assert.equal(result.sent, false);
    assert.equal(result.reason, "already_delivered");
    assert.equal(sent.length, 1);
  });
});

test("terminal notifier derives default dedupe state from the supplied project logs root", async () => {
  await withLogs(async (logsRoot) => {
    writeRun(logsRoot, {
      state: "completed",
      runnerRunId: "run-2026-07-12T070000Z",
      summary: { iterations: [{ outcome: "completed" }] },
    });
    const result = await runTerminalNotifier({
      logsRoot,
      config,
      now,
      publisher: async () => ({ ok: true }),
    });
    assert.equal(result.sent, true);
    assert.equal(existsSync(path.join(logsRoot, "monitoring", "notifier-state.json")), true);
  });
});

test("terminal notifier sends again for a new run ID and supports no-work and budget activity events", async () => {
  await withLogs(async (logsRoot) => {
    const statePath = notifierStatePath(logsRoot);
    const sent = [];
    const publisher = async (request) => { sent.push(request); return { ok: true, statusCode: 200 }; };

    writeRun(logsRoot, {
      runId: "supervised-20260712T070000Z-000000000001",
      state: "completed",
      runnerRunId: "run-2026-07-12T070000Z",
      stopReason: "no-eligible-work",
      summary: { stopReason: "no-eligible-work", iterations: [{ outcome: "no_eligible_work" }] },
    });
    let result = await runTerminalNotifier({ logsRoot, statePath, config, now, publisher });
    assert.equal(result.sent, true);
    assert.equal(sent.at(-1).message.title, "Settleora auto-runner idle");
    assert.equal(sent.at(-1).message.priority, "low");

    writeRun(logsRoot, {
      runId: "supervised-20260712T071000Z-000000000002",
      state: "completed",
      runnerRunId: "run-2026-07-12T071000Z",
      stopReason: "max-runtime-reached",
      heartbeatAt: "2026-07-12T07:15:00.000Z",
      finishedAt: "2026-07-12T07:15:00.000Z",
      summary: { stopReason: "max-runtime-reached", iterations: [{ outcome: "completed" }] },
    });
    result = await runTerminalNotifier({ logsRoot, statePath, config, now, publisher });
    assert.equal(result.sent, true);
    assert.equal(sent.at(-1).message.title, "Settleora auto-runner budget reached");
    assert.equal(sent.length, 2);
    assert.equal(readNotifierState({ statePath, logsRoot }).entries.length, 2);
  });
});

test("terminal notifier does not send failed, blocked, partial, stale, untrusted, report-missing, or ambiguous states", async () => {
  for (const [state, reportStatus] of [
    ["failed", null],
    ["blocked", null],
    ["partial", null],
    ["stale", null],
    ["completed", null],
    ["completed", "multiple_matches"],
  ]) {
    await withLogs(async (logsRoot) => {
      writeRun(logsRoot, { state, reportStatus, summary: reportStatus === "matched" ? {} : null });
      let calls = 0;
      const result = await runTerminalNotifier({ logsRoot, config, now, publisher: async () => { calls += 1; return { ok: true }; } });
      assert.equal(result.sent, false, state);
      assert.equal(calls, 0, state);
    });
  }

  await withLogs(async (logsRoot) => {
    const runId = writeRun(logsRoot, { state: "completed" });
    chmodSync(path.join(runDir(logsRoot, runId), "state.json"), 0o666);
    let calls = 0;
    const result = await runTerminalNotifier({ logsRoot, config, now, publisher: async () => { calls += 1; return { ok: true }; } });
    assert.equal(result.sent, false);
    assert.equal(calls, 0);
  });
});

test("non-2xx, timeout, and connection failure do not record delivery and retry with the same sequence ID", async () => {
  await withLogs(async (logsRoot) => {
    const statePath = notifierStatePath(logsRoot);
    const runId = "supervised-20260712T070000Z-000000000001";
    writeRun(logsRoot, { runId, state: "completed", runnerRunId: "run-2026-07-12T070000Z" });
    const server = await stubServer({ statusCode: 500 });
    try {
      const localConfig = { ...config, baseUrl: server.baseUrl };
      const result = await runTerminalNotifier({ logsRoot, statePath, config: localConfig, now, publisher: publishNtfyMessage });
      assert.equal(result.ok, false);
      assert.equal(existsSync(statePath), false);
      assert.equal(server.requests.length, 1);
      assert.equal(server.requests[0].headers.authorization, `Bearer ${config.accessToken}`);
      assert.equal(server.requests[0].headers["x-sequence-id"], sequenceIdForDedupeKey(dedupeKey(runId, "completed")));
    } finally {
      await server.close();
    }

    const seen = [];
    const failing = async ({ sequenceId }) => {
      seen.push(sequenceId);
      return { ok: false, reason: "delivery_unconfirmed" };
    };
    let result = await runTerminalNotifier({ logsRoot, statePath, config, now, publisher: failing });
    assert.equal(result.ok, false);
    result = await runTerminalNotifier({ logsRoot, statePath, config, now, publisher: failing });
    assert.equal(result.ok, false);
    assert.equal(seen.length, 2);
    assert.equal(seen[0], seen[1]);
    assert.equal(existsSync(statePath), false);

    const conn = await publishNtfyMessage({
      config: { ...config, baseUrl: "http://127.0.0.1:9" },
      message: { title: "Settleora auto-runner completed", priority: "default", tags: "computer", body: "body" },
      sequenceId: "settleora-test",
      timeoutMs: 200,
    });
    assert.equal(conn.ok, false);
  });
});

test("confirmed 2xx via local ntfy stub records delivery and repeat does not call network", async () => {
  await withLogs(async (logsRoot) => {
    const statePath = notifierStatePath(logsRoot);
    writeRun(logsRoot, { state: "completed", runnerRunId: "run-2026-07-12T070000Z" });
    const server = await stubServer({ statusCode: 204 });
    try {
      const localConfig = { ...config, baseUrl: `${server.baseUrl}/ntfy` };
      let result = await runTerminalNotifier({ logsRoot, statePath, config: localConfig, now, publisher: publishNtfyMessage });
      assert.equal(result.sent, true);
      assert.equal(server.requests.length, 1);
      assert.equal(server.requests[0].url, "/ntfy/activity_topic");
      assert.match(server.requests[0].body, /Supervisor run:/);
      result = await runTerminalNotifier({ logsRoot, statePath, config: localConfig, now, publisher: publishNtfyMessage });
      assert.equal(result.sent, false);
      assert.equal(server.requests.length, 1);
    } finally {
      await server.close();
    }
  });
});

test("production config boundary is fixed and rejects unsafe config shapes without leaking bearer tokens", () => {
  assert.equal(defaultNtfyNotifierConfigPath, "/workspace/logs/settleora-auto-runner/secrets/ntfy-notifier.json");
  assert.throws(() => readNtfyNotifierConfig({ configPath: "/tmp/ntfy.json" }), /fixed/);
  assert.throws(() => validateNtfyNotifierConfig({ ...config, extra: true }), /unknown/);
  assert.throws(() => validateNtfyNotifierConfig({ ...config, schemaVersion: 2 }), /schema/);
  assert.throws(() => validateNtfyNotifierConfig({ ...config, baseUrl: "ftp://ntfy.example" }), /http/);
  assert.throws(() => validateNtfyNotifierConfig({ ...config, baseUrl: "https://user:pass@ntfy.example" }), /credentials/);
  assert.throws(() => validateNtfyNotifierConfig({ ...config, baseUrl: "https://ntfy.example?x=1" }), /query/);
  assert.throws(() => validateNtfyNotifierConfig({ ...config, baseUrl: "https://ntfy.example/#frag" }), /query/);
  assert.throws(() => validateNtfyNotifierConfig({ ...config, baseUrl: "https://ntfy.example/bad%2Fseg" }), /path/);
  assert.throws(() => validateNtfyNotifierConfig({ ...config, activityTopic: "../critical" }), /activityTopic/);
  const secret = "tk_secret_token_value_that_must_not_leak";
  assert.throws(
    () => validateNtfyNotifierConfig({ ...config, accessToken: `${secret}\n` }),
    (error) => !String(error.message).includes(secret),
  );
});

test("production config file rejects symlink, group/world access, oversized, and malformed JSON", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "settleora-ntfy-config-"));
  const secrets = path.join(parent, "secrets");
  const original = defaultNtfyNotifierConfigPath;
  assert.equal(original.startsWith("/workspace/logs/settleora-auto-runner/secrets/"), true);
  try {
    mkdirSync(secrets, { recursive: true, mode: 0o700 });
    const fixedTempPath = path.join(secrets, "ntfy-notifier.json");
    writeFileSync(fixedTempPath, JSON.stringify(config), { mode: 0o600 });
    assert.deepEqual(readNtfyNotifierConfig({ configPath: fixedTempPath, logsRoot: parent }), config);

    chmodSync(fixedTempPath, 0o666);
    assert.throws(() => readNtfyNotifierConfig({ configPath: fixedTempPath, logsRoot: parent }), /not trusted/);
    rmSync(fixedTempPath);

    writeFileSync(fixedTempPath, "x".repeat(20 * 1024), { mode: 0o600 });
    assert.throws(() => readNtfyNotifierConfig({ configPath: fixedTempPath, logsRoot: parent }), /oversized/);
    rmSync(fixedTempPath);

    writeFileSync(fixedTempPath, "{not-json", { mode: 0o600 });
    assert.throws(() => readNtfyNotifierConfig({ configPath: fixedTempPath, logsRoot: parent }), /JSON/);
    rmSync(fixedTempPath);

    const outside = path.join(parent, "outside.json");
    writeFileSync(outside, JSON.stringify(config), { mode: 0o600 });
    symlinkSync(outside, fixedTempPath);
    assert.throws(() => readNtfyNotifierConfig({ configPath: fixedTempPath, logsRoot: parent }), /not trusted/);

    assert.throws(() => readNtfyNotifierConfig({ configPath: path.join(secrets, "other.json"), logsRoot: parent }), /fixed/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("message sanitization is bounded and omits paths, prompts, tokens, and arbitrary exception text", () => {
  const message = buildTerminalNotificationMessage({
    eventKind: "completed",
    supervisorRunId: "supervised-20260712T070000Z-000000000001",
    reasonCode: "terminal_success",
    supervisor: {
      terminalReason: "child_exit_mapped /workspace/logs secret TOKEN Authorization prompt diff --git",
      startedAt: "2026-07-12T07:00:00.000Z",
      finishedAt: "2026-07-12T07:05:00.000Z",
    },
    summary: { tasksProcessed: 1, prsOpened: 1, prsMerged: 0, failedCount: 0, blockedCount: 0, latestMainSha: "b".repeat(40) },
  });
  assert.ok(message.title.length <= 80);
  assert.ok(message.body.length <= 900);
  assert.doesNotMatch(message.body, /TOKEN|Authorization|prompt|diff --git|secret/);
});

test("terminal notifier does not mutate supervisor, runner, or lock state", async () => {
  await withLogs(async (logsRoot) => {
    const lockPath = path.join(logsRoot, "locks", "settleora-auto-runner.lock");
    mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: now.toISOString() }), { mode: 0o600 });
    const runId = writeRun(logsRoot, { state: "running", runnerRunId: "run-2026-07-12T070000Z" });
    const statePath = path.join(runDir(logsRoot, runId), "state.json");
    const beforeState = readFileSync(statePath, "utf8");
    const beforeLock = readFileSync(lockPath, "utf8");
    const result = await runTerminalNotifier({ logsRoot, config, now, publisher: async () => { throw new Error("should not send"); } });
    assert.equal(result.sent, false);
    assert.equal(readFileSync(statePath, "utf8"), beforeState);
    assert.equal(readFileSync(lockPath, "utf8"), beforeLock);
  });
});

test("terminal notifier CLI rejects caller-controlled production arguments and systemd split remains intact", () => {
  for (const arg of ["--base-url", "--topic", "--token", "--config-path"]) {
    const result = spawnSync(process.execPath, ["tools/auto-runner/settleora-auto-runner-terminal-notifier.mjs", arg, "x"], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires trusted --config/);
    assert.doesNotMatch(result.stderr, /tk_|Bearer|Authorization/);
  }
  for (const configPath of [
    "/tmp/settleora.json",
    "/workspace/auto-runner/config/../settleora.json",
    "/workspace/auto-runner/config/settleora/child.json",
    "/workspace/auto-runner/config/.json",
  ]) {
    const result = spawnSync(process.execPath, ["tools/auto-runner/settleora-auto-runner-terminal-notifier.mjs", "--config", configPath], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires trusted --config/);
  }
  const notifierService = readFileSync("tools/auto-runner/systemd/settleora-auto-runner-terminal-notifier.service", "utf8");
  const notifierTimer = readFileSync("tools/auto-runner/systemd/settleora-auto-runner-terminal-notifier.timer", "utf8");
  const supervisor = readFileSync("tools/auto-runner/systemd/settleora-auto-runner@.service", "utf8");
  assert.match(notifierService, /Type=oneshot/);
  assert.match(notifierService, /UMask=0077/);
  assert.match(notifierService, /settleora-auto-runner-terminal-notifier\.mjs/);
  assert.doesNotMatch(notifierService, /--base-url|--topic|--token|0\.0\.0\.0/);
  assert.match(notifierTimer, /OnUnitInactiveSec=60s/);
  assert.match(notifierTimer, /RandomizedDelaySec=10s/);
  assert.match(supervisor, /Restart=no/);
});

test("eligible terminal selector exposes only trusted healthy terminal events", () => {
  withLogsSync((logsRoot) => {
    const runId = writeRun(logsRoot, {
      state: "completed",
      runnerRunId: "run-2026-07-12T070000Z",
      summary: { iterations: [{ outcome: "completed" }] },
    });
    const selected = selectEligibleTerminalNotification({ logsRoot, now });
    assert.equal(selected.eligible, true);
    assert.equal(selected.supervisorRunId, runId);
    assert.equal(selected.eventKind, "completed");
  });
});

async function withLogs(fn) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-terminal-notifier-"));
  const logsRoot = path.join(tempRoot, "logs");
  try {
    mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
    await fn(logsRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function withLogsSync(fn) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-terminal-notifier-"));
  const logsRoot = path.join(tempRoot, "logs");
  try {
    mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
    fn(logsRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function stubServer({ statusCode = 200 } = {}) {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk.toString("utf8"); });
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, headers: request.headers, body });
      response.statusCode = statusCode;
      response.end("ok");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function notifierStatePath(logsRoot) {
  return path.join(logsRoot, "monitoring", "notifier-state.json");
}

function writeRun(logsRoot, {
  runId = "supervised-20260712T070000Z-000000000001",
  runnerRunId = "run-2026-07-12T070000Z",
  state,
  terminalReason = "child_exit_mapped",
  stopReason = null,
  heartbeatAt = "2026-07-12T07:05:00.000Z",
  finishedAt = terminalState(state) ? "2026-07-12T07:05:00.000Z" : null,
  reportStatus = state === "completed" ? "matched" : null,
  summary = {},
} = {}) {
  const dir = runDir(logsRoot, runId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const reportResolution = reportStatus ? { status: reportStatus, ok: reportStatus === "matched", runnerRunId } : null;
  const stateValue = {
    runId,
    state,
    runnerRunId,
    createdAt: "2026-07-12T07:00:00.000Z",
    startedAt: "2026-07-12T07:00:00.000Z",
    updatedAt: heartbeatAt,
    finishedAt,
    terminalReason,
    stopReason,
    reportResolution,
  };
  writeFileSync(path.join(dir, "state.json"), `${JSON.stringify(stateValue, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(
    path.join(dir, "heartbeat.json"),
    `${JSON.stringify(buildHeartbeat({ runId, runnerRunId, state, reportResolution, now: new Date(heartbeatAt) }), null, 2)}\n`,
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
      startedAt: "2026-07-12T07:00:00.000Z",
      finishedAt: finishedAt || "2026-07-12T07:05:00.000Z",
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

function terminalState(state) {
  return ["completed", "partial", "blocked", "failed", "cancelled", "submission_failed", "stale"].includes(state);
}
