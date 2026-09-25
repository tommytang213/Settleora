import { readSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxPngBytes = 4 * 1024 * 1024;
const maxPixels = 1024 * 1024;
const maxDecodedBytes = 16 * 1024 * 1024;
// Exact-source Xcode 16.4 unsigned package observations. The wrapper first
// matched decoded BMP pixels to each reviewed source icon, then reported both
// full-byte digests. These pin only loose AppIcon representations; signed
// Assets.car proof belongs to #1320.
const reviewedCompiledIconDigests = new Map([
  // Workflow 36037153468, job 107759977029.
  ["19be171481dc71a0b2803ebcd01dd8b0c5fd5778dee34c0a3cabc948c225f24e",
    new Set(["9d328d1d45f386375e28736159b4ffa53c4930e3962016dbf98b029a4e80121c"])],
  // Workflow 36121355731, job 108027351637.
  ["41c7d42f6e61f8fe7f30b1ffa2256aecbc9682be06d18c4a3062043e1a2e547c",
    new Set(["29a53a06908d2de7e2c0d4b50d967cc61acb33f76689c207e43f28e9724c3996"])],
]);
const validDepths = new Map([
  [0, new Set([1, 2, 4, 8, 16])],
  [2, new Set([8, 16])],
  [3, new Set([1, 2, 4, 8])],
  [4, new Set([8, 16])],
  [6, new Set([8, 16])],
]);
const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);

function fail() {
  throw new Error("Packaged iOS icon PNG contains unreviewed bytes");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

class UnreviewedIconRepresentation extends Error {
  constructor(sourceDigest, packagedDigest) {
    super("Packaged iOS icon PNG contains unreviewed bytes");
    this.sourceDigest = sourceDigest;
    this.packagedDigest = packagedDigest;
  }
}

function readBoundedStdin() {
  const limit = 2 * maxPngBytes + 32;
  const chunk = Buffer.allocUnsafe(64 * 1024);
  const parts = [];
  let size = 0;
  for (;;) {
    const count = readSync(0, chunk, 0, Math.min(chunk.length, limit + 1 - size), null);
    if (count === 0) break;
    size += count;
    if (size > limit) fail();
    parts.push(Buffer.from(chunk.subarray(0, count)));
  }
  return Buffer.concat(parts, size);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || bytes.length > maxPngBytes ||
      !bytes.subarray(0, 8).equals(signature)) fail();
  const metadata = new Map();
  const idat = [];
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let color = 0;
  let seenIhdr = false;
  let seenIdat = false;
  let endedIdat = false;
  let seenIend = false;
  let palette = null;
  let chunks = 0;
  while (offset < bytes.length) {
    if (++chunks > 64 || offset + 12 > bytes.length) fail();
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (length > maxPngBytes || end > bytes.length) fail();
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type) ||
        crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) fail();
    const data = bytes.subarray(offset + 8, end - 4);
    if (!seenIhdr && type !== "IHDR") fail();
    if (type === "IHDR") {
      if (seenIhdr || length !== 13) fail();
      seenIhdr = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
      if (width < 1 || height < 1 || width * height > maxPixels ||
          !validDepths.get(color)?.has(depth) || data[10] !== 0 ||
          data[11] !== 0 || data[12] !== 0) fail();
    } else if (type === "PLTE") {
      if (seenIdat || palette || length < 3 || length > 768 || length % 3 !== 0) fail();
      palette = Buffer.from(data);
    } else if (type === "IDAT") {
      if (endedIdat || length === 0) fail();
      seenIdat = true;
      idat.push(data);
    } else if (type === "IEND") {
      if (!seenIdat || length !== 0 || seenIend || end !== bytes.length) fail();
      seenIend = true;
    } else {
      if (typeBytes[0] < 0x61 || typeBytes[0] > 0x7a ||
          type === "eXIf" || type === "iCCP" || type === "zTXt" ||
          type === "iTXt") fail();
      const key = `${type}:${data.toString("hex")}`;
      metadata.set(key, (metadata.get(key) ?? 0) + 1);
    }
    if (seenIdat && type !== "IDAT" && type !== "IEND") endedIdat = true;
    offset = end;
    if (seenIend) break;
  }
  if (!seenIend || (color === 3 && !palette)) fail();
  const compressed = Buffer.concat(idat);
  let expanded;
  try {
    expanded = inflateSync(compressed, { info: true, maxOutputLength: maxDecodedBytes });
  } catch {
    fail();
  }
  const rowBytes = Math.ceil(width * channels.get(color) * depth / 8);
  if (expanded.engine.bytesWritten !== compressed.length ||
      expanded.buffer.length !== height * (1 + rowBytes)) fail();
  for (let row = 0; row < height; row += 1) {
    if (expanded.buffer[row * (rowBytes + 1)] > 4) fail();
  }
  return { width, height, metadata, palette };
}

export function verifyIosIconPng(packagedBytes, sourceBytes) {
  const source = readPng(sourceBytes);
  if (!Buffer.isBuffer(packagedBytes) || packagedBytes.length < 45 ||
      packagedBytes.length > maxPngBytes) fail();
  const sourceDigest = sha256(sourceBytes);
  const packagedDigest = sha256(packagedBytes);
  if (packagedDigest !== sourceDigest &&
      !reviewedCompiledIconDigests.get(sourceDigest)?.has(packagedDigest)) {
    throw new UnreviewedIconRepresentation(sourceDigest, packagedDigest);
  }
  // Xcode may emit a proprietary optimized representation. The wrapper first
  // proves decoded pixels equal a reviewed source icon; the full byte digest
  // above then binds the exact packaged representation.
  if (packagedDigest !== sourceDigest) return;
  const packaged = readPng(packagedBytes);
  if (packaged.width !== source.width || packaged.height !== source.height ||
      (packaged.palette && (!source.palette || !packaged.palette.equals(source.palette)))) fail();
  for (const [key, count] of packaged.metadata) {
    if (count > (source.metadata.get(key) ?? 0)) fail();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 2) fail();
    const input = readBoundedStdin();
    let offset = 0;
    const readFrame = () => {
      const newline = input.indexOf(10, offset);
      if (newline < offset || newline - offset > 8) fail();
      const lengthText = input.toString("ascii", offset, newline);
      if (!/^[1-9][0-9]*$/.test(lengthText)) fail();
      const length = Number(lengthText);
      if (length > maxPngBytes || newline + 1 + length > input.length) fail();
      offset = newline + 1 + length;
      return input.subarray(newline + 1, offset);
    };
    const packagedBytes = readFrame();
    const sourceBytes = readFrame();
    if (offset !== input.length) fail();
    verifyIosIconPng(packagedBytes, sourceBytes);
  } catch (error) {
    console.error(error instanceof UnreviewedIconRepresentation
      ? `Packaged iOS icon PNG representation is unreviewed: source ${error.sourceDigest} packaged ${error.packagedDigest}`
      : "Packaged iOS icon PNG verification failed");
    process.exitCode = 1;
  }
}
