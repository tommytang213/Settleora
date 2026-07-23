import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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
  const repository = verifyRepositoryIdentity(repoRoot, trusted ? config.repositorySlug : null);
  const runtimeRoot = canonicalExistingDirectory(config?.runtimeRoot || actualRuntimeRoot, "runtimeRoot");
  const logsRoot = canonicalExistingDirectory(config?.logsRoot, "logsRoot");
  if (runtimeRoot !== canonicalExistingDirectory(actualRuntimeRoot, "actual runtimeRoot")) {
    throw new Error("configured runtimeRoot does not match the executing runtime bundle");
  }
  if (trusted) {
    assertSeparatedRoots({ runtimeRoot, repoRoot, logsRoot });
    assertOwnerControlledDirectory(runtimeRoot, "runtimeRoot");
    assertOwnerControlledDirectory(canonicalExistingDirectory(path.dirname(runtimeRoot), "runtime deployment-control parent"), "runtime deployment-control parent");
  }
  const logsStat = statSync(logsRoot);
  if (trusted && path.basename(logsRoot) !== projectId) {
    throw new Error("trusted logsRoot must be project-bound by its terminal directory name");
  }
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
      .update(JSON.stringify([projectId, config.repositorySlug, repository.commonDir]))
      .digest("hex"),
    repositoryCommonDir: repository.commonDir,
    originUrl: repository.originUrl,
    pushUrl: repository.pushUrl,
  });
}

function assertOwnerControlledDirectory(directory, field) {
  const info = statSync(directory);
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw new Error(`${field} must be owned by the runner user`);
  }
  if ((info.mode & 0o022) !== 0) throw new Error(`${field} must not be group/world writable`);
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

export function matchAuthorizedSupervisorProcess({
  supervisorRunId,
  parentPid,
  parentCmdline,
  runtimeRoot = moduleRuntimeRoot(),
  active,
} = {}) {
  if (typeof supervisorRunId !== "string" || supervisorRunId.length === 0 || !Number.isSafeInteger(parentPid) || parentPid <= 1 || active !== true) return [];
  const argv = String(parentCmdline || "").split("\0").filter(Boolean);
  const expectedWorker = absoluteRuntimeEntry(runtimeRoot, "supervisor/settleora-auto-runner-worker.mjs");
  const worker = argv.findIndex((value) => value === expectedWorker);
  if (worker >= 0 && argv[worker + 1] === supervisorRunId) return [parentPid];
  const expectedLauncher = path.join(path.dirname(runtimeRoot), `.${path.basename(runtimeRoot)}.launcher.mjs`);
  const launcher = argv.findIndex((value) => value === expectedLauncher);
  const launcherShapeMatches = launcher >= 0
    && argv[launcher + 1] === "--runtime-root"
    && argv[launcher + 2] === runtimeRoot
    && argv[launcher + 3] === "--entry"
    && argv[launcher + 4] === "supervisor/settleora-auto-runner-worker.mjs"
    && argv[launcher + 5] === "--"
    && argv[launcher + 6] === supervisorRunId;
  return launcherShapeMatches ? [parentPid] : [];
}

export function repositoryAuthorityLockPath(repoRoot, authorityRoot = "/workspace/logs/auto-runner/repository-locks") {
  mkdirSync(authorityRoot, { recursive: true, mode: 0o700 });
  const authority = lstatSync(authorityRoot);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (authority.isSymbolicLink() || !authority.isDirectory() || realpathSync(authorityRoot) !== path.resolve(authorityRoot)) {
    throw new Error("repository authority root must be a canonical real directory");
  }
  if (currentUid !== null && authority.uid !== currentUid) throw new Error("repository authority root owner is invalid");
  if ((authority.mode & 0o022) !== 0) throw new Error("repository authority root must not be group/world writable");
  const repository = verifyRepositoryIdentity(canonicalExistingDirectory(repoRoot, "repoRoot"));
  return path.join(authorityRoot, `${createHash("sha256").update(repository.commonDir).digest("hex")}.lock`);
}

export function verifyRepositoryIdentity(repoRoot, expectedSlug = null) {
  const top = gitValue(repoRoot, ["rev-parse", "--show-toplevel"], "repository top-level");
  if (realpathSync(top) !== repoRoot) throw new Error("repoRoot must be the exact Git worktree top-level");
  const commonRaw = gitValue(repoRoot, ["rev-parse", "--git-common-dir"], "Git common directory");
  const commonDir = realpathSync(path.resolve(repoRoot, commonRaw));
  const originResult = spawnSync("git", ["remote", "get-url", "origin"], { cwd: repoRoot, encoding: "utf8", windowsHide: true });
  const originUrl = originResult.status === 0 ? originResult.stdout.trim() : null;
  const pushResult = spawnSync("git", ["remote", "get-url", "--push", "--all", "origin"], { cwd: repoRoot, encoding: "utf8", windowsHide: true });
  const pushUrls = pushResult.status === 0 ? pushResult.stdout.split(/\r?\n/u).filter(Boolean) : [];
  const pushUrl = pushUrls.length === 1 ? pushUrls[0] : null;
  if (expectedSlug && (!originUrl || repositorySlugFromRemote(originUrl) !== expectedSlug)) {
    throw new Error("repoRoot origin does not match repositorySlug");
  }
  if (expectedSlug && (!pushUrl || repositorySlugFromRemote(pushUrl) !== expectedSlug || !isApprovedGitHubRemote(pushUrl))) {
    throw new Error("repoRoot push URL does not match the approved GitHub repository");
  }
  return { topLevel: repoRoot, commonDir, originUrl, pushUrl };
}

function gitValue(cwd, args, label) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0 || !result.stdout.trim()) throw new Error(`Unable to verify ${label}`);
  return result.stdout.trim();
}

function repositorySlugFromRemote(remote) {
  const value = String(remote || "").replace(/\/+$/, "").replace(/\.git$/, "");
  const match = value.match(/(?:^|[:/])([^/:]+\/[^/]+)$/);
  if (!match) throw new Error("origin URL does not contain a repository slug");
  return match[1];
}

function isApprovedGitHubRemote(remote) {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?$/u.test(remote)
    || /^git@github\.com:[^/]+\/[^/]+(?:\.git)?$/u.test(remote)
    || /^ssh:\/\/git@github\.com\/[^/]+\/[^/]+(?:\.git)?$/u.test(remote);
}
