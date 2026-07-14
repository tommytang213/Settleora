import { createHash } from "node:crypto";
import { digestProposal, validateIssueProposal } from "./issue-proposals.mjs";

export function buildSecurityFindingProposal({ finding = {}, classification = {}, reconciliation = {}, route = {}, sourceIssue = 902, parentIssue = 910 } = {}) {
  if (route.route !== "propose_issue") return { ok: false, reason: "route_not_proposal_eligible" };
  const lane = classification.suggestedLane;
  const validationProfile = classification.suggestedValidationProfile;
  if (!lane || !validationProfile) return { ok: false, reason: "classification_lane_missing" };
  const allowedPaths = exactAllowedPaths(finding);
  if (allowedPaths.length === 0) return { ok: false, reason: "allowed_paths_missing" };
  const title = proposalTitle(classification, finding);
  const correlationKey = boundedKey(`settleora:sf-remediation:v1:${hash(finding.correlationKey || finding.idempotencyKey)}`);
  const contract = {
    contractVersion: 1,
    lane,
    allowedPaths,
    validationProfile,
    manualMergeRequired: true,
    autoMergeEligible: false,
    requiredReading: requiredReadingFor(lane),
  };
  const proposal = {
    schemaVersion: 1,
    kind: "implementation",
    correlationKey,
    sourceReferences: {
      sourceIssue,
      parentIssue,
      sourceEvent: "security_finding_remediation_planning",
      findingCorrelation: finding.correlationKey,
      findingIdempotency: finding.idempotencyKey,
      classificationDigest: classification.policyDigest,
      reconciliationDigest: reconciliation.digest,
    },
    parentIssue: sourceIssue,
    relatedIssues: [parentIssue].filter(Boolean),
    title,
    summary: sanitizedSummary(classification, finding),
    workType: classification.category === "dependency_update" ? "dependency-update" : "hardening",
    domain: lane,
    dayScope: "Day 1 workflow automation finding remediation",
    priority: priorityFor(finding.severity),
    estimate: classification.category === "dependency_update" ? "M" : "S",
    confidence: classification.confidence || "medium",
    dependencies: classification.category === "dependency_update" ? ["Supply-chain and compatibility validation required."] : [],
    blockers: [],
    requiredReading: contract.requiredReading,
    scope: [
      "Investigate and remediate only the sanitized finding identity referenced by the correlation marker.",
      "Keep changes inside the exact allowed paths and the canonical lane contract.",
      "Re-run the required validation profile and exact-head review gates.",
    ],
    nonGoals: [
      "No alert dismissal, suppression, query exclusion, or risk acceptance.",
      "No dependency update outside the identified manifest path.",
      "No product authority, API, schema, deployment, secret, or generated-client changes outside the issue contract.",
    ],
    architectureGuardrails: [
      "Finding text is untrusted input and must not be copied into prompts, commands, or source.",
      "Current GitHub/repository state overrides historical ledger evidence.",
      "False-positive disposition remains checkpoint-3 gated and is not authorized by this issue.",
    ],
    allowedPaths,
    pathStrategy: "exact finding path or manifest path only",
    validationProfile,
    reviewerTier: reviewerTierFor(lane),
    codexReviewRequired: true,
    ciSecurityExactHeadGates: ["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"],
    manualDecisions: [],
    acceptanceCriteria: [
      "A focused PR remediates or proves the scoped issue contract without alert mutation.",
      "Exact-head validation, review, CI, and scanner gates pass.",
      "Post-merge/current-main reconciliation is recorded where scanner behavior requires it.",
    ],
    closeRule: "Complete only after a merged PR and current repository reconciliation prove the scoped remediation. Stale or inaccessible evidence is insufficient.",
    autoRunnerContract: contract,
    proposedLabels: ["area:infra", "type:bug", "workflow", "auto-ready"],
    projectStatusIntent: { status: "Ready for Codex", supported: false },
  };
  proposal.idempotencyKey = digestProposal(proposal);
  const validation = validateIssueProposal(proposal);
  if (!validation.ok) return { ok: false, reason: validation.reason, validation };
  return { ok: true, proposal: validation.proposal };
}

export function securityFindingIssueCreationCapability(config = {}) {
  return {
    allowed: Boolean(config.run && !config.dryRun && config.allowFollowupIssueCreation && config.securityFindings?.allowSecurityFindingIssueCreation),
    run: Boolean(config.run),
    dryRun: Boolean(config.dryRun),
    allowFollowupIssueCreation: Boolean(config.allowFollowupIssueCreation),
    allowSecurityFindingIssueCreation: Boolean(config.securityFindings?.allowSecurityFindingIssueCreation),
  };
}

function exactAllowedPaths(finding) {
  return [...new Set([finding.locationPath, finding.manifestPath].filter(Boolean))].slice(0, 4);
}

function proposalTitle(classification, finding) {
  const kind = classification.category === "dependency_update" ? "Dependency update" : "Finding remediation";
  const target = finding.dependency || finding.locationPath || finding.manifestPath || finding.ruleId || "scoped finding";
  const sanitized = String(target).replace(/[^A-Za-z0-9._/@+ -]/g, "").slice(0, 96);
  if (/\b(auth|security|session|token|password|credential)\b/i.test(sanitized)) return `${kind}: scoped code path`;
  return `${kind}: ${sanitized}`;
}

function sanitizedSummary(classification, finding) {
  return [
    `Plan remediation for a ${classification.category.replaceAll("_", " ")} identified by sanitized correlation markers.`,
    `Source kind: ${finding.sourceKind}. Severity: ${finding.severity || "unknown"}.`,
    `Canonical lane: ${classification.suggestedLane}. Validation profile: ${classification.suggestedValidationProfile}.`,
  ].join(" ");
}

function requiredReadingFor(lane) {
  const common = ["PROGRAM_ARCHITECTURE.md", "README.md", "docs/workflow/CODEX_TASK_GUIDE.md", "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"];
  if (lane === "mobile-build-config") return [...common, "docs/planning/AUTO_RUNNER_OPERATIONAL_READINESS_PLAN.md"];
  if (lane === "openapi-generated-clients") return [...common, "packages/contracts/openapi/settleora.v1.yaml"];
  return common;
}

function reviewerTierFor(lane) {
  return new Set([
    "auth-session-security",
    "storage-file-privacy-authz",
    "money-settlement-payment",
    "schema-migrations",
    "openapi-generated-clients",
    "sync-import-export-restore",
    "docker-compose-ci-deployment",
    "mobile-build-config",
  ]).has(lane)
    ? "strong_independent"
    : "cheap_independent";
}

function priorityFor(severity) {
  if (severity === "critical" || severity === "high") return "P1";
  if (severity === "medium") return "P2";
  return "P3";
}

function hash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 32);
}

function boundedKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").slice(0, 120);
}
