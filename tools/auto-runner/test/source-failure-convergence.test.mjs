import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySourceFailure,
  evaluateSourceFailureBatch,
  freezeSourceFailureBatch,
  normalizeSourceFailure,
  sourceFailureStatusProjection,
  sourceFailuresFromGithubEvidence,
  sourceFailuresFromValidation,
} from "../lib/source-failure-convergence.mjs";
import { continueOrdinaryCandidate, createOrdinaryContinuationState } from "../lib/ordinary-candidate-continuation.mjs";
import { inferMobileBuildPlatformRequirements, mobileBuildPlatformChecks, planValidation } from "../lib/validation-planner.mjs";
import { evaluateReviewFixMutationDecision, evaluateSourceFailureFixMutationDecision } from "../lib/review-fix-policy.mjs";
import { classifyFailedCheckLogFailureType } from "../lib/auto-merge-policy.mjs";

const sha = (character) => character.repeat(40);
const digest = (character) => character.repeat(64);
const identity = (head = "b") => ({ baseSha: sha("a"), headSha: sha(head), treeSha: sha("c"), diffDigest: digest("d"), changedFilesDigest: digest("e"), changedFiles: ["tools/auto-runner/lib/example.mjs"] });

test("normalizes bounded sanitized exact-candidate source failures", () => {
  const finding = normalizeSourceFailure({
    sourceKind: "local_validation", repository: "tommytang213/Settleora", issueNumber: 944,
    identity: identity(), command: "node --test", structuredEvidence: true, failureType: "source",
    diagnostic: `Assertion failed ghp_${"x".repeat(80)}`, path: "tools/auto-runner/test/example.test.mjs", line: 12,
  });
  assert.equal(finding.classification, "source_fix_safe");
  assert.equal(finding.sourceFixEligible, true);
  assert.match(finding.fingerprint, /^[a-f0-9]{64}$/);
  assert.match(finding.diagnosticDigest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(finding).includes("ghp_"), false);
  assert.equal(Object.hasOwn(finding, "diagnostic"), false);
});

test("classifies pending transient auth actionable and ambiguous CI without guessing from red", () => {
  assert.equal(classifySourceFailure({ sourceKind: "github_check", status: "queued" }).classification, "pending");
  assert.equal(classifySourceFailure({ sourceKind: "github_check", structuredEvidence: true, diagnostic: "hosted runner lost network" }).classification, "retryable_provider");
  assert.equal(classifySourceFailure({ sourceKind: "local_validation", status: 1, structuredEvidence: true, failureType: "source", diagnostic: "TimeoutException with pending timers after a deterministic test assertion" }).classification, "source_fix_safe");
  assert.equal(classifySourceFailure({ sourceKind: "github_check", structuredEvidence: true, diagnostic: "missing secret for registry" }).classification, "credential_or_auth_required");
  assert.equal(classifySourceFailure({ sourceKind: "github_check", structuredEvidence: true, failureType: "source", diagnostic: "compiler error" }).classification, "source_fix_safe");
  assert.equal(classifySourceFailure({ sourceKind: "github_check", status: "failure", structuredEvidence: false }).classification, "unsafe_or_ambiguous");
  const [inferred] = sourceFailuresFromValidation({ passed: false, profile: "workflow-tooling", results: [{ command: "npm test", status: 1, stderr: "dependency download timeout; build failed with exit code 1" }] }, { identity: identity(), inContract: true });
  assert.equal(freezeSourceFailureBatch([inferred], identity()).findings[0].classification, "retryable_infrastructure");
});

test("GitHub failed-check log hints keep transient infrastructure ahead of broad source text", () => {
  assert.equal(classifyFailedCheckLogFailureType("dependency download timeout; build failed"), null);
  assert.equal(classifyFailedCheckLogFailureType("network connection reset after compiler failed"), null);
  assert.equal(classifyFailedCheckLogFailureType("test failed: expected 2 but received 3"), "source");
});

test("scanner findings require exact structured identity and reject suppression", () => {
  const base = { sourceKind: "semgrep", structuredEvidence: true, headSha: sha("b"), path: "tools/auto-runner/lib/x.mjs", ruleId: "js.example", inContract: true };
  assert.equal(classifySourceFailure(base).classification, "source_fix_safe");
  assert.equal(classifySourceFailure({ ...base, requestedAction: "suppress_rule" }).classification, "manual_action_required");
  assert.equal(classifySourceFailure({ ...base, path: null }).classification, "unsafe_or_ambiguous");
  assert.equal(classifySourceFailure({ ...base, headSha: sha("f"), identity: { headSha: sha("b") }, path: null }).classification, "unsafe_or_ambiguous");
  const staleBatch = freezeSourceFailureBatch([{ ...base, headSha: sha("f") }], identity());
  assert.equal(staleBatch.findings[0].classification, "unsafe_or_ambiguous");
});

test("scanner REST field names preserve authoritative path and line", () => {
  const [finding] = sourceFailuresFromGithubEvidence({ codeScanningAlerts: [{ state: "open", tool: { name: "CodeQL" }, rule: { id: "js/x", description: "finding" }, most_recent_instance: { commit_sha: sha("b"), location: { path: "tools/auto-runner/lib/x.mjs", start_line: 12 } } }] }, { identity: identity(), inContract: true });
  assert.equal(finding.path, "tools/auto-runner/lib/x.mjs");
  assert.equal(finding.line, 12);
});

test("scanner evidence outside the task contract is fail-closed", () => {
  const [finding] = sourceFailuresFromGithubEvidence({ codeScanningAlerts: [{ state: "open", tool: "CodeQL", ruleId: "js/x", path: "services/api/Auth.cs", line: 7, headSha: sha("b"), scopeAllowed: false }] }, { identity: identity(), inContract: true });
  assert.equal(freezeSourceFailureBatch([finding], identity()).findings[0].classification, "out_of_contract");
});

test("GitHub CI and scanner adapters require structured exact-head evidence", () => {
  const findings = sourceFailuresFromGithubEvidence({
    requiredChecks: [{ name: "tests", status: "failure", step: "node test", command: "npm test", sanitizedLogExcerpt: "Assertion failed", failureType: "source" }],
    codeScanningAlerts: [{ state: "open", tool: "CodeQL", ruleId: "js/xss", path: "tools/auto-runner/lib/x.mjs", line: 4, headSha: sha("b") }],
  }, { identity: identity(), inContract: true });
  const batch = freezeSourceFailureBatch(findings, identity());
  assert.equal(batch.findings.length, 2);
  assert.ok(batch.findings.every((finding) => finding.classification === "source_fix_safe"));
  const unstructured = freezeSourceFailureBatch(sourceFailuresFromGithubEvidence({ requiredChecks: [{ name: "tests", status: "failure" }] }, { identity: identity() }), identity());
  assert.equal(unstructured.findings[0].classification, "unsafe_or_ambiguous");
});

test("completed successful GitHub checks are not normalized as failures", () => {
  const failures = sourceFailuresFromGithubEvidence({ requiredChecks: [{ name: "Validate scaffold", status: "COMPLETED", conclusion: "SUCCESS" }] }, { identity: identity() });
  assert.deepEqual(failures, []);
});

test("freezes and deduplicates one batch and durably stops identical no-progress", () => {
  const finding = { sourceKind: "local_validation", structuredEvidence: true, failureType: "source", diagnostic: "test failed assertion", identity: identity() };
  const batch = freezeSourceFailureBatch([finding, finding], identity());
  assert.equal(batch.findings.length, 1);
  assert.equal(evaluateSourceFailureBatch(batch).classification, "source_fix_safe");
  const history = [{ batchIdentity: batch.batchIdentity, candidate: batch.candidate }, { batchIdentity: batch.batchIdentity, candidate: batch.candidate }];
  assert.equal(evaluateSourceFailureBatch(batch, history).classification, "no_progress_or_oscillation");
});

test("head-independent finding signatures detect recurring replacement failures", () => {
  const first = freezeSourceFailureBatch([{ sourceKind: "local_validation", structuredEvidence: true, failureType: "source", diagnostic: "same assertion failed", identity: identity("b") }], identity("b"));
  const replacement = freezeSourceFailureBatch([{ sourceKind: "local_validation", structuredEvidence: true, failureType: "source", diagnostic: "same assertion failed", identity: identity("f") }], identity("f"));
  assert.equal(first.findingSetSignature, replacement.findingSetSignature);
  const history = [first, first].map((batch) => ({ batchIdentity: batch.batchIdentity, findingSetSignature: batch.findingSetSignature, candidate: batch.candidate }));
  assert.equal(evaluateSourceFailureBatch(replacement, history).classification, "no_progress_or_oscillation");
});

test("ordinary continuation routes validation source failure through one focused fix and full recertification", async () => {
  const calls = [];
  const state = createOrdinaryContinuationState({ logicalTaskKey: "944", issueNumber: 944, branchName: "feature/auto-944-x", identity: identity(), phase: "local_validation" });
  let failed = false;
  const handlers = Object.fromEntries(["external_review", "codex_review", "structured_review", "review_convergence", "push", "pr_create_or_update", "github_convergence", "merge", "post_merge_hygiene", "post_merge_cleanup"].map((phase) => [phase, async () => { calls.push(phase); return { ok: true }; }]));
  handlers.local_validation = async (current) => {
    calls.push(`validate:${current.identity.headSha[0]}`);
    if (!failed) {
      failed = true;
      return { ok: true, sourceFailures: [{ sourceKind: "local_validation", structuredEvidence: true, failureType: "source", diagnostic: "test failed assertion", identity: current.identity }] };
    }
    return { ok: true };
  };
  handlers.source_failure_fix = async (_current, context) => {
    calls.push(`fix:${context.originatingPhase}`);
    return { ok: true, sourceChanged: true, identity: identity("f"), evidence: { commit: sha("f") } };
  };
  const result = await continueOrdinaryCandidate(state, handlers);
  assert.equal(result.outcome, "complete");
  assert.deepEqual(calls.slice(0, 4), ["validate:b", "fix:local_validation", "validate:f", "external_review"]);
  assert.equal(result.state.counters.acceptedLogicalTasks, 1);
  assert.equal(result.state.counters.localSourceChangingRoundsPerEpoch, 1);
  assert.equal(result.state.counters.lifetimeLocalSourceChangingRounds, 1);
  assert.ok(calls.indexOf("push") > calls.indexOf("codex_review"));
});

test("ordinary continuation recursively repairs a second actionable validation failure", async () => {
  let validations = 0;
  let fixes = 0;
  const state = createOrdinaryContinuationState({ logicalTaskKey: "944", issueNumber: 944, branchName: "feature/auto-944-x", identity: identity(), phase: "local_validation" });
  const handlers = Object.fromEntries(["external_review", "codex_review", "structured_review", "review_convergence", "push", "pr_create_or_update", "github_convergence", "merge", "post_merge_hygiene", "post_merge_cleanup"].map((phase) => [phase, async () => ({ ok: true })]));
  handlers.local_validation = async (current) => {
    validations += 1;
    return validations <= 2
      ? { ok: true, sourceFailures: [{ sourceKind: "local_validation", structuredEvidence: true, failureType: "source", diagnostic: `test failure ${validations}`, identity: current.identity }] }
      : { ok: true };
  };
  handlers.source_failure_fix = async (current) => {
    fixes += 1;
    return { ok: true, sourceChanged: true, identity: identity(fixes === 1 ? "f" : "9") };
  };
  const result = await continueOrdinaryCandidate(state, handlers);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "complete");
  assert.equal(fixes, 2);
  assert.equal(validations, 3);
});

test("ordinary continuation persists fix intent and can adopt a completed fix after restart", async () => {
  const state = createOrdinaryContinuationState({ logicalTaskKey: "944", issueNumber: 944, branchName: "feature/auto-944-x", identity: identity(), phase: "local_validation" });
  const checkpoints = [];
  const result = await continueOrdinaryCandidate(state, {
    local_validation: async (current) => current.identity.headSha === sha("f") ? ({ ok: true }) : ({ ok: true, sourceFailures: [{ sourceKind: "local_validation", structuredEvidence: true, failureType: "source", diagnostic: "test failed assertion", identity: current.identity }] }),
    adopt_source_failure_fix: async (_current, { intent }) => ({ ok: true, sourceChanged: true, identity: identity("f"), evidence: { adopted: intent.batchIdentity } }),
    source_failure_fix: async () => { throw new Error("must not replay"); },
    external_review: async () => ({ ok: true, wait: true }),
    onCheckpoint: async (_current, event) => checkpoints.push(event.action),
  });
  assert.equal(result.outcome, "waiting");
  assert.ok(checkpoints.includes("source_failure_fix_intent_prepared"));
  assert.equal(result.state.identity.headSha, sha("f"));
});

test("ordinary continuation blocks the fifty-first local source-changing round", async () => {
  const state = createOrdinaryContinuationState({
    logicalTaskKey: "944",
    issueNumber: 944,
    branchName: "feature/auto-944-x",
    identity: identity(),
    phase: "local_validation",
    counters: { localSourceChangingRoundsPerEpoch: 50, lifetimeLocalSourceChangingRounds: 50 },
  });
  let fixes = 0;
  const result = await continueOrdinaryCandidate(state, {
    local_validation: async () => ({ ok: true, sourceFailures: [{ sourceKind: "local_validation", structuredEvidence: true, failureType: "source", diagnostic: "test failed", identity: identity(), inContract: true }] }),
    source_failure_fix: async () => { fixes += 1; return { ok: true, sourceChanged: true, identity: identity("f") }; },
    onCheckpoint: async () => {},
  });
  assert.equal(result.reasonCode, "local_source_changing_round_limit_exhausted");
  assert.equal(fixes, 0);
});

test("legacy lifetime source rounds do not exhaust a fresh per-epoch gate", async () => {
  const state = createOrdinaryContinuationState({ logicalTaskKey: "944", issueNumber: 944, branchName: "feature/auto-944-x", identity: identity(), phase: "local_validation", counters: { sourceRounds: 50 } });
  let fixed = false;
  const handlers = Object.fromEntries(["external_review", "codex_review", "structured_review", "review_convergence", "push", "pr_create_or_update", "github_convergence", "merge", "post_merge_hygiene", "post_merge_cleanup"].map((phase) => [phase, async () => ({ ok: true })]));
  handlers.local_validation = async (current) => fixed ? { ok: true } : { ok: true, sourceFailures: [{ sourceKind: "local_validation", structuredEvidence: true, failureType: "source", diagnostic: "assert failed", identity: current.identity }] };
  handlers.source_failure_fix = async () => { fixed = true; return { ok: true, sourceChanged: true, identity: identity("f") }; };
  const result = await continueOrdinaryCandidate(state, handlers);
  assert.equal(result.ok, true);
  assert.equal(result.state.counters.localSourceChangingRoundsPerEpoch, 1);
  assert.equal(result.state.counters.lifetimeLocalSourceChangingRounds, 51);
});

test("ordinary mobile profile adds one Android APK proof and retains external unsupported platforms", () => {
  const lane = { lane: "mobile-application", canonicalLane: "mobile-application", validationProfile: "mobile" };
  const requirements = inferMobileBuildPlatformRequirements(["apps/mobile/lib/example.dart"], lane);
  assert.deepEqual(requirements.localCheckIds, [mobileBuildPlatformChecks.androidFlutterBuildApkDebug]);
  assert.deepEqual(requirements.externalCheckIds, [mobileBuildPlatformChecks.iosExternalBuild, mobileBuildPlatformChecks.macosExternalBuild, mobileBuildPlatformChecks.windowsExternalBuild]);
  const plan = planValidation(["apps/mobile/lib/example.dart"], lane);
  assert.equal(plan.filter((item) => item.platformBuildCheckId === mobileBuildPlatformChecks.androidFlutterBuildApkDebug).length, 1);
});

test("status projection exposes bounded operator source-failure posture", () => {
  const batch = freezeSourceFailureBatch([{ sourceKind: "trivy", structuredEvidence: true, headSha: sha("b"), path: "tools/auto-runner/lib/x.mjs", ruleId: "CVE-X", inContract: true }], identity());
  const decision = evaluateSourceFailureBatch(batch);
  const status = sourceFailureStatusProjection({ batch, decision, recertificationPhase: "local_validation", counters: { localSourceChangingRoundsPerEpoch: 2, githubTriggeredFixEpochsPerPr: 1 } });
  assert.equal(status.schemaVersion, "operational_status_v1");
  assert.equal(status.sourceFailure.nextSafeAction, "run_focused_source_fix");
  assert.equal(status.sourceFailure.frozenBatchIdentity, batch.batchIdentity);
});

test("explicit source-failure authorization permits structured failed validation without faking a pass", () => {
  const candidate = identity();
  const findingContext = { repository: "tommytang213/Settleora", issueNumber: 944, taskKey: "20260722-2212", branchName: "feature/x" };
  const batch = freezeSourceFailureBatch([{ ...findingContext, sourceKind: "local_validation", structuredEvidence: true, commandId: "runner-tests", failureType: "source", diagnostic: "test failed assertion", identity: candidate, inContract: true }], candidate);
  const decision = evaluateSourceFailureBatch(batch);
  const laneDecision = { lane: "workflow-docs-tooling", validationProfile: "runner-tests", allowedToImplement: true, autoMergeEligible: true, manualMergeRequired: false, dangerGate: false, dangerReasons: [], allowedPaths: ["tools/auto-runner/**"], contract: { autoMergeEligible: true, manualMergeRequired: false } };
  const common = { config: { repositorySlug: findingContext.repository, configPath: "/trusted/config.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 }, issue: { number: 944, labels: [] }, branchName: findingContext.branchName, laneDecision, changedFiles: candidate.changedFiles, forbiddenChangedFiles: [], validation: { passed: false } };
  const oldDecision = evaluateReviewFixMutationDecision({ ...common, review: { verdict: { verdict: "changes_requested", recommended_next_action: "run_safe_fix_cycle", blocking_findings: [{ path: candidate.changedFiles[0], safelyFixable: true }] } } });
  assert.equal(oldDecision.reason, "local_validation_not_passed_before_review_fix");
  const sourceDecision = evaluateSourceFailureFixMutationDecision({ ...common, sourceFailureFix: { batch, decision, candidateHead: candidate.headSha, baseSha: candidate.baseSha } });
  assert.equal(sourceDecision.allowed, true);
  assert.equal(sourceDecision.failedValidationExplicitlyAuthorized, true);
  assert.equal(common.validation.passed, false);
});

test("source-failure authorization blocks missing, auth, manual, and out-of-contract evidence", () => {
  const candidate = identity();
  const laneDecision = { lane: "workflow-docs-tooling", validationProfile: "runner-tests", allowedToImplement: true, autoMergeEligible: true, manualMergeRequired: false, dangerGate: false, dangerReasons: [], allowedPaths: ["tools/auto-runner/**"], contract: { autoMergeEligible: true, manualMergeRequired: false } };
  const config = { repositorySlug: "tommytang213/Settleora", configPath: "/trusted/config.json", allowReviewFixMutation: true, maxReviewFixCycles: 50 };
  for (const finding of [
    { sourceKind: "local_validation", structuredEvidence: false, diagnostic: "failed" },
    { sourceKind: "local_validation", structuredEvidence: true, commandId: "tests", diagnostic: "missing secret", failureType: "source" },
    { sourceKind: "local_validation", structuredEvidence: true, commandId: "tests", diagnostic: "manual approval required", failureType: "source" },
    { sourceKind: "local_validation", structuredEvidence: true, commandId: "tests", diagnostic: "test failed", failureType: "source", inContract: false },
  ]) {
    const batch = freezeSourceFailureBatch([{ repository: config.repositorySlug, issueNumber: 944, taskKey: "root", branchName: "feature/x", commandId: "runner-tests", ...finding }], candidate);
    const decision = evaluateSourceFailureBatch(batch);
    const result = evaluateSourceFailureFixMutationDecision({ config, issue: { number: 944, labels: [] }, branchName: "feature/x", laneDecision, changedFiles: candidate.changedFiles, forbiddenChangedFiles: [], validation: { passed: false }, sourceFailureFix: { batch, decision, candidateHead: candidate.headSha, baseSha: candidate.baseSha } });
    assert.equal(result.allowed, false);
  }
});

test("prepared GitHub batch resumes one epoch and consumes fingerprints only after a new head", async () => {
  const finding = { sourceKind: "github_check", structuredEvidence: true, commandId: "tests", failureType: "source", diagnostic: "test failed assertion", identity: identity() };
  const frozen = freezeSourceFailureBatch([finding], identity());
  const prepared = createOrdinaryContinuationState({ logicalTaskKey: "944", issueNumber: 944, branchName: "feature/x", identity: identity(), phase: "github_convergence", counters: { githubTriggeredFixEpochsPerPr: 1 } });
  prepared.preparedGithubSourceFailureBatch = { batchIdentity: frozen.batchIdentity, candidateHead: identity().headSha, fingerprints: frozen.findings.map((item) => item.fingerprint), status: "epoch_reserved" };
  prepared.sourceFailureFixIntent = { batchIdentity: frozen.batchIdentity, candidateHead: identity().headSha, status: "prepared" };
  const result = await continueOrdinaryCandidate(prepared, {
    github_convergence: async () => ({ ok: true, sourceFailures: [finding] }),
    adopt_source_failure_fix: async () => ({ ok: false }),
    source_failure_fix: async () => ({ ok: true, sourceChanged: true, identity: identity("f"), evidence: { committed: true } }),
    local_validation: async () => ({ ok: true, wait: true }),
    onCheckpoint: async () => {},
  });
  assert.equal(result.outcome, "waiting");
  assert.equal(result.state.counters.githubTriggeredFixEpochsPerPr, 1);
  assert.equal(result.state.processedGithubFindingFingerprints.length, 1);
  assert.equal(result.state.preparedGithubSourceFailureBatch, null);
});

test("crash after new-head checkpoint adopts commit effect and consumes the prepared batch idempotently", async () => {
  const finding = { sourceKind: "github_check", structuredEvidence: true, commandId: "tests", failureType: "source", diagnostic: "build failed", identity: identity() };
  let checkpoint = null;
  const first = createOrdinaryContinuationState({ logicalTaskKey: "944", issueNumber: 944, branchName: "feature/x", identity: identity(), phase: "github_convergence" });
  await assert.rejects(() => continueOrdinaryCandidate(first, {
    github_convergence: async () => ({ ok: true, sourceFailures: [finding] }),
    source_failure_fix: async () => ({ ok: true, sourceChanged: true, identity: identity("f") }),
    onCheckpoint: async (state, event) => { if (event.action === "source_failure_new_head_persisted") { checkpoint = structuredClone(state); throw new Error("crash"); } },
  }), /crash/);
  const resumed = await continueOrdinaryCandidate(checkpoint, { local_validation: async () => ({ ok: true, wait: true }), onCheckpoint: async () => {} });
  assert.equal(resumed.outcome, "waiting");
  assert.equal(resumed.state.identity.headSha, identity("f").headSha);
  assert.equal(resumed.state.processedGithubFindingFingerprints.length, 1);
  assert.equal(resumed.state.preparedGithubSourceFailureBatch, null);
});
