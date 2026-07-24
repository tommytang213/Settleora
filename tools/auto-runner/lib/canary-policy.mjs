import { writeFileSync } from "node:fs";
import path from "node:path";
import { safeTimestamp, slugify } from "./logger.mjs";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";
import { normalizeReviewFixMutationConfig } from "./review-fix-policy.mjs";
import { hasVerifiedExternalRuntimeEvidence } from "./runtime-identity.mjs";

export const canaryAllowedLanes = Object.freeze(["workflow-docs-tooling", "docs-planning", "client-ui-low-risk"]);
export const lowRiskAutoMergeCanaryAllowedPathsByLane = Object.freeze({
  "workflow-docs-tooling": Object.freeze(["tools/auto-runner/**", "docs/workflow/**"]),
  "docs-planning": Object.freeze(["docs/planning/**", "docs/qa/**"]),
  "client-ui-low-risk": Object.freeze(["apps/mobile/lib/ui/**", "apps/mobile/test/ui/**"]),
});
const lowRiskAutoMergeCanaryMaxIterations = 2;

export function evaluateTrustPolicy(config) {
  const unsafeToggles = unsafeTrustedToggles(config);
  const autoMergeCanaryApproval = evaluateLowRiskAutoMergeCanaryApproval(config);
  const reviewFixMutationApproval = evaluateReviewFixMutationApproval(config);
  if (config.dryRun) {
    return {
      allowed: true,
      mode: config.canary ? "canary-dry-run" : "dry-run",
      reason: config.canary ? "Canary dry-run is non-mutating." : "Dry-run is non-mutating.",
      unsafeToggles,
      autoMergeCanaryApproval,
      reviewFixMutationApproval,
    };
  }

  if (!config.run) {
    return {
      allowed: false,
      mode: config.canary ? "canary" : "normal",
      reason: "No trusted real-run mode was selected.",
      unsafeToggles,
      autoMergeCanaryApproval,
      reviewFixMutationApproval,
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
        reviewFixMutationApproval,
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
    const canaryUnsafeToggles = unsafeToggles.filter((toggle) => {
      if (toggle === "allowAutoMerge") return false;
      if (toggle === "reviewFixMutation" && reviewFixMutationApproval.approved) return false;
      return true;
    });
    if (canaryUnsafeToggles.length > 0) {
      return {
        allowed: false,
        mode: "canary",
        reason: `Canary real-run requires disabled mutation toggles: ${canaryUnsafeToggles.join(", ")}.`,
        unsafeToggles: canaryUnsafeToggles,
        autoMergeCanaryApproval,
        reviewFixMutationApproval,
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
        reviewFixMutationApproval,
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
      reviewFixMutationApproval,
    };
  }

  if (!config.trustedRealRunApproved) {
    return {
      allowed: false,
      mode: "normal",
      reason: "Normal --run requires trustedRealRunApproved: true in config; trusted real-run is disabled by default.",
      unsafeToggles,
      autoMergeCanaryApproval,
      reviewFixMutationApproval,
    };
  }
  const normalUnsafeToggles = unsafeToggles.filter((toggle) => toggle !== "allowAutoMerge");
  const productionFollowupApproval = evaluateProductionFollowupIssueApproval(config);
  const unapprovedNormalToggles = normalUnsafeToggles.filter((toggle) => {
    if (toggle === "allowFollowupIssueCreation") return !productionFollowupApproval.approved;
    if (toggle === "reviewFixMutation") return !reviewFixMutationApproval.approved;
    return true;
  });
  if (unapprovedNormalToggles.length > 0) {
    return {
      allowed: false,
      mode: "normal",
      reason: `Normal trusted real-run requires disabled mutation toggles: ${unapprovedNormalToggles.join(", ")}.`,
      unsafeToggles: unapprovedNormalToggles,
      autoMergeCanaryApproval,
      reviewFixMutationApproval,
      productionFollowupApproval,
    };
  }
  return {
    allowed: true,
    mode: "normal",
    reason: "Normal trusted real-run approval is enabled.",
    unsafeToggles,
    autoMergeCanaryApproval,
    reviewFixMutationApproval,
    productionFollowupApproval,
  };
}

export function evaluateProductionFollowupIssueApproval(config) {
  const approvedLanes = Array.isArray(config.autoMergePolicy?.approvedLanes)
    ? config.autoMergePolicy.approvedLanes.filter((lane) => typeof lane === "string" && lane.length > 0)
    : [];
  const maxPerRun = Number(config.maxFollowupIssuesPerRun);
  const base = {
    approved: false,
    approvedLanes,
    maxFollowupIssuesPerRun: Number.isInteger(maxPerRun) ? maxPerRun : null,
  };
  if (!config.allowFollowupIssueCreation) return { ...base, reason: "follow-up issue creation is disabled" };
  if (!config.configPath || !config.trustedRealRunApproved || !hasVerifiedExternalRuntimeEvidence(config)) {
    return { ...base, reason: "verified external runtime and trusted production config are required" };
  }
  if (!config.allowAutoMerge || approvedLanes.length === 0) {
    return { ...base, reason: "approved-domain auto-merge lanes are required" };
  }
  if (!Number.isInteger(maxPerRun) || maxPerRun < 1 || maxPerRun > 3) {
    return { ...base, reason: "maxFollowupIssuesPerRun must be an integer from 1 through 3" };
  }
  const reviewFixApproval = evaluateReviewFixMutationApproval(config);
  if (!reviewFixApproval.approved) {
    return { ...base, reason: `bounded production review-fix approval is required: ${reviewFixApproval.reason}` };
  }
  if (config.allowStaleClaimSteal || config.allowSystemdEnablement) {
    return { ...base, reason: "follow-up creation cannot mix with stale-claim stealing or systemd self-enablement" };
  }
  return { ...base, approved: true, reviewFixApprovalMode: reviewFixApproval.mode, reason: "bounded external production follow-up approval" };
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
    if (!config.autoMergePolicy?.approvedLanes?.includes(laneDecision.lane)) {
      return { allowed: false, reason: `Canary auto-merge lane is not approved by the active profile: ${laneDecision.lane}.` };
    }
    const approval = evaluateLowRiskAutoMergeCanaryApproval(config);
    if (!approval.approved) {
      return { allowed: false, reason: `Canary auto-merge contract requires explicit low-risk approval: ${approval.reason}.` };
    }
    const approvedPaths = lowRiskAutoMergeCanaryAllowedPathsByLane[laneDecision.lane] || [];
    const contractPaths = laneDecision.contract?.allowedPaths || laneDecision.allowedPaths || [];
    const unsafeSubsetPath = contractPaths.find(
      (glob) => !approvedPaths.some((approvedGlob) => globIsSubsetOf(glob, approvedGlob)),
    );
    if (contractPaths.length === 0 || unsafeSubsetPath) {
      return {
        allowed: false,
        reason: `Low-risk auto-merge canary requires allowedPaths to be non-empty safe subsets for ${laneDecision.lane}: ${approvedPaths.join(", ")}.`,
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
    if (laneDecision.followupIssueCreationAllowed) {
      return { allowed: false, reason: "Canary mode refuses follow-up issue creation." };
    }
    if ((config.allowReviewFixMutation || normalizeReviewFixMutationConfig(config).maxAttempts > 0) && !evaluateReviewFixMutationApproval(config).approved) {
      return { allowed: false, reason: `Canary review-fix mutation requires explicit low-risk approval: ${evaluateReviewFixMutationApproval(config).reason}.` };
    }
    return { allowed: true, reason: "Low-risk auto-merge canary issue policy accepted the contracted safe subset." };
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
  const reviewFixApproval = evaluateReviewFixMutationApproval(config);
  const unsafeToggles = unsafeTrustedToggles(config).filter((toggle) => {
    if (toggle === "allowAutoMerge") return false;
    if (toggle === "reviewFixMutation" && reviewFixApproval.approved) return false;
    return true;
  });
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
    reviewFixMutationApproval: reviewFixApproval,
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

export function evaluateReviewFixMutationApproval(config) {
  const reviewFix = normalizeReviewFixMutationConfig(config);
  const base = {
    approved: false,
    mode: "not_approved",
    reason: "allowReviewFixMutation is not true with a positive maxReviewFixCycles",
    configPathUsed: config.configPath || null,
    allowReviewFixMutation: Boolean(config.allowReviewFixMutation),
    maxReviewFixCycles: reviewFix.maxAttempts,
    requestedMaxReviewFixCycles: reviewFix.requestedMaxAttempts,
    maxAllowedReviewFixCycles: reviewFix.maxAllowedAttempts,
    trustedRealRunCanaryApproved: Boolean(config.trustedRealRunCanaryApproved),
    trustedRealRunApproved: Boolean(config.trustedRealRunApproved),
    allowAutoMerge: Boolean(config.allowAutoMerge),
    lowRiskAutoMergeCanaryApproved: Boolean(config.lowRiskAutoMergeCanaryApproved),
    allowFollowupIssueCreation: Boolean(config.allowFollowupIssueCreation),
    allowStaleClaimSteal: Boolean(config.allowStaleClaimSteal),
    allowSystemdEnablement: Boolean(config.allowSystemdEnablement),
    allowedLanes: [...canaryAllowedLanes],
  };
  if (!config.allowReviewFixMutation || reviewFix.maxAttempts <= 0) return base;
  if (!config.configPath) return { ...base, mode: "unsafe", reason: "external config path is required" };
  if (config.trustedRealRunApproved) {
    if (!hasVerifiedExternalRuntimeEvidence(config)) {
      return { ...base, mode: "unsafe", reason: "verified external runtime evidence is required for production review-fix mutation" };
    }
    const approvedLanes = Array.isArray(config.autoMergePolicy?.approvedLanes)
      ? config.autoMergePolicy.approvedLanes.filter((lane) => typeof lane === "string" && lane.length > 0)
      : [];
    if (!config.allowAutoMerge) {
      return { ...base, mode: "unsafe", reason: "production review-fix mutation requires approved-domain auto-merge" };
    }
    if (approvedLanes.length === 0) {
      return { ...base, mode: "unsafe", reason: "production review-fix mutation requires non-empty approved auto-merge lanes" };
    }
    if (config.allowStaleClaimSteal || config.allowSystemdEnablement) {
      return { ...base, mode: "unsafe", reason: "production review-fix mutation cannot mix with stale-claim stealing or systemd self-enablement" };
    }
    if (reviewFix.requestedMaxAttempts > reviewFix.maxAllowedAttempts) {
      return { ...base, allowedLanes: approvedLanes, mode: "approved_production_clamped", approved: true, reason: "explicit production review-fix approval with attempts clamped to safe maximum" };
    }
    return { ...base, allowedLanes: approvedLanes, approved: true, mode: "approved_production", reason: "explicit external production review-fix mutation approval" };
  }
  if (!config.trustedRealRunCanaryApproved) {
    return { ...base, mode: "unsafe", reason: "trustedRealRunCanaryApproved must be true" };
  }
  if (config.trustedRealRunApproved) return { ...base, mode: "unsafe", reason: "trustedRealRunApproved must remain false" };
  if (!config.allowAutoMerge || !config.lowRiskAutoMergeCanaryApproved) {
    return { ...base, mode: "unsafe", reason: "review-fix mutation requires the bounded low-risk auto-merge canary approval path" };
  }
  if (config.allowFollowupIssueCreation || config.allowStaleClaimSteal || config.allowSystemdEnablement) {
    return { ...base, mode: "unsafe", reason: "review-fix mutation cannot mix with follow-up issue creation, stale-claim stealing, or systemd enablement" };
  }
  if (reviewFix.requestedMaxAttempts > reviewFix.maxAllowedAttempts) {
    return { ...base, mode: "approved_clamped", approved: true, reason: "explicit low-risk review-fix approval with attempts clamped to safe maximum" };
  }
  return { ...base, approved: true, mode: "approved", reason: "explicit config-scoped low-risk review-fix mutation approval" };
}

export function writeCanaryEvidence(config, iteration) {
  if (!config.canary) return null;
  const issuePart = iteration.issue ? `issue-${iteration.issue.number}-${slugify(iteration.issue.title || "untitled", 40)}` : "no-issue";
  const evidencePath = path.join(config.canaryEvidenceRoot, `${safeTimestamp()}-${issuePart}.json`);
  const evidence = sanitizeEvidence({
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
  });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { evidencePath };
}

function globIsSubsetOf(childGlob, parentGlob) {
  if (parentGlob.endsWith("/**")) {
    const parentPrefix = parentGlob.slice(0, -2);
    return childGlob === parentGlob || childGlob.startsWith(parentPrefix);
  }
  return childGlob === parentGlob;
}

function sanitizeEvidence(value) {
  return sanitizePersistedEvidence(value);
}

function unsafeTrustedToggles(config) {
  const unsafe = [];
  if (config.allowAutoMerge) unsafe.push("allowAutoMerge");
  if (config.allowFollowupIssueCreation) unsafe.push("allowFollowupIssueCreation");
  if (config.allowStaleClaimSteal) unsafe.push("allowStaleClaimSteal");
  if (config.allowReviewFixMutation || Number(config.maxReviewFixCycles || 0) > 0) unsafe.push("reviewFixMutation");
  if (config.allowSystemdEnablement) unsafe.push("allowSystemdEnablement");
  return unsafe;
}

function requestedMax(config) {
  return Number(config.requestedMaxIterations || config.maxIterations || 1);
}
