import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const boundary = path.resolve("tools/auto-runner/systemd/settleora-node-exec-boundary");
const node = "/usr/bin/node";

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
      const result = spawnSync(boundary, ["--mode", "supervisor", "--node", node, "--home", root, "--", probe], {
        encoding: "utf8",
        env: {
          ...process.env,
          ...hostile,
          GEMINI_API_KEY: "must-not-propagate",
          UNAPPROVED_UNKNOWN: "must-not-propagate",
        },
      });
      assert.equal(result.status, 0, `${label}: ${result.stderr}`);
      assert.equal(readFileIfExists(marker), null, label);
      const observed = JSON.parse(result.stdout);
      assert.deepEqual(Object.keys(observed).sort(), ["HOME", "LANG", "LC_ALL", "LOGNAME", "PATH", "PWD", "TMPDIR", "USER"].sort(), label);
      assert.equal(observed.HOME, root, label);
      assert.equal(observed.NODE_OPTIONS, undefined, label);
      assert.equal(observed.GEMINI_API_KEY, undefined, label);
      assert.equal(observed.UNAPPROVED_UNKNOWN, undefined, label);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("boundary rejects unsupported modes and non-approved interpreter identities before application code", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-node-boundary-reject-"));
  chmodSync(root, 0o700);
  try {
    const unsupported = spawnSync(boundary, ["--mode", "provider", "--node", node, "--home", root, "--", "--version"], { encoding: "utf8" });
    assert.equal(unsupported.status, 126);
    assert.match(unsupported.stderr, /unsupported process mode/);

    const wrongInterpreter = spawnSync(boundary, ["--mode", "health", "--node", "/bin/sh", "--home", root, "--", "-c", "exit 0"], { encoding: "utf8" });
    assert.equal(wrongInterpreter.status, 126);
    assert.match(wrongInterpreter.stderr, /Node 22 is required|Node executable path is not canonical/);
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
