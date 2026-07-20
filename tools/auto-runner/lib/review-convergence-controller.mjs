import { createHash } from "node:crypto";
import {
  defaultNoProgressSourceCycles,
  hardMaxReviewFixSourceCycles,
  normalizeReviewFixMutationConfig,
  redactSecretLikeText,
  sanitizeStructuredReviewFinding,
  sanitizeStructuredReviewFindings,
} from "./review-fix-policy.mjs";
import {
  invalidateConvergenceEvidenceForHead,
  normalizeReviewConvergenceStateIdentity,
  recordReviewRequestDedupe,
  validateDiagnosticReviewFixAuthorization,
} from "./review-convergence-state.mjs";
import { filterForbiddenChangedFiles } from "./lane-policy.mjs";

export function buildLiveReviewConvergenceContext(input = {}) {
  const config = input.config || {};
  const existing = input.reviewConvergenceState || input.convergenceState || null;
  const issue = normalizeIssue(input.issue || existing?.task || {});
  const pr = normalizePr({
    ...(existing?.pr || {}),
    ...(input.pr || {}),
    number: input.pr?.number ?? input.prNumber ?? existing?.pr?.number ?? input.existingPrNumber ?? issue.number ?? null,
    branch:
      input.pr?.branch ||
      input.pr?.headRefName ||
      input.branchName ||
      existing?.pr?.branch ||
      input.branch?.name ||
      "",
    base:
      input.pr?.base ||
      input.pr?.baseRefName ||
      input.baseRef ||
      existing?.pr?.base ||
      input.branch?.baseRef ||
      "main",
    exactHead:
      input.exactHead ||
      input.expectedHeadSha ||
      input.actualHeadSha ||
      input.runnerCreatedCommitSha ||
      input.pr?.exactHead ||
      input.pr?.headSha ||
      input.pr?.headRefOid ||
      existing?.pr?.exactHead ||
      null,
  });
  const attempts = Array.isArray(input.reviewFixAttempts) ? input.reviewFixAttempts : [];
  const sourceChangingCycle =
    numberOrNull(existing?.sourceChangingCycle) ??
    numberOrNull(input.sourceChangingCycle) ??
    attempts.filter((attempt) => attempt?.proceeded).length;
  const history = Array.isArray(input.reviewConvergenceHistory)
    ? input.reviewConvergenceHistory.map(normalizeHistoryEntry)
    : attempts.map((attempt) => ({
        findingFingerprints: normalizeFindingFingerprints(
          attempt?.decision?.sanitizedFindings ||
            attempt?.trigger?.findings ||
            attempt?.evidence?.sanitizedFindings ||
            [],
        ),
        claimedFixedFingerprints: normalizeFindingFingerprints(attempt?.claimedFixedFingerprints || attempt?.fixedFindingFingerprints || []),
        exactHead: attempt?.exactHead || attempt?.commit?.sha || attempt?.headShaAfter || null,
        patchId: trustedPatchIdFromAttempt(attempt),
        treeId: attempt?.treeId || null,
        patchIdReason: attempt?.patchIdReason || null,
      })).map(normalizeHistoryEntry);
  const findingInventory = Array.isArray(input.currentFindings)
    ? freezeMaterialFindingInventory(input.currentFindings)
    : Array.isArray(existing?.findingInventory)
      ? sanitizeFrozenFindingInventory(existing.findingInventory)
      : [];
  const context = {
    stateVersion: existing?.stateVersion || 1,
    repository: input.repository || existing?.repository || config.repositorySlug || "tommytang213/Settleora",
    task: {
      taskKey: input.taskKey || existing?.task?.taskKey || input.promptInfo?.timestampKey || null,
      issueNumber: issue.number,
      issueTitle: issue.title,
    },
    issue,
    pr,
    branch: {
      name: pr.branch,
      baseRef: pr.base,
      exactHead: pr.exactHead,
    },
    epoch: numberOrNull(existing?.epoch) ?? numberOrNull(input.epoch) ?? 1,
    sourceChangingCycle,
    findingInventory,
    evidence: staleEvidenceForHead(existing?.evidence || {}, pr.exactHead),
    reviewRequests: existing?.reviewRequests || existing?.githubReviewRequests || input.reviewRequests || {},
    mutationMarkers: existing?.mutationMarkers || input.mutationMarkers || {},
    relationships: {
      ...(existing?.relationships || {}),
      ...(input.relationships || {}),
    },
    history,
    exactHeadEvidence: input.exactHeadEvidence || existing?.exactHeadEvidence || {},
    requestDedupeMarkers: existing?.reviewRequests || existing?.githubReviewRequests || input.requestDedupeMarkers || {},
    mutationDedupeMarkers: existing?.mutationMarkers || input.mutationDedupeMarkers || {},
  };
  const reviewConvergenceState = normalizeReviewConvergenceStateIdentity({
    ...input,
    config,
    repository: context.repository,
    issue,
    issueNumber: issue.number,
    taskKey: context.task.taskKey,
    pr: {
      number: pr.number,
      headRefName: pr.branch,
      baseRefName: pr.base,
      headRefOid: pr.exactHead,
    },
    branchName: pr.branch,
    baseRef: pr.base,
    exactHead: pr.exactHead,
    sourceChangingCycle: context.sourceChangingCycle,
    reviewConvergenceState: {
      ...(existing || {}),
      stateVersion: context.stateVersion,
      repository: context.repository,
      task: context.task,
      pr: context.pr,
      branch: context.branch,
      epoch: context.epoch,
      epochDiagnosticStarted: existing?.epochDiagnosticStarted === true || input.epochDiagnosticStarted === true,
      sourceChangingCycle: context.sourceChangingCycle,
      findingInventory: context.findingInventory,
      evidence: context.evidence,
      reviewRequests: context.reviewRequests,
      mutationMarkers: context.mutationMarkers,
      relationships: context.relationships,
    },
  });
  const normalizedContext = {
    ...context,
    convergenceId: reviewConvergenceState.convergenceId,
  };
  return {
    context: normalizedContext,
    gateInput: {
      config,
      reviewConvergenceState,
      reviewConvergenceHistory: history,
      reviewConvergenceContext: normalizedContext,
    },
  };
}

export function normalizeConvergenceBudget(config = {}) {
  const reviewFix = normalizeReviewFixMutationConfig({ ...config, allowReviewFixMutation: config.allowReviewFixMutation ?? true, configPath: config.configPath ?? "contract.json" });
  return {
    requested: reviewFix.requestedMaxSourceChangingCycles,
    normalized: reviewFix.maxSourceChangingCycles,
    hardMaximum: hardMaxReviewFixSourceCycles,
    enabled: reviewFix.maxSourceChangingCycles > 0,
    malformed: reviewFix.malformed,
    policy: reviewFix.overHardMaxPolicy,
  };
}

export function fingerprintReviewFinding(finding = {}) {
  const sanitized = sanitizeStructuredReviewFinding(finding) || {};
  const normalized = {
    provider: scrub(sanitized.provider || sanitized.source || "unknown"),
    severity: normalizeSeverity(sanitized.severity),
    path: normalizePath(sanitized.path || sanitized.file || ""),
    location: stableLocation(sanitized) || normalizeText(sanitized.location || ""),
    title: normalizeText(sanitized.title || sanitized.message || ""),
    body: normalizeText(sanitized.body || sanitized.details || ""),
    ruleId: scrub(sanitized.ruleId || sanitized.rule || sanitized.check || ""),
    authorityInvariant: scrub(sanitized.authorityInvariant || sanitized.invariant || ""),
  };
  return {
    ...normalized,
    fingerprint: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
  };
}

export function markDiagnosticReviewFixTerminal(state, reason = "diagnostic_fix_not_proceeded") {
  const diagnostic = state?.diagnosticReviewFix || null;
  if (!diagnostic || diagnostic.status !== "pending") return state;
  return {
    ...state,
    diagnosticReviewFix: {
      ...diagnostic,
      status: "terminal",
      terminalReason: scrub(reason).slice(0, 160),
      terminalAt: new Date().toISOString(),
    },
  };
}

export function freezeMaterialFindingInventory(findings = []) {
  const seen = new Set();
  return findings
    .map((finding) => sanitizeStructuredReviewFinding(finding))
    .filter(Boolean)
    .map((finding) => ({ classified: classifyFinding(finding), fingerprint: fingerprintReviewFinding(finding) }))
    .filter((entry) => entry.classified.material)
    .sort((a, b) => a.fingerprint.fingerprint.localeCompare(b.fingerprint.fingerprint))
    .filter((entry) => {
      if (seen.has(entry.fingerprint.fingerprint)) return false;
      seen.add(entry.fingerprint.fingerprint);
      return true;
    })
    .map((entry) => ({
      classification: entry.classified.classification,
      fingerprint: entry.fingerprint.fingerprint,
      provider: entry.fingerprint.provider,
      severity: entry.fingerprint.severity,
      path: entry.fingerprint.path,
      location: entry.fingerprint.location,
      title: entry.fingerprint.title,
      body: entry.fingerprint.body,
      ruleId: entry.fingerprint.ruleId,
      authorityInvariant: entry.fingerprint.authorityInvariant,
    }));
}

export function reviewFindingFingerprintsFromSupportedContainers({ externalReview, review } = {}) {
  const fingerprints = freezeMaterialFindingInventory(
    reviewFindingsFromSupportedContainers({ externalReview, review }),
  ).map((finding) => finding.fingerprint);
  return [...new Set(fingerprints)].sort();
}

export function claimedReviewFindingFingerprints({ fixAttempt, externalReview, review, source } = {}) {
  const findings = fixAttempt?.decision?.sanitizedFindings || fixAttempt?.trigger?.findings || [];
  if (!Array.isArray(findings) || findings.length === 0) return [];
  const trigger = fixAttempt?.decision?.trigger || fixAttempt?.trigger || { source };
  const identity = canonicalClaimedFindingIdentity({ trigger, source, externalReview, review });
  if (!identity.ok) return [];
  return normalizeFindingFingerprints(findings.map((finding) => normalizeReviewFindingForFingerprint(finding, identity.defaults)));
}

export function reviewFindingsFromSupportedContainers({ externalReview, review } = {}) {
  return [
    ...externalReviewFindingsFromSupportedContainers(externalReview),
    ...codexReviewFindingsFromSupportedContainers(review),
  ];
}

export function classifyFinding(finding = {}) {
  if (finding.manual === true || finding.classification === "manual") {
    return { material: true, safelyFixable: false, classification: "manual", terminalReason: "MANUAL_DECISION_REQUIRED" };
  }
  if (finding.duplicate === true || finding.classification === "duplicate") {
    return { material: false, safelyFixable: false, classification: "duplicate" };
  }
  if (finding.material === false || finding.classification === "non_material") {
    return { material: false, safelyFixable: false, classification: "non_material" };
  }
  return { material: true, safelyFixable: finding.safelyFixable !== false, classification: "material_safely_fixable" };
}

export function accountConvergenceEvent(state, event = {}) {
  if (event.kind !== "source_changed") {
    return { state, consumedSourceCycle: false, reason: "transient_or_wait_event" };
  }
  const newHead = event.newHead || null;
  if (!newHead || newHead === state.pr?.exactHead) {
    return { state, consumedSourceCycle: false, reason: "unchanged_head" };
  }
  const diagnostic = state.diagnosticReviewFix?.status === "pending"
    ? {
        ...state.diagnosticReviewFix,
        status: "consumed",
        consumedAt: new Date().toISOString(),
        consumedHead: newHead,
      }
    : state.diagnosticReviewFix;
  return {
    consumedSourceCycle: true,
    reason: "source_changing_exact_head",
    state: {
      ...invalidateConvergenceEvidenceForHead(state, newHead, event.reasonCode || "source_changed"),
      sourceChangingCycle: state.sourceChangingCycle + 1,
      counters: {
        ...(state.counters || {}),
        localSourceChangingRoundsPerEpoch: (state.counters?.localSourceChangingRoundsPerEpoch || 0) + 1,
        lifetimeLocalSourceChangingRounds: (state.counters?.lifetimeLocalSourceChangingRounds || 0) + 1,
      },
      loopPhase: "local_validation",
      diagnosticReviewFix: diagnostic,
    },
  };
}

export const localSourceChangingRoundsPerEpochLimit = 50;
export const githubTriggeredFixEpochsPerPrLimit = 50;

export function accountGithubTriggeredFixEpoch(state, input = {}) {
  const fingerprints = [...new Set((input.findingFingerprints || []).filter((value) => /^[0-9a-f]{64}$/i.test(value)))].sort();
  if (!Number.isInteger(state.pr?.number) || !state.pr?.exactHead || fingerprints.length === 0) {
    return { ok: false, reasonCode: "github_fix_epoch_identity_invalid", state };
  }
  const markerKey = digestFindingSet([String(state.pr.number), state.pr.exactHead, ...fingerprints]);
  if (state.counterMarkers?.[markerKey]) return { ok: true, duplicate: true, incremented: false, markerKey, state };
  const current = state.counters?.githubTriggeredFixEpochsPerPr || 0;
  if (current >= githubTriggeredFixEpochsPerPrLimit) {
    return terminalLimit(state, "GITHUB_TRIGGERED_FIX_EPOCH_LIMIT_EXHAUSTED", githubTriggeredFixEpochsPerPrLimit);
  }
  const nextEpoch = state.epoch + 1;
  return {
    ok: true,
    duplicate: false,
    incremented: true,
    markerKey,
    state: {
      ...state,
      epoch: nextEpoch,
      counters: {
        ...(state.counters || {}),
        localSourceChangingRoundsPerEpoch: 0,
        githubTriggeredFixEpochsPerPr: current + 1,
      },
      counterMarkers: {
        ...(state.counterMarkers || {}),
        [markerKey]: { kind: "github_triggered_fix_epoch", prNumber: state.pr.number, exactHead: state.pr.exactHead, findingDigest: digestFindingSet(fingerprints) },
      },
      loopPhase: "local_validation",
      evidence: staleEvidenceForHead(state.evidence || {}, state.pr.exactHead),
    },
  };
}

export function evaluateTwoLoopLimits(state, options = {}) {
  // In-memory callers created before the durable two-loop schema may still
  // carry only the legacy local source-cycle field. Durable loads migrate this
  // shape before validation; this fallback keeps non-persisted gate probes
  // compatible without reinterpreting a GitHub epoch count.
  const local = state.counters?.localSourceChangingRoundsPerEpoch ?? state.sourceChangingCycle;
  const github = state.counters?.githubTriggeredFixEpochsPerPr ?? 0;
  if (!Number.isSafeInteger(local) || !Number.isSafeInteger(github)) {
    return { ok: false, terminalReason: "COUNTER_STATE_INVALID", sanitizedReason: "authoritative nested counter state is invalid" };
  }
  if (local >= localSourceChangingRoundsPerEpochLimit) {
    return { ok: false, terminalReason: "LOCAL_SOURCE_CHANGING_ROUND_LIMIT_EXHAUSTED", sanitizedReason: "local source-changing round limit exhausted" };
  }
  if (github > githubTriggeredFixEpochsPerPrLimit || (!options.allowAdmittedGithubLimit && github >= githubTriggeredFixEpochsPerPrLimit)) {
    return { ok: false, terminalReason: "GITHUB_TRIGGERED_FIX_EPOCH_LIMIT_EXHAUSTED", sanitizedReason: "GitHub-triggered fix epoch limit exhausted" };
  }
  return { ok: true };
}

export function evaluateLocalConvergenceEvidence(state, input = {}) {
  const identity = input.candidateIdentity || {};
  const required = [input.validation, input.geminiReview, input.codexReview];
  if (!identity.exactHead || !identity.baseSha || !identity.changedFilesDigest) return { ok: false, reasonCode: "candidate_identity_incomplete" };
  for (const evidence of required) {
    if (!evidence || evidence.status !== "passed") return { ok: false, reasonCode: "local_convergence_evidence_not_passing" };
    if (evidence.exactHead !== identity.exactHead || evidence.baseSha !== identity.baseSha || evidence.changedFilesDigest !== identity.changedFilesDigest) {
      return { ok: false, reasonCode: "local_convergence_candidate_identity_mismatch" };
    }
    if (evidence.stale) return { ok: false, reasonCode: "local_convergence_evidence_stale" };
  }
  return { ok: true, exactHead: identity.exactHead, candidateIdentity: identity };
}

function terminalLimit(state, terminalReason, limit) {
  return { ok: false, reasonCode: terminalReason, terminalReason, sanitizedReason: "bounded convergence limit exhausted", limit, state: { ...state, terminalReason: "CYCLE_BUDGET_EXHAUSTED" } };
}

export function planExactHeadReviewRequest(state, request = {}) {
  const prNumber = request.prNumber || state.pr?.number;
  const exactHead = request.exactHead || state.pr?.exactHead;
  return recordReviewRequestDedupe(state, {
    prNumber,
    exactHead,
    purpose: request.purpose || "review_convergence",
    reviewerTier: request.reviewerTier || "cheap_independent",
  });
}

export function analyzeConvergenceProgress(history = [], options = {}) {
  const threshold = Math.max(Number(options.noProgressThreshold || defaultNoProgressSourceCycles), 3);
  const normalizedHistory = history.map(normalizeHistoryEntry);
  const recent = normalizedHistory.slice(-threshold);
  if (recent.length >= threshold && recent.every((item) => digestFindingSet(item.findingFingerprints) === digestFindingSet(recent[0].findingFingerprints))) {
    return { ok: false, terminalReason: "NO_PROGRESS", reason: "identical_material_finding_set_repeated", threshold };
  }
  const treeOrPatch = normalizedHistory.map(sourceIdentityForProgress).filter(Boolean);
  if (detectShortOscillation(treeOrPatch)) {
    return { ok: false, terminalReason: "REVIEW_OSCILLATION", reason: "patch_or_tree_identity_oscillation" };
  }
  const returned = detectReturnedFinding(normalizedHistory);
  if (returned) {
    return { ok: false, terminalReason: "NO_PROGRESS", reason: "finding_returned_after_claimed_fix", fingerprint: returned };
  }
  return { ok: true, reason: "progress_not_blocked" };
}

export function evaluateCycleBudget(state, config = {}, history = []) {
  const nestedLimit = evaluateTwoLoopLimits(state, { allowAdmittedGithubLimit: true });
  if (!nestedLimit.ok) {
    return { ok: false, terminalReason: "CYCLE_BUDGET_EXHAUSTED", reason: nestedLimit.terminalReason, nestedLimit };
  }
  const budget = normalizeConvergenceBudget(config);
  if (budget.malformed) return { ok: false, terminalReason: "MANUAL_DECISION_REQUIRED", reason: "review_fix_budget_malformed", budget };
  if (!budget.enabled) return { ok: false, terminalReason: "MANUAL_DECISION_REQUIRED", reason: "review_fix_mutation_disabled_by_zero_budget", budget };
  const progress = analyzeConvergenceProgress(history);
  if (!progress.ok) {
    return {
      ok: false,
      terminalReason: progress.terminalReason,
      reason: progress.reason,
      fingerprint: progress.fingerprint,
      threshold: progress.threshold,
      budget,
    };
  }
  if (state.sourceChangingCycle < budget.normalized) return { ok: true, budget };
  const diagnostic = state.diagnosticReviewFix || null;
  if (diagnostic?.status === "pending") {
    const authorization = diagnosticAuthorizationForState(state, budget, "resume_diagnostic_epoch");
    return authorization.ok
      ? { ok: true, reason: "resume_diagnostic_epoch", diagnosticEpoch: true, diagnosticAuthorization: authorization.authorization, budget }
      : { ok: false, terminalReason: "CYCLE_BUDGET_EXHAUSTED", reason: authorization.reason, budget };
  }
  if (diagnostic?.status === "consumed") return { ok: false, terminalReason: "CYCLE_BUDGET_EXHAUSTED", reason: "diagnostic_epoch_already_used", budget };
  if (diagnostic?.status === "terminal") return { ok: false, terminalReason: "CYCLE_BUDGET_EXHAUSTED", reason: "diagnostic_epoch_terminal", budget };
  if (state.epochDiagnosticStarted) return { ok: false, terminalReason: "CYCLE_BUDGET_EXHAUSTED", reason: "diagnostic_epoch_legacy_marker_without_pending_authorization", budget };
  const attemptId = diagnosticAttemptId(state, budget);
  const diagnosticReviewFix = {
    status: "pending",
    attemptId,
    convergenceId: state.convergenceId,
    epoch: state.epoch,
    prNumber: state.pr?.number ?? null,
    exactHead: state.pr?.exactHead || null,
    sourceChangingCycle: state.sourceChangingCycle,
    normalizedMax: budget.normalized,
    decision: "start_diagnostic_epoch",
    startedAt: new Date().toISOString(),
  };
  const transitionedState = {
    ...state,
    epochDiagnosticStarted: true,
    diagnosticEpochStartedAt: diagnosticReviewFix.startedAt,
    diagnosticReviewFix,
    phase: "diagnostic_epoch_started",
  };
  const authorization = diagnosticAuthorizationForState(transitionedState, budget, "start_diagnostic_epoch");
  return {
    ok: true,
    terminalReason: null,
    reason: "start_diagnostic_epoch",
    diagnosticEpoch: true,
    diagnosticAuthorization: authorization.authorization,
    transitionedState,
    budget,
  };
}

export function buildBatchFixTask({ issue, branchName, laneDecision, inventory }) {
  const safeInventory = sanitizeInventoryForBatch(inventory || []);
  const safeBranchName = redactSecretLikeText(branchName || "unknown").slice(0, 240);
  const safeAllowedPaths = (laneDecision?.allowedPaths || []).map((allowedPath) => redactSecretLikeText(allowedPath).slice(0, 240));
  return {
    title: `Batch review-fix for #${issue?.number || "unknown"}`,
    branchName: safeBranchName,
    allowedPaths: safeAllowedPaths,
    findingFingerprints: safeInventory.map((finding) => finding.fingerprint),
    prompt: [
      `Fix all current material review findings for #${issue?.number || "unknown"} in one focused batch.`,
      `Branch: ${safeBranchName}`,
      `Allowed paths: ${safeAllowedPaths.join(", ")}`,
      "Do not fix duplicate, non-material, stale-head, out-of-contract, or manual-decision findings.",
      ...safeInventory.map((finding) => `- ${batchPromptText(finding.severity, 40)} ${batchPromptText(finding.path, 512)} ${batchPromptText(finding.title, 800)} [${finding.fingerprint}]`),
    ].join("\n"),
  };
}

function batchPromptText(value, max) {
  return redactSecretLikeText(value).slice(0, max);
}

function sanitizeInventoryForBatch(inventory = []) {
  const seen = new Set();
  const entries = [];
  for (const finding of inventory) {
    if (typeof finding?.fingerprint === "string") {
      const safe = sanitizeStructuredReviewFinding(finding);
      if (!safe) continue;
      const classified = classifyFinding(safe);
      if (!classified.material) continue;
      const fingerprint = legacyFrozenFingerprint(finding, safe) || fingerprintReviewFinding(safe).fingerprint;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      entries.push({
        fingerprint,
        provider: scrub(safe.provider || safe.source || "unknown"),
        severity: normalizeSeverity(safe.severity),
        path: normalizePath(safe.path || safe.file || ""),
        title: normalizeText(safe.title || safe.message || ""),
        body: normalizeText(safe.body || safe.details || ""),
      });
      continue;
    }
    for (const frozen of freezeMaterialFindingInventory([finding])) {
      if (seen.has(frozen.fingerprint)) continue;
      seen.add(frozen.fingerprint);
      entries.push(frozen);
    }
  }
  return entries.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

function sanitizeFrozenFindingInventory(inventory = []) {
  const seen = new Set();
  const entries = [];
  for (const finding of inventory) {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) continue;
    const safe = sanitizeStructuredReviewFinding(finding);
    if (!safe) continue;
    if (Object.hasOwn(finding, "fingerprint") && !validFindingFingerprint(finding.fingerprint)) continue;
    const recomputed = fingerprintReviewFinding(safe);
    const fingerprint = legacyFrozenFingerprint(finding, safe) || recomputed.fingerprint;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const hasFrozenClassification = validFindingFingerprint(finding.fingerprint) && Object.hasOwn(finding, "classification");
    const frozenClassification = hasFrozenClassification ? materialFrozenClassification(finding.classification) : null;
    if (hasFrozenClassification && !frozenClassification) continue;
    const classified = frozenClassification
      ? { material: true, classification: frozenClassification }
      : classifyFinding(safe);
    if (!classified.material) continue;
    entries.push({
      classification: classified.classification,
      fingerprint,
      provider: recomputed.provider,
      severity: recomputed.severity,
      path: recomputed.path,
      location: recomputed.location,
      title: recomputed.title,
      body: recomputed.body,
      ruleId: recomputed.ruleId,
      authorityInvariant: recomputed.authorityInvariant,
    });
  }
  return entries.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

function validFindingFingerprint(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || ""));
}

function legacyFrozenFingerprint(finding, safe) {
  if (!validFindingFingerprint(finding?.fingerprint)) return null;
  if (Object.hasOwn(safe || {}, "body")) return null;
  return String(finding.fingerprint).toLowerCase();
}

function materialFrozenClassification(classification) {
  const normalized = scrub(classification).toLowerCase().trim().slice(0, 80);
  return normalized === "material_safely_fixable" ? normalized : null;
}

export function notificationDecisionForConvergence(event = {}) {
  if (event.kind === "cycle" || event.kind === "fix" || event.kind === "wait" || event.kind === "stack_transition") {
    return { notify: false, reason: "operator_spam_suppressed" };
  }
  if (["MANUAL_DECISION_REQUIRED", "UNSAFE_SCOPE_CHANGE", "NO_PROGRESS", "REVIEW_OSCILLATION", "CYCLE_BUDGET_EXHAUSTED"].includes(event.terminalReason)) {
    return { notify: true, dedupeKey: `terminal:${event.stackId || ""}:${event.prNumber || ""}:${event.terminalReason}`, reason: "bounded_terminal_notification" };
  }
  if (event.kind === "stack_complete") {
    return { notify: true, dedupeKey: `complete:${event.stackId || ""}`, reason: "final_stack_completion" };
  }
  return { notify: false, reason: "not_operator_relevant" };
}

export async function runExistingPrReviewConvergence(input = {}) {
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const convergence = buildLiveReviewConvergenceContext({
    ...input,
    reviewConvergenceState: input.reviewConvergenceState || input.convergenceState,
    currentFindings: findings,
    relationships: input.relationships || {
      parentPr: input.pr?.expectedParentPr ?? null,
      dependentPrs: input.dependentPrs || [],
    },
  });
  let state = convergence.gateInput.reviewConvergenceState;
  const history = input.reviewConvergenceHistory || state.history || [];
  if (findings.length === 0) {
    return {
      ok: true,
      reason: "existing_pr_review_converged",
      reviewConvergenceState: state,
      convergence: convergence.context,
      findingInventory: [],
      sourceChangingCycle: state.sourceChangingCycle,
    };
  }
  const githubEpoch = accountGithubTriggeredFixEpoch(state, {
    findingFingerprints: convergence.context.findingInventory.map((finding) => finding.fingerprint),
  });
  if (!githubEpoch.ok) {
    return {
      ok: false,
      reasonCode: githubEpoch.reasonCode,
      reason: githubEpoch.sanitizedReason,
      reviewConvergenceState: githubEpoch.state,
    };
  }
  state = githubEpoch.state;
  const budget = evaluateCycleBudget(state, input.config || {}, history);
  if (!budget.ok) {
    return {
      ok: false,
      reasonCode: budget.terminalReason || "review_convergence_budget_blocked",
      reason: budget.reason,
      reviewConvergenceState: budget.transitionedState || state,
      budget,
    };
  }
  if (budget.transitionedState) state = budget.transitionedState;
  if (typeof input.runBatchFix !== "function") {
    return {
      ok: false,
      reasonCode: "existing_pr_convergence_batch_fix_required",
      reason: "material findings require the shared bounded review-convergence batch-fix authority",
      reviewConvergenceState: state,
      convergence: convergence.context,
      findingInventory: convergence.context.findingInventory,
      budget,
    };
  }
  const fixTask = buildBatchFixTask({
    issue: input.issue,
    branchName: input.pr?.headRefName || input.pr?.branch || input.branchName,
    laneDecision: input.laneDecision || {},
    inventory: convergence.context.findingInventory,
  });
  const fixResult = await input.runBatchFix({ ...input, fixTask, reviewConvergenceState: state, convergence: convergence.context });
  if (!fixResult?.ok) {
    return {
      ok: false,
      reasonCode: fixResult?.reasonCode || "existing_pr_convergence_fix_not_proceeded",
      reason: fixResult?.reason || fixResult?.reasonCode || "review convergence fix did not proceed",
      reviewConvergenceState: markDiagnosticReviewFixTerminal(state, fixResult?.reasonCode || "existing_pr_convergence_fix_not_proceeded"),
      convergence: convergence.context,
      findingInventory: convergence.context.findingInventory,
      budget,
    };
  }
  const accounted = accountConvergenceEvent(state, {
    kind: fixResult.newHead && fixResult.newHead !== state.pr?.exactHead ? "source_changed" : "wait",
    newHead: fixResult.newHead,
    reasonCode: "existing_pr_review_convergence_fix",
  });
  return {
    ok: true,
    reason: "existing_pr_review_convergence_fix_applied",
    reviewConvergenceState: accounted.state,
    convergence: convergence.context,
    findingInventory: convergence.context.findingInventory,
    consumedSourceCycle: accounted.consumedSourceCycle,
    newHead: fixResult.newHead || state.pr?.exactHead || null,
    result: fixResult,
  };
}

export async function runExistingPrBatchFix(input = {}, adapters = {}) {
  const state = input.reviewConvergenceState || input.convergenceState || {};
  const exactHead = state.pr?.exactHead || input.pr?.headRefOid || input.pr?.exactHead || null;
  const inventory = Array.isArray(input.convergence?.findingInventory)
    ? input.convergence.findingInventory
    : freezeMaterialFindingInventory(input.findings || input.currentFindings || []);
  const fingerprints = inventory.map((finding) => finding.fingerprint).filter(Boolean).sort();
  const fingerprintDigest = digestFindingSet(fingerprints);
  const markerKey = `existing_pr_batch_fix:${state.pr?.number || input.pr?.number || "unknown"}:${exactHead || "unknown"}:${fingerprintDigest}`;
  const existingMarker = state.mutationMarkers?.[markerKey] || input.mutationMarkers?.[markerKey] || null;
  if (existingMarker?.newHead) {
    return {
      ok: true,
      duplicate: true,
      newHead: existingMarker.newHead,
      findingFingerprints: fingerprints,
      fingerprintDigest,
      mutationMarker: markerKey,
      validation: existingMarker.validation || null,
      externalReview: existingMarker.externalReview || null,
      review: existingMarker.review || null,
      sourceIdentity: existingMarker.sourceIdentity || null,
    };
  }
  if (inventory.length === 0) {
    return { ok: false, reasonCode: "existing_pr_batch_fix_inventory_missing", reason: "batch fix requires a frozen material finding inventory" };
  }
  const manual = inventory.find((finding) => finding.classification === "manual" || finding.manual === true);
  if (manual) {
    return { ok: false, reasonCode: "existing_pr_batch_fix_manual_decision_required", reason: "manual-decision findings cannot be mutated automatically", finding: manual.fingerprint || null };
  }
  const changedFindingPaths = [...new Set(inventory.map((finding) => finding.path).filter(Boolean))].sort();
  const forbiddenFindingPaths = filterForbiddenChangedFiles(changedFindingPaths, input.laneDecision || {});
  if (forbiddenFindingPaths.length > 0) {
    return {
      ok: false,
      reasonCode: "existing_pr_batch_fix_out_of_contract",
      reason: `finding paths outside lane contract: ${forbiddenFindingPaths.join(",")}`,
      forbiddenFindingPaths,
    };
  }
  if (typeof adapters.runCodexBatchFix !== "function") {
    return {
      ok: false,
      reasonCode: "existing_pr_batch_fix_adapter_unconfigured",
      reason: "production batch-fix adapter is required before source mutation",
      findingFingerprints: fingerprints,
      fingerprintDigest,
    };
  }
  const codex = await adapters.runCodexBatchFix({ ...input, exactHead, inventory, findingFingerprints: fingerprints, fingerprintDigest, markerKey });
  if (!codex?.ok) return codex || { ok: false, reasonCode: "existing_pr_batch_fix_codex_failed", reason: "Codex batch fix failed" };
  const changedFiles = typeof adapters.listChangedFiles === "function"
    ? normalizeChangedFiles(await adapters.listChangedFiles({ ...input, exactHead, inventory }))
    : normalizeChangedFiles(codex.changedFiles || []);
  if (changedFiles.length === 0) return { ok: false, reasonCode: "existing_pr_batch_fix_left_no_changed_files", reason: "batch fix produced no changed files" };
  const forbiddenChangedFiles = filterForbiddenChangedFiles(changedFiles, input.laneDecision || {});
  if (forbiddenChangedFiles.length > 0) {
    return { ok: false, reasonCode: "existing_pr_batch_fix_forbidden_changed_files", reason: `batch fix changed forbidden paths: ${forbiddenChangedFiles.join(",")}`, forbiddenChangedFiles };
  }
  if (typeof adapters.validateAndReview !== "function") {
    return { ok: false, reasonCode: "existing_pr_batch_fix_validation_review_adapter_unconfigured", reason: "exact validation and review adapter is required before push" };
  }
  const reviewed = await adapters.validateAndReview({ ...input, exactHead, changedFiles, codex, inventory, findingFingerprints: fingerprints, fingerprintDigest });
  if (!reviewed?.ok) return reviewed || { ok: false, reasonCode: "existing_pr_batch_fix_validation_review_failed", reason: "validation/review failed" };
  const fixDelta = reviewed.fixDelta || {
    changedFiles,
    changedFilesDigest: digestStringSet(changedFiles),
    oldHead: exactHead,
    findingFingerprints: fingerprints,
    fingerprintDigest,
  };
  const candidateChangedFiles = normalizeChangedFiles(reviewed.fullCandidatePrDelta?.changedFiles || reviewed.sourceIdentity?.fullCandidatePrDelta?.changedFiles || changedFiles);
  if (typeof adapters.commitAndPush !== "function") {
    return { ok: false, reasonCode: "existing_pr_batch_fix_commit_push_adapter_unconfigured", reason: "commit/push adapter is required for a source-changing cycle" };
  }
  const pushed = await adapters.commitAndPush({ ...input, exactHead, changedFiles: candidateChangedFiles, fixDelta, codex, reviewed, inventory, findingFingerprints: fingerprints, fingerprintDigest, markerKey });
  if (!pushed?.ok || !pushed.newHead || pushed.newHead === exactHead) {
    return pushed?.ok === false
      ? pushed
      : { ok: false, reasonCode: "existing_pr_batch_fix_new_head_required", reason: "batch fix must commit and push one new head" };
  }
  const marker = {
    markerKey,
    prNumber: state.pr?.number || input.pr?.number || null,
    oldHead: exactHead,
    newHead: pushed.newHead,
    findingFingerprints: fingerprints,
    fingerprintDigest,
    changedFiles: candidateChangedFiles,
    changedFilesDigest: digestStringSet(candidateChangedFiles),
    fixDelta,
    fullCandidatePrDelta: reviewed.fullCandidatePrDelta || reviewed.sourceIdentity?.fullCandidatePrDelta || null,
    validation: reviewed.validation || null,
    externalReview: reviewed.externalReview || null,
    review: reviewed.review || null,
    sourceIdentity: pushed.sourceIdentity || reviewed.sourceIdentity || null,
    pushedAt: pushed.pushedAt || new Date().toISOString(),
  };
  if (typeof adapters.persistMutationMarker === "function") {
    await adapters.persistMutationMarker({ ...input, markerKey, marker });
  }
  return {
    ok: true,
    newHead: pushed.newHead,
    findingFingerprints: fingerprints,
    fingerprintDigest,
    changedFiles: candidateChangedFiles,
    changedFilesDigest: marker.changedFilesDigest,
    fixDelta: marker.fixDelta,
    fullCandidatePrDelta: marker.fullCandidatePrDelta,
    validation: marker.validation,
    externalReview: marker.externalReview,
    review: marker.review,
    sourceIdentity: marker.sourceIdentity,
    mutationMarker: marker,
    durableMutationMarkers: { [markerKey]: marker },
  };
}

function detectShortOscillation(values) {
  if (values.length < 4) return false;
  const last4 = values.slice(-4);
  if (last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1]) return true;
  const last6 = values.slice(-6);
  return last6.length === 6 && last6[0] === last6[3] && last6[1] === last6[4] && last6[2] === last6[5];
}

function normalizeHistoryEntry(item = {}) {
  const explicitPatchId = item.stablePatchId || item.sourceIdentity?.patchId || item.patchId || null;
  const patchId = trustedPatchIdFromHistory(item, explicitPatchId);
  return {
    ...item,
    exactHead: item.exactHead || item.headSha || item.commitSha || item.sourceIdentity?.exactHead || null,
    findingFingerprints: normalizeFindingFingerprints(item.findingFingerprints || [], { preserveValidFingerprintStrings: true }),
    claimedFixedFingerprints: normalizeFindingFingerprints(item.claimedFixedFingerprints || item.fixedFindingFingerprints || [], { preserveValidFingerprintStrings: true }),
    patchId,
    treeId: item.treeId || item.sourceIdentity?.treeId || null,
    patchIdReason: item.patchIdReason || item.sourceIdentity?.patchIdReason || (patchId ? null : item.patchIdReason || null),
  };
}

function diagnosticAuthorizationForState(state, budget, reason) {
  const diagnostic = state.diagnosticReviewFix || {};
  const authorization = {
    kind: "diagnostic_review_fix_authorization",
    decision: "start_diagnostic_epoch",
    reason,
    convergenceId: state.convergenceId,
    epoch: state.epoch,
    prNumber: state.pr?.number ?? null,
    exactHead: state.pr?.exactHead || null,
    sourceChangingCycle: state.sourceChangingCycle,
    normalizedMax: budget.normalized,
    attemptId: diagnostic.attemptId || diagnosticAttemptId(state, budget),
    status: diagnostic.status || null,
  };
  const validation = validateDiagnosticReviewFixAuthorization({
    reviewConvergenceState: state,
    diagnosticAuthorization: authorization,
    normalizedMax: budget.normalized,
    attemptCount: state.sourceChangingCycle,
  });
  return validation.ok ? { ok: true, authorization } : validation;
}

function diagnosticAttemptId(state, budget) {
  return createHash("sha256")
    .update(JSON.stringify({
      convergenceId: state.convergenceId,
      epoch: state.epoch,
      prNumber: state.pr?.number ?? null,
      exactHead: state.pr?.exactHead || null,
      sourceChangingCycle: state.sourceChangingCycle,
      normalizedMax: budget.normalized,
    }))
    .digest("hex");
}

function sourceIdentityForProgress(item = {}) {
  const normalized = normalizeHistoryEntry(item);
  return normalized.patchId || normalized.treeId || null;
}

function trustedPatchIdFromAttempt(attempt = {}) {
  return attempt?.stablePatchId || attempt?.sourceIdentity?.patchId || null;
}

function trustedPatchIdFromHistory(item = {}, patchId = null) {
  if (!patchId) return null;
  if (item.stablePatchId || item.sourceIdentity?.patchId || item.patchIdKind === "stable_patch_id") return patchId;
  if (/^[0-9a-f]{40}$/i.test(String(patchId))) return null;
  return patchId;
}

function detectReturnedFinding(history) {
  const seen = new Map();
  for (const item of history) {
    const claimed = new Set(item.claimedFixedFingerprints || []);
    for (const fingerprint of item.findingFingerprints || []) {
      if (claimed.has(fingerprint)) return fingerprint;
      const previous = seen.get(fingerprint);
      if (previous === false) return fingerprint;
      seen.set(fingerprint, true);
    }
    for (const fixed of item.claimedFixedFingerprints || []) {
      seen.set(fixed, false);
    }
  }
  return null;
}

function externalReviewFindingsFromSupportedContainers(externalReview = {}) {
  if (!externalReview || reviewVerdictIsPass(externalReview)) return [];
  const defaults = {
    provider: externalReview.provider || "external_review",
    source: externalReview.source || "external_review",
    severity: externalReview.severity,
  };
  return sanitizeStructuredReviewFindings(collectSupportedFindingArrays(externalReview, [
    ["sanitizedResponseSummary", "findings"],
    ["findings"],
    ["blockingFindings"],
  ]).map((finding) => normalizeReviewFindingForFingerprint(finding, defaults)), defaults);
}

function codexReviewFindingsFromSupportedContainers(review = {}) {
  if (!review || reviewVerdictIsPass(review)) return [];
  const defaults = {
    provider: review.provider || "codex",
    source: review.source || "codex_mechanics_security_review",
    severity: review.severity,
  };
  return sanitizeStructuredReviewFindings(collectSupportedFindingArrays(review, [
    ["verdict", "blocking_findings"],
    ["verdict", "findings"],
    ["blockingFindings"],
    ["findings"],
  ]).map((finding) => normalizeReviewFindingForFingerprint(finding, defaults)), defaults);
}

function collectSupportedFindingArrays(source = {}, paths = []) {
  const findings = [];
  for (const pathParts of paths) {
    const value = pathParts.reduce((current, part) => current?.[part], source);
    if (Array.isArray(value)) findings.push(...value);
  }
  return findings;
}

function normalizeReviewFindingForFingerprint(finding, defaults = {}) {
  if (finding && typeof finding === "object") {
    return sanitizeStructuredReviewFinding({
      ...finding,
      provider: defaults.provider || finding.provider,
      source: defaults.source || finding.source,
      severity: defaults.severity || finding.severity,
    });
  }
  const text = String(finding || "");
  return sanitizeStructuredReviewFinding({
    provider: defaults.provider,
    source: defaults.source,
    severity: defaults.severity,
    title: text,
    body: text,
  });
}

function canonicalClaimedFindingIdentity({ trigger = {}, source = null, externalReview = {}, review = {} } = {}) {
  const triggerSource = trigger.source || source || null;
  if (triggerSource === "integrated_gemini") {
    const provider = externalReview?.provider || null;
    if (!provider || provider === "external_review") return { ok: false, reason: "ambiguous_external_review_provider" };
    return {
      ok: true,
      defaults: {
        provider,
        source: externalReview.source || triggerSource,
        severity: externalReview.severity,
      },
    };
  }
  if (triggerSource === "review_fix_canary_fixture") {
    return {
      ok: true,
      defaults: {
        provider: externalReview?.provider === "review_fix_canary_fixture" ? "review_fix_canary_fixture" : "review_fix_canary_fixture",
        source: "review_fix_canary_fixture",
        severity: externalReview?.severity,
      },
    };
  }
  if (triggerSource === "codex_mechanics" || triggerSource === "codex_mechanics_security_review") {
    return {
      ok: true,
      defaults: {
        provider: review?.provider || "codex",
        source: review?.source || "codex_mechanics_security_review",
        severity: review?.severity,
      },
    };
  }
  return { ok: false, reason: "ambiguous_review_fix_trigger" };
}

function reviewVerdictIsPass(review = {}) {
  const verdict = review.verdict?.verdict || review.verdict || review.sanitizedResponseSummary?.verdict || review.status || null;
  return ["approve", "approved", "pass"].includes(verdict);
}

function digestFindingSet(fingerprints = []) {
  return createHash("sha256").update([...fingerprints].sort().join("\n")).digest("hex");
}

function normalizeChangedFiles(files = []) {
  return [...new Set((Array.isArray(files) ? files : []).map((file) => scrub(file)).filter(Boolean))].sort();
}

function digestStringSet(values = []) {
  return createHash("sha256").update(normalizeChangedFiles(values).join("\n")).digest("hex");
}

function normalizeIssue(issue = {}) {
  return {
    number: Number.isInteger(issue.number) ? issue.number : Number.isInteger(issue.issueNumber) ? issue.issueNumber : null,
    title: String(issue.title || issue.issueTitle || "").slice(0, 240),
    url: issue.url || null,
    labels: Array.isArray(issue.labels) ? issue.labels.slice(0, 40) : [],
  };
}

function normalizePr(pr = {}) {
  return {
    number: Number.isInteger(pr.number) ? pr.number : null,
    branch: String(pr.branch || pr.headRefName || "").slice(0, 240),
    base: String(pr.base || pr.baseRefName || "main").slice(0, 240),
    exactHead: pr.exactHead || pr.headSha || pr.headRefOid || null,
  };
}

function normalizeFindingFingerprints(values = [], options = {}) {
  return values
    .map((value) => {
      if (options.preserveValidFingerprintStrings && typeof value === "string" && validFindingFingerprint(value)) {
        return value.toLowerCase();
      }
      const safe = sanitizeStructuredReviewFinding(value);
      if (!safe || !classifyFinding(safe).material) return null;
      return fingerprintReviewFinding(safe).fingerprint;
    })
    .filter(Boolean)
    .sort();
}

function numberOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function staleEvidenceForHead(evidence = {}, exactHead = null) {
  return Object.fromEntries(
    Object.entries(evidence).map(([kind, value]) => {
      if (!value || typeof value !== "object") return [kind, value];
      const evidenceHead = value.exactHead || null;
      if (!exactHead || !evidenceHead || evidenceHead === exactHead || value.stale === true) return [kind, value];
      return [kind, { ...value, stale: true, staleReason: "evidence_head_mismatch", currentHead: exactHead }];
    }),
  );
}

function normalizeSeverity(value) {
  const severity = String(value || "unknown").trim().toLowerCase();
  if (["critical", "high", "medium", "low", "info"].includes(severity)) return severity;
  return "unknown";
}

function stableLocation(finding) {
  if (finding.range) return normalizeText(JSON.stringify(finding.range));
  if (finding.line) return `line:${Number(finding.line) || 0}`;
  return "";
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").slice(0, 512);
}

function normalizeText(value) {
  return scrub(value).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 1000);
}

function scrub(value) {
  return redactSecretLikeText(value).slice(0, 1000);
}
