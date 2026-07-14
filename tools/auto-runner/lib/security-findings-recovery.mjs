import { classifyRecoveryOutcome, recordIdempotentMutation, recoveryHasMutationMarker } from "./recovery-state.mjs";

export const securityFindingRecoveryActions = Object.freeze([
  "security_finding_classification",
  "security_finding_reconciliation",
  "security_finding_proposal_planning",
  "security_finding_duplicate_reuse_lookup",
  "security_finding_issue_mutation",
  "security_finding_false_positive_packet",
  "security_finding_false_positive_review",
  "security_finding_disposition_precondition",
  "security_finding_disposition_attempt",
  "security_finding_disposition_confirm",
  "security_finding_post_disposition_reconciliation",
  "security_finding_linked_issue_completion",
  "security_finding_retry_scheduling",
  "security_finding_current_main_reconciliation",
]);

export function classifySecurityFindingRecovery(route = {}) {
  if (route.route === "retry_later") return classifyRecoveryOutcome("retryable_infrastructure", { reasonCode: "security_finding_retry_later" });
  if (route.route === "manual_gate") return classifyRecoveryOutcome("manual_decision_required", { reasonCode: "security_finding_manual_gate" });
  if (route.route === "blocked_ambiguous") return classifyRecoveryOutcome("unsafe_or_ambiguous", { reasonCode: "security_finding_blocked_ambiguous" });
  if (route.route === "propose_issue") return classifyRecoveryOutcome("followup_issue_required", { reasonCode: "security_finding_proposal_required" });
  return classifyRecoveryOutcome("pending", { reasonCode: `security_finding_${route.route || "unknown"}` });
}

export function planSecurityFindingMutationMarker(state, proposal) {
  const key = proposal?.correlationKey || proposal?.idempotencyKey || "missing";
  if (recoveryHasMutationMarker(state, "followup_issue", key)) {
    return { action: "skip_existing_marker", mutate: false, kind: "followup_issue", key };
  }
  return { action: "perform_once", mutate: true, kind: "followup_issue", key };
}

export function recordSecurityFindingMutationMarker(state, proposal, marker = {}) {
  const key = proposal?.correlationKey || proposal?.idempotencyKey || "missing";
  return recordIdempotentMutation(state, {
    kind: "followup_issue",
    key,
    marker: {
      component: "security_finding_issue_mutation",
      proposalDigest: proposal?.idempotencyKey || null,
      ...marker,
    },
  });
}

export function planSecurityFindingDispositionMarker(state, packet, stage = "planned") {
  const key = packet?.packetDigest || packet?.correlationKey || "missing";
  const kind = `security_finding_disposition_${stage}`;
  if (recoveryHasMutationMarker(state, kind, key)) {
    return { action: "skip_existing_marker", mutate: false, kind, key };
  }
  return { action: "perform_once", mutate: true, kind, key };
}

export function recordSecurityFindingDispositionMarker(state, packet, marker = {}) {
  const key = packet?.packetDigest || packet?.correlationKey || "missing";
  const stage = marker.stage || "planned";
  return recordIdempotentMutation(state, {
    kind: `security_finding_disposition_${stage}`,
    key,
    marker: {
      component: "security_finding_disposition",
      packetDigest: packet?.packetDigest || null,
      correlationKey: packet?.correlationKey || null,
      stage,
      ...marker,
    },
  });
}
