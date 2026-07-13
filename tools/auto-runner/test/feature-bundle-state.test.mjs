import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  bundleStatePath,
  createInitialBundleState,
  loadBundleState,
  markBundleSliceCompleted,
  markBundleSliceStarted,
  markBundleStopped,
  recoverBundleState,
  summarizeBundleState,
  writeBundleState,
} from "../lib/feature-bundle-state.mjs";

function tempConfig() {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-bundle-state-"));
  return {
    logsRoot,
    cleanup: () => rmSync(logsRoot, { recursive: true, force: true }),
  };
}

function plan(overrides = {}) {
  return {
    id: "issue-890-bundle-v1",
    bundleVersion: 1,
    strategy: "feature-bundle",
    planDigest: "a".repeat(64),
    issue: { number: 890, title: "Bundle", url: "https://example.invalid/890" },
    slices: [
      { id: "slice-one", sequence: 1, title: "One" },
      { id: "slice-two", sequence: 2, title: "Two" },
      { id: "slice-three", sequence: 3, title: "Three" },
    ],
    ...overrides,
  };
}

test("bundle state writes atomically, sanitizes, and reloads completed evidence", () => {
  const config = tempConfig();
  try {
    const p = plan();
    const initial = createInitialBundleState({
      plan: p,
      runId: "run-2026-07-13T061700Z",
      branchName: "tools/bundle",
      baseSha: "b".repeat(40),
      currentHeadSha: "b".repeat(40),
      taskKey: "20260713-1416",
    });
    const started = markBundleSliceStarted(initial, {
      sliceId: "slice-one",
      promptPath: "/workspace/logs/settleora-auto-runner/tasks/prompt.md",
      reportPath: "/workspace/repos/Settleora/.codex/reports/report.md",
      currentHeadSha: "b".repeat(40),
    });
    const completed = markBundleSliceCompleted(started, {
      sliceId: "slice-one",
      validation: { passed: true, results: [{ command: "node --test", stdout: "GEMINI_API_KEY=secret" }] },
      commitSha: "c".repeat(40),
      currentHeadSha: "c".repeat(40),
    });
    const write = writeBundleState(config, completed);
    assert.equal(existsSync(write.statePath), true);
    assert.equal(readFileSync(write.statePath, "utf8").includes("GEMINI_API_KEY=secret"), false);
    assert.equal(loadBundleState(config, p).ok, true);
  } finally {
    config.cleanup();
  }
});

test("bundle recovery resumes after completed checkpoint without rerunning it", () => {
  const config = tempConfig();
  try {
    const p = plan();
    const state = markBundleSliceCompleted(
      createInitialBundleState({
        plan: p,
        runId: "run",
        branchName: "tools/bundle",
        baseSha: "b".repeat(40),
        currentHeadSha: "b".repeat(40),
        taskKey: "20260713-1416",
      }),
      {
        sliceId: "slice-one",
        validation: { passed: true },
        commitSha: "c".repeat(40),
        reportPath: "/workspace/repos/Settleora/.codex/reports/slice-one.md",
        currentHeadSha: "c".repeat(40),
      },
    );
    writeBundleState(config, state);
    const recovery = recoverBundleState(config, {
      plan: p,
      branchName: "tools/bundle",
      baseSha: "b".repeat(40),
      currentHeadSha: "c".repeat(40),
      worktreeClean: true,
      evidence: {
        commitExists: (sha) => sha === "c".repeat(40),
        reportExists: (reportPath) => reportPath.endsWith("slice-one.md"),
      },
    });
    assert.equal(recovery.ok, true);
    assert.equal(recovery.nextSliceId, "slice-two");
    assert.deepEqual(recovery.completedSliceIds, ["slice-one"]);
    assert.equal(summarizeBundleState(recovery.state).currentSliceId, "slice-two");
  } finally {
    config.cleanup();
  }
});

test("bundle recovery fails closed on corrupt partial state", () => {
  const config = tempConfig();
  try {
    const p = plan();
    const statePath = bundleStatePath(config, p);
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(statePath, "{not json");
    const result = loadBundleState(config, p);
    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, "bundle_state_corrupt");
  } finally {
    config.cleanup();
  }
});

test("bundle recovery fails closed on plan, base, branch, head, report, and commit drift", () => {
  const config = tempConfig();
  try {
    const p = plan();
    const state = markBundleSliceCompleted(
      createInitialBundleState({
        plan: p,
        runId: "run",
        branchName: "tools/bundle",
        baseSha: "b".repeat(40),
        currentHeadSha: "b".repeat(40),
        taskKey: "20260713-1416",
      }),
      {
        sliceId: "slice-one",
        validation: { passed: true },
        commitSha: "c".repeat(40),
        reportPath: "/workspace/repos/Settleora/.codex/reports/slice-one.md",
        currentHeadSha: "c".repeat(40),
      },
    );
    writeBundleState(config, state);
    const statePath = bundleStatePath(config, p);
    writeFileSync(statePath, readFileSync(statePath, "utf8").replace(`"planDigest": "${"a".repeat(64)}"`, `"planDigest": "${"d".repeat(64)}"`));
    const base = {
      plan: p,
      branchName: "tools/bundle",
      baseSha: "b".repeat(40),
      currentHeadSha: "c".repeat(40),
      worktreeClean: true,
      evidence: { commitExists: () => true, reportExists: () => true },
    };
    assert.equal(recoverBundleState(config, base).reasonCode, "bundle_state_plan_digest_mismatch");
    writeBundleState(config, state);
    assert.equal(recoverBundleState(config, { ...base, branchName: "other" }).reasonCode, "bundle_state_branch_mismatch");
    assert.equal(recoverBundleState(config, { ...base, baseSha: "e".repeat(40) }).reasonCode, "bundle_state_base_mismatch");
    assert.equal(recoverBundleState(config, { ...base, currentHeadSha: "f".repeat(40) }).reasonCode, "bundle_state_head_mismatch");
    assert.equal(
      recoverBundleState(config, { ...base, evidence: { commitExists: () => false, reportExists: () => true } }).reasonCode,
      "bundle_state_completed_commit_drift",
    );
    assert.equal(
      recoverBundleState(config, { ...base, evidence: { commitExists: () => true, reportExists: () => false } }).reasonCode,
      "bundle_state_completed_report_missing",
    );
  } finally {
    config.cleanup();
  }
});

test("bundle state records bounded stop reasons and refuses completed reruns", () => {
  const initial = createInitialBundleState({
    plan: plan(),
    runId: "run",
    branchName: "tools/bundle",
    baseSha: "b".repeat(40),
    currentHeadSha: "b".repeat(40),
    taskKey: "20260713-1416",
  });
  const completed = markBundleSliceCompleted(initial, {
    sliceId: "slice-one",
    validation: { passed: true },
    commitSha: "c".repeat(40),
    currentHeadSha: "c".repeat(40),
  });
  assert.throws(
    () => markBundleSliceStarted(completed, { sliceId: "slice-one", promptPath: "p", reportPath: "r" }),
    /Refusing to restart completed/,
  );
  const stopped = markBundleStopped(initial, { sliceId: "slice-two", reasonCode: "validation_failed", reason: "x".repeat(1000) });
  assert.equal(stopped.slices["slice-two"].state, "failed");
  assert.equal(stopped.slices["slice-two"].stopReason.reason.length, 500);
});
