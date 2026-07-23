import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizePersistedIteration } from "./evidence-sanitizer.mjs";
import { repositoryAuthorityLockPath } from "./runtime-identity.mjs";
import { acquireRuntimeConsumer, releaseRuntimeConsumer } from "./runtime-bundle.mjs";

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
  const repositoryLockPath = repositoryAuthorityLockPath(config.repoRoot);
  const acquired = [];
  let runtimeConsumerLock = null;
  try {
    if (config.runtimeMode === "external") runtimeConsumerLock = acquireRuntimeConsumer(config.runtimeRoot);
    for (const [target, allowStaleReclaim] of [[repositoryLockPath, false], [lockPath, true]]) {
      acquireOneLock(target, {
        projectId: config.projectId,
        repositorySlug: config.repositorySlug,
        repoRoot: config.repoRoot,
        stateNamespace: config.runtimeIdentity?.namespace || null,
        ...metadata,
      }, { allowStaleReclaim });
      acquired.push(target);
    }
  } catch (error) {
    for (const target of acquired.reverse()) releaseOneLock(target);
    releaseRuntimeConsumer(runtimeConsumerLock);
    throw error;
  }
  return { lockPath, repositoryLockPath, runtimeConsumerLock };
}

function acquireOneLock(lockPath, metadata, { allowStaleReclaim = true } = {}) {
  if (existsSync(lockPath)) {
    const observed = lstatSync(lockPath);
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
    if (!allowStaleReclaim) {
      throw new Error(`Repository authority lock is stale and requires explicit recovery: ${lockPath}`);
    }
    const quarantine = `${lockPath}.stale-${process.pid}-${Date.now()}`;
    renameSync(lockPath, quarantine);
    const moved = lstatSync(quarantine);
    if (moved.dev !== observed.dev || moved.ino !== observed.ino) {
      throw new Error(`Runner lock changed during stale reclamation: ${lockPath}`);
    }
    rmSync(quarantine);
  }
  writeFileSync(
    lockPath,
    `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), ...metadata }, null, 2)}\n`,
    { flag: "wx" },
  );
}

export function releaseRunnerLock(lockHandle) {
  const paths = typeof lockHandle === "string"
    ? [lockHandle]
    : [lockHandle?.lockPath, lockHandle?.repositoryLockPath].filter(Boolean);
  for (const lockPath of paths) releaseOneLock(lockPath);
  releaseRuntimeConsumer(lockHandle?.runtimeConsumerLock);
}

function releaseOneLock(lockPath) {
  if (!existsSync(lockPath)) return;
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
  writeFileSync(statePath, `${JSON.stringify(sanitizePersistedIteration(iteration), null, 2)}\n`);
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
