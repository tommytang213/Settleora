import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mergeReviewerPolicyConfig, routeReviewer } from "./reviewer-policy.mjs";
import { analyzeReviewSecretBoundary } from "./review-secret-boundary.mjs";
import { providerBoundReviewDigest } from "./review-secret-boundary.mjs";
import { digestChangedFiles } from "./config.mjs";
import { buildLargeBundleReviewEvidence, runGeminiIntegratedReview, runGeminiReviewerSmokeTest } from "./gemini-reviewer.mjs";
import { runGrokIntegratedReview } from "./grok-reviewer.mjs";

export function independentReviewerProvider(config, packageInfo) {
  const route = independentReviewerRoute(config, packageInfo);
  if (route.tier === "block_split_or_escalate") return "split_or_escalate";
  const summary = packageInfo?.summary || {};
  const tier = mergeReviewerPolicyConfig(config).reviewerTiers[route.tier];
  const provider = tier?.provider || null;
  const recordedProvider = summary.reviewerPolicy?.tiers?.[route.tier]?.provider || null;
  // Old packages recorded the tier provider before reviewerProviderPin existed.
  // A package with neither record must not silently become a Grok job.
  const pin = summary.reviewerProviderPin || recordedProvider || config.reviewerProviderPin || null;
  if (!summary.reviewerProviderPin && !recordedProvider && provider === "grok") return null;
  return pin && provider !== pin ? null : provider;
}

function independentReviewerRoute(config, packageInfo) {
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
  return route;
}

export function runIndependentIntegratedReview(config, packageInfo, options = {}) {
  const provider = independentReviewerProvider(config, packageInfo);
  if (provider === "grok") return runGrokIntegratedReview(config, packageInfo, options);
  if (provider === "split_or_escalate") return { status: "blocked", reason: "blocked_external_reviewer_split_required",
    route: independentReviewerRoute(config, packageInfo), reviewedHead: packageInfo?.summary?.currentHead || null,
    liveCallAttempted: false };
  if (provider !== "gemini") return { status: "blocked", reason: "blocked_reviewer_provider_pin_mismatch",
    provider: packageInfo?.summary?.reviewerProviderPin || config.reviewerProviderPin || null,
    reviewedHead: packageInfo?.summary?.currentHead || null, liveCallAttempted: false };
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
  const integrationBoundaries = ["tools/auto-runner/settleora-auto-runner.mjs",
    "tools/auto-runner/lib/review-convergence-controller.mjs", "tools/auto-runner/lib/auto-merge-policy.mjs"];
  const integrationBoundaryMaterial = integrationBoundaries.map((sourcePath) => {
    const content = readFileSync(path.join(config.repoRoot, sourcePath), "utf8");
    return { path: sourcePath, content, sha256: createHash("sha256").update(content).digest("hex") };
  });
  return runGrokIntegratedReview(config, { summary: {
    repository: config.repositorySlug || "tommytang213/Settleora",
    baseSha: "a".repeat(40), currentHead: "b".repeat(40), changedFiles: [file],
    laneDecision: { lane: "workflow-docs-tooling", reviewerTier: options.tierId || config.reviewerSmokeTest?.tier || "cheap_independent" },
    validation: { passed: true },
    taskContract: { objective: "Review the synthetic one-line documentation change and the three fixed workflow gate sources." },
    integrationBoundaries, integrationBoundaryMaterial,
  }, diff }, options);
}
