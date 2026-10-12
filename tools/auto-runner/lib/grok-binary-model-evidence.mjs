import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fullSha = /^[a-f0-9]{40}$/;
const maxRawDiffBytes = 16 * 1024 * 1024;

// The repository QA record reports a tensor check for these exact model bytes.
// This adapter verifies byte identity and catalog metadata, not the tensor graph.
// Adding another binary requires a reviewed entry, not a broader path wildcard.
export const pinnedRupeeRecoveryModel = Object.freeze({
  path: "apps/mobile/assets/receipt_ocr_models/ppocrv6-tiny-rec/inference.onnx",
  bytes: 4_462_639,
  sha256: "9ef676d6ed3c88256a2d92c640c44f25b0c40947e111b14b8be8f594091563e6",
  upstreamRepository: "PaddlePaddle/PP-OCRv6_tiny_rec_onnx",
  upstreamRevision: "2612ab37152ae0a677521bae4e1e3d4fb4cf7c30",
  upstreamFile: "inference.onnx",
  license: "Apache-2.0",
  catalogPath: "apps/mobile/assets/receipt_ocr_models/catalog.json",
  configPath: "apps/mobile/assets/receipt_ocr_models/ppocrv6-tiny-rec/inference.yml",
  configBytes: 55_571,
  configSha256: "66170210bad538e83fff3c4a3867e547d6bf20b50d64b20347c4b913f3034ea1",
  checkerVersion: "onnx 1.17.0",
  tensorContract: Object.freeze({ irVersion: 6, opset: 11, inputName: "x", inputChannels: 3,
    inputHeight: 48, outputName: "fetch_name_0", outputClasses: 6906, externalTensorData: false }),
  validationEvidencePath: "docs/qa/RECEIPT_OCR_RUPEE_RECOVERY_EVIDENCE.md",
  validationEvidenceSha256: "9ac8bbfc696d172c88432d124091b1ac90c4145a555e42c44cad2f85d8a1e725",
});

function gitRead(repoRoot, args, maxBuffer = 8 * 1024 * 1024) {
  return execFileSync("/usr/bin/git", args, { cwd: repoRoot, maxBuffer });
}

function fail(reason) { return { ok: false, reason }; }

function sameFiles(actual, expected) {
  const unique = (items) => [...new Set(items)].sort();
  return actual.length === expected.length && unique(actual).length === actual.length
    && unique(expected).length === expected.length
    && JSON.stringify(unique(actual)) === JSON.stringify(unique(expected));
}

// This is a review-only text projection. It never asserts that a reviewer saw
// ONNX tensor bytes. The original Git diff stays bound by its SHA-256 digest.
export function prepareGrokBinaryModelEvidence({ repoRoot, baseSha, headSha, changedFiles, diff,
  readGit = gitRead, model = pinnedRupeeRecoveryModel } = {}) {
  const raw = String(diff || "");
  if (!/^GIT binary patch$/m.test(raw) && !/^Binary files .+ differ$/m.test(raw)) {
    if (Array.isArray(changedFiles) && changedFiles.includes(model.path)) {
      return fail("blocked_grok_binary_model_patch_missing");
    }
    if (repoRoot && fullSha.test(baseSha || "") && fullSha.test(headSha || "")) {
      let canonicalText;
      try {
        canonicalText = readGit(repoRoot, ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--no-color",
          `${baseSha}...${headSha}`], maxRawDiffBytes + 1024).toString("utf8");
      } catch { return fail("blocked_grok_text_git_diff_unavailable"); }
      if (canonicalText !== raw) return fail("blocked_grok_text_diff_not_immutable_candidate");
    }
    return { ok: true, reviewDiff: raw, originalDiffSha256: sha256(raw), binaryArtifacts: [] };
  }
  if (!fullSha.test(baseSha || "") || !fullSha.test(headSha || "")
    || !Array.isArray(changedFiles) || Buffer.byteLength(raw) > maxRawDiffBytes) {
    return fail("blocked_grok_binary_candidate_identity_or_raw_size");
  }
  let canonical;
  try {
    canonical = readGit(repoRoot, ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--no-color",
      `${baseSha}...${headSha}`], maxRawDiffBytes + 1024).toString("utf8");
  } catch { return fail("blocked_grok_binary_git_diff_unavailable"); }
  if (canonical !== raw) return fail("blocked_grok_binary_diff_not_immutable_candidate");
  const blocks = raw.split(/(?=^diff --git )/m).filter(Boolean);
  const paths = blocks.map((block) => {
    const header = block.split(/\r?\n/, 1)[0];
    const match = header.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (!match || match[1].startsWith('"') || match[2].startsWith('"')) return null;
    if (match[1] !== match[2]
      && (!block.includes(`rename from ${match[1]}\n`) || !block.includes(`rename to ${match[2]}\n`))) return null;
    return match[2];
  });
  if (paths.some((entry) => !entry) || !sameFiles(paths, changedFiles)) {
    return fail("blocked_grok_binary_changed_path_coverage_mismatch");
  }
  const binaryBlocks = blocks.filter((block) => /^GIT binary patch$/m.test(block) || /^Binary files /m.test(block));
  if (binaryBlocks.length !== 1 || paths[blocks.indexOf(binaryBlocks[0])] !== model.path
    || !binaryBlocks[0].includes("GIT binary patch\n")
    || !binaryBlocks[0].includes(`literal ${model.bytes}\n`)
    || !binaryBlocks[0].includes("literal 0\n")
    || !binaryBlocks[0].includes("new file mode 100644\n")) {
    return fail("blocked_grok_binary_unapproved_or_unverified_patch");
  }
  let blob, config, catalog, catalogBytes, validationRecord;
  try {
    blob = readGit(repoRoot, ["show", `${headSha}:${model.path}`], model.bytes + 1024);
    config = readGit(repoRoot, ["show", `${headSha}:${model.configPath}`], 128 * 1024);
    catalogBytes = readGit(repoRoot, ["show", `${headSha}:${model.catalogPath}`], 512 * 1024);
    catalog = JSON.parse(catalogBytes.toString("utf8"));
    validationRecord = readGit(repoRoot, ["show", `${headSha}:${model.validationEvidencePath}`], 128 * 1024);
  } catch { return fail("blocked_grok_binary_model_evidence_unavailable"); }
  if (blob.length !== model.bytes || sha256(blob) !== model.sha256
    || config.length !== model.configBytes || sha256(config) !== model.configSha256) {
    return fail("blocked_grok_binary_model_hash_or_size_mismatch");
  }
  const validationText = validationRecord.toString("utf8");
  if (sha256(validationRecord) !== model.validationEvidenceSha256
    || !validationText.includes(model.sha256)
    || !validationText.includes(model.configSha256)
    || !validationText.includes(model.upstreamRevision)
    || !validationText.includes(`ONNX checker ${model.checkerVersion.replace(/^onnx /, "")} full validation passes`)
    || !validationText.includes("no external tensor data")) {
    return fail("blocked_grok_binary_prior_validation_record_mismatch");
  }
  const pack = Array.isArray(catalog?.packs) ? catalog.packs.find((entry) => entry?.assetDirectory
    === "assets/receipt_ocr_models/ppocrv6-tiny-rec") : null;
  const recordedFiles = pack?.files;
  const expectedInference = Object.fromEntries(Object.entries(model.tensorContract)
    .filter(([key]) => key !== "externalTensorData"));
  const inference = pack?.inference;
  const inferenceMatches = inference && typeof inference === "object" && !Array.isArray(inference)
    && Object.keys(inference).length === Object.keys(expectedInference).length
    && Object.entries(expectedInference).every(([key, value]) => inference[key] === value);
  if (pack?.sourceRepository !== model.upstreamRepository
    || pack?.modelVersion !== model.upstreamRevision || pack?.role !== "recognition_recovery"
    || pack?.recoveryPolicy !== "corroborated_rupee_money" || !inferenceMatches
    || !Array.isArray(recordedFiles) || recordedFiles.length !== 2
    || !recordedFiles.some((entry) => entry?.name === "inference.onnx"
      && entry.bytes === model.bytes && entry.sha256 === model.sha256)
    || !recordedFiles.some((entry) => entry?.name === "inference.yml"
      && entry.bytes === model.configBytes && entry.sha256 === model.configSha256)) {
    return fail("blocked_grok_binary_catalog_contract_mismatch");
  }
  const { checkerVersion, tensorContract, validationEvidencePath, validationEvidenceSha256, ...verifiedPin } = model;
  const artifact = { ...verifiedPin, gitBlobSha: null, coverage: "opaque_binary_integrity_only",
    priorValidationClaims: { checkerVersion, tensorContract, validationEvidencePath,
      validationEvidenceSha256 },
    limitations: "Reviewer cannot inspect ONNX tensor bytes as source text. Tensor shape and checker result are claims in the head-bound QA record for this exact SHA-256, not checks performed by this adapter; associated catalog, configuration, routing code, and tests still require review." };
  try { artifact.gitBlobSha = readGit(repoRoot, ["rev-parse", `${headSha}:${model.path}`], 1024).toString("utf8").trim(); }
  catch { return fail("blocked_grok_binary_git_blob_identity_unavailable"); }
  const computedGitBlobSha = createHash("sha1").update(`blob ${blob.length}\0`).update(blob).digest("hex");
  if (!fullSha.test(artifact.gitBlobSha) || artifact.gitBlobSha !== computedGitBlobSha) {
    return fail("blocked_grok_binary_git_blob_identity_unreadable");
  }
  const marker = [
    `diff --git a/${model.path} b/${model.path}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${model.path}`,
    "@@ -0,0 +1 @@",
    "+REVIEW-ONLY BINARY DESCRIPTOR: ONNX bytes are opaque; read binaryArtifacts in context.json. Do not claim tensor-byte inspection."
  ].join("\n") + "\n";
  const reviewDiff = blocks.map((block) => block === binaryBlocks[0] ? marker : block).join("");
  const supportingTextFiles = [
    { name: "model-config.yml", sourcePath: model.configPath, sha256: sha256(config), content: config.toString("utf8") },
    { name: "model-catalog.json", sourcePath: model.catalogPath,
      sha256: sha256(catalogBytes), content: catalogBytes.toString("utf8") },
    { name: "model-qa-record.md", sourcePath: validationEvidencePath,
      sha256: validationEvidenceSha256, content: validationText },
  ];
  return { ok: true, reviewDiff, originalDiffSha256: sha256(raw), binaryArtifacts: [artifact], supportingTextFiles,
    reviewDiffSha256: sha256(reviewDiff), transformed: true };
}
