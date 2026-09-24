import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyMobilePackage } from "../verify-mobile-package.mjs";
import { expectedAndroidNonOcrEntries } from "../android-production-entry-inventory.mjs";
import { trustedLegalArtifacts } from "../mobile-model-catalog.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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
    for (const entry of expectedAndroidNonOcrEntries) {
      const filePath = path.join(packageRoot, entry);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, "reviewed-package-placeholder");
    }
    const packageTopLevelPaths = [...new Set([
      "assets",
      ...expectedAndroidNonOcrEntries.map((entry) => entry.split("/")[0]),
    ])];
    const apk = path.join(root, "app.apk");
    execFileSync("zip", ["-q", "-X", "-D", "-r", apk, ...packageTopLevelPaths], { cwd: packageRoot });
    assert.deepEqual(
      verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      { catalogFileCount: 1, modelFileCount: 1, fixtureFileCount: 102 },
    );

    writeFileSync(path.join(packageRoot, "assets/receipt_ocr_models/catalog.json"), "stale");
    rmSync(apk);
    execFileSync("zip", ["-q", "-X", "-D", "-r", apk, ...packageTopLevelPaths], { cwd: packageRoot });
    assert.throws(
      () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      /catalog identity/,
    );
    writeFileSync(path.join(packageRoot, "assets/receipt_ocr_models/catalog.json"), catalog);
    rmSync(apk);
    execFileSync("zip", ["-q", "-X", "-D", "-r", apk, ...packageTopLevelPaths], { cwd: packageRoot });

    const extraModel = path.join(packageRoot, "assets/receipt_ocr_models/test-pack/unlisted.onnx");
    writeFileSync(extraModel, "unreviewed");
    execFileSync("zip", ["-q", "-X", "-u", apk, "assets/receipt_ocr_models/test-pack/unlisted.onnx"], { cwd: packageRoot });
    assert.throws(
      () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      /inventory differs from the catalog/,
    );
    rmSync(extraModel);
    rmSync(apk);
    execFileSync("zip", ["-q", "-X", "-D", "-r", apk, ...packageTopLevelPaths], { cwd: packageRoot });

    const fixturePath = path.join(packageRoot, "assets/script/fixture-0.png");
    mkdirSync(path.dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, "fixture");
    execFileSync("zip", ["-q", "-X", "-u", apk, "assets/script/fixture-0.png"], { cwd: packageRoot });
    assert.throws(
      () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      /contains acceptance fixture/,
    );
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
    ]) {
      rmSync(apk);
      execFileSync("zip", ["-q", "-X", "-D", "-r", apk, ...packageTopLevelPaths], { cwd: packageRoot });
      const privatePath = path.join(packageRoot, privateEntry);
      mkdirSync(path.dirname(privatePath), { recursive: true });
      writeFileSync(privatePath, "PRIVATE_RECEIPT_TEXT_123");
      execFileSync("zip", ["-q", "-X", "-u", apk, privateEntry], { cwd: packageRoot });
      assert.throws(
        () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
        /contains an unreviewed entry path/,
      );
      rmSync(privatePath);
    }
    rmSync(apk);
    execFileSync("zip", ["-q", "-X", "-D", "-r", apk, ...packageTopLevelPaths], { cwd: packageRoot });
    const hiddenDirectory = "assets/receipt_ocr_models/private/";
    mkdirSync(path.join(packageRoot, hiddenDirectory), { recursive: true });
    execFileSync("zip", ["-q", "-X", "-u", apk, hiddenDirectory], { cwd: packageRoot });
    assert.throws(
      () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      /unverified directory entry|entry metadata is unreviewed/,
    );
    rmSync(apk);
    execFileSync("zip", ["-q", "-X", "-D", "-r", apk, ...packageTopLevelPaths], { cwd: packageRoot });
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
    assert.throws(
      () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      /duplicate entry names/,
    );
    rmSync(apk);
    execFileSync("zip", ["-q", "-D", "-r", apk, ...packageTopLevelPaths], { cwd: packageRoot });
    assert.throws(
      () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      /entry metadata is unreviewed/,
    );
    rmSync(apk);
    execFileSync("zip", ["-q", "-X", "-D", "-r", apk, ...packageTopLevelPaths], { cwd: packageRoot });
    const listed = readFileSync(apk);
    const listedEocd = listed.length - 22;
    const listedCentral = listed.readUInt32LE(listedEocd + 16);
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
      listed.subarray(0, listedCentral),
      unlistedLocal,
      listed.subarray(listedCentral),
    ]);
    withHiddenLocal.writeUInt32LE(listedCentral + unlistedLocal.length, withHiddenLocal.length - 6);
    writeFileSync(apk, withHiddenLocal);
    assert.throws(
      () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      /unreviewed bytes before the central directory/,
    );
    rmSync(apk);
    execFileSync("zip", ["-q", "-X", "-D", "-r", apk, ...packageTopLevelPaths], { cwd: packageRoot });
    const mismatchedHeader = readFileSync(apk);
    mismatchedHeader.writeUInt32LE(mismatchedHeader.readUInt32LE(14) ^ 1, 14);
    writeFileSync(apk, mismatchedHeader);
    assert.throws(
      () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      /local metadata is unreviewed/,
    );
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
