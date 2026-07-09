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
  if (config.fixtureIssues) {
    const parsed = config.fixtureIssues.map((issue) => ({ ...issue, labels: labelNames(issue) }));
    const eligible = filterAndSortEligibleIssues(config, parsed).slice(config.fixtureIssueCursor || 0);
    return { issues: eligible, rawCount: parsed.length, fixture: true };
  }

  let searches;
  try {
    searches = buildEligibleLabelSearches(repoSlug(), config.eligibleLabels);
  } catch (error) {
    const detail = { error: error.message };
    if (config.run) {
      throw new Error(`GitHub issue polling refused unsafe eligible labels in real-run mode: ${JSON.stringify(detail)}`);
    }
    logger.warn("Dry-run refused unsafe eligible labels; continuing with no eligible work.", detail);
    return { issues: [], warning: detail };
  }

  const results = searches.map(({ search }) =>
    runGh([
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
    ]),
  );

  const failed = results.filter((result) => result.error || result.status !== 0);
  if (failed.length > 0) {
    const detail = {
      searches,
      failures: failed.map((result) => ({
        command: result.command,
        status: result.status,
        stderr: result.stderr.trim(),
        error: result.error,
      })),
    };
    if (config.run) {
      throw new Error(`GitHub issue polling failed in real-run mode: ${JSON.stringify(detail)}`);
    }
    logger.warn("Dry-run could not poll GitHub issues; continuing with no eligible work.", detail);
    return { issues: [], warning: detail, searches };
  }

  const parsed = dedupeIssuesByNumber(
    results.flatMap((result) =>
      JSON.parse(result.stdout || "[]").map((issue) => ({
        ...issue,
        labels: labelNames(issue),
      })),
    ),
  );
  const eligible = filterAndSortEligibleIssues(config, parsed);
  return { issues: eligible, rawCount: parsed.length, searches };
}

export function buildEligibleLabelSearches(repo, eligibleLabels) {
  const labels = validateEligibleLabels(eligibleLabels);
  if (!repo || !repo.includes("/")) {
    throw new Error("GitHub repository slug could not be resolved");
  }
  return labels.map((label) => ({
    label,
    search: `repo:${repo} is:issue is:open label:${label}`,
  }));
}

export function validateEligibleLabels(eligibleLabels) {
  if (!Array.isArray(eligibleLabels) || eligibleLabels.length === 0) {
    throw new Error("eligibleLabels must include at least one label");
  }
  return eligibleLabels.map((label, index) => {
    if (typeof label !== "string") {
      throw new Error(`eligibleLabels[${index}] must be a string`);
    }
    const normalized = label.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(normalized)) {
      throw new Error(`eligibleLabels[${index}] is empty or unsafe: ${JSON.stringify(label)}`);
    }
    return normalized;
  });
}

export function dedupeIssuesByNumber(issues) {
  const byNumber = new Map();
  for (const issue of issues) {
    if (!Number.isInteger(issue.number)) continue;
    if (!byNumber.has(issue.number)) {
      byNumber.set(issue.number, issue);
    }
  }
  return [...byNumber.values()];
}

export function claimIssue(config, issue, logger) {
  const claim = {
    issueNumber: issue.number,
    claimedAt: new Date().toISOString(),
    runnerPid: process.pid,
  };
  if (config.dryRun) {
    return {
      ...claim,
      skipped: true,
      reason: config.fixtureIssues ? "dry-run-fixture" : "dry-run",
      preview: {
        addLabels: [...config.claimLabels],
        removeLabels: [],
        comment: claimComment(claim.claimedAt),
      },
    };
  }

  const labelResult = runGh(["issue", "edit", String(issue.number), "--add-label", config.claimLabels.join(",")]);
  if (labelResult.error || labelResult.status !== 0) {
    throw new Error(`Unable to claim issue #${issue.number}: ${labelResult.stderr || labelResult.error}`);
  }
  const comment = claimComment(claim.claimedAt);
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
  const mutations = outcomeToMutations(outcome);
  const boundedBody = body.length > 4000 ? `${body.slice(0, 3900)}\n\n[truncated]` : body;
  if (config.dryRun) {
    return {
      skipped: true,
      reason: config.fixtureIssues ? "dry-run-fixture" : "dry-run",
      outcome,
      preview: { ...mutations, comment: boundedBody },
    };
  }
  if (mutations.addLabels.length > 0) {
    runGh(["issue", "edit", String(issue.number), "--add-label", mutations.addLabels.join(",")]);
  }
  if (mutations.removeLabels.length > 0) {
    runGh(["issue", "edit", String(issue.number), "--remove-label", mutations.removeLabels.join(",")]);
  }
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

function filterAndSortEligibleIssues(config, issues) {
  const stop = new Set(config.stopLabels);
  return issues
    .filter((issue) => issue.labels.some((label) => config.eligibleLabels.includes(label)))
    .filter((issue) => !issue.labels.some((label) => stop.has(label)))
    .sort((a, b) => issueSortKey(config, a).localeCompare(issueSortKey(config, b)));
}

function claimComment(claimedAt) {
  return [
    "Settleora auto-runner claimed this issue for one bounded DevBox iteration.",
    `Runner pid: ${process.pid}`,
    `Claimed at: ${claimedAt}`,
    "If this claim is stale, inspect /workspace/logs/settleora-auto-runner/state before relabeling.",
  ].join("\n");
}

function outcomeToMutations(outcome) {
  const mutations = { addLabels: [], removeLabels: ["auto-running"] };
  if (outcome === "approved_pr_opened") mutations.addLabels.push("auto-pr-opened");
  if (outcome === "danger_gate") mutations.addLabels.push("danger-gate");
  if (outcome === "blocked_needs_tommy") mutations.addLabels.push("needs-tommy");
  if (
    outcome === "auto_failed" ||
    outcome === "validation_failed" ||
    outcome === "review_changes_requested_retry_exhausted"
  ) {
    mutations.addLabels.push("auto-failed");
  }
  return mutations;
}
