import { parentPort, workerData } from "node:worker_threads";
import { runReviewPrompt } from "./codex-runner.mjs";

let outcome;
try {
  outcome = { ok: true, result: runReviewPrompt(workerData.config, workerData.packageInfo) };
} catch (error) {
  outcome = { ok: false, error: String(error?.message || error).slice(0, 240) };
}
// Keep the worker alive until the parent receives the result. A normal exit
// without an acknowledged message is therefore a real review failure.
parentPort.once("message", (message) => {
  if (message?.acknowledged === true) parentPort.close();
});
parentPort.postMessage(outcome);
