import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const runtimeIdentityVersion = 1;
export const projectIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// Admission is bound to the frozen runtime identity created by production
// startup, not to a mutable config envelope. Approved recovery code makes
// shallow config copies; those copies retain this source-owned identity while
// caller-created envelopes cannot mint a matching WeakMap key.
const admittedRepositoryWorktrees = new WeakMap();

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
  const repositorySlug = config.repositorySlug.toLowerCase();
  const repoRoot = canonicalExistingDirectory(config?.repoRoot, "repoRoot");
  const repository = verifyRepositoryIdentity(repoRoot, trusted ? config.repositorySlug : null);
  const runtimeRoot = canonicalExistingDirectory(config?.runtimeRoot || actualRuntimeRoot, "runtimeRoot");
  const logsRoot = canonicalExistingDirectory(config?.logsRoot, "logsRoot");
  if (runtimeRoot !== canonicalExistingDirectory(actualRuntimeRoot, "actual runtimeRoot")) {
    throw new Error("configured runtimeRoot does not match the executing runtime bundle");
  }
  if (trusted) {
    assertSeparatedRoots({ runtimeRoot, repoRoot, logsRoot });
    for (const [name, root] of [["runtimeRoot", runtimeRoot], ["logsRoot", logsRoot]]) {
      if (isContained(repository.commonDir, root) || isContained(root, repository.commonDir)) {
        throw new Error(`repository common directory and ${name} must be separate`);
      }
    }
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
    repositorySlug,
    runtimeRoot,
    repoRoot,
    logsRoot,
    namespace: createHash("sha256")
      .update(JSON.stringify([projectId, repositorySlug, repository.commonDir]))
      .digest("hex"),
    repositoryCommonDir: repository.commonDir,
    repositoryGitDir: repository.gitDir,
    repositoryIndexFile: repository.indexFile,
    repositoryEntryPath: repository.entryPath,
    repositoryEntryIdentity: repository.entryIdentity,
    repositoryGitDirIdentity: repository.gitDirIdentity,
    repositoryCommonDirIdentity: repository.commonDirIdentity,
    repositoryMetadataIdentity: repository.guardedMetadataIdentity,
    originUrl: repository.originUrl,
    pushUrl: repository.pushUrl,
  });
}

export function hasVerifiedExternalRuntimeEvidence(config = {}) {
  const identity = config.runtimeIdentity;
  const manifest = config.runtimeManifest;
  return Boolean(
    config.runtimeMode === "external" &&
    Object.isFrozen(identity) &&
    Object.isFrozen(manifest) &&
    identity?.version === 1 &&
    identity.projectId === config.projectId &&
    identity.repositorySlug === String(config.repositorySlug || "").toLowerCase() &&
    identity.runtimeRoot === config.runtimeRoot &&
    identity.repoRoot === (config.controlPlaneRepoRoot || config.repoRoot) &&
    identity.logsRoot === config.logsRoot &&
    typeof identity.namespace === "string" &&
    /^[a-f0-9]{64}$/.test(identity.namespace) &&
    manifest?.bundleDigest === config.runtimeBundleDigest &&
    /^[a-f0-9]{64}$/.test(String(manifest?.bundleDigest || "")) &&
    /^[a-f0-9]{40}$/.test(String(manifest?.sourceSha || "")),
  );
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

export function repositoryAuthorityLockPath(repoRoot, authorityRoot = "/workspace/logs/auto-runner/repository-locks", repositorySlug = null) {
  mkdirSync(authorityRoot, { recursive: true, mode: 0o700 });
  const authority = lstatSync(authorityRoot);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (authority.isSymbolicLink() || !authority.isDirectory() || realpathSync(authorityRoot) !== path.resolve(authorityRoot)) {
    throw new Error("repository authority root must be a canonical real directory");
  }
  if (currentUid !== null && authority.uid !== currentUid) throw new Error("repository authority root owner is invalid");
  if ((authority.mode & 0o022) !== 0) throw new Error("repository authority root must not be group/world writable");
  const repository = verifyRepositoryIdentity(canonicalExistingDirectory(repoRoot, "repoRoot"), repositorySlug);
  const authorityIdentity = repositorySlug ? `github.com/${repositorySlug.toLowerCase()}` : repository.commonDir;
  return path.join(authorityRoot, `${createHash("sha256").update(authorityIdentity).digest("hex")}.lock`);
}

export function verifyRepositoryIdentity(repoRoot, expectedSlug = null) {
  const context = sourceOwnedIdentityGitContext(repoRoot);
  assertIdentityGitConfig(context);
  const top = gitValue(context, ["rev-parse", "--show-toplevel"], "repository top-level");
  if (realpathSync(top) !== repoRoot) throw new Error("repoRoot must be the exact Git worktree top-level");
  const commonRaw = gitValue(context, ["rev-parse", "--git-common-dir"], "Git common directory");
  const commonDir = realpathSync(path.resolve(repoRoot, commonRaw));
  const originResult = runIdentityGit(context, ["remote", "get-url", "origin"]);
  const originUrl = originResult.status === 0 ? originResult.stdout.trim() : null;
  const pushResult = runIdentityGit(context, ["remote", "get-url", "--push", "--all", "origin"]);
  const pushUrls = pushResult.status === 0 ? pushResult.stdout.split(/\r?\n/u).filter(Boolean) : [];
  const pushUrl = pushUrls.length === 1 ? pushUrls[0] : null;
  const normalizedExpectedSlug = expectedSlug?.toLowerCase() || null;
  if (expectedSlug && (!originUrl || repositorySlugFromRemote(originUrl)?.toLowerCase() !== normalizedExpectedSlug || !isApprovedGitHubRemote(originUrl))) {
    throw new Error("repoRoot origin does not match repositorySlug");
  }
  if (expectedSlug && (!pushUrl || repositorySlugFromRemote(pushUrl)?.toLowerCase() !== normalizedExpectedSlug || !isApprovedGitHubRemote(pushUrl))) {
    throw new Error("repoRoot push URL does not match the approved GitHub repository");
  }
  return {
    topLevel: repoRoot,
    commonDir,
    gitDir: context.gitDir,
    indexFile: context.indexFile,
    entryPath: context.entryPath,
    entryIdentity: context.entryIdentity,
    gitDirIdentity: context.gitDirIdentity,
    commonDirIdentity: context.commonDirIdentity,
    guardedMetadataIdentity: context.guardedMetadata.identity,
    originUrl,
    pushUrl,
  };
}

export function assertRepositoryRemoteIdentity(config) {
  if (config?.runtimeMode !== "external") return null;
  const expected = config?.runtimeIdentity;
  if (!expected?.repoRoot || !expected?.originUrl || !expected?.pushUrl || !expected?.repositoryCommonDir
    || !expected?.repositoryGitDir || !expected?.repositoryIndexFile
    || !expected?.repositoryEntryPath || !expected?.repositoryEntryIdentity
    || !expected?.repositoryGitDirIdentity || !expected?.repositoryCommonDirIdentity
    || !expected?.repositoryMetadataIdentity || !config?.repositorySlug) {
    throw new Error("verified repository remote identity is required before a remote Git operation");
  }
  const current = verifyRepositoryIdentity(config.repoRoot, config.repositorySlug);
  const admitted = admittedRepositoryWorktrees.get(expected)?.get(current.topLevel);
  const exactExpected = current.topLevel === expected.repoRoot ? {
    topLevel: expected.repoRoot,
    commonDir: expected.repositoryCommonDir,
    gitDir: expected.repositoryGitDir,
    indexFile: expected.repositoryIndexFile,
    entryPath: expected.repositoryEntryPath,
    entryIdentity: expected.repositoryEntryIdentity,
    gitDirIdentity: expected.repositoryGitDirIdentity,
    commonDirIdentity: expected.repositoryCommonDirIdentity,
    guardedMetadataIdentity: expected.repositoryMetadataIdentity,
    originUrl: expected.originUrl,
    pushUrl: expected.pushUrl,
  } : admitted;
  if (!exactExpected || !sameRepositoryIdentity(current, exactExpected)
    || current.commonDir !== expected.repositoryCommonDir
    || current.commonDirIdentity !== expected.repositoryCommonDirIdentity
    || sharedCommonMetadataIdentity(current.guardedMetadataIdentity, current.commonDir)
      !== sharedCommonMetadataIdentity(expected.repositoryMetadataIdentity, expected.repositoryCommonDir)
    || current.originUrl !== expected.originUrl || current.pushUrl !== expected.pushUrl) {
    throw new Error("repository remote identity changed after runtime admission");
  }
  return Object.freeze({ originUrl: current.originUrl, pushUrl: current.pushUrl });
}

export function admitRepositoryWorktreeRemoteIdentity(config, repoRoot) {
  if (config?.runtimeMode !== "external") return null;
  const expected = config?.runtimeIdentity;
  if (!expected?.repoRoot || !expected?.repositoryCommonDir
    || !expected?.repositoryCommonDirIdentity || !expected?.repositoryMetadataIdentity
    || !expected?.originUrl || !expected?.pushUrl || !config?.repositorySlug) {
    throw new Error("verified control-plane repository identity is required before worktree admission");
  }
  const current = verifyRepositoryIdentity(repoRoot, config.repositorySlug);
  if (current.topLevel === expected.repoRoot
    || current.commonDir !== expected.repositoryCommonDir
    || current.commonDirIdentity !== expected.repositoryCommonDirIdentity
    || sharedCommonMetadataIdentity(current.guardedMetadataIdentity, current.commonDir)
      !== sharedCommonMetadataIdentity(expected.repositoryMetadataIdentity, expected.repositoryCommonDir)
    || current.originUrl !== expected.originUrl || current.pushUrl !== expected.pushUrl) {
    throw new Error("historical task worktree does not share the admitted repository authority");
  }
  const admitted = Object.freeze({ ...current });
  let admissions = admittedRepositoryWorktrees.get(expected);
  if (!admissions) {
    admissions = new Map();
    admittedRepositoryWorktrees.set(expected, admissions);
  }
  admissions.set(current.topLevel, admitted);
  return admitted;
}

export function restoreControlPlaneRepositoryRemoteIdentity(config) {
  const expected = config?.runtimeIdentity;
  const admissions = expected && admittedRepositoryWorktrees.get(expected);
  if (!admissions) return;
  admissions.delete(path.resolve(config?.repoRoot || ""));
  if (admissions.size === 0) admittedRepositoryWorktrees.delete(expected);
}

function sameRepositoryIdentity(current, expected) {
  return current.topLevel === expected.topLevel
    && current.commonDir === expected.commonDir
    && current.gitDir === expected.gitDir
    && current.indexFile === expected.indexFile
    && current.entryPath === expected.entryPath
    && current.entryIdentity === expected.entryIdentity
    && current.gitDirIdentity === expected.gitDirIdentity
    && current.commonDirIdentity === expected.commonDirIdentity
    && current.guardedMetadataIdentity === expected.guardedMetadataIdentity
    && current.originUrl === expected.originUrl
    && current.pushUrl === expected.pushUrl;
}

function sharedCommonMetadataIdentity(identity, commonDir) {
  const shared = new Set([
    path.join(commonDir, "config"), path.join(commonDir, "info", "attributes"),
    path.join(commonDir, "info", "exclude"), path.join(commonDir, "info", "grafts"),
    path.join(commonDir, "objects", "info", "alternates"),
    path.join(commonDir, "objects", "info", "http-alternates"), path.join(commonDir, "shallow"),
  ]);
  return String(identity || "").split("\n").filter((record) => {
    const separator = record.indexOf(":");
    return separator > 0 && shared.has(record.slice(0, separator));
  }).sort().join("\n");
}

function gitValue(context, args, label) {
  const result = runIdentityGit(context, args);
  if (result.error || result.status !== 0 || !result.stdout.trim()) throw new Error(`Unable to verify ${label}`);
  return result.stdout.trim();
}

function sourceOwnedIdentityGitContext(repoRoot) {
  const root = canonicalExistingDirectory(repoRoot, "repoRoot");
  const entryPath = path.join(root, ".git");
  const entry = lstatSync(entryPath);
  if ((!entry.isDirectory() && !entry.isFile()) || entry.isSymbolicLink()
    || (typeof process.getuid === "function" && entry.uid !== process.getuid())) {
    throw new Error("repository Git entry is unsafe");
  }
  const probe = spawnSync("/usr/bin/git", identityGitArgs(root, [
    "rev-parse", "--path-format=absolute", "--absolute-git-dir", "--git-common-dir", "--show-toplevel",
  ]), { cwd: root, env: pureIdentityGitEnvironment(), encoding: "utf8", windowsHide: true });
  if (probe.error || probe.status !== 0) throw new Error("Unable to verify repository Git context");
  const [gitDirRaw, commonDirRaw, topRaw, ...extra] = probe.stdout.trimEnd().split("\n");
  if (extra.length || realpathSync(topRaw) !== root) throw new Error("repository Git context mismatch");
  const gitDir = realpathSync(gitDirRaw);
  const commonDir = realpathSync(commonDirRaw);
  const context = {
    root, entryPath, entryIdentity: stableGitPathIdentity(entry), gitDir, commonDir,
    gitDirIdentity: stableGitDirectoryIdentity(lstatSync(gitDir)),
    commonDirIdentity: stableGitDirectoryIdentity(lstatSync(commonDir)),
    indexFile: path.join(gitDir, "index"),
    guardedMetadata: identityGitMetadataSnapshot(gitDir, commonDir),
  };
  if (!identityGitContextStable(context)) throw new Error("repository Git context changed during admission");
  return context;
}

function runIdentityGit(context, args) {
  const result = spawnSync("/usr/bin/git", identityGitArgs(context.root, args), {
    cwd: context.root,
    env: identityGitEnvironment(context),
    encoding: "utf8",
    windowsHide: true,
  });
  if (!identityGitContextStable(context)) {
    return { status: 128, stdout: "", stderr: "repository Git context changed during read", error: null };
  }
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error || null };
}

function identityGitArgs(root, args) {
  return [
    "--no-replace-objects", "-c", "credential.helper=", "-c", "core.attributesFile=/dev/null",
    "-c", "core.excludesFile=/dev/null", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null",
    "-c", `core.worktree=${root}`, "-c", "diff.external=", "-c", "protocol.ext.allow=never",
    "-c", "protocol.file.allow=never", ...args,
  ];
}

function pureIdentityGitEnvironment() {
  return { PATH: "/usr/bin:/bin", GIT_ATTR_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "/dev/null", GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1", GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LANG: "C", LC_ALL: "C" };
}

function identityGitEnvironment(context) {
  return { ...pureIdentityGitEnvironment(), GIT_COMMON_DIR: context.commonDir, GIT_DIR: context.gitDir,
    GIT_INDEX_FILE: context.indexFile, GIT_WORK_TREE: context.root };
}

function identityGitContextStable(context) {
  try {
    return stableGitPathIdentity(lstatSync(context.entryPath)) === context.entryIdentity
      && stableGitDirectoryIdentity(lstatSync(context.gitDir)) === context.gitDirIdentity
      && stableGitDirectoryIdentity(lstatSync(context.commonDir)) === context.commonDirIdentity
      && identityGitMetadataSnapshot(context.gitDir, context.commonDir).identity === context.guardedMetadata.identity;
  } catch { return false; }
}

function identityGitMetadataSnapshot(gitDir, commonDir) {
  const entries = [...new Set([
    path.join(commonDir, "config"), path.join(gitDir, "config.worktree"),
    path.join(commonDir, "packed-refs"),
    path.join(commonDir, "info", "attributes"), path.join(commonDir, "info", "exclude"),
    path.join(commonDir, "info", "grafts"),
    path.join(commonDir, "objects", "info", "alternates"),
    path.join(commonDir, "objects", "info", "http-alternates"),
    path.join(commonDir, "shallow"), path.join(gitDir, "shallow"),
  ])]
    .sort().map((metadataPath) => {
      if (!existsSync(metadataPath)) return `${metadataPath}:absent`;
      const info = lstatSync(metadataPath);
      if (!info.isFile() || info.isSymbolicLink()
        || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
        throw new Error("repository Git config path is unsafe");
      }
      if (/(?:\/info\/grafts|\/objects\/info\/(?:http-)?alternates|\/shallow)$/u.test(metadataPath)) {
        throw new Error("repository graph-rewriting Git metadata is active");
      }
      return `${metadataPath}:${stableGitPathIdentity(info)}`;
    });
  return { identity: [...entries, identityGitReferenceNamespace(commonDir)].join("\n") };
}

function identityGitReferenceNamespace(commonDir) {
  const root = path.join(commonDir, "refs");
  const rootInfo = lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()
    || (typeof process.getuid === "function" && rootInfo.uid !== process.getuid())) {
    throw new Error("repository Git refs namespace is unsafe");
  }
  const pending = [root];
  let inspected = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (++inspected > 4096) throw new Error("repository Git refs namespace is unbounded");
      const candidate = path.join(current, entry.name);
      const info = lstatSync(candidate);
      if (entry.isSymbolicLink() || info.isSymbolicLink()
        || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
        throw new Error("repository Git refs namespace is unsafe");
      }
      if (info.isDirectory()) {
        pending.push(candidate);
      } else if (!info.isFile()) {
        throw new Error("repository Git refs namespace is unsafe");
      }
    }
  }
  return `${root}:${stableGitDirectoryIdentity(rootInfo)}`;
}

function stableGitPathIdentity(info) {
  return info.isDirectory() ? stableGitDirectoryIdentity(info)
    : [info.dev, info.ino, info.mode, info.uid, info.size, info.mtimeMs, info.ctimeMs].join(":");
}

function stableGitDirectoryIdentity(info) {
  if (!info.isDirectory() || info.isSymbolicLink()
    || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
    throw new Error("repository Git directory is unsafe");
  }
  return [info.dev, info.ino, info.mode, info.uid].join(":");
}

function assertIdentityGitConfig(context) {
  const allowed = [
    /^core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|worktree)$/u,
    /^extensions\.worktreeconfig$/u,
    /^remote\.origin\.(?:url|pushurl|fetch)$/u,
    /^branch\..+\.(?:remote|merge)$/u,
    /^user\.(?:name|email)$/u,
  ];
  const local = runIdentityGit(context, ["config", "--local", "--name-only", "--list"]);
  if (local.error || local.status !== 0
    || local.stdout.split("\n").filter(Boolean).some((key) => !allowed.some((pattern) => pattern.test(key)))) {
    throw new Error("repository Git config is unsafe");
  }
  const extension = runIdentityGit(context, ["config", "--local", "--get", "extensions.worktreeConfig"]);
  if (extension.status === 1) return;
  if (extension.error || extension.status !== 0 || extension.stdout.trim().toLowerCase() !== "true") {
    throw new Error("repository Git worktree config is unsafe");
  }
  const worktree = runIdentityGit(context, ["config", "--worktree", "--name-only", "--list"]);
  if (worktree.error || worktree.status !== 0
    || worktree.stdout.split("\n").filter(Boolean).some((key) => !allowed.some((pattern) => pattern.test(key)))) {
    throw new Error("repository Git worktree config is unsafe");
  }
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

export function canonicalApprovedGitHubRepository(remote) {
  try {
    return isApprovedGitHubRemote(String(remote || ""))
      ? repositorySlugFromRemote(remote).toLowerCase()
      : null;
  } catch {
    return null;
  }
}
