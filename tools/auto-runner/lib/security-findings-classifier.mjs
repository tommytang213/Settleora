import { createHash } from "node:crypto";
import { classifyIssueLane } from "./lane-policy.mjs";

export const securityFindingClassificationVersion = 1;

export const securityFindingCategories = Object.freeze([
  "safe_code_fix",
  "dependency_update",
  "retryable_infrastructure",
  "false_positive_candidate",
  "manual_security_product_decision",
  "unsupported_ambiguous",
]);

export const requiredReconciliationKinds = Object.freeze([
  "alert_identity",
  "dependency_identity",
  "code_location_identity",
  "provider_failure_identity",
  "current_main_scan",
]);

const categorySet = new Set(securityFindingCategories);
const retryableFailureReasons = new Set([
  "provider_retryable_failure",
  "retry_budget_exhausted",
  "github_actions_timeout",
  "scanner_timeout",
  "endpoint_timeout",
  "rate_limited",
  "service_unavailable",
]);
const unsupportedDependencyEcosystems = new Set(["unknown", "unsupported", ""]);
const manualAuthorityLanes = new Set(["money-settlement-payment", "storage-file-privacy-authz", "auth-session-security"]);
const safeStringPattern = /^[A-Za-z0-9._:/@+ -]{0,240}$/;

export function classifySecurityFinding(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const finding = input.finding || input;
  const reasons = [];
  const base = {
    classificationVersion: securityFindingClassificationVersion,
    correlationKey: boundedKey(finding.correlationKey),
    idempotencyKey: boundedKey(finding.idempotencyKey),
    category: "unsupported_ambiguous",
    confidence: "low",
    reasonCodes: reasons,
    sourceKind: finding.sourceKind || "unknown",
    requiredReconciliation: [],
    suggestedLane: null,
    suggestedValidationProfile: null,
    manualGateRequired: true,
    proposalEligible: false,
    classifiedAt: now,
  };
  const invalid = validateClassifierInput(finding);
  if (invalid.length > 0) return finalize(base, "unsupported_ambiguous", invalid);

  if (input.providerFailure) {
    const reason = input.providerFailure.reason || "provider_failure";
    if (retryableFailureReasons.has(reason) && !input.providerFailure.httpStatus) {
      return finalize(base, "retryable_infrastructure", ["retryable_provider_failure"], {
        confidence: "medium",
        requiredReconciliation: ["provider_failure_identity"],
        manualGateRequired: false,
      });
    }
    return finalize(base, "unsupported_ambiguous", [`non_retryable_provider_failure:${reason}`]);
  }

  if (input.falsePositiveCandidate) {
    const candidate = validateFalsePositiveCandidate(input.falsePositiveCandidate);
    if (!candidate.ok) return finalize(base, "unsupported_ambiguous", [candidate.reason]);
    return finalize(base, "false_positive_candidate", ["authorized_candidate_analysis_present"], {
      confidence: "medium",
      requiredReconciliation: ["alert_identity", "current_main_scan"],
      manualGateRequired: true,
      proposalEligible: false,
    });
  }

  if (finding.sourceKind === "dependabot_alert" || finding.sourceKind === "dependabot_pr") {
    return classifyDependencyFinding(base, finding, input);
  }
  if (["code_scanning_alert", "semgrep_artifact", "trivy_artifact"].includes(finding.sourceKind)) {
    return classifySourceFinding(base, finding, input);
  }
  return finalize(base, "unsupported_ambiguous", ["source_kind_unsupported"]);
}

export function validateSecurityFindingClassification(classification = {}) {
  if (!classification || typeof classification !== "object" || Array.isArray(classification)) return { ok: false, reason: "classification_not_object" };
  const allowed = new Set([
    "classificationVersion",
    "correlationKey",
    "idempotencyKey",
    "category",
    "confidence",
    "reasonCodes",
    "sourceKind",
    "requiredReconciliation",
    "suggestedLane",
    "suggestedValidationProfile",
    "manualGateRequired",
    "proposalEligible",
    "classifiedAt",
    "policyDigest",
  ]);
  const unknown = Object.keys(classification).find((key) => !allowed.has(key));
  if (unknown) return { ok: false, reason: `classification_unknown_field:${unknown}` };
  if (classification.classificationVersion !== securityFindingClassificationVersion) return { ok: false, reason: "classification_version_unsupported" };
  if (!categorySet.has(classification.category)) return { ok: false, reason: "classification_category_invalid" };
  if (!Array.isArray(classification.reasonCodes) || classification.reasonCodes.length === 0 || classification.reasonCodes.length > 12) return { ok: false, reason: "classification_reasons_invalid" };
  if (!Array.isArray(classification.requiredReconciliation) || classification.requiredReconciliation.length > 6) return { ok: false, reason: "classification_reconciliation_invalid" };
  const serialized = JSON.stringify(classification);
  if (/(rawPayload|sarif|snippet|Bearer\s+|token=|password=|secret=|ignore previous instructions)/i.test(serialized)) return { ok: false, reason: "classification_unsanitized" };
  return { ok: true };
}

function classifyDependencyFinding(base, finding, input) {
  const reasons = [];
  if (finding.sourceKind === "dependabot_pr" && input.sourceIdentityVerified !== true) reasons.push("dependabot_pr_identity_unverified");
  if (finding.sourceKind === "dependabot_alert" && input.sourceIdentityVerified === false) reasons.push("dependabot_alert_identity_unverified");
  if (!finding.dependency) reasons.push("dependency_missing");
  if (!finding.packageEcosystem || unsupportedDependencyEcosystems.has(String(finding.packageEcosystem).toLowerCase())) reasons.push("dependency_ecosystem_unsupported");
  if (!finding.manifestPath && finding.sourceKind === "dependabot_alert") reasons.push("manifest_path_missing");
  if (finding.manifestPath && !isSafeRepoPath(finding.manifestPath)) reasons.push("manifest_path_unsafe");
  if (!["open", "merged"].includes(finding.state)) reasons.push("finding_not_current_open");
  if (input.manualActionRequired || input.unsupportedEcosystem) reasons.push("manual_or_unsupported_dependency_condition");
  if (reasons.length > 0) return finalize(base, "unsupported_ambiguous", reasons);
  const lane = laneForPaths([finding.manifestPath || "apps/mobile/pubspec.yaml"]);
  if (!lane.ok) return finalize(base, "unsupported_ambiguous", [lane.reason]);
  return finalize(base, "dependency_update", ["verified_dependency_identity"], {
    confidence: "medium",
    requiredReconciliation: ["alert_identity", "dependency_identity"],
    suggestedLane: lane.lane,
    suggestedValidationProfile: lane.validationProfile,
    manualGateRequired: false,
    proposalEligible: true,
  });
}

function classifySourceFinding(base, finding, input) {
  const reasons = [];
  if (!finding.locationPath) reasons.push("code_location_missing");
  if (finding.locationPath && !isSafeRepoPath(finding.locationPath)) reasons.push("code_location_unsafe");
  if (!finding.fingerprint && !finding.alertId) reasons.push("fingerprint_or_alert_missing");
  if (!finding.ruleId) reasons.push("rule_missing");
  if (!finding.ref && !finding.analyzedSha) reasons.push("ref_or_sha_missing");
  if (!["open", "unknown"].includes(finding.state)) reasons.push("finding_not_current_open");
  if (input.crossDomain || (Array.isArray(input.relatedPaths) && laneSetForPaths([finding.locationPath, ...input.relatedPaths]).size > 1)) reasons.push("cross_domain_ambiguous");
  if (input.generatedOutput || input.requiresSecret || input.requiresDeployment || input.destructiveAction) reasons.push("forbidden_action_boundary");
  if (input.unresolvedAuthority) reasons.push("unresolved_authority_boundary");
  if (reasons.includes("unresolved_authority_boundary")) {
    return finalize(base, "manual_security_product_decision", reasons, { confidence: "medium" });
  }
  if (reasons.length > 0) return finalize(base, "unsupported_ambiguous", reasons);
  const lane = laneForPaths([finding.locationPath]);
  if (!lane.ok) return finalize(base, "unsupported_ambiguous", [lane.reason]);
  if (manualAuthorityLanes.has(lane.lane) && input.authorityResolved !== true) {
    return finalize(base, "manual_security_product_decision", ["sensitive_authority_resolution_required"], {
      suggestedLane: lane.lane,
      suggestedValidationProfile: lane.validationProfile,
      confidence: "medium",
    });
  }
  return finalize(base, "safe_code_fix", ["current_code_location_and_lane_resolved"], {
    confidence: lane.reviewerTier === "strong_independent" ? "medium" : "high",
    requiredReconciliation: ["alert_identity", "code_location_identity"],
    suggestedLane: lane.lane,
    suggestedValidationProfile: lane.validationProfile,
    manualGateRequired: false,
    proposalEligible: true,
  });
}

function laneForPaths(paths) {
  const safePaths = paths.filter(Boolean);
  if (safePaths.length === 0) return { ok: false, reason: "path_missing" };
  const lanes = laneSetForPaths(safePaths);
  if (lanes.size !== 1) return { ok: false, reason: lanes.size === 0 ? "path_lane_unknown" : "path_cross_domain" };
  const lane = [...lanes][0];
  const issue = {
    number: 0,
    title: "Finding remediation proposal",
    labels: ["auto-ready"],
    body: [
      "## Auto-runner contract",
      "",
      "```json",
      JSON.stringify({
        contractVersion: 1,
        lane,
        allowedPaths: safePaths,
        validationProfile: validationProfileForLane(lane),
        manualMergeRequired: true,
        autoMergeEligible: false,
        requiredReading: ["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
      }, null, 2),
      "```",
    ].join("\n"),
  };
  const decision = classifyIssueLane(issue);
  if (!decision.allowedToImplement) return { ok: false, reason: `lane_policy_rejected:${decision.reasonCodes?.[0] || decision.reason}` };
  return { ok: true, lane: decision.canonicalLane || decision.lane, validationProfile: decision.validationProfile, reviewerTier: decision.reviewerTier };
}

function laneSetForPaths(paths) {
  const lanes = new Set();
  for (const path of paths.filter(Boolean)) {
    const lane = heuristicLaneForPath(path);
    if (lane) lanes.add(lane);
  }
  return lanes;
}

function heuristicLaneForPath(filePath) {
  if (/^tools\/auto-runner\//.test(filePath) || /^docs\/workflow\//.test(filePath)) return "workflow-docs-tooling";
  if (/^(package\.json|package-lock\.json|npm-shrinkwrap\.json)$/.test(filePath)) return "workflow-docs-tooling";
  if (/^docs\/planning\//.test(filePath) || /^docs\/qa\//.test(filePath)) return "docs-planning";
  if (/^packages\/contracts\/openapi\//.test(filePath) || /^packages\/client-(web|dart)\/.*generated\//.test(filePath)) return "openapi-generated-clients";
  if (/^apps\/mobile\/(?:pubspec\.yaml|pubspec\.lock|android\/|ios\/|macos\/|linux\/|windows\/|web\/|assets\/|l10n\/)/.test(filePath)) return "mobile-build-config";
  if (/^apps\/mobile\/(?:lib|test)\//.test(filePath)) return "mobile-application";
  if (/^apps\/web-user\//.test(filePath)) return "web-user-ui";
  if (/^apps\/web-admin\//.test(filePath)) return "web-admin-ui";
  if (/^packages\/contracts\//.test(filePath)) return "openapi-generated-clients";
  if (/^services\/api\/.*(?:Auth|Session|Security|Credential|Password|Mfa|Passkey)/i.test(filePath)) return "auth-session-security";
  if (/^services\/api\/.*(?:Storage|File|Privacy|Vault|Permission|Authz)/i.test(filePath)) return "storage-file-privacy-authz";
  if (/^services\/api\/.*(?:Money|Settlement|Payment|Bill|Rounding|Currency|Balance)/i.test(filePath)) return "money-settlement-payment";
  if (/^services\/api\/.*[Mm]igrations\//.test(filePath)) return "schema-migrations";
  if (/^services\/api\//.test(filePath)) return "api-domain-runtime";
  if (/^(infra\/|\.github\/workflows\/|docs\/deployment\/)/.test(filePath)) return "docker-compose-ci-deployment";
  return null;
}

function validationProfileForLane(lane) {
  return {
    "workflow-docs-tooling": "runner-tests",
    "docs-planning": "docs-only",
    "openapi-generated-clients": "openapi-generated-clients",
    "mobile-build-config": "mobile-build-config",
    "mobile-application": "mobile",
    "web-user-ui": "web-ui",
    "web-admin-ui": "web-ui",
    "auth-session-security": "api-security",
    "storage-file-privacy-authz": "api-storage",
    "money-settlement-payment": "api-money",
    "schema-migrations": "api-migrations",
    "api-domain-runtime": "api-domain",
    "docker-compose-ci-deployment": "compose-ci",
  }[lane] || "scaffold-docs";
}

function validateClassifierInput(finding = {}) {
  const errors = [];
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) errors.push("finding_not_object");
  for (const [key, value] of Object.entries(finding || {})) {
    if (/raw|payload|sarif|snippet|message|description|diff/i.test(key)) errors.push(`raw_field_forbidden:${key}`);
    if (typeof value === "string" && (!safeStringPattern.test(value) || /[\u0000-\u001f\u007f]/.test(value))) errors.push(`unsafe_string:${key}`);
  }
  if (!finding.correlationKey || !finding.idempotencyKey) errors.push("finding_keys_missing");
  return errors;
}

function validateFalsePositiveCandidate(candidate = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { ok: false, reason: "false_positive_candidate_not_object" };
  if (candidate.authorizedAnalysis !== true) return { ok: false, reason: "false_positive_candidate_unauthorized" };
  if (!Array.isArray(candidate.requiredProofGates) || candidate.requiredProofGates.length < 3) return { ok: false, reason: "false_positive_candidate_gates_missing" };
  return { ok: true };
}

function finalize(base, category, reasonCodes, extra = {}) {
  const output = {
    ...base,
    ...extra,
    category,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 12),
  };
  output.policyDigest = createHash("sha256")
    .update(JSON.stringify({
      version: output.classificationVersion,
      category: output.category,
      reasons: output.reasonCodes,
      lane: output.suggestedLane,
      sourceKind: output.sourceKind,
    }))
    .digest("hex")
    .slice(0, 32);
  const validation = validateSecurityFindingClassification(output);
  if (!validation.ok) throw new Error(`Invalid classification: ${validation.reason}`);
  return output;
}

function isSafeRepoPath(value) {
  const text = String(value || "");
  return Boolean(text && text.length <= 240 && !text.startsWith("/") && !text.includes("\\") && !text.includes("..") && !/[\0\r\n`$<>|;&]/.test(text));
}

function boundedKey(value) {
  return String(value || "").slice(0, 180);
}
