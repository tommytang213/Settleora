import { spawnSync } from "node:child_process";
import { executeCanonicalEffect } from "./canonical-effect-executor.mjs";
import { canonicalEffectContext, canonicalExecutionInput, canonicalIntent, getRefSha } from "./git-workspace.mjs";

function runGh(args, cwd) {
  const result = spawnSync("gh", args, { cwd, encoding: "utf8", windowsHide: true });
  return {
    command: `gh ${args.join(" ")}`,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

export async function pushBranch(config, branchName, options = {}) {
  if (config.dryRun) return { skipped: true, reason: "dry-run" };
  if (options.effectContext) return canonicalPush(config, branchName, options.effectContext);
  const result = spawnSync("git", ["push", "origin", branchName], {
    cwd: config.repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    skipped: false,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

async function canonicalPush(config, branchName, lifecycle) {
  const context = canonicalEffectContext(lifecycle);
  const localSha = getRefSha("HEAD", { cwd: config.repoRoot });
  const before = readRemoteHead(config, branchName);
  if (!before.complete) throw new Error("Canonical push remote-before read unavailable");
  const effect = { localSha, remoteBranch: branchName, expectedRemoteBeforeSha: before.sha, allowedFastForwardTarget: localSha, repositoryOwnership: context.repository };
  const canonicalConfig = { ...config, currentAuthority: context.currentAuthority };
  const intent = canonicalIntent(context, "push", effect, { headSha: localSha });
  const result = await executeCanonicalEffect(canonicalConfig, {
    ...canonicalExecutionInput(canonicalConfig, intent),
    expectedIdentity: context.expectedIdentity,
  }, {
    readLive: (intent) => {
      const live = readRemoteHead(config, branchName);
      if (!live.complete) return { complete: false };
      if (live.sha === effect.localSha) return { complete: true, present: true, identity: intent.identity, effect };
      if (live.sha === effect.expectedRemoteBeforeSha) return { complete: true, present: false };
      return { complete: true, present: true, identity: intent.identity, effect: { ...effect, allowedFastForwardTarget: live.sha || "remote_missing" } };
    },
    execute: () => {
      const result = spawnSync("git", ["push", "origin", `${localSha}:refs/heads/${branchName}`], { cwd: config.repoRoot, encoding: "utf8", windowsHide: true });
      if (result.error || result.status !== 0) throw new Error("Canonical normal push failed");
      return { ok: true, status: result.status };
    },
  });
  if (!result.ok) throw new Error(`Canonical push failed closed: ${result.reasonCode || result.classification}`);
  return { skipped: false, status: 0, stdout: "", stderr: "", error: null, canonicalEffect: result };
}

function readRemoteHead(config, branchName) {
  const result = spawnSync("git", ["ls-remote", "--heads", "origin", `refs/heads/${branchName}`], { cwd: config.repoRoot, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return { complete: false, sha: null };
  return { complete: true, sha: result.stdout.trim() ? result.stdout.trim().split(/\s+/)[0] : null };
}

export function inspectPreReviewPrOwnership(config, branchName) {
  if (config.dryRun) {
    return {
      skipped: true,
      reason: "dry-run",
      clean: true,
      remoteBranchExists: false,
      prs: [],
    };
  }
  const remote = spawnSync("git", ["ls-remote", "--heads", "origin", branchName], {
    cwd: config.repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  const prList = runGh(
    ["pr", "list", "--head", branchName, "--state", "all", "--json", "number,url,state,headRefName,headRefOid"],
    config.repoRoot,
  );
  let prs = [];
  let prParseError = null;
  if (prList.status === 0 && !prList.error) {
    try {
      prs = JSON.parse(prList.stdout || "[]");
    } catch (error) {
      prParseError = error.message;
    }
  }
  const remoteBranchExists = remote.status === 0 && Boolean(remote.stdout.trim());
  const commandFailed = Boolean(remote.error || remote.status !== 0 || prList.error || prList.status !== 0 || prParseError);
  const clean = !commandFailed && !remoteBranchExists && prs.length === 0;
  return {
    skipped: false,
    clean,
    remoteBranchExists,
    remoteBranchSha: remoteBranchExists ? remote.stdout.trim().split(/\s+/)[0] : null,
    prs,
    commandFailed,
    errors: {
      remote: remote.error || (remote.status === 0 ? null : remote.stderr.trim()),
      prList: prList.error || (prList.status === 0 ? null : prList.stderr.trim()),
      prParse: prParseError,
    },
  };
}

export function openOrUpdatePr(config, issue, branchName, summary) {
  if (config.dryRun) return { skipped: true, reason: "dry-run" };
  const body = [
    `Closes or updates #${issue.number}.`,
    "",
    "## Auto-runner summary",
    "",
    summary,
    "",
    "Auto-merge is disabled by default. Manual review is required.",
  ].join("\n");
  const existing = runGh(["pr", "list", "--head", branchName, "--json", "number,url", "-q", ".[0].url"], config.repoRoot);
  if (existing.status === 0 && existing.stdout.trim()) {
    return { skipped: false, action: "existing", url: existing.stdout.trim() };
  }
  const result = runGh([
    "pr",
    "create",
    "--base",
    "main",
    "--head",
    branchName,
    "--title",
    `Auto-runner: #${issue.number} ${issue.title}`,
    "--body",
    body,
  ], config.repoRoot);
  return {
    skipped: false,
    action: "create",
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    error: result.error,
    url: result.status === 0 ? result.stdout.trim() : null,
  };
}

export function watchChecks(config, prUrlOrNumber) {
  if (config.dryRun) return { skipped: true, reason: "dry-run" };
  const result = runGh(["pr", "checks", String(prUrlOrNumber), "--watch", "--fail-fast"], config.repoRoot);
  return {
    skipped: false,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  };
}
