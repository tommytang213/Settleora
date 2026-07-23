#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { acquireRuntimeDeploymentLock, deployRuntimeBundle, inspectDeploymentQuiescence, inspectRuntimeConsumers, releaseRuntimeDeploymentLock, rollbackRuntimeBundle } from "./lib/runtime-bundle.mjs";

const values = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--dry-run" || arg === "--rollback") values.set(arg, true);
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
const deploymentLock = acquireRuntimeDeploymentLock(destination);
try {
const quiescence = inspectDeploymentQuiescence(logsRoot);
const runtimeConsumers = inspectRuntimeConsumers(destination);
if (values.has("--rollback")) {
  const result = rollbackRuntimeBundle({
    destination,
    expectedCurrentDigest: values.get("--expected-old-digest"),
    expectedRollbackDigest: values.get("--expected-rollback-digest"),
    active: quiescence.active,
    pendingEffects: quiescence.pendingEffects,
    runtimeConsumers,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = 0;
} else {
if (sourceRoot !== path.join(repoRoot, "tools/auto-runner")) {
  throw new Error("sourceRoot must be the approved repository tools/auto-runner directory");
}
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
  active: quiescence.active,
  pendingEffects: quiescence.pendingEffects,
  runtimeConsumers,
  sourceVerifier: () => {
    const verifiedHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
    const verifiedStatus = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
    if (verifiedHead.status !== 0 || verifiedHead.stdout.trim() !== approvedSha || verifiedStatus.status !== 0 || verifiedStatus.stdout) {
      throw new Error("source repository changed during deployment");
    }
  },
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
} finally {
  releaseRuntimeDeploymentLock(deploymentLock);
}
