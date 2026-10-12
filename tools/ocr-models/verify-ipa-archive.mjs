import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

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
const allowedMetadataExtraFieldIds = new Set([0x5455]);

class UnreviewedIpaRepresentation extends Error {
  constructor(digest) {
    super("Signed IPA representation is unreviewed");
    this.digest = digest;
  }
}

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

function metadataPatch(patches, offset, before, after) {
  if (!before.equals(after)) patches.push({ offset, before: Buffer.from(before), after });
}

function validateExtraFields(bytes, patches = null, fileOffset = 0) {
  const fields = new Map();
  let cursor = 0;
  while (cursor < bytes.length) {
    if (cursor + 4 > bytes.length) fail("entry extra fields are malformed");
    const identifier = bytes.readUInt16LE(cursor);
    const length = bytes.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + length > bytes.length) fail("entry extra field length is malformed");
    const data = bytes.subarray(cursor, cursor + length);
    if (!allowedMetadataExtraFieldIds.has(identifier)) fail("non-metadata archive extra field is forbidden");
    if (fields.has(identifier)) fail("duplicate archive metadata extra field is forbidden");
    if (identifier === 0x5455) {
      if (length !== 5 || data[0] !== 1 || (patches === null && data.subarray(1).some((byte) => byte !== 0))) {
        fail("extended timestamp extra field is not canonical");
      }
      if (patches !== null) metadataPatch(patches, fileOffset + cursor + 1, data.subarray(1), Buffer.alloc(4));
    }
    fields.set(identifier, Buffer.from(data));
    cursor += length;
  }
  return fields;
}

function validateMatchingExtraFields(localFields, centralFields) {
  const localTimestamp = localFields.get(0x5455);
  const centralTimestamp = centralFields.get(0x5455);
  if ((localTimestamp == null) !== (centralTimestamp == null)) {
    fail("local and central timestamp metadata disagree");
  }
  if (localTimestamp != null && centralTimestamp != null) {
    const localHasModifiedTime = (localTimestamp[0] & 1) !== 0;
    const centralHasModifiedTime = (centralTimestamp[0] & 1) !== 0;
    if (localHasModifiedTime !== centralHasModifiedTime ||
        (localHasModifiedTime && !localTimestamp.subarray(1, 5).equals(centralTimestamp.subarray(1, 5)))) {
      fail("local and central timestamp metadata disagree");
    }
  }

}

function validateDosTimestamp(time, date, patches = null, fileOffset = 0) {
  if (patches === null) {
    if (time !== 0x0821 || date !== 0x0221) fail("entry DOS timestamp is not canonical");
    return;
  }
  // Only the export-to-canonical copy accepts calendar metadata. The retained
  // IPA still has the strict fixed representation, with no metadata channel.
  const year = 1980 + (date >>> 9), month = (date >>> 5) & 15, day = date & 31;
  const maxDay = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if ((time >>> 11) > 23 || ((time >>> 5) & 63) > 59 || (time & 31) > 29 || day < 1 || day > maxDay) {
    fail("export entry DOS timestamp is invalid");
  }
  const before = Buffer.alloc(4), after = Buffer.alloc(4);
  before.writeUInt16LE(time, 0); before.writeUInt16LE(date, 2);
  after.writeUInt16LE(0x0821, 0); after.writeUInt16LE(0x0221, 2);
  metadataPatch(patches, fileOffset, before, after);
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

// Structural inspection is deliberately separate from release attestation.
// It permits format tests to probe malformed archives without assigning them
// a reviewed signed-artifact identity.
function inspectIpaMetadata(fd, { close = true, patches = null } = {}) {
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
      const centralTime = central.readUInt16LE(cursor + 12);
      const centralDate = central.readUInt16LE(cursor + 14);
      validateDosTimestamp(centralTime, centralDate, patches, centralOffset + cursor + 12);
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
      const centralExtraFields = validateExtraFields(
        central.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength),
        patches, centralOffset + cursor + 46 + nameLength,
      );
      const name = decodeName(nameBytes);
      const unixMode = madeBySystem === 3 || madeBySystem === 19 ? externalAttributes >>> 16 : 0;
      const unixType = unixMode & 0xf000;
      if (unixType !== 0 && unixType !== 0x4000 && unixType !== 0x8000) fail("symlink or special-file entry is forbidden");
      const directory = unixType === 0x4000 || (unixType === 0 && name.endsWith("/"));
      if (directory !== name.endsWith("/")) fail("entry type and directory marker disagree");
      if (directory && (method !== 0 || crc32 !== 0 || compressedSize !== 0 || uncompressedSize !== 0 || (flags & 0x0008) !== 0)) {
        fail("directory entry contains payload bytes");
      }
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
      const localTime = local.readUInt16LE(10);
      const localDate = local.readUInt16LE(12);
      const localCrc32 = local.readUInt32LE(14);
      const localCompressedSize = local.readUInt32LE(18);
      const localUncompressedSize = local.readUInt32LE(22);
      const localNameLength = local.readUInt16LE(26);
      const localExtraLength = local.readUInt16LE(28);
      const localName = readExact(fd, localNameLength, localOffset + 30);
      if (localFlags !== flags || localMethod !== method || !localName.equals(nameBytes)) fail("local and central entry identities disagree");
      if (localTime !== centralTime || localDate !== centralDate) fail("local and central entry DOS timestamps disagree");
      validateDosTimestamp(localTime, localDate, patches, localOffset + 10);
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
      const localExtraFields = validateExtraFields(localExtra, patches, localOffset + 30 + localNameLength);
      validateMatchingExtraFields(localExtraFields, centralExtraFields);
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
      if (method === 8) {
        // ZIP offsets account for the declared range, but an inflater stops
        // at the first stream end. Require it to consume that entire range
        // before any canonical snapshot can retain otherwise hidden bytes.
        const compressed = readExact(fd, compressedSize, dataStart);
        let expanded;
        try {
          expanded = inflateRawSync(compressed, {
            info: true, maxOutputLength: Math.max(1, uncompressedSize),
          });
        } catch {
          fail("compressed entry is invalid or exceeds its declared expanded size");
        }
        if (expanded.engine.bytesWritten !== compressedSize) fail("compressed entry contains trailing bytes");
        if (expanded.buffer.length !== uncompressedSize) fail("entry expanded size differs from its declaration");
      } else if (compressedSize !== uncompressedSize) {
        fail("stored entry sizes disagree");
      }
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
    if (close) closeSync(fd);
  }
}

export function inspectOpenedIpa(fd, { close = true } = {}) {
  return inspectIpaMetadata(fd, { close });
}

export function verifyOpenedIpa(fd, {
  close = true, reviewedDigests = null,
} = {}) {
  try {
    const digest = inspectOpenedIpa(fd, { close: false });
    if (reviewedDigests !== null && !reviewedDigests.has(digest)) throw new UnreviewedIpaRepresentation(digest);
    return digest;
  } finally {
    if (close) closeSync(fd);
  }
}

function copyOpenedIpa(fd, destination, size, expectedSha256, reviewedDigests, patches = []) {
  let destinationFd;
  try {
    destinationFd = openSync(
      destination,
      constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (position < size) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, size - position), position);
      if (count === 0) fail("archive changed while its verified snapshot was copied");
      let written = 0;
      while (written < count) {
        written += writeSync(destinationFd, buffer, written, count - written);
      }
      hash.update(buffer.subarray(0, count));
      position += count;
    }
    if (hash.digest("hex") !== expectedSha256) fail("verified archive snapshot differs from the opened descriptor");
    for (const patch of patches) {
      if (!readExact(destinationFd, patch.before.length, patch.offset).equals(patch.before)) fail("export metadata changed while copied");
      let written = 0;
      while (written < patch.after.length) {
        const count = writeSync(destinationFd, patch.after, written, patch.after.length - written, patch.offset + written);
        if (count === 0) fail("canonical metadata could not be written");
        written += count;
      }
    }
    fsyncSync(destinationFd);
  } catch (error) {
    if (destinationFd !== undefined) {
      closeSync(destinationFd);
      try { unlinkSync(destination); } catch {}
    }
    throw error;
  }
  try {
    const canonicalDigest = verifyOpenedIpa(destinationFd, { close: false, reviewedDigests });
    if (patches.length === 0 && canonicalDigest !== expectedSha256) fail("verified archive snapshot identity changed");
  } catch (error) {
    closeSync(destinationFd);
    try {
      unlinkSync(destination);
    } catch {}
    throw error;
  }
  return destinationFd;
}

function copyCanonicalExport(fd, destination, reviewedDigests) {
  const patches = [];
  const exportSha256 = inspectIpaMetadata(fd, { close: false, patches });
  const copiedFd = copyOpenedIpa(fd, destination, fstatSync(fd).size, exportSha256, reviewedDigests, patches);
  try {
    return { copiedFd, metadata: {
      contract: "settleora-ipa-zip-timestamps-v1",
      exportSha256,
      sha256: verifyOpenedIpa(copiedFd, { close: false, reviewedDigests }),
      metadataFieldsNormalized: patches.length,
    } };
  } catch (error) {
    closeSync(copiedFd);
    try { unlinkSync(destination); } catch {}
    throw error;
  }
}

// Isolated format controls can exercise the exact normalization without signing
// or attesting a release. The production entry point below owns the paths.
export function canonicalizeOpenedIpa(fd, destination) {
  let copiedFd;
  try {
    const result = copyCanonicalExport(fd, destination, null);
    copiedFd = result.copiedFd;
    return result.metadata;
  } finally {
    if (copiedFd !== undefined) closeSync(copiedFd);
    closeSync(fd);
  }
}

export function verifyCanonicalIpa({ reviewedDigests = null, canonicalizeExportMetadata = false } = {}) {
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
  const inspectionRoot = path.join("build", "ios", ".settleora-ipa-inspection");
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
  let copiedFd;
  const snapshot = path.join(ipaDirectory, ".settleora-verified-ipa");
  const canonicalIpa = path.join(ipaDirectory, candidates[0]);
  try {
    const archiveStat = fstatSync(fd);
    let digest, metadata;
    if (canonicalizeExportMetadata) {
      const result = copyCanonicalExport(fd, snapshot, reviewedDigests);
      copiedFd = result.copiedFd;
      metadata = result.metadata;
      digest = metadata.sha256;
    } else {
      digest = verifyOpenedIpa(fd, { close: false, reviewedDigests });
      copiedFd = copyOpenedIpa(fd, snapshot, archiveStat.size, digest, reviewedDigests);
    }
    renameSync(snapshot, canonicalIpa);
    mkdirSync(inspectionRoot, { mode: 0o700 });
    const integrity = spawnSync("unzip", ["-tqq", "/dev/fd/3"], {
      stdio: ["ignore", "ignore", "ignore", copiedFd],
    });
    if (integrity.status !== 0) fail("descriptor-backed IPA integrity test failed");
    const extraction = spawnSync("unzip", ["-q", "/dev/fd/3", "-d", inspectionRoot], {
      stdio: ["ignore", "ignore", "ignore", copiedFd],
    });
    if (extraction.status !== 0) fail("descriptor-backed IPA extraction failed");
    return metadata ?? digest;
  } catch (error) {
    try {
      rmSync(inspectionRoot, { recursive: true, force: true });
    } catch {}
    throw error;
  } finally {
    if (copiedFd !== undefined) closeSync(copiedFd);
    closeSync(fd);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const canonicalizeExportMetadata = process.argv.length === 3 && process.argv[2] === "--canonicalize-export-metadata";
    if (process.argv.length !== 2 && !canonicalizeExportMetadata) throw new Error("invalid invocation");
    const result = verifyCanonicalIpa({ canonicalizeExportMetadata });
    process.stdout.write(`${canonicalizeExportMetadata ? JSON.stringify(result) : result}\n`);
  } catch (error) {
    process.stderr.write(error instanceof UnreviewedIpaRepresentation
      ? `canonical_ipa_representation_unreviewed sha256=${error.digest}\n`
      : "canonical_ipa_verification_failed\n");
    process.exitCode = 1;
  }
}
