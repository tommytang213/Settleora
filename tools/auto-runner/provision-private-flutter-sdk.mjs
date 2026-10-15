import { provisionPrivateFlutterSdk } from "./lib/private-flutter-sdk.mjs";
import { loadPrivateFlutterProvisioningLogsRoot } from "./lib/config.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const defaultProvisioningLogsRoot = "/workspace/logs/auto-runner/Settleora";

export function resolveProvisioningLogsRoot(args, readProfile = loadPrivateFlutterProvisioningLogsRoot) {
  if (args.length === 0) return defaultProvisioningLogsRoot;
  if ((args.length !== 2 && args.length !== 4) || args[0] !== "--config"
      || !path.isAbsolute(args[1]) || path.resolve(args[1]) !== args[1]
      || (args.length === 4 && (args[2] !== "--logs-root"
        || !path.isAbsolute(args[3]) || path.resolve(args[3]) !== args[3]))) {
    throw new Error("Use --config with an approved external profile; --logs-root may only assert its configured root");
  }
  const configured = readProfile(args[1]);
  if (args.length === 4 && args[3] !== configured) {
    throw new Error("private Flutter logs root does not match approved external profile");
  }
  return configured;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = provisionPrivateFlutterSdk(resolveProvisioningLogsRoot(process.argv.slice(2)));
  console.log(`Pinned private Flutter SDK verified at ${root}`);
}
