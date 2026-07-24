import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { listRecoverableRecoveryStates } from "./recovery-state.mjs";
import { loadSessionLifecycleForRecovery } from "./session-lifecycle.mjs";
import { loadLogicalTaskBudget } from "./logical-task-budget.mjs";
import { findPreEffectIntents } from "./pre-effect-intent.mjs";

const shaPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const taskKeyPattern = /^\d{8}T\d{6}$/u;
const runPattern = /^run-[A-Za-z0-9T:._-]{8,140}$/u;
const supervisorPattern = /^supervised-[A-Za-z0-9T:._-]{8,140}$/u;
const safeNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/u;
const terminalIntentStatuses = new Set(["finalized", "failed_closed"]);
const externalEffectTypes = new Set([
  "push", "pr_create", "pr_head_update", "pr_update", "pr_retarget", "pr_ready", "pr_draft",
  "merge", "comment", "review_reply", "issue_closure", "issue_progress_comment", "umbrella_update",
  "ledger_docs_update", "docs_branch_create", "docs_pr_create_update", "review_request",
  "review_trigger", "docs_pr_ready", "docs_pr_merge", "hygiene_component", "project_status_update",
  "branch_retention_verify",
]);
export const trustedDeploymentGitBinary = "/usr/bin/git";

export const preservedRecoveryTargetFields = Object.freeze([
  "repository", "issueNumber", "taskKey", "runnerRunId", "supervisorRunId", "claimIdentity",
  "chargeId", "branch", "baseSha", "headSha", "treeSha", "changedFilesDigest", "reportName",
  "promptName", "acceptedLogicalTasks", "localSourceChangingRounds", "githubTriggeredFixEpochs",
  "lifetimeLocalSourceChangingRounds",
]);

export function sanitizedDeploymentGitEnvironment(_environment = process.env) {
  return {
    PATH: "/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
}

export function normalizePreservedRecoveryDeploymentTarget(input) {
  if (input == null) return null;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("preserved recovery target must be a bounded object");
  const extras = Object.keys(input).filter((key) => !preservedRecoveryTargetFields.includes(key));
  const missing = preservedRecoveryTargetFields.filter((key) => !Object.hasOwn(input, key));
  if (extras.length || missing.length) throw new Error("preserved recovery target has unsupported, missing, or extra authority");
  const target = {
    repository: requiredMatch(input.repository, repositoryPattern, "repository"),
    issueNumber: boundedInteger(input.issueNumber, 1, 2_147_483_647, "issue number"),
    taskKey: requiredMatch(input.taskKey, taskKeyPattern, "task key"),
    runnerRunId: requiredMatch(input.runnerRunId, runPattern, "runner run id"),
    supervisorRunId: requiredMatch(input.supervisorRunId, supervisorPattern, "supervisor run id"),
    claimIdentity: boundedString(input.claimIdentity, 200, "claim identity"),
    chargeId: requiredMatch(input.chargeId, digestPattern, "charge id"),
    branch: boundedString(input.branch, 240, "branch"),
    baseSha: requiredMatch(input.baseSha, shaPattern, "base SHA"),
    headSha: requiredMatch(input.headSha, shaPattern, "head SHA"),
    treeSha: requiredMatch(input.treeSha, shaPattern, "tree SHA"),
    changedFilesDigest: requiredMatch(input.changedFilesDigest, digestPattern, "changed-files digest"),
    reportName: requiredMatch(input.reportName, safeNamePattern, "report name"),
    promptName: requiredMatch(input.promptName, safeNamePattern, "prompt name"),
    acceptedLogicalTasks: boundedInteger(input.acceptedLogicalTasks, 1, 1, "accepted logical tasks"),
    localSourceChangingRounds: boundedInteger(input.localSourceChangingRounds, 0, 100, "local source-changing rounds"),
    githubTriggeredFixEpochs: boundedInteger(input.githubTriggeredFixEpochs, 0, 100, "GitHub-triggered fix epochs"),
    lifetimeLocalSourceChangingRounds: boundedInteger(input.lifetimeLocalSourceChangingRounds, 0, 1000, "lifetime source-changing rounds"),
  };
  const branchParts = target.branch.split("/");
  if (
    target.branch.startsWith("-")
    || target.branch.endsWith(".")
    || target.branch.endsWith("/")
    || target.branch.includes("..")
    || target.branch.includes("@{")
    || target.branch.includes("//")
    || /[~^:?*[\]\\\s\x00-\x1f\x7f]/u.test(target.branch)
    || branchParts.some((part) => part.length === 0 || part.startsWith(".") || part.endsWith(".lock"))
  ) {
    throw new Error("preserved recovery branch is not a literal Git branch name");
  }
  if (target.claimIdentity !== `${target.repository}#${target.issueNumber}`) throw new Error("preserved recovery claim identity is contradictory");
  if (!target.reportName.startsWith(`settleora-codex-report-${target.taskKey}-issue-${target.issueNumber}-`) || !target.reportName.endsWith(".md")) {
    throw new Error("preserved recovery report correlation is invalid");
  }
  if (!target.promptName.startsWith(`${target.taskKey}-issue-${target.issueNumber}-`) || !target.promptName.endsWith(".md")) {
    throw new Error("preserved recovery prompt correlation is invalid");
  }
  return Object.freeze(target);
}

export function inspectPreservedRecoveryForDeployment(logsRoot, input, {
  processActive = defaultProcessActive,
  repositoryRoot = null,
  gitEnvironment = process.env,
} = {}) {
  let target;
  try {
    target = normalizePreservedRecoveryDeploymentTarget(input);
    assertTrustedOperationalRoot(logsRoot);
  } catch {
    return denied("preserved_recovery_target_or_root_untrusted", input);
  }
  try {
    const config = { logsRoot: path.resolve(logsRoot), repositorySlug: target.repository };
    const states = listRecoverableRecoveryStates(config);
    const matching = states.filter((state) => exactStateIdentity(state, target));
    if (matching.length !== 1) return denied(matching.length ? "preserved_recovery_ambiguous" : "preserved_recovery_not_found", target);
    if (states.some((state) => state.statePath !== matching[0].statePath)) return denied("other_unresolved_recovery_present", target);
    const state = matching[0];
    if (!eligibleValidationCheckpoint(state)) return denied("preserved_recovery_checkpoint_not_eligible", target);
    const markerProof = validateMarkers(state, target);
    if (!markerProof.ok) return denied(markerProof.reasonCode, target);
    const chargeProof = validateCharge(config, state, target);
    if (!chargeProof.ok) return denied(chargeProof.reasonCode, target);
    const lifecycleProof = validateLifecycle(config, state, target, chargeProof.statePath);
    if (!lifecycleProof.ok) return denied(lifecycleProof.reasonCode, target);
    const intentProof = validateIntents(config, state, target, chargeProof.statePath, repositoryRoot, gitEnvironment);
    if (!intentProof.ok) return denied(intentProof.reasonCode, target);
    if (operationalOwnerIsLive(config.logsRoot, target, processActive)) return denied("preserved_recovery_live_owner", target);
    return evidence({
      active: false,
      unresolvedExternalEffects: false,
      preservedRecoveryAdmitted: true,
      target,
      reasonCode: "exact_preserved_recovery_admitted",
      revalidationRequired: true,
    });
  } catch {
    return denied("preserved_recovery_authoritative_read_unavailable", target);
  }
}

function exactStateIdentity(state, target) {
  const identity = state.ordinaryContinuation?.identity;
  const counters = state.ordinaryContinuation?.counters;
  const candidate = state.ordinaryContinuation?.sourceFailureBatch?.candidate;
  return identity?.repository === target.repository
    && state.issue?.number === target.issueNumber
    && state.taskKey === target.taskKey
    && state.run?.runId === target.runnerRunId
    && state.run?.supervisorRunId === target.supervisorRunId
    && state.branch?.name === target.branch
    && state.branch?.baseSha === target.baseSha
    && state.branch?.currentHeadSha === target.headSha
    && identity.baseSha === target.baseSha
    && identity.headSha === target.headSha
    && identity.treeSha === target.treeSha
    && identity.changedFilesDigest === target.changedFilesDigest
    && candidate?.baseSha === target.baseSha
    && candidate?.headSha === target.headSha
    && candidate?.treeSha === target.treeSha
    && candidate?.changedFilesDigest === target.changedFilesDigest
    && canonical(candidate?.changedFiles) === canonical(identity?.changedFiles)
    && digestChangedFiles(identity?.changedFiles) === target.changedFilesDigest
    && path.basename(state.expectedReportPaths?.repoReportPath || "") === target.reportName
    && path.basename(state.expectedReportPaths?.promptPath || "") === target.promptName
    && counters?.acceptedLogicalTasks === target.acceptedLogicalTasks
    && counters?.localSourceChangingRoundsPerEpoch === target.localSourceChangingRounds
    && counters?.githubTriggeredFixEpochsPerPr === target.githubTriggeredFixEpochs
    && counters?.lifetimeLocalSourceChangingRounds === target.lifetimeLocalSourceChangingRounds;
}

function eligibleValidationCheckpoint(state) {
  const findings = state.ordinaryContinuation?.sourceFailureBatch?.findings;
  return state.phase === "stopped"
    && state.firstIncompleteAction === "run_validation_and_commit"
    && state.nextSafeAction === "stop_fail_closed"
    && state.stopReason?.reasonCode === "checkpoint_validation_not_source_fix_safe"
    && state.evidence?.localValidation?.status === "failed"
    && Array.isArray(findings) && findings.length > 0
    && findings.every((finding) => finding?.sourceFixEligible === false
      && finding?.nextAction === "stop_fail_closed"
      && finding?.classification === "unsafe_or_ambiguous");
}

function validateMarkers(state, target) {
  const claim = state.mutationMarkers?.claim || {};
  const charges = state.mutationMarkers?.logical_task_charge || {};
  const branches = state.mutationMarkers?.branch_ownership_created || {};
  const claimMarker = claim[`issue-${target.issueNumber}`];
  const chargeMarker = charges[target.chargeId];
  const branchMarker = branches[`${target.branch}:${target.baseSha}`];
  return Object.keys(claim).length === 1 && Object.keys(charges).length === 1 && Object.keys(branches).length === 1
    && claimMarker?.status === "completed" && claimMarker?.correlation === target.runnerRunId
    && chargeMarker?.status === "completed" && chargeMarker?.target === `issue-${target.issueNumber}` && chargeMarker?.correlation === target.chargeId
    && branchMarker?.status === "completed" && branchMarker?.target === target.branch && branchMarker?.correlation === target.baseSha
    ? { ok: true } : { ok: false, reasonCode: "preserved_recovery_marker_identity_mismatch" };
}

function validateCharge(config, state, target) {
  const budgetScopeId = target.supervisorRunId || target.runnerRunId;
  const loaded = loadLogicalTaskBudget(config, budgetScopeId);
  const marker = loaded.state?.charges?.[target.chargeId];
  if (!loaded.ok || loaded.state.acceptedLogicalTaskCount !== target.acceptedLogicalTasks
      || Object.keys(loaded.state.charges || {}).length !== target.acceptedLogicalTasks
      || marker?.identity?.repository !== target.repository
      || marker?.identity?.issueNumber !== target.issueNumber
      || marker?.identity?.taskLineageId !== `issue-${target.issueNumber}`
      || marker?.identity?.claimIdentity !== target.claimIdentity) {
    return { ok: false, reasonCode: "preserved_recovery_charge_mismatch" };
  }
  return { ok: true, statePath: loaded.statePath };
}

function validateLifecycle(config, state, target, chargeMarkerRef) {
  const loaded = loadSessionLifecycleForRecovery(config, {
    repository: target.repository, issueNumber: target.issueNumber, taskKey: target.taskKey,
    runId: target.runnerRunId, supervisorRunId: target.supervisorRunId, branchName: target.branch,
    baseSha: target.baseSha, headSha: target.headSha,
  });
  if (!loaded.ok) return { ok: false, reasonCode: "preserved_recovery_lifecycle_untrusted" };
  const lifecycle = loaded.state;
  const counters = lifecycle.controller;
  if (lifecycle.logicalTask?.claimIdentity !== target.claimIdentity
      || lifecycle.logicalTask?.chargeMarkerRef !== chargeMarkerRef
      || (Object.hasOwn(lifecycle.logicalTask || {}, "supervisorRunId")
        && lifecycle.logicalTask.supervisorRunId !== target.supervisorRunId)
      || lifecycle.branch?.headSha !== target.headSha
      || lifecycle.report?.correlationKey !== target.taskKey
      || path.basename(lifecycle.report?.path || "") !== target.reportName
      || counters?.localSourceChangingRoundsPerEpoch !== target.localSourceChangingRounds
      || counters?.githubTriggeredFixEpochsPerPr !== target.githubTriggeredFixEpochs
      || counters?.lifetimeLocalSourceChangingRounds !== target.lifetimeLocalSourceChangingRounds) {
    return { ok: false, reasonCode: "preserved_recovery_lifecycle_mismatch" };
  }
  return { ok: true };
}

function validateIntents(config, state, target, chargeMarkerRef, repositoryRoot, gitEnvironment) {
  const intentRoot = path.join(config.logsRoot, "recovery", "pre-effect-intents");
  const intents = existsSync(intentRoot) ? findPreEffectIntents(config) : [];
  const commitIntents = [];
  for (const intent of intents) {
    if (!terminalIntentStatuses.has(intent.status)) return { ok: false, reasonCode: "pending_external_effect" };
    if (externalEffectTypes.has(intent.effectType) && intent.status === "failed_closed") {
      return { ok: false, reasonCode: "external_effect_failed_closed_not_admissible" };
    }
    const correlated = intent.repository === target.repository && intent.sourceTaskKey === target.taskKey && intent.runId === target.runnerRunId;
    if (!correlated) continue;
    if (externalEffectTypes.has(intent.effectType)) {
      return { ok: false, reasonCode: "preserved_recovery_external_effect_present" };
    }
    const identity = intent.identity;
    const commitIntent = intent.effectType === "commit";
    const commitParent = commitIntent
      && shaPattern.test(identity?.candidateIdentity || "")
      && identity?.headSha === identity.candidateIdentity
      && canonical(intent.effect?.expectedParents) === canonical([identity.candidateIdentity]);
    if (intent.logicalTaskIdentity !== target.claimIdentity || intent.claimIdentity !== target.claimIdentity
        || intent.chargeIdentity !== chargeMarkerRef || identity?.repository !== target.repository
        || (!commitIntent && identity?.issueNumber !== target.issueNumber) || identity?.branchName !== target.branch
        || identity?.baseSha !== target.baseSha
        || (commitIntent ? !commitParent : identity?.candidateIdentity !== target.headSha)) {
      return { ok: false, reasonCode: "preserved_recovery_intent_identity_mismatch" };
    }
    if (intent.effectType === "commit") commitIntents.push(intent);
  }
  return validateCommitLineage(repositoryRoot, target, commitIntents, state.ordinaryContinuation.identity.changedFiles, gitEnvironment);
}

function validateCommitLineage(repositoryRoot, target, intents, expectedChangedFiles, gitEnvironment) {
  if (!repositoryRoot || intents.some((intent) => intent.status !== "finalized")) {
    return { ok: false, reasonCode: "preserved_recovery_commit_proof_missing" };
  }
  const root = path.resolve(repositoryRoot);
  const readGit = (args) => git(root, args, gitEnvironment);
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
    return { ok: false, reasonCode: "preserved_recovery_git_root_untrusted" };
  }
  if (path.resolve(readGit(["rev-parse", "--show-toplevel"])) !== realpathSync(root)) {
    return { ok: false, reasonCode: "preserved_recovery_git_root_untrusted" };
  }
  const expectedRepository = target.repository.toLowerCase();
  const fetchUrls = gitConfigValues(root, "remote.origin.url", gitEnvironment);
  const pushUrls = gitConfigValues(root, "remote.origin.pushurl", gitEnvironment);
  const worktreeConfigEnabled = gitConfigBoolean(root, "extensions.worktreeConfig", gitEnvironment);
  const worktreeFetchUrls = worktreeConfigEnabled ? gitConfigValues(root, "remote.origin.url", gitEnvironment, "worktree") : [];
  const worktreePushUrls = worktreeConfigEnabled ? gitConfigValues(root, "remote.origin.pushurl", gitEnvironment, "worktree") : [];
  const effectivePushUrl = pushUrls.length === 1 ? pushUrls[0] : fetchUrls[0];
  if (fetchUrls.length !== 1 || pushUrls.length > 1 || worktreeFetchUrls.length || worktreePushUrls.length
      || canonicalGitHubRepository(fetchUrls[0]) !== expectedRepository
      || canonicalGitHubRepository(effectivePushUrl) !== expectedRepository) {
    return { ok: false, reasonCode: "preserved_recovery_repository_identity_mismatch" };
  }
  let branchHead;
  try {
    if (readGit(["check-ref-format", "--branch", target.branch]) !== target.branch) {
      return { ok: false, reasonCode: "preserved_recovery_branch_ref_mismatch" };
    }
    branchHead = readGit(["show-ref", "--verify", "--hash", `refs/heads/${target.branch}`]);
  } catch {
    return { ok: false, reasonCode: "preserved_recovery_branch_ref_mismatch" };
  }
  if (branchHead !== target.headSha) {
    return { ok: false, reasonCode: "preserved_recovery_branch_ref_mismatch" };
  }
  const lineage = readGit(["rev-list", "--reverse", "--parents", `${target.baseSha}..${target.headSha}`])
    .split("\n").filter(Boolean).map((line) => line.split(" "));
  if (!lineage.length || lineage.length > 100 || lineage.some((entry) => entry.length !== 2)
      || lineage[0][1] !== target.baseSha || lineage.at(-1)[0] !== target.headSha
      || lineage.some((entry, index) => index > 0 && entry[1] !== lineage[index - 1][0])
      || intents.length !== lineage.length) {
    return { ok: false, reasonCode: "preserved_recovery_commit_lineage_mismatch" };
  }
  const unmatched = new Set(intents);
  for (const [commitSha, parentSha] of lineage) {
    const treeSha = readGit(["rev-parse", `${commitSha}^{tree}`]);
    const messageDigest = createHash("sha256").update(readGit(["show", "-s", "--format=%B", commitSha])).digest("hex");
    const changedFiles = readGit(["diff-tree", "--no-commit-id", "--name-only", "-r", parentSha, commitSha])
      .split("\n").filter(Boolean).sort();
    const matches = [...unmatched].filter((intent) => intent.identity.candidateIdentity === parentSha
      && canonical(intent.effect.expectedParents) === canonical([parentSha])
      && intent.effect.treeSha === treeSha
      && intent.effect.messageDigest === messageDigest
      && canonical(intent.effect.stagedPaths) === canonical(changedFiles));
    if (matches.length !== 1) return { ok: false, reasonCode: "preserved_recovery_commit_lineage_mismatch" };
    unmatched.delete(matches[0]);
  }
  const cumulativeFiles = readGit(["diff", "--name-only", target.baseSha, target.headSha]).split("\n").filter(Boolean).sort();
  if (unmatched.size || readGit(["rev-parse", `${target.headSha}^{tree}`]) !== target.treeSha
      || canonical(cumulativeFiles) !== canonical([...expectedChangedFiles].sort())) {
    return { ok: false, reasonCode: "preserved_recovery_commit_lineage_mismatch" };
  }
  return { ok: true };
}

function git(root, args, environment = process.env) {
  const result = spawnSync(trustedDeploymentGitBinary, ["--no-replace-objects", "-c", "core.fsmonitor=false", ...args], {
    cwd: root,
    encoding: "utf8",
    env: sanitizedDeploymentGitEnvironment(environment),
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.stderr) throw new Error("authoritative Git read unavailable");
  return result.stdout.trim();
}

function gitConfigValues(root, key, environment, scope = "local") {
  const result = spawnSync(trustedDeploymentGitBinary, ["config", `--${scope}`, "--no-includes", "-z", "--get-all", key], {
    cwd: root,
    encoding: "buffer",
    env: sanitizedDeploymentGitEnvironment(environment),
    maxBuffer: 64 * 1024,
  });
  if (result.status === 1 && result.stdout.length === 0 && result.stderr.length === 0) return [];
  if (result.status !== 0 || result.stderr.length !== 0) throw new Error("authoritative Git configuration read unavailable");
  const values = result.stdout.toString("utf8").split("\0");
  if (values.at(-1) === "") values.pop();
  return values;
}

function gitConfigBoolean(root, key, environment) {
  const result = spawnSync(trustedDeploymentGitBinary, ["config", "--local", "--no-includes", "--bool", "--get-all", key], {
    cwd: root,
    encoding: "buffer",
    env: sanitizedDeploymentGitEnvironment(environment),
    maxBuffer: 64 * 1024,
  });
  if (result.status === 1 && result.stdout.length === 0 && result.stderr.length === 0) return false;
  if (result.status !== 0 || result.stderr.length !== 0) throw new Error("authoritative Git configuration read unavailable");
  const values = result.stdout.toString("utf8").trimEnd().split("\n");
  if (values.length !== 1 || !["true", "false"].includes(values[0])) {
    throw new Error("authoritative Git configuration is ambiguous");
  }
  return values[0] === "true";
}

function canonicalGitHubRepository(remote) {
  const value = String(remote || "").trim().replace(/\/+$/u, "").replace(/\.git$/u, "");
  const match = value.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/u);
  if (!match) throw new Error("authoritative Git remote is unsupported");
  return match[1].toLowerCase();
}

function operationalOwnerIsLive(logsRoot, target, processActive) {
  for (const relative of ["locks", path.join("supervisor", "runs"), "state"]) {
    const root = path.join(logsRoot, relative);
    if (!existsSync(root)) continue;
    for (const file of trustedJsonFiles(root, 3)) {
      const record = parseBoundedJson(file, 256 * 1024);
      const correlated = [record.runId, record.supervisorRunId].includes(target.runnerRunId)
        || [record.runId, record.supervisorRunId].includes(target.supervisorRunId);
      if ((correlated && Number.isSafeInteger(record.pid) && processActive(record.pid))
          || (correlated && ["submitted", "starting", "running", "stopping_after_current"].includes(record.state))) return true;
    }
  }
  return false;
}

function assertTrustedOperationalRoot(root) {
  const resolved = path.resolve(root || "");
  if (resolved === path.parse(resolved).root || !existsSync(resolved)) throw new Error("unsafe operational root");
  assertTrustedNode(resolved, "directory");
  if (realpathSync(resolved) !== resolved) throw new Error("operational root is not canonical");
  for (const relative of ["recovery", "logical-task-budget", "session-lifecycle", "locks", path.join("supervisor", "runs"), "state"]) {
    const candidate = path.join(resolved, relative);
    if (existsSync(candidate)) assertTrustedTree(candidate, 5);
  }
}

function assertTrustedTree(root, depth) {
  assertTrustedNode(root, "directory");
  if (depth < 0) throw new Error("operational tree is too deep");
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error("operational state contains symlink");
    if (entry.isDirectory()) assertTrustedTree(target, depth - 1);
    else if (entry.isFile()) assertTrustedNode(target, "file");
    else throw new Error("operational state contains unsupported artifact");
  }
}

function assertTrustedNode(candidate, kind) {
  const info = lstatSync(candidate);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if ((kind === "directory" ? !info.isDirectory() : !info.isFile()) || info.isSymbolicLink()
      || (info.mode & 0o022) !== 0 || (currentUid !== null && info.uid !== currentUid)
      || (kind === "file" && info.size > 1024 * 1024)) throw new Error("untrusted operational artifact");
}

function trustedJsonFiles(root, depth) {
  if (depth < 0) throw new Error("operational tree is too deep");
  assertTrustedNode(root, "directory");
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error("operational state contains symlink");
    if (entry.isDirectory()) return trustedJsonFiles(target, depth - 1);
    if (!entry.isFile()) throw new Error("unsupported operational artifact");
    assertTrustedNode(target, "file");
    return entry.name.endsWith(".json") || entry.name.endsWith(".lock") ? [target] : [];
  });
}

function parseBoundedJson(file, limit) {
  const info = lstatSync(file);
  if (info.size > limit) throw new Error("operational artifact oversized");
  return JSON.parse(readFileSync(file, "utf8"));
}

function denied(reasonCode, target) {
  return evidence({
    active: false, unresolvedExternalEffects: true, preservedRecoveryAdmitted: false,
    target: safeTarget(target), reasonCode, revalidationRequired: false,
  });
}

function evidence(value) {
  const target = safeTarget(value.target);
  return Object.freeze({
    active: value.active === true,
    unresolvedExternalEffects: value.unresolvedExternalEffects === true,
    preservedRecoveryAdmitted: value.preservedRecoveryAdmitted === true,
    targetIdentityDigest: target ? createHash("sha256").update(canonical(target)).digest("hex") : null,
    reasonCode: String(value.reasonCode || "deployment_quiescence_unclassified").slice(0, 160),
    revalidationRequired: value.revalidationRequired === true,
  });
}

function safeTarget(target) {
  if (!target || typeof target !== "object") return null;
  return Object.fromEntries(preservedRecoveryTargetFields.map((key) => [key, target[key] ?? null]));
}
function digestChangedFiles(files) { return createHash("sha256").update(JSON.stringify([...new Set(files || [])].sort())).digest("hex"); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function boundedString(value, max, name) { if (typeof value !== "string" || !value || value.length > max || /[\x00-\x1f\x7f]/u.test(value)) throw new Error(`invalid ${name}`); return value; }
function requiredMatch(value, pattern, name) { const result = boundedString(value, 240, name); if (!pattern.test(result)) throw new Error(`invalid ${name}`); return result; }
function boundedInteger(value, min, max, name) { const number = typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value; if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`invalid ${name}`); return number; }
function defaultProcessActive(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error?.code !== "ESRCH"; } }
