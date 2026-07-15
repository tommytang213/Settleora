import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  advanceRecoveryPhase,
  bindRecoveryEvidence,
  createInitialRecoveryState,
  invalidateEvidenceForHeadChange,
  recordIdempotentMutation,
  writeRecoveryState,
} from "../lib/recovery-state.mjs";
import {
  discoverStartupRecovery,
  discoverTargetedStartupRecovery,
  executeStartupContinuation,
  evaluateCompletionHygieneResume,
  evaluateControlAtRecoveryBoundary,
  firstIncompleteContinuationAction,
  nextBundleSliceFromCheckpoint,
  planIdempotentGithubMutation,
  recoveryStatusSummary,
  shouldSkipCompletedBundleSlice,
} from "../lib/recovery-continuation.mjs";

function tempConfig(extra = {}) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-recovery-continuation-"));
  return {
    logsRoot,
    allowExistingPrRecovery: false,
    cleanup: () => rmSync(logsRoot, { recursive: true, force: true }),
    ...extra,
  };
}

function state(overrides = {}) {
  return createInitialRecoveryState({
    taskKey: "20260713-1927",
    issue: { number: 893, title: "Recovery", url: "https://example.invalid/893" },
    runId: "run-2026-07-13T112700Z",
    supervisorRunId: "supervised-20260713T112700Z-abcdefabcdef",
    branchName: "tools/auto-runner-recovery-continuation-893-20260713-1927",
    baseSha: "b".repeat(40),
    currentHeadSha: "c".repeat(40),
    ...overrides,
  });
}

function recoveryWithPr(overrides = {}) {
  return state({
    pr: {
      number: 917,
      url: "https://example.invalid/pull/917",
      headSha: "c".repeat(40),
      headRefName: "tools/auto-runner-recovery-continuation-893-20260713-1927",
      baseRefName: "main",
      state: "OPEN",
    },
    outageResubmission: outageBinding(),
    ...overrides,
  });
}

function unrelatedRecovery(overrides = {}) {
  return recoveryWithPr({
    taskKey: "20260713-1930",
    issue: { number: 891, title: "Other recovery", url: "https://example.invalid/891" },
    runId: "run-2026-07-13T113000Z",
    supervisorRunId: "supervised-20260713T113000Z-fedcbafedcba",
    branchName: "feature/auto-891-other",
    baseSha: "a".repeat(40),
    currentHeadSha: "d".repeat(40),
    pr: {
      number: 918,
      url: "https://example.invalid/pull/918",
      headSha: "d".repeat(40),
      headRefName: "feature/auto-891-other",
      baseRefName: "main",
      state: "OPEN",
    },
    ...overrides,
  });
}

function targetFor(recoveryState) {
  return {
    taskKey: recoveryState.taskKey,
    issueNumber: recoveryState.issue.number,
    branchName: recoveryState.branch.name,
    baseSha: recoveryState.branch.baseSha,
    currentHeadSha: recoveryState.branch.currentHeadSha,
    prNumber: recoveryState.pr.number,
    prHeadSha: recoveryState.pr.headSha,
    runnerRunId: recoveryState.run.runId,
    supervisorRunId: recoveryState.run.supervisorRunId,
    originalSupervisorSpecDigest: recoveryState.outageResubmission?.originalSupervisorSpecDigest,
    markerKey: recoveryState.outageResubmission?.markerKey,
    outageFingerprint: recoveryState.outageResubmission?.outageFingerprint,
    attemptNumber: recoveryState.outageResubmission?.attemptNumber,
  };
}

function outageBinding(overrides = {}) {
  return {
    originalSupervisorSpecDigest: "d".repeat(64),
    markerKey: "e".repeat(64),
    outageFingerprint: "f".repeat(64),
    attemptNumber: 1,
    ...overrides,
  };
}

async function runStartupContinuation(config, recoveryState, handlers) {
  writeRecoveryState(config, recoveryState);
  const discovery = discoverStartupRecovery(config);
  assert.equal(discovery.allowed, true);
  return executeStartupContinuation(config, discovery, handlers);
}

test("startup resumes recoverable work before polling a new issue", () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    writeRecoveryState(config, state());
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.found, true);
    assert.equal(discovery.allowed, true);
    assert.equal(discovery.action, "resume_recoverable_work");
    assert.equal(discovery.state.issueNumber, 893);
  } finally {
    config.cleanup();
  }
});

test("targeted outage recovery resumes only the exact matching recovery state", () => {
  const recovery = recoveryWithPr();
  const config = tempConfig({
    allowExistingPrRecovery: true,
    outageRecoveryOnly: true,
    outageRecoveryTarget: targetFor(recovery),
  });
  try {
    writeRecoveryState(config, recovery);
    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.found, true);
    assert.equal(discovery.allowed, true);
    assert.equal(discovery.action, "resume_recoverable_work");
    assert.equal(discovery.state.issueNumber, 893);
  } finally {
    config.cleanup();
  }
});

test("targeted outage recovery selects one exact state and ignores unrelated states", async () => {
  const exact = recoveryWithPr();
  const unrelated = unrelatedRecovery();
  const config = tempConfig({
    allowExistingPrRecovery: true,
    outageRecoveryOnly: true,
    outageRecoveryTarget: targetFor(exact),
  });
  try {
    writeRecoveryState(config, unrelated);
    const unrelatedPath = writeRecoveryState(config, unrelated).statePath;
    const beforeUnrelated = readFileSync(unrelatedPath, "utf8");
    writeRecoveryState(config, exact);

    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.allowed, true);
    assert.equal(discovery.reasonCode, "outage_recovery_target_discovered");
    assert.equal(discovery.state.issueNumber, 893);
    assert.deepEqual(discovery.stateCounts, {
      totalRecoverableCount: 2,
      exactMatchingCount: 1,
      ignoredNonmatchingCount: 1,
    });
    assert.deepEqual(discovery.states.map((item) => item.issueNumber), [893]);

    let executed = false;
    const continued = await executeStartupContinuation(config, discovery, {
      default: async ({ state: loadedState }) => {
        executed = true;
        assert.equal(loadedState.issue.number, 893);
        return { ok: true, outcome: "targeted_exact_state_executed", reasonCode: "targeted_exact_state_executed" };
      },
    });
    assert.equal(executed, true);
    assert.equal(continued.outcome, "targeted_exact_state_executed");
    assert.equal(readFileSync(unrelatedPath, "utf8"), beforeUnrelated);
  } finally {
    config.cleanup();
  }
});

test("targeted outage recovery handles exact and near-match partitions without order dependence", () => {
  const exact = recoveryWithPr();
  const target = targetFor(exact);
  const nearMatches = [
    ["taskKey", recoveryWithPr({ taskKey: "20260713-1928" })],
    ["issueNumber", recoveryWithPr({ issue: { number: 894, title: "Near issue", url: "https://example.invalid/894" } })],
    ["branchName", recoveryWithPr({ branchName: "feature/auto-893-near" })],
    ["baseSha", recoveryWithPr({ baseSha: "1".repeat(40) })],
    ["currentHeadSha", recoveryWithPr({ currentHeadSha: "2".repeat(40), runId: "run-2026-07-13T113101Z" })],
    ["prNumber", recoveryWithPr({ runId: "run-2026-07-13T113102Z", pr: { ...exact.pr, number: 919 } })],
    ["prHeadSha", recoveryWithPr({ runId: "run-2026-07-13T113103Z", pr: { ...exact.pr, headSha: "3".repeat(40) } })],
    ["runnerRunId", recoveryWithPr({ runId: "run-2026-07-13T113001Z" })],
    [
      "supervisorRunId",
      recoveryWithPr({
        runId: "run-2026-07-13T113105Z",
        supervisorRunId: "supervised-20260713T113001Z-abcdefabcdef",
      }),
    ],
    ["originalSupervisorSpecDigest", recoveryWithPr({ runId: "run-2026-07-13T113106Z", outageResubmission: outageBinding({ originalSupervisorSpecDigest: "1".repeat(64) }) })],
    ["markerKey", recoveryWithPr({ runId: "run-2026-07-13T113107Z", outageResubmission: outageBinding({ markerKey: "2".repeat(64) }) })],
    ["outageFingerprint", recoveryWithPr({ runId: "run-2026-07-13T113108Z", outageResubmission: outageBinding({ outageFingerprint: "3".repeat(64) }) })],
    ["attemptNumber", recoveryWithPr({ runId: "run-2026-07-13T113109Z", outageResubmission: outageBinding({ attemptNumber: 2 }) })],
    ["missingMarkerBinding", recoveryWithPr({ runId: "run-2026-07-13T113110Z", outageResubmission: null })],
    ["missingTargetField", recoveryWithPr({ runId: "run-2026-07-13T113104Z", pr: { ...exact.pr, headSha: null } })],
  ];

  for (const [name, nearMatch] of nearMatches) {
    const config = tempConfig({ allowExistingPrRecovery: true, outageRecoveryOnly: true, outageRecoveryTarget: target });
    try {
      writeRecoveryState(config, nearMatch);
      writeRecoveryState(config, exact);
      const discovery = discoverTargetedStartupRecovery(config);
      assert.equal(discovery.allowed, true, name);
      assert.equal(discovery.state.issueNumber, 893, name);
      assert.equal(discovery.stateCounts.totalRecoverableCount, 2, name);
      assert.equal(discovery.stateCounts.exactMatchingCount, 1, name);
      assert.equal(discovery.stateCounts.ignoredNonmatchingCount, 1, name);
    } finally {
      config.cleanup();
    }
  }
});

test("targeted outage recovery blocks zero mismatched or duplicate exact states", () => {
  const recovery = recoveryWithPr();
  const target = targetFor(recovery);
  let config = tempConfig({ allowExistingPrRecovery: true, outageRecoveryOnly: true, outageRecoveryTarget: target });
  try {
    assert.equal(discoverTargetedStartupRecovery(config).reasonCode, "outage_recovery_target_missing");
  } finally {
    config.cleanup();
  }

  config = tempConfig({ allowExistingPrRecovery: true, outageRecoveryOnly: true, outageRecoveryTarget: { ...target, issueNumber: 914 } });
  try {
    writeRecoveryState(config, recovery);
    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "outage_recovery_target_mismatch");
    assert.equal(discovery.stateCounts.totalRecoverableCount, 1);
    assert.equal(discovery.stateCounts.exactMatchingCount, 0);
  } finally {
    config.cleanup();
  }

  config = tempConfig({ allowExistingPrRecovery: true, outageRecoveryOnly: true, outageRecoveryTarget: target });
  try {
    const written = writeRecoveryState(config, recovery);
    copyFileSync(written.statePath, path.join(path.dirname(written.statePath), "duplicate-exact.json"));
    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "outage_recovery_target_ambiguous");
    assert.deepEqual(discovery.stateCounts, {
      totalRecoverableCount: 2,
      exactMatchingCount: 2,
      ignoredNonmatchingCount: 0,
    });
  } finally {
    config.cleanup();
  }

  config = tempConfig({ allowExistingPrRecovery: true, outageRecoveryOnly: true, outageRecoveryTarget: target });
  try {
    writeRecoveryState(config, unrelatedRecovery());
    writeRecoveryState(config, unrelatedRecovery({ issue: { number: 892, title: "Other two", url: "https://example.invalid/892" }, branchName: "feature/auto-892-other" }));
    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "outage_recovery_target_mismatch");
    assert.equal(discovery.stateCounts.totalRecoverableCount, 2);
    assert.equal(discovery.stateCounts.exactMatchingCount, 0);
    assert.equal(discovery.stateCounts.ignoredNonmatchingCount, 2);
  } finally {
    config.cleanup();
  }
});

test("targeted outage recovery applies capability and terminal exact-state blockers only to the target", () => {
  const exact = recoveryWithPr();
  const target = targetFor(exact);
  let config = tempConfig({ allowExistingPrRecovery: false, outageRecoveryOnly: true, outageRecoveryTarget: target });
  try {
    writeRecoveryState(config, unrelatedRecovery());
    writeRecoveryState(config, exact);
    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "recoverable_state_requires_explicit_recovery_capability");
    assert.equal(discovery.state.issueNumber, 893);
    assert.equal(discovery.stateCounts.ignoredNonmatchingCount, 1);
  } finally {
    config.cleanup();
  }

  config = tempConfig({ allowExistingPrRecovery: true, outageRecoveryOnly: true, outageRecoveryTarget: target });
  try {
    writeRecoveryState(config, unrelatedRecovery());
    writeRecoveryState(config, advanceRecoveryPhase(exact, { phase: "completed", firstIncompleteAction: "none", nextSafeAction: "none" }));
    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "outage_recovery_target_mismatch");
    assert.equal(discovery.stateCounts.totalRecoverableCount, 1);
    assert.equal(discovery.stateCounts.exactMatchingCount, 0);
    assert.equal(discovery.stateCounts.ignoredNonmatchingCount, 1);
  } finally {
    config.cleanup();
  }
});

test("targeted outage recovery blocks exact stale or regeneration-required targets without mutation", async () => {
  const base = recoveryWithPr();
  const cases = [
    ["next-action", advanceRecoveryPhase(base, { phase: "ci_wait", firstIncompleteAction: "wait_for_checks", nextSafeAction: "regenerate_exact_head_evidence" })],
    ["stale-marker", { ...base, evidence: { ...base.evidence, ciChecks: { status: "passed", headSha: base.branch.currentHeadSha, stale: true } } }],
    ["both", invalidateEvidenceForHeadChange(bindRecoveryEvidence(base, "ciChecks", { status: "passed", headSha: base.branch.currentHeadSha }), { newHeadSha: base.branch.currentHeadSha, reasonCode: "test_stale" })],
    ["allowed-phase", { ...advanceRecoveryPhase(base, { phase: "merge", firstIncompleteAction: "merge_pr" }), nextSafeAction: "regenerate_exact_head_evidence" }],
  ];
  for (const [name, stale] of cases) {
    const config = tempConfig({
      allowExistingPrRecovery: true,
      outageRecoveryOnly: true,
      outageRecoveryTarget: targetFor(stale),
    });
    try {
      const written = writeRecoveryState(config, stale);
      const before = readFileSync(written.statePath, "utf8");
      const discovery = discoverTargetedStartupRecovery(config);
      assert.equal(discovery.allowed, false, name);
      assert.equal(discovery.action, "stop_fail_closed", name);
      assert.equal(discovery.reasonCode, "recovery_exact_head_evidence_regeneration_required", name);
      assert.equal(discovery.state.issueNumber, stale.issue.number, name);
      assert.equal(readFileSync(written.statePath, "utf8"), before, name);

      let executed = false;
      const continuation = await executeStartupContinuation(config, discovery, {
        default: async () => {
          executed = true;
          throw new Error("stale target must not execute");
        },
      });
      assert.equal(executed, false, name);
      assert.equal(continuation.ok, false, name);
      assert.equal(continuation.reasonCode, "recovery_exact_head_evidence_regeneration_required", name);
      assert.equal(readFileSync(written.statePath, "utf8"), before, name);
    } finally {
      config.cleanup();
    }
  }
});

test("targeted outage recovery stale target precedence is exact then ambiguity before stale rejection", () => {
  const exact = recoveryWithPr();
  const staleExact = { ...exact, nextSafeAction: "regenerate_exact_head_evidence" };
  const unrelatedClean = unrelatedRecovery();
  const unrelatedStale = { ...unrelatedRecovery({ issue: { number: 892, title: "Stale other", url: "https://example.invalid/892" }, branchName: "feature/auto-892-other" }), nextSafeAction: "regenerate_exact_head_evidence" };
  const target = targetFor(exact);

  let config = tempConfig({ allowExistingPrRecovery: true, outageRecoveryOnly: true, outageRecoveryTarget: target });
  try {
    writeRecoveryState(config, staleExact);
    writeRecoveryState(config, unrelatedClean);
    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "recovery_exact_head_evidence_regeneration_required");
    assert.equal(discovery.state.issueNumber, 893);
    assert.equal(discovery.stateCounts.exactMatchingCount, 1);
    assert.equal(discovery.stateCounts.ignoredNonmatchingCount, 1);
  } finally {
    config.cleanup();
  }

  config = tempConfig({ allowExistingPrRecovery: true, outageRecoveryOnly: true, outageRecoveryTarget: target });
  try {
    writeRecoveryState(config, exact);
    writeRecoveryState(config, unrelatedStale);
    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.allowed, true);
    assert.equal(discovery.reasonCode, "outage_recovery_target_discovered");
    assert.equal(discovery.state.issueNumber, 893);
  } finally {
    config.cleanup();
  }

  config = tempConfig({ allowExistingPrRecovery: true, outageRecoveryOnly: true, outageRecoveryTarget: target });
  try {
    writeRecoveryState(config, unrelatedStale);
    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "outage_recovery_target_mismatch");
    assert.equal(discovery.stateCounts.exactMatchingCount, 0);
  } finally {
    config.cleanup();
  }

  config = tempConfig({ allowExistingPrRecovery: true, outageRecoveryOnly: true, outageRecoveryTarget: target });
  try {
    const written = writeRecoveryState(config, exact);
    copyFileSync(written.statePath, path.join(path.dirname(written.statePath), "duplicate-stale-exact.json"));
    const duplicatePath = path.join(path.dirname(written.statePath), "duplicate-stale-exact.json");
    const duplicate = JSON.parse(readFileSync(duplicatePath, "utf8"));
    duplicate.nextSafeAction = "regenerate_exact_head_evidence";
    writeFileSync(duplicatePath, `${JSON.stringify(duplicate, null, 2)}\n`);
    const discovery = discoverTargetedStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "outage_recovery_target_ambiguous");
    assert.equal(discovery.stateCounts.exactMatchingCount, 2);
  } finally {
    config.cleanup();
  }
});

test("blocked startup recovery continuations explicitly fail with bounded reasons", async () => {
  const reasons = [
    "outage_recovery_target_missing",
    "outage_recovery_target_mismatch",
    "outage_recovery_target_ambiguous",
    "recoverable_state_requires_explicit_recovery_capability",
    "outage_recovery_target_not_safe",
    "multiple_recoverable_states",
  ];
  const config = tempConfig();
  try {
    for (const reasonCode of reasons) {
      const recovery = {
        found: true,
        allowed: false,
        action: "stop_fail_closed",
        reasonCode,
        state: reasonCode === "outage_recovery_target_missing" ? undefined : { issueNumber: 893 },
        states: [],
      };
      const continuation = await executeStartupContinuation(config, recovery, {
        default: async () => {
          throw new Error("blocked recovery must not execute a handler");
        },
      });
      assert.equal(continuation.ok, false, reasonCode);
      assert.equal(continuation.outcome, "blocked_recovery_state", reasonCode);
      assert.equal(continuation.reasonCode, reasonCode);
      assert.deepEqual(continuation.recovery, recovery);
    }
  } finally {
    config.cleanup();
  }
});

test("normal startup still blocks multiple recoverable states", () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    writeRecoveryState(config, recoveryWithPr());
    writeRecoveryState(config, unrelatedRecovery());
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "multiple_recoverable_states");
  } finally {
    config.cleanup();
  }
});

test("startup blocks stale active recovery state when capability is default-off", () => {
  const config = tempConfig();
  try {
    writeRecoveryState(config, state());
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.found, true);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "recoverable_state_requires_explicit_recovery_capability");
  } finally {
    config.cleanup();
  }
});

test("multiple recoverable active states fail closed", () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    writeRecoveryState(config, state({ issue: { number: 893, title: "A", url: "u" } }));
    writeRecoveryState(config, state({ issue: { number: 891, title: "B", url: "u" }, branchName: "feature/auto-891-b" }));
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.allowed, false);
    assert.equal(discovery.reasonCode, "multiple_recoverable_states");
  } finally {
    config.cleanup();
  }
});

test("interruption at major phase resumes first incomplete phase", () => {
  for (const phase of ["external_review", "ci_wait", "merge", "issue_parent_ledger_hygiene"]) {
    const resumed = firstIncompleteContinuationAction(
      advanceRecoveryPhase(state(), { phase, firstIncompleteAction: `${phase}_next` }),
    );
    assert.equal(resumed.ok, true);
    assert.equal(resumed.nextSafeAction, `${phase}_next`);
  }
});

test("startup continuation dispatches valid own phase handler", async () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const recovery = advanceRecoveryPhase(state(), {
      phase: "ci_wait",
      firstIncompleteAction: "wait_for_checks",
    });
    let called = false;
    const continued = await runStartupContinuation(config, recovery, {
      ci_wait: async ({ boundary }) => {
        called = true;
        assert.equal(boundary.phase, "ci_wait");
        return { ok: true, outcome: "phase_handler_ok", reasonCode: "phase_handler_ok" };
      },
    });
    assert.equal(called, true);
    assert.equal(continued.outcome, "phase_handler_ok");
    assert.equal(continued.recovery.executedPhase, "ci_wait");
  } finally {
    config.cleanup();
  }
});

test("startup continuation dispatches valid own next-safe-action handler", async () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const recovery = advanceRecoveryPhase(state(), {
      phase: "ci_wait",
      firstIncompleteAction: "wait_for_checks",
      nextSafeAction: "wait_for_checks",
    });
    let called = false;
    const continued = await runStartupContinuation(config, recovery, {
      wait_for_checks: async ({ boundary }) => {
        called = true;
        assert.equal(boundary.nextSafeAction, "wait_for_checks");
        return { ok: true, outcome: "action_handler_ok", reasonCode: "action_handler_ok" };
      },
    });
    assert.equal(called, true);
    assert.equal(continued.outcome, "action_handler_ok");
    assert.equal(continued.recovery.executedAction, "wait_for_checks");
  } finally {
    config.cleanup();
  }
});

test("startup continuation uses valid own callable default fallback", async () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const recovery = advanceRecoveryPhase(state(), {
      phase: "ci_wait",
      firstIncompleteAction: "wait_for_checks",
    });
    let called = false;
    const continued = await runStartupContinuation(config, recovery, {
      default: async ({ boundary }) => {
        called = true;
        assert.equal(boundary.phase, "ci_wait");
        return { ok: true, outcome: "default_handler_ok", reasonCode: "default_handler_ok" };
      },
    });
    assert.equal(called, true);
    assert.equal(continued.outcome, "default_handler_ok");
  } finally {
    config.cleanup();
  }
});

test("startup continuation blocks missing or unknown persisted action handlers", async () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const recovery = advanceRecoveryPhase(state(), {
      phase: "ci_wait",
      firstIncompleteAction: "unexpected_action",
      nextSafeAction: "unexpected_action",
    });
    const continued = await runStartupContinuation(config, recovery, {});
    assert.equal(continued.ok, false);
    assert.equal(continued.outcome, "blocked_recovery_state");
    assert.equal(continued.reasonCode, "missing_recovery_phase_handler");
  } finally {
    config.cleanup();
  }
});

test("startup continuation does not select inherited constructor handler", async () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const recovery = advanceRecoveryPhase(state(), {
      phase: "ci_wait",
      firstIncompleteAction: "constructor",
      nextSafeAction: "constructor",
    });
    const handlers = Object.create({
      constructor: async () => {
        throw new Error("inherited constructor handler must not run");
      },
    });
    const continued = await runStartupContinuation(config, recovery, handlers);
    assert.equal(continued.ok, false);
    assert.equal(continued.reasonCode, "missing_recovery_phase_handler");
  } finally {
    config.cleanup();
  }
});

test("startup continuation rejects prototype-chain style action keys even when callable", async () => {
  for (const key of ["__proto__", "prototype", "toString"]) {
    const config = tempConfig({ allowExistingPrRecovery: true });
    try {
      const recovery = advanceRecoveryPhase(state(), {
        phase: "ci_wait",
        firstIncompleteAction: key,
        nextSafeAction: key,
      });
      let called = false;
      const handlers = {};
      Object.defineProperty(handlers, key, {
        value: async () => {
          called = true;
          return { ok: true };
        },
        enumerable: true,
      });
      const continued = await runStartupContinuation(config, recovery, handlers);
      assert.equal(called, false, key);
      assert.equal(continued.ok, false, key);
      assert.equal(continued.reasonCode, "missing_recovery_phase_handler", key);
    } finally {
      config.cleanup();
    }
  }
});

test("startup continuation rejects own non-function handler values", async () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const recovery = advanceRecoveryPhase(state(), {
      phase: "ci_wait",
      firstIncompleteAction: "wait_for_checks",
      nextSafeAction: "wait_for_checks",
    });
    const continued = await runStartupContinuation(config, recovery, {
      wait_for_checks: "not-callable",
    });
    assert.equal(continued.ok, false);
    assert.equal(continued.reasonCode, "missing_recovery_phase_handler");
  } finally {
    config.cleanup();
  }
});

test("startup continuation ignores inherited or non-callable controlCheck", async () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const recovery = advanceRecoveryPhase(state(), {
      phase: "ci_wait",
      firstIncompleteAction: "wait_for_checks",
    });
    let inheritedCalled = false;
    const inheritedHandlers = Object.create({
      controlCheck: () => {
        inheritedCalled = true;
        return { ok: true, action: "pause_at_safe_boundary" };
      },
    });
    inheritedHandlers.default = async () => ({ ok: true, outcome: "continued_without_inherited_control", reasonCode: "continued" });
    const inheritedContinued = await runStartupContinuation(config, recovery, inheritedHandlers);
    assert.equal(inheritedCalled, false);
    assert.equal(inheritedContinued.ok, true);
    assert.equal(inheritedContinued.outcome, "continued_without_inherited_control");

    const handlers = {
      controlCheck: "not-callable",
      default: async () => ({ ok: true, outcome: "continued_without_noncallable_control", reasonCode: "continued" }),
    };
    const continued = await runStartupContinuation(config, recovery, handlers);
    assert.equal(continued.ok, true);
    assert.equal(continued.outcome, "continued_without_noncallable_control");
  } finally {
    config.cleanup();
  }
});

test("completed phase is never re-executed via idempotent mutation markers", () => {
  let recovery = state();
  recovery = recordIdempotentMutation(recovery, { kind: "pr_comment", key: "status-20260713-1927" });
  const plan = planIdempotentGithubMutation(recovery, {
    kind: "pr_comment",
    key: "status-20260713-1927",
    target: "PR #905",
  });
  assert.equal(plan.mutate, false);
  assert.equal(plan.action, "skip_existing_marker");
});

test("feature-bundle completed slice is never rerun and incomplete slice resumes from checkpoint", () => {
  const bundle = {
    sliceOrder: ["slice-one", "slice-two", "slice-three"],
    slices: {
      "slice-one": { state: "completed", commitSha: "a".repeat(40) },
      "slice-two": { state: "started", commitSha: null },
      "slice-three": { state: "pending", commitSha: null },
    },
  };
  assert.equal(shouldSkipCompletedBundleSlice(bundle, "slice-one"), true);
  const next = nextBundleSliceFromCheckpoint(bundle);
  assert.equal(next.nextSliceId, "slice-two");
  assert.deepEqual(next.completedSliceIds, ["slice-one"]);
});

test("generated issue and comment mutation planning is idempotent", () => {
  let recovery = state();
  recovery = recordIdempotentMutation(recovery, { kind: "followup_issue", key: "review:abc" });
  recovery = recordIdempotentMutation(recovery, { kind: "issue_comment", key: "893-status" });
  assert.equal(planIdempotentGithubMutation(recovery, { kind: "followup_issue", key: "review:abc" }).mutate, false);
  assert.equal(planIdempotentGithubMutation(recovery, { kind: "issue_comment", key: "893-status" }).mutate, false);
  assert.equal(planIdempotentGithubMutation(recovery, { kind: "parent_comment", key: "800-progress" }).mutate, true);
});

test("merge is not repeated after confirmed marker", () => {
  const recovery = recordIdempotentMutation(state(), { kind: "merge", key: "pr-905-head-c" });
  assert.equal(planIdempotentGithubMutation(recovery, { kind: "merge", key: "pr-905-head-c" }).mutate, false);
});

test("pause and stop controls act only at safe boundaries", () => {
  assert.equal(evaluateControlAtRecoveryBoundary(state(), { pause: true }).action, "pause_at_safe_boundary");
  assert.equal(evaluateControlAtRecoveryBoundary(state(), { stopAfterCurrent: true }).action, "stop_after_current_boundary");
  assert.equal(
    evaluateControlAtRecoveryBoundary(advanceRecoveryPhase(state(), { phase: "completed", firstIncompleteAction: "none" })).reasonCode,
    "not_safe_boundary",
  );
});

test("supervisor restart preserves run task and report correlation in status summary", () => {
  const summary = recoveryStatusSummary(state());
  assert.equal(summary.taskKey, "20260713-1927");
  assert.equal(summary.runId, "run-2026-07-13T112700Z");
  assert.equal(summary.supervisorRunId, "supervised-20260713T112700Z-abcdefabcdef");
});

test("stale active lock style multiple recovery blocks and manual decisions mutate nothing", () => {
  const blocked = firstIncompleteContinuationAction(advanceRecoveryPhase(state(), { phase: "stopped", firstIncompleteAction: "manual" }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reasonCode, "not_safe_boundary");
});

test("completion hygiene resumes component-by-component without duplicates", () => {
  let recovery = state();
  recovery = recordIdempotentMutation(recovery, { kind: "issue_comment", key: "893-complete" });
  const resume = evaluateCompletionHygieneResume(recovery, [
    { kind: "issue_comment", key: "893-complete" },
    { kind: "parent_comment", key: "800-progress" },
    { kind: "ledger_hygiene", key: "893-ledger" },
  ]);
  assert.equal(resume.completed.length, 1);
  assert.equal(resume.pending.length, 2);
  assert.equal(resume.nextComponent.key, "800-progress");
});

test("ordinary and bundle paths share recovery summary shape", () => {
  const ordinary = recoveryStatusSummary(state());
  const bundle = recoveryStatusSummary({ ...state(), featureBundle: { bundleId: "bundle-893" } });
  assert.equal(ordinary.phase, bundle.phase);
  assert.equal(ordinary.nextSafeAction, bundle.nextSafeAction);
});

test("status summary remains bounded and sanitized", () => {
  const summary = recoveryStatusSummary({
    ...state(),
    rawPrompt: "GEMINI_API_KEY=secret",
    providerResponse: "Bearer abc",
  });
  assert.equal(Object.hasOwn(summary, "rawPrompt"), false);
  assert.equal(Object.hasOwn(summary, "providerResponse"), false);
  assert.equal(summary.branchName.includes("20260713-1927"), true);
});
