import { parentPort, workerData } from "node:worker_threads";
import { runReviewPrompt } from "./codex-runner.mjs";

try {
  parentPort.postMessage({ ok: true, result: runReviewPrompt(workerData.config, workerData.packageInfo) });
} catch (error) {
  parentPort.postMessage({ ok: false, error: String(error?.message || error).slice(0, 240) });
}
