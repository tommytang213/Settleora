import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { continuePostMergeCleanup, createCleanupOwnershipRecord, createPostMergeCleanupGitAdapter, evaluateCleanupGate, loadPostMergeCleanupState, persistPostMergeCleanupState, planPostMergeCleanup, projectPostMergeCleanup } from "../lib/post-merge-cleanup.mjs";
import { preparePostMergeCleanupOwnership } from "../lib/auto-merge-policy.mjs";

const s = (c) => c.repeat(40);
const d = (c) => c.repeat(64);
function owner(overrides = {}) { return createCleanupOwnershipRecord({ repository: "owner/repo", rootTaskKey: "20260723-1007", executionLineage: "run:1:session:1", issueNumber: 947, branchName: "feature/auto-947-cleanup", branchKind: "feature", baseBranch: "main", baseSha: s("a"), reviewedHeadSha: s("b"), prNumber: 949, prUrl: "https://github.com/owner/repo/pull/949", mergeSha: s("c"), targetBranch: "main", acceptance: { passed: true, targetHeadSha: s("d"), evidenceDigest: d("e") }, correlations: { recovery: "r", session: "s", bundle: null, stack: null }, worktree: { identity: d("9"), disposable: true }, createdAt: "2026-07-23T02:00:00Z", ...overrides }); }
function live(o = owner(), overrides = {}) { return { repository: o.repository, pr: { state: "MERGED", headSha: o.reviewedHeadSha, mergeSha: o.mergeSha, baseBranch: o.targetBranch }, target: { branch: o.targetBranch, sourceAncestor: true, mergeAncestor: true, acceptanceDigest: o.acceptance.evidenceDigest }, hygieneComplete: true, reportsExported: true, dependenciesComplete: true, activeInventoryComplete: true, activeReferences: Object.fromEntries(["runner", "supervisor", "recovery", "outage", "review", "source_failure", "session", "bundle", "stack", "report", "pending_effect", "generated_work", "lease"].map((key) => [key, 0])), openPrReferences: 0, protected: false, defaultBranch: "main", manualOwned: false, excluded: false, remoteHead: o.reviewedHeadSha, localHead: o.reviewedHeadSha, worktree: { present: true, identity: o.worktree?.identity, primary: false, dirty: false, active: false, shared: false, symlinked: false, unexportedEvidence: false }, ...overrides }; }

test("name-only, protected, release, manual, unowned and incomplete ownership never authorize cleanup", () => {
  assert.throws(() => owner({ branchName: "feature/auto-name-only", acceptance: null }), /cleanup_acceptance_incomplete/);
  for (const branchName of ["main", "release/1.0", "manual/topic", "feature/not-auto"] ) assert.throws(() => owner({ branchName }), /cleanup_branch_not_ephemeral/);
  for (const overrides of [{ protected: true }, { manualOwned: true }, { defaultBranch: "feature/auto-947-cleanup" }]) assert.equal(evaluateCleanupGate(owner(), live(owner(), overrides)).ok, false);
});

test("complete exact merge, ancestry, acceptance and hygiene proof plans cleanup", () => {
  const o = owner(); const result = planPostMergeCleanup(o, live(o)); assert.equal(result.ok, true); assert.equal(result.state.mergeAuthoritative, true); assert.equal(result.state.cleanupRequired, true);
});

test("head drift, incomplete hygiene, PR/dependent and every active category block with a next action", () => {
  const o = owner();
  for (const overrides of [{ remoteHead: s("f") }, { localHead: s("f") }, { hygieneComplete: false }, { openPrReferences: 1 }, { dependenciesComplete: false }]) { const result = evaluateCleanupGate(o, live(o, overrides)); assert.equal(result.ok, false); assert.ok(result.nextAction); }
  for (const category of ["runner", "supervisor", "recovery", "outage", "review", "source_failure", "session", "bundle", "stack", "report", "pending_effect", "generated_work", "lease"]) assert.equal(evaluateCleanupGate(o, live(o, { activeReferences: { [category]: 1 } })).ok, false);
});

test("dirty, primary, active, shared, symlinked, ambiguous and unexported worktrees are retained", () => {
  const o = owner();
  for (const flag of ["dirty", "primary", "active", "shared", "symlinked", "unexportedEvidence"]) assert.equal(evaluateCleanupGate(o, live(o, { worktree: { ...live(o).worktree, [flag]: true } })).reasonCode, "worktree_not_disposable_clean_owned");
  assert.equal(evaluateCleanupGate(o, live(o, { worktree: { ...live(o).worktree, identity: d("8") } })).ok, false);
});

test("exact remote/worktree/local effects execute in order and final absence is confirmed", async () => {
  const o = owner(); let state = live(o); const calls = []; const checkpoints = [];
  const planned = planPostMergeCleanup(o, state).state;
  const adapter = { readLive: async () => structuredClone(state), checkpoint: async (x) => checkpoints.push(x.phase), deleteRemote: async () => { calls.push("remote"); state.remoteHead = null; return { ok: true }; }, removeWorktree: async () => { calls.push("worktree"); state.worktree.present = false; return { ok: true }; }, deleteLocalBranch: async () => { calls.push("local:-d"); state.localHead = null; return { ok: true }; } };
  const result = await continuePostMergeCleanup(planned, adapter); assert.equal(result.outcome, "complete"); assert.deepEqual(calls, ["remote", "worktree", "local:-d"]); assert.equal(result.state.cleanupRequired, false); assert.ok(checkpoints.includes("cleanup_complete"));
});

test("already absent remote is adopted without restoration or delete replay", async () => {
  const o = owner(); const initial = live(o, { remoteHead: null, localHead: null, worktree: { ...live(o).worktree, present: false } }); let deletes = 0;
  const result = await continuePostMergeCleanup(planPostMergeCleanup(o, initial).state, { readLive: async () => initial, checkpoint: async () => {}, deleteRemote: async () => { deletes++; return { ok: true }; } });
  assert.equal(result.ok, true); assert.equal(deletes, 0); assert.equal(result.state.lastResult, "complete");
});

test("a successful command is not confirmed until exact absence readback passes", async () => {
  const o = owner(); let current = live(o); let deletes = 0;
  const planned = planPostMergeCleanup(o, current).state;
  const blocked = await continuePostMergeCleanup(planned, {
    readLive: async () => structuredClone(current), checkpoint: async () => {},
    deleteRemote: async () => { deletes += 1; return { ok: true }; },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reasonCode, "remote_cleanup_unconfirmed");
  assert.equal(blocked.state.phase, "remote_delete_intended");
  current.remoteHead = null;
  current.localHead = null;
  current.worktree.present = false;
  const adopted = await continuePostMergeCleanup(blocked.state, { readLive: async () => structuredClone(current), checkpoint: async () => {} });
  assert.equal(adopted.ok, true);
  assert.equal(deletes, 1);
});

test("crash adoption after every boundary never replays completed effects", async () => {
  const o = owner(); let current = live(o); const calls = [];
  const adapter = { readLive: async () => structuredClone(current), checkpoint: async () => {}, deleteRemote: async () => { calls.push("r"); current.remoteHead = null; return { ok: true }; }, removeWorktree: async () => { calls.push("w"); current.worktree.present = false; return { ok: true }; }, deleteLocalBranch: async () => { calls.push("l"); current.localHead = null; return { ok: true }; } };
  const first = await continuePostMergeCleanup(planPostMergeCleanup(o, current).state, adapter); const second = await continuePostMergeCleanup(first.state, adapter); assert.equal(second.ok, true); assert.deepEqual(calls, ["r", "w", "l"]);
});

test("effect failure preserves merge success and projects bounded sanitized cleanup_required", async () => {
  const o = owner(); const initial = live(o); const planned = planPostMergeCleanup(o, initial).state;
  const result = await continuePostMergeCleanup(planned, { readLive: async () => initial, checkpoint: async () => {}, deleteRemote: async () => ({ ok: false, reasonCode: "provider_transport" }) });
  assert.equal(result.outcome, "cleanup_required"); assert.equal(result.state.mergeAuthoritative, true); assert.equal(result.state.cleanupRequired, true);
  const projection = projectPostMergeCleanup({ ...result.state, blocker: "token=secret raw path /tmp/x" }); assert.equal(projection.blocker, null); assert.equal(projection.expectedSourceHead, o.reviewedHeadSha); assert.equal(JSON.stringify(projection).includes("/tmp"), false);
});

test("cleanup state persists atomically owner-only and rejects corrupt or permissive evidence", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-cleanup-state-")); const o = owner(); const state = planPostMergeCleanup(o, live(o)).state;
  const written = persistPostMergeCleanupState({ logsRoot }, state); assert.equal(written.ok, true); assert.equal(loadPostMergeCleanupState({ logsRoot }, o).ok, true);
  writeFileSync(written.statePath, "{broken", { mode: 0o600 }); assert.equal(loadPostMergeCleanupState({ logsRoot }, o).ok, false);
  persistPostMergeCleanupState({ logsRoot }, state); chmodSync(written.statePath, 0o644); assert.equal(loadPostMergeCleanupState({ logsRoot }, o).reasonCode, "cleanup_state_unsafe");
});

test("normal merged-task path creates and persists exact ownership only after target tree acceptance and hygiene", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-cleanup-owner-")); const base = s("a"); const source = s("b"); const merge = s("c"); const target = s("d"); const tree = s("e");
  const runner = (_command, args) => { const joined = args.join(" "); if (joined.includes("rev-parse refs/remotes/origin/main")) return { status: 0, stdout: `${target}\n` }; if (joined.includes("merge-base --is-ancestor")) return { status: 0, stdout: "" }; if (joined.includes("rev-parse") && joined.includes("^{tree}")) return { status: 0, stdout: `${tree}\n` }; if (args[0] === "fetch") return { status: 0, stdout: "" }; return { status: 1, stderr: "unexpected" }; };
  const result = preparePostMergeCleanupOwnership({ logsRoot, repoRoot: "/repo", runnerRunId: "run-947" }, { taskKey: "20260723-1007", runId: "run-947", issue: { number: 947 }, branchName: "feature/auto-947-cleanup", pr: { headRefName: "feature/auto-947-cleanup", baseRefName: "main", url: "https://github.com/owner/repo/pull/949" }, expectedOriginMainSha: base, recoveryState: { taskKey: "20260723-1007", issue: { number: 947 }, branch: { name: "feature/auto-947-cleanup", baseSha: base, currentHeadSha: source }, mutationMarkers: { branch_ownership_created: { [`feature/auto-947-cleanup:${base}`]: { target: "feature/auto-947-cleanup", correlation: base } } } }, validation: { passed: true, headSha: source, baseSha: base }, externalReview: { status: "pass" }, review: { verdict: { verdict: "approve" } } }, { runner, mergeSha: merge, hygiene: { status: "merged", closeDecision: { close: true }, closure: { status: "updated" }, comment: { status: "updated" }, parentProgress: { status: "updated" }, ledger: { status: "updated" } }, sourceHeadSha: source, repositorySlug: "owner/repo", prNumber: 949, cleanupBranchSafety: { ok: true, protected: false, defaultBranch: "main" } });
  assert.equal(result.ok, true); assert.equal(result.ownership.reviewedHeadSha, source); assert.equal(result.ownership.mergeSha, merge); assert.equal(result.ownership.acceptance.targetHeadSha, target);
});

test("production-shaped isolated repository deletes only the exact owned remote, worktree and merged local branch", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-cleanup-")); const bare = path.join(root, "remote.git"); const repo = path.join(root, "repo"); const wt = path.join(root, "owned-wt");
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  execFileSync("git", ["init", "--bare", bare]); execFileSync("git", ["clone", bare, repo]); git(repo, "config", "user.email", "runner@example.test"); git(repo, "config", "user.name", "Runner Test");
  writeFileSync(path.join(repo, "base.txt"), "base\n"); git(repo, "add", "base.txt"); git(repo, "commit", "-m", "base"); git(repo, "branch", "-M", "main"); git(repo, "push", "-u", "origin", "main"); const base = git(repo, "rev-parse", "HEAD");
  git(repo, "branch", "feature/auto-947-cleanup"); git(repo, "worktree", "add", wt, "feature/auto-947-cleanup"); writeFileSync(path.join(wt, "change.txt"), "change\n"); git(wt, "add", "change.txt"); git(wt, "commit", "-m", "change"); const reviewed = git(wt, "rev-parse", "HEAD"); git(wt, "push", "-u", "origin", "feature/auto-947-cleanup");
  git(repo, "merge", "--no-ff", "feature/auto-947-cleanup", "-m", "merge"); const merge = git(repo, "rev-parse", "HEAD"); git(repo, "push", "origin", "main");
  git(repo, "branch", "manual-keep", base); git(repo, "push", "origin", "manual-keep");
  const worktreeIdentity = createHash("sha256").update(JSON.stringify({ repository: "owner/repo", branchName: "feature/auto-947-cleanup", headSha: reviewed, realPath: wt })).digest("hex");
  const o = owner({ baseSha: base, reviewedHeadSha: reviewed, mergeSha: merge, acceptance: { passed: true, targetHeadSha: merge, evidenceDigest: d("e") }, worktree: { identity: worktreeIdentity, disposable: true } });
  const authority = { ...live(o), remoteHead: undefined, localHead: undefined, worktree: {} };
  const adapter = createPostMergeCleanupGitAdapter({ repoRoot: repo, authorityReader: async () => authority, checkpoint: async () => {} }); const initial = await adapter.readLive(o); const result = await continuePostMergeCleanup(planPostMergeCleanup(o, initial).state, adapter);
  assert.equal(result.ok, true, JSON.stringify({ reasonCode: result.reasonCode, phase: result.state?.phase, blocker: result.state?.blocker })); assert.equal(git(repo, "ls-remote", "--heads", "origin", "refs/heads/feature/auto-947-cleanup"), ""); assert.match(git(repo, "ls-remote", "--heads", "origin", "refs/heads/manual-keep"), /refs\/heads\/manual-keep/); assert.throws(() => git(repo, "show-ref", "--verify", "refs/heads/feature/auto-947-cleanup")); assert.equal(git(repo, "rev-parse", "refs/heads/manual-keep"), base);
});
