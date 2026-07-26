import assert from "node:assert/strict";
import test from "node:test";
import { readGithubIssueState } from "../lib/github-issue-readback.mjs";

const config = { repositorySlug: "owner/repo", repoRoot: "/not-used" };
const payload = (overrides = {}) => ({
  number: 959,
  repository_url: "https://api.github.com/repos/owner/repo",
  state: "open",
  state_reason: null,
  ...overrides,
});
const runnerFor = (value, overrides = {}) => (_command, args, options) => {
  assert.deepEqual(args, ["api", "repos/owner/repo/issues/959"]);
  assert.equal(args.includes("stateReason"), false);
  assert.equal(options.timeout, 20_000);
  assert.equal(options.maxBuffer, 1024 * 1024);
  assert.equal(options.env.GH_PROMPT_DISABLED, "1");
  assert.equal(options.env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(options.windowsHide, true);
  return { status: 0, stdout: JSON.stringify(value), stderr: "", ...overrides };
};

test("production gh 2.45 compatible issue read uses REST without unsupported CLI JSON fields", () => {
  const result = readGithubIssueState(config, 959, runnerFor(payload()));
  assert.deepEqual(result, {
    complete: true,
    source: "gh_api",
    issue: { number: 959, state: "OPEN", stateReason: null },
  });
});

test("closed completed issue preserves the completion reason", () => {
  const result = readGithubIssueState(config, 959, runnerFor(payload({ state: "closed", state_reason: "completed" })));
  assert.equal(result.complete, true);
  assert.deepEqual(result.issue, { number: 959, state: "CLOSED", stateReason: "COMPLETED" });
});

test("issue readback rejects wrong issue and repository identities", () => {
  assert.equal(readGithubIssueState(config, 959, runnerFor(payload({ number: 958 }))).complete, false);
  assert.equal(readGithubIssueState(config, 959, runnerFor(payload({ repository_url: "https://api.github.com/repos/other/repo" }))).complete, false);
});

test("issue readback rejects pull request payloads", () => {
  const result = readGithubIssueState(config, 959, runnerFor(payload({ pull_request: { url: "https://api.github.com/pulls/1" } })));
  assert.equal(result.complete, false);
  assert.equal(result.source, "gh_api_issue_payload_invalid");
});

test("issue readback fails closed for malformed JSON, nonzero exit, timeout, and stderr contradiction", () => {
  assert.equal(readGithubIssueState(config, 959, runnerFor(payload(), { stdout: "{" })).complete, false);
  assert.equal(readGithubIssueState(config, 959, runnerFor(payload(), { status: 1, stderr: "network unavailable" })).complete, false);
  assert.equal(readGithubIssueState(config, 959, runnerFor(payload(), { status: null, error: { code: "ETIMEDOUT" } })).source, "gh_api_issue_timeout");
  assert.equal(readGithubIssueState(config, 959, runnerFor(payload(), { stderr: "unexpected warning" })).source, "gh_api_issue_stderr_contradiction");
});

test("issue readback rejects missing and unsupported state contracts", () => {
  assert.equal(readGithubIssueState(config, 959, runnerFor(payload({ state: undefined }))).complete, false);
  assert.equal(readGithubIssueState(config, 959, runnerFor(payload({ state: "merged" }))).complete, false);
  assert.equal(readGithubIssueState(config, 959, runnerFor(payload({ state_reason: "unknown" }))).complete, false);
  assert.equal(readGithubIssueState(config, 959, runnerFor(payload({ state_reason: "completed" }))).complete, false);
});

test("issue readback rejects invalid requested identities before subprocess execution", () => {
  let called = false;
  const runner = () => { called = true; };
  assert.equal(readGithubIssueState({ ...config, repositorySlug: "owner" }, 959, runner).complete, false);
  assert.equal(readGithubIssueState(config, 0, runner).complete, false);
  assert.equal(called, false);
});
