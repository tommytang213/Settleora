#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadCatalog,
  verifyCatalog,
} from "./mobile-model-catalog.mjs";
import { acquirePack } from "./mobile-model-acquisition.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDirectory, "../..");
const download = process.argv.includes("--download");
const repoRootArg = process.argv.indexOf("--repo-root");
const repoRoot = repoRootArg >= 0
  ? path.resolve(process.argv[repoRootArg + 1] || "")
  : defaultRepoRoot;

if (download) await downloadCatalog(repoRoot);

const result = await verifyCatalog(repoRoot);
if (!result.ok) {
  for (const failure of result.failures) console.error(`OCR model verification failed: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `OCR model verification passed: ${result.observedTotalBytes} bytes, no missing or mismatched files.`,
  );
}

async function downloadCatalog(root) {
  const { catalog } = loadCatalog(root);
  for (const pack of catalog.packs) {
    await acquirePack(root, pack);
  }
}
