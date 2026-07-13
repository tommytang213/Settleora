import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deriveIssueProposals, digestProposal } from "../lib/issue-proposals.mjs";
import { executeIssueMutationPipeline, validateMutationProposal } from "../lib/issue-mutation-pipeline.mjs";

function logsRoot() {
  return mkdtempSync(path.join(tmpdir(), "settleora-generated-work-"));
}

function runnableProposal(overrides = {}) {
  const result = deriveIssueProposals({
    type: "merged_design_pr",
    taskKey: "20260713-1601",
    prNumber: 903,
    issueNumber: 891,
    parentIssue: 800,
    title: "Auto-runner generated work",
    allowedPaths: ["tools/auto-runner/**"],
    implementationSlices: [
      { title: "Validated runnable generated issue", summary: "Create one fully specified issue.", allowedPaths: ["tools/auto-runner/**"] },
      { title: "Second generated issue", summary: "Create another proposal.", allowedPaths: ["tools/auto-runner/**"] },
    ],
  });
  assert.equal(result.ok, true);
  return { ...result.proposals[0], ...overrides };
}

function runnerWith(script = []) {
  const calls = [];
  const runner = (command, args) => {
    calls.push({ command, args });
    const next = script.shift();
    if (typeof next === "function") return next(command, args, calls);
    return next || { status: 0, stdout: "", stderr: "" };
  };
  runner.calls = calls;
  return runner;
}

function rekey(proposal) {
  return { ...proposal, idempotencyKey: digestProposal({ ...proposal, idempotencyKey: undefined, laneDecision: undefined }) };
}

test("validated runnable proposal creates one fully specified issue", () => {
  const proposal = runnableProposal();
  const runner = runnerWith([
    { status: 0, stdout: "[]" },
    { status: 0, stdout: "https://github.com/tommytang213/Settleora/issues/1001" },
    { status: 0, stdout: "commented" },
    { status: 0, stdout: "labeled" },
  ]);
  const result = executeIssueMutationPipeline(
    { run: true, allowFollowupIssueCreation: true, logsRoot: logsRoot(), maxFollowupIssuesPerRun: 3 },
    [proposal],
    {},
    { runner },
  );
  assert.equal(result.results[0].action, "created");
  assert.equal(result.results[0].issue.number, 1001);
  assert.match(runner.calls.find((call) => call.args.includes("--body")).args.join(" "), /issue create/);
  assert.equal(result.results[0].components.project.status, "not_updated");
});

test("retry after uncertain response re-reads by correlation and reuses", () => {
  const proposal = runnableProposal();
  const runner = runnerWith([
    { status: 0, stdout: "[]" },
    { status: 1, stderr: "network timeout" },
    { status: 0, stdout: JSON.stringify([{ number: 1002, state: "OPEN", body: proposal.correlationKey }]) },
  ]);
  const result = executeIssueMutationPipeline(
    { run: true, allowFollowupIssueCreation: true, logsRoot: logsRoot() },
    [proposal],
    {},
    { runner },
  );
  assert.equal(result.results[0].action, "reuse");
  assert.equal(result.results[0].reason, "uncertain_create_response_reused_by_correlation");
});

test("repeated execution creates zero additional issues when exact correlation exists", () => {
  const proposal = runnableProposal();
  const runner = runnerWith();
  const result = executeIssueMutationPipeline(
    { run: true, allowFollowupIssueCreation: true, logsRoot: logsRoot() },
    [proposal],
    { openIssues: [{ number: 1003, state: "OPEN", body: proposal.correlationKey }] },
    { runner },
  );
  assert.equal(result.results[0].action, "reuse");
  assert.equal(runner.calls.filter((call) => call.args[0] === "issue" && call.args[1] === "create").length, 0);
});

test("generated contract parses and resolves to expected lane/profile/reviewer", () => {
  const proposal = runnableProposal();
  const validation = validateMutationProposal(proposal);
  assert.equal(validation.ok, true);
  assert.equal(validation.proposal.laneDecision.canonicalLane, "workflow-docs-tooling");
  assert.equal(validation.proposal.validationProfile, "runner-tests");
  assert.equal(validation.proposal.reviewerTier, "cheap_independent");
});

test("sensitive but decided work stays runnable with strong review, not automatically manual", () => {
  const proposal = rekey(runnableProposal({
    title: "Auth session security decided implementation",
    summary: "Implement decided auth session security tooling evidence.",
    allowedPaths: ["services/api/Auth/Sessions.cs"],
    autoRunnerContract: {
      contractVersion: 1,
      lane: "auth-session-security",
      allowedPaths: ["services/api/Auth/Sessions.cs"],
      validationProfile: "api-security",
      manualMergeRequired: true,
      autoMergeEligible: false,
      requiredReading: ["docs/architecture/AUTH_IDENTITY_FOUNDATION.md"],
    },
    validationProfile: "api-security",
    reviewerTier: "strong_independent",
    proposedLabels: ["area:infra", "type:feature", "workflow", "auto-ready"],
  }));
  const validation = validateMutationProposal(proposal);
  assert.equal(validation.ok, true);
  assert.equal(validation.proposal.laneDecision.manualActionRequired, false);
  assert.equal(validation.proposal.laneDecision.reviewerTier, "strong_independent");
});

test("genuine manual action receives the correct manual gate", () => {
  const result = deriveIssueProposals({
    type: "manual_decision",
    title: "Manual decision required for release policy",
    summary: "A human must approve the release policy.",
    reason: "release_policy_decision",
  });
  assert.equal(result.ok, true);
  const validation = validateMutationProposal(result.proposals[0]);
  assert.equal(validation.ok, true);
  assert.ok(validation.proposal.proposedLabels.includes("manual-gate"));
  assert.ok(validation.proposal.proposedLabels.includes("needs-tommy"));
});

test("malformed path/profile/label/contract blocks before mutation", () => {
  const proposal = runnableProposal();
  for (const bad of [
    { allowedPaths: ["../secret"] },
    { validationProfile: "not-a-profile", autoRunnerContract: { ...proposal.autoRunnerContract, validationProfile: "not-a-profile" } },
    { proposedLabels: ["surprise-label"] },
    { autoRunnerContract: { ...proposal.autoRunnerContract, lane: "missing-lane" } },
  ]) {
    const runner = runnerWith();
    const result = executeIssueMutationPipeline({ run: true, allowFollowupIssueCreation: true, logsRoot: logsRoot() }, [{ ...proposal, ...bad }], {}, { runner });
    assert.equal(result.results[0].action, "blocked");
    assert.equal(runner.calls.length, 0);
  }
});

test("max issues per run is enforced", () => {
  const first = runnableProposal();
  const second = rekey(runnableProposal({ title: "Another validated generated issue", correlationKey: `${first.correlationKey}:second` }));
  const runner = runnerWith([
    { status: 0, stdout: "[]" },
    { status: 0, stdout: "https://github.com/tommytang213/Settleora/issues/1004" },
    { status: 0 },
    { status: 0 },
  ]);
  const result = executeIssueMutationPipeline(
    { run: true, allowFollowupIssueCreation: true, logsRoot: logsRoot(), maxFollowupIssuesPerRun: 1 },
    [first, second],
    {},
    { runner },
  );
  assert.equal(result.results[0].action, "created");
  assert.equal(result.results[1].action, "blocked");
  assert.equal(result.results[1].reason, "max_issues_per_run_exceeded");
});

test("dry-run produces exact previews and no mutations while writing sanitized evidence", () => {
  const root = logsRoot();
  const proposal = runnableProposal();
  const runner = runnerWith();
  const result = executeIssueMutationPipeline({ dryRun: true, logsRoot: root }, [proposal], {}, { runner });
  assert.equal(result.results[0].action, "preview");
  assert.equal(result.results[0].preview.title, proposal.title);
  assert.equal(runner.calls.length, 0);
  const evidence = readFileSync(result.results[0].afterPath, "utf8");
  assert.match(evidence, /dry_run_no_github_mutation/);
  assert.doesNotMatch(evidence, /GEMINI_API_KEY|bearer /i);
});

test("partial comment/label/project failure records component results without duplicating issue", () => {
  const proposal = runnableProposal();
  const runner = runnerWith([
    { status: 0, stdout: "[]" },
    { status: 0, stdout: "https://github.com/tommytang213/Settleora/issues/1005" },
    { status: 1, stderr: "comment failed" },
    { status: 0, stdout: "labels ok" },
  ]);
  const result = executeIssueMutationPipeline(
    { run: true, allowFollowupIssueCreation: true, logsRoot: logsRoot() },
    [proposal],
    {},
    { runner },
  );
  assert.equal(result.results[0].action, "created");
  assert.equal(result.results[0].components.comment.status, "failed");
  assert.equal(result.results[0].components.labels.status, "updated");
});

test("bundle proposals can receive auto-bundle only with valid bundle contract", () => {
  const proposal = runnableProposal({ proposedLabels: ["area:infra", "type:feature", "workflow", "auto-bundle"] });
  assert.equal(validateMutationProposal(proposal).ok, false);
  const bundled = rekey({
    ...proposal,
    autoRunnerContract: {
      ...proposal.autoRunnerContract,
      bundle: {
        bundleVersion: 1,
        strategy: "feature-bundle",
        slices: [
          {
            id: "first-slice",
            title: "First slice",
            objective: "First bounded objective",
            allowedPaths: ["tools/auto-runner/**"],
            validationProfile: "runner-tests",
            requiredReading: ["tools/auto-runner/README.md"],
          },
          {
            id: "second-slice",
            title: "Second slice",
            objective: "Second bounded objective",
            allowedPaths: ["tools/auto-runner/**"],
            validationProfile: "runner-tests",
            requiredReading: ["tools/auto-runner/README.md"],
            dependsOn: ["first-slice"],
          },
        ],
      },
    },
  });
  assert.equal(validateMutationProposal(bundled).ok, true);
});
