import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { finished } from "node:stream/promises";
import path from "node:path";

import { sha256File, sourceUrl } from "./mobile-model-catalog.mjs";

export async function acquirePack(repoRoot, pack, fetchImpl = globalThis.fetch) {
  const directory = path.join(repoRoot, "apps/mobile", pack.assetDirectory);
  if (existsSync(directory)) {
    if (await packDirectoryIsValid(directory, pack)) return "already_verified";
    throw new Error(`Existing model pack is invalid; refusing mixed replacement: ${pack.modelPackId}`);
  }

  const parent = path.dirname(directory);
  mkdirSync(parent, { recursive: true });
  const staging = path.join(
    parent,
    `.${path.basename(directory)}.${pack.modelVersion}.${process.pid}.${Date.now()}.partial`,
  );
  mkdirSync(staging);
  try {
    for (const file of pack.files) {
      const target = path.join(staging, file.name);
      const response = await fetchImpl(sourceUrl(pack, file), { redirect: "follow" });
      if (!response.ok || !response.body) {
        throw new Error(`Unable to download ${pack.modelPackId}/${file.name}: ${response.status}`);
      }
      await writeWebStream(response.body, target);
      const observedBytes = statSync(target).size;
      const observedSha256 = await sha256File(target);
      if (observedBytes !== file.bytes || observedSha256 !== file.sha256) {
        throw new Error(`Downloaded identity mismatch for ${pack.modelPackId}/${file.name}`);
      }
    }
    if (!(await packDirectoryIsValid(staging, pack))) {
      throw new Error(`Staged model pack failed complete verification: ${pack.modelPackId}`);
    }
    renameSync(staging, directory);
    return "installed";
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

async function packDirectoryIsValid(directory, pack) {
  for (const file of pack.files) {
    const candidate = path.join(directory, file.name);
    if (!existsSync(candidate) || statSync(candidate).size !== file.bytes) return false;
    if (await sha256File(candidate) !== file.sha256) return false;
  }
  return true;
}

async function writeWebStream(body, target) {
  const output = createWriteStream(target, { flags: "wx" });
  for await (const chunk of body) {
    if (!output.write(chunk)) await new Promise((resolve) => output.once("drain", resolve));
  }
  output.end();
  await finished(output);
}
