import { spawnSync } from "node:child_process";

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

export function pushBranch(config, branchName) {
  if (config.dryRun) return { skipped: true, reason: "dry-run" };
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
