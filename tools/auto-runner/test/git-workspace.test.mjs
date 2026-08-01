import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  adoptHistoricalTaskWorkspace,
  bindTrustedRepositoryContext,
  gitWorkspaceTestInternals,
  restoreControlPlaneRepositoryContext,
  runGit,
  runTrustedGithub,
  sourceStateIdentityForCommit,
} from "../lib/git-workspace.mjs";
import { canonicalGithubEvidenceDigest } from "../lib/github-evidence-digest.mjs";
import { assertRepositoryRemoteIdentity, verifyRepositoryIdentity } from "../lib/runtime-identity.mjs";

function tempRepo() {
  const cwd = mkdtempSync(path.join(tmpdir(), "settleora-git-identity-"));
  const git = (...args) => {
    const result = runGit(args, { cwd });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  execFileSync("/usr/bin/git", ["init"], { cwd, encoding: "utf8" });
  chmodSync(path.join(cwd, ".git"), 0o700);
  execFileSync("/usr/bin/git", ["config", "user.email", "codex@example.invalid"], { cwd, encoding: "utf8" });
  execFileSync("/usr/bin/git", ["config", "user.name", "Codex Test"], { cwd, encoding: "utf8" });
  writeFileSync(path.join(cwd, "base.txt"), "base\n");
  git("add", "--", "base.txt");
  git("commit", "-m", "base");
  const base = git("rev-parse", "HEAD");
  return { cwd, git, base, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

test("sourceStateIdentityForCommit returns exact head, tree, and stable patch ID", () => {
  const repo = tempRepo();
  try {
    writeFileSync(path.join(repo.cwd, "a.txt"), "alpha\n");
    repo.git("add", "--", "a.txt");
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

test("source-owned Git forwards bounded stdin and ignores inherited Git execution hooks", () => {
  const repo = tempRepo();
  const inherited = process.env.GIT_EXTERNAL_DIFF;
  try {
    const object = runGit(["hash-object", "--stdin"], { cwd: repo.cwd, input: "bounded input\n" });
    assert.equal(object.status, 0, object.stderr);
    assert.match(object.stdout.trim(), /^[0-9a-f]{40}$/u);

    writeFileSync(path.join(repo.cwd, "base.txt"), "changed\n");
    process.env.GIT_EXTERNAL_DIFF = "/definitely/not/an/executable";
    const diff = runGit(["diff", "--", "base.txt"], { cwd: repo.cwd });
    assert.equal(diff.status, 0, diff.stderr);
    assert.match(diff.stdout, /^diff --git /u);
  } finally {
    if (inherited === undefined) delete process.env.GIT_EXTERNAL_DIFF;
    else process.env.GIT_EXTERNAL_DIFF = inherited;
    repo.cleanup();
  }
});

test("production external Git transport fails before a same-UID config race can contact either endpoint", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-transport-race-"));
  const repo = tempRepo();
  const good = path.join(root, "good.git");
  const alternate = path.join(root, "alternate.git");
  try {
    execFileSync("/usr/bin/git", ["init", "--bare", good], { encoding: "utf8" });
    execFileSync("/usr/bin/git", ["init", "--bare", alternate], { encoding: "utf8" });
    execFileSync("/usr/bin/git", ["-C", repo.cwd, "push", good, `${repo.base}:refs/heads/main`], { encoding: "utf8" });
    writeFileSync(path.join(repo.cwd, "alternate.txt"), "alternate\n");
    repo.git("add", "--", "alternate.txt");
    repo.git("commit", "-m", "alternate endpoint");
    const alternateHead = repo.git("rev-parse", "HEAD");
    execFileSync("/usr/bin/git", ["-C", repo.cwd, "push", alternate, `${alternateHead}:refs/heads/main`], { encoding: "utf8" });
    execFileSync("/usr/bin/git", ["-C", repo.cwd, "remote", "add", "origin", good], { encoding: "utf8" });

    const before = readdirSync(tmpdir()).filter((name) => name.startsWith("settleora-git-transport-")).sort();
    const read = runGit(["ls-remote", good, "refs/heads/main"], { cwd: repo.cwd });
    const pushed = runGit(["push", good, `${alternateHead}:refs/heads/race-proof`], { cwd: repo.cwd });
    const after = readdirSync(tmpdir()).filter((name) => name.startsWith("settleora-git-transport-")).sort();
    assert.equal(read.status, 128);
    assert.equal(read.reasonCode, "protected_external_git_transport_unavailable");
    assert.equal(pushed.status, 128);
    assert.equal(pushed.reasonCode, "protected_external_git_transport_unavailable");
    assert.deepEqual(after, before, "production must not create a runner-owned transport directory that same UID can chmod or replace");
    assert.equal(gitWorkspaceTestInternals.createExternalTransportEnvironment, undefined);
    execFileSync("/usr/bin/git", ["-C", repo.cwd, "config", `url.${alternate}.insteadOf`, good], { encoding: "utf8" });
    execFileSync("/usr/bin/git", ["-C", repo.cwd, "config", `url.${alternate}.pushInsteadOf`, good], { encoding: "utf8" });
    assert.throws(
      () => runGit(["push", good, `${alternateHead}:refs/heads/race-proof`], { cwd: repo.cwd }),
      /Repository Git configuration is unsafe/u,
    );
    for (const bare of [good, alternate]) {
      const branch = spawnSync("/usr/bin/git", [
        "--git-dir", bare, "show-ref", "--verify", "refs/heads/race-proof",
      ], { encoding: "utf8" });
      assert.notEqual(branch.status, 0);
    }
  } finally {
    repo.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test("only the closed source-owned Git command grammar reaches Git", () => {
  const repo = tempRepo();
  try {
    const aliasMarker = path.join(repo.cwd, "alias-executed");
    for (const args of [
      ["-C", repo.cwd, "ls-remote", "https://github.com/example/repo.git"],
      [`-C${repo.cwd}`, "ls-remote", "https://github.com/example/repo.git"],
      ["--git-dir", path.join(repo.cwd, ".git"), "fetch", "https://github.com/example/repo.git"],
      [`--git-dir=${path.join(repo.cwd, ".git")}`, "fetch", "https://github.com/example/repo.git"],
      ["--work-tree", repo.cwd, "push", "https://github.com/example/repo.git", "HEAD"],
      [`--work-tree=${repo.cwd}`, "push", "https://github.com/example/repo.git", "HEAD"],
      ["-c", "alias.x=fetch", "x", "https://github.com/example/repo.git"],
      ["-c", `alias.x=!touch ${aliasMarker}`, "x"],
      ["config", "alias.x", `!touch ${aliasMarker}`],
      ["remote", "update"],
      ["fetch-pack", "https://github.com/example/repo.git"],
      ["send-pack", "https://github.com/example/repo.git"],
      ["pull", "https://github.com/example/repo.git"],
      ["fetch", "--upload-pack=/bin/sh", "https://github.com/example/repo.git", "refs/heads/main"],
      ["push", "--receive-pack=/bin/sh", "https://github.com/example/repo.git", "HEAD"],
      ["apply", "--unsafe-paths", "-"],
      ["add", "--all"],
      ["add", "--", ":(top,glob)**"],
      ["branch", "--edit-description", "main"],
      ["worktree", "add", "/tmp/outside", "HEAD"],
      ["push", "--no-verify", `--force-with-lease=refs/heads/a:${"a".repeat(40)}`, "/tmp/remote.git", ":refs/heads/b"],
    ]) {
      const result = runGit(args, { cwd: repo.cwd });
      assert.equal(result.status, 128, args.join(" "));
      assert.equal(result.reasonCode, "source_owned_git_argv_unrecognized", args.join(" "));
      assert.match(result.stderr, /source-owned command grammar/u);
    }
    assert.equal(existsSync(aliasMarker), false);
    assert.equal(gitWorkspaceTestInternals.classifySourceOwnedGitCommand(["merge", "--ff-only", "origin/topic"]).kind, "local");
    assert.equal(gitWorkspaceTestInternals.classifySourceOwnedGitCommand(["status", "--porcelain=v2"]).kind, "local");
    assert.equal(gitWorkspaceTestInternals.classifySourceOwnedGitCommand([
      "commit-tree", "a".repeat(40), "-p", "b".repeat(40), "-p", "c".repeat(40),
      "-m", "Settleora prospective recovery validation",
    ]).kind, "local");
    assert.equal(gitWorkspaceTestInternals.classifySourceOwnedGitCommand([
      "show-ref", "--verify", "--hash", "refs/heads/topic",
    ]).kind, "local");
    assert.equal(gitWorkspaceTestInternals.classifySourceOwnedGitCommand([
      "push", "--no-verify", `--force-with-lease=refs/heads/topic:${"a".repeat(40)}`,
      "/tmp/remote.git", ":refs/heads/topic",
    ]).kind, "transport");
  } finally {
    repo.cleanup();
  }
});

test("literal fetch updates the exact remote-tracking ref and only the exact fast-forward form advances HEAD", () => {
  const repo = tempRepo();
  const root = mkdtempSync(path.join(tmpdir(), "settleora-explicit-fetch-"));
  const bare = path.join(root, "remote.git");
  try {
    execFileSync("/usr/bin/git", ["init", "--bare", bare], { encoding: "utf8" });
    execFileSync("/usr/bin/git", ["-C", repo.cwd, "remote", "add", "origin", bare], { encoding: "utf8" });
    execFileSync("/usr/bin/git", ["-C", repo.cwd, "push", bare, `${repo.base}:refs/heads/main`], { encoding: "utf8" });
    writeFileSync(path.join(repo.cwd, "topic.txt"), "topic\n");
    repo.git("add", "--", "topic.txt");
    repo.git("commit", "-m", "topic");
    const topic = repo.git("rev-parse", "HEAD");
    execFileSync("/usr/bin/git", ["-C", repo.cwd, "push", bare, `${topic}:refs/heads/topic`], { encoding: "utf8" });
    execFileSync("/usr/bin/git", ["-C", repo.cwd, "reset", "--hard", repo.base], { encoding: "utf8" });

    const fetched = runGit(["fetch", bare, "refs/heads/topic:refs/remotes/origin/topic"], {
      cwd: repo.cwd, allowLocalFileTransport: true,
    });
    assert.equal(fetched.status, 0, fetched.stderr);
    assert.equal(repo.git("rev-parse", "origin/topic"), topic);
    const merged = runGit(["merge", "--ff-only", "origin/topic"], { cwd: repo.cwd });
    assert.equal(merged.status, 0, merged.stderr);
    assert.equal(repo.git("rev-parse", "HEAD"), topic);
  } finally {
    repo.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test("fixed Git arguments neutralize helper-bearing config before every admitted spawn", () => {
  const args = gitWorkspaceTestInternals.fixedRepositoryGitArgs(process.cwd(), ["commit", "-m", "bounded"]);
  for (const binding of [
    "core.hooksPath=/dev/null", "core.editor=/usr/bin/false", "sequence.editor=/usr/bin/false",
    "commit.gpgSign=false", "tag.gpgSign=false", "gpg.program=/usr/bin/false",
    "gpg.openpgp.program=/usr/bin/false", "gpg.ssh.program=/usr/bin/false",
  ]) assert.ok(args.includes(binding), binding);
  const diff = gitWorkspaceTestInternals.fixedRepositoryGitArgs(process.cwd(), ["diff", "--binary"]);
  assert.deepEqual(diff.slice(-4), ["diff", "--no-ext-diff", "--no-textconv", "--binary"]);
  const context = {
    root: process.cwd(), gitDir: path.join(process.cwd(), ".git"),
    commonDir: path.join(process.cwd(), ".git"), indexFile: path.join(process.cwd(), ".git", "index"),
  };
  assert.equal(gitWorkspaceTestInternals.fixedRepositoryGitEnvironment(context).GIT_LITERAL_PATHSPECS, "1");
});

test("trusted GitHub execution requires an explicit canonical repository context", () => {
  const absent = runTrustedGithub({ repoRoot: process.cwd() }, ["pr", "view", "1"]);
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /explicit GitHub repository context/u);

  const malformed = runTrustedGithub({
    repoRoot: process.cwd(), repositorySlug: "https://github.com/example/repo",
  }, ["issue", "view", "1"]);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /explicit GitHub repository context/u);

  assert.deepEqual(
    gitWorkspaceTestInternals.bindGithubRepository(["pr", "view", "1"], "example/repo"),
    ["pr", "view", "1", "--repo", "example/repo"],
  );
  assert.deepEqual(
    gitWorkspaceTestInternals.bindGithubRepository(["run", "view", "2"], "example/repo"),
    ["run", "view", "2", "--repo", "example/repo"],
  );
  assert.deepEqual(
    gitWorkspaceTestInternals.bindGithubRepository(["api", "repos/example/repo"], "example/repo"),
    ["api", "repos/example/repo"],
  );
  assert.throws(
    () => gitWorkspaceTestInternals.bindGithubRepository(["pr", "view", "1", "--repo", "attacker/repo"], "example/repo"),
    /differs from the trusted repository/u,
  );
  assert.throws(
    () => gitWorkspaceTestInternals.bindGithubRepository(["api", "repos/attacker/repo/issues/1"], "example/repo"),
    /API endpoint differs/u,
  );
  assert.throws(
    () => gitWorkspaceTestInternals.bindGithubRepository(["repo", "view", "attacker/repo"], "example/repo"),
    /positional repository differs/u,
  );
  assert.throws(
    () => gitWorkspaceTestInternals.bindGithubRepository([
      "api", "graphql", "-f", "query=query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id}}",
      "-f", "owner=attacker", "-f", "name=repo",
    ], "example/repo"),
    /GraphQL repository variables differ/u,
  );
});

test("graph-rewriting graft, alternate and shallow metadata fail closed", () => {
  for (const relative of [
    ".git/info/grafts",
    ".git/objects/info/alternates",
    ".git/objects/info/http-alternates",
    ".git/shallow",
  ]) {
    const repo = tempRepo();
    try {
      const target = path.join(repo.cwd, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, "attacker-controlled graph metadata\n");
      assert.throws(
        () => runGit(["rev-parse", "HEAD"], { cwd: repo.cwd }),
        /rewrites object ancestry/u,
        relative,
      );
    } finally { repo.cleanup(); }
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
    execFileSync("/usr/bin/git", ["init", "-b", "main"], { cwd: repoRoot, encoding: "utf8" });
    chmodSync(path.join(repoRoot, ".git"), 0o700);
    execFileSync("/usr/bin/git", ["config", "user.email", "codex@example.invalid"], { cwd: repoRoot, encoding: "utf8" });
    execFileSync("/usr/bin/git", ["config", "user.name", "Codex Test"], { cwd: repoRoot, encoding: "utf8" });
    execFileSync("/usr/bin/git", ["remote", "add", "origin", "https://github.com/tommytang213/Settleora.git"], { cwd: repoRoot, encoding: "utf8" });
    writeFileSync(path.join(repoRoot, "base.txt"), "base\n");
    git("add", "--", "base.txt");
    git("commit", "-m", "base");
    const mainSha = git("rev-parse", "HEAD");
    git("switch", "-c", "feature/preserved");
    writeFileSync(path.join(repoRoot, "candidate.txt"), "candidate\n");
    git("add", "--", "candidate.txt");
    git("commit", "-m", "candidate");
    const candidateSha = git("rev-parse", "HEAD");
    git("switch", "main");
    bindTrustedRepositoryContext(repoRoot);
    const repositoryIdentity = verifyRepositoryIdentity(repoRoot, "tommytang213/Settleora");
    const config = {
      repoRoot,
      logsRoot,
      repositorySlug: "tommytang213/Settleora",
      runtimeMode: "external",
      runtimeIdentity: Object.freeze({
        repoRoot,
        repositoryCommonDir: repositoryIdentity.commonDir,
        repositoryGitDir: repositoryIdentity.gitDir,
        repositoryIndexFile: repositoryIdentity.indexFile,
        repositoryEntryPath: repositoryIdentity.entryPath,
        repositoryEntryIdentity: repositoryIdentity.entryIdentity,
        repositoryGitDirIdentity: repositoryIdentity.gitDirIdentity,
        repositoryCommonDirIdentity: repositoryIdentity.commonDirIdentity,
        repositoryMetadataIdentity: repositoryIdentity.guardedMetadataIdentity,
        originUrl: repositoryIdentity.originUrl,
        pushUrl: repositoryIdentity.pushUrl,
      }),
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
    assert.deepEqual(assertRepositoryRemoteIdentity(config), Object.freeze({
      originUrl: "https://github.com/tommytang213/Settleora.git",
      pushUrl: "https://github.com/tommytang213/Settleora.git",
    }));
    assert.deepEqual(assertRepositoryRemoteIdentity({ ...config }), Object.freeze({
      originUrl: "https://github.com/tommytang213/Settleora.git",
      pushUrl: "https://github.com/tommytang213/Settleora.git",
    }));
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
    const repairAdd = runGit(["add", "--", "repair.txt"], { cwd: adopted.taskRoot });
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
    assert.equal(assertRepositoryRemoteIdentity(config).originUrl,
      "https://github.com/tommytang213/Settleora.git");

    renameSync(path.join(repoRoot, ".git"), path.join(repoRoot, ".git-admitted"));
    execFileSync("/usr/bin/git", ["init", "-b", "main"], { cwd: repoRoot, encoding: "utf8" });
    chmodSync(path.join(repoRoot, ".git"), 0o700);
    assert.throws(
      () => runGit(["rev-parse", "HEAD"], { cwd: repoRoot }),
      /Git tuple changed after admission/u,
    );
  } finally {
    process.chdir("/tmp");
    rmSync(root, { recursive: true, force: true });
  }
});

test("sourceStateIdentityForCommit keeps tree identity for binary changes and never uses commit SHA as patch ID", () => {
  const repo = tempRepo();
  try {
    writeFileSync(path.join(repo.cwd, "blob.bin"), Buffer.from([0, 1, 2, 3, 255]));
    repo.git("add", "--", "blob.bin");
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
    repo.git("add", "--", "state.txt");
    repo.git("commit", "-m", "state A");
    const a1 = sourceStateIdentityForCommit({ cwd: repo.cwd, baseRef: repo.base, headRef: "HEAD" });
    writeFileSync(path.join(repo.cwd, "state.txt"), "B\n");
    repo.git("add", "--", "state.txt");
    repo.git("commit", "-m", "state B");
    const b1 = sourceStateIdentityForCommit({ cwd: repo.cwd, baseRef: repo.base, headRef: "HEAD" });
    writeFileSync(path.join(repo.cwd, "state.txt"), "A\n");
    repo.git("add", "--", "state.txt");
    repo.git("commit", "-m", "state A again");
    const a2 = sourceStateIdentityForCommit({ cwd: repo.cwd, baseRef: repo.base, headRef: "HEAD" });
    writeFileSync(path.join(repo.cwd, "state.txt"), "B\n");
    repo.git("add", "--", "state.txt");
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
