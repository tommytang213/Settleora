import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const eocdSignature = 0x06054b50;
const centralSignature = 0x02014b50;
const localSignature = 0x04034b50;
const dataDescriptorSignature = 0x08074b50;
const maximumArchiveBytes = 2 * 1024 * 1024 * 1024;
const maximumCentralDirectoryBytes = 64 * 1024 * 1024;
const maximumEntries = 50_000;
const maximumExpandedBytes = 8 * 1024 * 1024 * 1024;
const maximumEntryBytes = 2 * 1024 * 1024 * 1024;
const supportedCompressionMethods = new Set([0, 8]);
const allowedRoots = new Set(["Payload", "SwiftSupport"]);
const forbiddenExtraFieldIds = new Set([0x0001, 0x7075]);

function fail(message) {
  throw new Error(`Unsafe IPA archive: ${message}`);
}

function readExact(fd, length, position) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const count = readSync(fd, buffer, offset, length - offset, position + offset);
    if (count === 0) fail("archive ended unexpectedly");
    offset += count;
  }
  return buffer;
}

function decodeName(bytes) {
  if (bytes.includes(0)) fail("entry name contains a NUL byte");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("entry name is not valid UTF-8");
  }
}

function validateExtraFields(bytes) {
  let cursor = 0;
  while (cursor < bytes.length) {
    if (cursor + 4 > bytes.length) fail("entry extra fields are malformed");
    const identifier = bytes.readUInt16LE(cursor);
    const length = bytes.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + length > bytes.length) fail("entry extra field length is malformed");
    if (forbiddenExtraFieldIds.has(identifier)) fail("ZIP64 or path-overriding extra field is forbidden");
    cursor += length;
  }
}

function validateName(name, directory) {
  if (!name || name.startsWith("/") || name.includes("\\")) fail("entry name is not a safe relative POSIX path");
  const withoutTrailingSlash = directory && name.endsWith("/") ? name.slice(0, -1) : name;
  if (!withoutTrailingSlash || (!directory && name.endsWith("/"))) fail("entry directory marker is inconsistent");
  const components = withoutTrailingSlash.split("/");
  if (components.some((component) => !component || component === "." || component === "..")) {
    fail("entry name contains an empty or dot path component");
  }
  if (!allowedRoots.has(components[0]) || (components.length < 2 && !directory)) fail("entry is outside the allowlisted IPA roots");
  return withoutTrailingSlash;
}

function hashFileDescriptor(fd, size) {
  const hash = createHash("sha256");
  const buffer = Buffer.alloc(1024 * 1024);
  let position = 0;
  while (position < size) {
    const count = readSync(fd, buffer, 0, Math.min(buffer.length, size - position), position);
    if (count === 0) fail("archive changed while its identity was calculated");
    hash.update(buffer.subarray(0, count));
    position += count;
  }
  return hash.digest("hex");
}

function findEocd(tail, tailStart, archiveSize) {
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) !== eocdSignature) continue;
    const commentLength = tail.readUInt16LE(offset + 20);
    const absoluteOffset = tailStart + offset;
    if (absoluteOffset + 22 + commentLength === archiveSize) return { buffer: tail.subarray(offset), offset: absoluteOffset };
  }
  fail("end-of-central-directory record is missing or archive has trailing bytes");
}

export function verifyIpaArchive(archivePath) {
  const archiveStat = lstatSync(archivePath);
  if (!archiveStat.isFile() || archiveStat.isSymbolicLink()) fail("archive must be a regular non-symlink file");
  if (archiveStat.size < 22 || archiveStat.size > maximumArchiveBytes) fail("archive byte size is outside the bounded contract");

  const fd = openSync(archivePath, "r");
  try {
    const tailLength = Math.min(archiveStat.size, 65_557);
    const tailStart = archiveStat.size - tailLength;
    const { buffer: eocd, offset: eocdOffset } = findEocd(readExact(fd, tailLength, tailStart), tailStart, archiveStat.size);
    const disk = eocd.readUInt16LE(4);
    const centralDisk = eocd.readUInt16LE(6);
    const diskEntries = eocd.readUInt16LE(8);
    const totalEntries = eocd.readUInt16LE(10);
    const centralSize = eocd.readUInt32LE(12);
    const centralOffset = eocd.readUInt32LE(16);
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) fail("multi-disk archives are forbidden");
    if (totalEntries === 0 || totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      fail("empty or ZIP64 archives are outside the bounded contract");
    }
    if (totalEntries > maximumEntries || centralSize > maximumCentralDirectoryBytes) fail("central directory exceeds bounded limits");
    if (centralOffset + centralSize !== eocdOffset) fail("central directory bounds do not match the archive");

    const central = readExact(fd, centralSize, centralOffset);
    const exactNames = new Set();
    const foldedNames = new Set();
    const localOffsets = new Set();
    const occupiedRanges = [];
    let expandedBytes = 0;
    let cursor = 0;
    for (let index = 0; index < totalEntries; index += 1) {
      if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== centralSignature) fail("central directory entry is malformed");
      const madeBySystem = central.readUInt16LE(cursor + 4) >>> 8;
      const flags = central.readUInt16LE(cursor + 8);
      const method = central.readUInt16LE(cursor + 10);
      const crc32 = central.readUInt32LE(cursor + 16);
      const compressedSize = central.readUInt32LE(cursor + 20);
      const uncompressedSize = central.readUInt32LE(cursor + 24);
      const nameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const commentLength = central.readUInt16LE(cursor + 32);
      const entryDisk = central.readUInt16LE(cursor + 34);
      const externalAttributes = central.readUInt32LE(cursor + 38);
      const localOffset = central.readUInt32LE(cursor + 42);
      const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
      if (entryEnd > central.length || nameLength === 0) fail("central directory entry lengths are malformed");
      if (entryDisk !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
        fail("ZIP64 or multi-disk entries are forbidden");
      }
      if ((flags & ~0x080e) !== 0 || (flags & 1) !== 0 || !supportedCompressionMethods.has(method)) {
        fail("encrypted, unsupported-flag, or unsupported-compression entry is forbidden");
      }
      if (uncompressedSize > maximumEntryBytes || expandedBytes + uncompressedSize > maximumExpandedBytes) fail("expanded archive exceeds bounded limits");
      expandedBytes += uncompressedSize;

      const nameBytes = central.subarray(cursor + 46, cursor + 46 + nameLength);
      if ((flags & 0x0800) === 0 && nameBytes.some((byte) => byte >= 0x80)) fail("non-ASCII entry name is missing its UTF-8 flag");
      validateExtraFields(central.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength));
      const name = decodeName(nameBytes);
      const unixMode = madeBySystem === 3 || madeBySystem === 19 ? externalAttributes >>> 16 : 0;
      const unixType = unixMode & 0xf000;
      if (unixType !== 0 && unixType !== 0x4000 && unixType !== 0x8000) fail("symlink or special-file entry is forbidden");
      const directory = unixType === 0x4000 || (unixType === 0 && name.endsWith("/"));
      if (directory !== name.endsWith("/")) fail("entry type and directory marker disagree");
      const normalizedName = validateName(name, directory);
      const foldedName = normalizedName.normalize("NFC").toLocaleLowerCase("en-US");
      if (exactNames.has(normalizedName) || foldedNames.has(foldedName)) fail("duplicate or case-colliding entry name is forbidden");
      exactNames.add(normalizedName);
      foldedNames.add(foldedName);
      if (localOffsets.has(localOffset) || localOffset + 30 > centralOffset) fail("local entry offset is duplicated or outside data bounds");
      localOffsets.add(localOffset);

      const local = readExact(fd, 30, localOffset);
      if (local.readUInt32LE(0) !== localSignature) fail("local entry header is malformed");
      const localFlags = local.readUInt16LE(6);
      const localMethod = local.readUInt16LE(8);
      const localCrc32 = local.readUInt32LE(14);
      const localCompressedSize = local.readUInt32LE(18);
      const localUncompressedSize = local.readUInt32LE(22);
      const localNameLength = local.readUInt16LE(26);
      const localExtraLength = local.readUInt16LE(28);
      const localName = readExact(fd, localNameLength, localOffset + 30);
      if (localFlags !== flags || localMethod !== method || !localName.equals(nameBytes)) fail("local and central entry identities disagree");
      const usesDataDescriptor = (flags & 0x0008) !== 0;
      if (!usesDataDescriptor && (localCrc32 !== crc32 || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize)) {
        fail("local and central entry integrity values disagree");
      }
      if (usesDataDescriptor && (
        (localCrc32 !== 0 && localCrc32 !== crc32) ||
        (localCompressedSize !== 0 && localCompressedSize !== compressedSize) ||
        (localUncompressedSize !== 0 && localUncompressedSize !== uncompressedSize)
      )) fail("local data-descriptor placeholders disagree with the central directory");
      const localExtra = readExact(fd, localExtraLength, localOffset + 30 + localNameLength);
      validateExtraFields(localExtra);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      let entryEndOffset = dataStart + compressedSize;
      if (usesDataDescriptor) {
        const descriptor = readExact(fd, 16, entryEndOffset);
        const signed = descriptor.readUInt32LE(0) === dataDescriptorSignature;
        const descriptorOffset = signed ? 4 : 0;
        if (
          descriptor.readUInt32LE(descriptorOffset) !== crc32 ||
          descriptor.readUInt32LE(descriptorOffset + 4) !== compressedSize ||
          descriptor.readUInt32LE(descriptorOffset + 8) !== uncompressedSize
        ) fail("data descriptor disagrees with the central directory");
        entryEndOffset += signed ? 16 : 12;
      }
      if (entryEndOffset > centralOffset) fail("entry data extends into the central directory");
      occupiedRanges.push([localOffset, entryEndOffset]);
      cursor = entryEnd;
    }
    if (cursor !== central.length) fail("central directory contains unaccounted bytes");
    occupiedRanges.sort((left, right) => left[0] - right[0]);
    for (let index = 1; index < occupiedRanges.length; index += 1) {
      if (occupiedRanges[index][0] < occupiedRanges[index - 1][1]) fail("entry byte ranges overlap");
    }
    return hashFileDescriptor(fd, archiveStat.size);
  } finally {
    closeSync(fd);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.length !== 3) throw new Error("Usage: verify-ipa-archive.mjs <signed.ipa>");
  process.stdout.write(`${verifyIpaArchive(process.argv[2])}\n`);
}
