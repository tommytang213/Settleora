import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const reviewedNames = new Set(["AppIcon", "LaunchImage"]);
const maxMetadataBytes = 1024 * 1024;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verifyIosAssetCatalogInfo(json) {
  if (typeof json !== "string" || Buffer.byteLength(json) > maxMetadataBytes) {
    throw new Error("Compiled asset metadata is missing or oversized");
  }
  const assets = JSON.parse(json);
  if (!Array.isArray(assets) || assets.some((asset) =>
    asset === null || typeof asset !== "object" || Array.isArray(asset) ||
    !reviewedNames.has(asset.Name)) ||
    [...reviewedNames].some((name) => !assets.some((asset) => asset.Name === name))) {
    throw new Error("Compiled asset catalog contains an unreviewed asset");
  }
  const renditions = assets.map(canonicalJson).sort();
  return createHash("sha256").update(JSON.stringify(renditions)).digest("hex");
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
      const digest = verifyIosAssetCatalogInfo(input);
      // Only this bounded digest leaves the Mac runner. It is used to pin the
      // complete Xcode 16.4 rendition inventory after exact-source review.
      console.log(`compiled_asset_catalog_sha256=${digest}`);
    } catch {
      console.error("Compiled asset catalog metadata verification failed");
      process.exitCode = 1;
    }
  });
}
