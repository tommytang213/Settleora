import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectIosAssetCatalogInfo } from "../verify-ios-asset-catalog.mjs";
import { inspectXcarchive } from "../verify-ios-xcarchive.mjs";

const plist = () => "<?xml version=\"1.0\"?><plist><dict/></plist>";

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
    writeFileSync(path.join(app, "Info.plist"), plist());
    writeFileSync(path.join(archivedApp, "Info.plist"), plist());
    writeFileSync(path.join(archive, "Info.plist"), plist());
    writeFileSync(path.join(archive, "dSYMs/Runner.app.dSYM/Contents/Info.plist"), plist());
    writeFileSync(path.join(dwarf, "Runner"), Buffer.from([0xfe, 0xed, 0xfa, 0xcf, 0, 0, 0, 0]));
    const inspect = () => inspectXcarchive(archive, app, (file) => readFileSync(file, "utf8"));
    const original = inspect();
    assert.equal(original.inspectedFileCount, 4);
    mkdirSync(path.join(archive, "unreviewed-empty"));
    assert.throws(inspect, /unreviewed/);
    rmSync(path.join(archive, "unreviewed-empty"), { recursive: true });
    writeFileSync(path.join(archivedApp, "Info.plist"), `${plist()}altered`);
    assert.throws(inspect, /unreviewed/);
    writeFileSync(path.join(archivedApp, "Info.plist"), plist());
    writeFileSync(path.join(dwarf, "Runner"), Buffer.from([0xfe, 0xed, 0xfa, 0xcf, 1, 0, 0, 0]));
    assert.notEqual(inspect().archiveSha256, original.archiveSha256);
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
