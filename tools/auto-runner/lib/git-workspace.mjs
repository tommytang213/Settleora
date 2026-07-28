import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, realpathSync, rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { providerBoundReviewDiffChars } from "./review-secret-boundary.mjs";
import { executeCanonicalEffect } from "./canonical-effect-executor.mjs";
import { findPreEffectIntents, loadPreEffectIntent, preparePreEffectIntent } from "./pre-effect-intent.mjs";
import { assertMutationAuthority, loadSessionLifecycleState, persistSessionLifecycleState } from "./session-lifecycle.mjs";
import { assertRepositoryRemoteIdentity } from "./runtime-identity.mjs";

let trustedRepositoryContext = null;

export function bindTrustedRepositoryContext(repoRoot) {
  const canonical = path.resolve(repoRoot || "");
  if (!path.isAbsolute(repoRoot || "") || canonical !== repoRoot) {
    throw new Error("trusted repository context requires an absolute normalized repoRoot");
  }
  if (trustedRepositoryContext && trustedRepositoryContext !== canonical) {
    throw new Error("trusted repository context cannot be rebound to another repository");
  }
  trustedRepositoryContext = canonical;
  return canonical;
}

export function adoptHistoricalTaskWorkspace(config, {
  branchName, headSha, taskKey,
} = {}) {
  const controlRoot = path.resolve(config?.controlPlaneRepoRoot || config?.repoRoot || "");
  if (!/^[a-f0-9]{40}$/u.test(headSha || "")
    || typeof branchName !== "string" || !branchName.length
    || !path.isAbsolute(controlRoot)
    || ![controlRoot, path.resolve(config?.repoRoot || "")].includes(trustedRepositoryContext)) {
    throw new Error("historical task workspace authority is incomplete");
  }
  const literalRef = `refs/heads/${branchName}`;
  const ref = runGit(["rev-parse", "--verify", literalRef], { cwd: controlRoot });
  assertGitSuccess(ref, "Unable to authenticate historical task branch");
  if (ref.stdout.trim() !== headSha) {
    throw new Error("Historical task branch ref drifted from the authenticated candidate");
  }
  const controlCommonDir = canonicalGitCommonDir(controlRoot);
  const listed = runGit(["worktree", "list", "--porcelain"], { cwd: controlRoot });
  assertGitSuccess(listed, "Unable to inventory linked worktrees");
  const matches = parseWorktrees(listed.stdout).filter((entry) => entry.branch === literalRef);
  if (matches.length > 1) throw new Error("Historical task branch has conflicting linked worktrees");
  let taskRoot = matches[0]?.worktree || null;
  if (!taskRoot) {
    const logsRoot = path.resolve(config?.logsRoot || "");
    if (!path.isAbsolute(logsRoot) || !existsSync(logsRoot)) {
      throw new Error("Historical task worktree logs authority is unavailable");
    }
    const parent = path.join(logsRoot, "task-worktrees");
    if (existsSync(parent)) {
      const info = lstatSync(parent);
      if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(parent) !== parent) {
        throw new Error("Historical task worktree parent is untrusted");
      }
      if ((info.mode & 0o022) !== 0
        || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
        throw new Error("Historical task worktree parent ownership is untrusted");
      }
    } else {
      mkdirSync(parent, { recursive: false, mode: 0o700 });
    }
    const identity = createHash("sha256")
      .update(JSON.stringify([config.repositorySlug, taskKey, branchName, headSha]))
      .digest("hex").slice(0, 20);
    taskRoot = path.join(parent, `recovery-${identity}`);
    if (existsSync(taskRoot)) {
      const target = lstatSync(taskRoot);
      if (!target.isDirectory() || target.isSymbolicLink() || realpathSync(taskRoot) !== taskRoot
        || (target.mode & 0o077) !== 0 || readdirSync(taskRoot).length !== 0
        || (typeof process.getuid === "function" && target.uid !== process.getuid())) {
        throw new Error("Historical task worktree target already exists ambiguously");
      }
    } else {
      mkdirSync(taskRoot, { mode: 0o700 });
    }
    const created = runFixedTrustedGit(controlRoot, [
      "-c", "core.hooksPath=/dev/null",
      "worktree", "add", "--", taskRoot, branchName,
    ]);
    assertGitSuccess(created, "Unable to materialize historical task worktree");
  }
  const taskInfo = lstatSync(taskRoot);
  if (!taskInfo.isDirectory() || taskInfo.isSymbolicLink()
    || (taskInfo.mode & 0o022) !== 0
    || (typeof process.getuid === "function" && taskInfo.uid !== process.getuid())) {
    throw new Error(`Historical task worktree artifact is untrusted: directory=${taskInfo.isDirectory()}; symlink=${taskInfo.isSymbolicLink()}; writable=${(taskInfo.mode & 0o022) !== 0}; owner=${typeof process.getuid !== "function" || taskInfo.uid === process.getuid()}`);
  }
  const canonicalTaskRoot = realpathSync(taskRoot);
  if (canonicalTaskRoot !== path.resolve(taskRoot)) {
    throw new Error("Historical task worktree path is non-canonical");
  }
  const taskCommonDir = canonicalGitCommonDir(canonicalTaskRoot);
  const taskBranch = getCurrentBranch({ cwd: canonicalTaskRoot });
  const taskHead = getRefSha("HEAD", { cwd: canonicalTaskRoot });
  const taskStatus = getStatusShort({ cwd: canonicalTaskRoot });
  if (canonicalTaskRoot === controlRoot || taskCommonDir !== controlCommonDir
    || taskBranch !== branchName || taskHead !== headSha || taskStatus !== "") {
    throw new Error(`Historical task worktree failed exact authority checks: sameRoot=${canonicalTaskRoot === controlRoot}; commonDir=${taskCommonDir === controlCommonDir}; branch=${taskBranch === branchName}; head=${taskHead === headSha}; clean=${taskStatus === ""}`);
  }
  trustedRepositoryContext = canonicalTaskRoot;
  config.controlPlaneRepoRoot = controlRoot;
  config.repoRoot = canonicalTaskRoot;
  process.chdir(canonicalTaskRoot);
  return { controlRoot, taskRoot: canonicalTaskRoot, branchName, headSha };
}

function canonicalGitCommonDir(cwd) {
  const result = runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd });
  assertGitSuccess(result, "Unable to resolve Git common directory");
  return realpathSync(result.stdout.trim());
}

function parseWorktrees(value) {
  const result = [];
  let current = null;
  for (const line of String(value || "").split(/\r?\n/u)) {
    if (line.startsWith("worktree ")) {
      if (current) result.push(current);
      current = { worktree: path.resolve(line.slice(9)), branch: null };
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice(7);
    } else if (current && line === "") {
      result.push(current);
      current = null;
    }
  }
  if (current) result.push(current);
  return result;
}

export function runGit(args, options = {}) {
  const cwd = options.cwd || trustedRepositoryContext || process.cwd();
  const result = spawnSync("git", args, {
    cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
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

export function getCurrentBranch(options = {}) {
  const result = runGit(["branch", "--show-current"], options);
  assertGitSuccess(result, "Unable to read current branch");
  return result.stdout.trim();
}

export function getRefSha(ref, options = {}) {
  const result = runGit(["rev-parse", ref], options);
  assertGitSuccess(result, `Unable to resolve ${ref}`);
  return result.stdout.trim();
}

export function sourceStateIdentityForCommit({ baseRef = "origin/main", headRef = "HEAD", cwd = trustedRepositoryContext || process.cwd() } = {}) {
  const exactHead = getRefSha(headRef, { cwd });
  const treeResult = runGit(["rev-parse", `${headRef}^{tree}`], { cwd });
  assertGitSuccess(treeResult, `Unable to resolve tree for ${headRef}`);
  const treeId = treeResult.stdout.trim();
  const diff = runGit(["diff", "--binary", `${baseRef}...${headRef}`], { cwd });
  assertGitSuccess(diff, `Unable to read cumulative diff for ${baseRef}...${headRef}`);
  if (!diff.stdout.trim()) {
    return { exactHead, treeId, patchId: null, patchIdReason: "empty_cumulative_diff" };
  }
  const patchId = spawnSync("git", ["patch-id", "--stable"], {
    cwd,
    input: diff.stdout,
    encoding: "utf8",
    windowsHide: true,
  });
  if (patchId.error || patchId.status !== 0) {
    return {
      exactHead,
      treeId,
      patchId: null,
      patchIdReason: `patch_id_unavailable:${patchId.stderr || patchId.error?.message || "unknown"}`.slice(0, 240),
    };
  }
  const stablePatchId = patchId.stdout.trim().split(/\s+/)[0] || null;
  return stablePatchId
    ? { exactHead, treeId, patchId: stablePatchId, patchIdReason: null }
    : { exactHead, treeId, patchId: null, patchIdReason: "patch_id_empty_output" };
}

export function getStatusShort(options = {}) {
  const result = runGit(["status", "--short"], options);
  assertGitSuccess(result, "Unable to read git status");
  return result.stdout.trim();
}

export function ensureLaunchWorkspace(config, logger, options = {}) {
  const cwd = options.cwd || config.repoRoot;
  const status = getStatusShort({ cwd });
  const branch = getCurrentBranch({ cwd });
  const originMainSha = getRefSha("origin/main", { cwd });
  if (status && config.run) {
    throw new Error("Refusing real-run launch with a dirty worktree");
  }
  if (!branch && config.run) {
    throw new Error("Refusing real-run launch from a detached or unnamed checkout");
  }
  if (status && config.dryRun) {
    logger.warn("Dry-run observed a dirty worktree; real-run launch would refuse to proceed.", { status });
  }
  return { branch, originMainSha, dirty: Boolean(status), status };
}

export function ensureTaskMutationWorkspace(config, { branchName, expectedOriginMainSha }, options = {}) {
  const cwd = options.cwd || config.repoRoot;
  const status = getStatusShort({ cwd });
  const branch = getCurrentBranch({ cwd });
  const originMainSha = getRefSha("origin/main", { cwd });
  const headSha = getRefSha("HEAD", { cwd });
  if (status && config.run) {
    throw new Error("Refusing task mutation with a dirty worktree");
  }
  if (branch === "main" && config.run) {
    throw new Error("Refusing task mutation on main");
  }
  if (!branch && config.run) {
    throw new Error("Refusing task mutation from a detached or unnamed branch");
  }
  if (branchName && branch !== branchName && config.run) {
    throw new Error(`Refusing task mutation from unexpected branch ${branch || "[detached]"}`);
  }
  if (expectedOriginMainSha && originMainSha !== expectedOriginMainSha && config.run) {
    throw new Error("Refusing task mutation because origin/main changed after branch creation");
  }
  if (expectedOriginMainSha && headSha !== expectedOriginMainSha && config.run) {
    throw new Error("Refusing task mutation because task branch HEAD does not match expected origin/main");
  }
  if (status && config.dryRun) {
    return { branch, originMainSha, headSha, dirty: true, status, skipped: true, reason: "dry-run-dirty-worktree" };
  }
  return { branch, originMainSha, headSha, dirty: Boolean(status), status };
}

export const ensureTaskStartWorkspace = ensureLaunchWorkspace;

export function fetchOriginMain(config, options = {}) {
  if (config.dryRun) {
    return { skipped: true, reason: "dry-run" };
  }
  assertRepositoryRemoteIdentity(config);
  const result = options.trustedHistoricalRecovery === true
    ? runTrustedHistoricalFetch(config.repoRoot)
    : runGit(["fetch", "origin", "main"], { cwd: config.repoRoot });
  assertGitSuccess(result, "Unable to fetch origin/main");
  return { skipped: false, status: result.status };
}

export function runTrustedProspectiveMergeTree(config, baseSha, headSha) {
  if (!/^[a-f0-9]{40}$/u.test(baseSha || "") || !/^[a-f0-9]{40}$/u.test(headSha || "")) {
    return { command: "/usr/bin/git merge-tree", status: 128, stdout: "", stderr: "invalid merge identity", error: null };
  }
  const args = [
    "-c", "credential.helper=",
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false",
    "-c", "core.attributesFile=/dev/null",
    "-c", "diff.external=",
    "-c", "protocol.ext.allow=never",
    "-c", "protocol.file.allow=never",
    "merge-tree", "--write-tree", baseSha, headSha,
  ];
  return runFixedTrustedGit(config.repoRoot, args);
}

function runTrustedHistoricalFetch(cwd) {
  const args = [
    "-c", "credential.helper=",
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.sshCommand=",
    "-c", "core.fsmonitor=false",
    "-c", "core.attributesFile=/dev/null",
    "-c", "diff.external=",
    "-c", "protocol.ext.allow=never",
    "-c", "protocol.file.allow=never",
    "fetch", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main",
  ];
  return runFixedTrustedGit(cwd, args, {
    GIT_TERMINAL_PROMPT: "0",
    GIT_SSH_COMMAND: "/usr/bin/ssh -F /dev/null -o BatchMode=yes -o ProxyCommand=none -o ProxyJump=none -o PermitLocalCommand=no",
  });
}

function runFixedTrustedGit(cwd, args, extraEnv = {}) {
  const result = spawnSync("/usr/bin/git", args, {
    cwd,
    env: {
      PATH: "/usr/bin:/bin",
      LANG: "C",
      LC_ALL: "C",
      HOME: process.env.HOME || "/dev/null",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.useReplaceRefs",
      GIT_CONFIG_VALUE_0: "false",
      ...extraEnv,
    },
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    command: `/usr/bin/git ${args.join(" ")}`,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

export function createTaskBranch(config, branchName, baseRef = "origin/main") {
  if (config.dryRun) {
    return { skipped: true, branchName, baseRef, reason: "dry-run" };
  }
  const result = runGit(["switch", "-C", branchName, baseRef], { cwd: config.repoRoot });
  assertGitSuccess(result, `Unable to create task branch ${branchName}`);
  return { skipped: false, branchName, baseRef };
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

export function getBoundedDiff(baseRef = "origin/main", headRef = "HEAD", maxChars = providerBoundReviewDiffChars) {
  const result = runGit(["diff", "--binary", `${baseRef}...${headRef}`]);
  assertGitSuccess(result, "Unable to read diff");
  if (result.stdout.length <= maxChars) {
    return { truncated: false, text: result.stdout };
  }
  return { truncated: true, text: result.stdout.slice(0, maxChars) };
}

export function getBoundedWorkingTreeDiff(maxChars = providerBoundReviewDiffChars) {
  const text = getWorkingTreeDiffText();
  if (text.length <= maxChars) {
    return { truncated: false, text };
  }
  return { truncated: true, text: text.slice(0, maxChars) };
}

export async function commitExplicitPaths(config, files, message, options = {}) {
  if (files.length === 0) return { skipped: true, reason: "no-changes" };
  if (config.dryRun) return { skipped: true, reason: "dry-run", files };
  const cwd = config.repoRoot;
  if (!options.effectContext) {
    const add = runGit(["add", "--", ...files], { cwd });
    assertGitSuccess(add, "Unable to stage explicit paths");
    const commit = runGit(["commit", "-m", message], { cwd });
    assertGitSuccess(commit, "Unable to create commit");
    return { skipped: false, files, commit: commit.stdout.trim() };
  }
  const effectContext = canonicalEffectContext(config, options.effectContext);
  const pending = findPendingEffect(config, effectContext, "commit", (intent) => sameStrings(intent.effect.stagedPaths, [...files].sort()) && intent.effect.messageDigest === createHash("sha256").update(normalizeCommitMessage(message)).digest("hex"));
  const parent = pending?.effect.expectedParents?.[0] || getRefSha("HEAD", { cwd });
  const intendedTreeSha = pending?.effect.treeSha || computeIntendedTree(cwd, files, parent);
  const effect = pending?.effect || {
    expectedParents: [parent],
    treeSha: intendedTreeSha,
    stagedPaths: [...files].sort(),
    messageDigest: createHash("sha256").update(normalizeCommitMessage(message)).digest("hex"),
  };
  const canonicalConfig = { ...config, currentAuthority: effectContext.currentAuthority };
  const intent = canonicalIntent(effectContext, "commit", effect, { headSha: parent });
  const prepared = pending || prepareCommitIntent(canonicalConfig, intent);
  const add = runGit(["add", "--", ...files], { cwd });
  assertGitSuccess(add, "Unable to stage explicit paths");
  const stagedTree = runGit(["write-tree"], { cwd });
  assertGitSuccess(stagedTree, "Unable to compute staged tree");
  if (stagedTree.stdout.trim() !== effect.treeSha) throw new Error("Staged tree changed after canonical commit intent was persisted");
  const result = await executeCanonicalEffect(canonicalConfig, {
    intentId: prepared.intentId,
    expectedIdentity: effectContext.expectedIdentity,
  }, {
    readLive: (intent) => readCommitEffect(cwd, parent, effect, intent.identity),
    execute: () => {
      const commit = runGit(["commit", "-m", message], { cwd });
      assertGitSuccess(commit, "Unable to create commit");
      return { ok: true, status: commit.status };
    },
    beforeFinalize: () => persistConfirmedLifecycleHead(config, options.effectContext, getRefSha("HEAD", { cwd })),
  });
  if (!result.ok) throw new Error(`Canonical commit failed closed: ${result.reasonCode || result.classification}`);
  const commitSha = getRefSha("HEAD", { cwd });
  return { skipped: false, files, commit: commitSha, canonicalEffect: result };
}

function prepareCommitIntent(config, intent) {
  return preparePreEffectIntent(config, intent);
}

function computeIntendedTree(cwd, files, parent) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-commit-index-"));
  const indexPath = path.join(tempRoot, "index");
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    const read = runGit(["read-tree", parent], { cwd, env });
    assertGitSuccess(read, "Unable to initialize isolated commit index");
    const add = runGit(["add", "--", ...files], { cwd, env });
    assertGitSuccess(add, "Unable to stage explicit paths in isolated commit index");
    const tree = runGit(["write-tree"], { cwd, env });
    assertGitSuccess(tree, "Unable to compute intended commit tree");
    return tree.stdout.trim();
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function persistConfirmedLifecycleHead(config, effectContext, headSha) {
  const state = effectContext?.state || effectContext;
  if (!state?.branch || state.branch.headSha === headSha) return;
  const persisted = persistSessionLifecycleState(config, { ...state, branch: { ...state.branch, headSha, candidateDigest: null } });
  if (!persisted.ok) throw new Error(`Unable to persist confirmed lifecycle head: ${persisted.reasonCode}`);
  if (effectContext?.state) effectContext.state = persisted.state;
  else Object.assign(effectContext, persisted.state);
}

export function canonicalEffectContext(config, input = {}) {
  const supplied = input.state || input;
  const loaded = loadSessionLifecycleState(config, {
    repository: supplied.repository,
    issueNumber: supplied.logicalTask?.issueNumber,
    taskKey: supplied.logicalTask?.taskKey,
    runId: supplied.logicalTask?.runId,
    claimIdentity: supplied.logicalTask?.claimIdentity,
    sessionId: supplied.sessions?.current,
  });
  if (!loaded.ok) throw new Error(`Canonical effect lifecycle unavailable: ${loaded.reasonCode}`);
  if (loaded.state.checkpoint.digest !== supplied.checkpoint?.digest) throw new Error("Canonical effect lifecycle checkpoint is stale");
  const state = loaded.state;
  const logical = state.logicalTask || {};
  const authority = state.mutationAuthority || {};
  const sessionId = authority.ownerSessionId || state.sessions?.current;
  const authorized = assertMutationAuthority(state, sessionId);
  if (!authorized.ok) throw new Error(`Canonical effect mutation authority denied: ${authorized.reasonCode}`);
  return {
    repository: state.repository,
    sourceTaskKey: logical.taskKey,
    runId: logical.runId,
    logicalTaskIdentity: logical.claimIdentity,
    claimIdentity: logical.claimIdentity,
    chargeIdentity: logical.chargeMarkerRef,
    sessionId,
    authorityGeneration: authority.generation,
    branchName: state.branch?.name,
    baseSha: state.branch?.baseSha,
    candidateIdentity: state.branch?.candidateDigest || state.branch?.headSha,
    reservationIdentity: input.reservationIdentity || null,
    currentAuthority: { runId: logical.runId, sessionId, authorityGeneration: authority.generation, status: authority.status },
    expectedIdentity: { repository: state.repository, sourceTaskKey: logical.taskKey, runId: logical.runId, logicalTaskIdentity: logical.claimIdentity, claimIdentity: logical.claimIdentity, chargeIdentity: logical.chargeMarkerRef, sessionId, authorityGeneration: authority.generation },
  };
}

export function canonicalIntent(context, effectType, effect, identity = {}) {
  return { ...context, effectType, effect, ...identity };
}

export function canonicalExecutionInput(config, intent) {
  const intentId = createHash("sha256").update(JSON.stringify({ effectType: intent.effectType, repository: intent.repository, runId: intent.runId, sessionId: intent.sessionId, authorityGeneration: intent.authorityGeneration, identity: intent, effect: intent.effect })).digest("hex");
  return loadPreEffectIntent(config, intentId) ? { intentId } : { intent, intentOptions: { intentId } };
}

export function findPendingEffect(config, context, effectType, extra = () => true) {
  const matches = findPreEffectIntents(config, (intent) => intent.effectType === effectType
    && intent.status !== "failed_closed"
    && intent.repository === context.repository && intent.runId === context.runId
    && intent.sessionId === context.sessionId && intent.authorityGeneration === context.authorityGeneration
    && intent.identity?.branchName === context.branchName && extra(intent));
  if (matches.length > 1) throw new Error(`Ambiguous pending canonical ${effectType} intents`);
  return matches[0] || null;
}

function readCommitEffect(cwd, parent, effect, identity) {
  const head = getRefSha("HEAD", { cwd });
  if (head === parent) return { complete: true, present: false };
  const parents = runGit(["show", "-s", "--format=%P", head], { cwd });
  const tree = runGit(["show", "-s", "--format=%T", head], { cwd });
  const message = runGit(["show", "-s", "--format=%B", head], { cwd });
  if ([parents, tree, message].some((entry) => entry.error || entry.status !== 0)) return { complete: false };
  const exact = parents.stdout.trim().split(/\s+/).filter(Boolean).join(" ") === effect.expectedParents.join(" ")
    && tree.stdout.trim() === effect.treeSha
    && createHash("sha256").update(normalizeCommitMessage(message.stdout)).digest("hex") === effect.messageDigest;
  return exact ? { complete: true, present: true, identity, effect } : { complete: true, present: true, identity, effect: { ...effect, treeSha: tree.stdout.trim() } };
}

function normalizeCommitMessage(value) { return String(value).replace(/\r\n/g, "\n").trimEnd(); }
function sameStrings(left, right) { return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]); }

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
