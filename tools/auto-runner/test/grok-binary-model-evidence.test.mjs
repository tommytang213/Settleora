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
const qaRecord = `Model ${sha256(modelBytes)}, configuration ${sha256(configBytes)}, revision ${"c".repeat(40)}; ONNX checker 1.17.0 full validation passes; no external tensor data.`;
const tensorContract = { irVersion: 6, opset: 11, inputName: "x", inputChannels: 3,
  inputHeight: 48, outputName: "fetch_name_0", outputClasses: 6906, externalTensorData: false };
const model = { path, bytes: modelBytes.length, sha256: sha256(modelBytes),
  upstreamRepository: "PaddlePaddle/PP-OCRv6_tiny_rec_onnx", upstreamRevision: "c".repeat(40),
  catalogPath, configPath, configBytes: configBytes.length, configSha256: sha256(configBytes),
  checkerVersion: "onnx 1.17.0", validationEvidencePath: "docs/qa/model-evidence.md",
  validationEvidenceSha256: sha256(qaRecord), tensorContract };
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
    [`show ${headSha}:${model.validationEvidencePath}`, Buffer.from(overrides.validationRecord ?? qaRecord)],
    [`rev-parse ${headSha}:${path}`, Buffer.from(`${overrides.gitBlobSha ?? createHash("sha1").update(`blob ${modelBytes.length}\0`).update(modelBytes).digest("hex")}\n`)],
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
  assert.equal(result.binaryArtifacts[0].priorValidationClaims.checkerVersion, "onnx 1.17.0");
  assert.equal(result.binaryArtifacts[0].tensorContract, undefined);
  assert.deepEqual(result.supportingTextFiles.map((entry) => entry.name),
    ["model-config.yml", "model-catalog.json", "model-qa-record.md"]);
});

test("Grok binary projection fails closed on altered diff, path list, or catalog", () => {
  assert.equal(fixture({ diff: diff.replace("+new", "+tampered") }).reason,
    "blocked_grok_binary_diff_not_immutable_candidate");
  assert.equal(fixture({ changedFiles: [path] }).reason,
    "blocked_grok_binary_changed_path_coverage_mismatch");
  assert.equal(fixture({ catalog: { ...catalog, packs: [{ ...catalog.packs[0], files: [] }] } }).reason,
    "blocked_grok_binary_catalog_contract_mismatch");
  assert.equal(fixture({ catalog: { packs: [] } }).reason,
    "blocked_grok_binary_catalog_contract_mismatch");
  assert.equal(fixture({ catalog: { packs: [catalog.packs[0], catalog.packs[0]] } }).reason,
    "blocked_grok_binary_catalog_contract_mismatch");
  const reversedInference = Object.fromEntries(Object.entries(catalog.packs[0].inference).reverse());
  assert.equal(fixture({ catalog: { packs: [{ ...catalog.packs[0], inference: reversedInference }] } }).ok, true);
  assert.equal(fixture({ validationRecord: "No model verification recorded" }).reason,
    "blocked_grok_binary_prior_validation_record_mismatch");
  assert.equal(fixture({ gitBlobSha: "d".repeat(40) }).reason,
    "blocked_grok_binary_git_blob_identity_unreadable");
  const alteredBytes = Buffer.from(modelBytes);
  alteredBytes[0] ^= 1;
  assert.equal(alteredBytes.length, modelBytes.length);
  assert.equal(fixture({ modelBytes: alteredBytes }).reason,
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

test("text changes mentioning the Git binary marker remain ordinary text", () => {
  const textOnly = "diff --git a/src/example.js b/src/example.js\n--- a/src/example.js\n+++ b/src/example.js\n@@ -0,0 +1 @@\n+GIT binary patch\n";
  const result = prepareGrokBinaryModelEvidence({ diff: textOnly, changedFiles: ["src/example.js"], allowSynthetic: true });
  assert.equal(result.ok, true);
  assert.equal(result.reviewDiff, textOnly);
  assert.deepEqual(result.binaryArtifacts, []);
  assert.equal(prepareGrokBinaryModelEvidence({ changedFiles: [path], diff: textOnly }).reason,
    "blocked_grok_binary_model_patch_missing");
  assert.equal(prepareGrokBinaryModelEvidence({ repoRoot: "/synthetic", baseSha, headSha,
    changedFiles: ["src/example.js"], diff: textOnly,
    readGit: () => Buffer.from("different canonical diff") }).reason,
  "blocked_grok_text_diff_not_immutable_candidate");
  assert.equal(prepareGrokBinaryModelEvidence({ repoRoot: "/synthetic", baseSha, headSha,
    changedFiles: ["src/other.js"], diff: textOnly,
    readGit: () => Buffer.from(textOnly) }).reason,
  "blocked_grok_text_changed_path_coverage_mismatch");
  assert.equal(prepareGrokBinaryModelEvidence({ changedFiles: ["src/example.js"], diff: textOnly }).reason,
    "blocked_grok_text_candidate_identity_missing");
});

test("uncommitted text review binds the exact working-tree snapshot and blocks binary additions", () => {
  const textDiff = "diff --git a/src/old.js b/src/old.js\n--- a/src/old.js\n+++ b/src/old.js\n@@ -1 +1 @@\n-old\n+new\n";
  const args = { repoRoot: "/synthetic", changedFiles: ["src/old.js"], diff: textDiff,
    workingTreeReview: true, workingTreeDiff: textDiff };
  assert.equal(prepareGrokBinaryModelEvidence(args).ok, true);
  assert.equal(prepareGrokBinaryModelEvidence({ ...args, workingTreeDiff: "stale" }).reason,
    "blocked_grok_working_tree_diff_mismatch");
  assert.equal(prepareGrokBinaryModelEvidence({ ...args, diff: binaryPatch,
    changedFiles: [path], workingTreeDiff: binaryPatch }).reason,
  "blocked_grok_binary_working_tree_requires_commit");
});

test("an unrelated rename preserves destination path coverage beside the model", () => {
  const rename = "diff --git a/src/old.js b/src/new.js\nsimilarity index 100%\nrename from src/old.js\nrename to src/new.js\n";
  const candidate = binaryPatch + rename;
  const result = fixture({ diff: candidate, canonicalDiff: candidate, changedFiles: [path, "src/new.js"] });
  assert.equal(result.ok, true);
  assert.match(result.reviewDiff, /rename to src\/new.js/);
});
