import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizePersistedEvidence } from "./evidence-sanitizer.mjs";

export const bundleStateVersion = 1;
const stateRootName = "bundles";
const terminalSliceStates = new Set(["completed"]);
const allowedSliceStates = new Set(["pending", "started", "completed", "failed"]);
const allowedFinalizationStates = new Set(["not_started", "validating", "reviewing", "pr_opened", "auto_merged", "failed"]);

export function bundleStorageKey(plan) {
  const source = JSON.stringify({
    issueNumber: plan?.issue?.number,
    planDigest: plan?.planDigest,
    bundleVersion: plan?.bundleVersion,
    strategy: plan?.strategy,
  });
  return createHash("sha256").update(source).digest("hex");
}

export function bundleStatePath(config, planOrKey) {
  const key = typeof planOrKey === "string" ? planOrKey : bundleStorageKey(planOrKey);
  return path.join(config.logsRoot, stateRootName, `${key}.json`);
}

export function createInitialBundleState({ plan, runId, supervisorRunId = null, branchName, baseSha, currentHeadSha, taskKey }) {
  const now = new Date().toISOString();
  return {
    stateVersion: bundleStateVersion,
    taskKey: String(taskKey || ""),
    bundleId: plan.id,
    bundleVersion: plan.bundleVersion,
    strategy: plan.strategy,
    planDigest: plan.planDigest,
    issue: {
      number: plan.issue.number,
      title: plan.issue.title,
      url: plan.issue.url || null,
    },
    run: {
      runId: runId || null,
      supervisorRunId: supervisorRunId || null,
    },
    branch: branchName,
    baseSha,
    lastVerifiedHead: currentHeadSha || baseSha,
    sliceOrder: plan.slices.map((slice) => slice.id),
    slices: Object.fromEntries(
      plan.slices.map((slice) => [
        slice.id,
        {
          id: slice.id,
          sequence: slice.sequence,
          title: slice.title,
          state: "pending",
          prompt: null,
          report: null,
          checkpointValidation: null,
          commitSha: null,
          startedAt: null,
          completedAt: null,
          stopReason: null,
        },
      ]),
    ),
    finalization: {
      state: "not_started",
      validation: null,
      reviewPackage: null,
      externalReview: null,
      codexReview: null,
      pr: null,
      ci: null,
      autoMerge: null,
      stopReason: null,
    },
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function writeBundleState(config, state) {
  const validation = validateBundleStateShape(state);
  if (!validation.ok) throw new Error(`Invalid bundle state: ${validation.reason}`);
  const statePath = bundleStatePath(config, storageKeyFromState(state));
  mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  const sanitized = sanitizeBundleState({ ...state, timestamps: { ...state.timestamps, updatedAt: new Date().toISOString() } });
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, statePath);
  return { statePath, state: sanitized };
}

export function loadBundleState(config, plan) {
  const statePath = bundleStatePath(config, plan);
  if (!existsSync(statePath)) {
    return { ok: false, reasonCode: "bundle_state_missing", reason: `Bundle state missing: ${statePath}`, statePath };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(statePath, "utf8"));
  } catch (error) {
    return { ok: false, reasonCode: "bundle_state_corrupt", reason: `Bundle state is corrupt: ${error.message}`, statePath };
  }
  const shape = validateBundleStateShape(parsed);
  if (!shape.ok) return { ok: false, reasonCode: "bundle_state_schema_invalid", reason: shape.reason, statePath };
  return { ok: true, state: parsed, statePath };
}

export function recoverBundleState(config, { plan, branchName, baseSha, currentHeadSha, worktreeClean, evidence = {} }) {
  const loaded = loadBundleState(config, plan);
  if (!loaded.ok) return loaded;
  const { state } = loaded;
  if (state.planDigest !== plan.planDigest) return failed("bundle_state_plan_digest_mismatch", "Bundle plan digest changed.");
  if (state.issue.number !== plan.issue.number) return failed("bundle_state_issue_mismatch", "Bundle issue changed.");
  if (state.branch !== branchName) return failed("bundle_state_branch_mismatch", "Bundle branch changed.");
  if (state.baseSha !== baseSha) return failed("bundle_state_base_mismatch", "Bundle base changed.");
  if (!worktreeClean) return failed("bundle_state_dirty_worktree", "Bundle recovery requires a clean worktree.");
  if (state.lastVerifiedHead && state.lastVerifiedHead !== currentHeadSha) {
    return failed("bundle_state_head_mismatch", "Bundle state head does not match current checkout.");
  }
  for (const sliceId of state.sliceOrder) {
    const slice = state.slices[sliceId];
    if (!slice) return failed("bundle_state_slice_missing", `Bundle state missing slice ${sliceId}.`);
    if (slice.state === "completed") {
      if (!slice.commitSha) return failed("bundle_state_completed_commit_missing", `Completed slice ${sliceId} is missing commit SHA.`);
      if (evidence.commitExists && !evidence.commitExists(slice.commitSha)) {
        return failed("bundle_state_completed_commit_drift", `Completed slice ${sliceId} commit is not reachable.`);
      }
      if (evidence.reportExists && slice.report?.path && !evidence.reportExists(slice.report.path)) {
        return failed("bundle_state_completed_report_missing", `Completed slice ${sliceId} report evidence is missing.`);
      }
      if (!slice.checkpointValidation?.passed) {
        return failed("bundle_state_completed_validation_missing", `Completed slice ${sliceId} validation evidence is missing.`);
      }
    }
  }
  const nextSliceId = state.sliceOrder.find((sliceId) => state.slices[sliceId].state !== "completed") || null;
  return {
    ok: true,
    reasonCode: nextSliceId ? "bundle_recovery_resume" : "bundle_recovery_complete",
    state,
    statePath: loaded.statePath,
    nextSliceId,
    completedSliceIds: state.sliceOrder.filter((sliceId) => state.slices[sliceId].state === "completed"),
  };
}

export function markBundleSliceStarted(state, { sliceId, promptPath, reportPath, currentHeadSha }) {
  const slice = requireSlice(state, sliceId);
  if (slice.state === "completed") throw new Error(`Refusing to restart completed bundle slice: ${sliceId}`);
  return updateState(state, {
    lastVerifiedHead: currentHeadSha || state.lastVerifiedHead,
    slices: {
      ...state.slices,
      [sliceId]: {
        ...slice,
        state: "started",
        prompt: { path: promptPath || null },
        report: { path: reportPath || null },
        startedAt: slice.startedAt || new Date().toISOString(),
        stopReason: null,
      },
    },
  });
}

export function markBundleSliceCompleted(state, { sliceId, validation, commitSha, reportPath, currentHeadSha }) {
  const slice = requireSlice(state, sliceId);
  return updateState(state, {
    lastVerifiedHead: currentHeadSha || commitSha,
    slices: {
      ...state.slices,
      [sliceId]: {
        ...slice,
        state: "completed",
        report: { ...(slice.report || {}), path: reportPath || slice.report?.path || null, found: true },
        checkpointValidation: validation || null,
        commitSha,
        completedAt: new Date().toISOString(),
        stopReason: null,
      },
    },
  });
}

export function markBundleStopped(state, { sliceId = null, reasonCode, reason }) {
  const boundedReason = String(reason || reasonCode || "unknown").slice(0, 500);
  if (!sliceId) {
    return updateState(state, {
      finalization: {
        ...state.finalization,
        state: "failed",
        stopReason: { reasonCode, reason: boundedReason },
      },
    });
  }
  const slice = requireSlice(state, sliceId);
  return updateState(state, {
    slices: {
      ...state.slices,
      [sliceId]: {
        ...slice,
        state: "failed",
        stopReason: { reasonCode, reason: boundedReason },
      },
    },
  });
}

export function summarizeBundleState(state) {
  return sanitizeBundleState({
    bundleId: state.bundleId,
    planDigest: state.planDigest,
    issue: state.issue,
    branch: state.branch,
    baseSha: state.baseSha,
    lastVerifiedHead: state.lastVerifiedHead,
    sliceCount: state.sliceOrder.length,
    currentSliceId: state.sliceOrder.find((sliceId) => state.slices[sliceId].state !== "completed") || null,
    completedSliceIds: state.sliceOrder.filter((sliceId) => state.slices[sliceId].state === "completed"),
    checkpointCommits: Object.fromEntries(
      state.sliceOrder
        .filter((sliceId) => state.slices[sliceId].commitSha)
        .map((sliceId) => [sliceId, state.slices[sliceId].commitSha]),
    ),
    finalization: state.finalization,
  });
}

export function sanitizeBundleState(state) {
  return sanitizePersistedEvidence(state);
}

function updateState(state, patch) {
  return sanitizeBundleState({
    ...state,
    ...patch,
    timestamps: {
      ...(state.timestamps || {}),
      updatedAt: new Date().toISOString(),
    },
  });
}

function requireSlice(state, sliceId) {
  const slice = state.slices?.[sliceId];
  if (!slice) throw new Error(`Unknown bundle slice: ${sliceId}`);
  return slice;
}

function storageKeyFromState(state) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        issueNumber: state?.issue?.number,
        planDigest: state?.planDigest,
        bundleVersion: state?.bundleVersion,
        strategy: state?.strategy,
      }),
    )
    .digest("hex");
}

function validateBundleStateShape(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return invalid("state must be an object");
  if (state.stateVersion !== bundleStateVersion) return invalid("unsupported bundle state version");
  for (const field of ["bundleId", "bundleVersion", "strategy", "planDigest", "issue", "run", "branch", "baseSha", "lastVerifiedHead", "sliceOrder", "slices", "finalization", "timestamps"]) {
    if (!(field in state)) return invalid(`missing field ${field}`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(state.planDigest || ""))) return invalid("invalid plan digest");
  if (!state.issue || !Number.isInteger(state.issue.number)) return invalid("invalid issue");
  if (!Array.isArray(state.sliceOrder) || state.sliceOrder.length < 2 || state.sliceOrder.length > 4) return invalid("invalid slice order");
  if (!state.slices || typeof state.slices !== "object" || Array.isArray(state.slices)) return invalid("invalid slices");
  for (const sliceId of state.sliceOrder) {
    const slice = state.slices[sliceId];
    if (!slice || slice.id !== sliceId) return invalid(`invalid slice ${sliceId}`);
    if (!allowedSliceStates.has(slice.state)) return invalid(`invalid slice state ${sliceId}`);
    if (terminalSliceStates.has(slice.state) && !slice.commitSha) return invalid(`terminal slice missing commit ${sliceId}`);
  }
  if (!state.finalization || !allowedFinalizationStates.has(state.finalization.state)) return invalid("invalid finalization");
  return { ok: true };
}

function invalid(reason) {
  return { ok: false, reason };
}

function failed(reasonCode, reason) {
  return { ok: false, reasonCode, reason };
}
