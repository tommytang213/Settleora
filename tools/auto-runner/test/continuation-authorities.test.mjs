import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { continueOrdinaryCandidate, createOrdinaryContinuationState, ordinaryCandidateIdentityMatches, ordinaryContinuationPhaseTarget, ordinaryContinuationPhases } from "../lib/ordinary-candidate-continuation.mjs";
import { createProductionSplitMaterializationAdapter, materializeFeatureBundleSplit, validateSplitMaterializationInput } from "../lib/feature-bundle-split-materializer.mjs";

const sha = (value) => createHash("sha1").update(value).digest("hex");
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const identity = (name = "one", files = ["a.mjs"]) => ({ baseSha: sha("base"), headSha: sha(name), treeSha: sha(`tree:${name}`), diffDigest: digest(name), changedFiles: files });

test("ordinary continuation resumes each review and mutation boundary without fake success", async () => {
  for (const phase of ordinaryContinuationPhases) {
    const calls = [];
    const handlers = Object.fromEntries(ordinaryContinuationPhases.map((candidate) => [candidate, async () => { calls.push(candidate); return { ok: true, evidence: { candidate } }; }]));
    const state = createOrdinaryContinuationState({ logicalTaskKey: "20260721-2231", executionKey: "20260722-0336", issueNumber: 924, branchName: "feature/test", identity: identity(), phase });
    const result = await continueOrdinaryCandidate(state, handlers);
    assert.equal(result.ok, true);
    assert.equal(result.outcome, "complete");
    assert.equal(calls[0], phase);
    assert.equal(result.state.counters.acceptedLogicalTasks, 1);
  }
});

test("ordinary continuation adopts exact effects and waits at real pending state", async () => {
  let pending = true;
  const handlers = Object.fromEntries(ordinaryContinuationPhases.map((phase) => [phase, async () => {
    if (phase === "github_convergence" && pending) { pending = false; return { ok: true, wait: true, reasonCode: "checks_pending" }; }
    return { ok: true };
  }]));
  let state = createOrdinaryContinuationState({ logicalTaskKey: "root", issueNumber: 924, branchName: "feature/test", identity: identity() });
  const first = await continueOrdinaryCandidate(state, handlers);
  assert.equal(first.outcome, "waiting");
  assert.equal(first.state.phase, "github_convergence");
  state = first.state;
  const second = await continueOrdinaryCandidate(state, handlers);
  assert.equal(second.outcome, "complete");
  assert.equal(second.state.counters.acceptedLogicalTasks, 1);
});

test("ordinary continuation persists and binds the proven current-main authority", async () => {
  const historicalBase = sha("base");
  const provenCurrentMain = sha("advanced-main");
  const state = createOrdinaryContinuationState({
    logicalTaskKey: "root",
    issueNumber: 959,
    branchName: "feature/historical",
    identity: { ...identity(), baseSha: historicalBase },
    expectedOriginMainSha: provenCurrentMain,
  });
  const first = await continueOrdinaryCandidate(state, {
    candidate_reconciliation: async () => ({ ok: true, wait: true, completed: true }),
  });
  assert.equal(first.state.expectedOriginMainSha, provenCurrentMain);
  const contradicted = await continueOrdinaryCandidate({
    ...first.state,
    phase: "candidate_reconciliation",
    expectedOriginMainSha: historicalBase,
  }, {
    adoptEffect: async () => ({ ok: true }),
  });
  assert.equal(contradicted.reasonCode, "ordinary_continuation_effect_conflict:candidate_reconciliation");
});

test("ordinary continuation restart at structured review preserves reviewer prompt attestations", async () => {
  const candidate = identity();
  const attestedCandidateIdentity = {
    baseSha: candidate.baseSha,
    headSha: candidate.headSha,
    treeSha: candidate.treeSha,
    diffDigest: candidate.diffDigest,
  };
  const reviewerEvidence = {
    review: {
      attestationSource: "provider_response",
      providerPromptBindingDigest: digest("bound-review-prompt"),
      attestedCandidateIdentity,
      attestedIntegrationBoundaries: ["lib/integration.mjs"],
    },
  };
  const state = createOrdinaryContinuationState({
    logicalTaskKey: "root",
    issueNumber: 924,
    branchName: "feature/test",
    identity: candidate,
    phase: "structured_review",
  });
  state.effects.external_review = { targetDigest: state.targetDigest, evidence: reviewerEvidence };
  state.effects.codex_review = { targetDigest: state.targetDigest, evidence: reviewerEvidence };
  const handlers = Object.fromEntries(ordinaryContinuationPhases.slice(ordinaryContinuationPhases.indexOf("structured_review")).map((phase) => [phase, async (continuation) => {
    assert.equal(continuation.effects.external_review.evidence.review.attestationSource, "provider_response");
    assert.equal(continuation.effects.external_review.evidence.review.providerPromptBindingDigest, reviewerEvidence.review.providerPromptBindingDigest);
    assert.deepEqual(continuation.effects.codex_review.evidence.review.attestedCandidateIdentity, attestedCandidateIdentity);
    return { ok: true };
  }]));
  const result = await continueOrdinaryCandidate(state, handlers);
  assert.equal(result.outcome, "complete");
});

test("split materialization blocks on unavailable branch or PR absence proof", async () => {
  const input = splitInput();
  const branchUnavailable = adapter([]); branchUnavailable.readBranch = async () => ({ complete: false, unavailable: true });
  assert.equal((await materializeFeatureBundleSplit(input, branchUnavailable)).reasonCode, "split_materialization_branch_read_unavailable");
  const prUnavailable = adapter([]); prUnavailable.readPr = async () => ({ complete: false, unavailable: true });
  assert.equal((await materializeFeatureBundleSplit(input, prUnavailable)).reasonCode, "split_materialization_pr_read_unavailable");
});

test("ordinary continuation requires authoritative adoption for stored external mutations", async () => {
  const state = createOrdinaryContinuationState({ logicalTaskKey: "root", issueNumber: 924, branchName: "feature/test", identity: identity(), phase: "push" });
  const primed = await continueOrdinaryCandidate(state, { push: async () => ({ ok: true, wait: true, completed: true }) });
  const blocked = await continueOrdinaryCandidate({ ...primed.state, phase: "push" }, {});
  assert.match(blocked.reasonCode, /live_adoption_missing/);
});

test("ordinary source change invalidates review and mutation effects", async () => {
  let changed = false;
  const handlers = Object.fromEntries(ordinaryContinuationPhases.map((phase) => [phase, async () => {
    if (phase === "review_convergence" && !changed) { changed = true; return { ok: true, sourceChanged: true, identity: identity("two", ["a.mjs", "b.mjs"]) }; }
    return { ok: true };
  }]));
  const state = createOrdinaryContinuationState({ logicalTaskKey: "root", issueNumber: 924, branchName: "feature/test", identity: identity() });
  const result = await continueOrdinaryCandidate(state, handlers);
  assert.equal(result.ok, true);
  assert.equal(result.state.counters.localSourceChangingRoundsPerEpoch, 1);
  assert.equal(result.state.counters.acceptedLogicalTasks, 1);
  assert.deepEqual(result.state.identity.changedFiles, ["a.mjs", "b.mjs"]);
  assert.equal(
    result.state.effects.candidate_reconciliation.targetDigest,
    ordinaryContinuationPhaseTarget(result.state, "candidate_reconciliation"),
  );
});

test("ordinary continuation crash recovery invalidates identity after every review-fix source", async () => {
  for (const sourcePhase of ["external_review", "codex_review", "structured_review", "review_convergence"]) {
    const original = identity(`before:${sourcePhase}`);
    const replacement = identity(`after:${sourcePhase}`, ["a.mjs", "fresh.mjs"]);
    const state = createOrdinaryContinuationState({ logicalTaskKey: "root", issueNumber: 924, branchName: "feature/test", identity: original, phase: sourcePhase });
    let changedOnce = false;
    const handlers = Object.fromEntries(ordinaryContinuationPhases.map((phase) => [phase, async () => {
      if (phase === sourcePhase && !changedOnce) {
        changedOnce = true;
        return { ok: true, sourceChanged: true, identity: replacement };
      }
      return { ok: true };
    }]));
    const changed = await continueOrdinaryCandidate(state, handlers);
    assert.equal(changed.outcome, "complete");
    assert.equal(changed.state.identity.headSha, replacement.headSha);
    assert.equal(changed.state.counters.localSourceChangingRoundsPerEpoch, 1);
    const restarted = await continueOrdinaryCandidate({ ...changed.state, phase: "local_validation", effects: {} }, handlers);
    assert.equal(restarted.outcome, "complete");
    assert.equal(restarted.state.identity.headSha, replacement.headSha);
    assert.equal(restarted.state.counters.acceptedLogicalTasks, 1);
  }
});

test("prospective GitHub validation failure enters canonical convergence and reuses the existing PR", async () => {
  const calls = [];
  let failed = true;
  const original = identity("prospective-before");
  const replacement = identity("prospective-after", ["a.mjs", "fix.mjs"]);
  const state = createOrdinaryContinuationState({
    logicalTaskKey: "989",
    issueNumber: 989,
    branchName: "fix/existing-pr",
    identity: original,
    phase: "github_convergence",
    counters: { githubTriggeredFixEpochsPerPr: 0 },
  });
  const handlers = Object.fromEntries(ordinaryContinuationPhases.map((phase) => [phase, async () => {
    calls.push(phase);
    return { ok: true };
  }]));
  handlers.github_convergence = async (current) => {
    calls.push(`github:${current.identity.headSha}`);
    if (failed) {
      failed = false;
      return {
        ok: true,
        sourceFailures: [{
          sourceKind: "local_validation",
          structuredEvidence: true,
          failureType: "source",
          diagnostic: "test failed in prospective synthetic merge",
          identity: current.identity,
        }],
      };
    }
    return { ok: true };
  };
  handlers.source_failure_fix = async (_current, { originatingPhase }) => {
    calls.push(`fix:${originatingPhase}`);
    return { ok: true, sourceChanged: true, identity: replacement, evidence: { commit: replacement.headSha } };
  };
  const result = await continueOrdinaryCandidate(state, handlers);
  assert.equal(result.outcome, "complete");
  assert.equal(result.state.identity.headSha, replacement.headSha);
  assert.equal(result.state.counters.githubTriggeredFixEpochsPerPr, 1);
  assert.equal(result.state.counters.localSourceChangingRoundsPerEpoch, 1);
  assert.deepEqual(calls.slice(0, 4), [
    `github:${original.headSha}`,
    "fix:github_convergence",
    "local_validation",
    "external_review",
  ]);
  assert.equal(calls.filter((entry) => entry === "pr_create_or_update").length, 1);
});

test("ordinary continuation rejects corrupt identity, missing handlers, and conflicting adopted effects", async () => {
  const invalid = await continueOrdinaryCandidate({ version: 1 }, {});
  assert.equal(invalid.reasonCode, "ordinary_continuation_phase_invalid");
  const state = createOrdinaryContinuationState({ logicalTaskKey: "root", issueNumber: 924, branchName: "feature/test", identity: identity() });
  const missing = await continueOrdinaryCandidate(state, {});
  assert.match(missing.reasonCode, /handler_missing/);
  const conflict = await continueOrdinaryCandidate({ ...state, effects: { candidate_reconciliation: { targetDigest: "wrong" } } }, {});
  assert.match(conflict.reasonCode, /effect_conflict/);
});

test("ordinary candidate identity rejects stale tree, diff, and changed-file coverage", () => {
  const exact = { ...identity(), changedFilesDigest: digest(["a.mjs"]) };
  assert.equal(ordinaryCandidateIdentityMatches(exact, exact), true);
  for (const changed of [
    { treeSha: sha("other-tree") },
    { diffDigest: digest("other-diff") },
    { changedFiles: ["a.mjs", "omitted.mjs"], changedFilesDigest: digest(["a.mjs", "omitted.mjs"]) },
  ]) assert.equal(ordinaryCandidateIdentityMatches(exact, { ...exact, ...changed }), false);
});

function splitInput(dependent = false) {
  return {
    logicalTaskKey: "20260721-2231", repository: "owner/repo", issueNumber: 924, executionAuthorityProven: true,
    baseSha: sha("base"), headSha: sha("bundle"), changedFiles: ["a.mjs", "b.mjs"],
    slices: [
      { id: "a", branchName: "split/a", changedFiles: ["a.mjs"], commitRange: { fromExclusive: sha("base"), toInclusive: sha("a") }, dependsOn: [], allowedPathsProven: true, semanticOwnDeltaProven: true },
      { id: "b", branchName: "split/b", changedFiles: ["b.mjs"], commitRange: { fromExclusive: sha("a"), toInclusive: sha("b") }, dependsOn: dependent ? ["a"] : [], allowedPathsProven: true, semanticOwnDeltaProven: true },
    ],
  };
}

function adapter(events, checkpointState = null) {
  let nextPr = 100;
  return {
    readBranch: async (name) => { const record = checkpointState?.slices?.[name === "split/a" ? "a" : "b"]; return { exists: Boolean(record?.headSha), headSha: record?.headSha, treeSha: record?.treeSha }; },
    materializeBranch: async (value) => { events.push(`branch:${value.id}`); return { ok: true, headSha: sha(`head:${value.id}`), treeSha: sha(`tree:${value.id}`) }; },
    verifyOwnDelta: async (value) => ({ ok: true, changedFilesDigest: value.changedFilesDigest, semanticOwnDeltaProven: true, ownDelta: { fileSetDigest: value.changedFilesDigest } }),
    pushBranch: async (value) => { events.push(`push:${value.id}`); return { ok: true }; },
    readPr: async () => ({ exists: false }),
    createPr: async (value) => { events.push(`pr:${value.id}:${value.baseBranch}`); return { ok: true, number: nextPr++, url: "https://example.test/pr" }; },
    checkpoint: async () => {},
    handoffToPrStack: async ({ slices }) => { events.push(`handoff:${slices.length}`); return { ok: true, stackId: "stack" }; },
  };
}

test("split materialization creates independent and dependent stacks then hands off", async () => {
  for (const dependent of [false, true]) {
    const events = [];
    const result = await materializeFeatureBundleSplit(splitInput(dependent), adapter(events));
    assert.equal(result.ok, true);
    assert.equal(result.prs.length, 2);
    assert.equal(result.prs[1].baseRefName, dependent ? "split/a" : "main");
    assert.equal(events.at(-1), "handoff:2");
  }
});

test("split materialization adopts an exact completed handoff without replay", async () => {
  const input = splitInput();
  const first = await materializeFeatureBundleSplit(input, adapter([]));
  const events = [];
  const resumed = adapter(events, first.state);
  resumed.readBranch = async (branchName) => {
    const record = Object.values(first.state.slices).find((slice) => slice.branchName === branchName);
    return { complete: true, exists: true, headSha: record.headSha, treeSha: record.treeSha, remoteExists: true };
  };
  resumed.readPr = async (branchName) => {
    const record = Object.values(first.state.slices).find((slice) => slice.branchName === branchName);
    return { complete: true, exists: true, ok: true, state: "MERGED", number: record.prNumber, url: record.prUrl, baseBranch: record.baseBranch, headSha: record.headSha };
  };
  const result = await materializeFeatureBundleSplit({ ...input, state: first.state }, resumed);
  assert.equal(result.ok, true);
  assert.equal(result.adopted, true);
  assert.deepEqual(events, []);
});

test("split materialization resumes a waiting PR-stack handoff", async () => {
  const input = splitInput();
  const waitingEvents = [];
  const waiting = adapter(waitingEvents);
  waiting.handoffToPrStack = async () => ({ ok: true, outcome: "waiting", stackId: "stack" });
  const first = await materializeFeatureBundleSplit(input, waiting);
  assert.equal(first.outcome, "waiting");
  assert.equal(first.state.phase, "stack_waiting");

  const resumedEvents = [];
  const resumed = adapter(resumedEvents, first.state);
  resumed.readBranch = async (branchName) => {
    const record = Object.values(first.state.slices).find((slice) => slice.branchName === branchName);
    return { complete: true, exists: true, headSha: record.headSha, treeSha: record.treeSha, remoteExists: true };
  };
  resumed.readPr = async (branchName) => {
    const record = Object.values(first.state.slices).find((slice) => slice.branchName === branchName);
    return { complete: true, exists: true, ok: true, state: "OPEN", number: record.prNumber, url: record.prUrl, baseBranch: record.baseBranch, headSha: record.headSha };
  };
  const result = await materializeFeatureBundleSplit({ ...input, state: first.state }, resumed);
  assert.equal(result.outcome, "deterministic_split_materialized");
  assert.equal(resumedEvents.at(-1), "handoff:2");
});

test("split materialization adopts a persisted branch after interruption", async () => {
  const events = [];
  const input = splitInput();
  const persisted = {
    version: 1, logicalTaskKey: input.logicalTaskKey, sourceHeadSha: input.headSha, baseSha: input.baseSha, phase: "materializing",
    slices: { a: { id: "a", branchName: "split/a", expectedDigest: validateExpectedDigest(input, input.slices[0], "main"), headSha: sha("head:a"), treeSha: sha("tree:a"), changedFilesDigest: digest(["a.mjs"]), phase: "materialized" } },
  };
  const resumed = { ...input, state: persisted };
  const result = await materializeFeatureBundleSplit(resumed, adapter(events, persisted));
  assert.equal(result.ok, true);
  assert.equal(events.includes("branch:a"), false);
  assert.equal(events.includes("push:a"), true);
});

test("split materialization verifies and adopts a checkpointless live branch", async () => {
  const events = [];
  const input = splitInput();
  const live = { slices: { a: { headSha: sha("head:a"), treeSha: sha("tree:a") } } };
  const result = await materializeFeatureBundleSplit(input, adapter(events, live));
  assert.equal(result.ok, true);
  assert.equal(events.includes("branch:a"), false);
  assert.equal(events.includes("push:a"), true);
});

test("split materialization republishes a persisted branch proven absent remotely", async () => {
  const events = [];
  const input = splitInput();
  const persisted = {
    version: 1, logicalTaskKey: input.logicalTaskKey, sourceHeadSha: input.headSha, baseSha: input.baseSha, phase: "materializing",
    slices: { a: { id: "a", branchName: "split/a", expectedDigest: validateExpectedDigest(input, input.slices[0], "main"), headSha: sha("head:a"), treeSha: sha("tree:a"), changedFilesDigest: digest(["a.mjs"]), pushed: true, phase: "pushed" } },
  };
  const result = await materializeFeatureBundleSplit({ ...input, state: persisted }, adapter(events));
  assert.equal(result.ok, true);
  assert.equal(events.includes("push:a"), true);
});

test("split materialization republishes a persisted local branch missing remotely", async () => {
  const events = [];
  const input = splitInput();
  const persisted = {
    version: 1, logicalTaskKey: input.logicalTaskKey, sourceHeadSha: input.headSha, baseSha: input.baseSha, phase: "materializing",
    slices: { a: { id: "a", branchName: "split/a", expectedDigest: validateExpectedDigest(input, input.slices[0], "main"), headSha: sha("head:a"), treeSha: sha("tree:a"), changedFilesDigest: digest(["a.mjs"]), pushed: true, phase: "pushed" } },
  };
  const custom = adapter(events, persisted);
  custom.readBranch = async (name) => name === "split/a" ? { complete: true, exists: true, headSha: sha("head:a"), treeSha: sha("tree:a"), remoteExists: false } : { complete: true, exists: false, remoteExists: false };
  const result = await materializeFeatureBundleSplit({ ...input, state: persisted }, custom);
  assert.equal(result.ok, true);
  assert.equal(events.includes("push:a"), true);
});

test("split proof blocks ambiguity, missing authority, cycles, and semantic mismatch before unsafe effects", async () => {
  assert.equal(validateSplitMaterializationInput({ ...splitInput(), executionAuthorityProven: false }).reasonCode, "split_execution_authority_missing");
  const ambiguous = splitInput(); ambiguous.slices[1].changedFiles = ["a.mjs"];
  assert.equal(validateSplitMaterializationInput(ambiguous).reasonCode, "split_file_ownership_ambiguous");
  const cyclic = splitInput(true); cyclic.slices[0].dependsOn = ["b"];
  assert.equal(validateSplitMaterializationInput(cyclic).reasonCode, "split_dependency_cycle");
  const joined = splitInput(true); joined.slices.push({ id: "c", branchName: "split/c", changedFiles: ["c.mjs"], commitRange: { fromExclusive: sha("b"), toInclusive: sha("c") }, dependsOn: ["a", "b"], allowedPathsProven: true, semanticOwnDeltaProven: true }); joined.changedFiles.push("c.mjs");
  assert.equal(validateSplitMaterializationInput(joined).reasonCode, "split_dependency_non_linear");
  const forked = splitInput(true); forked.slices.push({ id: "c", branchName: "split/c", changedFiles: ["c.mjs"], commitRange: { fromExclusive: sha("a"), toInclusive: sha("c") }, dependsOn: ["a"], allowedPathsProven: true, semanticOwnDeltaProven: true }); forked.changedFiles.push("c.mjs");
  assert.equal(validateSplitMaterializationInput(forked).reasonCode, "split_dependency_non_linear");
  const events = []; const bad = adapter(events); bad.verifyOwnDelta = async () => ({ ok: false, reasonCode: "semantic_bad" });
  const result = await materializeFeatureBundleSplit(splitInput(), bad);
  assert.equal(result.reasonCode, "semantic_bad");
  assert.deepEqual(events, ["branch:a"]);
});

test("production split adapter cherry-picks an exact checkpoint range in a temporary repository", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-materializer-test-"));
  const repo = path.join(root, "repo");
  try {
    run(root, ["init", repo]);
    run(repo, ["config", "user.email", "test@example.invalid"]);
    run(repo, ["config", "user.name", "Test"]);
    writeFileSync(path.join(repo, "base.txt"), "base\n"); run(repo, ["add", "base.txt"]); run(repo, ["commit", "-m", "base"]);
    const base = run(repo, ["rev-parse", "HEAD"]).stdout.trim();
    writeFileSync(path.join(repo, "slice.txt"), "slice\n"); run(repo, ["add", "slice.txt"]); run(repo, ["commit", "-m", "slice"]);
    const checkpoint = run(repo, ["rev-parse", "HEAD"]).stdout.trim();
    run(repo, ["switch", "--detach", base]);
    const adapter = createProductionSplitMaterializationAdapter({ repoRoot: repo }, { checkpointPath: path.join(root, "state.json"), handoffToPrStack: async () => ({ ok: true }) });
    const expected = { id: "slice", branchName: "split/slice", baseHeadSha: base, changedFiles: ["slice.txt"], changedFilesDigest: digest(["slice.txt"]), commitRange: { fromExclusive: base, toInclusive: checkpoint } };
    const branch = await adapter.materializeBranch(expected);
    assert.equal(branch.ok, true);
    const verified = await adapter.verifyOwnDelta({ ...expected, ...branch });
    assert.equal(verified.ok, true);
    for (const field of ["fileSetDigest", "diffstatDigest", "numstatDigest", "stablePatchId", "normalizedPatchDigest"]) assert.ok(verified.ownDelta[field], field);
    assert.equal(verified.ownDelta.forwardPatchApplies, true);
    assert.equal(verified.ownDelta.reversePatchApplies, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function run(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function validateExpectedDigest(input, slice, baseBranch) {
  return digest({ baseSha: input.baseSha, baseBranch, range: slice.commitRange, files: [...slice.changedFiles].sort(), dependencies: [...slice.dependsOn].sort() });
}
