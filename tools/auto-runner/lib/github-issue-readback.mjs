import { spawnSync } from "node:child_process";

const githubIssueReadTimeoutMs = 20_000;
const githubIssueReadMaxBuffer = 1024 * 1024;
const repositorySlugPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const supportedStates = new Set(["OPEN", "CLOSED"]);
const supportedStateReasons = new Set(["COMPLETED", "NOT_PLANNED", "REOPENED"]);

export function readGithubIssueState(config, issueNumber, runner = spawnSync) {
  const repositorySlug = String(config?.repositorySlug || "");
  if (!repositorySlugPattern.test(repositorySlug) || !Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    return { complete: false, source: "gh_api_issue_identity_invalid" };
  }
  const result = runner(
    "gh",
    ["api", `repos/${repositorySlug}/issues/${issueNumber}`],
    {
      cwd: config.repoRoot,
      encoding: "utf8",
      timeout: githubIssueReadTimeoutMs,
      maxBuffer: githubIssueReadMaxBuffer,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" },
      windowsHide: true,
    },
  );
  if (result?.error || result?.status !== 0) {
    return { complete: false, source: result?.error?.code === "ETIMEDOUT" ? "gh_api_issue_timeout" : "gh_api_issue_read_failed" };
  }
  if (String(result.stderr || "").trim()) return { complete: false, source: "gh_api_issue_stderr_contradiction" };
  let payload;
  try {
    payload = JSON.parse(result.stdout || "");
  } catch {
    return { complete: false, source: "gh_api_issue_parse_failed" };
  }
  if (!payload || Array.isArray(payload) || typeof payload !== "object" || payload.pull_request) {
    return { complete: false, source: "gh_api_issue_payload_invalid" };
  }
  const repositoryUrl = String(payload.repository_url || "");
  const expectedRepositorySuffix = `/repos/${repositorySlug}`;
  if (payload.number !== issueNumber || !repositoryUrl.endsWith(expectedRepositorySuffix)) {
    return { complete: false, source: "gh_api_issue_identity_mismatch" };
  }
  const state = typeof payload.state === "string" ? payload.state.toUpperCase() : "";
  if (!supportedStates.has(state)) return { complete: false, source: "gh_api_issue_state_unsupported" };
  const rawStateReason = payload.state_reason;
  if (rawStateReason != null && (typeof rawStateReason !== "string" || rawStateReason.length === 0)) {
    return { complete: false, source: "gh_api_issue_state_reason_unsupported" };
  }
  const stateReason = rawStateReason == null ? null : rawStateReason.toUpperCase();
  const stateReasonValid = supportedStateReasons.has(stateReason)
    && ((state === "OPEN" && stateReason === "REOPENED")
      || (state === "CLOSED" && ["COMPLETED", "NOT_PLANNED"].includes(stateReason)));
  if ((state === "OPEN" && stateReason !== null && !stateReasonValid)
    || (state === "CLOSED" && !stateReasonValid)) return { complete: false, source: "gh_api_issue_state_reason_unsupported" };
  return {
    complete: true,
    source: "gh_api",
    issue: { number: issueNumber, state, stateReason },
  };
}
