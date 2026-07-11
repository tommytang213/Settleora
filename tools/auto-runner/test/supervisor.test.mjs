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
  sha256Text,
  validateRunId,
  validateRunSpecShape,
  writeImmutableRunSpec,
} from "../supervisor/run-spec.mjs";
import { buildHeartbeat, isHeartbeatStale } from "../supervisor/heartbeat.mjs";
import { sanitizePayload, validateEndpoint } from "../supervisor/notification-client.mjs";
import { buildSystemdStartPlan, runnerArgvForSpec, startUserUnit } from "../supervisor/systemd-client.mjs";

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
});

test("run-spec canonical serialization, exclusive create, digest, tamper, symlink, escape, and mode checks", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-supervisor-"));
  const logsRoot = path.join(tempRoot, "settleora-auto-runner");
  const configRoot = path.join(logsRoot, "configs");
  mkdirSync(configRoot, { recursive: true, mode: 0o700 });
  const configPath = path.join(configRoot, "default.json");
  writeFileSync(configPath, '{"trustedRealRunCanaryApproved":false}\n",'.replace('",', ""), { mode: 0o600 });
  const runId = generateRunId();
  const { spec } = buildRunSpec({ runId, runnerConfigPath: configPath, initialOriginMainSha: fakeSha, logsRoot });
  const digest = sha256Text(canonicalJson(spec));
  assert.match(digest, /^[a-f0-9]{64}$/);
  const written = writeImmutableRunSpec(spec, logsRoot);
  assert.equal(written.specSha256, digest);
  assert.throws(() => writeImmutableRunSpec(spec, logsRoot), /EEXIST/);
  assert.equal(readAndVerifyRunSpec(runId, digest, logsRoot).spec.runId, runId);
  writeFileSync(written.specPath, canonicalJson({ ...spec, maxTasks: 2 }), { mode: 0o600 });
  assert.throws(() => readAndVerifyRunSpec(runId, digest, logsRoot), /digest mismatch/);

  const symlinkPath = path.join(configRoot, "symlink.json");
  symlinkSync(configPath, symlinkPath);
  assert.throws(() => buildRunSpec({ runnerConfigPath: symlinkPath, initialOriginMainSha: fakeSha, logsRoot }), /regular file|Symlink/);

  const outside = path.join(tempRoot, "outside.json");
  writeFileSync(outside, "{}\n", { mode: 0o600 });
  assert.throws(() => buildRunSpec({ runnerConfigPath: outside, initialOriginMainSha: fakeSha, logsRoot }), /outside approved roots/);

  chmodSync(configPath, 0o622);
  assert.throws(() => buildRunSpec({ runnerConfigPath: configPath, initialOriginMainSha: fakeSha, logsRoot }), /Group\/world-writable/);
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
    runnerConfigPath: "/workspace/logs/settleora-auto-runner/configs/default.json",
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
  const sanitized = sanitizePayload({ runId, webhookUrl: "https://secret.example/hook", token: "abc", body: "ok" });
  assert.equal(sanitized.webhookUrl, "[redacted]");
  assert.equal(sanitized.token, "[redacted]");
});

test("notification endpoint policy enforces HTTPS or explicit private HTTP", async () => {
  assert.equal((await validateEndpoint("https://example.invalid/hook")).ok, true);
  assert.equal((await validateEndpoint("http://127.0.0.1/hook", {})).reason, "http_requires_explicit_lan_opt_in");
  assert.equal((await validateEndpoint("http://127.0.0.1/hook", { SETTLEORA_ALLOW_LAN_HTTP: "1" })).ok, true);
  assert.equal((await validateEndpoint("ftp://example.invalid/hook")).reason, "unsupported_scheme");
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
  assert.equal(parsed.unitName, `settleora-auto-runner@${parsed.runId}.service`);
  assert.deepEqual(snapshotSupervisorFiles(), before);
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
});

function snapshotSupervisorFiles() {
  const root = "/workspace/logs/settleora-auto-runner/supervisor";
  const result = spawnSync("find", [root, "-type", "f"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).sort();
}
