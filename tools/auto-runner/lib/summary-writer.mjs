import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function writeRunSummary(config, summary) {
  const jsonPath = path.join(config.logsRoot, "summaries", `${summary.runId}.json`);
  const markdownPath = path.join(config.logsRoot, "summaries", `${summary.runId}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(markdownPath, renderRunMarkdown(summary));
  return { jsonPath, markdownPath };
}

export function writeRecentSummary(config, sinceMs) {
  const summariesDir = path.join(config.logsRoot, "summaries");
  const cutoff = Date.now() - sinceMs;
  const summaries = existsSync(summariesDir)
    ? readdirSync(summariesDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.join(summariesDir, name))
        .map((filePath) => JSON.parse(readFileSync(filePath, "utf8")))
        .filter((summary) => Date.parse(summary.finishedAt || summary.startedAt || 0) >= cutoff)
    : [];
  const generatedAt = new Date().toISOString();
  const rollup = {
    generatedAt,
    sinceMs,
    runs: summaries.length,
    outcomes: countOutcomes(summaries),
    prsOpened: summaries.flatMap((summary) => summary.iterations || []).filter((it) => it.pr?.url).map((it) => it.pr.url),
    needsTommy: summaries.flatMap((summary) => summary.iterations || []).filter((it) => ["blocked_needs_tommy", "danger_gate"].includes(it.outcome)),
  };
  const jsonPath = path.join(summariesDir, `recent-summary-${generatedAt.replace(/[:.]/g, "")}.json`);
  const markdownPath = jsonPath.replace(/\.json$/, ".md");
  writeFileSync(jsonPath, `${JSON.stringify(rollup, null, 2)}\n`);
  writeFileSync(markdownPath, renderRecentMarkdown(rollup));
  return { jsonPath, markdownPath, rollup };
}

function renderRunMarkdown(summary) {
  const lines = [
    `# Settleora Auto-Runner Summary`,
    "",
    `- Run ID: \`${summary.runId}\``,
    `- Mode: \`${summary.mode}\``,
    `- Started: ${summary.startedAt}`,
    `- Finished: ${summary.finishedAt}`,
    `- Stop reason: ${summary.stopReason || "none"}`,
    "",
    "## Iterations",
    "",
  ];
  for (const iteration of summary.iterations || []) {
    const reviewSource = iteration.review?.verdict?.json_source ? `, review JSON: ${iteration.review.verdict.json_source}` : "";
    lines.push(`- #${iteration.issue?.number || "none"}: ${iteration.outcome || "unknown"} (${iteration.laneDecision?.lane || "no-lane"}${reviewSource})`);
  }
  return `${lines.join("\n")}\n`;
}

function renderRecentMarkdown(rollup) {
  const lines = [
    "# Settleora Auto-Runner Recent Summary",
    "",
    `- Generated: ${rollup.generatedAt}`,
    `- Runs: ${rollup.runs}`,
    `- PRs opened: ${rollup.prsOpened.length}`,
    "",
    "## Outcomes",
    "",
  ];
  for (const [outcome, count] of Object.entries(rollup.outcomes)) {
    lines.push(`- ${outcome}: ${count}`);
  }
  if (rollup.needsTommy.length > 0) {
    lines.push("", "## Needs Tommy", "");
    for (const item of rollup.needsTommy) {
      lines.push(`- #${item.issue?.number || "unknown"}: ${item.outcome}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function countOutcomes(summaries) {
  const counts = {};
  for (const iteration of summaries.flatMap((summary) => summary.iterations || [])) {
    const key = iteration.outcome || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
