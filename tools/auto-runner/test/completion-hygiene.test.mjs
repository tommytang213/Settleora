import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildIssueOperationContext,
  buildLedgerReconciliationProposal,
  cleanupTransientLabels,
  completeMergedIssueHygiene,
  evaluateCloseDecision,
  renderCompletionComment,
  renderParentProgressComment,
} from "../lib/completion-hygiene.mjs";
import { executeAutoMerge } from "../lib/auto-merge-policy.mjs";
import { digestChangedFiles } from "../lib/config.mjs";
import { createSessionLifecycleState, persistSessionLifecycleState } from "../lib/session-lifecycle.mjs";

const headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const baseSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const mergeSha = "cccccccccccccccccccccccccccccccccccccccc";

function logsRoot() {
  return mkdtempSync(path.join(tmpdir(), "settleora-completion-"));
}

function lifecycleFor(config) {
  const state = createSessionLifecycleState({ repository: "tommytang213/Settleora", issueNumber: 891, taskKey: "task", runId: "run", claimIdentity: "claim", chargeMarkerRef: "charge", sessionId: "session", branchName: "feature/test", baseSha, headSha, phase: "hygiene", nextExactAction: "complete_hygiene" });
  const persisted = persistSessionLifecycleState(config, state);
  assert.equal(persisted.ok, true);
  return persisted.state;
}

function narrowIssue(overrides = {}) {
  return {
    number: 891,
    title: "Narrow runnable generated work",
    state: "OPEN",
    labels: ["area:infra", "type:feature", "workflow", "auto-ready", "auto-claimed", "auto-running"],
    body: "Close rule: close after merged PR proves automatic issue derivation/creation.",
    comments: [],
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    issue: narrowIssue(),
    parentIssue: 800,
    pr: { number: 100, url: "https://github.com/tommytang213/Settleora/pull/100", headRefOid: headSha, baseRefName: "main" },
    sourceHeadSha: headSha,
    expectedHeadSha: headSha,
    mergeSha,
    validation: { passed: true },
    externalReview: { status: "pass" },
    review: { verdict: { verdict: "approve" } },
    ciSecurityResult: "passed",
    currentMainResult: "passed",
    closeRuleSatisfied: true,
    completedChildren: [891],
    remainingChildren: [893, 894],
    futureGates: [902],
    generatedFollowups: [{ number: 1001 }],
    ...overrides,
  };
}

function runnerWith(fixtures = {}) {
  const calls = [];
  const runner = (command, args) => {
    calls.push({ command, args });
    const key = `${command} ${args.slice(0, 2).join(" ")}`;
    if (fixtures[key]) return typeof fixtures[key] === "function" ? fixtures[key](command, args, calls) : fixtures[key];
    if (command === "gh" && args[0] === "issue" && args[1] === "view") {
      const number = Number(args[2]);
      const issue = number === 800 ? fixtures.parentIssue || { number: 800, title: "Umbrella", state: "OPEN", labels: [], body: "", comments: [] } : fixtures.issue || narrowIssue();
      return { status: 0, stdout: JSON.stringify(issue) };
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "view") {
      const pr = typeof fixtures.pr === "function" ? fixtures.pr() : fixtures.pr;
      return { status: 0, stdout: JSON.stringify(pr || { number: 100, url: "https://github.com/tommytang213/Settleora/pull/100", headRefOid: headSha, mergeCommit: { oid: mergeSha } }) };
    }
    return { status: 0, stdout: "" };
  };
  runner.calls = calls;
  return runner;
}

test("successful merge closes one narrow complete issue", () => {
  const runner = runnerWith({ "git rev-parse origin/main": { status: 0, stdout: baseSha } });
  const result = completeMergedIssueHygiene({ logsRoot: logsRoot() }, context(), { runner });
  assert.equal(result.status, "merged");
  assert.equal(result.closeDecision.close, true);
  assert.equal(result.closure.status, "updated");
  assert.ok(runner.calls.some((call) => call.args[0] === "issue" && call.args[1] === "close"));
});

test("ambiguous umbrella remains open and #800 stays open before final acceptance", () => {
  const umbrella = narrowIssue({ number: 800, title: "DevBox auto-runner foundation tracker", body: "Keep #800 open until #894 final acceptance. Close rule: final acceptance only." });
  assert.equal(evaluateCloseDecision(umbrella, context({ issue: umbrella })).close, false);
  assert.equal(evaluateCloseDecision(umbrella, context({ issue: umbrella })).reason, "umbrella_or_tracker_keep_open");
});

test("partially complete issue remains open with remaining gates", () => {
  const issue = narrowIssue({ body: "Close rule: close after all slices. Remaining gates: final acceptance." });
  const decision = evaluateCloseDecision(issue, context({ issue, remainingGates: ["final acceptance"] }));
  assert.equal(decision.close, false);
  assert.equal(decision.reason, "remaining_gates_present");
});

test("merge success remains merged when closure/comment/label/project/ledger hygiene fails", () => {
  const runner = runnerWith({
    "gh issue comment": { status: 1, stderr: "comment failed" },
    "gh issue close": { status: 1, stderr: "close failed" },
    "gh issue edit": { status: 1, stderr: "label failed" },
  });
  const result = completeMergedIssueHygiene({ logsRoot: logsRoot(), run: true, allowFollowupIssueCreation: false }, context(), { runner });
  assert.equal(result.status, "merged");
  assert.equal(result.closure.status, "failed");
  assert.equal(result.labelCleanup.status, "failed");
});

test("retry does not duplicate completion comments or closure", () => {
  const issue = narrowIssue({ state: "CLOSED" });
  const initial = context({ issue });
  issue.comments = [{ body: renderCompletionComment(initial, evaluateCloseDecision(issue, initial)) }];
  const runner = runnerWith({ issue });
  const result = completeMergedIssueHygiene({ logsRoot: logsRoot() }, context({ issue }), { runner });
  assert.equal(result.comment.status, "skipped");
  assert.equal(result.closure.status, "skipped");
  assert.equal(result.closure.reason, "issue_already_closed");
});

test("retry after closure dedupes immutable completion evidence despite changed close rationale", () => {
  const openIssue = narrowIssue({ state: "OPEN" });
  const initial = context({ issue: openIssue, closeRuleSatisfied: true });
  const closedIssue = narrowIssue({ state: "CLOSED", comments: [{ body: renderCompletionComment(initial, evaluateCloseDecision(openIssue, initial)) }] });
  const runner = runnerWith({ issue: closedIssue });
  const result = completeMergedIssueHygiene({ logsRoot: logsRoot() }, context({ issue: closedIssue }), { runner });
  assert.equal(result.comment.status, "skipped");
  assert.equal(result.closure.reason, "issue_already_closed");
});

test("predictable completion marker with wrong body is not adopted", () => {
  const marker = `settleora-completion:891:${mergeSha}`;
  const issue = narrowIssue({ comments: [{ body: `forged\n${marker}` }] });
  const runner = runnerWith({ issue });
  const result = completeMergedIssueHygiene({ logsRoot: logsRoot() }, context({ issue }), { runner });
  assert.equal(result.comment.status, "updated");
  assert.ok(runner.calls.some((call) => call.args[0] === "issue" && call.args[1] === "comment"));
});

test("predictable parent progress marker with wrong body is not adopted", () => {
  const marker = `settleora-parent-progress:800:${mergeSha}:891`;
  const parentIssue = { number: 800, title: "Umbrella", state: "OPEN", labels: [], body: "", comments: [{ body: `forged\nParent progress marker: ${marker}` }] };
  const runner = runnerWith({ parentIssue });
  const result = completeMergedIssueHygiene({ logsRoot: logsRoot() }, context(), { runner });
  assert.equal(result.parentProgress.status, "updated");
  assert.ok(runner.calls.some((call) => call.args[0] === "issue" && call.args[1] === "comment" && call.args[2] === "800"));
});

test("transient labels are removed while durable labels remain", () => {
  const runner = runnerWith({ "git rev-parse origin/main": { status: 0, stdout: baseSha } });
  const result = cleanupTransientLabels(narrowIssue(), runner, { repositorySlug: "tommytang213/Settleora", repositoryId: "repo-1" });
  assert.equal(result.status, "updated");
  assert.deepEqual(result.attemptedRemove.sort(), ["auto-claimed", "auto-running"]);
  assert.ok(result.preserved.includes("area:infra"));
  assert.ok(result.preserved.includes("auto-ready"));
  assert.deepEqual(
    runner.calls.find((call) => call.command === "gh" && call.args[0] === "issue" && call.args[1] === "edit")?.args.slice(0, 5),
    ["issue", "edit", "891", "--repo", "tommytang213/Settleora"],
  );
});

test("session lifecycle label cleanup persists intent and confirms live absence", () => {
  let labels = narrowIssue().labels;
  const runner = (command, args) => {
    if (command === "gh" && args[0] === "issue" && args[1] === "view") return { status: 0, stdout: JSON.stringify({ number: 891, labels }) };
    if (command === "gh" && args[0] === "issue" && args[1] === "edit") {
      const removed = args[args.indexOf("--remove-label") + 1].split(",");
      labels = labels.filter((label) => !removed.includes(label));
      return { status: 0, stdout: "" };
    }
    return { status: 0, stdout: "" };
  };
  const config = { logsRoot: logsRoot(), repositorySlug: "tommytang213/Settleora" };
  const sessionLifecycle = lifecycleFor(config);
  const result = cleanupTransientLabels(narrowIssue(), runner, { repositorySlug: "tommytang213/Settleora", repositoryId: "repo-1" }, config, { sessionLifecycle, sourceHeadSha: headSha, mergeSha });
  assert.equal(result.status, "updated");
  assert.equal(result.canonicalEffect.status, "finalized");
  assert.equal(labels.includes("auto-claimed"), false);
});

test("parent progress shows completed, remaining, blockers, future, manual, and keep-open rationale", () => {
  const body = renderParentProgressComment({
    issue: { number: 892 },
    parentIssue: 800,
    mergeSha,
    completedChildren: [890, 891, 892],
    remainingChildren: [893, 894],
    blockers: ["none"],
    futureGates: [902],
    manualDecisions: ["manual merge gate"],
    generatedFollowups: [{ number: 1001 }],
  });
  assert.match(body, /Completed children: #890, #891, #892/);
  assert.match(body, /Remaining children: #893, #894/);
  assert.match(body, /Future gates: #902/);
  assert.match(body, /Manual decisions: manual merge gate/);
  assert.match(body, /#800 remains open until #894 final acceptance/);
});

test("exact PR/head/merge/validation/review/CI evidence is included", () => {
  const body = renderCompletionComment(context());
  assert.match(body, /PR: https:\/\/github.com\/tommytang213\/Settleora\/pull\/100/);
  assert.match(body, new RegExp(headSha));
  assert.match(body, new RegExp(mergeSha));
  assert.match(body, /Validation: passed/);
  assert.match(body, /External review: pass/);
  assert.match(body, /Exact-head CI\/security: passed/);
});

test("ledger reconciliation creates or reuses one docs-planning work item and avoids recursion", () => {
  const proposal = buildLedgerReconciliationProposal(context());
  assert.equal(proposal.ok, true);
  assert.equal(proposal.proposal.kind, "ledger_reconciliation");
  assert.equal(proposal.proposal.autoRunnerContract.lane, "docs-planning");
  const recursive = buildLedgerReconciliationProposal(context({ issue: { ...narrowIssue(), proposalKind: "ledger_reconciliation" } }));
  assert.equal(recursive.skipped, true);
});

test("project fields are updated only with a tested supported mapping", () => {
  const unsupported = completeMergedIssueHygiene({ logsRoot: logsRoot() }, context(), { runner: runnerWith() });
  assert.equal(unsupported.project.status, "not_updated");
  const runner = runnerWith({ "git rev-parse origin/main": { status: 0, stdout: baseSha } });
  const supported = completeMergedIssueHygiene(
    { logsRoot: logsRoot(), projectStatusUpdates: { supported: true, projectId: "PVT", fieldId: "FIELD", doneOptionId: "DONE" } },
    context(),
    { runner },
  );
  assert.equal(supported.project.status, "updated");
  assert.ok(runner.calls.some((call) => call.args[0] === "project" && call.args[1] === "item-edit"));
});

test("source branch is never deleted by completion hygiene", () => {
  const result = completeMergedIssueHygiene({ logsRoot: logsRoot() }, context(), { runner: runnerWith() });
  assert.equal(result.sourceBranchDeleted, false);
});

test("historical summaries/status/events remain readable and sanitized in comments", () => {
  const body = renderCompletionComment(context({ generatedFollowups: [{ number: 1001, rawPayload: "GEMINI_API_KEY=secret" }] }));
  assert.doesNotMatch(body, /GEMINI_API_KEY|secret/i);
  assert.match(body, /#1001/);
});

test("ordinary merge path invokes the completion pipeline safely", () => {
  const repositorySlug = "tommytang213/Settleora";
  const mergeConfig = { repositorySlug, allowAutoMerge: true, autoMergePolicy: { approvedLanes: ["workflow-docs-tooling"], requiredChecks: ["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"] }, repoRoot: "/workspace/repos/Settleora", logsRoot: logsRoot(), run: true, allowFollowupIssueCreation: false, githubHost: "github.com" };
  const sessionLifecycle = lifecycleFor(mergeConfig);
  const changedFiles = ["tools/auto-runner/lib/example.mjs"];
  const digest = digestChangedFiles(changedFiles);
  const contextBase = {
    config: {
      repositorySlug,
      allowAutoMerge: true,
      autoMergePolicy: { approvedLanes: ["workflow-docs-tooling"], requiredChecks: ["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"] },
    },
    sessionLifecycle,
    issue: narrowIssue({ labels: ["area:infra", "workflow", "auto-ready"] }),
    laneDecision: {
      lane: "workflow-docs-tooling",
      canonicalLane: "workflow-docs-tooling",
      allowedToImplement: true,
      autoMergeEligible: true,
      manualMergeRequired: false,
      branchStrategy: "normal",
      reviewerTier: "cheap_independent",
      validationProfile: "runner-tests",
      allowedPaths: ["tools/auto-runner/**"],
      laneManifest: { decisionType: "runnable", autoMergeAllowed: true },
      contract: { autoMergeEligible: true, manualMergeRequired: false },
    },
    changedFiles,
    forbiddenChangedFiles: [],
    changedFilesExactlyMatchAllowedPaths: true,
    externalReviewRequired: true,
    externalReview: { status: "pass", tier: "cheap_independent", reviewedHead: headSha, changedFiles, changedFilesDigest: digest, provider: "gemini", independent: true, completedAt: "2026-07-13T08:00:00Z" },
    review: { verdict: { verdict: "approve" }, reviewedHead: headSha, changedFiles, changedFilesDigest: digest, completedAt: "2026-07-13T08:00:00Z" },
    validation: { passed: true, results: [{ command: "test", status: 0 }], completedAt: "2026-07-13T08:00:00Z", headSha, baseSha, changedFiles, changedFilesDigest: digest, profile: "runner-tests" },
    worktreeClean: true,
    branchName: "feature/auto-891-example",
    runnerCreatedCommitSha: headSha,
    expectedHeadSha: headSha,
    expectedOriginMainSha: baseSha,
    currentOriginMainSha: baseSha,
    pr: {
      number: 100,
      url: "https://github.com/tommytang213/Settleora/pull/100",
      state: "OPEN",
      isDraft: false,
      baseRefName: "main",
      headRefName: "feature/auto-891-example",
      headRefOid: headSha,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      title: "Fix #891",
      body: "Closes #891",
      headRepository: { id: "repo-1", name: "Settleora", nameWithOwner: repositorySlug },
      headRepositoryOwner: { login: "tommytang213" },
      isCrossRepository: false,
    },
    requiredChecks: ["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"].map((name) => ({ name, status: "COMPLETED", conclusion: "SUCCESS" })),
    reviewThreads: [],
    codeScanningAlerts: [],
    blockingMarkers: [],
  };
  let merged = false;
  const mergedPr = {
    number: 100,
    state: "MERGED",
    baseRefName: "main",
    headRefOid: headSha,
    mergeCommit: { oid: mergeSha },
    mergedAt: "2026-07-13T08:01:00Z",
    headRepository: { id: "repo-1", name: "Settleora", nameWithOwner: repositorySlug },
    headRepositoryOwner: { login: "tommytang213" },
    isCrossRepository: false,
  };
  const runner = runnerWith({
    "git rev-parse origin/main": { status: 0, stdout: baseSha },
    "git ls-remote --heads": { status: 0, stdout: `${headSha}\trefs/heads/feature/auto-891-example\n` },
    "gh pr merge": () => { merged = true; return { status: 0, stdout: "" }; },
    [`gh api repos/${repositorySlug}/git/commits/${mergeSha}`]: { status: 0, stdout: JSON.stringify({ parents: [{ sha: baseSha }, { sha: headSha }] }) },
    pr: () => merged ? mergedPr : contextBase.pr,
  });
  const result = executeAutoMerge(
    mergeConfig,
    contextBase,
    { runner, inspectState: () => ({}) },
  );
  assert.equal(result.result, "merged", JSON.stringify({ reason: result.reason, result }, null, 2));
  assert.equal(result.mergeReadback.configuredRepositorySlug, repositorySlug);
  assert.equal(result.mergeReadback.prNumber, 100);
  assert.equal(result.mergeReadback.state, "MERGED");
  assert.equal(result.mergeReadback.baseRefName, "main");
  assert.equal(result.mergeReadback.sourceHeadSha, headSha);
  assert.equal(result.mergeReadback.mergeSha, mergeSha);
  assert.equal(result.mergeReadback.mergedAt, "2026-07-13T08:01:00Z");
  assert.equal(result.mergeReadback.headRepositorySlug, repositorySlug);
  assert.equal(result.mergeReadback.headRepositoryId, "repo-1");
  assert.equal(result.mergeReadback.isCrossRepository, false);
  assert.equal(result.completionHygiene.status, "merged");
  assert.equal(runner.calls.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge").length, 1);
  assert.equal(
    runner.calls.filter(
      (call) =>
        call.command === "gh" &&
        call.args[0] === "pr" &&
        call.args[1] === "view" &&
        call.args.includes("number,state,baseRefName,headRefOid,mergeCommit,mergedAt,headRepository,headRepositoryOwner,isCrossRepository"),
    ).length,
    1,
  );
  assert.equal(runner.calls.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "comment").length, 1);
  assert.equal(runner.calls.filter((call) => call.command === "gh" && call.args[0] === "issue" && call.args[1] === "comment").length, 2);
  assert.equal(runner.calls.filter((call) => call.command === "gh" && call.args[0] === "issue" && call.args[1] === "close").length, 1);
  assert.deepEqual(
    runner.calls.find((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge")?.args,
    ["pr", "merge", "100", "--repo", repositorySlug, "--merge", "--match-head-commit", headSha],
  );
  assert.deepEqual(
    runner.calls.find((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "view" && call.args.includes("number,state,baseRefName,headRefOid,mergeCommit,mergedAt,headRepository,headRepositoryOwner,isCrossRepository"))?.args,
    ["pr", "view", "100", "--repo", repositorySlug, "--json", "number,state,baseRefName,headRefOid,mergeCommit,mergedAt,headRepository,headRepositoryOwner,isCrossRepository"],
  );
  assert.deepEqual(
    runner.calls.find((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "comment")?.args.slice(0, 5),
    ["pr", "comment", "100", "--repo", repositorySlug],
  );
  for (const call of runner.calls.filter((entry) => entry.command === "gh" && (entry.args[0] === "issue" || entry.args[0] === "pr"))) {
    assert.equal(call.args.includes("--repo"), true, `${call.command} ${call.args.join(" ")}`);
    assert.equal(call.args[call.args.indexOf("--repo") + 1], repositorySlug, `${call.command} ${call.args.join(" ")}`);
  }
  const recovered = executeAutoMerge(
    mergeConfig,
    { ...contextBase, pr: { ...contextBase.pr, state: "MERGED" } },
    { runner, inspectState: () => ({}) },
  );
  assert.equal(recovered.result, "merged", JSON.stringify({ reason: recovered.reason, recovered }, null, 2));
  assert.equal(recovered.completionHygiene.status, "merged");
  assert.equal(runner.calls.filter((call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge").length, 1);
});

test("feature-bundle context can use the same completion pipeline", () => {
  const result = completeMergedIssueHygiene({ logsRoot: logsRoot() }, context({ bundle: { id: "issue-892-bundle-v1" } }), { runner: runnerWith() });
  assert.equal(result.status, "merged");
  assert.equal(result.closeDecision.close, true);
});

test("session lifecycle completion defers project work and durably processes ledger reconciliation", () => {
  const config = { logsRoot: logsRoot(), repositorySlug: "tommytang213/Settleora", allowFollowupIssueCreation: false, projectStatusUpdates: { supported: true, projectId: "PVT_1", fieldId: "PVTF_1", doneOptionId: "done" } };
  const sessionLifecycle = lifecycleFor(config);
  const baseContext = context({ parentIssue: null, remainingGates: ["post-merge acceptance"], sessionLifecycle });
  const closeDecision = evaluateCloseDecision(baseContext.issue, baseContext);
  const completionBody = renderCompletionComment(baseContext, closeDecision);
  const lifecycleContext = {
    ...baseContext,
    issue: { ...baseContext.issue, labels: ["area:infra"], comments: [{ body: completionBody }] },
  };
  const lifecycleRunner = runnerWith({ issue: lifecycleContext.issue });
  const result = completeMergedIssueHygiene(
    config,
    lifecycleContext,
    { runner: lifecycleRunner },
  );
  assert.equal(result.status, "merged");
  assert.equal(result.project.status, "skipped");
  assert.equal(result.project.skipped, true);
  assert.equal(result.project.reason, "canonical_project_hygiene_deferred");
  assert.equal(result.ledger.status, "preview");
  assert.equal(result.ledger.reason, "followup_issue_creation_disabled");
  assert.equal(result.ledger.proposal.correlationKey.includes("ledger"), true);
  assert.equal(lifecycleRunner.calls.some((call) => call.args[0] === "issue" && call.args[1] === "comment" && call.args[2] === "891"), false);
});

test("completion hygiene requires a repository context before issue commands", () => {
  const calls = [];
  const runner = (command, args) => {
    calls.push({ command, args });
    return { status: 0, stdout: "" };
  };
  const result = completeMergedIssueHygiene(
    { logsRoot: logsRoot() },
    context({ pr: { number: 100, url: "https://example.invalid/pull/100", headRefOid: headSha } }),
    { runner },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "repository_slug_required");
  assert.deepEqual(calls, []);
});

test("completion hygiene rejects malformed and mismatched repository context before mutation", () => {
  assert.equal(
    buildIssueOperationContext(
      { repositorySlug: "tommytang213/Settleora" },
      context({ repositoryContext: { configuredRepositorySlug: "other-owner/OtherRepo" } }),
    ).reason,
    "repository_configuredRepositorySlug_mismatch",
  );
  assert.equal(
    buildIssueOperationContext(
      { repositorySlug: "https://github.com/tommytang213/Settleora" },
      context(),
    ).reason,
    "repository_slug_required",
  );
  assert.equal(
    buildIssueOperationContext(
      { repositorySlug: "tommytang213/Settleora", githubHost: "github.enterprise.invalid" },
      context(),
    ).reason,
    "unsupported_github_host",
  );
});

test("completion hygiene uses non-default repository for reads, comments, labels, close, and dedupe", () => {
  const repositorySlug = "octo-org/NonDefault";
  const calls = [];
  const runner = (command, args) => {
    calls.push({ command, args });
    if (command === "gh" && args[0] === "issue" && args[1] === "view") {
      const repo = args[args.indexOf("--repo") + 1];
      const number = Number(args[2]);
      if (repo !== repositorySlug) {
        return { status: 0, stdout: JSON.stringify({ number, title: "Wrong repo", state: "CLOSED", labels: [], comments: [{ body: `settleora-completion:891:${mergeSha}` }] }) };
      }
      return { status: 0, stdout: JSON.stringify(number === 800 ? { number, title: "Umbrella", state: "OPEN", labels: [], body: "", comments: [] } : narrowIssue()) };
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "view") {
      return { status: 0, stdout: JSON.stringify({ number: 100, url: `https://github.com/${repositorySlug}/pull/100`, headRefOid: headSha, mergeCommit: { oid: mergeSha } }) };
    }
    return { status: 0, stdout: "" };
  };
  const result = completeMergedIssueHygiene(
    { logsRoot: logsRoot(), repositorySlug },
    context({ pr: { number: 100, url: `https://github.com/${repositorySlug}/pull/100`, headRefOid: headSha } }),
    { runner },
  );
  assert.equal(result.status, "merged");
  assert.equal(result.comment.status, "updated");
  for (const call of calls.filter((entry) => entry.command === "gh" && (entry.args[0] === "issue" || entry.args[0] === "pr"))) {
    assert.equal(call.args.includes("--repo"), true, `${call.command} ${call.args.join(" ")}`);
    assert.equal(call.args[call.args.indexOf("--repo") + 1], repositorySlug, `${call.command} ${call.args.join(" ")}`);
  }
});
