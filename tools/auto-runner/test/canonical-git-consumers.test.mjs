import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalEffectContext, canonicalIntent, commitExplicitPaths, computeIntendedTreeForCommit } from "../lib/git-workspace.mjs";
import { preparePreEffectIntent, transitionPreEffectIntent } from "../lib/pre-effect-intent.mjs";
import { pushBranch } from "../lib/pr-manager.mjs";
import { createSessionLifecycleState, persistSessionLifecycleState, transitionSessionLifecyclePhase } from "../lib/session-lifecycle.mjs";

function git(cwd, ...args) { return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } }).trim(); }
function lifecycle(repo, head) { return createSessionLifecycleState({ repository: "owner/repo", issueNumber: 1, taskKey: "task", runId: "run", claimIdentity: "owner/repo#1", chargeMarkerRef: "charge-1", branchName: "feature/test", baseSha: head, headSha: head, sessionId: "session-1", phase: "commit", nextExactAction: "commit" }); }
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-canonical-git-"));
  const repo = path.join(root, "repo");
  git(root, "init", repo);
  git(repo, "switch", "-c", "feature/test");
  writeFileSync(path.join(repo, "file.txt"), "one\n");
  git(repo, "add", "--", "file.txt");
  git(repo, "commit", "-m", "initial");
  const head = git(repo, "rev-parse", "HEAD");
  const config = { repoRoot: repo, logsRoot: path.join(root, "logs"), dryRun: false };
  const persisted = persistSessionLifecycleState(config, lifecycle(repo, head));
  assert.equal(persisted.ok, true);
  return { root, repo, state: persisted.state, config };
}

test("actual commit consumer adopts a crash-window commit without recommitting", async () => {
  const { repo, state, config } = fixture();
  writeFileSync(path.join(repo, "file.txt"), "two\n");
  git(repo, "add", "--", "file.txt");
  const context = canonicalEffectContext(config, state);
  const parent = git(repo, "rev-parse", "HEAD");
  const effect = { expectedParents: [parent], treeSha: git(repo, "write-tree"), stagedPaths: ["file.txt"], messageDigest: createHash("sha256").update("change").digest("hex") };
  const intent = preparePreEffectIntent({ ...config, currentAuthority: context.currentAuthority }, canonicalIntent(context, "commit", effect, { headSha: parent }));
  transitionPreEffectIntent({ ...config, currentAuthority: context.currentAuthority }, intent, "executing");
  git(repo, "commit", "-m", "change");
  const completed = git(repo, "rev-parse", "HEAD");
  const count = git(repo, "rev-list", "--count", "HEAD");
  const result = await commitExplicitPaths(config, ["file.txt"], "change", { effectContext: state });
  assert.equal(result.canonicalEffect.action, "adopted");
  assert.equal(state.branch.headSha, completed);
  assert.equal(git(repo, "rev-parse", "HEAD"), completed);
  assert.equal(git(repo, "rev-list", "--count", "HEAD"), count);
});

test("commit preparation computes its intended tree without mutating the live index", () => {
  const { repo } = fixture();
  writeFileSync(path.join(repo, "file.txt"), "two\n");
  const indexPath = path.join(repo, ".git", "index");
  const beforeIndex = createHash("sha256").update(readFileSync(indexPath)).digest("hex");
  const parent = git(repo, "rev-parse", "HEAD");
  const intendedTree = computeIntendedTreeForCommit(repo, ["file.txt"], parent);
  assert.notEqual(intendedTree, git(repo, "rev-parse", "HEAD^{tree}"));
  assert.equal(createHash("sha256").update(readFileSync(indexPath)).digest("hex"), beforeIndex);
  assert.equal(git(repo, "diff", "--name-only"), "file.txt");
  assert.equal(git(repo, "diff", "--cached", "--name-only"), "");
});

test("actual push consumer adopts a crash-window remote update without replay", async () => {
  const { root, repo, state, config } = fixture();
  const bare = path.join(root, "remote.git");
  git(root, "init", "--bare", bare);
  git(repo, "remote", "add", "origin", bare);
  const context = canonicalEffectContext(config, state);
  const localSha = git(repo, "rev-parse", "HEAD");
  const effect = { localSha, remoteBranch: "feature/test", expectedRemoteBeforeSha: null, allowedFastForwardTarget: localSha, repositoryOwnership: context.repository };
  const intent = preparePreEffectIntent({ ...config, currentAuthority: context.currentAuthority }, canonicalIntent(context, "push", effect, { headSha: localSha }));
  transitionPreEffectIntent({ ...config, currentAuthority: context.currentAuthority }, intent, "executing");
  git(repo, "push", "origin", `${localSha}:refs/heads/feature/test`);
  const result = await pushBranch(config, "feature/test", { effectContext: state });
  assert.equal(result.canonicalEffect.action, "adopted");
  assert.equal(git(repo, "ls-remote", "--heads", "origin", "refs/heads/feature/test").split(/\s+/)[0], localSha);
});

test("default development push uses the exact full destination ref admitted by the source-owned grammar", async () => {
  const { root, repo, config } = fixture();
  const bare = path.join(root, "remote.git");
  git(root, "init", "--bare", bare);
  git(repo, "remote", "add", "origin", bare);
  const localSha = git(repo, "rev-parse", "HEAD");
  const result = await pushBranch(config, "feature/test");
  assert.equal(result.status, 0, result.stderr || result.error);
  assert.equal(git(repo, "ls-remote", "--heads", "origin", "refs/heads/feature/test").split(/\s+/)[0], localSha);
});

test("canonical effect context rejects a stale supplied lifecycle checkpoint", () => {
  const { state, config } = fixture();
  const advanced = transitionSessionLifecyclePhase(config, state, { phase: "validation", nextExactAction: "validate" });
  assert.equal(advanced.ok, true);
  assert.throws(() => canonicalEffectContext(config, state), /lifecycle unavailable|checkpoint is stale/);
  assert.equal(canonicalEffectContext(config, advanced.state).authorityGeneration, advanced.state.sessions.generation);
});
