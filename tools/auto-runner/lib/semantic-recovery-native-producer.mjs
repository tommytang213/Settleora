import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  applySemanticRecoveryClaimOwnerMatrix,
  deriveSemanticRecoveryOperationRequest,
  expectedSemanticRecoveryGrantDocument,
  semanticRecoveryAllowedAction,
  semanticRecoveryAuthorityClasses,
  semanticRecoveryClaimOwnerMatrix,
  semanticRecoveryClaimOwnerMatrixDigest,
  semanticRecoveryClaimOwnerMatrixVersion,
  semanticRecoveryVerifierSet,
  semanticRecoveryVerifierSetDigest,
  semanticRecoveryVerifierSetVersion,
} from "./semantic-recovery-authority.mjs";
import {
  nativeSemanticSourceContract,
  nativeSemanticSourceVersion,
  semanticRecoveryProtectedLayout,
  semanticRecoveryProtectedStorePath,
} from "./semantic-recovery-protected-store.mjs";

export const semanticRecoveryNativeProducerRequestContract = "settleora_semantic_recovery_native_producer_request";
export const semanticRecoveryNativeProducerRequestVersion = 1;
export const semanticRecoveryNativeInstallPlanContract = "settleora_semantic_recovery_native_install_plan";
export const semanticRecoveryNativeInstallPlanVersion = 1;
export const semanticRecoveryNativeGrantPlanContract = "settleora_semantic_recovery_native_grant_plan";
export const semanticRecoveryNativeGrantPlanVersion = 1;

const digestPattern = /^[a-f0-9]{64}$/u;
const shaPattern = /^[a-f0-9]{40}$/u;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const supportSourcePattern = /^tools\/auto-runner\/(?:[A-Za-z0-9._/-]+\.mjs|README\.md)$/u;

export function normalizeSemanticRecoveryNativeProducerRequest(value) {
  assertExactKeys(value, ["contract", "expiresAt", "observedAt", "operation", "repository", "runtime", "source", "version"]);
  assertExactKeys(value.source, ["deploymentEvidenceDocument", "sha256"]);
  assertExactKeys(value.runtime, ["approvalDigest", "bundleDigest", "healthUnitDigest", "launcherDigest", "manifestDigest", "profileDigest", "sourceSha"]);
  if (value.contract !== semanticRecoveryNativeProducerRequestContract
      || value.version !== semanticRecoveryNativeProducerRequestVersion
      || value.operation !== "install_native_semantic_recovery_producer"
      || !repositoryPattern.test(String(value.repository || ""))
      || !path.isAbsolute(value.source.deploymentEvidenceDocument || "")
      || path.resolve(value.source.deploymentEvidenceDocument) !== value.source.deploymentEvidenceDocument
      || !value.source.deploymentEvidenceDocument.startsWith("/workspace/auto-runner/config/")
      || path.basename(value.source.deploymentEvidenceDocument) !== "deployment-evidence.json"
      || !isDigest(value.source.sha256)
      || !validTimestamp(value.observedAt) || !validTimestamp(value.expiresAt)
      || Date.parse(value.expiresAt) <= Date.parse(value.observedAt)
      || Date.parse(value.expiresAt) - Date.parse(value.observedAt) > 15 * 60 * 1000
      || !shaPattern.test(String(value.runtime.sourceSha || ""))
      || ["bundleDigest", "manifestDigest", "profileDigest", "approvalDigest", "launcherDigest", "healthUnitDigest"]
        .some((field) => !isDigest(value.runtime[field]))) {
    throw new Error("semantic native producer request invalid");
  }
  return deepFreeze(structuredClone(value));
}

export function planSemanticRecoveryNativeInstall({
  request,
  authorityReaders,
  readAuthorityContext,
  supportFiles,
  now = new Date(),
} = {}) {
  const normalized = normalizeSemanticRecoveryNativeProducerRequest(request);
  if (!authorityReaders || typeof authorityReaders !== "object"
      || typeof readAuthorityContext !== "function" || !Array.isArray(supportFiles)) {
    throw new Error("semantic native producer dependencies invalid");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())
      || Date.parse(normalized.observedAt) > now.getTime() + 30_000
      || Date.parse(normalized.expiresAt) <= now.getTime()) {
    throw new Error("semantic native producer request stale");
  }
  const requestDigest = sha256(canonicalJson(normalized));
  const normalizedSupport = supportFiles.map(normalizeSupportFile).sort((left, right) => left.source.localeCompare(right.source));
  if (normalizedSupport.length < 2 || new Set(normalizedSupport.map((entry) => entry.source)).size !== normalizedSupport.length) {
    throw new Error("semantic native producer support manifest invalid");
  }
  const producerBundleDigest = sha256(canonicalJson(normalizedSupport.map(({ source, sha256: digest, byteCount }) => ({ source, sha256: digest, byteCount }))));
  const projections = [];
  for (const authorityClass of semanticRecoveryAuthorityClasses) {
    const reader = authorityReaders[authorityClass];
    if (typeof reader !== "function") throw new Error(`semantic native producer reader missing: ${authorityClass}`);
    // Every class gets a fresh complete authority context. The root producer
    // never relabels a shared envelope as eight authorities.
    const projection = reader(readAuthorityContext(authorityClass));
    validateProjection(authorityClass, projection, normalized.repository);
    projections.push(projection);
  }
  if (new Set(projections.map((projection) => projection.provenanceIdentity)).size !== projections.length) {
    throw new Error("semantic native producer provenance is not independent");
  }
  const matrix = applySemanticRecoveryClaimOwnerMatrix(projections.map((projection) => ({
    authorityClass: projection.authorityClass,
    claims: projection.claims,
  })));
  if (!matrix.ok) throw new Error(`semantic native producer claim matrix invalid: ${matrix.reasonCode}`);
  const runtimeClaims = {
    sourceSha: matrix.claims.runtimeSourceSha,
    bundleDigest: matrix.claims.installedBundleDigest,
    manifestDigest: matrix.claims.installedManifestDigest,
    profileDigest: matrix.claims.runtimeProfileDigest,
    approvalDigest: matrix.claims.runtimeApprovalDigest,
    launcherDigest: matrix.claims.launcherDigest,
    healthUnitDigest: matrix.claims.healthUnitDigest,
  };
  if (matrix.claims.repository !== normalized.repository
      || canonicalJson(runtimeClaims) !== canonicalJson(normalized.runtime)) {
    throw new Error("semantic native producer selected source identity drift");
  }
  const policy = {
    contract: "settleora_semantic_recovery_native_policy",
    version: 1,
    allowedAction: semanticRecoveryAllowedAction,
    repository: normalized.repository,
    requestDigest,
    producerBundleDigest,
    claimOwnerMatrix: { version: semanticRecoveryClaimOwnerMatrixVersion, digest: semanticRecoveryClaimOwnerMatrixDigest },
    verifierSet: { version: semanticRecoveryVerifierSetVersion, digest: semanticRecoveryVerifierSetDigest },
    layout: semanticRecoveryProtectedLayout,
    processModel: "root_invoked_offline_no_network_listener",
  };
  const policyBytes = canonicalBytes(policy);
  const files = normalizedSupport.map((support) => ({
    kind: "producer_runtime",
    source: support.source,
    destination: path.posix.join(
      semanticRecoveryProtectedLayout.producerRoot,
      path.posix.relative("tools/auto-runner", support.source),
    ),
    mode: support.executable ? 0o555 : 0o444,
    uid: 0,
    gid: 0,
    sha256: support.sha256,
    byteCount: support.byteCount,
    bytes: support.bytes,
  }));
  files.push({
    kind: "producer_policy",
    source: null,
    destination: semanticRecoveryProtectedLayout.producerPolicy,
    mode: 0o444,
    uid: 0,
    gid: 0,
    sha256: sha256(policyBytes),
    byteCount: policyBytes.length,
    bytes: policyBytes,
  });
  const sourceDescriptors = [];
  for (const projection of projections) {
    const definition = semanticRecoveryVerifierSet.verifiers[projection.authorityClass];
    const role = `${projection.authorityClass}_authority`;
    const document = {
      authorityClass: projection.authorityClass,
      claims: projection.claims,
      contract: nativeSemanticSourceContract,
      expiresAt: normalized.expiresAt,
      producer: { id: definition.id, version: definition.version, bundleDigest: producerBundleDigest },
      provenanceIdentity: projection.provenanceIdentity,
      repository: normalized.repository,
      requestDigest,
      sourceEvidenceDigest: sha256(canonicalJson({ authorityClass: projection.authorityClass, provenanceIdentity: projection.provenanceIdentity })),
      store: { kind: definition.storeKind, role },
      version: nativeSemanticSourceVersion,
    };
    const bytes = canonicalBytes(document);
    const destination = semanticRecoveryProtectedStorePath(projection.authorityClass);
    const digest = sha256(bytes);
    files.push({ kind: "authority_store", source: null, destination, mode: 0o444, uid: 0, gid: 0, sha256: digest, byteCount: bytes.length, bytes });
    sourceDescriptors.push({ authorityClass: projection.authorityClass, store: { kind: definition.storeKind, path: destination, role, sha256: digest } });
  }
  const directories = [
    semanticRecoveryProtectedLayout.root,
    semanticRecoveryProtectedLayout.producerRoot,
    semanticRecoveryProtectedLayout.storesRoot,
    semanticRecoveryProtectedLayout.grantsRoot,
    semanticRecoveryProtectedLayout.successorsRoot,
    semanticRecoveryProtectedLayout.successorIncomingRoot,
    semanticRecoveryProtectedLayout.successorProvenanceRoot,
    semanticRecoveryProtectedLayout.successorCommitsRoot,
  ].map((destination) => ({ destination, kind: "directory", mode: 0o755, uid: 0, gid: 0 }));
  const manifestCore = {
    contract: semanticRecoveryNativeInstallPlanContract,
    version: semanticRecoveryNativeInstallPlanVersion,
    mode: "plan_install",
    mutating: false,
    request: normalized,
    requestDigest,
    producerBundleDigest,
    claimOwnerMatrix: { version: semanticRecoveryClaimOwnerMatrixVersion, digest: semanticRecoveryClaimOwnerMatrixDigest },
    verifierSet: { version: semanticRecoveryVerifierSetVersion, digest: semanticRecoveryVerifierSetDigest },
    selectedOperation: normalized.operation,
    selectedSource: { path: normalized.source.deploymentEvidenceDocument, sha256: normalized.source.sha256 },
    directories,
    files: files.map(stripBytes).sort((left, right) => left.destination.localeCompare(right.destination)),
    sourceDescriptors: sourceDescriptors.sort((left, right) => left.authorityClass.localeCompare(right.authorityClass)),
    serviceEffects: [],
    forbiddenEffects: [
      "mutate_live_filesystem", "install_grant", "construct_successor", "persist_successor",
      "authorize_issue_continuation", "submit_runner", "activate_queue", "network_listener",
    ],
    summary: {
      directoryCount: directories.length,
      fileCount: files.length + 1,
      authorityClassCount: sourceDescriptors.length,
      grantsInstalled: 0,
      successorsCreated: 0,
      servicesEnabled: 0,
    },
  };
  const installManifestDigest = sha256(canonicalJson(manifestCore));
  const installManifest = { ...manifestCore, installManifestDigest };
  const installManifestBytes = canonicalBytes(installManifest);
  files.push({
    kind: "install_manifest",
    source: null,
    destination: semanticRecoveryProtectedLayout.installManifest,
    mode: 0o444,
    uid: 0,
    gid: 0,
    sha256: sha256(installManifestBytes),
    byteCount: installManifestBytes.length,
    bytes: installManifestBytes,
  });
  const plan = {
    ...installManifest,
    files: files.map(stripBytes).sort((left, right) => left.destination.localeCompare(right.destination)),
    planDigest: sha256(canonicalJson({ ...installManifest, files: files.map(stripBytes).sort((left, right) => left.destination.localeCompare(right.destination)) })),
  };
  return deepFreeze({
    plan,
    artifacts: files.map((file) => ({ ...stripBytes(file), ...(file.bytes ? { bytes: file.bytes } : {}) }))
      .sort((left, right) => left.destination.localeCompare(right.destination)),
  });
}

export function verifySemanticRecoveryNativeInstallPlan({ plan, artifacts } = {}) {
  try {
    if (!plainObject(plan) || plan.contract !== semanticRecoveryNativeInstallPlanContract
        || plan.version !== semanticRecoveryNativeInstallPlanVersion || plan.mode !== "plan_install"
        || plan.mutating !== false || !Array.isArray(plan.directories) || !Array.isArray(plan.files)
        || plan.serviceEffects?.length !== 0 || plan.sourceDescriptors?.length !== semanticRecoveryAuthorityClasses.length) {
      throw new Error("semantic native install plan invalid");
    }
    const { planDigest, ...core } = plan;
    if (!isDigest(planDigest) || planDigest !== sha256(canonicalJson(core))) throw new Error("semantic native install plan digest invalid");
    normalizeSemanticRecoveryNativeProducerRequest(plan.request);
    if (plan.requestDigest !== sha256(canonicalJson(plan.request))
        || plan.claimOwnerMatrix?.version !== semanticRecoveryClaimOwnerMatrixVersion
        || plan.claimOwnerMatrix?.digest !== semanticRecoveryClaimOwnerMatrixDigest
        || plan.verifierSet?.version !== semanticRecoveryVerifierSetVersion
        || plan.verifierSet?.digest !== semanticRecoveryVerifierSetDigest) {
      throw new Error("semantic native install contract identity invalid");
    }
    if (plan.directories.some((entry) => entry.uid !== 0 || entry.gid !== 0 || entry.mode !== 0o755
      || (entry.destination !== semanticRecoveryProtectedLayout.root && !entry.destination.startsWith(`${semanticRecoveryProtectedLayout.root}/`)))) {
      throw new Error("semantic native install directory invalid");
    }
    if (plan.files.some((entry) => entry.uid !== 0 || entry.gid !== 0 || ![0o444, 0o555].includes(entry.mode)
      || !entry.destination.startsWith(`${semanticRecoveryProtectedLayout.root}/`) || !isDigest(entry.sha256))) {
      throw new Error("semantic native install file invalid");
    }
    if (new Set(plan.files.map((entry) => entry.destination)).size !== plan.files.length
        || new Set(plan.sourceDescriptors.map((entry) => entry.store.sha256)).size !== semanticRecoveryAuthorityClasses.length) {
      throw new Error("semantic native install independence invalid");
    }
    for (const authorityClass of semanticRecoveryAuthorityClasses) {
      const descriptor = plan.sourceDescriptors.find((entry) => entry.authorityClass === authorityClass);
      const definition = semanticRecoveryVerifierSet.verifiers[authorityClass];
      if (!descriptor || descriptor.store.path !== semanticRecoveryProtectedStorePath(authorityClass)
          || descriptor.store.kind !== definition.storeKind || descriptor.store.role !== `${authorityClass}_authority`) {
        throw new Error("semantic native source descriptor invalid");
      }
    }
    if (!Array.isArray(artifacts) || artifacts.length !== plan.files.length
      || artifacts.some((artifact) => {
        const planned = plan.files.find((entry) => entry.destination === artifact.destination);
        return !planned || canonicalJson(stripBytes(artifact)) !== canonicalJson(planned)
          || (artifact.bytes && sha256(artifact.bytes) !== artifact.sha256);
      })) throw new Error("semantic native install artifacts invalid");
    return { ok: true, reasonCode: "semantic_native_install_plan_verified", planDigest };
  } catch {
    return { ok: false, reasonCode: "semantic_native_install_plan_invalid" };
  }
}

export function verifyInstalledSemanticRecoveryNativeProducer({ plan, filesystem } = {}) {
  if (!plainObject(plan) || !filesystem
      || verifySemanticRecoveryNativeInstallPlan({ plan, artifacts: plan.files }).ok !== true) {
    return { ok: false, reasonCode: "semantic_native_install_readback_invalid" };
  }
  try {
    for (const directory of plan.directories) {
      const stat = filesystem.inspect(directory.destination);
      if (!stat || stat.type !== "directory" || stat.symlink === true || stat.uid !== 0 || stat.gid !== 0
          || stat.mode !== directory.mode || filesystem.realpath(directory.destination) !== directory.destination) {
        throw new Error("semantic native installed directory drift");
      }
    }
    for (const file of plan.files) {
      const first = filesystem.inspect(file.destination);
      const bytes = Buffer.from(filesystem.read(file.destination));
      const second = filesystem.inspect(file.destination);
      if (!first || first.type !== "file" || first.symlink === true || first.uid !== 0 || first.gid !== 0
          || first.nlink !== 1 || first.mode !== file.mode || first.size !== file.byteCount
          || canonicalJson(first) !== canonicalJson(second) || sha256(bytes) !== file.sha256
          || filesystem.realpath(file.destination) !== file.destination) {
        throw new Error("semantic native installed file drift");
      }
    }
    return { ok: true, reasonCode: "semantic_native_install_readback_verified", planDigest: plan.planDigest };
  } catch {
    return { ok: false, reasonCode: "semantic_native_install_readback_drift" };
  }
}

export function planSemanticRecoveryGrant({ manifest } = {}) {
  validateGrantPlanningManifest(manifest);
  const document = expectedSemanticRecoveryGrantDocument(manifest);
  const bytes = canonicalBytes(document);
  const grantPath = path.posix.join(semanticRecoveryProtectedLayout.grantsRoot, `${manifest.operation.operationId}.json`);
  const core = {
    contract: semanticRecoveryNativeGrantPlanContract,
    version: semanticRecoveryNativeGrantPlanVersion,
    mode: "plan_grant",
    mutating: false,
    operationId: manifest.operation.operationId,
    requestId: manifest.operation.requestId,
    manifestDigest: manifest.manifestDigest,
    allowedAction: semanticRecoveryAllowedAction,
    selectedSource: { manifestDigest: manifest.manifestDigest },
    effect: { destination: grantPath, uid: 0, gid: 0, mode: 0o444, nlink: 1, sha256: sha256(bytes), byteCount: bytes.length },
    successorExecutionIncluded: false,
  };
  return deepFreeze({ plan: { ...core, planDigest: sha256(canonicalJson(core)) }, artifact: { ...core.effect, bytes } });
}

export function verifySemanticRecoveryGrantPlan({ plan, artifact } = {}) {
  try {
    const { planDigest, ...core } = plan;
    if (plan.contract !== semanticRecoveryNativeGrantPlanContract || plan.version !== semanticRecoveryNativeGrantPlanVersion
        || plan.mode !== "plan_grant" || plan.mutating !== false || plan.successorExecutionIncluded !== false
        || plan.allowedAction !== semanticRecoveryAllowedAction || plan.effect.destination !== `${semanticRecoveryProtectedLayout.grantsRoot}/${plan.operationId}.json`
        || plan.effect.uid !== 0 || plan.effect.gid !== 0 || plan.effect.mode !== 0o444 || plan.effect.nlink !== 1
        || planDigest !== sha256(canonicalJson(core)) || artifact.sha256 !== plan.effect.sha256
        || sha256(artifact.bytes) !== artifact.sha256) throw new Error("semantic grant plan invalid");
    return { ok: true, reasonCode: "semantic_native_grant_plan_verified", planDigest };
  } catch { return { ok: false, reasonCode: "semantic_native_grant_plan_invalid" }; }
}

export function readSemanticRecoverySupportFiles(repositoryRoot, relativePaths) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)
      || realpathSync(repositoryRoot) !== repositoryRoot || !Array.isArray(relativePaths)) {
    throw new Error("semantic native support root invalid");
  }
  return relativePaths.map((source) => {
    if (!supportSourcePattern.test(String(source || ""))) throw new Error("semantic native support path invalid");
    const absolute = path.join(repositoryRoot, source);
    if (realpathSync(absolute) !== absolute) throw new Error("semantic native support path noncanonical");
    const before = lstatSync(absolute);
    const bytes = readFileSync(absolute);
    const after = lstatSync(absolute);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size !== bytes.length
        || statIdentity(before) !== statIdentity(after)) throw new Error("semantic native support file unsafe");
    return { source, bytes, sha256: sha256(bytes), byteCount: bytes.length, executable: source === "tools/auto-runner/semantic-recovery-native-producer.mjs" };
  });
}

function normalizeSupportFile(value) {
  assertExactKeys(value, ["byteCount", "bytes", "executable", "sha256", "source"]);
  const bytes = Buffer.from(value.bytes);
  if (!supportSourcePattern.test(String(value.source || "")) || typeof value.executable !== "boolean"
      || value.byteCount !== bytes.length || value.byteCount < 1 || value.byteCount > 1024 * 1024
      || value.sha256 !== sha256(bytes)) throw new Error("semantic native support file invalid");
  return { source: value.source, bytes, sha256: value.sha256, byteCount: value.byteCount, executable: value.executable };
}
function validateProjection(authorityClass, projection, repository) {
  const allowedClaims = new Set(Object.entries(semanticRecoveryClaimOwnerMatrix)
    .filter(([, ownership]) => ownership.required.includes(authorityClass) || ownership.optional.includes(authorityClass))
    .map(([claim]) => claim));
  if (!plainObject(projection) || projection.authorityClass !== authorityClass || projection.repository !== repository
      || !plainObject(projection.claims) || !isDigest(projection.provenanceIdentity)
      || Object.keys(projection.claims).some((claim) => !allowedClaims.has(claim))) {
    throw new Error(`semantic native producer projection invalid: ${authorityClass}`);
  }
}
function validateGrantPlanningManifest(manifest) {
  if (!plainObject(manifest) || manifest.sourceAuthority !== "production"
      || manifest.claimOwnerMatrix?.version !== semanticRecoveryClaimOwnerMatrixVersion
      || manifest.claimOwnerMatrix?.digest !== semanticRecoveryClaimOwnerMatrixDigest
      || manifest.sourceVerifierSet?.version !== semanticRecoveryVerifierSetVersion
      || manifest.sourceVerifierSet?.digest !== semanticRecoveryVerifierSetDigest
      || !Array.isArray(manifest.evidenceSources)
      || manifest.evidenceSources.length !== semanticRecoveryAuthorityClasses.length) {
    throw new Error("semantic native grant manifest invalid");
  }
  const manifestCore = structuredClone(manifest);
  delete manifestCore.manifestDigest;
  delete manifestCore.intendedSuccessor;
  delete manifestCore.operation;
  if (!isDigest(manifest.manifestDigest) || manifest.manifestDigest !== sha256(canonicalJson(manifestCore))) {
    throw new Error("semantic native grant manifest digest invalid");
  }
  const operation = deriveSemanticRecoveryOperationRequest({
    manifestDigest: manifest.manifestDigest,
    incidentIdentity: manifest.incidentIdentity,
    lifecycleSuccessorSession: manifest.lifecycleSuccessor?.sessionId,
    lifecycleSuccessorGeneration: manifest.lifecycleSuccessor?.mutationGeneration,
  });
  if (canonicalJson(manifest.operation) !== canonicalJson({ operationId: operation.operationId, requestId: operation.requestId, action: operation.action })) {
    throw new Error("semantic native grant operation invalid");
  }
  for (const authorityClass of semanticRecoveryAuthorityClasses) {
    const source = manifest.evidenceSources.find((entry) => entry.authorityClass === authorityClass);
    const definition = semanticRecoveryVerifierSet.verifiers[authorityClass];
    if (!source || source.verifier?.id !== definition.id || source.verifier?.version !== definition.version
        || source.store?.kind !== definition.storeKind || source.store?.path !== semanticRecoveryProtectedStorePath(authorityClass)
        || source.store?.role !== `${authorityClass}_authority` || !isDigest(source.store.sha256)) {
      throw new Error("semantic native grant source invalid");
    }
  }
}
function stripBytes(value) { const { bytes, ...rest } = value; return rest; }
function assertExactKeys(value, expected) { if (!plainObject(value) || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) throw new Error("unsupported or missing fields"); }
function statIdentity(info) { return [info.dev, info.ino, info.mode, info.nlink, info.uid, info.gid, info.size, info.mtimeMs, info.ctimeMs].join(":"); }
function validTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function isDigest(value) { return digestPattern.test(String(value || "")); }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function canonicalBytes(value) { return Buffer.from(canonicalJson(value)); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (plainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function deepFreeze(value) { if (ArrayBuffer.isView(value)) return value; if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
