export const securityFindingRouteVersion = 1;

export const securityFindingRoutes = Object.freeze([
  "propose_issue",
  "reuse_existing_work",
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
    duplicateEvidence: [],
  };
  if (duplicate && (!duplicate.ok || duplicate.status === "ambiguous")) {
    return finalize(base, "blocked_ambiguous", [duplicate.reason || "duplicate_state_ambiguous"], {
      duplicateEvidence: summarizeDuplicateEvidence(duplicate.evidence),
    });
  }
  if (duplicate?.status === "failed") {
    return finalize(base, "blocked_ambiguous", [duplicate.reason || "duplicate_lookup_failed"]);
  }
  if (reconciliation.state === "resolved_upstream" || reconciliation.state === "superseded_fingerprint") {
    return finalize(base, "no_action_resolved", [reconciliation.state], {
      duplicateEvidence: summarizeDuplicateEvidence(duplicate?.evidence),
    });
  }
  if (duplicate?.status === "duplicate") {
    const duplicateEvidence = summarizeDuplicateEvidence(duplicate.evidence);
    if (hasCompletedDuplicate(duplicate.evidence) && reconciliation.state === "current_open") {
      return finalize(base, "blocked_ambiguous", ["completed_duplicate_still_open_requires_reconciliation"], { duplicateEvidence });
    }
    if (reconciliation.state === "current_open") {
      return finalize(base, "reuse_existing_work", ["authoritative_duplicate_reuse"], { duplicateEvidence });
    }
  }
  if (classification.category === "retryable_infrastructure") return finalize(base, "retry_later", ["retryable_infrastructure"], { mutationAllowed: false });
  if (classification.category === "false_positive_candidate") {
    return finalize(base, "collect_false_positive_evidence", ["checkpoint3_false_positive_evidence_required"]);
  }
  if (classification.category === "manual_security_product_decision") return finalize(base, "manual_gate", ["manual_security_product_decision"]);
  if (classification.category === "unsupported_ambiguous") return finalize(base, "blocked_ambiguous", classification.reasonCodes || ["unsupported_ambiguous"]);
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

function hasCompletedDuplicate(evidence = []) {
  return (Array.isArray(evidence) ? evidence : []).some((item) => item?.lifecycle === "completed");
}

function summarizeDuplicateEvidence(evidence = []) {
  return (Array.isArray(evidence) ? evidence : []).slice(0, 5).map((item) => ({
    source: item.source || null,
    number: item.number || null,
    state: item.state || null,
    confidence: item.confidence || null,
    authority: item.authority || null,
    lifecycle: item.lifecycle || null,
  }));
}
