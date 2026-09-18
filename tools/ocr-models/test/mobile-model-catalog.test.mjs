import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  catalogRelativePath,
  loadCatalog,
  verifyCatalog,
} from "../mobile-model-catalog.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test("committed mobile OCR catalog is pinned and internally consistent", async () => {
  const { catalog } = loadCatalog(repoRoot);
  assert.equal(catalog.distribution, "bundled_global_core");
  assert.equal(catalog.license, "Apache-2.0");
  assert.deepEqual(
    catalog.packs.flatMap((pack) => pack.routeScripts).filter((script) => script !== "Any").sort(),
    ["Arabic", "Cyrillic", "Devanagari", "HanSimplified", "HanTraditional", "Japanese", "Korean", "Latin", "Thai"],
  );
  const result = await verifyCatalog(repoRoot);
  assert.equal(result.ok, true, result.failures.join("\n"));
});

test("native semantic binding covers the exact provider execution path", () => {
  const { catalog } = loadCatalog(repoRoot);
  const expected = [
    "apps/mobile/integration_test/receipt_ocr_real_provider_test.dart",
    "apps/mobile/lib/app/app_bootstrap.dart",
    "apps/mobile/lib/app/server_mode_shell.dart",
    "apps/mobile/lib/bills/bill_list_screen.dart",
    "apps/mobile/lib/groups/group_list_screen.dart",
    "apps/mobile/lib/main.dart",
    "apps/mobile/lib/receipt_ocr_capture/receipt_ocr_provider.dart",
    "apps/mobile/lib/receipt_ocr_capture/paddle_receipt_ocr_provider.dart",
    "apps/mobile/lib/receipt_ocr_capture/receipt_ocr_preview.dart",
    "apps/mobile/lib/ui/settleora_form_fields.dart",
    "apps/mobile/pubspec.yaml",
    "apps/mobile/pubspec.lock",
    "apps/mobile/android/app/build.gradle.kts",
    "apps/mobile/android/app/proguard-rules.pro",
    "apps/mobile/android/app/src/release/kotlin/dev/flutter/plugins/integration_test/IntegrationTestPlugin.kt",
    "apps/mobile/android/gradle/verification-metadata.xml",
    "apps/mobile/android/settings.gradle.kts",
    "apps/mobile/android/app/src/androidTest/kotlin/com/example/mobile/ocr/ReceiptOcrCorpusInstrumentedTest.kt",
    "apps/mobile/android/app/src/main/kotlin/com/example/mobile/MainActivity.kt",
    "apps/mobile/android/app/src/main/kotlin/com/example/mobile/ocr/MobileOcrModelCatalog.kt",
    "apps/mobile/android/app/src/main/kotlin/com/example/mobile/ocr/ReceiptDocumentOrientation.kt",
    "apps/mobile/android/app/src/main/kotlin/com/example/mobile/ocr/SettleoraPaddleOcrEngine.kt",
    "apps/mobile/android/app/src/main/kotlin/com/example/mobile/ocr/ReceiptOrientationSelector.kt",
    "apps/mobile/android/app/src/main/kotlin/com/example/mobile/ocr/ScriptRouteSelector.kt",
    "apps/mobile/android/app/src/main/kotlin/com/example/mobile/ocr/RecognizedTextNormalizer.kt",
    "apps/mobile/android/app/src/main/kotlin/com/example/mobile/ocr/ReceiptBlockOrder.kt",
    "apps/mobile/android/app/src/main/kotlin/com/example/mobile/ocr/ReceiptOcrInputLimits.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/EngineConfig.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/PaddleOCRConfig.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/engine/DetectionEngine.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/engine/ORTSessionManager.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/model/ModelConfig.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/model/OCRBox.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/model/OCRError.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/postprocess/BoxSorter.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/preprocess/DetPreprocessor.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/preprocess/RecPreprocessor.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/postprocess/DBPostProcessor.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/postprocess/CTCDecoder.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/postprocess/PolygonUnclip.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/postprocess/QuadGeometry.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/postprocess/QuadTextCrop.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/util/BitmapUtils.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/util/ImageUtils.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/util/MathUtils.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/util/OpenCVUtils.kt",
    "apps/mobile/android/app/src/main/kotlin/com/paddle/ocr/util/YamlUtils.kt",
  ].sort();
  const actual = catalog.acceptanceContract.nativeSemantics.files
    .map((source) => source.path)
    .sort();
  assert.deepEqual(actual, expected);
});

test("verification rejects changed model bytes", async (t) => {
  const temporaryRoot = copyVerificationFixture(t, "settleora-ocr-catalog-");
  const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
  const pack = source.packs[0];
  const modelPath = path.join(
    temporaryRoot,
    "apps/mobile",
    pack.assetDirectory,
    pack.files[0].name,
  );
  const changed = readFileSync(modelPath);
  changed[0] ^= 0xff;
  writeFileSync(modelPath, changed);

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /sha256 mismatch/);
});

test("verification rejects a partial model pack", async (t) => {
  const temporaryRoot = copyVerificationFixture(t, "settleora-ocr-partial-");
  const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
  const pack = source.packs[0];
  for (const file of pack.files) {
    rmSync(path.join(temporaryRoot, "apps/mobile", pack.assetDirectory, file.name));
  }

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 4);
  assert.match(result.failures.join("\n"), /unexpected file inventory/);
  assert.match(result.failures.join("\n"), /inference\.onnx: missing/);
  assert.match(result.failures.join("\n"), /inference\.yml: missing/);
  assert.match(result.failures.join("\n"), /catalog total bytes/);
});

test("verification rejects unreviewed files in a model pack", async (t) => {
  const temporaryRoot = copyVerificationFixture(t, "settleora-ocr-extra-");
  const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
  const pack = source.packs[0];
  writeFileSync(
    path.join(temporaryRoot, "apps/mobile", pack.assetDirectory, "unreviewed.bin"),
    "unreviewed",
  );

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /unexpected file inventory/);
});

test("verification rejects Android packaging drift", async (t) => {
  const temporaryRoot = copyVerificationFixture(t, "settleora-ocr-gradle-");
  const gradlePath = path.join(temporaryRoot, "apps/mobile/android/app/build.gradle.kts");
  const gradle = readFileSync(gradlePath, "utf8").replace(
    '        getByName("main").assets.srcDir("../../assets")\n',
    "",
  );
  writeFileSync(gradlePath, gradle);

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /OCR asset inventory is not Android-scoped/);
});

test("verification rejects accidental shared iOS model packaging", async (t) => {
  const temporaryRoot = copyVerificationFixture(t, "settleora-ocr-pubspec-");
  const pubspecPath = path.join(temporaryRoot, "apps/mobile/pubspec.yaml");
  const pubspec = `${readFileSync(pubspecPath, "utf8")}\n  assets:\n    - assets/receipt_ocr_models/catalog.json\n`;
  writeFileSync(pubspecPath, pubspec);

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /Android OCR assets must not be shared with iOS/);
});

test("verification rejects changed runtime license bytes", async (t) => {
  const temporaryRoot = copyVerificationFixture(t, "settleora-ocr-license-bytes-");
  const licensePath = path.join(
    temporaryRoot,
    "apps/mobile/assets/receipt_ocr_models/LICENSE-ONNXRUNTIME-MIT.txt",
  );
  writeFileSync(licensePath, `${readFileSync(licensePath, "utf8")}changed\n`);

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /trusted legal artifact byte size mismatch/);
});

test("verification rejects drift in bound parser evidence", async (t) => {
  const temporaryRoot = copyVerificationFixture(t, "settleora-ocr-parser-");
  const parserPath = path.join(
    temporaryRoot,
    "apps/mobile/lib/receipt_ocr_capture/receipt_ocr_parser.dart",
  );
  writeFileSync(parserPath, `${readFileSync(parserPath, "utf8")}\n// drift\n`);

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /bound acceptance source sha256 mismatch/);
});

test("verification rejects drift in parser currency policy", async (t) => {
  const temporaryRoot = copyVerificationFixture(t, "settleora-ocr-currency-policy-");
  const policyPath = path.join(
    temporaryRoot,
    "apps/mobile/lib/ui/settleora_form_fields.dart",
  );
  writeFileSync(policyPath, `${readFileSync(policyPath, "utf8")}\n// drift\n`);

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /bound acceptance source sha256 mismatch/);
});

test("verification rejects drift in bound native OCR semantics", async (t) => {
  const temporaryRoot = copyVerificationFixture(t, "settleora-ocr-native-");
  const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
  const nativePath = path.join(
    temporaryRoot,
    source.acceptanceContract.nativeSemantics.files[0].path,
  );
  writeFileSync(nativePath, `${readFileSync(nativePath, "utf8")}\n// changed\n`);

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /bound acceptance source sha256 mismatch/);
});

test("catalog rejects incompatible runtime metadata", (t) => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "settleora-ocr-runtime-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
  source.runtimeCompatibility.androidBaseline = "onnxruntime-android latest";
  const catalogPath = path.join(temporaryRoot, catalogRelativePath);
  mkdirSync(path.dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, `${JSON.stringify(source)}\n`);

  assert.throws(() => loadCatalog(temporaryRoot), /Unsupported OCR runtime compatibility metadata/);
});

test("catalog rejects substituted provider, model, and ONNX metadata", (t) => {
  const mutations = [
    ["provider", (catalog) => { catalog.upstream.providerFamily = "OtherOCR"; }, /provider identity/],
    ["model", (catalog) => { catalog.packs[0].modelName = "substituted_det"; }, /trusted inventory/],
    ["opset", (catalog) => { catalog.packs[0].inference.opset = 15; }, /trusted inventory/],
    ["pack", (catalog) => { catalog.packs.pop(); }, /trusted inventory/],
  ];
  for (const [name, mutate, expected] of mutations) {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), `settleora-ocr-${name}-`));
    t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
    const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
    mutate(source);
    const catalogPath = path.join(temporaryRoot, catalogRelativePath);
    mkdirSync(path.dirname(catalogPath), { recursive: true });
    writeFileSync(catalogPath, `${JSON.stringify(source)}\n`);
    assert.throws(() => loadCatalog(temporaryRoot), expected);
  }
});

function copyVerificationFixture(t, prefix) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const paths = [
    "apps/mobile/assets/receipt_ocr_models",
    "apps/mobile/test/fixtures/receipt_ocr",
  ];
  for (const relativePath of paths) {
    cpSync(path.join(repoRoot, relativePath), path.join(temporaryRoot, relativePath), {
      recursive: true,
    });
  }
  for (const relativePath of [
    "apps/mobile/pubspec.yaml",
    "apps/mobile/lib/receipt_ocr_capture/receipt_image_artifact_processor.dart",
    "apps/mobile/lib/receipt_ocr_capture/receipt_image_normalization_policy.dart",
    "apps/mobile/lib/receipt_ocr_capture/receipt_ocr_parser.dart",
  ]) {
    const target = path.join(temporaryRoot, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(repoRoot, relativePath), target);
  }
  const catalog = JSON.parse(
    readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"),
  );
  for (const source of catalog.acceptanceContract.nativeSemantics.files) {
    const target = path.join(temporaryRoot, source.path);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(repoRoot, source.path), target);
  }
  return temporaryRoot;
}
