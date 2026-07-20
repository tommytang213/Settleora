import { createHash } from "node:crypto";
import {
  assertPreEffectIntentAuthority,
  loadPreEffectIntent,
  preparePreEffectIntent,
  reconcilePreEffectIntent,
  transitionPreEffectIntent,
} from "./pre-effect-intent.mjs";

export const canonicalEffectClassifications = Object.freeze([
  "effect_absent_safe_to_execute",
  "effect_present_exact_adoptable",
  "effect_confirmed",
  "effect_ambiguous",
  "effect_contradictory",
  "live_read_unavailable",
]);

export async function executeCanonicalEffect(config, input, adapters = {}) {
  requireAdapter(adapters.readLive, "readLive");
  requireAdapter(adapters.execute, "execute");
  const intent = input.intentId
    ? loadPreEffectIntent(config, input.intentId)
    : preparePreEffectIntent(config, input.intent, input.intentOptions);
  if (!intent) return blocked("canonical_intent_missing");
  assertIdentity(intent, input.expectedIdentity);
  assertPreEffectIntentAuthority(intent, config.currentAuthority);

  const before = await safeRead(adapters.readLive, intent);
  const initial = reconcilePreEffectIntent(intent, before);
  if (!canonicalEffectClassifications.includes(initial.classification)) return blocked("canonical_classification_invalid", intent);
  if (initial.classification === "effect_confirmed") return finalized(config, intent, initial, "already_confirmed");
  if (initial.classification === "effect_present_exact_adoptable") {
    const executing = intent.status === "prepared" ? transitionPreEffectIntent(config, intent, "executing") : intent;
    const adopted = transitionPreEffectIntent(config, executing, "adopted_after_recovery", { diagnostics: ["exact_live_effect_adopted"] });
    return finalized(config, adopted, initial, "adopted");
  }
  if (initial.classification === "live_read_unavailable") return pending(intent, initial.classification);
  if (initial.classification !== "effect_absent_safe_to_execute") return failClosed(config, intent, initial.classification);

  const executing = intent.status === "prepared" ? transitionPreEffectIntent(config, intent, "executing") : intent;
  let execution;
  try { execution = await adapters.execute(executing); }
  catch {
    const uncertain = await safeRead(adapters.readLive, executing);
    const reconciliation = reconcilePreEffectIntent(executing, uncertain);
    if (reconciliation.classification === "effect_present_exact_adoptable") {
      const adopted = transitionPreEffectIntent(config, executing, "adopted_after_recovery", { diagnostics: ["exact_live_effect_adopted_after_execution_error"] });
      return finalized(config, adopted, reconciliation, "adopted");
    }
    return pending(executing, `effect_execution_uncertain_${reconciliation.classification}`);
  }
  const after = await safeRead(adapters.readLive, executing);
  const readback = reconcilePreEffectIntent(executing, after);
  if (["live_read_unavailable", "effect_absent_safe_to_execute"].includes(readback.classification)) return pending(executing, `post_effect_${readback.classification}`);
  if (readback.classification !== "effect_present_exact_adoptable") return failClosed(config, executing, `post_effect_${readback.classification}`);
  const confirmed = transitionPreEffectIntent(config, executing, "live_confirmed", { diagnostics: ["exact_live_effect_read_back"] });
  return { ...finalized(config, confirmed, readback, "executed"), execution: sanitizeResult(execution) };
}

export function executeCanonicalEffectSync(config, input, adapters = {}) {
  requireAdapter(adapters.readLive, "readLive");
  requireAdapter(adapters.execute, "execute");
  const intent = input.intentId ? loadPreEffectIntent(config, input.intentId) : preparePreEffectIntent(config, input.intent, input.intentOptions);
  if (!intent) return blocked("canonical_intent_missing");
  assertIdentity(intent, input.expectedIdentity);
  assertPreEffectIntentAuthority(intent, config.currentAuthority);
  let before;
  try { before = adapters.readLive(intent); } catch { before = { complete: false }; }
  const initial = reconcilePreEffectIntent(intent, before);
  if (!canonicalEffectClassifications.includes(initial.classification)) return blocked("canonical_classification_invalid", intent);
  if (initial.classification === "effect_confirmed") return finalized(config, intent, initial, "already_confirmed");
  if (initial.classification === "effect_present_exact_adoptable") {
    const executing = intent.status === "prepared" ? transitionPreEffectIntent(config, intent, "executing") : intent;
    return finalized(config, transitionPreEffectIntent(config, executing, "adopted_after_recovery", { diagnostics: ["exact_live_effect_adopted"] }), initial, "adopted");
  }
  if (initial.classification === "live_read_unavailable") return pending(intent, initial.classification);
  if (initial.classification !== "effect_absent_safe_to_execute") return failClosed(config, intent, initial.classification);
  const executing = intent.status === "prepared" ? transitionPreEffectIntent(config, intent, "executing") : intent;
  let execution;
  try { execution = adapters.execute(executing); } catch {
    let uncertain;
    try { uncertain = adapters.readLive(executing); } catch { uncertain = { complete: false }; }
    const reconciliation = reconcilePreEffectIntent(executing, uncertain);
    if (reconciliation.classification === "effect_present_exact_adoptable") {
      const adopted = transitionPreEffectIntent(config, executing, "adopted_after_recovery", { diagnostics: ["exact_live_effect_adopted_after_execution_error"] });
      return finalized(config, adopted, reconciliation, "adopted");
    }
    return pending(executing, `effect_execution_uncertain_${reconciliation.classification}`);
  }
  let after;
  try { after = adapters.readLive(executing); } catch { after = { complete: false }; }
  const readback = reconcilePreEffectIntent(executing, after);
  if (["live_read_unavailable", "effect_absent_safe_to_execute"].includes(readback.classification)) return pending(executing, `post_effect_${readback.classification}`);
  if (readback.classification !== "effect_present_exact_adoptable") return failClosed(config, executing, `post_effect_${readback.classification}`);
  const confirmed = transitionPreEffectIntent(config, executing, "live_confirmed", { diagnostics: ["exact_live_effect_read_back"] });
  return { ...finalized(config, confirmed, readback, "executed"), execution: sanitizeResult(execution) };
}

export function bridgeLegacyEffectState({ canonicalIntent = null, legacy = null, exactIdentity = null, crashWindow = false } = {}) {
  if (canonicalIntent && legacy && legacy.fingerprint && legacy.fingerprint !== canonicalIntent.fingerprint) return { ok: false, authoritative: "canonical", reasonCode: "legacy_canonical_conflict" };
  if (canonicalIntent) return { ok: true, authoritative: "canonical", intent: canonicalIntent, projection: legacy ? "legacy_non_authoritative" : null };
  if (!legacy) return { ok: true, authoritative: null, projection: null };
  if (crashWindow) return { ok: false, authoritative: null, projection: "legacy_non_authoritative", reasonCode: "canonical_pre_effect_intent_required_for_adoption" };
  const expected = fingerprint(exactIdentity);
  if (!legacy.fingerprint || !expected || legacy.fingerprint !== expected) return { ok: false, authoritative: null, projection: "legacy_non_authoritative", reasonCode: "legacy_identity_not_exact" };
  return { ok: true, authoritative: null, projection: "legacy_non_authoritative", forwardExecutionAllowed: true };
}

async function safeRead(readLive, intent) {
  try { return await readLive(intent); }
  catch { return { complete: false }; }
}
function assertIdentity(intent, expected = {}) {
  const checks = ["repository", "sourceTaskKey", "runId", "logicalTaskIdentity", "claimIdentity", "chargeIdentity", "sessionId", "authorityGeneration"];
  for (const key of checks) if (expected[key] !== undefined && intent[key] !== expected[key]) throw new Error(`Canonical effect identity mismatch: ${key}`);
  for (const key of ["branchName", "baseBranch", "baseSha", "headSha", "candidateIdentity", "prNumber", "issueNumber", "reservationIdentity"]) {
    if (expected[key] !== undefined && intent.identity?.[key] !== expected[key]) throw new Error(`Canonical effect identity mismatch: ${key}`);
  }
}
function finalized(config, intent, classification, action) {
  const current = loadPreEffectIntent(config, intent.intentId);
  const finalIntent = current.status === "finalized" ? current : transitionPreEffectIntent(config, current, "finalized", { diagnostics: [`canonical_effect_${action}`] });
  return { ok: true, action, classification: classification.classification, intentId: finalIntent.intentId, fingerprint: finalIntent.fingerprint, status: finalIntent.status };
}
function failClosed(config, intent, reasonCode) {
  let current = loadPreEffectIntent(config, intent.intentId) || intent;
  if (!['finalized', 'failed_closed'].includes(current.status)) current = transitionPreEffectIntent(config, current, "failed_closed", { diagnostics: [reasonCode] });
  return { ok: false, action: "none", classification: reasonCode, reasonCode, intentId: current.intentId, status: current.status };
}
function blocked(reasonCode, intent = null) { return { ok: false, action: "none", reasonCode, intentId: intent?.intentId || null }; }
function pending(intent, reasonCode) { return { ok: false, action: "pending_reconciliation", reasonCode, classification: reasonCode, intentId: intent.intentId, status: intent.status }; }
function requireAdapter(value, name) { if (typeof value !== "function") throw new Error(`Canonical effect ${name} adapter required`); }
function sanitizeResult(value) { return value && typeof value === "object" ? { ok: value.ok === true, status: Number.isSafeInteger(value.status) ? value.status : null } : null; }
function fingerprint(value) { if (!value || typeof value !== "object") return null; return createHash("sha256").update(canonical(value)).digest("hex"); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
