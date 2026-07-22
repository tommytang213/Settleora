import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getRunnerStatus, writeActiveRunState } from "../lib/control-plane.mjs";
import { sanitizePersistedEvidence } from "../lib/evidence-sanitizer.mjs";
import {
  assertBoundedProjection,
  buildOperationalStatusProjection,
  ledgerHygieneDecision,
  operationalStateInventory,
  renderOperationalStatusMarkdown,
} from "../lib/operational-status-projection.mjs";
import { createProjectionAdapters } from "../settleora-auto-runnerctl.mjs";
import { writeSupervisorState } from "../supervisor/supervisor-state.mjs";

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
      review: { exactHead: head, validationHead: head, geminiHead: head, localCodexHead: head, githubCodexHead: head, ciHead: head, scannerHead: head, validationStatus: "pass", geminiStatus: "pass", localCodexStatus: "pass", githubCodexStatus: "pending", ciStatus: "pending", scannerStatus: "pending", unresolvedThreads: 0, openAlerts: 0 },
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

test("each review result is independently exact-head bound", async () => {
  const baseLocal = await adapters().local.read();
  const model = await buildOperationalStatusProjection(adapters({
    local: { ...baseLocal, review: { ...baseLocal.review, validationHead: main, geminiHead: main } },
  }), { now: () => new Date(0) });
  assert.equal(model.review.validationStatus, null);
  assert.equal(model.review.geminiStatus, null);
  assert.equal(model.review.localCodexStatus, "pass");
  assert.deepEqual(model.review.staleSources, ["validation", "gemini"]);
});

test("live GitHub checks override a retained CI snapshot on the same head", async () => {
  const base = adapters();
  const github = await base.github.read();
  const local = await base.local.read();
  const model = await buildOperationalStatusProjection(adapters({
    github: { ...github, pr: { ...github.pr, checks: { status: "pass" } } },
    local: { ...local, review: { ...local.review, ciStatus: "pending" } },
  }), { now: () => new Date(0) });
  assert.equal(model.review.ciStatus, "pass");
  assert.equal(model.review.sourceHeads.ci, head);
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
    if (command === "git" && args[0] === "--no-optional-locks" && args[1] === "show") return { status: 0, stdout: `${"historical ledger line\n".repeat(2000)}#927 is closed after accepted merge evidence.\nCurrent main SHA ${main}\n` };
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

test("production supervisor correlation failures propagate as fail-closed reason codes", async () => {
  const spawnSync = (command, args) => {
    if (command === "git" && args[1] === "branch") return { status: 0, stdout: "feature/auto-927\n" };
    if (command === "git" && args[1] === "rev-parse") return { status: 0, stdout: `${head}\n` };
    if (command === "git" && args[1] === "status") return { status: 0, stdout: "" };
    if (command === "git" && args[1] === "show") return { status: 0, stdout: "#927 remains open.\n" };
    if (command === "gh") return { status: 0, stdout: "{}" };
    return { status: 1, stdout: "" };
  };
  const production = createProjectionAdapters({ repoRoot: "/repo", repositorySlug: "tommytang213/Settleora" }, { spawnSync, getRunnerStatus: () => ({ active: true, activeRunId: "run-927", supervisorRunId: "supervisor-927", operationalProjection: {} }), readSupervisorProjection: () => ({ ok: false, reasonCode: "active_supervisor_heartbeat_stale" }) });
  const model = await buildOperationalStatusProjection(production, { now: () => new Date(0) });
  assert.equal(model.status, "blocked");
  assert.ok(model.blockers.includes("active_supervisor_heartbeat_stale"));
});

test("production adapters preserve pre-PR checkpoint branch and head identity", async () => {
  const switchedHead = "d".repeat(40);
  const spawnSync = (command, args) => {
    if (command === "git" && args[1] === "branch") return { status: 0, stdout: "feature/switched\n" };
    if (command === "git" && args[1] === "rev-parse") return { status: 0, stdout: `${args.at(-1) === "origin/main" ? main : switchedHead}\n` };
    if (command === "git" && args[1] === "status") return { status: 0, stdout: "" };
    if (command === "git" && args[1] === "show") return { status: 0, stdout: "" };
    if (command === "gh" && args[0] === "issue") return { status: 0, stdout: JSON.stringify({ number: 927, state: "OPEN", labels: [] }) };
    return { status: 1, stdout: "" };
  };
  const production = createProjectionAdapters({ repoRoot: "/repo", repositorySlug: "tommytang213/Settleora" }, {
    spawnSync,
    getRunnerStatus: () => ({
      active: true,
      activeRunId: "run-pre-pr",
      currentOrLastIssue: { number: 927 },
      currentOrLastPr: null,
      operationalProjection: { taskIdentity: { branch: "feature/expected", baseSha: main, headSha: head } },
    }),
    readSupervisorProjection: () => ({ ok: true, value: {} }),
  });
  const model = await buildOperationalStatusProjection(production, { now: () => new Date(0) });
  assert.equal(model.task.branch, "feature/expected");
  assert.equal(model.task.headSha, head);
  assert.equal(model.status, "blocked");
  assert.ok(model.blockers.includes("active_repository_branch_identity_conflict"));
  assert.ok(model.blockers.includes("active_repository_head_identity_conflict"));
});

test("production projection selects a submitted supervisor before its child runner starts", async () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-supervisor-submitted-"));
  const supervisorRunId = "supervised-20260722T044700Z-abcdef123456";
  writeSupervisorState(supervisorRunId, { state: "submitted", createdAt: new Date().toISOString(), runnerRunId: "run-allocated-before-child-state" }, logsRoot);
  const spawnSync = (command, args) => {
    if (command === "git" && args[1] === "branch") return { status: 0, stdout: "main\n" };
    if (command === "git" && args[1] === "rev-parse") return { status: 0, stdout: `${head}\n` };
    if (command === "git" && args[1] === "status") return { status: 0, stdout: "" };
    if (command === "git" && args[1] === "show") return { status: 0, stdout: "ledger\n" };
    return { status: 1, stdout: "" };
  };
  const production = createProjectionAdapters({ logsRoot, repoRoot: "/repo", repositorySlug: "tommytang213/Settleora" }, {
    spawnSync,
    getRunnerStatus: () => ({ active: false, activeRunId: "run-retained-before-submission", supervisorRunId: "supervised-20260721T010000Z-111111111111", operationalProjection: {} }),
  });
  const model = await buildOperationalStatusProjection(production, { now: () => new Date(0) });
  assert.equal(model.supervisor.runId, supervisorRunId);
  assert.equal(model.supervisor.state, "submitted");
  assert.equal(model.task.runId, null);
  assert.equal(model.task.logicalTaskKey, null);
  assert.equal(model.task.issueNumber, null);
});

test("an active foreground runner ignores unrelated historical supervisor state", async () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-foreground-runner-"));
  writeSupervisorState("supervised-20260722T044800Z-abcdef123456", { state: "completed", createdAt: new Date().toISOString(), runnerRunId: "run-2026-07-22T044800Z" }, logsRoot);
  const spawnSync = (command, args) => {
    if (command === "git" && args[1] === "branch") return { status: 0, stdout: "main\n" };
    if (command === "git" && args[1] === "rev-parse") return { status: 0, stdout: `${head}\n` };
    if (command === "git" && args[1] === "status") return { status: 0, stdout: "" };
    if (command === "git" && args[1] === "show") return { status: 0, stdout: "ledger\n" };
    return { status: 1, stdout: "" };
  };
  const production = createProjectionAdapters({ logsRoot, repoRoot: "/repo", repositorySlug: "tommytang213/Settleora" }, {
    spawnSync,
    getRunnerStatus: () => ({ active: true, activeRunId: "run-2026-07-22T050000Z", supervisorRunId: null, operationalProjection: {} }),
  });
  const model = await buildOperationalStatusProjection(production, { now: () => new Date(0) });
  assert.equal(model.status, "active");
  assert.equal(model.supervisor.runId, null);
});

test("an inactive foreground summary ignores unrelated historical supervisor state", async () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-inactive-foreground-"));
  writeSupervisorState("supervised-20260722T044800Z-abcdef123456", { state: "completed", createdAt: "2026-07-22T04:48:00.000Z", updatedAt: "2026-07-22T04:49:00.000Z", runnerRunId: "run-old-supervised" }, logsRoot);
  const spawnSync = (command, args) => {
    if (command === "git" && args[1] === "branch") return { status: 0, stdout: "main\n" };
    if (command === "git" && args[1] === "rev-parse") return { status: 0, stdout: `${head}\n` };
    if (command === "git" && args[1] === "status") return { status: 0, stdout: "" };
    if (command === "git" && args[1] === "show") return { status: 0, stdout: "ledger\n" };
    return { status: 1, stdout: "" };
  };
  const production = createProjectionAdapters({ logsRoot, repoRoot: "/repo", repositorySlug: "tommytang213/Settleora" }, {
    spawnSync,
    getRunnerStatus: () => ({ active: false, activeRunId: "run-final-foreground", supervisorRunId: null, latestTerminalOutcome: "completed", lastEventAt: "2026-07-22T05:00:00.000Z", operationalProjection: {} }),
  });
  const model = await buildOperationalStatusProjection(production, { now: () => new Date(0) });
  assert.equal(model.status, "completed");
  assert.equal(model.supervisor.runId, null);
  assert.equal(model.blockers.includes("supervisor_runner_identity_conflict"), false);
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
  assert.deepEqual(persisted.operationalProjection.counters.localSourceChangingRoundsPerEpoch, { value: 2, limit: 50 });
  assert.deepEqual(persisted.operationalProjection.counters.githubTriggeredFixEpochsPerPr, { value: 1, limit: 50 });
  const status = getRunnerStatus(config);
  assert.equal(status.operationalProjection.recovery.nextSafeAction, "run_tests");
  assert.equal(status.currentOrLastPr.baseRefName, "feature/stack-a");
});

test("active-run persistence projects CI from the latest correlated wait attempt", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-ci-wait-"));
  mkdirSync(path.join(logsRoot, "state"), { recursive: true });
  const config = { logsRoot, maxIterations: 1, maxRuntimeMs: 60_000 };
  const activePath = writeActiveRunState(config, { runId: "run-ci-wait", startedAt: new Date().toISOString(), iterations: [{ autoMerge: { waitAttempts: [{ prHeadSha: head, checks: { state: "pending" } }, { prHeadSha: head, checks: { state: "success" } }] } }] });
  const review = JSON.parse(readFileSync(activePath, "utf8")).operationalProjection.review;
  assert.equal(review.ciStatus, "pass");
  assert.equal(review.ciHead, head);
});

test("persisted evidence redacts arbitrary authorization schemes without hiding reason codes", () => {
  const secret = "credential-material-927";
  const nonce = "nonce-material-927";
  const sanitized = sanitizePersistedEvidence({
    error: `Authorization: Digest username=${secret}, realm="settleora", nonce=${nonce}, response=hash\nnext line`,
    alternate: `authorization=ApiKey ${secret}`,
    tokenScheme: ["Authoriza", "tion: Signature.v2 ", secret, "-", nonce].join(""),
    reasonCode: "protected_stack_plan_authorization_missing",
  });
  assert.equal(JSON.stringify(sanitized).includes(secret), false);
  assert.equal(JSON.stringify(sanitized).includes(nonce), false);
  assert.match(sanitized.error, /next line/);
  assert.equal(sanitized.reasonCode, "protected_stack_plan_authorization_missing");
});

test("charged task digests and pre-PR candidate identity remain authoritative", async () => {
  const chargeId = "c".repeat(64);
  const baseLocal = await adapters().local.read();
  const model = await buildOperationalStatusProjection(adapters({
    github: { repositorySlug: "tommytang213/Settleora", issue: { number: 927, state: "OPEN" }, pr: null },
    local: {
      ...baseLocal,
      task: { ...baseLocal.task, logicalTaskKey: chargeId, prNumber: null, branch: "feature/expected", baseSha: main, headSha: head },
    },
  }), { now: () => new Date(0) });
  assert.equal(model.task.logicalTaskKey, chargeId);
  assert.equal(model.status, "blocked");
  assert.ok(model.blockers.includes("active_repository_branch_identity_conflict"));
});

test("production split and stack checkpoint state shapes remain visible", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-split-stack-state-"));
  mkdirSync(path.join(logsRoot, "state"), { recursive: true });
  const config = { logsRoot, maxIterations: 1, maxRuntimeMs: 60_000 };
  const activePath = writeActiveRunState(config, {
    runId: "run-split-stack",
    startedAt: new Date().toISOString(),
    iterations: [{
      featureBundleSplit: { state: { phase: "materializing" } },
      prStackExecution: { state: "handoff" },
    }],
  });
  const large = JSON.parse(readFileSync(activePath, "utf8")).operationalProjection.largeCandidate;
  assert.equal(large.splitState, "materializing");
  assert.equal(large.stackState, "handoff");
  assert.equal(large.handoffState, "handoff");
});

test("inactive status binds run identity and path to the selected final summary", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-final-summary-"));
  mkdirSync(path.join(logsRoot, "state"), { recursive: true });
  mkdirSync(path.join(logsRoot, "summaries"), { recursive: true });
  writeFileSync(path.join(logsRoot, "state", "active-run.json"), JSON.stringify({
    pid: 99999999,
    runId: "run-retained",
    startedAt: "2026-07-22T00:00:00.000Z",
    summaryPath: path.join(logsRoot, "summaries", "run-retained.json"),
    iterations: [{ issue: { number: 1 } }],
  }));
  const finalSummaryPath = path.join(logsRoot, "summaries", "run-final.json");
  writeFileSync(finalSummaryPath, JSON.stringify({
    runId: "run-final",
    startedAt: "2026-07-22T01:00:00.000Z",
    finishedAt: "2026-07-22T02:00:00.000Z",
    iterations: [{ issue: { number: 927 }, outcome: "completed" }],
  }));

  const status = getRunnerStatus({ logsRoot });
  assert.equal(status.active, false);
  assert.equal(status.activeRunId, "run-final");
  assert.equal(status.paths.summary, finalSummaryPath);
  assert.equal(status.currentOrLastIssue.number, 927);
});

test("a live lock rejects a differently identified stale active-run record", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-owner-conflict-"));
  mkdirSync(path.join(logsRoot, "state"), { recursive: true });
  mkdirSync(path.join(logsRoot, "locks"), { recursive: true });
  writeFileSync(path.join(logsRoot, "locks", "settleora-auto-runner.lock"), JSON.stringify({ pid: process.pid, runId: "run-live" }));
  writeFileSync(path.join(logsRoot, "state", "active-run.json"), JSON.stringify({ pid: 99999999, runId: "run-stale", startedAt: new Date().toISOString(), iterations: [] }));
  const status = getRunnerStatus({ logsRoot });
  assert.equal(status.active, true);
  assert.equal(status.authorityHealth.activeOwnerConflict, true);
});

test("active ownership fails closed when either authority identity is missing", () => {
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-owner-missing-"));
  mkdirSync(path.join(logsRoot, "state"), { recursive: true });
  mkdirSync(path.join(logsRoot, "locks"), { recursive: true });
  writeFileSync(path.join(logsRoot, "locks", "settleora-auto-runner.lock"), JSON.stringify({ pid: process.pid, runId: "run-live" }));
  writeFileSync(path.join(logsRoot, "state", "active-run.json"), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), iterations: [] }));
  assert.equal(getRunnerStatus({ logsRoot }).authorityHealth.activeOwnerConflict, true);
});

test("output bounds reject unbounded models", async () => {
  const model = await buildOperationalStatusProjection(adapters(), { now: () => new Date(0) });
  assert.throws(() => assertBoundedProjection({ ...model, padding: "x".repeat(70 * 1024) }), /too_large/);
});

test("safe authorization reason codes remain inspectable", async () => {
  const baseLocal = await adapters().local.read();
  const model = await buildOperationalStatusProjection(adapters({
    local: { ...baseLocal, recovery: { ...baseLocal.recovery, reasonCode: "protected_stack_plan_authorization_missing" } },
  }), { now: () => new Date(0) });
  assert.equal(model.recovery.reasonCode, "protected_stack_plan_authorization_missing");
  assert.doesNotThrow(() => assertBoundedProjection(model));
  const logsRoot = mkdtempSync(path.join(tmpdir(), "settleora-safe-reason-"));
  mkdirSync(path.join(logsRoot, "state"), { recursive: true });
  const config = { logsRoot, maxIterations: 1, maxRuntimeMs: 60_000 };
  const activePath = writeActiveRunState(config, { runId: "run-safe-reason", startedAt: new Date().toISOString(), iterations: [{ recovery: { state: { stopReason: { reasonCode: "protected_stack_plan_authorization_missing" } } } }] });
  assert.equal(JSON.parse(readFileSync(activePath, "utf8")).operationalProjection.recovery.reasonCode, "protected_stack_plan_authorization_missing");
});

test("milestone ledger policy requests bounded hygiene and ephemeral transitions never do", () => {
  for (const kind of ["implementation_pr_merged", "issue_posture_changed", "umbrella_scope_changed", "manual_gate_changed", "production_activation_posture_changed", "major_acceptance_completed", "scheduled_reconciliation"]) assert.equal(ledgerHygieneDecision({ kind }).request, true, kind);
  for (const kind of ["wait", "retry", "heartbeat", "check_poll", "source_cycle", "session_rotation", "control_transition", "unknown"]) assert.equal(ledgerHygieneDecision({ kind }).request, false, kind);
});
