import assert from "node:assert/strict";
import test from "node:test";
import { createInitialRecoveryState, bindRecoveryEvidence, invalidateEvidenceForHeadChange } from "../lib/recovery-state.mjs";
import {
  classifyCiFailure,
  classifyScannerFinding,
  evaluateCurrentMainScannerReconciliation,
  evaluateExistingPrRecovery,
  evaluateReviewFixCycle,
  failureFingerprint,
  planFollowupForRepeatedFailure,
} from "../lib/recovery-orchestrator.mjs";

const branchName = "feature/auto-893-recovery-20260713t112700";
const headSha = "c".repeat(40);
const changedFiles = ["tools/auto-runner/lib/recovery-orchestrator.mjs"];
const laneDecision = {
  lane: "workflow-docs-tooling",
  allowedToImplement: true,
  allowedPaths: ["tools/auto-runner/**", "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
  laneManifestAllowedPaths: ["tools/auto-runner/**", "docs/workflow/**", "scripts/ai/**"],
};

function issue(overrides = {}) {
  return { number: 893, state: "OPEN", labels: [], title: "Recovery", ...overrides };
}

function pr(overrides = {}) {
  return {
    number: 905,
    url: "https://github.com/tommytang213/Settleora/pull/905",
    state: "OPEN",
    repository: "tommytang213/Settleora",
    baseRefName: "main",
    headRefName: branchName,
    headRefOid: headSha,
    title: "Bundle 4 recovery #893",
    body: "Implements #893 and updates #800.",
    ...overrides,
  };
}

function state() {
  let recovery = createInitialRecoveryState({
    taskKey: "20260713-1927",
    issue: issue(),
    runId: "run-2026-07-13T112700Z",
    branchName,
    baseSha: "b".repeat(40),
    currentHeadSha: headSha,
  });
  recovery = bindRecoveryEvidence(recovery, "localValidation", { status: "passed", headSha, changedFiles });
  return recovery;
}

function evidence(overrides = {}) {
  return {
    validation: { status: "passed", headSha },
    externalReview: { status: "passed", headSha, tier: "cheap_independent" },
    codexReview: { status: "passed", headSha },
    ...overrides,
  };
}

test("recovers runner-owned PR with exact linkage and matching branch/head", () => {
  const result = evaluateExistingPrRecovery({
    allowExistingPrRecovery: true,
    issue: issue(),
    pr: pr(),
    laneDecision,
    changedFiles,
    recoveryState: state(),
    evidence: evidence(),
    worktreeClean: true,
    expectedRepository: "tommytang213/Settleora",
  });
  assert.equal(result.ok, true);
  assert.equal(result.reasonCode, "existing_pr_recovery_gates_passed");
});

test("rejects arbitrary unowned PR and ambiguous multiple PRs", () => {
  assert.equal(
    evaluateExistingPrRecovery({
      allowExistingPrRecovery: true,
      issue: issue(),
      pr: pr({ headRefName: "user/random-branch" }),
      laneDecision,
      changedFiles,
      recoveryState: state(),
      evidence: evidence(),
    }).reasonCode,
    "existing_pr_recovery_unowned_pr_branch",
  );
  assert.equal(
    evaluateExistingPrRecovery({
      allowExistingPrRecovery: true,
      issue: issue(),
      pr: pr(),
      laneDecision,
      changedFiles,
      ambiguousPrCount: 2,
      recoveryState: state(),
      evidence: evidence(),
    }).reasonCode,
    "existing_pr_recovery_ambiguous_multiple_prs",
  );
});

test("recovers pushed branch after lost PR-create response without duplicate PR", () => {
  const result = evaluateExistingPrRecovery({
    allowExistingPrRecovery: true,
    issue: issue(),
    pr: pr({ title: "Lost create response #893" }),
    laneDecision,
    changedFiles,
    recoveryState: null,
    allowStateRebuildFromEvidence: true,
    evidence: evidence(),
    worktreeClean: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.nextAction, "resume_exact_head_final_refresh");
});

test("regenerates missing exact-head validation/review evidence and rejects stale evidence", () => {
  const missing = evaluateExistingPrRecovery({
    allowExistingPrRecovery: true,
    issue: issue(),
    pr: pr(),
    laneDecision,
    changedFiles,
    recoveryState: state(),
    evidence: { ...evidence(), externalReview: null },
  });
  assert.equal(missing.ok, true);
  assert.equal(missing.nextAction, "regenerate_exact_head_evidence");
  const stale = evaluateExistingPrRecovery({
    allowExistingPrRecovery: true,
    issue: issue(),
    pr: pr(),
    laneDecision,
    changedFiles,
    recoveryState: state(),
    evidence: { ...evidence(), codexReview: { status: "passed", headSha: "d".repeat(40) } },
  });
  assert.equal(stale.reasonCode, "stale_codexReview_evidence");
});

test("recovers CI-pending and merged PR states", () => {
  assert.equal(
    evaluateExistingPrRecovery({
      allowExistingPrRecovery: true,
      issue: issue(),
      pr: pr(),
      laneDecision,
      changedFiles,
      recoveryState: state(),
      evidence: evidence(),
      ciStatus: "pending",
    }).nextAction,
    "resume_ci_wait",
  );
  assert.equal(
    evaluateExistingPrRecovery({
      allowExistingPrRecovery: true,
      issue: issue(),
      pr: pr({ state: "MERGED" }),
      laneDecision,
      changedFiles,
      recoveryState: state(),
      evidence: evidence(),
      postMergeCurrentMainEvidence: { cleared: false },
    }).nextAction,
    "reconcile_current_main",
  );
});

test("review fixes are focused, lane-aware, and require strong rereview on sensitive lanes", () => {
  const finding = { actionable: true, source: "codex", path: changedFiles[0], line: 12, message: "Fix null check" };
  assert.equal(evaluateReviewFixCycle({ finding, laneDecision }).allowed, true);
  assert.equal(
    evaluateReviewFixCycle({ finding, laneDecision: { ...laneDecision, lane: "api-domain-runtime" } }).requiresStrongRereview,
    true,
  );
  assert.equal(
    evaluateReviewFixCycle({ finding: { ...finding, path: "services/api/Auth.cs" }, laneDecision }).reasonCode,
    "review_fix_out_of_contract",
  );
});

test("repeated identical review failure creates or reuses one follow-up issue", () => {
  const fingerprint = failureFingerprint({ source: "codex", rule: "same", path: changedFiles[0] });
  let recovery = state();
  const first = planFollowupForRepeatedFailure(recovery, { kind: "review", fingerprint, title: "Focused follow-up" });
  assert.equal(first.action, "create_or_reuse_followup_issue");
  const second = planFollowupForRepeatedFailure(first.state, { kind: "review", fingerprint, title: "Focused follow-up" });
  assert.equal(second.action, "reuse_followup_issue");
  assert.equal(second.duplicate, true);
});

test("CI classification distinguishes transient infrastructure from bounded code fixes", () => {
  const infra = classifyCiFailure({ workflow: "Scaffold", job: "Validate", step: "runner unavailable timeout" });
  assert.equal(infra.mutate, false);
  assert.equal(infra.nextAction, "wait_retry_bounded");
  const code = classifyCiFailure({ workflow: "Scaffold", job: "Validate", step: "npm test", command: "node --test", exitCode: 1 });
  assert.equal(code.mutate, true);
  assert.equal(code.nextAction, "run_focused_ci_fix");
  const forbidden = classifyCiFailure({ step: "fix", command: "x", requiresWorkflowWeakening: true });
  assert.equal(forbidden.nextAction, "escalate_action");
});

test("scanner evidence creates bounded fixes and rejects dismissal suppression or config weakening", () => {
  const safe = classifyScannerFinding({
    tool: "CodeQL",
    ruleId: "js/example",
    path: changedFiles[0],
    line: 10,
    state: "open",
  });
  assert.equal(safe.mutate, true);
  assert.equal(safe.nextAction, "run_focused_scanner_fix");
  for (const bad of [
    { proposedAction: "dismiss_alert" },
    { suppressionRequested: true },
    { workflowWeakeningRequested: true },
    { dismissalReason: "false positive" },
  ]) {
    assert.equal(classifyScannerFinding({ ...safe, tool: "CodeQL", ruleId: "x", path: changedFiles[0], line: 1, ...bad }).mutate, false);
  }
});

test("baseline-aware scanners block closure until current-main evidence clears", () => {
  const missingHead = classifyScannerFinding({
    tool: "CodeQL",
    ruleId: "cs/sensitive-data-transmission",
    path: changedFiles[0],
    line: 10,
    baselineAware: true,
    prHeadEvidence: { cleared: false },
  });
  assert.equal(missingHead.nextAction, "regenerate_exact_head_scanner_evidence");
  const missingMain = classifyScannerFinding({
    tool: "CodeQL",
    ruleId: "cs/sensitive-data-transmission",
    path: changedFiles[0],
    line: 10,
    baselineAware: true,
    prHeadEvidence: { cleared: true },
    currentMainEvidence: { cleared: false },
  });
  assert.equal(missingMain.nextAction, "reconcile_current_main_scanner");
  assert.equal(evaluateCurrentMainScannerReconciliation({ prHeadEvidence: { cleared: true }, currentMainEvidence: { cleared: false } }).nextAction, "keep_issue_open");
});

test("scanner fix head change invalidates every prior evidence binding", () => {
  let recovery = state();
  recovery = bindRecoveryEvidence(recovery, "ciChecks", { status: "passed", headSha, changedFiles });
  recovery = bindRecoveryEvidence(recovery, "codeScanning", { status: "passed", headSha, changedFiles });
  recovery = invalidateEvidenceForHeadChange(recovery, { newHeadSha: "d".repeat(40), reasonCode: "scanner_fix_committed" });
  assert.equal(recovery.evidence.localValidation.stale, true);
  assert.equal(recovery.evidence.ciChecks.stale, true);
  assert.equal(recovery.evidence.codeScanning.stale, true);
});
