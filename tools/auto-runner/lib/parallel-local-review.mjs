import { Worker } from "node:worker_threads";

// runReviewPrompt uses spawnSync. Run it in a worker so the independent CLI
// reviewer can make progress at the same time, against the same frozen package.
export function runCodexReviewInWorker(config, packageInfo) {
  return new Promise((resolve) => {
    let worker;
    try {
      // Live runner config includes an operational checkpoint callback. It is
      // controller state, not review input, and cannot cross a worker boundary.
      const reviewConfig = JSON.parse(JSON.stringify(config, (_key, value) =>
        typeof value === "function" ? undefined : value));
      worker = new Worker(new URL("./codex-review-worker.mjs", import.meta.url), {
        workerData: { config: reviewConfig, packageInfo },
      });
    } catch (error) {
      resolve(failed(error?.message));
      return;
    }
    let settled = false;
    const timeout = setTimeout(() => {
      finish(failed("worker_timeout"));
      void worker.terminate();
    }, 31 * 60 * 1000);
    timeout.unref();
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    worker.once("message", (message) => finish(message.ok ? message.result : failed(message.error)));
    worker.once("error", (error) => finish(failed(error?.message)));
    worker.once("exit", (code) => finish(failed(`worker_exit_${code}_without_result`)));
  });
}

function failed(reason) {
  return { skipped: false, reviewStatus: "unable_to_review", reviewFailureReason: String(reason || "worker_failed").slice(0, 240),
    verdict: { verdict: "unable_to_review" }, completedAt: new Date().toISOString() };
}
