#!/usr/bin/env node

import { createHash } from "node:crypto";
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const allowedEntries = new Set([
  "settleora-auto-runner.mjs",
  "settleora-auto-runnerctl.mjs",
  "settleora-auto-runner-health-service.mjs",
  "settleora-auto-runner-terminal-notifier.mjs",
  "supervisor/settleora-auto-runner-worker.mjs",
]);

function lockExists(lock) {
  try {
    const fd = openSync(lock, "r");
    closeSync(fd);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function processBirthId(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  const fields = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/u);
  if (!fields[19]) throw new Error("runtime launcher process identity is unavailable");
  return fields[19];
}

function assertOwnerControlledDirectory(directory, label) {
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(directory) !== path.resolve(directory)) {
    throw new Error(`${label} must be a canonical directory`);
  }
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the runtime user`);
  }
  if ((info.mode & 0o022) !== 0) throw new Error(`${label} must not be group/world writable`);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function digestFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function verifyApprovedRuntime(runtimeRoot, launcherPath) {
  const parent = path.dirname(runtimeRoot);
  const approvalPath = path.join(parent, `.${path.basename(runtimeRoot)}.approved.json`);
  const approvalInfo = lstatSync(approvalPath);
  if (!approvalInfo.isFile() || approvalInfo.isSymbolicLink() || (approvalInfo.mode & 0o077) !== 0) {
    throw new Error("runtime approval evidence is unsafe");
  }
  const approval = JSON.parse(readFileSync(approvalPath, "utf8"));
  if (!/^[a-f0-9]{64}$/u.test(String(approval.bundleDigest || ""))
      || approval.launcherSha256 !== digestFile(launcherPath)) {
    throw new Error("runtime launcher approval mismatch");
  }
  const manifestPath = path.join(runtimeRoot, "runtime-bundle-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.format !== "settleora-auto-runner-runtime" || manifest.version !== 1
      || !Array.isArray(manifest.files) || !Array.isArray(manifest.entryPoints)) {
    throw new Error("runtime manifest identity is invalid");
  }
  const paths = manifest.files.map((file) => file.path);
  if (canonicalJson(paths) !== canonicalJson([...paths].sort()) || new Set(paths).size !== paths.length) {
    throw new Error("runtime manifest file list is invalid");
  }
  for (const file of manifest.files) {
    if (typeof file.path !== "string" || path.isAbsolute(file.path) || file.path.split("/").some((part) => part === "" || part === "." || part === "..")) {
      throw new Error("runtime manifest path is unsafe");
    }
    const target = path.join(runtimeRoot, file.path);
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || realpathSync(target) !== target
        || (statSync(target).mode & 0o777) !== file.mode || digestFile(target) !== file.sha256) {
      throw new Error("runtime bundle file verification failed");
    }
  }
  const identity = {
    format: manifest.format,
    version: manifest.version,
    sourceSha: manifest.sourceSha,
    files: manifest.files,
    entryPoints: manifest.entryPoints,
    node: manifest.node,
  };
  const rebuiltDigest = createHash("sha256").update(canonicalJson(identity)).digest("hex");
  if (rebuiltDigest !== manifest.bundleDigest || rebuiltDigest !== approval.bundleDigest) {
    throw new Error("runtime bundle approval digest mismatch");
  }
}

export async function main(argv = process.argv.slice(2)) {
  if (argv[0] !== "--runtime-root" || argv[2] !== "--entry" || argv[4] !== "--") {
    throw new Error("runtime launcher requires --runtime-root <path> --entry <entry> -- <args>");
  }
  const runtimeRoot = realpathSync(argv[1]);
  const launcherPath = realpathSync(process.argv[1]);
  const entry = argv[3];
  if (path.resolve(argv[1]) !== runtimeRoot || !allowedEntries.has(entry)) throw new Error("runtime launcher identity is invalid");
  const parent = path.dirname(runtimeRoot);
  assertOwnerControlledDirectory(parent, "runtime deployment parent");
  verifyApprovedRuntime(runtimeRoot, launcherPath);
  const deploymentLock = path.join(parent, `.${path.basename(runtimeRoot)}.deployment.lock`);
  const consumers = path.join(parent, `.${path.basename(runtimeRoot)}.consumers`);
  mkdirSync(consumers, { recursive: true, mode: 0o700 });
  assertOwnerControlledDirectory(consumers, "runtime consumer directory");
  if (lockExists(deploymentLock)) throw new Error("runtime startup refused during deployment");
  const marker = path.join(consumers, `${process.pid}.lock`);
  writeFileSync(marker, `${JSON.stringify({ pid: process.pid, processBirthId: processBirthId(process.pid) })}\n`, { flag: "wx", mode: 0o600 });
  try {
    if (lockExists(deploymentLock)) throw new Error("runtime startup raced with deployment");
    const target = path.join(runtimeRoot, entry);
    const loaded = await import(pathToFileURL(target).href);
    if (typeof loaded.main !== "function") throw new Error("runtime entry does not export main");
    process.argv = [process.execPath, target, ...argv.slice(5)];
    await loaded.main();
  } finally {
    rmSync(marker, { force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
