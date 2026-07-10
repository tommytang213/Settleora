import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { safeTimestamp, slugify } from "./logger.mjs";
import { filterForbiddenChangedFiles } from "./lane-policy.mjs";
import { evaluateReviewFixMutationApproval } from "./canary-policy.mjs";

export const reviewFixCanaryFixtureAllowedLanes = Object.freeze(["workflow-docs-tooling", "docs-planning"]);

const lowRiskPathPatternsByLane = Object.freeze({
  "workflow-docs-tooling": Object.freeze([/^tools\/auto-runner(?:\/|$)/, /^docs\/workflow(?:\/|$)/]),
  "docs-planning": Object.freeze([/^docs\/planning(?:\/|$)/, /^docs\/qa(?:\/|$)/]),
});

const broadAllowedPathGlobs = new Set(["**", "./**", "docs/**", "tools/**", "tools/auto-runner", "docs"]);
const dangerousPathPatterns = Object.freeze([
  /^\.env(?:\.|$)/i,
  /^\.github(?:\/|$)/,
  /^infra(?:\/|$)/,
  /^services(?:\/|$)/,
  /^packages\/contracts\/openapi(?:\/|$)/,
  /^packages\/client-(web|dart)(?:\/|$)/,
  /^apps(?:\/|$)/,
  /^scripts\/ai(?:\/|$)/,
  /(^|\/)(auth|authentication|authorization|session|security|credential|token|secret|secrets|ssh)(\/|$)/i,
  /(^|\/)(storage|privacy|vault|permission|authz|file)(\/|$)/i,
  /(^|\/)(money|settlement|payment|bill|rounding|currency|balance)(\/|$)/i,
  /(^|\/)(schema|migration|migrations|database|ef|openapi|generated)(\/|$)/i,
  /(^|\/)(docker|compose|deployment|deploy|public|admin|mobile|ocr|sync|import|export|backup|restore)(\/|$)/i,
]);
const secretLikePatterns = Object.freeze([
  /(GEMINI_API_KEY|authorization|x-goog-api-key|bearer\s+[A-Za-z0-9._~+/-]+|api[_-]?key|secret|token)/gi,
  /\/workspace\/logs\/settleora-auto-runner\/secrets\//gi,
]);

export function normalizeReviewFixCanaryFixtureConfig(config = {}) {
  const raw = config.reviewFixCanaryFixture || {};
  const requestedEnabled = Boolean(raw.enabled);
  const base = {
    enabled: false,
    requestedEnabled,
    malformed: false,
    reason: requestedEnabled ? "review_fix_canary_fixture_not_approved" : "review_fix_canary_fixture_disabled",
    marker: null,
    markerId: null,
    allowedLanes: [...reviewFixCanaryFixtureAllowedLanes],
    requiresExternalConfig: true,
    requiresCanaryRun: true,
  };
  if (!requestedEnabled) return base;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...base, malformed: true, reason: "review_fix_canary_fixture_config_must_be_object" };
  }
  const allowedKeys = new Set(["enabled", "marker", "markerId"]);
  const unknown = Object.keys(raw).find((key) => !allowedKeys.has(key));
  if (unknown) return { ...base, malformed: true, reason: `review_fix_canary_fixture_unknown_field:${unknown}` };
  if (typeof raw.marker !== "string" || raw.marker.trim() !== raw.marker || raw.marker.length < 8 || raw.marker.length > 160 || /[\r\n]/.test(raw.marker)) {
    return { ...base, malformed: true, reason: "review_fix_canary_fixture_marker_must_be_single_line_bounded_string" };
  }
  if (secretLikePatterns.some((pattern) => pattern.test(raw.marker))) {
    return { ...base, malformed: true, reason: "review_fix_canary_fixture_marker_looks_secret_like" };
  }
  const markerId = raw.markerId || raw.marker.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  if (typeof markerId !== "string" || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(markerId)) {
    return { ...base, malformed: true, reason: "review_fix_canary_fixture_marker_id_must_be_safe_slug" };
  }
  const approval = evaluateReviewFixCanaryFixtureApproval({ ...config, reviewFixCanaryFixture: { ...base, marker: raw.marker, markerId } });
  return {
    ...base,
    enabled: approval.approved,
    reason: approval.reason,
    marker: raw.marker,
    markerId,
    approval,
  };
}

export function evaluateReviewFixCanaryFixtureApproval(config = {}) {
  const fixture = config.reviewFixCanaryFixture || normalizeReviewFixCanaryFixtureConfig({ ...config, reviewFixCanaryFixture: { enabled: false } });
  const reviewFixApproval = evaluateReviewFixMutationApproval(config);
  const base = {
    approved: false,
    mode: "not_approved",
    reason: fixture.requestedEnabled ? "review-fix canary fixture is not approved" : "review-fix canary fixture is disabled",
    configPathUsed: config.configPath || null,
    requestedEnabled: Boolean(fixture.requestedEnabled),
    trustedRealRunCanaryApproved: Boolean(config.trustedRealRunCanaryApproved),
    trustedRealRunApproved: Boolean(config.trustedRealRunApproved),
    lowRiskAutoMergeCanaryApproved: Boolean(config.lowRiskAutoMergeCanaryApproved),
    allowAutoMerge: Boolean(config.allowAutoMerge),
    reviewFixMutationApproval: reviewFixApproval,
  };
  if (!fixture.requestedEnabled) return base;
  if (fixture.malformed) return { ...base, mode: "unsafe", reason: fixture.reason };
  if (!config.configPath) return { ...base, mode: "unsafe", reason: "external config path is required" };
  if (!config.run || !config.canary) return { ...base, mode: "unsafe", reason: "fixture requires --run --canary" };
  if (!config.trustedRealRunCanaryApproved) return { ...base, mode: "unsafe", reason: "trustedRealRunCanaryApproved must be true" };
  if (config.trustedRealRunApproved) return { ...base, mode: "unsafe", reason: "trustedRealRunApproved must remain false" };
  if (!config.allowAutoMerge || !config.lowRiskAutoMergeCanaryApproved) {
    return { ...base, mode: "unsafe", reason: "fixture requires bounded low-risk auto-merge canary approval" };
  }
  if (!reviewFixApproval.approved) return { ...base, mode: "unsafe", reason: `review-fix mutation approval required: ${reviewFixApproval.reason}` };
  return { ...base, approved: true, mode: "approved", reason: "explicit low-risk review-fix canary fixture approval" };
}

export function runReviewFixCanaryFixtureReview(config, packageInfo, options = {}) {
  const fixture = config.reviewFixCanaryFixture || normalizeReviewFixCanaryFixtureConfig(config);
  const summary = packageInfo?.summary || {};
  const laneDecision = summary.laneDecision || {};
  const issue = summary.issue || {};
  const changedFiles = Array.isArray(summary.changedFiles) ? summary.changedFiles : [];
  const base = {
    mode: "review-fix-canary-fixture",
    provider: "review_fix_canary_fixture",
    tier: "review_fix_canary_fixture",
    providerProfile: "local-deterministic-fixture",
    model: "marker-presence",
    lane: laneDecision.lane || null,
    changedFiles,
    liveCallAttempted: false,
    status: "blocked",
    reason: null,
    verdict: "not_run",
    markerId: fixture.markerId || null,
    findingCount: 0,
    phase: options.phase || "pre-pr-review",
    reportPath: null,
  };
  const finish = (result) =>
    finishFixtureReview(
      config,
      {
        ...base,
        ...result,
        issue: { number: issue.number || null, title: issue.title || null, url: issue.url || null },
        allowedPaths: laneDecision.allowedPaths || [],
        reviewedHead: options.reviewedHead || safeHead(),
      },
      fixture.marker,
      fixture.markerId,
    );

  if (!fixture.requestedEnabled) return { ...base, status: "skipped", reason: "skipped_review_fix_canary_fixture_disabled" };
  if (fixture.malformed) return finish({ reason: fixture.reason });
  if (!fixture.enabled) return finish({ reason: `blocked_review_fix_canary_fixture_not_approved:${fixture.reason}` });
  const gate = evaluateFixtureIssueAndPathGates({ config, laneDecision, changedFiles, validation: summary.validation });
  if (!gate.allowed) return finish({ reason: gate.reason });

  const markerFound = changedFiles.some((file) => fileContainsMarker(config.repoRoot, file, fixture.marker));
  if (markerFound) {
    return finish({
      status: "pass",
      reason: "review_fix_canary_fixture_marker_present",
      verdict: "pass",
      sanitizedResponseSummary: {
        verdict: "pass",
        confidence: "high",
        summary: "Configured review-fix canary fixture marker is present.",
        findings: [],
      },
      findingCount: 0,
      phase: options.phase || "post-fix-marker-present",
    });
  }

  const finding = `Add the exact configured review-fix canary marker inside the issue's allowed changed file content: ${fixture.marker}`;
  return finish({
    reason: "blocked_external_reviewer_non_pass",
    verdict: "fail",
    sanitizedResponseSummary: {
      verdict: "fail",
      confidence: "high",
      summary: "Configured review-fix canary fixture marker is absent.",
      findings: [finding],
    },
    findingCount: 1,
    phase: options.phase || "pre-fix-marker-missing",
  });
}

function evaluateFixtureIssueAndPathGates({ laneDecision, changedFiles, validation }) {
  if (!laneDecision.allowedToImplement) return { allowed: false, reason: "lane_not_allowed_to_implement" };
  if (!reviewFixCanaryFixtureAllowedLanes.includes(laneDecision.lane)) return { allowed: false, reason: "lane_not_review_fix_fixture_approved" };
  if (laneDecision.contract?.autoMergeEligible !== true || laneDecision.autoMergeEligible !== true) {
    return { allowed: false, reason: "contract_not_auto_merge_eligible" };
  }
  if (laneDecision.contract?.manualMergeRequired !== false || laneDecision.manualMergeRequired !== false) {
    return { allowed: false, reason: "manual_merge_required" };
  }
  if (laneDecision.dangerGate || (laneDecision.dangerReasons || []).length > 0) return { allowed: false, reason: "danger_gate_scope" };
  const allowedPaths = laneDecision.allowedPaths || [];
  if (allowedPaths.length === 0) return { allowed: false, reason: "empty_contract_allowed_paths" };
  const unsafeContractPath = allowedPaths.find((glob) => isUnsafeAllowedPathGlob(glob, laneDecision.lane));
  if (unsafeContractPath) return { allowed: false, reason: `unsafe_contract_allowed_path:${unsafeContractPath}` };
  const forbidden = filterForbiddenChangedFiles(changedFiles, laneDecision);
  if (forbidden.length > 0) return { allowed: false, reason: `forbidden_changed_files:${forbidden.join(",")}` };
  if (changedFiles.length === 0) return { allowed: false, reason: "no_changed_files" };
  if (!changedFiles.every((file) => isLowRiskPathForLane(file, laneDecision.lane))) {
    return { allowed: false, reason: "changed_file_not_low_risk_path" };
  }
  if (validation?.passed !== true) return { allowed: false, reason: "local_validation_not_passed_before_fixture_review" };
  return { allowed: true, reason: "fixture_issue_and_path_gates_passed" };
}

function finishFixtureReview(config, result, markerRaw, markerId) {
  const evidenceRoot = path.join(config.logsRoot, "review-fix");
  mkdirSync(evidenceRoot, { recursive: true });
  const evidencePath = path.join(
    evidenceRoot,
    `${safeTimestamp()}-issue-${result.issue?.number || "unknown"}-${slugify(result.issue?.title || "fixture", 40)}-fixture-review.json`,
  );
  const sanitized = sanitizeEvidence({
    generatedAt: new Date().toISOString(),
    fixtureMode: result.mode,
    issue: result.issue,
    lane: result.lane,
    allowedPaths: result.allowedPaths,
    changedFiles: result.changedFiles,
    reviewedHead: result.reviewedHead,
    markerId: result.markerId,
    findingCount: result.findingCount,
    phase: result.phase,
    status: result.status,
    reason: result.reason,
    verdict: result.verdict,
    sanitizedResponseSummary: result.sanitizedResponseSummary || null,
    secretBoundaryConfirmation: "No secrets, provider payloads, local config bodies, or raw marker values are included.",
  }, markerRaw, markerId);
  writeFileSync(evidencePath, `${JSON.stringify(sanitized, null, 2)}\n`);
  return { ...result, reportPath: evidencePath };
}

function fileContainsMarker(repoRoot, filePath, marker) {
  const normalized = normalizePath(filePath);
  const absolute = path.join(repoRoot, normalized);
  if (!absolute.startsWith(path.resolve(repoRoot)) || !existsSync(absolute)) return false;
  return readFileSync(absolute, "utf8").includes(marker);
}

function isUnsafeAllowedPathGlob(glob, lane) {
  const normalized = normalizePath(glob);
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\\") || broadAllowedPathGlobs.has(normalized)) {
    return true;
  }
  if (/\/\*\*\/|^\*$/.test(normalized)) return true;
  if (dangerousPathPatterns.some((pattern) => pattern.test(normalized))) return true;
  const lanePatterns = lowRiskPathPatternsByLane[lane] || [];
  return !lanePatterns.some((pattern) => pattern.test(normalized.replace(/\/\*\*$/, "/")));
}

function isLowRiskPathForLane(filePath, lane) {
  const normalized = normalizePath(filePath);
  if (dangerousPathPatterns.some((pattern) => pattern.test(normalized))) return false;
  const lanePatterns = lowRiskPathPatternsByLane[lane] || [];
  return lanePatterns.some((pattern) => pattern.test(normalized));
}

function safeHead() {
  return "unavailable";
}

function sanitizeEvidence(value, markerRaw, markerId) {
  const markerReplacement = markerRaw ? `[FIXTURE_MARKER:${markerId || "configured"}]` : "";
  const text = JSON.stringify(value)
    .split(markerRaw || "\u0000")
    .join(markerReplacement)
    .replace(secretLikePatterns[0], "[REDACTED]")
    .replace(secretLikePatterns[1], "[REDACTED]");
  return JSON.parse(text);
}

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}
