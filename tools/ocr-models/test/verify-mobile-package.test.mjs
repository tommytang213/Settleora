import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyAndroidSignature, verifyMobilePackage } from "../verify-mobile-package.mjs";
import { expectedAndroidNonOcrEntries } from "../android-production-entry-inventory.mjs";
import { trustedLegalArtifacts } from "../mobile-model-catalog.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("APK signer rejects missing and same-size altered jar bytes", () => {
  assert.throws(() => verifyAndroidSignature("ignored.apk", Buffer.alloc(1)), /toolchain is unreviewed/);
  assert.throws(() => verifyAndroidSignature("ignored.apk", Buffer.alloc(1074241)), /toolchain is unreviewed/);
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb88320);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function signingPair(id, value) {
  const header = Buffer.alloc(12);
  header.writeBigUInt64LE(BigInt(value.length + 4), 0);
  header.writeUInt32LE(id, 8);
  return Buffer.concat([header, value]);
}

function syntheticSigningBlock(extraPair = null) {
  const pairs = Buffer.concat([
    signingPair(0x7109871a, Buffer.from("synthetic-v2-signer")),
    ...(extraPair == null ? [] : [extraPair]),
    signingPair(0x42726577, Buffer.alloc(8)),
  ]);
  const size = BigInt(pairs.length + 24);
  const head = Buffer.alloc(8);
  const footer = Buffer.alloc(8);
  head.writeBigUInt64LE(size);
  footer.writeBigUInt64LE(size);
  return Buffer.concat([head, pairs, footer, Buffer.from("APK Sig Block 42")]);
}

function writeSyntheticApk(apk, packageRoot, { unsigned = false, firstLocalExtra = Buffer.alloc(0),
  extraEntries = [], extraSigningPair = null } = {}) {
  const entries = [];
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), name);
      else if (entry.isFile()) entries.push({ name, data: readFileSync(path.join(directory, entry.name)) });
    }
  };
  visit(packageRoot);
  entries.push(...expectedAndroidNonOcrEntries.map((name) => ({
    name, data: Buffer.from("reviewed-package-placeholder"),
  })));
  entries.push(...extraEntries);
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const local = [];
  const central = [];
  let localOffset = 0;
  for (const [index, entry] of entries.entries()) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data ?? "");
    const extra = index === 0 ? firstLocalExtra : Buffer.alloc(0);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0821, 10);
    localHeader.writeUInt16LE(0x0221, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(extra.length, 28);
    local.push(localHeader, name, extra, data);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0821, 12);
    centralHeader.writeUInt16LE(0x0221, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    central.push(centralHeader, name);
    localOffset += 30 + name.length + extra.length + data.length;
  }
  const block = unsigned ? Buffer.alloc(0) : syntheticSigningBlock(extraSigningPair);
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(localOffset + block.length, 16);
  writeFileSync(apk, Buffer.concat([...local, block, directory, end]));
}

function withPackageContract(callback) {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-mobile-package-"));
  const model = Buffer.from("model-bytes");
  try {
    mkdirSync(path.join(root, "apps/mobile/assets/receipt_ocr_models"), { recursive: true });
    mkdirSync(path.join(root, "apps/mobile/test/fixtures/receipt_ocr"), { recursive: true });
    const catalog = Buffer.from(JSON.stringify({
        packs: [{
          assetDirectory: "assets/receipt_ocr_models/test-pack",
          files: [{ name: "model.onnx", bytes: model.length, sha256: sha256(model) }],
        }],
      }));
    writeFileSync(path.join(root, "apps/mobile/assets/receipt_ocr_models/catalog.json"), catalog);
    for (const artifact of trustedLegalArtifacts) {
      const bytes = readFileSync(path.join(repoRootForCli(), "apps/mobile", artifact.path));
      writeFileSync(path.join(root, "apps/mobile", artifact.path), bytes);
    }
    writeFileSync(
      path.join(root, "apps/mobile/test/fixtures/receipt_ocr/manifest.json"),
      JSON.stringify({ fixtures: Array.from({ length: 101 }, (_, index) => ({ file: `script/fixture-${index}.png` })) }),
    );
    callback({ root, model, catalog });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("verifies the catalog, every model, and concrete fixture absence in Android APKs", () => {
  withPackageContract(({ root, model, catalog }) => {
    const packageRoot = path.join(root, "android-package");
    const modelPath = path.join(packageRoot, "assets/receipt_ocr_models/test-pack/model.onnx");
    mkdirSync(path.dirname(modelPath), { recursive: true });
    writeFileSync(modelPath, model);
    writeFileSync(path.join(packageRoot, "assets/receipt_ocr_models/catalog.json"), catalog);
    for (const artifact of trustedLegalArtifacts) {
      writeFileSync(
        path.join(packageRoot, artifact.path),
        readFileSync(path.join(root, "apps/mobile", artifact.path)),
      );
    }
    const apk = path.join(root, "app.apk");
    let signatureChecks = 0;
    const verifyTestPackage = () => verifyMobilePackage({
      platform: "android", packagePath: apk, repoRoot: root,
      verifySignature: () => { signatureChecks += 1; },
    });
    writeSyntheticApk(apk, packageRoot);
    assert.deepEqual(verifyTestPackage(),
      { catalogFileCount: 1, modelFileCount: 1, fixtureFileCount: 102 });
    assert.equal(signatureChecks, 1);
    assert.throws(() => verifyMobilePackage({
      platform: "android", packagePath: apk, repoRoot: root,
      verifySignature: () => { throw new Error("signature verification failed"); },
    }), /signature verification failed/);

    writeFileSync(path.join(packageRoot, "assets/receipt_ocr_models/catalog.json"), "stale");
    writeSyntheticApk(apk, packageRoot);
    assert.throws(verifyTestPackage, /catalog identity/);
    writeFileSync(path.join(packageRoot, "assets/receipt_ocr_models/catalog.json"), catalog);

    const extraModel = path.join(packageRoot, "assets/receipt_ocr_models/test-pack/unlisted.onnx");
    writeFileSync(extraModel, "unreviewed");
    writeSyntheticApk(apk, packageRoot);
    assert.throws(verifyTestPackage, /inventory differs from the catalog/);
    rmSync(extraModel);

    const fixturePath = path.join(packageRoot, "assets/script/fixture-0.png");
    mkdirSync(path.dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, "fixture");
    writeSyntheticApk(apk, packageRoot);
    assert.throws(verifyTestPackage, /contains acceptance fixture/);
    rmSync(fixturePath);

    for (const privateEntry of [
      "assets/private-receipt.log",
      "assets/receipt_ocr_acceptance/extra.jpeg",
      "assets/private/scan.bin",
      "assets/fixtures/scan.png",
      "assets/ocr-output.json",
      "assets/receipt_ocr_fixtures/sample.bin",
      "assets/receipt_ocr_testdata/sample.bin",
      "res/raw/receipt_corpus.dat",
      "res/raw/a.dat",
      "META-INF/payload.bin",
    ]) {
      const privatePath = path.join(packageRoot, privateEntry);
      mkdirSync(path.dirname(privatePath), { recursive: true });
      writeFileSync(privatePath, "PRIVATE_RECEIPT_TEXT_123");
      writeSyntheticApk(apk, packageRoot);
      assert.throws(verifyTestPackage, /contains an unreviewed entry path/);
      rmSync(privatePath);
    }

    writeSyntheticApk(apk, packageRoot, {
      extraEntries: [{ name: "assets/receipt_ocr_models/private/" }],
    });
    assert.throws(verifyTestPackage, /unverified directory entry/);

    writeSyntheticApk(apk, packageRoot);
    const original = readFileSync(apk);
    const eocd = original.length - 22;
    const centralOffset = original.readUInt32LE(eocd + 16);
    const centralSize = original.readUInt32LE(eocd + 12);
    const firstEntryLength = 46 + original.readUInt16LE(centralOffset + 28) +
      original.readUInt16LE(centralOffset + 30) + original.readUInt16LE(centralOffset + 32);
    const duplicate = Buffer.concat([
      original.subarray(0, eocd),
      original.subarray(centralOffset, centralOffset + firstEntryLength),
      original.subarray(eocd),
    ]);
    duplicate.writeUInt16LE(original.readUInt16LE(eocd + 10) + 1, duplicate.length - 12);
    duplicate.writeUInt16LE(original.readUInt16LE(eocd + 8) + 1, duplicate.length - 14);
    duplicate.writeUInt32LE(centralSize + firstEntryLength, duplicate.length - 10);
    writeFileSync(apk, duplicate);
    assert.throws(verifyTestPackage, /duplicate entry names/);

    writeSyntheticApk(apk, packageRoot, { firstLocalExtra: Buffer.from([1, 2, 3, 4]) });
    assert.throws(verifyTestPackage, /local metadata is unreviewed/);
    writeSyntheticApk(apk, packageRoot, { unsigned: true });
    assert.throws(verifyTestPackage, /signing block is required/);
    writeSyntheticApk(apk, packageRoot);
    const changedLocalTime = readFileSync(apk);
    changedLocalTime.writeUInt16LE(0, 10);
    writeFileSync(apk, changedLocalTime);
    assert.throws(verifyTestPackage, /local metadata is unreviewed/);
    writeSyntheticApk(apk, packageRoot);
    const changedCentralDate = readFileSync(apk);
    changedCentralDate.writeUInt16LE(0, changedCentralDate.readUInt32LE(changedCentralDate.length - 6) + 14);
    writeFileSync(apk, changedCentralDate);
    assert.throws(verifyTestPackage, /local metadata is unreviewed/);
    writeSyntheticApk(apk, packageRoot, {
      extraSigningPair: signingPair(0x504b4453, Buffer.from("PRIVATE_RECEIPT_TEXT_123")),
    });
    assert.throws(verifyTestPackage, /signing pair is unreviewed/);

    writeSyntheticApk(apk, packageRoot);
    const listed = readFileSync(apk);
    const listedEocd = listed.length - 22;
    const listedCentral = listed.readUInt32LE(listedEocd + 16);
    const listedBlockSize = Number(listed.readBigUInt64LE(listedCentral - 24));
    const listedBlockStart = listedCentral - listedBlockSize - 8;
    const hiddenName = Buffer.from("assets/private/scan.bin");
    const hiddenBytes = Buffer.from("PRIVATE_RECEIPT_TEXT_123");
    const hiddenHeader = Buffer.alloc(30);
    hiddenHeader.writeUInt32LE(0x04034b50, 0);
    hiddenHeader.writeUInt16LE(20, 4);
    hiddenHeader.writeUInt32LE(hiddenBytes.length, 18);
    hiddenHeader.writeUInt32LE(hiddenBytes.length, 22);
    hiddenHeader.writeUInt16LE(hiddenName.length, 26);
    const unlistedLocal = Buffer.concat([hiddenHeader, hiddenName, hiddenBytes]);
    const withHiddenLocal = Buffer.concat([
      listed.subarray(0, listedBlockStart),
      unlistedLocal,
      listed.subarray(listedBlockStart),
    ]);
    withHiddenLocal.writeUInt32LE(listedCentral + unlistedLocal.length, withHiddenLocal.length - 6);
    writeFileSync(apk, withHiddenLocal);
    assert.throws(verifyTestPackage, /signing block bounds disagree/);

    writeSyntheticApk(apk, packageRoot);
    const mismatchedHeader = readFileSync(apk);
    mismatchedHeader.writeUInt32LE(mismatchedHeader.readUInt32LE(14) ^ 1, 14);
    writeFileSync(apk, mismatchedHeader);
    assert.throws(verifyTestPackage, /local metadata is unreviewed/);
  });
});

test("verifies the catalog, every model, and concrete fixture absence in iOS apps", () => {
  withPackageContract(({ root, model, catalog }) => {
    const app = path.join(root, "Runner.app");
    const modelPath = path.join(app, "receipt_ocr_models/test-pack/model.onnx");
    mkdirSync(path.dirname(modelPath), { recursive: true });
    writeFileSync(modelPath, model);
    writeFileSync(path.join(app, "receipt_ocr_models/catalog.json"), catalog);
    for (const artifact of trustedLegalArtifacts) {
      writeFileSync(
        path.join(app, artifact.path.replace(/^assets\//, "")),
        readFileSync(path.join(root, "apps/mobile", artifact.path)),
      );
    }

    const extraModel = path.join(app, "receipt_ocr_models/test-pack/unlisted.onnx");
    writeFileSync(extraModel, "unreviewed");
    assert.throws(
      () => verifyMobilePackage({ platform: "ios", packagePath: app, repoRoot: root }),
      /inventory differs from the catalog/,
    );
    rmSync(extraModel);
    assert.deepEqual(
      verifyMobilePackage({ platform: "ios", packagePath: app, repoRoot: root }),
      { catalogFileCount: 1, modelFileCount: 1, fixtureFileCount: 102 },
    );

    const legalArtifact = trustedLegalArtifacts[0];
    const packagedLegalPath = path.join(app, legalArtifact.path.replace(/^assets\//, ""));
    writeFileSync(packagedLegalPath, "stale");
    assert.throws(
      () => verifyMobilePackage({ platform: "ios", packagePath: app, repoRoot: root }),
      /catalog identity/,
    );
    writeFileSync(
      packagedLegalPath,
      readFileSync(path.join(root, "apps/mobile", legalArtifact.path)),
    );

    writeFileSync(path.join(app, "receipt_ocr_models/catalog.json"), "stale");
    assert.throws(
      () => verifyMobilePackage({ platform: "ios", packagePath: app, repoRoot: root }),
      /catalog identity/,
    );
    writeFileSync(path.join(app, "receipt_ocr_models/catalog.json"), catalog);

    const fixturePath = path.join(app, "receipt_ocr_acceptance/script/fixture-0.png");
    mkdirSync(path.dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, "fixture");
    assert.throws(
      () => verifyMobilePackage({ platform: "ios", packagePath: app, repoRoot: root }),
      /contains acceptance fixture/,
    );
  });
});

test("CLI reports bounded package-verification failures without local paths", () => {
  withPackageContract(({ root }) => {
    const missingPackage = path.join(root, "private-build-root/Runner.app");
    const result = spawnSync(process.execPath, [
      path.join(repoRootForCli(), "tools/ocr-models/verify-mobile-package.mjs"),
      "--platform=ios",
      `--package=${missingPackage}`,
      `--repo-root=${root}`,
    ], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "Production package verification failed: package contract mismatch\n");
    assert.equal(result.stderr.includes(root), false);
  });
});

function repoRootForCli() {
  return path.resolve(import.meta.dirname, "../../..");
}
