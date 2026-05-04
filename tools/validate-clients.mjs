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

await validateGeneratedDartNullSafety();

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
  hash.update(normalizeTextLineEndings(await readFile(file, "utf8")));
  return hash.digest("hex");
}

function normalizeTextLineEndings(content) {
  return content.replace(/\r\n?/g, "\n");
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

async function validateGeneratedDartNullSafety() {
  const modelsPath = "packages/client-dart/generated/models.dart";
  const content = await readFile(modelsPath, "utf8");
  const unsafeCalls = [];

  for (const dartClass of collectDartClasses(content)) {
    const nullableFields = collectNullableDartFields(dartClass.body);

    for (const fieldName of nullableFields) {
      const unsafeMemberCall = new RegExp(`\\b${escapeRegExp(fieldName)}\\s*\\.\\s*(?:toUtc|toJson|map)\\s*\\(`, "g");
      let match;
      while ((match = unsafeMemberCall.exec(dartClass.body)) !== null) {
        const lineNumber = lineNumberAt(content, dartClass.bodyStartIndex + match.index);
        unsafeCalls.push(`${modelsPath}:${lineNumber} direct method call on nullable field \`${fieldName}\` in ${dartClass.name}`);
      }
    }
  }

  if (unsafeCalls.length === 0) {
    return;
  }

  console.error("Generated Dart client has unsafe nullable field serialization.");
  console.error("Nullable class fields must be promoted through a local variable, null-aware call, or non-null assertion before method calls.");
  for (const unsafeCall of unsafeCalls) {
    console.error(`- ${unsafeCall}`);
  }

  process.exit(1);
}

function collectDartClasses(content) {
  const classes = [];
  const classStart = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\s*{/g;
  let match;

  while ((match = classStart.exec(content)) !== null) {
    const [, name] = match;
    const openBraceIndex = content.indexOf("{", match.index);
    const closeBraceIndex = findMatchingBrace(content, openBraceIndex);

    if (closeBraceIndex === -1) {
      continue;
    }

    classes.push({
      name,
      body: content.slice(openBraceIndex + 1, closeBraceIndex),
      bodyStartIndex: openBraceIndex + 1
    });
    classStart.lastIndex = closeBraceIndex + 1;
  }

  return classes;
}

function findMatchingBrace(content, openBraceIndex) {
  let depth = 0;

  for (let index = openBraceIndex; index < content.length; index += 1) {
    if (content[index] === "{") {
      depth += 1;
    } else if (content[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function collectNullableDartFields(content) {
  const nullableFields = new Set();
  const fieldDeclaration = /^\s*final\s+(.+?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;$/gm;
  let match;

  while ((match = fieldDeclaration.exec(content)) !== null) {
    const [, type, fieldName] = match;
    if (type.includes("?")) {
      nullableFields.add(fieldName);
    }
  }

  return nullableFields;
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatError(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
