import { lstatSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedArguments = new Set([
  "out",
  "mode",
  "source-sha",
  "source-tree",
  "artifact",
  "artifact-sha256",
  "archive",
  "archive-sha256",
  "bundle-identifier",
  "build-name",
  "build-number",
  "flutter-version",
  "xcode-version",
  "cocoapods-version",
  "codemagic-cli-tools-version",
  "pubspec-lock-sha256",
  "podfile-lock-sha256",
  "catalog-sha256",
  "fixture-manifest-sha256",
]);

function parseArgs(values) {
  const result = new Map();
  for (const value of values) {
    const separator = value.indexOf("=");
    if (!value.startsWith("--") || separator < 3) throw new Error("Invalid provenance argument");
    const key = value.slice(2, separator);
    if (!allowedArguments.has(key) || result.has(key)) throw new Error("Unknown or duplicate provenance argument");
    result.set(key, value.slice(separator + 1));
  }
  for (const key of allowedArguments) {
    if (!["archive", "archive-sha256"].includes(key) && !result.get(key)) {
      throw new Error(`Missing provenance argument: ${key}`);
    }
  }
  return result;
}

function requireDigest(value, name) {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name} is not a SHA-256 digest`);
  return value;
}

function requireGitIdentity(value, name) {
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error(`${name} is not a full Git identity`);
  return value;
}

function requireBuildIdentity(value, pattern, name) {
  if (!pattern.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

export function buildProvenance(args) {
  if (!new Set(["signed", "unsigned"]).has(args.get("mode"))) throw new Error("Invalid build mode");
  const signed = args.get("mode") === "signed";
  const codemagicCliTools = signed
    ? requireBuildIdentity(
        args.get("codemagic-cli-tools-version"),
        /^\d+\.\d+\.\d+$/,
        "Codemagic CLI tools version",
      )
    : null;
  if (signed && codemagicCliTools !== "0.69.0") {
    throw new Error("Codemagic CLI tools version differs from the canonical contract");
  }
  const artifact = args.get("artifact");
  const artifactStat = lstatSync(artifact);
  if (args.get("mode") === "signed" && !artifactStat.isFile()) throw new Error("Signed artifact is not a regular file");
  if (args.get("mode") === "unsigned" && !artifactStat.isDirectory()) throw new Error("Unsigned artifact is not an app directory");
  const archive = args.get("archive");
  if (args.get("mode") === "signed" && (!archive || !lstatSync(archive).isDirectory())) {
    throw new Error("Signed archive is missing");
  }
  const archiveSha256 = args.get("archive-sha256");
  if (args.get("mode") === "signed" && !archiveSha256) throw new Error("Signed archive identity is missing");
  if (args.get("mode") === "unsigned" && archiveSha256) throw new Error("Unsigned artifact cannot have an archive identity");
  return {
    schemaVersion: 1,
    contract: signed
      ? "settleora-ios-build-once-promote-same-artifact-v1"
      : "settleora-ios-unsigned-structural-verification-v1",
    promotionPolicy: signed
      ? "promote-this-exact-signed-ipa-without-rebuild"
      : "not-promotable-unsigned-structural-evidence",
    publicationPerformed: false,
    mode: args.get("mode"),
    source: {
      commit: requireGitIdentity(args.get("source-sha"), "source SHA"),
      tree: requireGitIdentity(args.get("source-tree"), "source tree"),
    },
    artifact: {
      fileName: path.basename(artifact),
      sha256: requireDigest(args.get("artifact-sha256"), "artifact identity"),
      archiveName: archive ? path.basename(archive) : null,
      archiveSha256: archiveSha256 ? requireDigest(archiveSha256, "archive identity") : null,
      bundleIdentifier: args.get("bundle-identifier"),
      buildName: requireBuildIdentity(args.get("build-name"), /^[0-9]+\.[0-9]+\.[0-9]+$/, "build name"),
      buildNumber: requireBuildIdentity(args.get("build-number"), /^[0-9]+$/, "build number"),
    },
    toolchain: {
      flutter: args.get("flutter-version"),
      xcode: args.get("xcode-version"),
      cocoapods: args.get("cocoapods-version"),
      codemagicCliTools,
    },
    locks: {
      pubspecLockSha256: requireDigest(args.get("pubspec-lock-sha256"), "pubspec.lock identity"),
      podfileLockSha256: requireDigest(args.get("podfile-lock-sha256"), "Podfile.lock identity"),
    },
    ocr: {
      catalogSha256: requireDigest(args.get("catalog-sha256"), "OCR catalog identity"),
      fixtureManifestSha256: requireDigest(args.get("fixture-manifest-sha256"), "fixture manifest identity"),
    },
    verification: {
      expectedBundleIdentifier: true,
      productionPluginRegistrantCalls: true,
      integrationTestAbsent: true,
      ocrCatalogAndModelsExact: true,
      acceptanceFixturesAndTestCodeAbsent: true,
      rawOcrEvidenceAbsentFromReviewedResources: true,
      compiledAssetContentReviewed: false,
      dependencyLocksUnchanged: true,
      codeSignatureVerified: args.get("mode") === "signed",
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  const provenance = buildProvenance(args);
  writeFileSync(args.get("out"), `${JSON.stringify(provenance, null, 2)}\n`, { flag: "wx" });
}
