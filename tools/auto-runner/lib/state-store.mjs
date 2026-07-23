import { closeSync, existsSync, lstatSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

export function processBirthId(pid = process.pid, { missingOk = false } = {}) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/u);
    if (!/^\d+$/u.test(String(fields[19] || ""))) throw new Error("process birth identity is unavailable");
    return fields[19];
  } catch (error) {
    if (missingOk && error?.code === "ENOENT") return null;
    throw error;
  }
}

export function acquireRunnerLock(config, metadata = {}) {
  const lockPath = path.join(config.logsRoot, "locks", "settleora-auto-runner.lock");
  const repositoryLockPath = repositoryAuthorityLockPath(config.repoRoot, undefined, config.runtimeMode === "external" ? config.repositorySlug : null);
  const acquired = [];
  let runtimeConsumerLock = null;
  try {
    if (config.runtimeMode === "external") runtimeConsumerLock = acquireRuntimeConsumer(config.runtimeRoot);
    for (const [target, repositoryAuthority] of [[repositoryLockPath, true], [lockPath, false]]) {
      acquireOneLock(target, {
        projectId: config.projectId,
        repositorySlug: config.repositorySlug,
        repoRoot: config.repoRoot,
        stateNamespace: config.runtimeIdentity?.namespace || null,
        ...metadata,
      }, { repositoryAuthority });
      acquired.push(target);
    }
  } catch (error) {
    for (const target of acquired.reverse()) releaseOneLock(target);
    releaseRuntimeConsumer(runtimeConsumerLock);
    throw error;
  }
  return { lockPath, repositoryLockPath, runtimeConsumerLock };
}

export function acquireOneLock(lockPath, metadata, { repositoryAuthority = false } = {}) {
  const owner = { pid: process.pid, processBirthId: processBirthId() };
  if (repositoryAuthority) {
    acquireRepositoryLockSerialized(lockPath, owner, metadata);
    return;
  }
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
    `${JSON.stringify({ ...metadata, ...owner, startedAt: new Date().toISOString() }, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
}

function acquireRepositoryLockSerialized(lockPath, owner, metadata) {
  const guard = `${lockPath}.acquire`;
  if (!existsSync(guard)) {
    try {
      const fd = openSync(guard, "wx", 0o600);
      closeSync(fd);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  const guardInfo = lstatSync(guard);
  if (!guardInfo.isFile() || guardInfo.isSymbolicLink() || (guardInfo.mode & 0o077) !== 0
      || (typeof process.getuid === "function" && guardInfo.uid !== process.getuid())) {
    throw new Error(`Repository authority acquisition guard is unsafe: ${guard}`);
  }
  const helper = fileURLToPath(new URL("./repository-lock-helper.mjs", import.meta.url));
  const result = spawnSync("/usr/bin/flock", [
    "--exclusive", "--timeout", "10", guard,
    process.execPath, helper, lockPath, JSON.stringify(owner), JSON.stringify(metadata),
  ], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || "Repository authority lock acquisition failed").trim().slice(0, 500));
  }
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
    if (lock.pid === process.pid && lock.processBirthId === processBirthId()) rmSync(lockPath);
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
