import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { hashDirectory } from "../hash-directory.mjs";
import { verifyIosTestPodfileLock } from "../verify-ios-test-podfile-lock.mjs";
import { buildProvenance } from "../write-ios-release-provenance.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

function provenanceArgs(root, mode = "signed") {
  const artifact = mode === "signed" ? path.join(root, "Settleora.ipa") : path.join(root, "Runner.app");
  const archive = path.join(root, "Runner.xcarchive");
  if (mode === "signed") writeFileSync(artifact, "signed-ipa");
  else mkdirSync(artifact);
  mkdirSync(archive);
  return new Map(Object.entries({
    mode,
    "source-sha": "1".repeat(40),
    "source-tree": "2".repeat(40),
    artifact,
    "artifact-sha256": "3".repeat(64),
    archive: mode === "signed" ? archive : "",
    "archive-sha256": mode === "signed" ? "8".repeat(64) : "",
    "bundle-identifier": "com.tommytang213.settleora",
    "build-name": "1.0.0",
    "build-number": "42",
    "flutter-version": "3.44.8",
    "xcode-version": "16.4",
    "cocoapods-version": "1.17.0",
    "pubspec-lock-sha256": "4".repeat(64),
    "podfile-lock-sha256": "5".repeat(64),
    "catalog-sha256": "6".repeat(64),
    "fixture-manifest-sha256": "7".repeat(64),
  }));
}

test("directory identity is deterministic and binds safe relative symbolic links", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-ios-directory-hash-"));
  const rootLink = `${root}-link`;
  try {
    mkdirSync(path.join(root, "nested"));
    writeFileSync(path.join(root, "nested/model.onnx"), "model");
    const first = hashDirectory(root);
    const second = hashDirectory(root);
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(first, second);
    writeFileSync(path.join(root, "nested/model.onnx"), "changed");
    assert.notEqual(hashDirectory(root), first);
    symlinkSync("model.onnx", path.join(root, "nested/model-link.onnx"));
    const linked = hashDirectory(root);
    assert.match(linked, /^[0-9a-f]{64}$/);
    rmSync(path.join(root, "nested/model-link.onnx"));
    symlinkSync("../nested/model.onnx", path.join(root, "nested/model-link.onnx"));
    assert.notEqual(hashDirectory(root), linked);
    rmSync(path.join(root, "nested/model-link.onnx"));
    symlinkSync("../../outside", path.join(root, "nested/model-link.onnx"));
    assert.throws(() => hashDirectory(root), /escaping symbolic link/);
    symlinkSync(root, rootLink, "dir");
    assert.throws(() => hashDirectory(rootLink), /root must be a real directory/);
  } finally {
    rmSync(rootLink, { force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test("signed provenance binds the exact artifact and forbids publication", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-ios-provenance-"));
  try {
    const provenance = buildProvenance(provenanceArgs(root));
    assert.equal(provenance.contract, "settleora-ios-build-once-promote-same-artifact-v1");
    assert.equal(provenance.promotionPolicy, "promote-this-exact-signed-ipa-without-rebuild");
    assert.equal(provenance.publicationPerformed, false);
    assert.equal(provenance.artifact.fileName, "Settleora.ipa");
    assert.equal(provenance.artifact.sha256, "3".repeat(64));
    assert.equal(provenance.artifact.archiveSha256, "8".repeat(64));
    assert.equal(provenance.artifact.buildName, "1.0.0");
    assert.equal(provenance.artifact.buildNumber, "42");
    assert.equal(provenance.verification.codeSignatureVerified, true);
    assert.equal(JSON.stringify(provenance).includes(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unsigned structural provenance is explicitly non-promotable", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-ios-unsigned-provenance-"));
  try {
    const provenance = buildProvenance(provenanceArgs(root, "unsigned"));
    assert.equal(provenance.contract, "settleora-ios-unsigned-structural-verification-v1");
    assert.equal(provenance.promotionPolicy, "not-promotable-unsigned-structural-evidence");
    assert.equal(provenance.verification.codeSignatureVerified, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonical wrapper fails closed around projection, locks, package inspection, and signing", () => {
  const script = readFileSync(path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh"), "utf8");
  const pubspec = readFileSync(path.join(repoRoot, "apps/mobile/pubspec.yaml"), "utf8");
  const podfileLock = readFileSync(path.join(repoRoot, "apps/mobile/ios/Podfile.lock"), "utf8");
  for (const required of [
    "Flutter must be $expected_flutter_version",
    "Xcode must be $expected_xcode_version",
    "CocoaPods must be $expected_cocoapods_version",
    "pubspec.lock drifted during build",
    "pubspec.lock differs from the committed canonical source",
    "065007a0c8b90d527aff6306936a02cd527d30f03800cc8e4229e8273d3afcc7",
    "a5b6068c71fe9b0a77743d5c639b5538dd2be10db7ddd4ecd9317fee03541903",
    "Podfile.lock does not match the approved identity",
    "Podfile.lock drifted during build",
    "source checkout differs from the committed tree",
    "signed release candidate requires a clean Git worktree",
    "exported source differs from the committed tree",
    "prepare-production-flutter-plugins.mjs",
    "--package-config=.dart_tool/package_config.json",
    "--package-graph=.dart_tool/package_graph.json",
    "verify-mobile-package.mjs",
    "FilePicker registrant call is missing or duplicated",
    "Flutter secure storage registrant call is missing or duplicated",
    "integration_test is linked into the production application",
    "codesign --verify --deep --strict",
    "packaged build name differs from the requested signed build",
    "packaged build number differs from the requested signed build",
    "write-ios-release-provenance.mjs",
    "xcode-project use-profiles",
    "export options plist was not produced",
    '$(basename "$provenance_out")',
  ]) assert.ok(script.includes(required), required);
  assert.match(script, /signed builds must be release candidates/);
  assert.match(script, /release candidate provenance output is required/);
  assert.match(pubspec, /flutter:\n(?:.|\n)*?config:\n\s+enable-swift-package-manager: false/);
  assert.doesNotMatch(pubspec, /enable-swift-package-manager: true/);
  for (const productionPlugin of ["file_picker", "flutter_secure_storage_darwin", "image_picker_ios"]) {
    assert.match(podfileLock, new RegExp(`^  - ${productionPlugin} \\(`, "m"));
    assert.match(podfileLock, new RegExp(`^  ${productionPlugin}:`, "m"));
  }
  assert.doesNotMatch(podfileLock, /integration_test/);
  assert.doesNotMatch(script, /\b(?:mapfile|readarray)\b/);
  assert.doesNotMatch(script, /app-store-connect|submit_to_testflight|submit_to_app_store|\bupload\b|\bpublish\b/i);
});

test("historical size measurement does not require release-candidate OCR identities", () => {
  const script = readFileSync(path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh"), "utf8");
  assert.match(
    script,
    /catalog_sha=\nfixture_manifest_sha=\nif \[\[ "\$artifact_class" == release-candidate \]\]; then\n  catalog_sha=.*\n  fixture_manifest_sha=.*\nfi/,
  );
});

test("iOS simulator pod graph permits exactly the pinned integration_test projection", () => {
  const production = `PODS:\n  - Flutter (1.0.0)\n\nDEPENDENCIES:\n  - Flutter (from \`Flutter\`)\n\nEXTERNAL SOURCES:\n  Flutter:\n    :path: Flutter\n\nSPEC CHECKSUMS:\n  Flutter: ${"1".repeat(40)}\n`;
  const projected = production
    .replace("  - Flutter (1.0.0)\n", "  - Flutter (1.0.0)\n  - integration_test (0.0.1):\n    - Flutter\n")
    .replace("DEPENDENCIES:\n", "DEPENDENCIES:\n  - integration_test (from `.symlinks/plugins/integration_test/ios`)\n")
    .replace("EXTERNAL SOURCES:\n", "EXTERNAL SOURCES:\n  integration_test:\n    :path: \".symlinks/plugins/integration_test/ios\"\n")
    .replace("SPEC CHECKSUMS:\n", `SPEC CHECKSUMS:\n  integration_test: ${"2".repeat(40)}\n`);
  assert.doesNotThrow(() => verifyIosTestPodfileLock(production, projected));
  assert.throws(
    () => verifyIosTestPodfileLock(production, projected.replace("  - Flutter (1.0.0)\n", "  - Flutter (2.0.0)\n")),
    /differs beyond/,
  );
  assert.throws(
    () => verifyIosTestPodfileLock(production, production),
    /expected one integration_test pod/,
  );
});

test("canonical wrapper rejects unsafe modes and release candidates without provenance before building", () => {
  const wrapper = path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh");
  const invalidMode = spawnSync("bash", [wrapper, "--mode=debug"], { encoding: "utf8" });
  assert.notEqual(invalidMode.status, 0);
  assert.match(invalidMode.stderr, /mode must be unsigned or signed/);

  const missingProvenance = spawnSync("bash", [
    wrapper,
    "--mode=unsigned",
    `--source-sha=${"1".repeat(40)}`,
    `--source-tree=${"2".repeat(40)}`,
  ], { encoding: "utf8" });
  assert.notEqual(missingProvenance.status, 0);
  assert.match(missingProvenance.stderr, /provenance output is required/);

  const directoryHasher = path.join(repoRoot, "tools/ocr-models/hash-directory.mjs");
  const arbitraryRoot = spawnSync(process.execPath, [directoryHasher, rootForUnsafeCli()], { encoding: "utf8" });
  assert.notEqual(arbitraryRoot.status, 0);
  assert.match(arbitraryRoot.stderr, /Usage: hash-directory\.mjs <app\|archive>/);
});

test("signed wrapper rejects a non-Git source before trusting caller provenance", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-ios-nongit-source-"));
  try {
    mkdirSync(path.join(root, "apps/mobile/ios/Runner"), { recursive: true });
    mkdirSync(path.join(root, "tools/ocr-models"), { recursive: true });
    writeFileSync(path.join(root, "apps/mobile/pubspec.lock"), "lock");
    writeFileSync(path.join(root, "apps/mobile/ios/Podfile.lock"), "lock");
    writeFileSync(path.join(root, "tools/ocr-models/prepare-production-flutter-plugins.mjs"), "");
    writeFileSync(path.join(root, "tools/ocr-models/verify-mobile-package.mjs"), "");
    const result = spawnSync("bash", [
      path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh"),
      "--mode=signed",
      `--source-sha=${"1".repeat(40)}`,
      `--source-tree=${"2".repeat(40)}`,
      `--mobile-root=${path.join(root, "apps/mobile")}`,
      `--repo-root=${root}`,
      `--tool-root=${root}`,
      "--build-name=1.0.0",
      "--build-number=1",
      `--export-options-plist=${path.join(root, "export.plist")}`,
      `--provenance-out=${path.join(root, "provenance.json")}`,
    ], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /signed release candidate requires a clean Git worktree/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory hasher CLI rejects symlinked fixed build ancestors", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-ios-cli-root-"));
  const external = mkdtempSync(path.join(os.tmpdir(), "settleora-ios-cli-external-"));
  try {
    mkdirSync(path.join(root, "build"));
    symlinkSync(external, path.join(root, "build/ios"), "dir");
    const directoryHasher = path.join(repoRoot, "tools/ocr-models/hash-directory.mjs");
    const result = spawnSync(process.execPath, [directoryHasher, "app"], { cwd: root, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /build path components must be real directories/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

function rootForUnsafeCli() {
  return path.resolve(os.tmpdir(), "untrusted-artifact-root");
}
