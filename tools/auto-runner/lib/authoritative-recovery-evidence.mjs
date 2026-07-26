import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { processAppearsActive } from "./state-store.mjs";
import { readHeartbeat } from "../supervisor/heartbeat.mjs";
import { loadPreEffectIntent, reconcilePreEffectIntent } from "./pre-effect-intent.mjs";
import { canonicalGithubEvidenceDigest } from "./github-evidence-digest.mjs";
import { assertRepositoryRemoteIdentity } from "./runtime-identity.mjs";

export const authoritativeRecoveryEvidenceVersion = 1;

export function collectAuthoritativeRecoveryEvidence(config, identity, expected = {}, adapters = {}) {
  const now = adapters.now instanceof Date ? adapters.now : new Date();
  const diagnostics = [];
  const contradictions = [];
  const ambiguities = [];
  const required = validateIdentity(config, identity);
  if (!required.ok) return failed(required.reasonCode, now, diagnostics, contradictions, ambiguities);
  const readProcess = adapters.readProcess || (() => defaultProcessRead(config, identity));
  const readLease = adapters.readLease || (() => defaultLeaseRead(config, identity, now));
  const readGit = adapters.readGit || (() => defaultGitRead(config, identity));
  const readGithub = adapters.readGithub || (() => defaultGithubRead(config, identity));
  let processRead;
  let leaseRead;
  let gitRead;
  let githubRead;
  try { processRead = sanitizeProcess(readProcess()); } catch { diagnostics.push("process_read_failed"); }
  try { leaseRead = sanitizeLease(readLease()); } catch { diagnostics.push("lease_read_failed"); }
  try { gitRead = sanitizeGit(readGit()); } catch { diagnostics.push("git_read_failed"); }
  try { githubRead = sanitizeGithub(readGithub(), expected); } catch { diagnostics.push("github_read_failed"); }
  if (!processRead?.complete) diagnostics.push("process_identity_or_liveness_incomplete");
  if (!leaseRead?.complete) diagnostics.push("lease_identity_or_liveness_incomplete");
  if (!gitRead?.complete) diagnostics.push("git_readback_incomplete");
  if (!githubRead?.complete) diagnostics.push("github_readback_incomplete");
  if (processRead?.alive === true && leaseRead?.valid === false) contradictions.push("live_process_stale_lease");
  if (processRead?.alive === false && leaseRead?.valid === true) contradictions.push("dead_process_valid_lease");
  const intents = reconcileDurableIntents(config, expected.preEffectIntentIds, gitRead, githubRead, diagnostics, contradictions, ambiguities);
  reconcileIdentity(identity, gitRead, githubRead, intents, contradictions, ambiguities);
  const effects = reconcileEffects(expected, gitRead, githubRead, identity, contradictions, ambiguities);
  const complete = diagnostics.length === 0 && contradictions.length === 0 && ambiguities.length === 0;
  const ownerBlocked = processRead?.alive === true || leaseRead?.valid === true;
  const takeoverAllowed = complete && processRead.alive === false && leaseRead.valid === false;
  const interruption = complete
    ? ownerBlocked
      ? { ownerAlive: processRead.alive, leaseValid: leaseRead.valid }
      : { processExited: true, checkpointValid: identity.checkpointValid === true }
    : { contradictory: contradictions.length > 0, identityMismatch: ambiguities.length > 0 || diagnostics.length > 0 };
  return {
    schemaVersion: authoritativeRecoveryEvidenceVersion,
    ok: complete,
    reasonCode: complete ? (takeoverAllowed ? "authoritative_recovery_evidence_takeover_allowed" : "authoritative_recovery_evidence_owner_active") : "authoritative_recovery_evidence_fail_closed",
    collectedAt: now.toISOString(),
    identity: sanitizeIdentity(identity),
    authority: sanitizeAuthority(identity.authority),
    process: processRead || null,
    lease: leaseRead || null,
    checkpoint: { digest: digest64(identity.checkpointDigest), valid: identity.checkpointValid === true },
    git: gitRead || null,
    github: githubRead || null,
    effects,
    intents,
    pendingChecks: githubRead?.checks || { state: "unknown" },
    ownerBlocked,
    takeoverAllowed,
    interruption,
    ambiguity: ambiguities.length > 0,
    contradiction: contradictions.length > 0,
    diagnostics: [...new Set(diagnostics)].slice(0, 20),
    contradictions: [...new Set(contradictions)].slice(0, 20),
    ambiguities: [...new Set(ambiguities)].slice(0, 20),
  };
}

function reconcileDurableIntents(config, intentIds, git, github, diagnostics, contradictions, ambiguities) {
  if (!Array.isArray(intentIds) || intentIds.length === 0) return [];
  const results = [];
  for (const intentId of intentIds) {
    let intent;
    try { intent = loadPreEffectIntent(config, intentId); } catch { diagnostics.push("pre_effect_intent_read_failed"); continue; }
    if (!intent) { diagnostics.push("pre_effect_intent_missing"); continue; }
    const intentGit = gitForIntent(config, intent, git);
    const liveEvidence = liveEvidenceForIntent(intent, intentGit, githubForIntent(config, intent, github));
    const result = reconcilePreEffectIntent(intent, liveEvidence);
    // Evidence collection is deliberately read-only. The successor must first
    // acquire active mutation authority; its canonical consumer then performs
    // the atomic adoption/finalization transition.
    if (result.classification === "effect_ambiguous") ambiguities.push("pre_effect_intent_ambiguous");
    else if (["effect_contradictory", "live_read_unavailable"].includes(result.classification)) contradictions.push(`pre_effect_intent_${result.classification}`);
    results.push({ intentId: String(intent.intentId).slice(0, 120), effectType: intent.effectType, fingerprint: intent.fingerprint, classification: result.classification, ...(intent.effectType === "commit" ? { treeSha: sha40(intent.effect.treeSha), stagedPaths: Array.isArray(intent.effect.stagedPaths) ? intent.effect.stagedPaths.slice(0, 200) : [], confirmedHeadMatches: liveEvidence.present === true, preparedWorktreeMatches: intent.status === "prepared" && result.classification === "effect_absent_safe_to_execute" && intentGit.stagedTreeSha === intent.effect.treeSha && sameStrings(intentGit.stagedPaths, intent.effect.stagedPaths) && intentGit.unstagedPaths.length === 0 && intentGit.untrackedClean === true } : {}) });
  }
  return results;
}

function liveEvidenceForIntent(intent, git, github) {
  const e = intent.effect;
  let present = false;
  if (intent.effectType === "commit") {
    if (!git?.complete) return { complete: false };
    present = git.headSha !== e.expectedParents?.[0]
      && git.commit?.parentShas?.join(" ") === (e.expectedParents || []).join(" ")
      && git.commit?.treeSha === e.treeSha
      && git.commit?.messageFingerprint === e.messageDigest;
  } else if (["push", "pr_head_update"].includes(intent.effectType)) {
    if (!git?.complete && !github?.complete) return { complete: false };
    present = git?.remoteHeadSha === (e.localSha || e.localCommitSha) || github?.pr?.headSha === (e.localSha || e.localCommitSha);
  } else {
    if (!github?.complete) return { complete: false };
    if (intent.effectType === "pr_create") present = github.pr?.headSha === (e.sourceHeadSha || e.headSha) && github.pr?.baseRefName === (e.targetBaseBranch || intent.identity?.baseBranch);
    else if (["pr_update", "docs_pr_create_update"].includes(intent.effectType)) present = github.pr?.headSha === (e.expectedHeadSha || intent.identity?.headSha);
    else if (intent.effectType === "pr_retarget") present = github.pr?.headSha === e.expectedHead && github.pr?.baseRefName === e.newBase;
    else if (["pr_ready", "docs_pr_ready"].includes(intent.effectType)) present = github.pr?.headSha === e.expectedHead && github.pr?.draft === false;
    else if (intent.effectType === "pr_draft") present = github.pr?.headSha === e.expectedHeadSha && github.pr?.draft === true;
    else if (["merge", "docs_pr_merge"].includes(intent.effectType)) present = github.pr?.state === "MERGED"
      && github.pr?.headSha === (e.expectedHeadSha || e.headSha)
      && github.pr?.mergeParentShas?.[0] === e.expectedBaseSha
      && github.pr?.mergeParentShas?.[1] === (e.expectedHeadSha || e.headSha);
    else if (["comment", "review_reply", "issue_progress_comment", "umbrella_update", "review_trigger"].includes(intent.effectType)) present = (github.comments || []).some((c) => commentMatchesIntent(c, intent)
      && (c.fingerprint === e.contentFingerprint || c.canonicalFingerprint === e.bodyDigest));
    else if (intent.effectType === "hygiene_component") present = Array.isArray(github.issueLabels)
      && (e.addLabels || []).every((label) => github.issueLabels.includes(label))
      && (e.removeLabels || []).every((label) => !github.issueLabels.includes(label));
    else if (intent.effectType === "issue_closure") present = github.issue?.state === "CLOSED" && github.issue?.stateReason === "COMPLETED";
    else if (intent.effectType === "branch_retention_verify") present = git?.complete && git.remoteHeadSha === e.expectedHeadSha;
    else present = (github.hygiene || []).includes(intent.fingerprint);
  }
  return { complete: true, present, identity: intent.identity, effect: intent.effect };
}

function githubForIntent(config, intent, fallback) {
  if (intent.effectType === "umbrella_update") {
    const result = readAllGithubComments(config, `repos/${config.repositorySlug}/issues/${intent.effect.issueNumber}/comments?per_page=100`, { channel: "issue", targetNumber: intent.effect.issueNumber });
    return mergeIntentCommentReadback(result, fallback);
  }
  if (intent.effectType === "hygiene_component") {
    const result = spawnSync("gh", ["issue", "view", String(intent.effect.issueNumber), "--repo", config.repositorySlug, "--json", "number,labels"], { cwd: config.repoRoot, encoding: "utf8", timeout: 20_000 });
    if (result.error || result.status !== 0) return { ...fallback, complete: false };
    try {
      const issue = JSON.parse(result.stdout || "{}");
      if (issue.number !== intent.effect.issueNumber) return { ...fallback, complete: true, ambiguous: true };
      return { ...fallback, complete: true, issueLabels: (issue.labels || []).map((label) => typeof label === "string" ? label : label.name).filter(Boolean) };
    } catch { return { ...fallback, complete: false }; }
  }
  return fallback;
}

function gitForIntent(config, intent, fallback) {
  if (intent.effectType !== "commit" || intent.status !== "prepared" || !fallback?.complete) return fallback;
  const unstagedAndUntracked = [...(fallback.unstagedPaths || []), ...(fallback.untrackedPaths || [])].sort();
  if (fallback.stagedPaths?.length > 0 || !sameStrings(intent.effect.stagedPaths, unstagedAndUntracked)) return fallback;
  const treeSha = intendedTreeFromWorktree(config, intent);
  return treeSha ? { ...fallback, stagedTreeSha: treeSha, stagedPaths: intent.effect.stagedPaths, unstagedPaths: [], untrackedPaths: [], untrackedClean: true } : fallback;
}

function intendedTreeFromWorktree(config, intent) {
  const parent = intent.effect.expectedParents?.[0];
  const paths = intent.effect.stagedPaths;
  if (!sha40(parent) || !Array.isArray(paths) || paths.length === 0) return null;
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-recovery-index-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(root, "index") };
  const run = (args) => spawnSync("git", args, { cwd: config.repoRoot, env, encoding: "utf8", timeout: 15_000 });
  try {
    const read = run(["read-tree", parent]);
    const add = run(["add", "--", ...paths]);
    const tree = run(["write-tree"]);
    if ([read, add, tree].some((entry) => entry.error || entry.status !== 0)) return null;
    return tree.stdout.trim() === intent.effect.treeSha ? tree.stdout.trim() : null;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function mergeIntentCommentReadback(result, fallback = {}) {
  return result?.complete === true && Array.isArray(result.comments)
    ? { ...fallback, complete: true, comments: result.comments }
    : { ...fallback, complete: false };
}

export function plannerInputsFromAuthoritativeEvidence(evidence) {
  if (!evidence?.ok) return { ok: false, reasonCode: evidence?.reasonCode || "authoritative_recovery_evidence_missing" };
  return {
    ok: true,
    interruption: evidence.interruption,
    liveEffects: {
      expectedIdentity: evidence.identity,
      mutationPresent: evidence.effects.sourceMutation.present,
      commitPresent: evidence.effects.commit.present || evidence.intents.some((intent) => intent.effectType === "commit" && ["effect_present_exact_adoptable", "effect_confirmed"].includes(intent.classification)),
      pushPresent: evidence.effects.push.present,
      mergePresent: evidence.effects.merge.present,
      commentPresent: evidence.effects.comment.present || evidence.effects.issueClosure.present || evidence.effects.hygiene.present,
    },
  };
}

function defaultProcessRead(config, identity) {
  const lockPath = path.join(config.logsRoot, "locks", "settleora-auto-runner.lock");
  if (!existsSync(lockPath)) return { complete: true, pid: null, ownerRunId: identity.runId, alive: false, source: "runner_lock_absent" };
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0) return { complete: false, source: "runner_lock" };
  if (lock.pid === process.pid && lock.runId && lock.runId !== identity.runId) return { complete: true, pid: lock.pid, ownerRunId: identity.runId, alive: false, source: "recovery_collector_owns_current_lock" };
  if (lock.runId && lock.runId !== identity.runId) return { complete: false, pid: lock.pid, ownerRunId: lock.runId, source: "runner_lock_identity_mismatch" };
  const alive = processAppearsActive(lock.pid);
  return { complete: typeof alive === "boolean", pid: lock.pid, ownerRunId: lock.runId || identity.runId, alive, source: "runner_lock_pid_probe" };
}

function defaultLeaseRead(config, identity, now) {
  if (!identity.supervisorRunId) return { complete: true, source: "supervisor_not_applicable", valid: false, runId: null, runnerRunId: identity.runId };
  const read = readHeartbeat(identity.supervisorRunId, config.logsRoot);
  if (!read.found || read.heartbeat?.runId !== identity.supervisorRunId || read.heartbeat?.runnerRunId !== identity.runId) return { complete: false, source: "supervisor_heartbeat", valid: null };
  const expiry = iso(read.heartbeat.leaseExpiresAt);
  return { complete: Boolean(expiry), runId: read.heartbeat.runId, runnerRunId: read.heartbeat.runnerRunId, heartbeatAt: iso(read.heartbeat.updatedAt), expiresAt: expiry, valid: Boolean(expiry) && Date.parse(expiry) >= now.getTime() && !read.heartbeat.terminal, source: "supervisor_heartbeat" };
}

function defaultGitRead(config, identity) {
  const run = (args) => spawnSync("git", args, { cwd: config.repoRoot, encoding: "utf8", timeout: 15_000 });
  const status = run(["status", "--porcelain=v2"]);
  const branch = run(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const head = run(["rev-parse", "HEAD"]);
  const commit = run(["show", "-s", "--format=%P%n%T%n%B", "HEAD"]);
  assertRepositoryRemoteIdentity(config);
  const remote = run(["ls-remote", "--exit-code", "origin", `refs/heads/${identity.branchName}`]);
  const staged = run(["diff", "--cached", "--name-only"]);
  const unstaged = run(["diff", "--name-only"]);
  const untracked = run(["ls-files", "--others", "--exclude-standard"]);
  const stagedTree = run(["write-tree"]);
  if (status.status !== 0 || branch.status !== 0 || head.status !== 0 || commit.status !== 0 || staged.status !== 0 || unstaged.status !== 0 || untracked.status !== 0 || stagedTree.status !== 0 || !sha40(head.stdout.trim()) || ![0, 2].includes(remote.status)) return { complete: false, source: "git_cli" };
  const lines = status.stdout.split("\n").filter(Boolean);
  const remoteHead = remote.status === 0 ? remote.stdout.trim().split(/\s+/)[0] : null;
  const [parents = "", treeSha = "", ...messageLines] = commit.stdout.replace(/\r\n/g, "\n").split("\n");
  return { complete: true, source: "git_cli", branchName: branch.stdout.trim(), baseSha: sha40(identity.baseSha), headSha: head.stdout.trim(), remoteHeadSha: sha40(remoteHead), worktreeClean: lines.length === 0, indexClean: !lines.some((line) => line.startsWith("1 ") || line.startsWith("2 ")), untrackedClean: !lines.some((line) => line.startsWith("? ")), untrackedPaths: paths(untracked.stdout), stagedTreeSha: sha40(stagedTree.stdout.trim()), stagedPaths: paths(staged.stdout), unstagedPaths: paths(unstaged.stdout), commit: { sha: head.stdout.trim(), parentShas: parents.split(/\s+/).filter(sha40), treeSha: sha40(treeSha), messageFingerprint: fingerprint(messageLines.join("\n").trimEnd()) } };
}

function defaultGithubRead(config, identity) {
  const issueResult = spawnSync("gh", ["issue", "view", String(identity.issueNumber), "--repo", config.repositorySlug, "--json", "number,state,stateReason"], { cwd: config.repoRoot, encoding: "utf8", timeout: 20_000 });
  if (issueResult.status !== 0) return { complete: false, source: "gh_cli" };
  const issue = JSON.parse(issueResult.stdout);
  const issueComments = readAllGithubComments(config, `repos/${config.repositorySlug}/issues/${identity.issueNumber}/comments?per_page=100`, { channel: "issue", targetNumber: identity.issueNumber });
  if (!issueComments.complete) return { complete: false, source: "gh_cli" };
  const discovered = identity.prNumber ? { complete: true, prNumber: identity.prNumber } : discoverExactRecoveryPr(config, identity);
  if (!discovered.complete) return { complete: false, source: discovered.source };
  if (!discovered.prNumber) return { complete: true, source: "gh_cli", pr: null, comments: issueComments.comments, issue: { number: issue.number, state: issue.state, stateReason: issue.stateReason }, checks: { state: "not_applicable", pending: 0, failed: 0 }, hygiene: [] };
  const prNumber = discovered.prNumber;
  const result = spawnSync("gh", ["pr", "view", String(prNumber), "--repo", config.repositorySlug, "--json", "number,state,baseRefName,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus,mergeCommit,statusCheckRollup"], { cwd: config.repoRoot, encoding: "utf8", timeout: 20_000 });
  if (result.status !== 0) return { complete: false, source: "gh_cli" };
  const pr = JSON.parse(result.stdout);
  const prComments = readAllGithubComments(config, `repos/${config.repositorySlug}/issues/${prNumber}/comments?per_page=100`, { channel: "pr_conversation", targetNumber: prNumber });
  const reviewComments = readAllGithubComments(config, `repos/${config.repositorySlug}/pulls/${prNumber}/comments?per_page=100`, { channel: "review", targetNumber: prNumber });
  if (!prComments.complete || !reviewComments.complete) return { complete: false, source: "gh_cli" };
  const comments = [...issueComments.comments, ...prComments.comments, ...reviewComments.comments];
  let mergeParentShas = [];
  if (pr.mergeCommit?.oid) {
    const mergeCommit = spawnSync("gh", ["api", `repos/${config.repositorySlug}/commits/${pr.mergeCommit.oid}`], { cwd: config.repoRoot, encoding: "utf8", timeout: 20_000 });
    if (mergeCommit.error || mergeCommit.status !== 0) return { complete: false, source: "gh_cli_merge_commit_read_failed" };
    try { mergeParentShas = JSON.parse(mergeCommit.stdout || "{}").parents?.map((parent) => parent.sha).filter(sha40).slice(0, 2) || []; }
    catch { return { complete: false, source: "gh_cli_merge_commit_parse_failed" }; }
  }
  return { complete: true, source: "gh_cli", pr: { number: pr.number, state: pr.state, baseRefName: pr.baseRefName, headRefName: pr.headRefName, headSha: pr.headRefOid, draft: pr.isDraft, mergeable: pr.mergeable, mergeStateStatus: pr.mergeStateStatus, mergeSha: pr.mergeCommit?.oid || null, mergeParentShas }, comments, issue: { number: issue.number, state: issue.state, stateReason: issue.stateReason }, checks: checks(pr.statusCheckRollup), hygiene: [] };
}

export function discoverExactRecoveryPr(config, identity, runner = spawnSync) {
  const result = runner("gh", ["pr", "list", "--repo", config.repositorySlug, "--head", identity.branchName, "--state", "all", "--limit", "100", "--json", "number,baseRefName,headRefName,headRefOid"], { cwd: config.repoRoot, encoding: "utf8", timeout: 20_000 });
  if (result.error || result.status !== 0) return { complete: false, source: "gh_cli_pr_discovery_failed" };
  try {
    const matches = JSON.parse(result.stdout || "[]").filter((pr) => pr.headRefName === identity.branchName && pr.headRefOid === identity.headSha && pr.baseRefName === identity.baseBranch);
    if (matches.length > 1) return { complete: false, source: "gh_cli_pr_discovery_ambiguous" };
    return { complete: true, prNumber: matches[0]?.number || null };
  } catch {
    return { complete: false, source: "gh_cli_pr_discovery_parse_failed" };
  }
}

function readAllGithubComments(config, endpoint, target = {}) {
  const result = spawnSync("gh", ["api", "--paginate", "--jq", ".[] | @json", endpoint], { cwd: config.repoRoot, encoding: "utf8", timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) return { complete: false, comments: [] };
  try {
    const comments = result.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    return { complete: true, comments: comments.map((comment) => commentIdentity(comment, target)) };
  } catch { return { complete: false, comments: [] }; }
}

function reconcileIdentity(identity, git, github, intents, contradictions, ambiguities) {
  if (!git || !github) return;
  const exactPendingCommit = intents.some((intent) => intent.effectType === "commit"
    && (intent.classification === "effect_present_exact_adoptable" || (intent.classification === "effect_confirmed" && intent.confirmedHeadMatches === true)));
  if (git.branchName !== identity.branchName || (identity.headSha && git.headSha !== identity.headSha && !exactPendingCommit)) contradictions.push("local_git_identity_mismatch");
  const discoveredCreatedPr = !identity.prNumber && intents.some((intent) => intent.effectType === "pr_create" && ["effect_present_exact_adoptable", "effect_confirmed"].includes(intent.classification));
  if (github.pr && ((!discoveredCreatedPr && github.pr.number !== identity.prNumber) || github.pr.headRefName !== identity.branchName || github.pr.baseRefName !== identity.baseBranch)) contradictions.push("github_pr_identity_mismatch");
  if (github.pr?.headSha && git.remoteHeadSha && github.pr.headSha !== git.remoteHeadSha) contradictions.push("github_remote_head_mismatch");
  const exactPreparedCommit = intents.some((intent) => intent.effectType === "commit" && intent.preparedWorktreeMatches === true);
  if ((!git.worktreeClean || !git.indexClean || !git.untrackedClean) && !exactPreparedCommit) ambiguities.push("local_worktree_not_clean");
}

function reconcileEffects(expected, git, github, identity, contradictions, ambiguities) {
  const effect = (present, identity = null) => ({ present: Boolean(present), adopted: Boolean(present), identity });
  const commitPresent = Boolean(expected.commitMarker === true && expected.commitSha && (git?.headSha === expected.commitSha || git?.commit?.sha === expected.commitSha));
  const pushPresent = Boolean(expected.pushSha && git?.remoteHeadSha === expected.pushSha);
  const prHeadPresent = Boolean(expected.prHeadSha && github?.pr?.headSha === expected.prHeadSha);
  const mergeIdentityMatches = github?.pr?.state === "MERGED"
    && github.pr.headSha === expected.mergedHeadSha
    && github.pr.mergeParentShas?.[0] === identity.baseSha
    && github.pr.mergeParentShas?.[1] === expected.mergedHeadSha;
  const mergePresent = Boolean(mergeIdentityMatches && (!expected.mergeSha || github.pr.mergeSha === expected.mergeSha));
  const expectedFingerprints = [expected.commentFingerprint, ...(expected.commentFingerprints || [])].filter(Boolean);
  const expectedCanonicalFingerprints = [expected.commentCanonicalFingerprint, ...(expected.commentCanonicalFingerprints || [])].filter(Boolean);
  const matchingComments = (github?.comments || []).filter((comment) => expectedFingerprints.includes(comment.fingerprint) || expectedCanonicalFingerprints.includes(comment.canonicalFingerprint));
  if ([...expectedFingerprints, ...expectedCanonicalFingerprints].some((fingerprint) => matchingComments.filter((comment) => comment.fingerprint === fingerprint || comment.canonicalFingerprint === fingerprint).length > 1)) ambiguities.push("duplicate_comment_fingerprint");
  const commentPresent = matchingComments.length === 1 || Boolean(expected.commentId && (github?.comments || []).some((c) => c.id === expected.commentId));
  const closureExpected = expected.issueClosed === true || expected.issueClosureMarker === true;
  const closurePresent = closureExpected
    && github?.issue?.state === "CLOSED"
    && (expected.issueClosureMarker !== true || github?.issue?.stateReason === "COMPLETED");
  const hygienePresent = expected.hygieneFingerprint && (github?.hygiene || []).includes(expected.hygieneFingerprint);
  for (const [name, marker, present] of [["commit", expected.commitMarker, commitPresent], ["push", expected.pushMarker, pushPresent], ["merge", expected.mergeMarker, mergePresent], ["comment", expected.commentMarker, commentPresent], ["issue_closure", expected.issueClosureMarker, closurePresent], ["hygiene", expected.hygieneMarker, hygienePresent]]) {
    if (marker === true && !present) contradictions.push(`${name}_marker_live_effect_absent`);
  }
  if (expected.commitSha && git?.headSha && !commitPresent && expected.commitMarker !== true) contradictions.push("commit_live_identity_mismatch");
  if (expected.pushSha && git?.remoteHeadSha && !pushPresent) contradictions.push("push_live_identity_mismatch");
  if (expected.prHeadSha && github?.pr?.headSha && !prHeadPresent) contradictions.push("pr_head_live_identity_mismatch");
  return { sourceMutation: effect(expected.sourceMutationPresent), commit: effect(commitPresent, expected.commitSha), push: effect(pushPresent, expected.pushSha), prHead: effect(prHeadPresent, expected.prHeadSha), merge: effect(mergePresent, expected.mergeSha || expected.mergedHeadSha), comment: effect(commentPresent, expected.commentId || matchingComments[0]?.id || expected.commentFingerprint), issueClosure: effect(closurePresent, identityIssue(expected)), hygiene: effect(hygienePresent, expected.hygieneFingerprint) };
}

function validateIdentity(config, value) {
  if (!value || value.repository !== config.repositorySlug || !Number.isSafeInteger(value.issueNumber) || !bounded(value.taskKey, 160) || !bounded(value.runId, 160) || !bounded(value.claimIdentity, 200) || !bounded(value.sessionId, 200) || !bounded(value.branchName, 240) || !sha40(value.baseSha) || !sha40(value.headSha) || !digest64(value.checkpointDigest) || value.checkpointValid !== true) return { ok: false, reasonCode: "authoritative_recovery_identity_incomplete" };
  return { ok: true };
}
function sanitizeIdentity(v) { return { repository: bounded(v.repository, 240), issueNumber: v.issueNumber, taskKey: bounded(v.taskKey, 160), runId: bounded(v.runId, 160), claimIdentity: bounded(v.claimIdentity, 200), sessionId: bounded(v.sessionId, 200), branchName: bounded(v.branchName, 240), baseBranch: bounded(v.baseBranch, 120), baseSha: sha40(v.baseSha), headSha: sha40(v.headSha), prNumber: Number.isSafeInteger(v.prNumber) ? v.prNumber : null, supervisorRunId: bounded(v.supervisorRunId, 120) } }
function sanitizeAuthority(v = {}) { return { ownerSessionId: bounded(v.ownerSessionId, 200), generation: Number.isSafeInteger(v.generation) ? v.generation : null, status: bounded(v.status, 40) }; }
function sanitizeProcess(v = {}) { return { complete: v.complete === true, pid: Number.isSafeInteger(v.pid) ? v.pid : null, ownerRunId: bounded(v.ownerRunId, 160), alive: typeof v.alive === "boolean" ? v.alive : null, source: bounded(v.source, 80) }; }
function sanitizeLease(v = {}) { return { complete: v.complete === true, runId: bounded(v.runId, 120), runnerRunId: bounded(v.runnerRunId, 160), heartbeatAt: iso(v.heartbeatAt), expiresAt: iso(v.expiresAt), valid: typeof v.valid === "boolean" ? v.valid : null, source: bounded(v.source, 80) }; }
function sanitizeGit(v = {}) { return { complete: v.complete === true, source: bounded(v.source, 80), branchName: bounded(v.branchName, 240), baseSha: sha40(v.baseSha), headSha: sha40(v.headSha), remoteHeadSha: sha40(v.remoteHeadSha), worktreeClean: v.worktreeClean === true, indexClean: v.indexClean === true, untrackedClean: v.untrackedClean === true, stagedTreeSha: sha40(v.stagedTreeSha), stagedPaths: Array.isArray(v.stagedPaths) ? v.stagedPaths.filter((value) => typeof value === "string").slice(0, 200) : [], unstagedPaths: Array.isArray(v.unstagedPaths) ? v.unstagedPaths.filter((value) => typeof value === "string").slice(0, 200) : [], untrackedPaths: Array.isArray(v.untrackedPaths) ? v.untrackedPaths.filter((value) => typeof value === "string").slice(0, 200) : [], commit: v.commit && { sha: sha40(v.commit.sha), treeSha: sha40(v.commit.treeSha), parentSha: sha40(v.commit.parentSha), parentShas: Array.isArray(v.commit.parentShas) ? v.commit.parentShas.filter(sha40).slice(0, 8) : [], messageFingerprint: digest64(v.commit.messageFingerprint) } }; }
function sanitizeGithub(v = {}, expected = {}) { const fingerprints = new Set([expected.commentFingerprint, ...(expected.commentFingerprints || [])].filter(digest64)); const canonicalFingerprints = new Set([expected.commentCanonicalFingerprint, ...(expected.commentCanonicalFingerprints || [])].filter(digest64)); const comments = Array.isArray(v.comments) ? v.comments.map((c) => ({ id: bounded(c.id, 120), fingerprint: digest64(c.fingerprint), canonicalFingerprint: digest64(c.canonicalFingerprint), channel: bounded(c.channel, 30), targetNumber: Number.isSafeInteger(c.targetNumber) ? c.targetNumber : null })).filter((c) => (expected.commentId && c.id === expected.commentId) || fingerprints.has(c.fingerprint) || canonicalFingerprints.has(c.canonicalFingerprint)).slice(0, 50) : []; return { complete: v.complete === true, source: bounded(v.source, 80), pr: v.pr ? { number: v.pr.number, state: bounded(v.pr.state, 20), baseRefName: bounded(v.pr.baseRefName, 120), headRefName: bounded(v.pr.headRefName, 240), headSha: sha40(v.pr.headSha), draft: v.pr.draft === true, mergeable: bounded(v.pr.mergeable, 40), mergeStateStatus: bounded(v.pr.mergeStateStatus, 40), mergeSha: sha40(v.pr.mergeSha), mergeParentShas: Array.isArray(v.pr.mergeParentShas) ? v.pr.mergeParentShas.filter(sha40).slice(0, 2) : [] } : null, comments, issue: v.issue ? { number: v.issue.number, state: bounded(v.issue.state, 20), stateReason: bounded(v.issue.stateReason, 20) } : null, checks: v.checks && { state: bounded(v.checks.state, 30), pending: Number.isSafeInteger(v.checks.pending) ? v.checks.pending : 0, failed: Number.isSafeInteger(v.checks.failed) ? v.checks.failed : 0 }, hygiene: Array.isArray(v.hygiene) ? v.hygiene.filter(digest64).slice(0, 50) : [] }; }
function commentIdentity(comment = {}, target = {}) { return { id: bounded(comment.id, 120), fingerprint: fingerprint(comment.body || ""), canonicalFingerprint: canonicalGithubEvidenceDigest(String(comment.body || "")), channel: bounded(target.channel, 30), targetNumber: Number.isSafeInteger(target.targetNumber) ? target.targetNumber : null }; }
function commentMatchesIntent(comment, intent) {
  const effect = intent.effect || {};
  const targetNumber = effect.issueNumber || effect.prNumber || intent.identity?.issueNumber || intent.identity?.prNumber;
  const channel = intent.effectType === "review_reply" ? "review"
    : ["review_trigger"].includes(intent.effectType) || (!effect.issueNumber && (effect.prNumber || intent.identity?.prNumber)) ? "pr_conversation"
      : "issue";
  return Number.isSafeInteger(targetNumber) && comment.targetNumber === targetNumber && comment.channel === channel;
}
function checks(values = []) { const states = values.map((v) => v.conclusion || v.status).filter(Boolean); return { state: states.some((s) => ["FAILURE", "ERROR", "CANCELLED"].includes(s)) ? "failed" : states.some((s) => ["IN_PROGRESS", "QUEUED", "PENDING"].includes(s)) ? "pending" : "passed", pending: states.filter((s) => ["IN_PROGRESS", "QUEUED", "PENDING"].includes(s)).length, failed: states.filter((s) => ["FAILURE", "ERROR", "CANCELLED"].includes(s)).length }; }
function failed(reasonCode, now, diagnostics, contradictions, ambiguities) { return { schemaVersion: authoritativeRecoveryEvidenceVersion, ok: false, reasonCode, collectedAt: now.toISOString(), diagnostics, contradictions, ambiguities, ambiguity: false, contradiction: false, takeoverAllowed: false, ownerBlocked: true }; }
function fingerprint(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function identityIssue(expected) { return Number.isSafeInteger(expected.issueNumber) ? expected.issueNumber : null; }
function paths(value) { return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean).sort(); }
function sameStrings(left, right) { return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]); }
function bounded(value, max) { return typeof value === "string" && value.length ? value.slice(0, max) : null; }
function sha40(value) { return /^[a-f0-9]{40}$/.test(String(value || "")) ? value : null; }
function digest64(value) { return /^[a-f0-9]{64}$/.test(String(value || "")) ? value : null; }
function iso(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
