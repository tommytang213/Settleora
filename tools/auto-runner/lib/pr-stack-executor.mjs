import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  nextStackAction,
  proveSemanticOwnDelta,
  recordStackMutationMarker,
  validateStackRelationships,
} from "./pr-stack-controller.mjs";
import {
  executeAutoMerge,
  inspectAutoMergeGithubState,
  mandatoryAutoMergeCheckNames,
  summarizeCheckStatus,
} from "./auto-merge-policy.mjs";
import { completeMergedIssueHygiene } from "./completion-hygiene.mjs";
import {
  runExistingPrBatchFix,
  runExistingPrReviewConvergence,
} from "./review-convergence-controller.mjs";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";
import { classifyIssueLane, filterForbiddenChangedFiles } from "./lane-policy.mjs";
import { runCodexPrompt } from "./codex-runner.mjs";
import { bindValidationEvidence, planValidation, runValidationPlan } from "./validation-planner.mjs";

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

const acceptedStrongReviewTiers = new Set(["strong_independent", "tie_breaker"]);
const protectedBranchNames = new Set(["main", "master"]);
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
    capabilities: Object.freeze(capabilities),
    statePath: typeof raw.statePath === "string" ? raw.statePath : null,
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
  plan = rebindPlanToStateHeads(plan, state);
  state = transitionState(state, {
    phase: "planning",
    terminal: null,
    summary: { planPath: planLoad.planPath, statePath },
  });
  writePrStackState(statePath, state);

  const action = nextStackAction(plan, state.evidence || {});
  state = transitionState(state, { phase: "dispatch", currentAction: action });
  writePrStackState(statePath, state);

  const dispatch = await dispatchStackAction({ config, stackConfig, plan, state, action, adapter });
  if (!dispatch.ok) {
    const evidence = dispatch.evidencePatch ? mergeEvidencePatch(state.evidence, dispatch.evidencePatch) : dispatch.evidence || state.evidence;
    const blocked = transitionState(state, {
      phase: dispatch.waiting ? "waiting" : "blocked",
      terminal: dispatch.waiting ? null : { reasonCode: dispatch.reasonCode, reason: dispatch.reason },
      wait: dispatch.waiting ? { reasonCode: dispatch.reasonCode, action } : null,
      evidence,
      sourceCycles: dispatch.sourceCycles || state.sourceCycles,
      exactHeads: dispatch.exactHeads || state.exactHeads,
      orderedPrs: dispatch.orderedPrs || state.orderedPrs,
      summary: dispatch.summary || null,
    });
    writePrStackState(statePath, blocked);
    return { ok: false, outcome: dispatch.waiting ? "waiting" : "blocked", reasonCode: dispatch.reasonCode, reason: dispatch.reason, statePath, state: summarizeStackState(blocked) };
  }

  const nextState = transitionState(state, {
    phase: dispatch.complete ? "completed" : "advanced",
    terminal: dispatch.complete ? { reasonCode: "stack_complete", reason: "all_prs_merged_and_hygiene_complete" } : null,
    wait: null,
    evidence: dispatch.evidence || state.evidence,
    mutationMarkers: dispatch.mutationMarkers || state.mutationMarkers,
    activePrNumber: dispatch.activePrNumber ?? state.activePrNumber,
    sourceCycles: dispatch.sourceCycles || state.sourceCycles,
    exactHeads: dispatch.exactHeads || state.exactHeads,
    orderedPrs: dispatch.orderedPrs || state.orderedPrs,
    summary: dispatch.summary || null,
  });
  writePrStackState(statePath, nextState);
  return { ok: true, outcome: dispatch.complete ? "complete" : "advanced", action, statePath, state: summarizeStackState(nextState), result: dispatch.result || null };
}

export function loadExecutableStackPlan(config = {}, stackPlanPath, { stackConfig = normalizePrStackExecutionConfig(config) } = {}) {
  if (!stackPlanPath || !path.isAbsolute(stackPlanPath)) return fail("stack_plan_path_required", "--stack-plan must be an absolute path");
  const logsRoot = path.resolve(config.logsRoot || "/workspace/logs/settleora-auto-runner");
  const resolved = path.resolve(stackPlanPath);
  if (!isInside(resolved, logsRoot)) return fail("stack_plan_outside_logs_root", "stack plan must be under configured logsRoot");
  const fileTrust = validateOwnerOnlyFile(resolved);
  if (!fileTrust.ok) return fileTrust;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    return fail("stack_plan_corrupt", "stack plan JSON could not be parsed");
  }
  const plan = normalizePlanContainer(parsed);
  const validation = validateExecutableStackPlan(config, plan, { stackConfig, source: parsed });
  if (!validation.ok) return validation;
  return { ok: true, plan, planPath: resolved };
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
  for (const pr of plan.orderedPrs) {
    if (!Number.isInteger(pr.number)) return fail("stack_pr_number_invalid", "PR numbers must be integers");
    if (pr.number === 917) return fail("stack_pr_917_refused", "PR #917 cannot enter executable live-stack work");
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
  return { ok: true };
}

export function createInitialPrStackState({ plan, adapter = null } = {}) {
  const now = new Date().toISOString();
  const state = sanitizeState({
    stateVersion: prStackStateVersion,
    stackId: plan.stackId,
    repository: plan.repository,
    issueNumber: plan.issueNumber ?? null,
    trackerIssues: plan.trackerIssues || plan.issues || {},
    orderedPrs: plan.orderedPrs.map((pr) => immutablePrIdentity(pr)),
    activePrNumber: plan.activePrNumber || plan.orderedPrs[0]?.number || null,
    currentPhase: "initialized",
    currentAction: null,
    sourceCycles: Object.fromEntries(plan.orderedPrs.map((pr) => [pr.number, 0])),
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
  mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
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
      return dispatchCompleteGates({ config, state, action, pr, adapter });
    case "merge_pr":
      return dispatchMergePr({ config, plan, state, action, pr, adapter });
    case "retarget_pr":
      return dispatchRetargetPr({ state, action, pr, adapter });
    case "prove_own_delta":
      return dispatchOwnDeltaProof({ state, action, pr, adapter });
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
  const recovered = await adapter.inspectPr({ config, plan, state, prNumber: action.prNumber });
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
      const budget = evaluateSourceCycleBudget({ config, state, pr, findings: before.findings || [] });
      if (!budget.ok && budget.reasonCode !== "source_cycle_budget_exhausted") return budget;
      const consumed = budget.ok ? budget.consumed : state.sourceCycles?.[pr.number];
      const sourceCycles = { ...(state.sourceCycles || {}), [pr.number]: consumed + 1 };
      const rebound = rebindStateToNewHead(state, pr.number, newHead, sourceCycles, reconciled);
      if (!rebound.ok) return rebound;
      return {
        ok: true,
        evidence: rebound.evidence,
        mutationMarkers: rebound.mutationMarkers,
        sourceCycles,
        exactHeads: rebound.exactHeads,
        orderedPrs: rebound.orderedPrs,
        summary: { action: action.action, prNumber: pr.number, oldHead: pr.headRefOid, newHead, sourceCycleConsumed: true, pushIntentReconciledBeforeStale: true },
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
  const newHead = result.newHead || result.headRefOid || pr.headRefOid;
  const sourceCycles = { ...(state.sourceCycles || {}) };
  if (newHead !== pr.headRefOid) {
    sourceCycles[pr.number] = budget.consumed + 1;
    const rebound = rebindStateToNewHead(state, pr.number, newHead, sourceCycles, result);
    if (!rebound.ok) return rebound;
    return {
      ok: true,
      evidence: rebound.evidence,
      mutationMarkers: rebound.mutationMarkers,
      sourceCycles,
      exactHeads: rebound.exactHeads,
      orderedPrs: rebound.orderedPrs,
      summary: { action: action.action, prNumber: pr.number, oldHead: pr.headRefOid, newHead, sourceCycleConsumed: true, reboundExactHead: true },
    };
  }
  const marker = recordStackMutationMarker({ mutationMarkers: state.mutationMarkers }, { kind: "converge_pr", key: pr.headRefOid, prNumber: pr.number, exactHead: pr.headRefOid });
  const mutationMarkers = {
    ...marker.plan.mutationMarkers,
    [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(result) },
  };
  return {
    ok: true,
    evidence: putEvidence(state.evidence, "reviewConverged", pr.number, result),
    mutationMarkers,
    sourceCycles,
    summary: { action: action.action, prNumber: pr.number, sourceCycleConsumed: newHead !== pr.headRefOid, sourceCycleBudget: budget.summary },
  };
}

async function dispatchCompleteGates({ config, state, action, pr, adapter }) {
  const result = await adapter.completeFinalGates({ config, state, pr });
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
  const markerKey = markerKeyFor("merge_pr", pr.number, pr.headRefOid);
  if (state.mutationMarkers[markerKey]) {
    return { ok: true, evidence: putEvidence(state.evidence, "merged", pr.number, state.mutationMarkers[markerKey].result || { ok: true, merged: true }), mutationMarkers: state.mutationMarkers, summary: { action: action.action, duplicate: true } };
  }
  const result = await adapter.mergePr({ config, plan, state, pr, expectedHead: action.expectedHead || pr.headRefOid });
  if (!result?.ok) return waitOrFail(result, "merge_failed");
  const marker = recordStackMutationMarker({ mutationMarkers: state.mutationMarkers }, { kind: "merge_pr", key: pr.headRefOid, prNumber: pr.number, exactHead: pr.headRefOid });
  const mutationMarkers = {
    ...marker.plan.mutationMarkers,
    [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(result) },
  };
  return {
    ok: true,
    evidence: putEvidence(state.evidence, "merged", pr.number, { ...result, ok: true, merged: true }),
    mutationMarkers,
    activePrNumber: nextUnmergedPr(plan, state.evidence, pr.number),
    summary: { action: action.action, prNumber: pr.number, mergeSha: result.mergeSha || null },
  };
}

async function dispatchRetargetPr({ state, action, pr, adapter }) {
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
  const result = await adapter.retargetPrBase({ pr, newBase: action.newBase || "main", expectedHead: pr.headRefOid, expectedCurrentBase: pr.baseRefName });
  if (!result?.ok) return waitOrFail(result, "retarget_failed");
  const actualNewBase = result.after?.baseRefName || action.newBase || "main";
  const retargetProof = { ...result, ok: true, newBase: actualNewBase, after: { ...(result.after || {}), baseRefName: actualNewBase } };
  const marker = recordStackMutationMarker({ mutationMarkers: state.mutationMarkers }, { kind: "retarget_pr", key: `${pr.headRefOid}:main`, prNumber: pr.number, exactHead: pr.headRefOid });
  const mutationMarkers = {
    ...marker.plan.mutationMarkers,
    [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(retargetProof) },
  };
  return {
    ok: true,
    evidence: putEvidence(state.evidence, "retargeted", pr.number, retargetProof),
    mutationMarkers,
    orderedPrs: rebindOrderedPrAfterRetarget(state, pr.number, retargetProof),
    summary: { action: action.action, prNumber: pr.number },
  };
}

async function dispatchOwnDeltaProof({ state, action, pr, adapter }) {
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
      const ready = await adapter.markReadyForReview({ pr, expectedHead: pr.headRefOid });
      if (!ready?.ok) return waitOrFail(ready, "ready_transition_failed");
      const readyProof = { ...ready, ok: true, after: { ...(ready.after || {}), isDraft: false } };
      const marker = recordStackMutationMarker({ mutationMarkers }, { kind: "ready_pr", key: pr.headRefOid, prNumber: pr.number, exactHead: pr.headRefOid });
      mutationMarkers = {
        ...marker.plan.mutationMarkers,
        [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(readyProof) },
      };
      evidence = putEvidence(evidence, "ready", pr.number, readyProof);
    }
  }
  return { ok: true, evidence, mutationMarkers, summary: { action: action.action, prNumber: pr.number } };
}

async function dispatchHygiene({ config, plan, state, adapter }) {
  for (const pr of plan.orderedPrs) {
    if (!state.evidence?.merged?.[pr.number]) return fail("hygiene_before_all_merges_refused", "final hygiene requires every PR merge proof");
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
  return {
    capabilities: {
      shellFreeArgv: true,
      usesExistingMergeAuthority: true,
      usesExistingHygieneAuthority: true,
      usesExistingBatchFixAuthority: true,
    },
    async inspectPr({ config: cfg, prNumber }) {
      const state = inspectAutoMergeGithubState(cfg || config, { issue: {}, prUrlOrNumber: prNumber });
      if (!state?.pr) return fail("inspect_pr_missing", "PR inspection did not return a PR");
      return {
        ok: true,
        pr: state.pr,
        headRefOid: state.pr.headRefOid,
        requiredChecks: state.requiredChecks || [],
        reviewThreads: state.reviewThreads || [],
        codeScanningAlerts: state.codeScanningAlerts || [],
        findings: unresolvedThreadsAsFindings(state.reviewThreads || []),
      };
    },
    async convergeExistingPr({ pr, findings = [], state = null, sourceCycleBudget = null }) {
      const durableBudget = sourceCycleBudget || evaluateSourceCycleBudget({ config, state, pr, findings });
      if (!durableBudget.ok) return durableBudget;
      const result = await runExistingPrReviewConvergence({
        config,
        issue: { number: pr.issueNumber || 921, title: pr.title || "" },
        pr,
        findings,
        laneDecision: { lane: "workflow-docs-tooling", allowedPaths: ["tools/auto-runner/**", "docs/**"] },
        sourceCycleBudget: durableBudget,
        runBatchFix,
      });
      return result.ok
        ? { ...result, headRefOid: result.newHead || pr.headRefOid }
        : result;
    },
    async completeFinalGates({ config: cfg, state, pr }) {
      const targetConfig = cfg || config;
      let gate = collectFinalGateEvidence({ config: targetConfig, state, pr, runner: runner || defaultRunner });
      if (isFinalGateExactHeadEvidenceMissing(gate)) {
        const prepared = await prepareExactHeadFinalGateEvidence({
          config: targetConfig,
          state,
          pr,
          runner: runner || defaultRunner,
          runStrongReview: options.runStrongReview,
          runCodexReview: options.runCodexReview,
          runValidation: options.runValidationPlan || runValidationPlan,
        });
        if (!prepared.ok) return prepared;
        const patchedState = { ...state, evidence: mergeEvidencePatch(state.evidence, prepared.evidencePatch) };
        gate = collectFinalGateEvidence({ config: targetConfig, state: patchedState, pr, runner: runner || defaultRunner });
        if (!gate.ok && gate.waiting) {
          return { ...gate, evidencePatch: prepared.evidencePatch };
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
    async mergePr({ config: cfg, state, pr, expectedHead }) {
      const gateEvidence = state.evidence?.gatesPassed?.[pr.number] || {};
      const inspection = await this.inspectPr({ config: cfg || config, prNumber: pr.number });
      if (!inspection?.ok) return waitOrFail(inspection, "merge_pr_inspection_failed");
      if (inspection.headRefOid && inspection.headRefOid !== expectedHead) {
        return fail("merge_pr_head_stale", `PR #${pr.number} head changed before merge`);
      }
      const changedFiles = normalizeChangedFiles(gateEvidence.changedFiles || inspection.changedFiles || pr.changedFiles || []);
      const allowedPathProofValid = allowedPathProofMatchesGate(gateEvidence, changedFiles, expectedHead);
      const expectedBase = gateEvidence.baseSha || gateEvidence.expectedOriginMainSha || null;
      if (!validSha(expectedBase)) return fail("final_gate_base_missing", "final gate evidence must be bound to origin/main");
      const baseRefresh = fetchAndReadOriginMain({ config: cfg || config, runner: runner || defaultRunner, reasonPrefix: "merge_base" });
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
      const worktreeProof = readMergeWorktreeCleanProof({ config: cfg || config, expectedHead, runner: runner || defaultRunner });
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
        config: cfg || config,
        issue: gateEvidence.issue || { number: pr.issueNumber || 921, state: "OPEN", labels: [] },
        issueLabels: gateEvidence.issueLabels || [],
        pr: { ...pr, ...(inspection.pr || {}), state: "OPEN", isDraft: false, baseRefName: "main", headRefOid: expectedHead },
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
      };
      const result = executeAutoMerge(cfg || config, context, runner ? { runner } : {});
      return result.result === "merged" || result.result === "dry_run_eligible"
        ? { ok: true, merged: result.result === "merged", mergeSha: result.mergeSha || null, result }
        : fail(result.reason || "merge_blocked", result.reason || "merge blocked");
    },
    async fetchCurrentMain({ config: cfg, state, pr }) {
      return fetchCurrentMainProof({ config: cfg || config, state, pr, runner: runner || defaultRunner });
    },
    async retargetPrBase({ pr, newBase, expectedHead, expectedCurrentBase }) {
      const proof = readPrRetargetProof({ config, pr, expectedHead, expectedCurrentBase, runner: runner || defaultRunner });
      if (!proof.ok) return proof;
      const result = (runner || defaultRunner)("gh", ["pr", "edit", String(pr.number), "--base", String(newBase)], { cwd: config.repoRoot });
      if (result.status !== 0 || result.error) return fail("retarget_failed", boundedText(result.stderr || result.error || result.stdout));
      const after = readPrRetargetProof({ config, pr: { ...pr, baseRefName: newBase }, expectedHead, expectedCurrentBase: newBase, runner: runner || defaultRunner });
      if (!after.ok) return after;
      return { ok: true, prNumber: pr.number, newBase, expectedHead, expectedCurrentBase, before: proof.proof, after: after.proof };
    },
    async proveSemanticOwnDelta({ pr }) {
      const current = readCurrentPrOwnDelta({ config, pr, runner: runner || defaultRunner });
      if (!current.ok) return current;
      return { ok: true, before: pr.ownDelta, after: current.ownDelta };
    },
    async markReadyForReview({ pr, expectedHead }) {
      const before = readPrReadyProof({ config, pr, expectedHead, expectedDraft: true, runner: runner || defaultRunner });
      if (!before.ok) return before;
      const result = (runner || defaultRunner)("gh", ["pr", "ready", String(pr.number)], { cwd: config.repoRoot });
      if (result.status !== 0 || result.error) return fail("ready_failed", boundedText(result.stderr || result.error || result.stdout));
      const after = readPrReadyProof({ config, pr: { ...pr, isDraft: false }, expectedHead, expectedDraft: false, runner: runner || defaultRunner });
      if (!after.ok) return after;
      return { ok: true, prNumber: pr.number, expectedHead, before: before.proof, after: after.proof };
    },
    async updatePrStatusEvidence() {
      return { ok: true, reason: "status_update_not_required" };
    },
    async reconcilePendingPushIntent({ config: cfg, state, pr, livePr }) {
      return reconcileTaskScopedPendingPushIntent({ config: cfg || config, state, pr, livePr, runner: runner || defaultRunner });
    },
    async runFinalHygiene({ config: cfg, plan, state }) {
      const finalPr = plan.orderedPrs.at(-1);
      const mergeProof = state.evidence?.merged?.[finalPr.number] || {};
      const result = completeMergedIssueHygiene(cfg || config, {
        issue: { number: plan.issueNumber || 921, state: "OPEN", labels: [] },
        pr: finalPr,
        mergeSha: mergeProof.mergeSha || mergeProof.result?.mergeSha || null,
        sourceHeadSha: finalPr.headRefOid,
        closeRuleSatisfied: false,
        remainingGates: ["#921 remains open until live acceptance is verified"],
      });
      return { ok: true, result };
    },
  };
}

function createProductionBatchFixAdapters(config = {}, options = {}) {
  const runner = options.runner || defaultRunner;
  const cwd = config.repoRoot || process.cwd();
  return {
    async runCodexBatchFix({ fixTask, pr }) {
      const proof = proveTargetBatchFixWorktree({ config, pr, runner });
      if (!proof.ok) return proof;
      if (proof.localCandidateHead && proof.localCandidateHead !== proof.expectedHead) {
        return { ok: true, skippedCodex: true, reason: "existing_unpushed_local_candidate", targetWorktreeProof: proof };
      }
      const promptPath = path.join(
        config.logsRoot || "/workspace/logs/settleora-auto-runner",
        "review-fix",
        `${Date.now()}-pr-${pr?.number || "unknown"}-stack-batch-fix-prompt.md`,
      );
      mkdirSync(path.dirname(promptPath), { recursive: true, mode: 0o700 });
      writeFileSync(promptPath, `${fixTask?.prompt || ""}\n`, { mode: 0o600 });
      const codex = runCodexPrompt(
        { ...config, repoRoot: proof.worktreePath },
        {
          branchName: pr?.headRefName || pr?.branch || "unknown",
          prompt: fixTask?.prompt || "",
          promptPath,
        },
        "existing-pr-stack-batch-fix",
      );
      if (!codex.skipped && (codex.error || codex.status !== 0)) {
        return fail("existing_pr_batch_fix_codex_failed", codex.error || codex.tail || "Codex batch fix failed");
      }
      return { ok: true, codex, promptPath };
    },
    async listChangedFiles({ exactHead }) {
      const head = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_batch_fix_head_unreadable" });
      if (!head.ok) throw new Error(head.reason);
      if (exactHead && head.sha !== exactHead) {
        const committed = runner("git", ["diff", "--name-only", `${exactHead}..HEAD`], { cwd });
        if (committed.status !== 0 || committed.error) throw new Error(`git diff exactHead..HEAD failed: ${boundedText(committed.stderr || committed.error || committed.stdout)}`);
        const dirty = readWorktreeCleanProof({ runner, cwd });
        if (!dirty.ok || dirty.clean !== true) throw new Error("existing local candidate has additional dirty changes");
        return normalizeChangedFiles(committed.stdout.split(/\r?\n/));
      }
      const diff = runner("git", ["diff", "--name-only"], { cwd });
      if (diff.status !== 0 || diff.error) throw new Error(`git diff failed: ${boundedText(diff.stderr || diff.error || diff.stdout)}`);
      const staged = runner("git", ["diff", "--cached", "--name-only"], { cwd });
      if (staged.status !== 0 || staged.error) throw new Error(`git diff --cached failed: ${boundedText(staged.stderr || staged.error || staged.stdout)}`);
      return normalizeChangedFiles(`${diff.stdout || ""}\n${staged.stdout || ""}`.split(/\r?\n/));
    },
    async validateAndReview({ exactHead, changedFiles, laneDecision, pr, findingFingerprints, fingerprintDigest }) {
      const candidate = createOrReuseLocalCandidateCommit({
        config,
        runner,
        cwd,
        exactHead,
        changedFiles,
        message: "Auto-runner stack review-fix batch",
      });
      if (!candidate.ok) return candidate;
      const base = readGitSha({ runner, cwd, ref: "origin/main", reasonCode: "existing_pr_batch_fix_base_unreadable" });
      if (!base.ok) return base;
      const validationPlan = planValidation(changedFiles, laneDecision || { validationProfile: "runner-tests" });
      const targetConfig = { ...config, repoRoot: cwd };
      const validation = bindValidationEvidence(runValidationPlan(targetConfig, validationPlan), {
        headSha: candidate.newHead,
        baseSha: base.sha,
        changedFiles,
        profile: laneDecision?.validationProfile || validationPlan.profile,
      });
      if (!validation.passed) return fail("existing_pr_batch_fix_validation_failed", "batch fix validation failed", { validation });
      if (typeof options.runStrongReview !== "function" || typeof options.runCodexReview !== "function") {
        return fail("existing_pr_batch_fix_review_adapter_unconfigured", "strong and Codex review adapters are required before push");
      }
      const externalReview = await options.runStrongReview({ config: targetConfig, pr, changedFiles, validation, headSha: candidate.newHead, baseSha: base.sha });
      if (externalReview?.status !== "pass") return fail("existing_pr_batch_fix_strong_review_failed", externalReview?.reason || "strong review did not pass", { externalReview });
      const review = await options.runCodexReview({ config: targetConfig, pr, changedFiles, validation, externalReview, headSha: candidate.newHead, baseSha: base.sha });
      const verdict = review?.verdict?.verdict || review?.verdict;
      if (verdict !== "approve") return fail("existing_pr_batch_fix_codex_review_failed", review?.reviewFailureReason || "Codex review did not approve", { review });
      return {
        ok: true,
        validation,
        externalReview,
        review,
        localCandidate: candidate,
        sourceIdentity: {
          oldHead: exactHead,
          headSha: candidate.newHead,
          newHead: candidate.newHead,
          parent: candidate.parent,
          tree: candidate.tree,
          commitChain: candidate.commitChain,
          commitChainDigest: candidate.commitChainDigest,
          baseSha: base.sha,
          changedFilesDigest: digestStringSet(changedFiles),
          findingFingerprints,
          fingerprintDigest,
        },
      };
    },
    async commitAndPush({ exactHead, changedFiles, reviewed, pr, fingerprintDigest, markerKey }) {
      const newHead = reviewed?.localCandidate?.newHead || reviewed?.sourceIdentity?.newHead || null;
      if (!validSha(newHead)) return fail("existing_pr_batch_fix_new_head_unreadable", "validated local candidate head is missing");
      const branch = pr?.headRefName || pr?.branch || "";
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
      const intent = persistPushIntent({
        config,
        markerKey,
        pr,
        branch,
        oldHead: exactHead,
        newHead,
        changedFiles,
        fingerprintDigest,
        reviewed,
        pushTarget: `origin ${newHead}:${branch}`,
        liveProof: live.proof,
        repositoryIdentity: live.repositoryIdentity,
      });
      const reconciledIntent = reconcilePushIntent({ config, pr, intent, runner });
      if (reconciledIntent.ok && reconciledIntent.finalized === true) {
        return { ok: true, newHead, sourceIdentity: { ...(reviewed?.sourceIdentity || {}), newHead }, pushedAt: reconciledIntent.confirmedAt, pushIntent: intent, pushConfirmation: reconciledIntent };
      }
      if (!reconciledIntent.ok && reconciledIntent.reasonCode !== "push_intent_not_completed") return reconciledIntent;
      const push = runner("git", ["push", "origin", `${newHead}:${branch}`], { cwd });
      if (push.status !== 0 || push.error) return fail("existing_pr_batch_fix_push_failed", boundedText(push.stderr || push.error || push.stdout));
      const confirmation = reconcilePushIntent({ config, pr, intent, runner, requireCandidate: true });
      if (!confirmation.ok) return confirmation;
      return { ok: true, newHead, sourceIdentity: { ...(reviewed?.sourceIdentity || {}), newHead }, pushedAt: confirmation.confirmedAt, pushIntent: intent, pushConfirmation: confirmation };
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
    sourceCycles: patch.sourceCycles || state.sourceCycles,
    exactHeads: patch.exactHeads || state.exactHeads,
    orderedPrs: patch.orderedPrs || state.orderedPrs,
    terminal: patch.terminal === undefined ? state.terminal : patch.terminal,
    wait: patch.wait === undefined ? state.wait : patch.wait,
    summaries,
  });
}

function evaluateSourceCycleBudget({ config = {}, state = null, pr = {}, findings = [] } = {}) {
  const prNumber = pr?.number;
  if (!Number.isInteger(prNumber)) return fail("source_cycle_state_pr_invalid", "source-cycle budget requires a valid PR number");
  const hasDurableState = state && typeof state === "object" && !Array.isArray(state);
  const sourceCycles = hasDurableState ? state.sourceCycles || {} : { [prNumber]: 0 };
  if (hasDurableState && !Object.prototype.hasOwnProperty.call(sourceCycles, prNumber)) {
    return fail("source_cycle_state_missing", "durable source-cycle state is missing for the active PR");
  }
  const consumed = sourceCycles[prNumber];
  if (!Number.isInteger(consumed) || consumed < 0) {
    return fail("source_cycle_state_malformed", "durable source-cycle count is malformed");
  }
  const max = normalizeSourceCycleMax(config);
  if (!Number.isInteger(max) || max < 0) return fail("source_cycle_budget_malformed", "source-cycle maximum is malformed");
  const epoch = state?.sourceCycleEpoch?.[prNumber] || state?.sourceCycleEpoch || 1;
  if (!Number.isInteger(epoch) || epoch < 1) return fail("source_cycle_epoch_malformed", "durable source-cycle epoch is malformed");
  const materialFindings = Array.isArray(findings) ? findings.filter((finding) => finding && finding.material !== false) : [];
  const remaining = Math.max(0, max - consumed);
  const summary = {
    prNumber,
    exactHead: pr?.headRefOid || null,
    epoch,
    consumed,
    max,
    remaining,
    materialFindingCount: materialFindings.length,
  };
  if (materialFindings.length > 0 && consumed >= max) {
    return fail("source_cycle_budget_exhausted", "durable per-PR source-cycle budget is exhausted", { summary, sourceCycleBudget: summary });
  }
  return { ok: true, ...summary, summary };
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
    orderedPrs: plan.orderedPrs.map((pr) => {
      const statePr = statePrs.get(pr.number) || {};
      return {
        ...pr,
        baseRefName: statePr.baseRefName || pr.baseRefName,
        isDraft: statePr.isDraft ?? pr.isDraft,
        headRefOid: exactHeads[pr.number] || statePr.headRefOid || pr.headRefOid,
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
  const validation = validateValidationEvidenceObject(nested.validation, { expectedHead: newHead, expectedBase, changedFiles });
  if (!validation.ok) return validation;
  const strongReview = validateReviewEvidenceObject(nested.externalReview, {
    name: "source_rebound_strong_review",
    expectedHead: newHead,
    expectedBase,
    changedFiles,
    requireIndependent: true,
  });
  if (!strongReview.ok) return strongReview;
  const codexReview = validateReviewEvidenceObject(nested.review, {
    name: "source_rebound_codex_review",
    expectedHead: newHead,
    expectedBase,
    changedFiles,
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
    sourceIdentity: { ...sourceIdentity, parent: chain.parent, commitChain: chain.chain, commitChainDigest: chain.digest },
    changedFiles,
    changedFilesDigest,
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
    if (!isInside(resolved, path.resolve(config.logsRoot))) throw new Error("prStackExecution.statePath must be under logsRoot");
    return resolved;
  }
  return path.join(path.dirname(planPath), "stack-state.json");
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
    expectedParentPr: pr.expectedParentPr ?? null,
    expectedParentBranch: pr.expectedParentBranch ?? null,
  };
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
  return createHash("sha256").update(normalizeChangedFiles(values).join("\n")).digest("hex");
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

function proveTargetBatchFixWorktree({ config, pr, runner }) {
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
  if (clean.clean !== true) return fail("existing_pr_batch_fix_worktree_dirty", "target worktree/index must be clean before checkout or Codex", clean);
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
    provenAt: new Date().toISOString(),
  };
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

function createOrReuseLocalCandidateCommit({ config, runner, cwd, exactHead, changedFiles, message }) {
  const before = readGitSha({ runner, cwd, ref: "HEAD", reasonCode: "existing_pr_batch_fix_head_unreadable" });
  if (!before.ok) return before;
  if (before.sha !== exactHead) {
    const clean = readWorktreeCleanProof({ runner, cwd });
    if (!clean.ok || clean.clean !== true) return fail("existing_pr_batch_fix_candidate_dirty", "existing local candidate has additional source changes");
    const chain = deriveCanonicalCommitChain({ runner, cwd, oldHead: exactHead, newHead: before.sha });
    if (!chain.ok) return chain;
    const tree = readGitSha({ runner, cwd, ref: "HEAD^{tree}", reasonCode: "existing_pr_batch_fix_candidate_tree_unreadable" });
    return { ok: true, reused: true, oldHead: exactHead, parent: chain.parent, newHead: before.sha, tree: tree.sha || null, commitChain: chain.chain, commitChainDigest: chain.digest, committedAt: new Date().toISOString() };
  }
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

function persistPushIntent({ config, markerKey, pr, branch, oldHead, newHead, changedFiles, fingerprintDigest, reviewed, pushTarget, liveProof = null, repositoryIdentity = null }) {
  const root = path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "source-cycle-intents");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const intentPath = path.join(root, `${digestJson({ markerKey, prNumber: pr?.number, oldHead, newHead })}.json`);
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
    patchDigest: sourceIdentity.patchDigest || null,
    sourceCycleEpoch: sourceIdentity.epoch || 1,
    nextSourceCycleCount: sourceIdentity.nextSourceCycleCount || null,
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
    return finalizePushIntent({ intent, remoteHead, liveHead, localHead });
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

function finalizePushIntent({ intent, remoteHead, liveHead, localHead = null }) {
  if (intent.status === "push_confirmed") {
    return { ok: true, finalized: true, idempotent: true, confirmedAt: intent.finalizedAt || null, marker: intent };
  }
  const confirmed = sanitizeState({
    ...intent,
    status: "push_confirmed",
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
  writeFileSync(tmp, `${JSON.stringify(confirmed, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, intent.intentPath);
  return { ok: true, finalized: true, confirmedAt: confirmed.finalizedAt, marker: confirmed };
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
  return { ok: true, finalized: true, newHead: intent.candidateNewHead, result: sourceResult.result, pushConfirmation: reconciled.marker };
}

function discoverTaskScopedPendingPushIntents({ config = {}, state = {}, pr = {}, livePr = {} } = {}) {
  const root = path.join(config.logsRoot || "/workspace/logs/settleora-auto-runner", "source-cycle-intents");
  if (!existsSync(root)) return { ok: true, intents: [] };
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
      parsed = JSON.parse(readFileSync(intentPath, "utf8"));
    } catch {
      return fail("push_intent_malformed", "task-scoped push intent JSON could not be parsed", { intentPath });
    }
    const intent = { ...parsed, intentPath: parsed.intentPath || intentPath };
    if (intent.status !== "push_intent") continue;
    const matched = intentMatchesStalePr({ config, state, pr, livePr, intent });
    if (matched.ok) intents.push(intent);
    else if (matched.reasonCode) return { ...matched, intentPath };
  }
  return { ok: true, intents };
}

function intentMatchesStalePr({ config = {}, state = {}, pr = {}, livePr = {}, intent = {} } = {}) {
  const validation = validatePushIntentShape({ config, pr, intent });
  if (!validation.ok) return validation.reasonCode === "push_intent_malformed" ? validation : { ok: false, ignored: true };
  if (intent.oldHead !== pr.headRefOid) return { ok: false, ignored: true };
  if (livePr?.headRefOid && livePr.headRefOid !== intent.candidateNewHead) return { ok: false, ignored: true };
  if (livePr?.headRepositorySlug || livePr?.baseRepositorySlug || livePr?.originRepositorySlug) {
    const repositoryIdentity = validateRepositoryIdentityProof({ config, liveProof: livePr, originProof: { repositorySlug: livePr.originRepositorySlug || intent.originRepositorySlug }, intent });
    if (!repositoryIdentity.ok) return repositoryIdentity;
  }
  if (intent.markerKey && !String(intent.markerKey).startsWith(`existing_pr_batch_fix:${pr.number}:${pr.headRefOid}:`)) return { ok: false, ignored: true };
  const expectedNext = (state.sourceCycles?.[pr.number] || 0) + 1;
  if (intent.nextSourceCycleCount != null && intent.nextSourceCycleCount !== expectedNext) return { ok: false, ignored: true };
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
    },
    pushedAt: confirmation.confirmedAt || confirmation.marker?.finalizedAt || new Date().toISOString(),
  });
  const result = {
    ok: true,
    newHead: intent.candidateNewHead,
    findingFingerprints: marker.findingFingerprints,
    fingerprintDigest: marker.fingerprintDigest,
    changedFiles,
    changedFilesDigest: intent.changedFilesDigest,
    validation: marker.validation,
    externalReview: marker.externalReview,
    review: marker.review,
    sourceIdentity: marker.sourceIdentity,
    durableMutationMarkers: { [markerKey]: marker },
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
  const stat = statSync(filePath);
  if (!stat.isFile()) return fail("stack_file_not_regular", "stack path must be a regular file");
  if ((stat.mode & 0o077) !== 0) return fail("stack_file_permissions_unsafe", "stack file must be owner-only");
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

function readPrRetargetProof({ config, pr, expectedHead, expectedCurrentBase, runner }) {
  const result = runner(
    "gh",
    ["pr", "view", String(pr.number), "--repo", config.repositorySlug || "tommytang213/Settleora", "--json", "number,state,isDraft,baseRefName,headRefName,headRefOid"],
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
  return { ok: true, proof };
}

function readPrReadyProof({ config, pr, expectedHead, expectedDraft, runner }) {
  const result = runner(
    "gh",
    ["pr", "view", String(pr.number), "--repo", config.repositorySlug || "tommytang213/Settleora", "--json", "number,state,isDraft,baseRefName,headRefName,headRefOid"],
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
  return { ok: true, proof };
}

function isFinalGateExactHeadEvidenceMissing(result) {
  if (!result || result.ok !== false) return false;
  return /^(source_rebound_validation|strong_review|codex_review)_/.test(String(result.reasonCode || ""));
}

async function prepareExactHeadFinalGateEvidence({ config, state, pr, runner, runStrongReview, runCodexReview, runValidation = runValidationPlan }) {
  if (typeof runStrongReview !== "function" || typeof runCodexReview !== "function") {
    return fail("exact_head_review_adapter_unconfigured", "strong and Codex exact-head review adapters are required before final gates");
  }
  const prereq = collectFinalGatePrerequisites({ config, state, pr, runner, reasonPrefix: "exact_head_gate" });
  if (!prereq.ok) return prereq;
  const validationPlan = planValidation(prereq.changedFiles, prereq.laneProof.laneDecision || { validationProfile: "runner-tests" });
  const validation = bindValidationEvidence(runValidation(config, validationPlan), {
    headSha: prereq.currentHead,
    baseSha: prereq.currentOriginMainSha,
    changedFiles: prereq.changedFiles,
    profile: prereq.laneProof.laneDecision?.validationProfile || validationPlan.profile,
  });
  const validationCheck = validateValidationEvidenceObject(validation, {
    expectedHead: prereq.currentHead,
    expectedBase: prereq.currentOriginMainSha,
    changedFiles: prereq.changedFiles,
  });
  if (!validationCheck.ok) return validationCheck;
  const strongReview = await runStrongReview({
    config,
    pr: { ...pr, ...(prereq.inspection.pr || {}), headRefOid: prereq.currentHead },
    changedFiles: prereq.changedFiles,
    validation,
    headSha: prereq.currentHead,
    baseSha: prereq.currentOriginMainSha,
  });
  const strongCheck = validateReviewEvidenceObject(strongReview, {
    name: "strong_review",
    expectedHead: prereq.currentHead,
    expectedBase: prereq.currentOriginMainSha,
    changedFiles: prereq.changedFiles,
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
  });
  const codexCheck = validateReviewEvidenceObject(codexReview, {
    name: "codex_review",
    expectedHead: prereq.currentHead,
    expectedBase: prereq.currentOriginMainSha,
    changedFiles: prereq.changedFiles,
    requireIndependent: false,
  });
  if (!codexCheck.ok) return codexCheck;
  return {
    ok: true,
    evidencePatch: {
      validation: { [pr.number]: validationCheck.validation },
      strongReview: { [pr.number]: strongCheck.review },
      codexReview: { [pr.number]: codexCheck.review },
    },
  };
}

function collectFinalGateEvidence({ config, state, pr, runner }) {
  const prereq = collectFinalGatePrerequisites({ config, state, pr, runner, reasonPrefix: "final_gate" });
  if (!prereq.ok) return prereq;
  const { inspection, currentHead, currentOriginMainSha, originMainFetchedAt, changed, laneProof, status } = prereq;
  const validationEvidence = state?.evidence?.validation?.[pr.number] || state?.evidence?.gatesPassed?.[pr.number]?.validation || null;
  const validation = validateValidationEvidenceObject(validationEvidence, {
    expectedHead: currentHead,
    expectedBase: currentOriginMainSha,
    changedFiles: changed.ownDelta.fileSet,
  });
  if (!validation.ok) return validation;
  const reviewEvidence = buildFinalGateReviewEvidence({
    state,
    prNumber: pr.number,
    expectedHead: currentHead,
    expectedBase: currentOriginMainSha,
    changedFiles: changed.ownDelta.fileSet,
  });
  if (!reviewEvidence.ok) return reviewEvidence;
  const worktree = readMergeWorktreeCleanProof({ config, expectedHead: currentHead, runner });
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

function collectFinalGatePrerequisites({ config, state, pr, runner, reasonPrefix }) {
  const inspection = inspectAutoMergeGithubState(config, { issue: finalGateIssue(config, state, pr), prUrlOrNumber: pr.number });
  if (!inspection?.pr) return fail(`${reasonPrefix}_pr_read_failed`, "PR state could not be read");
  const currentHead = inspection.pr.headRefOid || pr.headRefOid;
  if (currentHead !== pr.headRefOid) return fail(`${reasonPrefix}_pr_head_stale`, `PR #${pr.number} head changed before final gates`);
  if (inspection.pr.baseRefName !== pr.baseRefName) return fail(`${reasonPrefix}_pr_base_stale`, `PR #${pr.number} base changed before final gates`);
  if (inspection.pr.state !== "OPEN") return fail(`${reasonPrefix}_pr_state_not_open`, `PR #${pr.number} is not open`);
  if (inspection.pr.isDraft) return fail(`${reasonPrefix}_pr_is_draft`, `PR #${pr.number} is draft`);
  const changed = readCurrentPrOwnDelta({ config, pr, runner });
  if (!changed.ok) return changed;
  const laneProof = buildAllowedPathProof({ issue: inspection.issue, changedFiles: changed.ownDelta.fileSet, exactHead: currentHead });
  if (!laneProof.ok) return laneProof;
  if (!laneProof.changedFilesExactlyMatchAllowedPaths) {
    return fail("changed_files_do_not_match_allowed_paths", `changed files outside allowed contract: ${laneProof.rejectedPaths.join(",")}`);
  }
  const status = finalExternalGateStatus({ ...inspection, config });
  const base = fetchAndReadOriginMain({ config, runner, reasonPrefix });
  if (!base.ok) return base;
  return {
    ok: true,
    inspection,
    currentHead,
    currentOriginMainSha: base.currentOriginMainSha,
    originMainFetchedAt: base.fetchedAt,
    changed,
    changedFiles: changed.ownDelta.fileSet,
    laneProof,
    status,
  };
}

function buildFinalGateReviewEvidence({ state, prNumber, expectedHead, expectedBase, changedFiles }) {
  const gate = state?.evidence?.gatesPassed?.[prNumber] || {};
  const strongIndependent = state?.evidence?.strongReview?.[prNumber] || gate.reviewEvidence?.strongIndependent || gate.strongReview || gate.externalReview || null;
  const codex = state?.evidence?.codexReview?.[prNumber] || gate.reviewEvidence?.codex || gate.codexReview || gate.review || null;
  return validateFinalGateReviewEvidence({ strongIndependent, codex, expectedHead, expectedBase, changedFiles });
}

function finalGateReviewEvidenceForMerge(gateEvidence, { expectedHead, expectedBase, changedFiles }) {
  const strongIndependent = gateEvidence.reviewEvidence?.strongIndependent || gateEvidence.strongReview || gateEvidence.externalReview || null;
  const codex = gateEvidence.reviewEvidence?.codex || gateEvidence.codexReview || gateEvidence.review || null;
  return validateFinalGateReviewEvidence({ strongIndependent, codex, expectedHead, expectedBase, changedFiles });
}

function validateFinalGateReviewEvidence({ strongIndependent, codex, expectedHead, expectedBase, changedFiles }) {
  const strong = validateReviewEvidenceObject(strongIndependent, {
    name: "strong_review",
    expectedHead,
    expectedBase,
    changedFiles,
    requireIndependent: true,
  });
  if (!strong.ok) return strong;
  const codexReview = validateReviewEvidenceObject(codex, {
    name: "codex_review",
    expectedHead,
    expectedBase,
    changedFiles,
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

function validateValidationEvidenceObject(validation, { expectedHead, expectedBase, changedFiles }) {
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
  return { ok: true, validation };
}

function validateReviewEvidenceObject(review, { name, expectedHead, expectedBase, changedFiles, requireIndependent }) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return fail(`${name}_missing`, `${name} evidence is required`);
  }
  const reviewedHead = review.reviewedHead || review.headSha || review.prHeadSha || null;
  if (reviewedHead !== expectedHead) return fail(`${name}_head_mismatch`, `${name} evidence is not bound to the exact head`);
  if (expectedBase && review.baseSha !== expectedBase) return fail(`${name}_base_mismatch`, `${name} evidence is not bound to the exact base`);
  if (!Array.isArray(review.changedFiles)) return fail(`${name}_files_missing`, `${name} changed files are required`);
  if (!sameStringSet(review.changedFiles, changedFiles)) return fail(`${name}_files_mismatch`, `${name} changed files do not match final gate files`);
  if (review.changedFilesDigest !== digestStringSet(changedFiles)) return fail(`${name}_file_digest_mismatch`, `${name} changed-file digest does not match final gate files`);
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

function finalGateIssue(config = {}, state = {}, pr = {}) {
  return (
    pr.issue ||
    config.prStackIssue ||
    state.issue ||
    { number: pr.issueNumber || state.issueNumber || 921, labels: [], body: "" }
  );
}

function buildAllowedPathProof({ issue, changedFiles, exactHead }) {
  const normalized = normalizeChangedFiles(changedFiles);
  const laneDecision = classifyIssueLane(issue || {});
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
  const nameOnly = runner("gh", ["pr", "diff", String(pr.number), "--name-only"], { cwd });
  if (nameOnly.status !== 0 || nameOnly.error) {
    return fail("own_delta_current_files_unavailable", boundedText(nameOnly.stderr || nameOnly.error || nameOnly.stdout));
  }
  const patch = runner("gh", ["pr", "diff", String(pr.number), "--patch"], { cwd });
  if (patch.status !== 0 || patch.error) {
    return fail("own_delta_current_patch_unavailable", boundedText(patch.stderr || patch.error || patch.stdout));
  }
  const patchText = String(patch.stdout || "");
  const fileSet = normalizeChangedFiles(nameOnly.stdout.split(/\r?\n/));
  const patchStats = summarizePatch(patchText);
  const stablePatchId = computeStablePatchId(patchText, cwd);
  if (!stablePatchId) return fail("own_delta_current_patch_id_unavailable", "current PR stable patch ID could not be computed");
  const forwardPatchApplies = patchApplyCheck({ patchText, cwd, reverse: false, runner });
  const reversePatchApplies = patchApplyCheck({ patchText, cwd, reverse: true, runner });
  return {
    ok: true,
    ownDelta: {
      fileSet,
      fileSetDigest: digestJson(fileSet),
      diffstat: { files: fileSet.length, additions: patchStats.additions, deletions: patchStats.deletions },
      diffstatDigest: digestJson({ files: fileSet.length, additions: patchStats.additions, deletions: patchStats.deletions }),
      numstat: patchStats.numstat,
      numstatDigest: digestJson(patchStats.numstat),
      stablePatchId,
      normalizedPatchDigest: digestJson(normalizePatchForDigest(patchText)),
      rawDiffHash: createHash("sha256").update(patchText).digest("hex"),
      forwardPatchApplies,
      reversePatchApplies,
    },
  };
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

function computeStablePatchId(patchText, cwd) {
  const result = spawnSync("git", ["patch-id", "--stable"], {
    cwd,
    input: patchText,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0 || result.error) return null;
  return String(result.stdout || "").trim().split(/\s+/)[0] || null;
}

function patchApplyCheck({ patchText, cwd, reverse, runner }) {
  const args = ["apply", "--check"];
  if (reverse) args.push("--reverse");
  const result = runner("git", args, { cwd, input: patchText });
  return result.status === 0 && !result.error;
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
  createOrReuseLocalCandidateCommit,
  deriveCanonicalCommitChain,
  discoverTaskScopedPendingPushIntents,
  evaluateSourceCycleBudget,
  fetchAndReadOriginMain,
  finalizePushIntent,
  normalizeSourceChangingConvergenceResult,
  validateCanonicalCommitChain,
  persistPushIntent,
  proveTargetBatchFixWorktree,
  reconcileTaskScopedPendingPushIntent,
  reconcilePushIntent,
  readLivePrProof,
  readOriginRepositoryProof,
  readWorktreeCleanProof,
  sourceChangingResultFromIntent,
  safeSourceBranchTarget,
  validateRepositoryIdentityProof,
  validatePushTargetBranch,
});
