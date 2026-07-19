import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";

export const reviewConvergenceStateVersion = 1;
export const reviewConvergenceTerminalReasons = Object.freeze([
  "REVIEW_CONVERGED",
  "MANUAL_DECISION_REQUIRED",
  "NO_PROGRESS",
  "REVIEW_OSCILLATION",
  "CYCLE_BUDGET_EXHAUSTED",
  "VALIDATION_BLOCKED",
  "REVIEW_PROVIDER_BLOCKED",
  "CI_OR_SCANNER_BLOCKED",
  "UNSAFE_SCOPE_CHANGE",
]);

export const headBoundConvergenceEvidenceKinds = Object.freeze([
  "validation",
  "review",
  "ci",
  "scanner",
  "merge",
]);

export function reviewConvergenceStorageKey(input = {}) {
  if (typeof input.convergenceId === "string" && input.convergenceId) return input.convergenceId;
  return createHash("sha256")
    .update(JSON.stringify({
      stackId: input.stackId || null,
      repository: input.repository || null,
      issueNumber: input.issue?.number ?? input.issueNumber ?? null,
      prNumber: input.pr?.number ?? input.prNumber ?? null,
      branchName: input.pr?.headRefName ?? input.branch?.name ?? input.branchName ?? null,
      baseRef: input.pr?.baseRefName ?? input.branch?.baseRef ?? input.baseRef ?? null,
    }))
    .digest("hex");
}

export function reviewConvergenceStatePath(config, keyOrState) {
  const key = typeof keyOrState === "string" ? keyOrState : reviewConvergenceStorageKey(keyOrState);
  return path.join(config.logsRoot, "review-convergence", `${key}.json`);
}

export function createInitialReviewConvergenceState(input = {}) {
  const now = new Date().toISOString();
  const head = input.exactHead || input.pr?.headSha || input.pr?.headRefOid || null;
  const state = sanitizeState({
    stateVersion: reviewConvergenceStateVersion,
    stackId: bounded(input.stackId || null, 160),
    convergenceId: bounded(input.convergenceId || reviewConvergenceStorageKey(input), 160),
    task: {
      taskKey: bounded(input.taskKey || null, 120),
      issueNumber: input.issue?.number ?? input.issueNumber ?? null,
      issueTitle: bounded(input.issue?.title || "", 240),
    },
    repository: bounded(input.repository || "tommytang213/Settleora", 240),
    pr: {
      number: input.pr?.number ?? input.prNumber ?? null,
      branch: bounded(input.pr?.headRefName || input.branchName || input.branch?.name || "", 240),
      base: bounded(input.pr?.baseRefName || input.baseRef || input.branch?.baseRef || "main", 240),
      exactHead: head,
    },
    epoch: Number.isInteger(input.epoch) ? input.epoch : 1,
    sourceChangingCycle: Number.isInteger(input.sourceChangingCycle) ? input.sourceChangingCycle : 0,
    findingInventory: [],
    evidence: emptyEvidence(head),
    reviewRequests: {},
    mutationMarkers: {},
    relationships: {
      parentPr: input.parentPr ?? null,
      dependentPrs: Array.isArray(input.dependentPrs) ? input.dependentPrs.slice(0, 20) : [],
    },
    phase: input.phase || "initialized",
    terminalReason: null,
    summaries: [],
    timestamps: { createdAt: now, updatedAt: now },
  });
  const validation = validateReviewConvergenceState(state);
  if (!validation.ok) throw new Error(`Invalid review convergence state: ${validation.reason}`);
  return state;
}

export function normalizeReviewConvergenceStateIdentity(input = {}) {
  const existing = input.reviewConvergenceState || input.convergenceState || input.state || {};
  const pr = {
    number: input.pr?.number ?? input.prNumber ?? existing.pr?.number ?? null,
    headRefName: input.pr?.headRefName ?? input.pr?.branch ?? input.branchName ?? input.branch?.name ?? existing.pr?.branch ?? "",
    baseRefName: input.pr?.baseRefName ?? input.pr?.base ?? input.baseRef ?? input.branch?.baseRef ?? existing.pr?.base ?? "main",
    headRefOid:
      input.exactHead ||
      input.expectedHeadSha ||
      input.actualHeadSha ||
      input.runnerCreatedCommitSha ||
      input.pr?.exactHead ||
      input.pr?.headSha ||
      input.pr?.headRefOid ||
      existing.pr?.exactHead ||
      null,
  };
  const repository = input.repository || existing.repository || input.config?.repositorySlug || "tommytang213/Settleora";
  const issue = input.issue || existing.task || {};
  const canonicalConvergenceId = reviewConvergenceStorageKey({
    stackId: input.stackId || existing.stackId || null,
    repository,
    issueNumber: input.issueNumber ?? existing.task?.issueNumber ?? issue.number ?? null,
    prNumber: pr.number,
    branchName: pr.headRefName,
    baseRef: pr.baseRefName,
  });
  if (existing.convergenceId && existing.convergenceId !== canonicalConvergenceId) {
    throw new Error("Invalid review convergence state: convergence_identity_mismatch");
  }
  const initial = createInitialReviewConvergenceState({
    stackId: input.stackId || existing.stackId || null,
    convergenceId: canonicalConvergenceId,
    repository,
    issue,
    issueNumber: input.issueNumber ?? existing.task?.issueNumber ?? issue.number ?? null,
    taskKey: input.taskKey || existing.task?.taskKey || input.promptInfo?.timestampKey || null,
    pr,
    branchName: pr.headRefName,
    baseRef: pr.baseRefName,
    exactHead: pr.headRefOid,
    epoch: Number.isInteger(existing.epoch) ? existing.epoch : input.epoch,
    sourceChangingCycle: Number.isInteger(input.sourceChangingCycle)
      ? input.sourceChangingCycle
      : Number.isInteger(existing.sourceChangingCycle)
        ? existing.sourceChangingCycle
        : 0,
    parentPr: input.parentPr ?? existing.relationships?.parentPr ?? null,
    dependentPrs: input.dependentPrs ?? existing.relationships?.dependentPrs ?? [],
    phase: input.phase || existing.phase || "initialized",
  });
  const normalized = {
    ...initial,
    ...existing,
    stateVersion: initial.stateVersion,
    stackId: existing.stackId || initial.stackId,
    convergenceId: existing.convergenceId || initial.convergenceId,
    repository: initial.repository,
    task: {
      ...initial.task,
      ...(existing.task || {}),
      issueNumber: initial.task.issueNumber,
      issueTitle: initial.task.issueTitle || existing.task?.issueTitle || "",
      taskKey: initial.task.taskKey || existing.task?.taskKey || null,
    },
    pr: {
      ...(existing.pr || {}),
      ...initial.pr,
    },
    branch: {
      ...(existing.branch || {}),
      name: initial.pr.branch,
      baseRef: initial.pr.base,
      exactHead: initial.pr.exactHead,
    },
    epoch: initial.epoch,
    sourceChangingCycle: initial.sourceChangingCycle,
    findingInventory: Array.isArray(input.findingInventory)
      ? input.findingInventory
      : Array.isArray(existing.findingInventory)
        ? existing.findingInventory
        : initial.findingInventory,
    evidence: input.evidence || existing.evidence || initial.evidence,
    reviewRequests: existing.reviewRequests || existing.githubReviewRequests || input.reviewRequests || initial.reviewRequests,
    mutationMarkers: existing.mutationMarkers || input.mutationMarkers || initial.mutationMarkers,
    relationships: {
      ...(initial.relationships || {}),
      ...(existing.relationships || {}),
      ...(input.relationships || {}),
    },
    timestamps: existing.timestamps || initial.timestamps,
  };
  const validation = validateReviewConvergenceState(normalized);
  if (!validation.ok) throw new Error(`Invalid review convergence state: ${validation.reason}`);
  return sanitizeState(normalized);
}

export function writeReviewConvergenceState(config, state) {
  const validation = validateReviewConvergenceState(state);
  if (!validation.ok) throw new Error(`Invalid review convergence state: ${validation.reason}`);
  const statePath = reviewConvergenceStatePath(config, state);
  mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  const sanitized = sanitizeState({ ...state, timestamps: { ...(state.timestamps || {}), updatedAt: new Date().toISOString() } });
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, statePath);
  return { statePath, state: sanitized };
}

export function loadReviewConvergenceState(config, keyOrState) {
  const statePath = reviewConvergenceStatePath(config, keyOrState);
  if (!existsSync(statePath)) return { ok: false, reasonCode: "review_convergence_state_missing", statePath };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return { ok: false, reasonCode: "review_convergence_state_corrupt", statePath };
  }
  const validation = validateReviewConvergenceState(parsed);
  if (!validation.ok) return { ok: false, reasonCode: "review_convergence_state_schema_invalid", reason: validation.reason, statePath };
  const identity = expectedIdentity(keyOrState);
  const mismatch = identityMismatch(parsed, identity);
  if (mismatch) return { ok: false, reasonCode: "review_convergence_state_identity_mismatch", reason: mismatch, statePath };
  return { ok: true, state: sanitizeState(parsed), statePath };
}

export function bindReviewConvergenceEvidence(state, kind, evidence = {}) {
  if (!headBoundConvergenceEvidenceKinds.includes(kind)) throw new Error(`Unknown convergence evidence kind: ${kind}`);
  const currentHead = state.pr?.exactHead || null;
  const evidenceHead = evidence.exactHead || currentHead;
  const stale = Boolean(currentHead && evidenceHead && evidenceHead !== currentHead);
  return sanitizeState({
    ...state,
    evidence: {
      ...(state.evidence || {}),
      [kind]: {
        status: evidence.status || "recorded",
        exactHead: evidenceHead,
        digest: evidence.digest || digestJson(evidence),
        recordedAt: evidence.recordedAt || new Date().toISOString(),
        stale,
        ...(stale ? { staleReason: "evidence_head_mismatch", currentHead } : {}),
      },
    },
  });
}

export function invalidateConvergenceEvidenceForHead(state, newHead, reasonCode = "head_changed") {
  const previousHead = state.pr?.exactHead || null;
  const evidence = {};
  for (const kind of headBoundConvergenceEvidenceKinds) {
    const current = state.evidence?.[kind] || null;
    evidence[kind] = current
      ? { ...current, stale: true, invalidatedOldHead: previousHead, invalidatedNewHead: newHead, invalidatedReason: reasonCode }
      : emptyEvidence(newHead)[kind];
  }
  return sanitizeState({
    ...state,
    pr: { ...(state.pr || {}), exactHead: newHead },
    evidence,
    phase: "evidence_invalidated",
  });
}

export function recordReviewRequestDedupe(state, { prNumber, exactHead, purpose, reviewerTier }) {
  const key = reviewRequestKey({ prNumber, exactHead, purpose, reviewerTier });
  if (state.reviewRequests?.[key]) return { state, duplicate: true, key };
  return {
    duplicate: false,
    key,
    state: sanitizeState({
      ...state,
      reviewRequests: {
        ...(state.reviewRequests || {}),
        [key]: { prNumber, exactHead, purpose, reviewerTier, requestedAt: new Date().toISOString() },
      },
    }),
  };
}

export function recordConvergenceMutationMarker(state, { kind, key, exactHead, metadata = {} }) {
  const markerKey = `${kind}:${key}`;
  if (state.mutationMarkers?.[markerKey]) return { state, duplicate: true, markerKey };
  return {
    duplicate: false,
    markerKey,
    state: sanitizeState({
      ...state,
      mutationMarkers: {
        ...(state.mutationMarkers || {}),
        [markerKey]: { kind, key, exactHead: exactHead || state.pr?.exactHead || null, digest: digestJson(metadata), recordedAt: new Date().toISOString() },
      },
    }),
  };
}

export function validateDiagnosticReviewFixAuthorization(input = {}) {
  const state = input.reviewConvergenceState || input.state || {};
  const authorization = input.diagnosticAuthorization || input.authorization || {};
  const normalizedMax = Number(input.normalizedMax ?? input.maxAttempts ?? input.budget?.normalized);
  const attemptCount = Number(input.attemptCount ?? state.sourceChangingCycle);
  const diagnostic = state.diagnosticReviewFix || {};
  const pr = state.pr || {};
  const mismatches = [];
  if (authorization?.kind !== "diagnostic_review_fix_authorization") mismatches.push("kind");
  if (!state.convergenceId || authorization.convergenceId !== state.convergenceId) mismatches.push("convergence_id");
  if (!Number.isInteger(state.epoch) || authorization.epoch !== state.epoch) mismatches.push("epoch");
  if (!Number.isInteger(pr.number) || authorization.prNumber !== pr.number) mismatches.push("pr_number");
  if (!pr.exactHead || authorization.exactHead !== pr.exactHead) mismatches.push("exact_head");
  if (!Number.isFinite(normalizedMax) || normalizedMax !== authorization.normalizedMax) mismatches.push("normalized_max");
  if (authorization.sourceChangingCycle !== normalizedMax) mismatches.push("authorization_source_cycle");
  if (!Number.isFinite(attemptCount) || attemptCount !== normalizedMax || state.sourceChangingCycle !== normalizedMax) mismatches.push("source_cycle");
  if (diagnostic.status !== "pending") mismatches.push("diagnostic_status");
  if (!diagnostic.startedAt) mismatches.push("diagnostic_started_marker");
  if (!diagnostic.attemptId || authorization.attemptId !== diagnostic.attemptId) mismatches.push("attempt_id");
  if (diagnostic.consumedAt || diagnostic.consumedHead) mismatches.push("diagnostic_consumed");
  if (diagnostic.terminalAt || diagnostic.terminalReason) mismatches.push("diagnostic_terminal");
  if (authorization.decision !== "start_diagnostic_epoch") mismatches.push("decision");
  if (mismatches.length > 0) return { ok: false, reason: `invalid_diagnostic_authorization:${mismatches.join(",")}` };
  return {
    ok: true,
    reason: "diagnostic_authorization_valid",
    diagnostic: true,
    attemptId: diagnostic.attemptId,
  };
}

export function validateReviewConvergenceState(state) {
  if (!state || typeof state !== "object") return fail("state_missing");
  if (state.stateVersion !== reviewConvergenceStateVersion) return fail("unsupported_state_version");
  if (!state.convergenceId || !state.repository || !state.pr || !Number.isInteger(state.pr.number)) return fail("identity_missing");
  if (!state.pr.branch || !state.pr.base || !state.pr.exactHead) return fail("pr_identity_missing");
  if (!Number.isInteger(state.epoch) || state.epoch < 1) return fail("epoch_invalid");
  if (!Number.isInteger(state.sourceChangingCycle) || state.sourceChangingCycle < 0) return fail("source_cycle_invalid");
  if (!state.evidence || typeof state.evidence !== "object") return fail("evidence_missing");
  if (state.terminalReason && !reviewConvergenceTerminalReasons.includes(state.terminalReason)) return fail("terminal_reason_invalid");
  return { ok: true };
}

function emptyEvidence(exactHead) {
  return Object.fromEntries(headBoundConvergenceEvidenceKinds.map((kind) => [kind, { status: "missing", exactHead, stale: false }]));
}

function reviewRequestKey({ prNumber, exactHead, purpose, reviewerTier }) {
  return digestJson({ prNumber, exactHead, purpose, reviewerTier });
}

function sanitizeState(state) {
  return sanitizePersistedEvidence(state);
}

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value || {})).digest("hex");
}

function expectedIdentity(input) {
  if (!input || typeof input !== "object") return null;
  return {
    repository: input.repository || null,
    issueNumber: input.issue?.number ?? input.issueNumber ?? null,
    prNumber: input.pr?.number ?? input.prNumber ?? null,
    branchName: input.pr?.headRefName ?? input.branch?.name ?? input.branchName ?? null,
    baseRef: input.pr?.baseRefName ?? input.branch?.baseRef ?? input.baseRef ?? null,
  };
}

function identityMismatch(state, identity) {
  if (!identity) return null;
  const actual = {
    repository: state.repository || null,
    issueNumber: state.task?.issueNumber ?? null,
    prNumber: state.pr?.number ?? null,
    branchName: state.pr?.branch || null,
    baseRef: state.pr?.base || null,
  };
  for (const [key, expected] of Object.entries(identity)) {
    if (expected !== null && expected !== undefined && actual[key] !== expected) return key;
  }
  return null;
}

function bounded(value, max) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, max);
}

function fail(reason) {
  return { ok: false, reason };
}
