import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySourceFailure,
  evaluateSourceFailureBatch,
  freezeSourceFailureBatch,
  normalizeSourceFailure,
  sourceFailureStatusProjection,
  sourceFailuresFromGithubEvidence,
} from "../lib/source-failure-convergence.mjs";
import { continueOrdinaryCandidate, createOrdinaryContinuationState } from "../lib/ordinary-candidate-continuation.mjs";
import { inferMobileBuildPlatformRequirements, mobileBuildPlatformChecks, planValidation } from "../lib/validation-planner.mjs";

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
  assert.equal(classifySourceFailure({ sourceKind: "github_check", structuredEvidence: true, diagnostic: "missing secret for registry" }).classification, "credential_or_auth_required");
  assert.equal(classifySourceFailure({ sourceKind: "github_check", structuredEvidence: true, failureType: "source", diagnostic: "compiler error" }).classification, "source_fix_safe");
  assert.equal(classifySourceFailure({ sourceKind: "github_check", status: "failure", structuredEvidence: false }).classification, "unsafe_or_ambiguous");
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

test("ordinary continuation routes validation source failure through one focused fix and full recertification", async () => {
  const calls = [];
  const state = createOrdinaryContinuationState({ logicalTaskKey: "944", issueNumber: 944, branchName: "feature/auto-944-x", identity: identity(), phase: "local_validation" });
  let failed = false;
  const handlers = Object.fromEntries(["external_review", "codex_review", "structured_review", "review_convergence", "push", "pr_create_or_update", "github_convergence", "merge", "post_merge_hygiene"].map((phase) => [phase, async () => { calls.push(phase); return { ok: true }; }]));
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
