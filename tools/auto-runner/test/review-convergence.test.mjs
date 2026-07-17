import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  runBundleReviewConvergence,
} from "../lib/feature-bundle-orchestrator.mjs";
import {
  accountConvergenceEvent,
  analyzeConvergenceProgress,
  buildBatchFixTask,
  buildLiveReviewConvergenceContext,
  evaluateCycleBudget,
  fingerprintReviewFinding,
  freezeMaterialFindingInventory,
  normalizeConvergenceBudget,
  notificationDecisionForConvergence,
  planExactHeadReviewRequest,
} from "../lib/review-convergence-controller.mjs";
import {
  bindReviewConvergenceEvidence,
  createInitialReviewConvergenceState,
  loadReviewConvergenceState,
  reviewConvergenceStorageKey,
  recordConvergenceMutationMarker,
  reviewConvergenceStatePath,
  writeReviewConvergenceState,
} from "../lib/review-convergence-state.mjs";
import {
  createInitialRecoveryState,
  digestChangedFiles,
  persistCompleteHeadEvidence,
  validateCompleteHeadEvidence,
} from "../lib/recovery-state.mjs";
import {
  evaluateReviewFixContractPaths,
  evaluateReviewFixMutationDecision,
  evaluateReviewFixStrongGates,
  extractReviewFixTrigger,
  normalizeReviewFixMutationConfig,
} from "../lib/review-fix-policy.mjs";
import {
  buildReadOnlyLiveStackFixturePlan,
  createDependentPrStackPlan,
  nextStackAction,
  proveSemanticOwnDelta,
  recordStackMutationMarker,
  validateStackRelationships,
} from "../lib/pr-stack-controller.mjs";

function config() {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-review-convergence-"));
  return { logsRoot, cleanup: () => rmSync(logsRoot, { recursive: true, force: true }) };
}

function state(overrides = {}) {
  return createInitialReviewConvergenceState({
    stackId: "stack-1",
    issue: { number: 921, title: "Convergence" },
    pr: { number: 919, headRefName: "feature/parent", baseRefName: "main", headRefOid: "a".repeat(40) },
    ...overrides,
  });
}

function recoveryState(overrides = {}) {
  return createInitialRecoveryState({
    taskKey: "20260717-1220",
    issue: { number: 921, title: "Convergence" },
    runId: "run-1",
    branchName: "feature/convergence",
    baseSha: "0".repeat(40),
    currentHeadSha: "a".repeat(40),
    pr: { number: 922, headRefName: "feature/convergence", baseRefName: "main", headSha: "a".repeat(40), state: "OPEN" },
    phase: "review_fix",
    firstIncompleteAction: "persist_exact_head_evidence",
    ...overrides,
  });
}

function completeEvidence({ headSha = "a".repeat(40), baseSha = "0".repeat(40), changedFiles = ["tools/auto-runner/a.mjs"] } = {}) {
  const changedFilesDigest = digestChangedFiles(changedFiles);
  return {
    identity: { headSha, baseSha, changedFiles, changedFilesDigest, taskKey: "20260717-1220", issueNumber: 921, runId: "run-1", prNumber: 922, branchName: "feature/convergence" },
    evidence: {
      localValidation: { status: "passed", headSha, baseSha, changedFilesDigest },
      externalReview: { status: "passed", headSha, baseSha, changedFilesDigest, evidencePath: "/tmp/review.json", provider: "gemini", tier: "strong_independent" },
      codexReview: { status: "passed", headSha, baseSha, changedFilesDigest, evidencePath: "/tmp/codex.json", source: "codex_mechanics_security_review", provider: "codex" },
    },
  };
}

function bundleConvergenceInput(overrides = {}) {
  const oldHead = "a".repeat(40);
  const built = buildLiveReviewConvergenceContext({
    config: { repositorySlug: "tommytang213/Settleora", configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
    issue: { number: 921, title: "Convergence" },
    branchName: "feature/bundle",
    exactHead: oldHead,
    sourceChangingCycle: overrides.sourceChangingCycle ?? 7,
    relationships: { bundleId: "bundle-921", sliceOrder: ["slice-one", "slice-two"] },
  });
  return {
    issue: { number: 921, title: "Convergence", labels: [] },
    laneDecision: {
      lane: "workflow-docs-tooling",
      allowedToImplement: true,
      autoMergeEligible: true,
      manualMergeRequired: false,
      allowedPaths: ["tools/auto-runner/**"],
      validationProfile: "runner-tests",
      contract: { autoMergeEligible: true, manualMergeRequired: false },
    },
    plan: { id: "bundle-921", slices: [{ id: "slice-one" }, { id: "slice-two" }] },
    state: {
      stateVersion: 1,
      taskKey: "20260717-1336",
      bundleId: "bundle-921",
      bundleVersion: 1,
      strategy: "feature-bundle",
      planDigest: createHash("sha256").update("bundle").digest("hex"),
      issue: { number: 921, title: "Convergence", url: null },
      run: { runId: "run-1", supervisorRunId: null },
      branch: "feature/bundle",
      baseSha: "0".repeat(40),
      lastVerifiedHead: oldHead,
      sourceChangingCycle: overrides.sourceChangingCycle ?? 7,
      sliceOrder: ["slice-one", "slice-two"],
      slices: {
        "slice-one": { id: "slice-one", state: "completed", commitSha: "1".repeat(40), checkpointValidation: { passed: true } },
        "slice-two": { id: "slice-two", state: "completed", commitSha: oldHead, checkpointValidation: { passed: true } },
      },
      finalization: { state: "reviewing", validation: null, reviewPackage: null, externalReview: null, codexReview: null, pr: null, ci: null, autoMerge: null, stopReason: null },
      reviewConvergenceState: built.gateInput.reviewConvergenceState,
      timestamps: { createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z" },
    },
    result: {
      externalReview: { status: "pass", verdict: "pass", tier: "strong_independent", changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
      review: {
        verdict: {
          verdict: "changes_requested",
          recommended_next_action: "run_safe_fix_cycle",
          blocking_findings: ["Run bundle Codex failures through convergence fixes"],
        },
        changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]),
      },
      reviewMutationGuard: { mutationDetected: false },
    },
    branchName: "feature/bundle",
    baseSha: "0".repeat(40),
    changedFiles: ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"],
    forbiddenChangedFiles: [],
    validation: { passed: true, profile: "runner-tests", changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
    prePushGate: { ok: true, reason: "pre_push_review_gates_passed" },
    recovery: {
      actions: [],
      advance(phase, action) { this.actions.push(["advance", phase, action]); },
      stop(reasonCode, reason, next) { this.actions.push(["stop", reasonCode, reason, next]); },
      headChanged(head, reason) { this.actions.push(["headChanged", head, reason]); },
      marker(kind, key) { this.actions.push(["marker", kind, key]); },
    },
    ...overrides,
  };
}

test("review-fix budget defaults to 50, clamps above hard max, allows zero, and fails malformed", () => {
  assert.deepEqual(
    normalizeReviewFixMutationConfig({ configPath: "cfg.json", allowReviewFixMutation: true }).maxSourceChangingCycles,
    50,
  );
  for (const requested of [1, 2, 49, 50]) {
    assert.equal(normalizeReviewFixMutationConfig({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: requested }).maxSourceChangingCycles, requested);
  }
  const zero = normalizeReviewFixMutationConfig({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 0 });
  assert.equal(zero.enabled, false);
  assert.equal(zero.maxSourceChangingCycles, 0);
  const high = normalizeReviewFixMutationConfig({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 500 });
  assert.equal(high.maxSourceChangingCycles, 50);
  assert.equal(high.overHardMaxPolicy, "clamp_to_hard_max");
  assert.equal(normalizeReviewFixMutationConfig({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: -1 }).malformed, true);
  assert.equal(normalizeReviewFixMutationConfig({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: "bad" }).malformed, true);
});

test("transient retries do not consume source cycles; pushed new heads do and invalidate evidence", () => {
  let current = bindReviewConvergenceEvidence(state(), "validation", { status: "passed", exactHead: "a".repeat(40) });
  const retry = accountConvergenceEvent(current, { kind: "provider_retry" });
  assert.equal(retry.consumedSourceCycle, false);
  assert.equal(retry.state.sourceChangingCycle, 0);
  const changed = accountConvergenceEvent(current, { kind: "source_changed", newHead: "b".repeat(40), reasonCode: "batch_fix_pushed" });
  assert.equal(changed.consumedSourceCycle, true);
  assert.equal(changed.state.sourceChangingCycle, 1);
  assert.equal(changed.state.evidence.validation.stale, true);
  assert.equal(changed.state.pr.exactHead, "b".repeat(40));
});

test("head-bound evidence from an older head is immediately stale", () => {
  const current = state();
  const stale = bindReviewConvergenceEvidence(current, "review", { status: "passed", exactHead: "b".repeat(40) });
  assert.equal(stale.evidence.review.exactHead, "b".repeat(40));
  assert.equal(stale.evidence.review.stale, true);
  assert.equal(stale.evidence.review.currentHead, "a".repeat(40));
  assert.equal(stale.evidence.review.staleReason, "evidence_head_mismatch");
});

test("complete recovery evidence persists atomically and survives restart", () => {
  const c = config();
  try {
    const current = recoveryState();
    const { evidence, identity } = completeEvidence();
    const persisted = persistCompleteHeadEvidence(c, current, evidence, identity);
    assert.equal(persisted.ok, true);
    assert.equal(persisted.state.evidence.localValidation.stale, false);
    assert.equal(persisted.state.evidence.externalReview.changedFilesDigest, identity.changedFilesDigest);
    assert.equal(persisted.state.evidence.externalReview.provider, "gemini");
    assert.equal(persisted.state.evidence.externalReview.tier, "strong_independent");
    assert.equal(persisted.state.evidence.codexReview.headSha, identity.headSha);
    assert.equal(persisted.state.evidence.codexReview.source, "codex_mechanics_security_review");
    const loaded = readFileSync(persisted.statePath, "utf8");
    assert.match(loaded, /"localValidation"/);
    assert.match(loaded, /"externalReview"/);
    assert.match(loaded, /"codexReview"/);
    assert.equal(validateCompleteHeadEvidence(persisted.state, {
      localValidation: persisted.state.evidence.localValidation,
      externalReview: persisted.state.evidence.externalReview,
      codexReview: persisted.state.evidence.codexReview,
    }, identity).ok, true);
  } finally {
    c.cleanup();
  }
});

test("complete recovery evidence rejects missing, partial, replayed, wrong-head, wrong-digest, and wrong-identity evidence", () => {
  const current = recoveryState();
  const { evidence, identity } = completeEvidence();
  assert.equal(validateCompleteHeadEvidence(current, { ...evidence, codexReview: null }, identity).reasonCode, "missing_codexReview_evidence");
  assert.equal(validateCompleteHeadEvidence(current, { ...evidence, codexReview: { ...evidence.codexReview, status: "blocked" } }, identity).ok, true);
  assert.equal(validateCompleteHeadEvidence(current, { ...evidence, localValidation: { ...evidence.localValidation, changedFilesDigest: null } }, identity).reasonCode, "localValidation_changed_files_digest_missing");
  assert.equal(validateCompleteHeadEvidence(current, { ...evidence, localValidation: { ...evidence.localValidation, status: "unknown" } }, identity).reasonCode, "localValidation_status_invalid");
  assert.equal(validateCompleteHeadEvidence(current, { ...evidence, externalReview: { ...evidence.externalReview, headSha: "b".repeat(40) } }, identity).reasonCode, "externalReview_head_mismatch");
  assert.equal(validateCompleteHeadEvidence(current, { ...evidence, codexReview: { ...evidence.codexReview, changedFilesDigest: digestChangedFiles(["other.mjs"]) } }, identity).reasonCode, "codexReview_changed_files_digest_mismatch");
  assert.equal(validateCompleteHeadEvidence(current, evidence, { ...identity, runId: "other-run" }).reasonCode, "evidence_run_mismatch");
  assert.equal(validateCompleteHeadEvidence(current, evidence, { ...identity, prNumber: 920 }).reasonCode, "evidence_pr_mismatch");
  assert.equal(validateCompleteHeadEvidence({ ...current, branch: { ...current.branch, currentHeadSha: "b".repeat(40) } }, evidence, identity).reasonCode, "evidence_state_head_mismatch");
});

test("durable state writes atomically, reloads, fails closed on corruption, and dedupes mutations", () => {
  const c = config();
  try {
    let current = state();
    const written = writeReviewConvergenceState(c, current);
    assert.equal(loadReviewConvergenceState(c, current).ok, true);
    const first = recordConvergenceMutationMarker(current, { kind: "push", key: "cycle-1", exactHead: "a".repeat(40) });
    assert.equal(first.duplicate, false);
    const second = recordConvergenceMutationMarker(first.state, { kind: "push", key: "cycle-1", exactHead: "a".repeat(40) });
    assert.equal(second.duplicate, true);
    assert.equal(written.statePath, reviewConvergenceStatePath(c, current));
    current = { ...current, stateVersion: 999 };
    assert.throws(() => writeReviewConvergenceState(c, current), /Invalid review convergence state/);
  } finally {
    c.cleanup();
  }
});

test("durable state key is stable across canonical identity, stored id, restart, and mismatch", () => {
  const c = config();
  try {
    const canonical = {
      stackId: "stack-1",
      repository: "tommytang213/Settleora",
      issueNumber: 921,
      prNumber: 919,
      branchName: "feature/parent",
      baseRef: "main",
    };
    const current = state(canonical);
    const expectedKey = reviewConvergenceStorageKey(canonical);
    assert.equal(current.convergenceId, expectedKey);
    const written = writeReviewConvergenceState(c, current);
    assert.equal(written.statePath, reviewConvergenceStatePath(c, canonical));
    assert.equal(written.statePath, reviewConvergenceStatePath(c, current.convergenceId));
    assert.equal(loadReviewConvergenceState(c, canonical).ok, true);
    assert.equal(loadReviewConvergenceState(c, current.convergenceId).ok, true);
    const updated = bindReviewConvergenceEvidence(current, "validation", { status: "passed", exactHead: current.pr.exactHead });
    assert.equal(writeReviewConvergenceState(c, updated).statePath, written.statePath);
    assert.equal(loadReviewConvergenceState(c, { ...canonical, prNumber: 920 }).reasonCode, "review_convergence_state_missing");
    assert.equal(loadReviewConvergenceState(c, { ...canonical, convergenceId: current.convergenceId, prNumber: 920 }).reasonCode, "review_convergence_state_identity_mismatch");
    const legacyDoubleHashKey = createHash("sha256")
      .update(JSON.stringify({
        stackId: null,
        convergenceId: current.convergenceId,
        repository: null,
        issueNumber: null,
        prNumber: null,
        branchName: null,
        baseRef: null,
      }))
      .digest("hex");
    assert.notEqual(reviewConvergenceStatePath(c, legacyDoubleHashKey), written.statePath);
    assert.equal(loadReviewConvergenceState(c, legacyDoubleHashKey).reasonCode, "review_convergence_state_missing");
  } finally {
    c.cleanup();
  }
});

test("durable state key treats GitHub PR-shaped branch identity as canonical", () => {
  const c = config();
  try {
    const fromPrShape = state({
      stackId: "stack-1",
      repository: "tommytang213/Settleora",
      issue: { number: 921, title: "Convergence" },
      pr: { number: 919, headRefName: "feature/parent", baseRefName: "main", headRefOid: "a".repeat(40) },
    });
    const canonical = {
      stackId: "stack-1",
      repository: "tommytang213/Settleora",
      issueNumber: 921,
      prNumber: 919,
      branchName: "feature/parent",
      baseRef: "main",
    };
    assert.equal(fromPrShape.convergenceId, reviewConvergenceStorageKey(canonical));
    writeReviewConvergenceState(c, fromPrShape);
    assert.equal(loadReviewConvergenceState(c, canonical).ok, true);
  } finally {
    c.cleanup();
  }
});

test("exact-head review request dedupe allows one request per PR head purpose", () => {
  const first = planExactHeadReviewRequest(state(), { purpose: "codex", reviewerTier: "cheap_independent" });
  assert.equal(first.duplicate, false);
  const duplicate = planExactHeadReviewRequest(first.state, { purpose: "codex", reviewerTier: "cheap_independent" });
  assert.equal(duplicate.duplicate, true);
  const newHead = planExactHeadReviewRequest(first.state, { exactHead: "b".repeat(40), purpose: "codex", reviewerTier: "cheap_independent" });
  assert.equal(newHead.duplicate, false);
});

test("finding fingerprints normalize material inventory and batch multiple findings", () => {
  const fingerprint = fingerprintReviewFinding({ provider: "gemini", severity: "HIGH", path: "./a.js", line: 10, title: "  Bug ", body: "token=abc" });
  assert.equal(fingerprint.severity, "high");
  assert.equal(fingerprint.path, "a.js");
  assert.doesNotMatch(fingerprint.body, /abc/);
  const inventory = freezeMaterialFindingInventory([
    { provider: "gemini", severity: "high", path: "a.js", title: "Bug one" },
    { provider: "codex", severity: "medium", path: "b.js", title: "Bug two" },
    { classification: "duplicate", path: "c.js", title: "dup" },
    { classification: "non_material", path: "d.js", title: "style" },
  ]);
  assert.equal(inventory.length, 2);
  const task = buildBatchFixTask({ issue: { number: 921 }, branchName: "feature/x", laneDecision: { allowedPaths: ["tools/auto-runner/**"] }, inventory });
  assert.equal(task.findingFingerprints.length, 2);
});

test("no-progress, returned finding, and A/B oscillation are detected", () => {
  assert.equal(analyzeConvergenceProgress([
    { findingFingerprints: ["a"], patchId: "p1" },
    { findingFingerprints: ["a"], patchId: "p2" },
    { findingFingerprints: ["a"], patchId: "p3" },
  ]).terminalReason, "NO_PROGRESS");
  assert.equal(analyzeConvergenceProgress([
    { findingFingerprints: ["a"], claimedFixedFingerprints: ["a"], patchId: "p1" },
    { findingFingerprints: [], patchId: "p2" },
    { findingFingerprints: ["a"], patchId: "p3" },
  ]).terminalReason, "NO_PROGRESS");
  assert.equal(analyzeConvergenceProgress([
    { findingFingerprints: ["a"], patchId: "A" },
    { findingFingerprints: ["b"], patchId: "B" },
    { findingFingerprints: ["c"], patchId: "A" },
    { findingFingerprints: ["d"], patchId: "B" },
  ]).terminalReason, "REVIEW_OSCILLATION");
});

test("cycle 50 starts one diagnostic epoch only when progress is still measurable", () => {
  const current = { ...state(), sourceChangingCycle: 50 };
  const diagnostic = evaluateCycleBudget(current, { maxReviewFixCycles: 50, allowReviewFixMutation: true, configPath: "cfg.json" }, [
    { findingFingerprints: ["a"], patchId: "p1" },
    { findingFingerprints: ["b"], patchId: "p2" },
  ]);
  assert.equal(diagnostic.diagnosticEpoch, true);
  const exhausted = evaluateCycleBudget({ ...current, epochDiagnosticStarted: true }, { maxReviewFixCycles: 50, allowReviewFixMutation: true, configPath: "cfg.json" }, []);
  assert.equal(exhausted.terminalReason, "CYCLE_BUDGET_EXHAUSTED");
});

test("contract-approved lanes allow docs/runtime/sensitive fixes only under the right gates", () => {
  const docsLane = {
    lane: "docs-planning",
    allowedToImplement: true,
    autoMergeEligible: true,
    manualMergeRequired: false,
    allowedPaths: ["docs/planning/**"],
    contract: { autoMergeEligible: true, manualMergeRequired: false },
  };
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: docsLane, changedFiles: ["docs/planning/x.md"] }).ok, true);
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: docsLane, changedFiles: ["services/api/x.cs"] }).ok, false);
  const sensitiveLane = {
    lane: "money-settlement-payment",
    allowedToImplement: true,
    autoMergeEligible: true,
    manualMergeRequired: false,
    allowedPaths: ["services/api/**"],
    contract: { autoMergeEligible: true, manualMergeRequired: false },
  };
  assert.equal(evaluateReviewFixStrongGates({ laneDecision: sensitiveLane, validation: { passed: true, profile: "api-money" }, externalReview: { status: "pass", tier: "strong_independent", verdict: "pass" }, mergePolicy: { exactHeadRequired: true } }).ok, true);
  assert.equal(evaluateReviewFixStrongGates({ laneDecision: sensitiveLane, validation: { passed: true, profile: "api-money" }, externalReview: { status: "skipped", tier: "strong_independent" }, mergePolicy: { exactHeadRequired: true } }).reason, "sensitive_lane_requires_passed_strong_independent_review");
  assert.equal(evaluateReviewFixStrongGates({ laneDecision: sensitiveLane, validation: { passed: true, profile: "docs-only" }, externalReview: { tier: "cheap_independent" } }).ok, false);
  const generated = { ...sensitiveLane, lane: "openapi-generated-clients", allowedPaths: ["packages/client-dart/lib/generated/**"] };
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: generated, changedFiles: ["packages/client-dart/lib/generated/a.dart"] }).reason, "generated_clients_require_authoritative_generator_or_contract_change");
});

test("contract glob matching is bounded, deterministic, segment-aware, and fail-closed", () => {
  const lane = {
    lane: "workflow-docs-tooling",
    allowedPaths: ["docs/workflow/**", "tools/auto-runner/test/*.test.mjs", "tools/auto-runner/lib/review-*.mjs"],
  };
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: lane, changedFiles: ["docs/workflow/a/b.md"] }).ok, true);
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: { ...lane, allowedPaths: ["tools/auto-runner/**"] }, changedFiles: ["tools/auto-runner/lib/review-fix-policy.mjs"] }).ok, true);
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: lane, changedFiles: ["tools/auto-runner/test/review-convergence.test.mjs"] }).ok, true);
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: lane, changedFiles: ["tools/auto-runner/test/nested/review.test.mjs"] }).ok, false);
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: lane, changedFiles: ["tools/auto-runner/lib/review-fix-policy.mjs"] }).ok, true);
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: { ...lane, allowedPaths: ["docs/**/bad.md"] }, changedFiles: ["docs/a/bad.md"] }).reason, "unsafe_contract_allowed_path:docs/**/bad.md");
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: { ...lane, allowedPaths: [`docs/workflow/${"*".repeat(17)}.md`] }, changedFiles: ["docs/workflow/a.md"] }).reason, `unsafe_contract_allowed_path:docs/workflow/${"*".repeat(17)}.md`);
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: { ...lane, allowedPaths: ["docs/workflow//bad.md"] }, changedFiles: ["docs/workflow/bad.md"] }).reason, "unsafe_contract_allowed_path:docs/workflow//bad.md");
  assert.equal(evaluateReviewFixContractPaths({ laneDecision: lane, changedFiles: [`docs/workflow/${"a".repeat(5000)}.md`] }).ok, true);
});

test("review-fix mutation decision permits approved sensitive fix and blocks malformed contracts", () => {
  const laneDecision = {
    lane: "auth-session-security",
    allowedToImplement: true,
    autoMergeEligible: true,
    manualMergeRequired: false,
    allowedPaths: ["services/api/**"],
    contract: { autoMergeEligible: true, manualMergeRequired: false },
  };
  const decision = evaluateReviewFixMutationDecision({
    config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
    laneDecision,
    changedFiles: ["services/api/Auth/Fix.cs"],
    validation: { passed: true, profile: "api-security" },
    externalReview: { status: "pass", tier: "strong_independent", verdict: "pass" },
    mergePolicy: { exactHeadRequired: true },
    trigger: { actionable: true, findings: ["fix"], source: "codex_mechanics" },
  });
  assert.equal(decision.allowed, true);
  const malformed = evaluateReviewFixMutationDecision({
    config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: -1 },
    laneDecision,
    changedFiles: ["services/api/Auth/Fix.cs"],
    validation: { passed: true, profile: "api-security" },
    trigger: { actionable: true, findings: ["fix"], source: "codex_mechanics" },
  });
  assert.equal(malformed.reason, "review_fix_budget_malformed");
});

test("sensitive Codex changes-requested safe-fix trigger can enter mutation but still requires final approval", () => {
  const laneDecision = {
    lane: "auth-session-security",
    allowedToImplement: true,
    autoMergeEligible: true,
    manualMergeRequired: false,
    allowedPaths: ["services/api/**"],
    contract: { autoMergeEligible: true, manualMergeRequired: false },
  };
  const review = {
    verdict: {
      verdict: "changes_requested",
      recommended_next_action: "run_safe_fix_cycle",
      blocking_findings: ["Fix bounded security issue"],
    },
  };
  const trigger = extractReviewFixTrigger({ review });
  const allowed = evaluateReviewFixMutationDecision({
    config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
    laneDecision,
    changedFiles: ["services/api/Auth/Fix.cs"],
    validation: { passed: true, profile: "api-security" },
    review,
    externalReview: { status: "pass", tier: "strong_independent", verdict: "pass" },
    mergePolicy: { exactHeadRequired: true },
  });
  assert.equal(trigger.actionable, true);
  assert.equal(allowed.allowed, true);
  assert.equal(evaluateReviewFixStrongGates({ laneDecision, validation: { passed: true, profile: "api-security" }, review, externalReview: { tier: "cheap_independent" }, trigger }).ok, false);
  assert.equal(evaluateReviewFixStrongGates({ laneDecision, validation: { passed: true, profile: "api-security" }, review, externalReview: { status: "pass", tier: "strong_independent", verdict: "pass" } }).ok, false);
  assert.equal(evaluateReviewFixStrongGates({ laneDecision, validation: { passed: true, profile: "api-security" }, review: { verdict: { verdict: "approved" } }, externalReview: { status: "pass", tier: "strong_independent", verdict: "pass" } }).ok, true);
  assert.equal(extractReviewFixTrigger({ review: { verdict: { verdict: "changes_requested", recommended_next_action: "manual_review", blocking_findings: ["manual"] } } }).actionable, false);
});

test("stack controller sequences parent merge, child retarget, delta proof, child merge, and hygiene", () => {
  const pr919 = { number: 919, state: "OPEN", baseRefName: "main", headRefName: "feature/parent", headRefOid: "9".repeat(40) };
  const pr920 = { number: 920, state: "OPEN", baseRefName: "feature/parent", headRefName: "feature/child", headRefOid: "8".repeat(40) };
  const plan = createDependentPrStackPlan({ issueNumber: 921, prs: [pr919, pr920] });
  assert.equal(validateStackRelationships(plan).ok, true);
  assert.equal(nextStackAction(plan, { recoverableActivePr: true }).action, "recover_active_pr");
  assert.deepEqual(nextStackAction(plan, { reviewConverged: { 919: true }, gatesPassed: { 919: true } }), { action: "merge_pr", prNumber: 919, expectedHead: "9".repeat(40) });
  assert.equal(nextStackAction(plan, { reviewConverged: { 919: true }, gatesPassed: { 919: true }, merged: { 919: true } }).action, "retarget_pr");
  assert.equal(nextStackAction(plan, { reviewConverged: { 919: true }, gatesPassed: { 919: true }, merged: { 919: true }, retargeted: { 920: true } }).action, "prove_own_delta");
  assert.equal(nextStackAction(plan, { reviewConverged: { 919: true, 920: true }, gatesPassed: { 919: true, 920: true }, merged: { 919: true }, retargeted: { 920: true }, ownDeltaPreserved: { 920: { ok: false } } }).action, "prove_own_delta");
  assert.equal(nextStackAction(plan, { reviewConverged: { 919: true }, gatesPassed: { 919: true }, merged: { 919: true }, retargeted: { 920: true }, ownDeltaPreserved: { 920: true } }).action, "converge_pr");
  assert.equal(nextStackAction(plan, { reviewConverged: { 919: true }, gatesPassed: { 919: true }, merged: { 919: true }, retargeted: { 920: true }, ownDeltaPreserved: { 920: { ok: true } } }).action, "converge_pr");
  assert.equal(nextStackAction(plan, { reviewConverged: { 919: true, 920: true }, gatesPassed: { 919: true }, merged: { 919: true }, retargeted: { 920: true }, ownDeltaPreserved: { 920: true } }).action, "complete_gates");
  assert.equal(nextStackAction(plan, { reviewConverged: { 919: true, 920: true }, gatesPassed: { 919: true, 920: true }, merged: { 919: true }, retargeted: { 920: true }, ownDeltaPreserved: { 920: true } }).action, "merge_pr");
  assert.equal(nextStackAction(plan, { reviewConverged: { 919: true, 920: true }, gatesPassed: { 919: true, 920: true }, merged: { 919: true, 920: true } }).action, "hygiene");
  const marker = recordStackMutationMarker(plan, { kind: "merge", key: "919", prNumber: 919, exactHead: "9".repeat(40) });
  assert.equal(recordStackMutationMarker(marker.plan, { kind: "merge", key: "919", prNumber: 919, exactHead: "9".repeat(40) }).duplicate, true);
});

test("semantic own-delta proof uses stable patch and normalized identities", () => {
  const delta = { fileSet: ["b", "a"], diffstat: { files: 2 }, numstat: { add: 3, del: 1 }, stablePatchId: "patch", normalizedPatch: "x", forwardPatchApplies: true, reversePatchApplies: true };
  assert.equal(proveSemanticOwnDelta(delta, { ...delta, fileSet: ["a", "b"] }).ok, true);
  assert.equal(proveSemanticOwnDelta(delta, { ...delta, stablePatchId: "other" }).ok, false);
  assert.equal(proveSemanticOwnDelta({ ...delta, stablePatchId: null }, delta).ok, false);
  assert.equal(proveSemanticOwnDelta(delta, { ...delta, reversePatchApplies: null }).ok, false);
});

test("live #919 -> #920 fixture plan is read-only and protects manual issues/canaries", () => {
  const fixture = buildReadOnlyLiveStackFixturePlan(
    { number: 919, state: "OPEN", baseRefName: "main", headRefName: "feature/auto-913-targeted-recovery-child-supervisor-20260716-1213", headRefOid: "0".repeat(40) },
    { number: 920, state: "OPEN", baseRefName: "feature/auto-913-targeted-recovery-child-supervisor-20260716-1213", headRefName: "feature/auto-913-outage-controller-reconciliation-20260716-1213", headRefOid: "1".repeat(40), isDraft: true },
  );
  assert.equal(fixture.relationship.ok, true);
  assert.equal(fixture.mutationAllowed, false);
  assert.deepEqual(fixture.protectedIssuesUntouched, [912, 913, 865, 866]);
  assert.equal(fixture.expectedSequence.includes("retarget_pr:920"), true);
});

test("notification policy suppresses per-cycle spam and dedupes terminal/final messages", () => {
  assert.equal(notificationDecisionForConvergence({ kind: "cycle" }).notify, false);
  assert.equal(notificationDecisionForConvergence({ kind: "stack_transition" }).notify, false);
  assert.equal(notificationDecisionForConvergence({ terminalReason: "NO_PROGRESS", stackId: "s", prNumber: 919 }).notify, true);
  assert.equal(notificationDecisionForConvergence({ kind: "stack_complete", stackId: "s" }).notify, true);
});

test("budget normalization reports requested normalized and hard maximum", () => {
  assert.deepEqual(normalizeConvergenceBudget({ maxReviewFixCycles: 51, allowReviewFixMutation: true, configPath: "cfg.json" }), {
    requested: 51,
    normalized: 50,
    hardMaximum: 50,
    enabled: true,
    malformed: false,
    policy: "clamp_to_hard_max",
  });
});

test("live review gate context preserves durable runner identity and enters convergence", () => {
  const exactHead = "c".repeat(40);
  const previousHead = "b".repeat(40);
  const durable = bindReviewConvergenceEvidence(
    {
      ...state({
        repository: "tommytang213/Settleora",
        issue: { number: 921, title: "Convergence" },
        pr: { number: 922, headRefName: "feature/convergence", baseRefName: "main", headRefOid: exactHead },
      }),
      sourceChangingCycle: 3,
      reviewRequests: { "old-request": { exactHead: previousHead } },
      mutationMarkers: { "push:cycle-3": { exactHead: previousHead } },
    },
    "review",
    { status: "passed", exactHead: previousHead },
  );
  const built = buildLiveReviewConvergenceContext({
    config: { repositorySlug: "tommytang213/Settleora", configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
    issue: { number: 921, title: "Convergence" },
    laneDecision: { lane: "workflow-docs-tooling" },
    branchName: "feature/convergence",
    exactHead,
    reviewConvergenceState: durable,
    reviewFixAttempts: [{ proceeded: true, decision: { sanitizedFindings: [{ path: "tools/auto-runner/a.mjs", title: "A" }] }, commit: { sha: previousHead } }],
    currentFindings: [{ provider: "codex", severity: "high", path: "tools/auto-runner/lib/auto-merge-policy.mjs", line: 533, title: "Wire gate" }],
  });
  assert.equal(built.context.repository, "tommytang213/Settleora");
  assert.equal(built.context.issue.number, 921);
  assert.equal(built.context.pr.number, 922);
  assert.equal(built.context.pr.exactHead, exactHead);
  assert.equal(built.context.sourceChangingCycle, 3);
  assert.equal(built.context.evidence.review.stale, true);
  assert.deepEqual(Object.keys(built.context.requestDedupeMarkers), ["old-request"]);
  assert.deepEqual(Object.keys(built.context.mutationDedupeMarkers), ["push:cycle-3"]);
  assert.equal(built.context.findingInventory.length, 1);
  assert.equal(evaluateCycleBudget(built.gateInput.reviewConvergenceState, built.gateInput.config, built.gateInput.reviewConvergenceHistory).ok, true);
});

test("live review gate context binds feature-bundle identity without competing state", () => {
  const built = buildLiveReviewConvergenceContext({
    config: { repositorySlug: "tommytang213/Settleora", configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
    issue: { number: 921, title: "Convergence" },
    branchName: "feature/bundle",
    exactHead: "d".repeat(40),
    sourceChangingCycle: 0,
    relationships: { bundleId: "bundle-921", sliceOrder: ["first", "second"] },
  });
  assert.equal(built.context.pr.number, 921);
  assert.equal(built.context.pr.branch, "feature/bundle");
  assert.equal(built.context.relationships.bundleId, "bundle-921");
  assert.deepEqual(built.context.relationships.sliceOrder, ["first", "second"]);
  assert.equal(evaluateCycleBudget(built.gateInput.reviewConvergenceState, built.gateInput.config, []).ok, true);
});

test("live review gate context keeps zero and exhausted budgets terminal", () => {
  const built = buildLiveReviewConvergenceContext({
    config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 0 },
    issue: { number: 921, title: "Convergence" },
    branchName: "feature/convergence",
    exactHead: "e".repeat(40),
    sourceChangingCycle: 0,
  });
  assert.equal(evaluateCycleBudget(built.gateInput.reviewConvergenceState, built.gateInput.config, []).terminalReason, "MANUAL_DECISION_REQUIRED");
  const exhausted = buildLiveReviewConvergenceContext({
    config: { configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 },
    issue: { number: 921, title: "Convergence" },
    branchName: "feature/convergence",
    exactHead: "f".repeat(40),
    reviewConvergenceState: {
      ...built.gateInput.reviewConvergenceState,
      sourceChangingCycle: 50,
      epochDiagnosticStarted: true,
      pr: { ...built.gateInput.reviewConvergenceState.pr, exactHead: "f".repeat(40) },
    },
  });
  assert.equal(evaluateCycleBudget(exhausted.gateInput.reviewConvergenceState, exhausted.gateInput.config, []).terminalReason, "CYCLE_BUDGET_EXHAUSTED");
});

test("live callers continue bounded convergence instead of stopping at pre-push gate", () => {
  const runnerSource = readFileSync(new URL("../settleora-auto-runner.mjs", import.meta.url), "utf8");
  const runnerGate = runnerSource.slice(
    runnerSource.indexOf("while (true) {"),
    runnerSource.indexOf("recoveryRecorder?.advance(\"push\"", runnerSource.indexOf("while (true) {")),
  );
  assert.match(runnerGate, /prePushReviewGate\.outcome !== "review_convergence_required"/);
  assert.match(runnerGate, /run_bounded_review_convergence/);
  assert.match(runnerGate, /run_bounded_codex_review_convergence/);
  assert.match(runnerGate, /runReviewFixCycle\(config/);
  assert.match(runnerGate, /commitReviewFixAndRerunExactHeadReviews\(config/);
  assert.match(runnerGate, /review_convergence_fix_commit/);
  assert.match(runnerGate, /codex_review_convergence_fix_commit/);
  assert.match(runnerGate, /recordPostFixExactHeadEvidence\(recoveryRecorder/);
  assert.match(runnerSource, /completeHeadEvidence\(evidenceByKind/);
  assert.match(runnerSource, /persistCompleteHeadEvidence\(config, state, evidenceByKind, identity\)/);
  assert.match(runnerGate, /iteration\.validation = bindValidationEvidence\(postFix\.validation/);
  assert.doesNotMatch(
    runnerSource.slice(
      runnerSource.indexOf("if (config.requirePrePrReview && config.dryRun"),
      runnerSource.indexOf("while (true) {"),
    ),
    /!config\.dryRun && iteration\.review\.verdict\.verdict !== "approve"[\s\S]*review_changes_requested_retry_exhausted/,
  );

  const bundleSource = readFileSync(new URL("../lib/feature-bundle-orchestrator.mjs", import.meta.url), "utf8");
  assert.match(bundleSource, /runBundleReviewConvergence\(config/);
  assert.match(bundleSource, /evaluateCycleBudget\(state\.reviewConvergenceState/);
  assert.match(bundleSource, /dependencies\.runFixCycle\(config/);
  assert.match(bundleSource, /dependencies\.commitAndRerun\(config/);
  assert.match(bundleSource, /accountConvergenceEvent\(state\.reviewConvergenceState/);
  assert.match(bundleSource, /run_bundle_codex_review_convergence/);
  assert.match(bundleSource, /persistBundleExactHeadEvidence\(recovery/);
  assert.match(bundleSource, /completeHeadEvidence\(evidenceByKind/);
  const initialReviewBlock = bundleSource.slice(
    bundleSource.indexOf("const reviewFingerprintBefore = captureBundleReviewCheckoutFingerprint(config);"),
    bundleSource.indexOf("const finalEvidence = persistBundleExactHeadEvidence(recovery"),
  );
  assert.match(initialReviewBlock, /compareBundleReviewCheckoutFingerprint\(reviewFingerprintBefore/);
  assert.match(initialReviewBlock, /stopForBundleReviewMutation/);
  assert.match(initialReviewBlock, /compareBundleReviewCheckoutFingerprint\(codexReviewFingerprintBefore/);
  assert.match(initialReviewBlock, /result\.reviewMutationGuard/);
});

test("feature-bundle Codex non-approve invokes bounded executor and consumes one source cycle only after new head", async () => {
  const newHead = "b".repeat(40);
  const persisted = [];
  const input = bundleConvergenceInput({
    writeState(nextState) {
      input.state = nextState;
    },
  });
  const result = await runBundleReviewConvergence({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 }, input, {
    async runFixCycle(_config, context) {
      assert.equal(context.source, "codex_mechanics_security_review");
      assert.equal(context.attemptCount, 7);
      return {
        proceeded: true,
        reason: "review_fix_passed_revalidation",
        decision: { sanitizedFindings: ["Run bundle Codex failures through convergence fixes"] },
        changedFilesAfter: ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"],
        forbiddenChangedFilesAfter: [],
        validationAfter: { passed: true, profile: "runner-tests", changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
      };
    },
    async commitAndRerun() {
      return {
        runnerCreatedCommitSha: newHead,
        changedFiles: ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"],
        forbiddenChangedFiles: [],
        validation: { passed: true, profile: "runner-tests", changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        externalReview: { status: "pass", verdict: "pass", tier: "strong_independent", reviewedHead: newHead, changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        review: { verdict: { verdict: "approve" }, reviewedHead: newHead, changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        reviewPackage: { packagePath: "/tmp/package.json" },
        reviewMutationGuard: { mutationDetected: false },
      };
    },
    evaluatePrePushGate() {
      return { ok: true, reason: "pre_push_review_gates_passed" };
    },
    persistExactHeadEvidence(_recovery, evidence) {
      persisted.push(evidence);
      return { ok: true, changedFilesDigest: digestChangedFiles(evidence.changedFiles) };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.sourceChangingCycle, 8);
  assert.equal(result.state.reviewConvergenceState.sourceChangingCycle, 8);
  assert.equal(result.state.reviewConvergenceState.pr.exactHead, newHead);
  assert.equal(result.result.validation.headSha, newHead);
  assert.equal(result.result.validation.changedFilesDigest, digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]));
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].headSha, newHead);
  assert.equal(persisted[0].externalReview.reviewedHead, newHead);
  assert.deepEqual(input.recovery.actions.filter((action) => action[0] === "advance")[0], ["advance", "review_fix", "run_bundle_codex_review_convergence"]);
});

test("feature-bundle convergence restart skips completed slices and does not duplicate source cycle before mutation", async () => {
  const input = bundleConvergenceInput({
    sourceChangingCycle: 8,
    writeState(nextState) {
      input.state = nextState;
    },
  });
  const beforeSlices = JSON.stringify(input.state.slices);
  const result = await runBundleReviewConvergence({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 }, input, {
    async runFixCycle(_config, context) {
      assert.equal(context.attemptCount, 8);
      return { proceeded: false, reason: "review_fix_left_no_changed_files", decision: { sanitizedFindings: [] } };
    },
    async commitAndRerun() {
      throw new Error("commit should not run");
    },
    persistExactHeadEvidence() {
      throw new Error("evidence should not persist without a new head");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.state.sourceChangingCycle, 8);
  assert.equal(result.state.reviewConvergenceState.sourceChangingCycle, 8);
  assert.equal(JSON.stringify(result.state.slices), beforeSlices);
});

test("feature-bundle convergence fail-closes unsafe non-proceeded fixes without push authority", async () => {
  const input = bundleConvergenceInput({
    writeState(nextState) {
      input.state = nextState;
    },
  });
  const result = await runBundleReviewConvergence({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 }, input, {
    async runFixCycle() {
      return {
        proceeded: false,
        reason: "review_fix_forbidden_changed_files:services/api/Program.cs",
        decision: { sanitizedFindings: ["unsafe"] },
      };
    },
    async commitAndRerun() {
      throw new Error("unsafe fix must not commit");
    },
    persistExactHeadEvidence() {
      throw new Error("unsafe fix must not persist final evidence");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "scope_failed");
  assert.equal(result.state.finalization.state, "failed");
  assert.equal(result.state.sourceChangingCycle, 7);
  assert.deepEqual(input.recovery.actions.find((action) => action[0] === "stop"), [
    "stop",
    "bundle_review_convergence_fix_not_proceeded",
    "review_fix_forbidden_changed_files:services/api/Program.cs",
    "stop_fail_closed",
  ]);
});

test("feature-bundle convergence fails closed when post-fix review mutates checkout before evidence or cycle accounting", async () => {
  const input = bundleConvergenceInput({
    writeState(nextState) {
      input.state = nextState;
    },
  });
  const result = await runBundleReviewConvergence({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 }, input, {
    async runFixCycle() {
      return {
        proceeded: true,
        reason: "review_fix_passed_revalidation",
        decision: { sanitizedFindings: [{ provider: "codex", path: "tools/auto-runner/lib/feature-bundle-orchestrator.mjs", line: 705, title: "Stop pushing" }] },
        changedFilesAfter: ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"],
        forbiddenChangedFilesAfter: [],
        validationAfter: { passed: true, profile: "runner-tests", changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
      };
    },
    async commitAndRerun() {
      return {
        runnerCreatedCommitSha: "b".repeat(40),
        changedFiles: ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"],
        forbiddenChangedFiles: [],
        validation: { passed: true, profile: "runner-tests", changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        externalReview: { status: "pass", verdict: "pass", tier: "strong_independent", reviewedHead: "b".repeat(40), changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        review: { verdict: { verdict: "approve" }, reviewedHead: "c".repeat(40), changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        reviewPackage: { packagePath: "/tmp/package.json" },
        reviewMutationGuard: {
          mutationDetected: true,
          phase: "bundle_convergence_codex_review",
          changedFields: ["head"],
          before: { branch: "feature/bundle", head: "b".repeat(40), status: "", untracked: [] },
          after: { branch: "feature/bundle", head: "c".repeat(40), status: "", untracked: [] },
          reason: "Bundle review command mutated checkout during bundle_convergence_codex_review: head",
        },
      };
    },
    persistExactHeadEvidence() {
      throw new Error("review-created mutation must stop before exact-head evidence persistence");
    },
    evaluatePrePushGate() {
      throw new Error("review-created mutation must stop before pre-push gate");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "bundle_review_mutation_detected_after_convergence");
  assert.equal(result.state.sourceChangingCycle, 7);
  assert.equal(result.state.reviewConvergenceState.sourceChangingCycle, 7);
  assert.equal(result.state.reviewConvergenceState.pr.exactHead, "a".repeat(40));
  assert.equal(result.state.reviewConvergenceState.reviewMutationGuard.mutationDetected, true);
  assert.deepEqual(result.state.reviewConvergenceState.reviewMutationGuard.changedFields, ["head"]);
  assert.equal(result.state.reviewConvergenceHistory, undefined);
});

test("feature-bundle history fingerprints structured current findings separately from claimed fixes", async () => {
  const attemptedOne = {
    provider: "codex",
    severity: "high",
    path: "tools/auto-runner/lib/feature-bundle-orchestrator.mjs",
    line: 560,
    title: "Fingerprint real review findings in history",
    body: "attempted first",
    ruleId: "history",
    authorityInvariant: "stable history",
  };
  const attemptedTwo = {
    provider: "gemini",
    severity: "medium",
    path: "tools/auto-runner/lib/feature-bundle-orchestrator.mjs",
    line: 705,
    title: "Stop pushing after bundle review mutations",
    body: "attempted second",
    ruleId: "mutation",
    authorityInvariant: "no push before approval",
  };
  const remaining = {
    provider: "gemini",
    severity: "medium",
    path: "tools/auto-runner/lib/feature-bundle-orchestrator.mjs",
    line: 705,
    title: "Still dirty after review",
    body: "checkout dirtied",
    ruleId: "mutation",
    authorityInvariant: "no push before approval",
  };
  const input = bundleConvergenceInput({
    writeState(nextState) {
      input.state = nextState;
    },
  });
  const result = await runBundleReviewConvergence({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 }, input, {
    async runFixCycle() {
      return {
        proceeded: true,
        reason: "review_fix_passed_revalidation",
        decision: { sanitizedFindings: [attemptedOne, attemptedTwo] },
        changedFilesAfter: ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"],
        forbiddenChangedFilesAfter: [],
        validationAfter: { passed: true, profile: "runner-tests", changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
      };
    },
    async commitAndRerun() {
      return {
        runnerCreatedCommitSha: "b".repeat(40),
        changedFiles: ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"],
        forbiddenChangedFiles: [],
        validation: { passed: true, profile: "runner-tests", changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        externalReview: {
          status: "fail",
          verdict: "fail",
          tier: "strong_independent",
          reviewedHead: "b".repeat(40),
          changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]),
          sanitizedResponseSummary: { findings: [remaining] },
        },
        review: { verdict: { verdict: "approve" }, reviewedHead: "b".repeat(40), changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        reviewPackage: { packagePath: "/tmp/package.json" },
        reviewMutationGuard: { mutationDetected: false },
      };
    },
    evaluatePrePushGate() {
      return { ok: true, reason: "pre_push_review_gates_passed" };
    },
    persistExactHeadEvidence() {
      return { ok: true };
    },
  });
  const history = result.state.reviewConvergenceHistory;
  assert.equal(result.ok, true);
  assert.equal(history.length, 1);
  assert.deepEqual(history[0].findingFingerprints, [fingerprintReviewFinding(remaining).fingerprint]);
  assert.deepEqual(history[0].claimedFixedFingerprints, [
    fingerprintReviewFinding(attemptedOne).fingerprint,
    fingerprintReviewFinding(attemptedTwo).fingerprint,
  ].sort());
  assert.equal(new Set(history[0].claimedFixedFingerprints).size, 2);
  assert.doesNotMatch(JSON.stringify(history), /\[object Object\]/);

  const roundTrip = JSON.parse(JSON.stringify(history));
  assert.deepEqual(roundTrip, history);
  assert.equal(analyzeConvergenceProgress([
    { findingFingerprints: history[0].claimedFixedFingerprints, claimedFixedFingerprints: history[0].claimedFixedFingerprints, patchId: "p1" },
    { findingFingerprints: [], patchId: "p2" },
    { findingFingerprints: [history[0].claimedFixedFingerprints[0]], patchId: "p3" },
  ]).terminalReason, "NO_PROGRESS");
});

test("feature-bundle history records clean post-fix reviews as empty current findings", async () => {
  const attempted = "Stop pushing after bundle review mutations";
  const input = bundleConvergenceInput({
    writeState(nextState) {
      input.state = nextState;
    },
  });
  const result = await runBundleReviewConvergence({ configPath: "cfg.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 }, input, {
    async runFixCycle() {
      return {
        proceeded: true,
        reason: "review_fix_passed_revalidation",
        decision: { sanitizedFindings: [attempted] },
        changedFilesAfter: ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"],
        forbiddenChangedFilesAfter: [],
        validationAfter: { passed: true, profile: "runner-tests", changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
      };
    },
    async commitAndRerun() {
      return {
        runnerCreatedCommitSha: "b".repeat(40),
        changedFiles: ["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"],
        forbiddenChangedFiles: [],
        validation: { passed: true, profile: "runner-tests", changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        externalReview: { status: "pass", verdict: "pass", tier: "strong_independent", reviewedHead: "b".repeat(40), changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        review: { verdict: { verdict: "approve" }, reviewedHead: "b".repeat(40), changedFilesDigest: digestChangedFiles(["tools/auto-runner/lib/feature-bundle-orchestrator.mjs"]) },
        reviewPackage: { packagePath: "/tmp/package.json" },
        reviewMutationGuard: { mutationDetected: false },
      };
    },
    evaluatePrePushGate() {
      return { ok: true, reason: "pre_push_review_gates_passed" };
    },
    persistExactHeadEvidence() {
      return { ok: true };
    },
  });
  const history = result.state.reviewConvergenceHistory;
  assert.equal(result.ok, true);
  assert.deepEqual(history[0].findingFingerprints, []);
  assert.deepEqual(history[0].claimedFixedFingerprints, [
    fingerprintReviewFinding({ provider: "codex", source: "codex_mechanics_security_review", severity: "unknown", title: attempted, body: attempted }).fingerprint,
  ]);
});
