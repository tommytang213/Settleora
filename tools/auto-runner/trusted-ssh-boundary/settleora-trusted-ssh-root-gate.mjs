import { closeSync, constants, openSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  authenticateInstalledBoundaryArtifact, authenticateTrustedSshPackage, closeAuthenticatedPackage,
  enterTrustedSshRootGate, parseTrustedSshCommand, trustedSshPaths,
} from "./lib/trusted-ssh-boundary.mjs";

export function runTrustedSshRootGate({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  handoffRoot = trustedSshPaths.handoffRoot,
  uid = process.getuid?.(),
  euid = process.geteuid?.(),
  expectedPackageUid = 0,
  claimRoot = trustedSshPaths.operationClaims,
  gateEnterer = enterTrustedSshRootGate,
  bootstrapAuthenticator = authenticateInstalledBoundaryArtifact,
  executor = executeFixedRootBootstrap,
} = {}) {
  if (argv.length !== 2 || !/^[1-9][0-9]{0,9}$/u.test(argv[0]) || !/^[1-9][0-9]{0,9}$/u.test(argv[1])
      || uid !== 0 || euid !== 0) throw new Error("trusted_ssh_root_gate_identity_invalid");
  const expectedClaimUid = Number.parseInt(argv[0], 10);
  const expectedClaimGid = Number.parseInt(argv[1], 10);
  const canonicalCwd = realpathSync(cwd);
  const handoffKey = path.basename(canonicalCwd);
  if (path.dirname(canonicalCwd) !== path.resolve(handoffRoot)) throw new Error("trusted_ssh_root_gate_path_invalid");
  const fd = openSync(path.join(canonicalCwd, "boundary-package.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
  let manifest;
  try { manifest = JSON.parse(readFileSync(fd, "utf8")); } finally { closeSync(fd); }
  const request = parseTrustedSshCommand(`settleora-handoff-v1 execute ${handoffKey} ${String(manifest.operationId || "")}`);
  const authenticated = authenticateTrustedSshPackage({
    root: handoffRoot,
    handoffKey: request.handoffKey,
    operationId: request.operationId,
    expectedUid: expectedPackageUid,
  });
  try {
    bootstrapAuthenticator({
      expectedInstalledPath: trustedSshPaths.rootBootstrapModule,
      expectedName: "settleora-authenticated-root-bootstrap.mjs",
      file: trustedSshPaths.rootBootstrapModule,
    });
    const receipt = gateEnterer({ claimRoot, handoffKey: request.handoffKey, operationId: request.operationId });
    if (receipt.sudoAttemptCount !== 1) throw new Error("trusted_ssh_root_gate_receipt_invalid");
    return executor({
      argv: [trustedSshPaths.rootBootstrap, "--disable-proto=throw", trustedSshPaths.rootBootstrapModule],
      env: Object.freeze({ HOME: "/root", LANG: "C", LC_ALL: "C", PATH: "/usr/sbin:/usr/bin:/sbin:/bin", TZ: "UTC" }),
      executable: trustedSshPaths.rootBootstrap,
      packageDirectoryFd: authenticated.directoryFd,
    });
  } finally { closeAuthenticatedPackage(authenticated); }
}

function executeFixedRootBootstrap({ executable, argv, env, packageDirectoryFd }) {
  if (!Number.isInteger(packageDirectoryFd)) throw new Error("trusted_ssh_root_gate_descriptor_invalid");
  process.execve(executable, argv, env);
}

try {
  if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runTrustedSshRootGate();
} catch {
  process.stderr.write("SETTLEORA_ROOT_GATE_E70\n");
  process.exitCode = 70;
}
