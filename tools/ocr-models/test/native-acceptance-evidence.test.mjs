import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildEvidence, buildFailureEvidence, isCompleteEvidence } from "../native-acceptance-evidence.mjs";

const sourceSha = "a".repeat(40);
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const manifestFixtureIds = JSON.parse(readFileSync(path.join(
  repoRoot, "apps/mobile/test/fixtures/receipt_ocr/manifest.json"), "utf8",
)).fixtures.map((fixture) => fixture.id);

test("iOS simulator acceptance resolves its test-only link before running the provider", () => {
  const runner = readFileSync(path.join(repoRoot, "tools/ocr-models/run-ios-native-acceptance.sh"), "utf8");
  assert.match(runner, /ENABLE_DEBUG_DYLIB = NO/);
  assert.match(runner, /resolved_link_flags=\$\(sed -n/);
  assert.match(runner, /ios_simulator_link_setting=missing/);
  assert.match(runner, /resolved_debug_dylib.*NO \|\|/);
  assert.match(runner, /xcrun otool -L "\$simulator_executable"/);
  assert.ok(runner.indexOf("phase=verify_resolved_debug_link_setting") <
    runner.indexOf("phase=build_simulator_interposer_link"));
  assert.ok(runner.indexOf("phase=verify_simulator_interposer_load_command") <
    runner.indexOf("phase=execute_flutter_test"));
});

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
  // Generate protocol input from the real harness declarations, so adding a
  // native test without updating the collector cannot leave this suite green.
  const harness = readFileSync(path.join(repoRoot,
    "apps/mobile/integration_test/receipt_ocr_real_provider_test.dart"), "utf8");
  const testNames = [...harness.matchAll(/\btest(?:Widgets)?\(\s*'([^']+)'/g)]
    .map((match) => match[1]);
  assert.equal(testNames.length, 6);
  assert.equal(new Set(testNames).size, testNames.length);
  const ownerIndex = (message) => testNames.indexOf(message.startsWith("SETTLEORA_OCR_UI_SMOKE=")
    ? "representative production receipt review UI uses real provider"
    : "all 101 real images match complete preview truth");
  return [
    { type: "start", time: 0, protocolVersion: "0.1.1", runnerVersion: null, pid: 1 },
    { type: "allSuites", time: 0, count: 1 },
    { type: "suite", time: 0, suite: { id: 1, platform: "vm", path: "integration_test/receipt_ocr_real_provider_test.dart" } },
    { type: "group", time: 0, group: { id: 1, suiteID: 1, parentID: null, name: "", metadata: { skip: false, skipReason: null }, testCount: testNames.length, line: null, column: null, url: null } },
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

function protocolLogWithLoading() {
  const events = protocolLog().trimEnd().split("\n").map(JSON.parse);
  const suite = events.find((event) => event.type === "suite").suite;
  const groupIndex = events.findIndex((event) => event.type === "group");
  events.splice(groupIndex, 0,
    { type: "testStart", time: 0, test: { id: 0, suiteID: suite.id, groupIDs: [], name: `loading ${suite.path}`, metadata: { skip: false, skipReason: null }, line: null, column: null, url: null } },
    { type: "testDone", time: 0, testID: 0, result: "success", skipped: false, hidden: true },
  );
  return events;
}

test("accepts the bounded Flutter suite-loading lifecycle before all six tests", () => {
  for (const suitePath of ["integration_test/receipt_ocr_real_provider_test.dart", "/workspace/checkout/apps/mobile/integration_test/receipt_ocr_real_provider_test.dart"]) {
    const events = protocolLogWithLoading();
    events.find((event) => event.type === "suite").suite.path = suitePath;
    events.find((event) => event.test?.id === 0).test.name = `loading ${suitePath}`;
    withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
      assert.equal(buildEvidence(evidenceArgs(log), repoRoot).execution.protocolSucceeded, true);
    });
  }
});

test("suite loading remains bound to its declared identity and lifecycle", () => {
  for (const mode of ["path", "suite", "groups", "skip", "reason", "location", "duplicate", "unfinished", "reused-id", "repeated-completion", "late"]) {
    const events = protocolLogWithLoading();
    const start = events.find((event) => event.test?.id === 0);
    const done = events.find((event) => event.type === "testDone" && event.testID === 0);
    if (mode === "path") start.test.name += ".other";
    if (mode === "suite") start.test.suiteID = 2;
    if (mode === "groups") start.test.groupIDs = [1];
    if (mode === "skip") start.test.metadata.skip = true;
    if (mode === "reason") start.test.metadata.skipReason = "unexpected";
    if (mode === "location") start.test.url = "file:///unexpected.dart";
    if (mode === "duplicate") events.splice(events.indexOf(start), 0, structuredClone(start));
    if (mode === "unfinished") events.splice(events.indexOf(done), 1);
    if (mode === "reused-id") events.find((event) => event.test?.id === 1).test.id = 0;
    if (mode === "repeated-completion") events.splice(events.indexOf(done), 0, structuredClone(done));
    if (mode === "late") {
      events.splice(events.indexOf(start), 1);
      events.splice(events.indexOf(done), 1);
      events.splice(events.length - 1, 0, start, done);
    }
    withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
      assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), undefined, mode);
    });
  }
});

test("failed or visible loading cannot yield successful protocol evidence", () => {
  for (const mode of ["failure", "skipped", "visible", "error", "non-failure-error"]) {
    const events = protocolLogWithLoading();
    const done = events.find((event) => event.type === "testDone" && event.testID === 0);
    if (mode === "failure") done.result = "failure";
    if (mode === "skipped") done.skipped = true;
    if (mode === "visible") done.hidden = false;
    if (mode === "error" || mode === "non-failure-error") {
      events.splice(events.indexOf(done), 0, {
        type: "error", time: 0, testID: 0, error: "synthetic load failure",
        stackTrace: "", isFailure: mode === "error",
      });
    }
    withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
      const evidence = buildEvidence(evidenceArgs(log), repoRoot);
      assert.equal(evidence.execution.protocolSucceeded, false, mode);
      assert.equal(isCompleteEvidence(evidence), false, mode);
      assert.equal(JSON.stringify(evidence).includes("synthetic load failure"), false);
    });
  }
});

test("suite loading cannot emit application output or acceptance markers", () => {
  for (const message of ["unexpected output", "SETTLEORA_OCR_ACCEPTANCE={}", "SETTLEORA_OCR_UI_SMOKE={}", "SETTLEORA_OCR_DIAGNOSTIC={}"]) {
    const events = protocolLogWithLoading();
    const index = events.findIndex((event) => event.type === "testDone" && event.testID === 0);
    events.splice(index, 0, { type: "print", time: 0, testID: 0, messageType: "print", message });
    withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
      assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /suite-loading/);
    });
  }
});

test("successful loading cannot substitute for a required acceptance test", () => {
  const events = protocolLogWithLoading().filter((event) => event.test?.id !== 6 && event.testID !== 6);
  withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
    const evidence = buildEvidence(evidenceArgs(log), repoRoot);
    assert.equal(evidence.execution.protocolSucceeded, false);
    assert.equal(isCompleteEvidence(evidence), false);
  });
});

function protocolLogWithLifecycle() {
  const events = protocolLogWithLoading();
  events.splice(events.length - 1, 0,
    { type: "testStart", time: 4, test: { id: 90, suiteID: 1, groupIDs: [1], name: "(tearDownAll)", metadata: { skip: false, skipReason: null }, line: 50, column: 5, url: "package:integration_test/integration_test.dart" } },
    { type: "testDone", time: 5, testID: 90, result: "success", skipped: false, hidden: true },
  );
  events.at(-1).time = 6;
  return events;
}

test("accepts loading and integration teardown around all six acceptance tests", () => {
  for (const nativeOrder of [false, true]) {
    const events = protocolLogWithLifecycle();
    if (nativeOrder) {
      const allSuites = events.splice(events.findIndex((event) => event.type === "allSuites"), 1)[0];
      events.splice(events.findIndex((event) => event.type === "testDone"), 0, allSuites);
      const suite = events.find((event) => event.type === "suite").suite;
      suite.path = "/workspace/checkout/apps/mobile/integration_test/receipt_ocr_real_provider_test.dart";
      events.find((event) => event.test?.id === 0).test.name = `loading ${suite.path}`;
    }
    withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
      const evidence = buildEvidence(evidenceArgs(log), repoRoot);
      assert.equal(evidence.execution.protocolSucceeded, true);
      assert.equal(isCompleteEvidence(evidence), false, "lifecycle success alone is not acceptance/package evidence");
    });
  }
});

test("integration teardown requires the exact framework identity and completed acceptance lifecycle", () => {
  for (const mode of ["name", "suite", "groups", "nested-group", "skip", "reason", "url", "line", "column", "zero-line", "duplicate", "unfinished", "reused-loading-id", "reused-acceptance-id", "repeated-completion", "early", "missing-acceptance", "unfinished-acceptance", "group-during-loading", "group-after-teardown", "after-done"]) {
    const events = protocolLogWithLifecycle();
    const start = events.find((event) => event.test?.id === 90);
    const done = events.find((event) => event.type === "testDone" && event.testID === 90);
    if (mode === "name") start.test.name = "arbitrary hidden test";
    if (mode === "suite") start.test.suiteID = 2;
    if (mode === "groups") start.test.groupIDs = [];
    if (mode === "nested-group") {
      const root = events.find((event) => event.type === "group");
      events.splice(events.indexOf(root) + 1, 0, { ...root, group: { ...root.group, id: 2, parentID: 1 } });
      start.test.groupIDs = [1, 2];
    }
    if (mode === "skip") start.test.metadata.skip = true;
    if (mode === "reason") start.test.metadata.skipReason = "unexpected";
    if (mode === "url") start.test.url = "package:mobile/arbitrary.dart";
    if (mode === "line") start.test.line = null;
    if (mode === "column") start.test.column = null;
    if (mode === "zero-line") start.test.line = 0;
    if (mode === "duplicate") events.splice(events.indexOf(start), 0, structuredClone(start));
    if (mode === "unfinished") events.splice(events.indexOf(done), 1);
    if (mode === "reused-loading-id") start.test.id = done.testID = 0;
    if (mode === "reused-acceptance-id") start.test.id = done.testID = 1;
    if (mode === "repeated-completion") events.splice(events.indexOf(done), 0, structuredClone(done));
    if (mode === "early") {
      events.splice(events.indexOf(start), 1);
      events.splice(events.findIndex((event) => event.test?.id === 6), 0, start);
    }
    if (mode === "missing-acceptance") {
      for (let index = events.length - 1; index >= 0; index--) {
        if (events[index].test?.id === 6 || events[index].testID === 6) events.splice(index, 1);
      }
    }
    if (mode === "unfinished-acceptance") events.splice(events.findIndex((event) => event.type === "testDone" && event.testID === 6), 1);
    if (mode === "group-during-loading") {
      const group = events.splice(events.findIndex((event) => event.type === "group"), 1)[0];
      events.splice(events.findIndex((event) => event.type === "testDone" && event.testID === 0), 0, group);
    }
    if (mode === "group-after-teardown") {
      const group = structuredClone(events.find((event) => event.type === "group"));
      group.group.id = 2;
      events.splice(events.indexOf(done), 0, group);
    }
    if (mode === "after-done") {
      const terminal = events.pop();
      events.splice(events.indexOf(start), 0, terminal);
    }
    withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
      assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), undefined, mode);
    });
  }
});

test("combined hidden lifecycles cannot conceal failures or skipped/visible completion", () => {
  for (const testID of [0, 90]) {
    for (const mode of ["failure", "skipped", "visible", "error", "non-failure-error"]) {
      const events = protocolLogWithLifecycle();
      const done = events.find((event) => event.type === "testDone" && event.testID === testID);
      if (mode === "failure") done.result = "failure";
      if (mode === "skipped") done.skipped = true;
      if (mode === "visible") done.hidden = false;
      if (mode === "error" || mode === "non-failure-error") events.splice(events.indexOf(done), 0, {
        type: "error", time: done.time, testID, error: "synthetic hidden failure", stackTrace: "", isFailure: mode === "error",
      });
      withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
        const evidence = buildEvidence(evidenceArgs(log), repoRoot);
        assert.equal(evidence.execution.protocolSucceeded, false, `${testID}/${mode}`);
        assert.equal(isCompleteEvidence(evidence), false);
        assert.equal(JSON.stringify(evidence).includes("synthetic hidden failure"), false);
      });
    }
  }
  const events = protocolLogWithLifecycle();
  events.find((event) => event.type === "testDone" && event.testID === 6).result = "failure";
  withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
    assert.equal(buildEvidence(evidenceArgs(log), repoRoot).execution.protocolSucceeded, false);
  });
});

test("combined hidden lifecycles cannot own output or bypass stderr rejection", () => {
  for (const testID of [0, 90]) {
    for (const message of ["unexpected output", "SETTLEORA_OCR_ACCEPTANCE={}", "SETTLEORA_OCR_UI_SMOKE={}", "SETTLEORA_OCR_DIAGNOSTIC={}"]) {
      const events = protocolLogWithLifecycle();
      const index = events.findIndex((event) => event.type === "testDone" && event.testID === testID);
      events.splice(index, 0, { type: "print", time: 0, testID, messageType: "print", message });
      withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
        assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /suite-loading or integration-teardown/);
      });
    }
  }
  withLog(`${protocolLogWithLifecycle().map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
    writeFileSync(`${log}.stderr`, "synthetic stderr\n");
    assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /non-allowlisted stderr/);
  });
});

test("requires the actual sixth native test to finish successfully", () => {
  const events = protocolLog().trimEnd().split("\n").map(JSON.parse);
  const identity = events.find((event) => event.type === "testStart" &&
    event.test.name === "explicit item currency is separate from receipt currency").test.id;
  withLog(protocolLog(), (log) => {
    assert.equal(buildEvidence(evidenceArgs(log), repoRoot).execution.protocolSucceeded, true);
  });
  for (const mode of ["missing", "failed", "skipped", "duplicate", "unexpected"]) {
    let changed = structuredClone(events);
    if (mode === "missing") {
      changed = changed.filter((event) => event.test?.id !== identity && event.testID !== identity);
    } else if (mode === "failed" || mode === "skipped") {
      const done = changed.find((event) => event.type === "testDone" && event.testID === identity);
      if (mode === "failed") done.result = "failure";
      else done.skipped = true;
    } else {
      const start = changed.find((event) => event.type === "testStart" && event.test.id === identity);
      start.test.name = mode === "duplicate"
        ? "bounded diagnostic matches whole item and amount tokens" : "unapproved native test";
    }
    withLog(changed.map((event) => JSON.stringify(event)).join("\n") + "\n", (log) => {
      if (mode === "duplicate" || mode === "unexpected") {
        assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /duplicate test|invalid suite/);
      } else {
        const evidence = buildEvidence(evidenceArgs(log), repoRoot);
        assert.equal(evidence.execution.protocolSucceeded, false, mode);
        assert.equal(isCompleteEvidence(evidence), false, mode);
      }
    });
  }
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
    mismatches: [{ fixtureId: manifestFixtureIds[0], field: "items[0].description" }],
    recognitionCoverage: manifestFixtureIds.map((fixtureId) => ({ fixtureId, blockCount: 12, merchantExactTextSeen: true,
      totalExactTokenSeen: true, expectedItemCount: 2, itemDescriptionsExactTextSeen: 1,
      rowCount: 8, actualItemCount: 1, merchantExactTextInOneRow: true, itemDescriptionsSameRowAsAmount: 0,
      itemDescriptionsWithinAdjacentAmountRow: 1, chargeTableHeaderSameRow: false,
      parserLineCount: 8, itemDescriptionsSameBlockAsAmount: 0,
      itemDescriptionsWithDistinctAmountBlock: 0, reviewHintCategory: "none",
      expectedItemDescriptionsInDraft: 1, expectedItemPairsInDraft: 1,
      expectedDateTokenSeen: true, expectedTaxTokenSeen: false,
      expectedSubtotalTokenSeen: false })),
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
    fixtureId: "existing_12_freshmart_grocery_en_US",
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
          "verified-model-file-count": "16",
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
      assert.equal(evidence.packageEvidence.catalogModelFileCount, 16);
      assert.equal(evidence.packageEvidence.verifiedModelFileCount, 16);
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
      assert.deepEqual(evidence.acceptance.recognitionCoverage, acceptance.recognitionCoverage);
    },
  );
  const numericRoutingObservation = {
    schemaVersion: 1, stage: "selectedOrientationPreRecovery", status: "observed",
    counts: [3, 3, 3, 2, 1, 1, 2], bins: [0, 0, 3, 0, 0, 0, 0, 0],
  };
  const unavailable = { schemaVersion: 1, stage: "selectedOrientationPreRecovery", status: "unavailable" };
  const observedZero = { ...numericRoutingObservation, counts: Array(7).fill(0), bins: Array(8).fill(0) };
  const asymmetric = { ...numericRoutingObservation,
    counts: [64, 56, 48, 40, 32, 16, 24], bins: [10, 6, 1, 3, 5, 7, 11, 21] };
  const withNumericObservations = acceptance.recognitionCoverage.map((entry, index) => ({
    ...entry, numericRoutingObservation: [numericRoutingObservation, unavailable, observedZero, asymmetric][index % 4],
  }));
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: withNumericObservations,
  })}`), (log) => {
    const bounded = buildEvidence(evidenceArgs(log), repoRoot).acceptance;
    assert.deepEqual(bounded.recognitionCoverage, withNumericObservations);
    assert.equal(bounded.mismatchCount, acceptance.mismatchCount);
    assert.deepEqual(bounded.mismatches, acceptance.mismatches);
  });
  const withCounts = (counts) => ({ ...numericRoutingObservation, counts });
  const withBins = (bins) => ({ ...numericRoutingObservation, bins });
  for (const invalid of [null, [], "private diagnostic text",
    { ...numericRoutingObservation, schemaVersion: 2 },
    { ...numericRoutingObservation, stage: "afterRecovery" },
    { ...numericRoutingObservation, status: "invalid" },
    { ...numericRoutingObservation, text: "private diagnostic text" },
    withCounts(null), withCounts({ one: 1 }), withCounts(Array(6).fill(0)), withCounts(Array(8).fill(0)),
    withCounts([257, 3, 3, 2, 1, 1, 2]), withCounts([-1, 3, 3, 2, 1, 1, 2]),
    withCounts([3.5, 3, 3, 2, 1, 1, 2]), withCounts(["3", 3, 3, 2, 1, 1, 2]),
    withCounts([true, 3, 3, 2, 1, 1, 2]), withCounts([null, 3, 3, 2, 1, 1, 2]),
    withCounts([2, 3, 3, 2, 1, 1, 2]), withCounts([3, 2, 3, 2, 1, 1, 2]),
    withCounts([3, 3, 1, 2, 1, 1, 2]), withCounts([3, 3, 3, 0, 1, 1, 2]),
    withCounts([3, 3, 3, 2, 0, 1, 2]), withCounts([3, 3, 3, 2, 1, 3, 2]),
    withCounts([3, 3, 3, 2, 1, 1, 4]),
    withBins(null), withBins({ one: 3 }), withBins(Array(7).fill(0)), withBins(Array(9).fill(0)),
    withBins([0, 0, 4, 0, 0, 0, 0, 0]), withBins([0, 0, "3", 0, 0, 0, 0, 0]),
    withBins([1, 0, 2, 0, 0, 0, 0, 0]),
    { ...numericRoutingObservation, counts: [1, 1, 1, 0, 0, 0, 0], bins: [1, 0, 0, 0, 0, 0, 0, 0] },
    { ...unavailable, counts: Array(7).fill(0) },
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [{ ...withNumericObservations[0], numericRoutingObservation: invalid },
        ...withNumericObservations.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /[Nn]umeric/));
  }
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: [acceptance.recognitionCoverage[0], ...withNumericObservations.slice(1)],
  })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /numeric routing observations are incomplete/));
  withLog(
    protocolLog(
      `SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`,
      `SETTLEORA_OCR_UI_SMOKE=${JSON.stringify({ ...uiSmoke, fixtureId: "synthetic_easy_fixture" })}`,
    ),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /UI smoke fixture identity is unreviewed/),
  );
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance,
      recognitionCoverage: [{ ...acceptance.recognitionCoverage[0], text: "raw-content-must-not-survive" }],
    })}`),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /recognitionCoverage\[0\].*non-allowlisted fields/),
  );
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance,
      recognitionCoverage: [{ ...acceptance.recognitionCoverage[0], rowCount: 13 }],
    })}`),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage evidence is invalid/),
  );
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance,
      recognitionCoverage: [{ ...acceptance.recognitionCoverage[0], itemDescriptionsSameBlockAsAmount: 1 }],
    })}`),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage evidence is invalid/),
  );
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance,
      recognitionCoverage: [{ ...acceptance.recognitionCoverage[0], reviewHintCategory: "raw-content" },
        ...acceptance.recognitionCoverage.slice(1)],
    })}`),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage evidence is invalid/),
  );
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance,
      recognitionCoverage: [{ ...acceptance.recognitionCoverage[0], reviewHintCategory: undefined },
        ...acceptance.recognitionCoverage.slice(1)],
    })}`),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /review hint categories are incomplete/),
  );
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance,
      recognitionCoverage: [{ ...acceptance.recognitionCoverage[0], expectedItemPairsInDraft: 2 },
        ...acceptance.recognitionCoverage.slice(1)],
    })}`),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage evidence is invalid/),
  );
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance,
      recognitionCoverage: [{ ...acceptance.recognitionCoverage[0], actualItemCount: 0 },
        ...acceptance.recognitionCoverage.slice(1)],
    })}`),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage evidence is invalid/),
  );
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance,
      recognitionCoverage: [{ ...acceptance.recognitionCoverage[0], expectedTaxTokenSeen: "raw-content" },
        ...acceptance.recognitionCoverage.slice(1)],
    })}`),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage evidence is invalid/),
  );
  const warningCounts = {
    noReadableText: 0, dccAmountMissing: 0, itemChargedCurrencyConflict: 0,
    itemReceiptCurrencyConflict: 0, noItems: 0, ratedTaxAmbiguity: 0,
    untraceableItemAmount: 0, noTotal: 0, currencyFallback: 0,
    symbolCurrencyUnresolved: 0, conflictingDate: 0, stayOnlyDate: 0, unknownWarning: 0,
  };
  const withPreviewWarnings = acceptance.recognitionCoverage.map((entry) => ({
    ...entry, previewPresent: true, previewWarningCount: 0,
    previewWarningCategoryCounts: { ...warningCounts },
  }));
  for (const changed of [
    {},
    { previewPresent: false },
    { previewWarningCount: 3, previewWarningCategoryCounts: { ...warningCounts, noItems: 2, unknownWarning: 1 } },
    { previewWarningCount: 100, previewWarningCategoryCounts: { ...warningCounts, unknownWarning: 100 } },
  ]) {
    const rows = [{ ...withPreviewWarnings[0], ...changed }, ...withPreviewWarnings.slice(1)];
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: rows,
    })}`), (log) => assert.deepEqual(buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, rows));
  }
  const { noItems: omittedWarning, ...incompleteWarningCounts } = warningCounts;
  for (const invalid of [
    { previewPresent: 'true' }, { previewPresent: null },
    { previewPresent: undefined }, { previewWarningCount: undefined },
    { previewWarningCategoryCounts: undefined },
    { previewWarningCount: -1 }, { previewWarningCount: 0.5 }, { previewWarningCount: '0' },
    { previewWarningCount: 1 },
    { previewWarningCount: 101, previewWarningCategoryCounts: { ...warningCounts, unknownWarning: 101 } },
    { previewPresent: false, previewWarningCount: 1, previewWarningCategoryCounts: { ...warningCounts, noItems: 1 } },
    { previewWarningCategoryCounts: null }, { previewWarningCategoryCounts: [] },
    { previewWarningCategoryCounts: incompleteWarningCounts },
    { previewWarningCategoryCounts: { ...warningCounts, receiptText: 1 } },
    { previewWarningCategoryCounts: { ...warningCounts, noItems: -1 } },
    { previewWarningCategoryCounts: { ...warningCounts, noItems: 0.5 } },
    { previewWarningCategoryCounts: { ...warningCounts, noItems: 'raw-content' } },
    { previewWarningCategoryCounts: { ...warningCounts, noItems: 101 } },
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [{ ...withPreviewWarnings[0], ...invalid }, ...withPreviewWarnings.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /previewWarning|previewPresent|preview warnings|missing required fields/));
  }
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: [acceptance.recognitionCoverage[0], ...withPreviewWarnings.slice(1)],
  })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
    /preview warnings are incomplete/));
  const headerFields = ["merchant", "date", "currency", "subtotal", "tax", "service", "tip", "shipping", "discount", "total"];
  const headerMap = (state) => Object.fromEntries(headerFields.map((field) => [field, state]));
  const withHeaderFields = withPreviewWarnings.map((entry) => ({
    ...entry, headerFieldStates: headerMap("matchingAbsence"),
  }));
  for (const state of ["matchingValue", "matchingAbsence", "missingValue", "differentValue", "unexpectedValue", "noPreview"]) {
    const rows = withHeaderFields.map((entry) => ({ ...entry,
      previewPresent: state !== "noPreview", headerFieldStates: headerMap(state),
    }));
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: rows,
    })}`), (log) => assert.deepEqual(buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, rows));
  }
  const { total: omittedHeader, ...incompleteHeaders } = headerMap("matchingAbsence");
  for (const invalid of [
    { headerFieldStates: null }, { headerFieldStates: [] }, { headerFieldStates: "Private content" },
    { headerFieldStates: incompleteHeaders },
    { headerFieldStates: { ...headerMap("matchingAbsence"), privateText: "Private content" } },
    ...[null, 0, true, {}, [], "72.19", "unknownState", "noPreview"].map((total) => ({
      headerFieldStates: { ...headerMap("matchingAbsence"), total },
    })),
    { previewPresent: false },
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [{ ...withHeaderFields[0], ...invalid }, ...withHeaderFields.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /headerFieldStates|header field states/));
  }
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: [withPreviewWarnings[0], ...withHeaderFields.slice(1)],
  })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
    /header field states are incomplete/));
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: acceptance.recognitionCoverage.map((entry) => ({
      ...entry, headerFieldStates: headerMap("matchingAbsence"),
    })),
  })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
    /header field states are invalid/));
  const reviewKinds = [null,
    "printed unsupported fees need manual review",
    "printed combined taxes and fees need manual review",
    "printed fee and payment credit need manual review",
    "printed total differs from visible charge-line arithmetic",
    "printed item currency differs from charged receipt currency",
    "printed surcharge and account credit need manual review"];
  const sourceKinds = new Map(JSON.parse(readFileSync(path.join(repoRoot,
    "apps/mobile/test/fixtures/receipt_ocr/manifest.json"), "utf8")).fixtures.map((fixture) =>
    [fixture.id, reviewKinds.indexOf(fixture.expected.expected_review_condition ?? null)]));
  const productTuple = (entry, state = 3, match = 1) =>
    [1, state, sourceKinds.get(entry.fixtureId), state === 3 ? match : 0,
      state === 0 ? 0 : 1, state === 1 || state === 2 ? 1 : 0];
  const withProducts = withHeaderFields.map((entry) => ({
    ...entry, productObservation: productTuple(entry),
  }));
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: withProducts,
  })}`), (log) => {
    const evidence = buildEvidence(evidenceArgs(log), repoRoot);
    assert.deepEqual(evidence.acceptance.recognitionCoverage, withProducts);
    assert.deepEqual(evidence.acceptance.mismatches, acceptance.mismatches);
    assert.equal(evidence.acceptance.passedFixtureCount, 100);
    assert.equal(evidence.acceptance.mismatchCount, 1);
    assert.equal(isCompleteEvidence(evidence), false);
  });
  const processingCases = [
    [0, "manifest_shape"], [1, "normalization"], [1, "provider_exception"],
    [1, "provider_status"], [1, "ocr_recognition_inference"], [2, "provider_status"],
  ];
  for (const [state, field] of processingCases) {
    const rows = [{ ...withProducts[0], previewPresent: false,
      headerFieldStates: headerMap("noPreview"), productObservation: productTuple(withProducts[0], state) },
      ...withProducts.slice(1)];
    const failures = [{ fixtureId: withProducts[0].fixtureId, field }];
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, mismatches: failures, recognitionCoverage: rows,
    })}`), (log) => {
      const bounded = buildEvidence(evidenceArgs(log), repoRoot).acceptance;
      assert.deepEqual(bounded.recognitionCoverage, rows);
      assert.deepEqual(bounded.mismatches, failures);
    });
  }
  // A known failure must not contradict strict success or borrow an unrelated
  // description mismatch. New tuples are optional; legacy omissions stay valid.
  for (const state of [0, 1, 2]) {
    const rows = [{ ...withProducts[0], previewPresent: false,
      headerFieldStates: headerMap("noPreview"), productObservation: productTuple(withProducts[0], state) },
      ...withProducts.slice(1)];
    for (const strict of [acceptance, { ...acceptance, passedFixtureCount: 101,
      mismatchCount: 0, mismatches: [], perScript: { Latin: { total: 101, passed: 101 } } }]) {
      withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
        ...strict, recognitionCoverage: rows,
      })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /Product observation/));
    }
  }
  for (const field of ["manifest_shape", "normalization", "provider_exception",
    "provider_status", "ocr_recognition_inference"]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, mismatches: [{ fixtureId: withProducts[0].fixtureId, field }],
      recognitionCoverage: withProducts,
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /Product observation/));
  }
  for (const [state, field] of [[0, "normalization"], [1, "manifest_shape"],
    [2, "ocr_recognition_inference"]]) {
    const rows = [{ ...withProducts[0], previewPresent: false,
      headerFieldStates: headerMap("noPreview"), productObservation: productTuple(withProducts[0], state) },
      ...withProducts.slice(1)];
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, mismatches: [{ fixtureId: withProducts[0].fixtureId, field }],
      recognitionCoverage: rows,
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /Product observation/));
  }
  // ocr_evidence is an extracted-preview comparison, not a provider failure.
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, mismatches: [{ fixtureId: withProducts[0].fixtureId, field: "ocr_evidence" }],
    recognitionCoverage: withProducts,
  })}`), (log) => assert.deepEqual(
    buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, withProducts));
  const validProduct = withProducts[0].productObservation;
  for (const invalid of [null, {}, "private data", [], [...validProduct, 0],
    validProduct.slice(1), ["1", ...validProduct.slice(1)], [true, ...validProduct.slice(1)],
    [2, ...validProduct.slice(1)], [1, 4, ...validProduct.slice(2)],
    [1, -1, ...validProduct.slice(2)], [1, 3, 7, 1, 1, 0],
    [1, 3, validProduct[2], 0, 1, 0], [1, 3, validProduct[2], 2, 1, 0],
    [1, 3, validProduct[2], 1, 0, 0], [1, 3, validProduct[2], 1, 3, 0],
    [1, 3, validProduct[2], 1, 1, 1], [1, 1, validProduct[2], 0, 1, 1],
    [1, 3, validProduct[2], 1, 1, -1], [1, 3, validProduct[2], 1, 1.5, 0]]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [{ ...withProducts[0], productObservation: invalid }, ...withProducts.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /Product observation/));
  }
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: [withHeaderFields[0], ...withProducts.slice(1)],
  })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), /product observations are incomplete/));
  const reviewMismatchRows = [{ ...withProducts[0],
    productObservation: productTuple(withProducts[0], 3, 2) }, ...withProducts.slice(1)];
  const reviewMismatches = [...acceptance.mismatches,
    { fixtureId: withProducts[0].fixtureId, field: "review_condition" }];
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, mismatchCount: 2, mismatches: reviewMismatches, recognitionCoverage: reviewMismatchRows,
  })}`), (log) => {
    const bounded = buildEvidence(evidenceArgs(log), repoRoot).acceptance;
    assert.deepEqual(bounded.mismatches, reviewMismatches);
    assert.deepEqual(bounded.recognitionCoverage, reviewMismatchRows);
  });

  const withUi = withProducts.map((entry) => ({
    ...entry, uiWitness: [1, 3, 503 | (entry.actualItemCount > 0 ? 8 : 0), 0, 1, 0],
  }));
  const checkUiRows = (rows, expectedError = null, strict = acceptance) => {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...strict, recognitionCoverage: rows,
    })}`), (log) => {
      if (expectedError) {
        assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot), expectedError);
      } else {
        const evidence = buildEvidence(evidenceArgs(log), repoRoot);
        assert.deepEqual(evidence.acceptance.recognitionCoverage, rows);
        assert.deepEqual(evidence.acceptance.mismatches, strict.mismatches);
        assert.equal(evidence.acceptance.mismatchCount, strict.mismatchCount);
        // The existing strict failure is retained even after every structural
        // replay operation succeeds. There is no product-domain promotion.
        assert.equal(isCompleteEvidence(evidence), false);
      }
    });
  };
  checkUiRows(withUi);
  checkUiRows([{ ...withUi[0], actualItemCount: 0,
    expectedItemDescriptionsInDraft: 0, expectedItemPairsInDraft: 0,
    uiWitness: [1, 3, 503, 0, 1, 0] }, ...withUi.slice(1)]);
  for (const uiWitness of [[1, 2, 1, 1, 1, 0], [1, 4, 7, 4, 1, 0],
    [1, 4, 0, 0, 0, 0], [1, 4, 255, 128, 1, 1],
    [1, 4, 1, 1, 0, 0], [1, 4, 511, 256, 2, 0]]) {
    checkUiRows([{ ...withUi[0], uiWitness }, ...withUi.slice(1)]);
  }
  for (const [productState, field] of processingCases) {
    const state = productState === 0 ? 0 : 1;
    const rows = [{ ...withUi[0], previewPresent: false,
      headerFieldStates: headerMap("noPreview"), productObservation: productTuple(withUi[0], productState),
      uiWitness: [1, state, 0, 0, 0, 0] }, ...withUi.slice(1)];
    checkUiRows(rows, null, { ...acceptance, mismatches: [{ fixtureId: rows[0].fixtureId, field }] });
    checkUiRows([{ ...rows[0], uiWitness: [1, 3, 511, 0, 1, 0] }, ...rows.slice(1)], /UI witness/,
      { ...acceptance, mismatches: [{ fixtureId: rows[0].fixtureId, field }] });
  }
  for (const uiWitness of [null, {}, "private content", [], [1, 3, 511, 0, 1],
    [1, 3, 511, 0, 1, 0, 0], [2, 3, 511, 0, 1, 0], ["1", 3, 511, 0, 1, 0],
    [1, true, 511, 0, 1, 0], [1, -1, 511, 0, 1, 0], [1, 5, 511, 0, 1, 0],
    [1, 3, 511.5, 0, 1, 0], [1, 3, 1023, 0, 1, 0], [1, 4, 3, 4, 1, 0],
    [1, 3, 503, 0, 1, 0], [1, 3, 511, 1, 1, 0], [1, 3, 511, 0, 0, 0],
    [1, 3, 511, 0, 2, 0], [1, 3, 511, 0, 1, 1], [1, 4, 0, 0, -1, 0],
    [1, 4, 0, 0, 10001, 0], [1, 4, 0, 0, 0, 10001], [1, 4, 511, 0, 1, 0],
    [1, 4, 128, 0, 1, 1], [1, 4, 256, 0, 0, 0],
    [1, 4, 128, 128, 1, 0], [1, 4, 256, 256, 1, 0],
    [1, 4, 129, 0, 1, 1], [1, 4, 257, 0, 2, 0],
    [1, 4, 129, 128, 1, 0], [1, 4, 257, 256, 1, 0],
    [1, 4, 1, 0, 0, 0], [1, 4, 3, 0, 0, 0],
    [1, 4, 2, 0, 1, 0], [1, 4, 3, 1, 1, 0], [1, 4, 256, 256, 0, 0],
    [1, 0, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0], [1, 2, 1, 0, 1, 0]]) {
    checkUiRows([{ ...withUi[0], uiWitness }, ...withUi.slice(1)], /UI witness/);
  }
  checkUiRows([withProducts[0], ...withUi.slice(1)], /UI witnesses are incomplete/);
  for (const uiWitness of [[1, 4, 11, 0, 1, 0], [1, 4, 11, 8, 1, 0]]) {
    checkUiRows([{ ...withUi[0], actualItemCount: 0,
      expectedItemDescriptionsInDraft: 0, expectedItemPairsInDraft: 0,
      uiWitness }, ...withUi.slice(1)], /UI witness/);
  }
  const { productObservation: omittedProduct, ...withoutProduct } = withUi[0];
  checkUiRows([withoutProduct, ...withUi.slice(1)], /UI witness|product observations/);

  const withReviewDecisions = acceptance.recognitionCoverage.map((entry) => ({
    ...entry, reviewDecision: "none", incompleteAdjustmentReasons: [],
  }));
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: withReviewDecisions,
  })}`), (log) => {
    assert.deepEqual(buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage,
      withReviewDecisions);
  });
  const withForeignItemReview = withReviewDecisions.map((entry, index) => index === 0
    ? { ...entry, reviewHintCategory: "foreign_item_currency", reviewDecision: "foreignItemCurrency" }
    : entry);
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: withForeignItemReview,
  })}`), (log) => {
    assert.deepEqual(buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage,
      withForeignItemReview);
  });
  for (const invalid of [
    { reviewDecision: "raw-content" },
    { incompleteAdjustmentReasons: ["raw-content"] },
    { incompleteAdjustmentReasons: ["itemLimit", "itemLimit"] },
    { reviewDecision: "subtotalMismatch" },
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [{ ...withReviewDecisions[0], ...invalid },
        ...withReviewDecisions.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage evidence is invalid/));
  }
  const itemDecisionNames = ["unclassified", "fuelItemSelected", "layoutChargeSelected", "ambiguousChargeSkipped",
    "metadataOrHeaderSkipped", "standaloneAmountSkipped", "layoutFallbackSelected",
    "adjacentAmountSelected", "unpricedDescription", "unretainedPricedRow",
    "invalidPricedRow", "quantityItemSelected", "leadingQuantityItemSelected", "pricedItemSelected"];
  const itemLineDecisionCounts = Object.fromEntries(itemDecisionNames.map((name) => [name,
    name === "unclassified" ? 8 : 0]));
  const expectedDescriptionDecisionCounts = { ...Object.fromEntries(itemDecisionNames.map((name) => [name, 0])),
    notInParserRows: 2, ambiguousParserRows: 0 };
  const withItemDecisions = withReviewDecisions.map((entry) => ({ ...entry,
    itemLineDecisionCounts, expectedDescriptionDecisionCounts }));
  const unresolvedRoles = { nordicCourtesy: 0, other: 0 };
  const nordicFailures = Object.fromEntries(["noTotal", "notLastRow", "notAfterTotal",
    "layoutRowCountMismatch", "unownedFinancialEvidence", "missingBounds",
    "overlapTransaction", "nonpositiveContentWidth", "footerTooWide", "footerOffCenter",
    "other"].map((name) => [name, 0]));
  const withUnresolvedOwnership = withItemDecisions.map((entry) => ({ ...entry,
    unresolvedItemLikeCount: 0, unresolvedItemLikeRoleCounts: unresolvedRoles,
    nordicFooterOwnershipFailureCounts: nordicFailures }));
  for (const rows of [
    withUnresolvedOwnership,
    [{ ...withUnresolvedOwnership[0], unresolvedItemLikeCount: 8,
      unresolvedItemLikeRoleCounts: { nordicCourtesy: 0, other: 8 },
      incompleteAdjustmentReasons: ["unresolvedItemLikeLine"] }, ...withUnresolvedOwnership.slice(1)],
    ...Object.keys(nordicFailures).map((reason) => [
      { ...withUnresolvedOwnership[0], unresolvedItemLikeCount: 3,
        unresolvedItemLikeRoleCounts: { nordicCourtesy: 2, other: 1 },
        nordicFooterOwnershipFailureCounts: { ...nordicFailures, [reason]: 2 },
        incompleteAdjustmentReasons: ["unresolvedItemLikeLine"] },
      ...withUnresolvedOwnership.slice(1),
    ]),
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: rows,
    })}`), (log) => assert.deepEqual(
      buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, rows));
  }
  for (const invalid of [
    { unresolvedItemLikeCount: undefined },
    { unresolvedItemLikeRoleCounts: undefined },
    { nordicFooterOwnershipFailureCounts: undefined },
    ...[-1, 0.5, "private-content", null, 9].map((value) => ({ unresolvedItemLikeCount: value })),
    { unresolvedItemLikeRoleCounts: { ...unresolvedRoles, rawText: 0 } },
    { nordicFooterOwnershipFailureCounts: { ...nordicFailures, coordinates: 0 } },
    { unresolvedItemLikeRoleCounts: null },
    { nordicFooterOwnershipFailureCounts: [] },
    { unresolvedItemLikeRoleCounts: {} },
    { nordicFooterOwnershipFailureCounts: {} },
    ...[-1, 0.5, "private-content", null, 9].map((other) => ({
      unresolvedItemLikeRoleCounts: { ...unresolvedRoles, other } })),
    ...[-1, 0.5, "private-content", null, 9].map((other) => ({
      nordicFooterOwnershipFailureCounts: { ...nordicFailures, other } })),
    { unresolvedItemLikeCount: 1 },
    { unresolvedItemLikeRoleCounts: { ...unresolvedRoles, other: 1 } },
    { nordicFooterOwnershipFailureCounts: { ...nordicFailures, other: 1 } },
    { incompleteAdjustmentReasons: ["unresolvedItemLikeLine"] },
    { unresolvedItemLikeCount: 1, unresolvedItemLikeRoleCounts: { nordicCourtesy: 0, other: 1 } },
    { unresolvedItemLikeCount: 9, unresolvedItemLikeRoleCounts: { nordicCourtesy: 0, other: 9 },
      incompleteAdjustmentReasons: ["unresolvedItemLikeLine"] },
    { unresolvedItemLikeCount: 1, unresolvedItemLikeRoleCounts: { nordicCourtesy: 1, other: 0 },
      incompleteAdjustmentReasons: ["unresolvedItemLikeLine"] },
    { unresolvedItemLikeCount: 1, unresolvedItemLikeRoleCounts: { nordicCourtesy: 0, other: 1 },
      incompleteAdjustmentReasons: ["unresolvedItemLikeLine"], previewPresent: false,
      previewWarningCount: 0, previewWarningCategoryCounts: warningCounts },
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [{ ...withUnresolvedOwnership[0], ...invalid },
        ...withUnresolvedOwnership.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot)));
  }
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: [withItemDecisions[0], ...withUnresolvedOwnership.slice(1)],
  })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
    /unresolved ownership is incomplete/));
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: withItemDecisions,
  })}`), (log) => assert.deepEqual(
    buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, withItemDecisions));
  const unretainedShapeNames = ["noParserAmountToken", "trailingText", "trailingSymbol",
    "joinedAmount", "multipleAmounts", "other"];
  const unresolvedBranches = ["explicitModifier", "ordinaryCourtesy", "otherDescription"];
  const emptyOtherDecisions = () => Object.fromEntries(unresolvedBranches.map((branch) => [branch,
    Object.fromEntries(itemDecisionNames.map((decision) => [decision, 0]))]));
  const withOtherDecisions = withUnresolvedOwnership.map((entry) => ({ ...entry,
    unresolvedOtherBranchDecisionCounts: emptyOtherDecisions() }));
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: withOtherDecisions,
  })}`), (log) => assert.deepEqual(
    buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, withOtherDecisions));
  for (const branch of unresolvedBranches) {
    for (const decision of itemDecisionNames) {
      const counts = emptyOtherDecisions();
      counts[branch][decision] = 8;
      const rows = [{ ...withOtherDecisions[0], unresolvedOtherBranchDecisionCounts: counts,
        itemLineDecisionCounts: Object.fromEntries(itemDecisionNames.map((name) => [name, name === decision ? 8 : 0])),
        unresolvedItemLikeCount: 8, unresolvedItemLikeRoleCounts: { nordicCourtesy: 0, other: 8 },
        incompleteAdjustmentReasons: ["unresolvedItemLikeLine"] }, ...withOtherDecisions.slice(1)];
      withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
        ...acceptance, recognitionCoverage: rows,
      })}`), (log) => assert.deepEqual(
        buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, rows));
    }
  }
  const mixedOtherDecisions = emptyOtherDecisions();
  for (const branch of unresolvedBranches) mixedOtherDecisions[branch].unclassified = 1;
  const mixedOtherRows = [{ ...withOtherDecisions[0], unresolvedOtherBranchDecisionCounts: mixedOtherDecisions,
    unresolvedItemLikeCount: 4, unresolvedItemLikeRoleCounts: { nordicCourtesy: 1, other: 3 },
    nordicFooterOwnershipFailureCounts: { ...nordicFailures, other: 1 },
    incompleteAdjustmentReasons: ["unresolvedItemLikeLine"] }, ...withOtherDecisions.slice(1)];
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: mixedOtherRows,
  })}`), (log) => assert.deepEqual(
    buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, mixedOtherRows));
  const invalidOtherMaps = [
    null, [], {}, { ...emptyOtherDecisions(), rawText: {} },
    { ...emptyOtherDecisions(), explicitModifier: null },
    { ...emptyOtherDecisions(), explicitModifier: [] },
    { ...emptyOtherDecisions(), explicitModifier: {} },
    { ...emptyOtherDecisions(), explicitModifier: { ...emptyOtherDecisions().explicitModifier, coordinates: 0 } },
    ...[-1, 0.5, "private-content", null, 9].map((value) => ({
      ...emptyOtherDecisions(), explicitModifier: {
        ...emptyOtherDecisions().explicitModifier, unclassified: value,
      },
    })),
    { ...emptyOtherDecisions(), explicitModifier: {
      ...emptyOtherDecisions().explicitModifier, unclassified: undefined,
    } },
    mixedOtherDecisions,
  ];
  for (const counts of invalidOtherMaps) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [{ ...withOtherDecisions[0],
        unresolvedOtherBranchDecisionCounts: counts }, ...withOtherDecisions.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot)));
  }
  const excessDecisionCounts = emptyOtherDecisions();
  excessDecisionCounts.explicitModifier.unclassified = 1;
  excessDecisionCounts.otherDescription.unclassified = 1;
  const invalidOtherEntries = [
    { ...withOtherDecisions[0], unresolvedItemLikeCount: undefined,
      unresolvedItemLikeRoleCounts: undefined, nordicFooterOwnershipFailureCounts: undefined },
    { ...withOtherDecisions[0], itemLineDecisionCounts: undefined, expectedDescriptionDecisionCounts: undefined },
    { ...withOtherDecisions[0], unresolvedItemLikeCount: 2,
      unresolvedItemLikeRoleCounts: { nordicCourtesy: 0, other: 2 },
      unresolvedOtherBranchDecisionCounts: excessDecisionCounts,
      incompleteAdjustmentReasons: ["unresolvedItemLikeLine"],
      itemLineDecisionCounts: { ...itemLineDecisionCounts, unclassified: 1, metadataOrHeaderSkipped: 7 } },
  ];
  for (const entry of invalidOtherEntries) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [entry, ...withOtherDecisions.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot)));
  }
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: [withUnresolvedOwnership[0], ...withOtherDecisions.slice(1)],
  })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
    /unresolved branch decisions are incomplete/));
  const expectedUnretainedRowShapeCounts = Object.fromEntries(unretainedShapeNames.map((name) => [name, 0]));
  const selectedRowWithoutExpectedPairDecisionCounts = Object.fromEntries(itemDecisionNames.map((name) => [name, 0]));
  const withRowShapes = withItemDecisions.map((entry) => ({ ...entry,
    expectedUnretainedRowShapeCounts, selectedRowWithoutExpectedPairDecisionCounts }));
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: withRowShapes,
  })}`), (log) => assert.deepEqual(
    buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, withRowShapes));
  const patternReasonNames = ["recognizedCurrencySuffixStillRejected", "otherSuffixDeletionWouldMatch",
    "suffixAndBoundaryInsertionWouldMatch", "trailingTextOtherMismatch",
    "amountBoundaryInsertionWouldMatch", "joinedAmountOtherMismatch", "other"];
  const expectedUnretainedPatternReasonCounts = Object.fromEntries(patternReasonNames.map((name) => [name, 0]));
  const unmatchedDraftItemOriginCounts = Object.fromEntries(itemDecisionNames.map((name) => [name, 0]));
  const withPatternReasons = withRowShapes.map((entry) => ({ ...entry,
    expectedUnretainedPatternReasonCounts, unmatchedDraftItemOriginCounts }));
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: withPatternReasons,
  })}`), (log) => assert.deepEqual(
    buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, withPatternReasons));
  // Exercise the full public coverage shape, including every existing verbose
  // ownership table. A small/minimal row would miss the 512 KiB carrier limit.
  const completeCoverage = manifestFixtureIds.map((_, index) => ({
    ...withHeaderFields[index], ...withReviewDecisions[index],
    ...withOtherDecisions[index], ...withPatternReasons[index],
    productObservation: productTuple(withHeaderFields[index]),
    uiWitness: [1, 3, 503 | (withHeaderFields[index].actualItemCount > 0 ? 8 : 0), 0, 1, 0],
    numericRoutingObservation: { ...numericRoutingObservation,
      counts: [256, 256, 224, 224, 224, 192, 192], bins: Array(8).fill(32) },
  }));
  const completeMarker = JSON.stringify({ ...acceptance, recognitionCoverage: completeCoverage });
  assert.ok(Buffer.byteLength(completeMarker) > 480_000, "capacity control must include realistic complete coverage");
  assert.ok(Buffer.byteLength(completeMarker) < 512 * 1024, "full tuple evidence must fit the unchanged marker bound");
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${completeMarker}`), (log) => {
    assert.deepEqual(buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage, completeCoverage);
  });
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: [{ ...withRowShapes[0],
      expectedUnretainedPatternReasonCounts }, ...withRowShapes.slice(1)],
  })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
    /missing required fields/));
  for (const invalid of [
    { expectedUnretainedPatternReasonCounts: { ...expectedUnretainedPatternReasonCounts, rawText: 0 } },
    { expectedUnretainedPatternReasonCounts: { ...expectedUnretainedPatternReasonCounts,
      trailingTextOtherMismatch: 1 } },
    { unmatchedDraftItemOriginCounts: { ...unmatchedDraftItemOriginCounts, pricedItemSelected: 1 } },
    { unmatchedDraftItemOriginCounts: { ...unmatchedDraftItemOriginCounts, unclassified: 1 } },
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [{ ...withPatternReasons[0], ...invalid },
        ...withPatternReasons.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage|non-allowlisted/));
  }
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
    ...acceptance, recognitionCoverage: [{ ...withItemDecisions[0],
      expectedUnretainedRowShapeCounts }, ...withItemDecisions.slice(1)],
  })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
    /missing required fields/));
  for (const invalid of [
    { expectedUnretainedRowShapeCounts: { ...expectedUnretainedRowShapeCounts, rawText: 0 } },
    { expectedUnretainedRowShapeCounts: { ...expectedUnretainedRowShapeCounts, trailingText: 1 } },
    { selectedRowWithoutExpectedPairDecisionCounts: {
      ...selectedRowWithoutExpectedPairDecisionCounts, pricedItemSelected: 1 } },
    { selectedRowWithoutExpectedPairDecisionCounts: {
      ...selectedRowWithoutExpectedPairDecisionCounts, unclassified: 1 } },
    { selectedRowWithoutExpectedPairDecisionCounts: {
      ...selectedRowWithoutExpectedPairDecisionCounts, adjacentAmountSelected: 1 } },
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [{ ...withRowShapes[0], ...invalid }, ...withRowShapes.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage|non-allowlisted/));
  }
  for (const invalid of [
    { itemLineDecisionCounts: { ...itemLineDecisionCounts, rawText: 0 } },
    { itemLineDecisionCounts: { ...itemLineDecisionCounts, unclassified: 9 } },
    { expectedDescriptionDecisionCounts: { ...expectedDescriptionDecisionCounts, notInParserRows: 1 } },
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [{ ...withItemDecisions[0], ...invalid },
        ...withItemDecisions.slice(1)],
    })}`), (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot)));
  }
  const legacyCoverage = manifestFixtureIds.map((fixtureId) => ({ fixtureId, blockCount: 12,
    merchantExactTextSeen: true, totalExactTokenSeen: true,
    expectedItemCount: 2, itemDescriptionsExactTextSeen: 1 }));
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: legacyCoverage,
    })}`),
    (log) => assert.deepEqual(
      buildEvidence(evidenceArgs(log), repoRoot).acceptance.recognitionCoverage,
      legacyCoverage,
    ),
  );
  const withoutCoverage = { ...acceptance };
  delete withoutCoverage.recognitionCoverage;
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(withoutCoverage)}`),
    (log) => assert.equal(
      Object.hasOwn(buildEvidence(evidenceArgs(log), repoRoot).acceptance, "recognitionCoverage"),
      false,
    ),
  );
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: acceptance.recognitionCoverage.slice(1),
    })}`),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage fixture inventory differs/),
  );
  withLog(
    protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify({
      ...acceptance, recognitionCoverage: [
        { ...acceptance.recognitionCoverage[0], fixtureId: "unknown_fixture" },
        ...acceptance.recognitionCoverage.slice(1),
      ],
    })}`),
    (log) => assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
      /Recognition coverage fixture inventory differs/),
  );
});

function completeEvidenceControl() {
  return {
    platform: "android",
    execution: { testExitStatus: 0, protocolSucceeded: true, preflightFailurePhase: null },
    diagnostics: [],
    acceptance: {
      completed: true,
      networkIsolated: true,
      passedFixtureCount: 101,
      mismatchCount: 0,
      recognitionCoverage: manifestFixtureIds.map((fixtureId) => ({ fixtureId,
        blockCount: 1, merchantExactTextSeen: false, totalExactTokenSeen: false,
        expectedItemCount: 0, itemDescriptionsExactTextSeen: 0,
        reviewDecision: "none", incompleteAdjustmentReasons: [],
        itemLineDecisionCounts: {}, expectedDescriptionDecisionCounts: {},
        expectedUnretainedRowShapeCounts: {}, selectedRowWithoutExpectedPairDecisionCounts: {},
        expectedUnretainedPatternReasonCounts: {}, unmatchedDraftItemOriginCounts: {},
        expectedItemPairsInDraft: 0 })),
      runtime: "test-runtime",
      coldLoadTimeMs: 1,
      endToEndLatencyMs: { sampleCount: 101, cold: 1, warmP50: 1, warmP95: 1, max: 1 },
      nativeLatencyMs: { sampleCount: 101, cold: 1, warmP50: 1, warmP95: 1, max: 1 },
      peakRssBytes: 1,
    },
    uiSmoke: { completed: true, fixtureId: "existing_12_freshmart_grocery_en_US", previewPanel: true, applyBoundaryVisible: true },
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
}

test("complete evidence requires both package measurements and a positive delta", () => {
  const evidence = completeEvidenceControl();
  assert.equal(isCompleteEvidence(evidence), true);
  // A recovered failure envelope cannot become accepted proof by attaching
  // otherwise complete execution/package fields or clearing its marker value.
  for (const key of ["collectionRejection", "collectionFailure", "collectionFailureReason", "stderrDiagnostic"]) {
    for (const value of ["invalid_or_unavailable_bounded_evidence", "unclassified", null, ""]) {
      assert.equal(isCompleteEvidence({ ...evidence, [key]: value }), false);
    }
  }
  assert.equal(isCompleteEvidence({ ...evidence, acceptance: { ...evidence.acceptance,
    recognitionCoverage: evidence.acceptance.recognitionCoverage.map((row) => {
      const copy = { ...row }; delete copy.reviewDecision; return copy;
    }) } }), false);
  assert.equal(isCompleteEvidence({ ...evidence,
    acceptance: { ...evidence.acceptance, recognitionCoverage: undefined } }), false);
  assert.equal(isCompleteEvidence({ ...evidence,
    acceptance: { ...evidence.acceptance, recognitionCoverage: [{ fixtureId: manifestFixtureIds[0] }] } }), false);
  assert.equal(isCompleteEvidence({ ...evidence,
    uiSmoke: { ...evidence.uiSmoke, fixtureId: "synthetic_easy_fixture" } }), false);
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
      diagnostics: [{ schemaVersion: 1, platform: "android", stage: "corpus_provider", fixtureId: manifestFixtureIds[0] }],
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
      "save_runner_project",
      "apply_runner_project_link",
      "apply_debug_link_config",
      "verify_debug_link_setting",
      "verify_resolved_debug_link_setting",
      "enable_simulator_isolation",
      "build_simulator_interposer_link",
      "verify_simulator_runner_link_architecture",
      "verify_simulator_interposer_link_invocation",
      "verify_simulator_interposer_link",
      "verify_simulator_app",
      "verify_simulator_interposer_copy",
      "verify_simulator_interposer_load_command",
      "verify_simulator_interposer_install_name",
      "verify_debug_link_setting_after_build",
      "verify_resolved_debug_link_setting_after_build",
      "verify_simulator_interposer_link_after_test",
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
      collectionRejection: { schemaVersion: 1, phase: "unclassified", reason: "unclassified" },
      collectionFailure: "invalid_or_unavailable_bounded_evidence",
      collectionFailureReason: "unclassified",
      stderrDiagnostic: "not_classified",
      flutterRunnerDiagnostics: {
        schemaVersion: 1,
        authority: "diagnostic_only_unvalidated_observations",
        maxStreamBytes: 1048576,
        maxLineBytes: 65536,
        maxCount: 10000,
        stdout: {
          state: "unavailable",
          scannedBytes: 0,
          omittedOversizeLines: 0,
          omittedPartialLine: false,
          countsCapped: false,
          unclassifiedLines: 0,
          signatureCategories: [],
          eventCounts: {
            start: 0,
            allSuites: 0,
            suite: 0,
            group: 0,
            testStart: 0,
            testDone: 0,
            error: 0,
            print: 0,
            done: 0,
          },
          failedTestEvents: 0,
          doneSuccessEvents: 0,
          doneFailureEvents: 0,
          vmServiceAnnouncementEvents: 0,
        },
        stderr: {
          state: "unavailable",
          scannedBytes: 0,
          omittedOversizeLines: 0,
          omittedPartialLine: false,
          countsCapped: false,
          unclassifiedLines: 0,
          signatureCategories: [],
        },
      },
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

test("rotation failure retains bounded comparison fields without granting acceptance", () => {
  for (const platform of ["android", "ios"]) {
    const diagnostic = {
      schemaVersion: 1, platform, stage: "rotation_comparison",
      fixtureId: "existing_12_freshmart_grocery_en_US",
      comparison: { mismatchCount: 3, fields: ["review_condition", "items[0].quantity", "block_geometry"] },
    };
    const event = JSON.stringify({ type: "print", message: `SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(diagnostic)}` });
    withLog(`${event}\n`, (log) => {
      writeFileSync(`${log}.stderr`, "private native stderr must never be retained\n");
      const evidence = buildFailureEvidence({ ...evidenceArgs(log, platform), "test-status": "1" }, repoRoot);
      assert.deepEqual(evidence.diagnostics, [diagnostic]);
      assert.equal(evidence.execution.testExitStatus, 1);
      assert.equal(isCompleteEvidence(evidence), false);
      assert.equal(JSON.stringify(evidence).includes("private native stderr"), false);
    });
  }
});

test("rotation diagnostics reject arbitrary fields, malformed counts and unrelated stages", () => {
  const valid = {
    schemaVersion: 1, platform: "ios", stage: "rotation_comparison",
    fixtureId: "existing_12_freshmart_grocery_en_US",
    comparison: { mismatchCount: 1, fields: ["review_condition"] },
  };
  const invalid = [
    { ...valid, stage: "rotation_provider" },
    { ...valid, fixtureId: null },
    { ...valid, fixtureId: manifestFixtureIds.find((id) => id !== valid.fixtureId) },
    ...[
      { mismatchCount: 1, fields: ["private_receipt_text"] },
      { mismatchCount: 1, fields: ["normalization"] },
      { mismatchCount: 1, fields: ["manifest_shape"] },
      { mismatchCount: 1, fields: ["items[1000].description"] },
      { mismatchCount: 1, fields: ["items[0].privateValue"] },
      { mismatchCount: -1, fields: [] },
      { mismatchCount: 1.5, fields: ["total"] },
      { mismatchCount: 2, fields: ["total"] },
      { mismatchCount: 1, fields: ["total", "tax"] },
      { mismatchCount: 2, fields: ["total", "total"] },
      { mismatchCount: 4097, fields: [] },
      { mismatchCount: 1, fields: ["total"], rawValue: "private" },
      { mismatchCount: 129, fields: Array.from({ length: 129 }, (_, i) => `items[${i}].description`) },
    ].map((comparison) => ({ ...valid, comparison })),
  ];
  for (const diagnostic of invalid) {
    withLog(protocolLog(`SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(diagnostic)}`), (log) => {
      assert.throws(() => buildEvidence(evidenceArgs(log, "ios"), repoRoot));
      assert.deepEqual(buildFailureEvidence(evidenceArgs(log, "ios"), repoRoot).diagnostics, []);
    });
  }
});

test("rotation diagnostics explicitly retain a bounded prefix of large comparisons", () => {
  const diagnostic = {
    schemaVersion: 1, platform: "android", stage: "rotation_comparison",
    fixtureId: "existing_12_freshmart_grocery_en_US",
    comparison: { mismatchCount: 150, fields: Array.from({ length: 128 }, (_, i) => `items[${i}].lineTotal`) },
  };
  withLog(protocolLog(`SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(diagnostic)}`), (log) => {
    const evidence = buildFailureEvidence(evidenceArgs(log), repoRoot);
    assert.deepEqual(evidence.diagnostics, [diagnostic]);
    assert.equal(isCompleteEvidence(evidence), false);
  });
});

test("isolation failure evidence retains only allowlisted probe outcomes", () => {
  const diagnostic = {
    schemaVersion: 1,
    platform: "android",
    stage: "network_isolation",
    fixtureId: null,
    probes: { numeric: "timeout", loopback: "passed", hostname: "resolved" },
  };
  const event = JSON.stringify({
    type: "print",
    message: `SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(diagnostic)}`,
    rawHost: "private-host-marker",
    rawAddress: "private-address-marker",
  });
  withLog(`${event}\n`, (log) => {
    const evidence = buildFailureEvidence({ ...evidenceArgs(log), "test-status": "1" });
    assert.deepEqual(evidence.diagnostics, [diagnostic]);
    assert.equal(isCompleteEvidence(evidence), false);
    assert.equal(JSON.stringify(evidence).includes("private-host-marker"), false);
    assert.equal(JSON.stringify(evidence).includes("private-address-marker"), false);
  });
  withLog(protocolLog(`SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(diagnostic)}`), (log) => {
    const evidence = buildEvidence(evidenceArgs(log), repoRoot);
    assert.deepEqual(evidence.diagnostics, [diagnostic]);
    assert.equal(isCompleteEvidence(evidence), false);
  });
  const resolved = {
    ...diagnostic,
    probes: { numeric: "connected", loopback: "passed", hostname: "empty_result" },
  };
  withLog(protocolLog(`SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(resolved)}`), (log) => {
    const evidence = buildEvidence(evidenceArgs(log), repoRoot);
    assert.deepEqual(evidence.diagnostics, [resolved]);
    assert.equal(isCompleteEvidence(evidence), false);
  });
  for (const partial of [
    { stage: "network_probe", probes: { numeric: "not_run", loopback: "not_run", hostname: "not_run" } },
    { stage: "network_denial_contract", probes: { numeric: "denied_other", loopback: "not_run", hostname: "not_run" } },
    { stage: "loopback_round_trip_probe", probes: { numeric: "denied_expected", loopback: "failed", hostname: "not_run" } },
    { stage: "hostname_resolution_probe", probes: { numeric: "denied_expected", loopback: "passed", hostname: "not_run" } },
  ]) {
    const marker = { ...diagnostic, ...partial };
    withLog(protocolLog(`SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(marker)}`), (log) => {
      const evidence = buildFailureEvidence({ ...evidenceArgs(log), "test-status": "1" });
      assert.deepEqual(evidence.diagnostics, [marker]);
      assert.equal(isCompleteEvidence(evidence), false);
    });
  }
  for (const invalid of [
    { ...diagnostic, probes: { ...diagnostic.probes, numeric: "private network detail" } },
    { ...diagnostic, probes: { ...diagnostic.probes, hostname: "example.com" } },
    { ...diagnostic, probes: { ...diagnostic.probes, rawError: "private" } },
    { ...diagnostic, stage: "corpus_provider" },
    { ...diagnostic, stage: "network_environment" },
    { ...diagnostic, fixtureId: manifestFixtureIds[0] },
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(invalid)}`), (log) => {
      assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot));
      assert.deepEqual(buildFailureEvidence(evidenceArgs(log), repoRoot).diagnostics, []);
    });
  }
});

test("corpus preprocessing failures retain fixed mismatch categories without granting acceptance", () => {
  const acceptance = {
    schemaVersion: 1, platform: "android", completed: true, networkIsolated: true,
    fixtureCount: 101, passedFixtureCount: 98, mismatchCount: 3,
    mismatches: [
      { fixtureId: manifestFixtureIds[0], field: "normalization" },
      { fixtureId: manifestFixtureIds[1], field: "manifest_shape" },
      { fixtureId: manifestFixtureIds[2], field: "merchant" },
    ],
    runtime: "onnxruntime-android:1.21.1:cpu", coldLoadTimeMs: 25,
    endToEndLatencyMs: { sampleCount: 101, cold: 30, warmP50: 20, warmP95: 24, max: 30 },
    nativeLatencyMs: { sampleCount: 99, cold: 28, warmP50: 18, warmP95: 22, max: 28 },
    peakRssBytes: 123456, perScript: { Latin: { total: 101, passed: 98 } },
  };
  const events = protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`)
    .trimEnd().split("\n").map(JSON.parse);
  const corpusTestId = events.find((event) =>
    event.test?.name === "all 101 real images match complete preview truth").test.id;
  events.find((event) => event.type === "testDone" && event.testID === corpusTestId).result = "failure";
  events.at(-1).success = false;
  withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
    const args = { ...evidenceArgs(log), "test-status": "1" };
    const evidence = buildEvidence(args, repoRoot);
    assert.deepEqual(evidence.acceptance, acceptance);
    assert.equal(evidence.execution.protocolSucceeded, false);
    assert.equal(isCompleteEvidence(evidence), false);
    // Exercise recovery after unrelated protocol rejection using synthetic output.
    writeFileSync(log, `untrusted output\n${readFileSync(log, "utf8")}`);
    assert.throws(() => buildEvidence(args, repoRoot));
    const recovered = buildFailureEvidence(args, repoRoot);
    assert.deepEqual(recovered.acceptance, acceptance);
    assert.equal(isCompleteEvidence(recovered), false);
    assert.equal(JSON.stringify(recovered).includes("untrusted output"), false);
  });
});

test("acceptance and failure evidence reject private-looking field and script identities", () => {
  const acceptance = {
    schemaVersion: 1,
    platform: "android",
    completed: true,
    networkIsolated: true,
    fixtureCount: 101,
    passedFixtureCount: 100,
    mismatchCount: 1,
    mismatches: [{ fixtureId: manifestFixtureIds[0], field: "merchant" }],
    runtime: "onnxruntime-android:1.21.1:cpu",
    coldLoadTimeMs: 25,
    endToEndLatencyMs: { sampleCount: 101, cold: 30, warmP50: 20, warmP95: 24, max: 30 },
    nativeLatencyMs: { sampleCount: 101, cold: 28, warmP50: 18, warmP95: 22, max: 28 },
    peakRssBytes: 123456,
    perScript: { Latin: { total: 101, passed: 100 } },
  };
  const privateToken = "PRIVATE_RECEIPT_TEXT_123";
  for (const invalid of [
    { ...acceptance, mismatches: [{ fixtureId: manifestFixtureIds[0], field: privateToken }] },
    { ...acceptance, perScript: { [privateToken]: { total: 101, passed: 100 } } },
  ]) {
    withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(invalid)}`), (log) => {
      assert.throws(() => buildEvidence(evidenceArgs(log), repoRoot),
        /outside fixed comparison diagnostics|outside the immutable corpus labels/);
      const failure = buildFailureEvidence({ ...evidenceArgs(log), "test-status": "1" }, repoRoot);
      assert.deepEqual(failure.acceptance, { completed: false });
      assert.equal(JSON.stringify(failure).includes(privateToken), false);
    });
  }
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
    mismatches: [{ fixtureId: manifestFixtureIds[0], field: "provider_status" }],
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
  const unknownFixture = {
    ...acceptance,
    mismatches: [{ fixtureId: "privateMerchant", field: "provider_status" }],
  };
  for (const marker of [unknownFixture, acceptance]) {
    withLog(JSON.stringify({
      type: "print",
      message: `SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(marker)}`,
    }), (log) => {
      const evidence = buildFailureEvidence(
        { ...evidenceArgs(log), "test-status": "1" },
        marker === acceptance ? path.dirname(log) : repoRoot,
      );
      assert.deepEqual(evidence.acceptance, { completed: false });
      assert.equal(JSON.stringify(evidence).includes("privateMerchant"), false);
    });
  }
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
    mismatches: [{ fixtureId: manifestFixtureIds[0], field: "provider_status" }],
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
    mismatches: [{ fixtureId: manifestFixtureIds[1], field: "provider_exception" }],
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
    fixtureId: manifestFixtureIds[0],
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
    "ui_value_binding",
    "ui_provider_status",
    "ui_provider_preview",
    "ui_provider_fields",
    "ui_merchant_binding",
    "ui_date_binding",
    "ui_total_binding",
    "ui_apply_handoff",
    "ui_apply_selection",
    "ui_apply_probe",
    "ui_apply_selection_retained",
    "ui_apply_tap",
    "ui_apply_merchant",
    "ui_apply_date",
    "ui_apply_currency",
    "ui_apply_items",
  ]) {
    const diagnostic = diagnosticFor(stage);
    withLog(protocolLog(`SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(diagnostic)}`), (logPath) => {
      const evidence = buildEvidence(evidenceArgs(logPath), repoRoot);
      assert.deepEqual(evidence.diagnostics, [diagnostic]);
      assert.equal(isCompleteEvidence(evidence), false);
    });
  }
  const diagnostic = diagnosticFor("corpus_provider");
  for (const fixtureId of ["privateMerchant", "4111111111111111"]) {
    withLog(
      protocolLog(`SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify({ ...diagnostic, fixtureId })}`),
      (logPath) => {
        assert.throws(() => buildEvidence(evidenceArgs(logPath), repoRoot),
          /Diagnostic fixture identity is not in the immutable corpus/);
        assert.deepEqual(buildFailureEvidence(evidenceArgs(logPath), repoRoot).diagnostics, []);
      },
    );
  }
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

test("CLI classifies rejected stderr while retaining only diagnostic markers", () => {
  for (const platform of ["android", "ios"]) {
    const acceptance = {
      schemaVersion: 1, platform, completed: true, networkIsolated: true,
      fixtureCount: 101, passedFixtureCount: 100, mismatchCount: 1,
      mismatches: [{ fixtureId: manifestFixtureIds[0], field: "items[0].description" }],
      runtime: platform === "android" ? "onnxruntime-android:1.21.1:cpu" : "onnxruntime-objc:1.24.3:cpu",
      coldLoadTimeMs: 25,
      endToEndLatencyMs: { sampleCount: 101, cold: 30, warmP50: 20, warmP95: 24, max: 30 },
      nativeLatencyMs: { sampleCount: 101, cold: 28, warmP50: 18, warmP95: 22, max: 28 },
      peakRssBytes: 123456, perScript: { Latin: { total: 101, passed: 100 } },
    };
    const diagnostic = {
      schemaVersion: 1, platform, stage: "corpus_evidence", fixtureId: null,
    };
    const uiSmoke = {
      schemaVersion: 1, platform, completed: true,
      fixtureId: "existing_12_freshmart_grocery_en_US",
      previewPanel: true, applyBoundaryVisible: true,
    };
    withLog(protocolLog(
      `SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`,
      `SETTLEORA_OCR_DIAGNOSTIC=${JSON.stringify(diagnostic)}`,
      `SETTLEORA_OCR_UI_SMOKE=${JSON.stringify(uiSmoke)}`,
    ), (log) => {
      const out = `${log}.evidence.json`;
      // Same byte count as Android run 37566401353; synthetic content only.
      const privateText = "private native diagnostic ".padEnd(233, "x");
      writeFileSync(`${log}.stderr`, privateText, { mode: 0o600 });
      for (const status of ["0", "1"]) {
        const args = { ...evidenceArgs(log, platform), "test-status": status,
          out, "require-complete": "true" };
        const result = spawnSync(process.execPath, [
          path.join(repoRoot, "tools/ocr-models/native-acceptance-evidence.mjs"),
          ...Object.entries(args).map(([key, value]) => `--${key}=${value}`),
        ], { cwd: repoRoot, encoding: "utf8" });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.equal(result.stderr, "bounded_native_ocr_evidence_failed\n");
        const retained = readFileSync(out, "utf8");
        const evidence = JSON.parse(retained);
        assert.equal(evidence.collectionFailure, "invalid_or_unavailable_bounded_evidence");
        assert.equal(evidence.collectionFailureReason, "non_allowlisted_stderr");
        assert.equal(evidence.stderrDiagnostic, "other_nonempty");
        assert.equal(evidence.execution.stderrBytes, 233);
        assert.equal(evidence.execution.testExitStatus, Number(status));
        assert.deepEqual(evidence.acceptance, acceptance);
        assert.deepEqual(evidence.diagnostics, [diagnostic]);
        assert.deepEqual(evidence.uiSmoke, uiSmoke);
        assert.equal(isCompleteEvidence(evidence), false);
        assert.equal(retained.includes("private native diagnostic"), false);
        assert.equal(retained.includes(repoRoot), false);
        assert.equal(Object.hasOwn(evidence, "packageEvidence"), false);
      }
    });
  }
});

test("collection reasons cannot be supplied by arbitrary error text or properties", () => {
  withLog("private invalid protocol\n", (log) => {
    let error;
    try { buildEvidence(evidenceArgs(log), repoRoot); } catch (caught) { error = caught; }
    assert.ok(error instanceof Error);
    for (const supplied of [error, "non_allowlisted_stderr", {
      name: "NonAllowlistedStderrError", code: "non_allowlisted_stderr",
      message: "private native diagnostic",
    }, new Error("Acceptance runner emitted non-allowlisted stderr")]) {
      const evidence = buildFailureEvidence(evidenceArgs(log), repoRoot, supplied);
      assert.equal(evidence.collectionFailureReason, "unclassified");
      assert.equal(evidence.stderrDiagnostic, "not_classified");
      assert.equal(isCompleteEvidence(evidence), false);
      assert.doesNotMatch(JSON.stringify(evidence), /private|Acceptance runner/);
    }
  });
});

test("known compiler notes are classified by exact bytes and remain rejected", () => {
  const notes = Buffer.from(
    "Note: /home/runner/.pub-cache/hosted/pub.dev/google_mlkit_commons-0.11.1/android/src/main/java/com/google_mlkit_commons/InputImageConverter.java uses unchecked or unsafe operations.\n" +
    "Note: Recompile with -Xlint:unchecked for details.\n",
  );
  assert.equal(notes.length, 233);
  const known = "known_javac_unchecked_notes_only";
  const other = "other_nonempty";
  const cases = [
    ["exact Android notes", "android", notes, known],
    ["wrong platform", "ios", notes, other],
    ["same length", "android", Buffer.alloc(233, 120), other],
    ["extra line", "android", Buffer.concat([notes, Buffer.from("private extra diagnostic\n")]), other],
    ["duplicate notes", "android", Buffer.concat([notes, notes]), other],
    ["preamble", "android", Buffer.concat([Buffer.from("private preamble\n"), notes]), other],
    ["truncated", "android", notes.subarray(0, -1), other],
    ["different path", "android", Buffer.from(notes.toString().replace("InputImageConverter", "PrivateSource")), other],
    ["different version", "android", Buffer.from(notes.toString().replace("0.11.1", "0.11.2")), other],
    ["CRLF", "android", Buffer.from(notes.toString().replaceAll("\n", "\r\n")), other],
    ["invalid UTF8", "android", Buffer.concat([notes.subarray(0, -1), Buffer.from([255])]), other],
  ];
  for (const [name, platform, bytes, expected] of cases) {
    withLog(protocolLog(), (log) => {
      writeFileSync(`${log}.stderr`, bytes, { mode: 0o600 });
      let caught;
      assert.throws(() => {
        try { buildEvidence(evidenceArgs(log, platform), repoRoot); }
        catch (error) { caught = error; throw error; }
      }, /non-allowlisted stderr/, name);
      const evidence = buildFailureEvidence(evidenceArgs(log, platform), repoRoot, caught);
      assert.equal(evidence.stderrDiagnostic, expected, name);
      assert.equal(evidence.collectionFailureReason, "non_allowlisted_stderr", name);
      assert.equal(evidence.execution.stderrBytes, bytes.length, name);
      assert.equal(isCompleteEvidence(evidence), false, name);
      assert.doesNotMatch(JSON.stringify(evidence), /private|PrivateSource|InputImageConverter|\/home\/runner/);
      // Even a mutated caught object cannot serialize an arbitrary value.
      caught.diagnostic = "private error content";
      const changed = buildFailureEvidence(evidenceArgs(log, platform), repoRoot, caught);
      assert.equal(changed.stderrDiagnostic, expected);
      assert.equal(JSON.stringify(changed).includes("private error content"), false);
      Object.defineProperty(caught, "diagnostic", {
        get() { throw new Error("private diagnostic getter"); },
      });
      assert.equal(
        buildFailureEvidence(evidenceArgs(log, platform), repoRoot, caught).stderrDiagnostic,
        expected,
      );
    });
  }
  withLog(protocolLog(), (log) => {
    const clean = buildEvidence(evidenceArgs(log), repoRoot);
    assert.equal(clean.execution.protocolSucceeded, true);
    assert.equal(Object.hasOwn(clean, "stderrDiagnostic"), false);
    writeFileSync(`${log}.stderr`, notes, { mode: 0o600 });
    for (const status of ["0", "1"]) {
      const args = { ...evidenceArgs(log), "test-status": status,
        out: `${log}.evidence.json`, "require-complete": "true" };
      const result = spawnSync(process.execPath, [
        path.join(repoRoot, "tools/ocr-models/native-acceptance-evidence.mjs"),
        ...Object.entries(args).map(([key, value]) => `--${key}=${value}`),
      ], { cwd: repoRoot, encoding: "utf8" });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "bounded_native_ocr_evidence_failed\n");
      const evidence = JSON.parse(readFileSync(args.out, "utf8"));
      assert.equal(evidence.stderrDiagnostic, known);
      assert.equal(evidence.collectionFailureReason, "non_allowlisted_stderr");
      assert.equal(isCompleteEvidence(evidence), false);
    }
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
      fixtureId: manifestFixtureIds[index],
      field: "provider_status",
    })),
    runtime: null,
    coldLoadTimeMs: null,
    endToEndLatencyMs: { sampleCount: 0, cold: null, warmP50: null, warmP95: null, max: null },
    nativeLatencyMs: { sampleCount: 0, cold: null, warmP50: null, warmP95: null, max: null },
    peakRssBytes: 1,
    perScript: { Latin: { total: 101, passed: 0 } },
    recognitionCoverage: manifestFixtureIds.map((fixtureId) => ({
      fixtureId, blockCount: 0, merchantExactTextSeen: false,
      totalExactTokenSeen: false, expectedItemCount: 0, itemDescriptionsExactTextSeen: 0,
    })),
  };
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`), (logPath) => {
    const evidence = buildEvidence({ ...evidenceArgs(logPath), "test-status": "1" }, repoRoot);
    assert.equal(evidence.acceptance.mismatchCount, 101);
    assert.equal(evidence.acceptance.runtime, null);
    assert.equal(isCompleteEvidence(evidence), false);
    const recovered = buildFailureEvidence({ ...evidenceArgs(logPath), "test-status": "1" }, repoRoot);
    assert.equal(recovered.acceptance.mismatchCount, 101);
    assert.equal(recovered.acceptance.mismatches.length, 101);
    assert.equal(recovered.acceptance.recognitionCoverage.length, 101);
    assert.equal(recovered.acceptance.runtime, null);
  });
});

test("retains one provider exception within a complete bounded coverage inventory", () => {
  const failedFixtureId = manifestFixtureIds.at(-1);
  const acceptance = {
    schemaVersion: 1, platform: "android", completed: true, networkIsolated: true,
    fixtureCount: 101, passedFixtureCount: 100, mismatchCount: 1,
    mismatches: [{ fixtureId: failedFixtureId, field: "provider_exception" }],
    recognitionCoverage: manifestFixtureIds.map((fixtureId) => ({
      fixtureId, blockCount: fixtureId === failedFixtureId ? 0 : 2,
      merchantExactTextSeen: false, totalExactTokenSeen: false,
      expectedItemCount: 0, itemDescriptionsExactTextSeen: 0,
    })),
    runtime: null, coldLoadTimeMs: null,
    endToEndLatencyMs: { sampleCount: 101, cold: 1, warmP50: 1, warmP95: 1, max: 1 },
    nativeLatencyMs: { sampleCount: 100, cold: 1, warmP50: 1, warmP95: 1, max: 1 },
    peakRssBytes: 1, perScript: { Latin: { total: 101, passed: 100 } },
  };
  withLog(protocolLog(`SETTLEORA_OCR_ACCEPTANCE=${JSON.stringify(acceptance)}`), (logPath) => {
    const evidence = buildFailureEvidence({ ...evidenceArgs(logPath), "test-status": "1" }, repoRoot);
    assert.equal(evidence.acceptance.mismatchCount, 1);
    assert.deepEqual(evidence.acceptance.mismatches, acceptance.mismatches);
    assert.equal(evidence.acceptance.recognitionCoverage.length, 101);
    assert.equal(evidence.acceptance.recognitionCoverage.at(-1).blockCount, 0);
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
      fixtureId: manifestFixtureIds[index],
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
    .replace('"testID":6,"messageType"', '"testID":99,"messageType"');
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
    .replace(/\{"type":"testStart","time":1,"test":\{"id":5,[^\n]+\n/, "")
    .replace('{"type":"testDone","time":3,"testID":5,"result":"success","skipped":false,"hidden":false}\n', "");
  withLog(missingRotation, (logPath) => {
    const evidence = buildEvidence(evidenceArgs(logPath), repoRoot);
    assert.equal(evidence.execution.protocolSucceeded, false);
  });

  const wrongDeclaredCount = protocolLog().replace('"testCount":6', '"testCount":5');
  withLog(wrongDeclaredCount, (logPath) => {
    const evidence = buildEvidence(evidenceArgs(logPath), repoRoot);
    assert.equal(evidence.execution.protocolSucceeded, false);
  });

  const uiMarker = "SETTLEORA_OCR_UI_SMOKE={}";
  const wrongOwner = protocolLog(uiMarker).replace('"testID":6,"messageType"', '"testID":2,"messageType"');
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
    mismatches: [{ fixtureId: manifestFixtureIds[0], field: "merchant" }],
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

for (const lifecycle of [false, true]) {
  for (const isFailure of [false, true]) {
    test(`acceptance errors fail closed despite successful completion: lifecycle=${lifecycle}, assertion=${isFailure}`, () => {
      for (let testID = 1; testID <= 6; testID += 1) {
        const events = lifecycle ? protocolLogWithLifecycle() : protocolLog().trimEnd().split("\n").map(JSON.parse);
        const complete = completeEvidenceControl();
        withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
          const clean = buildEvidence(evidenceArgs(log), repoRoot);
          assert.equal(clean.execution.protocolSucceeded, true);
          assert.equal(isCompleteEvidence({ ...complete, execution: clean.execution }), true);
        });
        const done = events.findIndex((event) => event.type === "testDone" && event.testID === testID);
        events.splice(done, 0, {
          type: "error", time: 2, testID, isFailure,
          error: "synthetic acceptance error must not be retained",
          stackTrace: "synthetic private path must not be retained",
        });
        withLog(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, (log) => {
          const evidence = buildEvidence(evidenceArgs(log), repoRoot);
          assert.equal(evidence.execution.protocolSucceeded, false, `testID=${testID}`);
          assert.equal(isCompleteEvidence({ ...complete, execution: evidence.execution }), false);
          assert.equal(JSON.stringify(evidence).includes("synthetic acceptance error"), false);
          assert.equal(JSON.stringify(evidence).includes("synthetic private path"), false);
        });
      }
    });
  }
}

test("first collection rejection identifies only the actual failing boundary", () => {
  const cases = [
    ["arguments", protocolLog(), (args) => ({ ...args, "source-sha": "private-invalid-sha" })],
    ["input_streams", protocolLog(), (args) => ({ ...args, log: args.log + ".missing" })],
    ["runner_protocol", "private invalid protocol\n", (args) => args],
    ["fixture_inventory", protocolLog(), (args) => args, (log) => path.dirname(log)],
    ["acceptance_marker", protocolLog("SETTLEORA_OCR_ACCEPTANCE={"), (args) => args],
    ["ui_smoke_marker", protocolLog("SETTLEORA_OCR_UI_SMOKE={"), (args) => args],
    ["diagnostic_markers", protocolLog("SETTLEORA_OCR_DIAGNOSTIC={"), (args) => args],
    ["collection_metadata", protocolLog(), (args) => ({ ...args, "base-sha": "private-invalid-base" })],
  ];
  for (const [phase, contents, configure, root] of cases) {
    withLog(contents, (log) => {
      const args = configure(evidenceArgs(log));
      let caught;
      assert.throws(() => {
        try { buildEvidence(args, root ? root(log) : repoRoot); }
        catch (error) { caught = error; throw error; }
      });
      const evidence = buildFailureEvidence(args, repoRoot, caught);
      assert.deepEqual(evidence.collectionRejection, {
        schemaVersion: 1, phase, reason: "boundary_rejected",
      });
      assert.equal(evidence.collectionFailureReason, "unclassified");
      assert.equal(evidence.stderrDiagnostic, "not_classified");
      assert.equal(isCompleteEvidence(evidence), false);
      assert.doesNotMatch(JSON.stringify(evidence), /private|Acceptance runner|ENOENT/);
      assert.equal(Object.hasOwn(evidence.execution, "protocolSucceeded"), false);
      assert.equal(Object.hasOwn(evidence, "identities"), false);
      assert.equal(Object.hasOwn(evidence, "packageEvidence"), false);
    });
  }
});

test("first collection rejection preserves the original thrown value and first phase", () => {
  withLog("private malformed protocol\n", (log) => {
    for (const original of [new Error("private original error"), {}, () => {}, "private primitive", null, 7]) {
      const args = evidenceArgs(log);
      Object.defineProperty(args, "log", { get() { throw original; } });
      let caught;
      try { buildEvidence(args, repoRoot); } catch (error) { caught = error; }
      assert.equal(caught, original);
      const evidence = buildFailureEvidence(evidenceArgs(log), repoRoot, caught);
      assert.deepEqual(evidence.collectionRejection, {
        schemaVersion: 1,
        phase: original !== null && ["object", "function"].includes(typeof original)
          ? "arguments" : "unclassified",
        reason: original !== null && ["object", "function"].includes(typeof original)
          ? "boundary_rejected" : "unclassified",
      });
      assert.doesNotMatch(JSON.stringify(evidence), /private|original error/);
    }
  });
});

test("collection phase observation does not inspect a thrown Proxy", () => {
  withLog(protocolLog(), (log) => {
    const trap = () => { throw new Error("private proxy trap"); };
    const live = new Proxy({}, { getPrototypeOf: trap, get: trap, ownKeys: trap });
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    for (const original of [live, revocable.proxy]) {
      const args = evidenceArgs(log);
      Object.defineProperty(args, "log", { get() { throw original; } });
      let caught;
      try { buildEvidence(args, repoRoot); } catch (error) { caught = error; }
      assert.equal(caught, original);
      const recovered = buildFailureEvidence(evidenceArgs(log), repoRoot, caught);
      assert.deepEqual(recovered.collectionRejection, {
        schemaVersion: 1, phase: "arguments", reason: "boundary_rejected",
      });
      assert.equal(recovered.collectionFailureReason, "unclassified");
      assert.equal(recovered.stderrDiagnostic, "not_classified");
      assert.equal(isCompleteEvidence(recovered), false);
    }
  });
});

test("collection rejection metadata cannot be forged, mutated, or inferred from recovery", () => {
  withLog("private invalid protocol\n", (log) => {
    let original;
    try { buildEvidence(evidenceArgs(log), repoRoot); } catch (error) { original = error; }
    const expected = { schemaVersion: 1, phase: "runner_protocol", reason: "boundary_rejected" };
    const first = buildFailureEvidence(evidenceArgs(log), repoRoot, original);
    assert.deepEqual(first.collectionRejection, expected);
    first.collectionRejection.phase = "private mutated result";
    original.collectionRejection = { schemaVersion: 1, phase: "private forged", reason: "private forged" };
    original.name = "private forged name";
    original.message = "private forged message";
    writeFileSync(log, protocolLog(), { mode: 0o600 });
    assert.deepEqual(buildFailureEvidence(evidenceArgs(log), repoRoot, original).collectionRejection, expected);
    for (const supplied of [undefined, null, "runner_protocol", new Error("private forged"),
      { ...original }, { collectionRejection: expected }, { phase: "runner_protocol", reason: "boundary_rejected" }]) {
      const evidence = buildFailureEvidence(evidenceArgs(log), repoRoot, supplied);
      assert.deepEqual(evidence.collectionRejection, {
        schemaVersion: 1, phase: "unclassified", reason: "unclassified",
      });
      assert.doesNotMatch(JSON.stringify(evidence), /private|forged/);
    }
  });
});

test("first collection rejection keeps stderr precedence and all existing CLI failures", () => {
  for (const platform of ["android", "ios"]) {
    withLog("private invalid protocol\n", (log) => {
      writeFileSync(log + ".stderr", "private stderr\n", { mode: 0o600 });
      let caught;
      try { buildEvidence(evidenceArgs(log, platform), repoRoot); } catch (error) { caught = error; }
      const evidence = buildFailureEvidence(evidenceArgs(log, platform), repoRoot, caught);
      assert.deepEqual(evidence.collectionRejection, {
        schemaVersion: 1, phase: "runner_protocol", reason: "non_allowlisted_stderr",
      });
      assert.equal(evidence.collectionFailureReason, "non_allowlisted_stderr");
      assert.equal(evidence.stderrDiagnostic, "other_nonempty");
      assert.equal(isCompleteEvidence(evidence), false);
      assert.doesNotMatch(JSON.stringify(evidence), /private/);
      for (const status of ["0", "1"]) {
        const args = { ...evidenceArgs(log, platform), "test-status": status,
          out: log + ".evidence.json", "require-complete": "true" };
        const result = spawnSync(process.execPath, [
          path.join(repoRoot, "tools/ocr-models/native-acceptance-evidence.mjs"),
          ...Object.entries(args).map(([key, value]) => `--${key}=${value}`),
        ], { cwd: repoRoot, encoding: "utf8" });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.equal(result.stderr, "bounded_native_ocr_evidence_failed\n");
        assert.deepEqual(JSON.parse(readFileSync(args.out, "utf8")).collectionRejection,
          evidence.collectionRejection);
      }
    });
  }
});

test("successful collection omits the failure-only rejection field", () => {
  withLog(protocolLog(), (log) => {
    const evidence = buildEvidence(evidenceArgs(log), repoRoot);
    assert.equal(evidence.execution.protocolSucceeded, true);
    assert.equal(Object.hasOwn(evidence, "collectionRejection"), false);
    const complete = completeEvidenceControl();
    assert.equal(isCompleteEvidence(complete), true);
    for (const value of [null, undefined, "", {}, [], { schemaVersion: 1, phase: "arguments", reason: "boundary_rejected" }]) {
      assert.equal(isCompleteEvidence({ ...complete, collectionRejection: value }), false);
    }
  });
});

test("a reused exception gets the first rejection phase of its latest collection call", () => {
  withLog(protocolLog(), (log) => {
    const original = new Error("private reusable error");
    const firstArgs = evidenceArgs(log);
    Object.defineProperty(firstArgs, "log", { get() { throw original; } });
    let first;
    try { buildEvidence(firstArgs, repoRoot); } catch (error) { first = error; }
    assert.equal(first, original);
    assert.deepEqual(buildFailureEvidence(evidenceArgs(log), repoRoot, first).collectionRejection, {
      schemaVersion: 1, phase: "arguments", reason: "boundary_rejected",
    });
    const secondArgs = evidenceArgs(log);
    let reads = 0;
    Object.defineProperty(secondArgs, "log", { get() {
      if (++reads === 1) return log;
      throw original;
    } });
    let second;
    try { buildEvidence(secondArgs, repoRoot); } catch (error) { second = error; }
    assert.equal(second, original);
    const expected = { schemaVersion: 1, phase: "input_streams", reason: "boundary_rejected" };
    assert.deepEqual(buildFailureEvidence(evidenceArgs(log), repoRoot, second).collectionRejection, expected);
    // Error-only recovery can retain only this object's latest observation;
    // it does not create a token or history for a delayed earlier recovery.
    assert.deepEqual(buildFailureEvidence(evidenceArgs(log), repoRoot, first).collectionRejection, expected);
  });
});
