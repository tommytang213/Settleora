import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { signedMachOCodeMatches } from "../ios-code-equivalence.mjs";
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
