import { closeSync, constants, openSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  authenticateInstalledBoundaryArtifact, authenticateTrustedSshPackage, closeAuthenticatedPackage,
  consumeTrustedSshOperation, parseTrustedSshCommand, trustedSshPaths,
} from "./lib/trusted-ssh-boundary.mjs";

export function runTrustedSshPamPreauth({
  argv = process.argv.slice(2), cwd = process.cwd(), uid = process.getuid?.(), gid = process.getgid?.(),
  euid = process.geteuid?.(),
  handoffRoot = trustedSshPaths.handoffRoot, expectedPackageUid = 0, claimRoot = trustedSshPaths.operationClaims,
  bootstrapAuthenticator = authenticateInstalledBoundaryArtifact, claimConsumer = consumeTrustedSshOperation,
} = {}) {
  if (argv.length !== 2 || !/^[1-9][0-9]{0,9}$/u.test(argv[0]) || !/^[1-9][0-9]{0,9}$/u.test(argv[1])
      || uid !== Number.parseInt(argv[0], 10) || gid !== Number.parseInt(argv[1], 10) || euid !== 0) {
    throw new Error("trusted_ssh_pam_preauth_identity_invalid");
  }
  const canonicalCwd = realpathSync(cwd);
  const handoffKey = path.basename(canonicalCwd);
  if (path.dirname(canonicalCwd) !== path.resolve(handoffRoot)) throw new Error("trusted_ssh_pam_preauth_path_invalid");
  const fd = openSync(path.join(canonicalCwd, "boundary-package.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
  let manifest;
  try { manifest = JSON.parse(readFileSync(fd, "utf8")); } finally { closeSync(fd); }
  const request = parseTrustedSshCommand(`settleora-handoff-v1 execute ${handoffKey} ${String(manifest.operationId || "")}`);
  const authenticated = authenticateTrustedSshPackage({
    root: handoffRoot, handoffKey: request.handoffKey, operationId: request.operationId, expectedUid: expectedPackageUid,
  });
  try {
    bootstrapAuthenticator({
      expectedInstalledPath: trustedSshPaths.rootBootstrapModule,
      expectedName: "settleora-authenticated-root-bootstrap.mjs",
      file: trustedSshPaths.rootBootstrapModule,
    });
    return claimConsumer({
      claimRoot, expectedClaimGid: Number.parseInt(argv[1], 10), expectedClaimUid: Number.parseInt(argv[0], 10),
      handoffKey: request.handoffKey, operationId: request.operationId,
    });
  } finally { closeAuthenticatedPackage(authenticated); }
}

try {
  if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runTrustedSshPamPreauth();
} catch {
  process.stderr.write("SETTLEORA_PAM_PREAUTH_E70\n");
  process.exitCode = 70;
}
