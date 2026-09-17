#!/usr/bin/env node
import { createWriteStream, mkdirSync, renameSync, rmSync } from "node:fs";
import { finished } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadCatalog,
  sha256File,
  sourceUrl,
  verifyCatalog,
} from "./mobile-model-catalog.mjs";

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
    const directory = path.join(root, "apps/mobile", pack.assetDirectory);
    mkdirSync(directory, { recursive: true });
    for (const file of pack.files) {
      const target = path.join(directory, file.name);
      const temporary = `${target}.partial`;
      try {
        const response = await fetch(sourceUrl(pack, file), { redirect: "follow" });
        if (!response.ok || !response.body) {
          throw new Error(`Unable to download ${pack.modelPackId}/${file.name}: ${response.status}`);
        }
        await writeWebStream(response.body, temporary);
        const observedSha256 = await sha256File(temporary);
        if (observedSha256 !== file.sha256) {
          throw new Error(`Downloaded hash mismatch for ${pack.modelPackId}/${file.name}`);
        }
        renameSync(temporary, target);
      } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
      }
    }
  }
}

async function writeWebStream(body, target) {
  const output = createWriteStream(target);
  for await (const chunk of body) {
    if (!output.write(chunk)) await new Promise((resolve) => output.once("drain", resolve));
  }
  output.end();
  await finished(output);
}
