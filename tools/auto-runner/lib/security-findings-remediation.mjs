export const securityFindingRouteVersion = 1;

export const securityFindingRoutes = Object.freeze([
  "propose_issue",
  "retry_later",
  "collect_false_positive_evidence",
  "manual_gate",
  "no_action_resolved",
  "blocked_ambiguous",
]);

export function routeSecurityFindingRemediation({ finding = {}, classification = {}, reconciliation = {}, duplicate = null } = {}) {
  const base = {
    routeVersion: securityFindingRouteVersion,
    correlationKey: finding.correlationKey || classification.correlationKey || null,
    idempotencyKey: finding.idempotencyKey || classification.idempotencyKey || null,
    route: "blocked_ambiguous",
    reasonCodes: [],
    proposalAllowed: false,
    mutationAllowed: false,
  };
  if (duplicate && (!duplicate.ok || duplicate.status === "ambiguous")) return finalize(base, "blocked_ambiguous", ["duplicate_state_ambiguous"]);
  if (classification.category === "retryable_infrastructure") return finalize(base, "retry_later", ["retryable_infrastructure"], { mutationAllowed: false });
  if (classification.category === "false_positive_candidate") {
    return finalize(base, "collect_false_positive_evidence", ["checkpoint3_false_positive_evidence_required"]);
  }
  if (classification.category === "manual_security_product_decision") return finalize(base, "manual_gate", ["manual_security_product_decision"]);
  if (classification.category === "unsupported_ambiguous") return finalize(base, "blocked_ambiguous", classification.reasonCodes || ["unsupported_ambiguous"]);
  if (reconciliation.state === "resolved_upstream" || reconciliation.state === "superseded_fingerprint") {
    return finalize(base, "no_action_resolved", [reconciliation.state]);
  }
  if (reconciliation.state === "requires_current_main_scan") return finalize(base, "blocked_ambiguous", ["current_main_scan_required_before_planning"]);
  if (reconciliation.state !== "current_open") return finalize(base, "blocked_ambiguous", [reconciliation.state || "reconciliation_not_current"]);
  if (classification.proposalEligible && ["safe_code_fix", "dependency_update"].includes(classification.category)) {
    return finalize(base, "propose_issue", ["current_reconciled_finding"], { proposalAllowed: true });
  }
  return finalize(base, "blocked_ambiguous", ["proposal_not_eligible"]);
}

function finalize(base, route, reasonCodes, extra = {}) {
  return {
    ...base,
    ...extra,
    route,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 10),
  };
}
