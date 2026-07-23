import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireOneLock, processBirthId, releaseRunnerLock } from "../lib/state-store.mjs";

function metadata() {
  return {
    projectId: "Settleora",
    repositorySlug: "tommytang213/Settleora",
    repoRoot: "/workspace/repos/Settleora",
    stateNamespace: "fixture",
  };
}

const authorityLockName = `${"a".repeat(64)}.lock`;

function childAcquire(lock, holdMs) {
  const stateStore = new URL("../lib/state-store.mjs", import.meta.url).href;
  const source = `import { acquireOneLock } from ${JSON.stringify(stateStore)};
acquireOneLock(${JSON.stringify(lock)}, ${JSON.stringify(metadata())}, { repositoryAuthority: true });
setTimeout(() => {}, ${holdMs});`;
  return spawn(process.execPath, ["--input-type=module", "--eval", source], { stdio: ["ignore", "pipe", "pipe"] });
}

function finished(child) {
  return new Promise((resolve) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (status) => resolve({ status, stderr }));
  });
}

test("repository authority lock acquires and releases with PID birth identity", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-authority-lock-"));
  const lock = path.join(root, authorityLockName);
  try {
    acquireOneLock(lock, metadata(), { repositoryAuthority: true });
    const parsed = JSON.parse(readFileSync(lock, "utf8"));
    assert.equal(parsed.pid, process.pid);
    assert.equal(parsed.processBirthId, processBirthId());
    assert.equal(lstatSync(lock).mode & 0o777, 0o600);
    releaseRunnerLock(lock);
    assert.equal(existsSync(lock), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("caller metadata cannot override local lock owner identity", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-local-lock-owner-"));
  const lock = path.join(root, "project.lock");
  try {
    acquireOneLock(lock, { ...metadata(), pid: 2, processBirthId: "0", startedAt: "untrusted" });
    const parsed = JSON.parse(readFileSync(lock, "utf8"));
    assert.equal(parsed.pid, process.pid);
    assert.equal(parsed.processBirthId, processBirthId());
    assert.notEqual(parsed.startedAt, "untrusted");
  } finally {
    releaseRunnerLock(lock);
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository authority lock refuses a live owner and reclaims dead or PID-reused owners", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-authority-stale-"));
  const lock = path.join(root, authorityLockName);
  try {
    acquireOneLock(lock, metadata(), { repositoryAuthority: true });
    assert.throws(() => acquireOneLock(lock, metadata(), { repositoryAuthority: true }), /active pid/);
    releaseRunnerLock(lock);
    writeFileSync(lock, `${JSON.stringify({ pid: 999999999, processBirthId: "1" })}\n`, { mode: 0o600 });
    acquireOneLock(lock, metadata(), { repositoryAuthority: true });
    releaseRunnerLock(lock);
    writeFileSync(lock, `${JSON.stringify({ pid: process.pid, processBirthId: "0" })}\n`, { mode: 0o600 });
    acquireOneLock(lock, metadata(), { repositoryAuthority: true });
    assert.equal(JSON.parse(readFileSync(lock, "utf8")).processBirthId, processBirthId());
  } finally {
    releaseRunnerLock(lock);
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository authority lock fails closed for corrupt, partial, symlinked, or writable state", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-authority-unsafe-"));
  const lock = path.join(root, authorityLockName);
  try {
    for (const value of ["{", "{}", `${JSON.stringify({ pid: 1, processBirthId: "x" })}\n`]) {
      writeFileSync(lock, value, { mode: 0o600 });
      assert.throws(() => acquireOneLock(lock, metadata(), { repositoryAuthority: true }), /corrupt|identity/);
      rmSync(lock);
    }
    writeFileSync(lock, `${JSON.stringify({ pid: 999999999, processBirthId: "1" })}\n`, { mode: 0o600 });
    chmodSync(lock, 0o666);
    assert.throws(() => acquireOneLock(lock, metadata(), { repositoryAuthority: true }), /unsafe/);
    rmSync(lock);
    const outside = path.join(root, "outside");
    writeFileSync(outside, "{}\n", { mode: 0o600 });
    symlinkSync(outside, lock);
    assert.throws(() => acquireOneLock(lock, metadata(), { repositoryAuthority: true }), /unsafe/);
    rmSync(lock);
    assert.throws(
      () => acquireOneLock(path.join(root, "..", authorityLockName), metadata(), { repositoryAuthority: true }),
      /invalid/,
    );
    assert.throws(
      () => acquireOneLock(path.join(root, "repository.lock"), metadata(), { repositoryAuthority: true }),
      /name is invalid/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two stale-lock contenders serialize and only one live owner is admitted", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-authority-race-"));
  const lock = path.join(root, authorityLockName);
  try {
    writeFileSync(lock, `${JSON.stringify({ pid: 999999999, processBirthId: "1" })}\n`, { mode: 0o600 });
    const first = childAcquire(lock, 400);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = childAcquire(lock, 0);
    const [a, b] = await Promise.all([finished(first), finished(second)]);
    assert.deepEqual([a.status, b.status].sort(), [0, 1]);
    assert.match(`${a.stderr}${b.stderr}`, /active pid/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
