import { existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

function processBirthId(pid, { missingOk = false } = {}) {
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

function trustedLock(lockPath) {
  const info = lstatSync(lockPath);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
      || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
    throw new Error("repository authority lock is unsafe");
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    throw new Error("repository authority lock is corrupt");
  }
  if (!Number.isSafeInteger(lock?.pid) || lock.pid <= 1
      || !/^\d+$/u.test(String(lock?.processBirthId || ""))) {
    throw new Error("repository authority lock identity is invalid");
  }
  return { info, lock };
}

export function acquireRepositoryAuthorityLock(lockPath, owner, metadata = {}) {
  if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 1
      || !/^\d+$/u.test(String(owner?.processBirthId || ""))
      || processBirthId(owner.pid, { missingOk: true }) !== owner.processBirthId) {
    throw new Error("repository authority requester identity is not active");
  }
  if (existsSync(lockPath)) {
    const { info, lock } = trustedLock(lockPath);
    const activeBirth = processBirthId(lock.pid, { missingOk: true });
    if (activeBirth === lock.processBirthId) {
      throw new Error(`repository authority lock is held by active pid ${lock.pid}`);
    }
    const quarantine = `${lockPath}.stale-${owner.pid}-${owner.processBirthId}`;
    renameSync(lockPath, quarantine);
    const moved = lstatSync(quarantine);
    if (moved.dev !== info.dev || moved.ino !== info.ino) {
      throw new Error("repository authority lock changed during stale recovery");
    }
    rmSync(quarantine);
  }
  writeFileSync(lockPath, `${JSON.stringify({
    ...metadata,
    pid: owner.pid,
    processBirthId: owner.processBirthId,
    startedAt: new Date().toISOString(),
  }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href && process.argv.length === 5) {
  try {
    acquireRepositoryAuthorityLock(process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4]));
  } catch (error) {
    process.stderr.write(`${String(error?.message || "repository authority lock acquisition failed").slice(0, 300)}\n`);
    process.exitCode = 1;
  }
}
