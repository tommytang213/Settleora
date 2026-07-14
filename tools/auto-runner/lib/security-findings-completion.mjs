import { createHash } from "node:crypto";

export const securityFindingCompletionVersion = 1;

const unsafeText = /rawSarif|rawPayload|providerPayload|snippet|Bearer\s+|token=|password=|secret=|ignore previous instructions/i;

export function evaluateSecurityFindingLinkedIssueCompletion(input = {}) {
  const issue = input.issue || {};
  const packet = input.packet || {};
  const disposition = input.disposition || {};
  const reconciliation = input.reconciliation || {};
  const errors = [];
  if (!issue.number || issue.number === 902 || issue.isUmbrella === true) errors.push("linked_issue_not_narrow");
  if (String(issue.state || "").toUpperCase() === "CLOSED") errors.push("linked_issue_already_closed");
  if (!issue.correlationKey || issue.correlationKey !== packet.correlationKey) errors.push("linked_issue_correlation_mismatch");
  if (!issue.closeRule || issue.closeRule !== "confirmed_false_positive_disposition") errors.push("linked_issue_close_rule_mismatch");
  if (!disposition.result?.confirmationDigest) errors.push("disposition_not_confirmed");
  if (!reconciliation.reconciliation?.reconciliationDigest) errors.push("post_disposition_reconciliation_missing");
  if (input.remainingCurrentAlert === true) errors.push("remaining_current_alert");
  if (input.unresolvedPrOrReview === true) errors.push("unresolved_pr_or_review");
  if (input.manualGateActive === true) errors.push("manual_gate_active");
  if (input.parentIssueState && String(input.parentIssueState).toUpperCase() === "CLOSED") errors.push("umbrella_parent_closed_unexpectedly");
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
    }),
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
