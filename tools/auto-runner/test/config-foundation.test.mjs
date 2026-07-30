import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, chownSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  canonicalizeChangedFiles,
  defaultLogsRoot,
  digestChangedFiles,
  loadConfig,
  normalizePrStackExecutionConfig,
  parseCliArgs,
  validateRecoveryOnlyExistingPrTarget,
  validateRecoveryOnlyExactHeadEvidence,
} from "../lib/config.mjs";

test("PR stack execution preserves bounded live-runner controls", () => {
  const normalized = normalizePrStackExecutionConfig({
    maxDispatchActions: 1,
    runnerTimeoutMs: 120000,
    runnerMaxOutputBytes: 1048576,
  });
  assert.equal(normalized.maxDispatchActions, 1);
  assert.equal(normalized.runnerTimeoutMs, 120000);
  assert.equal(normalized.runnerMaxOutputBytes, 1048576);
  assert.throws(() => normalizePrStackExecutionConfig({ runnerMaxOutputBytes: 1048577 }), /between 1024 and 1048576/);
});

function withProfile(profile, fn) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-config-foundation-"));
  const configPath = path.join(logsRoot, "runner-config.json");
  writeFileSync(configPath, `${JSON.stringify({ logsRoot, ...profile }, null, 2)}\n`, { mode: 0o600 });
  try {
    return fn({ logsRoot, configPath });
  } finally {
    rmSync(logsRoot, { recursive: true, force: true });
  }
}

test("disabled outage resubmission profile loads without trusted controller capability", () => {
  withProfile({ outageResubmission: { allowBoundedOutageResubmission: false } }, ({ configPath }) => {
    const config = loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) });
    assert.equal(config.outageResubmission.allowBoundedOutageResubmission, false);
  });
});

test("development supervisor config digest uses the exact loaded profile bytes", () => {
  withProfile({}, ({ configPath }) => {
    const expectedConfigSha256 = createHash("sha256").update(readFileSync(configPath)).digest("hex");
    const config = loadConfig({
      ...parseCliArgs(["--run", "--supervisor-run-id", "supervised-20260711T083159Z-427681e96152"]),
      configPath,
      expectedConfigSha256,
    });
    assert.equal(config.configTrustEvidence.trustMode, "development");
    assert.equal(config.configTrustEvidence.sha256, expectedConfigSha256);
    assert.throws(
      () => loadConfig({
        ...parseCliArgs(["--run", "--supervisor-run-id", "supervised-20260711T083159Z-427681e96152"]),
        configPath,
        expectedConfigSha256: "0".repeat(64),
      }),
      /digest does not match/,
    );
  });
});

test("enabled outage resubmission profile requires trusted controller capability", () => {
  withProfile({ outageResubmission: { allowBoundedOutageResubmission: true } }, ({ configPath }) => {
    assert.throws(
      () => loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) }),
      /Bounded outage resubmission requires trusted controller capability\./,
    );
    assert.throws(
      () => loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) }, { outageResubmissionControllerAvailable: false }),
      /Bounded outage resubmission requires trusted controller capability\./,
    );

    const config = loadConfig(
      { ...parseCliArgs(["--preflight", "--config", configPath]) },
      { outageResubmissionControllerAvailable: true },
    );
    assert.equal(config.outageResubmission.allowBoundedOutageResubmission, true);
  });
});

test("external profile cannot spoof trusted outage controller capability", () => {
  withProfile(
    {
      outageResubmissionControllerAvailable: true,
      trustedCapabilities: { outageResubmissionControllerAvailable: true },
      outageResubmission: { allowBoundedOutageResubmission: true },
    },
    ({ configPath }) => {
      assert.throws(
        () => loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) }),
        /Bounded outage resubmission requires trusted controller capability\./,
      );
    },
  );
});

test("trusted outage controller capability alone does not enable bounded resubmission", () => {
  withProfile({ outageResubmission: { allowBoundedOutageResubmission: false } }, ({ configPath }) => {
    const config = loadConfig(
      { ...parseCliArgs(["--preflight", "--config", configPath]) },
      { outageResubmissionControllerAvailable: true },
    );
    assert.equal(config.outageResubmission.allowBoundedOutageResubmission, false);
  });
});

test("environment and CLI do not grant trusted outage controller capability", () => {
  withProfile({ outageResubmission: { allowBoundedOutageResubmission: true } }, ({ configPath }) => {
    const previous = process.env.OUTAGE_RESUBMISSION_CONTROLLER_AVAILABLE;
    process.env.OUTAGE_RESUBMISSION_CONTROLLER_AVAILABLE = "true";
    try {
      assert.throws(
        () => loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) }),
        /Bounded outage resubmission requires trusted controller capability\./,
      );
      assert.throws(() => parseCliArgs(["--preflight", "--outage-resubmission-controller-available"]), /Unknown argument/);
    } finally {
      if (previous === undefined) {
        delete process.env.OUTAGE_RESUBMISSION_CONTROLLER_AVAILABLE;
      } else {
        process.env.OUTAGE_RESUBMISSION_CONTROLLER_AVAILABLE = previous;
      }
    }
  });
});

test("malformed outage resubmission profile remains rejected by policy normalization", () => {
  withProfile({ outageResubmission: { minimumOutageAgeMs: "bad" } }, ({ configPath }) => {
    assert.throws(
      () => loadConfig({ ...parseCliArgs(["--preflight", "--config", configPath]) }),
      /minimumOutageAgeMs must be an integer/,
    );
  });
});

test("PR B config parser owns targeted recovery CLI without granting outage controller capability", () => {
  const args = [
    "--run",
    "--supervisor-run-id",
    "supervised-20260716T120000Z-abcdefabcdef",
    "--outage-recovery-only",
    "--outage-target-task-key",
    "20260716-1428",
    "--outage-target-issue",
    "913",
    "--outage-target-branch",
    "feature/auto-913-targeted-recovery-child-supervisor-20260716-1213",
    "--outage-target-base-sha",
    "3b3212c43c702db3cabdaff1c28d089f39c54441",
    "--outage-target-head-sha",
    "ecd314629ac5a07cc40abdfaac1d12a1d3b13335",
    "--outage-target-pr",
    "919",
    "--outage-target-pr-head-sha",
    "ecd314629ac5a07cc40abdfaac1d12a1d3b13335",
    "--outage-target-runner-run-id",
    "run-2026-07-16T120000Z",
    "--outage-target-supervisor-run-id",
    "supervised-20260716T120000Z-abcdefabcdef",
    "--outage-target-original-spec-digest",
    "a".repeat(64),
    "--outage-target-marker-key",
    "b".repeat(64),
    "--outage-target-fingerprint",
    "c".repeat(64),
    "--outage-target-attempt",
    "1",
  ];
  const parsed = parseCliArgs(args);
  assert.equal(parsed.outageRecoveryOnly, true);
  assert.equal(parsed.maxIterations, 1);

  const config = loadConfig({ ...parsed, configPath: null });
  assert.equal(config.outageRecoveryOnly, true);
  assert.equal(config.requestedMaxIterations, 1);
  assert.equal(config.outageRecoveryTarget.issueNumber, 913);
  assert.equal(config.outageResubmission.allowBoundedOutageResubmission, false);

  const without = (...options) => args.filter((value, index) => {
    const previous = args[index - 1];
    return !options.includes(value) && !options.includes(previous);
  });
  assert.throws(() => parseCliArgs(without("--outage-target-pr", "--outage-target-pr-head-sha")), /requires PR number\/head SHA/);
  assert.throws(() => parseCliArgs(without("--outage-target-pr")), /must be paired/);
  assert.throws(() => parseCliArgs(without("--outage-target-pr-head-sha")), /must be paired/);
  const terminalDerivative = parseCliArgs([
    ...without(
      "--outage-target-pr",
      "--outage-target-pr-head-sha",
      "--outage-target-original-spec-digest",
      "--outage-target-marker-key",
      "--outage-target-fingerprint",
      "--outage-target-attempt",
    ),
    "--outage-target-terminal-validation-retry-derivative",
  ]);
  assert.equal(terminalDerivative.outageRecoveryTarget.terminalValidationRetryDerivativeNoPr, true);
  assert.equal(terminalDerivative.outageRecoveryTarget.prNumber, null);
  assert.equal(terminalDerivative.outageRecoveryTarget.prHeadSha, null);
  assert.throws(
    () => loadConfig({
      ...parsed,
      outageRecoveryTarget: { ...parsed.outageRecoveryTarget, prNumber: null, prHeadSha: null },
      configPath: null,
    }),
    /requires PR number\/head SHA/,
  );
});

test("recovery-only existing PR config must match authoritative target pair", () => {
  const target = {
    taskKey: "20260716-1428",
    issueNumber: 913,
    branchName: "feature/auto-913-targeted-recovery-child-supervisor-20260716-1213",
    baseSha: "a".repeat(40),
    currentHeadSha: "b".repeat(40),
    prNumber: 919,
    prHeadSha: "b".repeat(40),
    runnerRunId: "run-2026-07-16T120000Z",
    supervisorRunId: "supervised-20260716T120000Z-abcdefabcdef",
    originalSupervisorSpecDigest: "c".repeat(64),
    markerKey: "d".repeat(64),
    outageFingerprint: "e".repeat(64),
    attemptNumber: 1,
  };
  const config = { outageRecoveryOnly: true, outageRecoveryTarget: target };
  assert.deepEqual(validateRecoveryOnlyExistingPrTarget(config, { prNumber: 919, expectedHeadSha: "b".repeat(40) }), { ok: true });
  assert.deepEqual(validateRecoveryOnlyExistingPrTarget(config, { prNumber: 919, exactHeadEvidence: { headSha: "b".repeat(40) } }), { ok: true });
  assert.equal(validateRecoveryOnlyExistingPrTarget(config, { prNumber: 920, expectedHeadSha: "b".repeat(40) }).reason, "outage_recovery_existing_pr_target_mismatch");
  assert.equal(validateRecoveryOnlyExistingPrTarget(config, { prNumber: 919, expectedHeadSha: "f".repeat(40) }).reason, "outage_recovery_existing_pr_target_mismatch");
  assert.equal(validateRecoveryOnlyExistingPrTarget(config, { prUrl: "https://example.invalid/pull/919", expectedHeadSha: "b".repeat(40) }).reason, "outage_recovery_existing_pr_target_mismatch");
  assert.equal(validateRecoveryOnlyExistingPrTarget({ outageRecoveryOnly: true, outageRecoveryTarget: { ...target, prNumber: null, prHeadSha: null } }, { prNumber: 919, expectedHeadSha: "b".repeat(40) }).reason, "outage_recovery_existing_pr_target_missing");
  assert.deepEqual(validateRecoveryOnlyExistingPrTarget({ outageRecoveryOnly: false }, { prUrl: "https://example.invalid/pull/919" }), { ok: true });
});

test("recovery-only exact-head evidence must be complete and bound before generation", () => {
  const target = {
    taskKey: "20260716-2158",
    issueNumber: 913,
    branchName: "feature/auto-913-targeted-recovery-child-supervisor-20260716-1213",
    baseSha: "a".repeat(40),
    currentHeadSha: "b".repeat(40),
    prNumber: 919,
    prHeadSha: "b".repeat(40),
    runnerRunId: "run-2026-07-16T120000Z",
    supervisorRunId: "supervised-20260716T120000Z-abcdefabcdef",
    originalSupervisorSpecDigest: "c".repeat(64),
    markerKey: "d".repeat(64),
    outageFingerprint: "e".repeat(64),
    attemptNumber: 1,
  };
  const changedFiles = ["tools/auto-runner/test/config-foundation.test.mjs", "tools/auto-runner/settleora-auto-runner.mjs"];
  const canonicalChangedFiles = canonicalizeChangedFiles(changedFiles);
  const digest = digestChangedFiles(changedFiles);
  const exactHeadEvidence = {
    repositorySlug: "tommytang213/Settleora",
    issueNumber: target.issueNumber,
    headSha: target.prHeadSha,
    prNumber: target.prNumber,
    baseSha: target.baseSha,
    taskKey: target.taskKey,
    runnerRunId: target.runnerRunId,
    supervisorRunId: target.supervisorRunId,
    changedFiles: canonicalChangedFiles,
    validationPassed: true,
    validationResults: [{ command: "node --test tools/auto-runner/test/auto-runner.test.mjs", status: 0 }],
    validationCompletedAt: "2026-07-16T12:00:00.000Z",
    changedFilesDigest: digest,
    geminiPass: true,
    geminiHeadSha: target.prHeadSha,
    geminiChangedFiles: changedFiles,
    geminiChangedFilesDigest: digest,
    geminiProvider: "gemini",
    geminiTier: "cheap_independent",
    geminiCompletedAt: "2026-07-16T12:01:00.000Z",
    codexMechanicsApproved: true,
    codexMechanicsHeadSha: target.prHeadSha,
    codexMechanicsChangedFiles: changedFiles,
    codexMechanicsChangedFilesDigest: digest,
    codexMechanicsCompletedAt: "2026-07-16T12:02:00.000Z",
  };
  const config = { outageRecoveryOnly: true, outageRecoveryTarget: target };
  assert.deepEqual(
    validateRecoveryOnlyExactHeadEvidence(config, { prNumber: 919, expectedHeadSha: target.prHeadSha, exactHeadEvidence }, { expectedHeadSha: target.prHeadSha, changedFiles }),
    { ok: true },
  );
  const advancedMainSha = "c".repeat(40);
  assert.deepEqual(
    validateRecoveryOnlyExactHeadEvidence(
      config,
      {
        prNumber: 919,
        expectedHeadSha: target.prHeadSha,
        expectedOriginMainSha: advancedMainSha,
        exactHeadEvidence: { ...exactHeadEvidence, currentMainSha: advancedMainSha },
      },
      { expectedHeadSha: target.prHeadSha, changedFiles },
    ),
    { ok: true },
  );
  for (const currentMainSha of [undefined, target.baseSha, "d".repeat(40)]) {
    const result = validateRecoveryOnlyExactHeadEvidence(
      config,
      {
        prNumber: 919,
        expectedHeadSha: target.prHeadSha,
        expectedOriginMainSha: advancedMainSha,
        exactHeadEvidence: { ...exactHeadEvidence, currentMainSha },
      },
      { expectedHeadSha: target.prHeadSha, changedFiles },
    );
    assert.equal(result.ok, false, `advanced main evidence ${currentMainSha || "missing"}`);
  }
  for (const [name, evidence] of [
    ["omitted", undefined],
    ["explicit null", null],
    ["malformed", "not-object"],
    ["missing validation", { ...exactHeadEvidence, validationPassed: false }],
    ["missing gemini files", { ...exactHeadEvidence, geminiChangedFiles: undefined }],
    ["missing codex approval", { ...exactHeadEvidence, codexMechanicsApproved: false }],
    ["wrong head", { ...exactHeadEvidence, headSha: "f".repeat(40) }],
    ["wrong repository", { ...exactHeadEvidence, repositorySlug: "other/repository" }],
    ["wrong issue", { ...exactHeadEvidence, issueNumber: 914 }],
    ["wrong PR", { ...exactHeadEvidence, prNumber: 920 }],
    ["wrong base", { ...exactHeadEvidence, baseSha: "f".repeat(40) }],
    ["wrong task", { ...exactHeadEvidence, taskKey: "other-task" }],
    ["missing runner", { ...exactHeadEvidence, runnerRunId: undefined }],
    ["missing supervisor", { ...exactHeadEvidence, supervisorRunId: undefined }],
    ["null runner", { ...exactHeadEvidence, runnerRunId: null }],
    ["null supervisor", { ...exactHeadEvidence, supervisorRunId: null }],
    ["malformed runner", { ...exactHeadEvidence, runnerRunId: "run-not-valid" }],
    ["malformed supervisor", { ...exactHeadEvidence, supervisorRunId: "supervised-not-valid" }],
    ["stale digest", { ...exactHeadEvidence, changedFilesDigest: "f".repeat(64) }],
    ["legacy newline digest", {
      ...exactHeadEvidence,
      changedFilesDigest: legacySha256Strings(changedFiles),
      geminiChangedFilesDigest: legacySha256Strings(changedFiles),
      codexMechanicsChangedFilesDigest: legacySha256Strings(changedFiles),
    }],
    ["duplicate changed file", { ...exactHeadEvidence, changedFiles: [canonicalChangedFiles[0], canonicalChangedFiles[0]] }],
    ["empty changed file", { ...exactHeadEvidence, changedFiles: [""] }],
    ["absolute changed file", { ...exactHeadEvidence, changedFiles: ["/tmp/file.mjs"] }],
    ["traversal changed file", { ...exactHeadEvidence, changedFiles: ["tools/../secret.mjs"] }],
    ["wrong supervisor", { ...exactHeadEvidence, supervisorRunId: "supervised-20260716T130000Z-abcdefabcdef" }],
    ["swapped IDs", { ...exactHeadEvidence, runnerRunId: target.supervisorRunId, supervisorRunId: target.runnerRunId }],
    ["foreign run", { ...exactHeadEvidence, runnerRunId: "run-2026-07-16T130000Z" }],
  ]) {
    const result = validateRecoveryOnlyExactHeadEvidence(
      config,
      { prNumber: 919, expectedHeadSha: target.prHeadSha, exactHeadEvidence: evidence },
      { expectedHeadSha: target.prHeadSha, changedFiles },
    );
    assert.equal(result.ok, false, name);
    assert.match(result.reason, /^outage_recovery_exact_head_evidence_/);
  }
  assert.deepEqual(
    validateRecoveryOnlyExactHeadEvidence(
      config,
      {
        prNumber: 919,
        expectedHeadSha: target.prHeadSha,
        exactHeadEvidence: {
          ...exactHeadEvidence,
          changedFiles: [...canonicalChangedFiles].reverse(),
          geminiChangedFiles: [...canonicalChangedFiles].reverse(),
          codexMechanicsChangedFiles: [...canonicalChangedFiles].reverse(),
        },
      },
      { expectedHeadSha: target.prHeadSha, changedFiles: [...changedFiles].reverse() },
    ),
    { ok: true },
  );
  const rebuildEvidence = {
    repositorySlug: exactHeadEvidence.repositorySlug,
    issueNumber: exactHeadEvidence.issueNumber,
    prNumber: exactHeadEvidence.prNumber,
    baseSha: exactHeadEvidence.baseSha,
    currentMainSha: exactHeadEvidence.currentMainSha,
    taskKey: exactHeadEvidence.taskKey,
    runnerRunId: exactHeadEvidence.runnerRunId,
    supervisorRunId: exactHeadEvidence.supervisorRunId,
    headSha: exactHeadEvidence.headSha,
    changedFiles: exactHeadEvidence.changedFiles,
    changedFilesDigest: exactHeadEvidence.changedFilesDigest,
    recoveryStateRebuildable: true,
  };
  assert.deepEqual(validateRecoveryOnlyExactHeadEvidence(
    config,
    { prNumber: 919, expectedHeadSha: target.prHeadSha, exactHeadEvidence: rebuildEvidence },
    { expectedHeadSha: target.prHeadSha, changedFiles, allowRebuild: true },
  ), { ok: true, rebuildRequired: true });
  for (const [name, mutate] of [
    ["rebuild not authorized", (value) => { value.recoveryStateRebuildable = false; }],
    ["wrong rebuild PR", (value) => { value.prNumber = 920; }],
    ["wrong rebuild head", (value) => { value.headSha = "f".repeat(40); }],
    ["wrong rebuild digest", (value) => { value.changedFilesDigest = "f".repeat(64); }],
  ]) {
    const adjacent = structuredClone(rebuildEvidence);
    mutate(adjacent);
    const result = validateRecoveryOnlyExactHeadEvidence(
      config,
      { prNumber: 919, expectedHeadSha: target.prHeadSha, exactHeadEvidence: adjacent },
      { expectedHeadSha: target.prHeadSha, changedFiles, allowRebuild: true },
    );
    assert.equal(result.ok, false, name);
  }
  assert.deepEqual(validateRecoveryOnlyExactHeadEvidence({ outageRecoveryOnly: false }, { exactHeadEvidence: null }), { ok: true });
});

test("canonical changed-files digest uses JSON array and rejects newline legacy digest", () => {
  const files = ["b/path.mjs", "a/path.mjs"];
  const canonical = digestChangedFiles(files);
  assert.equal(canonical, createHash("sha256").update(JSON.stringify(["a/path.mjs", "b/path.mjs"])).digest("hex"));
  assert.notEqual(canonical, legacySha256Strings(files));
});

test("canonical changed-files list normalizes separators sorts and rejects unsafe entries", () => {
  assert.deepEqual(canonicalizeChangedFiles(["tools\\auto-runner\\b.mjs", "tools/auto-runner/a.mjs"]), [
    "tools/auto-runner/a.mjs",
    "tools/auto-runner/b.mjs",
  ]);
  for (const files of [
    ["tools/auto-runner/a.mjs", "tools/auto-runner/a.mjs"],
    [""],
    ["/tmp/a.mjs"],
    ["C:\\tmp\\a.mjs"],
    ["tools/../a.mjs"],
    ["tools//a.mjs"],
  ]) {
    assert.throws(() => canonicalizeChangedFiles(files));
  }
});

test("recovery-only exact evidence rejects copied packages with missing or wrong run identities", () => {
  const target = recoveryOnlyTargetFixture();
  const changedFiles = ["tools/auto-runner/lib/config.mjs"];
  const evidence = exactHeadEvidenceFixture(target, changedFiles);
  const config = { outageRecoveryOnly: true, outageRecoveryTarget: target };
  for (const patch of [
    { runnerRunId: undefined },
    { supervisorRunId: undefined },
    { runnerRunId: null },
    { supervisorRunId: null },
    { runnerRunId: "run-2026-07-16T130000Z" },
    { supervisorRunId: "supervised-20260716T130000Z-abcdefabcdef" },
  ]) {
    const result = validateRecoveryOnlyExactHeadEvidence(
      config,
      { prNumber: target.prNumber, expectedHeadSha: target.prHeadSha, exactHeadEvidence: { ...evidence, ...patch } },
      { expectedHeadSha: target.prHeadSha, changedFiles },
    );
    assert.equal(result.ok, false);
  }
});

test("recovery-only exact evidence accepted by startup has strict-gate canonical digest", () => {
  const target = recoveryOnlyTargetFixture();
  const changedFiles = ["tools/auto-runner/lib/recovery-orchestrator.mjs", "tools/auto-runner/lib/config.mjs"];
  const evidence = exactHeadEvidenceFixture(target, changedFiles);
  const config = { outageRecoveryOnly: true, outageRecoveryTarget: target };
  assert.deepEqual(
    validateRecoveryOnlyExactHeadEvidence(
      config,
      { prNumber: target.prNumber, expectedHeadSha: target.prHeadSha, exactHeadEvidence: evidence },
      { expectedHeadSha: target.prHeadSha, changedFiles: [...changedFiles].reverse() },
    ),
    { ok: true },
  );
});

function recoveryOnlyTargetFixture() {
  return {
    taskKey: "20260716-2322",
    issueNumber: 913,
    branchName: "feature/auto-913-targeted-recovery-child-supervisor-20260716-1213",
    baseSha: "a".repeat(40),
    currentHeadSha: "b".repeat(40),
    prNumber: 919,
    prHeadSha: "b".repeat(40),
    runnerRunId: "run-2026-07-16T120000Z",
    supervisorRunId: "supervised-20260716T120000Z-abcdefabcdef",
    originalSupervisorSpecDigest: "c".repeat(64),
    markerKey: "d".repeat(64),
    outageFingerprint: "e".repeat(64),
    attemptNumber: 1,
  };
}

function exactHeadEvidenceFixture(target, changedFiles) {
  const canonicalFiles = canonicalizeChangedFiles(changedFiles);
  const digest = digestChangedFiles(canonicalFiles);
  return {
    repositorySlug: "tommytang213/Settleora",
    issueNumber: target.issueNumber,
    headSha: target.prHeadSha,
    prNumber: target.prNumber,
    baseSha: target.baseSha,
    taskKey: target.taskKey,
    runnerRunId: target.runnerRunId,
    supervisorRunId: target.supervisorRunId,
    changedFiles: canonicalFiles,
    changedFilesDigest: digest,
    validationPassed: true,
    validationResults: [{ command: "node --test tools/auto-runner/test/config-foundation.test.mjs", status: 0 }],
    validationCompletedAt: "2026-07-16T12:00:00.000Z",
    geminiPass: true,
    geminiHeadSha: target.prHeadSha,
    geminiChangedFiles: canonicalFiles,
    geminiChangedFilesDigest: digest,
    geminiProvider: "gemini",
    geminiTier: "cheap_independent",
    geminiCompletedAt: "2026-07-16T12:01:00.000Z",
    codexMechanicsApproved: true,
    codexMechanicsHeadSha: target.prHeadSha,
    codexMechanicsChangedFiles: canonicalFiles,
    codexMechanicsChangedFilesDigest: digest,
    codexMechanicsCompletedAt: "2026-07-16T12:02:00.000Z",
  };
}

function legacySha256Strings(values = []) {
  return createHash("sha256").update(values.map((value) => String(value || "")).filter(Boolean).sort().join("\n")).digest("hex");
}

test("stack config trust boundary accepts documented live acceptance config layout", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-trust-");
  try {
    const logsRoot = path.join(root, "logs");
    const { configPath, planPath } = writeStackConfig(logsRoot, "20260717-2347");
    const explicit = loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot });
    assert.equal(explicit.mode, "pr-stack-run");
    assert.equal(explicit.configPath, configPath);
    assert.equal(explicit.logsRoot, logsRoot);
    assert.equal(explicit.configTrustEvidence.externalRootSource, "trusted_capability");
    assert.equal(explicit.configTrustEvidence.canonicalRoot, logsRoot);
    assert.equal(explicit.configTrustEvidence.relativePurposePath, "live-stack-acceptance/20260717-2347/config.json");
    assert.equal(explicit.configTrustEvidence.taskCorrelation, "20260717-2347");
    assert.equal(explicit.configTrustEvidence.type, "regular_file");
    assert.equal(explicit.configTrustEvidence.mode, 0o600);
    assert.match(explicit.configTrustEvidence.digestSha256, /^[a-f0-9]{64}$/);

    const previous = process.env.SETTLEORA_STACK_TRUST_ROOT;
    process.env.SETTLEORA_STACK_TRUST_ROOT = logsRoot;
    try {
      const fromEnv = loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]));
      assert.equal(fromEnv.configTrustEvidence.externalRootSource, "process_env");
      assert.equal(fromEnv.configTrustEvidence.canonicalRoot, explicit.configTrustEvidence.canonicalRoot);
      assert.equal(fromEnv.configTrustEvidence.canonicalConfigPath, explicit.configTrustEvidence.canonicalConfigPath);
      assert.equal(fromEnv.configTrustEvidence.relativePurposePath, explicit.configTrustEvidence.relativePurposePath);
      assert.equal(fromEnv.configTrustEvidence.taskCorrelation, explicit.configTrustEvidence.taskCorrelation);
      assert.equal(fromEnv.configTrustEvidence.digestSha256, explicit.configTrustEvidence.digestSha256);
    } finally {
      restoreEnv("SETTLEORA_STACK_TRUST_ROOT", previous);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust boundary accepts the current durable resume path shape", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-trust-");
  try {
    const logsRoot = path.join(root, "logs");
    const { configPath, planPath } = writeStackConfig(logsRoot, "20260717-2347", {
      repository: "tommytang213/Settleora",
      protectedRoot: "/workspace/repos/Settleora",
    });
    assert.equal(
      configPath,
      path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "config.json"),
    );
    const config = loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot });
    assert.equal(config.configTrustEvidence.relativePurposePath, "live-stack-acceptance/20260717-2347/config.json");
    assert.equal(config.configTrustEvidence.repositorySlug, "tommytang213/Settleora");
    assert.equal(config.repoRoot, "/workspace/repos/Settleora");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust boundary rejects arbitrary bootstrap roots before filesystem validation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "settleora-stack-config-untrusted-"));
  try {
    const logsRoot = path.join(root, "logs");
    const configPath = path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "config.json");
    const planPath = path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "plan.json");
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /bootstrap_root_outside_runner_logs/,
    );

    const previous = process.env.SETTLEORA_STACK_TRUST_ROOT;
    process.env.SETTLEORA_STACK_TRUST_ROOT = logsRoot;
    try {
      assert.throws(
        () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath])),
        /bootstrap_root_outside_runner_logs/,
      );
    } finally {
      restoreEnv("SETTLEORA_STACK_TRUST_ROOT", previous);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust boundary admits only safe bootstrap-root segments under runner logs", () => {
  mkdirSync(defaultLogsRoot, { recursive: true, mode: 0o700 });
  const unsafeRoot = path.join(defaultLogsRoot, "settleora stack config unsafe");
  try {
    mkdirSync(unsafeRoot, { recursive: true, mode: 0o700 });
    const configPath = path.join(unsafeRoot, "live-stack-acceptance", "20260717-2347", "config.json");
    const planPath = path.join(unsafeRoot, "live-stack-acceptance", "20260717-2347", "plan.json");
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]), { prStackTrustedRoot: unsafeRoot }),
      /bootstrap_root_path_not_canonical/,
    );
  } finally {
    rmSync(unsafeRoot, { recursive: true, force: true });
  }
});

test("stack config trust boundary rejects invalid live acceptance layouts before stack lock", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-trust-");
  try {
    const logsRoot = path.join(root, "logs");
    const outsideRoot = path.join(root, "outside");
    mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
    mkdirSync(outsideRoot, { recursive: true, mode: 0o700 });
    const { planPath } = writeStackConfig(logsRoot, "20260717-2347");
    const body = validStackConfig(logsRoot);

    const cases = [
      [path.join(logsRoot, "config.json"), /config_wrong_purpose_layout/],
      [path.join(logsRoot, "other-purpose", "20260717-2347", "config.json"), /config_wrong_purpose_layout/],
      [path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "nested", "config.json"), /config_wrong_purpose_layout/],
      [path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "runner-config.json"), /config_wrong_purpose_layout/],
      [path.join(logsRoot, "live-stack-acceptance", "config.json"), /config_wrong_purpose_layout/],
      [path.join(logsRoot, "live-stack-acceptance", "bad key", "config.json"), /config_invalid_correlation_segment/],
    ];
    for (const [candidate, expected] of cases) {
      mkdirSync(path.dirname(candidate), { recursive: true, mode: 0o700 });
      writeFileSync(candidate, `${JSON.stringify(body)}\n`, { mode: 0o600 });
      assert.throws(
        () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", candidate, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
        expected,
      );
    }

    const escapeConfig = path.join(outsideRoot, "live-stack-acceptance", "20260717-2347", "config.json");
    mkdirSync(path.dirname(escapeConfig), { recursive: true, mode: 0o700 });
    writeFileSync(escapeConfig, `${JSON.stringify({ ...body, logsRoot: outsideRoot })}\n`, { mode: 0o600 });
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", escapeConfig, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /config_outside_bootstrap_root/,
    );
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", path.join(logsRoot, "live-stack-acceptance", "20260717-2347", "..", "..", "config.json"), "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /config_path_not_canonical|config_wrong_purpose_layout/,
    );

    const { configPath: target } = writeStackConfig(logsRoot, "20260717-2350");
    const link = path.join(logsRoot, "live-stack-acceptance", "20260717-2351", "config.json");
    mkdirSync(path.dirname(link), { recursive: true, mode: 0o700 });
    symlinkSync(target, link);
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", link, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_symlink_escape|config_canonical_alias_mismatch/);

    const aliasRoot = path.join(root, "alias-root");
    symlinkSync(logsRoot, aliasRoot);
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", path.join(aliasRoot, "live-stack-acceptance", "20260717-2347", "config.json"), "--stack-plan", planPath]), { prStackTrustedRoot: aliasRoot }),
      /bootstrap_root_symlink|bootstrap_root_canonical_alias_mismatch/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust boundary rejects invalid file and parsed identity cases before stack lock", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-trust-");
  try {
    const logsRoot = path.join(root, "logs");
    const outsideRoot = path.join(root, "outside");
    mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
    mkdirSync(outsideRoot, { recursive: true, mode: 0o700 });
    const { planPath } = writeStackConfig(logsRoot, "20260717-2347");
    const body = validStackConfig(logsRoot);

    const writable = liveConfigPath(logsRoot, "20260717-2352");
    writeConfigFile(writable, body);
    chmodSync(writable, 0o620);
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", writable, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_mode_group_world_writable|config_mode_not_restrictive/);

    const readableByGroup = liveConfigPath(logsRoot, "20260717-2353");
    writeConfigFile(readableByGroup, body);
    chmodSync(readableByGroup, 0o640);
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", readableByGroup, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_mode_not_restrictive/);

    const directory = liveConfigPath(logsRoot, "20260717-2354");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", directory, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_file_type_invalid/);

    const oversized = liveConfigPath(logsRoot, "20260717-2355");
    mkdirSync(path.dirname(oversized), { recursive: true, mode: 0o700 });
    writeFileSync(oversized, `{ "logsRoot": ${JSON.stringify(logsRoot)}, "padding": "${"x".repeat(1024 * 1024)}" }\n`, { mode: 0o600 });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", oversized, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_size_exceeded/);

    const invalidUtf8 = liveConfigPath(logsRoot, "20260717-2356");
    mkdirSync(path.dirname(invalidUtf8), { recursive: true, mode: 0o700 });
    writeFileSync(invalidUtf8, Buffer.from([0xff, 0xfe, 0xfd]), { mode: 0o600 });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", invalidUtf8, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_utf8_invalid/);

    const invalidJson = liveConfigPath(logsRoot, "20260717-2357");
    mkdirSync(path.dirname(invalidJson), { recursive: true, mode: 0o700 });
    writeFileSync(invalidJson, "{bad", { mode: 0o600 });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", invalidJson, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_json_invalid/);

    const mismatch = liveConfigPath(logsRoot, "20260717-2358");
    writeConfigFile(mismatch, { ...body, repositorySlug: "other/Settleora" });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", mismatch, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_identity_mismatch/);

    const repoRootMismatch = liveConfigPath(logsRoot, "20260717-2359");
    writeConfigFile(repoRootMismatch, { ...body, repoRoot: outsideRoot });
    assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", repoRootMismatch, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_repo_root_mismatch/);

    const selfDeclaringLogs = liveConfigPath(logsRoot, "20260717-2360");
    writeConfigFile(selfDeclaringLogs, { ...body, logsRoot: outsideRoot });
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", selfDeclaringLogs, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /config_root_incompatible/,
    );
    const selfDeclaringTrusted = liveConfigPath(logsRoot, "20260717-2361");
    writeConfigFile(selfDeclaringTrusted, { ...body, trustedControlRoot: outsideRoot });
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", selfDeclaringTrusted, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /config_root_incompatible/,
    );

    const escapingLogsLink = path.join(logsRoot, "escaping-logs-root");
    symlinkSync(outsideRoot, escapingLogsLink);
    const symlinkedLogs = liveConfigPath(logsRoot, "20260717-2363");
    writeConfigFile(symlinkedLogs, { ...body, logsRoot: escapingLogsLink });
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", symlinkedLogs, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /config_root_symlink_escape/,
    );
    assert.deepEqual(readdirSync(outsideRoot), []);

    const escapingTrustedLink = path.join(logsRoot, "escaping-trusted-control-root");
    symlinkSync(outsideRoot, escapingTrustedLink);
    const symlinkedTrusted = liveConfigPath(logsRoot, "20260717-2364");
    writeConfigFile(symlinkedTrusted, { ...body, trustedControlRoot: escapingTrustedLink });
    assert.throws(
      () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", symlinkedTrusted, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
      /config_root_symlink_escape/,
    );
    assert.deepEqual(readdirSync(outsideRoot), []);

    const previous = process.env.SETTLEORA_STACK_TRUST_ROOT;
    process.env.SETTLEORA_STACK_TRUST_ROOT = outsideRoot;
    try {
      assert.throws(
        () => loadConfig(parseCliArgs(["--run-pr-stack", "--config", liveConfigPath(logsRoot, "20260717-2347"), "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }),
        /bootstrap_root_conflict/,
      );
    } finally {
      restoreEnv("SETTLEORA_STACK_TRUST_ROOT", previous);
    }

    const wrongOwner = liveConfigPath(logsRoot, "20260717-2362");
    writeConfigFile(wrongOwner, body);
    if (typeof process.getuid === "function" && typeof process.getgid === "function") {
      try {
        chownSync(wrongOwner, process.getuid() + 1, process.getgid());
        assert.throws(() => loadConfig(parseCliArgs(["--run-pr-stack", "--config", wrongOwner, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot }), /config_owner_invalid/);
      } catch (error) {
        if (!["EPERM", "EINVAL"].includes(error.code)) throw error;
        const config = loadConfig(parseCliArgs(["--run-pr-stack", "--config", wrongOwner, "--stack-plan", planPath]), { prStackTrustedRoot: logsRoot });
        assert.equal(config.configTrustEvidence.uid, process.getuid());
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust descriptor read binds bytes and closes descriptors", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-descriptor-");
  try {
    const logsRoot = path.join(root, "logs");
    const { configPath, planPath } = writeStackConfig(logsRoot, "20260718-0010", { marker: "opened" });
    const replacement = { ...validStackConfig(logsRoot), marker: "replacement" };

    const fdsBefore = readdirSync("/proc/self/fd").length;
    const config = loadConfig(
      parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]),
      {
        prStackTrustedRoot: logsRoot,
        configTrustHooks: {
          beforeRead: ({ configPath: openedPath }) => {
            rmSync(openedPath);
            writeConfigFile(openedPath, replacement);
          },
        },
      },
    );
    assert.equal(config.marker, "opened");
    assert.notEqual(JSON.parse(readFileSync(configPath, "utf8")).marker, config.marker);
    assert.equal(readdirSync("/proc/self/fd").length, fdsBefore);

    writeConfigFile(configPath, { ...validStackConfig(logsRoot), marker: "opened-again" });
    assert.throws(
      () => loadConfig(
        parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]),
        {
          prStackTrustedRoot: logsRoot,
          configTrustHooks: {
            afterOpen: ({ configPath: openedPath }) => {
              rmSync(openedPath);
            },
          },
        },
      ),
      /config_missing|config_identity_mismatch/,
    );
    assert.equal(readdirSync("/proc/self/fd").length, fdsBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stack config trust descriptor read rejects growth after fstat without unbounded read", () => {
  const root = makeTrustedTestRoot("settleora-stack-config-growth-");
  try {
    const logsRoot = path.join(root, "logs");
    const { configPath, planPath } = writeStackConfig(logsRoot, "20260718-0011", { marker: "opened" });
    const originalSize = readFileSync(configPath).length;
    let boundedBytes = null;

    const fdsBefore = readdirSync("/proc/self/fd").length;
    assert.throws(
      () => loadConfig(
        parseCliArgs(["--run-pr-stack", "--config", configPath, "--stack-plan", planPath]),
        {
          prStackTrustedRoot: logsRoot,
          configTrustHooks: {
            beforeRead: ({ configPath: openedPath }) => {
              writeFileSync(openedPath, `${JSON.stringify({ ...validStackConfig(logsRoot), marker: "grown" })}\n${"x".repeat(1024 * 1024 + 1)}`, { mode: 0o600 });
            },
            afterRead: ({ bytesRead }) => {
              boundedBytes = bytesRead;
            },
          },
        },
      ),
      /config_identity_mismatch/,
    );
    assert.equal(boundedBytes, originalSize);
    assert.equal(readdirSync("/proc/self/fd").length, fdsBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeStackConfig(logsRoot, taskCorrelation, overrides = {}) {
  mkdirSync(logsRoot, { recursive: true, mode: 0o700 });
  chmodSync(logsRoot, 0o700);
  const configPath = liveConfigPath(logsRoot, taskCorrelation);
  const planPath = path.join(logsRoot, "live-stack-acceptance", taskCorrelation, "plan.json");
  writeConfigFile(configPath, { ...validStackConfig(logsRoot), ...overrides });
  return { configPath, planPath };
}

function makeTrustedTestRoot(prefix) {
  mkdirSync(defaultLogsRoot, { recursive: true, mode: 0o700 });
  return mkdtempSync(path.join(defaultLogsRoot, prefix));
}

function liveConfigPath(logsRoot, taskCorrelation) {
  return path.join(logsRoot, "live-stack-acceptance", taskCorrelation, "config.json");
}

function writeConfigFile(filePath, body) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(filePath), 0o700);
  writeFileSync(filePath, `${JSON.stringify(body)}\n`, { mode: 0o600 });
}

function validStackConfig(logsRoot) {
  return {
    logsRoot,
    trustedControlRoot: path.join(logsRoot, "trusted-control"),
    repoRoot: "/workspace/repos/Settleora",
    repositorySlug: "tommytang213/Settleora",
  };
}

function restoreEnv(name, previous) {
  if (previous === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previous;
  }
}
