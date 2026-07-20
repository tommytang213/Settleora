import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const preEffectIntentSchemaVersion = 1;
export const preEffectIntentStatuses = Object.freeze(["prepared", "executing", "live_confirmed", "adopted_after_recovery", "finalized", "failed_closed"]);
export const preEffectTypes = Object.freeze(["commit", "push", "pr_create", "pr_head_update", "merge", "comment", "issue_closure", "issue_progress_comment", "umbrella_update", "ledger_docs_update", "docs_branch_create", "docs_pr_create_update", "review_request", "docs_pr_ready", "docs_pr_merge", "branch_retention_verify"]);

export function preparePreEffectIntent(config, input, { now = new Date(), intentId = randomUUID() } = {}) {
  const effectType = requiredEnum(input.effectType, preEffectTypes, "effectType");
  const identity = boundedIdentity(input);
  const effect = sanitizeEffect(input.effect || {});
  const fingerprint = digest(canonical({ effectType, identity, effect }));
  const value = {
    schemaVersion: preEffectIntentSchemaVersion,
    repository: required(input.repository, 240, "repository"),
    sourceTaskKey: required(input.sourceTaskKey, 160, "sourceTaskKey"),
    runId: required(input.runId, 160, "runId"),
    logicalTaskIdentity: required(input.logicalTaskIdentity, 200, "logicalTaskIdentity"),
    sessionId: required(input.sessionId, 200, "sessionId"),
    authorityGeneration: positive(input.authorityGeneration, "authorityGeneration"),
    effectType,
    intentId: required(intentId, 120, "intentId"),
    identity,
    effect,
    fingerprint,
    reservationIdentity: optional(input.reservationIdentity, 200),
    status: "prepared",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    diagnostics: [],
  };
  persist(config, value, true);
  return value;
}

export function transitionPreEffectIntent(config, intent, status, { diagnostics = [], now = new Date() } = {}) {
  requiredEnum(status, preEffectIntentStatuses, "status");
  const current = loadPreEffectIntent(config, intent.intentId);
  if (!current || current.fingerprint !== intent.fingerprint) throw new Error("Pre-effect intent identity mismatch");
  const allowed = { prepared: ["executing", "failed_closed"], executing: ["live_confirmed", "adopted_after_recovery", "failed_closed"], live_confirmed: ["finalized", "failed_closed"], adopted_after_recovery: ["finalized", "failed_closed"], finalized: ["finalized"], failed_closed: ["failed_closed"] };
  if (!allowed[current.status]?.includes(status)) throw new Error(`Invalid pre-effect intent transition ${current.status} -> ${status}`);
  const next = { ...current, status, updatedAt: now.toISOString(), diagnostics: sanitizeDiagnostics(diagnostics) };
  persist(config, next, false);
  return next;
}

export function loadPreEffectIntent(config, intentId) {
  const file = intentPath(config, intentId);
  if (!existsSync(file)) return null;
  const value = JSON.parse(readFileSync(file, "utf8"));
  validateStored(value);
  return value;
}

export function reconcilePreEffectIntent(intent, live) {
  validateStored(intent);
  if (["live_confirmed", "adopted_after_recovery", "finalized"].includes(intent.status)) return { classification: "effect_confirmed", intentId: intent.intentId };
  if (!live?.complete) return { classification: "live_read_unavailable", intentId: intent.intentId };
  if (live.ambiguous) return { classification: "effect_ambiguous", intentId: intent.intentId };
  if (live.present === false) return { classification: "effect_absent_safe_to_execute", intentId: intent.intentId };
  const liveFingerprint = digest(canonical({ effectType: intent.effectType, identity: sanitizeEffect(live.identity || {}), effect: sanitizeEffect(live.effect || {}) }));
  return liveFingerprint === intent.fingerprint
    ? { classification: "effect_present_exact_adoptable", intentId: intent.intentId }
    : { classification: "effect_contradictory", intentId: intent.intentId };
}

function persist(config, value, exclusive) {
  const file = intentPath(config, value.intentId);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (exclusive && existsSync(file)) throw new Error("Pre-effect intent already exists");
  const temp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temp, file);
}
function intentPath(config, intentId) { return path.join(config.logsRoot, "recovery", "pre-effect-intents", `${digest(required(intentId, 120, "intentId"))}.json`); }
function validateStored(v) { if (v?.schemaVersion !== 1 || !preEffectTypes.includes(v.effectType) || !preEffectIntentStatuses.includes(v.status) || v.fingerprint !== digest(canonical({ effectType: v.effectType, identity: v.identity, effect: v.effect }))) throw new Error("Invalid pre-effect intent"); }
function boundedIdentity(v) { return sanitizeEffect({ repository: v.repository, branchName: v.branchName, baseSha: v.baseSha, headSha: v.headSha, prNumber: v.prNumber, issueNumber: v.issueNumber, claimIdentity: v.claimIdentity }); }
function sanitizeEffect(v) { const out = {}; for (const key of Object.keys(v).sort().slice(0, 64)) { const x = v[key]; if (typeof x === "string") out[key] = x.slice(0, 500); else if (typeof x === "boolean" || Number.isSafeInteger(x) || x === null) out[key] = x; else if (Array.isArray(x)) out[key] = x.filter((i) => typeof i === "string").slice(0, 200).map((i) => i.slice(0, 300)); } return out; }
function sanitizeDiagnostics(v) { return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 200)) : []; }
function canonical(v) { if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`; if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`; return JSON.stringify(v); }
function digest(v) { return createHash("sha256").update(String(v)).digest("hex"); }
function required(v, max, name) { if (typeof v !== "string" || !v.length || v.length > max || /[\x00-\x1f\x7f]/.test(v)) throw new Error(`Invalid ${name}`); return v; }
function optional(v, max) { return v == null ? null : required(v, max, "optional identity"); }
function positive(v, name) { if (!Number.isSafeInteger(v) || v < 1) throw new Error(`Invalid ${name}`); return v; }
function requiredEnum(v, values, name) { if (!values.includes(v)) throw new Error(`Invalid ${name}`); return v; }
