import { lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedDevPlugins = new Set(["integration_test"]);
const generatedRegistrants = [
  "android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java",
  "ios/Runner/GeneratedPluginRegistrant.h",
  "ios/Runner/GeneratedPluginRegistrant.m",
];

function removeGeneratedRegistrants(projectRoot) {
  for (const relativePath of generatedRegistrants) {
    const registrantPath = path.join(projectRoot, ...relativePath.split("/"));
    const stat = lstatSync(registrantPath, { throwIfNoEntry: false });
    if (stat == null) continue;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
      throw new Error(`Generated Flutter plugin registrant is unsafe: ${relativePath}`);
    }
    unlinkSync(registrantPath);
  }
}

export function prepareProductionFlutterPlugins(filePath, { requireIntegrationTest = false } = {}) {
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 4 * 1024 * 1024) {
    throw new Error("Flutter plugin metadata must be a bounded regular file");
  }
  const metadata = JSON.parse(readFileSync(filePath, "utf8"));
  if (
    metadata == null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
    metadata.plugins == null ||
    typeof metadata.plugins !== "object" ||
    !Array.isArray(metadata.dependencyGraph)
  ) {
    throw new Error("Flutter plugin metadata has an invalid shape");
  }

  const removed = new Set();
  for (const [platform, plugins] of Object.entries(metadata.plugins)) {
    if (!Array.isArray(plugins)) throw new Error(`Flutter ${platform} plugins are invalid`);
    metadata.plugins[platform] = plugins.filter((plugin) => {
      if (plugin == null || typeof plugin !== "object" || typeof plugin.name !== "string") {
        throw new Error(`Flutter ${platform} plugin identity is invalid`);
      }
      if (plugin.dev_dependency !== true) return true;
      if (!allowedDevPlugins.has(plugin.name)) {
        throw new Error(`Unreviewed dev plugin cannot enter the production projection: ${plugin.name}`);
      }
      removed.add(plugin.name);
      return false;
    });
  }
  if (requireIntegrationTest && !removed.has("integration_test")) {
    throw new Error("Expected integration_test dev plugin was not present");
  }
  for (const node of metadata.dependencyGraph) {
    if (
      node == null ||
      typeof node !== "object" ||
      typeof node.name !== "string" ||
      !Array.isArray(node.dependencies)
    ) {
      throw new Error("Flutter plugin dependency graph is invalid");
    }
    if (!removed.has(node.name) && node.dependencies.some((dependency) => removed.has(dependency))) {
      throw new Error("A production plugin depends on a removed dev plugin");
    }
  }
  metadata.dependencyGraph = metadata.dependencyGraph
    .filter((node) => !removed.has(node.name))
    .map((node) => ({
      ...node,
      dependencies: node.dependencies.filter((dependency) => !removed.has(dependency)),
    }));
  writeFileSync(filePath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: stat.mode & 0o777 });
  if (removed.size > 0) {
    removeGeneratedRegistrants(path.dirname(path.resolve(filePath)));
  }
  return [...removed].sort();
}

function parseArgs(values) {
  const args = new Map();
  for (const value of values) {
    const separator = value.indexOf("=");
    if (!value.startsWith("--") || separator < 3) throw new Error("Invalid production plugin argument");
    const key = value.slice(2, separator);
    if (args.has(key) || !new Set(["file", "require-integration-test"]).has(key)) {
      throw new Error("Unknown or duplicate production plugin argument");
    }
    args.set(key, value.slice(separator + 1));
  }
  return args;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.get("file")) throw new Error("Missing production plugin metadata path");
  const removed = prepareProductionFlutterPlugins(path.resolve(args.get("file")), {
    requireIntegrationTest: args.get("require-integration-test") === "true",
  });
  console.log(`Prepared production Flutter plugin metadata (${removed.length} reviewed dev plugin removed)`);
}
