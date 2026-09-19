import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const maxLogBytes = 32 * 1024 * 1024;
const maxMarkerBytes = 512 * 1024;
const safeToken = /^[A-Za-z0-9_.:[\]-]{1,160}$/;

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

function latencySummary(value, name) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const summary = {
    sampleCount: boundedInteger(value.sampleCount, `${name}.sampleCount`),
    cold: positiveInteger(value.cold, `${name}.cold`),
    warmP50: positiveInteger(value.warmP50, `${name}.warmP50`),
    warmP95: positiveInteger(value.warmP95, `${name}.warmP95`),
    max: positiveInteger(value.max, `${name}.max`),
  };
  if (
    summary.sampleCount !== 101 ||
    summary.cold > summary.max ||
    summary.warmP50 > summary.warmP95 ||
    summary.warmP95 > summary.max
  ) {
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

function assertSafeLog(log, manifest) {
  const sensitiveValues = manifest.fixtures.flatMap((fixture) => {
    const expected = fixture.expected ?? {};
    return [
      expected.merchant,
      ...(Array.isArray(expected.items) ? expected.items.map((item) => item?.[0]) : []),
    ];
  }).filter((value) => typeof value === "string" && value.length >= 6);
  const normalizedLog = log.toLocaleLowerCase("en-US");
  if (sensitiveValues.some((value) => normalizedLog.includes(value.toLocaleLowerCase("en-US")))) {
    throw new Error("Acceptance log contains receipt-derived text");
  }
}

function sanitizeAcceptance(value, platform) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Acceptance marker must contain an object");
  }
  if (value.platform !== platform || value.schemaVersion !== 1 || value.completed !== true) {
    throw new Error("Acceptance marker identity is invalid");
  }
  if (!Array.isArray(value.mismatches) || value.mismatches.length > 4096) {
    throw new Error("Acceptance mismatch evidence is not bounded");
  }
  const mismatches = value.mismatches.map((entry, index) => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`mismatches[${index}] must be an object`);
    }
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
  if (runtime !== expectedRuntime) throw new Error("Acceptance runtime identity is invalid");
  return {
    schemaVersion: 1,
    platform,
    completed: true,
    fixtureCount,
    passedFixtureCount,
    mismatchCount,
    mismatches,
    runtime,
    coldLoadTimeMs: positiveInteger(value.coldLoadTimeMs, "coldLoadTimeMs"),
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
  return {
    schemaVersion: 1,
    platform,
    completed: true,
    fixtureId: boundedToken(value.fixtureId, "uiSmoke.fixtureId"),
    previewPanel: value.previewPanel === true,
    applyBoundaryVisible: value.applyBoundaryVisible === true,
  };
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
  for (const required of ["log", "platform", "source-sha", "test-status", "runner-image", "os-runtime", "sdk-toolchain", "device", "native-image", "base-sha"]) {
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
  const log = readFileSync(args.log, "utf8");
  const lines = log.split(/\r?\n/);
  const acceptance = parseMarker(
    lines,
    "SETTLEORA_OCR_ACCEPTANCE=",
    (value) => sanitizeAcceptance(value, args.platform),
    { schemaVersion: 1, platform: args.platform, completed: false, markerProduced: false },
  );
  const uiSmoke = parseMarker(
    lines,
    "SETTLEORA_OCR_UI_SMOKE=",
    (value) => sanitizeUiSmoke(value, args.platform),
    { schemaVersion: 1, platform: args.platform, completed: false, markerProduced: false },
  );

  const catalogPath = path.join(repoRoot, "apps/mobile/assets/receipt_ocr_models/catalog.json");
  const manifestPath = path.join(repoRoot, "apps/mobile/test/fixtures/receipt_ocr/manifest.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assertSafeLog(log, manifest);
  const sha256 = (filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex");
  const fullBytes = parseOptionalBytes(args["full-bytes"]);
  const modelFreeBytes = parseOptionalBytes(args["model-free-bytes"]);
  const baseAppBytes = parseOptionalBytes(args["base-app-bytes"]);
  const testExitStatus = boundedInteger(Number(args["test-status"]), "test-status");
  const expectedBaseSha = args.platform === "android"
    ? "7a6af8457cdd6eb64df91253a63801756f09d23d"
    : "2cab34c454b279056d4e130977f93cce26d46ce0";
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
      environment: sanitizeEnvironment(args),
    },
    acceptance,
    uiSmoke,
    packageEvidence: {
      fullBytes,
      baselineWithoutBundledModelPayloadBytes: modelFreeBytes,
      bundledModelPackageDeltaBytes:
        fullBytes == null || modelFreeBytes == null ? null : fullBytes - modelFreeBytes,
      baseAppBytes,
      ocrStackPackageDeltaBytes:
        fullBytes == null || baseAppBytes == null ? null : fullBytes - baseAppBytes,
      catalogModelBytes: boundedInteger(catalog.totalBundledBytes, "catalog.totalBundledBytes"),
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
    evidence.acceptance.completed &&
      evidence.execution.testExitStatus === 0 &&
      evidence.acceptance.passedFixtureCount === 101 &&
      evidence.acceptance.mismatchCount === 0 &&
      evidence.acceptance.coldLoadTimeMs > 0 &&
      evidence.acceptance.endToEndLatencyMs.sampleCount === 101 &&
      evidence.acceptance.nativeLatencyMs.sampleCount === 101 &&
      evidence.acceptance.peakRssBytes > 0 &&
      evidence.uiSmoke.completed &&
      evidence.uiSmoke.previewPanel &&
      evidence.uiSmoke.applyBoundaryVisible &&
      evidence.packageEvidence.fullBytes != null &&
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
    evidence = {
      schemaVersion: 1,
      platform: new Set(["android", "ios"]).has(args.platform) ? args.platform : null,
      sourceSha: /^[0-9a-f]{40}$/.test(args["source-sha"] ?? "")
        ? args["source-sha"]
        : null,
      acceptance: { completed: false },
      uiSmoke: { completed: false },
      collectionFailure: "invalid_or_unavailable_bounded_evidence",
    };
    writeFileSync(args.out, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    throw new Error("Bounded native OCR evidence collection failed");
  }
  writeFileSync(args.out, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`Wrote bounded ${args.platform} OCR acceptance evidence`);
  if (args["require-complete"] === "true" && !isCompleteEvidence(evidence)) {
    throw new Error("Native OCR acceptance evidence is incomplete or failing");
  }
}
