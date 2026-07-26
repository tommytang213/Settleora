import { scryptSync } from "node:crypto";

const githubEvidenceDomainSalt = Buffer.from(["Settleora", "canonical", "GitHub", "evidence", "v1"].join("\0"));

export function canonicalGithubEvidenceDigest(value) {
  return scryptSync(canonical(value), githubEvidenceDomainSalt, 32, { N: 1024, r: 8, p: 1 }).toString("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
