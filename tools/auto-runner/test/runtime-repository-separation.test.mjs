import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRuntimeManifest, deployRuntimeBundle, runtimeBundleFileList, verifyRuntimeBundle } from "../lib/runtime-bundle.mjs";
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

test("copied runtime remains authoritative after managed branch and source changes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-separation-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "logs");
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
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("path overlap, aliases, manifest drift, missing entry, and digest mismatch fail closed", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-refusal-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "logs");
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
      runtimeMode: "external", runtimeRoot: alias, repoRoot: repo, logsRoot: logs, projectId: "Settleora", repositorySlug: "o/r",
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
    const installed = deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha });
    assert.throws(() => deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha, expectedOldDigest: "0".repeat(64) }), /expected old digest/);
    const upgraded = deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha, expectedOldDigest: installed.manifest.bundleDigest });
    assert.ok(upgraded.rollback);
  } finally {
    rmSync(root, { recursive: true });
  }
});
