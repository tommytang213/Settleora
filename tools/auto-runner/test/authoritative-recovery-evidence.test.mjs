import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { collectAuthoritativeRecoveryEvidence, discoverExactRecoveryPr, mergeIntentCommentReadback, plannerInputsFromAuthoritativeEvidence } from "../lib/authoritative-recovery-evidence.mjs";
import { preparePreEffectIntent } from "../lib/pre-effect-intent.mjs";

const sha = "a".repeat(40);
const base = "b".repeat(40);
const digest = "c".repeat(64);
const commentFingerprint = "d".repeat(64);
const config = { repositorySlug: "owner/repo", repoRoot: "/not-used", logsRoot: "/not-used" };
const identity = { repository: "owner/repo", issueNumber: 928, taskKey: "20260720-2213", runId: "run-1", claimIdentity: "claim-1", sessionId: "session-1", supervisorRunId: "supervised-20260720T120000Z-aaaaaaaaaaaa", branchName: "feature/recovery", baseBranch: "main", baseSha: base, headSha: sha, prNumber: 42, checkpointDigest: digest, checkpointValid: true, authority: { ownerSessionId: "session-1", generation: 3, status: "active" } };
function adapters({ alive = false, leaseValid = false, git = {}, github = {} } = {}) {
  return {
    now: new Date("2026-07-20T14:00:00Z"),
    readProcess: () => ({ complete: true, pid: 123, ownerRunId: "run-1", alive, source: "fixture_pid_probe" }),
    readLease: () => ({ complete: true, runId: identity.supervisorRunId, runnerRunId: identity.runId, heartbeatAt: "2026-07-20T13:59:00Z", expiresAt: leaseValid ? "2026-07-20T14:05:00Z" : "2026-07-20T13:55:00Z", valid: leaseValid, source: "fixture_heartbeat" }),
    readGit: () => ({ complete: true, source: "fixture_git", branchName: identity.branchName, baseSha: base, headSha: sha, remoteHeadSha: sha, worktreeClean: true, indexClean: true, untrackedClean: true, ...git }),
    readGithub: () => ({ complete: true, source: "fixture_github", pr: { number: 42, state: "OPEN", baseRefName: "main", headRefName: identity.branchName, headSha: sha, draft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", mergeSha: null }, comments: [], issue: { number: 928, state: "OPEN" }, checks: { state: "passed", pending: 0, failed: 0 }, hygiene: [], ...github }),
  };
}
function collect(options = {}, expected = {}) { return collectAuthoritativeRecoveryEvidence(config, identity, expected, adapters(options)); }

test("live process and valid lease block takeover", () => { const e = collect({ alive: true, leaseValid: true }); assert.equal(e.ok, true); assert.equal(e.ownerBlocked, true); assert.equal(e.takeoverAllowed, false); });
test("live process and stale lease fail closed", () => { const e = collect({ alive: true, leaseValid: false }); assert.equal(e.ok, false); assert.equal(e.contradiction, true); });
test("dead process and valid lease fail closed and block", () => { const e = collect({ alive: false, leaseValid: true }); assert.equal(e.ok, false); assert.equal(e.ownerBlocked, true); });
test("dead process and stale lease permit one takeover", () => { const e = collect(); assert.equal(e.ok, true); assert.equal(e.takeoverAllowed, true); assert.equal(plannerInputsFromAuthoritativeEvidence(e).interruption.processExited, true); });
test("exact reconciled push intent is a live push effect for planning", () => {
  const e = collect();
  e.effects.push.present = false;
  e.intents.push({ effectType: "push", classification: "effect_present_exact_adoptable" });
  assert.equal(plannerInputsFromAuthoritativeEvidence(e).liveEffects.pushPresent, true);
});
test("missing process identity fails closed", () => { const a = adapters(); a.readProcess = () => ({ complete: false }); assert.equal(collectAuthoritativeRecoveryEvidence(config, identity, {}, a).ok, false); });
test("authoritative absent runner lock plus expired lease proves inactive owner", () => { const logsRoot = mkdtempSync(path.join(tmpdir(), "recovery-no-lock-")); const a = adapters(); delete a.readProcess; const e = collectAuthoritativeRecoveryEvidence({ ...config, logsRoot }, identity, {}, a); assert.equal(e.ok, true); assert.equal(e.process.source, "runner_lock_absent"); assert.equal(e.takeoverAllowed, true); });
test("missing lease identity fails closed", () => { const a = adapters(); a.readLease = () => ({ complete: false }); assert.equal(collectAuthoritativeRecoveryEvidence(config, identity, {}, a).ok, false); });
test("direct runner recovery treats a supervisor lease as non-applicable", () => { const a = adapters(); delete a.readLease; const direct = { ...identity, supervisorRunId: undefined }; const e = collectAuthoritativeRecoveryEvidence(config, direct, {}, a); assert.equal(e.ok, true); assert.equal(e.lease.source, "supervisor_not_applicable"); assert.equal(e.takeoverAllowed, true); });
test("stale report text is not an evidence input", () => { const e = collect({}, { reportText: "IN_PROGRESS" }); assert.equal(e.takeoverAllowed, true); assert.equal(JSON.stringify(e).includes("IN_PROGRESS"), false); });
test("repeated evidence collection is idempotent", () => { const one = collect(); const two = collect(); assert.deepEqual({ ...one, collectedAt: null }, { ...two, collectedAt: null }); });
test("retired authority identity is preserved and never revived", () => { const retired = { ...identity, authority: { ownerSessionId: null, generation: 4, status: "recovery_pending" } }; const e = collectAuthoritativeRecoveryEvidence(config, retired, {}, adapters()); assert.equal(e.authority.ownerSessionId, null); assert.equal(e.authority.generation, 4); });
test("commit evidence requires its durable checkpoint marker", () => { const absent = collect({}, { commitSha: sha }); assert.equal(absent.effects.commit.present, false); const confirmed = collect({}, { commitSha: sha, commitMarker: true }); assert.equal(confirmed.effects.commit.present, true); });
test("exact pending commit permits post-commit pre-checkpoint head recovery", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "recovery-commit-window-"));
  const newHead = "e".repeat(40);
  const treeSha = "f".repeat(40);
  const messageDigest = createHash("sha256").update("commit message").digest("hex");
  const intent = preparePreEffectIntent({ logsRoot }, { repository: identity.repository, sourceTaskKey: identity.taskKey, runId: identity.runId, logicalTaskIdentity: identity.claimIdentity, sessionId: identity.sessionId, authorityGeneration: 3, effectType: "commit", branchName: identity.branchName, baseSha: identity.baseSha, headSha: identity.headSha, effect: { expectedParents: [sha], treeSha, stagedPaths: ["a.txt"], messageDigest } }, { intentId: "commit-window" });
  const e = collectAuthoritativeRecoveryEvidence({ ...config, logsRoot }, identity, { preEffectIntentIds: [intent.intentId] }, adapters({ git: { headSha: newHead, commit: { sha: newHead, parentShas: [sha], treeSha, messageFingerprint: messageDigest } } }));
  assert.equal(e.ok, true);
  assert.equal(e.intents[0].classification, "effect_present_exact_adoptable");
});
test("exact prepared commit intent permits only its matching staged index", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "recovery-staged-commit-"));
  const treeSha = "f".repeat(40);
  const intent = preparePreEffectIntent({ logsRoot }, { repository: identity.repository, sourceTaskKey: identity.taskKey, runId: identity.runId, logicalTaskIdentity: identity.claimIdentity, sessionId: identity.sessionId, authorityGeneration: 3, effectType: "commit", branchName: identity.branchName, baseSha: identity.baseSha, headSha: identity.headSha, effect: { expectedParents: [sha], treeSha, stagedPaths: ["a.txt"], messageDigest: createHash("sha256").update("commit message").digest("hex") } }, { intentId: "staged-window" });
  const matching = collectAuthoritativeRecoveryEvidence({ ...config, logsRoot }, identity, { preEffectIntentIds: [intent.intentId] }, adapters({ git: { worktreeClean: false, indexClean: false, stagedTreeSha: treeSha, stagedPaths: ["a.txt"], unstagedPaths: [], untrackedClean: true } }));
  assert.equal(matching.ok, true);
  const unrelated = collectAuthoritativeRecoveryEvidence({ ...config, logsRoot }, identity, { preEffectIntentIds: [intent.intentId] }, adapters({ git: { worktreeClean: false, indexClean: false, stagedTreeSha: treeSha, stagedPaths: ["a.txt"], unstagedPaths: ["other.txt"], untrackedClean: true } }));
  assert.equal(unrelated.ok, false);
});
test("authoritative Git evidence preserves bounded untracked paths for prepared commit recovery", () => {
  const untrackedPaths = ["new-file.txt", ...Array.from({ length: 205 }, (_value, index) => `extra-${index}.txt`)];
  const e = collect({ git: { worktreeClean: false, untrackedClean: false, untrackedPaths } });
  assert.deepEqual(e.git.untrackedPaths, untrackedPaths.slice(0, 200));
  assert.equal(e.git.untrackedPaths.includes("new-file.txt"), true);
});
test("reconstructed prepared commit evidence permits its exact dirty worktree", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "recovery-untracked-repo-"));
  const logsRoot = mkdtempSync(path.join(tmpdir(), "recovery-untracked-logs-"));
  const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Settleora Test");
  git("config", "user.email", "test@example.invalid");
  writeFileSync(path.join(repoRoot, "tracked.txt"), "before\n");
  git("add", "tracked.txt");
  git("commit", "-qm", "base");
  const parent = git("rev-parse", "HEAD");
  writeFileSync(path.join(repoRoot, "tracked.txt"), "after\n");
  writeFileSync(path.join(repoRoot, "new.txt"), "new\n");
  git("add", "tracked.txt", "new.txt");
  const treeSha = git("write-tree");
  git("reset", "-q");
  const localIdentity = { ...identity, baseSha: parent, headSha: parent };
  const intent = preparePreEffectIntent({ logsRoot }, { repository: localIdentity.repository, sourceTaskKey: localIdentity.taskKey, runId: localIdentity.runId, logicalTaskIdentity: localIdentity.claimIdentity, sessionId: localIdentity.sessionId, authorityGeneration: 3, effectType: "commit", branchName: localIdentity.branchName, baseSha: parent, headSha: parent, effect: { expectedParents: [parent], treeSha, stagedPaths: ["new.txt", "tracked.txt"], messageDigest: createHash("sha256").update("commit message").digest("hex") } }, { intentId: "untracked-window" });
  const a = adapters();
  a.readGit = () => ({ complete: true, source: "fixture_git", branchName: localIdentity.branchName, baseSha: parent, headSha: parent, remoteHeadSha: parent, worktreeClean: false, indexClean: true, untrackedClean: false, stagedPaths: [], unstagedPaths: ["tracked.txt"], untrackedPaths: ["new.txt"] });
  a.readGithub = () => ({ complete: true, source: "fixture_github", pr: { number: 42, state: "OPEN", baseRefName: "main", headRefName: localIdentity.branchName, headSha: parent, draft: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" }, comments: [], issue: { number: 928, state: "OPEN" }, checks: { state: "passed", pending: 0, failed: 0 }, hygiene: [] });
  const e = collectAuthoritativeRecoveryEvidence({ ...config, repoRoot, logsRoot }, localIdentity, { preEffectIntentIds: [intent.intentId] }, a);
  assert.equal(e.ok, true);
  assert.equal(e.intents[0].preparedWorktreeMatches, true);
});
test("push succeeded before marker write is adopted", () => { const e = collect({}, { pushSha: sha }); assert.equal(e.effects.push.present, true); });
test("PR head already updated is adopted", () => { const e = collect({}, { prHeadSha: sha }); assert.equal(e.effects.prHead.present, true); });
test("PR recovery discovers one exact branch head and rejects ambiguity", () => {
  const exact = { number: 938, baseRefName: identity.baseBranch, headRefName: identity.branchName, headRefOid: identity.headSha };
  const runner = (_command, _args) => ({ status: 0, stdout: JSON.stringify([exact, { ...exact, number: 917, headRefOid: base }]) });
  assert.deepEqual(discoverExactRecoveryPr(config, { ...identity, prNumber: null }, runner), { complete: true, prNumber: 938 });
  const ambiguous = (_command, _args) => ({ status: 0, stdout: JSON.stringify([exact, { ...exact, number: 939 }]) });
  assert.equal(discoverExactRecoveryPr(config, { ...identity, prNumber: null }, ambiguous).complete, false);
});
test("merge succeeded before marker write resumes only with exact base and head parents", () => { const pr = { number: 42, state: "MERGED", baseRefName: "main", headRefName: identity.branchName, headSha: sha, draft: false, mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN", mergeSha: base, mergeParentShas: [identity.baseSha, sha] }; const e = collect({ github: { pr } }, { mergeSha: base, mergedHeadSha: sha }); assert.equal(e.effects.merge.present, true); const wrong = collect({ github: { pr: { ...pr, mergeParentShas: ["f".repeat(40), sha] } } }, { mergeSha: base, mergedHeadSha: sha }); assert.equal(wrong.effects.merge.present, false); });
test("comment fingerprint adopts one exact comment", () => { const e = collect({ github: { comments: [{ id: "C1", fingerprint: commentFingerprint, channel: "issue", targetNumber: 928 }] } }, { commentFingerprint }); assert.equal(e.effects.comment.present, true); });
test("comment reconciliation searches evidence beyond the former 200-comment prefix", () => { const comments = Array.from({ length: 250 }, (_, index) => ({ id: `C${index}`, fingerprint: index === 249 ? commentFingerprint : `${index}`.padStart(64, "0"), channel: "issue", targetNumber: 928 })); const e = collect({ github: { comments } }, { commentFingerprint }); assert.equal(e.effects.comment.present, true); });
test("intent-targeted comment readback maps the paginated comments payload", () => {
  const comments = [{ id: "C1", fingerprint: commentFingerprint }];
  assert.deepEqual(mergeIntentCommentReadback({ complete: true, comments }, { source: "fallback" }), { source: "fallback", complete: true, comments });
  assert.equal(mergeIntentCommentReadback({ complete: false, comments: [] }, { source: "fallback" }).complete, false);
});
test("durable comment intent cannot adopt an identical comment from another target or channel", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "recovery-comment-target-"));
  const bodyDigest = "e".repeat(64);
  const intent = preparePreEffectIntent({ logsRoot }, { repository: identity.repository, sourceTaskKey: identity.taskKey, runId: identity.runId, logicalTaskIdentity: identity.claimIdentity, sessionId: identity.sessionId, authorityGeneration: 3, effectType: "issue_progress_comment", issueNumber: 928, branchName: identity.branchName, baseSha: identity.baseSha, headSha: identity.headSha, effect: { issueNumber: 928, bodyDigest } }, { intentId: "comment-target" });
  const expected = { preEffectIntentIds: [intent.intentId], commentCanonicalFingerprints: [bodyDigest] };
  const copied = collectAuthoritativeRecoveryEvidence({ ...config, logsRoot }, identity, expected, adapters({ github: { comments: [{ id: "C1", canonicalFingerprint: bodyDigest, channel: "pr_conversation", targetNumber: 42 }] } }));
  assert.equal(copied.intents[0].classification, "effect_absent_safe_to_execute");
  const exact = collectAuthoritativeRecoveryEvidence({ ...config, logsRoot }, identity, expected, adapters({ github: { comments: [{ id: "C2", canonicalFingerprint: bodyDigest, channel: "issue", targetNumber: 928 }] } }));
  assert.equal(exact.intents[0].classification, "effect_present_exact_adoptable");
});
test("duplicate matching comments fail closed", () => { const e = collect({ github: { comments: [{ id: "C1", fingerprint: commentFingerprint }, { id: "C2", fingerprint: commentFingerprint }] } }, { commentFingerprint }); assert.equal(e.ok, false); assert.equal(e.ambiguity, true); });
test("already closed issue is adopted", () => { const e = collect({ github: { issue: { number: 928, state: "CLOSED" } } }, { issueClosed: true, issueNumber: 928 }); assert.equal(e.effects.issueClosure.present, true); });
test("closure marker adopts only authoritative completed issue closure", () => {
  const completed = collect({ github: { issue: { number: 928, state: "CLOSED", stateReason: "COMPLETED" } } }, { issueClosureMarker: true, issueNumber: 928 });
  assert.equal(completed.effects.issueClosure.present, true);
  const notPlanned = collect({ github: { issue: { number: 928, state: "CLOSED", stateReason: "NOT_PLANNED" } } }, { issueClosureMarker: true, issueNumber: 928 });
  assert.equal(notPlanned.ok, false);
  assert.ok(notPlanned.contradictions.includes("issue_closure_marker_live_effect_absent"));
});
test("existing hygiene identity is reused", () => { const e = collect({ github: { hygiene: [digest] } }, { hygieneFingerprint: digest }); assert.equal(e.effects.hygiene.present, true); });
test("pending checks remain pending evidence", () => { const e = collect({ github: { checks: { state: "pending", pending: 2, failed: 0 } } }); assert.equal(e.pendingChecks.state, "pending"); });
test("failed checks remain failed without changing counters", () => { const e = collect({ github: { checks: { state: "failed", pending: 0, failed: 1 } } }); assert.equal(e.pendingChecks.state, "failed"); assert.equal(Object.hasOwn(e, "controller"), false); });
test("durable marker with absent live effect fails closed", () => { const e = collect({}, { mergeMarker: true, mergeSha: base }); assert.equal(e.ok, false); assert.ok(e.contradictions.includes("merge_marker_live_effect_absent")); });
test("wrong live head fails closed", () => { const e = collect({ github: { pr: { number: 42, state: "OPEN", baseRefName: "main", headRefName: identity.branchName, headSha: base } } }, { prHeadSha: sha }); assert.equal(e.ok, false); });
test("partial GitHub readback fails closed without mutation", () => { const a = adapters(); a.readGithub = () => ({ complete: false }); const e = collectAuthoritativeRecoveryEvidence(config, identity, {}, a); assert.equal(e.ok, false); assert.equal(e.takeoverAllowed, false); });
test("incomplete logical identity fails closed", () => { const e = collectAuthoritativeRecoveryEvidence(config, { ...identity, claimIdentity: null }, {}, adapters()); assert.equal(e.ok, false); });
test("canonical evidence excludes commands prompts tokens and provider payloads", () => { const e = collect({}, { prompt: "secret", token: "secret", rawProviderPayload: "secret" }); const json = JSON.stringify(e); assert.equal(json.includes("secret"), false); assert.equal(json.includes("rawProviderPayload"), false); });
