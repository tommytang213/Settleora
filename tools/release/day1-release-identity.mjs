import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

export const SCHEMA = 'settleora.day1-release-identity.v1';
export const DIGEST_ALGORITHM = 'sha256(canonical-json-v1;excludes=generatedAt,identityDigest)';

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const HEX256 = /^[0-9a-f]{64}$/u;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._/+:-]*$/u;
const MIGRATION_FILE = /^(\d{14}_[A-Za-z0-9_]+)\.Designer\.cs$/u;

const fail = (message) => { throw new Error(message); };
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export const canonicalJson = (value) => `${JSON.stringify(canonicalize(value), null, 2)}\n`;

export function identityProjection(manifest) {
  const { generatedAt: _generatedAt, identityDigest: _identityDigest, ...identity } = manifest;
  return identity;
}

export const computeIdentityDigest = (manifest) => sha256(canonicalJson(identityProjection(manifest)));

function string(value, label) {
  if (typeof value !== 'string' || value.length === 0 || /[\r\n\0]/u.test(value)) fail(`${label} must be a non-empty single-line string`);
  return value;
}

function sha40(value, label) {
  if (!SHA40.test(value)) fail(`${label} must be a lowercase 40-character Git SHA`);
  return value;
}

function digest(value, label) {
  if (!SHA256.test(value)) fail(`${label} must be an immutable sha256 digest`);
  return value;
}

function hexDigest(value, label) {
  if (!HEX256.test(value)) fail(`${label} must be a lowercase SHA-256 hex digest`);
  return value;
}

function safeLabel(value, label) {
  string(value, label);
  if (!SAFE_LABEL.test(value) || value.includes('..') || path.isAbsolute(value) || value.includes('\\')) {
    fail(`${label} must be a safe non-absolute evidence label`);
  }
  return value;
}

function publicText(value, label) {
  string(value, label);
  if (/(?:\/home\/|\/tmp\/|\\Users\\|\b(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)\s*[:=])/iu.test(value)) {
    fail(`${label} contains host-specific or potentially sensitive material`);
  }
  return value;
}

function withPlatform(image, platform, label) {
  if (image.os !== undefined && image.os !== platform.os) fail(`${label} OS mismatch`);
  if (image.architecture !== undefined && image.architecture !== platform.architecture) fail(`${label} architecture mismatch`);
  return { ...image, ...platform };
}

function exactRegularFile(candidate, label, allowedRoot) {
  const absolute = path.resolve(candidate);
  const root = path.resolve(allowedRoot);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label} must be a file inside ${root}`);
  }
  let cursor = absolute;
  while (cursor !== root) {
    const metadata = lstatSync(cursor, { throwIfNoEntry: false });
    if (!metadata) fail(`${label} does not exist`);
    if (metadata.isSymbolicLink()) fail(`${label} must not use symlinks`);
    cursor = path.dirname(cursor);
  }
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) fail(`${label} root must be a real directory`);
  const metadata = statSync(absolute);
  if (!metadata.isFile()) fail(`${label} must be a regular file`);
  if (realpathSync(absolute) !== absolute) fail(`${label} must resolve without indirection`);
  return { absolute, bytes: readFileSync(absolute), size: metadata.size };
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function collectSource(repoRoot, expected) {
  if (lstatSync(repoRoot).isSymbolicLink()) fail('Repository root must not be a symlink');
  const status = git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status) fail('Source checkout is not clean');
  const commit = git(repoRoot, ['rev-parse', 'HEAD']);
  const tree = git(repoRoot, ['rev-parse', 'HEAD^{tree}']);
  sha40(commit, 'source.commit');
  sha40(tree, 'source.tree');
  if (expected?.commit !== commit) fail(`Source commit mismatch: expected ${expected?.commit}, found ${commit}`);
  if (expected?.tree !== tree) fail(`Source tree mismatch: expected ${expected?.tree}, found ${tree}`);
  return {
    repository: string(expected.repository, 'source.repository'),
    commit,
    tree,
    candidateId: safeLabel(expected.candidateId, 'source.candidateId'),
    exactSource: true,
    cleanTrackedCheckout: true,
  };
}

export function validateRegistryDocument(image, document, platform, label = 'registry image') {
  if (document?.digest !== image.indexDigest) fail(`${label} registry index digest mismatch`);
  if (!Array.isArray(document.manifests)) fail(`${label} registry index has no manifest list`);
  const matches = document.manifests.filter((entry) => (
    entry?.platform?.os === platform.os
    && entry?.platform?.architecture === platform.architecture
    && entry?.digest === image.platformDigest
  ));
  if (matches.length !== 1) fail(`${label} registry platform/digest relationship mismatch`);
  return true;
}

export function validateRegistryRevision(image, imageDocument, expectedRevision, label = 'registry image') {
  const revision = imageDocument?.config?.Labels?.['org.opencontainers.image.revision'];
  if (revision !== expectedRevision || revision !== image.ociRevision) fail(`${label} registry OCI revision mismatch`);
  return true;
}

export function collectMigrations(repoRoot, expectedDigest) {
  const relativeRoot = 'services/api/src/Settleora.Api/Persistence/Migrations';
  const migrationRoot = path.join(repoRoot, relativeRoot);
  const ids = readdirSync(migrationRoot)
    .map((name) => MIGRATION_FILE.exec(name)?.[1])
    .filter(Boolean)
    .sort();
  if (ids.length === 0) fail('No repository migrations found');
  const entries = ids.map((id) => ({
    id,
    files: [`${id}.cs`, `${id}.Designer.cs`].sort().map((name) => {
      const file = exactRegularFile(path.join(migrationRoot, name), `migration ${id}`, migrationRoot);
      return { path: `${relativeRoot}/${name}`, sha256: sha256(file.bytes), size: file.size };
    }),
  }));
  const setSha256 = sha256(canonicalJson(entries));
  if (expectedDigest && expectedDigest !== setSha256) fail(`Migration-set digest mismatch: expected ${expectedDigest}, found ${setSha256}`);
  return {
    stateClaim: 'repository-source-only-not-applied',
    ordering: 'migration-id-byte-order-v1',
    setDigestAlgorithm: 'sha256(canonical-json-v1:migration-entries)',
    setSha256,
    count: entries.length,
    entries,
  };
}

function validateImage(image, label, sourceCommit, expectedTag) {
  string(image.repository, `${label}.repository`);
  string(image.configuredTag, `${label}.configuredTag`);
  digest(image.indexDigest, `${label}.indexDigest`);
  digest(image.platformDigest, `${label}.platformDigest`);
  string(image.os, `${label}.os`);
  string(image.architecture, `${label}.architecture`);
  if (image.indexDigest === image.platformDigest) fail(`${label} index and selected platform digests must remain distinct`);
  if (expectedTag && image.configuredTag !== expectedTag) fail(`${label} configured tag mismatch`);
  if (/(?:^|:)(?:main|latest)$/u.test(image.configuredTag)) fail(`${label} floating tag is not authoritative`);
  if (sourceCommit) {
    if (image.configuredTag !== `sha-${sourceCommit}`) fail('API image tag must be exactly sha-<source commit>');
    if (image.ociRevision !== sourceCommit) fail('API image OCI revision mismatch');
  }
  return image;
}

function configuredImage(repoRoot, sourcePath, service) {
  safeLabel(sourcePath, 'dependency sourceComposePath');
  const absolute = path.join(repoRoot, sourcePath);
  const lines = exactRegularFile(absolute, 'dependency Compose source', repoRoot).bytes.toString('utf8').split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `  ${service}:`);
  if (start < 0) fail(`Could not find service ${service} in ${sourcePath}`);
  for (let index = start + 1; index < lines.length && !/^  [A-Za-z0-9_-]+:\s*$/u.test(lines[index]); index += 1) {
    const match = /^    image:\s*["']?([^"'\s]+)["']?\s*$/u.exec(lines[index]);
    if (match) return match[1];
  }
  fail(`Could not find image for ${service} in ${sourcePath}`);
}

function collectWeb(repoRoot, input, source) {
  const file = exactRegularFile(input.manifestPath, 'userWeb manifest', input.evidenceRoot);
  const manifest = JSON.parse(file.bytes);
  if (manifest.schema !== 'settleora.user-web-dist-manifest.v1') fail('Unsupported user-web manifest schema');
  if (manifest.source?.commit !== source.commit || manifest.source?.tree !== source.tree) fail('User-web source/tree mismatch');
  hexDigest(manifest.artifact?.treeSha256, 'userWeb treeSha256');
  hexDigest(manifest.dependencyLock?.sha256, 'userWeb dependency lock SHA-256');
  if (!Number.isSafeInteger(manifest.artifact.fileCount) || manifest.artifact.fileCount < 1) fail('Invalid user-web file count');
  if (!Number.isSafeInteger(manifest.artifact.totalBytes) || manifest.artifact.totalBytes < 1) fail('Invalid user-web byte count');
  return {
    schema: manifest.schema,
    source: manifest.source,
    dependencyLock: manifest.dependencyLock,
    artifact: {
      treeDigestAlgorithm: manifest.artifact.treeDigestAlgorithm,
      treeSha256: manifest.artifact.treeSha256,
      fileCount: manifest.artifact.fileCount,
      totalBytes: manifest.artifact.totalBytes,
    },
    manifestSha256: sha256(file.bytes),
  };
}

function collectAndroid(repoRoot, input) {
  const apk = exactRegularFile(input.apkPath, 'Android APK', input.evidenceRoot);
  const aab = exactRegularFile(input.aabPath, 'Android AAB', input.evidenceRoot);
  const mapping = exactRegularFile(input.mappingPath, 'Android R8 mapping', input.evidenceRoot);
  if (mapping.size === 0) fail('Android R8 mapping must not be empty');
  const metadataFile = exactRegularFile(input.outputMetadataPath, 'Android output metadata', input.evidenceRoot);
  const metadata = JSON.parse(metadataFile.bytes);
  const element = metadata.elements?.find((candidate) => candidate.outputFile === path.basename(input.apkPath));
  if (!element) fail('Android APK is absent from output metadata');
  const pubspec = exactRegularFile(path.join(repoRoot, 'apps/mobile/pubspec.yaml'), 'mobile pubspec', repoRoot).bytes.toString('utf8');
  const version = /^version:\s*([^+\s]+)\+(\d+)\s*$/mu.exec(pubspec);
  if (!version) fail('Mobile semantic version/build is missing from pubspec');
  if (element.versionName !== version[1] || String(element.versionCode) !== version[2]) fail('Android artifact version/build mismatch');
  const gradle = exactRegularFile(path.join(repoRoot, 'apps/mobile/android/app/build.gradle.kts'), 'Android release config', repoRoot).bytes.toString('utf8');
  if (!/applicationId\s*=\s*"com\.example\.mobile"/u.test(gradle) || metadata.applicationId !== 'com.example.mobile') {
    fail('Android application ID mismatch');
  }
  if (!/release\s*\{[\s\S]*?signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)/u.test(gradle)) {
    fail('Android signing state does not match the bounded debug-signing observation');
  }
  const result = {
    semanticVersion: version[1],
    buildNumber: version[2],
    applicationId: metadata.applicationId,
    r8Minified: true,
    r8MappingSha256: sha256(mapping.bytes),
    signingState: 'debug-signing-non-store-ready',
    signerCertificateSha256: hexDigest(input.signerCertificateSha256, 'Android signer certificate SHA-256'),
    apk: { path: 'apps/mobile/build/app/outputs/flutter-apk/app-release.apk', size: apk.size, sha256: sha256(apk.bytes) },
    aab: { path: 'apps/mobile/build/app/outputs/bundle/release/app-release.aab', size: aab.size, sha256: sha256(aab.bytes) },
  };
  for (const kind of ['apk', 'aab']) {
    const expected = input.expected?.[kind];
    if (expected && (expected.size !== result[kind].size || expected.sha256 !== result[kind].sha256)) {
      fail(`Android ${kind.toUpperCase()} identity mismatch`);
    }
  }
  return result;
}

function collectReleaseNotes(input) {
  const file = exactRegularFile(input.path, 'release-note evidence', input.evidenceRoot);
  safeLabel(input.source, 'releaseNotes.source');
  publicText(input.candidateSummary, 'releaseNotes.candidateSummary');
  if (file.size === 0) fail('Release-note evidence must not be empty');
  return { source: input.source, sha256: sha256(file.bytes), size: file.size, candidateSummary: input.candidateSummary };
}

export function validateManifest(manifest) {
  if (manifest.schema !== SCHEMA) fail('Unsupported Day 1 release-identity schema');
  if (manifest.identityDigestAlgorithm !== DIGEST_ALGORITHM) fail('Unsupported identity-digest algorithm');
  sha40(manifest.source?.commit, 'source.commit');
  sha40(manifest.source?.tree, 'source.tree');
  if (manifest.source.exactSource !== true || manifest.source.cleanTrackedCheckout !== true) fail('Source exact/clean assertions are required');
  validateImage(manifest.apiImage, 'apiImage', manifest.source.commit);
  if (!Array.isArray(manifest.dependencyImages) || manifest.dependencyImages.length !== 3) fail('Exactly three dependency images are required');
  const expectedDependencies = new Set(['caddy', 'postgres', 'rabbitmq']);
  for (const image of manifest.dependencyImages) {
    if (!expectedDependencies.delete(image.name)) fail(`Unexpected or duplicate dependency image ${image.name}`);
    validateImage(image, `dependencyImages.${image.name}`);
    safeLabel(image.sourceComposePath, `dependencyImages.${image.name}.sourceComposePath`);
  }
  if (expectedDependencies.size) fail('Missing dependency image');
  if (manifest.migrations?.stateClaim !== 'repository-source-only-not-applied') fail('Migrations must not be described as applied');
  hexDigest(manifest.migrations?.setSha256, 'migrations.setSha256');
  if (manifest.migrations.count !== manifest.migrations.entries?.length) fail('Migration count mismatch');
  if (sha256(canonicalJson(manifest.migrations.entries)) !== manifest.migrations.setSha256) fail('Migration-set content mismatch');
  if (manifest.userWeb?.schema !== 'settleora.user-web-dist-manifest.v1') fail('Canonical R02 user-web schema is required');
  if (manifest.userWeb.source?.commit !== manifest.source.commit || manifest.userWeb.source?.tree !== manifest.source.tree) fail('User-web source/tree mismatch');
  hexDigest(manifest.android?.apk?.sha256, 'android.apk.sha256');
  hexDigest(manifest.android?.aab?.sha256, 'android.aab.sha256');
  if (manifest.android.signingState !== 'debug-signing-non-store-ready') fail('Android signing state must be recorded honestly');
  if (manifest.rollback?.artifactAvailabilityProvesDatabaseSchemaFileRollbackSafety !== false) fail('Rollback safety caveat must be false');
  validateImage(manifest.rollback.apiImage, 'rollback.apiImage', manifest.rollback.sourceCommit);
  if (manifest.retention?.canonicalEvidenceDirectory !== `/workspace/logs/settleora-release-candidates/${manifest.source.candidateId}`) {
    fail('Retention directory must exactly bind the candidate ID under the approved external root');
  }
  string(manifest.retention?.policy, 'retention.policy');
  const expectedDigest = computeIdentityDigest(manifest);
  if (manifest.identityDigest !== expectedDigest) fail(`Identity digest mismatch: expected ${expectedDigest}`);
  return manifest;
}

export function buildManifest(repoRoot, input) {
  const source = collectSource(repoRoot, input.source);
  const platform = { os: string(input.platform?.os, 'platform.os'), architecture: string(input.platform?.architecture, 'platform.architecture') };
  const apiImage = validateImage(withPlatform(input.apiImage, platform, 'apiImage'), 'apiImage', source.commit);
  const services = { postgres: 'postgres', rabbitmq: 'rabbitmq', caddy: 'ingress' };
  const dependencyImages = [...input.dependencyImages]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((image) => {
      const expectedTag = configuredImage(repoRoot, image.sourceComposePath, services[image.name]);
      return validateImage(withPlatform(image, platform, `dependencyImages.${image.name}`), `dependencyImages.${image.name}`, undefined, expectedTag);
    });
  const migrations = collectMigrations(repoRoot, input.expectedMigrationSetSha256);
  migrations.source = { commit: source.commit, tree: source.tree };
  const manifest = {
    schema: SCHEMA,
    identityDigestAlgorithm: DIGEST_ALGORITHM,
    generatedAt: string(input.generatedAt, 'generatedAt'),
    source,
    apiImage,
    dependencyImages,
    migrations,
    userWeb: collectWeb(repoRoot, input.userWeb, source),
    android: collectAndroid(repoRoot, input.android),
    releaseNotes: collectReleaseNotes(input.releaseNotes),
    rollback: {
      sourceCommit: sha40(input.rollback.sourceCommit, 'rollback.sourceCommit'),
      apiImage: validateImage(withPlatform(input.rollback.apiImage, platform, 'rollback.apiImage'), 'rollback.apiImage', input.rollback.sourceCommit),
      artifactAvailabilityProvesDatabaseSchemaFileRollbackSafety: false,
      safetyCaveat: 'Artifact availability does not prove database, schema, or file rollback safety.',
    },
    retention: {
      canonicalEvidenceDirectory: string(input.retention.canonicalEvidenceDirectory, 'retention.canonicalEvidenceDirectory'),
      policy: publicText(input.retention.policy, 'retention.policy'),
      apiRegistryIdentity: publicText(input.retention.apiRegistryIdentity, 'retention.apiRegistryIdentity'),
    },
  };
  manifest.identityDigest = computeIdentityDigest(manifest);
  return validateManifest(manifest);
}
