import { writeFileSync } from "node:fs";
import path from "node:path";
import { safeTimestamp, slugify } from "./logger.mjs";

export const canaryAllowedLanes = Object.freeze(["workflow-docs-tooling", "docs-planning"]);

export function evaluateTrustPolicy(config) {
  const unsafeToggles = unsafeTrustedToggles(config);
  if (config.dryRun) {
    return {
      allowed: true,
      mode: config.canary ? "canary-dry-run" : "dry-run",
      reason: config.canary ? "Canary dry-run is non-mutating." : "Dry-run is non-mutating.",
      unsafeToggles,
    };
  }

  if (!config.run) {
    return {
      allowed: false,
      mode: config.canary ? "canary" : "normal",
      reason: "No trusted real-run mode was selected.",
      unsafeToggles,
    };
  }

  if (config.canary) {
    if (!config.trustedRealRunCanaryApproved) {
      return {
        allowed: false,
        mode: "canary",
        reason: "Canary real-run requires trustedRealRunCanaryApproved: true in config.",
        unsafeToggles,
      };
    }
    if (unsafeToggles.length > 0) {
      return {
        allowed: false,
        mode: "canary",
        reason: `Canary real-run requires disabled mutation toggles: ${unsafeToggles.join(", ")}.`,
        unsafeToggles,
      };
    }
    if (config.maxIterations > config.trustedRealRunCanaryMaxIterations) {
      return {
        allowed: false,
        mode: "canary",
        reason: `Canary real-run maxIterations ${config.maxIterations} exceeds trustedRealRunCanaryMaxIterations ${config.trustedRealRunCanaryMaxIterations}.`,
        unsafeToggles,
      };
    }
    return { allowed: true, mode: "canary", reason: "Canary real-run approval and conservative controls are enabled.", unsafeToggles };
  }

  if (!config.trustedRealRunApproved) {
    return {
      allowed: false,
      mode: "normal",
      reason: "Normal --run requires trustedRealRunApproved: true in config; trusted real-run is disabled by default.",
      unsafeToggles,
    };
  }
  const normalUnsafeToggles = unsafeToggles.filter((toggle) => toggle !== "allowAutoMerge");
  if (normalUnsafeToggles.length > 0) {
    return {
      allowed: false,
      mode: "normal",
      reason: `Normal trusted real-run requires disabled mutation toggles: ${normalUnsafeToggles.join(", ")}.`,
      unsafeToggles: normalUnsafeToggles,
    };
  }
  return { allowed: true, mode: "normal", reason: "Normal trusted real-run approval is enabled.", unsafeToggles };
}

export function evaluateCanaryIssuePolicy(config, laneDecision) {
  if (!config.canary) return { allowed: true, reason: "Canary mode is not selected." };
  if (!laneDecision.allowedToImplement) {
    return { allowed: false, reason: laneDecision.reason };
  }
  if (!canaryAllowedLanes.includes(laneDecision.lane)) {
    return { allowed: false, reason: `Canary mode only allows lanes: ${canaryAllowedLanes.join(", ")}.` };
  }
  if (laneDecision.autoMergeEligible || laneDecision.contract?.autoMergeEligible === true) {
    return { allowed: false, reason: "Canary mode refuses contracts with autoMergeEligible: true." };
  }
  if (laneDecision.manualMergeRequired !== true || laneDecision.contract?.manualMergeRequired !== true) {
    return { allowed: false, reason: "Canary mode requires manualMergeRequired: true." };
  }
  if (laneDecision.followupIssueCreationAllowed || laneDecision.reviewFixMutationAllowed) {
    return { allowed: false, reason: "Canary mode refuses follow-up issue creation and review-fix mutation." };
  }
  return { allowed: true, reason: "Canary issue policy accepted the contracted safe lane." };
}

export function writeCanaryEvidence(config, iteration) {
  if (!config.canary) return null;
  const issuePart = iteration.issue ? `issue-${iteration.issue.number}-${slugify(iteration.issue.title || "untitled", 40)}` : "no-issue";
  const evidencePath = path.join(config.canaryEvidenceRoot, `${safeTimestamp()}-${issuePart}.json`);
  const evidence = {
    generatedAt: new Date().toISOString(),
    selectedMode: config.dryRun ? "canary-dry-run" : "canary-real-run",
    issue: iteration.issue || null,
    contract: iteration.laneDecision?.contract || null,
    laneDecision: iteration.laneDecision || null,
    canaryPolicy: iteration.canaryPolicy || null,
    changedFiles: iteration.changedFiles || [],
    validation: iteration.validation
      ? {
          passed: Boolean(iteration.validation.passed),
          results: iteration.validation.results || [],
        }
      : null,
    reviewVerdict: iteration.review?.verdict || null,
    prUrl: iteration.pr?.url || null,
    terminalOutcome: iteration.outcome || null,
  };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { evidencePath };
}

function unsafeTrustedToggles(config) {
  const unsafe = [];
  if (config.allowAutoMerge) unsafe.push("allowAutoMerge");
  if (config.allowFollowupIssueCreation) unsafe.push("allowFollowupIssueCreation");
  if (config.allowStaleClaimSteal) unsafe.push("allowStaleClaimSteal");
  if (config.allowReviewFixMutation || config.maxReviewFixCycles > 0) unsafe.push("reviewFixMutation");
  if (config.allowSystemdEnablement) unsafe.push("allowSystemdEnablement");
  return unsafe;
}
