const codexBotLogin = "chatgpt-codex-connector[bot]";
const fullSha = /^[a-f0-9]{40}$/;
const summaryMarker = "<!-- codex-pull-request-review-summary -->";
const botFilter = `.[] | select(.user.login == "${codexBotLogin}" and .user.type == "Bot")`;
const completionFooter = [
  "<details> <summary>ℹ️ About Codex in GitHub</summary>",
  "<br/>",
  "[Your team has set up Codex to review pull requests in this repo](https://chatgpt.com/codex/cloud/settings/general). Reviews are triggered when you",
  "- Open a pull request for review",
  "- Mark a draft as ready",
  '- Comment "@codex review".',
  "If Codex has suggestions, it will comment; otherwise it will react with 👍.",
  'Codex can also answer questions or update the PR. Try commenting "@codex address that feedback".',
  "</details>",
].join("\n");
const summaryLinesBeforeRow = [
  summaryMarker,
  "## Codex Review Summary",
  "This comment shows the latest Codex review activity on this pull request.",
  "| Review | Status | Commit | Review trigger |",
  "| --- | --- | --- | --- |",
];
const summaryLinesAfterRow = [
  "<details> <summary>ℹ️ About Codex in GitHub</summary>",
  "<br/>",
  "[Your team has set up Codex to review pull requests in this repo](https://chatgpt.com/codex/cloud/settings/general). Reviews are triggered when you",
  "- Open a pull request for review",
  "- Mark a draft as ready",
  '- Comment "@codex review" or "@codex security review".',
  "Codex reacts with 👀 while any review is running, comments if it has suggestions, and reacts with 👍 once all reviews finish with no findings.",
  "</details>",
];

export function inspectHostedCodexReview({ repositorySlug, prNumber, headSha, run }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositorySlug || "")
    || !Number.isSafeInteger(Number(prNumber)) || Number(prNumber) <= 0 || !fullSha.test(headSha || "")
    || typeof run !== "function") return blocked("hosted_codex_review_identity_missing");
  const comments = readBotRecords(run, `repos/${repositorySlug}/issues/${prNumber}/comments?per_page=100`,
    `${botFilter} | {id, login:.user.login, type:.user.type, body, created_at, updated_at}`);
  if (!comments.ok) return blocked("hosted_codex_review_comments_unavailable");
  const reviews = readBotRecords(run, `repos/${repositorySlug}/pulls/${prNumber}/reviews?per_page=100`,
    `${botFilter} | {id, login:.user.login, type:.user.type, state, body, commit_id, submitted_at}`, true);
  if (!reviews.ok) return blocked("hosted_codex_review_reviews_unavailable");
  for (const review of reviews.records) {
    if (!reviewMatchesHead(review, headSha) || !["APPROVED", "COMMENTED"].includes(review.state)
      || String(review.body || "").trim()) continue;
    const inline = run("gh", ["api", "--paginate",
      `repos/${repositorySlug}/pulls/${prNumber}/reviews/${review.id}/comments?per_page=100`,
      "--jq", ".[] | {id}"]);
    if (inline?.status !== 0 || inline?.error) return blocked("hosted_codex_review_inline_comments_unavailable");
    try {
      const records = String(inline.stdout || "").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      if (!records.every((item) => Number.isSafeInteger(item.id) && item.id > 0)) throw new Error("invalid inline comment");
      review.inlineCommentCount = records.length;
    } catch { return blocked("hosted_codex_review_inline_comments_unreadable"); }
  }
  const evidence = evaluateHostedCodexReview({ comments: comments.records, reviews: reviews.records, headSha });
  if (evidence.status !== "completed_no_findings") return evidence;
  // A dependent PR can be retargeted from its parent branch to main without
  // changing its head. The old head review then covers a different diff.
  const timeline = run("gh", ["api", "--paginate",
    `repos/${repositorySlug}/issues/${prNumber}/timeline?per_page=100`, "--jq",
    '.[] | select(.event == "base_ref_changed" or .event == "automatic_base_change_succeeded") | {id,event,created_at}']);
  if (timeline?.status !== 0 || timeline?.error) return blocked("hosted_codex_review_base_history_unavailable");
  let baseChanges;
  try {
    baseChanges = String(timeline.stdout || "").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    if (!baseChanges.every((item) => Number.isSafeInteger(item.id) && item.id > 0
      && ["base_ref_changed", "automatic_base_change_succeeded"].includes(item.event)
      && Number.isFinite(Date.parse(item.created_at || "")))) throw new Error("invalid base event");
  } catch { return blocked("hosted_codex_review_base_history_unreadable"); }
  const latestBaseChange = baseChanges.reduce((latest, item) => Math.max(latest, Date.parse(item.created_at)), -Infinity);
  if (Date.parse(evidence.completedAt) <= latestBaseChange) {
    return blocked("hosted_codex_review_predates_base_change");
  }
  // GitHub resolves the bot's abbreviated reviewed-commit identifier to the full SHA.
  // Ambiguous or stale prefixes fail closed rather than being treated as exact-head proof.
  for (const prefix of [evidence.summaryPrefix, evidence.reviewedPrefix]) {
    const resolved = run("gh", ["api", `repos/${repositorySlug}/commits/${prefix}`, "--jq", ".sha"]);
    const resolvedSha = String(resolved?.stdout || "").trim();
    if (resolved?.status !== 0 || resolved?.error || !fullSha.test(resolvedSha)
      || resolvedSha !== headSha) return blocked("hosted_codex_review_commit_resolution_mismatch");
  }
  return { status: "completed_no_findings", reviewedHead: headSha, prNumber: Number(prNumber),
    summaryCommentId: evidence.summaryCommentId, completionCommentId: evidence.completionCommentId,
    completedAt: evidence.completedAt, latestBaseChangeAt: Number.isFinite(latestBaseChange)
      ? new Date(latestBaseChange).toISOString() : null, source: "github_codex_bot_comments" };
}

export function evaluateHostedCodexReview({ comments = [], reviews = [], headSha } = {}) {
  if (!fullSha.test(headSha || "") || !Array.isArray(comments) || !Array.isArray(reviews)) {
    return blocked("hosted_codex_review_identity_missing");
  }
  const botComments = comments.filter(isBotRecord);
  const summaries = botComments.filter((item) => String(item.body || "").startsWith(summaryMarker));
  if (summaries.length === 0) return { status: "pending", reason: "hosted_codex_review_summary_missing" };
  const summary = summaries.sort((a, b) => Date.parse(b.updated_at || "") - Date.parse(a.updated_at || ""))[0];
  const summaryRow = String(summary.body || "").split(/\r?\n/).find((line) => /^\| 📝 \*\*Code Review\*\* \|/.test(line));
  if (!summaryRow) return blocked("hosted_codex_review_summary_malformed");
  if (/\| 🔄 \*\*Running\*\*/.test(summaryRow)) return { status: "pending", reason: "hosted_codex_review_running" };
  const summaryMatch = summaryRow.match(/\| ✅ \*\*Completed\*\*[^|]*\| `([a-f0-9]{7,40})` \|/);
  if (!summaryMatch || !headSha.startsWith(summaryMatch[1])) return blocked("hosted_codex_review_summary_not_exact_head");
  if (!isFindingFreeSummary(summary.body, summaryMatch[1])) {
    return blocked("hosted_codex_review_summary_content_unverified");
  }
  const otherComments = botComments.filter((item) => item.id !== summary.id)
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || "") || Number(b.id) - Number(a.id));
  const completion = otherComments[0];
  const completionProof = parseNoFindingsCompletion(completion?.body);
  if (!completionProof || !headSha.startsWith(completionProof.reviewedPrefix)) {
    return blocked("hosted_codex_review_no_exact_head_completion");
  }
  if (otherComments.slice(1).some((item) => {
    const body = String(item.body || "");
    const reviewed = body.match(/\*\*Reviewed commit:\*\* `([a-f0-9]{7,40})`/);
    if (reviewed) return headSha.startsWith(reviewed[1]) && !parseNoFindingsCompletion(body);
    // Without a commit marker, an extra bot comment cannot be proven stale.
    return true;
  })) return blocked("hosted_codex_review_current_head_comment_findings");
  if (!Number.isFinite(Date.parse(completion.created_at || ""))
    || !Number.isFinite(Date.parse(summary.updated_at || ""))
    || Date.parse(summary.updated_at) < Date.parse(completion.created_at)) {
    return blocked("hosted_codex_review_completion_time_mismatch");
  }
  if (reviews.some((review) => isBotRecord(review, true) && !/^[a-f0-9]{7,40}$/.test(review.commit_id || ""))) {
    return blocked("hosted_codex_review_review_commit_unreadable");
  }
  if (reviews.some((review) => isBotRecord(review, true) && reviewMatchesHead(review, headSha)
    && (!['APPROVED', 'COMMENTED'].includes(review.state)
      || String(review.body || "").trim() || review.inlineCommentCount !== 0))) {
    return blocked("hosted_codex_review_current_head_findings");
  }
  return { status: "completed_no_findings", summaryPrefix: summaryMatch[1], reviewedPrefix: completionProof.reviewedPrefix,
    summaryCommentId: summary.id, completionCommentId: completion.id, completedAt: completion.created_at };
}

function readBotRecords(run, endpoint, query, allowNullBody = false) {
  const result = run("gh", ["api", "--paginate", endpoint, "--jq", query]);
  if (result?.status !== 0 || result?.error) return { ok: false, records: [] };
  try {
    const lines = String(result.stdout || "").split(/\r?\n/).filter(Boolean);
    const records = lines.map((line) => JSON.parse(line)).map((item) =>
      allowNullBody && item?.body === null ? { ...item, body: "" } : item);
    return { ok: records.every((item) => isBotRecord(item, allowNullBody)), records };
  } catch { return { ok: false, records: [] }; }
}

function isBotRecord(value, allowNullBody = false) {
  return value && value.login === codexBotLogin && value.type === "Bot"
    && Number.isSafeInteger(value.id) && value.id > 0
    && (typeof value.body === "string" || (allowNullBody && value.body === null));
}

function reviewMatchesHead(review, headSha) {
  return /^[a-f0-9]{7,40}$/.test(review?.commit_id || "") && headSha.startsWith(review.commit_id);
}

function parseNoFindingsCompletion(body) {
  const content = String(body || "");
  const match = content.match(/^Codex Review: Didn't find any major issues\. (?::\+1:|You're on a roll\.)\s*\n\n\*\*Reviewed commit:\*\* `([a-f0-9]{10,40})`(?:\r?\n|$)/);
  if (!match) return null;
  const footer = content.slice(match[0].length).split(/\r?\n/)
    .map((line) => line.trim()).filter(Boolean).join("\n");
  return footer === completionFooter ? { reviewedPrefix: match[1] } : null;
}

function isFindingFreeSummary(body, reviewedPrefix) {
  const lines = String(body || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const before = summaryLinesBeforeRow;
  const after = summaryLinesAfterRow;
  if (lines.length !== before.length + 1 + after.length
    || !before.every((line, index) => lines[index] === line)
    || !after.every((line, index) => lines[before.length + 1 + index] === line)) return false;
  const row = lines[before.length];
  const match = row.match(/^\| 📝 \*\*Code Review\*\* \| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">\1<\/relative-time> \| `([a-f0-9]{7,40})` \| Manual request \|$/);
  return Boolean(match) && Number.isFinite(Date.parse(match[1])) && match[2] === reviewedPrefix;
}

function blocked(reason) { return { status: "blocked", reason }; }
