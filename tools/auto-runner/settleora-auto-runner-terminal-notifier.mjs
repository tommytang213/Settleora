#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import process from "node:process";
import path from "node:path";
import { runTerminalNotifier } from "./lib/ntfy-terminal-notifier.mjs";
import { loadConfig } from "./lib/config.mjs";
import { acquireRuntimeConsumer, releaseRuntimeConsumer } from "./lib/runtime-bundle.mjs";
import { moduleRuntimeRoot } from "./lib/runtime-identity.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const project = loadConfig(
    { dryRun: true, run: false, configPath: args.configPath },
    { outageResubmissionObserverAvailable: true },
  );
  const consumer = acquireRuntimeConsumer(moduleRuntimeRoot());
  const result = await runTerminalNotifier({
    logsRoot: project.logsRoot,
    configPath: path.join(project.logsRoot, "secrets", "ntfy-notifier.json"),
  }).finally(() => releaseRuntimeConsumer(consumer));
  if (!result.ok) {
    process.stderr.write("settleora auto-runner terminal notifier delivery unconfirmed\n");
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  if (argv.length === 2 && argv[0] === "--config" && path.isAbsolute(argv[1])) return { configPath: argv[1] };
  throw new Error("terminal notifier requires absolute --config");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
