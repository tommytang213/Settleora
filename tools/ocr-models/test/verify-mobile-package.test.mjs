import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyMobilePackage } from "../verify-mobile-package.mjs";

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
    const apk = path.join(root, "app.apk");
    execFileSync("zip", ["-q", "-r", apk, "assets"], { cwd: packageRoot });
    assert.deepEqual(
      verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      { catalogFileCount: 1, modelFileCount: 1, fixtureFileCount: 102 },
    );

    writeFileSync(path.join(packageRoot, "assets/receipt_ocr_models/catalog.json"), "stale");
    rmSync(apk);
    execFileSync("zip", ["-q", "-r", apk, "assets"], { cwd: packageRoot });
    assert.throws(
      () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      /catalog identity/,
    );
    writeFileSync(path.join(packageRoot, "assets/receipt_ocr_models/catalog.json"), catalog);
    rmSync(apk);
    execFileSync("zip", ["-q", "-r", apk, "assets"], { cwd: packageRoot });

    const fixturePath = path.join(packageRoot, "assets/script/fixture-0.png");
    mkdirSync(path.dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, "fixture");
    execFileSync("zip", ["-q", "-u", apk, "assets/script/fixture-0.png"], { cwd: packageRoot });
    assert.throws(
      () => verifyMobilePackage({ platform: "android", packagePath: apk, repoRoot: root }),
      /contains acceptance fixture/,
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
    assert.deepEqual(
      verifyMobilePackage({ platform: "ios", packagePath: app, repoRoot: root }),
      { catalogFileCount: 1, modelFileCount: 1, fixtureFileCount: 102 },
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
