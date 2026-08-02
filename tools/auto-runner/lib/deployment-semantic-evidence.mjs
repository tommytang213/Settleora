import { createHash } from "node:crypto";
import path from "node:path";
import {
  corroborateSemanticRecoveryEvidenceForDeployment,
  inspectConfiguredRecoveryOverwriteIncident,
} from "./post-incident-successor-recovery.mjs";
import {
  createReadOnlySemanticDeploymentVerifierRegistry,
  semanticRecoveryAuthorityClasses,
  semanticRecoveryClaimOwnerMatrixDigest,
  semanticRecoveryClaimOwnerMatrixVersion,
  semanticRecoveryVerifierSetDigest,
  semanticRecoveryVerifierSetVersion,
} from "./semantic-recovery-authority.mjs";

export const semanticDeploymentEvidenceContract = "settleora_semantic_incident_deployment_evidence";
export const semanticDeploymentEvidenceVersion = 1;

const semanticDeploymentTargetFields = Object.freeze([
  "repository", "issueNumber", "taskKey", "claimIdentity", "chargeId", "branch", "baseSha", "headSha", "treeSha",
  "changedFilesDigest", "diffDigest", "originalRunnerRunId", "originalSupervisorRunId",
  "failedContinuationRunnerRunId", "failedContinuationSupervisorRunId", "consumedRunnerRunId", "consumedSupervisorRunId",
  "acceptedLogicalTasks", "localSourceChangingRounds", "githubTriggeredFixEpochs", "lifetimeLocalSourceChangingRounds",
]);
const requiredRuntimeArtifactRoles = Object.freeze({
  current_incident_root: "incident",
  installed_runtime_manifest: "runtimeManifest",
  runtime_config: "runtimeConfig",
  approved_runtime_profile: "approvedProfile",
  runtime_approval: "runtimeApproval",
  runtime_launcher: "runtimeLauncher",
  health_unit: "healthUnit",
});

export function inspectSemanticIncidentForDeployment({ document, documentEvidence, projectAuthority, recoverableStates } = {}) {
  let normalized;
  try { normalized = normalizeSemanticDeploymentEvidenceDocument(document, documentEvidence, projectAuthority); }
  catch { return failed("semantic_deployment_evidence_document_invalid"); }
  const incident = inspectConfiguredRecoveryOverwriteIncident(normalized.authenticatedProvenance);
  if (!incident?.quarantined || incident.readOnly !== true
      || incident.reasonCode !== "authenticated_recovery_overwrite_incident"
      || incident.allowedAction !== "semantic_corroboration_only") {
    return failed(incident?.reasonCode || "semantic_deployment_incident_not_admissible");
  }
  if (!Array.isArray(recoverableStates) || recoverableStates.length !== 1) {
    return failed("semantic_deployment_unresolved_recovery_count_invalid");
  }
  const recovery = recoverableStates[0];
  if (path.resolve(recovery?.statePath || "") !== incident.incident.path
      || recovery?.issue?.number !== normalized.authenticatedProvenance.issueNumber
      || recovery?.run?.runId !== normalized.authenticatedProvenance.consumedRunnerRunId
      || recovery?.run?.supervisorRunId !== normalized.authenticatedProvenance.consumedSupervisorRunId) {
    return failed("semantic_deployment_unresolved_recovery_identity_mismatch");
  }
  let registry;
  try {
    registry = createReadOnlySemanticDeploymentVerifierRegistry({
      evidenceRoot: normalized.evidenceRoot,
      repositorySlug: normalized.authenticatedProvenance.repository,
      ownerAuthorityDigest: normalized.documentEvidence.sha256,
    });
  } catch { return failed("semantic_deployment_verifier_registry_invalid"); }
  const corroboration = corroborateSemanticRecoveryEvidenceForDeployment(
    normalized.semanticEvidencePacket,
    { verifierRegistry: registry },
  );
  if (!corroboration.ok) return corroboration;
  const manifest = corroboration.manifest;
  const claims = manifest.claims;
  const provenance = normalized.authenticatedProvenance;
  for (const field of semanticDeploymentTargetFields) {
    if (canonicalJson(claims[field]) !== canonicalJson(normalized.target[field])) {
      return failed("semantic_deployment_target_identity_mismatch", [field]);
    }
  }
  if (claims.repository.toLowerCase() !== projectAuthority.repositorySlug
      || provenance.repository.toLowerCase() !== projectAuthority.repositorySlug
      || claims.issueNumber !== provenance.issueNumber || claims.taskKey !== provenance.taskKey
      || claims.incidentPath !== incident.incident.path || claims.incidentSha256 !== incident.incident.sha256
      || claims.originalRunnerRunId !== provenance.originalRunnerRunId
      || claims.originalSupervisorRunId !== provenance.originalSupervisorRunId
      || claims.consumedRunnerRunId !== provenance.consumedRunnerRunId
      || claims.consumedSupervisorRunId !== provenance.consumedSupervisorRunId) {
    return failed("semantic_deployment_incident_or_run_binding_mismatch");
  }
  const artifactsByRole = new Map();
  for (const artifact of manifest.artifacts) {
    if (artifactsByRole.has(artifact.role)) return failed("semantic_deployment_artifact_role_duplicate");
    artifactsByRole.set(artifact.role, artifact);
  }
  for (const [role, authorityKey] of Object.entries(requiredRuntimeArtifactRoles)) {
    const artifact = artifactsByRole.get(role);
    const expected = authorityKey === "incident"
      ? { path: incident.incident.path, sha256: incident.incident.sha256 }
      : projectAuthority.artifacts?.[authorityKey];
    if (!artifact || !expected || artifact.path !== expected.path || artifact.sha256 !== expected.sha256) {
      return failed("semantic_deployment_runtime_artifact_binding_mismatch", [role]);
    }
  }
  if (claims.runtimeSourceSha !== projectAuthority.runtimeSourceSha
      || claims.installedBundleDigest !== projectAuthority.runtimeBundleDigest
      || claims.installedManifestDigest !== projectAuthority.artifacts.runtimeManifest.sha256
      || claims.runtimeProfileDigest !== projectAuthority.artifacts.approvedProfile.sha256
      || claims.runtimeApprovalDigest !== projectAuthority.artifacts.runtimeApproval.sha256
      || claims.launcherDigest !== projectAuthority.artifacts.runtimeLauncher.sha256
      || claims.healthUnitDigest !== projectAuthority.artifacts.healthUnit.sha256) {
    return failed("semantic_deployment_runtime_claim_binding_mismatch");
  }
  const proofCore = {
    contract: semanticDeploymentEvidenceContract,
    version: semanticDeploymentEvidenceVersion,
    allowedAction: "runtime_deployment_quiescence_only",
    project: {
      projectId: projectAuthority.projectId,
      repositorySlug: projectAuthority.repositorySlug,
      namespace: projectAuthority.namespace,
      authorityDigest: projectAuthority.evidenceDigest,
      configDigest: projectAuthority.artifacts.runtimeConfig.sha256,
      profileDigest: projectAuthority.artifacts.approvedProfile.sha256,
      configuredPostIncidentRecoveryDigest: projectAuthority.configuredPostIncidentRecovery
        ? digest(canonicalJson(projectAuthority.configuredPostIncidentRecovery))
        : null,
    },
    evidenceDocument: {
      path: normalized.documentEvidence.realPath,
      sha256: normalized.documentEvidence.sha256,
    },
    incident: {
      classification: "semantic_corroboration_only",
      identity: manifest.incidentIdentity,
      sha256: incident.incident.sha256,
    },
    task: manifest.identities,
    runRoles: {
      originalRunnerRunId: claims.originalRunnerRunId,
      originalSupervisorRunId: claims.originalSupervisorRunId,
      failedContinuationRunnerRunId: claims.failedContinuationRunnerRunId,
      failedContinuationSupervisorRunId: claims.failedContinuationSupervisorRunId,
      consumedRunnerRunId: claims.consumedRunnerRunId,
      consumedSupervisorRunId: claims.consumedSupervisorRunId,
    },
    claimOwnerMatrix: { version: semanticRecoveryClaimOwnerMatrixVersion, digest: semanticRecoveryClaimOwnerMatrixDigest },
    sourceVerifierSet: { version: semanticRecoveryVerifierSetVersion, digest: semanticRecoveryVerifierSetDigest },
    sourceClasses: [...semanticRecoveryAuthorityClasses],
    ownerAttestation: {
      authority: normalized.ownerAttestation.authority,
      scope: normalized.ownerAttestation.scope,
      documentDigest: normalized.documentEvidence.sha256,
      sourceManifestDigest: normalized.ownerAttestation.sourceManifestDigest,
      artifactManifestDigest: normalized.ownerAttestation.artifactManifestDigest,
      targetDigest: normalized.ownerAttestation.targetDigest,
    },
    semanticManifestDigest: corroboration.manifestDigest,
    boundArtifacts: manifest.artifacts.map(({ role, path: artifactPath, sha256 }) => ({ role, path: artifactPath, sha256 })),
    noEffectProof: manifest.noEffectProof,
    oneShotExhaustion: manifest.oneShotExhaustion,
    unresolvedRecoveryCount: 1,
    activeOperationalOwner: false,
    protectedGrantRead: false,
    protectedProducerInvoked: false,
    successorConstructed: false,
    successorPersisted: false,
  };
  return deepFreeze({
    ok: true,
    reasonCode: "semantic_incident_deployment_only_admitted",
    manifestDigest: corroboration.manifestDigest,
    evidenceDigest: digest(canonicalJson(proofCore)),
    proof: proofCore,
  });
}

export function normalizeSemanticDeploymentEvidenceDocument(document, documentEvidence, projectAuthority) {
  assertExactKeys(document, [
    "approvedProfile", "authenticatedProvenance", "config", "contract", "evidenceRoot",
    "healthUnit", "ownerAttestation", "project", "semanticEvidencePacket", "target", "version",
  ]);
  if (document.contract !== semanticDeploymentEvidenceContract || document.version !== semanticDeploymentEvidenceVersion) {
    throw new Error("semantic deployment evidence contract invalid");
  }
  assertExactKeys(documentEvidence, ["mode", "ownerUid", "realPath", "sha256", "strategy"]);
  if (typeof documentEvidence.realPath !== "string" || !path.isAbsolute(documentEvidence.realPath)
      || path.resolve(documentEvidence.realPath) !== documentEvidence.realPath
      || path.dirname(documentEvidence.realPath) !== path.dirname(projectAuthority.configPath)
      || !/^[a-f0-9]{64}$/u.test(documentEvidence.sha256)
      || digest(canonicalJson(document)) !== documentEvidence.sha256) {
    throw new Error("semantic deployment evidence document identity invalid");
  }
  assertExactKeys(document.project, ["namespace", "projectId", "repositorySlug"]);
  assertExactKeys(document.config, ["path", "sha256"]);
  assertExactKeys(document.approvedProfile, ["path", "sha256"]);
  assertExactKeys(document.healthUnit, ["path", "sha256"]);
  assertExactKeys(document.target, semanticDeploymentTargetFields);
  assertExactKeys(document.ownerAttestation, ["artifactManifestDigest", "authority", "scope", "sourceManifestDigest", "targetDigest"]);
  if (document.ownerAttestation.authority !== "authenticated_external_profile_owner"
      || document.ownerAttestation.scope !== "runtime_deployment_quiescence_only"
      || document.ownerAttestation.sourceManifestDigest !== sourceManifestDigest(document.semanticEvidencePacket?.sources)
      || document.ownerAttestation.artifactManifestDigest !== artifactManifestDigest(document.semanticEvidencePacket?.artifacts)
      || document.ownerAttestation.targetDigest !== digest(canonicalJson(document.target))) {
    throw new Error("semantic deployment owner attestation invalid");
  }
  if (projectAuthority.configuredPostIncidentRecovery
      && (canonicalJson(document.authenticatedProvenance)
          !== canonicalJson(projectAuthority.configuredPostIncidentRecovery.authenticatedProvenance)
        || canonicalJson(document.semanticEvidencePacket)
          !== canonicalJson(projectAuthority.configuredPostIncidentRecovery.semanticEvidencePacket))) {
    throw new Error("semantic deployment evidence contradicts configured post-incident recovery");
  }
  for (const [actual, expected] of [
    [document.project.projectId, projectAuthority.projectId],
    [String(document.project.repositorySlug || "").toLowerCase(), projectAuthority.repositorySlug],
    [document.project.namespace, projectAuthority.namespace],
    [document.config.path, projectAuthority.configPath],
    [document.config.sha256, projectAuthority.artifacts.runtimeConfig.sha256],
    [document.approvedProfile.path, projectAuthority.approvedProfilePath],
    [document.approvedProfile.sha256, projectAuthority.artifacts.approvedProfile.sha256],
    [document.healthUnit.path, projectAuthority.healthUnitPath],
    [document.healthUnit.sha256, projectAuthority.artifacts.healthUnit.sha256],
  ]) if (actual !== expected) throw new Error("semantic deployment project authority mismatch");
  if (typeof document.evidenceRoot !== "string" || !path.isAbsolute(document.evidenceRoot)
      || path.resolve(document.evidenceRoot) !== document.evidenceRoot
      || path.dirname(document.evidenceRoot) !== path.dirname(projectAuthority.configPath)) {
    throw new Error("semantic deployment evidence root boundary invalid");
  }
  if (!document.authenticatedProvenance || typeof document.authenticatedProvenance !== "object"
      || !document.semanticEvidencePacket || typeof document.semanticEvidencePacket !== "object") {
    throw new Error("semantic deployment evidence content missing");
  }
  return deepFreeze({ ...structuredClone(document), documentEvidence: structuredClone(documentEvidence) });
}

function assertExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new Error("semantic deployment evidence has unsupported or missing fields");
  }
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function sourceManifestDigest(sources) {
  if (!Array.isArray(sources)) return null;
  return digest(canonicalJson(sources.map(({ authorityClass, store }) => ({ authorityClass, store }))
    .sort((left, right) => String(left.authorityClass).localeCompare(String(right.authorityClass)))));
}
function artifactManifestDigest(artifacts) {
  if (!Array.isArray(artifacts)) return null;
  return digest(canonicalJson(artifacts.map(({ role, path: artifactPath, sha256 }) => ({ role, path: artifactPath, sha256 }))
    .sort((left, right) => String(left.role).localeCompare(String(right.role)) || String(left.path).localeCompare(String(right.path)))));
}
function failed(reasonCode, diagnostics = []) { return { ok: false, reasonCode, diagnostics: [...new Set(diagnostics)].sort() }; }
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
