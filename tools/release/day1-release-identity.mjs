import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { assertTrackedWorktreeMatchesHead, collectFiles, scanPublicArtifact } from '../ci/user-web-dist-manifest.mjs';

export const SCHEMA = 'settleora.day1-release-identity.v1';
export const DIGEST_ALGORITHM = 'sha256(canonical-json-v1;excludes=generatedAt,identityDigest)';
export const RETENTION_DIRECTORY_TEMPLATE = '/workspace/logs/settleora-release-candidates/{source.candidateId}';

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const HEX256 = /^[0-9a-f]{64}$/u;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._/+:-]*$/u;
const RELEASE_NOTE_SUMMARY = /^[A-Za-z0-9][A-Za-z0-9 .,'()_+/-]*$/u;
const MIGRATION_FILE = /^(\d{14}_[A-Za-z0-9_]+)\.cs$/u;
const DEPENDENCY_COMPOSE_PATH = 'infra/docker-compose.truenas-lan.image.yml';
const runtimeMigrationIdsSymbol = Symbol('settleora.compiled-runtime-migration-ids');
const SENSITIVE_MATERIAL_PATTERNS = [
  /-----BEGIN [^-\r\n]*PRIVATE KEY[^-\r\n]*-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bAIza[0-9A-Za-z_-]{24,}\b/u,
  /\b(?:gh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{12,})\b/u,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u,
  /\b(?:(?:[A-Za-z_][A-Za-z0-9_]*)?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)|authorization|x-goog-api-key)\b["']?\s*[:=]\s*(?![A-Za-z_$][A-Za-z0-9_$]*\.)["']?[A-Za-z0-9._~+/-]{8,}/iu,
  /\bbearer\s+[A-Za-z0-9._~+/-]{12,}/iu,
  /["'](?:client_secret|private_key|refresh_token)["']\s*:/iu,
  /(?::_authToken|_auth|npmAuthToken)\s*[:=]\s*[^\s"']+/iu,
  /https?:\/\/[^/@\s]+:[^/@\s]+@/iu,
];

const fail = (message) => { throw new Error(message); };
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const containsSensitiveMaterial = (value) => SENSITIVE_MATERIAL_PATTERNS.some((pattern) => pattern.test(value));

export function bindCompiledMigrationIds(input, ids) {
  if (!input || typeof input !== 'object' || !Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !/^\d{14}_[A-Za-z0-9_]+$/u.test(id))) {
    fail('Compiled EF migration inventory is invalid');
  }
  Object.defineProperty(input, runtimeMigrationIdsSymbol, { value: Object.freeze([...ids]), enumerable: true });
  return input;
}

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

export function validateCandidateId(value) {
  string(value, 'source.candidateId');
  if (value === '.' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value) || value.includes('..')) {
    fail('source.candidateId must be a single safe evidence-directory name');
  }
  return value;
}

export function validatePublicationRunUrl(value, sourceCommit) {
  publicText(value, 'apiImage.publicationRunUrl');
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('apiImage.publicationRunUrl must be a canonical GitHub Actions run URL');
  }
  const match = /^\/tommytang213\/Settleora\/actions\/runs\/([1-9][0-9]*)$/u.exec(url.pathname);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.search || url.hash || !match) {
    fail('apiImage.publicationRunUrl must be a canonical GitHub Actions run URL for tommytang213/Settleora');
  }
  sha40(sourceCommit, 'source.commit');
  return { url: value, runId: match[1] };
}

export function validatePublicationRunDocument(publication, run, sourceCommit) {
  if (run?.html_url !== publication.url || run?.head_repository?.full_name !== 'tommytang213/Settleora' || run?.head_sha !== sourceCommit
    || run?.event !== 'push' || run?.head_branch !== 'main' || run?.conclusion !== 'success'
    || run?.path !== '.github/workflows/api-image-ghcr.yml') {
    fail('API image publication run provenance mismatch');
  }
  return true;
}

export function validatePublicationJobDocument(jobs, sourceCommit) {
  sha40(sourceCommit, 'source.commit');
  const matches = jobs?.jobs?.filter((job) => job?.name === 'Publish API image') ?? [];
  const buildStep = matches[0]?.steps?.find((step) => step?.name === 'Build and publish API image');
  if (jobs?.total_count !== 1 || matches.length !== 1 || matches[0]?.conclusion !== 'success' || buildStep?.conclusion !== 'success') {
    fail('API image publication job provenance mismatch');
  }
  if (!Number.isSafeInteger(matches[0].id) || matches[0].id < 1) fail('API image publication job ID is invalid');
  return matches[0].id;
}

export function validatePublicationJobLog(log, image, sourceCommit) {
  if (typeof log !== 'string' || log.length === 0 || log.includes('\0')) fail('API image publication job log must be non-empty text');
  sha40(sourceCommit, 'source.commit');
  digest(image.indexDigest, 'apiImage.indexDigest');
  const reference = `${image.repository}:sha-${sourceCommit}`;
  const pushed = new Set([...log.matchAll(/pushing manifest for\s+(\S+)@(sha256:[0-9a-f]{64})(?:\s|$)/gu)]
    .filter((match) => match[1] === reference)
    .map((match) => match[2]));
  const actionOutputs = new Set([...log.matchAll(/"containerimage\.digest":\s*"(sha256:[0-9a-f]{64})"/gu)].map((match) => match[1]));
  if (pushed.size !== 1 || !pushed.has(image.indexDigest) || actionOutputs.size !== 1 || !actionOutputs.has(image.indexDigest)) {
    fail('Authenticated API publication log digest mismatch');
  }
  return true;
}

export function validatePublicationProvenance(publication, provenance, sourceCommit) {
  const builder = provenance?.runDetails?.builder?.id;
  const vcs = provenance?.buildDefinition?.externalParameters?.request?.root?.configSource?.request?.args;
  if (typeof builder !== 'string' || !builder.startsWith(`${publication.url}/attempts/`) || !/^[1-9][0-9]*$/u.test(builder.slice(`${publication.url}/attempts/`.length)) || vcs?.['vcs:revision'] !== sourceCommit || vcs?.['vcs:source'] !== 'https://github.com/tommytang213/Settleora') {
    fail('API image publication provenance attestation mismatch');
  }
  return true;
}

function publicText(value, label) {
  string(value, label);
  if (/(?:\/home\/|\/tmp\/|\\Users\\)/u.test(value) || containsSensitiveMaterial(value)) {
    fail(`${label} contains host-specific or potentially sensitive material`);
  }
  return value;
}

function releaseNoteSummary(value, label) {
  publicText(value, label);
  if (value.length > 500 || !RELEASE_NOTE_SUMMARY.test(value)) {
    fail(`${label} must be bounded ordinary single-line release-summary text`);
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

function exactRegularFile(candidate, label, allowedRoot, maxBytes = 256 * 1024 * 1024) {
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
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile()) fail(`${label} must be a regular file`);
    if (metadata.size < 0 || metadata.size > maxBytes) fail(`${label} exceeds its evidence size limit`);
    const chunks = [];
    let total = 0;
    const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, Math.max(1, maxBytes)));
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      total += count;
      if (total > maxBytes) fail(`${label} exceeds its evidence size limit`);
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    const bytes = Buffer.concat(chunks, total);
    const current = lstatSync(absolute);
    if (current.isSymbolicLink() || current.dev !== metadata.dev || current.ino !== metadata.ino || realpathSync(absolute) !== absolute) {
      fail(`${label} changed or resolved through indirection while being read`);
    }
    if (bytes.length !== metadata.size) fail(`${label} changed size while being read`);
    return { absolute, bytes, size: bytes.length };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function git(root, args) {
  return execFileSync('/usr/bin/git', ['--no-replace-objects', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function committedTrackedFile(repoRoot, relative, label, sourceCommit) {
  safeLabel(relative, `${label} path`);
  sha40(sourceCommit, `${label} source commit`);
  const committed = execFileSync('/usr/bin/git', ['--no-replace-objects', 'show', `${sourceCommit}:${relative}`], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 258 * 1024 * 1024,
  });
  const oid = git(repoRoot, ['rev-parse', `${sourceCommit}:${relative}`]);
  const actualOid = createHash('sha1').update(`blob ${committed.length}\0`).update(committed).digest('hex');
  if (actualOid !== oid) fail(`${label} committed Git blob identity mismatch`);
  return { bytes: committed, size: committed.length };
}

function exactTrackedFile(repoRoot, relative, label, sourceCommit) {
  const file = exactRegularFile(path.join(repoRoot, relative), label, repoRoot);
  const committed = committedTrackedFile(repoRoot, relative, label, sourceCommit);
  if (!file.bytes.equals(committed.bytes)) fail(`${label} does not match the captured source blob`);
  return file;
}

function androidSourceMetadata(repoRoot, sourceCommit, requireExactCheckout = false) {
  const trackedFile = requireExactCheckout ? exactTrackedFile : committedTrackedFile;
  const pubspec = trackedFile(repoRoot, 'apps/mobile/pubspec.yaml', 'mobile pubspec', sourceCommit).bytes.toString('utf8');
  const version = /^version:\s*([^+\s]+)\+(\d+)\s*$/gmu;
  const versionMatches = [...pubspec.matchAll(version)];
  if (versionMatches.length !== 1) fail('Mobile semantic version/build is missing or ambiguous in pubspec');
  const gradle = trackedFile(repoRoot, 'apps/mobile/android/app/build.gradle.kts', 'Android release config', sourceCommit).bytes.toString('utf8');
  const applicationIds = [...gradle.matchAll(/applicationId\s*=\s*"([^"]+)"/gu)];
  if (applicationIds.length !== 1 || applicationIds[0][1] !== 'com.example.mobile') fail('Android application ID mismatch');
  if (!/release\s*\{[\s\S]*?signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)/u.test(gradle)) {
    fail('Android signing state does not match the bounded debug-signing observation');
  }
  return {
    semanticVersion: versionMatches[0][1],
    buildNumber: versionMatches[0][2],
    applicationId: applicationIds[0][1],
    signingState: 'debug-signing-non-store-ready',
  };
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
    candidateId: validateCandidateId(expected.candidateId),
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
  ));
  if (matches.length !== 1 || matches[0].digest !== image.platformDigest) fail(`${label} registry platform/digest relationship mismatch`);
  return true;
}

export function validateRegistryRevision(image, imageDocument, expectedRevision, label = 'registry image') {
  const revision = imageDocument?.config?.Labels?.['org.opencontainers.image.revision'];
  if (revision !== expectedRevision || revision !== image.ociRevision) fail(`${label} registry OCI revision mismatch`);
  return true;
}

export function validateSelectedPlatformDocument(image, record, platform, label = 'registry image') {
  if (record?.manifest?.digest !== image.platformDigest || record?.image?.os !== platform.os
    || record?.image?.architecture !== platform.architecture || record?.image?.rootfs?.type !== 'layers'
    || !Array.isArray(record.image.rootfs.diff_ids) || record.image.rootfs.diff_ids.length === 0
    || !record.image.config || typeof record.image.config !== 'object' || Array.isArray(record.image.config)) {
    fail(`${label} selected platform manifest is unavailable or not a runnable ${platform.os}/${platform.architecture} image`);
  }
  return true;
}

function migrationEntriesAtCommit(repoRoot, capturedCommit) {
  const relativeRoot = 'services/api/src/Settleora.Api/Persistence/Migrations';
  sha40(capturedCommit, 'migration captured source commit');
  const names = new TextDecoder('utf-8', { fatal: true }).decode(execFileSync('/usr/bin/git', ['--no-replace-objects', 'ls-tree', '-r', '-z', '--name-only', `${capturedCommit}:${relativeRoot}`], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] }))
    .split('\0').filter(Boolean);
  const unexpected = names.filter((name) => {
    const basename = path.posix.basename(name);
    return name.endsWith('.cs') && basename !== 'SettleoraDbContextModelSnapshot.cs' && !/^(\d{14}_[A-Za-z0-9_]+)(?:\.Designer)?\.cs$/u.test(basename);
  });
  if (unexpected.length) fail(`Unrecognized migration source files: ${unexpected.join(', ')}`);
  const ids = names
    .filter((name) => !name.endsWith('.Designer.cs'))
    .map((name) => MIGRATION_FILE.exec(path.posix.basename(name))?.[1])
    .filter(Boolean)
    .sort();
  if (ids.length === 0) fail('No repository migrations found');
  if (new Set(ids).size !== ids.length) fail('Duplicate migration IDs exist in repository source');
  return ids.map((id) => ({
    id,
    files: names.filter((name) => path.posix.basename(name) === `${id}.cs` || path.posix.basename(name) === `${id}.Designer.cs`).sort().map((name) => {
      const relative = `${relativeRoot}/${name}`;
      const file = committedTrackedFile(repoRoot, relative, `migration ${id}`, capturedCommit);
      return { path: relative, sha256: sha256(file.bytes), size: file.size };
    }),
  }));
}

export function collectMigrations(repoRoot, expectedDigest, capturedCommit = git(repoRoot, ['rev-parse', 'HEAD']), compiledRuntimeIds) {
  const entries = migrationEntriesAtCommit(repoRoot, capturedCommit);
  const ids = entries.map((entry) => entry.id);
  if (!Array.isArray(compiledRuntimeIds) || compiledRuntimeIds.length === 0) fail('Compiled EF runtime migration inventory is required');
  const runtimeIds = new Set(compiledRuntimeIds);
  if (runtimeIds.size !== compiledRuntimeIds.length) fail('Duplicate EF runtime migration IDs exist in compiled metadata');
  if (canonicalJson([...runtimeIds].sort()) !== canonicalJson(ids)) fail('Migration filename inventory differs from EF runtime migration attributes');
  for (const entry of entries) {
    for (const file of entry.files) exactTrackedFile(repoRoot, file.path, `migration ${entry.id}`, capturedCommit);
  }
  const setSha256 = sha256(canonicalJson(entries));
  if (expectedDigest && expectedDigest !== setSha256) fail(`Migration-set digest mismatch: expected ${expectedDigest}, found ${setSha256}`);
  return {
    stateClaim: 'repository-source-only-not-applied',
    runtimeInventory: 'compiled-ef-metadata-v1',
    ordering: 'migration-id-byte-order-v1',
    setDigestAlgorithm: 'sha256(canonical-json-v1:migration-entries)',
    setSha256,
    count: entries.length,
    entries,
  };
}

function validateImage(image, label, sourceCommit, expectedTag, expectedRepository) {
  const roleKeys = sourceCommit === undefined
    ? ['repository', 'configuredTag', 'indexDigest', 'platformDigest', 'os', 'architecture', 'name', 'sourceComposePath']
    : ['repository', 'configuredTag', 'indexDigest', 'platformDigest', 'os', 'architecture', 'ociRevision', 'publicationRunUrl'];
  assertKeys(image, roleKeys, label);
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
    if (image.publicationRunUrl !== undefined) validatePublicationRunUrl(image.publicationRunUrl, sourceCommit);
  }
  return image;
}

function configuredImage(repoRoot, sourcePath, service, capturedCommit, requireWorktree = true) {
  safeLabel(sourcePath, 'dependency sourceComposePath');
  const reader = requireWorktree ? exactTrackedFile : committedTrackedFile;
  const lines = reader(repoRoot, sourcePath, 'dependency Compose source', capturedCommit).bytes.toString('utf8').split(/\r?\n/u);
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
  assertKeys(manifest, ['schema', 'source', 'dependencyLock', 'buildTools', 'artifact', 'publicArtifactChecks'], 'userWeb retained manifest');
  assertKeys(manifest.source, ['commit', 'tree'], 'userWeb retained source');
  assertKeys(manifest.dependencyLock, ['path', 'sha256', 'lockfileVersion'], 'userWeb retained dependencyLock');
  assertKeys(manifest.artifact, ['root', 'treeDigestAlgorithm', 'treeSha256', 'fileCount', 'totalBytes', 'files'], 'userWeb retained artifact');
  assertKeys(manifest.publicArtifactChecks, ['symlinksRejected', 'sourceMapsRejected', 'sensitiveMaterialScan'], 'userWeb retained publicArtifactChecks');
  if (manifest.schema !== 'settleora.user-web-dist-manifest.v1') fail('Unsupported user-web manifest schema');
  if (manifest.source?.commit !== source.commit || manifest.source?.tree !== source.tree) fail('User-web source/tree mismatch');
  const lock = exactTrackedFile(repoRoot, 'apps/web-user/package-lock.json', 'userWeb dependency lock', source.commit);
  if (manifest.dependencyLock?.path !== 'apps/web-user/package-lock.json' || manifest.dependencyLock?.sha256 !== sha256(lock.bytes)) {
    fail('User-web dependency lock mismatch');
  }
  let lockfileVersion;
  try {
    lockfileVersion = JSON.parse(lock.bytes).lockfileVersion;
  } catch {
    fail('User-web dependency lock is not valid JSON');
  }
  if (manifest.dependencyLock?.lockfileVersion !== lockfileVersion) fail('User-web dependency lockfile version mismatch');
  hexDigest(manifest.artifact?.treeSha256, 'userWeb treeSha256');
  hexDigest(manifest.dependencyLock?.sha256, 'userWeb dependency lock SHA-256');
  if (!Number.isSafeInteger(manifest.artifact.fileCount) || manifest.artifact.fileCount < 1) fail('Invalid user-web file count');
  if (!Number.isSafeInteger(manifest.artifact.totalBytes) || manifest.artifact.totalBytes < 1) fail('Invalid user-web byte count');
  if (manifest.artifact.treeDigestAlgorithm !== 'sha256(canonical-file-records-v1)' || !Array.isArray(manifest.artifact.files)) {
    fail('User-web canonical file records are required');
  }
  if (safeLabel(manifest.artifact.root, 'userWeb artifact root') !== 'apps/web-user/dist') fail('User-web artifact root mismatch');
  if (!manifest.buildTools || typeof manifest.buildTools !== 'object' || manifest.publicArtifactChecks?.symlinksRejected !== true || manifest.publicArtifactChecks?.sourceMapsRejected !== true || manifest.publicArtifactChecks?.sensitiveMaterialScan !== 'passed') {
    fail('User-web canonical build/security evidence is incomplete');
  }
  assertKeys(manifest.buildTools, ['node', 'npm', 'typescript', 'vite'], 'userWeb buildTools');
  for (const name of ['node', 'npm', 'typescript', 'vite']) string(manifest.buildTools[name], `userWeb buildTools.${name}`);
  const sourceLock = JSON.parse(lock.bytes);
  for (const name of ['typescript', 'vite']) {
    if (manifest.buildTools[name] !== sourceLock.packages?.[`node_modules/${name}`]?.version) fail(`User-web ${name} build-tool version mismatch`);
  }
  const distRoot = path.join(path.dirname(file.absolute), 'dist');
  const canonicalFiles = collectFiles(distRoot);
  scanPublicArtifact(canonicalFiles);
  const declared = manifest.artifact.files.map((entry) => {
    assertKeys(entry, ['path', 'size', 'sha256'], 'userWeb retained artifact file');
    safeLabel(entry.path, 'userWeb artifact path');
    return entry;
  }).sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
  const actualPaths = canonicalFiles.map((entry) => entry.path);
  if (canonicalJson(actualPaths) !== canonicalJson(declared.map((entry) => entry.path))) fail('User-web manifest file list is incomplete');
  const records = canonicalFiles.map((artifact, index) => {
    const record = { path: artifact.path, size: artifact.size, sha256: sha256(artifact.contents) };
    if (canonicalJson(record) !== canonicalJson(declared[index])) fail(`User-web artifact identity mismatch: ${artifact.path}`);
    return record;
  });
  if (records.length !== manifest.artifact.fileCount || records.reduce((sum, entry) => sum + entry.size, 0) !== manifest.artifact.totalBytes) {
    fail('User-web artifact aggregate mismatch');
  }
  const treeInput = records.map((entry) => `${entry.sha256}  ${entry.size}  ${entry.path}\n`).join('');
  if (sha256(treeInput) !== manifest.artifact.treeSha256) fail('User-web tree digest mismatch');
  return {
    schema: manifest.schema,
    source: { commit: source.commit, tree: source.tree },
    dependencyLock: { path: manifest.dependencyLock.path, sha256: manifest.dependencyLock.sha256, lockfileVersion: manifest.dependencyLock.lockfileVersion },
    buildTools: { ...manifest.buildTools },
    artifact: {
      treeDigestAlgorithm: manifest.artifact.treeDigestAlgorithm,
      treeSha256: manifest.artifact.treeSha256,
      fileCount: manifest.artifact.fileCount,
      totalBytes: manifest.artifact.totalBytes,
    },
  };
}

function collectAndroid(repoRoot, input, source) {
  const apk = exactRegularFile(input.apkPath, 'Android APK', input.evidenceRoot);
  const aab = exactRegularFile(input.aabPath, 'Android AAB', input.evidenceRoot);
  const mapping = exactRegularFile(input.mappingPath, 'Android R8 mapping', input.evidenceRoot, 128 * 1024 * 1024);
  if (mapping.size === 0 || !mapping.bytes.toString('utf8').startsWith('# compiler: R8\n')) fail('Android R8 mapping must be a non-empty R8 mapping');
  if (hexDigest(input.embeddedR8MappingSha256, 'Android embedded R8 mapping SHA-256') !== sha256(mapping.bytes)) fail('Android R8 mapping does not match the signed AAB');
  const metadataFile = exactRegularFile(input.outputMetadataPath, 'Android output metadata', input.evidenceRoot);
  const metadata = JSON.parse(metadataFile.bytes);
  const provenanceFile = exactRegularFile(input.buildProvenancePath, 'Android build provenance', input.evidenceRoot);
  const provenance = JSON.parse(provenanceFile.bytes);
  assertKeys(provenance, ['schema', 'source', 'commands', 'toolchains', 'artifacts'], 'Android build provenance');
  assertKeys(provenance.source, ['commit', 'tree'], 'Android build provenance source');
  assertKeys(provenance.artifacts, ['apk', 'aab', 'r8MappingSha256'], 'Android build provenance artifacts');
  const { commit, tree } = source;
  if (provenance.schema !== 'settleora.android-exact-source-build.v1' || provenance.source?.commit !== commit || provenance.source?.tree !== tree) {
    fail('Android build provenance source mismatch');
  }
  if (canonicalJson(provenance.commands) !== canonicalJson(['flutter clean', 'flutter build apk --release', 'flutter build appbundle --release'])) {
    fail('Android build provenance command mismatch');
  }
  assertKeys(provenance.toolchains, ['flutter', 'android'], 'Android build provenance toolchains');
  for (const [name, inventory] of Object.entries(provenance.toolchains)) {
    assertKeys(inventory, ['algorithm', 'sha256', 'fileCount', 'directoryCount', 'symlinkCount', 'totalBytes'], `Android ${name} toolchain inventory`);
    if (inventory.algorithm !== 'sha256(canonical-stable-toolchain-tree-v1)') fail(`Android ${name} toolchain inventory algorithm mismatch`);
    hexDigest(inventory.sha256, `Android ${name} toolchain inventory SHA-256`);
    if (!Number.isSafeInteger(inventory.fileCount) || inventory.fileCount < 1 || !Number.isSafeInteger(inventory.totalBytes) || inventory.totalBytes < 1) {
      fail(`Android ${name} toolchain inventory is invalid`);
    }
  }
  const element = metadata.elements?.find((candidate) => candidate.outputFile === path.basename(input.apkPath));
  if (!element) fail('Android APK is absent from output metadata');
  const sourceMetadata = androidSourceMetadata(repoRoot, commit, true);
  if (element.versionName !== sourceMetadata.semanticVersion || String(element.versionCode) !== sourceMetadata.buildNumber) fail('Android artifact version/build mismatch');
  if (metadata.applicationId !== sourceMetadata.applicationId) fail('Android application ID mismatch');
  const result = {
    source: { commit, tree },
    semanticVersion: sourceMetadata.semanticVersion,
    buildNumber: sourceMetadata.buildNumber,
    applicationId: sourceMetadata.applicationId,
    r8Minified: true,
    r8MappingSha256: sha256(mapping.bytes),
    signingState: sourceMetadata.signingState,
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
  releaseNoteSummary(input.candidateSummary, 'releaseNotes.candidateSummary');
  if (file.size === 0) fail('Release-note evidence must not be empty');
  if (containsSensitiveMaterial(file.bytes.toString('utf8'))) fail('Release-note evidence contains potentially sensitive material');
  return { source: input.source, sha256: sha256(file.bytes), size: file.size, candidateSummary: input.candidateSummary };
}

export function validateManifest(manifest, repoRoot) {
  assertKeys(manifest, ['schema', 'identityDigestAlgorithm', 'identityDigest', 'generatedAt', 'source', 'apiImage', 'dependencyImages', 'migrations', 'userWeb', 'android', 'releaseNotes', 'rollback', 'retention'], 'manifest');
  if (manifest.schema !== SCHEMA) fail('Unsupported Day 1 release-identity schema');
  if (manifest.identityDigestAlgorithm !== DIGEST_ALGORITHM) fail('Unsupported identity-digest algorithm');
  utcTimestamp(manifest.generatedAt, 'generatedAt');
  sha40(manifest.source?.commit, 'source.commit');
  assertKeys(manifest.source, ['repository', 'commit', 'tree', 'candidateId', 'exactSource', 'cleanTrackedCheckout'], 'source');
  if (manifest.source.repository !== 'tommytang213/Settleora') fail('Source repository mismatch');
  validateCandidateId(manifest.source.candidateId);
  sha40(manifest.source?.tree, 'source.tree');
  if (manifest.source.exactSource !== true || manifest.source.cleanTrackedCheckout !== true) fail('Source exact/clean assertions are required');
  if (!repoRoot) fail('Repository context is required to validate source and rollback identity');
  try {
    git(repoRoot, ['cat-file', '-e', `${manifest.source.commit}^{commit}`]);
    if (git(repoRoot, ['rev-parse', `${manifest.source.commit}^{tree}`]) !== manifest.source.tree) fail('Source tree does not belong to the source commit');
  } catch (error) {
    if (error instanceof Error && error.message === 'Source tree does not belong to the source commit') throw error;
    fail('Source commit must exist in the repository context');
  }
  const apiRepository = 'ghcr.io/tommytang213/settleora-api';
  validateImage(manifest.apiImage, 'apiImage', manifest.source.commit, undefined, apiRepository);
  if (manifest.apiImage.publicationRunUrl === undefined) fail('API image publication run provenance is required');
  if (!Array.isArray(manifest.dependencyImages) || manifest.dependencyImages.length !== 3) fail('Exactly three dependency images are required');
  const canonicalDependencyOrder = ['caddy', 'postgres', 'rabbitmq'];
  if (manifest.dependencyImages.some((image, index) => image.name !== canonicalDependencyOrder[index])) fail('Dependency images must use canonical caddy, postgres, rabbitmq order');
  const expectedDependencies = new Set(['caddy', 'postgres', 'rabbitmq']);
  const dependencyRepositories = { postgres: 'docker.io/library/postgres', rabbitmq: 'docker.io/library/rabbitmq', caddy: 'docker.io/library/caddy' };
  const dependencyServices = { postgres: 'postgres', rabbitmq: 'rabbitmq', caddy: 'ingress' };
  for (const image of manifest.dependencyImages) {
    if (!expectedDependencies.delete(image.name)) fail(`Unexpected or duplicate dependency image ${image.name}`);
    if (image.sourceComposePath !== DEPENDENCY_COMPOSE_PATH) fail(`dependencyImages.${image.name} source Compose path mismatch`);
    const expectedTag = configuredImage(repoRoot, image.sourceComposePath, dependencyServices[image.name], manifest.source.commit, false);
    validateImage(image, `dependencyImages.${image.name}`, undefined, expectedTag, dependencyRepositories[image.name]);
    if (image.os !== manifest.apiImage.os || image.architecture !== manifest.apiImage.architecture) fail(`dependencyImages.${image.name} platform mismatch`);
    safeLabel(image.sourceComposePath, `dependencyImages.${image.name}.sourceComposePath`);
  }
  if (expectedDependencies.size) fail('Missing dependency image');
  if (manifest.migrations?.stateClaim !== 'repository-source-only-not-applied') fail('Migrations must not be described as applied');
  assertKeys(manifest.migrations, ['stateClaim', 'runtimeInventory', 'ordering', 'setDigestAlgorithm', 'setSha256', 'count', 'entries', 'source'], 'migrations');
  assertKeys(manifest.migrations.source, ['commit', 'tree'], 'migrations.source');
  if (manifest.migrations.runtimeInventory !== 'compiled-ef-metadata-v1' || manifest.migrations.ordering !== 'migration-id-byte-order-v1' || manifest.migrations.setDigestAlgorithm !== 'sha256(canonical-json-v1:migration-entries)') fail('Migration algorithm mismatch');
  if (manifest.migrations.source.commit !== manifest.source.commit || manifest.migrations.source.tree !== manifest.source.tree) fail('Migration source mismatch');
  if (!Array.isArray(manifest.migrations.entries) || manifest.migrations.entries.length < 1
    || !Number.isSafeInteger(manifest.migrations.count) || manifest.migrations.count < 1) fail('Migration entries must be a non-empty array with a positive count');
  let priorMigration = '';
  for (const [index, entry] of manifest.migrations.entries.entries()) {
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
  const sourceMigrationEntries = migrationEntriesAtCommit(repoRoot, manifest.source.commit);
  if (canonicalJson(manifest.migrations.entries) !== canonicalJson(sourceMigrationEntries)) fail('Migration entries do not match the captured source commit');
  if (manifest.userWeb?.schema !== 'settleora.user-web-dist-manifest.v1') fail('Canonical R02 user-web schema is required');
  assertKeys(manifest.userWeb, ['schema', 'source', 'dependencyLock', 'buildTools', 'artifact'], 'userWeb');
  assertKeys(manifest.userWeb.source, ['commit', 'tree'], 'userWeb.source');
  assertKeys(manifest.userWeb.dependencyLock, ['path', 'sha256', 'lockfileVersion'], 'userWeb.dependencyLock');
  assertKeys(manifest.userWeb.buildTools, ['node', 'npm', 'typescript', 'vite'], 'userWeb.buildTools');
  assertKeys(manifest.userWeb.artifact, ['treeDigestAlgorithm', 'treeSha256', 'fileCount', 'totalBytes'], 'userWeb.artifact');
  if (manifest.userWeb.dependencyLock.path !== 'apps/web-user/package-lock.json' || manifest.userWeb.artifact.treeDigestAlgorithm !== 'sha256(canonical-file-records-v1)') fail('User-web algorithm/path mismatch');
  hexDigest(manifest.userWeb.dependencyLock.sha256, 'userWeb.dependencyLock.sha256');
  hexDigest(manifest.userWeb.artifact.treeSha256, 'userWeb.artifact.treeSha256');
  if (!Number.isSafeInteger(manifest.userWeb.artifact.fileCount) || manifest.userWeb.artifact.fileCount < 1 || !Number.isSafeInteger(manifest.userWeb.artifact.totalBytes) || manifest.userWeb.artifact.totalBytes < 1) fail('User-web aggregate values are invalid');
  if (manifest.userWeb.source?.commit !== manifest.source.commit || manifest.userWeb.source?.tree !== manifest.source.tree) fail('User-web source/tree mismatch');
  const sourceWebLock = committedTrackedFile(repoRoot, 'apps/web-user/package-lock.json', 'userWeb dependency lock', manifest.source.commit);
  let sourceLockfileVersion;
  try {
    sourceLockfileVersion = JSON.parse(sourceWebLock.bytes).lockfileVersion;
  } catch {
    fail('Captured user-web dependency lock is not valid JSON');
  }
  if (manifest.userWeb.dependencyLock.sha256 !== sha256(sourceWebLock.bytes)
    || manifest.userWeb.dependencyLock.lockfileVersion !== sourceLockfileVersion) fail('User-web dependency lock does not match the captured source commit');
  const sourceWebPackageLock = JSON.parse(sourceWebLock.bytes);
  for (const name of ['node', 'npm', 'typescript', 'vite']) string(manifest.userWeb.buildTools[name], `userWeb.buildTools.${name}`);
  for (const name of ['typescript', 'vite']) {
    if (manifest.userWeb.buildTools[name] !== sourceWebPackageLock.packages?.[`node_modules/${name}`]?.version) fail(`userWeb.buildTools.${name} does not match the captured source lock`);
  }
  if (manifest.android?.source?.commit !== manifest.source.commit || manifest.android?.source?.tree !== manifest.source.tree) fail('Android source/tree mismatch');
  assertKeys(manifest.android, ['source', 'semanticVersion', 'buildNumber', 'applicationId', 'r8Minified', 'r8MappingSha256', 'signingState', 'signerCertificateSha256', 'apk', 'aab', 'buildProvenanceSha256'], 'android');
  assertKeys(manifest.android.source, ['commit', 'tree'], 'android.source');
  assertKeys(manifest.android.apk, ['path', 'size', 'sha256'], 'android.apk');
  assertKeys(manifest.android.aab, ['path', 'size', 'sha256'], 'android.aab');
  if (manifest.android.apk.path !== 'apps/mobile/build/app/outputs/flutter-apk/app-release.apk'
    || manifest.android.aab.path !== 'apps/mobile/build/app/outputs/bundle/release/app-release.aab') fail('Android artifact paths must be canonical release outputs');
  for (const key of ['semanticVersion', 'buildNumber', 'applicationId']) string(manifest.android[key], `android.${key}`);
  const sourceAndroid = androidSourceMetadata(repoRoot, manifest.source.commit);
  for (const key of ['semanticVersion', 'buildNumber', 'applicationId', 'signingState']) {
    if (manifest.android[key] !== sourceAndroid[key]) fail(`android.${key} does not match the captured source commit`);
  }
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
  releaseNoteSummary(manifest.releaseNotes.candidateSummary, 'releaseNotes.candidateSummary');
  assertKeys(manifest.rollback, ['sourceCommit', 'apiImage', 'artifactAvailabilityProvesDatabaseSchemaFileRollbackSafety', 'safetyCaveat'], 'rollback');
  if (manifest.rollback.safetyCaveat !== 'Artifact availability does not prove database, schema, or file rollback safety.') fail('Rollback safety caveat text is required');
  validateImage(manifest.rollback.apiImage, 'rollback.apiImage', manifest.rollback.sourceCommit, undefined, apiRepository);
  if (manifest.rollback.apiImage.os !== manifest.apiImage.os || manifest.rollback.apiImage.architecture !== manifest.apiImage.architecture) fail('Rollback API image platform mismatch');
  if (manifest.rollback.apiImage.publicationRunUrl === undefined) fail('Rollback API image publication run provenance is required');
  try {
    git(repoRoot, ['cat-file', '-e', `${manifest.rollback.sourceCommit}^{commit}`]);
    if (manifest.rollback.sourceCommit === manifest.source.commit) fail('Rollback source must be prior to the candidate source');
    git(repoRoot, ['merge-base', '--is-ancestor', manifest.rollback.sourceCommit, manifest.source.commit]);
  } catch (error) {
    if (error instanceof Error && error.message === 'Rollback source must be prior to the candidate source') throw error;
    fail('Rollback source must be an existing prior ancestor of the candidate source');
  }
  if (manifest.retention?.canonicalEvidenceDirectory !== RETENTION_DIRECTORY_TEMPLATE) {
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
  assertKeys(input.rollback.apiImage, ['repository', 'configuredTag', 'indexDigest', 'platformDigest', 'ociRevision', 'publicationRunUrl'], 'input.rollback.apiImage');
  assertKeys(input.retention, ['canonicalEvidenceDirectory', 'policy', 'apiRegistryIdentity'], 'input.retention');
  if (!Array.isArray(input.dependencyImages) || input.dependencyImages.length !== 3) fail('Input requires exactly three dependency images');
}

export function buildManifest(repoRoot, input) {
  assertInput(input);
  const source = collectSource(repoRoot, input.source);
  if (input.retention.canonicalEvidenceDirectory !== `/workspace/logs/settleora-release-candidates/${source.candidateId}`) {
    fail('Retention input directory must exactly bind the candidate ID under the approved external root');
  }
  const platform = { os: string(input.platform?.os, 'platform.os'), architecture: string(input.platform?.architecture, 'platform.architecture') };
  const apiRepository = 'ghcr.io/tommytang213/settleora-api';
  const apiImage = validateImage(withPlatform(input.apiImage, platform, 'apiImage'), 'apiImage', source.commit, undefined, apiRepository);
  const services = { postgres: 'postgres', rabbitmq: 'rabbitmq', caddy: 'ingress' };
  const repositories = { postgres: 'docker.io/library/postgres', rabbitmq: 'docker.io/library/rabbitmq', caddy: 'docker.io/library/caddy' };
  const dependencyImages = [...input.dependencyImages]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((image) => {
      if (image.sourceComposePath !== DEPENDENCY_COMPOSE_PATH) fail(`dependencyImages.${image.name} source Compose path mismatch`);
      const expectedTag = configuredImage(repoRoot, image.sourceComposePath, services[image.name], source.commit);
      return validateImage(withPlatform(image, platform, `dependencyImages.${image.name}`), `dependencyImages.${image.name}`, undefined, expectedTag, repositories[image.name]);
    });
  const migrations = collectMigrations(repoRoot, input.expectedMigrationSetSha256, source.commit, input[runtimeMigrationIdsSymbol]);
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
    android: collectAndroid(repoRoot, input.android, source),
    releaseNotes: collectReleaseNotes(input.releaseNotes),
    rollback: {
      sourceCommit: rollbackCommit,
      apiImage: validateImage(withPlatform(input.rollback.apiImage, platform, 'rollback.apiImage'), 'rollback.apiImage', input.rollback.sourceCommit, undefined, apiRepository),
      artifactAvailabilityProvesDatabaseSchemaFileRollbackSafety: false,
      safetyCaveat: 'Artifact availability does not prove database, schema, or file rollback safety.',
    },
    retention: {
      canonicalEvidenceDirectory: RETENTION_DIRECTORY_TEMPLATE,
      policy: publicText(input.retention.policy, 'retention.policy'),
      apiRegistryIdentity: publicText(input.retention.apiRegistryIdentity, 'retention.apiRegistryIdentity'),
    },
  };
  manifest.identityDigest = computeIdentityDigest(manifest);
  return validateManifest(manifest, repoRoot);
}
