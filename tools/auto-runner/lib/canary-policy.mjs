import { writeFileSync } from "node:fs";
import path from "node:path";
import { safeTimestamp, slugify } from "./logger.mjs";

export const canaryAllowedLanes = Object.freeze(["workflow-docs-tooling", "docs-planning"]);
export const lowRiskAutoMergeCanaryAllowedPathsByLane = Object.freeze({
  "workflow-docs-tooling": Object.freeze(["tools/auto-runner/**", "docs/workflow/**"]),
  "docs-planning": Object.freeze(["docs/planning/**", "docs/qa/**"]),
});
const lowRiskAutoMergeCanaryMaxIterations = 2;

export function evaluateTrustPolicy(config) {
  const unsafeToggles = unsafeTrustedToggles(config);
  const autoMergeCanaryApproval = evaluateLowRiskAutoMergeCanaryApproval(config);
  if (config.dryRun) {
    return {
      allowed: true,
      mode: config.canary ? "canary-dry-run" : "dry-run",
      reason: config.canary ? "Canary dry-run is non-mutating." : "Dry-run is non-mutating.",
      unsafeToggles,
      autoMergeCanaryApproval,
    };
  }

  if (!config.run) {
    return {
      allowed: false,
      mode: config.canary ? "canary" : "normal",
      reason: "No trusted real-run mode was selected.",
      unsafeToggles,
      autoMergeCanaryApproval,
    };
  }

  if (config.canary) {
    if (!config.trustedRealRunCanaryApproved) {
      return {
        allowed: false,
        mode: "canary",
        reason: "Canary real-run requires trustedRealRunCanaryApproved: true in config.",
        unsafeToggles,
        autoMergeCanaryApproval,
      };
    }
    if (config.allowAutoMerge) {
      if (!autoMergeCanaryApproval.approved) {
        return {
          allowed: false,
          mode: "canary",
          reason: `Canary real-run auto-merge requires explicit low-risk approval: ${autoMergeCanaryApproval.reason}.`,
          unsafeToggles,
          autoMergeCanaryApproval,
        };
      }
    }
    const canaryUnsafeToggles = unsafeToggles.filter((toggle) => toggle !== "allowAutoMerge");
    if (canaryUnsafeToggles.length > 0) {
      return {
        allowed: false,
        mode: "canary",
        reason: `Canary real-run requires disabled mutation toggles: ${canaryUnsafeToggles.join(", ")}.`,
        unsafeToggles: canaryUnsafeToggles,
        autoMergeCanaryApproval,
      };
    }
    const requestedMaxIterations = requestedMax(config);
    if (requestedMaxIterations > config.trustedRealRunCanaryMaxIterations) {
      return {
        allowed: false,
        mode: "canary",
        reason: `Canary real-run maxIterations ${requestedMaxIterations} exceeds trustedRealRunCanaryMaxIterations ${config.trustedRealRunCanaryMaxIterations}.`,
        unsafeToggles: canaryUnsafeToggles,
        autoMergeCanaryApproval,
      };
    }
    return {
      allowed: true,
      mode: "canary",
      reason: config.allowAutoMerge
        ? "Bounded low-risk auto-merge canary approval and conservative controls are enabled."
        : "Canary real-run approval and conservative controls are enabled.",
      unsafeToggles: canaryUnsafeToggles,
      autoMergeCanaryApproval,
    };
  }

  if (!config.trustedRealRunApproved) {
    return {
      allowed: false,
      mode: "normal",
      reason: "Normal --run requires trustedRealRunApproved: true in config; trusted real-run is disabled by default.",
      unsafeToggles,
      autoMergeCanaryApproval,
    };
  }
  const normalUnsafeToggles = unsafeToggles.filter((toggle) => toggle !== "allowAutoMerge");
  if (normalUnsafeToggles.length > 0) {
    return {
      allowed: false,
      mode: "normal",
      reason: `Normal trusted real-run requires disabled mutation toggles: ${normalUnsafeToggles.join(", ")}.`,
      unsafeToggles: normalUnsafeToggles,
      autoMergeCanaryApproval,
    };
  }
  return { allowed: true, mode: "normal", reason: "Normal trusted real-run approval is enabled.", unsafeToggles, autoMergeCanaryApproval };
}

export function evaluateCanaryIssuePolicy(config, laneDecision) {
  if (!config.canary) return { allowed: true, reason: "Canary mode is not selected." };
  if (!laneDecision.allowedToImplement) {
    return { allowed: false, reason: laneDecision.reason };
  }
  if (!canaryAllowedLanes.includes(laneDecision.lane)) {
    return { allowed: false, reason: `Canary mode only allows lanes: ${canaryAllowedLanes.join(", ")}.` };
  }
  const autoMergeContract =
    laneDecision.autoMergeEligible === true ||
    laneDecision.contract?.autoMergeEligible === true ||
    laneDecision.manualMergeRequired === false ||
    laneDecision.contract?.manualMergeRequired === false;
  if (autoMergeContract) {
    const approval = evaluateLowRiskAutoMergeCanaryApproval(config);
    if (!approval.approved) {
      return { allowed: false, reason: `Canary auto-merge contract requires explicit low-risk approval: ${approval.reason}.` };
    }
    const exactPaths = lowRiskAutoMergeCanaryAllowedPathsByLane[laneDecision.lane] || [];
    const contractPaths = laneDecision.contract?.allowedPaths || laneDecision.allowedPaths || [];
    const pathsAreExact =
      contractPaths.length === exactPaths.length && exactPaths.every((glob) => contractPaths.includes(glob));
    if (!pathsAreExact) {
      return {
        allowed: false,
        reason: `Low-risk auto-merge canary requires exact allowedPaths for ${laneDecision.lane}: ${exactPaths.join(", ")}.`,
      };
    }
    if (laneDecision.contract?.autoMergeEligible !== true || laneDecision.autoMergeEligible !== true) {
      return { allowed: false, reason: "Low-risk auto-merge canary requires autoMergeEligible: true." };
    }
    if (laneDecision.contract?.manualMergeRequired !== false || laneDecision.manualMergeRequired !== false) {
      return { allowed: false, reason: "Low-risk auto-merge canary requires manualMergeRequired: false." };
    }
    if (laneDecision.dangerGate || (laneDecision.dangerReasons || []).length > 0) {
      return { allowed: false, reason: "Low-risk auto-merge canary refuses dangerous issue scope." };
    }
    if (laneDecision.followupIssueCreationAllowed || laneDecision.reviewFixMutationAllowed) {
      return { allowed: false, reason: "Canary mode refuses follow-up issue creation and review-fix mutation." };
    }
    return { allowed: true, reason: "Low-risk auto-merge canary issue policy accepted the exact contracted lane." };
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

export function evaluateLowRiskAutoMergeCanaryApproval(config) {
  const requestedMaxIterations = requestedMax(config);
  const unsafeToggles = unsafeTrustedToggles(config).filter((toggle) => toggle !== "allowAutoMerge");
  const base = {
    approved: false,
    mode: "not_approved",
    reason: "lowRiskAutoMergeCanaryApproved is not true",
    configPathUsed: config.configPath || null,
    lowRiskAutoMergeCanaryApproved: Boolean(config.lowRiskAutoMergeCanaryApproved),
    allowAutoMerge: Boolean(config.allowAutoMerge),
    trustedRealRunCanaryApproved: Boolean(config.trustedRealRunCanaryApproved),
    trustedRealRunApproved: Boolean(config.trustedRealRunApproved),
    maxIterations: requestedMaxIterations,
    maxAllowedIterations: lowRiskAutoMergeCanaryMaxIterations,
    allowedLanes: [...canaryAllowedLanes],
    allowedPathsByLane: lowRiskAutoMergeCanaryAllowedPathsByLane,
  };
  if (!config.lowRiskAutoMergeCanaryApproved) return base;
  if (!config.configPath) return { ...base, mode: "unsafe", reason: "external config path is required" };
  if (!config.allowAutoMerge) return { ...base, mode: "unsafe", reason: "allowAutoMerge must be true for this approval mode" };
  if (!config.trustedRealRunCanaryApproved) {
    return { ...base, mode: "unsafe", reason: "trustedRealRunCanaryApproved must be true" };
  }
  if (config.trustedRealRunApproved) return { ...base, mode: "unsafe", reason: "trustedRealRunApproved must remain false" };
  if (requestedMaxIterations > lowRiskAutoMergeCanaryMaxIterations) {
    return { ...base, mode: "unsafe", reason: `maxIterations must be <= ${lowRiskAutoMergeCanaryMaxIterations}` };
  }
  if (Number(config.trustedRealRunCanaryMaxIterations || 0) > lowRiskAutoMergeCanaryMaxIterations) {
    return {
      ...base,
      mode: "unsafe",
      reason: `trustedRealRunCanaryMaxIterations must be <= ${lowRiskAutoMergeCanaryMaxIterations}`,
    };
  }
  if (unsafeToggles.length > 0) {
    return { ...base, mode: "unsafe", reason: `unsafe mutation toggles enabled: ${unsafeToggles.join(", ")}` };
  }
  return { ...base, approved: true, mode: "approved", reason: "explicit config-scoped low-risk auto-merge canary approval" };
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
    autoMergeCanaryApprovalMode: evaluateLowRiskAutoMergeCanaryApproval(config).mode,
    autoMergeCanaryApprovalReason: evaluateLowRiskAutoMergeCanaryApproval(config).reason,
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

function requestedMax(config) {
  return Number(config.requestedMaxIterations || config.maxIterations || 1);
}
