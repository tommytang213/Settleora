import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildEvidence } from "../native-acceptance-evidence.mjs";

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
    endToEndLatencyMs: { cold: 30, warmP50: 20, warmP95: 24, max: 30 },
    nativeLatencyMs: { cold: 28, warmP50: 18, warmP95: 22, max: 28 },
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
          log,
          platform: "android",
          "source-sha": sourceSha,
          "full-bytes": "200",
          "baseline-bytes": "150",
        },
        repoRoot,
      );
      assert.equal(evidence.acceptance.completed, true);
      assert.equal(evidence.uiSmoke.completed, true);
      assert.equal(evidence.packageEvidence.bundledModelPackageDeltaBytes, 50);
      assert.equal(JSON.stringify(evidence).includes("private"), false);
    },
  );
});

test("produces bounded incomplete evidence when device execution emits no markers", () => {
  withLog("device did not boot\n", (log) => {
    const evidence = buildEvidence(
      { log, platform: "ios", "source-sha": sourceSha },
      repoRoot,
    );
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
    endToEndLatencyMs: { cold: null, warmP50: null, warmP95: null, max: null },
    nativeLatencyMs: { cold: null, warmP50: null, warmP95: null, max: null },
    peakRssBytes: 1,
    perScript: {},
  };
  withLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}\n`, (log) => {
    assert.throws(
      () => buildEvidence({ log, platform: "android", "source-sha": sourceSha }, repoRoot),
      /bounded evidence token/,
    );
  });
});
