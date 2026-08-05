import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  authenticateTrustedSshPackage, closeAuthenticatedPackage, parseTrustedSshCommand, trustedSshPaths,
} from "./lib/trusted-ssh-boundary.mjs";

export function runTrustedSshDispatcher({
  argv = process.argv.slice(2),
  handoffRoot = trustedSshPaths.handoffRoot,
  expectedUid = 0,
  executor = executeHeldEntrypoint,
} = {}) {
  if (!Array.isArray(argv) || argv.length !== 3) throw new Error("trusted_ssh_dispatch_argv_invalid");
  const request = parseTrustedSshCommand(`settleora-handoff-v1 ${argv.join(" ")}`);
  const authenticated = authenticateTrustedSshPackage({
    root: handoffRoot,
    handoffKey: request.handoffKey,
    operationId: request.operationId,
    expectedUid,
  });
  try {
    return executor({
      argv: [trustedSshPaths.fdExec, request.mode, request.handoffKey, request.operationId],
      entrypointFd: authenticated.entrypointFd,
      packageDirectoryFd: authenticated.directoryFd,
      env: Object.freeze({ HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" }),
      executable: trustedSshPaths.fdExec,
      mode: request.mode,
    });
  } finally {
    closeAuthenticatedPackage(authenticated);
  }
}

function executeHeldEntrypoint({ executable, argv, env, entrypointFd, packageDirectoryFd }) {
  const result = spawnSync(executable, argv.slice(1), {
    env,
    stdio: ["inherit", "inherit", "inherit", entrypointFd, packageDirectoryFd],
  });
  if (result.error || result.status !== 0) throw new Error("trusted_ssh_entrypoint_failed");
  return Object.freeze({ reasonCode: "trusted_ssh_entrypoint_completed", status: result.status });
}

function main() {
  try {
    runTrustedSshDispatcher();
  } catch {
    process.stderr.write("SETTLEORA_SSH_DISPATCH_E70\n");
    process.exitCode = 70;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
