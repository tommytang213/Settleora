import { deriveIssueProposals } from "./issue-proposals.mjs";
import { buildIssueOperationContext, executeIssueMutationPipeline } from "./issue-mutation-pipeline.mjs";
import { canonicalGithubEvidenceDigest, executeCanonicalGithubEffectSync } from "./github-effect-consumer.mjs";

export { buildIssueOperationContext };

export const transientRunnerLabels = Object.freeze(["auto-claimed", "auto-running", "auto-pr-opened", "auto-failed"]);

const umbrellaSignals = [
  /\bumbrella\b/i,
  /\bepic\b/i,
  /\btracker\b/i,
  /\bparent\b/i,
  /do not close .*#?800/i,
  /keep #?800 open/i,
  /final acceptance/i,
];

export function completeMergedIssueHygiene(config = {}, context = {}, options = {}) {
  const runner = options.runner || (() => ({ status: 0, stdout: "", stderr: "" }));
  const repositoryContext = buildIssueOperationContext(config, context);
  if (!repositoryContext.ok) {
    return failedCompletionHygiene(context, repositoryContext.reason, repositoryContext);
  }
  const refreshed = refreshCompletionState(context, runner, repositoryContext);
  const closeDecision = evaluateCloseDecision(refreshed.issue, refreshed);
  const completionBody = renderCompletionComment(refreshed, closeDecision);
  const duplicateComment = hasCompletionComment(refreshed.issue, refreshed, completionBody);
  const comment = duplicateComment
    ? { status: "skipped", reason: "completion_comment_already_present" }
    : refreshed.sessionLifecycle
      ? canonicalCommentComponent(config, refreshed, runner, repositoryContext, refreshed.issue.number, completionBody, "issue_progress_comment")
      : commandComponent(runner("gh", ["issue", "comment", String(refreshed.issue.number), "--repo", repositoryContext.repositorySlug, "--body", completionBody]));
  const closure =
    closeDecision.close === true
      ? refreshed.sessionLifecycle
        ? canonicalClosureComponent(config, refreshed, runner, repositoryContext)
        : commandComponent(runner("gh", ["issue", "close", String(refreshed.issue.number), "--repo", repositoryContext.repositorySlug, "--reason", "completed"]))
      : { status: "skipped", reason: closeDecision.reason };
  const labelCleanup = cleanupTransientLabels(refreshed.issue, runner, repositoryContext, config, refreshed);
  const parentProgress = postParentProgress(config, refreshed, runner, repositoryContext);
  const project = updateProjectStatusIfSupported(config, refreshed, runner);
  const ledger = reconcileLedger(config, refreshed, runner, repositoryContext);
  return {
    status: "merged",
    repositoryContext,
    mergeSha: refreshed.mergeSha,
    sourceHeadSha: refreshed.sourceHeadSha,
    issue: issueSummary(refreshed.issue),
    closeDecision,
    closure,
    comment,
    labelCleanup,
    parentProgress,
    project,
    ledger,
    generatedFollowups: refreshed.generatedFollowups || [],
    sourceBranchDeleted: false,
  };
}

export function evaluateCloseDecision(issue = {}, context = {}) {
  if (!issue?.number) return { close: false, reason: "issue_missing" };
  if (String(issue.state || "").toUpperCase() === "CLOSED") return { close: false, reason: "issue_already_closed" };
  if (hasRemainingGates(issue, context)) return { close: false, reason: "remaining_gates_present" };
  if (isUmbrellaIssue(issue)) return { close: false, reason: "umbrella_or_tracker_keep_open" };
  if (!explicitCloseRuleSatisfied(issue, context)) return { close: false, reason: "close_rule_not_satisfied" };
  return { close: true, reason: "explicit_close_rule_satisfied" };
}

export function cleanupTransientLabels(issue = {}, runner = () => ({ status: 0 }), repositoryContext = null, config = {}, context = {}) {
  if (!repositoryContext?.repositorySlug) {
    return { status: "failed", reason: "repository_context_required", removed: [], attemptedRemove: [], preserved: labelNames(issue.labels) };
  }
  const labels = labelNames(issue.labels);
  const remove = labels.filter((label) => transientRunnerLabels.includes(label));
  const preserve = labels.filter((label) => !transientRunnerLabels.includes(label));
  if (remove.length === 0) return { status: "skipped", reason: "no_transient_labels", removed: [], preserved: preserve };
  if (context.sessionLifecycle) {
    const effect = { issueNumber: issue.number, removeLabels: [...remove].sort(), repository: repositoryContext.repositorySlug };
    const canonical = executeCanonicalGithubEffectSync(config, context.sessionLifecycle, { effectType: "hygiene_component", issueNumber: issue.number, headSha: context.sourceHeadSha, baseSha: context.mergeSha, effect }, {
      readLive: (intent) => {
        const live = runner("gh", ["issue", "view", String(issue.number), "--repo", repositoryContext.repositorySlug, "--json", "number,labels"], { cwd: config.repoRoot });
        if (live.error || live.status !== 0) return { complete: false };
        let value; try { value = JSON.parse(live.stdout || "{}"); } catch { return { complete: false }; }
        if (value.number !== issue.number) return { complete: true, ambiguous: true };
        const remaining = labelNames(value.labels).filter((label) => remove.includes(label));
        return remaining.length === 0 ? { complete: true, present: true, identity: intent.identity, effect } : { complete: true, present: false };
      },
      execute: () => {
        const mutation = runner("gh", ["issue", "edit", String(issue.number), "--repo", repositoryContext.repositorySlug, "--remove-label", remove.join(",")]);
        if (mutation.error || mutation.status !== 0) throw new Error("Canonical label cleanup did not confirm success");
        return { ok: true, status: mutation.status };
      },
    });
    return { status: canonical.ok ? "updated" : "failed", ...(canonical.ok ? {} : { reason: canonical.reasonCode }), canonicalEffect: canonical, removed: canonical.ok ? remove : [], attemptedRemove: remove, preserved: preserve, repositorySlug: repositoryContext.repositorySlug, repositoryId: repositoryContext.repositoryId || null, operation: "label_remove", completedAt: new Date().toISOString() };
  }
  const result = runner("gh", ["issue", "edit", String(issue.number), "--repo", repositoryContext.repositorySlug, "--remove-label", remove.join(",")]);
  return {
    ...commandComponent(result),
    removed: result.status === 0 && !result.error ? remove : [],
    attemptedRemove: remove,
    preserved: preserve,
    repositorySlug: repositoryContext.repositorySlug,
    repositoryId: repositoryContext.repositoryId || null,
    operation: "label_remove",
    completedAt: new Date().toISOString(),
  };
}

export function renderCompletionComment(context = {}, closeDecision = evaluateCloseDecision(context.issue, context)) {
  const pr = context.pr || {};
  const validation = context.validation || {};
  const externalReview = context.externalReview || {};
  const codexReview = context.review || {};
  return [
    `Auto-runner merge completion evidence for #${context.issue?.number}.`,
    "",
    `PR: ${pr.url || (pr.number ? `#${pr.number}` : "unknown")}`,
    `Source head: \`${context.sourceHeadSha || context.expectedHeadSha || "unknown"}\``,
    `Merge SHA: \`${context.mergeSha || "unknown"}\``,
    `Completed scope: ${context.completedScope || context.issue?.title || "bounded issue scope"}`,
    `Validation: ${validation.passed === true ? "passed" : validation.passed === false ? "failed" : "unknown"}`,
    `External review: ${externalReview.status || externalReview.verdict || "unknown"}`,
    `Codex mechanics/security review: ${codexReview.verdict?.verdict || codexReview.status || "unknown"}`,
    `Exact-head CI/security: ${context.ciSecurityResult || "unknown"}`,
    `Post-merge/current-main: ${context.currentMainResult || "not_required_or_unknown"}`,
    `Generated/reused follow-up issues: ${formatIssueList(context.generatedFollowups || [])}`,
    `Remaining gates: ${formatList(context.remainingGates || [])}`,
    `Close/keep-open rationale: ${closeDecision.reason}`,
    "",
    `Completion marker: settleora-completion:${context.issue?.number}:${context.mergeSha || "unknown"}`,
  ].join("\n");
}

export function renderParentProgressComment(context = {}) {
  return [
    `Bundle progress update from issue #${context.issue?.number}.`,
    "",
    `Completed children: ${formatIssueList(context.completedChildren || [context.issue?.number].filter(Boolean))}`,
    `Remaining children: ${formatIssueList(context.remainingChildren || [])}`,
    `Blockers: ${formatList(context.blockers || [])}`,
    `Future gates: ${formatIssueList(context.futureGates || [])}`,
    `Manual decisions: ${formatList(context.manualDecisions || [])}`,
    `Generated/reused follow-up issues: ${formatIssueList(context.generatedFollowups || [])}`,
    `Keep-open/close rationale: ${context.parentKeepOpenRationale || "#800 remains open until #894 final acceptance."}`,
    "",
    `Parent progress marker: settleora-parent-progress:${context.parentIssue}:${context.mergeSha || "unknown"}:${context.issue?.number || "unknown"}`,
  ].join("\n");
}

export function buildLedgerReconciliationProposal(context = {}) {
  if (context.ledgerReconciliation?.skip || context.issue?.proposalKind === "ledger_reconciliation") {
    return { skipped: true, reason: "ledger_reconciliation_recursion_guard" };
  }
  const result = deriveIssueProposals({
    type: "ledger_reconciliation",
    taskKey: context.taskKey || "post-merge",
    issueNumber: context.issue?.number,
    parentIssue: context.parentIssue || 800,
    prNumber: context.pr?.number,
    mergeSha: context.mergeSha,
    title: `Reconcile ledger for #${context.issue?.number} merge ${shortSha(context.mergeSha)}`,
    summary: `Record exact merge ${context.mergeSha || "unknown"} for #${context.issue?.number} without committing directly to main.`,
  });
  if (!result.ok) return { skipped: false, ok: false, reason: result.reason };
  return { skipped: false, ok: true, proposal: result.proposals[0] };
}

function refreshCompletionState(context = {}, runner, repositoryContext) {
  const issue = context.issue?.number ? readIssue(context.issue, runner, repositoryContext) : context.issue || {};
  const pr = context.pr?.number || context.pr?.url ? readPr(context.pr, runner, repositoryContext) : context.pr || {};
  return {
    ...context,
    issue: { ...(context.issue || {}), ...issue },
    pr: { ...(context.pr || {}), ...pr },
    sourceHeadSha: context.sourceHeadSha || pr.headRefOid || context.expectedHeadSha || null,
    mergeSha: context.mergeSha || pr.mergeCommit?.oid || null,
  };
}

function readIssue(issue, runner, repositoryContext) {
  const result = runner("gh", ["issue", "view", String(issue.number), "--repo", repositoryContext.repositorySlug, "--json", "number,title,body,state,labels,comments,url"]);
  if (result.status !== 0 || result.error) return issue;
  try {
    return normalizeIssue(JSON.parse(result.stdout || "{}"));
  } catch {
    return issue;
  }
}

function readPr(pr, runner, repositoryContext) {
  const ref = pr.number || pr.url;
  const result = runner("gh", ["pr", "view", String(ref), "--repo", repositoryContext.repositorySlug, "--json", "number,url,title,body,state,headRefName,headRefOid,baseRefName,mergeCommit,mergedAt"]);
  if (result.status !== 0 || result.error) return pr;
  try {
    return JSON.parse(result.stdout || "{}");
  } catch {
    return pr;
  }
}

function normalizeIssue(issue = {}) {
  return {
    ...issue,
    labels: labelNames(issue.labels),
    comments: Array.isArray(issue.comments) ? issue.comments : [],
  };
}

function isUmbrellaIssue(issue = {}) {
  const labels = labelNames(issue.labels);
  const text = `${issue.title || ""}\n${issue.body || ""}\n${labels.join("\n")}`;
  if (issue.number === 800) return true;
  return umbrellaSignals.some((pattern) => pattern.test(text));
}

function hasRemainingGates(issue = {}, context = {}) {
  const body = `${issue.body || ""}\n${context.remainingGates?.join("\n") || ""}`;
  if ((context.remainingGates || []).length > 0) return true;
  return /\b(remaining gates?|keep open until|partially complete|not complete|manual merge remains|required before close)\b/i.test(body);
}

function explicitCloseRuleSatisfied(issue = {}, context = {}) {
  const body = `${issue.body || ""}\n${context.closeEvidence || ""}`;
  if (!/\bClose rule:/i.test(body) && !context.closeRuleSatisfied) return false;
  return Boolean(context.closeRuleSatisfied || (context.mergeSha && context.validation?.passed === true));
}

function hasCompletionComment(issue = {}, context = {}) {
  const marker = `settleora-completion:${issue.number}:${context.mergeSha || "unknown"}`;
  const sourceHead = context.sourceHeadSha || context.expectedHeadSha || "unknown";
  return (issue.comments || []).some((comment) => {
    const body = String(comment.body || "");
    return body.split(/\r?\n/).includes(`Completion marker: ${marker}`)
      && body.includes(`Source head: \`${sourceHead}\``)
      && body.includes(`Merge SHA: \`${context.mergeSha || "unknown"}\``);
  });
}

function postParentProgress(config, context, runner, repositoryContext) {
  const parentIssue = context.parentIssue || context.parent?.number || 800;
  if (!parentIssue) return { status: "skipped", reason: "parent_issue_missing" };
  const parent = readIssue({ number: parentIssue }, runner, repositoryContext);
  const body = renderParentProgressComment({ ...context, parentIssue });
  const marker = `settleora-parent-progress:${parentIssue}:${context.mergeSha || "unknown"}:${context.issue?.number || "unknown"}`;
  if ((parent.comments || []).some((comment) => String(comment.body || "").includes(marker))) {
    return { status: "skipped", reason: "parent_progress_already_present", parentIssue };
  }
  const component = context.sessionLifecycle
    ? canonicalCommentComponent(config, context, runner, repositoryContext, parentIssue, body, "umbrella_update")
    : commandComponent(runner("gh", ["issue", "comment", String(parentIssue), "--repo", repositoryContext.repositorySlug, "--body", body]));
  return { ...component, parentIssue, repositorySlug: repositoryContext.repositorySlug };
}

function canonicalCommentComponent(config, context, runner, repositoryContext, issueNumber, body, effectType) {
  const marker = body.split(/\r?\n/).find((line) => /(?:Completion|Parent progress) marker:/.test(line)) || `body-sha256:${canonicalGithubEvidenceDigest(body)}`;
  const effect = { issueNumber, bodyDigest: canonicalGithubEvidenceDigest(body), stableMarker: marker, repository: repositoryContext.repositorySlug };
  const result = executeCanonicalGithubEffectSync(config, context.sessionLifecycle, { effectType, issueNumber, headSha: context.sourceHeadSha || context.expectedHeadSha, baseSha: context.mergeSha, effect }, {
    readLive: (intent) => {
      const live = runner("gh", ["issue", "view", String(issueNumber), "--repo", repositoryContext.repositorySlug, "--json", "number,comments"], { cwd: config.repoRoot });
      if (live.error || live.status !== 0) return { complete: false };
      let issue; try { issue = JSON.parse(live.stdout || "{}"); } catch { return { complete: false }; }
      const matches = (issue.comments || []).filter((comment) => String(comment.body || "").includes(marker) && canonicalGithubEvidenceDigest(String(comment.body || "")) === effect.bodyDigest);
      if (matches.length > 1) return { complete: true, ambiguous: true };
      return matches.length === 1 ? { complete: true, present: true, identity: intent.identity, effect } : { complete: true, present: false };
    },
    execute: () => {
      const mutation = runner("gh", ["issue", "comment", String(issueNumber), "--repo", repositoryContext.repositorySlug, "--body", body], { cwd: config.repoRoot });
      if (mutation.error || mutation.status !== 0) throw new Error("Canonical issue comment did not confirm success");
      return { ok: true, status: mutation.status };
    },
  });
  return result.ok ? { status: "updated", canonicalEffect: result } : { status: "failed", reason: result.reasonCode, canonicalEffect: result };
}

function canonicalClosureComponent(config, context, runner, repositoryContext) {
  const issueNumber = context.issue.number;
  const effect = { issueNumber, closeReason: "completed", mergeSha: context.mergeSha, sourceHeadSha: context.sourceHeadSha, closeEvidenceDigest: canonicalGithubEvidenceDigest({ closeDecision: context.closeDecision, mergeSha: context.mergeSha, validation: context.validation }) };
  const result = executeCanonicalGithubEffectSync(config, context.sessionLifecycle, { effectType: "issue_closure", issueNumber, headSha: context.sourceHeadSha, baseSha: context.mergeSha, effect }, {
    readLive: (intent) => {
      const live = runner("gh", ["issue", "view", String(issueNumber), "--repo", repositoryContext.repositorySlug, "--json", "number,state"], { cwd: config.repoRoot });
      if (live.error || live.status !== 0) return { complete: false };
      let issue; try { issue = JSON.parse(live.stdout || "{}"); } catch { return { complete: false }; }
      return String(issue.state).toUpperCase() === "CLOSED" ? { complete: true, present: true, identity: intent.identity, effect } : { complete: true, present: false };
    },
    execute: () => {
      const mutation = runner("gh", ["issue", "close", String(issueNumber), "--repo", repositoryContext.repositorySlug, "--reason", "completed"], { cwd: config.repoRoot });
      if (mutation.error || mutation.status !== 0) throw new Error("Canonical issue closure did not confirm success");
      return { ok: true, status: mutation.status };
    },
  });
  return result.ok ? { status: "updated", canonicalEffect: result } : { status: "failed", reason: result.reasonCode, canonicalEffect: result };
}

function updateProjectStatusIfSupported(config, context, runner) {
  if (!config.projectStatusUpdates?.supported) return { status: "not_updated", reason: "project_status_mapping_not_configured" };
  if (!config.projectStatusUpdates.projectId || !config.projectStatusUpdates.fieldId) {
    return { status: "not_updated", reason: "project_status_mapping_incomplete" };
  }
  return commandComponent(
    runner("gh", [
      "project",
      "item-edit",
      "--id",
      String(context.issue?.number),
      "--project-id",
      config.projectStatusUpdates.projectId,
      "--field-id",
      config.projectStatusUpdates.fieldId,
      "--single-select-option-id",
      config.projectStatusUpdates.doneOptionId,
    ]),
  );
}

function reconcileLedger(config, context, runner, repositoryContext) {
  const proposalResult = buildLedgerReconciliationProposal(context);
  if (proposalResult.skipped || !proposalResult.ok) return proposalResult;
  const result = executeIssueMutationPipeline(
    { ...config, maxFollowupIssuesPerRun: 1 },
    [proposalResult.proposal],
    context.ledgerEvidence || {},
    { runner, repositoryContext, context },
  );
  return {
    status: result.results[0]?.action || "unknown",
    reason: result.results[0]?.reason || null,
    proposal: {
      title: proposalResult.proposal.title,
      correlationKey: proposalResult.proposal.correlationKey,
      idempotencyKey: proposalResult.proposal.idempotencyKey,
    },
    result: result.results[0] || null,
  };
}

function commandComponent(result = {}) {
  return result.status === 0 && !result.error
    ? { status: "updated" }
    : { status: "failed", reason: result.stderr || result.error || "command_failed" };
}

function labelNames(labels = []) {
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
}

function failedCompletionHygiene(context = {}, reason, repositoryContext = {}) {
  const component = { status: "failed", reason };
  return {
    status: "failed",
    reason,
    repositoryContext,
    mergeSha: context.mergeSha || null,
    sourceHeadSha: context.sourceHeadSha || context.expectedHeadSha || null,
    issue: issueSummary(context.issue || {}),
    closeDecision: { close: false, reason },
    closure: component,
    comment: component,
    labelCleanup: component,
    parentProgress: component,
    project: { status: "not_updated", reason },
    ledger: { skipped: true, reason },
    generatedFollowups: context.generatedFollowups || [],
    sourceBranchDeleted: false,
  };
}

function issueSummary(issue = {}) {
  return { number: issue.number, title: issue.title, state: issue.state, labels: labelNames(issue.labels), url: issue.url || null };
}

function formatIssueList(values = []) {
  const issues = values
    .map((value) => (typeof value === "number" ? `#${value}` : value?.number ? `#${value.number}` : String(value || "")))
    .filter(Boolean);
  return issues.length ? issues.join(", ") : "none";
}

function formatList(values = []) {
  return values.length ? values.join(", ") : "none";
}

function shortSha(value) {
  return String(value || "unknown").slice(0, 12);
}
