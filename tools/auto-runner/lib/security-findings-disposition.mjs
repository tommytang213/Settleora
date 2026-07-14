import { createHash } from "node:crypto";
import {
  consumeDispositionRunSlot,
  recordDispositionRunOutcome,
} from "./security-findings-disposition-cap.mjs";
import { validateFalsePositivePacket } from "./security-findings-false-positive.mjs";
import { validateFalsePositiveReviewBundle } from "./security-findings-reviews.mjs";

export const securityFindingDispositionVersion = 1;

export const supportedDispositionReasons = Object.freeze({
  code_scanning_alert: Object.freeze(["false positive"]),
  dependabot_alert: Object.freeze(["inaccurate"]),
});

const shaPattern = /^[0-9a-f]{40}$/i;
const digestPattern = /^[0-9a-f]{16,64}$/i;
const idPattern = /^[A-Za-z0-9._:/@+ -]{1,240}$/;
const githubAlertIdPattern = /^[0-9]{1,20}$/;
const refPattern = /^(refs\/(?:heads|pull|tags)\/[A-Za-z0-9._/:-]{1,200}|[A-Za-z0-9._/-]{1,120})$/;
const defaultPreconditionTtlMs = 5 * 60_000;

export function normalizeSecurityFindingDispositionConfig(config = {}) {
  const raw = config.securityFindings || {};
  const allowedSourceReasons = raw.allowedDispositionReasons || supportedDispositionReasons;
  const normalizedReasons = {};
  for (const [sourceKind, reasons] of Object.entries(allowedSourceReasons)) {
    if (!supportedDispositionReasons[sourceKind]) throw new Error(`Unsupported disposition source kind: ${sourceKind}`);
    if (!Array.isArray(reasons) || reasons.length === 0) throw new Error(`Disposition reasons missing for ${sourceKind}`);
    normalizedReasons[sourceKind] = reasons.map((reason) => {
      if (!supportedDispositionReasons[sourceKind].includes(reason)) throw new Error(`Unsupported disposition reason for ${sourceKind}: ${reason}`);
      return reason;
    });
  }
  const allowSecurityFindingDisposition = Boolean(raw.allowSecurityFindingDisposition);
  const allowProvenFalsePositiveDisposition = Boolean(raw.allowProvenFalsePositiveDisposition);
  const allowSecurityFindingCompletionHygiene = Boolean(raw.allowSecurityFindingCompletionHygiene);
  if (allowSecurityFindingDisposition && raw.dryRunOnly !== false) throw new Error("Security finding disposition cannot be enabled while dryRunOnly is true");
  if (allowSecurityFindingDisposition && config.trustedRealRunApproved !== true) throw new Error("Security finding disposition requires trusted real-run approval");
  if (allowSecurityFindingDisposition && !allowProvenFalsePositiveDisposition) throw new Error("Security finding disposition requires proven false-positive capability");
  if (allowSecurityFindingCompletionHygiene && raw.reconciliationRequired === false) throw new Error("Security finding completion hygiene requires reconciliation");
  return {
    allowSecurityFindingDisposition,
    allowProvenFalsePositiveDisposition,
    allowSecurityFindingCompletionHygiene,
    falsePositiveEvidenceEnabled: Boolean(raw.allowFalsePositiveEvidence),
    dispositionDryRunOnly: raw.dispositionDryRunOnly !== false,
    packetTtlMinutes: boundedInt(raw.packetTtlMinutes, 1, 24 * 60, 60, "securityFindings.packetTtlMinutes"),
    maxDispositionsPerRun: boundedInt(raw.maxDispositionsPerRun, 0, 5, 1, "securityFindings.maxDispositionsPerRun"),
    allowedDispositionReasons: normalizedReasons,
    requirePostDispositionReconciliation: raw.requirePostDispositionReconciliation !== false,
  };
}

export function validateDispositionPolicy(packet = {}, reason = null) {
  const reasons = supportedDispositionReasons[packet.sourceKind];
  if (!reasons) return fail("disposition_source_kind_unsupported");
  if (!reasons.includes(reason)) return fail("disposition_reason_unsupported");
  if (!githubAlertIdPattern.test(packet.alertId || "")) return fail("disposition_alert_id_not_numeric");
  if (packet.sourceKind === "code_scanning_alert" && reason !== "false positive") return fail("code_scanning_reason_not_false_positive");
  if (packet.sourceKind === "dependabot_alert" && reason !== "inaccurate") return fail("dependabot_reason_not_inaccurate");
  return { ok: true, endpoint: endpointForPacket(packet), reason };
}

export async function prepareDispositionPrecondition(packet = {}, reviewBundle = {}, adapter, options = {}) {
  const packetValidation = validateFalsePositivePacket(packet, { now: options.now });
  if (!packetValidation.ok) return packetValidation;
  const reviewValidation = validateFalsePositiveReviewBundle(reviewBundle, packet, { now: options.now });
  if (!reviewValidation.ok) return reviewValidation;
  if (!adapter || typeof adapter.rereadAlert !== "function") return fail("disposition_adapter_missing_reread");
  const reread = await adapter.rereadAlert(packet);
  const match = validateAlertReread(packet, reread);
  if (!match.ok) return match;
  if (options.unresolvedReviewThreads === true) return fail("unresolved_review_threads");
  if (options.manualGateActive === true) return fail("manual_gate_active");
  if (options.contradictoryFinding === true) return fail("contradictory_finding_present");
  const createdAt = options.now || new Date().toISOString();
  const expiresAt = new Date(new Date(createdAt).getTime() + (options.preconditionTtlMs || defaultPreconditionTtlMs)).toISOString();
  const digest = preconditionDigest({
    packetDigest: packet.packetDigest,
    reviewBundleDigest: reviewBundle.reviewBundleDigest,
    rereadDigest: match.rereadDigest,
    sourceIdentityDigest: sourceIdentityDigest(packet),
    createdAt,
    expiresAt,
  });
  return {
    ok: true,
    precondition: {
      preconditionVersion: securityFindingDispositionVersion,
      packetDigest: packet.packetDigest,
      reviewBundleDigest: reviewBundle.reviewBundleDigest,
      rereadDigest: match.rereadDigest,
      sourceIdentityDigest: sourceIdentityDigest(packet),
      state: reread.state,
      reason: "exact_alert_current_open",
      createdAt,
      expiresAt,
      preconditionDigest: digest,
    },
  };
}

export async function executeFalsePositiveDisposition(config = {}, packet = {}, reviewBundle = {}, precondition = {}, adapter, options = {}) {
  const dispositionConfig = normalizeSecurityFindingDispositionConfig(config);
  if (!dispositionConfig.allowSecurityFindingDisposition || !dispositionConfig.allowProvenFalsePositiveDisposition) return fail("disposition_capability_disabled");
  if (config.dryRun || config.mode === "dry-run" || dispositionConfig.dispositionDryRunOnly) return fail("disposition_refuses_dry_run");
  const reason = options.reason || defaultReason(packet);
  const policy = validateDispositionPolicy(packet, reason);
  if (!policy.ok) return policy;
  const boundary = validateDispositionMutationBoundary(packet, reviewBundle, precondition, { now: options.now, reason });
  if (!boundary.ok) return boundary;
  if (!options.runId) return fail("disposition_run_id_required");
  const cap = consumeDispositionRunSlot(config, options.runId, packet, "attempted", dispositionConfig.maxDispositionsPerRun);
  if (!cap.ok) return cap;
  if (!adapter || typeof adapter.rereadAlert !== "function" || typeof adapter.dismissAlert !== "function") return fail("disposition_adapter_missing");
  const finalRead = await adapter.rereadAlert(packet);
  const finalMatch = validateAlertReread(packet, finalRead);
  if (!finalMatch.ok) return finalMatch;
  const finalDigest = preconditionDigest({
    packetDigest: packet.packetDigest,
    reviewBundleDigest: reviewBundle.reviewBundleDigest,
    rereadDigest: finalMatch.rereadDigest,
    sourceIdentityDigest: sourceIdentityDigest(packet),
    createdAt: precondition.createdAt,
    expiresAt: precondition.expiresAt,
  });
  if (finalDigest !== precondition.preconditionDigest) return fail("disposition_precondition_race");
  const mutation = await adapter.dismissAlert({ packet, endpoint: policy.endpoint, reason });
  if (!mutation || mutation.status !== "ok") {
    recordDispositionRunOutcome(config, options.runId, packet, "uncertain");
    const recoveryRead = await adapter.rereadAlert(packet);
    return {
      ok: false,
      reason: "disposition_outcome_uncertain",
      recoveryReread: sanitizeReread(recoveryRead),
      mutation: sanitizeMutation(mutation),
    };
  }
  const confirmation = await adapter.rereadAlert(packet);
  if (!["dismissed", "closed"].includes(confirmation.state) || confirmation.dismissedReason !== reason) {
    return fail("disposition_confirmation_failed", { confirmation: sanitizeReread(confirmation) });
  }
  recordDispositionRunOutcome(config, options.runId, packet, "confirmed");
  return {
    ok: true,
    result: {
      dispositionVersion: securityFindingDispositionVersion,
      packetDigest: packet.packetDigest,
      preconditionDigest: precondition.preconditionDigest,
      endpoint: policy.endpoint,
      reason,
      mutationDigest: digestObject(sanitizeMutation(mutation)),
      confirmationDigest: digestObject(sanitizeReread(confirmation)),
      confirmedAt: options.now || new Date().toISOString(),
    },
  };
}

export function validateDispositionMutationBoundary(packet = {}, reviewBundle = {}, precondition = {}, options = {}) {
  const packetValidation = validateFalsePositivePacket(packet, { now: options.now });
  if (!packetValidation.ok) return packetValidation;
  const reviewValidation = validateFalsePositiveReviewBundle(reviewBundle, packet, { now: options.now });
  if (!reviewValidation.ok) return reviewValidation;
  const policy = validateDispositionPolicy(packet, options.reason || defaultReason(packet));
  if (!policy.ok) return policy;
  const preconditionValidation = validateDispositionPrecondition(packet, reviewBundle, precondition, { now: options.now });
  if (!preconditionValidation.ok) return preconditionValidation;
  return { ok: true };
}

export function validateDispositionPrecondition(packet = {}, reviewBundle = {}, precondition = {}, options = {}) {
  if (!precondition || typeof precondition !== "object" || Array.isArray(precondition)) return fail("disposition_precondition_not_object");
  const allowed = new Set(["preconditionVersion", "packetDigest", "reviewBundleDigest", "rereadDigest", "sourceIdentityDigest", "state", "reason", "createdAt", "expiresAt", "preconditionDigest"]);
  const unknown = Object.keys(precondition).find((key) => !allowed.has(key));
  if (unknown) return fail(`disposition_precondition_unknown_field:${unknown}`);
  if (precondition.preconditionVersion !== securityFindingDispositionVersion) return fail("disposition_precondition_version_unsupported");
  if (precondition.packetDigest !== packet.packetDigest) return fail("disposition_precondition_packet_digest_mismatch");
  if (precondition.reviewBundleDigest !== reviewBundle.reviewBundleDigest) return fail("disposition_precondition_review_digest_mismatch");
  if (precondition.sourceIdentityDigest !== sourceIdentityDigest(packet)) return fail("disposition_precondition_source_identity_mismatch");
  if (!digestPattern.test(precondition.rereadDigest || "")) return fail("disposition_precondition_reread_digest_invalid");
  if (precondition.state !== "open") return fail("disposition_precondition_state_invalid");
  if (precondition.reason !== "exact_alert_current_open") return fail("disposition_precondition_reason_invalid");
  if (!validIso(precondition.createdAt) || !validIso(precondition.expiresAt)) return fail("disposition_precondition_timestamps_invalid");
  const nowMs = new Date(options.now || new Date()).getTime();
  if (new Date(precondition.expiresAt).getTime() <= nowMs) return fail("disposition_precondition_expired");
  const expected = preconditionDigest({
    packetDigest: packet.packetDigest,
    reviewBundleDigest: reviewBundle.reviewBundleDigest,
    rereadDigest: precondition.rereadDigest,
    sourceIdentityDigest: sourceIdentityDigest(packet),
    createdAt: precondition.createdAt,
    expiresAt: precondition.expiresAt,
  });
  if (precondition.preconditionDigest !== expected) return fail("disposition_precondition_digest_mismatch");
  return { ok: true };
}

export function validateAlertReread(packet = {}, reread = {}) {
  if (!reread || typeof reread !== "object" || Array.isArray(reread)) return fail("alert_reread_missing");
  if (reread.status && reread.status !== "ok") return fail(`alert_reread_inaccessible:${reread.reason || "unknown"}`);
  const allowed = new Set(["status", "reason", "repository", "sourceKind", "provider", "tool", "alertId", "ruleId", "fingerprint", "ref", "analyzedSha", "dependencyIdentity", "state", "dismissedReason", "current", "currentMainSha", "checkedAt", "rereadDigest"]);
  const unknown = Object.keys(reread).find((key) => !allowed.has(key));
  if (unknown) return fail(`alert_reread_unknown_field:${unknown}`);
  const fields = requiredRereadFields(packet);
  for (const field of fields) {
    if (reread[field] === null || reread[field] === undefined || reread[field] === "") return fail(`alert_reread_${field}_missing`);
    if (packet[field] !== reread[field]) return fail(`alert_reread_${field}_mismatch`);
  }
  if (packet.sourceKind === "code_scanning_alert") {
    if (!refPattern.test(reread.ref || "")) return fail("alert_reread_ref_invalid");
    if (!shaPattern.test(reread.analyzedSha || "")) return fail("alert_reread_analyzedSha_invalid");
  }
  if (packet.sourceKind === "dependabot_alert" && !reread.dependencyIdentity) return fail("alert_reread_dependency_identity_missing");
  if (packet.dependencyIdentity && digestObject(packet.dependencyIdentity) !== digestObject(reread.dependencyIdentity || null)) {
    return fail("alert_reread_dependency_identity_mismatch");
  }
  if (reread.state !== "open") return fail("alert_reread_not_open");
  if (reread.current !== true) return fail("alert_reread_not_current");
  if (reread.currentMainSha !== undefined && !shaPattern.test(reread.currentMainSha || "")) return fail("alert_reread_current_main_sha_invalid");
  if (!validIso(reread.checkedAt)) return fail("alert_reread_checked_at_invalid");
  const localDigest = canonicalRereadDigest(packet, reread);
  if (reread.rereadDigest !== undefined && reread.rereadDigest !== localDigest) return fail("alert_reread_digest_mismatch");
  return { ok: true, rereadDigest: localDigest };
}

export function postDispositionReconciliation(packet = {}, dispositionResult = {}, evidence = {}) {
  if (!dispositionResult?.result) return fail("post_disposition_result_missing");
  const validated = validatePostDispositionEvidence(packet, dispositionResult, evidence);
  if (!validated.ok) return validated;
  return {
    ok: true,
    reconciliation: {
      reconciliationVersion: securityFindingDispositionVersion,
      packetDigest: packet.packetDigest,
      dispositionDigest: digestObject(dispositionResult.result),
      providerState: evidence.providerState,
      reason: evidence.reason,
      providerRereadDigest: validated.providerRereadDigest,
      currentMainDigest: evidence.currentMainEvidence.digest,
      noWeakeningDigest: evidence.noWeakeningEvidence.digest,
      currentFindingQueryDigest: evidence.currentFindingQuery.digest,
      reconciledAt: evidence.reconciledAt || new Date().toISOString(),
      reconciliationDigest: digestObject({
        packetDigest: packet.packetDigest,
        dispositionDigest: digestObject(dispositionResult.result),
        providerState: evidence.providerState,
        reason: evidence.reason,
        providerRereadDigest: validated.providerRereadDigest,
        currentMainDigest: evidence.currentMainEvidence.digest,
        noWeakeningDigest: evidence.noWeakeningEvidence.digest,
        currentFindingQueryDigest: evidence.currentFindingQuery.digest,
      }),
    },
  };
}

export function validatePostDispositionEvidence(packet = {}, dispositionResult = {}, evidence = {}) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return fail("post_disposition_evidence_missing");
  const allowed = new Set(["providerState", "reason", "providerReread", "currentMainEvidence", "noWeakeningEvidence", "currentFindingQuery", "supersedingFingerprint", "reconciledAt"]);
  const unknown = Object.keys(evidence).find((key) => !allowed.has(key));
  if (unknown) return fail(`post_disposition_unknown_field:${unknown}`);
  if (!["dismissed", "closed"].includes(evidence.providerState)) return fail("post_disposition_provider_state_invalid");
  if (evidence.reason !== dispositionResult.result?.reason) return fail("post_disposition_reason_mismatch");
  const providerRereadDigest = validateDismissedProviderReread(packet, evidence.providerReread, evidence.reason);
  if (!providerRereadDigest.ok) return providerRereadDigest;
  const currentMain = validateDigestEvidence(evidence.currentMainEvidence, "current_main", ["repository", "ref", "mainSha", "scannerDigest", "checkConclusion"]);
  if (!currentMain.ok) return currentMain;
  if (evidence.currentMainEvidence.repository !== packet.repository) return fail("post_disposition_current_main_repository_mismatch");
  if (!shaPattern.test(evidence.currentMainEvidence.mainSha || "")) return fail("post_disposition_current_main_sha_invalid");
  if (evidence.currentMainEvidence.checkConclusion !== "success") return fail("post_disposition_current_main_not_clean");
  const noWeakening = validateDigestEvidence(evidence.noWeakeningEvidence, "no_weakening", ["digest", "packetDigest", "forbiddenSignalsAbsent"]);
  if (!noWeakening.ok) return noWeakening;
  if (evidence.noWeakeningEvidence.packetDigest !== packet.packetDigest) return fail("post_disposition_no_weakening_packet_mismatch");
  if (evidence.noWeakeningEvidence.forbiddenSignalsAbsent !== true) return fail("post_disposition_no_weakening_missing");
  const query = validateDigestEvidence(evidence.currentFindingQuery, "current_finding_query", ["digest", "packetDigest", "matchesCurrentFingerprint"]);
  if (!query.ok) return query;
  if (evidence.currentFindingQuery.packetDigest !== packet.packetDigest) return fail("post_disposition_current_finding_packet_mismatch");
  if (evidence.currentFindingQuery.matchesCurrentFingerprint !== false) return fail("post_disposition_current_fingerprint_still_present");
  if (evidence.supersedingFingerprint?.present === true) return fail("post_disposition_superseding_fingerprint");
  if (!validIso(evidence.reconciledAt)) return fail("post_disposition_reconciled_at_invalid");
  return { ok: true, providerRereadDigest: providerRereadDigest.rereadDigest };
}

function defaultReason(packet) {
  return packet.sourceKind === "dependabot_alert" ? "inaccurate" : "false positive";
}

function endpointForPacket(packet) {
  if (packet.sourceKind === "code_scanning_alert") return `/repos/${packet.repository}/code-scanning/alerts/${packet.alertId}`;
  if (packet.sourceKind === "dependabot_alert") return `/repos/${packet.repository}/dependabot/alerts/${packet.alertId}`;
  return null;
}

function preconditionDigest(value) {
  return digestObject(value);
}

export function sourceIdentityDigest(packet = {}) {
  return digestObject({
    repository: packet.repository,
    sourceKind: packet.sourceKind,
    provider: packet.provider,
    tool: packet.tool,
    alertId: packet.alertId,
    ruleId: packet.ruleId,
    fingerprint: packet.fingerprint,
    ref: packet.ref || null,
    analyzedSha: packet.analyzedSha || null,
    dependencyIdentity: packet.dependencyIdentity || null,
  });
}

function requiredRereadFields(packet = {}) {
  const common = ["repository", "sourceKind", "provider", "tool", "alertId", "ruleId", "fingerprint"];
  if (packet.sourceKind === "code_scanning_alert") return [...common, "ref", "analyzedSha"];
  return common;
}

function canonicalRereadDigest(packet = {}, reread = {}) {
  return digestObject({
    sourceIdentityDigest: sourceIdentityDigest(packet),
    repository: reread.repository,
    sourceKind: reread.sourceKind,
    provider: reread.provider,
    tool: reread.tool,
    alertId: reread.alertId,
    ruleId: reread.ruleId,
    fingerprint: reread.fingerprint,
    ref: reread.ref || null,
    analyzedSha: reread.analyzedSha || null,
    dependencyIdentity: reread.dependencyIdentity || null,
    state: reread.state,
    dismissedReason: reread.dismissedReason || null,
    current: reread.current,
    currentMainSha: reread.currentMainSha || null,
  });
}

function validateDismissedProviderReread(packet = {}, reread = {}, reason) {
  if (!reread || typeof reread !== "object" || Array.isArray(reread)) return fail("post_disposition_provider_reread_missing");
  const openEquivalent = { ...reread, state: "open", dismissedReason: undefined, rereadDigest: undefined };
  const identity = validateAlertReread(packet, openEquivalent);
  if (!identity.ok && identity.reason !== "alert_reread_not_open") return identity;
  if (!["dismissed", "closed"].includes(reread.state)) return fail("post_disposition_provider_state_invalid");
  if (reread.dismissedReason !== reason) return fail("post_disposition_reason_mismatch");
  return { ok: true, rereadDigest: canonicalRereadDigest(packet, reread) };
}

function validateDigestEvidence(evidence = {}, name, required = []) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return fail(`${name}_evidence_missing`);
  for (const key of required) {
    if (evidence[key] === undefined || evidence[key] === null || evidence[key] === "") return fail(`${name}_${key}_missing`);
  }
  if (!digestPattern.test(evidence.digest || "")) return fail(`${name}_digest_invalid`);
  const expected = digestObject({ ...evidence, digest: undefined });
  if (evidence.digest !== expected) return fail(`${name}_digest_mismatch`);
  return { ok: true };
}

function digestObject(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function sanitizeReread(reread = {}) {
  return {
    status: reread.status || null,
    reason: reread.reason || null,
    state: reread.state || null,
    dismissedReason: reread.dismissedReason || null,
    rereadDigest: reread.rereadDigest || null,
  };
}

function sanitizeMutation(mutation = {}) {
  return {
    status: mutation?.status || "unknown",
    httpStatus: mutation?.httpStatus || null,
    responseDigest: mutation?.responseDigest || null,
  };
}

function boundedInt(value, min, max, fallback, name) {
  const raw = value ?? fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} out of bounds`);
  return parsed;
}

function fail(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

function validIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.includes("T");
}
