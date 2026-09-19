import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildFlutterCommand, parseArgs, runBoundedProcess } from "../bounded-process-capture.mjs";

const capture = path.resolve(import.meta.dirname, "../bounded-process-capture.mjs");

async function withCapture(callback) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "settleora-bounded-capture-"));
  try {
    return await callback({
      stdoutPath: path.join(directory, "stdout.log"),
      stderrPath: path.join(directory, "stderr.log"),
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("captures bounded stdout and stderr and preserves the child status", async () => {
  await withCapture(async ({ stdoutPath, stderrPath }) => {
    writeFileSync(stdoutPath, "old stdout", { mode: 0o644 });
    writeFileSync(stderrPath, "old stderr", { mode: 0o644 });
    chmodSync(stdoutPath, 0o644);
    chmodSync(stderrPath, 0o644);
    const status = await runBoundedProcess({
      stdoutPath,
      stderrPath,
      maxBytes: 64,
      executable: process.execPath,
      args: ["-e", "process.stdout.write('safe-out'); process.stderr.write('safe-error'); process.exit(7)"],
    });
    assert.equal(status, 7);
    assert.equal(readFileSync(stdoutPath, "utf8"), "safe-out");
    assert.equal(readFileSync(stderrPath, "utf8"), "safe-error");
    assert.equal(statSync(stdoutPath).mode & 0o777, 0o600);
    assert.equal(statSync(stderrPath).mode & 0o777, 0o600);
  });
});

test("terminates on overflow without echoing captured content", async () => {
  await withCapture(async ({ stdoutPath, stderrPath }) => {
    const privateText = "private-receipt-content";
    const status = await runBoundedProcess({
      stdoutPath,
      stderrPath,
      maxBytes: 16,
      executable: process.execPath,
      args: ["-e", `process.stdout.write(${JSON.stringify(privateText.repeat(100))}); setInterval(() => {}, 1000)`],
    });
    assert.equal(status, 97);
    assert.equal(readFileSync(stdoutPath).length, 16);
    assert.equal(readFileSync(stderrPath).length, 0);
  });
});

test("terminates detached descendants that ignore the graceful overflow signal", async () => {
  await withCapture(async ({ stdoutPath, stderrPath }) => {
    const descendantSource = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)";
    const parentSource = [
      "const { spawn } = require('node:child_process')",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantSource)}], { stdio: 'ignore' })`,
      "process.stdout.write(`${child.pid}\\n${'x'.repeat(1000)}`)",
      "setInterval(() => {}, 1000)",
    ].join(";");
    const status = await runBoundedProcess({
      stdoutPath,
      stderrPath,
      maxBytes: 64,
      executable: process.execPath,
      args: ["-e", parentSource],
    });
    assert.equal(status, 97);
    const descendantPid = Number(readFileSync(stdoutPath, "utf8").split("\n", 1)[0]);
    assert.equal(Number.isSafeInteger(descendantPid), true);
    assert.throws(() => process.kill(descendantPid, 0), { code: "ESRCH" });
  });
});

test("rejects unknown and duplicate wrapper options without echoing their values", () => {
  for (const invalidOption of ["--unknown=private-value", "--max-bytes=8"]) {
    const result = spawnSync(process.execPath, [
      capture,
      `--stdout=${path.join(os.tmpdir(), "stdout.log")}`,
      `--stderr=${path.join(os.tmpdir(), "stderr.log")}`,
      "--max-bytes=16",
      "--platform=android",
      "--device=emulator-5554",
      invalidOption,
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ], { encoding: "utf8" });
    assert.equal(result.status, 98);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "bounded_process_capture_failed\n");
  }
});

test("CLI accepts only the fixed receipt OCR command profile and bounded device identities", () => {
  const parsed = parseArgs([
    `--stdout=${path.join(os.tmpdir(), "stdout.log")}`,
    `--stderr=${path.join(os.tmpdir(), "stderr.log")}`,
    "--max-bytes=64",
    "--platform=android",
    "--device=emulator-5554",
  ]);
  assert.equal(parsed.device, "emulator-5554");
  assert.deepEqual(buildFlutterCommand(parsed.device), {
    executable: "flutter",
    args: [
      "test",
      "integration_test/receipt_ocr_real_provider_test.dart",
      "-d",
      "emulator-5554",
      "--timeout",
      "6h",
      "--machine",
      "--no-pub",
    ],
  });
  assert.throws(() => parseArgs([
    `--stdout=${path.join(os.tmpdir(), "stdout.log")}`,
    `--stderr=${path.join(os.tmpdir(), "stderr.log")}`,
    "--max-bytes=64",
    "--platform=android",
    "--device=attacker-command",
  ]), /invalid device/);
});
