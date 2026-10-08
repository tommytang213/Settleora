import { performance } from "node:perf_hooks";

const totalBudgetMs = 30_000;
const retryDelayMs = 250;

// Only this fixed GET command is retryable. Parsing and semantic validation
// belong to the caller, outside the transport retry boundary.
export function readGithubGetWithRetry({ route, command, options, now = () => performance.now(), sleep = sleepSync }) {
  if (typeof route !== "string" || !/^repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:[/?][^\s"\\\x00-\x1f\x7f]*)?$/u.test(route)) {
    throw new Error("GitHub GET route invalid");
  }
  const deadline = now() + totalBudgetMs;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = Math.floor(deadline - now());
    if (remaining < 1) throw deadlineError(lastError);
    let output;
    try {
      output = command("/usr/bin/gh", ["api", "--method", "GET", route], {
        ...options,
        timeout: remaining,
        // execFileSync otherwise waits indefinitely if a child ignores SIGTERM.
        killSignal: "SIGKILL",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      if (!isTransientTransportFailure(error, route)) throw error;
      if (attempt === 1) throw error;
      lastError = error;
      if (deadline - now() <= retryDelayMs) throw deadlineError(error);
      sleep(retryDelayMs);
      continue;
    }
    if (now() >= deadline) throw deadlineError(lastError);
    return output;
  }
}

function isTransientTransportFailure(error, route) {
  // Never retry a response body, HTTP error, signal, executable failure, or
  // process timeout alone: none proves a transient network failure.
  if (error?.status !== 1 || error.code != null || error.signal != null || String(error.stdout ?? "") !== "") return false;
  const stderr = String(error.stderr ?? "").trim();
  const prefix = `Get "https://api.github.com/${route}": `;
  if (!stderr.startsWith(prefix)) return false;
  const reason = stderr.slice(prefix.length);
  return /^(?:EOF|unexpected EOF|net\/http: TLS handshake timeout|context deadline exceeded \(Client\.Timeout exceeded while awaiting headers\)|dial tcp (?:[0-9.]+|\[[a-fA-F0-9:]+\]):443: i\/o timeout|read tcp (?:[0-9.]+|\[[a-fA-F0-9:]+\]):[0-9]+->(?:[0-9.]+|\[[a-fA-F0-9:]+\]):443: (?:i\/o timeout|read: connection reset by peer))$/u.test(reason);
}

function deadlineError(cause) {
  return Object.assign(new Error("GitHub GET retry deadline exceeded", { cause }), { code: "GITHUB_GET_DEADLINE" });
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
