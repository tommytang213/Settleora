import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireRuntimeDeploymentLock, buildRuntimeManifest, deployRuntimeBundle, inspectDeploymentQuiescence, inspectRuntimeConsumers, releaseRuntimeDeploymentLock, rollbackRuntimeBundle, runtimeBundleFileList, verifyRuntimeBundle, verifyRuntimeSourceAgainstCommit } from "../lib/runtime-bundle.mjs";
import { absoluteRuntimeEntry, assertRepositoryRemoteIdentity, assertSeparatedRoots, matchAuthorizedSupervisorProcess, repositoryAuthorityLockPath, validateProjectRuntimeIdentity } from "../lib/runtime-identity.mjs";
import { fetchOriginMain } from "../lib/git-workspace.mjs";
import { ensureOperationalDirectory, validateExternalProfilePath, verifyProjectNamespaceMarker } from "../lib/config.mjs";
import { assertNodeCompatibility, reclaimStaleOwnMarker } from "../runtime-launcher.mjs";

const sourceRoot = realpathSync(path.resolve("tools/auto-runner"));
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.resolve("."), encoding: "utf8" }).trim();

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function createRepo(root, name) {
  const repo = path.join(root, name);
  mkdirSync(repo);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "runner@example.invalid"]);
  git(repo, ["config", "user.name", "Runner Test"]);
  git(repo, ["remote", "add", "origin", "git@github.com:tommytang213/Settleora.git"]);
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
  assert.equal(first.files.every((file) => file.mode === 0o400 || file.mode === 0o500), true);
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
    assert.equal(verifyRuntimeSourceAgainstCommit({ repoRoot: repo, sourceRoot: runtimeSource, sourceSha: approvedSha }).fileCount, runtimeBundleFileList(runtimeSource).length);
    const hostileBin = path.join(root, "hostile-bin");
    mkdirSync(hostileBin);
    writeFileSync(path.join(hostileBin, "git"), "#!/bin/sh\nprintf 'fabricated-authority\\n'\n");
    chmodSync(path.join(hostileBin, "git"), 0o700);
    const previousGitDir = process.env.GIT_DIR;
    const previousPath = process.env.PATH;
    process.env.GIT_DIR = path.join(root, "hostile-git-dir");
    process.env.PATH = hostileBin;
    try {
      assert.equal(
        verifyRuntimeSourceAgainstCommit({ repoRoot: repo, sourceRoot: runtimeSource, sourceSha: approvedSha }).fileCount,
        runtimeBundleFileList(runtimeSource).length,
        "ambient Git repository redirection must not influence approved source verification",
      );
    } finally {
      if (previousGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previousGitDir;
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
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

test("runtime launcher reclaims only a trusted stale marker for its reused PID", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-launcher-marker-"));
  try {
    const marker = path.join(root, `${process.pid}.lock`);
    writeFileSync(marker, `${JSON.stringify({ pid: process.pid, processBirthId: "0" })}\n`, { mode: 0o600 });
    reclaimStaleOwnMarker(marker);
    assert.equal(existsSync(marker), false);
    writeFileSync(marker, `${JSON.stringify({ pid: process.pid, processBirthId: "0" })}\n`, { mode: 0o644 });
    assert.throws(() => reclaimStaleOwnMarker(marker), /not trusted/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime Node compatibility accepts only strict stable versions in the approved bounded range", () => {
  assert.deepEqual(
    assertNodeCompatibility(">=22 <23", "22.0.0"),
    { range: ">=22 <23", version: "22.0.0", minimum: 22, maximum: 23 },
  );
  assert.equal(assertNodeCompatibility(">=22 <23", "22.999.999").version, "22.999.999");
  for (const version of ["20.19.0", "23.0.0", "24.1.0", "22.1.0-rc.1", "v22.1.0", "22.1"]) {
    assert.throws(() => assertNodeCompatibility(">=22 <23", version), /outside|unsupported/);
  }
  for (const range of [undefined, "", ">=22", ">=22 <=23", "^22", "22.x", ">=23 <22", ">=022 <23", ">=22 <100"]) {
    assert.throws(() => assertNodeCompatibility(range, "22.1.0"), /invalid|unsupported|contradictory/);
  }
});

test("copied launcher refuses an unsupported verified manifest before entry evaluation", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-node-refusal-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "Settleora");
    const parent = path.join(root, "install");
    mkdirSync(logs, { mode: 0o700 });
    mkdirSync(parent, { mode: 0o700 });
    const runtime = path.join(parent, "runtime");
    const deployed = deployRuntimeBundle({ sourceRoot, destination: runtime, repoRoot: repo, logsRoot: logs, sourceSha });
    const evaluated = path.join(root, "entry-evaluated");
    const entryPath = path.join(runtime, "settleora-auto-runnerctl.mjs");
    chmodSync(entryPath, 0o600);
    writeFileSync(entryPath, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(evaluated)}, "yes"); export async function main() {}\n`);
    chmodSync(entryPath, 0o400);
    const manifestPath = path.join(runtime, "runtime-bundle-manifest.json");
    chmodSync(manifestPath, 0o600);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const entryRecord = manifest.files.find((file) => file.path === "settleora-auto-runnerctl.mjs");
    entryRecord.sha256 = createHash("sha256").update(readFileSync(entryPath)).digest("hex");
    manifest.node = ">=23 <24";
    manifest.bundleDigest = createHash("sha256").update(canonicalJson({
      format: manifest.format,
      version: manifest.version,
      sourceSha: manifest.sourceSha,
      files: manifest.files,
      entryPoints: manifest.entryPoints,
      node: manifest.node,
    })).digest("hex");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    chmodSync(manifestPath, 0o400);
    const approvalPath = path.join(parent, ".runtime.approved.json");
    chmodSync(approvalPath, 0o600);
    const approval = JSON.parse(readFileSync(approvalPath, "utf8"));
    approval.bundleDigest = manifest.bundleDigest;
    writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`);
    chmodSync(approvalPath, 0o400);
    const result = spawnSync(process.execPath, [
      deployed.launcher, "--runtime-root", runtime, "--entry", "settleora-auto-runnerctl.mjs", "--",
    ], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside the approved runtime range/);
    assert.equal(existsSync(evaluated), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deployment source verification ignores local Git replacement objects", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-source-replace-"));
  try {
    const repo = path.join(root, "repo");
    const runtimeSource = path.join(repo, "tools/auto-runner");
    mkdirSync(path.dirname(runtimeSource), { recursive: true });
    cpSync(sourceRoot, runtimeSource, { recursive: true });
    git(repo, ["init", "-b", "main"]);
    git(repo, ["config", "user.email", "runner@example.invalid"]);
    git(repo, ["config", "user.name", "Runner Test"]);
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "approved runtime"]);
    const approvedSha = git(repo, ["rev-parse", "HEAD"]);
    const changed = path.join(runtimeSource, "README.md");
    writeFileSync(changed, `${readFileSync(changed, "utf8")}\nreplacement bytes\n`);
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "replacement runtime"]);
    const replacementSha = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["replace", approvedSha, replacementSha]);
    git(repo, ["reset", "--hard", approvedSha]);
    assert.equal(git(repo, ["rev-parse", "HEAD"]), approvedSha);
    assert.equal(git(repo, ["status", "--porcelain"]), "");
    assert.throws(
      () => verifyRuntimeSourceAgainstCommit({ repoRoot: repo, sourceRoot: runtimeSource, sourceSha: approvedSha }),
      /bytes do not match/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deployment CLI requires project logs and keeps rollback dry-run non-mutating", () => {
  const entry = path.join(sourceRoot, "deploy-runtime.mjs");
  const missingLogs = spawnSync(process.execPath, [entry, "--rollback", "--destination", "/tmp/runtime"], { encoding: "utf8" });
  assert.notEqual(missingLogs.status, 0);
  assert.match(missingLogs.stderr, /--logs-root is required/);
  const rollbackDryRun = spawnSync(process.execPath, [
    entry,
    "--rollback",
    "--dry-run",
    "--destination",
    "/tmp/runtime",
    "--logs-root",
    "/tmp/project-logs",
  ], { encoding: "utf8" });
  assert.notEqual(rollbackDryRun.status, 0);
  assert.match(rollbackDryRun.stderr, /cannot be combined/);
});

test("deployment CLI dry-run does not create deployment-control state", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-cli-dry-run-"));
  try {
    const repo = path.join(root, "repo");
    const runtimeSource = path.join(repo, "tools/auto-runner");
    const logs = path.join(root, "logs");
    const installParent = path.join(root, "install");
    mkdirSync(path.dirname(runtimeSource), { recursive: true });
    cpSync(sourceRoot, runtimeSource, { recursive: true });
    mkdirSync(logs, { mode: 0o700 });
    mkdirSync(installParent, { mode: 0o700 });
    git(repo, ["init", "-b", "main"]);
    git(repo, ["config", "user.email", "runner@example.invalid"]);
    git(repo, ["config", "user.name", "Runner Test"]);
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "runtime source"]);
    const approvedSha = git(repo, ["rev-parse", "HEAD"]);
    const tracked = path.join(runtimeSource, "README.md");
    const index = path.join(repo, ".git/index");
    const oldIndexTime = new Date("2000-01-01T00:00:00.000Z");
    utimesSync(tracked, new Date(), new Date());
    utimesSync(index, oldIndexTime, oldIndexTime);
    const indexMtimeBefore = statSync(index).mtimeMs;
    const fsmonitorSentinel = path.join(root, "fsmonitor-ran");
    const fsmonitorHook = path.join(root, "fsmonitor-hook");
    const hostileGitSentinel = path.join(root, "hostile-git-ran");
    const hostileBin = path.join(root, "hostile-bin");
    mkdirSync(hostileBin);
    writeFileSync(path.join(hostileBin, "git"), `#!/bin/sh\nprintf called > '${hostileGitSentinel}'\nprintf 'fabricated-authority\\n'\n`, { mode: 0o700 });
    writeFileSync(fsmonitorHook, `#!/bin/sh\n: > '${fsmonitorSentinel}'\n`, { mode: 0o700 });
    git(repo, ["config", "core.fsmonitor", fsmonitorHook]);
    const result = spawnSync(process.execPath, [
      path.join(runtimeSource, "deploy-runtime.mjs"),
      "--dry-run",
      "--repo-root", repo,
      "--destination", path.join(installParent, "runtime"),
      "--logs-root", logs,
      "--approved-sha", approvedSha,
    ], {
      encoding: "utf8",
      cwd: root,
      env: { ...process.env, PATH: hostileBin, GIT_DIR: path.join(root, "hostile-git-dir") },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).dryRun, true);
    assert.deepEqual(readdirSync(installParent), []);
    assert.equal(statSync(index).mtimeMs, indexMtimeBefore);
    assert.equal(existsSync(fsmonitorSentinel), false);
    assert.equal(existsSync(hostileGitSentinel), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup recognizes only the exact worker in the executing runtime bundle", () => {
  const supervisorRunId = "supervisor-2026-07-23T114800Z-1234";
  const expectedWorker = path.join(sourceRoot, "supervisor/settleora-auto-runner-worker.mjs");
  const options = {
    parentPid: 4321,
    supervisorRunId,
    runtimeRoot: sourceRoot,
    active: true,
    parentCmdline: `node\0${expectedWorker}\0${supervisorRunId}\0`,
  };
  assert.deepEqual(matchAuthorizedSupervisorProcess(options), [4321]);
  const expectedLauncher = path.join(path.dirname(sourceRoot), `.${path.basename(sourceRoot)}.launcher.mjs`);
  assert.deepEqual(matchAuthorizedSupervisorProcess({
    ...options,
    parentCmdline: `node\0${expectedLauncher}\0--runtime-root\0${sourceRoot}\0--entry\0supervisor/settleora-auto-runner-worker.mjs\0--\0${supervisorRunId}\0`,
  }), [4321]);
  assert.deepEqual(matchAuthorizedSupervisorProcess({
    ...options,
    parentCmdline: `node\0/workspace/repos/Other/tools/auto-runner/supervisor/settleora-auto-runner-worker.mjs\0${supervisorRunId}\0`,
  }), []);
  assert.deepEqual(matchAuthorizedSupervisorProcess({
    ...options,
    parentCmdline: `node\0${expectedLauncher}\0--runtime-root\0${sourceRoot}\0--entry\0settleora-auto-runner.mjs\0--\0${supervisorRunId}\0`,
  }), []);
});

test("copied runtime remains authoritative after managed branch and source changes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-separation-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "Settleora");
    const runtimeParent = path.join(root, "installed");
    mkdirSync(logs, { mode: 0o700 });
    mkdirSync(runtimeParent, { mode: 0o700 });
    const runtime = path.join(runtimeParent, "runtime");
    const deployed = deployRuntimeBundle({ sourceRoot, destination: runtime, repoRoot: repo, logsRoot: logs, sourceSha });
    assert.equal(verifyRuntimeBundle(runtime).bundleDigest, deployed.manifest.bundleDigest);
    assert.equal(existsSync(deployed.launcher), true);
    assert.equal(statSync(deployed.launcher).mode & 0o777, 0o500);
    const approval = path.join(runtimeParent, ".runtime.approved.json");
    assert.equal(statSync(approval).mode & 0o777, 0o400);
    const deploymentLock = acquireRuntimeDeploymentLock(runtime);
    const refused = spawnSync(process.execPath, [
      deployed.launcher,
      "--runtime-root",
      runtime,
      "--entry",
      "settleora-auto-runnerctl.mjs",
      "--",
      "list",
      "--config",
      "/workspace/auto-runner/config/settleora.json",
    ], { encoding: "utf8" });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /startup refused during deployment/);
    releaseRuntimeDeploymentLock(deploymentLock);
    const runtimeMode = statSync(runtime).mode & 0o777;
    chmodSync(runtime, 0o770);
    const writableRuntime = spawnSync(process.execPath, [
      deployed.launcher, "--runtime-root", runtime, "--entry", "settleora-auto-runnerctl.mjs", "--", "list",
      "--config", "/workspace/auto-runner/config/settleora.json",
    ], { encoding: "utf8" });
    assert.notEqual(writableRuntime.status, 0);
    assert.match(writableRuntime.stderr, /runtime bundle root must not be group\/world writable/);
    chmodSync(runtime, runtimeMode);
    const launcherSource = readFileSync(deployed.launcher, "utf8");
    assert.ok(launcherSource.indexOf("await import(") < launcherSource.indexOf("process.argv = [process.execPath, target"));
    const launcherMain = launcherSource.slice(launcherSource.indexOf("export async function main"));
    assert.ok(launcherMain.indexOf("writeFileSync(marker") < launcherMain.indexOf("verifyApprovedRuntime(runtimeRoot"));
    const tampered = path.join(runtime, "lib/runtime-identity.mjs");
    const originalBytes = readFileSync(tampered);
    chmodSync(tampered, 0o600);
    writeFileSync(tampered, `${originalBytes}\n`);
    const drifted = spawnSync(process.execPath, [
      deployed.launcher, "--runtime-root", runtime, "--entry", "settleora-auto-runnerctl.mjs", "--", "list",
      "--config", "/workspace/auto-runner/config/settleora.json",
    ], { encoding: "utf8" });
    assert.notEqual(drifted.status, 0);
    assert.match(drifted.stderr, /bundle file verification failed/);
    writeFileSync(tampered, originalBytes);
    chmodSync(tampered, 0o400);
    const entry = absoluteRuntimeEntry(runtime, "settleora-auto-runner.mjs");
    assert.equal(entry.startsWith(`${runtime}${path.sep}`), true);
    git(repo, ["switch", "-c", "feature/change-controller"]);
    writeFileSync(path.join(repo, "tools/auto-runner/settleora-auto-runner.mjs"), "throw new Error('changed managed controller executed');\n");
    assert.equal(absoluteRuntimeEntry(runtime, "settleora-auto-runner.mjs"), entry);
    assert.equal(readFileSync(entry, "utf8").includes("changed managed controller"), false);
    const otherCwd = path.join(root, "unrelated");
    mkdirSync(otherCwd);
    const admittedConfig = {
      runtimeMode: "external",
      runtimeRoot: runtime,
      repoRoot: repo,
      logsRoot: logs,
      projectId: "Settleora",
      repositorySlug: "tommytang213/Settleora",
    };
    const identity = validateProjectRuntimeIdentity(admittedConfig, { actualRuntimeRoot: runtime });
    admittedConfig.runtimeIdentity = identity;
    assert.equal(identity.repoRoot, repo);
    assert.equal(identity.runtimeRoot, runtime);
    assert.equal(identity.pushUrl, "git@github.com:tommytang213/Settleora.git");
    git(repo, ["remote", "set-url", "origin", "git@github.com:other/Settleora.git"]);
    assert.throws(() => assertRepositoryRemoteIdentity(admittedConfig), /repositorySlug|changed after runtime admission/);
    assert.throws(() => fetchOriginMain(admittedConfig), /repositorySlug|changed after runtime admission/);
    git(repo, ["remote", "set-url", "origin", "git@github.com:tommytang213/Settleora.git"]);
    git(repo, ["config", "remote.origin.pushurl", "file:///tmp/tommytang213/Settleora.git"]);
    assert.throws(() => validateProjectRuntimeIdentity({
      runtimeMode: "external",
      runtimeRoot: runtime,
      repoRoot: repo,
      logsRoot: logs,
      projectId: "Settleora",
      repositorySlug: "tommytang213/Settleora",
    }, { actualRuntimeRoot: runtime }), /push URL/);
    git(repo, ["config", "--unset", "remote.origin.pushurl"]);
    git(repo, ["config", "--add", "remote.origin.pushurl", "git@github.com:tommytang213/Settleora.git"]);
    git(repo, ["config", "--add", "remote.origin.pushurl", "git@github.com:other/Settleora.git"]);
    assert.throws(() => validateProjectRuntimeIdentity({
      runtimeMode: "external", runtimeRoot: runtime, repoRoot: repo, logsRoot: logs,
      projectId: "Settleora", repositorySlug: "tommytang213/Settleora",
    }, { actualRuntimeRoot: runtime }), /push URL/);
    git(repo, ["config", "--unset-all", "remote.origin.pushurl"]);
    git(repo, ["remote", "set-url", "origin", "ssh://git@attacker.example/tommytang213/Settleora.git"]);
    git(repo, ["config", "remote.origin.pushurl", "git@github.com:tommytang213/Settleora.git"]);
    assert.throws(() => validateProjectRuntimeIdentity({
      runtimeMode: "external", runtimeRoot: runtime, repoRoot: repo, logsRoot: logs,
      projectId: "Settleora", repositorySlug: "tommytang213/Settleora",
    }, { actualRuntimeRoot: runtime }), /origin/);
    git(repo, ["remote", "set-url", "origin", "git@github.com:tommytang213/Settleora.git"]);
    git(repo, ["config", "--unset-all", "remote.origin.pushurl"]);
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
    chmodSync(path.join(runtime, "lib/runtime-identity.mjs"), 0o600);
    writeFileSync(path.join(runtime, "lib/runtime-identity.mjs"), "\n// drift\n", { flag: "a" });
    assert.throws(() => verifyRuntimeBundle(runtime), /drift/);
    assert.throws(() => verifyRuntimeBundle(runtime, "0".repeat(64)), /drift|mismatch/);
    assert.throws(() => absoluteRuntimeEntry(runtime, "missing.mjs"), /missing/);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("trusted external identity rejects writable runtime and deployment-control directories", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-permissions-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "Settleora");
    const runtimeParent = path.join(root, "install");
    mkdirSync(logs, { mode: 0o700 });
    mkdirSync(runtimeParent, { mode: 0o700 });
    const runtime = path.join(runtimeParent, "runtime");
    deployRuntimeBundle({ sourceRoot, destination: runtime, repoRoot: repo, logsRoot: logs, sourceSha });
    const config = {
      runtimeMode: "external",
      runtimeRoot: runtime,
      repoRoot: repo,
      logsRoot: logs,
      projectId: "Settleora",
      repositorySlug: "tommytang213/Settleora",
    };
    chmodSync(runtime, 0o777);
    assert.throws(() => validateProjectRuntimeIdentity(config, { actualRuntimeRoot: runtime }), /runtimeRoot must not be group\/world writable/);
    chmodSync(runtime, 0o755);
    chmodSync(runtimeParent, 0o777);
    assert.throws(() => validateProjectRuntimeIdentity(config, { actualRuntimeRoot: runtime }), /deployment-control parent must not be group\/world writable/);
  } finally {
    rmSync(root, { recursive: true, force: true });
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
    assert.equal(
      repositoryAuthorityLockPath(repoA, authority, "tommytang213/Settleora"),
      repositoryAuthorityLockPath(repoB, authority, "tommytang213/Settleora"),
    );
    git(repoA, ["remote", "set-url", "origin", "git@github.com:TommyTang213/SETTLEORA.git"]);
    git(repoB, ["remote", "set-url", "origin", "git@github.com:tommytang213/settleora.git"]);
    assert.equal(
      repositoryAuthorityLockPath(repoA, authority, "TommyTang213/SETTLEORA"),
      repositoryAuthorityLockPath(repoB, authority, "tommytang213/settleora"),
    );
    assert.equal(
      repositoryAuthorityLockPath(repoA, authority, "tommytang213/settleora"),
      repositoryAuthorityLockPath(repoB, authority, "TommyTang213/SETTLEORA"),
    );
    const linked = path.join(root, "repo-a-linked");
    git(repoA, ["worktree", "add", "--detach", linked]);
    assert.equal(repositoryAuthorityLockPath(realpathSync(linked), authority), a1);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("project logs namespace marker refuses state adoption by another repository", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-project-marker-"));
  try {
    const repoA = createRepo(root, "repo-a");
    const repoB = createRepo(root, "repo-b");
    const logsRoot = path.join(root, "Settleora");
    mkdirSync(logsRoot, { mode: 0o700 });
    const identityFor = (repoRoot) => validateProjectRuntimeIdentity({
      runtimeMode: "development",
      runtimeRoot: sourceRoot,
      repoRoot,
      logsRoot,
      projectId: "Settleora",
      repositorySlug: "tommytang213/Settleora",
    }, { actualRuntimeRoot: sourceRoot, trusted: false });
    const configA = { projectId: "Settleora", repositorySlug: "tommytang213/Settleora", logsRoot, runtimeIdentity: identityFor(repoA) };
    assert.equal(verifyProjectNamespaceMarker(configA, { create: true }).namespace, configA.runtimeIdentity.namespace);
    assert.deepEqual(verifyProjectNamespaceMarker(configA), verifyProjectNamespaceMarker(configA));
    const configB = { ...configA, runtimeIdentity: identityFor(repoB) };
    assert.throws(() => verifyProjectNamespaceMarker(configB), /does not match repository identity/);
    const caseLogsRoot = path.join(root, "CaseSettleora");
    mkdirSync(caseLogsRoot, { mode: 0o700 });
    const upperIdentity = validateProjectRuntimeIdentity({
      runtimeMode: "development", runtimeRoot: sourceRoot, repoRoot: repoA, logsRoot: caseLogsRoot,
      projectId: "CaseSettleora", repositorySlug: "TommyTang213/SETTLEORA",
    }, { actualRuntimeRoot: sourceRoot, trusted: false });
    const upperConfig = {
      projectId: "CaseSettleora", repositorySlug: "TommyTang213/SETTLEORA",
      logsRoot: caseLogsRoot, runtimeIdentity: upperIdentity,
    };
    verifyProjectNamespaceMarker(upperConfig, { create: true });
    assert.equal(
      verifyProjectNamespaceMarker({ ...upperConfig, repositorySlug: "tommytang213/settleora" }).repositorySlug,
      "tommytang213/settleora",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository namespace casing is stable and external profile ancestors must be owner-controlled", () => {
  const root = mkdtempSync(path.join(os.homedir(), ".settleora-external-profile-"));
  try {
    const repo = createRepo(root, "repo");
    const runtime = path.join(root, "runtime");
    const logs = path.join(root, "Settleora");
    const configRoot = path.join(root, "config");
    mkdirSync(runtime, { mode: 0o700 });
    mkdirSync(logs, { mode: 0o700 });
    mkdirSync(configRoot, { mode: 0o700 });
    const identity = (repositorySlug) => validateProjectRuntimeIdentity({
      runtimeMode: "development", runtimeRoot: runtime, repoRoot: repo, logsRoot: logs,
      projectId: "Settleora", repositorySlug,
    }, { actualRuntimeRoot: runtime, trusted: false });
    assert.equal(identity("TommyTang213/SETTLEORA").namespace, identity("tommytang213/settleora").namespace);
    const configPath = path.join(configRoot, "settleora.json");
    writeFileSync(configPath, "{}\n", { mode: 0o600 });
    assert.equal(validateExternalProfilePath(configPath, configRoot), configRoot);
    chmodSync(configRoot, 0o777);
    assert.throws(() => validateExternalProfilePath(configPath, configRoot), /ancestor_unsafe/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("trusted identity separates external Git common directories from runtime and logs", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-git-common-separation-"));
  try {
    const runtime = path.join(root, "runtime");
    const repo = path.join(root, "repo");
    const logs = path.join(root, "Settleora");
    const gitCommon = path.join(runtime, "managed-git");
    mkdirSync(runtime, { mode: 0o700 });
    mkdirSync(logs, { mode: 0o700 });
    execFileSync("git", ["init", "-b", "main", "--separate-git-dir", gitCommon, repo]);
    git(repo, ["config", "user.email", "runner@example.invalid"]);
    git(repo, ["config", "user.name", "Runner Test"]);
    git(repo, ["remote", "add", "origin", "git@github.com:tommytang213/Settleora.git"]);
    writeFileSync(path.join(repo, "README.md"), "fixture\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "fixture"]);
    assert.throws(() => validateProjectRuntimeIdentity({
      runtimeMode: "external", runtimeRoot: runtime, repoRoot: realpathSync(repo), logsRoot: logs,
      projectId: "Settleora", repositorySlug: "tommytang213/Settleora",
    }, { actualRuntimeRoot: runtime }), /repository common directory and runtimeRoot must be separate/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("operational logs children refuse symlink escapes and unsafe permissions", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-project-children-"));
  try {
    const logsRoot = path.join(root, "Settleora");
    const outside = path.join(root, "outside");
    mkdirSync(logsRoot, { mode: 0o700 });
    mkdirSync(outside, { mode: 0o700 });
    const state = path.join(logsRoot, "state");
    symlinkSync(outside, state);
    assert.throws(() => ensureOperationalDirectory(state, logsRoot), /unsafe/);
    assert.match(readFileSync(path.join(sourceRoot, "lib/config.mjs"), "utf8"), /path\.join\(config\.logsRoot, "run-logs"\)/);
    rmSync(state);
    mkdirSync(state, { mode: 0o777 });
    chmodSync(state, 0o777);
    assert.throws(() => ensureOperationalDirectory(state, logsRoot), /unsafe/);
  } finally {
    rmSync(root, { recursive: true, force: true });
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

test("deployment lock refuses an active owner and reclaims a proven stale owner", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-deploy-lock-"));
  try {
    const destination = path.join(root, "runtime");
    const active = acquireRuntimeDeploymentLock(destination);
    assert.throws(() => acquireRuntimeDeploymentLock(destination), /already active/);
    releaseRuntimeDeploymentLock(active);
    const lock = path.join(root, ".runtime.deployment.lock");
    writeFileSync(lock, `${JSON.stringify({ pid: 999999999, processBirthId: "1" })}\n`, { mode: 0o600 });
    const reclaimed = acquireRuntimeDeploymentLock(destination);
    assert.equal(reclaimed, lock);
    releaseRuntimeDeploymentLock(reclaimed);
    const acquisitionGuard = path.join(root, ".runtime.deployment-acquire.lock");
    assert.equal(existsSync(acquisitionGuard), true);
    const reacquired = acquireRuntimeDeploymentLock(destination);
    releaseRuntimeDeploymentLock(reacquired);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deployment dry-run is inert and active/pending/old-digest guards refuse", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-deploy-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "logs");
    const parent = path.join(root, "installed");
    mkdirSync(logs, { mode: 0o700 });
    mkdirSync(parent, { mode: 0o700 });
    const destination = path.join(parent, "runtime");
    assert.throws(() => deployRuntimeBundle({
      sourceRoot, destination: path.join(parent, "candidate"), repoRoot: repo, logsRoot: logs, sourceSha,
    }), /basename/);
    const consumers = path.join(parent, ".runtime.consumers");
    mkdirSync(consumers, { mode: 0o700 });
    const staleMarker = path.join(consumers, `${process.pid}.lock`);
    writeFileSync(staleMarker, `${JSON.stringify({ pid: process.pid, processBirthId: "0" })}\n`, { mode: 0o600 });
    const deploymentLock = acquireRuntimeDeploymentLock(destination);
    assert.equal(existsSync(consumers), true);
    assert.equal(existsSync(staleMarker), false);
    assert.equal(statSync(consumers).mode & 0o777, 0o700);
    releaseRuntimeDeploymentLock(deploymentLock);
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

test("deployment atomically upgrades an authenticated stable launcher", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-launcher-upgrade-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "logs");
    const parent = path.join(root, "installed");
    const oldSource = path.join(root, "old-source");
    mkdirSync(logs, { mode: 0o700 });
    mkdirSync(parent, { mode: 0o700 });
    cpSync(sourceRoot, oldSource, { recursive: true });
    writeFileSync(
      path.join(oldSource, "runtime-launcher.mjs"),
      `${readFileSync(path.join(oldSource, "runtime-launcher.mjs"), "utf8")}\n// authenticated prior launcher\n`,
    );
    const destination = path.join(parent, "runtime");
    const installed = deployRuntimeBundle({
      sourceRoot: oldSource,
      destination,
      repoRoot: repo,
      logsRoot: logs,
      sourceSha: "a".repeat(40),
    });
    const launcher = path.join(parent, ".runtime.launcher.mjs");
    const oldLauncherDigest = createHash("sha256").update(readFileSync(launcher)).digest("hex");
    const upgraded = deployRuntimeBundle({
      sourceRoot,
      destination,
      repoRoot: repo,
      logsRoot: logs,
      sourceSha,
      expectedOldDigest: installed.manifest.bundleDigest,
    });
    assert.notEqual(createHash("sha256").update(readFileSync(launcher)).digest("hex"), oldLauncherDigest);
    assert.equal(
      createHash("sha256").update(readFileSync(launcher)).digest("hex"),
      createHash("sha256").update(readFileSync(path.join(destination, "runtime-launcher.mjs"))).digest("hex"),
    );
    assert.equal(verifyRuntimeBundle(destination).bundleDigest, upgraded.manifest.bundleDigest);
    assert.equal(existsSync(path.join(parent, ".runtime.launcher.incoming")), false);
    const rolledBack = rollbackRuntimeBundle({
      destination,
      expectedCurrentDigest: upgraded.manifest.bundleDigest,
      expectedRollbackDigest: installed.manifest.bundleDigest,
    });
    assert.equal(rolledBack.manifest.bundleDigest, installed.manifest.bundleDigest);
    assert.equal(createHash("sha256").update(readFileSync(launcher)).digest("hex"), oldLauncherDigest);
    assert.equal(
      createHash("sha256").update(readFileSync(launcher)).digest("hex"),
      createHash("sha256").update(readFileSync(path.join(destination, "runtime-launcher.mjs"))).digest("hex"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
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

test("quiescence drift after launcher preparation leaves installed and rollback runtimes unchanged", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-final-boundary-"));
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
    const rollback = path.join(parent, ".runtime.rollback");
    let inspections = 0;
    assert.throws(() => deployRuntimeBundle({
      sourceRoot: changedSource,
      destination,
      repoRoot: repo,
      logsRoot: logs,
      sourceSha: "b".repeat(40),
      expectedOldDigest: first.manifest.bundleDigest,
      finalQuiescenceVerifier: () => {
        inspections += 1;
        if (inspections === 2) throw new Error("fixture drift after launcher preparation");
        return {
          active: false,
          unresolvedExternalEffects: false,
          preservedRecoveryAdmitted: false,
          reasonCode: "default_quiescent",
        };
      },
    }), /fixture drift after launcher preparation/);
    assert.equal(inspections, 2);
    assert.equal(verifyRuntimeBundle(destination).bundleDigest, first.manifest.bundleDigest);
    assert.equal(existsSync(rollback), false);
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
    assert.throws(() => deployRuntimeBundle({
      sourceRoot: changedSource,
      destination,
      repoRoot: repo,
      logsRoot: logs,
      sourceSha: "b".repeat(40),
      expectedOldDigest: first.manifest.bundleDigest,
      finalQuiescenceVerifier: () => { throw new Error("fixture quiescence drift"); },
    }), /fixture quiescence drift/);
    assert.equal(existsSync(destination), false);
    assert.equal(existsSync(path.join(parent, ".runtime.deploy-incoming")), true);
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

test("deployment adopts a crash after retaining the prior rollback", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-runtime-retained-rollback-"));
  try {
    const repo = createRepo(root, "project");
    const logs = path.join(root, "logs");
    const parent = path.join(root, "install");
    mkdirSync(logs);
    mkdirSync(parent);
    const destination = path.join(parent, "runtime");
    const first = deployRuntimeBundle({ sourceRoot, destination, repoRoot: repo, logsRoot: logs, sourceSha });
    const secondSource = path.join(root, "second");
    cpSync(sourceRoot, secondSource, { recursive: true });
    writeFileSync(path.join(secondSource, "lib/runtime-identity.mjs"), `${readFileSync(path.join(secondSource, "lib/runtime-identity.mjs"), "utf8")}\n`);
    const second = deployRuntimeBundle({ sourceRoot: secondSource, destination, repoRoot: repo, logsRoot: logs, sourceSha: "b".repeat(40), expectedOldDigest: first.manifest.bundleDigest });
    const retired = path.join(parent, ".runtime.rollback-retired");
    renameSync(path.join(parent, ".runtime.rollback"), retired);
    assert.equal(verifyRuntimeBundle(retired).bundleDigest, first.manifest.bundleDigest);
    const thirdSource = path.join(root, "third");
    cpSync(secondSource, thirdSource, { recursive: true });
    writeFileSync(path.join(thirdSource, "lib/runtime-identity.mjs"), `${readFileSync(path.join(thirdSource, "lib/runtime-identity.mjs"), "utf8")}\n`);
    const third = deployRuntimeBundle({ sourceRoot: thirdSource, destination, repoRoot: repo, logsRoot: logs, sourceSha: "c".repeat(40), expectedOldDigest: second.manifest.bundleDigest });
    assert.equal(verifyRuntimeBundle(destination).bundleDigest, third.manifest.bundleDigest);
    assert.equal(verifyRuntimeBundle(path.join(parent, ".runtime.rollback")).bundleDigest, second.manifest.bundleDigest);
    assert.equal(existsSync(retired), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
