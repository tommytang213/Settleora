import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const catalogRelativePath = "apps/mobile/assets/receipt_ocr_models/catalog.json";
const mobileRelativePath = "apps/mobile";
const trustedCatalogSha256 = "1dfde4b54ae2d7ee890a7e09bacf45ad6a9dbee0c04a276b2eeef20fe2b3e9b9";

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
    const packDirectory = path.join(repoRoot, mobileRelativePath, pack.assetDirectory);
    if (existsSync(packDirectory)) {
      const expectedNames = pack.files.map((file) => file.name).sort();
      const entries = readdirSync(packDirectory, { withFileTypes: true });
      const observedNames = entries.map((entry) => entry.name).sort();
      if (
        entries.some((entry) => !entry.isFile()) ||
        observedNames.join(",") !== expectedNames.join(",")
      ) {
        failures.push(
          `${path.posix.join(mobileRelativePath, pack.assetDirectory)}: unexpected file inventory`,
        );
      }
    }
    for (const file of pack.files) {
      const relativePath = path.posix.join(mobileRelativePath, pack.assetDirectory, file.name);
      const filePath = path.join(repoRoot, relativePath);
      if (!existsSync(filePath)) {
        failures.push(`${relativePath}: missing`);
        continue;
      }
      if (!lstatSync(filePath).isFile()) {
        failures.push(`${relativePath}: must be a regular file`);
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
    verifyConfigurationContract(repoRoot, pack, failures);
  }

  if (observedTotalBytes !== catalog.totalBundledBytes) {
    failures.push(
      `catalog total bytes expected=${catalog.totalBundledBytes} actual=${observedTotalBytes}`,
    );
  }
  return { ok: failures.length === 0, failures, observedTotalBytes };
}

function validateCatalogShape(catalog) {
  if (catalog.schemaVersion !== 1) throw new Error("Unsupported OCR model catalog schema");
  if (
    catalog.catalogId !== "settleora-mobile-ocr-global-core" ||
    catalog.catalogVersion !== "2026.09.18.1"
  ) {
    throw new Error("Unexpected OCR model catalog identity");
  }
  if (catalog.runtimeFormat !== "onnx") throw new Error("OCR model catalog must use ONNX");
  if (catalog.distribution !== "bundled_global_core") {
    throw new Error("Mobile OCR catalog must be bundled Global Core");
  }
  if (catalog.license !== "Apache-2.0") throw new Error("Unexpected OCR model license");
  if (
    catalog.upstream?.organization !== "PaddlePaddle" ||
    catalog.upstream?.providerFamily !== "PaddleOCR" ||
    catalog.upstream?.catalog !== "https://huggingface.co/PaddlePaddle"
  ) {
    throw new Error("Unexpected OCR model provider identity");
  }
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
  const observedCatalogSha256 = createHash("sha256").update(canonicalJson(catalog)).digest("hex");
  if (observedCatalogSha256 !== trustedCatalogSha256) {
    throw new Error("OCR model catalog does not match the reviewed trusted inventory");
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

function verifyConfigurationContract(repoRoot, pack, failures) {
  const configPath = path.join(repoRoot, mobileRelativePath, pack.assetDirectory, "inference.yml");
  if (!existsSync(configPath)) return;
  const config = readFileSync(configPath, "utf8");
  const modelName = config.match(/^  model_name: (.+)$/m)?.[1];
  if (modelName !== pack.modelName) {
    failures.push(`${pack.assetDirectory}/inference.yml: model_name does not match catalog`);
  }
  if (pack.role === "detection") {
    if (!/^  name: DBPostProcess$/m.test(config)) {
      failures.push(`${pack.assetDirectory}/inference.yml: unsupported detection postprocess`);
    }
    return;
  }
  if (!/^  name: CTCLabelDecode$/m.test(config)) {
    failures.push(`${pack.assetDirectory}/inference.yml: unsupported recognition postprocess`);
  }
  const dictionaryStart = config.search(/^  character_dict:\s*$/m);
  const dictionary = dictionaryStart < 0
    ? []
    : config.slice(dictionaryStart).split("\n").filter((line) => line.startsWith("  - "));
  if (dictionary.length + 2 !== pack.inference.outputClasses) {
    failures.push(
      `${pack.assetDirectory}/inference.yml: dictionary/classes expected=${pack.inference.outputClasses} actual=${dictionary.length + 2}`,
    );
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
