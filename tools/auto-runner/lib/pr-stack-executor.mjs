import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { isUtf8 } from "node:buffer";
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  nextStackAction,
  proveSemanticOwnDelta,
  recordStackMutationMarker,
  validateStackRelationships,
} from "./pr-stack-controller.mjs";
import {
  executeAutoMergeMergeOnly,
  inspectAutoMergeGithubState,
  mandatoryAutoMergeCheckNames,
  summarizeCheckStatus,
} from "./auto-merge-policy.mjs";
import { completeMergedIssueHygiene } from "./completion-hygiene.mjs";
import {
  accountConvergenceEvent,
  buildBatchFixTask,
  freezeMaterialFindingInventory,
  reviewFindingsFromSupportedContainers,
  runExistingPrBatchFix,
  runExistingPrReviewConvergence,
} from "./review-convergence-controller.mjs";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";
import { classifyIssueLane, filterForbiddenChangedFiles, laneManifest } from "./lane-policy.mjs";
import { runCodexPrompt } from "./codex-runner.mjs";
import { validateReviewConvergenceState } from "./review-convergence-state.mjs";
import { bindValidationEvidence, planValidation, runValidationPlan } from "./validation-planner.mjs";
import { canonicalGithubEvidenceDigest, executeCanonicalGithubEffectSync } from "./github-effect-consumer.mjs";
import { findPreEffectIntents } from "./pre-effect-intent.mjs";
import { createSessionLifecycleState, persistSessionLifecycleState, transitionSessionLifecycleHead, transitionSessionLifecyclePhase, validateSessionLifecycleState } from "./session-lifecycle.mjs";

export const prStackStateVersion = 1;
export const prStackWaitingReasons = Object.freeze([
  "github_codex_result_wait",
  "ci_check_completion_wait",
  "scanner_result_wait",
  "merge_state_refresh_wait",
]);

const requiredStackCapabilities = Object.freeze([
  "existingPrConvergence",
  "exactHeadReviewRequest",
  "ciScannerPolling",
  "exactHeadMerge",
  "baseRetarget",
  "readyTransition",
  "semanticProof",
  "finalHygiene",
]);

const forbiddenStackCapabilities = Object.freeze([
  "issuePolling",
  "generatedIssueCreation",
  "unrelatedPrDiscovery",
  "systemdSupervisorLaunch",
  "outageChildLaunch",
  "canaryMutation",
  "productionDeploy",
  "secretAuthConfigMutation",
  "publicAdminNetworkExposure",
  "branchDeletion",
  "forcePushRebaseAmendReset",
  "directMainPush",
  "productAuthorityChanges",
]);
const maxStackPlanBytes = 1024 * 1024;
const maxProtectedPlanAuthorizationBytes = 1024 * 1024;

const acceptedStrongReviewTiers = new Set(["strong_independent", "tie_breaker"]);
const protectedBranchNames = new Set(["main", "master"]);
const protectedLivePlanPrs = Object.freeze([917, 919, 920]);
const authorizableLiveAcceptancePrs = Object.freeze([919, 920]);
const githubSshAliasPattern = /^github\.com(?:[-_.][A-Za-z0-9_.-]+)?$/;

export function normalizePrStackExecutionConfig(config = {}) {
  const raw = config.prStackExecution || {};
  const capabilities = {};
  for (const key of requiredStackCapabilities) capabilities[key] = raw.capabilities?.[key] === true;
  for (const key of forbiddenStackCapabilities) capabilities[key] = raw.capabilities?.[key] === true;
  return Object.freeze({
    enabled: raw.enabled === true,
    allowRun: raw.allowRun === true,
	    productionProfileActive: raw.productionProfileActive === true,
	    maxStackSize: normalizePositiveInt(raw.maxStackSize, 4),
	    maxDispatchActions: normalizePositiveInt(raw.maxDispatchActions, null),
	    capabilities: Object.freeze(capabilities),
	    statePath: typeof raw.statePath === "string" ? raw.statePath : null,
	    protectedPlanAuthorizationPath: typeof raw.protectedPlanAuthorizationPath === "string" ? raw.protectedPlanAuthorizationPath : null,
	  });
	}

export async function runPrStackExecution(config = {}, cliArgs = {}, options = {}) {
  const stackConfig = normalizePrStackExecutionConfig(config);
  const adapter = options.adapter || createProductionPrStackAdapter(config, options);
  const planLoad = loadExecutableStackPlan(config, cliArgs.stackPlanPath, { stackConfig });
  if (!planLoad.ok) return fail(planLoad.reasonCode, planLoad.reason, { statePath: planLoad.statePath || null });
  let plan = planLoad.plan;
  const statePath = resolveStackStatePath(config, stackConfig, planLoad.planPath);
  const loadedState = loadOrCreateStackState({ config, plan, statePath, adapter });
  if (!loadedState.ok) return fail(loadedState.reasonCode, loadedState.reason, { statePath });
  let state = loadedState.state;
  const firstPr = state.orderedPrs?.find((pr) => pr.number === state.sessionLifecycle?.branch?.prNumber) || state.orderedPrs?.[0] || plan.orderedPrs[0];
  const stackRunId = config.runnerRunId || `pr-stack:${plan.stackId}`;
  const stackIssueNumber = plan.issueNumber ?? firstPr?.issueNumber ?? firstPr?.number;
  const stackClaimIdentity = digestJson({ stackId: plan.stackId, statePath });
  if (config.sessionLifecycle?.enabled === true && state.sessionLifecycle) {
    const lifecycleValidation = validateSessionLifecycleState(state.sessionLifecycle, { repository: plan.repository || config.repositorySlug, issueNumber: stackIssueNumber, taskKey: `pr-stack:${plan.stackId}`, runId: stackRunId, claimIdentity: stackClaimIdentity });
    const branchMatches = state.sessionLifecycle.branch?.name === firstPr?.headRefName && state.sessionLifecycle.branch?.headSha === firstPr?.headRefOid && state.sessionLifecycle.branch?.prNumber === firstPr?.number;
    if (!lifecycleValidation.ok || !branchMatches || state.sessionLifecycle.logicalTask?.chargeMarkerRef !== statePath) return fail("pr_stack_lifecycle_identity_mismatch", "persisted PR-stack lifecycle authority does not match the executable stack", { statePath });
  }
  if (config.sessionLifecycle?.enabled === true && !state.sessionLifecycle) {
    const runId = stackRunId;
    const mainResult = spawnSync("git", ["rev-parse", "origin/main"], { cwd: config.repoRoot, encoding: "utf8", timeout: 20_000 });
    const baseSha = mainResult.status === 0 && validSha(mainResult.stdout.trim()) ? mainResult.stdout.trim() : null;
    if (!baseSha) return fail("pr_stack_lifecycle_base_unavailable", "unable to bind PR-stack lifecycle authority to origin/main", { statePath });
    const lifecycle = createSessionLifecycleState({
      repository: plan.repository || config.repositorySlug,
      issueNumber: stackIssueNumber,
      taskKey: `pr-stack:${plan.stackId}`,
      runId,
      claimIdentity: stackClaimIdentity,
      chargeMarkerRef: statePath,
      branchName: firstPr?.headRefName,
      baseSha,
      headSha: firstPr?.headRefOid,
      prNumber: firstPr?.number,
      candidateDigest: digestJson(plan),
      sessionId: `${runId}:controller`,
      phase: "pr_stack_planning",
      nextExactAction: "execute_pr_stack",
      contextPolicy: config.sessionLifecycle.contextBudget,
    });
    const persisted = persistSessionLifecycleState(config, lifecycle);
    if (!persisted.ok) return fail(persisted.reasonCode, "unable to initialize PR-stack lifecycle authority", { statePath });
    state = sanitizeState({ ...state, sessionLifecycle: persisted.state });
    writePrStackState(statePath, state);
  }
  if (state.terminal?.reasonCode === "stack_complete") {
    const pendingIntents = pendingPrStackCanonicalIntents(config, state);
    if (!pendingIntents.ok || pendingIntents.intents.length > 0) {
      const blocked = transitionState(state, {
        phase: "blocked",
        terminal: { reasonCode: pendingIntents.reasonCode || "stack_canonical_effect_reconciliation_required", reason: pendingIntents.reason || "canonical effects remain pending reconciliation" },
        summary: { action: "terminal_effect_reconciliation", pendingIntentIds: pendingIntents.intents?.map((intent) => intent.intentId) || [] },
      });
      writePrStackState(statePath, blocked);
      return { ok: false, outcome: "blocked", reasonCode: blocked.terminal.reasonCode, reason: blocked.terminal.reason, statePath, state: summarizeStackState(blocked) };
    }
    const lifecycleComplete = state.sessionLifecycle?.controller?.phase === "completed"
      && state.sessionLifecycle?.report?.status === "completed"
      && state.sessionLifecycle?.mutationAuthority?.status === "terminal";
    if (config.sessionLifecycle?.enabled === true && !lifecycleComplete) {
      const completedLifecycle = transitionSessionLifecyclePhase(config, state.sessionLifecycle, { phase: "completed", nextExactAction: "stack_complete" });
      if (!completedLifecycle.ok) return fail(completedLifecycle.reasonCode, "unable to finalize completed PR-stack lifecycle", { statePath });
      state = writePrStackState(statePath, sanitizeState({ ...state, sessionLifecycle: completedLifecycle.state })).state;
    }
    return { ok: true, outcome: "complete", statePath, state: summarizeStackState(state), result: { alreadyComplete: true } };
  }
  plan = rebindPlanToStateHeads(plan, state);
  state = transitionState(state, {
    phase: "planning",
    terminal: null,
    summary: { planPath: planLoad.planPath, statePath },
  });
  writePrStackState(statePath, state);

  if (typeof adapter.preflightLiveRunner === "function") {
    const preflight = await adapter.preflightLiveRunner({ config, plan, state });
    if (!preflight?.ok) {
      let blocked = transitionState(state, {
        phase: "blocked",
        terminal: { reasonCode: preflight?.reasonCode || "stack_live_runner_missing", reason: preflight?.reason || "live runner preflight failed" },
        summary: { action: "live_runner_preflight", result: boundedProof(preflight || {}) },
      });
      const stopped = stopPrStackLifecycle(config, blocked, preflight?.reasonCode || "stack_live_runner_missing");
      if (!stopped.ok) return fail(stopped.reasonCode, "unable to stop blocked PR-stack lifecycle", { statePath });
      blocked = stopped.state;
      writePrStackState(statePath, blocked);
      return { ok: false, outcome: "blocked", reasonCode: blocked.terminal.reasonCode, reason: blocked.terminal.reason, statePath, state: summarizeStackState(blocked) };
    }
    state = transitionState(state, {
      phase: "planning",
      evidence: putEvidence(state.evidence, "liveRunnerPreflight", plan.stackId, preflight),
      summary: { action: "live_runner_preflight", result: boundedProof(preflight) },
    });
    writePrStackState(statePath, state);
  }

  const protectedAuthorization = prepareProtectedPlanAuthorizationLifecycle({
    config,
    plan,
    authorizationPlan: planLoad.plan,
    stackConfig,
    state,
    runnerIdentity: adapter.capabilities?.liveRunnerIdentity || null,
    lifecycle: "claim",
  });
  if (!protectedAuthorization.ok) {
    let blocked = transitionState(state, {
      phase: "blocked",
      terminal: { reasonCode: protectedAuthorization.reasonCode, reason: protectedAuthorization.reason },
      evidence: putEvidence(state.evidence, "protectedAuthorization", plan.stackId, protectedAuthorization),
      summary: { action: "protected_authorization_claim", result: boundedProof(protectedAuthorization) },
    });
    const stopped = stopPrStackLifecycle(config, blocked, protectedAuthorization.reasonCode);
    if (!stopped.ok) return fail(stopped.reasonCode, "unable to stop blocked PR-stack lifecycle", { statePath });
    blocked = stopped.state;
    writePrStackState(statePath, blocked);
    return { ok: false, outcome: "blocked", reasonCode: blocked.terminal.reasonCode, reason: blocked.terminal.reason, statePath, state: summarizeStackState(blocked) };
  }
  if (protectedAuthorization.protectedPlan) {
    state = transitionState(state, {
      phase: "planning",
      evidence: putEvidence(state.evidence, "protectedAuthorization", plan.stackId, protectedAuthorization.evidence),
      summary: { action: "protected_authorization_claim", result: boundedProof(protectedAuthorization.evidence) },
    });
    writePrStackState(statePath, state);
  }

  const dispatchLimit = stackDispatchLimit({ stackConfig, plan, adapter });
  let dispatchCount = 0;
  let lastResult = null;
  while (true) {
    plan = rebindPlanToStateHeads(plan, state);
    if (dispatchCount >= dispatchLimit) {
      let blocked = transitionState(state, {
        phase: "blocked",
        terminal: { reasonCode: "stack_dispatch_limit_exceeded", reason: `stack dispatch exceeded bounded action limit ${dispatchLimit}` },
        summary: { action: "dispatch_limit", dispatchCount, dispatchLimit },
      });
      const stopped = stopPrStackLifecycle(config, blocked, "stack_dispatch_limit_exceeded");
      if (!stopped.ok) return fail(stopped.reasonCode, "unable to stop blocked PR-stack lifecycle", { statePath });
      blocked = stopped.state;
      writePrStackState(statePath, blocked);
      return { ok: false, outcome: "blocked", reasonCode: blocked.terminal.reasonCode, reason: blocked.terminal.reason, statePath, state: summarizeStackState(blocked) };
    }
    const action = nextStackAction(plan, state.evidence || {});
    const beforeProgressDigest = stackDispatchProgressDigest(state);
    const consumedAuthorization = prepareProtectedPlanAuthorizationLifecycle({
      config,
      plan,
      authorizationPlan: planLoad.plan,
      stackConfig,
      state,
      runnerIdentity: adapter.capabilities?.liveRunnerIdentity || null,
      lifecycle: "consume",
      operationIntent: { action: action.action, prNumber: action.prNumber || null, expectedHead: action.expectedHead || null },
    });
    if (!consumedAuthorization.ok) {
      let blocked = transitionState(state, {
        phase: "blocked",
        terminal: { reasonCode: consumedAuthorization.reasonCode, reason: consumedAuthorization.reason },
        evidence: putEvidence(state.evidence, "protectedAuthorization", plan.stackId, consumedAuthorization),
        summary: { action: "protected_authorization_consume", result: boundedProof(consumedAuthorization) },
      });
      const stopped = stopPrStackLifecycle(config, blocked, consumedAuthorization.reasonCode);
      if (!stopped.ok) return fail(stopped.reasonCode, "unable to stop blocked PR-stack lifecycle", { statePath });
      blocked = stopped.state;
      writePrStackState(statePath, blocked);
      return { ok: false, outcome: "blocked", reasonCode: blocked.terminal.reasonCode, reason: blocked.terminal.reason, statePath, state: summarizeStackState(blocked) };
    }
    if (consumedAuthorization.protectedPlan) {
      state = transitionState(state, {
        phase: "planning",
        evidence: putEvidence(state.evidence, "protectedAuthorization", plan.stackId, consumedAuthorization.evidence),
        summary: { action: "protected_authorization_consume", result: boundedProof(consumedAuthorization.evidence) },
      });
      writePrStackState(statePath, state);
    }
    state = transitionState(state, { phase: "dispatch", currentAction: action });
    writePrStackState(statePath, state);

    const dispatch = await dispatchStackAction({ config, stackConfig, plan, state, action, adapter });
    if (!dispatch.ok) {
      const evidence = dispatch.evidencePatch ? mergeEvidencePatch(state.evidence, dispatch.evidencePatch) : dispatch.evidence || state.evidence;
      let blocked = transitionState(state, {
        phase: dispatch.waiting ? "waiting" : "blocked",
        terminal: dispatch.waiting ? null : { reasonCode: dispatch.reasonCode, reason: dispatch.reason },
        wait: dispatch.waiting ? { reasonCode: dispatch.reasonCode, action } : null,
        evidence,
        sourceCycleReservations: dispatch.sourceCycleReservations || state.sourceCycleReservations,
        sourceCycles: dispatch.sourceCycles || state.sourceCycles,
        exactHeads: dispatch.exactHeads || state.exactHeads,
        orderedPrs: dispatch.orderedPrs || state.orderedPrs,
        summary: dispatch.summary || null,
      });
      if (!dispatch.waiting) {
        const stopped = stopPrStackLifecycle(config, blocked, dispatch.reasonCode);
        if (!stopped.ok) return fail(stopped.reasonCode, "unable to stop blocked PR-stack lifecycle", { statePath });
        blocked = stopped.state;
      }
      writePrStackState(statePath, blocked);
      return { ok: false, outcome: dispatch.waiting ? "waiting" : "blocked", reasonCode: dispatch.reasonCode, reason: dispatch.reason, statePath, state: summarizeStackState(blocked) };
    }

    let completionAuthorization = null;
    if (dispatch.complete) {
      completionAuthorization = prepareProtectedPlanAuthorizationLifecycle({
        config,
        plan,
        authorizationPlan: planLoad.plan,
        stackConfig,
        state,
        runnerIdentity: adapter.capabilities?.liveRunnerIdentity || null,
        lifecycle: "complete",
        operationIntent: { action: "complete", stackId: plan.stackId },
      });
      if (!completionAuthorization.ok) {
        let blocked = transitionState(state, {
          phase: "blocked",
          terminal: { reasonCode: completionAuthorization.reasonCode, reason: completionAuthorization.reason },
          evidence: putEvidence(dispatch.evidence || state.evidence, "protectedAuthorization", plan.stackId, completionAuthorization),
          summary: { action: "protected_authorization_complete", result: boundedProof(completionAuthorization) },
        });
        const stopped = stopPrStackLifecycle(config, blocked, completionAuthorization.reasonCode);
        if (!stopped.ok) return fail(stopped.reasonCode, "unable to stop blocked PR-stack lifecycle", { statePath });
        blocked = stopped.state;
        writePrStackState(statePath, blocked);
        return { ok: false, outcome: "blocked", reasonCode: blocked.terminal.reasonCode, reason: blocked.terminal.reason, statePath, state: summarizeStackState(blocked) };
      }
    }
    const finalEvidence = completionAuthorization?.protectedPlan
      ? putEvidence(dispatch.evidence || state.evidence, "protectedAuthorization", plan.stackId, completionAuthorization.evidence)
      : (dispatch.evidence || state.evidence);
    if (dispatch.complete) {
      const pendingIntents = pendingPrStackCanonicalIntents(config, state);
      if (!pendingIntents.ok || pendingIntents.intents.length > 0) {
        const blocked = transitionState(state, {
          phase: "blocked",
          terminal: { reasonCode: pendingIntents.reasonCode || "stack_canonical_effect_reconciliation_required", reason: pendingIntents.reason || "canonical effects remain pending reconciliation" },
          evidence: finalEvidence,
          summary: { action: "terminal_effect_reconciliation", pendingIntentIds: pendingIntents.intents?.map((intent) => intent.intentId) || [] },
        });
        writePrStackState(statePath, blocked);
        return { ok: false, outcome: "blocked", reasonCode: blocked.terminal.reasonCode, reason: blocked.terminal.reason, statePath, state: summarizeStackState(blocked) };
      }
    }
    let nextState = transitionState(state, {
      phase: dispatch.complete ? "completed" : "advanced",
      terminal: dispatch.complete ? { reasonCode: "stack_complete", reason: "all_prs_merged_and_hygiene_complete" } : null,
      wait: null,
      evidence: finalEvidence,
      sessionLifecycle: dispatch.sessionLifecycle || state.sessionLifecycle,
      mutationMarkers: dispatch.mutationMarkers || state.mutationMarkers,
      activePrNumber: dispatch.activePrNumber ?? state.activePrNumber,
      sourceCycleReservations: dispatch.sourceCycleReservations || state.sourceCycleReservations,
      sourceCycles: dispatch.sourceCycles || state.sourceCycles,
      exactHeads: dispatch.exactHeads || state.exactHeads,
      orderedPrs: dispatch.orderedPrs || state.orderedPrs,
      summary: dispatch.summary || null,
    });
    if (config.sessionLifecycle?.enabled === true && nextState.sessionLifecycle) {
      const lifecyclePr = nextState.orderedPrs.find((pr) => pr.number === nextState.sessionLifecycle.branch.prNumber);
      if (lifecyclePr?.headRefOid && lifecyclePr.headRefOid !== nextState.sessionLifecycle.branch.headSha) {
        const reboundLifecycle = transitionSessionLifecycleHead(config, nextState.sessionLifecycle, { branchName: lifecyclePr.headRefName, headSha: lifecyclePr.headRefOid, prNumber: lifecyclePr.number });
        if (!reboundLifecycle.ok) return fail(reboundLifecycle.reasonCode, "unable to bind PR-stack lifecycle to rebound exact head", { statePath });
        nextState = sanitizeState({ ...nextState, sessionLifecycle: reboundLifecycle.state });
      }
    }
    state = writePrStackState(statePath, nextState).state;
    dispatchCount += 1;
    lastResult = dispatch.result || null;
    if (dispatch.complete) {
      const completedLifecycle = config.sessionLifecycle?.enabled === true && state.sessionLifecycle ? transitionSessionLifecyclePhase(config, state.sessionLifecycle, { phase: "completed", nextExactAction: "stack_complete" }) : null;
      if (completedLifecycle && !completedLifecycle.ok) return fail(completedLifecycle.reasonCode, "unable to finalize completed PR-stack lifecycle", { statePath });
      if (completedLifecycle?.state) state = writePrStackState(statePath, sanitizeState({ ...state, sessionLifecycle: completedLifecycle.state })).state;
      return { ok: true, outcome: "complete", action, dispatchCount, statePath, state: summarizeStackState(state), result: lastResult };
    }
    if (!shouldContinueStackDispatch({ adapter, dispatchCount })) {
      return { ok: true, outcome: "advanced", action, dispatchCount, statePath, state: summarizeStackState(state), result: lastResult };
    }
    const afterProgressDigest = stackDispatchProgressDigest(state);
    if (afterProgressDigest === beforeProgressDigest) {
      let blocked = transitionState(state, {
        phase: "blocked",
        terminal: { reasonCode: "stack_dispatch_no_progress", reason: "stack dispatch advanced without durable progress" },
        summary: { action: "dispatch_no_progress", dispatchCount, lastAction: action },
      });
      const stopped = stopPrStackLifecycle(config, blocked, "stack_dispatch_no_progress");
      if (!stopped.ok) return fail(stopped.reasonCode, "unable to stop blocked PR-stack lifecycle", { statePath });
      blocked = stopped.state;
      state = writePrStackState(statePath, blocked).state;
      return { ok: false, outcome: "blocked", reasonCode: blocked.terminal.reasonCode, reason: blocked.terminal.reason, action, dispatchCount, statePath, state: summarizeStackState(state) };
    }
  }
}

export function loadExecutableStackPlan(config = {}, stackPlanPath, { stackConfig = normalizePrStackExecutionConfig(config), trustHooks = null } = {}) {
  if (!stackPlanPath || !path.isAbsolute(stackPlanPath)) return fail("stack_plan_path_required", "--stack-plan must be an absolute path");
  const fileTrust = readTrustedExecutableStackPlanBytes(config, stackPlanPath, trustHooks);
  if (!fileTrust.ok) return fileTrust;
  let parsed;
  try {
    parsed = JSON.parse(fileTrust.bytes.toString("utf8"));
  } catch (error) {
    return fail("stack_plan_json_invalid", `stack plan JSON could not be parsed: ${error.message}`, { evidence: fileTrust.evidence });
  }
  const plan = normalizePlanContainer(parsed);
  const validation = validateExecutableStackPlan(config, plan, { stackConfig, source: parsed });
  if (!validation.ok) return validation;
  return { ok: true, plan, planPath: fileTrust.evidence.canonicalPlanPath, planTrustEvidence: { ...fileTrust.evidence, parsedDigestSha256: digestJson(parsed) } };
}

function readTrustedExecutableStackPlanBytes(config = {}, stackPlanPath, hooks = null) {
  const rootTrust = validateStackPlanTrustedRoot(config);
  if (!rootTrust.ok) return rootTrust;
  const lexicalPlanPath = path.resolve(stackPlanPath);
  if (lexicalPlanPath !== stackPlanPath) {
    return fail("stack_plan_path_required", "--stack-plan must be an absolute canonical path");
  }
  if (!isInside(lexicalPlanPath, rootTrust.lexicalRoot)) {
    return fail("stack_plan_outside_logs_root", "stack plan must be under configured logsRoot");
  }
  const relative = path.relative(rootTrust.lexicalRoot, lexicalPlanPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
    return fail("stack_plan_canonical_escape", "stack plan path must not traverse outside configured logsRoot");
  }
  const walked = validateStackPlanPathComponents(rootTrust, lexicalPlanPath, relative);
  if (!walked.ok) return walked;
  let canonicalPlanPath;
  try {
    canonicalPlanPath = realpathSync(lexicalPlanPath);
  } catch (error) {
    return fail(error?.code === "ELOOP" ? "stack_plan_symlink_refused" : "stack_plan_read_failed", error.message || "stack plan canonical path could not be resolved");
  }
  if (!isInside(canonicalPlanPath, rootTrust.canonicalRoot)) {
    return fail("stack_plan_canonical_escape", "stack plan canonical target escaped configured logsRoot");
  }
  if (canonicalPlanPath !== lexicalPlanPath) {
    return fail("stack_plan_canonical_escape", "stack plan lexical path and canonical target differ");
  }
  hooks?.beforeOpen?.({ lexicalPlanPath, canonicalPlanPath, rootTrust, walked });
  const noFollow = openStackPlanNoFollow(lexicalPlanPath, hooks);
  if (!noFollow.ok) return noFollow;
  const { fd, strategy } = noFollow;
  try {
    hooks?.afterOpen?.({ fd, lexicalPlanPath, canonicalPlanPath, rootTrust, walked });
    const openedStat = fstatSync(fd);
    if (!sameFileIdentity(walked.terminalStat, openedStat)) {
      return fail("stack_plan_identity_changed", "stack plan identity changed between validation and descriptor open");
    }
    const descriptorValidation = validateStackPlanRegularFile(openedStat);
    if (!descriptorValidation.ok) return descriptorValidation;
    const postOpenLstat = lstatSync(lexicalPlanPath);
    if (!sameFileIdentity(postOpenLstat, openedStat)) {
      return fail("stack_plan_identity_changed", "stack plan identity changed after descriptor open");
    }
    const postOpenCanonical = realpathSync(lexicalPlanPath);
    if (postOpenCanonical !== canonicalPlanPath || !isInside(postOpenCanonical, rootTrust.canonicalRoot)) {
      return fail("stack_plan_identity_changed", "stack plan canonical target changed during validation");
    }
    hooks?.beforeRead?.({ fd, lexicalPlanPath, canonicalPlanPath, rootTrust, openedStat });
    const bytes = readBoundedStackPlanBytes(fd, openedStat, maxStackPlanBytes);
    hooks?.afterRead?.({ fd, lexicalPlanPath, canonicalPlanPath, rootTrust, openedStat, bytesRead: bytes.length });
    const postReadStat = fstatSync(fd);
    if (!sameFileIdentity(openedStat, postReadStat) || postReadStat.size !== openedStat.size) {
      return fail("stack_plan_identity_changed", "stack plan identity or size changed during descriptor read");
    }
    if (!isUtf8(bytes)) return fail("stack_plan_utf8_invalid", "stack plan must be valid UTF-8");
    const evidence = sanitizeState({
      lexicalTrustedRoot: rootTrust.lexicalRoot,
      canonicalTrustedRoot: rootTrust.canonicalRoot,
      lexicalPlanPath,
      canonicalPlanPath,
      relativePath: relative.split(path.sep).join("/"),
      owner: openedStat.uid,
      mode: openedStat.mode & 0o777,
      type: "regular_file",
      size: openedStat.size,
      device: openedStat.dev,
      inode: openedStat.ino,
      identity: fileIdentity(openedStat),
      noFollowStrategy: strategy,
      digestSha256: createHash("sha256").update(bytes).digest("hex"),
      validatedAt: new Date().toISOString(),
      decision: "accepted",
      reasonCode: "stack_plan_trusted",
    });
    return { ok: true, bytes, evidence };
  } catch (error) {
    if (error?.code === "ELOOP") return fail("stack_plan_symlink_refused", "stack plan symlink was refused");
    if (error?.code === "ENOENT") return fail("stack_plan_read_failed", "stack plan disappeared during validation");
    return fail("stack_plan_read_failed", error.message || "stack plan could not be read safely");
  } finally {
    closeSync(fd);
  }
}

function validateStackPlanTrustedRoot(config = {}) {
  const lexicalRoot = path.resolve(config.logsRoot || "/workspace/logs/settleora-auto-runner");
  let linkStat;
  try {
    linkStat = lstatSync(lexicalRoot);
  } catch {
    return fail("stack_plan_parent_untrusted", "configured logsRoot is missing");
  }
  if (linkStat.isSymbolicLink()) return fail("stack_plan_parent_untrusted", "configured logsRoot must not be a symlink");
  let canonicalRoot;
  try {
    canonicalRoot = realpathSync(lexicalRoot);
  } catch (error) {
    return fail("stack_plan_parent_untrusted", error.message || "configured logsRoot canonicalization failed");
  }
  if (canonicalRoot !== lexicalRoot) return fail("stack_plan_parent_untrusted", "configured logsRoot realpath must match its lexical path");
  const stat = statSync(canonicalRoot);
  if (!stat.isDirectory()) return fail("stack_plan_parent_untrusted", "configured logsRoot must be a directory");
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && stat.uid !== currentUid) return fail("stack_plan_parent_untrusted", "configured logsRoot owner must match current operator");
  if ((stat.mode & 0o002) !== 0) return fail("stack_plan_parent_untrusted", "configured logsRoot must not be world-writable");
  return { ok: true, lexicalRoot, canonicalRoot, rootStat: stat };
}

function validateStackPlanPathComponents(rootTrust, lexicalPlanPath, relative) {
  const parts = relative.split(path.sep).filter(Boolean);
  let current = rootTrust.lexicalRoot;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error?.code === "ELOOP") return fail("stack_plan_symlink_refused", "stack plan path contains a symlink loop");
      return fail("stack_plan_read_failed", "stack plan path component is missing");
    }
    if (stat.isSymbolicLink()) return fail("stack_plan_symlink_refused", "stack plan path must not contain symlinks");
    if (index < parts.length - 1 && !stat.isDirectory()) {
      return fail("stack_plan_parent_untrusted", "stack plan parent path must contain only directories");
    }
    if (index < parts.length - 1) {
      const directoryTrust = validateStackPlanTrustedDirectory(stat);
      if (!directoryTrust.ok) return directoryTrust;
    } else {
      const terminalTrust = validateStackPlanRegularFile(stat);
      if (!terminalTrust.ok) return terminalTrust;
    }
  }
  return { ok: true, terminalStat: lstatSync(lexicalPlanPath) };
}

function validateStackPlanTrustedDirectory(stat) {
  if (!stat.isDirectory()) return fail("stack_plan_parent_untrusted", "stack plan parent path must be a directory");
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && stat.uid !== currentUid) return fail("stack_plan_parent_untrusted", "stack plan parent owner must match current operator");
  if ((stat.mode & 0o077) !== 0) return fail("stack_plan_parent_untrusted", "stack plan parent directories must be owner-only");
  return { ok: true };
}

function validateStackPlanRegularFile(stat) {
  if (!stat.isFile()) return fail("stack_plan_invalid_file", "stack plan must be a regular file");
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && stat.uid !== currentUid) return fail("stack_plan_invalid_file", "stack plan owner must match current operator");
  if ((stat.mode & 0o077) !== 0) return fail("stack_plan_invalid_file", "stack plan file must be owner-only");
  if (stat.size > maxStackPlanBytes) return fail("stack_plan_invalid_file", "stack plan exceeds the bounded size limit");
  return { ok: true };
}

function readBoundedStackPlanBytes(fd, stat, maxBytes) {
  if (stat.size > maxBytes) {
    throw new Error("stack plan exceeds the bounded size limit");
  }
  const buffer = Buffer.allocUnsafe(stat.size);
  let offset = 0;
  while (offset < buffer.length) {
    const bytesRead = readSync(fd, buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) throw new Error("stack plan size changed during descriptor read");
    offset += bytesRead;
  }
  return buffer;
}

function openStackPlanNoFollow(filePath, hooks = null) {
  const constants = hooks?.fsConstants || fsConstants;
  if (typeof constants.O_NOFOLLOW !== "number") {
    return fail("stack_plan_no_follow_unavailable", "O_NOFOLLOW is unavailable for stack plan open");
  }
  let fd;
  try {
    fd = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ELOOP") return fail("stack_plan_symlink_refused", "stack plan symlink was refused by no-follow open");
    if (error?.code === "ENOENT") return fail("stack_plan_read_failed", "stack plan disappeared before open");
    return fail("stack_plan_read_failed", error.message || "stack plan could not be opened safely");
  }
  return { ok: true, fd, strategy: "openSync:O_RDONLY|O_NOFOLLOW" };
}

function fileIdentity(stat) {
  return `${stat.dev}:${stat.ino}`;
}

function sameFileIdentity(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}

export function validateExecutableStackPlan(config = {}, plan = {}, { stackConfig = normalizePrStackExecutionConfig(config), source = {} } = {}) {
  if (!stackConfig.enabled || !stackConfig.allowRun) return fail("stack_execution_disabled_by_config", "live stack execution is default-off");
  if (stackConfig.productionProfileActive) return fail("stack_production_profile_activation_refused", "production profile activation requires a separate manual task");
  for (const key of requiredStackCapabilities) {
    if (stackConfig.capabilities[key] !== true) return fail(`stack_capability_missing:${key}`, `required stack capability is false: ${key}`);
  }
  for (const key of forbiddenStackCapabilities) {
    if (stackConfig.capabilities[key] === true) return fail(`stack_forbidden_capability_enabled:${key}`, `forbidden stack capability is true: ${key}`);
  }
  if (source.readOnly === true || source.mutationAllowed === false || plan.readOnly === true || plan.mutationAllowed === false) {
    return fail("readonly_stack_fixture_not_executable", "read-only stack fixtures cannot authorize mutation");
  }
  if (plan.repository !== (config.repositorySlug || "tommytang213/Settleora")) return fail("stack_repository_mismatch", "plan repository does not match config");
  if (!validStackId(plan.stackId)) return fail("stack_id_invalid", "stack ID is missing or malformed");
  if (!Array.isArray(plan.orderedPrs)) return fail("stack_ordered_prs_missing", "orderedPrs must be an array");
  if (plan.orderedPrs.length < 2 || plan.orderedPrs.length > Math.min(stackConfig.maxStackSize, 4)) {
    return fail("stack_size_invalid", "executable stack must contain 2-4 PR entries");
  }
	  const numbers = new Set();
	  const protectedNumbers = [];
	  for (const pr of plan.orderedPrs) {
	    if (!Number.isInteger(pr.number)) return fail("stack_pr_number_invalid", "PR numbers must be integers");
	    if (pr.number === 917) return fail("stack_pr_917_refused", "PR #917 cannot enter executable live-stack work");
	    if (protectedLivePlanPrs.includes(pr.number)) protectedNumbers.push(pr.number);
	    if (numbers.has(pr.number)) return fail("stack_duplicate_pr_number", "duplicate PR number in stack");
    numbers.add(pr.number);
    if (!safeBranch(pr.baseRefName) || !safeBranch(pr.headRefName)) return fail("stack_branch_invalid", "PR branch refs must be bounded safe branch names");
    if (!safeSourceBranchTarget(pr.headRefName, { baseRefName: pr.baseRefName, defaultBranch: "main" })) {
      return fail("stack_source_branch_forbidden", "PR head branch cannot be a protected, base, detached, remote-qualified, tag, SHA-like, option-looking, or path-like ref");
    }
    if (!validSha(pr.headRefOid)) return fail("stack_pr_head_invalid", "PR head SHA is missing or malformed");
    if (pr.state && !["OPEN", "MERGED", "CLOSED", "UNKNOWN"].includes(String(pr.state))) return fail("stack_pr_state_invalid", "PR state is unsupported");
  }
	  const relation = validateStackRelationships(plan);
	  if (!relation.ok) return fail("stack_relationship_invalid", relation.reason);
  const authorization = validateProtectedLivePlanAuthorization(config, plan, { stackConfig, protectedNumbers });
  if (!authorization.ok) return authorization;
  return { ok: true, protectedAuthorization: authorization.protectedPlan ? authorization : null };
}

function validateProtectedLivePlanAuthorization(config = {}, plan = {}, { stackConfig = normalizePrStackExecutionConfig(config), protectedNumbers = [] } = {}) {
  const protectedPlan = [...new Set(protectedNumbers)].sort((a, b) => a - b);
  if (protectedPlan.length === 0) return { ok: true, protectedPlan: false };
  const orderedNumbers = (plan.orderedPrs || []).map((pr) => pr.number);
  if (JSON.stringify(orderedNumbers) !== JSON.stringify(authorizableLiveAcceptancePrs)) {
    return fail("protected_stack_plan_unauthorized", "protected live stack plans are refused by default unless exact live acceptance authorization is present");
  }
	  const authorizationPath = stackConfig.protectedPlanAuthorizationPath;
	  if (!authorizationPath) return fail("protected_stack_plan_authorization_missing", "protected live stack plan requires explicit live acceptance authorization");
	  if (!path.isAbsolute(authorizationPath)) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization path must be absolute");
	  const trustedRoot = path.resolve(config.trustedControlRoot || config.logsRoot || "/workspace/logs/settleora-auto-runner");
	  if (!isInside(path.resolve(authorizationPath), trustedRoot)) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization must be under the trusted control root");
	  const loaded = readProtectedPlanAuthorizationFile(authorizationPath, { config });
  if (!loaded.ok) return loaded;
  const authorization = loaded.authorization || {};
  const repo = canonicalRepositorySlug(config.repositorySlug || "tommytang213/Settleora");
  if (authorization.purpose !== "live_stack_acceptance") return fail("protected_stack_plan_authorization_malformed", "protected plan authorization purpose is invalid");
  if (canonicalRepositorySlug(authorization.repositorySlug) !== repo) return fail("protected_stack_plan_authorization_repository_mismatch", "protected plan authorization repository does not match");
  if (JSON.stringify(authorization.orderedPrNumbers || []) !== JSON.stringify(authorizableLiveAcceptancePrs)) {
    return fail("protected_stack_plan_authorization_pr_order_mismatch", "protected plan authorization PR order/set does not match");
  }
  const expectedTaskKey = plan.taskKey || plan.correlationId || null;
  if (expectedTaskKey && authorization.taskKey !== expectedTaskKey) return fail("protected_stack_plan_authorization_correlation_mismatch", "protected plan authorization task correlation does not match");
  if (authorization.planDigest !== digestStackPlan(plan)) return fail("protected_stack_plan_authorization_digest_mismatch", "protected plan authorization digest does not match");
  if (authorization.baseBranch && authorization.baseBranch !== "main") return fail("protected_stack_plan_authorization_malformed", "protected plan authorization base branch is invalid");
  const expectedHeads = Object.fromEntries((plan.orderedPrs || []).map((pr) => [String(pr.number), pr.headRefOid]));
  if (authorization.expectedHeads && digestJson(authorization.expectedHeads) !== digestJson(expectedHeads)) {
    return fail("protected_stack_plan_authorization_head_mismatch", "protected plan authorization source-head expectations do not match");
  }
  if (authorization.consumedAt || authorization.consumed === true) return fail("protected_stack_plan_authorization_consumed", "protected plan authorization was already consumed");
  if (!authorization.expiresAt || Number.isNaN(Date.parse(authorization.expiresAt)) || Date.parse(authorization.expiresAt) <= Date.now()) {
    return fail("protected_stack_plan_authorization_expired", "protected plan authorization is expired or missing expiry");
  }
  if (authorization.manualGateApproved !== true || typeof authorization.approvedBy !== "string" || authorization.approvedBy.trim().length === 0) {
    return fail("protected_stack_plan_authorization_policy_invalid", "protected plan authorization lacks accepted manual-gate approval");
  }
  const identity = protectedPlanAuthorizationIdentity({ config, plan, authorization, authorizationPath: loaded.path, authorizationArtifactDigestSha256: loaded.digestSha256 });
  if (!identity.ok) return identity;
  return { ok: true, protectedPlan: true, authorizationEvidence: { path: loaded.path, digest: identity.identity.authorizationDigest, artifactDigestSha256: loaded.digestSha256, identity: identity.identity, checkedAt: new Date().toISOString() } };
}

function readProtectedPlanAuthorizationFile(authorizationPath, { config = {}, hooks = null } = {}) {
  const rootTrust = validateProtectedPlanAuthorizationTrustedRoot(config);
  if (!rootTrust.ok) return rootTrust;
  const lexicalPath = path.resolve(authorizationPath);
  if (lexicalPath !== authorizationPath) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization path must be absolute and canonical");
  if (!isInside(lexicalPath, rootTrust.lexicalRoot)) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization must be under the trusted control root");
  const relative = path.relative(rootTrust.lexicalRoot, lexicalPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
    return fail("protected_stack_plan_authorization_malformed", "protected plan authorization path must not traverse outside trusted control root");
  }
  const walked = validateProtectedPlanAuthorizationPathComponents(rootTrust, lexicalPath, relative);
  if (!walked.ok) return walked;
  let real;
  try {
    real = realpathSync(lexicalPath);
  } catch (error) {
    return fail(error?.code === "ELOOP" ? "protected_stack_plan_authorization_malformed" : "protected_stack_plan_authorization_missing", error.message || "protected plan authorization canonical path could not be resolved");
  }
  if (real !== lexicalPath) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization realpath must match its canonical path");
  if (!isInside(real, rootTrust.canonicalRoot)) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization canonical target escaped trusted control root");
  hooks?.beforeOpen?.({ authorizationPath: lexicalPath, canonicalAuthorizationPath: real, rootTrust, walked });
  const noFollow = openProtectedPlanAuthorizationNoFollow(lexicalPath, hooks);
  if (!noFollow.ok) return noFollow;
  const { fd, strategy } = noFollow;
  let openedStat;
  let bytes;
  try {
    hooks?.afterOpen?.({ fd, authorizationPath: lexicalPath, canonicalAuthorizationPath: real, rootTrust, walked });
    openedStat = fstatSync(fd);
    if (!sameFileIdentity(walked.terminalStat, openedStat)) {
      return fail("protected_stack_plan_authorization_malformed", "protected plan authorization identity changed between validation and descriptor open");
    }
    const descriptorTrust = validateProtectedPlanAuthorizationRegularFile(openedStat);
    if (!descriptorTrust.ok) return descriptorTrust;
    const postOpenLstat = lstatSync(lexicalPath);
    if (!sameFileIdentity(postOpenLstat, openedStat)) {
      return fail("protected_stack_plan_authorization_malformed", "protected plan authorization identity changed after descriptor open");
    }
    const postOpenCanonical = realpathSync(lexicalPath);
    if (postOpenCanonical !== real || !isInside(postOpenCanonical, rootTrust.canonicalRoot)) {
      return fail("protected_stack_plan_authorization_malformed", "protected plan authorization canonical target changed during validation");
    }
    hooks?.beforeRead?.({ fd, authorizationPath: lexicalPath, canonicalAuthorizationPath: real, rootTrust, openedStat });
    bytes = readBoundedProtectedPlanAuthorizationBytes(fd, openedStat, maxProtectedPlanAuthorizationBytes);
    hooks?.afterRead?.({ fd, authorizationPath: lexicalPath, canonicalAuthorizationPath: real, rootTrust, openedStat, bytesRead: bytes.length });
    const postReadStat = fstatSync(fd);
    if (!sameFileIdentity(openedStat, postReadStat) || postReadStat.size !== openedStat.size) {
      return fail("protected_stack_plan_authorization_malformed", "protected plan authorization identity or size changed during descriptor read");
    }
  } catch (error) {
    if (error?.code === "ELOOP") return fail("protected_stack_plan_authorization_malformed", "protected plan authorization symlink was refused");
    if (error?.code === "ENOENT") return fail("protected_stack_plan_authorization_missing", "protected plan authorization disappeared during validation");
    return fail("protected_stack_plan_authorization_malformed", error.message || "protected plan authorization could not be read safely");
  } finally {
    closeSync(fd);
  }
  if (!isUtf8(bytes)) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization must be valid UTF-8");
  let authorization;
  try {
    authorization = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    return fail("protected_stack_plan_authorization_malformed", `protected plan authorization JSON is malformed: ${error.message}`);
  }
  if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)) {
    return fail("protected_stack_plan_authorization_malformed", "protected plan authorization must be an object");
  }
  return {
    ok: true,
    authorization,
    path: real,
    digestSha256: createHash("sha256").update(bytes).digest("hex"),
    evidence: sanitizeState({
      canonicalTrustedRoot: rootTrust.canonicalRoot,
      path: real,
      relativePath: relative.split(path.sep).join("/"),
      owner: openedStat.uid,
      mode: openedStat.mode & 0o777,
      type: "regular_file",
      size: openedStat.size,
      identity: fileIdentity(openedStat),
      noFollowStrategy: strategy,
      digestSha256: createHash("sha256").update(bytes).digest("hex"),
      checkedAt: new Date().toISOString(),
    }),
  };
}

function validateProtectedPlanAuthorizationTrustedRoot(config = {}) {
  const lexicalRoot = path.resolve(config.trustedControlRoot || config.logsRoot || "/workspace/logs/settleora-auto-runner");
  let linkStat;
  try {
    linkStat = lstatSync(lexicalRoot);
  } catch {
    return fail("protected_stack_plan_authorization_malformed", "trusted control root is missing");
  }
  if (linkStat.isSymbolicLink()) return fail("protected_stack_plan_authorization_malformed", "trusted control root must not be a symlink");
  let canonicalRoot;
  try {
    canonicalRoot = realpathSync(lexicalRoot);
  } catch (error) {
    return fail("protected_stack_plan_authorization_malformed", error.message || "trusted control root canonicalization failed");
  }
  if (canonicalRoot !== lexicalRoot) return fail("protected_stack_plan_authorization_malformed", "trusted control root realpath must match its lexical path");
  const stat = statSync(canonicalRoot);
  if (!stat.isDirectory()) return fail("protected_stack_plan_authorization_malformed", "trusted control root must be a directory");
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && stat.uid !== currentUid) return fail("protected_stack_plan_authorization_malformed", "trusted control root owner must match current operator");
  if ((stat.mode & 0o002) !== 0) return fail("protected_stack_plan_authorization_malformed", "trusted control root must not be world-writable");
  return { ok: true, lexicalRoot, canonicalRoot, rootStat: stat };
}

function validateProtectedPlanAuthorizationPathComponents(rootTrust, lexicalPath, relative) {
  const parts = relative.split(path.sep).filter(Boolean);
  let current = rootTrust.lexicalRoot;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error?.code === "ELOOP") return fail("protected_stack_plan_authorization_malformed", "protected plan authorization path contains a symlink loop");
      return fail("protected_stack_plan_authorization_missing", "protected plan authorization path component is missing");
    }
    if (stat.isSymbolicLink()) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization path must not contain symlinks");
    if (index < parts.length - 1) {
      const directoryTrust = validateProtectedPlanAuthorizationTrustedDirectory(stat);
      if (!directoryTrust.ok) return directoryTrust;
    } else {
      const terminalTrust = validateProtectedPlanAuthorizationRegularFile(stat);
      if (!terminalTrust.ok) return terminalTrust;
    }
  }
  return { ok: true, terminalStat: lstatSync(lexicalPath) };
}

function validateProtectedPlanAuthorizationTrustedDirectory(stat) {
  if (!stat.isDirectory()) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization parent path must be a directory");
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && stat.uid !== currentUid) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization parent owner must match current operator");
  if ((stat.mode & 0o077) !== 0) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization parent directories must be owner-only");
  return { ok: true };
}

function validateProtectedPlanAuthorizationRegularFile(stat) {
  if (!stat.isFile()) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization must be a regular file");
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && stat.uid !== currentUid) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization owner must match current operator");
  if ((stat.mode & 0o077) !== 0) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization file must be owner-only");
  if (stat.size > maxProtectedPlanAuthorizationBytes) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization exceeds the bounded size limit");
  return { ok: true };
}

function readBoundedProtectedPlanAuthorizationBytes(fd, stat, maxBytes) {
  if (stat.size > maxBytes) {
    throw new Error("protected plan authorization exceeds the bounded size limit");
  }
  const buffer = Buffer.allocUnsafe(stat.size);
  let offset = 0;
  while (offset < buffer.length) {
    const bytesRead = readSync(fd, buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) throw new Error("protected plan authorization size changed during descriptor read");
    offset += bytesRead;
  }
  return buffer;
}

function openProtectedPlanAuthorizationNoFollow(filePath, hooks = null) {
  const constants = hooks?.fsConstants || fsConstants;
  if (typeof constants.O_NOFOLLOW !== "number") {
    return fail("protected_stack_plan_authorization_malformed", "O_NOFOLLOW is unavailable for protected plan authorization open");
  }
  try {
    return { ok: true, fd: openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW), strategy: "openSync:O_RDONLY|O_NOFOLLOW" };
  } catch (error) {
    if (error?.code === "ELOOP") return fail("protected_stack_plan_authorization_malformed", "protected plan authorization symlink was refused by no-follow open");
    if (error?.code === "ENOENT") return fail("protected_stack_plan_authorization_missing", "protected plan authorization disappeared before open");
    return fail("protected_stack_plan_authorization_malformed", error.message || "protected plan authorization could not be opened safely");
  }
}

function prepareProtectedPlanAuthorizationLifecycle({ config = {}, plan = {}, authorizationPlan = plan, stackConfig = normalizePrStackExecutionConfig(config), state = {}, runnerIdentity = null, lifecycle = "claim", operationIntent = null } = {}) {
  const protectedNumbers = (authorizationPlan.orderedPrs || plan.orderedPrs || []).filter((pr) => protectedLivePlanPrs.includes(pr.number)).map((pr) => pr.number);
  const protectedPlan = [...new Set(protectedNumbers)].sort((a, b) => a - b);
  if (protectedPlan.length === 0) return { ok: true, protectedPlan: false };
  const orderedNumbers = (authorizationPlan.orderedPrs || plan.orderedPrs || []).map((pr) => pr.number);
  if (JSON.stringify(orderedNumbers) !== JSON.stringify(authorizableLiveAcceptancePrs)) {
    return fail("protected_stack_plan_unauthorized", "protected live stack plans are refused by default unless exact live acceptance authorization is present");
  }
  const authorizationPath = stackConfig.protectedPlanAuthorizationPath;
  if (!authorizationPath) return fail("protected_stack_plan_authorization_missing", "protected live stack plan requires explicit live acceptance authorization");
  if (!path.isAbsolute(authorizationPath)) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization path must be absolute");
  const trustedRoot = path.resolve(config.trustedControlRoot || config.logsRoot || "/workspace/logs/settleora-auto-runner");
  if (!isInside(path.resolve(authorizationPath), trustedRoot)) return fail("protected_stack_plan_authorization_malformed", "protected plan authorization must be under the trusted control root");
  const loaded = readProtectedPlanAuthorizationFile(authorizationPath, { config });
  if (!loaded.ok) return loaded;
  const authorization = loaded.authorization || {};
  const repo = canonicalRepositorySlug(config.repositorySlug || "tommytang213/Settleora");
  if (authorization.purpose !== "live_stack_acceptance") return fail("protected_stack_plan_authorization_malformed", "protected plan authorization purpose is invalid");
  if (canonicalRepositorySlug(authorization.repositorySlug) !== repo) return fail("protected_stack_plan_authorization_repository_mismatch", "protected plan authorization repository does not match");
  if (JSON.stringify(authorization.orderedPrNumbers || []) !== JSON.stringify(authorizableLiveAcceptancePrs)) {
    return fail("protected_stack_plan_authorization_pr_order_mismatch", "protected plan authorization PR order/set does not match");
  }
  if (authorization.consumedAt || authorization.consumed === true) return fail("protected_stack_plan_authorization_consumed", "protected plan authorization was already consumed");
  if (!authorization.expiresAt || Number.isNaN(Date.parse(authorization.expiresAt)) || Date.parse(authorization.expiresAt) <= Date.now()) {
    return fail("protected_stack_plan_authorization_expired", "protected plan authorization is expired or missing expiry");
  }
  if (authorization.manualGateApproved !== true || typeof authorization.approvedBy !== "string" || authorization.approvedBy.trim().length === 0) {
    return fail("protected_stack_plan_authorization_policy_invalid", "protected plan authorization lacks accepted manual-gate approval");
  }
  const identityResult = protectedPlanAuthorizationIdentity({ config, plan: authorizationPlan, authorization, authorizationPath: loaded.path, authorizationArtifactDigestSha256: loaded.digestSha256 });
  if (!identityResult.ok) return identityResult;
  const identity = identityResult.identity;
  const statePath = protectedAuthorizationStatePath(config, identity);
  const rootTrust = validateProtectedAuthorizationStateRoot(config, statePath);
  if (!rootTrust.ok) return rootTrust;
  const expected = protectedAuthorizationStateEnvelope({ config, plan, state, identity, runnerIdentity });
  let current = readProtectedAuthorizationState(statePath);
  if (!current.ok && current.reasonCode !== "protected_stack_authz_state_missing") return current;
  if (lifecycle === "claim" && current.reasonCode === "protected_stack_authz_state_missing") {
    const strictValidation = validateProtectedLivePlanAuthorization(config, authorizationPlan, { stackConfig, protectedNumbers });
    if (!strictValidation.ok) return strictValidation;
    const claim = {
      ...expected,
      status: "claimed",
      claimedAt: new Date().toISOString(),
      process: processIdentity(),
      history: [{ status: "claimed", at: new Date().toISOString(), process: processIdentity() }],
    };
    const created = createProtectedAuthorizationStateAtomically(statePath, claim);
    if (!created.ok) return created;
    current = { ok: true, state: claim };
  } else if (!current.ok) {
    return fail("protected_stack_authz_state_missing", "protected authorization state is missing");
  }
  const compatibility = validateProtectedAuthorizationStateCompatibility({ current: current.state, expected, lifecycle });
  if (!compatibility.ok) return compatibility;
  if (lifecycle === "claim") {
    return { ok: true, protectedPlan: true, evidence: protectedAuthorizationLifecycleEvidence(current.state, statePath, identity, "claimed") };
  }
  if (lifecycle === "consume") {
    if (current.state.status === "claimed") {
      const consumed = appendProtectedAuthorizationLifecycle(current.state, {
        status: "consumed",
        consumedAt: new Date().toISOString(),
        operationIntent: sanitizeState(operationIntent || {}),
      });
      const written = writeProtectedAuthorizationState(statePath, consumed);
      if (!written.ok) return written;
      current = { ok: true, state: written.state };
    }
    if (!["consumed", "completed"].includes(current.state.status)) {
      return fail("protected_stack_authz_state_ambiguous", "protected authorization state is not consumable");
    }
    return { ok: true, protectedPlan: true, evidence: protectedAuthorizationLifecycleEvidence(current.state, statePath, identity, "consumed") };
  }
  if (lifecycle === "complete") {
    if (current.state.status === "completed") return { ok: true, protectedPlan: true, evidence: protectedAuthorizationLifecycleEvidence(current.state, statePath, identity, "completed") };
    if (current.state.status !== "consumed") return fail("protected_stack_authz_state_ambiguous", "protected authorization must be consumed before completion");
    const completed = appendProtectedAuthorizationLifecycle(current.state, {
      status: "completed",
      completedAt: new Date().toISOString(),
      operationIntent: sanitizeState(operationIntent || {}),
    });
    const written = writeProtectedAuthorizationState(statePath, completed);
    if (!written.ok) return written;
    return { ok: true, protectedPlan: true, evidence: protectedAuthorizationLifecycleEvidence(written.state, statePath, identity, "completed") };
  }
  return fail("protected_stack_authz_lifecycle_unknown", "protected authorization lifecycle phase is unsupported");
}

function protectedPlanAuthorizationIdentity({ config = {}, plan = {}, authorization = {}, authorizationPath = null, authorizationArtifactDigestSha256 = null } = {}) {
  const orderedPrNumbers = (plan.orderedPrs || []).map((pr) => pr.number);
  if (authorization.authorizationId !== undefined && typeof authorization.authorizationId !== "string") return fail("protected_stack_plan_authorization_malformed", "protected plan authorization ID is invalid");
  const operationCorrelation = plan.taskKey || plan.correlationId || authorization.taskKey || authorization.correlationId || null;
  if (!operationCorrelation) return fail("protected_stack_plan_authorization_correlation_missing", "protected plan authorization requires an operation correlation");
  const identity = sanitizeState({
    schemaVersion: authorization.schemaVersion || 1,
    repository: canonicalRepositorySlug(config.repositorySlug || plan.repository || "tommytang213/Settleora"),
    orderedPrNumbers,
    planDigest: digestStackPlan(plan),
    expectedHeads: Object.fromEntries((plan.orderedPrs || []).map((pr) => [String(pr.number), pr.headRefOid])),
    baseBranch: authorization.baseBranch || "main",
    purpose: "live_stack_acceptance",
    manualApproval: {
      approvedBy: authorization.approvedBy || null,
      approvedAt: authorization.approvedAt || null,
      reference: authorization.approvalReference || authorization.manualApprovalReference || null,
    },
    issuedAt: authorization.issuedAt || null,
    expiresAt: authorization.expiresAt || null,
    authorizationId: authorization.authorizationId || digestJson({ authorizationPath, planDigest: digestStackPlan(plan), operationCorrelation }),
    operationCorrelation,
    taskKey: plan.taskKey || authorization.taskKey || null,
    authorizationPath,
    authorizationDigest: digestJson(authorization),
    authorizationArtifactDigestSha256,
  });
  return { ok: true, identity, identityDigest: digestJson(identity) };
}

function protectedAuthorizationStatePath(config = {}, identity = {}) {
  const trustedRoot = path.resolve(config.trustedControlRoot || config.logsRoot || "/workspace/logs/settleora-auto-runner");
  return path.join(trustedRoot, "protected-plan-authz-consumption", `${digestJson({
    authorizationId: identity.authorizationId,
    repository: identity.repository,
    orderedPrNumbers: identity.orderedPrNumbers,
  })}.json`);
}

function validateProtectedAuthorizationStateRoot(config = {}, statePath) {
  const trustedRoot = path.resolve(config.trustedControlRoot || config.logsRoot || "/workspace/logs/settleora-auto-runner");
  const root = path.join(trustedRoot, "protected-plan-authz-consumption");
  if (!isInside(path.resolve(statePath), trustedRoot)) return fail("protected_stack_authz_state_untrusted", "protected authorization state must live under trusted control root");
  if (existsSync(root)) {
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return fail("protected_stack_authz_state_untrusted", "protected authorization state root is not a trusted directory");
    if ((stat.mode & 0o077) !== 0) return fail("protected_stack_authz_state_untrusted", "protected authorization state root must be owner-only");
  } else {
    mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  return { ok: true };
}

function protectedAuthorizationStateEnvelope({ config = {}, plan = {}, state = {}, identity = {}, runnerIdentity = null } = {}) {
  return sanitizeState({
    schemaVersion: 1,
    authorizationId: identity.authorizationId,
    authorizationDigest: identity.authorizationDigest,
    identityDigest: digestJson(identity),
    identity,
    repository: identity.repository,
    planDigest: identity.planDigest,
    orderedPrNumbers: identity.orderedPrNumbers,
    expectedHeads: identity.expectedHeads,
    operationCorrelation: identity.operationCorrelation,
    taskKey: config.taskKey || identity.taskKey || null,
    stackId: plan.stackId || state.stackId || null,
    runnerIdentity,
    runnerIdentityDigest: digestJson(runnerIdentity || {}),
  });
}

function createProtectedAuthorizationStateAtomically(statePath, state) {
  let fd = null;
  try {
    fd = openSync(statePath, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`);
  } catch (error) {
    if (error?.code === "EEXIST") {
      const existing = readProtectedAuthorizationState(statePath);
      if (!existing.ok) return existing;
      return fail("protected_stack_authz_already_claimed", "protected authorization was already claimed", { existing: protectedAuthorizationLifecycleEvidence(existing.state, statePath, existing.state.identity || {}, existing.state.status || "unknown") });
    }
    return fail("protected_stack_authz_state_ambiguous", error.message || "protected authorization claim could not be created atomically");
  } finally {
    if (fd !== null) closeSync(fd);
  }
  const readBack = readProtectedAuthorizationState(statePath);
  if (!readBack.ok) return readBack;
  return { ok: true, state: readBack.state };
}

function readProtectedAuthorizationState(statePath) {
  if (!existsSync(statePath)) return fail("protected_stack_authz_state_missing", "protected authorization state is missing");
  const trust = validateOwnerOnlyFile(statePath);
  if (!trust.ok) return fail("protected_stack_authz_state_untrusted", trust.reason);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return fail("protected_stack_authz_state_corrupt", "protected authorization state is corrupt");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("protected_stack_authz_state_corrupt", "protected authorization state must be an object");
  if (!["claimed", "consumed", "completed"].includes(String(parsed.status || ""))) return fail("protected_stack_authz_state_corrupt", "protected authorization state status is unsupported");
  return { ok: true, state: parsed };
}

function validateProtectedAuthorizationStateCompatibility({ current = {}, expected = {}, lifecycle = "claim" } = {}) {
  if (current.schemaVersion !== 1) return fail("protected_stack_authz_state_corrupt", "protected authorization state schema is unsupported");
  for (const key of ["authorizationId", "authorizationDigest", "repository", "operationCorrelation", "stackId"]) {
    if (current[key] !== expected[key]) return fail("protected_stack_authz_mismatched", `protected authorization state ${key} does not match this operation`);
  }
  if (digestJson(current.orderedPrNumbers || []) !== digestJson(expected.orderedPrNumbers || [])) return fail("protected_stack_authz_mismatched", "protected authorization PR order/set does not match this operation");
  if (current.runnerIdentityDigest !== expected.runnerIdentityDigest) return fail("protected_stack_authz_mismatched", "protected authorization runner authority does not match this operation");
  if (current.status === "completed" && lifecycle !== "complete") return fail("protected_stack_authz_completed", "protected authorization is already completed");
  return { ok: true };
}

function appendProtectedAuthorizationLifecycle(current = {}, update = {}) {
  const event = sanitizeState({ status: update.status, at: update.consumedAt || update.completedAt || new Date().toISOString(), operationIntent: update.operationIntent || null, process: processIdentity() });
  return sanitizeState({
    ...current,
    status: update.status,
    consumedAt: update.consumedAt || current.consumedAt || null,
    completedAt: update.completedAt || current.completedAt || null,
    operationIntent: update.operationIntent || current.operationIntent || null,
    history: [...(Array.isArray(current.history) ? current.history : []), event],
  });
}

function writeProtectedAuthorizationState(statePath, state) {
  const tmp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, statePath);
  const readBack = readProtectedAuthorizationState(statePath);
  if (!readBack.ok) return readBack;
  return { ok: true, state: readBack.state };
}

function protectedAuthorizationLifecycleEvidence(state = {}, statePath, identity = {}, lifecycle) {
  return sanitizeState({
    protectedPlan: true,
    lifecycle,
    status: state.status || null,
    statePath,
    authorizationId: state.authorizationId || identity.authorizationId || null,
    authorizationDigest: state.authorizationDigest || identity.authorizationDigest || null,
    identityDigest: state.identityDigest || digestJson(identity || {}),
    operationCorrelation: state.operationCorrelation || identity.operationCorrelation || null,
    claimedAt: state.claimedAt || null,
    consumedAt: state.consumedAt || null,
    completedAt: state.completedAt || null,
    stateDigest: digestJson(state),
  });
}

function processIdentity() {
  return { pid: process.pid, ppid: process.ppid, startedAt: new Date().toISOString() };
}

export function createInitialPrStackState({ plan, adapter = null } = {}) {
  const now = new Date().toISOString();
  const state = sanitizeState({
    stateVersion: prStackStateVersion,
    stackId: plan.stackId,
    repository: plan.repository,
    issueNumber: plan.issueNumber ?? null,
    trackerIssues: plan.trackerIssues || plan.issues || {},
    sessionLifecycle: plan.sessionLifecycle || null,
    orderedPrs: plan.orderedPrs.map((pr) => immutablePrIdentity(pr)),
    activePrNumber: plan.activePrNumber || plan.orderedPrs[0]?.number || null,
    currentPhase: "initialized",
    currentAction: null,
    sourceCycles: Object.fromEntries(plan.orderedPrs.map((pr) => [pr.number, 0])),
    sourceCycleReservations: {},
    exactHeads: Object.fromEntries(plan.orderedPrs.map((pr) => [pr.number, pr.headRefOid])),
    exactBases: Object.fromEntries(plan.orderedPrs.map((pr) => [pr.number, pr.baseRefName])),
    findingHistory: {},
    evidence: {
      reviewConverged: {},
      gatesPassed: {},
      merged: {},
      currentMainProof: {},
      retargeted: {},
      ownDeltaPreserved: {},
      ready: {},
      hygiene: {},
    },
    reviewRequests: {},
    mutationMarkers: {},
    mergeProofs: {},
    currentMainProofs: {},
    ownDeltaProofs: {},
    readyTransitionProofs: {},
    hygieneMarkers: {},
    adapterCapabilities: adapter?.capabilities || {},
    terminal: null,
    wait: null,
    summaries: [],
    timestamps: { createdAt: now, updatedAt: now },
  });
  const validation = validatePrStackState(state, plan);
  if (!validation.ok) throw new Error(`Invalid PR stack state: ${validation.reasonCode}`);
  return state;
}

export function loadOrCreateStackState({ config = {}, plan, statePath, adapter = null } = {}) {
  if (existsSync(statePath)) {
    const loaded = loadPrStackState(statePath, plan);
    if (!loaded.ok) return loaded;
    if (loaded.state.terminal?.reasonCode === "controller_wiring_missing") {
      return {
        ok: true,
        state: sanitizeState({ ...loaded.state, terminal: null, currentPhase: "resumed_from_controller_wiring_missing", adapterCapabilities: adapter?.capabilities || loaded.state.adapterCapabilities || {} }),
      };
    }
    return loaded;
  }
  return { ok: true, state: createInitialPrStackState({ plan, adapter, config }) };
}

export function loadPrStackState(statePath, plan) {
  const fileTrust = validateOwnerOnlyFile(statePath, { missingOk: true });
  if (!fileTrust.ok) return fileTrust;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return fail("stack_state_corrupt", "stack state JSON could not be parsed");
  }
  const validation = validatePrStackState(parsed, plan);
  if (!validation.ok) return validation;
  return { ok: true, state: sanitizeState(parsed) };
}

export function writePrStackState(statePath, state) {
  const validation = validatePrStackState(state);
  if (!validation.ok) throw new Error(`Invalid PR stack state: ${validation.reasonCode}`);
  const preMkdirPathTrust = validatePrStackStateWritePath(statePath, { parentMayBeMissing: true });
  if (!preMkdirPathTrust.ok) throw new Error(preMkdirPathTrust.reason);
  mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  const pathTrust = validatePrStackStateWritePath(statePath);
  if (!pathTrust.ok) throw new Error(pathTrust.reason);
  const next = sanitizeState({ ...state, timestamps: { ...(state.timestamps || {}), updatedAt: new Date().toISOString() } });
  const tmp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, statePath);
  return { statePath, state: next };
}

export function validatePrStackState(state = {}, plan = null) {
  if (state.stateVersion !== prStackStateVersion) return fail("stack_state_unknown_version", "unknown stack state schema version");
  if (!validStackId(state.stackId)) return fail("stack_state_identity_missing", "stack state stackId missing");
  if (!state.repository || typeof state.repository !== "string") return fail("stack_state_repository_missing", "stack state repository missing");
  if (!Array.isArray(state.orderedPrs) || state.orderedPrs.length < 2 || state.orderedPrs.length > 4) return fail("stack_state_prs_invalid", "stack state PR list invalid");
  const seen = new Set();
  for (const pr of state.orderedPrs) {
    if (!Number.isInteger(pr.number) || seen.has(pr.number)) return fail("stack_state_pr_identity_invalid", "stack state PR identity invalid");
    seen.add(pr.number);
    if (pr.number === 917) return fail("stack_state_pr_917_refused", "PR #917 cannot enter stack state");
    if (!safeBranch(pr.baseRefName) || !safeBranch(pr.headRefName) || !validSha(pr.headRefOid)) {
      return fail("stack_state_pr_identity_invalid", "stack state PR identity invalid");
    }
  }
  if (plan) {
    if (state.stackId !== plan.stackId || state.repository !== plan.repository) return fail("stack_state_identity_mismatch", "stack state identity differs from plan");
    if (state.orderedPrs.length !== plan.orderedPrs.length) return fail("stack_state_pr_identity_mismatch", "stack state PR count differs from plan");
    for (let index = 0; index < plan.orderedPrs.length; index += 1) {
      const expected = immutablePrIdentity(plan.orderedPrs[index]);
      const actual = state.orderedPrs[index];
      for (const key of ["number", "baseRefName", "headRefName", "headRefOid", "expectedParentPr", "expectedParentBranch"]) {
        if (key === "headRefOid" && state.exactHeads?.[expected.number]) continue;
        if (key === "baseRefName" && state.evidence?.retargeted?.[expected.number]?.ok === true) continue;
        if (actual[key] !== expected[key]) return fail("stack_state_pr_identity_mismatch", `stack state PR ${key} differs from plan`);
      }
    }
  }
  return { ok: true };
}

async function dispatchStackAction({ config, stackConfig, plan, state, action, adapter }) {
  if (!action || typeof action.action !== "string") return fail("stack_unknown_action", "nextStackAction returned no action");
  const pr = plan.orderedPrs.find((entry) => entry.number === action.prNumber) || null;
  switch (action.action) {
    case "recover_active_pr":
      return dispatchRecoverActivePr({ config, plan, state, action, adapter });
    case "converge_pr":
      return dispatchConvergePr({ config, plan, state, action, pr, adapter });
    case "complete_gates":
      return dispatchCompleteGates({ config, plan, state, action, pr, adapter });
    case "merge_pr":
      return dispatchMergePr({ config, plan, state, action, pr, adapter });
    case "retarget_pr":
      return dispatchRetargetPr({ config, plan, state, action, pr, adapter });
    case "prove_own_delta":
      return dispatchOwnDeltaProof({ config, plan, state, action, pr, adapter });
    case "hygiene":
      return dispatchHygiene({ config, plan, state, adapter });
    case "complete":
      return { ok: true, complete: true, evidence: state.evidence, summary: { action: "complete" } };
    default:
      return fail("stack_unknown_action", `unsupported stack action: ${action.action}`);
  }
}

async function dispatchRecoverActivePr({ config, plan, state, action, adapter }) {
  if (action.reason === "parent_current_main_proof_required") {
    const parent = plan.orderedPrs.find((entry) => entry.number === action.prNumber);
    const proof = await adapter.fetchCurrentMain({ config, plan, state, pr: parent });
    if (!proof?.ok) return waitOrFail(proof, "current_main_proof_missing");
    return {
      ok: true,
      evidence: putEvidence(state.evidence, "currentMainProof", action.prNumber, proof),
      summary: { action: action.action, reason: action.reason, proof: boundedProof(proof) },
    };
  }
  const repositoryContext = await buildRepositoryOperationContext({ config, plan, state, prNumber: action.prNumber, adapter });
  if (!repositoryContext.ok) return repositoryContext;
  const recovered = await adapter.inspectPr({ config, plan, state, prNumber: action.prNumber, repositoryContext: repositoryContext.context });
  if (!recovered?.ok) return waitOrFail(recovered, "active_pr_recovery_failed");
  return { ok: true, evidence: state.evidence, summary: { action: action.action, reason: action.reason, inspected: boundedProof(recovered) } };
}

async function dispatchConvergePr({ config, plan, state, action, pr, adapter }) {
  const markerKey = markerKeyFor("converge_pr", pr.number, pr.headRefOid);
  if (state.mutationMarkers[markerKey]) {
    return { ok: true, evidence: putEvidence(state.evidence, "reviewConverged", pr.number, state.mutationMarkers[markerKey].result || true), mutationMarkers: state.mutationMarkers, summary: { action: action.action, duplicate: true } };
  }
  const before = await adapter.inspectPr({ config, plan, state, prNumber: pr.number });
  if (!before?.ok) return waitOrFail(before, "pr_inspection_failed");
  if (before.headRefOid && before.headRefOid !== pr.headRefOid) {
    const reconciled = typeof adapter.reconcilePendingPushIntent === "function"
      ? await adapter.reconcilePendingPushIntent({ config, plan, state, pr, livePr: before })
      : null;
    if (reconciled?.ok && reconciled.finalized === true) {
      const newHead = reconciled.newHead;
      const reserved = validateReconciledSourceCycle({ config, state, pr, result: reconciled });
      if (!reserved.ok) return reserved;
      const sourceCycles = { ...(state.sourceCycles || {}), [pr.number]: reserved.consumedAfter };
      const recoveredEvidence = reconciled.result?.reviewConvergenceState
        ? putEvidence(state.evidence, "reviewConvergenceState", pr.number, reconciled.result.reviewConvergenceState)
        : state.evidence;
      const rebound = rebindStateToNewHead({ ...state, evidence: recoveredEvidence }, pr.number, newHead, sourceCycles, reconciled);
      if (!rebound.ok) return rebound;
      return {
        ok: true,
        evidence: rebound.evidence,
        mutationMarkers: rebound.mutationMarkers,
        sourceCycleReservations: upsertSourceCycleReservation(state.sourceCycleReservations, reserved.reservation),
        sourceCycles,
        sourceCycleEpoch: { ...(typeof state.sourceCycleEpoch === "object" ? state.sourceCycleEpoch : {}), [pr.number]: reserved.reservation.sourceCycleEpoch },
        exactHeads: rebound.exactHeads,
        orderedPrs: rebound.orderedPrs,
        summary: { action: action.action, prNumber: pr.number, oldHead: pr.headRefOid, newHead, sourceCycleConsumed: true, pushIntentReconciledBeforeStale: true, sourceCycleReservation: reserved.summary },
      };
    }
    if (reconciled?.ok === false && reconciled.reasonCode !== "push_intent_not_completed" && reconciled.reasonCode !== "push_intent_unpushed_candidate") {
      return reconciled;
    }
    return fail("stack_pr_head_stale", `PR #${pr.number} head changed`);
  }
  const budget = evaluateSourceCycleBudget({ config, state, pr, findings: before.findings || [] });
  if (!budget.ok) return budget;
  const result = await adapter.convergeExistingPr({ config, plan, state, pr, findings: before.findings || [], sourceCycleBudget: budget });
  if (!result?.ok) return waitOrFail(result, "pr_convergence_failed");
  const convergenceEvidence = result.reviewConvergenceState
    ? putEvidence(state.evidence, "reviewConvergenceState", pr.number, result.reviewConvergenceState)
    : state.evidence;
  const newHead = result.newHead || result.headRefOid || pr.headRefOid;
  const sourceCycles = { ...(state.sourceCycles || {}) };
  if (newHead !== pr.headRefOid) {
    const reserved = validateReconciledSourceCycle({ config, state, pr, result, budget });
    if (!reserved.ok) return reserved;
    sourceCycles[pr.number] = reserved.consumedAfter;
    const rebound = rebindStateToNewHead({ ...state, evidence: convergenceEvidence }, pr.number, newHead, sourceCycles, result);
    if (!rebound.ok) return rebound;
    return {
      ok: true,
      evidence: rebound.evidence,
      mutationMarkers: rebound.mutationMarkers,
      sourceCycleReservations: upsertSourceCycleReservation(state.sourceCycleReservations, reserved.reservation),
      sourceCycles,
      sourceCycleEpoch: { ...(typeof state.sourceCycleEpoch === "object" ? state.sourceCycleEpoch : {}), [pr.number]: reserved.reservation.sourceCycleEpoch },
      exactHeads: rebound.exactHeads,
      orderedPrs: rebound.orderedPrs,
      sessionLifecycle: result.sessionLifecycle || state.sessionLifecycle,
      summary: { action: action.action, prNumber: pr.number, oldHead: pr.headRefOid, newHead, sourceCycleConsumed: true, reboundExactHead: true, sourceCycleReservation: reserved.summary },
    };
  }
  const marker = recordStackMutationMarker({ mutationMarkers: state.mutationMarkers }, { kind: "converge_pr", key: pr.headRefOid, prNumber: pr.number, exactHead: pr.headRefOid });
  const mutationMarkers = {
    ...marker.plan.mutationMarkers,
    [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(result) },
  };
  return {
    ok: true,
    evidence: putEvidence(convergenceEvidence, "reviewConverged", pr.number, result),
    mutationMarkers,
    sessionLifecycle: result.sessionLifecycle || state.sessionLifecycle,
    sourceCycles,
    summary: { action: action.action, prNumber: pr.number, sourceCycleConsumed: newHead !== pr.headRefOid, sourceCycleBudget: budget.summary },
  };
}

async function dispatchCompleteGates({ config, plan, state, action, pr, adapter }) {
  const result = await adapter.completeFinalGates({ config, plan, state, pr });
  if (!result?.ok) {
    if (result?.waiting && result.evidencePatch) {
      const patchValidation = validateEvidencePatch(result.evidencePatch);
      if (!patchValidation.ok) return patchValidation;
    }
    return waitOrFail(result, "final_gates_failed");
  }
  return { ok: true, evidence: putEvidence(state.evidence, "gatesPassed", pr.number, result), summary: { action: action.action, prNumber: pr.number } };
}

async function dispatchMergePr({ config, plan, state, action, pr, adapter }) {
  if (!state.evidence?.gatesPassed?.[pr.number]) return fail("merge_without_gates_refused", "merge requires final gate evidence");
  let mergeEntryEvidence = null;
  if (typeof adapter.validateMergeEntryGateEvidence === "function") {
    const validation = await adapter.validateMergeEntryGateEvidence({ config, plan, state, pr, expectedHead: action.expectedHead || pr.headRefOid });
    if (!validation.ok) {
      if (isStaleMergeEntryGateEvidence(validation)) {
        return {
          ok: true,
          evidence: invalidateFinalGateEvidence(state.evidence, pr.number),
          summary: {
            action: action.action,
            prNumber: pr.number,
            invalidatedFinalGateEvidence: true,
            reasonCode: validation.reasonCode,
          },
        };
      }
      return validation;
    }
    mergeEntryEvidence = validation.mergeEntryEvidence;
    state = { ...state, evidence: putEvidence(state.evidence, "gatesPassed", pr.number, validation.evidence) };
  }
  const markerKey = markerKeyFor("merge_pr", pr.number, pr.headRefOid);
  if (state.mutationMarkers[markerKey]) {
    const markerResult = state.mutationMarkers[markerKey].result || { ok: true, merged: true };
    const restored = await ensurePostMergeSourceBranchRestored({ config, plan, state, pr, adapter, expectedHead: action.expectedHead || pr.headRefOid, mergeResult: markerResult });
    if (!restored.ok) return restored;
    const completedResult = { ...markerResult, sourceBranchRestoration: restored.restoration };
    return { ok: true, evidence: putEvidence(state.evidence, "merged", pr.number, completedResult), mutationMarkers: state.mutationMarkers, summary: { action: action.action, duplicate: true } };
  }
  const intent = await prepareStackMutationIntent({
    config,
    plan,
    state,
    pr,
    adapter,
    operationType: "merge_pr",
    expectedPreState: expectedMergePreState({ pr, state, expectedHead: action.expectedHead || pr.headRefOid }),
    intendedPostState: intendedMergePostState({ pr, expectedHead: action.expectedHead || pr.headRefOid }),
    operationEvidence: mergeEntryEvidence,
  });
  if (!intent.ok) return intent;
  if (intent.observedComplete) {
    const proof = await finalizeObservedStackMutation({ config, plan, state, pr, adapter, intent: intent.intent });
    if (!proof.ok) return proof;
    const restored = await ensurePostMergeSourceBranchRestored({ config, plan, state, pr, adapter, expectedHead: action.expectedHead || pr.headRefOid, mergeResult: proof.result, intent: proof.intent });
    if (!restored.ok) return restored;
    const completedResult = { ...proof.result, sourceBranchRestoration: restored.restoration };
    const marker = recordStackMutationMarker({ mutationMarkers: state.mutationMarkers }, { kind: "merge_pr", key: pr.headRefOid, prNumber: pr.number, exactHead: pr.headRefOid });
    const mutationMarkers = {
      ...marker.plan.mutationMarkers,
      [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(completedResult) },
    };
    await finalizeStackOperationEvidence({ config, intent: proof.intent, result: completedResult });
    return {
      ok: true,
      evidence: putEvidence(state.evidence, "merged", pr.number, { ...completedResult, ok: true, merged: true }),
      mutationMarkers,
      activePrNumber: nextUnmergedPr(plan, state.evidence, pr.number),
      summary: { action: action.action, prNumber: pr.number, mergeSha: proof.result.mergeSha || null, recoveredCompletedMutation: true },
    };
  }
  const result = await adapter.mergePr({ config, plan, state, pr, expectedHead: action.expectedHead || pr.headRefOid, operationIntent: intent.intent, repositoryContext: intent.repositoryContext });
  if (!result?.ok) return waitOrFail(result, "merge_failed");
  const restored = await ensurePostMergeSourceBranchRestored({ config, plan, state, pr, adapter, expectedHead: action.expectedHead || pr.headRefOid, mergeResult: result, intent: intent.intent });
  if (!restored.ok) return restored;
  const completedResult = { ...result, sourceBranchRestoration: restored.restoration };
  await markStackOperationObservedComplete({ config, intent: intent.intent, result: completedResult });
  const marker = recordStackMutationMarker({ mutationMarkers: state.mutationMarkers }, { kind: "merge_pr", key: pr.headRefOid, prNumber: pr.number, exactHead: pr.headRefOid });
  const mutationMarkers = {
    ...marker.plan.mutationMarkers,
    [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(completedResult) },
  };
  await finalizeStackOperationEvidence({ config, intent: intent.intent, result: completedResult });
  return {
    ok: true,
    evidence: putEvidence(state.evidence, "merged", pr.number, { ...completedResult, ok: true, merged: true }),
    mutationMarkers,
    activePrNumber: nextUnmergedPr(plan, state.evidence, pr.number),
    summary: { action: action.action, prNumber: pr.number, mergeSha: result.mergeSha || null },
  };
}

async function dispatchRetargetPr({ config, plan, state, action, pr, adapter }) {
  const parentNumber = pr.expectedParentPr;
  if (!state.evidence?.merged?.[parentNumber]) return fail("retarget_without_parent_merge_refused", "parent merge proof required before retarget");
  if (!state.evidence?.currentMainProof?.[parentNumber]) return fail("retarget_without_current_main_refused", "current-main proof required before retarget");
  const markerKey = markerKeyFor("retarget_pr", pr.number, `${pr.headRefOid}:main`);
  if (state.mutationMarkers[markerKey]) {
    const retargetProof = state.mutationMarkers[markerKey].result || { ok: true, newBase: action.newBase || "main" };
    return {
      ok: true,
      evidence: putEvidence(state.evidence, "retargeted", pr.number, retargetProof),
      mutationMarkers: state.mutationMarkers,
      orderedPrs: rebindOrderedPrAfterRetarget(state, pr.number, retargetProof),
      summary: { action: action.action, duplicate: true },
    };
  }
  const newBase = action.newBase || "main";
  const intent = await prepareStackMutationIntent({
    config,
    plan,
    state,
    pr,
    adapter,
    operationType: "retarget_pr",
    expectedPreState: expectedRetargetPreState({ pr }),
    intendedPostState: intendedRetargetPostState({ pr, newBase }),
  });
  if (!intent.ok) return intent;
  if (intent.observedComplete) {
    const proof = await finalizeObservedStackMutation({ config, plan, state, pr, adapter, intent: intent.intent });
    if (!proof.ok) return proof;
    const retargetProof = { ...proof.result, ok: true, newBase, after: { ...(proof.result.after || {}), baseRefName: newBase } };
    const marker = recordStackMutationMarker({ mutationMarkers: state.mutationMarkers }, { kind: "retarget_pr", key: `${pr.headRefOid}:main`, prNumber: pr.number, exactHead: pr.headRefOid });
    const mutationMarkers = {
      ...marker.plan.mutationMarkers,
      [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(retargetProof) },
    };
    await finalizeStackOperationEvidence({ config, intent: proof.intent, result: retargetProof });
    return {
      ok: true,
      evidence: putEvidence(state.evidence, "retargeted", pr.number, retargetProof),
      mutationMarkers,
      orderedPrs: rebindOrderedPrAfterRetarget(state, pr.number, retargetProof),
      summary: { action: action.action, prNumber: pr.number, recoveredCompletedMutation: true },
    };
  }
  const result = await adapter.retargetPrBase({ pr, newBase, expectedHead: pr.headRefOid, expectedCurrentBase: pr.baseRefName, operationIntent: intent.intent, repositoryContext: intent.repositoryContext });
  if (!result?.ok) return waitOrFail(result, "retarget_failed");
  await markStackOperationObservedComplete({ config, intent: intent.intent, result });
  const actualNewBase = result.after?.baseRefName || newBase;
  const retargetProof = { ...result, ok: true, newBase: actualNewBase, after: { ...(result.after || {}), baseRefName: actualNewBase } };
  const marker = recordStackMutationMarker({ mutationMarkers: state.mutationMarkers }, { kind: "retarget_pr", key: `${pr.headRefOid}:main`, prNumber: pr.number, exactHead: pr.headRefOid });
  const mutationMarkers = {
    ...marker.plan.mutationMarkers,
    [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(retargetProof) },
  };
  await finalizeStackOperationEvidence({ config, intent: intent.intent, result: retargetProof });
  return {
    ok: true,
    evidence: putEvidence(state.evidence, "retargeted", pr.number, retargetProof),
    mutationMarkers,
    orderedPrs: rebindOrderedPrAfterRetarget(state, pr.number, retargetProof),
    summary: { action: action.action, prNumber: pr.number },
  };
}

async function dispatchOwnDeltaProof({ config, plan, state, action, pr, adapter }) {
  if (!state.evidence?.retargeted?.[pr.number]) return fail("own_delta_without_retarget_refused", "semantic own-delta proof requires retarget evidence");
  const proofInput = await adapter.proveSemanticOwnDelta({ pr, state });
  if (!proofInput?.ok && !proofInput?.before) return fail("semantic_own_delta_missing_evidence", "semantic own-delta evidence missing");
  const proof = proveSemanticOwnDelta(proofInput.before || pr.ownDelta, proofInput.after || proofInput);
  if (!proof.ok) return fail("semantic_own_delta_failed", proof.reason);
  let evidence = putEvidence(state.evidence, "ownDeltaPreserved", pr.number, proof);
  let mutationMarkers = state.mutationMarkers;
  if (pr.isDraft) {
    const markerKey = markerKeyFor("ready_pr", pr.number, pr.headRefOid);
    if (!state.mutationMarkers[markerKey]) {
      const intent = await prepareStackMutationIntent({
        config,
        plan,
        state,
        pr,
        adapter,
        operationType: "mark_ready",
        expectedPreState: expectedReadyPreState({ pr }),
        intendedPostState: intendedReadyPostState({ pr }),
      });
      if (!intent.ok) return intent;
      let ready;
      if (intent.observedComplete) {
        const proof = await finalizeObservedStackMutation({ config, plan, state, pr, adapter, intent: intent.intent });
        if (!proof.ok) return proof;
        ready = proof.result;
      } else {
        ready = await adapter.markReadyForReview({ pr, expectedHead: pr.headRefOid, operationIntent: intent.intent, repositoryContext: intent.repositoryContext });
      }
      if (!ready?.ok) return waitOrFail(ready, "ready_transition_failed");
      const readyProof = { ...ready, ok: true, after: { ...(ready.after || {}), isDraft: false } };
      if (!intent.observedComplete) await markStackOperationObservedComplete({ config, intent: intent.intent, result: ready });
      const marker = recordStackMutationMarker({ mutationMarkers }, { kind: "ready_pr", key: pr.headRefOid, prNumber: pr.number, exactHead: pr.headRefOid });
      mutationMarkers = {
        ...marker.plan.mutationMarkers,
        [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(readyProof) },
      };
      await finalizeStackOperationEvidence({ config, intent: intent.intent, result: readyProof });
      evidence = putEvidence(evidence, "ready", pr.number, readyProof);
    }
  }
  return { ok: true, evidence, mutationMarkers, summary: { action: action.action, prNumber: pr.number } };
}

async function dispatchHygiene({ config, plan, state, adapter }) {
  for (const pr of plan.orderedPrs) {
    if (!state.evidence?.merged?.[pr.number]) return fail("hygiene_before_all_merges_refused", "final hygiene requires every PR merge proof");
    const restoration = state.evidence.merged[pr.number]?.sourceBranchRestoration || state.evidence.merged[pr.number]?.result?.sourceBranchRestoration || null;
    if (!sourceBranchRestorationConfirmed(restoration, { branchName: pr.headRefName, headSha: pr.headRefOid })) {
      return fail("hygiene_before_source_branch_restoration_refused", "final hygiene requires confirmed source branch restoration for every merged PR");
    }
  }
  const markerKey = markerKeyFor("hygiene", "stack", plan.stackId);
  if (state.mutationMarkers[markerKey]) return { ok: true, complete: true, evidence: state.evidence, mutationMarkers: state.mutationMarkers, summary: { action: "hygiene", duplicate: true } };
  const result = await adapter.runFinalHygiene({ config, plan, state });
  if (!result?.ok) return waitOrFail(result, "hygiene_failed");
  const marker = recordStackMutationMarker({ mutationMarkers: state.mutationMarkers }, { kind: "hygiene", key: plan.stackId, prNumber: "stack", exactHead: null });
  const mutationMarkers = {
    ...marker.plan.mutationMarkers,
    [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(result) },
  };
  return { ok: true, complete: true, evidence: putEvidence(state.evidence, "hygiene", plan.stackId, result), mutationMarkers, summary: { action: "hygiene" } };
}

export function createProductionPrStackAdapter(config = {}, options = {}) {
  const runner = options.runner;
  const runBatchFix = options.runBatchFix || ((payload) => runExistingPrBatchFix(payload, createProductionBatchFixAdapters(config, options)));
  const run = runner || defaultRunner;
  return {
    capabilities: {
      stackDispatchLoop: true,
      shellFreeArgv: true,
      usesExistingMergeAuthority: true,
      usesExistingHygieneAuthority: true,
      usesExistingBatchFixAuthority: true,
      repositoryBoundOperations: true,
      liveRunnerInjected: Boolean(runner),
      liveRunnerIdentity: runner?.settleoraRunnerIdentity || null,
    },
    async preflightLiveRunner({ config: cfg, plan, state }) {
      const targetConfig = cfg || config;
      const runnerProof = validateStackLiveRunner({ runner, run });
      if (!runnerProof.ok) return runnerProof;
      const repositoryContext = await buildRepositoryOperationContext({
        config: targetConfig,
        plan,
        state,
        prNumber: plan.issueNumber || plan.orderedPrs?.[0]?.number || null,
        adapter: this,
      });
      if (!repositoryContext.ok) return repositoryContext;
      return {
        ok: true,
        runnerIdentity: runnerProof.runnerIdentity,
        repositoryContext: repositoryContext.context,
        finalHygieneReceivesSameRunner: true,
        mutationCapabilitiesCoherent: true,
      };
    },
    async readRepositoryOperationContext({ config: cfg, prNumber }) {
      const targetConfig = cfg || config;
      const cwd = path.resolve(targetConfig.repoRoot || process.cwd());
      const worktree = run("git", ["rev-parse", "--show-toplevel"], { cwd });
      if (!isRunnerResult(worktree)) return fail("repository_operation_runner_malformed", "live runner did not return fixed-argv command evidence");
      if (worktree.status !== 0 || worktree.error) return fail("repository_operation_root_unreadable", boundedText(worktree.stderr || worktree.error || worktree.stdout));
      const rawWorktree = String(worktree.stdout || "").trim();
      const worktreePath = path.isAbsolute(rawWorktree) ? path.resolve(rawWorktree) : cwd;
      if (worktreePath !== cwd) return fail("repository_operation_root_mismatch", "configured repoRoot does not match git toplevel");
      const origin = readOriginRepositoryProof({ config: targetConfig, runner: run });
      if (!origin.ok) return origin;
      return { ok: true, worktreePath, originRepositorySlug: origin.repositorySlug, prNumber, proof: { originCheckedAt: origin.checkedAt } };
    },
    async inspectPr({ config: cfg, plan, state, prNumber, repositoryContext = null }) {
      const targetConfig = cfg || config;
      const context = repositoryContext || (await buildRepositoryOperationContext({ config: targetConfig, plan, state, prNumber, adapter: this })).context;
      if (!context) return fail("repository_operation_context_missing", "repository operation context is required");
      const repo = context.argvRepository || targetConfig.repositorySlug || "tommytang213/Settleora";
	      const raw = run(
        "gh",
        [
          "pr",
          "view",
          String(prNumber),
          "--repo",
          repo,
          "--json",
          "number,url,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository,mergeable,mergeStateStatus,title,body,statusCheckRollup,comments,reviews,mergeCommit,mergedAt",
        ],
        { cwd: targetConfig.repoRoot },
	      );
	      if (!isRunnerResult(raw)) return fail("inspect_pr_runner_malformed", "PR inspection runner did not return fixed-argv command evidence");
	      if (raw.status !== 0 || raw.error) return fail("inspect_pr_read_failed", boundedText(raw.stderr || raw.error || raw.stdout));
      let pr;
      try {
        pr = JSON.parse(raw.stdout || "{}");
      } catch (error) {
        return fail("inspect_pr_parse_failed", error.message);
      }
	      const proof = normalizeBoundLivePrProof({ config: targetConfig, pr, repositoryContext: context });
	      if (!proof.ok) return proof;
	      const commandEvidence = normalizeLiveInspectCommandEvidence({ result: raw, runner: run, repositorySlug: repo, prNumber, parsed: pr, cwd: targetConfig.repoRoot });
	      if (!commandEvidence.ok && run.settleoraRunnerMode === "live") return commandEvidence;
	      const stateSnapshot = inspectAutoMergeGithubState({ ...targetConfig, repositorySlug: repo }, { issue: {}, prUrlOrNumber: prNumber }, { runner: run });
      const reviewThreads = stateSnapshot.reviewThreads || [];
      if (!pr?.number) return fail("inspect_pr_missing", "PR inspection did not return a PR");
      return {
        ok: true,
        pr: { ...pr, ...proof.proof, repositoryProof: context },
        headRefOid: pr.headRefOid,
        requiredChecks: stackFlattenCheckRollup(pr.statusCheckRollup || []),
        reviewThreads,
	        codeScanningAlerts: stateSnapshot.codeScanningAlerts || [],
	        findings: unresolvedThreadsAsFindings(reviewThreads),
	        repositoryContext: context,
	        commandEvidence: commandEvidence.ok ? commandEvidence.evidence : null,
	      };
	    },
    async convergeExistingPr({ pr, findings = [], state = null, plan = null, sourceCycleBudget = null }) {
      const durableBudget = sourceCycleBudget || evaluateSourceCycleBudget({ config, state, pr, findings });
      if (!durableBudget.ok) return durableBudget;
      const sourceCycleOperationContext = createSourceCycleOperationContext({ config, plan, state, pr, sourceCycleBudget: durableBudget });
      if (!sourceCycleOperationContext.ok) return sourceCycleOperationContext;
      const laneDecision = resolveStackConvergenceLaneContract({ config, plan, state, pr, findings, sourceCycleBudget: durableBudget });
      if (!laneDecision.ok) return laneDecision;
      const result = await runExistingPrReviewConvergence({
        config,
        issue: { number: pr.issueNumber || 921, title: pr.title || "" },
        pr,
        findings,
        laneDecision: laneDecision.contract,
        sourceCycleBudget: durableBudget,
        sourceCycleOperationContext: sourceCycleOperationContext.context,
        sessionLifecycle: state?.sessionLifecycle || plan?.sessionLifecycle || null,
        reviewConvergenceState: state?.evidence?.reviewConvergenceState?.[pr.number] || null,
        runBatchFix,
      });
      return result.ok
        ? { ...result, headRefOid: result.newHead || pr.headRefOid }
        : result;
    },
    async completeFinalGates({ config: cfg, plan, state, pr }) {
      const targetConfig = cfg || config;
      const repositoryContext = await buildRepositoryOperationContext({ config: targetConfig, plan, state, prNumber: pr.number, adapter: this });
      if (!repositoryContext.ok) return repositoryContext;
      const prepared = prepareExactHeadFinalGateWorktree({ config: targetConfig, pr, expectedHead: pr.headRefOid, runner: run, repositoryContext: repositoryContext.context });
      if (!prepared.ok) return prepared;
      let gate = await collectFinalGateEvidence({ config: targetConfig, plan, state, pr, runner: run, adapter: this, repositoryContext: repositoryContext.context });
      if (isFinalGateExactHeadEvidenceMissing(gate)) {
        const preparedGateEvidence = await prepareExactHeadFinalGateEvidence({
          config: targetConfig,
          plan,
          state,
          pr,
          runner: run,
          runStrongReview: options.runStrongReview,
          runCodexReview: options.runCodexReview,
          runValidation: options.runValidationPlan || runValidationPlan,
        });
        if (!preparedGateEvidence.ok) return preparedGateEvidence;
        const patchedState = { ...state, evidence: mergeEvidencePatch(state.evidence, preparedGateEvidence.evidencePatch) };
        gate = await collectFinalGateEvidence({ config: targetConfig, plan, state: patchedState, pr, runner: run, adapter: this, repositoryContext: repositoryContext.context });
        if (!gate.ok && gate.waiting) {
          return { ...gate, evidencePatch: preparedGateEvidence.evidencePatch };
        }
      }
      if (!gate.ok && gate.waiting && gate.evidence) {
        return {
          ok: false,
          waiting: true,
          reasonCode: gate.reasonCode,
          reason: gate.reason,
          evidencePatch: { finalGateSnapshots: { [pr.number]: gate.evidence } },
        };
      }
      if (!gate.ok) return gate;
      return gate.evidence;
    },
    async validateMergeEntryGateEvidence({ config: cfg, plan = null, state, pr, expectedHead }) {
      const targetConfig = cfg || config;
      const repositoryContext = await buildRepositoryOperationContext({ config: targetConfig, plan, state, prNumber: pr.number, adapter: this });
      if (!repositoryContext.ok) return repositoryContext;
      const prepared = prepareExactHeadFinalGateWorktree({ config: targetConfig, pr, expectedHead: expectedHead || pr.headRefOid, runner: run, repositoryContext: repositoryContext.context });
      if (!prepared.ok) return prepared;
      const gate = await collectFinalGateEvidence({ config: targetConfig, plan, state, pr, runner: run, adapter: this, repositoryContext: repositoryContext.context });
      if (!gate.ok) return gate;
      if (expectedHead && gate.evidence?.exactHead !== expectedHead) return fail("merge_entry_gate_head_mismatch", "merge-entry gate evidence is not bound to the expected head");
      return bindMergeEntryEvidence(gate.evidence);
    },
    async mergePr({ config: cfg, plan = null, state, pr, expectedHead }) {
      const targetConfig = cfg || config;
      const mergeEntry = await this.validateMergeEntryGateEvidence({ config: targetConfig, plan, state, pr, expectedHead });
      if (!mergeEntry.ok) return mergeEntry;
      const gateEvidence = mergeEntry.evidence;
      const repositoryContext = await buildRepositoryOperationContext({ config: targetConfig, plan, state, prNumber: pr.number, adapter: this });
      if (!repositoryContext.ok) return repositoryContext;
      const inspection = await this.inspectPr({ config: targetConfig, plan, state, prNumber: pr.number, repositoryContext: repositoryContext.context });
      if (!inspection?.ok) return waitOrFail(inspection, "merge_pr_inspection_failed");
      if (inspection.headRefOid && inspection.headRefOid !== expectedHead) {
        return fail("merge_pr_head_stale", `PR #${pr.number} head changed before merge`);
      }
      const changedFiles = normalizeChangedFiles(gateEvidence.changedFiles || inspection.changedFiles || pr.changedFiles || []);
      const allowedPathProofValid = allowedPathProofMatchesGate(gateEvidence, changedFiles, expectedHead);
      const expectedBase = gateEvidence.baseSha || gateEvidence.expectedOriginMainSha || null;
      if (!validSha(expectedBase)) return fail("final_gate_base_missing", "final gate evidence must be bound to origin/main");
      const baseRefresh = fetchAndReadOriginMain({ config: targetConfig, runner: run, reasonPrefix: "merge_base" });
      if (!baseRefresh.ok) return baseRefresh;
      if (baseRefresh.currentOriginMainSha !== expectedBase) {
        return fail("merge_base_advanced_requires_final_gate_refresh", `origin/main moved from ${expectedBase} to ${baseRefresh.currentOriginMainSha}`);
      }
      const reviewEvidence = finalGateReviewEvidenceForMerge(gateEvidence, {
        expectedHead,
        expectedBase,
        changedFiles,
      });
      if (!reviewEvidence.ok) return reviewEvidence;
      const worktreeProof = readMergeWorktreeCleanProof({ config: targetConfig, expectedHead, runner: run });
      if (!worktreeProof.ok) return worktreeProof;
      const laneDecision = gateEvidence.laneDecision || {
        lane: "workflow-docs-tooling",
        canonicalLane: "workflow-docs-tooling",
        branchStrategy: "normal",
        validationProfile: "runner-tests",
        reviewerTier: "strong_independent",
        allowedToImplement: true,
        autoMergeEligible: true,
        manualMergeRequired: false,
        contract: { autoMergeEligible: true, manualMergeRequired: false },
        laneManifest: { decisionType: "runnable", autoMergeAllowed: true },
        allowedPaths: ["tools/auto-runner/**", "docs/workflow/AUTONOMOUS_CODEX_RUNNER.md", "docs/planning/**"],
      };
      const context = {
        config: targetConfig,
        issue: gateEvidence.issue || { number: pr.issueNumber || 921, state: "OPEN", labels: [] },
        issueLabels: gateEvidence.issueLabels || [],
        pr: { ...pr, ...(inspection.pr || {}), state: "OPEN", isDraft: false, baseRefName: "main", headRefOid: expectedHead, repositoryProof: repositoryContext.context },
        laneDecision,
        branchName: pr.headRefName,
        expectedHeadSha: expectedHead,
        actualHeadSha: expectedHead,
        runnerCreatedCommitSha: expectedHead,
        expectedOriginMainSha: expectedBase,
        currentOriginMainSha: gateEvidence.currentOriginMainSha || gateEvidence.baseSha || null,
        changedFiles,
        forbiddenChangedFiles: gateEvidence.forbiddenChangedFiles || [],
        changedFilesExactlyMatchAllowedPaths: allowedPathProofValid,
        worktreeClean: worktreeProof.clean === true,
        worktreeCleanProof: worktreeProof,
        requiredChecks: gateEvidence.requiredChecks || inspection.requiredChecks || [],
        reviewThreads: gateEvidence.reviewThreads || inspection.reviewThreads || [],
        codeScanningAlerts: gateEvidence.codeScanningAlerts || inspection.codeScanningAlerts || [],
        blockingMarkers: gateEvidence.blockingMarkers || inspection.blockingMarkers || [],
        validation: gateEvidence.validation || {},
        externalReview: reviewEvidence.strongIndependent,
        externalReviewRequired: true,
        review: reviewEvidence.codex,
        codexMechanicsReviewApproved: reviewEvidence.codexMechanicsReviewApproved === true,
        issueLinkageEvidence: gateEvidence.issueLinkageEvidence || { available: true, linked: true, matchedSources: ["stack-plan"] },
        sessionLifecycle: state.sessionLifecycle || plan?.sessionLifecycle || null,
      };
      const mergeRunner = repositoryBoundGhRunner(run, repositoryContext.context);
      const result = executeAutoMergeMergeOnly(targetConfig, context, { runner: mergeRunner, inspectState: () => ({ pr: inspection.pr, requiredChecks: inspection.requiredChecks, reviewThreads: inspection.reviewThreads, codeScanningAlerts: inspection.codeScanningAlerts, blockingMarkers: inspection.blockingMarkers || [] }) });
      return result.result === "merged" || result.result === "dry_run_eligible"
        ? { ok: true, merged: result.result === "merged", mergeSha: result.mergeSha || null, result }
        : fail(result.reason || "merge_blocked", result.reason || "merge blocked");
    },
    async restoreSourceBranchAfterMerge({ config: cfg, pr, expectedHead }) {
      return restoreStackSourceBranchIfDeleted({ config: cfg || config, pr, expectedHead, runner: run });
    },
    async fetchCurrentMain({ config: cfg, state, pr }) {
      return fetchCurrentMainProof({ config: cfg || config, state, pr, runner: run });
    },
    async retargetPrBase({ pr, newBase, expectedHead, expectedCurrentBase, operationIntent = null, repositoryContext = null }) {
      const repo = repositoryContext?.argvRepository || config.repositorySlug || "tommytang213/Settleora";
      const proof = readPrRetargetProof({ config, pr, expectedHead, expectedCurrentBase, runner: run, repositoryContext });
      if (!proof.ok) return proof;
      const effect = { prNumber: pr.number, expectedHead, expectedCurrentBase, newBase, operationIntentDigest: canonicalGithubEvidenceDigest(operationIntent || {}) };
      const result = operationIntent?.sessionLifecycle
        ? executeCanonicalGithubEffectSync(config, operationIntent.sessionLifecycle, { effectType: "pr_retarget", prNumber: pr.number, headSha: expectedHead, baseBranch: expectedCurrentBase, effect }, {
            readLive: (intent) => {
              const live = readPrRetargetProof({ config, pr: { ...pr, baseRefName: newBase }, expectedHead, expectedCurrentBase: newBase, runner: run, repositoryContext });
              if (live.ok) return { complete: true, present: true, identity: intent.identity, effect };
              const absent = readPrRetargetProof({ config, pr, expectedHead, expectedCurrentBase, runner: run, repositoryContext });
              return absent.ok ? { complete: true, present: false } : { complete: false };
            },
            execute: () => {
              const mutation = run("gh", ["pr", "edit", String(pr.number), "--repo", repo, "--base", String(newBase)], { cwd: config.repoRoot });
              if (mutation.status !== 0 || mutation.error) throw new Error("Canonical PR retarget did not confirm success");
              return { ok: true, status: mutation.status };
            },
          })
        : run("gh", ["pr", "edit", String(pr.number), "--repo", repo, "--base", String(newBase)], { cwd: config.repoRoot });
      if ((operationIntent?.sessionLifecycle && !result.ok) || (!operationIntent?.sessionLifecycle && (result.status !== 0 || result.error))) return fail("retarget_failed", operationIntent?.sessionLifecycle ? result.reasonCode : boundedText(result.stderr || result.error || result.stdout));
      const after = readPrRetargetProof({ config, pr: { ...pr, baseRefName: newBase }, expectedHead, expectedCurrentBase: newBase, runner: run, repositoryContext });
      if (!after.ok) return after;
      return { ok: true, prNumber: pr.number, newBase, expectedHead, expectedCurrentBase, before: proof.proof, after: after.proof };
    },
    async proveSemanticOwnDelta({ pr }) {
      const current = readCurrentPrOwnDelta({ config, pr, runner: run });
      if (!current.ok) return current;
      return { ok: true, before: pr.ownDelta, after: current.ownDelta };
    },
    async markReadyForReview({ pr, expectedHead, operationIntent = null, repositoryContext = null }) {
      const repo = repositoryContext?.argvRepository || config.repositorySlug || "tommytang213/Settleora";
      const before = readPrReadyProof({ config, pr, expectedHead, expectedDraft: true, runner: run, repositoryContext });
      if (!before.ok) return before;
      const effect = { prNumber: pr.number, expectedHead, expectedDraftBefore: true, expectedDraftAfter: false, operationIntentDigest: canonicalGithubEvidenceDigest(operationIntent || {}) };
      const result = operationIntent?.sessionLifecycle
        ? executeCanonicalGithubEffectSync(config, operationIntent.sessionLifecycle, { effectType: "pr_ready", prNumber: pr.number, headSha: expectedHead, effect }, {
            readLive: (intent) => {
              const live = readPrReadyProof({ config, pr: { ...pr, isDraft: false }, expectedHead, expectedDraft: false, runner: run, repositoryContext });
              if (live.ok) return { complete: true, present: true, identity: intent.identity, effect };
              const absent = readPrReadyProof({ config, pr, expectedHead, expectedDraft: true, runner: run, repositoryContext });
              return absent.ok ? { complete: true, present: false } : { complete: false };
            },
            execute: () => {
              const mutation = run("gh", ["pr", "ready", String(pr.number), "--repo", repo], { cwd: config.repoRoot });
              if (mutation.status !== 0 || mutation.error) throw new Error("Canonical PR ready transition did not confirm success");
              return { ok: true, status: mutation.status };
            },
          })
        : run("gh", ["pr", "ready", String(pr.number), "--repo", repo], { cwd: config.repoRoot });
      if ((operationIntent?.sessionLifecycle && !result.ok) || (!operationIntent?.sessionLifecycle && (result.status !== 0 || result.error))) return fail("ready_failed", operationIntent?.sessionLifecycle ? result.reasonCode : boundedText(result.stderr || result.error || result.stdout));
      const after = readPrReadyProof({ config, pr: { ...pr, isDraft: false }, expectedHead, expectedDraft: false, runner: run, repositoryContext });
      if (!after.ok) return after;
      return { ok: true, prNumber: pr.number, expectedHead, before: before.proof, after: after.proof };
    },
    async updatePrStatusEvidence() {
      return { ok: true, reason: "status_update_not_required" };
    },
    async reconcilePendingPushIntent({ config: cfg, state, pr, livePr }) {
      return reconcileTaskScopedPendingPushIntent({ config: cfg || config, state, pr, livePr, runner: run });
    },
    async runFinalHygiene({ config: cfg, plan, state }) {
      const targetConfig = cfg || config;
      if (!runner) return fail("final_hygiene_runner_missing", "production final hygiene requires the injected live runner");
      if (run === defaultRunner) return fail("final_hygiene_default_runner_refused", "production final hygiene cannot use the default runner");
      if (targetConfig.dryRun === true) return fail("final_hygiene_dry_run_cannot_complete_stack", "dry-run final hygiene cannot persist production stack completion");
      const repositoryContext = await buildRepositoryOperationContext({ config: targetConfig, plan, state, prNumber: plan.issueNumber || 921, adapter: this });
      if (!repositoryContext.ok) return repositoryContext;
      const liveMergeProof = await proveFreshLiveMergedStackState({ config: targetConfig, plan, state, adapter: this, repositoryContext: repositoryContext.context });
      if (!liveMergeProof.ok) return liveMergeProof;
      const finalPr = plan.orderedPrs.at(-1);
      const mergeProof = state.evidence?.merged?.[finalPr.number] || {};
      const completedPrs = plan.orderedPrs.map((stackPr) => ({
        number: stackPr.number,
        headRefName: stackPr.headRefName,
        headRefOid: stackPr.headRefOid,
        mergeSha: state.evidence?.merged?.[stackPr.number]?.mergeSha || state.evidence?.merged?.[stackPr.number]?.result?.mergeSha || null,
        sourceBranchRestoration: state.evidence?.merged?.[stackPr.number]?.sourceBranchRestoration || state.evidence?.merged?.[stackPr.number]?.result?.sourceBranchRestoration || null,
      }));
      if (completedPrs.some((completed) => !completed.number || !validSha(completed.headRefOid) || !validSha(completed.mergeSha))) {
        return fail("final_hygiene_merged_pr_proof_incomplete", "final hygiene requires complete merged PR identity and merge SHA proof");
      }
      if (completedPrs.some((completed) => !sourceBranchRestorationConfirmed(completed.sourceBranchRestoration, { branchName: completed.headRefName, headSha: completed.headRefOid }))) {
        return fail("final_hygiene_source_branch_restoration_unconfirmed", "final hygiene requires confirmed source branch restoration for every merged PR");
      }
      const hygieneRunner = createFinalHygieneRunner(run, repositoryContext.context);
      const result = completeMergedIssueHygiene(targetConfig, {
        stackId: plan.stackId,
        taskKey: targetConfig.taskKey || state.taskKey || null,
        runId: targetConfig.runId || state.runId || null,
        supervisorRunId: targetConfig.supervisorRunId || state.supervisorRunId || null,
        repositoryContext: repositoryContext.context,
        repositoryOperationProof: { ...repositoryContext.context, liveMergeProof },
        worktreePath: repositoryContext.context.worktreePath,
        completedPrs,
        parentIssue: plan.parentIssueNumber || plan.parentIssue || 800,
        hygieneMarkers: state.evidence?.hygiene?.[plan.stackId] || null,
        mutationMarkers: state.mutationMarkers || {},
        logsRoot: targetConfig.logsRoot || null,
        dryRun: false,
        issue: { number: plan.issueNumber || 921, state: "OPEN", labels: [] },
        pr: finalPr,
        mergeSha: mergeProof.mergeSha || mergeProof.result?.mergeSha || null,
        sourceHeadSha: finalPr.headRefOid,
        closeRuleSatisfied: false,
        remainingGates: ["#921 remains open until live acceptance is verified"],
      }, { runner: hygieneRunner });
      const validation = validateFinalHygieneResult(result, hygieneRunner.commandEvidence);
      if (!validation.ok) return validation;
      return { ok: true, result: { ...validation.result, liveMergeProof } };
    },
  };
}

function createProductionBatchFixAdapters(config = {}, options = {}) {
  const runner = options.runner || defaultRunner;
  const codexPromptRunner = options.runCodexPrompt || runCodexPrompt;
  const cwd = config.repoRoot || process.cwd();
  return {
    async runCodexBatchFix({ fixTask, pr, exactHead, sessionLifecycle = null }) {
      const loopState = loadOrCreateLocalCandidateLoopState({ config, pr, exactHead });
      if (!loopState.ok) return loopState;
      const promptDigest = digestJson(fixTask?.prompt || "");
      const allowedPathsDigest = digestStringSet(normalizeChangedFiles(fixTask?.allowedPaths || []));
      const findingDigest = digestStringSet(normalizeChangedFiles(fixTask?.findingFingerprints || []));
      const exactRecoveryState = loopState.state.phase === "outer_fix_reserved"
        && loopState.state.outerFixPromptDigest === promptDigest
        && loopState.state.outerFixAllowedPathsDigest === allowedPathsDigest
        && loopState.state.outerFixFindingDigest === findingDigest
        ? loopState.state
        : null;
      const proof = proveTargetBatchFixWorktree({ config, pr, runner, recoveryState: exactRecoveryState });
      if (!proof.ok) return proof;
      if (proof.localCandidateHead && proof.localCandidateHead !== proof.expectedHead) {
        return { ok: true, skippedCodex: true, reason: "existing_unpushed_local_candidate", targetWorktreeProof: proof };
      }
      if (proof.dirtyRecoveryAuthorized) {
        return { ok: true, skippedCodex: true, reason: "outer_fix_reserved_dirty_recovery", targetWorktreeProof: proof };
      }
      persistLocalCandidateLoopState(loopState.statePath, {
        ...loopState.state,
        phase: "outer_fix_reserved",
        reservedParentHead: exactHead,
        outerFixPromptDigest: promptDigest,
        outerFixAllowedPathsDigest: allowedPathsDigest,
        outerFixFindingDigest: findingDigest,
      });
      const promptPath = path.join(
        config.logsRoot || "/workspace/logs/settleora-auto-runner",
        "review-fix",
        `${Date.now()}-pr-${pr?.number || "unknown"}-stack-batch-fix-prompt.md`,
      );
      mkdirSync(path.dirname(promptPath), { recursive: true, mode: 0o700 });
      writeFileSync(promptPath, `${fixTask?.prompt || ""}\n`, { mode: 0o600 });
      if (config.sessionLifecycle?.enabled === true && !sessionLifecycle) {
        return fail("existing_pr_batch_fix_lifecycle_missing", "PR-stack batch fix requires persisted session lifecycle authority");
      }
      const lifecycleInvocation = sessionLifecycle
        ? {
            state: sessionLifecycle,
            newSessionId: `${sessionLifecycle.logicalTask.runId}:pr-stack-batch-fix:${sessionLifecycle.sessions.generation + 1}:${randomUUID()}`,
            phase: "existing-pr-stack-batch-fix",
            telemetry: {},
            mutationJournaled: true,
          }
        : null;
      const codex = codexPromptRunner(
        { ...config, repoRoot: proof.worktreePath },
        {
          branchName: pr?.headRefName || pr?.branch || "unknown",
          prompt: fixTask?.prompt || "",
          promptPath,
          ...(lifecycleInvocation ? { sessionLifecycle: lifecycleInvocation } : {}),
        },
        "existing-pr-stack-batch-fix",
      );
      if (!codex.skipped && (codex.error || codex.status !== 0)) {
        return fail("existing_pr_batch_fix_codex_failed", codex.error || codex.tail || "Codex batch fix failed");
      }
      return { ok: true, codex, promptPath, sessionLifecycle: codex.sessionLifecycle?.state || sessionLifecycle };
    },
    async listChangedFiles({ exactHead, allowJournaledDirty = false }) {
      const head = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_batch_fix_head_unreadable" });
      if (!head.ok) throw new Error(head.reason);
      if (exactHead && head.sha !== exactHead) {
        const committed = runner("git", ["diff", "--name-only", `${exactHead}..HEAD`], { cwd });
        if (committed.status !== 0 || committed.error) throw new Error(`git diff exactHead..HEAD failed: ${boundedText(committed.stderr || committed.error || committed.stdout)}`);
        const dirty = readWorktreeCleanProof({ runner, cwd });
        if (!dirty.ok) throw new Error("existing local candidate worktree status is unreadable");
        if (dirty.clean !== true && !allowJournaledDirty) throw new Error("existing local candidate has additional dirty changes");
        if (dirty.clean !== true) {
          const unstaged = runner("git", ["diff", "--name-only"], { cwd });
          const staged = runner("git", ["diff", "--cached", "--name-only"], { cwd });
          const untracked = runner("git", ["ls-files", "--others", "--exclude-standard"], { cwd });
          if (unstaged.status !== 0 || unstaged.error || staged.status !== 0 || staged.error || untracked.status !== 0 || untracked.error) throw new Error("journal-authorized inner fix file set is unreadable");
          return normalizeChangedFiles(`${committed.stdout || ""}\n${unstaged.stdout || ""}\n${staged.stdout || ""}\n${untracked.stdout || ""}`.split(/\r?\n/));
        }
        return normalizeChangedFiles(committed.stdout.split(/\r?\n/));
      }
      const diff = runner("git", ["diff", "--name-only"], { cwd });
      if (diff.status !== 0 || diff.error) throw new Error(`git diff failed: ${boundedText(diff.stderr || diff.error || diff.stdout)}`);
      const staged = runner("git", ["diff", "--cached", "--name-only"], { cwd });
      if (staged.status !== 0 || staged.error) throw new Error(`git diff --cached failed: ${boundedText(staged.stderr || staged.error || staged.stdout)}`);
      const untracked = runner("git", ["ls-files", "--others", "--exclude-standard"], { cwd });
      if (untracked.status !== 0 || untracked.error) throw new Error(`git ls-files failed: ${boundedText(untracked.stderr || untracked.error || untracked.stdout)}`);
      return normalizeChangedFiles(`${diff.stdout || ""}\n${staged.stdout || ""}\n${untracked.stdout || ""}`.split(/\r?\n/));
    },
    async validateAndReview({ exactHead, changedFiles, laneDecision, pr, findingFingerprints, fingerprintDigest, sourceCycleBudget = null, localLoop = null }) {
      const loopState = loadOrCreateLocalCandidateLoopState({ config, pr, exactHead, localLoop });
      if (!loopState.ok) return loopState;
      if (loopState.state.phase === "source_fix_applied") {
        const appliedIdentity = collectAppliedSourceFixFiles({ runner, cwd, candidateHead: loopState.state.candidateHead });
        if (!appliedIdentity.ok) return appliedIdentity;
        if (appliedIdentity.currentHead !== loopState.state.appliedHead) return fail("existing_pr_local_loop_applied_head_mismatch", "journal-authorized source-fix head changed after application");
        if (appliedIdentity.identityDigest !== loopState.state.appliedChangedFilesDigest) return fail("existing_pr_local_loop_applied_files_mismatch", "journal-authorized source-fix files changed after application");
      }
      if (["findings_frozen", "source_fix_reserved"].includes(loopState.state.phase)) {
        const resumedFix = applyFrozenLocalFindingBatch({ config, runner, codexPromptRunner, cwd, pr, statePath: loopState.statePath, state: loopState.state });
        if (!resumedFix.ok) return resumedFix;
        const cumulative = await this.listChangedFiles({ exactHead, allowJournaledDirty: resumedFix.state.phase === "source_fix_applied" });
        return this.validateAndReview({ exactHead, changedFiles: cumulative, laneDecision, pr, findingFingerprints, fingerprintDigest, sourceCycleBudget, localLoop: resumedFix.state });
      }
      const preCommitHead = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_local_loop_precommit_head_unreadable" });
      if (!preCommitHead.ok) return preCommitHead;
      const preCommitClean = readWorktreeCleanProof({ runner, cwd });
      if (!preCommitClean.ok) return preCommitClean;
      if (preCommitHead.sha === exactHead || !preCommitClean.clean) {
        const dirtyFiles = runner("git", ["diff", "--name-only"], { cwd });
        const stagedFiles = runner("git", ["diff", "--cached", "--name-only"], { cwd });
        const untrackedFiles = runner("git", ["ls-files", "--others", "--exclude-standard"], { cwd });
        if (dirtyFiles.status !== 0 || dirtyFiles.error || stagedFiles.status !== 0 || stagedFiles.error || untrackedFiles.status !== 0 || untrackedFiles.error) return fail("existing_pr_local_loop_precommit_files_unreadable", "pre-commit reservation could not bind the dirty/staged/untracked file set");
        const reservedCommitFiles = normalizeChangedFiles(`${dirtyFiles.stdout || ""}\n${stagedFiles.stdout || ""}\n${untrackedFiles.stdout || ""}`.split(/\r?\n/));
        if (reservedCommitFiles.length === 0) return fail("existing_pr_local_loop_precommit_files_missing", "pre-commit reservation requires source changes");
        const reservedWorktreeIdentity = collectCumulativeCandidateContentIdentity({ runner, cwd, parentHead: preCommitHead.sha });
        if (!reservedWorktreeIdentity.ok) return reservedWorktreeIdentity;
        loopState.state = persistLocalCandidateLoopState(loopState.statePath, {
          ...loopState.state,
          phase: "commit_reserved",
          reservedParentHead: preCommitHead.sha,
          reservedChangedFilesDigest: digestStringSet(reservedCommitFiles),
          reservedWorktreeIdentityDigest: reservedWorktreeIdentity.identityDigest,
          reservedCommitMessage: "Auto-runner stack review-fix batch",
        });
      }
      if (loopState.state.phase === "commit_reserved") {
        const reservedIdentity = collectCumulativeCandidateContentIdentity({ runner, cwd, parentHead: loopState.state.reservedParentHead });
        if (!reservedIdentity.ok || reservedIdentity.identityDigest !== loopState.state.reservedWorktreeIdentityDigest) return fail("existing_pr_local_loop_precommit_identity_mismatch", "pre-commit source identity changed after reservation");
      }
      const candidate = createOrReuseLocalCandidateCommit({
        config,
        runner,
        cwd,
        exactHead,
        changedFiles,
        message: "Auto-runner stack review-fix batch",
        localLoopState: loopState.state,
      });
      if (!candidate.ok) return candidate;
      loopState.state = persistLocalCandidateLoopState(loopState.statePath, {
        ...loopState.state,
        phase: loopState.state.phase === "source_fix_applied" ? "evidence_invalidated" : "candidate_prepared",
        candidateHead: candidate.newHead,
        candidateTree: candidate.tree,
        candidateCommitChainDigest: candidate.commitChainDigest,
      });
      const baseFetch = runner("git", ["fetch", "origin", pr?.baseRefName || pr?.base || "main"], { cwd });
      if (baseFetch.status !== 0 || baseFetch.error) return fail("existing_pr_batch_fix_base_fetch_failed", boundedText(baseFetch.stderr || baseFetch.error || baseFetch.stdout));
      const live = readLivePrProof({ config, pr, expectedHead: exactHead, runner });
      if (!live.ok) return live;
      const base = readGitSha({ runner, cwd, ref: `origin/${live.proof.baseRefName}`, reasonCode: "existing_pr_batch_fix_base_unreadable" });
      if (!base.ok) return base;
      const fullCandidatePrDelta = buildCanonicalCandidatePrDelta({
        config,
        runner,
        cwd,
        pr: { ...pr, ...(live.proof || {}) },
        baseSha: base.sha,
        candidate,
        repositoryIdentity: live.repositoryIdentity,
        laneDecision,
      });
      if (!fullCandidatePrDelta.ok) return fullCandidatePrDelta;
      const candidateDigest = fullCandidatePrDelta.delta.normalizedPatchDigest;
      const history = advanceLocalCandidateHistory(loopState.state.candidateHistory, candidate.newHead, candidateDigest);
      if (!history.ok) return history;
      if (history.changed) {
        loopState.state = persistLocalCandidateLoopState(loopState.statePath, {
          ...loopState.state,
          candidateHistory: history.candidateHistory,
        });
      }
      if (!fullCandidatePrDelta.delta.allowedPathResult?.ok) {
        return fail("full_candidate_delta_allowed_path_failed", `full candidate delta changed forbidden paths: ${fullCandidatePrDelta.delta.allowedPathResult.rejectedPaths.join(",")}`, { fullCandidatePrDelta: fullCandidatePrDelta.delta });
      }
      const reviewChangedFiles = fullCandidatePrDelta.delta.changedFiles;
      const targetConfig = { ...config, repoRoot: cwd };
      const preWorktreeProof = readExactFinalGateWorktreeProof({
        config: targetConfig,
        pr,
        expectedHead: candidate.newHead,
        expectedBranch: pr.headRefName || pr.branch,
        expectedRepository: config.repositorySlug,
        runner,
        proofType: "source_candidate_pre_validation_review",
      });
      if (!preWorktreeProof.ok) return preWorktreeProof;
      const validationPlan = planValidation(reviewChangedFiles, laneDecision || { validationProfile: "runner-tests" });
      const validation = {
        ...bindValidationEvidence(runValidationPlan(targetConfig, validationPlan), {
        headSha: candidate.newHead,
        baseSha: base.sha,
        changedFiles: reviewChangedFiles,
        profile: laneDecision?.validationProfile || validationPlan.profile,
        }),
        rawDiffDigest: fullCandidatePrDelta.delta.rawDiffSha256,
        packageDigest: fullCandidatePrDelta.delta.normalizedPatchDigest,
        fullCandidatePrDelta: fullCandidatePrDelta.delta,
      };
      if (!validation.passed) return fail("existing_pr_batch_fix_validation_failed", "batch fix validation failed", { validation });
      if (typeof options.runStrongReview !== "function" || typeof options.runCodexReview !== "function") {
        return fail("existing_pr_batch_fix_review_adapter_unconfigured", "strong and Codex review adapters are required before push");
      }
      persistLocalCandidateLoopState(loopState.statePath, { ...loopState.state, phase: "gemini_running", candidateHead: candidate.newHead, candidateDigest: fullCandidatePrDelta.delta.normalizedPatchDigest });
      const externalReview = await options.runStrongReview({ config: targetConfig, pr, changedFiles: reviewChangedFiles, fixDeltaFiles: changedFiles, fullCandidatePrDelta: fullCandidatePrDelta.delta, validation, headSha: candidate.newHead, baseSha: base.sha });
      const fullDeltaExternalReview = { ...externalReview, fullCandidatePrDelta: externalReview?.fullCandidatePrDelta || fullCandidatePrDelta.delta };
      persistLocalCandidateLoopState(loopState.statePath, { ...loopState.state, phase: "codex_running", candidateHead: candidate.newHead, candidateDigest: fullCandidatePrDelta.delta.normalizedPatchDigest });
      const review = await options.runCodexReview({ config: targetConfig, pr, changedFiles: reviewChangedFiles, fixDeltaFiles: changedFiles, fullCandidatePrDelta: fullCandidatePrDelta.delta, validation, externalReview: fullDeltaExternalReview, headSha: candidate.newHead, baseSha: base.sha });
      const verdict = review?.verdict?.verdict || review?.verdict;
      const fullDeltaCodexReview = { ...review, fullCandidatePrDelta: review?.fullCandidatePrDelta || fullCandidatePrDelta.delta };
      if (externalReview?.status !== "pass" || verdict !== "approve") {
        const frozen = freezeMaterialFindingInventory(reviewFindingsFromSupportedContainers({ externalReview, review }));
        if (frozen.length === 0) {
          return fail(externalReview?.status !== "pass" ? "existing_pr_batch_fix_strong_review_failed" : "existing_pr_batch_fix_codex_review_failed", externalReview?.reason || review?.reviewFailureReason || "local reviewer did not pass and supplied no safe actionable finding");
        }
        if (frozen.some((finding) => finding.classification !== "material_safely_fixable")) {
          return fail("existing_pr_local_loop_manual_or_unsafe", "local reviewer returned a manual, unsafe, or contradictory finding batch");
        }
        const forbiddenLocalFindingPaths = filterForbiddenChangedFiles(frozen.map((finding) => finding.path).filter(Boolean), laneDecision || {});
        if (forbiddenLocalFindingPaths.length > 0) return fail("existing_pr_local_loop_out_of_contract", "local finding batch is outside the lane contract", { forbiddenFindingPaths: forbiddenLocalFindingPaths });
        const findingDigest = digestStringSet(frozen.map((finding) => finding.fingerprint));
        if ((loopState.state.findingDigests || []).includes(findingDigest)) return fail("existing_pr_local_loop_no_progress", "identical local finding batch repeated without convergence");
        const localRound = Number(loopState.state.localRound || 0) + 1;
        const allowance = evaluateLocalFixAllowance({ config, sourceCycleBudget, localRound });
        if (!allowance.ok) return allowance;
        const localFixTask = buildBatchFixTask({ issue: { number: pr?.issueNumber || 921 }, branchName: pr?.headRefName || pr?.branch, laneDecision, inventory: frozen });
        const frozenState = persistLocalCandidateLoopState(loopState.statePath, {
          ...loopState.state,
          phase: "findings_frozen",
          candidateHead: candidate.newHead,
          candidateDigest: fullCandidatePrDelta.delta.normalizedPatchDigest,
          localRound,
          frozenFindingDigest: findingDigest,
          frozenFindings: frozen,
          frozenFixPrompt: localFixTask.prompt,
          findingDigests: [...(loopState.state.findingDigests || []), findingDigest],
          evidenceInvalidated: true,
        });
        const resumedFix = applyFrozenLocalFindingBatch({ config, runner, codexPromptRunner, cwd, pr, statePath: loopState.statePath, state: frozenState });
        if (!resumedFix.ok) return resumedFix;
        const cumulative = await this.listChangedFiles({ exactHead, allowJournaledDirty: resumedFix.state.phase === "source_fix_applied" });
        return this.validateAndReview({ exactHead, changedFiles: cumulative, laneDecision, pr, findingFingerprints, fingerprintDigest, sourceCycleBudget, localLoop: resumedFix.state });
      }
      const postWorktreeProof = readExactFinalGateWorktreeProof({
        config: targetConfig,
        pr,
        expectedHead: candidate.newHead,
        expectedBranch: pr.headRefName || pr.branch,
        expectedRepository: config.repositorySlug,
        runner,
        proofType: "source_candidate_post_validation_review",
      });
      if (!postWorktreeProof.ok) return postWorktreeProof;
      const stable = compareExactWorktreeProofs(preWorktreeProof, postWorktreeProof);
      if (!stable.ok) return stable;
      const provenValidation = {
        ...validation,
        treeSha: preWorktreeProof.treeSha,
        canonicalWorktreePath: preWorktreeProof.worktreePath,
        preWorktreeProof: preWorktreeProof.proof,
        postWorktreeProof: postWorktreeProof.proof,
        preWorktreeProofDigest: preWorktreeProof.proofDigest,
        postWorktreeProofDigest: postWorktreeProof.proofDigest,
        fixDeltaFiles: changedFiles,
        fixDeltaFilesDigest: digestStringSet(changedFiles),
        fullCandidatePrDelta: fullCandidatePrDelta.delta,
      };
      const validationCheck = validateValidationEvidenceObject(provenValidation, {
        expectedHead: candidate.newHead,
        expectedBase: base.sha,
        changedFiles: reviewChangedFiles,
        expectedCandidateDelta: fullCandidatePrDelta.delta,
        requireWorktreeProof: true,
      });
      if (!validationCheck.ok) return validationCheck;
      const strongCheck = validateReviewEvidenceObject(fullDeltaExternalReview, {
        name: "existing_pr_batch_fix_strong_review",
        expectedHead: candidate.newHead,
        expectedBase: base.sha,
        changedFiles: reviewChangedFiles,
        expectedCandidateDelta: fullCandidatePrDelta.delta,
        requireIndependent: true,
      });
      if (!strongCheck.ok) return strongCheck;
      const codexCheck = validateReviewEvidenceObject(fullDeltaCodexReview, {
        name: "existing_pr_batch_fix_codex_review",
        expectedHead: candidate.newHead,
        expectedBase: base.sha,
        changedFiles: reviewChangedFiles,
        expectedCandidateDelta: fullCandidatePrDelta.delta,
        requireIndependent: false,
      });
      if (!codexCheck.ok) return codexCheck;
      return {
        ok: true,
        validation: validationCheck.validation,
        externalReview: strongCheck.review,
        review: codexCheck.review,
        localCandidate: candidate,
        fixDelta: {
          changedFiles,
          changedFilesDigest: digestStringSet(changedFiles),
          oldHead: exactHead,
          candidateHead: candidate.newHead,
          findingFingerprints,
          fingerprintDigest,
        },
        fullCandidatePrDelta: fullCandidatePrDelta.delta,
        sourceIdentity: {
          oldHead: exactHead,
          headSha: candidate.newHead,
          newHead: candidate.newHead,
          parent: candidate.parent,
          tree: candidate.tree,
          commitChain: candidate.commitChain,
          commitChainDigest: candidate.commitChainDigest,
          baseSha: base.sha,
          changedFilesDigest: fullCandidatePrDelta.delta.fileSetDigest,
          fullCandidatePrDelta: fullCandidatePrDelta.delta,
          fixDeltaFiles: changedFiles,
          fixDeltaFilesDigest: digestStringSet(changedFiles),
          findingFingerprints,
          fingerprintDigest,
          localSourceChangingRoundsConsumed: Math.max(1, Number(loopState.state.localRound || 0) + 1),
        },
        localLoopState: persistLocalCandidateLoopState(loopState.statePath, { ...loopState.state, phase: "local_convergence_passed", candidateHead: candidate.newHead, localRound: Number(loopState.state.localRound || 0) }),
      };
    },
    async commitAndPush({ exactHead, changedFiles, fixDelta = null, reviewed, pr, fingerprintDigest, markerKey, sourceCycleBudget = null, plan = null, sourceCycleOperationContext = null, reviewConvergenceState = null }) {
      const newHead = reviewed?.localCandidate?.newHead || reviewed?.sourceIdentity?.newHead || null;
      if (!validSha(newHead)) return fail("existing_pr_batch_fix_new_head_unreadable", "validated local candidate head is missing");
      const branch = pr?.headRefName || pr?.branch || "";
      const operationContext = validateSourceCycleOperationContext({
        config,
        plan,
        context: sourceCycleOperationContext,
        pr,
        exactHead,
        newHead,
        changedFiles,
        fingerprintDigest,
        reviewed,
        sourceCycleBudget,
      });
      if (!operationContext.ok) return operationContext;
      const live = readLivePrProof({ config, pr, expectedHead: exactHead, runner });
      if (!live.ok) return live;
      const targetValidation = validatePushTargetBranch({
        branch,
        liveHeadRefName: live.proof.headRefName,
        baseRefName: live.proof.baseRefName,
        defaultBranch: "main",
      });
      if (!targetValidation.ok) return targetValidation;
      const local = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_batch_fix_candidate_head_unreadable" });
      if (!local.ok || local.sha !== newHead) return fail("existing_pr_batch_fix_candidate_head_mismatch", "validated local candidate is not checked out");
      const clean = readWorktreeCleanProof({ runner, cwd });
      if (!clean.ok || clean.clean !== true) return fail("existing_pr_batch_fix_candidate_worktree_dirty", "candidate worktree must be clean before push", { worktree: clean });
      const reservation = persistSourceCycleReservation({
        config,
        state: operationContext.state,
        pr,
        budget: sourceCycleBudget,
        oldHead: exactHead,
        newHead,
        changedFiles,
        fixDelta,
        fingerprintDigest,
        reviewed,
        liveProof: live.proof,
        repositoryIdentity: live.repositoryIdentity,
      });
      if (!reservation.ok) return reservation;
      const intent = persistPushIntent({
        config,
        markerKey,
        pr,
        branch,
        oldHead: exactHead,
        newHead,
        changedFiles,
        fixDelta,
        fingerprintDigest,
        reviewed,
        pushTarget: `origin ${newHead}:${branch}`,
        liveProof: live.proof,
        repositoryIdentity: live.repositoryIdentity,
        sourceCycleReservation: reservation.reservation,
        reviewConvergenceState,
      });
      const reconciledIntent = reconcilePushIntent({ config, pr, intent, runner });
      if (reconciledIntent.ok && reconciledIntent.finalized === true) {
        return { ok: true, newHead, sourceIdentity: { ...(reviewed?.sourceIdentity || {}), newHead, sourceCycleReservation: reconciledIntent.sourceCycleReservation }, pushedAt: reconciledIntent.confirmedAt, pushIntent: intent, pushConfirmation: reconciledIntent, sourceCycleReservation: reconciledIntent.sourceCycleReservation };
      }
      if (!reconciledIntent.ok && !["push_intent_not_completed", "push_intent_unpushed_candidate"].includes(reconciledIntent.reasonCode)) return reconciledIntent;
      const push = runner("git", ["push", "origin", `${newHead}:${branch}`], { cwd });
      if (push.status !== 0 || push.error) return fail("existing_pr_batch_fix_push_failed", boundedText(push.stderr || push.error || push.stdout));
      const confirmation = reconcilePushIntent({ config, pr, intent, runner, requireCandidate: true });
      if (!confirmation.ok) return confirmation;
      return { ok: true, newHead, sourceIdentity: { ...(reviewed?.sourceIdentity || {}), newHead, sourceCycleReservation: confirmation.sourceCycleReservation }, pushedAt: confirmation.confirmedAt, pushIntent: intent, pushConfirmation: confirmation, sourceCycleReservation: confirmation.sourceCycleReservation };
    },
    async persistMutationMarker() {},
  };
}

function transitionState(state, patch = {}) {
  const summaries = patch.summary ? [...(state.summaries || []), sanitizeState(patch.summary)].slice(-50) : state.summaries || [];
  return sanitizeState({
    ...state,
    currentPhase: patch.phase || state.currentPhase,
    currentAction: patch.currentAction ?? state.currentAction ?? null,
    activePrNumber: patch.activePrNumber ?? state.activePrNumber,
    evidence: patch.evidence || state.evidence,
    mutationMarkers: patch.mutationMarkers || state.mutationMarkers,
    sourceCycleReservations: patch.sourceCycleReservations || state.sourceCycleReservations || {},
    sourceCycles: patch.sourceCycles || state.sourceCycles,
    sourceCycleEpoch: patch.sourceCycleEpoch || state.sourceCycleEpoch,
    exactHeads: patch.exactHeads || state.exactHeads,
    orderedPrs: patch.orderedPrs || state.orderedPrs,
    terminal: patch.terminal === undefined ? state.terminal : patch.terminal,
    wait: patch.wait === undefined ? state.wait : patch.wait,
    summaries,
  });
}

function stopPrStackLifecycle(config, state, reasonCode) {
  if (config.sessionLifecycle?.enabled !== true || !state.sessionLifecycle) return { ok: true, state };
  const pendingIntents = pendingPrStackCanonicalIntents(config, state);
  if (!pendingIntents.ok || pendingIntents.intents.length > 0) return { ok: true, state };
  const stopped = transitionSessionLifecyclePhase(config, state.sessionLifecycle, { phase: "stopped", nextExactAction: reasonCode || "blocked" });
  if (!stopped.ok) return stopped;
  return { ok: true, state: sanitizeState({ ...state, sessionLifecycle: stopped.state }) };
}

function pendingPrStackCanonicalIntents(config, state) {
  if (config.sessionLifecycle?.enabled !== true || !state.sessionLifecycle) return { ok: true, intents: [] };
  const lifecycle = state.sessionLifecycle;
  try {
    const intents = findPreEffectIntents(config, (intent) => intent.repository === lifecycle.repository
      && intent.runId === lifecycle.logicalTask?.runId
      && intent.claimIdentity === lifecycle.logicalTask?.claimIdentity
      && !["finalized", "failed_closed"].includes(intent.status));
    return { ok: true, intents };
  } catch {
    return { ok: false, reasonCode: "stack_canonical_intent_inventory_unavailable", reason: "canonical effect intent inventory could not be proven terminal", intents: [] };
  }
}

function shouldContinueStackDispatch({ adapter, dispatchCount }) {
  return adapter?.capabilities?.stackDispatchLoop === true && dispatchCount > 0;
}

function stackDispatchLimit({ stackConfig = {}, plan = {}, adapter = null } = {}) {
  if (adapter?.capabilities?.stackDispatchLoop !== true) return 1;
  const configured = normalizePositiveInt(stackConfig.maxDispatchActions, null);
  if (configured) return configured;
  const prCount = Array.isArray(plan.orderedPrs) ? plan.orderedPrs.length : 4;
  return Math.max(8, prCount * 12);
}

function stackDispatchProgressDigest(state = {}) {
  return digestJson({
    activePrNumber: state.activePrNumber ?? null,
    evidence: state.evidence || {},
    mutationMarkers: state.mutationMarkers || {},
    sourceCycles: state.sourceCycles || {},
    sourceCycleReservations: state.sourceCycleReservations || {},
    exactHeads: state.exactHeads || {},
    orderedPrs: state.orderedPrs || [],
    terminal: state.terminal || null,
    wait: state.wait || null,
  });
}

async function buildRepositoryOperationContext({ config = {}, plan = null, state = null, prNumber = null, adapter = null } = {}) {
  const configuredRepositorySlug = canonicalRepositorySlug(config.repositorySlug || plan?.repository || state?.repository || "tommytang213/Settleora");
  if (!configuredRepositorySlug) return fail("configured_repository_invalid", "configured repository slug must be owner/name");
  const repoRoot = path.resolve(config.repoRoot || process.cwd());
  const protectedRoot = path.resolve(config.protectedRoot || "/workspace/repos/Settleora");
  if (repoRoot === protectedRoot) return fail("repository_operation_protected_root_refused", "stack repository operations cannot use the protected root");
  let worktreePath = repoRoot;
  if (typeof adapter?.readRepositoryOperationContext === "function") {
    const adapterProof = await adapter.readRepositoryOperationContext({ config, plan, state, prNumber, configuredRepositorySlug, repoRoot });
    if (!adapterProof?.ok) return adapterProof;
    worktreePath = path.resolve(adapterProof.worktreePath || repoRoot);
    if (worktreePath !== repoRoot) return fail("repository_operation_root_mismatch", "adapter repository root does not match configured repoRoot");
    if (adapterProof.originRepositorySlug && canonicalRepositorySlug(adapterProof.originRepositorySlug) !== configuredRepositorySlug) {
      return fail("origin_repository_mismatch", "origin repository does not match configured repository");
    }
    return {
      ok: true,
      context: sanitizeState({
        schemaVersion: 1,
        configuredRepositorySlug,
        repoRoot,
        worktreePath,
        originRepositorySlug: adapterProof.originRepositorySlug || configuredRepositorySlug,
        expectedHost: "github.com",
        repositoryId: adapterProof.repositoryId || null,
        prNumber,
        sameRepositoryRequired: true,
        argvRepository: configuredRepositorySlug,
        proof: adapterProof.proof || null,
        createdAt: new Date().toISOString(),
      }),
    };
  }
  return {
    ok: true,
    context: sanitizeState({
      schemaVersion: 1,
      configuredRepositorySlug,
      repoRoot,
      worktreePath,
      originRepositorySlug: configuredRepositorySlug,
      expectedHost: "github.com",
      repositoryId: null,
      prNumber,
      sameRepositoryRequired: true,
      argvRepository: configuredRepositorySlug,
      createdAt: new Date().toISOString(),
    }),
  };
}

async function prepareStackMutationIntent({ config = {}, plan = null, state = {}, pr = {}, adapter = null, operationType, expectedPreState, intendedPostState, operationEvidence = null } = {}) {
  const repositoryContext = await buildRepositoryOperationContext({ config, plan, state, prNumber: pr.number, adapter });
  if (!repositoryContext.ok) return repositoryContext;
  const discovered = discoverStackOperationRecords({ config, plan, state, pr, operationType, expectedPreState, intendedPostState, repositoryContext: repositoryContext.context, operationEvidence });
  if (!discovered.ok) return discovered;
  const intent = discovered.intent || persistStackOperationIntent({ config, plan, state, pr, operationType, expectedPreState, intendedPostState, repositoryContext: repositoryContext.context, operationEvidence });
  if (!intent.ok) return intent;
  if (adapter.capabilities?.repositoryBoundOperations !== true || typeof adapter.inspectPr !== "function") {
    return { ok: true, intent: intent.intent, repositoryContext: repositoryContext.context, observedComplete: false, inspectionSkipped: "adapter_without_repository_bound_inspectPr" };
  }
  const live = await adapter.inspectPr({ config, plan, state, prNumber: pr.number, repositoryContext: repositoryContext.context });
  if (!live?.ok) return waitOrFail(live, "stack_mutation_reconcile_pr_read_failed");
  const classification = classifyStackMutationState({ operationType, intent: intent.intent, live });
  if (!classification.ok) return classification;
  if (classification.state === "already_finalized") return { ok: true, intent: intent.intent, repositoryContext: repositoryContext.context, observedComplete: true };
  if (classification.state === "post_state_exact") {
    const observed = await markStackOperationObservedComplete({ config, intent: intent.intent, result: { ok: true, recovered: true, after: classification.proof, pr: live.pr || null } });
    if (!observed.ok) return observed;
    return { ok: true, intent: observed.intent, repositoryContext: repositoryContext.context, observedComplete: true };
  }
  if (classification.state === "pre_state_exact") return { ok: true, intent: intent.intent, repositoryContext: repositoryContext.context, observedComplete: false };
  return fail("stack_mutation_state_conflict", "live PR state did not match exact mutation pre-state or post-state");
}

function stackOperationRoot(config = {}) {
  return path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "stack-operation-intents");
}

function persistStackOperationIntent({ config = {}, plan = null, state = {}, pr = {}, operationType, expectedPreState, intendedPostState, repositoryContext, operationEvidence = null } = {}) {
  const operationId = digestJson({
    repository: repositoryContext.configuredRepositorySlug,
    stackId: plan?.stackId || state.stackId,
    prNumber: pr.number,
    operationType,
    head: pr.headRefOid,
    expectedPreState,
    intendedPostState,
  });
  const root = stackOperationRoot(config);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const intentPath = path.join(root, `${operationId}.json`);
  const intent = sanitizeState({
    schemaVersion: 1,
    operationId,
    status: "mutation_intent",
    repository: repositoryContext.configuredRepositorySlug,
    configuredRepositorySlug: repositoryContext.configuredRepositorySlug,
    originRepositorySlug: repositoryContext.originRepositorySlug,
    repositoryId: repositoryContext.repositoryId || null,
    stackId: plan?.stackId || state.stackId || null,
    prNumber: pr.number,
    operationType,
    taskKey: config.taskKey || null,
    runId: config.runId || null,
    supervisorRunId: config.supervisorRunId || null,
    sessionLifecycle: state.sessionLifecycle || null,
    expectedPreState,
    intendedPostState,
    operationEvidence: operationEvidence ? sanitizeState(operationEvidence) : null,
    repositoryContext,
    priorMutationMarkerDigest: digestJson(state.mutationMarkers || {}),
    priorEvidenceDigest: digestJson(state.evidence || {}),
    createdAt: new Date().toISOString(),
    intentPath,
  });
  const tmp = `${intentPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(intent, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, intentPath);
  const readBack = readStackOperationIntent(intentPath);
  if (!readBack.ok) return readBack;
  const validation = validateStackOperationIntent({ config, plan, state, pr, intent: readBack.intent, operationType, expectedPreState, intendedPostState, repositoryContext, operationEvidence });
  if (!validation.ok) return validation;
  return { ok: true, intent: readBack.intent };
}

function readStackOperationIntent(intentPath) {
  try {
    return { ok: true, intent: JSON.parse(readFileSync(intentPath, "utf8")) };
  } catch {
    return fail("stack_operation_intent_malformed", "stack operation intent could not be read back");
  }
}

function discoverStackOperationRecords({ config = {}, plan = null, state = {}, pr = {}, operationType, expectedPreState, intendedPostState, repositoryContext, operationEvidence = null } = {}) {
  const root = stackOperationRoot(config);
  if (!existsSync(root)) return { ok: true, intent: null };
  const matches = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(root, entry.name);
    const loaded = readStackOperationIntent(filePath);
    if (!loaded.ok) return loaded;
    const intent = { ...loaded.intent, intentPath: loaded.intent.intentPath || filePath };
    if (!["mutation_intent", "mutation_observed_complete", "mutation_evidence_finalized"].includes(String(intent.status || ""))) {
      return fail("stack_operation_intent_status_unknown", "stack operation intent status is not recoverable");
    }
    const validation = validateStackOperationIntent({ config, plan, state, pr, intent, operationType, expectedPreState, intendedPostState, repositoryContext, operationEvidence });
    if (validation.ok) matches.push(intent);
    else if (sameStackOperationEnvelope({ intent, pr, operationType })) return validation;
  }
  if (matches.length > 1) return fail("stack_operation_intent_ambiguous", "multiple matching stack operation intents exist");
  return { ok: true, intent: matches[0] || null };
}

function sameStackOperationEnvelope({ intent = {}, pr = {}, operationType } = {}) {
  return intent.prNumber === pr.number && intent.operationType === operationType && intent.expectedPreState?.headRefOid === pr.headRefOid;
}

function validateStackOperationIntent({ config = {}, plan = null, state = {}, pr = {}, intent = {}, operationType, expectedPreState, intendedPostState, repositoryContext, operationEvidence = null } = {}) {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return fail("stack_operation_intent_malformed", "stack operation intent must be an object");
  const configuredRepositorySlug = canonicalRepositorySlug(config.repositorySlug || plan?.repository || state.repository || "tommytang213/Settleora");
  if (intent.schemaVersion !== 1) return fail("stack_operation_intent_malformed", "stack operation intent schema is unsupported");
  if (intent.repository !== configuredRepositorySlug || canonicalRepositorySlug(intent.configuredRepositorySlug) !== configuredRepositorySlug) return fail("stack_operation_repository_mismatch", "stack operation intent repository does not match");
  if (canonicalRepositorySlug(intent.originRepositorySlug) !== configuredRepositorySlug) return fail("stack_operation_origin_mismatch", "stack operation intent origin does not match");
  if (plan?.stackId && intent.stackId !== plan.stackId) return fail("stack_operation_stack_mismatch", "stack operation intent stack ID does not match");
  if (intent.prNumber !== pr.number || intent.operationType !== operationType) return fail("stack_operation_intent_mismatch", "stack operation intent action identity does not match");
  if (digestJson(intent.expectedPreState) !== digestJson(expectedPreState) || digestJson(intent.intendedPostState) !== digestJson(intendedPostState)) return fail("stack_operation_state_mismatch", "stack operation intent pre/post state does not match");
  if (intent.repositoryContext?.argvRepository !== repositoryContext.argvRepository) return fail("stack_operation_repository_context_mismatch", "stack operation repository argv proof does not match");
  if (operationType === "merge_pr" && operationEvidence) {
    if (!intent.operationEvidence) return fail("stack_operation_gate_evidence_missing", "merge operation intent is missing gate evidence bindings");
    if (digestJson(intent.operationEvidence) !== digestJson(operationEvidence)) return fail("stack_operation_gate_evidence_mismatch", "merge operation intent gate evidence binding does not match current proof");
  }
  if (config.taskKey !== undefined && intent.taskKey !== (config.taskKey || null)) return fail("stack_operation_task_mismatch", "stack operation task key does not match");
  if (config.runId !== undefined && intent.runId !== (config.runId || null)) return fail("stack_operation_run_mismatch", "stack operation run ID does not match");
  if (config.supervisorRunId !== undefined && intent.supervisorRunId !== (config.supervisorRunId || null)) return fail("stack_operation_supervisor_mismatch", "stack operation supervisor run ID does not match");
  return { ok: true };
}

async function markStackOperationObservedComplete({ config = {}, intent = {}, result = {} } = {}) {
  const updated = sanitizeState({ ...intent, status: "mutation_observed_complete", observedResult: boundedProof(result), observedAt: new Date().toISOString() });
  return writeStackOperationIntent(config, updated);
}

async function finalizeStackOperationEvidence({ config = {}, intent = {}, result = {} } = {}) {
  const updated = sanitizeState({ ...intent, status: "mutation_evidence_finalized", finalizedResult: boundedProof(result), evidenceFinalizedAt: new Date().toISOString() });
  return writeStackOperationIntent(config, updated);
}

function writeStackOperationIntent(_config = {}, intent = {}) {
  const intentPath = intent.intentPath || path.join(stackOperationRoot(_config), `${intent.operationId}.json`);
  mkdirSync(path.dirname(intentPath), { recursive: true, mode: 0o700 });
  const tmp = `${intentPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(intent, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, intentPath);
  const readBack = readStackOperationIntent(intentPath);
  if (!readBack.ok) return readBack;
  return { ok: true, intent: readBack.intent };
}

async function finalizeObservedStackMutation({ config = {}, plan = null, state = {}, pr = {}, adapter = null, intent = {} } = {}) {
  const live = await adapter.inspectPr({ config, plan, state, prNumber: pr.number, repositoryContext: intent.repositoryContext });
  if (!live?.ok) return waitOrFail(live, "stack_mutation_observed_read_failed");
  const classification = classifyStackMutationState({ operationType: intent.operationType, intent, live });
  if (!classification.ok || !["post_state_exact", "already_finalized"].includes(classification.state)) {
    return fail("stack_mutation_observed_state_conflict", "completed mutation no longer matches intended post-state");
  }
  if (intent.operationType === "merge_pr") {
    const proof = typeof adapter.proveMergedPr === "function"
      ? await adapter.proveMergedPr({ config, plan, state, pr, intent, live })
      : defaultMergedPrProof({ pr, live, intent });
    if (!proof.ok) return proof;
    return { ok: true, intent, result: proof };
  }
  return {
    ok: true,
    intent,
    result: { ok: true, recovered: true, before: intent.expectedPreState, after: classification.proof, repositoryContext: intent.repositoryContext },
  };
}

function classifyStackMutationState({ operationType, intent = {}, live = {} } = {}) {
  if (intent.status === "mutation_evidence_finalized") return { ok: true, state: "already_finalized", proof: intent.finalizedResult || intent.observedResult || {} };
  const pr = { ...(intent.expectedPreState || {}), ...(live.pr || live), number: (live.pr || live).number ?? intent.prNumber };
  const proof = normalizeLivePrState(pr);
  if (!proof.ok) return proof;
  const pre = intent.expectedPreState || {};
  const post = intent.intendedPostState || {};
  if (operationType === "merge_pr" && proof.state === "MERGED") return { ok: true, state: "post_state_exact", proof };
  if (prStatesMatch(proof, post)) return { ok: true, state: "post_state_exact", proof };
  if (prStatesMatch(proof, pre)) return { ok: true, state: "pre_state_exact", proof };
  return fail("stack_mutation_state_conflict", "live PR state differs from mutation pre/post state", { proof, pre, post });
}

function normalizeLivePrState(pr = {}) {
  const proof = {
    number: Number(pr.number),
    state: pr.state || null,
    isDraft: Boolean(pr.isDraft),
    baseRefName: pr.baseRefName || null,
    headRefName: pr.headRefName || null,
    headRefOid: pr.headRefOid || null,
    baseRepositorySlug: canonicalRepositorySlug(pr.baseRepositorySlug || pr.baseRepository?.nameWithOwner || pr.baseRepository?.full_name || null),
    headRepositorySlug: canonicalRepositorySlug(pr.headRepositorySlug || pr.headRepository?.nameWithOwner || pr.headRepository?.full_name || null),
    isCrossRepository: pr.isCrossRepository === true,
    mergeCommitOid: pr.mergeCommit?.oid || pr.mergeCommitOid || pr.mergeSha || null,
    mergedAt: pr.mergedAt || null,
  };
  if (!Number.isInteger(proof.number)) return fail("stack_pr_number_invalid", "live PR number is invalid");
  return { ok: true, ...proof };
}

function prStatesMatch(actual = {}, expected = {}) {
  for (const [key, value] of Object.entries(expected || {})) {
    if (value === undefined || value === null) continue;
    if (key.endsWith("RepositorySlug")) {
      if (canonicalRepositorySlug(actual[key]) !== canonicalRepositorySlug(value)) return false;
    } else if (actual[key] !== value) {
      return false;
    }
  }
  return true;
}

function expectedRetargetPreState({ pr }) {
  return mutationPrState({ pr, baseRefName: pr.baseRefName, isDraft: Boolean(pr.isDraft), state: "OPEN" });
}

function intendedRetargetPostState({ pr, newBase }) {
  return mutationPrState({ pr, baseRefName: newBase, isDraft: Boolean(pr.isDraft), state: "OPEN" });
}

function expectedReadyPreState({ pr }) {
  return mutationPrState({ pr, baseRefName: pr.baseRefName, isDraft: true, state: "OPEN" });
}

function intendedReadyPostState({ pr }) {
  return mutationPrState({ pr, baseRefName: pr.baseRefName, isDraft: false, state: "OPEN" });
}

function expectedMergePreState({ pr, expectedHead }) {
  return mutationPrState({ pr: { ...pr, headRefOid: expectedHead }, baseRefName: pr.baseRefName, isDraft: false, state: "OPEN" });
}

function intendedMergePostState({ pr, expectedHead }) {
  return mutationPrState({ pr: { ...pr, headRefOid: expectedHead }, baseRefName: pr.baseRefName, isDraft: false, state: "MERGED" });
}

function mutationPrState({ pr, baseRefName, isDraft, state }) {
  return sanitizeState({
    number: pr.number,
    state,
    isDraft,
    baseRefName,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    baseRepositorySlug: pr.baseRepositorySlug || null,
    headRepositorySlug: pr.headRepositorySlug || null,
    isCrossRepository: false,
  });
}

function defaultMergedPrProof({ pr, live, intent }) {
  const proof = normalizeLivePrState(live.pr || live);
  if (!proof.ok) return proof;
  if (proof.headRefOid !== intent.expectedPreState?.headRefOid) return fail("merge_source_head_mismatch", "merged PR head does not match mutation intent");
  if (proof.baseRefName !== intent.expectedPreState?.baseRefName) return fail("merge_base_repository_mismatch", "merged PR base does not match mutation intent");
  const mergeSha = proof.mergeCommitOid || live.mergeSha || null;
  if (!validSha(mergeSha)) return fail("merge_sha_missing", "merged PR proof is missing a merge commit SHA");
  return { ok: true, merged: true, recovered: true, prNumber: pr.number, mergeSha, sourceHeadSha: proof.headRefOid, before: intent.expectedPreState, after: proof, repositoryContext: intent.repositoryContext };
}

async function ensurePostMergeSourceBranchRestored({ config = {}, plan = null, state = {}, pr = {}, adapter = null, expectedHead = null, mergeResult = {}, intent = {} } = {}) {
  const existing = mergeResult?.sourceBranchRestoration || mergeResult?.result?.sourceBranchRestoration || null;
  if (sourceBranchRestorationConfirmed(existing, { branchName: pr.headRefName, headSha: expectedHead })) return { ok: true, restoration: existing };
  if (typeof adapter?.restoreSourceBranchAfterMerge !== "function") {
    return fail("merge_source_branch_restoration_unverified", "source branch restoration must be confirmed before merge evidence is completed", { sourceBranchRestoration: existing || null });
  }
  const restored = await adapter.restoreSourceBranchAfterMerge({ config, plan, state, pr, expectedHead, intent, mergeResult });
  if (!sourceBranchRestorationConfirmed(restored, { branchName: pr.headRefName, headSha: expectedHead })) {
    return fail(
      restored?.reasonCode || "merge_source_branch_restoration_unconfirmed",
      restored?.reason || "source branch restoration was not confirmed after merge",
      { sourceBranchRestoration: restored || existing || null },
    );
  }
  return { ok: true, restoration: restored };
}

function sourceBranchRestorationConfirmed(restoration = null, { branchName = null, headSha = null } = {}) {
  if (!restoration || typeof restoration !== "object") return false;
  if (restoration.ok === false) return false;
  if (restoration.confirmed !== true || restoration.branchExists !== true) return false;
  if (branchName && restoration.branchName !== branchName) return false;
  if (headSha && restoration.headSha !== headSha) return false;
  return true;
}

function restoreStackSourceBranchIfDeleted({ config = {}, pr = {}, expectedHead = null, runner } = {}) {
  const branchName = pr.headRefName || pr.branch || null;
  const headSha = expectedHead || pr.headRefOid || null;
  if (!safeSourceBranchTarget(branchName, { baseRefName: pr.baseRefName, defaultBranch: "main" }) || !validSha(headSha)) {
    return fail("merge_source_branch_restore_identity_invalid", "source branch restoration requires a safe branch and exact head");
  }
  const before = readRemoteBranchHead({ config, branchName, runner });
  if (!before.ok) return before;
  if (before.exists) {
    if (before.headSha !== headSha) return fail("merge_source_branch_head_mismatch", "source branch exists at an unexpected head", { branchName, expectedHead: headSha, actualHead: before.headSha });
    return { ok: true, planned: false, executed: false, confirmed: true, branchExists: true, reason: "source_branch_exists", branchName, headSha };
  }
  const push = runner("git", ["push", "origin", `${headSha}:refs/heads/${branchName}`], { cwd: config.repoRoot });
  if (push.status !== 0 || push.error) {
    return fail("merge_source_branch_restore_push_failed", "source branch restoration push failed", { branchName, headSha, status: push.status, stderr: boundedProof(push.stderr || push.error || "") });
  }
  const after = readRemoteBranchHead({ config, branchName, runner });
  if (!after.ok) return after;
  if (!after.exists) return fail("merge_source_branch_restore_unconfirmed", "source branch restoration did not appear on remote", { branchName, headSha });
  if (after.headSha !== headSha) return fail("merge_source_branch_head_mismatch", "source branch restored at an unexpected head", { branchName, expectedHead: headSha, actualHead: after.headSha });
  return { ok: true, planned: true, executed: true, confirmed: true, branchExists: true, branchName, headSha };
}

function readRemoteBranchHead({ config = {}, branchName, runner } = {}) {
  const fullRef = `refs/heads/${branchName}`;
  const remote = runner("git", ["ls-remote", "--heads", "origin", fullRef], { cwd: config.repoRoot });
  if (remote.status !== 0 || remote.error) {
    return fail("merge_source_branch_read_failed", "source branch remote read failed", { branchName, status: remote.status, stderr: boundedProof(remote.stderr || remote.error || "") });
  }
  const line = String(remote.stdout || "").trim().split(/\r?\n/).find((candidate) => {
    const [, refName] = candidate.trim().split(/\s+/);
    return refName === fullRef;
  });
  if (!line) return { ok: true, exists: false, branchName, headSha: null };
  const [headSha, refName] = line.trim().split(/\s+/);
  if (refName !== fullRef) return fail("merge_source_branch_read_invalid", "source branch remote read returned an unexpected ref", { branchName });
  if (!validSha(headSha)) return fail("merge_source_branch_read_invalid", "source branch remote read returned an invalid head", { branchName });
  return { ok: true, exists: true, branchName, headSha };
}

function evaluateSourceCycleBudget({ config = {}, state = null, pr = {}, findings = [] } = {}) {
  const prNumber = pr?.number;
  if (!Number.isInteger(prNumber)) return fail("source_cycle_state_pr_invalid", "source-cycle budget requires a valid PR number");
  const hasDurableState = state && typeof state === "object" && !Array.isArray(state);
  const sourceCycles = hasDurableState ? state.sourceCycles || {} : { [prNumber]: 0 };
  if (hasDurableState && !Object.prototype.hasOwnProperty.call(sourceCycles, prNumber)) {
    return fail("source_cycle_state_missing", "durable source-cycle state is missing for the active PR");
  }
  const convergenceState = state?.evidence?.reviewConvergenceState?.[prNumber] || null;
  if (!Number.isInteger(sourceCycles[prNumber]) || sourceCycles[prNumber] < 0) {
    return fail("source_cycle_state_malformed", "durable source-cycle compatibility projection is malformed");
  }
  const materialFindings = Array.isArray(findings) ? findings.filter((finding) => finding && finding.material !== false) : [];
  const frozenFingerprints = freezeMaterialFindingInventory(materialFindings).map((finding) => finding.fingerprint).sort();
  const findingDigest = createHash("sha256").update(frozenFingerprints.join("\n")).digest("hex");
  const epochAlreadyAdmitted = Object.values(convergenceState?.counterMarkers || {}).some((marker) => marker?.exactHead === pr?.headRefOid && marker?.findingDigest === findingDigest);
  const authoritativeLocal = convergenceState?.counterAuthority === "two_loop_v1"
    ? convergenceState.counters?.localSourceChangingRoundsPerEpoch
    : null;
  const initializingTwoLoopEpoch = !convergenceState && materialFindings.length > 0;
  const consumed = Number.isInteger(authoritativeLocal)
    ? materialFindings.length > 0 && !epochAlreadyAdmitted ? 0 : authoritativeLocal
    : initializingTwoLoopEpoch ? 0 : sourceCycles[prNumber];
  if (!Number.isInteger(consumed) || consumed < 0) {
    return fail("source_cycle_state_malformed", "durable source-cycle count is malformed");
  }
  const max = normalizeSourceCycleMax(config);
  if (!Number.isInteger(max) || max < 0) return fail("source_cycle_budget_malformed", "source-cycle maximum is malformed");
  const legacyEpoch = state?.sourceCycleEpoch?.[prNumber] || state?.sourceCycleEpoch || 1;
  const epoch = convergenceState?.counterAuthority === "two_loop_v1"
    ? Number(convergenceState.epoch || legacyEpoch) + (materialFindings.length > 0 && !epochAlreadyAdmitted ? 1 : 0)
    : initializingTwoLoopEpoch
      ? Number(legacyEpoch) + 1
      : legacyEpoch;
  if (!Number.isInteger(epoch) || epoch < 1) return fail("source_cycle_epoch_malformed", "durable source-cycle epoch is malformed");
  const remaining = Math.max(0, max - consumed);
  const summary = {
    prNumber,
    exactHead: pr?.headRefOid || null,
    epoch,
    consumed,
    max,
    remaining,
    materialFindingCount: materialFindings.length,
    counterAuthority: convergenceState?.counterAuthority === "two_loop_v1"
      ? "two_loop_v1"
      : initializingTwoLoopEpoch
        ? "two_loop_v1_initializing"
        : "legacy_compatibility",
    legacySourceCyclesProjection: sourceCycles[prNumber],
    legacySourceCyclesAuthoritative: false,
  };
  if (materialFindings.length > 0 && consumed >= max) {
    return fail("source_cycle_budget_exhausted", "durable per-PR source-cycle budget is exhausted", { summary, sourceCycleBudget: summary });
  }
  return { ok: true, ...summary, summary };
}

function createSourceCycleOperationContext({ config = {}, plan = null, state = null, pr = {}, sourceCycleBudget = null } = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return fail("source_cycle_operation_state_missing", "validated stack state is required before source-cycle reservation");
  const usesTwoLoopAuthority = state?.evidence?.reviewConvergenceState?.[pr?.number]?.counterAuthority === "two_loop_v1"
    || sourceCycleBudget?.counterAuthority === "two_loop_v1_initializing";
  const reservationState = usesTwoLoopAuthority
    ? {
        ...state,
        sourceCycles: { ...(state.sourceCycles || {}), [pr?.number]: sourceCycleBudget?.consumed },
        sourceCycleEpoch: typeof state.sourceCycleEpoch === "object"
          ? { ...state.sourceCycleEpoch, [pr?.number]: sourceCycleBudget?.epoch }
          : { [pr?.number]: sourceCycleBudget?.epoch },
      }
    : state;
  const stateValidation = validatePrStackState(reservationState, plan);
  if (!stateValidation.ok) return stateValidation;
  if (!sourceCycleBudget?.ok) return fail(sourceCycleBudget?.reasonCode || "source_cycle_reservation_budget_missing", sourceCycleBudget?.reason || "valid source-cycle budget is required before reservation");
  const prNumber = pr?.number;
  if (!Number.isInteger(prNumber)) return fail("source_cycle_state_pr_invalid", "source-cycle operation context requires a valid PR number");
  const configuredRepositorySlug = canonicalRepositorySlug(config.repositorySlug || "tommytang213/Settleora");
  if (state.repository !== configuredRepositorySlug) return fail("source_cycle_operation_repository_mismatch", "stack state repository does not match configured repository");
  const activePrNumber = state.activePrNumber ?? state.currentAction?.prNumber ?? prNumber;
  if (activePrNumber !== prNumber) return fail("source_cycle_operation_pr_mismatch", "source-cycle operation context is not bound to the active PR");
  const exactHead = state.exactHeads?.[prNumber] || state.orderedPrs?.find((entry) => entry.number === prNumber)?.headRefOid || null;
  if (exactHead !== pr.headRefOid) return fail("source_cycle_operation_head_mismatch", "stack state exact head does not match the PR old head");
  if (sourceCycleBudget.prNumber !== prNumber || sourceCycleBudget.exactHead !== pr.headRefOid) return fail("source_cycle_operation_budget_mismatch", "source-cycle budget is not bound to the active PR/head");
  const currentCount = reservationState.sourceCycles?.[prNumber];
  if (currentCount !== sourceCycleBudget.consumed) return fail("source_cycle_reservation_conflict", "source-cycle budget does not match durable state count");
  const epoch = reservationState?.sourceCycleEpoch?.[prNumber] || 1;
  if (epoch !== sourceCycleBudget.epoch) return fail("source_cycle_epoch_malformed", "source-cycle budget epoch does not match durable state");
  const context = sanitizeState({
    state: reservationState,
    stateDigest: digestJson(reservationState),
    stackId: state.stackId,
    repository: state.repository,
    activePrNumber,
    prNumber,
    sourceBranch: pr.headRefName,
    oldHead: pr.headRefOid,
    sourceCycleEpoch: sourceCycleBudget.epoch,
    consumedBefore: sourceCycleBudget.consumed,
    maxAtReservation: sourceCycleBudget.max,
    consumedAfter: sourceCycleBudget.consumed + 1,
    policyDigest: sourceCyclePolicyDigest(config, sourceCycleBudget.max),
    taskKey: config.taskKey || null,
    runId: config.runId || null,
    supervisorRunId: config.supervisorRunId || null,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, context };
}

function validateSourceCycleOperationContext({ config = {}, plan = null, context = null, pr = {}, exactHead = null, newHead = null, changedFiles = [], fingerprintDigest = null, reviewed = {}, sourceCycleBudget = null } = {}) {
  if (!context || typeof context !== "object" || Array.isArray(context)) return fail("source_cycle_operation_state_missing", "validated stack state context is required before source-cycle reservation");
  const state = context.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return fail("source_cycle_operation_state_missing", "validated stack state context is missing its durable state snapshot");
  const stateValidation = validatePrStackState(state, plan);
  if (!stateValidation.ok) return stateValidation;
  const configuredRepositorySlug = canonicalRepositorySlug(config.repositorySlug || "tommytang213/Settleora");
  if (context.repository !== configuredRepositorySlug || state.repository !== configuredRepositorySlug) return fail("source_cycle_operation_repository_mismatch", "source-cycle operation context repository does not match");
  if (plan && context.stackId !== plan.stackId) return fail("source_cycle_operation_stack_mismatch", "source-cycle operation context stack identity does not match");
  if (context.stateDigest !== digestJson(state)) return fail("source_cycle_operation_state_mismatch", "source-cycle operation context state digest does not match");
  if (context.prNumber !== pr?.number || context.activePrNumber !== pr?.number) return fail("source_cycle_operation_pr_mismatch", "source-cycle operation context PR does not match");
  if (context.sourceBranch !== pr?.headRefName) return fail("source_cycle_operation_branch_mismatch", "source-cycle operation context branch does not match");
  if (context.oldHead !== exactHead || state.exactHeads?.[pr.number] !== exactHead) return fail("source_cycle_operation_head_mismatch", "source-cycle operation context old head does not match durable state");
  if (!sourceCycleBudget?.ok) return fail(sourceCycleBudget?.reasonCode || "source_cycle_reservation_budget_missing", sourceCycleBudget?.reason || "valid source-cycle budget is required before reservation");
  if (
    context.sourceCycleEpoch !== sourceCycleBudget.epoch
    || context.consumedBefore !== sourceCycleBudget.consumed
    || context.maxAtReservation !== sourceCycleBudget.max
    || context.consumedAfter !== sourceCycleBudget.consumed + 1
    || state.sourceCycles?.[pr.number] !== sourceCycleBudget.consumed
  ) {
    return fail("source_cycle_operation_budget_mismatch", "source-cycle operation context budget does not match durable state");
  }
  if (context.policyDigest !== sourceCyclePolicyDigest(config, sourceCycleBudget.max)) return fail("source_cycle_reservation_policy_mismatch", "source-cycle operation context policy digest does not match");
  const sourceIdentity = reviewed?.sourceIdentity || {};
  const commitChain = validateCanonicalCommitChain(sourceIdentity.commitChain || [], {
    oldHead: exactHead,
    newHead,
    candidateParent: sourceIdentity.parent || null,
    reasonPrefix: "source_cycle_operation",
  });
  if (!commitChain.ok) return commitChain;
  if (sourceIdentity.commitChainDigest && sourceIdentity.commitChainDigest !== commitChain.digest) return fail("source_cycle_operation_chain_mismatch", "source-cycle operation context candidate chain digest does not match");
  if (!validSha(newHead) || (sourceIdentity.newHead || sourceIdentity.headSha) !== newHead) return fail("source_cycle_operation_candidate_mismatch", "source-cycle operation context candidate head does not match reviewed source identity");
  if (!validSha(sourceIdentity.tree)) return fail("source_cycle_operation_candidate_mismatch", "source-cycle operation context candidate tree is missing");
  const normalizedChangedFiles = normalizeChangedFiles(changedFiles);
  if (normalizedChangedFiles.length === 0 || sourceIdentity.changedFilesDigest !== digestStringSet(normalizedChangedFiles)) return fail("source_cycle_operation_files_mismatch", "source-cycle operation context changed-file digest does not match");
  const delta = validateCandidateDeltaEvidence(sourceIdentity.fullCandidatePrDelta || reviewed.fullCandidatePrDelta, {
    expectedHead: newHead,
    expectedBase: sourceIdentity.baseSha || reviewed.validation?.baseSha || reviewed.externalReview?.baseSha || reviewed.review?.baseSha || null,
    expectedTree: sourceIdentity.tree,
    changedFiles: normalizedChangedFiles,
    name: "source_cycle_operation_candidate_delta",
  });
  if (!delta.ok) return delta;
  if (fingerprintDigest && reviewed?.sourceIdentity?.fingerprintDigest && reviewed.sourceIdentity.fingerprintDigest !== fingerprintDigest) return fail("source_cycle_operation_finding_mismatch", "source-cycle operation context finding digest does not match");
  if (config.taskKey !== undefined && context.taskKey !== (config.taskKey || null)) return fail("source_cycle_operation_task_mismatch", "source-cycle operation context task key does not match");
  if (config.runId !== undefined && context.runId !== (config.runId || null)) return fail("source_cycle_operation_run_mismatch", "source-cycle operation context run ID does not match");
  if (config.supervisorRunId !== undefined && context.supervisorRunId !== (config.supervisorRunId || null)) return fail("source_cycle_operation_supervisor_mismatch", "source-cycle operation context supervisor run ID does not match");
  return { ok: true, state };
}

function sourceCyclePolicyDigest(config = {}, max = normalizeSourceCycleMax(config)) {
  return digestJson({
    repositorySlug: config.repositorySlug || "tommytang213/Settleora",
    maxSourceCyclesPerPr: max,
  });
}

function sourceCycleReservationRoot(config = {}) {
  return path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "source-cycle-reservations");
}

function persistSourceCycleReservation({ config = {}, state = {}, pr = {}, budget = null, oldHead, newHead, changedFiles = [], fixDelta = null, fingerprintDigest = null, reviewed = {}, liveProof = null, repositoryIdentity = null } = {}) {
  if (!budget?.ok) return fail(budget?.reasonCode || "source_cycle_reservation_budget_missing", budget?.reason || "valid source-cycle budget is required before reservation");
  const sourceIdentity = reviewed?.sourceIdentity || {};
  const maxAtReservation = budget.max;
  const consumedBefore = budget.consumed;
  const roundsConsumed = Math.max(1, Number(reviewed?.sourceIdentity?.localSourceChangingRoundsConsumed || 1));
  const consumedAfter = consumedBefore + roundsConsumed;
  if (consumedBefore >= maxAtReservation) return fail("source_cycle_budget_exhausted", "source-cycle reservation cannot be created after budget exhaustion", { sourceCycleBudget: budget.summary || budget });
  if (consumedAfter > maxAtReservation) return fail("source_cycle_reservation_over_budget", "source-cycle reservation would exceed the configured maximum");
  const epoch = budget.epoch;
  const commitChain = normalizeCommitChain(sourceIdentity.commitChain || [oldHead, sourceIdentity.parent, newHead]);
  const commitChainDigest = sourceIdentity.commitChainDigest || digestStringList(commitChain);
  const changedFilesDigest = digestStringSet(changedFiles);
  const reservationId = digestJson({
    repository: config.repositorySlug || "tommytang213/Settleora",
    prNumber: pr?.number,
    epoch,
    consumedAfter,
    oldHead,
    newHead,
    commitChainDigest,
    changedFilesDigest,
    fingerprintDigest,
  });
  const reservation = sanitizeState({
    status: "source_cycle_reserved",
    reservationId,
    repository: config.repositorySlug || "tommytang213/Settleora",
    configuredRepositorySlug: repositoryIdentity?.configuredRepositorySlug || sourceIdentity.configuredRepositorySlug || config.repositorySlug || "tommytang213/Settleora",
    baseRepositorySlug: repositoryIdentity?.baseRepositorySlug || liveProof?.baseRepositorySlug || sourceIdentity.baseRepositorySlug || null,
    headRepositorySlug: repositoryIdentity?.headRepositorySlug || liveProof?.headRepositorySlug || sourceIdentity.headRepositorySlug || null,
    originRepositorySlug: repositoryIdentity?.originRepositorySlug || liveProof?.originRepositorySlug || sourceIdentity.originRepositorySlug || null,
    repositoryIds: repositoryIdentity?.repositoryIds || sourceIdentity.repositoryIds || {},
    prNumber: pr?.number || null,
    sourceBranch: pr?.headRefName || pr?.branch || null,
    sourceCycleEpoch: epoch,
    policyDigest: sourceCyclePolicyDigest(config, maxAtReservation),
    maxAtReservation,
    consumedBefore,
    roundsConsumed,
    reservedOrdinal: consumedAfter,
    consumedAfter,
    remainingBefore: maxAtReservation - consumedBefore,
    oldHead,
    finalCandidateHead: newHead,
    candidateNewHead: newHead,
    candidateParent: sourceIdentity.parent || null,
    candidateTree: sourceIdentity.tree || null,
    commitChain,
    commitChainDigest,
    findingInventoryDigest: fingerprintDigest,
    findingFingerprints: sourceIdentity.findingFingerprints || reviewed?.findingFingerprints || [],
    changedFiles,
    changedFilesDigest,
    fixDelta: fixDelta || reviewed.fixDelta || null,
    fullCandidatePrDelta: reviewed.fullCandidatePrDelta || sourceIdentity.fullCandidatePrDelta || null,
    validationHead: reviewed?.validation?.headSha || null,
    strongReviewHead: reviewed?.externalReview?.reviewedHead || reviewed?.externalReview?.headSha || null,
    codexReviewHead: reviewed?.review?.reviewedHead || reviewed?.review?.headSha || null,
    validation: reviewed?.validation || null,
    externalReview: reviewed?.externalReview || null,
    review: reviewed?.review || null,
    taskKey: config.taskKey || null,
    runId: config.runId || null,
    supervisorRunId: config.supervisorRunId || null,
    createdAt: new Date().toISOString(),
    finalizedAt: null,
  });
  const reservationValidationState = budget.counterAuthority === "two_loop_v1_initializing"
    ? { ...state, sourceCycles: { ...(state.sourceCycles || {}), [pr.number]: budget.consumed }, sourceCycleEpoch: { ...(typeof state.sourceCycleEpoch === "object" ? state.sourceCycleEpoch : {}), [pr.number]: budget.epoch } }
    : state;
  const validation = validateSourceCycleReservation({ config, state: reservationValidationState, pr, reservation, oldHead, newHead, changedFiles, fingerprintDigest, expectStatus: "source_cycle_reserved", requireCurrentCount: true });
  if (!validation.ok) return validation;
  const root = sourceCycleReservationRoot(config);
  const reservationPath = path.join(root, `${reservationId}.json`);
  validateDurableArtifactPath(config, reservationPath);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  validateDurableArtifactPath(config, reservationPath);
  reservation.reservationPath = reservationPath;
  const duplicate = readSourceCycleReservationFile(reservationPath, config);
  if (duplicate.ok && duplicate.reservation?.reservationId !== reservationId) return fail("source_cycle_reservation_conflict", "reservation path already contains another reservation");
  const conflicts = findReservationOrdinalConflicts({ config, reservation });
  if (!conflicts.ok) return conflicts;
  const tmp = `${reservationPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(reservation, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, reservationPath);
  const readBack = readSourceCycleReservationFile(reservationPath, config);
  if (!readBack.ok) return readBack;
  const persisted = { ...readBack.reservation, reservationPath };
  const persistedValidation = validateSourceCycleReservation({ config, state: reservationValidationState, pr, reservation: persisted, oldHead, newHead, changedFiles, fingerprintDigest, expectStatus: "source_cycle_reserved", requireCurrentCount: true });
  if (!persistedValidation.ok) return persistedValidation;
  return { ok: true, reservation: persisted };
}

function readSourceCycleReservationFile(reservationPath, config = {}) {
  if (!reservationPath || !existsSync(reservationPath)) return fail("source_cycle_reservation_missing", "source-cycle reservation file is missing");
  try {
    return { ok: true, reservation: readOwnerOnlyDurableJson(config, reservationPath) };
  } catch {
    return fail("source_cycle_reservation_malformed", "source-cycle reservation JSON could not be parsed");
  }
}

function findReservationOrdinalConflicts({ config = {}, reservation = {} } = {}) {
  const root = sourceCycleReservationRoot(config);
  if (!existsSync(root)) return { ok: true };
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(root, entry.name);
    const loaded = readSourceCycleReservationFile(filePath, config);
    if (!loaded.ok) return loaded;
    const current = loaded.reservation || {};
    if (current.reservationId === reservation.reservationId) continue;
    if (
      current.repository === reservation.repository
      && current.prNumber === reservation.prNumber
      && current.sourceCycleEpoch === reservation.sourceCycleEpoch
      && current.consumedAfter === reservation.consumedAfter
      && ["source_cycle_reserved", "source_cycle_finalized"].includes(String(current.status || ""))
    ) {
      return fail("source_cycle_reservation_conflict", "another reservation already owns the PR epoch ordinal", { reservationPath: filePath });
    }
  }
  return { ok: true };
}

function validateSourceCycleReservation({ config = {}, state = {}, pr = {}, reservation = {}, oldHead = null, newHead = null, changedFiles = null, fingerprintDigest = null, expectStatus = null, requireCurrentCount = false } = {}) {
  if (!reservation || typeof reservation !== "object" || Array.isArray(reservation)) return fail("source_cycle_reservation_missing", "source-cycle reservation is required");
  if (expectStatus && reservation.status !== expectStatus) return fail("source_cycle_reservation_status_mismatch", "source-cycle reservation status does not match the required phase");
  const configuredRepositorySlug = canonicalRepositorySlug(config.repositorySlug || "tommytang213/Settleora");
  if (reservation.repository !== configuredRepositorySlug || canonicalRepositorySlug(reservation.configuredRepositorySlug) !== configuredRepositorySlug) return fail("source_cycle_reservation_repository_mismatch", "source-cycle reservation repository does not match");
  if (reservation.prNumber !== pr?.number) return fail("source_cycle_reservation_pr_mismatch", "source-cycle reservation PR number does not match");
  if (reservation.sourceBranch !== pr?.headRefName) return fail("source_cycle_reservation_branch_mismatch", "source-cycle reservation branch does not match");
  const expectedEpoch = state?.sourceCycleEpoch?.[pr.number] || state?.sourceCycleEpoch || 1;
  if (!Number.isInteger(reservation.sourceCycleEpoch) || reservation.sourceCycleEpoch !== expectedEpoch) return fail("source_cycle_reservation_epoch_mismatch", "source-cycle reservation epoch does not match");
  if (!Number.isInteger(reservation.maxAtReservation) || reservation.maxAtReservation < 0) return fail("source_cycle_reservation_malformed", "reservation max is malformed");
  if (reservation.policyDigest !== sourceCyclePolicyDigest(config, reservation.maxAtReservation)) return fail("source_cycle_reservation_policy_mismatch", "source-cycle reservation policy digest does not match");
  if (!Number.isInteger(reservation.consumedBefore) || reservation.consumedBefore < 0) return fail("source_cycle_reservation_malformed", "reservation consumed-before count is malformed");
  const roundsConsumed = reservation.roundsConsumed ?? 1;
  if (!Number.isInteger(roundsConsumed) || roundsConsumed < 1) return fail("source_cycle_reservation_malformed", "reservation source-changing round count is malformed");
  if (!Number.isInteger(reservation.consumedAfter) || reservation.consumedAfter !== reservation.consumedBefore + roundsConsumed) return fail("source_cycle_reservation_malformed", "reservation consumed-after count is malformed");
  if (reservation.reservedOrdinal !== reservation.consumedAfter) return fail("source_cycle_reservation_malformed", "reservation ordinal does not match consumed-after count");
  if (reservation.consumedBefore >= reservation.maxAtReservation || reservation.consumedAfter > reservation.maxAtReservation) return fail("source_cycle_reservation_over_budget", "source-cycle reservation exceeds the budget active at reservation time");
  if (requireCurrentCount && state?.sourceCycles?.[pr.number] !== reservation.consumedBefore) return fail("source_cycle_reservation_conflict", "durable source-cycle count no longer matches the reservation's consumed-before count");
  if (oldHead && reservation.oldHead !== oldHead) return fail("source_cycle_reservation_old_head_mismatch", "reservation old head does not match");
  const expectedNewHead = newHead || reservation.finalCandidateHead || reservation.candidateNewHead;
  if (expectedNewHead && (reservation.finalCandidateHead !== expectedNewHead || reservation.candidateNewHead !== expectedNewHead)) return fail("source_cycle_reservation_candidate_mismatch", "reservation candidate head does not match");
  if (!validSha(reservation.candidateTree)) return fail("source_cycle_reservation_candidate_mismatch", "reservation candidate tree is missing");
  const commitChain = validateCanonicalCommitChain(reservation.commitChain || [], {
    oldHead: reservation.oldHead,
    newHead: reservation.finalCandidateHead,
    candidateParent: reservation.candidateParent,
    reasonPrefix: "source_cycle_reservation",
  });
  if (!commitChain.ok) return commitChain;
  if (reservation.commitChainDigest !== commitChain.digest) return fail("source_cycle_reservation_chain_mismatch", "reservation commit-chain digest does not match");
  const normalizedFiles = normalizeChangedFiles(changedFiles || reservation.changedFiles || []);
  if (normalizedFiles.length === 0 || reservation.changedFilesDigest !== digestStringSet(normalizedFiles)) return fail("source_cycle_reservation_files_mismatch", "reservation changed-file digest does not match");
  if (fingerprintDigest && reservation.findingInventoryDigest !== fingerprintDigest) return fail("source_cycle_reservation_finding_mismatch", "reservation finding digest does not match");
  if (config.taskKey !== undefined && reservation.taskKey !== (config.taskKey || null)) return fail("source_cycle_reservation_task_mismatch", "reservation task key does not match");
  if (config.runId !== undefined && reservation.runId !== (config.runId || null)) return fail("source_cycle_reservation_run_mismatch", "reservation run ID does not match");
  if (config.supervisorRunId !== undefined && reservation.supervisorRunId !== (config.supervisorRunId || null)) return fail("source_cycle_reservation_supervisor_mismatch", "reservation supervisor run ID does not match");
  return { ok: true, reservation, consumedBefore: reservation.consumedBefore, consumedAfter: reservation.consumedAfter, summary: sourceCycleReservationSummary(reservation) };
}

function validateReconciledSourceCycle({ config = {}, state = {}, pr = {}, result = {}, budget = null } = {}) {
  const intent = result.pushIntent || result.intent || null;
  const confirmation = result.pushConfirmation?.marker || result.pushConfirmation || null;
  const reservation = result.sourceCycleReservation || intent?.sourceCycleReservation || confirmation?.sourceCycleReservation || result.result?.sourceIdentity?.sourceCycleReservation || null;
  const normalized = reservation || null;
  if (!reservation) return fail("source_cycle_reservation_missing", "source-cycle reconciliation requires a finalized reservation");
  const reservationState = {
    sourceCycles: { [pr.number]: reservation.consumedBefore },
    sourceCycleEpoch: { [pr.number]: reservation.sourceCycleEpoch },
  };
  const validation = validateSourceCycleReservation({
    config,
    state: reservationState,
    pr,
    reservation: normalized,
    oldHead: pr.headRefOid,
    newHead: result.newHead || intent?.candidateNewHead || result.result?.newHead || null,
    changedFiles: result.result?.changedFiles || intent?.changedFiles || normalized?.changedFiles || [],
    fingerprintDigest: result.result?.fingerprintDigest || intent?.findingInventoryDigest || normalized?.findingInventoryDigest || null,
    expectStatus: "source_cycle_finalized",
    requireCurrentCount: true,
  });
  if (!validation.ok) {
    if (budget?.reasonCode === "source_cycle_budget_exhausted") return fail("source_cycle_reservation_conflict", "source_cycle_budget_exhausted cannot authorize source-cycle reconciliation");
    return validation.reasonCode === "source_cycle_reservation_status_mismatch" ? fail("source_cycle_reservation_conflict", "source-cycle reservation was not finalized before state rebound") : validation;
  }
  if (budget?.ok && budget.consumed !== validation.consumedBefore) return fail("source_cycle_reservation_conflict", "source-cycle budget does not match the finalized reservation");
  return validation;
}

function finalizeSourceCycleReservation({ config = {}, pr = {}, intent = {}, remoteHead = null, liveHead = null, localHead = null } = {}) {
  const reservation = intent.sourceCycleReservation;
  const validation = validateSourceCycleReservation({ config, state: { sourceCycles: { [pr.number]: reservation?.consumedBefore }, sourceCycleEpoch: { [pr.number]: reservation?.sourceCycleEpoch } }, pr, reservation, expectStatus: "source_cycle_reserved", requireCurrentCount: true });
  if (!validation.ok) return validation;
  if (remoteHead !== reservation.finalCandidateHead || liveHead !== reservation.finalCandidateHead) return fail("source_cycle_reservation_candidate_mismatch", "reservation cannot finalize without remote/live candidate equality");
  const finalized = sanitizeState({
    ...reservation,
    status: "source_cycle_finalized",
    localHead,
    remoteHead,
    liveHead,
    finalizedAt: new Date().toISOString(),
  });
  const reservationPath = reservation.reservationId
    ? path.join(sourceCycleReservationRoot(config), `${reservation.reservationId}.json`)
    : null;
  if (reservationPath) {
    validateDurableArtifactPath(config, reservationPath);
    mkdirSync(path.dirname(reservationPath), { recursive: true, mode: 0o700 });
    const tmp = `${reservationPath}.${process.pid}.${Date.now()}.finalized.tmp`;
    writeFileSync(tmp, `${JSON.stringify(finalized, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, reservationPath);
  }
  return { ok: true, reservation: finalized, summary: sourceCycleReservationSummary(finalized) };
}

function sourceCycleReservationSummary(reservation = {}) {
  return {
    reservationId: reservation.reservationId || null,
    status: reservation.status || null,
    prNumber: reservation.prNumber || null,
    sourceCycleEpoch: reservation.sourceCycleEpoch || null,
    maxAtReservation: reservation.maxAtReservation ?? null,
    consumedBefore: reservation.consumedBefore ?? null,
    consumedAfter: reservation.consumedAfter ?? null,
    reservedOrdinal: reservation.reservedOrdinal ?? null,
    oldHead: reservation.oldHead || null,
    finalCandidateHead: reservation.finalCandidateHead || null,
    policyDigest: reservation.policyDigest || null,
  };
}

function upsertSourceCycleReservation(reservations = {}, reservation = {}) {
  if (!reservation?.reservationId) return reservations || {};
  return { ...(reservations || {}), [reservation.reservationId]: sanitizeState(reservation) };
}

function normalizeSourceCycleMax(config = {}) {
  const stackMax = config?.prStackExecution?.maxSourceCyclesPerPr;
  if (Number.isInteger(stackMax) && stackMax > 0) return stackMax;
  const legacyMax = config?.maxReviewFixCycles;
  if (Number.isInteger(legacyMax) && legacyMax > 0) return legacyMax;
  return 50;
}

function rebindPlanToStateHeads(plan, state) {
  const exactHeads = state?.exactHeads || {};
  const statePrs = new Map((state?.orderedPrs || []).map((pr) => [pr.number, pr]));
  return {
    ...plan,
    activePrNumber: state?.activePrNumber ?? plan.activePrNumber,
    orderedPrs: plan.orderedPrs.map((pr) => {
      const statePr = statePrs.get(pr.number) || {};
      return {
        ...pr,
        baseRefName: statePr.baseRefName || pr.baseRefName,
        isDraft: statePr.isDraft ?? pr.isDraft,
        headRefOid: exactHeads[pr.number] || statePr.headRefOid || pr.headRefOid,
        ...optionalCarriedLaneFields({ ...pr, ...optionalCarriedLaneFields(statePr) }),
      };
    }),
  };
}

function rebindStateToNewHead(state, prNumber, newHead, sourceCycles, result) {
  const oldHead = state.exactHeads?.[prNumber] || state.orderedPrs?.find((pr) => pr.number === prNumber)?.headRefOid || null;
  const canonical = normalizeSourceChangingConvergenceResult(result, { prNumber, oldHead, newHead });
  if (!canonical.ok) return canonical;
  let evidence = putEvidence(invalidateHeadBoundEvidence(state.evidence, prNumber), "reviewConverged", prNumber, {
    ...result,
    ok: true,
    oldHead,
    newHead,
    reboundExactHead: true,
    sourceIdentity: canonical.sourceIdentity,
    changedFiles: canonical.changedFiles,
    changedFilesDigest: canonical.changedFilesDigest,
    fixDelta: canonical.fixDelta,
    fullCandidatePrDelta: canonical.fullCandidatePrDelta,
    findingFingerprints: canonical.findingFingerprints,
    fingerprintDigest: canonical.fingerprintDigest,
    completedAt: canonical.completedAt,
  });
  evidence = putEvidence(evidence, "validation", prNumber, canonical.validation);
  evidence = putEvidence(evidence, "strongReview", prNumber, canonical.strongReview);
  evidence = putEvidence(evidence, "codexReview", prNumber, canonical.codexReview);
  evidence = putEvidence(evidence, "batchFix", prNumber, {
    ok: true,
    oldHead,
    newHead,
    sourceIdentity: canonical.sourceIdentity,
    changedFiles: canonical.changedFiles,
    changedFilesDigest: canonical.changedFilesDigest,
    fixDelta: canonical.fixDelta,
    fullCandidatePrDelta: canonical.fullCandidatePrDelta,
    reviewPackageDigest: canonical.reviewPackageDigest,
    diffDigest: canonical.diffDigest,
    mutationMarkers: canonical.durableMutationMarkers,
    findingFingerprints: canonical.findingFingerprints,
    fingerprintDigest: canonical.fingerprintDigest,
    evidencePaths: canonical.evidencePaths,
    completedAt: canonical.completedAt,
  });
  const mutationMarkers = {
    ...pruneHeadBoundMutationMarkers(state.mutationMarkers, prNumber, oldHead),
    ...canonical.durableMutationMarkers,
  };
  return {
    ok: true,
    evidence,
    sourceCycles,
    exactHeads: { ...(state.exactHeads || {}), [prNumber]: newHead },
    orderedPrs: rebindOrderedPrToNewHead(state, prNumber, newHead),
    mutationMarkers,
  };
}

function normalizeSourceChangingConvergenceResult(result = {}, { prNumber, oldHead, newHead } = {}) {
  const nested = result?.result;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return fail("source_rebound_result_shape_invalid", "source-changing convergence result must contain the canonical nested result object");
  }
  if (nested.ok !== true) return fail("source_rebound_result_not_ok", "canonical nested source-changing result did not pass");
  if (nested.newHead !== newHead) return fail("source_rebound_nested_head_mismatch", "nested source-changing result does not match returned new head");
  if (newHead === oldHead) return fail("source_rebound_new_head_required", "source-changing convergence result did not advance the head");
  const sourceIdentity = nested.sourceIdentity || {};
  const changedFiles = normalizeChangedFiles(nested.changedFiles || sourceIdentity.changedFiles || []);
  const changedFilesDigest = nested.changedFilesDigest || sourceIdentity.changedFilesDigest || null;
  const expectedBase = sourceIdentity.baseSha || nested.baseSha || null;
  const chain = validateCanonicalCommitChain(sourceIdentity.commitChain || [], { oldHead, newHead, candidateParent: sourceIdentity.parent || null });
  if (!chain.ok) return chain;
  if (!validSha(oldHead) || !validSha(newHead)) return fail("source_rebound_head_invalid", "source rebound head identity is invalid");
  if (sourceIdentity.oldHead && sourceIdentity.oldHead !== oldHead) return fail("source_rebound_old_head_mismatch", "source identity old head does not match");
  if ((sourceIdentity.newHead || sourceIdentity.headSha) !== newHead) return fail("source_rebound_source_head_mismatch", "source identity new head does not match");
  if (sourceIdentity.parent && sourceIdentity.parent !== chain.parent) return fail("source_rebound_parent_mismatch", "candidate parent must match the penultimate canonical commit-chain entry");
  if (sourceIdentity.commitChainDigest && sourceIdentity.commitChainDigest !== chain.digest) return fail("source_rebound_commit_chain_digest_mismatch", "source identity commit-chain digest does not match");
  if (!validSha(sourceIdentity.tree)) return fail("source_rebound_tree_missing", "candidate tree evidence is missing");
  if (!validSha(expectedBase)) return fail("source_rebound_base_missing", "candidate base evidence is missing");
  if (changedFiles.length === 0) return fail("source_rebound_changed_files_missing", "candidate changed-file evidence is missing");
  if (changedFilesDigest !== digestStringSet(changedFiles)) return fail("source_rebound_changed_file_digest_mismatch", "candidate changed-file digest does not match");
  const candidateDelta = sourceIdentity.fullCandidatePrDelta || nested.fullCandidatePrDelta || null;
  const candidateDeltaCheck = validateCandidateDeltaEvidence(candidateDelta, {
    expectedHead: newHead,
    expectedBase,
    expectedTree: sourceIdentity.tree,
    changedFiles,
    name: "source_rebound_candidate_delta",
  });
  if (!candidateDeltaCheck.ok) return candidateDeltaCheck;
  const validation = validateValidationEvidenceObject(nested.validation, { expectedHead: newHead, expectedBase, changedFiles, expectedCandidateDelta: candidateDeltaCheck.delta });
  if (!validation.ok) return validation;
  const strongReview = validateReviewEvidenceObject(nested.externalReview, {
    name: "source_rebound_strong_review",
    expectedHead: newHead,
    expectedBase,
    changedFiles,
    expectedCandidateDelta: candidateDeltaCheck.delta,
    requireIndependent: true,
  });
  if (!strongReview.ok) return strongReview;
  const codexReview = validateReviewEvidenceObject(nested.review, {
    name: "source_rebound_codex_review",
    expectedHead: newHead,
    expectedBase,
    changedFiles,
    expectedCandidateDelta: candidateDeltaCheck.delta,
    requireIndependent: false,
  });
  if (!codexReview.ok) return codexReview;
  const durableMutationMarkers = nested.durableMutationMarkers || {};
  const markerEntries = Object.entries(durableMutationMarkers);
  if (markerEntries.length !== 1) return fail("source_rebound_mutation_marker_ambiguous", "source-changing convergence must provide exactly one durable mutation marker");
  const [, marker] = markerEntries[0];
  if (marker?.prNumber !== prNumber) return fail("source_rebound_marker_pr_mismatch", "durable mutation marker PR number does not match");
  if (marker.oldHead !== oldHead || marker.newHead !== newHead) return fail("source_rebound_marker_head_mismatch", "durable mutation marker head identity does not match");
  const markerChain = validateCanonicalCommitChain(marker.sourceIdentity?.commitChain || marker.commitChain || [], { oldHead, newHead, candidateParent: marker.sourceIdentity?.parent || sourceIdentity.parent || null });
  if (!markerChain.ok) return markerChain;
  if (markerChain.digest !== chain.digest) return fail("source_rebound_marker_commit_chain_mismatch", "durable mutation marker commit-chain evidence does not match");
  if (!sameStringSet(marker.changedFiles || [], changedFiles) || marker.changedFilesDigest !== changedFilesDigest) {
    return fail("source_rebound_marker_files_mismatch", "durable mutation marker file evidence does not match");
  }
  const markerDelta = marker.fullCandidatePrDelta || marker.sourceIdentity?.fullCandidatePrDelta || null;
  const markerDeltaCheck = validateCandidateDeltaEvidence(markerDelta, {
    expectedHead: newHead,
    expectedBase,
    expectedTree: sourceIdentity.tree,
    changedFiles,
    expectedCandidateDelta: candidateDeltaCheck.delta,
    name: "source_rebound_marker_candidate_delta",
  });
  if (!markerDeltaCheck.ok) return markerDeltaCheck;
  const fingerprintDigest = nested.fingerprintDigest || marker.fingerprintDigest || null;
  if (!fingerprintDigest || (marker.fingerprintDigest && marker.fingerprintDigest !== fingerprintDigest)) {
    return fail("source_rebound_finding_digest_mismatch", "finding inventory digest is missing or inconsistent");
  }
  const findingFingerprints = normalizeChangedFiles(nested.findingFingerprints || marker.findingFingerprints || []);
  const evidencePaths = normalizeChangedFiles([
    nested.validation?.evidencePath,
    nested.validation?.evidencePaths,
    nested.externalReview?.evidencePath,
    nested.externalReview?.providerEvidencePath,
    nested.review?.evidencePath,
    nested.review?.logPath,
    nested.reviewPackagePath,
  ].flat().filter(Boolean));
  return {
    ok: true,
    validation: { ...validation.validation, exactHead: newHead },
    strongReview: strongReview.review,
    codexReview: codexReview.review,
    sourceIdentity: { ...sourceIdentity, parent: chain.parent, commitChain: chain.chain, commitChainDigest: chain.digest, fullCandidatePrDelta: candidateDeltaCheck.delta },
    changedFiles,
    changedFilesDigest,
    fixDelta: nested.fixDelta || marker.fixDelta || sourceIdentity.fixDelta || null,
    fullCandidatePrDelta: candidateDeltaCheck.delta,
    reviewPackageDigest: nested.reviewPackageDigest || nested.reviewPackage?.digest || null,
    diffDigest: nested.diffDigest || sourceIdentity.patchDigest || null,
    durableMutationMarkers,
    findingFingerprints,
    fingerprintDigest,
    evidencePaths,
    completedAt: nested.completedAt || marker.pushedAt || new Date().toISOString(),
  };
}

function invalidateHeadBoundEvidence(evidence = {}, prNumber) {
  const next = { ...(evidence || {}) };
  for (const key of ["gatesPassed", "merged", "currentMainProof", "currentMainProven", "mergedCurrentMain", "ownDeltaPreserved", "validation", "strongReview", "codexReview", "review"]) {
    if (next[key]?.[prNumber]) {
      next[key] = { ...next[key] };
      delete next[key][prNumber];
    }
  }
  return next;
}

function invalidateFinalGateEvidence(evidence = {}, prNumber) {
  const next = { ...(evidence || {}) };
  for (const key of ["gatesPassed", "finalGateSnapshots", "validation", "strongReview", "codexReview", "review"]) {
    if (next[key]?.[prNumber]) {
      next[key] = { ...next[key] };
      delete next[key][prNumber];
    }
  }
  return next;
}

function rebindOrderedPrToNewHead(state, prNumber, newHead) {
  const durableRetarget = state.evidence?.retargeted?.[prNumber] || null;
  const durableReady = state.evidence?.ready?.[prNumber] || null;
  return (state.orderedPrs || []).map((pr) => {
    if (pr.number !== prNumber) return pr;
    const baseRefName = durableRetarget?.newBase || durableRetarget?.after?.baseRefName || pr.baseRefName;
    const isDraft = durableReady?.after ? Boolean(durableReady.after.isDraft) : durableReady?.ok === true ? false : pr.isDraft;
    return { ...pr, headRefOid: newHead, baseRefName, isDraft };
  });
}

function rebindOrderedPrAfterRetarget(state, prNumber, proof = {}) {
  const actualBase = proof.after?.baseRefName || proof.newBase || null;
  if (!actualBase) return state.orderedPrs;
  return (state.orderedPrs || []).map((pr) => (
    pr.number === prNumber ? { ...pr, baseRefName: actualBase } : pr
  ));
}

function pruneHeadBoundMutationMarkers(markers = {}, prNumber, oldHead) {
  return Object.fromEntries(
    Object.entries(markers || {}).filter(([key, marker]) => {
      if (marker?.prNumber !== prNumber) return true;
      return oldHead ? !key.includes(oldHead) && marker.exactHead !== oldHead : false;
    }),
  );
}

function resolveStackStatePath(config, stackConfig, planPath) {
  if (stackConfig.statePath) {
    if (!path.isAbsolute(stackConfig.statePath)) throw new Error("prStackExecution.statePath must be absolute");
    const resolved = path.resolve(stackConfig.statePath);
    if (resolved !== stackConfig.statePath) throw new Error("prStackExecution.statePath must be an absolute canonical path");
    validateExplicitStackStatePath(resolved, config.logsRoot);
    return resolved;
  }
  return path.join(path.dirname(planPath), "stack-state.json");
}

function validateExplicitStackStatePath(statePath, logsRoot) {
  const lexicalRoot = path.resolve(logsRoot || "/workspace/logs/settleora-auto-runner");
  let rootLstat;
  try {
    rootLstat = lstatSync(lexicalRoot);
  } catch {
    throw new Error("prStackExecution.statePath logsRoot must exist");
  }
  if (rootLstat.isSymbolicLink()) throw new Error("prStackExecution.statePath logsRoot must not be a symlink");
  let canonicalRoot;
  try {
    canonicalRoot = realpathSync(lexicalRoot);
  } catch {
    throw new Error("prStackExecution.statePath logsRoot could not be canonicalized");
  }
  if (canonicalRoot !== lexicalRoot) throw new Error("prStackExecution.statePath logsRoot realpath must match its lexical path");
  const rootStat = statSync(canonicalRoot);
  if (!rootStat.isDirectory()) throw new Error("prStackExecution.statePath logsRoot must be a directory");
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && rootStat.uid !== currentUid) throw new Error("prStackExecution.statePath logsRoot owner must match current operator");
  if ((rootStat.mode & 0o077) !== 0) throw new Error("prStackExecution.statePath logsRoot must be owner-only");
  const relative = path.relative(lexicalRoot, statePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
    throw new Error("prStackExecution.statePath must be under logsRoot");
  }
  let current = lexicalRoot;
  const parts = relative.split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    current = path.join(current, part);
    let componentStat;
    try {
      componentStat = lstatSync(current);
    } catch (error) {
      if (error?.code === "ELOOP") throw new Error("prStackExecution.statePath must not contain symlinks");
      if (error?.code === "ENOENT") break;
      throw new Error("prStackExecution.statePath component could not be validated");
    }
    if (componentStat.isSymbolicLink()) throw new Error("prStackExecution.statePath must not contain symlinks");
    if (index < parts.length - 1) {
      if (!componentStat.isDirectory()) throw new Error("prStackExecution.statePath parent components must be directories");
      if (currentUid !== null && componentStat.uid !== currentUid) throw new Error("prStackExecution.statePath parent owner must match current operator");
      if ((componentStat.mode & 0o077) !== 0) throw new Error("prStackExecution.statePath parent directories must be owner-only");
    } else {
      if (!componentStat.isFile()) throw new Error("prStackExecution.statePath existing state must be a regular file");
      if (currentUid !== null && componentStat.uid !== currentUid) throw new Error("prStackExecution.statePath existing state owner must match current operator");
      if ((componentStat.mode & 0o077) !== 0) throw new Error("prStackExecution.statePath existing state file must be owner-only");
    }
    let componentReal;
    try {
      componentReal = realpathSync(current);
    } catch {
      throw new Error("prStackExecution.statePath component could not be canonicalized");
    }
    if (componentReal !== current || !isInside(componentReal, canonicalRoot)) {
      throw new Error("prStackExecution.statePath component must stay under logsRoot");
    }
  }
}

function normalizePlanContainer(parsed = {}) {
  const candidate = parsed.plan || parsed.stackPlan || parsed;
  return {
    ...candidate,
    repository: candidate.repository || parsed.repository,
    stackId: candidate.stackId || parsed.stackId,
    issueNumber: candidate.issueNumber ?? parsed.issueNumber ?? parsed.trackerIssues?.focusedIssue ?? null,
    orderedPrs: (candidate.orderedPrs || parsed.orderedPrs || []).map((pr, index, all) => ({
      order: pr.order ?? index,
      number: pr.number,
      title: pr.title || "",
      baseRefName: pr.baseRefName || pr.base || "",
      headRefName: pr.headRefName || pr.branch || "",
      headRefOid: pr.headRefOid || pr.headSha || pr.exactHead || "",
      isDraft: Boolean(pr.isDraft),
      state: pr.state || "OPEN",
      ownDelta: pr.ownDelta || {},
      ...optionalCarriedLaneFields(pr),
      expectedParentPr: pr.expectedParentPr ?? (index === 0 ? null : all[index - 1]?.number),
      expectedParentBranch: pr.expectedParentBranch ?? (index === 0 ? null : (all[index - 1]?.headRefName || all[index - 1]?.branch)),
    })),
    activePrNumber: candidate.activePrNumber ?? parsed.activePrNumber ?? candidate.orderedPrs?.[0]?.number ?? null,
    mutationMarkers: candidate.mutationMarkers || parsed.mutationMarkers || {},
  };
}

function immutablePrIdentity(pr) {
  return {
    order: pr.order,
    number: pr.number,
    title: boundedText(pr.title || "", 240),
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    isDraft: Boolean(pr.isDraft),
    state: pr.state || "OPEN",
    ownDelta: pr.ownDelta || {},
    ...optionalCarriedLaneFields(pr),
    expectedParentPr: pr.expectedParentPr ?? null,
    expectedParentBranch: pr.expectedParentBranch ?? null,
  };
}

function optionalCarriedLaneFields(pr = {}) {
  const fields = {};
  if (pr.laneDecision) fields.laneDecision = pr.laneDecision;
  if (pr.laneContract) fields.laneContract = pr.laneContract;
  if (pr.allowedPaths) fields.allowedPaths = pr.allowedPaths;
  if (pr.stackLaneContract) fields.stackLaneContract = pr.stackLaneContract;
  return fields;
}

function putEvidence(evidence, kind, key, value) {
  return {
    ...(evidence || {}),
    [kind]: {
      ...(evidence?.[kind] || {}),
      [key]: sanitizeState(value),
    },
  };
}

function waitOrFail(result, fallback) {
  if (result?.waiting) {
    return {
      ok: false,
      waiting: true,
      reasonCode: result.reasonCode || fallback,
      reason: result.reason || fallback,
      evidence: result.evidence,
      evidencePatch: result.evidencePatch,
    };
  }
  return fail(result?.reasonCode || fallback, result?.reason || fallback);
}

function mergeEvidencePatch(evidence = {}, patch = {}) {
  const validation = validateEvidencePatch(patch);
  if (!validation.ok) throw new Error(`Invalid evidence patch: ${validation.reasonCode}`);
  const next = { ...(evidence || {}) };
  for (const [kind, entries] of Object.entries(patch)) {
    next[kind] = { ...(next[kind] || {}) };
    for (const [key, value] of Object.entries(entries)) {
      next[kind][key] = sanitizeState(value);
    }
  }
  return next;
}

function validateEvidencePatch(patch = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return fail("stack_evidence_patch_invalid", "evidence patch must be an object");
  for (const [kind, entries] of Object.entries(patch)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(kind)) return fail("stack_evidence_patch_invalid", "evidence patch kind is invalid");
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) return fail("stack_evidence_patch_invalid", "evidence patch entries must be keyed objects");
    for (const [key, value] of Object.entries(entries)) {
      if (!/^[A-Za-z0-9_.:-]+$/.test(String(key))) return fail("stack_evidence_patch_invalid", "evidence patch key is invalid");
      if (value === undefined || typeof value === "function") return fail("stack_evidence_patch_invalid", "evidence patch value is invalid");
    }
  }
  return { ok: true };
}

function nextUnmergedPr(plan, evidence, justMerged) {
  return plan.orderedPrs.find((pr) => pr.number !== justMerged && !evidence?.merged?.[pr.number])?.number ?? justMerged;
}

function markerKeyFor(kind, prNumber, key) {
  return `${kind}:${prNumber || "stack"}:${key}`;
}

function summarizeStackState(state) {
  return {
    stateVersion: state.stateVersion,
    stackId: state.stackId,
    repository: state.repository,
    activePrNumber: state.activePrNumber,
    currentPhase: state.currentPhase,
    currentAction: state.currentAction,
    sourceCycles: state.sourceCycles,
    mutationMarkerCount: Object.keys(state.mutationMarkers || {}).length,
    terminal: state.terminal,
    wait: state.wait,
  };
}

function boundedProof(value) {
  return sanitizeState(value);
}

function normalizeChangedFiles(files = []) {
  return [...new Set((Array.isArray(files) ? files : []).map((file) => String(file || "").trim()).filter(Boolean))].sort();
}

function sameStringSet(left = [], right = []) {
  const normalizedLeft = normalizeChangedFiles(left);
  const normalizedRight = normalizeChangedFiles(right);
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function sameStringList(left = [], right = []) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function sanitizeState(value) {
  return boundSanitizedEvidence(sanitizePersistedEvidence(value));
}

function boundSanitizedEvidence(value) {
  if (Array.isArray(value)) return value.slice(0, 200).map(boundSanitizedEvidence);
  if (!value || typeof value !== "object") return typeof value === "string" ? boundedText(value, 2000) : value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, boundSanitizedEvidence(child)]));
}

function boundedText(value, max = 1000) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value || {})).digest("hex");
}

function digestStringSet(values = []) {
  return createHash("sha256").update(JSON.stringify(normalizeChangedFiles(values))).digest("hex");
}

function digestStringList(values = []) {
  return createHash("sha256").update((Array.isArray(values) ? values : []).join("\n")).digest("hex");
}

function validStackId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{3,160}$/.test(value);
}

function validSha(value) {
  return /^[0-9a-f]{40}$/i.test(String(value || ""));
}

function safeBranch(value) {
  const branch = String(value || "");
  return typeof value === "string" &&
    branch.trim() === branch &&
    branch.length > 0 &&
    branch.length <= 240 &&
    !branch.includes("..") &&
    !branch.startsWith("/") &&
    !branch.endsWith("/");
}

function safeSourceBranchTarget(value, { baseRefName = null, defaultBranch = "main" } = {}) {
  const branch = String(value || "");
  if (!safeBranch(value)) return false;
  if (protectedBranchNames.has(branch) || branch === defaultBranch || (baseRefName && branch === baseRefName)) return false;
  if (branch === "HEAD" || branch.startsWith("HEAD") || branch.includes("@{")) return false;
  if (branch.startsWith("origin/") || branch.startsWith("refs/") || branch.startsWith("tags/")) return false;
  if (branch.startsWith("-")) return false;
  if (validSha(branch)) return false;
  if (branch.includes("\\") || branch.includes("//")) return false;
  if (branch.split("/").some((part) => part === "." || part === ".." || part === "")) return false;
  return true;
}

function validatePushTargetBranch({ branch, liveHeadRefName, baseRefName, defaultBranch }) {
  if (!safeSourceBranchTarget(branch, { baseRefName, defaultBranch })) {
    return fail("existing_pr_batch_fix_branch_forbidden", "batch-fix push target is protected, base, detached/head-like, remote-qualified, tag, SHA-like, option-looking, or path-like");
  }
  if (branch !== liveHeadRefName) {
    return fail("existing_pr_batch_fix_push_target_mismatch", "push target must exactly equal the fresh live PR headRefName");
  }
  return { ok: true };
}

function canonicalRepositorySlug(value) {
  if (!value || typeof value !== "string") return null;
  const slug = value.trim().replace(/\.git$/i, "");
  if (slug !== value.trim()) return canonicalRepositorySlug(slug);
  const parts = slug.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  const safe = /^[A-Za-z0-9_.-]+$/;
  if (!safe.test(owner) || !safe.test(name)) return null;
  if (owner.startsWith("-") || name.startsWith("-")) return null;
  return `${owner}/${name}`;
}

function canonicalRepositoryFromProvider(value) {
  if (!value || typeof value !== "object") return { slug: null, id: null };
  const fullName = value.full_name || value.nameWithOwner || value.name_with_owner || null;
  const slug = canonicalRepositorySlug(fullName);
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : null;
  return { slug, id };
}

function originUrlHasCredentials(value) {
  const url = String(value || "");
  return /^[a-z][a-z0-9+.-]*:\/\/[^/\s@]+:[^/\s@]+@/i.test(url);
}

function sanitizedOriginDescriptor(value) {
  const url = String(value || "");
  if (!url) return "<empty>";
  if (originUrlHasCredentials(url)) return "<credential-bearing-origin-url>";
  return boundedText(url.replace(/\/\/([^@\s/]+)@/g, "//<redacted>@"), 240);
}

function canonicalRepositoryFromOriginUrl(value, { expectedRepositorySlug = null } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return fail("origin_repository_missing", "origin URL is missing");
  if (raw.startsWith("-")) return fail("origin_repository_unsupported", "origin URL is option-looking");
  if (originUrlHasCredentials(raw)) return fail("origin_repository_credentials_refused", "origin URL contains credentials", { sanitizedOrigin: sanitizedOriginDescriptor(raw) });
  const expected = canonicalRepositorySlug(expectedRepositorySlug);
  let owner = null;
  let name = null;
  try {
    const parsed = new URL(raw);
    if (!["https:", "ssh:"].includes(parsed.protocol)) return fail("origin_repository_unsupported", "origin URL protocol is unsupported", { sanitizedOrigin: sanitizedOriginDescriptor(raw) });
    if (parsed.username && parsed.username !== "git") return fail("origin_repository_unsupported", "origin URL user is unsupported", { sanitizedOrigin: sanitizedOriginDescriptor(raw) });
    if (parsed.password) return fail("origin_repository_credentials_refused", "origin URL contains credentials", { sanitizedOrigin: sanitizedOriginDescriptor(raw) });
    if (parsed.hostname !== "github.com") return fail("origin_repository_unsupported", "origin host is not github.com", { sanitizedOrigin: sanitizedOriginDescriptor(raw) });
    const parts = parsed.pathname.replace(/^\/+/, "").split("/");
    [owner, name] = parts;
  } catch {
    const match = raw.match(/^(?:git@)?([^:\s]+):([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
    if (!match) return fail("origin_repository_unsupported", "origin URL is not a supported GitHub origin", { sanitizedOrigin: sanitizedOriginDescriptor(raw) });
    const [, host, matchOwner, matchName] = match;
    if (!githubSshAliasPattern.test(host)) return fail("origin_repository_unsupported", "origin SSH host is not an approved GitHub host or alias", { sanitizedOrigin: sanitizedOriginDescriptor(raw) });
    owner = matchOwner;
    name = matchName;
  }
  const slug = canonicalRepositorySlug(`${owner}/${name}`);
  if (!slug) return fail("origin_repository_slug_invalid", "origin repository slug is invalid", { sanitizedOrigin: sanitizedOriginDescriptor(raw) });
  if (expected && slug !== expected) return fail("origin_repository_mismatch", "origin repository does not match configured repository", { originRepositorySlug: slug, expectedRepositorySlug: expected });
  return { ok: true, repositorySlug: slug };
}

function readOriginRepositoryProof({ config = {}, runner = defaultRunner } = {}) {
  const cwd = config.repoRoot || process.cwd();
  const expectedRepositorySlug = canonicalRepositorySlug(config.repositorySlug || "tommytang213/Settleora");
  if (!expectedRepositorySlug) return fail("configured_repository_invalid", "configured repository slug must be owner/name");
  const result = runner("git", ["remote", "get-url", "--push", "origin"], { cwd });
  if (result.status !== 0 || result.error) return fail("origin_repository_unreadable", boundedText(result.stderr || result.error || result.stdout));
  const parsed = canonicalRepositoryFromOriginUrl(result.stdout, { expectedRepositorySlug });
  if (!parsed.ok) return parsed;
  return { ok: true, repositorySlug: parsed.repositorySlug, checkedAt: new Date().toISOString() };
}

function validateRepositoryIdentityProof({ config = {}, liveProof = {}, originProof = null, intent = null } = {}) {
  const configuredRepositorySlug = canonicalRepositorySlug(config.repositorySlug || "tommytang213/Settleora");
  if (!configuredRepositorySlug) return fail("configured_repository_invalid", "configured repository slug must be owner/name");
  const baseRepositorySlug = canonicalRepositorySlug(liveProof.baseRepositorySlug || configuredRepositorySlug);
  const headRepositorySlug = canonicalRepositorySlug(liveProof.headRepositorySlug);
  const originRepositorySlug = canonicalRepositorySlug(originProof?.repositorySlug || liveProof.originRepositorySlug);
  if (!baseRepositorySlug) return fail("pr_base_repository_missing", "fresh PR base repository identity is missing");
  if (!headRepositorySlug) return fail("pr_head_repository_missing", "fresh PR head repository identity is missing");
  if (!originRepositorySlug) return fail("origin_repository_missing", "origin repository identity is missing");
  if (baseRepositorySlug !== configuredRepositorySlug) return fail("pr_base_repository_mismatch", "fresh PR base repository does not match configured repository", { baseRepositorySlug, configuredRepositorySlug });
  if (headRepositorySlug !== configuredRepositorySlug) return fail("pr_head_repository_mismatch", "fresh PR head repository does not match configured repository", { headRepositorySlug, configuredRepositorySlug });
  if (originRepositorySlug !== configuredRepositorySlug) return fail("origin_repository_mismatch", "origin repository does not match configured repository", { originRepositorySlug, configuredRepositorySlug });
  if (headRepositorySlug !== originRepositorySlug) return fail("pr_head_origin_repository_mismatch", "fresh PR head repository does not match origin repository", { headRepositorySlug, originRepositorySlug });
  if (liveProof.isCrossRepository === true) return fail("pr_head_repository_mismatch", "fork PRs are not supported by production stack source mutation", { headRepositorySlug, configuredRepositorySlug });
  if (liveProof.baseRepositoryId && liveProof.headRepositoryId && liveProof.baseRepositoryId !== liveProof.headRepositoryId) {
    return fail("pr_repository_id_mismatch", "fresh PR base/head repository IDs differ", { baseRepositoryId: liveProof.baseRepositoryId, headRepositoryId: liveProof.headRepositoryId });
  }
  if (intent) {
    const expectedIds = intent.repositoryIds || {};
    const intentConfigured = canonicalRepositorySlug(intent.configuredRepositorySlug || intent.repository);
    const intentBase = canonicalRepositorySlug(intent.baseRepositorySlug);
    const intentHead = canonicalRepositorySlug(intent.headRepositorySlug);
    const intentOrigin = canonicalRepositorySlug(intent.originRepositorySlug);
    if (intentConfigured !== configuredRepositorySlug) return fail("push_intent_repository_mismatch", "push intent configured repository does not match");
    if (intentBase !== baseRepositorySlug) return fail("push_intent_base_repository_mismatch", "push intent base repository does not match fresh PR proof");
    if (intentHead !== headRepositorySlug) return fail("push_intent_head_repository_mismatch", "push intent head repository does not match fresh PR proof");
    if (intentOrigin !== originRepositorySlug) return fail("push_intent_origin_repository_mismatch", "push intent origin repository does not match fresh origin proof");
    if (expectedIds.baseRepositoryId && liveProof.baseRepositoryId && expectedIds.baseRepositoryId !== liveProof.baseRepositoryId) return fail("push_intent_base_repository_id_mismatch", "push intent base repository ID does not match fresh PR proof");
    if (expectedIds.headRepositoryId && liveProof.headRepositoryId && expectedIds.headRepositoryId !== liveProof.headRepositoryId) return fail("push_intent_head_repository_id_mismatch", "push intent head repository ID does not match fresh PR proof");
  }
  return {
    ok: true,
    configuredRepositorySlug,
    baseRepositorySlug,
    headRepositorySlug,
    originRepositorySlug,
    repositoryIds: {
      baseRepositoryId: liveProof.baseRepositoryId || null,
      headRepositoryId: liveProof.headRepositoryId || null,
    },
  };
}

function normalizeBoundLivePrProof({ config = {}, pr = {}, repositoryContext = {} } = {}) {
  const configuredRepositorySlug = canonicalRepositorySlug(repositoryContext.configuredRepositorySlug || config.repositorySlug || "tommytang213/Settleora");
  const headRepository = canonicalRepositoryFromProvider(pr.headRepository || {});
  const baseRepository = canonicalRepositoryFromProvider(pr.baseRepository || {});
  const headOwner = pr.headRepositoryOwner?.login || pr.headRepository?.owner?.login || null;
  const headName = pr.headRepository?.name || null;
  const proof = {
    ...pr,
    baseRepositorySlug: canonicalRepositorySlug(pr.baseRepositorySlug) || baseRepository.slug || configuredRepositorySlug,
    baseRepositoryId: pr.baseRepositoryId || baseRepository.id || null,
    headRepositorySlug: headRepository.slug || canonicalRepositorySlug(headOwner && headName ? `${headOwner}/${headName}` : null),
    headRepositoryId: headRepository.id || null,
    originRepositorySlug: repositoryContext.originRepositorySlug || null,
    isCrossRepository: pr.isCrossRepository === true,
  };
  const identity = validateRepositoryIdentityProof({ config, liveProof: proof, originProof: { repositorySlug: repositoryContext.originRepositorySlug } });
  if (!identity.ok) return identity;
  return {
    ok: true,
    proof: sanitizeState({
      repositorySlug: configuredRepositorySlug,
      configuredRepositorySlug,
      baseRepositorySlug: identity.baseRepositorySlug,
      headRepositorySlug: identity.headRepositorySlug,
      originRepositorySlug: identity.originRepositorySlug,
      baseRepositoryId: identity.repositoryIds.baseRepositoryId,
      headRepositoryId: identity.repositoryIds.headRepositoryId,
      isCrossRepository: false,
      inspectedAt: new Date().toISOString(),
      argvRepository: repositoryContext.argvRepository || configuredRepositorySlug,
    }),
  };
}

function stackFlattenCheckRollup(rollup = []) {
  return (Array.isArray(rollup) ? rollup : []).map((check) => ({
    name: check.name || check.context || "unknown",
    status: check.status || (check.state === "SUCCESS" ? "COMPLETED" : check.state),
    conclusion: check.conclusion || check.state,
  }));
}

function repositoryBoundGhRunner(runner, repositoryContext = {}) {
  const repo = repositoryContext.argvRepository || repositoryContext.configuredRepositorySlug || "tommytang213/Settleora";
  return (command, args = [], options = {}) => {
    if (command !== "gh" || args[0] !== "pr") return runner(command, args, options);
    const hasRepo = args.includes("--repo") || args.includes("-R");
    if (hasRepo) return runner(command, args, options);
    const next = [...args.slice(0, 2), ...args.slice(2, 3), "--repo", repo, ...args.slice(3)];
    return runner(command, next, options);
  };
}

function proveTargetBatchFixWorktree({ config, pr, runner, recoveryState = null }) {
  const cwd = config.repoRoot || process.cwd();
  const protectedRoot = path.resolve(config.protectedRoot || "/workspace/repos/Settleora");
  const worktreePath = path.resolve(cwd);
  if (worktreePath === protectedRoot) return fail("existing_pr_batch_fix_protected_root_refused", "protected root cannot be used as a source-mutation worktree");
  const expectedHead = pr?.headRefOid || pr?.exactHead || null;
  const branch = pr?.headRefName || pr?.branch || "";
  if (!validSha(expectedHead)) return fail("existing_pr_batch_fix_expected_head_invalid", "target PR head SHA is invalid");
  const live = readLivePrProof({ config, pr, expectedHead, runner });
  if (!live.ok) return live;
  const branchValidation = validatePushTargetBranch({
    branch,
    liveHeadRefName: live.proof.headRefName,
    baseRefName: live.proof.baseRefName,
    defaultBranch: "main",
  });
  if (!branchValidation.ok) return branchValidation;
  const clean = readWorktreeCleanProof({ runner, cwd });
  if (!clean.ok) return clean;
  const dirtyRecoveryAuthorized = clean.clean !== true
    && recoveryState?.phase === "outer_fix_reserved"
    && recoveryState?.reservedParentHead === expectedHead
    && recoveryState?.originalHead === expectedHead
    && recoveryState?.prNumber === pr?.number
    && recoveryState?.sourceBranch === branch;
  if (clean.clean !== true && !dirtyRecoveryAuthorized) return fail("existing_pr_batch_fix_worktree_dirty", "target worktree/index must be clean before checkout or Codex", clean);
  const fetch = runner("git", ["fetch", "origin", branch], { cwd });
  if (fetch.status !== 0 || fetch.error) return fail("existing_pr_batch_fix_fetch_failed", boundedText(fetch.stderr || fetch.error || fetch.stdout));
  const remote = readGitSha({ runner, cwd, ref: `origin/${branch}`, reasonCode: "existing_pr_batch_fix_remote_head_unreadable" });
  if (!remote.ok) return remote;
  if (remote.sha !== expectedHead) return fail("existing_pr_batch_fix_remote_head_stale", "remote branch no longer matches expected PR head");
  const currentBranch = runner("git", ["branch", "--show-current"], { cwd });
  if (currentBranch.status !== 0 || currentBranch.error) return fail("existing_pr_batch_fix_branch_unreadable", boundedText(currentBranch.stderr || currentBranch.error || currentBranch.stdout));
  const currentBranchName = String(currentBranch.stdout || "").trim();
  const currentHead = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_batch_fix_head_unreadable" });
  if (!currentHead.ok) return currentHead;
  if (currentHead.sha !== expectedHead) {
    if (currentBranchName === branch && remote.sha === expectedHead) {
      const candidateAncestor = runner("git", ["merge-base", "--is-ancestor", expectedHead, currentHead.sha], { cwd });
      if (candidateAncestor.status === 0 && !candidateAncestor.error) {
        return {
          ok: true,
          worktreePath,
          branch,
          expectedHead,
          actualHead: currentHead.sha,
          remoteHead: remote.sha,
          livePr: live.proof,
          repositoryIdentity: live.repositoryIdentity,
          localCandidateHead: currentHead.sha,
          reusedLocalCandidate: true,
          provenAt: new Date().toISOString(),
        };
      }
    }
    if (currentBranchName !== branch) {
      return fail("existing_pr_batch_fix_wrong_branch_before_codex", "target worktree is not on the live PR branch before Codex");
    }
    const ancestor = runner("git", ["merge-base", "--is-ancestor", currentHead.sha, `origin/${branch}`], { cwd });
    if (ancestor.status !== 0 || ancestor.error) {
      return fail("existing_pr_batch_fix_remote_advanced_before_mutation", "remote branch advanced or diverged before mutation");
    }
    const ff = runner("git", ["merge", "--ff-only", `origin/${branch}`], { cwd });
    if (ff.status !== 0 || ff.error) return fail("existing_pr_batch_fix_ff_failed", boundedText(ff.stderr || ff.error || ff.stdout));
  } else if (currentBranchName !== branch) {
    const checkout = runner("git", ["switch", branch], { cwd });
    if (checkout.status !== 0 || checkout.error) return fail("existing_pr_batch_fix_checkout_failed", boundedText(checkout.stderr || checkout.error || checkout.stdout));
  }
  const afterBranch = runner("git", ["branch", "--show-current"], { cwd });
  const afterHead = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_batch_fix_post_checkout_head_unreadable" });
  if (afterBranch.status !== 0 || afterBranch.error || String(afterBranch.stdout || "").trim() !== branch) {
    return fail("existing_pr_batch_fix_branch_identity_failed", "target worktree branch identity was not proven before Codex");
  }
  if (!afterHead.ok || afterHead.sha !== expectedHead) {
    return fail("existing_pr_batch_fix_head_identity_failed", "target worktree HEAD was not proven before Codex");
  }
  return {
    ok: true,
    worktreePath,
    branch,
    expectedHead,
    actualHead: afterHead.sha,
    remoteHead: remote.sha,
    livePr: live.proof,
    repositoryIdentity: live.repositoryIdentity,
    localCandidateHead: afterHead.sha,
    dirtyRecoveryAuthorized,
    provenAt: new Date().toISOString(),
  };
}

function prepareExactHeadFinalGateWorktree({ config, pr, expectedHead, runner, repositoryContext = null }) {
  const cwd = config.repoRoot || process.cwd();
  const protectedRoot = path.resolve(config.protectedRoot || "/workspace/repos/Settleora");
  const worktreePath = path.resolve(cwd);
  if (worktreePath === protectedRoot) return fail("exact_head_gate_protected_root_refused", "protected root cannot be used for exact-head final gates");
  const branch = pr?.headRefName || pr?.branch || "";
  if (!validSha(expectedHead)) return fail("exact_head_gate_expected_head_invalid", "active PR head SHA is invalid");
  const live = readLivePrProof({ config, pr, expectedHead, runner });
  if (!live.ok) return live;
  const branchValidation = validatePushTargetBranch({
    branch,
    liveHeadRefName: live.proof.headRefName,
    baseRefName: live.proof.baseRefName,
    defaultBranch: "main",
  });
  if (!branchValidation.ok) return branchValidation;
  const clean = readWorktreeCleanProof({ runner, cwd });
  if (!clean.ok) return fail("exact_worktree_status_unreadable", clean.reason, { cleanProof: clean });
  if (clean.clean !== true) return fail("exact_head_gate_worktree_dirty", "worktree/index must be clean before active PR checkout", clean);
  const beforeBranch = runner("git", ["branch", "--show-current"], { cwd });
  if (beforeBranch.status !== 0 || beforeBranch.error) return fail("exact_head_gate_branch_unreadable", boundedText(beforeBranch.stderr || beforeBranch.error || beforeBranch.stdout));
  const beforeBranchName = String(beforeBranch.stdout || "").trim();
  let head = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "exact_head_gate_head_unreadable" });
  if (!head.ok) return head;
  let remote = { ok: true, sha: null };
  if (beforeBranchName !== branch || head.sha !== expectedHead) {
    const fetch = runner("git", ["fetch", "origin", branch], { cwd });
    if (fetch.status !== 0 || fetch.error) return fail("exact_head_gate_fetch_failed", boundedText(fetch.stderr || fetch.error || fetch.stdout));
    remote = readGitSha({ runner, cwd, ref: `origin/${branch}`, reasonCode: "exact_head_gate_remote_head_unreadable" });
    if (!remote.ok) return remote;
    if (remote.sha !== expectedHead) return fail("exact_head_gate_remote_head_stale", "remote active PR branch no longer matches expected head", { branch, expectedHead, actualHead: remote.sha });
  }
  if (beforeBranchName !== branch) {
    const checkout = runner("git", ["switch", branch], { cwd });
    if (checkout.status !== 0 || checkout.error) return fail("exact_head_gate_checkout_failed", boundedText(checkout.stderr || checkout.error || checkout.stdout), { branch, expectedHead });
    head = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "exact_head_gate_head_unreadable" });
    if (!head.ok) return head;
  }
  if (head.sha !== expectedHead) {
    const ancestor = runner("git", ["merge-base", "--is-ancestor", head.sha, `origin/${branch}`], { cwd });
    if (ancestor.status !== 0 || ancestor.error) {
      return fail("exact_head_gate_remote_advanced_before_validation", "active PR branch is not a clean fast-forward to the expected remote head", { branch, expectedHead, actualHead: head.sha });
    }
    const ff = runner("git", ["merge", "--ff-only", `origin/${branch}`], { cwd });
    if (ff.status !== 0 || ff.error) return fail("exact_head_gate_ff_failed", boundedText(ff.stderr || ff.error || ff.stdout), { branch, expectedHead, actualHead: head.sha });
    head = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "exact_head_gate_post_ff_head_unreadable" });
    if (!head.ok) return head;
  }
  if (head.sha !== expectedHead) return fail("exact_head_gate_head_mismatch", "active PR checkout did not reach expected head", { branch, expectedHead, actualHead: head.sha });
  return { ok: true, branch, expectedHead, actualHead: head.sha, remoteHead: remote.sha, livePr: live.proof, repositoryIdentity: live.repositoryIdentity, repositoryContext, preparedAt: new Date().toISOString() };
}

function readLivePrProof({ config, pr, expectedHead, runner }) {
  const result = runner(
    "gh",
    ["pr", "view", String(pr?.number), "--repo", config.repositorySlug || "tommytang213/Settleora", "--json", "number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository"],
    { cwd: config.repoRoot || process.cwd() },
  );
  if (result.status !== 0 || result.error) return fail("existing_pr_batch_fix_pr_read_failed", boundedText(result.stderr || result.error || result.stdout));
  let proof;
  try {
    proof = JSON.parse(result.stdout || "{}");
  } catch (error) {
    return fail("existing_pr_batch_fix_pr_read_parse_failed", error.message);
  }
  const configuredRepositorySlug = canonicalRepositorySlug(config.repositorySlug || "tommytang213/Settleora");
  if (!configuredRepositorySlug) return fail("configured_repository_invalid", "configured repository slug must be owner/name");
  const baseRepository = canonicalRepositoryFromProvider(proof.baseRepository || {});
  const headRepository = canonicalRepositoryFromProvider(proof.headRepository || {});
  const headOwner = proof.headRepositoryOwner?.login || proof.headRepository?.owner?.login || null;
  const headName = proof.headRepository?.name || null;
  proof.baseRepositorySlug = canonicalRepositorySlug(proof.baseRepositorySlug) || baseRepository.slug || configuredRepositorySlug;
  proof.baseRepositoryId = proof.baseRepositoryId || baseRepository.id || (proof.isCrossRepository === false && headRepository.slug === configuredRepositorySlug ? headRepository.id : null);
  proof.headRepositorySlug = headRepository.slug || canonicalRepositorySlug(headOwner && headName ? `${headOwner}/${headName}` : null);
  proof.headRepositoryId = headRepository.id || null;
  const origin = readOriginRepositoryProof({ config, runner });
  if (!origin.ok) return origin;
  proof.originRepositorySlug = origin.repositorySlug;
  if (proof.number !== pr?.number) return fail("existing_pr_batch_fix_pr_number_mismatch", "fresh PR number did not match");
  if (proof.state !== "OPEN") return fail("existing_pr_batch_fix_pr_not_open", "target PR must be open");
  if (proof.isDraft) return fail("existing_pr_batch_fix_pr_is_draft", "target PR must be non-draft");
  if (proof.headRefName !== (pr?.headRefName || pr?.branch)) return fail("existing_pr_batch_fix_pr_branch_mismatch", "fresh PR head branch did not match");
  if (expectedHead && proof.headRefOid !== expectedHead) return fail("existing_pr_batch_fix_pr_head_stale", "fresh PR head changed");
  if (!proof.baseRefName || proof.baseRefName === proof.headRefName) return fail("existing_pr_batch_fix_pr_base_invalid", "fresh PR base is invalid");
  const repositoryIdentity = validateRepositoryIdentityProof({ config, liveProof: proof, originProof: origin });
  if (!repositoryIdentity.ok) return repositoryIdentity;
  return { ok: true, proof, repositoryIdentity };
}

function readWorktreeCleanProof({ runner, cwd }) {
  const status = runner("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd });
  if (status.status !== 0 || status.error) return fail("existing_pr_batch_fix_status_failed", boundedText(status.stderr || status.error || status.stdout), { clean: false });
  const statusPorcelain = String(status.stdout || "").trim();
  return { ok: true, clean: statusPorcelain === "", statusPorcelain, checkedAt: new Date().toISOString() };
}

function createOrReuseLocalCandidateCommit({ config, runner, cwd, exactHead, changedFiles, message, localLoopState = null }) {
  const before = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_batch_fix_head_unreadable" });
  if (!before.ok) return before;
  if (before.sha !== exactHead) {
    const clean = readWorktreeCleanProof({ runner, cwd });
    if (!clean.ok) return clean;
    if (clean.clean !== true) {
      const journalAuthorizesDirtyHead = journalAuthorizesDirtyCandidate(localLoopState, before.sha);
      if (!journalAuthorizesDirtyHead) {
        return fail("existing_pr_batch_fix_candidate_dirty", "existing local candidate has unjournaled source changes");
      }
      return createLocalCandidateCommit({ runner, cwd, exactHead, changedFiles, message });
    }
    const chain = deriveCanonicalCommitChain({ runner, cwd, oldHead: exactHead, newHead: before.sha });
    if (!chain.ok) return chain;
    const tree = readGitSha({ runner, cwd, ref: "HEAD^{tree}", reasonCode: "existing_pr_batch_fix_candidate_tree_unreadable" });
    if (localLoopState?.candidateHead !== before.sha || (localLoopState.candidateTree && localLoopState.candidateTree !== tree.sha)) {
      const immediateParent = readGitSha({ runner, cwd, ref: `${before.sha}^`, reasonCode: "existing_pr_batch_fix_candidate_parent_unreadable" });
      const commitReservedRecovery = immediateParent.ok && localLoopState?.phase === "commit_reserved"
        && localLoopState.reservedParentHead === immediateParent.sha;
      const fixerCommittedRecovery = immediateParent.ok
        && ((localLoopState?.phase === "outer_fix_reserved" && localLoopState.reservedParentHead === immediateParent.sha)
          || (localLoopState?.phase === "source_fix_applied" && localLoopState.candidateHead === immediateParent.sha));
      const reservedRecovery = commitReservedRecovery || fixerCommittedRecovery;
      if (!reservedRecovery) return fail("existing_pr_batch_fix_candidate_journal_mismatch", "clean local descendant is not bound to the durable candidate journal");
      const recoveryParent = localLoopState.reservedParentHead || localLoopState.candidateHead;
      const files = runner("git", ["diff", "--name-only", `${recoveryParent}..${before.sha}`], { cwd });
      const subject = commitReservedRecovery ? runner("git", ["log", "-1", "--format=%s", before.sha], { cwd }) : { status: 0, stdout: localLoopState.reservedCommitMessage || "", error: null };
      const actualFilesDigest = files.status === 0 && !files.error ? digestStringSet(normalizeChangedFiles(String(files.stdout || "").split(/\r?\n/))) : null;
      if (subject.status !== 0 || subject.error || (commitReservedRecovery && String(subject.stdout || "").trim() !== localLoopState.reservedCommitMessage) || files.status !== 0 || files.error || (commitReservedRecovery && actualFilesDigest !== localLoopState.reservedChangedFilesDigest)) {
        return fail("existing_pr_batch_fix_candidate_journal_mismatch", "reserved candidate commit does not match its durable parent, message, and file-set identity");
      }
    }
    return { ok: true, reused: true, oldHead: exactHead, parent: chain.parent, newHead: before.sha, tree: tree.sha || null, commitChain: chain.chain, commitChainDigest: chain.digest, committedAt: new Date().toISOString() };
  }
  return createLocalCandidateCommit({ runner, cwd, exactHead, changedFiles, message });
}

function createLocalCandidateCommit({ runner, cwd, exactHead, changedFiles, message }) {
  for (const file of normalizeChangedFiles(changedFiles)) {
    const add = runner("git", ["add", "--", file], { cwd });
    if (add.status !== 0 || add.error) return fail("existing_pr_batch_fix_git_add_failed", boundedText(add.stderr || add.error || add.stdout));
  }
  const commit = runner("git", ["commit", "-m", message], { cwd });
  if (commit.status !== 0 || commit.error) return fail("existing_pr_batch_fix_commit_failed", boundedText(commit.stderr || commit.error || commit.stdout));
  const head = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_batch_fix_new_head_unreadable" });
  const parent = readGitSha({ runner, cwd, ref: "HEAD^", reasonCode: "existing_pr_batch_fix_candidate_parent_unreadable" });
  const tree = readGitSha({ runner, cwd, ref: "HEAD^{tree}", reasonCode: "existing_pr_batch_fix_candidate_tree_unreadable" });
  if (!head.ok || !parent.ok || !tree.ok) return head.ok ? parent.ok ? tree : parent : head;
  if (head.sha === exactHead) return fail("existing_pr_batch_fix_new_head_required", "candidate commit did not advance HEAD");
  const chain = deriveCanonicalCommitChain({ runner, cwd, oldHead: exactHead, newHead: head.sha });
  if (!chain.ok) return chain;
  if (chain.parent !== parent.sha) return fail("existing_pr_batch_fix_candidate_parent_mismatch", "candidate parent does not match canonical commit chain");
  return { ok: true, reused: false, oldHead: exactHead, parent: parent.sha, newHead: head.sha, tree: tree.sha, commitChain: chain.chain, commitChainDigest: chain.digest, committedAt: new Date().toISOString() };
}

function journalAuthorizesDirtyCandidate(localLoopState, currentHead) {
  if (!validSha(currentHead)) return false;
  return (localLoopState?.phase === "source_fix_applied" && localLoopState?.candidateHead === currentHead)
    || (localLoopState?.phase === "commit_reserved" && localLoopState?.reservedParentHead === currentHead);
}

function collectAppliedSourceFixFiles({ runner, cwd, candidateHead }) {
  if (!validSha(candidateHead)) return fail("existing_pr_local_loop_applied_identity_invalid", "journaled candidate head is invalid");
  const current = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_local_loop_recovery_head_unreadable" });
  if (!current.ok) return current;
  const committed = current.sha === candidateHead ? { status: 0, stdout: "", error: null } : runner("git", ["diff", "--binary", `${candidateHead}..${current.sha}`], { cwd });
  const unstaged = runner("git", ["diff", "--binary"], { cwd });
  const staged = runner("git", ["diff", "--cached", "--binary"], { cwd });
  const untracked = runner("git", ["ls-files", "--others", "--exclude-standard"], { cwd });
  if ([committed, unstaged, staged, untracked].some((result) => result.status !== 0 || result.error)) return fail("existing_pr_local_loop_applied_files_unreadable", "journal-authorized source-fix file identity is unreadable");
  const untrackedFiles = normalizeChangedFiles(String(untracked.stdout || "").split(/\r?\n/));
  const untrackedHashes = [];
  for (const file of untrackedFiles) {
    const hashed = runner("git", ["hash-object", "--", file], { cwd });
    if (hashed.status !== 0 || hashed.error || !validSha(String(hashed.stdout || "").trim())) return fail("existing_pr_local_loop_applied_files_unreadable", "untracked source-fix content identity is unreadable");
    untrackedHashes.push({ file, hash: String(hashed.stdout || "").trim() });
  }
  const committedNames = current.sha === candidateHead ? { status: 0, stdout: "", error: null } : runner("git", ["diff", "--name-only", `${candidateHead}..${current.sha}`], { cwd });
  const unstagedNames = runner("git", ["diff", "--name-only"], { cwd });
  const stagedNames = runner("git", ["diff", "--cached", "--name-only"], { cwd });
  if ([committedNames, unstagedNames, stagedNames].some((result) => result.status !== 0 || result.error)) return fail("existing_pr_local_loop_applied_files_unreadable", "source-fix path identity is unreadable");
  const committedFiles = normalizeChangedFiles(String(committedNames.stdout || "").split(/\r?\n/));
  const unstagedFiles = normalizeChangedFiles(String(unstagedNames.stdout || "").split(/\r?\n/));
  const stagedFiles = normalizeChangedFiles(String(stagedNames.stdout || "").split(/\r?\n/));
  const files = normalizeChangedFiles([...committedFiles, ...unstagedFiles, ...stagedFiles, ...untrackedFiles]);
  if (files.length === 0) return fail("existing_pr_local_loop_applied_files_missing", "journal-authorized source fix did not change files");
  const identityDigest = digestJson({
    candidateHead,
    currentHead: current.sha,
    committedPatchDigest: digestJson(committed.stdout || ""),
    unstagedPatchDigest: digestJson(unstaged.stdout || ""),
    stagedPatchDigest: digestJson(staged.stdout || ""),
    untrackedHashes,
  });
  return { ok: true, currentHead: current.sha, files, digest: digestStringSet(files), identityDigest };
}

function collectCumulativeCandidateContentIdentity({ runner, cwd, parentHead }) {
  if (!validSha(parentHead)) return fail("existing_pr_local_loop_precommit_identity_invalid", "reserved candidate parent is invalid");
  const current = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_local_loop_precommit_head_unreadable" });
  if (!current.ok) return current;
  if (current.sha !== parentHead) {
    const ancestry = runner("git", ["merge-base", "--is-ancestor", parentHead, current.sha], { cwd });
    if (ancestry.status !== 0 || ancestry.error) return fail("existing_pr_local_loop_precommit_ancestry_mismatch", "current candidate is not descended from its reserved parent");
  }
  const tracked = runner("git", ["diff", "--name-status", "--no-renames", parentHead], { cwd });
  const untracked = runner("git", ["ls-files", "--others", "--exclude-standard"], { cwd });
  if ([tracked, untracked].some((result) => result.status !== 0 || result.error)) return fail("existing_pr_local_loop_precommit_files_unreadable", "reserved candidate content identity is unreadable");
  const entries = new Map();
  for (const line of String(tracked.stdout || "").split(/\r?\n/)) {
    if (!line) continue;
    const [rawStatus, ...pathParts] = line.split("\t");
    const file = pathParts.join("\t").trim();
    const status = String(rawStatus || "").slice(0, 1);
    if (!file || !["A", "D", "M", "T", "U"].includes(status)) return fail("existing_pr_local_loop_precommit_files_unreadable", "reserved candidate tracked file identity is malformed");
    entries.set(file, { file, status });
  }
  for (const file of normalizeChangedFiles(String(untracked.stdout || "").split(/\r?\n/))) entries.set(file, { file, status: "A" });
  if (entries.size === 0) return fail("existing_pr_local_loop_precommit_files_missing", "pre-commit reservation requires source changes");
  const content = [];
  for (const entry of [...entries.values()].sort((left, right) => left.file.localeCompare(right.file))) {
    if (entry.status === "D") {
      content.push({ ...entry, hash: null });
      continue;
    }
    const hashed = runner("git", ["hash-object", "--", entry.file], { cwd });
    const hash = String(hashed.stdout || "").trim();
    if (hashed.status !== 0 || hashed.error || !validSha(hash)) return fail("existing_pr_local_loop_precommit_files_unreadable", "reserved candidate file content identity is unreadable");
    let fileMode;
    try {
      const info = lstatSync(path.join(cwd, entry.file));
      if (info.isSymbolicLink()) fileMode = "120000";
      else if (info.isFile()) fileMode = (info.mode & 0o111) !== 0 ? "100755" : "100644";
      else return fail("existing_pr_local_loop_precommit_files_unreadable", "reserved candidate file type is unsupported");
    } catch {
      return fail("existing_pr_local_loop_precommit_files_unreadable", "reserved candidate file mode identity is unreadable");
    }
    content.push({ ...entry, hash, fileMode });
  }
  return { ok: true, currentHead: current.sha, files: content.map((entry) => entry.file), identityDigest: digestJson({ parentHead, content }) };
}

function persistAppliedSourceFix({ runner, cwd, statePath, state }) {
  const applied = collectAppliedSourceFixFiles({ runner, cwd, candidateHead: state.candidateHead });
  if (!applied.ok) return applied;
  return { ok: true, state: persistLocalCandidateLoopState(statePath, { ...state, phase: "source_fix_applied", appliedHead: applied.currentHead, appliedChangedFilesDigest: applied.identityDigest, evidenceInvalidated: true }) };
}

function applyFrozenLocalFindingBatch({ config, runner = defaultRunner, codexPromptRunner = runCodexPrompt, cwd, pr, statePath, state }) {
  if (!["findings_frozen", "source_fix_reserved"].includes(state.phase) || !state.frozenFindingDigest || !Array.isArray(state.frozenFindings) || !state.frozenFixPrompt) {
    return fail("existing_pr_local_loop_frozen_batch_invalid", "frozen local finding batch is incomplete or contradictory");
  }
  const recomputedDigest = digestStringSet(state.frozenFindings.map((finding) => finding.fingerprint));
  if (recomputedDigest !== state.frozenFindingDigest) return fail("existing_pr_local_loop_frozen_batch_digest_mismatch", "frozen local finding batch digest does not match its inventory");
  const localPromptPath = path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "review-fix", `pr-${pr?.number || "unknown"}-local-round-${state.localRound}-${state.frozenFindingDigest}.md`);
  try { validateDurableArtifactPath(config, localPromptPath); } catch (error) { return fail("existing_pr_local_loop_prompt_path_unsafe", boundedText(error.message)); }
  mkdirSync(path.dirname(localPromptPath), { recursive: true, mode: 0o700 });
  try { validateDurableArtifactPath(config, localPromptPath); } catch (error) { return fail("existing_pr_local_loop_prompt_path_unsafe", boundedText(error.message)); }
  if (!existsSync(localPromptPath)) writeFileSync(localPromptPath, `${state.frozenFixPrompt}\n`, { mode: 0o600 });
  const recoveryWorktree = readWorktreeCleanProof({ runner, cwd });
  if (!recoveryWorktree.ok) return recoveryWorktree;
  const recoveryHead = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_local_loop_recovery_head_unreadable" });
  if (!recoveryHead.ok) return recoveryHead;
  const committedMutation = recoveryHead.sha !== state.candidateHead;
  if (committedMutation) {
    const ancestry = runner("git", ["merge-base", "--is-ancestor", state.candidateHead, recoveryHead.sha], { cwd });
    if (ancestry.status !== 0 || ancestry.error) return fail("existing_pr_local_loop_recovery_head_mismatch", "recovered local head is not a descendant of the journaled candidate");
  }
  if (state.phase === "source_fix_reserved") {
    if (!recoveryWorktree.clean || committedMutation) return persistAppliedSourceFix({ runner, cwd, statePath, state });
  }
  if (!recoveryWorktree.clean || committedMutation) {
    return fail("existing_pr_local_loop_unreserved_mutation", "local source changes appeared before the durable fix reservation");
  }
  const reserved = state.phase === "source_fix_reserved" ? state : persistLocalCandidateLoopState(statePath, { ...state, phase: "source_fix_reserved", mutationClaimId: digestJson({ prNumber: pr?.number, candidateHead: state.candidateHead, localRound: state.localRound, frozenFindingDigest: state.frozenFindingDigest }) });
  const localFix = codexPromptRunner({ ...config, repoRoot: cwd }, { branchName: pr?.headRefName || pr?.branch || "unknown", prompt: reserved.frozenFixPrompt, promptPath: localPromptPath }, "existing-pr-stack-inner-local-fix");
  if (!localFix.skipped && (localFix.error || localFix.status !== 0)) return fail("existing_pr_local_loop_fix_failed", localFix.error || localFix.tail || "local finding batch fix failed");
  return persistAppliedSourceFix({ runner, cwd, statePath, state: reserved });
}

function evaluateLocalFixAllowance({ config = {}, sourceCycleBudget = null, localRound }) {
  const availableSourceChanges = Number.isInteger(sourceCycleBudget?.remaining)
    ? sourceCycleBudget.remaining
    : normalizeSourceCycleMax(config);
  if (!Number.isInteger(localRound) || localRound < 1 || !Number.isInteger(availableSourceChanges) || availableSourceChanges < 0) {
    return fail("existing_pr_local_loop_limit_malformed", "local source-changing allowance is malformed");
  }
  if (1 + localRound > availableSourceChanges) {
    return fail("existing_pr_local_loop_limit_exhausted", "the initial candidate plus local fixes would exceed the configured source-changing allowance");
  }
  return { ok: true, localRound, availableSourceChanges };
}

function advanceLocalCandidateHistory(candidateHistory, head, digest) {
  const history = Array.isArray(candidateHistory) ? candidateHistory : [];
  if (!validSha(head) || !/^[a-f0-9]{64}$/.test(digest || "")) return fail("existing_pr_local_loop_candidate_identity_invalid", "local candidate history requires a valid head and digest");
  if (history.some((entry) => entry?.digest === digest && entry?.head !== head)) {
    return fail("existing_pr_local_loop_oscillation", "local source fixes returned to an earlier cumulative candidate identity");
  }
  if (history.some((entry) => entry?.digest === digest && entry?.head === head)) return { ok: true, changed: false, candidateHistory: history };
  return { ok: true, changed: true, candidateHistory: [...history, { head, digest }].slice(-6) };
}

function localCandidateLoopStatePath({ config = {}, pr = {}, exactHead }) {
  const identity = digestJson({
    repository: config.repositorySlug || "tommytang213/Settleora",
    prNumber: pr.number,
    sourceBranch: pr.headRefName || pr.branch || null,
    baseRef: pr.baseRefName || pr.base || "main",
    exactHead,
    taskKey: config.taskKey || null,
  });
  return path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "local-candidate-loop", `${identity}.json`);
}

function loadOrCreateLocalCandidateLoopState({ config = {}, pr = {}, exactHead, localLoop = null }) {
  if (!Number.isInteger(pr.number) || !validSha(exactHead)) return fail("existing_pr_local_loop_identity_invalid", "local candidate loop requires an exact PR/head identity");
  const statePath = localCandidateLoopStatePath({ config, pr, exactHead });
  try {
    validateLocalCandidateLoopStatePath(statePath);
  } catch (error) {
    return fail("existing_pr_local_loop_state_unsafe", boundedText(error.message));
  }
  let state = localLoop;
  if (!state && existsSync(statePath)) {
    let fd;
    try {
      fd = openSync(statePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      const stat = fstatSync(fd);
      const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
      if (!stat.isFile() || stat.size <= 0 || stat.size > maxProtectedPlanAuthorizationBytes || (currentUid !== null && stat.uid !== currentUid) || (stat.mode & 0o077) !== 0) {
        return fail("existing_pr_local_loop_state_unsafe", "local candidate loop state must be a bounded owner-only regular file");
      }
      const bytes = Buffer.alloc(stat.size);
      if (readSync(fd, bytes, 0, stat.size, 0) !== stat.size || !isUtf8(bytes)) return fail("existing_pr_local_loop_state_unsafe", "local candidate loop state must be complete UTF-8");
      state = JSON.parse(bytes.toString("utf8"));
    } catch {
      return fail("existing_pr_local_loop_state_corrupt", "local candidate loop state is unreadable");
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
  state ||= {
    stateVersion: 1,
    repository: config.repositorySlug || "tommytang213/Settleora",
    prNumber: pr.number,
    sourceBranch: pr.headRefName || pr.branch || null,
    baseRef: pr.baseRefName || pr.base || "main",
    originalHead: exactHead,
    taskKey: config.taskKey || null,
    runId: config.runId || null,
    supervisorRunId: config.supervisorRunId || null,
    githubEpoch: 1,
    localRound: 0,
    findingDigests: [],
    phase: "candidate_prepared",
    restartGeneration: 0,
    createdAt: new Date().toISOString(),
  };
  const expected = {
    repository: config.repositorySlug || "tommytang213/Settleora",
    prNumber: pr.number,
    sourceBranch: pr.headRefName || pr.branch || null,
    originalHead: exactHead,
  };
  if (state.stateVersion !== 1 || state.repository !== expected.repository || state.prNumber !== expected.prNumber || state.sourceBranch !== expected.sourceBranch || state.originalHead !== expected.originalHead) {
    return fail("existing_pr_local_loop_identity_mismatch", "local candidate loop state belongs to a different repository, PR, branch, or candidate parent");
  }
  if (!Number.isInteger(state.localRound) || state.localRound < 0 || state.localRound > 50 || !Array.isArray(state.findingDigests)) {
    return fail("existing_pr_local_loop_state_contradictory", "local candidate loop counters or finding markers are contradictory");
  }
  if (state.candidateHistory !== undefined && (!Array.isArray(state.candidateHistory) || state.candidateHistory.length > 6 || state.candidateHistory.some((entry) => !validSha(entry?.head) || !/^[a-f0-9]{64}$/.test(entry?.digest || "")))) {
    return fail("existing_pr_local_loop_state_contradictory", "local candidate history is malformed or exceeds its bounded window");
  }
  if (state.phase === "source_fix_applied" && (!validSha(state.appliedHead) || !/^[a-f0-9]{64}$/.test(state.appliedChangedFilesDigest || ""))) {
    return fail("existing_pr_local_loop_state_contradictory", "applied source-fix identity is missing or malformed");
  }
  if (state.phase === "commit_reserved" && (!validSha(state.reservedParentHead) || !/^[a-f0-9]{64}$/.test(state.reservedChangedFilesDigest || "") || !/^[a-f0-9]{64}$/.test(state.reservedWorktreeIdentityDigest || "") || !state.reservedCommitMessage)) {
    return fail("existing_pr_local_loop_state_contradictory", "pre-commit reservation identity is missing or malformed");
  }
  return { ok: true, state: { ...state, restartGeneration: Number(state.restartGeneration || 0) + (existsSync(statePath) ? 1 : 0) }, statePath };
}

function persistLocalCandidateLoopState(statePath, state) {
  validateLocalCandidateLoopStatePath(statePath);
  mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  validateLocalCandidateLoopStatePath(statePath);
  const sanitized = sanitizeState({ ...state, updatedAt: new Date().toISOString() });
  const tmp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, statePath);
  return sanitized;
}

function validateLocalCandidateLoopStatePath(statePath) {
  const logsRoot = path.dirname(path.dirname(statePath));
  validateExplicitStackStatePath(statePath, logsRoot);
}

function validateDurableArtifactPath(config, artifactPath) {
  validateExplicitStackStatePath(path.resolve(artifactPath), path.resolve(config.logsRoot || "/workspace/logs/settleora-auto-runner"));
}

function readOwnerOnlyDurableJson(config, artifactPath) {
  validateDurableArtifactPath(config, artifactPath);
  const fd = openSync(artifactPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxProtectedPlanAuthorizationBytes || (currentUid !== null && stat.uid !== currentUid) || (stat.mode & 0o077) !== 0) {
      throw new Error("durable artifact must be a bounded owner-only regular file");
    }
    const bytes = Buffer.alloc(stat.size);
    if (readSync(fd, bytes, 0, stat.size, 0) !== stat.size || !isUtf8(bytes)) throw new Error("durable artifact must be complete UTF-8");
    return JSON.parse(bytes.toString("utf8"));
  } finally {
    closeSync(fd);
  }
}

function persistPushIntent({ config, markerKey, pr, branch, oldHead, newHead, changedFiles, fixDelta = null, fingerprintDigest, reviewed, pushTarget, liveProof = null, repositoryIdentity = null, sourceCycleReservation = null, reviewConvergenceState = null }) {
  const root = path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "source-cycle-intents");
  const intentPath = path.join(root, `${digestJson({ markerKey, prNumber: pr?.number, oldHead, newHead })}.json`);
  validateDurableArtifactPath(config, intentPath);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  validateDurableArtifactPath(config, intentPath);
  const sourceIdentity = reviewed?.sourceIdentity || {};
  const commitChain = normalizeCommitChain(sourceIdentity.commitChain || [oldHead, sourceIdentity.parent, newHead]);
  const commitChainDigest = sourceIdentity.commitChainDigest || digestStringList(commitChain);
  const intent = sanitizeState({
    status: "push_intent",
    markerKey,
    prNumber: pr?.number || null,
    repository: config.repositorySlug || "tommytang213/Settleora",
    configuredRepositorySlug: repositoryIdentity?.configuredRepositorySlug || sourceIdentity.configuredRepositorySlug || config.repositorySlug || "tommytang213/Settleora",
    baseRepositorySlug: repositoryIdentity?.baseRepositorySlug || liveProof?.baseRepositorySlug || sourceIdentity.baseRepositorySlug || null,
    headRepositorySlug: repositoryIdentity?.headRepositorySlug || liveProof?.headRepositorySlug || sourceIdentity.headRepositorySlug || null,
    originRepositorySlug: repositoryIdentity?.originRepositorySlug || liveProof?.originRepositorySlug || sourceIdentity.originRepositorySlug || null,
    repositoryIds: {
      baseRepositoryId: repositoryIdentity?.repositoryIds?.baseRepositoryId || liveProof?.baseRepositoryId || sourceIdentity.repositoryIds?.baseRepositoryId || null,
      headRepositoryId: repositoryIdentity?.repositoryIds?.headRepositoryId || liveProof?.headRepositoryId || sourceIdentity.repositoryIds?.headRepositoryId || null,
    },
    sourceBranch: branch,
    oldHead,
    candidateNewHead: newHead,
    candidateParent: sourceIdentity.parent || null,
    candidateTree: sourceIdentity.tree || null,
    commitChain,
    commitChainDigest,
    findingInventoryDigest: fingerprintDigest || null,
    findingFingerprints: reviewed?.sourceIdentity?.findingFingerprints || [],
    changedFiles,
    changedFilesDigest: digestStringSet(changedFiles),
    fixDelta: fixDelta || reviewed?.fixDelta || null,
    fullCandidatePrDelta: reviewed?.fullCandidatePrDelta || sourceIdentity.fullCandidatePrDelta || null,
    patchDigest: sourceIdentity.patchDigest || null,
    sourceCycleEpoch: sourceIdentity.epoch || 1,
    nextSourceCycleCount: sourceIdentity.nextSourceCycleCount || null,
    sourceCycleReservationId: sourceCycleReservation?.reservationId || null,
    sourceCycleReservation: sourceCycleReservation || null,
    reviewConvergenceState: reviewConvergenceState || null,
    taskKey: config.taskKey || null,
    runId: config.runId || null,
    supervisorRunId: config.supervisorRunId || null,
    validationHead: reviewed?.validation?.headSha || null,
    strongReviewHead: reviewed?.externalReview?.reviewedHead || reviewed?.externalReview?.headSha || null,
    validation: reviewed?.validation || null,
    externalReview: reviewed?.externalReview || null,
    review: reviewed?.review || null,
    sourceIdentity,
    pushTarget,
    intentPath,
    timestamp: new Date().toISOString(),
  });
  const tmp = `${intentPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(intent, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, intentPath);
  return intent;
}

function reconcilePushIntent({ config, pr, intent, runner, requireCandidate = false }) {
  const validation = validatePushIntentShape({ config, pr, intent });
  if (!validation.ok) return validation;
  const branch = intent.sourceBranch;
  const cwd = config.repoRoot || process.cwd();
  const fetch = runner("git", ["fetch", "origin", branch], { cwd });
  if (fetch.status !== 0 || fetch.error) return fail("push_intent_fetch_failed", boundedText(fetch.stderr || fetch.error || fetch.stdout));
  const baseFetch = runner("git", ["fetch", "origin", "main"], { cwd });
  if (baseFetch.status !== 0 || baseFetch.error) return fail("push_intent_base_fetch_failed", boundedText(baseFetch.stderr || baseFetch.error || baseFetch.stdout));
  const remote = readGitSha({ runner, cwd, ref: `origin/${branch}`, reasonCode: "push_intent_remote_unreadable" });
  const local = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "push_intent_local_head_unreadable" });
  const rederivedChain = deriveCanonicalCommitChain({ runner, cwd, oldHead: intent.oldHead, newHead: intent.candidateNewHead, reasonPrefix: "push_intent" });
  if (!rederivedChain.ok) return rederivedChain;
  if (!sameStringList(rederivedChain.chain, intent.commitChain || [])) return fail("push_intent_commit_chain_mismatch", "push intent commit chain does not match git first-parent ancestry");
  if (intent.commitChainDigest && intent.commitChainDigest !== rederivedChain.digest) return fail("push_intent_commit_chain_digest_mismatch", "push intent commit-chain digest does not match git first-parent ancestry");
  const live = readLivePrProof({ config, pr, expectedHead: null, runner });
  if (!live.ok) return live;
  const repositoryIdentity = validateRepositoryIdentityProof({ config, liveProof: live.proof, originProof: { repositorySlug: live.proof.originRepositorySlug }, intent });
  if (!repositoryIdentity.ok) return repositoryIdentity;
  const remoteHead = remote.ok ? remote.sha : null;
  const localHead = local.ok ? local.sha : null;
  const liveHead = live.proof.headRefOid;
  if (remoteHead === intent.candidateNewHead && liveHead === intent.candidateNewHead) {
    return finalizePushIntent({ config, pr, intent, remoteHead, liveHead, localHead });
  }
  if (!requireCandidate && remoteHead === intent.oldHead && (!liveHead || liveHead === intent.oldHead)) {
    if (localHead === intent.candidateNewHead) {
      return fail("push_intent_unpushed_candidate", "push intent has a recoverable unpushed local candidate", { localHead, remoteHead, liveHead });
    }
    return fail("push_intent_not_completed", "push intent exists but remote/live heads remain at old head", { localHead, remoteHead, liveHead });
  }
  if (requireCandidate && (remoteHead !== intent.candidateNewHead || liveHead !== intent.candidateNewHead)) {
    return fail("push_confirmation_head_mismatch", "push completed without remote/live candidate equality", { localHead, remoteHead, liveHead });
  }
  return fail("push_intent_conflicting_head", "remote/live head conflicts with durable push intent", { localHead, remoteHead, liveHead });
}

function finalizePushIntent({ config = {}, pr = {}, intent, remoteHead, liveHead, localHead = null }) {
  if (intent.status === "push_confirmed") {
    const finalizedReservation = intent.sourceCycleReservation || null;
    if (finalizedReservation?.status !== "source_cycle_finalized") return fail("source_cycle_reservation_conflict", "confirmed push intent is missing finalized source-cycle reservation proof");
    return { ok: true, finalized: true, idempotent: true, confirmedAt: intent.finalizedAt || null, marker: intent, sourceCycleReservation: finalizedReservation };
  }
  const reservation = finalizeSourceCycleReservation({ config, pr, intent, remoteHead, liveHead, localHead });
  if (!reservation.ok) return reservation;
  const confirmed = sanitizeState({
    ...intent,
    status: "push_confirmed",
    sourceCycleReservation: reservation.reservation,
    localHead,
    remoteHead,
    liveHead,
    confirmedRepositoryIdentity: {
      configuredRepositorySlug: intent.configuredRepositorySlug || intent.repository || null,
      baseRepositorySlug: intent.baseRepositorySlug || null,
      headRepositorySlug: intent.headRepositorySlug || null,
      originRepositorySlug: intent.originRepositorySlug || null,
      repositoryIds: intent.repositoryIds || {},
    },
    finalizedAt: new Date().toISOString(),
  });
  const tmp = `${intent.intentPath}.${process.pid}.${Date.now()}.confirmed.tmp`;
  validateDurableArtifactPath(config, intent.intentPath);
  writeFileSync(tmp, `${JSON.stringify(confirmed, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, intent.intentPath);
  return { ok: true, finalized: true, confirmedAt: confirmed.finalizedAt, marker: confirmed, sourceCycleReservation: reservation.reservation };
}

function reconcileTaskScopedPendingPushIntent({ config = {}, state = {}, pr = {}, livePr = {}, runner = defaultRunner } = {}) {
  const discovered = discoverTaskScopedPendingPushIntents({ config, state, pr, livePr });
  if (!discovered.ok) return discovered;
  if (discovered.intents.length === 0) return fail("push_intent_not_found", "no task-scoped pending push intent matches stale PR head");
  if (discovered.intents.length > 1) return fail("push_intent_ambiguous", "multiple task-scoped pending push intents match stale PR head");
  const intent = discovered.intents[0];
  const reconciled = reconcilePushIntent({ config, pr, intent, runner });
  if (!reconciled.ok) return reconciled;
  const sourceResult = sourceChangingResultFromIntent({ intent, confirmation: reconciled });
  if (!sourceResult.ok) return sourceResult;
  return { ok: true, finalized: true, newHead: intent.candidateNewHead, result: sourceResult.result, pushConfirmation: reconciled.marker, pushIntent: intent, sourceCycleReservation: reconciled.sourceCycleReservation };
}

function discoverTaskScopedPendingPushIntents({ config = {}, state = {}, pr = {}, livePr = {} } = {}) {
  const root = path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "source-cycle-intents");
  if (!existsSync(root)) return { ok: true, intents: [] };
  try {
    validateDurableArtifactPath(config, path.join(root, ".inventory-proof"));
  } catch (error) {
    return fail("push_intent_inventory_untrusted", boundedText(error.message));
  }
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    return fail("push_intent_inventory_unreadable", error.message);
  }
  const intents = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const intentPath = path.join(root, entry.name);
    let parsed;
    try {
      parsed = readOwnerOnlyDurableJson(config, intentPath);
    } catch {
      return fail("push_intent_malformed", "task-scoped push intent JSON could not be parsed", { intentPath });
    }
    const intent = { ...parsed, intentPath: parsed.intentPath || intentPath };
    if (isTerminalPushIntentStatus(intent.status)) continue;
    if (!["push_intent", "push_confirmed"].includes(String(intent.status || ""))) {
      return fail("push_intent_status_unknown", "task-scoped push intent status is not recoverable or terminal", { intentPath });
    }
    const matched = intentMatchesStalePr({ config, state, pr, livePr, intent });
    if (matched.ok) intents.push(intent);
    else if (matched.reasonCode) return { ...matched, intentPath };
  }
  return { ok: true, intents };
}

function isTerminalPushIntentStatus(status) {
  return ["rebound_finalized", "push_rebound_finalized", "blocked", "cancelled", "canceled", "push_blocked", "push_cancelled"].includes(String(status || ""));
}

function intentMatchesStalePr({ config = {}, state = {}, pr = {}, livePr = {}, intent = {} } = {}) {
  const validation = validatePushIntentShape({ config, pr, intent });
  if (!validation.ok) {
    if (validation.reasonCode === "push_intent_malformed" || String(validation.reasonCode || "").startsWith("source_cycle_")) return validation;
    return { ok: false, ignored: true };
  }
  if (intent.oldHead !== pr.headRefOid) return { ok: false, ignored: true };
  if (livePr?.headRefOid && livePr.headRefOid !== intent.candidateNewHead) return { ok: false, ignored: true };
  if (livePr?.headRepositorySlug || livePr?.baseRepositorySlug || livePr?.originRepositorySlug) {
    const repositoryIdentity = validateRepositoryIdentityProof({ config, liveProof: livePr, originProof: { repositorySlug: livePr.originRepositorySlug || intent.originRepositorySlug }, intent });
    if (!repositoryIdentity.ok) return repositoryIdentity;
  }
  if (intent.markerKey && !String(intent.markerKey).startsWith(`existing_pr_batch_fix:${pr.number}:${pr.headRefOid}:`)) return { ok: false, ignored: true };
  const reservation = intent.sourceCycleReservation || null;
  if (!reservation) return fail("source_cycle_reservation_missing", "push intent cannot reconcile without a source-cycle reservation");
  const currentCount = state.sourceCycles?.[pr.number];
  if (!Number.isInteger(currentCount) || currentCount < 0) return fail("source_cycle_state_malformed", "durable source-cycle count is malformed");
  const alreadyRebound = state.exactHeads?.[pr.number] === intent.candidateNewHead
    && state.orderedPrs?.some((entry) => entry.number === pr.number && entry.headRefOid === intent.candidateNewHead)
    && currentCount === reservation.consumedAfter;
  if (alreadyRebound) return { ok: false, ignored: true };
  if (intent.status === "push_confirmed") {
    if (reservation.status !== "source_cycle_finalized") return fail("source_cycle_reservation_conflict", "confirmed push intent is missing finalized source-cycle reservation proof");
    if (currentCount !== reservation.consumedBefore) return fail("source_cycle_reservation_conflict", "confirmed push intent can only recover an incomplete rebound from the reservation consumed-before count");
    const finalized = validateSourceCycleReservation({ config, state: { ...state, sourceCycles: { ...(state.sourceCycles || {}), [pr.number]: reservation.consumedBefore } }, pr, reservation, oldHead: pr.headRefOid, newHead: intent.candidateNewHead, changedFiles: intent.changedFiles, fingerprintDigest: intent.findingInventoryDigest, expectStatus: "source_cycle_finalized", requireCurrentCount: true });
    if (!finalized.ok) return finalized;
  } else if (currentCount === reservation.consumedBefore) {
    const pending = validateSourceCycleReservation({ config, state, pr, reservation, oldHead: pr.headRefOid, newHead: intent.candidateNewHead, changedFiles: intent.changedFiles, fingerprintDigest: intent.findingInventoryDigest, expectStatus: "source_cycle_reserved", requireCurrentCount: true });
    if (!pending.ok) return pending;
  } else if (currentCount === reservation.consumedAfter) {
    if (reservation.status !== "source_cycle_finalized") return fail("source_cycle_reservation_conflict", "source-cycle count reached reserved ordinal without matching finalization proof");
  } else {
    return fail("source_cycle_reservation_conflict", "source-cycle count conflicts with pending push intent reservation");
  }
  if (intent.nextSourceCycleCount != null && intent.nextSourceCycleCount !== reservation.consumedAfter) return fail("source_cycle_reservation_conflict", "push intent next source-cycle count does not match reservation");
  return { ok: true };
}

function validatePushIntentShape({ config = {}, pr = {}, intent = {} } = {}) {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return fail("push_intent_malformed", "push intent must be an object");
  const configuredRepositorySlug = canonicalRepositorySlug(config.repositorySlug || "tommytang213/Settleora");
  if (!configuredRepositorySlug) return fail("configured_repository_invalid", "configured repository slug must be owner/name");
  if (intent.repository !== configuredRepositorySlug) return fail("push_intent_repository_mismatch", "push intent repository does not match");
  if (canonicalRepositorySlug(intent.configuredRepositorySlug) !== configuredRepositorySlug) return fail("push_intent_repository_mismatch", "push intent configured repository does not match");
  if (canonicalRepositorySlug(intent.baseRepositorySlug) !== configuredRepositorySlug) return fail("push_intent_base_repository_mismatch", "push intent base repository does not match");
  if (canonicalRepositorySlug(intent.headRepositorySlug) !== configuredRepositorySlug) return fail("push_intent_head_repository_mismatch", "push intent head repository does not match");
  if (canonicalRepositorySlug(intent.originRepositorySlug) !== configuredRepositorySlug) return fail("push_intent_origin_repository_mismatch", "push intent origin repository does not match");
  if (intent.prNumber !== pr.number) return fail("push_intent_pr_mismatch", "push intent PR number does not match");
  if (intent.sourceBranch !== pr.headRefName) return fail("push_intent_branch_mismatch", "push intent source branch does not match");
  if (!validSha(intent.oldHead) || !validSha(intent.candidateNewHead)) return fail("push_intent_malformed", "push intent head identity is invalid");
  if (!validSha(intent.candidateParent) || !validSha(intent.candidateTree)) return fail("push_intent_malformed", "push intent candidate parent/tree identity is invalid");
  const commitChain = validateCanonicalCommitChain(intent.commitChain || [], {
    oldHead: intent.oldHead,
    newHead: intent.candidateNewHead,
    candidateParent: intent.candidateParent,
    reasonPrefix: "push_intent",
  });
  if (!commitChain.ok) return commitChain;
  if (intent.commitChainDigest && intent.commitChainDigest !== commitChain.digest) return fail("push_intent_commit_chain_digest_mismatch", "push intent commit-chain digest does not match");
  const changedFiles = normalizeChangedFiles(intent.changedFiles || []);
  if (changedFiles.length === 0 || intent.changedFilesDigest !== digestStringSet(changedFiles)) return fail("push_intent_changed_files_mismatch", "push intent changed-file digest does not match");
  if (!intent.findingInventoryDigest) return fail("push_intent_finding_digest_missing", "push intent finding inventory digest is missing");
  if (intent.validationHead !== intent.candidateNewHead || intent.strongReviewHead !== intent.candidateNewHead) {
    return fail("push_intent_evidence_head_mismatch", "push intent validation/review identity is not bound to candidate head");
  }
  const expectedBase = intent.sourceIdentity?.baseSha || intent.validation?.baseSha || intent.externalReview?.baseSha || intent.review?.baseSha || null;
  if (!validSha(expectedBase)) return fail("push_intent_evidence_base_missing", "push intent validation/review base identity is missing");
  const validation = validateValidationEvidenceObject(intent.validation, {
    expectedHead: intent.candidateNewHead,
    expectedBase,
    changedFiles,
  });
  if (!validation.ok) return validation;
  const strong = validateReviewEvidenceObject(intent.externalReview, {
    name: "push_intent_strong_review",
    expectedHead: intent.candidateNewHead,
    expectedBase,
    changedFiles,
    requireIndependent: true,
  });
  if (!strong.ok) return strong;
  const codex = validateReviewEvidenceObject(intent.review, {
    name: "push_intent_codex_review",
    expectedHead: intent.candidateNewHead,
    expectedBase,
    changedFiles,
    requireIndependent: false,
  });
  if (!codex.ok) return codex;
  if (config.taskKey !== undefined && intent.taskKey !== (config.taskKey || null)) return fail("push_intent_task_mismatch", "push intent task key does not match");
  if (config.runId !== undefined && intent.runId !== (config.runId || null)) return fail("push_intent_run_mismatch", "push intent run ID does not match");
  if (config.supervisorRunId !== undefined && intent.supervisorRunId !== (config.supervisorRunId || null)) return fail("push_intent_supervisor_mismatch", "push intent supervisor run ID does not match");
  const expectedTarget = `origin ${intent.candidateNewHead}:${intent.sourceBranch}`;
  if (intent.pushTarget !== expectedTarget) return fail("push_intent_target_mismatch", "push intent push target does not match candidate/source branch");
  const reservation = validateSourceCycleReservation({
    config,
    state: { sourceCycles: { [pr.number]: intent.sourceCycleReservation?.consumedBefore }, sourceCycleEpoch: { [pr.number]: intent.sourceCycleReservation?.sourceCycleEpoch } },
    pr,
    reservation: intent.sourceCycleReservation,
    oldHead: intent.oldHead,
    newHead: intent.candidateNewHead,
    changedFiles,
    fingerprintDigest: intent.findingInventoryDigest,
    expectStatus: intent.status === "push_confirmed" ? "source_cycle_finalized" : "source_cycle_reserved",
    requireCurrentCount: true,
  });
  if (!reservation.ok) return reservation.reasonCode === "source_cycle_reservation_status_mismatch" ? fail("source_cycle_reservation_conflict", reservation.reason) : reservation;
  return { ok: true };
}

function sourceChangingResultFromIntent({ intent = {}, confirmation = {} } = {}) {
  const markerKey = intent.markerKey || `existing_pr_batch_fix:${intent.prNumber}:${intent.oldHead}:${intent.findingInventoryDigest}`;
  const changedFiles = normalizeChangedFiles(intent.changedFiles || []);
  const commitChain = normalizeCommitChain(intent.commitChain || [intent.oldHead, intent.candidateParent, intent.candidateNewHead]);
  const marker = sanitizeState({
    markerKey,
    prNumber: intent.prNumber,
    oldHead: intent.oldHead,
    newHead: intent.candidateNewHead,
    findingFingerprints: intent.findingFingerprints || [],
    fingerprintDigest: intent.findingInventoryDigest,
    changedFiles,
    changedFilesDigest: intent.changedFilesDigest,
    fixDelta: intent.fixDelta || null,
    fullCandidatePrDelta: intent.fullCandidatePrDelta || intent.sourceIdentity?.fullCandidatePrDelta || null,
    validation: intent.validation,
    externalReview: intent.externalReview,
    review: intent.review,
    sourceIdentity: {
      ...(intent.sourceIdentity || {}),
      configuredRepositorySlug: intent.configuredRepositorySlug || intent.repository || null,
      baseRepositorySlug: intent.baseRepositorySlug || null,
      headRepositorySlug: intent.headRepositorySlug || null,
      originRepositorySlug: intent.originRepositorySlug || null,
      repositoryIds: intent.repositoryIds || {},
      oldHead: intent.oldHead,
      headSha: intent.candidateNewHead,
      newHead: intent.candidateNewHead,
      parent: intent.candidateParent,
      tree: intent.candidateTree,
      commitChain,
      commitChainDigest: intent.commitChainDigest || digestStringList(commitChain),
      baseSha: intent.sourceIdentity?.baseSha || intent.validation?.baseSha || intent.externalReview?.baseSha || intent.review?.baseSha || null,
      changedFilesDigest: intent.changedFilesDigest,
      fullCandidatePrDelta: intent.fullCandidatePrDelta || intent.sourceIdentity?.fullCandidatePrDelta || null,
      fixDelta: intent.fixDelta || null,
      sourceCycleReservation: confirmation.sourceCycleReservation || confirmation.marker?.sourceCycleReservation || intent.sourceCycleReservation || null,
    },
    pushedAt: confirmation.confirmedAt || confirmation.marker?.finalizedAt || new Date().toISOString(),
  });
  if (intent.reviewConvergenceState) {
    const convergenceValidation = validateReviewConvergenceState(intent.reviewConvergenceState);
    const reservation = intent.sourceCycleReservation || confirmation.sourceCycleReservation || confirmation.marker?.sourceCycleReservation || null;
    if (!convergenceValidation.ok
      || intent.reviewConvergenceState.pr?.number !== intent.prNumber
      || intent.reviewConvergenceState.pr?.exactHead !== intent.oldHead
      || intent.reviewConvergenceState.epoch !== reservation?.sourceCycleEpoch
      || intent.reviewConvergenceState.counters?.localSourceChangingRoundsPerEpoch !== reservation?.consumedBefore) {
      return fail("source_cycle_recovered_convergence_identity_mismatch", "push-intent convergence state is not bound to the reservation PR, old head, epoch, and local count");
    }
  }
  const recoveredConvergence = intent.reviewConvergenceState
    ? accountConvergenceEvent(intent.reviewConvergenceState, {
        kind: "source_changed",
        newHead: intent.candidateNewHead,
        reasonCode: "existing_pr_review_convergence_fix_recovered",
        roundsConsumed: intent.sourceCycleReservation?.roundsConsumed || 1,
      })
    : null;
  if (intent.reviewConvergenceState && !recoveredConvergence?.consumedSourceCycle) {
    return fail("source_cycle_recovered_convergence_invalid", recoveredConvergence?.reason || "push intent could not reconstruct two-loop convergence state");
  }
  const result = {
    ok: true,
    newHead: intent.candidateNewHead,
    findingFingerprints: marker.findingFingerprints,
    fingerprintDigest: marker.fingerprintDigest,
    changedFiles,
    changedFilesDigest: intent.changedFilesDigest,
    fixDelta: marker.fixDelta,
    fullCandidatePrDelta: marker.fullCandidatePrDelta,
    validation: marker.validation,
    externalReview: marker.externalReview,
    review: marker.review,
    sourceIdentity: marker.sourceIdentity,
    durableMutationMarkers: { [markerKey]: marker },
    reviewConvergenceState: recoveredConvergence?.state || null,
    completedAt: marker.pushedAt,
  };
  const normalized = normalizeSourceChangingConvergenceResult({ ok: true, newHead: intent.candidateNewHead, result }, {
    prNumber: intent.prNumber,
    oldHead: intent.oldHead,
    newHead: intent.candidateNewHead,
  });
  if (!normalized.ok) return normalized;
  return { ok: true, result };
}

function readGitSha({ runner, cwd, ref, reasonCode }) {
  const result = runner("git", ["rev-parse", ref], { cwd });
  const sha = String(result.stdout || "").trim();
  if (result.status !== 0 || result.error || !validSha(sha)) {
    return fail(reasonCode, boundedText(result.stderr || result.error || result.stdout || `${ref} did not resolve`));
  }
  return { ok: true, sha };
}

function normalizeCommitChain(values = []) {
  const normalized = [];
  for (const value of Array.isArray(values) ? values : []) {
    const sha = String(value || "").trim();
    if (!validSha(sha)) continue;
    if (normalized.at(-1) !== sha) normalized.push(sha);
  }
  return normalized;
}

function deriveCanonicalCommitChain({ runner, cwd, oldHead, newHead, reasonPrefix = "existing_pr_batch_fix" } = {}) {
  if (!validSha(oldHead) || !validSha(newHead)) return fail(`${reasonPrefix}_commit_chain_head_invalid`, "canonical commit-chain head identity is invalid");
  if (oldHead === newHead) return fail(`${reasonPrefix}_commit_chain_new_head_required`, "canonical commit chain requires a new head");
  const ancestry = runner("git", ["merge-base", "--is-ancestor", oldHead, newHead], { cwd });
  if (ancestry.status !== 0 || ancestry.error) return fail(`${reasonPrefix}_candidate_not_descendant`, "candidate is not descended from the expected old head");
  const listed = runner("git", ["rev-list", "--first-parent", "--reverse", `${oldHead}..${newHead}`], { cwd });
  if (listed.status !== 0 || listed.error) return fail(`${reasonPrefix}_commit_chain_unreadable`, boundedText(listed.stderr || listed.error || listed.stdout));
  const commits = normalizeCommitChain(String(listed.stdout || "").split(/\r?\n/));
  const chain = [oldHead, ...commits];
  const shape = validateCanonicalCommitChain(chain, { oldHead, newHead, reasonPrefix });
  if (!shape.ok) return shape;
  for (let index = 1; index < chain.length; index += 1) {
    const child = chain[index];
    const parent = chain[index - 1];
    const parents = runner("git", ["rev-list", "--parents", "-n", "1", child], { cwd });
    if (parents.status !== 0 || parents.error) return fail(`${reasonPrefix}_commit_chain_parent_unreadable`, boundedText(parents.stderr || parents.error || parents.stdout));
    const tokens = normalizeCommitChain(String(parents.stdout || "").trim().split(/\s+/));
    if (tokens.length !== 2) return fail(`${reasonPrefix}_commit_chain_merge_refused`, "canonical commit chain rejects merge commits and hidden side parents");
    if (tokens[0] !== child || tokens[1] !== parent) return fail(`${reasonPrefix}_commit_chain_parent_mismatch`, "canonical commit chain adjacency does not match git parentage");
  }
  return shape;
}

function validateCanonicalCommitChain(values = [], { oldHead, newHead, candidateParent = null, reasonPrefix = "source_rebound" } = {}) {
  const chain = normalizeCommitChain(values);
  if (chain.length < 2) return fail(`${reasonPrefix}_commit_chain_mismatch`, "canonical commit chain must include old and new heads");
  if (chain[0] !== oldHead) return fail(`${reasonPrefix}_commit_chain_first_mismatch`, "canonical commit chain must start at old head");
  if (chain.at(-1) !== newHead) return fail(`${reasonPrefix}_commit_chain_final_mismatch`, "canonical commit chain must end at candidate head");
  if (new Set(chain).size !== chain.length) return fail(`${reasonPrefix}_commit_chain_duplicate`, "canonical commit chain must not contain duplicates");
  const parent = chain.at(-2);
  if (candidateParent && candidateParent !== parent) return fail(`${reasonPrefix}_candidate_parent_mismatch`, "candidate parent must be the penultimate commit in the canonical chain");
  return { ok: true, chain, parent, digest: digestStringList(chain) };
}

function fetchAndReadOriginMain({ config, runner, reasonPrefix }) {
  const cwd = config.repoRoot || process.cwd();
  const fetch = runner("git", ["fetch", "origin", "main"], { cwd });
  if (fetch.status !== 0 || fetch.error) return fail(`${reasonPrefix}_base_fetch_failed`, boundedText(fetch.stderr || fetch.error || fetch.stdout));
  const base = readGitSha({ runner, cwd, ref: "origin/main", reasonCode: `${reasonPrefix}_base_unreadable` });
  if (!base.ok) return base;
  return { ok: true, currentOriginMainSha: base.sha, fetchedAt: new Date().toISOString() };
}

function isInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateOwnerOnlyFile(filePath, { missingOk = false } = {}) {
  if (!existsSync(filePath)) return missingOk ? { ok: true } : fail("stack_file_missing", "stack file does not exist");
  const stat = lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) return fail("stack_file_not_regular", "stack path must be a regular file");
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && stat.uid !== currentUid) return fail("stack_file_owner_unsafe", "stack file owner must match current operator");
  if ((stat.mode & 0o077) !== 0) return fail("stack_file_permissions_unsafe", "stack file must be owner-only");
  return { ok: true };
}

function validatePrStackStateWritePath(statePath, { parentMayBeMissing = false } = {}) {
  const componentTrust = validateNoSymlinkPathComponents(statePath, { leafMayBeMissing: true });
  if (!componentTrust.ok) return componentTrust;
  const parentPath = path.dirname(statePath);
  let parentStat;
  try {
    parentStat = lstatSync(parentPath);
  } catch (error) {
    if (parentMayBeMissing && error?.code === "ENOENT") return { ok: true };
    return fail("stack_state_parent_untrusted", "prStackExecution.statePath parent directory could not be validated");
  }
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    return fail("stack_state_parent_untrusted", "prStackExecution.statePath parent must be a trusted directory");
  }
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null && parentStat.uid !== currentUid) {
    return fail("stack_state_parent_untrusted", "prStackExecution.statePath parent owner must match current operator");
  }
  if ((parentStat.mode & 0o077) !== 0) {
    return fail("stack_state_parent_untrusted", "prStackExecution.statePath parent directories must be owner-only");
  }
  return validateOwnerOnlyFile(statePath, { missingOk: true });
}

function validateNoSymlinkPathComponents(targetPath, { leafMayBeMissing = false } = {}) {
  const absolutePath = path.resolve(targetPath);
  const parsed = path.parse(absolutePath);
  const relativeParts = path.relative(parsed.root, absolutePath).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (let index = 0; index < relativeParts.length; index += 1) {
    current = path.join(current, relativeParts[index]);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error?.code === "ELOOP") return fail("stack_state_parent_untrusted", "prStackExecution.statePath must not contain symlinks");
      if (error?.code === "ENOENT" && (leafMayBeMissing || index < relativeParts.length - 1)) break;
      return fail("stack_state_parent_untrusted", "prStackExecution.statePath component could not be validated");
    }
    if (stat.isSymbolicLink()) return fail("stack_state_parent_untrusted", "prStackExecution.statePath must not contain symlinks");
  }
  return { ok: true };
}

function normalizePositiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function unresolvedThreadsAsFindings(threads = []) {
  return threads
    .filter((thread) => thread && thread.isResolved === false)
    .map((thread) => ({
      provider: "github_review_thread",
      source: "github_review_thread",
      severity: "blocking",
      path: thread.path || "",
      title: "Unresolved review thread",
      body: thread.body || thread.subject || "",
      material: true,
    }));
}

function fetchCurrentMainProof({ config, state, pr, runner }) {
  const cwd = config.repoRoot;
  const mergeProof = state?.evidence?.merged?.[pr.number] || {};
  const parentMergeSha = mergeProof.mergeSha || mergeProof.result?.mergeSha || null;
  if (!validSha(parentMergeSha)) return fail("current_main_parent_merge_sha_missing", "parent merge SHA is required before current-main proof");
  const fetch = runner("git", ["fetch", "origin", "main"], { cwd });
  if (fetch.status !== 0 || fetch.error) return fail("current_main_fetch_failed", boundedText(fetch.stderr || fetch.error || fetch.stdout));
  const current = runner("git", ["rev-parse", "origin/main"], { cwd });
  if (current.status !== 0 || current.error) return fail("current_main_read_failed", boundedText(current.stderr || current.error || current.stdout));
  const currentMain = String(current.stdout || "").trim();
  if (!validSha(currentMain)) return fail("current_main_sha_invalid", "origin/main did not resolve to a valid SHA");
  const prior = state?.evidence?.currentMainProof?.[pr.number]?.currentMain || null;
  if (prior && prior !== currentMain) return fail("current_main_changed_requires_refresh", `origin/main moved from ${prior} to ${currentMain}`);
  const ancestor = runner("git", ["merge-base", "--is-ancestor", parentMergeSha, "origin/main"], { cwd });
  if (ancestor.status !== 0 || ancestor.error) {
    return fail("current_main_parent_merge_not_ancestor", `parent merge ${parentMergeSha} is not an ancestor of origin/main ${currentMain}`);
  }
  return { ok: true, currentMain, parentMergeSha, parentMergeIsAncestor: true, fetchedAt: new Date().toISOString() };
}

function readPrRetargetProof({ config, pr, expectedHead, expectedCurrentBase, runner, repositoryContext = null }) {
  const repo = repositoryContext?.argvRepository || config.repositorySlug || "tommytang213/Settleora";
  const result = runner(
    "gh",
    ["pr", "view", String(pr.number), "--repo", repo, "--json", "number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository"],
    { cwd: config.repoRoot },
  );
  if (result.status !== 0 || result.error) return fail("retarget_pr_read_failed", boundedText(result.stderr || result.error || result.stdout));
  let proof;
  try {
    proof = JSON.parse(result.stdout || "{}");
  } catch (error) {
    return fail("retarget_pr_read_parse_failed", error.message);
  }
  if (proof.number !== pr.number) return fail("retarget_pr_number_mismatch", "PR readback number did not match");
  if (proof.state !== "OPEN") return fail("retarget_pr_state_not_open", `PR state is ${proof.state || "unknown"}`);
  if (Boolean(proof.isDraft) !== Boolean(pr.isDraft)) return fail("retarget_pr_draft_state_changed", "PR draft state did not match plan proof");
  if (proof.headRefName !== pr.headRefName) return fail("retarget_pr_branch_mismatch", "PR head branch did not match plan");
  if (proof.headRefOid !== expectedHead) return fail("retarget_pr_head_stale", "PR head changed before retarget");
  if (proof.baseRefName !== expectedCurrentBase) return fail("retarget_pr_base_stale", "PR base changed before retarget");
  if (repositoryContext) {
    const repoProof = normalizeBoundLivePrProof({ config, pr: proof, repositoryContext });
    if (!repoProof.ok) return repoProof;
    proof.repositoryProof = repoProof.proof;
  }
  return { ok: true, proof };
}

function readPrReadyProof({ config, pr, expectedHead, expectedDraft, runner, repositoryContext = null }) {
  const repo = repositoryContext?.argvRepository || config.repositorySlug || "tommytang213/Settleora";
  const result = runner(
    "gh",
    ["pr", "view", String(pr.number), "--repo", repo, "--json", "number,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isCrossRepository"],
    { cwd: config.repoRoot },
  );
  if (result.status !== 0 || result.error) return fail("ready_pr_read_failed", boundedText(result.stderr || result.error || result.stdout));
  let proof;
  try {
    proof = JSON.parse(result.stdout || "{}");
  } catch (error) {
    return fail("ready_pr_read_parse_failed", error.message);
  }
  if (proof.number !== pr.number) return fail("ready_pr_number_mismatch", "PR readback number did not match");
  if (proof.state !== "OPEN") return fail("ready_pr_state_not_open", `PR state is ${proof.state || "unknown"}`);
  if (proof.headRefName !== pr.headRefName) return fail("ready_pr_branch_mismatch", "PR head branch did not match plan");
  if (proof.headRefOid !== expectedHead) return fail("ready_pr_head_stale", "PR head changed before ready transition");
  if (proof.baseRefName !== pr.baseRefName) return fail("ready_pr_base_stale", "PR base changed before ready transition");
  if (Boolean(proof.isDraft) !== Boolean(expectedDraft)) return fail("ready_pr_draft_state_mismatch", "PR draft state did not match expected ready transition state");
  if (repositoryContext) {
    const repoProof = normalizeBoundLivePrProof({ config, pr: proof, repositoryContext });
    if (!repoProof.ok) return repoProof;
    proof.repositoryProof = repoProof.proof;
  }
  return { ok: true, proof };
}

function isFinalGateExactHeadEvidenceMissing(result) {
  if (!result || result.ok !== false) return false;
  return /^(source_rebound_validation|strong_review|codex_review)_/.test(String(result.reasonCode || ""));
}

function isStaleMergeEntryGateEvidence(result) {
  if (!result || result.ok !== false) return false;
  return /^(source_rebound_validation|strong_review|codex_review|changed_files_do_not_match_allowed_paths|merge_entry_gate)_/.test(String(result.reasonCode || ""));
}

function bindMergeEntryEvidence(evidence = {}) {
  const validation = evidence.validation || {};
  const binding = {
    schemaVersion: 1,
    gateEvidenceDigest: digestJson(evidence),
    validationPreWorktreeProofDigest: validation.preWorktreeProofDigest || null,
    validationPostWorktreeProofDigest: validation.postWorktreeProofDigest || null,
    validationHead: validation.headSha || null,
    validationTree: validation.treeSha || null,
    exactHead: evidence.exactHead || null,
    baseSha: evidence.baseSha || evidence.expectedOriginMainSha || null,
    changedFilesDigest: evidence.changedFilesDigest || null,
    boundAt: new Date().toISOString(),
  };
  if (!binding.validationPreWorktreeProofDigest || !binding.validationPostWorktreeProofDigest) {
    return fail("merge_entry_validation_worktree_digest_missing", "merge-entry validation proof digests are required");
  }
  return { ok: true, evidence, mergeEntryEvidence: binding };
}

async function prepareExactHeadFinalGateEvidence({ config, plan = {}, state, pr, runner, runStrongReview, runCodexReview, runValidation = runValidationPlan }) {
  if (typeof runStrongReview !== "function" || typeof runCodexReview !== "function") {
    return fail("exact_head_review_adapter_unconfigured", "strong and Codex exact-head review adapters are required before final gates");
  }
  const repositoryContext = await buildRepositoryOperationContext({ config, state, prNumber: pr.number, adapter: { readRepositoryOperationContext: null } });
  if (!repositoryContext.ok) return repositoryContext;
  const prereq = await collectFinalGatePrerequisites({ config, plan, state, pr, runner, repositoryContext: repositoryContext.context, reasonPrefix: "exact_head_gate" });
  if (!prereq.ok) return prereq;
  const preWorktreeProof = readExactFinalGateWorktreeProof({
    config,
    pr: { ...pr, ...(prereq.inspection.pr || {}) },
    expectedHead: prereq.currentHead,
    expectedBranch: pr.headRefName,
    expectedRepository: repositoryContext.context.configuredRepositorySlug,
    runner,
    proofType: "pre_validation_review",
  });
  if (!preWorktreeProof.ok) return preWorktreeProof;
  const candidateDeltaResult = buildCanonicalCandidatePrDelta({
    config,
    runner,
    cwd: config.repoRoot,
    pr: { ...pr, ...(prereq.inspection.pr || {}) },
    baseSha: prereq.currentOriginMainSha,
    candidate: { newHead: prereq.currentHead, tree: preWorktreeProof.treeSha },
    repositoryIdentity: prereq.inspection.pr?.repositoryProof || null,
    laneDecision: prereq.laneProof.laneDecision,
  });
  if (!candidateDeltaResult.ok) return candidateDeltaResult;
  const candidateDelta = candidateDeltaResult.delta;
  const validationPlan = planValidation(prereq.changedFiles, prereq.laneProof.laneDecision || { validationProfile: "runner-tests" });
  const validation = {
    ...bindValidationEvidence(runValidation(config, validationPlan), {
    headSha: prereq.currentHead,
    baseSha: prereq.currentOriginMainSha,
    changedFiles: prereq.changedFiles,
    profile: prereq.laneProof.laneDecision?.validationProfile || validationPlan.profile,
    }),
    treeSha: preWorktreeProof.treeSha,
    canonicalWorktreePath: preWorktreeProof.worktreePath,
    worktreeProof: preWorktreeProof.proof,
    preWorktreeProofDigest: preWorktreeProof.proofDigest,
    rawDiffDigest: prereq.changed.ownDelta.rawDiffHash,
    packageDigest: prereq.changed.ownDelta.normalizedPatchDigest,
    fullCandidatePrDelta: candidateDelta,
  };
  const validationCheck = validateValidationEvidenceObject(validation, {
    expectedHead: prereq.currentHead,
    expectedBase: prereq.currentOriginMainSha,
    changedFiles: prereq.changedFiles,
    requireWorktreeProof: false,
  });
  if (!validationCheck.ok) return validationCheck;
  const strongReview = await runStrongReview({
    config,
    pr: { ...pr, ...(prereq.inspection.pr || {}), headRefOid: prereq.currentHead },
    changedFiles: prereq.changedFiles,
    validation,
    headSha: prereq.currentHead,
    baseSha: prereq.currentOriginMainSha,
    fullCandidatePrDelta: candidateDelta,
  });
  const fullDeltaStrongReview = { ...strongReview, fullCandidatePrDelta: strongReview?.fullCandidatePrDelta || candidateDelta };
  const strongCheck = validateReviewEvidenceObject(fullDeltaStrongReview, {
    name: "strong_review",
    expectedHead: prereq.currentHead,
    expectedBase: prereq.currentOriginMainSha,
    changedFiles: prereq.changedFiles,
    expectedCandidateDelta: candidateDelta,
    requireIndependent: true,
  });
  if (!strongCheck.ok) return strongCheck;
  const codexReview = await runCodexReview({
    config,
    pr: { ...pr, ...(prereq.inspection.pr || {}), headRefOid: prereq.currentHead },
    changedFiles: prereq.changedFiles,
    validation,
    externalReview: strongCheck.review,
    headSha: prereq.currentHead,
    baseSha: prereq.currentOriginMainSha,
    fullCandidatePrDelta: candidateDelta,
  });
  const fullDeltaCodexReview = { ...codexReview, fullCandidatePrDelta: codexReview?.fullCandidatePrDelta || candidateDelta };
  const codexCheck = validateReviewEvidenceObject(fullDeltaCodexReview, {
    name: "codex_review",
    expectedHead: prereq.currentHead,
    expectedBase: prereq.currentOriginMainSha,
    changedFiles: prereq.changedFiles,
    expectedCandidateDelta: candidateDelta,
    requireIndependent: false,
  });
  if (!codexCheck.ok) return codexCheck;
  const postWorktreeProof = readExactFinalGateWorktreeProof({
    config,
    pr: { ...pr, ...(prereq.inspection.pr || {}) },
    expectedHead: prereq.currentHead,
    expectedBranch: pr.headRefName,
    expectedRepository: repositoryContext.context.configuredRepositorySlug,
    runner,
    proofType: "post_validation_review",
  });
  if (!postWorktreeProof.ok) return postWorktreeProof;
  const stable = compareExactWorktreeProofs(preWorktreeProof, postWorktreeProof);
  if (!stable.ok) return stable;
  const provenValidation = {
    ...validationCheck.validation,
    treeSha: preWorktreeProof.treeSha,
    canonicalWorktreePath: preWorktreeProof.worktreePath,
    preWorktreeProof: preWorktreeProof.proof,
    postWorktreeProof: postWorktreeProof.proof,
    preWorktreeProofDigest: preWorktreeProof.proofDigest,
    postWorktreeProofDigest: postWorktreeProof.proofDigest,
    rawDiffDigest: prereq.changed.ownDelta.rawDiffHash,
    packageDigest: prereq.changed.ownDelta.normalizedPatchDigest,
    fullCandidatePrDelta: candidateDelta,
  };
  const provenValidationCheck = validateValidationEvidenceObject(provenValidation, {
    expectedHead: prereq.currentHead,
    expectedBase: prereq.currentOriginMainSha,
    changedFiles: prereq.changedFiles,
    expectedCandidateDelta: candidateDelta,
    requireWorktreeProof: true,
  });
  if (!provenValidationCheck.ok) return provenValidationCheck;
  return {
    ok: true,
    evidencePatch: {
      validation: { [pr.number]: provenValidationCheck.validation },
      strongReview: { [pr.number]: strongCheck.review },
      codexReview: { [pr.number]: codexCheck.review },
    },
  };
}

async function collectFinalGateEvidence({ config, plan = {}, state, pr, runner, adapter = null, repositoryContext = null }) {
  const prereq = await collectFinalGatePrerequisites({ config, plan, state, pr, runner, adapter, repositoryContext, reasonPrefix: "final_gate" });
  if (!prereq.ok) return prereq;
  const { inspection, currentHead, currentOriginMainSha, originMainFetchedAt, changed, laneProof, status } = prereq;
  const validationEvidence = state?.evidence?.validation?.[pr.number] || state?.evidence?.gatesPassed?.[pr.number]?.validation || null;
  const worktree = readExactFinalGateWorktreeProof({
    config,
    pr: { ...pr, ...(inspection.pr || {}) },
    expectedHead: currentHead,
    expectedBranch: pr.headRefName,
    expectedRepository: config.repositorySlug || "tommytang213/Settleora",
    runner,
    proofType: "final_gate_merge_entry",
  });
  if (!worktree.ok) return worktree;
  const candidateDeltaResult = buildCanonicalCandidatePrDelta({
    config,
    runner,
    cwd: config.repoRoot,
    pr: { ...pr, ...(inspection.pr || {}) },
    baseSha: currentOriginMainSha,
    candidate: { newHead: currentHead, tree: worktree.treeSha },
    repositoryIdentity: inspection.pr?.repositoryProof || null,
    laneDecision: laneProof.laneDecision,
  });
  if (!candidateDeltaResult.ok) return candidateDeltaResult;
  const candidateDelta = candidateDeltaResult.delta;
  const validation = validateValidationEvidenceObject(validationEvidence, {
    expectedHead: currentHead,
    expectedBase: currentOriginMainSha,
    changedFiles: changed.ownDelta.fileSet,
    expectedCandidateDelta: candidateDelta,
    requireWorktreeProof: true,
    expectedWorktreePath: worktree.worktreePath,
    expectedRepository: worktree.configuredRepository,
    expectedTree: worktree.treeSha,
  });
  if (!validation.ok) return validation;
  const reviewEvidence = buildFinalGateReviewEvidence({
    state,
    prNumber: pr.number,
    expectedHead: currentHead,
    expectedBase: currentOriginMainSha,
    changedFiles: changed.ownDelta.fileSet,
    expectedCandidateDelta: candidateDelta,
  });
  if (!reviewEvidence.ok) return reviewEvidence;
  const evidence = {
    ok: status.ok && worktree.ok && worktree.clean === true,
    exactHead: currentHead,
    pr: inspection.pr,
    changedFiles: changed.ownDelta.fileSet,
    changedFilesDigest: digestStringSet(changed.ownDelta.fileSet),
    changedFilesExactlyMatchAllowedPaths: laneProof.changedFilesExactlyMatchAllowedPaths,
    allowedPathProof: laneProof,
    forbiddenChangedFiles: laneProof.rejectedPaths,
    laneDecision: laneProof.laneDecision,
    canonicalDigest: changed.ownDelta.normalizedPatchDigest,
    ownDelta: changed.ownDelta,
    fullCandidatePrDelta: candidateDelta,
    requiredChecks: inspection.requiredChecks || [],
    reviewThreads: inspection.reviewThreads || [],
    codeScanningAlerts: inspection.codeScanningAlerts || [],
    blockingMarkers: inspection.blockingMarkers || [],
    validation: validation.validation,
    reviewEvidence: { strongIndependent: reviewEvidence.strongIndependent, codex: reviewEvidence.codex },
    strongReview: reviewEvidence.strongIndependent,
    codexReview: reviewEvidence.codex,
    externalReview: reviewEvidence.strongIndependent,
    review: reviewEvidence.codex,
    codexMechanicsReviewApproved: true,
    currentOriginMainSha,
    expectedOriginMainSha: currentOriginMainSha,
    baseSha: currentOriginMainSha,
    originMainFetchedAt,
    worktreeClean: worktree.clean === true,
    worktreeCleanProof: worktree,
    collectedAt: new Date().toISOString(),
  };
  if (!laneProof.changedFilesExactlyMatchAllowedPaths) {
    return fail("changed_files_do_not_match_allowed_paths", `changed files outside allowed contract: ${laneProof.rejectedPaths.join(",")}`);
  }
  if (!status.ok) return { ok: false, waiting: status.waiting, reasonCode: status.reasonCode, reason: status.reason, evidence };
  if (!worktree.ok || !evidence.worktreeClean) return fail("final_gate_worktree_not_clean", "worktree must be clean before final gates pass", { worktreeCleanProof: worktree });
  return { ok: true, evidence };
}

async function collectFinalGatePrerequisites({ config, plan = {}, state, pr, runner, adapter = null, repositoryContext = null, reasonPrefix }) {
  const inspection = adapter?.inspectPr
    ? await adapter.inspectPr({ config, state, prNumber: pr.number, repositoryContext })
    : inspectAutoMergeGithubState(config, { issue: finalGateIssue(config, state, pr), prUrlOrNumber: pr.number }, { runner });
  if (!inspection?.pr) return fail(`${reasonPrefix}_pr_read_failed`, "PR state could not be read");
  inspection.issue = inspection.issue || finalGateIssue(config, state, pr);
  const currentHead = inspection.pr.headRefOid || pr.headRefOid;
  if (currentHead !== pr.headRefOid) return fail(`${reasonPrefix}_pr_head_stale`, `PR #${pr.number} head changed before final gates`);
  if (inspection.pr.baseRefName !== pr.baseRefName) return fail(`${reasonPrefix}_pr_base_stale`, `PR #${pr.number} base changed before final gates`);
  if (inspection.pr.state !== "OPEN") return fail(`${reasonPrefix}_pr_state_not_open`, `PR #${pr.number} is not open`);
  if (inspection.pr.isDraft) return fail(`${reasonPrefix}_pr_is_draft`, `PR #${pr.number} is draft`);
  const changed = readCurrentPrOwnDelta({ config, pr, runner });
  if (!changed.ok) return changed;
  const laneDecisionProof = resolveFinalGateLaneDecision({ config, plan, state, pr, inspection });
  if (!laneDecisionProof.ok) return laneDecisionProof;
  const laneProof = buildAllowedPathProof({ issue: laneDecisionProof.issue, changedFiles: changed.ownDelta.fileSet, exactHead: currentHead, laneDecision: laneDecisionProof.laneDecision });
  if (!laneProof.ok) return laneProof;
  if (!laneProof.changedFilesExactlyMatchAllowedPaths) {
    return fail("changed_files_do_not_match_allowed_paths", `changed files outside allowed contract: ${laneProof.rejectedPaths.join(",")}`);
  }
  const status = finalExternalGateStatus({ ...inspection, config });
  const base = fetchAndReadOriginMain({ config, runner, reasonPrefix });
  if (!base.ok) return base;
  const candidateDelta = canonicalCandidateDeltaFromOwnDelta({
    config,
    pr: { ...pr, ...(inspection.pr || {}) },
    ownDelta: changed.ownDelta,
    baseSha: base.currentOriginMainSha,
    candidateHead: currentHead,
    candidateTree: null,
  });
  return {
    ok: true,
    inspection,
    currentHead,
    currentOriginMainSha: base.currentOriginMainSha,
    originMainFetchedAt: base.fetchedAt,
    changed: { ...changed, candidateDelta },
    changedFiles: changed.ownDelta.fileSet,
    laneProof,
    status,
  };
}

function resolveFinalGateLaneDecision({ config = {}, plan = {}, state = {}, pr = {}, inspection = {} } = {}) {
  plan = plan || {};
  state = state || {};
  pr = pr || {};
  inspection = inspection || {};
  const actualIssue = inspection.issue || pr.issue || config.prStackIssue || state.issue || null;
  if (actualIssue && String(actualIssue.body || "").trim()) {
    const laneDecision = classifyIssueLane(actualIssue);
    if (!laneDecision.allowedToImplement) {
      return fail("allowed_path_contract_unavailable", laneDecision.reason || "lane contract did not authorize implementation");
    }
    return { ok: true, laneDecision, issue: actualIssue };
  }

  const candidates = [
    inspection.laneDecision,
    inspection.pr?.laneDecision,
    pr.laneDecision,
    pr.laneContract ? { ...pr, laneContract: pr.laneContract } : null,
    plan.laneDecision,
    plan.laneContract ? { ...plan.laneContract, stackLaneContract: plan.stackLaneContract } : null,
    plan.stackLaneContract ? { ...plan, stackLaneContract: plan.stackLaneContract } : null,
    state.evidence?.gatesPassed?.[pr.number]?.laneDecision,
    state.evidence?.reviewConverged?.[pr.number]?.laneDecision,
    pr.stackLaneContract ? { ...pr, stackLaneContract: pr.stackLaneContract } : null,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeCarriedLaneDecision(candidate);
    if (normalized.ok) return normalized;
  }

  const contract = pr.laneContract || plan.laneContract || state.laneContract || config.prStackExecution?.laneContract || null;
  const allowedPaths = normalizeChangedFiles(
    pr.allowedPaths ||
    plan.allowedPaths ||
    contract?.allowedPaths ||
    state.allowedPaths ||
    config.prStackExecution?.allowedPaths ||
    [],
  );
  if (allowedPaths.length > 0) {
    const lane = contract?.lane || pr.lane || "workflow-docs-tooling";
    return normalizeCarriedLaneDecision({
      lane,
      canonicalLane: lane,
      allowedToImplement: true,
      allowedPaths,
      laneManifestAllowedPaths: allowedPaths,
      validationProfile: contract?.validationProfile || pr.validationProfile || "runner-tests",
      reviewerTier: "strong_independent",
      branchStrategy: carriedLaneBranchStrategy({ lane, canonicalLane: lane, contract }),
      autoMergeEligible: contract?.autoMergeEligible !== false,
      manualMergeRequired: contract?.manualMergeRequired === true,
      contract: {
        contractVersion: contract?.contractVersion || 1,
        lane,
        allowedPaths,
        validationProfile: contract?.validationProfile || pr.validationProfile || "runner-tests",
        branchStrategy: carriedLaneBranchStrategy({ lane, canonicalLane: lane, contract }),
        autoMergeEligible: contract?.autoMergeEligible !== false,
        manualMergeRequired: contract?.manualMergeRequired === true,
      },
      laneManifest: { decisionType: "runnable", autoMergeAllowed: contract?.autoMergeEligible !== false, allowedPaths },
    });
  }

  return fail("allowed_path_contract_unavailable", "final gate requires a carried lane contract or actual issue body contract before allowed path evaluation");
}

function normalizeCarriedLaneDecision(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return fail("lane_decision_missing", "lane decision missing");
  const allowedPaths = normalizeChangedFiles(candidate.allowedPaths || candidate.contract?.allowedPaths || candidate.stackLaneContract?.allowedPaths || []);
  if (allowedPaths.length === 0) return fail("lane_decision_allowed_paths_missing", "lane decision allowed paths missing");
  const lane = candidate.lane || candidate.canonicalLane || candidate.stackLaneContract?.laneId || "workflow-docs-tooling";
  const branchStrategy = carriedLaneBranchStrategy({ ...candidate, lane });
  const normalized = {
    ...candidate,
    lane,
    canonicalLane: candidate.canonicalLane || lane,
    allowedToImplement: candidate.allowedToImplement !== false,
    allowedPaths,
    laneManifestAllowedPaths: normalizeChangedFiles(candidate.laneManifestAllowedPaths || candidate.laneManifest?.allowedPaths || allowedPaths),
    validationProfile: candidate.validationProfile || candidate.contract?.validationProfile || "runner-tests",
    reviewerTier: candidate.reviewerTier || "strong_independent",
    branchStrategy,
    autoMergeEligible: candidate.autoMergeEligible !== false && candidate.contract?.autoMergeEligible !== false,
    manualMergeRequired: candidate.manualMergeRequired === true || candidate.contract?.manualMergeRequired === true,
    contract: {
      ...(candidate.contract || {}),
      contractVersion: candidate.contract?.contractVersion || 1,
      lane,
      allowedPaths,
      validationProfile: candidate.contract?.validationProfile || candidate.validationProfile || "runner-tests",
      branchStrategy,
      autoMergeEligible: candidate.autoMergeEligible !== false && candidate.contract?.autoMergeEligible !== false,
      manualMergeRequired: candidate.manualMergeRequired === true || candidate.contract?.manualMergeRequired === true,
    },
    laneManifest: {
      ...(candidate.laneManifest || {}),
      decisionType: candidate.laneManifest?.decisionType || "runnable",
      autoMergeAllowed: candidate.laneManifest?.autoMergeAllowed !== false,
      allowedPaths: normalizeChangedFiles(candidate.laneManifest?.allowedPaths || allowedPaths),
    },
  };
  if (!normalized.allowedToImplement || normalized.manualMergeRequired || !normalized.autoMergeEligible) {
    return fail("allowed_path_contract_unavailable", "carried lane contract did not authorize implementation");
  }
  return { ok: true, laneDecision: sanitizeState(normalized), issue: { number: candidate.issueNumber || null, labels: [], body: "" } };
}

function carriedLaneBranchStrategy(candidate = {}) {
  const strategy =
    candidate.branchStrategy ||
    candidate.contract?.branchStrategy ||
    candidate.stackLaneContract?.branchStrategy ||
    candidate.laneManifest?.branchStrategy ||
    laneManifest[candidate.canonicalLane || candidate.lane]?.branchStrategy ||
    laneManifest[candidate.lane]?.branchStrategy;
  return strategy === "focused" ? "focused" : "normal";
}

function buildFinalGateReviewEvidence({ state, prNumber, expectedHead, expectedBase, changedFiles, expectedCandidateDelta = null }) {
  const gate = state?.evidence?.gatesPassed?.[prNumber] || {};
  const strongIndependent = state?.evidence?.strongReview?.[prNumber] || gate.reviewEvidence?.strongIndependent || gate.strongReview || gate.externalReview || null;
  const codex = state?.evidence?.codexReview?.[prNumber] || gate.reviewEvidence?.codex || gate.codexReview || gate.review || null;
  return validateFinalGateReviewEvidence({ strongIndependent, codex, expectedHead, expectedBase, changedFiles, expectedCandidateDelta });
}

function finalGateReviewEvidenceForMerge(gateEvidence, { expectedHead, expectedBase, changedFiles }) {
  const strongIndependent = gateEvidence.reviewEvidence?.strongIndependent || gateEvidence.strongReview || gateEvidence.externalReview || null;
  const codex = gateEvidence.reviewEvidence?.codex || gateEvidence.codexReview || gateEvidence.review || null;
  return validateFinalGateReviewEvidence({ strongIndependent, codex, expectedHead, expectedBase, changedFiles, expectedCandidateDelta: gateEvidence.fullCandidatePrDelta || null });
}

function validateFinalGateReviewEvidence({ strongIndependent, codex, expectedHead, expectedBase, changedFiles, expectedCandidateDelta = null }) {
  const strong = validateReviewEvidenceObject(strongIndependent, {
    name: "strong_review",
    expectedHead,
    expectedBase,
    changedFiles,
    expectedCandidateDelta,
    requireIndependent: true,
  });
  if (!strong.ok) return strong;
  const codexReview = validateReviewEvidenceObject(codex, {
    name: "codex_review",
    expectedHead,
    expectedBase,
    changedFiles,
    expectedCandidateDelta,
    requireIndependent: false,
  });
  if (!codexReview.ok) return codexReview;
  return {
    ok: true,
    strongIndependent: strong.review,
    codex: codexReview.review,
    codexMechanicsReviewApproved: true,
  };
}

function validateValidationEvidenceObject(validation, { expectedHead, expectedBase, changedFiles, expectedCandidateDelta = null, requireWorktreeProof = false, expectedWorktreePath = null, expectedRepository = null, expectedTree = null }) {
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) {
    return fail("source_rebound_validation_missing", "source rebound validation evidence is required");
  }
  if (validation.passed !== true) return fail("source_rebound_validation_not_passed", "source rebound validation did not pass");
  if (validation.headSha !== expectedHead) return fail("source_rebound_validation_head_mismatch", "source rebound validation is not bound to the candidate head");
  if (expectedBase && validation.baseSha !== expectedBase) return fail("source_rebound_validation_base_mismatch", "source rebound validation is not bound to the candidate base");
  if (!Array.isArray(validation.results) || validation.results.length === 0) return fail("source_rebound_validation_results_missing", "source rebound validation results are missing");
  if (!validation.completedAt) return fail("source_rebound_validation_completed_at_missing", "source rebound validation completion time is missing");
  if (!sameStringSet(validation.changedFiles || [], changedFiles)) return fail("source_rebound_validation_files_mismatch", "source rebound validation file set does not match");
  if (validation.changedFilesDigest !== digestStringSet(changedFiles)) return fail("source_rebound_validation_file_digest_mismatch", "source rebound validation file digest does not match");
  const delta = validateCandidateDeltaEvidence(validation.fullCandidatePrDelta, {
    expectedHead,
    expectedBase,
    expectedTree,
    changedFiles,
    expectedCandidateDelta,
    name: "source_rebound_validation_candidate_delta",
  });
  if (!delta.ok) return delta;
  if (requireWorktreeProof) {
    const pre = validation.preWorktreeProof;
    const post = validation.postWorktreeProof;
    if (!pre || !post || typeof pre !== "object" || typeof post !== "object") {
      return fail("source_rebound_validation_worktree_proof_missing", "exact validation evidence requires pre/post worktree proof");
    }
    if (!validation.preWorktreeProofDigest || validation.preWorktreeProofDigest !== digestJson(pre)) {
      return fail("source_rebound_validation_pre_worktree_digest_mismatch", "pre-validation worktree proof digest is missing or invalid");
    }
    if (!validation.postWorktreeProofDigest || validation.postWorktreeProofDigest !== digestJson(post)) {
      return fail("source_rebound_validation_post_worktree_digest_mismatch", "post-validation worktree proof digest is missing or invalid");
    }
    if (pre.expectedHead !== expectedHead || post.expectedHead !== expectedHead || pre.actualHead !== expectedHead || post.actualHead !== expectedHead) {
      return fail("source_rebound_validation_worktree_head_mismatch", "validation worktree proof is not bound to the exact PR head");
    }
    if (validation.treeSha !== pre.treeSha || post.treeSha !== pre.treeSha) {
      return fail("source_rebound_validation_worktree_tree_mismatch", "validation worktree tree proof changed or is missing");
    }
    if (expectedTree && pre.treeSha !== expectedTree) {
      return fail("source_rebound_validation_worktree_tree_mismatch", "validation worktree proof is not bound to the current tree");
    }
    if (validation.canonicalWorktreePath !== pre.worktreePath || post.worktreePath !== pre.worktreePath) {
      return fail("source_rebound_validation_worktree_path_mismatch", "validation worktree path proof changed or is missing");
    }
    if (expectedWorktreePath && pre.worktreePath !== expectedWorktreePath) {
      return fail("source_rebound_validation_worktree_path_mismatch", "validation worktree proof is not bound to the current worktree");
    }
    if (expectedRepository && (pre.configuredRepository !== expectedRepository || post.configuredRepository !== expectedRepository || pre.originRepositorySlug !== expectedRepository || post.originRepositorySlug !== expectedRepository)) {
      return fail("source_rebound_validation_worktree_origin_mismatch", "validation worktree proof is not bound to the configured repository");
    }
    if (pre.clean !== true || post.clean !== true || pre.activeOperation === true || post.activeOperation === true) {
      return fail("source_rebound_validation_worktree_dirty", "validation worktree proof must be clean with no active git operation");
    }
  }
  return { ok: true, validation };
}

function validateReviewEvidenceObject(review, { name, expectedHead, expectedBase, changedFiles, expectedCandidateDelta = null, requireIndependent }) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return fail(`${name}_missing`, `${name} evidence is required`);
  }
  const reviewedHead = review.reviewedHead || review.headSha || review.prHeadSha || null;
  if (reviewedHead !== expectedHead) return fail(`${name}_head_mismatch`, `${name} evidence is not bound to the exact head`);
  const actualReviewedBase = requireIndependent ? review.baseSha : review.reviewedBaseSha;
  if (expectedBase && actualReviewedBase !== expectedBase) {
    return fail(`${name}_base_mismatch`, `${name} evidence is not bound to the exact base`, {
      baseBinding: {
        expectedBaseSha: validSha(expectedBase) ? expectedBase : null,
        actualReviewedBaseSha: validSha(actualReviewedBase) ? actualReviewedBase : null,
        actualReviewedBaseKind: validSha(actualReviewedBase) ? "sha" : actualReviewedBase ? "invalid" : "missing",
      },
    });
  }
  if (!Array.isArray(review.changedFiles)) return fail(`${name}_files_missing`, `${name} changed files are required`);
  if (!sameStringSet(review.changedFiles, changedFiles)) return fail(`${name}_files_mismatch`, `${name} changed files do not match final gate files`);
  if (review.changedFilesDigest !== digestStringSet(changedFiles)) return fail(`${name}_file_digest_mismatch`, `${name} changed-file digest does not match final gate files`);
  const delta = validateCandidateDeltaEvidence(review.fullCandidatePrDelta, {
    expectedHead,
    expectedBase,
    changedFiles,
    expectedCandidateDelta,
    name: `${name}_candidate_delta`,
  });
  if (!delta.ok) return delta;
  if (!review.completedAt && !review.finishedAt) return fail(`${name}_timestamp_missing`, `${name} timestamp is required`);
  if (requireIndependent) {
    if (!acceptedStrongReviewTiers.has(review.tier)) return fail(`${name}_tier_unapproved`, `${name} must be strong_independent or tie_breaker`);
    if (!review.provider || review.provider === "codex" || review.provider === "chatgpt-codex-connector") return fail(`${name}_provider_not_independent`, `${name} provider must be independent and non-Codex`);
    if (!review.providerProfile && !review.model && !review.evidencePath && !review.reportPath) return fail(`${name}_provider_identity_missing`, `${name} provider identity/evidence is incomplete`);
    if (!review.evidencePath && !review.reportPath && !review.logPath) return fail(`${name}_evidence_path_missing`, `${name} supported evidence path is required`);
    if (review.status !== "pass" || review.verdict !== "pass" || review.independent !== true || review.selfReview === true) {
      return fail(`${name}_not_strong_independent_pass`, `${name} must be a strong independent pass`);
    }
  }
  const verdict = review.verdict?.verdict || review.verdict;
  if (!requireIndependent && verdict !== "approve") return fail(`${name}_not_approved`, `${name} must be an approved Codex review`);
  if (!requireIndependent && (review.mutationDetected === true || review.checkoutMutationDetected === true)) {
    return fail(`${name}_mutated_checkout`, `${name} mutated the checkout`);
  }
  return { ok: true, review: sanitizeState(review) };
}

function readMergeWorktreeCleanProof({ config, expectedHead, runner }) {
  const cwd = config.repoRoot || process.cwd();
  const head = runner("git", ["rev-parse", "HEAD"], { cwd });
  if (head.status !== 0 || head.error) {
    return fail("merge_worktree_head_unreadable", boundedText(head.stderr || head.error || head.stdout), {
      clean: false,
      repoPath: cwd,
      expectedHead,
    });
  }
  const actualHead = String(head.stdout || "").trim();
  if (expectedHead && actualHead !== expectedHead) {
    return fail("merge_worktree_head_mismatch", "worktree HEAD does not match expected PR head", {
      clean: false,
      repoPath: cwd,
      expectedHead,
      actualHead,
    });
  }
  const status = runner("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd });
  if (status.status !== 0 || status.error) {
    return fail("merge_worktree_status_unreadable", boundedText(status.stderr || status.error || status.stdout), {
      clean: false,
      repoPath: cwd,
      expectedHead,
      actualHead,
    });
  }
  const statusText = String(status.stdout || "").trim();
  return {
    ok: true,
    clean: statusText === "",
    repoPath: cwd,
    expectedHead,
    actualHead,
    statusPorcelain: statusText,
    checkedAt: new Date().toISOString(),
  };
}

function readExactFinalGateWorktreeProof({ config, pr = {}, expectedHead, expectedBranch, expectedRepository, runner, proofType }) {
  const cwd = path.resolve(config.repoRoot || process.cwd());
  const worktree = runner("git", ["rev-parse", "--show-toplevel"], { cwd });
  if (worktree.status !== 0 || worktree.error) return fail("exact_worktree_root_unreadable", boundedText(worktree.stderr || worktree.error || worktree.stdout));
  const worktreePath = path.resolve(String(worktree.stdout || "").trim() || cwd);
  if (worktreePath !== cwd) return fail("exact_worktree_path_mismatch", "configured repoRoot does not match canonical worktree path");
  const origin = readOriginRepositoryProof({ config, runner });
  if (!origin.ok) return origin;
  const configuredRepository = canonicalRepositorySlug(expectedRepository || config.repositorySlug || "tommytang213/Settleora");
  if (origin.repositorySlug !== configuredRepository) return fail("exact_worktree_origin_mismatch", "worktree origin does not match configured repository");
  const branch = runner("git", ["branch", "--show-current"], { cwd });
  if (branch.status !== 0 || branch.error) return fail("exact_worktree_branch_unreadable", boundedText(branch.stderr || branch.error || branch.stdout));
  const branchName = String(branch.stdout || "").trim();
  const detached = branchName === "";
  if (!detached && expectedBranch && branchName !== expectedBranch) return fail("exact_worktree_branch_mismatch", "worktree branch does not match expected PR branch");
  const head = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "exact_worktree_head_unreadable" });
  if (!head.ok) return head;
  if (head.sha !== expectedHead) return fail("exact_worktree_head_mismatch", "worktree HEAD does not match expected PR head", { expectedHead, actualHead: head.sha });
  const tree = readGitSha({ runner, cwd, ref: "HEAD^{tree}", reasonCode: "exact_worktree_tree_unreadable" });
  if (!tree.ok) return tree;
  const staged = runner("git", ["diff", "--cached", "--name-only"], { cwd });
  if (staged.status !== 0 || staged.error) return fail("exact_worktree_staged_unreadable", boundedText(staged.stderr || staged.error || staged.stdout));
  const tracked = runner("git", ["diff", "--name-only"], { cwd });
  if (tracked.status !== 0 || tracked.error) return fail("exact_worktree_tracked_unreadable", boundedText(tracked.stderr || tracked.error || tracked.stdout));
  const status = runner("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd });
  if (status.status !== 0 || status.error) return fail("exact_worktree_status_unreadable", boundedText(status.stderr || status.error || status.stdout));
  const stagedFiles = normalizeChangedFiles(String(staged.stdout || "").split(/\r?\n/));
  const trackedFiles = normalizeChangedFiles(String(tracked.stdout || "").split(/\r?\n/));
  const statusPorcelain = String(status.stdout || "").trim();
  if (stagedFiles.length) return fail("exact_worktree_staged_changes", "worktree has staged changes", { stagedFiles });
  if (trackedFiles.length) return fail("exact_worktree_tracked_dirty", "worktree has tracked changes", { trackedFiles });
  if (statusPorcelain) return fail("exact_worktree_status_dirty", "worktree has uncommitted or non-ignored untracked changes", { statusPorcelain });
  const activeGitOperations = readActiveGitOperations({ runner, cwd });
  if (!activeGitOperations.ok) return activeGitOperations;
  if (activeGitOperations.activeOperation) return fail("exact_worktree_active_git_operation", "worktree has an active merge/rebase/cherry-pick/revert/bisect operation", activeGitOperations);
  const proof = sanitizeState({
    schemaVersion: 1,
    proofType,
    worktreePath,
    configuredRepository,
    originRepositorySlug: origin.repositorySlug,
    expectedPrNumber: pr.number,
    expectedHeadBranch: expectedBranch || pr.headRefName || null,
    branchName,
    detachedHead: detached,
    expectedHead,
    actualHead: head.sha,
    treeSha: tree.sha,
    cleanIndex: true,
    cleanTrackedWorktree: true,
    clean: true,
    noStagedChanges: true,
    noNonIgnoredUntrackedFiles: true,
    statusPorcelain: "",
    activeOperation: false,
    activeGitOperations,
    provedAt: new Date().toISOString(),
  });
  return { ok: true, ...proof, proof, proofDigest: digestJson(proof) };
}

function readActiveGitOperations({ runner, cwd }) {
  const refs = ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG"];
  const states = {};
  for (const ref of refs) {
    const result = runner("git", ["rev-parse", "--verify", "-q", ref], { cwd });
    if (result.error) return fail("exact_worktree_active_operation_unreadable", boundedText(result.stderr || result.error || result.stdout));
    states[ref] = result.status === 0;
  }
  return { ok: true, ...states, activeOperation: Object.values(states).some(Boolean) };
}

function compareExactWorktreeProofs(pre, post) {
  for (const field of ["worktreePath", "configuredRepository", "originRepositorySlug", "expectedHead", "actualHead", "treeSha", "branchName"]) {
    if (pre[field] !== post[field]) return fail("exact_worktree_post_proof_changed", `worktree proof changed after validation/review: ${field}`);
  }
  if (pre.clean !== true || post.clean !== true || pre.activeOperation === true || post.activeOperation === true) {
    return fail("exact_worktree_post_proof_dirty", "worktree became dirty or entered an active git operation during validation/review");
  }
  return { ok: true };
}

function finalGateIssue(config = {}, state = {}, pr = {}) {
  return (
    pr.issue ||
    config.prStackIssue ||
    state.issue ||
    { number: pr.issueNumber || state.issueNumber || 921, labels: [], body: "" }
  );
}

function resolveStackConvergenceLaneContract({ config = {}, plan = {}, state = {}, pr = {}, findings = [], sourceCycleBudget = null } = {}) {
  if (!pr.number || !validSha(pr.headRefOid) || !pr.headRefName || !pr.baseRefName) {
    return fail("stack_lane_contract_pr_identity_missing", "complete stack lane contract requires PR number, branch, head, and base identity");
  }
  const repository = canonicalRepositorySlug(plan.repository || state.repository || config.repositorySlug || "tommytang213/Settleora");
  if (!repository) return fail("stack_lane_contract_repository_missing", "complete stack lane contract requires repository identity");
  const findingIdentities = freezeMaterialFindingInventory(findings).map((finding) => finding.fingerprint).filter(Boolean).sort();
  if (findings.length > 0 && findingIdentities.length === 0) {
    return fail("stack_lane_contract_finding_identity_missing", "complete stack lane contract requires finding identities");
  }
  const dependencyIdentity = {
    parentPr: pr.expectedParentPr ?? null,
    parentBranch: pr.expectedParentBranch ?? null,
    order: pr.order ?? null,
    role: (pr.order ?? 0) === 0 ? "parent" : "child",
  };
  const correlationIdentity = {
    stackId: plan.stackId || state.stackId || null,
    taskKey: config.taskKey || state.taskKey || null,
    sourceCycleEpoch: sourceCycleBudget?.epoch ?? config.prStackExecution?.sourceCycleEpoch ?? 1,
    sourceCycleOrdinal: sourceCycleBudget?.nextOrdinal ?? null,
  };
  if (!correlationIdentity.stackId) return fail("stack_lane_contract_correlation_missing", "complete stack lane contract requires stack correlation identity");

  const actualIssue = pr.issue || config.prStackIssue || state.issue || null;
  const candidates = [];
  if (actualIssue && String(actualIssue.body || "").trim()) {
    const laneDecision = classifyIssueLane(actualIssue);
    if (!laneDecision.allowedToImplement) {
      return fail("allowed_path_contract_unavailable", laneDecision.reason || "lane contract did not authorize implementation");
    }
    candidates.push(laneDecision);
  }
  candidates.push(
    pr.laneDecision,
    pr.laneContract ? { ...pr.laneContract, contract: pr.laneContract } : null,
    pr.stackLaneContract ? { ...pr, stackLaneContract: pr.stackLaneContract } : null,
    plan.laneDecision,
    plan.laneContract ? { ...plan.laneContract, contract: plan.laneContract, stackLaneContract: plan.stackLaneContract } : null,
    plan.stackLaneContract ? { ...plan, stackLaneContract: plan.stackLaneContract } : null,
    state.evidence?.gatesPassed?.[pr.number]?.laneDecision,
    state.evidence?.reviewConverged?.[pr.number]?.laneDecision,
    state.laneDecision,
    state.laneContract ? { ...state.laneContract, contract: state.laneContract } : null,
    config.prStackExecution?.laneContract ? { ...config.prStackExecution.laneContract, contract: config.prStackExecution.laneContract } : null,
  );

  let laneDecision = null;
  for (const candidate of candidates) {
    const normalized = normalizeCarriedLaneDecisionForSourceConvergence(candidate);
    if (normalized.ok) {
      laneDecision = normalized.laneDecision;
      break;
    }
  }
  if (!laneDecision) {
    return fail("allowed_path_contract_unavailable", "source-changing convergence requires a carried lane contract or actual issue body contract before mutation");
  }
  const allowedPaths = normalizeChangedFiles(laneDecision.allowedPaths || laneDecision.contract?.allowedPaths || []);
  if (allowedPaths.length === 0) return fail("stack_lane_contract_allowed_paths_missing", "complete stack lane contract requires allowed paths before source mutation");
  const lane = laneDecision.lane || laneDecision.canonicalLane || "workflow-docs-tooling";
  const contract = {
    ...laneDecision,
    lane,
    canonicalLane: laneDecision.canonicalLane || lane,
    allowedPaths,
    laneManifestAllowedPaths: normalizeChangedFiles(laneDecision.laneManifestAllowedPaths || laneDecision.laneManifest?.allowedPaths || allowedPaths),
    validationProfile: laneDecision.validationProfile || laneDecision.contract?.validationProfile || pr.validationProfile || "runner-tests",
    contract: {
      ...(laneDecision.contract || {}),
      contractVersion: laneDecision.contract?.contractVersion || 1,
      lane,
      allowedPaths,
      validationProfile: laneDecision.contract?.validationProfile || laneDecision.validationProfile || pr.validationProfile || "runner-tests",
      branchStrategy: laneDecision.branchStrategy,
      manualMergeRequired: laneDecision.manualMergeRequired === true,
      autoMergeEligible: laneDecision.autoMergeEligible === true,
      requiredReading: laneDecision.contract?.requiredReading || ["PROGRAM_ARCHITECTURE.md", "README.md", "docs/workflow/CODEX_TASK_GUIDE.md"],
    },
    stackLaneContract: {
      ...(laneDecision.stackLaneContract || {}),
      schemaVersion: 1,
      laneId: lane,
      order: pr.order ?? null,
      role: dependencyIdentity.role,
      prNumber: pr.number,
      repository,
      sourceBranch: pr.headRefName,
      expectedHead: pr.headRefOid,
      expectedBase: pr.baseRefName,
      allowedPaths,
      branchStrategy: laneDecision.branchStrategy,
      manualMergeRequired: laneDecision.manualMergeRequired === true,
      autoMergeEligible: laneDecision.autoMergeEligible === true,
      prohibitedPaths: protectedBranchNames.has(pr.headRefName) ? [pr.headRefName] : [],
      scopeClass: laneDecision.implementationSensitivity || laneDecision.stackLaneContract?.scopeClass || "standard",
      findingIdentities,
      dependencyIdentity,
      mutationPolicy: { sourceMutationAllowed: true, directMainPush: false, forcePush: false, branchDeletion: false },
      reviewPolicy: { compactRequired: true, strongRequired: true, exactHeadRequired: true },
      correlationIdentity,
      digest: digestJson({ repository, prNumber: pr.number, head: pr.headRefOid, allowedPaths, findingIdentities, correlationIdentity }),
    },
  };
  return { ok: true, contract: sanitizeState(contract) };
}

function normalizeCarriedLaneDecisionForSourceConvergence(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return fail("lane_decision_missing", "lane decision missing");
  const allowedPaths = normalizeChangedFiles(candidate.allowedPaths || candidate.contract?.allowedPaths || candidate.stackLaneContract?.allowedPaths || []);
  if (allowedPaths.length === 0) return fail("lane_decision_allowed_paths_missing", "lane decision allowed paths missing");
  const lane = candidate.lane || candidate.canonicalLane || candidate.contract?.lane || candidate.stackLaneContract?.laneId || "workflow-docs-tooling";
  const manifest = candidate.laneManifest || laneManifest[candidate.canonicalLane || lane] || laneManifest[lane] || {};
  const autoMergeEligible = candidate.autoMergeEligible ?? candidate.contract?.autoMergeEligible ?? manifest.autoMergeAllowed === true;
  const manualMergeRequired = candidate.manualMergeRequired === true || candidate.contract?.manualMergeRequired === true || autoMergeEligible === false;
  const branchStrategy = carriedLaneBranchStrategy({ ...candidate, lane, canonicalLane: candidate.canonicalLane || lane, laneManifest: manifest });
  const normalized = {
    ...candidate,
    lane,
    canonicalLane: candidate.canonicalLane || lane,
    allowedToImplement: candidate.allowedToImplement !== false,
    allowedPaths,
    laneManifestAllowedPaths: normalizeChangedFiles(candidate.laneManifestAllowedPaths || manifest.allowedPaths || allowedPaths),
    validationProfile: candidate.validationProfile || candidate.contract?.validationProfile || "runner-tests",
    reviewerTier: candidate.reviewerTier || manifest.reviewerTier || "strong_independent",
    branchStrategy,
    manualMergeRequired,
    autoMergeEligible: autoMergeEligible === true,
    implementationSensitivity: candidate.implementationSensitivity || manifest.sensitivity || "standard",
    contract: {
      ...(candidate.contract || {}),
      contractVersion: candidate.contract?.contractVersion || candidate.contractVersion || 1,
      lane,
      allowedPaths,
      validationProfile: candidate.contract?.validationProfile || candidate.validationProfile || "runner-tests",
      branchStrategy,
      manualMergeRequired,
      autoMergeEligible: autoMergeEligible === true,
    },
    laneManifest: {
      ...manifest,
      decisionType: manifest.decisionType || "runnable",
      autoMergeAllowed: manifest.autoMergeAllowed === true,
      allowedPaths: normalizeChangedFiles(manifest.allowedPaths || allowedPaths),
      branchStrategy: manifest.branchStrategy || branchStrategy,
    },
  };
  if (!normalized.allowedToImplement) {
    return fail("allowed_path_contract_unavailable", "carried lane contract did not authorize implementation");
  }
  return { ok: true, laneDecision: sanitizeState(normalized) };
}

async function proveFreshLiveMergedStackState({ config = {}, plan = {}, state = {}, adapter, repositoryContext = {} } = {}) {
  const proofs = [];
  for (const pr of plan.orderedPrs || []) {
    const expectedMergeSha = state.evidence?.merged?.[pr.number]?.mergeSha || state.evidence?.merged?.[pr.number]?.result?.mergeSha || null;
    if (!validSha(expectedMergeSha)) return fail("final_hygiene_live_merge_proof_missing", `missing durable merge SHA for PR #${pr.number}`);
    const live = await adapter.inspectPr({ config, plan, state, prNumber: pr.number, repositoryContext });
    if (!live?.ok) return fail("final_hygiene_live_merge_proof_missing", live?.reason || `fresh live merge proof failed for PR #${pr.number}`, { prNumber: pr.number, live: sanitizeState(live || {}) });
    const livePr = live.pr || {};
    const liveMergeSha = livePr.mergeCommit?.oid || livePr.mergeSha || livePr.mergeCommitOid || null;
    const baseRepositorySlug = livePr.baseRepositorySlug || repositoryContext.configuredRepositorySlug || config.repositorySlug || null;
    const headRepositorySlug = livePr.headRepositorySlug || repositoryContext.configuredRepositorySlug || config.repositorySlug || null;
    if (livePr.state !== "MERGED") return fail("final_hygiene_live_merge_proof_missing", `PR #${pr.number} is not live MERGED`, { prNumber: pr.number, state: livePr.state || null });
    if (livePr.headRefOid !== pr.headRefOid) return fail("final_hygiene_live_merge_proof_missing", `PR #${pr.number} live head does not match expected immutable lane head`, { prNumber: pr.number });
    if (liveMergeSha !== expectedMergeSha) return fail("final_hygiene_live_merge_proof_missing", `PR #${pr.number} live merge commit does not match durable merge evidence`, { prNumber: pr.number });
    if (livePr.baseRefName !== "main") return fail("final_hygiene_live_merge_proof_missing", `PR #${pr.number} live base is not main`, { prNumber: pr.number, baseRefName: livePr.baseRefName || null });
    const configured = repositoryContext.configuredRepositorySlug || config.repositorySlug || "tommytang213/Settleora";
    if (baseRepositorySlug !== configured || headRepositorySlug !== configured) return fail("final_hygiene_live_merge_proof_missing", `PR #${pr.number} live repository identity mismatch`, { prNumber: pr.number });
	    const commandEvidence = validateFreshMergeCommandEvidence(live.commandEvidence, { prNumber: pr.number, repositorySlug: configured });
	    if (!commandEvidence.ok) return commandEvidence;
	    proofs.push(sanitizeState({
	      prNumber: pr.number,
	      laneIdentity: { stackId: plan.stackId || null, prNumber: pr.number, headRefName: pr.headRefName },
	      state: livePr.state,
	      expectedHead: pr.headRefOid,
	      sourceHeadSha: livePr.headRefOid,
	      expectedMergeSha,
	      liveMergeSha,
	      baseRefName: livePr.baseRefName,
	      repositorySlug: configured,
	      commandEvidence: commandEvidence.evidence,
	      commandEvidenceDigest: digestJson(commandEvidence.evidence),
	      provenAt: new Date().toISOString(),
	    }));
  }
  return { ok: true, proofType: "fresh_live_merged_stack_state", repositoryContext, proofs, provenAt: new Date().toISOString() };
}

function buildAllowedPathProof({ issue, changedFiles, exactHead, laneDecision: carriedLaneDecision = null }) {
  const normalized = normalizeChangedFiles(changedFiles);
  const laneDecision = carriedLaneDecision || classifyIssueLane(issue || {});
  if (!laneDecision.allowedToImplement) {
    return fail("allowed_path_contract_unavailable", laneDecision.reason || "lane contract did not authorize implementation");
  }
  const rejectedPaths = filterForbiddenChangedFiles(normalized, laneDecision);
  return {
    ok: true,
    exactHead,
    changedFiles: normalized,
    changedFilesDigest: digestJson(normalized),
    lane: laneDecision.lane,
    canonicalLane: laneDecision.canonicalLane || laneDecision.lane,
    contractAllowedPaths: laneDecision.allowedPaths || [],
    laneManifestAllowedPaths: laneDecision.laneManifestAllowedPaths || laneDecision.laneManifest?.allowedPaths || [],
    rejectedPaths,
    changedFilesExactlyMatchAllowedPaths: rejectedPaths.length === 0,
    laneDecision,
    provenAt: new Date().toISOString(),
  };
}

function allowedPathProofMatchesGate(gateEvidence = {}, changedFiles = [], expectedHead = null) {
  const proof = gateEvidence.allowedPathProof || {};
  const normalized = normalizeChangedFiles(changedFiles);
  if (proof.ok !== true || proof.changedFilesExactlyMatchAllowedPaths !== true) return false;
  if (expectedHead && proof.exactHead !== expectedHead) return false;
  if (!sameStringSet(proof.changedFiles || [], normalized)) return false;
  if (proof.changedFilesDigest !== digestJson(normalized)) return false;
  if (Array.isArray(proof.rejectedPaths) && proof.rejectedPaths.length > 0) return false;
  return true;
}

export function finalExternalGateStatus(inspection = {}) {
  const checks = inspection.requiredChecks || [];
  const checkStatus = summarizeCheckStatus(checks, inspection.autoMergePolicy || inspection.config?.autoMergePolicy || {});
  if (checkStatus.state === "missing") {
    return {
      ok: false,
      waiting: true,
      reasonCode: "ci_check_completion_wait",
      reason: `mandatory check evidence missing: ${(checkStatus.missingRequired || mandatoryAutoMergeCheckNames()).join(",")}`,
      checkStatus,
    };
  }
  if (checkStatus.state === "pending") {
    return { ok: false, waiting: true, reasonCode: "ci_check_completion_wait", reason: "mandatory checks are pending", checkStatus };
  }
  if (checkStatus.state !== "success") {
    return { ok: false, waiting: false, reasonCode: "required_check_failed", reason: "mandatory checks failed", checkStatus };
  }
  if ((inspection.reviewThreads || []).some((thread) => thread.isResolved === false)) {
    return { ok: false, waiting: true, reasonCode: "github_codex_result_wait", reason: "unresolved review threads remain" };
  }
  if ((inspection.codeScanningAlerts || []).some((alert) => String(alert.state || "").toLowerCase() === "open")) {
    return { ok: false, waiting: true, reasonCode: "scanner_result_wait", reason: "open code-scanning alerts remain" };
  }
  if ((inspection.blockingMarkers || []).length > 0) {
    return { ok: false, waiting: false, reasonCode: "final_gate_blocking_markers", reason: inspection.blockingMarkers.join(",") };
  }
  return { ok: true };
}

function readCurrentPrOwnDelta({ config, pr, runner }) {
  const cwd = config.repoRoot;
  const repo = config.repositorySlug || "tommytang213/Settleora";
  const nameOnly = runner("gh", ["pr", "diff", String(pr.number), "--repo", repo, "--name-only"], { cwd });
  if (nameOnly.status !== 0 || nameOnly.error) {
    return fail("own_delta_current_files_unavailable", boundedText(nameOnly.stderr || nameOnly.error || nameOnly.stdout));
  }
  const patch = runner("gh", ["pr", "diff", String(pr.number), "--repo", repo, "--patch"], { cwd });
  if (patch.status !== 0 || patch.error) {
    return fail("own_delta_current_patch_unavailable", boundedText(patch.stderr || patch.error || patch.stdout));
  }
  const patchText = String(patch.stdout || "");
  const fileSet = normalizeChangedFiles(nameOnly.stdout.split(/\r?\n/));
  const patchStats = summarizePatch(patchText);
  const stablePatchId = computeStablePatchId(patchText, cwd, runner);
  if (!stablePatchId.ok) return fail("own_delta_current_patch_id_unavailable", stablePatchId.reason || "current PR stable patch ID could not be computed", { patchIdEvidence: stablePatchId.evidence || null });
  const forwardPatchApplies = patchApplyCheck({ patchText, cwd, reverse: false, runner });
  const reversePatchApplies = patchApplyCheck({ patchText, cwd, reverse: true, runner });
  return {
    ok: true,
    ownDelta: {
      schemaVersion: 1,
      fileSet,
      fileSetDigest: digestJson(fileSet),
      changedFiles: fileSet,
      changedFileCount: fileSet.length,
      changedFilesDigest: digestStringSet(fileSet),
      diffstat: { files: fileSet.length, additions: patchStats.additions, deletions: patchStats.deletions },
      diffstatDigest: digestJson({ files: fileSet.length, additions: patchStats.additions, deletions: patchStats.deletions }),
      numstat: patchStats.numstat,
      numstatDigest: digestJson(patchStats.numstat),
      stablePatchId: stablePatchId.patchId,
      stablePatchIdEvidence: stablePatchId.evidence,
      normalizedPatchDigest: digestJson(normalizePatchForDigest(patchText)),
      rawDiffHash: createHash("sha256").update(patchText).digest("hex"),
      rawDiffSha256: createHash("sha256").update(patchText).digest("hex"),
      forwardPatchApplies,
      reversePatchApplies,
    },
  };
}

function buildCanonicalCandidatePrDelta({ config = {}, runner, cwd, pr = {}, baseSha, candidate = {}, repositoryIdentity = null, laneDecision = null } = {}) {
  if (!validSha(baseSha)) return fail("full_candidate_delta_base_missing", "full candidate PR delta requires a valid base SHA");
  if (!validSha(candidate.newHead) || !validSha(candidate.tree)) return fail("full_candidate_delta_candidate_missing", "full candidate PR delta requires candidate head and tree");
  const fileResult = runner("git", ["diff", "--name-only", `${baseSha}...${candidate.newHead}`], { cwd });
  if (fileResult.status !== 0 || fileResult.error) return fail("full_candidate_delta_files_unavailable", boundedText(fileResult.stderr || fileResult.error || fileResult.stdout));
  const raw = runner("git", ["diff", "--binary", `${baseSha}...${candidate.newHead}`], { cwd });
  if (raw.status !== 0 || raw.error) return fail("full_candidate_delta_diff_unavailable", boundedText(raw.stderr || raw.error || raw.stdout));
  const numstatResult = runner("git", ["diff", "--numstat", `${baseSha}...${candidate.newHead}`], { cwd });
  if (numstatResult.status !== 0 || numstatResult.error) return fail("full_candidate_delta_numstat_unavailable", boundedText(numstatResult.stderr || numstatResult.error || numstatResult.stdout));
  const statResult = runner("git", ["diff", "--stat", `${baseSha}...${candidate.newHead}`], { cwd });
  if (statResult.status !== 0 || statResult.error) return fail("full_candidate_delta_diffstat_unavailable", boundedText(statResult.stderr || statResult.error || statResult.stdout));
  const patchText = String(raw.stdout || "");
  const changedFiles = normalizeChangedFiles(String(fileResult.stdout || "").split(/\r?\n/));
  if (changedFiles.length === 0) return fail("full_candidate_delta_files_missing", "full candidate PR delta contains no changed files");
  const stablePatchId = computeStablePatchId(patchText, cwd, runner);
  if (!stablePatchId.ok) return fail("full_candidate_delta_patch_id_unavailable", stablePatchId.reason || "full candidate PR delta stable patch ID could not be computed", { patchIdEvidence: stablePatchId.evidence || null });
  const patchStats = summarizePatch(patchText);
  const allowedRejected = filterForbiddenChangedFiles(changedFiles, laneDecision || {});
  const delta = sanitizeState({
    schemaVersion: 1,
    authority: "full_candidate_pr_delta",
    repository: config.repositorySlug || "tommytang213/Settleora",
    configuredRepositorySlug: repositoryIdentity?.configuredRepositorySlug || config.repositorySlug || "tommytang213/Settleora",
    baseRepositorySlug: repositoryIdentity?.baseRepositorySlug || config.repositorySlug || "tommytang213/Settleora",
    headRepositorySlug: repositoryIdentity?.headRepositorySlug || config.repositorySlug || "tommytang213/Settleora",
    originRepositorySlug: repositoryIdentity?.originRepositorySlug || config.repositorySlug || "tommytang213/Settleora",
    prNumber: pr.number || null,
    baseBranch: pr.baseRefName || pr.base || "main",
    baseSha,
    sourceBranch: pr.headRefName || pr.branch || null,
    candidateHead: candidate.newHead,
    candidateTree: candidate.tree,
    candidateParent: candidate.parent || null,
    changedFiles,
    changedFileCount: changedFiles.length,
    fileSetDigest: digestStringSet(changedFiles),
    changedFilesDigest: digestStringSet(changedFiles),
    rawDiffSha256: createHash("sha256").update(patchText).digest("hex"),
    rawDiffHash: createHash("sha256").update(patchText).digest("hex"),
    normalizedPatchDigest: digestJson(normalizePatchForDigest(patchText)),
    stablePatchId: stablePatchId.patchId,
    stablePatchIdEvidence: stablePatchId.evidence,
    diffstat: { files: changedFiles.length, additions: patchStats.additions, deletions: patchStats.deletions, text: boundedText(statResult.stdout || "", 4000) },
    diffstatDigest: digestJson({ files: changedFiles.length, additions: patchStats.additions, deletions: patchStats.deletions }),
    numstat: parseNumstat(numstatResult.stdout),
    numstatDigest: digestJson(parseNumstat(numstatResult.stdout)),
    allowedPathResult: {
      ok: allowedRejected.length === 0,
      changedFiles,
      rejectedPaths: allowedRejected,
      changedFilesExactlyMatchAllowedPaths: allowedRejected.length === 0,
      changedFilesDigest: digestJson(changedFiles),
    },
    generatedAt: new Date().toISOString(),
  });
  return { ok: true, delta };
}

function validateCandidateDeltaEvidence(delta, { expectedHead, expectedBase, expectedTree = null, changedFiles = [], expectedCandidateDelta = null, name = "candidate_delta" } = {}) {
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) return fail(`${name}_missing`, "full candidate PR delta evidence is required");
  if (delta.authority !== "full_candidate_pr_delta") return fail(`${name}_authority_mismatch`, "full candidate PR delta authority is invalid");
  if (delta.candidateHead !== expectedHead) return fail(`${name}_head_mismatch`, "full candidate PR delta head does not match");
  if (expectedBase && delta.baseSha !== expectedBase) return fail(`${name}_base_mismatch`, "full candidate PR delta base does not match");
  if (expectedTree && delta.candidateTree !== expectedTree) return fail(`${name}_tree_mismatch`, "full candidate PR delta tree does not match");
  if (!Array.isArray(delta.changedFiles) || delta.changedFiles.length === 0) return fail(`${name}_files_missing`, "full candidate PR delta changed files are missing");
  if (!sameStringSet(delta.changedFiles, changedFiles)) return fail(`${name}_files_mismatch`, "full candidate PR delta files do not match expected files");
  if (delta.fileSetDigest !== digestStringSet(changedFiles) || delta.changedFilesDigest !== digestStringSet(changedFiles)) return fail(`${name}_file_digest_mismatch`, "full candidate PR delta file digest does not match");
  if (!delta.rawDiffSha256 && !delta.rawDiffHash) return fail(`${name}_raw_diff_digest_missing`, "full candidate PR delta raw diff digest is missing");
  if (!delta.normalizedPatchDigest && !delta.stablePatchId) return fail(`${name}_patch_digest_missing`, "full candidate PR delta normalized patch identity is missing");
  if (expectedCandidateDelta) {
    const fields = ["repository", "prNumber", "baseSha", "candidateHead", "candidateTree", "fileSetDigest", "rawDiffSha256", "normalizedPatchDigest"];
    for (const field of fields) {
      if ((delta[field] || null) !== (expectedCandidateDelta[field] || null)) return fail(`${name}_${field}_mismatch`, "full candidate PR delta does not match canonical authority");
    }
  }
  return { ok: true, delta: sanitizeState(delta) };
}

function canonicalCandidateDeltaFromOwnDelta({ config = {}, pr = {}, ownDelta = {}, baseSha = null, candidateHead = null, candidateTree = null } = {}) {
  const changedFiles = normalizeChangedFiles(ownDelta.fileSet || ownDelta.changedFiles || []);
  return sanitizeState({
    schemaVersion: 1,
    authority: "full_candidate_pr_delta",
    repository: config.repositorySlug || "tommytang213/Settleora",
    configuredRepositorySlug: config.repositorySlug || "tommytang213/Settleora",
    baseRepositorySlug: config.repositorySlug || "tommytang213/Settleora",
    headRepositorySlug: config.repositorySlug || "tommytang213/Settleora",
    originRepositorySlug: config.repositorySlug || "tommytang213/Settleora",
    prNumber: pr.number || null,
    baseBranch: pr.baseRefName || pr.base || "main",
    baseSha,
    sourceBranch: pr.headRefName || pr.branch || null,
    candidateHead,
    candidateTree,
    changedFiles,
    changedFileCount: changedFiles.length,
    fileSetDigest: digestStringSet(changedFiles),
    changedFilesDigest: digestStringSet(changedFiles),
    rawDiffSha256: ownDelta.rawDiffSha256 || ownDelta.rawDiffHash || null,
    rawDiffHash: ownDelta.rawDiffHash || ownDelta.rawDiffSha256 || null,
    normalizedPatchDigest: ownDelta.normalizedPatchDigest || null,
    stablePatchId: ownDelta.stablePatchId || null,
    diffstat: ownDelta.diffstat || null,
    diffstatDigest: ownDelta.diffstatDigest || null,
    numstat: ownDelta.numstat || null,
    numstatDigest: ownDelta.numstatDigest || null,
    allowedPathResult: null,
    generatedAt: new Date().toISOString(),
  });
}

function parseNumstat(value) {
  const entries = {};
  for (const line of String(value || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [added, deleted, file] = line.split(/\t/);
    if (!file) continue;
    entries[file] = {
      added: added === "-" ? null : Number(added),
      deleted: deleted === "-" ? null : Number(deleted),
    };
  }
  return entries;
}

function summarizePatch(patchText) {
  const perFile = {};
  let current = null;
  let additions = 0;
  let deletions = 0;
  for (const line of String(patchText || "").split(/\r?\n/)) {
    const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      current = fileMatch[2];
      perFile[current] ||= { added: 0, deleted: 0 };
      continue;
    }
    if (!current || line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      additions += 1;
      perFile[current].added += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
      perFile[current].deleted += 1;
    }
  }
  return { additions, deletions, numstat: perFile };
}

function normalizePatchForDigest(patchText) {
  return String(patchText || "")
    .replace(/^index [0-9a-f]+\.\.[0-9a-f]+.*$/gim, "index <normalized>")
    .replace(/\r\n/g, "\n")
    .trim();
}

function computeStablePatchId(patchText, cwd, runner) {
  const input = String(patchText || "");
  const inputDiffSha256 = createHash("sha256").update(input).digest("hex");
  if (typeof runner !== "function") return fail("stable_patch_id_runner_missing", "stable patch ID requires an injected fixed-argv runner", { evidence: { inputDiffSha256 } });
  if (input.length > 16 * 1024 * 1024) return fail("stable_patch_id_input_too_large", "stable patch ID input exceeds bounded stdin", { evidence: { inputDiffSha256, inputBytes: input.length } });
  const args = ["patch-id", "--stable"];
  const result = runner("git", args, { cwd, input, timeoutMs: 30_000 });
  const evidence = sanitizeState({
    command: "git",
    args,
    cwd,
    shell: false,
    stdinBounded: true,
    inputBytes: input.length,
    inputDiffSha256,
    status: result?.status ?? null,
    error: result?.error || null,
    stderr: boundedText(result?.stderr || "", 1000),
    commandEvidence: result?.commandEvidence || null,
    runnerIdentity: runner.settleoraRunnerIdentity || null,
    completedAt: new Date().toISOString(),
  });
  if (!isRunnerResult(result)) return fail("stable_patch_id_runner_malformed", "stable patch ID runner did not return command evidence", { evidence });
  if (result.status !== 0 || result.error) return fail("stable_patch_id_command_failed", "stable patch ID command failed", { evidence });
  const patchId = String(result.stdout || "").trim().split(/\s+/)[0] || null;
  if (!/^[a-f0-9]{40}$/i.test(String(patchId || ""))) return fail("stable_patch_id_output_invalid", "stable patch ID output was invalid", { evidence });
  return { ok: true, patchId, evidence: { ...evidence, patchId } };
}

function patchApplyCheck({ patchText, cwd, reverse, runner }) {
  const args = ["apply", "--check"];
  if (reverse) args.push("--reverse");
  const result = runner("git", args, { cwd, input: patchText });
  return result.status === 0 && !result.error;
}

function createFinalHygieneRunner(runner, repositoryContext = {}) {
  const commandEvidence = [];
  const repo = repositoryContext.argvRepository || repositoryContext.configuredRepositorySlug || null;
  const wrapped = (command, args = [], options = {}) => {
    if (command === "gh" && (args[0] === "issue" || args[0] === "pr") && !repo) {
      const result = { status: 1, stdout: "", stderr: "repository_context_required", error: null };
      commandEvidence.push({
        command,
        args: sanitizeArgv(args),
        status: result.status,
        ok: false,
        stderr: result.stderr,
      });
      return result;
    }
    const finalArgs = command === "gh" && (args[0] === "issue" || args[0] === "pr") && !args.includes("--repo") && !args.includes("-R")
      ? [...args.slice(0, 2), ...args.slice(2, 3), "--repo", repo, ...args.slice(3)]
      : args;
    const result = runner(command, finalArgs, options);
    commandEvidence.push({
      command,
      args: sanitizeArgv(finalArgs),
      status: result?.status ?? null,
      ok: result?.status === 0 && !result?.error,
      stderr: boundedText(result?.stderr || result?.error || ""),
    });
    return result;
  };
  wrapped.commandEvidence = commandEvidence;
  return wrapped;
}

function validateStackLiveRunner({ runner, run } = {}) {
  if (typeof runner !== "function") return fail("stack_live_runner_missing", "production stack execution requires an injected live runner");
  if (run === defaultRunner) return fail("stack_live_runner_missing", "production stack execution cannot use the default runner");
  if (runner.settleoraRunnerMode === "noop" || runner.settleoraNoopRunner === true) {
    return fail("stack_live_runner_missing", "production stack execution cannot use a no-op runner");
  }
  if (runner.settleoraFixedArgvRunner !== true || runner.settleoraRunnerMode !== "live") {
    return fail("stack_live_runner_missing", "production stack execution requires a live fixed-argv runner");
  }
  const identity = runner.settleoraRunnerIdentity || {};
  if (identity.kind !== "live-fixed-argv" || !identity.repositorySlug || !identity.repoRoot) {
    return fail("stack_live_runner_missing", "live runner identity is incomplete");
  }
  return { ok: true, runnerIdentity: sanitizeState(identity) };
}

function isRunnerResult(result) {
  return result && typeof result === "object" && !Array.isArray(result) && (Number.isInteger(result.status) || result.status === null);
}

function sanitizeArgv(args = []) {
  return args.map((arg) => {
    const text = String(arg || "");
    if (text.length > 120) return `${text.slice(0, 120)}[truncated]`;
    return text.replace(/[A-Za-z0-9_=-]{32,}/g, "[redacted]");
  });
}

function normalizeLiveInspectCommandEvidence({ result = {}, runner, repositorySlug, prNumber, parsed = {}, cwd = null } = {}) {
  const rawEvidence = result.commandEvidence || null;
  if (!rawEvidence || typeof rawEvidence !== "object" || Array.isArray(rawEvidence)) {
    return fail("inspect_pr_command_evidence_missing", "live PR inspection must return sanitized command evidence");
  }
  const args = sanitizeArgv(rawEvidence.args || []);
  if (rawEvidence.command !== "gh") return fail("inspect_pr_command_evidence_incomplete", "live PR inspection command evidence must use gh");
  if (args[0] !== "pr" || args[1] !== "view" || String(args[2]) !== String(prNumber)) {
    return fail("inspect_pr_command_evidence_pr_mismatch", "live PR inspection command evidence PR number does not match");
  }
  const repoIndex = args.indexOf("--repo");
  if (repoIndex < 0 || args[repoIndex + 1] !== repositorySlug) {
    return fail("inspect_pr_command_evidence_repository_mismatch", "live PR inspection command evidence must include the explicit repository");
  }
  const runnerIdentity = sanitizeState(rawEvidence.runnerIdentity || runner?.settleoraRunnerIdentity || null);
  if (!runnerIdentity || runnerIdentity.kind !== "live-fixed-argv") {
    return fail("inspect_pr_command_evidence_runner_mismatch", "live PR inspection command evidence must include live runner identity");
  }
  const status = rawEvidence.status ?? result.status;
  if (status !== 0) return fail("inspect_pr_command_evidence_exit_mismatch", "live PR inspection command evidence must record successful exit status");
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  const evidence = sanitizeState({
    schemaVersion: 1,
    runnerIdentity,
    command: rawEvidence.command,
    args,
    repositorySlug,
    prNumber,
    cwd: rawEvidence.cwd || cwd || null,
    startedAt: rawEvidence.startedAt || null,
    completedAt: rawEvidence.completedAt || new Date().toISOString(),
    timeoutMs: rawEvidence.timeoutMs ?? runnerIdentity.timeoutMs ?? null,
    maxOutputBytes: rawEvidence.maxOutputBytes ?? runnerIdentity.maxOutputBytes ?? null,
    status,
    signal: rawEvidence.signal || null,
    error: rawEvidence.error || result.error || null,
    stdoutSha256: rawEvidence.stdoutSha256 || createHash("sha256").update(stdout).digest("hex"),
    stderrSha256: rawEvidence.stderrSha256 || createHash("sha256").update(stderr).digest("hex"),
    stdoutExcerpt: boundedText(rawEvidence.stdoutExcerpt || stdout, 1000),
    stderrExcerpt: boundedText(rawEvidence.stderrExcerpt || stderr, 1000),
    parsedResponseDigest: digestJson(parsed),
  });
  for (const field of ["cwd", "startedAt", "completedAt", "timeoutMs", "maxOutputBytes", "stdoutSha256", "stderrSha256", "parsedResponseDigest"]) {
    if (evidence[field] === null || evidence[field] === undefined || evidence[field] === "") {
      return fail("inspect_pr_command_evidence_incomplete", `live PR inspection command evidence missing ${field}`);
    }
  }
  return { ok: true, evidence };
}

function validateFreshMergeCommandEvidence(evidence, { prNumber, repositorySlug } = {}) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return fail("final_hygiene_live_command_evidence_missing", "fresh merged-state proof requires live command evidence");
  }
  if (evidence.runnerIdentity?.kind !== "live-fixed-argv") {
    return fail("final_hygiene_live_command_evidence_missing", "fresh merged-state proof requires live runner identity");
  }
  if (evidence.repositorySlug !== repositorySlug) {
    return fail("final_hygiene_live_command_evidence_repository_mismatch", "fresh merged-state command evidence repository mismatch");
  }
  if (evidence.prNumber !== prNumber) {
    return fail("final_hygiene_live_command_evidence_pr_mismatch", "fresh merged-state command evidence PR mismatch");
  }
  if (evidence.command !== "gh" || !Array.isArray(evidence.args) || evidence.args[0] !== "pr" || evidence.args[1] !== "view" || !evidence.args.includes("--repo")) {
    return fail("final_hygiene_live_command_evidence_incomplete", "fresh merged-state command evidence must use fixed gh pr view --repo argv");
  }
  for (const field of ["cwd", "startedAt", "completedAt", "status", "stdoutSha256", "stderrSha256", "parsedResponseDigest"]) {
    if (evidence[field] === null || evidence[field] === undefined || evidence[field] === "") {
      return fail("final_hygiene_live_command_evidence_incomplete", `fresh merged-state command evidence missing ${field}`);
    }
  }
  if (evidence.status !== 0) return fail("final_hygiene_live_command_evidence_exit_mismatch", "fresh merged-state command evidence did not record success");
  return { ok: true, evidence: sanitizeState(evidence) };
}

function validateFinalHygieneResult(result, commandEvidence = []) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return fail("final_hygiene_result_missing", "final hygiene did not return canonical evidence");
  if (result.status !== "merged") return fail("final_hygiene_status_not_merged", "final hygiene did not report merged status");
  if (!validSha(result.mergeSha)) return fail("final_hygiene_merge_sha_missing", "final hygiene result is missing merge SHA proof");
  if (!validSha(result.sourceHeadSha)) return fail("final_hygiene_source_head_missing", "final hygiene result is missing source head proof");
  const components = {
    comment: result.comment,
    closure: result.closure,
    labelCleanup: result.labelCleanup,
    parentProgress: result.parentProgress,
    project: result.project,
    ledger: result.ledger,
  };
  for (const [name, component] of Object.entries(components)) {
    if (!isSuccessfulOrIdempotentHygieneComponent(component)) {
      return fail("final_hygiene_component_failed", `final hygiene component failed: ${name}`, { component: name, result: sanitizeState(component) });
    }
  }
  const actualCalls = commandEvidence.filter((entry) => entry.command === "gh" || entry.command === "git");
  if (actualCalls.length === 0) return fail("final_hygiene_command_evidence_missing", "final hygiene success requires actual runner command evidence");
  return { ok: true, result: sanitizeState({ ...result, commandEvidence: actualCalls }) };
}

function isSuccessfulOrIdempotentHygieneComponent(component = {}) {
  if (!component || typeof component !== "object") return false;
  if (component.status === "updated" || component.status === "created" || component.status === "reused" || component.status === "not_updated" || component.status === "preview") return true;
  if (component.status === "skipped") {
    return /already_present|already_closed|no_transient_labels|mapping_not_configured|mapping_incomplete|missing|not_required|remaining_gates_present|umbrella_or_tracker_keep_open|close_rule_not_satisfied/.test(String(component.reason || ""));
  }
  if (component.skipped === true) return true;
  if (component.ok === true && component.skipped !== false) return true;
  return false;
}

function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, input: options.input, encoding: "utf8", windowsHide: true });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error?.message || null };
}

function fail(reasonCode, reason = reasonCode, extra = {}) {
  return { ok: false, reasonCode, reason, ...extra };
}

export function digestStackPlan(plan) {
  return createHash("sha256").update(JSON.stringify(plan || {})).digest("hex");
}

export const prStackExecutorTestInternals = Object.freeze({
  canonicalRepositoryFromOriginUrl,
  canonicalRepositorySlug,
  buildCanonicalCandidatePrDelta,
  createProductionBatchFixAdapters,
  createOrReuseLocalCandidateCommit,
  collectCumulativeCandidateContentIdentity,
  createSourceCycleOperationContext,
  deriveCanonicalCommitChain,
  digestStackPlan,
  prepareProtectedPlanAuthorizationLifecycle,
  protectedAuthorizationStatePath,
  protectedPlanAuthorizationIdentity,
  readProtectedPlanAuthorizationFile,
  discoverTaskScopedPendingPushIntents,
  advanceLocalCandidateHistory,
  evaluateLocalFixAllowance,
  evaluateSourceCycleBudget,
  fetchAndReadOriginMain,
  finalizePushIntent,
  journalAuthorizesDirtyCandidate,
  normalizeSourceChangingConvergenceResult,
  validateCanonicalCommitChain,
  validateCandidateDeltaEvidence,
  persistPushIntent,
  persistSourceCycleReservation,
  proveTargetBatchFixWorktree,
  reconcileTaskScopedPendingPushIntent,
  reconcilePushIntent,
  readTrustedExecutableStackPlanBytes,
  readLivePrProof,
  readOriginRepositoryProof,
  restoreStackSourceBranchIfDeleted,
  readWorktreeCleanProof,
  sourceChangingResultFromIntent,
  validateSourceCycleOperationContext,
  validateSourceCycleReservation,
  safeSourceBranchTarget,
  validateRepositoryIdentityProof,
  validatePushTargetBranch,
});
