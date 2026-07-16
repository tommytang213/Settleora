import { createHash } from "node:crypto";
import { defaultNoProgressSourceCycles, hardMaxReviewFixSourceCycles, normalizeReviewFixMutationConfig } from "./review-fix-policy.mjs";
import {
  invalidateConvergenceEvidenceForHead,
  recordReviewRequestDedupe,
} from "./review-convergence-state.mjs";

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
  const normalized = {
    provider: scrub(finding.provider || finding.source || "unknown"),
    severity: normalizeSeverity(finding.severity),
    path: normalizePath(finding.path || finding.file || ""),
    location: stableLocation(finding),
    title: normalizeText(finding.title || finding.message || ""),
    body: normalizeText(finding.body || finding.details || ""),
    ruleId: scrub(finding.ruleId || finding.rule || finding.check || ""),
    authorityInvariant: scrub(finding.authorityInvariant || finding.invariant || ""),
  };
  return {
    ...normalized,
    fingerprint: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
  };
}

export function freezeMaterialFindingInventory(findings = []) {
  return findings
    .map((finding) => ({ raw: finding, classified: classifyFinding(finding), fingerprint: fingerprintReviewFinding(finding) }))
    .filter((entry) => entry.classified.material)
    .sort((a, b) => a.fingerprint.fingerprint.localeCompare(b.fingerprint.fingerprint))
    .map((entry) => ({
      classification: entry.classified.classification,
      fingerprint: entry.fingerprint.fingerprint,
      provider: entry.fingerprint.provider,
      severity: entry.fingerprint.severity,
      path: entry.fingerprint.path,
      location: entry.fingerprint.location,
      title: entry.fingerprint.title,
      ruleId: entry.fingerprint.ruleId,
      authorityInvariant: entry.fingerprint.authorityInvariant,
    }));
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
  return {
    consumedSourceCycle: true,
    reason: "source_changing_exact_head",
    state: {
      ...invalidateConvergenceEvidenceForHead(state, newHead, event.reasonCode || "source_changed"),
      sourceChangingCycle: state.sourceChangingCycle + 1,
    },
  };
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
  const recent = history.slice(-threshold);
  if (recent.length >= threshold && recent.every((item) => digestFindingSet(item.findingFingerprints) === digestFindingSet(recent[0].findingFingerprints))) {
    return { ok: false, terminalReason: "NO_PROGRESS", reason: "identical_material_finding_set_repeated", threshold };
  }
  const treeOrPatch = history.map((item) => item.patchId || item.treeId).filter(Boolean);
  if (detectShortOscillation(treeOrPatch)) {
    return { ok: false, terminalReason: "REVIEW_OSCILLATION", reason: "patch_or_tree_identity_oscillation" };
  }
  const returned = detectReturnedFinding(history);
  if (returned) {
    return { ok: false, terminalReason: "NO_PROGRESS", reason: "finding_returned_after_claimed_fix", fingerprint: returned };
  }
  return { ok: true, reason: "progress_not_blocked" };
}

export function evaluateCycleBudget(state, config = {}, history = []) {
  const budget = normalizeConvergenceBudget(config);
  if (budget.malformed) return { ok: false, terminalReason: "MANUAL_DECISION_REQUIRED", reason: "review_fix_budget_malformed", budget };
  if (!budget.enabled) return { ok: false, terminalReason: "MANUAL_DECISION_REQUIRED", reason: "review_fix_mutation_disabled_by_zero_budget", budget };
  if (state.sourceChangingCycle < budget.normalized) return { ok: true, budget };
  if (state.epochDiagnosticStarted) return { ok: false, terminalReason: "CYCLE_BUDGET_EXHAUSTED", reason: "diagnostic_epoch_already_used", budget };
  const progress = analyzeConvergenceProgress(history);
  return {
    ok: progress.ok,
    terminalReason: progress.ok ? null : progress.terminalReason,
    reason: progress.ok ? "start_diagnostic_epoch" : progress.reason,
    diagnosticEpoch: progress.ok,
    budget,
  };
}

export function buildBatchFixTask({ issue, branchName, laneDecision, inventory }) {
  return {
    title: `Batch review-fix for #${issue?.number || "unknown"}`,
    branchName,
    allowedPaths: laneDecision?.allowedPaths || [],
    findingFingerprints: inventory.map((finding) => finding.fingerprint),
    prompt: [
      `Fix all current material review findings for #${issue?.number || "unknown"} in one focused batch.`,
      `Branch: ${branchName || "unknown"}`,
      `Allowed paths: ${(laneDecision?.allowedPaths || []).join(", ")}`,
      "Do not fix duplicate, non-material, stale-head, out-of-contract, or manual-decision findings.",
      ...inventory.map((finding) => `- ${finding.severity} ${finding.path} ${finding.title} [${finding.fingerprint}]`),
    ].join("\n"),
  };
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

function detectShortOscillation(values) {
  if (values.length < 4) return false;
  const last4 = values.slice(-4);
  if (last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1]) return true;
  const last6 = values.slice(-6);
  return last6.length === 6 && last6[0] === last6[3] && last6[1] === last6[4] && last6[2] === last6[5];
}

function detectReturnedFinding(history) {
  const seen = new Map();
  for (const item of history) {
    for (const fingerprint of item.findingFingerprints || []) {
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

function digestFindingSet(fingerprints = []) {
  return createHash("sha256").update([...fingerprints].sort().join("\n")).digest("hex");
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
  return String(value || "")
    .replace(/bearer\s+[A-Za-z0-9._~+/-]+/gi, "[REDACTED]")
    .replace(/(api[_-]?key|secret|token)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 1000);
}
