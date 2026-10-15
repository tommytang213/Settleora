import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectIosAssetCatalogInfo } from "../verify-ios-asset-catalog.mjs";
import { inspectXcarchive } from "../verify-ios-xcarchive.mjs";

const plist = () => "<?xml version=\"1.0\"?><plist><dict/></plist>";
const appPlist = () => '<plist><dict><key>CFBundleIdentifier</key><string>com.tommytang213.settleora</string></dict></plist>';
const symbolPlist = () => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>English</string>
<key>CFBundleIdentifier</key><string>com.apple.xcode.dsym.com.tommytang213.settleora</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundlePackageType</key><string>dSYM</string>
<key>CFBundleSignature</key><string>????</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundleVersion</key><string>1</string>
</dict></plist>`;

test("archive verifier CLI rejects caller-supplied paths", () => {
  const verifier = path.resolve(import.meta.dirname, "../verify-ios-xcarchive.mjs");
  const result = spawnSync(process.execPath, [verifier, "/tmp/other.xcarchive", "/tmp/other.app"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "xcarchive_privacy_verification_failed\n");
});

test("asset catalog emits bounded observed metadata without asserting a signed baseline", () => {
  const base = [
    { Name: "AppIcon", AssetType: "Icon Image", PixelWidth: 60, PixelHeight: 60, Scale: 2, SHA1Digest: "a".repeat(40) },
    { Name: "LaunchImage", AssetType: "Image", PixelWidth: 120, PixelHeight: 80, SHA1Digest: "b".repeat(40) },
  ];
  const original = inspectIosAssetCatalogInfo(JSON.stringify(base));
  assert.equal(original.renditionCount, 2);
  assert.deepEqual(Object.keys(original.inventory[0]), ["metadataSha256"]);
  for (const mutation of [
    [...base, { ...base[0], Scale: 3 }],
    [{ ...base[0], SHA1Digest: "c".repeat(40) }, base[1]],
    [{ ...base[0], PixelWidth: 61 }, base[1]],
  ]) assert.notEqual(inspectIosAssetCatalogInfo(JSON.stringify(mutation)).renditionInventorySha256,
    original.renditionInventorySha256);
  assert.notEqual(inspectIosAssetCatalogInfo(JSON.stringify([...base, base[0]])).renditionInventorySha256,
    original.renditionInventorySha256);
  assert.notEqual(inspectIosAssetCatalogInfo(JSON.stringify([...base, { ...base[0], SHA1Digest: "c".repeat(40) }])).renditionInventorySha256,
    original.renditionInventorySha256);
  assert.notEqual(inspectIosAssetCatalogInfo(JSON.stringify([{ Name: "AppIcon" }, base[1]])).renditionInventorySha256,
    original.renditionInventorySha256);
  assert.notEqual(inspectIosAssetCatalogInfo(JSON.stringify([...base, { Name: "Receipt", AssetType: "Image" }])).renditionInventorySha256,
    original.renditionInventorySha256);
  assert.throws(() => inspectIosAssetCatalogInfo("[]"), /metadata is invalid/);
});

test("archive privacy inspects every file and rejects extra, hidden payload, and symlink", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-archive-policy-"));
  try {
    const app = path.join(root, "ipa-app");
    const archive = path.join(root, "Runner.xcarchive");
    const archivedApp = path.join(archive, "Products/Applications/Runner.app");
    const dwarf = path.join(archive, "dSYMs/Runner.app.dSYM/Contents/Resources/DWARF");
    mkdirSync(app, { recursive: true });
    mkdirSync(archivedApp, { recursive: true });
    mkdirSync(dwarf, { recursive: true });
    writeFileSync(path.join(app, "Info.plist"), appPlist());
    writeFileSync(path.join(archivedApp, "Info.plist"), appPlist());
    writeFileSync(path.join(archive, "Info.plist"), plist());
    const symbolInfo = path.join(archive, "dSYMs/Runner.app.dSYM/Contents/Info.plist");
    writeFileSync(symbolInfo, symbolPlist());
    const symbolBytes = Buffer.from([0xfe, 0xed, 0xfa, 0xcf, 0, 0, 0, 0]);
    const executableBytes = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0]);
    writeFileSync(path.join(dwarf, "Runner"), symbolBytes);
    writeFileSync(path.join(app, "Runner"), executableBytes);
    writeFileSync(path.join(archivedApp, "Runner"), executableBytes);
    let mismatchUuid = false;
    const uuid = "01234567-89AB-CDEF-0123-456789ABCDEF";
    const dwarfTool = ([command, file]) => {
      if (command === "--verify") {
        if (!readFileSync(file).equals(symbolBytes)) throw new Error("invalid DWARF");
        return "";
      }
      if (command === "--uuid") {
        const observed = mismatchUuid && file.startsWith(dwarf)
          ? "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA" : uuid;
        return `UUID: ${observed} (arm64) ${file}\n`;
      }
      throw new Error("unexpected DWARF command");
    };
    // Model plutil normalization: comments vanish from its output. The privacy
    // verifier must reject them in the original unsigned bytes nonetheless.
    const inspect = () => inspectXcarchive(archive, app, (file) =>
      readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, ""), {
      verifySignature() {}, dwarfTool,
    });
    const original = inspect();
    assert.equal(original.inspectedFileCount, 5);
    assert.equal(original.symbolFileCount, 1);
    for (const mutation of [
      symbolPlist().replace('<dict>', '<dict><!-- Jane Doe, 123 Main Street -->'),
      `${symbolPlist()}<!-- Jane Doe, 123 Main Street -->`,
      symbolPlist().replace('</dict>', '<key>RawReceiptText</key><string>Jane Doe, Milk 2.99</string></dict>'),
      symbolPlist().replace('</dict>', '<key>CFBundleVersion</key><string>1</string></dict>'),
      symbolPlist().replace('com.apple.xcode.dsym.com.tommytang213.settleora', 'com.apple.xcode.dsym.Jane.Doe'),
      symbolPlist().replace('<string>English</string>', '<string>Jane Doe</string>'),
      symbolPlist().replace('<string>dSYM</string>', '<string>Jane Doe</string>'),
      symbolPlist().replace('<string>1.0.0</string>', '<string>Milk 2.99</string>'),
      symbolPlist().replace('<string>1</string>', '<string><![CDATA[1]]></string>'),
      symbolPlist().replace('<string>1</string>', '<string>&#49;</string>'),
      symbolPlist().replace('<string>1</string>', '<dict/>'),
      plist(),
      Buffer.from('bplist00private metadata'),
      Buffer.concat([Buffer.from(symbolPlist()), Buffer.from([0xff])]),
      symbolPlist().replace('<dict>', `<dict>${' '.repeat(64 * 1024)}`),
    ]) {
      writeFileSync(symbolInfo, mutation);
      assert.throws(inspect, /unreviewed/);
    }
    writeFileSync(symbolInfo, symbolPlist().replace(
      'com.apple.xcode.dsym.com.tommytang213.settleora', 'com.apple.xcode.dsym.Runner'));
    assert.equal(inspect().symbolFileCount, 1);
    writeFileSync(symbolInfo, symbolPlist());
    assert.equal(inspect().archiveSha256, original.archiveSha256);
    mkdirSync(path.join(archive, "unreviewed-empty"));
    assert.throws(inspect, /unreviewed/);
    rmSync(path.join(archive, "unreviewed-empty"), { recursive: true });
    writeFileSync(path.join(archivedApp, "Info.plist"), `${plist()}altered`);
    assert.throws(inspect, /unreviewed/);
    writeFileSync(path.join(archivedApp, "Info.plist"), appPlist());
    writeFileSync(path.join(archive, "Info.plist"), `${plist()}<!-- hidden payload -->`);
    assert.throws(inspect, /unreviewed/);
    writeFileSync(path.join(archive, "Info.plist"),
      '<plist><dict><key>RawReceiptText</key><string>Jane Doe\nMilk 2.99</string></dict></plist>');
    assert.throws(inspect, /unreviewed/);
    writeFileSync(path.join(archive, "Info.plist"),
      '<plist><dict><key>Name</key><string>Runner</string><key>Name</key><string>Jane Doe</string></dict></plist>');
    assert.throws(inspect, /unreviewed/);
    writeFileSync(path.join(archive, "Info.plist"),
      '<plist><dict><key>ArchiveVersion</key><integer>2</integer><key>Name</key><string>Runner</string><key>SchemeName</key><string>Runner</string></dict></plist>');
    assert.notEqual(inspect().archiveSha256, original.archiveSha256);
    writeFileSync(path.join(archive, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>ApplicationProperties</key><dict>
<key>ApplicationPath</key><string>Applications/Runner.app</string>
<key>Architectures</key><array><string>arm64</string></array>
<key>CFBundleIdentifier</key><string>com.tommytang213.settleora</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>SigningIdentity</key><string>Apple Distribution: Example LLC (ABCDEFGHIJ)</string>
<key>Team</key><string>ABCDEFGHIJ</string>
</dict><key>ArchiveVersion</key><integer>2</integer>
<key>CreationDate</key><date>2026-10-14T00:00:00Z</date>
<key>Name</key><string>Runner</string><key>SchemeName</key><string>Runner</string>
</dict></plist>`);
    assert.equal(inspect().inspectedFileCount, original.inspectedFileCount);
    writeFileSync(path.join(archive, "Info.plist"), plist());
    writeFileSync(path.join(dwarf, "Runner"), Buffer.concat([
      symbolBytes, Buffer.from("PRIVATE_RECEIPT_TEXT_123"),
    ]));
    assert.throws(inspect, /unreviewed/);
    writeFileSync(path.join(dwarf, "Runner"), symbolBytes);
    mismatchUuid = true;
    assert.throws(inspect, /unreviewed/);
    mismatchUuid = false;
    writeFileSync(path.join(archive, "private-receipt.jpeg"), "receipt");
    assert.throws(inspect, /unreviewed/);
    rmSync(path.join(archive, "private-receipt.jpeg"));
    writeFileSync(path.join(dwarf, "Runner"), Buffer.concat([
      Buffer.from([0xfe, 0xed, 0xfa, 0xcf]), Buffer.from("receipt_ocr_real_provider_test"),
    ]));
    assert.throws(inspect, /unreviewed/);
    writeFileSync(path.join(dwarf, "Runner"), Buffer.from([0xfe, 0xed, 0xfa, 0xcf, 0]));
    writeFileSync(path.join(dwarf, "Runner"), Buffer.concat([
      Buffer.from([0xfe, 0xed, 0xfa, 0xcf]), Buffer.from("\nTOTAL $42.50\n"),
    ]));
    assert.throws(inspect, /unreviewed/);
    writeFileSync(path.join(dwarf, "Runner"), Buffer.from([0xfe, 0xed, 0xfa, 0xcf, 0]));
    symlinkSync("Info.plist", path.join(archive, "linked.plist"));
    assert.throws(inspect, /unreviewed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
