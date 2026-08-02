import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  applySemanticRecoveryClaimOwnerMatrix,
  authenticateRootOwnedSemanticRecoveryGrant,
  authenticateSemanticRecoverySources,
  createProductionSemanticRecoveryVerifierRegistry,
  deriveSemanticRecoveryOperationRequest,
  isValidatedSemanticRecoveryGrant,
  requestSourceOwnedSemanticRecoveryPersistence,
  semanticRecoveryAuthorityClasses,
  semanticRecoveryClaimOwnerMatrixDigest,
  semanticRecoveryClaimOwnerMatrixVersion,
  semanticRecoveryVerifierSetDigest,
  semanticRecoveryVerifierSetVersion,
} from "./semantic-recovery-authority.mjs";

export const semanticRecoveryContract = "post_incident_semantic_successor";
export const semanticRecoveryVersion = 1;
const maximumBoundArtifacts = 64;
const maximumArtifactBytes = 256 * 1024;
const maximumAggregateArtifactBytes = 4 * 1024 * 1024;

export const mandatorySemanticEvidenceClasses = semanticRecoveryAuthorityClasses;

export const semanticRecoveryRequiredClaims = Object.freeze([
  "repository", "issueNumber", "taskKey", "claimIdentity", "chargeId",
  "originalRunnerRunId", "originalSupervisorRunId", "consumedRunnerRunId",
  "consumedSupervisorRunId", "originalSpecIdentity", "originalStateIdentity",
  "originalIterationIdentity", "originalSummaryIdentity",
  "failedContinuationRunnerRunId", "failedContinuationSupervisorRunId",
  "failedContinuationSpecIdentity", "failedContinuationStateIdentity",
  "failedContinuationHeartbeatIdentity", "failedContinuationSummaryIdentity",
  "consumedSpecIdentity", "consumedStateIdentity", "consumedIterationIdentity",
  "consumedSummaryIdentity", "branch", "baseSha", "headSha", "treeSha",
  "changedFilesDigest", "diffDigest", "acceptedLogicalTasks",
  "localSourceChangingRounds", "githubTriggeredFixEpochs",
  "lifetimeLocalSourceChangingRounds", "formerRootPath", "formerRootSha256",
  "formerEffectivePhase", "incidentPath", "incidentSha256", "lifecycleLineage",
  "predecessorBytesAvailable", "prEvidenceDigest", "runtimeSourceSha",
  "installedBundleDigest", "installedManifestDigest", "runtimeProfileDigest",
  "runtimeApprovalDigest", "launcherDigest", "healthUnitDigest",
  "lifecycleSessionId", "lifecycleMutationGeneration",
  "intentPosture", "validationEffect", "reviewEffect", "sourceEffect",
  "pushEffect", "prEffect", "commentEffect", "mergeEffect", "issueEffect",
  "productEffect", "submissionCount", "submissionExhausted", "successorEligible",
  "earliestSafePhase",
]);

const zeroEffectClaims = Object.freeze([
  "validationEffect", "reviewEffect", "sourceEffect", "pushEffect", "prEffect",
  "commentEffect", "mergeEffect", "issueEffect", "productEffect",
]);
const validatedConstructions = new WeakSet();
const validatedManifests = new WeakSet();

export function buildSemanticRecoveryManifest(packet, adapters = {}) {
  const diagnostics = validatePacketShape(packet);
  if (diagnostics.length) return failed("semantic_evidence_packet_invalid", diagnostics);
  if (packet.sources.length !== mandatorySemanticEvidenceClasses.length) {
    return failed("semantic_evidence_source_count_invalid");
  }
  const authenticateBoundArtifact = adapters.authenticateBoundArtifact || authenticateOpaqueArtifact;
  const verifierRegistry = adapters.verifierRegistry
    || (adapters.config ? createProductionSemanticRecoveryVerifierRegistry(adapters.config) : null);
  if (!verifierRegistry) return failed("semantic_evidence_verifier_registry_missing");
  let sources;
  try {
    sources = authenticateSemanticRecoverySources(packet.sources, verifierRegistry);
  } catch {
    return failed("semantic_evidence_source_authentication_failed");
  }
  if (packet.artifacts.length < 1 || packet.artifacts.length > maximumBoundArtifacts) return failed("semantic_bound_artifact_count_invalid");
  let artifacts;
  try {
    artifacts = [...packet.artifacts].map((artifact) => {
      const authenticated = authenticateBoundArtifact(normalizeArtifact(artifact));
      return { role: authenticated.role, path: authenticated.path, sha256: authenticated.sha256, authenticated: true, byteCount: authenticated.byteCount };
    }).sort(compareArtifact);
  } catch { return failed("semantic_bound_artifact_authentication_failed"); }
  if ([...sources.map((source) => source.store), ...artifacts].reduce((total, artifact) => total + artifact.byteCount, 0) > maximumAggregateArtifactBytes) return failed("semantic_bound_artifact_bytes_exceeded");
  const matrix = applySemanticRecoveryClaimOwnerMatrix(sources);
  if (!matrix.ok) return matrix;
  const claims = matrix.claims;
  const posture = validateSecurityPosture(packet, claims);
  if (!posture.ok) return posture;
  if (!artifacts.some((artifact) => artifact.path === claims.incidentPath
    && artifact.sha256 === claims.incidentSha256)) return failed("semantic_incident_artifact_binding_missing");
  if (packet.incidentIdentity !== digest(canonicalJson({ path: claims.incidentPath, sha256: claims.incidentSha256 }))) return failed("semantic_incident_identity_binding_invalid");
  const manifestCore = {
    contract: semanticRecoveryContract,
    version: semanticRecoveryVersion,
    sourceAuthority: verifierRegistry.authority,
    incidentIdentity: packet.incidentIdentity,
    identities: pickTaskIdentity(claims),
    claims,
    evidenceSources: sources,
    claimOwnerMatrix: { version: semanticRecoveryClaimOwnerMatrixVersion, digest: semanticRecoveryClaimOwnerMatrixDigest },
    sourceVerifierSet: { version: semanticRecoveryVerifierSetVersion, digest: semanticRecoveryVerifierSetDigest },
    sourceToClaimBindings: matrix.bindings,
    historicalPredecessor: { path: claims.formerRootPath, sha256: claims.formerRootSha256, bytesAvailable: false },
    currentIncident: { path: claims.incidentPath, sha256: claims.incidentSha256, authority: "immutable_incident_evidence_only" },
    artifacts,
    oneShotExhaustion: { submissionCount: claims.submissionCount, exhausted: claims.submissionExhausted },
    noEffectProof: Object.fromEntries(zeroEffectClaims.map((claim) => [claim, claims[claim]])),
    lifecycleSuccessor: {
      previousSessionId: claims.lifecycleSessionId,
      sessionId: packet.lifecycleSuccessorSession,
      mutationGeneration: packet.lifecycleSuccessorGeneration,
    },
    allowedNextAction: "separately_authorized_successor_create_or_adopt",
    forbiddenActions: ["write_predecessor", "write_incident", "restore_predecessor", "submit_again", "claim_again", "charge_again", "replay_implementation", "execute_without_operational_authorization"],
    diagnostics: { contradictions: [], omissions: [] },
  };
  const manifestDigest = digest(canonicalJson(manifestCore));
  let operation;
  try {
    operation = deriveSemanticRecoveryOperationRequest({
      manifestDigest,
      incidentIdentity: packet.incidentIdentity,
      lifecycleSuccessorSession: packet.lifecycleSuccessorSession,
      lifecycleSuccessorGeneration: packet.lifecycleSuccessorGeneration,
    });
  } catch { return failed("semantic_operation_request_identity_invalid"); }
  if ((packet.operationId && packet.operationId !== operation.operationId)
    || (packet.requestId && packet.requestId !== operation.requestId)) return failed("semantic_operation_request_selector_mismatch");
  let successorRoot;
  try {
    successorRoot = verifierRegistry.authority === "production"
      ? canonicalConfiguredSuccessorRoot(adapters.config)
      : "/synthetic/semantic-recovery-successors";
  } catch { return failed("semantic_successor_root_invalid"); }
  const successorIdentity = deriveSuccessorIdentity({
    incidentIdentity: packet.incidentIdentity,
    taskIdentity: pickTaskIdentity(claims),
    lifecycleSuccessorSession: packet.lifecycleSuccessorSession,
    operationId: operation.operationId,
    manifestDigest,
    successorRoot,
  });
  const manifest = deepFreeze({ ...manifestCore, operation: { operationId: operation.operationId, requestId: operation.requestId, action: operation.action }, intendedSuccessor: successorIdentity, manifestDigest });
  validatedManifests.add(manifest);
  return { ok: true, reasonCode: "semantic_evidence_corroborated", manifest, manifestDigest };
}

export function deriveSuccessorIdentity({ incidentIdentity, taskIdentity, lifecycleSuccessorSession, operationId, manifestDigest, successorRoot }) {
  if (!path.isAbsolute(successorRoot || "")) throw new Error("semantic successor root invalid");
  const storageKey = digest(canonicalJson({ contract: semanticRecoveryContract, incidentIdentity, taskIdentity, lifecycleSuccessorSession, operationId, manifestDigest }));
  const provenanceKey = digest(canonicalJson({ contract: semanticRecoveryContract, incidentIdentity }));
  return {
    storageKey,
    storagePath: path.join(successorRoot, `${storageKey}.json`),
    provenancePath: path.join(successorRoot, "provenance", `${provenanceKey}.json`),
    commitPath: path.join(successorRoot, "commits", `${storageKey}.json`),
    lifecycleSuccessorSession,
    operationId,
  };
}

export function authenticateConfiguredSemanticRecoveryAuthority(config, packet, operationSelector) {
  const registry = createProductionSemanticRecoveryVerifierRegistry(config);
  return authenticateConfiguredWithRegistry(config, packet, operationSelector, registry);
}

function authenticateConfiguredWithRegistry(config, packet, operationSelector, registry) {
  const corroboration = buildSemanticRecoveryManifest(packet, { config, verifierRegistry: registry });
  if (!corroboration.ok) return corroboration;
  const operationId = operationSelector || corroboration.manifest.operation.operationId;
  const grant = authenticateRootOwnedSemanticRecoveryGrant({ manifest: corroboration.manifest, operationId });
  if (!grant?.authorized) return { ...grant, manifestDigest: corroboration.manifestDigest };
  return { ...corroboration, grant };
}

export function executeConfiguredSemanticRecoverySuccessor(config, packet, operationSelector) {
  const registry = createProductionSemanticRecoveryVerifierRegistry(config);
  const initial = authenticateConfiguredWithRegistry(config, packet, operationSelector, registry);
  if (!initial.ok || !initial.grant?.authorized) return initial;
  // Re-read every source store, bound artifact, runtime claim and the exact
  // root-owned grant immediately before the only persistence boundary.
  const fresh = authenticateConfiguredWithRegistry(config, packet, operationSelector, registry);
  if (!fresh.ok || !fresh.grant?.authorized
    || fresh.manifestDigest !== initial.manifestDigest
    || fresh.grant.sha256 !== initial.grant.sha256
    || canonicalJson(fresh.manifest) !== canonicalJson(initial.manifest)) {
    return failed("semantic_recovery_authority_drift_before_persistence");
  }
  const construction = constructPostIncidentSuccessor({
    manifest: fresh.manifest,
    mutationGeneration: fresh.manifest.lifecycleSuccessor.mutationGeneration,
    operationGrant: fresh.grant,
  });
  if (!construction.ok) return construction;
  // Only a future protected native producer may rederive and persist this
  // exact successor while holding its no-effect generation/CAS fence and
  // descriptor-relative storage authority. The runner supplies no callback,
  // path operation, or mutation capability. The source-owned producer slot is
  // deliberately unavailable in this runtime.
  return requestSourceOwnedSemanticRecoveryPersistence(registry, fresh.manifest, fresh.grant);
}

export function constructPostIncidentSuccessor({ manifest, mutationGeneration, operationGrant }) {
  if (!validatedManifests.has(manifest)) return failed("semantic_manifest_authority_invalid");
  if (manifest?.sourceAuthority !== "production" || operationGrant?.synthetic === true) return failed("post_incident_operational_authorization_required");
  if (!manifest?.manifestDigest || digest(canonicalJson(manifestCoreFromManifest(manifest))) !== manifest.manifestDigest) return failed("semantic_manifest_digest_mismatch");
  const expectedSuccessor = deriveSuccessorIdentity({
    incidentIdentity: manifest.incidentIdentity,
    taskIdentity: manifest.identities,
    lifecycleSuccessorSession: manifest.intendedSuccessor?.lifecycleSuccessorSession,
    operationId: manifest.operation?.operationId,
    manifestDigest: manifest.manifestDigest,
    successorRoot: path.dirname(manifest.intendedSuccessor?.storagePath || ""),
  });
  if (expectedSuccessor.storageKey !== manifest.intendedSuccessor?.storageKey) return failed("semantic_successor_identity_mismatch");
  if (!isValidatedSemanticRecoveryGrant(operationGrant)
    || operationGrant?.authorized !== true
    || operationGrant?.manifestDigest !== manifest.manifestDigest
    || operationGrant?.operationId !== manifest.operation.operationId
    || operationGrant?.requestId !== manifest.operation.requestId
    || operationGrant?.action !== manifest.operation.action
    || operationGrant?.matrixDigest !== semanticRecoveryClaimOwnerMatrixDigest
    || operationGrant?.verifierSetDigest !== semanticRecoveryVerifierSetDigest) {
    return failed("post_incident_operational_authorization_required");
  }
  if (manifest.claims.submissionCount !== 1 || manifest.claims.submissionExhausted !== true) return failed("post_incident_submission_posture_invalid");
  if (zeroEffectClaims.some((claim) => manifest.claims[claim] !== false)) return failed("post_incident_later_effect_detected");
  if (!Number.isSafeInteger(mutationGeneration) || mutationGeneration < 1
    || mutationGeneration !== manifest.lifecycleSuccessor?.mutationGeneration
    || manifest.claims.lifecycleMutationGeneration + 1 !== mutationGeneration) {
    return failed("post_incident_mutation_generation_mismatch");
  }
  if (manifest.claims.lifecycleSessionId !== manifest.lifecycleSuccessor?.previousSessionId
    || manifest.lifecycleSuccessor?.sessionId !== manifest.intendedSuccessor.lifecycleSuccessorSession
    || manifest.lifecycleSuccessor?.sessionId === manifest.lifecycleSuccessor?.previousSessionId) {
    return failed("post_incident_lifecycle_rotation_mismatch");
  }
  // Construct only from corroborated manifest authority. The incident recovery
  // object is immutable evidence and is never cloned into successor authority.
  const successor = {
    taskKey: manifest.claims.taskKey,
    issue: { number: manifest.claims.issueNumber },
    run: { runId: manifest.claims.originalRunnerRunId, supervisorRunId: manifest.claims.originalSupervisorRunId },
    branch: { name: manifest.claims.branch, baseSha: manifest.claims.baseSha, currentHeadSha: manifest.claims.headSha },
    ordinaryContinuation: { identity: { claimIdentity: manifest.claims.claimIdentity } },
    mutationMarkers: { logical_task_charge: { [manifest.claims.chargeId]: { status: "completed", charged: false, duplicate: true } } },
    postIncidentSuccessor: {
      contract: semanticRecoveryContract,
      version: semanticRecoveryVersion,
      manifestDigest: manifest.manifestDigest,
      predecessor: manifest.historicalPredecessor,
      incident: manifest.currentIncident,
      provenanceArtifacts: manifest.artifacts,
      operation: manifest.operation,
      executable: false,
    },
    sessionLifecycle: {
      sessionId: manifest.lifecycleSuccessor.sessionId,
      previousSessionId: manifest.lifecycleSuccessor.previousSessionId,
      logicalTask: { runId: manifest.claims.originalRunnerRunId, claimIdentity: manifest.claims.claimIdentity, chargeId: manifest.claims.chargeId },
      mutationAuthority: { generation: mutationGeneration },
    },
    phase: manifest.claims.earliestSafePhase,
    firstIncompleteAction: "reconstruct_and_validate_preserved_candidate",
    nextSafeAction: "await_separate_execution_authorization",
    mutationGeneration,
  };
  const construction = deepFreeze({ ok: true, reasonCode: "post_incident_successor_constructed", storageKey: manifest.intendedSuccessor.storageKey, successor });
  validatedConstructions.add(construction);
  return construction;
}

export function authenticatePostIncidentOperationalAuthorization(input) {
  return authenticateRootOwnedSemanticRecoveryGrant(input);
}

export function evaluateSemanticRecoveryPersistenceSet({ prepared, successor, commit, expectedPrepared, expectedSuccessor, expectedCommit } = {}) {
  for (const [actual, expected, reasonCode] of [
    [prepared, expectedPrepared, "post_incident_provenance_conflict"],
    [successor, expectedSuccessor, "post_incident_successor_collision"],
    [commit, expectedCommit, "post_incident_successor_commit_conflict"],
  ]) if (actual !== undefined && canonicalJson(actual) !== canonicalJson(expected)) return failed(reasonCode);
  if (commit !== undefined && (prepared === undefined || successor === undefined)) return failed("post_incident_successor_commit_torn");
  if (commit !== undefined) return { ok: true, action: "adopt" };
  if (prepared === undefined) return { ok: true, action: "write_prepared" };
  if (successor === undefined) return { ok: true, action: "write_successor" };
  return { ok: true, action: "write_commit" };
}

export function classifyRecoveryOverwriteIncident({ recoveryPath, state, authenticatedProvenance }) {
  if (!authenticatedProvenance?.ok) return { quarantined: false, reasonCode: "ordinary_recovery" };
  const identityMatch = state?.taskKey === authenticatedProvenance.taskKey && state?.issue?.number === authenticatedProvenance.issueNumber;
  const consumedRunIdentityMatch = state?.run?.runId === authenticatedProvenance.consumedRunnerRunId
    && state?.run?.supervisorRunId === authenticatedProvenance.consumedSupervisorRunId;
  const configuredPathMatch = safeCanonicalMatch(recoveryPath, authenticatedProvenance.incidentPath)
    || safeCanonicalMatch(recoveryPath, authenticatedProvenance.incidentArtifact?.path);
  let authenticatedIncident;
  try {
    authenticatedIncident = authenticateOpaqueArtifact(normalizeArtifact(authenticatedProvenance.incidentArtifact));
  } catch {
    return configuredPathMatch
      ? { quarantined: true, readOnly: true, reasonCode: "incident_provenance_authentication_failed", allowedAction: "none" }
      : { quarantined: false, reasonCode: "ordinary_recovery" };
  }
  const pathMatch = canonicalExistingPath(recoveryPath) === authenticatedIncident.path
    && canonicalExistingPath(authenticatedProvenance.incidentPath) === authenticatedIncident.path;
  if (configuredPathMatch && !pathMatch) {
    return { quarantined: true, readOnly: true, reasonCode: "incident_path_contradiction", allowedAction: "none" };
  }
  if (pathMatch && !identityMatch) {
    return { quarantined: true, readOnly: true, reasonCode: "incident_identity_contradiction", allowedAction: "none" };
  }
  if (pathMatch && !consumedRunIdentityMatch) {
    return { quarantined: true, readOnly: true, reasonCode: "incident_run_identity_contradiction", allowedAction: "none" };
  }
  if (pathMatch && (authenticatedProvenance.incidentSha256 !== authenticatedIncident.sha256
    || authenticatedProvenance.predecessorSha256 === authenticatedIncident.sha256
    || authenticatedProvenance.bytesAvailable !== false)) {
    return { quarantined: true, readOnly: true, reasonCode: "incident_provenance_contradiction", allowedAction: "none" };
  }
  const overwrite = pathMatch
    && authenticatedProvenance.incidentSha256 === authenticatedIncident.sha256
    && authenticatedProvenance.predecessorSha256 !== authenticatedIncident.sha256
    && authenticatedProvenance.bytesAvailable === false;
  return overwrite
    ? { quarantined: true, readOnly: true, reasonCode: "authenticated_recovery_overwrite_incident", allowedAction: "semantic_corroboration_only" }
    : { quarantined: false, reasonCode: "ordinary_recovery" };
}

export function inspectConfiguredRecoveryOverwriteIncident(authenticatedProvenance) {
  if (!authenticatedProvenance) return null;
  let authenticated;
  try { authenticated = authenticateOpaqueArtifact(normalizeArtifact(authenticatedProvenance.incidentArtifact)); }
  catch { return { quarantined: true, readOnly: true, reasonCode: "incident_provenance_authentication_failed", allowedAction: "none", state: null }; }
  let state;
  try { state = JSON.parse(authenticated.authenticatedBytes.toString("utf8")); }
  catch { return { quarantined: true, readOnly: true, reasonCode: "incident_state_parse_failed", allowedAction: "none", state: null }; }
  return {
    ...classifyRecoveryOverwriteIncident({ recoveryPath: authenticated.path, state, authenticatedProvenance }),
    state,
    incident: { path: authenticated.path, sha256: authenticated.sha256 },
    provenance: {
      repository: authenticatedProvenance.repository,
      taskKey: authenticatedProvenance.taskKey,
      issueNumber: authenticatedProvenance.issueNumber,
      predecessorSha256: authenticatedProvenance.predecessorSha256,
      originalRunnerRunId: authenticatedProvenance.originalRunnerRunId,
      originalSupervisorRunId: authenticatedProvenance.originalSupervisorRunId,
      consumedRunnerRunId: authenticatedProvenance.consumedRunnerRunId,
      consumedSupervisorRunId: authenticatedProvenance.consumedSupervisorRunId,
    },
  };
}

export function assertRecoveryWritePathAllowed(targetPath, { predecessorPath, incidentPath, successorPath } = {}) {
  const target = canonicalExistingPath(targetPath);
  if ([predecessorPath, incidentPath].filter(Boolean).map(canonicalExistingPath).includes(target)) return failed("protected_recovery_path_write_blocked");
  if (successorPath && target !== canonicalExistingPath(successorPath)) return failed("unexpected_successor_write_path");
  return { ok: true };
}

function validatePacketShape(packet) {
  const diagnostics = [];
  if (!packet || !Array.isArray(packet.sources) || !Array.isArray(packet.artifacts)) diagnostics.push("packet_shape");
  if (!bounded(packet?.incidentIdentity) || !bounded(packet?.lifecycleSuccessorSession)
    || !Number.isSafeInteger(packet?.lifecycleSuccessorGeneration) || packet.lifecycleSuccessorGeneration < 1
    || (packet?.operationId !== undefined && !digest64(packet.operationId))
    || (packet?.requestId !== undefined && !digest64(packet.requestId))) diagnostics.push("operation_identity");
  if (Array.isArray(packet?.sources) && packet.sources.some((source) => !source || typeof source !== "object" || Array.isArray(source)
    || !mandatorySemanticEvidenceClasses.includes(source.authorityClass))) diagnostics.push("source_binding");
  return diagnostics;
}
function validateSecurityPosture(packet, claims) {
  if (!digest64(claims.formerRootSha256) || !digest64(claims.incidentSha256) || claims.formerRootSha256 === claims.incidentSha256
    || claims.predecessorBytesAvailable !== false || !digest64(claims.prEvidenceDigest)) return failed("semantic_root_identity_invalid");
  if (![claims.baseSha, claims.headSha, claims.treeSha].every(gitObjectId)
    || !digest64(claims.changedFilesDigest) || !digest64(claims.diffDigest)) return failed("semantic_git_identity_invalid");
  const boundedClaims = ["repository", "taskKey", "claimIdentity", "chargeId", "originalRunnerRunId", "originalSupervisorRunId", "consumedRunnerRunId", "consumedSupervisorRunId", "failedContinuationRunnerRunId", "failedContinuationSupervisorRunId", "branch", "formerRootPath", "formerEffectivePhase", "incidentPath", "lifecycleLineage", "lifecycleSessionId", "intentPosture", "earliestSafePhase"];
  if (!boundedClaims.every((claim) => bounded(claims[claim]))
    || !/^[^/\s]+\/[^/\s]+$/.test(claims.repository)
    || claims.claimIdentity !== `${claims.repository}#${claims.issueNumber}`
    || !digest64(claims.chargeId)
    || claims.consumedRunnerRunId === claims.originalRunnerRunId
    || claims.consumedSupervisorRunId === claims.originalSupervisorRunId
    || !validShortGitBranch(claims.branch)
    || !path.isAbsolute(claims.formerRootPath) || !path.isAbsolute(claims.incidentPath)
    || !Number.isSafeInteger(claims.issueNumber) || claims.issueNumber < 1) return failed("semantic_claim_shape_invalid");
  const counters = ["acceptedLogicalTasks", "localSourceChangingRounds", "githubTriggeredFixEpochs", "lifetimeLocalSourceChangingRounds", "lifecycleMutationGeneration", "submissionCount"];
  if (!counters.every((claim) => Number.isSafeInteger(claims[claim]) && claims[claim] >= 0)
    || ![...zeroEffectClaims, "submissionExhausted", "successorEligible"].every((claim) => typeof claims[claim] === "boolean")) return failed("semantic_claim_shape_invalid");
  if (path.resolve(claims.formerRootPath) !== path.resolve(claims.incidentPath)) return failed("semantic_incident_path_lineage_invalid");
  const artifactIdentityClaims = ["originalSpecIdentity", "originalStateIdentity", "originalIterationIdentity", "originalSummaryIdentity", "failedContinuationSpecIdentity", "failedContinuationStateIdentity", "failedContinuationHeartbeatIdentity", "failedContinuationSummaryIdentity", "consumedSpecIdentity", "consumedStateIdentity", "consumedIterationIdentity", "consumedSummaryIdentity", "installedBundleDigest", "installedManifestDigest", "runtimeProfileDigest", "runtimeApprovalDigest", "launcherDigest", "healthUnitDigest"];
  if (!artifactIdentityClaims.every((claim) => digest64(claims[claim])) || !gitObjectId(claims.runtimeSourceSha)) return failed("semantic_runtime_or_run_identity_invalid");
  if (packet.formerBytesAvailable !== false) return failed("semantic_predecessor_bytes_posture_invalid");
  if (claims.acceptedLogicalTasks !== 1 || claims.submissionCount !== 1 || claims.submissionExhausted !== true || claims.successorEligible !== true) return failed("semantic_one_shot_posture_invalid");
  if (!Number.isSafeInteger(claims.lifecycleMutationGeneration) || claims.lifecycleMutationGeneration < 1
    || packet.lifecycleSuccessorGeneration !== claims.lifecycleMutationGeneration + 1
    || packet.lifecycleSuccessorSession === claims.lifecycleSessionId) return failed("semantic_lifecycle_successor_invalid");
  if (zeroEffectClaims.some((claim) => claims[claim] !== false)) return failed("semantic_no_effect_posture_invalid");
  if (!["checkpoint_validation_commit", "aggregate_validation"].includes(claims.earliestSafePhase)) return failed("semantic_earliest_safe_phase_invalid");
  if (claims.formerEffectivePhase !== claims.earliestSafePhase
    || claims.lifecycleLineage !== "terminal_validation_retry_to_distinct_successor"
    || claims.intentPosture !== "one_no_effect_overlay_then_consumed_submission") {
    return failed("semantic_recovery_posture_invalid");
  }
  if (!packet.artifacts.every((artifact) => bounded(artifact.role) && bounded(artifact.path) && digest64(artifact.sha256))) return failed("semantic_artifact_binding_invalid");
  return { ok: true };
}
function normalizeArtifact(artifact) { return { role: String(artifact?.role || ""), path: String(artifact?.path || ""), sha256: String(artifact?.sha256 || "") }; }
function compareArtifact(a, b) { return a.role.localeCompare(b.role) || a.path.localeCompare(b.path); }
function pickTaskIdentity(c) { return Object.fromEntries(["repository", "issueNumber", "taskKey", "claimIdentity", "chargeId", "branch", "baseSha", "headSha", "treeSha", "changedFilesDigest", "diffDigest"].map((key) => [key, c[key]])); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function manifestCoreFromManifest(manifest) { const clone = structuredClone(manifest); delete clone.manifestDigest; delete clone.intendedSuccessor; delete clone.operation; return clone; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function digest64(value) { return /^[a-f0-9]{64}$/.test(String(value || "")); }
function gitObjectId(value) { return /^[a-f0-9]{40}$/.test(String(value || "")); }
function validShortGitBranch(value) {
  if (!bounded(value) || value.startsWith("-") || value.startsWith("refs/") || value === "@" || value === "HEAD"
    || value.startsWith("/") || value.endsWith("/") || value.endsWith(".")
    || value.includes("//") || value.includes("..") || value.includes("@{")
    || /[\x00-\x20\x7f~^:?*\\[]/.test(value)) return false;
  return value.split("/").every((component) => component && !component.startsWith(".") && !component.endsWith(".lock"));
}
function bounded(value) { return typeof value === "string" && value.length > 0 && value.length <= 1000; }
function unique(values) { return [...new Set(values)].sort(); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function failed(reasonCode, diagnostics = []) { return { ok: false, reasonCode, diagnostics: unique(diagnostics) }; }
function canonicalConfiguredSuccessorRoot(config) {
  if (!config || typeof config.logsRoot !== "string" || !path.isAbsolute(config.logsRoot)) throw new Error("semantic successor logs root invalid");
  const lexicalLogsRoot = path.resolve(config.logsRoot);
  if (realpathSync(lexicalLogsRoot) !== lexicalLogsRoot) throw new Error("semantic successor logs root noncanonical");
  return path.join(lexicalLogsRoot, "recovery-successors");
}
function canonicalExistingPath(value) {
  const resolved = path.resolve(value);
  if (existsSync(resolved)) return realpathSync(resolved);
  const parent = path.dirname(resolved);
  return existsSync(parent) ? path.join(realpathSync(parent), path.basename(resolved)) : resolved;
}
function authenticateOpaqueArtifact(artifact) {
  const lexicalPath = path.resolve(artifact.path);
  const canonicalPath = realpathSync(lexicalPath);
  if (canonicalPath !== lexicalPath) throw new Error("artifact path noncanonical");
  assertOwnerOnlyCanonicalArtifactAncestors(canonicalPath);
  const fd = openSync(canonicalPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  let first;
  let bytes;
  try {
    first = fstatSync(fd);
    if (!first.isFile() || first.nlink !== 1 || first.size < 1 || first.size > maximumArtifactBytes
      || (first.mode & 0o077) !== 0 || (typeof process.getuid === "function" && first.uid !== process.getuid())) throw new Error("untrusted artifact");
    bytes = readFileSync(fd);
    const second = fstatSync(fd);
    const pathStat = lstatSync(canonicalPath);
    if (artifactStatIdentity(first) !== artifactStatIdentity(second)
      || artifactStatIdentity(first) !== artifactStatIdentity(pathStat)
      || realpathSync(canonicalPath) !== canonicalPath
      || bytes.length !== first.size || bytes.length > maximumArtifactBytes || !isUtf8(bytes)) {
      throw new Error("artifact changed during authentication");
    }
  } finally { closeSync(fd); }
  const actualSha256 = digest(bytes);
  if (actualSha256 !== artifact.sha256) throw new Error("artifact digest mismatch");
  const authenticated = { ...artifact, path: canonicalPath, authenticated: true, underlyingIdentity: digest(canonicalJson({ path: canonicalPath, stat: artifactStatIdentity(first), sha256: actualSha256 })), byteCount: first.size };
  Object.defineProperty(authenticated, "authenticatedBytes", { value: bytes, enumerable: false });
  return authenticated;
}
function assertOwnerOnlyCanonicalArtifactAncestors(file) {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  let cursor = path.dirname(file);
  while (true) {
    const stat = lstatSync(cursor);
    const rootOwnedStickyBoundary = stat.uid === 0 && (stat.mode & 0o1000) !== 0;
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(cursor) !== cursor
      || ((stat.mode & 0o022) !== 0 && !rootOwnedStickyBoundary)
      || (uid !== null && stat.uid !== uid && stat.uid !== 0)) throw new Error("artifact ancestor unsafe");
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
function artifactStatIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.uid, stat.gid, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}
function safeCanonicalMatch(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  try { return canonicalExistingPath(left) === canonicalExistingPath(right); } catch { return path.resolve(left) === path.resolve(right); }
}
