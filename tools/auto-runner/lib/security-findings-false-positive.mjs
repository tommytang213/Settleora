import { createHash } from "node:crypto";
import { validateSecurityFindingClassification } from "./security-findings-classifier.mjs";
import { validateSecurityFindingReconciliation } from "./security-findings-reconciliation.mjs";

export const falsePositivePacketVersion = 1;

export const falsePositiveAnalysisKinds = Object.freeze([
  "scanner_model_inapplicable",
  "source_to_sink_impossible",
  "dependency_not_present_or_reachable",
  "test_harness_transport_only",
  "duplicate_or_superseded_exact_fingerprint",
]);

export const deterministicProofKinds = Object.freeze([
  "test_result_digest",
  "static_analysis_digest",
  "source_to_sink_graph_digest",
  "dependency_graph_digest",
  "current_main_scanner_digest",
  "test_harness_transport_digest",
]);

const requiredProofsByAnalysisKind = Object.freeze({
  scanner_model_inapplicable: Object.freeze(["static_analysis_digest", "current_main_scanner_digest"]),
  source_to_sink_impossible: Object.freeze(["source_to_sink_graph_digest", "test_result_digest"]),
  dependency_not_present_or_reachable: Object.freeze(["dependency_graph_digest", "current_main_scanner_digest"]),
  test_harness_transport_only: Object.freeze(["test_harness_transport_digest", "test_result_digest"]),
  duplicate_or_superseded_exact_fingerprint: Object.freeze(["current_main_scanner_digest", "static_analysis_digest"]),
});

const packetFields = new Set([
  "packetVersion",
  "repository",
  "sourceKind",
  "provider",
  "tool",
  "alertId",
  "ruleId",
  "fingerprint",
  "ref",
  "analyzedSha",
  "dependencyIdentity",
  "linkedIssue",
  "correlationKey",
  "idempotencyKey",
  "candidateClassificationDigest",
  "reconciliationDigest",
  "findingSnapshotDigest",
  "analysisKind",
  "analysisReasonCodes",
  "deterministicProofs",
  "currentMainProof",
  "noWeakeningProof",
  "reviewPackageDigest",
  "createdAt",
  "expiresAt",
  "packetDigest",
]);

const sourceKinds = new Set(["dependabot_alert", "code_scanning_alert"]);
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const shaPattern = /^[0-9a-f]{40}$/i;
const digestPattern = /^[0-9a-f]{16,64}$/i;
const idPattern = /^[A-Za-z0-9._:/@+ -]{1,240}$/;
const refPattern = /^(refs\/(?:heads|pull|tags)\/[A-Za-z0-9._/:-]{1,200}|[A-Za-z0-9._/-]{1,120})$/;
const unsafeText = /rawSarif|rawPayload|providerPayload|snippet|Bearer\s+|token=|password=|secret=|ignore previous instructions|system prompt/i;

export function buildFalsePositivePacket(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const ttlMinutes = boundedInteger(options.ttlMinutes ?? 60, 1, 24 * 60, "ttlMinutes");
  const finding = input.finding || {};
  const classification = input.classification || {};
  const reconciliation = input.reconciliation || {};
  const packet = {
    packetVersion: falsePositivePacketVersion,
    repository: finding.repository,
    sourceKind: finding.sourceKind,
    provider: finding.provider,
    tool: finding.tool,
    alertId: finding.alertId || null,
    ruleId: finding.ruleId || null,
    fingerprint: finding.fingerprint || null,
    ref: finding.ref || null,
    analyzedSha: finding.analyzedSha || null,
    dependencyIdentity: dependencyIdentity(finding),
    linkedIssue: input.linkedIssue || null,
    correlationKey: finding.correlationKey,
    idempotencyKey: finding.idempotencyKey,
    candidateClassificationDigest: classification.policyDigest || digestObject(classification),
    reconciliationDigest: reconciliation.digest || digestObject(reconciliation),
    findingSnapshotDigest: digestObject({
      repository: finding.repository,
      sourceKind: finding.sourceKind,
      provider: finding.provider,
      tool: finding.tool,
      alertId: finding.alertId || null,
      ruleId: finding.ruleId || null,
      fingerprint: finding.fingerprint || null,
      ref: finding.ref || null,
      analyzedSha: finding.analyzedSha || null,
      dependencyIdentity: dependencyIdentity(finding),
      state: finding.state || null,
    }),
    analysisKind: input.analysisKind,
    analysisReasonCodes: boundStringList(input.analysisReasonCodes || [], 10),
    deterministicProofs: input.deterministicProofs || [],
    currentMainProof: input.currentMainProof || null,
    noWeakeningProof: input.noWeakeningProof || null,
    reviewPackageDigest: input.reviewPackageDigest || null,
    createdAt: now,
    expiresAt: new Date(new Date(now).getTime() + ttlMinutes * 60_000).toISOString(),
  };
  packet.packetDigest = packetDigest(packet);
  const validation = validateFalsePositivePacket(packet, { classification, reconciliation, now });
  if (!validation.ok) return validation;
  return { ok: true, packet };
}

export function validateFalsePositivePacket(packet = {}, context = {}) {
  const errors = [];
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return fail("packet_not_object");
  for (const key of Object.keys(packet)) {
    if (!packetFields.has(key)) errors.push(`unknown_field:${key}`);
  }
  if (packet.packetVersion !== falsePositivePacketVersion) errors.push("packet_version_unsupported");
  if (!repoPattern.test(packet.repository || "")) errors.push("repository_invalid");
  if (!sourceKinds.has(packet.sourceKind)) errors.push("source_kind_unsupported");
  for (const key of ["provider", "tool", "correlationKey", "idempotencyKey"]) validateBoundedId(packet[key], key, errors);
  for (const key of ["alertId", "ruleId", "fingerprint", "reviewPackageDigest"]) validateOptionalId(packet[key], key, errors);
  if (packet.ref && !refPattern.test(packet.ref)) errors.push("ref_invalid");
  if (packet.analyzedSha && !shaPattern.test(packet.analyzedSha)) errors.push("analyzed_sha_invalid");
  if (!falsePositiveAnalysisKinds.includes(packet.analysisKind)) errors.push("analysis_kind_unsupported");
  if (!Array.isArray(packet.analysisReasonCodes) || packet.analysisReasonCodes.length === 0 || packet.analysisReasonCodes.length > 10) {
    errors.push("analysis_reason_codes_invalid");
  }
  const proofValidation = validateDeterministicProofs(packet.analysisKind, packet.deterministicProofs);
  if (!proofValidation.ok) errors.push(proofValidation.reason);
  const currentMain = validateCurrentMainProof(packet.currentMainProof, packet);
  if (!currentMain.ok) errors.push(currentMain.reason);
  const noWeakening = validateNoWeakeningProof(packet.noWeakeningProof, packet);
  if (!noWeakening.ok) errors.push(noWeakening.reason);
  for (const key of ["candidateClassificationDigest", "reconciliationDigest", "findingSnapshotDigest"]) {
    if (!digestPattern.test(packet[key] || "")) errors.push(`${key}_invalid`);
  }
  if (packet.linkedIssue !== null && (!Number.isInteger(packet.linkedIssue) || packet.linkedIssue < 1)) errors.push("linked_issue_invalid");
  if (!validIso(packet.createdAt) || !validIso(packet.expiresAt)) errors.push("packet_timestamps_invalid");
  else if (new Date(packet.expiresAt).getTime() <= new Date(packet.createdAt).getTime()) errors.push("packet_expiry_invalid");
  const now = new Date(context.now || new Date()).getTime();
  if (validIso(packet.expiresAt) && new Date(packet.expiresAt).getTime() <= now) errors.push("packet_expired");
  if (context.classification) {
    const classificationValidation = validateSecurityFindingClassification(context.classification);
    if (!classificationValidation.ok) errors.push(`classification_invalid:${classificationValidation.reason}`);
    const expected = context.classification.policyDigest || digestObject(context.classification);
    if (packet.candidateClassificationDigest !== expected) errors.push("classification_digest_mismatch");
  }
  if (context.reconciliation) {
    const reconciliationValidation = validateSecurityFindingReconciliation(context.reconciliation);
    if (!reconciliationValidation.ok) errors.push(`reconciliation_invalid:${reconciliationValidation.reason}`);
    const expected = context.reconciliation.digest || digestObject(context.reconciliation);
    if (packet.reconciliationDigest !== expected) errors.push("reconciliation_digest_mismatch");
  }
  const serialized = JSON.stringify(packet);
  if (serialized.length > 12000) errors.push("packet_oversized");
  if (unsafeText.test(serialized) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(serialized)) errors.push("packet_unsanitized");
  if (packet.packetDigest !== packetDigest(packet)) errors.push("packet_digest_mismatch");
  return errors.length > 0 ? { ok: false, reason: errors[0], errors } : { ok: true, packet };
}

export function validateNoWeakeningProof(proof = {}, packet = {}) {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) return fail("no_weakening_proof_missing");
  const allowed = new Set(["proofVersion", "headSha", "baseSha", "ref", "scannerConfigDigest", "workflowDigest", "changedFilesDigest", "ruleId", "forbiddenSignalsAbsent", "checkedAt"]);
  const unknown = Object.keys(proof).find((key) => !allowed.has(key));
  if (unknown) return fail(`no_weakening_unknown_field:${unknown}`);
  if (proof.proofVersion !== 1) return fail("no_weakening_version_unsupported");
  if (!shaPattern.test(proof.headSha || "") || !shaPattern.test(proof.baseSha || "")) return fail("no_weakening_sha_invalid");
  if (packet.ref && proof.ref !== packet.ref) return fail("no_weakening_ref_mismatch");
  if (packet.ruleId && proof.ruleId !== packet.ruleId) return fail("no_weakening_rule_mismatch");
  for (const key of ["scannerConfigDigest", "workflowDigest", "changedFilesDigest"]) {
    if (!digestPattern.test(proof[key] || "")) return fail(`no_weakening_${key}_invalid`);
  }
  const absent = proof.forbiddenSignalsAbsent || {};
  const required = ["queryExclusion", "pathIgnore", "suppression", "skippedCheck", "generatedHiding", "renamedToEvade", "riskAcceptance"];
  for (const key of required) {
    if (absent[key] !== true) return fail(`no_weakening_forbidden_signal:${key}`);
  }
  if (!validIso(proof.checkedAt)) return fail("no_weakening_checked_at_invalid");
  return { ok: true };
}

function validateDeterministicProofs(analysisKind, proofs = []) {
  if (!Array.isArray(proofs) || proofs.length === 0 || proofs.length > 8) return fail("deterministic_proofs_invalid");
  const allowed = new Set(["proofVersion", "kind", "commandId", "subjectDigest", "resultDigest", "headSha", "producedAt"]);
  const kinds = new Set();
  for (const proof of proofs) {
    if (!proof || typeof proof !== "object" || Array.isArray(proof)) return fail("deterministic_proof_not_object");
    const unknown = Object.keys(proof).find((key) => !allowed.has(key));
    if (unknown) return fail(`deterministic_proof_unknown_field:${unknown}`);
    if (proof.proofVersion !== 1) return fail("deterministic_proof_version_unsupported");
    if (!deterministicProofKinds.includes(proof.kind)) return fail("deterministic_proof_kind_unsupported");
    validateBoundedId(proof.commandId, "commandId", []);
    if (!idPattern.test(proof.commandId || "")) return fail("deterministic_proof_command_invalid");
    for (const key of ["subjectDigest", "resultDigest"]) {
      if (!digestPattern.test(proof[key] || "")) return fail(`deterministic_proof_${key}_invalid`);
    }
    if (!shaPattern.test(proof.headSha || "")) return fail("deterministic_proof_head_invalid");
    if (!validIso(proof.producedAt)) return fail("deterministic_proof_time_invalid");
    kinds.add(proof.kind);
  }
  for (const required of requiredProofsByAnalysisKind[analysisKind] || []) {
    if (!kinds.has(required)) return fail(`deterministic_proof_missing:${required}`);
  }
  return { ok: true };
}

function validateCurrentMainProof(proof = {}, packet = {}) {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) return fail("current_main_proof_missing");
  const allowed = new Set(["proofVersion", "repository", "mainSha", "scannerDigest", "ruleId", "fingerprintAbsentOrSuperseded", "checkedAt"]);
  const unknown = Object.keys(proof).find((key) => !allowed.has(key));
  if (unknown) return fail(`current_main_unknown_field:${unknown}`);
  if (proof.proofVersion !== 1) return fail("current_main_version_unsupported");
  if (proof.repository !== packet.repository) return fail("current_main_repository_mismatch");
  if (!shaPattern.test(proof.mainSha || "")) return fail("current_main_sha_invalid");
  if (!digestPattern.test(proof.scannerDigest || "")) return fail("current_main_scanner_digest_invalid");
  if (packet.ruleId && proof.ruleId !== packet.ruleId) return fail("current_main_rule_mismatch");
  if (proof.fingerprintAbsentOrSuperseded !== true) return fail("current_main_fingerprint_not_absent");
  if (!validIso(proof.checkedAt)) return fail("current_main_checked_at_invalid");
  return { ok: true };
}

function packetDigest(packet) {
  const { packetDigest: _ignored, ...authority } = packet;
  return digestObject(authority);
}

function digestObject(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function dependencyIdentity(finding = {}) {
  if (!finding.dependency && !finding.packageEcosystem && !finding.manifestPath) return null;
  return {
    dependency: finding.dependency || null,
    packageEcosystem: finding.packageEcosystem || null,
    manifestPath: finding.manifestPath || null,
  };
}

function validateBoundedId(value, key, errors) {
  if (typeof value !== "string" || !idPattern.test(value)) errors.push(`${key}_invalid`);
}

function validateOptionalId(value, key, errors) {
  if (value !== null && value !== undefined && (typeof value !== "string" || !idPattern.test(value))) errors.push(`${key}_invalid`);
}

function validIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.includes("T");
}

function boundedInteger(value, min, max, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} out of bounds`);
  return parsed;
}

function boundStringList(values, max) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === "string" && idPattern.test(value)).slice(0, max);
}

function fail(reason) {
  return { ok: false, reason, errors: [reason] };
}
