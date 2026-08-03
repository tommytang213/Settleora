import { createHash } from "node:crypto";
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
  producerSourceSha,
  supportFiles,
  now = new Date(),
} = {}) {
  const normalized = normalizeSemanticRecoveryNativeProducerRequest(request);
  if (!authorityReaders || typeof authorityReaders !== "object" || !shaPattern.test(String(producerSourceSha || ""))
      || typeof readAuthorityContext !== "function" || !Array.isArray(supportFiles)) {
    throw new Error("semantic native producer dependencies invalid");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())
      || Date.parse(normalized.observedAt) > now.getTime() + 30_000
      || Date.parse(normalized.expiresAt) <= now.getTime()) {
    throw new Error("semantic native producer request stale");
  }
  const requestDigest = sha256(canonicalJson(normalized));
  const availableSupport = supportFiles.map(normalizeSupportFile).sort((left, right) => left.source.localeCompare(right.source));
  if (new Set(availableSupport.map((entry) => entry.source)).size !== availableSupport.length) {
    throw new Error("semantic native producer support manifest invalid");
  }
  const normalizedSupport = selectRequiredSupportFiles(availableSupport);
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
    producerSourceSha,
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
  const fixedDirectories = [
    semanticRecoveryProtectedLayout.root,
    semanticRecoveryProtectedLayout.producerRoot,
    semanticRecoveryProtectedLayout.storesRoot,
    semanticRecoveryProtectedLayout.grantsRoot,
    semanticRecoveryProtectedLayout.successorsRoot,
    semanticRecoveryProtectedLayout.successorIncomingRoot,
    semanticRecoveryProtectedLayout.successorProvenanceRoot,
    semanticRecoveryProtectedLayout.successorCommitsRoot,
  ];
  const supportDirectories = files.flatMap((file) => {
    const directories = [];
    let cursor = path.posix.dirname(file.destination);
    while (cursor.startsWith(`${semanticRecoveryProtectedLayout.producerRoot}/`)) {
      directories.push(cursor);
      cursor = path.posix.dirname(cursor);
    }
    return directories;
  });
  const directories = [...new Set([...fixedDirectories, ...supportDirectories])].sort()
    .map((destination) => ({ destination, kind: "directory", mode: 0o755, uid: 0, gid: 0 }));
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
    selectedSource: { path: normalized.source.deploymentEvidenceDocument, producerSourceSha, sha256: normalized.source.sha256 },
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
    validateInstallPlanStructure(plan);
    if (!Array.isArray(artifacts) || artifacts.length !== plan.files.length
      || artifacts.some((artifact) => {
        const planned = plan.files.find((entry) => entry.destination === artifact.destination);
        return !planned || canonicalJson(stripBytes(artifact)) !== canonicalJson(planned)
          || !Buffer.isBuffer(artifact.bytes) || artifact.bytes.length !== artifact.byteCount
          || sha256(artifact.bytes) !== artifact.sha256;
      })) throw new Error("semantic native install artifacts invalid");
    validateInstallArtifactContents(plan, artifacts);
    return { ok: true, reasonCode: "semantic_native_install_plan_verified", planDigest: plan.planDigest };
  } catch (error) {
    return { ok: false, reasonCode: "semantic_native_install_plan_invalid", detailCode: fixedValidationDetail(error) };
  }
}

export function verifyInstalledSemanticRecoveryNativeProducer({ plan, filesystem } = {}) {
  if (!plainObject(plan) || !filesystem) return { ok: false, reasonCode: "semantic_native_install_readback_invalid" };
  try {
    validateInstallPlanStructure(plan);
    for (const directory of plan.directories) {
      const stat = filesystem.inspect(directory.destination);
      if (!stat || stat.type !== "directory") throw new Error("semantic native installed directory type drift");
      if (stat.symlink === true) throw new Error("semantic native installed directory symlink drift");
      if (stat.uid !== 0) throw new Error("semantic native installed directory owner drift");
      if (stat.gid !== 0) throw new Error("semantic native installed directory group drift");
      if (stat.mode !== directory.mode) throw new Error("semantic native installed directory mode drift");
      if (filesystem.realpath(directory.destination) !== directory.destination) throw new Error("semantic native installed directory realpath drift");
      const expectedChildren = [
        ...plan.directories.filter((entry) => path.posix.dirname(entry.destination) === directory.destination).map((entry) => path.posix.basename(entry.destination)),
        ...plan.files.filter((entry) => path.posix.dirname(entry.destination) === directory.destination).map((entry) => path.posix.basename(entry.destination)),
      ].sort();
      if (canonicalJson(filesystem.list(directory.destination).sort()) !== canonicalJson(expectedChildren)) {
        throw new Error("semantic native installed directory membership drift");
      }
    }
    const installedArtifacts = [];
    for (const file of plan.files) {
      const first = filesystem.inspect(file.destination);
      const bytes = Buffer.from(filesystem.read(file.destination));
      const second = filesystem.inspect(file.destination);
      if (!first || first.type !== "file") throw new Error("semantic native installed file type drift");
      if (first.symlink === true) throw new Error("semantic native installed file symlink drift");
      if (first.uid !== 0) throw new Error("semantic native installed file owner drift");
      if (first.gid !== 0) throw new Error("semantic native installed file group drift");
      if (first.nlink !== 1) throw new Error("semantic native installed file link count drift");
      if (first.mode !== file.mode) throw new Error("semantic native installed file mode drift");
      if (first.size !== file.byteCount) throw new Error("semantic native installed file size drift");
      if (canonicalJson(first) !== canonicalJson(second)) throw new Error("semantic native installed file metadata race");
      if (sha256(bytes) !== file.sha256) throw new Error("semantic native installed file digest drift");
      if (filesystem.realpath(file.destination) !== file.destination) throw new Error("semantic native installed file realpath drift");
      installedArtifacts.push({ ...file, bytes });
    }
    validateInstallArtifactContents(plan, installedArtifacts);
    return { ok: true, reasonCode: "semantic_native_install_readback_verified", planDigest: plan.planDigest };
  } catch (error) {
    return { ok: false, reasonCode: "semantic_native_install_readback_drift", detailCode: fixedValidationDetail(error) };
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
    manifest: structuredClone(manifest),
    allowedAction: semanticRecoveryAllowedAction,
    selectedSource: { manifestDigest: manifest.manifestDigest },
    effect: { destination: grantPath, uid: 0, gid: 0, mode: 0o444, nlink: 1, sha256: sha256(bytes), byteCount: bytes.length },
    successorExecutionIncluded: false,
  };
  return deepFreeze({ plan: { ...core, planDigest: sha256(canonicalJson(core)) }, artifact: { ...core.effect, bytes } });
}

export function verifySemanticRecoveryGrantPlan({ plan, artifact } = {}) {
  try {
    assertExactKeys(plan, [
      "allowedAction", "contract", "effect", "manifest", "manifestDigest", "mode", "mutating", "operationId",
      "planDigest", "requestId", "selectedSource", "successorExecutionIncluded", "version",
    ]);
    assertExactKeys(plan.effect, ["byteCount", "destination", "gid", "mode", "nlink", "sha256", "uid"]);
    assertExactKeys(plan.selectedSource, ["manifestDigest"]);
    assertExactKeys(artifact, ["byteCount", "bytes", "destination", "gid", "mode", "nlink", "sha256", "uid"]);
    validateGrantPlanningManifest(plan.manifest);
    const expectedDocument = expectedSemanticRecoveryGrantDocument(plan.manifest);
    const expectedBytes = canonicalBytes(expectedDocument);
    const expectedEffect = {
      destination: path.posix.join(semanticRecoveryProtectedLayout.grantsRoot, `${plan.operationId}.json`),
      uid: 0, gid: 0, mode: 0o444, nlink: 1,
      sha256: sha256(expectedBytes), byteCount: expectedBytes.length,
    };
    const { planDigest, ...core } = plan;
    if (plan.contract !== semanticRecoveryNativeGrantPlanContract || plan.version !== semanticRecoveryNativeGrantPlanVersion
        || plan.mode !== "plan_grant" || plan.mutating !== false || plan.successorExecutionIncluded !== false
        || plan.allowedAction !== semanticRecoveryAllowedAction || !isDigest(plan.operationId) || !isDigest(plan.requestId)
        || !isDigest(plan.manifestDigest) || plan.manifestDigest !== plan.manifest.manifestDigest
        || plan.operationId !== plan.manifest.operation.operationId || plan.requestId !== plan.manifest.operation.requestId
        || canonicalJson(plan.selectedSource) !== canonicalJson({ manifestDigest: plan.manifestDigest })
        || canonicalJson(plan.effect) !== canonicalJson(expectedEffect)
        || canonicalJson(stripBytes(artifact)) !== canonicalJson(expectedEffect)
        || !Buffer.isBuffer(artifact.bytes) || !artifact.bytes.equals(expectedBytes)
        || planDigest !== sha256(canonicalJson(core))) throw new Error("semantic grant plan invalid");
    return { ok: true, reasonCode: "semantic_native_grant_plan_verified", planDigest };
  } catch { return { ok: false, reasonCode: "semantic_native_grant_plan_invalid" }; }
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
function validateInstallPlanStructure(plan) {
  assertExactKeys(plan, [
    "claimOwnerMatrix", "contract", "directories", "files", "forbiddenEffects", "installManifestDigest",
    "mode", "mutating", "planDigest", "producerBundleDigest", "request", "requestDigest", "selectedOperation",
    "selectedSource", "serviceEffects", "sourceDescriptors", "summary", "verifierSet", "version",
  ]);
  if (!plainObject(plan) || plan.contract !== semanticRecoveryNativeInstallPlanContract
      || plan.version !== semanticRecoveryNativeInstallPlanVersion || plan.mode !== "plan_install"
      || plan.mutating !== false || !Array.isArray(plan.directories) || !Array.isArray(plan.files)
      || plan.serviceEffects?.length !== 0 || plan.sourceDescriptors?.length !== semanticRecoveryAuthorityClasses.length) {
    throw new Error("semantic native install plan invalid");
  }
  const { planDigest, ...core } = plan;
  if (!isDigest(planDigest) || planDigest !== sha256(canonicalJson(core))) throw new Error("semantic native install plan digest invalid");
  normalizeSemanticRecoveryNativeProducerRequest(plan.request);
  assertExactKeys(plan.claimOwnerMatrix, ["digest", "version"]);
  assertExactKeys(plan.verifierSet, ["digest", "version"]);
  assertExactKeys(plan.selectedSource, ["path", "producerSourceSha", "sha256"]);
  assertExactKeys(plan.summary, ["authorityClassCount", "directoryCount", "fileCount", "grantsInstalled", "servicesEnabled", "successorsCreated"]);
  const expectedForbiddenEffects = [
    "mutate_live_filesystem", "install_grant", "construct_successor", "persist_successor",
    "authorize_issue_continuation", "submit_runner", "activate_queue", "network_listener",
  ];
  if (plan.requestDigest !== sha256(canonicalJson(plan.request))
      || plan.claimOwnerMatrix?.version !== semanticRecoveryClaimOwnerMatrixVersion
      || plan.claimOwnerMatrix?.digest !== semanticRecoveryClaimOwnerMatrixDigest
      || plan.verifierSet?.version !== semanticRecoveryVerifierSetVersion
      || plan.verifierSet?.digest !== semanticRecoveryVerifierSetDigest
      || plan.selectedOperation !== plan.request.operation
      || !shaPattern.test(String(plan.selectedSource.producerSourceSha || ""))
      || canonicalJson(plan.selectedSource) !== canonicalJson({ path: plan.request.source.deploymentEvidenceDocument, producerSourceSha: plan.selectedSource.producerSourceSha, sha256: plan.request.source.sha256 })
      || canonicalJson(plan.forbiddenEffects) !== canonicalJson(expectedForbiddenEffects)) throw new Error("semantic native install contract identity invalid");
  if (plan.directories.some((entry) => {
    assertExactKeys(entry, ["destination", "gid", "kind", "mode", "uid"]);
    return entry.kind !== "directory" || entry.uid !== 0 || entry.gid !== 0 || entry.mode !== 0o755
      || path.posix.normalize(entry.destination) !== entry.destination
      || (entry.destination !== semanticRecoveryProtectedLayout.root && !entry.destination.startsWith(`${semanticRecoveryProtectedLayout.root}/`));
  })) throw new Error("semantic native install directory invalid");
  if (plan.files.some((entry) => {
    assertExactKeys(entry, ["byteCount", "destination", "gid", "kind", "mode", "sha256", "source", "uid"]);
    return entry.uid !== 0 || entry.gid !== 0 || ![0o444, 0o555].includes(entry.mode)
      || !Number.isSafeInteger(entry.byteCount) || entry.byteCount < 1
      || path.posix.normalize(entry.destination) !== entry.destination
      || !entry.destination.startsWith(`${semanticRecoveryProtectedLayout.root}/`) || !isDigest(entry.sha256);
  })) throw new Error("semantic native install file invalid");
  if (new Set(plan.files.map((entry) => entry.destination)).size !== plan.files.length
      || new Set(plan.directories.map((entry) => entry.destination)).size !== plan.directories.length
      || new Set(plan.sourceDescriptors.map((entry) => entry.store.sha256)).size !== semanticRecoveryAuthorityClasses.length) throw new Error("semantic native install independence invalid");
  const directorySet = new Set(plan.directories.map((entry) => entry.destination));
  if (plan.files.some((entry) => !directorySet.has(path.posix.dirname(entry.destination)))) {
    throw new Error("semantic native install file parent missing");
  }
  const runtimeFiles = plan.files.filter((entry) => entry.kind === "producer_runtime");
  if (runtimeFiles.length < 2 || runtimeFiles.some((entry) => entry.source === null || !supportSourcePattern.test(entry.source)
      || entry.destination !== path.posix.join(semanticRecoveryProtectedLayout.producerRoot, path.posix.relative("tools/auto-runner", entry.source))
      || entry.mode !== (entry.source === "tools/auto-runner/semantic-recovery-native-producer.mjs" ? 0o555 : 0o444))
      || runtimeFiles.filter((entry) => entry.destination === semanticRecoveryProtectedLayout.producerExecutable).length !== 1
      || new Set(runtimeFiles.map((entry) => entry.source)).size !== runtimeFiles.length) {
    throw new Error("semantic native producer runtime set invalid");
  }
  const computedBundleDigest = sha256(canonicalJson(runtimeFiles
    .map(({ source, sha256: digest, byteCount }) => ({ source, sha256: digest, byteCount }))
    .sort((left, right) => left.source.localeCompare(right.source))));
  if (plan.producerBundleDigest !== computedBundleDigest) throw new Error("semantic native producer bundle digest invalid");
  const exactSingletons = [
    ["producer_policy", semanticRecoveryProtectedLayout.producerPolicy],
    ["install_manifest", semanticRecoveryProtectedLayout.installManifest],
  ];
  for (const [kind, destination] of exactSingletons) {
    const matches = plan.files.filter((entry) => entry.kind === kind && entry.destination === destination && entry.source === null && entry.mode === 0o444);
    if (matches.length !== 1 || plan.files.some((entry) => entry.kind === kind && entry !== matches[0])) throw new Error("semantic native singleton file set invalid");
  }
  if (plan.files.some((entry) => !["producer_runtime", "producer_policy", "authority_store", "install_manifest"].includes(entry.kind))) {
    throw new Error("semantic native install file kind invalid");
  }
  const expectedStorePaths = new Set(semanticRecoveryAuthorityClasses.map(semanticRecoveryProtectedStorePath));
  const storeFiles = plan.files.filter((entry) => entry.kind === "authority_store");
  if (storeFiles.length !== semanticRecoveryAuthorityClasses.length
      || storeFiles.some((entry) => entry.source !== null || entry.mode !== 0o444 || !expectedStorePaths.has(entry.destination))) {
    throw new Error("semantic native authority store set invalid");
  }
  const expectedDirectories = new Set([
    semanticRecoveryProtectedLayout.root,
    semanticRecoveryProtectedLayout.producerRoot,
    semanticRecoveryProtectedLayout.storesRoot,
    semanticRecoveryProtectedLayout.grantsRoot,
    semanticRecoveryProtectedLayout.successorsRoot,
    semanticRecoveryProtectedLayout.successorIncomingRoot,
    semanticRecoveryProtectedLayout.successorProvenanceRoot,
    semanticRecoveryProtectedLayout.successorCommitsRoot,
  ]);
  for (const file of plan.files) {
    let cursor = path.posix.dirname(file.destination);
    while (cursor === semanticRecoveryProtectedLayout.root || cursor.startsWith(`${semanticRecoveryProtectedLayout.root}/`)) {
      expectedDirectories.add(cursor);
      if (cursor === semanticRecoveryProtectedLayout.root) break;
      cursor = path.posix.dirname(cursor);
    }
  }
  if (canonicalJson([...directorySet].sort()) !== canonicalJson([...expectedDirectories].sort())) throw new Error("semantic native directory set incomplete");
  if (plan.sourceDescriptors.length !== semanticRecoveryAuthorityClasses.length
      || new Set(plan.sourceDescriptors.map((entry) => entry.authorityClass)).size !== semanticRecoveryAuthorityClasses.length) {
    throw new Error("semantic native source descriptor set invalid");
  }
  for (const authorityClass of semanticRecoveryAuthorityClasses) {
    const descriptor = plan.sourceDescriptors.find((entry) => entry.authorityClass === authorityClass);
    const definition = semanticRecoveryVerifierSet.verifiers[authorityClass];
    assertExactKeys(descriptor, ["authorityClass", "store"]);
    assertExactKeys(descriptor.store, ["kind", "path", "role", "sha256"]);
    const storeFile = storeFiles.find((entry) => entry.destination === semanticRecoveryProtectedStorePath(authorityClass));
    if (!descriptor || descriptor.store.path !== semanticRecoveryProtectedStorePath(authorityClass)
        || descriptor.store.kind !== definition.storeKind || descriptor.store.role !== `${authorityClass}_authority`
        || descriptor.store.sha256 !== storeFile?.sha256) throw new Error("semantic native source descriptor invalid");
  }
  if (plan.summary?.directoryCount !== plan.directories.length || plan.summary?.fileCount !== plan.files.length
      || plan.summary?.authorityClassCount !== semanticRecoveryAuthorityClasses.length || plan.summary?.grantsInstalled !== 0
      || plan.summary?.successorsCreated !== 0 || plan.summary?.servicesEnabled !== 0) throw new Error("semantic native install summary invalid");
}

function validateInstallArtifactContents(plan, artifacts) {
  const byPath = new Map(artifacts.map((entry) => [entry.destination, entry]));
  const runtimeFiles = plan.files.filter((entry) => entry.kind === "producer_runtime");
  const selectedRuntime = selectRequiredSupportFiles(runtimeFiles.map((entry) => ({
    source: entry.source,
    bytes: byPath.get(entry.destination)?.bytes,
    sha256: entry.sha256,
    byteCount: entry.byteCount,
    executable: entry.destination === semanticRecoveryProtectedLayout.producerExecutable,
  })));
  if (canonicalJson(selectedRuntime.map((entry) => entry.source)) !== canonicalJson(runtimeFiles.map((entry) => entry.source).sort())) {
    throw new Error("semantic native producer dependency closure invalid");
  }
  const policy = {
    contract: "settleora_semantic_recovery_native_policy", version: 1,
    allowedAction: semanticRecoveryAllowedAction, repository: plan.request.repository,
    requestDigest: plan.requestDigest, producerBundleDigest: plan.producerBundleDigest,
    claimOwnerMatrix: plan.claimOwnerMatrix, verifierSet: plan.verifierSet,
    layout: semanticRecoveryProtectedLayout, processModel: "root_invoked_offline_no_network_listener",
    producerSourceSha: plan.selectedSource.producerSourceSha,
  };
  assertExactArtifactBytes(byPath.get(semanticRecoveryProtectedLayout.producerPolicy), canonicalBytes(policy));
  const manifestDocument = structuredClone(plan);
  delete manifestDocument.planDigest;
  manifestDocument.files = manifestDocument.files.filter((entry) => entry.kind !== "install_manifest");
  const { installManifestDigest, ...manifestCore } = manifestDocument;
  if (installManifestDigest !== sha256(canonicalJson(manifestCore))) throw new Error("semantic native install manifest digest invalid");
  assertExactArtifactBytes(byPath.get(semanticRecoveryProtectedLayout.installManifest), canonicalBytes(manifestDocument));
  const sourceDocuments = [];
  for (const authorityClass of semanticRecoveryAuthorityClasses) {
    const descriptor = plan.sourceDescriptors.find((entry) => entry.authorityClass === authorityClass);
    const definition = semanticRecoveryVerifierSet.verifiers[authorityClass];
    const artifact = byPath.get(descriptor.store.path);
    const document = parseCanonicalArtifact(artifact.bytes);
    assertExactKeys(document, ["authorityClass", "claims", "contract", "expiresAt", "producer", "provenanceIdentity", "repository", "requestDigest", "sourceEvidenceDigest", "store", "version"]);
    assertExactKeys(document.producer, ["bundleDigest", "id", "version"]);
    assertExactKeys(document.store, ["kind", "role"]);
    if (document.contract !== nativeSemanticSourceContract || document.version !== nativeSemanticSourceVersion
        || document.authorityClass !== authorityClass || document.repository !== plan.request.repository
        || document.requestDigest !== plan.requestDigest || document.expiresAt !== plan.request.expiresAt
        || document.producer.id !== definition.id || document.producer.version !== definition.version
        || document.producer.bundleDigest !== plan.producerBundleDigest || document.store.kind !== definition.storeKind
        || document.store.role !== `${authorityClass}_authority` || !plainObject(document.claims)
        || !isDigest(document.provenanceIdentity)
        || document.sourceEvidenceDigest !== sha256(canonicalJson({ authorityClass, provenanceIdentity: document.provenanceIdentity }))) {
      throw new Error("semantic native authority store content invalid");
    }
    sourceDocuments.push({ authorityClass, claims: document.claims });
  }
  if (!applySemanticRecoveryClaimOwnerMatrix(sourceDocuments).ok) throw new Error("semantic native authority store matrix invalid");
}

function assertExactArtifactBytes(artifact, expected) {
  if (!artifact || !Buffer.isBuffer(artifact.bytes) || !artifact.bytes.equals(expected)
      || artifact.byteCount !== expected.length || artifact.sha256 !== sha256(expected)) throw new Error("semantic native bound artifact content invalid");
}

function parseCanonicalArtifact(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error("semantic native artifact bytes invalid");
  const text = bytes.toString("utf8");
  if (!Buffer.from(text).equals(bytes)) throw new Error("semantic native artifact encoding invalid");
  let document;
  try { document = JSON.parse(text); } catch { throw new Error("semantic native artifact JSON invalid"); }
  if (canonicalJson(document) !== text) throw new Error("semantic native artifact JSON noncanonical");
  return document;
}

function selectRequiredSupportFiles(available) {
  const bySource = new Map(available.map((entry) => [entry.source, entry]));
  const entrySource = "tools/auto-runner/semantic-recovery-native-producer.mjs";
  if (!bySource.has(entrySource)) throw new Error("semantic native producer entrypoint missing");
  const required = new Set();
  const pending = [entrySource];
  while (pending.length > 0) {
    const source = pending.pop();
    if (required.has(source)) continue;
    const file = bySource.get(source);
    if (!file || !source.endsWith(".mjs")) throw new Error("semantic native producer dependency missing");
    required.add(source);
    for (const specifier of relativeModuleSpecifiers(file.bytes)) {
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(source), specifier));
      if (!supportSourcePattern.test(dependency) || !dependency.endsWith(".mjs") || !bySource.has(dependency)) {
        throw new Error("semantic native producer dependency invalid or missing");
      }
      pending.push(dependency);
    }
  }
  const selected = [...required].sort().map((source) => bySource.get(source));
  if (selected.length < 2) throw new Error("semantic native producer dependency closure incomplete");
  return selected;
}

function relativeModuleSpecifiers(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  if (!Buffer.from(text).equals(Buffer.from(bytes))) throw new Error("semantic native support encoding invalid");
  const found = new Set();
  for (const pattern of [
    /(?:^|\n)\s*(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  ]) {
    for (const match of text.matchAll(pattern)) found.add(match[1]);
  }
  return [...found].sort();
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
function validTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function isDigest(value) { return digestPattern.test(String(value || "")); }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function canonicalBytes(value) { return Buffer.from(canonicalJson(value)); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (plainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function deepFreeze(value) { if (ArrayBuffer.isView(value)) return value; if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fixedValidationDetail(error) {
  const message = error instanceof Error ? error.message : "invalid";
  const fixed = message.replace(/:[\s\S]*$/u, "").replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
  return (fixed.startsWith("semantic_native_") ? fixed : `semantic_native_${fixed || "invalid"}`).slice(0, 160);
}
