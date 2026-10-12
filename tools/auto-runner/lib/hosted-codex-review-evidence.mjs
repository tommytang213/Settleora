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

export function inspectHostedCodexReview({ repositorySlug, prNumber, headSha, run }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositorySlug || "")
    || !Number.isSafeInteger(Number(prNumber)) || Number(prNumber) <= 0 || !fullSha.test(headSha || "")
    || typeof run !== "function") return blocked("hosted_codex_review_identity_missing");
  const comments = readBotRecords(run, `repos/${repositorySlug}/issues/${prNumber}/comments?per_page=100`,
    `${botFilter} | {id, login:.user.login, type:.user.type, body, created_at, updated_at}`);
  if (!comments.ok) return blocked("hosted_codex_review_comments_unavailable");
  const reviews = readBotRecords(run, `repos/${repositorySlug}/pulls/${prNumber}/reviews?per_page=100`,
    `${botFilter} | {id, login:.user.login, type:.user.type, state, body, commit_id, submitted_at}`);
  if (!reviews.ok) return blocked("hosted_codex_review_reviews_unavailable");
  for (const review of reviews.records) {
    if (review.commit_id !== headSha || !["APPROVED", "COMMENTED"].includes(review.state)
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
  // GitHub resolves the bot's abbreviated reviewed-commit identifier to the full SHA.
  // Ambiguous or stale prefixes fail closed rather than being treated as exact-head proof.
  const resolved = run("gh", ["api", `repos/${repositorySlug}/commits/${evidence.reviewedPrefix}`, "--jq", ".sha"]);
  const resolvedSha = String(resolved?.stdout || "").trim();
  if (resolved?.status !== 0 || resolved?.error || !fullSha.test(resolvedSha)
    || resolvedSha !== headSha) return blocked("hosted_codex_review_commit_resolution_mismatch");
  return { status: "completed_no_findings", reviewedHead: resolvedSha, prNumber: Number(prNumber),
    summaryCommentId: evidence.summaryCommentId, completionCommentId: evidence.completionCommentId,
    completedAt: evidence.completedAt, source: "github_codex_bot_comments" };
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
  const otherComments = botComments.filter((item) => item.id !== summary.id)
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || "") || Number(b.id) - Number(a.id));
  const completion = otherComments[0];
  const completionMatch = String(completion?.body || "").match(/^Codex Review: Didn't find any major issues\. :\+1:\s*\n\n\*\*Reviewed commit:\*\* `([a-f0-9]{10,40})`(?:\r?\n|$)/);
  if (!completionMatch || !headSha.startsWith(completionMatch[1])) return blocked("hosted_codex_review_no_exact_head_completion");
  const footer = String(completion.body).slice(completionMatch[0].length).split(/\r?\n/)
    .map((line) => line.trim()).filter(Boolean).join("\n");
  if (footer !== completionFooter) return blocked("hosted_codex_review_completion_body_malformed");
  if (!Number.isFinite(Date.parse(completion.created_at || ""))
    || !Number.isFinite(Date.parse(summary.updated_at || ""))
    || Date.parse(summary.updated_at) < Date.parse(completion.created_at)) {
    return blocked("hosted_codex_review_completion_time_mismatch");
  }
  if (reviews.some((review) => isBotRecord(review) && review.commit_id === headSha
    && (!['APPROVED', 'COMMENTED'].includes(review.state)
      || String(review.body || "").trim() || review.inlineCommentCount !== 0))) {
    return blocked("hosted_codex_review_current_head_findings");
  }
  return { status: "completed_no_findings", reviewedPrefix: completionMatch[1],
    summaryCommentId: summary.id, completionCommentId: completion.id, completedAt: completion.created_at };
}

function readBotRecords(run, endpoint, query) {
  const result = run("gh", ["api", "--paginate", endpoint, "--jq", query]);
  if (result?.status !== 0 || result?.error) return { ok: false, records: [] };
  try {
    const lines = String(result.stdout || "").split(/\r?\n/).filter(Boolean);
    const records = lines.map((line) => JSON.parse(line));
    return { ok: records.every(isBotRecord), records };
  } catch { return { ok: false, records: [] }; }
}

function isBotRecord(value) {
  return value && value.login === codexBotLogin && value.type === "Bot"
    && Number.isSafeInteger(value.id) && value.id > 0 && typeof value.body === "string";
}

function blocked(reason) { return { status: "blocked", reason }; }
