import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { freemem } from "node:os";
import path from "node:path";
import { resolveCodexCommand } from "./codex-runner.mjs";
import { getCurrentBranch, getRefSha, getStatusShort, runGit } from "./git-workspace.mjs";
import { evaluateLowRiskAutoMergeCanaryApproval, evaluateReviewFixMutationApproval, evaluateTrustPolicy } from "./canary-policy.mjs";
import { evaluateReviewFixCanaryFixtureApproval } from "./review-fix-fixture.mjs";
import { buildEligibleLabelSearches } from "./github-issues.mjs";
import { safeTimestamp } from "./logger.mjs";
import { reviewerReadinessSummary } from "./reviewer-policy.mjs";
import { absoluteRuntimeEntry, validateProjectRuntimeIdentity } from "./runtime-identity.mjs";
import { verifyRuntimeBundle } from "./runtime-bundle.mjs";
import { assertNodeCompatibility } from "../runtime-launcher.mjs";

const settleoraRepositorySlug = "tommytang213/Settleora";
const riskyGateKeys = Object.freeze([
  "allowAutoMerge",
  "allowFollowupIssueCreation",
  "allowStaleClaimSteal",
  "allowReviewFixMutation",
  "allowSystemdEnablement",
]);
const alwaysManualGates = Object.freeze([
  "trusted overnight operation",
  "systemd service/timer installation or enablement",
  "external production profile activation and live acceptance tracked by #912",
  "genuine manual actions: production deploy, mobile store release, destructive data operation, secret mutation, public/admin exposure, force/history/branch cleanup, Day 1 scope cuts, unresolved product or authority decisions",
]);

export function runPreflight(config, options = {}) {
  const runner = options.runner || defaultRunner;
  const checks = [];
  checks.push(checkRepoRoot(config));
  checks.push(checkRuntimeIdentity(config));
  checks.push(checkBranchAndStatus(config, runner));
  checks.push(checkOriginMainFetchable(config, runner));
  checks.push(checkGhAvailable(runner));
  checks.push(checkGhAuthStatus(config, runner));
  checks.push(checkGhRepoView(config, runner));
  if (config.repositorySlug?.toLowerCase() === settleoraRepositorySlug.toLowerCase()) {
    checks.push(checkIssueState(config, runner, 800, "CLOSED"));
    checks.push(checkIssueState(config, runner, 805, "CLOSED"));
  }
  checks.push(checkIssuePolling(config, runner));
  checks.push(checkCodexResolution(config));
  checks.push(checkNodeVersion());
  checks.push(checkLogsRoot(config));
  checks.push(checkLogWriteSanity(config));
  checks.push(checkDiskSpace(config, runner));
  checks.push(checkConfig(config));
  checks.push(checkReviewerPolicy(config));
  checks.push(checkTrustedRealRunPolicy(config));
  checks.push(checkCanaryRealRunPolicy(config));
  checks.push(checkAutoMergeApproval(config));
  checks.push(
    policyCheck(
      "follow-up-issue-creation-disabled",
      !config.allowFollowupIssueCreation,
      "allowFollowupIssueCreation is disabled.",
    ),
  );
  checks.push(
    policyCheck(
      "stale-claim-stealing-disabled",
      !config.allowStaleClaimSteal,
      "allowStaleClaimSteal is disabled.",
    ),
  );
  checks.push(
    policyCheck(
      "review-fix-mutation-disabled",
      (!config.allowReviewFixMutation && config.maxReviewFixCycles === 0) || evaluateReviewFixMutationApproval(config).approved,
      evaluateReviewFixMutationApproval(config).approved
        ? `review-fix mutation has explicit low-risk approval: ${evaluateReviewFixMutationApproval(config).reason}`
        : "review-fix mutation is disabled.",
    ),
  );
  checks.push(
    policyCheck(
      "review-fix-canary-fixture-disabled",
      !config.reviewFixCanaryFixture?.requestedEnabled || evaluateReviewFixCanaryFixtureApproval(config).approved,
      evaluateReviewFixCanaryFixtureApproval(config).approved
        ? `review-fix canary fixture has explicit low-risk approval: ${evaluateReviewFixCanaryFixtureApproval(config).reason}`
        : "review-fix canary fixture is disabled.",
    ),
  );
  checks.push(
    policyCheck(
      "systemd-enablement-disabled",
      !config.allowSystemdEnablement,
      "systemd enablement is disabled.",
    ),
  );
  checks.push(checkSystemdNotTouched());
  checks.push(checkActiveClaims(config, runner));
  checks.push(checkOpenAutoRunnerPrs(config, runner));
  checks.push(checkActivePrOpenedIssues(config, runner));

  const result = {
    mode: config.mode || "preflight",
    generatedAt: new Date().toISOString(),
    repo: config.repositorySlug,
    branch: safeValue(() => getCurrentBranch({ cwd: config.repoRoot }), "unknown"),
    headSha: safeValue(() => getRefSha("HEAD", { cwd: config.repoRoot }), "unknown"),
    runtimeIdentity: config.runtimeIdentity || null,
    configPathUsed: config.configPath || "default built-in config",
    logsRoot: config.logsRoot,
    readinessReports: null,
    remainingManualGates: buildRemainingManualGates(config),
    summary: summarize(checks),
    checks,
  };
  result.readinessReports = writeReadinessReports(config, result);
  return result;
}

function buildRemainingManualGates(config) {
  const gates = [...alwaysManualGates];
  if (!config.allowStaleClaimSteal) gates.push("stale-claim stealing is disabled by current config");
  if (!config.allowFollowupIssueCreation) gates.push("follow-up issue creation is disabled by current config");
  if (!config.allowReviewFixMutation || config.maxReviewFixCycles === 0) {
    gates.push("review-fix mutation is disabled by current config");
  }
  if (!config.allowAutoMerge || !Array.isArray(config.autoMergePolicy?.approvedLanes) || config.autoMergePolicy.approvedLanes.length === 0) {
    gates.push("approved-domain auto-merge remains disabled until an external profile explicitly approves lanes and checks");
  }
  return gates;
}

function checkRepoRoot(config) {
  const packageJson = path.join(config.repoRoot, "package.json");
  const ok = existsSync(packageJson);
  return {
    name: "repo-root",
    status: ok ? "pass" : "fail",
    detail: bounded(`configured=${config.repoRoot}`),
  };
}

function checkRuntimeIdentity(config) {
  try {
    if (config.runtimeMode !== "external" && (!config.projectId || !config.runtimeRoot)) {
      return {
        name: "runtime-identity",
        status: "pass",
        detail: "development compatibility mode; trusted external activation would require explicit runtimeRoot and projectId",
      };
    }
    const identity = validateProjectRuntimeIdentity(config);
    const runner = absoluteRuntimeEntry(identity.runtimeRoot, "settleora-auto-runner.mjs");
    const manifest = config.runtimeMode === "external"
      ? verifyRuntimeBundle(identity.runtimeRoot, config.runtimeBundleDigest || null)
      : null;
    return {
      name: "runtime-identity",
      status: "pass",
      detail: bounded(JSON.stringify({ ...identity, runner, bundleDigest: manifest?.bundleDigest || null })),
    };
  } catch (error) {
    return { name: "runtime-identity", status: "fail", detail: bounded(error.message) };
  }
}

function checkBranchAndStatus(config, runner) {
  try {
    const branch = getCurrentBranch({ cwd: config.repoRoot });
    const status = getStatusShort({ cwd: config.repoRoot });
    const headSha = getRefSha("HEAD", { cwd: config.repoRoot });
    const originMainSha = safeValue(() => getRefSha("origin/main", { cwd: config.repoRoot }), null);
    const relation = originMainSha ? headRelationToOriginMain(runner, headSha, originMainSha) : "origin-main-unavailable";
    const realRunWouldRefuse = branch === "main" || Boolean(status);
    return {
      name: "branch-worktree",
      status: realRunWouldRefuse ? "warn" : "pass",
      detail: bounded(
        JSON.stringify({
          branch,
          headSha,
          dirty: Boolean(status),
          realRunWouldRefuse,
          originMainSha,
          headRelationToOriginMain: relation,
          status: status || "",
        }),
      ),
    };
  } catch (error) {
    return { name: "branch-worktree", status: "fail", detail: bounded(error.message) };
  }
}

function checkOriginMainFetchable(config, runner) {
  const result = runner("git", ["ls-remote", "--exit-code", "origin", "refs/heads/main"], { cwd: config.repoRoot });
  return commandCheck("origin-main-fetchable", result, {
    passDetail: bounded(firstLine(result.stdout) || "origin main is reachable"),
  });
}

function checkGhAvailable(runner) {
  const result = runner("gh", ["--version"]);
  return commandCheck("gh-available", result, { passDetail: firstLine(result.stdout) });
}

function checkGhAuthStatus(config, runner) {
  const result = runner("gh", ["auth", "status"], { cwd: config.repoRoot });
  return commandCheck("gh-auth-status", result, { passDetail: "gh auth status completed" });
}

function checkGhRepoView(config, runner) {
  const result = runner("gh", ["repo", "view", config.repositorySlug, "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    cwd: config.repoRoot,
  });
  const resolved = result.stdout.trim();
  return {
    name: "gh-repo-view",
    status: result.status === 0 && resolved.toLowerCase() === config.repositorySlug.toLowerCase() ? "pass" : "fail",
    detail: bounded(result.status === 0 ? `resolved=${resolved}` : result.stderr || result.error?.message || ""),
  };
}

function checkIssueState(config, runner, number, expectedState) {
  const result = runner("gh", ["issue", "view", String(number), "--repo", config.repositorySlug, "--json", "number,state,title,url"], {
    cwd: config.repoRoot,
  });
  if (result.error || result.status !== 0) {
    return commandCheck(`issue-${number}-state`, result, { passDetail: "" });
  }
  try {
    const issue = JSON.parse(result.stdout || "{}");
    return {
      name: `issue-${number}-state`,
      status: issue.state === expectedState ? "pass" : "fail",
      detail: bounded(JSON.stringify({ expectedState, actualState: issue.state, title: issue.title, url: issue.url })),
    };
  } catch (error) {
    return { name: `issue-${number}-state`, status: "fail", detail: bounded(error.message) };
  }
}

function checkIssuePolling(config, runner) {
  let searches;
  try {
    searches = buildEligibleLabelSearches(config.repositorySlug, config.eligibleLabels);
  } catch (error) {
    return { name: "github-issue-polling", status: "fail", detail: bounded(error.message) };
  }
  const results = searches.map(({ search }) =>
    runner(
      "gh",
      ["issue", "list", "--repo", config.repositorySlug, "--state", "open", "--limit", "1", "--json", "number,title,labels", "--search", search],
      { cwd: config.repoRoot },
    ),
  );
  const failed = results.find((result) => result.error || result.status !== 0);
  if (failed) {
    return commandCheck("github-issue-polling", failed, { passDetail: "" });
  }
  const returned = results.reduce((count, result) => count + safeCountJsonArray(result.stdout), 0);
  return {
    name: "github-issue-polling",
    status: "pass",
    detail: bounded(`pollable=true; searches=${searches.map((item) => item.search).join(" | ")}; returned=${returned}`),
  };
}

function checkCodexResolution(config) {
  try {
    const resolution = resolveCodexCommand(config.codexCommand);
    return {
      name: "codex-resolution",
      status: "pass",
      detail: bounded(JSON.stringify({ command: resolution.command, source: resolution.source })),
    };
  } catch (error) {
    return { name: "codex-resolution", status: "warn", detail: bounded(error.message) };
  }
}

function checkLogsRoot(config) {
  try {
    const stats = statSync(config.logsRoot);
    accessSync(config.logsRoot, constants.W_OK);
    return {
      name: "logs-root-writable",
      status: stats.isDirectory() ? "pass" : "fail",
      detail: bounded(config.logsRoot),
    };
  } catch (error) {
    return { name: "logs-root-writable", status: "fail", detail: bounded(`${config.logsRoot}: ${error.message}`) };
  }
}

function checkLogWriteSanity(config) {
  const readinessRoot = path.join(config.logsRoot, "readiness");
  try {
    mkdirSync(readinessRoot, { recursive: true });
    const filePath = path.join(readinessRoot, `.write-test-${process.pid}.tmp`);
    writeFileSync(filePath, "ok\n", { flag: "w" });
    unlinkSync(filePath);
    return {
      name: "readiness-log-write",
      status: "pass",
      detail: bounded(`readiness root writable: ${readinessRoot}`),
    };
  } catch (error) {
    return { name: "readiness-log-write", status: "fail", detail: bounded(error.message) };
  }
}

function checkDiskSpace(config, runner) {
  const result = runner("df", ["-Pk", config.logsRoot], { cwd: config.repoRoot });
  if (result.error || result.status !== 0) {
    return {
      name: "disk-space",
      status: "warn",
      detail: bounded(result.stderr || result.stdout || result.error || `free memory bytes=${freemem()}`),
    };
  }
  const lines = result.stdout.trim().split(/\r?\n/);
  const fields = (lines[1] || "").trim().split(/\s+/);
  const availableKb = Number.parseInt(fields[3] || "0", 10);
  return {
    name: "disk-space",
    status: availableKb >= 1024 * 1024 ? "pass" : "warn",
    detail: bounded(`availableKb=${Number.isFinite(availableKb) ? availableKb : "unknown"}; path=${config.logsRoot}`),
  };
}

function checkNodeVersion() {
  let detail;
  let ok = false;
  try {
    const result = assertNodeCompatibility(">=22 <23");
    ok = true;
    detail = `node=${result.version}; approved=${result.range}`;
  } catch (error) {
    detail = `node=${process.version}; expected approved range >=22 <23; ${error.message}`;
  }
  return {
    name: "node-version",
    status: ok ? "pass" : "fail",
    detail,
  };
}

function checkConfig(config) {
  const requiredArrays = ["eligibleLabels", "stopLabels", "claimLabels"];
  const missing = requiredArrays.filter((key) => !Array.isArray(config[key]) || config[key].length === 0);
  const autoMergeApproval = evaluateLowRiskAutoMergeCanaryApproval(config);
  const reviewFixApproval = evaluateReviewFixMutationApproval(config);
  const riskyEnabled = riskyGateKeys.filter((key) => Boolean(config[key]));
  if (config.allowAutoMerge && autoMergeApproval.approved) {
    const index = riskyEnabled.indexOf("allowAutoMerge");
    if (index >= 0) riskyEnabled.splice(index, 1);
  }
  if (config.allowReviewFixMutation && reviewFixApproval.approved) {
    const index = riskyEnabled.indexOf("allowReviewFixMutation");
    if (index >= 0) riskyEnabled.splice(index, 1);
  }
  if (config.maxReviewFixCycles > 0 && !reviewFixApproval.approved && !riskyEnabled.includes("allowReviewFixMutation")) {
    riskyEnabled.push("maxReviewFixCycles");
  }
  const fixtureApproval = evaluateReviewFixCanaryFixtureApproval(config);
  if (config.reviewFixCanaryFixture?.requestedEnabled && !fixtureApproval.approved) {
    riskyEnabled.push("reviewFixCanaryFixture");
  }
  return {
    name: "config-parseable",
    status: missing.length === 0 && riskyEnabled.length === 0 ? "pass" : "fail",
    detail:
      missing.length === 0 && riskyEnabled.length === 0
        ? bounded(
            JSON.stringify({
              requiredArrays: "present",
              riskyGates: "disabled_or_explicit_low_risk_auto_merge_canary",
              autoMergeCanaryApprovalMode: autoMergeApproval.mode,
              autoMergeCanaryApprovalReason: autoMergeApproval.reason,
              reviewFixMutationApprovalMode: reviewFixApproval.mode,
              reviewFixMutationApprovalReason: reviewFixApproval.reason,
              reviewFixCanaryFixtureApprovalMode: fixtureApproval.mode,
              reviewFixCanaryFixtureApprovalReason: fixtureApproval.reason,
            }),
          )
        : bounded(JSON.stringify({ missingOrEmpty: missing, riskyEnabled, autoMergeCanaryApproval: autoMergeApproval, reviewFixMutationApproval: reviewFixApproval, reviewFixCanaryFixtureApproval: fixtureApproval })),
  };
}

function checkReviewerPolicy(config) {
  try {
    const summary = reviewerReadinessSummary(config, {
      changedFiles: ["tools/auto-runner/lib/config.mjs", "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md"],
      laneDecision: { lane: "workflow-docs-tooling" },
      stats: { additions: 120, deletions: 20 },
      estimatedInputTokens: 12000,
      estimatedOutputTokens: 2000,
    });
    return {
      name: "reviewer-tier-budget-policy",
      status: summary.budget.block ? "fail" : summary.budget.warn ? "warn" : "pass",
      detail: bounded(JSON.stringify(summary)),
    };
  } catch (error) {
    return { name: "reviewer-tier-budget-policy", status: "fail", detail: bounded(error.message) };
  }
}

function checkTrustedRealRunPolicy(config) {
  const policy = evaluateTrustPolicy({
    ...config,
    dryRun: false,
    run: true,
    canary: false,
    mode: "run",
  });
  return {
    name: "trusted-real-run-policy",
    status: policy.allowed ? "fail" : "pass",
    detail: bounded(
      JSON.stringify({
        trustedRealRunApproved: Boolean(config.trustedRealRunApproved),
        normalRunWouldRefuse: !policy.allowed,
        reason: policy.reason,
        unsafeToggles: policy.unsafeToggles,
      }),
    ),
  };
}

function checkCanaryRealRunPolicy(config) {
  const policy = evaluateTrustPolicy({
    ...config,
    dryRun: false,
    run: true,
    canary: true,
    mode: "canary-run",
  });
  return {
    name: "trusted-real-run-canary-policy",
    status: policy.allowed ? "pass" : "warn",
    detail: bounded(
      JSON.stringify({
        trustedRealRunCanaryApproved: Boolean(config.trustedRealRunCanaryApproved),
        lowRiskAutoMergeCanaryApproved: Boolean(config.lowRiskAutoMergeCanaryApproved),
        canaryRunWouldRefuse: !policy.allowed,
        reason: policy.reason,
        maxIterations: config.maxIterations,
        requestedMaxIterations: config.requestedMaxIterations || config.maxIterations,
        trustedRealRunCanaryMaxIterations: config.trustedRealRunCanaryMaxIterations,
        evidenceRoot: config.canaryEvidenceRoot,
        unsafeToggles: policy.unsafeToggles,
        autoMergeCanaryApproval: policy.autoMergeCanaryApproval,
      }),
    ),
  };
}

function checkAutoMergeApproval(config) {
  if (!config.allowAutoMerge) {
    const approval = evaluateLowRiskAutoMergeCanaryApproval(config);
    return {
      name: "auto-merge-disabled",
      status: "pass",
      detail: bounded(
        JSON.stringify({
          allowAutoMerge: false,
          autoMergeCanaryApprovalMode: approval.mode,
          reason: approval.reason,
        }),
      ),
    };
  }
  const approvedLanes = Array.isArray(config.autoMergePolicy?.approvedLanes) ? config.autoMergePolicy.approvedLanes : [];
  if (approvedLanes.length > 0) {
    return {
      name: "auto-merge-approved-domain-policy",
      status: "pass",
      detail: bounded(
        JSON.stringify({
          allowAutoMerge: true,
          approvedDomainAutoMerge: true,
          approvedLanes,
          requiredChecks: config.autoMergePolicy?.requiredChecks || [],
          allowedSkippedChecks: config.autoMergePolicy?.allowedSkippedChecks || [],
          allowedNeutralChecks: config.autoMergePolicy?.allowedNeutralChecks || [],
          defaultOffPosture: false,
          reason: "approved-domain auto-merge config is explicit; final merge gates still require exact head, validation, external review, Codex review, CI/security, code scanning, issue, branch, and manual-action checks",
        }),
      ),
    };
  }
  const approval = evaluateLowRiskAutoMergeCanaryApproval(config);
  return {
    name: "auto-merge-approved-domain-policy",
    status: approval.approved ? "pass" : "fail",
    detail: approval.approved
      ? bounded(JSON.stringify({ allowAutoMerge: true, autoMergeCanaryApprovalMode: approval.mode, reason: approval.reason }))
      : bounded(JSON.stringify({ allowAutoMerge: true, autoMergeCanaryApprovalMode: approval.mode, reason: approval.reason })),
  };
}

function checkSystemdNotTouched() {
  return {
    name: "systemd-not-installed-by-preflight",
    status: "pass",
    detail: "preflight does not call systemctl, install service files, or enable timers",
  };
}

function policyCheck(name, ok, passDetail) {
  return {
    name,
    status: ok ? "pass" : "fail",
    detail: ok ? passDetail : `${name} is explicitly enabled in config; future explicit approval flag and documentation are required.`,
  };
}

function checkActiveClaims(config, runner) {
  const searches = ["auto-claimed", "auto-running"].map((label) => `repo:${config.repositorySlug} is:issue is:open label:${label}`);
  const results = searches.map((query) =>
    runner(
      "gh",
      ["issue", "list", "--repo", config.repositorySlug, "--state", "open", "--limit", "30", "--json", "number,title,labels,updatedAt,url", "--search", query],
      { cwd: config.repoRoot },
    ),
  );
  const failed = results.find((result) => result.error || result.status !== 0);
  if (failed) {
    return commandCheck("active-claim-labels", failed, { passDetail: "" });
  }
  const issues = dedupeByNumber(results.flatMap((result) => parseJsonArray(result.stdout)));
  const staleThresholdHours = Number(config.staleClaimAfterHours || 12);
  const staleBeforeMs = Date.now() - staleThresholdHours * 60 * 60 * 1000;
  const active = issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    updatedAt: issue.updatedAt,
    staleByUpdatedAt: Date.parse(issue.updatedAt || "") < staleBeforeMs,
    labels: (issue.labels || []).map((label) => label.name || label),
    url: issue.url,
  }));
  const staleCount = active.filter((issue) => issue.staleByUpdatedAt).length;
  return {
    name: "active-claim-labels",
    status: staleCount > 0 ? "warn" : "pass",
    detail: bounded(
      JSON.stringify({
        thresholdHours: staleThresholdHours,
        staleClaimStealingEnabled: Boolean(config.allowStaleClaimSteal),
        searches,
        active,
      }),
    ),
  };
}

function checkOpenAutoRunnerPrs(config, runner) {
  const result = runner("gh", ["pr", "list", "--repo", config.repositorySlug, "--state", "open", "--limit", "50", "--json", "number,title,headRefName,url"], {
    cwd: config.repoRoot,
  });
  if (result.error || result.status !== 0) {
    return commandCheck("open-auto-runner-prs", result, { passDetail: "" });
  }
  const prs = parseJsonArray(result.stdout).filter((pr) => isAutoRunnerBranch(pr.headRefName) || /auto-runner/i.test(pr.title || ""));
  return {
    name: "open-auto-runner-prs",
    status: prs.length > 0 ? "warn" : "pass",
    detail: bounded(JSON.stringify({ count: prs.length, prs })),
  };
}

function checkActivePrOpenedIssues(config, runner) {
  const query = `repo:${config.repositorySlug} is:issue is:open label:auto-pr-opened`;
  const result = runner(
    "gh",
    ["issue", "list", "--repo", config.repositorySlug, "--state", "open", "--limit", "30", "--json", "number,title,labels,updatedAt,url", "--search", query],
    { cwd: config.repoRoot },
  );
  if (result.error || result.status !== 0) {
    return commandCheck("active-pr-opened-issues", result, { passDetail: "" });
  }
  const issues = parseJsonArray(result.stdout).map((issue) => ({
    number: issue.number,
    title: issue.title,
    url: issue.url,
    updatedAt: issue.updatedAt,
  }));
  return {
    name: "active-pr-opened-issues",
    status: issues.length > 0 ? "warn" : "pass",
    detail: bounded(JSON.stringify({ count: issues.length, selectedByRunner: false, issues })),
  };
}

function dedupeByNumber(items) {
  const byNumber = new Map();
  for (const item of items) {
    if (Number.isInteger(item.number) && !byNumber.has(item.number)) {
      byNumber.set(item.number, item);
    }
  }
  return [...byNumber.values()];
}

function commandCheck(name, result, { passDetail }) {
  if (result.error || result.status !== 0) {
    return {
      name,
      status: "fail",
      detail: bounded(result.stderr || result.stdout || result.error?.message || ""),
    };
  }
  return { name, status: "pass", detail: bounded(passDetail) };
}

function writeReadinessReports(config, result) {
  const readinessRoot = path.join(config.logsRoot, "readiness");
  mkdirSync(readinessRoot, { recursive: true });
  const stamp = safeTimestamp();
  const jsonPath = path.join(readinessRoot, `${stamp}-overnight-readiness.json`);
  const markdownPath = path.join(readinessRoot, `${stamp}-overnight-readiness.md`);
  const serializable = { ...result, readinessReports: { jsonPath, markdownPath } };
  writeFileSync(jsonPath, `${JSON.stringify(serializable, null, 2)}\n`);
  writeFileSync(markdownPath, readinessMarkdown(serializable));
  return { jsonPath, markdownPath };
}

function readinessMarkdown(result) {
  const rows = result.checks.map((check) => `| ${check.status} | ${check.name} | ${String(check.detail || "").replace(/\n/g, " ")} |`);
  const reviewerPolicy = result.checks.find((check) => check.name === "reviewer-tier-budget-policy");
  return [
    "# Settleora Auto-Runner Overnight Readiness Preflight",
    "",
    `- Generated: ${result.generatedAt}`,
    `- Repository: ${result.repo}`,
    `- Branch: ${result.branch}`,
    `- HEAD: ${result.headSha}`,
    `- Config: ${result.configPathUsed}`,
    `- Logs root: ${result.logsRoot}`,
    `- Summary: ${result.summary.pass} pass, ${result.summary.warn} warn, ${result.summary.fail} fail`,
    "",
    "This report is non-mutating. It does not approve trusted overnight operation, auto-merge, stale-claim stealing, follow-up issue creation, review-fix mutation, or systemd enablement.",
    "",
    "## Remaining Manual Gates",
    "",
    ...result.remainingManualGates.map((gate) => `- ${gate}`),
    "",
    "## Reviewer Budget Policy",
    "",
    reviewerPolicy
      ? `- Status: ${reviewerPolicy.status}`
      : "- Status: unavailable",
    reviewerPolicy
      ? `- Detail: ${String(reviewerPolicy.detail || "").replace(/\n/g, " ")}`
      : "- Detail: reviewer tier policy check was not produced.",
    "",
    "## Checks",
    "",
    "| Status | Check | Detail |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function headRelationToOriginMain(runner, headSha, originMainSha) {
  if (headSha === originMainSha) return "equal";
  const headContainsOrigin = runner("git", ["merge-base", "--is-ancestor", originMainSha, headSha]);
  if (headContainsOrigin.status === 0) return "head-descends-from-origin-main";
  const originContainsHead = runner("git", ["merge-base", "--is-ancestor", headSha, originMainSha]);
  if (originContainsHead.status === 0) return "head-behind-origin-main";
  const mergeBase = runGit(["merge-base", "HEAD", "origin/main"]);
  return mergeBase.status === 0 ? `diverged; mergeBase=${mergeBase.stdout.trim()}` : "diverged";
}

function summarize(checks) {
  return checks.reduce(
    (summary, check) => {
      summary[check.status] = (summary[check.status] || 0) + 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 },
  );
}

function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    command: `${command} ${args.join(" ")}`,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

function bounded(value, max = 2000) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find(Boolean) || "";
}

function safeCountJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return "unknown";
  }
}

function parseJsonArray(value) {
  const parsed = JSON.parse(value || "[]");
  return Array.isArray(parsed) ? parsed : [];
}

function isAutoRunnerBranch(branchName) {
  return /^feature\/auto-\d+-/.test(branchName || "") || /auto-runner/.test(branchName || "");
}

function safeValue(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
