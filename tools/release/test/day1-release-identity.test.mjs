import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildManifest,
  canonicalJson,
  computeIdentityDigest,
  sha256,
  validateRegistryDocument,
  validateRegistryRevision,
  validateManifest,
} from '../day1-release-identity.mjs';

const d = (character) => `sha256:${character.repeat(64)}`;

function write(root, relative, contents) {
  const absolute = path.join(root, relative);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
  return absolute;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'release-identity-'));
  const evidenceRoot = mkdtempSync(path.join(tmpdir(), 'release-identity-evidence-'));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(evidenceRoot, { recursive: true, force: true });
  });
  git(root, ['init', '--quiet']);
  write(root, 'infra/docker-compose.truenas-lan.image.yml', [
    'services:',
    '  ingress:',
    '    image: caddy:2.11.4-alpine',
    '  postgres:',
    '    image: postgres:16-alpine',
    '  rabbitmq:',
    '    image: rabbitmq:3.13-management-alpine',
    '',
  ].join('\n'));
  const migrationRoot = 'services/api/src/Settleora.Api/Persistence/Migrations';
  write(root, `${migrationRoot}/20260101000000_Initial.cs`, 'migration\n');
  write(root, `${migrationRoot}/20260101000000_Initial.Designer.cs`, 'designer\n');
  write(root, `${migrationRoot}/20260102000000_SourceOnly.cs`, 'source-only migration\n');
  write(root, 'apps/web-user/package-lock.json', '{"lockfileVersion":3}\n');
  write(root, 'apps/mobile/pubspec.yaml', 'version: 1.2.3+45\n');
  write(root, 'apps/mobile/android/app/build.gradle.kts', [
    'android {',
    '  defaultConfig { applicationId = "com.example.mobile" }',
    '  buildTypes { release { isMinifyEnabled = true; signingConfig = signingConfigs.getByName("debug") } }',
    '}',
    '',
  ].join('\n'));
  git(root, ['add', 'infra/docker-compose.truenas-lan.image.yml', migrationRoot, 'apps/web-user/package-lock.json', 'apps/mobile/pubspec.yaml', 'apps/mobile/android/app/build.gradle.kts']);
  git(root, ['-c', 'user.name=Settleora Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  const commit = git(root, ['rev-parse', 'HEAD']);
  const tree = git(root, ['rev-parse', 'HEAD^{tree}']);

  const apkPath = write(evidenceRoot, 'app-release.apk', 'apk bytes\n');
  const aabPath = write(evidenceRoot, 'app-release.aab', 'aab bytes\n');
  const mappingPath = write(evidenceRoot, 'mapping.txt', 'minified mapping\n');
  const outputMetadataPath = write(evidenceRoot, 'output-metadata.json', JSON.stringify({
    applicationId: 'com.example.mobile',
    elements: [{ outputFile: 'app-release.apk', versionName: '1.2.3', versionCode: 45 }],
  }));
  const webFile = write(evidenceRoot, 'dist/index.html', '<!doctype html>\n');
  const webRecord = { path: 'index.html', size: readFileSync(webFile).length, sha256: sha256(readFileSync(webFile)) };
  const lockBytes = readFileSync(path.join(root, 'apps/web-user/package-lock.json'));
  const webManifestPath = write(evidenceRoot, 'user-web-dist-manifest.json', canonicalJson({
    schema: 'settleora.user-web-dist-manifest.v1',
    source: { commit, tree },
    dependencyLock: { path: 'apps/web-user/package-lock.json', sha256: sha256(lockBytes), lockfileVersion: 3 },
    artifact: {
      treeDigestAlgorithm: 'sha256(canonical-file-records-v1)',
      treeSha256: sha256(`${webRecord.sha256}  ${webRecord.size}  ${webRecord.path}\n`),
      fileCount: 1,
      totalBytes: webRecord.size,
      files: [webRecord],
    },
  }));
  const notesPath = write(evidenceRoot, 'release-notes.md', '# Candidate\nBounded test evidence.\n');
  const buildProvenancePath = write(evidenceRoot, 'build-provenance.json', canonicalJson({
    schema: 'settleora.android-exact-source-build.v1', source: { commit, tree },
    commands: ['flutter clean', 'flutter build apk --release', 'flutter build appbundle --release'],
    artifacts: {
      apk: { path: 'apps/mobile/build/app/outputs/flutter-apk/app-release.apk', size: readFileSync(apkPath).length, sha256: sha256(readFileSync(apkPath)) },
      aab: { path: 'apps/mobile/build/app/outputs/bundle/release/app-release.aab', size: readFileSync(aabPath).length, sha256: sha256(readFileSync(aabPath)) },
      r8MappingSha256: sha256(readFileSync(mappingPath)),
    },
  }));
  const input = {
    generatedAt: '2026-09-11T12:00:00Z',
    platform: { os: 'linux', architecture: 'amd64' },
    source: { repository: 'tommytang213/Settleora', commit, tree, candidateId: `day1-${commit.slice(0, 12)}` },
    apiImage: {
      repository: 'ghcr.io/tommytang213/settleora-api',
      configuredTag: `sha-${commit}`,
      indexDigest: d('a'),
      platformDigest: d('b'),
      ociRevision: commit,
      publicationRunUrl: 'https://github.com/tommytang213/Settleora/actions/runs/1',
    },
    dependencyImages: [
      { name: 'postgres', repository: 'docker.io/library/postgres', configuredTag: 'postgres:16-alpine', indexDigest: d('c'), platformDigest: d('d'), sourceComposePath: 'infra/docker-compose.truenas-lan.image.yml' },
      { name: 'rabbitmq', repository: 'docker.io/library/rabbitmq', configuredTag: 'rabbitmq:3.13-management-alpine', indexDigest: d('e'), platformDigest: d('f'), sourceComposePath: 'infra/docker-compose.truenas-lan.image.yml' },
      { name: 'caddy', repository: 'docker.io/library/caddy', configuredTag: 'caddy:2.11.4-alpine', indexDigest: d('0'), platformDigest: d('1'), sourceComposePath: 'infra/docker-compose.truenas-lan.image.yml' },
    ],
    userWeb: { evidenceRoot, manifestPath: webManifestPath },
    android: {
      evidenceRoot,
      apkPath,
      aabPath,
      mappingPath,
      outputMetadataPath,
      buildProvenancePath,
      signerCertificateSha256: '3'.repeat(64),
    },
    releaseNotes: { evidenceRoot, path: notesPath, source: 'bounded-input/release-notes.md', candidateSummary: 'Fixture candidate only.' },
    rollback: {
      sourceCommit: '4'.repeat(40),
      apiImage: { repository: 'ghcr.io/tommytang213/settleora-api', configuredTag: `sha-${'4'.repeat(40)}`, indexDigest: d('5'), platformDigest: d('6'), ociRevision: '4'.repeat(40) },
    },
    retention: {
      canonicalEvidenceDirectory: `/workspace/logs/settleora-release-candidates/day1-${commit.slice(0, 12)}`,
      policy: 'Retain through R04 and Day 1 acceptance; deletion is a separate manual action.',
      apiRegistryIdentity: 'ghcr.io immutable digest plus GitHub Actions run',
    },
  };
  return { root, evidenceRoot, input, commit, tree, paths: { apkPath, webManifestPath, notesPath } };
}

test('builds a deterministic canonical identity and excludes generatedAt from its digest', (t) => {
  const f = fixture(t);
  const first = buildManifest(f.root, f.input);
  const second = buildManifest(f.root, { ...f.input, generatedAt: '2026-09-11T12:01:00Z' });
  assert.equal(first.identityDigest, second.identityDigest);
  assert.equal(first.identityDigest, computeIdentityDigest(first));
  assert.equal(first.migrations.count, 2);
  assert.equal(first.migrations.entries[1].files.length, 1);
  assert.equal(first.migrations.stateClaim, 'repository-source-only-not-applied');
  assert.equal(first.rollback.artifactAvailabilityProvesDatabaseSchemaFileRollbackSafety, false);
  assert.deepEqual(first.dependencyImages.map((image) => image.name), ['caddy', 'postgres', 'rabbitmq']);
  assert.doesNotThrow(() => validateManifest(first));
});

test('rejects source, API revision, API digest and floating-tag mismatches', (t) => {
  const f = fixture(t);
  assert.throws(() => buildManifest(f.root, { ...f.input, source: { ...f.input.source, commit: '9'.repeat(40) } }), /Source commit mismatch/);
  assert.throws(() => buildManifest(f.root, { ...f.input, source: { ...f.input.source, tree: '9'.repeat(40) } }), /Source tree mismatch/);
  assert.throws(() => buildManifest(f.root, { ...f.input, apiImage: { ...f.input.apiImage, ociRevision: '8'.repeat(40) } }), /OCI revision mismatch/);
  assert.throws(() => buildManifest(f.root, { ...f.input, apiImage: { ...f.input.apiImage, indexDigest: 'not-a-digest' } }), /immutable sha256 digest/);
  assert.throws(() => buildManifest(f.root, { ...f.input, apiImage: { ...f.input.apiImage, configuredTag: 'main' } }), /floating tag is not authoritative/);
});

test('rejects dependency tag/platform/digest and migration-set mismatches', (t) => {
  const f = fixture(t);
  const deps = f.input.dependencyImages.map((image) => ({ ...image }));
  deps[0].configuredTag = 'postgres:15-alpine';
  assert.throws(() => buildManifest(f.root, { ...f.input, dependencyImages: deps }), /configured tag mismatch/);
  const sameDigest = f.input.dependencyImages.map((image) => ({ ...image }));
  sameDigest[1].platformDigest = sameDigest[1].indexDigest;
  assert.throws(() => buildManifest(f.root, { ...f.input, dependencyImages: sameDigest }), /must remain distinct/);
  assert.throws(() => buildManifest(f.root, { ...f.input, expectedMigrationSetSha256: '7'.repeat(64) }), /Migration-set digest mismatch/);
  const wrongPlatform = f.input.dependencyImages.map((image) => ({ ...image }));
  wrongPlatform[2].architecture = 'arm64';
  assert.throws(() => buildManifest(f.root, { ...f.input, dependencyImages: wrongPlatform }), /architecture mismatch/);
});

test('rejects web source and Android artifact mismatches', (t) => {
  const f = fixture(t);
  const web = JSON.parse(readFileSync(f.paths.webManifestPath));
  web.source.commit = '7'.repeat(40);
  writeFileSync(f.paths.webManifestPath, JSON.stringify(web));
  assert.throws(() => buildManifest(f.root, f.input), /User-web source\/tree mismatch/);
  web.source.commit = f.commit;
  writeFileSync(f.paths.webManifestPath, JSON.stringify(web));
  const expected = { apk: { size: 1, sha256: '8'.repeat(64) } };
  assert.throws(() => buildManifest(f.root, { ...f.input, android: { ...f.input.android, expected } }), /APK identity mismatch/);
  const expectedAab = { aab: { size: 1, sha256: '8'.repeat(64) } };
  assert.throws(() => buildManifest(f.root, { ...f.input, android: { ...f.input.android, expected: expectedAab } }), /AAB identity mismatch/);
  const provenance = JSON.parse(readFileSync(f.input.android.buildProvenancePath));
  provenance.source.tree = '6'.repeat(40);
  writeFileSync(f.input.android.buildProvenancePath, JSON.stringify(provenance));
  assert.throws(() => buildManifest(f.root, f.input), /Android build provenance source mismatch/);
});

test('rejects symlinked evidence and a tampered manifest identity digest', (t) => {
  const f = fixture(t);
  const link = path.join(f.evidenceRoot, 'linked-notes.md');
  symlinkSync(f.paths.notesPath, link);
  assert.throws(() => buildManifest(f.root, { ...f.input, releaseNotes: { ...f.input.releaseNotes, path: link } }), /must not use symlinks/);
  const manifest = buildManifest(f.root, f.input);
  manifest.android.apk.sha256 = '9'.repeat(64);
  assert.throws(() => validateManifest(manifest), /Identity digest mismatch/);
  const extra = buildManifest(f.root, f.input);
  extra.apiImage.secret = 'must-not-pass';
  assert.throws(() => validateManifest(extra), /unexpected properties/);
});

test('validates registry index/platform linkage and API revision from fixture documents', () => {
  const image = { indexDigest: d('a'), platformDigest: d('b'), ociRevision: 'c'.repeat(40) };
  const platform = { os: 'linux', architecture: 'amd64' };
  const document = { digest: d('a'), manifests: [{ digest: d('b'), platform }] };
  assert.equal(validateRegistryDocument(image, document, platform), true);
  assert.equal(validateRegistryRevision(image, { config: { Labels: { 'org.opencontainers.image.revision': 'c'.repeat(40) } } }, 'c'.repeat(40)), true);
  assert.throws(() => validateRegistryDocument(image, { ...document, digest: d('d') }, platform), /index digest mismatch/);
  assert.throws(() => validateRegistryDocument(image, { ...document, manifests: [{ digest: d('e'), platform }] }, platform), /platform\/digest relationship mismatch/);
  assert.throws(() => validateRegistryRevision(image, { config: { Labels: { 'org.opencontainers.image.revision': 'f'.repeat(40) } } }, 'c'.repeat(40)), /OCI revision mismatch/);
});
