import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRuntimeManifest, deployRuntimeBundle, inspectDeploymentQuiescence, inspectRuntimeConsumers, rollbackRuntimeBundle, runtimeBundleFileList, verifyRuntimeBundle, verifyRuntimeSourceAgainstCommit } from "../lib/runtime-bundle.mjs";
import { absoluteRuntimeEntry, assertSeparatedRoots, repositoryAuthorityLockPath, validateProjectRuntimeIdentity } from "../lib/runtime-identity.mjs";

const sourceRoot = realpathSync(path.resolve("tools/auto-runner"));
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.resolve("."), encoding: "utf8" }).trim();

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function createRepo(root, name) {
  const repo = path.join(root, name);
  mkdirSync(repo);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "runner@example.invalid"]);
  git(repo, ["config", "user.name", "Runner Test"]);
  git(repo, ["remote", "add", "origin", "git@github.com-settleora:tommytang213/Settleora.git"]);
  writeFileSync(path.join(repo, "README.md"), "fixture\n");
  mkdirSync(path.join(repo, "tools/auto-runner"), { recursive: true });
  writeFileSync(path.join(repo, "tools/auto-runner/settleora-auto-runner.mjs"), "throw new Error('managed repository controller executed');\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "fixture"]);
  return realpathSync(repo);
}

test("runtime manifest is deterministic, sorted, generic, and digest verified", () => {
  const first = buildRuntimeManifest(sourceRoot, { sourceSha, generatedAt: "2026-01-01T00:00:00.000Z" });
  const second = buildRuntimeManifest(sourceRoot, { sourceSha, generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.deepEqual(first, second);
  assert.deepEqual(first.files.map((file) => file.path), [...first.files.map((file) => file.path)].sort());
  assert.equal(first.files.some((file) => /(^|\/)(\.git|node_modules|AGENTS\.md|logs|reports|config)(\/|$)/.test(file.path)), false);
  assert.equal(first.bundleDigest.length, 64);
  assert.deepEqual(runtimeBundleFileList(sourceRoot), first.files.map((file) => file.path));
});

test("deployment source verification rejects assume-unchanged bytes and ignored runtime files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-source-commit-"));
  try {
    const repo = path.join(root, "repo");
    const runtimeSource = path.join(repo, "tools/auto-runner");
    mkdirSync(path.dirname(runtimeSource), { recursive: true });
    cpSync(sourceRoot, runtimeSource, { recursive: true });
    git(repo, ["init", "-b", "main"]);
    git(repo, ["config", "user.email", "runner@example.invalid"]);
    git(repo, ["config", "user.name", "Runner Test"]);
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "runtime source"]);
    const approvedSha = git(repo, ["rev-parse", "HEAD"]);
    assert.equal(verifyRuntimeSourceAgainstCommit({ repoRoot: repo, sourceRoot: runtimeSource, sourceSha: approvedSha }).fileCount, 89);
    const hiddenPath = path.join(runtimeSource, "lib/runtime-identity.mjs");
    git(repo, ["update-index", "--assume-unchanged", "tools/auto-runner/lib/runtime-identity.mjs"]);
    writeFileSync(hiddenPath, `${readFileSync(hiddenPath, "utf8")}\n`);
    assert.equal(git(repo, ["status", "--porcelain"]), "");
    assert.throws(
      () => verifyRuntimeSourceAgainstCommit({ repoRoot: repo, sourceRoot: runtimeSource, sourceSha: approvedSha }),
      /bytes do not match/,
    );
    git(repo, ["update-index", "--no-assume-unchanged", "tools/auto-runner/lib/runtime-identity.mjs"]);
    writeFileSync(hiddenPath, execFileSync("git", ["show", `${approvedSha}:tools/auto-runner/lib/runtime-identity.mjs`], { cwd: repo }));
    writeFileSync(path.join(runtimeSource, "lib/ignored-local.mjs"), "export const unreviewed = true;\n");
    writeFileSync(path.join(repo, ".git/info/exclude"), "tools/auto-runner/lib/ignored-local.mjs\n");
    assert.equal(git(repo, ["status", "--porcelain"]), "");
    assert.throws(
      () => verifyRuntimeSourceAgainstCommit({ repoRoot: repo, sourceRoot: runtimeSource, sourceSha: approvedSha }),
      /file list does not match/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("copied runtime remains authoritative after managed branch and source changes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-separation-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "Settleora");
    const runtimeParent = path.join(root, "installed");
    mkdirSync(logs, { mode: 0o700 });
    mkdirSync(runtimeParent);
    const runtime = path.join(runtimeParent, "runtime");
    const deployed = deployRuntimeBundle({ sourceRoot, destination: runtime, repoRoot: repo, logsRoot: logs, sourceSha });
    assert.equal(verifyRuntimeBundle(runtime).bundleDigest, deployed.manifest.bundleDigest);
    const entry = absoluteRuntimeEntry(runtime, "settleora-auto-runner.mjs");
    assert.equal(entry.startsWith(`${runtime}${path.sep}`), true);
    git(repo, ["switch", "-c", "feature/change-controller"]);
    writeFileSync(path.join(repo, "tools/auto-runner/settleora-auto-runner.mjs"), "throw new Error('changed managed controller executed');\n");
    assert.equal(absoluteRuntimeEntry(runtime, "settleora-auto-runner.mjs"), entry);
    assert.equal(readFileSync(entry, "utf8").includes("changed managed controller"), false);
    const otherCwd = path.join(root, "unrelated");
    mkdirSync(otherCwd);
    const identity = validateProjectRuntimeIdentity({
      runtimeMode: "external",
      runtimeRoot: runtime,
      repoRoot: repo,
      logsRoot: logs,
      projectId: "Settleora",
      repositorySlug: "tommytang213/Settleora",
    }, { actualRuntimeRoot: runtime });
    assert.equal(identity.repoRoot, repo);
    assert.equal(identity.runtimeRoot, runtime);
    assert.throws(() => validateProjectRuntimeIdentity({
      runtimeMode: "external",
      runtimeRoot: runtime,
      repoRoot: repo,
      logsRoot: logs,
      projectId: "OtherProject",
      repositorySlug: "tommytang213/Settleora",
    }, { actualRuntimeRoot: runtime }), /project-bound/);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("control CLI resolves runner children from its runtime bundle", () => {
  const source = readFileSync(path.join(sourceRoot, "settleora-auto-runnerctl.mjs"), "utf8");
  assert.match(source, /absoluteRuntimeEntry\(runtimeRoot, "settleora-auto-runner\.mjs"\)/);
  assert.doesNotMatch(source, /spawnSync\(process\.execPath, \["tools\/auto-runner\/settleora-auto-runner\.mjs"/);
});

test("path overlap, aliases, manifest drift, missing entry, and digest mismatch fail closed", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-refusal-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "Settleora");
    const runtimeParent = path.join(root, "installed");
    mkdirSync(logs, { mode: 0o700 });
    mkdirSync(runtimeParent);
    const runtime = path.join(runtimeParent, "runtime");
    deployRuntimeBundle({ sourceRoot, destination: runtime, repoRoot: repo, logsRoot: logs, sourceSha });
    assert.throws(() => assertSeparatedRoots({ runtimeRoot: path.join(repo, "runtime"), repoRoot: repo, logsRoot: logs }), /separate/);
    assert.throws(() => assertSeparatedRoots({ runtimeRoot: runtime, repoRoot: repo, logsRoot: path.join(runtime, "logs") }), /separate/);
    const alias = path.join(root, "runtime-alias");
    symlinkSync(runtime, alias);
    assert.throws(() => validateProjectRuntimeIdentity({
      runtimeMode: "external", runtimeRoot: alias, repoRoot: repo, logsRoot: logs, projectId: "Settleora", repositorySlug: "tommytang213/Settleora",
    }, { actualRuntimeRoot: alias }), /real directory/);
    writeFileSync(path.join(runtime, "lib/runtime-identity.mjs"), "\n// drift\n", { flag: "a" });
    assert.throws(() => verifyRuntimeBundle(runtime), /drift/);
    assert.throws(() => verifyRuntimeBundle(runtime, "0".repeat(64)), /drift|mismatch/);
    assert.throws(() => absoluteRuntimeEntry(runtime, "missing.mjs"), /missing/);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("distinct repositories isolate authority while the same canonical repository collides", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-project-isolation-"));
  try {
    const repoA = createRepo(root, "repo-a");
    const repoB = createRepo(root, "repo-b");
    const authority = path.join(root, "authority");
    const a1 = repositoryAuthorityLockPath(repoA, authority);
    const a2 = repositoryAuthorityLockPath(repoA, authority);
    const b = repositoryAuthorityLockPath(repoB, authority);
    assert.equal(a1, a2);
    assert.notEqual(a1, b);
    const linked = path.join(root, "repo-a-linked");
    git(repoA, ["worktree", "add", "--detach", linked]);
    assert.equal(repositoryAuthorityLockPath(realpathSync(linked), authority), a1);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("deployment quiescence detects active owners and unresolved effects", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-deploy-quiescence-"));
  try {
    mkdirSync(path.join(root, "locks"));
    writeFileSync(path.join(root, "locks", "settleora-auto-runner.lock"), `${JSON.stringify({ pid: process.pid })}\n`);
    assert.equal(inspectDeploymentQuiescence(root).active, true);
    rmSync(path.join(root, "locks", "settleora-auto-runner.lock"));
    mkdirSync(path.join(root, "pre-effect-intents"));
    writeFileSync(path.join(root, "pre-effect-intents", "pending.json"), `${JSON.stringify({ status: "prepared" })}\n`);
    assert.equal(inspectDeploymentQuiescence(root).pendingEffects, true);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("deployment dry-run is inert and active/pending/old-digest guards refuse", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-deploy-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "logs");
    const parent = path.join(root, "installed");
    mkdirSync(logs, { mode: 0o700 });
    mkdirSync(parent);
    const destination = path.join(parent, "runtime");
    assert.equal(deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha, dryRun: true }).dryRun, true);
    assert.throws(() => deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha, active: true }), /active/);
    assert.throws(() => deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha, pendingEffects: true }), /unresolved/);
    assert.throws(() => deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha, runtimeConsumers: [4321] }), /shared runtime/);
    const installed = deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha });
    assert.throws(() => deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha, expectedOldDigest: "0".repeat(64) }), /expected old digest/);
    const upgraded = deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha, expectedOldDigest: installed.manifest.bundleDigest });
    assert.ok(upgraded.rollback);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("runtime consumer discovery covers every project using the shared bundle", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-consumers-"));
  try {
    mkdirSync(path.join(root, "100"));
    mkdirSync(path.join(root, "200"));
    const runtime = "/opt/controller/runtime";
    writeFileSync(path.join(root, "100/cmdline"), `node\0${runtime}/settleora-auto-runner.mjs\0--run\0`);
    writeFileSync(path.join(root, "200/cmdline"), "node\0/unrelated/app.mjs\0");
    assert.deepEqual(inspectRuntimeConsumers(runtime, { procRoot: root, selfPid: 999 }), [100]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manual rollback exchanges only exact verified stopped bundles", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-rollback-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "logs");
    const parent = path.join(root, "install");
    mkdirSync(logs);
    mkdirSync(parent);
    const destination = path.join(parent, "runtime");
    const first = deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha });
    const changedSource = path.join(root, "changed-source");
    cpSync(sourceRoot, changedSource, { recursive: true });
    writeFileSync(path.join(changedSource, "lib/runtime-identity.mjs"), `${readFileSync(path.join(changedSource, "lib/runtime-identity.mjs"), "utf8")}\n`);
    const second = deployRuntimeBundle({
      sourceRoot: changedSource,
      destination,
      repoRoot: repo,
      logsRoot: logs,
      sourceSha: "b".repeat(40),
      expectedOldDigest: first.manifest.bundleDigest,
    });
    renameSync(destination, path.join(parent, ".runtime.deploy-incoming"));
    const adoptedDeploy = deployRuntimeBundle({
      sourceRoot: changedSource,
      destination,
      repoRoot: repo,
      logsRoot: logs,
      sourceSha: "b".repeat(40),
      expectedOldDigest: first.manifest.bundleDigest,
    });
    assert.equal(adoptedDeploy.adopted, true);
    renameSync(
      path.join(parent, ".runtime.rollback"),
      path.join(parent, ".runtime.rollback-incoming"),
    );
    const rolledBack = rollbackRuntimeBundle({
      destination,
      expectedCurrentDigest: second.manifest.bundleDigest,
      expectedRollbackDigest: first.manifest.bundleDigest,
    });
    assert.equal(rolledBack.adopted, true);
    assert.equal(rolledBack.manifest.bundleDigest, first.manifest.bundleDigest);
    assert.equal(verifyRuntimeBundle(rolledBack.rollback).bundleDigest, second.manifest.bundleDigest);
    const adoptedRollback = rollbackRuntimeBundle({
      destination,
      expectedCurrentDigest: second.manifest.bundleDigest,
      expectedRollbackDigest: first.manifest.bundleDigest,
    });
    assert.equal(adoptedRollback.adopted, true);
    assert.throws(() => rollbackRuntimeBundle({
      destination,
      expectedCurrentDigest: "0".repeat(64),
      expectedRollbackDigest: second.manifest.bundleDigest,
    }), /digest mismatch/);
  } finally {
    rmSync(root, { recursive: true });
  }
});
