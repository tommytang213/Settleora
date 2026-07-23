#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { deployRuntimeBundle } from "./lib/runtime-bundle.mjs";

const values = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--dry-run") values.set(arg, true);
  else {
    const value = process.argv[++index];
    if (!value) throw new Error(`missing value for ${arg}`);
    values.set(arg, value);
  }
}
const repoRoot = path.resolve(values.get("--repo-root") || "");
const sourceRoot = path.resolve(values.get("--source-root") || path.join(repoRoot, "tools/auto-runner"));
const destination = path.resolve(values.get("--destination") || "");
const logsRoot = path.resolve(values.get("--logs-root") || "");
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
const status = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
if (head.status !== 0 || status.status !== 0 || status.stdout) throw new Error("source repository must be clean and readable");
const approvedSha = values.get("--approved-sha");
if (head.stdout.trim() !== approvedSha) throw new Error("source HEAD does not equal --approved-sha");
const result = deployRuntimeBundle({
  sourceRoot,
  destination,
  repoRoot,
  logsRoot,
  sourceSha: approvedSha,
  expectedOldDigest: values.get("--expected-old-digest") || null,
  dryRun: values.has("--dry-run"),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
