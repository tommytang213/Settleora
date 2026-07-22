import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySourceFailure,
  evaluateSourceFailureBatch,
  freezeSourceFailureBatch,
  normalizeSourceFailure,
  sourceFailureStatusProjection,
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
  assert.equal(result.state.counters.sourceRounds, 1);
  assert.ok(calls.indexOf("push") > calls.indexOf("codex_review"));
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
