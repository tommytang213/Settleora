import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const vendorRoot = path.join(repoRoot, "packages/google_mlkit_commons");
const converterPath = "android/src/main/java/com/google_mlkit_commons/InputImageConverter.java";
const upstreamConverterSha256 = "0b67f1fbf0695209427c08d7e667fd144c5ff18b7c728c61d1bc669e376a0635";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const origin = () => JSON.parse(readFileSync(path.join(vendorRoot, "UPSTREAM.json"), "utf8"));

function filesIn(directory, prefix = "") {
  return readdirSync(directory).sort().flatMap((name) => {
    const relative = prefix ? `${prefix}/${name}` : name;
    const fullPath = path.join(directory, name);
    const stat = lstatSync(fullPath);
    assert.equal(stat.isSymbolicLink(), false, relative);
    if (stat.isDirectory()) return filesIn(fullPath, relative);
    assert.equal(stat.isFile(), true, relative);
    return [relative];
  });
}

test("MLKit vendor retains the complete pinned upstream archive and original license", () => {
  const manifest = origin();
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.package, "google_mlkit_commons");
  assert.equal(manifest.version, "0.11.1");
  assert.equal(manifest.archiveUrl, "https://pub.dev/api/archives/google_mlkit_commons-0.11.1.tar.gz");
  assert.equal(manifest.archiveSha256, "3e69fea4211727732cc385104e675ad1e40b29f12edd492ee52fa108423a6124");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.upstreamFiles.length, 22);
  const upstreamPaths = manifest.upstreamFiles.map((file) => file.path);
  assert.equal(new Set(upstreamPaths).size, 22);
  assert.deepEqual(filesIn(vendorRoot).sort(), [...upstreamPaths, "UPSTREAM.json", "SETTLEORA_PATCH.md"].sort());
  for (const file of manifest.upstreamFiles) {
    assert.match(file.path, /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./+\-]+$/);
    assert.match(file.sha256, /^[0-9a-f]{64}$/);
    if (file.path === converterPath) continue;
    const bytes = readFileSync(path.join(vendorRoot, file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(digest(bytes), file.sha256, file.path);
  }
  assert.equal(digest(readFileSync(path.join(vendorRoot, "LICENSE"))),
    "6700d9608ea7ce43670a704fb97f7a264319d77c8339dadd1c81e39f0c6af614");
});

test("converter delta is exactly two wildcard map types and removal of the obsolete suppression", () => {
  const manifest = origin();
  assert.equal(manifest.patches.length, 1);
  const patch = manifest.patches[0];
  assert.equal(patch.path, converterPath);
  assert.equal(patch.upstreamSha256, upstreamConverterSha256);
  const bytes = readFileSync(path.join(vendorRoot, converterPath));
  assert.equal(digest(bytes), patch.patchedSha256);
  let reconstructed = bytes.toString("utf8");
  assert.equal(reconstructed.includes('@SuppressWarnings("unchecked")'), false);
  for (const variable of ["metadataMap", "metaData"]) {
    const corrected = `Map<?, ?> ${variable} = (Map<?, ?>) imageData.get("metadata");`;
    const original = `Map<String, Object> ${variable} = (Map<String, Object>) imageData.get("metadata");`;
    assert.equal(reconstructed.split(corrected).length, 2);
    reconstructed = reconstructed.replace(corrected, original);
  }
  reconstructed = reconstructed.replace(
    '                    Map<String, Object> metaData =',
    '                    @SuppressWarnings("unchecked")\n                    Map<String, Object> metaData =',
  );
  assert.equal(digest(reconstructed), upstreamConverterSha256);
});

test("mobile resolves the pinned repository plugin and binds every vendored file", () => {
  const pubspec = readFileSync(path.join(repoRoot, "apps/mobile/pubspec.yaml"), "utf8");
  assert.match(pubspec, /dependency_overrides:\n  google_mlkit_commons:\n    path: \.\.\/\.\.\/packages\/google_mlkit_commons\n/);
  const lock = readFileSync(path.join(repoRoot, "apps/mobile/pubspec.lock"), "utf8");
  const block = lock.match(/^  google_mlkit_commons:\n([\s\S]*?)(?=^  \S|^sdks:)/m)?.[1];
  assert.ok(block, "commons dependency is locked");
  assert.match(block, /path: "\.\.\/\.\.\/packages\/google_mlkit_commons"/);
  assert.match(block, /relative: true/);
  assert.match(block, /source: path/);
  assert.match(block, /version: "0\.11\.1"/);
  const catalog = JSON.parse(readFileSync(path.join(repoRoot, "apps/mobile/assets/receipt_ocr_models/catalog.json"), "utf8"));
  const bindings = new Map(catalog.acceptanceContract.nativeSemantics.files.map((file) => [file.path, file.sha256]));
  for (const relative of filesIn(vendorRoot)) {
    assert.equal(bindings.get(`packages/google_mlkit_commons/${relative}`),
      digest(readFileSync(path.join(vendorRoot, relative))), relative);
  }
});
