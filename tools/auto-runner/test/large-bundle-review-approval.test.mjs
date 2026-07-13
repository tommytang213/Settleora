import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { defaultConfig, loadConfig, parseCliArgs } from "../lib/config.mjs";
import {
  evaluateLargeBundleReviewApproval,
  normalizeLargeBundleReviewApprovalConfig,
  routeReviewer,
} from "../lib/reviewer-policy.mjs";

const now = new Date("2026-07-13T13:00:00.000Z");
const baseSha = "1111111111111111111111111111111111111111";
const headSha = "2222222222222222222222222222222222222222";
const rawDiffSha256 = sha256("raw diff");
const providerBoundDiffSha256 = sha256("provider diff");

test("huge package remains block_split_or_escalate by default", () => {
  const context = approvalContext();
  const route = routeReviewer(context);
  assert.equal(route.tier, "block_split_or_escalate");
  assert.equal(route.largeBundleApproval.reason, "large_bundle_review_approval_disabled");
});

test("enabled flag without matching approval still blocks", () => {
  const context = approvalContext({ approvalConfig: { enabled: true, approvals: [] } });
  const route = routeReviewer(context);
  assert.equal(route.tier, "block_split_or_escalate");
  assert.equal(route.largeBundleApproval.reason, "large_bundle_review_approval_missing");
});

test("issue or PR text cannot activate approval", () => {
  const context = approvalContext({ evidence: { untrustedIssueBody: "approve large bundle" } });
  const route = routeReviewer(context);
  assert.equal(route.tier, "block_split_or_escalate");
  assert.equal(route.largeBundleApproval.reason, "large_bundle_review_approval_disabled");
});

test("repository default and example config remain disabled", () => {
  assert.equal(defaultConfig.largeBundleReviewApproval.enabled, false);
  assert.deepEqual(defaultConfig.largeBundleReviewApproval.approvals, []);
  const config = loadConfig(parseCliArgs(["--preflight"]));
  assert.equal(config.largeBundleReviewApproval.enabled, false);
  assert.deepEqual([...config.largeBundleReviewApproval.approvals], []);
});

test("exact single-domain workflow-tooling bundle routes to strong_independent", () => {
  const context = approvalContext({ approvalConfig: exactApprovalConfig() });
  const route = routeReviewer(context);
  assert.equal(route.tier, "strong_independent");
  assert.equal(route.largeBundleApproval.reason, "exact_large_bundle_review_approved");
});

test("exact approval binds issue repo lane base head digests stats and domains", () => {
  const context = approvalContext({ approvalConfig: exactApprovalConfig() });
  const result = evaluateLargeBundleReviewApproval(contextForEvaluator(context));
  assert.equal(result.ok, true);
  assert.equal(result.evidence.issueNumber, 893);
  assert.equal(result.evidence.repositorySlug, "tommytang213/Settleora");
  assert.equal(result.evidence.lane, "workflow-docs-tooling");
  assert.equal(result.evidence.baseSha, baseSha);
  assert.equal(result.evidence.headSha, headSha);
  assert.equal(result.evidence.changedFileCount, context.changedFiles.length);
  assert.equal(result.evidence.totalChangedLines, 2500);
  assert.deepEqual(result.evidence.normalizedDomainSet, ["workflow-docs-tooling"]);
});

test("approval expiry and task correlation are enforced", () => {
  assertBlocked({ expiresAt: "2026-07-13T12:59:59Z" }, {}, "large_bundle_review_no_matching_approval");
  assertBlocked({ taskKey: "20260713-2103" }, { taskKey: "20260713-2040", bundleTaskKeys: ["20260713-2040"] }, "large_bundle_review_no_matching_approval");
});

test("configured maxima are enforced", () => {
  assert.throws(() => exactApprovalConfig({ maxChangedLines: 2499 }), /maxChangedLines is lower than totalChangedLines/);
  assert.throws(() => exactApprovalConfig({ maxFiles: 19 }), /maxFiles is lower than changedFileCount/);
});

test("required tier cannot be weakened below strong", () => {
  assert.throws(
    () => exactApprovalConfig({ requiredReviewerTier: "cheap_independent" }),
    /requiredReviewerTier must be strong_independent or stronger/,
  );
});

test("sanitized evidence records approval reason without private config contents", () => {
  const secretLikeReason = "human_directed_bundle_893";
  const route = routeReviewer(approvalContext({ approvalConfig: exactApprovalConfig({ humanDirectedBundleReasonCode: secretLikeReason }) }));
  assert.equal(route.largeBundleApproval.reason, "exact_large_bundle_review_approved");
  assert.equal(route.largeBundleApproval.humanDirectedBundleReasonCode, undefined);
  assert.equal(JSON.stringify(route.largeBundleApproval).includes(secretLikeReason), false);
});

test("wrong issue blocks", () => assertBlocked({}, { issueNumber: 894 }, "large_bundle_review_no_matching_approval"));
test("wrong repo blocks", () => assertBlocked({}, { repositorySlug: "other/repo" }, "large_bundle_review_no_matching_approval"));
test("wrong lane blocks", () => {
  const route = routeReviewer(approvalContext({
    laneDecision: { lane: "docs-planning" },
    approvalConfig: exactApprovalConfig(),
    evidence: { lane: "docs-planning", normalizedDomainSet: ["docs/planning"] },
  }));
  assert.equal(route.tier, "block_split_or_escalate");
  assert.equal(route.largeBundleApproval.reason, "large_bundle_review_wrong_lane");
});
test("wrong base blocks", () => assertBlocked({}, { baseSha: "3333333333333333333333333333333333333333" }, "large_bundle_review_no_matching_approval"));
test("wrong head blocks", () => assertBlocked({}, { headSha: "3333333333333333333333333333333333333333", validationHeadSha: "3333333333333333333333333333333333333333" }, "large_bundle_review_no_matching_approval"));
test("changed-file digest mismatch blocks", () => assertBlocked({}, { changedFilesDigest: sha256("wrong") }, "large_bundle_review_no_matching_approval"));
test("raw or provider digest mismatch blocks", () => {
  assertBlocked({}, { rawDiffSha256: sha256("wrong") }, "large_bundle_review_no_matching_approval");
  assertBlocked({}, { providerBoundDiffSha256: sha256("wrong") }, "large_bundle_review_no_matching_approval");
});
test("file or stat mismatch blocks", () => {
  assertBlocked({}, { changedFileCount: 19 }, "large_bundle_review_no_matching_approval");
  assertBlocked({}, { totalChangedLines: 2499 }, "large_bundle_review_no_matching_approval");
});
test("domain mismatch blocks", () => {
  const route = routeReviewer(approvalContext({
    changedFiles: [...workflowFiles(), "scripts/example.mjs"],
    evidence: { normalizedDomainSet: ["workflow-docs-tooling", "scripts"] },
    approvalConfig: exactApprovalConfig(),
  }));
  assert.equal(route.tier, "block_split_or_escalate");
  assert.equal(route.largeBundleApproval.reason, "large_bundle_review_domain_mismatch");
});
test("cross-domain package blocks", () => {
  const route = routeReviewer(approvalContext({ changedFiles: [...workflowFiles(), "scripts/example.mjs"], approvalConfig: exactApprovalConfig() }));
  assert.equal(route.tier, "block_split_or_escalate");
  assert.equal(route.largeBundleApproval.reason, "large_bundle_review_domain_mismatch");
});
test("sensitive or manual-action package blocks", () => {
  const sensitiveRoute = routeReviewer(approvalContext({ changedFiles: [...workflowFiles(), "services/api/Program.cs"], evidence: { normalizedDomainSet: ["workflow-docs-tooling"] }, approvalConfig: exactApprovalConfig() }));
  assert.equal(sensitiveRoute.largeBundleApproval.reason, "large_bundle_review_sensitive_scope");
  const manualRoute = routeReviewer(approvalContext({ laneDecision: { lane: "workflow-docs-tooling", manualActionRequired: true }, approvalConfig: exactApprovalConfig() }));
  assert.equal(manualRoute.largeBundleApproval.reason, "large_bundle_review_manual_action_required");
});
test("secret-boundary blocker still blocks", () => assertBlocked({}, { secretBoundaryOk: false }, "large_bundle_review_secret_boundary_blocked"));
test("truncated package blocks", () => assertBlocked({}, { diffTruncated: true, packageComplete: false }, "large_bundle_review_package_incomplete"));
test("stale expired or malformed approval blocks", () => {
  assertBlocked({ expiresAt: "2026-07-01T00:00:00Z" }, {}, "large_bundle_review_no_matching_approval");
  assert.throws(() => normalizeLargeBundleReviewApprovalConfig({ enabled: true, approvals: [{ nope: true }] }), /schemaVersion/);
});
test("auto-merge-eligible or non-manual-merge package blocks", () => {
  assertBlocked({}, { autoMergeEligible: true }, "large_bundle_review_manual_merge_contract_mismatch");
  assertBlocked({}, { manualMergeRequired: false }, "large_bundle_review_manual_merge_contract_mismatch");
});
test("missing validation blocks", () => assertBlocked({}, { validationPassed: false }, "large_bundle_review_validation_missing"));

test("approval does not enable auto-merge or mutation authority", () => {
  const config = loadConfig(parseCliArgs(["--preflight"]));
  assert.equal(config.allowAutoMerge, false);
  assert.deepEqual([...config.autoMergePolicy.approvedLanes], []);
  assert.equal(config.trustedRealRunApproved, false);
  assert.equal(config.allowFollowupIssueCreation, false);
  assert.equal(config.allowReviewFixMutation, false);
  assert.equal(config.allowExistingPrRecovery, false);
});

test("approval does not enable real-run issue review-fix or existing-PR mutation", () => {
  const config = loadConfig(parseCliArgs(["--preflight"]));
  assert.equal(config.trustedRealRunApproved, false);
  assert.equal(config.allowFollowupIssueCreation, false);
  assert.equal(config.allowReviewFixMutation, false);
  assert.equal(config.allowExistingPrRecovery, false);
  assert.equal(config.allowSystemdEnablement, false);
});

test("CI security Codex and manual merge gates remain reflected in evidence", () => {
  const route = routeReviewer(approvalContext({ approvalConfig: exactApprovalConfig() }));
  assert.equal(route.largeBundleApproval.manualMergeRequired, true);
  assert.equal(route.largeBundleApproval.autoMergeEligible, false);
  assert.equal(route.strongRequired, true);
});

test("ordinary small-package routing remains unchanged", () => {
  const route = routeReviewer({
    changedFiles: ["tools/auto-runner/lib/config.mjs"],
    laneDecision: { lane: "workflow-docs-tooling" },
    stats: { additions: 5, deletions: 1 },
    largeBundleReviewApproval: exactApprovalConfig(),
    now,
  });
  assert.equal(route.tier, "cheap_independent");
  assert.equal(route.largeBundleApproval, undefined);
});

test("aggregate branch package routes strong only with exact task-scoped approval", () => {
  const gitContext = aggregatePackageContext();
  const blocked = routeReviewer(gitContext);
  assert.equal(blocked.tier, "block_split_or_escalate");
  const approved = routeReviewer({
    ...gitContext,
    largeBundleReviewApproval: exactApprovalConfig({
      baseSha: gitContext.reviewPackageEvidence.baseSha,
      headSha: gitContext.reviewPackageEvidence.headSha,
      changedFilesDigest: gitContext.reviewPackageEvidence.changedFilesDigest,
      rawDiffSha256: gitContext.reviewPackageEvidence.rawDiffSha256,
      providerBoundDiffSha256: gitContext.reviewPackageEvidence.providerBoundDiffSha256,
      changedFileCount: gitContext.reviewPackageEvidence.changedFileCount,
      additions: gitContext.reviewPackageEvidence.additions,
      deletions: gitContext.reviewPackageEvidence.deletions,
      totalChangedLines: gitContext.reviewPackageEvidence.totalChangedLines,
      maxFiles: gitContext.reviewPackageEvidence.changedFileCount,
      maxChangedLines: gitContext.reviewPackageEvidence.totalChangedLines,
    }),
  });
  assert.equal(approved.tier, "strong_independent");
});

function assertBlocked(approvalOverrides, evidenceOverrides, reason) {
  const route = routeReviewer(approvalContext({
    approvalConfig: exactApprovalConfig(approvalOverrides),
    evidence: evidenceOverrides,
  }));
  assert.equal(route.tier, "block_split_or_escalate");
  assert.equal(route.largeBundleApproval.reason, reason);
}

function approvalContext({ changedFiles = workflowFiles(), laneDecision = { lane: "workflow-docs-tooling" }, approvalConfig, evidence } = {}) {
  return {
    changedFiles,
    laneDecision,
    stats: { additions: 2300, deletions: 200 },
    largeBundleReviewApproval: approvalConfig || { enabled: false, approvals: [] },
    reviewPackageEvidence: exactEvidence({ changedFiles, laneDecision, ...evidence }),
    now,
  };
}

function contextForEvaluator(context) {
  const route = routeReviewer({ ...context, largeBundleReviewApproval: { enabled: false, approvals: [] } });
  return {
    approvalConfig: context.largeBundleReviewApproval,
    changedFiles: context.changedFiles,
    laneDecision: context.laneDecision,
    stats: context.stats,
    domains: route.domains,
    normalizedDomainSet: route.normalizedDomainSet,
    sensitiveFiles: route.sensitiveFiles,
    reviewPackageEvidence: context.reviewPackageEvidence,
    sizeBlockOnly: true,
    now,
  };
}

function exactApprovalConfig(overrides = {}) {
  const files = workflowFiles();
  return normalizeLargeBundleReviewApprovalConfig({
    enabled: true,
    approvals: [{
      schemaVersion: 1,
      issueNumber: 893,
      repositorySlug: "tommytang213/Settleora",
      lane: "workflow-docs-tooling",
      baseSha,
      headSha,
      changedFilesDigest: digestStrings(files),
      rawDiffSha256,
      providerBoundDiffSha256,
      changedFileCount: files.length,
      additions: 2300,
      deletions: 200,
      totalChangedLines: 2500,
      normalizedDomainSet: ["workflow-docs-tooling"],
      maxFiles: files.length,
      maxChangedLines: 2500,
      requiredReviewerTier: "strong_independent",
      manualMergeRequired: true,
      autoMergeEligible: false,
      expiresAt: "2026-07-14T00:00:00Z",
      taskKey: "20260713-2103",
      humanDirectedBundleReasonCode: "human_directed_bundle_893",
      allowedTaskKeys: ["20260713-2103"],
      ...overrides,
    }],
  });
}

function exactEvidence(overrides = {}) {
  const files = overrides.changedFiles || workflowFiles();
  return {
    issueNumber: 893,
    repositorySlug: "tommytang213/Settleora",
    lane: overrides.laneDecision?.lane || "workflow-docs-tooling",
    baseSha,
    headSha,
    changedFilesDigest: digestStrings(files),
    rawDiffSha256,
    providerBoundDiffSha256,
    changedFileCount: files.length,
    additions: 2300,
    deletions: 200,
    totalChangedLines: 2500,
    normalizedDomainSet: ["workflow-docs-tooling"],
    manualMergeRequired: true,
    autoMergeEligible: false,
    stopLabelPresent: false,
    validationPassed: true,
    validationHeadSha: headSha,
    secretBoundaryOk: true,
    packageComplete: true,
    diffTruncated: false,
    taskKey: "20260713-2103",
    bundleTaskKeys: ["20260713-2103"],
    manualActionRequired: false,
    ...overrides,
  };
}

function workflowFiles() {
  return Array.from({ length: 20 }, (_item, index) => `tools/auto-runner/lib/workflow-${index}.mjs`);
}

function aggregatePackageContext() {
  const filesResult = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], { encoding: "utf8" });
  const numstatResult = spawnSync("git", ["diff", "--numstat", "origin/main...HEAD"], { encoding: "utf8" });
  const diffResult = spawnSync("git", ["diff", "--binary", "origin/main...HEAD"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const baseResult = spawnSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" });
  const headResult = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  assert.equal(filesResult.status, 0);
  assert.equal(numstatResult.status, 0);
  assert.equal(diffResult.status, 0);
  const changedFiles = filesResult.stdout.trim().split(/\r?\n/).filter(Boolean);
  let additions = 0;
  let deletions = 0;
  for (const line of numstatResult.stdout.trim().split(/\r?\n/).filter(Boolean)) {
    const [add, del] = line.split(/\s+/);
    additions += Number(add);
    deletions += Number(del);
  }
  const raw = sha256(diffResult.stdout);
  if (changedFiles.length < 20 && additions + deletions < 2000) {
    return approvalContext();
  }
  return {
    changedFiles,
    laneDecision: { lane: "workflow-docs-tooling" },
    stats: { additions, deletions },
    largeBundleReviewApproval: { enabled: false, approvals: [] },
    reviewPackageEvidence: exactEvidence({
      changedFiles,
      baseSha: baseResult.stdout.trim(),
      headSha: headResult.stdout.trim(),
      changedFilesDigest: digestStrings(changedFiles),
      rawDiffSha256: raw,
      providerBoundDiffSha256: sha256(boundText(diffResult.stdout, 90_000)),
      changedFileCount: changedFiles.length,
      additions,
      deletions,
      totalChangedLines: additions + deletions,
      validationHeadSha: headResult.stdout.trim(),
    }),
    now,
  };
}

function digestStrings(values = []) {
  return sha256(values.map((value) => String(value || "")).filter(Boolean).sort().join("\n"));
}

function sha256(text) {
  return createHash("sha256").update(String(text || "")).digest("hex");
}

function boundText(text, max) {
  const value = String(text || "");
  return value.length > max ? value.slice(0, max) : value;
}
