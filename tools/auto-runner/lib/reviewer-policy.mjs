import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifyLargeCandidate } from "./large-candidate-review-routing.mjs";

export const reviewerTierIds = Object.freeze([
  "cheap_independent",
  "strong_independent",
  "tie_breaker",
  "codex_mechanics",
]);

const reviewerTierRank = Object.freeze({
  cheap_independent: 1,
  strong_independent: 2,
  tie_breaker: 3,
  block_split_or_escalate: 4,
  split_or_escalate: 4,
});

export const defaultReviewerTiers = Object.freeze({
  cheap_independent: Object.freeze({
    enabled: false,
    provider: null,
    providerProfile: "unconfigured-cheap-independent",
    command: null,
    model: null,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
  }),
  strong_independent: Object.freeze({
    enabled: false,
    provider: null,
    providerProfile: "unconfigured-strong-independent",
    command: null,
    model: null,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
  }),
  tie_breaker: Object.freeze({
    enabled: false,
    provider: null,
    providerProfile: "unconfigured-tie-breaker",
    command: null,
    model: null,
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
  }),
  codex_mechanics: Object.freeze({
    enabled: true,
    provider: "codex",
    providerProfile: "codex-mechanics-default",
    command: "codex-vm-full",
    model: "codex-subscription",
    inputUsdPerMillionTokens: 0,
    outputUsdPerMillionTokens: 0,
  }),
});

export const defaultReviewerBudget = Object.freeze({
  monthlyReviewerBudgetUsd: 80,
  monthlyReviewerHardStopUsd: 95,
  totalMonthlyAutomationBudgetUsd: 300,
  codexSubscriptionBudgetUsd: 200,
  warnAtPercent: 80,
});

export const defaultLargeBundleReviewApproval = Object.freeze({
  enabled: false,
  approvals: Object.freeze([]),
});

const sensitivePathPatterns = Object.freeze([
  /^services\/api(?:\/|$)/,
  /^packages\/contracts\/openapi(?:\/|$)/,
  /^packages\/client-(web|dart)(?:\/|$)/,
  /^infra(?:\/|$)/,
  /^\.github\/workflows(?:\/|$)/,
  /^apps\/mobile(?:\/|$)/,
  /(^|\/)migrations?(\/|$)/i,
  /(^|\/)(auth|authentication|authorization|session|security|credential|token|mfa|passkey)(\/|$)/i,
  /(^|\/)(storage|privacy|vault|file|permission|authz)(\/|$)/i,
  /(^|\/)(money|settlement|payment|bill|rounding|currency|balance)(\/|$)/i,
  /(^|\/)(openapi|generated)(\/|$)/i,
]);

const workflowPathPatterns = Object.freeze([/^tools\/auto-runner(?:\/|$)/, /^docs\/workflow(?:\/|$)/]);
const docsPathPatterns = Object.freeze([/^docs\/(?:workflow|planning|qa)(?:\/|$)/, /^\.ai(?:\/|$)/]);

export function mergeReviewerPolicyConfig(config) {
  return {
    reviewerTiers: mergeReviewerTiers(config.reviewerTiers),
    reviewerBudget: normalizeReviewerBudget(config.reviewerBudget),
  };
}

export function normalizeLargeBundleReviewApprovalConfig(config = {}) {
  const enabled = Boolean(config?.enabled ?? defaultLargeBundleReviewApproval.enabled);
  const approvals = config?.approvals ?? [];
  if (!Array.isArray(approvals)) {
    throw new Error("largeBundleReviewApproval.approvals must be an array");
  }
  if (approvals.length > 16) {
    throw new Error("largeBundleReviewApproval.approvals exceeds the bounded approval limit");
  }
  return Object.freeze({
    enabled,
    approvals: Object.freeze(approvals.map(normalizeLargeBundleApproval)),
  });
}

export function mergeReviewerTiers(tiers = {}) {
  const merged = {};
  for (const tierId of reviewerTierIds) {
    const tier = tiers?.[tierId] || {};
    merged[tierId] = {
      ...defaultReviewerTiers[tierId],
      ...tier,
      enabled: Boolean(tier.enabled ?? defaultReviewerTiers[tierId].enabled),
      command: tier.command ?? defaultReviewerTiers[tierId].command,
      provider: tier.provider ?? defaultReviewerTiers[tierId].provider,
      providerProfile: String(tier.providerProfile ?? defaultReviewerTiers[tierId].providerProfile),
      model: normalizeModelIdentifier(tier.model ?? defaultReviewerTiers[tierId].model),
      inputUsdPerMillionTokens: tierId === "codex_mechanics" ? nonNegativeNumber(
        tier.inputUsdPerMillionTokens ?? defaultReviewerTiers[tierId].inputUsdPerMillionTokens,
      ) : positiveNumber(
        tier.inputUsdPerMillionTokens ?? defaultReviewerTiers[tierId].inputUsdPerMillionTokens,
      ),
      outputUsdPerMillionTokens: tierId === "codex_mechanics" ? nonNegativeNumber(
        tier.outputUsdPerMillionTokens ?? defaultReviewerTiers[tierId].outputUsdPerMillionTokens,
      ) : positiveNumber(
        tier.outputUsdPerMillionTokens ?? defaultReviewerTiers[tierId].outputUsdPerMillionTokens,
      ),
    };
  }
  return merged;
}

export function normalizeReviewerBudget(budget = {}) {
  return {
    monthlyReviewerBudgetUsd: positiveNumber(
      budget.monthlyReviewerBudgetUsd ?? defaultReviewerBudget.monthlyReviewerBudgetUsd,
    ),
    monthlyReviewerHardStopUsd: positiveNumber(
      budget.monthlyReviewerHardStopUsd ?? defaultReviewerBudget.monthlyReviewerHardStopUsd,
    ),
    totalMonthlyAutomationBudgetUsd: positiveNumber(
      budget.totalMonthlyAutomationBudgetUsd ?? defaultReviewerBudget.totalMonthlyAutomationBudgetUsd,
    ),
    codexSubscriptionBudgetUsd: nonNegativeNumber(
      budget.codexSubscriptionBudgetUsd ?? defaultReviewerBudget.codexSubscriptionBudgetUsd,
    ),
    warnAtPercent: positiveNumber(budget.warnAtPercent ?? defaultReviewerBudget.warnAtPercent),
  };
}

export function estimateReviewerCostUsd({
  inputTokens,
  outputTokens,
  inputUsdPerMillionTokens,
  outputUsdPerMillionTokens,
}) {
  const input = nonNegativeNumber(inputTokens);
  const output = nonNegativeNumber(outputTokens);
  const inputPrice = nonNegativeNumber(inputUsdPerMillionTokens);
  const outputPrice = nonNegativeNumber(outputUsdPerMillionTokens);
  return roundUsd((input / 1_000_000) * inputPrice + (output / 1_000_000) * outputPrice);
}

export function evaluateReviewerBudget({ reviewerBudget, currentMonthlySpendUsd = 0, estimatedCostUsd = 0 }) {
  const budget = normalizeReviewerBudget(reviewerBudget);
  const current = nonNegativeNumber(currentMonthlySpendUsd);
  const estimate = nonNegativeNumber(estimatedCostUsd);
  const projectedReviewerSpendUsd = roundUsd(current + estimate);
  const warnThresholdUsd = roundUsd((budget.monthlyReviewerBudgetUsd * budget.warnAtPercent) / 100);
  const automationTotalProjectedUsd = roundUsd(projectedReviewerSpendUsd + budget.codexSubscriptionBudgetUsd);
  const hardStop = projectedReviewerSpendUsd > budget.monthlyReviewerHardStopUsd;
  return {
    currentMonthlySpendUsd: roundUsd(current),
    estimatedCostUsd: roundUsd(estimate),
    projectedReviewerSpendUsd,
    warnThresholdUsd,
    warn: projectedReviewerSpendUsd >= warnThresholdUsd,
    hardStop,
    block: hardStop,
    monthlyReviewerBudgetUsd: budget.monthlyReviewerBudgetUsd,
    monthlyReviewerHardStopUsd: budget.monthlyReviewerHardStopUsd,
    totalMonthlyAutomationBudgetUsd: budget.totalMonthlyAutomationBudgetUsd,
    codexSubscriptionBudgetUsd: budget.codexSubscriptionBudgetUsd,
    automationTotalProjectedUsd,
    totalBudgetExceeded: automationTotalProjectedUsd > budget.totalMonthlyAutomationBudgetUsd,
  };
}

export function loadReviewerAccounting(config, now = new Date()) {
  const accountingPath = path.join(config.logsRoot, "state", "reviewer-accounting.json");
  if (!existsSync(accountingPath)) {
    return {
      accountingPath,
      exists: false,
      monthKey: monthKey(now),
      currentMonthlySpendUsd: 0,
      entries: [],
    };
  }
  const parsed = JSON.parse(readFileSync(accountingPath, "utf8"));
  const key = monthKey(now);
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const currentMonthlySpendUsd = entries
    .filter((entry) => entry.monthKey === key)
    .reduce((sum, entry) => sum + nonNegativeNumber(entry.costUsd), 0);
  return {
    accountingPath,
    exists: true,
    monthKey: key,
    currentMonthlySpendUsd: roundUsd(currentMonthlySpendUsd),
    entries,
  };
}

export function routeReviewer({
  changedFiles = [],
  laneDecision = null,
  stats = {},
  largeBundleReviewApproval = defaultLargeBundleReviewApproval,
  reviewPackageEvidence = null,
  featureBundle = null,
  taskContract = null,
  now = new Date(),
} = {}) {
  const files = changedFiles.map(normalizePath);
  const additions = nonNegativeNumber(stats.additions || 0);
  const deletions = nonNegativeNumber(stats.deletions || 0);
  const totalChangedLines = additions + deletions;
  const sensitiveFiles = files.filter(isSensitivePath);
  const domains = detectDomains(files, laneDecision);
  const normalizedDomainSet = normalizeDomainSet(domains);
  const crossDomainCount = domains.filter((domain) => !isWorkflowPolicyDomain(domain)).length;
  const huge = files.length >= 40 || totalChangedLines >= 2000 || crossDomainCount >= 4;
  const large = files.length >= 15 || totalChangedLines >= 800;
  const docsOnly = files.length > 0 && files.every(isDocsPath);
  const workflowTooling = files.some(isWorkflowPath) || laneDecision?.lane === "workflow-docs-tooling";
  const clientUiLowRisk =
    laneDecision?.lane === "client-ui-low-risk" &&
    files.length > 0 &&
    files.every((file) => /^apps\/mobile\/(lib|test)\/ui(?:\/|$)/.test(file));

  const largeClassification = classifyLargeCandidate({ changedFiles: files, laneDecision, stats: { additions, deletions }, featureBundle, taskContract });
  if (largeClassification.route === "split_or_block") {
    return decision("block_split_or_escalate", "Mixed or unsafe candidate requires a deterministic split or an exact manual scope decision.", {
      sensitiveFiles, domains, normalizedDomainSet, totalChangedLines, changedFileCount: files.length, block: true, largeCandidateRouting: largeClassification,
    });
  }
  if (largeClassification.route === "large_bundle_escalation" && largeClassification.coherent) {
    const laneRequiredTier = normalizeLaneRequiredTier(laneDecision?.reviewerTier, laneDecision);
    return decision(maxReviewerTier("strong_independent", laneRequiredTier), "Coherent large candidate automatically escalates to complete strong cumulative review.", {
      sensitiveFiles, domains, normalizedDomainSet, totalChangedLines, changedFileCount: files.length, strongRequired: true, largeCandidateRouting: largeClassification,
      largeBundleApproval: { ok: false, matched: false, reason: "large_bundle_approval_not_routine_prerequisite" },
    });
  }

  if (huge) {
    const approval = evaluateLargeBundleReviewApproval({
      approvalConfig: largeBundleReviewApproval,
      changedFiles: files,
      laneDecision,
      stats: { additions, deletions, files: files.length },
      domains,
      normalizedDomainSet,
      sensitiveFiles,
      reviewPackageEvidence,
      sizeBlockOnly: (files.length >= 40 || totalChangedLines >= 2000) && crossDomainCount < 4,
      now,
    });
    if (approval.ok) {
      const approvedTier = maxReviewerTier("strong_independent", approval.requiredReviewerTier);
      return decision(approvedTier, "Exact large-bundle review approval permits strong independent review while preserving the candidate merge contract.", {
        sensitiveFiles,
        domains,
        normalizedDomainSet,
        totalChangedLines,
        changedFileCount: files.length,
        strongRequired: true,
        largeCandidateRouting: largeClassification,
        largeBundleApproval: approval.evidence,
      });
    }
    return decision("block_split_or_escalate", "Mixed or unsafe large candidate requires a deterministic split or an exact manual scope decision.", {
      sensitiveFiles,
      domains,
      normalizedDomainSet,
      totalChangedLines,
      changedFileCount: files.length,
      block: true,
      largeCandidateRouting: largeClassification,
      largeBundleApproval: approval.evidence,
    });
  }
  const laneRequiredTier = normalizeLaneRequiredTier(laneDecision?.reviewerTier, laneDecision);
  if (clientUiLowRisk && !large) {
    return decision(maxReviewerTier("cheap_independent", laneRequiredTier), "Real-code client UI low-risk canary requires cheap independent review before auto-merge.", {
      sensitiveFiles,
      domains,
      normalizedDomainSet,
      totalChangedLines,
      changedFileCount: files.length,
      realCodeIndependentRequired: true,
      laneRequiredTier,
    });
  }
  if (sensitiveFiles.length > 0 || laneDecision?.dangerGate) {
    return decision(maxReviewerTier("strong_independent", laneRequiredTier), "Sensitive path or danger-gated scope requires strong independent review.", {
      sensitiveFiles,
      domains,
      normalizedDomainSet,
      totalChangedLines,
      changedFileCount: files.length,
      strongRequired: true,
      laneRequiredTier,
      largeCandidateRouting: largeClassification,
    });
  }
  if (large) {
    return decision(maxReviewerTier("strong_independent", laneRequiredTier), "Large PR size crosses strong-review threshold.", {
      sensitiveFiles,
      domains,
      normalizedDomainSet,
      totalChangedLines,
      changedFileCount: files.length,
      strongRequired: true,
      laneRequiredTier,
      largeCandidateRouting: largeClassification,
    });
  }
  if (docsOnly) {
    return decision(maxReviewerTier("cheap_independent", laneRequiredTier), "Docs, ledger, or workflow docs default to cheap independent review.", {
      sensitiveFiles,
      domains,
      normalizedDomainSet,
      totalChangedLines,
      changedFileCount: files.length,
      laneRequiredTier,
    });
  }
  if (workflowTooling) {
    return decision(maxReviewerTier("cheap_independent", laneRequiredTier), "Auto-runner tooling defaults to cheap independent review unless size or sensitivity escalates.", {
      sensitiveFiles,
      domains,
      totalChangedLines,
      changedFileCount: files.length,
      laneRequiredTier,
    });
  }
  return decision(maxReviewerTier("cheap_independent", laneRequiredTier), "Normal feature PR defaults to cheap independent review unless risk escalates.", {
    sensitiveFiles,
    domains,
    normalizedDomainSet,
    totalChangedLines,
    changedFileCount: files.length,
    laneRequiredTier,
  });
}

export function evaluateLargeBundleReviewApproval({
  approvalConfig = defaultLargeBundleReviewApproval,
  changedFiles = [],
  laneDecision = null,
  stats = {},
  domains = null,
  normalizedDomainSet = null,
  sensitiveFiles = null,
  reviewPackageEvidence = null,
  sizeBlockOnly = false,
  now = new Date(),
} = {}) {
  const files = changedFiles.map(normalizePath).filter(Boolean).sort();
  const additions = nonNegativeNumber(stats.additions || 0);
  const deletions = nonNegativeNumber(stats.deletions || 0);
  const totalChangedLines = additions + deletions;
  const detectedDomains = Array.isArray(domains) ? domains : detectDomains(files, laneDecision);
  const approvedDomains = Array.isArray(normalizedDomainSet) ? normalizedDomainSet : normalizeDomainSet(detectedDomains);
  const sensitive = Array.isArray(sensitiveFiles) ? sensitiveFiles : files.filter(isSensitivePath);
  const evidenceBase = {
    ok: false,
    reason: "large_bundle_review_approval_disabled",
    enabled: Boolean(approvalConfig?.enabled),
    matched: false,
    reasonCode: null,
    normalizedDomainSet: approvedDomains,
    approvalCount: Array.isArray(approvalConfig?.approvals) ? approvalConfig.approvals.length : 0,
  };
  if (!approvalConfig?.enabled) return failApproval(evidenceBase, "large_bundle_review_approval_disabled");
  if (!Array.isArray(approvalConfig.approvals) || approvalConfig.approvals.length === 0) {
    return failApproval(evidenceBase, "large_bundle_review_approval_missing");
  }
  if (!sizeBlockOnly) return failApproval(evidenceBase, "large_bundle_review_not_size_only");
  if (laneDecision?.splitRequired || laneDecision?.branchStrategy === "split-required") {
    return failApproval(evidenceBase, "large_bundle_review_split_required");
  }
  if (laneDecision?.manualActionRequired || laneDecision?.manualDecisionRequired || laneDecision?.genuineManualDecisionRequired) {
    return failApproval(evidenceBase, "large_bundle_review_manual_action_required");
  }
  if (laneDecision?.dangerGate) return failApproval(evidenceBase, "large_bundle_review_danger_gate");
  if (laneDecision?.lane !== "workflow-docs-tooling") return failApproval(evidenceBase, "large_bundle_review_wrong_lane");
  if (sensitive.length > 0) return failApproval(evidenceBase, "large_bundle_review_sensitive_scope");
  if (approvedDomains.length !== 1 || approvedDomains[0] !== "workflow-docs-tooling") {
    return failApproval(evidenceBase, "large_bundle_review_domain_mismatch");
  }

  const packageEvidence = normalizeLargeBundlePackageEvidence(reviewPackageEvidence);
  const packageProblem = validateLargeBundlePackageEvidence(packageEvidence);
  if (packageProblem) return failApproval(evidenceBase, packageProblem);

  for (const approval of approvalConfig.approvals) {
    const mismatch = matchLargeBundleApproval({
      approval,
      packageEvidence,
      files,
      additions,
      deletions,
      totalChangedLines,
      normalizedDomainSet: approvedDomains,
      now,
    });
    if (!mismatch) {
      return {
        ok: true,
        requiredReviewerTier: approval.requiredReviewerTier,
        evidence: {
          ...evidenceBase,
          ok: true,
          matched: true,
          reason: "exact_large_bundle_review_approved",
          reasonCode: "exact_large_bundle_review_approved",
          schemaVersion: approval.schemaVersion,
          issueNumber: approval.issueNumber,
          repositorySlug: approval.repositorySlug,
          lane: approval.lane,
          baseSha: approval.baseSha,
          headSha: approval.headSha,
          changedFileCount: files.length,
          totalChangedLines,
          maxFiles: approval.maxFiles,
          maxChangedLines: approval.maxChangedLines,
          requiredReviewerTier: approval.requiredReviewerTier,
          manualMergeRequired: approval.manualMergeRequired,
          autoMergeEligible: approval.autoMergeEligible,
          taskKey: approval.taskKey,
          reasonCode: "exact_large_bundle_review_approved",
        },
      };
    }
  }
  return failApproval(evidenceBase, "large_bundle_review_no_matching_approval");
}

export function reviewerReadinessSummary(config, sample = {}) {
  const { reviewerTiers, reviewerBudget } = mergeReviewerPolicyConfig(config);
  const accounting = loadReviewerAccounting(config);
  const route = routeReviewer(sample);
  const selectedTier = reviewerTiers[route.tier] || null;
  const estimatedCostUsd = selectedTier
    ? estimateReviewerCostUsd({
        inputTokens: sample.estimatedInputTokens || 0,
        outputTokens: sample.estimatedOutputTokens || 0,
        inputUsdPerMillionTokens: selectedTier.inputUsdPerMillionTokens,
        outputUsdPerMillionTokens: selectedTier.outputUsdPerMillionTokens,
      })
    : 0;
  const budget = evaluateReviewerBudget({
    reviewerBudget,
    currentMonthlySpendUsd: accounting.currentMonthlySpendUsd,
    estimatedCostUsd,
  });
  return {
    tiers: Object.fromEntries(
      Object.entries(reviewerTiers).map(([tierId, tier]) => [
        tierId,
        {
          enabled: Boolean(tier.enabled),
          provider: tier.provider,
          providerProfile: tier.providerProfile,
          commandConfigured: Boolean(tier.command),
          model: tier.model,
          inputUsdPerMillionTokens: tier.inputUsdPerMillionTokens,
          outputUsdPerMillionTokens: tier.outputUsdPerMillionTokens,
        },
      ]),
    ),
    budget,
    accounting: {
      accountingPath: accounting.accountingPath,
      exists: accounting.exists,
      monthKey: accounting.monthKey,
      currentMonthlySpendUsd: accounting.currentMonthlySpendUsd,
    },
    sampleRoute: {
      ...route,
      selectedTierConfigured: Boolean(selectedTier?.enabled && selectedTier?.command),
      estimatedCostUsd,
    },
  };
}

function decision(tier, reason, extras) {
  return { tier, reason, ...extras };
}

function normalizeLargeBundleApproval(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`largeBundleReviewApproval.approvals[${index}] must be an object`);
  }
  const approval = {
    schemaVersion: positiveInteger(raw.schemaVersion ?? raw.version, `largeBundleReviewApproval.approvals[${index}].schemaVersion`),
    issueNumber: positiveInteger(raw.issueNumber, `largeBundleReviewApproval.approvals[${index}].issueNumber`),
    repositorySlug: boundedIdentifier(raw.repositorySlug, `largeBundleReviewApproval.approvals[${index}].repositorySlug`, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    lane: boundedIdentifier(raw.lane, `largeBundleReviewApproval.approvals[${index}].lane`, /^[a-z0-9][a-z0-9-]{0,80}$/),
    baseSha: shaIdentifier(raw.baseSha, `largeBundleReviewApproval.approvals[${index}].baseSha`),
    headSha: shaIdentifier(raw.headSha, `largeBundleReviewApproval.approvals[${index}].headSha`),
    changedFilesDigest: sha256Identifier(raw.changedFilesDigest, `largeBundleReviewApproval.approvals[${index}].changedFilesDigest`),
    rawDiffSha256: sha256Identifier(raw.rawDiffSha256, `largeBundleReviewApproval.approvals[${index}].rawDiffSha256`),
    providerBoundDiffSha256: sha256Identifier(raw.providerBoundDiffSha256, `largeBundleReviewApproval.approvals[${index}].providerBoundDiffSha256`),
    changedFileCount: nonNegativeInteger(raw.changedFileCount, `largeBundleReviewApproval.approvals[${index}].changedFileCount`),
    additions: nonNegativeInteger(raw.additions, `largeBundleReviewApproval.approvals[${index}].additions`),
    deletions: nonNegativeInteger(raw.deletions, `largeBundleReviewApproval.approvals[${index}].deletions`),
    totalChangedLines: nonNegativeInteger(raw.totalChangedLines, `largeBundleReviewApproval.approvals[${index}].totalChangedLines`),
    normalizedDomainSet: normalizeConfiguredDomainSet(raw.normalizedDomainSet, index),
    maxFiles: nonNegativeInteger(raw.maxFiles, `largeBundleReviewApproval.approvals[${index}].maxFiles`),
    maxChangedLines: nonNegativeInteger(raw.maxChangedLines, `largeBundleReviewApproval.approvals[${index}].maxChangedLines`),
    requiredReviewerTier: normalizeStrongOrBetterTier(raw.requiredReviewerTier, index),
    manualMergeRequired: raw.manualMergeRequired === true,
    autoMergeEligible: raw.autoMergeEligible === true,
    expiresAt: raw.expiresAt ? validIsoTimestamp(raw.expiresAt, `largeBundleReviewApproval.approvals[${index}].expiresAt`) : null,
    taskKey: raw.taskKey ? boundedIdentifier(raw.taskKey, `largeBundleReviewApproval.approvals[${index}].taskKey`, /^[0-9]{8}-[0-9]{4}$/) : null,
    humanDirectedBundleReasonCode: boundedIdentifier(raw.humanDirectedBundleReasonCode, `largeBundleReviewApproval.approvals[${index}].humanDirectedBundleReasonCode`, /^[a-z0-9][a-z0-9_-]{0,80}$/),
    allowedTaskKeys: normalizeTaskKeys(raw.allowedTaskKeys, index),
  };
  if (approval.schemaVersion !== 1) {
    throw new Error(`Unsupported large-bundle approval schema version: ${approval.schemaVersion}`);
  }
  if (approval.manualMergeRequired === approval.autoMergeEligible) {
    throw new Error(`largeBundleReviewApproval.approvals[${index}] must declare exactly one merge path`);
  }
  if (approval.maxFiles < approval.changedFileCount) {
    throw new Error(`largeBundleReviewApproval.approvals[${index}].maxFiles is lower than changedFileCount`);
  }
  if (approval.maxChangedLines < approval.totalChangedLines) {
    throw new Error(`largeBundleReviewApproval.approvals[${index}].maxChangedLines is lower than totalChangedLines`);
  }
  if (!approval.expiresAt && !approval.taskKey) {
    throw new Error(`largeBundleReviewApproval.approvals[${index}] must include expiresAt or taskKey`);
  }
  return Object.freeze(approval);
}

function normalizeLargeBundlePackageEvidence(raw) {
  const evidence = raw && typeof raw === "object" ? raw : {};
  return {
    issueNumber: integerOrNull(evidence.issueNumber),
    repositorySlug: stringOrNull(evidence.repositorySlug),
    lane: stringOrNull(evidence.lane),
    baseSha: stringOrNull(evidence.baseSha),
    headSha: stringOrNull(evidence.headSha),
    changedFilesDigest: stringOrNull(evidence.changedFilesDigest),
    rawDiffSha256: stringOrNull(evidence.rawDiffSha256),
    providerBoundDiffSha256: stringOrNull(evidence.providerBoundDiffSha256),
    changedFileCount: integerOrNull(evidence.changedFileCount),
    additions: integerOrNull(evidence.additions),
    deletions: integerOrNull(evidence.deletions),
    totalChangedLines: integerOrNull(evidence.totalChangedLines),
    normalizedDomainSet: Array.isArray(evidence.normalizedDomainSet) ? evidence.normalizedDomainSet.map(String).sort() : [],
    manualMergeRequired: evidence.manualMergeRequired === true,
    autoMergeEligible: evidence.autoMergeEligible === true,
    stopLabelPresent: evidence.stopLabelPresent === true,
    validationPassed: evidence.validationPassed === true,
    validationHeadSha: stringOrNull(evidence.validationHeadSha),
    secretBoundaryOk: evidence.secretBoundaryOk === true,
    packageComplete: evidence.packageComplete === true,
    diffTruncated: evidence.diffTruncated === true,
    taskKey: stringOrNull(evidence.taskKey),
    bundleTaskKeys: Array.isArray(evidence.bundleTaskKeys) ? evidence.bundleTaskKeys.map(String).sort() : [],
    manualActionRequired: evidence.manualActionRequired === true,
  };
}

function validateLargeBundlePackageEvidence(evidence) {
  if (!evidence.packageComplete || evidence.diffTruncated) return "large_bundle_review_package_incomplete";
  if (evidence.manualActionRequired) return "large_bundle_review_manual_action_required";
  if (evidence.stopLabelPresent) return "large_bundle_review_stop_label_present";
  if (!evidence.secretBoundaryOk) return "large_bundle_review_secret_boundary_blocked";
  if (!evidence.validationPassed) return "large_bundle_review_validation_missing";
  if (evidence.manualMergeRequired === evidence.autoMergeEligible) return "large_bundle_review_merge_contract_invalid";
  if (!evidence.issueNumber || !evidence.repositorySlug || !evidence.lane || !evidence.baseSha || !evidence.headSha) {
    return "large_bundle_review_missing_identity_evidence";
  }
  if (!evidence.changedFilesDigest || !evidence.rawDiffSha256 || !evidence.providerBoundDiffSha256) {
    return "large_bundle_review_missing_digest_evidence";
  }
  if (
    evidence.changedFileCount === null ||
    evidence.additions === null ||
    evidence.deletions === null ||
    evidence.totalChangedLines === null
  ) {
    return "large_bundle_review_missing_stat_evidence";
  }
  if (evidence.validationHeadSha && evidence.validationHeadSha !== evidence.headSha) {
    return "large_bundle_review_validation_head_mismatch";
  }
  return null;
}

function matchLargeBundleApproval({ approval, packageEvidence, files, additions, deletions, totalChangedLines, normalizedDomainSet, now }) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (approval.expiresAt && Date.parse(approval.expiresAt) <= nowMs) return "expired";
  const taskKeys = new Set([packageEvidence.taskKey, ...packageEvidence.bundleTaskKeys].filter(Boolean));
  if (approval.taskKey && !taskKeys.has(approval.taskKey)) return "task_key";
  for (const taskKey of approval.allowedTaskKeys) {
    if (!taskKeys.has(taskKey)) return "allowed_task_key";
  }
  if (packageEvidence.issueNumber !== approval.issueNumber) return "issue";
  if (packageEvidence.repositorySlug !== approval.repositorySlug) return "repo";
  if (packageEvidence.lane !== approval.lane) return "lane";
  if (packageEvidence.baseSha !== approval.baseSha) return "base";
  if (packageEvidence.headSha !== approval.headSha) return "head";
  if (packageEvidence.changedFilesDigest !== approval.changedFilesDigest) return "files_digest";
  if (packageEvidence.rawDiffSha256 !== approval.rawDiffSha256) return "raw_diff_digest";
  if (packageEvidence.providerBoundDiffSha256 !== approval.providerBoundDiffSha256) return "provider_diff_digest";
  if (files.length !== approval.changedFileCount || packageEvidence.changedFileCount !== approval.changedFileCount) return "file_count";
  if (additions !== approval.additions || packageEvidence.additions !== approval.additions) return "additions";
  if (deletions !== approval.deletions || packageEvidence.deletions !== approval.deletions) return "deletions";
  if (totalChangedLines !== approval.totalChangedLines || packageEvidence.totalChangedLines !== approval.totalChangedLines) return "total_lines";
  if (files.length > approval.maxFiles || totalChangedLines > approval.maxChangedLines) return "maxima";
  if (normalizedDomainSet.join("\n") !== approval.normalizedDomainSet.join("\n")) return "domains";
  if (packageEvidence.normalizedDomainSet.join("\n") !== approval.normalizedDomainSet.join("\n")) return "package_domains";
  if (packageEvidence.manualMergeRequired !== approval.manualMergeRequired) return "manual_merge_contract";
  if (packageEvidence.autoMergeEligible !== approval.autoMergeEligible) return "auto_merge_contract";
  return null;
}

function failApproval(base, reason) {
  return { ok: false, requiredReviewerTier: null, evidence: { ...base, ok: false, matched: false, reason, reasonCode: reason } };
}

function normalizeLaneRequiredTier(tier, laneDecision) {
  if (laneDecision?.splitRequired || laneDecision?.branchStrategy === "split-required") return "block_split_or_escalate";
  if (tier === "split_or_escalate") return "block_split_or_escalate";
  if (tier === "strong_independent" || tier === "cheap_independent" || tier === "tie_breaker") return tier;
  if (laneDecision?.implementationSensitivity === "high" || laneDecision?.implementationSensitivity === "sensitive") {
    return "strong_independent";
  }
  return "cheap_independent";
}

function maxReviewerTier(a, b) {
  return reviewerTierRank[b] > reviewerTierRank[a] ? b : a;
}

function detectDomains(files, laneDecision) {
  const domains = new Set();
  if (laneDecision?.lane) domains.add(laneDecision.lane);
  for (const file of files) {
    const [first, second] = file.split("/");
    if (first === "docs") domains.add(`docs/${second || ""}`);
    else if (first === "tools") domains.add(`tools/${second || ""}`);
    else if (first) domains.add(first);
  }
  return [...domains].filter(Boolean).sort();
}

function normalizeDomainSet(domains) {
  const normalized = new Set();
  for (const domain of domains || []) {
    if (isWorkflowPolicyDomain(domain)) normalized.add("workflow-docs-tooling");
    else normalized.add(domain);
  }
  return [...normalized].filter(Boolean).sort();
}

function isSensitivePath(filePath) {
  return sensitivePathPatterns.some((pattern) => pattern.test(filePath));
}

function isWorkflowPath(filePath) {
  return workflowPathPatterns.some((pattern) => pattern.test(filePath));
}

function isDocsPath(filePath) {
  return docsPathPatterns.some((pattern) => pattern.test(filePath));
}

function isWorkflowPolicyDomain(domain) {
  return ["workflow-docs-tooling", "docs/workflow", "docs/planning", "docs/qa", "tools/auto-runner"].includes(domain);
}

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeModelIdentifier(value) {
  if (value === null || value === undefined) return null;
  const model = String(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/.test(model)) return "__invalid_model_identifier__";
  return model;
}

function normalizeConfiguredDomainSet(value, index) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    throw new Error(`largeBundleReviewApproval.approvals[${index}].normalizedDomainSet must be a bounded non-empty array`);
  }
  return Object.freeze([...new Set(value.map((item) => boundedIdentifier(item, `largeBundleReviewApproval.approvals[${index}].normalizedDomainSet`, /^[a-z0-9][a-z0-9/-]{0,80}$/)))].sort());
}

function normalizeTaskKeys(value, index) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 16) {
    throw new Error(`largeBundleReviewApproval.approvals[${index}].allowedTaskKeys must be a bounded array`);
  }
  return Object.freeze(value.map((item) => boundedIdentifier(item, `largeBundleReviewApproval.approvals[${index}].allowedTaskKeys`, /^[0-9]{8}-[0-9]{4}$/)).sort());
}

function normalizeStrongOrBetterTier(value, index) {
  const tier = String(value || "");
  if (tier !== "strong_independent" && tier !== "tie_breaker") {
    throw new Error(`largeBundleReviewApproval.approvals[${index}].requiredReviewerTier must be strong_independent or stronger`);
  }
  return tier;
}

function boundedIdentifier(value, fieldName, pattern) {
  if (typeof value !== "string" || value.length === 0 || value.length > 160 || !pattern.test(value)) {
    throw new Error(`${fieldName} is invalid`);
  }
  return value;
}

function shaIdentifier(value, fieldName) {
  return boundedIdentifier(value, fieldName, /^[0-9a-f]{40}$/);
}

function sha256Identifier(value, fieldName) {
  return boundedIdentifier(value, fieldName, /^[0-9a-f]{64}$/);
}

function validIsoTimestamp(value, fieldName) {
  const timestamp = boundedIdentifier(value, fieldName, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error(`${fieldName} is invalid`);
  return timestamp;
}

function positiveInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${fieldName} must be a positive integer`);
  return number;
}

function nonNegativeInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${fieldName} must be a non-negative integer`);
  return number;
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function roundUsd(value) {
  return Math.round(nonNegativeNumber(value) * 10000) / 10000;
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}
