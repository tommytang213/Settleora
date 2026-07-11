import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildRunSpec,
  canonicalJson,
  generateRunId,
  normalizeMaxRuntime,
  normalizeMaxTasks,
  readAndVerifyRunSpec,
  resolveProfile,
  sha256Text,
  validateRunId,
  validateRunSpecShape,
  writeImmutableRunSpec,
} from "../supervisor/run-spec.mjs";
import { buildHeartbeat, isHeartbeatStale } from "../supervisor/heartbeat.mjs";
import { monitoringEvents, recordMonitoringEvent, sanitizeMonitoringPayload } from "../supervisor/monitoring-outbox.mjs";
import { buildSystemdStartPlan, runnerArgvForSpec, startUserUnit } from "../supervisor/systemd-client.mjs";
import {
  deriveSupervisorPaths,
  fixedArtifactBasename,
  profileStorageKey,
  runArtifactKinds,
  storageKeyForLogicalId,
  validateStorageKey,
} from "../supervisor/supervisor-paths.mjs";

const fakeSha = "a".repeat(40);

test("run-spec defaults, valid budgets, and hard boundaries", () => {
  assert.equal(normalizeMaxTasks(undefined), 1);
  assert.equal(normalizeMaxTasks(500), 500);
  assert.throws(() => normalizeMaxTasks(0), /1..500/);
  assert.throws(() => normalizeMaxTasks(501), /1..500/);
  assert.equal(normalizeMaxRuntime(undefined), "3h");
  assert.equal(normalizeMaxRuntime("1m"), "1m");
  assert.equal(normalizeMaxRuntime("14d"), "14d");
  assert.throws(() => normalizeMaxRuntime("0m"), /1m..14d/);
  assert.throws(() => normalizeMaxRuntime("15d"), /1m..14d/);
  assert.throws(() => normalizeMaxRuntime("8"), /explicit unit/);
});

test("run-spec rejects unknown command/env/argument fields and unsafe run IDs", () => {
  const runId = generateRunId(new Date("2026-07-11T06:17:00Z"));
  assert.equal(validateRunId(runId), runId);
  assert.throws(() => validateRunId("settleora-auto-runner@evil.service"), /Invalid supervisor run ID/);
  assert.throws(() => validateRunSpecShape({ specVersion: 1, runId, command: "rm -rf /" }), /Unknown run-spec field: command/);
  assert.throws(() => validateRunSpecShape({ specVersion: 1, runId, env: { X: "Y" } }), /Unknown run-spec field: env/);
  assert.throws(() => validateRunSpecShape({ specVersion: 1, runId, extraArgs: ["--danger"] }), /Unknown run-spec field: extraArgs/);
  assert.throws(() => validateRunSpecShape({ specVersion: 1, runId, runnerConfigPath: "/tmp/config.json" }), /Unknown run-spec field: runnerConfigPath/);
});

test("run-spec canonical serialization, exclusive create, digest, tamper, symlink, escape, and mode checks", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-supervisor-"));
  const logsRoot = path.join(tempRoot, "settleora-auto-runner");
  const profile = "default";
  const configRoot = path.dirname(resolveProfile(profile, logsRoot).runnerConfigPath);
  mkdirSync(configRoot, { recursive: true, mode: 0o700 });
  const configPath = resolveProfile(profile, logsRoot).runnerConfigPath;
  writeFileSync(configPath, '{"trustedRealRunCanaryApproved":false}\n",'.replace('",', ""), { mode: 0o600 });
  const runId = generateRunId();
  const { spec } = buildRunSpec({ runId, profile, initialOriginMainSha: fakeSha, logsRoot });
  const digest = sha256Text(canonicalJson(spec));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(spec.profile, "default");
  assert.equal("runnerConfigPath" in spec, false);
  const written = writeImmutableRunSpec(spec, logsRoot);
  assert.equal(written.specSha256, digest);
  assert.throws(() => writeImmutableRunSpec(spec, logsRoot), /EEXIST/);
  assert.equal(readAndVerifyRunSpec(runId, digest, logsRoot).spec.runId, runId);
  writeFileSync(written.specPath, canonicalJson({ ...spec, maxTasks: 2 }), { mode: 0o600 });
  assert.throws(() => readAndVerifyRunSpec(runId, digest, logsRoot), /digest mismatch/);

  const symlinkLogsRoot = path.join(tempRoot, "symlink-root");
  const symlinkConfigPath = resolveProfile(profile, symlinkLogsRoot).runnerConfigPath;
  mkdirSync(path.dirname(symlinkConfigPath), { recursive: true, mode: 0o700 });
  symlinkSync(configPath, symlinkConfigPath);
  assert.throws(() => buildRunSpec({ profile, initialOriginMainSha: fakeSha, logsRoot: symlinkLogsRoot }), /regular file|Symlink/);

  chmodSync(configPath, 0o622);
  assert.throws(() => buildRunSpec({ profile, initialOriginMainSha: fakeSha, logsRoot }), /Group\/world-writable/);
});

test("storage keys and fixed artifact paths keep raw identifiers out of filesystem sinks", () => {
  const rawRunId = "supervised-20260711T063151Z-066b80f4fc16";
  const otherRunId = "supervised-20260711T063151Z-166b80f4fc16";
  const storageKey = storageKeyForLogicalId(rawRunId);
  assert.match(storageKey, /^[a-f0-9]{64}$/);
  assert.notEqual(storageKey, storageKeyForLogicalId(otherRunId));
  assert.equal(validateStorageKey(storageKey), storageKey);
  assert.throws(() => validateStorageKey("../bad"), /Invalid supervisor storage key/);

  const paths = deriveSupervisorPaths({ runId: rawRunId, logsRoot: "/workspace/logs/settleora-auto-runner" });
  assert.equal(paths.runStorageKey, storageKey);
  assert.equal(paths.runDir.includes(rawRunId), false);
  assert.equal(paths.specPath.includes(rawRunId), false);
  assert.equal(paths.artifactPath(runArtifactKinds.state).endsWith("/state.json"), true);
  assert.equal(paths.artifactPath(runArtifactKinds.heartbeat).endsWith("/heartbeat.json"), true);
  assert.equal(paths.artifactPath(runArtifactKinds.stdout).endsWith("/stdout.log"), true);
  assert.equal(paths.artifactPath(runArtifactKinds.stderr).endsWith("/stderr.log"), true);
  assert.equal(paths.artifactPath(runArtifactKinds.monitoringEvents).endsWith("/monitoring-events.jsonl"), true);
  assert.throws(() => fixedArtifactBasename("../escape"), /Unsupported supervisor artifact kind/);
  assert.throws(() => fixedArtifactBasename("operator-choice.json"), /Unsupported supervisor artifact kind/);
  assert.equal(profileStorageKey("default").length, 64);
  assert.equal(resolveProfile("default").runnerConfigPath.includes("/default."), false);
  assert.throws(() => resolveProfile("..\\/secret"), /Invalid profile name/);
});

test("systemd and runner argv stay lane-neutral and shell-free", () => {
  const runId = generateRunId();
  const spec = {
    specVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    maxTasks: 8,
    maxRuntime: "8h",
    mode: "trusted",
    profile: "default",
    runnerConfigSha256: "b".repeat(64),
    initialOriginMainSha: fakeSha,
    requestedBy: "operator",
  };
  const plan = buildSystemdStartPlan(runId);
  assert.deepEqual(plan.startArgv.slice(0, 3), ["systemctl", "--user", "start"]);
  assert.equal(plan.unitName, `settleora-auto-runner@${runId}.service`);
  assert.throws(() => buildSystemdStartPlan("bad;systemctl reboot"), /Invalid supervisor run ID/);
  const argv = runnerArgvForSpec(spec);
  assert.equal(argv.includes("client-ui-low-risk"), false);
  assert.equal(argv.includes("auto-canary-ready"), false);
  assert.equal(argv.includes("--allow-auto-merge"), false);
  assert.equal(argv.includes("--config"), true);
  assert.equal(argv.includes("--canary"), false);
  const canaryArgv = runnerArgvForSpec({ ...spec, mode: "canary" });
  assert.equal(canaryArgv.includes("--canary"), true);
});

test("systemd start failure records no foreground fallback shape", () => {
  const runId = generateRunId();
  const calls = [];
  const result = startUserUnit(runId, {
    runner: (cmd, args) => {
      calls.push([cmd, ...args]);
      return { status: 1, stderr: "boom" };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, "submission_failed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "systemctl");
});

test("heartbeat defaults, stale detection, terminal state, and sanitization", () => {
  const runId = generateRunId();
  const hb = buildHeartbeat({ runId, state: "running", maxTasks: 1, maxRuntime: "3h" });
  assert.equal(hb.heartbeatIntervalSeconds, 60);
  assert.equal(hb.heartbeatLeaseSeconds, 300);
  assert.equal(hb.terminal, false);
  assert.equal(isHeartbeatStale({ ...hb, leaseExpiresAt: "2020-01-01T00:00:00Z" }, new Date("2026-01-01T00:00:00Z")), true);
  assert.equal(isHeartbeatStale({ ...hb, state: "completed", terminal: true, leaseExpiresAt: "2020-01-01T00:00:00Z" }), false);
  const sanitized = sanitizeMonitoringPayload({ runId, webhookUrl: "https://secret.example/hook", token: "abc", body: "ok" });
  assert.equal(sanitized.webhookUrl, "[redacted]");
  assert.equal(sanitized.token, "[redacted]");
  assert.equal(sanitized.body, "[redacted]");
});

test("monitoring outbox is local, owner-only, closed-event, and nonfatal", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-outbox-"));
  const logsRoot = path.join(tempRoot, "settleora-auto-runner");
  const runId = generateRunId();
  assert.deepEqual([...monitoringEvents].sort(), ["blocked", "cancelled", "completed", "failed", "heartbeat", "partial", "started", "submitted"]);
  const result = recordMonitoringEvent("heartbeat", {
    runId,
    state: "running",
    token: "secret",
    fullIssueBody: "x".repeat(1100),
    configPath: "/workspace/logs/settleora-auto-runner/configs/profiles/example/config.json",
  }, { logsRoot });
  assert.equal(result.ok, true);
  const paths = deriveSupervisorPaths({ runId, logsRoot });
  assert.equal(result.path.endsWith("/monitoring-events.jsonl"), true);
  assert.equal(result.path.includes(runId), false);
  const text = readFileSync(result.path, "utf8");
  assert.match(text, /"event":"heartbeat"/);
  assert.doesNotMatch(text, /secret/);
  assert.doesNotMatch(text, /config\.json/);
  assert.equal(paths.artifactPath(runArtifactKinds.monitoringEvents).includes(runId), false);
  assert.throws(() => recordMonitoringEvent("operator-event", { runId }, { logsRoot }), /Unsupported monitoring event/);
});

test("operator CLI dry-run has no durable supervisor side effects and renders expected plan", () => {
  const before = snapshotSupervisorFiles();
  const result = spawnSync(process.execPath, [
    "tools/auto-runner/settleora-auto-runnerctl.mjs",
    "submit",
    "--dry-run",
    "--profile",
    "default",
    "--max-tasks",
    "8",
    "--max-runtime",
    "8h",
    "--json",
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.maxTasks, 8);
  assert.equal(parsed.maxRuntime, "8h");
  assert.equal(parsed.runnerArgv.includes("--max-iterations"), true);
  assert.equal(parsed.runnerArgv.includes("--config"), true);
  assert.equal(parsed.spec.profile, "default");
  assert.equal("runnerConfigPath" in parsed.spec, false);
  assert.equal(parsed.specPath.includes(parsed.runId), false);
  assert.equal(parsed.statePath.includes(parsed.runId), false);
  assert.equal(parsed.unitName, `settleora-auto-runner@${parsed.runId}.service`);
  assert.deepEqual(snapshotSupervisorFiles(), before);
});

test("operator CLI bounds extensions and refuses unknown supervisor run control", () => {
  const oversizedTasks = spawnSync(process.execPath, [
    "tools/auto-runner/settleora-auto-runnerctl.mjs",
    "extend",
    "--run",
    "supervised-20260711T063151Z-066b80f4fc16",
    "--max-tasks",
    "+999999",
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.notEqual(oversizedTasks.status, 0);
  assert.match(oversizedTasks.stderr, /\+1 and \+500/);

  const oversizedRuntime = spawnSync(process.execPath, [
    "tools/auto-runner/settleora-auto-runnerctl.mjs",
    "extend",
    "--run",
    "supervised-20260711T063151Z-066b80f4fc16",
    "--max-runtime",
    "+999d",
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.notEqual(oversizedRuntime.status, 0);
  assert.match(oversizedRuntime.stderr, /\+1m and \+14d/);

  const unknownRun = spawnSync(process.execPath, [
    "tools/auto-runner/settleora-auto-runnerctl.mjs",
    "pause",
    "--run",
    "supervised-20260711T063151Z-066b80f4fc16",
    "--json",
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(unknownRun.status, 2);
  const parsed = JSON.parse(unknownRun.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "unknown_run");
});

test("systemd template is fixed, no restart, no enablement, and no embedded secrets", () => {
  const text = readFileSync("tools/auto-runner/systemd/settleora-auto-runner@.service", "utf8");
  assert.match(text, /Type=exec/);
  assert.match(text, /WorkingDirectory=\/workspace\/repos\/Settleora/);
  assert.match(text, /Restart=no/);
  assert.match(text, /SendSIGKILL=no/);
  assert.doesNotMatch(text, /WantedBy=/);
  assert.doesNotMatch(text, /API_KEY|TOKEN|WEBHOOK/);
});

test("Windows templates keep fixed remote entrypoint and no hard-coded user/IP/secrets", () => {
  for (const file of [
    "tools/auto-runner/windows/Start-SettleoraAutoRun.ps1",
    "tools/auto-runner/windows/Get-SettleoraAutoRunStatus.ps1",
    "tools/auto-runner/windows/Get-SettleoraAutoRunReport.ps1",
    "tools/auto-runner/windows/Stop-SettleoraAutoRun.ps1",
  ]) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /ssh\.exe/);
    assert.match(text, /SETTLEORA_DEVBOX_SSH_TARGET/);
    assert.match(text, /\/workspace\/repos\/Settleora/);
    assert.match(text, /settleora-auto-runnerctl\.mjs/);
    assert.doesNotMatch(text, /\d+\.\d+\.\d+\.\d+/);
    assert.doesNotMatch(text, /password|token|keypath/i);
  }
  const start = readFileSync("tools/auto-runner/windows/Start-SettleoraAutoRun.ps1", "utf8");
  assert.match(start, /\[int\]\$MaxTasks = 1/);
  assert.match(start, /\[string\]\$MaxRuntime = "3h"/);
  assert.match(start, /\[string\]\$Profile = "default"/);
});

test("supervisor core has no network delivery or raw-path regression shapes", () => {
  const files = [
    "tools/auto-runner/settleora-auto-runnerctl.mjs",
    "tools/auto-runner/supervisor/heartbeat.mjs",
    "tools/auto-runner/supervisor/monitoring-outbox.mjs",
    "tools/auto-runner/supervisor/run-spec.mjs",
    "tools/auto-runner/supervisor/settleora-auto-runner-worker.mjs",
    "tools/auto-runner/supervisor/supervisor-paths.mjs",
    "tools/auto-runner/supervisor/supervisor-state.mjs",
    "tools/auto-runner/supervisor/systemd-client.mjs",
  ];
  const joined = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(joined, /\bfetch\s*\(/);
  assert.doesNotMatch(joined, /node:(http|https|net|dns)|from\s+["']node:(http|https|net|dns)/);
  assert.doesNotMatch(joined, /SETTLEORA_(HEARTBEAT|NOTIFICATION|ALLOW_LAN_HTTP)/);
  assert.doesNotMatch(joined, /atomicWriteJson\s*\(\s*filePath/);
  assert.doesNotMatch(joined, /runnerConfigPath"\s*,/);
  assert.doesNotMatch(joined, /\$\{name\}\.json/);
  assert.doesNotMatch(joined, /path\.join\([^)]*runId[^)]*\)/);
  assert.doesNotMatch(joined, /\bfileName\b/);
});

function snapshotSupervisorFiles() {
  const root = "/workspace/logs/settleora-auto-runner/supervisor";
  const result = spawnSync("find", [root, "-type", "f"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).sort();
}
