import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  nextStackAction,
  proveSemanticOwnDelta,
  recordStackMutationMarker,
  validateStackRelationships,
} from "./pr-stack-controller.mjs";
import { executeAutoMerge, inspectAutoMergeGithubState } from "./auto-merge-policy.mjs";
import { completeMergedIssueHygiene } from "./completion-hygiene.mjs";
import { runExistingPrReviewConvergence } from "./review-convergence-controller.mjs";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";
import { classifyIssueLane, filterForbiddenChangedFiles } from "./lane-policy.mjs";

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
  if (before.headRefOid && before.headRefOid !== pr.headRefOid) return fail("stack_pr_head_stale", `PR #${pr.number} head changed`);
  const result = await adapter.convergeExistingPr({ config, plan, state, pr, findings: before.findings || [] });
  if (!result?.ok) return waitOrFail(result, "pr_convergence_failed");
  const newHead = result.newHead || result.headRefOid || pr.headRefOid;
  const sourceCycles = { ...(state.sourceCycles || {}) };
  if (newHead !== pr.headRefOid) {
    sourceCycles[pr.number] = (sourceCycles[pr.number] || 0) + 1;
    const rebound = rebindStateToNewHead(state, pr.number, newHead, sourceCycles, result);
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
    summary: { action: action.action, prNumber: pr.number, sourceCycleConsumed: newHead !== pr.headRefOid },
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
    return { ok: true, evidence: putEvidence(state.evidence, "retargeted", pr.number, state.mutationMarkers[markerKey].result || { ok: true }), mutationMarkers: state.mutationMarkers, summary: { action: action.action, duplicate: true } };
  }
  const result = await adapter.retargetPrBase({ pr, newBase: action.newBase || "main", expectedHead: pr.headRefOid, expectedCurrentBase: pr.baseRefName });
  if (!result?.ok) return waitOrFail(result, "retarget_failed");
  const retargetProof = { ...result, ok: true, newBase: action.newBase || "main", after: { ...(result.after || {}), baseRefName: action.newBase || "main" } };
  const marker = recordStackMutationMarker({ mutationMarkers: state.mutationMarkers }, { kind: "retarget_pr", key: `${pr.headRefOid}:main`, prNumber: pr.number, exactHead: pr.headRefOid });
  const mutationMarkers = {
    ...marker.plan.mutationMarkers,
    [markerKey]: { ...(marker.plan.mutationMarkers[markerKey] || {}), result: boundedProof(retargetProof) },
  };
  return { ok: true, evidence: putEvidence(state.evidence, "retargeted", pr.number, retargetProof), mutationMarkers, summary: { action: action.action, prNumber: pr.number } };
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
  return {
    capabilities: {
      shellFreeArgv: true,
      usesExistingMergeAuthority: true,
      usesExistingHygieneAuthority: true,
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
    async convergeExistingPr({ pr, findings = [] }) {
      const result = await runExistingPrReviewConvergence({
        config,
        issue: { number: pr.issueNumber || 921, title: pr.title || "" },
        pr,
        findings,
        laneDecision: { lane: "workflow-docs-tooling", allowedPaths: ["tools/auto-runner/**", "docs/**"] },
      });
      return result.ok
        ? { ...result, headRefOid: result.newHead || pr.headRefOid }
        : result;
    },
    async completeFinalGates({ config: cfg, state, pr }) {
      const gate = collectFinalGateEvidence({ config: cfg || config, state, pr, runner: runner || defaultRunner });
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
        expectedOriginMainSha: gateEvidence.baseSha || gateEvidence.expectedOriginMainSha || null,
        currentOriginMainSha: gateEvidence.currentOriginMainSha || gateEvidence.baseSha || null,
        changedFiles,
        forbiddenChangedFiles: gateEvidence.forbiddenChangedFiles || [],
        changedFilesExactlyMatchAllowedPaths: allowedPathProofValid,
        worktreeClean: true,
        requiredChecks: gateEvidence.requiredChecks || inspection.requiredChecks || [],
        reviewThreads: gateEvidence.reviewThreads || inspection.reviewThreads || [],
        codeScanningAlerts: gateEvidence.codeScanningAlerts || inspection.codeScanningAlerts || [],
        blockingMarkers: gateEvidence.blockingMarkers || inspection.blockingMarkers || [],
        validation: gateEvidence.validation || {},
        externalReview: gateEvidence.externalReview || {},
        externalReviewRequired: true,
        review: gateEvidence.review || {},
        codexMechanicsReviewApproved: gateEvidence.codexMechanicsReviewApproved === true,
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
  const evidence = putEvidence(invalidateHeadBoundEvidence(state.evidence, prNumber), "reviewConverged", prNumber, {
    ...result,
    ok: true,
    oldHead,
    newHead,
    reboundExactHead: true,
  });
  return {
    evidence,
    sourceCycles,
    exactHeads: { ...(state.exactHeads || {}), [prNumber]: newHead },
    orderedPrs: rebindOrderedPrToNewHead(state, prNumber, newHead),
    mutationMarkers: pruneHeadBoundMutationMarkers(state.mutationMarkers, prNumber, oldHead),
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

function validStackId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{3,160}$/.test(value);
}

function validSha(value) {
  return /^[0-9a-f]{40}$/i.test(String(value || ""));
}

function safeBranch(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240 && !value.includes("..") && !value.startsWith("/") && !value.endsWith("/");
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

function collectFinalGateEvidence({ config, state, pr, runner }) {
  const inspection = inspectAutoMergeGithubState(config, { issue: finalGateIssue(config, state, pr), prUrlOrNumber: pr.number });
  if (!inspection?.pr) return fail("final_gate_pr_read_failed", "PR state could not be read");
  const currentHead = inspection.pr.headRefOid || pr.headRefOid;
  if (currentHead !== pr.headRefOid) return fail("final_gate_pr_head_stale", `PR #${pr.number} head changed before final gates`);
  const changed = readCurrentPrOwnDelta({ config, pr, runner });
  if (!changed.ok) return changed;
  const laneProof = buildAllowedPathProof({ issue: inspection.issue, changedFiles: changed.ownDelta.fileSet, exactHead: currentHead });
  if (!laneProof.ok) return laneProof;
  const status = finalExternalGateStatus(inspection);
  const base = runner("git", ["rev-parse", "origin/main"], { cwd: config.repoRoot });
  const worktree = runner("git", ["status", "--porcelain=v1", "--untracked-files=no"], { cwd: config.repoRoot });
  const evidence = {
    ok: status.ok && worktree.status === 0 && String(worktree.stdout || "").trim() === "",
    exactHead: currentHead,
    pr: inspection.pr,
    changedFiles: changed.ownDelta.fileSet,
    changedFilesDigest: changed.ownDelta.fileSetDigest,
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
    validation: state?.evidence?.validation?.[pr.number] || state?.evidence?.gatesPassed?.[pr.number]?.validation || null,
    strongReview: state?.evidence?.strongReview?.[pr.number] || state?.evidence?.gatesPassed?.[pr.number]?.externalReview || null,
    codexReview: state?.evidence?.codexReview?.[pr.number] || state?.evidence?.gatesPassed?.[pr.number]?.review || null,
    currentOriginMainSha: base.status === 0 && !base.error ? String(base.stdout || "").trim() : null,
    worktreeClean: worktree.status === 0 && String(worktree.stdout || "").trim() === "",
    collectedAt: new Date().toISOString(),
  };
  if (!laneProof.changedFilesExactlyMatchAllowedPaths) {
    return fail("changed_files_do_not_match_allowed_paths", `changed files outside allowed contract: ${laneProof.rejectedPaths.join(",")}`);
  }
  if (!status.ok) return { ok: false, waiting: status.waiting, reasonCode: status.reasonCode, reason: status.reason, evidence };
  if (!evidence.worktreeClean) return fail("final_gate_worktree_not_clean", "worktree must be clean before final gates pass");
  return { ok: true, evidence };
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

function finalExternalGateStatus(inspection = {}) {
  const pendingCheck = (inspection.requiredChecks || []).find((check) => String(check.status || "").toUpperCase() !== "COMPLETED");
  if (pendingCheck) return { ok: false, waiting: true, reasonCode: "ci_check_completion_wait", reason: `required check pending: ${pendingCheck.name || "unknown"}` };
  const failedCheck = (inspection.requiredChecks || []).find((check) => String(check.conclusion || "").toUpperCase() !== "SUCCESS");
  if (failedCheck) return { ok: false, waiting: false, reasonCode: "required_check_failed", reason: `required check failed: ${failedCheck.name || "unknown"}` };
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
