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

export function reclaimStaleOwnMarker(marker) {
  try {
    const info = lstatSync(marker);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
      throw new Error("runtime consumer marker is not trusted");
    }
    if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
      throw new Error("runtime consumer marker has the wrong owner");
    }
    const parsed = JSON.parse(readFileSync(marker, "utf8"));
    if (parsed.pid !== process.pid || typeof parsed.processBirthId !== "string") {
      throw new Error("runtime consumer marker identity is invalid");
    }
    if (parsed.processBirthId === processBirthId(process.pid)) {
      throw new Error("runtime consumer marker is already active");
    }
    rmSync(marker);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
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

export function assertNodeCompatibility(range, version = process.versions.node) {
  if (typeof range !== "string" || range.length > 32) {
    throw new Error("runtime manifest Node constraint is invalid");
  }
  const rangeMatch = /^>=(\d{1,2}) <(\d{1,2})$/u.exec(range);
  if (!rangeMatch) throw new Error("runtime manifest Node constraint is unsupported");
  const minimum = Number(rangeMatch[1]);
  const maximum = Number(rangeMatch[2]);
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)
      || minimum < 1 || maximum > 99 || minimum >= maximum) {
    throw new Error("runtime manifest Node constraint is contradictory");
  }
  const versionMatch = /^(\d{1,2})\.(\d{1,3})\.(\d{1,3})$/u.exec(String(version || ""));
  if (!versionMatch) throw new Error("executing Node version is unsupported");
  const major = Number(versionMatch[1]);
  if (major < minimum || major >= maximum) {
    throw new Error("executing Node version is outside the approved runtime range");
  }
  return Object.freeze({ range, version: versionMatch[0], minimum, maximum });
}

function verifyApprovedRuntime(runtimeRoot, launcherPath) {
  const parent = path.dirname(runtimeRoot);
  if (path.basename(runtimeRoot) !== "runtime") throw new Error("runtime bundle basename is invalid");
  const expectedLauncher = path.join(parent, ".runtime.launcher.mjs");
  if (launcherPath !== expectedLauncher) throw new Error("runtime launcher sibling identity is invalid");
  const approvalPath = path.join(parent, ".runtime.approved.json");
  const approvalInfo = lstatSync(approvalPath);
  if (!approvalInfo.isFile() || approvalInfo.isSymbolicLink() || (approvalInfo.mode & 0o077) !== 0) {
    throw new Error("runtime approval evidence is unsafe");
  }
  const approval = JSON.parse(readFileSync(approvalPath, "utf8"));
  if (!/^[a-f0-9]{64}$/u.test(String(approval.bundleDigest || ""))
      || approval.launcherSha256 !== createHash("sha256").update(readFileSync(expectedLauncher)).digest("hex")) {
    throw new Error("runtime launcher approval mismatch");
  }
  const manifestPath = path.join(runtimeRoot, "runtime-bundle-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.format !== "settleora-auto-runner-runtime" || ![1, 2].includes(manifest.version)
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
    const target = path.resolve(runtimeRoot, file.path);
    if (!target.startsWith(`${runtimeRoot}${path.sep}`)) throw new Error("runtime manifest path escaped runtimeRoot");
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || realpathSync(target) !== target
        || (statSync(target).mode & 0o777) !== file.mode
        || createHash("sha256").update(readFileSync(target)).digest("hex") !== file.sha256) {
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
  assertNodeCompatibility(manifest.node);
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
  const deploymentLock = path.join(parent, `.${path.basename(runtimeRoot)}.deployment.lock`);
  const consumers = path.join(parent, `.${path.basename(runtimeRoot)}.consumers`);
  mkdirSync(consumers, { recursive: true, mode: 0o700 });
  assertOwnerControlledDirectory(consumers, "runtime consumer directory");
  if (lockExists(deploymentLock)) throw new Error("runtime startup refused during deployment");
  const marker = path.join(consumers, `${process.pid}.lock`);
  reclaimStaleOwnMarker(marker);
  writeFileSync(marker, `${JSON.stringify({ pid: process.pid, processBirthId: processBirthId(process.pid) })}\n`, { flag: "wx", mode: 0o600 });
  try {
    if (lockExists(deploymentLock)) throw new Error("runtime startup raced with deployment");
    assertOwnerControlledDirectory(runtimeRoot, "runtime bundle root");
    verifyApprovedRuntime(runtimeRoot, launcherPath);
    assertOwnerControlledDirectory(runtimeRoot, "runtime bundle root");
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
