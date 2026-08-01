import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  adoptHistoricalTaskWorkspace,
  bindTrustedRepositoryContext,
  restoreControlPlaneRepositoryContext,
  runGit,
  sourceStateIdentityForCommit,
} from "../lib/git-workspace.mjs";
import { canonicalGithubEvidenceDigest } from "../lib/github-evidence-digest.mjs";

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

test("historical task workspace is materialized without moving canonical main", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-workspace-adoption-"));
  const repoRoot = path.join(root, "Settleora");
  const logsRoot = path.join(root, "logs");
  mkdirSync(repoRoot);
  mkdirSync(logsRoot, { mode: 0o700 });
  const git = (...args) => {
    const result = runGit(args, { cwd: repoRoot });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  try {
    git("init", "-b", "main");
    git("config", "user.email", "codex@example.invalid");
    git("config", "user.name", "Codex Test");
    git("remote", "add", "origin", "https://github.com/tommytang213/Settleora.git");
    writeFileSync(path.join(repoRoot, "base.txt"), "base\n");
    git("add", "base.txt");
    git("commit", "-m", "base");
    const mainSha = git("rev-parse", "HEAD");
    git("switch", "-c", "feature/preserved");
    writeFileSync(path.join(repoRoot, "candidate.txt"), "candidate\n");
    git("add", "candidate.txt");
    git("commit", "-m", "candidate");
    const candidateSha = git("rev-parse", "HEAD");
    git("switch", "main");
    bindTrustedRepositoryContext(repoRoot);
    const config = {
      repoRoot,
      logsRoot,
      repositorySlug: "tommytang213/Settleora",
    };
    const effectContext = {
      repository: config.repositorySlug,
      sourceTaskKey: "fixture-task",
      runId: "fixture-run",
      logicalTaskIdentity: "tommytang213/Settleora#1",
      claimIdentity: "tommytang213/Settleora#1",
      chargeIdentity: "fixture-charge",
      issueNumber: 1,
      sessionId: "fixture-session",
      authorityGeneration: 1,
      branchName: "feature/preserved",
      currentAuthority: {
        runId: "fixture-run",
        sessionId: "fixture-session",
        authorityGeneration: 1,
        status: "active",
      },
      expectedIdentity: {
        repository: config.repositorySlug,
        sourceTaskKey: "fixture-task",
        runId: "fixture-run",
        logicalTaskIdentity: "tommytang213/Settleora#1",
        claimIdentity: "tommytang213/Settleora#1",
        chargeIdentity: "fixture-charge",
        issueNumber: 1,
        sessionId: "fixture-session",
        authorityGeneration: 1,
      },
    };
    const adopted = adoptHistoricalTaskWorkspace(config, {
      branchName: "feature/preserved",
      headSha: candidateSha,
      taskKey: "fixture-task",
      effectContext,
    });
    assert.notEqual(adopted.taskRoot, repoRoot);
    assert.equal(runGit(["rev-parse", "HEAD"], { cwd: repoRoot }).stdout.trim(), mainSha);
    assert.equal(runGit(["branch", "--show-current"], { cwd: repoRoot }).stdout.trim(), "main");
    assert.equal(runGit(["rev-parse", "HEAD"], { cwd: adopted.taskRoot }).stdout.trim(), candidateSha);
    assert.equal(runGit(["branch", "--show-current"], { cwd: adopted.taskRoot }).stdout.trim(),
      "feature/preserved");
    assert.equal(adopted.created, true);
    const crashWindowRecovery = adoptHistoricalTaskWorkspace(config, {
      branchName: "feature/preserved",
      headSha: candidateSha,
      taskKey: "fixture-task",
      effectContext,
    });
    assert.equal(crashWindowRecovery.taskRoot, adopted.taskRoot);
    assert.equal(crashWindowRecovery.created, true);
    const successorContext = {
      ...effectContext,
      sessionId: "fixture-successor",
      authorityGeneration: 2,
      currentAuthority: {
        runId: "fixture-run",
        sessionId: "fixture-successor",
        authorityGeneration: 2,
        status: "active",
      },
      expectedIdentity: {
        ...effectContext.expectedIdentity,
        sessionId: "fixture-successor",
        authorityGeneration: 2,
      },
    };
    const finalizedIntentSuccessorRecovery = adoptHistoricalTaskWorkspace(config, {
      branchName: "feature/preserved",
      headSha: candidateSha,
      taskKey: "fixture-task",
      effectContext: successorContext,
    });
    assert.equal(finalizedIntentSuccessorRecovery.taskRoot, adopted.taskRoot);
    assert.equal(finalizedIntentSuccessorRecovery.created, true);
    const ownershipIdentity = canonicalGithubEvidenceDigest({
      repository: config.repositorySlug,
      branchName: "feature/preserved",
      realPath: adopted.taskRoot,
    });
    const repeated = adoptHistoricalTaskWorkspace(config, {
      branchName: "feature/preserved",
      headSha: candidateSha,
      taskKey: "fixture-task",
      effectContext,
      requireExisting: true,
      ownershipMarkers: {
        [`feature/preserved:${ownershipIdentity}`]: {
          target: ownershipIdentity,
          correlation: "feature/preserved",
        },
      },
    });
    assert.equal(repeated.taskRoot, adopted.taskRoot);
    assert.equal(repeated.created, false);
    writeFileSync(path.join(adopted.taskRoot, "repair.txt"), "repair\n");
    const repairAdd = runGit(["add", "repair.txt"], { cwd: adopted.taskRoot });
    assert.equal(repairAdd.status, 0, repairAdd.stderr);
    const repairCommit = runGit(["commit", "-m", "prepared repair"], { cwd: adopted.taskRoot });
    assert.equal(repairCommit.status, 0, repairCommit.stderr);
    const preparedRecovery = adoptHistoricalTaskWorkspace(config, {
      branchName: "feature/preserved",
      headSha: candidateSha,
      taskKey: "fixture-task",
      effectContext,
      requireExisting: true,
      allowLiveBranchHead: true,
      ownershipMarkers: {
        [`feature/preserved:${ownershipIdentity}`]: {
          target: ownershipIdentity,
          correlation: "feature/preserved",
        },
      },
    });
    assert.equal(preparedRecovery.taskRoot, adopted.taskRoot);
    assert.equal(preparedRecovery.created, false);
    assert.equal(restoreControlPlaneRepositoryContext(config), repoRoot);
    assert.equal(config.repoRoot, repoRoot);
    assert.equal(process.cwd(), repoRoot);
  } finally {
    process.chdir("/tmp");
    rmSync(root, { recursive: true, force: true });
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
