import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
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
  return readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(root, name))
    .map((statePath) => {
      try {
        const parsed = JSON.parse(readFileSync(statePath, "utf8"));
        const validation = validateRecoveryStateShape(parsed);
        if (!validation.ok) return null;
        if (["completed", "stopped"].includes(parsed.phase)) return null;
        return sanitizeRecoveryState({ ...parsed, statePath });
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(left.timestamps?.updatedAt || "").localeCompare(String(right.timestamps?.updatedAt || "")));
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
  return sanitizeRecoveryState({
    ...state,
    evidence: {
      ...state.evidence,
      [kind]: sanitizeRecoveryState({
        status: evidence?.status || (evidence?.passed === true ? "passed" : "recorded"),
        headSha,
        baseSha: evidence?.baseSha || state.branch.baseSha || null,
        changedFilesDigest: evidence?.changedFilesDigest || digestStringArray(evidence?.changedFiles || []),
        evidencePath: evidence?.evidencePath || evidence?.reportPath || evidence?.path || null,
        completedAt: evidence?.completedAt || new Date().toISOString(),
        stale: false,
        summary: bounded(evidence?.summary || evidence?.reason || "", 500),
      }),
    },
  });
}

export function invalidateEvidenceForHeadChange(state, { newHeadSha, reasonCode = "head_changed" }) {
  const oldHeadSha = state.branch.currentHeadSha || null;
  const evidence = {};
  for (const kind of headBoundEvidenceKinds) {
    const existing = state.evidence?.[kind] || null;
    evidence[kind] = existing
      ? {
          ...existing,
          stale: true,
          invalidatedBy: reasonCode,
          invalidatedAt: new Date().toISOString(),
          invalidatedOldHeadSha: oldHeadSha,
          invalidatedNewHeadSha: newHeadSha || null,
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
  return { ok: true };
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

function digestStringArray(values) {
  return createHash("sha256").update(JSON.stringify([...new Set(values || [])].sort())).digest("hex");
}

function isShaOrNull(value) {
  return value === null || /^[a-f0-9]{40}$/.test(String(value || ""));
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
