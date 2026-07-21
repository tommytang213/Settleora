import { createHash } from "node:crypto";

export const ordinaryContinuationPhases = Object.freeze([
  "candidate_reconciliation",
  "local_validation",
  "external_review",
  "codex_review",
  "structured_review",
  "review_convergence",
  "push",
  "pr_create_or_update",
  "github_convergence",
  "merge",
  "post_merge_hygiene",
]);
const externallyMutatingPhases = new Set(["push", "pr_create_or_update", "merge", "post_merge_hygiene"]);

export async function continueOrdinaryCandidate(input, handlers = {}) {
  let state = normalizeState(input);
  const start = ordinaryContinuationPhases.indexOf(state.phase);
  if (start < 0) return blocked(state, "ordinary_continuation_phase_invalid");
  for (let index = start; index < ordinaryContinuationPhases.length; index += 1) {
    const phase = ordinaryContinuationPhases[index];
    const target = phaseTarget(state, phase);
    const adopted = state.effects[phase];
    if (adopted) {
      if (adopted.targetDigest !== target) return blocked(state, `ordinary_continuation_effect_conflict:${phase}`);
      if (externallyMutatingPhases.has(phase)) {
        if (typeof handlers.adoptEffect !== "function") return blocked(state, `ordinary_continuation_live_adoption_missing:${phase}`);
        const live = await handlers.adoptEffect(phase, Object.freeze({ ...state }), adopted);
        if (!live?.ok || live.targetDigest !== target) return blocked(state, live?.reasonCode || `ordinary_continuation_live_adoption_failed:${phase}`);
      }
      state = advance(state, index);
      await handlers.onCheckpoint?.(state, { phase, action: "adopted" });
      continue;
    }
    const handler = handlers[phase];
    if (typeof handler !== "function") return blocked(state, `ordinary_continuation_handler_missing:${phase}`);
    const before = state.identity;
    const result = await handler(Object.freeze({ ...state, effects: { ...state.effects } }));
    if (!result || result.ok === false) {
      return { ok: false, outcome: result?.outcome || "blocked", reasonCode: result?.reasonCode || `ordinary_continuation_${phase}_blocked`, state };
    }
    if (result.wait === true && result.completed !== true) {
      await handlers.onCheckpoint?.(state, { phase, action: "waiting" });
      return { ok: true, outcome: "waiting", reasonCode: result.reasonCode || `${phase}_pending`, state };
    }
    if (result.identity && identityDigest(result.identity) !== identityDigest(before) && result.sourceChanged !== true) {
      return blocked(state, `ordinary_continuation_identity_changed_without_source_fix:${phase}`);
    }
    if (result.sourceChanged === true) {
      state = invalidateForSourceChange(state, result.identity);
      await handlers.onCheckpoint?.(state, { phase, action: "source_changed" });
      return continueOrdinaryCandidate(state, handlers);
    }
    state = {
      ...state,
      effects: { ...state.effects, [phase]: { targetDigest: target, evidence: bounded(result.evidence), completedAt: new Date().toISOString() } },
    };
    state = advance(state, index);
    await handlers.onCheckpoint?.(state, { phase, action: "completed" });
    if (result.wait === true) return { ok: true, outcome: "waiting", reasonCode: result.reasonCode || `${phase}_pending`, state };
  }
  return { ok: true, outcome: "complete", state };
}

export function createOrdinaryContinuationState({ logicalTaskKey, executionKey = null, issueNumber, branchName, identity, phase = "candidate_reconciliation", effects = {}, counters = {} }) {
  if (!logicalTaskKey || !issueNumber || !branchName || !validIdentity(identity)) throw new Error("ordinary continuation identity is incomplete");
  return normalizeState({ version: 1, logicalTaskKey, executionKey, issueNumber, branchName, identity, phase, effects, counters });
}

function normalizeState(value = {}) {
  if (value.version !== 1 || !value.logicalTaskKey || !value.issueNumber || !value.branchName || !validIdentity(value.identity)) {
    return { ...value, phase: "invalid", effects: {}, counters: {} };
  }
  return {
    version: 1,
    logicalTaskKey: String(value.logicalTaskKey),
    executionKey: value.executionKey ? String(value.executionKey) : null,
    issueNumber: Number(value.issueNumber),
    branchName: String(value.branchName),
    identity: { ...value.identity, changedFiles: [...value.identity.changedFiles].sort() },
    phase: String(value.phase || ordinaryContinuationPhases[0]),
    effects: value.effects && typeof value.effects === "object" ? { ...value.effects } : {},
    counters: { acceptedLogicalTasks: Number(value.counters?.acceptedLogicalTasks ?? 1), sourceRounds: Number(value.counters?.sourceRounds ?? 0), githubEpochs: Number(value.counters?.githubEpochs ?? 0) },
  };
}

function invalidateForSourceChange(state, identity) {
  if (!validIdentity(identity)) return { ...state, phase: "invalid" };
  return { ...state, identity: { ...identity, changedFiles: [...identity.changedFiles].sort() }, phase: "local_validation", effects: pick(state.effects, ["candidate_reconciliation"]), counters: { ...state.counters, sourceRounds: state.counters.sourceRounds + 1 } };
}

function advance(state, index) { return { ...state, phase: ordinaryContinuationPhases[index + 1] || "complete" }; }
function phaseTarget(state, phase) { return identityDigest({ phase, logicalTaskKey: state.logicalTaskKey, issueNumber: state.issueNumber, branchName: state.branchName, identity: state.identity }); }
function identityDigest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function validIdentity(value) { return Boolean(value && /^[a-f0-9]{40}$/.test(value.baseSha || "") && /^[a-f0-9]{40}$/.test(value.headSha || "") && /^[a-f0-9]{40}$/.test(value.treeSha || "") && /^[a-f0-9]{64}$/.test(value.diffDigest || "") && Array.isArray(value.changedFiles)); }
function pick(object, keys) { return Object.fromEntries(keys.filter((key) => object?.[key]).map((key) => [key, object[key]])); }
function bounded(value) { if (value == null) return null; const text = JSON.stringify(value); return text.length <= 16_384 ? JSON.parse(text) : { truncated: true, sha256: createHash("sha256").update(text).digest("hex") }; }
function blocked(state, reasonCode) { return { ok: false, outcome: "blocked", reasonCode, state }; }
