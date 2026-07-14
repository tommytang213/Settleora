import { createHash } from "node:crypto";
import { validateFalsePositivePacket } from "./security-findings-false-positive.mjs";
import { validateFalsePositiveReviewBundle } from "./security-findings-reviews.mjs";

export const securityFindingDispositionVersion = 1;

export const supportedDispositionReasons = Object.freeze({
  code_scanning_alert: Object.freeze(["false positive"]),
  dependabot_alert: Object.freeze(["inaccurate"]),
});

const shaPattern = /^[0-9a-f]{40}$/i;
const digestPattern = /^[0-9a-f]{16,64}$/i;

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
  const digest = preconditionDigest({ packetDigest: packet.packetDigest, reviewBundleDigest: reviewBundle.reviewBundleDigest, rereadDigest: reread.rereadDigest });
  return {
    ok: true,
    precondition: {
      preconditionVersion: securityFindingDispositionVersion,
      packetDigest: packet.packetDigest,
      reviewBundleDigest: reviewBundle.reviewBundleDigest,
      rereadDigest: reread.rereadDigest,
      state: reread.state,
      reason: "exact_alert_current_open",
      createdAt: options.now || new Date().toISOString(),
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
  if (!precondition?.preconditionDigest || precondition.packetDigest !== packet.packetDigest) return fail("disposition_precondition_invalid");
  if (!adapter || typeof adapter.rereadAlert !== "function" || typeof adapter.dismissAlert !== "function") return fail("disposition_adapter_missing");
  const finalRead = await adapter.rereadAlert(packet);
  const finalMatch = validateAlertReread(packet, finalRead);
  if (!finalMatch.ok) return finalMatch;
  const finalDigest = preconditionDigest({ packetDigest: packet.packetDigest, reviewBundleDigest: reviewBundle.reviewBundleDigest, rereadDigest: finalRead.rereadDigest });
  if (finalDigest !== precondition.preconditionDigest) return fail("disposition_precondition_race");
  const mutation = await adapter.dismissAlert({ packet, endpoint: policy.endpoint, reason });
  if (!mutation || mutation.status !== "ok") {
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
  return {
    ok: true,
    result: {
      dispositionVersion: securityFindingDispositionVersion,
      packetDigest: packet.packetDigest,
      preconditionDigest: precondition.preconditionDigest,
      endpoint: policy.endpoint,
      reason,
      mutationDigest: digestObject(sanitizeMutation(mutation)),
      confirmationDigest: confirmation.rereadDigest || digestObject(sanitizeReread(confirmation)),
      confirmedAt: options.now || new Date().toISOString(),
    },
  };
}

export function validateAlertReread(packet = {}, reread = {}) {
  if (!reread || typeof reread !== "object") return fail("alert_reread_missing");
  if (reread.status && reread.status !== "ok") return fail(`alert_reread_inaccessible:${reread.reason || "unknown"}`);
  const fields = ["repository", "sourceKind", "provider", "tool", "alertId", "ruleId", "fingerprint", "ref", "analyzedSha"];
  for (const field of fields) {
    if (packet[field] && reread[field] && packet[field] !== reread[field]) return fail(`alert_reread_${field}_mismatch`);
  }
  if (packet.dependencyIdentity && JSON.stringify(packet.dependencyIdentity) !== JSON.stringify(reread.dependencyIdentity || null)) {
    return fail("alert_reread_dependency_identity_mismatch");
  }
  if (reread.state !== "open") return fail("alert_reread_not_open");
  if (reread.current !== true) return fail("alert_reread_not_current");
  if (!digestPattern.test(reread.rereadDigest || "")) return fail("alert_reread_digest_invalid");
  return { ok: true };
}

export function postDispositionReconciliation(packet = {}, dispositionResult = {}, evidence = {}) {
  if (!dispositionResult?.result) return fail("post_disposition_result_missing");
  if (evidence.providerState !== "dismissed" && evidence.providerState !== "closed") return fail("post_disposition_provider_state_invalid");
  if (evidence.reason !== dispositionResult.result.reason) return fail("post_disposition_reason_mismatch");
  if (evidence.noWeakeningVerified !== true) return fail("post_disposition_no_weakening_missing");
  if (evidence.currentMainScannerClean !== true) return fail("post_disposition_current_main_not_clean");
  if (evidence.supersedingFingerprintPresent === true) return fail("post_disposition_superseding_fingerprint");
  return {
    ok: true,
    reconciliation: {
      reconciliationVersion: securityFindingDispositionVersion,
      packetDigest: packet.packetDigest,
      dispositionDigest: digestObject(dispositionResult.result),
      providerState: evidence.providerState,
      reason: evidence.reason,
      currentMainDigest: evidence.currentMainDigest || null,
      reconciledAt: evidence.reconciledAt || new Date().toISOString(),
      reconciliationDigest: digestObject({
        packetDigest: packet.packetDigest,
        providerState: evidence.providerState,
        reason: evidence.reason,
        currentMainDigest: evidence.currentMainDigest || null,
      }),
    },
  };
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
