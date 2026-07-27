import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { loadLogicalTaskBudget } from "./logical-task-budget.mjs";
import { findPreEffectIntents, intentIssueAuthorityMatches } from "./pre-effect-intent.mjs";
import {
  validatePreservedRecoveryCommitLineage,
  validatePreservedRecoveryProjectNamespace,
} from "./preserved-recovery-deployment.mjs";
import { loadSessionLifecycleForRecovery } from "./session-lifecycle.mjs";

const sha = /^[a-f0-9]{40}$/u;
const digest = /^[a-f0-9]{64}$/u;
const externalEffects = new Set([
  "push", "pr_create", "pr_head_update", "pr_update", "pr_retarget", "pr_ready", "pr_draft",
  "merge", "comment", "review_reply", "issue_closure", "issue_progress_comment", "umbrella_update",
  "ledger_docs_update", "docs_branch_create", "docs_pr_create_update", "review_request",
  "review_trigger", "docs_pr_ready", "docs_pr_merge", "project_status_update",
  "branch_retention_verify",
]);

export function verifyHistoricalInitialCandidateLineage(config, state, issue, options = {}) {
  const fail = (reasonCode) => ({ ok: false, reasonCode });
  try {
    const repository = config?.repositorySlug;
    const repoRoot = path.resolve(config?.repoRoot || "");
    const issueNumber = issue?.number;
    const taskKey = state?.taskKey;
    const runId = state?.run?.runId;
    const supervisorRunId = state?.run?.supervisorRunId;
    const branch = state?.branch?.name;
    const baseSha = state?.branch?.baseSha;
    const headSha = state?.branch?.currentHeadSha;
    const continuation = state?.ordinaryContinuation;
    const identity = continuation?.identity;
    const candidate = continuation?.sourceFailureBatch?.candidate;
    if (!repository || !Number.isSafeInteger(issueNumber) || state?.issue?.number !== issueNumber
      || !taskKey || !runId || !supervisorRunId || !branch || !sha.test(baseSha || "")
      || !sha.test(headSha || "") || baseSha === headSha) return fail("historical_candidate_authority_identity_mismatch");
    if (continuation?.logicalTaskKey !== `issue-${issueNumber}`
      || continuation?.executionKey !== runId || continuation?.issueNumber !== issueNumber
      || continuation?.branchName !== branch || continuation?.phase !== "local_validation"
      || continuation?.counters?.acceptedLogicalTasks !== 1) return fail("historical_candidate_continuation_mismatch");
    if (!sameCandidate(identity, candidate, baseSha, headSha)) return fail("historical_candidate_durable_identity_mismatch");
    const expectedPaths = [...identity.changedFiles].sort();
    if (!safeChangedPaths(expectedPaths) || hashJson(expectedPaths) !== identity.changedFilesDigest) {
      return fail("historical_candidate_changed_paths_mismatch");
    }
    if (!canonicalCorrelatedPath(state.expectedReportPaths?.repoReportPath,
      path.join(repoRoot, ".codex", "reports"), `settleora-codex-report-${taskKey}-issue-${issueNumber}-`)
      || !canonicalCorrelatedPath(state.expectedReportPaths?.promptPath,
        path.join(config.logsRoot, "tasks"), `${taskKey}-issue-${issueNumber}-`)) {
      return fail("historical_candidate_report_prompt_mismatch");
    }
    if (!noLaterEffects(state)) return fail("historical_candidate_later_effect_present");
    const namespaceValidator = options.validateProjectNamespace
      || validatePreservedRecoveryProjectNamespace;
    if (!namespaceValidator(config.logsRoot, repository, repoRoot, process.env)) {
      return fail("historical_candidate_namespace_mismatch");
    }

    const git = options.git || ((args) => runGit(repoRoot, args));
    if (!trustedRepository(git, repository, repoRoot)) return fail("historical_candidate_git_environment_untrusted");
    if (git(["rev-parse", "--is-shallow-repository"]).stdout.trim() !== "false") {
      return fail("historical_candidate_history_shallow");
    }
    if (unsafeObjectMechanism(repoRoot, git)) return fail("historical_candidate_git_object_environment_untrusted");
    if (!objectIs(git, baseSha, "commit") || !objectIs(git, headSha, "commit")) {
      return fail("historical_candidate_object_unavailable");
    }
    const currentMain = git(["rev-parse", "--verify", "refs/remotes/origin/main"]).stdout.trim();
    if (!sha.test(currentMain) || !ancestor(git, baseSha, currentMain)) {
      return fail("historical_candidate_main_not_descendant");
    }
    if (ancestor(git, headSha, currentMain)) return fail("historical_candidate_already_in_main");
    const parents = git(["show", "-s", "--format=%P", headSha]).stdout.trim().split(/\s+/u).filter(Boolean);
    if (parents.length !== 1 || parents[0] !== baseSha
      || git(["rev-list", "--count", `${baseSha}..${headSha}`]).stdout.trim() !== "1") {
      return fail("historical_candidate_topology_mismatch");
    }
    const subject = `Auto-runner issue #${issueNumber}: initial candidate before source classification`;
    if (git(["show", "-s", "--format=%s", headSha]).stdout.trim() !== subject) {
      return fail("historical_candidate_subject_mismatch");
    }
    if (git(["rev-parse", `${headSha}^{tree}`]).stdout.trim() !== identity.treeSha) {
      return fail("historical_candidate_tree_mismatch");
    }
    const livePaths = lines(git(["diff", "--name-only", baseSha, headSha]).stdout).sort();
    const rawDiff = git(["diff", "--binary", `${baseSha}...${headSha}`]).stdout;
    if (JSON.stringify(livePaths) !== JSON.stringify(expectedPaths)
      || hashJson(livePaths) !== identity.changedFilesDigest
      || hash(rawDiff.slice(0, 512_000)) !== identity.diffDigest) return fail("historical_candidate_diff_mismatch");
    if (git(["symbolic-ref", "--quiet", "--short", "HEAD"]).stdout.trim() !== branch
      || git(["rev-parse", "HEAD"]).stdout.trim() !== headSha
      || git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout !== "") {
      return fail("historical_candidate_checkout_mismatch");
    }

    const lifecycleLoader = options.loadLifecycle || loadSessionLifecycleForRecovery;
    const loadedLifecycle = lifecycleLoader(config, {
      repository, issueNumber, taskKey, runId, supervisorRunId, branchName: branch,
      baseSha, headSha,
    });
    if (!loadedLifecycle?.ok) return fail("historical_candidate_lifecycle_untrusted");
    const lifecycle = loadedLifecycle.state;
    const expectedLifecycle = state.sessionLifecycle;
    if (lifecycle.logicalTask?.claimIdentity !== `${repository}#${issueNumber}`
      || lifecycle.logicalTask?.supervisorRunId !== supervisorRunId
      || lifecycle.branch?.name !== branch || lifecycle.branch?.baseSha !== baseSha
      || lifecycle.branch?.headSha !== headSha
      || !Number.isSafeInteger(lifecycle.sessions?.generation)
      || lifecycle.sessions.generation < 2
      || lifecycle.sessions.generation !== expectedLifecycle?.sessions?.generation
      || lifecycle.sessions.current !== expectedLifecycle?.sessions?.current
      || lifecycle.mutationAuthority?.generation !== lifecycle.sessions.generation
      || lifecycle.mutationAuthority?.status !== "active"
      || lifecycle.mutationAuthority?.ownerSessionId !== lifecycle.sessions.current
      || lifecycle.mutationAuthority.ownerSessionId !== expectedLifecycle?.mutationAuthority?.ownerSessionId
      || lifecycle.controller?.phase !== "checkpoint_validation_commit"
      || lifecycle.controller?.nextExactAction !== "run_validation_and_commit"
      || lifecycle.report?.status !== "in_progress"
      || lifecycle.recovery?.phaseAfter !== "checkpoint_validation_commit"
      || lifecycle.mutationAuthority?.handoff?.reason !== "validation_retry_derivative_reopened"
      || lifecycle.mutationAuthority.handoff.successorSessionId !== lifecycle.sessions.current
      || lifecycle.recovery?.operationId !== options.expectedRecoveryOperationId
      || lifecycle.recovery?.effectsAlreadyPresent?.commit !== true
      || ["push", "pr", "merge", "comment"].some((key) => lifecycle.recovery?.effectsAlreadyPresent?.[key] !== false)
      || lifecycle.checkpoint?.status !== "ready" || !digest.test(lifecycle.checkpoint?.digest || "")
      || lifecycle.report?.path !== state.expectedReportPaths.repoReportPath
      || lifecycle.report?.correlationKey !== taskKey) return fail("historical_candidate_lifecycle_mismatch");

    const budgetLoader = options.loadBudget || loadLogicalTaskBudget;
    const budget = budgetLoader(config, supervisorRunId);
    const charges = Object.entries(budget?.state?.charges || {});
    const chargeId = charges[0]?.[0];
    if (!budget?.ok || budget.state.acceptedLogicalTaskCount !== 1 || charges.length !== 1
      || chargeId !== options.expectedChargeId || charges[0][1]?.identity?.repository !== repository
      || charges[0][1]?.identity?.issueNumber !== issueNumber
      || charges[0][1]?.identity?.claimIdentity !== `${repository}#${issueNumber}`
      || lifecycle.logicalTask?.chargeMarkerRef !== budget.statePath) {
      return fail("historical_candidate_charge_mismatch");
    }
    if (!exactMarkers(state, issueNumber, runId, chargeId, branch, baseSha)) {
      return fail("historical_candidate_marker_mismatch");
    }

    const intentFinder = options.findIntents || findPreEffectIntents;
    const intents = intentFinder(config, (intent) => intent.repository === repository
      && intent.sourceTaskKey === taskKey && intent.runId === runId);
    const commitIntents = intents.filter((intent) => intent.effectType === "commit");
    if (commitIntents.length !== 1) return fail("historical_candidate_commit_intent_ambiguous");
    const intent = commitIntents[0];
    if (intent.status !== "finalized" || !intentIssueAuthorityMatches(intent, issueNumber)
      || intent.logicalTaskIdentity !== `${repository}#${issueNumber}`
      || intent.claimIdentity !== `${repository}#${issueNumber}`
      || intent.chargeIdentity !== budget.statePath
      || intent.identity?.branchName !== branch || intent.identity?.baseSha !== baseSha
      || intent.identity?.headSha !== baseSha || intent.effect?.expectedParents?.length !== 1
      || intent.effect.expectedParents[0] !== baseSha || intent.effect?.treeSha !== identity.treeSha
      || JSON.stringify(intent.effect?.stagedPaths) !== JSON.stringify(expectedPaths)
      || intent.effect?.messageDigest !== hash(subject)) {
      return fail("historical_candidate_commit_intent_mismatch");
    }
    if (intents.some((entry) => externalEffects.has(entry.effectType))) {
      return fail("historical_candidate_external_intent_present");
    }
    const lineageValidator = options.validateCommitLineage
      || validatePreservedRecoveryCommitLineage;
    const lineage = lineageValidator(repoRoot, {
      repository, branch, baseSha, headSha, treeSha: identity.treeSha,
      diffDigest: identity.diffDigest,
    }, commitIntents, expectedPaths, process.env);
    if (!lineage?.ok) return fail(lineage?.reasonCode || "historical_candidate_git_authority_mismatch");
    return {
      ok: true,
      reasonCode: currentMain === baseSha
        ? "historical_candidate_exact_base_proven"
        : "historical_candidate_descendant_main_proven",
      candidateIdentity: { ...identity, changedFiles: expectedPaths },
      currentMainSha: currentMain,
    };
  } catch {
    return fail("historical_candidate_authoritative_read_unavailable");
  }
}

function runGit(cwd, args) {
  return spawnSync("/usr/bin/git", args, {
    cwd, encoding: "utf8",
    env: {
      PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0",
      GIT_NO_LAZY_FETCH: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null",
    },
  });
}
function trustedRepository(git, repository, repoRoot) {
  const rootInfo = lstatSync(repoRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || realpathSync(repoRoot) !== repoRoot) return false;
  const top = git(["rev-parse", "--show-toplevel"]);
  const remote = git(["config", "--local", "--get", "remote.origin.url"]);
  const configs = git(["config", "--local", "--list", "--show-origin", "--null"]);
  return top.status === 0 && path.resolve(top.stdout.trim()) === repoRoot
    && remote.status === 0
    && [`https://github.com/${repository}.git`, `git@github.com:${repository}.git`].includes(remote.stdout.trim())
    && configs.status === 0
    && !/(?:^|\0)(?:extensions\.|objects\.|core\.worktree|core\.gitproxy|core\.fsmonitor|core\.sshcommand|core\.hookspath|url\.)/iu.test(configs.stdout);
}
function unsafeObjectMechanism(repoRoot, git) {
  const common = git(["rev-parse", "--git-common-dir"]).stdout.trim();
  const gitDir = path.resolve(repoRoot, common);
  const replaceRoot = path.join(gitDir, "refs", "replace");
  const packedRefs = path.join(gitDir, "packed-refs");
  return existsSync(path.join(gitDir, "info", "grafts"))
    || (existsSync(replaceRoot) && readdirSync(replaceRoot).length > 0)
    || (existsSync(packedRefs) && /(?:^|\n)[a-f0-9]{40} refs\/replace\//u.test(
      String(git(["show-ref"]).stdout || ""),
    ))
    || existsSync(path.join(gitDir, "objects", "info", "alternates"))
    || Boolean(process.env.GIT_REPLACE_REF_BASE || process.env.GIT_OBJECT_DIRECTORY
      || process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES || process.env.GIT_COMMON_DIR
      || process.env.GIT_DIR || process.env.GIT_WORK_TREE || process.env.GIT_SHALLOW_FILE);
}
function objectIs(git, value, type) {
  const result = git(["cat-file", "-t", value]);
  return result.status === 0 && result.stdout.trim() === type;
}
function ancestor(git, older, newer) {
  return git(["merge-base", "--is-ancestor", older, newer]).status === 0;
}
function sameCandidate(a, b, baseSha, headSha) {
  const fields = ["treeSha", "diffDigest", "changedFilesDigest"];
  return a && b && a.baseSha === baseSha && a.headSha === headSha
    && b.baseSha === baseSha && b.headSha === headSha
    && fields.every((key) => a[key] === b[key] && (key === "treeSha" ? sha : digest).test(a[key] || ""))
    && JSON.stringify(a.changedFiles) === JSON.stringify(b.changedFiles);
}
function safeChangedPaths(values) {
  return Array.isArray(values) && values.length > 0 && values.length <= 64
    && values.every((value) => typeof value === "string" && value.length <= 300
      && !path.isAbsolute(value) && !value.split("/").includes("..") && !/[\x00-\x1f\x7f]/u.test(value));
}
function noLaterEffects(state) {
  return state.pr?.number === null && state.pr?.url === null && state.pr?.headSha === null
    && state.branch?.expectedRemoteHeadSha === null
    && ["push", "pr_create", "pr_head_update", "merge", "comment"]
      .every((kind) => Object.keys(state.mutationMarkers?.[kind] || {}).length === 0)
    && !continuationEffectPresent(state.ordinaryContinuation?.effects);
}
function continuationEffectPresent(effects) {
  return effects && typeof effects === "object"
    && Object.keys(effects).some((key) => !["candidate_reconciliation"].includes(key));
}
function exactMarkers(state, issueNumber, runId, chargeId, branch, baseSha) {
  const claim = state.mutationMarkers?.claim || {};
  const charge = state.mutationMarkers?.logical_task_charge || {};
  const ownership = state.mutationMarkers?.branch_ownership_created || {};
  return Object.keys(claim).length === 1 && claim[`issue-${issueNumber}`]?.status === "completed"
    && claim[`issue-${issueNumber}`]?.correlation === runId
    && Object.keys(charge).length === 1 && charge[chargeId]?.status === "completed"
    && charge[chargeId]?.correlation === chargeId
    && Object.keys(ownership).length === 1
    && ownership[`${branch}:${baseSha}`]?.status === "completed";
}
function canonicalCorrelatedPath(candidate, root, prefix) {
  if (typeof candidate !== "string") return false;
  const resolved = path.resolve(candidate);
  return path.dirname(resolved) === path.resolve(root)
    && path.basename(resolved).startsWith(prefix) && path.basename(resolved).endsWith(".md");
}
function lines(value) { return String(value || "").split(/\r?\n/u).filter(Boolean); }
function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function hashJson(value) { return hash(JSON.stringify(value)); }
