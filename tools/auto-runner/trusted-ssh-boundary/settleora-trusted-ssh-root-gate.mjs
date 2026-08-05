import { closeSync, constants, openSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  authenticateTrustedSshPackage, closeAuthenticatedPackage, parseTrustedSshCommand, trustedSshPaths,
} from "./lib/trusted-ssh-boundary.mjs";

export function runTrustedSshRootGate({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  handoffRoot = trustedSshPaths.handoffRoot,
  uid = process.getuid?.(),
  euid = process.geteuid?.(),
  expectedPackageUid = 0,
  executor = executeFixedRootBootstrap,
} = {}) {
  if (argv.length !== 0 || uid !== 0 || euid !== 0) throw new Error("trusted_ssh_root_gate_identity_invalid");
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
    return executor({
      argv: [trustedSshPaths.rootBootstrap],
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
