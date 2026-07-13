import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { safeTimestamp } from "./logger.mjs";
import { parseAutoRunnerContract } from "./lane-policy.mjs";
import {
  renderProposalIssueBody,
  searchDuplicateEvidence,
  validateIssueProposal,
} from "./issue-proposals.mjs";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";
import { planFeatureBundleIssue } from "./feature-bundle-contract.mjs";

const defaultMaxIssuesPerRun = 3;
const knownLabelSet = new Set([
  "area:infra",
  "type:feature",
  "type:bug",
  "type:chore",
  "workflow",
  "auto-ready",
  "auto-bundle",
  "manual-gate",
  "needs-tommy",
  "blocked",
]);
const durableQueueLabels = new Set(["auto-ready", "auto-bundle"]);
const transientLabels = new Set(["auto-claimed", "auto-running", "auto-pr-opened", "auto-failed"]);

export function executeIssueMutationPipeline(config = {}, proposals = [], evidence = {}, options = {}) {
  const runner = options.runner || ghRunner;
  const maxIssues = normalizeMaxIssues(config.maxFollowupIssuesPerRun);
  const results = [];
  let createdOrQueued = 0;

  for (const proposal of proposals) {
    const startedAt = new Date().toISOString();
    const validation = validateMutationProposal(proposal);
    const intent = {
      generatedAt: startedAt,
      proposal: proposalSummary(proposal),
      capability: mutationCapability(config),
      validation,
    };
    const beforePath = persistMutationEvidence(config, "intent", proposal, intent);
    if (!validation.ok) {
      results.push(finalize(config, proposal, { action: "blocked", reason: validation.reason, validation, beforePath }));
      continue;
    }
    const duplicate = searchDuplicateEvidence(validation.proposal, evidence);
    if (!duplicate.ok) {
      results.push(finalize(config, proposal, { action: duplicate.action || "blocked", reason: duplicate.reason, duplicate, beforePath }));
      continue;
    }
    if (duplicate.action === "reuse" || duplicate.action === "reuse_completed_evidence") {
      const reuse = maybeCommentExistingCorrelation(config, validation.proposal, duplicate.matches[0], runner);
      results.push(finalize(config, proposal, { action: duplicate.action, reason: duplicate.reason, duplicate, reuse, beforePath }));
      continue;
    }
    if (createdOrQueued >= maxIssues) {
      results.push(finalize(config, proposal, { action: "blocked", reason: "max_issues_per_run_exceeded", beforePath }));
      continue;
    }
    if (!mutationCapability(config).allowed) {
      results.push(
        finalize(config, proposal, {
          action: "preview",
          reason: config.dryRun ? "dry_run_no_github_mutation" : "followup_issue_creation_disabled",
          preview: mutationPreview(validation.proposal),
          beforePath,
        }),
      );
      continue;
    }

    const rereadBefore = findExistingByCorrelation(validation.proposal, evidence, runner);
    if (rereadBefore.found) {
      results.push(finalize(config, proposal, { action: "reuse", reason: "reread_before_create_found_existing", duplicate: rereadBefore, beforePath }));
      continue;
    }

    const created = createIssue(validation.proposal, runner);
    if (created.uncertain) {
      const rereadAfter = findExistingByCorrelation(validation.proposal, evidence, runner);
      if (rereadAfter.found) {
        results.push(finalize(config, proposal, { action: "reuse", reason: "uncertain_create_response_reused_by_correlation", create: created, duplicate: rereadAfter, beforePath }));
        continue;
      }
    }
    if (!created.ok) {
      results.push(finalize(config, proposal, { action: "failed", reason: created.reason, create: created, beforePath }));
      continue;
    }

    createdOrQueued += 1;
    const components = {
      comment: addCorrelationComment(validation.proposal, created.issue, runner),
      labels: ensureQueueLabels(validation.proposal, created.issue, runner),
      project: updateProjectStatusIfSupported(config, validation.proposal, created.issue, runner),
    };
    results.push(
      finalize(config, proposal, {
        action: "created",
        reason: "issue_created",
        create: created,
        components,
        issue: created.issue,
        beforePath,
      }),
    );
  }
  return {
    ok: results.every((result) => !["failed", "blocked"].includes(result.action)),
    results,
    createdOrQueued,
    maxIssues,
  };
}

export function validateMutationProposal(proposal = {}) {
  const base = validateIssueProposal(proposal);
  if (!base.ok) return { ok: false, reason: base.reason, base };
  const validated = base.proposal;
  const labels = validated.proposedLabels || [];
  for (const label of labels) {
    if (transientLabels.has(label)) return { ok: false, reason: `transient_label_forbidden:${label}`, proposal: validated };
    if (!knownLabelSet.has(label)) return { ok: false, reason: `unknown_label:${label}`, proposal: validated };
  }
  if (!labels.some((label) => durableQueueLabels.has(label)) && !labels.includes("manual-gate")) {
    return { ok: false, reason: "missing_durable_queue_or_manual_label", proposal: validated };
  }
  if (labels.includes("auto-bundle") && !validated.autoRunnerContract?.bundle) {
    return { ok: false, reason: "auto_bundle_requires_valid_bundle_contract", proposal: validated };
  }
  if (labels.includes("manual-gate") && (!validated.manualDecisions || validated.manualDecisions.length === 0)) {
    return { ok: false, reason: "manual_gate_requires_genuine_decision", proposal: validated };
  }
  const body = renderProposalIssueBody(validated);
  const parsed = parseAutoRunnerContract(body);
  if (!parsed.ok) return { ok: false, reason: `generated_contract_parse_failed:${parsed.reason}`, proposal: validated };
  if (labels.includes("auto-bundle")) {
    const bundlePlan = planFeatureBundleIssue({
      number: 0,
      title: validated.title,
      body: renderContractOnlyBody(validated.autoRunnerContract),
      labels,
    });
    if (!bundlePlan.ok) return { ok: false, reason: `generated_bundle_contract_invalid:${bundlePlan.reasonCode}`, proposal: validated, bundlePlan };
  }
  return { ok: true, proposal: validated, body };
}

function renderContractOnlyBody(contract) {
  return ["## Auto-runner contract", "", "```json", JSON.stringify(contract, null, 2), "```"].join("\n");
}

export function mutationCapability(config = {}) {
  return {
    allowed: Boolean(config.run && !config.dryRun && config.allowFollowupIssueCreation),
    run: Boolean(config.run),
    dryRun: Boolean(config.dryRun),
    allowFollowupIssueCreation: Boolean(config.allowFollowupIssueCreation),
  };
}

function createIssue(proposal, runner) {
  const body = renderProposalIssueBody(proposal);
  const result = runner("gh", [
    "issue",
    "create",
    "--title",
    proposal.title,
    "--body",
    body,
    "--label",
    proposal.proposedLabels.join(","),
  ]);
  if (result.error) return { ok: false, uncertain: true, reason: result.error, result: commandStatus(result) };
  if (result.status !== 0) {
    const stderr = String(result.stderr || "");
    return {
      ok: false,
      uncertain: /timeout|timed out|network|connection|EOF/i.test(stderr),
      reason: stderr || result.stdout || "issue_create_failed",
      result: commandStatus(result),
    };
  }
  const url = String(result.stdout || "").trim();
  const number = Number(url.match(/\/issues\/(\d+)/)?.[1] || result.issueNumber || 0) || null;
  return {
    ok: true,
    uncertain: false,
    issue: {
      number,
      url,
      state: "OPEN",
      labels: proposal.proposedLabels,
      correlationKey: proposal.correlationKey,
      idempotencyKey: proposal.idempotencyKey,
    },
    result: commandStatus(result),
  };
}

function maybeCommentExistingCorrelation(config, proposal, match, runner) {
  if (!mutationCapability(config).allowed) return { skipped: true, reason: "mutation_not_allowed" };
  const text = `${match.body || ""}\n${match.text || ""}\n${match.comment || ""}`;
  if (text.includes(proposal.correlationKey) || text.includes(proposal.idempotencyKey)) {
    return { skipped: true, reason: "correlation_already_present" };
  }
  return addCorrelationComment(proposal, match, runner);
}

function addCorrelationComment(proposal, issue, runner) {
  if (!issue?.number) return { status: "not_updated", reason: "issue_number_missing" };
  const body = [
    "Generated-work correlation recorded.",
    "",
    `Correlation key: \`${proposal.correlationKey}\``,
    `Idempotency key: \`${proposal.idempotencyKey}\``,
  ].join("\n");
  return commandComponent(runner("gh", ["issue", "comment", String(issue.number), "--body", body]));
}

function ensureQueueLabels(proposal, issue, runner) {
  if (!issue?.number) return { status: "not_updated", reason: "issue_number_missing" };
  const labels = proposal.proposedLabels.filter((label) => durableQueueLabels.has(label) || label === "manual-gate" || label === "needs-tommy");
  if (labels.length === 0) return { status: "not_updated", reason: "no_queue_labels" };
  return commandComponent(runner("gh", ["issue", "edit", String(issue.number), "--add-label", labels.join(",")]));
}

function updateProjectStatusIfSupported(config, proposal, issue, runner) {
  if (!config.projectStatusUpdates?.supported) {
    return { status: "not_updated", reason: "project_status_mapping_not_configured" };
  }
  if (!config.projectStatusUpdates?.fieldId || !config.projectStatusUpdates?.projectId) {
    return { status: "not_updated", reason: "project_status_mapping_incomplete" };
  }
  const result = runner("gh", [
    "project",
    "item-edit",
    "--id",
    String(issue.number),
    "--project-id",
    config.projectStatusUpdates.projectId,
    "--field-id",
    config.projectStatusUpdates.fieldId,
    "--single-select-option-id",
    config.projectStatusUpdates.readyOptionId,
  ]);
  return commandComponent(result);
}

function findExistingByCorrelation(proposal, evidence, runner) {
  const duplicate = searchDuplicateEvidence(proposal, evidence);
  if (duplicate.ok && ["reuse", "reuse_completed_evidence"].includes(duplicate.action)) {
    return { found: true, source: "evidence", matches: duplicate.matches };
  }
  const query = `${proposal.correlationKey} repo:tommytang213/Settleora`;
  const result = runner("gh", ["issue", "list", "--state", "all", "--search", query, "--json", "number,title,state,url,labels,body"]);
  if (result.status !== 0 || result.error) return { found: false, reason: "correlation_reread_failed", result: commandStatus(result) };
  try {
    const parsed = JSON.parse(result.stdout || "[]");
    const exact = parsed.filter((item) => String(item.body || "").includes(proposal.correlationKey));
    return exact.length > 0 ? { found: true, source: "github_search", matches: exact } : { found: false, source: "github_search" };
  } catch (error) {
    return { found: false, reason: `correlation_reread_parse_failed:${error.message}` };
  }
}

function mutationPreview(proposal) {
  return {
    title: proposal.title,
    body: renderProposalIssueBody(proposal),
    labels: proposal.proposedLabels,
    queueIntent: proposal.proposedLabels.filter((label) => durableQueueLabels.has(label)),
    correlationKey: proposal.correlationKey,
    idempotencyKey: proposal.idempotencyKey,
  };
}

function finalize(config, proposal, result) {
  const final = sanitizePersistedEvidence({
    proposal: proposalSummary(proposal),
    ...result,
    completedAt: new Date().toISOString(),
  });
  const afterPath = persistMutationEvidence(config, "result", proposal, final);
  return { ...final, afterPath };
}

function persistMutationEvidence(config, phase, proposal, evidence) {
  const root = path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "generated-work");
  mkdirSync(root, { recursive: true });
  const safeKey = String(proposal?.correlationKey || proposal?.title || "proposal")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .slice(0, 80);
  const filePath = path.join(root, `${safeTimestamp()}-${phase}-${safeKey}.json`);
  writeFileSync(filePath, `${JSON.stringify(sanitizePersistedEvidence(evidence), null, 2)}\n`);
  return filePath;
}

function proposalSummary(proposal = {}) {
  return {
    kind: proposal.kind,
    title: proposal.title,
    correlationKey: proposal.correlationKey,
    idempotencyKey: proposal.idempotencyKey,
    labels: proposal.proposedLabels,
    validationProfile: proposal.validationProfile,
    reviewerTier: proposal.reviewerTier,
  };
}

function normalizeMaxIssues(value) {
  const parsed = Number(value ?? defaultMaxIssuesPerRun);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, 10) : defaultMaxIssuesPerRun;
}

function commandComponent(result = {}) {
  return result.status === 0 && !result.error
    ? { status: "updated", result: commandStatus(result) }
    : { status: "failed", result: commandStatus(result), reason: result.stderr || result.error || "command_failed" };
}

function commandStatus(result = {}) {
  return {
    status: result.status ?? null,
    stdout: bounded(result.stdout || ""),
    stderr: bounded(result.stderr || ""),
    error: result.error || null,
  };
}

function bounded(value) {
  const text = String(value || "");
  return text.length > 500 ? `${text.slice(0, 500)}...[truncated]` : text;
}

function ghRunner(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}
