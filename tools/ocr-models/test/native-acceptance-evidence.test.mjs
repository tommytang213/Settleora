import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildEvidence, buildFailureEvidence, isCompleteEvidence } from "../native-acceptance-evidence.mjs";

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
  const testNames = [
    "native acceptance runner has no external network",
    "all 101 real images match complete preview truth",
    "a real fixture rotated 270 degrees matches complete truth",
    "representative production receipt review UI uses real provider",
  ];
  const ownerIndex = (message) => message.startsWith("SETTLEORA_OCR_UI_SMOKE=") ? 3 : 1;
  return [
    { type: "start", time: 0, protocolVersion: "0.1.1", runnerVersion: null, pid: 1 },
    { type: "allSuites", time: 0, count: 1 },
    { type: "suite", time: 0, suite: { id: 1, platform: "vm", path: "integration_test/receipt_ocr_real_provider_test.dart" } },
    { type: "group", time: 0, group: { id: 1, suiteID: 1, parentID: null, name: "", metadata: { skip: false, skipReason: null }, testCount: 4, line: null, column: null, url: null } },
    ...testNames.flatMap((name, index) => [
      { type: "testStart", time: 1, test: { id: index + 1, suiteID: 1, groupIDs: [1], name, metadata: { skip: false, skipReason: null }, line: null, column: null, url: null } },
      ...messages.filter((message) => ownerIndex(message) === index).map((message) => ({ type: "print", time: 2, testID: index + 1, messageType: "print", message })),
      { type: "testDone", time: 3, testID: index + 1, result: "success", skipped: false, hidden: false },
    ]),
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
    "base-tree": "3ac1c3a2177445304a116102fce3ff4553f70719",
    "base-tooling-sha": sourceSha,
    "base-dependency-lock-sha256": "9".repeat(64),
  };
}

test("accepts Flutter 3.44.8 start events with a null runner version", () => {
  withLog(protocolLog(), (log) => {
    assert.doesNotThrow(() => buildEvidence(evidenceArgs(log), repoRoot));
  });
});

test("binds package baseline evidence to source, dependency lock, and exact tooling", () => {
  withLog(protocolLog(), (log) => {
    const args = evidenceArgs(log);
    assert.throws(
      () => buildEvidence({ ...args, "base-tree": "0".repeat(40) }, repoRoot),
      /Base app tree is invalid/,
    );
    assert.throws(
      () => buildEvidence({ ...args, "base-tooling-sha": "0".repeat(40) }, repoRoot),
      /tooling SHA must match/,
    );
    assert.throws(
      () => buildEvidence({ ...args, "base-dependency-lock-sha256": "invalid" }, repoRoot),
      /dependency lock identity is invalid/,
    );
  });
});

test("rejects start events that omit the runner version property", () => {
  const log = protocolLog();
  const events = log.trimEnd().split("\n").map((line) => JSON.parse(line));
  delete events[0].runnerVersion;
  withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (logPath) => {
    assert.throws(
      () => buildEvidence(evidenceArgs(logPath), repoRoot),
      /missing required fields/,
    );
  });
});

test("rejects any protocol event that omits a declared schema property", () => {
  const events = protocolLog().trimEnd().split("\n").map((line) => JSON.parse(line));
  delete events.find((event) => event.type === "testDone").hidden;
  withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (logPath) => {
    assert.throws(
      () => buildEvidence(evidenceArgs(logPath), repoRoot),
      /missing required fields/,
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
          "verified-model-file-count": "14",
          "verified-catalog-file-count": "1",
          "verified-fixture-absence-count": "102",
          "package-sha256": "b".repeat(64),
          "signer-certificate-sha256": "c".repeat(64),
        },
        repoRoot,
      );
      assert.equal(evidence.acceptance.completed, true);
      assert.equal(evidence.uiSmoke.completed, true);
      assert.equal(evidence.packageEvidence.bundledModelPackageDeltaBytes, 50);
      assert.equal(evidence.packageEvidence.ocrStackPackageDeltaBytes, 100);
      assert.equal(evidence.packageEvidence.catalogModelFileCount, 14);
      assert.equal(evidence.packageEvidence.verifiedModelFileCount, 14);
      assert.equal(evidence.packageEvidence.verifiedCatalogFileCount, 1);
      assert.equal(evidence.packageEvidence.verifiedFixtureAbsenceCount, 102);
      assert.equal(evidence.identities.fixtureTreeSha256.length, 64);
      assert.equal(evidence.execution.testExitStatus, 0);
      assert.equal(evidence.execution.protocolSucceeded, true);
      assert.equal(evidence.execution.environment.device, "test-device");
      assert.equal(evidence.identities.baseAppSha, evidenceArgs(log)["base-sha"]);
      assert.equal(evidence.identities.baseAppTree, evidenceArgs(log)["base-tree"]);
      assert.equal(evidence.identities.baseMeasurementToolingSha, sourceSha);
      assert.equal(evidence.identities.baseDependencyLockSha256, "9".repeat(64));
      assert.match(evidence.identities.baseCompositeSha256, /^[0-9a-f]{64}$/);
      assert.deepEqual(Object.keys(evidence.acceptance.mismatches[0]), ["fixtureId", "field"]);
    },
  );
});

test("complete evidence requires both package measurements and a positive delta", () => {
  const evidence = {
    platform: "android",
    execution: { testExitStatus: 0, protocolSucceeded: true, preflightFailurePhase: null },
    diagnostics: [],
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
      catalogModelFileCount: 14,
      expectedCatalogFileCount: 1,
      verifiedCatalogFileCount: 1,
      verifiedModelFileCount: 14,
      expectedFixtureAbsenceCount: 102,
      verifiedFixtureAbsenceCount: 102,
      packageSha256: "b".repeat(64),
      signerCertificateSha256: "c".repeat(64),
    },
    identities: { baseCompositeSha256: "9".repeat(64) },
  };
  assert.equal(isCompleteEvidence(evidence), true);
  assert.equal(isCompleteEvidence({ ...evidence,
    packageEvidence: { ...evidence.packageEvidence, signerCertificateSha256: null } }), false);
  assert.equal(isCompleteEvidence({ ...evidence, identities: undefined }), false);
  assert.equal(
    isCompleteEvidence({
      ...evidence,
      packageEvidence: { ...evidence.packageEvidence, verifiedModelFileCount: 13 },
    }),
    false,
  );
  assert.equal(
    isCompleteEvidence({
      ...evidence,
      execution: { ...evidence.execution, preflightFailurePhase: "isolate_wifi" },
    }),
    false,
  );
  assert.equal(
    isCompleteEvidence({
      ...evidence,
      diagnostics: [{ schemaVersion: 1, platform: "android", stage: "corpus_provider", fixtureId: "fixture_001" }],
    }),
    false,
  );
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
    assert.equal(result.stderr, "bounded_native_ocr_evidence_failed\n");
    assert.equal(result.stderr.includes(repoRoot), false);
    assert.doesNotMatch(result.stderr, /\bat\s|Error:/);
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

test("retains only an allowlisted Android preflight failure phase", () => {
  withLog(protocolLog(), (logPath) => {
    for (const phase of ["verify_airplane_mode", "verify_mobile_data"]) {
      const stateEvidence = buildEvidence(
        { ...evidenceArgs(logPath), "test-status": "20", "failure-phase": phase },
        repoRoot,
      );
      assert.equal(stateEvidence.execution.preflightFailurePhase, phase);
      assert.equal(isCompleteEvidence(stateEvidence), false);
    }
    const setupEvidence = buildEvidence(
      { ...evidenceArgs(logPath), "test-status": "20", "failure-phase": "kvm_setup" },
      repoRoot,
    );
    assert.equal(setupEvidence.execution.preflightFailurePhase, "kvm_setup");
    assert.equal(isCompleteEvidence(setupEvidence), false);
    const kvmEvidence = buildEvidence(
      { ...evidenceArgs(logPath), "test-status": "20", "failure-phase": "kvm_preflight" },
      repoRoot,
    );
    assert.equal(kvmEvidence.execution.preflightFailurePhase, "kvm_preflight");
    assert.equal(isCompleteEvidence(kvmEvidence), false);
    const evidence = buildEvidence(
      { ...evidenceArgs(logPath), "test-status": "20", "failure-phase": "isolate_airplane_mode" },
      repoRoot,
    );
    assert.equal(evidence.execution.preflightFailurePhase, "isolate_airplane_mode");
    assert.equal(isCompleteEvidence(evidence), false);
    assert.throws(
      () => buildEvidence(
        { ...evidenceArgs(logPath), "test-status": "20", "failure-phase": "private diagnostic" },
        repoRoot,
      ),
      /Preflight failure phase is invalid/,
    );
  });
});

test("retains only an allowlisted iOS preflight failure phase", () => {
  withLog(protocolLog(), (logPath) => {
    for (const phase of [
      "build_network_isolation",
      "verify_network_environment_clean",
      "install_network_isolation",
      "verify_debug_link_config",
      "verify_network_link_path",
      "save_debug_link_config",
      "apply_debug_link_config",
      "verify_debug_link_setting",
      "enable_simulator_isolation",
      "cleanup_network_isolation",
    ]) {
      const evidence = buildEvidence(
        {
          ...evidenceArgs(logPath, "ios"),
          "test-status": "98",
          "failure-phase": phase,
        },
        repoRoot,
      );
      assert.equal(evidence.execution.preflightFailurePhase, phase);
      assert.equal(isCompleteEvidence(evidence), false);
    }
    assert.throws(
      () => buildEvidence(
        {
          ...evidenceArgs(logPath, "ios"),
          "test-status": "98",
          "failure-phase": "private diagnostic",
        },
        repoRoot,
      ),
      /Preflight failure phase is invalid/,
    );
  });
});

test("failure evidence retains bounded phase and status before environment collection", () => {
  assert.deepEqual(
    buildFailureEvidence({
      platform: "android",
      "source-sha": sourceSha,
      "test-status": "20",
      "failure-phase": "resolve_tools",
    }),
    {
      schemaVersion: 1,
      platform: "android",
      sourceSha,
      execution: {
        testExitStatus: 20,
        preflightFailurePhase: "resolve_tools",
        stdoutBytes: null,
        stderrBytes: null,
      },
      acceptance: { completed: false },
      uiSmoke: { completed: false },
      diagnostics: [],
      collectionFailure: "invalid_or_unavailable_bounded_evidence",
    },
  );
  const rejected = buildFailureEvidence({
    platform: "android",
    "source-sha": "not-a-sha",
    "test-status": "private",
    "failure-phase": "private diagnostic",
  });
  assert.deepEqual(rejected.execution, {
    testExitStatus: null,
    preflightFailurePhase: null,
    stdoutBytes: null,
    stderrBytes: null,
  });
  assert.equal(rejected.sourceSha, null);
  assert.equal(buildFailureEvidence({ "test-status": "" }).execution.testExitStatus, null);
  assert.equal(buildFailureEvidence({}).execution.testExitStatus, null);
  assert.deepEqual(
    buildFailureEvidence({
      platform: "ios",
      "source-sha": sourceSha,
      "test-status": "98",
      "failure-phase": "build_network_isolation",
    }).execution,
    {
      testExitStatus: 98,
      preflightFailurePhase: "build_network_isolation",
      stdoutBytes: null,
      stderrBytes: null,
    },
  );
});

test("failure evidence recovers only bounded diagnostics from an otherwise invalid protocol", () => {
  const diagnostic = {
    schemaVersion: 1,
    platform: "ios",
    stage: "network_environment",
    fixtureId: null,
  };
  const diagnosticEvent = JSON.stringify({
    type: "print",
    message: `SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(diagnostic)}`,
    privateField: "must not be retained",
  });
  withLog(`untrusted tool output\n${diagnosticEvent}\n`, (log) => {
    const evidence = buildFailureEvidence({
      ...evidenceArgs(log, "ios"),
      "test-status": "1",
    });
    assert.deepEqual(evidence.diagnostics, [diagnostic]);
    assert.equal(JSON.stringify(evidence).includes("privateField"), false);
    assert.equal(JSON.stringify(evidence).includes("untrusted tool output"), false);
    assert.equal(isCompleteEvidence(evidence), false);
  });
});

test("failure evidence recovers sanitized partial acceptance without trusting invalid protocol", () => {
  const acceptance = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    networkIsolated: true,
    fixtureCount: 101,
    passedFixtureCount: 100,
    mismatchCount: 1,
    mismatches: [{ fixtureId: "fixture_001", field: "provider_status" }],
    runtime: "onnxruntime-android:1.21.1:cpu",
    coldLoadTimeMs: 25,
    endToEndLatencyMs: { sampleCount: 101, cold: 30, warmP50: 20, warmP95: 24, max: 30 },
    nativeLatencyMs: { sampleCount: 101, cold: 28, warmP50: 18, warmP95: 22, max: 28 },
    peakRssBytes: 123456,
    perScript: { Latin: { total: 101, passed: 100 } },
  };
  const markerEvent = JSON.stringify({
    type: "print",
    message: `SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`,
    privateField: "must not be retained",
  });
  withLog(`untrusted tool output\n${markerEvent}\n`, (log) => {
    const evidence = buildFailureEvidence({
      ...evidenceArgs(log),
      "test-status": "1",
    });
    assert.deepEqual(evidence.acceptance, acceptance);
    assert.equal(evidence.collectionFailure, "invalid_or_unavailable_bounded_evidence");
    assert.equal(JSON.stringify(evidence).includes("privateField"), false);
    assert.equal(JSON.stringify(evidence).includes("untrusted tool output"), false);
    assert.equal(isCompleteEvidence(evidence), false);
  });
});

test("failure evidence rejects duplicate partial markers instead of selecting one", () => {
  const acceptance = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    networkIsolated: true,
    fixtureCount: 101,
    passedFixtureCount: 100,
    mismatchCount: 1,
    mismatches: [{ fixtureId: "fixture_001", field: "provider_status" }],
    runtime: "onnxruntime-android:1.21.1:cpu",
    coldLoadTimeMs: 25,
    endToEndLatencyMs: { sampleCount: 101, cold: 30, warmP50: 20, warmP95: 24, max: 30 },
    nativeLatencyMs: { sampleCount: 101, cold: 28, warmP50: 18, warmP95: 22, max: 28 },
    peakRssBytes: 123456,
    perScript: { Latin: { total: 101, passed: 100 } },
  };
  const event = (value) => JSON.stringify({
    type: "print",
    message: `SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(value)}`,
  });
  const conflicting = {
    ...acceptance,
    mismatches: [{ fixtureId: "fixture_002", field: "provider_exception" }],
  };
  withLog(`${event(acceptance)}\n${event(conflicting)}\n`, (log) => {
    const evidence = buildFailureEvidence({ ...evidenceArgs(log), "test-status": "1" });
    assert.deepEqual(evidence.acceptance, { completed: false });
    assert.equal(isCompleteEvidence(evidence), false);
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

test("retains only bounded failure-stage diagnostics and never accepts them as complete", () => {
  const diagnosticFor = (stage) => ({
    schemaVersion: 1,
    platform: "android",
    stage,
    fixtureId: "fixture_001",
  });
  for (const stage of [
    "corpus_provider",
    "hostname_resolution_probe",
    "loopback_round_trip_probe",
    "network_interposer_file",
    "network_interposer_image",
    "network_interposer_load",
    "network_interposer_process",
    "network_interposer_malloc",
    "network_interposer_free",
    "network_interposer_dladdr",
    "network_interposer_dyld_count_lookup",
    "network_interposer_dyld_name_lookup",
    "network_interposer_dyld_count",
    "network_interposer_path",
    "network_interposer_launch_environment",
    "network_interposer_dyld_injection",
    "network_interposer_loaded_image",
    "network_interposer_constructor",
    "network_interposer_symbol",
  ]) {
    const diagnostic = diagnosticFor(stage);
    withLog(protocolLog(`SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(diagnostic)}`), (logPath) => {
      const evidence = buildEvidence(evidenceArgs(logPath), repoRoot);
      assert.deepEqual(evidence.diagnostics, [diagnostic]);
      assert.equal(isCompleteEvidence(evidence), false);
    });
  }
  const diagnostic = diagnosticFor("corpus_provider");
  withLog(
    protocolLog(
      `SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify({ ...diagnostic, stage: "private provider detail" })}`,
    ),
    (logPath) => {
      assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /identity is invalid/);
    },
  );
  for (const obsoleteStage of [
    "network_canary",
    "corpus_manifest",
    "rotation_manifest",
    "ui_manifest",
  ]) {
    withLog(
      protocolLog(
        `SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify({ ...diagnostic, stage: obsoleteStage })}`,
      ),
      (logPath) => {
        assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /identity is invalid/);
      },
    );
  }
  withLog(
    protocolLog(...Array.from({ length: 5 }, () =>
      `SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(diagnostic)}`)),
    (logPath) => {
      assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /too many diagnostic markers/);
    },
  );
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

test("rejects skipped tests even when the runner reports success", () => {
  const log = protocolLog().replace(
    '"result":"success","skipped":false',
    '"result":"success","skipped":true',
  );
  withLog(log, (logPath) => {
    const evidence = buildEvidence(evidenceArgs(logPath), repoRoot);
    assert.equal(evidence.execution.protocolSucceeded, false);
    assert.equal(isCompleteEvidence(evidence), false);
  });
});

test("rejects nonempty stderr without retaining its text", () => {
  withLog(protocolLog(), (logPath) => {
    writeFileSync(
      `${logPath}.stderr`,
      "private toolchain path and diagnostic text\n",
      { mode: 0o600 },
    );
    assert.throws(
      () => buildEvidence(evidenceArgs(logPath), repoRoot),
      /non-allowlisted stderr/,
    );
    const failure = buildFailureEvidence(evidenceArgs(logPath));
    assert.equal(failure.execution.stderrBytes, 43);
    assert.equal(JSON.stringify(failure).includes("private toolchain path"), false);
    assert.equal(JSON.stringify(failure).includes("diagnostic text"), false);
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

test("retains zero-duration failed-run samples without accepting them", () => {
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
      field: "provider_exception",
    })),
    runtime: null,
    coldLoadTimeMs: null,
    endToEndLatencyMs: { sampleCount: 101, cold: 0, warmP50: 0, warmP95: 0, max: 0 },
    nativeLatencyMs: { sampleCount: 0, cold: null, warmP50: null, warmP95: null, max: null },
    peakRssBytes: 1,
    perScript: { Latin: { total: 101, passed: 0 } },
  };
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`), (logPath) => {
    const evidence = buildEvidence({ ...evidenceArgs(logPath), "test-status": "1" }, repoRoot);
    assert.equal(evidence.acceptance.endToEndLatencyMs.cold, 0);
    assert.equal(isCompleteEvidence(evidence), false);
  });
});

test("rejects malformed protocol ordering and inactive test references", () => {
  const beforeStart = `${JSON.stringify({ type: "done", time: 0, success: true })}\n${protocolLog()}`;
  withLog(beforeStart, (logPath) => {
    assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /before start/);
  });
  const inactivePrint = protocolLog("SETTLEORA_OCR_UI_SMOKE={}")
    .replace('"testID":4,"messageType"', '"testID":99,"messageType"');
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

test("requires the exact declared acceptance tests and marker owners", () => {
  const missingRotation = protocolLog()
    .replace(/\{"type":"testStart","time":1,"test":\{"id":3,[^\n]+\n/, "")
    .replace('{"type":"testDone","time":3,"testID":3,"result":"success","skipped":false,"hidden":false}\n', "");
  withLog(missingRotation, (logPath) => {
    const evidence = buildEvidence(evidenceArgs(logPath), repoRoot);
    assert.equal(evidence.execution.protocolSucceeded, false);
  });

  const wrongDeclaredCount = protocolLog().replace('"testCount":4', '"testCount":3');
  withLog(wrongDeclaredCount, (logPath) => {
    const evidence = buildEvidence(evidenceArgs(logPath), repoRoot);
    assert.equal(evidence.execution.protocolSucceeded, false);
  });

  const uiMarker = "SETTLEORA_OCR_UI_SMOKE={}";
  const wrongOwner = protocolLog(uiMarker).replace('"testID":4,"messageType"', '"testID":2,"messageType"');
  withLog(wrongOwner, (logPath) => {
    assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /inactive test|wrong test/);
  });
});

test("rejects dangling and cross-suite protocol references", () => {
  const danglingSuite = protocolLog().replace('"suiteID":1,"groupIDs":[1]', '"suiteID":999,"groupIDs":[1]');
  withLog(danglingSuite, (logPath) => {
    assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /suite\/group reference/);
  });

  const danglingGroup = protocolLog().replace('"groupIDs":[1]', '"groupIDs":[999]');
  withLog(danglingGroup, (logPath) => {
    assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /suite\/group reference/);
  });

  const danglingParent = protocolLog().replace('"parentID":null', '"parentID":999');
  withLog(danglingParent, (logPath) => {
    assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot), /group reference/);
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
    networkIsolated: true,
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
    networkIsolated: true,
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
