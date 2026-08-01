import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, constants as fsConstants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertRepositoryRemoteIdentity } from "./runtime-identity.mjs";
import { isSourceOwnedBranchName, runGit } from "./git-workspace.mjs";

export const postMergeCleanupSchemaVersion = 1;
export const postMergeCleanupPolicyVersion = "ephemeral_cleanup_v1";
export const postMergeCleanupPhases = Object.freeze([
  "cleanup_planned", "final_reread_passed", "remote_delete_intended",
  "remote_delete_confirmed", "checkout_handoff_intended", "checkout_handoff_confirmed",
  "worktree_remove_intended", "worktree_remove_confirmed",
  "local_branch_delete_intended", "local_branch_delete_confirmed", "cleanup_complete",
]);
const cleanupRoot = "post-merge-cleanup";
const ownershipRoot = "post-merge-cleanup-ownership";

const sha = /^[0-9a-f]{40}$/;
const safeRefPrefix = /^(?:feature|focused|fix|docs|feature-bundle)\/auto-/;
const forbiddenRefs = /^(?:main|master|release(?:\/|$))/;
const activeCategories = Object.freeze(["runner", "supervisor", "recovery", "outage", "review", "source_failure", "session", "bundle", "stack", "report", "pending_effect", "generated_work", "lease"]);

export function createCleanupOwnershipRecord(value = {}) {
  const record = {
    schemaVersion: postMergeCleanupSchemaVersion,
    policyVersion: postMergeCleanupPolicyVersion,
    repository: text(value.repository, 240), rootTaskKey: text(value.rootTaskKey, 100), executionLineage: text(value.executionLineage, 160),
    issueNumber: integer(value.issueNumber), branchName: text(value.branchName, 200), branchKind: text(value.branchKind, 40),
    baseBranch: text(value.baseBranch, 200), baseSha: value.baseSha, reviewedHeadSha: value.reviewedHeadSha,
    prNumber: integer(value.prNumber), prUrl: text(value.prUrl, 300), mergeSha: value.mergeSha, targetBranch: text(value.targetBranch, 200),
    acceptance: value.acceptance && { targetHeadSha: value.acceptance.targetHeadSha, evidenceDigest: value.acceptance.evidenceDigest, passed: value.acceptance.passed === true },
    correlations: boundedObject(value.correlations), worktree: value.worktree ? { identity: text(value.worktree.identity, 64), disposable: value.worktree.disposable === true } : null,
    owner: "settleora_auto_runner", createdAt: iso(value.createdAt),
  };
  const validation = validateCleanupOwnership(record);
  if (!validation.ok) throw new Error(validation.reasonCode);
  return Object.freeze(record);
}

export function validateCleanupOwnership(record = {}) {
  if (record.schemaVersion !== 1 || record.policyVersion !== postMergeCleanupPolicyVersion || record.owner !== "settleora_auto_runner") return fail("cleanup_ownership_schema_invalid");
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(record.repository || "")) return fail("cleanup_repository_invalid");
  if (!record.rootTaskKey || !record.executionLineage || !Number.isSafeInteger(record.issueNumber)) return fail("cleanup_task_identity_incomplete");
  if (!safeRefPrefix.test(record.branchName || "") || !isSourceOwnedBranchName(record.branchName)
    || record.branchName.length > 181 || forbiddenRefs.test(record.branchName || "")) return fail("cleanup_branch_not_ephemeral");
  if (!record.branchKind || !record.baseBranch || !sha.test(record.baseSha || "") || !sha.test(record.reviewedHeadSha || "")) return fail("cleanup_source_identity_incomplete");
  if (!Number.isSafeInteger(record.prNumber) || !/^https:\/\/github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/pull\/[1-9][0-9]*$/i.test(record.prUrl || "")) return fail("cleanup_pr_identity_invalid");
  if (!sha.test(record.mergeSha || "") || !record.targetBranch || forbiddenRefs.test(record.targetBranch) && record.targetBranch !== "main") return fail("cleanup_merge_target_invalid");
  if (!record.acceptance?.passed || !sha.test(record.acceptance.targetHeadSha || "") || !/^[0-9a-f]{64}$/.test(record.acceptance.evidenceDigest || "")) return fail("cleanup_acceptance_incomplete");
  if (record.worktree && (!/^[0-9a-f]{64}$/.test(record.worktree.identity || "") || record.worktree.disposable !== true)) return fail("cleanup_worktree_identity_invalid");
  return { ok: true };
}

export function cleanupStatePath(config, owner) { return path.join(config.logsRoot, cleanupRoot, `${digest({ repository: owner.repository, rootTaskKey: owner.rootTaskKey, issueNumber: owner.issueNumber, branchName: owner.branchName })}.json`); }
export function cleanupOwnershipPath(config, owner) { return path.join(config.logsRoot, ownershipRoot, `${digest({ repository: owner.repository, rootTaskKey: owner.rootTaskKey, issueNumber: owner.issueNumber, branchName: owner.branchName })}.json`); }
export function persistCleanupOwnership(config, owner) { const valid = validateCleanupOwnership(owner); if (!valid.ok) return valid; return writeOwnerOnlyAtomic(cleanupOwnershipPath(config, owner), owner, "cleanup_ownership_root_unsafe"); }
export function loadCleanupOwnership(config, owner) { return readOwnerOnlyJson(cleanupOwnershipPath(config, owner), (value) => validateCleanupOwnership(value), "cleanup_ownership"); }
export function persistPostMergeCleanupState(config, state) {
  const normalized = normalizeState(state); if (!normalized.ok) return normalized;
  const file = cleanupStatePath(config, normalized.state.ownership); const dir = path.dirname(file); mkdirSync(dir, { recursive: true, mode: 0o700 });
  if ((lstatSync(dir).mode & 0o077) !== 0 || lstatSync(dir).isSymbolicLink()) return fail("cleanup_state_root_unsafe");
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`; writeFileSync(tmp, `${JSON.stringify(normalized.state, null, 2)}\n`, { mode: 0o600, flag: "wx" }); renameSync(tmp, file); return { ok: true, state: normalized.state, statePath: file };
}
export function loadPostMergeCleanupState(config, owner) {
  const file = cleanupStatePath(config, owner); let fd;
  try { fd = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); const stat = fstatSync(fd); if (!stat.isFile() || stat.size < 2 || stat.size > 1024 * 1024 || (stat.mode & 0o077) !== 0 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) return fail("cleanup_state_unsafe"); const state = JSON.parse(readFileSync(fd, "utf8")); return normalizeState(state); } catch { return fail("cleanup_state_unavailable_or_corrupt"); } finally { if (fd !== undefined) closeSync(fd); }
}

export function planPostMergeCleanup(ownership, live = {}) {
  const valid = validateCleanupOwnership(ownership);
  if (!valid.ok) return valid;
  const gate = evaluateCleanupGate(ownership, live);
  if (!gate.ok) return gate;
  const frozen = {
    schemaVersion: 1, policyVersion: postMergeCleanupPolicyVersion, phase: "cleanup_planned",
    ownership, targetDigest: digest({ ownership }), evidence: gate.evidence,
    effects: {}, mergeAuthoritative: true, cleanupRequired: true, retryCount: 0, lastResult: "planned", blocker: null,
    nextAction: "perform_final_cleanup_reread", updatedAt: new Date().toISOString(),
  };
  return { ok: true, state: frozen };
}

export function evaluateCleanupGate(owner, live = {}) {
  const blockers = [];
  if (live.repository !== owner.repository) blockers.push("repository_mismatch");
  if (live.pr?.state !== "MERGED" || live.pr?.headSha !== owner.reviewedHeadSha || live.pr?.mergeSha !== owner.mergeSha || live.pr?.baseBranch !== owner.targetBranch) blockers.push("merged_pr_identity_unproven");
  if (live.target?.branch !== owner.targetBranch || live.target?.sourceAncestor !== true || live.target?.mergeAncestor !== true || live.target?.acceptanceDigest !== owner.acceptance.evidenceDigest) blockers.push("current_target_acceptance_unproven");
  if (live.hygieneComplete !== true || live.reportsExported !== true || live.dependenciesComplete !== true) blockers.push("post_merge_hygiene_incomplete");
  if (live.activeInventoryComplete !== true || activeCategories.some((category) => !Number.isSafeInteger(live.activeReferences?.[category]) || live.activeReferences[category] < 0)) blockers.push("active_state_inventory_incomplete");
  const refs = activeCategories.filter((category) => Number(live.activeReferences?.[category] || 0) > 0);
  if (refs.length) blockers.push("active_state_references_present");
  if (Number(live.openPrReferences || 0) > 0) blockers.push("open_pr_references_present");
  if (live.protected === true || live.defaultBranch === owner.branchName || live.manualOwned === true || live.excluded === true) blockers.push("branch_excluded_or_protected");
  if (live.remoteHead && live.remoteHead !== owner.reviewedHeadSha) blockers.push("remote_head_drift");
  if (live.localHead && live.localHead !== owner.reviewedHeadSha) blockers.push("local_head_drift");
  const primaryHandoff = live.worktree?.primary === true && !owner.worktree && live.worktree.handoffEligible === true;
  if (live.worktree?.present && ((!primaryHandoff && (live.worktree.identity !== owner.worktree?.identity || live.worktree.primary)) || live.worktree.dirty || live.worktree.active || live.worktree.shared || live.worktree.symlinked || live.worktree.unexportedEvidence)) blockers.push("worktree_not_disposable_clean_owned");
  if (blockers.length) return { ok: false, reasonCode: blockers[0], blockers: blockers.slice(0, 20), nextAction: nextAction(blockers[0]) };
  return { ok: true, evidence: { remotePresent: Boolean(live.remoteHead), localPresent: Boolean(live.localHead), worktreePresent: Boolean(live.worktree?.present), activeReferenceCategories: refs, activeReferenceCount: refs.reduce((n, key) => n + Number(live.activeReferences[key] || 0), 0) } };
}

export async function continuePostMergeCleanup(input, adapter = {}) {
  let state = normalizeState(input);
  if (!state.ok) return state;
  state = state.state;
  if (state.phase === "cleanup_complete") return { ok: true, outcome: "complete", state };
  const live = await adapter.readLive?.(state.ownership);
  const gate = evaluateCleanupGate(state.ownership, live || {});
  if (!gate.ok) return blocked(state, gate.reasonCode, gate.nextAction);
  if (digest({ ownership: state.ownership }) !== state.targetDigest) return blocked(state, "cleanup_plan_identity_drift", "inspect_cleanup_ownership_drift");
  if (!phaseAtLeast(state.phase, "final_reread_passed")) { state = checkpoint(state, "final_reread_passed", "final_reread_passed", "reconcile_remote_branch"); await adapter.checkpoint?.(state); }
  const remote = await effect(state, adapter, "remote", Boolean(live.remoteHead)); if (!remote.ok) return remote; state = remote.state;
  const afterRemote = await adapter.readLive?.(state.ownership); const afterRemoteGate = evaluateCleanupGate(state.ownership, afterRemote || {}); if (!afterRemoteGate.ok) return blocked(state, afterRemoteGate.reasonCode, afterRemoteGate.nextAction); if (afterRemote?.remoteHead) return blocked(state, "remote_delete_unconfirmed", "retry_exact_remote_absence_readback");
  if (state.phase === "checkout_handoff_intended" && !afterRemote?.worktree?.present) {
    state = checkpoint(state, "checkout_handoff_confirmed", "checkout_handoff_already_adopted", "reconcile_owned_worktree"); await adapter.checkpoint?.(state);
  } else if (!phaseAtLeast(state.phase, "checkout_handoff_confirmed") && afterRemote?.worktree?.primary && afterRemote.worktree.handoffEligible) {
    if (state.phase !== "checkout_handoff_intended") { state = checkpoint(state, "checkout_handoff_intended", "checkout_handoff_intended", "detach_exact_primary_source_checkout"); await adapter.checkpoint?.(state); }
    const handedOff = await adapter.handoffPrimaryCheckout?.(state.ownership);
    if (!handedOff?.ok) return blocked(state, handedOff?.reasonCode || "checkout_handoff_failed", "retry_exact_primary_checkout_handoff");
    const afterHandoff = await adapter.readLive?.(state.ownership); const afterHandoffGate = evaluateCleanupGate(state.ownership, afterHandoff || {});
    if (!afterHandoffGate.ok) return blocked(state, afterHandoffGate.reasonCode, afterHandoffGate.nextAction);
    if (afterHandoff?.worktree?.present) return blocked(state, "checkout_handoff_unconfirmed", "inspect_primary_checkout_handoff");
    state = checkpoint(state, "checkout_handoff_confirmed", "checkout_handoff_confirmed", "reconcile_owned_worktree"); await adapter.checkpoint?.(state);
  }
  const beforeWorktree = await adapter.readLive?.(state.ownership);
  const worktree = await effect(state, adapter, "worktree", Boolean(beforeWorktree?.worktree?.present)); if (!worktree.ok) return worktree; state = worktree.state;
  const afterWorktree = await adapter.readLive?.(state.ownership); const afterWorktreeGate = evaluateCleanupGate(state.ownership, afterWorktree || {}); if (!afterWorktreeGate.ok) return blocked(state, afterWorktreeGate.reasonCode, afterWorktreeGate.nextAction); if (afterWorktree?.worktree?.present) return blocked(state, "worktree_remove_unconfirmed", "inspect_exact_owned_worktree");
  const local = await effect(state, adapter, "local_branch", Boolean(afterWorktree?.localHead)); if (!local.ok) return local; state = local.state;
  const finalLive = await adapter.readLive?.(state.ownership); const finalGate = evaluateCleanupGate(state.ownership, finalLive || {}); if (!finalGate.ok) return blocked(state, finalGate.reasonCode, finalGate.nextAction); if (finalLive?.remoteHead || finalLive?.localHead || finalLive?.worktree?.present) return blocked(state, "cleanup_final_readback_incomplete", "reconcile_exact_cleanup_effects");
  state = checkpoint(state, "cleanup_complete", "complete", "none", { cleanupRequired: false }); await adapter.checkpoint?.(state);
  return { ok: true, outcome: "complete", state };
}

async function effect(state, adapter, kind, present) {
  const intended = kind === "remote" ? "remote_delete_intended" : kind === "worktree" ? "worktree_remove_intended" : "local_branch_delete_intended";
  const confirmed = kind === "remote" ? "remote_delete_confirmed" : kind === "worktree" ? "worktree_remove_confirmed" : "local_branch_delete_confirmed";
  if (phaseAtLeast(state.phase, confirmed)) return { ok: true, state };
  let next = checkpoint(state, intended, `${kind}_intended`, `execute_exact_${kind}_cleanup`); await adapter.checkpoint?.(next);
  const immediate = await adapter.readLive?.(next.ownership); const gate = evaluateCleanupGate(next.ownership, immediate || {});
  if (!gate.ok) return blocked(next, gate.reasonCode, gate.nextAction);
  const nowPresent = kind === "remote" ? Boolean(immediate.remoteHead) : kind === "worktree" ? Boolean(immediate.worktree?.present) : Boolean(immediate.localHead);
  if (kind === "remote" && immediate.remoteHead && immediate.remoteHead !== next.ownership.reviewedHeadSha) return blocked(next, "remote_head_drift", "inspect_remote_head_drift");
  if (kind === "local_branch" && immediate.localHead && immediate.localHead !== next.ownership.reviewedHeadSha) return blocked(next, "local_head_drift", "inspect_local_head_drift");
  if (nowPresent) {
    const method = kind === "remote" ? adapter.deleteRemote : kind === "worktree" ? adapter.removeWorktree : adapter.deleteLocalBranch;
    if (typeof method !== "function") return blocked(next, `${kind}_cleanup_adapter_missing`, `configure_exact_${kind}_cleanup_adapter`);
    const result = await method(next.ownership);
    if (!result?.ok) return blocked(next, result?.reasonCode || `${kind}_cleanup_failed`, result?.nextAction || `retry_exact_${kind}_cleanup`);
  }
  const readback = await adapter.readLive?.(next.ownership);
  const readbackGate = evaluateCleanupGate(next.ownership, readback || {});
  if (!readbackGate.ok) return blocked(next, readbackGate.reasonCode, readbackGate.nextAction);
  const stillPresent = kind === "remote" ? Boolean(readback?.remoteHead) : kind === "worktree" ? Boolean(readback?.worktree?.present) : Boolean(readback?.localHead);
  if (stillPresent) return blocked(next, `${kind}_cleanup_unconfirmed`, `retry_exact_${kind}_absence_readback`);
  next = checkpoint(next, confirmed, nowPresent ? `${kind}_confirmed` : `${kind}_already_absent_adopted`, kind === "remote" ? "reconcile_owned_worktree" : kind === "worktree" ? "reconcile_owned_local_branch" : "perform_final_cleanup_readback"); await adapter.checkpoint?.(next);
  return { ok: true, state: next };
}

export function projectPostMergeCleanup(value = {}) {
  const owner = value.ownership || {};
  return { policyVersion: value.policyVersion === postMergeCleanupPolicyVersion ? value.policyVersion : null, ownershipStatus: validateCleanupOwnership(owner).ok ? "proven" : "unproven", eligible: value.blocker ? false : Boolean(value.phase), phase: postMergeCleanupPhases.includes(value.phase) ? value.phase : null, expectedSourceHead: sha.test(owner.reviewedHeadSha || "") ? owner.reviewedHeadSha : null, remotePresent: bool(value.evidence?.remotePresent), localPresent: bool(value.evidence?.localPresent), worktreePresent: bool(value.evidence?.worktreePresent), activeReferenceCount: Math.min(20, integer(value.evidence?.activeReferenceCount) || 0), activeReferenceCategories: Array.isArray(value.evidence?.activeReferenceCategories) ? value.evidence.activeReferenceCategories.filter((x) => activeCategories.includes(x)).slice(0, 20) : [], lastResult: safeReason(value.lastResult), blocker: safeReason(value.blocker), nextAction: safeReason(value.nextAction), mergeAuthoritative: value.mergeAuthoritative === true, cleanupRequired: value.cleanupRequired === true };
}

// Production Git effects are deliberately fixed here. The authority reader owns
// GitHub, lease, report and recovery inventory; it must return the complete live
// gate shape. No persisted command or path is ever executed.
export function createPostMergeCleanupGitAdapter({ config = null, repoRoot, authorityReader, checkpoint } = {}) {
  const root = realpathSync(repoRoot);
  let primaryHandoffIgnoredPids = [];
  const localTransportFixture = config?.runtimeMode !== "external";
  const run = (args, cwd = root, authorizedWorktreePaths = []) => runGit(args, {
    cwd,
    allowLocalFileTransport: localTransportFixture,
    manageWorktrees: args[0] === "worktree",
    timeoutMs: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    authorizedWorktreePaths,
  });
  const remoteIdentity = () => {
    const verified = assertRepositoryRemoteIdentity(config);
    if (verified) return verified;
    const origin = run(["remote", "get-url", "origin"]);
    const push = run(["remote", "get-url", "--push", "--all", "origin"]);
    const pushUrls = String(push.stdout || "").split(/\r?\n/u).filter(Boolean);
    if (origin.status !== 0 || push.status !== 0 || !String(origin.stdout || "").trim()
      || pushUrls.length !== 1) throw new Error("cleanup remote identity is unavailable");
    return { originUrl: String(origin.stdout).trim(), pushUrl: pushUrls[0] };
  };
  const worktreeFor = (branchName) => {
    const result = run(["worktree", "list", "--porcelain"]); if (result.status !== 0) return { error: "worktree_inventory_failed" };
    const blocks = String(result.stdout || "").trim().split(/\n\n+/).map((block) => Object.fromEntries(block.split(/\n/).map((line) => { const at = line.indexOf(" "); return at < 0 ? [line, true] : [line.slice(0, at), line.slice(at + 1)]; })));
    const matches = blocks.filter((entry) => entry.branch === `refs/heads/${branchName}`); if (matches.length > 1) return { error: "worktree_identity_ambiguous" };
    return matches[0] || null;
  };
  const localRef = (branchName) => {
    const ref = `refs/heads/${branchName}`;
    const verify = run(["show-ref", "--verify", "--quiet", ref]);
    if (verify.status === 1) return { status: 1, stdout: "" };
    if (verify.status !== 0) return verify;
    return run(["rev-parse", ref]);
  };
  return {
    checkpoint,
    readLive: async (owner) => {
      try { assertCleanupRepository(owner, config); } catch { return { excluded: true }; }
      const authority = await authorityReader(owner);
      primaryHandoffIgnoredPids = boundedPidList(authority.worktree?.primaryHandoffIgnoredPids);
      let authenticatedRemote;
      try { authenticatedRemote = remoteIdentity(); } catch { return { ...authority, excluded: true }; }
      const remote = run(["ls-remote", "--heads", authenticatedRemote.originUrl, `refs/heads/${owner.branchName}`]);
      const local = localRef(owner.branchName);
      const wt = worktreeFor(owner.branchName);
      if (remote.status !== 0 || ![0, 1].includes(local.status) || wt?.error) return { ...authority, excluded: true };
      let worktree = { present: false };
      if (wt) {
        const candidate = wt.worktree; let symlinked = true; let primary = true; let dirty = true;
        try { symlinked = lstatSync(candidate).isSymbolicLink(); const real = realpathSync(candidate); primary = real === root; const status = run(["status", "--porcelain=v1", "--untracked-files=normal"], real); dirty = status.status !== 0 || Boolean(String(status.stdout || "").trim()); } catch { /* fail closed */ }
        const actualIdentity = symlinked ? null : digest({ repository: owner.repository, branchName: owner.branchName, headSha: local.status === 0 ? String(local.stdout || "").trim() : null, realPath: realpathSync(candidate) });
        const processActive = !symlinked && processOwnsPath(realpathSync(candidate), primary ? [process.pid, ...primaryHandoffIgnoredPids] : []);
        worktree = { present: true, identity: actualIdentity, primary, handoffEligible: primary && !owner.worktree && !dirty && !processActive, dirty, active: authority.worktree?.active === true || processActive, shared: authority.worktree?.shared === true, symlinked, unexportedEvidence: authority.worktree?.unexportedEvidence === true };
      }
      const remoteHead = String(remote.stdout || "").trim().split(/\s+/)[0] || null;
      const localHead = local.status === 0 ? String(local.stdout || "").trim() : null;
      return { ...authority, remoteHead, localHead, worktree };
    },
    deleteRemote: async (owner) => {
      try {
        assertCleanupRepository(owner, config);
        const authenticatedRemote = remoteIdentity();
        return commandResult(run(["push", "--no-verify", `--force-with-lease=refs/heads/${owner.branchName}:${owner.reviewedHeadSha}`, authenticatedRemote.pushUrl, `:refs/heads/${owner.branchName}`]), "remote_branch_delete_failed");
      } catch { return fail("remote_branch_delete_authority_failed"); }
    },
    handoffPrimaryCheckout: async (owner) => {
      try { assertCleanupRepository(owner, config); } catch { return fail("checkout_handoff_authority_failed"); }
      const wt = worktreeFor(owner.branchName); if (!wt || wt.error) return fail(wt?.error || "checkout_handoff_target_missing");
      const candidate = realpathSync(wt.worktree); const status = run(["status", "--porcelain=v1", "--untracked-files=normal"], candidate); const local = localRef(owner.branchName);
      if (candidate !== root || status.status !== 0 || String(status.stdout || "").trim() || local.status !== 0 || String(local.stdout || "").trim() !== owner.reviewedHeadSha || processOwnsPath(candidate, [process.pid, ...primaryHandoffIgnoredPids])) return fail("checkout_handoff_target_drift");
      return commandResult(run(["switch", "--detach", owner.acceptance.targetHeadSha], candidate), "checkout_handoff_failed");
    },
    removeWorktree: async (owner) => {
      try { assertCleanupRepository(owner, config); } catch { return fail("worktree_remove_authority_failed"); }
      const wt = worktreeFor(owner.branchName); if (!wt) return { ok: true, adopted: true }; if (wt.error) return fail(wt.error);
      if (!owner.worktree?.identity || lstatSync(wt.worktree).isSymbolicLink()) return fail("worktree_remove_target_unsafe");
      const candidate = realpathSync(wt.worktree); const local = localRef(owner.branchName);
      const status = run(["status", "--porcelain=v1", "--untracked-files=normal"], candidate);
      const identity = local.status === 0 ? digest({ repository: owner.repository, branchName: owner.branchName, headSha: String(local.stdout || "").trim(), realPath: candidate }) : null;
      if (candidate === root || local.status !== 0 || String(local.stdout || "").trim() !== owner.reviewedHeadSha || identity !== owner.worktree.identity || status.status !== 0 || String(status.stdout || "").trim() || processOwnsPath(candidate)) return fail("worktree_remove_target_drift");
      return commandResult(run(["worktree", "remove", "--", candidate], root, [candidate]), "worktree_remove_failed");
    },
    deleteLocalBranch: async (owner) => {
      try { assertCleanupRepository(owner, config); } catch { return fail("local_branch_delete_authority_failed"); }
      const local = localRef(owner.branchName); if (local.status === 1) return { ok: true, adopted: true };
      if (local.status !== 0 || String(local.stdout || "").trim() !== owner.reviewedHeadSha) return fail("local_branch_delete_target_drift");
      const merged = run(["merge-base", "--is-ancestor", owner.reviewedHeadSha, owner.acceptance.targetHeadSha]); if (merged.status !== 0) return fail("local_branch_unmerged");
      return commandResult(run(["update-ref", "-d", `refs/heads/${owner.branchName}`, owner.reviewedHeadSha]), "local_branch_delete_failed");
    },
  };
}

function assertCleanupRepository(owner, config) {
  if (!config) return;
  const expected = String(config.repositorySlug || "").toLowerCase();
  const ownerRepository = String(owner?.repository || "").toLowerCase();
  let urlRepository = null;
  try {
    const url = new URL(owner?.prUrl || "");
    const match = url.hostname === "github.com" ? url.pathname.match(/^\/([^/]+\/[^/]+)\/pull\/[1-9][0-9]*$/u) : null;
    urlRepository = match?.[1]?.toLowerCase() || null;
  } catch { /* rejected below */ }
  if (!expected || ownerRepository !== expected || urlRepository !== expected
    || path.resolve(config.repoRoot || "") !== path.resolve(config.controlPlaneRepoRoot || config.repoRoot || "")) {
    throw new Error("cleanup ownership repository differs from runtime identity");
  }
}

function normalizeState(value) { if (!value || value.schemaVersion !== 1 || value.policyVersion !== postMergeCleanupPolicyVersion || !postMergeCleanupPhases.includes(value.phase) || !validateCleanupOwnership(value.ownership).ok || !/^[0-9a-f]{64}$/.test(value.targetDigest || "")) return fail("cleanup_state_invalid"); return { ok: true, state: { ...value, effects: boundedObject(value.effects) } }; }
function checkpoint(state, phase, lastResult, nextActionValue, extra = {}) { return { ...state, ...extra, phase, lastResult, nextAction: nextActionValue, blocker: null, effects: { ...state.effects, [phase]: { confirmedAt: new Date().toISOString() } }, updatedAt: new Date().toISOString() }; }
function blocked(state, reasonCode, action) { const next = { ...state, mergeAuthoritative: true, cleanupRequired: true, lastResult: "blocked", blocker: safeReason(reasonCode), nextAction: safeReason(action), updatedAt: new Date().toISOString() }; return { ok: false, outcome: "cleanup_required", reasonCode, state: next }; }
function phaseAtLeast(current, target) { return postMergeCleanupPhases.indexOf(current) >= postMergeCleanupPhases.indexOf(target); }
function nextAction(reason) { return ({ remote_head_drift: "inspect_remote_head_drift", local_head_drift: "inspect_local_head_drift", worktree_not_disposable_clean_owned: "retain_worktree_for_operator_inspection", active_state_references_present: "complete_active_state_reconciliation", open_pr_references_present: "wait_for_dependent_pr_completion" })[reason] || "complete_missing_cleanup_proof"; }
function boundedObject(value) { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; const json = JSON.stringify(value); return json.length <= 16_384 ? JSON.parse(json) : {}; }
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function fail(reasonCode) { return { ok: false, reasonCode }; }
function text(value, max) { return typeof value === "string" && value.length > 0 && value.length <= max ? value : null; }
function integer(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null; }
function iso(value) { const date = new Date(value || Date.now()); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function bool(value) { return value === true ? true : value === false ? false : null; }
function safeReason(value) { return typeof value === "string" && /^[a-z0-9_:-]{1,120}$/i.test(value) ? value : null; }
function commandResult(result, reasonCode) { return result?.status === 0 && !result?.error ? { ok: true } : { ok: false, reasonCode }; }
function writeOwnerOnlyAtomic(file, value, unsafeReason) { const dir = path.dirname(file); mkdirSync(dir, { recursive: true, mode: 0o700 }); const info = lstatSync(dir); if ((info.mode & 0o077) !== 0 || info.isSymbolicLink()) return fail(unsafeReason); const tmp = `${file}.${process.pid}.${Date.now()}.tmp`; writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" }); renameSync(tmp, file); return { ok: true, statePath: file, value }; }
function readOwnerOnlyJson(file, validator, prefix) { let fd; try { fd = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); const stat = fstatSync(fd); if (!stat.isFile() || stat.size < 2 || stat.size > 1024 * 1024 || (stat.mode & 0o077) !== 0 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) return fail(`${prefix}_state_unsafe`); const value = JSON.parse(readFileSync(fd, "utf8")); const valid = validator(value); return valid.ok ? { ok: true, value } : valid; } catch { return fail(`${prefix}_state_unavailable_or_corrupt`); } finally { if (fd !== undefined) closeSync(fd); } }
function processOwnsPath(candidate, ignoredPids = []) {
  const ignored = new Set(boundedPidList(ignoredPids));
  const lsof = spawnSync("/usr/bin/lsof", ["-t", "+D", candidate], {
    encoding: "utf8", windowsHide: true, shell: false, timeout: 10_000, maxBuffer: 1024 * 1024,
    env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
  });
  if (lsof.error && lsof.error.code !== "ENOENT") return true;
  if (!lsof.error && ![0, 1].includes(lsof.status)) return true;
  if (!lsof.error && lsof.status === 0) {
    const owners = String(lsof.stdout || "").trim().split(/\s+/).filter(Boolean).map(Number);
    if (owners.some((pid) => !ignored.has(pid))) return true;
    if (owners.length > 0) return false;
  }
  if (!lsof.error && lsof.status === 1) return false;
  try {
    for (const entry of readdirSync("/proc")) {
      if (!/^[1-9][0-9]*$/.test(entry)) continue;
      if (ignored.has(Number(entry))) continue;
      for (const link of [`/proc/${entry}/cwd`, `/proc/${entry}/root`, `/proc/${entry}/exe`]) {
        try { if (insidePath(readlinkSync(link), candidate)) return true; } catch (error) { if (!transientProcfsError(error)) return true; }
      }
      let fds;
      try { fds = readdirSync(`/proc/${entry}/fd`); } catch (error) { if (transientProcfsError(error)) continue; return true; }
      for (const fd of fds) {
        try { if (insidePath(readlinkSync(`/proc/${entry}/fd/${fd}`), candidate)) return true; } catch (error) { if (!transientProcfsError(error)) return true; }
      }
    }
  } catch { return true; }
  return false;
}
function boundedPidList(value) { return (Array.isArray(value) ? value : [value]).filter((pid) => Number.isSafeInteger(pid) && pid > 1).slice(0, 4); }
function transientProcfsError(error) { return error?.code === "ENOENT" || error?.code === "ESRCH"; }
function insidePath(value, candidate) { const clean = String(value || "").replace(/ \(deleted\)$/, ""); return clean === candidate || clean.startsWith(`${candidate}${path.sep}`); }
