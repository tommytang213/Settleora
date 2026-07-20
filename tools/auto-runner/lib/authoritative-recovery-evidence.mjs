import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { processAppearsActive } from "./state-store.mjs";
import { readHeartbeat } from "../supervisor/heartbeat.mjs";

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
  try { githubRead = sanitizeGithub(readGithub()); } catch { diagnostics.push("github_read_failed"); }
  if (!processRead?.complete) diagnostics.push("process_identity_or_liveness_incomplete");
  if (!leaseRead?.complete) diagnostics.push("lease_identity_or_liveness_incomplete");
  if (!gitRead?.complete) diagnostics.push("git_readback_incomplete");
  if (!githubRead?.complete) diagnostics.push("github_readback_incomplete");
  if (processRead?.alive === true && leaseRead?.valid === false) contradictions.push("live_process_stale_lease");
  if (processRead?.alive === false && leaseRead?.valid === true) contradictions.push("dead_process_valid_lease");
  reconcileIdentity(identity, gitRead, githubRead, contradictions, ambiguities);
  const effects = reconcileEffects(expected, gitRead, githubRead, contradictions, ambiguities);
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

export function plannerInputsFromAuthoritativeEvidence(evidence) {
  if (!evidence?.ok) return { ok: false, reasonCode: evidence?.reasonCode || "authoritative_recovery_evidence_missing" };
  return {
    ok: true,
    interruption: evidence.interruption,
    liveEffects: {
      expectedIdentity: evidence.identity,
      mutationPresent: evidence.effects.sourceMutation.present,
      commitPresent: evidence.effects.commit.present,
      pushPresent: evidence.effects.push.present,
      mergePresent: evidence.effects.merge.present,
      commentPresent: evidence.effects.comment.present || evidence.effects.issueClosure.present || evidence.effects.hygiene.present,
    },
  };
}

function defaultProcessRead(config, identity) {
  const lockPath = path.join(config.logsRoot, "locks", "settleora-auto-runner.lock");
  if (!existsSync(lockPath)) return { complete: false, pid: identity.ownerPid || null, ownerRunId: identity.runId, alive: null, source: "runner_lock_absent" };
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0) return { complete: false, source: "runner_lock" };
  if (lock.runId && lock.runId !== identity.runId) return { complete: false, pid: lock.pid, ownerRunId: lock.runId, source: "runner_lock_identity_mismatch" };
  const alive = processAppearsActive(lock.pid);
  return { complete: typeof alive === "boolean", pid: lock.pid, ownerRunId: lock.runId || identity.runId, alive, source: "runner_lock_pid_probe" };
}

function defaultLeaseRead(config, identity, now) {
  if (!identity.supervisorRunId) return { complete: false, source: "supervisor_heartbeat", valid: null };
  const read = readHeartbeat(identity.supervisorRunId, config.logsRoot);
  if (!read.found || read.heartbeat?.runId !== identity.supervisorRunId) return { complete: false, source: "supervisor_heartbeat", valid: null };
  const expiry = iso(read.heartbeat.leaseExpiresAt);
  return { complete: Boolean(expiry), runId: read.heartbeat.runId, heartbeatAt: iso(read.heartbeat.updatedAt), expiresAt: expiry, valid: Boolean(expiry) && Date.parse(expiry) >= now.getTime() && !read.heartbeat.terminal, source: "supervisor_heartbeat" };
}

function defaultGitRead(config, identity) {
  const run = (args) => spawnSync("git", args, { cwd: config.repoRoot, encoding: "utf8", timeout: 15_000 });
  const status = run(["status", "--porcelain=v2"]);
  const head = run(["rev-parse", "HEAD"]);
  const remote = run(["ls-remote", "--exit-code", "origin", `refs/heads/${identity.branchName}`]);
  if (status.status !== 0 || head.status !== 0 || !sha40(head.stdout.trim()) || ![0, 2].includes(remote.status)) return { complete: false, source: "git_cli" };
  const lines = status.stdout.split("\n").filter(Boolean);
  const remoteHead = remote.status === 0 ? remote.stdout.trim().split(/\s+/)[0] : null;
  return { complete: true, source: "git_cli", branchName: identity.branchName, baseSha: sha40(identity.baseSha), headSha: head.stdout.trim(), remoteHeadSha: sha40(remoteHead), worktreeClean: lines.length === 0, indexClean: !lines.some((line) => line.startsWith("1 ") || line.startsWith("2 ")), untrackedClean: !lines.some((line) => line.startsWith("? ")), commit: null };
}

function defaultGithubRead(config, identity) {
  const issueResult = spawnSync("gh", ["issue", "view", String(identity.issueNumber), "--repo", config.repositorySlug, "--json", "number,state,comments"], { cwd: config.repoRoot, encoding: "utf8", timeout: 20_000 });
  if (issueResult.status !== 0) return { complete: false, source: "gh_cli" };
  const issue = JSON.parse(issueResult.stdout);
  if (!identity.prNumber) return { complete: true, source: "gh_cli", pr: null, comments: (issue.comments || []).map((c) => ({ id: bounded(c.id, 120), fingerprint: fingerprint(c.body || "") })).slice(0, 200), issue: { number: issue.number, state: issue.state }, checks: { state: "not_applicable", pending: 0, failed: 0 }, hygiene: [] };
  const result = spawnSync("gh", ["pr", "view", String(identity.prNumber), "--repo", config.repositorySlug, "--json", "number,state,baseRefName,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus,mergeCommit,statusCheckRollup,comments"], { cwd: config.repoRoot, encoding: "utf8", timeout: 20_000 });
  if (result.status !== 0) return { complete: false, source: "gh_cli" };
  const pr = JSON.parse(result.stdout);
  const comments = [...(issue.comments || []), ...(pr.comments || [])].map((c) => ({ id: bounded(c.id, 120), fingerprint: fingerprint(c.body || "") })).slice(0, 200);
  return { complete: true, source: "gh_cli", pr: { number: pr.number, state: pr.state, baseRefName: pr.baseRefName, headRefName: pr.headRefName, headSha: pr.headRefOid, draft: pr.isDraft, mergeable: pr.mergeable, mergeStateStatus: pr.mergeStateStatus, mergeSha: pr.mergeCommit?.oid || null }, comments, issue: { number: issue.number, state: issue.state }, checks: checks(pr.statusCheckRollup), hygiene: [] };
}

function reconcileIdentity(identity, git, github, contradictions, ambiguities) {
  if (!git || !github) return;
  if (git.branchName !== identity.branchName || (identity.headSha && git.headSha !== identity.headSha)) contradictions.push("local_git_identity_mismatch");
  if (github.pr && (github.pr.number !== identity.prNumber || github.pr.headRefName !== identity.branchName || github.pr.baseRefName !== identity.baseBranch)) contradictions.push("github_pr_identity_mismatch");
  if (github.pr?.headSha && git.remoteHeadSha && github.pr.headSha !== git.remoteHeadSha) contradictions.push("github_remote_head_mismatch");
  if (!git.worktreeClean || !git.indexClean || !git.untrackedClean) ambiguities.push("local_worktree_not_clean");
}

function reconcileEffects(expected, git, github, contradictions, ambiguities) {
  const effect = (present, identity = null) => ({ present: Boolean(present), adopted: Boolean(present), identity });
  const commitPresent = Boolean(expected.commitSha && (git?.headSha === expected.commitSha || git?.commit?.sha === expected.commitSha));
  const pushPresent = Boolean(expected.pushSha && git?.remoteHeadSha === expected.pushSha);
  const prHeadPresent = Boolean(expected.prHeadSha && github?.pr?.headSha === expected.prHeadSha);
  const mergePresent = Boolean(expected.mergeSha ? github?.pr?.mergeSha === expected.mergeSha : expected.mergedHeadSha && github?.pr?.state === "MERGED" && github?.pr?.headSha === expected.mergedHeadSha);
  const matchingComments = expected.commentFingerprint ? (github?.comments || []).filter((c) => c.fingerprint === expected.commentFingerprint) : [];
  if (matchingComments.length > 1) ambiguities.push("duplicate_comment_fingerprint");
  const commentPresent = matchingComments.length === 1 || Boolean(expected.commentId && (github?.comments || []).some((c) => c.id === expected.commentId));
  const closurePresent = expected.issueClosed === true && github?.issue?.state === "CLOSED";
  const hygienePresent = expected.hygieneFingerprint && (github?.hygiene || []).includes(expected.hygieneFingerprint);
  for (const [name, marker, present] of [["commit", expected.commitMarker, commitPresent], ["push", expected.pushMarker, pushPresent], ["merge", expected.mergeMarker, mergePresent], ["comment", expected.commentMarker, commentPresent], ["issue_closure", expected.issueClosureMarker, closurePresent], ["hygiene", expected.hygieneMarker, hygienePresent]]) {
    if (marker === true && !present) contradictions.push(`${name}_marker_live_effect_absent`);
  }
  if (expected.commitSha && git?.headSha && !commitPresent && expected.commitMarker !== true) contradictions.push("commit_live_identity_mismatch");
  if (expected.pushSha && git?.remoteHeadSha && !pushPresent) contradictions.push("push_live_identity_mismatch");
  if (expected.prHeadSha && github?.pr?.headSha && !prHeadPresent) contradictions.push("pr_head_live_identity_mismatch");
  return { sourceMutation: effect(expected.sourceMutationPresent), commit: effect(commitPresent, expected.commitSha), push: effect(pushPresent, expected.pushSha), prHead: effect(prHeadPresent, expected.prHeadSha), merge: effect(mergePresent, expected.mergeSha || expected.mergedHeadSha), comment: effect(commentPresent, expected.commentId || expected.commentFingerprint), issueClosure: effect(closurePresent, identityIssue(expected)), hygiene: effect(hygienePresent, expected.hygieneFingerprint) };
}

function validateIdentity(config, value) {
  if (!value || value.repository !== config.repositorySlug || !Number.isSafeInteger(value.issueNumber) || !bounded(value.taskKey, 160) || !bounded(value.runId, 160) || !bounded(value.claimIdentity, 200) || !bounded(value.sessionId, 200) || !bounded(value.branchName, 240) || !sha40(value.baseSha) || !sha40(value.headSha) || !digest64(value.checkpointDigest) || value.checkpointValid !== true) return { ok: false, reasonCode: "authoritative_recovery_identity_incomplete" };
  return { ok: true };
}
function sanitizeIdentity(v) { return { repository: bounded(v.repository, 240), issueNumber: v.issueNumber, taskKey: bounded(v.taskKey, 160), runId: bounded(v.runId, 160), claimIdentity: bounded(v.claimIdentity, 200), sessionId: bounded(v.sessionId, 200), branchName: bounded(v.branchName, 240), baseBranch: bounded(v.baseBranch, 120), baseSha: sha40(v.baseSha), headSha: sha40(v.headSha), prNumber: Number.isSafeInteger(v.prNumber) ? v.prNumber : null, supervisorRunId: bounded(v.supervisorRunId, 120) } }
function sanitizeAuthority(v = {}) { return { ownerSessionId: bounded(v.ownerSessionId, 200), generation: Number.isSafeInteger(v.generation) ? v.generation : null, status: bounded(v.status, 40) }; }
function sanitizeProcess(v = {}) { return { complete: v.complete === true, pid: Number.isSafeInteger(v.pid) ? v.pid : null, ownerRunId: bounded(v.ownerRunId, 160), alive: typeof v.alive === "boolean" ? v.alive : null, source: bounded(v.source, 80) }; }
function sanitizeLease(v = {}) { return { complete: v.complete === true, runId: bounded(v.runId, 120), heartbeatAt: iso(v.heartbeatAt), expiresAt: iso(v.expiresAt), valid: typeof v.valid === "boolean" ? v.valid : null, source: bounded(v.source, 80) }; }
function sanitizeGit(v = {}) { return { complete: v.complete === true, source: bounded(v.source, 80), branchName: bounded(v.branchName, 240), baseSha: sha40(v.baseSha), headSha: sha40(v.headSha), remoteHeadSha: sha40(v.remoteHeadSha), worktreeClean: v.worktreeClean === true, indexClean: v.indexClean === true, untrackedClean: v.untrackedClean === true, commit: v.commit && { sha: sha40(v.commit.sha), treeSha: sha40(v.commit.treeSha), parentSha: sha40(v.commit.parentSha), messageFingerprint: digest64(v.commit.messageFingerprint) } }; }
function sanitizeGithub(v = {}) { return { complete: v.complete === true, source: bounded(v.source, 80), pr: v.pr ? { number: v.pr.number, state: bounded(v.pr.state, 20), baseRefName: bounded(v.pr.baseRefName, 120), headRefName: bounded(v.pr.headRefName, 240), headSha: sha40(v.pr.headSha), draft: v.pr.draft === true, mergeable: bounded(v.pr.mergeable, 40), mergeStateStatus: bounded(v.pr.mergeStateStatus, 40), mergeSha: sha40(v.pr.mergeSha) } : null, comments: Array.isArray(v.comments) ? v.comments.map((c) => ({ id: bounded(c.id, 120), fingerprint: digest64(c.fingerprint) })).slice(0, 200) : [], issue: v.issue ? { number: v.issue.number, state: bounded(v.issue.state, 20) } : null, checks: v.checks && { state: bounded(v.checks.state, 30), pending: Number.isSafeInteger(v.checks.pending) ? v.checks.pending : 0, failed: Number.isSafeInteger(v.checks.failed) ? v.checks.failed : 0 }, hygiene: Array.isArray(v.hygiene) ? v.hygiene.filter(digest64).slice(0, 50) : [] }; }
function checks(values = []) { const states = values.map((v) => v.conclusion || v.status).filter(Boolean); return { state: states.some((s) => ["FAILURE", "ERROR", "CANCELLED"].includes(s)) ? "failed" : states.some((s) => ["IN_PROGRESS", "QUEUED", "PENDING"].includes(s)) ? "pending" : "passed", pending: states.filter((s) => ["IN_PROGRESS", "QUEUED", "PENDING"].includes(s)).length, failed: states.filter((s) => ["FAILURE", "ERROR", "CANCELLED"].includes(s)).length }; }
function failed(reasonCode, now, diagnostics, contradictions, ambiguities) { return { schemaVersion: authoritativeRecoveryEvidenceVersion, ok: false, reasonCode, collectedAt: now.toISOString(), diagnostics, contradictions, ambiguities, ambiguity: false, contradiction: false, takeoverAllowed: false, ownerBlocked: true }; }
function fingerprint(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function identityIssue(expected) { return Number.isSafeInteger(expected.issueNumber) ? expected.issueNumber : null; }
function bounded(value, max) { return typeof value === "string" && value.length ? value.slice(0, max) : null; }
function sha40(value) { return /^[a-f0-9]{40}$/.test(String(value || "")) ? value : null; }
function digest64(value) { return /^[a-f0-9]{64}$/.test(String(value || "")) ? value : null; }
function iso(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
