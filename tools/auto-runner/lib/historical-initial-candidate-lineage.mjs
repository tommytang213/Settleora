import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { readIssueCommentDigest } from "./github-issues.mjs";
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
  "aggregate_validation",
  "external_review",
  "codex_mechanics_security_review",
  "review_fix",
  "push",
  "pr_create_recover",
  "ci_wait",
]);
const terminalIntentOutcome = "validation_failed";

export function verifyHistoricalInitialCandidateLineage(config, state, issue, options = {}) {
  const fail = (reasonCode) => ({ ok: false, reasonCode });
  try {
    const repository = config?.repositorySlug;
    const repoRoot = path.resolve(config?.repoRoot || "");
    const evidenceRepoRoot = path.resolve(config?.controlPlaneRepoRoot || repoRoot);
    const issueNumber = issue?.number;
    const taskKey = state?.taskKey;
    const runId = state?.run?.runId;
    const supervisorRunId = state?.run?.supervisorRunId;
    const branch = state?.branch?.name;
    const baseSha = state?.branch?.baseSha;
    const continuation = state?.ordinaryContinuation;
    const identity = continuation?.identity;
    const headSha = identity?.headSha;
    const recordedCandidates = [
      ...(continuation?.sourceFailureHistory || []).map((entry) => entry?.candidate),
      continuation?.sourceFailureBatch?.candidate,
    ].filter(Boolean);
    const cleanIdentityFallback = recordedCandidates.length === 0;
    const candidates = cleanIdentityFallback && identity ? [identity] : recordedCandidates;
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
      path.join(evidenceRepoRoot, ".codex", "reports"), `settleora-codex-report-${taskKey}-issue-${issueNumber}-`)
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
    const subject = git(["show", "-s", "--format=%s", initialHeadSha]).stdout.trim();
    const expectedInitialFailureSubject =
      `Auto-runner issue #${issueNumber}: initial candidate before source classification`;
    if (cleanIdentityFallback
      ? !subject.startsWith(`Auto-runner issue #${issueNumber}: `) || subject.length > 300
      : subject !== expectedInitialFailureSubject) {
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
    const checkoutBranch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]).stdout.trim();
    const checkoutClean = git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout === "";
    const candidateCheckout = checkoutBranch === branch;
    const controlPlaneCheckout = checkoutBranch === "main"
      && checkoutClean
      && checkoutHeadSha === currentMain;
    const literalBranchHead = git(["rev-parse", "--verify", `refs/heads/${branch}`]).stdout.trim();
    if (literalBranchHead !== headSha
      && !(checkoutBranch === branch && literalBranchHead === checkoutHeadSha)) {
      return fail("historical_candidate_branch_ref_mismatch");
    }
    if (!checkoutClean || (!candidateCheckout && !controlPlaneCheckout)) {
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
    const lifecycleSuccessor = authenticatedRecoverySuccessor(lifecycle, runId);
    const activeLifecyclePosture = lifecycle.mutationAuthority?.status === "active"
      && lifecycle.mutationAuthority?.ownerSessionId === lifecycle.sessions.current
      && lifecycle.mutationAuthority.ownerSessionId === expectedLifecycle?.mutationAuthority?.ownerSessionId
      && lifecycle.controller?.phase === expectedLifecyclePhase
      && (initialLifecyclePosture
        ? lifecycle.controller?.nextExactAction === "run_validation_and_commit"
        : lifecycle.controller?.nextExactAction === expectedLifecycle?.controller?.nextExactAction
          && typeof lifecycle.controller?.nextExactAction === "string"
          && lifecycle.controller.nextExactAction.length > 0)
      && lifecycle.report?.status === "in_progress"
      && lifecycle.recovery?.phaseAfter === expectedLifecyclePhase
      && lifecycleSuccessor === lifecycle.sessions.current
      && lifecycle.mutationAuthority.handoff.successorSessionId === lifecycle.sessions.current;
    const terminalPreparationPosture = options.allowTerminalValidationRetryPreparation === true
      && lifecycle.controller?.phase === "stopped"
      && lifecycle.controller?.nextExactAction === "checkpoint_validation_recovery_failed_closed"
      && lifecycle.report?.status === "stopped"
      && lifecycle.mutationAuthority?.status === "terminal"
      && lifecycle.mutationAuthority?.ownerSessionId === null
      && lifecycle.recovery?.phaseAfter === options.expectedTerminalLifecyclePhase;
    if (lifecycle.logicalTask?.claimIdentity !== `${repository}#${issueNumber}`
      || lifecycle.logicalTask?.supervisorRunId !== supervisorRunId
      || lifecycle.branch?.name !== branch || lifecycle.branch?.baseSha !== baseSha
      || lifecycle.branch?.headSha !== headSha
      || !Number.isSafeInteger(lifecycle.sessions?.generation)
      || lifecycle.sessions.generation < 2
      || lifecycle.sessions.generation !== expectedLifecycle?.sessions?.generation
      || lifecycle.sessions.current !== expectedLifecycle?.sessions?.current
      || lifecycle.mutationAuthority?.generation !== lifecycle.sessions.generation
      || (!activeLifecyclePosture && !terminalPreparationPosture)
      || lifecycle.recovery?.operationId !== options.expectedRecoveryOperationId
      || lifecycle.recovery?.effectsAlreadyPresent?.commit !== true
      || ["push", "pr", "merge"].some(
        (key) => lifecycle.recovery?.effectsAlreadyPresent?.[key] !== false,
      )
      || ![true, false].includes(lifecycle.recovery?.effectsAlreadyPresent?.comment)
      || lifecycle.checkpoint?.status !== "ready" || !digest.test(lifecycle.checkpoint?.digest || "")
      || lifecycle.report?.path !== state.expectedReportPaths.repoReportPath
      || lifecycle.report?.correlationKey !== taskKey) return fail("historical_candidate_lifecycle_mismatch");

    const budgetLoader = options.loadBudget || loadLogicalTaskBudget;
    const budget = budgetLoader(config, supervisorRunId);
    const charges = Object.entries(budget?.state?.charges || {});
    const matchingCharges = charges.filter(([id, marker]) =>
      id === options.expectedChargeId
      && marker?.identity?.repository === repository
      && marker?.identity?.issueNumber === issueNumber
      && marker?.identity?.claimIdentity === `${repository}#${issueNumber}`);
    const chargeId = matchingCharges[0]?.[0];
    if (!budget?.ok || matchingCharges.length !== 1
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
    const remoteTaskBranchRead = (options.readRemoteTaskBranch
      || readRemoteTaskBranch)(git, branch);
    const readTerminalComment = options.allowTerminalValidationRetryPreparation === true
      ? () => (options.readIssueCommentDigest || readIssueCommentDigest)(
        config, issueNumber, options.expectedTerminalCommentBodyDigest,
      )
      : null;
    const prePrTerminalAuthority = validatePrePrTerminalIntentAuthority({
      state,
      issue,
      intents,
      lifecycle,
      repository,
      issueNumber,
      taskKey,
      runId,
      supervisorRunId,
      branch,
      baseSha,
      headSha,
      originalHeadSha: initialHeadSha,
      originalTreeSha: candidate.treeSha,
      chargeId,
      chargeIdentity: budget.statePath,
      expectedOutcome: options.expectedTerminalOutcome,
      expectedCommentBodyDigest: options.expectedTerminalCommentBodyDigest,
      expectedWorktreeOwnership: options.expectedWorktreeOwnership || null,
      remoteTaskBranchRead,
      readTerminalComment,
    });
    const authenticatedPrePrTerminalEffects = !authenticatedExistingPrEffects
      && prePrTerminalAuthority.ok;
    if (!noLaterEffects(state) && !authenticatedExistingPrEffects && !authenticatedPrePrTerminalEffects) {
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
    if (!controlPlaneCheckout && checkoutHeadSha !== headSha && !validPreparedSourceFixCheckout(
      git, continuation, headSha, checkoutHeadSha, {
        issueNumber, repository, taskKey, runId, branch,
        chargeIdentity: budget.statePath, commitIntents,
      },
    )) return fail("historical_candidate_checkout_mismatch");
    if (intents.some((entry) => externalEffects.has(entry.effectType))
      && !authenticatedExistingPrEffects && !authenticatedPrePrTerminalEffects) {
      return fail(prePrTerminalAuthority.reasonCode || "historical_candidate_external_intent_present");
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
      requiresTaskWorkspaceAdoption: controlPlaneCheckout,
    };
  } catch {
    return fail("historical_candidate_authoritative_read_unavailable");
  }
}

export function readRemoteTaskBranch(git, branch) {
  const result = git([
    "-c", "protocol.ext.allow=never",
    "ls-remote", "--heads", "origin", `refs/heads/${branch}`,
  ]);
  if (result.status !== 0 || result.stderr !== "") {
    return { complete: false, absent: false };
  }
  if (result.stdout === "") return { complete: true, absent: true };
  const lines = result.stdout.trimEnd().split("\n");
  const expectedRef = `refs/heads/${branch}`;
  if (lines.length !== 1) return { complete: false, absent: false };
  const [headSha, ref, ...extra] = lines[0].split("\t");
  return sha.test(headSha || "") && ref === expectedRef && extra.length === 0
    ? { complete: true, absent: false, headSha }
    : { complete: false, absent: false };
}

export function validatePrePrTerminalIntentAuthority(input = {}) {
  const fail = (reasonCode) => ({ ok: false, reasonCode });
  const {
    state, issue, intents, lifecycle, repository, issueNumber, taskKey, runId,
    supervisorRunId, branch, baseSha, headSha, originalHeadSha, originalTreeSha,
    chargeId, chargeIdentity, expectedOutcome,
    expectedCommentBodyDigest, expectedWorktreeOwnership,
    remoteTaskBranchRead,
    readTerminalComment,
  } = input;
  const claimIdentity = `${repository}#${issueNumber}`;
  const terminalHeadSha = originalHeadSha || headSha;
  if (remoteTaskBranchRead?.complete !== true) {
    return fail("historical_candidate_terminal_remote_branch_read_unavailable");
  }
  if (remoteTaskBranchRead.absent !== true) {
    return fail("historical_candidate_terminal_remote_branch_present");
  }
  if (!repository || !Number.isSafeInteger(issueNumber) || state?.issue?.number !== issueNumber
    || state?.taskKey !== taskKey || state?.run?.runId !== runId
    || state?.run?.supervisorRunId !== supervisorRunId || state?.branch?.name !== branch
    || state?.branch?.baseSha !== baseSha || state?.branch?.currentHeadSha !== headSha
    || expectedOutcome !== terminalIntentOutcome || !digest.test(expectedCommentBodyDigest || "")) {
    return fail("historical_candidate_terminal_intent_identity_mismatch");
  }
  const exactTerminalState = state?.phase === "stopped"
    && state?.firstIncompleteAction === "run_validation_and_commit"
    && state?.nextSafeAction === "stop_fail_closed"
    && state?.stopReason?.reasonCode === "checkpoint_validation_recovery_failed_closed";
  const exactValidationRetryHandoff = state?.phase === "checkpoint_validation_commit"
    && state?.firstIncompleteAction === "run_validation_and_commit"
    && state?.nextSafeAction === "run_validation_and_commit"
    && state?.stopReason === null;
  const preservedClaim = state?.claimAuthority;
  const exactPreservedContinuation = preservedClaim?.mode === "preserved_recovery_claim"
    && preservedClaim?.ok === true
    && preservedClaim?.authority?.taskKey === taskKey
    && preservedClaim?.authority?.runId === runId
    && preservedClaim?.authority?.chargeId === chargeId
    && preservedClaim?.authority?.priorOutcome === terminalIntentOutcome
    && preservedClaim?.authority?.branchName === branch
    && preservedClaim?.authority?.baseSha === baseSha
    && preservedClaim?.authority?.candidateIdentity?.headSha === terminalHeadSha
    && ["checkpoint_validation_commit", "aggregate_validation", "external_review",
      "codex_mechanics_security_review", "review_fix"].includes(state?.phase)
    && ["passed", "failed"].includes(state?.evidence?.localValidation?.status)
    && state?.stopReason === null;
  const exactOriginalTerminalPosture = (exactTerminalState || exactValidationRetryHandoff)
    && state?.evidence?.localValidation?.status === "failed"
    && lifecycle?.controller?.phase === "stopped"
    && lifecycle?.controller?.nextExactAction === "checkpoint_validation_recovery_failed_closed"
    && lifecycle?.report?.status === "stopped"
    && lifecycle?.mutationAuthority?.status === "terminal"
    && lifecycle?.mutationAuthority?.ownerSessionId === null;
  const terminalCommentRead = typeof readTerminalComment === "function"
    ? readTerminalComment()
    : null;
  if (terminalCommentRead?.complete !== true) {
    return fail("historical_candidate_terminal_comment_read_unavailable");
  }
  if (!Number.isSafeInteger(terminalCommentRead.matchingCount)
    || terminalCommentRead.matchingCount < 0
    || terminalCommentRead.matchingCount > 1) {
    return fail("historical_candidate_terminal_comment_present");
  }
  const recordedCommentEffect = lifecycle?.recovery?.effectsAlreadyPresent?.comment;
  if ((!exactOriginalTerminalPosture && !exactPreservedContinuation)
    || state?.pr?.number !== null || state?.pr?.headSha !== null
    || state?.branch?.expectedRemoteHeadSha !== null
    || lifecycle?.logicalTask?.issueNumber !== issueNumber
    || lifecycle?.logicalTask?.taskKey !== taskKey
    || lifecycle?.logicalTask?.runId !== runId
    || lifecycle?.logicalTask?.supervisorRunId !== supervisorRunId
    || lifecycle?.logicalTask?.claimIdentity !== claimIdentity
    || lifecycle?.logicalTask?.chargeMarkerRef !== chargeIdentity
    || lifecycle?.branch?.name !== branch || lifecycle?.branch?.baseSha !== baseSha
    || lifecycle?.branch?.headSha !== headSha || lifecycle?.branch?.prNumber !== null
    || lifecycle?.mutationAuthority?.generation !== lifecycle?.sessions?.generation
    || lifecycle?.recovery?.effectsAlreadyPresent?.commit !== true
    || ["push", "pr", "merge"].some(
      (effect) => lifecycle?.recovery?.effectsAlreadyPresent?.[effect] !== false,
    )
    || ![true, false].includes(recordedCommentEffect)
    || (recordedCommentEffect === true && terminalCommentRead.matchingCount !== 1)) {
    return fail("historical_candidate_terminal_outcome_mismatch");
  }
  const external = intents.filter((intent) => externalEffects.has(intent.effectType));
  const hygiene = external.filter((intent) => intent.effectType === "hygiene_component");
  const comments = external.filter((intent) => intent.effectType === "comment");
  const commitIntents = intents.filter((intent) => intent.effectType === "commit");
  if (external.length !== 3 || hygiene.length !== 2 || comments.length !== 1) {
    return fail("historical_candidate_terminal_intent_set_mismatch");
  }
  const fingerprints = external.map((intent) => intent.fingerprint);
  const intentIds = external.map((intent) => intent.intentId);
  if (fingerprints.some((value) => !digest.test(value || ""))
    || intentIds.some((value) =>
      typeof value !== "string" || value.length === 0 || value.length > 120
        || /[\x00-\x1f\x7f]/u.test(value))
    || new Set(fingerprints).size !== fingerprints.length
    || new Set(intentIds).size !== intentIds.length) {
    return fail("historical_candidate_terminal_intent_duplicate");
  }
  const sessions = new Set([lifecycle.sessions?.current, ...(lifecycle.sessions?.retired || [])]);
  for (const intent of external) {
    if (intent.repository !== repository || intent.sourceTaskKey !== taskKey || intent.runId !== runId
      || intent.logicalTaskIdentity !== claimIdentity || intent.claimIdentity !== claimIdentity
      || intent.chargeIdentity !== chargeIdentity || !sessions.has(intent.sessionId)
      || !Number.isSafeInteger(intent.authorityGeneration)
      || intent.identity?.repository !== repository || intent.identity?.sourceTaskKey !== taskKey
      || intent.identity?.runId !== runId || intent.identity?.logicalTaskIdentity !== claimIdentity
      || intent.identity?.claimIdentity !== claimIdentity
      || intent.identity?.chargeIdentity !== chargeIdentity
      || intent.identity?.sessionId !== intent.sessionId
      || intent.identity?.authorityGeneration !== intent.authorityGeneration
      || intent.identity?.issueNumber !== issueNumber || intent.identity?.branchName !== branch
      || intent.identity?.baseSha !== baseSha || intent.identity?.headSha !== terminalHeadSha
      || intent.identity?.candidateIdentity !== terminalHeadSha) {
      return fail("historical_candidate_terminal_intent_identity_mismatch");
    }
  }
  const add = hygiene.filter((intent) => intent.effect?.operation === "add");
  const remove = hygiene.filter((intent) => intent.effect?.operation === "remove");
  const matchingTerminalCommits = commitIntents.filter((intent) =>
    intent.status === "finalized"
    && JSON.stringify(intent.effect?.expectedParents) === JSON.stringify([baseSha])
    && intent.effect?.treeSha === originalTreeSha);
  const terminalCommit = matchingTerminalCommits.length === 1
    ? matchingTerminalCommits[0]
    : null;
  if (add.length !== 1 || remove.length !== 1
    || !terminalCommit
    || hygiene.some((intent) =>
      intent.sessionId !== terminalCommit.sessionId
        || intent.authorityGeneration !== terminalCommit.authorityGeneration)
    || add[0].status !== "finalized" || remove[0].status !== "finalized"
    || add[0].effect?.issueNumber !== issueNumber || remove[0].effect?.issueNumber !== issueNumber
    || add[0].effect?.outcome !== terminalIntentOutcome
    || remove[0].effect?.outcome !== terminalIntentOutcome
    || JSON.stringify(add[0].effect?.addLabels) !== JSON.stringify(["auto-failed"])
    || JSON.stringify(add[0].effect?.removeLabels) !== JSON.stringify([])
    || JSON.stringify(remove[0].effect?.addLabels) !== JSON.stringify([])
    || JSON.stringify([...(remove[0].effect?.removeLabels || [])].sort())
      !== JSON.stringify(["auto-claimed", "auto-running"])
    || JSON.stringify(Object.keys(add[0].effect || {}).sort())
      !== JSON.stringify(["addLabels", "issueNumber", "operation", "outcome", "removeLabels"])
    || JSON.stringify(Object.keys(remove[0].effect || {}).sort())
      !== JSON.stringify(["addLabels", "issueNumber", "operation", "outcome", "removeLabels"])) {
    return fail("historical_candidate_terminal_hygiene_mismatch");
  }
  const labels = new Set(issue?.labels || []);
  if (!labels.has("auto-failed") || labels.has("auto-running") || labels.has("auto-claimed")) {
    return fail("historical_candidate_terminal_live_labels_mismatch");
  }
  const comment = comments[0];
  const lifecycleSuccessor = authenticatedRecoverySuccessor(lifecycle, runId);
  const provenanceIdentity = comment?.identity && comment?.recoveryProvenance
    ? {
      ...comment.identity,
      sessionId: comment.recoveryProvenance.sessionId,
      authorityGeneration: comment.recoveryProvenance.authorityGeneration,
    }
    : null;
  const provenanceFingerprint = provenanceIdentity
    ? hash(canonical({
      effectType: comment.effectType,
      identity: provenanceIdentity,
      effect: comment.effect,
    }))
    : null;
  const expectedRecoverySuccessor = lifecycleSuccessor
    || recoverySuccessorIdentity({
      runId,
      operationId: lifecycle?.recovery?.operationId,
      predecessorSessionId: comment?.recoveryProvenance?.sessionId,
    });
  const retiredSessions = lifecycle.sessions?.retired || [];
  const exactRecoveryPredecessor = `${runId}:recovery:${lifecycle?.recovery?.operationId}`;
  if (comment.status !== "prepared"
    || comment.sessionId !== lifecycle.sessions.current
    || comment.sessionId !== expectedRecoverySuccessor
    || comment.authorityGeneration !== lifecycle.sessions.generation
    || comment.effect?.issueNumber !== issueNumber
    || comment.effect?.outcome !== terminalIntentOutcome
    || comment.effect?.bodyDigest !== expectedCommentBodyDigest
    || JSON.stringify(Object.keys(comment.effect || {}).sort())
      !== JSON.stringify(["bodyDigest", "issueNumber", "outcome"])
    || comment.recoveryProvenance?.sessionId == null
    || !retiredSessions.includes(exactRecoveryPredecessor)
    || retiredSessions.at(-1) !== comment.recoveryProvenance.sessionId
    || !Number.isSafeInteger(comment.recoveryProvenance?.authorityGeneration)
    || comment.recoveryProvenance.authorityGeneration !== comment.authorityGeneration - 1
    || !digest.test(comment.recoveryProvenance?.fingerprint || "")
    || comment.recoveryProvenance.fingerprint !== provenanceFingerprint
    || JSON.stringify(comment.diagnostics)
      !== JSON.stringify(["validated_successor_authority_handoff"])
    || lifecycle?.recovery?.status !== "pending") {
    return fail("historical_candidate_terminal_comment_mismatch");
  }
  const exactWorktreeOwnership = expectedWorktreeOwnership
    && plainObject(state?.mutationMarkers?.worktree_ownership_created)
    && Object.keys(state.mutationMarkers.worktree_ownership_created).length === 1
    && state.mutationMarkers.worktree_ownership_created[expectedWorktreeOwnership.key]?.status === "completed"
    && state.mutationMarkers.worktree_ownership_created[expectedWorktreeOwnership.key]?.target
      === expectedWorktreeOwnership.target
    && state.mutationMarkers.worktree_ownership_created[expectedWorktreeOwnership.key]?.correlation
      === expectedWorktreeOwnership.correlation
    && typeof state.mutationMarkers.worktree_ownership_created[expectedWorktreeOwnership.key]?.completedAt === "string"
    && Number.isFinite(Date.parse(
      state.mutationMarkers.worktree_ownership_created[expectedWorktreeOwnership.key].completedAt,
    ));
  if (!plainObject(state?.mutationMarkers)
    || Object.entries(state.mutationMarkers).some(([kind, markers]) =>
      (!["claim", "logical_task_charge", "branch_ownership_created"].includes(kind)
        && !(kind === "worktree_ownership_created" && exactWorktreeOwnership))
        || !plainObject(markers))) {
    return fail("historical_candidate_terminal_later_effect_present");
  }
  return { ok: true, reasonCode: "historical_candidate_pre_pr_terminal_intents_authenticated" };
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
    cwd, encoding: "utf8", timeout: 15_000,
    env: {
      PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0",
      GIT_NO_LAZY_FETCH: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
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
    /(?:^|\0)(?:extensions\.(?!worktreeconfig(?:\n|\0))|objects\.|include(?:if)?\.|filter\.|credential\.|http\.[^\n\0]*proxy|remote\.[^\n\0]+\.(?:proxy|uploadpack|receivepack)|protocol\.[^\n\0]+\.allow|ssh\.variant|diff\.external(?:\n|\0)|diff\.[^\n\0]+\.(?:command|textconv)(?:\n|\0)|merge\.[^\n\0]+\.driver(?:\n|\0)|core\.worktree|core\.gitproxy|core\.fsmonitor|core\.sshcommand|core\.hookspath|core\.attributesfile|url\.)/iu.test(value);
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
  const intentHead = (entry) => entry.effect?.localSha || entry.effect?.localCommitSha
    || entry.effect?.sourceHeadSha || entry.identity?.headSha;
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
    && sha.test(intentHead(entry) || "")
    && entry.identity?.headSha === intentHead(entry)
    && priorHeads.has(intentHead(entry));
  const exactPush = (entry) => commonIntentAuthority(entry)
    && entry.identity?.baseSha === authority.baseSha
    && entry.effect?.repositoryOwnership === authority.repository
    && entry.effect?.remoteBranch === authority.branch
    && entry.effect?.localSha === intentHead(entry)
    && entry.effect?.allowedFastForwardTarget === intentHead(entry)
    && (entry.effect?.expectedRemoteBeforeSha == null
      || priorHeads.has(entry.effect.expectedRemoteBeforeSha));
  const exactPr = (entry) => commonIntentAuthority(entry)
    && entry.identity?.issueNumber === authority.issueNumber
    && entry.identity?.baseBranch === "main"
    && entry.identity?.baseSha === authority.currentMainSha
    && entry.effect?.issueNumber === authority.issueNumber
    && entry.effect?.sourceBranch === authority.branch
    && intentHead(entry) === entry.identity.headSha
    && (entry.effectType === "pr_create"
      ? entry.effect?.sourceHeadSha === intentHead(entry)
      : [entry.effect?.localSha, entry.effect?.localCommitSha, entry.effect?.sourceHeadSha]
        .some((value) => value === intentHead(entry)))
    && entry.effect?.targetBaseBranch === "main"
    && entry.effect?.targetBaseSha === authority.currentMainSha
    && (entry.effect?.draft == null || entry.effect.draft === false)
    && (entry.effect?.prNumber == null || entry.effect.prNumber === pr?.number)
    && (entry.effect?.prUrl == null || entry.effect.prUrl === exactUrl);
  const orderedPushHeads = [];
  let previousHead = null;
  while (orderedPushHeads.length <= 51) {
    const next = pushIntents.filter((entry) =>
      entry.effect?.expectedRemoteBeforeSha === previousHead);
    if (next.length !== 1 || !exactPush(next[0])) break;
    const nextHead = intentHead(next[0]);
    if (orderedPushHeads.includes(nextHead)) break;
    orderedPushHeads.push(nextHead);
    previousHead = nextHead;
  }
  const prCreateIntents = prIntents.filter((entry) => entry.effectType === "pr_create");
  const prHeads = new Set(prIntents.filter(exactPr).map(intentHead));
  const markerHeads = (values, target) => values.every((entry) =>
    entry?.status === "completed" && entry?.target === target
      && orderedPushHeads.includes(entry?.correlation));
  const remoteHead = authority.git([
    "rev-parse", "--verify", `refs/remotes/origin/${authority.branch}`,
  ]);
  const pushChainValid = continuation?.expectedOriginMainSha === authority.currentMainSha
    && state.branch?.expectedRemoteHeadSha === authority.headSha
    && remoteHead.status === 0 && remoteHead.stdout.trim() === authority.headSha
    && Number.isSafeInteger(continuation?.counters?.githubTriggeredFixEpochsPerPr)
    && continuation.counters.githubTriggeredFixEpochsPerPr >= 0
    && continuation.counters.githubTriggeredFixEpochsPerPr <= 50
    && Array.isArray(fingerprints) && fingerprints.length <= 100
    && fingerprints.every((value) => digest.test(value || ""))
    && (continuation.counters.githubTriggeredFixEpochsPerPr === 0
      ? fingerprints.length === 0
      : fingerprints.length > 0)
    && orderedPushHeads.length >= 1 && orderedPushHeads.length <= 51
    && orderedPushHeads.at(-1) === authority.headSha
    && pushMarkers.length === orderedPushHeads.length
    && markerHeads(pushMarkers, authority.branch)
    && new Set(pushMarkers.map((entry) => entry.correlation)).size === orderedPushHeads.length
    && pushIntents.length === orderedPushHeads.length
    && pushIntents.every(exactPush);
  const pushOnly = continuation?.phase === "pr_create_or_update"
    && pr?.number == null && pr?.url == null && pr?.headSha == null
    && prMarkers.length === 0 && prIntents.length === 0
    && externalIntents.length === orderedPushHeads.length
    && externalIntents.every((entry) => entry.effectType === "push");
  if (pushChainValid && pushOnly) return true;
  return pushChainValid
    && Number.isSafeInteger(pr?.number) && pr.number > 0 && pr.url === exactUrl
    && pr.headSha === authority.headSha && priorHeads.has(pr.headSha)
    && pr.headRefName === authority.branch && pr.baseRefName === "main"
    && ["OPEN", "open"].includes(pr.state)
    && prMarkers.length === orderedPushHeads.length
    && markerHeads(prMarkers, exactUrl)
    && new Set(prMarkers.map((entry) => entry.correlation)).size === orderedPushHeads.length
    && externalIntents.length === orderedPushHeads.length * 2
    && externalIntents.every((entry) => allowedTypes.has(entry.effectType))
    && prIntents.length === orderedPushHeads.length
    && prCreateIntents.length === orderedPushHeads.length
    && prCreateIntents.every(exactPr)
    && prHeads.size === orderedPushHeads.length
    && orderedPushHeads.every((head) => prHeads.has(head));
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
function recoverySuccessorIdentity({ runId, operationId, predecessorSessionId }) {
  if (!runId || !operationId || !predecessorSessionId) return null;
  const requestId = hash(`${operationId}:${predecessorSessionId}:validation-retry`);
  return `recovery-handoff:${hash(JSON.stringify([runId, operationId, requestId]))}`;
}
function authenticatedRecoverySuccessor(lifecycle, runId) {
  const handoff = lifecycle?.mutationAuthority?.handoff;
  const operationId = lifecycle?.recovery?.operationId;
  const predecessorSessionId = handoff?.retiredSessionId;
  if (!runId || !operationId || !predecessorSessionId
    || typeof handoff?.reason !== "string" || !handoff.reason.length
    || lifecycle.sessions?.retired?.at(-1) !== predecessorSessionId) return null;
  const expectedRequestId = handoff.reason === "validation_retry_derivative_reopened"
    ? hash(`${operationId}:${predecessorSessionId}:validation-retry`)
    : hash(`${operationId}:${predecessorSessionId}`);
  if (handoff.requestId !== expectedRequestId) return null;
  return `recovery-handoff:${hash(JSON.stringify([runId, operationId, handoff.requestId]))}`;
}
function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonical(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function hashJson(value) { return hash(JSON.stringify(value)); }
