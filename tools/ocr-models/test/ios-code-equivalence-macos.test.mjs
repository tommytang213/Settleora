import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { signedMachOCodeMatches, verifyApplicationSignature, verifySignedMachOFiles } from "../ios-code-equivalence.mjs";
import { inspectXcarchive } from "../verify-ios-xcarchive.mjs";

// Linux must report this as skipped. These ad-hoc controls use no signing
// identity, keychain modification, provisioning profile or network operation.
// They complement, and never replace, the real Xcode distribution export.
test("Apple signing tools preserve code equivalence across re-signing and reject content changes", {
  skip: process.platform !== "darwin" ? "requires real macOS codesign and Xcode tools" : false,
}, () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-real-codesign-"));
  const run = (command, args) => execFileSync(command, args, { stdio: ["ignore", "ignore", "pipe"], timeout: 120_000 });
  const sign = (file, identifier) => run("/usr/bin/codesign", ["--force", "--sign", "-", "--identifier", identifier, file]);
  try {
    const source = path.join(root, "fixture.c"), original = path.join(root, "original");
    writeFileSync(source, "int main(void) { return 0; }\n");
    run("/usr/bin/xcrun", ["clang", source, "-o", original]);
    const archive = path.join(root, "Runner.xcarchive"), archivedApp = path.join(archive, "Products/Applications/Runner.app");
    const app = path.join(root, "Export.app");
    const plist = '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Runner</string><key>CFBundleIdentifier</key><string>com.settleora.packaging-control</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>';
    for (const [dir, identifier] of [[archivedApp, "com.settleora.archive-control"], [app, "com.settleora.export-control"]]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "Info.plist"), plist);
      writeFileSync(path.join(dir, "resource.txt"), "fixture resource");
      copyFileSync(original, path.join(dir, "Runner"));
      sign(dir, identifier);
      verifyApplicationSignature(dir);
    }
    writeFileSync(path.join(archive, "Info.plist"), "<plist><dict/></plist>");
    const before = readFileSync(path.join(archivedApp, "Runner"));
    const after = readFileSync(path.join(app, "Runner"));
    assert(!before.equals(after), "control must produce different embedded signatures");
    assert.equal(signedMachOCodeMatches(before, after), true);
    assert.equal(inspectXcarchive(archive, app).resignatureComparisons, 1);
    assert.deepEqual(readFileSync(path.join(archivedApp, "Runner")), before);
    assert.deepEqual(readFileSync(path.join(app, "Runner")), after);
    writeFileSync(path.join(app, "resource.txt"), "modified resource");
    sign(app, "com.settleora.export-control");
    verifyApplicationSignature(app);
    assert.throws(() => inspectXcarchive(archive, app), /unreviewed/);
    writeFileSync(source, "int main(void) { return 7; }\n");
    const changed = path.join(root, "changed");
    run("/usr/bin/xcrun", ["clang", source, "-o", changed]);
    sign(changed, "com.settleora.export-control");
    verifyApplicationSignature(changed);
    assert.equal(signedMachOCodeMatches(before, readFileSync(changed)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Apple signing tools compare re-signed SwiftSupport dylib code without rewriting originals", {
  skip: process.platform !== "darwin" ? "requires real macOS codesign and Xcode tools" : false,
}, () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-real-swift-support-"));
  const run = (command, args) => execFileSync(command, args, { stdio: ["ignore", "ignore", "pipe"], timeout: 120_000 });
  const sign = (file, identifier) => run("/usr/bin/codesign", ["--force", "--sign", "-", "--identifier", identifier, file]);
  try {
    const source = path.join(root, "fixture.c"), original = path.join(root, "original.dylib");
    const support = path.join(root, "support.dylib"), embedded = path.join(root, "embedded.dylib");
    writeFileSync(source, "int library_value(void) { return 0; }\n");
    run("/usr/bin/xcrun", ["clang", "-dynamiclib", source, "-o", original]);
    copyFileSync(original, support); copyFileSync(original, embedded);
    sign(support, "com.settleora.toolchain-control");
    sign(embedded, "com.settleora.embedded-control");
    const before = [readFileSync(support), readFileSync(embedded)];
    assert(!before[0].equals(before[1]), "control must contain different signatures");
    assert.deepEqual(verifySignedMachOFiles(support, embedded), {
      signaturesVerified: true, signatureOnlyDifference: true,
    });
    run(process.execPath, [fileURLToPath(new URL("../ios-code-equivalence.mjs", import.meta.url)),
      "--compare-signed-files", support, embedded]);
    assert.deepEqual([readFileSync(support), readFileSync(embedded)], before);
    run("/usr/bin/codesign", ["--remove-signature", embedded]);
    assert.throws(() => verifySignedMachOFiles(support, embedded));
    writeFileSync(source, "int library_value(void) { return 7; }\n");
    run("/usr/bin/xcrun", ["clang", "-dynamiclib", source, "-o", embedded]);
    sign(embedded, "com.settleora.embedded-control");
    verifyApplicationSignature(embedded);
    assert.throws(() => verifySignedMachOFiles(support, embedded), /content differs/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
