import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeFlutterRunner } from "./flutter-runner-diagnostics.mjs";

const maxLogBytes = 32 * 1024 * 1024;
const maxMarkerBytes = 512 * 1024;
const safeToken = /^[A-Za-z0-9_.:[\]-]{1,160}$/;
// These are the only script labels in the immutable 101-fixture corpus.
const acceptanceScripts = new Set([
  "Arabic", "Chinese", "Cyrillic", "Devanagari", "Japanese", "Korean", "Latin", "Thai",
]);
const reviewedUiFixtureId = "existing_12_freshmart_grocery_en_US";
// Observed verbatim in three successful package builds of Android job
// 112615006322 (Flutter 3.44.8, google_mlkit_commons 0.11.1). This identifies
// diagnostic content only; even this exact stream remains rejected.
const knownAndroidJavacNotes = Buffer.from(
  "Note: /home/runner/.pub-cache/hosted/pub.dev/google_mlkit_commons-0.11.1/android/src/main/java/com/google_mlkit_commons/InputImageConverter.java uses unchecked or unsafe operations.\n" +
  "Note: Recompile with -Xlint:unchecked for details.\n",
);
// Only this internal error type can classify a collection failure. Never
// serialize arbitrary errors, messages, paths, or native/plugin output.
class NonAllowlistedStderrError extends Error {
  constructor(stderrBytes, platform) {
    super("Acceptance runner emitted non-allowlisted stderr");
    this.diagnostic = platform === "android" && stderrBytes.equals(knownAndroidJavacNotes)
      ? "known_javac_unchecked_notes_only"
      : "other_nonempty";
  }
}
const androidPreflightFailurePhases = new Set([
  "kvm_setup",
  "kvm_preflight",
  "initialize",
  "resolve_tools",
  "verify_sdk_revisions",
  "verify_device",
  "emit_environment",
  "isolate_airplane_mode",
  "isolate_wifi",
  "isolate_mobile_data",
  "verify_network_controls",
  "verify_airplane_mode",
  "verify_mobile_data",
  "execute_flutter_test",
]);
const iosPreflightFailurePhases = new Set([
  "initialize",
  "validate_environment",
  "build_network_isolation",
  "build_simulator_link_anchor",
  "verify_simulator_link_anchor_object",
  "verify_simulator_link_anchor_symbol",
  "verify_simulator_linker_resolution",
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
  "execute_flutter_test",
  "verify_simulator_interposer_link_after_test",
  "cleanup_network_isolation",
]);

function isAllowedPreflightFailurePhase(platform, phase) {
  return (platform === "android" && androidPreflightFailurePhases.has(phase)) ||
    (platform === "ios" && iosPreflightFailurePhases.has(phase));
}

function immutableFixtureIds(repoRoot) {
  const manifestPath = path.join(repoRoot, "apps/mobile/test/fixtures/receipt_ocr/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const fixtureEntries = manifest.fixtures;
  if (!Array.isArray(fixtureEntries) || fixtureEntries.length !== 101 ||
      fixtureEntries.some((fixture) => typeof fixture?.id !== "string")) {
    throw new Error("Immutable OCR fixture inventory is invalid");
  }
  const expectedFixtureIds = new Set(fixtureEntries.map((fixture) => fixture.id));
  if (expectedFixtureIds.size !== 101) {
    throw new Error("Immutable OCR fixture inventory is invalid");
  }
  return expectedFixtureIds;
}

export function buildFailureEvidence(args, repoRoot = process.cwd(), collectionError) {
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
  let expectedFixtureIds;
  try {
    expectedFixtureIds = immutableFixtureIds(repoRoot);
  } catch {
    // Failure recovery remains bounded when the checkout itself is invalid.
  }
  const acceptance = extractFailureMarker(
    args,
    platform,
    "SETTLEORA_OCR_ACCEPTANCE=",
    (value, markerPlatform) => sanitizeAcceptance(value, markerPlatform, expectedFixtureIds, repoRoot),
    { completed: false },
  );
  const uiSmoke = extractFailureMarker(
    args,
    platform,
    "SETTLEORA_OCR_UI_SMOKE=",
    sanitizeUiSmoke,
    { completed: false },
  );
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
    acceptance,
    uiSmoke,
    diagnostics: extractFailureDiagnostics(args, platform, expectedFixtureIds),
    ...(platform === "ios" ? { flutterRunnerDiagnostics: summarizeFlutterRunner(args.log, args["stderr-log"]) } : {}),
    collectionFailure: "invalid_or_unavailable_bounded_evidence",
    collectionFailureReason: collectionError instanceof NonAllowlistedStderrError
      ? "non_allowlisted_stderr"
      : "unclassified",
    stderrDiagnostic: collectionError instanceof NonAllowlistedStderrError
      ? (collectionError.diagnostic === "known_javac_unchecked_notes_only"
        ? "known_javac_unchecked_notes_only" : "other_nonempty")
      : "not_classified",
  };
}

function extractFailureMarker(args, platform, marker, sanitize, fallback) {
  if (platform == null || typeof args.log !== "string") return fallback;
  let log;
  try {
    if (statSync(args.log).size > maxLogBytes) return fallback;
    log = readFileSync(args.log, "utf8");
  } catch {
    return fallback;
  }
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
  if (markerMessages.length !== 1) return fallback;
  try {
    return parseMarker(markerMessages, marker, (value) => sanitize(value, platform), fallback);
  } catch {
    return fallback;
  }
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

function parseSafeRunnerLog(log, stderrBytes, platform) {
  // Successful acceptance must be silent on stderr. Retain only a fixed
  // diagnostic enum from whole-buffer equality, never text or arbitrary
  // hashes. Known compiler notes do not bypass the rejection.
  if (stderrBytes.length !== 0) {
    throw new NonAllowlistedStderrError(stderrBytes, platform);
  }
  const allowedEventTypes = new Set([
    "start", "allSuites", "suite", "group", "testStart", "testDone", "done", "error",
  ]);
  const markerMessages = [];
  const expectedTests = new Set([
    "bounded diagnostic matches whole item and amount tokens",
    "explicit item currency is separate from receipt currency",
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
  const suitePaths = new Map();
  const loadingTests = new Map();
  const loadingSuites = new Set();
  const completedLoadingIds = new Set();
  const teardownTests = new Map();
  const completedTeardownIds = new Set();
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
      suitePaths.set(event.suite.id, event.suite.path);
      suiteCount += 1;
      if (!event.suite.path.endsWith("integration_test/receipt_ocr_real_provider_test.dart")) {
        throw new Error("Acceptance runner suite identity is invalid");
      }
    }
    if (event.type === "group") {
      if (
        groups.has(event.group.id) ||
        completedLoadingIds.size !== loadingTests.size ||
        teardownTests.size !== 0 ||
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
      // Flutter reports suite loading as a hidden test with no groups. Bind
      // that lifecycle to the declared suite path, separately from the six
      // required acceptance tests; it can never own application markers.
      if (event.test.name === `loading ${suitePaths.get(event.test.suiteID)}`) {
        if (
          startedTests.has(event.test.id) || loadingTests.has(event.test.id) ||
          !suites.has(event.test.suiteID) || loadingSuites.has(event.test.suiteID) ||
          startedTests.size !== 0 || groups.size !== 0 ||
          event.test.groupIDs.length !== 0 || event.test.metadata.skip ||
          event.test.metadata.skipReason !== null || event.test.line !== null ||
          event.test.column !== null || event.test.url !== null
        ) {
          throw new Error("Acceptance runner emitted an invalid suite-loading test");
        }
        loadingTests.set(event.test.id, event.test.suiteID);
        loadingSuites.add(event.test.suiteID);
        continue;
      }
      const referencedGroups = event.test.groupIDs.map((id) => groups.get(id));
      const validGroupChain = referencedGroups.length > 0 && referencedGroups.every(
        (group, groupIndex) => group != null &&
          group.suiteID === event.test.suiteID &&
          group.parentID === (groupIndex === 0 ? null : event.test.groupIDs[groupIndex - 1]),
      );
      // integration_test registers one root tearDownAll hook. It is a hidden
      // framework lifecycle test after the six acceptance tests, never an
      // additional acceptance result or an owner of application output.
      if (event.test.name === "(tearDownAll)") {
        if (
          teardownTests.size !== 0 || startedTests.has(event.test.id) ||
          loadingTests.has(event.test.id) || !suites.has(event.test.suiteID) ||
          completedLoadingIds.size !== loadingTests.size ||
          startedTests.size !== expectedTests.size ||
          completedTestIds.size !== expectedTests.size ||
          !validGroupChain || event.test.groupIDs.length !== 1 ||
          event.test.metadata.skip || event.test.metadata.skipReason !== null ||
          event.test.url !== "package:integration_test/integration_test.dart" ||
          event.test.line == null || event.test.line < 1 ||
          event.test.column == null || event.test.column < 1
        ) {
          throw new Error("Acceptance runner emitted an invalid integration teardown test");
        }
        teardownTests.set(event.test.id, event.test.suiteID);
        continue;
      }
      if (
        startedTests.has(event.test.id) ||
        loadingTests.has(event.test.id) ||
        teardownTests.size !== 0 ||
        completedLoadingIds.size !== loadingTests.size ||
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
      if (loadingTests.has(testId) || teardownTests.has(testId)) {
        const completed = loadingTests.has(testId) ? completedLoadingIds : completedTeardownIds;
        if (completed.has(testId) || event.type === "print") {
          throw new Error("Acceptance runner emitted output from an inactive, suite-loading or integration-teardown test");
        }
        if (event.type === "error") {
          failedProtocolEvent = true;
        } else {
          completed.add(testId);
          if (event.result !== "success" || event.skipped || !event.hidden) {
            failedProtocolEvent = true;
          }
        }
        continue;
      }
      if (!startedTests.has(testId) || completedTestIds.has(testId)) {
        throw new Error("Acceptance runner referenced an inactive test");
      }
      if (event.type === "testDone") completedTestIds.add(testId);
    }
    if (event.type === "done") {
      if (startedTests.size === 0 || completedTestIds.size !== startedTests.size ||
          completedLoadingIds.size !== loadingTests.size ||
          completedTeardownIds.size !== teardownTests.size) {
        throw new Error("Acceptance runner completed with unfinished tests");
      }
      doneCount += 1;
      protocolSucceeded = event.success;
      protocolDone = true;
    }
    if (
      event.type === "error" ||
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
      completedLoadingIds.size === loadingTests.size &&
      completedTeardownIds.size === teardownTests.size &&
      protocolSucceeded &&
      !failedProtocolEvent,
  };
}

function sanitizeNumericRoutingObservation(value) {
  const label = "numericRoutingObservation";
  const envelope = ["schemaVersion", "stage", "status"];
  const countKeys = ["observedCropCount", "numericCandidateCropCount", "eligibleNumericCandidateCropCount",
    "competingEligibleNumericCandidateCropCount", "eligibleNumericLiteralDisagreementCropCount",
    "selectedShorterThanEligibleNumericAlternateCropCount", "selectedShorterThanAnyNumericAlternateCropCount"];
  const binKeys = ["noSelection", "nonNumeric", "one", "two", "three", "four", "fiveToEight", "ninePlus"];
  if (value == null || value.schemaVersion !== 1 || value.stage !== "selectedOrientationPreRecovery" ||
      !["observed", "unavailable"].includes(value.status)) {
    throw new Error("Numeric routing observation identity is invalid");
  }
  const observed = value.status === "observed";
  assertExactKeys(value, [...envelope, ...(observed ? ["counts", "bins"] : [])], label);
  const result = { schemaVersion: 1, stage: value.stage, status: value.status };
  if (!observed) return result;
  // Version 1 fixes the tuple orders to countKeys/binKeys; named native channel
  // fields remain typed in Dart. Exact lengths/types are mandatory on this wire.
  if (!Array.isArray(value.counts) || value.counts.length !== countKeys.length ||
      !Array.isArray(value.bins) || value.bins.length !== binKeys.length) {
    throw new Error("Numeric routing observation tuples are invalid");
  }
  const count = (value, name) => {
    const result = boundedInteger(value, `${label}.${name}`);
    if (result > 256) throw new Error("Numeric routing observation count is invalid");
    return result;
  };
  const counts = Object.fromEntries(countKeys.map((key, index) => [key, count(value.counts[index], key)]));
  const bins = Object.fromEntries(binKeys.map((key, index) => [key, count(value.bins[index], key)]));
  const total = Object.values(bins).reduce((sum, value) => sum + value, 0);
  const selectedNumeric = total - bins.noSelection - bins.nonNumeric;
  if (total !== counts.observedCropCount ||
      counts.eligibleNumericLiteralDisagreementCropCount > counts.competingEligibleNumericCandidateCropCount ||
      counts.competingEligibleNumericCandidateCropCount > counts.eligibleNumericCandidateCropCount ||
      counts.eligibleNumericCandidateCropCount > counts.numericCandidateCropCount ||
      counts.numericCandidateCropCount > counts.observedCropCount ||
      counts.eligibleNumericCandidateCropCount > counts.observedCropCount - bins.noSelection ||
      selectedNumeric > counts.eligibleNumericCandidateCropCount ||
      counts.selectedShorterThanEligibleNumericAlternateCropCount > counts.selectedShorterThanAnyNumericAlternateCropCount ||
      counts.selectedShorterThanAnyNumericAlternateCropCount > selectedNumeric ||
      counts.selectedShorterThanEligibleNumericAlternateCropCount > counts.eligibleNumericLiteralDisagreementCropCount) {
    throw new Error("Numeric routing observation count relationships are invalid");
  }
  return { ...result, counts: Object.values(counts), bins: Object.values(bins) };
}

const productReviewConditions = [null,
  "printed unsupported fees need manual review",
  "printed combined taxes and fees need manual review",
  "printed fee and payment credit need manual review",
  "printed total differs from visible charge-line arithmetic",
  "printed item currency differs from charged receipt currency",
  "printed surcharge and account credit need manual review"];
function productReviewKinds(repoRoot) {
  const file = path.join(repoRoot, "apps/mobile/test/fixtures/receipt_ocr/manifest.json");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  return new Map(manifest.fixtures.map((fixture) => {
    const condition = fixture.expected?.expected_review_condition ?? null;
    const index = productReviewConditions.indexOf(condition);
    return [fixture.id, index === -1 ? 7 : index];
  }));
}

const fixtureProcessingFailureFields = new Set(["normalization","provider_status","provider_exception","ocr_resource_lookup","ocr_model_open","ocr_model_configuration","ocr_runtime_initialization","ocr_runtime_initialization_opencv","ocr_runtime_initialization_onnxruntime","ocr_input_validation","ocr_postprocessing","ocr_detection_inference","ocr_recognition_inference","ocr_output_decode"]);

function sanitizeProductObservation(value, entry, expectedKind, mismatches) {
  if (!Array.isArray(value) || value.length !== 6 ||
      value.some((part) => !Number.isSafeInteger(part))) {
    throw new Error("Product observation tuple is invalid");
  }
  const [version, state, kind, match, checked, failed] = value;
  const fields = mismatches.filter((m) => m.fixtureId === entry.fixtureId).map((m) => m.field);
  const processingFailed = fields.some((field) => fixtureProcessingFailureFields.has(field));
  const hasManifestFailure = fields.includes("manifest_shape");
  const phaseMatches = state === 0 ? fields.length === 1 && hasManifestFailure
    : state === 1 ? processingFailed && !hasManifestFailure
      : state === 2 ? fields.length === 1 && fields[0] === "provider_status"
        : state === 3 && !processingFailed && !hasManifestFailure;

  // V1 witnesses only processing bit0. Every other safety/usability dimension
  // is unassessed; a future positive witness needs a reviewed schema extension.
  if (!phaseMatches || version !== 1 || state < 0 || state > 3 || kind !== expectedKind ||
      match < 0 || match > 2 || checked !== (state === 0 ? 0 : 1) ||
      failed !== (state === 1 || state === 2 ? 1 : 0) ||
      typeof entry.previewPresent !== "boolean" ||
      entry.previewPresent !== (state === 3) ||
      (state !== 3 && match !== 0) || (state === 3 && match === 0) ||
      (kind === 7 && state === 3 && match !== 2) ||
      (state === 3 && (match === 2) !==
        mismatches.some((m) => m.fixtureId === entry.fixtureId && m.field === "review_condition"))) {
    throw new Error("Product observation facts are inconsistent");
  }
  return [...value];
}

function sanitizeAcceptance(value, platform, expectedFixtureIds, repoRoot) {
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
    ...(Object.hasOwn(value, "recognitionCoverage") ? ["recognitionCoverage"] : []),
  ], "acceptance marker");
  if (!Array.isArray(value.mismatches) || value.mismatches.length > 4096) {
    throw new Error("Acceptance mismatch evidence is not bounded");
  }
  const mismatches = value.mismatches.map((entry, index) => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`mismatches[${index}] must be an object`);
    }
    assertExactKeys(entry, ["fixtureId", "field"], `mismatches[${index}]`);
    const fixtureId = boundedToken(entry.fixtureId, `mismatches[${index}].fixtureId`);
    if (!expectedFixtureIds?.has(fixtureId)) {
      throw new Error("Acceptance mismatch fixture is outside the immutable corpus");
    }
    const field = boundedToken(entry.field, `mismatches[${index}].field`);
    // The corpus harness can fail before preview-field comparison begins.
    const corpusPreprocessingFailure = field === "normalization" || field === "manifest_shape";
    if (!corpusPreprocessingFailure && !isAllowedComparisonField(field)) {
      throw new Error("Acceptance mismatch field is outside fixed comparison diagnostics");
    }
    return { fixtureId, field };
  });
  const recognitionCoverage = Object.hasOwn(value, "recognitionCoverage") ? value.recognitionCoverage : [];
  if (!Array.isArray(recognitionCoverage) || recognitionCoverage.length > 101) {
    throw new Error("Recognition coverage evidence is not bounded");
  }
  const hasProducts = recognitionCoverage.some((entry) => entry != null && Object.hasOwn(entry, "productObservation"));
  const expectedReviewKinds = hasProducts ? productReviewKinds(repoRoot) : null;
  const coverageFixtures = new Set();
  const boundedRecognitionCoverage = recognitionCoverage.map((entry, index) => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`recognitionCoverage[${index}] must be an object`);
    }
    const layoutKeys = ["rowCount", "actualItemCount", "merchantExactTextInOneRow", "itemDescriptionsSameRowAsAmount",
      "itemDescriptionsWithinAdjacentAmountRow", "chargeTableHeaderSameRow"];
    const hasLayoutCoverage = layoutKeys.some((key) => Object.hasOwn(entry, key));
    const cellKeys = ["parserLineCount", "itemDescriptionsSameBlockAsAmount", "itemDescriptionsWithDistinctAmountBlock"];
    const hasCellCoverage = cellKeys.some((key) => Object.hasOwn(entry, key));
    const hasReviewHintCategory = Object.hasOwn(entry, "reviewHintCategory");
    const previewWarningKeys = ["previewPresent", "previewWarningCount", "previewWarningCategoryCounts"];
    const hasPreviewWarnings = previewWarningKeys.some((key) => Object.hasOwn(entry, key));
    const hasHeaderFields = Object.hasOwn(entry, "headerFieldStates");
    const reviewDecisionKeys = ["reviewDecision", "incompleteAdjustmentReasons"];
    const hasReviewDecision = reviewDecisionKeys.some((key) => Object.hasOwn(entry, key));
    const itemDecisionKeys = ["itemLineDecisionCounts", "expectedDescriptionDecisionCounts"];
    const hasItemDecisions = itemDecisionKeys.some((key) => Object.hasOwn(entry, key));
    const rowShapeKeys = ["expectedUnretainedRowShapeCounts", "selectedRowWithoutExpectedPairDecisionCounts"];
    const hasRowShapes = rowShapeKeys.some((key) => Object.hasOwn(entry, key));
    const patternReasonKeys = ["expectedUnretainedPatternReasonCounts", "unmatchedDraftItemOriginCounts"];
    const hasPatternReasons = patternReasonKeys.some((key) => Object.hasOwn(entry, key));
    const unresolvedKeys = ["unresolvedItemLikeCount", "unresolvedItemLikeRoleCounts",
      "nordicFooterOwnershipFailureCounts"];
    const hasUnresolvedOwnership = unresolvedKeys.some((key) => Object.hasOwn(entry, key));
    const hasUnresolvedOtherDecisions = Object.hasOwn(entry, "unresolvedOtherBranchDecisionCounts");
    const hasNumericRoutingObservation = Object.hasOwn(entry, "numericRoutingObservation");
    const hasProductObservation = Object.hasOwn(entry, "productObservation");
    const draftKeys = ["expectedItemDescriptionsInDraft", "expectedItemPairsInDraft",
      "expectedDateTokenSeen", "expectedTaxTokenSeen", "expectedSubtotalTokenSeen"];
    const hasDraftCoverage = draftKeys.some((key) => Object.hasOwn(entry, key));
    assertExactKeys(entry, ["fixtureId", "blockCount", "merchantExactTextSeen", "totalExactTokenSeen",
      "expectedItemCount", "itemDescriptionsExactTextSeen", ...(hasLayoutCoverage ? layoutKeys : []),
      ...(hasCellCoverage ? cellKeys : []), ...(hasReviewHintCategory ? ["reviewHintCategory"] : []),
      ...(hasPreviewWarnings ? previewWarningKeys : []),
      ...(hasHeaderFields ? ["headerFieldStates"] : []),
      ...(hasReviewDecision ? reviewDecisionKeys : []),
      ...(hasItemDecisions ? itemDecisionKeys : []),
      ...(hasRowShapes ? rowShapeKeys : []),
      ...(hasPatternReasons ? patternReasonKeys : []),
      ...(hasUnresolvedOwnership ? unresolvedKeys : []),
      ...(hasUnresolvedOtherDecisions ? ["unresolvedOtherBranchDecisionCounts"] : []),
      ...(hasNumericRoutingObservation ? ["numericRoutingObservation"] : []),
      ...(hasProductObservation ? ["productObservation"] : []),
      ...(hasDraftCoverage ? draftKeys : [])],
    `recognitionCoverage[${index}]`);
    const fixtureId = boundedToken(entry.fixtureId, `recognitionCoverage[${index}].fixtureId`);
    let headerFieldStates = null;
    if (hasHeaderFields) {
      const fields = ["merchant", "date", "currency", "subtotal", "tax", "service", "tip", "shipping", "discount", "total"];
      const states = ["matchingValue", "matchingAbsence", "missingValue", "differentValue", "unexpectedValue", "noPreview"];
      const label = `recognitionCoverage[${index}].headerFieldStates`;
      assertExactKeys(entry.headerFieldStates, fields, label);
      if (!hasPreviewWarnings || typeof entry.previewPresent !== "boolean" || fields.some((field) =>
        !states.includes(entry.headerFieldStates[field]) ||
        (entry.headerFieldStates[field] === "noPreview") !== !entry.previewPresent)) {
        throw new Error("Recognition coverage header field states are invalid");
      }
      headerFieldStates = Object.fromEntries(fields.map((field) => [field, entry.headerFieldStates[field]]));
    }
    let previewWarningCount = null;
    let previewWarningCategoryCounts = null;
    if (hasPreviewWarnings) {
      const categories = ["noReadableText", "dccAmountMissing", "itemChargedCurrencyConflict",
        "itemReceiptCurrencyConflict", "noItems", "ratedTaxAmbiguity", "untraceableItemAmount",
        "noTotal", "currencyFallback", "symbolCurrencyUnresolved", "conflictingDate", "stayOnlyDate", "unknownWarning"];
      const label = `recognitionCoverage[${index}].previewWarningCategoryCounts`;
      assertExactKeys(entry.previewWarningCategoryCounts, categories, label);
      previewWarningCount = boundedInteger(entry.previewWarningCount,
        `recognitionCoverage[${index}].previewWarningCount`);
      previewWarningCategoryCounts = Object.fromEntries(categories.map((category) => [category,
        boundedInteger(entry.previewWarningCategoryCounts[category], `${label}.${category}`)]));
      if (typeof entry.previewPresent !== "boolean" || previewWarningCount > 100 ||
          Object.values(previewWarningCategoryCounts).some((count) => count > 100) ||
          Object.values(previewWarningCategoryCounts).reduce((sum, count) => sum + count, 0) !== previewWarningCount ||
          (!entry.previewPresent && previewWarningCount !== 0)) {
        throw new Error("Recognition coverage preview warnings are invalid");
      }
    }
    const blockCount = boundedInteger(entry.blockCount, `recognitionCoverage[${index}].blockCount`);
    const expectedItemCount = boundedInteger(entry.expectedItemCount, `recognitionCoverage[${index}].expectedItemCount`);
    const itemDescriptionsExactTextSeen = boundedInteger(entry.itemDescriptionsExactTextSeen, `recognitionCoverage[${index}].itemDescriptionsExactTextSeen`);
    const rowCount = hasLayoutCoverage ? boundedInteger(entry.rowCount, `recognitionCoverage[${index}].rowCount`) : null;
    const actualItemCount = hasLayoutCoverage ? boundedInteger(entry.actualItemCount,
      `recognitionCoverage[${index}].actualItemCount`) : null;
    const sameRowCount = hasLayoutCoverage ? boundedInteger(entry.itemDescriptionsSameRowAsAmount,
      `recognitionCoverage[${index}].itemDescriptionsSameRowAsAmount`) : null;
    const adjacentRowCount = hasLayoutCoverage ? boundedInteger(entry.itemDescriptionsWithinAdjacentAmountRow,
      `recognitionCoverage[${index}].itemDescriptionsWithinAdjacentAmountRow`) : null;
    const parserLineCount = hasCellCoverage ? boundedInteger(entry.parserLineCount,
      `recognitionCoverage[${index}].parserLineCount`) : null;
    let unresolvedOwnership = null;
    if (hasUnresolvedOwnership) {
      const roles = ["nordicCourtesy", "other"];
      const failures = ["noTotal", "notLastRow", "notAfterTotal", "layoutRowCountMismatch",
        "unownedFinancialEvidence", "missingBounds", "overlapTransaction",
        "nonpositiveContentWidth", "footerTooWide", "footerOffCenter", "other"];
      const label = `recognitionCoverage[${index}]`;
      assertExactKeys(entry.unresolvedItemLikeRoleCounts, roles, label + ".unresolvedItemLikeRoleCounts");
      assertExactKeys(entry.nordicFooterOwnershipFailureCounts, failures, label + ".nordicFooterOwnershipFailureCounts");
      const unresolvedItemLikeCount = boundedInteger(entry.unresolvedItemLikeCount, label + ".unresolvedItemLikeCount");
      const unresolvedItemLikeRoleCounts = Object.fromEntries(roles.map((role) => [role,
        boundedInteger(entry.unresolvedItemLikeRoleCounts[role], label + ".unresolvedItemLikeRoleCounts." + role)]));
      const nordicFooterOwnershipFailureCounts = Object.fromEntries(failures.map((reason) => [reason,
        boundedInteger(entry.nordicFooterOwnershipFailureCounts[reason], label + ".nordicFooterOwnershipFailureCounts." + reason)]));
      const roleCounts = Object.values(unresolvedItemLikeRoleCounts);
      const failureCounts = Object.values(nordicFooterOwnershipFailureCounts);
      if (!hasCellCoverage || !hasReviewDecision || unresolvedItemLikeCount > parserLineCount ||
          [...roleCounts, ...failureCounts].some((count) => count > parserLineCount) ||
          roleCounts.reduce((sum, count) => sum + count, 0) !== unresolvedItemLikeCount ||
          failureCounts.reduce((sum, count) => sum + count, 0) !== unresolvedItemLikeRoleCounts.nordicCourtesy ||
          !Array.isArray(entry.incompleteAdjustmentReasons) ||
          (unresolvedItemLikeCount > 0) !== entry.incompleteAdjustmentReasons.includes("unresolvedItemLikeLine") ||
          (hasPreviewWarnings && entry.previewPresent === false && unresolvedItemLikeCount !== 0)) {
        throw new Error("Recognition coverage unresolved ownership is invalid");
      }
      unresolvedOwnership = { unresolvedItemLikeCount, unresolvedItemLikeRoleCounts, nordicFooterOwnershipFailureCounts };
    }
    const sameBlockCount = hasCellCoverage ? boundedInteger(entry.itemDescriptionsSameBlockAsAmount,
      `recognitionCoverage[${index}].itemDescriptionsSameBlockAsAmount`) : null;
    const distinctBlockCount = hasCellCoverage ? boundedInteger(entry.itemDescriptionsWithDistinctAmountBlock,
      `recognitionCoverage[${index}].itemDescriptionsWithDistinctAmountBlock`) : null;
    const reviewHintCategory = hasReviewHintCategory
      ? boundedToken(entry.reviewHintCategory, `recognitionCoverage[${index}].reviewHintCategory`) : null;
    const reviewDecision = hasReviewDecision
      ? boundedToken(entry.reviewDecision, `recognitionCoverage[${index}].reviewDecision`) : null;
    const allowedReviewDecisions = new Set(["none", "foreignItemCurrency", "itemSumUnavailableWithAdjustment", "subtotalMismatch",
      "incompleteAdjustmentWithSubtotal", "referenceAdjustmentUnreconciledWithSubtotal",
      "grandTotalMismatchWithSubtotal", "foreignAdjustmentWithSubtotal",
      "incompleteAdjustmentWithoutSubtotal", "referenceAdjustmentUnreconciledWithoutSubtotal",
      "grandTotalMismatchWithoutSubtotal", "foreignAdjustmentWithoutSubtotal"]);
    const allowedIncompleteReasons = new Set(["labeledAmountEvidence", "detachedLabeledSign",
      "chargeTableAdjustment", "multipleAdjustmentRoles", "adjustmentAmountMissingOrRate",
      "multipleMonetaryTokens", "unclassifiedAdjustmentLabel", "subtotalAmountMissingOrRate",
      "conflictingSubtotal", "repeatedAdjustmentRole", "itemLimit", "unretainedPricedItem",
      "detachedAmountSign", "ambiguousChargeTable", "unresolvedItemLikeLine"]);
    const itemDecisionNames = ["unclassified", "fuelItemSelected", "layoutChargeSelected", "ambiguousChargeSkipped",
      "metadataOrHeaderSkipped", "standaloneAmountSkipped", "layoutFallbackSelected",
      "adjacentAmountSelected", "unpricedDescription", "unretainedPricedRow",
      "invalidPricedRow", "quantityItemSelected", "leadingQuantityItemSelected", "pricedItemSelected"];
    const unretainedShapeNames = ["noParserAmountToken", "trailingText", "trailingSymbol",
      "joinedAmount", "multipleAmounts", "other"];
    const selectedDecisionNames = new Set(["layoutChargeSelected", "layoutFallbackSelected",
      "quantityItemSelected", "leadingQuantityItemSelected", "pricedItemSelected"]);
    const itemOriginNames = new Set(["fuelItemSelected", "layoutChargeSelected", "layoutFallbackSelected",
      "adjacentAmountSelected", "quantityItemSelected", "leadingQuantityItemSelected", "pricedItemSelected"]);
    const patternReasonNames = ["recognizedCurrencySuffixStillRejected", "otherSuffixDeletionWouldMatch",
      "suffixAndBoundaryInsertionWouldMatch", "trailingTextOtherMismatch",
      "amountBoundaryInsertionWouldMatch", "joinedAmountOtherMismatch", "other"];
    if (hasItemDecisions) {
      assertExactKeys(entry.itemLineDecisionCounts, itemDecisionNames,
        `recognitionCoverage[${index}].itemLineDecisionCounts`);
      assertExactKeys(entry.expectedDescriptionDecisionCounts,
        [...itemDecisionNames, "notInParserRows", "ambiguousParserRows"],
        `recognitionCoverage[${index}].expectedDescriptionDecisionCounts`);
    }
    if (hasRowShapes) {
      assertExactKeys(entry.expectedUnretainedRowShapeCounts, unretainedShapeNames,
        `recognitionCoverage[${index}].expectedUnretainedRowShapeCounts`);
      assertExactKeys(entry.selectedRowWithoutExpectedPairDecisionCounts, itemDecisionNames,
        `recognitionCoverage[${index}].selectedRowWithoutExpectedPairDecisionCounts`);
    }
    if (hasPatternReasons) {
      assertExactKeys(entry.expectedUnretainedPatternReasonCounts, patternReasonNames,
        `recognitionCoverage[${index}].expectedUnretainedPatternReasonCounts`);
      assertExactKeys(entry.unmatchedDraftItemOriginCounts, itemDecisionNames,
        `recognitionCoverage[${index}].unmatchedDraftItemOriginCounts`);
    }
    const unretainedShapeTotal = hasRowShapes
      ? Object.values(entry.expectedUnretainedRowShapeCounts).reduce((sum, count) => sum + boundedInteger(count,
        `recognitionCoverage[${index}].expectedUnretainedRowShapeCounts`), 0) : null;
    const selectedWithoutPairTotal = hasRowShapes
      ? Object.values(entry.selectedRowWithoutExpectedPairDecisionCounts).reduce((sum, count) => sum + boundedInteger(count,
      `recognitionCoverage[${index}].selectedRowWithoutExpectedPairDecisionCounts`), 0) : null;
    const patternReasonTotal = hasPatternReasons
      ? Object.values(entry.expectedUnretainedPatternReasonCounts).reduce((sum, count) => sum + boundedInteger(count,
        `recognitionCoverage[${index}].expectedUnretainedPatternReasonCounts`), 0) : null;
    const unmatchedOriginTotal = hasPatternReasons
      ? Object.values(entry.unmatchedDraftItemOriginCounts).reduce((sum, count) => sum + boundedInteger(count,
        `recognitionCoverage[${index}].unmatchedDraftItemOriginCounts`), 0) : null;
    const itemDecisionTotal = hasItemDecisions
      ? Object.values(entry.itemLineDecisionCounts).reduce((sum, count) => sum + boundedInteger(count,
        `recognitionCoverage[${index}].itemLineDecisionCounts`), 0) : null;
    let unresolvedOtherBranchDecisionCounts = null;
    if (hasUnresolvedOtherDecisions) {
      const label = `recognitionCoverage[${index}].unresolvedOtherBranchDecisionCounts`;
      const branches = ["explicitModifier", "ordinaryCourtesy", "otherDescription"];
      assertExactKeys(entry.unresolvedOtherBranchDecisionCounts, branches, label);
      if (!hasUnresolvedOwnership || !hasItemDecisions) {
        throw new Error("Recognition coverage unresolved branch decisions require ownership and item decisions");
      }
      unresolvedOtherBranchDecisionCounts = Object.fromEntries(branches.map((branch) => {
        assertExactKeys(entry.unresolvedOtherBranchDecisionCounts[branch], itemDecisionNames, `${label}.${branch}`);
        return [branch, Object.fromEntries(itemDecisionNames.map((decision) => [decision,
          boundedInteger(entry.unresolvedOtherBranchDecisionCounts[branch][decision], `${label}.${branch}.${decision}`)]))];
      }));
      const counts = Object.values(unresolvedOtherBranchDecisionCounts).flatMap(Object.values);
      if (counts.some((count) => count > parserLineCount) ||
          counts.reduce((sum, count) => sum + count, 0) !== unresolvedOwnership.unresolvedItemLikeRoleCounts.other ||
          itemDecisionNames.some((decision) => branches.reduce((sum, branch) =>
            sum + unresolvedOtherBranchDecisionCounts[branch][decision], 0) > entry.itemLineDecisionCounts[decision])) {
        throw new Error("Recognition coverage unresolved branch decisions are invalid");
      }
    }
    const expectedDecisionTotal = hasItemDecisions
      ? Object.values(entry.expectedDescriptionDecisionCounts).reduce((sum, count) => sum + boundedInteger(count,
        `recognitionCoverage[${index}].expectedDescriptionDecisionCounts`), 0) : null;
    const draftDescriptions = hasDraftCoverage ? boundedInteger(entry.expectedItemDescriptionsInDraft,
      `recognitionCoverage[${index}].expectedItemDescriptionsInDraft`) : null;
    const draftPairs = hasDraftCoverage ? boundedInteger(entry.expectedItemPairsInDraft,
      `recognitionCoverage[${index}].expectedItemPairsInDraft`) : null;
    if (coverageFixtures.has(fixtureId) || blockCount > 256 || expectedItemCount > 40 || itemDescriptionsExactTextSeen > expectedItemCount ||
        typeof entry.merchantExactTextSeen !== "boolean" || typeof entry.totalExactTokenSeen !== "boolean" ||
        (hasReviewHintCategory && !new Set(["none", "subtotal_mismatch", "adjustment_explanation", "grand_total_mismatch", "foreign_item_currency", "other"]).has(reviewHintCategory)) ||
        (hasReviewDecision && (!hasReviewHintCategory || !allowedReviewDecisions.has(reviewDecision) ||
          !Array.isArray(entry.incompleteAdjustmentReasons) ||
          entry.incompleteAdjustmentReasons.length > allowedIncompleteReasons.size ||
          new Set(entry.incompleteAdjustmentReasons).size !== entry.incompleteAdjustmentReasons.length ||
          entry.incompleteAdjustmentReasons.some((reason) => !allowedIncompleteReasons.has(reason)) ||
          (reviewDecision === "none" && reviewHintCategory !== "none") ||
          (reviewDecision !== "none" && reviewHintCategory === "none"))) ||
        (hasItemDecisions && (!hasCellCoverage || itemDecisionTotal !== parserLineCount ||
          expectedDecisionTotal !== expectedItemCount)) ||
        (hasRowShapes && (!hasItemDecisions || unretainedShapeTotal !==
          entry.expectedDescriptionDecisionCounts.unretainedPricedRow ||
          selectedWithoutPairTotal > parserLineCount ||
          itemDecisionNames.some((name) =>
            entry.selectedRowWithoutExpectedPairDecisionCounts[name] > entry.itemLineDecisionCounts[name] ||
            (!selectedDecisionNames.has(name) && entry.selectedRowWithoutExpectedPairDecisionCounts[name] !== 0)))) ||
        (hasPatternReasons && (!hasRowShapes || !hasDraftCoverage ||
          patternReasonTotal !== unretainedShapeTotal ||
          unmatchedOriginTotal !== actualItemCount - draftPairs ||
          itemDecisionNames.some((name) => !itemOriginNames.has(name) &&
            entry.unmatchedDraftItemOriginCounts[name] !== 0))) ||
        (hasDraftCoverage && (!hasLayoutCoverage || draftDescriptions > expectedItemCount ||
          draftDescriptions > actualItemCount ||
          draftPairs > draftDescriptions || draftPairs > actualItemCount ||
          typeof entry.expectedDateTokenSeen !== "boolean" ||
          typeof entry.expectedTaxTokenSeen !== "boolean" ||
          typeof entry.expectedSubtotalTokenSeen !== "boolean")) ||
        (hasCellCoverage && (!hasLayoutCoverage || parserLineCount > 256 ||
          sameBlockCount > sameRowCount || distinctBlockCount > sameRowCount)) ||
        (hasLayoutCoverage && (rowCount > 256 || rowCount > blockCount || actualItemCount > 40 ||
          sameRowCount > adjacentRowCount ||
          adjacentRowCount > expectedItemCount || typeof entry.merchantExactTextInOneRow !== "boolean" ||
          typeof entry.chargeTableHeaderSameRow !== "boolean"))) {
      throw new Error("Recognition coverage evidence is invalid");
    }
    coverageFixtures.add(fixtureId);
    return { fixtureId, blockCount, merchantExactTextSeen: entry.merchantExactTextSeen,
      ...(hasProductObservation ? { productObservation: sanitizeProductObservation(
        entry.productObservation, entry, expectedReviewKinds.get(fixtureId), mismatches) } : {}),
      ...(hasNumericRoutingObservation ? {
        numericRoutingObservation: sanitizeNumericRoutingObservation(entry.numericRoutingObservation) } : {}),
      ...(hasUnresolvedOwnership ? unresolvedOwnership : {}),
      ...(hasUnresolvedOtherDecisions ? { unresolvedOtherBranchDecisionCounts } : {}),
      totalExactTokenSeen: entry.totalExactTokenSeen, expectedItemCount, itemDescriptionsExactTextSeen,
      ...(hasLayoutCoverage ? { rowCount, actualItemCount,
        merchantExactTextInOneRow: entry.merchantExactTextInOneRow,
        itemDescriptionsSameRowAsAmount: sameRowCount,
        itemDescriptionsWithinAdjacentAmountRow: adjacentRowCount,
        chargeTableHeaderSameRow: entry.chargeTableHeaderSameRow } : {}),
      ...(hasCellCoverage ? { parserLineCount, itemDescriptionsSameBlockAsAmount: sameBlockCount,
        itemDescriptionsWithDistinctAmountBlock: distinctBlockCount } : {}),
      ...(hasReviewHintCategory ? { reviewHintCategory } : {}),
      ...(hasPreviewWarnings ? { previewPresent: entry.previewPresent, previewWarningCount,
        previewWarningCategoryCounts } : {}),
      ...(hasHeaderFields ? { headerFieldStates } : {}),
      ...(hasReviewDecision ? { reviewDecision,
        incompleteAdjustmentReasons: entry.incompleteAdjustmentReasons } : {}),
      ...(hasItemDecisions ? { itemLineDecisionCounts: entry.itemLineDecisionCounts,
        expectedDescriptionDecisionCounts: entry.expectedDescriptionDecisionCounts } : {}),
      ...(hasRowShapes ? { expectedUnretainedRowShapeCounts: entry.expectedUnretainedRowShapeCounts,
        selectedRowWithoutExpectedPairDecisionCounts: entry.selectedRowWithoutExpectedPairDecisionCounts } : {}),
      ...(hasPatternReasons ? {
        expectedUnretainedPatternReasonCounts: entry.expectedUnretainedPatternReasonCounts,
        unmatchedDraftItemOriginCounts: entry.unmatchedDraftItemOriginCounts } : {}),
      ...(hasDraftCoverage ? { expectedItemDescriptionsInDraft: draftDescriptions,
        expectedItemPairsInDraft: draftPairs, expectedDateTokenSeen: entry.expectedDateTokenSeen,
        expectedTaxTokenSeen: entry.expectedTaxTokenSeen,
        expectedSubtotalTokenSeen: entry.expectedSubtotalTokenSeen } : {}) };
  });
  if (hasProducts && boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "productObservation"))) {
    throw new Error("Recognition coverage product observations are incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "reviewHintCategory")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "reviewHintCategory"))) {
    throw new Error("Recognition coverage review hint categories are incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "numericRoutingObservation")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "numericRoutingObservation"))) {
    throw new Error("Recognition coverage numeric routing observations are incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "previewWarningCount")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "previewWarningCount"))) {
    throw new Error("Recognition coverage preview warnings are incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "headerFieldStates")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "headerFieldStates"))) {
    throw new Error("Recognition coverage header field states are incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "reviewDecision")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "reviewDecision"))) {
    throw new Error("Recognition coverage review decisions are incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "itemLineDecisionCounts")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "itemLineDecisionCounts"))) {
    throw new Error("Recognition coverage item decisions are incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "expectedUnretainedRowShapeCounts")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "expectedUnretainedRowShapeCounts"))) {
    throw new Error("Recognition coverage row shapes are incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "expectedUnretainedPatternReasonCounts")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "expectedUnretainedPatternReasonCounts"))) {
    throw new Error("Recognition coverage pattern reasons are incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "expectedItemPairsInDraft")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "expectedItemPairsInDraft"))) {
    throw new Error("Recognition coverage draft categories are incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "unresolvedItemLikeCount")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "unresolvedItemLikeCount"))) {
    throw new Error("Recognition coverage unresolved ownership is incomplete");
  }
  if (boundedRecognitionCoverage.some((entry) => Object.hasOwn(entry, "unresolvedOtherBranchDecisionCounts")) &&
      boundedRecognitionCoverage.some((entry) => !Object.hasOwn(entry, "unresolvedOtherBranchDecisionCounts"))) {
    throw new Error("Recognition coverage unresolved branch decisions are incomplete");
  }
  if (Object.hasOwn(value, "recognitionCoverage") &&
      (boundedRecognitionCoverage.length !== expectedFixtureIds.size ||
        [...coverageFixtures].some((fixtureId) => !expectedFixtureIds.has(fixtureId)))) {
    throw new Error("Recognition coverage fixture inventory differs from the immutable corpus");
  }
  if (value.perScript == null || typeof value.perScript !== "object" || Array.isArray(value.perScript)) {
    throw new Error("perScript must be an object");
  }
  const scriptEntries = Object.entries(value.perScript);
  if (scriptEntries.length > 32) throw new Error("perScript evidence is not bounded");
  const perScript = Object.fromEntries(
    scriptEntries.map(([script, counts]) => {
      boundedToken(script, "perScript key");
      if (!acceptanceScripts.has(script)) {
        throw new Error("Acceptance script is outside the immutable corpus labels");
      }
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
    ...(Object.hasOwn(value, "recognitionCoverage") ? { recognitionCoverage: boundedRecognitionCoverage } : {}),
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
  const fixtureId = boundedToken(value.fixtureId, "uiSmoke.fixtureId");
  if (fixtureId !== reviewedUiFixtureId) {
    throw new Error("UI smoke fixture identity is unreviewed");
  }
  return {
    schemaVersion: 1,
    platform,
    completed: true,
    fixtureId,
    previewPanel: value.previewPanel === true,
    applyBoundaryVisible: value.applyBoundaryVisible === true,
  };
}

const diagnosticStages = new Set([
  "network_environment",
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
  "network_probe",
  "loopback_round_trip_probe",
  "hostname_resolution_probe",
  "network_denial_contract",
  "network_isolation",
  "corpus_manifest_load",
  "corpus_manifest_contract",
  "corpus_catalog_load",
  "corpus_fixture_load",
  "corpus_normalization",
  "corpus_provider",
  "corpus_comparison",
  "corpus_evidence",
  "rotation_manifest_load",
  "rotation_fixture_select",
  "rotation_catalog_load",
  "rotation_fixture_load",
  "rotation_normalization",
  "rotation_provider",
  "rotation_comparison",
  "ui_manifest_load",
  "ui_fixture_select",
  "ui_fixture_load",
  "ui_render",
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
  "ui_evidence",
]);

const rotationComparisonFields = new Set([
  "merchant", "date", "currency", "subtotal", "tax", "service", "tip", "shipping", "discount", "total",
  "items.length", "currency_provenance", "review_condition", "ocr_evidence", "model_version",
  "block_geometry", "block_order", "model_route", "detection_model", "runtime_evidence",
  "provider_status", "provider_exception", "ocr_resource_lookup", "ocr_model_open", "ocr_model_configuration",
  "ocr_runtime_initialization", "ocr_runtime_initialization_opencv", "ocr_runtime_initialization_onnxruntime",
  "ocr_input_validation", "ocr_postprocessing", "ocr_detection_inference", "ocr_recognition_inference", "ocr_output_decode",
]);

function isAllowedComparisonField(field) {
  return rotationComparisonFields.has(field) ||
    /^items\[(?:0|[1-9][0-9]{0,2})\]\.(?:description|lineTotal|quantity|unitPrice|currency)$/.test(field);
}

function sanitizeRotationComparison(value) {
  assertExactKeys(value, ["mismatchCount", "fields"], "rotation comparison");
  if (!Number.isSafeInteger(value.mismatchCount) || value.mismatchCount < 0 || value.mismatchCount > 4096 ||
      !Array.isArray(value.fields) || value.fields.length !== Math.min(value.mismatchCount, 128) ||
      new Set(value.fields).size !== value.fields.length || value.fields.some((field) =>
        typeof field !== "string" || !isAllowedComparisonField(field))) {
    throw new Error("Rotation comparison fields are not bounded allowlisted diagnostics");
  }
  return { mismatchCount: value.mismatchCount, fields: [...value.fields] };
}

function sanitizeDiagnostic(value, platform, expectedFixtureIds) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Diagnostic marker must contain an object");
  }
  const hasProbes = Object.hasOwn(value, "probes");
  const hasComparison = Object.hasOwn(value, "comparison");
  assertExactKeys(value,
    ["schemaVersion", "platform", "stage", "fixtureId",
      ...(hasProbes ? ["probes"] : []), ...(hasComparison ? ["comparison"] : [])],
    "diagnostic marker");
  if (value.schemaVersion !== 1 || value.platform !== platform || !diagnosticStages.has(value.stage)) {
    throw new Error("Diagnostic marker identity is invalid");
  }
  const fixtureId = boundedToken(value.fixtureId, "diagnostic.fixtureId", { nullable: true });
  if (fixtureId != null && !expectedFixtureIds?.has(fixtureId)) {
    throw new Error("Diagnostic fixture identity is not in the immutable corpus");
  }
  let comparison;
  if (hasComparison) {
    if (hasProbes || value.stage !== "rotation_comparison" || fixtureId !== "existing_12_freshmart_grocery_en_US") {
      throw new Error("Rotation comparison diagnostic has an invalid owner");
    }
    comparison = sanitizeRotationComparison(value.comparison);
  }
  let probes;
  if (hasProbes) {
    if (!new Set(["network_probe", "network_denial_contract", "loopback_round_trip_probe", "hostname_resolution_probe", "network_isolation"]).has(value.stage) || fixtureId != null) {
      throw new Error("Isolation probe diagnostic has an invalid stage");
    }
    assertExactKeys(value.probes, ["numeric", "loopback", "hostname"], "isolation probes");
    const allowed = {
      numeric: new Set(["not_run", "connected", "denied_expected", "denied_other", "timeout"]),
      loopback: new Set(["not_run", "passed", "failed"]),
      hostname: new Set(["not_run", "resolved", "empty_result", "denied"]),
    };
    for (const [name, values] of Object.entries(allowed)) {
      if (!values.has(value.probes[name])) {
        throw new Error("Isolation probe outcome is not allowlisted");
      }
    }
    probes = {
      numeric: value.probes.numeric,
      loopback: value.probes.loopback,
      hostname: value.probes.hostname,
    };
  }
  return {
    schemaVersion: 1,
    platform,
    stage: value.stage,
    fixtureId,
    ...(probes == null ? {} : { probes }),
    ...(comparison == null ? {} : { comparison }),
  };
}

function parseDiagnostics(lines, platform, expectedFixtureIds) {
  const marker = "SETTLEORA_OCR_DIAGNOSTIC=";
  const markedLines = lines.filter((line) => line.startsWith(marker));
  if (markedLines.length > 4) throw new Error("Acceptance runner emitted too many diagnostic markers");
  return markedLines.map((line) => {
    const encoded = line.slice(marker.length);
    if (Buffer.byteLength(encoded, "utf8") > maxMarkerBytes) {
      throw new Error("Diagnostic marker exceeds its bound");
    }
    return sanitizeDiagnostic(JSON.parse(encoded), platform, expectedFixtureIds);
  });
}

function extractFailureDiagnostics(args, platform, expectedFixtureIds) {
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
    return parseDiagnostics(markerMessages, platform, expectedFixtureIds);
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
  for (const required of ["log", "stderr-log", "platform", "source-sha", "test-status", "runner-image", "os-runtime", "sdk-toolchain", "device", "native-image", "base-sha", "base-tree", "base-tooling-sha", "base-dependency-lock-sha256"]) {
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
  const stderrBytes = readFileSync(args["stderr-log"]);
  const protocol = parseSafeRunnerLog(log, stderrBytes, args.platform);
  const catalogPath = path.join(repoRoot, "apps/mobile/assets/receipt_ocr_models/catalog.json");
  const manifestPath = path.join(repoRoot, "apps/mobile/test/fixtures/receipt_ocr/manifest.json");
  const expectedFixtureIds = immutableFixtureIds(repoRoot);
  const acceptance = parseMarker(
    protocol.markerMessages,
    "SETTLEORA_OCR_ACCEPTANCE=",
    (value) => sanitizeAcceptance(value, args.platform, expectedFixtureIds, repoRoot),
    { schemaVersion: 1, platform: args.platform, completed: false, markerProduced: false },
  );
  const uiSmoke = parseMarker(
    protocol.markerMessages,
    "SETTLEORA_OCR_UI_SMOKE=",
    (value) => sanitizeUiSmoke(value, args.platform),
    { schemaVersion: 1, platform: args.platform, completed: false, markerProduced: false },
  );
  const diagnostics = parseDiagnostics(protocol.markerMessages, args.platform, expectedFixtureIds);

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
  const packageSha256 = args["package-sha256"] || null;
  const signerCertificateSha256 = args["signer-certificate-sha256"] || null;
  if (packageSha256 != null && !/^[0-9a-f]{64}$/.test(packageSha256)) {
    throw new Error("Production package digest is invalid");
  }
  if (signerCertificateSha256 != null && !/^[0-9a-f]{64}$/.test(signerCertificateSha256)) {
    throw new Error("Production signer certificate digest is invalid");
  }
  const testExitStatus = boundedInteger(Number(args["test-status"]), "test-status");
  const preflightFailurePhase = args["failure-phase"] || null;
  if (
    preflightFailurePhase != null &&
    !isAllowedPreflightFailurePhase(args.platform, preflightFailurePhase)
  ) {
    throw new Error("Preflight failure phase is invalid");
  }
  const expectedBaseSha = "e4d4edd0d6854845cc67b00924f6d22af6a70688";
  const expectedBaseTree = "3ac1c3a2177445304a116102fce3ff4553f70719";
  if (args["base-sha"] !== expectedBaseSha) throw new Error("Base app SHA is invalid");
  if (args["base-tree"] !== expectedBaseTree) throw new Error("Base app tree is invalid");
  if (args["base-tooling-sha"] !== args["source-sha"]) {
    throw new Error("Base measurement tooling SHA must match the exact candidate");
  }
  if (!/^[0-9a-f]{64}$/.test(args["base-dependency-lock-sha256"])) {
    throw new Error("Base dependency lock identity is invalid");
  }
  const baseComposite = {
    sourceCommit: args["base-sha"],
    sourceTree: args["base-tree"],
    dependencyLockSha256: args["base-dependency-lock-sha256"],
    toolingCommit: args["base-tooling-sha"],
  };
  const baseCompositeSha256 = createHash("sha256")
    .update(JSON.stringify(baseComposite))
    .digest("hex");
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
    ...(args.platform === "ios" ? { flutterRunnerDiagnostics: summarizeFlutterRunner(args.log, args["stderr-log"]) } : {}),
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
      packageSha256,
      signerCertificateSha256,
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
      baseAppTree: args["base-tree"],
      baseDependencyLockSha256: args["base-dependency-lock-sha256"],
      baseMeasurementToolingSha: args["base-tooling-sha"],
      baseCompositeSha256,
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
    !Object.hasOwn(evidence, "collectionFailure") &&
      !Object.hasOwn(evidence, "collectionFailureReason") &&
      !Object.hasOwn(evidence, "stderrDiagnostic") &&
      Array.isArray(evidence.diagnostics) &&
      evidence.diagnostics.length === 0 &&
      evidence.execution.preflightFailurePhase == null &&
      evidence.acceptance.completed &&
      evidence.acceptance.networkIsolated === true &&
      evidence.execution.testExitStatus === 0 &&
      evidence.execution.protocolSucceeded === true &&
      evidence.acceptance.passedFixtureCount === 101 &&
      evidence.acceptance.mismatchCount === 0 &&
      Array.isArray(evidence.acceptance.recognitionCoverage) &&
      evidence.acceptance.recognitionCoverage.length === 101 &&
      evidence.acceptance.recognitionCoverage.every((row) =>
        row != null && Object.hasOwn(row, "reviewDecision") &&
        Array.isArray(row.incompleteAdjustmentReasons) &&
        Object.hasOwn(row, "itemLineDecisionCounts") &&
        Object.hasOwn(row, "expectedDescriptionDecisionCounts") &&
        Object.hasOwn(row, "expectedUnretainedRowShapeCounts") &&
        Object.hasOwn(row, "selectedRowWithoutExpectedPairDecisionCounts") &&
        Object.hasOwn(row, "expectedUnretainedPatternReasonCounts") &&
        Object.hasOwn(row, "unmatchedDraftItemOriginCounts") &&
        Object.hasOwn(row, "expectedItemPairsInDraft")) &&
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
      evidence.uiSmoke.fixtureId === reviewedUiFixtureId &&
      evidence.uiSmoke.previewPanel &&
      evidence.uiSmoke.applyBoundaryVisible &&
      evidence.packageEvidence.fullBytes != null &&
      evidence.packageEvidence.verifiedModelFileCount ===
        evidence.packageEvidence.catalogModelFileCount &&
      evidence.packageEvidence.verifiedCatalogFileCount ===
        evidence.packageEvidence.expectedCatalogFileCount &&
      evidence.packageEvidence.verifiedFixtureAbsenceCount ===
        evidence.packageEvidence.expectedFixtureAbsenceCount &&
      (evidence.platform !== "android" ||
        (/^[0-9a-f]{64}$/.test(evidence.packageEvidence.packageSha256 ?? "") &&
          /^[0-9a-f]{64}$/.test(evidence.packageEvidence.signerCertificateSha256 ?? ""))) &&
      evidence.packageEvidence.baselineWithoutBundledModelPayloadBytes != null &&
      evidence.packageEvidence.bundledModelPackageDeltaBytes > 0 &&
      evidence.packageEvidence.baseAppBytes != null &&
      /^[0-9a-f]{64}$/.test(evidence.identities?.baseCompositeSha256 ?? "") &&
      evidence.packageEvidence.ocrStackPackageDeltaBytes > 0,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.out) throw new Error("Missing --out");
    let evidence;
    try {
      evidence = buildEvidence(args);
    } catch (collectionError) {
      evidence = buildFailureEvidence(args, process.cwd(), collectionError);
      writeFileSync(args.out, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      throw new Error("bounded collection failed");
    }
    writeFileSync(args.out, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    console.log(`Wrote bounded ${args.platform} OCR acceptance evidence`);
    if (args["require-complete"] === "true" && !isCompleteEvidence(evidence)) {
      throw new Error("bounded evidence incomplete");
    }
  } catch {
    process.stderr.write("bounded_native_ocr_evidence_failed\n");
    process.exitCode = 1;
  }
}
