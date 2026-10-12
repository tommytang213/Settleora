import assert from "node:assert/strict";
import test from "node:test";
import { evaluateHostedCodexReview, inspectHostedCodexReview } from "../lib/hosted-codex-review-evidence.mjs";
import { inspectAutoMergeGithubState } from "../lib/auto-merge-policy.mjs";

const head = "893a7f46d75d4c216dff36f7fa6008e43e7ad4ee";
const staleHead = "b8222a7adf8be0a7efab54df655fe8067585fdf5";
const bot = { login: "chatgpt-codex-connector[bot]", type: "Bot" };
const summary = { ...bot, id: 1, created_at: "2026-10-11T22:47:59Z", updated_at: "2026-10-11T23:46:21Z",
  body: '<!-- codex-pull-request-review-summary -->\n\n| Review | Status | Commit | Review trigger |\n| --- | --- | --- | --- |\n| 📝 **Code Review** | ✅ **Completed** | `893a7f4` | Manual request |' };
const footer = `<details> <summary>ℹ️ About Codex in GitHub</summary>
<br/>

[Your team has set up Codex to review pull requests in this repo](https://chatgpt.com/codex/cloud/settings/general). Reviews are triggered when you
- Open a pull request for review
- Mark a draft as ready
- Comment "@codex review".

If Codex has suggestions, it will comment; otherwise it will react with 👍.

Codex can also answer questions or update the PR. Try commenting "@codex address that feedback".
</details>`;
const completion = { ...bot, id: 2, created_at: "2026-10-11T23:46:19Z", updated_at: "2026-10-11T23:46:19Z",
  body: `Codex Review: Didn't find any major issues. :+1:\n\n**Reviewed commit:** \`893a7f46d7\`\n\n${footer}` };

test("hosted Codex completion binds bot summary and no-findings artifact to one head", () => {
  assert.deepEqual(evaluateHostedCodexReview({ comments: [summary, completion], reviews: [], headSha: head }), {
    status: "completed_no_findings", reviewedPrefix: "893a7f46d7", summaryCommentId: 1,
    completionCommentId: 2, completedAt: completion.created_at,
  });
});

test("hosted Codex evidence fails closed on running, stale, quota, spoofed, and finding states", () => {
  const evaluate = (comments, reviews = []) => evaluateHostedCodexReview({ comments, reviews, headSha: head });
  assert.equal(evaluate([]).status, "pending");
  assert.equal(evaluate([{ ...summary, body: summary.body.replace("✅ **Completed**", "🔄 **Running**") }, completion]).status, "pending");
  assert.equal(evaluate([{ ...summary, body: summary.body.replace("893a7f4", staleHead.slice(0, 7)) }, completion]).status, "blocked");
  assert.equal(evaluate([summary, { ...completion, body: "Codex quota reached; review not run." }]).status, "blocked");
  assert.equal(evaluate([summary, { ...completion, login: "tommytang213", type: "User" }]).status, "blocked");
  assert.equal(evaluate([summary, { ...completion, body: completion.body.replace("893a7f46d7", staleHead.slice(0, 10)) }]).status, "blocked");
  assert.equal(evaluate([summary, { ...completion, body: completion.body.replace(":+1:", "You're on a roll.") }]).status,
    "completed_no_findings");
  assert.equal(evaluate([summary, { ...completion, body: `${completion.body}\nFinding: regression` }]).status, "blocked");
  assert.equal(evaluate([summary, completion, { ...completion, id: 3, created_at: "2026-10-11T23:47:00Z", body: "Codex quota reached" }]).status, "blocked");
  assert.equal(evaluate([summary, completion], [{ ...bot, id: 4, body: "finding", commit_id: head }]).reason,
    "hosted_codex_review_current_head_findings");
  assert.equal(evaluate([summary, completion], [{ ...bot, id: 4, body: "old finding", commit_id: staleHead }]).status,
    "completed_no_findings");
  assert.equal(evaluate([summary, completion], [{ ...bot, id: 4, body: "", state: "COMMENTED",
    commit_id: head, inlineCommentCount: 0 }]).status, "completed_no_findings");
  assert.equal(evaluate([summary, completion], [{ ...bot, id: 4, body: "", state: "APPROVED",
    commit_id: head, inlineCommentCount: 1 }]).status, "blocked");
  assert.equal(evaluate([summary, completion], [{ ...bot, id: 4, body: null, state: "COMMENTED",
    commit_id: head, inlineCommentCount: 0 }]).status, "completed_no_findings");
  assert.equal(evaluate([summary, completion], [{ ...bot, id: 4, body: "", state: "COMMENTED",
    commit_id: head.slice(0, 10), inlineCommentCount: 1 }]).reason, "hosted_codex_review_current_head_findings");
  assert.equal(evaluate([summary, completion, { ...bot, id: 5, created_at: "2026-10-11T23:45:00Z",
    body: `Codex Review: Found a bug.\n\n**Reviewed commit:** \`${head.slice(0, 10)}\`` }]).reason,
  "hosted_codex_review_current_head_comment_findings");
  assert.equal(evaluate([summary, completion, { ...bot, id: 6, created_at: "2026-10-11T23:44:00Z",
    body: "Found a problem without a commit marker" }]).status, "blocked");
  assert.equal(evaluate([summary, completion, { ...completion, id: 7, created_at: "2026-10-11T23:43:00Z",
    body: `${completion.body}\nFinding: still unresolved` }]).status, "blocked");
});

test("GitHub inspection resolves abbreviated commit and blocks unreadable or mismatched evidence", () => {
  const calls = [];
  const run = (_command, args) => {
    calls.push(args);
    const endpoint = args.find((arg) => String(arg).startsWith("repos/"));
    if (endpoint?.includes("/timeline?")) return { status: 0, stdout: "" };
    if (endpoint?.includes("/issues/")) return { status: 0, stdout: [summary, completion].map(JSON.stringify).join("\n") };
    if (endpoint?.includes("/reviews?")) return { status: 0, stdout: "" };
    if (endpoint?.includes("/commits/")) return { status: 0, stdout: `${head}\n` };
    throw new Error("unexpected GitHub read");
  };
  const input = { repositorySlug: "tommytang213/Settleora", prNumber: 1332, headSha: head };
  assert.equal(inspectHostedCodexReview({ ...input, run }).reviewedHead, head);
  assert.equal(calls.length, 4);
  assert.equal(inspectHostedCodexReview({ ...input, run: (_cmd, args) => args.includes("--paginate")
    ? { status: 1, error: "unavailable" } : { status: 0, stdout: head } }).status, "blocked");
  assert.equal(inspectHostedCodexReview({ ...input, run: (_cmd, args) => {
    const endpoint = args.find((arg) => String(arg).startsWith("repos/"));
    if (endpoint?.includes("/timeline?")) return { status: 0, stdout: "" };
    if (endpoint?.includes("/issues/")) return { status: 0, stdout: [summary, completion].map(JSON.stringify).join("\n") };
    if (endpoint?.includes("/reviews?")) return { status: 0, stdout: "" };
    return { status: 0, stdout: staleHead };
  } }).reason, "hosted_codex_review_commit_resolution_mismatch");
});

test("hosted completion must follow the latest PR base retarget", () => {
  const inspect = (timelineResult) => inspectHostedCodexReview({ repositorySlug: "tommytang213/Settleora",
    prNumber: 1332, headSha: head, run: (_command, args) => {
      const endpoint = args.find((arg) => String(arg).startsWith("repos/"));
      if (endpoint?.includes("/timeline?")) return timelineResult;
      if (endpoint?.includes("/issues/")) return { status: 0, stdout: [summary, completion].map(JSON.stringify).join("\n") };
      if (endpoint?.includes("/reviews?")) return { status: 0, stdout: "" };
      if (endpoint?.includes("/commits/")) return { status: 0, stdout: head };
      throw new Error("unexpected GitHub read");
    } });
  const baseChange = (created_at, event = "base_ref_changed") => ({ id: 11, event, created_at });
  assert.equal(inspect({ status: 0, stdout: JSON.stringify(baseChange("2026-10-11T23:46:20Z")) }).reason,
    "hosted_codex_review_predates_base_change");
  assert.equal(inspect({ status: 0, stdout: JSON.stringify(baseChange(completion.created_at)) }).status, "blocked");
  assert.equal(inspect({ status: 0, stdout: JSON.stringify(baseChange("2026-10-11T23:00:00Z")) }).status,
    "completed_no_findings");
  assert.equal(inspect({ status: 0, stdout: JSON.stringify(baseChange("2026-10-11T23:47:00Z", "automatic_base_change_succeeded")) }).status,
    "blocked");
  assert.equal(inspect({ status: 1, error: "unavailable" }).reason, "hosted_codex_review_base_history_unavailable");
  assert.equal(inspect({ status: 0, stdout: "{}" }).reason, "hosted_codex_review_base_history_unreadable");
});

test("GitHub inspection accepts a null-body empty review and checks its inline comments", () => {
  const inspect = (inline) => inspectHostedCodexReview({ repositorySlug: "tommytang213/Settleora",
    prNumber: 1332, headSha: head, run: (_command, args) => {
      const endpoint = args.find((arg) => String(arg).startsWith("repos/"));
      if (endpoint?.includes("/timeline?")) return { status: 0, stdout: "" };
      if (endpoint?.includes("/issues/")) return { status: 0, stdout: [summary, completion].map(JSON.stringify).join("\n") };
      if (endpoint?.includes("/reviews/") && endpoint?.includes("/comments?")) return { status: 0,
        stdout: inline ? JSON.stringify({ id: 7 }) : "" };
      if (endpoint?.includes("/reviews?")) return { status: 0, stdout: JSON.stringify({ ...bot, id: 4,
        body: null, state: "COMMENTED", commit_id: head.slice(0, 10) }) };
      if (endpoint?.includes("/commits/")) return { status: 0, stdout: head };
      throw new Error("unexpected GitHub read");
    } });
  assert.equal(inspect(false).status, "completed_no_findings");
  assert.equal(inspect(true).reason, "hosted_codex_review_current_head_findings");
});

test("existing auto-merge GitHub inspection reads hosted Codex evidence for Grok", () => {
  const calls = [];
  const runner = (command, args) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (args[0] === "pr") return { status: 0, stdout: JSON.stringify({ number: 1332,
      headRefOid: head, headRefName: "ai/task/review", state: "OPEN", comments: [], reviews: [], statusCheckRollup: [] }) };
    if (args[0] === "issue") return { status: 0, stdout: JSON.stringify({ number: 1332, state: "OPEN" }) };
    if (args.includes("graphql")) return { status: 0, stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }) };
    const endpoint = args.find((arg) => String(arg).startsWith("repos/") || String(arg).startsWith("/repos/"));
    if (endpoint?.includes("/timeline?")) return { status: 0, stdout: "" };
    if (endpoint?.includes("/issues/")) return { status: 0, stdout: [summary, completion].map(JSON.stringify).join("\n") };
    if (endpoint?.includes("/reviews?")) return { status: 0, stdout: "" };
    if (endpoint?.includes("/commits/")) return { status: 0, stdout: head };
    if (endpoint?.includes("/code-scanning/")) return { status: 0, stdout: "[]" };
    throw new Error("unexpected GitHub inspection call");
  };
  const state = inspectAutoMergeGithubState({ repositorySlug: "tommytang213/Settleora", repoRoot: process.cwd(),
    reviewerProviderPin: "grok", dryRun: false }, { issue: { number: 1332 }, prUrlOrNumber: 1332 }, { runner });
  assert.equal(state.hostedCodexReview.reviewedHead, head);
  assert.equal(state.hostedCodexReview.status, "completed_no_findings");
  assert.deepEqual(state.blockingMarkers, []);
  assert.equal(calls.some((call) => call.includes("/pulls/1332/reviews?")), true);
  const persistedProvider = inspectAutoMergeGithubState({ repositorySlug: "tommytang213/Settleora", repoRoot: process.cwd(),
    dryRun: false }, { issue: { number: 1332 }, prUrlOrNumber: 1332, reviewerProvider: "grok" }, { runner });
  assert.equal(persistedProvider.hostedCodexReview.reviewedHead, head);
});
