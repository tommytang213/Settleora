import assert from "node:assert/strict";
import test from "node:test";
import { parseCliArgs } from "../lib/config.mjs";
import { parseReviewVerdict } from "../lib/codex-runner.mjs";
import { claimIssue, commentIssueOutcome, pollEligibleIssues } from "../lib/github-issues.mjs";
import { classifyIssueLane, filterForbiddenChangedFiles, parseAutoRunnerContract } from "../lib/lane-policy.mjs";

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

test("valid workflow/tooling contract permits only contract and lane paths", () => {
  const lane = classifyIssueLane({
    title: "Auto-runner workflow hardening",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["tools/auto-runner/**", "docs/workflow/**"],
      validationProfile: "workflow-tooling",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.equal(lane.validationProfile, "workflow-tooling");
  assert.deepEqual(filterForbiddenChangedFiles(["tools/auto-runner/lib/config.mjs", "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"], lane), []);
  assert.deepEqual(filterForbiddenChangedFiles(["services/api/Auth/Foo.cs"], lane), ["services/api/Auth/Foo.cs"]);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/planning/ISSUE_PROGRESS_LEDGER.md"], lane), [
    "docs/planning/ISSUE_PROGRESS_LEDGER.md",
  ]);
});

test("valid docs/planning contract is accepted for planning docs only", () => {
  const lane = classifyIssueLane({
    title: "Update issue ledger checkpoint",
    body: contractBody({
      lane: "docs-planning",
      allowedPaths: ["docs/planning/**"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.equal(lane.lane, "docs-planning");
  assert.deepEqual(filterForbiddenChangedFiles(["docs/planning/ISSUE_PROGRESS_LEDGER.md"], lane), []);
  assert.deepEqual(filterForbiddenChangedFiles(["docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"], lane), [
    "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
  ]);
});

test("auto-ready alone is insufficient without issue body contract", () => {
  const lane = classifyIssueLane({
    title: "Auto-runner workflow hardening",
    body: "Workflow tooling task limited to tools/auto-runner and docs/workflow.",
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, false);
  assert.equal(lane.lane, "missing-or-invalid-contract");
  assert.match(lane.reason, /missing/i);
});

test("contract parser fails closed for malformed and unknown safety fields", () => {
  const malformed = parseAutoRunnerContract("## Auto-runner contract\n\n```json\n{\"contractVersion\":1,\n```");
  assert.equal(malformed.ok, false);
  assert.match(malformed.reason, /malformed/i);

  const unknown = parseAutoRunnerContract(contractBody({ extra: "unsafe" }));
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /unsupported field/i);
});

test("contract lane/profile/path validation fails closed", () => {
  const unknownLane = classifyIssueLane({
    title: "Unknown lane",
    body: contractBody({ lane: "runtime-free-for-all" }),
    labels: ["auto-ready"],
  });
  assert.equal(unknownLane.allowedToImplement, false);
  assert.match(unknownLane.reason, /unsupported/i);

  const injectedProfile = classifyIssueLane({
    title: "Injected profile",
    body: contractBody({ validationProfile: "docs-only; rm -rf /" }),
    labels: ["auto-ready"],
  });
  assert.equal(injectedProfile.allowedToImplement, false);
  assert.match(injectedProfile.reason, /unsupported validation profile/i);

  const unsafePath = classifyIssueLane({
    title: "Unsafe path",
    body: contractBody({ allowedPaths: ["tools/**"] }),
    labels: ["auto-ready"],
  });
  assert.equal(unsafePath.allowedToImplement, false);
  assert.match(unsafePath.reason, /outside lane manifest/i);
});

test("product and danger lanes remain manual or danger gated", () => {
  const disabledLane = classifyIssueLane({
    title: "Product runtime placeholder",
    body: contractBody({
      lane: "product-runtime",
      allowedPaths: ["apps/mobile/**"],
      validationProfile: "docs-only",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(disabledLane.allowedToImplement, false);
  assert.equal(disabledLane.dangerGate, true);

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

test("changed file outside contract allowlist is rejected even inside lane", () => {
  const lane = classifyIssueLane({
    title: "Runner tests only",
    body: contractBody({
      lane: "workflow-docs-tooling",
      allowedPaths: ["tools/auto-runner/test/**"],
      validationProfile: "runner-tests",
    }),
    labels: ["auto-ready"],
  });
  assert.equal(lane.allowedToImplement, true);
  assert.deepEqual(filterForbiddenChangedFiles(["tools/auto-runner/test/auto-runner.test.mjs"], lane), []);
  assert.deepEqual(filterForbiddenChangedFiles(["tools/auto-runner/lib/lane-policy.mjs"], lane), [
    "tools/auto-runner/lib/lane-policy.mjs",
  ]);
});

test("review verdict parsing approves only valid verdict JSON", () => {
  const approve = parseReviewVerdict(`notes\n{"verdict":"approve","confidence":"high","requirement_match":"pass","code_quality":"pass","scope_control":"pass","validation_adequacy":"pass","blocking_findings":[],"non_blocking_findings":[],"recommended_next_action":"open_pr"}`);
  assert.equal(approve.verdict, "approve");
  const invalid = parseReviewVerdict(`{"verdict":"ship_it","confidence":"high"}`);
  assert.equal(invalid.verdict, "unable_to_review");
  assert.match(invalid.blocking_findings[0], /invalid/);
});

function contractBody(overrides = {}) {
  const contract = {
    contractVersion: 1,
    lane: "workflow-docs-tooling",
    allowedPaths: ["tools/auto-runner/**", "docs/workflow/**"],
    validationProfile: "workflow-tooling",
    manualMergeRequired: true,
    autoMergeEligible: false,
    requiredReading: [
      "PROGRAM_ARCHITECTURE.md",
      "docs/workflow/CODEX_TASK_GUIDE.md",
      "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md",
    ],
    ...overrides,
  };
  return `## Auto-runner contract

\`\`\`json
${JSON.stringify(contract, null, 2)}
\`\`\`
`;
}
