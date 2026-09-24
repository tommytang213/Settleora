import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import { trustedLegalArtifacts } from "./mobile-model-catalog.mjs";
import { expectedAndroidNonOcrEntries, expectedAndroidPackageDigests } from "./android-production-entry-inventory.mjs";

const maxInventoryBytes = 32 * 1024 * 1024;
const maxModelBytes = 64 * 1024 * 1024;
const maxAndroidArchiveBytes = 512 * 1024 * 1024;
const allowedAndroidCompressionMethods = new Set([0, 8]);
const prohibitedPackageEntry = /integration[_-]?test|receipt_ocr_real_provider_test|receipt_ocr_acceptance|(?:^|\/)(?:private|fixtures?|tests?)(?:\/|[-_.]|$)|\.log$|(?:^|\/)[^/]*(?:ocr[-_]?output|ocr[-_]?evidence|private[-_]?receipt)[^/]*|(?:^|\/)[^/]*(?:receipt|invoice|fixture|corpus|ocr|scan)[^/]*\.(?:jpe?g|png|webp|heic|heif|pdf|tiff?|bmp|json|csv|txt|bin|dat|db|sqlite|zip)$/i;
class PackageContentMismatch extends Error {
  constructor(digest) {
    super("Production APK entry representations differ from reviewed bytes");
    this.digest = digest;
  }
}
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function safeRelativePath(value, name) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    path.posix.isAbsolute(value) ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${name} is not a safe relative path`);
  }
  return value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function withAndroidSnapshot(packagePath, verify) {
  const descriptor = openSync(packagePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let snapshot;
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 1n || before.size > BigInt(maxAndroidArchiveBytes)) {
      throw new Error("Production APK archive size is outside the reviewed bound");
    }
    snapshot = Buffer.allocUnsafe(Number(before.size));
    let offset = 0;
    while (offset < snapshot.length) {
      const count = readSync(descriptor, snapshot, offset, Math.min(1024 * 1024, snapshot.length - offset), null);
      if (count === 0) throw new Error("Production APK changed while snapshotting");
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 0 ||
        before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw new Error("Production APK changed while snapshotting");
    }
  } finally {
    closeSync(descriptor);
  }
  const temporary = mkdtempSync("/tmp/settleora-apk-");
  try {
    const snapshotPath = path.join(temporary, "production.apk");
    writeFileSync(snapshotPath, snapshot, { flag: "wx", mode: 0o400 });
    return { signerCertificateSha256: verify(snapshotPath), packageSha256: sha256(snapshot) };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function expectedPackageContract(repoRoot) {
  const catalogPath = path.join(repoRoot, "apps/mobile/assets/receipt_ocr_models/catalog.json");
  const catalogBytes = readFileSync(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const manifest = readJson(path.join(repoRoot, "apps/mobile/test/fixtures/receipt_ocr/manifest.json"));
  const models = catalog.packs.flatMap((pack, packIndex) =>
    pack.files.map((file, fileIndex) => ({
      relativePath: safeRelativePath(
        `${pack.assetDirectory}/${file.name}`,
        `catalog.packs[${packIndex}].files[${fileIndex}]`,
      ),
      bytes: file.bytes,
      sha256: file.sha256,
    })),
  );
  const fixtures = [
    "manifest.json",
    ...manifest.fixtures.map((fixture, index) =>
      safeRelativePath(fixture.file, `manifest.fixtures[${index}].file`)),
  ];
  return {
    catalog: {
      relativePath: "assets/receipt_ocr_models/catalog.json",
      bytes: catalogBytes.length,
      sha256: sha256(catalogBytes),
    },
    models,
    legalArtifacts: trustedLegalArtifacts.map((artifact, index) => ({
      relativePath: safeRelativePath(artifact.path, `trustedLegalArtifacts[${index}].path`),
      bytes: artifact.bytes,
      sha256: artifact.sha256,
    })),
    fixtures,
  };
}

function validateModel(bytes, expected, name) {
  if (!Number.isSafeInteger(expected.bytes) || expected.bytes <= 0) {
    throw new Error(`${name} has an invalid catalog byte count`);
  }
  if (!/^[0-9a-f]{64}$/.test(expected.sha256)) {
    throw new Error(`${name} has an invalid catalog digest`);
  }
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw new Error(`${name} does not match the catalog identity`);
  }
}

function assertExactModelInventory(actualEntries, expectedEntries) {
  const actual = [...actualEntries].sort();
  const expected = [...expectedEntries].sort();
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error("Production package model inventory differs from the catalog");
  }
}

function iosModelInventory(modelRoot) {
  const files = [];
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error("Production iOS app model inventory contains a symbolic link");
      }
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relativePath);
      else if (entry.isFile()) files.push(relativePath);
      else throw new Error("Production iOS app model inventory contains an unsupported entry");
    }
  };
  visit(modelRoot);
  return files;
}

function verifyAndroidZipMetadata(packagePath) {
  const archive = readFileSync(packagePath);
  if (archive.length < 22 || archive.length > maxAndroidArchiveBytes) {
    throw new Error("Production APK archive size is outside the reviewed bound");
  }
  let eocd = -1;
  for (let cursor = archive.length - 22; cursor >= Math.max(0, archive.length - 65_557); cursor -= 1) {
    if (archive.readUInt32LE(cursor) === 0x06054b50 && cursor + 22 + archive.readUInt16LE(cursor + 20) === archive.length) {
      eocd = cursor;
      break;
    }
  }
  if (eocd < 0 || archive.readUInt16LE(eocd + 4) !== 0 || archive.readUInt16LE(eocd + 6) !== 0 ||
      archive.readUInt16LE(eocd + 8) !== archive.readUInt16LE(eocd + 10) ||
      archive.readUInt16LE(eocd + 20) !== 0) {
    throw new Error("Production APK archive metadata is unsupported");
  }
  const count = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  if (count === 0 || count === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff ||
      centralOffset + centralSize !== eocd) {
    throw new Error("Production APK central directory is outside the reviewed bound");
  }
  const names = [];
  const contentDigests = [];
  const seen = new Set();
  const localRanges = [];
  let expandedNonOcrBytes = 0;
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > eocd || archive.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Production APK central directory entry is malformed");
    }
    const nameLength = archive.readUInt16LE(cursor + 28);
    const madeBy = archive.readUInt16LE(cursor + 4);
    const neededVersion = archive.readUInt16LE(cursor + 6);
    const centralFlags = archive.readUInt16LE(cursor + 8);
    const centralMethod = archive.readUInt16LE(cursor + 10);
    const centralTime = archive.readUInt16LE(cursor + 12);
    const centralDate = archive.readUInt16LE(cursor + 14);
    const centralCrc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const diskStart = archive.readUInt16LE(cursor + 34);
    const internalAttributes = archive.readUInt16LE(cursor + 36);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const externalAttributes = archive.readUInt32LE(cursor + 38);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (nameLength === 0 || end > eocd || extraLength !== 0 || commentLength !== 0 ||
        diskStart !== 0 || internalAttributes !== 0 || neededVersion !== 0 ||
        centralFlags !== 0 || !allowedAndroidCompressionMethods.has(centralMethod) ||
        !((madeBy === 0 && externalAttributes === 0) ||
          (madeBy === 0x0014 && externalAttributes === 0) ||
          (madeBy === 0x0300 && externalAttributes === 0x81a40000)) ||
        uncompressedSize === 0xffffffff ||
        compressedSize === 0xffffffff || localOffset === 0xffffffff ||
        localOffset + 30 > centralOffset ||
        archive.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error("Production APK entry metadata is unreviewed");
    }
    const nameBytes = archive.subarray(cursor + 46, cursor + 46 + nameLength);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localExtraStart = localNameStart + localNameLength;
    const dataStart = localExtraStart + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (localNameLength !== nameLength || localExtraStart + localExtraLength > centralOffset ||
        !archive.subarray(localNameStart, localExtraStart).equals(nameBytes) ||
        archive.subarray(localExtraStart, localExtraStart + localExtraLength).some((byte) => byte !== 0) ||
        nameBytes.some((byte) => byte < 0x20 || byte > 0x7e) ||
        archive.readUInt16LE(localOffset + 4) !== neededVersion ||
        archive.readUInt16LE(localOffset + 6) !== centralFlags ||
        archive.readUInt16LE(localOffset + 8) !== centralMethod ||
        centralTime !== 0x0821 || centralDate !== 0x0221 ||
        archive.readUInt16LE(localOffset + 10) !== centralTime ||
        archive.readUInt16LE(localOffset + 12) !== centralDate ||
        archive.readUInt32LE(localOffset + 14) !== centralCrc ||
        archive.readUInt32LE(localOffset + 18) !== compressedSize ||
        archive.readUInt32LE(localOffset + 22) !== uncompressedSize ||
        dataEnd > centralOffset) {
      throw new Error("Production APK local metadata is unreviewed");
    }
    const name = nameBytes.toString("ascii");
    if (seen.has(name)) throw new Error("Production APK contains duplicate entry names");
    seen.add(name);
    names.push(name);
    const modelEntry = name.startsWith("assets/receipt_ocr_models/");
    if (modelEntry && uncompressedSize > maxModelBytes) {
      throw new Error("Production APK model entry exceeds reviewed bounds");
    }
    if (!modelEntry) {
      if (uncompressedSize > 128 * 1024 * 1024 || expandedNonOcrBytes + uncompressedSize > 512 * 1024 * 1024) {
        throw new Error("Production APK non-model contents exceed reviewed bounds");
      }
      expandedNonOcrBytes += uncompressedSize;
    }
    const compressed = archive.subarray(dataStart, dataEnd);
    let contents;
    if (centralMethod === 0) {
      contents = compressed;
    } else {
      const expanded = inflateRawSync(compressed, {
        info: true, maxOutputLength: modelEntry ? maxModelBytes : 128 * 1024 * 1024,
      });
      if (expanded.engine.bytesWritten !== compressed.length) {
        throw new Error("Production APK compressed entry contains trailing bytes");
      }
      contents = expanded.buffer;
    }
    if (contents.length !== uncompressedSize) throw new Error("Production APK entry expanded size differs");
    contentDigests.push([
      name, centralMethod, compressedSize, uncompressedSize,
      sha256(compressed), sha256(contents),
    ]);
    localRanges.push([localOffset, dataEnd]);
    cursor = end;
  }
  if (cursor !== eocd) throw new Error("Production APK central directory has unaccounted bytes");
  localRanges.sort((left, right) => left[0] - right[0]);
  let coveredThrough = 0;
  for (const [start, end] of localRanges) {
    if (start !== coveredThrough) throw new Error("Production APK contains unreferenced local bytes");
    coveredThrough = end;
  }
  const gap = centralOffset - coveredThrough;
  if (gap < 32) {
    throw new Error("Production APK signing block is required");
  }
  if (archive.toString("ascii", centralOffset - 16, centralOffset) !== "APK Sig Block 42") {
    throw new Error("Production APK contains unreviewed bytes before the central directory");
  }
  const blockSize = Number(archive.readBigUInt64LE(centralOffset - 24));
  if (blockSize !== gap - 8 || Number(archive.readBigUInt64LE(coveredThrough)) !== blockSize) {
    throw new Error("Production APK signing block bounds disagree");
  }
  const expectedIds = new Set([0x7109871a, 0x42726577]);
  const observedIds = new Set();
  let pair = coveredThrough + 8;
  while (pair < centralOffset - 24) {
    if (pair + 12 > centralOffset - 24) throw new Error("Production APK signing pair is malformed");
    const pairSize = Number(archive.readBigUInt64LE(pair));
    const pairEnd = pair + 8 + pairSize;
    const id = archive.readUInt32LE(pair + 8);
    const value = archive.subarray(pair + 12, pairEnd);
    if (!Number.isSafeInteger(pairSize) || pairSize < 4 || pairEnd > centralOffset - 24 ||
        !expectedIds.has(id) || observedIds.has(id) ||
        (id === 0x42726577 && value.some((byte) => byte !== 0))) {
      throw new Error("Production APK signing pair is unreviewed");
    }
    observedIds.add(id);
    pair = pairEnd;
  }
  if (pair !== centralOffset - 24 || observedIds.size !== expectedIds.size) {
    throw new Error("Production APK signing block inventory differs");
  }
  const contentHash = createHash("sha256");
  for (const [name, method, compressedSize, expandedSize, compressedDigest, expandedDigest] of
    contentDigests.sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0)) {
    contentHash.update(`${name}\0${method}\0${compressedSize}\0${expandedSize}\0${compressedDigest}\0${expandedDigest}\n`);
  }
  return { names, packageDigest: contentHash.digest("hex") };
}

export function verifyAndroidSignature(packagePath, jarBytes = readFileSync("/usr/local/lib/android/sdk/build-tools/35.0.0/lib/apksigner.jar")) {
  if (!Buffer.isBuffer(jarBytes) || jarBytes.length !== 1074241 ||
      sha256(jarBytes) !== "00ef9948f843fe395d2440ae3ef41405b8040a6d5d46493bd1902ac0ee6deae7") {
    throw new Error("Production APK signer toolchain is unreviewed");
  }
  const temporary = mkdtempSync("/tmp/settleora-apksigner-");
  let output;
  try {
    const privateJar = path.join(temporary, "apksigner.jar");
    writeFileSync(privateJar, jarBytes, { flag: "wx", mode: 0o400 });
    output = execFileSync("/usr/bin/java", ["-jar", privateJar, "verify", "--verbose", "--print-certs", path.resolve(packagePath)], {
      encoding: "utf8",
      maxBuffer: 64 * 1024,
      env: { PATH: "/usr/bin", LANG: "C", LC_ALL: "C" },
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  const certificate = /^Signer #1 certificate SHA-256 digest: ([0-9a-f]{64})$/m.exec(output);
  if (!/^Verifies$/m.test(output) ||
      !/^Verified using v2 scheme \(APK Signature Scheme v2\): true$/m.test(output) ||
      !/^Number of signers: 1$/m.test(output) ||
      !/^Signer #1 certificate DN: C=US, O=Android, CN=Android Debug$/m.test(output) ||
      !certificate) {
    throw new Error("Production APK signer identity is unreviewed");
  }
  return certificate[1];
}

function verifyAndroidPackage(packagePath, contract, runCommand, verifySignature, reviewedPackageDigests) {
  const { names: archiveEntries, packageDigest } = verifyAndroidZipMetadata(packagePath);
  const signerCertificateSha256 = verifySignature(packagePath);
  const inventory = runCommand("unzip", ["-Z1", packagePath], {
    encoding: "utf8",
    maxBuffer: maxInventoryBytes,
  });
  const inventoryEntries = inventory.split(/\r?\n/).filter(Boolean);
  if (archiveEntries.length !== inventoryEntries.length ||
      archiveEntries.some((entry, index) => entry !== inventoryEntries[index])) {
    throw new Error("Production APK archive and extraction inventories disagree");
  }
  if (inventoryEntries.some((entry) => entry.endsWith("/"))) {
    throw new Error("Production APK contains an unverified directory entry");
  }
  const entries = new Set(inventoryEntries);
  const packagedModels = inventory
    .split(/\r?\n/)
    .filter((entry) => entry.startsWith("assets/receipt_ocr_models/") && !entry.endsWith("/"));
  assertExactModelInventory(
    packagedModels,
    [
      contract.catalog.relativePath,
      ...contract.models.map((model) => model.relativePath),
      ...contract.legalArtifacts.map((artifact) => artifact.relativePath),
    ],
  );
  if (!entries.has(contract.catalog.relativePath)) {
    throw new Error(`Production APK is missing ${contract.catalog.relativePath}`);
  }
  validateModel(
    runCommand("unzip", ["-p", packagePath, contract.catalog.relativePath], {
      encoding: "buffer",
      maxBuffer: maxModelBytes,
    }),
    contract.catalog,
    contract.catalog.relativePath,
  );
  for (const model of contract.models) {
    const entry = model.relativePath;
    if (!entries.has(entry)) throw new Error(`Production APK is missing ${entry}`);
    const bytes = runCommand("unzip", ["-p", packagePath, entry], {
      encoding: "buffer",
      maxBuffer: maxModelBytes,
    });
    validateModel(bytes, model, entry);
  }
  for (const artifact of contract.legalArtifacts) {
    if (!entries.has(artifact.relativePath)) {
      throw new Error(`Production APK is missing ${artifact.relativePath}`);
    }
    const bytes = runCommand("unzip", ["-p", packagePath, artifact.relativePath], {
      encoding: "buffer",
      maxBuffer: maxModelBytes,
    });
    validateModel(bytes, artifact, artifact.relativePath);
  }
  for (const fixture of contract.fixtures) {
    const entry = `assets/${fixture}`;
    if (entries.has(entry)) throw new Error(`Production APK contains acceptance fixture ${entry}`);
  }
  const expectedEntries = [
    ...expectedAndroidNonOcrEntries,
    contract.catalog.relativePath,
    ...contract.models.map((model) => model.relativePath),
    ...contract.legalArtifacts.map((artifact) => artifact.relativePath),
  ].sort();
  if (inventoryEntries.length !== expectedEntries.length ||
      inventoryEntries.slice().sort().some((entry, index) => entry !== expectedEntries[index])) {
    throw new Error("Production APK contains an unreviewed entry path");
  }
  if (inventoryEntries.some((entry) =>
    !entry.startsWith("assets/receipt_ocr_models/") && prohibitedPackageEntry.test(entry))) {
    throw new Error("Production APK contains test, fixture, log, or OCR evidence paths");
  }
  if (!reviewedPackageDigests.includes(packageDigest)) {
    throw new PackageContentMismatch(packageDigest);
  }
  if (!/^[0-9a-f]{64}$/.test(signerCertificateSha256)) {
    throw new Error("Production APK signer identity is unreviewed");
  }
  return signerCertificateSha256;
}

function verifyIosPackage(packagePath, contract) {
  const modelRoot = path.join(packagePath, "receipt_ocr_models");
  const modelRootStat = lstatSync(modelRoot);
  if (!modelRootStat.isDirectory() || modelRootStat.isSymbolicLink()) {
    throw new Error("Production iOS app model root is not a real directory");
  }
  assertExactModelInventory(
    iosModelInventory(modelRoot),
    [
      "catalog.json",
      ...contract.models.map((model) => model.relativePath.replace(/^assets\/receipt_ocr_models\//, "")),
      ...contract.legalArtifacts.map((artifact) =>
        artifact.relativePath.replace(/^assets\/receipt_ocr_models\//, "")),
    ],
  );
  const catalogRelativePath = contract.catalog.relativePath.slice("assets/".length);
  const catalogFilePath = path.join(packagePath, ...catalogRelativePath.split("/"));
  const catalogStat = lstatSync(catalogFilePath);
  if (!catalogStat.isFile() || catalogStat.isSymbolicLink()) {
    throw new Error("Production iOS app catalog is not a regular file");
  }
  validateModel(readFileSync(catalogFilePath), contract.catalog, contract.catalog.relativePath);
  for (const model of contract.models) {
    const packagedRelativePath = model.relativePath.startsWith("assets/")
      ? model.relativePath.slice("assets/".length)
      : model.relativePath;
    const filePath = path.join(packagePath, ...packagedRelativePath.split("/"));
    const stat = lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Production iOS app model is not a regular file: ${model.relativePath}`);
    }
    validateModel(readFileSync(filePath), model, model.relativePath);
  }
  for (const artifact of contract.legalArtifacts) {
    const packagedRelativePath = artifact.relativePath.replace(/^assets\//, "");
    const filePath = path.join(packagePath, ...packagedRelativePath.split("/"));
    const stat = lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Production iOS app legal artifact is not a regular file: ${artifact.relativePath}`);
    }
    validateModel(readFileSync(filePath), artifact, artifact.relativePath);
  }
  for (const fixture of contract.fixtures) {
    const filePath = path.join(packagePath, "receipt_ocr_acceptance", ...fixture.split("/"));
    try {
      lstatSync(filePath);
      throw new Error(`Production iOS app contains acceptance fixture ${fixture}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

export function verifyMobilePackage({ platform, packagePath, repoRoot, runCommand = execFileSync,
  verifySignature = verifyAndroidSignature, reviewedPackageDigests = expectedAndroidPackageDigests }) {
  if (!new Set(["android", "ios"]).has(platform)) throw new Error("Platform is invalid");
  const contract = expectedPackageContract(repoRoot);
  if (contract.models.length === 0 || contract.fixtures.length !== 102) {
    throw new Error("Catalog or immutable fixture contract is incomplete");
  }
  const androidEvidence = platform === "android"
    ? withAndroidSnapshot(packagePath, (snapshot) => verifyAndroidPackage(snapshot, contract, runCommand, verifySignature, reviewedPackageDigests))
    : null;
  if (platform === "ios") verifyIosPackage(packagePath, contract);
  return {
    catalogFileCount: 1,
    modelFileCount: contract.models.length,
    fixtureFileCount: contract.fixtures.length,
    ...(androidEvidence ?? {}),
  };
}

function parseArgs(values) {
  return Object.fromEntries(values.map((value) => {
    const separator = value.indexOf("=");
    if (!value.startsWith("--") || separator < 3) throw new Error(`Expected --name=value, got ${value}`);
    return [value.slice(2, separator), value.slice(separator + 1)];
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = verifyMobilePackage({
      platform: args.platform,
      packagePath: path.resolve(args.package),
      repoRoot: path.resolve(args["repo-root"] ?? "."),
    });
    if (args.json === "true") {
      console.log(JSON.stringify(result));
    } else {
      console.log(`Verified ${args.platform} production package: catalog identity; ${result.modelFileCount} catalog model files; ${result.fixtureFileCount} acceptance fixture paths absent`);
    }
  } catch (error) {
    // The digest is safe bounded diagnostic evidence for a clean source build;
    // no entry names, bytes, local paths, or raw provider content are emitted.
    console.error(error instanceof PackageContentMismatch
      ? `Production package verification failed: unreviewed content digest ${error.digest}`
      : "Production package verification failed: package contract mismatch");
    process.exitCode = 1;
  }
}
