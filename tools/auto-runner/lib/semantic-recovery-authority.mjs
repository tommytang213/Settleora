import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

export const semanticRecoveryProtectedControlRoot = "/etc/settleora-auto-runner/semantic-recovery-authority";
export const semanticRecoveryGrantContract = "settleora_semantic_recovery_operation_grant";
export const semanticRecoveryGrantSchemaVersion = 1;
export const semanticRecoveryAllowedAction = "create_or_adopt_semantic_recovery_successor";
export const semanticRecoveryVerifierSetVersion = 1;
export const semanticRecoveryClaimOwnerMatrixVersion = 1;

const digestPattern = /^[a-f0-9]{64}$/u;
const maximumGrantBytes = 256 * 1024;
const maximumSourceBytes = 256 * 1024;
const validatedRegistries = new WeakSet();
const validatedGrants = new WeakSet();

export const semanticRecoveryAuthorityClasses = Object.freeze([
  "repository_git",
  "lifecycle",
  "logical_task_budget",
  "intent_lineage",
  "projection_deployment",
  "supervisor_child_run",
  "incident_report",
  "github_no_effect",
]);

const verifierDefinitions = deepFreeze({
  repository_git: { id: "settleora.repository-git", version: 1, storeKind: "repository_git_store" },
  lifecycle: { id: "settleora.session-lifecycle", version: 1, storeKind: "session_lifecycle_store" },
  logical_task_budget: { id: "settleora.logical-task-budget", version: 1, storeKind: "logical_task_budget_store" },
  intent_lineage: { id: "settleora.pre-effect-intent-lineage", version: 1, storeKind: "pre_effect_intent_store" },
  projection_deployment: { id: "settleora.projection-deployment", version: 1, storeKind: "projection_deployment_store" },
  supervisor_child_run: { id: "settleora.supervisor-child-run", version: 1, storeKind: "supervisor_child_run_store" },
  incident_report: { id: "settleora.incident-report", version: 1, storeKind: "incident_report_store" },
  github_no_effect: { id: "settleora.github-no-effect", version: 1, storeKind: "github_no_effect_store" },
});

const owners = (required, optional = []) => deepFreeze({ required: [...required].sort(), optional: [...optional].sort() });

export const semanticRecoveryClaimOwnerMatrix = deepFreeze({
  repository: owners(["repository_git", "github_no_effect"]),
  issueNumber: owners(["lifecycle", "logical_task_budget"]),
  taskKey: owners(["lifecycle", "logical_task_budget"]),
  claimIdentity: owners(["lifecycle", "logical_task_budget"]),
  chargeId: owners(["logical_task_budget", "lifecycle"]),
  originalRunnerRunId: owners(["lifecycle", "supervisor_child_run"]),
  originalSupervisorRunId: owners(["lifecycle", "supervisor_child_run"]),
  consumedRunnerRunId: owners(["lifecycle", "supervisor_child_run"]),
  consumedSupervisorRunId: owners(["lifecycle", "supervisor_child_run"]),
  originalSpecIdentity: owners(["lifecycle", "supervisor_child_run"]),
  originalStateIdentity: owners(["lifecycle", "supervisor_child_run"]),
  originalIterationIdentity: owners(["lifecycle", "supervisor_child_run"]),
  originalSummaryIdentity: owners(["lifecycle", "supervisor_child_run"]),
  failedContinuationRunnerRunId: owners(["lifecycle", "supervisor_child_run"]),
  failedContinuationSupervisorRunId: owners(["lifecycle", "supervisor_child_run"]),
  failedContinuationSpecIdentity: owners(["lifecycle", "supervisor_child_run"]),
  failedContinuationStateIdentity: owners(["lifecycle", "supervisor_child_run"]),
  failedContinuationHeartbeatIdentity: owners(["lifecycle", "supervisor_child_run"]),
  failedContinuationSummaryIdentity: owners(["lifecycle", "supervisor_child_run"]),
  consumedSpecIdentity: owners(["lifecycle", "supervisor_child_run"]),
  consumedStateIdentity: owners(["lifecycle", "supervisor_child_run"]),
  consumedIterationIdentity: owners(["lifecycle", "supervisor_child_run"]),
  consumedSummaryIdentity: owners(["lifecycle", "supervisor_child_run"]),
  branch: owners(["repository_git", "projection_deployment"]),
  baseSha: owners(["repository_git", "projection_deployment"]),
  headSha: owners(["repository_git", "projection_deployment"]),
  treeSha: owners(["repository_git", "projection_deployment"]),
  changedFilesDigest: owners(["repository_git", "projection_deployment"]),
  diffDigest: owners(["repository_git", "projection_deployment"]),
  acceptedLogicalTasks: owners(["logical_task_budget", "lifecycle"]),
  localSourceChangingRounds: owners(["logical_task_budget", "lifecycle"]),
  githubTriggeredFixEpochs: owners(["logical_task_budget", "lifecycle"]),
  lifetimeLocalSourceChangingRounds: owners(["logical_task_budget", "lifecycle"]),
  formerRootPath: owners(["projection_deployment", "incident_report"]),
  formerRootSha256: owners(["projection_deployment", "incident_report"]),
  formerEffectivePhase: owners(["projection_deployment", "incident_report"]),
  incidentPath: owners(["projection_deployment", "incident_report"]),
  incidentSha256: owners(["projection_deployment", "incident_report"]),
  predecessorBytesAvailable: owners(["projection_deployment", "incident_report"]),
  prEvidenceDigest: owners(["projection_deployment", "github_no_effect"]),
  runtimeSourceSha: owners(["projection_deployment", "incident_report"]),
  installedBundleDigest: owners(["projection_deployment", "incident_report"]),
  installedManifestDigest: owners(["projection_deployment", "incident_report"]),
  runtimeProfileDigest: owners(["projection_deployment", "incident_report"]),
  runtimeApprovalDigest: owners(["projection_deployment", "incident_report"]),
  launcherDigest: owners(["projection_deployment", "incident_report"]),
  healthUnitDigest: owners(["projection_deployment", "incident_report"]),
  lifecycleLineage: owners(["lifecycle", "projection_deployment"]),
  lifecycleSessionId: owners(["lifecycle", "projection_deployment"]),
  lifecycleMutationGeneration: owners(["lifecycle", "projection_deployment"]),
  intentPosture: owners(["intent_lineage", "supervisor_child_run"]),
  validationEffect: owners(["intent_lineage", "supervisor_child_run"]),
  reviewEffect: owners(["intent_lineage", "supervisor_child_run"]),
  sourceEffect: owners(["intent_lineage", "supervisor_child_run"]),
  pushEffect: owners(["github_no_effect", "incident_report"]),
  prEffect: owners(["github_no_effect", "incident_report"]),
  commentEffect: owners(["github_no_effect", "incident_report"]),
  mergeEffect: owners(["github_no_effect", "incident_report"]),
  issueEffect: owners(["github_no_effect", "incident_report"]),
  productEffect: owners(["github_no_effect", "incident_report"]),
  submissionCount: owners(["supervisor_child_run", "logical_task_budget"]),
  submissionExhausted: owners(["supervisor_child_run", "logical_task_budget"]),
  successorEligible: owners(["lifecycle", "projection_deployment"]),
  earliestSafePhase: owners(["lifecycle", "projection_deployment"]),
});

export const semanticRecoveryClaimOwnerMatrixDigest = sha256(canonicalJson({
  version: semanticRecoveryClaimOwnerMatrixVersion,
  claims: semanticRecoveryClaimOwnerMatrix,
}));

export const semanticRecoveryVerifierSet = deepFreeze({
  version: semanticRecoveryVerifierSetVersion,
  verifiers: Object.fromEntries(Object.entries(verifierDefinitions).map(([authorityClass, definition]) => [authorityClass, {
    authorityClass,
    id: definition.id,
    version: definition.version,
    storeKind: definition.storeKind,
  }])),
});

export const semanticRecoveryVerifierSetDigest = sha256(canonicalJson(semanticRecoveryVerifierSet));

export function createProductionSemanticRecoveryVerifierRegistry(config) {
  const registry = createRegistry(
    "production",
    (authorityClass, descriptor) => verifyProductionSource(config, authorityClass, descriptor),
    () => { throw new Error("semantic recovery protected persistence producer unavailable"); },
  );
  validatedRegistries.add(registry);
  return registry;
}

// Deterministic tests exercise the production registry dispatch and claim
// normalization without creating privileged filesystem objects. A synthetic
// registry is never constructed by startup and is clearly marked in results.
export function createDeterministicSemanticRecoveryVerifierRegistry(records = {}) {
  const frozen = structuredClone(records);
  const registry = createRegistry("synthetic_test", (authorityClass, descriptor) => {
    assertExactKeys(descriptor, ["authorityClass", "recordKey"]);
    if (descriptor.authorityClass !== authorityClass || typeof descriptor.recordKey !== "string") throw new Error("semantic source descriptor invalid");
    const record = frozen[authorityClass]?.[descriptor.recordKey];
    if (!record) throw new Error("semantic source record missing");
    return normalizeVerifiedRecord(authorityClass, structuredClone(record), verifierDefinitions[authorityClass]);
  });
  validatedRegistries.add(registry);
  return registry;
}

export function authenticateSemanticRecoverySources(sourceDescriptors, registry) {
  if (!validatedRegistries.has(registry) || registry?.version !== semanticRecoveryVerifierSetVersion
    || registry?.digest !== semanticRecoveryVerifierSetDigest) throw new Error("semantic verifier registry invalid");
  if (!Array.isArray(sourceDescriptors) || sourceDescriptors.length !== semanticRecoveryAuthorityClasses.length) throw new Error("semantic source count invalid");
  const seen = new Set();
  const verified = [];
  for (const descriptor of sourceDescriptors) {
    if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) throw new Error("semantic source descriptor invalid");
    const authorityClass = descriptor.authorityClass;
    if (!semanticRecoveryAuthorityClasses.includes(authorityClass) || seen.has(authorityClass)) throw new Error("semantic source class invalid");
    seen.add(authorityClass);
    verified.push(registry.verify(authorityClass, descriptor));
  }
  if (semanticRecoveryAuthorityClasses.some((authorityClass) => !seen.has(authorityClass))) throw new Error("semantic source class missing");
  assertIndependentSemanticRecoverySources(verified);
  return deepFreeze(verified.sort((left, right) => left.authorityClass.localeCompare(right.authorityClass)));
}

function assertIndependentSemanticRecoverySources(verified) {
  const provenanceIdentities = new Set();
  const canonicalStoreOrigins = new Set();
  for (const source of verified) {
    if (provenanceIdentities.has(source.provenanceIdentity)) {
      throw new Error("semantic source provenance is not independent");
    }
    provenanceIdentities.add(source.provenanceIdentity);
    // Store kind is class-specific and therefore cannot manufacture
    // independence. The authenticated canonical origin itself must differ.
    if (canonicalStoreOrigins.has(source.store.path)) {
      throw new Error("semantic source store origin is not independent");
    }
    canonicalStoreOrigins.add(source.store.path);
  }
}

export function applySemanticRecoveryClaimOwnerMatrix(verifiedSources) {
  if (!Array.isArray(verifiedSources)) return failed("semantic_claim_owner_sources_invalid");
  const byClass = new Map(verifiedSources.map((source) => [source.authorityClass, source]));
  if (byClass.size !== verifiedSources.length || verifiedSources.some((source) => !semanticRecoveryAuthorityClasses.includes(source.authorityClass))) {
    return failed("semantic_claim_owner_class_invalid");
  }
  const claims = {};
  const bindings = {};
  for (const [claim, ownership] of Object.entries(semanticRecoveryClaimOwnerMatrix)) {
    const ownerValues = [];
    for (const authorityClass of ownership.required) {
      const source = byClass.get(authorityClass);
      if (!source || !Object.hasOwn(source.claims, claim)) return failed("semantic_claim_required_owner_missing", [claim, authorityClass]);
      ownerValues.push([authorityClass, canonicalJson(source.claims[claim])]);
    }
    const expected = ownerValues[0][1];
    if (ownerValues.some(([, value]) => value !== expected)) return failed("semantic_claim_required_owner_disagreement", [claim]);
    const presentOptional = ownership.optional.filter((authorityClass) => Object.hasOwn(byClass.get(authorityClass)?.claims || {}, claim));
    if (presentOptional.some((authorityClass) => canonicalJson(byClass.get(authorityClass).claims[claim]) !== expected)) {
      return failed("semantic_claim_corroborator_disagreement", [claim]);
    }
    for (const source of verifiedSources) {
      if (!Object.hasOwn(source.claims, claim)) continue;
      if (![...ownership.required, ...ownership.optional].includes(source.authorityClass)) {
        return failed("semantic_claim_ineligible_authority", [claim, source.authorityClass]);
      }
    }
    claims[claim] = JSON.parse(expected);
    bindings[claim] = { required: [...ownership.required], optionalPresent: presentOptional };
  }
  for (const source of verifiedSources) {
    for (const claim of Object.keys(source.claims)) {
      if (!Object.hasOwn(semanticRecoveryClaimOwnerMatrix, claim)) return failed("semantic_evidence_unknown_claim", [claim]);
    }
  }
  return { ok: true, claims: deepFreeze(claims), bindings: deepFreeze(bindings) };
}

export function deriveSemanticRecoveryOperationRequest({ manifestDigest, incidentIdentity, lifecycleSuccessorSession, lifecycleSuccessorGeneration }) {
  if (![manifestDigest, incidentIdentity].every(isDigest) || typeof lifecycleSuccessorSession !== "string" || lifecycleSuccessorSession.length < 1
    || !Number.isSafeInteger(lifecycleSuccessorGeneration) || lifecycleSuccessorGeneration < 1) throw new Error("semantic operation request identity invalid");
  const request = {
    contract: "settleora_semantic_recovery_operation_request",
    version: 1,
    action: semanticRecoveryAllowedAction,
    manifestDigest,
    incidentIdentity,
    lifecycleSuccessorSession,
    lifecycleSuccessorGeneration,
  };
  const requestId = sha256(canonicalJson(request));
  const operationId = sha256(canonicalJson({ contract: request.contract, version: request.version, requestId, action: request.action }));
  return deepFreeze({ ...request, requestId, operationId });
}

export function semanticRecoveryGrantPath(operationId) {
  if (!isDigest(operationId)) throw new Error("semantic operation id invalid");
  return path.posix.join(semanticRecoveryProtectedControlRoot, "grants", `${operationId}.json`);
}

export function expectedSemanticRecoveryGrantDocument(manifest) {
  if (!manifest?.manifestDigest || !manifest?.operation?.operationId) throw new Error("semantic manifest grant binding incomplete");
  const runBindings = normalizeGrantRunBindings({
    originalRunner: manifest.claims.originalRunnerRunId,
    originalSupervisor: manifest.claims.originalSupervisorRunId,
    originalSpec: manifest.claims.originalSpecIdentity,
    originalState: manifest.claims.originalStateIdentity,
    originalIteration: manifest.claims.originalIterationIdentity,
    originalSummary: manifest.claims.originalSummaryIdentity,
    failedRunner: manifest.claims.failedContinuationRunnerRunId,
    failedSupervisor: manifest.claims.failedContinuationSupervisorRunId,
    failedSpec: manifest.claims.failedContinuationSpecIdentity,
    failedState: manifest.claims.failedContinuationStateIdentity,
    failedHeartbeat: manifest.claims.failedContinuationHeartbeatIdentity,
    failedSummary: manifest.claims.failedContinuationSummaryIdentity,
    consumedRunner: manifest.claims.consumedRunnerRunId,
    consumedSupervisor: manifest.claims.consumedSupervisorRunId,
    consumedSpec: manifest.claims.consumedSpecIdentity,
    consumedState: manifest.claims.consumedStateIdentity,
    consumedIteration: manifest.claims.consumedIterationIdentity,
    consumedSummary: manifest.claims.consumedSummaryIdentity,
  });
  const runtime = normalizeRuntimeBindings({
    sourceSha: manifest.claims.runtimeSourceSha,
    bundleDigest: manifest.claims.installedBundleDigest,
    manifestDigest: manifest.claims.installedManifestDigest,
    profileDigest: manifest.claims.runtimeProfileDigest,
    approvalDigest: manifest.claims.runtimeApprovalDigest,
    launcherDigest: manifest.claims.launcherDigest,
    healthUnitDigest: manifest.claims.healthUnitDigest,
  });
  const evidenceSources = manifest.evidenceSources.map((source) => ({
    authorityClass: source.authorityClass,
    verifierId: source.verifier.id,
    verifierVersion: source.verifier.version,
    storeKind: source.store.kind,
    path: source.store.path,
    role: source.store.role,
    sha256: source.store.sha256,
    provenanceIdentity: source.provenanceIdentity,
  }));
  return deepFreeze({
    contract: semanticRecoveryGrantContract,
    contractVersion: 1,
    grantSchemaVersion: semanticRecoveryGrantSchemaVersion,
    operationId: manifest.operation.operationId,
    requestId: manifest.operation.requestId,
    allowedAction: semanticRecoveryAllowedAction,
    repository: manifest.claims.repository,
    issueNumber: manifest.claims.issueNumber,
    taskKey: manifest.claims.taskKey,
    claimIdentity: manifest.claims.claimIdentity,
    chargeDigest: manifest.claims.chargeId,
    semanticManifestDigest: manifest.manifestDigest,
    claimOwnerMatrix: { version: semanticRecoveryClaimOwnerMatrixVersion, digest: semanticRecoveryClaimOwnerMatrixDigest },
    sourceVerifierSet: { version: semanticRecoveryVerifierSetVersion, digest: semanticRecoveryVerifierSetDigest },
    sourceAuthority: manifest.sourceAuthority,
    persistenceFence: { contract: "settleora_semantic_recovery_no_effect_generation_fence", version: 1, authorityClass: "github_no_effect", required: true },
    evidenceSources,
    boundArtifacts: manifest.artifacts,
    runBindings,
    historicalPredecessor: manifest.historicalPredecessor,
    currentIncident: manifest.currentIncident,
    prEvidenceDigest: manifest.claims.prEvidenceDigest,
    runtime,
    oneShotExhaustion: manifest.oneShotExhaustion,
    noEffectPosture: manifest.noEffectProof,
    lifecycle: {
      predecessorSession: manifest.lifecycleSuccessor.previousSessionId,
      currentSession: manifest.claims.lifecycleSessionId,
      successorSession: manifest.lifecycleSuccessor.sessionId,
      mutationGeneration: manifest.lifecycleSuccessor.mutationGeneration,
      earliestSafePhase: manifest.claims.earliestSafePhase,
      successorEligible: manifest.claims.successorEligible,
    },
    successor: {
      storageKey: manifest.intendedSuccessor.storageKey,
      storagePath: manifest.intendedSuccessor.storagePath,
      provenancePath: manifest.intendedSuccessor.provenancePath,
      commitPath: manifest.intendedSuccessor.commitPath,
      action: semanticRecoveryAllowedAction,
      operationId: manifest.operation.operationId,
      requestId: manifest.operation.requestId,
    },
    forbiddenWrites: {
      predecessorPath: manifest.historicalPredecessor.path,
      incidentPath: manifest.currentIncident.path,
    },
  });
}

export function authenticateRootOwnedSemanticRecoveryGrant({ manifest, operationId, filesystem } = {}) {
  if (!isDigest(operationId) || operationId !== manifest?.operation?.operationId) return failed("semantic_grant_operation_selection_mismatch");
  let expected;
  try { expected = expectedSemanticRecoveryGrantDocument(manifest); }
  catch { return failed("semantic_grant_expected_binding_invalid"); }
  const grantPath = semanticRecoveryGrantPath(operationId);
  let authenticated;
  try {
    authenticated = filesystem
      ? authenticateGrantWithAdapter(grantPath, operationId, filesystem)
      : authenticateGrantFromProductionFilesystem(grantPath, operationId);
  } catch (error) {
    return failed(error?.code === "ENOENT" ? "semantic_protected_grant_missing" : "semantic_protected_grant_authentication_failed");
  }
  const actual = { ...authenticated.document };
  const createdAt = actual.createdAt;
  delete actual.createdAt;
  if (createdAt !== undefined && (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt)))) return failed("semantic_protected_grant_metadata_invalid");
  if (canonicalJson(actual) !== canonicalJson(expected)) return failed("semantic_protected_grant_binding_mismatch");
  const grant = deepFreeze({
    authorized: true,
    action: semanticRecoveryAllowedAction,
    operationId,
    requestId: expected.requestId,
    manifestDigest: expected.semanticManifestDigest,
    matrixDigest: semanticRecoveryClaimOwnerMatrixDigest,
    verifierSetDigest: semanticRecoveryVerifierSetDigest,
    path: grantPath,
    sha256: authenticated.sha256,
    synthetic: authenticated.synthetic === true,
  });
  if (grant.synthetic !== true) validatedGrants.add(grant);
  return grant;
}

export function isValidatedSemanticRecoveryGrant(grant) {
  return validatedGrants.has(grant);
}

export function requestSourceOwnedSemanticRecoveryPersistence(registry, manifest, grant) {
  if (!validatedRegistries.has(registry) || registry?.authority !== "production"
    || !validatedGrants.has(grant) || grant?.synthetic === true
    || manifest?.sourceAuthority !== "production" || manifest?.manifestDigest !== grant?.manifestDigest) {
    return failed("semantic_recovery_persistence_fence_authority_invalid");
  }
  try {
    return registry.persistExactSemanticSuccessor(manifest, grant);
  } catch {
    return failed("semantic_recovery_persistence_fence_unavailable");
  }
}

function createRegistry(authority, reader, persistExactSemanticSuccessor = null) {
  return deepFreeze({
    authority,
    version: semanticRecoveryVerifierSetVersion,
    digest: semanticRecoveryVerifierSetDigest,
    verify(authorityClass, descriptor) {
      if (!Object.hasOwn(verifierDefinitions, authorityClass)) throw new Error("semantic verifier missing");
      const result = reader(authorityClass, descriptor);
      return normalizeVerifiedRecord(authorityClass, result, verifierDefinitions[authorityClass]);
    },
    persistExactSemanticSuccessor(manifest, grant) {
      if (typeof persistExactSemanticSuccessor !== "function") throw new Error("semantic protected persistence unsupported");
      return persistExactSemanticSuccessor(manifest, grant);
    },
  });
}

function verifyProductionSource(config, authorityClass, descriptor) {
  void config;
  return rejectUnavailableProductionProducer(authorityClass, descriptor);
}

// These classes require a source-owned native producer/readback that the
// current runtime does not install. A class-tagged JSON file beneath the
// runner-owned logs root is deliberately insufficient: the runner user could
// create it and collapse independent domain provenance into one self-declared
// envelope. Keep the closed dispatch slot source-owned, but fail before
// reading bytes or deriving claims until a separately deployed producer is
// available.
function rejectUnavailableProductionProducer(authorityClass, descriptor) {
  assertExactKeys(descriptor, ["authorityClass", "store"]);
  if (descriptor.authorityClass !== authorityClass) throw new Error("semantic source class mismatch");
  assertExactKeys(descriptor.store, ["kind", "path", "role", "sha256"]);
  const definition = verifierDefinitions[authorityClass];
  if (descriptor.store.kind !== definition.storeKind || typeof descriptor.store.path !== "string"
    || !path.isAbsolute(descriptor.store.path) || typeof descriptor.store.role !== "string"
    || !descriptor.store.role.length || !isDigest(descriptor.store.sha256)) throw new Error("semantic source store mismatch");
  throw new Error(`semantic source producer unavailable: ${authorityClass}`);
}

function normalizeVerifiedRecord(authorityClass, record, definition) {
  if (!plainObject(record?.claims) || !isDigest(record?.provenanceIdentity) || !plainObject(record?.store)) throw new Error("semantic verified record invalid");
  if (record.store.kind !== definition.storeKind || typeof record.store.path !== "string" || !path.isAbsolute(record.store.path)
    || typeof record.store.role !== "string" || !record.store.role.length || !isDigest(record.store.sha256)
    || !Number.isSafeInteger(record.store.byteCount) || record.store.byteCount < 1 || record.store.byteCount > maximumSourceBytes) throw new Error("semantic verified store invalid");
  return deepFreeze({
    authorityClass,
    verifier: { id: definition.id, version: definition.version },
    store: { kind: definition.storeKind, path: path.resolve(record.store.path), role: record.store.role, sha256: record.store.sha256, byteCount: record.store.byteCount },
    provenanceIdentity: record.provenanceIdentity,
    claims: Object.fromEntries(Object.entries(record.claims).sort(([left], [right]) => left.localeCompare(right))),
  });
}

function authenticateGrantFromProductionFilesystem(grantPath, operationId) {
  const grantsRoot = path.posix.join(semanticRecoveryProtectedControlRoot, "grants");
  const expectedLexical = path.posix.join(grantsRoot, `${operationId}.json`);
  if (grantPath !== expectedLexical) throw new Error("semantic grant path mismatch");
  for (const lexical of lexicalProtectedGrantChain(grantPath)) {
    const stat = lstatSync(lexical);
    const isGrant = lexical === grantPath;
    if (stat.isSymbolicLink() || stat.uid !== 0 || (isGrant ? !stat.isFile() : !stat.isDirectory())
      || (isGrant ? ((stat.mode & 0o7777) !== 0o444 || stat.nlink !== 1) : ((stat.mode & 0o022) !== 0))) throw new Error("semantic grant metadata unsafe");
    if (realpathSync(lexical) !== lexical) throw new Error("semantic grant canonical path mismatch");
  }
  const entries = readdirSync(grantsRoot).filter((name) => name === `${operationId}.json`);
  if (entries.length !== 1) throw new Error("semantic grant selection ambiguous");
  const authenticated = authenticateRootReadOnlyCanonicalFile(grantPath);
  return { ...authenticated, document: parseCanonicalJson(authenticated.bytes), synthetic: false };
}

function authenticateGrantWithAdapter(grantPath, operationId, filesystem) {
  if (!filesystem || typeof filesystem.inspect !== "function" || typeof filesystem.read !== "function"
    || typeof filesystem.list !== "function" || typeof filesystem.realpath !== "function") throw new Error("semantic grant adapter invalid");
  for (const lexical of lexicalProtectedGrantChain(grantPath)) {
    const stat = filesystem.inspect(lexical);
    const isGrant = lexical === grantPath;
    if (!stat || stat.symlink === true || stat.uid !== 0 || (isGrant ? stat.type !== "file" : stat.type !== "directory")
      || (isGrant ? (stat.mode !== 0o444 || stat.nlink !== 1) : ((stat.mode & 0o022) !== 0))
      || filesystem.realpath(lexical) !== lexical) throw new Error("semantic grant metadata unsafe");
  }
  if (filesystem.list(path.posix.dirname(grantPath)).filter((name) => name === `${operationId}.json`).length !== 1) throw new Error("semantic grant selection ambiguous");
  const first = filesystem.inspect(grantPath);
  const bytes = Buffer.from(filesystem.read(grantPath));
  const second = filesystem.inspect(grantPath);
  if (canonicalJson(first) !== canonicalJson(second) || bytes.length < 1 || bytes.length > maximumGrantBytes || bytes.length !== first.size || !isUtf8(bytes)) throw new Error("semantic grant bytes unstable");
  return { path: grantPath, bytes, byteCount: bytes.length, sha256: sha256(bytes), document: parseCanonicalJson(bytes), synthetic: true };
}

function authenticateRootReadOnlyCanonicalFile(file) {
  const fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  try {
    const first = fstatSync(fd);
    if (!first.isFile() || first.uid !== 0 || first.nlink !== 1 || (first.mode & 0o7777) !== 0o444 || first.size < 1 || first.size > maximumGrantBytes) throw new Error("semantic grant file unsafe");
    const bytes = readFileSync(fd);
    const second = fstatSync(fd);
    if (statIdentity(first) !== statIdentity(second) || bytes.length !== first.size || !isUtf8(bytes)) throw new Error("semantic grant file changed");
    return { path: file, bytes, byteCount: bytes.length, sha256: sha256(bytes) };
  } finally { closeSync(fd); }
}

function lexicalProtectedGrantChain(grantPath) {
  if (grantPath !== semanticRecoveryGrantPath(path.posix.basename(grantPath, ".json"))) throw new Error("semantic grant lexical path invalid");
  return [
    "/etc",
    "/etc/settleora-auto-runner",
    semanticRecoveryProtectedControlRoot,
    `${semanticRecoveryProtectedControlRoot}/grants`,
    grantPath,
  ];
}

function parseCanonicalJson(bytes) {
  if (!Buffer.isBuffer(bytes) || !isUtf8(bytes)) throw new Error("canonical JSON encoding invalid");
  const text = bytes.toString("utf8");
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("canonical JSON parse failed"); }
  if (canonicalJson(value) !== text) throw new Error("canonical JSON bytes required");
  return value;
}

function normalizeGrantRunBindings(value) {
  if (!plainObject(value)) throw new Error("semantic grant run bindings missing");
  const required = [
    "originalRunner", "originalSupervisor", "originalSpec", "originalState", "originalIteration", "originalSummary",
    "failedRunner", "failedSupervisor", "failedSpec", "failedState", "failedHeartbeat", "failedSummary",
    "consumedRunner", "consumedSupervisor", "consumedSpec", "consumedState", "consumedIteration", "consumedSummary",
  ];
  assertExactKeys(value, required);
  for (const key of required) if (typeof value[key] !== "string" || value[key].length < 1 || value[key].length > 1000) throw new Error("semantic grant run binding invalid");
  return deepFreeze(structuredClone(value));
}

function ownedClaimsFor(authorityClass) {
  return Object.entries(semanticRecoveryClaimOwnerMatrix)
    .filter(([, ownership]) => [...ownership.required, ...ownership.optional].includes(authorityClass))
    .map(([claim]) => claim);
}

function normalizeRuntimeBindings(value) {
  if (!plainObject(value)) throw new Error("semantic runtime bindings missing");
  const required = ["sourceSha", "bundleDigest", "manifestDigest", "profileDigest", "approvalDigest", "launcherDigest", "healthUnitDigest"];
  assertExactKeys(value, required);
  if (!/^[a-f0-9]{40}$/u.test(value.sourceSha || "") || required.slice(1).some((key) => !isDigest(value[key]))) throw new Error("semantic runtime binding invalid");
  return deepFreeze(structuredClone(value));
}

function assertExactKeys(value, allowed) {
  if (!plainObject(value)) throw new Error("object required");
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (canonicalJson(keys) !== canonicalJson(expected)) throw new Error("unsupported or missing fields");
}

function statIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.uid, stat.gid, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}

function failed(reasonCode, diagnostics = []) { return { ok: false, reasonCode, diagnostics: [...new Set(diagnostics)].sort() }; }
function isDigest(value) { return digestPattern.test(String(value || "")); }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (plainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
