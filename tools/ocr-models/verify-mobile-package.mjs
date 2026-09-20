import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const maxInventoryBytes = 32 * 1024 * 1024;
const maxModelBytes = 64 * 1024 * 1024;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function safeRelativePath(value, name) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    path.posix.isAbsolute(value) ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${name} is not a safe relative path`);
  }
  return value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectedPackageContract(repoRoot) {
  const catalogPath = path.join(repoRoot, "apps/mobile/assets/receipt_ocr_models/catalog.json");
  const catalogBytes = readFileSync(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const manifest = readJson(path.join(repoRoot, "apps/mobile/test/fixtures/receipt_ocr/manifest.json"));
  const models = catalog.packs.flatMap((pack, packIndex) =>
    pack.files.map((file, fileIndex) => ({
      relativePath: safeRelativePath(
        `${pack.assetDirectory}/${file.name}`,
        `catalog.packs[${packIndex}].files[${fileIndex}]`,
      ),
      bytes: file.bytes,
      sha256: file.sha256,
    })),
  );
  const fixtures = [
    "manifest.json",
    ...manifest.fixtures.map((fixture, index) =>
      safeRelativePath(fixture.file, `manifest.fixtures[${index}].file`)),
  ];
  return {
    catalog: {
      relativePath: "assets/receipt_ocr_models/catalog.json",
      bytes: catalogBytes.length,
      sha256: sha256(catalogBytes),
    },
    models,
    fixtures,
  };
}

function validateModel(bytes, expected, name) {
  if (!Number.isSafeInteger(expected.bytes) || expected.bytes <= 0) {
    throw new Error(`${name} has an invalid catalog byte count`);
  }
  if (!/^[0-9a-f]{64}$/.test(expected.sha256)) {
    throw new Error(`${name} has an invalid catalog digest`);
  }
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw new Error(`${name} does not match the catalog identity`);
  }
}

function assertExactModelInventory(actualEntries, expectedEntries) {
  const actual = [...actualEntries].sort();
  const expected = [...expectedEntries].sort();
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error("Production package model inventory differs from the catalog");
  }
}

function iosModelInventory(modelRoot) {
  const files = [];
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error("Production iOS app model inventory contains a symbolic link");
      }
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relativePath);
      else if (entry.isFile()) files.push(relativePath);
      else throw new Error("Production iOS app model inventory contains an unsupported entry");
    }
  };
  visit(modelRoot);
  return files;
}

function verifyAndroidPackage(packagePath, contract, runCommand) {
  const inventory = runCommand("unzip", ["-Z1", packagePath], {
    encoding: "utf8",
    maxBuffer: maxInventoryBytes,
  });
  const entries = new Set(inventory.split(/\r?\n/).filter(Boolean));
  const packagedModels = inventory
    .split(/\r?\n/)
    .filter((entry) => entry.startsWith("assets/receipt_ocr_models/") && !entry.endsWith("/"));
  assertExactModelInventory(
    packagedModels,
    [contract.catalog.relativePath, ...contract.models.map((model) => model.relativePath)],
  );
  if (!entries.has(contract.catalog.relativePath)) {
    throw new Error(`Production APK is missing ${contract.catalog.relativePath}`);
  }
  validateModel(
    runCommand("unzip", ["-p", packagePath, contract.catalog.relativePath], {
      encoding: "buffer",
      maxBuffer: maxModelBytes,
    }),
    contract.catalog,
    contract.catalog.relativePath,
  );
  for (const model of contract.models) {
    const entry = model.relativePath;
    if (!entries.has(entry)) throw new Error(`Production APK is missing ${entry}`);
    const bytes = runCommand("unzip", ["-p", packagePath, entry], {
      encoding: "buffer",
      maxBuffer: maxModelBytes,
    });
    validateModel(bytes, model, entry);
  }
  for (const fixture of contract.fixtures) {
    const entry = `assets/${fixture}`;
    if (entries.has(entry)) throw new Error(`Production APK contains acceptance fixture ${entry}`);
  }
}

function verifyIosPackage(packagePath, contract) {
  const modelRoot = path.join(packagePath, "receipt_ocr_models");
  const modelRootStat = lstatSync(modelRoot);
  if (!modelRootStat.isDirectory() || modelRootStat.isSymbolicLink()) {
    throw new Error("Production iOS app model root is not a real directory");
  }
  assertExactModelInventory(
    iosModelInventory(modelRoot),
    [
      "catalog.json",
      ...contract.models.map((model) => model.relativePath.replace(/^assets\/receipt_ocr_models\//, "")),
    ],
  );
  const catalogRelativePath = contract.catalog.relativePath.slice("assets/".length);
  const catalogFilePath = path.join(packagePath, ...catalogRelativePath.split("/"));
  const catalogStat = lstatSync(catalogFilePath);
  if (!catalogStat.isFile() || catalogStat.isSymbolicLink()) {
    throw new Error("Production iOS app catalog is not a regular file");
  }
  validateModel(readFileSync(catalogFilePath), contract.catalog, contract.catalog.relativePath);
  for (const model of contract.models) {
    const packagedRelativePath = model.relativePath.startsWith("assets/")
      ? model.relativePath.slice("assets/".length)
      : model.relativePath;
    const filePath = path.join(packagePath, ...packagedRelativePath.split("/"));
    const stat = lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Production iOS app model is not a regular file: ${model.relativePath}`);
    }
    validateModel(readFileSync(filePath), model, model.relativePath);
  }
  for (const fixture of contract.fixtures) {
    const filePath = path.join(packagePath, "receipt_ocr_acceptance", ...fixture.split("/"));
    try {
      lstatSync(filePath);
      throw new Error(`Production iOS app contains acceptance fixture ${fixture}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

export function verifyMobilePackage({ platform, packagePath, repoRoot, runCommand = execFileSync }) {
  if (!new Set(["android", "ios"]).has(platform)) throw new Error("Platform is invalid");
  const contract = expectedPackageContract(repoRoot);
  if (contract.models.length === 0 || contract.fixtures.length !== 102) {
    throw new Error("Catalog or immutable fixture contract is incomplete");
  }
  if (platform === "android") verifyAndroidPackage(packagePath, contract, runCommand);
  else verifyIosPackage(packagePath, contract);
  return {
    catalogFileCount: 1,
    modelFileCount: contract.models.length,
    fixtureFileCount: contract.fixtures.length,
  };
}

function parseArgs(values) {
  return Object.fromEntries(values.map((value) => {
    const separator = value.indexOf("=");
    if (!value.startsWith("--") || separator < 3) throw new Error(`Expected --name=value, got ${value}`);
    return [value.slice(2, separator), value.slice(separator + 1)];
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = verifyMobilePackage({
      platform: args.platform,
      packagePath: path.resolve(args.package),
      repoRoot: path.resolve(args["repo-root"] ?? "."),
    });
    if (args.json === "true") {
      console.log(JSON.stringify(result));
    } else {
      console.log(`Verified ${args.platform} production package: catalog identity; ${result.modelFileCount} catalog model files; ${result.fixtureFileCount} acceptance fixture paths absent`);
    }
  } catch {
    console.error("Production package verification failed: package contract mismatch");
    process.exitCode = 1;
  }
}
