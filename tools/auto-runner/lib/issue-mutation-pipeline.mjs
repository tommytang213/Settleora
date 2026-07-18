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
  const repositoryContext = buildIssueOperationContext(
    config,
    {
      ...(options.context || {}),
      repositoryContext: options.repositoryContext || options.context?.repositoryContext || config.repositoryContext,
      repositoryOperationProof: options.repositoryOperationProof || options.context?.repositoryOperationProof || config.repositoryOperationProof,
    },
    { requireIssueNumber: false },
  );
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
      repositoryContext,
      validation,
    };
    const beforePath = persistMutationEvidence(config, "intent", proposal, intent);
    if (!repositoryContext.ok) {
      results.push(finalize(config, proposal, { action: "blocked", reason: repositoryContext.reason, validation, repositoryContext, beforePath }));
      continue;
    }
    if (!validation.ok) {
      results.push(finalize(config, proposal, { action: "blocked", reason: validation.reason, validation, beforePath }));
      continue;
    }
    const duplicate = repositoryBoundDuplicateEvidence(searchDuplicateEvidence(validation.proposal, evidence), repositoryContext);
    if (!duplicate.ok) {
      results.push(finalize(config, proposal, { action: duplicate.action || "blocked", reason: duplicate.reason, duplicate, beforePath }));
      continue;
    }
    if (duplicate.action === "reuse" || duplicate.action === "reuse_completed_evidence") {
      const reuse = maybeCommentExistingCorrelation(config, validation.proposal, duplicate.matches[0], runner, repositoryContext);
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

    const rereadBefore = findExistingByCorrelation(validation.proposal, evidence, runner, repositoryContext);
    if (rereadBefore.found) {
      results.push(finalize(config, proposal, { action: "reuse", reason: "reread_before_create_found_existing", duplicate: rereadBefore, beforePath }));
      continue;
    }

    const created = createIssue(validation.proposal, runner, repositoryContext);
    if (created.uncertain) {
      const rereadAfter = findExistingByCorrelation(validation.proposal, evidence, runner, repositoryContext);
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
      comment: addCorrelationComment(validation.proposal, created.issue, runner, repositoryContext),
      labels: ensureQueueLabels(validation.proposal, created.issue, runner, repositoryContext),
      project: updateProjectStatusIfSupported(config, validation.proposal, created.issue, runner),
    };
    results.push(
      finalize(config, proposal, {
        action: "created",
        reason: "issue_created",
        repositoryContext,
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

export function buildIssueOperationContext(config = {}, context = {}, options = {}) {
  const configured = normalizeRepositorySlug(
    config.repositorySlug ||
      context.config?.repositorySlug ||
      context.repositoryContext?.repositorySlug ||
      context.repositoryContext?.configuredRepositorySlug ||
      context.repositoryOperationProof?.repositorySlug ||
      context.repositoryOperationProof?.configuredRepositorySlug ||
      repositorySlugFromGithubUrl(context.pr?.url),
  );
  if (!configured) return { ok: false, reason: "repository_slug_required" };
  const host = normalizeGithubHost(config.githubHost || context.repositoryContext?.githubHost || context.repositoryOperationProof?.githubHost || "github.com");
  if (host !== "github.com") return { ok: false, reason: "unsupported_github_host", repositorySlug: configured };
  const proof = context.repositoryContext || context.repositoryOperationProof || {};
  for (const [field, value] of Object.entries({
    repositorySlug: proof.repositorySlug,
    configuredRepositorySlug: proof.configuredRepositorySlug,
    originRepositorySlug: proof.originRepositorySlug,
    baseRepositorySlug: proof.baseRepositorySlug,
    headRepositorySlug: proof.headRepositorySlug,
    argvRepository: proof.argvRepository,
  })) {
    const normalized = value ? normalizeRepositorySlug(value) : null;
    if (value && !normalized) return { ok: false, reason: `repository_${field}_malformed`, repositorySlug: configured };
    if (normalized && normalized !== configured) return { ok: false, reason: `repository_${field}_mismatch`, repositorySlug: configured, observedRepositorySlug: normalized };
  }
  const prRepository = normalizeRepositorySlug(context.pr?.headRepository?.nameWithOwner || context.pr?.headRepositorySlug || "");
  if (prRepository && prRepository !== configured) return { ok: false, reason: "repository_pr_head_mismatch", repositorySlug: configured, observedRepositorySlug: prRepository };
  const issueNumber = normalizeIssueNumber(context.issue?.number);
  if (options.requireIssueNumber !== false && !issueNumber) return { ok: false, reason: "issue_number_required", repositorySlug: configured };
  return {
    ok: true,
    repositorySlug: configured,
    canonicalRepositorySlug: configured,
    githubHost: host,
    repositoryId: proof.repositoryId || proof.baseRepositoryId || proof.headRepositoryId || context.pr?.headRepository?.id || null,
    worktreeRoot: config.repoRoot || context.worktreePath || proof.worktreePath || proof.worktreeRoot || null,
    worktreePath: config.repoRoot || context.worktreePath || proof.worktreePath || proof.worktreeRoot || null,
    stackId: context.stackId || null,
    taskKey: context.taskKey || config.taskKey || null,
    runId: context.runId || config.runId || null,
    supervisorRunId: context.supervisorRunId || config.supervisorRunId || null,
    issueNumber,
    mode: config.dryRun ? "dry_run" : config.run ? "production" : "test",
    dryRun: Boolean(config.dryRun),
    proof: proof || null,
  };
}

function createIssue(proposal, runner, repositoryContext) {
  const body = renderProposalIssueBody(proposal);
  const result = runner("gh", [
    "issue",
    "create",
    "--repo",
    repositoryContext.repositorySlug,
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
  const parsed = parseIssueUrl(url, repositoryContext.repositorySlug);
  if (!parsed.ok) return { ok: false, uncertain: false, reason: parsed.reason, result: commandStatus(result), repositoryContext };
  const number = parsed.number;
  return {
    ok: true,
    uncertain: false,
    issue: {
      number,
      url: parsed.canonicalUrl,
      canonicalUrl: parsed.canonicalUrl,
      issueUrlParseProof: parsed,
      repositorySlug: repositoryContext.repositorySlug,
      repositoryId: repositoryContext.repositoryId || null,
      state: "OPEN",
      labels: proposal.proposedLabels,
      correlationKey: proposal.correlationKey,
      idempotencyKey: proposal.idempotencyKey,
    },
    repositoryContext,
    result: commandStatus(result),
  };
}

function maybeCommentExistingCorrelation(config, proposal, match, runner, repositoryContext) {
  if (!mutationCapability(config).allowed) return { skipped: true, reason: "mutation_not_allowed" };
  const text = `${match.body || ""}\n${match.text || ""}\n${match.comment || ""}`;
  if (text.includes(proposal.correlationKey) || text.includes(proposal.idempotencyKey)) {
    return { skipped: true, reason: "correlation_already_present" };
  }
  return addCorrelationComment(proposal, match, runner, repositoryContext);
}

function addCorrelationComment(proposal, issue, runner, repositoryContext) {
  if (!issue?.number) return { status: "not_updated", reason: "issue_number_missing" };
  if (!sameRepositoryIssue(issue, repositoryContext)) return { status: "failed", reason: "issue_repository_mismatch", repositorySlug: repositoryContext.repositorySlug };
  const existing = runner("gh", ["issue", "view", String(issue.number), "--repo", repositoryContext.repositorySlug, "--json", "comments,body,url,number"]);
  if (existing.status !== 0 || existing.error) return { status: "failed", reason: "correlation_comment_read_failed", result: commandStatus(existing), repositorySlug: repositoryContext.repositorySlug };
  try {
    const parsed = JSON.parse(existing.stdout || "{}");
    const repositoryCheck = repositoryEvidenceMatches(parsed, repositoryContext, { expectedIssueNumber: issue.number });
    if (!repositoryCheck.ok) return { status: "failed", reason: repositoryCheck.reason, repositorySlug: repositoryContext.repositorySlug };
    const text = `${parsed.body || ""}\n${(Array.isArray(parsed.comments) ? parsed.comments : []).map((comment) => comment.body || "").join("\n")}`;
    if (text.includes(proposal.correlationKey) || text.includes(proposal.idempotencyKey)) {
      return { status: "skipped", reason: "correlation_already_present", repositorySlug: repositoryContext.repositorySlug, issueNumber: issue.number };
    }
  } catch (error) {
    return { status: "failed", reason: `correlation_comment_read_parse_failed:${bounded(error.message)}`, repositorySlug: repositoryContext.repositorySlug };
  }
  const body = [
    "Generated-work correlation recorded.",
    "",
    `Correlation key: \`${proposal.correlationKey}\``,
    `Idempotency key: \`${proposal.idempotencyKey}\``,
  ].join("\n");
  return {
    ...commandComponent(runner("gh", ["issue", "comment", String(issue.number), "--repo", repositoryContext.repositorySlug, "--body", body])),
    repositorySlug: repositoryContext.repositorySlug,
    repositoryId: repositoryContext.repositoryId || null,
    issueNumber: issue.number,
    correlationKey: proposal.correlationKey,
    idempotencyKey: proposal.idempotencyKey,
  };
}

function ensureQueueLabels(proposal, issue, runner, repositoryContext) {
  if (!issue?.number) return { status: "not_updated", reason: "issue_number_missing" };
  if (!sameRepositoryIssue(issue, repositoryContext)) return { status: "failed", reason: "issue_repository_mismatch", repositorySlug: repositoryContext.repositorySlug };
  const labels = proposal.proposedLabels.filter((label) => durableQueueLabels.has(label) || label === "manual-gate" || label === "needs-tommy");
  if (labels.length === 0) return { status: "not_updated", reason: "no_queue_labels" };
  const view = runner("gh", ["issue", "view", String(issue.number), "--repo", repositoryContext.repositorySlug, "--json", "labels,url,number"]);
  if (view.status !== 0 || view.error) return { status: "failed", reason: "queue_label_read_failed", result: commandStatus(view), repositorySlug: repositoryContext.repositorySlug };
  try {
    const parsed = JSON.parse(view.stdout || "{}");
    const repositoryCheck = repositoryEvidenceMatches(parsed, repositoryContext, { expectedIssueNumber: issue.number });
    if (!repositoryCheck.ok) return { status: "failed", reason: repositoryCheck.reason, repositorySlug: repositoryContext.repositorySlug };
    const existing = labelNames(parsed.labels);
    const missing = labels.filter((label) => !existing.includes(label));
    if (missing.length === 0) {
      return { status: "skipped", reason: "queue_labels_already_present", labelsFound: existing, labelsAdded: [], repositorySlug: repositoryContext.repositorySlug, issueNumber: issue.number };
    }
    const edit = runner("gh", ["issue", "edit", String(issue.number), "--repo", repositoryContext.repositorySlug, "--add-label", missing.join(",")]);
    return {
      ...commandComponent(edit),
      labelsFound: existing,
      labelsAdded: edit.status === 0 && !edit.error ? missing : [],
      labelsAttempted: missing,
      repositorySlug: repositoryContext.repositorySlug,
      repositoryId: repositoryContext.repositoryId || null,
      issueNumber: issue.number,
    };
  } catch (error) {
    return { status: "failed", reason: `queue_label_read_parse_failed:${bounded(error.message)}`, repositorySlug: repositoryContext.repositorySlug };
  }
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

function findExistingByCorrelation(proposal, evidence, runner, repositoryContext) {
  const duplicate = repositoryBoundDuplicateEvidence(searchDuplicateEvidence(proposal, evidence), repositoryContext);
  if (duplicate.ok && ["reuse", "reuse_completed_evidence"].includes(duplicate.action)) {
    return { found: true, source: "evidence", matches: duplicate.matches, repositorySlug: repositoryContext.repositorySlug };
  }
  const query = proposal.correlationKey;
  const result = runner("gh", ["issue", "list", "--repo", repositoryContext.repositorySlug, "--state", "all", "--search", query, "--json", "number,title,state,url,labels,body"]);
  if (result.status !== 0 || result.error) return { found: false, reason: "correlation_reread_failed", result: commandStatus(result) };
  try {
    const parsed = JSON.parse(result.stdout || "[]");
    const exact = parsed.filter((item) => String(item.body || "").includes(proposal.correlationKey));
    const sameRepository = exact.filter((item) => repositoryEvidenceMatches(item, repositoryContext).ok);
    const otherRepositoryCount = exact.length - sameRepository.length;
    return sameRepository.length > 0
      ? { found: true, source: "github_search", matches: sameRepository.map((item) => bindIssueEvidence(item, repositoryContext)), otherRepositoryCount, repositorySlug: repositoryContext.repositorySlug, query }
      : { found: false, source: "github_search", otherRepositoryCount, repositorySlug: repositoryContext.repositorySlug, query };
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

function repositoryBoundDuplicateEvidence(duplicate = {}, repositoryContext = {}) {
  if (!duplicate.ok || !Array.isArray(duplicate.matches)) return duplicate;
  const matches = duplicate.matches.filter((match) => repositoryEvidenceMatches(match, repositoryContext, { requireEvidence: true }).ok).map((match) => bindIssueEvidence(match, repositoryContext));
  if (matches.length === duplicate.matches.length) return { ...duplicate, matches, repositorySlug: repositoryContext.repositorySlug };
  if (matches.length > 0) return { ...duplicate, matches, repositorySlug: repositoryContext.repositorySlug, ignoredOtherRepositoryMatches: duplicate.matches.length - matches.length };
  if (["reuse", "reuse_completed_evidence"].includes(duplicate.action)) {
    return { ok: true, action: "none", reason: "repository_scoped_duplicate_not_found", matches: [], ignoredOtherRepositoryMatches: duplicate.matches.length, repositorySlug: repositoryContext.repositorySlug };
  }
  return { ...duplicate, matches, repositorySlug: repositoryContext.repositorySlug, ignoredOtherRepositoryMatches: duplicate.matches.length };
}

function repositoryEvidenceMatches(item = {}, repositoryContext = {}, options = {}) {
  const evidenceSlug = normalizeRepositorySlug(
    item.repositorySlug ||
      item.repository?.nameWithOwner ||
      item.repository?.slug ||
      item.repository?.fullName ||
      item.repository?.full_name ||
      repositorySlugFromGithubUrl(item.url),
  );
  if (options.requireEvidence && !evidenceSlug && !item.repositoryId && !item.repository?.id) return { ok: false, reason: "issue_repository_evidence_missing" };
  if (evidenceSlug && evidenceSlug !== repositoryContext.repositorySlug) return { ok: false, reason: "issue_repository_mismatch", observedRepositorySlug: evidenceSlug };
  const evidenceId = item.repositoryId || item.repository?.id || null;
  if (evidenceId && repositoryContext.repositoryId && evidenceId !== repositoryContext.repositoryId) return { ok: false, reason: "issue_repository_id_mismatch", observedRepositoryId: evidenceId };
  const observedIssueNumber = normalizeIssueNumber(item.number);
  const expectedIssueNumber = normalizeIssueNumber(options.expectedIssueNumber);
  if (expectedIssueNumber && observedIssueNumber && observedIssueNumber !== expectedIssueNumber) {
    return { ok: false, reason: "issue_number_mismatch", observedIssueNumber, expectedIssueNumber };
  }
  return { ok: true };
}

function sameRepositoryIssue(issue = {}, repositoryContext = {}) {
  return repositoryEvidenceMatches(issue, repositoryContext).ok;
}

function bindIssueEvidence(issue = {}, repositoryContext = {}) {
  return {
    ...issue,
    repositorySlug: issue.repositorySlug || repositoryContext.repositorySlug,
    repositoryId: issue.repositoryId || repositoryContext.repositoryId || null,
  };
}

export function parseIssueUrl(url, repositorySlug) {
  const canonicalRepositorySlug = normalizeRepositorySlug(repositorySlug);
  if (!canonicalRepositorySlug) return { ok: false, reason: "issue_url_repository_slug_malformed" };
  const rawUrl = String(url || "").trim();
  if (!rawUrl || rawUrl !== String(url || "") || hasControlCharacter(rawUrl)) {
    return { ok: false, reason: "issue_create_output_repository_mismatch_or_malformed" };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "issue_create_output_repository_mismatch_or_malformed" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "issue_url_protocol_unsupported" };
  if (parsed.hostname.toLowerCase() !== "github.com") return { ok: false, reason: "issue_url_host_unsupported" };
  if (parsed.username || parsed.password) return { ok: false, reason: "issue_url_credentials_forbidden" };
  if (parsed.port) return { ok: false, reason: "issue_url_port_forbidden" };
  if (parsed.search) return { ok: false, reason: "issue_url_query_forbidden" };
  if (parsed.hash) return { ok: false, reason: "issue_url_fragment_forbidden" };

  const rawSegments = parsed.pathname.split("/");
  if (rawSegments.length !== 5 || rawSegments[0] !== "") {
    return { ok: false, reason: "issue_create_output_repository_mismatch_or_malformed" };
  }
  const [rawOwner, rawRepo, rawType, rawNumber] = rawSegments.slice(1);
  const decoded = [rawOwner, rawRepo, rawType, rawNumber].map((segment) => decodePathSegment(segment));
  if (decoded.some((segment) => !segment.ok)) {
    return { ok: false, reason: "issue_create_output_repository_mismatch_or_malformed" };
  }
  const [owner, repo, type, numberSegment] = decoded.map((segment) => segment.value);
  const [expectedOwner, expectedRepo] = canonicalRepositorySlug.split("/");
  if (owner.toLowerCase() !== expectedOwner.toLowerCase() || repo.toLowerCase() !== expectedRepo.toLowerCase()) {
    return { ok: false, reason: "issue_create_output_repository_mismatch_or_malformed" };
  }
  if (type !== "issues") return { ok: false, reason: "issue_create_output_repository_mismatch_or_malformed" };
  if (rawNumber !== numberSegment) return { ok: false, reason: "issue_create_output_number_malformed" };
  if (!isDecimalDigits(numberSegment)) return { ok: false, reason: "issue_create_output_number_malformed" };
  const number = normalizeIssueNumber(numberSegment);
  if (!number) return { ok: false, reason: "issue_create_output_number_malformed" };
  return {
    ok: true,
    repositorySlug: canonicalRepositorySlug,
    canonicalRepositorySlug,
    host: "github.com",
    number: Number(number),
    issueNumber: Number(number),
    canonicalUrl: `https://github.com/${canonicalRepositorySlug}/issues/${Number(number)}`,
    parsedAt: new Date().toISOString(),
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

function normalizeGithubHost(value) {
  const host = String(value || "").trim().toLowerCase();
  if (!host || /[\s\x00-\x1F\x7F]/.test(host) || host.includes("/") || host.includes("@") || host.startsWith("-")) return null;
  return host;
}

function normalizeRepositorySlug(value) {
  const slug = String(value || "");
  if (!slug || slug !== slug.trim()) return null;
  if (/[\s\x00-\x1F\x7F]/.test(slug) || slug.startsWith("-") || slug.includes("://") || slug.includes("@") || slug.includes(":")) return null;
  const parts = slug.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [owner, name] = parts;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$/.test(owner)) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === "." || name === ".." || name.startsWith("-")) return null;
  if (/github\.com/i.test(owner) || /github\.com/i.test(name)) return null;
  return `${owner}/${name}`;
}

function repositorySlugFromGithubUrl(value) {
  const text = String(value || "").trim();
  const match = text.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/(?:pull|issues)\/\d+(?:[/?#].*)?$/i);
  if (!match) return null;
  return normalizeRepositorySlug(`${match[1]}/${match[2]}`);
}

function decodePathSegment(segment) {
  if (!segment || hasControlCharacter(segment) || hasEncodedForbiddenPathScalar(segment)) {
    return { ok: false };
  }
  let decoded;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return { ok: false };
  }
  if (!decoded || hasControlCharacter(decoded) || decoded.includes("/") || decoded.includes("\\") || decoded === "." || decoded === "..") {
    return { ok: false };
  }
  return { ok: true, value: decoded };
}

function hasEncodedForbiddenPathScalar(value) {
  const lower = String(value || "").toLowerCase();
  return lower.includes("%2f") || lower.includes("%5c") || lower.includes("%2e");
}

function hasControlCharacter(value) {
  for (const char of String(value || "")) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isDecimalDigits(value) {
  const text = String(value || "");
  if (!text) return false;
  for (const char of text) {
    if (char < "0" || char > "9") return false;
  }
  return true;
}

function normalizeIssueNumber(issueNumber) {
  const number = typeof issueNumber === "number" ? issueNumber : Number(issueNumber);
  if (!Number.isSafeInteger(number) || number <= 0 || number > 999_999_999) return null;
  return String(number);
}

function labelNames(labels = []) {
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
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
