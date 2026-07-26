import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { createSessionLifecycleState, loadSessionLifecycleForRecovery, persistSessionLifecycleState, sessionLifecyclePath, validateSessionLifecycleState } from "../lib/session-lifecycle.mjs";
import { chargeAcceptedLogicalTask } from "../lib/logical-task-budget.mjs";
import { preparePreEffectIntent, transitionPreEffectIntent } from "../lib/pre-effect-intent.mjs";
import {
  defaultGitAttributeFilesAreAbsent,
  inspectPreservedRecoveryForDeployment,
  normalizePreservedRecoveryDeploymentTarget,
  resumedGitConfigIsTrusted,
  resumedGitEnvironmentIsTrusted,
  resumedGitRemotesMatchExpected,
  resumedGitRepositoryAuthorityIsTrusted,
  sanitizedDeploymentGitEnvironment,
} from "../lib/preserved-recovery-deployment.mjs";
import { inspectDeploymentQuiescence } from "../lib/runtime-bundle.mjs";
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
  intentMatchesRecoveryAuthority,
  nextBundleSliceFromCheckpoint,
  planIdempotentGithubMutation,
  recoveryStatusSummary,
  reconcileAuthoritativeLifecycleHead,
  reconstructMissingSessionLifecycle,
  projectStartupRecoveryIssueIdentity,
  shouldAdvanceFixtureIssueCursor,
  shouldSkipCompletedBundleSlice,
  consumeStartupInterruptionPlanner,
} from "../lib/recovery-continuation.mjs";

test("startup recovery intent identity is effect-type-aware and fail-closed", () => {
  const expected = {
    issueNumber: 959,
    claimIdentity: "owner/repo#959",
    chargeIdentity: "/trusted/logical-task-budget/charge.json",
    branchName: "feature/auto-959-recovery",
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
  };
  const canonical = {
    repository: "owner/repo",
    sourceTaskKey: "20260724T075849",
    runId: "run-959",
    logicalTaskIdentity: expected.claimIdentity,
    claimIdentity: expected.claimIdentity,
    chargeIdentity: expected.chargeIdentity,
    effectType: "commit",
    identity: {
      repository: "owner/repo",
      sourceTaskKey: "20260724T075849",
      runId: "run-959",
      logicalTaskIdentity: expected.claimIdentity,
      claimIdentity: expected.claimIdentity,
      chargeIdentity: expected.chargeIdentity,
      branchName: expected.branchName,
      baseSha: expected.baseSha,
      headSha: expected.baseSha,
    },
  };
  assert.equal(intentMatchesRecoveryAuthority(canonical, expected), true);
  assert.equal(intentMatchesRecoveryAuthority({
    ...canonical,
    identity: { ...canonical.identity, issueNumber: 960 },
  }, expected), false);
  assert.equal(intentMatchesRecoveryAuthority({
    ...canonical,
    effectType: "comment",
  }, expected), false);
  assert.equal(intentMatchesRecoveryAuthority({
    ...canonical,
    effectType: "comment",
    identity: { ...canonical.identity, issueNumber: 959 },
  }, expected), true);
});

test("deployment Git environment disables lazy object fetching and ignores ambient execution authority", () => {
  assert.deepEqual(sanitizedDeploymentGitEnvironment({
    LD_PRELOAD: "/tmp/hostile.so",
    GIT_DIR: "/tmp/foreign.git",
    HOME: "/tmp/hostile-home",
  }), {
    PATH: "/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  });
  const githubCredential = [
    ["credential.https://github.com.helper", ""],
    ["credential.https://github.com.helper", "!/usr/bin/gh auth git-credential"],
    ["credential.https://gist.github.com.helper", ""],
    ["credential.https://gist.github.com.helper", "!/usr/bin/gh auth git-credential"],
  ];
  const systemLfs = [
    ["filter.lfs.clean", "git-lfs clean -- %f"],
    ["filter.lfs.smudge", "git-lfs smudge -- %f"],
    ["filter.lfs.process", "git-lfs filter-process"],
    ["filter.lfs.required", "true"],
  ];
  assert.equal(resumedGitConfigIsTrusted(githubCredential, systemLfs), true);
  assert.equal(resumedGitConfigIsTrusted(
    [...githubCredential, ["url.git@github.com:foreign/repo.git.pushinsteadof", "git@github.com:owner/repo.git"]],
    systemLfs,
  ), false);
  assert.equal(resumedGitConfigIsTrusted(githubCredential, systemLfs, { repositoryDefinesFilter: true }), false);
  assert.equal(resumedGitConfigIsTrusted(githubCredential, systemLfs, { defaultAttributesPresent: true }), false);
  assert.equal(resumedGitConfigIsTrusted([["core.hookspath", "/tmp/hooks"]], []), false);
  assert.equal(defaultGitAttributeFilesAreAbsent(["a", "b", "c", "d"], () => false), true);
  assert.equal(defaultGitAttributeFilesAreAbsent(["a", "b", "c", "d"], (file) => file === "c"), false);
  assert.equal(resumedGitEnvironmentIsTrusted({
    HOME: homedir(),
    PATH: "/usr/bin:/bin",
    GIT_NO_REPLACE_OBJECTS: "1",
  }), true);
  assert.equal(resumedGitEnvironmentIsTrusted({
    HOME: homedir(),
    PATH: "/usr/bin:/bin",
    GIT_NO_REPLACE_OBJECTS: "0",
  }), false);
});

test("one trusted recovery reconstructs a genuinely missing lifecycle exactly once", () => {
  const config = tempConfig({ repositorySlug: "owner/repo", maxIterations: 1, sessionLifecycle: { enabled: true, allowRecoveryTakeover: true } });
  try {
    const recovery = createInitialRecoveryState({
      taskKey: "20260724T075849",
      issue: { number: 959, title: "Recovery", url: "https://example.invalid/959" },
      runId: "run-959",
      supervisorRunId: "supervised-959",
      branchName: "feature/auto-959-recovery",
      baseSha: "a".repeat(40),
      currentHeadSha: "b".repeat(40),
      phase: "checkpoint_validation_commit",
      firstIncompleteAction: "run_source_failure_convergence",
    });
    const charged = chargeAcceptedLogicalTask(config, {
      budgetScopeId: "supervised-959",
      maxTasks: 1,
      issue: recovery.issue,
      taskLineageId: "issue-959",
      claimIdentity: "owner/repo#959",
      acceptedAt: "2026-07-24T07:58:49.248Z",
    });
    let withEvidence = recordIdempotentMutation({
      ...recovery,
      expectedReportPaths: {
        repoReportPath: path.join(config.repoRoot, ".codex", "reports", "settleora-codex-report-20260724T075849-issue-959-recovery.md"),
        promptPath: path.join(config.logsRoot, "tasks", "20260724T075849-issue-959-recovery.md"),
      },
      ordinaryContinuation: {
        identity: { baseSha: recovery.branch.baseSha, headSha: recovery.branch.currentHeadSha },
        counters: {
          acceptedLogicalTasks: 1,
          localSourceChangingRoundsPerEpoch: 2,
          githubTriggeredFixEpochsPerPr: 1,
          lifetimeLocalSourceChangingRounds: 3,
        },
        sourceFailureBatch: {
          candidate: { baseSha: recovery.branch.baseSha, headSha: recovery.branch.currentHeadSha },
        },
      },
    }, {
      kind: "claim",
      key: "issue-959",
      marker: { target: recovery.issue.url, correlation: recovery.run.runId },
    });
    withEvidence = recordIdempotentMutation(withEvidence, {
      kind: "logical_task_charge",
      key: charged.chargeId,
      marker: { target: "issue-959", correlation: charged.chargeId },
    });
    withEvidence = recordIdempotentMutation(withEvidence, {
      kind: "branch_ownership_created",
      key: `${recovery.branch.name}:${recovery.branch.baseSha}`,
      marker: { target: recovery.branch.name, correlation: recovery.branch.baseSha },
    });
    const identity = {
      repository: "owner/repo",
      issueNumber: 959,
      taskKey: recovery.taskKey,
      runId: recovery.run.runId,
      supervisorRunId: recovery.run.supervisorRunId,
      branchName: recovery.branch.name,
      baseSha: recovery.branch.baseSha,
      headSha: recovery.branch.currentHeadSha,
    };
    const directConfig = tempConfig({ repositorySlug: "owner/repo", maxIterations: 1, sessionLifecycle: { enabled: true, allowRecoveryTakeover: true } });
    try {
      const directCharge = chargeAcceptedLogicalTask(directConfig, {
        budgetScopeId: recovery.run.runId,
        maxTasks: 1,
        issue: recovery.issue,
        taskLineageId: "issue-959",
        claimIdentity: "owner/repo#959",
        acceptedAt: "2026-07-24T07:58:49.248Z",
      });
      assert.equal(directCharge.chargeId, charged.chargeId);
      const directRecovery = {
        ...withEvidence,
        run: { ...withEvidence.run, supervisorRunId: null },
        expectedReportPaths: {
          repoReportPath: path.join(directConfig.repoRoot, ".codex", "reports", "settleora-codex-report-20260724T075849-issue-959-recovery.md"),
          promptPath: path.join(directConfig.logsRoot, "tasks", "20260724T075849-issue-959-recovery.md"),
        },
      };
      const direct = reconstructMissingSessionLifecycle(directConfig, directRecovery, { ...identity, supervisorRunId: null });
      assert.equal(direct.ok, true, JSON.stringify(direct));
      assert.equal(direct.state.logicalTask.supervisorRunId, null);
    } finally {
      directConfig.cleanup();
    }
    const first = reconstructMissingSessionLifecycle(config, withEvidence, identity);
    assert.equal(first.ok, true);
    assert.equal(first.migrated, true);
    assert.equal(first.state.logicalTask.chargeMarkerRef, charged.statePath);
    assert.equal(first.state.logicalTask.supervisorRunId, "supervised-959");
    assert.equal(first.state.controller.localSourceChangingRoundsPerEpoch, 2);
    const recoveryAdapters = {
      readProcess: () => ({ complete: true, pid: 959, ownerRunId: identity.runId, alive: false, source: "fixture_pid_probe" }),
      readLease: () => ({ complete: true, runId: "supervised-959", runnerRunId: identity.runId, heartbeatAt: "2026-07-24T07:59:00Z", expiresAt: "2026-07-24T08:00:00Z", valid: false, source: "fixture_heartbeat" }),
      readGit: () => ({ complete: true, source: "fixture_git", headSha: identity.headSha, remoteHeadSha: null, branchName: identity.branchName, baseSha: identity.baseSha, worktreeClean: true, indexClean: true, untrackedClean: true, stagedPaths: [], unstagedPaths: [], untrackedPaths: [] }),
      readGithub: () => ({ complete: true, source: "fixture_github", issue: { number: identity.issueNumber, state: "OPEN" }, pr: null, comments: [], checks: { state: "unknown" }, hygiene: [] }),
    };
    const resumed = consumeStartupInterruptionPlanner(config, withEvidence, {}, recoveryAdapters);
    assert.equal(resumed.ok, true, JSON.stringify(resumed));
    assert.match(resumed.successorSessionId, /^run-959:recovery:[0-9a-f-]{36}$/);
    assert.equal(resumed.mutationGeneration, 2);
    assert.equal(resumed.state.logicalTask.supervisorRunId, "supervised-959");
    const second = loadSessionLifecycleForRecovery(config, identity);
    assert.equal(second.ok, true);
    assert.equal(second.state.sessions.generation, resumed.state.sessions.generation);
    assert.equal(second.state.mutationAuthority.generation, resumed.state.mutationAuthority.generation);
    const repeated = consumeStartupInterruptionPlanner(config, withEvidence, {}, recoveryAdapters);
    assert.equal(repeated.ok, true, JSON.stringify(repeated));
    assert.equal(repeated.mutationGeneration, resumed.mutationGeneration);
    assert.equal(repeated.successorSessionId, resumed.successorSessionId);
    const mismatched = reconstructMissingSessionLifecycle(config, {
      ...withEvidence,
      mutationMarkers: {
        ...withEvidence.mutationMarkers,
        claim: {
          "issue-959": {
            ...withEvidence.mutationMarkers.claim["issue-959"],
            correlation: "wrong-run",
          },
        },
      },
    }, identity);
    assert.equal(mismatched.ok, false);
    assert.equal(mismatched.reasonCode, "session_lifecycle_migration_ownership_mismatch");

    let canonicalCommit = preparePreEffectIntent(config, {
      repository: config.repositorySlug,
      sourceTaskKey: identity.taskKey,
      runId: identity.runId,
      logicalTaskIdentity: "owner/repo#959",
      claimIdentity: "owner/repo#959",
      chargeIdentity: charged.statePath,
      sessionId: "prior-session",
      authorityGeneration: 1,
      effectType: "commit",
      branchName: identity.branchName,
      baseSha: identity.baseSha,
      headSha: identity.baseSha,
      candidateIdentity: identity.baseSha,
      effect: {
        expectedParents: [identity.baseSha],
        treeSha: identity.headSha,
        stagedPaths: ["apps/mobile/lib/parser.dart"],
        messageDigest: "c".repeat(64),
      },
    }, { intentId: "canonical-commit-without-nested-issue" });
    canonicalCommit = transitionPreEffectIntent({ ...config, currentAuthority: {
      runId: identity.runId,
      sessionId: "prior-session",
      authorityGeneration: 1,
      status: "active",
    } }, canonicalCommit, "executing");
    canonicalCommit = transitionPreEffectIntent({ ...config, currentAuthority: {
      runId: identity.runId,
      sessionId: "prior-session",
      authorityGeneration: 1,
      status: "active",
    } }, canonicalCommit, "live_confirmed");
    transitionPreEffectIntent({ ...config, currentAuthority: {
      runId: identity.runId,
      sessionId: "prior-session",
      authorityGeneration: 1,
      status: "active",
    } }, canonicalCommit, "finalized");
    assert.equal(
      consumeStartupInterruptionPlanner(config, withEvidence, {}, recoveryAdapters).ok,
      true,
      "a canonical finalized commit intent may omit the nested issue projection",
    );

    const contradictory = preparePreEffectIntent(config, {
      repository: config.repositorySlug,
      sourceTaskKey: identity.taskKey,
      runId: identity.runId,
      logicalTaskIdentity: "owner/repo#959",
      claimIdentity: "owner/repo#959",
      chargeIdentity: "wrong-charge",
      sessionId: "prior-session",
      authorityGeneration: 1,
      effectType: "push",
      issueNumber: identity.issueNumber,
      branchName: identity.branchName,
      baseSha: identity.baseSha,
      headSha: identity.headSha,
      effect: { localCommitSha: identity.headSha, remoteBranch: identity.branchName },
    }, { intentId: "contradictory-charge" });
    const executing = transitionPreEffectIntent({ ...config, currentAuthority: {
      runId: identity.runId,
      sessionId: "prior-session",
      authorityGeneration: 1,
      status: "active",
    } }, contradictory, "executing");
    transitionPreEffectIntent({ ...config, currentAuthority: {
      runId: identity.runId,
      sessionId: "prior-session",
      authorityGeneration: 1,
      status: "active",
    } }, executing, "failed_closed");
    assert.equal(
      reconstructMissingSessionLifecycle(config, withEvidence, identity).reasonCode,
      "session_lifecycle_migration_intent_identity_mismatch",
    );
    assert.equal(
      consumeStartupInterruptionPlanner(config, withEvidence).reasonCode,
      "session_lifecycle_intent_identity_mismatch",
    );
  } finally {
    config.cleanup();
  }
});

test("deployment admits only one exact effect-free preserved recovery and remains fail-closed", () => {
  const config = tempConfig({ repositorySlug: "owner/repo" });
  try {
    const rejectedAuthority = inspectDeploymentQuiescence(config.logsRoot, { preservedRecoveryTarget: {} });
    assert.equal(rejectedAuthority.preservedRecoveryAdmitted, false);
    assert.equal(rejectedAuthority.reasonCode, "preserved_recovery_target_or_root_untrusted");
    const files = ["apps/mobile/lib/parser.dart", "apps/mobile/test/parser_test.dart"];
    mkdirSync(config.repoRoot, { recursive: true });
    git(config.repoRoot, ["init"]);
    git(config.repoRoot, ["branch", "-m", "feature/auto-959-recovery"]);
    git(config.repoRoot, ["config", "user.email", "fixture@example.invalid"]);
    git(config.repoRoot, ["config", "user.name", "Fixture"]);
    git(config.repoRoot, ["remote", "add", "origin", "https://github.com/owner/repo.git"]);
    writeFileSync(path.join(config.logsRoot, ".project-namespace.json"), `${JSON.stringify({
      version: 1,
      namespace: "a".repeat(64),
      projectId: path.basename(config.logsRoot),
      repositorySlug: "owner/repo",
      repositoryCommonDirDigest: createHash("sha256").update(path.join(config.repoRoot, ".git")).digest("hex"),
    })}\n`, { mode: 0o600 });
    writeFileSync(path.join(config.repoRoot, "README.md"), "base\n");
    git(config.repoRoot, ["add", "README.md"]);
    git(config.repoRoot, ["commit", "-m", "base"]);
    const baseSha = git(config.repoRoot, ["rev-parse", "HEAD"]);
    const recoveryEnvironment = {
      HOME: homedir(),
      PATH: "/usr/bin:/bin",
      GIT_NO_REPLACE_OBJECTS: "1",
    };
    assert.equal(
      resumedGitRemotesMatchExpected(
        "https://github.com/owner/repo.git",
        "https://github.com/owner/repo.git",
        config.repositorySlug,
      ),
      true,
    );
    assert.equal(
      resumedGitRemotesMatchExpected(
        "https://github.com/foreign/repo.git",
        "https://github.com/foreign/repo.git",
        config.repositorySlug,
      ),
      false,
    );
    git(config.repoRoot, ["remote", "set-url", "origin", "https://github.com/foreign/repo.git"]);
    git(config.repoRoot, ["remote", "set-url", "--push", "origin", "https://github.com/foreign/repo.git"]);
    assert.equal(
      resumedGitRepositoryAuthorityIsTrusted(config.repoRoot, config.repositorySlug, recoveryEnvironment),
      false,
      "jointly redirected fetch and effective push authority must not satisfy the expected repository",
    );
    git(config.repoRoot, ["remote", "set-url", "origin", "https://github.com/owner/repo.git"]);
    git(config.repoRoot, ["config", "--unset-all", "remote.origin.pushurl"]);
    git(config.repoRoot, ["config", "--local", "core.hooksPath", path.join(config.repoRoot, "hostile-hooks")]);
    assert.equal(resumedGitRepositoryAuthorityIsTrusted(config.repoRoot, config.repositorySlug, recoveryEnvironment), false);
    git(config.repoRoot, ["config", "--local", "--unset-all", "core.hooksPath"]);
    git(config.repoRoot, ["config", "--local", "commit.gpgSign", "true"]);
    git(config.repoRoot, ["config", "--local", "gpg.program", path.join(config.repoRoot, "hostile-gpg")]);
    assert.equal(
      resumedGitRepositoryAuthorityIsTrusted(config.repoRoot, config.repositorySlug, recoveryEnvironment),
      false,
      "signing programs and automatic signing authority must fail closed",
    );
    git(config.repoRoot, ["config", "--local", "--unset-all", "commit.gpgSign"]);
    git(config.repoRoot, ["config", "--local", "--unset-all", "gpg.program"]);
    for (const file of files) {
      mkdirSync(path.dirname(path.join(config.repoRoot, file)), { recursive: true });
      writeFileSync(path.join(config.repoRoot, file), "first\n");
    }
    git(config.repoRoot, ["add", ...files]);
    git(config.repoRoot, ["commit", "-m", "first"]);
    const intermediateHead = git(config.repoRoot, ["rev-parse", "HEAD"]);
    const intermediateTree = git(config.repoRoot, ["rev-parse", "HEAD^{tree}"]);
    writeFileSync(path.join(config.repoRoot, files[0]), "second\n");
    git(config.repoRoot, ["add", files[0]]);
    git(config.repoRoot, ["commit", "-m", "second"]);
    const headSha = git(config.repoRoot, ["rev-parse", "HEAD"]);
    const treeSha = git(config.repoRoot, ["rev-parse", "HEAD^{tree}"]);
    const filesDigest = createHash("sha256").update(JSON.stringify(files)).digest("hex");
    const diffDigest = createHash("sha256").update(spawnSync(
      "git", ["diff", "--binary", `${baseSha}...${headSha}`],
      { cwd: config.repoRoot, encoding: "utf8" },
    ).stdout).digest("hex");
    const charge = chargeAcceptedLogicalTask(config, {
      budgetScopeId: "supervised-20260724T075831Z-fixture",
      maxTasks: 1,
      issue: { number: 959 },
      taskLineageId: "issue-959",
      claimIdentity: "owner/repo#959",
      acceptedAt: "2026-07-24T07:58:49.248Z",
    });
    let recovery = createInitialRecoveryState({
      taskKey: "20260724T075849",
      issue: { number: 959, title: "Recovery", url: "https://example.invalid/959" },
      runId: "run-2026-07-24T075839Z-fixture",
      supervisorRunId: "supervised-20260724T075831Z-fixture",
      branchName: "feature/auto-959-recovery",
      baseSha,
      currentHeadSha: headSha,
      phase: "stopped",
      firstIncompleteAction: "run_validation_and_commit",
    });
    recovery = {
      ...recovery,
      nextSafeAction: "stop_fail_closed",
      stopReason: { reasonCode: "checkpoint_validation_not_source_fix_safe", reason: "fixture" },
      expectedReportPaths: {
        repoReportPath: path.join(config.repoRoot, ".codex", "reports", "settleora-codex-report-20260724T075849-issue-959-fixture.md"),
        promptPath: path.join(config.logsRoot, "tasks", "20260724T075849-issue-959-fixture.md"),
      },
      evidence: { ...recovery.evidence, localValidation: { status: "failed", headSha: "a".repeat(40) } },
      ordinaryContinuation: {
        identity: {
          repository: "owner/repo", baseSha, headSha,
          treeSha, changedFiles: files, changedFilesDigest: filesDigest, diffDigest,
        },
        counters: {
          acceptedLogicalTasks: 1, localSourceChangingRoundsPerEpoch: 1,
          githubTriggeredFixEpochsPerPr: 0, lifetimeLocalSourceChangingRounds: 1,
        },
        sourceFailureBatch: {
          candidate: {
            baseSha, headSha, treeSha,
            changedFiles: files, changedFilesDigest: filesDigest, diffDigest,
          },
          findings: [{ sourceFixEligible: false, nextAction: "stop_fail_closed", classification: "unsafe_or_ambiguous" }],
        },
      },
    };
    recovery = recordIdempotentMutation(recovery, {
      kind: "claim", key: "issue-959", marker: { target: recovery.issue.url, correlation: recovery.run.runId },
    });
    recovery = recordIdempotentMutation(recovery, {
      kind: "logical_task_charge", key: charge.chargeId, marker: { target: "issue-959", correlation: charge.chargeId },
    });
    recovery = recordIdempotentMutation(recovery, {
      kind: "branch_ownership_created", key: `${recovery.branch.name}:${recovery.branch.baseSha}`,
      marker: { target: recovery.branch.name, correlation: recovery.branch.baseSha },
    });
    writeRecoveryState(config, recovery);
    const target = {
      repository: "owner/repo", issueNumber: 959, taskKey: recovery.taskKey,
      runnerRunId: recovery.run.runId, supervisorRunId: recovery.run.supervisorRunId,
      claimIdentity: "owner/repo#959", chargeId: charge.chargeId, branch: recovery.branch.name,
      baseSha: recovery.branch.baseSha, headSha: recovery.branch.currentHeadSha,
      treeSha, changedFilesDigest: filesDigest, diffDigest,
      reportName: "settleora-codex-report-20260724T075849-issue-959-fixture.md",
      promptName: "20260724T075849-issue-959-fixture.md",
      acceptedLogicalTasks: 1, localSourceChangingRounds: 1,
      githubTriggeredFixEpochs: 0, lifetimeLocalSourceChangingRounds: 1,
    };
    assert.throws(
      () => normalizePreservedRecoveryDeploymentTarget({ ...target, branch: `${target.branch}^{}` }),
      /literal Git branch name/,
      "revision expressions cannot be used as preserved branch authority",
    );
    assert.throws(
      () => normalizePreservedRecoveryDeploymentTarget(Object.fromEntries(
        Object.entries(target).filter(([key]) => key !== "diffDigest"),
      )),
      /missing.*extra authority/,
      "the persisted raw diff identity is mandatory operator authority",
    );
    let priorCommitIntent = preparePreEffectIntent(config, {
      repository: target.repository, sourceTaskKey: target.taskKey, runId: target.runnerRunId,
      logicalTaskIdentity: target.claimIdentity, claimIdentity: target.claimIdentity,
      chargeIdentity: charge.statePath, sessionId: "fixture-session", authorityGeneration: 1,
      effectType: "commit", branchName: target.branch, baseSha: target.baseSha,
      headSha: target.baseSha, candidateIdentity: target.baseSha,
      effect: {
        expectedParents: [target.baseSha], treeSha: intermediateTree, stagedPaths: files,
        messageDigest: createHash("sha256").update("first").digest("hex"),
      },
    });
    config.currentAuthority = { retired: false, status: "active", sessionId: "fixture-session", authorityGeneration: 1, runId: target.runnerRunId };
    priorCommitIntent = transitionPreEffectIntent(config, priorCommitIntent, "executing");
    priorCommitIntent = transitionPreEffectIntent(config, priorCommitIntent, "live_confirmed");
    transitionPreEffectIntent(config, priorCommitIntent, "finalized");
    let commitIntent = preparePreEffectIntent(config, {
      repository: target.repository, sourceTaskKey: target.taskKey, runId: target.runnerRunId,
      logicalTaskIdentity: target.claimIdentity, claimIdentity: target.claimIdentity,
      chargeIdentity: charge.statePath, sessionId: "fixture-session", authorityGeneration: 1,
      effectType: "commit", branchName: target.branch, baseSha: target.baseSha,
      headSha: intermediateHead, candidateIdentity: intermediateHead,
      effect: {
        expectedParents: [intermediateHead], treeSha: target.treeSha, stagedPaths: [files[0]],
        messageDigest: createHash("sha256").update("second").digest("hex"),
      },
    });
    commitIntent = transitionPreEffectIntent(config, commitIntent, "executing");
    commitIntent = transitionPreEffectIntent(config, commitIntent, "live_confirmed");
    transitionPreEffectIntent(config, commitIntent, "finalized");
    const lifecycle = createSessionLifecycleState({
      repository: target.repository, issueNumber: target.issueNumber, taskKey: target.taskKey,
      runId: target.runnerRunId, supervisorRunId: target.supervisorRunId,
      claimIdentity: target.claimIdentity, chargeMarkerRef: charge.statePath,
      sessionId: "fixture-session", branchName: target.branch, baseSha: target.baseSha,
      headSha: target.headSha, phase: "implementation_or_bundle_slice",
      nextExactAction: "run_implementation", reportPath: recovery.expectedReportPaths.repoReportPath,
      reportCorrelationKey: target.taskKey, localSourceChangingRoundsPerEpoch: 1,
      githubTriggeredFixEpochsPerPr: 0, lifetimeLocalSourceChangingRounds: 1,
    });
    assert.equal(persistSessionLifecycleState(config, lifecycle).ok, true);
    const before = readdirSync(config.logsRoot, { recursive: true }).sort();
    assert.equal(inspectDeploymentQuiescence(config.logsRoot).unresolvedExternalEffects, true);
    const admitted = inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } });
    assert.equal(admitted.preservedRecoveryAdmitted, true, JSON.stringify(admitted));
    const legacyRecovery = {
      ...recovery,
      ordinaryContinuation: {
        ...recovery.ordinaryContinuation,
        identity: { ...recovery.ordinaryContinuation.identity },
      },
    };
    delete legacyRecovery.ordinaryContinuation.identity.repository;
    writeRecoveryState(config, legacyRecovery);
    const legacyAdmitted = inspectPreservedRecoveryForDeployment(config.logsRoot, target, {
      repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
    });
    assert.equal(legacyAdmitted.preservedRecoveryAdmitted, true, JSON.stringify(legacyAdmitted));
    assert.equal(legacyAdmitted.reasonCode, "exact_preserved_recovery_legacy_repository_omission_admitted");
    writeRecoveryState(config, {
      ...legacyRecovery,
      ordinaryContinuation: {
        ...legacyRecovery.ordinaryContinuation,
        identity: { ...legacyRecovery.ordinaryContinuation.identity, repository: "foreign/repo" },
      },
    });
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, {
        repositoryRoot: config.repoRoot,
        resumedGitConfigRecords: { global: [], system: [] },
      }).reasonCode,
      "preserved_recovery_legacy_repository_contradiction",
    );
    writeRecoveryState(config, recovery);
    git(config.repoRoot, ["remote", "set-url", "origin", "git@github.com:owner/repo.git"]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "SSH remotes must not expose ambient SSH configuration or helper execution",
    );
    git(config.repoRoot, ["remote", "set-url", "origin", "https://github.com/owner/repo.git"]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, {
        ...target, diffDigest: "0".repeat(64),
      }, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).preservedRecoveryAdmitted,
      false,
      "a wrong operator diff digest must not identify the preserved recovery",
    );
    assert.equal(admitted.unresolvedExternalEffects, false);
    assert.equal(admitted.revalidationRequired, true);
    assert.deepEqual(readdirSync(config.logsRoot, { recursive: true }).sort(), before);
    assert.equal(inspectDeploymentQuiescence(config.logsRoot, {
      preservedRecoveryTarget: target,
      repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
    }).preservedRecoveryAdmitted, true);
    const invalidSiblingRecovery = path.join(config.logsRoot, "recovery", "schema-invalid-sibling.json");
    writeFileSync(invalidSiblingRecovery, `${JSON.stringify({ taskKey: "20260724T999999" })}\n`, { mode: 0o600 });
    assert.equal(
      inspectDeploymentQuiescence(config.logsRoot, {
        preservedRecoveryTarget: target,
        repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
      }).reasonCode,
      "preserved_recovery_authoritative_read_unavailable",
      "a schema-invalid sibling recovery must make canonical recovery authority unavailable",
    );
    unlinkSync(invalidSiblingRecovery);
    mkdirSync(path.join(config.logsRoot, "pre-effect-intents"));
    const legacyPendingIntent = path.join(config.logsRoot, "pre-effect-intents", "legacy-pending.json");
    writeFileSync(legacyPendingIntent, `${JSON.stringify({ status: "prepared" })}\n`, { mode: 0o600 });
    const legacyBlocked = inspectDeploymentQuiescence(config.logsRoot, {
      preservedRecoveryTarget: target,
      repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
    });
    assert.equal(legacyBlocked.unresolvedExternalEffects, true);
    assert.equal(legacyBlocked.reasonCode, "unresolved_operational_state");
    unlinkSync(legacyPendingIntent);
    writeFileSync(legacyPendingIntent, `${JSON.stringify({ status: "failed_closed", effectType: "push" })}\n`, { mode: 0o600 });
    const legacyFailedClosedBlocked = inspectDeploymentQuiescence(config.logsRoot, {
      preservedRecoveryTarget: target,
      repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
    });
    assert.equal(legacyFailedClosedBlocked.unresolvedExternalEffects, false);
    assert.equal(legacyFailedClosedBlocked.reasonCode, "exact_preserved_recovery_admitted");
    unlinkSync(legacyPendingIntent);
    git(config.repoRoot, ["replace", target.headSha, intermediateHead]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).preservedRecoveryAdmitted,
      true,
      "local replacement objects must not influence authoritative lineage",
    );
    const previousGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(config.logsRoot, "hostile-git-dir");
    try {
      assert.equal(
        inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
        "preserved_recovery_repository_identity_mismatch",
        "ambient Git repository redirection must not survive into the resumed runner",
      );
    } finally {
      if (previousGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previousGitDir;
    }
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, {
        repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
        gitEnvironment: { ...process.env, LD_PRELOAD: path.join(config.logsRoot, "hostile-loader.so") },
      }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "dynamic-loader environment must not survive into the resumed runner",
    );
    for (const [key, value] of [
      ["LD_AUDIT", path.join(config.logsRoot, "hostile-audit.so")],
      ["LD_DEBUG_OUTPUT", path.join(config.logsRoot, "hostile-debug")],
      ["GIT_PAGER", path.join(config.logsRoot, "hostile-pager")],
      ["SSH_ASKPASS", path.join(config.logsRoot, "hostile-askpass")],
      ["SSH_ASKPASS_REQUIRE", "force"],
    ]) {
      assert.equal(
        inspectPreservedRecoveryForDeployment(config.logsRoot, target, {
          repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
          gitEnvironment: { ...process.env, [key]: value },
        }).reasonCode,
        "preserved_recovery_repository_identity_mismatch",
        `${key} execution authority must not survive into the resumed runner`,
      );
    }
    const hostilePath = path.join(config.logsRoot, "hostile-path");
    mkdirSync(hostilePath);
    writeFileSync(path.join(hostilePath, "git"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    chmodSync(path.join(hostilePath, "git"), 0o700);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, {
        repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
        gitEnvironment: { ...process.env, PATH: `${hostilePath}:${process.env.PATH}` },
      }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "the resumed runner must resolve bare Git commands to the trusted binary",
    );
    writeFileSync(path.join(hostilePath, "hostile-git"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    unlinkSync(path.join(hostilePath, "git"));
    symlinkSync(path.join(hostilePath, "hostile-git"), path.join(hostilePath, "git"));
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, {
        repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
        gitEnvironment: { ...process.env, PATH: `${hostilePath}:${process.env.PATH}` },
      }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "an earlier symlinked Git executable must not be skipped during PATH validation",
    );
    writeFileSync(path.join(hostilePath, "hostile-cat"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    symlinkSync(path.join(hostilePath, "hostile-cat"), path.join(hostilePath, "cat"));
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, {
        repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
        gitEnvironment: { ...process.env, GIT_PAGER: "cat", PATH: `${hostilePath}:${process.env.PATH}` },
      }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "an earlier symlinked pager executable must not be skipped during PATH validation",
    );
    unlinkSync(path.join(hostilePath, "git"));
    symlinkSync("/usr/bin/git", path.join(hostilePath, "git"));
    git(config.repoRoot, ["remote", "set-url", "origin", "git@github.com:foreign/repo.git"]);
    const hostileHome = path.join(config.logsRoot, "hostile-home");
    const hostileXdg = path.join(config.logsRoot, "hostile-xdg");
    mkdirSync(hostileHome);
    mkdirSync(hostileXdg);
    writeFileSync(path.join(hostileHome, ".gitconfig"), `[include]\n\tpath = ${path.join(hostileHome, "rewrite.config")}\n`);
    writeFileSync(path.join(hostileHome, "rewrite.config"), "[url \"git@github.com:owner/repo.git\"]\n\tinsteadOf = git@github.com:foreign/repo.git\n");
    git(config.repoRoot, ["config", "--local", "include.path", path.join(hostileHome, "rewrite.config")]);
    const foreignReason = inspectPreservedRecoveryForDeployment(config.logsRoot, target, {
      repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
      gitEnvironment: { ...process.env, HOME: hostileHome, XDG_CONFIG_HOME: hostileXdg },
    }).reasonCode;
    assert.equal(
      foreignReason,
      "preserved_recovery_repository_identity_mismatch",
      "hostile global/XDG config and includes cannot rewrite a foreign repository into authority",
    );
    git(config.repoRoot, ["config", "--local", "--unset-all", "include.path"]);
    git(config.repoRoot, ["remote", "set-url", "origin", "https://github.com/owner/repo.git"]);
    git(config.repoRoot, ["config", "extensions.worktreeConfig", "true"]);
    git(config.repoRoot, ["config", "--worktree", "remote.origin.pushurl", "git@github.com:foreign/repo.git"]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "worktree-scoped remote authority must not supplement the canonical repository",
    );
    git(config.repoRoot, ["config", "--worktree", "--unset-all", "remote.origin.pushurl"]);
    git(config.repoRoot, ["config", "--worktree", "url.git@github.com:foreign/repo.git.pushInsteadOf", "git@github.com:owner/repo.git"]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "worktree-scoped URL rewrites must not redirect later Git effects",
    );
    git(config.repoRoot, ["config", "--worktree", "--unset-all", "url.git@github.com:foreign/repo.git.pushInsteadOf"]);
    git(config.repoRoot, ["config", "--worktree", "include.path", path.join(hostileHome, "rewrite.config")]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "worktree-scoped include authority must not hide transport configuration",
    );
    git(config.repoRoot, ["config", "--worktree", "--unset-all", "include.path"]);
    git(config.repoRoot, ["config", "--local", "core.sshCommand", path.join(hostileHome, "hostile-ssh")]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "local SSH command authority must not control later GitHub reads or effects",
    );
    git(config.repoRoot, ["config", "--local", "--unset-all", "core.sshCommand"]);
    git(config.repoRoot, ["config", "--worktree", "remote.origin.receivepack", "hostile-receive-pack"]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "worktree-scoped receive-pack authority must not control later pushes",
    );
    git(config.repoRoot, ["config", "--worktree", "--unset-all", "remote.origin.receivepack"]);
    git(config.repoRoot, ["config", "--local", "http.sslVerify", "false"]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "local HTTP transport authority must not weaken later GitHub TLS reads or effects",
    );
    git(config.repoRoot, ["config", "--local", "--unset-all", "http.sslVerify"]);
    git(config.repoRoot, ["config", "--worktree", "credential.helper", path.join(hostileHome, "hostile-credential-helper")]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "worktree-scoped credential authority must not execute during later GitHub effects",
    );
    git(config.repoRoot, ["config", "--worktree", "--unset-all", "credential.helper"]);
    git(config.repoRoot, ["config", "--local", "core.hooksPath", path.join(hostileHome, "hooks")]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "local hook authority must not execute during later Git effects",
    );
    git(config.repoRoot, ["config", "--local", "--unset-all", "core.hooksPath"]);
    git(config.repoRoot, ["config", "--worktree", "core.fsmonitor", path.join(hostileHome, "hostile-fsmonitor")]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "worktree-scoped fsmonitor authority must not execute during later Git reads",
    );
    git(config.repoRoot, ["config", "--worktree", "--unset-all", "core.fsmonitor"]);
    git(config.repoRoot, ["config", "--local", "core.attributesFile", path.join(hostileHome, "attributes")]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "external attributes must not select an installed Git filter",
    );
    git(config.repoRoot, ["config", "--local", "--unset-all", "core.attributesFile"]);
    git(config.repoRoot, ["config", "--local", "filter.hostile.process", path.join(hostileHome, "hostile-filter")]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "local filter process authority must not execute during deployment Git reads",
    );
    git(config.repoRoot, ["config", "--local", "--unset-all", "filter.hostile.process"]);
    git(config.repoRoot, ["config", "--worktree", "filter.hostile.clean", path.join(hostileHome, "hostile-clean-filter")]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "worktree-scoped clean filter authority must not execute during deployment Git reads",
    );
    git(config.repoRoot, ["config", "--worktree", "--unset-all", "filter.hostile.clean"]);
    for (const [scope, key, description] of [
      ["--local", "diff.external", "external diff"],
      ["--worktree", "diff.Hostile.command", "worktree diff command"],
      ["--local", "diff.Hostile.textconv", "mixed-case text conversion"],
      ["--worktree", "merge.Hostile.driver", "worktree merge driver"],
    ]) {
      git(config.repoRoot, ["config", scope, key, path.join(hostileHome, `hostile-${description.replaceAll(" ", "-")}`)]);
      assert.equal(
        inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
        "preserved_recovery_repository_identity_mismatch",
        `${description} authority must not execute during current or later Git operations`,
      );
      git(config.repoRoot, ["config", scope, "--unset-all", key]);
    }
    const prePushHook = path.join(config.repoRoot, ".git", "hooks", "pre-push");
    writeFileSync(prePushHook, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    chmodSync(prePushHook, 0o700);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "an executable default pre-push hook must not run during later Git effects",
    );
    unlinkSync(prePushHook);
    git(config.repoRoot, ["config", "--add", "remote.origin.url", "git@github.com:owner/other.git"]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "multiple raw fetch URLs are ambiguous repository authority",
    );
    git(config.repoRoot, ["config", "--unset-all", "remote.origin.url"]);
    git(config.repoRoot, ["config", "--add", "remote.origin.url", "https://github.com/owner/repo.git"]);
    git(config.repoRoot, ["config", "--add", "remote.origin.url", ""]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_repository_identity_mismatch",
      "an empty additional fetch URL still counts as ambiguous authority",
    );
    git(config.repoRoot, ["config", "--unset-all", "remote.origin.url"]);
    git(config.repoRoot, ["config", "--add", "remote.origin.url", "https://github.com/owner/repo.git"]);
    git(config.repoRoot, ["branch", "-m", "moved-preserved-branch"]);
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "preserved_recovery_branch_ref_mismatch",
    );
    git(config.repoRoot, ["branch", "-m", target.branch]);
    let unrelatedIntent = preparePreEffectIntent(config, {
      repository: "foreign/repo", sourceTaskKey: "20260724T090000", runId: "run-2026-07-24T090000Z-foreign",
      logicalTaskIdentity: "foreign/repo#1000", claimIdentity: "foreign/repo#1000",
      chargeIdentity: "foreign-charge", sessionId: "foreign-session", authorityGeneration: 1,
      effectType: "push", branchName: "feature/foreign", baseSha: target.baseSha,
      headSha: target.headSha, candidateIdentity: target.headSha,
      effect: { remote: "origin", branchName: "feature/foreign", headSha: target.headSha },
    });
    config.currentAuthority = {
      retired: false, status: "active", sessionId: "foreign-session",
      authorityGeneration: 1, runId: "run-2026-07-24T090000Z-foreign",
    };
    unrelatedIntent = transitionPreEffectIntent(config, unrelatedIntent, "failed_closed");
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "unrelated_intent_targets_preserved_recovery",
    );
    unlinkSync(path.join(
      config.logsRoot,
      "recovery",
      "pre-effect-intents",
      `${createHash("sha256").update(unrelatedIntent.intentId).digest("hex")}.json`,
    ));
    config.currentAuthority = {
      retired: false, status: "active", sessionId: "fixture-session",
      authorityGeneration: 1, runId: target.runnerRunId,
    };
    assert.equal(inspectPreservedRecoveryForDeployment(config.logsRoot, {
      ...target,
      headSha: intermediateHead,
    }, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).preservedRecoveryAdmitted, false);
    const intent = preparePreEffectIntent(config, {
      repository: target.repository, sourceTaskKey: target.taskKey, runId: target.runnerRunId,
      logicalTaskIdentity: target.claimIdentity, claimIdentity: target.claimIdentity,
      chargeIdentity: charge.statePath, sessionId: "fixture-session", authorityGeneration: 1,
      effectType: "comment", issueNumber: 959, branchName: target.branch, baseSha: target.baseSha,
      headSha: target.headSha, candidateIdentity: target.headSha,
      effect: { issueNumber: 959, bodyDigest: "e".repeat(64) },
    });
    assert.equal(intent.status, "prepared");
    const hostileGhRoot = path.join(config.logsRoot, "hostile-gh-path");
    const hostileGhSentinel = path.join(config.logsRoot, "hostile-gh-executed");
    mkdirSync(hostileGhRoot);
    writeFileSync(
      path.join(hostileGhRoot, "gh"),
      `#!/bin/sh\n: > '${hostileGhSentinel}'\nprintf '%s\\n' '{\"body\":\"fabricated\"}'\n`,
      { mode: 0o700 },
    );
    const priorPath = process.env.PATH;
    process.env.PATH = `${hostileGhRoot}:${priorPath}`;
    let pending;
    try {
      pending = inspectPreservedRecoveryForDeployment(config.logsRoot, target, {
        repositoryRoot: config.repoRoot,
        resumedGitConfigRecords: { global: [], system: [] },
      });
    } finally {
      process.env.PATH = priorPath;
    }
    assert.equal(pending.preservedRecoveryAdmitted, false);
    assert.equal(pending.reasonCode, "prepared_comment_live_read_unavailable");
    assert.equal(existsSync(hostileGhSentinel), false, "authoritative evidence must not execute an ambient gh binary");
    const intentFilesBefore = readdirSync(path.join(config.logsRoot, "recovery", "pre-effect-intents")).sort();
    const absent = inspectPreservedRecoveryForDeployment(config.logsRoot, target, {
      repositoryRoot: config.repoRoot,
      resumedGitConfigRecords: { global: [], system: [] },
      intentEvidenceCollector: () => ({ ok: true, classification: "effect_absent_safe_to_execute" }),
    });
    assert.equal(absent.preservedRecoveryAdmitted, true, JSON.stringify(absent));
    assert.deepEqual(readdirSync(path.join(config.logsRoot, "recovery", "pre-effect-intents")).sort(), intentFilesBefore);
    let finalizedExternal = transitionPreEffectIntent(config, intent, "executing");
    finalizedExternal = transitionPreEffectIntent(config, finalizedExternal, "live_confirmed");
    finalizedExternal = transitionPreEffectIntent(config, finalizedExternal, "finalized");
    assert.equal(
      inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
      "exact_preserved_recovery_admitted",
    );
    const deleteIntent = (value) => unlinkSync(path.join(
      config.logsRoot,
      "recovery",
      "pre-effect-intents",
      `${createHash("sha256").update(value.intentId).digest("hex")}.json`,
    ));
    deleteIntent(finalizedExternal);
    for (const effectType of ["push", "merge"]) {
      let external = preparePreEffectIntent(config, {
        repository: target.repository, sourceTaskKey: target.taskKey, runId: target.runnerRunId,
        logicalTaskIdentity: target.claimIdentity, claimIdentity: target.claimIdentity,
        chargeIdentity: charge.statePath, sessionId: "fixture-session", authorityGeneration: 1,
        effectType, issueNumber: 959, prNumber: 959, branchName: target.branch, baseSha: target.baseSha,
        headSha: target.headSha, candidateIdentity: target.headSha,
        effect: { remote: "origin", branchName: target.branch, headSha: target.headSha, prNumber: 959 },
      });
      external = transitionPreEffectIntent(config, external, "executing");
      external = transitionPreEffectIntent(config, external, "live_confirmed");
      external = transitionPreEffectIntent(config, external, "finalized");
      assert.equal(
        inspectPreservedRecoveryForDeployment(config.logsRoot, target, { repositoryRoot: config.repoRoot, resumedGitConfigRecords: { global: [], system: [] } }).reasonCode,
        "exact_preserved_recovery_admitted",
        `exact finalized ${effectType} is completed evidence but does not become new authority`,
      );
      deleteIntent(external);
    }
  } finally {
    config.cleanup();
  }
});

test("disabled lifecycle preserves legacy startup continuation before takeover gating", () => {
  assert.deepEqual(
    consumeStartupInterruptionPlanner({ sessionLifecycle: { enabled: false, allowRecoveryTakeover: false } }, {}),
    { ok: true, skipped: true, reasonCode: "session_lifecycle_disabled" },
  );
  assert.equal(
    consumeStartupInterruptionPlanner({ sessionLifecycle: { enabled: true, allowRecoveryTakeover: false } }, {}).reasonCode,
    "session_lifecycle_recovery_takeover_disabled",
  );
});

test("post-merge ephemeral cleanup is a restart-safe continuation boundary", () => {
  assert.deepEqual(firstIncompleteContinuationAction({
    phase: "post_merge_ephemeral_cleanup",
    firstIncompleteAction: "continue_exact_post_merge_cleanup",
    nextSafeAction: "continue_exact_post_merge_cleanup",
  }), {
    ok: true,
    phase: "post_merge_ephemeral_cleanup",
    firstIncompleteAction: "continue_exact_post_merge_cleanup",
    nextSafeAction: "continue_exact_post_merge_cleanup",
  });
});

test("disabled lifecycle refuses legacy fallback when a lifecycle checkpoint exists", () => {
  const config = tempConfig({ repositorySlug: "tommytang213/Settleora", sessionLifecycle: { enabled: false, allowRecoveryTakeover: false } });
  try {
    const recovery = state();
    const lifecycle = createSessionLifecycleState({
      repository: config.repositorySlug,
      issueNumber: recovery.issue.number,
      taskKey: recovery.taskKey,
      runId: recovery.run.runId,
      supervisorRunId: recovery.run.supervisorRunId,
      claimIdentity: "claim-893",
      chargeMarkerRef: "charge-893",
      sessionId: "session-893",
      branchName: recovery.branch.name,
      baseSha: recovery.branch.baseSha,
      headSha: recovery.branch.currentHeadSha,
      phase: "push",
      nextExactAction: "push",
    });
    assert.equal(persistSessionLifecycleState(config, lifecycle).ok, true);
    assert.equal(consumeStartupInterruptionPlanner(config, recovery).reasonCode, "session_lifecycle_disabled_existing_state");
  } finally {
    config.cleanup();
  }
});

test("enabled recovery atomically backfills only a missing legacy supervisor identity", () => {
  const config = tempConfig({ repositorySlug: "owner/repo", sessionLifecycle: { enabled: true, allowRecoveryTakeover: true } });
  try {
    const recovery = state({ supervisorRunId: "supervised-legacy" });
    const lifecycle = createSessionLifecycleState({
      repository: config.repositorySlug,
      issueNumber: recovery.issue.number,
      taskKey: recovery.taskKey,
      runId: recovery.run.runId,
      claimIdentity: "owner/repo#893",
      chargeMarkerRef: "charge-893",
      sessionId: "session-893",
      branchName: recovery.branch.name,
      baseSha: recovery.branch.baseSha,
      headSha: recovery.branch.currentHeadSha,
      phase: "push",
      nextExactAction: "push",
    });
    assert.equal(persistSessionLifecycleState(config, lifecycle).ok, true);
    const lifecyclePath = sessionLifecyclePath(config, lifecycle);
    const legacy = JSON.parse(readFileSync(lifecyclePath, "utf8"));
    delete legacy.logicalTask.supervisorRunId;
    legacy.checkpoint.digest = null;
    const digestInput = structuredClone(legacy);
    digestInput.timestamps.updatedAt = null;
    legacy.checkpoint.digest = createHash("sha256").update(JSON.stringify(digestInput)).digest("hex");
    writeFileSync(lifecyclePath, `${JSON.stringify(legacy, null, 2)}\n`, { mode: 0o600 });
    assert.equal(Object.hasOwn(JSON.parse(readFileSync(lifecyclePath, "utf8")).logicalTask, "supervisorRunId"), false);
    assert.equal(validateSessionLifecycleState(legacy, {
      repository: config.repositorySlug,
      issueNumber: recovery.issue.number,
      taskKey: recovery.taskKey,
      runId: recovery.run.runId,
      branchName: recovery.branch.name,
      baseSha: recovery.branch.baseSha,
      headSha: recovery.branch.currentHeadSha,
      claimIdentity: legacy.logicalTask.claimIdentity,
    }).ok, true);
    assert.equal(loadSessionLifecycleForRecovery(config, {
      repository: config.repositorySlug,
      issueNumber: recovery.issue.number,
      taskKey: recovery.taskKey,
      runId: recovery.run.runId,
      supervisorRunId: recovery.run.supervisorRunId,
      branchName: recovery.branch.name,
      baseSha: recovery.branch.baseSha,
      headSha: "d".repeat(40),
    }).reasonCode, "session_lifecycle_legacy_supervisor_backfill_head_mismatch");
    const loaded = loadSessionLifecycleForRecovery(config, {
      repository: config.repositorySlug,
      issueNumber: recovery.issue.number,
      taskKey: recovery.taskKey,
      runId: recovery.run.runId,
      supervisorRunId: recovery.run.supervisorRunId,
      branchName: recovery.branch.name,
      baseSha: recovery.branch.baseSha,
      headSha: recovery.branch.currentHeadSha,
    });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.state.logicalTask.supervisorRunId, "supervised-legacy");
    assert.equal(loadSessionLifecycleForRecovery(config, {
      repository: config.repositorySlug,
      issueNumber: recovery.issue.number,
      taskKey: recovery.taskKey,
      runId: recovery.run.runId,
      supervisorRunId: "wrong-supervisor",
      branchName: recovery.branch.name,
      baseSha: recovery.branch.baseSha,
      headSha: recovery.branch.currentHeadSha,
    }).reasonCode, "session_lifecycle_supervisorRunId_mismatch");
  } finally {
    config.cleanup();
  }
});

test("successor lifecycle adopts only an exact authoritatively proven commit head", () => {
  const oldHead = "a".repeat(40);
  const newHead = "b".repeat(40);
  const lifecycle = { branch: { headSha: oldHead, candidateDigest: "c".repeat(64) } };
  const adopted = reconcileAuthoritativeLifecycleHead(lifecycle, {
    git: { headSha: newHead },
    intents: [{ effectType: "commit", classification: "effect_present_exact_adoptable" }],
  });
  assert.equal(adopted.ok, true);
  assert.equal(adopted.changed, true);
  assert.equal(adopted.state.branch.headSha, newHead);
  assert.equal(adopted.state.branch.candidateDigest, null);
  assert.equal(reconcileAuthoritativeLifecycleHead(lifecycle, { git: { headSha: newHead }, intents: [] }).reasonCode, "session_lifecycle_authoritative_head_unproven");
});

test("successor lifecycle adopts an exactly discovered PR after the create checkpoint window", () => {
  const headSha = "a".repeat(40);
  const lifecycle = { branch: { name: "feature/recovery", headSha, prNumber: null, candidateDigest: null } };
  const adopted = reconcileAuthoritativeLifecycleHead(lifecycle, {
    git: { headSha },
    github: { pr: { number: 938, headRefName: lifecycle.branch.name, headSha } },
    intents: [{ effectType: "pr_create", classification: "effect_present_exact_adoptable" }],
  });
  assert.equal(adopted.ok, true);
  assert.equal(adopted.changed, true);
  assert.equal(adopted.state.branch.prNumber, 938);
  assert.equal(reconcileAuthoritativeLifecycleHead(lifecycle, { git: { headSha }, github: { pr: { number: 938, headRefName: lifecycle.branch.name, headSha } }, intents: [] }).reasonCode, "session_lifecycle_authoritative_pr_unproven");
});

function tempConfig(extra = {}) {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-recovery-continuation-"));
  return {
    logsRoot,
    repoRoot: path.join(logsRoot, "repo"),
    allowExistingPrRecovery: false,
    sessionLifecycle: { allowRecoveryTakeover: true },
    cleanup: () => rmSync(logsRoot, { recursive: true, force: true }),
    ...extra,
  };
}

function git(repoRoot, args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
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
  const issue = overrides.issue ?? { number: 893, title: "Recovery", url: "https://example.invalid/893" };
  const runId = overrides.runId ?? "run-2026-07-13T112700Z";
  const supervisorRunId = overrides.supervisorRunId ?? "supervised-20260713T112700Z-abcdefabcdef";
  const branchName = overrides.branchName ?? "tools/auto-runner-recovery-continuation-893-20260713-1927";
  const baseSha = overrides.baseSha ?? "b".repeat(40);
  const currentHeadSha = overrides.currentHeadSha ?? "c".repeat(40);
  const pr = overrides.pr ?? {
    number: 917,
    url: "https://example.invalid/pull/917",
    headSha: "c".repeat(40),
    headRefName: "tools/auto-runner-recovery-continuation-893-20260713-1927",
    baseRefName: "main",
    state: "OPEN",
  };
  const outageResubmission = Object.hasOwn(overrides, "outageResubmission")
    ? overrides.outageResubmission === null
      ? null
      : outageBinding({
          ...overrides.outageResubmission,
          taskKey: overrides.taskKey ?? "20260713-1927",
          issueNumber: issue.number,
          branchName,
          baseSha,
          currentHeadSha,
          prNumber: pr.number,
          prHeadSha: pr.headSha,
          runnerRunId: runId,
          supervisorRunId,
        })
    : outageBinding({
        taskKey: overrides.taskKey ?? "20260713-1927",
        issueNumber: issue.number,
        branchName,
        baseSha,
        currentHeadSha,
        prNumber: pr.number,
        prHeadSha: pr.headSha,
        runnerRunId: runId,
        supervisorRunId,
      });
  return state({
    ...overrides,
    issue,
    runId,
    supervisorRunId,
    branchName,
    baseSha,
    currentHeadSha,
    pr,
    outageResubmission,
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
    taskKey: "20260713-1927",
    issueNumber: 893,
    branchName: "tools/auto-runner-recovery-continuation-893-20260713-1927",
    baseSha: "b".repeat(40),
    currentHeadSha: "c".repeat(40),
    prNumber: 917,
    prHeadSha: "c".repeat(40),
    runnerRunId: "run-2026-07-13T112700Z",
    supervisorRunId: "supervised-20260713T112700Z-abcdefabcdef",
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
  const noPrStoredBinding = state({
    taskKey: exact.taskKey,
    issue: exact.issue,
    runId: "run-2026-07-13T113111Z",
    supervisorRunId: exact.run.supervisorRunId,
    branchName: exact.branch.name,
    baseSha: exact.branch.baseSha,
    currentHeadSha: exact.branch.currentHeadSha,
    pr: null,
    outageResubmission: outageBinding({
      prNumber: null,
      prHeadSha: null,
      runnerRunId: "run-2026-07-13T113111Z",
      supervisorRunId: exact.run.supervisorRunId,
    }),
  });
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
    ["noPrStoredBinding", noPrStoredBinding],
    ["missingTargetField", state({ runId: "run-2026-07-13T113104Z" })],
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

test("one exact validation-failure successor supersedes its provisional pre-prompt record", () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    let provisional = createInitialRecoveryState({
      taskKey: "20260724T07",
      issue: { number: 959, title: "Recovery", url: "https://example.invalid/959" },
      runId: "run-959",
      supervisorRunId: "supervised-959",
      branchName: "feature/auto-959-recovery",
      baseSha: "a".repeat(40),
      currentHeadSha: "a".repeat(40),
      phase: "implementation_or_bundle_slice",
      firstIncompleteAction: "run_implementation",
    });
    for (const [kind, key] of [["claim", "issue-959"], ["logical_task_charge", "charge-959"], ["branch_ownership_created", "branch-959"]]) {
      provisional = recordIdempotentMutation(provisional, { kind, key });
    }
    let successor = {
      ...provisional,
      taskKey: "20260724T075849",
      branch: { ...provisional.branch, currentHeadSha: "b".repeat(40) },
      phase: "stopped",
      firstIncompleteAction: "run_validation_and_commit",
      nextSafeAction: "stop_fail_closed",
      stopReason: { reasonCode: "checkpoint_validation_not_source_fix_safe" },
      expectedReportPaths: {
        repoReportPath: "/repo/.codex/reports/settleora-codex-report-20260724T075849-issue-959-recovery.md",
        promptPath: "/logs/tasks/20260724T075849-issue-959-recovery.md",
      },
      evidence: { ...provisional.evidence, localValidation: { status: "failed" } },
      ordinaryContinuation: {
        identity: { baseSha: "a".repeat(40), headSha: "b".repeat(40) },
        sourceFailureBatch: {
          batchIdentity: "batch-959",
          findings: [{
            classification: "unsafe_or_ambiguous",
            sourceFixEligible: false,
            nextAction: "stop_fail_closed",
          }],
        },
      },
      timestamps: { ...provisional.timestamps, updatedAt: new Date(Date.parse(provisional.timestamps.updatedAt) + 1000).toISOString() },
    };
    writeRecoveryState(config, provisional);
    writeRecoveryState(config, successor);
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.allowed, true);
    assert.equal(discovery.states.length, 1);
    assert.equal(discovery.state.taskKey, successor.taskKey);
    assert.equal(discovery.state.currentHeadSha, successor.branch.currentHeadSha);
  } finally {
    config.cleanup();
  }
});

test("terminal validation rejection is not revived as recoverable work", () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const stopped = {
      ...createInitialRecoveryState({
        taskKey: "20260724T075849",
        issue: { number: 959, title: "Recovery", url: "https://example.invalid/959" },
        runId: "run-959",
        branchName: "feature/auto-959-recovery",
        baseSha: "a".repeat(40),
        currentHeadSha: "b".repeat(40),
      }),
      phase: "stopped",
      stopReason: { reasonCode: "checkpoint_validation_not_source_fix_safe" },
      nextSafeAction: "stop_fail_closed",
      evidence: { localValidation: { status: "failed" } },
      ordinaryContinuation: {
        identity: { headSha: "b".repeat(40) },
        sourceFailureBatch: {
          findings: [{
            classification: "unsafe_or_ambiguous",
            sourceFixEligible: false,
            nextAction: "stop_fail_closed",
          }],
        },
      },
    };
    writeRecoveryState(config, stopped);
    assert.equal(discoverStartupRecovery(config).found, false);
  } finally {
    config.cleanup();
  }
});

test("non-source validation failure resumes validation without implementation replay", async () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const stopped = {
      ...createInitialRecoveryState({
        taskKey: "20260724T075849",
        issue: { number: 959, title: "Recovery", url: "https://example.invalid/959" },
        runId: "run-959",
        branchName: "feature/auto-959-recovery",
        baseSha: "a".repeat(40),
        currentHeadSha: "b".repeat(40),
      }),
      phase: "stopped",
      firstIncompleteAction: "run_validation_and_commit",
      nextSafeAction: "stop_fail_closed",
      stopReason: { reasonCode: "checkpoint_validation_not_source_fix_safe" },
      evidence: { localValidation: { status: "failed" } },
      ordinaryContinuation: {
        identity: { headSha: "b".repeat(40) },
        sourceFailureBatch: {
          findings: [{
            classification: "unsafe_or_ambiguous",
            sourceFixEligible: false,
            nextAction: "stop_fail_closed",
          }],
        },
      },
    };
    writeRecoveryState(config, stopped);
    const discovery = discoverStartupRecovery(config);
    assert.equal(discovery.allowed, true);
    let implementationCalls = 0;
    const continued = await executeStartupContinuation(config, discovery, {
      checkpoint_validation_commit: async ({ boundary }) => ({
        ok: true,
        outcome: "validation_resumed",
        boundary,
      }),
      implementation_or_bundle_slice: async () => {
        implementationCalls += 1;
        return { ok: false };
      },
    });
    assert.equal(continued.ok, true);
    assert.equal(continued.result.boundary.nextSafeAction, "run_validation_and_commit");
    assert.equal(implementationCalls, 0);
  } finally {
    config.cleanup();
  }
});

test("failed resumed validation is re-terminalized instead of retried on every startup", async () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const stopped = {
      ...createInitialRecoveryState({
        taskKey: "20260724T075849",
        issue: { number: 959, title: "Recovery", url: "https://example.invalid/959" },
        runId: "run-959",
        branchName: "feature/auto-959-recovery",
        baseSha: "a".repeat(40),
        currentHeadSha: "b".repeat(40),
      }),
      phase: "stopped",
      firstIncompleteAction: "run_validation_and_commit",
      nextSafeAction: "stop_fail_closed",
      stopReason: { reasonCode: "checkpoint_validation_not_source_fix_safe" },
      evidence: { localValidation: { status: "failed" } },
      ordinaryContinuation: {
        identity: { headSha: "b".repeat(40) },
        sourceFailureBatch: {
          findings: [{ classification: "unsafe_or_ambiguous", sourceFixEligible: false, nextAction: "stop_fail_closed" }],
        },
      },
    };
    writeRecoveryState(config, stopped);
    const continued = await executeStartupContinuation(config, discoverStartupRecovery(config), {
      checkpoint_validation_commit: async ({ state }) => ({
        ok: false,
        outcome: "blocked_recovery_state",
        reasonCode: "checkpoint_validation_not_source_fix_safe",
        state: {
          ...state,
          ordinaryContinuation: {
            phase: "local_validation",
            sourceFailureBatch: {
              findings: [{ classification: "unsafe_or_ambiguous", sourceFixEligible: false, nextAction: "stop_fail_closed" }],
            },
          },
        },
      }),
    });
    assert.equal(continued.ok, false);
    assert.equal(continued.result.state.phase, "stopped");
    assert.equal(discoverStartupRecovery(config).found, false);
  } finally {
    config.cleanup();
  }
});

test("later continuation failures after recovered validation remain recoverable", async () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    const stopped = {
      ...createInitialRecoveryState({
        taskKey: "20260724T075849", issue: { number: 959, title: "Recovery", url: "u" }, runId: "run-959",
        branchName: "feature/auto-959-recovery", baseSha: "a".repeat(40), currentHeadSha: "b".repeat(40),
      }),
      phase: "stopped", firstIncompleteAction: "run_validation_and_commit", nextSafeAction: "stop_fail_closed",
      stopReason: { reasonCode: "checkpoint_validation_not_source_fix_safe" },
      evidence: { localValidation: { status: "failed" } },
      ordinaryContinuation: {
        identity: { headSha: "b".repeat(40) },
        sourceFailureBatch: { findings: [{ classification: "unsafe_or_ambiguous", sourceFixEligible: false, nextAction: "stop_fail_closed" }] },
      },
    };
    writeRecoveryState(config, stopped);
    const continued = await executeStartupContinuation(config, discoverStartupRecovery(config), {
      checkpoint_validation_commit: async () => ({
        ok: false,
        reasonCode: "ordinary_continuation_external_review_unavailable",
        state: { phase: "external_review", sourceFailureBatch: null },
      }),
    });
    assert.equal(continued.ok, false);
    assert.equal(discoverStartupRecovery(config).found, true);
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

test("startup recovery projects the persisted source issue identity", () => {
  const recovery = { state: recoveryStatusSummary(state()) };
  const projected = projectStartupRecoveryIssueIdentity(recovery, {
    result: {
      issue: { number: 893 },
      existingPrRecovery: { issue: { number: 893 } },
      autoMerge: { issueNumber: 893, prNumber: 905 },
    },
  });
  assert.deepEqual(projected, {
    ok: true,
    reasonCode: "startup_recovery_issue_identity_validated",
    issue: { number: 893 },
  });
});

test("blocked single-state startup recovery retains authoritative issue identity", () => {
  const projected = projectStartupRecoveryIssueIdentity(
    { allowed: false, state: { issueNumber: 893 } },
    { ok: false, outcome: "blocked_recovery_state", reasonCode: "existing_pr_recovery_disabled" },
  );
  assert.deepEqual(projected.issue, { number: 893 });
  assert.equal(projected.ok, true);
});

test("fixture cursor advances only for issues consumed by normal polling", () => {
  assert.equal(shouldAdvanceFixtureIssueCursor({ issue: { number: 893 }, issueSource: "startup_recovery", recovery: { found: true } }), false);
  assert.equal(shouldAdvanceFixtureIssueCursor({ issue: { number: 894 }, recovery: { ordinary: true } }), true);
  assert.equal(shouldAdvanceFixtureIssueCursor({ issue: { number: 895 }, recovery: null }), true);
  assert.equal(shouldAdvanceFixtureIssueCursor({ issue: null, recovery: null }), false);
});

test("startup recovery issue projection fails closed without persisted authority", () => {
  for (const recovery of [
    { state: { issueNumber: null, prNumber: 905 } },
    { state: { issueNumber: "893", prNumber: 905 } },
    { state: { prNumber: 893, childOrdinal: 893 } },
  ]) {
    const projected = projectStartupRecoveryIssueIdentity(recovery, {
      result: { issue: { number: 893 }, autoMerge: { issueNumber: 893, prNumber: 893 } },
    });
    assert.equal(projected.ok, false);
    assert.equal(projected.reasonCode, "startup_recovery_issue_identity_missing");
    assert.equal(projected.issue, null);
  }
});

test("startup recovery issue projection rejects malformed and conflicting continuation identities", () => {
  const recovery = { state: { issueNumber: 893 } };
  assert.equal(
    projectStartupRecoveryIssueIdentity(recovery, { result: { issue: { number: "893" } } }).reasonCode,
    "startup_recovery_issue_identity_malformed",
  );
  assert.equal(
    projectStartupRecoveryIssueIdentity(recovery, { result: { existingPrRecovery: { issue: { number: 894 } } } }).reasonCode,
    "startup_recovery_issue_identity_conflict",
  );
  assert.equal(
    projectStartupRecoveryIssueIdentity(recovery, { result: { autoMerge: { issueNumber: 905 } } }).reasonCode,
    "startup_recovery_issue_identity_conflict",
  );
});

test("startup recovery issue identity survives durable restart and repeated projection", () => {
  const config = tempConfig({ allowExistingPrRecovery: true });
  try {
    writeRecoveryState(config, state());
    const first = discoverStartupRecovery(config);
    const second = discoverStartupRecovery(config);
    assert.deepEqual(projectStartupRecoveryIssueIdentity(first).issue, { number: 893 });
    assert.deepEqual(projectStartupRecoveryIssueIdentity(second).issue, { number: 893 });
    assert.equal(first.state.issueNumber, second.state.issueNumber);
  } finally {
    config.cleanup();
  }
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
