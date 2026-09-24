import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxPngBytes = 4 * 1024 * 1024;
const maxPixels = 1024 * 1024;
const maxDecodedBytes = 16 * 1024 * 1024;
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
  const packaged = readPng(packagedBytes);
  const source = readPng(sourceBytes);
  if (packaged.width !== source.width || packaged.height !== source.height ||
      (packaged.palette && (!source.palette || !packaged.palette.equals(source.palette)))) fail();
  for (const [key, count] of packaged.metadata) {
    if (count > (source.metadata.get(key) ?? 0)) fail();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 4) fail();
    verifyIosIconPng(readFileSync(process.argv[2]), readFileSync(process.argv[3]));
  } catch {
    console.error("Packaged iOS icon PNG verification failed");
    process.exitCode = 1;
  }
}
