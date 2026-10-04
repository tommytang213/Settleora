import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { deflateSync, inflateSync } from "node:zlib";

import { verifyIosIconPng } from "../verify-ios-icon-png.mjs";

const icon = readFileSync(path.resolve(import.meta.dirname,
  "../../../apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png"));

function framed(...parts) {
  return Buffer.concat(parts.flatMap((part) => [Buffer.from(`${part.length}\n`), part]));
}

test("icon verifier CLI accepts only two bounded binary frames", () => {
  const script = path.resolve(import.meta.dirname, "../verify-ios-icon-png.mjs");
  const run = (input) => spawnSync(process.execPath, [script], { input, encoding: "utf8" });
  assert.equal(run(framed(icon, icon)).status, 0);
  assert.equal(run(framed(icon, icon, icon)).status, 1);
  assert.equal(run(Buffer.concat([Buffer.from("99999999\n"), icon])).status, 1);
  assert.equal(run(Buffer.alloc(2 * 4 * 1024 * 1024 + 33)).status, 1);
  assert.equal(run(framed(Buffer.concat([icon, Buffer.from("hidden")]), icon)).status, 1);
});

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

test("unreviewed optimized icon reports only bounded full-byte identities", () => {
  const script = path.resolve(import.meta.dirname, "../verify-ios-icon-png.mjs");
  const optimized = Buffer.concat([icon.subarray(0, 8), Buffer.from("CgBI"), icon.subarray(8)]);
  const run = spawnSync(process.execPath, [script], {
    input: framed(optimized, icon), encoding: "utf8",
  });
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(run.status, 1);
  assert.equal(run.stdout, "");
  assert.equal(run.stderr.trim(),
    `Packaged iOS icon PNG representation is unreviewed: source ${digest(icon)} packaged ${digest(optimized)}`);
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

  const recoded = replaceChunk(icon, "IDAT", chunk("IDAT",
    deflateSync(inflateSync(originalDeflate), { level: 0 })));
  assert.throws(() => verifyIosIconPng(recoded, icon), /unreviewed bytes/);
});
