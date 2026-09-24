import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { verifyIosIconPng } from "../verify-ios-icon-png.mjs";

const icon = readFileSync(path.resolve(import.meta.dirname,
  "../../../apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png"));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function replaceChunk(bytes, target, replacement) {
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (bytes.toString("ascii", offset + 4, offset + 8) === target) {
      return Buffer.concat([bytes.subarray(0, offset), replacement, bytes.subarray(end)]);
    }
    offset = end;
  }
  throw new Error("test PNG chunk missing");
}

test("reviewed icon bytes have a complete PNG stream", () => {
  assert.doesNotThrow(() => verifyIosIconPng(icon, icon));
  assert.throws(() => verifyIosIconPng(Buffer.concat([icon, Buffer.from("PRIVATE_RECEIPT_TEXT")]), icon),
    /unreviewed bytes/);
});

test("render-equivalent PNG containers cannot carry new metadata or hidden IDAT bytes", () => {
  const extraMetadata = replaceChunk(icon, "IEND", Buffer.concat([
    chunk("tEXt", Buffer.from("private\0receipt text")), chunk("IEND", Buffer.alloc(0)),
  ]));
  assert.throws(() => verifyIosIconPng(extraMetadata, icon), /unreviewed bytes/);

  let offset = 8;
  while (icon.toString("ascii", offset + 4, offset + 8) !== "IDAT") {
    offset += 12 + icon.readUInt32BE(offset);
  }
  const length = icon.readUInt32BE(offset);
  const originalDeflate = icon.subarray(offset + 8, offset + 8 + length);
  const hiddenDeflate = replaceChunk(icon, "IDAT", chunk("IDAT",
    Buffer.concat([originalDeflate, Buffer.from("PRIVATE_RECEIPT_TEXT")])));
  assert.throws(() => verifyIosIconPng(hiddenDeflate, icon), /unreviewed bytes/);
});
