import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  authenticateSemanticDeploymentEvidencePackage,
  createOrAdoptSemanticDeploymentEvidencePackage,
  planSemanticDeploymentEvidencePackage,
} from "../lib/deployment-semantic-evidence-package.mjs";
import { createSemanticDeploymentAuthorityReaders } from "../lib/deployment-semantic-evidence-extractors.mjs";
import {
  semanticRecoveryAuthorityClasses,
  semanticRecoveryClaimOwnerMatrix,
} from "../lib/semantic-recovery-authority.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const canonicalJson = (value) => JSON.stringify(canonicalize(value));

function fixture({ readerMutator = null } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-semantic-package-"));
  chmodSync(root, 0o700);
  const claims = completeClaims(root);
  const readers = {};
  for (const authorityClass of semanticRecoveryAuthorityClasses) {
    const owned = Object.fromEntries(Object.entries(semanticRecoveryClaimOwnerMatrix)
      .filter(([, ownership]) => [...ownership.required, ...ownership.optional].includes(authorityClass))
      .map(([claim]) => [claim, structuredClone(claims[claim])]));
    readers[authorityClass] = () => ({
      authorityClass,
      repository: claims.repository,
      provenanceIdentity: sha256(`fixture:${authorityClass}`),
      claims: owned,
    });
  }
  readerMutator?.(readers, claims);
  const makePlan = () => planSemanticDeploymentEvidencePackage({
    configRoot: root,
    packageBasename: "settleora-semantic-deployment-evidence-fixture",
    authorityReaders: readers,
    extractionContext: Object.freeze({ fixture: true }),
    createDocument: ({ packageRoot, sources }) => ({
      contract: "fixture_semantic_deployment_document",
      evidenceRoot: packageRoot,
      sources,
      version: 1,
    }),
  });
  return { root, claims, readers, makePlan, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("package plan is deterministic and performs zero filesystem mutation", () => {
  const f = fixture();
  try {
    const before = readdirSync(f.root);
    const first = f.makePlan();
    const second = f.makePlan();
    assert.equal(first.packageAggregateDigest, second.packageAggregateDigest);
    assert.equal(first.memberManifestDigest, second.memberManifestDigest);
    assert.equal(first.members.length, 10);
    assert.deepEqual(readdirSync(f.root), before);
    assert.equal(existsSync(first.packageRoot), false);
    assert.equal(existsSync(first.incomingRoot), false);
  } finally { f.cleanup(); }
});

test("mutating preparation creates one exact atomically readable package", () => {
  const f = fixture();
  try {
    const plan = f.makePlan();
    const result = createOrAdoptSemanticDeploymentEvidencePackage(plan);
    assert.equal(result.action, "created");
    assert.equal(existsSync(plan.incomingRoot), false);
    assert.equal((statSync(plan.packageRoot).mode & 0o777), 0o700);
    assert.deepEqual(readdirSync(plan.packageRoot).sort(), plan.members.map((member) => member.name).sort());
    for (const member of plan.members) {
      const info = lstatSync(path.join(plan.packageRoot, member.name));
      assert.equal(info.isFile(), true);
      assert.equal(info.nlink, 1);
      assert.equal(info.mode & 0o777, 0o600);
    }
    const authenticated = authenticateSemanticDeploymentEvidencePackage(plan.documentPath);
    assert.equal(authenticated.evidence.packageAggregateDigest, plan.packageAggregateDigest);
  } finally { f.cleanup(); }
});

test("exact rerun adopts final package without changing any member bytes", () => {
  const f = fixture();
  try {
    const plan = f.makePlan();
    createOrAdoptSemanticDeploymentEvidencePackage(plan);
    const before = snapshot(plan.packageRoot);
    const secondPlan = f.makePlan();
    const result = createOrAdoptSemanticDeploymentEvidencePackage(secondPlan);
    assert.equal(result.action, "adopted");
    assert.deepEqual(snapshot(plan.packageRoot), before);
  } finally { f.cleanup(); }
});

test("adoption result remains bound to every digest in the planned bytes", () => {
  const f = fixture();
  try {
    const plan = f.makePlan();
    createOrAdoptSemanticDeploymentEvidencePackage(plan);
    for (const drift of [
      { packageAggregateDigest: "0".repeat(64) },
      { packageManifestDigest: "1".repeat(64) },
      { memberManifestDigest: "2".repeat(64) },
    ]) {
      assert.throws(() => createOrAdoptSemanticDeploymentEvidencePackage({ ...plan, ...drift }), /differ from plan/);
    }
    const members = plan.members.map((member) => member.name === "deployment-evidence.json"
      ? { ...member, sha256: "3".repeat(64) } : member);
    assert.throws(() => createOrAdoptSemanticDeploymentEvidencePackage({ ...plan, members }), /plan members invalid/);
  } finally { f.cleanup(); }
});

test("an exact crash-staged incoming package is adopted by one directory rename", () => {
  const f = fixture();
  try {
    const plan = f.makePlan();
    mkdirSync(plan.incomingRoot, { mode: 0o700 });
    for (const member of plan.members) writeFileSync(path.join(plan.incomingRoot, member.name), member.bytes, { mode: 0o600 });
    const result = createOrAdoptSemanticDeploymentEvidencePackage(plan);
    assert.equal(result.action, "adopted_incoming");
    assert.equal(existsSync(plan.incomingRoot), false);
    assert.equal(existsSync(plan.packageRoot), true);
  } finally { f.cleanup(); }
});

test("conflicting final, incoming, and retired residue fail closed without cleanup", () => {
  for (const setup of [
    (plan) => { mkdirSync(plan.packageRoot, { mode: 0o700 }); writeFileSync(path.join(plan.packageRoot, "wrong.json"), "{}", { mode: 0o600 }); },
    (plan) => { mkdirSync(plan.incomingRoot, { mode: 0o700 }); writeFileSync(path.join(plan.incomingRoot, "wrong.json"), "{}", { mode: 0o600 }); },
    (plan) => mkdirSync(plan.retiredRoot, { mode: 0o700 }),
  ]) {
    const f = fixture();
    try {
      const plan = f.makePlan(); setup(plan);
      assert.throws(() => createOrAdoptSemanticDeploymentEvidencePackage(plan), /residue conflict/);
      assert.equal(readdirSync(f.root).length, 1);
    } finally { f.cleanup(); }
  }
});

test("package authentication rejects extra, nested, symlink, hard-link, and mode attacks", () => {
  for (const mutate of [
    (plan) => writeFileSync(path.join(plan.packageRoot, "extra.json"), "{}", { mode: 0o600 }),
    (plan) => mkdirSync(path.join(plan.packageRoot, "nested"), { mode: 0o700 }),
    (plan) => { const file = path.join(plan.packageRoot, "repository_git.json"); rmSync(file); symlinkSync("lifecycle.json", file); },
    (plan) => linkSync(path.join(plan.packageRoot, "repository_git.json"), path.join(plan.packageRoot, "alias.json")),
    (plan) => chmodSync(path.join(plan.packageRoot, "repository_git.json"), 0o640),
  ]) {
    const f = fixture();
    try {
      const plan = f.makePlan(); createOrAdoptSemanticDeploymentEvidencePackage(plan); mutate(plan);
      assert.throws(() => authenticateSemanticDeploymentEvidencePackage(plan.documentPath));
    } finally { f.cleanup(); }
  }
});

test("package boundaries reject unsafe basename, parent mode, and non-package document paths", () => {
  const f = fixture();
  try {
    assert.throws(() => planSemanticDeploymentEvidencePackage({
      configRoot: f.root, packageBasename: "../escape", authorityReaders: f.readers,
      extractionContext: {}, createDocument: () => ({}),
    }), /basename/);
    chmodSync(f.root, 0o770);
    assert.throws(() => f.makePlan(), /parent unsafe/);
    chmodSync(f.root, 0o700);
    const plan = f.makePlan(); createOrAdoptSemanticDeploymentEvidencePackage(plan);
    assert.throws(() => authenticateSemanticDeploymentEvidencePackage(path.join(plan.packageRoot, "repository_git.json")), /document name/);
  } finally { f.cleanup(); }
});

test("all eight source projections are required and copied provenance fails independence", () => {
  const missing = fixture({ readerMutator: (readers) => { delete readers.lifecycle; } });
  try { assert.throws(() => missing.makePlan(), /extractor missing/); } finally { missing.cleanup(); }
  const copied = fixture({ readerMutator: (readers) => {
    const original = readers.lifecycle;
    readers.lifecycle = (context) => ({ ...original(context), provenanceIdentity: sha256("fixture:repository_git") });
  } });
  try { assert.throws(() => copied.makePlan(), /provenance copied/); } finally { copied.cleanup(); }
});

test("each extractor is claim-owner closed and stale or contradictory readers fail closed", () => {
  const foreign = fixture({ readerMutator: (readers) => {
    const original = readers.repository_git;
    readers.repository_git = (context) => ({ ...original(context), claims: { ...original(context).claims, chargeId: "f".repeat(64) } });
  } });
  try { assert.throws(() => foreign.makePlan(), /foreign claim/); } finally { foreign.cleanup(); }
  for (const readerMutator of [
    (readers) => { readers.lifecycle = () => null; },
    (readers) => { readers.lifecycle = () => { throw new Error("stale source"); }; },
    (readers) => { const original = readers.lifecycle; readers.lifecycle = (context) => ({ ...original(context), repository: "other/repo" }); },
    (readers) => { const original = readers.lifecycle; readers.lifecycle = (context) => {
      const value = original(context); const claims = { ...value.claims }; delete claims.taskKey; return { ...value, claims };
    }; },
  ]) {
    const f = fixture({ readerMutator });
    try { assert.throws(() => f.makePlan()); } finally { f.cleanup(); }
  }
});

test("production extractors derive each owned projection from authenticated domain inputs without a merged claim object", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-semantic-readers-"));
  try {
    const claims = completeClaims(root);
    const context = productionReaderContext(claims);
    assert.equal(Object.hasOwn(context, "common"), false);
    const readers = createSemanticDeploymentAuthorityReaders();
    for (const authorityClass of semanticRecoveryAuthorityClasses) {
      const result = readers[authorityClass](context);
      const owned = Object.entries(semanticRecoveryClaimOwnerMatrix)
        .filter(([, ownership]) => [...ownership.required, ...ownership.optional].includes(authorityClass))
        .map(([claim]) => claim).sort();
      assert.deepEqual(Object.keys(result.claims).sort(), owned);
      for (const claim of owned) assert.deepEqual(result.claims[claim], claims[claim]);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function snapshot(root) {
  return readdirSync(root).sort().map((name) => {
    const file = path.join(root, name); const info = statSync(file);
    return { name, mode: info.mode & 0o777, sha256: sha256(readFileSync(file)) };
  });
}

function completeClaims(root) {
  const digest = (character) => character.repeat(64);
  const sha = (character) => character.repeat(40);
  return {
    repository: "example/repo", issueNumber: 7, taskKey: "20260101T010101", claimIdentity: "example/repo#7", chargeId: digest("c"),
    originalRunnerRunId: "run-original", originalSupervisorRunId: "supervisor-original",
    failedContinuationRunnerRunId: "run-failed", failedContinuationSupervisorRunId: "supervisor-failed",
    consumedRunnerRunId: "run-consumed", consumedSupervisorRunId: "supervisor-consumed",
    originalSpecIdentity: digest("1"), originalStateIdentity: digest("2"), originalIterationIdentity: digest("3"), originalSummaryIdentity: digest("4"),
    failedContinuationSpecIdentity: digest("5"), failedContinuationStateIdentity: digest("6"), failedContinuationHeartbeatIdentity: digest("7"), failedContinuationSummaryIdentity: digest("8"),
    consumedSpecIdentity: digest("9"), consumedStateIdentity: digest("a"), consumedIterationIdentity: digest("b"), consumedSummaryIdentity: digest("c"),
    branch: "feature/issue-7", baseSha: sha("a"), headSha: sha("b"), treeSha: sha("c"), changedFilesDigest: digest("d"), diffDigest: digest("e"),
    acceptedLogicalTasks: 1, localSourceChangingRounds: 0, githubTriggeredFixEpochs: 0, lifetimeLocalSourceChangingRounds: 0,
    formerRootPath: path.join(root, "incident.json"), formerRootSha256: digest("f"), formerEffectivePhase: "checkpoint_validation_commit",
    incidentPath: path.join(root, "incident.json"), incidentSha256: digest("0"), predecessorBytesAvailable: false,
    prEvidenceDigest: digest("1"), runtimeSourceSha: sha("d"), installedBundleDigest: digest("2"), installedManifestDigest: digest("3"),
    runtimeProfileDigest: digest("4"), runtimeApprovalDigest: digest("5"), launcherDigest: digest("6"), healthUnitDigest: digest("7"),
    lifecycleLineage: "terminal_validation_retry_to_distinct_successor", lifecycleSessionId: "session", lifecycleMutationGeneration: 2,
    intentPosture: "one_no_effect_overlay_then_consumed_submission", validationEffect: false, reviewEffect: false, sourceEffect: false,
    pushEffect: false, prEffect: false, commentEffect: false, mergeEffect: false, issueEffect: false, productEffect: false,
    submissionCount: 1, submissionExhausted: true, successorEligible: true, earliestSafePhase: "checkpoint_validation_commit",
  };
}

function productionReaderContext(claims) {
  const artifact = (name, digest = sha256(name)) => ({ path: `/authenticated/${name}`, sha256: digest, identity: `fixture:${name}` });
  const budgetArtifact = artifact("budget");
  const lifecycleArtifact = artifact("lifecycle");
  const role = (prefix, runner, supervisor, values) => ({
    runner, supervisor,
    spec: artifact(`${prefix}-spec`, values.spec),
    supervisorState: artifact(`${prefix}-state`, values.state),
    iteration: artifact(`${prefix}-iteration`, values.iteration),
    summary: artifact(`${prefix}-summary`, values.summary),
    heartbeat: artifact(`${prefix}-heartbeat`, values.heartbeat || sha256(`${prefix}-heartbeat`)),
  });
  const runArtifacts = {
    original: role("original", claims.originalRunnerRunId, claims.originalSupervisorRunId, {
      spec: claims.originalSpecIdentity, state: claims.originalStateIdentity,
      iteration: claims.originalIterationIdentity, summary: claims.originalSummaryIdentity,
    }),
    failed: role("failed", claims.failedContinuationRunnerRunId, claims.failedContinuationSupervisorRunId, {
      spec: claims.failedContinuationSpecIdentity, state: claims.failedContinuationStateIdentity,
      iteration: sha256("failed-iteration-unused"), summary: claims.failedContinuationSummaryIdentity,
      heartbeat: claims.failedContinuationHeartbeatIdentity,
    }),
    consumed: role("consumed", claims.consumedRunnerRunId, claims.consumedSupervisorRunId, {
      spec: claims.consumedSpecIdentity, state: claims.consumedStateIdentity,
      iteration: claims.consumedIterationIdentity, summary: claims.consumedSummaryIdentity,
    }),
  };
  runArtifacts.failed.spec.value = { recoveryOnlyTarget: { terminalValidationRetryDerivativeNoPr: true } };
  runArtifacts.failed.iteration.value = {
    pr: { number: null }, remoteHeadSha: null, effects: {},
    recovery: { terminalDerivativeProjection: { ok: true } },
  };
  runArtifacts.consumed.iteration.value = {
    outcome: "terminal_lifecycle_reconciled", pr: { number: null }, remoteHeadSha: null, effects: {},
    recovery: {
      state: { taskKey: claims.taskKey, issueNumber: claims.issueNumber },
      lifecycle: { state: { controller: {
        localSourceChangingRoundsPerEpoch: claims.localSourceChangingRounds,
        githubTriggeredFixEpochsPerPr: claims.githubTriggeredFixEpochs,
        lifetimeLocalSourceChangingRounds: claims.lifetimeLocalSourceChangingRounds,
      } } },
    },
  };
  const evidence = Object.fromEntries(semanticRecoveryAuthorityClasses.map((authorityClass) => [authorityClass, [artifact(authorityClass)]]));
  return {
    repository: claims.repository,
    incident: {
      issue: { number: claims.issueNumber }, taskKey: claims.taskKey,
      pr: { number: null }, mutationMarkers: {},
      ordinaryContinuation: {
        effects: {}, sourceFailureHistory: [{}], processedGithubFindingFingerprints: [],
        sourceFailureBatch: { findings: [{ sourceFixEligible: false, retryable: false, classification: "unsafe_or_ambiguous" }] },
        preparedGithubSourceFailureBatch: null, sourceFailureCommitEffect: null,
      },
    },
    association: { chargeId: claims.chargeId },
    associatedState: {
      pr: { number: null }, mutationMarkers: {}, generatedWork: null, featureBundle: null, outageResubmission: null,
    },
    intentLineage: {
      proof: { commitEffectFinalized: true, reportPromptBound: true, noLaterSourceEffect: true },
    },
    candidate: {
      branch: claims.branch, baseSha: claims.baseSha, headSha: claims.headSha, treeSha: claims.treeSha,
      changedFilesDigest: claims.changedFilesDigest, diffDigest: claims.diffDigest,
    },
    lifecycleState: {
      logicalTask: {
        issueNumber: claims.issueNumber, taskKey: claims.taskKey, claimIdentity: claims.claimIdentity,
        runId: claims.originalRunnerRunId, supervisorRunId: claims.originalSupervisorRunId,
        chargeMarkerRef: budgetArtifact.path,
      },
      sessions: { current: claims.lifecycleSessionId },
      mutationAuthority: { generation: claims.lifecycleMutationGeneration },
      reservations: { logical_task_charge: { [claims.chargeId]: {} } },
      controller: {
        phase: claims.earliestSafePhase,
        localSourceChangingRoundsPerEpoch: claims.localSourceChangingRounds,
        githubTriggeredFixEpochsPerPr: claims.githubTriggeredFixEpochs,
        lifetimeLocalSourceChangingRounds: claims.lifetimeLocalSourceChangingRounds,
      },
      recovery: { status: "pending", phaseAfter: claims.earliestSafePhase, effectsAlreadyPresent: { mutation: false, commit: true } },
    },
    lifecycleArtifact,
    budgetArtifact,
    budgetState: {
      acceptedLogicalTaskCount: claims.acceptedLogicalTasks,
      charges: { [claims.chargeId]: {
        chargeId: claims.chargeId, identityClass: "accepted_issue_claim",
        identity: { repository: claims.repository, issueNumber: claims.issueNumber, claimIdentity: claims.claimIdentity },
      } },
    },
    counters: {
      localSourceChangingRoundsPerEpoch: claims.localSourceChangingRounds,
      githubTriggeredFixEpochsPerPr: claims.githubTriggeredFixEpochs,
      lifetimeLocalSourceChangingRounds: claims.lifetimeLocalSourceChangingRounds,
    },
    runArtifacts,
    github: {
      digest: claims.prEvidenceDigest,
      claims: Object.fromEntries(["pushEffect", "prEffect", "commentEffect", "mergeEffect", "issueEffect", "productEffect"].map((key) => [key, claims[key]])),
    },
    formerRootSha256: claims.formerRootSha256,
    formerEffectivePhase: claims.formerEffectivePhase,
    incidentPath: claims.incidentPath,
    incidentSha256: claims.incidentSha256,
    projectAuthority: {
      runtimeSourceSha: claims.runtimeSourceSha,
      runtimeBundleDigest: claims.installedBundleDigest,
      artifacts: {
        runtimeManifest: { sha256: claims.installedManifestDigest },
        approvedProfile: { sha256: claims.runtimeProfileDigest },
        runtimeApproval: { sha256: claims.runtimeApprovalDigest },
        runtimeLauncher: { sha256: claims.launcherDigest },
        healthUnit: { sha256: claims.healthUnitDigest },
      },
    },
    domainEvidence: evidence,
  };
}
