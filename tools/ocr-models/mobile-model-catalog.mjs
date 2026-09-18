import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const catalogRelativePath = "apps/mobile/assets/receipt_ocr_models/catalog.json";
const mobileRelativePath = "apps/mobile";
const trustedCatalogSha256 = "1fa619c281e22dcf402d38ce9561a035347a446b3b210fb5106f95622af7d9f3";
const trustedLegalArtifacts = [
  { path: "assets/receipt_ocr_models/LICENSE-APACHE-2.0.txt", bytes: 11376, sha256: "3840c5c0c61c294264d2dd77b8777be6ddd90121ef4e0e64abcd22edea581d6e" },
  { path: "assets/receipt_ocr_models/LICENSE-ONNXRUNTIME-MIT.txt", bytes: 1073, sha256: "2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c" },
  { path: "assets/receipt_ocr_models/LICENSE-OPENCV-BSD-3-CLAUSE.txt", bytes: 2036, sha256: "b6ff3f1ec79c429ac916f4c5632251694603172383b7b6e35b9c4f04c61d971e" },
  { path: "assets/receipt_ocr_models/NOTICE.md", bytes: 2091, sha256: "80ccabe2819503308b4722867ca0312ca58afce83c8dd7c3da980b823f4857ca" },
];

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
  await verifyAcceptanceContract(repoRoot, catalog, failures);
  await verifyLegalArtifacts(repoRoot, failures);
  verifyAndroidAssetContract(repoRoot, failures);
  return { ok: failures.length === 0, failures, observedTotalBytes };
}

async function verifyLegalArtifacts(repoRoot, failures) {
  for (const artifact of trustedLegalArtifacts) {
    const relativePath = path.posix.join(mobileRelativePath, artifact.path);
    const filePath = path.join(repoRoot, relativePath);
    if (!existsSync(filePath) || !lstatSync(filePath).isFile()) {
      failures.push(`${relativePath}: trusted legal artifact missing`);
      continue;
    }
    const observedBytes = statSync(filePath).size;
    if (observedBytes !== artifact.bytes) {
      failures.push(`${relativePath}: trusted legal artifact byte size mismatch`);
      continue;
    }
    if (await sha256File(filePath) !== artifact.sha256) {
      failures.push(`${relativePath}: trusted legal artifact sha256 mismatch`);
    }
  }
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
  if (
    catalog.acceptanceContract?.status !== "pending_native_provider_acceptance" ||
    catalog.acceptanceContract?.fixtureCorpus?.treeDigestAlgorithm !==
      "sha256-of-sorted-sha256sum-v1" ||
    !Array.isArray(catalog.acceptanceContract?.nativeSemantics?.files) ||
    catalog.acceptanceContract.nativeSemantics.files.length === 0
  ) {
    throw new Error("Unsupported OCR acceptance evidence contract");
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

async function verifyAcceptanceContract(repoRoot, catalog, failures) {
  const contract = catalog.acceptanceContract;
  const corpus = contract.fixtureCorpus;
  const corpusRoot = path.join(repoRoot, corpus.path);
  const manifestPath = path.join(corpusRoot, "manifest.json");
  if (!existsSync(manifestPath)) {
    failures.push(`${corpus.path}/manifest.json: missing acceptance evidence`);
  } else {
    if (await sha256File(manifestPath) !== corpus.manifestSha256) {
      failures.push(`${corpus.path}/manifest.json: acceptance manifest sha256 mismatch`);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (
      manifest.schema_version !== corpus.schemaVersion ||
      manifest.fixtures?.length !== corpus.entryCount
    ) {
      failures.push(`${corpus.path}/manifest.json: acceptance schema/count mismatch`);
    }
    if (await sha256Tree(corpusRoot) !== corpus.treeSha256) {
      failures.push(`${corpus.path}: acceptance fixture tree sha256 mismatch`);
    }
  }

  for (const source of [
    ...contract.preprocessing.files,
    ...contract.nativeSemantics.files,
    contract.parser,
  ]) {
    const sourcePath = path.join(repoRoot, source.path);
    if (!existsSync(sourcePath) || !lstatSync(sourcePath).isFile()) {
      failures.push(`${source.path}: bound acceptance source missing`);
    } else if (await sha256File(sourcePath) !== source.sha256) {
      failures.push(`${source.path}: bound acceptance source sha256 mismatch`);
    }
  }
}

function verifyAndroidAssetContract(repoRoot, failures) {
  const pubspecPath = path.join(repoRoot, mobileRelativePath, "pubspec.yaml");
  if (!existsSync(pubspecPath)) {
    failures.push(`${mobileRelativePath}/pubspec.yaml: missing Flutter package declaration`);
    return;
  }
  const pubspec = readFileSync(pubspecPath, "utf8");
  if (/^    - assets\/receipt_ocr_models\//m.test(pubspec)) {
    failures.push(`${mobileRelativePath}/pubspec.yaml: Android OCR assets must not be shared with iOS`);
  }
  const gradlePath = path.join(repoRoot, mobileRelativePath, "android/app/build.gradle.kts");
  if (!existsSync(gradlePath)) {
    failures.push(`${mobileRelativePath}/android/app/build.gradle.kts: missing Android asset declaration`);
    return;
  }
  const gradle = readFileSync(gradlePath, "utf8");
  if (!gradle.includes('getByName("main").assets.srcDir("../../assets")')) {
    failures.push(`${mobileRelativePath}/android/app/build.gradle.kts: OCR asset inventory is not Android-scoped`);
  }
}

async function sha256Tree(root) {
  const relativeFiles = collectRelativeFiles(root).sort();
  const digest = createHash("sha256");
  for (const relativeFile of relativeFiles) {
    const fileSha256 = await sha256File(path.join(root, relativeFile));
    digest.update(`${fileSha256}  ./${relativeFile.split(path.sep).join("/")}\n`);
  }
  return digest.digest("hex");
}

function collectRelativeFiles(root, relativeDirectory = "") {
  const directory = path.join(root, relativeDirectory);
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativeEntry = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...collectRelativeFiles(root, relativeEntry));
    else if (entry.isFile()) files.push(relativeEntry);
    else throw new Error(`Acceptance fixture tree contains a non-regular entry: ${relativeEntry}`);
  }
  return files;
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
