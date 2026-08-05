import { createTrustedSshInstallationPlan } from "./lib/trusted-ssh-boundary.mjs";

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined || Object.hasOwn(options, argv[index])) {
      throw new Error("trusted_ssh_plan_arguments_invalid");
    }
    options[argv[index]] = argv[index + 1];
  }
  const expected = ["--dispatcher-module", "--fd-exec", "--generated-at", "--native-shell", "--operator-key-fingerprint", "--output-root", "--repository-root", "--root-gate", "--root-gate-module", "--source-commit", "--source-tree", "--support-library"];
  if (Object.keys(options).sort().join("\n") !== expected.sort().join("\n")) throw new Error("trusted_ssh_plan_arguments_invalid");
  return options;
}

try {
  const options = parse(process.argv.slice(2));
  const result = createTrustedSshInstallationPlan({
    dispatcherModule: options["--dispatcher-module"],
    fdExec: options["--fd-exec"],
    generatedAt: options["--generated-at"],
    nativeShell: options["--native-shell"],
    operatorKeyFingerprint: options["--operator-key-fingerprint"],
    outputRoot: options["--output-root"],
    repositoryRoot: options["--repository-root"],
    rootGate: options["--root-gate"],
    rootGateModule: options["--root-gate-module"],
    sourceCommit: options["--source-commit"],
    sourceTree: options["--source-tree"],
    supportLibrary: options["--support-library"],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch {
  process.stderr.write("trusted_ssh_plan_generation_blocked\n");
  process.exitCode = 1;
}
