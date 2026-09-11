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
import { createRequire } from 'node:module';
import { assertTrackedWorktreeMatchesHead, collectFiles, scanPublicArtifact } from '../ci/user-web-dist-manifest.mjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const manifestSchema = require('./day1-release-identity.schema.json');
const schemaValidator = new Ajv2020({ allErrors: true, strict: true }).compile(manifestSchema);

export const SCHEMA = 'settleora.day1-release-identity.v1';
export const DIGEST_ALGORITHM = 'sha256(canonical-json-v1;excludes=generatedAt,identityDigest)';

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const HEX256 = /^[0-9a-f]{64}$/u;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._/+:-]*$/u;
const MIGRATION_FILE = /^(\d{14}_[A-Za-z0-9_]+)\.cs$/u;

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

function utcTimestamp(value, label) {
  string(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value.replace(/Z$/u, '.000Z')) {
    fail(`${label} must be a normalized RFC 3339 UTC timestamp`);
  }
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
  if (/(?:\/home\/|\/tmp\/|\\Users\\|\b(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)\s*[:=]|\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{12,}|https?:\/\/[^/@\s]+:[^/@\s]+@)/iu.test(value)) {
    fail(`${label} contains host-specific or potentially sensitive material`);
  }
  return value;
}

function withPlatform(image, platform, label) {
  if (image.os !== undefined && image.os !== platform.os) fail(`${label} OS mismatch`);
  if (image.architecture !== undefined && image.architecture !== platform.architecture) fail(`${label} architecture mismatch`);
  const result = {
    repository: publicText(image.repository, `${label}.repository`),
    configuredTag: publicText(image.configuredTag, `${label}.configuredTag`),
    indexDigest: image.indexDigest,
    platformDigest: image.platformDigest,
    ...platform,
  };
  for (const key of ['name', 'sourceComposePath', 'ociRevision', 'publicationRunUrl']) {
    if (image[key] !== undefined) result[key] = key === 'name' || key === 'sourceComposePath' ? safeLabel(image[key], `${label}.${key}`) : publicText(image[key], `${label}.${key}`);
  }
  return result;
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
  assertTrackedWorktreeMatchesHead(repoRoot);
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
  const names = readdirSync(migrationRoot);
  const unexpected = names.filter((name) => name.endsWith('.cs') && name !== 'SettleoraDbContextModelSnapshot.cs' && !/^(\d{14}_[A-Za-z0-9_]+)(?:\.Designer)?\.cs$/u.test(name));
  if (unexpected.length) fail(`Unrecognized migration source files: ${unexpected.join(', ')}`);
  const ids = names
    .filter((name) => !name.endsWith('.Designer.cs'))
    .map((name) => MIGRATION_FILE.exec(name)?.[1])
    .filter(Boolean)
    .sort();
  if (ids.length === 0) fail('No repository migrations found');
  const runtimeIds = new Set();
  for (const name of names.filter((candidate) => candidate.endsWith('.cs'))) {
    const text = readFileSync(path.join(migrationRoot, name), 'utf8');
    for (const match of text.matchAll(/\[Migration\("(\d{14}_[A-Za-z0-9_]+)"\)\]/gu)) runtimeIds.add(match[1]);
  }
  if (canonicalJson([...runtimeIds].sort()) !== canonicalJson(ids)) fail('Migration filename inventory differs from EF runtime migration attributes');
  const entries = ids.map((id) => ({
    id,
    files: [`${id}.cs`, `${id}.Designer.cs`].filter((name) => lstatSync(path.join(migrationRoot, name), { throwIfNoEntry: false })).sort().map((name) => {
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

function validateImage(image, label, sourceCommit, expectedTag, expectedRepository) {
  assertKeys(image, ['repository', 'configuredTag', 'indexDigest', 'platformDigest', 'os', 'architecture', 'name', 'sourceComposePath', 'ociRevision', 'publicationRunUrl'], label, ['repository', 'configuredTag', 'indexDigest', 'platformDigest', 'os', 'architecture']);
  string(image.repository, `${label}.repository`);
  string(image.configuredTag, `${label}.configuredTag`);
  digest(image.indexDigest, `${label}.indexDigest`);
  digest(image.platformDigest, `${label}.platformDigest`);
  string(image.os, `${label}.os`);
  string(image.architecture, `${label}.architecture`);
  if (expectedRepository && image.repository !== expectedRepository) fail(`${label} repository mismatch`);
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
  const lock = exactRegularFile(path.join(repoRoot, 'apps/web-user/package-lock.json'), 'userWeb dependency lock', repoRoot);
  if (manifest.dependencyLock?.path !== 'apps/web-user/package-lock.json' || manifest.dependencyLock?.sha256 !== sha256(lock.bytes)) {
    fail('User-web dependency lock mismatch');
  }
  hexDigest(manifest.artifact?.treeSha256, 'userWeb treeSha256');
  hexDigest(manifest.dependencyLock?.sha256, 'userWeb dependency lock SHA-256');
  if (!Number.isSafeInteger(manifest.artifact.fileCount) || manifest.artifact.fileCount < 1) fail('Invalid user-web file count');
  if (!Number.isSafeInteger(manifest.artifact.totalBytes) || manifest.artifact.totalBytes < 1) fail('Invalid user-web byte count');
  if (manifest.artifact.treeDigestAlgorithm !== 'sha256(canonical-file-records-v1)' || !Array.isArray(manifest.artifact.files)) {
    fail('User-web canonical file records are required');
  }
  safeLabel(manifest.artifact.root, 'userWeb artifact root');
  if (!manifest.buildTools || typeof manifest.buildTools !== 'object' || manifest.publicArtifactChecks?.symlinksRejected !== true || manifest.publicArtifactChecks?.sourceMapsRejected !== true || manifest.publicArtifactChecks?.sensitiveMaterialScan !== 'passed') {
    fail('User-web canonical build/security evidence is incomplete');
  }
  const distRoot = path.join(path.dirname(file.absolute), 'dist');
  const canonicalFiles = collectFiles(distRoot);
  scanPublicArtifact(canonicalFiles);
  const records = manifest.artifact.files.map((entry) => {
    safeLabel(entry.path, 'userWeb artifact path');
    const artifact = exactRegularFile(path.join(distRoot, entry.path), `userWeb artifact ${entry.path}`, distRoot);
    const record = { path: entry.path, size: artifact.size, sha256: sha256(artifact.bytes) };
    if (canonicalJson(record) !== canonicalJson(entry)) fail(`User-web artifact identity mismatch: ${entry.path}`);
    return record;
  }).sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
  const actualPaths = canonicalFiles.map((entry) => entry.path);
  if (canonicalJson(actualPaths) !== canonicalJson(records.map((entry) => entry.path))) fail('User-web manifest file list is incomplete');
  if (records.length !== manifest.artifact.fileCount || records.reduce((sum, entry) => sum + entry.size, 0) !== manifest.artifact.totalBytes) {
    fail('User-web artifact aggregate mismatch');
  }
  const treeInput = records.map((entry) => `${entry.sha256}  ${entry.size}  ${entry.path}\n`).join('');
  if (sha256(treeInput) !== manifest.artifact.treeSha256) fail('User-web tree digest mismatch');
  return {
    schema: manifest.schema,
    source: { commit: source.commit, tree: source.tree },
    dependencyLock: { path: manifest.dependencyLock.path, sha256: manifest.dependencyLock.sha256, lockfileVersion: manifest.dependencyLock.lockfileVersion },
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
  if (mapping.size === 0 || !mapping.bytes.toString('utf8').startsWith('# compiler: R8\n')) fail('Android R8 mapping must be a non-empty R8 mapping');
  if (hexDigest(input.embeddedR8MappingSha256, 'Android embedded R8 mapping SHA-256') !== sha256(mapping.bytes)) fail('Android R8 mapping does not match the signed AAB');
  const metadataFile = exactRegularFile(input.outputMetadataPath, 'Android output metadata', input.evidenceRoot);
  const metadata = JSON.parse(metadataFile.bytes);
  const provenanceFile = exactRegularFile(input.buildProvenancePath, 'Android build provenance', input.evidenceRoot);
  const provenance = JSON.parse(provenanceFile.bytes);
  const commit = git(repoRoot, ['rev-parse', 'HEAD']);
  const tree = git(repoRoot, ['rev-parse', 'HEAD^{tree}']);
  if (provenance.schema !== 'settleora.android-exact-source-build.v1' || provenance.source?.commit !== commit || provenance.source?.tree !== tree) {
    fail('Android build provenance source mismatch');
  }
  if (canonicalJson(provenance.commands) !== canonicalJson(['flutter clean', 'flutter build apk --release', 'flutter build appbundle --release'])) {
    fail('Android build provenance command mismatch');
  }
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
    source: { commit, tree },
    semanticVersion: version[1],
    buildNumber: version[2],
    applicationId: metadata.applicationId,
    r8Minified: true,
    r8MappingSha256: sha256(mapping.bytes),
    signingState: 'debug-signing-non-store-ready',
    signerCertificateSha256: hexDigest(input.signerCertificateSha256, 'Android signer certificate SHA-256'),
    apk: { path: 'apps/mobile/build/app/outputs/flutter-apk/app-release.apk', size: apk.size, sha256: sha256(apk.bytes) },
    aab: { path: 'apps/mobile/build/app/outputs/bundle/release/app-release.aab', size: aab.size, sha256: sha256(aab.bytes) },
    buildProvenanceSha256: sha256(provenanceFile.bytes),
  };
  if (canonicalJson(provenance.artifacts) !== canonicalJson({ apk: result.apk, aab: result.aab, r8MappingSha256: result.r8MappingSha256 })) {
    fail('Android build provenance artifact mismatch');
  }
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
  if (/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)\s*[:=]\s*\S{8,}|\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{12,}|https?:\/\/[^/@\s]+:[^/@\s]+@)/iu.test(file.bytes.toString('utf8'))) fail('Release-note evidence contains potentially sensitive material');
  return { source: input.source, sha256: sha256(file.bytes), size: file.size, candidateSummary: input.candidateSummary };
}

export function validateManifest(manifest) {
  if (!schemaValidator(manifest)) fail(`Manifest JSON schema mismatch: ${schemaValidator.errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')}`);
  assertKeys(manifest, ['schema', 'identityDigestAlgorithm', 'identityDigest', 'generatedAt', 'source', 'apiImage', 'dependencyImages', 'migrations', 'userWeb', 'android', 'releaseNotes', 'rollback', 'retention'], 'manifest');
  if (manifest.schema !== SCHEMA) fail('Unsupported Day 1 release-identity schema');
  if (manifest.identityDigestAlgorithm !== DIGEST_ALGORITHM) fail('Unsupported identity-digest algorithm');
  utcTimestamp(manifest.generatedAt, 'generatedAt');
  sha40(manifest.source?.commit, 'source.commit');
  assertKeys(manifest.source, ['repository', 'commit', 'tree', 'candidateId', 'exactSource', 'cleanTrackedCheckout'], 'source');
  if (manifest.source.repository !== 'tommytang213/Settleora') fail('Source repository mismatch');
  safeLabel(manifest.source.candidateId, 'source.candidateId');
  sha40(manifest.source?.tree, 'source.tree');
  if (manifest.source.exactSource !== true || manifest.source.cleanTrackedCheckout !== true) fail('Source exact/clean assertions are required');
  const apiRepository = 'ghcr.io/tommytang213/settleora-api';
  validateImage(manifest.apiImage, 'apiImage', manifest.source.commit, undefined, apiRepository);
  if (!Array.isArray(manifest.dependencyImages) || manifest.dependencyImages.length !== 3) fail('Exactly three dependency images are required');
  const expectedDependencies = new Set(['caddy', 'postgres', 'rabbitmq']);
  const dependencyRepositories = { postgres: 'docker.io/library/postgres', rabbitmq: 'docker.io/library/rabbitmq', caddy: 'docker.io/library/caddy' };
  for (const image of manifest.dependencyImages) {
    if (!expectedDependencies.delete(image.name)) fail(`Unexpected or duplicate dependency image ${image.name}`);
    validateImage(image, `dependencyImages.${image.name}`, undefined, undefined, dependencyRepositories[image.name]);
    safeLabel(image.sourceComposePath, `dependencyImages.${image.name}.sourceComposePath`);
  }
  if (expectedDependencies.size) fail('Missing dependency image');
  if (manifest.migrations?.stateClaim !== 'repository-source-only-not-applied') fail('Migrations must not be described as applied');
  assertKeys(manifest.migrations, ['stateClaim', 'ordering', 'setDigestAlgorithm', 'setSha256', 'count', 'entries', 'source'], 'migrations');
  assertKeys(manifest.migrations.source, ['commit', 'tree'], 'migrations.source');
  if (manifest.migrations.ordering !== 'migration-id-byte-order-v1' || manifest.migrations.setDigestAlgorithm !== 'sha256(canonical-json-v1:migration-entries)') fail('Migration algorithm mismatch');
  if (manifest.migrations.source.commit !== manifest.source.commit || manifest.migrations.source.tree !== manifest.source.tree) fail('Migration source mismatch');
  let priorMigration = '';
  for (const [index, entry] of manifest.migrations.entries?.entries?.() ?? []) {
    assertKeys(entry, ['id', 'files'], `migrations.entries.${index}`);
    if (!/^\d{14}_[A-Za-z0-9_]+$/u.test(entry.id) || entry.id <= priorMigration) fail('Migration IDs must be valid and strictly ordered');
    priorMigration = entry.id;
    if (!Array.isArray(entry.files) || entry.files.length < 1 || entry.files.length > 2) fail('Migration file list is invalid');
    for (const file of entry.files) {
      assertKeys(file, ['path', 'sha256', 'size'], `migrations.entries.${index}.file`);
      safeLabel(file.path, `migrations.entries.${index}.path`);
      hexDigest(file.sha256, `migrations.entries.${index}.sha256`);
      if (!Number.isSafeInteger(file.size) || file.size < 1) fail('Migration file size is invalid');
    }
  }
  hexDigest(manifest.migrations?.setSha256, 'migrations.setSha256');
  if (manifest.migrations.count !== manifest.migrations.entries?.length) fail('Migration count mismatch');
  if (sha256(canonicalJson(manifest.migrations.entries)) !== manifest.migrations.setSha256) fail('Migration-set content mismatch');
  if (manifest.userWeb?.schema !== 'settleora.user-web-dist-manifest.v1') fail('Canonical R02 user-web schema is required');
  assertKeys(manifest.userWeb, ['schema', 'source', 'dependencyLock', 'artifact', 'manifestSha256'], 'userWeb');
  assertKeys(manifest.userWeb.source, ['commit', 'tree'], 'userWeb.source');
  assertKeys(manifest.userWeb.dependencyLock, ['path', 'sha256', 'lockfileVersion'], 'userWeb.dependencyLock');
  assertKeys(manifest.userWeb.artifact, ['treeDigestAlgorithm', 'treeSha256', 'fileCount', 'totalBytes'], 'userWeb.artifact');
  if (manifest.userWeb.dependencyLock.path !== 'apps/web-user/package-lock.json' || manifest.userWeb.artifact.treeDigestAlgorithm !== 'sha256(canonical-file-records-v1)') fail('User-web algorithm/path mismatch');
  hexDigest(manifest.userWeb.dependencyLock.sha256, 'userWeb.dependencyLock.sha256');
  hexDigest(manifest.userWeb.artifact.treeSha256, 'userWeb.artifact.treeSha256');
  hexDigest(manifest.userWeb.manifestSha256, 'userWeb.manifestSha256');
  if (!Number.isSafeInteger(manifest.userWeb.artifact.fileCount) || manifest.userWeb.artifact.fileCount < 1 || !Number.isSafeInteger(manifest.userWeb.artifact.totalBytes) || manifest.userWeb.artifact.totalBytes < 1) fail('User-web aggregate values are invalid');
  if (manifest.userWeb.source?.commit !== manifest.source.commit || manifest.userWeb.source?.tree !== manifest.source.tree) fail('User-web source/tree mismatch');
  if (manifest.android?.source?.commit !== manifest.source.commit || manifest.android?.source?.tree !== manifest.source.tree) fail('Android source/tree mismatch');
  assertKeys(manifest.android, ['source', 'semanticVersion', 'buildNumber', 'applicationId', 'r8Minified', 'r8MappingSha256', 'signingState', 'signerCertificateSha256', 'apk', 'aab', 'buildProvenanceSha256'], 'android');
  assertKeys(manifest.android.source, ['commit', 'tree'], 'android.source');
  assertKeys(manifest.android.apk, ['path', 'size', 'sha256'], 'android.apk');
  assertKeys(manifest.android.aab, ['path', 'size', 'sha256'], 'android.aab');
  for (const key of ['semanticVersion', 'buildNumber', 'applicationId']) string(manifest.android[key], `android.${key}`);
  if (manifest.android.r8Minified !== true) fail('Android R8/minification assertion is required');
  hexDigest(manifest.android.r8MappingSha256, 'android.r8MappingSha256');
  hexDigest(manifest.android.signerCertificateSha256, 'android.signerCertificateSha256');
  hexDigest(manifest.android.buildProvenanceSha256, 'android.buildProvenanceSha256');
  for (const artifact of [manifest.android.apk, manifest.android.aab]) if (!Number.isSafeInteger(artifact.size) || artifact.size < 1) fail('Android artifact size is invalid');
  hexDigest(manifest.android?.apk?.sha256, 'android.apk.sha256');
  hexDigest(manifest.android?.aab?.sha256, 'android.aab.sha256');
  if (manifest.android.signingState !== 'debug-signing-non-store-ready') fail('Android signing state must be recorded honestly');
  if (manifest.rollback?.artifactAvailabilityProvesDatabaseSchemaFileRollbackSafety !== false) fail('Rollback safety caveat must be false');
  assertKeys(manifest.releaseNotes, ['source', 'sha256', 'size', 'candidateSummary'], 'releaseNotes');
  safeLabel(manifest.releaseNotes.source, 'releaseNotes.source');
  hexDigest(manifest.releaseNotes.sha256, 'releaseNotes.sha256');
  if (!Number.isSafeInteger(manifest.releaseNotes.size) || manifest.releaseNotes.size < 1) fail('Release-note size is invalid');
  publicText(manifest.releaseNotes.candidateSummary, 'releaseNotes.candidateSummary');
  assertKeys(manifest.rollback, ['sourceCommit', 'apiImage', 'artifactAvailabilityProvesDatabaseSchemaFileRollbackSafety', 'safetyCaveat'], 'rollback');
  if (manifest.rollback.safetyCaveat !== 'Artifact availability does not prove database, schema, or file rollback safety.') fail('Rollback safety caveat text is required');
  validateImage(manifest.rollback.apiImage, 'rollback.apiImage', manifest.rollback.sourceCommit, undefined, apiRepository);
  if (manifest.retention?.canonicalEvidenceDirectory !== `/workspace/logs/settleora-release-candidates/${manifest.source.candidateId}`) {
    fail('Retention directory must exactly bind the candidate ID under the approved external root');
  }
  assertKeys(manifest.retention, ['canonicalEvidenceDirectory', 'policy', 'apiRegistryIdentity'], 'retention');
  publicText(manifest.retention?.policy, 'retention.policy');
  publicText(manifest.retention?.apiRegistryIdentity, 'retention.apiRegistryIdentity');
  const expectedDigest = computeIdentityDigest(manifest);
  if (manifest.identityDigest !== expectedDigest) fail(`Identity digest mismatch: expected ${expectedDigest}`);
  return manifest;
}

function assertKeys(value, allowed, label, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) fail(`${label} has unexpected properties: ${extras.join(', ')}`);
  const missing = required.filter((key) => !(key in value));
  if (missing.length) fail(`${label} is missing required properties: ${missing.join(', ')}`);
}

function assertInput(input) {
  assertKeys(input, ['generatedAt', 'registryResolutionMode', 'platform', 'source', 'apiImage', 'dependencyImages', 'expectedMigrationSetSha256', 'userWeb', 'android', 'releaseNotes', 'rollback', 'retention'], 'input', ['generatedAt', 'registryResolutionMode', 'platform', 'source', 'apiImage', 'dependencyImages', 'userWeb', 'android', 'releaseNotes', 'rollback', 'retention']);
  assertKeys(input.platform, ['os', 'architecture'], 'input.platform');
  assertKeys(input.source, ['repository', 'commit', 'tree', 'candidateId'], 'input.source');
  assertKeys(input.apiImage, ['repository', 'configuredTag', 'indexDigest', 'platformDigest', 'ociRevision', 'publicationRunUrl'], 'input.apiImage');
  for (const [index, image] of input.dependencyImages?.entries?.() ?? []) assertKeys(image, ['name', 'repository', 'configuredTag', 'indexDigest', 'platformDigest', 'sourceComposePath', 'os', 'architecture'], `input.dependencyImages.${index}`, ['name', 'repository', 'configuredTag', 'indexDigest', 'platformDigest', 'sourceComposePath']);
  assertKeys(input.userWeb, ['evidenceRoot', 'manifestPath'], 'input.userWeb');
  assertKeys(input.android, ['evidenceRoot', 'apkPath', 'aabPath', 'mappingPath', 'outputMetadataPath', 'buildProvenancePath', 'signerCertificateSha256', 'embeddedR8MappingSha256', 'expected'], 'input.android', ['evidenceRoot', 'apkPath', 'aabPath', 'mappingPath', 'outputMetadataPath', 'buildProvenancePath', 'signerCertificateSha256', 'embeddedR8MappingSha256']);
  if (input.android.expected !== undefined) {
    assertKeys(input.android.expected, ['apk', 'aab'], 'input.android.expected', []);
    for (const kind of ['apk', 'aab']) if (input.android.expected[kind] !== undefined) assertKeys(input.android.expected[kind], ['size', 'sha256'], `input.android.expected.${kind}`);
  }
  assertKeys(input.releaseNotes, ['evidenceRoot', 'path', 'source', 'candidateSummary'], 'input.releaseNotes');
  assertKeys(input.rollback, ['sourceCommit', 'apiImage'], 'input.rollback');
  assertKeys(input.rollback.apiImage, ['repository', 'configuredTag', 'indexDigest', 'platformDigest', 'ociRevision'], 'input.rollback.apiImage');
  assertKeys(input.retention, ['canonicalEvidenceDirectory', 'policy', 'apiRegistryIdentity'], 'input.retention');
  if (!Array.isArray(input.dependencyImages) || input.dependencyImages.length !== 3) fail('Input requires exactly three dependency images');
}

export function buildManifest(repoRoot, input) {
  assertInput(input);
  const source = collectSource(repoRoot, input.source);
  const platform = { os: string(input.platform?.os, 'platform.os'), architecture: string(input.platform?.architecture, 'platform.architecture') };
  const apiRepository = 'ghcr.io/tommytang213/settleora-api';
  const apiImage = validateImage(withPlatform(input.apiImage, platform, 'apiImage'), 'apiImage', source.commit, undefined, apiRepository);
  const services = { postgres: 'postgres', rabbitmq: 'rabbitmq', caddy: 'ingress' };
  const repositories = { postgres: 'docker.io/library/postgres', rabbitmq: 'docker.io/library/rabbitmq', caddy: 'docker.io/library/caddy' };
  const dependencyImages = [...input.dependencyImages]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((image) => {
      const expectedTag = configuredImage(repoRoot, image.sourceComposePath, services[image.name]);
      return validateImage(withPlatform(image, platform, `dependencyImages.${image.name}`), `dependencyImages.${image.name}`, undefined, expectedTag, repositories[image.name]);
    });
  const migrations = collectMigrations(repoRoot, input.expectedMigrationSetSha256);
  migrations.source = { commit: source.commit, tree: source.tree };
  const rollbackCommit = sha40(input.rollback.sourceCommit, 'rollback.sourceCommit');
  try {
    git(repoRoot, ['cat-file', '-e', `${rollbackCommit}^{commit}`]);
    if (rollbackCommit === source.commit) fail('Rollback source must be prior to the candidate source');
    git(repoRoot, ['merge-base', '--is-ancestor', rollbackCommit, source.commit]);
  } catch (error) {
    if (error instanceof Error && error.message === 'Rollback source must be prior to the candidate source') throw error;
    fail('Rollback source must be an existing prior ancestor of the candidate source');
  }
  const manifest = {
    schema: SCHEMA,
    identityDigestAlgorithm: DIGEST_ALGORITHM,
    generatedAt: utcTimestamp(input.generatedAt, 'generatedAt'),
    source,
    apiImage,
    dependencyImages,
    migrations,
    userWeb: collectWeb(repoRoot, input.userWeb, source),
    android: collectAndroid(repoRoot, input.android),
    releaseNotes: collectReleaseNotes(input.releaseNotes),
    rollback: {
      sourceCommit: rollbackCommit,
      apiImage: validateImage(withPlatform(input.rollback.apiImage, platform, 'rollback.apiImage'), 'rollback.apiImage', input.rollback.sourceCommit, undefined, apiRepository),
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
