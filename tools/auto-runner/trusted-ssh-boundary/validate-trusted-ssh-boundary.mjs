import { validateTrustedSshInstallationPlan } from "./lib/trusted-ssh-boundary.mjs";

try {
  if (process.argv.length !== 3) throw new Error("trusted_ssh_validation_arguments_invalid");
  const result = validateTrustedSshInstallationPlan(process.argv[2], {
    expectedUid: process.getuid?.() ?? 0,
    runPlatformTools: true,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch {
  process.stderr.write("trusted_ssh_boundary_validation_blocked\n");
  process.exitCode = 1;
}
