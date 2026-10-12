import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { prepareGrokBinaryModelEvidence } from "../lib/grok-binary-model-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);
const path = "apps/mobile/assets/receipt_ocr_models/ppocrv6-tiny-rec/inference.onnx";
const configPath = "apps/mobile/assets/receipt_ocr_models/ppocrv6-tiny-rec/inference.yml";
const catalogPath = "apps/mobile/assets/receipt_ocr_models/catalog.json";
const modelBytes = Buffer.from("synthetic opaque ONNX model bytes");
const configBytes = Buffer.from("synthetic model configuration\n");
const tensorContract = { irVersion: 6, opset: 11, inputName: "x", inputChannels: 3,
  inputHeight: 48, outputName: "fetch_name_0", outputClasses: 6906, externalTensorData: false };
const model = { path, bytes: modelBytes.length, sha256: sha256(modelBytes),
  upstreamRepository: "PaddlePaddle/PP-OCRv6_tiny_rec_onnx", upstreamRevision: "c".repeat(40),
  catalogPath, configPath, configBytes: configBytes.length, configSha256: sha256(configBytes), tensorContract };
const catalog = { packs: [{ assetDirectory: "assets/receipt_ocr_models/ppocrv6-tiny-rec",
  sourceRepository: model.upstreamRepository, modelVersion: model.upstreamRevision,
  role: "recognition_recovery", recoveryPolicy: "corroborated_rupee_money",
  inference: Object.fromEntries(Object.entries(tensorContract).filter(([key]) => key !== "externalTensorData")),
  files: [{ name: "inference.onnx", bytes: model.bytes, sha256: model.sha256 },
    { name: "inference.yml", bytes: model.configBytes, sha256: model.configSha256 }] }] };
const binaryPatch = `diff --git a/${path} b/${path}\nnew file mode 100644\nindex 0000000..1111111\nGIT binary patch\nliteral ${model.bytes}\nSYNTHETIC_BASE85_PAYLOAD\n\nliteral 0\nHcmV?d00001\n\n`;
const textPatch = "diff --git a/src/consumer.js b/src/consumer.js\n--- a/src/consumer.js\n+++ b/src/consumer.js\n@@ -1 +1 @@\n-old\n+new\n";
const diff = binaryPatch + textPatch;
const changedFiles = [path, "src/consumer.js"];

function fixture(overrides = {}) {
  const candidate = overrides.diff ?? diff;
  const gitValues = new Map([
    [`diff --binary --no-ext-diff --no-textconv --no-color ${baseSha}...${headSha}`, Buffer.from(overrides.canonicalDiff ?? diff)],
    [`show ${headSha}:${path}`, overrides.modelBytes ?? modelBytes],
    [`show ${headSha}:${configPath}`, configBytes],
    [`show ${headSha}:${catalogPath}`, Buffer.from(JSON.stringify(overrides.catalog ?? catalog))],
    [`rev-parse ${headSha}:${path}`, Buffer.from(`${"d".repeat(40)}\n`)],
  ]);
  return prepareGrokBinaryModelEvidence({ repoRoot: "/synthetic", baseSha, headSha,
    changedFiles: overrides.changedFiles ?? changedFiles, diff: candidate, model,
    readGit: (_root, args) => {
      const result = gitValues.get(args.join(" "));
      if (!result) throw Error("unavailable synthetic Git object");
      return result;
    } });
}

test("Grok binary projection binds all paths to immutable Git objects and keeps model bytes opaque", () => {
  const result = fixture();
  assert.equal(result.ok, true);
  assert.equal(result.originalDiffSha256, sha256(diff));
  assert.equal(result.reviewDiffSha256, sha256(result.reviewDiff));
  assert.deepEqual(result.binaryArtifacts.map((entry) => entry.path), [path]);
  assert.match(result.reviewDiff, /REVIEW-ONLY BINARY DESCRIPTOR/);
  assert.match(result.reviewDiff, /src\/consumer.js/);
  assert.doesNotMatch(result.reviewDiff, /SYNTHETIC_BASE85_PAYLOAD/);
  assert.equal(result.binaryArtifacts[0].coverage, "opaque_binary_integrity_only");
});

test("Grok binary projection fails closed on altered diff, path list, or catalog", () => {
  assert.equal(fixture({ diff: diff.replace("+new", "+tampered") }).reason,
    "blocked_grok_binary_diff_not_immutable_candidate");
  assert.equal(fixture({ changedFiles: [path] }).reason,
    "blocked_grok_binary_changed_path_coverage_mismatch");
  assert.equal(fixture({ catalog: { ...catalog, packs: [{ ...catalog.packs[0], files: [] }] } }).reason,
    "blocked_grok_binary_catalog_contract_mismatch");
  assert.equal(fixture({ modelBytes: Buffer.from("same size but a different payload!") }).reason,
    "blocked_grok_binary_model_hash_or_size_mismatch");
  const extraBinary = diff + binaryPatch;
  assert.equal(fixture({ diff: extraBinary, canonicalDiff: extraBinary,
    changedFiles: [...changedFiles, path] }).reason,
  "blocked_grok_binary_changed_path_coverage_mismatch");
  const unrelatedPatch = binaryPatch.replaceAll(path, "src/unapproved.bin");
  const unrelatedDiff = diff + unrelatedPatch;
  assert.equal(fixture({ diff: unrelatedDiff, canonicalDiff: unrelatedDiff,
    changedFiles: [...changedFiles, "src/unapproved.bin"] }).reason,
    "blocked_grok_binary_unapproved_or_unverified_patch");
});
