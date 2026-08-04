import { realpathSync } from "node:fs";
import path from "node:path";
import {
  assertCanonicalGenerationResult,
  generateNativeInstallHandoffPackage,
} from "./lib/semantic-recovery-native-install-package.mjs";

const optionNames = new Set(["--repository-root", "--handoff-root", "--repository", "--branch", "--commit", "--tree", "--remote-host", "--remote-handoff-root"]);

export function main(argv = process.argv.slice(2), output = process.stdout, errorOutput = process.stderr) {
  try {
    const options = parseOptions(argv);
    const result = generateNativeInstallHandoffPackage({
      repositoryRoot: realpathSync(options["--repository-root"]),
      handoffRoot: realpathSync(options["--handoff-root"]),
      repository: options["--repository"], branch: options["--branch"], sourceCommit: options["--commit"],
      sourceTree: options["--tree"], remoteHost: options["--remote-host"], remoteHandoffRoot: options["--remote-handoff-root"],
    });
    assertCanonicalGenerationResult(result);
    output.write(`${JSON.stringify(Object.fromEntries(Object.entries(result).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))}\n`);
    return 0;
  } catch (error) {
    const message = String(error?.message || "generation failed");
    errorOutput.write(`native install handoff generation blocked: ${/^[A-Za-z0-9 _.:/-]{1,200}$/u.test(message) ? message : "generation failed"}\n`);
    return 1;
  }
}

function parseOptions(argv) {
  if (!Array.isArray(argv) || argv.length !== optionNames.size * 2) throw new Error("exact generation options required");
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!optionNames.has(argv[index]) || Object.hasOwn(result, argv[index]) || typeof argv[index + 1] !== "string" || argv[index + 1].length > 1024) throw new Error("generation option invalid");
    result[argv[index]] = argv[index + 1];
  }
  if (Object.keys(result).length !== optionNames.size || !path.isAbsolute(result["--repository-root"]) || !path.isAbsolute(result["--handoff-root"])) throw new Error("generation option set incomplete");
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
