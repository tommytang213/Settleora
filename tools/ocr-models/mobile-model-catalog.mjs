import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const catalogRelativePath = "apps/mobile/assets/receipt_ocr_models/catalog.json";
const mobileRelativePath = "apps/mobile";

export function loadCatalog(repoRoot) {
  const catalogPath = path.join(repoRoot, catalogRelativePath);
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  validateCatalogShape(catalog);
  return { catalog, catalogPath };
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyCatalog(repoRoot) {
  const { catalog } = loadCatalog(repoRoot);
  const failures = [];
  let observedTotalBytes = 0;

  for (const pack of catalog.packs) {
    for (const file of pack.files) {
      const relativePath = path.posix.join(mobileRelativePath, pack.assetDirectory, file.name);
      const filePath = path.join(repoRoot, relativePath);
      if (!existsSync(filePath)) {
        failures.push(`${relativePath}: missing`);
        continue;
      }
      const observedBytes = statSync(filePath).size;
      observedTotalBytes += observedBytes;
      if (observedBytes !== file.bytes) {
        failures.push(`${relativePath}: bytes expected=${file.bytes} actual=${observedBytes}`);
        continue;
      }
      const observedSha256 = await sha256File(filePath);
      if (observedSha256 !== file.sha256) {
        failures.push(`${relativePath}: sha256 mismatch`);
      }
    }
  }

  if (observedTotalBytes !== catalog.totalBundledBytes) {
    failures.push(
      `catalog total bytes expected=${catalog.totalBundledBytes} actual=${observedTotalBytes}`,
    );
  }
  return { ok: failures.length === 0, failures, observedTotalBytes };
}

export function sourceUrl(pack, file) {
  return `https://huggingface.co/${pack.sourceRepository}/resolve/${pack.modelVersion}/${file.name}`;
}

function validateCatalogShape(catalog) {
  if (catalog.schemaVersion !== 1) throw new Error("Unsupported OCR model catalog schema");
  if (catalog.runtimeFormat !== "onnx") throw new Error("OCR model catalog must use ONNX");
  if (catalog.distribution !== "bundled_global_core") {
    throw new Error("Mobile OCR catalog must be bundled Global Core");
  }
  if (catalog.license !== "Apache-2.0") throw new Error("Unexpected OCR model license");
  if (
    catalog.runtimeCompatibility?.androidBaseline !== "onnxruntime-android 1.21.1" ||
    catalog.runtimeCompatibility?.iosBaseline !== "onnxruntime-objc 1.24.x" ||
    catalog.runtimeCompatibility?.executionProviderBaseline !== "CPU"
  ) {
    throw new Error("Unsupported OCR runtime compatibility metadata");
  }
  if (!Number.isSafeInteger(catalog.totalBundledBytes) || catalog.totalBundledBytes <= 0) {
    throw new Error("Invalid OCR model catalog byte total");
  }
  if (!Array.isArray(catalog.packs) || catalog.packs.length === 0) {
    throw new Error("OCR model catalog has no packs");
  }
  const packIds = new Set();
  for (const pack of catalog.packs) {
    if (!pack.modelPackId || packIds.has(pack.modelPackId)) {
      throw new Error(`Invalid or duplicate model pack id: ${pack.modelPackId}`);
    }
    packIds.add(pack.modelPackId);
    if (!/^PaddlePaddle\/[A-Za-z0-9_.-]+$/.test(pack.sourceRepository)) {
      throw new Error(`Model pack ${pack.modelPackId} has an untrusted source repository`);
    }
    if (!/^[0-9a-f]{40}$/.test(pack.modelVersion)) {
      throw new Error(`Model pack ${pack.modelPackId} is not revision-pinned`);
    }
    if (
      !/^assets\/receipt_ocr_models\/[a-z0-9-]+$/.test(pack.assetDirectory) ||
      !["detection", "recognition"].includes(pack.role) ||
      !Array.isArray(pack.routeScripts) ||
      pack.routeScripts.length === 0
    ) {
      throw new Error(`Model pack ${pack.modelPackId} has invalid routing metadata`);
    }
    validateInference(pack);
    if (!Array.isArray(pack.files) || pack.files.length !== 2) {
      throw new Error(`Model pack ${pack.modelPackId} must contain ONNX and YAML files`);
    }
    if (pack.files.map((file) => file.name).sort().join(",") !== "inference.onnx,inference.yml") {
      throw new Error(`Model pack ${pack.modelPackId} has an unexpected file inventory`);
    }
    for (const file of pack.files) {
      if (
        !/^[0-9a-f]{64}$/.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes <= 0
      ) {
        throw new Error(`Model pack ${pack.modelPackId} has invalid file metadata`);
      }
    }
  }
}

function validateInference(pack) {
  const inference = pack.inference;
  if (
    !Number.isSafeInteger(inference?.irVersion) ||
    !Number.isSafeInteger(inference?.opset) ||
    inference?.inputName !== "x" ||
    inference?.inputChannels !== 3 ||
    inference?.outputName !== "fetch_name_0"
  ) {
    throw new Error(`Model pack ${pack.modelPackId} has incompatible inference metadata`);
  }
  if (pack.role === "detection") {
    if (inference.inputHeight !== "dynamic" || inference.outputChannels !== 1) {
      throw new Error(`Detection pack ${pack.modelPackId} has incompatible tensor metadata`);
    }
  } else if (
    inference.inputHeight !== 48 ||
    !Number.isSafeInteger(inference.outputClasses) ||
    inference.outputClasses <= 1
  ) {
    throw new Error(`Recognition pack ${pack.modelPackId} has incompatible tensor metadata`);
  }
}
