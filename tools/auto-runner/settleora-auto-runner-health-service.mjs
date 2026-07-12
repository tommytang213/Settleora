#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import process from "node:process";
import {
  createAutoRunnerHealthServer,
  validateHealthServiceConfig,
} from "./lib/health-service.mjs";

async function main() {
  const config = validateHealthServiceConfig(parseArgs(process.argv.slice(2)));
  const server = createAutoRunnerHealthServer(config);
  server.listen(config.port, config.host, () => {
    const address = server.address();
    process.stderr.write(`settleora-auto-runner-health listening on ${address.address}:${address.port}\n`);
  });
}

function parseArgs(argv) {
  const config = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") config.host = readValue(argv, ++index, arg);
    else if (arg === "--port") config.port = readValue(argv, ++index, arg);
    else if (arg === "--allow-non-loopback") config.allowNonLoopback = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return config;
}

function readValue(argv, index, name) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
