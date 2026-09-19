import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const capture = path.resolve(import.meta.dirname, "../bounded-process-capture.mjs");

function withCapture(callback) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "settleora-bounded-capture-"));
  try {
    return callback({
      stdoutPath: path.join(directory, "stdout.log"),
      stderrPath: path.join(directory, "stderr.log"),
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("captures bounded stdout and stderr and preserves the child status", () => {
  withCapture(({ stdoutPath, stderrPath }) => {
    writeFileSync(stdoutPath, "old stdout", { mode: 0o644 });
    writeFileSync(stderrPath, "old stderr", { mode: 0o644 });
    chmodSync(stdoutPath, 0o644);
    chmodSync(stderrPath, 0o644);
    const result = spawnSync(process.execPath, [
      capture,
      `--stdout=${stdoutPath}`,
      `--stderr=${stderrPath}`,
      "--max-bytes=64",
      "--",
      process.execPath,
      "-e",
      "process.stdout.write('safe-out'); process.stderr.write('safe-error'); process.exit(7)",
    ], { encoding: "utf8" });
    assert.equal(result.status, 7);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.equal(readFileSync(stdoutPath, "utf8"), "safe-out");
    assert.equal(readFileSync(stderrPath, "utf8"), "safe-error");
    assert.equal(statSync(stdoutPath).mode & 0o777, 0o600);
    assert.equal(statSync(stderrPath).mode & 0o777, 0o600);
  });
});

test("terminates on overflow without echoing captured content", () => {
  withCapture(({ stdoutPath, stderrPath }) => {
    const privateText = "private-receipt-content";
    const result = spawnSync(process.execPath, [
      capture,
      `--stdout=${stdoutPath}`,
      `--stderr=${stderrPath}`,
      "--max-bytes=16",
      "--",
      process.execPath,
      "-e",
      `process.stdout.write(${JSON.stringify(privateText.repeat(100))}); setInterval(() => {}, 1000)`,
    ], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 97);
    assert.equal(result.stdout.includes(privateText), false);
    assert.equal(result.stderr.includes(privateText), false);
    assert.equal(readFileSync(stdoutPath).length, 16);
    assert.equal(readFileSync(stderrPath).length, 0);
  });
});

test("rejects unknown and duplicate wrapper options without echoing their values", () => {
  for (const invalidOption of ["--unknown=private-value", "--max-bytes=8"]) {
    const result = spawnSync(process.execPath, [
      capture,
      `--stdout=${path.join(os.tmpdir(), "stdout.log")}`,
      `--stderr=${path.join(os.tmpdir(), "stderr.log")}`,
      "--max-bytes=16",
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
