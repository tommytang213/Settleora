import { createHash } from "node:crypto";

export const securityFindingCompletionVersion = 1;

const unsafeText = /rawSarif|rawPayload|providerPayload|snippet|Bearer\s+|token=|password=|secret=|ignore previous instructions/i;
const digestPattern = /^[0-9a-f]{16,64}$/i;

export function evaluateSecurityFindingLinkedIssueCompletion(input = {}) {
  const packet = input.packet || {};
  const disposition = input.disposition || {};
  const reconciliation = input.reconciliation || {};
  const errors = [];
  const evidence = validateLinkedIssueCompletionEvidence(input.evidence, { packet, disposition, reconciliation });
  if (!evidence.ok) errors.push(evidence.reason);
  const issue = evidence.issue || {};
  if (!issue.number || issue.number === 902 || issue.isUmbrella === true) errors.push("linked_issue_not_narrow");
  if (String(issue.state || "").toUpperCase() === "CLOSED") errors.push("linked_issue_already_closed");
  if (!issue.correlationKey || issue.correlationKey !== packet.correlationKey) errors.push("linked_issue_correlation_mismatch");
  if (!issue.closeRule || issue.closeRule !== "confirmed_false_positive_disposition") errors.push("linked_issue_close_rule_mismatch");
  if (!disposition.result?.confirmationDigest) errors.push("disposition_not_confirmed");
  if (!reconciliation.reconciliation?.reconciliationDigest) errors.push("post_disposition_reconciliation_missing");
  if (evidence.ok && evidence.value.remainingAlertQuery.remainingCurrentAlert === true) errors.push("remaining_current_alert");
  if (evidence.ok && evidence.value.prReviewState.unresolved === true) errors.push("unresolved_pr_or_review");
  if (evidence.ok && evidence.value.manualGateState.active === true) errors.push("manual_gate_active");
  if (evidence.ok && String(evidence.value.parentIssue.state || "").toUpperCase() === "CLOSED") errors.push("umbrella_parent_closed_unexpectedly");
  const evidenceComment = renderLinkedIssueCompletionComment({ issue, packet, disposition, reconciliation });
  if (unsafeText.test(evidenceComment)) errors.push("completion_comment_unsanitized");
  if (errors.length > 0) return { ok: false, close: false, reason: errors[0], errors, evidenceComment };
  return {
    ok: true,
    close: true,
    reason: "confirmed_disposition_and_reconciliation",
    evidenceComment,
    completionDigest: digestObject({
      issue: issue.number,
      packetDigest: packet.packetDigest,
      confirmationDigest: disposition.result.confirmationDigest,
      reconciliationDigest: reconciliation.reconciliation.reconciliationDigest,
      completionEvidenceDigest: evidence.value.completionEvidenceDigest,
    }),
  };
}

export function validateLinkedIssueCompletionEvidence(evidence = {}, context = {}) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return { ok: false, reason: "completion_evidence_missing" };
  const allowed = new Set(["evidenceVersion", "linkedIssue", "parentIssue", "prReviewState", "manualGateState", "remainingAlertQuery", "dispositionDigest", "reconciliationDigest", "checkedAt", "completionEvidenceDigest"]);
  const unknown = Object.keys(evidence).find((key) => !allowed.has(key));
  if (unknown) return { ok: false, reason: `completion_evidence_unknown_field:${unknown}` };
  if (evidence.evidenceVersion !== securityFindingCompletionVersion) return { ok: false, reason: "completion_evidence_version_unsupported" };
  for (const key of ["linkedIssue", "parentIssue", "prReviewState", "manualGateState", "remainingAlertQuery"]) {
    if (!evidence[key] || typeof evidence[key] !== "object" || Array.isArray(evidence[key])) return { ok: false, reason: `completion_${key}_missing` };
  }
  if (evidence.dispositionDigest !== digestObject(context.disposition?.result || {})) return { ok: false, reason: "completion_disposition_digest_mismatch" };
  if (evidence.reconciliationDigest !== context.reconciliation?.reconciliation?.reconciliationDigest) return { ok: false, reason: "completion_reconciliation_digest_mismatch" };
  if (!digestPattern.test(evidence.completionEvidenceDigest || "")) return { ok: false, reason: "completion_evidence_digest_invalid" };
  if (!validIso(evidence.checkedAt)) return { ok: false, reason: "completion_checked_at_invalid" };
  if (evidence.linkedIssue.correlationKey !== context.packet?.correlationKey) return { ok: false, reason: "completion_linked_issue_correlation_mismatch" };
  if (evidence.remainingAlertQuery.packetDigest !== context.packet?.packetDigest) return { ok: false, reason: "completion_remaining_query_packet_mismatch" };
  const expected = digestObject({ ...evidence, completionEvidenceDigest: undefined });
  if (evidence.completionEvidenceDigest !== expected) return { ok: false, reason: "completion_evidence_digest_mismatch" };
  return {
    ok: true,
    issue: evidence.linkedIssue,
    value: {
      linkedIssue: evidence.linkedIssue,
      parentIssue: evidence.parentIssue,
      prReviewState: evidence.prReviewState,
      manualGateState: evidence.manualGateState,
      remainingAlertQuery: evidence.remainingAlertQuery,
      completionEvidenceDigest: evidence.completionEvidenceDigest,
    },
  };
}

export function renderLinkedIssueCompletionComment({ issue = {}, packet = {}, disposition = {}, reconciliation = {} } = {}) {
  return [
    `Security finding completion evidence for linked issue #${issue.number}.`,
    "",
    `Source: ${packet.sourceKind || "unknown"} alert \`${packet.alertId || "unknown"}\``,
    `Packet digest: \`${packet.packetDigest || "unknown"}\``,
    `Disposition reason: \`${disposition.result?.reason || "unknown"}\``,
    `Confirmation digest: \`${disposition.result?.confirmationDigest || "unknown"}\``,
    `Post-disposition reconciliation: \`${reconciliation.reconciliation?.reconciliationDigest || "unknown"}\``,
    `Correlation: \`${packet.correlationKey || "unknown"}\``,
    "",
    `Completion marker: settleora-security-finding-completion:${issue.number}:${packet.packetDigest || "unknown"}`,
  ].join("\n");
}

function digestObject(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function validIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.includes("T");
}
