import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync } from "node:fs";
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
// These fields carry timestamps or numeric UID/GID metadata only. Do not add
// a field that can override a filename, file type, link target, or data size.
const allowedMetadataExtraFieldIds = new Set([0x000a, 0x5455, 0x5855, 0x7855, 0x7875]);

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

function validateExtraFields(bytes, location) {
  let cursor = 0;
  while (cursor < bytes.length) {
    if (cursor + 4 > bytes.length) fail("entry extra fields are malformed");
    const identifier = bytes.readUInt16LE(cursor);
    const length = bytes.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + length > bytes.length) fail("entry extra field length is malformed");
    const data = bytes.subarray(cursor, cursor + length);
    if (!allowedMetadataExtraFieldIds.has(identifier)) fail("non-metadata archive extra field is forbidden");
    if (identifier === 0x5455) {
      const flags = data[0];
      const localLength = 1 + 4 * [1, 2, 4].filter((bit) => (flags & bit) !== 0).length;
      const expectedLength = location === "central" ? ((flags & 1) !== 0 ? 5 : 1) : localLength;
      if ((flags & ~0x07) !== 0 || length !== expectedLength) fail("extended timestamp extra field is malformed");
    }
    if (identifier === 0x5855) {
      const validLength = location === "central" ? length === 8 : [8, 12].includes(length);
      if (!validLength) fail("legacy Unix metadata extra field is malformed");
    }
    if (identifier === 0x7855 && length !== (location === "central" ? 0 : 4)) fail("Unix UID/GID metadata extra field is malformed");
    if (identifier === 0x7875) {
      const uidLength = data[1];
      const gidLengthOffset = 2 + uidLength;
      const gidLength = data[gidLengthOffset];
      if (data[0] !== 1 || uidLength < 1 || uidLength > 8 || gidLength < 1 || gidLength > 8 || gidLengthOffset + 1 + gidLength !== length) {
        fail("new Unix UID/GID metadata extra field is malformed");
      }
    }
    if (identifier === 0x000a && (location !== "local" ||
      length !== 32 ||
      data.readUInt32LE(0) !== 0 ||
      data.readUInt16LE(4) !== 1 ||
      data.readUInt16LE(6) !== 24
    )) fail("NTFS timestamp metadata extra field is malformed");
    cursor += length;
  }
}

function validateName(name, directory) {
  if (!name || name.startsWith("/") || name.includes("\\")) fail("entry name is not a safe relative POSIX path");
  if (/[\u0000-\u001f\u007f]/u.test(name)) fail("entry name contains a control character");
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

export function verifyOpenedIpa(fd) {
  try {
    const archiveStat = fstatSync(fd);
    if (!archiveStat.isFile()) fail("archive must be a regular non-symlink file");
    if (archiveStat.size < 22 || archiveStat.size > maximumArchiveBytes) fail("archive byte size is outside the bounded contract");

    const tailLength = Math.min(archiveStat.size, 65_557);
    const tailStart = archiveStat.size - tailLength;
    const { buffer: eocd, offset: eocdOffset } = findEocd(readExact(fd, tailLength, tailStart), tailStart, archiveStat.size);
    const disk = eocd.readUInt16LE(4);
    const centralDisk = eocd.readUInt16LE(6);
    const diskEntries = eocd.readUInt16LE(8);
    const totalEntries = eocd.readUInt16LE(10);
    const centralSize = eocd.readUInt32LE(12);
    const centralOffset = eocd.readUInt32LE(16);
    const archiveCommentLength = eocd.readUInt16LE(20);
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) fail("multi-disk archives are forbidden");
    if (totalEntries === 0 || totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      fail("empty or ZIP64 archives are outside the bounded contract");
    }
    if (totalEntries > maximumEntries || centralSize > maximumCentralDirectoryBytes) fail("central directory exceeds bounded limits");
    if (archiveCommentLength !== 0) fail("archive comments are forbidden");
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
      if (commentLength !== 0) fail("entry comments are forbidden");
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
      validateExtraFields(central.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength), "central");
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
      validateExtraFields(localExtra, "local");
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
    let coveredThrough = 0;
    for (const [rangeStart, rangeEnd] of occupiedRanges) {
      if (rangeStart !== coveredThrough) fail("entry byte ranges do not cover the complete archive payload");
      coveredThrough = rangeEnd;
    }
    if (coveredThrough !== centralOffset) fail("entry byte ranges do not reach the central directory");
    return hashFileDescriptor(fd, archiveStat.size);
  } finally {
    closeSync(fd);
  }
}

function verifyCanonicalIpa() {
  const directoryComponents = ["build", path.join("build", "ios"), path.join("build", "ios", "ipa")];
  for (const component of directoryComponents) {
    let stat;
    try {
      stat = lstatSync(component);
    } catch {
      fail("canonical IPA directory cannot be read");
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("canonical IPA directory must contain no symbolic-link components");
  }
  const ipaDirectory = path.join("build", "ios", "ipa");
  let candidates;
  try {
    candidates = readdirSync(ipaDirectory, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith(".ipa"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    fail("canonical IPA directory cannot be read");
  }
  if (candidates.length !== 1) fail("canonical IPA directory must contain exactly one IPA");
  let fd;
  try {
    fd = openSync(path.join(ipaDirectory, candidates[0]), constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    fail("canonical IPA cannot be opened as a regular non-symlink file");
  }
  return verifyOpenedIpa(fd);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.length !== 2) throw new Error("Usage: verify-ipa-archive.mjs");
  process.stdout.write(`${verifyCanonicalIpa()}\n`);
}
