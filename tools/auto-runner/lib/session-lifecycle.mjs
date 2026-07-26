import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";

export const sessionLifecycleStateVersion = 1;
export const interruptionClasses = Object.freeze([
  "remote_compaction_failure",
  "provider_stream_disconnect",
  "main_process_exit_without_terminal_report",
  "wrapper_supervisor_interruption",
  "host_restart_process_loss",
  "partial_report_or_checkpoint_write",
  "ambiguous_or_contradictory_state",
]);

export const defaultContextBudgetPolicy = Object.freeze({
  warningPercent: 60,
  mandatoryPercent: 75,
  emergencyPercent: 90,
  fallbackContextWindowTokens: 128000,
  fallbackTokensPerByte: 0.25,
  maxModelVisibleBytes: 12 * 1024 * 1024,
  maxRawPayloadBytes: 256 * 1024,
  cooldownTurns: 2,
});

const terminalPhases = new Set(["completed", "stopped"]);
const longPhases = new Set(["aggregate_validation", "external_review", "codex_mechanics_security_review", "ci_wait", "exact_head_final_refresh"]);

export function normalizeContextBudgetPolicy(input = {}) {
  const policy = { ...defaultContextBudgetPolicy, ...(input || {}) };
  for (const key of ["warningPercent", "mandatoryPercent", "emergencyPercent"]) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 1 || policy[key] > 99) throw new Error(`session_lifecycle_${key}_invalid`);
  }
  if (!(policy.warningPercent < policy.mandatoryPercent && policy.mandatoryPercent < policy.emergencyPercent)) {
    throw new Error("session_lifecycle_threshold_order_invalid");
  }
  for (const key of ["fallbackContextWindowTokens", "maxModelVisibleBytes", "maxRawPayloadBytes"]) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 1024) throw new Error(`session_lifecycle_${key}_invalid`);
  }
  if (typeof policy.fallbackTokensPerByte !== "number" || !Number.isFinite(policy.fallbackTokensPerByte) || policy.fallbackTokensPerByte <= 0 || policy.fallbackTokensPerByte > 4) {
    throw new Error("session_lifecycle_fallbackTokensPerByte_invalid");
  }
  if (!Number.isSafeInteger(policy.cooldownTurns) || policy.cooldownTurns < 1 || policy.cooldownTurns > 100) throw new Error("session_lifecycle_cooldownTurns_invalid");
  return Object.freeze(policy);
}

export function boundedContextSnapshot(telemetry = {}, policyInput = {}) {
  const policy = normalizeContextBudgetPolicy(policyInput);
  const contextWindowTokens = positiveInteger(telemetry.contextWindowTokens) || policy.fallbackContextWindowTokens;
  const reportedTokens = nonnegativeInteger(telemetry.totalTokens);
  const modelVisibleBytes = nonnegativeInteger(telemetry.modelVisibleBytes) || 0;
  const historyItemBytes = nonnegativeInteger(telemetry.historyItemBytes) || 0;
  const responseBytes = nonnegativeInteger(telemetry.bytesSinceResponse) || 0;
  const estimatedTokens = Math.ceil(Math.max(modelVisibleBytes, historyItemBytes + responseBytes) * policy.fallbackTokensPerByte);
  const usedTokens = Math.max(reportedTokens ?? 0, estimatedTokens);
  const pressurePercent = Math.min(100, Math.ceil((usedTokens / contextWindowTokens) * 100));
  return sanitizePersistedEvidence({
    model: bounded(telemetry.model, 80),
    contextWindowTokens,
    usedTokens,
    pressurePercent,
    modelVisibleBytes: Math.min(modelVisibleBytes, policy.maxModelVisibleBytes),
    historyItemBytes: Math.min(historyItemBytes, policy.maxRawPayloadBytes),
    bytesSinceResponse: Math.min(responseBytes, policy.maxRawPayloadBytes),
    elapsedMs: nonnegativeInteger(telemetry.elapsedMs) || 0,
    turn: nonnegativeInteger(telemetry.turn) || 0,
    compactionStatus: allowedValue(telemetry.compactionStatus, ["none", "warning", "failed"], "none"),
    providerStatus: allowedValue(telemetry.providerStatus, ["ok", "disconnected", "unknown"], "unknown"),
    fallbackUsed: reportedTokens === null || !positiveInteger(telemetry.contextWindowTokens),
    observedAt: validTimestamp(telemetry.observedAt) || new Date().toISOString(),
  });
}

export function evaluateContextBudget({ telemetry = {}, policy: policyInput = {}, phase = null, checkpointComplete = false, mutationJournaled = true, turnsSinceRotation = Number.MAX_SAFE_INTEGER } = {}) {
  let policy;
  try { policy = normalizeContextBudgetPolicy(policyInput); } catch (error) { return fail(error.message, "stop_fail_closed"); }
  const snapshot = boundedContextSnapshot(telemetry, policy);
  if (!mutationJournaled) return fail("session_lifecycle_unjournaled_mutation", "finish_or_rollback_journaled_mutation", { snapshot });
  const emergency = snapshot.pressurePercent >= policy.emergencyPercent || snapshot.compactionStatus === "failed";
  const mandatory = emergency || snapshot.pressurePercent >= policy.mandatoryPercent || (snapshot.compactionStatus === "warning" && longPhases.has(phase));
  const warning = mandatory || snapshot.pressurePercent >= policy.warningPercent || (snapshot.fallbackUsed && longPhases.has(phase));
  if (!warning) return { ok: true, action: "continue", reasonCode: "context_budget_safe", snapshot };
  if (!checkpointComplete) return { ok: true, action: "persist_checkpoint", reasonCode: emergency ? "emergency_checkpoint_required" : "context_warning_checkpoint_required", snapshot };
  if (turnsSinceRotation < policy.cooldownTurns && !emergency) return { ok: true, action: "continue", reasonCode: "rotation_cooldown_active", snapshot };
  if (mandatory) return { ok: true, action: "rotate_before_next_operation", reasonCode: emergency ? "emergency_rotation_required" : "mandatory_rotation_required", snapshot };
  return { ok: true, action: "checkpoint_ready", reasonCode: "context_warning_checkpoint_ready", snapshot };
}

export function createSessionLifecycleState(input = {}) {
  const now = validTimestamp(input.startedAt) || new Date().toISOString();
  const state = {
    stateVersion: sessionLifecycleStateVersion,
    repository: bounded(input.repository, 240),
    logicalTask: {
      issueNumber: input.issueNumber ?? null,
      taskKey: bounded(input.taskKey, 100),
      runId: bounded(input.runId, 160),
      supervisorRunId: bounded(input.supervisorRunId, 160),
      claimIdentity: bounded(input.claimIdentity, 200),
      chargeMarkerRef: bounded(input.chargeMarkerRef, 500),
    },
    branch: { name: bounded(input.branchName, 240), baseSha: sha(input.baseSha), headSha: sha(input.headSha), prNumber: input.prNumber ?? null, candidateDigest: digestOrNull(input.candidateDigest) },
    sessions: { current: bounded(input.sessionId, 160), retired: [], generation: 1 },
    mutationAuthority: { ownerSessionId: bounded(input.sessionId, 160), generation: 1, status: "active", handoff: null },
    controller: {
      phase: bounded(input.phase, 120), nextExactAction: bounded(input.nextExactAction, 500),
      localSourceChangingRoundsPerEpoch: nonnegativeInteger(input.localSourceChangingRoundsPerEpoch) || 0,
      githubTriggeredFixEpochsPerPr: nonnegativeInteger(input.githubTriggeredFixEpochsPerPr) || 0,
      lifetimeLocalSourceChangingRounds: nonnegativeInteger(input.lifetimeLocalSourceChangingRounds) || 0,
    },
    context: { policy: normalizeContextBudgetPolicy(input.contextPolicy), snapshot: null, reason: null, lastRotationTurn: null, rotations: 0 },
    checkpoint: { status: "ready", digest: null, parentDigest: null, writtenAt: now },
    reservations: sanitizePersistedEvidence(input.reservations || {}),
    findings: sanitizePersistedEvidence(input.findings || {}),
    evidence: sanitizePersistedEvidence(input.evidence || {}),
    pendingChecks: sanitizePersistedEvidence(input.pendingChecks || []),
    report: { path: bounded(input.reportPath, 500), correlationKey: bounded(input.reportCorrelationKey || input.taskKey, 100), status: bounded(input.reportStatus || "in_progress", 40) },
    interruption: null,
    recovery: { operationId: null, status: null, attempts: 0 },
    timestamps: { createdAt: now, updatedAt: now },
  };
  state.checkpoint.digest = checkpointDigest(state);
  const validation = validateSessionLifecycleState(state);
  if (!validation.ok) throw new Error(validation.reasonCode);
  return state;
}

export function migrateRecoveryStateToSessionLifecycle(recoveryState, input = {}) {
  if (!recoveryState || recoveryState.stateVersion !== 1) return fail("session_lifecycle_migration_version_unsupported");
  if (recoveryState.issue?.number !== input.issueNumber || recoveryState.taskKey !== input.taskKey || recoveryState.run?.runId !== input.runId) return fail("session_lifecycle_migration_identity_mismatch");
  if (recoveryState.branch?.name !== input.branchName || recoveryState.branch?.baseSha !== input.baseSha || recoveryState.branch?.currentHeadSha !== input.headSha) return fail("session_lifecycle_migration_branch_mismatch");
  try {
    return { ok: true, migrated: true, state: createSessionLifecycleState({
      ...input,
      phase: recoveryState.phase,
      nextExactAction: recoveryState.nextSafeAction || recoveryState.firstIncompleteAction,
      reservations: Object.fromEntries(Object.entries(recoveryState.mutationMarkers || {}).map(([key, value]) => [key, { ...(value || {}), status: "confirmed" }])),
      evidence: recoveryState.evidence || {},
      reportPath: recoveryState.expectedReportPaths?.repoReportPath || input.reportPath,
    }) };
  } catch (error) {
    return fail(error.message || "session_lifecycle_migration_failed");
  }
}

export function validateSessionLifecycleState(state, expected = {}) {
  if (!state || state.stateVersion !== sessionLifecycleStateVersion) return fail("session_lifecycle_version_unsupported");
  if (!state.repository || !Number.isSafeInteger(state.logicalTask?.issueNumber) || !state.logicalTask.taskKey || !state.logicalTask.runId || !state.logicalTask.claimIdentity || !state.logicalTask.chargeMarkerRef) return fail("session_lifecycle_identity_incomplete");
  if (!state.sessions?.current || !Number.isSafeInteger(state.sessions.generation) || state.sessions.generation < 1 || !Array.isArray(state.sessions.retired)) return fail("session_lifecycle_session_identity_invalid");
  if (new Set(state.sessions.retired).size !== state.sessions.retired.length || (state.mutationAuthority?.status === "active" && state.sessions.retired.includes(state.sessions.current))) return fail("session_lifecycle_retirement_contradictory");
  const authority = state.mutationAuthority;
  if (!authority || authority.generation !== state.sessions.generation || (authority.status === "active" && authority.ownerSessionId !== state.sessions.current) || state.sessions.retired.includes(authority.ownerSessionId) || (authority.status === "terminal" && authority.ownerSessionId !== null)) return fail("session_lifecycle_authority_contradictory");
  if (!["active", "retired_pending_successor", "recovery_pending", "terminal"].includes(authority.status)) return fail("session_lifecycle_authority_status_invalid");
  const terminalPhase = terminalPhases.has(state.controller?.phase);
  const terminalReport = ["completed", "stopped"].includes(state.report?.status);
  if (terminalPhase !== terminalReport || terminalPhase !== (authority.status === "terminal") || (terminalPhase && state.report.status !== state.controller.phase)) return fail("session_lifecycle_terminal_state_contradictory");
  for (const key of ["localSourceChangingRoundsPerEpoch", "githubTriggeredFixEpochsPerPr", "lifetimeLocalSourceChangingRounds"]) if (!Number.isSafeInteger(state.controller?.[key]) || state.controller[key] < 0) return fail("session_lifecycle_counter_invalid");
  try { normalizeContextBudgetPolicy(state.context?.policy); } catch { return fail("session_lifecycle_policy_invalid"); }
  if (state.report?.correlationKey !== state.logicalTask.taskKey) return fail("session_lifecycle_report_correlation_mismatch");
  for (const [key, value] of Object.entries({ repository: state.repository, taskKey: state.logicalTask.taskKey, runId: state.logicalTask.runId, supervisorRunId: state.logicalTask.supervisorRunId, claimIdentity: state.logicalTask.claimIdentity, sessionId: state.sessions.current })) {
    const comparisonRequested = key === "supervisorRunId" ? Object.hasOwn(expected, key) : Boolean(expected[key]);
    if (comparisonRequested && expected[key] !== value) return fail(`session_lifecycle_${key}_mismatch`);
  }
  if (state.checkpoint?.digest !== checkpointDigest(state)) return fail("session_lifecycle_checkpoint_digest_mismatch");
  return { ok: true };
}

export function persistSessionLifecycleState(config, state) {
  const expectedDigest = state.checkpoint?.parentDigest || state.checkpoint?.digest;
  const next = sanitizePersistedEvidence({ ...state, timestamps: { ...state.timestamps, updatedAt: new Date().toISOString() } });
  next.checkpoint = { ...next.checkpoint, status: "ready", writtenAt: next.timestamps.updatedAt, digest: null, parentDigest: null };
  next.checkpoint.digest = checkpointDigest(next);
  const validation = validateSessionLifecycleState(next);
  if (!validation.ok) return validation;
  const statePath = sessionLifecyclePath(config, next);
  const rootValidation = ensureTrustedLifecycleRoot(path.dirname(statePath));
  if (!rootValidation.ok) return rootValidation;
  const acquired = acquireCheckpointLock(statePath);
  if (!acquired.ok) return acquired;
  let result;
  try {
    result = persistSessionLifecycleUnderLock(statePath, next, state, expectedDigest);
  } finally {
    const released = acquired.release();
    if (!released.ok) result = result?.ok
      ? { ...result, cleanupWarning: released.reasonCode }
      : result || released;
  }
  return result;
}

function ensureTrustedLifecycleRoot(root) {
  try {
    if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 });
    const info = lstatSync(root);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid())) return fail("session_lifecycle_recovery_root_untrusted");
    return { ok: true };
  } catch {
    return fail("session_lifecycle_recovery_root_untrusted");
  }
}

function persistSessionLifecycleUnderLock(statePath, next, state, expectedDigest) {
  const tmp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    if (existsSync(statePath)) {
      let current;
      try { current = JSON.parse(readFileSync(statePath, "utf8")); } catch { return fail("session_lifecycle_state_corrupt"); }
      const currentValidation = validateSessionLifecycleState(current);
      if (!currentValidation.ok) return currentValidation;
      if (current.checkpoint.digest !== expectedDigest) return fail("session_lifecycle_checkpoint_compare_and_swap_failed");
      const sameGeneration = current.sessions.generation === state.sessions.generation
        && current.sessions.current === state.sessions.current
        && current.mutationAuthority.generation === state.mutationAuthority.generation
        && !(current.mutationAuthority.status === "retired_pending_successor" && state.mutationAuthority.status === "active");
      const validSuccessor = state.sessions.generation === current.sessions.generation + 1
        && ["retired_pending_successor", "recovery_pending"].includes(current.mutationAuthority.status)
        && state.mutationAuthority.status === "active"
        && state.sessions.retired.includes(current.sessions.current);
      if (!sameGeneration && !validSuccessor) {
        return fail("session_lifecycle_checkpoint_compare_and_swap_failed");
      }
    }
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    fsyncPath(tmp);
    renameSync(tmp, statePath);
    fsyncPath(path.dirname(statePath));
    return { ok: true, state: next, statePath };
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

function fsyncPath(targetPath) {
  const descriptor = openSync(targetPath, constants.O_RDONLY);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

export function acquireCheckpointLock(statePath) {
  const lockPath = `${statePath}.lock`;
  const ownerPath = `${lockPath}.${process.pid}.${Date.now()}.owner`;
  const owner = { pid: process.pid, processStart: processStartIdentity(process.pid), token: randomUUID() };
  let linked = false;
  if (!owner.processStart) return fail("session_lifecycle_checkpoint_lock_identity_unavailable");
  try {
    writeFileSync(ownerPath, `${JSON.stringify(owner)}\n`, { flag: "wx", mode: 0o600 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        linkSync(ownerPath, lockPath);
        stabilizeCheckpointLock();
        if (!checkpointLockMatches(lockPath, owner)) return fail("session_lifecycle_checkpoint_lock_raced");
        linked = true;
        return { ok: true, release: () => releaseCheckpointLock(lockPath, ownerPath, owner) };
      } catch (error) {
        if (error?.code !== "EEXIST") return fail("session_lifecycle_checkpoint_lock_failed");
        if (attempt > 0 || !reclaimInactiveCheckpointLock(lockPath)) return fail("session_lifecycle_checkpoint_write_locked");
      }
    }
    return fail("session_lifecycle_checkpoint_write_locked");
  } finally {
    if (!linked && existsSync(ownerPath)) {
      try { unlinkSync(ownerPath); } catch { /* owner-only orphan is non-authoritative */ }
    }
  }
}

function releaseCheckpointLock(lockPath, ownerPath, owner) {
  try {
    if (!checkpointLockMatches(lockPath, owner)) return fail("session_lifecycle_checkpoint_lock_cleanup_failed");
    unlinkSync(lockPath);
    unlinkSync(ownerPath);
    return { ok: true };
  } catch {
    return fail("session_lifecycle_checkpoint_lock_cleanup_failed");
  }
}

function reclaimInactiveCheckpointLock(lockPath) {
  let observed;
  try { observed = JSON.parse(readFileSync(lockPath, "utf8")); } catch { return false; }
  if (!validCheckpointLockOwner(observed) || checkpointLockOwnerStatus(observed) !== "inactive") return false;
  const quarantinePath = `${lockPath}.${process.pid}.${Date.now()}.${randomUUID()}.stale`;
  try {
    renameSync(lockPath, quarantinePath);
    const movedMatches = checkpointLockMatches(quarantinePath, observed);
    if (!movedMatches) {
      try { linkSync(quarantinePath, lockPath); } catch { /* another stabilized contender owns the lock path */ }
      return false;
    }
    unlinkSync(quarantinePath);
    return true;
  } catch {
    return false;
  } finally {
    if (existsSync(quarantinePath)) {
      try { unlinkSync(quarantinePath); } catch { /* fail-closed acquisition result preserves the live lock path */ }
    }
  }
}

export function checkpointLockOwnerStatus(owner, readProcessStat = (pid) => readFileSync(`/proc/${pid}/stat`, "utf8")) {
  if (!validCheckpointLockOwner(owner)) return "unknown";
  try {
    const currentStart = parseProcStartIdentity(readProcessStat(owner.pid));
    if (!currentStart) return "unknown";
    return currentStart === owner.processStart ? "active" : "inactive";
  } catch (error) {
    return error?.code === "ENOENT" ? "inactive" : "unknown";
  }
}

function checkpointLockMatches(lockPath, owner) {
  try {
    const current = JSON.parse(readFileSync(lockPath, "utf8"));
    return validCheckpointLockOwner(current) && current.pid === owner.pid && current.processStart === owner.processStart && current.token === owner.token;
  } catch { return false; }
}

function validCheckpointLockOwner(owner) {
  return Number.isSafeInteger(owner?.pid) && owner.pid > 0 && /^\d+$/.test(owner?.processStart || "") && typeof owner?.token === "string" && /^[0-9a-f-]{36}$/.test(owner.token);
}

function stabilizeCheckpointLock() {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
}

function processStartIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try {
    return parseProcStartIdentity(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch { return null; }
}

export function parseProcStartIdentity(value) {
  const stat = String(value || "").trim();
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd < 3) return null;
  const fieldsAfterCommand = stat.slice(commandEnd + 1).trim().split(/\s+/);
  const startTime = fieldsAfterCommand[19];
  return /^\d+$/.test(startTime || "") ? startTime : null;
}

export function loadSessionLifecycleState(config, identity) {
  const statePath = sessionLifecyclePath(config, identity);
  if (!existsSync(statePath)) return fail("session_lifecycle_state_missing", null, { statePath });
  let state;
  try { state = JSON.parse(readFileSync(statePath, "utf8")); } catch { return fail("session_lifecycle_state_corrupt", null, { statePath }); }
  const validation = validateSessionLifecycleState(state, identity);
  return validation.ok ? { ok: true, state, statePath } : { ...validation, statePath };
}

export function loadSessionLifecycleForRecovery(config, identity) {
  const root = path.join(config.logsRoot, "session-lifecycle");
  if (!existsSync(root)) return fail("session_lifecycle_state_missing", null, { statePath: root });
  const rootInfo = lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || (rootInfo.mode & 0o077) !== 0 || (typeof process.getuid === "function" && rootInfo.uid !== process.getuid())) return fail("session_lifecycle_recovery_root_untrusted");
  const matches = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).filter((item) => /^[a-f0-9]{64}\.json$/.test(item.name)).sort((left, right) => left.name.localeCompare(right.name))) {
    const statePath = path.join(root, entry.name);
    let info;
    try { info = lstatSync(statePath); } catch { return fail("session_lifecycle_recovery_artifact_untrusted"); }
    if (!entry.isFile() || !info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size > 1024 * 1024 || (typeof process.getuid === "function" && info.uid !== process.getuid())) return fail("session_lifecycle_recovery_artifact_untrusted");
    let state;
    try { state = JSON.parse(readFileSync(statePath, "utf8")); } catch { return fail("session_lifecycle_state_corrupt", null, { statePath }); }
    if (state.repository !== identity.repository || state.logicalTask?.issueNumber !== identity.issueNumber || state.logicalTask?.taskKey !== identity.taskKey || state.logicalTask?.runId !== identity.runId) continue;
    if (state.branch?.name !== identity.branchName || state.branch?.baseSha !== identity.baseSha) continue;
    const hasSupervisorIdentity = Object.hasOwn(state.logicalTask || {}, "supervisorRunId");
    const expectedIdentity = { ...identity, claimIdentity: state.logicalTask.claimIdentity };
    if (!hasSupervisorIdentity) delete expectedIdentity.supervisorRunId;
    const validation = validateSessionLifecycleState(state, expectedIdentity);
    if (!validation.ok) return { ...validation, statePath };
    matches.push({ state, statePath });
  }
  if (matches.length !== 1) return fail(matches.length === 0 ? "session_lifecycle_state_missing" : "session_lifecycle_state_ambiguous");
  let match = matches[0];
  if (config.sessionLifecycle?.enabled === true
    && identity.supervisorRunId
    && !Object.hasOwn(match.state.logicalTask || {}, "supervisorRunId")) {
    if (match.state.branch.headSha !== identity.headSha) {
      return fail("session_lifecycle_legacy_supervisor_backfill_head_mismatch", null, { statePath: match.statePath });
    }
    const upgraded = structuredClone(match.state);
    upgraded.logicalTask.supervisorRunId = identity.supervisorRunId;
    refreshDigest(upgraded);
    const written = persistSessionLifecycleState(config, upgraded);
    if (!written.ok) return written;
    match = { state: written.state, statePath: written.statePath };
  }
  return {
    ok: true,
    state: match.state,
    statePath: match.statePath,
    recoveryHeadAdvanced: match.state.branch.headSha !== identity.headSha,
  };
}

export function beginSessionRotation(state, { reason, snapshot = null, requestId = null } = {}) {
  const validation = validateSessionLifecycleState(state);
  if (!validation.ok) return validation;
  if (state.mutationAuthority.status === "retired_pending_successor") {
    return { ok: true, duplicate: true, state, requestId: state.mutationAuthority.handoff.requestId };
  }
  const oldSessionId = state.sessions.current;
  const id = bounded(requestId, 160) || digest(`${oldSessionId}:${state.sessions.generation}:${reason || "rotation"}`);
  const next = structuredClone(state);
  next.sessions.retired.push(oldSessionId);
  next.mutationAuthority = { ownerSessionId: null, generation: state.sessions.generation, status: "retired_pending_successor", handoff: { requestId: id, retiredSessionId: oldSessionId, successorSessionId: null, reason: bounded(reason, 160), checkpointDigest: state.checkpoint.digest, startedAt: new Date().toISOString() } };
  next.context.snapshot = snapshot ? sanitizePersistedEvidence(snapshot) : state.context.snapshot;
  next.context.reason = bounded(reason, 160);
  refreshDigest(next);
  return { ok: true, duplicate: false, state: next, requestId: id };
}

export function completeSessionRotation(state, { requestId, newSessionId } = {}) {
  const validation = validateSessionLifecycleState(state);
  if (!validation.ok) return validation;
  const handoff = state.mutationAuthority.handoff;
  if (state.mutationAuthority.status === "active") {
    if (state.sessions.current === newSessionId && handoff?.requestId === requestId) return { ok: true, duplicate: true, state };
    return fail("session_lifecycle_rotation_not_pending");
  }
  if (!handoff || handoff.requestId !== requestId || !bounded(newSessionId, 160) || state.sessions.retired.includes(newSessionId)) return fail("session_lifecycle_handoff_identity_mismatch");
  const next = structuredClone(state);
  next.sessions.current = newSessionId;
  next.sessions.generation += 1;
  next.context.rotations += 1;
  next.context.lastRotationTurn = next.context.snapshot?.turn ?? null;
  next.mutationAuthority = { ownerSessionId: newSessionId, generation: next.sessions.generation, status: "active", handoff: { ...handoff, successorSessionId: newSessionId, completedAt: new Date().toISOString() } };
  refreshDigest(next);
  return { ok: true, duplicate: false, state: next };
}

export function assertMutationAuthority(state, sessionId) {
  const validation = validateSessionLifecycleState(state);
  if (!validation.ok) return validation;
  return state.mutationAuthority.status === "active" && state.mutationAuthority.ownerSessionId === sessionId && !state.sessions.retired.includes(sessionId)
    ? { ok: true, generation: state.mutationAuthority.generation }
    : fail("session_lifecycle_mutation_authority_denied");
}

export function synchronizeSessionLifecycleCounters(config, state, counters = {}) {
  const validation = validateSessionLifecycleState(state);
  if (!validation.ok) return validation;
  const next = structuredClone(state);
  for (const key of ["localSourceChangingRoundsPerEpoch", "githubTriggeredFixEpochsPerPr", "lifetimeLocalSourceChangingRounds"]) {
    const value = counters[key];
    if (!Number.isSafeInteger(value) || value < 0) return fail("session_lifecycle_counter_invalid");
    next.controller[key] = value;
  }
  refreshDigest(next);
  return persistSessionLifecycleState(config, next);
}

export function transitionSessionLifecyclePhase(config, state, { phase, nextExactAction } = {}) {
  const validation = validateSessionLifecycleState(state);
  if (!validation.ok) return validation;
  const next = structuredClone(state);
  next.controller.phase = bounded(phase, 120);
  next.controller.nextExactAction = bounded(nextExactAction, 500);
  if (["completed", "stopped"].includes(phase)) {
    next.report.status = phase;
    next.mutationAuthority = { ownerSessionId: null, generation: next.sessions.generation, status: "terminal", handoff: null };
  }
  refreshDigest(next);
  return persistSessionLifecycleState(config, next);
}

export function reopenKnownValidationRetryDerivative(config, state) {
  const validation = validateSessionLifecycleState(state);
  if (!validation.ok) return validation;
  const effects = state.recovery?.effectsAlreadyPresent;
  if (state.controller?.phase !== "stopped"
    || state.controller?.nextExactAction !== "checkpoint_validation_recovery_failed_closed"
    || state.report?.status !== "stopped"
    || state.mutationAuthority?.status !== "terminal"
    || state.mutationAuthority?.ownerSessionId !== null
    || state.recovery?.status !== "pending"
    || state.recovery?.phaseAfter !== "push"
    || effects?.commit !== true
    || effects?.push !== false
    || effects?.merge !== false
    || effects?.comment !== false
    || !state.interruption?.class
    || !state.recovery?.operationId) {
    return fail("session_lifecycle_validation_retry_derivative_mismatch");
  }
  const next = structuredClone(state);
  next.controller.phase = "checkpoint_validation_commit";
  next.controller.nextExactAction = "run_validation_and_commit";
  next.report.status = "in_progress";
  next.recovery.phaseAfter = "checkpoint_validation_commit";
  next.mutationAuthority = {
    ownerSessionId: null,
    generation: next.sessions.generation,
    status: "recovery_pending",
    handoff: {
      requestId: digest(`${next.recovery.operationId}:${next.sessions.current}:validation-retry`),
      retiredSessionId: next.sessions.current,
      successorSessionId: null,
      reason: "validation_retry_derivative_reopened",
      checkpointDigest: next.checkpoint.digest,
      startedAt: new Date().toISOString(),
    },
  };
  if (!next.sessions.retired.includes(next.sessions.current)) next.sessions.retired.push(next.sessions.current);
  refreshDigest(next);
  return persistSessionLifecycleState(config, next);
}

export function transitionSessionLifecycleHead(config, state, { branchName, headSha, prNumber } = {}) {
  const validation = validateSessionLifecycleState(state);
  if (!validation.ok) return validation;
  if (!sha(headSha)) return fail("session_lifecycle_head_transition_invalid");
  const next = structuredClone(state);
  next.branch.name = bounded(branchName || next.branch.name, 240);
  next.branch.headSha = headSha;
  next.branch.prNumber = Number.isSafeInteger(prNumber) ? prNumber : next.branch.prNumber;
  refreshDigest(next);
  return persistSessionLifecycleState(config, next);
}

export function prepareFreshSessionInvocation(config, { state, telemetry = {}, phase, newSessionId, mutationJournaled = true } = {}) {
  const validation = validateSessionLifecycleState(state);
  if (!validation.ok) return validation;
  const turnsSinceRotation = state.context.lastRotationTurn === null ? Number.MAX_SAFE_INTEGER : Math.max(0, (telemetry.turn || 0) - state.context.lastRotationTurn);
  const decision = evaluateContextBudget({ telemetry, policy: state.context.policy, phase, checkpointComplete: state.checkpoint.status === "ready", mutationJournaled, turnsSinceRotation });
  if (!decision.ok) return decision;
  let next = structuredClone(state);
  next.context.snapshot = decision.snapshot;
  next.context.reason = decision.reasonCode;
  refreshDigest(next);
  let written = persistSessionLifecycleState(config, next);
  if (!written.ok) return { ...written, decision, rotated: false };
  const invocationHandoffRequired = written.state.sessions.current !== newSessionId;
  if (decision.action !== "rotate_before_next_operation" && !invocationHandoffRequired) return { ...written, decision, rotated: false };
  const begun = beginSessionRotation(written.state, { reason: decision.action === "rotate_before_next_operation" ? decision.reasonCode : "fresh_invocation_authority_handoff", snapshot: decision.snapshot });
  if (!begun.ok) return begun;
  written = persistSessionLifecycleState(config, begun.state);
  if (!written.ok) return written;
  const completed = completeSessionRotation(written.state, { requestId: begun.requestId, newSessionId });
  if (!completed.ok) return completed;
  written = persistSessionLifecycleState(config, completed.state);
  return written.ok ? { ...written, decision, rotated: true, retiredSessionId: state.sessions.current, currentSessionId: newSessionId } : written;
}

export function classifyReportlessInterruption(input = {}) {
  if (input.contradictory || input.identityMismatch || input.checkpointCorrupt || input.activeOwners > 1) return classification("ambiguous_or_contradictory_state", false, "stop_fail_closed");
  if (input.ownerAlive === true && input.leaseValid !== false) return { ok: true, active: true, recoverable: false, reasonCode: "session_lifecycle_owner_still_active", nextAction: "wait_for_active_owner" };
  if (input.compactionFailed) return classification("remote_compaction_failure", true, "rotate_and_resume_checkpoint");
  if (input.providerDisconnected) return classification("provider_stream_disconnect", true, "rotate_and_resume_checkpoint");
  if (input.hostRestarted) return classification("host_restart_process_loss", Boolean(input.checkpointValid), input.checkpointValid ? "recover_earliest_safe_phase" : "stop_fail_closed");
  if (input.wrapperInterrupted || input.supervisorInterrupted) return classification("wrapper_supervisor_interruption", Boolean(input.checkpointValid), input.checkpointValid ? "recover_earliest_safe_phase" : "stop_fail_closed");
  if (input.partialReport || input.partialCheckpoint) return classification("partial_report_or_checkpoint_write", Boolean(input.checkpointValid), input.checkpointValid ? "ignore_report_reconcile_live_state" : "stop_fail_closed");
  if (input.processExited && !input.terminalReportTrusted) return classification("main_process_exit_without_terminal_report", Boolean(input.checkpointValid), input.checkpointValid ? "recover_earliest_safe_phase" : "stop_fail_closed");
  return classification("ambiguous_or_contradictory_state", false, "stop_fail_closed");
}

export function planInterruptionRecovery(state, live = {}, interruption = {}) {
  const validation = validateSessionLifecycleState(state, live.expectedIdentity || {});
  if (!validation.ok) return validation;
  if (["completed", "stopped"].includes(state.controller?.phase)
    && state.report?.status === state.controller.phase
    && state.mutationAuthority?.status === "terminal") {
    return { ok: true, recoverable: false, terminal: true, reasonCode: "session_lifecycle_already_terminal", terminalPhase: state.controller.phase, state };
  }
  const classified = classifyReportlessInterruption(interruption);
  if (classified.active || !classified.recoverable) return classified;
  if (state.recovery?.status === "pending" && state.interruption?.class === classified.interruptionClass) {
    return { ok: true, recoverable: true, duplicate: true, classification: classified, effectsAlreadyPresent: state.recovery.effectsAlreadyPresent, earliestSafePhase: state.recovery.phaseAfter, state };
  }
  const effects = {
    mutation: live.mutationPresent === true,
    commit: live.commitPresent === true,
    push: live.pushPresent === true,
    merge: live.mergePresent === true,
    comment: live.commentPresent === true,
  };
  const phase = effects.merge ? "issue_parent_ledger_hygiene" : effects.push ? "ci_wait" : effects.commit ? "push" : effects.mutation ? "checkpoint_validation_commit" : state.controller.phase;
  const next = structuredClone(state);
  next.interruption = { class: classified.interruptionClass, reasonCode: classified.reasonCode, detectedAt: new Date().toISOString() };
  next.recovery = { operationId: live.recoveryOperationId || randomUUID(), status: "pending", attempts: state.recovery.attempts + 1, effectsAlreadyPresent: effects, phaseBefore: state.controller.phase, phaseAfter: phase };
  next.controller.phase = phase;
  next.controller.nextExactAction = classified.nextAction;
  next.mutationAuthority = { ownerSessionId: null, generation: state.sessions.generation, status: "recovery_pending", handoff: { requestId: digest(`${next.recovery.operationId}:${state.sessions.current}`), retiredSessionId: state.sessions.current, successorSessionId: null, reason: classified.interruptionClass, checkpointDigest: state.checkpoint.digest, startedAt: new Date().toISOString() } };
  if (!next.sessions.retired.includes(next.sessions.current)) next.sessions.retired.push(next.sessions.current);
  refreshDigest(next);
  return { ok: true, recoverable: true, classification: classified, effectsAlreadyPresent: effects, earliestSafePhase: phase, state: next };
}

export function sessionLifecyclePath(config, identity = {}) {
  const repository = identity.repository || config.repositorySlug;
  const logical = identity.logicalTask || identity;
  const key = digest(JSON.stringify({ repository, issueNumber: logical.issueNumber, taskKey: logical.taskKey, runId: logical.runId, claimIdentity: logical.claimIdentity }));
  return path.join(config.logsRoot, "session-lifecycle", `${key}.json`);
}

function checkpointDigest(state) {
  const copy = structuredClone(state);
  if (copy.checkpoint) copy.checkpoint.digest = null;
  if (copy.timestamps) copy.timestamps.updatedAt = null;
  return digest(JSON.stringify(copy));
}
function refreshDigest(state) { state.timestamps.updatedAt = new Date().toISOString(); state.checkpoint.parentDigest = state.checkpoint.digest; state.checkpoint.digest = null; state.checkpoint.digest = checkpointDigest(state); }
function classification(interruptionClass, recoverable, nextAction) { return { ok: recoverable, active: false, recoverable, interruptionClass, reasonCode: `interruption_${interruptionClass}`, nextAction }; }
function fail(reasonCode, nextAction = "stop_fail_closed", extra = {}) { return { ok: false, reasonCode, nextAction, ...extra }; }
function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function digestOrNull(value) { return /^[a-f0-9]{64}$/.test(String(value || "")) ? value : null; }
function sha(value) { return /^[a-f0-9]{40}$/.test(String(value || "")) ? value : null; }
function bounded(value, max) { return typeof value === "string" && value.length ? value.slice(0, max) : null; }
function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0 ? value : null; }
function nonnegativeInteger(value) { return Number.isSafeInteger(value) && value >= 0 ? value : null; }
function validTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null; }
function allowedValue(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
