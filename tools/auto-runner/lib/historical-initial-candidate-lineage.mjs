import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { loadLogicalTaskBudget } from "./logical-task-budget.mjs";
import {
  ordinaryContinuationLegacyPhaseTarget,
  ordinaryContinuationPhaseTarget,
  ordinaryContinuationPhases,
} from "./ordinary-candidate-continuation.mjs";
import { findPreEffectIntents, intentIssueAuthorityMatches } from "./pre-effect-intent.mjs";
import {
  validatePreservedRecoveryCommitLineage,
  validatePreservedRecoveryProjectNamespace,
} from "./preserved-recovery-deployment.mjs";
import { canonicalApprovedGitHubRepository } from "./runtime-identity.mjs";
import { loadSessionLifecycleForRecovery } from "./session-lifecycle.mjs";

const sha = /^[a-f0-9]{40}$/u;
const digest = /^[a-f0-9]{64}$/u;
const externalEffects = new Set([
  "push", "pr_create", "pr_head_update", "pr_update", "pr_retarget", "pr_ready", "pr_draft",
  "merge", "comment", "review_reply", "issue_closure", "issue_progress_comment", "umbrella_update",
  "ledger_docs_update", "docs_branch_create", "docs_pr_create_update", "review_request",
  "review_trigger", "docs_pr_ready", "docs_pr_merge", "project_status_update",
  "branch_retention_verify", "hygiene_component",
]);
const firstExternalPhase = ordinaryContinuationPhases.indexOf("push");
const recoverableLifecyclePhases = new Set([
  "checkpoint_validation_commit",
  "external_review",
  "codex_mechanics_security_review",
  "review_fix",
  "push",
  "pr_create_recover",
  "ci_wait",
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
    const continuation = state?.ordinaryContinuation;
    const identity = continuation?.identity;
    const headSha = identity?.headSha;
    const candidates = [
      ...(continuation?.sourceFailureHistory || []).map((entry) => entry?.candidate),
      continuation?.sourceFailureBatch?.candidate,
    ].filter(Boolean);
    const candidate = candidates[0];
    if (!repository || !Number.isSafeInteger(issueNumber) || state?.issue?.number !== issueNumber
      || !taskKey || !runId || !supervisorRunId || !branch || !sha.test(baseSha || "")
      || !sha.test(headSha || "") || baseSha === headSha || !candidate
      || ![candidate?.headSha, headSha].includes(state?.branch?.currentHeadSha)) {
      return fail("historical_candidate_authority_identity_mismatch");
    }
    if (continuation?.logicalTaskKey !== `issue-${issueNumber}`
      || continuation?.executionKey !== runId || continuation?.issueNumber !== issueNumber
      || continuation?.branchName !== branch
      || continuation?.counters?.acceptedLogicalTasks !== 1) return fail("historical_candidate_continuation_mismatch");
    if (!sameActiveAndInitialCandidate(identity, candidate, baseSha)) {
      return fail("historical_candidate_durable_identity_mismatch");
    }
    const expectedPaths = [...identity.changedFiles].sort();
    if (!safeChangedPaths(expectedPaths) || !safeChangedPaths(candidate.changedFiles)
      || hashJson(expectedPaths) !== identity.changedFilesDigest) {
      return fail("historical_candidate_changed_paths_mismatch");
    }
    if (!canonicalCorrelatedPath(state.expectedReportPaths?.repoReportPath,
      path.join(repoRoot, ".codex", "reports"), `settleora-codex-report-${taskKey}-issue-${issueNumber}-`)
      || !canonicalCorrelatedPath(state.expectedReportPaths?.promptPath,
        path.join(config.logsRoot, "tasks"), `${taskKey}-issue-${issueNumber}-`)) {
      return fail("historical_candidate_report_prompt_mismatch");
    }
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
    const initialHeadSha = candidate.headSha;
    if (!objectIs(git, baseSha, "commit") || !objectIs(git, initialHeadSha, "commit")
      || !objectIs(git, headSha, "commit")) {
      return fail("historical_candidate_object_unavailable");
    }
    if (!validRecordedCandidateHistory(git, candidates, baseSha, headSha)) {
      return fail("historical_candidate_history_identity_mismatch");
    }
    const currentMain = git(["rev-parse", "--verify", "refs/remotes/origin/main"]).stdout.trim();
    if (!sha.test(currentMain) || !ancestor(git, baseSha, currentMain)) {
      return fail("historical_candidate_main_not_descendant");
    }
    if (ancestor(git, initialHeadSha, currentMain)) return fail("historical_candidate_already_in_main");
    const parents = git(["show", "-s", "--format=%P", initialHeadSha]).stdout.trim().split(/\s+/u).filter(Boolean);
    if (parents.length !== 1 || parents[0] !== baseSha
      || git(["rev-list", "--count", `${baseSha}..${initialHeadSha}`]).stdout.trim() !== "1") {
      return fail("historical_candidate_topology_mismatch");
    }
    const subject = `Auto-runner issue #${issueNumber}: initial candidate before source classification`;
    if (git(["show", "-s", "--format=%s", initialHeadSha]).stdout.trim() !== subject) {
      return fail("historical_candidate_subject_mismatch");
    }
    if (git(["rev-parse", `${initialHeadSha}^{tree}`]).stdout.trim() !== candidate.treeSha) {
      return fail("historical_candidate_tree_mismatch");
    }
    const initialPaths = lines(git(["diff", "--name-only", baseSha, initialHeadSha]).stdout).sort();
    const initialDiff = git(["diff", "--binary", `${baseSha}...${initialHeadSha}`]).stdout;
    const livePaths = lines(git(["diff", "--name-only", baseSha, headSha]).stdout).sort();
    const rawDiff = git(["diff", "--binary", `${baseSha}...${headSha}`]).stdout;
    if (JSON.stringify(initialPaths) !== JSON.stringify([...candidate.changedFiles].sort())
      || hashJson(initialPaths) !== candidate.changedFilesDigest
      || hash(initialDiff.slice(0, 512_000)) !== candidate.diffDigest
      || JSON.stringify(livePaths) !== JSON.stringify(expectedPaths)
      || hashJson(livePaths) !== identity.changedFilesDigest
      || hash(rawDiff.slice(0, 512_000)) !== identity.diffDigest) {
      return fail("historical_candidate_diff_mismatch");
    }
    const checkoutHeadSha = git(["rev-parse", "HEAD"]).stdout.trim();
    if (git(["symbolic-ref", "--quiet", "--short", "HEAD"]).stdout.trim() !== branch
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
    const expectedLifecyclePhase = options.expectedLifecyclePhase || "checkpoint_validation_commit";
    const initialLifecyclePosture = expectedLifecyclePhase === "checkpoint_validation_commit";
    if (!recoverableLifecyclePhases.has(expectedLifecyclePhase)) {
      return fail("historical_candidate_lifecycle_mismatch");
    }
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
      || lifecycle.controller?.phase !== expectedLifecyclePhase
      || (initialLifecyclePosture
        ? lifecycle.controller?.nextExactAction !== "run_validation_and_commit"
        : lifecycle.controller?.nextExactAction !== expectedLifecycle?.controller?.nextExactAction
          || typeof lifecycle.controller?.nextExactAction !== "string"
          || lifecycle.controller.nextExactAction.length === 0)
      || lifecycle.report?.status !== "in_progress"
      || lifecycle.recovery?.phaseAfter !== expectedLifecyclePhase
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
    const authenticatedExistingPrEffects = options.allowAuthenticatedExistingPrEffects === true
      && validAuthenticatedExistingPrEffects(
        state, intents, {
          git, repository, issueNumber, taskKey, runId, branch, baseSha,
          currentMainSha: currentMain, headSha, chargeIdentity: budget.statePath,
        },
      );
    if (!noLaterEffects(state) && !authenticatedExistingPrEffects) {
      return fail("historical_candidate_later_effect_present");
    }
    if (!validContinuationPhase(
      continuation, expectedLifecyclePhase, authenticatedExistingPrEffects,
    )) return fail("historical_candidate_continuation_mismatch");
    if (!validCompletedEffects(continuation, authenticatedExistingPrEffects)) {
      return fail("historical_candidate_local_effect_mismatch");
    }
    const commitIntents = intents.filter((intent) => intent.effectType === "commit");
    const initialIntentMatches = commitIntents.filter((entry) =>
      entry.effect?.expectedParents?.[0] === baseSha && entry.effect?.treeSha === candidate.treeSha);
    const intent = commitIntents.length === 1 ? commitIntents[0] : initialIntentMatches[0];
    if (!intent || (commitIntents.length > 1 && initialIntentMatches.length !== 1)) {
      return fail("historical_candidate_commit_intent_ambiguous");
    }
    if (intent.status !== "finalized" || !intentIssueAuthorityMatches(intent, issueNumber)
      || intent.logicalTaskIdentity !== `${repository}#${issueNumber}`
      || intent.claimIdentity !== `${repository}#${issueNumber}`
      || intent.chargeIdentity !== budget.statePath
      || intent.identity?.branchName !== branch || intent.identity?.baseSha !== baseSha
      || intent.identity?.headSha !== baseSha || intent.effect?.expectedParents?.length !== 1
      || intent.effect.expectedParents[0] !== baseSha || intent.effect?.treeSha !== candidate.treeSha
      || JSON.stringify(intent.effect?.stagedPaths) !== JSON.stringify([...candidate.changedFiles].sort())
      || intent.effect?.messageDigest !== hash(subject)) {
      return fail("historical_candidate_commit_intent_mismatch");
    }
    if (!validAdvancedCandidateLineage(git, {
      active: identity, initial: candidate, branch, issueNumber, repository,
      chargeIdentity: budget.statePath, commitIntents,
      validateChangedPaths: options.validateChangedPaths,
    })) return fail("historical_candidate_advanced_lineage_mismatch");
    if (checkoutHeadSha !== headSha && !validPreparedSourceFixCheckout(
      git, continuation, headSha, checkoutHeadSha, {
        issueNumber, repository, taskKey, runId, branch,
        chargeIdentity: budget.statePath, commitIntents,
      },
    )) return fail("historical_candidate_checkout_mismatch");
    if (intents.some((entry) => externalEffects.has(entry.effectType)) && !authenticatedExistingPrEffects) {
      return fail("historical_candidate_external_intent_present");
    }
    const lineageValidator = options.validateCommitLineage
      || validatePreservedRecoveryCommitLineage;
    const lineage = lineageValidator(repoRoot, {
      repository, branch, baseSha, headSha: identity.headSha, treeSha: identity.treeSha,
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

export function validateHistoricalRecoveryGitAuthority(config, options = {}) {
  try {
    const repository = config?.repositorySlug;
    const repoRoot = path.resolve(config?.repoRoot || "");
    const git = options.git || ((args) => runGit(repoRoot, args));
    return Boolean(repository && repoRoot
      && trustedRepository(git, repository, repoRoot)
      && !unsafeObjectMechanism(repoRoot, git));
  } catch {
    return false;
  }
}
function validPreparedSourceFixCheckout(git, continuation, candidateHead, checkoutHead, authority) {
  const fix = continuation?.sourceFailureFixIntent;
  const batch = continuation?.sourceFailureBatch;
  const subject = `Auto-runner issue #${authority.issueNumber}: source-fix ${fix?.batchIdentity?.slice(0, 16)}`;
  const treeSha = git(["rev-parse", `${checkoutHead}^{tree}`]).stdout.trim();
  const stagedPaths = lines(git(["diff", "--name-only", candidateHead, checkoutHead]).stdout).sort();
  const matchingIntents = authority.commitIntents.filter((intent) =>
    intent.effect?.expectedParents?.length === 1
      && intent.effect.expectedParents[0] === candidateHead
      && intent.effect?.treeSha === treeSha);
  const intent = matchingIntents[0];
  return fix?.status === "prepared"
    && digest.test(fix.batchIdentity || "")
    && fix.candidateHead === candidateHead
    && batch?.batchIdentity === fix.batchIdentity
    && batch?.candidate?.headSha === candidateHead
    && sha.test(checkoutHead || "") && checkoutHead !== candidateHead
    && ancestor(git, candidateHead, checkoutHead)
    && git(["rev-list", "--count", `${candidateHead}..${checkoutHead}`]).stdout.trim() === "1"
    && git(["show", "-s", "--format=%P", checkoutHead]).stdout.trim() === candidateHead
    && git(["show", "-s", "--format=%s", checkoutHead]).stdout.trim() === subject
    && matchingIntents.length === 1
    && intent.status === "finalized"
    && intentIssueAuthorityMatches(intent, authority.issueNumber)
    && intent.repository === authority.repository
    && intent.sourceTaskKey === authority.taskKey
    && intent.runId === authority.runId
    && intent.logicalTaskIdentity === `${authority.repository}#${authority.issueNumber}`
    && intent.claimIdentity === `${authority.repository}#${authority.issueNumber}`
    && intent.chargeIdentity === authority.chargeIdentity
    && intent.identity?.branchName === authority.branch
    && intent.identity?.headSha === candidateHead
    && JSON.stringify(intent.effect?.stagedPaths) === JSON.stringify(stagedPaths)
    && intent.effect?.messageDigest === hash(subject);
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
  const worktreeConfig = git(["config", "--local", "--get", "extensions.worktreeConfig"]);
  const configs = git(["config", "--local", "--list", "--show-origin", "--null"]);
  const worktreeConfigEnabled = worktreeConfig.status === 0
    && worktreeConfig.stdout.trim().toLowerCase() === "true";
  const worktreeConfigPath = worktreeConfigEnabled
    ? git(["rev-parse", "--git-path", "config.worktree"])
    : null;
  const resolvedWorktreeConfigPath = worktreeConfigPath?.status === 0
    ? path.resolve(repoRoot, worktreeConfigPath.stdout.trim())
    : null;
  const worktreeConfigFileSafe = !resolvedWorktreeConfigPath
    || !existsSync(resolvedWorktreeConfigPath)
    || (lstatSync(resolvedWorktreeConfigPath).isFile()
      && !lstatSync(resolvedWorktreeConfigPath).isSymbolicLink());
  const worktreeConfigs = worktreeConfigEnabled && resolvedWorktreeConfigPath
    && existsSync(resolvedWorktreeConfigPath) && worktreeConfigFileSafe
    ? git(["config", "--worktree", "--list", "--show-origin", "--null"])
    : null;
  const unsafeConfig = (value) =>
    /(?:^|\0)(?:extensions\.(?!worktreeconfig(?:\n|\0))|objects\.|include(?:if)?\.|filter\.|credential\.|http\.[^\n\0]*proxy|remote\.[^\n\0]+\.(?:proxy|uploadpack|receivepack)|protocol\.[^\n\0]+\.allow|ssh\.variant|diff\.external(?:\n|\0)|diff\.[^\n\0]+\.(?:command|textconv)(?:\n|\0)|core\.worktree|core\.gitproxy|core\.fsmonitor|core\.sshcommand|core\.hookspath|core\.attributesfile|url\.)/iu.test(value);
  return top.status === 0 && path.resolve(top.stdout.trim()) === repoRoot
    && remote.status === 0
    && canonicalApprovedGitHubRepository(remote.stdout.trim()) === repository.toLowerCase()
    && (worktreeConfig.status === 1 || worktreeConfigEnabled)
    && configs.status === 0
    && !unsafeConfig(configs.stdout)
    && (!worktreeConfigEnabled
      || (worktreeConfigPath.status === 0 && worktreeConfigFileSafe
        && (!existsSync(resolvedWorktreeConfigPath)
          || (worktreeConfigs?.status === 0 && !unsafeConfig(worktreeConfigs.stdout)))));
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
function sameActiveAndInitialCandidate(active, initial, baseSha) {
  const structurallyValid = active && initial && active.baseSha === baseSha && initial.baseSha === baseSha
    && sha.test(active.headSha || "") && sha.test(initial.headSha || "")
    && ["treeSha", "diffDigest", "changedFilesDigest"].every((key) =>
      (key === "treeSha" ? sha : digest).test(active[key] || "")
      && (key === "treeSha" ? sha : digest).test(initial[key] || ""))
    && Array.isArray(active.changedFiles) && Array.isArray(initial.changedFiles);
  return Boolean(structurallyValid && (active.headSha !== initial.headSha
    || (active.treeSha === initial.treeSha
      && active.diffDigest === initial.diffDigest
      && active.changedFilesDigest === initial.changedFilesDigest
      && JSON.stringify(active.changedFiles) === JSON.stringify(initial.changedFiles))));
}
function validAdvancedCandidateLineage(git, {
  active, initial, branch, issueNumber, repository, chargeIdentity, commitIntents,
  validateChangedPaths,
}) {
  if (active.headSha === initial.headSha) return active.treeSha === initial.treeSha
    && active.diffDigest === initial.diffDigest
    && active.changedFilesDigest === initial.changedFilesDigest
    && JSON.stringify(active.changedFiles) === JSON.stringify(initial.changedFiles);
  if (!ancestor(git, initial.headSha, active.headSha)) return false;
  const commits = lines(git(["rev-list", "--reverse", `${initial.headSha}..${active.headSha}`]).stdout);
  if (commits.length < 1 || commits.length > 50) return false;
  let parent = initial.headSha;
  for (const commit of commits) {
    const parents = git(["show", "-s", "--format=%P", commit]).stdout.trim().split(/\s+/u).filter(Boolean);
    const treeSha = git(["rev-parse", `${commit}^{tree}`]).stdout.trim();
    const subject = git(["show", "-s", "--format=%s", commit]).stdout.trim();
    const stagedPaths = lines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", parent, commit]).stdout).sort();
    const matches = commitIntents.filter((intent) => intent.status === "finalized"
      && intent.repository === repository && intentIssueAuthorityMatches(intent, issueNumber)
      && intent.logicalTaskIdentity === `${repository}#${issueNumber}`
      && intent.claimIdentity === `${repository}#${issueNumber}`
      && intent.chargeIdentity === chargeIdentity
      && intent.identity?.branchName === branch
      && intent.identity?.baseSha === initial.baseSha
      && intent.identity?.headSha === parent
      && intent.effect?.expectedParents?.length === 1
      && intent.effect.expectedParents[0] === parent
      && intent.effect?.treeSha === treeSha
      && intent.effect?.messageDigest === hash(subject)
      && JSON.stringify(intent.effect?.stagedPaths) === JSON.stringify(stagedPaths));
    if (parents.length !== 1 || parents[0] !== parent || matches.length !== 1
      || !safeChangedPaths(stagedPaths)
      || (typeof validateChangedPaths === "function"
        ? !validateChangedPaths(stagedPaths)
        : stagedPaths.some((entry) => !initial.changedFiles.includes(entry)))) return false;
    parent = commit;
  }
  return parent === active.headSha;
}
function validRecordedCandidateHistory(git, candidates, baseSha, activeHeadSha) {
  const identities = new Map();
  for (const candidate of candidates) {
    if (candidate?.baseSha !== baseSha || !sha.test(candidate?.headSha || "")
      || !sha.test(candidate?.treeSha || "") || !digest.test(candidate?.diffDigest || "")
      || !digest.test(candidate?.changedFilesDigest || "") || !safeChangedPaths(candidate?.changedFiles)) {
      return false;
    }
    const encoded = hashJson(candidate);
    if (identities.has(candidate.headSha) && identities.get(candidate.headSha) !== encoded) return false;
    identities.set(candidate.headSha, encoded);
  }
  for (const candidate of candidates) {
    if (!objectIs(git, candidate.headSha, "commit") || !ancestor(git, candidate.headSha, activeHeadSha)
      || git(["rev-parse", `${candidate.headSha}^{tree}`]).stdout.trim() !== candidate.treeSha) return false;
    const paths = lines(git(["diff", "--name-only", baseSha, candidate.headSha]).stdout).sort();
    const rawDiff = git(["diff", "--binary", `${baseSha}...${candidate.headSha}`]).stdout;
    if (JSON.stringify(paths) !== JSON.stringify([...candidate.changedFiles].sort())
      || hashJson(paths) !== candidate.changedFilesDigest
      || hash(rawDiff.slice(0, 512_000)) !== candidate.diffDigest) return false;
  }
  return true;
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
    && !continuationExternalEffectPresent(state.ordinaryContinuation?.effects);
}
function validAuthenticatedExistingPrEffects(state, intents, authority) {
  const continuation = state.ordinaryContinuation;
  const pr = state.pr;
  const priorHeads = new Set((continuation?.sourceFailureHistory || [])
    .map((entry) => entry?.candidate?.headSha).filter((value) => sha.test(value || "")));
  if (sha.test(continuation?.identity?.headSha || "")) priorHeads.add(continuation.identity.headSha);
  const fingerprints = continuation?.processedGithubFindingFingerprints;
  const externalIntents = intents.filter((entry) => externalEffects.has(entry.effectType));
  const allowedTypes = new Set(["push", "pr_create", "pr_head_update"]);
  const exactUrl = `https://github.com/${authority.repository}/pull/${pr?.number}`;
  const markers = state.mutationMarkers || {};
  const pushMarkers = Object.values(markers.push || {});
  const prMarkers = [
    ...Object.values(markers.pr_create || {}),
    ...Object.values(markers.pr_head_update || {}),
  ];
  const pushIntents = externalIntents.filter((entry) => entry.effectType === "push");
  const prIntents = externalIntents.filter((entry) =>
    ["pr_create", "pr_head_update"].includes(entry.effectType));
  const commonIntentAuthority = (entry) => entry.status === "finalized"
    && entry.repository === authority.repository
    && entry.sourceTaskKey === authority.taskKey
    && entry.runId === authority.runId
    && intentIssueAuthorityMatches(entry, authority.issueNumber)
    && entry.logicalTaskIdentity === `${authority.repository}#${authority.issueNumber}`
    && entry.claimIdentity === `${authority.repository}#${authority.issueNumber}`
    && entry.chargeIdentity === authority.chargeIdentity
    && entry.identity?.repository === authority.repository
    && entry.identity?.sourceTaskKey === authority.taskKey
    && entry.identity?.runId === authority.runId
    && entry.identity?.logicalTaskIdentity === `${authority.repository}#${authority.issueNumber}`
    && entry.identity?.claimIdentity === `${authority.repository}#${authority.issueNumber}`
    && entry.identity?.chargeIdentity === authority.chargeIdentity
    && entry.identity?.branchName === authority.branch
    && entry.identity?.headSha === authority.headSha;
  const exactPush = (entry) => commonIntentAuthority(entry)
    && entry.identity?.baseSha === authority.baseSha
    && entry.effect?.repositoryOwnership === authority.repository
    && entry.effect?.remoteBranch === authority.branch
    && entry.effect?.localSha === authority.headSha
    && entry.effect?.allowedFastForwardTarget === authority.headSha;
  const exactPr = (entry) => commonIntentAuthority(entry)
    && entry.identity?.issueNumber === authority.issueNumber
    && entry.identity?.baseBranch === "main"
    && entry.identity?.baseSha === authority.currentMainSha
    && entry.effect?.issueNumber === authority.issueNumber
    && entry.effect?.sourceBranch === authority.branch
    && entry.effect?.sourceHeadSha === authority.headSha
    && entry.effect?.targetBaseBranch === "main"
    && entry.effect?.targetBaseSha === authority.currentMainSha
    && entry.effect?.draft === false;
  const remoteHead = authority.git([
    "rev-parse", "--verify", `refs/remotes/origin/${authority.branch}`,
  ]);
  return Number.isSafeInteger(pr?.number) && pr.number > 0 && pr.url === exactUrl
    && pr.headSha === authority.headSha && priorHeads.has(pr.headSha)
    && pr.headRefName === authority.branch && pr.baseRefName === "main"
    && ["OPEN", "open"].includes(pr.state)
    && continuation?.expectedOriginMainSha === authority.currentMainSha
    && state.branch?.expectedRemoteHeadSha === pr.headSha
    && remoteHead.status === 0 && remoteHead.stdout.trim() === authority.headSha
    && Number.isSafeInteger(continuation?.counters?.githubTriggeredFixEpochsPerPr)
    && continuation.counters.githubTriggeredFixEpochsPerPr >= 0
    && continuation.counters.githubTriggeredFixEpochsPerPr <= 50
    && Array.isArray(fingerprints) && fingerprints.length <= 100
    && fingerprints.every((value) => digest.test(value || ""))
    && (continuation.counters.githubTriggeredFixEpochsPerPr === 0
      ? fingerprints.length === 0
      : fingerprints.length > 0)
    && pushMarkers.length === 1 && prMarkers.length === 1
    && pushMarkers[0]?.status === "completed"
    && pushMarkers[0]?.target === authority.branch
    && pushMarkers[0]?.correlation === authority.headSha
    && prMarkers[0]?.status === "completed"
    && prMarkers[0]?.target === exactUrl
    && prMarkers[0]?.correlation === authority.headSha
    && externalIntents.length === 2
    && externalIntents.every((entry) => allowedTypes.has(entry.effectType))
    && pushIntents.length === 1 && exactPush(pushIntents[0])
    && prIntents.length === 1 && exactPr(prIntents[0]);
}
function continuationExternalEffectPresent(effects) {
  return effects && typeof effects === "object"
    && Object.keys(effects).some((key) => {
      const index = ordinaryContinuationPhases.indexOf(key);
      return index < 0 || index >= firstExternalPhase;
    });
}
function validContinuationPhase(continuation, lifecyclePhase, authenticatedExistingPrEffects) {
  const index = ordinaryContinuationPhases.indexOf(continuation?.phase);
  if (index >= ordinaryContinuationPhases.indexOf("local_validation")
    && index < firstExternalPhase) return true;
  if (!authenticatedExistingPrEffects) return false;
  return new Map([
    ["push", "push"],
    ["pr_create_recover", "pr_create_or_update"],
    ["ci_wait", "github_convergence"],
  ]).get(lifecyclePhase) === continuation.phase;
}
function validCompletedEffects(continuation, authenticatedExistingPrEffects) {
  const effects = continuation?.effects;
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) return false;
  const current = ordinaryContinuationPhases.indexOf(continuation.phase);
  const legacyTargetsAllowed = !Object.hasOwn(continuation, "expectedOriginMainSha");
  for (const [phase, effect] of Object.entries(effects)) {
    const index = ordinaryContinuationPhases.indexOf(phase);
    const targetMatches = digest.test(effect?.targetDigest || "")
      && (effect.targetDigest === ordinaryContinuationPhaseTarget(continuation, phase)
      || (legacyTargetsAllowed
        && effect.targetDigest === ordinaryContinuationLegacyPhaseTarget(continuation, phase)));
    if (index < 0 || index >= current
      || (index >= firstExternalPhase && !authenticatedExistingPrEffects)
      || !targetMatches
      || typeof effect?.completedAt !== "string" || !Number.isFinite(Date.parse(effect.completedAt))) {
      return false;
    }
  }
  for (let index = ordinaryContinuationPhases.indexOf("local_validation"); index < current; index += 1) {
    if (!effects[ordinaryContinuationPhases[index]]) return false;
  }
  return true;
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
  if (path.dirname(resolved) !== path.resolve(root)
    || !path.basename(resolved).startsWith(prefix) || !path.basename(resolved).endsWith(".md")) return false;
  try {
    const info = lstatSync(resolved);
    return info.isFile() && !info.isSymbolicLink() && realpathSync(resolved) === resolved
      && (typeof process.getuid !== "function" || info.uid === process.getuid())
      && (info.mode & 0o022) === 0;
  } catch {
    return false;
  }
}
function lines(value) { return String(value || "").split(/\r?\n/u).filter(Boolean); }
function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function hashJson(value) { return hash(JSON.stringify(value)); }
