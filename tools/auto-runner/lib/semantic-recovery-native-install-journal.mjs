import { createHash } from "node:crypto";

export const nativeInstallJournalContract = "settleora_semantic_recovery_native_install_journal";
export const nativeInstallJournalVersion = 1;
export const nativeInstallJournalStates = Object.freeze([
  "prepared",
  "awaiting_interactive_sudo",
  "sudo_started",
  "root_authority_rederived",
  "root_plan_verified",
  "publication_intent_durable",
  "publication_started",
  "publication_ambiguous",
  "installed_verified",
  "adopted_verified",
  "blocked",
  "completed",
]);

const transitions = Object.freeze({
  prepared: ["awaiting_interactive_sudo", "blocked"],
  awaiting_interactive_sudo: ["sudo_started", "blocked"],
  sudo_started: ["root_authority_rederived", "blocked"],
  root_authority_rederived: ["root_plan_verified", "blocked"],
  root_plan_verified: ["publication_intent_durable", "adopted_verified", "blocked"],
  publication_intent_durable: ["publication_started", "blocked"],
  publication_started: ["publication_ambiguous", "installed_verified", "blocked"],
  publication_ambiguous: ["installed_verified", "blocked"],
  installed_verified: ["completed", "blocked"],
  adopted_verified: ["completed", "blocked"],
  blocked: [],
  completed: [],
});

const digestPattern = /^[a-f0-9]{64}$/u;
const shaPattern = /^[a-f0-9]{40}$/u;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const correlationPattern = /^[a-z0-9][a-z0-9._:-]{7,127}$/u;
const reasonPattern = /^[a-z0-9][a-z0-9_]{2,127}$/u;

export function createNativeInstallJournal({ correlation, repository, sourceCommit, operationId, requestDigest = null, observedAt } = {}) {
  if (!correlationPattern.test(String(correlation || "")) || !repositoryPattern.test(String(repository || ""))
      || !shaPattern.test(String(sourceCommit || "")) || !digestPattern.test(String(operationId || ""))
      || (requestDigest !== null && !digestPattern.test(String(requestDigest))) || !validTimestamp(observedAt)) {
    throw new Error("native install journal identity invalid");
  }
  const journal = {
    contract: nativeInstallJournalContract,
    version: nativeInstallJournalVersion,
    correlation,
    repository,
    sourceCommit,
    requestDigest,
    operationId,
    state: "prepared",
    previousState: null,
    sequence: 0,
    sudoAttemptCount: 0,
    publicationAttemptCount: 0,
    observedAt,
    updatedAt: observedAt,
    result: null,
  };
  return deepFreeze({ ...journal, journalDigest: journalDigest(journal) });
}

export function transitionNativeInstallJournal({ current, expectedState, nextState, observedAt, result = null, persist } = {}) {
  validateNativeInstallJournal(current);
  if (current.state !== expectedState || !transitions[expectedState]?.includes(nextState)
      || !validTimestamp(observedAt) || Date.parse(observedAt) < Date.parse(current.updatedAt)
      || typeof persist !== "function") {
    throw new Error("native install journal transition invalid");
  }
  const normalizedResult = normalizeResult(nextState, result);
  const core = {
    contract: nativeInstallJournalContract,
    version: nativeInstallJournalVersion,
    correlation: current.correlation,
    repository: current.repository,
    sourceCommit: current.sourceCommit,
    requestDigest: normalizedResult?.requestDigest ?? current.requestDigest,
    operationId: current.operationId,
    state: nextState,
    previousState: current.state,
    sequence: current.sequence + 1,
    sudoAttemptCount: current.sudoAttemptCount + (nextState === "sudo_started" ? 1 : 0),
    publicationAttemptCount: current.publicationAttemptCount + (nextState === "publication_started" ? 1 : 0),
    observedAt: current.observedAt,
    updatedAt: observedAt,
    result: normalizedResult === null ? current.result : normalizedResult,
  };
  if (core.sudoAttemptCount > 1 || core.publicationAttemptCount > 1) {
    throw new Error("native install journal duplicate effect refused");
  }
  const next = deepFreeze({ ...core, journalDigest: journalDigest(core) });
  persist({ previous: current, next });
  return next;
}

export function validateNativeInstallJournal(value) {
  assertExactKeys(value, [
    "contract", "correlation", "journalDigest", "observedAt", "operationId", "previousState", "publicationAttemptCount",
    "repository", "requestDigest", "result", "sequence", "sourceCommit", "state", "sudoAttemptCount", "updatedAt", "version",
  ]);
  const { journalDigest: digest, ...core } = value;
  if (value.contract !== nativeInstallJournalContract || value.version !== nativeInstallJournalVersion
      || !correlationPattern.test(String(value.correlation || "")) || !repositoryPattern.test(String(value.repository || ""))
      || !shaPattern.test(String(value.sourceCommit || "")) || !digestPattern.test(String(value.operationId || ""))
      || (value.requestDigest !== null && !digestPattern.test(String(value.requestDigest)))
      || !nativeInstallJournalStates.includes(value.state)
      || (value.previousState !== null && !nativeInstallJournalStates.includes(value.previousState))
      || !Number.isSafeInteger(value.sequence) || value.sequence < 0
      || ![0, 1].includes(value.sudoAttemptCount) || ![0, 1].includes(value.publicationAttemptCount)
      || !validTimestamp(value.observedAt) || !validTimestamp(value.updatedAt)
      || Date.parse(value.updatedAt) < Date.parse(value.observedAt)
      || digest !== journalDigest(core)) {
    throw new Error("native install journal invalid");
  }
  if (value.sequence === 0) {
    if (value.state !== "prepared" || value.previousState !== null || value.result !== null) {
      throw new Error("native install initial journal invalid");
    }
  } else if (value.previousState === null || !transitions[value.previousState]?.includes(value.state)) {
    throw new Error("native install journal history invalid");
  }
  if (value.result !== null) normalizeResult(value.state, value.result);
  return value;
}

export function correlateNativeInstallJournals({ ownerJournal, rootJournal } = {}) {
  validateNativeInstallJournal(ownerJournal);
  validateNativeInstallJournal(rootJournal);
  const fields = ["correlation", "repository", "sourceCommit", "operationId"];
  if (fields.some((field) => ownerJournal[field] !== rootJournal[field])
      || (ownerJournal.requestDigest !== null && rootJournal.requestDigest !== null && ownerJournal.requestDigest !== rootJournal.requestDigest)) {
    throw new Error("native install journals do not correlate");
  }
  return { ok: true, reasonCode: "native_install_journals_correlated" };
}

export function resumeNativeInstallProtocol({ ownerJournal, rootJournal = null, installedReadback = null, processEvidence = null } = {}) {
  validateNativeInstallJournal(ownerJournal);
  if (rootJournal !== null) correlateNativeInstallJournals({ ownerJournal, rootJournal });
  const authoritative = rootJournal || ownerJournal;
  const installed = installedReadback?.ok === true && installedReadback.planDigest === authoritative.result?.planDigest;
  if (installed) {
    return { action: "adopt_verified_result", mutationAllowed: false, sudoAllowed: false, reasonCode: "native_install_exact_readback_outranks_journal" };
  }
  if (["publication_started", "publication_ambiguous"].includes(authoritative.state)) {
    return { action: "readback_only", mutationAllowed: false, sudoAllowed: false, reasonCode: "native_install_publication_ambiguous" };
  }
  if (["installed_verified", "adopted_verified", "completed"].includes(authoritative.state)) {
    return { action: "readback_only", mutationAllowed: false, sudoAllowed: false, reasonCode: "native_install_result_requires_readback" };
  }
  if (authoritative.state === "sudo_started") {
    const live = processEvidence?.correlation === authoritative.correlation && processEvidence?.active === true;
    return {
      action: live ? "wait_for_root_result" : "block_process_result_unknown",
      mutationAllowed: false,
      sudoAllowed: false,
      reasonCode: live ? "native_install_root_process_active" : "native_install_root_process_ambiguous",
    };
  }
  if (authoritative.state === "awaiting_interactive_sudo" && authoritative.sudoAttemptCount === 0) {
    return { action: "interactive_sudo_once", mutationAllowed: false, sudoAllowed: true, reasonCode: "native_install_sudo_not_started" };
  }
  return { action: "block", mutationAllowed: false, sudoAllowed: false, reasonCode: "native_install_restart_blocked" };
}

export const nativeInstallSudoArgv = Object.freeze([
  "/usr/bin/sudo", "--", "/usr/bin/env", "-i",
  "HOME=/root", "LANG=C", "LC_ALL=C", "PATH=/usr/bin:/bin", "TZ=UTC",
  "/usr/bin/bash", "-s", "--",
]);

export function buildNativeInstallSudoArgv({ sourceCommit, bootstrapBlob, correlation } = {}) {
  if (!shaPattern.test(String(sourceCommit || "")) || !shaPattern.test(String(bootstrapBlob || ""))
      || !correlationPattern.test(String(correlation || ""))) throw new Error("native install sudo identity invalid");
  return Object.freeze([...nativeInstallSudoArgv, sourceCommit, bootstrapBlob, correlation]);
}

export function validateInteractiveSudoBoundary({ argv, env, tty, stdinKind, stdoutKind, stderrKind } = {}) {
  const expected = Array.isArray(argv) && argv.length === nativeInstallSudoArgv.length + 3
    ? buildNativeInstallSudoArgv({ sourceCommit: argv.at(-3), bootstrapBlob: argv.at(-2), correlation: argv.at(-1) })
    : null;
  if (canonicalJson(argv) !== canonicalJson(expected) || canonicalJson(env) !== "{}" || tty !== true
      || stdinKind !== "bootstrap_bytes_not_credentials" || stdoutKind !== "bounded_capture" || stderrKind !== "bounded_capture") {
    throw new Error("native install interactive sudo boundary invalid");
  }
  return { ok: true, reasonCode: "native_install_interactive_sudo_boundary_verified" };
}

export function sanitizeNativeInstallProcessResult({ status, signal, stdout, stderr, timedOut, processLost } = {}) {
  const stdoutBytes = boundedBytes(stdout);
  const stderrBytes = boundedBytes(stderr);
  if (!(status === null || (Number.isSafeInteger(status) && status >= 0 && status <= 255))
      || !(signal === null || /^[A-Z0-9]{1,16}$/u.test(String(signal)))
      || typeof timedOut !== "boolean" || typeof processLost !== "boolean") {
    throw new Error("native install process result invalid");
  }
  return deepFreeze({
    status,
    signal,
    timedOut,
    processLost,
    stdoutByteCount: stdoutBytes.length,
    stdoutSha256: sha256(stdoutBytes),
    stderrByteCount: stderrBytes.length,
    stderrSha256: sha256(stderrBytes),
  });
}

function normalizeResult(state, value) {
  if (value === null) return null;
  assertExactKeys(value, ["installedDigest", "outcome", "planDigest", "process", "reasonCode", "requestDigest", "sourceManifestDigest"]);
  if (!/^(none|verified|adopted|ambiguous|blocked|completed)$/u.test(String(value.outcome || ""))
      || !reasonPattern.test(String(value.reasonCode || ""))
      || ["installedDigest", "planDigest", "requestDigest", "sourceManifestDigest"]
        .some((field) => value[field] !== null && !digestPattern.test(String(value[field])))) {
    throw new Error("native install journal result invalid");
  }
  if (value.process !== null) {
    assertExactKeys(value.process, ["processLost", "signal", "status", "stderrByteCount", "stderrSha256", "stdoutByteCount", "stdoutSha256", "timedOut"]);
    if (!digestPattern.test(value.process.stdoutSha256) || !digestPattern.test(value.process.stderrSha256)
        || !Number.isSafeInteger(value.process.stdoutByteCount) || !Number.isSafeInteger(value.process.stderrByteCount)) {
      throw new Error("native install journal process summary invalid");
    }
  }
  if (["installed_verified", "adopted_verified", "completed"].includes(state) && !digestPattern.test(String(value.planDigest || ""))) {
    throw new Error("native install terminal result unbound");
  }
  return structuredClone(value);
}

function boundedBytes(value) {
  const bytes = Buffer.from(value ?? "");
  if (bytes.length > 1024 * 1024) throw new Error("native install process capture too large");
  return bytes;
}
function journalDigest(value) { return sha256(canonicalJson(value)); }
function validTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function assertExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error("native install journal closed schema invalid");
  }
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
