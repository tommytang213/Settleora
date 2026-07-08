import assert from "node:assert/strict";
import test from "node:test";
import { parseCliArgs } from "../lib/config.mjs";
import { parseReviewVerdict } from "../lib/codex-runner.mjs";
import { claimIssue, commentIssueOutcome, pollEligibleIssues } from "../lib/github-issues.mjs";
import { classifyIssueLane, filterForbiddenChangedFiles } from "../lib/lane-policy.mjs";

const baseConfig = {
  dryRun: true,
  run: false,
  eligibleLabels: ["auto-ready", "auto-bundle"],
  stopLabels: ["needs-tommy", "manual-gate", "danger-gate", "auto-failed", "auto-running", "auto-pr-opened", "blocked"],
  claimLabels: ["auto-claimed", "auto-running"],
  priorityLabels: ["priority-critical", "priority-high", "priority-ready"],
  pollLimit: 30,
};

test("CLI rejects fixture issues outside dry-run", () => {
  assert.throws(
    () => parseCliArgs(["--run", "--fixture-issues", "tools/auto-runner/test/fixtures/issues.safe.json"]),
    /dry-run only/,
  );
});

test("CLI treats preflight as standalone mode", () => {
  const parsed = parseCliArgs(["--preflight"]);
  assert.equal(parsed.preflight, true);
  assert.throws(() => parseCliArgs(["--preflight", "--dry-run"]), /non-mutating mode/);
});

test("fixture polling sorts eligible issues and skips stop labels", () => {
  const config = {
    ...baseConfig,
    fixtureIssues: [
      { number: 3, title: "stop", labels: ["auto-ready", "auto-pr-opened"], createdAt: "2026-01-03T00:00:00Z" },
      { number: 2, title: "second", labels: ["auto-ready"], createdAt: "2026-01-02T00:00:00Z" },
      { number: 1, title: "first", labels: ["auto-ready", "priority-high"], createdAt: "2026-01-01T00:00:00Z" },
    ],
    fixtureIssueCursor: 0,
  };
  const result = pollEligibleIssues(config, { warn() {} });
  assert.equal(result.fixture, true);
  assert.deepEqual(
    result.issues.map((issue) => issue.number),
    [1, 2],
  );
  config.fixtureIssueCursor = 1;
  assert.deepEqual(
    pollEligibleIssues(config, { warn() {} }).issues.map((issue) => issue.number),
    [2],
  );
});

test("dry-run issue claim and terminal outcomes preview bounded mutations", () => {
  const issue = { number: 10, title: "safe", labels: ["auto-ready"] };
  const claim = claimIssue(baseConfig, issue, { warn() {} });
  assert.deepEqual(claim.preview.addLabels, ["auto-claimed", "auto-running"]);
  assert.match(claim.preview.comment, /claimed this issue/);

  const prOpened = commentIssueOutcome(baseConfig, issue, "approved_pr_opened", "opened");
  assert.deepEqual(prOpened.preview.addLabels, ["auto-pr-opened"]);
  assert.deepEqual(prOpened.preview.removeLabels, ["auto-running"]);

  const validationFailed = commentIssueOutcome(baseConfig, issue, "validation_failed", "failed");
  assert.deepEqual(validationFailed.preview.addLabels, ["auto-failed"]);
  assert.deepEqual(validationFailed.preview.removeLabels, ["auto-running"]);
});

test("workflow lane permits runner/docs paths but not product or planning paths", () => {
  const lane = classifyIssueLane({
    title: "Auto-runner workflow hardening",
    body: "Safe workflow tooling only. Generic config text should not trigger a danger lane.",
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.deepEqual(filterForbiddenChangedFiles(["tools/auto-runner/lib/config.mjs", "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"], lane), []);
  assert.deepEqual(filterForbiddenChangedFiles(["services/api/Auth/Foo.cs"], lane), ["services/api/Auth/Foo.cs"]);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/planning/ISSUE_PROGRESS_LEDGER.md"], lane), [
    "docs/planning/ISSUE_PROGRESS_LEDGER.md",
  ]);
});

test("lane policy still gates secret/auth/deployment config and money domains", () => {
  for (const body of [
    "Change auth config for sessions",
    "Update deployment config",
    "Change settlement payment calculation",
  ]) {
    const lane = classifyIssueLane({ title: "Danger", body, labels: ["auto-ready"] });
    assert.equal(lane.allowedToImplement, false);
    assert.equal(lane.dangerGate, true);
  }
});

test("review verdict parsing approves only valid verdict JSON", () => {
  const approve = parseReviewVerdict(`notes\n{"verdict":"approve","confidence":"high","requirement_match":"pass","code_quality":"pass","scope_control":"pass","validation_adequacy":"pass","blocking_findings":[],"non_blocking_findings":[],"recommended_next_action":"open_pr"}`);
  assert.equal(approve.verdict, "approve");
  const invalid = parseReviewVerdict(`{"verdict":"ship_it","confidence":"high"}`);
  assert.equal(invalid.verdict, "unable_to_review");
  assert.match(invalid.blocking_findings[0], /invalid/);
});
