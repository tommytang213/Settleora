import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const maxMetadataBytes = 1024 * 1024;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function inspectIosAssetCatalogInfo(json) {
  if (typeof json !== "string" || Buffer.byteLength(json) > maxMetadataBytes) {
    throw new Error("Compiled asset metadata is missing or oversized");
  }
  const assets = JSON.parse(json);
  if (!Array.isArray(assets) || assets.length === 0 || assets.length > 4096 || assets.some((asset) =>
    asset === null || typeof asset !== "object" || Array.isArray(asset))) {
    throw new Error("Compiled asset catalog metadata is invalid");
  }
  // This is an observation of Xcode output, not a reviewed rendition baseline.
  // Only hashes and counts leave this parser; raw names or paths are not logged.
  const renditions = assets.map((asset) => canonicalJson(asset)).sort();
  return {
    renditionCount: renditions.length,
    renditionInventorySha256: sha256(JSON.stringify(renditions)),
    inventory: renditions.map((rendition) => ({ metadataSha256: sha256(rendition) })),
  };
}

export function verifyIosAssetCatalogInfo(json) {
  return inspectIosAssetCatalogInfo(json).renditionInventorySha256;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
    if (Buffer.byteLength(input) > maxMetadataBytes) {
      console.error("Compiled asset catalog metadata observation failed");
      process.exit(1);
    }
  });
  process.stdin.on("end", () => {
    try {
      const observed = inspectIosAssetCatalogInfo(input);
      if (process.argv[2] === "--json") console.log(JSON.stringify(observed));
      else if (process.argv.length === 2) {
        console.log(`observed_asset_catalog_rendition_count=${observed.renditionCount}`);
        console.log(`observed_asset_catalog_metadata_sha256=${observed.renditionInventorySha256}`);
      } else throw new Error("invalid invocation");
    } catch {
      console.error("Compiled asset catalog metadata observation failed");
      process.exitCode = 1;
    }
  });
}
