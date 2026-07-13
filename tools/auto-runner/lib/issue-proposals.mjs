import { createHash } from "node:crypto";
import { parseAutoRunnerContract, classifyIssueLane, getValidationProfile } from "./lane-policy.mjs";

export const proposalSchemaVersion = 1;

export const proposalKinds = Object.freeze([
  "implementation",
  "review_fix",
  "ci_fix",
  "security_fix",
  "blocker",
  "cleanup",
  "follow_up",
  "future_gate",
  "ledger_reconciliation",
]);

const proposalKindSet = new Set(proposalKinds);
const allowedLabels = new Set([
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
const transientLabels = new Set(["auto-claimed", "auto-running", "auto-pr-opened", "auto-failed"]);
const boundedIdPattern = /^[a-z][a-z0-9._:-]{1,120}$/;
const safeLabelPattern = /^[A-Za-z0-9][A-Za-z0-9:_ .-]{0,80}$/;
const safeTitlePattern = /^[^\r\n`$<>]{8,180}$/;
const unsafeTextPattern =
  /(?:^|\s)(?:bash|sh|pwsh|powershell|cmd|node|npm|npx|curl|wget|git|docker|kubectl|ssh|scp|rm|sudo|chmod|chown)(?:\s|$)|[`$<>]|&&|\|\||;/i;
const secretPattern =
  /(?:GEMINI_API_KEY|authorization|x-goog-api-key|bearer\s+[A-Za-z0-9._~+/-]+|api[_-]?key\s*[:=]|secret\s*[:=]|token\s*[:=]|password\s*[:=])/i;
const maxEvidenceItemsPerSource = 50;

export function deriveIssueProposals(event = {}, options = {}) {
  const normalized = normalizeEvent(event);
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason, proposals: [], manualTriage: [] };
  }
  const proposals = [];
  if (normalized.event.type === "merged_design_pr") {
    const slices = boundedArray(normalized.event.implementationSlices, 4).slice(0, 4);
    const selected = slices.length >= 2 ? slices : defaultImplementationSlices(normalized.event);
    for (const slice of selected.slice(0, 4)) {
      proposals.push(
        buildProposal({
          kind: "implementation",
          source: normalized.event,
          title: slice.title,
          summary: slice.summary || slice.objective || `Implement ${slice.title}.`,
          workType: slice.workType || "feature",
          domain: slice.domain || normalized.event.domain || "workflow",
          allowedPaths: slice.allowedPaths || normalized.event.allowedPaths,
          validationProfile: slice.validationProfile || normalized.event.validationProfile || "runner-tests",
          reviewerTier: slice.reviewerTier || normalized.event.reviewerTier || "cheap_independent",
          labels: slice.labels || ["area:infra", "type:feature", "workflow", "auto-ready"],
          relatedIssues: slice.relatedIssues || normalized.event.relatedIssues || [],
          parentIssue: slice.parentIssue || normalized.event.parentIssue || null,
          closeRule: slice.closeRule || "Close after a merged PR proves the scoped implementation and required gates.",
        }),
      );
    }
  }
  if (["review_failure", "ci_failure", "security_failure"].includes(normalized.event.type)) {
    const kind =
      normalized.event.type === "review_failure"
        ? "review_fix"
        : normalized.event.type === "ci_failure"
          ? "ci_fix"
          : "security_fix";
    proposals.push(
      buildProposal({
        kind,
        source: normalized.event,
        title: normalized.event.title || focusedTitle(kind, normalized.event),
        summary: normalized.event.summary || normalized.event.finding || `Resolve ${kind.replace("_", " ")} evidence.`,
        workType: kind === "security_fix" ? "hardening" : "fix",
        domain: normalized.event.domain || "workflow",
        allowedPaths: normalized.event.allowedPaths,
        validationProfile: normalized.event.validationProfile || "runner-tests",
        reviewerTier: kind === "security_fix" ? "strong_independent" : normalized.event.reviewerTier || "cheap_independent",
        labels: normalized.event.labels || ["area:infra", kind === "cleanup" ? "type:chore" : "type:bug", "workflow", "auto-ready"],
        relatedIssues: normalized.event.relatedIssues || [],
        parentIssue: normalized.event.parentIssue || null,
        closeRule: "Close after exact-head validation/review/CI proves the focused fix.",
      }),
    );
  }
  if (normalized.event.type === "manual_decision") {
    proposals.push(
      buildProposal({
        kind: "blocker",
        source: normalized.event,
        title: normalized.event.title || "Manual decision required for auto-runner work",
        summary: normalized.event.summary || "A genuine unresolved human decision blocks automatic implementation.",
        workType: "decision",
        domain: normalized.event.domain || "workflow",
        allowedPaths: normalized.event.allowedPaths || ["docs/planning/**"],
        validationProfile: normalized.event.validationProfile || "docs-only",
        reviewerTier: "strong_independent",
        labels: ["area:infra", "workflow", "manual-gate", "needs-tommy"],
        manualDecisions: normalized.event.manualDecisions || [{ reason: normalized.event.reason || "manual_decision_required" }],
        closeRule: "Close only after the human decision is recorded and converted into runnable work if needed.",
      }),
    );
  }
  if (normalized.event.type === "future_gate") {
    proposals.push(
      buildProposal({
        kind: "future_gate",
        source: normalized.event,
        title: normalized.event.title || "Future gate for deferred auto-runner work",
        summary: normalized.event.summary || "Deferred gated work that must not run in the current foundation bundle.",
        workType: "gate",
        domain: normalized.event.domain || "workflow",
        allowedPaths: normalized.event.allowedPaths || ["docs/planning/**"],
        validationProfile: normalized.event.validationProfile || "docs-only",
        reviewerTier: "strong_independent",
        labels: ["area:infra", "workflow"],
        dependencies: normalized.event.dependencies || [],
        closeRule: "Close only when the future gate is explicitly satisfied.",
      }),
    );
  }
  if (normalized.event.type === "ledger_reconciliation") {
    proposals.push(
      buildProposal({
        kind: "ledger_reconciliation",
        source: normalized.event,
        title: normalized.event.title || "Reconcile issue progress ledger after merge",
        summary: normalized.event.summary || "Update planning ledger through a runner-owned docs branch/PR.",
        workType: "docs",
        domain: "docs-planning",
        allowedPaths: ["docs/planning/ISSUE_PROGRESS_LEDGER.md"],
        validationProfile: "docs-only",
        reviewerTier: "cheap_independent",
        labels: ["area:infra", "type:chore", "workflow", "auto-ready"],
        closeRule: "Close after merged docs PR records exact merge evidence in the ledger.",
      }),
    );
  }
  const validated = proposals.map((proposal) => validateIssueProposal(proposal, options));
  const invalid = validated.find((result) => !result.ok);
  if (invalid) return { ok: false, reason: invalid.reason, proposals: [], invalid };
  return { ok: true, proposals: validated.map((result) => result.proposal), manualTriage: [] };
}

export function validateIssueProposal(proposal = {}, options = {}) {
  const errors = [];
  const labels = Array.isArray(proposal.proposedLabels) ? proposal.proposedLabels : [];
  const contractBody = renderAutoRunnerContract(proposal.autoRunnerContract || {});
  const parsedContract = parseAutoRunnerContract(contractBody);
  const laneDecision = parsedContract.ok
    ? classifyIssueLane({
        number: 0,
        title: proposal.title || "Generated proposal",
        body: contractBody,
        labels: labels.filter((label) => label === "auto-ready" || label === "auto-bundle"),
      })
    : null;

  if (proposal.schemaVersion !== proposalSchemaVersion) errors.push("schema_version_unsupported");
  if (!proposalKindSet.has(proposal.kind)) errors.push("kind_unsupported");
  if (typeof proposal.correlationKey !== "string" || !boundedIdPattern.test(proposal.correlationKey)) {
    errors.push("correlation_key_invalid");
  }
  if (proposal.idempotencyKey && proposal.idempotencyKey !== digestProposal(proposal)) {
    errors.push("idempotency_key_mismatch");
  }
  if (typeof proposal.title !== "string" || !safeTitlePattern.test(proposal.title) || unsafeTextPattern.test(proposal.title)) {
    errors.push("title_invalid");
  }
  for (const unsafeField of unsafeProposalTextFields(proposal)) {
    errors.push(`text_unsafe:${unsafeField}`);
  }
  if (containsSecret(proposal)) errors.push("secret_like_value");
  for (const requiredReading of proposal.requiredReading || []) {
    if (!isSafeRepoPath(requiredReading)) errors.push(`required_reading_invalid:${requiredReading}`);
  }
  for (const requiredReading of proposal.autoRunnerContract?.requiredReading || []) {
    if (!isSafeRepoPath(requiredReading)) errors.push(`contract_required_reading_invalid:${requiredReading}`);
  }
  if (!Array.isArray(proposal.allowedPaths) || proposal.allowedPaths.length === 0) errors.push("allowed_paths_missing");
  for (const allowedPath of proposal.allowedPaths || []) {
    if (!isSafeRepoGlob(allowedPath)) errors.push(`allowed_path_invalid:${allowedPath}`);
  }
  if (!getValidationProfile(proposal.validationProfile)) errors.push("validation_profile_unknown");
  for (const label of labels) {
    if (!safeLabelPattern.test(label) || transientLabels.has(label)) errors.push(`label_invalid:${label}`);
    if (options.strictKnownLabels !== false && !allowedLabels.has(label)) errors.push(`label_unknown:${label}`);
  }
  if (!parsedContract.ok) errors.push(`contract_invalid:${parsedContract.reason}`);
  if (laneDecision && !laneDecision.allowedToImplement && proposal.kind !== "blocker" && !hasManualDecision(proposal)) {
    errors.push(`contract_not_runnable:${laneDecision.reason}`);
  }
  if (laneDecision && proposal.kind !== "blocker" && !hasManualDecision(proposal) && !reviewerTierMeetsLane(proposal.reviewerTier, laneDecision.reviewerTier)) {
    errors.push(`reviewer_tier_weaker_than_lane:${proposal.reviewerTier || "missing"}:${laneDecision.reviewerTier || "missing"}`);
  }
  if (proposal.autoRunnerContract?.bundle && !labels.includes("auto-bundle")) {
    errors.push("bundle_contract_without_auto_bundle_label");
  }
  for (const invalidBundlePath of invalidBundlePaths(proposal.autoRunnerContract?.bundle)) {
    errors.push(invalidBundlePath);
  }
  const manualLabels = labels.filter((label) => label === "manual-gate" || label === "needs-tommy");
  if (manualLabels.length > 0 && !hasManualDecision(proposal)) errors.push("manual_label_without_genuine_decision");
  if (hasManualDecision(proposal) && manualLabels.length === 0) errors.push("manual_decision_without_manual_label");
  if (proposal.kind === "future_gate" && hasManualDecision(proposal)) errors.push("future_gate_must_not_be_manual_decision");

  if (errors.length > 0) return { ok: false, reason: errors[0], errors, proposal };
  const normalized = normalizeProposal(proposal);
  return { ok: true, proposal: { ...normalized, idempotencyKey: digestProposal(normalized), laneDecision } };
}

export function searchDuplicateEvidence(proposal = {}, evidence = {}, options = {}) {
  const correlationKey = proposal.correlationKey;
  const digest = proposal.idempotencyKey || digestProposal(proposal);
  if (!correlationKey) return { ok: false, action: "block", reason: "proposal_correlation_missing", matches: [] };
  if (evidence.fail) {
    return { ok: false, action: "block", reason: "evidence_search_failed", failures: evidence.failures || ["fixture_failure"] };
  }
  const sources = flattenEvidence(evidence);
  const exact = [];
  const completed = [];
  const incompleteClosed = [];
  const ambiguous = [];
  for (const item of sources) {
    const text = searchableText(item);
    const hasExactCorrelation = markerMatches(text, correlationKey) || markerMatches(text, digest);
    const hasNearTitle = normalizeTitle(item.title || "").includes(normalizeTitle(proposal.title || "")) && normalizeTitle(proposal.title || "").length > 0;
    const hasNearIssueNumber = nearIssueNumberOnly(text, proposal);
    if (hasNearIssueNumber && !hasExactCorrelation) continue;
    if (hasExactCorrelation) {
      const normalized = { ...item, matchType: "exact_correlation" };
      if (String(item.state || "").toUpperCase() === "CLOSED" && completedState(item)) completed.push(normalized);
      else if (String(item.state || "").toUpperCase() === "CLOSED") incompleteClosed.push(normalized);
      else exact.push(normalized);
    } else if (hasNearTitle) {
      ambiguous.push({ ...item, matchType: "title_near_match" });
    }
  }
  if (exact.length === 1) return { ok: true, action: "reuse", reason: "exact_open_duplicate", matches: exact };
  if (exact.length > 1) return { ok: false, action: "manual_triage", reason: "ambiguous_exact_duplicates", matches: exact };
  if (completed.length > 0) return { ok: true, action: "reuse_completed_evidence", reason: "completed_duplicate", matches: completed };
  if (incompleteClosed.length > 0) {
    return { ok: false, action: "manual_triage", reason: "closed_incomplete_duplicate_requires_classification", matches: incompleteClosed };
  }
  if (ambiguous.length > 0) return { ok: false, action: "manual_triage", reason: "ambiguous_near_matches", matches: ambiguous.slice(0, 5) };
  return { ok: true, action: "create", reason: "no_duplicate_found", matches: [] };
}

export function validateModelProposalOutput(output, options = {}) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { ok: false, reason: "model_output_not_object" };
  }
  const allowed = new Set(["schemaVersion", "proposals"]);
  const unknown = Object.keys(output).filter((key) => !allowed.has(key));
  if (unknown.length > 0) return { ok: false, reason: `model_output_unknown_field:${unknown[0]}` };
  if (output.schemaVersion !== proposalSchemaVersion) return { ok: false, reason: "model_output_schema_unsupported" };
  if (!Array.isArray(output.proposals) || output.proposals.length > 4) return { ok: false, reason: "model_output_proposals_invalid" };
  const validated = [];
  for (const proposal of output.proposals) {
    const result = validateIssueProposal(proposal, options);
    if (!result.ok) return { ok: false, reason: `proposal_invalid:${result.reason}`, result };
    validated.push(result.proposal);
  }
  return { ok: true, proposals: validated };
}

export function digestProposal(proposal = {}) {
  const stable = normalizeProposal({
    ...proposal,
    idempotencyKey: undefined,
    laneDecision: undefined,
  });
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 48);
}

export function renderProposalIssueBody(proposal = {}) {
  const metadata = [
    `Parent: ${proposal.parentIssue ? `#${proposal.parentIssue}` : "none"}. Related: ${(proposal.relatedIssues || []).map((n) => `#${n}`).join(", ") || "none"}.`,
    "",
    `Correlation key: \`${proposal.correlationKey}\``,
    `Idempotency key: \`${proposal.idempotencyKey || digestProposal(proposal)}\``,
    `Proposal kind: \`${proposal.kind}\``,
    `Work type/domain: ${proposal.workType} / ${proposal.domain}.`,
    `Day scope: ${proposal.dayScope}. Priority: ${proposal.priority}. Estimate: ${proposal.estimate}; confidence ${proposal.confidence}.`,
    `Reviewer tier: \`${proposal.reviewerTier}\`. Validation profile: \`${proposal.validationProfile}\`.`,
    "",
    "## Summary",
    "",
    proposal.summary,
    "",
    "## Scope",
    "",
    ...(proposal.scope || []).map((item) => `- ${item}`),
    "",
    "## Non-goals",
    "",
    ...(proposal.nonGoals || []).map((item) => `- ${item}`),
    "",
    "## Architecture guardrails",
    "",
    ...(proposal.architectureGuardrails || []).map((item) => `- ${item}`),
    "",
    "## Required reading",
    "",
    ...(proposal.requiredReading || []).map((item) => `- \`${item}\``),
    "",
    "## Manual decisions/actions",
    "",
    ...(proposal.manualDecisions?.length ? proposal.manualDecisions.map((item) => `- ${item.reason || item}`) : ["- none"]),
    "",
    "## Acceptance criteria",
    "",
    ...(proposal.acceptanceCriteria || []).map((item) => `- ${item}`),
    "",
    "## Close rule",
    "",
    proposal.closeRule,
    "",
    "## Auto-runner contract",
    "",
    "```json",
    JSON.stringify(proposal.autoRunnerContract, null, 2),
    "```",
  ];
  return metadata.join("\n");
}

function buildProposal(input) {
  const source = input.source || {};
  const correlationKey = normalizeCorrelationKey(
    input.correlationKey ||
      [
        "settleora",
        "generated-work",
        input.kind,
        source.taskKey || source.runId || "unknown-run",
        source.prNumber ? `pr-${source.prNumber}` : null,
        source.issueNumber ? `issue-${source.issueNumber}` : null,
        input.title,
      ]
        .filter(Boolean)
        .join(":"),
  );
  const allowedPaths = input.allowedPaths || ["tools/auto-runner/**"];
  const contract = {
    contractVersion: 1,
    lane:
      input.domain === "docs-planning" || allowedPaths.every((allowedPath) => String(allowedPath).startsWith("docs/planning/"))
        ? "docs-planning"
        : "workflow-docs-tooling",
    allowedPaths,
    validationProfile: input.validationProfile,
    manualMergeRequired: true,
    autoMergeEligible: false,
    requiredReading: input.requiredReading || ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md", "tools/auto-runner/README.md"],
  };
  const proposal = normalizeProposal({
    schemaVersion: proposalSchemaVersion,
    kind: input.kind,
    correlationKey,
    sourceReferences: normalizeSourceReferences(source),
    parentIssue: input.parentIssue || source.parentIssue || null,
    relatedIssues: uniqueNumbers([...(input.relatedIssues || []), ...(source.relatedIssues || [])]),
    title: input.title,
    summary: input.summary,
    workType: input.workType,
    domain: input.domain,
    dayScope: input.dayScope || "Day 1 workflow automation foundation",
    priority: input.priority || "P1",
    estimate: input.estimate || "M",
    confidence: input.confidence || "medium",
    dependencies: input.dependencies || [],
    blockers: input.blockers || [],
    requiredReading: contract.requiredReading,
    scope: input.scope || [input.summary],
    nonGoals: input.nonGoals || ["No product runtime changes.", "No secrets or deployment changes."],
    architectureGuardrails: input.architectureGuardrails || [
      "Repository defaults remain fail-closed.",
      "Generated work must pass lane, contract, path, label, validation, review, CI, and exact-head gates.",
    ],
    allowedPaths: contract.allowedPaths,
    pathStrategy: input.pathStrategy || "bounded repo-relative globs validated against the lane manifest",
    validationProfile: contract.validationProfile,
    reviewerTier: input.reviewerTier,
    codexReviewRequired: true,
    ciSecurityExactHeadGates: ["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"],
    manualDecisions: input.manualDecisions || [],
    acceptanceCriteria: input.acceptanceCriteria || ["Merged PR proves the scoped work and evidence gates."],
    closeRule: input.closeRule,
    autoRunnerContract: contract,
    proposedLabels: uniqueStrings(input.labels || []),
    projectStatusIntent: input.projectStatusIntent || { status: "Ready for Codex", supported: false },
  });
  return { ...proposal, idempotencyKey: digestProposal(proposal) };
}

function normalizeEvent(event = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return { ok: false, reason: "event_not_object" };
  if (containsSecret(event)) return { ok: false, reason: "event_contains_secret_like_value" };
  if (containsUnsafeText(event.title) || containsUnsafeText(event.summary) || containsUnsafeText(event.finding)) {
    return { ok: false, reason: "event_contains_executable_text" };
  }
  return { ok: true, event };
}

function normalizeProposal(proposal = {}) {
  return canonicalize({
    ...proposal,
    sourceReferences: proposal.sourceReferences || {},
    relatedIssues: uniqueNumbers(proposal.relatedIssues || []),
    dependencies: proposal.dependencies || [],
    blockers: proposal.blockers || [],
    requiredReading: uniqueStrings(proposal.requiredReading || []),
    scope: uniqueStrings(proposal.scope || []),
    nonGoals: uniqueStrings(proposal.nonGoals || []),
    architectureGuardrails: uniqueStrings(proposal.architectureGuardrails || []),
    allowedPaths: uniqueStrings(proposal.allowedPaths || []),
    ciSecurityExactHeadGates: uniqueStrings(proposal.ciSecurityExactHeadGates || []),
    manualDecisions: Array.isArray(proposal.manualDecisions) ? proposal.manualDecisions : [],
    acceptanceCriteria: uniqueStrings(proposal.acceptanceCriteria || []),
    proposedLabels: uniqueStrings(proposal.proposedLabels || []),
  });
}

function renderAutoRunnerContract(contract) {
  return `## Auto-runner contract\n\n\`\`\`json\n${JSON.stringify(contract, null, 2)}\n\`\`\`\n`;
}

function flattenEvidence(evidence = {}) {
  const output = [];
  const pushItems = (source, items) => {
    for (const item of boundedArray(items, maxEvidenceItemsPerSource)) {
      if (item && typeof item === "object") output.push({ ...item, source });
    }
  };
  pushItems("issues.open", evidence.openIssues);
  pushItems("issues.closed", evidence.closedIssues);
  pushItems("prs.open", evidence.openPrs);
  pushItems("prs.merged", evidence.mergedPrs);
  pushItems("comments", evidence.comments);
  pushItems("reviews", evidence.reviews);
  pushItems("reports", evidence.reports);
  pushItems("summaries", evidence.summaries);
  pushItems("events", evidence.events);
  pushItems("ledger", evidence.ledgerEntries);
  pushItems("correlation", evidence.correlationState);
  return output;
}

function searchableText(item = {}) {
  return [
    item.title,
    item.body,
    item.text,
    item.summary,
    item.comment,
    item.correlationKey,
    item.idempotencyKey,
    ...(Array.isArray(item.labels) ? item.labels : []),
  ]
    .filter(Boolean)
    .join("\n");
}

function markerMatches(text, marker) {
  const escaped = String(marker || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`).test(text || "");
}

function nearIssueNumberOnly(text, proposal) {
  const issueNumbers = uniqueNumbers([proposal.parentIssue, ...(proposal.relatedIssues || [])]);
  if (issueNumbers.length === 0) return false;
  const nearNumbers = [...String(text || "").matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
  return nearNumbers.some((number) => issueNumbers.some((expected) => Math.abs(expected - number) === 1));
}

function completedState(item = {}) {
  const text = searchableText(item);
  return /\b(completed|merged|closed as completed|closed_completed)\b/i.test(text) || item.reason === "completed";
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function defaultImplementationSlices(event) {
  const base = event.title || "generated implementation";
  return [
    { title: `${base}: implementation slice`, summary: "Implement the reviewed design/planning work.", allowedPaths: event.allowedPaths },
    { title: `${base}: validation slice`, summary: "Add focused validation and documentation evidence.", allowedPaths: event.allowedPaths },
  ];
}

function focusedTitle(kind, event) {
  const label = kind.replace("_", " ");
  return `${label}: ${event.checkName || event.ruleId || event.prNumber || "auto-runner evidence"}`;
}

function normalizeSourceReferences(source = {}) {
  return canonicalize({
    sourceIssue: source.issueNumber || null,
    sourcePr: source.prNumber || null,
    sourceReport: source.reportPath || null,
    sourceRun: source.runId || null,
    sourceEvent: source.eventId || source.type || null,
    taskKey: source.taskKey || null,
    mergeSha: source.mergeSha || null,
  });
}

function normalizeCorrelationKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function isSafeRepoGlob(value) {
  const text = String(value || "");
  if (text.length === 0 || text.length > 240) return false;
  if (text.startsWith("/") || text.includes("\\") || text.includes("..") || text.includes("//")) return false;
  if (/[\0\r\n`$<>|;&]/.test(text)) return false;
  return /^[A-Za-z0-9._*?/!-]+$/.test(text);
}

function isSafeRepoPath(value) {
  const text = String(value || "");
  if (text.length === 0 || text.length > 240) return false;
  if (text.startsWith("/") || text.includes("\\") || text.includes("..") || text.includes("//")) return false;
  if (/[\0\r\n`$<>|;&*?{}()[\]]/.test(text)) return false;
  return /^[A-Za-z0-9._/!-]+$/.test(text);
}

function invalidBundlePaths(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) return errors;
  if (Array.isArray(bundle.slices)) {
    bundle.slices.forEach((slice, index) => {
      if (!slice || typeof slice !== "object" || Array.isArray(slice)) return;
      for (const allowedPath of slice.allowedPaths || []) {
        if (!isSafeRepoGlob(allowedPath)) errors.push(`bundle_allowed_path_invalid:${index}:${allowedPath}`);
      }
      for (const requiredReading of slice.requiredReading || []) {
        if (!isSafeRepoPath(requiredReading)) errors.push(`bundle_required_reading_invalid:${index}:${requiredReading}`);
      }
    });
  }
  return errors;
}

function reviewerTierMeetsLane(proposalTier, laneTier) {
  const rank = {
    cheap_independent: 1,
    strong_independent: 2,
    tie_breaker: 3,
    codex_mechanics: 1,
    split_or_escalate: 4,
  };
  const required = rank[laneTier] || 1;
  const actual = rank[proposalTier] || 0;
  return actual >= required;
}

function hasManualDecision(proposal = {}) {
  return Array.isArray(proposal.manualDecisions) && proposal.manualDecisions.length > 0;
}

function containsUnsafeText(value) {
  return typeof value === "string" && unsafeTextPattern.test(value);
}

function unsafeProposalTextFields(proposal = {}) {
  const fields = [];
  const check = (name, value) => {
    if (containsUnsafeText(value)) fields.push(name);
  };
  const checkArray = (name, values) => {
    if (!Array.isArray(values)) return;
    values.forEach((value, index) => check(`${name}[${index}]`, value));
  };
  check("summary", proposal.summary);
  check("workType", proposal.workType);
  check("domain", proposal.domain);
  check("dayScope", proposal.dayScope);
  check("priority", proposal.priority);
  check("estimate", proposal.estimate);
  check("confidence", proposal.confidence);
  check("pathStrategy", proposal.pathStrategy);
  check("validationProfile", proposal.validationProfile);
  check("reviewerTier", proposal.reviewerTier);
  check("closeRule", proposal.closeRule);
  checkArray("scope", proposal.scope);
  checkArray("nonGoals", proposal.nonGoals);
  checkArray("architectureGuardrails", proposal.architectureGuardrails);
  checkArray("requiredReading", proposal.requiredReading);
  checkArray("dependencies", proposal.dependencies);
  checkArray("blockers", proposal.blockers);
  checkArray("ciSecurityExactHeadGates", proposal.ciSecurityExactHeadGates);
  checkArray("acceptanceCriteria", proposal.acceptanceCriteria);
  if (Array.isArray(proposal.manualDecisions)) {
    proposal.manualDecisions.forEach((decision, index) => {
      if (typeof decision === "string") check(`manualDecisions[${index}]`, decision);
      else if (decision && typeof decision === "object") {
        for (const [key, value] of Object.entries(decision)) {
          check(`manualDecisions[${index}].${key}`, value);
        }
      }
    });
  }
  if (proposal.projectStatusIntent && typeof proposal.projectStatusIntent === "object") {
    for (const [key, value] of Object.entries(proposal.projectStatusIntent)) {
      check(`projectStatusIntent.${key}`, value);
    }
  }
  collectUnsafeObjectText("autoRunnerContract", proposal.autoRunnerContract, fields);
  return fields;
}

function collectUnsafeObjectText(prefix, value, fields) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (containsUnsafeText(value)) fields.push(prefix);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUnsafeObjectText(`${prefix}[${index}]`, item, fields));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collectUnsafeObjectText(`${prefix}.${key}`, item, fields);
    }
  }
}

function containsSecret(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return secretPattern.test(value);
  if (Array.isArray(value)) return value.some(containsSecret);
  if (typeof value === "object") return Object.values(value).some(containsSecret);
  return false;
}

function boundedArray(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort();
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].sort(
    (a, b) => a - b,
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}
