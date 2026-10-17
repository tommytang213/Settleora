import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { reviewedSourceTreeFingerprint, verifyAndroidSignature, verifyMobilePackage } from "../verify-mobile-package.mjs";
import { trustedLegalArtifacts } from "../mobile-model-catalog.mjs";
import { repoRootForCli, withPackageContract } from "./package-contract-fixture.mjs";

// Independently runnable checks that do not construct or verify an Android package.
// Android archive/signature integration remains in verify-mobile-package.test.mjs.
test("APK signer rejects missing and same-size altered jar bytes", () => {
  assert.throws(() => verifyAndroidSignature("ignored.apk", Buffer.alloc(1)), /toolchain is unreviewed/);
  assert.throws(() => verifyAndroidSignature("ignored.apk", Buffer.alloc(1074241)), /toolchain is unreviewed/);
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

    for (const extra of ['Private purchase 42', 'test-pack/Private purchase 42']) {
      const directory = path.join(app, 'receipt_ocr_models', extra);
      mkdirSync(directory, { recursive: true });
      assert.throws(() => verifyMobilePackage({ platform: 'ios', packagePath: app, repoRoot: root }), /inventory/);
      rmSync(directory, { recursive: true });
      assert.equal(verifyMobilePackage({ platform: 'ios', packagePath: app, repoRoot: root }).modelFileCount, 1);
    }

    writeFileSync(modelPath, Buffer.concat([model, Buffer.from("unreviewed")]));
    assert.throws(
      () => verifyMobilePackage({ platform: "ios", packagePath: app, repoRoot: root }),
      /model size differs from the catalog/,
    );
    writeFileSync(modelPath, model);

    const legalArtifact = trustedLegalArtifacts[0];
    const packagedLegalPath = path.join(app, legalArtifact.path.replace(/^assets\//, ""));
    const legalBytes = readFileSync(packagedLegalPath);
    writeFileSync(packagedLegalPath, Buffer.concat([legalBytes, Buffer.from("unreviewed")]));
    assert.throws(
      () => verifyMobilePackage({ platform: "ios", packagePath: app, repoRoot: root }),
      /legal artifact size differs from the catalog/,
    );
    writeFileSync(packagedLegalPath, legalBytes);
    writeFileSync(packagedLegalPath, "stale");
    assert.throws(
      () => verifyMobilePackage({ platform: "ios", packagePath: app, repoRoot: root }),
      /legal artifact size differs from the catalog/,
    );
    writeFileSync(
      packagedLegalPath,
      readFileSync(path.join(root, "apps/mobile", legalArtifact.path)),
    );

    writeFileSync(path.join(app, "receipt_ocr_models/catalog.json"), "stale");
    assert.throws(
      () => verifyMobilePackage({ platform: "ios", packagePath: app, repoRoot: root }),
      /catalog size differs from the catalog/,
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

test("source fingerprint excludes inventory-only commits and binds tracked source and HEAD", () => {
  withPackageContract(({ root, git, sourceSha }) => {
    const originalFingerprint = reviewedSourceTreeFingerprint(root, sourceSha);
    writeFileSync(path.join(root, "tools/ocr-models/android-production-entry-inventory.mjs"), "new digest pin");
    git("add", "tools/ocr-models/android-production-entry-inventory.mjs");
    git("commit", "-qm", "add digest pin");
    const inventoryOnlySha = git("rev-parse", "HEAD");
    assert.equal(reviewedSourceTreeFingerprint(root, inventoryOnlySha), originalFingerprint);
    writeFileSync(path.join(root, "apps/mobile/lib/source.dart"), "changed application source");
    git("add", "apps/mobile/lib/source.dart");
    git("commit", "-qm", "change application source");
    const changedSourceSha = git("rev-parse", "HEAD");
    assert.notEqual(reviewedSourceTreeFingerprint(root, changedSourceSha), originalFingerprint);
    assert.throws(() => reviewedSourceTreeFingerprint(root, sourceSha), /source commit differs from checkout/);
  });
});
