import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { hashDirectory } from "../hash-directory.mjs";
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

test("canonical wrapper fails closed around projection, locks, package inspection, and signing", () => {
  const script = readFileSync(path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh"), "utf8");
  for (const required of [
    "Flutter must be $expected_flutter_version",
    "Xcode must be $expected_xcode_version",
    "CocoaPods must be $expected_cocoapods_version",
    "pubspec.lock drifted during build",
    "Podfile.lock drifted during build",
    "prepare-production-flutter-plugins.mjs",
    "verify-mobile-package.mjs",
    "FilePicker registrant call is missing or duplicated",
    "Flutter secure storage registrant call is missing or duplicated",
    "integration_test is linked into the production application",
    "codesign --verify --deep --strict",
    "packaged build name differs from the requested signed build",
    "packaged build number differs from the requested signed build",
    "write-ios-release-provenance.mjs",
    '$(basename "$provenance_out")',
  ]) assert.ok(script.includes(required), required);
  assert.match(script, /signed builds must be release candidates/);
  assert.match(script, /release candidate provenance output is required/);
  assert.doesNotMatch(script, /\b(?:mapfile|readarray)\b/);
  assert.doesNotMatch(script, /app-store-connect|testflight|upload|publish/i);
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

function rootForUnsafeCli() {
  return path.resolve(os.tmpdir(), "untrusted-artifact-root");
}
