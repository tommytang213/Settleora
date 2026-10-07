import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { summarizeFlutterRunner } from "../flutter-runner-diagnostics.mjs";
import { buildFailureEvidence, isCompleteEvidence } from "../native-acceptance-evidence.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
function withStreams(stdout, stderr, run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "flutter-diagnostics-"));
  const out = path.join(root, "stdout"), err = path.join(root, "stderr");
  try {
    writeFileSync(out, stdout); writeFileSync(err, stderr);
    run(out, err, root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const events = (...values) => values.map(JSON.stringify).join("\n") + "\n";
const secret = "SECRET_TOKEN_https://private.example/receipt?token=123_/private/customer/name";

test("normal machine completion retains only counts, never names, URIs or print payloads", () => {
  withStreams(events(
    { type: "start" }, { type: "suite", suite: { path: secret } },
    [{ event: "test.startedProcess", params: { vmServiceUri: secret } }],
    { type: "testStart", test: { name: secret } },
    { type: "print", message: `SocketException: ${secret}` },
    { type: "testDone", result: "success" }, { type: "done", success: true },
  ), "", (out, err) => {
    const result = summarizeFlutterRunner(out, err);
    assert.equal(result.stdout.state, "complete");
    assert.equal(result.stdout.eventCounts.start, 1);
    assert.equal(result.stdout.eventCounts.testStart, 1);
    assert.equal(result.stdout.doneSuccessEvents, 1);
    assert.equal(result.stdout.vmServiceAnnouncementEvents, 1);
    assert.equal(result.stderr.state, "empty");
    assert.deepEqual(result.stdout.signatureCategories, []);
    assert.ok(!JSON.stringify(result).includes(secret));
  });
});

test("early Flutter failure retains fixed categories and machine progress without error text", () => {
  withStreams(events(
    { type: "start" },
    { type: "error", error: `Failed to load '${secret}':\nUnable to start the app on the device.`, stackTrace: secret },
    { type: "testDone", result: "error" }, { type: "done", success: false },
  ), `Error executing simctl: 1\nProcessException: ${secret}\n`, (out, err) => {
    const result = summarizeFlutterRunner(out, err);
    assert.deepEqual(result.stdout.signatureCategories, ["test_load_failed", "app_start_failed"]);
    assert.deepEqual(result.stderr.signatureCategories, ["simulator_control_failed", "process_exception"]);
    assert.equal(result.stdout.eventCounts.testStart, 0);
    assert.equal(result.stdout.failedTestEvents, 1);
    assert.equal(result.stdout.doneFailureEvents, 1);
    assert.ok(!JSON.stringify(result).includes(secret));
  });
});

test("unrecognized and malformed content is discarded, with no arbitrary property coercion", () => {
  withStreams(events(
    null, 7, [secret], { type: { toString: null, valueOf: null }, message: secret },
    { type: "__proto__", error: secret }, { type: "unknown", error: secret },
  ) + secret, secret, (out, err) => {
    const result = summarizeFlutterRunner(out, err);
    assert.deepEqual(result.stdout.signatureCategories, []);
    assert.deepEqual(result.stderr.signatureCategories, []);
    assert.equal(result.stdout.unclassifiedLines, 7);
    assert.ok(!JSON.stringify(result).includes(secret));
    assert.ok(JSON.stringify(result).length < 2048);
  });
});

test("truncation skips oversized and partial lines, caps counts and never parses a cropped error", () => {
  withStreams(events({ type: "start" }) + "x".repeat(65537) + "\n" +
    "{}\n".repeat(10002) + "x".repeat(1024 * 1024) + "\nProcessException: hidden\n",
  "x".repeat(1024 * 1024 + 1), (out, err) => {
    const result = summarizeFlutterRunner(out, err);
    assert.equal(result.stdout.state, "prefix_only");
    assert.equal(result.stdout.scannedBytes, 1024 * 1024);
    assert.equal(result.stdout.omittedOversizeLines, 1);
    assert.equal(result.stdout.omittedPartialLine, true);
    assert.equal(result.stdout.unclassifiedLines, 10000);
    assert.equal(result.stdout.countsCapped, true);
    assert.equal(result.stdout.eventCounts.start, 1);
    assert.deepEqual(result.stdout.signatureCategories, []);
    assert.equal(result.stderr.omittedPartialLine, true);
  });
});

test("missing, nonregular and symlink evidence is unavailable, not empty success", () => {
  withStreams("", "", (out, err, root) => {
    const missing = path.join(root, "missing"), link = path.join(root, "link"), dir = path.join(root, "directory");
    symlinkSync(out, link); mkdirSync(dir);
    for (const file of [missing, link, dir, undefined]) {
      const result = summarizeFlutterRunner(file, err);
      assert.equal(result.stdout.state, "unavailable");
      assert.equal(result.stdout.scannedBytes, 0);
      assert.equal(result.stdout.doneSuccessEvents, 0);
    }
  });
});

test("iOS CLI uploads bounded hints but still rejects every nonempty stderr and missing corpus", () => {
  withStreams(events({ type: "start" }, { type: "done", success: true }),
    `Error waiting for a debug connection: ${secret}\n`, (out, err, root) => {
      const artifact = path.join(root, "evidence.json");
      const args = { log: out, "stderr-log": err, out: artifact, platform: "ios", "source-sha": "a".repeat(40),
        "test-status": "1", "runner-image": "test", "os-runtime": "test", "sdk-toolchain": "test", device: "test",
        "native-image": "test", "base-sha": "b".repeat(40), "base-tree": "c".repeat(40),
        "base-tooling-sha": "a".repeat(40), "base-dependency-lock-sha256": "d".repeat(64), "require-complete": "true" };
      const run = spawnSync(process.execPath, ["tools/ocr-models/native-acceptance-evidence.mjs",
        ...Object.entries(args).map(([key, value]) => `--${key}=${value}`)], { cwd: repoRoot, encoding: "utf8" });
      assert.equal(run.status, 1);
      assert.equal(run.stderr, "bounded_native_ocr_evidence_failed\n");
      const value = JSON.parse(readFileSync(artifact, "utf8"));
      assert.equal(value.collectionFailureReason, "non_allowlisted_stderr");
      assert.equal(value.stderrDiagnostic, "other_nonempty");
      assert.equal(value.acceptance.completed, false);
      assert.equal(value.uiSmoke.completed, false);
      assert.deepEqual(value.flutterRunnerDiagnostics.stderr.signatureCategories, ["debug_connection_failed"]);
      assert.equal(isCompleteEvidence(value), false);
      assert.ok(!JSON.stringify(value).includes(secret));
      assert.equal(Object.hasOwn(buildFailureEvidence({ ...args, platform: "android" }), "flutterRunnerDiagnostics"), false);
    });
});
