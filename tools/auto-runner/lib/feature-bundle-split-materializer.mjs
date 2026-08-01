import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertRepositoryRemoteIdentity } from "./runtime-identity.mjs";
import { runGit, runTrustedGithub } from "./git-workspace.mjs";

export async function materializeFeatureBundleSplit(input, adapter) {
  const proof = validateSplitMaterializationInput(input);
  if (!proof.ok) return proof;
  let state = normalizeState(input.state, input);
  const materialized = [];
  for (const slice of proof.slices) {
    const expected = expectedSlice(input, slice, materialized);
    const prior = state.slices[slice.id];
    if (prior && prior.expectedDigest !== expected.expectedDigest) return fail("split_materialization_state_conflict", { sliceId: slice.id });
    const liveBranch = await adapter.readBranch(expected.branchName);
    if (liveBranch?.complete === false || liveBranch?.unavailable) return fail("split_materialization_branch_read_unavailable", { sliceId: slice.id });
    if (liveBranch?.conflict) return fail("split_materialization_branch_conflict", { sliceId: slice.id, branchName: expected.branchName });
    if (liveBranch?.exists && prior?.headSha && liveBranch.headSha !== prior.headSha) return fail("split_materialization_branch_conflict", { sliceId: slice.id, branchName: expected.branchName });
    let branch = liveBranch?.exists
      ? { ...prior, ...liveBranch, pushed: liveBranch.remoteExists === false ? false : prior?.pushed, ok: true, adopted: true }
      : prior?.headSha
        ? { ...prior, ok: true, adopted: true, pushed: false }
        : await adapter.materializeBranch(expected);
    if (!branch?.ok || !branch.headSha || !branch.treeSha) return fail(branch?.reasonCode || "split_materialization_branch_failed", { sliceId: slice.id });
    const verified = await adapter.verifyOwnDelta({ ...expected, ...branch });
    if (!verified?.ok || verified.changedFilesDigest !== slice.changedFilesDigest || verified.semanticOwnDeltaProven !== true) return fail(verified?.reasonCode || "split_materialization_semantic_mismatch", { sliceId: slice.id });
    state = put(state, slice.id, { ...prior, ...expected, headSha: branch.headSha, treeSha: branch.treeSha, changedFilesDigest: verified.changedFilesDigest, pushed: branch.pushed ?? prior?.pushed ?? false, phase: prior?.phase || "materialized" });
    await adapter.checkpoint?.(state);
    if (!state.slices[slice.id].pushed) {
      const pushed = await adapter.pushBranch({ ...expected, ...branch });
      if (!pushed?.ok) return fail(pushed?.reasonCode || "split_materialization_push_failed", { sliceId: slice.id });
      state = put(state, slice.id, { ...state.slices[slice.id], pushed: true, phase: "pushed" });
      await adapter.checkpoint?.(state);
    }
    const livePr = await adapter.readPr(expected.branchName);
    if (livePr?.complete === false || livePr?.unavailable) return fail("split_materialization_pr_read_unavailable", { sliceId: slice.id });
    if (livePr?.ambiguous || (livePr?.exists && (livePr.headSha !== branch.headSha || livePr.baseBranch !== expected.baseBranch))) return fail("split_materialization_pr_conflict", { sliceId: slice.id });
    let pr = livePr?.exists ? livePr : await adapter.createPr({ ...expected, ...branch });
    if (!pr?.ok && !pr?.exists) return fail(pr?.reasonCode || "split_materialization_pr_failed", { sliceId: slice.id });
    state = put(state, slice.id, { ...state.slices[slice.id], prNumber: pr.number, prUrl: pr.url, phase: "pr_created" });
    await adapter.checkpoint?.(state);
    materialized.push({ ...state.slices[slice.id], number: pr.number, baseRefName: expected.baseBranch, headRefName: expected.branchName, headRefOid: branch.headSha, ownDelta: verified.ownDelta });
  }
  if (state.phase === "handed_off" && state.stack?.ok === true && state.stack?.outcome !== "waiting") return { ok: true, outcome: "deterministic_split_materialized", state, prs: materialized, handoff: state.stack, adopted: true };
  const handoff = await adapter.handoffToPrStack({ logicalTaskKey: input.logicalTaskKey, repository: input.repository, issueNumber: input.issueNumber, slices: materialized, state });
  if (!handoff?.ok) return fail(handoff?.reasonCode || "split_materialization_stack_handoff_failed");
  state = { ...state, phase: handoff.outcome === "waiting" ? "stack_waiting" : "handed_off", stack: bounded(handoff) };
  await adapter.checkpoint?.(state);
  return { ok: true, outcome: handoff.outcome === "waiting" ? "waiting" : "deterministic_split_materialized", state, prs: materialized, handoff };
}

export function validateSplitMaterializationInput(input = {}) {
  if (input.executionAuthorityProven !== true) return fail("split_execution_authority_missing");
  if (!/^[a-f0-9]{40}$/.test(input.baseSha || "") || !Array.isArray(input.changedFiles) || input.changedFiles.length === 0) return fail("split_candidate_identity_incomplete");
  const slices = (input.slices || []).map((slice) => ({ ...slice, changedFiles: [...new Set(slice.changedFiles || [])].sort(), dependsOn: [...new Set(slice.dependsOn || [])].sort(), changedFilesDigest: digest([...(slice.changedFiles || [])].sort()) }));
  if (!slices.length || slices.some((slice) => !slice.id || !slice.branchName || !slice.commitRange?.fromExclusive || !slice.commitRange?.toInclusive || slice.allowedPathsProven !== true || slice.semanticOwnDeltaProven !== true)) return fail("split_proof_incomplete");
  const assigned = slices.flatMap((slice) => slice.changedFiles);
  if (new Set(assigned).size !== assigned.length || digest([...assigned].sort()) !== digest([...input.changedFiles].sort())) return fail("split_file_ownership_ambiguous");
  const ids = new Set(slices.map((slice) => slice.id));
  if (slices.some((slice) => slice.dependsOn.some((id) => !ids.has(id)))) return fail("split_dependency_unknown");
  if (slices.some((slice) => slice.dependsOn.length > 1)) return fail("split_dependency_non_linear");
  const dependentCounts = new Map();
  for (const slice of slices) for (const parent of slice.dependsOn) dependentCounts.set(parent, (dependentCounts.get(parent) || 0) + 1);
  if ([...dependentCounts.values()].some((count) => count > 1)) return fail("split_dependency_non_linear");
  const ordered = topological(slices);
  if (!ordered) return fail("split_dependency_cycle");
  return { ok: true, slices: ordered };
}

export function createProductionSplitMaterializationAdapter(config, { checkpointPath, handoffToPrStack }) {
  const cwd = config.repoRoot;
  return {
    readBranch: async (branchName) => {
      const local = git(cwd, ["show-ref", "--verify", "--hash", `refs/heads/${branchName}`]);
      const verified = assertRepositoryRemoteIdentity(config);
      const remote = git(cwd, ["ls-remote", "--heads", verified?.originUrl || "origin", `refs/heads/${branchName}`], {
        allowLocalFileTransport: config.runtimeMode !== "external",
      });
      if (remote.status !== 0 || remote.error) return { complete: false, exists: false, unavailable: true };
      const remoteHead = remote.status === 0 && remote.stdout.trim() ? remote.stdout.trim().split(/\s+/)[0] : null;
      const localHead = local.status === 0 ? local.stdout.trim() : null;
      if (localHead && remoteHead && localHead !== remoteHead) return { complete: true, exists: true, conflict: true, headSha: localHead, remoteHead };
      if (localHead) return { complete: true, exists: true, headSha: localHead, treeSha: git(cwd, ["rev-parse", `${localHead}^{tree}`]).stdout.trim(), remoteExists: Boolean(remoteHead), source: remoteHead ? "local+remote" : "local" };
      if (!remoteHead) return { complete: true, exists: false, headSha: null, remoteExists: false };
      const fetched = git(cwd, ["fetch", verified?.originUrl || "origin", `refs/heads/${branchName}`], {
        allowLocalFileTransport: config.runtimeMode !== "external",
      });
      return fetched.status === 0 ? { complete: true, exists: true, headSha: remoteHead, treeSha: git(cwd, ["rev-parse", `${remoteHead}^{tree}`]).stdout.trim(), remoteExists: true, source: "remote" } : { complete: false, exists: true, headSha: remoteHead, unavailable: true };
    },
    materializeBranch: async (expected) => {
      const temporary = mkdtempSync(path.join(tmpdir(), "settleora-split-"));
      let worktreeAdded = false;
      try {
        const add = git(cwd, ["worktree", "add", "-b", expected.branchName, temporary, expected.baseHeadSha]);
        if (add.status !== 0) return fail("split_materialization_branch_create_failed", { stderr: add.stderr.slice(0, 500) });
        worktreeAdded = true;
        const range = `${expected.commitRange.fromExclusive}..${expected.commitRange.toInclusive}`;
        const commits = git(cwd, ["rev-list", "--reverse", range]);
        const shas = commits.stdout.trim().split(/\s+/).filter(Boolean);
        if (commits.status !== 0 || shas.length === 0) return fail("split_materialization_commit_range_invalid");
        const picked = git(temporary, ["cherry-pick", ...shas]);
        if (picked.status !== 0) return fail("split_materialization_cherry_pick_failed", { stderr: picked.stderr.slice(0, 500) });
        return { ok: true, headSha: git(temporary, ["rev-parse", "HEAD"]).stdout.trim(), treeSha: git(temporary, ["rev-parse", "HEAD^{tree}"]).stdout.trim() };
      } finally {
        if (worktreeAdded) {
          git(temporary, ["cherry-pick", "--abort"]);
          git(cwd, ["worktree", "remove", temporary]);
        }
        rmSync(temporary, { recursive: true, force: true });
      }
    },
    verifyOwnDelta: async (expected) => {
      const files = git(cwd, ["diff", "--name-only", expected.baseHeadSha, expected.headSha]);
      if (files.status !== 0) return fail("split_materialization_diff_unavailable");
      const changedFiles = files.stdout.trim().split(/\r?\n/).filter(Boolean).sort();
      const actualDigest = digest(changedFiles);
      const sourcePatch = git(cwd, ["diff", "--binary", expected.commitRange.fromExclusive, expected.commitRange.toInclusive]);
      const materializedPatch = git(cwd, ["diff", "--binary", expected.baseHeadSha, expected.headSha]);
      const patchMatches = sourcePatch.status === 0 && materializedPatch.status === 0 && digest(sourcePatch.stdout) === digest(materializedPatch.stdout);
      const ownDelta = patchMatches ? buildSplitOwnDelta(cwd, expected, changedFiles, materializedPatch.stdout) : null;
      const ok = actualDigest === expected.changedFilesDigest && patchMatches && ownDelta?.forwardPatchApplies === true && ownDelta?.reversePatchApplies === true && Boolean(ownDelta?.stablePatchId);
      return { ok, reasonCode: ok ? null : actualDigest !== expected.changedFilesDigest ? "split_materialization_changed_files_mismatch" : "split_materialization_semantic_mismatch", changedFilesDigest: actualDigest, semanticOwnDeltaProven: ok, ownDelta };
    },
    pushBranch: async (expected) => {
      const verified = assertRepositoryRemoteIdentity(config);
      const result = git(cwd, ["push", verified?.pushUrl || "origin", `${expected.headSha}:refs/heads/${expected.branchName}`], {
        allowLocalFileTransport: config.runtimeMode !== "external",
      });
      return { ok: result.status === 0, reasonCode: result.status === 0 ? null : "split_materialization_push_failed" };
    },
    readPr: async (branchName) => {
      const result = runTrustedGithub(config, ["pr", "list", "--head", branchName, "--state", "all", "--json", "number,url,state,baseRefName,headRefName,headRefOid"]);
      if (result.status !== 0) return { complete: false, exists: false, unavailable: true };
      const prs = JSON.parse(result.stdout || "[]");
      if (prs.length > 1) return { exists: true, ambiguous: true };
      const pr = prs[0];
      return pr ? { complete: true, exists: true, ok: true, number: pr.number, url: pr.url, state: pr.state, baseBranch: pr.baseRefName, headSha: pr.headRefOid } : { complete: true, exists: false };
    },
    createPr: async (expected) => {
      const result = runTrustedGithub(config, ["pr", "create", "--base", expected.baseBranch, "--head", expected.branchName, "--title", `Auto-runner split: #${expected.issueNumber} ${expected.id}`, "--body", `Part of #${expected.issueNumber}. Deterministic split of logical task ${expected.logicalTaskKey}.`]);
      if (result.status !== 0) return fail("split_materialization_pr_failed");
      const url = result.stdout.trim();
      const number = Number(url.split("/").at(-1));
      return { ok: Number.isInteger(number), number, url };
    },
    checkpoint: async (state) => {
      mkdirSync(path.dirname(checkpointPath), { recursive: true, mode: 0o700 });
      writeFileSync(checkpointPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    },
    handoffToPrStack,
  };
}

export function readSplitMaterializationState(checkpointPath) {
  try { return JSON.parse(readFileSync(checkpointPath, "utf8")); } catch { return null; }
}

function expectedSlice(input, slice, materialized) {
  const parent = slice.dependsOn.length ? materialized.find((item) => item.id === slice.dependsOn.at(-1)) : null;
  const baseBranch = parent?.branchName || input.baseBranch || "main";
  return { ...slice, repository: input.repository, issueNumber: slice.issueNumber || input.issueNumber, logicalTaskKey: input.logicalTaskKey, frozenBaseSha: input.baseSha, baseBranch, baseHeadSha: parent?.headSha || input.baseSha, expectedDigest: digest({ baseSha: input.baseSha, baseBranch, range: slice.commitRange, files: slice.changedFiles, dependencies: slice.dependsOn }) };
}
function normalizeState(state, input) { return state?.version === 1 ? { ...state, slices: { ...(state.slices || {}) } } : { version: 1, logicalTaskKey: input.logicalTaskKey, sourceHeadSha: input.headSha, baseSha: input.baseSha, phase: "materializing", slices: {} }; }
function put(state, id, value) { return { ...state, slices: { ...state.slices, [id]: bounded(value) } }; }
function topological(slices) { const pending = [...slices], result = [], done = new Set(); while (pending.length) { const index = pending.findIndex((slice) => slice.dependsOn.every((id) => done.has(id))); if (index < 0) return null; const [slice] = pending.splice(index, 1); result.push(slice); done.add(slice.id); } return result; }
function buildSplitOwnDelta(cwd, expected, fileSet, patchText) {
  const numstatResult = git(cwd, ["diff", "--numstat", expected.baseHeadSha, expected.headSha]);
  const patchIdResult = git(cwd, ["patch-id", "--stable"], { input: patchText });
  const stablePatchId = patchIdResult.status === 0 ? patchIdResult.stdout.trim().split(/\s+/)[0] : null;
  const stats = summarizeSplitPatch(patchText);
  const numstat = parseSplitNumstat(numstatResult.stdout);
  const normalizedPatch = String(patchText).replace(/^index [0-9a-f]+\.\.[0-9a-f]+.*$/gim, "index <normalized>").replace(/\r\n/g, "\n").trim();
  return {
    schemaVersion: 1,
    fileSet,
    fileSetDigest: digest(fileSet),
    changedFiles: fileSet,
    changedFileCount: fileSet.length,
    changedFilesDigest: digest(fileSet),
    diffstat: { files: fileSet.length, additions: stats.additions, deletions: stats.deletions },
    diffstatDigest: digest({ files: fileSet.length, additions: stats.additions, deletions: stats.deletions }),
    numstat,
    numstatDigest: digest(numstat),
    stablePatchId: /^[a-f0-9]{40}$/i.test(stablePatchId || "") ? stablePatchId : null,
    normalizedPatchDigest: digest(normalizedPatch),
    rawDiffHash: createHash("sha256").update(patchText).digest("hex"),
    forwardPatchApplies: splitPatchApplies(cwd, expected.baseHeadSha, patchText, false),
    reversePatchApplies: splitPatchApplies(cwd, expected.headSha, patchText, true),
  };
}
function summarizeSplitPatch(value) { let additions = 0, deletions = 0, current = false; for (const line of String(value).split(/\r?\n/)) { if (line.startsWith("diff --git ")) { current = true; continue; } if (!current || line.startsWith("+++") || line.startsWith("---")) continue; if (line.startsWith("+")) additions += 1; else if (line.startsWith("-")) deletions += 1; } return { additions, deletions }; }
function parseSplitNumstat(value) { const entries = {}; for (const line of String(value || "").split(/\r?\n/)) { if (!line.trim()) continue; const [added, deleted, file] = line.split("\t"); if (file) entries[file] = { added: added === "-" ? null : Number(added), deleted: deleted === "-" ? null : Number(deleted) }; } return entries; }
function splitPatchApplies(cwd, ref, patchText, reverse) { const temporary = mkdtempSync(path.join(tmpdir(), "settleora-split-proof-")); let added = false; try { const worktree = git(cwd, ["worktree", "add", "--detach", temporary, ref]); if (worktree.status !== 0) return false; added = true; const args = ["apply", "--check"]; if (reverse) args.push("--reverse"); args.push("-"); const result = git(temporary, args, { input: patchText, bindAttributesToHead: false }); return result.status === 0 && !result.error; } finally { if (added) git(cwd, ["worktree", "remove", temporary]); rmSync(temporary, { recursive: true, force: true }); } }
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function bounded(value) { const text = JSON.stringify(value); return text.length <= 32_768 ? JSON.parse(text) : { truncated: true, sha256: createHash("sha256").update(text).digest("hex") }; }
function fail(reasonCode, evidence = {}) { return { ok: false, outcome: "blocked", reasonCode, evidence }; }
function git(cwd, args, options = {}) { return runGit(args, { cwd, input: options.input, bindAttributesToHead: options.bindAttributesToHead, manageWorktrees: args.includes("worktree"), allowLocalFileTransport: options.allowLocalFileTransport === true }); }
