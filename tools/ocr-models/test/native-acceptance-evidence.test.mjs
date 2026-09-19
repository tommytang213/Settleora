import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildEvidence, isCompleteEvidence } from "../native-acceptance-evidence.mjs";

const sourceSha = "a".repeat(40);
const repoRoot = path.resolve(import.meta.dirname, "../../..");

function withLog(contents, callback) {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "settleora-ocr-evidence-"));
  try {
    const log = path.join(temporaryDirectory, "acceptance.log");
    writeFileSync(log, contents, { mode: 0o600 });
    return callback(log);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function evidenceArgs(log, platform = "android") {
  return {
    log,
    platform,
    "source-sha": sourceSha,
    "test-status": "0",
    "runner-image": "test-runner-1",
    "os-runtime": `${platform}-test-runtime`,
    "sdk-toolchain": "test-sdk-1",
    device: "test-device",
  };
}

test("retains only the bounded native acceptance schema", () => {
  const acceptance = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    fixtureCount: 101,
    passedFixtureCount: 100,
    mismatchCount: 1,
    mismatches: [{ fixtureId: "fixture_001", field: "items[0].description", rawText: "private" }],
    runtime: "onnxruntime-android:1.21.1:cpu",
    coldLoadTimeMs: 25,
    endToEndLatencyMs: { sampleCount: 101, cold: 30, warmP50: 20, warmP95: 24, max: 30 },
    nativeLatencyMs: { sampleCount: 101, cold: 28, warmP50: 18, warmP95: 22, max: 28 },
    peakRssBytes: 123456,
    perScript: { Latin: { total: 101, passed: 100, leaked: "private" } },
    rawOcrText: "private",
  };
  const uiSmoke = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    fixtureId: "fixture_001",
    previewPanel: true,
    applyBoundaryVisible: true,
    rawOcrText: "private",
  };
  withLog(
    `SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}\nSETTLEORA_OCR_UI_SMOKE=${JSON.stringify(uiSmoke)}\n`,
    (log) => {
      const evidence = buildEvidence(
        {
          ...evidenceArgs(log),
          "full-bytes": "200",
          "baseline-bytes": "150",
        },
        repoRoot,
      );
      assert.equal(evidence.acceptance.completed, true);
      assert.equal(evidence.uiSmoke.completed, true);
      assert.equal(evidence.packageEvidence.bundledModelPackageDeltaBytes, 50);
      assert.equal(evidence.identities.fixtureTreeSha256.length, 64);
      assert.equal(evidence.execution.testExitStatus, 0);
      assert.equal(evidence.execution.environment.device, "test-device");
      assert.equal(JSON.stringify(evidence).includes("private"), false);
    },
  );
});

test("complete evidence requires both package measurements and a positive delta", () => {
  const evidence = {
    execution: { testExitStatus: 0 },
    acceptance: {
      completed: true,
      passedFixtureCount: 101,
      mismatchCount: 0,
      coldLoadTimeMs: 1,
      endToEndLatencyMs: { sampleCount: 101 },
      nativeLatencyMs: { sampleCount: 101 },
      peakRssBytes: 1,
    },
    uiSmoke: { completed: true, previewPanel: true, applyBoundaryVisible: true },
    packageEvidence: {
      fullBytes: 200,
      baselineWithoutBundledModelPayloadBytes: 150,
      bundledModelPackageDeltaBytes: 50,
    },
  };
  assert.equal(isCompleteEvidence(evidence), true);
  assert.equal(isCompleteEvidence({ ...evidence, execution: { testExitStatus: 1 } }), false);
  assert.equal(
    isCompleteEvidence({
      ...evidence,
      packageEvidence: { ...evidence.packageEvidence, bundledModelPackageDeltaBytes: 0 },
    }),
    false,
  );
  assert.equal(
    isCompleteEvidence({
      ...evidence,
      packageEvidence: { ...evidence.packageEvidence, fullBytes: null },
    }),
    false,
  );
});

test("CLI writes a bounded failure artifact before rejecting malformed markers", () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "settleora-ocr-evidence-cli-"));
  try {
    const log = path.join(temporaryDirectory, "acceptance.log");
    const out = path.join(temporaryDirectory, "evidence.json");
    writeFileSync(
      log,
      `SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({ schemaVersion: 1, platform: "android", completed: true, runtime: "private raw receipt text" })}\n`,
      { mode: 0o600 },
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "tools/ocr-models/native-acceptance-evidence.mjs"),
        `--log=${log}`,
        `--out=${out}`,
        "--platform=android",
        `--source-sha=${sourceSha}`,
        "--test-status=0",
        "--runner-image=test-runner-1",
        "--os-runtime=android-test-runtime",
        "--sdk-toolchain=test-sdk-1",
        "--device=test-device",
        "--require-complete=true",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    const retained = readFileSync(out, "utf8");
    assert.match(retained, /invalid_or_unavailable_bounded_evidence/);
    assert.equal(retained.includes("private raw receipt text"), false);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("produces bounded incomplete evidence when device execution emits no markers", () => {
  withLog("device did not boot\n", (log) => {
    const evidence = buildEvidence(evidenceArgs(log, "ios"), repoRoot);
    assert.deepEqual(evidence.acceptance, {
      schemaVersion: 1,
      platform: "ios",
      completed: false,
      markerProduced: false,
    });
    assert.equal(evidence.packageEvidence.fullBytes, null);
    assert.equal(evidence.packageEvidence.bundledModelPackageDeltaBytes, null);
  });
});

test("rejects unbounded marker tokens rather than retaining arbitrary OCR text", () => {
  const acceptance = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    fixtureCount: 101,
    passedFixtureCount: 0,
    mismatchCount: 1,
    mismatches: [{ fixtureId: "private receipt text with spaces", field: "merchant" }],
    runtime: null,
    coldLoadTimeMs: null,
    endToEndLatencyMs: { sampleCount: 0, cold: null, warmP50: null, warmP95: null, max: null },
    nativeLatencyMs: { sampleCount: 0, cold: null, warmP50: null, warmP95: null, max: null },
    peakRssBytes: 1,
    perScript: {},
  };
  withLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}\n`, (log) => {
    assert.throws(
      () => buildEvidence(evidenceArgs(log), repoRoot),
      /bounded evidence token/,
    );
  });
});

test("rejects contradictory aggregate counts and package measurements", () => {
  const acceptance = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    fixtureCount: 101,
    passedFixtureCount: 101,
    mismatchCount: 1,
    mismatches: [{ fixtureId: "fixture_001", field: "merchant" }],
    runtime: "onnxruntime-android:1.21.1:cpu",
    coldLoadTimeMs: 1,
    endToEndLatencyMs: { sampleCount: 101, cold: 1, warmP50: 1, warmP95: 1, max: 1 },
    nativeLatencyMs: { sampleCount: 101, cold: 1, warmP50: 1, warmP95: 1, max: 1 },
    peakRssBytes: 1,
    perScript: { Latin: { total: 101, passed: 101 } },
  };
  withLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}\n`, (log) => {
    assert.throws(
      () => buildEvidence(evidenceArgs(log), repoRoot),
      /internally inconsistent/,
    );
  });
  withLog("device did not boot\n", (log) => {
    assert.throws(
      () => buildEvidence(
        {
          ...evidenceArgs(log),
          "full-bytes": "100",
          "baseline-bytes": "101",
        },
        repoRoot,
      ),
      /cannot be negative/,
    );
  });
});
