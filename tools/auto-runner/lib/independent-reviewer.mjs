import { mergeReviewerPolicyConfig, routeReviewer } from "./reviewer-policy.mjs";
import { analyzeReviewSecretBoundary } from "./review-secret-boundary.mjs";
import { providerBoundReviewDigest } from "./review-secret-boundary.mjs";
import { digestChangedFiles } from "./config.mjs";
import { buildLargeBundleReviewEvidence, runGeminiIntegratedReview, runGeminiReviewerSmokeTest } from "./gemini-reviewer.mjs";
import { runGrokIntegratedReview } from "./grok-reviewer.mjs";

export function independentReviewerProvider(config, packageInfo) {
  const summary = packageInfo?.summary || {};
  const boundary = analyzeReviewSecretBoundary({ changedFiles: summary.changedFiles || [], diff: packageInfo?.diff || "",
    diffTruncated: summary.diffTruncated === true });
  const stats = Object.fromEntries(["additions", "deletions", "files"].map((key) => [key,
    Math.max(boundary.diffStats?.[key] || 0, Number.isFinite(Number(summary.diffStats?.[key])) && Number(summary.diffStats[key]) >= 0
      ? Number(summary.diffStats[key]) : 0)]));
  const route = routeReviewer({ changedFiles: summary.changedFiles || [], laneDecision: summary.laneDecision || {},
    stats, featureBundle: summary.featureBundle || null,
    taskContract: summary.taskContract || null, largeBundleReviewApproval: config.largeBundleReviewApproval,
    reviewPackageEvidence: buildLargeBundleReviewEvidence({ config, summary,
      changedFilesDigest: digestChangedFiles(summary.changedFiles || []),
      rawDiffSha256: boundary.rawDiffSha256,
      providerBoundDiffSha256: providerBoundReviewDigest(packageInfo?.diff || ""),
      effectiveDiffStats: stats, secretBoundary: boundary,
      reviewedHead: summary.currentHead || summary.headSha || summary.runnerCreatedCommitSha || null,
      baseSha: summary.baseSha || summary.baseRefSha || summary.baseOriginMainSha || null,
      diff: packageInfo?.diff || "" }) });
  const tier = mergeReviewerPolicyConfig(config).reviewerTiers[route.tier];
  return tier?.provider || null;
}

export function runIndependentIntegratedReview(config, packageInfo, options = {}) {
  const provider = independentReviewerProvider(config, packageInfo);
  if (provider === "grok") return runGrokIntegratedReview(config, packageInfo, options);
  // Existing pinned Gemini runs keep their provider, request policy, and evidence.
  return runGeminiIntegratedReview(config, packageInfo, options);
}

export function runIndependentReviewerSmokeTest(config, options = {}) {
  const tier = mergeReviewerPolicyConfig(config).reviewerTiers[options.tierId || config.reviewerSmokeTest?.tier || "cheap_independent"];
  if (tier?.provider !== "grok") return runGeminiReviewerSmokeTest(config, options);
  if (!options.liveExternalReviewerCalls) {
    return { status: "skipped", reason: "grok_smoke_requires_explicit_live_flag", provider: "grok", reportPath: null };
  }
  const file = "docs/workflow/grok-review-smoke.md";
  const diff = `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+Synthetic reviewer smoke fixture.\n`;
  return runGrokIntegratedReview(config, { summary: {
    repository: config.repositorySlug || "tommytang213/Settleora",
    baseSha: "a".repeat(40), currentHead: "b".repeat(40), changedFiles: [file],
    laneDecision: { lane: "workflow-docs-tooling", reviewerTier: options.tierId || config.reviewerSmokeTest?.tier || "cheap_independent" },
    validation: { passed: true },
  }, diff });
}
