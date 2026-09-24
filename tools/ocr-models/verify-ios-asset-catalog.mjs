import path from "node:path";
import { fileURLToPath } from "node:url";

const reviewedNames = new Set(["AppIcon", "LaunchImage"]);
const maxMetadataBytes = 1024 * 1024;

export function verifyIosAssetCatalogInfo(json) {
  if (typeof json !== "string" || Buffer.byteLength(json) > maxMetadataBytes) {
    throw new Error("Compiled asset metadata is missing or oversized");
  }
  const assets = JSON.parse(json);
  if (!Array.isArray(assets) || assets.length === 0 || assets.some((asset) =>
    asset === null || typeof asset !== "object" || Array.isArray(asset) ||
    !reviewedNames.has(asset.Name))) {
    throw new Error("Compiled asset catalog contains an unreviewed asset");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
    if (Buffer.byteLength(input) > maxMetadataBytes) {
      console.error("Compiled asset catalog metadata verification failed");
      process.exit(1);
    }
  });
  process.stdin.on("end", () => {
    try {
      verifyIosAssetCatalogInfo(input);
    } catch {
      console.error("Compiled asset catalog metadata verification failed");
      process.exitCode = 1;
    }
  });
}
