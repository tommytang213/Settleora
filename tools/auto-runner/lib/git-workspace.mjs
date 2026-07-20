import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { providerBoundReviewDiffChars } from "./review-secret-boundary.mjs";
import { executeCanonicalEffect } from "./canonical-effect-executor.mjs";
import { findPreEffectIntents, loadPreEffectIntent, preparePreEffectIntent } from "./pre-effect-intent.mjs";
import { persistSessionLifecycleState } from "./session-lifecycle.mjs";

export function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd || process.cwd(),
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

export function sourceStateIdentityForCommit({ baseRef = "origin/main", headRef = "HEAD", cwd = process.cwd() } = {}) {
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
  const cwd = options.cwd || config.repoRoot || process.cwd();
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
  const cwd = options.cwd || config.repoRoot || process.cwd();
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

export function fetchOriginMain(config) {
  if (config.dryRun) {
    return { skipped: true, reason: "dry-run" };
  }
  const result = runGit(["fetch", "origin", "main"], { cwd: config.repoRoot || process.cwd() });
  assertGitSuccess(result, "Unable to fetch origin/main");
  return { skipped: false, status: result.status };
}

export function createTaskBranch(config, branchName) {
  if (config.dryRun) {
    return { skipped: true, branchName, reason: "dry-run" };
  }
  const result = runGit(["switch", "-C", branchName, "origin/main"], { cwd: config.repoRoot || process.cwd() });
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
  const cwd = config.repoRoot || process.cwd();
  if (!options.effectContext) {
    const add = runGit(["add", "--", ...files], { cwd });
    assertGitSuccess(add, "Unable to stage explicit paths");
    const commit = runGit(["commit", "-m", message], { cwd });
    assertGitSuccess(commit, "Unable to create commit");
    return { skipped: false, files, commit: commit.stdout.trim() };
  }
  const effectContext = canonicalEffectContext(options.effectContext);
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

export function canonicalEffectContext(input = {}) {
  const state = input.state || input;
  const logical = state.logicalTask || {};
  const authority = state.mutationAuthority || {};
  const sessionId = authority.ownerSessionId || state.sessions?.current;
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
    && !["finalized", "failed_closed"].includes(intent.status)
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
