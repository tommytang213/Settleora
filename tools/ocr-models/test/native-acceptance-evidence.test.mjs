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
    writeFileSync(`${log}.stderr`, "", { mode: 0o600 });
    return callback(log);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function protocolLog(...messages) {
  return [
    { type: "start", time: 0, protocolVersion: "0.1.1", runnerVersion: null, pid: 1 },
    {
      type: "testStart",
      time: 1,
      test: {
        id: 1,
        suiteID: 1,
        groupIDs: [],
        name: "bounded native acceptance fixture",
        metadata: { skip: false, skipReason: null },
        line: null,
        column: null,
        url: null,
      },
    },
    ...messages.map((message) => ({
      type: "print",
      time: 2,
      testID: 1,
      messageType: "print",
      message,
    })),
    { type: "testDone", time: 3, testID: 1, result: "success", skipped: false, hidden: false },
    { type: "done", time: 4, success: true },
  ].map((event) => JSON.stringify(event)).join("\n") + "\n";
}

function evidenceArgs(log, platform = "android") {
  return {
    log,
    "stderr-log": `${log}.stderr`,
    platform,
    "source-sha": sourceSha,
    "test-status": "0",
    "runner-image": "test-runner-1",
    "os-runtime": `${platform}-test-runtime`,
    "sdk-toolchain": "test-sdk-1",
    device: "test-device",
    "native-image": `${platform}-test-image-1`,
    "base-sha": "e4d4edd0d6854845cc67b00924f6d22af6a70688",
  };
}

test("accepts Flutter 3.44.8 start events with a null runner version", () => {
  withLog(protocolLog(), (log) => {
    assert.doesNotThrow(() => buildEvidence(evidenceArgs(log), repoRoot));
  });
});

test("rejects start events that omit the runner version property", () => {
  const log = protocolLog();
  const events = log.trimEnd().split("\n").map((line) => JSON.parse(line));
  delete events[0].runnerVersion;
  withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (logPath) => {
    assert.throws(
      () => buildEvidence(evidenceArgs(logPath), repoRoot),
      /runnerVersion is required/,
    );
  });
});

test("retains only the bounded native acceptance schema", () => {
  const acceptance = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    networkIsolated: true,
    fixtureCount: 101,
    passedFixtureCount: 100,
    mismatchCount: 1,
    mismatches: [{ fixtureId: "fixture_001", field: "items[0].description" }],
    runtime: "onnxruntime-android:1.21.1:cpu",
    coldLoadTimeMs: 25,
    endToEndLatencyMs: { sampleCount: 101, cold: 30, warmP50: 20, warmP95: 24, max: 30 },
    nativeLatencyMs: { sampleCount: 101, cold: 28, warmP50: 18, warmP95: 22, max: 28 },
    peakRssBytes: 123456,
    perScript: { Latin: { total: 101, passed: 100 } },
  };
  const uiSmoke = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    fixtureId: "fixture_001",
    previewPanel: true,
    applyBoundaryVisible: true,
  };
  withLog(
    protocolLog(
      `SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`,
      `SETTLEORA_OCR_UI_SMOKE=${JSON.stringify(uiSmoke)}`,
    ),
    (log) => {
      const evidence = buildEvidence(
        {
          ...evidenceArgs(log),
          "full-bytes": "200",
          "model-free-bytes": "150",
          "base-app-bytes": "100",
        },
        repoRoot,
      );
      assert.equal(evidence.acceptance.completed, true);
      assert.equal(evidence.uiSmoke.completed, true);
      assert.equal(evidence.packageEvidence.bundledModelPackageDeltaBytes, 50);
      assert.equal(evidence.packageEvidence.ocrStackPackageDeltaBytes, 100);
      assert.equal(evidence.identities.fixtureTreeSha256.length, 64);
      assert.equal(evidence.execution.testExitStatus, 0);
      assert.equal(evidence.execution.protocolSucceeded, true);
      assert.equal(evidence.execution.environment.device, "test-device");
      assert.equal(evidence.identities.baseAppSha, evidenceArgs(log)["base-sha"]);
      assert.deepEqual(Object.keys(evidence.acceptance.mismatches[0]), ["fixtureId", "field"]);
    },
  );
});

test("complete evidence requires both package measurements and a positive delta", () => {
  const evidence = {
    execution: { testExitStatus: 0, protocolSucceeded: true },
    acceptance: {
      completed: true,
      networkIsolated: true,
      passedFixtureCount: 101,
      mismatchCount: 0,
      runtime: "test-runtime",
      coldLoadTimeMs: 1,
      endToEndLatencyMs: { sampleCount: 101, cold: 1, warmP50: 1, warmP95: 1, max: 1 },
      nativeLatencyMs: { sampleCount: 101, cold: 1, warmP50: 1, warmP95: 1, max: 1 },
      peakRssBytes: 1,
    },
    uiSmoke: { completed: true, previewPanel: true, applyBoundaryVisible: true },
    packageEvidence: {
      fullBytes: 200,
      baselineWithoutBundledModelPayloadBytes: 150,
      bundledModelPackageDeltaBytes: 50,
      baseAppBytes: 100,
      ocrStackPackageDeltaBytes: 100,
    },
  };
  assert.equal(isCompleteEvidence(evidence), true);
  assert.equal(
    isCompleteEvidence({
      ...evidence,
      acceptance: { ...evidence.acceptance, networkIsolated: false },
    }),
    false,
  );
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
    const stderrLog = `${log}.stderr`;
    const out = path.join(temporaryDirectory, "evidence.json");
    writeFileSync(
      log,
      protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({ schemaVersion: 1, platform: "android", completed: true, runtime: "private raw receipt text" })}`),
      { mode: 0o600 },
    );
    writeFileSync(stderrLog, "", { mode: 0o600 });
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "tools/ocr-models/native-acceptance-evidence.mjs"),
        `--log=${log}`,
        `--stderr-log=${stderrLog}`,
        `--out=${out}`,
        "--platform=android",
        `--source-sha=${sourceSha}`,
        "--test-status=0",
        "--runner-image=test-runner-1",
        "--os-runtime=android-test-runtime",
        "--sdk-toolchain=test-sdk-1",
        "--device=test-device",
        "--native-image=android-test-image-1",
        "--base-sha=e4d4edd0d6854845cc67b00924f6d22af6a70688",
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
  withLog(protocolLog(), (log) => {
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

test("rejects all non-allowlisted application output and unresolved environment identity", () => {
  withLog(protocolLog("native diagnostic: unexpected receipt text"), (log) => {
    assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /non-allowlisted/);
  });
  withLog(protocolLog(), (log) => {
    assert.throws(
      () => buildEvidence({ ...evidenceArgs(log), "runner-image": "unknown-unknown" }, repoRoot),
      /must be resolved/,
    );
  });
});

test("rejects non-allowlisted marker fields before evidence can be accepted", () => {
  const marker = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    rawOcrText: "private receipt text",
  };
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(marker)}`), (log) => {
    assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /non-allowlisted fields/);
  });
});

test("rejects extra fields on otherwise allowlisted machine-protocol events", () => {
  const injected = `${JSON.stringify({
    type: "done",
    time: 2,
    success: true,
    rawReceiptText: "private",
  })}\n`;
  withLog(injected, (log) => {
    assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /non-allowlisted fields/);
  });
});

test("discards bounded Flutter failure envelopes without retaining their text", () => {
  const errorEvent = JSON.stringify({
    type: "error",
    time: 2,
    testID: 1,
    error: "diagnostic text that must not be retained",
    stackTrace: "private local path that must not be retained",
    isFailure: true,
  });
  const log = protocolLog().replace(
    '{"type":"testDone","time":3,"testID":1,"result":"success","skipped":false,"hidden":false}',
    `${errorEvent}\n{"type":"testDone","time":3,"testID":1,"result":"success","skipped":false,"hidden":false}`,
  );
  withLog(log, (logPath) => {
    const evidence = buildEvidence(evidenceArgs(logPath), repoRoot);
    assert.equal(evidence.execution.protocolSucceeded, false);
    assert.equal(isCompleteEvidence(evidence), false);
    assert.equal(JSON.stringify(evidence).includes("diagnostic text"), false);
    assert.equal(JSON.stringify(evidence).includes("private local path"), false);
  });
});

test("rejects contradictory unsuccessful protocol completion", () => {
  const log = protocolLog().replace(
    '{"type":"done","time":4,"success":true}',
    '{"type":"done","time":4,"success":false}',
  );
  withLog(log, (logPath) => {
    const evidence = buildEvidence(evidenceArgs(logPath), repoRoot);
    assert.equal(evidence.execution.protocolSucceeded, false);
    assert.equal(isCompleteEvidence(evidence), false);
  });
});

test("discards bounded stderr diagnostics without retaining their text", () => {
  withLog(protocolLog(), (logPath) => {
    writeFileSync(
      `${logPath}.stderr`,
      "private toolchain path and diagnostic text\n",
      { mode: 0o600 },
    );
    const evidence = buildEvidence(evidenceArgs(logPath), repoRoot);
    assert.equal(JSON.stringify(evidence).includes("private toolchain path"), false);
    assert.equal(JSON.stringify(evidence).includes("diagnostic text"), false);
  });
});

test("retains bounded partial metrics for a failed run without accepting it", () => {
  const acceptance = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    networkIsolated: true,
    fixtureCount: 101,
    passedFixtureCount: 0,
    mismatchCount: 101,
    mismatches: Array.from({ length: 101 }, (_, index) => ({
      fixtureId: `fixture_${index}`,
      field: "provider_status",
    })),
    runtime: null,
    coldLoadTimeMs: null,
    endToEndLatencyMs: { sampleCount: 0, cold: null, warmP50: null, warmP95: null, max: null },
    nativeLatencyMs: { sampleCount: 0, cold: null, warmP50: null, warmP95: null, max: null },
    peakRssBytes: 1,
    perScript: { Latin: { total: 101, passed: 0 } },
  };
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`), (logPath) => {
    const evidence = buildEvidence({ ...evidenceArgs(logPath), "test-status": "1" }, repoRoot);
    assert.equal(evidence.acceptance.mismatchCount, 101);
    assert.equal(evidence.acceptance.runtime, null);
    assert.equal(isCompleteEvidence(evidence), false);
  });
});

test("rejects malformed protocol ordering and inactive test references", () => {
  const beforeStart = `${JSON.stringify({ type: "done", time: 0, success: true })}\n${protocolLog()}`;
  withLog(beforeStart, (logPath) => {
    assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /before start/);
  });
  const inactivePrint = protocolLog("SETTLEORA_OCR_UI_SMOKE={}")
    .replace('"testID":1,"messageType"', '"testID":99,"messageType"');
  withLog(inactivePrint, (logPath) => {
    assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /inactive test/);
  });
  const unfinished = protocolLog().replace(
    '{"type":"testDone","time":3,"testID":1,"result":"success","skipped":false,"hidden":false}\n',
    "",
  );
  withLog(unfinished, (logPath) => {
    assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /unfinished tests/);
  });
  const afterDone = `${protocolLog()}${JSON.stringify([{ event: "test.startedProcess", params: { vmServiceUri: null } }])}\n`;
  withLog(afterDone, (logPath) => {
    assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /after completion/);
  });
});

test("rejects non-print Flutter message types", () => {
  const log = protocolLog("SETTLEORA_OCR_ACCEPTANCE={}")
    .replace('"messageType":"print"', '"messageType":"skip"');
  withLog(log, (path) => {
    assert.throws(() => buildEvidence(evidenceArgs(path), repoRoot), /messageType is invalid/);
  });
});

test("rejects duplicate bounded markers instead of trusting only the last marker", () => {
  const raw = "SETTLEORA_OCR_ACCEPTANCE=private receipt text";
  const later = "SETTLEORA_OCR_ACCEPTANCE={}";
  withLog(protocolLog(raw, later), (log) => {
    assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /duplicate bounded markers/);
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
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`), (log) => {
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
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`), (log) => {
    assert.throws(
      () => buildEvidence(evidenceArgs(log), repoRoot),
      /internally inconsistent/,
    );
  });
  withLog(protocolLog(), (log) => {
    assert.throws(
      () => buildEvidence(
        {
          ...evidenceArgs(log),
          "full-bytes": "100",
          "model-free-bytes": "101",
          "base-app-bytes": "50",
        },
        repoRoot,
      ),
      /cannot be negative/,
    );
  });
});
