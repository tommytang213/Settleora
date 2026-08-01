import { createHash } from "node:crypto";
import { existsSync, linkSync, lstatSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const semanticRecoveryContract = "post_incident_semantic_successor";
export const semanticRecoveryVersion = 1;

export const mandatorySemanticEvidenceClasses = Object.freeze([
  "repository_git",
  "lifecycle",
  "logical_task_budget",
  "intent_lineage",
  "projection_deployment",
  "supervisor_child_run",
  "incident_report",
  "github_no_effect",
]);

export const semanticRecoveryRequiredClaims = Object.freeze([
  "repository", "issueNumber", "taskKey", "claimIdentity", "chargeId",
  "originalRunnerRunId", "originalSupervisorRunId", "consumedRunnerRunId",
  "consumedSupervisorRunId", "branch", "baseSha", "headSha", "treeSha",
  "changedFilesDigest", "diffDigest", "acceptedLogicalTasks",
  "localSourceChangingRounds", "githubTriggeredFixEpochs",
  "lifetimeLocalSourceChangingRounds", "formerRootPath", "formerRootSha256",
  "formerEffectivePhase", "incidentPath", "incidentSha256", "lifecycleLineage",
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

export function buildSemanticRecoveryManifest(packet, adapters = {}) {
  const diagnostics = validatePacketShape(packet);
  if (diagnostics.length) return failed("semantic_evidence_packet_invalid", diagnostics);
  const authenticateArtifact = adapters.authenticateArtifact || authenticateSourceArtifact;
  const authenticateBoundArtifact = adapters.authenticateBoundArtifact || authenticateOpaqueArtifact;
  let sources;
  try {
    sources = [...packet.sources].map((source) => normalizeSource(source, authenticateArtifact)).sort(compareSource);
  } catch {
    return failed("semantic_evidence_source_authentication_failed");
  }
  if (sources.some((source) => source.artifact.authenticated !== true)) return failed("semantic_evidence_source_authentication_failed");
  let artifacts;
  try {
    artifacts = [...packet.artifacts].map((artifact) => {
      const authenticated = authenticateBoundArtifact(normalizeArtifact(artifact));
      return { role: authenticated.role, path: authenticated.path, sha256: authenticated.sha256, authenticated: true };
    }).sort(compareArtifact);
  } catch { return failed("semantic_bound_artifact_authentication_failed"); }
  const classes = new Set(sources.map((source) => source.authorityClass));
  if (classes.size !== sources.length) return failed("semantic_evidence_class_not_independent", ["duplicate_authority_class"]);
  const underlyingArtifacts = new Set(sources.map((source) => source.underlyingIdentity));
  if (underlyingArtifacts.size !== sources.length) return failed("semantic_evidence_class_not_independent", ["duplicate_underlying_artifact"]);
  const missingClasses = mandatorySemanticEvidenceClasses.filter((name) => !classes.has(name));
  if (missingClasses.length) return failed("semantic_evidence_class_missing", missingClasses);

  const claimValues = new Map();
  const bindings = new Map();
  const contradictions = [];
  for (const source of sources) {
    for (const [claim, value] of Object.entries(source.claims)) {
      if (!semanticRecoveryRequiredClaims.includes(claim)) {
        return failed("semantic_evidence_unknown_claim", [claim]);
      }
      const encoded = canonicalJson(value);
      if (claimValues.has(claim) && claimValues.get(claim) !== encoded) contradictions.push(claim);
      else claimValues.set(claim, encoded);
      if (!bindings.has(claim)) bindings.set(claim, []);
      bindings.get(claim).push(source.authorityClass);
    }
  }
  if (contradictions.length) return failed("semantic_evidence_contradiction", unique(contradictions));
  const missingClaims = semanticRecoveryRequiredClaims.filter((claim) => !claimValues.has(claim));
  if (missingClaims.length) return failed("semantic_evidence_claim_missing", missingClaims);
  const uncorroborated = semanticRecoveryRequiredClaims.filter((claim) => new Set(bindings.get(claim)).size < 2);
  if (uncorroborated.length) return failed("semantic_evidence_claim_uncorroborated", uncorroborated);

  const claims = Object.fromEntries(semanticRecoveryRequiredClaims.map((claim) => [claim, JSON.parse(claimValues.get(claim))]));
  const posture = validateSecurityPosture(packet, claims);
  if (!posture.ok) return posture;
  const manifestCore = {
    contract: semanticRecoveryContract,
    version: semanticRecoveryVersion,
    incidentIdentity: packet.incidentIdentity,
    identities: pickTaskIdentity(claims),
    claims,
    evidenceSources: sources,
    sourceToClaimBindings: Object.fromEntries(semanticRecoveryRequiredClaims.map((claim) => [claim, [...new Set(bindings.get(claim))].sort()])),
    historicalPredecessor: { path: claims.formerRootPath, sha256: claims.formerRootSha256, bytesAvailable: false },
    currentIncident: { path: claims.incidentPath, sha256: claims.incidentSha256, authority: "immutable_incident_evidence_only" },
    artifacts,
    oneShotExhaustion: { submissionCount: claims.submissionCount, exhausted: claims.submissionExhausted },
    noEffectProof: Object.fromEntries(zeroEffectClaims.map((claim) => [claim, claims[claim]])),
    operation: { operationId: packet.operationId, requestId: packet.requestId },
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
  const successorIdentity = deriveSuccessorIdentity({
    incidentIdentity: packet.incidentIdentity,
    taskIdentity: pickTaskIdentity(claims),
    lifecycleSuccessorSession: packet.lifecycleSuccessorSession,
    operationId: packet.operationId,
    manifestDigest,
  });
  return { ok: true, reasonCode: "semantic_evidence_corroborated", manifest: { ...manifestCore, intendedSuccessor: successorIdentity, manifestDigest }, manifestDigest };
}

export function deriveSuccessorIdentity({ incidentIdentity, taskIdentity, lifecycleSuccessorSession, operationId, manifestDigest }) {
  const storageKey = digest(canonicalJson({ contract: semanticRecoveryContract, incidentIdentity, taskIdentity, lifecycleSuccessorSession, operationId, manifestDigest }));
  return { storageKey, lifecycleSuccessorSession, operationId };
}

export function constructPostIncidentSuccessor({ manifest, mutationGeneration, operationalAuthorization }) {
  if (!manifest?.manifestDigest || digest(canonicalJson(manifestCoreFromManifest(manifest))) !== manifest.manifestDigest) return failed("semantic_manifest_digest_mismatch");
  const expectedSuccessor = deriveSuccessorIdentity({
    incidentIdentity: manifest.incidentIdentity,
    taskIdentity: manifest.identities,
    lifecycleSuccessorSession: manifest.intendedSuccessor?.lifecycleSuccessorSession,
    operationId: manifest.operation?.operationId,
    manifestDigest: manifest.manifestDigest,
  });
  if (expectedSuccessor.storageKey !== manifest.intendedSuccessor?.storageKey) return failed("semantic_successor_identity_mismatch");
  if (operationalAuthorization?.authorized !== true || operationalAuthorization?.manifestDigest !== manifest.manifestDigest || operationalAuthorization?.operationId !== manifest.operation.operationId) {
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

export function persistOrAdoptPostIncidentSuccessor(config, construction, manifest) {
  if (!construction?.ok) return construction;
  if (!validatedConstructions.has(construction)
    || construction.storageKey !== manifest?.intendedSuccessor?.storageKey
    || construction.successor?.postIncidentSuccessor?.manifestDigest !== manifest?.manifestDigest
    || digest(canonicalJson(manifestCoreFromManifest(manifest))) !== manifest?.manifestDigest) {
    return failed("post_incident_persistence_binding_invalid");
  }
  const root = path.resolve(config.postIncidentSuccessorRoot || path.join(config.logsRoot, "recovery-successors"));
  const predecessor = canonicalExistingPath(manifest.historicalPredecessor.path);
  const incident = canonicalExistingPath(manifest.currentIncident.path);
  const successorPath = path.join(root, `${construction.storageKey}.json`);
  const safeRoot = validatePersistenceDirectory(config.logsRoot, root);
  if (!safeRoot.ok) return safeRoot;
  const canonicalSuccessor = path.join(safeRoot.path, path.basename(successorPath));
  if ([predecessor, incident].includes(canonicalSuccessor)) return failed("post_incident_successor_aliases_protected_path");
  const ledgerPath = path.join(safeRoot.path, "provenance", `${digest(canonicalJson({ incident }))}.json`);
  const record = {
    contract: semanticRecoveryContract,
    version: semanticRecoveryVersion,
    incident: manifest.currentIncident,
    manifestDigest: manifest.manifestDigest,
    successorIdentity: manifest.intendedSuccessor,
    operation: manifest.operation,
    lifecycleSession: manifest.intendedSuccessor.lifecycleSuccessorSession,
    mutationGeneration: construction.successor.mutationGeneration,
    oneShotExhaustion: manifest.oneShotExhaustion,
    artifactDigests: manifest.artifacts,
    result: "accepted",
    mutationAuthority: "unavailable_until_exact_successor_handoff",
  };
  const existingRecord = readSafeJsonIfExists(ledgerPath);
  const existingSuccessor = readSafeJsonIfExists(successorPath);
  if (existingRecord?.unsafe || existingSuccessor?.unsafe) return failed("post_incident_successor_destination_unsafe");
  if (existingRecord?.value && canonicalJson(existingRecord.value) !== canonicalJson(record)) return failed("post_incident_provenance_conflict");
  if (existingSuccessor?.value && canonicalJson(existingSuccessor.value) !== canonicalJson(construction.successor)) return failed("post_incident_successor_collision");
  if (existingRecord?.value && existingSuccessor?.value) return { ok: true, adopted: true, reasonCode: "post_incident_successor_adopted", successorPath, ledgerPath };
  const safeLedgerRoot = validatePersistenceDirectory(config.logsRoot, path.dirname(ledgerPath));
  if (!safeLedgerRoot.ok) return safeLedgerRoot;
  const claimed = claimImmutableJson(ledgerPath, record);
  if (!claimed.ok) return claimed;
  if (!existingSuccessor?.value) {
    const persisted = atomicJsonNoReplace(successorPath, construction.successor);
    if (!persisted.ok) return persisted;
  }
  return { ok: true, adopted: false, reasonCode: "post_incident_successor_created", successorPath, ledgerPath };
}

export function classifyRecoveryOverwriteIncident({ recoveryPath, state, authenticatedProvenance }) {
  if (!authenticatedProvenance?.ok) return { quarantined: false, reasonCode: "ordinary_recovery" };
  const identityMatch = state?.taskKey === authenticatedProvenance.taskKey && state?.issue?.number === authenticatedProvenance.issueNumber;
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
  return { ...classifyRecoveryOverwriteIncident({ recoveryPath: authenticated.path, state, authenticatedProvenance }), state };
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
    || !bounded(packet?.operationId) || !bounded(packet?.requestId)) diagnostics.push("operation_identity");
  if (Array.isArray(packet?.sources) && packet.sources.some((source) => !bounded(source?.artifact?.role)
    || !bounded(source?.artifact?.path) || !digest64(source?.artifact?.sha256))) diagnostics.push("source_binding");
  return diagnostics;
}
function validateSecurityPosture(packet, claims) {
  if (!digest64(claims.formerRootSha256) || !digest64(claims.incidentSha256) || claims.formerRootSha256 === claims.incidentSha256) return failed("semantic_root_identity_invalid");
  if (![claims.baseSha, claims.headSha, claims.treeSha].every(gitObjectId)
    || !digest64(claims.changedFilesDigest) || !digest64(claims.diffDigest)) return failed("semantic_git_identity_invalid");
  const boundedClaims = ["repository", "taskKey", "claimIdentity", "chargeId", "originalRunnerRunId", "originalSupervisorRunId", "consumedRunnerRunId", "consumedSupervisorRunId", "branch", "formerRootPath", "formerEffectivePhase", "incidentPath", "lifecycleLineage", "lifecycleSessionId", "intentPosture", "earliestSafePhase"];
  if (!boundedClaims.every((claim) => bounded(claims[claim]))
    || !/^[^/\s]+\/[^/\s]+$/.test(claims.repository)
    || !/^refs\//.test(claims.branch) && !/^[A-Za-z0-9._/-]+$/.test(claims.branch)
    || !path.isAbsolute(claims.formerRootPath) || !path.isAbsolute(claims.incidentPath)
    || !Number.isSafeInteger(claims.issueNumber) || claims.issueNumber < 1) return failed("semantic_claim_shape_invalid");
  const counters = ["acceptedLogicalTasks", "localSourceChangingRounds", "githubTriggeredFixEpochs", "lifetimeLocalSourceChangingRounds", "lifecycleMutationGeneration", "submissionCount"];
  if (!counters.every((claim) => Number.isSafeInteger(claims[claim]) && claims[claim] >= 0)
    || ![...zeroEffectClaims, "submissionExhausted", "successorEligible"].every((claim) => typeof claims[claim] === "boolean")) return failed("semantic_claim_shape_invalid");
  if (path.resolve(claims.formerRootPath) !== path.resolve(claims.incidentPath)) return failed("semantic_incident_path_lineage_invalid");
  if (packet.formerBytesAvailable !== false) return failed("semantic_predecessor_bytes_posture_invalid");
  if (claims.acceptedLogicalTasks !== 1 || claims.submissionCount !== 1 || claims.submissionExhausted !== true || claims.successorEligible !== true) return failed("semantic_one_shot_posture_invalid");
  if (!Number.isSafeInteger(claims.lifecycleMutationGeneration) || claims.lifecycleMutationGeneration < 1
    || packet.lifecycleSuccessorGeneration !== claims.lifecycleMutationGeneration + 1
    || packet.lifecycleSuccessorSession === claims.lifecycleSessionId) return failed("semantic_lifecycle_successor_invalid");
  if (zeroEffectClaims.some((claim) => claims[claim] !== false)) return failed("semantic_no_effect_posture_invalid");
  if (!["checkpoint_validation_commit", "aggregate_validation"].includes(claims.earliestSafePhase)) return failed("semantic_earliest_safe_phase_invalid");
  if (!packet.artifacts.every((artifact) => bounded(artifact.role) && bounded(artifact.path) && digest64(artifact.sha256))) return failed("semantic_artifact_binding_invalid");
  return { ok: true };
}
function normalizeSource(source, authenticateArtifact) {
  const authenticated = authenticateArtifact(normalizeArtifact(source.artifact), source);
  if (!mandatorySemanticEvidenceClasses.includes(authenticated.authorityClass)
    || !authenticated.claims || typeof authenticated.claims !== "object" || Array.isArray(authenticated.claims)) throw new Error("invalid evidence document");
  const normalized = { authorityClass: String(authenticated.authorityClass), artifact: { role: authenticated.role, path: authenticated.path, sha256: authenticated.sha256, authenticated: true }, claims: sortObject(authenticated.claims) };
  Object.defineProperty(normalized, "underlyingIdentity", { value: authenticated.underlyingIdentity, enumerable: false });
  return normalized;
}
function normalizeArtifact(artifact) { return { role: String(artifact?.role || ""), path: String(artifact?.path || ""), sha256: String(artifact?.sha256 || "") }; }
function compareSource(a, b) { return a.authorityClass.localeCompare(b.authorityClass); }
function compareArtifact(a, b) { return a.role.localeCompare(b.role) || a.path.localeCompare(b.path); }
function pickTaskIdentity(c) { return Object.fromEntries(["repository", "issueNumber", "taskKey", "claimIdentity", "chargeId", "branch", "baseSha", "headSha", "treeSha", "changedFilesDigest", "diffDigest"].map((key) => [key, c[key]])); }
function sortObject(value) { return Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b))); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function manifestCoreFromManifest(manifest) { const clone = structuredClone(manifest); delete clone.manifestDigest; delete clone.intendedSuccessor; return clone; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function digest64(value) { return /^[a-f0-9]{64}$/.test(String(value || "")); }
function gitObjectId(value) { return /^[a-f0-9]{40}$/.test(String(value || "")); }
function bounded(value) { return typeof value === "string" && value.length > 0 && value.length <= 1000; }
function unique(values) { return [...new Set(values)].sort(); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function failed(reasonCode, diagnostics = []) { return { ok: false, reasonCode, diagnostics: unique(diagnostics) }; }
function readSafeJsonIfExists(file) {
  if (!existsSync(file)) return null;
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) return { unsafe: true };
  try { return { value: JSON.parse(readFileSync(file, "utf8")) }; } catch { return { unsafe: true }; }
}
function claimImmutableJson(file, value) {
  const existing = readSafeJsonIfExists(file);
  if (existing?.unsafe) return failed("post_incident_successor_destination_unsafe");
  if (existing?.value) return canonicalJson(existing.value) === canonicalJson(value)
    ? { ok: true, adopted: true }
    : failed("post_incident_provenance_conflict");
  const temp = `${file}.${process.pid}.${Date.now()}.claim`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  try {
    linkSync(temp, file);
    return { ok: true, adopted: false };
  } catch (error) {
    if (error?.code !== "EEXIST") return failed("post_incident_provenance_claim_failed");
    const raced = readSafeJsonIfExists(file);
    if (raced?.unsafe) return failed("post_incident_successor_destination_unsafe");
    return raced?.value && canonicalJson(raced.value) === canonicalJson(value)
      ? { ok: true, adopted: true }
      : failed("post_incident_provenance_conflict");
  } finally { try { unlinkSync(temp); } catch {} }
}
function atomicJsonNoReplace(file, value) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  try { linkSync(temp, file); return { ok: true }; }
  catch (error) {
    if (error?.code !== "EEXIST") return failed("post_incident_successor_persist_failed");
    const existing = readSafeJsonIfExists(file);
    if (existing?.unsafe) return failed("post_incident_successor_destination_unsafe");
    return canonicalJson(existing?.value) === canonicalJson(value)
      ? { ok: true }
      : failed("post_incident_successor_collision");
  } finally { try { unlinkSync(temp); } catch {} }
}
function canonicalExistingPath(value) {
  const resolved = path.resolve(value);
  if (existsSync(resolved)) return realpathSync(resolved);
  const parent = path.dirname(resolved);
  return existsSync(parent) ? path.join(realpathSync(parent), path.basename(resolved)) : resolved;
}
function validatePersistenceDirectory(logsRoot, directory) {
  try {
    const lexicalRoot = path.resolve(logsRoot);
    const trustedRoot = realpathSync(lexicalRoot);
    if (trustedRoot !== lexicalRoot) return failed("post_incident_successor_root_unsafe");
    const lexicalDirectory = path.resolve(directory);
    const lexicalRelative = path.relative(lexicalRoot, lexicalDirectory);
    if (lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) return failed("post_incident_successor_root_unsafe");
    let lexicalCursor = lexicalRoot;
    for (const segment of lexicalRelative.split(path.sep).filter(Boolean)) {
      lexicalCursor = path.join(lexicalCursor, segment);
      const lexicalStat = lstatSync(lexicalCursor);
      if (lexicalStat.isSymbolicLink() || !lexicalStat.isDirectory()) return failed("post_incident_successor_root_unsafe");
    }
    const real = realpathSync(lexicalDirectory);
    const relative = path.relative(trustedRoot, real);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return failed("post_incident_successor_root_unsafe");
    let cursor = real;
    while (true) {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()
        || (typeof process.getuid === "function" && stat.uid !== process.getuid())
        || (stat.mode & 0o077) !== 0) return failed("post_incident_successor_root_unsafe");
      if (cursor === trustedRoot) break;
      const parent = path.dirname(cursor);
      if (parent === cursor) return failed("post_incident_successor_root_unsafe");
      cursor = parent;
    }
    return { ok: true, path: real };
  } catch { return failed("post_incident_successor_root_unsafe"); }
}
function authenticateSourceArtifact(artifact) {
  const authenticated = authenticateOpaqueArtifact(artifact);
  const document = JSON.parse(authenticated.authenticatedBytes.toString("utf8"));
  if (document?.contract !== "semantic_recovery_evidence_source" || document?.version !== 1) throw new Error("invalid evidence document");
  return { ...authenticated, authorityClass: document.authorityClass, claims: document.claims };
}
function authenticateOpaqueArtifact(artifact) {
  const canonicalPath = realpathSync(artifact.path);
  const stat = lstatSync(canonicalPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink < 1 || (stat.mode & 0o077) !== 0) throw new Error("untrusted artifact");
  const bytes = readFileSync(canonicalPath);
  const actualSha256 = digest(bytes);
  if (actualSha256 !== artifact.sha256) throw new Error("artifact digest mismatch");
  const authenticated = { ...artifact, path: canonicalPath, authenticated: true, underlyingIdentity: actualSha256 };
  Object.defineProperty(authenticated, "authenticatedBytes", { value: bytes, enumerable: false });
  return authenticated;
}
function safeCanonicalMatch(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  try { return canonicalExistingPath(left) === canonicalExistingPath(right); } catch { return path.resolve(left) === path.resolve(right); }
}
