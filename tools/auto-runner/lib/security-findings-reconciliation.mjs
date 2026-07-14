import { createHash } from "node:crypto";

export const securityFindingReconciliationVersion = 1;

export const securityFindingReconciliationStates = Object.freeze([
  "current_open",
  "stale_ref",
  "superseded_fingerprint",
  "resolved_upstream",
  "missing_or_inaccessible",
  "ambiguous",
  "requires_current_main_scan",
]);

const stateSet = new Set(securityFindingReconciliationStates);

export function reconcileSecurityFinding(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const finding = input.finding || {};
  const current = input.current || null;
  const failures = input.failures || [];
  const base = {
    reconciliationVersion: securityFindingReconciliationVersion,
    correlationKey: finding.correlationKey || null,
    idempotencyKey: finding.idempotencyKey || null,
    state: "ambiguous",
    reasonCodes: [],
    requiredCurrentMainScan: false,
    reconciledAt: now,
  };
  if (failures.length > 0) return finalize(base, "missing_or_inaccessible", failures.map((failure) => `provider_inaccessible:${failure}`));
  if (input.matches && input.matches.length > 1) return finalize(base, "ambiguous", ["multiple_current_matches"]);
  if (!current) return finalize(base, "missing_or_inaccessible", ["current_identity_missing"]);
  if (input.requiresCurrentMainScan || /^refs\/pull\//.test(String(finding.ref || ""))) {
    return finalize(base, "requires_current_main_scan", ["pr_or_baseline_finding_requires_current_main"], { requiredCurrentMainScan: true });
  }
  const mismatches = identityMismatches(finding, current);
  if (mismatches.includes("repository")) return finalize(base, "ambiguous", ["repository_mismatch"]);
  if (mismatches.includes("dependency_identity")) return finalize(base, "ambiguous", ["dependency_identity_mismatch"]);
  if (mismatches.includes("rule")) return finalize(base, "superseded_fingerprint", ["rule_or_analyzer_changed"]);
  if (mismatches.includes("fingerprint")) return finalize(base, "superseded_fingerprint", ["fingerprint_changed"]);
  if (mismatches.includes("ref") || mismatches.includes("sha")) return finalize(base, "stale_ref", ["ref_or_analyzed_sha_changed"]);
  if (current.state && ["fixed", "dismissed", "closed", "merged"].includes(current.state)) return finalize(base, "resolved_upstream", ["current_state_not_open"]);
  return finalize(base, "current_open", ["exact_identity_current_open"]);
}

export function validateSecurityFindingReconciliation(result = {}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return { ok: false, reason: "reconciliation_not_object" };
  const allowed = new Set(["reconciliationVersion", "correlationKey", "idempotencyKey", "state", "reasonCodes", "requiredCurrentMainScan", "reconciledAt", "digest"]);
  const unknown = Object.keys(result).find((key) => !allowed.has(key));
  if (unknown) return { ok: false, reason: `reconciliation_unknown_field:${unknown}` };
  if (result.reconciliationVersion !== securityFindingReconciliationVersion) return { ok: false, reason: "reconciliation_version_unsupported" };
  if (!stateSet.has(result.state)) return { ok: false, reason: "reconciliation_state_invalid" };
  if (!Array.isArray(result.reasonCodes) || result.reasonCodes.length === 0 || result.reasonCodes.length > 10) return { ok: false, reason: "reconciliation_reasons_invalid" };
  if (/(rawPayload|sarif|snippet|Bearer\s+|token=|password=|secret=)/i.test(JSON.stringify(result))) return { ok: false, reason: "reconciliation_unsanitized" };
  return { ok: true };
}

function identityMismatches(finding = {}, current = {}) {
  const mismatches = [];
  if (current.repository && finding.repository && current.repository !== finding.repository) mismatches.push("repository");
  if (current.ruleId && finding.ruleId && current.ruleId !== finding.ruleId) mismatches.push("rule");
  if (current.tool && finding.tool && current.tool !== finding.tool) mismatches.push("rule");
  if (current.fingerprint && finding.fingerprint && current.fingerprint !== finding.fingerprint) mismatches.push("fingerprint");
  if (current.ref && finding.ref && current.ref !== finding.ref) mismatches.push("ref");
  if (current.analyzedSha && finding.analyzedSha && current.analyzedSha !== finding.analyzedSha) mismatches.push("sha");
  if (current.dependency && finding.dependency && current.dependency !== finding.dependency) mismatches.push("dependency_identity");
  if (current.packageEcosystem && finding.packageEcosystem && current.packageEcosystem !== finding.packageEcosystem) mismatches.push("dependency_identity");
  if (current.manifestPath && finding.manifestPath && current.manifestPath !== finding.manifestPath) mismatches.push("dependency_identity");
  return mismatches;
}

function finalize(base, state, reasonCodes, extra = {}) {
  const output = {
    ...base,
    ...extra,
    state,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 10),
  };
  output.digest = createHash("sha256")
    .update(JSON.stringify({ v: output.reconciliationVersion, key: output.correlationKey, state: output.state, reasons: output.reasonCodes }))
    .digest("hex")
    .slice(0, 32);
  const validation = validateSecurityFindingReconciliation(output);
  if (!validation.ok) throw new Error(`Invalid reconciliation: ${validation.reason}`);
  return output;
}
