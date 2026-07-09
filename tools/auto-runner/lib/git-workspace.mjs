import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    command: `git ${args.join(" ")}`,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

export function assertGitSuccess(result, message) {
  if (result.error || result.status !== 0) {
    throw new Error(`${message}\n${result.command}\n${result.stderr || result.stdout || result.error}`);
  }
}

export function getCurrentBranch() {
  const result = runGit(["branch", "--show-current"]);
  assertGitSuccess(result, "Unable to read current branch");
  return result.stdout.trim();
}

export function getRefSha(ref) {
  const result = runGit(["rev-parse", ref]);
  assertGitSuccess(result, `Unable to resolve ${ref}`);
  return result.stdout.trim();
}

export function getStatusShort() {
  const result = runGit(["status", "--short"]);
  assertGitSuccess(result, "Unable to read git status");
  return result.stdout.trim();
}

export function ensureTaskStartWorkspace(config, logger) {
  const status = getStatusShort();
  const branch = getCurrentBranch();
  const originMainSha = getRefSha("origin/main");
  if (status && config.run) {
    throw new Error("Refusing real-run task start with a dirty worktree");
  }
  if (branch === "main" && config.run) {
    throw new Error("Refusing real-run task start from main");
  }
  if (status && config.dryRun) {
    logger.warn("Dry-run observed a dirty worktree; real-run task start would refuse to proceed.", { status });
  }
  return { branch, originMainSha, dirty: Boolean(status), status };
}

export function fetchOriginMain(config) {
  if (config.dryRun) {
    return { skipped: true, reason: "dry-run" };
  }
  const result = runGit(["fetch", "origin", "main"]);
  assertGitSuccess(result, "Unable to fetch origin/main");
  return { skipped: false, status: result.status };
}

export function createTaskBranch(config, branchName) {
  if (config.dryRun) {
    return { skipped: true, branchName, reason: "dry-run" };
  }
  const result = runGit(["switch", "-C", branchName, "origin/main"]);
  assertGitSuccess(result, `Unable to create task branch ${branchName}`);
  return { skipped: false, branchName };
}

export function listChangedFiles(baseRef = "origin/main", headRef = "HEAD") {
  const tracked = runGit(["diff", "--name-only", `${baseRef}...${headRef}`]);
  assertGitSuccess(tracked, "Unable to list tracked changed files");
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
  assertGitSuccess(untracked, "Unable to list untracked files");
  return [...tracked.stdout.split(/\r?\n/), ...untracked.stdout.split(/\r?\n/)]
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

export function listWorkingTreeChangedFiles(options = {}) {
  const unstaged = runGit(["diff", "--name-only"], options);
  assertGitSuccess(unstaged, "Unable to list unstaged changed files");
  const staged = runGit(["diff", "--cached", "--name-only"], options);
  assertGitSuccess(staged, "Unable to list staged changed files");
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], options);
  assertGitSuccess(untracked, "Unable to list untracked files");
  return dedupeSorted([
    ...unstaged.stdout.split(/\r?\n/),
    ...staged.stdout.split(/\r?\n/),
    ...untracked.stdout.split(/\r?\n/),
  ]);
}

export function diffHash(baseRef = "origin/main", headRef = "HEAD") {
  const result = runGit(["diff", "--binary", `${baseRef}...${headRef}`]);
  assertGitSuccess(result, "Unable to read diff");
  return createHash("sha256").update(result.stdout).digest("hex");
}

export function workingTreeDiffHash() {
  return createHash("sha256").update(getWorkingTreeDiffText()).digest("hex");
}

export function getBoundedDiff(baseRef = "origin/main", headRef = "HEAD", maxChars = 120000) {
  const result = runGit(["diff", "--binary", `${baseRef}...${headRef}`]);
  assertGitSuccess(result, "Unable to read diff");
  if (result.stdout.length <= maxChars) {
    return { truncated: false, text: result.stdout };
  }
  return { truncated: true, text: result.stdout.slice(0, maxChars) };
}

export function getBoundedWorkingTreeDiff(maxChars = 120000) {
  const text = getWorkingTreeDiffText();
  if (text.length <= maxChars) {
    return { truncated: false, text };
  }
  return { truncated: true, text: text.slice(0, maxChars) };
}

export function commitExplicitPaths(config, files, message) {
  if (files.length === 0) return { skipped: true, reason: "no-changes" };
  if (config.dryRun) return { skipped: true, reason: "dry-run", files };
  const add = runGit(["add", "--", ...files]);
  assertGitSuccess(add, "Unable to stage explicit paths");
  const commit = runGit(["commit", "-m", message]);
  assertGitSuccess(commit, "Unable to create commit");
  return { skipped: false, files, commit: commit.stdout.trim() };
}

function dedupeSorted(lines) {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))].sort();
}

function getWorkingTreeDiffText() {
  const unstaged = runGit(["diff", "--binary"]);
  assertGitSuccess(unstaged, "Unable to read unstaged diff");
  const staged = runGit(["diff", "--cached", "--binary"]);
  assertGitSuccess(staged, "Unable to read staged diff");
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
  assertGitSuccess(untracked, "Unable to list untracked files for diff");
  const untrackedDiffs = dedupeSorted(untracked.stdout.split(/\r?\n/)).map((file) => {
    const result = runGit(["diff", "--no-index", "--binary", "--", "/dev/null", file]);
    if (result.error || ![0, 1].includes(result.status)) {
      throw new Error(`Unable to read untracked diff for ${file}\n${result.command}\n${result.stderr || result.stdout || result.error}`);
    }
    return result.stdout || "";
  });
  return `${staged.stdout || ""}${unstaged.stdout || ""}${untrackedDiffs.join("")}`;
}
