import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const generatedTargets = [
  "packages/client-web/src/generated",
  "packages/client-dart/generated"
];

const before = await snapshotTargets(generatedTargets);
try {
  await import(new URL("./generate-clients.mjs", import.meta.url).href);
} catch (error) {
  console.error("Client generation failed.");
  console.error("Command: node tools/generate-clients.mjs");
  console.error(formatError(error));
  process.exit(1);
}

const after = await snapshotTargets(generatedTargets);
const changes = diffSnapshots(before, after);

if (changes.length > 0) {
  console.error("Generated clients are stale. Run `npm run generate:clients` and review the generated diff.");
  console.error("Changed generated files:");
  for (const change of changes) {
    console.error(`- ${change}`);
  }

  process.exit(1);
}

console.log("Generated client validation passed.");

async function snapshotTargets(targets) {
  const entries = new Map();

  for (const target of targets) {
    for (const file of await listFiles(target)) {
      entries.set(normalizePath(file), await hashFile(file));
    }
  }

  return entries;
}

async function listFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

async function hashFile(file) {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

function diffSnapshots(before, after) {
  const allPaths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes = [];

  for (const path of allPaths) {
    if (!before.has(path)) {
      changes.push(`added ${path}`);
    } else if (!after.has(path)) {
      changes.push(`removed ${path}`);
    } else if (before.get(path) !== after.get(path)) {
      changes.push(`modified ${path}`);
    }
  }

  return changes;
}

function normalizePath(file) {
  return relative(process.cwd(), file).replaceAll("\\", "/");
}

function formatError(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
