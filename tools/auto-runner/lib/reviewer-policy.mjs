import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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

export function routeReviewer({ changedFiles = [], laneDecision = null, stats = {} }) {
  const files = changedFiles.map(normalizePath);
  const additions = nonNegativeNumber(stats.additions || 0);
  const deletions = nonNegativeNumber(stats.deletions || 0);
  const totalChangedLines = additions + deletions;
  const sensitiveFiles = files.filter(isSensitivePath);
  const domains = detectDomains(files, laneDecision);
  const crossDomainCount = domains.filter((domain) => !isWorkflowPolicyDomain(domain)).length;
  const huge = files.length >= 40 || totalChangedLines >= 2000 || crossDomainCount >= 4;
  const large = files.length >= 15 || totalChangedLines >= 800;
  const docsOnly = files.length > 0 && files.every(isDocsPath);
  const workflowTooling = files.some(isWorkflowPath) || laneDecision?.lane === "workflow-docs-tooling";
  const clientUiLowRisk =
    laneDecision?.lane === "client-ui-low-risk" &&
    files.length > 0 &&
    files.every((file) => /^apps\/mobile\/(lib|test)\/ui(?:\/|$)/.test(file));

  if (huge) {
    return decision("block_split_or_escalate", "Huge or cross-domain PR; split or approve a large-bundle lane before review.", {
      sensitiveFiles,
      domains,
      totalChangedLines,
      changedFileCount: files.length,
      block: true,
    });
  }
  const laneRequiredTier = normalizeLaneRequiredTier(laneDecision?.reviewerTier, laneDecision);
  if (clientUiLowRisk && !large) {
    return decision(maxReviewerTier("cheap_independent", laneRequiredTier), "Real-code client UI low-risk canary requires cheap independent review before auto-merge.", {
      sensitiveFiles,
      domains,
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
      totalChangedLines,
      changedFileCount: files.length,
      strongRequired: true,
      laneRequiredTier,
    });
  }
  if (large) {
    return decision(maxReviewerTier("strong_independent", laneRequiredTier), "Large PR size crosses strong-review threshold.", {
      sensitiveFiles,
      domains,
      totalChangedLines,
      changedFileCount: files.length,
      strongRequired: true,
      laneRequiredTier,
    });
  }
  if (docsOnly) {
    return decision(maxReviewerTier("cheap_independent", laneRequiredTier), "Docs, ledger, or workflow docs default to cheap independent review.", {
      sensitiveFiles,
      domains,
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
    totalChangedLines,
    changedFileCount: files.length,
    laneRequiredTier,
  });
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
