export const claimAuthorityModes = Object.freeze({
  freshActive: "fresh_active_claim",
  preservedRecovery: "preserved_recovery_claim",
});

const terminalFailureLabels = new Map([
  ["auto-failed", new Set(["validation_failed", "auto_failed", "review_changes_requested_retry_exhausted"])],
]);

export function validateClaimAuthority(config, selectedIssue, rereadIssue, authority = {}) {
  if (authority.mode === claimAuthorityModes.freshActive) {
    return validateFreshActiveClaim(config, selectedIssue, rereadIssue);
  }
  if (authority.mode === claimAuthorityModes.preservedRecovery) {
    return validatePreservedRecoveryClaim(config, selectedIssue, rereadIssue, authority);
  }
  return decision(false, "claim_authority_mode_invalid", authority.mode, selectedIssue, rereadIssue);
}

function validateFreshActiveClaim(config, selectedIssue, rereadIssue) {
  const mode = claimAuthorityModes.freshActive;
  const common = validateCommon(selectedIssue, rereadIssue, mode);
  if (!common.ok) return common;
  const missingClaim = (config.claimLabels || []).find((label) => !common.labels.has(label));
  if (missingClaim) return decision(false, `claim_reread_missing_claim_label:${missingClaim}`, mode, selectedIssue, rereadIssue);
  const forbiddenStop = (config.stopLabels || []).find((label) =>
    !(config.claimLabels || []).includes(label) && common.labels.has(label));
  if (forbiddenStop) return decision(false, `claim_reread_stop_label:${forbiddenStop}`, mode, selectedIssue, rereadIssue);
  return decision(true, "claim_reread_passed", mode, selectedIssue, rereadIssue);
}

function validatePreservedRecoveryClaim(config, selectedIssue, rereadIssue, authority) {
  const mode = claimAuthorityModes.preservedRecovery;
  const common = validateCommon(selectedIssue, rereadIssue, mode);
  if (!common.ok) return common;
  if (!(config.eligibleLabels || []).some((label) => common.labels.has(label))) {
    return decision(false, "preserved_claim_live_eligibility_removed", mode, selectedIssue, rereadIssue);
  }
  if (authority.policy?.eligible !== true) {
    return decision(false, authority.policy?.reasonCode || "preserved_claim_live_policy_ineligible", mode, selectedIssue, rereadIssue);
  }
  const activeClaimLabel = (config.claimLabels || []).find((label) => common.labels.has(label));
  if (activeClaimLabel) {
    const exactOwner = authority.owner?.alive === true && authority.lease?.valid === true
      && authority.owner?.runId === authority.runId && authority.lease?.runId === authority.runId;
    if (!exactOwner) return decision(false, `preserved_claim_stale_transient_label:${activeClaimLabel}`, mode, selectedIssue, rereadIssue);
  }
  const forbiddenStop = (config.stopLabels || []).find((label) =>
    common.labels.has(label)
      && !(config.claimLabels || []).includes(label)
      && !terminalFailureLabels.has(label));
  if (forbiddenStop) return decision(false, `preserved_claim_stop_label:${forbiddenStop}`, mode, selectedIssue, rereadIssue);
  for (const [label, outcomes] of terminalFailureLabels) {
    if (common.labels.has(label) && !outcomes.has(authority.priorOutcome)) {
      return decision(false, `preserved_claim_terminal_label_outcome_mismatch:${label}`, mode, selectedIssue, rereadIssue);
    }
    if (!common.labels.has(label) && outcomes.has(authority.priorOutcome)) {
      return decision(false, `preserved_claim_terminal_label_missing:${label}`, mode, selectedIssue, rereadIssue);
    }
  }
  if (authority.lineage?.ok !== true) {
    return decision(false, authority.lineage?.reasonCode || "preserved_claim_lineage_untrusted", mode, selectedIssue, rereadIssue);
  }
  if (authority.controlPlaneAdmission?.ok !== true) {
    return decision(false, authority.controlPlaneAdmission?.reasonCode || "preserved_claim_owner_evidence_untrusted", mode, selectedIssue, rereadIssue);
  }
  return {
    ...decision(true, "preserved_claim_authority_passed", mode, selectedIssue, rereadIssue),
    authority: {
      taskKey: authority.taskKey || null,
      runId: authority.runId || null,
      supervisorRunId: authority.supervisorRunId || null,
      chargeId: authority.chargeId || null,
      priorOutcome: authority.priorOutcome || null,
      branchName: authority.branchName || null,
      baseSha: authority.baseSha || null,
      headSha: authority.headSha || null,
      currentMainSha: authority.lineage.currentMainSha || null,
      lineageReasonCode: authority.lineage.reasonCode || null,
      controlPlaneReasonCode: authority.controlPlaneAdmission.reasonCode || null,
    },
  };
}

function validateCommon(selectedIssue, rereadIssue, mode) {
  const selectedNumber = normalizeIssueNumber(selectedIssue?.number);
  const liveNumber = normalizeIssueNumber(rereadIssue?.number);
  if (!selectedNumber || liveNumber !== selectedNumber) {
    return decision(false, "claim_reread_issue_number_mismatch", mode, selectedIssue, rereadIssue);
  }
  if (String(rereadIssue?.state || "").toUpperCase() !== "OPEN") {
    return decision(false, "claim_reread_issue_not_open", mode, selectedIssue, rereadIssue);
  }
  return { ok: true, labels: new Set(labelNames(rereadIssue)) };
}

function decision(ok, reason, mode, selectedIssue, rereadIssue) {
  return {
    ok,
    reason,
    reasonCode: reason,
    mode,
    event: {
      action: mode === claimAuthorityModes.freshActive ? "claim_reread" : "claim_authority_reread",
      mode,
      ...(mode === claimAuthorityModes.freshActive ? { issue: issueSummary(rereadIssue) } : {}),
      selectedIssueNumber: normalizeIssueNumber(selectedIssue?.number),
      liveIssueNumber: normalizeIssueNumber(rereadIssue?.number),
      liveState: String(rereadIssue?.state || "").toUpperCase() || null,
      liveLabels: labelNames(rereadIssue).slice(0, 50),
      ok,
      reason,
    },
  };
}

function issueSummary(issue = {}) {
  return {
    number: normalizeIssueNumber(issue.number),
    title: typeof issue.title === "string" ? issue.title : null,
    url: typeof issue.url === "string" ? issue.url : null,
    state: String(issue.state || "").toUpperCase() || null,
    labels: labelNames(issue),
  };
}

function labelNames(issue) {
  return (issue?.labels || []).map((label) => typeof label === "string" ? label : label?.name).filter(Boolean);
}

function normalizeIssueNumber(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
