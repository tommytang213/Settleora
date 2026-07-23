import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
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

function canonicalAuthorityLockPath(candidate) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate) || path.resolve(candidate) !== candidate) {
    throw new Error("repository authority lock path is invalid");
  }
  const name = path.basename(candidate);
  if (!/^[a-f0-9]{64}\.lock$/u.test(name)) throw new Error("repository authority lock name is invalid");
  const parent = realpathSync(path.dirname(candidate));
  const parentInfo = lstatSync(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()
      || (parentInfo.mode & 0o022) !== 0
      || (typeof process.getuid === "function" && parentInfo.uid !== process.getuid())) {
    throw new Error("repository authority lock parent is unsafe");
  }
  const rebuilt = path.join(parent, name);
  if (rebuilt !== candidate) throw new Error("repository authority lock path escaped its canonical parent");
  return rebuilt;
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
  const target = canonicalAuthorityLockPath(lockPath);
  if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 1
      || !/^\d+$/u.test(String(owner?.processBirthId || ""))
      || processBirthId(owner.pid, { missingOk: true }) !== owner.processBirthId) {
    throw new Error("repository authority requester identity is not active");
  }
  if (existsSync(target)) {
    const { info, lock } = trustedLock(target);
    const activeBirth = processBirthId(lock.pid, { missingOk: true });
    if (activeBirth === lock.processBirthId) {
      throw new Error(`repository authority lock is held by active pid ${lock.pid}`);
    }
    const quarantine = `${target}.stale-${owner.pid}-${owner.processBirthId}`;
    renameSync(target, quarantine);
    const moved = lstatSync(quarantine);
    if (moved.dev !== info.dev || moved.ino !== info.ino) {
      throw new Error("repository authority lock changed during stale recovery");
    }
    rmSync(quarantine);
  }
  writeFileSync(target, `${JSON.stringify({
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
