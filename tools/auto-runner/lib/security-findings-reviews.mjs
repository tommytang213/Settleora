import { createHash } from "node:crypto";

export const securityFindingReviewBundleVersion = 1;

const digestPattern = /^[0-9a-f]{16,64}$/i;
const shaPattern = /^[0-9a-f]{40}$/i;
const idPattern = /^[A-Za-z0-9._:/@+ -]{1,240}$/;
const unsafeText = /rawSarif|rawPayload|providerPayload|snippet|Bearer\s+|token=|password=|secret=|ignore previous instructions|system prompt/i;

export function validateFalsePositiveReviewBundle(bundle = {}, packet = {}, options = {}) {
  const errors = [];
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) return fail("review_bundle_not_object");
  const allowed = new Set(["reviewBundleVersion", "packetDigest", "findingIdentityDigest", "strongIndependent", "codexMechanics", "tieBreaker", "reviewBundleDigest"]);
  for (const key of Object.keys(bundle)) {
    if (!allowed.has(key)) errors.push(`review_bundle_unknown_field:${key}`);
  }
  if (bundle.reviewBundleVersion !== securityFindingReviewBundleVersion) errors.push("review_bundle_version_unsupported");
  if (bundle.packetDigest !== packet.packetDigest) errors.push("review_bundle_packet_digest_mismatch");
  const expectedFindingDigest = findingIdentityDigest(packet);
  if (bundle.findingIdentityDigest !== expectedFindingDigest) errors.push("review_bundle_finding_digest_mismatch");
  const strong = validateStrongIndependentReview(bundle.strongIndependent, packet, options);
  if (!strong.ok) errors.push(strong.reason);
  const codex = validateCodexMechanicsReview(bundle.codexMechanics, packet, options);
  if (!codex.ok) errors.push(codex.reason);
  const tieBreakerNeeded = tieBreakerRequired(bundle.strongIndependent, bundle.codexMechanics);
  if (tieBreakerNeeded) {
    const tie = validateTieBreakerReview(bundle.tieBreaker, packet, options);
    if (!tie.ok) errors.push(tie.reason);
  } else if (bundle.tieBreaker !== null && bundle.tieBreaker !== undefined) {
    const tie = validateTieBreakerReview(bundle.tieBreaker, packet, options);
    if (!tie.ok) errors.push(tie.reason);
  }
  if (unsafeText.test(JSON.stringify(bundle))) errors.push("review_bundle_unsanitized");
  if (bundle.reviewBundleDigest !== reviewBundleDigest(bundle)) errors.push("review_bundle_digest_mismatch");
  return errors.length > 0 ? { ok: false, reason: errors[0], errors, tieBreakerRequired: tieBreakerNeeded } : { ok: true, bundle, tieBreakerRequired: tieBreakerNeeded };
}

export function buildReviewBundle(input = {}, packet = {}) {
  const bundle = {
    reviewBundleVersion: securityFindingReviewBundleVersion,
    packetDigest: packet.packetDigest,
    findingIdentityDigest: findingIdentityDigest(packet),
    strongIndependent: input.strongIndependent || null,
    codexMechanics: input.codexMechanics || null,
    tieBreaker: input.tieBreaker || null,
  };
  bundle.reviewBundleDigest = reviewBundleDigest(bundle);
  return bundle;
}

export function tieBreakerRequired(strong = {}, codex = {}) {
  if (!strong || !codex) return true;
  if (strong.packetDigest !== codex.packetDigest) return true;
  if (strong.findingIdentityDigest && codex.findingIdentityDigest && strong.findingIdentityDigest !== codex.findingIdentityDigest) return true;
  if (strong.verdict !== "pass" || codex.verdict !== "approve") return true;
  if (strong.confidence && !["high", "approved"].includes(strong.confidence)) return true;
  if (codex.confidence && !["high", "approved"].includes(codex.confidence)) return true;
  if ((strong.findings || []).length > 0 || (codex.findings || []).length > 0) return true;
  if (strong.conditional === true || codex.conditional === true) return true;
  if (strong.evidenceChanged === true || codex.evidenceChanged === true) return true;
  return false;
}

export function findingIdentityDigest(packet = {}) {
  return sha256({
    repository: packet.repository,
    sourceKind: packet.sourceKind,
    provider: packet.provider,
    tool: packet.tool,
    alertId: packet.alertId || null,
    ruleId: packet.ruleId || null,
    fingerprint: packet.fingerprint || null,
    ref: packet.ref || null,
    analyzedSha: packet.analyzedSha || null,
    dependencyIdentity: packet.dependencyIdentity || null,
  });
}

function validateStrongIndependentReview(review = {}, packet = {}, options = {}) {
  const base = validateReviewCommon(review, packet, options, "strong_independent");
  if (!base.ok) return base;
  if (review.providerTier !== "strong_independent") return fail("strong_review_tier_invalid");
  if (review.verdict !== "pass") return fail("strong_review_verdict_not_pass");
  if (!["high", "approved"].includes(review.confidence)) return fail("strong_review_confidence_invalid");
  if (review.secretBoundaryPass !== true) return fail("strong_review_secret_boundary_failed");
  if (review.budgetPass !== true) return fail("strong_review_budget_failed");
  if ((review.findings || []).length > 0 || review.conditions?.length > 0) return fail("strong_review_findings_present");
  return { ok: true };
}

function validateCodexMechanicsReview(review = {}, packet = {}, options = {}) {
  const base = validateReviewCommon(review, packet, options, "codex_mechanics");
  if (!base.ok) return base;
  if (review.providerTier !== "codex_mechanics") return fail("codex_review_tier_invalid");
  if (review.verdict !== "approve") return fail("codex_review_not_approve");
  if (review.endpointVerified !== true) return fail("codex_review_endpoint_not_verified");
  if (review.recoveryVerified !== true) return fail("codex_review_recovery_not_verified");
  if (review.noForbiddenActionVerified !== true) return fail("codex_review_forbidden_boundary_not_verified");
  if ((review.findings || []).length > 0 || review.conditions?.length > 0) return fail("codex_review_findings_present");
  return { ok: true };
}

function validateTieBreakerReview(review = {}, packet = {}, options = {}) {
  const base = validateReviewCommon(review, packet, options, "tie_breaker");
  if (!base.ok) return base;
  if (review.providerTier !== "tie_breaker") return fail("tie_breaker_tier_invalid");
  if (review.verdict !== "pass") return fail("tie_breaker_verdict_not_pass");
  if (!["high", "approved"].includes(review.confidence)) return fail("tie_breaker_confidence_invalid");
  if ((review.findings || []).length > 0 || review.conditions?.length > 0 || review.conditional === true) return fail("tie_breaker_inconclusive");
  return { ok: true };
}

function validateReviewCommon(review = {}, packet = {}, options = {}, expectedTier) {
  if (!review || typeof review !== "object" || Array.isArray(review)) return fail(`${expectedTier}_review_missing`);
  const allowed = new Set([
    "reviewVersion",
    "providerTier",
    "provider",
    "providerProfile",
    "model",
    "packetDigest",
    "findingIdentityDigest",
    "baseSha",
    "headSha",
    "ref",
    "verdict",
    "confidence",
    "findings",
    "conditions",
    "conditional",
    "secretBoundaryPass",
    "budgetPass",
    "endpointVerified",
    "recoveryVerified",
    "noForbiddenActionVerified",
    "evidenceChanged",
    "completedAt",
    "reviewDigest",
  ]);
  const unknown = Object.keys(review).find((key) => !allowed.has(key));
  if (unknown) return fail(`${expectedTier}_review_unknown_field:${unknown}`);
  if (review.reviewVersion !== 1) return fail(`${expectedTier}_review_version_unsupported`);
  for (const key of ["provider", "providerProfile", "model", "verdict", "confidence"]) {
    if (typeof review[key] !== "string" || !idPattern.test(review[key])) return fail(`${expectedTier}_review_${key}_invalid`);
  }
  if (review.packetDigest !== packet.packetDigest) return fail(`${expectedTier}_review_packet_digest_mismatch`);
  if (review.findingIdentityDigest !== findingIdentityDigest(packet)) return fail(`${expectedTier}_review_finding_digest_mismatch`);
  if (!shaPattern.test(review.baseSha || "") || !shaPattern.test(review.headSha || "")) return fail(`${expectedTier}_review_sha_invalid`);
  if (packet.ref && review.ref !== packet.ref) return fail(`${expectedTier}_review_ref_mismatch`);
  if (!Array.isArray(review.findings) || review.findings.length > 10) return fail(`${expectedTier}_review_findings_invalid`);
  if (!Array.isArray(review.conditions) || review.conditions.length > 10) return fail(`${expectedTier}_review_conditions_invalid`);
  if (!validIso(review.completedAt)) return fail(`${expectedTier}_review_completed_at_invalid`);
  if (packet.expiresAt && new Date(review.completedAt).getTime() > new Date(packet.expiresAt).getTime()) return fail(`${expectedTier}_review_after_packet_expiry`);
  if (options.now && new Date(packet.expiresAt).getTime() <= new Date(options.now).getTime()) return fail(`${expectedTier}_packet_expired`);
  if (review.reviewDigest !== sha256({ ...review, reviewDigest: undefined })) return fail(`${expectedTier}_review_digest_mismatch`);
  if (unsafeText.test(JSON.stringify(review))) return fail(`${expectedTier}_review_unsanitized`);
  return { ok: true };
}

function reviewBundleDigest(bundle) {
  return sha256({ ...bundle, reviewBundleDigest: undefined });
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function validIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.includes("T");
}

function fail(reason) {
  return { ok: false, reason, errors: [reason] };
}
