import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  buildRunSpec,
  canonicalJson,
  generateRunId,
  normalizeMaxRuntime,
  normalizeMaxTasks,
  readAndVerifyRunSpec,
  resolveProfile,
  sha256Text,
  validateRunId,
  validateRunSpecShape,
  writeImmutableRunSpec,
} from "../supervisor/run-spec.mjs";
import { buildHeartbeat, isHeartbeatStale, readHeartbeat } from "../supervisor/heartbeat.mjs";
import { monitoringEvents, recordMonitoringEvent, sanitizeMonitoringPayload } from "../supervisor/monitoring-outbox.mjs";
import { resolveRunnerSummaryForSupervisor } from "../supervisor/runner-summary-resolver.mjs";
import { buildSystemdStartPlan, runnerArgvForSpec, startUserUnit } from "../supervisor/systemd-client.mjs";
import { classifyHealth, controlSupervisorRun } from "../settleora-auto-runnerctl.mjs";
import { evaluateSupervisorControlPolicy } from "../supervisor/control-policy.mjs";
import { decideTerminalState } from "../supervisor/settleora-auto-runner-worker.mjs";
import { writeHeartbeat } from "../supervisor/heartbeat.mjs";
import { readSupervisorState, writeSupervisorState } from "../supervisor/supervisor-state.mjs";
import {
  deriveSupervisorPaths,
  fixedArtifactBasename,
  profileStorageKey,
  runArtifactKinds,
  storageKeyForLogicalId,
  validateStorageKey,
} from "../supervisor/supervisor-paths.mjs";

const fakeSha = "a".repeat(40);

test("run-spec defaults, valid budgets, and hard boundaries", () => {
  assert.equal(normalizeMaxTasks(undefined), 1);
  assert.equal(normalizeMaxTasks(500), 500);
  assert.throws(() => normalizeMaxTasks(0), /1..500/);
  assert.throws(() => normalizeMaxTasks(501), /1..500/);
  assert.equal(normalizeMaxRuntime(undefined), "3h");
  assert.equal(normalizeMaxRuntime("1m"), "1m");
  assert.equal(normalizeMaxRuntime("14d"), "14d");
  assert.throws(() => normalizeMaxRuntime("0m"), /1m..14d/);
  assert.throws(() => normalizeMaxRuntime("15d"), /1m..14d/);
  assert.throws(() => normalizeMaxRuntime("8"), /explicit unit/);
});

test("run-spec rejects unknown command/env/argument fields and unsafe run IDs", () => {
  const runId = generateRunId(new Date("2026-07-11T06:17:00Z"));
  assert.equal(validateRunId(runId), runId);
  assert.throws(() => validateRunId("settleora-auto-runner@evil.service"), /Invalid supervisor run ID/);
  assert.throws(() => validateRunSpecShape({ specVersion: 1, runId, command: "rm -rf /" }), /Unknown run-spec field: command/);
  assert.throws(() => validateRunSpecShape({ specVersion: 1, runId, env: { X: "Y" } }), /Unknown run-spec field: env/);
  assert.throws(() => validateRunSpecShape({ specVersion: 1, runId, extraArgs: ["--danger"] }), /Unknown run-spec field: extraArgs/);
  assert.throws(() => validateRunSpecShape({ specVersion: 1, runId, runnerConfigPath: "/tmp/config.json" }), /Unknown run-spec field: runnerConfigPath/);
});

test("run-spec canonical serialization, exclusive create, digest, tamper, symlink, escape, and mode checks", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-supervisor-"));
  const logsRoot = path.join(tempRoot, "settleora-auto-runner");
  const profile = "default";
  const configRoot = path.dirname(resolveProfile(profile, logsRoot).runnerConfigPath);
  mkdirSync(configRoot, { recursive: true, mode: 0o700 });
  const configPath = resolveProfile(profile, logsRoot).runnerConfigPath;
  writeFileSync(configPath, '{"trustedRealRunCanaryApproved":false}\n",'.replace('",', ""), { mode: 0o600 });
  const runId = generateRunId();
  const { spec } = buildRunSpec({ runId, profile, initialOriginMainSha: fakeSha, logsRoot });
  const digest = sha256Text(canonicalJson(spec));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(spec.profile, "default");
  assert.equal("runnerConfigPath" in spec, false);
  const written = writeImmutableRunSpec(spec, logsRoot);
  assert.equal(written.specSha256, digest);
  assert.throws(() => writeImmutableRunSpec(spec, logsRoot), /EEXIST/);
  assert.equal(readAndVerifyRunSpec(runId, digest, logsRoot).spec.runId, runId);
  writeFileSync(written.specPath, canonicalJson({ ...spec, maxTasks: 2 }), { mode: 0o600 });
  assert.throws(() => readAndVerifyRunSpec(runId, digest, logsRoot), /digest mismatch/);

  const symlinkLogsRoot = path.join(tempRoot, "symlink-root");
  const symlinkConfigPath = resolveProfile(profile, symlinkLogsRoot).runnerConfigPath;
  mkdirSync(path.dirname(symlinkConfigPath), { recursive: true, mode: 0o700 });
  symlinkSync(configPath, symlinkConfigPath);
  assert.throws(() => buildRunSpec({ profile, initialOriginMainSha: fakeSha, logsRoot: symlinkLogsRoot }), /regular file|Symlink/);

  chmodSync(configPath, 0o622);
  assert.throws(() => buildRunSpec({ profile, initialOriginMainSha: fakeSha, logsRoot }), /Group\/world-writable/);
});

test("run-spec validates complete outage resubmission source identity", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-supervisor-outage-"));
  const configPath = resolveProfile("default", tempRoot).runnerConfigPath;
  mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
  writeFileSync(configPath, '{"trustedRealRunCanaryApproved":false}\n', { mode: 0o600 });
  const outageResubmission = {
    attemptNumber: 1,
    markerKey: "a".repeat(64),
    outageFingerprint: "b".repeat(64),
    originalSupervisorSpecDigest: "c".repeat(64),
    taskKey: "20260715-0308",
    currentHeadSha: "d".repeat(40),
    prNumber: 917,
    prHeadSha: "d".repeat(40),
  };
  const recoveryOnlyTarget = {
    taskKey: outageResubmission.taskKey,
    issueNumber: 913,
    branchName: "feature/auto-913-bounded-outage-resubmission-20260715-0013",
    baseSha: fakeSha,
    currentHeadSha: outageResubmission.currentHeadSha,
    prNumber: outageResubmission.prNumber,
    prHeadSha: outageResubmission.prHeadSha,
    runnerRunId: "run-2026-07-15T030800Z",
    supervisorRunId: "supervised-20260715T030800Z-000000000913",
    originalSupervisorSpecDigest: outageResubmission.originalSupervisorSpecDigest,
    markerKey: outageResubmission.markerKey,
    outageFingerprint: outageResubmission.outageFingerprint,
    attemptNumber: outageResubmission.attemptNumber,
  };
  try {
    const { spec } = buildRunSpec({
      runId: "supervised-20260715T010000Z-000000000abc",
      profile: "default",
      initialOriginMainSha: fakeSha,
      mode: "trusted",
      parentSupervisorRunId: recoveryOnlyTarget.supervisorRunId,
      parentRunnerRunId: recoveryOnlyTarget.runnerRunId,
      sourceIssueNumber: recoveryOnlyTarget.issueNumber,
      sourceBranchName: recoveryOnlyTarget.branchName,
      maxTasks: 8,
      outageResubmission,
      recoveryOnlyTarget,
      allowMissingConfig: true,
      logsRoot: tempRoot,
    });
    assert.equal(spec.outageResubmission.taskKey, "20260715-0308");
    assert.equal(spec.outageResubmission.currentHeadSha, "d".repeat(40));
    assert.equal(spec.outageResubmission.prNumber, 917);
    assert.equal(spec.outageResubmission.prHeadSha, "d".repeat(40));
    assert.equal(spec.recoveryOnlyTarget.issueNumber, 913);
    assert.equal(spec.recoveryOnlyTarget.runnerRunId, "run-2026-07-15T030800Z");
    assert.equal(spec.maxTasks, 1);
    assert.throws(() => validateRunSpecShape({ ...spec, maxTasks: 2 }), /recovery-only run specs must store maxTasks 1/);
    const written = writeImmutableRunSpec(spec, tempRoot);
    writeFileSync(written.specPath, canonicalJson({ ...spec, maxTasks: 2 }), { mode: 0o600 });
    assert.throws(() => readAndVerifyRunSpec(spec.runId, null, tempRoot), /recovery-only run specs must store maxTasks 1/);
    assert.throws(() => buildRunSpec({ profile: "default", initialOriginMainSha: fakeSha, outageResubmission, allowMissingConfig: true, logsRoot: tempRoot }), /paired recoveryOnlyTarget/);
    assert.throws(() => validateRunSpecShape({
      ...spec,
      outageResubmission: { ...outageResubmission, prNumber: null, prHeadSha: null },
      recoveryOnlyTarget: { ...recoveryOnlyTarget, prNumber: null, prHeadSha: null },
    }), /requires PR number\/head SHA/);
    const base = { profile: "default", initialOriginMainSha: fakeSha, mode: "trusted", parentSupervisorRunId: recoveryOnlyTarget.supervisorRunId, parentRunnerRunId: recoveryOnlyTarget.runnerRunId, sourceIssueNumber: recoveryOnlyTarget.issueNumber, sourceBranchName: recoveryOnlyTarget.branchName, recoveryOnlyTarget, allowMissingConfig: true, logsRoot: tempRoot };
    assert.throws(() => buildRunSpec({ ...base, outageResubmission: { ...outageResubmission, taskKey: "bad/key" } }), /taskKey/);
    assert.throws(() => buildRunSpec({ ...base, outageResubmission: { ...outageResubmission, currentHeadSha: "D".repeat(40) } }), /currentHeadSha/);
    assert.throws(() => buildRunSpec({ ...base, outageResubmission: { ...outageResubmission, prNumber: 917, prHeadSha: null } }), /paired/);
    assert.throws(() => buildRunSpec({ ...base, outageResubmission: { ...outageResubmission, prNumber: null, prHeadSha: "d".repeat(40) } }), /paired/);
    assert.throws(() => buildRunSpec({ ...base, outageResubmission: { ...outageResubmission, prNumber: 0 } }), /prNumber/);
    assert.throws(() => buildRunSpec({ ...base, outageResubmission: { ...outageResubmission, prHeadSha: "g".repeat(40) } }), /prHeadSha/);
    assert.throws(() => buildRunSpec({ ...base, outageResubmission: { ...outageResubmission, extra: "nope" } }), /Unknown outageResubmission field/);
    assert.throws(() => buildRunSpec({ ...base, outageResubmission, recoveryOnlyTarget: { ...recoveryOnlyTarget, issueNumber: 914 } }), /identity mismatch: sourceIssueNumber/);
    assert.throws(() => buildRunSpec({ ...base, outageResubmission, recoveryOnlyTarget: { ...recoveryOnlyTarget, extra: "nope" } }), /Unknown recoveryOnlyTarget field/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("storage keys and fixed artifact paths keep raw identifiers out of filesystem sinks", () => {
  const rawRunId = "supervised-20260711T063151Z-066b80f4fc16";
  const otherRunId = "supervised-20260711T063151Z-166b80f4fc16";
  const storageKey = storageKeyForLogicalId(rawRunId);
  assert.match(storageKey, /^[a-f0-9]{64}$/);
  assert.notEqual(storageKey, storageKeyForLogicalId(otherRunId));
  assert.equal(validateStorageKey(storageKey), storageKey);
  assert.throws(() => validateStorageKey("../bad"), /Invalid supervisor storage key/);

  const paths = deriveSupervisorPaths({ runId: rawRunId, logsRoot: "/workspace/logs/settleora-auto-runner" });
  assert.equal(paths.runStorageKey, storageKey);
  assert.equal(paths.runDir.includes(rawRunId), false);
  assert.equal(paths.specPath.includes(rawRunId), false);
  assert.equal(paths.artifactPath(runArtifactKinds.state).endsWith("/state.json"), true);
  assert.equal(paths.artifactPath(runArtifactKinds.heartbeat).endsWith("/heartbeat.json"), true);
  assert.equal(paths.artifactPath(runArtifactKinds.stdout).endsWith("/stdout.log"), true);
  assert.equal(paths.artifactPath(runArtifactKinds.stderr).endsWith("/stderr.log"), true);
  assert.equal(paths.artifactPath(runArtifactKinds.monitoringEvents).endsWith("/monitoring-events.jsonl"), true);
  assert.throws(() => fixedArtifactBasename("../escape"), /Unsupported supervisor artifact kind/);
  assert.throws(() => fixedArtifactBasename("operator-choice.json"), /Unsupported supervisor artifact kind/);
  assert.equal(profileStorageKey("default").length, 64);
  assert.equal(resolveProfile("default").runnerConfigPath.includes("/default."), false);
  assert.throws(() => resolveProfile("..\\/secret"), /Invalid profile name/);
});

test("systemd and runner argv stay lane-neutral and shell-free", () => {
  const runId = generateRunId();
  const spec = {
    specVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    maxTasks: 8,
    maxRuntime: "8h",
    mode: "trusted",
    profile: "default",
    runnerConfigSha256: "b".repeat(64),
    initialOriginMainSha: fakeSha,
    requestedBy: "operator",
  };
  const plan = buildSystemdStartPlan(runId, {
    configPath: "/workspace/logs/configs/default.json",
    repoRoot: "/workspace/repos/Settleora",
    logsRoot: "/workspace/logs/settleora-auto-runner",
  });
  assert.deepEqual(plan.startArgv, ["systemctl", "--user", "start", `settleora-auto-runner@${runId}.service`]);
  assert.equal(plan.expectedExecArgv.some((value) => value.endsWith("/.auto-runner.launcher.mjs")), true);
  assert.deepEqual(plan.inspectArgv, ["systemctl", "--user", "cat", plan.unitName, "--no-pager"]);
  assert.deepEqual(plan.reloadArgv, ["systemctl", "--user", "daemon-reload"]);
  assert.equal(plan.unitName, `settleora-auto-runner@${runId}.service`);
  assert.throws(() => buildSystemdStartPlan("bad;systemctl reboot"), /Invalid supervisor run ID/);
  for (const unsafePath of [
    "/workspace/repos/Settleora\n--property=Environment=INJECTED=1",
    "/workspace/repos/../other",
    "/workspace/repos//Settleora",
    "relative/repository",
  ]) {
    assert.throws(
      () => buildSystemdStartPlan(runId, {
        configPath: "/workspace/logs/configs/default.json",
        repoRoot: unsafePath,
        logsRoot: "/workspace/logs/settleora-auto-runner",
      }),
      /canonical shell-neutral supervisor repoRoot is required/,
    );
  }
  const runnerRunId = "run-2026-07-20T144500Z";
  const argv = runnerArgvForSpec(spec, { runnerRunId });
  assert.equal(argv[argv.indexOf("--max-iterations") + 1], "8");
  assert.equal(argv.includes("client-ui-low-risk"), false);
  assert.equal(argv.includes("auto-canary-ready"), false);
  assert.equal(argv.includes("--allow-auto-merge"), false);
  assert.equal(argv.includes("--config"), true);
  assert.equal(argv.filter((part) => part === "--supervisor-run-id").length, 1);
  assert.equal(argv[argv.indexOf("--supervisor-run-id") + 1], runId);
  assert.equal(argv[argv.indexOf("--runner-run-id") + 1], runnerRunId);
  assert.equal(argv.includes("--canary"), false);
  const canaryArgv = runnerArgvForSpec({ ...spec, mode: "canary" });
  assert.equal(canaryArgv.includes("--canary"), true);
});

test("outage recovery-only run-spec maps to fixed target argv", () => {
  const runId = generateRunId();
  const recoveryOnlyTarget = {
    taskKey: "20260715-1425",
    issueNumber: 913,
    branchName: "feature/auto-913-bounded-outage-resubmission-20260715-0013",
    baseSha: fakeSha,
    currentHeadSha: "d".repeat(40),
    prNumber: 917,
    prHeadSha: "d".repeat(40),
    runnerRunId: "run-2026-07-15T142500Z",
    supervisorRunId: "supervised-20260715T142500Z-000000000913",
    originalSupervisorSpecDigest: "c".repeat(64),
    markerKey: "a".repeat(64),
    outageFingerprint: "b".repeat(64),
    attemptNumber: 1,
  };
  const spec = {
    specVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    maxTasks: 1,
    maxRuntime: "8h",
    mode: "trusted",
    profile: "default",
    runnerConfigSha256: "b".repeat(64),
    initialOriginMainSha: fakeSha,
    requestedBy: "outage-controller",
    parentSupervisorRunId: recoveryOnlyTarget.supervisorRunId,
    parentRunnerRunId: recoveryOnlyTarget.runnerRunId,
    sourceIssueNumber: recoveryOnlyTarget.issueNumber,
    sourceBranchName: recoveryOnlyTarget.branchName,
    outageResubmission: {
      attemptNumber: recoveryOnlyTarget.attemptNumber,
      markerKey: recoveryOnlyTarget.markerKey,
      outageFingerprint: recoveryOnlyTarget.outageFingerprint,
      originalSupervisorSpecDigest: recoveryOnlyTarget.originalSupervisorSpecDigest,
      taskKey: recoveryOnlyTarget.taskKey,
      currentHeadSha: recoveryOnlyTarget.currentHeadSha,
      prNumber: recoveryOnlyTarget.prNumber,
      prHeadSha: recoveryOnlyTarget.prHeadSha,
    },
    recoveryOnlyTarget,
  };
  validateRunSpecShape(spec);
  assert.throws(() => validateRunSpecShape({ ...spec, maxTasks: 8 }), /recovery-only run specs must store maxTasks 1/);
  const argv = runnerArgvForSpec(spec);
  assert.equal(argv.includes("--outage-recovery-only"), true);
  assert.equal(argv[argv.indexOf("--max-iterations") + 1], "1");
  assert.equal(argv[argv.indexOf("--outage-target-issue") + 1], "913");
  assert.equal(argv[argv.indexOf("--outage-target-pr") + 1], "917");
  assert.equal(argv[argv.indexOf("--outage-target-pr-head-sha") + 1], "d".repeat(40));
  assert.equal(argv[argv.indexOf("--outage-target-marker-key") + 1], recoveryOnlyTarget.markerKey);
  assert.equal(argv.includes("{"), false);
  assert.equal(argv.some((part) => String(part).includes("/tmp/evil")), false);
  assert.throws(
    () => runnerArgvForSpec({ ...spec, recoveryOnlyTarget: { ...recoveryOnlyTarget, prNumber: null, prHeadSha: null } }),
    /requires PR number\/head SHA/,
  );
});

test("trusted summary resolver maps exactly one correlated JSON and Markdown pair", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-summary-resolver-"));
  const logsRoot = path.join(tempRoot, "logs");
  const supervisorRunId = "supervised-20260711T083159Z-427681e96152";
  const baseSha = "a".repeat(40);
  try {
    mkdirSync(path.join(logsRoot, "summaries"), { recursive: true });
    writeSummaryPair(logsRoot, {
      runId: "run-2026-07-11T083209Z",
      supervisorRunId,
      baseOriginMainSha: baseSha,
      mode: "canary-run",
    });
    writeSummaryPair(logsRoot, {
      runId: "run-2026-07-11T083210Z",
      supervisorRunId: "supervised-20260711T083159Z-527681e96152",
      baseOriginMainSha: baseSha,
      mode: "canary-run",
    });
    writeFileSync(path.join(logsRoot, "summaries", "recent-summary-20260711.json"), "{}\n");
    const result = resolveRunnerSummaryForSupervisor({ logsRoot, supervisorRunId, initialOriginMainSha: baseSha, mode: "canary" });
    assert.equal(result.status, "matched");
    assert.equal(result.runnerRunId, "run-2026-07-11T083209Z");
    assert.equal(result.reportPath.endsWith("run-2026-07-11T083209Z.md"), true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("trusted summary resolver accepts clean-main no-work summary correlation", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-summary-no-work-"));
  const logsRoot = path.join(tempRoot, "logs");
  const supervisorRunId = "supervised-20260711T161333Z-d7113d9be4d4";
  const baseSha = "d930db9f5d70c78c9248616102bc209fc928cff3";
  try {
    mkdirSync(path.join(logsRoot, "summaries"), { recursive: true });
    writeSummaryPair(logsRoot, {
      runId: "run-2026-07-11T161343Z",
      supervisorRunId,
      baseOriginMainSha: baseSha,
      mode: "canary-run",
      iterations: [{ outcome: "no_eligible_work" }],
      stopReason: "no-eligible-work",
    });
    const summary = JSON.parse(readFileSync(path.join(logsRoot, "summaries", "run-2026-07-11T161343Z.json"), "utf8"));
    assert.equal(summary.supervisorRunId, supervisorRunId);
    assert.equal(summary.baseOriginMainSha, baseSha);
    assert.equal(summary.stopReason, "no-eligible-work");
    assert.equal(summary.iterations[0].outcome, "no_eligible_work");
    const result = resolveRunnerSummaryForSupervisor({ logsRoot, supervisorRunId, initialOriginMainSha: baseSha, mode: "canary" });
    assert.equal(result.status, "matched");
    assert.equal(result.runnerRunId, "run-2026-07-11T161343Z");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("trusted summary resolver fails closed for unsafe or ambiguous candidates", () => {
  const supervisorRunId = "supervised-20260711T083159Z-427681e96152";
  const baseSha = "a".repeat(40);
  const cases = [
    {
      name: "missing",
      setup: () => {},
      expected: "missing",
    },
    {
      name: "multiple",
      setup: (logsRoot) => {
        writeSummaryPair(logsRoot, { runId: "run-2026-07-11T083209Z", supervisorRunId, baseOriginMainSha: baseSha, mode: "canary-run" });
        writeSummaryPair(logsRoot, { runId: "run-2026-07-11T083210Z", supervisorRunId, baseOriginMainSha: baseSha, mode: "canary-run" });
      },
      expected: "multiple_matches",
    },
    {
      name: "matching-malformed",
      setup: (logsRoot) => {
        writeFileSync(path.join(logsRoot, "summaries", "run-2026-07-11T083209Z.json"), `{"supervisorRunId":"${supervisorRunId}",`, { mode: 0o600 });
      },
      expected: "malformed_candidate",
    },
    {
      name: "filename-mismatch",
      setup: (logsRoot) => {
        writeSummaryPair(logsRoot, {
          fileRunId: "run-2026-07-11T083209Z",
          runId: "run-2026-07-11T083210Z",
          supervisorRunId,
          baseOriginMainSha: baseSha,
          mode: "canary-run",
        });
      },
      expected: "malformed_candidate",
    },
    {
      name: "wrong-base",
      setup: (logsRoot) => {
        writeSummaryPair(logsRoot, { runId: "run-2026-07-11T083209Z", supervisorRunId, baseOriginMainSha: "b".repeat(40), mode: "canary-run" });
      },
      expected: "malformed_candidate",
    },
    {
      name: "null-base",
      setup: (logsRoot) => {
        writeSummaryPair(logsRoot, { runId: "run-2026-07-11T083209Z", supervisorRunId, baseOriginMainSha: null, mode: "canary-run" });
      },
      expected: "malformed_candidate",
    },
    {
      name: "missing-base",
      setup: (logsRoot) => {
        writeSummaryPair(logsRoot, { runId: "run-2026-07-11T083209Z", supervisorRunId, mode: "canary-run" });
      },
      expected: "malformed_candidate",
    },
    {
      name: "wrong-mode",
      setup: (logsRoot) => {
        writeSummaryPair(logsRoot, { runId: "run-2026-07-11T083209Z", supervisorRunId, baseOriginMainSha: baseSha, mode: "run" });
      },
      expected: "malformed_candidate",
    },
    {
      name: "missing-markdown",
      setup: (logsRoot) => {
        writeSummaryJson(logsRoot, { runId: "run-2026-07-11T083209Z", supervisorRunId, baseOriginMainSha: baseSha, mode: "canary-run" });
      },
      expected: "json_markdown_pair_missing",
    },
    {
      name: "symlink-json",
      setup: (logsRoot) => {
        const outside = path.join(logsRoot, "outside.json");
        writeFileSync(outside, "{}\n");
        symlinkSync(outside, path.join(logsRoot, "summaries", "run-2026-07-11T083209Z.json"));
      },
      expected: "missing",
    },
    {
      name: "symlink-markdown",
      setup: (logsRoot) => {
        writeSummaryJson(logsRoot, { runId: "run-2026-07-11T083209Z", supervisorRunId, baseOriginMainSha: baseSha, mode: "canary-run" });
        const outside = path.join(logsRoot, "outside.md");
        writeFileSync(outside, "# outside\n");
        symlinkSync(outside, path.join(logsRoot, "summaries", "run-2026-07-11T083209Z.md"));
      },
      expected: "json_markdown_pair_missing",
    },
    {
      name: "unfinished",
      setup: (logsRoot) => {
        writeSummaryPair(logsRoot, { runId: "run-2026-07-11T083209Z", supervisorRunId, baseOriginMainSha: baseSha, mode: "canary-run", finishedAt: null });
      },
      expected: "malformed_candidate",
    },
    {
      name: "scan-limit",
      setup: (logsRoot) => {
        writeSummaryPair(logsRoot, { runId: "run-2026-07-11T083209Z", supervisorRunId, baseOriginMainSha: baseSha, mode: "canary-run" });
      },
      expected: "malformed_candidate",
      options: { maxFiles: 0 },
    },
    {
      name: "oversized-matching",
      setup: (logsRoot) => {
        writeFileSync(
          path.join(logsRoot, "summaries", "run-2026-07-11T083209Z.json"),
          `${JSON.stringify({ supervisorRunId })}${"x".repeat(2048)}`,
          { mode: 0o600 },
        );
      },
      expected: "malformed_candidate",
      options: { maxBytes: 256 },
    },
  ];
  for (const item of cases) {
    const tempRoot = mkdtempSync(path.join(tmpdir(), `settleora-resolver-${item.name}-`));
    const logsRoot = path.join(tempRoot, "logs");
    try {
      mkdirSync(path.join(logsRoot, "summaries"), { recursive: true });
      item.setup(logsRoot);
      const result = resolveRunnerSummaryForSupervisor({
        logsRoot,
        supervisorRunId,
        initialOriginMainSha: baseSha,
        mode: "canary",
        ...(item.options || {}),
      });
      assert.equal(result.status, item.expected, item.name);
      assert.equal(typeof JSON.stringify(result.diagnostics), "string");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("worker terminal mapping fails closed on successful child without trusted report", () => {
  assert.deepEqual(decideTerminalState("completed", { status: 0, signal: null }, { status: "matched" }), {
    state: "completed",
    reason: "child_exit_mapped",
  });
  assert.deepEqual(decideTerminalState("completed", { status: 0, signal: null }, { status: "missing" }), {
    state: "failed",
    reason: "report_mapping_missing",
  });
  assert.deepEqual(decideTerminalState("completed", { status: 0, signal: null }, { status: "multiple_matches" }), {
    state: "failed",
    reason: "report_mapping_ambiguous",
  });
  assert.deepEqual(decideTerminalState("failed", { status: 1, signal: null }, { status: "matched" }), {
    state: "failed",
    reason: "child_exit_mapped",
  });
});

test("supervisor status, report, and health distinguish mapped reports from historical null reports", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-health-report-"));
  const logsRoot = path.join(tempRoot, "logs");
  const runId = "supervised-20260711T083159Z-427681e96152";
  try {
    const mapped = {
      status: "matched",
      ok: true,
      runnerRunId: "run-2026-07-11T083209Z",
      runnerSummaryJsonPath: path.join(logsRoot, "summaries", "run-2026-07-11T083209Z.json"),
      runnerSummaryMarkdownPath: path.join(logsRoot, "summaries", "run-2026-07-11T083209Z.md"),
      reportPath: path.join(logsRoot, "summaries", "run-2026-07-11T083209Z.md"),
    };
    writeSupervisorState(runId, {
      state: "completed",
      runnerRunId: mapped.runnerRunId,
      runnerSummaryJsonPath: mapped.runnerSummaryJsonPath,
      runnerSummaryMarkdownPath: mapped.runnerSummaryMarkdownPath,
      reportPath: mapped.reportPath,
      reportResolution: mapped,
    }, logsRoot);
    writeHeartbeat(runId, buildHeartbeat({ runId, runnerRunId: mapped.runnerRunId, state: "completed", reportPath: mapped.reportPath, reportResolution: mapped }), logsRoot);
    let state = readSupervisorState(runId, logsRoot);
    let health = classifyHealth(state, { found: true, heartbeat: { state: "completed", terminal: true }, stale: false });
    assert.equal(health.status, "terminal_success");
    assert.equal(health.report.runnerRunId, mapped.runnerRunId);

    writeSupervisorState(runId, {
      state: "completed",
      reportPath: null,
      runnerRunId: null,
      runnerSummaryJsonPath: null,
      runnerSummaryMarkdownPath: null,
      reportResolution: null,
    }, logsRoot);
    state = readSupervisorState(runId, logsRoot);
    health = classifyHealth(state, { found: true, heartbeat: { state: "completed", terminal: true }, stale: false });
    assert.equal(health.status, "report_mapping_missing");
    assert.equal(health.exitCode, 2);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("supervisor terminal controls reject without state heartbeat or control mutation", () => {
  const terminalStates = ["completed", "partial", "blocked", "failed", "cancelled", "submission_failed", "stale"];
  const commands = ["pause", "stop-after-current", "extend"];
  for (const terminalState of terminalStates) {
    for (const command of commands) {
      const tempRoot = mkdtempSync(path.join(tmpdir(), `settleora-terminal-control-${terminalState}-${command}-`));
      const logsRoot = path.join(tempRoot, "logs");
      const runId = "supervised-20260711T083159Z-427681e96152";
      try {
        const mapped = mappedReport(logsRoot);
        writeSupervisorState(runId, {
          state: terminalState,
          runnerRunId: mapped.runnerRunId,
          runnerSummaryJsonPath: mapped.runnerSummaryJsonPath,
          runnerSummaryMarkdownPath: mapped.runnerSummaryMarkdownPath,
          reportPath: mapped.reportPath,
          reportResolution: mapped,
        }, logsRoot);
        writeHeartbeat(runId, buildHeartbeat({ runId, runnerRunId: mapped.runnerRunId, state: terminalState, reportPath: mapped.reportPath, reportResolution: mapped }), logsRoot);
        const stateBefore = fileSnapshot(readSupervisorState(runId, logsRoot).statePath);
        const heartbeatBefore = fileSnapshot(deriveSupervisorPaths({ runId, logsRoot }).artifactPath(runArtifactKinds.heartbeat));
        let controlWrites = 0;
        let stateWrites = 0;
        const result = controlSupervisorRun(runId, {
          command,
          maxTasksDelta: command === "extend" ? 2 : null,
          maxRuntimeDeltaMs: command === "extend" ? 3_600_000 : null,
        }, { logsRoot }, {
          getRunnerStatus: () => ({ active: false, activeRunId: null, supervisorRunId: null }),
          writeControlCommand: () => {
            controlWrites += 1;
            return { ok: true };
          },
          writeSupervisorState: () => {
            stateWrites += 1;
            return { state: {} };
          },
        });
        assert.equal(result.ok, false);
        assert.equal(result.exitCode, 1);
        assert.equal(result.reason, "terminal_run");
        assert.equal(result.lifecycleState, terminalState);
        assert.equal(result.runId, runId);
        assert.equal(controlWrites, 0);
        assert.equal(stateWrites, 0);
        assert.deepEqual(fileSnapshot(readSupervisorState(runId, logsRoot).statePath), stateBefore);
        assert.deepEqual(fileSnapshot(deriveSupervisorPaths({ runId, logsRoot }).artifactPath(runArtifactKinds.heartbeat)), heartbeatBefore);
        const state = readSupervisorState(runId, logsRoot);
        assert.equal(state.state.state, terminalState);
        assert.equal(state.state.runnerRunId, mapped.runnerRunId);
        assert.equal(state.state.reportPath, mapped.reportPath);
        const health = classifyHealth(state, { found: true, heartbeat: { state: terminalState, terminal: true }, stale: false });
        if (terminalState === "completed") assert.equal(health.status, "terminal_success");
        else assert.equal(health.status, "terminal_unhealthy");
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  }
});

test("supervisor control policy requires exact active runner correlation and fails closed", () => {
  const runId = "supervised-20260711T083159Z-427681e96152";
  assert.equal(evaluateSupervisorControlPolicy({
    supervisorRunId: runId,
    lifecycleState: "running",
    runnerStatus: { active: true, activeRunId: "run-a", supervisorRunId: runId },
    command: "pause",
  }).allowed, true);
  assert.equal(evaluateSupervisorControlPolicy({
    supervisorRunId: runId,
    lifecycleState: "running",
    runnerStatus: { active: true, activeRunId: "run-b", supervisorRunId: "supervised-20260711T083159Z-527681e96152" },
    command: "pause",
  }).reason, "active_runner_mismatch");
  assert.equal(evaluateSupervisorControlPolicy({
    supervisorRunId: runId,
    lifecycleState: "running",
    runnerStatus: { active: true, activeRunId: "run-foreground", supervisorRunId: null },
    command: "pause",
  }).reason, "active_runner_uncorrelated");
  assert.equal(evaluateSupervisorControlPolicy({
    supervisorRunId: runId,
    lifecycleState: "running",
    runnerStatus: { active: false, activeRunId: null, supervisorRunId: null },
    command: "pause",
  }).reason, "no_active_runner");
  assert.equal(evaluateSupervisorControlPolicy({
    supervisorRunId: runId,
    lifecycleState: "submitted",
    runnerStatus: { active: true, activeRunId: "run-a", supervisorRunId: runId },
    command: "pause",
  }).reason, "pre_active_run");
  assert.equal(evaluateSupervisorControlPolicy({
    supervisorRunId: runId,
    lifecycleState: "corrupt",
    runnerStatus: { active: true, activeRunId: "run-a", supervisorRunId: runId },
    command: "pause",
  }).reason, "unknown_supervisor_state");
});

test("supervisor accepted controls preserve lifecycle and record bounded lastControl metadata", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-accepted-control-"));
  const logsRoot = path.join(tempRoot, "logs");
  const runId = "supervised-20260711T083159Z-427681e96152";
  try {
    writeSupervisorState(runId, { state: "running", reportPath: "/workspace/logs/settleora-auto-runner/summaries/run-ok.md" }, logsRoot);
    const accepted = [];
    for (const cli of [
      { command: "pause", maxTasksDelta: null, maxRuntimeDeltaMs: null },
      { command: "stop-after-current", maxTasksDelta: null, maxRuntimeDeltaMs: null },
      { command: "extend", maxTasksDelta: 2, maxRuntimeDeltaMs: 3_600_000 },
    ]) {
      const result = controlSupervisorRun(runId, cli, { logsRoot }, {
        now: () => new Date("2026-07-11T15:30:00Z"),
        getRunnerStatus: () => ({ active: true, activeRunId: "run-2026-07-11T153000Z", supervisorRunId: runId }),
        writeControlCommand: (_config, args) => {
          accepted.push(args);
          return { ok: true, controlPath: "/workspace/logs/settleora-auto-runner/state/runner-control.json" };
        },
      });
      assert.equal(result.ok, true);
      assert.equal(result.accepted, true);
      assert.equal(result.reason, "active_runner_correlated");
      assert.equal(result.correlation.matched, true);
      const state = readSupervisorState(runId, logsRoot).state;
      assert.equal(state.state, "running");
      assert.equal(state.lastControl.command, cli.command);
      assert.equal(state.lastControl.status, "accepted");
      assert.equal(state.lastControl.requestedAt, "2026-07-11T15:30:00.000Z");
      assert.equal(state.lastControl.maxTasksDelta, cli.maxTasksDelta);
      assert.equal(state.lastControl.maxRuntimeDeltaMs, cli.maxRuntimeDeltaMs);
      assert.equal(state.lastControl.correlation.activeRunId, "run-2026-07-11T153000Z");
      assert.doesNotMatch(JSON.stringify(state.lastControl), /config|secret|token|authorization|GEMINI_API_KEY/i);
    }
    assert.deepEqual(accepted.map((item) => item.controlCommand), ["pause", "stop-after-current", "extend"]);
    assert.equal(accepted[2].maxIterationsExtension, 2);
    assert.equal(accepted[2].maxRuntimeExtensionMs, 3_600_000);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("supervisor controls do not write on rejection and handle stopping idempotency", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-rejected-control-"));
  const logsRoot = path.join(tempRoot, "logs");
  const runId = "supervised-20260711T083159Z-427681e96152";
  try {
    writeSupervisorState(runId, { state: "running" }, logsRoot);
    const stateBefore = fileSnapshot(readSupervisorState(runId, logsRoot).statePath);
    let writes = 0;
    const mismatch = controlSupervisorRun(runId, { command: "pause" }, { logsRoot }, {
      getRunnerStatus: () => ({ active: true, activeRunId: "run-other", supervisorRunId: "supervised-20260711T083159Z-527681e96152" }),
      writeControlCommand: () => {
        writes += 1;
        return { ok: true };
      },
      writeSupervisorState: () => {
        writes += 1;
        return { state: {} };
      },
    });
    assert.equal(mismatch.reason, "active_runner_mismatch");
    assert.equal(writes, 0);
    assert.deepEqual(fileSnapshot(readSupervisorState(runId, logsRoot).statePath), stateBefore);

    writeSupervisorState(runId, { state: "stopping_after_current" }, logsRoot);
    const stoppingBefore = fileSnapshot(readSupervisorState(runId, logsRoot).statePath);
    const repeatedStop = controlSupervisorRun(runId, { command: "stop-after-current" }, { logsRoot }, {
      getRunnerStatus: () => ({ active: true, activeRunId: "run-a", supervisorRunId: runId }),
      writeControlCommand: () => {
        writes += 1;
        return { ok: true };
      },
      writeSupervisorState: () => {
        writes += 1;
        return { state: {} };
      },
    });
    assert.equal(repeatedStop.ok, true);
    assert.equal(repeatedStop.idempotent, true);
    assert.equal(repeatedStop.reason, "already_stopping");
    assert.deepEqual(fileSnapshot(readSupervisorState(runId, logsRoot).statePath), stoppingBefore);
    const pauseStopping = controlSupervisorRun(runId, { command: "pause" }, { logsRoot }, {
      getRunnerStatus: () => ({ active: true, activeRunId: "run-a", supervisorRunId: runId }),
    });
    assert.equal(pauseStopping.ok, false);
    assert.equal(pauseStopping.reason, "already_stopping");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("supervisor control write race preserves lifecycle and records bounded failure", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-control-race-"));
  const logsRoot = path.join(tempRoot, "logs");
  const runId = "supervised-20260711T083159Z-427681e96152";
  try {
    writeSupervisorState(runId, { state: "running" }, logsRoot);
    const result = controlSupervisorRun(runId, { command: "extend", maxTasksDelta: 1, maxRuntimeDeltaMs: 60_000 }, { logsRoot }, {
      now: () => new Date("2026-07-11T15:40:00Z"),
      getRunnerStatus: () => ({ active: true, activeRunId: "run-race", supervisorRunId: runId }),
      writeControlCommand: () => ({ ok: false, reason: "no_active_runner" }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "no_active_runner");
    const state = readSupervisorState(runId, logsRoot).state;
    assert.equal(state.state, "running");
    assert.equal(state.lastControl.command, "extend");
    assert.equal(state.lastControl.status, "failed");
    assert.equal(state.lastControl.reason, "no_active_runner");
    assert.equal(state.lastControl.maxTasksDelta, 1);
    assert.equal(state.lastControl.maxRuntimeDeltaMs, 60_000);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("systemd start failure records no foreground fallback shape", () => {
  const runId = generateRunId();
  const calls = [];
  const result = startUserUnit(runId, {
    configPath: "/workspace/logs/configs/default.json",
    repoRoot: "/workspace/repos/Settleora",
    logsRoot: "/workspace/logs/settleora-auto-runner",
    runner: (cmd, args) => {
      calls.push([cmd, ...args]);
      return { status: 1, stderr: "boom" };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, "submission_failed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "systemctl");
});

test("systemd start verifies the installed exact ExecStart before activation", () => {
  const runId = generateRunId();
  const options = {
    configPath: "/workspace/logs/configs/default.json",
    repoRoot: "/workspace/repos/Settleora",
    logsRoot: "/workspace/logs/settleora-auto-runner",
  };
  const plan = buildSystemdStartPlan(runId, options);
  const calls = [];
  const result = startUserUnit(runId, {
    ...options,
    runner: (cmd, args) => {
      calls.push([cmd, ...args]);
      if (args.includes("cat")) {
        return { status: 0, stdout: `# /home/runner/.config/systemd/user/settleora-auto-runner@.service\n${plan.unitTemplate}` };
      }
      if (args.includes("--property=ExecStart")) {
        return { status: 0, stdout: `{ path=/usr/bin/env ; argv[]=${plan.expectedExecArgv.join(" ")} ; ignore_errors=no ; }\n` };
      }
      if (args.includes("is-active")) return { status: 0, stdout: "active\n" };
      return { status: 0, stdout: "" };
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[3], plan.startArgv);
  const refused = startUserUnit(runId, {
    ...options,
    runner: () => ({ status: 0, stdout: `${plan.unitTemplate}\n# /home/runner/.config/systemd/user/settleora-auto-runner@.service.d/override.conf\n[Service]\nEnvironment=NODE_OPTIONS=--import=evil\n` }),
  });
  assert.equal(refused.ok, false);
  assert.match(refused.stderr, /identity mismatch/);
});

test("heartbeat defaults, stale detection, terminal state, and sanitization", () => {
  const runId = generateRunId();
  const hb = buildHeartbeat({ runId, runnerRunId: "run-2026-07-20T144500Z", state: "running", maxTasks: 1, maxRuntime: "3h" });
  assert.equal(hb.heartbeatIntervalSeconds, 60);
  assert.equal(hb.heartbeatLeaseSeconds, 300);
  assert.equal(hb.terminal, false);
  assert.equal(isHeartbeatStale({ ...hb, leaseExpiresAt: "2020-01-01T00:00:00Z" }, new Date("2026-01-01T00:00:00Z")), true);
  assert.equal(isHeartbeatStale({ ...hb, state: "completed", terminal: true, leaseExpiresAt: "2020-01-01T00:00:00Z" }), false);
  const sanitized = sanitizeMonitoringPayload({ runId, webhookUrl: "https://secret.example/hook", token: "abc", body: "ok" });
  assert.equal(sanitized.webhookUrl, "[redacted]");
  assert.equal(sanitized.token, "[redacted]");
  assert.equal(sanitized.body, "[redacted]");
});

test("heartbeat persistence requires exact runner identity for active and terminal writes", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-heartbeat-identity-"));
  const runId = generateRunId(new Date("2026-07-20T14:45:00Z"));
  try {
    const legacyActive = buildHeartbeat({ runId, state: "running", maxTasks: 1, maxRuntime: "3h" });
    assert.throws(() => writeHeartbeat(runId, legacyActive, logsRoot), /Invalid runner run ID/);
    const terminalLegacy = buildHeartbeat({ runId, state: "completed", maxTasks: 1, maxRuntime: "3h" });
    assert.throws(() => writeHeartbeat(runId, terminalLegacy, logsRoot), /Invalid runner run ID/);
  } finally {
    rmSync(logsRoot, { recursive: true, force: true });
  }
});

test("monitoring outbox is local, owner-only, closed-event, and nonfatal", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "settleora-outbox-"));
  const logsRoot = path.join(tempRoot, "settleora-auto-runner");
  const runId = generateRunId();
  for (const eventName of ["blocked", "cancelled", "completed", "failed", "heartbeat", "partial", "started", "submitted"]) {
    assert.equal(monitoringEvents.has(eventName), true, eventName);
  }
  for (const eventName of ["prolonged_outage_detected", "outage_resubmission_planned", "outage_uncertain_submission"]) {
    assert.equal(monitoringEvents.has(eventName), true, eventName);
  }
  const result = recordMonitoringEvent("heartbeat", {
    runId,
    state: "running",
    token: "secret",
    fullIssueBody: "x".repeat(1100),
    configPath: "/workspace/logs/settleora-auto-runner/configs/profiles/example/config.json",
  }, { logsRoot });
  assert.equal(result.ok, true);
  const paths = deriveSupervisorPaths({ runId, logsRoot });
  assert.equal(result.path.endsWith("/monitoring-events.jsonl"), true);
  assert.equal(result.path.includes(runId), false);
  const text = readFileSync(result.path, "utf8");
  assert.match(text, /"event":"heartbeat"/);
  assert.doesNotMatch(text, /secret/);
  assert.doesNotMatch(text, /config\.json/);
  assert.equal(paths.artifactPath(runArtifactKinds.monitoringEvents).includes(runId), false);
  assert.throws(() => recordMonitoringEvent("operator-event", { runId }, { logsRoot }), /Unsupported monitoring event/);
});

test("operator CLI dry-run has no durable supervisor side effects and renders expected plan", () => {
  const before = snapshotSupervisorFiles();
  const result = spawnSync(process.execPath, [
    "tools/auto-runner/settleora-auto-runnerctl.mjs",
    "submit",
    "--dry-run",
    "--profile",
    "default",
    "--max-tasks",
    "8",
    "--max-runtime",
    "8h",
    "--json",
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.maxTasks, 8);
  assert.equal(parsed.maxRuntime, "8h");
  assert.equal(parsed.runnerArgv.includes("--max-iterations"), true);
  assert.equal(parsed.runnerArgv.includes("--config"), true);
  assert.equal(parsed.spec.profile, "default");
  assert.equal("runnerConfigPath" in parsed.spec, false);
  assert.equal(parsed.specPath.includes(parsed.runId), false);
  assert.equal(parsed.statePath.includes(parsed.runId), false);
  assert.equal(parsed.unitName, `settleora-auto-runner@${parsed.runId}.service`);
  assert.deepEqual(snapshotSupervisorFiles(), before);
});

test("operator CLI bounds extensions and refuses unknown supervisor run control", () => {
  const oversizedTasks = spawnSync(process.execPath, [
    "tools/auto-runner/settleora-auto-runnerctl.mjs",
    "extend",
    "--run",
    "supervised-20260711T063151Z-066b80f4fc16",
    "--max-tasks",
    "+999999",
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.notEqual(oversizedTasks.status, 0);
  assert.match(oversizedTasks.stderr, /\+1 and \+500/);

  const oversizedRuntime = spawnSync(process.execPath, [
    "tools/auto-runner/settleora-auto-runnerctl.mjs",
    "extend",
    "--run",
    "supervised-20260711T063151Z-066b80f4fc16",
    "--max-runtime",
    "+999d",
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.notEqual(oversizedRuntime.status, 0);
  assert.match(oversizedRuntime.stderr, /\+1m and \+14d/);

  const unknownRun = spawnSync(process.execPath, [
    "tools/auto-runner/settleora-auto-runnerctl.mjs",
    "pause",
    "--run",
    "supervised-20260711T063151Z-066b80f4fc16",
    "--json",
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(unknownRun.status, 2);
  const parsed = JSON.parse(unknownRun.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "unknown_run");
});

test("systemd template is fixed, no restart, no enablement, and no embedded secrets", () => {
  const text = readFileSync("tools/auto-runner/systemd/settleora-auto-runner@.service", "utf8");
  assert.match(text, /Type=exec/);
  assert.match(text, /WorkingDirectory=\/workspace\/repos\/Settleora/);
  assert.match(text, /Restart=no/);
  assert.match(text, /SendSIGKILL=no/);
  assert.doesNotMatch(text, /WantedBy=/);
  assert.doesNotMatch(text, /API_KEY|TOKEN|WEBHOOK/);
});

test("Windows templates keep fixed remote entrypoint and no hard-coded user/IP/secrets", () => {
  for (const file of [
    "tools/auto-runner/windows/Start-SettleoraAutoRun.ps1",
    "tools/auto-runner/windows/Get-SettleoraAutoRunStatus.ps1",
    "tools/auto-runner/windows/Get-SettleoraAutoRunReport.ps1",
    "tools/auto-runner/windows/Stop-SettleoraAutoRun.ps1",
  ]) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /ssh\.exe/);
    assert.match(text, /SETTLEORA_DEVBOX_SSH_TARGET/);
    assert.match(text, /\/workspace\/repos\/Settleora/);
    assert.match(text, /settleora-auto-runnerctl\.mjs/);
    assert.doesNotMatch(text, /\d+\.\d+\.\d+\.\d+/);
    assert.doesNotMatch(text, /password|token|keypath/i);
  }
  const start = readFileSync("tools/auto-runner/windows/Start-SettleoraAutoRun.ps1", "utf8");
  assert.match(start, /\[int\]\$MaxTasks = 1/);
  assert.match(start, /\[string\]\$MaxRuntime = "3h"/);
  assert.match(start, /\[string\]\$Profile = "default"/);
});

test("supervisor core has no network delivery or raw-path regression shapes", () => {
  const files = [
    "tools/auto-runner/settleora-auto-runnerctl.mjs",
    "tools/auto-runner/supervisor/heartbeat.mjs",
    "tools/auto-runner/supervisor/monitoring-outbox.mjs",
    "tools/auto-runner/supervisor/run-spec.mjs",
    "tools/auto-runner/supervisor/runner-summary-resolver.mjs",
    "tools/auto-runner/supervisor/settleora-auto-runner-worker.mjs",
    "tools/auto-runner/supervisor/supervisor-paths.mjs",
    "tools/auto-runner/supervisor/supervisor-state.mjs",
    "tools/auto-runner/supervisor/systemd-client.mjs",
  ];
  const joined = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(joined, /\bfetch\s*\(/);
  assert.doesNotMatch(joined, /node:(http|https|net|dns)|from\s+["']node:(http|https|net|dns)/);
  assert.doesNotMatch(joined, /SETTLEORA_(HEARTBEAT|NOTIFICATION|ALLOW_LAN_HTTP)/);
  assert.doesNotMatch(joined, /atomicWriteJson\s*\(\s*filePath/);
  assert.doesNotMatch(joined, /runnerConfigPath"\s*,/);
  assert.doesNotMatch(joined, /\$\{name\}\.json/);
  assert.doesNotMatch(joined, /path\.join\([^)]*runId[^)]*\)/);
  assert.doesNotMatch(joined, /\bfileName\b/);
  assert.doesNotMatch(joined, /newestSummaryPath|mtime|birthtime/);
});

test("terminal heartbeat preserves start time and monotonic generation", () => {
  const worker = readFileSync("tools/auto-runner/supervisor/settleora-auto-runner-worker.mjs", "utf8");
  assert.match(worker, /const terminalHeartbeat = buildHeartbeat\(\{[\s\S]*?startedAt: statePatch\.startedAt,[\s\S]*?heartbeatGeneration,[\s\S]*?\}\);/);
});

function snapshotSupervisorFiles() {
  const root = "/workspace/logs/settleora-auto-runner/supervisor";
  const result = spawnSync("find", [root, "-type", "f"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).sort();
}

function fileSnapshot(filePath) {
  const stat = statSync(filePath);
  const content = readFileSync(filePath);
  return {
    sha256: createHash("sha256").update(content).digest("hex"),
    mtimeMs: stat.mtimeMs,
    content: content.toString("utf8"),
  };
}

function mappedReport(logsRoot) {
  return {
    status: "matched",
    ok: true,
    runnerRunId: "run-2026-07-11T083209Z",
    runnerSummaryJsonPath: path.join(logsRoot, "summaries", "run-2026-07-11T083209Z.json"),
    runnerSummaryMarkdownPath: path.join(logsRoot, "summaries", "run-2026-07-11T083209Z.md"),
    reportPath: path.join(logsRoot, "summaries", "run-2026-07-11T083209Z.md"),
  };
}

function writeSummaryPair(logsRoot, summary) {
  const runId = summary.fileRunId || summary.runId;
  writeSummaryJson(logsRoot, summary);
  writeFileSync(path.join(logsRoot, "summaries", `${runId}.md`), `# Summary\n\n- Run ID: \`${summary.runId}\`\n`, { mode: 0o600 });
}

function writeSummaryJson(logsRoot, summary) {
  const runId = summary.fileRunId || summary.runId;
  writeFileSync(
    path.join(logsRoot, "summaries", `${runId}.json`),
    `${JSON.stringify({
      runId: summary.runId,
      supervisorRunId: summary.supervisorRunId,
      mode: summary.mode,
      startedAt: summary.startedAt ?? "2026-07-11T08:32:09.378Z",
      finishedAt: summary.finishedAt === undefined ? "2026-07-11T08:32:10.847Z" : summary.finishedAt,
      baseOriginMainSha: summary.baseOriginMainSha,
      iterations: summary.iterations || [],
      stopReason: summary.stopReason || "no-eligible-work",
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
}
