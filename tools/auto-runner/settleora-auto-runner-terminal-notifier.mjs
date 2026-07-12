#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import process from "node:process";
import { runTerminalNotifier } from "./lib/ntfy-terminal-notifier.mjs";

async function main() {
  parseArgs(process.argv.slice(2));
  const result = await runTerminalNotifier();
  if (!result.ok) {
    process.stderr.write("settleora auto-runner terminal notifier delivery unconfirmed\n");
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  if (argv.length === 0) return {};
  throw new Error(`Unknown argument: ${argv[0]}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
