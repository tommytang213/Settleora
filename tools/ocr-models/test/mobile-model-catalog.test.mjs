import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  source.packs = [{
    ...pack,
    files: [
      { ...pack.files[0], bytes: 7 },
      { ...pack.files[1], bytes: 6 },
    ],
  }];
  source.totalBundledBytes = 13;
  const catalogPath = path.join(temporaryRoot, catalogRelativePath);
  mkdirSync(path.dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, `${JSON.stringify(source)}\n`);
  const modelPath = path.join(
    temporaryRoot,
    "apps/mobile",
    pack.assetDirectory,
    pack.files[0].name,
  );
  mkdirSync(path.dirname(modelPath), { recursive: true });
  writeFileSync(modelPath, "changed");
  writeFileSync(path.join(path.dirname(modelPath), pack.files[1].name), "config");

  const result = await verifyCatalog(temporaryRoot);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /sha256 mismatch/);
});

test("verification rejects a partial model pack", async () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "settleora-ocr-partial-"));
  const source = JSON.parse(readFileSync(path.join(repoRoot, catalogRelativePath), "utf8"));
  source.packs = [source.packs[0]];
  source.totalBundledBytes = source.packs[0].files.reduce((total, file) => total + file.bytes, 0);
  const catalogPath = path.join(temporaryRoot, catalogRelativePath);
  mkdirSync(path.dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, `${JSON.stringify(source)}\n`);

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
