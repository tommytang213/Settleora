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

test("committed mobile OCR catalog is pinned and internally consistent", () => {
  const { catalog } = loadCatalog(repoRoot);
  assert.equal(catalog.distribution, "bundled_global_core");
  assert.equal(catalog.license, "Apache-2.0");
  assert.deepEqual(
    catalog.packs.flatMap((pack) => pack.routeScripts).filter((script) => script !== "Any").sort(),
    ["Arabic", "Cyrillic", "Devanagari", "HanSimplified", "HanTraditional", "Japanese", "Korean", "Latin", "Thai"],
  );
});

test("verification rejects changed model bytes", async () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "settleora-ocr-catalog-"));
  const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
  const pack = source.packs[0];
  cpSync(
    path.join(repoRoot, "apps/mobile/assets/receipt_ocr_models"),
    path.join(temporaryRoot, "apps/mobile/assets/receipt_ocr_models"),
    { recursive: true },
  );
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

test("verification rejects a partial model pack", async () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "settleora-ocr-partial-"));
  const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
  const pack = source.packs[0];
  cpSync(
    path.join(repoRoot, "apps/mobile/assets/receipt_ocr_models"),
    path.join(temporaryRoot, "apps/mobile/assets/receipt_ocr_models"),
    { recursive: true },
  );
  for (const file of pack.files) {
    rmSync(path.join(temporaryRoot, "apps/mobile", pack.assetDirectory, file.name));
  }

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 3);
  assert.match(result.failures.join("\n"), /inference\.onnx: missing/);
  assert.match(result.failures.join("\n"), /inference\.yml: missing/);
  assert.match(result.failures.join("\n"), /catalog total bytes/);
});

test("catalog rejects incompatible runtime metadata", () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "settleora-ocr-runtime-"));
  const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
  source.runtimeCompatibility.androidBaseline = "onnxruntime-android latest";
  const catalogPath = path.join(temporaryRoot, catalogRelativePath);
  mkdirSync(path.dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, `${JSON.stringify(source)}\n`);

  assert.throws(() => loadCatalog(temporaryRoot), /Unsupported OCR runtime compatibility metadata/);
});

test("catalog rejects substituted provider, model, and ONNX metadata", () => {
  const mutations = [
    ["provider", (catalog) => { catalog.upstream.providerFamily = "OtherOCR"; }, /provider identity/],
    ["model", (catalog) => { catalog.packs[0].modelName = "substituted_det"; }, /trusted inventory/],
    ["opset", (catalog) => { catalog.packs[0].inference.opset = 15; }, /trusted inventory/],
    ["pack", (catalog) => { catalog.packs.pop(); }, /trusted inventory/],
  ];
  for (const [name, mutate, expected] of mutations) {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), `settleora-ocr-${name}-`));
    const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
    mutate(source);
    const catalogPath = path.join(temporaryRoot, catalogRelativePath);
    mkdirSync(path.dirname(catalogPath), { recursive: true });
    writeFileSync(catalogPath, `${JSON.stringify(source)}\n`);
    assert.throws(() => loadCatalog(temporaryRoot), expected);
  }
});
