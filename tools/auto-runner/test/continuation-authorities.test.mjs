import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { continueOrdinaryCandidate, createOrdinaryContinuationState, ordinaryContinuationPhases } from "../lib/ordinary-candidate-continuation.mjs";
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
  const handlers = Object.fromEntries(ordinaryContinuationPhases.map((phase) => [phase, async () => ({ ok: true, wait: phase === "github_convergence", reasonCode: "checks_pending" })]));
  let state = createOrdinaryContinuationState({ logicalTaskKey: "root", issueNumber: 924, branchName: "feature/test", identity: identity() });
  const first = await continueOrdinaryCandidate(state, handlers);
  assert.equal(first.outcome, "waiting");
  state = first.state;
  const second = await continueOrdinaryCandidate(state, handlers);
  assert.equal(second.outcome, "complete");
  assert.equal(second.state.counters.acceptedLogicalTasks, 1);
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
  assert.equal(result.state.counters.sourceRounds, 1);
  assert.equal(result.state.counters.acceptedLogicalTasks, 1);
  assert.deepEqual(result.state.identity.changedFiles, ["a.mjs", "b.mjs"]);
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
    readBranch: async (name) => ({ exists: Boolean(checkpointState?.slices?.[name === "split/a" ? "a" : "b"]?.headSha), headSha: checkpointState?.slices?.[name === "split/a" ? "a" : "b"]?.headSha }),
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

test("split proof blocks ambiguity, missing authority, cycles, and semantic mismatch before unsafe effects", async () => {
  assert.equal(validateSplitMaterializationInput({ ...splitInput(), executionAuthorityProven: false }).reasonCode, "split_execution_authority_missing");
  const ambiguous = splitInput(); ambiguous.slices[1].changedFiles = ["a.mjs"];
  assert.equal(validateSplitMaterializationInput(ambiguous).reasonCode, "split_file_ownership_ambiguous");
  const cyclic = splitInput(true); cyclic.slices[0].dependsOn = ["b"];
  assert.equal(validateSplitMaterializationInput(cyclic).reasonCode, "split_dependency_cycle");
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function run(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result;
}
