import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdtempSync, mkdirSync,
  openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { providerBoundReviewDiffChars } from "./review-secret-boundary.mjs";
import { canonicalGithubEvidenceDigest } from "./github-evidence-digest.mjs";
import { executeCanonicalEffect, executeCanonicalEffectSync } from "./canonical-effect-executor.mjs";
import { findPreEffectIntents, loadPreEffectIntent, preparePreEffectIntent } from "./pre-effect-intent.mjs";
import { assertMutationAuthority, loadSessionLifecycleState, persistSessionLifecycleState } from "./session-lifecycle.mjs";
import {
  admitRepositoryWorktreeRemoteIdentity,
  assertRepositoryRemoteIdentity,
  restoreControlPlaneRepositoryRemoteIdentity,
} from "./runtime-identity.mjs";

let trustedRepositoryContext = null;
const admittedRepositoryContexts = new Map();

export function bindTrustedRepositoryContext(repoRoot) {
  const canonical = path.resolve(repoRoot || "");
  if (!path.isAbsolute(repoRoot || "") || canonical !== repoRoot) {
    throw new Error("trusted repository context requires an absolute normalized repoRoot");
  }
  const admitted = admitSourceOwnedGitContext(canonical);
  if (trustedRepositoryContext && trustedRepositoryContext.root !== canonical) {
    throw new Error("trusted repository context cannot be rebound to another repository");
  }
  const existing = admittedRepositoryContexts.get(canonical);
  if (existing && !sameAdmittedGitTuple(existing, admitted)) {
    throw new Error("trusted repository Git tuple changed after admission");
  }
  admittedRepositoryContexts.set(canonical, admitted);
  trustedRepositoryContext = admitted;
  return canonical;
}

export function adoptHistoricalTaskWorkspace(config, {
  branchName, headSha, taskKey, ownershipMarkers = {}, effectContext = null,
  requireExisting = false, allowLiveBranchHead = false,
} = {}) {
  const controlRoot = path.resolve(config?.controlPlaneRepoRoot || config?.repoRoot || "");
  if (!/^[a-f0-9]{40}$/u.test(headSha || "")
    || typeof branchName !== "string" || !branchName.length
    || !path.isAbsolute(controlRoot)
    || ![controlRoot, path.resolve(config?.repoRoot || "")].includes(trustedRepositoryContext?.root)) {
    throw new Error("historical task workspace authority is incomplete");
  }
  const literalRef = `refs/heads/${branchName}`;
  const ref = runGit(["rev-parse", "--verify", literalRef], { cwd: controlRoot });
  assertGitSuccess(ref, "Unable to authenticate historical task branch");
  const liveBranchHead = ref.stdout.trim();
  if (liveBranchHead !== headSha && !allowLiveBranchHead) {
    throw new Error("Historical task branch ref drifted from the authenticated candidate");
  }
  const controlCommonDir = canonicalGitCommonDir(controlRoot);
  const logsRoot = path.resolve(config?.logsRoot || "");
  if (!path.isAbsolute(logsRoot) || !existsSync(logsRoot)) {
    throw new Error("Historical task worktree logs authority is unavailable");
  }
  const parent = trustedTaskWorktreeParent(logsRoot);
  const identity = createHash("sha256")
    .update(JSON.stringify([config.repositorySlug, taskKey, branchName,
      allowLiveBranchHead ? liveBranchHead : headSha]))
    .digest("hex").slice(0, 20);
  const intendedTaskRoot = path.join(parent, `recovery-${identity}`);
  const listed = runGit(["worktree", "list", "--porcelain"], { cwd: controlRoot });
  assertGitSuccess(listed, "Unable to inventory linked worktrees");
  const matches = parseWorktrees(listed.stdout).filter((entry) => entry.branch === literalRef);
  if (matches.length > 1) throw new Error("Historical task branch has conflicting linked worktrees");
  let taskRoot = matches[0]?.worktree || null;
  const linkedWorktreeAlreadyPresent = Boolean(taskRoot);
  let created = false;
  if (!taskRoot && requireExisting) {
    throw new Error("Recorded historical task worktree is not linked");
  }
  if (taskRoot && path.resolve(taskRoot) !== intendedTaskRoot) {
    const canonicalExistingRoot = realpathSync(taskRoot);
    const ownershipIdentity = canonicalGithubEvidenceDigest({
      repository: config.repositorySlug,
      branchName,
      realPath: canonicalExistingRoot,
    });
    const marker = ownershipMarkers?.[`${branchName}:${ownershipIdentity}`];
    if (marker?.target !== ownershipIdentity || marker?.correlation !== branchName) {
      throw new Error("Historical task branch is checked out in an unowned linked worktree");
    }
  }
  if (!taskRoot) {
    taskRoot = intendedTaskRoot;
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
  }
  if (path.resolve(taskRoot) === intendedTaskRoot
    && !hasExactOwnershipMarker(config, ownershipMarkers, branchName, taskRoot)) {
    if (!effectContext) throw new Error("Historical task worktree creation intent authority is unavailable");
    const canonicalConfig = { ...config, currentAuthority: effectContext.currentAuthority };
    const intent = canonicalIntent(effectContext, "worktree_create", {
      branchName, headSha, taskRoot: intendedTaskRoot, commonDir: controlCommonDir,
    }, { branchName, headSha });
    const pending = findPendingEffect(canonicalConfig, effectContext, "worktree_create",
      (candidate) => candidate.effect?.taskRoot === intendedTaskRoot
        && candidate.effect?.headSha === headSha
        && candidate.effect?.commonDir === controlCommonDir);
    const finalized = linkedWorktreeAlreadyPresent && !pending
      ? findFinalizedHistoricalWorktreeEffect(canonicalConfig, effectContext, {
        branchName, headSha, taskRoot: intendedTaskRoot, commonDir: controlCommonDir,
      })
      : null;
    if (linkedWorktreeAlreadyPresent && !pending && !finalized) {
      throw new Error("Historical task worktree has no prior durable creation intent");
    }
    if (!finalized) {
      const execution = executeCanonicalEffectSync(canonicalConfig,
        pending ? { intentId: pending.intentId } : canonicalExecutionInput(canonicalConfig, intent), {
        readLive: (prepared) => readHistoricalWorktreeEffect(
          controlRoot, intendedTaskRoot, branchName, headSha, prepared.identity, prepared.effect,
        ),
        execute: () => {
          const creationResult = runFixedTrustedGit(controlRoot, [
            "worktree", "add", "--", intendedTaskRoot, branchName,
          ]);
          assertGitSuccess(creationResult, "Unable to materialize historical task worktree");
          return { ok: true };
        },
      });
      if (!execution.ok) throw new Error(`Historical task worktree creation failed closed: ${execution.reasonCode || execution.classification}`);
    }
    created = true;
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
  const expectedTaskHead = allowLiveBranchHead ? liveBranchHead : headSha;
  if (canonicalTaskRoot === controlRoot || taskCommonDir !== controlCommonDir
    || taskBranch !== branchName || taskHead !== expectedTaskHead || taskStatus !== "") {
    throw new Error(`Historical task worktree failed exact authority checks: sameRoot=${canonicalTaskRoot === controlRoot}; commonDir=${taskCommonDir === controlCommonDir}; branch=${taskBranch === branchName}; head=${taskHead === expectedTaskHead}; clean=${taskStatus === ""}`);
  }
  admitRepositoryWorktreeRemoteIdentity(config, canonicalTaskRoot);
  trustedRepositoryContext = admitSourceOwnedGitContext(canonicalTaskRoot);
  admittedRepositoryContexts.set(canonicalTaskRoot, trustedRepositoryContext);
  config.controlPlaneRepoRoot = controlRoot;
  config.repoRoot = canonicalTaskRoot;
  process.chdir(canonicalTaskRoot);
  return {
    controlRoot, taskRoot: canonicalTaskRoot, branchName, headSha: expectedTaskHead, created,
  };
}

function trustedTaskWorktreeParent(logsRoot) {
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
  return parent;
}

function hasExactOwnershipMarker(config, markers, branchName, taskRoot) {
  const ownershipIdentity = canonicalGithubEvidenceDigest({
    repository: config.repositorySlug, branchName, realPath: realpathSync(taskRoot),
  });
  const marker = markers?.[`${branchName}:${ownershipIdentity}`];
  return marker?.target === ownershipIdentity && marker?.correlation === branchName;
}

function readHistoricalWorktreeEffect(controlRoot, taskRoot, branchName, headSha, identity, effect) {
  const listed = runGit(["worktree", "list", "--porcelain"], { cwd: controlRoot });
  if (listed.status !== 0 || listed.error) return { complete: false };
  const matches = parseWorktrees(listed.stdout).filter((entry) => path.resolve(entry.worktree) === taskRoot);
  if (matches.length === 0) return { complete: true, present: false };
  if (matches.length !== 1 || matches[0].branch !== `refs/heads/${branchName}`) {
    return { complete: true, present: true, exact: false, ambiguous: true };
  }
  const head = runGit(["rev-parse", "HEAD"], { cwd: taskRoot });
  return {
    complete: head.status === 0 && !head.error,
    present: true,
    ambiguous: head.status !== 0 || Boolean(head.error) || head.stdout.trim() !== headSha,
    identity,
    effect,
  };
}

export function restoreControlPlaneRepositoryContext(config) {
  const controlRoot = path.resolve(config?.controlPlaneRepoRoot || "");
  if (!path.isAbsolute(controlRoot) || !existsSync(controlRoot) || getStatusShort({ cwd: controlRoot }) !== "") {
    throw new Error("Control-plane repository restoration authority is unavailable");
  }
  trustedRepositoryContext = admitSourceOwnedGitContext(controlRoot);
  admittedRepositoryContexts.set(controlRoot, trustedRepositoryContext);
  restoreControlPlaneRepositoryRemoteIdentity(config);
  config.repoRoot = controlRoot;
  process.chdir(controlRoot);
  return controlRoot;
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
  const cwd = options.cwd || trustedRepositoryContext?.root || process.cwd();
  const context = sourceOwnedGitContext(cwd);
  assertSourceOwnedGitMetadata(context);
  const command = classifySourceOwnedGitCommand(args, { cwd: context.root, options });
  if (command.kind === "unsupported") {
    return {
      command: `git ${args.join(" ")}`,
      status: 128,
      stdout: "",
      stderr: "Git invocation is outside the source-owned command grammar",
      error: null,
      signal: null,
      reasonCode: "source_owned_git_argv_unrecognized",
    };
  }
  if (command.kind === "transport" && options.allowLocalFileTransport !== true) {
    return {
      command: `git ${args.join(" ")}`,
      status: 128,
      stdout: "",
      stderr: "Protected external Git transport producer is not installed",
      error: null,
      signal: null,
      reasonCode: "protected_external_git_transport_unavailable",
    };
  }
  const hasHead = repositoryHasHead(context);
  try {
    if (hasHead) assertSourceOwnedTreeAttributes(context);
  } catch {
    return {
      command: `git ${args.join(" ")}`, status: 128, stdout: "",
      stderr: "Repository attributes may select executable Git drivers", error: null,
      signal: null, reasonCode: "source_owned_git_attributes_unsafe",
    };
  }
  let effectiveArgs = args;
  let effectiveInput = typeof options.input === "string" || Buffer.isBuffer(options.input) ? options.input : undefined;
  if (args[0] === "hash-object" && args[1] === "--") {
    effectiveInput = readSourceOwnedWorktreeBlob(context, args[2]);
    effectiveArgs = ["hash-object", "--stdin"];
  }
  const fixedArgs = fixedRepositoryGitArgs(cwd, effectiveArgs, {
    allowLocalFileTransport: options.allowLocalFileTransport === true,
  });
  const repositoryEnvironment = fixedRepositoryGitEnvironment(context, {
    bindAttributesToHead: hasHead && options.bindAttributesToHead !== false,
    internalIndexFile: options.internalIndexFile,
    manageWorktrees: options.manageWorktrees === true,
  });
  const result = normalizePinnedGitMetadataResult(spawnPinnedRepositoryGit(context, fixedArgs, {
    cwd, input: effectiveInput, environment: repositoryEnvironment,
    timeoutMs: options.timeoutMs, maxBuffer: options.maxBuffer,
  }), args, context);
  if (!sourceOwnedGitContextStable(context)) {
    return { command: `git ${args.join(" ")}`, status: 128, stdout: "", stderr: "Repository Git metadata changed during operation", error: null };
  }
  // Native `show-ref --verify` reports an absent, syntactically valid ref as
  // status 128. Preserve the wrapper's established missing-ref contract while
  // keeping parsing and ref-store access inside the descriptor-pinned Git process.
  if (args[0] === "show-ref" && args.includes("--verify") && result.status === 128
    && /^fatal: '[^']+' - not a valid ref\s*$/u.test(result.stderr || "")) {
    return { command: `git ${args.join(" ")}`, status: 1, stdout: "", stderr: "", error: null, signal: null };
  }
  return {
    command: `git ${args.join(" ")}`,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
    signal: result.signal || null,
  };
}

const sourceOwnedTransportGitCommands = new Set(["fetch", "ls-remote", "push"]);

function classifySourceOwnedGitCommand(args, context = {}) {
  if (!Array.isArray(args) || args.length === 0 || args.some((arg) => typeof arg !== "string")) {
    return { kind: "unsupported", command: null };
  }
  const command = args[0];
  // Global options, config injection, aliases, and unlisted porcelain/plumbing
  // never reach Git. Only this source-owned first-token grammar may dispatch.
  if (!command || command.startsWith("-")) return { kind: "unsupported", command };
  if (sourceOwnedTransportGitCommands.has(command)) {
    return sourceOwnedTransportArguments(command, args.slice(1))
      ? { kind: "transport", command }
      : { kind: "unsupported", command };
  }
  return sourceOwnedLocalArguments(command, args.slice(1), context)
    ? { kind: "local", command }
    : { kind: "unsupported", command };
}

function sourceOwnedTransportArguments(command, args) {
  let index = 0;
  if (command === "fetch" && args[index] === "--no-tags") index += 1;
  if (command === "ls-remote" && ["--heads", "--exit-code"].includes(args[index])) index += 1;
  let lease = null;
  if (command === "push" && args[index] === "--no-verify") {
    index += 1;
    const match = String(args[index] || "").match(/^--force-with-lease=([^:]+):([a-f0-9]{40})$/u);
    if (match && sourceOwnedHeadsRef(match[1])) { lease = match[1]; index += 1; }
  }
  if (args.length - index !== 2) return false;
  const [remote, refspec] = args.slice(index);
  if (!sourceOwnedRemote(remote)) return false;
  if (command === "ls-remote") return sourceOwnedHeadsRef(refspec);
  if (command === "fetch") {
    const fetch = refspec.match(/^\+?([^:]+)(?::([^:]+))?$/u);
    if (!fetch || !sourceOwnedHeadsRef(fetch[1])) return false;
    const branch = fetch[1].slice("refs/heads/".length);
    return fetch[2] === undefined || fetch[2] === `refs/remotes/origin/${branch}`;
  }
  const deletion = refspec.match(/^:(.+)$/u);
  if (deletion) return lease !== null && deletion[1] === lease;
  if (lease !== null) return false;
  const update = refspec.match(/^([^:]+):([^:]+)$/u);
  return Boolean(update && (/^[a-f0-9]{40}$/u.test(update[1]) || update[1] === "HEAD" || sourceOwnedHeadsRef(update[1]))
    && sourceOwnedHeadsRef(update[2]));
}

function sourceOwnedRemote(value) {
  return value === "origin"
    || /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/u.test(value)
    || (path.isAbsolute(value) && path.resolve(value) === value && !value.includes("\0"));
}

function sourceOwnedLocalArguments(command, args, context) {
  const exact = (...values) => args.length === values.length && args.every((value, index) => value === values[index]);
  const refs = (...values) => values.every(sourceOwnedRevision);
  switch (command) {
    case "add": {
      const paths = args.slice(1);
      return args[0] === "--" && paths.length > 0 && paths.every(sourceOwnedRepositoryPath);
    }
    case "apply": return (exact("--check", "-") || exact("--check", "--reverse", "-"));
    case "branch": return exact("--show-current");
    case "cat-file": return args.length === 2 && ["-e", "-t"].includes(args[0]) && refs(args[1]);
    case "cherry-pick": return exact("--abort") || (args.length > 0 && refs(...args));
    case "check-ref-format": return args.length === 2 && args[0] === "--branch" && sourceOwnedBranch(args[1]);
    case "commit": return (args.length === 2 && args[0] === "-m" && sourceOwnedMessage(args[1]))
      || (args.length === 3 && args[0] === "--allow-empty" && args[1] === "-m" && sourceOwnedMessage(args[2]));
    case "commit-tree": return sourceOwnedCommitTreeArguments(args);
    case "config": return sourceOwnedConfigReadArguments(args);
    case "diff": return sourceOwnedDiffArguments(args);
    case "diff-index": return sourceOwnedDiffIndexArguments(args);
    case "diff-tree": return args.length === 5 && args.slice(0, 3).join("\0") === ["--no-commit-id", "--name-only", "-r"].join("\0") && refs(args[3], args[4]);
    case "for-each-ref": return sourceOwnedForEachRefArguments(args);
    case "hash-object": return exact("--stdin") || (args.length === 2 && args[0] === "--" && sourceOwnedRepositoryPath(args[1]));
    case "log": return sourceOwnedLogArguments(args);
    case "ls-files": return sourceOwnedLsFilesArguments(args);
    case "ls-tree": return sourceOwnedLsTreeArguments(args);
    case "merge": return args.length === 2 && args[0] === "--ff-only"
      && args[1].startsWith("origin/") && isSourceOwnedBranchName(args[1].slice("origin/".length));
    case "merge-base": return (args.length === 2 || (args.length === 3 && args[0] === "--is-ancestor")) && refs(...args.filter((value) => value !== "--is-ancestor"));
    case "merge-tree": return args.length === 3 && args[0] === "--write-tree" && refs(args[1], args[2]);
    case "patch-id": return exact("--stable");
    case "read-tree": return args.length === 1 && refs(args[0]);
    case "remote": return sourceOwnedRemoteReadArguments(args);
    case "rev-list": return sourceOwnedRevListArguments(args);
    case "rev-parse": return sourceOwnedRevParseArguments(args);
    case "show": return sourceOwnedShowArguments(args);
    case "show-ref": return args.length === 0
      || (args.length >= 2 && args[0] === "--verify"
        && (args.length === 2 || (args.length === 3 && ["--hash", "--quiet"].includes(args[1])))
        && sourceOwnedFullRef(args.at(-1)));
    case "status": return [
      "--short", "--porcelain", "--porcelain=v1", "--porcelain=v2", "--porcelain=v1\0--untracked-files=all",
      "--porcelain=v1\0--untracked-files=normal",
    ].includes(args.join("\0"));
    case "switch": return (args.length === 1 && sourceOwnedBranch(args[0]))
      || (args.length === 2 && args[0] === "-c" && sourceOwnedBranch(args[1]))
      || (args.length === 2 && args[0] === "--detach" && sourceOwnedRevision(args[1]))
      || (args.length === 4 && args[0] === "--no-track" && args[1] === "-C" && sourceOwnedBranch(args[2]) && sourceOwnedRevision(args[3]));
    case "symbolic-ref": return exact("--quiet", "--short", "HEAD");
    case "update-index": return sourceOwnedUpdateIndexArguments(args);
    case "update-ref": return args.length === 3 && args[0] === "-d" && /^refs\/heads\//u.test(args[1]) && sourceOwnedFullRef(args[1]) && /^[a-f0-9]{40}$/u.test(args[2]);
    case "worktree": return sourceOwnedWorktreeArguments(args, context);
    case "write-tree": return args.length === 0;
    default: return false;
  }
}

function sourceOwnedDiffArguments(args) {
  if (args.length === 5 && args[0] === "--no-index" && args[1] === "--binary" && args[2] === "--"
    && args[3] === "/dev/null" && sourceOwnedRepositoryPath(args[4])) return true;
  const flags = new Set(["--binary", "--cached", "--name-only", "--name-status", "--no-renames", "--numstat", "--stat"]);
  let index = 0;
  while (flags.has(args[index])) index += 1;
  if (args[index] === "--no-index") {
    return args.slice(index).length === 4 && args[index + 1] === "--" && args[index + 2] === "/dev/null" && sourceOwnedRepositoryPath(args[index + 3]);
  }
  const operands = args.slice(index);
  if (operands[0] === "--") return operands.slice(1).length > 0 && operands.slice(1).every(sourceOwnedRepositoryPath);
  return operands.length <= 2 && operands.every(sourceOwnedRevision);
}

function sourceOwnedDiffIndexArguments(args) {
  return args.length >= 2 && args[0] === "--cached" && ["--quiet", "--name-only"].includes(args[1])
    && args.slice(2).filter((value) => value !== "--").every(sourceOwnedRevision);
}

function sourceOwnedForEachRefArguments(args) {
  return args.length >= 1 && args.length <= 3
    && args.filter((value) => value.startsWith("--")).every((value) => /^--format=%\([A-Za-z0-9:*._-]+\)(?:%00%\([A-Za-z0-9:*._-]+\))*$/u.test(value) || value === "--sort=refname")
    && args.filter((value) => !value.startsWith("--")).every(sourceOwnedFullRefPrefix);
}

function sourceOwnedLsFilesArguments(args) {
  const signatures = new Set([
    ["--others", "--exclude-standard"].join("\0"), ["--others", "--exclude-standard", "-z"].join("\0"),
    ["-v", "-z"].join("\0"), ["--stage", "-z"].join("\0"), ["--error-unmatch"].join("\0"),
  ]);
  if (signatures.has(args.join("\0"))) return true;
  return args.length === 2 && args[0] === "--error-unmatch" && sourceOwnedRepositoryPath(args[1]);
}

function sourceOwnedLsTreeArguments(args) {
  const copy = [...args];
  while (["-r", "-z", "--name-only"].includes(copy[0])) copy.shift();
  if (copy.length === 0 || !sourceOwnedRevision(copy.shift())) return false;
  if (copy[0] === "--") copy.shift();
  return copy.every(sourceOwnedRepositoryPath);
}

function sourceOwnedRevListArguments(args) {
  const copy = [...args];
  while (["--count", "--first-parent", "--reverse", "--parents"].includes(copy[0])) copy.shift();
  if (copy[0] === "-n" && /^[1-9][0-9]{0,3}$/u.test(copy[1] || "")) copy.splice(0, 2);
  return copy.length > 0 && copy.every(sourceOwnedRevision);
}

function sourceOwnedRevParseArguments(args) {
  const exactSignatures = new Set([
    ["--show-toplevel"].join("\0"), ["--show-object-format"].join("\0"), ["--git-common-dir"].join("\0"),
    ["--path-format=absolute", "--git-common-dir"].join("\0"), ["--is-shallow-repository"].join("\0"),
  ]);
  if (exactSignatures.has(args.join("\0"))) return true;
  if (args.length === 2 && args[0] === "--git-path") return ["config.worktree", "info/attributes", "info/exclude"].includes(args[1]);
  const copy = [...args];
  if (copy[0] === "--verify") copy.shift();
  if (copy[0] === "-q") copy.shift();
  return copy.length === 1 && sourceOwnedRevision(copy[0]);
}

function sourceOwnedShowArguments(args) {
  if (args.length === 0) return false;
  const copy = [...args];
  if (copy[0] === "-s") copy.shift();
  if (copy[0]?.startsWith("--format=")) {
    if (!/^--format=%[A-Za-z%n ]{1,30}$/u.test(copy[0])) return false;
    copy.shift();
  }
  return copy.length === 1 && sourceOwnedRevision(copy[0]);
}

function sourceOwnedLogArguments(args) {
  return args.length === 3 && args[0] === "-1" && /^--format=%[sHPTB]$/u.test(args[1]) && sourceOwnedRevision(args[2]);
}

function sourceOwnedCommitTreeArguments(args) {
  return args.length === 7
    && [args[0], args[2], args[4]].every((value) => /^[a-f0-9]{40}$/u.test(value || ""))
    && args[1] === "-p" && args[3] === "-p" && args[5] === "-m"
    && args[6] === "Settleora prospective recovery validation";
}

function sourceOwnedUpdateIndexArguments(args) {
  if (args.length < 1) return false;
  if (args[0] === "--add" || args[0] === "--remove") return args.slice(1).every(sourceOwnedRepositoryPath);
  if (args[0] === "--cacheinfo") return args.length === 4 && /^(?:100644|100755|120000)$/u.test(args[1]) && /^[a-f0-9]{40,64}$/u.test(args[2]) && sourceOwnedRepositoryPath(args[3]);
  return false;
}

function sourceOwnedWorktreeArguments(args, context) {
  if (args.join("\0") === ["list", "--porcelain"].join("\0")) return true;
  if (args[0] === "remove") {
    const target = args[1] === "--" ? args[2] : args[1];
    return args.length === (args[1] === "--" ? 3 : 2) && sourceOwnedWorktreePath(target, context);
  }
  if (args[0] !== "add") return false;
  const copy = args.slice(1);
  if (copy[0] === "--") copy.shift();
  if (copy[0] === "--detach") return copy.length === 3 && sourceOwnedWorktreePath(copy[1], context) && sourceOwnedRevision(copy[2]);
  if (copy[0] === "-b") return copy.length === 4 && sourceOwnedBranch(copy[1]) && sourceOwnedWorktreePath(copy[2], context) && sourceOwnedRevision(copy[3]);
  return copy.length === 2 && sourceOwnedWorktreePath(copy[0], context) && sourceOwnedBranch(copy[1]);
}

function sourceOwnedWorktreePath(value, context) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value || value === "/") return false;
  if (Array.isArray(context?.options?.authorizedWorktreePaths)
    && context.options.authorizedWorktreePaths.some((entry) => entry === value)) return true;
  const basename = path.basename(value);
  if (!/^(?:recovery-|settleora-)[A-Za-z0-9._-]+$/u.test(basename)) return false;
  const root = path.resolve(context?.cwd || "");
  return !root || (value !== root && !value.startsWith(`${root}${path.sep}`));
}

function sourceOwnedRevision(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1000
    && !value.startsWith("-") && !/[\0-\x20\x7f\\]/u.test(value) && !value.includes("@{");
}
function sourceOwnedHeadsRef(value) {
  return typeof value === "string" && value.startsWith("refs/heads/")
    && isSourceOwnedBranchName(value.slice("refs/heads/".length));
}

function sourceOwnedFullRef(value) {
  if (sourceOwnedHeadsRef(value)) return true;
  return typeof value === "string" && value.startsWith("refs/remotes/origin/")
    && isSourceOwnedBranchName(value.slice("refs/remotes/origin/".length));
}

function sourceOwnedFullRefPrefix(value) {
  if (typeof value !== "string") return false;
  for (const root of ["refs/heads", "refs/remotes/origin"]) {
    if (value === root || value === `${root}/`) return true;
    if (value.startsWith(`${root}/`)) {
      const suffix = value.slice(root.length + 1).replace(/\/$/u, "");
      return isSourceOwnedBranchName(suffix);
    }
  }
  return false;
}

export function isSourceOwnedBranchName(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240
    || value.startsWith("-") || value.endsWith("/") || value.endsWith(".")
    || value.includes("..") || value.includes("//") || value.includes("@{")
    || /[\0-\x20\x7f~^:?*\\\[]/u.test(value)) return false;
  return value.split("/").every((component) => component.length > 0
    && component !== "." && component !== ".." && !component.startsWith(".")
    && !component.endsWith(".") && !component.endsWith(".lock"));
}

function sourceOwnedBranch(value) { return isSourceOwnedBranchName(value); }
function sourceOwnedRepositoryPath(value) { return typeof value === "string" && value.length > 0 && value.length <= 1000 && !value.startsWith("-") && !value.startsWith(":") && !path.isAbsolute(value) && path.normalize(value) === value && value !== "." && !value.startsWith(`..${path.sep}`) && !/[\0\r\n]/u.test(value); }
function sourceOwnedMessage(value) { return typeof value === "string" && value.length > 0 && value.length <= 10_000 && !value.includes("\0"); }

function sourceOwnedConfigReadArguments(args) {
  const signature = args.join("\0");
  return new Set([
    ["--local", "--name-only", "--list"].join("\0"),
    ["--local", "--get", "extensions.worktreeConfig"].join("\0"),
    ["--local", "--get", "remote.origin.url"].join("\0"),
    ["--local", "--list", "--show-origin", "--null"].join("\0"),
    ["--worktree", "--name-only", "--list"].join("\0"),
    ["--worktree", "--list", "--show-origin", "--null"].join("\0"),
  ]).has(signature);
}

function sourceOwnedRemoteReadArguments(args) {
  return args.join("\0") === ["get-url", "origin"].join("\0")
    || args.join("\0") === ["get-url", "--push", "origin"].join("\0")
    || args.join("\0") === ["get-url", "--push", "--all", "origin"].join("\0");
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

export function sourceStateIdentityForCommit({ baseRef = "origin/main", headRef = "HEAD", cwd = trustedRepositoryContext?.root || process.cwd() } = {}) {
  const exactHead = getRefSha(headRef, { cwd });
  const treeResult = runGit(["rev-parse", `${headRef}^{tree}`], { cwd });
  assertGitSuccess(treeResult, `Unable to resolve tree for ${headRef}`);
  const treeId = treeResult.stdout.trim();
  const diff = runGit(["diff", "--binary", `${baseRef}...${headRef}`], { cwd });
  assertGitSuccess(diff, `Unable to read cumulative diff for ${baseRef}...${headRef}`);
  if (!diff.stdout.trim()) {
    return { exactHead, treeId, patchId: null, patchIdReason: "empty_cumulative_diff" };
  }
  const patchId = spawnSync("/usr/bin/git", ["patch-id", "--stable"], {
    cwd,
    input: diff.stdout,
    env: fixedPureGitEnvironment(),
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
  const status = inspectRawLaunchWorkspace(cwd, options.environment);
  const branchResult = runLaunchWorkspaceGuardGit(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd, environment: options.environment });
  const refResult = runLaunchWorkspaceGuardGit(["rev-parse", "--verify", "origin/main^{commit}"], { cwd, environment: options.environment });
  assertGitSuccess(refResult, "Unable to resolve launch origin/main");
  const branch = branchResult.status === 0 ? branchResult.stdout.trim() : "";
  const originMainSha = refResult.stdout.trim();
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

function runLaunchWorkspaceGuardGit(args, { cwd, environment = process.env } = {}) {
  // Deliberately do not inherit any caller GIT_* or HOME-scoped configuration.
  // The unused environment parameter makes hostile-environment behavior
  // directly testable without mutating process-global state.
  void environment;
  const context = sourceOwnedGitContext(cwd);
  assertSourceOwnedGitMetadata(context);
  if (classifySourceOwnedGitCommand(args).kind !== "local") {
    return { command: `git ${args.join(" ")}`, status: 128, stdout: "", stderr: "Git invocation is outside the source-owned command grammar", error: null };
  }
  const fixedArgs = fixedRepositoryGitArgs(cwd, args);
  const result = spawnPinnedRepositoryGit(context, fixedArgs, {
    cwd, environment: fixedRepositoryGitEnvironment(context),
  });
  return sourceOwnedGitContextStable(context) ? {
    command: `/usr/bin/git ${fixedArgs.join(" ")}`,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  } : { command: `/usr/bin/git ${fixedArgs.join(" ")}`, status: 128, stdout: "", stderr: "Repository Git metadata changed during operation", error: null };
}

function fixedRepositoryGitArgs(cwd, args, { allowLocalFileTransport = false } = {}) {
  const commandArgs = args[0] === "diff" ? ["diff", "--no-ext-diff", "--no-textconv", ...args.slice(1)] : args;
  return [
    "--no-replace-objects",
    "-c", "credential.helper=",
    "-c", "credential.https://github.com.helper=!/usr/bin/gh auth git-credential",
    "-c", "core.attributesFile=/dev/null",
    "-c", "core.excludesFile=/dev/null",
    "-c", "core.fsmonitor=false",
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.editor=/usr/bin/false",
    "-c", "sequence.editor=/usr/bin/false",
    "-c", "commit.gpgSign=false",
    "-c", "tag.gpgSign=false",
    "-c", "gpg.program=/usr/bin/false",
    "-c", "gpg.openpgp.program=/usr/bin/false",
    "-c", "gpg.ssh.program=/usr/bin/false",
    "-c", `core.worktree=${path.resolve(cwd)}`,
    "-c", "protocol.ext.allow=never",
    "-c", `protocol.file.allow=${allowLocalFileTransport ? "user" : "never"}`,
    ...commandArgs,
  ];
}

function fixedRepositoryGitEnvironment(context, {
  bindAttributesToHead = true, internalIndexFile = null, manageWorktrees = false,
} = {}) {
  const indexFile = internalIndexFile === null
    ? context.indexFile
    : validateInternalGitIndexFile(internalIndexFile);
  const environment = {
    ...fixedUserEnvironment(),
    PATH: "/usr/bin:/bin",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_COMMON_DIR: context.commonDir,
    GIT_DIR: context.gitDir,
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_ASKPASS: "/usr/bin/false",
    GIT_EDITOR: "/usr/bin/false",
    GIT_LITERAL_PATHSPECS: "1",
    GIT_PAGER: "cat",
    GIT_SEQUENCE_EDITOR: "/usr/bin/false",
    GIT_SSH_COMMAND: "/usr/bin/ssh -F /dev/null -o BatchMode=yes -o ProxyCommand=none -o ProxyJump=none -o PermitLocalCommand=no",
    GIT_TERMINAL_PROMPT: "0",
    GIT_WORK_TREE: context.root,
    LANG: "C",
    LC_ALL: "C",
  };
  if (!manageWorktrees) environment.GIT_INDEX_FILE = indexFile;
  if (bindAttributesToHead) environment.GIT_ATTR_SOURCE = "HEAD";
  return environment;
}

function openPinnedDirectory(target, expectedIdentity, label) {
  const flags = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;
  const fd = openSync(target, flags);
  try {
    const info = fstatSync(fd);
    if (directoryIdentity(info) !== expectedIdentity) throw new Error(`${label} changed during descriptor admission`);
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function spawnPinnedRepositoryGit(context, fixedArgs, {
  cwd = context.root, input, environment, timeoutMs, maxBuffer,
} = {}) {
  const descriptors = [];
  try {
    descriptors.push(openPinnedDirectory(context.objectDir, context.objectDirIdentity, "Git object directory"));
    descriptors.push(openPinnedDirectory(context.commonDir, context.commonDirIdentity, "Git common directory"));
    return spawnSync("/usr/bin/git", fixedArgs, {
      cwd,
      input,
      env: {
        ...environment,
        GIT_OBJECT_DIRECTORY: "/proc/self/fd/3",
        GIT_COMMON_DIR: "/proc/self/fd/4",
      },
      stdio: ["pipe", "pipe", "pipe", ...descriptors],
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      timeout: boundedCommandTimeout(timeoutMs),
      maxBuffer: boundedCommandOutput(maxBuffer),
    });
  } finally {
    for (const fd of descriptors) closeSync(fd);
  }
}

function normalizePinnedGitMetadataResult(result, args, context) {
  if (result.status !== 0 || args[0] !== "rev-parse") return result;
  const signature = args.slice(1).join("\0");
  let value = null;
  if (signature === "--git-common-dir" || signature === "--path-format=absolute\0--git-common-dir") {
    value = context.commonDir;
  } else if (signature === "--git-path\0config.worktree") {
    value = path.join(context.gitDir, "config.worktree");
  } else if (signature === "--git-path\0info/attributes") {
    value = path.join(context.commonDir, "info", "attributes");
  } else if (signature === "--git-path\0info/exclude") {
    value = path.join(context.commonDir, "info", "exclude");
  }
  return value === null ? result : { ...result, stdout: `${value}\n` };
}

function readSourceOwnedWorktreeBlob(context, relativePath) {
  const components = relativePath.split("/");
  const descriptors = [];
  try {
    let directoryFd = openPinnedDirectory(context.root, directoryIdentity(lstatSync(context.root)), "repository worktree");
    descriptors.push(directoryFd);
    for (const component of components.slice(0, -1)) {
      const next = openSync(`/proc/self/fd/${directoryFd}/${component}`,
        fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
      const info = fstatSync(next);
      if (!info.isDirectory() || info.isSymbolicLink()
        || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
        closeSync(next);
        throw new Error("Repository blob parent is unsafe");
      }
      descriptors.push(next);
      directoryFd = next;
    }
    const terminal = `/proc/self/fd/${directoryFd}/${components.at(-1)}`;
    const before = lstatSync(terminal);
    if (before.isSymbolicLink()) throw new Error("Repository symlink blob hashing is unsupported");
    if (!before.isFile() || before.size > 16 * 1024 * 1024
      || (typeof process.getuid === "function" && before.uid !== process.getuid())) {
      throw new Error("Repository blob is unsafe or oversized");
    }
    const fileFd = openSync(terminal, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    descriptors.push(fileFd);
    const opened = fstatSync(fileFd);
    if (fileIdentity(opened) !== fileIdentity(before)) throw new Error("Repository blob changed before descriptor read");
    const bytes = readFileSync(fileFd);
    if (bytes.length !== opened.size || fileIdentity(fstatSync(fileFd)) !== fileIdentity(opened)
      || pathIdentity(lstatSync(terminal)) !== pathIdentity(before)) {
      throw new Error("Repository blob changed during descriptor read");
    }
    return bytes;
  } finally {
    for (const fd of descriptors.reverse()) closeSync(fd);
  }
}

function fixedPureGitEnvironment() {
  return {
    ...fixedUserEnvironment(), PATH: "/usr/bin:/bin", GIT_ATTR_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "/dev/null", GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1", GIT_OPTIONAL_LOCKS: "0", LANG: "C", LC_ALL: "C",
  };
}

export function runTrustedGithub(config, args, options = {}) {
  if (!config?.repoRoot || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(String(config?.repositorySlug || ""))) {
    return { command: "/usr/bin/gh", status: 1, stdout: "", stderr: "explicit GitHub repository context is required", error: null };
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    return { command: "/usr/bin/gh", status: 1, stdout: "", stderr: "fixed GitHub argv is required", error: null };
  }
  let boundArgs;
  try {
    boundArgs = bindGithubRepository(args, config.repositorySlug);
  } catch (error) {
    return { command: "/usr/bin/gh", status: 1, stdout: "", stderr: error.message, error: null };
  }
  let authenticationEnvironment;
  try {
    authenticationEnvironment = trustedGithubAuthenticationEnvironment();
  } catch {
    return { command: "/usr/bin/gh", status: 1, stdout: "", stderr: "GitHub authentication path is untrusted", error: null };
  }
  const result = spawnSync("/usr/bin/gh", boundArgs, {
    cwd: config.repoRoot,
    input: typeof options.input === "string" || Buffer.isBuffer(options.input) ? options.input : undefined,
    env: { ...authenticationEnvironment, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" },
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: boundedCommandTimeout(options.timeoutMs ?? options.timeout),
    maxBuffer: boundedCommandOutput(options.maxBuffer),
  });
  return {
    command: `/usr/bin/gh ${boundArgs.join(" ")}`,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || null,
  };
}

function bindGithubRepository(args, repositorySlug) {
  const expected = repositorySlug.toLowerCase();
  const selectors = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--repo" || arg === "-R") {
      if (index + 1 >= args.length) throw new Error("GitHub repository selector is incomplete");
      selectors.push(args[index + 1]);
      index += 1;
    } else if (arg.startsWith("--repo=")) selectors.push(arg.slice("--repo=".length));
    else if (/^-R.+/u.test(arg)) selectors.push(arg.slice(2));
  }
  if (selectors.length > 1 || selectors.some((value) => value.toLowerCase() !== expected)) {
    throw new Error("GitHub repository selector differs from the trusted repository context");
  }
  if (["issue", "pr", "run", "workflow", "release", "label"].includes(args[0])) {
    return selectors.length === 1 ? [...args] : [...args, "--repo", repositorySlug];
  }
  if (args[0] === "repo" && args[1] === "view") {
    const positional = args[2] && !args[2].startsWith("-") ? args[2] : null;
    if (positional && positional.toLowerCase() !== expected) {
      throw new Error("GitHub positional repository differs from the trusted repository context");
    }
    return positional ? [...args] : [args[0], args[1], repositorySlug, ...args.slice(2)];
  }
  if (args[0] === "repo") throw new Error("GitHub repository command is not source-owned");
  if (args[0] === "api") validateGithubApiRepositoryBinding(args, repositorySlug);
  return [...args];
}

function validateGithubApiRepositoryBinding(args, repositorySlug) {
  const expected = repositorySlug.toLowerCase();
  const repositoryEndpoints = args.filter((arg) => /^\/?repos\//u.test(arg));
  for (const endpoint of repositoryEndpoints) {
    const match = endpoint.match(/^\/?repos\/([^/]+\/[^/?#]+)(?:[/?#]|$)/u);
    if (!match || match[1].toLowerCase() !== expected) {
      throw new Error("GitHub API endpoint differs from the trusted repository context");
    }
  }
  if (!args.includes("graphql") && repositoryEndpoints.length !== 1) {
    throw new Error("GitHub API endpoint is not bound to the trusted repository context");
  }
  if (args.includes("graphql") && args.some((arg) => /\brepository\s*\(/u.test(arg))) {
    const [owner, name] = repositorySlug.split("/");
    const ownerVariables = args.filter((arg) => arg.startsWith("owner=")).map((arg) => arg.slice(6));
    const nameVariables = args.filter((arg) => arg.startsWith("name=")).map((arg) => arg.slice(5));
    if (ownerVariables.length !== 1 || nameVariables.length !== 1
      || ownerVariables[0].toLowerCase() !== owner.toLowerCase()
      || nameVariables[0].toLowerCase() !== name.toLowerCase()) {
      throw new Error("GitHub GraphQL repository variables differ from the trusted repository context");
    }
  }
}

export const gitWorkspaceTestInternals = Object.freeze({
  bindGithubRepository,
  classifySourceOwnedGitCommand,
  fixedRepositoryGitArgs,
  fixedRepositoryGitEnvironment,
});

function trustedGithubAuthenticationEnvironment() {
  const environment = fixedUserEnvironment();
  const home = environment.HOME;
  const configRoot = environment.GH_CONFIG_DIR;
  const hosts = path.join(configRoot, "hosts.yml");
  for (const [target, type] of [[home, "directory"], [configRoot, "directory"], [hosts, "file"]]) {
    const info = lstatSync(target);
    const validType = type === "directory" ? info.isDirectory() : info.isFile();
    if (!validType || info.isSymbolicLink() || realpathSync(target) !== target
      || (info.mode & 0o022) !== 0
      || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
      throw new Error("GitHub authentication path is untrusted");
    }
  }
  return environment;
}

function fixedUserEnvironment() {
  const home = os.userInfo().homedir;
  return {
    HOME: home,
    GH_CONFIG_DIR: path.join(home, ".config", "gh"),
    PATH: "/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
  };
}

function boundedCommandTimeout(value) {
  return Number.isInteger(value) ? Math.max(1_000, Math.min(value, 120_000)) : 30_000;
}

function boundedCommandOutput(value) {
  return Number.isInteger(value) ? Math.max(1_024, Math.min(value, 16 * 1024 * 1024)) : 16 * 1024 * 1024;
}

function repositoryHasHead(context) {
  const result = spawnPinnedRepositoryGit(context,
    fixedRepositoryGitArgs(context.root, ["rev-parse", "--verify", "HEAD^{commit}"]), {
      cwd: context.root,
      environment: fixedRepositoryGitEnvironment(context, { bindAttributesToHead: false }),
    });
  return result.status === 0 && !result.error;
}

function assertSourceOwnedGitMetadata(context) {
  const git = (args) => normalizePinnedGitMetadataResult(
    spawnPinnedRepositoryGit(context, fixedRepositoryGitArgs(context.root, args), {
      cwd: context.root,
      environment: fixedRepositoryGitEnvironment(context, { bindAttributesToHead: false }),
    }), args, context,
  );
  const local = git(["config", "--local", "--name-only", "--list"]);
  const unsupportedLocal = unsupportedRepositoryGitConfigKeys(local.stdout);
  if (local.status !== 0 || unsupportedLocal.length) throw new Error("Repository Git configuration is unsafe");
  const worktreeEnabled = git(["config", "--local", "--get", "extensions.worktreeConfig"]);
  if (worktreeEnabled.status === 0) {
    if (worktreeEnabled.stdout.trim().toLowerCase() !== "true") throw new Error("Repository worktree Git configuration is unsafe");
    const worktreePathRead = git(["rev-parse", "--git-path", "config.worktree"]);
    if (worktreePathRead.status !== 0) throw new Error("Repository worktree Git configuration is unsafe");
    const worktreePath = path.resolve(context.root, worktreePathRead.stdout.trim());
    if (existsSync(worktreePath)) {
      const worktree = git(["config", "--worktree", "--name-only", "--list"]);
      const unsupportedWorktree = unsupportedRepositoryGitConfigKeys(worktree.stdout);
      if (worktree.status !== 0 || unsupportedWorktree.length) throw new Error("Repository worktree Git configuration is unsafe");
    }
  } else if (worktreeEnabled.status !== 1) throw new Error("Repository Git configuration is unreadable");
  const attributes = git(["rev-parse", "--git-path", "info/attributes"]);
  const excludes = git(["rev-parse", "--git-path", "info/exclude"]);
  if (attributes.status !== 0 || excludes.status !== 0) throw new Error("Repository Git metadata is unreadable");
  if (existsSync(path.resolve(context.root, attributes.stdout.trim()))) throw new Error("Repository Git attributes are unsafe");
  const excludePath = path.resolve(context.root, excludes.stdout.trim());
  if (existsSync(excludePath) && readFileSync(excludePath, "utf8").split(/\r?\n/u)
    .some((line) => line.trim() && !line.trim().startsWith("#") && line.trim() !== ".codex/")) {
    throw new Error("Repository Git excludes are unsafe");
  }
}

function assertSourceOwnedTreeAttributes(context) {
  const run = (args) => spawnPinnedRepositoryGit(context, fixedRepositoryGitArgs(context.root, args), {
    cwd: context.root,
    environment: fixedRepositoryGitEnvironment(context, { bindAttributesToHead: false }),
  });
  const listed = run(["ls-tree", "-r", "--name-only", "HEAD"]);
  if (listed.status !== 0 || listed.error) throw new Error("Repository attribute inventory is unreadable");
  const attributePaths = listed.stdout.split(/\r?\n/u).filter((entry) => entry === ".gitattributes" || entry.endsWith("/.gitattributes"));
  for (const attributePath of attributePaths) {
    if (!sourceOwnedRepositoryPath(attributePath)) throw new Error("Repository attribute path is unsafe");
    const shown = run(["show", `HEAD:${attributePath}`]);
    if (shown.status !== 0 || shown.error || shown.stdout.length > 256 * 1024) throw new Error("Repository attributes are unreadable");
    for (const line of shown.stdout.split(/\r?\n/u)) {
      const body = line.trim();
      if (!body || body.startsWith("#")) continue;
      if (/(?:^|\s)(?:!?-?(?:filter|diff|merge)|working-tree-encoding)(?:[=\s]|$)/u.test(body)) {
        throw new Error("Repository attributes may not select executable Git drivers");
      }
    }
  }
}

function sourceOwnedGitContext(cwd) {
  const root = realpathSync(path.resolve(cwd));
  if (root !== path.resolve(cwd)) throw new Error("Repository worktree path is noncanonical");
  const entryPath = path.join(root, ".git");
  const entryBefore = lstatSync(entryPath);
  if (!entryBefore.isDirectory() && !entryBefore.isFile()) throw new Error("Repository Git entry is unsafe");
  if (entryBefore.isSymbolicLink()
    || (typeof process.getuid === "function" && entryBefore.uid !== process.getuid())) {
    throw new Error("Repository Git entry is unsafe");
  }
  const probe = spawnSync("/usr/bin/git", fixedRepositoryGitArgs(root, [
    "rev-parse", "--path-format=absolute", "--absolute-git-dir", "--git-common-dir", "--show-toplevel",
  ]), { cwd: root, env: fixedPureGitEnvironment(), encoding: "utf8", windowsHide: true });
  if (probe.error || probe.status !== 0) throw new Error("Repository Git metadata is unreadable");
  const [gitDirRaw, commonDirRaw, topRaw, ...extra] = probe.stdout.trimEnd().split("\n");
  if (extra.length || realpathSync(topRaw) !== root) throw new Error("Repository Git worktree identity mismatch");
  const gitDir = realpathSync(gitDirRaw);
  const commonDir = realpathSync(commonDirRaw);
  for (const directory of [gitDir, commonDir]) {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()
      || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
      throw new Error("Repository Git directory is unsafe");
    }
  }
  const objectDir = path.join(commonDir, "objects");
  const objectInfo = lstatSync(objectDir);
  if (!objectInfo.isDirectory() || objectInfo.isSymbolicLink()
    || realpathSync(objectDir) !== objectDir
    || (typeof process.getuid === "function" && objectInfo.uid !== process.getuid())) {
    throw new Error("Repository Git object directory is unsafe");
  }
  const entryAfter = lstatSync(entryPath);
  if (pathIdentity(entryBefore) !== pathIdentity(entryAfter)) throw new Error("Repository Git entry changed during admission");
  const guardedMetadata = guardedGitMetadataIdentity(gitDir, commonDir);
  assertGuardedGitMetadataPaths(guardedMetadata);
  const context = {
    root, entryPath, entryIdentity: pathIdentity(entryAfter), gitDir, commonDir, objectDir,
    gitDirIdentity: directoryIdentity(lstatSync(gitDir)), commonDirIdentity: directoryIdentity(lstatSync(commonDir)),
    objectDirIdentity: directoryIdentity(objectInfo),
    indexFile: path.join(gitDir, "index"), guardedMetadata,
  };
  const admitted = admittedRepositoryContexts.get(root);
  if (admitted && !sameAdmittedGitTuple(admitted, context)) {
    throw new Error("Repository Git tuple changed after admission");
  }
  return context;
}

function admitSourceOwnedGitContext(cwd) {
  const context = sourceOwnedGitContext(cwd);
  assertSourceOwnedGitMetadata(context);
  if (!sourceOwnedGitContextStable(context)) throw new Error("Repository Git tuple changed during admission");
  return Object.freeze({ ...context, guardedMetadata: Object.freeze(context.guardedMetadata) });
}

function sameAdmittedGitTuple(expected, current) {
  return expected.root === current.root
    && expected.entryPath === current.entryPath
    && expected.entryIdentity === current.entryIdentity
    && expected.gitDir === current.gitDir
    && expected.commonDir === current.commonDir
    && expected.objectDir === current.objectDir
    && expected.gitDirIdentity === current.gitDirIdentity
    && expected.commonDirIdentity === current.commonDirIdentity
    && expected.objectDirIdentity === current.objectDirIdentity
    && expected.indexFile === current.indexFile
    && expected.guardedMetadata.identity === current.guardedMetadata.identity;
}

function sourceOwnedGitContextStable(context) {
  try {
    return pathIdentity(lstatSync(context.entryPath)) === context.entryIdentity
      && directoryIdentity(lstatSync(context.gitDir)) === context.gitDirIdentity
      && directoryIdentity(lstatSync(context.commonDir)) === context.commonDirIdentity
      && directoryIdentity(lstatSync(context.objectDir)) === context.objectDirIdentity
      && guardedGitMetadataIdentity(context.gitDir, context.commonDir).identity === context.guardedMetadata.identity;
  } catch { return false; }
}

function guardedGitMetadataIdentity(gitDir, commonDir) {
  const paths = [...new Set([
    path.join(commonDir, "config"), path.join(gitDir, "config.worktree"),
    path.join(commonDir, "packed-refs"),
    path.join(commonDir, "info", "attributes"), path.join(commonDir, "info", "exclude"),
    path.join(commonDir, "info", "grafts"), path.join(commonDir, "objects", "info", "alternates"),
    path.join(commonDir, "objects", "info", "http-alternates"),
    path.join(commonDir, "shallow"), path.join(gitDir, "shallow"),
  ])].sort();
  const entries = paths.map((metadataPath) => {
    const info = lstatOptional(metadataPath);
    if (!info) return { path: metadataPath, identity: "absent", safe: true };
    const mutableReferenceStore = metadataPath === path.join(commonDir, "packed-refs");
    return {
      path: metadataPath,
      identity: mutableReferenceStore ? "safe-reference-store" : fileIdentity(info),
      safe: info.isFile() && !info.isSymbolicLink()
        && (typeof process.getuid !== "function" || info.uid === process.getuid()),
      graphNeutral: !isGraphRewritingMetadata(metadataPath),
    };
  });
  const referenceNamespaceIdentity = guardedReferenceNamespaceIdentity(commonDir);
  return {
    entries,
    referenceNamespaceIdentity,
    identity: [...entries.map((entry) => `${entry.path}:${entry.identity}`), referenceNamespaceIdentity].join("\n"),
  };
}

function guardedReferenceNamespaceIdentity(commonDir) {
  const root = path.join(commonDir, "refs");
  const rootInfo = lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()
    || (typeof process.getuid === "function" && rootInfo.uid !== process.getuid())) {
    throw new Error("Repository Git refs namespace is unsafe");
  }
  const pending = [root];
  let inspected = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (++inspected > 4096) throw new Error("Repository Git refs namespace is unbounded");
      const candidate = path.join(current, entry.name);
      const info = lstatSync(candidate);
      if (entry.isSymbolicLink() || info.isSymbolicLink()
        || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
        throw new Error("Repository Git refs namespace is unsafe");
      }
      if (info.isDirectory()) {
        pending.push(candidate);
      } else if (!info.isFile()) {
        throw new Error("Repository Git refs namespace is unsafe");
      }
    }
  }
  return `${root}:${directoryIdentity(rootInfo)}`;
}

function lstatOptional(target) {
  try { return lstatSync(target); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertGuardedGitMetadataPaths(snapshot) {
  if (snapshot.entries.some((entry) => !entry.safe || entry.graphNeutral === false)) {
    throw new Error("Repository Git metadata path is unsafe or rewrites object ancestry");
  }
}

function isGraphRewritingMetadata(metadataPath) {
  return /(?:\/info\/grafts|\/objects\/info\/(?:http-)?alternates|\/shallow)$/u.test(metadataPath);
}

function fileIdentity(info) {
  return [info.dev, info.ino, info.mode, info.uid, info.size, info.mtimeMs, info.ctimeMs].join(":");
}

function directoryIdentity(info) {
  return [info.dev, info.ino, info.mode, info.uid].join(":");
}

function pathIdentity(info) {
  return info.isDirectory() ? directoryIdentity(info) : fileIdentity(info);
}

function validateInternalGitIndexFile(value) {
  const candidate = path.resolve(value || "");
  const parent = path.dirname(candidate);
  if (!path.isAbsolute(value || "") || candidate !== value
    || !/^settleora-(?:commit|recovery)-index-/u.test(path.basename(parent))
    || path.dirname(parent) !== realpathSync(os.tmpdir())) {
    throw new Error("Internal Git index path is unsafe");
  }
  const parentInfo = lstatSync(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || (parentInfo.mode & 0o077) !== 0) {
    throw new Error("Internal Git index parent is unsafe");
  }
  return candidate;
}

function unsupportedRepositoryGitConfigKeys(value) {
  const allowed = [
    /^core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|worktree)$/u,
    /^extensions\.worktreeconfig$/u,
    /^remote\.origin\.(?:url|pushurl|fetch)$/u,
    /^branch\..+\.(?:remote|merge)$/u,
    /^user\.(?:name|email)$/u,
  ];
  return String(value || "").split("\n").filter(Boolean).filter((key) => !allowed.some((pattern) => pattern.test(key)));
}

function inspectRawLaunchWorkspace(cwd, environment) {
  const run = (args) => runLaunchWorkspaceGuardGit(args, { cwd, environment });
  const indexFlags = run(["ls-files", "-v", "-z"]);
  assertGitSuccess(indexFlags, "Unable to inspect launch index flags");
  if (indexFlags.stdout.split("\0").filter(Boolean).some((entry) => !entry.startsWith("H "))) return "unsafe-index-flags";
  const staged = run(["diff-index", "--cached", "--quiet", "HEAD", "--"]);
  if (![0, 1].includes(staged.status) || staged.error) assertGitSuccess(staged, "Unable to inspect launch index");
  if (staged.status === 1) return "staged-index-differs-from-head";
  const untracked = run(["ls-files", "--others", "--exclude-standard", "-z"]);
  assertGitSuccess(untracked, "Unable to inspect launch untracked files");
  if (untracked.stdout.split("\0").some(Boolean)) return "untracked-files-present";
  const format = run(["rev-parse", "--show-object-format"]);
  assertGitSuccess(format, "Unable to inspect repository object format");
  const algorithm = format.stdout.trim();
  if (!["sha1", "sha256"].includes(algorithm)) throw new Error("Unsupported repository object format");
  const index = run(["ls-files", "--stage", "-z"]);
  assertGitSuccess(index, "Unable to inspect launch index entries");
  for (const entry of index.stdout.split("\0").filter(Boolean)) {
    const match = entry.match(/^(100644|100755|120000) ([a-f0-9]+) 0\t([\s\S]+)$/u);
    if (!match) return "unsupported-or-unmerged-index-entry";
    const [, mode, expected, relative] = match;
    const file = path.resolve(cwd, relative);
    const boundary = path.relative(path.resolve(cwd), file);
    if (boundary.startsWith("..") || path.isAbsolute(boundary)) return "index-path-escaped-worktree";
    let bytes;
    try {
      const stat = lstatSync(file);
      if (mode === "120000") {
        return stat.isSymbolicLink() ? "tracked-symlink-authentication-unsupported" : "tracked-file-type-drift";
      } else {
        if (!stat.isFile() || stat.isSymbolicLink()) return "tracked-file-type-drift";
        const executable = (stat.mode & 0o111) !== 0;
        if (executable !== (mode === "100755")) return "tracked-file-mode-drift";
        bytes = readFileSync(file);
      }
    } catch { return "tracked-file-missing"; }
    const actual = createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (actual !== expected) return "tracked-file-bytes-differ-from-index";
  }
  return "";
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
  const verified = assertRepositoryRemoteIdentity(config);
  const remote = verified?.originUrl || "origin";
  const refspec = `${options.trustedHistoricalRecovery === true ? "+" : ""}refs/heads/main:refs/remotes/origin/main`;
  const result = options.trustedHistoricalRecovery === true
    ? runTrustedHistoricalFetch(config.repoRoot, remote, refspec, config.runtimeMode !== "external")
    : runGit(["fetch", "--no-tags", remote, refspec], {
      cwd: config.repoRoot, allowLocalFileTransport: config.runtimeMode !== "external",
    });
  assertGitSuccess(result, "Unable to fetch origin/main");
  return { skipped: false, status: result.status };
}

export function runAuthenticatedRemoteGit(config, command, trailing = [], { push = false } = {}) {
  const verified = assertRepositoryRemoteIdentity(config);
  const remote = verified ? (push ? verified.pushUrl : verified.originUrl) : "origin";
  return runGit([...command, remote, ...trailing], {
    cwd: config.repoRoot,
    allowLocalFileTransport: config.runtimeMode !== "external",
  });
}

export function fetchAuthenticatedRemoteRef(config, branchName, targetRef = null) {
  if (typeof branchName !== "string" || !/^(?!.*\.\.)(?!.*\.$)[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/u.test(branchName)
    || branchName.includes("//") || branchName.includes("@{") || branchName.endsWith("/")) {
    return { command: "/usr/bin/git fetch", status: 128, stdout: "", stderr: "invalid branch identity", error: null };
  }
  const verified = assertRepositoryRemoteIdentity(config);
  const remote = verified?.originUrl || "origin";
  const refspec = targetRef ? `refs/heads/${branchName}:${targetRef}` : `refs/heads/${branchName}`;
  return runGit(["fetch", "--no-tags", remote, refspec], {
    cwd: config.repoRoot, allowLocalFileTransport: config.runtimeMode !== "external",
  });
}

export function runTrustedProspectiveMergeTree(config, baseSha, headSha) {
  if (!/^[a-f0-9]{40}$/u.test(baseSha || "") || !/^[a-f0-9]{40}$/u.test(headSha || "")) {
    return { command: "/usr/bin/git merge-tree", status: 128, stdout: "", stderr: "invalid merge identity", error: null };
  }
  const args = ["merge-tree", "--write-tree", baseSha, headSha];
  return runFixedTrustedGit(config.repoRoot, args);
}

function runTrustedHistoricalFetch(cwd, remote, refspec, allowLocalFileTransport) {
  const args = ["fetch", "--no-tags", remote, refspec];
  return runGit(args, { cwd, allowLocalFileTransport });
}

function runFixedTrustedGit(cwd, args, extraEnv = {}) {
  void extraEnv;
  return runGit(args, { cwd, manageWorktrees: args.includes("worktree") });
}

export function createTaskBranch(config, branchName, baseRef = "origin/main") {
  if (config.dryRun) {
    return { skipped: true, branchName, baseRef, reason: "dry-run" };
  }
  const result = runGit(["switch", "--no-track", "-C", branchName, baseRef], { cwd: config.repoRoot });
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
  const intendedTreeSha = pending?.effect.treeSha || computeIntendedTreeForCommit(cwd, files, parent);
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

export function computeIntendedTreeForCommit(cwd, files, parent) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "settleora-commit-index-"));
  const indexPath = path.join(tempRoot, "index");
  try {
    const read = runGit(["read-tree", parent], { cwd, internalIndexFile: indexPath });
    assertGitSuccess(read, "Unable to initialize isolated commit index");
    const add = runGit(["add", "--", ...files], { cwd, internalIndexFile: indexPath });
    assertGitSuccess(add, "Unable to stage explicit paths in isolated commit index");
    const tree = runGit(["write-tree"], { cwd, internalIndexFile: indexPath });
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
    issueNumber: logical.issueNumber,
    sessionId,
    authorityGeneration: authority.generation,
    branchName: state.branch?.name,
    baseSha: state.branch?.baseSha,
    candidateIdentity: state.branch?.candidateDigest || state.branch?.headSha,
    reservationIdentity: input.reservationIdentity || null,
    currentAuthority: { runId: logical.runId, sessionId, authorityGeneration: authority.generation, status: authority.status },
    expectedIdentity: { repository: state.repository, sourceTaskKey: logical.taskKey, runId: logical.runId, logicalTaskIdentity: logical.claimIdentity, claimIdentity: logical.claimIdentity, chargeIdentity: logical.chargeMarkerRef, issueNumber: logical.issueNumber, sessionId, authorityGeneration: authority.generation },
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

function findFinalizedHistoricalWorktreeEffect(config, context, effect) {
  const matches = findPreEffectIntents(config, (intent) =>
    intent.effectType === "worktree_create"
    && intent.status === "finalized"
    && intent.repository === context.repository
    && intent.sourceTaskKey === context.sourceTaskKey
    && intent.runId === context.runId
    && intent.logicalTaskIdentity === context.logicalTaskIdentity
    && intent.claimIdentity === context.claimIdentity
    && intent.chargeIdentity === context.chargeIdentity
    && intent.identity?.branchName === context.branchName
    && intent.identity?.headSha === effect.headSha
    && intent.effect?.branchName === effect.branchName
    && intent.effect?.headSha === effect.headSha
    && intent.effect?.taskRoot === effect.taskRoot
    && intent.effect?.commonDir === effect.commonDir);
  if (matches.length > 1) throw new Error("Ambiguous finalized canonical worktree_create intents");
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
