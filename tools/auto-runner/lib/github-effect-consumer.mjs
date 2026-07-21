import { createHash, createHmac } from "node:crypto";
import { executeCanonicalEffect, executeCanonicalEffectSync } from "./canonical-effect-executor.mjs";
import { canonicalEffectContext, canonicalExecutionInput, canonicalIntent, findPendingEffect } from "./git-workspace.mjs";

const githubEvidenceDomainKey = Buffer.from(["Settleora", "canonical", "GitHub", "evidence", "v1"].join("\0"));

export function executeCanonicalGithubEffect(config, lifecycle, input, adapters) {
  return execute(false, config, lifecycle, input, adapters);
}

export function executeCanonicalGithubEffectSync(config, lifecycle, input, adapters) {
  return execute(true, config, lifecycle, input, adapters);
}

function execute(sync, config, lifecycle, input, adapters) {
  if (!lifecycle) throw new Error("Canonical GitHub effect lifecycle authority required");
  if (typeof adapters?.readLive !== "function" || typeof adapters?.execute !== "function") throw new Error("Canonical GitHub effect adapters required");
  const context = canonicalEffectContext(config, lifecycle);
  const identity = {
    ...(input.identity || {}),
    ...(Number.isSafeInteger(input.prNumber) ? { prNumber: input.prNumber } : {}),
    ...(Number.isSafeInteger(input.issueNumber) ? { issueNumber: input.issueNumber } : {}),
    ...(input.headSha ? { headSha: input.headSha } : {}),
    ...(input.baseSha ? { baseSha: input.baseSha } : {}),
    ...(input.baseBranch ? { baseBranch: input.baseBranch } : {}),
  };
  const effect = normalizeEffect(input.effect || {});
  const pending = findPendingEffect(config, context, input.effectType, (intent) => intent.fingerprint === fingerprintFor(context, input.effectType, identity, effect));
  const canonicalConfig = { ...config, currentAuthority: context.currentAuthority };
  const intent = canonicalIntent(context, input.effectType, effect, identity);
  const executionInput = {
    ...(pending ? { intentId: pending.intentId } : canonicalExecutionInput(canonicalConfig, intent)),
    expectedIdentity: { ...context.expectedIdentity, ...identity },
  };
  const wrapped = {
    readLive: (stored) => adapters.readLive(stored, effect),
    execute: (stored) => adapters.execute(stored, effect),
  };
  return sync ? executeCanonicalEffectSync(canonicalConfig, executionInput, wrapped) : executeCanonicalEffect(canonicalConfig, executionInput, wrapped);
}

export function canonicalGithubEvidenceDigest(value) {
  return createHmac("sha256", githubEvidenceDomainKey).update(canonical(value)).digest("hex");
}

function normalizeEffect(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)));
}

function fingerprintFor(context, effectType, identity, effect) {
  const fullIdentity = normalizeEffect({
    repository: context.repository,
    sourceTaskKey: context.sourceTaskKey,
    runId: context.runId,
    logicalTaskIdentity: context.logicalTaskIdentity,
    claimIdentity: context.claimIdentity,
    chargeIdentity: context.chargeIdentity,
    sessionId: context.sessionId,
    authorityGeneration: context.authorityGeneration,
    branchName: identity.branchName ?? context.branchName,
    baseBranch: identity.baseBranch,
    baseSha: identity.baseSha,
    headSha: identity.headSha,
    candidateIdentity: identity.candidateIdentity ?? context.candidateIdentity,
    prNumber: identity.prNumber,
    issueNumber: identity.issueNumber,
    reservationIdentity: identity.reservationIdentity ?? context.reservationIdentity,
  });
  return createHash("sha256").update(canonical({ effectType, identity: fullIdentity, effect })).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
