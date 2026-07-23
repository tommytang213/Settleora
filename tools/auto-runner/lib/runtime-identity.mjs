import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const runtimeIdentityVersion = 1;
export const projectIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function moduleRuntimeRoot(metaUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), "..");
}

export function canonicalExistingDirectory(value, field) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) {
    throw new Error(`${field} must be an absolute normalized path`);
  }
  if (!existsSync(value)) throw new Error(`${field} does not exist`);
  const info = lstatSync(value);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${field} must be a real directory`);
  const real = realpathSync(value);
  if (real !== value) throw new Error(`${field} must equal its realpath`);
  return real;
}

export function assertProjectId(value) {
  if (!projectIdPattern.test(String(value || "")) || String(value).includes("..")) {
    throw new Error("projectId must be a bounded filesystem-safe identifier");
  }
  return String(value);
}

export function isContained(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertSeparatedRoots({ runtimeRoot, repoRoot, logsRoot }) {
  const roots = { runtimeRoot, repoRoot, logsRoot };
  for (const [leftName, left] of Object.entries(roots)) {
    for (const [rightName, right] of Object.entries(roots)) {
      if (leftName >= rightName) continue;
      if (isContained(left, right) || isContained(right, left)) {
        throw new Error(`${leftName} and ${rightName} must be separate`);
      }
    }
  }
  if (isContained(runtimeRoot, path.join(repoRoot, ".git"))) {
    throw new Error("runtimeRoot must not resolve through the managed Git directory");
  }
}

export function validateProjectRuntimeIdentity(config, {
  actualRuntimeRoot = moduleRuntimeRoot(),
  trusted = config?.runtimeMode === "external",
} = {}) {
  const projectId = assertProjectId(config?.projectId);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(config?.repositorySlug || ""))) {
    throw new Error("repositorySlug must be an explicit owner/repository slug");
  }
  const repoRoot = canonicalExistingDirectory(config?.repoRoot, "repoRoot");
  const runtimeRoot = canonicalExistingDirectory(config?.runtimeRoot || actualRuntimeRoot, "runtimeRoot");
  const logsRoot = canonicalExistingDirectory(config?.logsRoot, "logsRoot");
  if (runtimeRoot !== canonicalExistingDirectory(actualRuntimeRoot, "actual runtimeRoot")) {
    throw new Error("configured runtimeRoot does not match the executing runtime bundle");
  }
  if (trusted) assertSeparatedRoots({ runtimeRoot, repoRoot, logsRoot });
  const logsStat = statSync(logsRoot);
  if (trusted && typeof process.getuid === "function" && logsStat.uid !== process.getuid()) {
    throw new Error("logsRoot must be owned by the runner user");
  }
  if (trusted && (logsStat.mode & 0o022) !== 0) throw new Error("logsRoot must not be group/world writable");
  return Object.freeze({
    version: runtimeIdentityVersion,
    projectId,
    repositorySlug: config.repositorySlug,
    runtimeRoot,
    repoRoot,
    logsRoot,
    namespace: createHash("sha256")
      .update(JSON.stringify([projectId, config.repositorySlug, repoRoot]))
      .digest("hex"),
  });
}

export function absoluteRuntimeEntry(runtimeRoot, relativeEntry) {
  if (typeof relativeEntry !== "string" || path.isAbsolute(relativeEntry)) {
    throw new Error("runtime entry must be a relative bundle path");
  }
  const target = path.resolve(runtimeRoot, relativeEntry);
  if (!isContained(target, runtimeRoot) || target === runtimeRoot) throw new Error("runtime entry escaped runtimeRoot");
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) {
    throw new Error(`runtime entry is missing or unsafe: ${relativeEntry}`);
  }
  const real = realpathSync(target);
  if (!isContained(real, runtimeRoot)) throw new Error("runtime entry realpath escaped runtimeRoot");
  return real;
}

export function repositoryAuthorityLockPath(repoRoot, authorityRoot = "/workspace/logs/auto-runner/repository-locks") {
  mkdirSync(authorityRoot, { recursive: true, mode: 0o700 });
  const canonicalRepo = canonicalExistingDirectory(repoRoot, "repoRoot");
  return path.join(authorityRoot, `${createHash("sha256").update(canonicalRepo).digest("hex")}.lock`);
}
