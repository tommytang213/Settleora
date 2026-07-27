import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { verifyHistoricalInitialCandidateLineage } from "../lib/historical-initial-candidate-lineage.mjs";
import {
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
    ["push marker", (f) => { f.state.mutationMarkers.push = { x: { status: "completed" } }; }, "historical_candidate_later_effect_present"],
    ["pr identity", (f) => { f.state.pr = { number: 1, url: "https://example.invalid", headSha: f.headSha }; }, "historical_candidate_later_effect_present"],
    ["replacement candidate", (f) => { f.state.branch.currentHeadSha = f.baseSha; }, "historical_candidate_authority_identity_mismatch"],
    ["dirty checkout", (f) => { writeFileSync(path.join(f.repoRoot, "dirty"), "x"); }, "historical_candidate_checkout_mismatch"],
    ["wrong checked out branch", (f) => { run(f.repoRoot, ["checkout", "main"]); }, "historical_candidate_checkout_mismatch"],
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
    ["external intent", (f) => { f.intents.push({ ...structuredClone(f.intents[0]), effectType: "push" }); }, "historical_candidate_external_intent_present"],
    ["canonical comment intent", (f) => {
      f.intents.push({ ...structuredClone(f.intents[0]), effectType: "comment" });
    }, "historical_candidate_external_intent_present"],
  ];
  for (const [name, mutate, reason] of cases) {
    const fixture = makeFixture(2);
    mutate(fixture);
    const result = verify(fixture);
    assert.equal(result.ok, false, name);
    assert.equal(result.reasonCode, reason, name);
  }
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
});

function verify(fixture) {
  return verifyHistoricalInitialCandidateLineage(
    fixture.config, fixture.state, { number: issueNumber }, fixture.options,
  );
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
      logicalTaskKey: `issue-${issueNumber}`, executionKey: runId, issueNumber,
      branchName: branch, identity: structuredClone(candidate), phase: "local_validation",
      counters: { acceptedLogicalTasks: 1 }, effects: {},
      sourceFailureBatch: { candidate: structuredClone(candidate) },
    },
  };
  const lifecycle = {
    logicalTask: { claimIdentity: `${repository}#${issueNumber}`, supervisorRunId, chargeMarkerRef: budgetPath },
    branch: { name: branch, baseSha, headSha },
    sessions: { generation: 6, current: "successor-session" },
    mutationAuthority: {
      generation: 6, status: "active", ownerSessionId: "successor-session",
      handoff: {
        reason: "validation_retry_derivative_reopened",
        successorSessionId: "successor-session",
      },
    },
    controller: {
      phase: "checkpoint_validation_commit", nextExactAction: "run_validation_and_commit",
    },
    checkpoint: { status: "ready", digest: "a".repeat(64) },
    recovery: {
      phaseAfter: "checkpoint_validation_commit",
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
    identity: { issueNumber, branchName: branch, baseSha, headSha: baseSha },
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
    },
  };
}

function run(cwd, args) {
  const result = spawnSync("/usr/bin/git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
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
