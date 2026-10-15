import { provisionPrivateFlutterSdk } from "./lib/private-flutter-sdk.mjs";
import path from "node:path";

const expected = "/workspace/logs/auto-runner/Settleora";
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--logs-root"
    || !path.isAbsolute(args[1]) || path.resolve(args[1]) !== args[1])) {
  throw new Error("Use --logs-root with a canonical absolute configured logs root");
}
const root = provisionPrivateFlutterSdk(args.length === 0 ? expected : args[1]);
console.log(`Pinned private Flutter SDK verified at ${root}`);
