import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const preEffectIntentSchemaVersion = 1;
export const preEffectIntentStatuses = Object.freeze(["prepared", "executing", "live_confirmed", "adopted_after_recovery", "finalized", "failed_closed"]);
export const preEffectTypes = Object.freeze(["commit", "push", "pr_create", "pr_head_update", "pr_update", "pr_retarget", "pr_ready", "pr_draft", "merge", "comment", "review_reply", "issue_closure", "issue_progress_comment", "umbrella_update", "ledger_docs_update", "docs_branch_create", "docs_pr_create_update", "review_request", "review_trigger", "docs_pr_ready", "docs_pr_merge", "hygiene_component", "branch_retention_verify"]);
const maxIntentBytes = 256 * 1024;
const statusOrder = new Map(preEffectIntentStatuses.map((status, index) => [status, index]));

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
    claimIdentity: required(input.claimIdentity || input.logicalTaskIdentity, 200, "claimIdentity"),
    chargeIdentity: required(input.chargeIdentity || input.logicalTaskIdentity, 200, "chargeIdentity"),
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
  assertPreEffectIntentAuthority(current, config.currentAuthority);
  const allowed = { prepared: ["executing", "failed_closed"], executing: ["live_confirmed", "adopted_after_recovery", "failed_closed"], live_confirmed: ["finalized", "failed_closed"], adopted_after_recovery: ["finalized", "failed_closed"], finalized: ["finalized"], failed_closed: ["failed_closed"] };
  if (!allowed[current.status]?.includes(status)) throw new Error(`Invalid pre-effect intent transition ${current.status} -> ${status}`);
  const next = { ...current, status, updatedAt: now.toISOString(), diagnostics: sanitizeDiagnostics(diagnostics) };
  persist(config, next, false);
  return next;
}

export function loadPreEffectIntent(config, intentId) {
  const file = intentPath(config, intentId);
  if (!existsSync(file)) return null;
  validateTrustedArtifact(file, intentRoot(config), `${digest(required(intentId, 120, "intentId"))}.json`);
  const value = parseBounded(file);
  validateStored(value);
  if (value.intentId !== intentId) throw new Error("Pre-effect intent filename identity mismatch");
  rejectDuplicateOrConflictingFiles(config, value, file);
  return value;
}

export function findPreEffectIntents(config, predicate = () => true) {
  const root = intentRoot(config);
  if (!existsSync(root)) return [];
  ensureTrustedRoot(root);
  const values = [];
  for (const name of readdirSync(root).sort()) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(root, name);
    validateTrustedArtifact(file, root, name);
    const value = parseBounded(file);
    validateStored(value);
    if (`${digest(value.intentId)}.json` !== name) throw new Error("Pre-effect intent filename identity mismatch");
    if (predicate(value)) values.push(value);
  }
  if (new Set(values.map((value) => value.fingerprint)).size !== values.length) throw new Error("Duplicate or conflicting pre-effect intent artifact");
  return values;
}

export function handoffPreEffectIntentAuthority(config, intentId, handoff, { now = new Date() } = {}) {
  const current = loadPreEffectIntent(config, intentId);
  if (!current || ["finalized", "failed_closed"].includes(current.status)) return current;
  if (handoff?.runId !== current.runId || handoff?.oldSessionId !== current.sessionId || handoff?.oldAuthorityGeneration !== current.authorityGeneration) throw new Error("Pre-effect intent handoff source mismatch");
  if (handoff?.status !== "active" || typeof handoff.newSessionId !== "string" || !handoff.newSessionId.length || !Number.isSafeInteger(handoff.newAuthorityGeneration) || handoff.newAuthorityGeneration <= current.authorityGeneration) throw new Error("Pre-effect intent handoff successor invalid");
  const identity = { ...current.identity, sessionId: handoff.newSessionId, authorityGeneration: handoff.newAuthorityGeneration };
  const next = {
    ...current,
    status: handoff.resetForAuthoritativeAbsence === true && current.status === "executing" ? "prepared" : current.status,
    sessionId: handoff.newSessionId,
    authorityGeneration: handoff.newAuthorityGeneration,
    identity,
    fingerprint: digest(canonical({ effectType: current.effectType, identity, effect: current.effect })),
    recoveryProvenance: { sessionId: current.sessionId, authorityGeneration: current.authorityGeneration, fingerprint: current.fingerprint },
    updatedAt: now.toISOString(),
    diagnostics: [handoff.resetForAuthoritativeAbsence === true ? "authoritative_absence_successor_reissue" : "validated_successor_authority_handoff"],
  };
  persist(config, next, false);
  return next;
}

export function assertPreEffectIntentAuthority(intent, authority) {
  if (!authority) throw new Error("Pre-effect intent mutation authority required");
  if (authority.retired === true || authority.status !== "active") throw new Error("Only an active session can mutate pre-effect intent");
  if (authority.sessionId !== intent.sessionId || authority.authorityGeneration !== intent.authorityGeneration || authority.runId !== intent.runId) throw new Error("Pre-effect intent mutation authority mismatch");
  return true;
}

export function reconcilePreEffectIntent(intent, live) {
  validateStored(intent);
  if (["live_confirmed", "adopted_after_recovery", "finalized"].includes(intent.status)) return { classification: "effect_confirmed", intentId: intent.intentId };
  if (!live?.complete) return { classification: "live_read_unavailable", intentId: intent.intentId };
  if (live.ambiguous) return { classification: "effect_ambiguous", intentId: intent.intentId };
  if (live.present === false) return {
    classification: intent.status === "prepared" ? "effect_absent_safe_to_execute" : "effect_absent_execution_uncertain",
    intentId: intent.intentId,
  };
  const liveFingerprint = digest(canonical({ effectType: intent.effectType, identity: sanitizeEffect(live.identity || {}), effect: sanitizeEffect(live.effect || {}) }));
  return liveFingerprint === intent.fingerprint
    ? { classification: "effect_present_exact_adoptable", intentId: intent.intentId }
    : { classification: "effect_contradictory", intentId: intent.intentId };
}

function persist(config, value, exclusive) {
  const file = intentPath(config, value.intentId);
  const root = intentRoot(config);
  ensureTrustedRoot(root);
  if (exclusive && existsSync(file)) throw new Error("Pre-effect intent already exists");
  const temp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fsyncFile(temp);
  renameSync(temp, file);
  fsyncDirectory(root);
  validateTrustedArtifact(file, root, path.basename(file));
}
function intentRoot(config) { const logsRoot = path.resolve(required(config?.logsRoot, 4096, "logsRoot")); if (logsRoot === path.parse(logsRoot).root) throw new Error("Unsafe pre-effect intent logs root"); return path.join(logsRoot, "recovery", "pre-effect-intents"); }
function intentPath(config, intentId) { return path.join(intentRoot(config), `${digest(required(intentId, 120, "intentId"))}.json`); }
function validateStored(v) {
  if (v?.schemaVersion !== 1 || !preEffectTypes.includes(v.effectType) || !preEffectIntentStatuses.includes(v.status) || !statusOrder.has(v.status)) throw new Error("Invalid pre-effect intent");
  for (const [key, max] of [["repository",240],["sourceTaskKey",160],["runId",160],["logicalTaskIdentity",200],["claimIdentity",200],["chargeIdentity",200],["sessionId",200],["intentId",120]]) required(v[key], max, key);
  positive(v.authorityGeneration, "authorityGeneration");
  if (!v.identity || typeof v.identity !== "object" || Array.isArray(v.identity) || !v.effect || typeof v.effect !== "object" || Array.isArray(v.effect)) throw new Error("Invalid pre-effect intent payload");
  if (v.identity.repository !== v.repository || (v.identity.claimIdentity && v.identity.claimIdentity !== v.claimIdentity)) throw new Error("Invalid pre-effect intent bound identity");
  if (v.fingerprint !== digest(canonical({ effectType: v.effectType, identity: v.identity, effect: v.effect }))) throw new Error("Invalid pre-effect intent fingerprint");
  if (v.recoveryProvenance && (typeof v.recoveryProvenance.sessionId !== "string" || !Number.isSafeInteger(v.recoveryProvenance.authorityGeneration) || !/^[a-f0-9]{64}$/.test(v.recoveryProvenance.fingerprint || ""))) throw new Error("Invalid pre-effect intent recovery provenance");
}
function boundedIdentity(v) { return sanitizeEffect({ repository: v.repository, sourceTaskKey: v.sourceTaskKey, runId: v.runId, logicalTaskIdentity: v.logicalTaskIdentity, claimIdentity: v.claimIdentity || v.logicalTaskIdentity, chargeIdentity: v.chargeIdentity || v.logicalTaskIdentity, sessionId: v.sessionId, authorityGeneration: v.authorityGeneration, branchName: v.branchName, baseBranch: v.baseBranch, baseSha: v.baseSha, headSha: v.headSha, candidateIdentity: v.candidateIdentity, prNumber: v.prNumber, issueNumber: v.issueNumber, reservationIdentity: v.reservationIdentity }); }
function sanitizeEffect(v) { const out = {}; for (const key of Object.keys(v).sort().slice(0, 64)) { const x = v[key]; if (typeof x === "string") out[key] = x.slice(0, 500); else if (typeof x === "boolean" || Number.isSafeInteger(x) || x === null) out[key] = x; else if (Array.isArray(x)) out[key] = x.filter((i) => typeof i === "string").slice(0, 200).map((i) => i.slice(0, 300)); } return out; }
function sanitizeDiagnostics(v) { return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 200)) : []; }
function canonical(v) { if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`; if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`; return JSON.stringify(v); }
function digest(v) { return createHash("sha256").update(String(v)).digest("hex"); }
function required(v, max, name) { if (typeof v !== "string" || !v.length || v.length > max || /[\x00-\x1f\x7f]/.test(v)) throw new Error(`Invalid ${name}`); return v; }
function optional(v, max) { return v == null ? null : required(v, max, "optional identity"); }
function positive(v, name) { if (!Number.isSafeInteger(v) || v < 1) throw new Error(`Invalid ${name}`); return v; }
function requiredEnum(v, values, name) { if (!values.includes(v)) throw new Error(`Invalid ${name}`); return v; }
function ensureTrustedRoot(root) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid())) throw new Error("Untrusted pre-effect intent root");
}
function validateTrustedArtifact(file, root, expectedName) {
  if (path.dirname(path.resolve(file)) !== path.resolve(root) || path.basename(file) !== expectedName) throw new Error("Unsafe pre-effect intent path");
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size > maxIntentBytes || (typeof process.getuid === "function" && info.uid !== process.getuid())) throw new Error("Untrusted pre-effect intent artifact");
}
function parseBounded(file) { const info = statSync(file); if (info.size > maxIntentBytes) throw new Error("Oversized pre-effect intent"); const raw = readFileSync(file, "utf8"); if (Buffer.byteLength(raw) > maxIntentBytes) throw new Error("Oversized pre-effect intent"); return JSON.parse(raw); }
function rejectDuplicateOrConflictingFiles(config, value, selected) {
  const root = intentRoot(config);
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".json") || path.join(root, name) === selected) continue;
    const otherPath = path.join(root, name);
    validateTrustedArtifact(otherPath, root, name);
    const other = parseBounded(otherPath);
    if (other?.intentId === value.intentId || other?.fingerprint === value.fingerprint) throw new Error("Duplicate or conflicting pre-effect intent artifact");
  }
}
function fsyncFile(file) { const fd = openSync(file, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }
function fsyncDirectory(dir) { const fd = openSync(dir, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }
