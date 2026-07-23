#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import process from "node:process";
import path from "node:path";
import {
  createAutoRunnerHealthServer,
  validateHealthServiceConfigWithFixedRoot,
} from "./lib/health-service.mjs";
import { loadConfig } from "./lib/config.mjs";
import { acquireRuntimeConsumer, releaseRuntimeConsumer } from "./lib/runtime-bundle.mjs";
import { moduleRuntimeRoot } from "./lib/runtime-identity.mjs";

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.configPath) throw new Error("health service requires --config");
  const project = loadConfig(
    { dryRun: true, run: false, configPath: args.configPath },
    { outageResubmissionObserverAvailable: true, readOnlyObserver: true },
  );
  const consumer = acquireRuntimeConsumer(moduleRuntimeRoot());
  const config = validateHealthServiceConfigWithFixedRoot({ ...args, logsRoot: project.logsRoot });
  const server = createAutoRunnerHealthServer(config);
  server.once("close", () => releaseRuntimeConsumer(consumer));
  const stop = () => server.close();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
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
    else if (arg === "--config") config.configPath = readValue(argv, ++index, arg);
    else if (arg === "--allow-non-loopback") config.allowNonLoopback = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (
    config.configPath
    && (
      !path.isAbsolute(config.configPath)
      || path.normalize(config.configPath) !== config.configPath
      || !/^\/workspace\/auto-runner\/config\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.json$/u.test(config.configPath)
    )
  ) {
    throw new Error("health service requires trusted --config");
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
