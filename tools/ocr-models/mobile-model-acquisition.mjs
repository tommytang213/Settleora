import {
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { finished } from "node:stream/promises";
import path from "node:path";

import { sha256File } from "./mobile-model-catalog.mjs";

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
      const response = await fetchImpl(trustedSourceUrl(pack.modelPackId, file.name), {
        redirect: "follow",
      });
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

// Keep every acquisition endpoint literal and reviewable. Catalog fields still
// carry provenance metadata, but they never become a network destination.
function trustedSourceUrl(modelPackId, fileName) {
  switch (`${modelPackId}/${fileName}`) {
    case "paddleocr.ppocrv6.small.det/inference.onnx": return "https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx/resolve/28fe5895c24fd108c19eb3e8479f4ab385fbfc62/inference.onnx";
    case "paddleocr.ppocrv6.small.det/inference.yml": return "https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx/resolve/28fe5895c24fd108c19eb3e8479f4ab385fbfc62/inference.yml";
    case "paddleocr.ppocrv6.small.rec.common/inference.onnx": return "https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/resolve/b8f84f0b80c529de40b4fbb3544b84fa7233a513/inference.onnx";
    case "paddleocr.ppocrv6.small.rec.common/inference.yml": return "https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/resolve/b8f84f0b80c529de40b4fbb3544b84fa7233a513/inference.yml";
    case "paddleocr.ppocrv5.mobile.rec.arabic/inference.onnx": return "https://huggingface.co/PaddlePaddle/arabic_PP-OCRv5_mobile_rec_onnx/resolve/14aaedcd75825982689ecf5cd64ab33ee083215a/inference.onnx";
    case "paddleocr.ppocrv5.mobile.rec.arabic/inference.yml": return "https://huggingface.co/PaddlePaddle/arabic_PP-OCRv5_mobile_rec_onnx/resolve/14aaedcd75825982689ecf5cd64ab33ee083215a/inference.yml";
    case "paddleocr.ppocrv5.mobile.rec.cyrillic/inference.onnx": return "https://huggingface.co/PaddlePaddle/cyrillic_PP-OCRv5_mobile_rec_onnx/resolve/2cef88145434beb8afa9dd82d77d799eb1ad7b29/inference.onnx";
    case "paddleocr.ppocrv5.mobile.rec.cyrillic/inference.yml": return "https://huggingface.co/PaddlePaddle/cyrillic_PP-OCRv5_mobile_rec_onnx/resolve/2cef88145434beb8afa9dd82d77d799eb1ad7b29/inference.yml";
    case "paddleocr.ppocrv5.mobile.rec.devanagari/inference.onnx": return "https://huggingface.co/PaddlePaddle/devanagari_PP-OCRv5_mobile_rec_onnx/resolve/251aec19e36739540d35e2cc943f6aa7503b98e5/inference.onnx";
    case "paddleocr.ppocrv5.mobile.rec.devanagari/inference.yml": return "https://huggingface.co/PaddlePaddle/devanagari_PP-OCRv5_mobile_rec_onnx/resolve/251aec19e36739540d35e2cc943f6aa7503b98e5/inference.yml";
    case "paddleocr.ppocrv5.mobile.rec.korean/inference.onnx": return "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/5c6f574b8e2230adf4287b33e736d71b9fabd28e/inference.onnx";
    case "paddleocr.ppocrv5.mobile.rec.korean/inference.yml": return "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/5c6f574b8e2230adf4287b33e736d71b9fabd28e/inference.yml";
    case "paddleocr.ppocrv5.mobile.rec.thai/inference.onnx": return "https://huggingface.co/PaddlePaddle/th_PP-OCRv5_mobile_rec_onnx/resolve/1d4adbbafb1034a2fd6618498575b81ea7b69f69/inference.onnx";
    case "paddleocr.ppocrv5.mobile.rec.thai/inference.yml": return "https://huggingface.co/PaddlePaddle/th_PP-OCRv5_mobile_rec_onnx/resolve/1d4adbbafb1034a2fd6618498575b81ea7b69f69/inference.yml";
    default: throw new Error(`Model artifact has no trusted acquisition endpoint: ${modelPackId}/${fileName}`);
  }
}

async function packDirectoryIsValid(directory, pack) {
  const expectedNames = pack.files.map((file) => file.name).sort();
  const entries = readdirSync(directory, { withFileTypes: true });
  if (
    entries.some((entry) => !entry.isFile()) ||
    entries.map((entry) => entry.name).sort().join(",") !== expectedNames.join(",")
  ) {
    return false;
  }
  for (const file of pack.files) {
    const candidate = path.join(directory, file.name);
    if (
      !existsSync(candidate) ||
      !lstatSync(candidate).isFile() ||
      statSync(candidate).size !== file.bytes
    ) {
      return false;
    }
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
