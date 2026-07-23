#!/usr/bin/env node

import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

export async function main(argv = process.argv.slice(2)) {
  if (argv[0] !== "--runtime-root" || argv[2] !== "--entry" || argv[4] !== "--") {
    throw new Error("runtime launcher requires --runtime-root <path> --entry <entry> -- <args>");
  }
  const runtimeRoot = realpathSync(argv[1]);
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
  writeFileSync(marker, `${JSON.stringify({ pid: process.pid, processBirthId: processBirthId(process.pid) })}\n`, { flag: "wx", mode: 0o600 });
  try {
    if (lockExists(deploymentLock)) throw new Error("runtime startup raced with deployment");
    const target = path.join(runtimeRoot, entry);
    process.argv = [process.execPath, target, ...argv.slice(5)];
    const loaded = await import(pathToFileURL(target).href);
    if (typeof loaded.main !== "function") throw new Error("runtime entry does not export main");
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
