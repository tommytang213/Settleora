import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";

export const recoveryStateVersion = 1;
export const recoveryStateRootName = "recovery";

export const recoveryOutcomeClasses = Object.freeze([
  "success",
  "pending",
  "retryable_infrastructure",
  "retryable_provider",
  "review_fix_safe",
  "ci_fix_safe",
  "code_scanning_fix_safe",
  "evidence_regeneration_required",
  "current_main_reconciliation_required",
  "followup_issue_required",
  "manual_decision_required",
  "manual_action_required",
  "unsafe_or_ambiguous",
  "terminal_failure",
]);

export const recoveryPhases = Object.freeze([
  "issue_poll_claim",
  "branch_setup",
  "implementation_or_bundle_slice",
  "checkpoint_validation_commit",
  "aggregate_validation",
  "external_review",
  "codex_mechanics_security_review",
  "review_fix",
  "push",
  "pr_create_recover",
  "ci_wait",
  "ci_scanner_fix",
  "exact_head_final_refresh",
  "merge",
  "source_branch_restoration",
  "post_merge_current_main_checks_scanner_reconciliation",
  "issue_parent_ledger_hygiene",
  "post_merge_ephemeral_cleanup",
  "completed",
  "stopped",
]);

export const headBoundEvidenceKinds = Object.freeze([
  "localValidation",
  "externalReview",
  "codexReview",
  "ciChecks",
  "codeScanning",
  "mergeEligibility",
  "finalRefresh",
  "postMergeExpectations",
]);

const outcomeMetadata = Object.freeze({
  success: ["success", "continue"],
  pending: ["pending", "wait"],
  retryable_infrastructure: ["retryable_infrastructure", "retry_bounded"],
  retryable_provider: ["retryable_provider", "retry_bounded"],
  review_fix_safe: ["review_fix_safe", "run_focused_fix"],
  ci_fix_safe: ["ci_fix_safe", "run_focused_fix"],
  code_scanning_fix_safe: ["code_scanning_fix_safe", "run_focused_fix"],
  evidence_regeneration_required: ["evidence_regeneration_required", "regenerate_exact_head_evidence"],
  current_main_reconciliation_required: ["current_main_reconciliation_required", "reconcile_current_main"],
  followup_issue_required: ["followup_issue_required", "create_or_reuse_followup"],
  manual_decision_required: ["manual_decision_required", "escalate_decision"],
  manual_action_required: ["manual_action_required", "escalate_action"],
  unsafe_or_ambiguous: ["unsafe_or_ambiguous", "stop_fail_closed"],
  terminal_failure: ["terminal_failure", "stop_terminal"],
});

const defaultBudgets = Object.freeze({
  retryable_infrastructure: 2,
  retryable_provider: 1,
  review_fix_safe: 1,
  ci_fix_safe: 1,
  code_scanning_fix_safe: 1,
  evidence_regeneration_required: 1,
  current_main_reconciliation_required: 1,
  followup_issue_required: 1,
  pending: 3,
});

const allowedMutationMarkerKinds = new Set([
  "claim",
  "logical_task_charge",
  "checkpoint_commit",
  "push",
  "pr_create",
  "pr_recover",
  "issue_comment",
  "parent_comment",
  "pr_comment",
  "merge",
  "source_branch_restore",
  "issue_close",
  "label_cleanup",
  "ledger_hygiene",
  "branch_cleanup_plan",
  "branch_ownership_created",
  "worktree_ownership_created",
  "remote_branch_delete",
  "worktree_remove",
  "local_branch_delete",
  "branch_cleanup_complete",
  "followup_issue",
  "security_finding_disposition_planned",
  "security_finding_disposition_attempted",
  "security_finding_disposition_confirmed",
  "security_finding_disposition_reconciled",
]);

export function recoveryStorageKey(input = {}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        issueNumber: input.issue?.number ?? input.issueNumber ?? null,
        runId: input.run?.runId ?? input.runId ?? null,
        taskKey: input.taskKey ?? null,
        branchName: input.branch?.name ?? input.branchName ?? null,
        baseSha: input.branch?.baseSha ?? input.baseSha ?? null,
      }),
    )
    .digest("hex");
}

export function recoveryStatePath(config, keyOrState) {
  const key = typeof keyOrState === "string" ? keyOrState : recoveryStorageKey(keyOrState);
  return path.join(config.logsRoot, recoveryStateRootName, `${key}.json`);
}

export function classifyRecoveryOutcome(outcomeClass, detail = {}) {
  if (!recoveryOutcomeClasses.includes(outcomeClass)) {
    return {
      ok: false,
      outcomeClass: "unsafe_or_ambiguous",
      reasonCode: "unknown_outcome_class",
      nextAction: "stop_fail_closed",
    };
  }
  const [reasonCode, nextAction] = outcomeMetadata[outcomeClass];
  return {
    ok: true,
    outcomeClass,
    reasonCode: detail.reasonCode || reasonCode,
    nextAction: detail.nextAction || nextAction,
    retryable: ["retryable_infrastructure", "retryable_provider", "pending"].includes(outcomeClass),
    mutationAllowed:
      ["review_fix_safe", "ci_fix_safe", "code_scanning_fix_safe", "evidence_regeneration_required"].includes(outcomeClass),
  };
}

export function createInitialRecoveryState({
  taskKey,
  issue,
  runId,
  supervisorRunId = null,
  branchName,
  baseSha,
  currentHeadSha,
  pr = null,
  phase = "issue_poll_claim",
  firstIncompleteAction = "claim_issue",
  featureBundle = null,
  generatedWork = null,
  outageResubmission = null,
}) {
  const now = new Date().toISOString();
  const state = {
    stateVersion: recoveryStateVersion,
    taskKey: bounded(taskKey, 80),
    issue: {
      number: issue?.number ?? null,
      title: bounded(issue?.title || "", 240),
      url: issue?.url || null,
    },
    run: {
      runId: runId || null,
      supervisorRunId: supervisorRunId || null,
    },
    branch: {
      name: branchName || null,
      baseSha: baseSha || null,
      currentHeadSha: currentHeadSha || baseSha || null,
      expectedRemoteHeadSha: null,
    },
    pr: normalizePr(pr),
    phase,
    firstIncompleteAction,
    attempts: [],
    retryBudgets: { ...defaultBudgets },
    evidence: emptyEvidenceBindings(currentHeadSha || baseSha || null),
    featureBundle,
    generatedWork,
    outageResubmission: normalizeOutageResubmissionBinding(outageResubmission),
    mutationMarkers: {},
    stopReason: null,
    nextSafeAction: firstIncompleteAction,
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
  };
  const validation = validateRecoveryStateShape(state);
  if (!validation.ok) throw new Error(`Invalid recovery state: ${validation.reason}`);
  return sanitizeRecoveryState(state);
}

export function writeRecoveryState(config, state) {
  const validation = validateRecoveryStateShape(state);
  if (!validation.ok) throw new Error(`Invalid recovery state: ${validation.reason}`);
  const statePath = recoveryStatePath(config, state);
  mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  const sanitized = sanitizeRecoveryState({
    ...state,
    timestamps: { ...(state.timestamps || {}), updatedAt: new Date().toISOString() },
  });
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, statePath);
  return { statePath, state: sanitized };
}

export function bindOutageResubmissionToRecoveryState(state, binding) {
  const authoritativeIdentity = normalizeOutageBindingAuthoritativeIdentity(state);
  const identityValidation = validateOutageBindingCallerIdentity(authoritativeIdentity, binding || {});
  if (!identityValidation.ok) return identityValidation;

  const normalized = normalizeOutageResubmissionBinding({
    ...authoritativeIdentity,
    originalSupervisorSpecDigest: binding?.originalSupervisorSpecDigest,
    markerKey: binding?.markerKey,
    outageFingerprint: binding?.outageFingerprint,
    attemptNumber: binding?.attemptNumber,
  });
  const normalizedCandidate = sanitizeRecoveryState({
    ...state,
    outageResubmission: normalized,
  });
  const validation = validateRecoveryStateShape(normalizedCandidate);
  if (!validation.ok) return failed("recovery_outage_binding_invalid", validation.reason);

  const existing = state.outageResubmission || null;
  if (existing) {
    const normalizedExisting = normalizeOutageResubmissionBinding(existing);
    if (JSON.stringify(normalizedExisting) !== JSON.stringify(normalized)) {
      return failed("recovery_outage_binding_conflict", "Recovery state already has a different outage resubmission binding.");
    }
    return { ok: true, state: normalizedCandidate, changed: false, binding: normalized };
  }

  return { ok: true, state: normalizedCandidate, changed: true, binding: normalized };
}

function normalizeOutageBindingAuthoritativeIdentity(state) {
  return {
    taskKey: state.taskKey || null,
    issueNumber: state.issue?.number || null,
    branchName: state.branch?.name || null,
    baseSha: state.branch?.baseSha || null,
    currentHeadSha: state.branch?.currentHeadSha || null,
    prNumber: state.pr?.number ?? null,
    prHeadSha: state.pr?.headSha ?? null,
    runnerRunId: state.run?.runId || null,
    supervisorRunId: state.run?.supervisorRunId || null,
  };
}

function validateOutageBindingCallerIdentity(authoritative, binding) {
  const identityFields = [
    "taskKey",
    "issueNumber",
    "branchName",
    "baseSha",
    "currentHeadSha",
    "prNumber",
    "prHeadSha",
    "runnerRunId",
    "supervisorRunId",
  ];
  const hasPrNumber = Object.hasOwn(binding, "prNumber");
  const hasPrHeadSha = Object.hasOwn(binding, "prHeadSha");
  const authoritativeHasPr = authoritative.prNumber !== null || authoritative.prHeadSha !== null;
  if (authoritativeHasPr && (!hasPrNumber || !hasPrHeadSha)) {
    return failed("recovery_outage_binding_identity_mismatch", "Outage resubmission binding identity does not match recovery state.");
  }
  if (hasPrNumber !== hasPrHeadSha) {
    return failed("recovery_outage_binding_identity_mismatch", "Outage resubmission binding identity does not match recovery state.");
  }
  for (const field of identityFields) {
    if (Object.hasOwn(binding, field)) {
      if (binding[field] === null || binding[field] !== authoritative[field]) {
        return failed("recovery_outage_binding_identity_mismatch", "Outage resubmission binding identity does not match recovery state.");
      }
    }
  }
  return { ok: true };
}

export function loadRecoveryState(config, keyOrState) {
  const statePath = recoveryStatePath(config, keyOrState);
  if (!existsSync(statePath)) return failed("recovery_state_missing", `Recovery state missing: ${statePath}`, { statePath });
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(statePath, "utf8"));
  } catch (error) {
    return failed("recovery_state_corrupt", `Recovery state is corrupt: ${bounded(error.message, 300)}`, { statePath });
  }
  const validation = validateRecoveryStateShape(parsed);
  if (!validation.ok) return failed("recovery_state_schema_invalid", validation.reason, { statePath });
  return { ok: true, state: parsed, statePath };
}

export function listRecoverableRecoveryStates(config) {
  const root = path.join(config.logsRoot, recoveryStateRootName);
  if (!existsSync(root)) return [];
  const artifactNames = readdirSync(root).filter((name) => name.endsWith(".json"));
  if (artifactNames.length === 0) return [];
  const rootInfo = lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || (rootInfo.mode & 0o077) !== 0 || (typeof process.getuid === "function" && rootInfo.uid !== process.getuid())) {
    throw new Error("recovery_state_root_untrusted");
  }
  const states = artifactNames
    .map((name) => path.join(root, name))
    .map((statePath) => {
      try {
        const info = lstatSync(statePath);
        if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size <= 0 || info.size > 1024 * 1024 || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
          throw new Error("recovery_state_artifact_untrusted");
        }
        const parsed = JSON.parse(readFileSync(statePath, "utf8"));
        const validation = validateRecoveryStateShape(parsed);
        if (!validation.ok) throw new Error("recovery_state_schema_invalid");
        if (parsed.phase === "completed") return null;
        if (parsed.phase === "stopped" && !isValidationFailureContinuation(parsed)) return null;
        return sanitizeRecoveryState({ ...parsed, statePath });
      } catch {
        throw new Error("recovery_state_artifact_untrusted");
      }
    })
    .filter(Boolean);
  const superseded = new Set();
  for (const candidate of states) {
    if (!isProvisionalTaskKey(candidate.taskKey)) continue;
    const successors = states.filter((other) => other !== candidate && isExactRecoverySuccessor(candidate, other));
    if (successors.length === 1) superseded.add(candidate.statePath);
  }
  return states
    .filter((state) => !superseded.has(state.statePath))
    .sort((left, right) => String(left.timestamps?.updatedAt || "").localeCompare(String(right.timestamps?.updatedAt || "")));
}

function isValidationFailureContinuation(state) {
  return state?.evidence?.localValidation?.status === "failed"
    && state.branch?.currentHeadSha === state.ordinaryContinuation?.identity?.headSha
    && isValidationRetryCheckpoint(state);
}

function isValidationRetryCheckpoint(state) {
  const originalStop = state?.stopReason?.reasonCode === "checkpoint_validation_not_source_fix_safe";
  const knownDerivativeStop = state?.stopReason?.reasonCode === "checkpoint_validation_recovery_failed_closed"
    && state?.stopReason?.reason === "recovery_existing_pr_context_missing"
    && state?.pr?.number === null
    && state?.pr?.url === null
    && state?.pr?.headSha === null
    && state?.branch?.expectedRemoteHeadSha === null
    && !Object.keys(state?.mutationMarkers?.push || {}).length
    && !Object.keys(state?.mutationMarkers?.merge || {}).length;
  return (originalStop || knownDerivativeStop)
    && state?.firstIncompleteAction === "run_validation_and_commit"
    && state?.nextSafeAction === "stop_fail_closed"
    && Array.isArray(state?.ordinaryContinuation?.sourceFailureBatch?.findings)
    && state.ordinaryContinuation.sourceFailureBatch.findings.length > 0
    && state.ordinaryContinuation.sourceFailureBatch.findings.every((finding) =>
      finding?.sourceFixEligible === false
      && finding?.nextAction === "stop_fail_closed"
      && finding?.classification === "unsafe_or_ambiguous");
}

function isProvisionalTaskKey(value) {
  return /^\d{8}T\d{2}$/.test(String(value || ""));
}

function isExactRecoverySuccessor(older, newer) {
  const reportPath = newer.expectedReportPaths?.repoReportPath;
  const promptPath = newer.expectedReportPaths?.promptPath;
  return /^\d{8}T\d{6}$/.test(String(newer.taskKey || ""))
    && newer.taskKey.startsWith(older.taskKey)
    && newer.issue?.number === older.issue?.number
    && newer.run?.runId === older.run?.runId
    && newer.run?.supervisorRunId === older.run?.supervisorRunId
    && newer.branch?.name === older.branch?.name
    && newer.branch?.baseSha === older.branch?.baseSha
    && newer.branch?.currentHeadSha !== older.branch?.currentHeadSha
    && newer.timestamps?.createdAt === older.timestamps?.createdAt
    && newer.ordinaryContinuation?.identity?.baseSha === newer.branch.baseSha
    && newer.ordinaryContinuation?.identity?.headSha === newer.branch.currentHeadSha
    && typeof reportPath === "string"
    && path.basename(reportPath).startsWith(`settleora-codex-report-${newer.taskKey}-issue-${newer.issue.number}-`)
    && typeof promptPath === "string"
    && path.basename(promptPath).startsWith(`${newer.taskKey}-issue-${newer.issue.number}-`)
    && JSON.stringify(newer.mutationMarkers?.claim || {}) === JSON.stringify(older.mutationMarkers?.claim || {})
    && JSON.stringify(newer.mutationMarkers?.logical_task_charge || {}) === JSON.stringify(older.mutationMarkers?.logical_task_charge || {})
    && JSON.stringify(newer.mutationMarkers?.branch_ownership_created || {}) === JSON.stringify(older.mutationMarkers?.branch_ownership_created || {});
}

export function recoverRecoveryState(config, expected = {}) {
  const loaded = loadRecoveryState(config, expected);
  if (!loaded.ok) return loaded;
  const state = loaded.state;
  if (expected.issueNumber && state.issue.number !== expected.issueNumber) {
    return failed("recovery_issue_mismatch", "Recovery state issue does not match expected issue.");
  }
  if (expected.branchName && state.branch.name !== expected.branchName) {
    return failed("recovery_branch_mismatch", "Recovery state branch does not match expected branch.");
  }
  if (expected.baseSha && state.branch.baseSha !== expected.baseSha) {
    return failed("recovery_base_mismatch", "Recovery state base SHA does not match expected base.");
  }
  if (expected.currentHeadSha && state.branch.currentHeadSha !== expected.currentHeadSha) {
    return failed("recovery_head_mismatch", "Recovery state head SHA does not match current checkout.");
  }
  if (expected.worktreeClean === false) return failed("recovery_dirty_worktree", "Recovery requires a clean worktree.");
  if (expected.reportTaskKey && state.taskKey !== expected.reportTaskKey) {
    return failed("recovery_report_correlation_mismatch", "Recovery report task key does not match state task key.");
  }
  const staleEvidence = staleEvidenceKinds(state, state.branch.currentHeadSha);
  if (staleEvidence.length > 0) {
    return failed("recovery_stale_evidence", `Recovery state has stale evidence: ${staleEvidence.join(",")}.`);
  }
  return {
    ok: true,
    state,
    statePath: loaded.statePath,
    phase: state.phase,
    firstIncompleteAction: state.firstIncompleteAction,
    nextSafeAction: state.nextSafeAction,
  };
}

export function advanceRecoveryPhase(state, { phase, firstIncompleteAction, nextSafeAction = firstIncompleteAction }) {
  if (!recoveryPhases.includes(phase)) throw new Error(`Unknown recovery phase: ${phase}`);
  return sanitizeRecoveryState({
    ...state,
    phase,
    firstIncompleteAction: firstIncompleteAction || state.firstIncompleteAction,
    nextSafeAction: nextSafeAction || firstIncompleteAction || state.nextSafeAction,
    timestamps: { ...(state.timestamps || {}), updatedAt: new Date().toISOString() },
  });
}

export function bindRecoveryEvidence(state, kind, evidence) {
  if (!headBoundEvidenceKinds.includes(kind)) throw new Error(`Unknown recovery evidence kind: ${kind}`);
  const headSha = evidence?.headSha || state.branch.currentHeadSha || null;
  const expectedHeadSha = state.branch.currentHeadSha || null;
  const stale = Boolean(expectedHeadSha && headSha && expectedHeadSha !== headSha);
  return sanitizeRecoveryState({
    ...state,
    evidence: {
      ...state.evidence,
      [kind]: sanitizeRecoveryState({
        status: evidence?.status || (evidence?.passed === true ? "passed" : "recorded"),
        headSha,
        baseSha: evidence?.baseSha || state.branch.baseSha || null,
        changedFilesDigest: evidence?.changedFilesDigest || digestChangedFiles(evidence?.changedFiles || []),
        evidencePath: evidence?.evidencePath || evidence?.reportPath || evidence?.path || null,
        source: bounded(evidence?.source || "", 120) || null,
        provider: bounded(evidence?.provider || "", 120) || null,
        tier: bounded(evidence?.tier || "", 120) || null,
        profile: bounded(evidence?.profile || "", 120) || null,
        resultId: bounded(evidence?.resultId || evidence?.reviewId || evidence?.requestId || "", 160) || null,
        completedAt: evidence?.completedAt || new Date().toISOString(),
        stale,
        ...(stale ? { staleReason: "evidence_head_mismatch", currentHeadSha: expectedHeadSha } : {}),
        summary: bounded(evidence?.summary || evidence?.reason || "", 500),
      }),
    },
  });
}

export function persistCompleteHeadEvidence(config, state, evidenceByKind = {}, identity = {}) {
  const validation = validateCompleteHeadEvidence(state, evidenceByKind, identity);
  if (!validation.ok) return validation;
  let nextState = state;
  for (const kind of ["localValidation", "externalReview", "codexReview"]) {
    nextState = bindRecoveryEvidence(nextState, kind, {
      ...evidenceByKind[kind],
      headSha: identity.headSha || state.branch.currentHeadSha || null,
      baseSha: identity.baseSha || state.branch.baseSha || null,
      changedFiles: identity.changedFiles || evidenceByKind[kind]?.changedFiles || [],
      changedFilesDigest: identity.changedFilesDigest,
    });
  }
  const written = writeRecoveryState(config, {
    ...nextState,
    nextSafeAction: identity.nextSafeAction || state.nextSafeAction,
  });
  return { ok: true, state: written.state, statePath: written.statePath, changedFilesDigest: identity.changedFilesDigest };
}

export function validateCompleteHeadEvidence(state, evidenceByKind = {}, identity = {}) {
  if (!state || typeof state !== "object") return failed("recovery_state_missing", "Recovery state is missing.");
  const headSha = identity.headSha || state.branch?.currentHeadSha || null;
  const baseSha = identity.baseSha || state.branch?.baseSha || null;
  const changedFiles = normalizeChangedFiles(identity.changedFiles || []);
  const changedFilesDigest = identity.changedFilesDigest || digestChangedFiles(changedFiles);
  if (!isSha(headSha)) return failed("evidence_head_missing", "Exact head SHA is missing or invalid.");
  if (baseSha && !isSha(baseSha)) return failed("evidence_base_invalid", "Base SHA is invalid.");
  if (state.branch?.currentHeadSha !== headSha) return failed("evidence_state_head_mismatch", "Recovery state head does not match evidence head.");
  if (state.branch?.baseSha && baseSha && state.branch.baseSha !== baseSha) {
    return failed("evidence_state_base_mismatch", "Recovery state base does not match evidence base.");
  }
  if (identity.taskKey && state.taskKey !== identity.taskKey) return failed("evidence_task_mismatch", "Evidence task key does not match recovery state.");
  if (Number.isInteger(identity.issueNumber) && state.issue?.number !== identity.issueNumber) {
    return failed("evidence_issue_mismatch", "Evidence issue does not match recovery state.");
  }
  if (identity.runId && state.run?.runId !== identity.runId) return failed("evidence_run_mismatch", "Evidence run does not match recovery state.");
  if (identity.branchName && state.branch?.name !== identity.branchName) return failed("evidence_branch_mismatch", "Evidence branch does not match recovery state.");
  if (Number.isInteger(identity.prNumber) && state.pr?.number && state.pr.number !== identity.prNumber) {
    return failed("evidence_pr_mismatch", "Evidence PR does not match recovery state.");
  }
  for (const kind of ["localValidation", "externalReview", "codexReview"]) {
    const item = evidenceByKind[kind];
    if (!item || typeof item !== "object") return failed(`missing_${kind}_evidence`, `${kind} evidence is missing.`);
    if (!["passed", "pass", "approved", "blocked", "failed", "recorded"].includes(String(item.status || item.verdict || "").toLowerCase())) {
      return failed(`${kind}_status_invalid`, `${kind} evidence status is invalid.`);
    }
    const itemHead = item.headSha || item.reviewedHead || headSha;
    if (itemHead !== headSha) return failed(`${kind}_head_mismatch`, `${kind} evidence head does not match.`);
    const itemBase = item.baseSha || baseSha;
    if (baseSha && itemBase && itemBase !== baseSha) return failed(`${kind}_base_mismatch`, `${kind} evidence base does not match.`);
    const itemDigest = item.changedFilesDigest || null;
    if (!itemDigest) return failed(`${kind}_changed_files_digest_missing`, `${kind} changed-file digest is missing.`);
    if (!isDigest(itemDigest)) return failed(`${kind}_changed_files_digest_invalid`, `${kind} changed-file digest is invalid.`);
    if (itemDigest !== changedFilesDigest) return failed(`${kind}_changed_files_digest_mismatch`, `${kind} changed-file digest does not match.`);
  }
  return { ok: true, changedFilesDigest };
}

export function invalidateEvidenceForHeadChange(state, { newHeadSha, reasonCode = "head_changed" }) {
  const oldHeadSha = state.branch.currentHeadSha || null;
  const requestedNewHeadSha = newHeadSha || null;
  const evidence = {};
  for (const kind of headBoundEvidenceKinds) {
    const existing = state.evidence?.[kind] || null;
    const equivalentInvalidation =
      existing?.stale === true &&
      existing.invalidatedBy === reasonCode &&
      existing.invalidatedNewHeadSha === requestedNewHeadSha &&
      (existing.invalidatedOldHeadSha === oldHeadSha || oldHeadSha === requestedNewHeadSha);
    evidence[kind] = existing
      ? {
          ...existing,
          stale: true,
          invalidatedBy: reasonCode,
          invalidatedAt: equivalentInvalidation ? existing.invalidatedAt : new Date().toISOString(),
          invalidatedOldHeadSha: equivalentInvalidation ? existing.invalidatedOldHeadSha : oldHeadSha,
          invalidatedNewHeadSha: requestedNewHeadSha,
        }
      : null;
  }
  return sanitizeRecoveryState({
    ...state,
    branch: { ...state.branch, currentHeadSha: newHeadSha || state.branch.currentHeadSha || null },
    evidence,
    nextSafeAction: "regenerate_exact_head_evidence",
  });
}

export function recoveryRequiresExactHeadEvidenceRegeneration(state) {
  if (!state) return { required: false, reasonCode: null, staleEvidenceKinds: [] };
  const staleEvidence = staleEvidenceKinds(state, state.branch?.currentHeadSha || null);
  const nextActionRequiresRegeneration = state.nextSafeAction === "regenerate_exact_head_evidence";
  return {
    required: nextActionRequiresRegeneration || staleEvidence.length > 0,
    reasonCode: "recovery_exact_head_evidence_regeneration_required",
    staleEvidenceKinds: staleEvidence,
    nextSafeAction: state.nextSafeAction || null,
  };
}

export function recordRecoveryAttempt(state, { outcomeClass, fingerprint, reasonCode, phase = state.phase }) {
  const classification = classifyRecoveryOutcome(outcomeClass, { reasonCode });
  const normalizedFingerprint = bounded(fingerprint || reasonCode || outcomeClass, 160);
  const attempts = [
    ...(state.attempts || []),
    {
      outcomeClass: classification.outcomeClass,
      reasonCode: classification.reasonCode,
      nextAction: classification.nextAction,
      fingerprint: normalizedFingerprint,
      phase,
      attemptedAt: new Date().toISOString(),
    },
  ].slice(-100);
  const budget = retryBudgetStatus({ ...state, attempts }, classification.outcomeClass, normalizedFingerprint);
  return sanitizeRecoveryState({
    ...state,
    attempts,
    stopReason: budget.exhausted
      ? { reasonCode: `${classification.outcomeClass}_budget_exhausted`, reason: bounded(normalizedFingerprint, 300) }
      : state.stopReason,
    nextSafeAction: budget.exhausted ? "create_or_reuse_followup_or_escalate" : classification.nextAction,
  });
}

export function retryBudgetStatus(state, outcomeClass, fingerprint) {
  const budget = state.retryBudgets?.[outcomeClass] ?? 0;
  const count = (state.attempts || []).filter(
    (attempt) => attempt.outcomeClass === outcomeClass && (!fingerprint || attempt.fingerprint === fingerprint),
  ).length;
  return {
    outcomeClass,
    fingerprint: fingerprint || null,
    budget,
    count,
    remaining: Math.max(0, budget - count),
    exhausted: count >= budget,
  };
}

export function recordIdempotentMutation(state, { kind, key, marker }) {
  if (!allowedMutationMarkerKinds.has(kind)) throw new Error(`Unknown idempotent mutation marker kind: ${kind}`);
  const markerKey = bounded(key || marker?.idempotencyKey || kind, 160);
  return sanitizeRecoveryState({
    ...state,
    mutationMarkers: {
      ...(state.mutationMarkers || {}),
      [kind]: {
        ...(state.mutationMarkers?.[kind] || {}),
        [markerKey]: {
          status: marker?.status || "completed",
          target: bounded(marker?.target || "", 240),
          completedAt: marker?.completedAt || new Date().toISOString(),
          correlation: bounded(marker?.correlation || "", 160),
        },
      },
    },
  });
}

export function recoveryHasMutationMarker(state, kind, key) {
  return Boolean(state.mutationMarkers?.[kind]?.[key]);
}

export function sanitizeRecoveryState(state) {
  return sanitizePersistedEvidence(state);
}

function validateRecoveryStateShape(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return invalid("state must be an object");
  if (state.stateVersion !== recoveryStateVersion) return invalid("unsupported recovery state version");
  for (const field of [
    "taskKey",
    "issue",
    "run",
    "branch",
    "pr",
    "phase",
    "firstIncompleteAction",
    "attempts",
    "retryBudgets",
    "evidence",
    "mutationMarkers",
    "timestamps",
  ]) {
    if (!(field in state)) return invalid(`missing field ${field}`);
  }
  if (!Number.isInteger(state.issue?.number)) return invalid("invalid issue number");
  if (!state.pr || typeof state.pr !== "object" || Array.isArray(state.pr)) return invalid("invalid recovery pr");
  const prPair = validateRecoveryPrIdentity(state.pr.number, state.pr.headSha);
  if (!prPair.ok) return invalid(prPair.reason);
  if (!state.branch || typeof state.branch !== "object") return invalid("invalid branch");
  if (!state.branch.name) return invalid("missing branch name");
  if (!isShaOrNull(state.branch.baseSha) || !isShaOrNull(state.branch.currentHeadSha)) return invalid("invalid branch sha");
  if (!recoveryPhases.includes(state.phase)) return invalid("invalid phase");
  if (!Array.isArray(state.attempts) || state.attempts.length > 100) return invalid("invalid attempts");
  for (const attempt of state.attempts) {
    if (!recoveryOutcomeClasses.includes(attempt.outcomeClass)) return invalid("invalid attempt outcome class");
  }
  if (!state.retryBudgets || typeof state.retryBudgets !== "object" || Array.isArray(state.retryBudgets)) {
    return invalid("invalid retry budgets");
  }
  for (const [key, value] of Object.entries(state.retryBudgets)) {
    if (!recoveryOutcomeClasses.includes(key) || !Number.isInteger(value) || value < 0 || value > 20) {
      return invalid(`invalid retry budget ${key}`);
    }
  }
  if (!state.evidence || typeof state.evidence !== "object" || Array.isArray(state.evidence)) return invalid("invalid evidence");
  if (state.outageResubmission !== undefined && state.outageResubmission !== null) {
    const binding = state.outageResubmission;
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) return invalid("invalid outage resubmission binding");
    if (!isDigest(binding.originalSupervisorSpecDigest)) return invalid("invalid outage resubmission spec digest");
    if (!isDigest(binding.markerKey)) return invalid("invalid outage resubmission marker key");
    if (!isDigest(binding.outageFingerprint)) return invalid("invalid outage resubmission fingerprint");
    if (!Number.isSafeInteger(binding.attemptNumber) || binding.attemptNumber < 1 || binding.attemptNumber > 20) return invalid("invalid outage resubmission attempt");
    if (binding.taskKey !== null && typeof binding.taskKey !== "string") return invalid("invalid outage resubmission task key");
    if (binding.issueNumber !== null && !Number.isSafeInteger(binding.issueNumber)) return invalid("invalid outage resubmission issue number");
    if (binding.branchName !== null && typeof binding.branchName !== "string") return invalid("invalid outage resubmission branch name");
    if (!isShaOrNull(binding.baseSha) || !isShaOrNull(binding.currentHeadSha)) return invalid("invalid outage resubmission branch sha");
    const prPair = validateAtomicPrIdentity(binding.prNumber, binding.prHeadSha);
    if (!prPair.ok) return invalid(prPair.reason);
    if (binding.runnerRunId !== null && typeof binding.runnerRunId !== "string") return invalid("invalid outage resubmission runner run id");
    if (binding.supervisorRunId !== null && typeof binding.supervisorRunId !== "string") return invalid("invalid outage resubmission supervisor run id");
    const identity = normalizeOutageBindingAuthoritativeIdentity(state);
    for (const field of [
      "taskKey",
      "issueNumber",
      "branchName",
      "baseSha",
      "currentHeadSha",
      "prNumber",
      "prHeadSha",
      "runnerRunId",
      "supervisorRunId",
    ]) {
      if (binding[field] !== identity[field]) return invalid("outage resubmission identity mismatch");
    }
  }
  return { ok: true };
}

function normalizeOutageResubmissionBinding(value) {
  if (!value) return null;
  return {
    taskKey: value.taskKey ? bounded(value.taskKey, 80) : null,
    issueNumber: Number.isSafeInteger(value.issueNumber) ? value.issueNumber : null,
    branchName: value.branchName ? bounded(value.branchName, 240) : null,
    baseSha: isShaOrNull(value.baseSha) ? value.baseSha : null,
    currentHeadSha: isShaOrNull(value.currentHeadSha) ? value.currentHeadSha : null,
    ...normalizeAtomicPrIdentity(value),
    runnerRunId: value.runnerRunId ? bounded(value.runnerRunId, 120) : null,
    supervisorRunId: value.supervisorRunId ? bounded(value.supervisorRunId, 120) : null,
    originalSupervisorSpecDigest: isDigest(value.originalSupervisorSpecDigest) ? value.originalSupervisorSpecDigest : null,
    markerKey: isDigest(value.markerKey) ? value.markerKey : null,
    outageFingerprint: isDigest(value.outageFingerprint) ? value.outageFingerprint : null,
    attemptNumber: Number.isSafeInteger(value.attemptNumber) ? value.attemptNumber : null,
  };
}

function emptyEvidenceBindings(headSha) {
  return Object.fromEntries(headBoundEvidenceKinds.map((kind) => [kind, null]));
}

function normalizePr(pr) {
  if (!pr) return { number: null, url: null, headSha: null, headRefName: null, baseRefName: null, state: null };
  return {
    number: Number.isInteger(pr.number) ? pr.number : null,
    url: pr.url || null,
    headSha: pr.headSha || pr.headRefOid || null,
    headRefName: pr.headRefName || null,
    baseRefName: pr.baseRefName || null,
    state: pr.state || null,
  };
}

function staleEvidenceKinds(state, currentHeadSha) {
  return headBoundEvidenceKinds.filter((kind) => {
    const evidence = state.evidence?.[kind];
    return Boolean(evidence && (evidence.stale || (evidence.headSha && currentHeadSha && evidence.headSha !== currentHeadSha)));
  });
}

export function digestChangedFiles(values) {
  return createHash("sha256").update(JSON.stringify(normalizeChangedFiles(values))).digest("hex");
}

function digestStringArray(values) {
  return digestChangedFiles(values);
}

function normalizeChangedFiles(values = []) {
  return [...new Set((values || []).map((value) => String(value || "")).filter(Boolean))].sort();
}

function isShaOrNull(value) {
  return value === null || /^[a-f0-9]{40}$/.test(String(value || ""));
}

function normalizeAtomicPrIdentity(value = {}) {
  const hasPrNumber = Object.hasOwn(value, "prNumber");
  const hasPrHeadSha = Object.hasOwn(value, "prHeadSha");
  if (!hasPrNumber && !hasPrHeadSha) return { prNumber: null, prHeadSha: null };
  if (hasPrNumber !== hasPrHeadSha) return { prNumber: "__invalid_pr_pair__", prHeadSha: "__invalid_pr_pair__" };
  if (value.prNumber === null && value.prHeadSha === null) return { prNumber: null, prHeadSha: null };
  if (Number.isSafeInteger(value.prNumber) && value.prNumber >= 1 && value.prNumber <= 9999999 && isSha(value.prHeadSha)) {
    return { prNumber: value.prNumber, prHeadSha: value.prHeadSha };
  }
  return { prNumber: "__invalid_pr_pair__", prHeadSha: "__invalid_pr_pair__" };
}

function validateAtomicPrIdentity(prNumber, prHeadSha) {
  if ((prNumber === null) !== (prHeadSha === null)) return invalid("outage resubmission pr identity must be paired");
  if (prNumber === null && prHeadSha === null) return { ok: true };
  if (!Number.isSafeInteger(prNumber) || prNumber < 1 || prNumber > 9999999) return invalid("invalid outage resubmission pr number");
  if (!isSha(prHeadSha)) return invalid("invalid outage resubmission pr head");
  return { ok: true };
}

function validateRecoveryPrIdentity(prNumber, prHeadSha) {
  if ((prNumber === null) !== (prHeadSha === null)) return invalid("recovery pr identity must be paired");
  if (prNumber === null && prHeadSha === null) return { ok: true };
  if (!Number.isSafeInteger(prNumber) || prNumber < 1 || prNumber > 9999999) return invalid("invalid recovery pr number");
  if (!isSha(prHeadSha)) return invalid("invalid recovery pr head");
  return { ok: true };
}

function isSha(value) {
  return /^[a-f0-9]{40}$/.test(String(value || ""));
}

function isDigest(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function bounded(value, max) {
  return String(value || "").slice(0, max);
}

function invalid(reason) {
  return { ok: false, reason };
}

function failed(reasonCode, reason, extra = {}) {
  return { ok: false, reasonCode, reason, ...extra };
}
