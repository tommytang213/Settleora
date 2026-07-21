import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { routeReviewer } from "../lib/reviewer-policy.mjs";
import { extractReviewFixTrigger } from "../lib/review-fix-policy.mjs";
import {
  blockLargeCandidateForContextLimit,
  buildLargeCandidateCoverageManifest,
  classifyLargeCandidate,
  certifyCompleteCumulativeLargeReview,
  createLargeCandidateRoutingState,
  invalidateLargeCandidateEvidence,
  largeCandidateRoutingStates,
  largeCandidateStateIsReviewPass,
  migrateLargeCandidateRoutingState,
  planLargeCandidateSplit,
  persistCumulativeLargeCandidateReview,
  persistLargeCandidateSplitDecision,
  loadLargeCandidateRoutingState,
  runStructuredLargeCandidateReview,
  structuredLargeCandidateFindings,
  validateLargeCandidateReviewEvidence,
  validateLargeCandidateRoutingState,
  writeLargeCandidateRoutingState,
} from "../lib/large-candidate-review-routing.mjs";

const h = (value) => createHash("sha256").update(value).digest("hex");
const candidateIdentity = Object.freeze({ repository: "tommytang213/Settleora", baseSha: "1".repeat(40), headSha: "2".repeat(40), treeSha: "3".repeat(40), diffDigest: h("diff"), changedFilesDigest: h("files") });
const workflowFiles = (count = 40) => Array.from({ length: count }, (_, index) => `tools/auto-runner/lib/routing-${index}.mjs`);

test("normal candidate retains normal review routing", () => {
  assert.equal(classifyLargeCandidate({ changedFiles: ["tools/auto-runner/lib/a.mjs"], stats: { additions: 3 } }).route, "normal");
});

test("coherent large workflow candidate escalates without approval metadata", () => {
  const route = routeReviewer({ changedFiles: workflowFiles(), stats: { additions: 2400 }, laneDecision: { lane: "workflow-docs-tooling" }, largeBundleReviewApproval: { enabled: false, approvals: [] } });
  assert.equal(route.tier, "strong_independent");
  assert.equal(route.largeCandidateRouting.state, "external_review_large_bundle_escalation_required");
  assert.equal(route.largeBundleApproval.reason, "large_bundle_approval_not_routine_prerequisite");
});

test("coherent architecture-consistent feature bundle escalates", () => {
  const result = classifyLargeCandidate({ changedFiles: [...workflowFiles(20), "scripts/ai/example.mjs"], stats: { additions: 2100 }, featureBundle: { architectureConsistent: true } });
  assert.equal(result.route, "large_bundle_escalation");
  assert.equal(result.coherent, true);
});

test("production reviewer routing honors feature-bundle architecture proof", () => {
  const result = routeReviewer({
    changedFiles: ["services/api/migrations/001.sql", "apps/mobile/ui/page.dart"],
    stats: { additions: 2200 },
    featureBundle: { architectureConsistent: true },
  });
  assert.equal(result.largeCandidateRouting.route, "large_bundle_escalation");
  assert.equal(result.tier, "strong_independent");
});

test("size alone does not require manual merge", () => {
  const result = classifyLargeCandidate({ changedFiles: workflowFiles(), stats: { additions: 5000 }, laneDecision: { lane: "workflow-docs-tooling" } });
  assert.equal(result.explicitManual, false);
  assert.equal(result.route, "large_bundle_escalation");
});

test("15-file candidates enter mandatory large routing", () => {
  const route = routeReviewer({ changedFiles: workflowFiles(15), stats: { additions: 100 }, laneDecision: { lane: "workflow-docs-tooling" } });
  assert.equal(route.tier, "strong_independent");
  assert.equal(route.largeCandidateRouting.route, "large_bundle_escalation");
});

for (const [name, files] of [
  ["auth and money", ["services/api/auth/session.mjs", "services/api/money/settlement.mjs"]],
  ["storage and deployment", ["services/api/storage/file.mjs", "infra/deploy/run.mjs"]],
  ["schema and UI", ["services/api/migrations/001.sql", "apps/mobile/ui/page.dart"]],
  ["OpenAPI and UI", ["packages/contracts/openapi/a.yaml", "apps/mobile/ui/page.dart"]],
]) test(`mixed ${name} routes split or block`, () => {
  const result = classifyLargeCandidate({ changedFiles: files, stats: { additions: 2200 } });
  assert.equal(result.route, "split_or_block");
  assert.equal(result.state, "external_review_split_required");
});

test("architecture proof can establish one coherent feature bundle", () => {
  const result = classifyLargeCandidate({ changedFiles: ["services/api/migrations/001.sql", "apps/mobile/ui/page.dart"], stats: { additions: 2200 }, featureBundle: { architectureConsistent: true } });
  assert.equal(result.route, "large_bundle_escalation");
});

test("historical split state migrates without becoming complete", () => {
  const state = migrateLargeCandidateRoutingState({ status: "blocked_external_reviewer_split_required", candidateIdentity });
  assert.equal(state.routeState, "external_review_split_required");
  assert.equal(largeCandidateStateIsReviewPass(state), false);
});

test("routing and verdict states remain distinct", () => {
  assert.equal(largeCandidateRoutingStates.includes("pass"), false);
  const state = { ...createLargeCandidateRoutingState({ candidateIdentity, changedFiles: workflowFiles() }), reviewerVerdict: "pass" };
  assert.equal(validateLargeCandidateRoutingState(state).ok, false);
});

test("coverage assigns every changed path exactly once and records unchanged boundaries", () => {
  const built = buildLargeCandidateCoverageManifest({ candidateIdentity, changedFiles: ["tools/auto-runner/a.mjs", "docs/workflow/A.md"], integrationBoundaries: ["tools/auto-runner/settleora-auto-runner.mjs"] });
  assert.equal(built.ok, true);
  assert.deepEqual(built.manifest.sections.flatMap((section) => section.changedPaths).sort(), ["docs/workflow/A.md", "tools/auto-runner/a.mjs"]);
  assert.equal(built.manifest.integrationBoundaries[0].reasonCode, "required_unchanged_integration_boundary");
});

test("coverage rejects incomplete candidate identity", () => {
  assert.equal(buildLargeCandidateCoverageManifest({ candidateIdentity: {}, changedFiles: ["a"] }).reasonCode, "candidate_identity_incomplete");
});

function reviewFixture(manifest, provider) {
  return { provider, candidateIdentity: manifest.candidateIdentity, manifestDigest: manifest.manifestDigest, verdict: "pass", sections: manifest.sections.map((section) => ({ id: section.id, status: "pass", manifestDigest: manifest.manifestDigest, findings: [] })), integration: { status: "pass", manifestDigest: manifest.manifestDigest, findings: [] } };
}

test("both reviewers bind to identical identity and final integration", () => {
  const { manifest } = buildLargeCandidateCoverageManifest({ candidateIdentity, changedFiles: ["tools/auto-runner/a.mjs", "services/api/runtime.mjs"] });
  const result = validateLargeCandidateReviewEvidence({ manifest, reviewerResults: [reviewFixture(manifest, "gemini"), reviewFixture(manifest, "codex-local")] });
  assert.equal(result.ok, true);
  assert.equal(result.state, "external_review_complete");
});

test("cumulative certification requires exact reviewed integration boundaries", () => {
  const externalReview = { status: "pass", verdict: "pass", attestedCandidateIdentity: candidateIdentity, attestedIntegrationBoundaries: [] };
  const codexReview = { verdict: { verdict: "approve", findings: [] }, attestedCandidateIdentity: candidateIdentity, attestedIntegrationBoundaries: [] };
  const missing = certifyCompleteCumulativeLargeReview({ candidateIdentity, changedFiles: ["tools/auto-runner/a.mjs"], integrationBoundaries: ["tools/auto-runner/settleora-auto-runner.mjs"], externalReview, codexReview });
  assert.equal(missing.reasonCode, "integration_boundary_attestation_missing");
  externalReview.attestedIntegrationBoundaries = ["tools/auto-runner/settleora-auto-runner.mjs"];
  codexReview.attestedIntegrationBoundaries = ["tools/auto-runner/settleora-auto-runner.mjs"];
  const complete = certifyCompleteCumulativeLargeReview({ candidateIdentity, changedFiles: ["tools/auto-runner/a.mjs"], integrationBoundaries: ["tools/auto-runner/settleora-auto-runner.mjs"], externalReview, codexReview });
  assert.equal(complete.ok, true);
});

for (const [name, mutate, reason] of [
  ["missing section", (review) => review.sections.pop(), "review_sections_missing_duplicate_or_stale"],
  ["duplicate section", (review) => review.sections.push(review.sections[0]), "review_sections_missing_duplicate_or_stale"],
  ["stale manifest", (review) => { review.sections[0].manifestDigest = h("stale"); }, "review_section_not_passed"],
  ["mismatched identity", (review) => { review.candidateIdentity = { ...candidateIdentity, headSha: "4".repeat(40) }; }, "review_candidate_identity_mismatch"],
  ["truncated evidence", (review) => { review.truncated = true; }, "review_evidence_incomplete"],
  ["malformed evidence", (review) => { review.malformed = true; }, "review_evidence_incomplete"],
  ["over-budget evidence", (review) => { review.overBudget = true; }, "review_evidence_incomplete"],
  ["missing integration", (review) => { review.integration = null; }, "final_integration_review_missing"],
]) test(`${name} blocks complete review`, () => {
  const { manifest } = buildLargeCandidateCoverageManifest({ candidateIdentity, changedFiles: ["tools/auto-runner/a.mjs", "services/api/runtime.mjs"] });
  const gemini = reviewFixture(manifest, "gemini"); mutate(gemini);
  const result = validateLargeCandidateReviewEvidence({ manifest, reviewerResults: [gemini, reviewFixture(manifest, "codex-local")] });
  assert.equal(result.reasonCode, reason);
});

test("findings across sections and integration deduplicate for #923 batch", () => {
  const { manifest } = buildLargeCandidateCoverageManifest({ candidateIdentity, changedFiles: ["tools/auto-runner/a.mjs", "services/api/runtime.mjs"] });
  const a = reviewFixture(manifest, "gemini"); const b = reviewFixture(manifest, "codex-local");
  for (const review of [a, b]) review.sections[0].findings = [{ severity: "high", path: "a", summary: "same finding" }];
  assert.equal(validateLargeCandidateReviewEvidence({ manifest, reviewerResults: [a, b] }).findings.length, 1);
});

test("blocked structured findings remain available for production convergence routing", () => {
  const findings = structuredLargeCandidateFindings({ state: { reviewerResults: [{
    provider: "codex-local",
    sections: [{ findings: [{ severity: "high", path: "tools/auto-runner/a.mjs", summary: "repair routing" }] }],
    integration: { findings: [{ severity: "high", path: "tools/auto-runner/a.mjs", summary: "repair routing" }] },
  }] } }, "codex-local");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].summary, "repair routing");
});

test("structured reviewer adapters satisfy the existing convergence trigger contract", () => {
  const finding = { severity: "high", path: "tools/auto-runner/a.mjs", message: "repair routing" };
  const gemini = extractReviewFixTrigger({ externalReview: { status: "blocked", reason: "blocked_external_reviewer_non_pass", sanitizedResponseSummary: { verdict: "fail", findings: [finding] } } });
  const codex = extractReviewFixTrigger({ review: { verdict: { verdict: "changes_requested", recommended_next_action: "run_safe_fix_cycle", blocking_findings: [finding] } } });
  assert.equal(gemini.actionable, true);
  assert.equal(codex.actionable, true);
  assert.equal(gemini.findings[0].message, "repair routing");
  assert.equal(codex.findings[0].message, "repair routing");
});

test("source identity change invalidates all evidence", () => {
  const state = { ...createLargeCandidateRoutingState({ candidateIdentity }), routeState: "external_review_complete", reviewerVerdict: "pass", coverageManifest: { safe: true }, reviewerResults: [{ safe: true }] };
  const changed = invalidateLargeCandidateEvidence(state, { ...candidateIdentity, headSha: "4".repeat(40) });
  assert.equal(changed.routeState, "external_review_coverage_incomplete");
  assert.equal(changed.coverageManifest, null);
  assert.deepEqual(changed.reviewerResults, []);
});

test("deterministic semantics-preserving split succeeds", () => {
  const changedFiles = ["services/api/auth/a.mjs", "services/api/money/b.mjs"];
  const classification = classifyLargeCandidate({ changedFiles, stats: { additions: 2200 } });
  const plan = planLargeCandidateSplit({ classification, changedFiles, slices: [
    { id: "auth", issueNumber: 1, taskKey: "20260721-0001", changedFiles: [changedFiles[0]], allowedPathsProven: true, semanticOwnDeltaProven: true, executionAuthorityProven: true, dependsOn: [] },
    { id: "money", issueNumber: 2, taskKey: "20260721-0002", changedFiles: [changedFiles[1]], allowedPathsProven: true, semanticOwnDeltaProven: true, executionAuthorityProven: true, dependsOn: ["auth"] },
  ] });
  assert.equal(plan.ok, true);
  assert.equal(plan.execution, "deterministic_split");
});

test("ambiguous split fails closed with exact files and minimum decision", () => {
  const changedFiles = ["services/api/auth/a.mjs", "services/api/money/b.mjs"];
  const classification = classifyLargeCandidate({ changedFiles, stats: { additions: 2200 } });
  const plan = planLargeCandidateSplit({ classification, changedFiles, slices: [] });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.conflictingFiles, changedFiles);
  assert.match(plan.minimumDecision, /ownership/);
});

test("context failure records exact uncovered scope and no partial pass", () => {
  const state = blockLargeCandidateForContextLimit({ state: createLargeCandidateRoutingState({ candidateIdentity }), uncoveredPaths: ["tools/auto-runner/a.mjs"], uncoveredSections: ["section-2"], provider: "gemini", deterministicSplitPossible: true });
  assert.equal(state.routeState, "external_review_context_limit_blocked");
  assert.equal(largeCandidateStateIsReviewPass(state), false);
  assert.deepEqual(state.uncoveredScope.paths, ["tools/auto-runner/a.mjs"]);
});

test("routing does not consume #923 counters or #932 logical task charges", () => {
  const state = createLargeCandidateRoutingState({ candidateIdentity, changedFiles: workflowFiles() });
  assert.deepEqual(state.countersConsumed, { logicalTasks: 0, localSourceRounds: 0, githubEpochs: 0 });
});

test("state contains only bounded sanitized projection fields for future #927", () => {
  const state = createLargeCandidateRoutingState({ taskKey: "x".repeat(500), candidateIdentity });
  assert.ok(state.taskKey.length <= 240);
  assert.equal(JSON.stringify(state).includes("prompt"), false);
  assert.equal(JSON.stringify(state).includes("credential"), false);
});

test("routing state persists atomically and reloads for recovery", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-large-route-"));
  try {
    const written = writeLargeCandidateRoutingState({ logsRoot }, createLargeCandidateRoutingState({ taskKey: "20260721-2231", candidateIdentity }));
    const loaded = loadLargeCandidateRoutingState({ logsRoot }, written);
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.state.candidateIdentity, candidateIdentity);
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("current-version migration preserves completed calls markers and counters", () => {
  const original = { ...createLargeCandidateRoutingState({ candidateIdentity }), routeState: "external_review_large_bundle_in_progress", reviewerResults: [{ provider: "gemini", status: "pass" }], mutationMarkers: { split: "complete" }, countersConsumed: { logicalTasks: 0, localSourceRounds: 0, githubEpochs: 0 } };
  const migrated = migrateLargeCandidateRoutingState(original);
  assert.deepEqual(migrated.reviewerResults, original.reviewerResults);
  assert.deepEqual(migrated.mutationMarkers, original.mutationMarkers);
});

test("split plans reject unknown self cyclic and duplicate dependencies", () => {
  const changedFiles = ["services/api/auth/a.mjs", "services/api/money/b.mjs"];
  const classification = classifyLargeCandidate({ changedFiles, stats: { additions: 2200 } });
  const base = [
    { id: "a", issueNumber: 1, taskKey: "20260721-0001", changedFiles: [changedFiles[0]], allowedPathsProven: true, semanticOwnDeltaProven: true, executionAuthorityProven: true, dependsOn: ["b"] },
    { id: "b", issueNumber: 2, taskKey: "20260721-0002", changedFiles: [changedFiles[1]], allowedPathsProven: true, semanticOwnDeltaProven: true, executionAuthorityProven: true, dependsOn: ["a"] },
  ];
  assert.equal(planLargeCandidateSplit({ classification, changedFiles, slices: base }).reasonCode, "split_dependency_cycle");
  assert.equal(planLargeCandidateSplit({ classification, changedFiles, slices: [{ ...base[0], dependsOn: ["a"] }, { ...base[1], dependsOn: [] }] }).reasonCode, "split_dependency_invalid");
  assert.equal(planLargeCandidateSplit({ classification, changedFiles, slices: [{ ...base[0], dependsOn: ["missing"] }, { ...base[1], dependsOn: [] }] }).reasonCode, "split_dependency_invalid");
});

test("restart during structured review resumes without duplicate provider calls", async () => {
  const { manifest } = buildLargeCandidateCoverageManifest({ candidateIdentity, changedFiles: ["tools/auto-runner/a.mjs", "services/api/runtime.mjs"] });
  const completeGemini = reviewFixture(manifest, "gemini");
  let calls = 0;
  const state = { ...createLargeCandidateRoutingState({ candidateIdentity }), routeState: "external_review_large_bundle_in_progress", coverageManifest: manifest, reviewerResults: [completeGemini] };
  const result = await runStructuredLargeCandidateReview({ state, manifest, reviewers: ["gemini", "codex-local"], invokeSection: async ({ section }) => { calls += 1; return { id: section.id, status: "pass", manifestDigest: manifest.manifestDigest, findings: [] }; }, invokeIntegration: async () => { calls += 1; return { status: "pass", manifestDigest: manifest.manifestDigest, findings: [] }; } });
  assert.equal(result.ok, true);
  assert.equal(calls, manifest.sections.length + 1);
});

test("runtime cumulative review persists complete section and integration evidence across restart", async () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-large-runtime-"));
  const boundaries = ["tools/auto-runner/settleora-auto-runner.mjs"];
  const attestation = { attestedCandidateIdentity: candidateIdentity, attestedIntegrationBoundaries: boundaries, attestationSource: "provider_prompt_binding", providerPromptBindingDigest: h("prompt") };
  try {
    const input = { config: { logsRoot }, taskKey: "runtime", candidateIdentity, changedFiles: ["tools/auto-runner/a.mjs", "services/api/runtime.mjs"], integrationBoundaries: boundaries, externalReview: { ...attestation, status: "pass", verdict: "pass" }, codexReview: { ...attestation, verdict: { verdict: "approve", findings: [] } } };
    const first = await persistCumulativeLargeCandidateReview(input);
    assert.equal(first.ok, true);
    assert.equal(first.state.routeState, "external_review_complete");
    assert.equal(first.state.reviewerResults.every((review) => review.integration?.status === "pass"), true);
    const resumed = await persistCumulativeLargeCandidateReview(input);
    assert.equal(resumed.ok, true);
    assert.equal(resumed.statePath, first.statePath);
    assert.equal(resumed.state.countersConsumed.logicalTasks, 0);
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("changed integration boundaries remain covered as changed paths without attestation mismatch", async () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-large-boundary-"));
  const changedFiles = ["tools/auto-runner/settleora-auto-runner.mjs", "services/api/runtime.mjs"];
  const boundaries = ["tools/auto-runner/settleora-auto-runner.mjs"];
  const attestation = { attestedCandidateIdentity: candidateIdentity, attestedIntegrationBoundaries: boundaries, attestationSource: "provider_prompt_binding", providerPromptBindingDigest: h("prompt") };
  try {
    const result = await persistCumulativeLargeCandidateReview({ config: { logsRoot }, taskKey: "boundary", candidateIdentity, changedFiles, integrationBoundaries: boundaries, externalReview: { ...attestation, status: "pass", verdict: "pass" }, codexReview: { ...attestation, verdict: { verdict: "approve", findings: [] } } });
    assert.equal(result.ok, true);
    assert.equal(result.state.coverageManifest.changedFiles.includes(boundaries[0]), true);
    assert.equal(result.state.coverageManifest.integrationBoundaries.length, 0);
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});

test("structured executor checkpoints immediately after each provider result", async () => {
  const { manifest } = buildLargeCandidateCoverageManifest({ candidateIdentity, changedFiles: ["tools/auto-runner/a.mjs", "services/api/runtime.mjs"] });
  const checkpoints = [];
  const result = await runStructuredLargeCandidateReview({ state: createLargeCandidateRoutingState({ candidateIdentity }), manifest, reviewers: ["gemini", "codex-local"], invokeSection: async ({ section }) => ({ id: section.id, status: "pass", manifestDigest: manifest.manifestDigest, findings: [] }), invokeIntegration: async () => ({ status: "pass", manifestDigest: manifest.manifestDigest, findings: [] }), onCheckpoint: async (state, marker) => { checkpoints.push(marker); return state; } });
  assert.equal(result.ok, true);
  assert.equal(checkpoints.filter((entry) => entry.phase === "section").length, manifest.sections.length * 2);
  assert.equal(checkpoints.filter((entry) => entry.phase === "integration").length, 2);
});

test("runtime context limit persists exact uncovered scope and split routing persists a manual packet", async () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-large-context-"));
  try {
    const limited = await persistCumulativeLargeCandidateReview({ config: { logsRoot }, taskKey: "context", candidateIdentity, changedFiles: ["tools/auto-runner/a.mjs"], externalReview: { status: "blocked", reason: "MAX_TOKENS context limit" }, codexReview: null });
    assert.equal(limited.state.routeState, "external_review_context_limit_blocked");
    assert.deepEqual(limited.state.uncoveredScope.paths, ["tools/auto-runner/a.mjs"]);
    const classification = classifyLargeCandidate({ changedFiles: ["services/api/Auth/session.mjs", "services/api/Settlement/bill.mjs"] });
    const split = persistLargeCandidateSplitDecision({ config: { logsRoot }, taskKey: "split", candidateIdentity, classification, changedFiles: ["services/api/Auth/session.mjs", "services/api/Settlement/bill.mjs"] });
    assert.equal(split.ok, false);
    assert.equal(split.state.routeState, "external_review_split_required");
    assert.equal(split.execution, "manual_scope_decision_required");
  } finally { rmSync(logsRoot, { recursive: true, force: true }); }
});
