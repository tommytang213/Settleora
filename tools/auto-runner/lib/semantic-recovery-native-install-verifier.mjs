import { createHash } from "node:crypto";
import path from "node:path";
import {
  applySemanticRecoveryClaimOwnerMatrix,
  semanticRecoveryAllowedAction,
  semanticRecoveryAuthorityClasses,
  semanticRecoveryClaimOwnerMatrixDigest,
  semanticRecoveryClaimOwnerMatrixVersion,
  semanticRecoveryVerifierSet,
  semanticRecoveryVerifierSetDigest,
  semanticRecoveryVerifierSetVersion,
} from "./semantic-recovery-authority.mjs";
import {
  semanticRecoveryNativeInstallPlanContract,
  semanticRecoveryNativeInstallPlanVersion,
  normalizeSemanticRecoveryNativeProducerRequest,
} from "./semantic-recovery-native-producer.mjs";
import {
  nativeSemanticSourceContract,
  nativeSemanticSourceVersion,
  semanticRecoveryProtectedLayout,
  semanticRecoveryProtectedStorePath,
} from "./semantic-recovery-protected-store.mjs";
import { nativeInstallProducerEntrypoint, verifyAuthenticatedNativeInstallSource } from "./semantic-recovery-native-install-source.mjs";

/*
 * This verifier deliberately does not call the native-install planner or its
 * verifier. It reconstructs the complete expected package from a fresh request,
 * fresh eight-class projections, and authenticated immutable source bytes.
 */
export function independentlyVerifyRootNativeInstallPackage({ installPackage, authenticatedSource, request, projections, authoritySourceCommit } = {}) {
  if (!verifyAuthenticatedNativeInstallSource(authenticatedSource).ok) throw new Error("native install independent source invalid");
  const normalizedRequest = normalizeSemanticRecoveryNativeProducerRequest(request);
  if ((installPackage !== null && installPackage !== undefined && (!plainObject(installPackage.plan) || !Array.isArray(installPackage.artifacts)))
      || !Array.isArray(projections) || projections.length !== semanticRecoveryAuthorityClasses.length
      || !/^[a-f0-9]{40}$/u.test(String(authoritySourceCommit || ""))
      || authoritySourceCommit !== authenticatedSource.manifest.sourceCommit) {
    throw new Error("native install independent inputs invalid");
  }
  const matrix = applySemanticRecoveryClaimOwnerMatrix(projections.map((projection) => ({
    authorityClass: projection.authorityClass,
    claims: projection.claims,
  })));
  if (!matrix.ok || new Set(projections.map((entry) => entry.authorityClass)).size !== semanticRecoveryAuthorityClasses.length
      || new Set(projections.map((entry) => entry.provenanceIdentity)).size !== semanticRecoveryAuthorityClasses.length) {
    throw new Error("native install independent projection invalid");
  }
  const runtime = {
    sourceSha: matrix.claims.runtimeSourceSha,
    bundleDigest: matrix.claims.installedBundleDigest,
    manifestDigest: matrix.claims.installedManifestDigest,
    profileDigest: matrix.claims.runtimeProfileDigest,
    approvalDigest: matrix.claims.runtimeApprovalDigest,
    launcherDigest: matrix.claims.launcherDigest,
    healthUnitDigest: matrix.claims.healthUnitDigest,
  };
  if (matrix.claims.repository !== normalizedRequest.repository || canonicalJson(runtime) !== canonicalJson(normalizedRequest.runtime)) {
    throw new Error("native install independent request authority mismatch");
  }

  const producerSupport = authenticatedSource.supportFiles
    .filter((entry) => entry.source.endsWith(".mjs") && entry.source !== "tools/auto-runner/semantic-recovery-native-install.mjs");
  const closure = selectClosure(new Map(producerSupport.map((entry) => [entry.source, entry])), nativeInstallProducerEntrypoint);
  const support = [...closure].sort().map((source) => producerSupport.find((entry) => entry.source === source));
  const producerBundleDigest = sha256(canonicalJson(support.map(({ source, sha256: digest, byteCount }) => ({ source, sha256: digest, byteCount }))));
  const requestDigest = sha256(canonicalJson(normalizedRequest));
  const policy = {
    contract: "settleora_semantic_recovery_native_policy",
    version: 1,
    allowedAction: semanticRecoveryAllowedAction,
    repository: normalizedRequest.repository,
    requestDigest,
    producerBundleDigest,
    claimOwnerMatrix: { version: semanticRecoveryClaimOwnerMatrixVersion, digest: semanticRecoveryClaimOwnerMatrixDigest },
    verifierSet: { version: semanticRecoveryVerifierSetVersion, digest: semanticRecoveryVerifierSetDigest },
    layout: semanticRecoveryProtectedLayout,
    processModel: "root_invoked_offline_no_network_listener",
    producerSourceSha: authenticatedSource.manifest.sourceCommit,
  };
  const artifacts = support.map((entry) => ({
    kind: "producer_runtime",
    source: entry.source,
    destination: path.posix.join(semanticRecoveryProtectedLayout.producerRoot, path.posix.relative("tools/auto-runner", entry.source)),
    mode: entry.source === nativeInstallProducerEntrypoint ? 0o555 : 0o444,
    uid: 0,
    gid: 0,
    sha256: entry.sha256,
    byteCount: entry.byteCount,
    bytes: Buffer.from(entry.bytes),
  }));
  const policyBytes = canonicalBytes(policy);
  artifacts.push({ kind: "producer_policy", source: null, destination: semanticRecoveryProtectedLayout.producerPolicy, mode: 0o444, uid: 0, gid: 0, sha256: sha256(policyBytes), byteCount: policyBytes.length, bytes: policyBytes });
  const sourceDescriptors = [];
  for (const authorityClass of semanticRecoveryAuthorityClasses) {
    const projection = projections.find((entry) => entry.authorityClass === authorityClass);
    const definition = semanticRecoveryVerifierSet.verifiers[authorityClass];
    if (!projection || projection.repository !== normalizedRequest.repository || !plainObject(projection.claims)) throw new Error("native install independent projection malformed");
    const role = `${authorityClass}_authority`;
    const document = {
      authorityClass,
      capturedAt: normalizedRequest.observedAt,
      claims: projection.claims,
      contract: nativeSemanticSourceContract,
      producer: { id: definition.id, version: definition.version, bundleDigest: producerBundleDigest },
      provenanceIdentity: projection.provenanceIdentity,
      repository: normalizedRequest.repository,
      requestDigest,
      sourceEvidenceDigest: sha256(canonicalJson({ authorityClass, provenanceIdentity: projection.provenanceIdentity })),
      store: { kind: definition.storeKind, role },
      version: nativeSemanticSourceVersion,
    };
    const bytes = canonicalBytes(document);
    const destination = semanticRecoveryProtectedStorePath(authorityClass);
    const digest = sha256(bytes);
    artifacts.push({ kind: "authority_store", source: null, destination, mode: 0o444, uid: 0, gid: 0, sha256: digest, byteCount: bytes.length, bytes });
    sourceDescriptors.push({ authorityClass, store: { kind: definition.storeKind, path: destination, role, sha256: digest } });
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
  const supportDirectories = artifacts.flatMap((artifact) => {
    const values = [];
    let cursor = path.posix.dirname(artifact.destination);
    while (cursor.startsWith(`${semanticRecoveryProtectedLayout.producerRoot}/`)) { values.push(cursor); cursor = path.posix.dirname(cursor); }
    return values;
  });
  const directories = [...new Set([...fixedDirectories, ...supportDirectories])].sort()
    .map((destination) => ({ destination, kind: "directory", mode: 0o755, uid: 0, gid: 0 }));
  const manifestCore = {
    contract: semanticRecoveryNativeInstallPlanContract,
    version: semanticRecoveryNativeInstallPlanVersion,
    mode: "plan_install",
    mutating: false,
    request: normalizedRequest,
    requestDigest,
    producerBundleDigest,
    claimOwnerMatrix: { version: semanticRecoveryClaimOwnerMatrixVersion, digest: semanticRecoveryClaimOwnerMatrixDigest },
    verifierSet: { version: semanticRecoveryVerifierSetVersion, digest: semanticRecoveryVerifierSetDigest },
    selectedOperation: normalizedRequest.operation,
    selectedSource: { path: normalizedRequest.source.deploymentEvidenceDocument, producerSourceSha: authenticatedSource.manifest.sourceCommit, sha256: normalizedRequest.source.sha256 },
    directories,
    files: artifacts.map(stripBytes).sort(byDestination),
    sourceDescriptors: sourceDescriptors.sort((left, right) => left.authorityClass.localeCompare(right.authorityClass)),
    serviceEffects: [],
    forbiddenEffects: ["mutate_live_filesystem", "install_grant", "construct_successor", "persist_successor", "authorize_issue_continuation", "submit_runner", "activate_queue", "network_listener"],
    summary: { directoryCount: directories.length, fileCount: artifacts.length + 1, authorityClassCount: semanticRecoveryAuthorityClasses.length, grantsInstalled: 0, successorsCreated: 0, servicesEnabled: 0 },
  };
  const installManifestDigest = sha256(canonicalJson(manifestCore));
  const installManifest = { ...manifestCore, installManifestDigest };
  const manifestBytes = canonicalBytes(installManifest);
  artifacts.push({ kind: "install_manifest", source: null, destination: semanticRecoveryProtectedLayout.installManifest, mode: 0o444, uid: 0, gid: 0, sha256: sha256(manifestBytes), byteCount: manifestBytes.length, bytes: manifestBytes });
  const expectedPlanWithoutDigest = { ...installManifest, files: artifacts.map(stripBytes).sort(byDestination) };
  const expected = {
    plan: { ...expectedPlanWithoutDigest, planDigest: sha256(canonicalJson(expectedPlanWithoutDigest)) },
    artifacts: artifacts.sort(byDestination),
  };
  if (installPackage !== null && installPackage !== undefined && canonicalPackage(expected) !== canonicalPackage(installPackage)) {
    throw new Error("native install independent package mismatch");
  }
  return { ok: true, reasonCode: "native_install_independent_package_verified", planDigest: expected.plan.planDigest, package: expected };
}

function selectClosure(files, entrypoint) {
  const selected = new Set();
  const pending = [entrypoint];
  while (pending.length) {
    const source = pending.pop();
    if (selected.has(source)) continue;
    const entry = files.get(source);
    if (!entry) throw new Error("native install independent dependency missing");
    selected.add(source);
    for (const specifier of moduleSpecifiers(entry.bytes)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), specifier));
      if (!specifier.endsWith(".mjs") || !resolved.startsWith("tools/auto-runner/") || !files.has(resolved)) throw new Error("native install independent dependency invalid");
      pending.push(resolved);
    }
  }
  return selected;
}
function moduleSpecifiers(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  if (!Buffer.from(text).equals(Buffer.from(bytes))) throw new Error("native install independent source encoding invalid");
  const found = new Set();
  for (const expression of [/(?:^|\n)\s*(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["'](\.[^"']+)["']/gu, /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/gu]) {
    for (const match of text.matchAll(expression)) found.add(match[1]);
  }
  return found;
}
function stripBytes(value) { const { bytes: _bytes, gitBlobOid: _oid, executable: _executable, ...rest } = value; return rest; }
function byDestination(left, right) { return left.destination.localeCompare(right.destination); }
function canonicalPackage(value) { return canonicalJson({ plan: value.plan, artifacts: value.artifacts.map((entry) => ({ ...stripBytes(entry), bytesBase64: Buffer.from(entry.bytes).toString("base64") })).sort(byDestination) }); }
function canonicalBytes(value) { return Buffer.from(canonicalJson(value)); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (plainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
