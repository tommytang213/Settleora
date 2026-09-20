import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const maxLogBytes = 32 * 1024 * 1024;
const maxMarkerBytes = 512 * 1024;
const safeToken = /^[A-Za-z0-9_.:[\]-]{1,160}$/;
const androidPreflightFailurePhases = new Set([
  "initialize",
  "resolve_tools",
  "verify_sdk_revisions",
  "verify_device",
  "emit_environment",
  "isolate_airplane_mode",
  "isolate_wifi",
  "isolate_mobile_data",
  "verify_network_controls",
  "execute_flutter_test",
]);
const iosPreflightFailurePhases = new Set([
  "initialize",
  "validate_environment",
  "build_network_isolation",
  "execute_flutter_test",
]);

function isAllowedPreflightFailurePhase(platform, phase) {
  return (platform === "android" && androidPreflightFailurePhases.has(phase)) ||
    (platform === "ios" && iosPreflightFailurePhases.has(phase));
}

export function buildFailureEvidence(args) {
  const platform = new Set(["android", "ios"]).has(args.platform) ? args.platform : null;
  const statusToken = args["test-status"];
  const parsedStatus = typeof statusToken === "string" && /^(0|[1-9][0-9]*)$/.test(statusToken)
    ? Number(statusToken)
    : null;
  const testExitStatus = Number.isSafeInteger(parsedStatus)
    ? parsedStatus
    : null;
  const requestedPhase = args["failure-phase"] || null;
  const preflightFailurePhase = isAllowedPreflightFailurePhase(platform, requestedPhase)
    ? requestedPhase
    : null;
  const boundedSize = (filePath) => {
    try {
      const size = statSync(filePath).size;
      return Number.isSafeInteger(size) && size >= 0 && size <= maxLogBytes ? size : null;
    } catch {
      return null;
    }
  };
  return {
    schemaVersion: 1,
    platform,
    sourceSha: /^[0-9a-f]{40}$/.test(args["source-sha"] ?? "")
      ? args["source-sha"]
      : null,
    execution: {
      testExitStatus,
      preflightFailurePhase,
      stdoutBytes: boundedSize(args.log),
      stderrBytes: boundedSize(args["stderr-log"]),
    },
    acceptance: { completed: false },
    uiSmoke: { completed: false },
    diagnostics: extractFailureDiagnostics(args, platform),
    collectionFailure: "invalid_or_unavailable_bounded_evidence",
  };
}

function parseOptionalBytes(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Package sizes must be non-negative safe integers");
  }
  return parsed;
}

function boundedInteger(value, name, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function positiveInteger(value, name) {
  const parsed = boundedInteger(value, name);
  if (parsed === 0) throw new Error(`${name} must be positive`);
  return parsed;
}

function boundedToken(value, name, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  if (typeof value !== "string" || !safeToken.test(value)) {
    throw new Error(`${name} is not a bounded evidence token`);
  }
  return value;
}

function boundedIdentity(value, name) {
  const token = boundedToken(value, name);
  if (/unknown/i.test(token)) throw new Error(`${name} must be resolved`);
  return token;
}

function assertExactKeys(value, allowed, name) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new Error(`${name} contains non-allowlisted fields`);
  const missing = allowed.filter((key) => !Object.hasOwn(value, key));
  if (missing.length > 0) throw new Error(`${name} is missing required fields`);
}

function assertType(value, type, name, { nullable = false } = {}) {
  if (nullable && value == null) return;
  if (typeof value !== type) throw new Error(`${name} has an invalid type`);
}

function assertProtocolMetadata(value, name) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  assertExactKeys(value, ["skip", "skipReason"], name);
  assertType(value.skip, "boolean", `${name}.skip`);
  assertType(value.skipReason, "string", `${name}.skipReason`, { nullable: true });
}

function assertProtocolLocation(value, name, { group = false } = {}) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const common = ["id", "suiteID", "name", "metadata", "line", "column", "url"];
  assertExactKeys(value, group ? [...common, "parentID", "testCount"] : [...common, "groupIDs"], name);
  boundedInteger(value.id, `${name}.id`);
  boundedInteger(value.suiteID, `${name}.suiteID`);
  assertType(value.name, "string", `${name}.name`);
  assertProtocolMetadata(value.metadata, `${name}.metadata`);
  if (value.line != null) boundedInteger(value.line, `${name}.line`);
  if (value.column != null) boundedInteger(value.column, `${name}.column`);
  assertType(value.url, "string", `${name}.url`, { nullable: true });
  if (group) {
    if (value.parentID != null) boundedInteger(value.parentID, `${name}.parentID`);
    boundedInteger(value.testCount, `${name}.testCount`);
  } else {
    if (!Array.isArray(value.groupIDs) || value.groupIDs.some((id) => !Number.isSafeInteger(id) || id < 0)) {
      throw new Error(`${name}.groupIDs is invalid`);
    }
  }
}

function assertProtocolEvent(event) {
  const name = `protocol ${event.type}`;
  boundedInteger(event.time, `${name}.time`);
  switch (event.type) {
    case "start":
      assertExactKeys(event, ["type", "time", "protocolVersion", "runnerVersion", "pid"], name);
      if (!Object.hasOwn(event, "runnerVersion")) {
        throw new Error(`${name}.runnerVersion is required`);
      }
      assertType(event.protocolVersion, "string", `${name}.protocolVersion`);
      assertType(event.runnerVersion, "string", `${name}.runnerVersion`, { nullable: true });
      boundedInteger(event.pid, `${name}.pid`);
      break;
    case "allSuites":
      assertExactKeys(event, ["type", "time", "count"], name);
      boundedInteger(event.count, `${name}.count`);
      break;
    case "suite":
      assertExactKeys(event, ["type", "time", "suite"], name);
      assertExactKeys(event.suite, ["id", "platform", "path"], `${name}.suite`);
      boundedInteger(event.suite.id, `${name}.suite.id`);
      assertType(event.suite.platform, "string", `${name}.suite.platform`);
      assertType(event.suite.path, "string", `${name}.suite.path`);
      break;
    case "group":
      assertExactKeys(event, ["type", "time", "group"], name);
      assertProtocolLocation(event.group, `${name}.group`, { group: true });
      break;
    case "testStart":
      assertExactKeys(event, ["type", "time", "test"], name);
      assertProtocolLocation(event.test, `${name}.test`);
      break;
    case "testDone":
      assertExactKeys(event, ["type", "time", "testID", "result", "skipped", "hidden"], name);
      boundedInteger(event.testID, `${name}.testID`);
      assertType(event.result, "string", `${name}.result`);
      assertType(event.skipped, "boolean", `${name}.skipped`);
      assertType(event.hidden, "boolean", `${name}.hidden`);
      break;
    case "done":
      assertExactKeys(event, ["type", "time", "success"], name);
      assertType(event.success, "boolean", `${name}.success`);
      break;
    case "print":
      assertExactKeys(event, ["type", "time", "testID", "messageType", "message"], name);
      boundedInteger(event.testID, `${name}.testID`);
      if (event.messageType !== "print") {
        throw new Error(`${name}.messageType is invalid`);
      }
      assertType(event.message, "string", `${name}.message`);
      break;
    case "error":
      assertExactKeys(event, ["type", "time", "testID", "error", "stackTrace", "isFailure"], name);
      boundedInteger(event.testID, `${name}.testID`);
      assertType(event.error, "string", `${name}.error`);
      assertType(event.stackTrace, "string", `${name}.stackTrace`);
      assertType(event.isFailure, "boolean", `${name}.isFailure`);
      if (
        Buffer.byteLength(event.error, "utf8") > 64 * 1024 ||
        Buffer.byteLength(event.stackTrace, "utf8") > 256 * 1024
      ) {
        throw new Error(`${name} exceeds its protocol bound`);
      }
      break;
    default:
      throw new Error("Acceptance runner emitted a non-allowlisted protocol event");
  }
}

function latencySummary(value, name) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  assertExactKeys(value, ["sampleCount", "cold", "warmP50", "warmP95", "max"], name);
  const optionalNonNegativeInteger = (metric, metricName) => {
    if (metric == null) return null;
    return boundedInteger(metric, metricName);
  };
  const summary = {
    sampleCount: boundedInteger(value.sampleCount, `${name}.sampleCount`),
    cold: optionalNonNegativeInteger(value.cold, `${name}.cold`),
    warmP50: optionalNonNegativeInteger(value.warmP50, `${name}.warmP50`),
    warmP95: optionalNonNegativeInteger(value.warmP95, `${name}.warmP95`),
    max: optionalNonNegativeInteger(value.max, `${name}.max`),
  };
  const allMetrics = [summary.cold, summary.warmP50, summary.warmP95, summary.max];
  const invalidEmpty = summary.sampleCount === 0 && allMetrics.some((metric) => metric != null);
  const invalidSingle = summary.sampleCount === 1 && (
    summary.cold == null ||
    summary.max == null ||
    summary.cold !== summary.max ||
    summary.warmP50 != null ||
    summary.warmP95 != null
  );
  const invalidMultiple = summary.sampleCount > 1 && (
    allMetrics.some((metric) => metric == null) ||
    summary.cold > summary.max ||
    summary.warmP50 > summary.warmP95 ||
    summary.warmP95 > summary.max
  );
  if (summary.sampleCount > 101 || invalidEmpty || invalidSingle || invalidMultiple) {
    throw new Error(`${name} is internally inconsistent`);
  }
  return summary;
}

function sanitizeEnvironment(args) {
  return {
    runnerImage: boundedIdentity(args["runner-image"], "runner-image"),
    osRuntime: boundedIdentity(args["os-runtime"], "os-runtime"),
    sdkToolchain: boundedIdentity(args["sdk-toolchain"], "sdk-toolchain"),
    device: boundedIdentity(args.device, "device"),
    nativeImage: boundedIdentity(args["native-image"], "native-image"),
  };
}

function parseSafeRunnerLog(log, stderrLog) {
  // Flutter and the native toolchains may write build/runtime diagnostics to
  // stderr even when --machine stdout remains valid. Treat stderr as an
  // untrusted, bounded input and deliberately discard it; it is never copied
  // into the evidence artifact. Completion still requires valid stdout
  // protocol markers and a zero test exit status.
  void stderrLog;
  const allowedEventTypes = new Set([
    "start", "allSuites", "suite", "group", "testStart", "testDone", "done", "error",
  ]);
  const markerMessages = [];
  const expectedTests = new Set([
    "native acceptance runner has no external network",
    "all 101 real images match complete preview truth",
    "a real fixture rotated 270 degrees matches complete truth",
    "representative production receipt review UI uses real provider",
  ]);
  const expectedMarkerOwners = new Map([
    ["SETTLEORA_OCR_ACCEPTANCE=", "all 101 real images match complete preview truth"],
    ["SETTLEORA_OCR_UI_SMOKE=", "representative production receipt review UI uses real provider"],
  ]);
  let startCount = 0;
  let allSuitesCount = 0;
  let declaredSuiteCount = null;
  let suiteCount = 0;
  let rootGroupCount = 0;
  let declaredRootTestCount = null;
  let doneCount = 0;
  let protocolSucceeded = false;
  let failedProtocolEvent = false;
  let protocolStarted = false;
  let protocolDone = false;
  const startedTests = new Map();
  const suites = new Set();
  const groups = new Map();
  const completedTestIds = new Set();
  for (const [index, line] of log.split(/\r?\n/).entries()) {
    if (line === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`Acceptance runner line ${index + 1} is not protocol JSON`);
    }
    if (protocolDone) throw new Error("Acceptance runner emitted an event after completion");
    if (Array.isArray(event)) {
      if (
        event.length !== 1 ||
        event[0] == null ||
        typeof event[0] !== "object" ||
        Array.isArray(event[0])
      ) {
        throw new Error(`Acceptance runner line ${index + 1} is not a bounded daemon event`);
      }
      assertExactKeys(event[0], ["event", "params"], "daemon event");
      if (event[0].event !== "test.startedProcess") {
        throw new Error("Acceptance runner emitted a non-allowlisted daemon event");
      }
      assertExactKeys(event[0].params, ["vmServiceUri"], "daemon event params");
      assertType(event[0].params.vmServiceUri, "string", "daemon event params.vmServiceUri", { nullable: true });
      continue;
    }
    if (event == null || typeof event !== "object") {
      throw new Error(`Acceptance runner line ${index + 1} is not a protocol event`);
    }
    assertProtocolEvent(event);
    if (event.type === "start") {
      if (protocolStarted) throw new Error("Acceptance runner emitted duplicate start events");
      protocolStarted = true;
      startCount += 1;
    } else if (!protocolStarted) {
      throw new Error("Acceptance runner emitted an event before start");
    }
    if (event.type === "allSuites") {
      allSuitesCount += 1;
      declaredSuiteCount = event.count;
    }
    if (event.type === "suite") {
      if (suites.has(event.suite.id)) throw new Error("Acceptance runner emitted a duplicate suite");
      suites.add(event.suite.id);
      suiteCount += 1;
      if (!event.suite.path.endsWith("integration_test/receipt_ocr_real_provider_test.dart")) {
        throw new Error("Acceptance runner suite identity is invalid");
      }
    }
    if (event.type === "group") {
      if (
        groups.has(event.group.id) ||
        !suites.has(event.group.suiteID) ||
        (event.group.parentID != null && !groups.has(event.group.parentID))
      ) {
        throw new Error("Acceptance runner emitted an invalid group reference");
      }
      if (
        event.group.parentID != null &&
        groups.get(event.group.parentID).suiteID !== event.group.suiteID
      ) {
        throw new Error("Acceptance runner emitted a cross-suite group reference");
      }
      groups.set(event.group.id, {
        suiteID: event.group.suiteID,
        parentID: event.group.parentID,
      });
      if (event.group.parentID == null) {
        rootGroupCount += 1;
        declaredRootTestCount = event.group.testCount;
      }
    }
    if (event.type === "testStart") {
      const referencedGroups = event.test.groupIDs.map((id) => groups.get(id));
      const validGroupChain = referencedGroups.length > 0 && referencedGroups.every(
        (group, groupIndex) => group != null &&
          group.suiteID === event.test.suiteID &&
          group.parentID === (groupIndex === 0 ? null : event.test.groupIDs[groupIndex - 1]),
      );
      if (
        startedTests.has(event.test.id) ||
        !expectedTests.has(event.test.name) ||
        !suites.has(event.test.suiteID) ||
        !validGroupChain
      ) {
        throw new Error("Acceptance runner emitted a duplicate test or invalid suite/group reference");
      }
      if ([...startedTests.values()].includes(event.test.name)) {
        throw new Error("Acceptance runner emitted a duplicate test identity");
      }
      startedTests.set(event.test.id, event.test.name);
    }
    if (event.type === "print" || event.type === "error" || event.type === "testDone") {
      const testId = event.testID;
      if (!startedTests.has(testId) || completedTestIds.has(testId)) {
        throw new Error("Acceptance runner referenced an inactive test");
      }
      if (event.type === "testDone") completedTestIds.add(testId);
    }
    if (event.type === "done") {
      if (startedTests.size === 0 || completedTestIds.size !== startedTests.size) {
        throw new Error("Acceptance runner completed with unfinished tests");
      }
      doneCount += 1;
      protocolSucceeded = event.success;
      protocolDone = true;
    }
    if (
      (event.type === "error" && event.isFailure) ||
      (event.type === "testDone" && (event.result !== "success" || event.skipped))
    ) {
      failedProtocolEvent = true;
    }
    if (event.type === "print") {
      if (
        typeof event.message !== "string" ||
        (!event.message.startsWith("SETTLEORA_OCR_ACCEPTANCE=") &&
          !event.message.startsWith("SETTLEORA_OCR_UI_SMOKE=") &&
          !event.message.startsWith("SETTLEORA_OCR_DIAGNOSTIC="))
      ) {
        throw new Error("Acceptance runner emitted non-allowlisted application output");
      }
      markerMessages.push(event.message);
      for (const [marker, owner] of expectedMarkerOwners) {
        if (event.message.startsWith(marker) && startedTests.get(event.testID) !== owner) {
          throw new Error("Acceptance marker was emitted by the wrong test");
        }
      }
    } else if (!allowedEventTypes.has(event.type)) {
      throw new Error("Acceptance runner emitted a non-allowlisted protocol event");
    }
  }
  for (const marker of ["SETTLEORA_OCR_ACCEPTANCE=", "SETTLEORA_OCR_UI_SMOKE="]) {
    if (markerMessages.filter((message) => message.startsWith(marker)).length > 1) {
      throw new Error("Acceptance runner emitted duplicate bounded markers");
    }
  }
  return {
    markerMessages,
    protocolSucceeded:
      startCount === 1 &&
      allSuitesCount === 1 &&
      declaredSuiteCount === 1 &&
      suiteCount === 1 &&
      suites.size === 1 &&
      groups.size >= 1 &&
      rootGroupCount === 1 &&
      declaredRootTestCount === expectedTests.size &&
      doneCount === 1 &&
      startedTests.size === expectedTests.size &&
      completedTestIds.size === startedTests.size &&
      protocolSucceeded &&
      !failedProtocolEvent,
  };
}

function sanitizeAcceptance(value, platform) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Acceptance marker must contain an object");
  }
  if (value.platform !== platform || value.schemaVersion !== 1 || value.completed !== true) {
    throw new Error("Acceptance marker identity is invalid");
  }
  assertExactKeys(value, [
    "schemaVersion", "platform", "completed", "networkIsolated", "fixtureCount", "passedFixtureCount",
    "mismatchCount", "mismatches", "runtime", "coldLoadTimeMs", "endToEndLatencyMs",
    "nativeLatencyMs", "peakRssBytes", "perScript",
  ], "acceptance marker");
  if (!Array.isArray(value.mismatches) || value.mismatches.length > 4096) {
    throw new Error("Acceptance mismatch evidence is not bounded");
  }
  const mismatches = value.mismatches.map((entry, index) => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`mismatches[${index}] must be an object`);
    }
    assertExactKeys(entry, ["fixtureId", "field"], `mismatches[${index}]`);
    return {
      fixtureId: boundedToken(entry.fixtureId, `mismatches[${index}].fixtureId`),
      field: boundedToken(entry.field, `mismatches[${index}].field`),
    };
  });
  if (value.perScript == null || typeof value.perScript !== "object" || Array.isArray(value.perScript)) {
    throw new Error("perScript must be an object");
  }
  const scriptEntries = Object.entries(value.perScript);
  if (scriptEntries.length > 32) throw new Error("perScript evidence is not bounded");
  const perScript = Object.fromEntries(
    scriptEntries.map(([script, counts]) => {
      boundedToken(script, "perScript key");
      if (counts == null || typeof counts !== "object" || Array.isArray(counts)) {
        throw new Error(`perScript.${script} must be an object`);
      }
      assertExactKeys(counts, ["total", "passed"], `perScript.${script}`);
      return [
        script,
        {
          total: boundedInteger(counts.total, `perScript.${script}.total`),
          passed: boundedInteger(counts.passed, `perScript.${script}.passed`),
        },
      ];
    }),
  );
  const fixtureCount = boundedInteger(value.fixtureCount, "fixtureCount");
  const passedFixtureCount = boundedInteger(value.passedFixtureCount, "passedFixtureCount");
  const mismatchCount = boundedInteger(value.mismatchCount, "mismatchCount");
  const failedFixtureCount = new Set(mismatches.map(({ fixtureId }) => fixtureId)).size;
  const scriptTotals = Object.values(perScript).reduce(
    (total, counts) => ({ total: total.total + counts.total, passed: total.passed + counts.passed }),
    { total: 0, passed: 0 },
  );
  if (
    fixtureCount !== 101 ||
    passedFixtureCount > fixtureCount ||
    mismatchCount !== mismatches.length ||
    failedFixtureCount !== fixtureCount - passedFixtureCount ||
    scriptTotals.total !== fixtureCount ||
    scriptTotals.passed !== passedFixtureCount ||
    Object.values(perScript).some(({ total, passed }) => passed > total)
  ) {
    throw new Error("Acceptance counts are internally inconsistent");
  }
  const expectedRuntime = platform === "android"
    ? "onnxruntime-android:1.21.1:cpu"
    : "onnxruntime-objc:1.24.3:cpu";
  const runtime = boundedToken(value.runtime, "runtime", { nullable: true });
  if (runtime != null && runtime !== expectedRuntime) {
    throw new Error("Acceptance runtime identity is invalid");
  }
  return {
    schemaVersion: 1,
    platform,
    completed: true,
    networkIsolated: value.networkIsolated === true,
    fixtureCount,
    passedFixtureCount,
    mismatchCount,
    mismatches,
    runtime,
    coldLoadTimeMs: value.coldLoadTimeMs == null
      ? null
      : boundedInteger(value.coldLoadTimeMs, "coldLoadTimeMs"),
    endToEndLatencyMs: latencySummary(value.endToEndLatencyMs, "endToEndLatencyMs"),
    nativeLatencyMs: latencySummary(value.nativeLatencyMs, "nativeLatencyMs"),
    peakRssBytes: positiveInteger(value.peakRssBytes, "peakRssBytes"),
    perScript,
  };
}

function sanitizeUiSmoke(value, platform) {
  if (
    value == null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    value.platform !== platform ||
    value.completed !== true
  ) {
    throw new Error("UI smoke marker identity is invalid");
  }
  assertExactKeys(
    value,
    ["schemaVersion", "platform", "completed", "fixtureId", "previewPanel", "applyBoundaryVisible"],
    "UI smoke marker",
  );
  return {
    schemaVersion: 1,
    platform,
    completed: true,
    fixtureId: boundedToken(value.fixtureId, "uiSmoke.fixtureId"),
    previewPanel: value.previewPanel === true,
    applyBoundaryVisible: value.applyBoundaryVisible === true,
  };
}

const diagnosticStages = new Set([
  "network_canary",
  "corpus_manifest",
  "corpus_fixture_load",
  "corpus_normalization",
  "corpus_provider",
  "corpus_comparison",
  "corpus_evidence",
  "rotation_manifest",
  "rotation_fixture_load",
  "rotation_normalization",
  "rotation_provider",
  "rotation_comparison",
  "ui_manifest",
  "ui_fixture_load",
  "ui_render",
  "ui_evidence",
]);

function sanitizeDiagnostic(value, platform) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Diagnostic marker must contain an object");
  }
  assertExactKeys(value, ["schemaVersion", "platform", "stage", "fixtureId"], "diagnostic marker");
  if (value.schemaVersion !== 1 || value.platform !== platform || !diagnosticStages.has(value.stage)) {
    throw new Error("Diagnostic marker identity is invalid");
  }
  return {
    schemaVersion: 1,
    platform,
    stage: value.stage,
    fixtureId: boundedToken(value.fixtureId, "diagnostic.fixtureId", { nullable: true }),
  };
}

function parseDiagnostics(lines, platform) {
  const marker = "SETTLEORA_OCR_DIAGNOSTIC=";
  const markedLines = lines.filter((line) => line.startsWith(marker));
  if (markedLines.length > 4) throw new Error("Acceptance runner emitted too many diagnostic markers");
  return markedLines.map((line) => {
    const encoded = line.slice(marker.length);
    if (Buffer.byteLength(encoded, "utf8") > maxMarkerBytes) {
      throw new Error("Diagnostic marker exceeds its bound");
    }
    return sanitizeDiagnostic(JSON.parse(encoded), platform);
  });
}

function extractFailureDiagnostics(args, platform) {
  if (platform == null || typeof args.log !== "string") return [];
  let log;
  try {
    if (statSync(args.log).size > maxLogBytes) return [];
    log = readFileSync(args.log, "utf8");
  } catch {
    return [];
  }
  const marker = "SETTLEORA_OCR_DIAGNOSTIC=";
  const markerMessages = [];
  for (const line of log.split(/\r?\n/)) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      event != null &&
      !Array.isArray(event) &&
      event.type === "print" &&
      typeof event.message === "string" &&
      event.message.startsWith(marker)
    ) {
      markerMessages.push(event.message);
    }
  }
  try {
    return parseDiagnostics(markerMessages, platform);
  } catch {
    return [];
  }
}

function parseMarker(lines, marker, sanitize, fallback) {
  const markedLine = lines.findLast((line) => line.includes(marker));
  if (!markedLine) return fallback;
  const encoded = markedLine.slice(markedLine.indexOf(marker) + marker.length);
  if (Buffer.byteLength(encoded, "utf8") > maxMarkerBytes) {
    throw new Error(`${marker} evidence exceeds its bound`);
  }
  return sanitize(JSON.parse(encoded));
}

export function buildEvidence(args, repoRoot = process.cwd()) {
  for (const required of ["log", "stderr-log", "platform", "source-sha", "test-status", "runner-image", "os-runtime", "sdk-toolchain", "device", "native-image", "base-sha"]) {
    if (!args[required]) throw new Error(`Missing --${required}`);
  }
  if (!new Set(["android", "ios"]).has(args.platform)) {
    throw new Error("Platform must be android or ios");
  }
  if (!/^[0-9a-f]{40}$/.test(args["source-sha"])) {
    throw new Error("Source SHA must be an exact lowercase commit SHA");
  }
  if (statSync(args.log).size > maxLogBytes) {
    throw new Error("Acceptance log exceeds the bounded parser limit");
  }
  if (statSync(args["stderr-log"]).size > maxLogBytes) {
    throw new Error("Acceptance stderr log exceeds the bounded parser limit");
  }
  const log = readFileSync(args.log, "utf8");
  const stderrLog = readFileSync(args["stderr-log"], "utf8");
  const protocol = parseSafeRunnerLog(log, stderrLog);
  const acceptance = parseMarker(
    protocol.markerMessages,
    "SETTLEORA_OCR_ACCEPTANCE=",
    (value) => sanitizeAcceptance(value, args.platform),
    { schemaVersion: 1, platform: args.platform, completed: false, markerProduced: false },
  );
  const uiSmoke = parseMarker(
    protocol.markerMessages,
    "SETTLEORA_OCR_UI_SMOKE=",
    (value) => sanitizeUiSmoke(value, args.platform),
    { schemaVersion: 1, platform: args.platform, completed: false, markerProduced: false },
  );
  const diagnostics = parseDiagnostics(protocol.markerMessages, args.platform);

  const catalogPath = path.join(repoRoot, "apps/mobile/assets/receipt_ocr_models/catalog.json");
  const manifestPath = path.join(repoRoot, "apps/mobile/test/fixtures/receipt_ocr/manifest.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const catalogModelFileCount = catalog.packs.flatMap((pack) => pack.files).length;
  const expectedFixtureAbsenceCount = 102;
  const sha256 = (filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex");
  const fullBytes = parseOptionalBytes(args["full-bytes"]);
  const modelFreeBytes = parseOptionalBytes(args["model-free-bytes"]);
  const baseAppBytes = parseOptionalBytes(args["base-app-bytes"]);
  const verifiedModelFileCount = parseOptionalBytes(args["verified-model-file-count"]);
  const verifiedCatalogFileCount = parseOptionalBytes(args["verified-catalog-file-count"]);
  const verifiedFixtureAbsenceCount = parseOptionalBytes(args["verified-fixture-absence-count"]);
  const testExitStatus = boundedInteger(Number(args["test-status"]), "test-status");
  const preflightFailurePhase = args["failure-phase"] || null;
  if (
    preflightFailurePhase != null &&
    !isAllowedPreflightFailurePhase(args.platform, preflightFailurePhase)
  ) {
    throw new Error("Preflight failure phase is invalid");
  }
  const expectedBaseSha = "e4d4edd0d6854845cc67b00924f6d22af6a70688";
  if (args["base-sha"] !== expectedBaseSha) throw new Error("Base app SHA is invalid");
  if (fullBytes != null && modelFreeBytes != null && fullBytes < modelFreeBytes) {
    throw new Error("Bundled model package delta cannot be negative");
  }
  if (fullBytes != null && baseAppBytes != null && fullBytes < baseAppBytes) {
    throw new Error("OCR stack package delta cannot be negative");
  }

  return {
    schemaVersion: 1,
    platform: args.platform,
    sourceSha: args["source-sha"],
    execution: {
      testExitStatus,
      protocolSucceeded: protocol.protocolSucceeded,
      preflightFailurePhase,
      environment: sanitizeEnvironment(args),
    },
    acceptance,
    uiSmoke,
    diagnostics,
    packageEvidence: {
      fullBytes,
      baselineWithoutBundledModelPayloadBytes: modelFreeBytes,
      bundledModelPackageDeltaBytes:
        fullBytes == null || modelFreeBytes == null ? null : fullBytes - modelFreeBytes,
      baseAppBytes,
      ocrStackPackageDeltaBytes:
        fullBytes == null || baseAppBytes == null ? null : fullBytes - baseAppBytes,
      catalogModelBytes: boundedInteger(catalog.totalBundledBytes, "catalog.totalBundledBytes"),
      catalogModelFileCount: positiveInteger(catalogModelFileCount, "catalog model file count"),
      expectedCatalogFileCount: 1,
      verifiedCatalogFileCount,
      verifiedModelFileCount,
      expectedFixtureAbsenceCount,
      verifiedFixtureAbsenceCount,
    },
    identities: {
      catalogSha256: sha256(catalogPath),
      manifestSha256: sha256(manifestPath),
      fixtureTreeSha256: boundedToken(
        catalog.acceptanceContract?.fixtureCorpus?.treeSha256,
        "catalog.acceptanceContract.fixtureCorpus.treeSha256",
      ),
      fixtureCount: 101,
      baseAppSha: args["base-sha"],
    },
  };
}

function parseArgs(values) {
  return Object.fromEntries(
    values.map((value) => {
      const separator = value.indexOf("=");
      if (!value.startsWith("--") || separator < 3) {
        throw new Error(`Expected --name=value, got ${value}`);
      }
      return [value.slice(2, separator), value.slice(separator + 1)];
    }),
  );
}

export function isCompleteEvidence(evidence) {
  return Boolean(
    Array.isArray(evidence.diagnostics) &&
      evidence.diagnostics.length === 0 &&
      evidence.execution.preflightFailurePhase == null &&
      evidence.acceptance.completed &&
      evidence.acceptance.networkIsolated === true &&
      evidence.execution.testExitStatus === 0 &&
      evidence.execution.protocolSucceeded === true &&
      evidence.acceptance.passedFixtureCount === 101 &&
      evidence.acceptance.mismatchCount === 0 &&
      evidence.acceptance.runtime != null &&
      evidence.acceptance.coldLoadTimeMs > 0 &&
      evidence.acceptance.endToEndLatencyMs.sampleCount === 101 &&
      evidence.acceptance.endToEndLatencyMs.cold > 0 &&
      evidence.acceptance.endToEndLatencyMs.warmP50 > 0 &&
      evidence.acceptance.endToEndLatencyMs.warmP95 > 0 &&
      evidence.acceptance.endToEndLatencyMs.max > 0 &&
      evidence.acceptance.nativeLatencyMs.sampleCount === 101 &&
      evidence.acceptance.nativeLatencyMs.cold > 0 &&
      evidence.acceptance.nativeLatencyMs.warmP50 > 0 &&
      evidence.acceptance.nativeLatencyMs.warmP95 > 0 &&
      evidence.acceptance.nativeLatencyMs.max > 0 &&
      evidence.acceptance.peakRssBytes > 0 &&
      evidence.uiSmoke.completed &&
      evidence.uiSmoke.previewPanel &&
      evidence.uiSmoke.applyBoundaryVisible &&
      evidence.packageEvidence.fullBytes != null &&
      evidence.packageEvidence.verifiedModelFileCount ===
        evidence.packageEvidence.catalogModelFileCount &&
      evidence.packageEvidence.verifiedCatalogFileCount ===
        evidence.packageEvidence.expectedCatalogFileCount &&
      evidence.packageEvidence.verifiedFixtureAbsenceCount ===
        evidence.packageEvidence.expectedFixtureAbsenceCount &&
      evidence.packageEvidence.baselineWithoutBundledModelPayloadBytes != null &&
      evidence.packageEvidence.bundledModelPackageDeltaBytes > 0 &&
      evidence.packageEvidence.baseAppBytes != null &&
      evidence.packageEvidence.ocrStackPackageDeltaBytes > 0,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new Error("Missing --out");
  let evidence;
  try {
    evidence = buildEvidence(args);
  } catch {
    evidence = buildFailureEvidence(args);
    writeFileSync(args.out, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    throw new Error("Bounded native OCR evidence collection failed");
  }
  writeFileSync(args.out, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`Wrote bounded ${args.platform} OCR acceptance evidence`);
  if (args["require-complete"] === "true" && !isCompleteEvidence(evidence)) {
    throw new Error("Native OCR acceptance evidence is incomplete or failing");
  }
}
