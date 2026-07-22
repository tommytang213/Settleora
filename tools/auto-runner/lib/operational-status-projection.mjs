import { createHash } from "node:crypto";

export const operationalStatusSchemaVersion = 1;
export const operationalStatusMaxBytes = 64 * 1024;
const maxString = 240;
const maxItems = 20;
const shaPattern = /^[0-9a-f]{40}$/;

export const operationalStateInventory = Object.freeze([
  inventory("runner_control", "local_operational", 1, ["control-plane"], ["runner", "operator_projection"], "atomic_json", "cross_head"),
  inventory("runner_active_lock_iteration_summary", "local_operational", 1, ["state-store", "summary-writer", "control-plane"], ["runner", "supervisor", "operator_projection"], "single_writer_json_jsonl", "head_bound"),
  inventory("supervisor_spec_state_heartbeat_outbox_report", "local_operational", 1, ["supervisor"], ["health", "monitoring", "operator_projection"], "immutable_spec_atomic_json_jsonl", "cross_head"),
  inventory("recovery_outage_resubmission", "local_operational", 1, ["recovery-state", "outage-resubmission"], ["recovery-continuation", "operator_projection"], "atomic_versioned_json", "head_bound"),
  inventory("session_lifecycle_rotation_handoff", "local_operational", 1, ["session-lifecycle"], ["recovery", "runner", "operator_projection"], "atomic_versioned_json", "cross_head"),
  inventory("review_convergence_two_loop", "local_operational", 2, ["review-convergence-controller"], ["runner", "recovery", "operator_projection"], "atomic_versioned_json", "head_bound"),
  inventory("accepted_logical_task_budget", "local_operational", 1, ["logical-task-budget"], ["runner", "operator_projection"], "atomic_versioned_json", "cross_head"),
  inventory("ordinary_candidate_continuation", "local_operational", 1, ["ordinary-candidate-continuation"], ["runner", "recovery", "operator_projection"], "atomic_versioned_json", "head_bound"),
  inventory("large_route_coverage_split_stack", "local_operational", 1, ["large-candidate-review-routing", "feature-bundle-split-materializer", "pr-stack-executor"], ["runner", "recovery", "operator_projection"], "atomic_versioned_json", "head_bound"),
  inventory("pre_effect_effect_adoption_dedupe", "local_operational", 1, ["pre-effect-intent", "effect-journal", "mutation-dedupe"], ["runner", "recovery", "operator_projection"], "atomic_json_jsonl", "cross_head"),
  inventory("generated_work_security_notifier_dedupe", "local_operational", 1, ["generated-work", "security-findings", "notifier"], ["runner", "monitoring", "operator_projection"], "atomic_versioned_json", "head_bound"),
  inventory("reports_summaries_review_evidence_events", "immutable_evidence", 1, ["runner", "reviewers", "supervisor"], ["operator_projection"], "immutable_bounded_artifacts", "head_bound"),
  inventory("github_repository", "live_authority", 1, ["git", "github"], ["runner", "operator_projection"], "provider_authoritative", "live"),
  inventory("issue_progress_ledger", "derived", 1, ["completion-hygiene"], ["humans", "operator_projection"], "git_milestone_projection", "historical"),
]);

export async function buildOperationalStatusProjection(adapters = {}, options = {}) {
  const now = options.now || (() => new Date());
  const [repository, github, local, ledger] = await Promise.all([
    readAdapter(adapters.repository, "repository"),
    readAdapter(adapters.github, "github"),
    readAdapter(adapters.local, "local"),
    readAdapter(adapters.ledger, "ledger"),
  ]);
  const failures = [repository, github, local, ledger].filter((entry) => !entry.ok);
  const conflicts = reconcileConflicts(repository.value, github.value, local.value);
  const failClosed = [...failures.map((entry) => entry.reasonCode), ...conflicts];
  const liveHead = validSha(github.value?.pr?.headSha) || validSha(repository.value?.headSha);
  const localHead = validSha(local.value?.task?.headSha);
  const ledgerState = classifyLedger(ledger.value, github.value, repository.value);
  const model = {
    schemaVersion: operationalStatusSchemaVersion,
    generatedAt: iso(now()),
    status: failClosed.length ? "blocked" : boundedReason(local.value?.status || (local.value?.active ? "active" : "idle")),
    authority: {
      live: "repository_and_github",
      local: "owner_only_operational_state",
      immutableEvidence: "correlated_artifacts",
      derived: "repository_ledger_orientation_only",
    },
    repository: projectRepository(repository.value),
    task: projectTask(local.value, github.value, repository.value),
    lifecycle: projectLifecycle(local.value),
    counters: projectCounters(local.value),
    session: projectSession(local.value),
    recovery: projectRecovery(local.value),
    review: projectReview(local.value, liveHead),
    largeCandidate: projectLargeCandidate(local.value),
    effects: projectEffects(local.value),
    supervisor: projectSupervisor(local.value),
    ledger: ledgerState,
    evidence: projectEvidence(local.value),
    blockers: boundedList([...(local.value?.blockers || []), ...failClosed], boundedReason),
    nextSafeAction: failClosed.length ? "inspect_projection_reason_codes" : boundedReason(local.value?.nextSafeAction || "reconcile_live_state"),
    inventory: operationalStateInventory,
    storageDecision: {
      backend: "versioned_json_jsonl",
      classification: "authoritative",
      transactionalCrossRecordNeed: false,
      indexedQueryNeed: false,
      rationale: "state is correlation-scoped and single-writer; immutable evidence remains file-oriented",
    },
  };
  if (local.value?.active === true && liveHead && localHead && liveHead !== localHead) {
    model.status = "blocked";
    model.blockers = boundedList([...model.blockers, "stale_head_identity_conflict"], boundedReason);
    model.nextSafeAction = "reconcile_live_head_before_continuation";
  }
  assertBoundedProjection(model);
  return model;
}

export function renderOperationalStatusMarkdown(model) {
  assertBoundedProjection(model);
  const task = model.task;
  const lines = [
    "# Settleora operational status",
    "",
    `- Schema: ${model.schemaVersion}`,
    `- Generated: ${model.generatedAt}`,
    `- Status: ${model.status}`,
    `- Task: ${task.issueNumber ? `#${task.issueNumber}` : "none"} / ${task.logicalTaskKey || "none"}`,
    `- Branch/base/head: ${task.branch || "none"} / ${task.baseBranch || "none"} / ${task.headSha || "none"}`,
    `- PR: ${task.prNumber || "none"}`,
    `- Phase: ${model.lifecycle.phase || "none"}`,
    `- Next safe action: ${model.nextSafeAction}`,
    `- Blockers: ${model.blockers.join(", ") || "none"}`,
    "",
    "## Counters and budget",
    "",
    `- Accepted tasks: ${value(model.counters.acceptedTaskBudget.consumed)}/${value(model.counters.acceptedTaskBudget.configured)}; remaining ${value(model.counters.acceptedTaskBudget.remaining)}`,
    `- Local source-changing rounds per epoch: ${value(model.counters.localSourceChangingRoundsPerEpoch.value)} (authoritative blocking counter)` ,
    `- GitHub-triggered fix epochs per PR: ${value(model.counters.githubTriggeredFixEpochsPerPr.value)} (authoritative blocking counter)` ,
    `- Lifetime local source-changing rounds: ${value(model.counters.lifetimeLocalSourceChangingRounds.value)} (telemetry only; never a gate)` ,
    "",
    "## Recovery, session, and review",
    "",
    `- Recovery: ${model.recovery.classification || "none"}; ${model.recovery.nextSafeAction || "none"}`,
    `- Session: generation ${value(model.session.generation)}, phase ${model.session.phase || "none"}, pressure ${model.session.contextPressure || "none"}`,
    `- Review exact head: ${model.review.exactHead || "none"}; validation ${model.review.validationStatus || "unknown"}; Gemini ${model.review.geminiStatus || "unknown"}; local Codex ${model.review.localCodexStatus || "unknown"}; CI ${model.review.ciStatus || "unknown"}`,
    "",
    "## Large-candidate and ledger posture",
    "",
    `- Route/split/stack: ${model.largeCandidate.route || "none"} / ${model.largeCandidate.splitState || "none"} / ${model.largeCandidate.stackState || "none"}`,
    `- Ledger: ${model.ledger.consistency}; derived=${model.ledger.classification === "derived"}; may influence runtime authority=no`,
    `- Storage: ${model.storageDecision.backend}; SQLite required=no`,
  ];
  const output = `${lines.join("\n")}\n`;
  if (Buffer.byteLength(output) > operationalStatusMaxBytes) throw new Error("operational_status_markdown_too_large");
  return output;
}

export function ledgerHygieneDecision(transition = {}) {
  const milestoneKinds = new Set(["implementation_pr_merged", "issue_posture_changed", "umbrella_scope_changed", "manual_gate_changed", "production_activation_posture_changed", "major_acceptance_completed", "scheduled_reconciliation"]);
  const ephemeralKinds = new Set(["wait", "retry", "heartbeat", "check_poll", "source_cycle", "session_rotation", "control_transition"]);
  const kind = bounded(transition.kind);
  if (milestoneKinds.has(kind)) return { request: true, classification: "milestone", reasonCode: `ledger_milestone_${kind}` };
  if (ephemeralKinds.has(kind)) return { request: false, classification: "ephemeral", reasonCode: `ledger_ephemeral_${kind}` };
  return { request: false, classification: "unclassified_fail_closed", reasonCode: "ledger_transition_not_allowlisted" };
}

export function assertBoundedProjection(model) {
  const encoded = JSON.stringify(model);
  if (Buffer.byteLength(encoded) > operationalStatusMaxBytes) throw new Error("operational_status_json_too_large");
  if (/bearer\s|api[_-]?key|authorization|rawprompt|rawprovider|ocrtext|github_pat_|gh[pousr]_|xox[baprs]-|sk-[a-z0-9_-]{8,}|akia[0-9a-z]{12,}|ya29\.|https?:\\?\/\\?\/|[a-z]:\\\\|(?:^|["\s])\/(?:home|workspace|tmp|var|etc|opt)\//i.test(encoded)) {
    throw new Error("operational_status_secret_or_path_boundary_violation");
  }
  return true;
}

function inventory(stateClass, authority, schemaVersion, writers, readers, durability, headDurability) {
  return Object.freeze({ stateClass, authority, schemaVersion, writers, readOnlyConsumers: readers, durability, correlation: "exact_run_task_issue_branch_pr_head", headDurability, sanitization: "positive_allowlist_bounded", retention: "owner_policy_or_immutable_evidence", corruptionRecovery: "fail_closed_no_read_repair" });
}

async function readAdapter(adapter, name) {
  if (!adapter) return { ok: true, value: {} };
  try {
    const result = await adapter.read();
    if (!result || result.ok === false) return { ok: false, value: {}, reasonCode: boundedReason(result?.reasonCode || `${name}_read_failed`) };
    return { ok: true, value: result.value || result };
  } catch {
    return { ok: false, value: {}, reasonCode: `${name}_read_failed` };
  }
}

function reconcileConflicts(repository, github, local) {
  const reasons = [];
  if ((local?.activeAuthorities?.length || 0) > 1) reasons.push("multiple_active_local_authorities");
  if (local?.identityConflict) reasons.push("local_identity_conflict");
  if (repository?.repositorySlug && github?.repositorySlug && repository.repositorySlug !== github.repositorySlug) reasons.push("repository_identity_conflict");
  if (github?.issue?.number && local?.task?.issueNumber && Number(github.issue.number) !== Number(local.task.issueNumber)) reasons.push("issue_identity_conflict");
  if (github?.pr?.number && local?.task?.prNumber && Number(github.pr.number) !== Number(local.task.prNumber)) reasons.push("pr_identity_conflict");
  if (github?.pr?.headRefName && local?.task?.branch && github.pr.headRefName !== local.task.branch) reasons.push("pr_branch_identity_conflict");
  if (github?.pr?.baseRefName && local?.task?.baseBranch && github.pr.baseRefName !== local.task.baseBranch) reasons.push("pr_base_branch_identity_conflict");
  const liveHead = validSha(github?.pr?.headSha) || validSha(repository?.headSha);
  const reviewHead = validSha(local?.review?.exactHead);
  const hasReviewEvidence = ["validationStatus", "geminiStatus", "localCodexStatus", "githubCodexStatus", "ciStatus", "scannerStatus"].some((key) => local?.review?.[key]);
  if (hasReviewEvidence && !reviewHead) reasons.push("review_exact_head_missing");
  if (reviewHead && liveHead && reviewHead !== liveHead) reasons.push("stale_exact_head_evidence");
  if (local?.active === true && local?.task?.branch && repository?.currentBranch && local.task.branch !== repository.currentBranch) reasons.push("active_repository_branch_identity_conflict");
  if (local?.active === true && github?.pr?.headRefName && repository?.currentBranch === github.pr.headRefName && validSha(repository?.headSha) && validSha(github.pr.headSha) && repository.headSha !== github.pr.headSha) reasons.push("active_repository_head_identity_conflict");
  return reasons;
}

function projectRepository(value = {}) {
  return { classification: "authoritative", repositorySlug: repositorySlug(value.repositorySlug), currentBranch: refName(value.currentBranch), headSha: validSha(value.headSha), originMainSha: validSha(value.originMainSha), clean: typeof value.clean === "boolean" ? value.clean : null };
}

function projectTask(local = {}, github = {}, repository = {}) {
  const task = local.task || {};
  const pr = github.pr || {};
  const issue = github.issue || {};
  return { classification: "authoritative", logicalTaskKey: identifier(task.logicalTaskKey), runId: identifier(task.runId), issueNumber: integer(issue.number ?? task.issueNumber), issueState: enumValue(issue.state, ["OPEN", "CLOSED"]), branch: refName(pr.headRefName || task.branch || repository.currentBranch), baseBranch: refName(pr.baseRefName || task.baseBranch), headSha: validSha(pr.headSha || task.headSha || repository.headSha), treeSha: validSha(task.treeSha), prNumber: integer(pr.number ?? task.prNumber), prState: enumValue(pr.state, ["OPEN", "CLOSED", "MERGED"]), manualGate: Boolean(task.manualGate || issue.manualGate), dangerGate: Boolean(task.dangerGate || issue.dangerGate) };
}

function projectLifecycle(local = {}) { return { classification: "authoritative", phase: boundedReason(local.lifecycle?.phase), continuationState: boundedReason(local.lifecycle?.continuationState), ownerPosture: boundedReason(local.lifecycle?.ownerPosture), terminalPosture: boundedReason(local.lifecycle?.terminalPosture) }; }
function projectCounters(local = {}) { const c = local.counters || {}; const b = c.acceptedTaskBudget || {}; return { acceptedTaskBudget: { classification: "authoritative", configured: integer(b.configured), consumed: integer(b.consumed), remaining: integer(b.remaining), chargeIdentity: digest(b.chargeIdentity) || identifier(b.chargeIdentity), chargeStatus: boundedReason(b.chargeStatus) }, localSourceChangingRoundsPerEpoch: counter(c.localSourceChangingRoundsPerEpoch, "authoritative"), githubTriggeredFixEpochsPerPr: counter(c.githubTriggeredFixEpochsPerPr, "authoritative"), lifetimeLocalSourceChangingRounds: counter(c.lifetimeLocalSourceChangingRounds, "telemetryOnly") }; }
function projectSession(local = {}) { const s = local.session || {}; return { classification: "authoritative", generation: integer(s.generation), phase: boundedReason(s.phase), rotationReason: boundedReason(s.rotationReason), contextPressure: enumValue(s.contextPressure, ["normal", "elevated", "high", "critical", "unknown"]), continuationState: boundedReason(s.continuationState), ownerPosture: boundedReason(s.ownerPosture), terminalPosture: boundedReason(s.terminalPosture) }; }
function projectRecovery(local = {}) { const r = local.recovery || {}; return { authority: "authoritative", outcomeClass: boundedReason(r.outcomeClass), classification: boundedReason(r.classification), phase: boundedReason(r.phase), nextSafeAction: boundedReason(r.nextSafeAction), reasonCode: boundedReason(r.reasonCode) }; }
function projectReview(local = {}, liveHead) { const r = local.review || {}; const exactHead = validSha(r.exactHead); const bound = Boolean(exactHead && liveHead && exactHead === liveHead); return { classification: "authoritative_when_exact_head_bound", exactHead, liveHead, validationStatus: bound ? boundedReason(r.validationStatus) : null, geminiStatus: bound ? boundedReason(r.geminiStatus) : null, localCodexStatus: bound ? boundedReason(r.localCodexStatus) : null, githubCodexStatus: bound ? boundedReason(r.githubCodexStatus) : null, ciStatus: bound ? boundedReason(r.ciStatus) : null, scannerStatus: bound ? boundedReason(r.scannerStatus) : null, unresolvedThreads: bound ? integer(r.unresolvedThreads) : null, openAlerts: bound ? integer(r.openAlerts) : null, stale: Boolean(exactHead && liveHead && exactHead !== liveHead), bound }; }
function projectLargeCandidate(local = {}) { const l = local.largeCandidate || {}; return { classification: "authoritative", route: boundedReason(l.route), coverageStatus: boundedReason(l.coverageStatus), integrationStatus: boundedReason(l.integrationStatus), uncoveredScopeIds: boundedList(l.uncoveredScopeIds, identifier), splitState: boundedReason(l.splitState), stackState: boundedReason(l.stackState), handoffState: boundedReason(l.handoffState) }; }
function projectEffects(local = {}) { const e = local.effects || {}; return { classification: "authoritative", pendingIntentCount: integer(e.pendingIntentCount), confirmedEffectCount: integer(e.confirmedEffectCount), adoptedEffectCount: integer(e.adoptedEffectCount), nextEffectType: boundedReason(e.nextEffectType) }; }
function projectSupervisor(local = {}) { const s = local.supervisor || {}; return { classification: "authoritative", runId: identifier(s.runId), state: boundedReason(s.state), heartbeatPosture: boundedReason(s.heartbeatPosture), leasePosture: boundedReason(s.leasePosture), reportCorrelation: identifier(s.reportCorrelation) }; }
function projectEvidence(local = {}) { return boundedList(local.evidence, (entry) => ({ kind: boundedReason(entry?.kind), digest: digest(entry?.digest), status: boundedReason(entry?.status), exactHead: validSha(entry?.exactHead) })); }
function classifyLedger(ledger = {}, github = {}, repository = {}) { const observed = validSha(ledger.observedMainSha); const current = validSha(repository.originMainSha); const stale = Boolean(ledger.stale || (observed && current && observed !== current) || (ledger.issueState && github.issue?.state && ledger.issueState !== github.issue.state)); return { classification: "derived", consistency: stale ? "stale" : "consistent_or_unproven", observedMainSha: observed, authoritativeFor: [], forbiddenInfluence: ["selection", "completion", "closure", "recovery", "merge", "duplicate_suppression"] }; }
function counter(raw, classification) { return { classification, value: integer(typeof raw === "object" ? raw?.value : raw), limit: integer(typeof raw === "object" ? raw?.limit : null), blocking: classification === "authoritative" }; }
function bounded(value) { return typeof value === "string" && value ? value.replace(/[\r\n\t]/g, " ").slice(0, maxString) : null; }
function boundedReason(value) { const text = bounded(value); if (!text) return null; return /^[a-z0-9_:-]+$/i.test(text) && !credentialShaped(text) ? text : "redacted_reason"; }
function boundedList(value, mapper) { return Array.isArray(value) ? value.slice(0, maxItems).map(mapper).filter((item) => item !== null && item !== undefined) : []; }
function identifier(value) { const text = bounded(value); return text && /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(text) && !credentialShaped(text) ? text : null; }
function refName(value) { const text = bounded(value); return text && /^[a-z0-9][a-z0-9._/-]{0,199}$/i.test(text) && !text.includes("..") && !credentialShaped(text) ? text : null; }
function repositorySlug(value) { const text = bounded(value); return text && /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(text) && !credentialShaped(text) ? text : null; }
function credentialShaped(value) { return /github_pat_|gh[pousr]_|xox[baprs]-|sk-[a-z0-9_-]{8,}|akia[0-9a-z]{12,}|ya29\.|[a-z0-9]{32,}/i.test(value); }
function integer(value) { if (value === null || value === undefined || value === "") return null; return Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null; }
function validSha(value) { return typeof value === "string" && shaPattern.test(value) ? value : null; }
function enumValue(value, allowed) { const normalized = typeof value === "string" ? value.toUpperCase() : null; return allowed.includes(normalized) ? normalized : null; }
function digest(value) { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null; }
function iso(value) { const date = value instanceof Date ? value : new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString(); }
function value(input) { return input === null || input === undefined ? "unknown" : input; }

export function projectionDigest(model) { return createHash("sha256").update(JSON.stringify(model)).digest("hex"); }
