import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export function processAppearsActive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return null;
  }
}

export function acquireRunnerLock(config, metadata = {}) {
  const lockPath = path.join(config.logsRoot, "locks", "settleora-auto-runner.lock");
  if (existsSync(lockPath)) {
    let lock;
    try {
      lock = JSON.parse(readFileSync(lockPath, "utf8"));
    } catch {
      throw new Error(`Runner lock exists and cannot be parsed: ${lockPath}`);
    }
    const active = processAppearsActive(lock.pid);
    if (active === true) {
      throw new Error(`Runner lock is held by active pid ${lock.pid}`);
    }
    if (active === null) {
      throw new Error(`Runner lock exists and staleness cannot be safely determined: ${lockPath}`);
    }
    rmSync(lockPath);
  }
  writeFileSync(
    lockPath,
    `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), ...metadata }, null, 2)}\n`,
    { flag: "wx" },
  );
  return lockPath;
}

export function releaseRunnerLock(lockPath) {
  if (!lockPath || !existsSync(lockPath)) return;
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (lock.pid === process.pid) rmSync(lockPath);
  } catch {
    // Leave corrupt locks for human inspection.
  }
}

export function writeIterationState(config, iteration) {
  const issueKey = iteration.issue?.number ? `issue-${iteration.issue.number}` : "no-issue";
  const statePath = path.join(config.logsRoot, "state", `${iteration.runId}-${iteration.index}-${issueKey}.json`);
  writeFileSync(statePath, `${JSON.stringify(iteration, null, 2)}\n`);
  return statePath;
}

export function readRecentSummaries(config, sinceMs) {
  const summariesDir = path.join(config.logsRoot, "summaries");
  if (!existsSync(summariesDir)) return [];
  const cutoff = Date.now() - sinceMs;
  return readdirSync(summariesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(summariesDir, name))
    .filter((filePath) => {
      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8"));
        return Date.parse(parsed.finishedAt || parsed.startedAt || 0) >= cutoff;
      } catch {
        return false;
      }
    });
}
