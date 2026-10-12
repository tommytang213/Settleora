import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { signedMachOCodeMatches, verifySignedMachOFiles } from "../ios-code-equivalence.mjs";
import { inspectXcarchive } from "../verify-ios-xcarchive.mjs";

const image = (code, signature) => Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(code), Buffer.from(signature)]);

test("code equivalence strips only disposable copies and compares all remaining bytes", () => {
  const left = image("same-code", "aaa"), right = image("same-code", "bbb");
  const before = [Buffer.from(left), Buffer.from(right)], paths = [];
  const strip = (file) => { paths.push(file); writeFileSync(file, readFileSync(file).subarray(0, -3)); };
  assert.equal(signedMachOCodeMatches(left, right, strip), true);
  assert.equal(signedMachOCodeMatches(left, image("evil-code", "bbb"), strip), false);
  assert.equal(signedMachOCodeMatches(left, Buffer.from("resource"), strip), false);
  assert.deepEqual([left, right], before);
  assert(paths.every((file) => !existsSync(file)));
  assert.throws(() => signedMachOCodeMatches(left, right, (file) => { paths.push(file); throw new Error("strip failed"); }), /strip failed/);
  assert(paths.every((file) => !existsSync(file)));
  assert.equal(signedMachOCodeMatches(left, right, (file) => writeFileSync(file, "")), false);
});

test("archive comparison requires both signatures and rejects changed code, resources and concurrent mutation", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-archive-equivalence-"));
  const archive = path.join(root, "Runner.xcarchive"), app = path.join(root, "export.app");
  const archivedApp = path.join(archive, "Products/Applications/Runner.app");
  try {
    for (const dir of [archivedApp, app]) mkdirSync(dir, { recursive: true });
    const plist = "<plist><dict/></plist>";
    for (const dir of [archive, archivedApp, app]) writeFileSync(path.join(dir, "Info.plist"), plist);
    for (const [dir, signature] of [[archivedApp, "aaa"], [app, "bbb"]]) {
      writeFileSync(path.join(dir, "Runner"), image("same-code", signature));
      writeFileSync(path.join(dir, "resource.txt"), "same resource");
    }
    const verified = [];
    const options = {
      verifySignature(file) { verified.push(file); },
      codeMatches(left, right) {
        return signedMachOCodeMatches(left, right, (file) => writeFileSync(file, readFileSync(file).subarray(0, -3)));
      },
    };
    const inspect = (overrides = {}) => inspectXcarchive(archive, app, (f) => readFileSync(f, "utf8"), { ...options, ...overrides });
    const result = inspect();
    assert.deepEqual(verified, [archivedApp, app]);
    assert.equal(result.resignatureComparisons, 1);
    assert.equal(result.applicationSignaturesVerified, true);
    for (const failed of [archivedApp, app]) assert.throws(() => inspect({ verifySignature(file) { if (file === failed) throw new Error("invalid signature"); } }), /unreviewed/);
    writeFileSync(path.join(app, "Runner"), image("evil-code", "bbb"));
    assert.throws(inspect, /unreviewed/);
    writeFileSync(path.join(app, "Runner"), image("same-code", "bbb"));
    writeFileSync(path.join(app, "resource.txt"), "changed resource");
    assert.throws(inspect, /unreviewed/);
    writeFileSync(path.join(app, "resource.txt"), "same resource");
    assert.throws(() => inspect({ verifySignature(file) { if (file === app) writeFileSync(path.join(archive, "Info.plist"), `${plist}changed`); } }), /unreviewed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("SwiftSupport comparison verifies both signed originals and accepts only signature differences", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-swift-support-control-"));
  const left = path.join(root, "toolchain.dylib"), right = path.join(root, "embedded.dylib");
  const original = [image("same-code", "aaa"), image("same-code", "bbb")];
  const reset = () => { writeFileSync(left, original[0]); writeFileSync(right, original[1]); };
  const verified = [];
  const options = {
    verifySignature(file) { verified.push(file); },
    codeMatches(a, b) {
      return signedMachOCodeMatches(a, b, (file) => writeFileSync(file, readFileSync(file).subarray(0, -3)));
    },
  };
  try {
    reset();
    assert.deepEqual(verifySignedMachOFiles(left, right, options), {
      signaturesVerified: true, signatureOnlyDifference: true,
    });
    assert.deepEqual(verified, [left, right]);
    assert.deepEqual([readFileSync(left), readFileSync(right)], original);
    for (const failed of [left, right]) {
      assert.throws(() => verifySignedMachOFiles(left, right, {
        ...options, verifySignature(file) { if (file === failed) throw new Error("invalid signature"); },
      }), /invalid signature/);
    }
    writeFileSync(right, original[0]);
    assert.equal(verifySignedMachOFiles(left, right, options).signatureOnlyDifference, false);
    assert.throws(() => verifySignedMachOFiles(left, right, {
      ...options, verifySignature() { throw new Error("unsigned identical files"); },
    }), /unsigned identical/);
    writeFileSync(right, image("evil-code", "bbb"));
    assert.throws(() => verifySignedMachOFiles(left, right, options), /content differs/);
    reset();
    assert.throws(() => verifySignedMachOFiles(left, right, {
      ...options, verifySignature(file) { if (file === right) writeFileSync(left, image("evil-code", "aaa")); },
    }), /original changed/);
    reset();
    assert.throws(() => verifySignedMachOFiles(left, right, {
      ...options, codeMatches() {
        renameSync(left, path.join(root, "retained.dylib"));
        writeFileSync(left, original[0]);
        return true;
      },
    }), /original changed/);
    reset();
    const link = path.join(root, "link.dylib");
    symlinkSync(left, link);
    assert.throws(() => verifySignedMachOFiles(link, right, options));
    assert.throws(() => verifySignedMachOFiles(root, right, options));
    writeFileSync(left, "not executable");
    assert.throws(() => verifySignedMachOFiles(left, right, options), /invalid/);
    truncateSync(left, 256 * 1024 * 1024 + 1);
    assert.throws(() => verifySignedMachOFiles(left, right, options), /oversized/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
