import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const healthPath = "tools/auto-runner/systemd/settleora-auto-runner-health.service";
const notifierPath = "tools/auto-runner/systemd/settleora-auto-runner-terminal-notifier.service";
const timerPath = "tools/auto-runner/systemd/settleora-auto-runner-terminal-notifier.timer";

test("Node service templates omit MemoryDenyWriteExecute and retain least-privilege boundaries", () => {
  const health = readTemplate(healthPath);
  const notifier = readTemplate(notifierPath);

  for (const [name, unit] of [["health", health], ["notifier", notifier]]) {
    assert.equal(hasDirective(unit, "Service", "MemoryDenyWriteExecute", "yes"), false, name);
    assert.match(unit.raw, /Node\/V8 needs runtime executable-memory permission transitions/);
    assertServiceDirectives(unit, name, {
      NoNewPrivileges: "yes",
      PrivateTmp: "yes",
      ProtectSystem: "strict",
      ProtectHome: "read-only",
      RestrictSUIDSGID: "yes",
      LockPersonality: "yes",
      UMask: "0077",
    });
    assertExecStartIsSafe(unit, name);
  }

  assert.equal(getLast(health, "Service", "ReadWritePaths"), "/workspace/logs/auto-runner/Settleora -/workspace/auto-runner/.runtime.consumers");
  assert.match(getLast(health, "Service", "ReadOnlyPaths"), /\/workspace\/auto-runner\/runtime/);

  assert.equal(
    getLast(notifier, "Service", "ReadWritePaths"),
    "/workspace/logs/auto-runner/Settleora/monitoring -/workspace/auto-runner/.runtime.consumers",
  );
  assert.equal(
    getLast(notifier, "Service", "ReadOnlyPaths"),
    "/workspace/repos/Settleora /workspace/auto-runner/runtime /workspace/auto-runner/config/settleora.json /workspace/logs/auto-runner/Settleora/supervisor /workspace/logs/auto-runner/Settleora/summaries /workspace/logs/auto-runner/Settleora/state /workspace/logs/auto-runner/Settleora/locks /workspace/logs/auto-runner/Settleora/secrets",
  );
});

test("health service metadata supports normal user enablement", () => {
  const health = readTemplate(healthPath);

  assert.equal(
    getLast(health, "Unit", "Documentation"),
    "file:/workspace/repos/Settleora/docs/workflow/AUTONOMOUS_CODEX_RUNNER_MONITORING.md",
  );
  assert.equal(getLast(health, "Service", "Restart"), "on-failure");
  assert.equal(getLast(health, "Service", "RestartSec"), "10s");
  assert.equal(getLast(health, "Unit", "StartLimitIntervalSec"), "300");
  assert.equal(getLast(health, "Unit", "StartLimitBurst"), "5");
  assert.equal(hasDirective(health, "Service", "StartLimitIntervalSec", "300"), false);
  assert.equal(hasDirective(health, "Service", "StartLimitBurst", "5"), false);
  assert.equal(getLast(health, "Install", "WantedBy"), "default.target");
});

test("notifier service remains timer-owned oneshot and timer cadence stays bounded", () => {
  const notifier = readTemplate(notifierPath);
  const timer = readTemplate(timerPath);

  assert.equal(getLast(notifier, "Service", "Type"), "oneshot");
  assert.equal(getLast(notifier, "Service", "Restart"), "no");
  assert.equal(notifier.sections.has("Install"), false);
  assert.equal(getLast(timer, "Timer", "Unit"), "settleora-auto-runner-terminal-notifier.service");
  assert.equal(getLast(timer, "Timer", "OnBootSec"), "90s");
  assert.equal(getLast(timer, "Timer", "OnUnitInactiveSec"), "60s");
  assert.equal(getLast(timer, "Timer", "RandomizedDelaySec"), "10s");
  assert.equal(getLast(timer, "Timer", "AccuracySec"), "10s");
  assert.equal(getLast(timer, "Install", "WantedBy"), "timers.target");
});

test("repository templates keep loopback defaults and avoid deployment secrets in ExecStart", () => {
  const health = readTemplate(healthPath);
  const notifier = readTemplate(notifierPath);

  assert.equal(
    getLast(health, "Service", "ExecStart"),
    "/usr/bin/env -i HOME=%h USER=%u LOGNAME=%u PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TMPDIR=/tmp XDG_RUNTIME_DIR=%t DBUS_SESSION_BUS_ADDRESS=unix:path=%t/bus /usr/bin/node /workspace/auto-runner/.runtime.launcher.mjs --runtime-root /workspace/auto-runner/runtime --entry settleora-auto-runner-health-service.mjs -- --host 127.0.0.1 --port 8787 --config /workspace/auto-runner/config/settleora.json",
  );
  assert.equal(
    getLast(notifier, "Service", "ExecStart"),
    "/usr/bin/env -i HOME=%h USER=%u LOGNAME=%u PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TMPDIR=/tmp XDG_RUNTIME_DIR=%t DBUS_SESSION_BUS_ADDRESS=unix:path=%t/bus /usr/bin/node /workspace/auto-runner/.runtime.launcher.mjs --runtime-root /workspace/auto-runner/runtime --entry settleora-auto-runner-terminal-notifier.mjs -- --config /workspace/auto-runner/config/settleora.json",
  );

  for (const [name, unit] of [["health", health], ["notifier", notifier]]) {
    assert.doesNotMatch(unit.raw, /0\.0\.0\.0|192\.168\.|10\.|172\.16\.|WEBHOOK|TOKEN|API_KEY|Authorization|Bearer/);
    assertExecStartIsSafe(unit, name);
  }
});

function readTemplate(path) {
  return parseIni(readFileSync(path, "utf8"));
}

function parseIni(raw) {
  const sections = new Map();
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (header) {
      current = header[1];
      if (!sections.has(current)) {
        sections.set(current, new Map());
      }
      continue;
    }
    const separator = trimmed.indexOf("=");
    assert.notEqual(separator, -1, `line outside key/value syntax: ${line}`);
    assert.ok(current, `directive outside section: ${line}`);
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    const section = sections.get(current);
    if (!section.has(key)) {
      section.set(key, []);
    }
    section.get(key).push(value);
  }
  return { raw, sections };
}

function getLast(unit, section, key) {
  const values = unit.sections.get(section)?.get(key);
  assert.ok(values?.length, `missing ${section}.${key}`);
  return values.at(-1);
}

function hasDirective(unit, section, key, value) {
  return unit.sections.get(section)?.get(key)?.includes(value) ?? false;
}

function assertServiceDirectives(unit, name, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(getLast(unit, "Service", key), value, `${name} ${key}`);
  }
}

function assertExecStartIsSafe(unit, name) {
  const execStart = getLast(unit, "Service", "ExecStart");
  assert.match(execStart, /^\/usr\/bin\/env -i HOME=%h USER=%u LOGNAME=%u PATH=\/usr\/local\/bin:\/usr\/bin:\/bin LANG=C\.UTF-8 LC_ALL=C\.UTF-8 TMPDIR=\/tmp XDG_RUNTIME_DIR=%t DBUS_SESSION_BUS_ADDRESS=unix:path=%t\/bus \/usr\/bin\/node \/workspace\/auto-runner\/\.runtime\.launcher\.mjs --runtime-root \/workspace\/auto-runner\/runtime --entry settleora-auto-runner-(?:health-service|terminal-notifier)\.mjs -- (?:--host 127\.0\.0\.1 --port 8787 )?--config \/workspace\/auto-runner\/config\/settleora\.json$/);
  assert.doesNotMatch(execStart, /\b(?:sh|bash)\s+-c\b/, name);
  assert.doesNotMatch(execStart, /%[EfinpsU]|\$|\.\.|\/workspace\/logs\/settleora-auto-runner\/secrets/, name);
  for (const required of ["NODE_OPTIONS", "NODE_PATH", "NODE_V8_COVERAGE", "LD_PRELOAD", "BASH_ENV", "GIT_CONFIG_GLOBAL", "GIT_SSH_COMMAND"]) {
    assert.equal(unit.sections.get("Service")?.get("UnsetEnvironment")?.some((line) => line.split(" ").includes(required)), true, `${name} ${required}`);
  }
  assert.equal(unit.sections.get("Service")?.has("EnvironmentFile"), false, name);
}
