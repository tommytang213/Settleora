import { createHash } from "node:crypto";

export function createDependentPrStackPlan({ repository = "tommytang213/Settleora", stackId, issueNumber, prs = [], policy = {} } = {}) {
  const ordered = prs.map((pr, index) => ({
    order: index,
    number: pr.number,
    title: pr.title || "",
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    isDraft: Boolean(pr.isDraft),
    state: pr.state || "UNKNOWN",
    ownDelta: normalizeOwnDelta(pr.ownDelta || {}),
    expectedParentPr: index === 0 ? null : prs[index - 1].number,
    expectedParentBranch: index === 0 ? null : prs[index - 1].headRefName,
  }));
  return {
    stackId: stackId || digestJson({ repository, issueNumber, prs: ordered.map((pr) => pr.number) }),
    repository,
    issueNumber,
    orderedPrs: ordered,
    activePrNumber: ordered[0]?.number ?? null,
    completedPrs: [],
    remainingPrs: ordered.map((pr) => pr.number),
    mergePolicy: {
      expectedHeadProtection: policy.expectedHeadProtection !== false,
      requiredChecks: policy.requiredChecks || ["Validate scaffold", "CodeQL", "Semgrep CE scan", "Trivy repository scan"],
    },
    mutationMarkers: {},
    phase: "planned",
  };
}

export function validateStackRelationships(plan) {
  if (!plan?.orderedPrs?.length) return fail("stack_empty");
  for (let index = 1; index < plan.orderedPrs.length; index += 1) {
    const parent = plan.orderedPrs[index - 1];
    const child = plan.orderedPrs[index];
    if (child.baseRefName !== parent.headRefName) {
      return fail(`dependent_pr_base_mismatch:${child.number}:expected:${parent.headRefName}:actual:${child.baseRefName}`);
    }
  }
  return { ok: true, reason: "stack_relationships_ok" };
}

export function nextStackAction(plan, evidence = {}) {
  const active = plan.orderedPrs.find((pr) => pr.number === plan.activePrNumber) || plan.orderedPrs[0];
  if (!active) return { action: "complete", reason: "stack_empty" };
  if (evidence.recoverableActivePr) return { action: "recover_active_pr", prNumber: active.number, reason: "recovery_first" };
  const parentProof = firstIncompleteParentProof(plan, evidence);
  if (parentProof) return parentProof;
  const activePrerequisite = childPrerequisiteAction(active, evidence);
  if (activePrerequisite) return activePrerequisite;
  const activeAction = actionForPr(active, evidence);
  if (activeAction) return activeAction;
  const next = plan.orderedPrs.find((pr) => !mergeProofPassed(evidence.merged?.[pr.number]));
  if (!next) return { action: "hygiene", reason: "all_prs_merged" };
  const nextParentProof = firstIncompleteParentProof(plan, evidence, next);
  if (nextParentProof) return nextParentProof;
  const nextPrerequisite = childPrerequisiteAction(next, evidence);
  if (nextPrerequisite) return nextPrerequisite;
  return actionForPr(next, evidence) || { action: "hygiene", reason: "all_prs_merged" };
}

export function proveSemanticOwnDelta(before = {}, after = {}) {
  const normalizedBefore = normalizeOwnDelta(before);
  const normalizedAfter = normalizeOwnDelta(after);
  const mismatches = [];
  const missing = [];
  for (const key of ["fileSetDigest", "diffstatDigest", "numstatDigest", "stablePatchId", "normalizedPatchDigest"]) {
    if (!normalizedBefore[key] || !normalizedAfter[key]) missing.push(key);
    if (normalizedBefore[key] && normalizedAfter[key] && normalizedBefore[key] !== normalizedAfter[key]) mismatches.push(key);
  }
  if (before.forwardPatchApplies !== true || after.reversePatchApplies !== true) missing.push("patch_to_tree_proof");
  if (before.forwardPatchApplies === false || after.reversePatchApplies === false) mismatches.push("patch_to_tree_proof");
  const failures = [...new Set([...missing, ...mismatches])];
  return {
    ok: failures.length === 0,
    reason: failures.length === 0 ? "semantic_own_delta_preserved" : `semantic_own_delta_mismatch:${failures.join(",")}`,
    before: normalizedBefore,
    after: normalizedAfter,
  };
}

export function recordStackMutationMarker(plan, { kind, key, prNumber, exactHead }) {
  const markerKey = `${kind}:${prNumber || "stack"}:${key}`;
  if (plan.mutationMarkers?.[markerKey]) return { plan, duplicate: true, markerKey };
  return {
    duplicate: false,
    markerKey,
    plan: {
      ...plan,
      mutationMarkers: {
        ...(plan.mutationMarkers || {}),
        [markerKey]: { kind, key, prNumber, exactHead, recordedAt: new Date().toISOString() },
      },
    },
  };
}

export function buildReadOnlyLiveStackFixturePlan(pr919, pr920) {
  const plan = createDependentPrStackPlan({
    stackId: "live-acceptance-919-920-readonly",
    issueNumber: 921,
    prs: [pr919, pr920],
  });
  const relationship = validateStackRelationships(plan);
  return {
    plan,
    relationship,
    readOnly: true,
    mutationAllowed: false,
    expectedSequence: [
      "recover_active_pr",
      "converge_pr:919",
      "complete_gates:919",
      "merge_pr:919",
      "recover_active_pr:919:parent_current_main_proof_required",
      "retarget_pr:920",
      "prove_own_delta:920",
      "converge_pr:920",
      "complete_gates:920",
      "merge_pr:920",
      "hygiene",
    ],
    protectedIssuesUntouched: [912, 913, 865, 866],
  };
}

function normalizeOwnDelta(delta = {}) {
  const fileSet = [...(delta.fileSet || [])].sort();
  const diffstat = delta.diffstat || {};
  const numstat = delta.numstat || {};
  const normalizedPatch = String(delta.normalizedPatch || "");
  return {
    fileSet,
    fileSetDigest: delta.fileSetDigest || digestJson(fileSet),
    diffstat,
    diffstatDigest: delta.diffstatDigest || digestJson(diffstat),
    numstat,
    numstatDigest: delta.numstatDigest || digestJson(numstat),
    stablePatchId: delta.stablePatchId || null,
    normalizedPatchDigest: delta.normalizedPatchDigest || (normalizedPatch ? digestJson(normalizedPatch) : null),
    rawDiffHash: delta.rawDiffHash || null,
    forwardPatchApplies: delta.forwardPatchApplies ?? null,
    reversePatchApplies: delta.reversePatchApplies ?? null,
  };
}

function actionForPr(pr, evidence) {
  if ((pr.state === "CLOSED" || pr.state === "MERGED") && !mergeProofPassed(evidence.merged?.[pr.number])) {
    return { action: "recover_active_pr", prNumber: pr.number, reason: "parent_merge_proof_required" };
  }
  if (!evidence.reviewConverged?.[pr.number]) return { action: "converge_pr", prNumber: pr.number };
  if (!evidence.gatesPassed?.[pr.number]) return { action: "complete_gates", prNumber: pr.number };
  if (!mergeProofPassed(evidence.merged?.[pr.number])) return { action: "merge_pr", prNumber: pr.number, expectedHead: pr.headRefOid };
  return null;
}

function childPrerequisiteAction(pr, evidence) {
  if (!pr?.expectedParentPr) return null;
  if (pr.baseRefName !== "main" && !evidence.retargeted?.[pr.number]) return { action: "retarget_pr", prNumber: pr.number, newBase: "main" };
  if (!ownDeltaProofPassed(evidence.ownDeltaPreserved?.[pr.number])) return { action: "prove_own_delta", prNumber: pr.number };
  return null;
}

function firstIncompleteParentProof(plan, evidence, targetPr = null) {
  const targetIndex = targetPr
    ? plan.orderedPrs.findIndex((pr) => pr.number === targetPr.number)
    : Math.max(0, plan.orderedPrs.findIndex((pr) => pr.number === plan.activePrNumber));
  if (targetIndex <= 0) return null;
  for (const parent of plan.orderedPrs.slice(0, targetIndex)) {
    if (!mergeProofPassed(evidence.merged?.[parent.number])) {
      return { action: "recover_active_pr", prNumber: parent.number, reason: "parent_merge_proof_required" };
    }
    if (!currentMainProofPassed(evidence, parent.number)) {
      return { action: "recover_active_pr", prNumber: parent.number, reason: "parent_current_main_proof_required" };
    }
  }
  return null;
}

function mergeProofPassed(value) {
  if (value === true) return true;
  return Boolean(value && typeof value === "object" && value.ok === true && value.merged === true);
}

function currentMainProofPassed(evidence, prNumber) {
  const value =
    evidence.currentMainProven?.[prNumber] ??
    evidence.currentMainProof?.[prNumber] ??
    evidence.mergedCurrentMain?.[prNumber];
  if (value === true) return true;
  return Boolean(value && typeof value === "object" && value.ok === true);
}

function ownDeltaProofPassed(value) {
  if (value === true) return true;
  return Boolean(value && typeof value === "object" && value.ok === true);
}

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value || {})).digest("hex");
}

function fail(reason) {
  return { ok: false, reason };
}
