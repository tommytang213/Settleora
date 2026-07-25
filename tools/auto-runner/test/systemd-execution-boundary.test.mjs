import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cleanEnvironment = (home) => [
  "-i",
  `HOME=${home}`,
  "USER=fixture",
  "LOGNAME=fixture",
  "PATH=/usr/local/bin:/usr/bin:/bin",
  "LANG=C.UTF-8",
  "LC_ALL=C.UTF-8",
  "TMPDIR=/tmp",
  "XDG_RUNTIME_DIR=/run/user/1234",
  "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1234/bus",
];

test("pre-Node boundary defeats import, require, loader, NODE_PATH, and startup-control injection", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-node-boundary-"));
  chmodSync(root, 0o700);
  try {
    const marker = path.join(root, "marker");
    const preload = path.join(root, "preload.cjs");
    const imported = path.join(root, "import.mjs");
    const loader = path.join(root, "loader.mjs");
    const probe = path.join(root, "probe.mjs");
    writeFileSync(preload, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "require");\n`);
    writeFileSync(imported, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "import");\n`);
    writeFileSync(loader, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "loader"); export async function resolve(s,c,n){ return n(s,c); }\n`);
    writeFileSync(probe, "process.stdout.write(JSON.stringify(process.env));\n");

    const hostileCases = [
      ["require", { NODE_OPTIONS: `--require=${preload}` }],
      ["import", { NODE_OPTIONS: `--import=${imported}` }],
      ["loader", { NODE_OPTIONS: `--experimental-loader=${loader}` }],
      ["node-path", { NODE_PATH: root }],
      ["coverage", { NODE_V8_COVERAGE: root }],
      ["compile-cache", { NODE_COMPILE_CACHE: root }],
      ["debug", { NODE_DEBUG: "*" }],
      ["openssl", { OPENSSL_CONF: path.join(root, "openssl.cnf") }],
      ["git", { GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"), GIT_SSH_COMMAND: preload }],
    ];
    for (const [label, hostile] of hostileCases) {
      rmSync(marker, { force: true });
      const result = spawnSync("/usr/bin/env", [...cleanEnvironment(root), process.execPath, probe], {
        encoding: "utf8",
        env: {
          ...process.env,
          ...hostile,
          UNAPPROVED_PROVIDER_VALUE: "must-not-propagate",
          UNAPPROVED_UNKNOWN: "must-not-propagate",
        },
      });
      assert.equal(result.status, 0, `${label}: ${result.stderr}`);
      assert.equal(readFileIfExists(marker), null, label);
      const observed = JSON.parse(result.stdout);
      assert.deepEqual(Object.keys(observed).sort(), ["DBUS_SESSION_BUS_ADDRESS", "HOME", "LANG", "LC_ALL", "LOGNAME", "PATH", "TMPDIR", "USER", "XDG_RUNTIME_DIR"].sort(), label);
      assert.equal(observed.HOME, root, label);
      assert.equal(observed.NODE_OPTIONS, undefined, label);
      assert.equal(observed.UNAPPROVED_PROVIDER_VALUE, undefined, label);
      assert.equal(observed.UNAPPROVED_UNKNOWN, undefined, label);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("systemd-native boundary selects Node absolutely and retains only the bounded user-bus coordinates", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-node-boundary-reject-"));
  chmodSync(root, 0o700);
  try {
    const probe = path.join(root, "probe.mjs");
    writeFileSync(probe, "process.stdout.write(JSON.stringify({execPath:process.execPath, env:process.env}));\n");
    const result = spawnSync("/usr/bin/env", [...cleanEnvironment(root), process.execPath, probe], {
      encoding: "utf8",
      env: { ...process.env, PATH: root, NODE_OPTIONS: "--inspect", DBUS_SESSION_BUS_ADDRESS: "hostile" },
    });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(result.stdout);
    assert.equal(observed.execPath, process.execPath);
    assert.equal(observed.env.XDG_RUNTIME_DIR, "/run/user/1234");
    assert.equal(observed.env.DBUS_SESSION_BUS_ADDRESS, "unix:path=/run/user/1234/bus");
    assert.equal(observed.env.NODE_OPTIONS, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function readFileIfExists(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
