import assert from "node:assert/strict";
import test from "node:test";

import { validateAndroidV2SignersEnvelope } from "../android-v2-framing.mjs";

// These buffers describe framing only. They are never ZIP/APK fixtures,
// cryptographic signer records, or inputs to package/signature verification.
function lengthPrefix(length) {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(length);
  return prefix;
}
function frame(bytes) {
  return Buffer.concat([lengthPrefix(bytes.length), bytes]);
}
const opaqueSigner = Buffer.from([0x41, 0x42, 0x43]);
const singleSigner = frame(opaqueSigner);
const envelope = frame(singleSigner);

test("accepts exactly one completely framed opaque signer without changing input", () => {
  const before = Buffer.from(envelope);
  assert.equal(validateAndroidV2SignersEnvelope(envelope), undefined);
  assert.deepEqual(envelope, before);
});

test("reads relative to a Buffer slice with a nonzero backing offset", () => {
  const surrounded = Buffer.concat([Buffer.from([9, 8]), envelope, Buffer.from([7])]);
  assert.doesNotThrow(() =>
    validateAndroidV2SignersEnvelope(surrounded.subarray(2, surrounded.length - 1)));
});

test("accepts a one-byte opaque signer without asserting nested validity", () => {
  assert.doesNotThrow(() => validateAndroidV2SignersEnvelope(frame(frame(Buffer.from([0])))));
});

for (const [name, value] of [
  ["null", null],
  ["string", "framing"],
  ["plain array", [0, 0, 0, 0]],
  ["Uint8Array", new Uint8Array([0, 0, 0, 0])],
]) {
  test(`rejects non-Buffer input: ${name}`, () => {
    assert.throws(() => validateAndroidV2SignersEnvelope(value), /envelope is truncated/);
  });
}

for (const size of [0, 1, 2, 3]) {
  test(`rejects a truncated envelope prefix of ${size} bytes`, () => {
    assert.throws(() => validateAndroidV2SignersEnvelope(Buffer.alloc(size)),
      /envelope is truncated/);
  });
}

test("rejects an empty signers envelope", () => {
  assert.throws(() => validateAndroidV2SignersEnvelope(lengthPrefix(0)), /exactly one signer/);
});

for (const [name, value] of [
  ["outer suffix", Buffer.concat([envelope, Buffer.from([0x61])])],
  ["shortened declared envelope", Buffer.concat([lengthPrefix(singleSigner.length - 1), singleSigner])],
  ["oversized declared envelope", Buffer.concat([lengthPrefix(singleSigner.length + 1), singleSigner])],
  ["maximum unsigned envelope length", lengthPrefix(0xffffffff)],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => validateAndroidV2SignersEnvelope(value), /unaccounted bytes/);
  });
}

for (const size of [1, 2, 3]) {
  test(`rejects an incomplete first signer prefix of ${size} bytes`, () => {
    assert.throws(() => validateAndroidV2SignersEnvelope(frame(Buffer.alloc(size))),
      /signer length is truncated/);
  });
  test(`rejects a ${size}-byte tail inside the envelope after one signer`, () => {
    assert.throws(() =>
      validateAndroidV2SignersEnvelope(frame(Buffer.concat([singleSigner, Buffer.alloc(size)]))),
    /signer length is truncated/);
  });
}

for (const [name, record] of [
  ["zero-length signer", lengthPrefix(0)],
  ["missing signer payload", lengthPrefix(1)],
  ["truncated signer payload", Buffer.concat([lengthPrefix(4), opaqueSigner])],
  ["maximum unsigned signer length", lengthPrefix(0xffffffff)],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => validateAndroidV2SignersEnvelope(frame(record)), /empty or truncated/);
  });
}

test("rejects a second fully framed signer", () => {
  assert.throws(() => validateAndroidV2SignersEnvelope(
    frame(Buffer.concat([singleSigner, frame(Buffer.from([0x55]))]))),
  /exactly one signer/);
});

test("rejects an empty second signer instead of ignoring trailing framing", () => {
  assert.throws(() => validateAndroidV2SignersEnvelope(
    frame(Buffer.concat([singleSigner, lengthPrefix(0)]))),
  /empty or truncated/);
});
