import { classifyIssueLane } from "./lane-policy.mjs";
import { claimAuthorityModes, validateClaimAuthority } from "./claim-authority.mjs";

export const terminalAttemptOutcomes = Object.freeze([
  "auto_merged",
  "approved_pr_opened",
  "blocked_needs_tommy",
  "danger_gate",
  "validation_failed",
  "review_changes_requested_retry_exhausted",
  "no_changes",
  "auto_failed",
]);

export function createRunIssueTracker(initial = {}) {
  return {
    attemptedIssueNumbers: new Set(normalizeIssueNumberArray(initial.attemptedIssueNumbers)),
    processedIssueNumbers: new Set(normalizeIssueNumberArray(initial.processedIssueNumbers)),
  };
}

export function trackerSnapshot(tracker = {}) {
  const attempted = sortedNumbers(tracker.attemptedIssueNumbers);
  const processed = sortedNumbers(tracker.processedIssueNumbers);
  return {
    attemptedIssueNumbers: attempted,
    attemptedIssueCount: attempted.length,
    processedIssueNumbers: processed,
    processedIssueCount: processed.length,
  };
}

export function markIssueAttempted(tracker, issueNumber) {
  const normalized = normalizeIssueNumber(issueNumber);
  if (!normalized) return trackerSnapshot(tracker);
  tracker.attemptedIssueNumbers.add(normalized);
  return trackerSnapshot(tracker);
}

export function markIssueProcessed(tracker, issueNumber) {
  const normalized = normalizeIssueNumber(issueNumber);
  if (!normalized) return trackerSnapshot(tracker);
  tracker.processedIssueNumbers.add(normalized);
  return trackerSnapshot(tracker);
}

export function selectDistinctEligibleIssue(config, candidates, tracker, readLiveIssue, evaluateCandidatePolicy = null) {
  const events = [];
  const boundedCandidates = Array.isArray(candidates) ? candidates.slice(0, config.pollLimit || candidates.length) : [];
  for (const candidate of boundedCandidates) {
    const candidateEvent = candidateReturnedEvent(candidate);
    events.push(candidateEvent);
    const evaluation = validateCandidateForClaim(config, candidate, tracker, readLiveIssue, evaluateCandidatePolicy);
    events.push(evaluation.event);
    if (evaluation.ok) {
      return {
        selected: evaluation.issue,
        laneDecision: evaluation.laneDecision,
        events,
        skipCount: events.filter((event) => event.action === "candidate_skipped").length,
        noEligibleWork: false,
      };
    }
  }
  events.push({
    action: "no_eligible_work_after_exclusions",
    attemptedIssueNumbers: sortedNumbers(tracker.attemptedIssueNumbers),
    attemptedIssueCount: sortedNumbers(tracker.attemptedIssueNumbers).length,
    scannedCandidateCount: boundedCandidates.length,
  });
  return {
    selected: null,
    laneDecision: null,
    events,
    skipCount: events.filter((event) => event.action === "candidate_skipped").length,
    noEligibleWork: true,
  };
}

export function validateCandidateForClaim(config, candidate, tracker, readLiveIssue, evaluateCandidatePolicy = null) {
  const number = normalizeIssueNumber(candidate?.number);
  const attempted = tracker?.attemptedIssueNumbers || new Set();
  if (!number) {
    return skip("candidate_number_missing", candidate, null);
  }
  if (attempted.has(number)) {
    return skip("already_attempted_in_run", candidate, null, {
      attemptedIssueNumbers: sortedNumbers(attempted),
      attemptedIssueCount: attempted.size,
    });
  }

  let live;
  try {
    live = readLiveIssue(number);
  } catch (error) {
    return skip("live_issue_refresh_failed", candidate, null, { error: error.message });
  }
  if (!live || live.ok === false) {
    return skip("live_issue_refresh_failed", candidate, null, { error: live?.reason || "missing_live_issue" });
  }
  const liveIssue = normalizeIssue(live.issue || live);
  const liveEvent = liveRefreshEvent(liveIssue);
  if (liveIssue.number !== number) {
    return skip("live_issue_number_mismatch", candidate, liveEvent);
  }
  if (liveIssue.state !== "OPEN") {
    return skip("live_issue_not_open", candidate, liveEvent);
  }
  const labels = new Set(liveIssue.labels || []);
  if (!config.eligibleLabels.some((label) => labels.has(label))) {
    return skip("live_issue_missing_eligible_label", candidate, liveEvent);
  }
  const stopLabel = (config.stopLabels || []).find((label) => labels.has(label));
  if (stopLabel) {
    return skip(`live_issue_stop_label:${stopLabel}`, candidate, liveEvent);
  }
  const claimLabel = (config.claimLabels || []).find((label) => labels.has(label));
  if (claimLabel) {
    return skip(`live_issue_transient_claim_label:${claimLabel}`, candidate, liveEvent);
  }
  const laneDecision = classifyIssueLane(liveIssue);
  if (!laneDecision.allowedToImplement) {
    return skip(`live_issue_lane_not_allowed:${laneDecision.reason}`, candidate, liveEvent, {
      lane: laneDecision.lane || null,
      canonicalLane: laneDecision.canonicalLane || null,
      implementationSensitivity: laneDecision.implementationSensitivity || null,
      branchStrategy: laneDecision.branchStrategy || null,
      reviewerTier: laneDecision.reviewerTier || null,
      validationProfile: laneDecision.validationProfile || null,
      reasonCodes: laneDecision.reasonCodes || [],
      manualReasonCodes: laneDecision.manualReasonCodes || [],
      manualActionRequired: Boolean(laneDecision.manualActionRequired),
      splitRequired: Boolean(laneDecision.splitRequired),
      manualGate: Boolean(laneDecision.manualGate),
      dangerGate: Boolean(laneDecision.dangerGate),
    });
  }
  if (typeof evaluateCandidatePolicy === "function") {
    const policy = evaluateCandidatePolicy(liveIssue, laneDecision);
    if (!policy?.allowed) {
      markIssueAttempted(tracker, number);
      return skip(`live_issue_profile_policy_not_allowed:${policy?.reason || "unspecified"}`, candidate, liveEvent, {
        lane: laneDecision.lane || null,
        canonicalLane: laneDecision.canonicalLane || null,
        profilePolicy: policy || null,
      });
    }
  }
  return {
    ok: true,
    issue: liveIssue,
    laneDecision,
    event: {
      action: "distinct_candidate_selected",
      issue: issueSummary(liveIssue),
      liveRefresh: liveEvent,
      lane: laneDecision.lane,
      canonicalLane: laneDecision.canonicalLane || laneDecision.lane,
      implementationSensitivity: laneDecision.implementationSensitivity || null,
      branchStrategy: laneDecision.branchStrategy || null,
      reviewerTier: laneDecision.reviewerTier || null,
      validationProfile: laneDecision.validationProfile || null,
      reasonCodes: laneDecision.reasonCodes || [],
      manualReasonCodes: laneDecision.manualReasonCodes || [],
      manualActionRequired: Boolean(laneDecision.manualActionRequired),
      splitRequired: Boolean(laneDecision.splitRequired),
      prCreationAllowed: Boolean(laneDecision.prCreationAllowed),
      autoMergeEligible: Boolean(laneDecision.autoMergeEligible),
    },
  };
}

export function validateClaimReread(config, selectedIssue, rereadIssue) {
  return validateClaimAuthority(config, selectedIssue, rereadIssue, {
    mode: claimAuthorityModes.freshActive,
  });
}

function skip(reason, candidate, liveRefresh = null, extra = {}) {
  return {
    ok: false,
    reason,
    event: {
      action: "candidate_skipped",
      reason,
      candidate: candidateSummary(candidate),
      liveRefresh,
      ...extra,
    },
  };
}

function candidateReturnedEvent(candidate) {
  return {
    action: "search_candidate_returned",
    candidate: candidateSummary(candidate),
  };
}

function liveRefreshEvent(issue) {
  return {
    action: "live_pre_claim_refresh",
    issue: issueSummary(issue),
    bodyLength: typeof issue.body === "string" ? issue.body.length : 0,
  };
}

function normalizeIssue(issue = {}) {
  return {
    number: normalizeIssueNumber(issue.number),
    title: typeof issue.title === "string" ? issue.title : null,
    url: typeof issue.url === "string" ? issue.url : null,
    state: String(issue.state || "").toUpperCase(),
    labels: labelNames(issue),
    body: typeof issue.body === "string" ? issue.body : "",
  };
}

function candidateSummary(issue = {}) {
  return {
    number: normalizeIssueNumber(issue.number),
    title: typeof issue.title === "string" ? issue.title : null,
    url: typeof issue.url === "string" ? issue.url : null,
    labels: labelNames(issue),
  };
}

function issueSummary(issue = {}) {
  return {
    number: normalizeIssueNumber(issue.number),
    title: typeof issue.title === "string" ? issue.title : null,
    url: typeof issue.url === "string" ? issue.url : null,
    state: issue.state || null,
    labels: labelNames(issue),
  };
}

function labelNames(issue) {
  return (issue?.labels || []).map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
}

function normalizeIssueNumber(number) {
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeIssueNumberArray(numbers) {
  return Array.isArray(numbers) ? numbers.map(normalizeIssueNumber).filter(Boolean) : [];
}

function sortedNumbers(set) {
  return [...(set || [])].filter(Number.isInteger).sort((a, b) => a - b);
}
