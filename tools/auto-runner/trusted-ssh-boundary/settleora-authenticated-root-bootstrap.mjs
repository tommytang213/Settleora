import { closeSync, constants, openSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  authenticateTrustedSshPackage, closeAuthenticatedPackage, parseTrustedSshCommand,
  trustedSshPaths, validateTrustedSshConsumedReceipt,
} from "./lib/trusted-ssh-boundary.mjs";

export function runAuthenticatedRootBootstrap({
  argv = process.argv.slice(2), cwd = process.cwd(), uid = process.getuid?.(), euid = process.geteuid?.(),
  handoffRoot = trustedSshPaths.handoffRoot, claimRoot = trustedSshPaths.operationClaims,
  expectedPackageUid = 0, packageAuthenticator = authenticateTrustedSshPackage,
  receiptValidator = validateTrustedSshConsumedReceipt, integrationExecutor = unavailableIntegration,
} = {}) {
  if (argv.length !== 0 || uid !== 0 || euid !== 0) throw new Error("trusted_ssh_root_bootstrap_identity_invalid");
  const canonicalCwd = realpathSync(cwd);
  const handoffKey = path.basename(canonicalCwd);
  if (path.dirname(canonicalCwd) !== path.resolve(handoffRoot)) throw new Error("trusted_ssh_root_bootstrap_path_invalid");
  const manifestFd = openSync(path.join(canonicalCwd, "boundary-package.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestFd, "utf8")); } finally { closeSync(manifestFd); }
  const request = parseTrustedSshCommand(`settleora-handoff-v1 execute ${handoffKey} ${String(manifest.operationId || "")}`);
  const authenticated = packageAuthenticator({
    root: handoffRoot, handoffKey: request.handoffKey, operationId: request.operationId, expectedUid: expectedPackageUid,
  });
  try {
    const receipt = receiptValidator({
      claimRoot, handoffKey: request.handoffKey, operationId: request.operationId,
    });
    if (receipt.sudoAttemptCount !== 1) throw new Error("trusted_ssh_root_bootstrap_receipt_invalid");
    return integrationExecutor(Object.freeze({
      directoryFd: authenticated.directoryFd,
      entrypointFd: authenticated.entrypointFd,
      executeFlow: Object.freeze(["prepare", "arm-interactive-sudo-once", "resume-readback-only"]),
      handoffKey: request.handoffKey,
      operationId: request.operationId,
      sudoAttemptCount: 1,
    }));
  } finally { closeAuthenticatedPackage(authenticated); }
}

function unavailableIntegration() {
  throw new Error("trusted_ssh_root_bootstrap_pr1048_integration_unavailable");
}

try {
  if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runAuthenticatedRootBootstrap();
} catch {
  process.stderr.write("SETTLEORA_ROOT_BOOTSTRAP_E70\n");
  process.exitCode = 70;
}
