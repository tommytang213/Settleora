import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  associatedRecoveryDiscoveryIsStable,
  authenticateAssociatedRecoverableState,
  createInitialRecoveryState,
} from "../lib/recovery-state.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixture({ mutateIncident = null, mutateAssociated = null, extraState = null } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-associated-recovery-"));
  chmodSync(root, 0o700);
  const recoveryRoot = path.join(root, "recovery"); mkdirSync(recoveryRoot, { mode: 0o700 });
  const issue = { number: 7, title: "Fixture", url: "https://github.com/example/repo/issues/7" };
  const associated = createInitialRecoveryState({
    taskKey: "20260101T01", issue, runId: "run-original", supervisorRunId: "supervisor-original",
    branchName: "feature/issue-7", baseSha: "a".repeat(40), currentHeadSha: "a".repeat(40),
    phase: "implementation_or_bundle_slice", firstIncompleteAction: "run_implementation",
  });
  const incident = createInitialRecoveryState({
    taskKey: "20260101T010101", issue, runId: "run-original", supervisorRunId: "supervisor-original",
    branchName: "feature/issue-7", baseSha: "a".repeat(40), currentHeadSha: "b".repeat(40),
    phase: "implementation_or_bundle_slice", firstIncompleteAction: "implement",
  });
  const charge = "c".repeat(64);
  const markers = {
    claim: { "issue-7": { status: "completed", target: issue.url, correlation: "run-original" } },
    logical_task_charge: { [charge]: { status: "completed", target: "issue-7", correlation: charge } },
    branch_ownership_created: { [`feature/issue-7:${"a".repeat(40)}`]: { status: "completed", target: "feature/issue-7", correlation: "a".repeat(40) } },
  };
  associated.mutationMarkers = structuredClone(markers); incident.mutationMarkers = structuredClone(markers);
  incident.timestamps.createdAt = associated.timestamps.createdAt;
  incident.expectedReportPaths = {
    repoReportPath: path.join(root, `settleora-codex-report-${incident.taskKey}-issue-7-fixture.md`),
    promptPath: path.join(root, `${incident.taskKey}-issue-7-fixture.md`),
  };
  incident.ordinaryContinuation = {
    identity: { baseSha: "a".repeat(40), headSha: "b".repeat(40), treeSha: "d".repeat(40), changedFilesDigest: "e".repeat(64), diffDigest: "f".repeat(64) },
    counters: { acceptedLogicalTasks: 1, localSourceChangingRoundsPerEpoch: 0, githubTriggeredFixEpochsPerPr: 0, lifetimeLocalSourceChangingRounds: 0 },
  };
  incident.sessionLifecycle = { repository: "example/repo", mutationAuthority: { status: "terminal", generation: 2 }, sessions: { current: "session-2" } };
  incident.phase = "stopped"; incident.firstIncompleteAction = "lifecycle_stopped"; incident.nextSafeAction = "lifecycle_stopped";
  mutateIncident?.(incident); mutateAssociated?.(associated);
  const incidentPath = path.join(recoveryRoot, "incident.json");
  const associatedPath = path.join(recoveryRoot, "associated.json");
  writeFileSync(incidentPath, JSON.stringify(incident), { mode: 0o600 });
  writeFileSync(associatedPath, JSON.stringify(associated), { mode: 0o600 });
  if (extraState) writeFileSync(path.join(recoveryRoot, "extra.json"), JSON.stringify(extraState), { mode: 0o600 });
  const invoke = (overrides = {}) => authenticateAssociatedRecoverableState({
    config: { logsRoot: root, repositorySlug: "example/repo" },
    incidentPath,
    incidentSha256: sha256(readFileSync(incidentPath)),
    associatedRecoveryPath: associatedPath,
    associatedRecoverySha256: sha256(readFileSync(associatedPath)),
    ...overrides,
  });
  return { root, incident, associated, incidentPath, associatedPath, invoke, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("current-shaped incident and distinct associated recovery authenticate as two artifacts", () => {
  const f = fixture();
  try {
    const result = f.invoke();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.notEqual(result.binding.path, result.binding.incident.path);
    assert.equal(result.binding.relationship, "provisional_predecessor_to_terminal_incident_successor");
    assert.equal(result.binding.operationalStatus, "recoverable_operational_state");
    assert.equal(result.binding.taskKey, "20260101T01");
    assert.equal(result.binding.incidentTaskKey, "20260101T010101");
    assert.equal(result.binding.phase, "implementation_or_bundle_slice");
    assert.deepEqual(result.binding.noEffectPosture, {
      remoteHeadAbsent: true,
      prAbsent: true,
      pushMarkerAbsent: true,
      mergeMarkerAbsent: true,
      commentMarkerAbsent: true,
      issueCloseMarkerAbsent: true,
      unexpectedMarkersAbsent: true,
      ordinaryContinuationAbsent: true,
      generatedWorkAbsent: true,
      productAuthorityAbsent: true,
      localEvidenceAbsent: true,
    });
    assert.equal(Object.keys(result).includes("incidentState"), false);
  } finally { f.cleanup(); }
});

test("incident and associated path, SHA, and byte drift fail closed", () => {
  const f = fixture();
  try {
    assert.equal(f.invoke({ incidentSha256: "0".repeat(64) }).ok, false);
    assert.equal(f.invoke({ associatedRecoverySha256: "0".repeat(64) }).ok, false);
    assert.equal(f.invoke({ associatedRecoveryPath: f.incidentPath }).ok, false);
  } finally { f.cleanup(); }
});

test("associated recovery discovery binds the listed state and descriptor-stable reread", () => {
  const state = { taskKey: "20260101T01", issue: { number: 7 } };
  const associated = {
    path: "/logs/recovery/associated.json", sha256: "a".repeat(64), stateDigest: "b".repeat(64),
    artifactIdentity: "1:2:3", state,
  };
  assert.equal(associatedRecoveryDiscoveryIsStable({
    associated, listedPath: associated.path, listedState: structuredClone(state),
    recheckedAssociated: structuredClone(associated),
  }), true);
  for (const mutate of [
    (input) => { input.listedPath = "/logs/recovery/replaced.json"; },
    (input) => { input.listedState.issue.number = 8; },
    (input) => { input.recheckedAssociated.artifactIdentity = "1:9:3"; },
    (input) => { input.recheckedAssociated.sha256 = "c".repeat(64); },
    (input) => { input.recheckedAssociated.stateDigest = "d".repeat(64); },
  ]) {
    const input = {
      associated, listedPath: associated.path, listedState: structuredClone(state),
      recheckedAssociated: structuredClone(associated),
    };
    mutate(input);
    assert.equal(associatedRecoveryDiscoveryIsStable(input), false);
  }
});

test("task, issue, run, branch, base, head, creation, and marker lineage drift fail closed", () => {
  const cases = [
    (state) => { state.taskKey = "20260101T020202"; },
    (state) => { state.issue.number = 8; },
    (state) => { state.run.runId = "run-other"; },
    (state) => { state.branch.name = "feature/other"; },
    (state) => { state.branch.baseSha = "9".repeat(40); },
    (state) => { state.branch.currentHeadSha = "a".repeat(40); },
    (state) => { state.timestamps.createdAt = "2025-01-01T00:00:00.000Z"; },
    (state) => { state.mutationMarkers.logical_task_charge = {}; },
  ];
  for (const mutateIncident of cases) {
    const f = fixture({ mutateIncident });
    try { assert.equal(f.invoke().ok, false); } finally { f.cleanup(); }
  }
});

test("candidate, lifecycle, counter, phase, status, stop, and no-effect drift fail closed", () => {
  const incidentCases = [
    (state) => { state.ordinaryContinuation.counters = null; },
    (state) => { state.sessionLifecycle.mutationAuthority.status = "active"; },
    (state) => { state.branch.expectedRemoteHeadSha = "b".repeat(40); },
    (state) => { state.mutationMarkers.push = { pushed: true }; },
    ...["number", "url", "headSha", "headRefName", "baseRefName", "state"].map((field) => (state) => { state.pr[field] = field === "number" ? 1 : "unexpected"; }),
    ...["generatedWork", "featureBundle", "outageResubmission"].map((field) => (state) => { state[field] = { unexpected: true }; }),
  ];
  for (const mutateIncident of incidentCases) {
    const f = fixture({ mutateIncident });
    try { assert.equal(f.invoke().ok, false); } finally { f.cleanup(); }
  }
  const associatedCases = [
    (state) => { state.phase = "completed"; },
    (state) => { state.stopReason = { reasonCode: "other" }; },
    (state) => { state.nextSafeAction = "other"; },
    (state) => { state.mutationMarkers.issue_comment = { later: { status: "completed" } }; },
    (state) => { state.mutationMarkers.issue_close = { later: { status: "completed" } }; },
    (state) => { state.mutationMarkers.unrecognized_effect = { later: { status: "completed" } }; },
    (state) => { state.ordinaryContinuation = { effects: { product: true } }; },
    (state) => { state.generatedWork = { path: "unexpected" }; },
    (state) => { state.evidence.localValidation = { ok: true }; },
    (state) => { state.attempts.push({ action: "unexpected" }); },
    ...["number", "url", "headSha", "headRefName", "baseRefName", "state"].map((field) => (state) => { state.pr[field] = field === "number" ? 1 : "unexpected"; }),
    ...["featureBundle", "outageResubmission"].map((field) => (state) => { state[field] = { unexpected: true }; }),
  ];
  for (const mutateAssociated of associatedCases) {
    const f = fixture({ mutateAssociated });
    try { assert.equal(f.invoke().ok, false); } finally { f.cleanup(); }
  }
});

test("provisional task identity and exact claim, charge, and branch markers are authenticated", () => {
  const associatedCases = [
    (state) => { state.taskKey = "20260101T010101"; },
    (state) => { state.mutationMarkers.claim["issue-7"].target = "https://github.com/example/repo/issues/8"; },
    (state) => { state.mutationMarkers.claim["issue-7"].correlation = "run-other"; },
    (state) => { state.mutationMarkers.logical_task_charge["c".repeat(64)].correlation = "d".repeat(64); },
    (state) => { state.mutationMarkers.branch_ownership_created[`feature/issue-7:${"a".repeat(40)}`].target = "feature/other"; },
  ];
  for (const mutateAssociated of associatedCases) {
    const f = fixture({ mutateAssociated });
    try { assert.equal(f.invoke().ok, false); } finally { f.cleanup(); }
  }
});

test("zero, second, unrelated, or newer recoverable states fail closed", () => {
  const zero = fixture({ mutateAssociated: (state) => { state.phase = "completed"; } });
  try { assert.equal(zero.invoke().reasonCode, "associated_recovery_count_invalid"); } finally { zero.cleanup(); }
  for (const mutate of [
    (state) => state,
    (state) => { state.taskKey = "20260101T02"; return state; },
    (state) => { state.timestamps.updatedAt = "2030-01-01T00:00:00.000Z"; return state; },
  ]) {
    const base = fixture();
    const extra = structuredClone(base.associated); mutate(extra);
    base.cleanup();
    const f = fixture({ extraState: extra });
    try { assert.equal(f.invoke().reasonCode, "associated_recovery_count_invalid"); } finally { f.cleanup(); }
  }
});
