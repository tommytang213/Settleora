import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  readRemoteTaskBranch,
  validateHistoricalRecoveryGitAuthority,
  verifyHistoricalInitialCandidateLineage,
} from "../lib/historical-initial-candidate-lineage.mjs";
import { validatePreservedRecoveryCommitLineage } from "../lib/preserved-recovery-deployment.mjs";
import {
  ordinaryContinuationLegacyPhaseTarget,
  ordinaryContinuationPhaseTarget,
  ordinaryContinuationPhases,
} from "../lib/ordinary-candidate-continuation.mjs";

const issueNumber = 959;
const taskKey = "20260724T075849";
const runId = "run-2026-07-24T075839Z-f6ba2d20a4df";
const supervisorRunId = "supervised-20260724T075831Z-f6ba2d20a4df";
const operationId = "eb7896e6-90c7-453d-bc8f-eff1b25af9ad";
const chargeId = "5c9ae164d122cabccefa40f98db88134633bd594c0b2834897f51679c7d7ad78";
const repository = "tommytang213/Settleora";
const branch = "feature/auto-959-harden-mobile-ocr-parsing-for-hk-chinese-2026-07-24t0758";
const changedFiles = [
  "apps/mobile/lib/receipt_ocr_capture/receipt_ocr_parser.dart",
  "apps/mobile/test/receipt_ocr_capture/receipt_ocr_parser_test.dart",
];

test("historical initial candidate accepts equal, one-merge, and many-merge main lineage", () => {
  for (const advances of [0, 1, 4]) {
    const fixture = makeFixture(advances);
    const result = verify(fixture);
    assert.equal(result.ok, true, `${advances}: ${result.reasonCode}`);
    assert.equal(result.reasonCode, advances === 0
      ? "historical_candidate_exact_base_proven"
      : "historical_candidate_descendant_main_proven");
    assert.equal(spawnSync("/usr/bin/git",
      ["merge-base", "--is-ancestor", fixture.headSha, fixture.mainSha],
      { cwd: fixture.repoRoot }).status, 1);
  }
});

test("historical candidate authenticates from a clean current-main control checkout", () => {
  const fixture = makeFixture(2);
  run(fixture.repoRoot, ["checkout", "main"]);
  const result = verify(fixture);
  assert.equal(result.ok, true, result.reasonCode);
  assert.equal(result.requiresTaskWorkspaceAdoption, true);
  assert.equal(run(fixture.repoRoot, ["branch", "--show-current"]).stdout.trim(), "main");
  assert.equal(run(fixture.repoRoot, ["rev-parse", "HEAD"]).stdout.trim(), fixture.mainSha);

  run(fixture.repoRoot, ["update-ref", `refs/heads/${branch}`, fixture.baseSha]);
  assert.equal(verify(fixture).reasonCode, "historical_candidate_branch_ref_mismatch");
});

test("historical recovery falls back to an exact active identity without source failures", () => {
  const fixture = makeFixture(2);
  fixture.state.ordinaryContinuation.sourceFailureBatch = null;
  fixture.state.ordinaryContinuation.sourceFailureHistory = [];
  const result = verify(fixture);
  assert.equal(result.ok, true, result.reasonCode);

  fixture.intents[0].effect.messageDigest = "0".repeat(64);
  assert.equal(verify(fixture).reasonCode, "historical_candidate_commit_intent_mismatch");
});

test("historical initial candidate fail-closes on durable identity and effect contradictions", () => {
  const cases = [
    ["wrong issue", (f) => { f.state.issue.number = 958; }, "historical_candidate_authority_identity_mismatch"],
    ["wrong task", (f) => { f.state.taskKey = "20260724T075850"; }, "historical_candidate_report_prompt_mismatch"],
    ["wrong runner", (f) => { f.state.run.runId = `${runId}-foreign`; }, "historical_candidate_continuation_mismatch"],
    ["wrong supervisor", (f) => { f.state.run.supervisorRunId = `${supervisorRunId}-foreign`; }, "historical_candidate_lifecycle_mismatch"],
    ["wrong branch", (f) => { f.state.branch.name = `${branch}-foreign`; }, "historical_candidate_continuation_mismatch"],
    ["wrong tree", (f) => { f.state.ordinaryContinuation.identity.treeSha = f.baseTree; }, "historical_candidate_durable_identity_mismatch"],
    ["wrong diff", (f) => { f.state.ordinaryContinuation.identity.diffDigest = "0".repeat(64); }, "historical_candidate_durable_identity_mismatch"],
    ["wrong changed digest", (f) => { f.state.ordinaryContinuation.identity.changedFilesDigest = "0".repeat(64); }, "historical_candidate_durable_identity_mismatch"],
    ["forbidden path", (f) => {
      f.state.ordinaryContinuation.identity.changedFiles.push("../secret");
      f.state.ordinaryContinuation.sourceFailureBatch.candidate.changedFiles.push("../secret");
      const value = hashJson([...f.state.ordinaryContinuation.identity.changedFiles].sort());
      f.state.ordinaryContinuation.identity.changedFilesDigest = value;
      f.state.ordinaryContinuation.sourceFailureBatch.candidate.changedFilesDigest = value;
    }, "historical_candidate_changed_paths_mismatch"],
    ["wrong report", (f) => { f.state.expectedReportPaths.repoReportPath = "/tmp/report.md"; }, "historical_candidate_report_prompt_mismatch"],
    ["missing report", (f) => {
      unlinkSync(f.state.expectedReportPaths.repoReportPath);
    }, "historical_candidate_report_prompt_mismatch"],
    ["writable prompt", (f) => {
      chmodSync(f.state.expectedReportPaths.promptPath, 0o666);
    }, "historical_candidate_report_prompt_mismatch"],
    ["push marker", (f) => { f.state.mutationMarkers.push = { x: { status: "completed" } }; }, "historical_candidate_later_effect_present"],
    ["pr identity", (f) => { f.state.pr = { number: 1, url: "https://example.invalid", headSha: f.headSha }; }, "historical_candidate_later_effect_present"],
    ["replacement candidate", (f) => { f.state.branch.currentHeadSha = f.baseSha; }, "historical_candidate_authority_identity_mismatch"],
    ["dirty checkout", (f) => { writeFileSync(path.join(f.repoRoot, "dirty"), "x"); }, "historical_candidate_checkout_mismatch"],
    ["wrong checked out branch", (f) => {
      run(f.repoRoot, ["checkout", "-b", "foreign-checkout", f.mainSha]);
    }, "historical_candidate_checkout_mismatch"],
    ["shallow history", (f) => { f.options.git = overrideGit(f, {
      "rev-parse --is-shallow-repository": { status: 0, stdout: "true\n", stderr: "" },
    }); }, "historical_candidate_history_shallow"],
    ["base object unavailable", (f) => { f.options.git = overrideGit(f, {
      [`cat-file -t ${f.baseSha}`]: { status: 128, stdout: "", stderr: "missing" },
    }); }, "historical_candidate_object_unavailable"],
    ["wrong subject", (f) => { f.options.git = overrideGit(f, {
      [`show -s --format=%s ${f.headSha}`]: { status: 0, stdout: "foreign\n", stderr: "" },
    }); }, "historical_candidate_subject_mismatch"],
    ["multiple parents", (f) => { f.options.git = overrideGit(f, {
      [`show -s --format=%P ${f.headSha}`]: { status: 0, stdout: `${f.baseSha} ${f.mainSha}\n`, stderr: "" },
    }); }, "historical_candidate_topology_mismatch"],
    ["extra candidate commit", (f) => { f.options.git = overrideGit(f, {
      [`rev-list --count ${f.baseSha}..${f.headSha}`]: { status: 0, stdout: "2\n", stderr: "" },
    }); }, "historical_candidate_topology_mismatch"],
    ["foreign remote", (f) => { run(f.repoRoot, ["remote", "set-url", "origin", "https://github.com/foreign/repo.git"]); }, "historical_candidate_git_environment_untrusted"],
    ["wrong charge", (f) => { f.options.expectedChargeId = "0".repeat(64); }, "historical_candidate_charge_mismatch"],
    ["wrong operation", (f) => { f.options.expectedRecoveryOperationId = "foreign"; }, "historical_candidate_lifecycle_mismatch"],
    ["wrong lifecycle generation", (f) => { f.lifecycle.sessions.generation += 1; }, "historical_candidate_lifecycle_mismatch"],
    ["terminal lifecycle", (f) => {
      f.lifecycle.mutationAuthority = {
        ...f.lifecycle.mutationAuthority, status: "terminal", ownerSessionId: null,
      };
    }, "historical_candidate_lifecycle_mismatch"],
    ["ambiguous lifecycle", (f) => { f.options.loadLifecycle = () => ({ ok: false }); }, "historical_candidate_lifecycle_untrusted"],
    ["missing commit intent", (f) => { f.intents.length = 0; }, "historical_candidate_commit_intent_ambiguous"],
    ["duplicate commit intent", (f) => { f.intents.push(structuredClone(f.intents[0])); }, "historical_candidate_commit_intent_ambiguous"],
    ["prepared commit intent", (f) => { f.intents[0].status = "prepared"; }, "historical_candidate_commit_intent_mismatch"],
    ["failed closed commit intent", (f) => { f.intents[0].status = "failed_closed"; }, "historical_candidate_commit_intent_mismatch"],
    ["wrong commit parent intent", (f) => { f.intents[0].effect.expectedParents = [f.headSha]; }, "historical_candidate_commit_intent_mismatch"],
    ["external intent", (f) => { f.intents.push({ ...structuredClone(f.intents[0]), effectType: "push" }); }, "historical_candidate_terminal_intent_identity_mismatch"],
    ["canonical comment intent", (f) => {
      f.intents.push({ ...structuredClone(f.intents[0]), effectType: "comment" });
    }, "historical_candidate_terminal_intent_identity_mismatch"],
    ["hygiene component intent", (f) => {
      f.intents.push({ ...structuredClone(f.intents[0]), effectType: "hygiene_component" });
    }, "historical_candidate_terminal_intent_identity_mismatch"],
  ];
  for (const [name, mutate, reason] of cases) {
    const fixture = makeFixture(2);
    mutate(fixture);
    const result = verify(fixture);
    assert.equal(result.ok, false, name);
    assert.equal(result.reasonCode, reason, name);
  }
});

test("historical initial candidate rejects executable diff configuration before reading diffs", () => {
  for (const [name, key] of [
    ["external diff", "diff.external"],
    ["diff driver command", "diff.unsafe.command"],
    ["diff driver textconv", "diff.unsafe.textconv"],
    ["filter command", "filter.unsafe.clean"],
    ["conditional include", "includeIf.gitdir:/tmp/.path"],
  ]) {
    const fixture = makeFixture(0);
    const marker = path.join(fixture.repoRoot, `executed-${name.replaceAll(" ", "-")}`);
    const executable = path.join(fixture.repoRoot, `unsafe-${name.replaceAll(" ", "-")}.sh`);
    writeFileSync(executable, `#!/bin/sh\n: > '${marker}'\nexit 0\n`);
    chmodSync(executable, 0o700);
    run(fixture.repoRoot, ["config", "--local", key, executable]);
    const result = verify(fixture);
    assert.equal(result.ok, false, name);
    assert.equal(result.reasonCode, "historical_candidate_git_environment_untrusted", name);
    assert.equal(existsSync(marker), false, `${name} executed before the trust decision`);
  }
});

test("historical pre-fetch authority rejects executable transport configuration without execution", () => {
  for (const [name, key] of [
    ["ssh command", "core.sshCommand"],
    ["credential helper", "credential.helper"],
    ["Git proxy", "core.gitProxy"],
    ["URL rewrite", "url.ssh://attacker.invalid/.insteadOf"],
    ["conditional include", "includeIf.gitdir:/tmp/.path"],
    ["merge driver", "merge.hostile.driver"],
  ]) {
    const fixture = makeFixture(0);
    const marker = path.join(fixture.repoRoot, `prefetch-${name.replaceAll(" ", "-")}`);
    const executable = path.join(fixture.repoRoot, `prefetch-${name.replaceAll(" ", "-")}.sh`);
    writeFileSync(executable, `#!/bin/sh\n: > '${marker}'\nexit 1\n`);
    chmodSync(executable, 0o700);
    run(fixture.repoRoot, ["config", "--local", key, executable]);
    assert.equal(validateHistoricalRecoveryGitAuthority(fixture.config), false, name);
    assert.equal(existsSync(marker), false, `${name} executed before the pre-fetch trust decision`);
  }
});

test("historical initial candidate accepts canonical startup-approved remotes and safe worktree config", () => {
  for (const remote of [
    `https://github.com/${repository}`,
    `ssh://git@github.com/${repository}.git`,
    "https://github.com/TommyTang213/SETTLEORA.git",
  ]) {
    const fixture = makeFixture(1);
    run(fixture.repoRoot, ["remote", "set-url", "origin", remote]);
    assert.equal(verify(fixture).ok, true, remote);
  }
  const worktreeConfig = makeFixture(1);
  run(worktreeConfig.repoRoot, ["config", "extensions.worktreeConfig", "true"]);
  assert.equal(verify(worktreeConfig).ok, true);
  const marker = path.join(worktreeConfig.repoRoot, "worktree-diff-executed");
  const executable = path.join(worktreeConfig.repoRoot, "unsafe-worktree-diff.sh");
  writeFileSync(executable, `#!/bin/sh\n: > '${marker}'\nexit 0\n`);
  chmodSync(executable, 0o700);
  run(worktreeConfig.repoRoot, ["config", "--worktree", "diff.external", executable]);
  assert.equal(verify(worktreeConfig).reasonCode, "historical_candidate_git_environment_untrusted");
  assert.equal(existsSync(marker), false, "worktree-scoped diff command executed before trust decision");
  run(worktreeConfig.repoRoot, ["config", "--worktree", "--unset", "diff.external"]);
  unlinkSync(executable);
  assert.equal(verify(worktreeConfig).ok, true);
  const mergeMarker = path.join(worktreeConfig.repoRoot, "worktree-merge-driver-executed");
  const mergeExecutable = path.join(worktreeConfig.repoRoot, "unsafe-worktree-merge-driver.sh");
  writeFileSync(mergeExecutable, `#!/bin/sh\n: > '${mergeMarker}'\nexit 1\n`);
  chmodSync(mergeExecutable, 0o700);
  run(worktreeConfig.repoRoot, ["config", "--worktree", "merge.Hostile.driver", mergeExecutable]);
  assert.equal(validateHistoricalRecoveryGitAuthority(worktreeConfig.config), false);
  assert.equal(existsSync(mergeMarker), false,
    "worktree-scoped merge driver executed before prospective merge trust decision");
  run(worktreeConfig.repoRoot, ["config", "--worktree", "--unset", "merge.Hostile.driver"]);
  unlinkSync(mergeExecutable);
  assert.equal(verify(worktreeConfig).ok, true);
  run(worktreeConfig.repoRoot, ["config", "extensions.worktreeConfig", "false"]);
  assert.equal(verify(worktreeConfig).reasonCode, "historical_candidate_git_environment_untrusted");
});

test("authoritative remote read detects an unfetched task branch in a real bare remote", () => {
  const fixture = makeFixture(1);
  const bare = path.join(path.dirname(fixture.repoRoot), "remote.git");
  run(path.dirname(fixture.repoRoot), ["init", "--bare", bare]);
  run(fixture.repoRoot, ["remote", "set-url", "origin", bare]);
  run(fixture.repoRoot, ["push", "origin", `${fixture.headSha}:refs/heads/${branch}`]);
  run(fixture.repoRoot, ["update-ref", "-d", `refs/remotes/origin/${branch}`]);
  const git = (args) => spawnSync("/usr/bin/git", args, {
    cwd: fixture.repoRoot,
    encoding: "utf8",
    env: {
      PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0",
      GIT_NO_LAZY_FETCH: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null",
    },
  });
  assert.equal(run(fixture.repoRoot,
    ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`], true).status, 1);
  assert.deepEqual(readRemoteTaskBranch(git, branch), {
    complete: true, absent: false, headSha: fixture.headSha,
  });
  run(fixture.repoRoot, ["push", "origin", "--delete", branch]);
  assert.deepEqual(readRemoteTaskBranch(git, branch), { complete: true, absent: true });
});

test("historical initial candidate fail-closes on Git topology and history hazards", () => {
  const diverged = makeFixture(0);
  const unrelated = spawnSync("/usr/bin/git", ["commit-tree", diverged.baseTree], {
    cwd: diverged.repoRoot, encoding: "utf8", input: "unrelated main\n",
  });
  assert.equal(unrelated.status, 0, unrelated.stderr);
  run(diverged.repoRoot, ["update-ref", "refs/remotes/origin/main", unrelated.stdout.trim()]);
  assert.equal(verify(diverged).reasonCode, "historical_candidate_main_not_descendant");

  const merged = makeFixture(1);
  run(merged.repoRoot, ["checkout", "main"]);
  run(merged.repoRoot, ["merge", "--no-ff", branch, "-m", "merge candidate"]);
  const mergedMain = run(merged.repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
  run(merged.repoRoot, ["update-ref", "refs/remotes/origin/main", mergedMain]);
  run(merged.repoRoot, ["checkout", branch]);
  assert.equal(verify(merged).reasonCode, "historical_candidate_already_in_main");

  const replace = makeFixture(1);
  mkdirSync(path.join(replace.commonDir, "refs", "replace"), { recursive: true });
  writeFileSync(path.join(replace.commonDir, "refs", "replace", replace.baseSha), `${replace.baseSha}\n`);
  assert.equal(verify(replace).reasonCode, "historical_candidate_git_object_environment_untrusted");

  const graft = makeFixture(1);
  mkdirSync(path.join(graft.commonDir, "info"), { recursive: true });
  writeFileSync(path.join(graft.commonDir, "info", "grafts"), `${graft.baseSha}\n`);
  assert.equal(verify(graft).reasonCode, "historical_candidate_git_object_environment_untrusted");

  const alternate = makeFixture(1);
  mkdirSync(path.join(alternate.commonDir, "objects", "info"), { recursive: true });
  writeFileSync(path.join(alternate.commonDir, "objects", "info", "alternates"), "/tmp/foreign\n");
  assert.equal(verify(alternate).reasonCode, "historical_candidate_git_object_environment_untrusted");
});

test("historical initial candidate proof is restart-idempotent", () => {
  const fixture = makeFixture(3);
  const first = verify(fixture);
  const second = verify(fixture);
  assert.deepEqual(second, first);
  assert.equal(Object.keys(fixture.state.mutationMarkers.push || {}).length, 0);
  assert.equal(fixture.state.pr.number, null);
});

test("historical initial candidate admits only the exact pre-PR terminal intent lineage", () => {
  const fixture = makeFixture(3);
  authenticatePrePrTerminalFixture(fixture);
  run(fixture.repoRoot, ["checkout", "main"]);
  const before = JSON.stringify({
    state: fixture.state,
    lifecycle: fixture.lifecycle,
    intents: fixture.intents,
    labels: fixture.issue.labels,
    main: run(fixture.repoRoot, ["rev-parse", "HEAD"]).stdout.trim(),
  });
  const first = verify(fixture);
  const second = verify(fixture);
  assert.equal(first.ok, true, first.reasonCode);
  assert.deepEqual(second, first);
  assert.equal(first.requiresTaskWorkspaceAdoption, true);
  assert.equal(JSON.stringify({
    state: fixture.state,
    lifecycle: fixture.lifecycle,
    intents: fixture.intents,
    labels: fixture.issue.labels,
    main: run(fixture.repoRoot, ["rev-parse", "HEAD"]).stdout.trim(),
  }), before);

  const normalized = makeFixture(3);
  authenticatePrePrTerminalFixture(normalized);
  normalized.state.phase = "checkpoint_validation_commit";
  normalized.state.nextSafeAction = "run_validation_and_commit";
  normalized.state.stopReason = null;
  run(normalized.repoRoot, ["checkout", "main"]);
  const normalizedBefore = JSON.stringify(normalized);
  const normalizedFirst = verify(normalized);
  const normalizedSecond = verify(normalized);
  assert.equal(normalizedFirst.ok, true, normalizedFirst.reasonCode);
  assert.deepEqual(normalizedSecond, normalizedFirst);
  assert.equal(normalizedFirst.requiresTaskWorkspaceAdoption, true);
  assert.equal(JSON.stringify(normalized), normalizedBefore);

  const adopted = makeFixture(3);
  authenticatePrePrTerminalFixture(adopted);
  const workspaceIdentity = "9".repeat(64);
  const ownershipKey = `${branch}:${workspaceIdentity}`;
  adopted.state.mutationMarkers.worktree_ownership_created = {
    [ownershipKey]: {
      status: "completed",
      target: workspaceIdentity,
      correlation: branch,
      completedAt: "2026-07-29T00:00:00.000Z",
    },
  };
  adopted.options.expectedWorktreeOwnership = {
    key: ownershipKey,
    target: workspaceIdentity,
    correlation: branch,
  };
  const adoptedResult = verify(adopted);
  assert.equal(adoptedResult.ok, true, adoptedResult.reasonCode);
  adopted.state.mutationMarkers.worktree_ownership_created[ownershipKey].target = "8".repeat(64);
  const contradictedOwnership = verify(adopted);
  assert.equal(contradictedOwnership.ok, false);
  assert.equal(
    contradictedOwnership.reasonCode,
    "historical_candidate_terminal_later_effect_present",
  );

  const laterValidated = makeFixture(1);
  authenticatePrePrTerminalFixture(laterValidated);
  const originalTerminalCandidate =
    laterValidated.state.ordinaryContinuation.sourceFailureHistory?.[0]?.candidate
    || laterValidated.state.ordinaryContinuation.sourceFailureBatch.candidate;
  laterValidated.state.claimAuthority = {
    ok: true,
    mode: "preserved_recovery_claim",
    authority: {
      taskKey,
      runId,
      chargeId,
      priorOutcome: "validation_failed",
      branchName: branch,
      baseSha: laterValidated.baseSha,
      candidateIdentity: {
        headSha: originalTerminalCandidate.headSha,
      },
    },
  };
  laterValidated.state.phase = "external_review";
  laterValidated.state.firstIncompleteAction = "run_external_review";
  laterValidated.state.nextSafeAction = "run_external_review";
  laterValidated.state.stopReason = null;
  laterValidated.state.evidence.localValidation.status = "passed";
  laterValidated.intents.push({
    ...structuredClone(laterValidated.intents[0]),
    identity: {
      ...structuredClone(laterValidated.intents[0].identity),
      headSha: originalTerminalCandidate.headSha,
      candidateIdentity: originalTerminalCandidate.headSha,
    },
    effect: {
      ...structuredClone(laterValidated.intents[0].effect),
      expectedParents: [originalTerminalCandidate.headSha],
      treeSha: laterValidated.state.ordinaryContinuation.identity.treeSha,
    },
  });
  const laterValidatedResult = verify(laterValidated);
  assert.equal(laterValidatedResult.ok, true, laterValidatedResult.reasonCode);

  laterValidated.state.phase = "aggregate_validation";
  laterValidated.state.firstIncompleteAction = "run_aggregate_validation";
  laterValidated.state.nextSafeAction = "run_aggregate_validation";
  const aggregateValidationResult = verify(laterValidated);
  assert.equal(aggregateValidationResult.ok, true, aggregateValidationResult.reasonCode);

  const handedOffAgain = laterValidated;
  const preparedComment = handedOffAgain.intents[3];
  const priorSessionId = preparedComment.sessionId;
  const priorGeneration = preparedComment.authorityGeneration;
  const requestId = hash(`${operationId}:${priorSessionId}:validation-retry`);
  const nextSessionId =
    `recovery-handoff:${hash(JSON.stringify([runId, operationId, requestId]))}`;
  handedOffAgain.lifecycle.sessions.retired.push(priorSessionId);
  handedOffAgain.lifecycle.sessions.current = nextSessionId;
  handedOffAgain.lifecycle.sessions.generation = priorGeneration + 1;
  handedOffAgain.lifecycle.mutationAuthority.generation = priorGeneration + 1;
  handedOffAgain.state.sessionLifecycle = structuredClone(handedOffAgain.lifecycle);
  preparedComment.sessionId = nextSessionId;
  preparedComment.authorityGeneration = priorGeneration + 1;
  preparedComment.identity.sessionId = nextSessionId;
  preparedComment.identity.authorityGeneration = priorGeneration + 1;
  preparedComment.recoveryProvenance = {
    sessionId: priorSessionId,
    authorityGeneration: priorGeneration,
    fingerprint: hash(canonical({
      effectType: preparedComment.effectType,
      identity: {
        ...preparedComment.identity,
        sessionId: priorSessionId,
        authorityGeneration: priorGeneration,
      },
      effect: preparedComment.effect,
    })),
  };
  const handedOffAgainResult = verify(handedOffAgain);
  assert.equal(handedOffAgainResult.ok, true, handedOffAgainResult.reasonCode);
  handedOffAgain.lifecycle.sessions.retired =
    handedOffAgain.lifecycle.sessions.retired.filter((sessionId) =>
      sessionId !== `${runId}:recovery:${operationId}`);
  handedOffAgain.state.sessionLifecycle = structuredClone(handedOffAgain.lifecycle);
  assert.equal(
    verify(handedOffAgain).reasonCode,
    "historical_candidate_terminal_comment_mismatch",
  );

  const cases = [
    ["missing hygiene", (f) => f.intents.splice(1, 1), "historical_candidate_terminal_intent_set_mismatch"],
    ["duplicate hygiene", (f) => f.intents.push({ ...structuredClone(f.intents[1]), intentId: "duplicate" }), "historical_candidate_terminal_intent_set_mismatch"],
    ["wrong hygiene status", (f) => { f.intents[1].status = "prepared"; }, "historical_candidate_terminal_hygiene_mismatch"],
    ["wrong hygiene payload", (f) => { f.intents[1].effect.addLabels = ["auto-ready"]; }, "historical_candidate_terminal_hygiene_mismatch"],
    ["contradictory live labels", (f) => f.issue.labels.push("auto-running"), "historical_candidate_terminal_live_labels_mismatch"],
    ["missing comment", (f) => f.intents.pop(), "historical_candidate_terminal_intent_set_mismatch"],
    ["wrong comment status", (f) => { f.intents[3].status = "finalized"; }, "historical_candidate_terminal_comment_mismatch"],
    ["wrong comment digest", (f) => { f.intents[3].effect.bodyDigest = "0".repeat(64); }, "historical_candidate_terminal_comment_mismatch"],
    ["wrong comment outcome", (f) => { f.intents[3].effect.outcome = "approved_pr_opened"; }, "historical_candidate_terminal_comment_mismatch"],
    ["foreign session", (f) => { f.intents[3].sessionId = "foreign"; }, "historical_candidate_terminal_intent_identity_mismatch"],
    ["generation drift", (f) => { f.intents[3].authorityGeneration = 99; }, "historical_candidate_terminal_intent_identity_mismatch"],
    ["older current-comment generation", (f) => {
      f.intents[3].authorityGeneration -= 1;
      f.intents[3].identity.authorityGeneration -= 1;
    }, "historical_candidate_terminal_comment_mismatch"],
    ["foreign recovery provenance", (f) => {
      f.intents[3].recoveryProvenance.sessionId = "foreign";
    }, "historical_candidate_terminal_comment_mismatch"],
    ["wrong recovery provenance fingerprint", (f) => {
      f.intents[3].recoveryProvenance.fingerprint = "9".repeat(64);
    }, "historical_candidate_terminal_comment_mismatch"],
    ["non-adjacent recovery generation", (f) => {
      f.intents[3].recoveryProvenance.authorityGeneration -= 1;
    }, "historical_candidate_terminal_comment_mismatch"],
    ["different adjacent retired recovery session", (f) => {
      const foreign = `${runId}:recovery:foreign-operation`;
      f.lifecycle.sessions.retired.push(foreign);
      f.intents[3].recoveryProvenance.sessionId = foreign;
    }, "historical_candidate_terminal_comment_mismatch"],
    ["wrong successor handoff diagnostic", (f) => {
      f.intents[3].diagnostics = [];
    }, "historical_candidate_terminal_comment_mismatch"],
    ["hygiene generation differs from commit authority", (f) => {
      f.intents[1].authorityGeneration += 1;
      f.intents[1].identity.authorityGeneration += 1;
    }, "historical_candidate_terminal_hygiene_mismatch"],
    ["malformed intent fingerprint", (f) => {
      f.intents[1].fingerprint = "not-a-digest";
    }, "historical_candidate_terminal_intent_duplicate"],
    ["malformed intent id", (f) => {
      f.intents[1].intentId = "bad\nid";
    }, "historical_candidate_terminal_intent_duplicate"],
    ["noncanonical retry handoff", (f) => {
      f.state.phase = "checkpoint_validation_commit";
      f.state.nextSafeAction = "run_validation_and_commit";
      f.state.stopReason = null;
      f.state.firstIncompleteAction = "implement_source_changes";
    }, "historical_candidate_terminal_outcome_mismatch"],
    ["push marker", (f) => {
      f.state.mutationMarkers.push = { x: { status: "completed" } };
    }, "historical_candidate_later_effect_present"],
    ["empty unknown marker", (f) => {
      f.state.mutationMarkers.unknown = {};
    }, "historical_candidate_terminal_later_effect_present"],
    ["malformed unknown marker", (f) => {
      f.state.mutationMarkers.unknown = null;
    }, "historical_candidate_terminal_later_effect_present"],
    ["extra push intent", (f) => {
      f.intents.push({ ...structuredClone(f.intents[3]), effectType: "push", intentId: "push" });
    }, "historical_candidate_terminal_intent_set_mismatch"],
    ["remote task branch without tracking ref", (f) => {
      f.options.readRemoteTaskBranch = () => ({
        complete: true, absent: false, headSha: f.headSha,
      });
    }, "historical_candidate_terminal_remote_branch_present"],
    ["remote branch read failure", (f) => {
      f.options.readRemoteTaskBranch = () => ({ complete: false, absent: false });
    }, "historical_candidate_terminal_remote_branch_read_unavailable"],
    ["duplicate terminal comments already live", (f) => {
      f.options.readIssueCommentDigest = () => ({ complete: true, matchingCount: 2 });
    }, "historical_candidate_terminal_comment_present"],
    ["terminal comment read failure", (f) => {
      f.options.readIssueCommentDigest = () => ({ complete: false, matchingCount: 0 });
    }, "historical_candidate_terminal_comment_read_unavailable"],
  ];
  for (const [name, mutate, reason] of cases) {
    const candidate = makeFixture(2);
    authenticatePrePrTerminalFixture(candidate);
    mutate(candidate);
    const result = verify(candidate);
    assert.equal(result.ok, false, name);
    assert.equal(result.reasonCode, reason, name);
  }
});

test("historical terminal authority adopts one exact already-posted prepared comment", () => {
  const fixture = makeFixture(2);
  authenticatePrePrTerminalFixture(fixture);
  fixture.options.readIssueCommentDigest = () => ({ complete: true, matchingCount: 1 });
  assert.equal(verify(fixture).ok, true);
});

test("historical proof admits only an exact finalized-intent prepared source-fix checkout", () => {
  const fixture = makeFixture(2);
  const batchIdentity = "b".repeat(64);
  fixture.state.ordinaryContinuation.sourceFailureFixIntent = {
    status: "prepared", batchIdentity, candidateHead: fixture.headSha,
  };
  fixture.state.ordinaryContinuation.sourceFailureBatch.batchIdentity = batchIdentity;
  writeFileSync(path.join(fixture.repoRoot, changedFiles[0]), "candidate-0\nprepared\n");
  run(fixture.repoRoot, ["add", changedFiles[0]]);
  const subject = `Auto-runner issue #${issueNumber}: source-fix ${batchIdentity.slice(0, 16)}`;
  run(fixture.repoRoot, ["commit", "-m",
    subject]);
  const preparedTree = run(fixture.repoRoot, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
  fixture.intents.push({
    repository, sourceTaskKey: taskKey, runId, effectType: "commit", status: "finalized",
    logicalTaskIdentity: `${repository}#${issueNumber}`, claimIdentity: `${repository}#${issueNumber}`,
    chargeIdentity: fixture.options.loadBudget().statePath,
    identity: {
      issueNumber, branchName: branch, baseSha: fixture.baseSha, headSha: fixture.headSha,
      candidateIdentity: fixture.headSha,
    },
    effect: {
      expectedParents: [fixture.headSha], treeSha: preparedTree,
      stagedPaths: [changedFiles[0]], messageDigest: hash(subject),
    },
  });
  const pushOnlyResult = verify(fixture);
  assert.equal(pushOnlyResult.ok, true, pushOnlyResult.reasonCode);

  for (const [name, mutate, restore] of [
    ["prepared intent",
      (value) => { value.intents[1].status = "prepared"; },
      (value) => { value.intents[1].status = "finalized"; }],
    ["wrong batch", (value) => {
      value.state.ordinaryContinuation.sourceFailureBatch.batchIdentity = "c".repeat(64);
    }, (value) => {
      value.state.ordinaryContinuation.sourceFailureBatch.batchIdentity = batchIdentity;
    }],
    ["wrong parent",
      (value) => { value.intents[1].effect.expectedParents = [value.baseSha]; },
      (value) => { value.intents[1].effect.expectedParents = [value.headSha]; }],
    ["wrong tree",
      (value) => { value.intents[1].effect.treeSha = value.baseTree; },
      (value) => { value.intents[1].effect.treeSha = preparedTree; }],
    ["wrong paths",
      (value) => { value.intents[1].effect.stagedPaths = changedFiles; },
      (value) => { value.intents[1].effect.stagedPaths = [changedFiles[0]]; }],
    ["wrong message",
      (value) => { value.intents[1].effect.messageDigest = "0".repeat(64); },
      (value) => { value.intents[1].effect.messageDigest = hash(subject); }],
    ["duplicate intent",
      (value) => { value.intents.push(structuredClone(value.intents[1])); },
      (value) => { value.intents.pop(); }],
  ]) {
    mutate(fixture);
    assert.equal(verify(fixture).reasonCode, "historical_candidate_checkout_mismatch", name);
    restore(fixture);
  }

  run(fixture.repoRoot, ["commit", "--allow-empty", "-m", "unexpected second commit"]);
  assert.equal(verify(fixture).reasonCode, "historical_candidate_checkout_mismatch");
});

test("historical initial candidate uses the bounded production diff digest", () => {
  const fixture = makeFixture(1, "x".repeat(600_000));
  const result = verify(fixture);
  assert.equal(result.ok, true, result.reasonCode);
});

test("historical initial candidate derives the active successor generation from recovery authority", () => {
  for (const generation of [2, 9]) {
    const fixture = makeFixture(1);
    fixture.lifecycle.sessions.generation = generation;
    fixture.lifecycle.mutationAuthority.generation = generation;
    fixture.state.sessionLifecycle = structuredClone(fixture.lifecycle);
    const result = verify(fixture);
    assert.equal(result.ok, true, `${generation}: ${result.reasonCode}`);
  }
});

test("historical initial candidate accepts exact durable pre-external restart checkpoints", () => {
  const first = ordinaryContinuationPhases.indexOf("local_validation");
  const end = ordinaryContinuationPhases.indexOf("push");
  for (let current = first; current < end; current += 1) {
    const fixture = makeFixture(2);
    const continuation = fixture.state.ordinaryContinuation;
    continuation.phase = ordinaryContinuationPhases[current];
    for (let index = first; index < current; index += 1) {
      const phase = ordinaryContinuationPhases[index];
      continuation.effects[phase] = {
        targetDigest: ordinaryContinuationPhaseTarget(continuation, phase),
        completedAt: "2026-07-27T00:00:00.000Z",
        evidence: { status: "passed" },
      };
    }
    const result = verify(fixture);
    assert.equal(result.ok, true, `${continuation.phase}: ${result.reasonCode}`);
  }

  const malformed = makeFixture(2);
  malformed.state.ordinaryContinuation.phase = "external_review";
  malformed.state.ordinaryContinuation.effects.local_validation = {
    targetDigest: "0".repeat(64),
    completedAt: "2026-07-27T00:00:00.000Z",
  };
  assert.equal(verify(malformed).reasonCode, "historical_candidate_local_effect_mismatch");

  const legacy = makeFixture(2);
  legacy.state.ordinaryContinuation.phase = "external_review";
  legacy.state.ordinaryContinuation.effects.local_validation = {
    targetDigest: ordinaryContinuationLegacyPhaseTarget(
      legacy.state.ordinaryContinuation, "local_validation",
    ),
    completedAt: "2026-07-27T00:00:00.000Z",
  };
  assert.equal(verify(legacy).ok, true);
  legacy.state.ordinaryContinuation.expectedOriginMainSha = legacy.mainSha;
  assert.equal(verify(legacy).reasonCode, "historical_candidate_local_effect_mismatch");
});

test("historical initial candidate accepts only bounded downstream lifecycle postures", () => {
  for (const phase of ["external_review", "codex_mechanics_security_review", "review_fix", "push", "pr_create_recover", "ci_wait"]) {
    const fixture = makeFixture(2);
    fixture.lifecycle.controller = { phase, nextExactAction: `resume_${phase}` };
    fixture.lifecycle.recovery.phaseAfter = phase;
    fixture.state.sessionLifecycle = structuredClone(fixture.lifecycle);
    fixture.options.expectedLifecyclePhase = phase;
    const result = verify(fixture);
    assert.equal(result.ok, true, `${phase}: ${result.reasonCode}`);
  }
  const genericHandoff = makeFixture(2);
  const genericPredecessor = genericHandoff.lifecycle.sessions.retired.at(-1);
  const genericRequestId = hash(`${operationId}:${genericPredecessor}`);
  const genericSuccessor =
    `recovery-handoff:${hash(JSON.stringify([runId, operationId, genericRequestId]))}`;
  genericHandoff.lifecycle.sessions.current = genericSuccessor;
  genericHandoff.lifecycle.mutationAuthority.ownerSessionId = genericSuccessor;
  genericHandoff.lifecycle.mutationAuthority.handoff = {
    ...genericHandoff.lifecycle.mutationAuthority.handoff,
    requestId: genericRequestId,
    reason: "provider_stream_disconnect",
    successorSessionId: genericSuccessor,
  };
  genericHandoff.lifecycle.controller = {
    phase: "external_review",
    nextExactAction: "resume_external_review",
  };
  genericHandoff.lifecycle.recovery.phaseAfter = "external_review";
  genericHandoff.state.sessionLifecycle = structuredClone(genericHandoff.lifecycle);
  genericHandoff.options.expectedLifecyclePhase = "external_review";
  assert.equal(verify(genericHandoff).ok, true);
  genericHandoff.lifecycle.mutationAuthority.handoff.requestId = "f".repeat(64);
  assert.equal(
    verify(genericHandoff).reasonCode,
    "historical_candidate_lifecycle_mismatch",
  );
  const unsupported = makeFixture(2);
  unsupported.lifecycle.controller = { phase: "merge", nextExactAction: "merge" };
  unsupported.lifecycle.recovery.phaseAfter = "merge";
  unsupported.state.sessionLifecycle = structuredClone(unsupported.lifecycle);
  unsupported.options.expectedLifecyclePhase = "merge";
  assert.equal(verify(unsupported).reasonCode, "historical_candidate_lifecycle_mismatch");
});

test("read-only task-ref preparation accepts only the exact terminal validation retry posture", () => {
  const fixture = makeFixture(2);
  fixture.lifecycle.controller = {
    phase: "stopped",
    nextExactAction: "checkpoint_validation_recovery_failed_closed",
  };
  fixture.lifecycle.report.status = "stopped";
  fixture.lifecycle.mutationAuthority = {
    generation: fixture.lifecycle.sessions.generation,
    status: "terminal",
    ownerSessionId: null,
  };
  fixture.lifecycle.recovery.phaseAfter = "checkpoint_validation_commit";
  fixture.state.sessionLifecycle = structuredClone(fixture.lifecycle);
  fixture.options.allowTerminalValidationRetryPreparation = true;
  fixture.options.expectedTerminalLifecyclePhase = "checkpoint_validation_commit";
  assert.equal(verify(fixture).ok, true);
  fixture.lifecycle.controller.nextExactAction = "foreign";
  assert.equal(verify(fixture).reasonCode, "historical_candidate_lifecycle_mismatch");
});

test("historical initial candidate resumes an exactly intended local source-fix descendant", () => {
  const fixture = makeFixture(2);
  advanceWithSourceFix(fixture);
  fixture.options.validateCommitLineage = (repoRoot, identity, intents, paths) =>
    validatePreservedRecoveryCommitLineage(repoRoot, identity, intents, paths, {
      HOME: process.env.HOME,
      PATH: "/usr/bin:/bin",
      LANG: "C",
      LC_ALL: "C",
    }, { global: [], system: [] });
  const result = verify(fixture);
  assert.equal(result.ok, true, result.reasonCode);
  assert.equal(result.candidateIdentity.headSha, fixture.advancedHeadSha);

  const repeated = verify(fixture);
  assert.deepEqual(repeated, result);
  assert.equal(fixture.state.pr.number, null);
  assert.equal(Object.keys(fixture.state.mutationMarkers.push || {}).length, 0);
});

test("historical descendant admits a newly added path only through task-scope authority", () => {
  const fixture = makeFixture(2);
  const addedPath = "apps/mobile/test/receipt_ocr_capture/source_fix_support.dart";
  advanceWithSourceFix(fixture, addedPath);
  fixture.options.validateChangedPaths = (paths) =>
    paths.every((entry) => changedFiles.includes(entry)
      || entry.startsWith("apps/mobile/test/receipt_ocr_capture/"));
  assert.equal(verify(fixture).ok, true);
  fixture.options.validateChangedPaths = () => false;
  assert.equal(verify(fixture).reasonCode, "historical_candidate_advanced_lineage_mismatch");
});

test("historical descendant admits only authenticated existing-PR effects", () => {
  const fixture = makeFixture(2);
  advanceWithSourceFix(fixture);
  authenticateExistingPrFixture(fixture);
  fixture.options.allowAuthenticatedExistingPrEffects = true;
  assert.equal(verify(fixture).ok, true);
  for (const [lifecyclePhase, continuationPhase] of [
    ["push", "push"],
    ["pr_create_recover", "pr_create_or_update"],
    ["ci_wait", "github_convergence"],
  ]) {
    const continuation = fixture.state.ordinaryContinuation;
    continuation.phase = continuationPhase;
    continuation.effects = {};
    const current = ordinaryContinuationPhases.indexOf(continuationPhase);
    for (let index = ordinaryContinuationPhases.indexOf("local_validation"); index < current; index += 1) {
      const phase = ordinaryContinuationPhases[index];
      continuation.effects[phase] = {
        targetDigest: ordinaryContinuationPhaseTarget(continuation, phase),
        completedAt: "2026-07-27T00:00:00.000Z",
      };
    }
    fixture.lifecycle.controller = { phase: lifecyclePhase, nextExactAction: lifecyclePhase };
    fixture.lifecycle.recovery.phaseAfter = lifecyclePhase;
    fixture.state.sessionLifecycle = structuredClone(fixture.lifecycle);
    fixture.options.expectedLifecyclePhase = lifecyclePhase;
    assert.equal(verify(fixture).ok, true, `${lifecyclePhase}/${continuationPhase}`);
  }

  fixture.state.ordinaryContinuation.counters.githubTriggeredFixEpochsPerPr = 0;
  fixture.state.ordinaryContinuation.processedGithubFindingFingerprints = [];
  assert.equal(verify(fixture).ok, true);

  fixture.state.ordinaryContinuation.counters.githubTriggeredFixEpochsPerPr = 0;
  fixture.state.ordinaryContinuation.processedGithubFindingFingerprints = ["f".repeat(64)];
  assert.equal(verify(fixture).reasonCode, "historical_candidate_later_effect_present");
  fixture.state.ordinaryContinuation.counters.githubTriggeredFixEpochsPerPr = 1;
  fixture.state.ordinaryContinuation.processedGithubFindingFingerprints = [];
  assert.equal(verify(fixture).reasonCode, "historical_candidate_later_effect_present");
  fixture.state.ordinaryContinuation.processedGithubFindingFingerprints = ["f".repeat(64)];
  fixture.intents.push({
    ...structuredClone(fixture.intents.at(-1)),
    effectType: "comment",
  });
  assert.equal(verify(fixture).reasonCode, "historical_candidate_later_effect_present");
});

test("historical existing-PR authentication binds every durable authority to the exact PR and head", () => {
  const mutations = [
    ["wrong PR number", (f) => { f.state.pr.number = 1008; }],
    ["wrong PR URL", (f) => { f.state.pr.url = `https://github.com/${repository}/pull/1008`; }],
    ["wrong PR base", (f) => { f.state.pr.baseRefName = "release"; }],
    ["wrong PR branch", (f) => { f.state.pr.headRefName = `${branch}-foreign`; }],
    ["prior PR head", (f) => { f.state.pr.headSha = f.headSha; }],
    ["wrong remote head", (f) => { run(f.repoRoot, ["update-ref", `refs/remotes/origin/${branch}`, f.headSha]); }],
    ["missing push marker", (f) => { delete f.state.mutationMarkers.push; }],
    ["wrong push marker head", (f) => { f.state.mutationMarkers.push.push.correlation = f.headSha; }],
    ["wrong PR marker URL", (f) => { f.state.mutationMarkers.pr_create.pr.target = `https://github.com/${repository}/pull/1008`; }],
    ["duplicate-like push intent", (f) => { f.intents.push(structuredClone(f.intents.find((entry) => entry.effectType === "push"))); }],
    ["mixed push branch", (f) => { f.intents.find((entry) => entry.effectType === "push").effect.remoteBranch = `${branch}-foreign`; }],
    ["prior push head", (f) => { f.intents.find((entry) => entry.effectType === "push").effect.localSha = f.headSha; }],
    ["wrong PR intent base", (f) => { f.intents.find((entry) => entry.effectType === "pr_create").effect.targetBaseSha = f.baseSha; }],
    ["wrong PR intent issue", (f) => { f.intents.find((entry) => entry.effectType === "pr_create").effect.issueNumber = issueNumber + 1; }],
    ["wrong continuation main", (f) => { f.state.ordinaryContinuation.expectedOriginMainSha = f.baseSha; }],
  ];
  for (const [name, mutate] of mutations) {
    const fixture = makeFixture(2);
    advanceWithSourceFix(fixture);
    authenticateExistingPrFixture(fixture);
    fixture.options.allowAuthenticatedExistingPrEffects = true;
    mutate(fixture);
    assert.equal(verify(fixture).reasonCode, "historical_candidate_later_effect_present", name);
  }
});

test("historical recovery authenticates the exact push-only PR-create checkpoint", () => {
  const fixture = makeFixture(2);
  advanceWithSourceFix(fixture);
  authenticateExistingPrFixture(fixture);
  fixture.options.allowAuthenticatedExistingPrEffects = true;
  fixture.intents.splice(
    fixture.intents.findIndex((entry) => entry.effectType === "pr_create"),
    1,
  );
  fixture.state.pr = { number: null, url: null, headSha: null };
  delete fixture.state.mutationMarkers.pr_create;
  const continuation = fixture.state.ordinaryContinuation;
  continuation.phase = "pr_create_or_update";
  continuation.effects = {};
  const current = ordinaryContinuationPhases.indexOf(continuation.phase);
  for (let index = ordinaryContinuationPhases.indexOf("local_validation"); index < current; index += 1) {
    const phase = ordinaryContinuationPhases[index];
    continuation.effects[phase] = {
      targetDigest: ordinaryContinuationPhaseTarget(continuation, phase),
      completedAt: "2026-07-27T00:00:00.000Z",
    };
  }
  fixture.lifecycle.controller = {
    phase: "pr_create_recover", nextExactAction: "pr_create_recover",
  };
  fixture.lifecycle.recovery.phaseAfter = "pr_create_recover";
  fixture.state.sessionLifecycle = structuredClone(fixture.lifecycle);
  fixture.options.expectedLifecyclePhase = "pr_create_recover";
  const pushOnlyResult = verify(fixture);
  assert.equal(pushOnlyResult.ok, true, pushOnlyResult.reasonCode);

  fixture.state.branch.expectedRemoteHeadSha = null;
  assert.equal(verify(fixture).reasonCode, "historical_candidate_later_effect_present");
  fixture.state.branch.expectedRemoteHeadSha = continuation.identity.headSha;
  fixture.intents.push(structuredClone(fixture.intents.find((entry) => entry.effectType === "push")));
  assert.equal(verify(fixture).reasonCode, "historical_candidate_later_effect_present");
});

test("historical existing-PR authentication accepts only a contiguous bounded head-update chain", () => {
  const fixture = makeFixture(2);
  advanceWithSourceFix(fixture);
  authenticateExistingPrFixture(fixture);
  advanceAuthenticatedExistingPrHead(fixture);
  fixture.options.allowAuthenticatedExistingPrEffects = true;
  assert.equal(verify(fixture).ok, true);

  const pushUpdate = fixture.intents.filter((entry) => entry.effectType === "push").at(-1);
  const prUpdate = fixture.intents.filter((entry) => entry.effectType === "pr_create").at(-1);
  const exactPrior = pushUpdate.effect.expectedRemoteBeforeSha;
  const exactFinal = pushUpdate.effect.localSha;
  for (const [name, mutate, restore] of [
    ["chain gap",
      () => { pushUpdate.effect.expectedRemoteBeforeSha = fixture.baseSha; },
      () => { pushUpdate.effect.expectedRemoteBeforeSha = exactPrior; }],
    ["stale endpoint",
      () => { fixture.state.pr.headSha = exactPrior; },
      () => { fixture.state.pr.headSha = exactFinal; }],
    ["duplicate update",
      () => { fixture.intents.push(structuredClone(prUpdate)); },
      () => { fixture.intents.pop(); }],
    ["mixed update branch",
      () => { prUpdate.identity.branchName = `${branch}-foreign`; },
      () => { prUpdate.identity.branchName = branch; }],
    ["missing update marker",
      () => { delete fixture.state.mutationMarkers.pr_create.update; },
      () => {
        fixture.state.mutationMarkers.pr_create.update = {
          status: "completed", target: fixture.state.pr.url, correlation: exactFinal,
        };
      }],
  ]) {
    mutate();
    assert.equal(verify(fixture).reasonCode, "historical_candidate_later_effect_present", name);
    restore();
  }
});

test("historical initial candidate fail-closes an unauthenticated local source-fix descendant", () => {
  const missingIntent = makeFixture(1);
  advanceWithSourceFix(missingIntent);
  missingIntent.intents.pop();
  assert.equal(verify(missingIntent).reasonCode, "historical_candidate_advanced_lineage_mismatch");

  const wrongTree = makeFixture(1);
  advanceWithSourceFix(wrongTree);
  wrongTree.intents[1].effect.treeSha = wrongTree.state.ordinaryContinuation.sourceFailureHistory[0]
    .candidate.treeSha;
  assert.equal(verify(wrongTree).reasonCode, "historical_candidate_advanced_lineage_mismatch");

  const ambiguousOriginal = makeFixture(1);
  ambiguousOriginal.state.ordinaryContinuation.sourceFailureHistory = [{
    candidate: { ...structuredClone(ambiguousOriginal.state.ordinaryContinuation.sourceFailureBatch.candidate),
      headSha: ambiguousOriginal.baseSha },
  }];
  assert.equal(verify(ambiguousOriginal).reasonCode, "historical_candidate_history_identity_mismatch");
});

function verify(fixture) {
  return verifyHistoricalInitialCandidateLineage(
    fixture.config, fixture.state, fixture.issue || { number: issueNumber }, fixture.options,
  );
}

function authenticatePrePrTerminalFixture(fixture) {
  const chargeIdentity = fixture.options.loadBudget().statePath;
  const commentDigest = "d".repeat(64);
  fixture.intents[0].sessionId ||= "terminal-hygiene-session";
  fixture.intents[0].authorityGeneration ??= 3;
  const terminalSessionId = fixture.intents[0].sessionId;
  const terminalGeneration = fixture.intents[0].authorityGeneration;
  fixture.issue = {
    number: issueNumber,
    labels: ["area:ocr", "area:mobile-ui", "type:bug", "scope:day1", "auto-ready", "auto-failed"],
  };
  fixture.state.phase = "stopped";
  fixture.state.firstIncompleteAction = "run_validation_and_commit";
  fixture.state.nextSafeAction = "stop_fail_closed";
  fixture.state.stopReason = {
    reasonCode: "checkpoint_validation_recovery_failed_closed",
    reason: "initial_validation_failure_commit_reconstruction_ambiguous",
  };
  fixture.state.evidence = { localValidation: { status: "failed" } };
  fixture.lifecycle.repository = repository;
  fixture.lifecycle.logicalTask = {
    ...fixture.lifecycle.logicalTask,
    issueNumber, taskKey, runId, supervisorRunId,
  };
  fixture.lifecycle.branch.prNumber = null;
  const recoverySessionId = `${runId}:recovery:${operationId}`;
  const requestId = hash(`${operationId}:${recoverySessionId}:validation-retry`);
  const successorSessionId = `recovery-handoff:${hash(JSON.stringify([runId, operationId, requestId]))}`;
  fixture.lifecycle.sessions.current = successorSessionId;
  fixture.lifecycle.sessions.retired = [terminalSessionId, recoverySessionId];
  fixture.lifecycle.mutationAuthority = {
    generation: fixture.lifecycle.sessions.generation,
    status: "terminal",
    ownerSessionId: null,
  };
  fixture.lifecycle.controller = {
    phase: "stopped",
    nextExactAction: "checkpoint_validation_recovery_failed_closed",
  };
  fixture.lifecycle.report.status = "stopped";
  fixture.state.sessionLifecycle = structuredClone(fixture.lifecycle);
  fixture.options.allowTerminalValidationRetryPreparation = true;
  fixture.options.expectedTerminalLifecyclePhase = "checkpoint_validation_commit";
  fixture.options.expectedTerminalOutcome = "validation_failed";
  fixture.options.expectedTerminalCommentBodyDigest = commentDigest;
  const identity = (sessionId, authorityGeneration) => ({
    repository, sourceTaskKey: taskKey, runId,
    logicalTaskIdentity: `${repository}#${issueNumber}`,
    claimIdentity: `${repository}#${issueNumber}`, chargeIdentity,
    sessionId, authorityGeneration, issueNumber, branchName: branch,
    baseSha: fixture.baseSha, headSha: fixture.headSha, candidateIdentity: fixture.headSha,
  });
  const common = (sessionId, authorityGeneration) => ({
    repository, sourceTaskKey: taskKey, runId,
    logicalTaskIdentity: `${repository}#${issueNumber}`,
    claimIdentity: `${repository}#${issueNumber}`, chargeIdentity,
    sessionId, authorityGeneration,
  });
  fixture.intents.push({
    ...common(terminalSessionId, terminalGeneration),
    effectType: "hygiene_component", intentId: "11111111-1111-4111-8111-111111111111", fingerprint: "1".repeat(64),
    status: "finalized", identity: identity(terminalSessionId, terminalGeneration),
    effect: {
      addLabels: ["auto-failed"], issueNumber, operation: "add",
      outcome: "validation_failed", removeLabels: [],
    },
  }, {
    ...common(terminalSessionId, terminalGeneration),
    effectType: "hygiene_component", intentId: "22222222-2222-4222-8222-222222222222", fingerprint: "2".repeat(64),
    status: "finalized", identity: identity(terminalSessionId, terminalGeneration),
    effect: {
      addLabels: [], issueNumber, operation: "remove",
      outcome: "validation_failed", removeLabels: ["auto-running", "auto-claimed"],
    },
  }, {
    ...common(successorSessionId, 6),
    effectType: "comment", intentId: "33333333-3333-4333-8333-333333333333", fingerprint: "3".repeat(64),
    status: "prepared", identity: identity(successorSessionId, 6),
    effect: { bodyDigest: commentDigest, issueNumber, outcome: "validation_failed" },
    recoveryProvenance: {
      sessionId: recoverySessionId, authorityGeneration: 5,
      fingerprint: hash(canonical({
        effectType: "comment",
        identity: identity(recoverySessionId, 5),
        effect: { bodyDigest: commentDigest, issueNumber, outcome: "validation_failed" },
      })),
    },
    diagnostics: ["validated_successor_authority_handoff"],
  });
}

function advanceWithSourceFix(fixture, addedPath = null) {
  const initial = structuredClone(fixture.state.ordinaryContinuation.sourceFailureBatch.candidate);
  const subject = `Auto-runner issue #${issueNumber}: source-fix abcdef0123456789`;
  writeFileSync(path.join(fixture.repoRoot, changedFiles[0]), "candidate-0\nsource-fix\n");
  if (addedPath) {
    mkdirSync(path.dirname(path.join(fixture.repoRoot, addedPath)), { recursive: true });
    writeFileSync(path.join(fixture.repoRoot, addedPath), "support\n");
  }
  const stagedPaths = [changedFiles[0], ...(addedPath ? [addedPath] : [])].sort();
  run(fixture.repoRoot, ["add", ...stagedPaths]);
  run(fixture.repoRoot, ["commit", "-m", subject]);
  const advancedHeadSha = run(fixture.repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const treeSha = run(fixture.repoRoot, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
  const diffDigest = hash(run(fixture.repoRoot,
    ["diff", "--binary", `${fixture.baseSha}...${advancedHeadSha}`]).stdout.slice(0, 512_000));
  const identity = {
    baseSha: fixture.baseSha, headSha: advancedHeadSha, treeSha, diffDigest,
    changedFiles: [...changedFiles, ...(addedPath ? [addedPath] : [])].sort(),
    changedFilesDigest: hashJson([...changedFiles, ...(addedPath ? [addedPath] : [])].sort()),
  };
  fixture.state.ordinaryContinuation.identity = structuredClone(identity);
  fixture.state.ordinaryContinuation.sourceFailureHistory = [{ candidate: initial }];
  fixture.state.ordinaryContinuation.sourceFailureBatch = null;
  fixture.state.branch.currentHeadSha = fixture.headSha;
  fixture.lifecycle.branch.headSha = advancedHeadSha;
  fixture.state.sessionLifecycle = structuredClone(fixture.lifecycle);
  fixture.intents.push({
    repository, sourceTaskKey: taskKey, runId, effectType: "commit", status: "finalized",
    logicalTaskIdentity: `${repository}#${issueNumber}`, claimIdentity: `${repository}#${issueNumber}`,
    chargeIdentity: fixture.options.loadBudget().statePath,
    identity: {
      issueNumber, branchName: branch, baseSha: fixture.baseSha, headSha: fixture.headSha,
      candidateIdentity: fixture.headSha,
    },
    effect: {
      expectedParents: [fixture.headSha], treeSha, stagedPaths,
      messageDigest: hash(subject),
    },
  });
  fixture.advancedHeadSha = advancedHeadSha;
}

function authenticateExistingPrFixture(fixture) {
  const continuation = fixture.state.ordinaryContinuation;
  const exactHead = continuation.identity.headSha;
  const exactUrl = `https://github.com/${repository}/pull/1007`;
  const chargeIdentity = fixture.options.loadBudget().statePath;
  continuation.expectedOriginMainSha = fixture.mainSha;
  continuation.counters.githubTriggeredFixEpochsPerPr = 1;
  continuation.processedGithubFindingFingerprints = ["f".repeat(64)];
  fixture.state.pr = {
    number: 1007, url: exactUrl, headSha: exactHead,
    headRefName: branch, baseRefName: "main", state: "OPEN",
  };
  fixture.state.branch.expectedRemoteHeadSha = exactHead;
  fixture.state.mutationMarkers.push = {
    push: { status: "completed", target: branch, correlation: exactHead },
  };
  fixture.state.mutationMarkers.pr_create = {
    pr: { status: "completed", target: exactUrl, correlation: exactHead },
  };
  run(fixture.repoRoot, ["update-ref", `refs/remotes/origin/${branch}`, exactHead]);
  fixture.intents.push({
    repository, sourceTaskKey: taskKey, runId, effectType: "push", status: "finalized",
    logicalTaskIdentity: `${repository}#${issueNumber}`,
    claimIdentity: `${repository}#${issueNumber}`,
    chargeIdentity,
    identity: {
      repository, sourceTaskKey: taskKey, runId,
      logicalTaskIdentity: `${repository}#${issueNumber}`,
      claimIdentity: `${repository}#${issueNumber}`, chargeIdentity,
      issueNumber, branchName: branch, baseSha: fixture.baseSha, headSha: exactHead,
      candidateIdentity: exactHead,
    },
    effect: {
      repositoryOwnership: repository, remoteBranch: branch, localSha: exactHead,
      expectedRemoteBeforeSha: null, allowedFastForwardTarget: exactHead,
    },
  });
  fixture.intents.push({
    repository, sourceTaskKey: taskKey, runId, effectType: "pr_create", status: "finalized",
    logicalTaskIdentity: `${repository}#${issueNumber}`,
    claimIdentity: `${repository}#${issueNumber}`,
    chargeIdentity,
    identity: {
      repository, sourceTaskKey: taskKey, runId,
      logicalTaskIdentity: `${repository}#${issueNumber}`,
      claimIdentity: `${repository}#${issueNumber}`, chargeIdentity,
      issueNumber, branchName: branch, baseBranch: "main",
      baseSha: fixture.mainSha, headSha: exactHead, candidateIdentity: exactHead,
    },
    effect: {
      issueNumber, sourceBranch: branch, sourceHeadSha: exactHead,
      targetBaseBranch: "main", targetBaseSha: fixture.mainSha, draft: false,
    },
  });
}

function advanceAuthenticatedExistingPrHead(fixture) {
  const continuation = fixture.state.ordinaryContinuation;
  const previous = structuredClone(continuation.identity);
  const previousHead = previous.headSha;
  const subject = `Auto-runner issue #${issueNumber}: source-fix fedcba9876543210`;
  writeFileSync(path.join(fixture.repoRoot, changedFiles[0]), "candidate-0\nsource-fix\nsecond-fix\n");
  run(fixture.repoRoot, ["add", changedFiles[0]]);
  run(fixture.repoRoot, ["commit", "-m", subject]);
  const headSha = run(fixture.repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const treeSha = run(fixture.repoRoot, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
  const changed = [...changedFiles];
  continuation.sourceFailureHistory.push({ candidate: previous });
  continuation.identity = {
    baseSha: fixture.baseSha,
    headSha,
    treeSha,
    diffDigest: hash(run(fixture.repoRoot,
      ["diff", "--binary", `${fixture.baseSha}...${headSha}`]).stdout.slice(0, 512_000)),
    changedFiles: changed,
    changedFilesDigest: hashJson(changed),
  };
  fixture.lifecycle.branch.headSha = headSha;
  fixture.state.sessionLifecycle = structuredClone(fixture.lifecycle);
  fixture.state.pr.headSha = headSha;
  fixture.state.branch.expectedRemoteHeadSha = headSha;
  run(fixture.repoRoot, ["update-ref", `refs/remotes/origin/${branch}`, headSha]);
  const chargeIdentity = fixture.options.loadBudget().statePath;
  const common = {
    repository, sourceTaskKey: taskKey, runId, status: "finalized",
    logicalTaskIdentity: `${repository}#${issueNumber}`,
    claimIdentity: `${repository}#${issueNumber}`, chargeIdentity,
  };
  fixture.intents.push({
    ...common,
    effectType: "commit",
    identity: {
      issueNumber, branchName: branch, baseSha: fixture.baseSha,
      headSha: previousHead, candidateIdentity: previousHead,
    },
    effect: {
      expectedParents: [previousHead], treeSha, stagedPaths: [changedFiles[0]],
      messageDigest: hash(subject),
    },
  });
  fixture.intents.push({
    ...common,
    effectType: "push",
    identity: {
      ...common, issueNumber, branchName: branch, baseSha: fixture.baseSha,
      headSha, candidateIdentity: headSha,
    },
    effect: {
      repositoryOwnership: repository, remoteBranch: branch, localSha: headSha,
      expectedRemoteBeforeSha: previousHead, allowedFastForwardTarget: headSha,
    },
  });
  fixture.intents.push({
    ...common,
    effectType: "pr_create",
    identity: {
      ...common, issueNumber, branchName: branch, baseBranch: "main",
      baseSha: fixture.mainSha, headSha, candidateIdentity: headSha,
    },
    effect: {
      issueNumber, sourceBranch: branch, sourceHeadSha: headSha,
      targetBaseBranch: "main", targetBaseSha: fixture.mainSha,
      prNumber: 1007, prUrl: fixture.state.pr.url,
    },
  });
  fixture.state.mutationMarkers.push.update = {
    status: "completed", target: branch, correlation: headSha,
  };
  fixture.state.mutationMarkers.pr_create.update = {
    status: "completed", target: fixture.state.pr.url, correlation: headSha,
  };
  fixture.advancedHeadSha = headSha;
}

function makeFixture(advances, candidateSuffix = "") {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-historical-candidate-"));
  const repoRoot = path.join(root, "repo");
  const logsRoot = path.join(root, "logs");
  mkdirSync(repoRoot);
  mkdirSync(path.join(logsRoot, "tasks"), { recursive: true });
  run(repoRoot, ["init", "-b", "main"]);
  run(repoRoot, ["config", "user.name", "fixture"]);
  run(repoRoot, ["config", "user.email", "fixture@example.invalid"]);
  run(repoRoot, ["remote", "add", "origin", `https://github.com/${repository}.git`]);
  for (const file of changedFiles) {
    mkdirSync(path.dirname(path.join(repoRoot, file)), { recursive: true });
    writeFileSync(path.join(repoRoot, file), "base\n");
  }
  run(repoRoot, ["add", ...changedFiles]);
  run(repoRoot, ["commit", "-m", "historical base"]);
  const baseSha = run(repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const baseTree = run(repoRoot, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
  run(repoRoot, ["checkout", "-b", branch]);
  changedFiles.forEach((file, index) => writeFileSync(
    path.join(repoRoot, file), `candidate-${index}\n${index === 0 ? candidateSuffix : ""}`,
  ));
  run(repoRoot, ["add", ...changedFiles]);
  const subject = `Auto-runner issue #${issueNumber}: initial candidate before source classification`;
  run(repoRoot, ["commit", "-m", subject]);
  const headSha = run(repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const treeSha = run(repoRoot, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
  const diffDigest = hash(run(repoRoot, ["diff", "--binary", `${baseSha}...${headSha}`]).stdout.slice(0, 512_000));
  const changedFilesDigest = hashJson(changedFiles);
  run(repoRoot, ["checkout", "main"]);
  for (let index = 0; index < advances; index += 1) {
    writeFileSync(path.join(repoRoot, `main-${index}`), `${index}\n`);
    run(repoRoot, ["add", `main-${index}`]);
    run(repoRoot, ["commit", "-m", `legitimate main ${index}`]);
  }
  const mainSha = run(repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
  run(repoRoot, ["update-ref", "refs/remotes/origin/main", mainSha]);
  run(repoRoot, ["checkout", branch]);
  const commonDir = path.resolve(repoRoot, run(repoRoot, ["rev-parse", "--git-common-dir"]).stdout.trim());
  const reportPath = path.join(repoRoot, ".codex", "reports",
    `settleora-codex-report-${taskKey}-issue-${issueNumber}-fixture.md`);
  const promptPath = path.join(logsRoot, "tasks", `${taskKey}-issue-${issueNumber}-fixture.md`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  mkdirSync(path.dirname(promptPath), { recursive: true });
  writeFileSync(reportPath, "fixture report\n", { mode: 0o600 });
  writeFileSync(promptPath, "fixture prompt\n", { mode: 0o600 });
  writeFileSync(path.join(commonDir, "info", "exclude"), ".codex/\n");
  const budgetPath = path.join(logsRoot, "logical-task-budget.json");
  const candidate = { baseSha, headSha, treeSha, diffDigest, changedFiles, changedFilesDigest };
  const state = {
    taskKey, issue: { number: issueNumber }, run: { runId, supervisorRunId },
    branch: { name: branch, baseSha, currentHeadSha: headSha, expectedRemoteHeadSha: null },
    pr: { number: null, url: null, headSha: null },
    expectedReportPaths: { repoReportPath: reportPath, promptPath },
    mutationMarkers: {
      claim: { [`issue-${issueNumber}`]: { status: "completed", correlation: runId } },
      logical_task_charge: { [chargeId]: { status: "completed", correlation: chargeId } },
      branch_ownership_created: { [`${branch}:${baseSha}`]: { status: "completed" } },
    },
    ordinaryContinuation: {
      version: 1, logicalTaskKey: `issue-${issueNumber}`, executionKey: runId, issueNumber,
      branchName: branch, identity: structuredClone(candidate), phase: "local_validation",
      counters: { acceptedLogicalTasks: 1 }, effects: {},
      sourceFailureBatch: { candidate: structuredClone(candidate) },
    },
  };
  const recoveryPredecessor = `${runId}:recovery:${operationId}`;
  const recoveryRequestId = hash(
    `${operationId}:${recoveryPredecessor}:validation-retry`,
  );
  const recoverySuccessor =
    `recovery-handoff:${hash(JSON.stringify([runId, operationId, recoveryRequestId]))}`;
  const lifecycle = {
    logicalTask: { claimIdentity: `${repository}#${issueNumber}`, supervisorRunId, chargeMarkerRef: budgetPath },
    branch: { name: branch, baseSha, headSha },
    sessions: { generation: 6, current: recoverySuccessor, retired: [recoveryPredecessor] },
    mutationAuthority: {
      generation: 6, status: "active", ownerSessionId: recoverySuccessor,
      handoff: {
        requestId: recoveryRequestId,
        retiredSessionId: recoveryPredecessor,
        reason: "validation_retry_derivative_reopened",
        successorSessionId: recoverySuccessor,
      },
    },
    controller: {
      phase: "checkpoint_validation_commit", nextExactAction: "run_validation_and_commit",
    },
    checkpoint: { status: "ready", digest: "a".repeat(64) },
    recovery: {
      status: "pending", phaseAfter: "checkpoint_validation_commit",
      operationId, effectsAlreadyPresent: {
        commit: true, push: false, pr: false, merge: false, comment: false,
      },
    },
    report: { path: reportPath, correlationKey: taskKey, status: "in_progress" },
  };
  state.sessionLifecycle = structuredClone(lifecycle);
  const budget = {
    ok: true, statePath: budgetPath,
    state: {
      acceptedLogicalTaskCount: 1,
      charges: { [chargeId]: { identity: {
        repository, issueNumber, claimIdentity: `${repository}#${issueNumber}`,
      } } },
    },
  };
  const intents = [{
    repository, sourceTaskKey: taskKey, runId, effectType: "commit", status: "finalized",
    logicalTaskIdentity: `${repository}#${issueNumber}`, claimIdentity: `${repository}#${issueNumber}`,
    chargeIdentity: budgetPath,
    identity: { issueNumber, branchName: branch, baseSha, headSha: baseSha, candidateIdentity: baseSha },
    effect: {
      expectedParents: [baseSha], treeSha, stagedPaths: changedFiles,
      messageDigest: hash(subject),
    },
  }];
  return {
    repoRoot, logsRoot, commonDir, baseSha, baseTree, headSha, mainSha, state, lifecycle, intents,
    config: { repoRoot, logsRoot, repositorySlug: repository },
    options: {
      expectedChargeId: chargeId, expectedRecoveryOperationId: operationId,
      loadLifecycle: () => ({ ok: true, state: lifecycle }),
      loadBudget: () => budget,
      findIntents: (_config, predicate) => intents.filter(predicate),
      validateProjectNamespace: () => true,
      validateCommitLineage: () => ({ ok: true }),
      readRemoteTaskBranch: () => ({ complete: true, absent: true }),
      readIssueCommentDigest: () => ({ complete: true, matchingCount: 0 }),
    },
  };
}

function run(cwd, args, allowFailure = false) {
  const result = spawnSync("/usr/bin/git", args, { cwd, encoding: "utf8" });
  if (!allowFailure) assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  return result;
}
function overrideGit(fixture, overrides) {
  return (args) => overrides[args.join(" ")] || spawnSync("/usr/bin/git", args, {
    cwd: fixture.repoRoot, encoding: "utf8",
    env: {
      PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0",
      GIT_NO_LAZY_FETCH: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null",
    },
  });
}
function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function hashJson(value) { return hash(JSON.stringify(value)); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonical(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
