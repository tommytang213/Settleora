#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import process from "node:process";
import path from "node:path";
import { runTerminalNotifier } from "./lib/ntfy-terminal-notifier.mjs";
import { loadConfig } from "./lib/config.mjs";
import { acquireRuntimeConsumer, releaseRuntimeConsumer } from "./lib/runtime-bundle.mjs";
import { moduleRuntimeRoot } from "./lib/runtime-identity.mjs";

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const project = loadConfig(
    { dryRun: true, run: false, configPath: args.configPath },
    { outageResubmissionObserverAvailable: true, readOnlyObserver: true },
  );
  const consumer = acquireRuntimeConsumer(moduleRuntimeRoot());
  const result = await runTerminalNotifier({
    logsRoot: project.logsRoot,
    statePath: path.join(project.logsRoot, "monitoring", "notifier-state.json"),
    configPath: path.join(project.logsRoot, "secrets", "ntfy-notifier.json"),
  }).finally(() => releaseRuntimeConsumer(consumer));
  if (!result.ok) {
    process.stderr.write("settleora auto-runner terminal notifier delivery unconfirmed\n");
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--config") throw new Error("terminal notifier requires trusted --config");
  const configPath = argv[1];
  if (
    !path.isAbsolute(configPath)
    || path.normalize(configPath) !== configPath
    || !/^\/workspace\/auto-runner\/config\/[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.json$/u.test(configPath)
  ) {
    throw new Error("terminal notifier requires trusted --config");
  }
  return { configPath };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
