import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  applySemanticRecoveryClaimOwnerMatrix,
  semanticRecoveryAuthorityClasses,
  semanticRecoveryClaimOwnerMatrix,
  semanticRecoveryVerifierSet,
} from "./semantic-recovery-authority.mjs";

export const semanticDeploymentEvidencePackageContract = "settleora_semantic_deployment_evidence_package";
export const semanticDeploymentEvidencePackageVersion = 1;
export const semanticDeploymentEvidenceDocumentName = "deployment-evidence.json";
export const semanticDeploymentEvidencePackageManifestName = "package-manifest.json";

const packageBasenamePattern = /^settleora-semantic-deployment-evidence-[a-z0-9][a-z0-9-]{0,78}$/u;
const maximumMemberBytes = 256 * 1024;
const sourceFilename = (authorityClass) => `${authorityClass}.json`;

export function extractRepositoryGitProjection(reader, context) { return extractProjection("repository_git", reader, context); }
export function extractLifecycleProjection(reader, context) { return extractProjection("lifecycle", reader, context); }
export function extractLogicalTaskBudgetProjection(reader, context) { return extractProjection("logical_task_budget", reader, context); }
export function extractIntentLineageProjection(reader, context) { return extractProjection("intent_lineage", reader, context); }
export function extractProjectionDeploymentProjection(reader, context) { return extractProjection("projection_deployment", reader, context); }
export function extractSupervisorChildRunProjection(reader, context) { return extractProjection("supervisor_child_run", reader, context); }
export function extractIncidentReportProjection(reader, context) { return extractProjection("incident_report", reader, context); }
export function extractGithubNoEffectProjection(reader, context) { return extractProjection("github_no_effect", reader, context); }

const extractors = Object.freeze({
  repository_git: extractRepositoryGitProjection,
  lifecycle: extractLifecycleProjection,
  logical_task_budget: extractLogicalTaskBudgetProjection,
  intent_lineage: extractIntentLineageProjection,
  projection_deployment: extractProjectionDeploymentProjection,
  supervisor_child_run: extractSupervisorChildRunProjection,
  incident_report: extractIncidentReportProjection,
  github_no_effect: extractGithubNoEffectProjection,
});

export function planSemanticDeploymentEvidencePackage({
  configRoot,
  packageBasename,
  authorityReaders,
  extractionContext,
  createDocument,
} = {}) {
  const root = authenticatePackageParent(configRoot);
  if (!packageBasenamePattern.test(String(packageBasename || ""))) throw new Error("semantic evidence package basename invalid");
  if (!authorityReaders || typeof authorityReaders !== "object" || typeof createDocument !== "function") {
    throw new Error("semantic evidence package source extractors missing");
  }
  const packageRoot = path.join(root, packageBasename);
  const incomingRoot = path.join(root, `${packageBasename}.incoming`);
  const retiredRoot = path.join(root, `${packageBasename}.retired`);
  const sourceDocuments = [];
  const sourceDescriptors = [];
  for (const authorityClass of semanticRecoveryAuthorityClasses) {
    const projection = extractors[authorityClass](authorityReaders[authorityClass], extractionContext);
    const definition = semanticRecoveryVerifierSet.verifiers[authorityClass];
    const role = `${authorityClass}_authority`;
    const memberName = sourceFilename(authorityClass);
    const memberPath = path.join(packageRoot, memberName);
    const document = {
      authorityClass,
      claims: projection.claims,
      contract: "settleora_semantic_deployment_evidence_source",
      producer: { id: definition.id, version: definition.version },
      provenanceIdentity: projection.provenanceIdentity,
      repository: projection.repository,
      store: { kind: definition.storeKind, role },
      version: 1,
    };
    const bytes = canonicalBytes(document);
    sourceDocuments.push({
      authorityClass,
      memberName,
      path: memberPath,
      bytes,
      sha256: sha256(bytes),
      provenanceIdentity: projection.provenanceIdentity,
    });
    sourceDescriptors.push({
      authorityClass,
      store: { kind: definition.storeKind, path: memberPath, role, sha256: sha256(bytes) },
    });
  }
  if (new Set(sourceDocuments.map((source) => source.provenanceIdentity)).size !== sourceDocuments.length) {
    throw new Error("semantic evidence package source provenance copied");
  }
  const matrix = applySemanticRecoveryClaimOwnerMatrix(sourceDocuments.map((source) => ({
    authorityClass: source.authorityClass,
    claims: parseCanonicalJson(source.bytes).claims,
  })));
  if (!matrix.ok) throw new Error(`semantic evidence package claim matrix invalid: ${matrix.reasonCode}`);
  const repositories = new Set(sourceDocuments.map(({ bytes }) => parseCanonicalJson(bytes).repository));
  if (repositories.size !== 1) throw new Error("semantic evidence package source repository contradiction");
  const deploymentDocument = createDocument(deepFreeze({
    packageRoot,
    claims: structuredClone(matrix.claims),
    sources: structuredClone(sourceDescriptors),
    projections: sourceDocuments.map(({ authorityClass, memberName, sha256: digest }) => ({ authorityClass, memberName, sha256: digest })),
  }));
  const deploymentBytes = canonicalBytes(deploymentDocument);
  const contentMembers = [
    { name: semanticDeploymentEvidenceDocumentName, bytes: deploymentBytes, sha256: sha256(deploymentBytes) },
    ...sourceDocuments.map(({ memberName: name, bytes, sha256: digest }) => ({ name, bytes, sha256: digest })),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const memberManifest = contentMembers.map(({ name, sha256: digest, bytes }) => ({ name, sha256: digest, byteCount: bytes.length }));
  const memberManifestDigest = sha256(canonicalBytes(memberManifest));
  const manifest = {
    aggregateDigest: sha256(canonicalBytes({ contract: semanticDeploymentEvidencePackageContract, version: semanticDeploymentEvidencePackageVersion, members: memberManifest })),
    contract: semanticDeploymentEvidencePackageContract,
    memberManifestDigest,
    members: memberManifest,
    version: semanticDeploymentEvidencePackageVersion,
  };
  const manifestBytes = canonicalBytes(manifest);
  const members = [...contentMembers, {
    name: semanticDeploymentEvidencePackageManifestName,
    bytes: manifestBytes,
    sha256: sha256(manifestBytes),
  }].sort((left, right) => left.name.localeCompare(right.name));
  const posture = inspectPackageResidue({ packageRoot, incomingRoot, retiredRoot, members });
  return deepFreeze({
    contract: semanticDeploymentEvidencePackageContract,
    version: semanticDeploymentEvidencePackageVersion,
    mode: "plan_only",
    configRoot: root,
    packageBasename,
    packageRoot,
    incomingRoot,
    retiredRoot,
    documentPath: path.join(packageRoot, semanticDeploymentEvidenceDocumentName),
    packageAggregateDigest: manifest.aggregateDigest,
    packageManifestDigest: sha256(manifestBytes),
    memberManifestDigest,
    members,
    posture,
  });
}

export function createOrAdoptSemanticDeploymentEvidencePackage(plan, { beforePublish = null } = {}) {
  if (beforePublish !== null && typeof beforePublish !== "function") throw new Error("semantic evidence package publication hook invalid");
  validatePlan(plan);
  const current = inspectPackageResidue(plan);
  if (current.action === "adopt_final") {
    beforePublish?.();
    fsyncExistingPackage(plan.packageRoot, plan.members);
    if (!packageMatches(plan.packageRoot, plan.members)) {
      throw new Error("semantic evidence package final changed before adoption");
    }
    fsyncDirectory(plan.configRoot);
    authenticateSemanticDeploymentEvidencePackage(plan.documentPath);
    return packageResult(plan, "adopted");
  }
  if (current.action === "adopt_incoming") {
    if (pathEntryExists(plan.packageRoot)) throw new Error("semantic evidence package final appeared before incoming adoption");
    fsyncExistingPackage(plan.incomingRoot, plan.members);
    if (!packageMatches(plan.incomingRoot, plan.members) || pathEntryExists(plan.packageRoot)) {
      throw new Error("semantic evidence package incoming changed before adoption");
    }
    beforePublish?.();
    publishDirectoryNoReplace(plan.incomingRoot, plan.packageRoot);
    fsyncDirectory(plan.configRoot);
    authenticateSemanticDeploymentEvidencePackage(plan.documentPath);
    return packageResult(plan, "adopted_incoming");
  }
  if (current.action !== "create") throw new Error(`semantic evidence package residue conflict: ${current.reasonCode}`);
  mkdirSync(plan.incomingRoot, { mode: 0o700 });
  chmodSync(plan.incomingRoot, 0o700);
  try {
    for (const member of plan.members) writeMember(path.join(plan.incomingRoot, member.name), member.bytes);
    fsyncDirectory(plan.incomingRoot);
    if (pathEntryExists(plan.packageRoot)) throw new Error("semantic evidence package final appeared before commit");
    beforePublish?.();
    publishDirectoryNoReplace(plan.incomingRoot, plan.packageRoot);
    fsyncDirectory(plan.configRoot);
  } catch (error) {
    // Deliberately retain crash residue for exact inspection/adoption. Never
    // broaden this into cleanup or recursive deletion.
    throw error;
  }
  authenticateSemanticDeploymentEvidencePackage(plan.documentPath);
  return packageResult(plan, "created");
}

export function authenticateSemanticDeploymentEvidencePackage(documentPath, { afterInitialMembersRead = null } = {}) {
  if (afterInitialMembersRead !== null && typeof afterInitialMembersRead !== "function") {
    throw new Error("semantic evidence package authentication hook invalid");
  }
  const lexicalDocument = path.resolve(String(documentPath || ""));
  if (path.basename(lexicalDocument) !== semanticDeploymentEvidenceDocumentName) throw new Error("semantic evidence package document name invalid");
  const packageRoot = path.dirname(lexicalDocument);
  const configRoot = path.dirname(packageRoot);
  authenticatePackageParent(configRoot);
  if (!packageBasenamePattern.test(path.basename(packageRoot))) throw new Error("semantic evidence package root name invalid");
  authenticateDirectory(packageRoot, 0o700);
  const packageRootBefore = lstatSync(packageRoot);
  const expectedNames = [
    semanticDeploymentEvidenceDocumentName,
    semanticDeploymentEvidencePackageManifestName,
    ...semanticRecoveryAuthorityClasses.map(sourceFilename),
  ].sort();
  const actualNames = readdirSync(packageRoot).sort();
  if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) throw new Error("semantic evidence package members invalid");
  const authenticated = new Map(actualNames.map((name) => [name, authenticateMember(path.join(packageRoot, name))]));
  const manifestArtifact = authenticated.get(semanticDeploymentEvidencePackageManifestName);
  const manifest = parseCanonicalJson(manifestArtifact.bytes);
  assertExactKeys(manifest, ["aggregateDigest", "contract", "memberManifestDigest", "members", "version"]);
  if (manifest.contract !== semanticDeploymentEvidencePackageContract || manifest.version !== semanticDeploymentEvidencePackageVersion
      || !Array.isArray(manifest.members)) throw new Error("semantic evidence package manifest invalid");
  const expectedContentNames = expectedNames.filter((name) => name !== semanticDeploymentEvidencePackageManifestName);
  if (canonicalJson(manifest.members.map((member) => member.name)) !== canonicalJson(expectedContentNames)) {
    throw new Error("semantic evidence package manifest members invalid");
  }
  for (const member of manifest.members) {
    assertExactKeys(member, ["byteCount", "name", "sha256"]);
    const artifact = authenticated.get(member.name);
    if (!artifact || member.sha256 !== artifact.sha256 || member.byteCount !== artifact.bytes.length) {
      throw new Error("semantic evidence package member identity mismatch");
    }
  }
  const memberManifestDigest = sha256(canonicalBytes(manifest.members));
  const aggregateDigest = sha256(canonicalBytes({ contract: manifest.contract, version: manifest.version, members: manifest.members }));
  if (manifest.memberManifestDigest !== memberManifestDigest || manifest.aggregateDigest !== aggregateDigest) {
    throw new Error("semantic evidence package aggregate mismatch");
  }
  const documentArtifact = authenticated.get(semanticDeploymentEvidenceDocumentName);
  afterInitialMembersRead?.();
  const reauthenticated = new Map(actualNames.map((name) => [name, authenticateMember(path.join(packageRoot, name))]));
  for (const name of actualNames) {
    const first = authenticated.get(name);
    const second = reauthenticated.get(name);
    if (first.identity !== second.identity || first.sha256 !== second.sha256
        || !first.bytes.equals(second.bytes)) throw new Error("semantic evidence package member changed during aggregate read");
  }
  const packageRootAfter = lstatSync(packageRoot);
  if (memberIdentity(packageRootBefore) !== memberIdentity(packageRootAfter) || realpathSync(packageRoot) !== packageRoot) {
    throw new Error("semantic evidence package directory changed during authentication");
  }
  const result = {
    config: parseCanonicalJson(documentArtifact.bytes),
    evidence: {
      strategy: "O_NOFOLLOW",
      realPath: lexicalDocument,
      ownerUid: documentArtifact.ownerUid,
      mode: documentArtifact.mode,
      sha256: documentArtifact.sha256,
      packageRoot,
      packageAggregateDigest: aggregateDigest,
      packageManifestDigest: manifestArtifact.sha256,
      memberManifestDigest,
    },
  };
  Object.defineProperty(result.evidence, "memberDigests", {
    value: deepFreeze(actualNames.map((name) => ({ name, sha256: authenticated.get(name).sha256 }))),
    enumerable: false,
  });
  return deepFreeze(result);
}

function extractProjection(authorityClass, reader, context) {
  if (typeof reader !== "function") throw new Error(`semantic source extractor missing: ${authorityClass}`);
  const result = reader(context);
  if (!result || result.authorityClass !== authorityClass || typeof result.repository !== "string"
      || !result.claims || typeof result.claims !== "object" || Array.isArray(result.claims)
      || !/^[a-f0-9]{64}$/u.test(String(result.provenanceIdentity || ""))) {
    throw new Error(`semantic source extraction invalid: ${authorityClass}`);
  }
  const owned = new Set(Object.entries(semanticRecoveryClaimOwnerMatrix)
    .filter(([, ownership]) => [...ownership.required, ...ownership.optional].includes(authorityClass))
    .map(([claim]) => claim));
  if (Object.keys(result.claims).some((claim) => !owned.has(claim))) {
    throw new Error(`semantic source extractor emitted foreign claim: ${authorityClass}`);
  }
  return deepFreeze({
    authorityClass,
    repository: result.repository,
    provenanceIdentity: result.provenanceIdentity,
    claims: Object.fromEntries(Object.entries(result.claims).sort(([left], [right]) => left.localeCompare(right))),
  });
}

function inspectPackageResidue({ packageRoot, incomingRoot, retiredRoot, members }) {
  if (pathEntryExists(retiredRoot)) return { action: "refuse", reasonCode: "retired_residue_present" };
  const finalExists = pathEntryExists(packageRoot);
  const incomingExists = pathEntryExists(incomingRoot);
  if (finalExists && incomingExists) return { action: "refuse", reasonCode: "final_and_incoming_present" };
  if (finalExists) return packageMatches(packageRoot, members)
    ? { action: "adopt_final", reasonCode: "exact_final_present" }
    : { action: "refuse", reasonCode: "conflicting_final_present" };
  if (incomingExists) return packageMatches(incomingRoot, members)
    ? { action: "adopt_incoming", reasonCode: "exact_incoming_present" }
    : { action: "refuse", reasonCode: "conflicting_incoming_present" };
  return { action: "create", reasonCode: "package_absent" };
}

function packageMatches(root, members) {
  try {
    authenticateDirectory(root, 0o700);
    if (canonicalJson(readdirSync(root).sort()) !== canonicalJson(members.map((member) => member.name).sort())) return false;
    return members.every((member) => authenticateMember(path.join(root, member.name)).sha256 === member.sha256);
  } catch { return false; }
}

function authenticatePackageParent(configRoot) {
  const lexical = path.resolve(String(configRoot || ""));
  if (realpathSync(lexical) !== lexical) throw new Error("semantic evidence package parent noncanonical");
  const info = lstatSync(lexical);
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o022) !== 0 || (uid !== null && info.uid !== uid)) {
    throw new Error("semantic evidence package parent unsafe");
  }
  return lexical;
}

function authenticateDirectory(directory, mode) {
  if (realpathSync(directory) !== directory) throw new Error("semantic evidence package directory noncanonical");
  const info = lstatSync(directory);
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== mode || (uid !== null && info.uid !== uid)) {
    throw new Error("semantic evidence package directory unsafe");
  }
}

function authenticateMember(file) {
  if (realpathSync(file) !== file) throw new Error("semantic evidence package member noncanonical");
  const fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  try {
    const first = fstatSync(fd);
    const current = lstatSync(file);
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    if (!first.isFile() || first.isSymbolicLink() || first.nlink !== 1 || (first.mode & 0o777) !== 0o600
        || first.size < 1 || first.size > maximumMemberBytes || (uid !== null && first.uid !== uid)) {
      throw new Error("semantic evidence package member unsafe");
    }
    const bytes = readFileSync(fd);
    const finished = fstatSync(fd);
    const after = lstatSync(file);
    if (memberIdentity(first) !== memberIdentity(current) || memberIdentity(first) !== memberIdentity(finished)
        || memberIdentity(first) !== memberIdentity(after)
        || bytes.length !== first.size || realpathSync(file) !== file) throw new Error("semantic evidence package member changed");
    parseCanonicalJson(bytes);
    return { bytes, sha256: sha256(bytes), ownerUid: first.uid, mode: first.mode & 0o777, identity: memberIdentity(first) };
  } finally { closeSync(fd); }
}

function writeMember(file, bytes) {
  const fd = openSync(file, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW || 0), 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

function fsyncDirectory(directory) {
  const fd = openSync(directory, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY || 0));
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function fsyncExistingPackage(root, members) {
  authenticateDirectory(root, 0o700);
  if (canonicalJson(readdirSync(root).sort()) !== canonicalJson(members.map((member) => member.name).sort())) {
    throw new Error("semantic evidence package incoming members changed");
  }
  for (const member of members) {
    const file = path.join(root, member.name);
    const authenticated = authenticateMember(file);
    if (authenticated.sha256 !== member.sha256) throw new Error("semantic evidence package incoming member changed");
    const fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
    try { fsyncSync(fd); } finally { closeSync(fd); }
  }
  fsyncDirectory(root);
}

function publishDirectoryNoReplace(source, destination) {
  try {
    execFileSync("/usr/bin/mv", ["--no-target-directory", "--no-clobber", "--", source, destination], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
      maxBuffer: 64 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
  } catch (error) {
    if (pathEntryExists(source) && pathEntryExists(destination)) {
      throw new Error("semantic evidence package no-clobber publication refused");
    }
    throw error;
  }
  if (pathEntryExists(source) || !pathEntryExists(destination)) {
    throw new Error("semantic evidence package no-clobber publication refused");
  }
}

function pathEntryExists(target) {
  try { lstatSync(target); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

function validatePlan(plan) {
  if (!plan || plan.contract !== semanticDeploymentEvidencePackageContract || plan.version !== semanticDeploymentEvidencePackageVersion
      || path.dirname(plan.packageRoot || "") !== plan.configRoot || path.dirname(plan.incomingRoot || "") !== plan.configRoot
      || !Array.isArray(plan.members) || plan.members.length !== semanticRecoveryAuthorityClasses.length + 2) {
    throw new Error("semantic evidence package plan invalid");
  }
  if (!packageBasenamePattern.test(String(plan.packageBasename || ""))
      || plan.packageRoot !== path.join(plan.configRoot, plan.packageBasename)
      || plan.incomingRoot !== path.join(plan.configRoot, `${plan.packageBasename}.incoming`)
      || plan.retiredRoot !== path.join(plan.configRoot, `${plan.packageBasename}.retired`)
      || plan.documentPath !== path.join(plan.packageRoot, semanticDeploymentEvidenceDocumentName)) {
    throw new Error("semantic evidence package plan paths invalid");
  }
  const expectedNames = [semanticDeploymentEvidenceDocumentName, semanticDeploymentEvidencePackageManifestName,
    ...semanticRecoveryAuthorityClasses.map(sourceFilename)].sort();
  if (canonicalJson(plan.members.map(({ name }) => name).sort()) !== canonicalJson(expectedNames)
      || plan.members.some((member) => !Buffer.isBuffer(member.bytes) || member.sha256 !== sha256(member.bytes))) {
    throw new Error("semantic evidence package plan members invalid");
  }
  authenticatePackageParent(plan.configRoot);
}

function packageResult(plan, action) {
  const authenticated = authenticateSemanticDeploymentEvidencePackage(plan.documentPath);
  const plannedDigests = plan.members.map(({ name, sha256: digest }) => ({ name, sha256: digest }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const authenticatedDigests = [...authenticated.evidence.memberDigests]
    .sort((left, right) => left.name.localeCompare(right.name));
  const plannedDocument = plan.members.find(({ name }) => name === semanticDeploymentEvidenceDocumentName);
  if (authenticated.evidence.packageRoot !== plan.packageRoot
      || authenticated.evidence.packageAggregateDigest !== plan.packageAggregateDigest
      || authenticated.evidence.packageManifestDigest !== plan.packageManifestDigest
      || authenticated.evidence.memberManifestDigest !== plan.memberManifestDigest
      || authenticated.evidence.sha256 !== plannedDocument?.sha256
      || canonicalJson(authenticatedDigests) !== canonicalJson(plannedDigests)) {
    throw new Error("semantic evidence package committed bytes differ from plan");
  }
  return deepFreeze({
    ok: true,
    action,
    packageRoot: plan.packageRoot,
    documentPath: plan.documentPath,
    packageAggregateDigest: authenticated.evidence.packageAggregateDigest,
    packageManifestDigest: authenticated.evidence.packageManifestDigest,
    memberManifestDigest: authenticated.evidence.memberManifestDigest,
  });
}

function parseCanonicalJson(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  const value = JSON.parse(text);
  if (text !== canonicalJson(value)) throw new Error("semantic evidence package JSON noncanonical");
  return value;
}
function assertExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) throw new Error("semantic evidence package fields invalid");
}
function canonicalBytes(value) { return Buffer.from(canonicalJson(value)); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function memberIdentity(info) { return [info.dev, info.ino, info.mode, info.nlink, info.uid, info.gid, info.size, info.mtimeMs, info.ctimeMs].join(":"); }
function deepFreeze(value) {
  if (ArrayBuffer.isView(value)) return value;
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
