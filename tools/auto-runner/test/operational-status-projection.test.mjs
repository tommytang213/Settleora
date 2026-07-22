import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getRunnerStatus, writeActiveRunState } from "../lib/control-plane.mjs";
import {
  assertBoundedProjection,
  buildOperationalStatusProjection,
  ledgerHygieneDecision,
  operationalStateInventory,
  renderOperationalStatusMarkdown,
} from "../lib/operational-status-projection.mjs";
import { createProjectionAdapters } from "../settleora-auto-runnerctl.mjs";

const head = "a".repeat(40);
const main = "b".repeat(40);

function adapters(overrides = {}) {
  const values = {
    repository: { repositorySlug: "tommytang213/Settleora", currentBranch: "feature/auto-927", headSha: head, originMainSha: main, clean: true },
    github: { repositorySlug: "tommytang213/Settleora", issue: { number: 927, state: "OPEN" }, pr: { number: 942, state: "OPEN", headRefName: "feature/auto-927", baseRefName: "main", headSha: head } },
    local: {
      active: true,
      status: "active",
      task: { logicalTaskKey: "20260722-1019", runId: "20260722-1019", issueNumber: 927, prNumber: 942, branch: "feature/auto-927", baseBranch: "main", headSha: head },
      lifecycle: { phase: "local_validation", continuationState: "active", ownerPosture: "owner", terminalPosture: "non_terminal" },
      counters: { acceptedTaskBudget: { configured: 3, consumed: 1, remaining: 2, chargeIdentity: "20260722-1019", chargeStatus: "charged" }, localSourceChangingRoundsPerEpoch: { value: 4, limit: 50 }, githubTriggeredFixEpochsPerPr: { value: 2, limit: 50 }, lifetimeLocalSourceChangingRounds: { value: 87 } },
      recovery: { classification: "safe_boundary", phase: "local_validation", nextSafeAction: "run_validation" },
      session: { generation: 2, phase: "active", rotationReason: "context_pressure", contextPressure: "elevated", continuationState: "resumed", ownerPosture: "owner" },
      review: { exactHead: head, validationStatus: "pass", geminiStatus: "pass", localCodexStatus: "pass", githubCodexStatus: "pending", ciStatus: "pending", scannerStatus: "pending", unresolvedThreads: 0, openAlerts: 0 },
      largeCandidate: { route: "coherent_large", coverageStatus: "complete", integrationStatus: "complete", splitState: "not_required", stackState: "not_required", uncoveredScopeIds: [] },
      effects: { pendingIntentCount: 0, confirmedEffectCount: 3, adoptedEffectCount: 1, nextEffectType: "review_request" },
      supervisor: { runId: "20260722-1019", state: "active", heartbeatPosture: "fresh", leasePosture: "held", reportCorrelation: "20260722-1019" },
      evidence: [{ kind: "validation", digest: "c".repeat(64), status: "pass", exactHead: head }],
      nextSafeAction: "await_github_gates",
    },
    ledger: { observedMainSha: "d".repeat(40), issueState: "CLOSED" },
    ...overrides,
  };
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { read: async () => value }]));
}

test("inventory encodes authority, durability, correlation, sanitization, and recovery for every state class", () => {
  assert.ok(operationalStateInventory.length >= 14);
  for (const entry of operationalStateInventory) {
    for (const key of ["stateClass", "authority", "schemaVersion", "writers", "readOnlyConsumers", "durability", "correlation", "headDurability", "sanitization", "retention", "corruptionRecovery"]) assert.ok(entry[key] !== undefined, `${entry.stateClass}.${key}`);
  }
});

test("production-shaped composed fixture exports one deterministic bounded authority-classified model", async () => {
  const now = () => new Date("2026-07-22T02:30:00.000Z");
  const one = await buildOperationalStatusProjection(adapters(), { now });
  const two = await buildOperationalStatusProjection(adapters(), { now });
  assert.deepEqual(one, two);
  assert.equal(one.schemaVersion, 1);
  assert.equal(one.task.issueNumber, 927);
  assert.equal(one.counters.localSourceChangingRoundsPerEpoch.blocking, true);
  assert.equal(one.counters.githubTriggeredFixEpochsPerPr.blocking, true);
  assert.equal(one.counters.lifetimeLocalSourceChangingRounds.classification, "telemetryOnly");
  assert.equal(one.counters.lifetimeLocalSourceChangingRounds.blocking, false);
  assert.equal(one.ledger.consistency, "stale");
  assert.deepEqual(one.ledger.authoritativeFor, []);
  assert.equal(one.recovery.nextSafeAction, "run_validation");
  assert.equal(one.session.generation, 2);
  assert.equal(one.largeCandidate.stackState, "not_required");
  assert.equal(one.effects.adoptedEffectCount, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(one)) < 64 * 1024);
  assert.match(renderOperationalStatusMarkdown(one), /telemetry only; never a gate/);
});

test("JSON and Markdown use the same normalized model", async () => {
  const model = await buildOperationalStatusProjection(adapters(), { now: () => new Date(0) });
  const markdown = renderOperationalStatusMarkdown(model);
  assert.match(markdown, new RegExp(model.task.headSha));
  assert.match(markdown, new RegExp(model.nextSafeAction));
  assert.match(markdown, new RegExp(String(model.counters.acceptedTaskBudget.remaining)));
});

test("reads are side-effect-free and invoke each injected adapter exactly once", async () => {
  const calls = [];
  const base = adapters();
  for (const [name, adapter] of Object.entries(base)) {
    const read = adapter.read;
    adapter.read = async () => { calls.push(name); return read(); };
  }
  await buildOperationalStatusProjection(base, { now: () => new Date(0) });
  assert.deepEqual(calls.sort(), ["github", "ledger", "local", "repository"]);
});

test("production adapters use only fixed read-only git and GitHub commands", async () => {
  const calls = [];
  const spawnSync = (command, args) => {
    calls.push([command, ...args]);
    if (command === "git" && args[0] === "--no-optional-locks" && args[1] === "branch") return { status: 0, stdout: "feature/auto-927\n" };
    if (command === "git" && args[0] === "--no-optional-locks" && args[1] === "rev-parse") return { status: 0, stdout: `${head}\n` };
    if (command === "git" && args[0] === "--no-optional-locks" && args[1] === "status") return { status: 0, stdout: "" };
    if (command === "git" && args[0] === "--no-optional-locks" && args[1] === "show") return { status: 0, stdout: "#927 is closed after accepted merge evidence.\n" };
    if (args[0] === "issue") return { status: 0, stdout: JSON.stringify({ number: 927, state: "OPEN", labels: [] }) };
    if (args[0] === "pr") return { status: 0, stdout: JSON.stringify({ number: 942, state: "OPEN", headRefName: "feature/auto-927", headRefOid: head, baseRefName: "main" }) };
    return { status: 1, stdout: "" };
  };
  const config = { repoRoot: "/repo", repositorySlug: "tommytang213/Settleora" };
  const production = createProjectionAdapters(config, { spawnSync, getRunnerStatus: () => ({ active: true, activeRunId: "20260722-1019", supervisorRunId: "supervisor-927", currentOrLastIssue: { number: 927 }, currentOrLastPr: { number: 942, headSha: head }, operationalProjection: {} }), readSupervisorProjection: () => ({ ok: true, value: { runId: "supervisor-927", state: "running", heartbeatPosture: "fresh", leasePosture: "valid", reportCorrelation: "20260722-1019" } }) });
  const model = await buildOperationalStatusProjection(production, { now: () => new Date(0) });
  assert.equal(model.supervisor.heartbeatPosture, "fresh");
  assert.equal(model.ledger.consistency, "stale");
  assert.deepEqual(calls.map((call) => call.slice(0, 3)).sort(), [["gh", "issue", "view"], ["gh", "pr", "view"], ["git", "--no-optional-locks", "branch"], ["git", "--no-optional-locks", "rev-parse"], ["git", "--no-optional-locks", "rev-parse"], ["git", "--no-optional-locks", "show"], ["git", "--no-optional-locks", "status"]].sort());
  const forbidden = new Set(["add", "commit", "push", "merge", "edit", "comment", "close", "create", "delete"]);
  assert.equal(calls.some((call) => call.some((token) => forbidden.has(token))), false);
});

test("corrupt, multiple-active, contradictory repository, PR, and stale-head fixtures fail closed", async () => {
  const cases = [
    { local: { activeAuthorities: ["one", "two"] }, reason: "multiple_active_local_authorities" },
    { local: { identityConflict: true }, reason: "local_identity_conflict" },
    { github: { repositorySlug: "other/repo" }, reason: "repository_identity_conflict" },
    { local: { task: { prNumber: 7 } }, reason: "pr_identity_conflict" },
    { local: { task: { issueNumber: 7 } }, reason: "issue_identity_conflict" },
    { local: { task: { branch: "other-branch" } }, reason: "pr_branch_identity_conflict" },
    { local: { task: { baseBranch: "other-base" } }, reason: "pr_base_branch_identity_conflict" },
    { local: { active: true, task: { headSha: "e".repeat(40) } }, reason: "stale_head_identity_conflict" },
    { local: { active: true, task: { branch: "other-branch" } }, reason: "active_repository_branch_identity_conflict" },
    { local: { ...await adapters().local.read(), review: { exactHead: "e".repeat(40) } }, reason: "stale_exact_head_evidence" },
    { local: { ...await adapters().local.read(), review: { validationStatus: "pass" } }, reason: "review_exact_head_missing" },
    { repository: { ...await adapters().repository.read(), headSha: "e".repeat(40) }, reason: "active_repository_head_identity_conflict" },
  ];
  for (const fixture of cases) {
    const model = await buildOperationalStatusProjection(adapters({ [Object.keys(fixture)[0]]: fixture[Object.keys(fixture)[0]] }), { now: () => new Date(0) });
    assert.equal(model.status, "blocked");
    assert.ok(model.blockers.includes(fixture.reason), fixture.reason);
  }
  const corrupt = await buildOperationalStatusProjection({ ...adapters(), local: { read: async () => { throw new Error("bad json"); } } }, { now: () => new Date(0) });
  assert.ok(corrupt.blockers.includes("local_read_failed"));
});

test("positive allowlist excludes secrets, prompts, provider payloads, OCR content, raw logs and paths", async () => {
  const poisoned = adapters();
  poisoned.local = { read: async () => ({ ...await adapters().local.read(), secret: "test-api-key-for-review", rawPrompt: "hidden", providerResponse: "private", ocrText: "receipt", arbitraryPath: "/workspace/private", nextSafeAction: "/home/operator/private/session.txt", recovery: { nextSafeAction: "https://provider.invalid/private" }, evidence: [{ kind: "validation", path: "/workspace/private", rawLog: "test-token-for-review" }] }) };
  const encoded = JSON.stringify(await buildOperationalStatusProjection(poisoned, { now: () => new Date(0) }));
  for (const forbidden of ["test-api-key-for-review", "hidden", "private", "receipt", "/workspace/", "/home/", "https://"]) assert.equal(encoded.includes(forbidden), false, forbidden);
});

test("credential-shaped values are rejected from allowlisted output fields", async () => {
  const token = ["gh", "p_abcdefghijklmnopqrstuvwxyz123456"].join("");
  const baseLocal = await adapters().local.read();
  const poisoned = adapters();
  poisoned.local = { read: async () => ({ ...baseLocal, status: token, task: { ...baseLocal.task, logicalTaskKey: token, branch: `feature/${token}` }, lifecycle: { phase: token }, blockers: [token], nextSafeAction: token, evidence: [{ kind: token, status: token }] }) };
  const encoded = JSON.stringify(await buildOperationalStatusProjection(poisoned, { now: () => new Date(0) }));
  assert.equal(encoded.includes(token), false);
  const unprefixed = "Ab3defghijklmnopqrstuvwxyz0123456789";
  const entropyPoisoned = adapters();
  entropyPoisoned.local = { read: async () => ({ ...baseLocal, nextSafeAction: unprefixed, task: { ...baseLocal.task, logicalTaskKey: unprefixed } }) };
  assert.equal(JSON.stringify(await buildOperationalStatusProjection(entropyPoisoned, { now: () => new Date(0) })).includes(unprefixed), false);
});

test("missing numeric values remain unknown and recovery authority is not overwritten", async () => {
  const baseLocal = await adapters().local.read();
  const model = await buildOperationalStatusProjection(adapters({ local: { ...baseLocal, counters: { localSourceChangingRoundsPerEpoch: { value: 1 } }, recovery: {} } }), { now: () => new Date(0) });
  assert.equal(model.counters.localSourceChangingRoundsPerEpoch.limit, null);
  assert.equal(model.counters.acceptedTaskBudget.configured, null);
  assert.equal(model.recovery.authority, "authoritative");
  assert.equal(model.recovery.classification, null);
});

test("active-run persistence retains the bounded operational projection from the full iteration", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-projection-"));
  mkdirSync(path.join(logsRoot, "state"), { recursive: true });
  const config = { logsRoot, maxIterations: 3, maxRuntimeMs: 60_000 };
  const summary = { runId: "run-927", startedAt: new Date().toISOString(), iterations: [{ pr: { number: 42, headRefName: "feature/stack-b", baseRefName: "feature/stack-a", headRefOid: head }, logicalTaskBudget: { acceptedLogicalTaskCount: 1, logicalTaskKey: "task-927", charged: true }, reviewConvergenceState: { twoLoop: { localSourceChangingRoundsPerEpoch: 2, githubTriggeredFixEpochsPerPr: 1, lifetimeLocalSourceChangingRounds: 9 } }, recovery: { state: { phase: "validation", nextSafeAction: "run_tests" } } }] };
  const activePath = writeActiveRunState(config, summary);
  const persisted = JSON.parse(readFileSync(activePath, "utf8"));
  assert.equal(persisted.operationalProjection.counters.acceptedTaskBudget.consumed, 1);
  assert.equal(persisted.operationalProjection.counters.localSourceChangingRoundsPerEpoch, 2);
  const status = getRunnerStatus(config);
  assert.equal(status.operationalProjection.recovery.nextSafeAction, "run_tests");
  assert.equal(status.currentOrLastPr.baseRefName, "feature/stack-a");
});

test("output bounds reject unbounded models", async () => {
  const model = await buildOperationalStatusProjection(adapters(), { now: () => new Date(0) });
  assert.throws(() => assertBoundedProjection({ ...model, padding: "x".repeat(70 * 1024) }), /too_large/);
});

test("milestone ledger policy requests bounded hygiene and ephemeral transitions never do", () => {
  for (const kind of ["implementation_pr_merged", "issue_posture_changed", "umbrella_scope_changed", "manual_gate_changed", "production_activation_posture_changed", "major_acceptance_completed", "scheduled_reconciliation"]) assert.equal(ledgerHygieneDecision({ kind }).request, true, kind);
  for (const kind of ["wait", "retry", "heartbeat", "check_poll", "source_cycle", "session_rotation", "control_transition", "unknown"]) assert.equal(ledgerHygieneDecision({ kind }).request, false, kind);
});
