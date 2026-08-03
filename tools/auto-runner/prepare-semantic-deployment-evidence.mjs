#!/usr/bin/env node
import { createHash } from "node:crypto";
import path from "node:path";
import { loadDeploymentProjectAuthority } from "./lib/config.mjs";
import {
  authenticateSemanticDeploymentEvidencePackage,
  createOrAdoptSemanticDeploymentEvidencePackage,
  planSemanticDeploymentEvidencePackage,
} from "./lib/deployment-semantic-evidence-package.mjs";
import {
  collectSemanticDeploymentEvidenceContext,
  createSemanticDeploymentAuthorityReaders,
} from "./lib/deployment-semantic-evidence-extractors.mjs";

const valueOptions = new Set([
  "--approved-profile", "--associated-recovery", "--associated-recovery-sha256", "--config", "--health-unit",
  "--incident", "--incident-sha256", "--package-name", "--repo-root", "--runtime-root",
]);
const flagOptions = new Set(["--create-or-adopt", "--plan"]);
const parsed = parseArgs(process.argv.slice(2));
if ((parsed.flags.has("--plan") ? 1 : 0) + (parsed.flags.has("--create-or-adopt") ? 1 : 0) !== 1) {
  throw new Error("exactly one of --plan or --create-or-adopt is required");
}
for (const option of valueOptions) if (!parsed.values.has(option)) throw new Error(`${option} is required`);
for (const option of ["--incident-sha256", "--associated-recovery-sha256"]) {
  if (!/^[a-f0-9]{64}$/u.test(parsed.values.get(option))) throw new Error(`${option} must be a SHA-256 digest`);
}
const canonicalPath = (option) => {
  const resolved = path.resolve(parsed.values.get(option));
  if (resolved !== parsed.values.get(option)) throw new Error(`${option} must be an absolute canonical path`);
  return resolved;
};
const configPath = canonicalPath("--config");
const approvedProfilePath = canonicalPath("--approved-profile");
const healthUnitPath = canonicalPath("--health-unit");
const repoRoot = canonicalPath("--repo-root");
const runtimeRoot = canonicalPath("--runtime-root");
const incidentPath = canonicalPath("--incident");
const associatedRecoveryPath = canonicalPath("--associated-recovery");
const projectAuthorityRequest = {
  configPath,
  approvedProfilePath,
  repoRoot,
  runtimeRoot,
  healthUnitPath,
  allowRuntimeBootstrap: false,
};
const readProjectAuthority = () => loadDeploymentProjectAuthority(projectAuthorityRequest);
const extractionSelectors = {
  incidentPath,
  incidentSha256: parsed.values.get("--incident-sha256"),
  associatedRecoveryPath,
  associatedRecoverySha256: parsed.values.get("--associated-recovery-sha256"),
};
const contextDigests = [];
const readAuthorityContext = () => {
  const context = collectSemanticDeploymentEvidenceContext({
    projectAuthority: readProjectAuthority(),
    repositoryRoot: repoRoot,
    ...extractionSelectors,
  });
  contextDigests.push(sha256(canonicalJson(context)));
  return context;
};
const assertStableAuthorityReads = () => {
  if (new Set(contextDigests).size !== 1) throw new Error("semantic deployment authority changed between independent reads");
};
const extractionContext = readAuthorityContext();
const plan = planSemanticDeploymentEvidencePackage({
  configRoot: path.dirname(configPath),
  packageBasename: parsed.values.get("--package-name"),
  authorityReaders: createSemanticDeploymentAuthorityReaders({ readAuthorityContext }),
  extractionContext,
  createDocument: ({ packageRoot, claims, sources }) => {
    const documentContext = readAuthorityContext();
    assertStableAuthorityReads();
    return createDeploymentDocument({
      projectAuthority: documentContext.projectAuthority,
      context: documentContext,
      claims,
      packageRoot,
      sources,
    });
  },
});
const finalContext = readAuthorityContext();
assertStableAuthorityReads();

if (parsed.flags.has("--plan")) {
  process.stdout.write(`${canonicalJson({
    ok: true,
    mode: "plan",
    packageRoot: plan.packageRoot,
    documentPath: plan.documentPath,
    packageAggregateDigest: plan.packageAggregateDigest,
    packageManifestDigest: plan.packageManifestDigest,
    memberManifestDigest: plan.memberManifestDigest,
    posture: plan.posture,
    members: plan.members.map(({ name, sha256, bytes }) => ({ name, sha256, byteCount: bytes.length })),
    sourceClasses: sourcesFromPlan(plan),
    associatedRecovery: finalContext.association,
    allowedAction: "runtime_deployment_quiescence_only",
  })}\n`);
} else {
  const result = createOrAdoptSemanticDeploymentEvidencePackage(plan, {
    beforePublish: () => {
      readAuthorityContext();
      assertStableAuthorityReads();
    },
  });
  const readback = authenticateSemanticDeploymentEvidencePackage(result.documentPath);
  process.stdout.write(`${canonicalJson({ ...result, documentSha256: readback.evidence.sha256 })}\n`);
}

function createDeploymentDocument({ projectAuthority: authority, context, claims, packageRoot, sources }) {
  const artifacts = [
    ["current_incident_root", context.association.incident.path, context.association.incident.sha256],
    ["associated_recoverable_state", context.association.path, context.association.sha256],
    ["installed_runtime_manifest", authority.artifacts.runtimeManifest.path, authority.artifacts.runtimeManifest.sha256],
    ["runtime_config", authority.artifacts.runtimeConfig.path, authority.artifacts.runtimeConfig.sha256],
    ["approved_runtime_profile", authority.artifacts.approvedProfile.path, authority.artifacts.approvedProfile.sha256],
    ["runtime_approval", authority.artifacts.runtimeApproval.path, authority.artifacts.runtimeApproval.sha256],
    ["runtime_launcher", authority.artifacts.runtimeLauncher.path, authority.artifacts.runtimeLauncher.sha256],
    ["health_unit", authority.artifacts.healthUnit.path, authority.artifacts.healthUnit.sha256],
  ].map(([role, artifactPath, sha256]) => ({ role, path: artifactPath, sha256 }));
  const packet = {
    artifacts,
    formerBytesAvailable: false,
    incidentIdentity: sha256(canonicalJson({ path: claims.incidentPath, sha256: claims.incidentSha256 })),
    lifecycleSuccessorGeneration: claims.lifecycleMutationGeneration + 1,
    lifecycleSuccessorSession: `deployment-quiescence:${sha256(canonicalJson({ incident: claims.incidentSha256, association: context.association.stateDigest }))}`,
    sources,
  };
  const targetFields = [
    "repository", "issueNumber", "taskKey", "claimIdentity", "chargeId", "branch", "baseSha", "headSha", "treeSha",
    "changedFilesDigest", "diffDigest", "originalRunnerRunId", "originalSupervisorRunId", "failedContinuationRunnerRunId",
    "failedContinuationSupervisorRunId", "consumedRunnerRunId", "consumedSupervisorRunId", "acceptedLogicalTasks",
    "localSourceChangingRounds", "githubTriggeredFixEpochs", "lifetimeLocalSourceChangingRounds",
  ];
  const target = Object.fromEntries(targetFields.map((field) => [field, structuredClone(claims[field])]));
  return {
    approvedProfile: { path: authority.approvedProfilePath, sha256: authority.artifacts.approvedProfile.sha256 },
    associatedRecovery: {
      bindingDigest: sha256(canonicalJson(context.association)),
      path: context.association.path,
      sha256: context.association.sha256,
      stateDigest: context.association.stateDigest,
    },
    authenticatedProvenance: {
      bytesAvailable: false,
      consumedRunnerRunId: claims.consumedRunnerRunId,
      consumedSupervisorRunId: claims.consumedSupervisorRunId,
      incidentArtifact: { role: "current_incident_root", path: claims.incidentPath, sha256: claims.incidentSha256 },
      incidentPath: claims.incidentPath,
      incidentSha256: claims.incidentSha256,
      issueNumber: claims.issueNumber,
      ok: true,
      originalRunnerRunId: claims.originalRunnerRunId,
      originalSupervisorRunId: claims.originalSupervisorRunId,
      predecessorSha256: claims.formerRootSha256,
      repository: claims.repository,
      taskKey: claims.taskKey,
    },
    config: { path: authority.configPath, sha256: authority.artifacts.runtimeConfig.sha256 },
    contract: "settleora_semantic_incident_deployment_evidence",
    evidenceRoot: packageRoot,
    healthUnit: { path: authority.healthUnitPath, sha256: authority.artifacts.healthUnit.sha256 },
    ownerAttestation: {
      artifactManifestDigest: sha256(canonicalJson(artifacts.map(({ role, path: artifactPath, sha256: artifactSha256 }) => ({ role, path: artifactPath, sha256: artifactSha256 }))
        .sort((left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path)))),
      authority: "authenticated_external_profile_owner",
      scope: "runtime_deployment_quiescence_only",
      sourceManifestDigest: sha256(canonicalJson(sources.map(({ authorityClass, store }) => ({ authorityClass, store }))
        .sort((left, right) => left.authorityClass.localeCompare(right.authorityClass)))),
      targetDigest: sha256(canonicalJson(target)),
    },
    project: { namespace: authority.namespace, projectId: authority.projectId, repositorySlug: authority.repositorySlug },
    semanticEvidencePacket: packet,
    target,
    version: 1,
  };
}

function sourcesFromPlan(plan) {
  return plan.members.filter((member) => member.name.endsWith(".json")
    && !["deployment-evidence.json", "package-manifest.json"].includes(member.name))
    .map((member) => member.name.replace(/\.json$/u, ""));
}
function parseArgs(argv) {
  const values = new Map(); const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (flagOptions.has(option)) { if (flags.has(option)) throw new Error(`duplicate option ${option}`); flags.add(option); continue; }
    if (!valueOptions.has(option)) throw new Error(`unknown option ${option}`);
    if (values.has(option) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error(`invalid option ${option}`);
    values.set(option, argv[++index]);
  }
  return { values, flags };
}
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
