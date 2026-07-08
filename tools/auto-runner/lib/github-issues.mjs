import { spawnSync } from "node:child_process";

function runGh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", windowsHide: true });
  return {
    command: `gh ${args.join(" ")}`,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

function labelNames(issue) {
  return (issue.labels || []).map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
}

export function pollEligibleIssues(config, logger) {
  const search = `repo:${repoSlug()} is:issue is:open (${config.eligibleLabels.map((label) => `label:${label}`).join(" OR ")})`;
  const result = runGh([
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    String(config.pollLimit),
    "--json",
    "number,title,body,labels,createdAt,updatedAt,url",
    "--search",
    search,
  ]);

  if (result.error || result.status !== 0) {
    const detail = {
      command: result.command,
      status: result.status,
      stderr: result.stderr.trim(),
      error: result.error,
    };
    if (config.run) {
      throw new Error(`GitHub issue polling failed in real-run mode: ${JSON.stringify(detail)}`);
    }
    logger.warn("Dry-run could not poll GitHub issues; continuing with no eligible work.", detail);
    return { issues: [], warning: detail };
  }

  const parsed = JSON.parse(result.stdout || "[]").map((issue) => ({
    ...issue,
    labels: labelNames(issue),
  }));
  const stop = new Set(config.stopLabels);
  const eligible = parsed
    .filter((issue) => issue.labels.some((label) => config.eligibleLabels.includes(label)))
    .filter((issue) => !issue.labels.some((label) => stop.has(label)))
    .sort((a, b) => issueSortKey(config, a).localeCompare(issueSortKey(config, b)));
  return { issues: eligible, rawCount: parsed.length };
}

export function claimIssue(config, issue, logger) {
  const claim = {
    issueNumber: issue.number,
    claimedAt: new Date().toISOString(),
    runnerPid: process.pid,
  };
  if (config.dryRun) {
    return { ...claim, skipped: true, reason: "dry-run" };
  }

  const labelResult = runGh(["issue", "edit", String(issue.number), "--add-label", config.claimLabels.join(",")]);
  if (labelResult.error || labelResult.status !== 0) {
    throw new Error(`Unable to claim issue #${issue.number}: ${labelResult.stderr || labelResult.error}`);
  }
  const comment = [
    "Settleora auto-runner claimed this issue for one bounded DevBox iteration.",
    `Runner pid: ${process.pid}`,
    `Claimed at: ${claim.claimedAt}`,
    "If this claim is stale, inspect /workspace/logs/settleora-auto-runner/state before relabeling.",
  ].join("\n");
  const commentResult = runGh(["issue", "comment", String(issue.number), "--body", comment]);
  if (commentResult.error || commentResult.status !== 0) {
    logger.warn(`Issue #${issue.number} was labeled but claim comment failed.`, {
      stderr: commentResult.stderr,
      error: commentResult.error,
    });
  }
  return { ...claim, skipped: false };
}

export function commentIssueOutcome(config, issue, outcome, body) {
  if (config.dryRun) {
    return { skipped: true, reason: "dry-run", outcome };
  }
  const labels = outcomeToLabels(outcome);
  if (labels.length > 0) {
    runGh(["issue", "edit", String(issue.number), "--add-label", labels.join(",")]);
  }
  const boundedBody = body.length > 4000 ? `${body.slice(0, 3900)}\n\n[truncated]` : body;
  const result = runGh(["issue", "comment", String(issue.number), "--body", boundedBody]);
  return { skipped: false, status: result.status, stderr: result.stderr };
}

export function previewFollowupIssue(config, sourceIssue, title, body) {
  const preview = {
    title,
    body,
    labels: ["auto-followup", "needs-triage"],
    sourceIssue: sourceIssue?.number || null,
    wouldCreate: config.run && config.allowFollowupIssueCreation,
  };
  if (!preview.wouldCreate) return { skipped: true, preview };
  const result = runGh(["issue", "create", "--title", title, "--body", body, "--label", preview.labels.join(",")]);
  return { skipped: false, status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function repoSlug() {
  const result = spawnSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : "";
}

function issueSortKey(config, issue) {
  const labels = new Set(issue.labels || []);
  const priorityIndex = config.priorityLabels.findIndex((label) => labels.has(label));
  const priority = priorityIndex === -1 ? "9" : String(priorityIndex).padStart(2, "0");
  const createdAt = issue.createdAt || "9999";
  const number = String(issue.number).padStart(8, "0");
  return `${priority}:${createdAt}:${number}`;
}

function outcomeToLabels(outcome) {
  if (outcome === "danger_gate") return ["danger-gate"];
  if (outcome === "blocked_needs_tommy") return ["needs-tommy"];
  if (outcome === "auto_failed" || outcome === "validation_failed") return ["auto-failed"];
  return [];
}
