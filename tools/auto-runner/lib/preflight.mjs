import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import path from "node:path";
import { resolveCodexCommand } from "./codex-runner.mjs";
import { getCurrentBranch, getRefSha, getStatusShort } from "./git-workspace.mjs";
import { evaluateTrustPolicy } from "./canary-policy.mjs";

const repoNameWithOwner = "tommytang213/Settleora";

export function runPreflight(config) {
  const checks = [];
  checks.push(checkRepoRoot(config));
  checks.push(checkBranchAndStatus(config));
  checks.push(checkGhAvailable());
  checks.push(checkGhRepoView(config));
  checks.push(checkIssuePolling(config));
  checks.push(checkCodexResolution(config));
  checks.push(checkLogsRoot(config));
  checks.push(checkConfig(config));
  checks.push(checkTrustedRealRunPolicy(config));
  checks.push(checkCanaryRealRunPolicy(config));
  checks.push(policyCheck("auto-merge-disabled", !config.allowAutoMerge, "allowAutoMerge is disabled."));
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
      !config.allowReviewFixMutation && config.maxReviewFixCycles === 0,
      "review-fix mutation is disabled.",
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

  return {
    mode: "preflight",
    generatedAt: new Date().toISOString(),
    repo: repoNameWithOwner,
    summary: summarize(checks),
    checks,
  };
}

function checkRepoRoot(config) {
  const cwd = process.cwd();
  const packageJson = path.join(config.repoRoot, "package.json");
  const runner = path.join(config.repoRoot, "tools/auto-runner/settleora-auto-runner.mjs");
  const ok = cwd === config.repoRoot && existsSync(packageJson) && existsSync(runner);
  return {
    name: "repo-root",
    status: ok ? "pass" : "fail",
    detail: bounded(`cwd=${cwd}; configured=${config.repoRoot}`),
  };
}

function checkBranchAndStatus(config) {
  try {
    const branch = getCurrentBranch();
    const status = getStatusShort();
    const originMainSha = getRefSha("origin/main");
    const realRunWouldRefuse = branch === "main" || Boolean(status);
    return {
      name: "branch-worktree",
      status: realRunWouldRefuse ? "warn" : "pass",
      detail: bounded(
        JSON.stringify({
          branch,
          dirty: Boolean(status),
          realRunWouldRefuse,
          originMainSha,
          status: status || "",
        }),
      ),
    };
  } catch (error) {
    return { name: "branch-worktree", status: "fail", detail: bounded(error.message) };
  }
}

function checkGhAvailable() {
  const result = spawnSync("gh", ["--version"], { encoding: "utf8", windowsHide: true });
  return commandCheck("gh-available", result, { passDetail: firstLine(result.stdout) });
}

function checkGhRepoView(config) {
  const result = spawnSync("gh", ["repo", "view", repoNameWithOwner, "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    cwd: config.repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  const resolved = result.stdout.trim();
  return {
    name: "gh-repo-view",
    status: result.status === 0 && resolved === repoNameWithOwner ? "pass" : "fail",
    detail: bounded(result.status === 0 ? `resolved=${resolved}` : result.stderr || result.error?.message || ""),
  };
}

function checkIssuePolling(config) {
  const search = `repo:${repoNameWithOwner} is:issue is:open (${config.eligibleLabels
    .map((label) => `label:${label}`)
    .join(" OR ")})`;
  const result = spawnSync(
    "gh",
    ["issue", "list", "--repo", repoNameWithOwner, "--state", "open", "--limit", "1", "--json", "number,title,labels", "--search", search],
    { cwd: config.repoRoot, encoding: "utf8", windowsHide: true },
  );
  return commandCheck("github-issue-polling", result, {
    passDetail: `pollable=true; returned=${safeCountJsonArray(result.stdout)}`,
  });
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

function checkConfig(config) {
  const requiredArrays = ["eligibleLabels", "stopLabels", "claimLabels"];
  const missing = requiredArrays.filter((key) => !Array.isArray(config[key]) || config[key].length === 0);
  return {
    name: "config-parseable",
    status: missing.length === 0 ? "pass" : "fail",
    detail: missing.length === 0 ? "required arrays present" : `missing or empty: ${missing.join(", ")}`,
  };
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
    status: policy.allowed ? "warn" : "pass",
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
        canaryRunWouldRefuse: !policy.allowed,
        reason: policy.reason,
        maxIterations: config.maxIterations,
        trustedRealRunCanaryMaxIterations: config.trustedRealRunCanaryMaxIterations,
        evidenceRoot: config.canaryEvidenceRoot,
        unsafeToggles: policy.unsafeToggles,
      }),
    ),
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
    status: ok ? "pass" : "warn",
    detail: ok ? passDetail : `${name} is explicitly enabled in config; manual gate required before trusted use.`,
  };
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

function summarize(checks) {
  return checks.reduce(
    (summary, check) => {
      summary[check.status] = (summary[check.status] || 0) + 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 },
  );
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
