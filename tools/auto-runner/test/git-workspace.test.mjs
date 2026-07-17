import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runGit, sourceStateIdentityForCommit } from "../lib/git-workspace.mjs";

function tempRepo() {
  const cwd = mkdtempSync(path.join(tmpdir(), "settleora-git-identity-"));
  const git = (...args) => {
    const result = runGit(args, { cwd });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  git("init");
  git("config", "user.email", "codex@example.invalid");
  git("config", "user.name", "Codex Test");
  writeFileSync(path.join(cwd, "base.txt"), "base\n");
  git("add", "base.txt");
  git("commit", "-m", "base");
  const base = git("rev-parse", "HEAD");
  return { cwd, git, base, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

test("sourceStateIdentityForCommit returns exact head, tree, and stable patch ID", () => {
  const repo = tempRepo();
  try {
    writeFileSync(path.join(repo.cwd, "a.txt"), "alpha\n");
    repo.git("add", "a.txt");
    repo.git("commit", "-m", "add alpha");
    const firstHead = repo.git("rev-parse", "HEAD");
    const first = sourceStateIdentityForCommit({ cwd: repo.cwd, baseRef: repo.base, headRef: "HEAD" });
    assert.equal(first.exactHead, firstHead);
    assert.match(first.treeId, /^[0-9a-f]{40}$/);
    assert.match(first.patchId, /^[0-9a-f]{40}$/);
    assert.notEqual(first.patchId, firstHead);

    repo.git("commit", "--allow-empty", "-m", "metadata only");
    const secondHead = repo.git("rev-parse", "HEAD");
    const second = sourceStateIdentityForCommit({ cwd: repo.cwd, baseRef: repo.base, headRef: "HEAD" });
    assert.notEqual(secondHead, firstHead);
    assert.equal(second.treeId, first.treeId);
    assert.equal(second.patchId, first.patchId);
  } finally {
    repo.cleanup();
  }
});

test("sourceStateIdentityForCommit keeps tree identity for binary changes and never uses commit SHA as patch ID", () => {
  const repo = tempRepo();
  try {
    writeFileSync(path.join(repo.cwd, "blob.bin"), Buffer.from([0, 1, 2, 3, 255]));
    repo.git("add", "blob.bin");
    repo.git("commit", "-m", "binary");
    const head = repo.git("rev-parse", "HEAD");
    const identity = sourceStateIdentityForCommit({ cwd: repo.cwd, baseRef: repo.base, headRef: "HEAD" });
    assert.equal(identity.exactHead, head);
    assert.match(identity.treeId, /^[0-9a-f]{40}$/);
    assert.notEqual(identity.patchId, head);
  } finally {
    repo.cleanup();
  }
});

test("sourceStateIdentityForCommit exposes repeated A/B tree states across metadata commits", () => {
  const repo = tempRepo();
  try {
    writeFileSync(path.join(repo.cwd, "state.txt"), "A\n");
    repo.git("add", "state.txt");
    repo.git("commit", "-m", "state A");
    const a1 = sourceStateIdentityForCommit({ cwd: repo.cwd, baseRef: repo.base, headRef: "HEAD" });
    writeFileSync(path.join(repo.cwd, "state.txt"), "B\n");
    repo.git("add", "state.txt");
    repo.git("commit", "-m", "state B");
    const b1 = sourceStateIdentityForCommit({ cwd: repo.cwd, baseRef: repo.base, headRef: "HEAD" });
    writeFileSync(path.join(repo.cwd, "state.txt"), "A\n");
    repo.git("add", "state.txt");
    repo.git("commit", "-m", "state A again");
    const a2 = sourceStateIdentityForCommit({ cwd: repo.cwd, baseRef: repo.base, headRef: "HEAD" });
    writeFileSync(path.join(repo.cwd, "state.txt"), "B\n");
    repo.git("add", "state.txt");
    repo.git("commit", "-m", "state B again");
    const b2 = sourceStateIdentityForCommit({ cwd: repo.cwd, baseRef: repo.base, headRef: "HEAD" });
    assert.equal(a2.treeId, a1.treeId);
    assert.equal(b2.treeId, b1.treeId);
    assert.equal(a2.patchId, a1.patchId);
    assert.equal(b2.patchId, b1.patchId);
  } finally {
    repo.cleanup();
  }
});
