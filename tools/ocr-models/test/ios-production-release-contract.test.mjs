import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import { hashDirectory } from "../hash-directory.mjs";
import { verifyIosAssetCatalogInfo } from "../verify-ios-asset-catalog.mjs";
import { inspectOpenedIpa, verifyCanonicalIpa, verifyOpenedIpa } from "../verify-ipa-archive.mjs";
import { verifyIosTestPodfileLock } from "../verify-ios-test-podfile-lock.mjs";
import { buildProvenance } from "../write-ios-release-provenance.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function verifyTestIpa(archivePath) {
  let fd;
  try {
    fd = openSync(archivePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new Error("Unsafe IPA archive: archive cannot be opened as a regular non-symlink file");
  }
  return inspectOpenedIpa(fd);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb88320);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(entries, { prefix = Buffer.alloc(0), gap = Buffer.alloc(0), archiveComment = Buffer.alloc(0) } = {}) {
  const localParts = [prefix];
  const centralParts = [];
  let localOffset = prefix.length;
  for (const [index, entry] of entries.entries()) {
    const name = Buffer.from(entry.name);
    const localName = Buffer.from(entry.localName ?? entry.name);
    const data = Buffer.from(entry.data ?? "");
    const method = entry.deflateLevel == null ? 0 : 8;
    const stored = method === 8 ? deflateRawSync(data, { level: entry.deflateLevel }) : data;
    const centralExtra = entry.centralExtra ?? Buffer.alloc(0);
    const centralComment = entry.centralComment ?? Buffer.alloc(0);
    const localExtra = entry.localExtra ?? Buffer.alloc(0);
    const dataCrc32 = crc32(data);
    const directory = entry.directory ?? entry.name.endsWith("/");
    const mode = entry.mode ?? (directory ? 0o040755 : 0o100644);
    const flags = entry.flags ?? (entry.dataDescriptor ? 0x808 : 0x800);
    const descriptor = entry.dataDescriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (entry.dataDescriptor) {
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(entry.descriptorCrc32 ?? dataCrc32, 4);
      descriptor.writeUInt32LE(entry.descriptorCompressedSize ?? stored.length, 8);
      descriptor.writeUInt32LE(entry.descriptorUncompressedSize ?? data.length, 12);
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(entry.localTime ?? 0x0821, 10);
    local.writeUInt16LE(entry.localDate ?? 0x0221, 12);
    local.writeUInt32LE(entry.localCrc32 ?? (entry.dataDescriptor ? 0 : dataCrc32), 14);
    local.writeUInt32LE(entry.localCompressedSize ?? (entry.dataDescriptor ? 0 : stored.length), 18);
    local.writeUInt32LE(entry.localUncompressedSize ?? (entry.dataDescriptor ? 0 : data.length), 22);
    local.writeUInt16LE(localName.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    localParts.push(local, localName, localExtra, stored, descriptor);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(entry.centralTime ?? 0x0821, 12);
    central.writeUInt16LE(entry.centralDate ?? 0x0221, 14);
    central.writeUInt32LE(entry.centralCrc32 ?? dataCrc32, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(centralExtra.length, 30);
    central.writeUInt16LE(centralComment.length, 32);
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name, centralExtra, centralComment);
    localOffset += local.length + localName.length + localExtra.length + stored.length + descriptor.length;
    if (index + 1 < entries.length && gap.length > 0) {
      localParts.push(gap);
      localOffset += gap.length;
    }
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  eocd.writeUInt16LE(archiveComment.length, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd, archiveComment]);
}

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
    "codemagic-cli-tools-version": mode === "signed" ? "0.69.0" : "not-applicable",
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
    assert.equal(provenance.toolchain.codemagicCliTools, "0.69.0");
    assert.equal(provenance.verification.codeSignatureVerified, true);
    assert.equal(provenance.verification.rawOcrEvidenceAbsentFromReviewedResources, true);
    assert.equal(provenance.verification.compiledAssetContentReviewed, false);
    assert.equal(Object.hasOwn(provenance.verification, "rawOcrEvidenceAbsent"), false);
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
    assert.equal(provenance.toolchain.codemagicCliTools, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("signed provenance rejects Codemagic signing-tool drift", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-ios-provenance-toolchain-"));
  try {
    const args = provenanceArgs(root);
    args.set("codemagic-cli-tools-version", "0.70.0");
    assert.throws(() => buildProvenance(args), /differs from the canonical contract/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("IPA namespace verifier rejects ambiguous and escaping ZIP entries before extraction", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-ipa-namespace-"));
  const archive = path.join(root, "Runner.ipa");
  const harmlessTimestamp = Buffer.from([0x55, 0x54, 0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
  try {
    writeFileSync(archive, makeStoredZip([
      { name: "Payload/" },
      { name: "Payload/Runner.app/" },
      {
        name: "Payload/Runner.app/Info.plist",
        data: "plist",
        dataDescriptor: true,
        centralExtra: harmlessTimestamp,
        localExtra: harmlessTimestamp,
      },
      { name: "SwiftSupport/" },
      { name: "SwiftSupport/iphoneos/" },
      { name: "SwiftSupport/iphoneos/libswiftCore.dylib", data: "dylib" },
    ]));
    assert.match(verifyTestIpa(archive), /^[0-9a-f]{64}$/);
    const canonicalIpaDirectory = path.join(root, "build/ios/ipa");
    const canonicalIpa = path.join(canonicalIpaDirectory, "Runner.ipa");
    const verifier = path.join(repoRoot, "tools/ocr-models/verify-ipa-archive.mjs");
    mkdirSync(canonicalIpaDirectory, { recursive: true });
    writeFileSync(canonicalIpa, readFileSync(archive));
    const canonicalResult = spawnSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });
    assert.equal(canonicalResult.status, 0);
    const reviewedDigest = sha256(readFileSync(canonicalIpa));
    assert.equal(canonicalResult.stdout, `${reviewedDigest}\n`);
    assert.equal(canonicalResult.stderr, "");
    rmSync(path.join(root, "build/ios/.settleora-ipa-inspection"), { recursive: true });
    const oldDirectory = process.cwd();
    try {
      process.chdir(root);
      assert.equal(verifyCanonicalIpa({ reviewedDigests: new Set([reviewedDigest]) }), reviewedDigest);
    } finally {
      process.chdir(oldDirectory);
    }
    assert.equal(existsSync(path.join(canonicalIpaDirectory, ".settleora-verified-ipa")), false);
    assert.equal(
      readFileSync(path.join(root, "build/ios/.settleora-ipa-inspection/Payload/Runner.app/Info.plist"), "utf8"),
      "plist",
    );
    rmSync(path.join(root, "build/ios/.settleora-ipa-inspection"), { recursive: true });
    const boundedCliError = "canonical_ipa_verification_failed\n";
    const argumentResult = spawnSync(process.execPath, [verifier, archive], { cwd: root, encoding: "utf8" });
    assert.notEqual(argumentResult.status, 0);
    assert.equal(argumentResult.stdout, "");
    assert.equal(argumentResult.stderr, boundedCliError);
    writeFileSync(canonicalIpa, "not an ipa");
    const malformedResult = spawnSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });
    assert.notEqual(malformedResult.status, 0);
    assert.equal(malformedResult.stdout, "");
    assert.equal(malformedResult.stderr, boundedCliError);
    assert.doesNotMatch(malformedResult.stderr, new RegExp(root.replaceAll("/", "\\/")));
    assert.doesNotMatch(malformedResult.stderr, new RegExp(repoRoot.replaceAll("/", "\\/")));
    assert.doesNotMatch(malformedResult.stderr, /Error:|\bat\s/);
    rmSync(canonicalIpa);
    symlinkSync(archive, canonicalIpa);
    const canonicalLinkResult = spawnSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });
    assert.notEqual(canonicalLinkResult.status, 0);
    assert.equal(canonicalLinkResult.stdout, "");
    assert.equal(canonicalLinkResult.stderr, boundedCliError);
    rmSync(canonicalIpa);
    rmSync(canonicalIpaDirectory, { recursive: true });
    const redirectedIpaDirectory = path.join(root, "redirected-ipa");
    mkdirSync(redirectedIpaDirectory);
    writeFileSync(path.join(redirectedIpaDirectory, "Runner.ipa"), readFileSync(archive));
    symlinkSync(redirectedIpaDirectory, canonicalIpaDirectory, "dir");
    const canonicalDirectoryLinkResult = spawnSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });
    assert.notEqual(canonicalDirectoryLinkResult.status, 0);
    assert.equal(canonicalDirectoryLinkResult.stdout, "");
    assert.equal(canonicalDirectoryLinkResult.stderr, boundedCliError);
    const archiveLink = path.join(root, "Runner-link.ipa");
    symlinkSync(archive, archiveLink);
    assert.throws(() => verifyTestIpa(archiveLink), /regular non-symlink file/);
    const privateUidGid = Buffer.concat([
      Buffer.from([0x75, 0x78, 0x13, 0x00, 0x01, 0x08]),
      Buffer.from("PRIVATE!"), Buffer.from([0x08]), Buffer.from("RECEIPT!"),
    ]);

    for (const entries of [
      [{ name: "Payload/Runner.app/file" }, { name: "Payload/Runner.app/file" }],
      [{ name: "Payload/Runner.app/file" }, { name: "payload/runner.app/FILE" }],
      [{ name: "Payload/../escaped" }],
      [{ name: "/Payload/Runner.app/file" }],
      [{ name: "Payload\\Runner.app\\file" }],
      [{ name: "Other/Runner.app/file" }],
      [{ name: "Payload/Runner.app/link", mode: 0o120777, data: "../../outside" }],
      [{ name: "Payload/Runner.app/file", localName: "Payload/Runner.app/evil" }],
      [{ name: "Payload/Runner.app/file", data: "data", localCompressedSize: 3 }],
      [{ name: "Payload/Runner.app/file", data: "data", dataDescriptor: true, descriptorCompressedSize: 3 }],
      [{ name: "Payload/Runner.app/file", centralExtra: Buffer.from([0x75, 0x70, 0x01, 0x00, 0x01]) }],
      [{ name: "Payload/Runner.app/file", centralExtra: Buffer.from([0x6e, 0x75, 0x00, 0x00]) }],
      [{ name: "Payload/Runner.app/file", centralExtra: Buffer.from([0x4d, 0x33, 0x00, 0x00]) }],
      [{ name: "Payload/Runner.app/file", centralExtra: privateUidGid, localExtra: privateUidGid }],
    ]) {
      writeFileSync(archive, makeStoredZip(entries));
      assert.throws(() => verifyTestIpa(archive), /Unsafe IPA archive/);
    }
    const contiguousEntries = [
      { name: "Payload/" },
      { name: "Payload/Runner.app/" },
      { name: "Payload/Runner.app/file", data: "safe" },
    ];
    writeFileSync(archive, makeStoredZip(contiguousEntries, { prefix: Buffer.from("unreferenced-prefix") }));
    assert.throws(() => verifyTestIpa(archive), /complete archive payload/);
    writeFileSync(archive, makeStoredZip(contiguousEntries, { gap: Buffer.from("unreferenced-gap") }));
    assert.throws(() => verifyTestIpa(archive), /complete archive payload/);
    writeFileSync(archive, makeStoredZip(contiguousEntries, { archiveComment: Buffer.from("opaque-comment") }));
    assert.throws(() => verifyTestIpa(archive), /archive comments are forbidden/);
    writeFileSync(archive, makeStoredZip([
      { name: "Payload/" },
      { name: "Payload/Runner.app/file", data: "safe", centralComment: Buffer.from("opaque-comment") },
    ]));
    assert.throws(() => verifyTestIpa(archive), /entry comments are forbidden/);
    for (const repeatedExtra of [Buffer.concat([harmlessTimestamp, harmlessTimestamp])]) {
      writeFileSync(archive, makeStoredZip([
        { name: "Payload/", centralExtra: repeatedExtra },
      ]));
      assert.throws(() => verifyTestIpa(archive), /duplicate archive metadata extra field/);
    }
    const opaqueNtfsField = Buffer.alloc(36);
    opaqueNtfsField.writeUInt16LE(0x000a, 0);
    opaqueNtfsField.writeUInt16LE(32, 2);
    opaqueNtfsField.writeUInt16LE(1, 8);
    opaqueNtfsField.writeUInt16LE(24, 10);
    Buffer.from("PRIVATE_RECEIPT_TEXT_123").copy(opaqueNtfsField, 12);
    writeFileSync(archive, makeStoredZip([
      { name: "Payload/Runner.app/file", data: "safe", localExtra: opaqueNtfsField },
    ]));
    assert.throws(() => verifyTestIpa(archive), /non-metadata archive extra field is forbidden/);
    const mismatchedTimestamp = Buffer.from(harmlessTimestamp);
    mismatchedTimestamp.writeUInt32LE(1, 5);
    writeFileSync(archive, makeStoredZip([
      {
        name: "Payload/Runner.app/file",
        data: "safe",
        centralExtra: harmlessTimestamp,
        localExtra: mismatchedTimestamp,
      },
    ]));
    assert.throws(() => verifyTestIpa(archive), /timestamp extra field is not canonical/);
    for (const timestampEntry of [
      { localTime: 0x4142, centralTime: 0x5758 },
      { localDate: 0x4142, centralDate: 0x5758 },
      { localDate: 0, centralDate: 0 },
      { localTime: 0xffff, centralTime: 0xffff },
      { localDate: 0x5c5f, centralDate: 0x5c5f },
      { localTime: 0x4241, centralTime: 0x4241, localDate: 0x4443, centralDate: 0x4443 },
    ]) {
      writeFileSync(archive, makeStoredZip([
        { name: "Payload/Runner.app/file", data: "safe", ...timestampEntry },
      ]));
      assert.throws(() => verifyTestIpa(archive), /DOS timestamp/);
    }
    const localTimestampWithUncheckedTimes = Buffer.alloc(17);
    localTimestampWithUncheckedTimes.writeUInt16LE(0x5455, 0);
    localTimestampWithUncheckedTimes.writeUInt16LE(13, 2);
    localTimestampWithUncheckedTimes[4] = 0x07;
    Buffer.from("PRIVATE_", "ascii").copy(localTimestampWithUncheckedTimes, 9);
    writeFileSync(archive, makeStoredZip([{
      name: "Payload/Runner.app/file",
      data: "safe",
      centralExtra: harmlessTimestamp,
      localExtra: localTimestampWithUncheckedTimes,
    }]));
    assert.throws(() => verifyTestIpa(archive), /extended timestamp extra field is not canonical/);
    for (const controlName of ["Payload/Runner.app/split\nidentity", "Payload/Runner.app/del\u007fidentity"]) {
      writeFileSync(archive, makeStoredZip([{ name: "Payload/" }, { name: controlName, data: "safe" }]));
      assert.throws(() => verifyTestIpa(archive), /control character/);
    }
    writeFileSync(archive, makeStoredZip([{ name: "Payload/", data: "hidden receipt evidence" }]));
    assert.throws(() => verifyTestIpa(archive), /directory entry contains payload bytes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("signed IPA rejects an alternate valid DEFLATE representation", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-ipa-deflate-"));
  const ipaDirectory = path.join(root, "build/ios/ipa");
  const archive = path.join(ipaDirectory, "Runner.ipa");
  const oldDirectory = process.cwd();
  const entries = (level) => [
    { name: "Payload/" },
    { name: "Payload/Runner.app/" },
    { name: "Payload/Runner.app/Info.plist", data: "reviewed app bytes ".repeat(64), deflateLevel: level },
  ];
  try {
    mkdirSync(ipaDirectory, { recursive: true });
    const reviewed = makeStoredZip(entries(6));
    writeFileSync(archive, reviewed);
    assert.equal(verifyTestIpa(archive), sha256(reviewed));
    process.chdir(root);
    const reviewedDigests = new Set([sha256(reviewed)]);
    assert.equal(verifyCanonicalIpa({ reviewedDigests }), sha256(reviewed));
    rmSync(path.join(root, "build/ios/.settleora-ipa-inspection"), { recursive: true });
    const alternate = makeStoredZip(entries(0));
    assert.notEqual(sha256(alternate), sha256(reviewed));
    writeFileSync(archive, alternate);
    assert.equal(verifyTestIpa(archive), sha256(alternate));
    // A valid alternate representation has its own output identity; no digest is required before the build.
    assert.equal(verifyCanonicalIpa(), sha256(alternate));
    rmSync(path.join(root, "build/ios/.settleora-ipa-inspection"), { recursive: true });
    const fd = openSync(archive, constants.O_RDONLY | constants.O_NOFOLLOW);
    assert.throws(() => verifyOpenedIpa(fd, { reviewedDigests }), /representation is unreviewed/);
    assert.throws(() => verifyCanonicalIpa({ reviewedDigests }), /representation is unreviewed/);
  } finally {
    process.chdir(oldDirectory);
    rmSync(root, { recursive: true, force: true });
  }
});

test("opaque archive resource is classified for fail-closed iOS inspection", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "settleora-opaque-resource-"));
  try {
    const archive = path.join(directory, "innocuous.dat");
    writeFileSync(archive, makeStoredZip([{ name: "private.png", data: "opaque receipt bytes" }]));
    const observed = spawnSync("file", ["-b", archive], { encoding: "utf8" });
    assert.equal(observed.status, 0);
    assert.match(observed.stdout, /archive/i);
    const script = readFileSync(path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh"), "utf8");
    assert.match(script, /Web\/P\|archive\|compressed\\ data/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("binary property list with opaque image data is classified for fail-closed iOS inspection", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "settleora-opaque-plist-"));
  try {
    const plist = path.join(directory, "innocuous.dat");
    writeFileSync(plist, Buffer.from("YnBsaXN0MDDRAQJUYmxvYk8QD4lQTkcNChoKUFJJVkFURQgLEAAAAAAAAAEBAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAi", "base64"));
    const observed = spawnSync("file", ["-b", plist], { encoding: "utf8" });
    assert.equal(observed.status, 0);
    assert.match(observed.stdout, /Apple binary property list/);
    const script = readFileSync(path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh"), "utf8");
    assert.match(script, /Apple binary property list/);
    assert.match(script, /"\$candidate" == \*\/Info\.plist \|\| "\$candidate" == \*\/InfoPlist\.strings/);
    assert.match(script, /plist_xml.*<data>/);
    assert.match(script, /"\$file_description" == data/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("XML property list with opaque data is covered by the common plist inspection", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "settleora-xml-plist-"));
  try {
    const plist = path.join(directory, "Info.plist");
    writeFileSync(plist, '<?xml version="1.0"?><plist version="1.0"><dict><key>payload</key><data>iVBORw0KGgo=</data></dict></plist>');
    const observed = spawnSync("file", ["-b", plist], { encoding: "utf8" });
    assert.equal(observed.status, 0);
    assert.doesNotMatch(observed.stdout, /Apple binary property list/);
    const script = readFileSync(path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh"), "utf8");
    assert.match(script, /if \[\[ "\$candidate" == \*\.plist \|\| "\$candidate" == \*\.xcprivacy \|\| "\$candidate" == \*\.strings \]\]/);
    assert.match(script, /"\$plist_xml" != \*'<data>'\*/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("compiled asset inspection records added metadata without claiming signed approval", () => {
  const script = readFileSync(path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh"), "utf8");
  assert.match(script, /node "\$tool_root\/tools\/ocr-models\/verify-ios-asset-catalog\.mjs"/);
  const observed = verifyIosAssetCatalogInfo(JSON.stringify([
    { Name: "AppIcon", AssetType: "Image", SHA1Digest: "a".repeat(40) },
    { Name: "LaunchImage", AssetType: "Image", SHA1Digest: "b".repeat(40) },
  ]));
  assert.match(observed, /^[0-9a-f]{64}$/);
  assert.equal(observed, verifyIosAssetCatalogInfo(JSON.stringify([
    { AssetType: "Image", Name: "AppIcon", SHA1Digest: "a".repeat(40) },
    { AssetType: "Image", Name: "LaunchImage", SHA1Digest: "b".repeat(40) },
  ])));
  assert.notEqual(observed, verifyIosAssetCatalogInfo(JSON.stringify([
    { Name: "AppIcon", AssetType: "Image", SHA1Digest: "a".repeat(40) },
    { Name: "AppIcon", AssetType: "Image", PixelWidth: 24, SHA1Digest: "c".repeat(40) },
    { Name: "LaunchImage", AssetType: "Image", SHA1Digest: "b".repeat(40) },
  ])));
  assert.notEqual(observed, verifyIosAssetCatalogInfo(JSON.stringify([
    { Name: "AppIcon", AssetType: "Image", SHA1Digest: "a".repeat(40) },
    { Name: "PrivateReceipt", AssetType: "Image" },
  ])));
  assert.throws(() => verifyIosAssetCatalogInfo("[]"), /metadata is invalid/);
  assert.doesNotMatch(script, /compiled asset catalog bytes are unreviewed/);
});

test("canonical wrapper fails closed around projection, locks, package inspection, and signing", () => {
  const script = readFileSync(path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh"), "utf8");
  assert.match(script, /strings "\$candidate" >>"\$symbols_file"\s*done < <\(find "\$inventory_root" -type f -print\)/);
  assert.match(script, /"\$candidate" == "\$app_path"\/AppIcon\*\.png/);
  assert.match(script, /sips -s format bmp "\$candidate" --out "\$icon_compare_root\/packaged\.bmp"/);
  assert.match(script, /sips -s format bmp "\$source_icon" --out "\$icon_compare_root\/source\.bmp"/);
  assert.match(script, /cmp -s "\$icon_compare_root\/packaged\.bmp" "\$icon_compare_root\/source\.bmp"/);
  assert.match(script, /wc -c < "\$candidate"/);
  assert.match(script, /cat -- "\$candidate"/);
  assert.match(script, /wc -c < "\$source_icon"/);
  assert.match(script, /cat -- "\$source_icon"/);
  assert.match(script, /\} \| node "\$tool_root\/tools\/ocr-models\/verify-ios-icon-png\.mjs"/);
  assert.match(script, /icon_representation_unreviewed=true/);
  assert.match(script, /\[\[ "\$icon_representation_unreviewed" == false \]\] \|\|/);
  assert.match(script, /production application contains an unreviewed resource path/);
  const resourceInventoryLoop = script.slice(script.lastIndexOf('while IFS= read -r candidate; do'));
  assert.match(resourceInventoryLoop, /done < <\(find "\$inventory_root" -type f -print\)/);
  const appFrameworkSource = readFileSync(path.join(repoRoot, "apps/mobile/ios/Flutter/AppFrameworkInfo.plist"));
  const appFrameworkSha = createHash("sha256").update(appFrameworkSource).digest("hex");
  assert.match(resourceInventoryLoop, new RegExp(`AppFrameworkInfo\\.plist\\)[\\s\\S]*?"\\$mobile_root/ios/Flutter/AppFrameworkInfo\\.plist"\\)" == ${appFrameworkSha}`));
  assert.match(resourceInventoryLoop, /observed_app_framework_sha=\$\(sha256_file "\$candidate"\)/);
  assert.match(resourceInventoryLoop, /"\$observed_app_framework_sha" != 275c1f7273e185d2d65f8b447af25841e2be7fbdb3df89feb6324634f33ce317/);
  assert.match(resourceInventoryLoop, /production AppFrameworkInfo resource differs from reviewed Xcode output/);
  assert.match(resourceInventoryLoop, /"\$candidate" == "\$app_path\/AppFrameworkInfo\.plist"/);
  assert.ok(resourceInventoryLoop.indexOf('Base.lproj/*.storyboardc/*)') <
    resourceInventoryLoop.indexOf('Base.lproj/*.nib)'));
  assert.doesNotMatch(resourceInventoryLoop, /if \[\[ -d "\$candidate" \]\]/);
  assert.match(resourceInventoryLoop,
    /Base\.lproj\/\*\.storyboardc\/\*\) \[\[ "\$relative_resource" =~ \^Base\\\.lproj\/\[\^\/\]\+\\\.storyboardc\/\[\^\/\]\+\$ \]\] \|\| fail_unreviewed_resource_path ;;/);
  assert.match(resourceInventoryLoop,
    /Base\.lproj\/\*\.nib\) \[\[ "\$relative_resource" =~ \^Base\\\.lproj\/\[\^\/\]\+\\\.nib\$ \]\] \|\| fail_unreviewed_resource_path ;;/);
  assert.match(script, /unreviewed_resource_path_sha256=%s resource_class=%s/);
  assert.match(script, /framework_component_sha256=%s framework_tail_sha256=%s resource_kind=%s resource_depth=%s/);
  assert.doesNotMatch(script, /unreviewed_resource_path=%s|framework_component=%s|framework_tail=%s/);
  assert.match(script, /compiled_asset_car_sha256=%s/);
  assert.match(script, /verify-ios-xcarchive\.mjs/);
  assert.match(script, /archive_review=\$\(node "\$tool_root\/tools\/ocr-models\/verify-ios-xcarchive\.mjs"\)/);
  assert.match(script, /signed IPA application path is not canonical/);
  assert.doesNotMatch(script, /reviewed_asset_car_sha256=''/);
  assert.match(script, /\^Base\\\.lproj\/\[\^\/\]\+\\\.storyboardc\/\[\^\/\]\+\$/);
  assert.match(script, /\^Frameworks\/\[\^\/\]\+\\\.framework/);
  assert.match(script, /unreviewed framework resource/);
  assert.match(resourceInventoryLoop, /unreviewed_framework_name_sha256=%s/);
  assert.doesNotMatch(resourceInventoryLoop, /unreviewed_framework_name=%s/);
  assert.match(script, /App\|Flutter\|file_picker\|flutter_secure_storage_darwin/);
  assert.match(script, /nanopb\|objective_c\|onnxruntime/);
  assert.ok(resourceInventoryLoop.indexOf('*.bundle/Info.plist|*.bundle/PrivacyInfo.xcprivacy') <
    resourceInventoryLoop.indexOf('Frameworks/*/Info.plist|Frameworks/*/PrivacyInfo.xcprivacy'));
  assert.match(resourceInventoryLoop,
    /Frameworks\/GoogleDataTransport\.framework\/GoogleDataTransport_Privacy\.bundle\/\*\|Frameworks\/MLKitTextRecognition\.framework\/LatinOCRResources\.bundle\/\*/);
  assert.match(resourceInventoryLoop, /\*\) fail_unreviewed_resource_path ;;\s+esac\s+fi ;;\s+Frameworks\/\*\/Info\.plist/);
  const matchesNestedBundle = (relativePath) => {
    const result = spawnSync('bash', ['-c', 'case "$1" in Frameworks/GoogleDataTransport.framework/GoogleDataTransport_Privacy.bundle/*|Frameworks/MLKitTextRecognition.framework/LatinOCRResources.bundle/*) printf reviewed ;; *) printf reject ;; esac', '_', relativePath], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    return result.stdout;
  };
  assert.equal(matchesNestedBundle('Frameworks/GoogleDataTransport.framework/GoogleDataTransport_Privacy.bundle/PrivacyInfo.xcprivacy'), 'reviewed');
  assert.equal(matchesNestedBundle('Frameworks/App.framework/GoogleDataTransport_Privacy.bundle/PrivacyInfo.xcprivacy'), 'reject');
  assert.match(script, /Frameworks\/App\.framework\/flutter_assets\/NOTICES\.Z\) expected_flutter_asset_sha=7c9b681fa5d9672489bc4a80fbbb03e5ee666d4b45af75aecf3f1802052f9008/);
  assert.equal(resourceInventoryLoop.indexOf('NOTICES.Z'),
    resourceInventoryLoop.indexOf('NOTICES.Z) expected_flutter_asset_sha='));
  assert.doesNotMatch(resourceInventoryLoop, /AssetManifest\.json\|Frameworks\/App\.framework\/flutter_assets\/FontManifest\.json\|Frameworks\/App\.framework\/flutter_assets\/NOTICES\.Z\) ;;/);
  assert.ok(script.indexOf('elif [[ "$relative_resource" == Frameworks/App.framework/flutter_assets/NOTICES.Z') <
    script.indexOf('elif [[ "$file_description" =~ image|bitmap'));
  assert.match(readFileSync(path.join(repoRoot, 'apps/mobile/pubspec.lock'), 'utf8'), /objective_c:\s+dependency: transitive\s+description:[\s\S]*?name: objective_c[\s\S]*?version: "9\.3\.0"/);
  assert.match(script, /file_picker_ios_privacy\|image_picker_ios_privacy\|flutter_secure_storage\|GoogleUtilities_Privacy/);
  assert.match(script, /GoogleToolboxForMac_Logger_Privacy/);
  assert.match(script, /GTMSessionFetcher_Core_Privacy/);
  assert.match(script, /FBLPromises_Privacy/);
  assert.match(script, /unreviewed privacy bundle/);
  assert.match(script, /LatinOCRResources\.bundle/);
  assert.match(script, /production application model resource differs from the pinned pod archive/);
  assert.doesNotMatch(script, /assetutil --validate-file "\$app_path\/Assets\.car"/);
  assert.match(script, /assetutil --info "\$app_path\/Assets\.car"/);
  assert.match(script, /compiled asset catalog changed during metadata observation/);
  assert.match(script, /Frameworks\/App\.framework\/flutter_assets\/AssetManifest\.json/);
  for (const generatedAsset of [
    ["NativeAssetsManifest.json", "9548a31e4a048135c1d94f919328bfb62ae2c7bb3cab96557c7941daa97776cb"],
    ["fonts/MaterialIcons-Regular.otf", "e4aae88917aea920dfba979f19616d87669655d003444d3b1a110b685b88a0ed"],
    ["packages/cupertino_icons/assets/CupertinoIcons.ttf", "67c44fe9183b002e79dde7f6977e2988661c9a3e4a3c5fce968787efdbed823c"],
    ["shaders/ink_sparkle.frag", "1fe8436a743884cb65078fe8c7b38e18f5365f2a2961270916f426fd13c604af"],
    ["shaders/stretch_effect.frag", "62a899ff4e168ac6ca888ce7c2f40e5d3fbf8ca20a1c3ded781a116a6d7907e2"],
  ]) {
    assert.match(generatedAsset[1], /^[0-9a-f]{64}$/);
    assert.ok(resourceInventoryLoop.includes(
      `Frameworks/App.framework/flutter_assets/${generatedAsset[0]}) expected_flutter_asset_sha=${generatedAsset[1]} ;;`,
    ));
    assert.ok(resourceInventoryLoop.slice(resourceInventoryLoop.indexOf('elif [[ "$file_description" == data ]]')).includes(
      `"$app_path"/Frameworks/App.framework/flutter_assets/${generatedAsset[0]}`,
    ));
  }
  assert.match(resourceInventoryLoop, /observed_flutter_asset_sha=\$\(sha256_file "\$candidate"\)/);
  assert.match(resourceInventoryLoop, /"\$observed_flutter_asset_sha" != "\$expected_flutter_asset_sha"/);
  assert.match(resourceInventoryLoop, /production Flutter asset bytes differ from the reviewed identity/);
  assert.match(resourceInventoryLoop, /unset expected_flutter_asset_sha/);
  assert.doesNotMatch(script, /flutter_assets\/\*\.json/);
  assert.match(script, /image\|bitmap\|PDF\\ document\|SVG\|HEIF\|HEIC\|AVIF\|Web\/P\|archive\|compressed\\ data\|gzip/);
  assert.match(script, /production application contains an unreviewed image or document resource/);
  const pubspec = readFileSync(path.join(repoRoot, "apps/mobile/pubspec.yaml"), "utf8");
  const podfileLock = readFileSync(path.join(repoRoot, "apps/mobile/ios/Podfile.lock"), "utf8");
  for (const required of [
    "Flutter must be $expected_flutter_version",
    "Xcode must be $expected_xcode_version",
    "CocoaPods must be $expected_cocoapods_version",
    "Codemagic CLI tools must be $expected_codemagic_cli_tools_version",
    "Codemagic CLI tools contract is missing or changed",
    "pubspec.lock drifted during build",
    "pubspec.lock differs from the committed canonical source",
    "065007a0c8b90d527aff6306936a02cd527d30f03800cc8e4229e8273d3afcc7",
    "a5b6068c71fe9b0a77743d5c639b5538dd2be10db7ddd4ecd9317fee03541903",
    "Podfile.lock does not match the approved identity",
    "Podfile.lock drifted during build",
    "source checkout differs from the committed tree",
    "source root is not the Git worktree root",
    "signed release candidate requires a clean Git worktree",
    "exported source differs from the committed tree",
    "prepare-production-flutter-plugins.mjs",
    "--package-config=.dart_tool/package_config.json",
    "--package-graph=.dart_tool/package_graph.json",
    "flutter clean",
    "rm -rf -- build .dart_tool .flutter-plugins-dependencies ios/Pods ios/.symlinks",
    'export PUB_CACHE="$dependency_cache_root/pub-cache"',
    'export CP_HOME_DIR="$dependency_cache_root/cocoapods-home"',
    'export CP_CACHE_DIR="$dependency_cache_root/cocoapods-cache"',
    "verify-mobile-package.mjs",
    "FilePicker registrant call is missing or duplicated",
    "Flutter secure storage registrant call is missing or duplicated",
    "integration_test is linked into the production application",
    "native OCR acceptance handlers are linked into the production application",
    "com.settleora.mobile/receipt_ocr_acceptance",
    "loadModelCatalog",
    "loadFixture",
    "codesign --verify --deep --strict",
    "verify-ipa-archive.mjs",
    ".settleora-ipa-inspection",
    "descriptor-backed IPA inspection is missing",
    "retained IPA differs from descriptor-backed preflight",
    "IPA changed after namespace preflight",
    "IPA changed after package inspection",
    "IPA changed while provenance was generated",
    "IPA contains a non-allowlisted top-level entry",
    "IPA Payload contains content outside the application bundle",
    "IPA SwiftSupport layout is not canonical",
    "IPA SwiftSupport inventory differs from the application",
    "IPA SwiftSupport contains a non-Mach-O library",
    "IPA SwiftSupport library differs from its application counterpart",
    "file -b --",
    "inventory_root=$inspection_root",
    "packaged build name differs from the requested signed build",
    "packaged build number differs from the requested signed build",
    "write-ios-release-provenance.mjs",
    "xcode-project use-profiles",
    "codemagic-cli-tools --version",
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

test("iOS acceptance channel is compiled only into the Debug Runner", () => {
  const plugin = readFileSync(
    path.join(repoRoot, "apps/mobile/ios/Runner/SettleoraReceiptOcrPlugin.swift"),
    "utf8",
  );
  const project = readFileSync(
    path.join(repoRoot, "apps/mobile/ios/Runner.xcodeproj/project.pbxproj"),
    "utf8",
  );
  const runnerDebug = project.match(
    /97C147061CF9000F007C117D \/\* Debug \*\/ = \{[\s\S]*?\n\t\t\};/,
  )?.[0];
  const runnerRelease = project.match(
    /97C147071CF9000F007C117D \/\* Release \*\/ = \{[\s\S]*?\n\t\t\};/,
  )?.[0];
  const runnerProfile = project.match(
    /249021D4217E4FDB00AE95B9 \/\* Profile \*\/ = \{[\s\S]*?\n\t\t\};/,
  )?.[0];
  assert.match(runnerDebug ?? "", /SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;/);
  assert.doesNotMatch(runnerRelease ?? "", /SWIFT_ACTIVE_COMPILATION_CONDITIONS/);
  assert.doesNotMatch(runnerProfile ?? "", /SWIFT_ACTIVE_COMPILATION_CONDITIONS/);
  assert.match(
    plugin,
    /#if DEBUG\n    let acceptanceChannelName = "com\.settleora\.mobile\/receipt_ocr_acceptance"/,
  );
  assert.doesNotMatch(
    plugin,
    /private static let acceptanceChannelName = "com\.settleora\.mobile\/receipt_ocr_acceptance"/,
  );
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
  assert.throws(
    () => verifyIosTestPodfileLock(production, projected.replace(
      "  - integration_test (0.0.1):\n    - Flutter\n",
      "  - integration_test (0.0.1):\n    - Flutter\n  - integration_test (0.0.1):\n    - Flutter\n",
    )),
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

test("signed wrapper rejects an ignored fake source nested under a clean worktree", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-ios-nested-source-"));
  const fakeRoot = path.join(root, "ignored-source");
  const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  try {
    assert.equal(git("init", "-q").status, 0);
    assert.equal(git("config", "user.email", "test@example.invalid").status, 0);
    assert.equal(git("config", "user.name", "Settleora Test").status, 0);
    writeFileSync(path.join(root, ".gitignore"), "ignored-source/\n");
    writeFileSync(path.join(root, "tracked"), "source");
    assert.equal(git("add", ".gitignore", "tracked").status, 0);
    assert.equal(git("commit", "-q", "-m", "fixture").status, 0);
    const head = git("rev-parse", "HEAD").stdout.trim();
    const tree = git("rev-parse", "HEAD^{tree}").stdout.trim();
    mkdirSync(path.join(fakeRoot, "apps/mobile/ios/Runner"), { recursive: true });
    mkdirSync(path.join(fakeRoot, "tools/ocr-models"), { recursive: true });
    writeFileSync(path.join(fakeRoot, "apps/mobile/pubspec.lock"), "fake-lock");
    writeFileSync(path.join(fakeRoot, "apps/mobile/ios/Podfile.lock"), "fake-lock");
    writeFileSync(path.join(fakeRoot, "tools/ocr-models/prepare-production-flutter-plugins.mjs"), "");
    writeFileSync(path.join(fakeRoot, "tools/ocr-models/verify-mobile-package.mjs"), "");
    const result = spawnSync("bash", [
      path.join(repoRoot, "apps/mobile/tool/build-production-ios.sh"),
      "--mode=signed",
      `--source-sha=${head}`,
      `--source-tree=${tree}`,
      `--mobile-root=${path.join(fakeRoot, "apps/mobile")}`,
      `--repo-root=${fakeRoot}`,
      `--tool-root=${fakeRoot}`,
      "--build-name=1.0.0",
      "--build-number=1",
      `--export-options-plist=${path.join(fakeRoot, "export.plist")}`,
      `--provenance-out=${path.join(fakeRoot, "provenance.json")}`,
    ], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /source root is not the Git worktree root/);
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
