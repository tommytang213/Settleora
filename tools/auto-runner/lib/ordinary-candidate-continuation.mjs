import { createHash } from "node:crypto";
import { evaluateSourceFailureBatch, freezeSourceFailureBatch } from "./source-failure-convergence.mjs";

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
  "post_merge_cleanup",
]);
const externallyMutatingPhases = new Set(["push", "pr_create_or_update", "github_convergence", "merge", "post_merge_hygiene", "post_merge_cleanup"]);

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
    if (Array.isArray(result.sourceFailures) && result.sourceFailures.length > 0) {
      const batch = freezeSourceFailureBatch(result.sourceFailures, state.identity);
      const matchingPrepared = phase === "github_convergence"
        && state.preparedGithubSourceFailureBatch?.batchIdentity === batch.batchIdentity
        && state.preparedGithubSourceFailureBatch?.candidateHead === state.identity.headSha;
      const decision = evaluateSourceFailureBatch(batch, matchingPrepared ? [] : state.sourceFailureHistory || []);
      state = { ...state, sourceFailureBatch: batch, sourceFailureHistory: matchingPrepared ? state.sourceFailureHistory : [...(state.sourceFailureHistory || []), { batchIdentity: batch.batchIdentity, findingSetSignature: batch.findingSetSignature, candidate: batch.candidate }].slice(-100) };
      await handlers.onCheckpoint?.(state, { phase, action: "source_failure_batch_frozen", batch, decision });
      if (!decision.sourceFixEligible) {
        if (decision.classification === "pending" || decision.retryable) return { ok: true, outcome: "waiting", reasonCode: decision.reasonCode, state };
        return { ok: false, outcome: "blocked", reasonCode: decision.reasonCode, state };
      }
      if (phase === "github_convergence") {
        const processed = new Set(state.processedGithubFindingFingerprints || []);
        const fingerprints = batch.findings.map((finding) => finding.fingerprint);
        const novel = fingerprints.filter((fingerprint) => !processed.has(fingerprint));
        if (novel.length === 0 && !matchingPrepared) return blocked(state, "ordinary_continuation_duplicate_github_source_failure_batch");
        if (!matchingPrepared) {
          if (state.preparedGithubSourceFailureBatch) return blocked(state, "ordinary_continuation_conflicting_prepared_github_batch");
          if (state.counters.githubTriggeredFixEpochsPerPr >= 50) return blocked(state, "github_triggered_fix_epoch_limit_exhausted");
          state = {
            ...state,
            counters: { ...state.counters, githubTriggeredFixEpochsPerPr: state.counters.githubTriggeredFixEpochsPerPr + 1, localSourceChangingRoundsPerEpoch: 0 },
            preparedGithubSourceFailureBatch: { batchIdentity: batch.batchIdentity, candidateHead: state.identity.headSha, fingerprints: novel, status: "epoch_reserved" },
          };
          await handlers.onCheckpoint?.(state, { phase, action: "github_source_fix_epoch_reserved", fingerprints: novel });
        }
      }
      if (state.counters.localSourceChangingRoundsPerEpoch >= 50) {
        return blocked(state, "local_source_changing_round_limit_exhausted");
      }
      if (typeof handlers.source_failure_fix !== "function") return blocked(state, "ordinary_continuation_source_failure_fix_handler_missing");
      const intent = matchingPrepared && state.sourceFailureFixIntent
        ? state.sourceFailureFixIntent
        : { batchIdentity: batch.batchIdentity, candidateHead: state.identity.headSha, status: "prepared" };
      state = { ...state, sourceFailureFixIntent: intent };
      await handlers.onCheckpoint?.(state, { phase, action: "source_failure_fix_intent_prepared", batch, decision });
      let fixed = null;
      if (typeof handlers.adopt_source_failure_fix === "function") {
        fixed = await handlers.adopt_source_failure_fix(Object.freeze({ ...state }), { batch, decision, originatingPhase: phase, intent });
      }
      if (!fixed?.ok) fixed = await handlers.source_failure_fix(Object.freeze({ ...state }), { batch, decision, originatingPhase: phase, intent });
      if (!fixed?.ok || fixed.sourceChanged !== true || !validIdentity(fixed.identity)) return blocked(state, fixed?.reasonCode || "ordinary_continuation_source_failure_fix_failed");
      const preparedBeforeChange = state.preparedGithubSourceFailureBatch;
      state = invalidateForSourceChange(state, fixed.identity);
      state = { ...state, sourceFailureCommitEffect: phase === "github_convergence" ? { batchIdentity: batch.batchIdentity, oldHead: batch.candidate.headSha, newHead: fixed.identity.headSha, fingerprints: preparedBeforeChange?.fingerprints || [] } : null };
      await handlers.onCheckpoint?.(state, { phase, action: "source_failure_new_head_persisted", batchIdentity: batch.batchIdentity, newHead: fixed.identity.headSha });
      const consumed = state.sourceFailureCommitEffect?.fingerprints || [];
      state = { ...state, sourceFailureBatch: null, sourceFailureFixIntent: null, lastSourceFailureFix: bounded(fixed.evidence), preparedGithubSourceFailureBatch: null, sourceFailureCommitEffect: null, processedGithubFindingFingerprints: [...new Set([...(state.processedGithubFindingFingerprints || []), ...consumed])].sort() };
      await handlers.onCheckpoint?.(state, { phase, action: "source_failure_fingerprints_consumed", batchIdentity: batch.batchIdentity, fingerprints: consumed });
      return continueOrdinaryCandidate(state, handlers);
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

export function createOrdinaryContinuationState({ logicalTaskKey, executionKey = null, issueNumber, branchName, identity, expectedOriginMainSha = identity?.baseSha, phase = "candidate_reconciliation", effects = {}, counters = {} }) {
  if (!logicalTaskKey || !issueNumber || !branchName || !validIdentity(identity)) throw new Error("ordinary continuation identity is incomplete");
  return normalizeState({ version: 1, logicalTaskKey, executionKey, issueNumber, branchName, identity, expectedOriginMainSha, phase, effects, counters, sourceFailureHistory: [] });
}

export function ordinaryCandidateIdentityMatches(persisted, actual) {
  if (!validIdentity(persisted) || !validIdentity(actual)) return false;
  return persisted.baseSha === actual.baseSha
    && persisted.headSha === actual.headSha
    && persisted.treeSha === actual.treeSha
    && persisted.diffDigest === actual.diffDigest
    && JSON.stringify([...persisted.changedFiles].sort()) === JSON.stringify([...actual.changedFiles].sort())
    && (!persisted.changedFilesDigest || persisted.changedFilesDigest === actual.changedFilesDigest);
}

function normalizeState(value = {}) {
  if (value.version !== 1 || !value.logicalTaskKey || !value.issueNumber || !value.branchName || !validIdentity(value.identity)) {
    return { ...value, phase: "invalid", effects: {}, counters: {} };
  }
  const normalized = {
    version: 1,
    logicalTaskKey: String(value.logicalTaskKey),
    executionKey: value.executionKey ? String(value.executionKey) : null,
    issueNumber: Number(value.issueNumber),
    branchName: String(value.branchName),
    identity: { ...value.identity, changedFiles: [...value.identity.changedFiles].sort() },
    expectedOriginMainSha: String(value.expectedOriginMainSha || value.identity.baseSha),
    phase: String(value.phase || ordinaryContinuationPhases[0]),
    effects: value.effects && typeof value.effects === "object" ? { ...value.effects } : {},
    counters: {
      acceptedLogicalTasks: Number(value.counters?.acceptedLogicalTasks ?? 1),
      localSourceChangingRoundsPerEpoch: Number(value.counters?.localSourceChangingRoundsPerEpoch ?? 0),
      githubTriggeredFixEpochsPerPr: Number(value.counters?.githubTriggeredFixEpochsPerPr ?? value.counters?.githubEpochs ?? 0),
      lifetimeLocalSourceChangingRounds: Number(value.counters?.lifetimeLocalSourceChangingRounds ?? value.counters?.sourceRounds ?? 0),
    },
    sourceFailureBatch: value.sourceFailureBatch || null,
    sourceFailureHistory: Array.isArray(value.sourceFailureHistory) ? value.sourceFailureHistory.slice(-100) : [],
    lastSourceFailureFix: value.lastSourceFailureFix || null,
    sourceFailureFixIntent: value.sourceFailureFixIntent || null,
    processedGithubFindingFingerprints: Array.isArray(value.processedGithubFindingFingerprints) ? [...new Set(value.processedGithubFindingFingerprints)].sort() : [],
    preparedGithubSourceFailureBatch: value.preparedGithubSourceFailureBatch || null,
    sourceFailureCommitEffect: value.sourceFailureCommitEffect || null,
  };
  if (!/^[a-f0-9]{40}$/.test(normalized.expectedOriginMainSha)) return { ...normalized, phase: "invalid" };
  const effect = normalized.sourceFailureCommitEffect;
  if (effect) {
    const prepared = normalized.preparedGithubSourceFailureBatch;
    if (effect.newHead !== normalized.identity.headSha || prepared?.batchIdentity !== effect.batchIdentity || prepared?.candidateHead !== effect.oldHead || JSON.stringify([...(prepared?.fingerprints || [])].sort()) !== JSON.stringify([...(effect.fingerprints || [])].sort())) return { ...normalized, phase: "invalid" };
    return { ...normalized, sourceFailureBatch: null, sourceFailureFixIntent: null, preparedGithubSourceFailureBatch: null, sourceFailureCommitEffect: null, processedGithubFindingFingerprints: [...new Set([...normalized.processedGithubFindingFingerprints, ...effect.fingerprints])].sort() };
  }
  if (normalized.preparedGithubSourceFailureBatch && normalized.preparedGithubSourceFailureBatch.candidateHead !== normalized.identity.headSha) return { ...normalized, phase: "invalid" };
  return normalized;
}

function invalidateForSourceChange(state, identity) {
  if (!validIdentity(identity)) return { ...state, phase: "invalid" };
  return {
    ...state,
    identity: { ...identity, changedFiles: [...identity.changedFiles].sort() },
    phase: "local_validation",
    effects: pick(state.effects, ["candidate_reconciliation"]),
    counters: {
      ...state.counters,
      localSourceChangingRoundsPerEpoch: state.counters.localSourceChangingRoundsPerEpoch + 1,
      lifetimeLocalSourceChangingRounds: state.counters.lifetimeLocalSourceChangingRounds + 1,
    },
  };
}

function advance(state, index) { return { ...state, phase: ordinaryContinuationPhases[index + 1] || "complete" }; }
function phaseTarget(state, phase) { return identityDigest({ phase, logicalTaskKey: state.logicalTaskKey, issueNumber: state.issueNumber, branchName: state.branchName, identity: state.identity, expectedOriginMainSha: state.expectedOriginMainSha }); }
function identityDigest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function validIdentity(value) { return Boolean(value && /^[a-f0-9]{40}$/.test(value.baseSha || "") && /^[a-f0-9]{40}$/.test(value.headSha || "") && /^[a-f0-9]{40}$/.test(value.treeSha || "") && /^[a-f0-9]{64}$/.test(value.diffDigest || "") && Array.isArray(value.changedFiles)); }
function pick(object, keys) { return Object.fromEntries(keys.filter((key) => object?.[key]).map((key) => [key, object[key]])); }
function bounded(value) { if (value == null) return null; const text = JSON.stringify(value); return text.length <= 16_384 ? JSON.parse(text) : { truncated: true, sha256: createHash("sha256").update(text).digest("hex") }; }
function blocked(state, reasonCode) { return { ok: false, outcome: "blocked", reasonCode, state }; }
