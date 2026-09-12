import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildManifest,
  bindCompiledMigrationIds,
  canonicalJson,
  collectMigrations,
  computeIdentityDigest,
  containsSensitiveMaterial,
  sha256,
  validateRegistryDocument,
  validateRegistryRevision,
  validateSelectedPlatformDocument,
  validateManifest,
  validatePublicationJobDocument,
  validatePublicationJobLog,
  validatePublicationProvenance,
  validatePublicationRunDocument,
  validatePublicationRunUrl,
} from '../day1-release-identity.mjs';
import { assertCleanCompletion, assertCommitHasNoSymlinks, canonicalAndroidInput, canonicalManifestPath, canonicalReleaseNotesInput, canonicalWebInput, copyBoundedFile, parseSingleApkSigner, safeInput } from '../day1-release-identity-cli.mjs';

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
  write(root, `${migrationRoot}/20260101000000_Initial.cs`, 'public partial class Initial : Migration {}\n');
  write(root, `${migrationRoot}/20260101000000_Initial.Designer.cs`, '[Migration("20260101000000_Initial")]\npartial class Initial {}\n');
  write(root, `${migrationRoot}/20260102000000_SourceOnly.cs`, 'public partial class SourceOnly : Migration {}\n');
  write(root, `${migrationRoot}/20260102000000_SourceOnly.Designer.cs`, '[Migration("20260102000000_SourceOnly")]\npartial class SourceOnly {}\n');
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
  git(root, ['-c', 'user.name=Settleora Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture base']);
  const rollbackCommit = git(root, ['rev-parse', 'HEAD']);
  write(root, 'README.md', 'candidate source\n');
  git(root, ['add', 'README.md']);
  git(root, ['-c', 'user.name=Settleora Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture candidate']);
  const commit = git(root, ['rev-parse', 'HEAD']);
  const tree = git(root, ['rev-parse', 'HEAD^{tree}']);

  const apkPath = write(evidenceRoot, 'app-release.apk', 'apk bytes\n');
  const aabPath = write(evidenceRoot, 'app-release.aab', 'aab bytes\n');
  const mappingPath = write(evidenceRoot, 'mapping.txt', '# compiler: R8\nminified mapping\n');
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
    buildTools: { node: 'v22.0.0', npm: '10.0.0', typescript: '5.0.0', vite: '7.0.0' },
    artifact: {
      root: 'fixture-dist',
      treeDigestAlgorithm: 'sha256(canonical-file-records-v1)',
      treeSha256: sha256(`${webRecord.sha256}  ${webRecord.size}  ${webRecord.path}\n`),
      fileCount: 1,
      totalBytes: webRecord.size,
      files: [webRecord],
    },
    publicArtifactChecks: { symlinksRejected: true, sourceMapsRejected: true, sensitiveMaterialScan: 'passed' },
  }));
  const notesPath = write(evidenceRoot, 'release-notes.md', '# Candidate\nBounded test evidence.\n');
  const buildProvenancePath = write(evidenceRoot, 'build-provenance.json', canonicalJson({
    schema: 'settleora.android-exact-source-build.v1', source: { commit, tree },
    commands: ['flutter clean', 'flutter build apk --release', 'flutter build appbundle --release'],
    toolchains: {
      flutter: { algorithm: 'sha256(canonical-stable-toolchain-tree-v1)', sha256: '8'.repeat(64), fileCount: 1, directoryCount: 1, symlinkCount: 0, totalBytes: 1 },
      android: { algorithm: 'sha256(canonical-stable-toolchain-tree-v1)', sha256: '9'.repeat(64), fileCount: 1, directoryCount: 1, symlinkCount: 0, totalBytes: 1 },
    },
    artifacts: {
      apk: { path: 'apps/mobile/build/app/outputs/flutter-apk/app-release.apk', size: readFileSync(apkPath).length, sha256: sha256(readFileSync(apkPath)) },
      aab: { path: 'apps/mobile/build/app/outputs/bundle/release/app-release.aab', size: readFileSync(aabPath).length, sha256: sha256(readFileSync(aabPath)) },
      r8MappingSha256: sha256(readFileSync(mappingPath)),
    },
  }));
  const input = {
    generatedAt: '2026-09-11T12:00:00Z',
    registryResolutionMode: 'live-read-only',
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
      embeddedR8MappingSha256: sha256(readFileSync(mappingPath)),
    },
    releaseNotes: { evidenceRoot, path: notesPath, source: 'bounded-input/release-notes.md', candidateSummary: 'Fixture candidate only.' },
    rollback: {
      sourceCommit: rollbackCommit,
      apiImage: { repository: 'ghcr.io/tommytang213/settleora-api', configuredTag: `sha-${rollbackCommit}`, indexDigest: d('5'), platformDigest: d('6'), ociRevision: rollbackCommit, publicationRunUrl: 'https://github.com/tommytang213/Settleora/actions/runs/2' },
    },
    retention: {
      canonicalEvidenceDirectory: `/workspace/logs/settleora-release-candidates/day1-${commit.slice(0, 12)}`,
      policy: 'Retain through R04 and Day 1 acceptance; deletion is a separate manual action.',
      apiRegistryIdentity: 'ghcr.io immutable digest plus GitHub Actions run',
    },
  };
  bindCompiledMigrationIds(input, ['20260101000000_Initial', '20260102000000_SourceOnly']);
  return { root, evidenceRoot, input, commit, tree, paths: { apkPath, webManifestPath, notesPath } };
}

test('builds a deterministic canonical identity and excludes generatedAt from its digest', (t) => {
  const f = fixture(t);
  const first = buildManifest(f.root, f.input);
  const second = buildManifest(f.root, { ...f.input, generatedAt: '2026-09-11T12:01:00Z' });
  assert.equal(first.identityDigest, second.identityDigest);
  assert.equal(first.identityDigest, computeIdentityDigest(first));
  assert.equal(first.migrations.count, 2);
  assert.equal(first.migrations.entries[1].files.length, 2);
  assert.equal(first.migrations.stateClaim, 'repository-source-only-not-applied');
  assert.equal(first.migrations.runtimeInventory, 'compiled-ef-metadata-v1');
  assert.equal(first.rollback.artifactAvailabilityProvesDatabaseSchemaFileRollbackSafety, false);
  assert.deepEqual(first.dependencyImages.map((image) => image.name), ['caddy', 'postgres', 'rabbitmq']);
  assert.doesNotThrow(() => validateManifest(first, f.root));
  assert.throws(() => buildManifest(f.root, JSON.parse(JSON.stringify(f.input))), /Compiled EF runtime migration inventory is required/);
  assert.throws(() => buildManifest(f.root, { ...f.input, generatedAt: 'unknown' }), /normalized RFC 3339 UTC timestamp/);
  const webManifest = JSON.parse(readFileSync(f.paths.webManifestPath));
  webManifest.buildTools.node = 'v22.999.0';
  writeFileSync(f.paths.webManifestPath, JSON.stringify(webManifest));
  assert.equal(buildManifest(f.root, f.input).identityDigest, first.identityDigest);
});

test('rejects source, API revision, API digest and floating-tag mismatches', (t) => {
  const f = fixture(t);
  assert.throws(() => buildManifest(f.root, { ...f.input, source: { ...f.input.source, commit: '9'.repeat(40) } }), /Source commit mismatch/);
  assert.throws(() => buildManifest(f.root, { ...f.input, source: { ...f.input.source, tree: '9'.repeat(40) } }), /Source tree mismatch/);
  assert.throws(() => buildManifest(f.root, { ...f.input, apiImage: { ...f.input.apiImage, ociRevision: '8'.repeat(40) } }), /OCI revision mismatch/);
  assert.throws(() => buildManifest(f.root, { ...f.input, apiImage: { ...f.input.apiImage, indexDigest: 'not-a-digest' } }), /immutable sha256 digest/);
  assert.throws(() => buildManifest(f.root, { ...f.input, apiImage: { ...f.input.apiImage, configuredTag: 'main' } }), /floating tag is not authoritative/);
  assert.throws(() => buildManifest(f.root, { ...f.input, apiImage: { ...f.input.apiImage, publicationRunUrl: 'not-a-run' } }), /canonical GitHub Actions run URL/);
  assert.throws(() => buildManifest(f.root, { ...f.input, apiImage: { ...f.input.apiImage, publicationRunUrl: 'https://github.com/other/repo/actions/runs/1' } }), /canonical GitHub Actions run URL/);
  assert.deepEqual(validatePublicationRunUrl(f.input.apiImage.publicationRunUrl, f.commit), { url: f.input.apiImage.publicationRunUrl, runId: '1' });
  const publication = validatePublicationRunUrl(f.input.apiImage.publicationRunUrl, f.commit);
  const run = { html_url: publication.url, head_repository: { full_name: 'tommytang213/Settleora' }, head_sha: f.commit, head_branch: 'main', event: 'push', conclusion: 'success', path: '.github/workflows/api-image-ghcr.yml' };
  assert.equal(validatePublicationRunDocument(publication, run, f.commit), true);
  assert.throws(() => validatePublicationRunDocument(publication, { ...run, head_sha: '0'.repeat(40) }, f.commit), /publication run provenance mismatch/);
  assert.throws(() => validatePublicationRunDocument(publication, { ...run, head_branch: 'v1.0.0' }, f.commit), /publication run provenance mismatch/);
  const jobs = { total_count: 1, jobs: [{ id: 123, name: 'Publish API image', conclusion: 'success', steps: [{ name: 'Build and publish API image', conclusion: 'success' }] }] };
  assert.equal(validatePublicationJobDocument(jobs, f.commit), 123);
  assert.throws(() => validatePublicationJobDocument({ ...jobs, jobs: [{ ...jobs.jobs[0], conclusion: 'failure' }] }, f.commit), /publication job provenance mismatch/);
  const publicationLog = `pushing manifest for ghcr.io/tommytang213/settleora-api:sha-${f.commit}@${f.input.apiImage.indexDigest} done\n  "containerimage.digest": "${f.input.apiImage.indexDigest}"\n`;
  assert.equal(validatePublicationJobLog(publicationLog, f.input.apiImage, f.commit), true);
  assert.throws(() => validatePublicationJobLog(publicationLog.replaceAll(f.input.apiImage.indexDigest, d('9')), f.input.apiImage, f.commit), /publication log digest mismatch/);
  const provenance = { runDetails: { builder: { id: `${publication.url}/attempts/1` } }, buildDefinition: { externalParameters: { request: { root: { configSource: { request: { args: { 'vcs:revision': f.commit, 'vcs:source': 'https://github.com/tommytang213/Settleora' } } } } } } } };
  assert.equal(validatePublicationProvenance(publication, provenance, f.commit), true);
  provenance.runDetails.builder.id = 'https://github.com/other/repo/actions/runs/1/attempts/1';
  assert.throws(() => validatePublicationProvenance(publication, provenance, f.commit), /provenance attestation mismatch/);
  const rollback = structuredClone(f.input.rollback);
  delete rollback.apiImage.publicationRunUrl;
  assert.throws(() => buildManifest(f.root, { ...f.input, rollback }), /publicationRunUrl/);
});

test('rejects dependency tag/platform/digest and migration-set mismatches', (t) => {
  const f = fixture(t);
  const deps = f.input.dependencyImages.map((image) => ({ ...image }));
  deps[0].configuredTag = 'postgres:15-alpine';
  assert.throws(() => buildManifest(f.root, { ...f.input, dependencyImages: deps }), /configured tag mismatch/);
  const wrongRepository = f.input.dependencyImages.map((image) => ({ ...image }));
  wrongRepository[0].repository = 'example.invalid/library/postgres';
  assert.throws(() => buildManifest(f.root, { ...f.input, dependencyImages: wrongRepository }), /repository mismatch/);
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
  web.dependencyLock.lockfileVersion = 2;
  writeFileSync(f.paths.webManifestPath, JSON.stringify(web));
  assert.throws(() => buildManifest(f.root, f.input), /lockfile version mismatch/);
  web.dependencyLock.lockfileVersion = 3;
  writeFileSync(f.paths.webManifestPath, JSON.stringify(web));
  write(f.evidenceRoot, 'dist/omitted.js', 'omitted\n');
  assert.throws(() => buildManifest(f.root, f.input), /file list is incomplete/);
  rmSync(path.join(f.evidenceRoot, 'dist/omitted.js'));
  writeFileSync(path.join(f.evidenceRoot, 'dist/index.html'), `${'author'}${'ization'} = ${'a'.repeat(16)}\n`);
  assert.throws(() => buildManifest(f.root, f.input), /Potential sensitive/);
  writeFileSync(path.join(f.evidenceRoot, 'dist/index.html'), '<!doctype html>\n');
  const expected = { apk: { size: 1, sha256: '8'.repeat(64) } };
  assert.throws(() => buildManifest(f.root, { ...f.input, android: { ...f.input.android, expected } }), /APK identity mismatch/);
  const expectedAab = { aab: { size: 1, sha256: '8'.repeat(64) } };
  assert.throws(() => buildManifest(f.root, { ...f.input, android: { ...f.input.android, expected: expectedAab } }), /AAB identity mismatch/);
  const provenance = JSON.parse(readFileSync(f.input.android.buildProvenancePath));
  provenance.source.tree = '6'.repeat(40);
  writeFileSync(f.input.android.buildProvenancePath, JSON.stringify(provenance));
  assert.throws(() => buildManifest(f.root, f.input), /Android build provenance source mismatch/);
});

test('rejects hidden tracked-source changes and nonconforming migration sources', (t) => {
  const f = fixture(t);
  git(f.root, ['update-index', '--assume-unchanged', 'apps/mobile/pubspec.yaml']);
  writeFileSync(path.join(f.root, 'apps/mobile/pubspec.yaml'), 'version: 9.9.9+99\n');
  assert.throws(() => buildManifest(f.root, f.input), /differs from HEAD/);
  git(f.root, ['update-index', '--no-assume-unchanged', 'apps/mobile/pubspec.yaml']);
  writeFileSync(path.join(f.root, 'apps/mobile/pubspec.yaml'), 'version: 1.2.3+45\n');
  write(f.root, 'services/api/src/Settleora.Api/Persistence/Migrations/CustomMigration.cs', '[Migration("20260103000000_Custom")]\n');
  git(f.root, ['add', 'services/api/src/Settleora.Api/Persistence/Migrations/CustomMigration.cs']);
  git(f.root, ['-c', 'user.name=Settleora Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'invalid migration fixture']);
  assert.throws(() => collectMigrations(f.root, undefined, undefined, ['20260101000000_Initial', '20260102000000_SourceOnly']), /Unrecognized migration source files/);
});

test('binds migration bytes to the initially captured source commit', (t) => {
  const f = fixture(t);
  const migration = path.join(f.root, 'services/api/src/Settleora.Api/Persistence/Migrations/20260101000000_Initial.cs');
  writeFileSync(migration, 'different migration bytes\n');
  git(f.root, ['add', 'services/api/src/Settleora.Api/Persistence/Migrations/20260101000000_Initial.cs']);
  git(f.root, ['-c', 'user.name=Settleora Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'move mutable head']);
  assert.throws(() => collectMigrations(f.root, undefined, f.commit, ['20260101000000_Initial', '20260102000000_SourceOnly']), /captured source blob/);
});

test('migration inventory includes normalized nested source paths', (t) => {
  const f = fixture(t);
  const root = 'services/api/src/Settleora.Api/Persistence/Migrations';
  write(f.root, `${root}/nested/20260103000000_Nested.cs`, 'public partial class Nested : Migration {}\n');
  write(f.root, `${root}/nested/20260103000000_Nested.Designer.cs`, '[Migration("20260103000000_Nested")] partial class Nested {}\n');
  git(f.root, ['add', `${root}/nested/20260103000000_Nested.cs`, `${root}/nested/20260103000000_Nested.Designer.cs`]);
  git(f.root, ['-c', 'user.name=Settleora Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'nested migration fixture']);
  const migrations = collectMigrations(f.root, undefined, undefined, ['20260101000000_Initial', '20260102000000_SourceOnly', '20260103000000_Nested']);
  assert.equal(migrations.count, 3);
  assert.ok(migrations.entries.at(-1).files.some((file) => file.path === `${root}/nested/20260103000000_Nested.cs`));
});

test('migration inventory rejects duplicate compiled runtime IDs', (t) => {
  const f = fixture(t);
  assert.throws(() => collectMigrations(f.root, undefined, undefined, ['20260101000000_Initial', '20260101000000_Initial']), /Duplicate EF runtime migration IDs/);
});

test('rejects symlinked evidence and a tampered manifest identity digest', (t) => {
  const f = fixture(t);
  const link = path.join(f.evidenceRoot, 'linked-notes.md');
  symlinkSync(f.paths.notesPath, link);
  assert.throws(() => buildManifest(f.root, { ...f.input, releaseNotes: { ...f.input.releaseNotes, path: link } }), /must not use symlinks/);
  const manifest = buildManifest(f.root, f.input);
  manifest.android.apk.sha256 = '9'.repeat(64);
  assert.throws(() => validateManifest(manifest, f.root), /Identity digest mismatch/);
  const extra = buildManifest(f.root, f.input);
  extra.apiImage.unexpected = 'must-not-pass';
  assert.throws(() => validateManifest(extra, f.root), /unexpected properties/);
  const missingCaveat = buildManifest(f.root, f.input);
  delete missingCaveat.rollback.safetyCaveat;
  missingCaveat.identityDigest = computeIdentityDigest(missingCaveat);
  assert.throws(() => validateManifest(missingCaveat, f.root), /missing required properties/);
  const missingRequired = buildManifest(f.root, f.input);
  delete missingRequired.source.tree;
  assert.throws(() => validateManifest(missingRequired, f.root), /missing required properties/);
  for (const [field, value] of [['semanticVersion', '9.9.9'], ['buildNumber', '999'], ['applicationId', 'com.example.forged'], ['signingState', 'release-signing']]) {
    const changedMetadata = buildManifest(f.root, f.input);
    changedMetadata.android[field] = value;
    changedMetadata.identityDigest = computeIdentityDigest(changedMetadata);
    assert.throws(() => validateManifest(changedMetadata, f.root), new RegExp(`android\\.${field} does not match the captured source commit`));
  }
});

test('rejects a non-ancestor rollback and an R8 mapping not bound to the AAB', (t) => {
  const f = fixture(t);
  assert.throws(() => buildManifest(f.root, { ...f.input, rollback: { ...f.input.rollback, sourceCommit: f.commit, apiImage: { ...f.input.rollback.apiImage, configuredTag: `sha-${f.commit}`, ociRevision: f.commit } } }), /prior to the candidate/);
  assert.throws(() => buildManifest(f.root, { ...f.input, android: { ...f.input.android, embeddedR8MappingSha256: '8'.repeat(64) } }), /does not match the signed AAB/);
});

test('rejects broad credential forms before retained evidence can be built', (t) => {
  const f = fixture(t);
  const tokenUrl = `https://github.com/actions/runs/1?access_token=${['gho', 'A'.repeat(30)].join('_')}`;
  assert.equal(containsSensitiveMaterial(tokenUrl), true);
  for (const sensitive of [
    ['to', 'ken=abcdefgh'].join(''),
    ['pass', 'word=abcdefgh'].join(''),
    ['Bearer', ' abcdefghijklmnop'].join(''),
    ['AKIA', 'A'.repeat(16)].join(''),
    `{"${['client', 'secret'].join('_')}":"placeholder"}`,
  ]) assert.equal(containsSensitiveMaterial(sensitive), true);
  assert.throws(() => buildManifest(f.root, { ...f.input, apiImage: { ...f.input.apiImage, publicationRunUrl: tokenUrl } }), /potentially sensitive material/);
  writeFileSync(f.paths.notesPath, `candidate notes\n${tokenUrl}\n`);
  assert.throws(() => buildManifest(f.root, f.input), /potentially sensitive material/);
});

test('preserves expected Android identities and derives retained canonical paths', (t) => {
  const f = fixture(t);
  const expected = { apk: { size: 123, sha256: '8'.repeat(64) }, aab: { size: 456, sha256: '9'.repeat(64) } };
  const input = { ...f.input, android: { ...f.input.android, expected } };
  const signature = { certificate: 'a'.repeat(64), embeddedR8MappingSha256: 'b'.repeat(64) };
  const canonical = canonicalAndroidInput(input, signature);
  const androidRoot = `${input.retention.canonicalEvidenceDirectory}/android`;
  assert.deepEqual(canonical.android.expected, expected);
  assert.equal(canonical.android.evidenceRoot, androidRoot);
  assert.equal(canonical.android.apkPath, `${androidRoot}/app-release.apk`);
  assert.equal(canonical.android.aabPath, `${androidRoot}/app-release.aab`);
  const traversal = { ...input, source: { ...input.source, candidateId: '../../../../tmp/x' }, retention: { ...input.retention, canonicalEvidenceDirectory: '/workspace/logs/settleora-release-candidates/../../../../tmp/x' } };
  assert.throws(() => canonicalAndroidInput(traversal, signature), /single safe evidence-directory name/);
  const nested = { ...input, source: { ...input.source, candidateId: 'nested/name' }, retention: { ...input.retention, canonicalEvidenceDirectory: '/workspace/logs/settleora-release-candidates/nested/name' } };
  assert.throws(() => canonicalAndroidInput(nested, signature), /single safe evidence-directory name/);
  const dot = { ...input, source: { ...input.source, candidateId: '.' }, retention: { ...input.retention, canonicalEvidenceDirectory: '/workspace/logs/settleora-release-candidates/.' } };
  assert.throws(() => canonicalAndroidInput(dot, signature), /single safe evidence-directory name/);
  const manifestPath = `${input.retention.canonicalEvidenceDirectory}/release-identity-manifest.json`;
  assert.equal(canonicalManifestPath(input, manifestPath), manifestPath);
  assert.throws(() => canonicalManifestPath(input, `${f.evidenceRoot}/manifest-copy.json`), /canonical retained candidate manifest/);
  assert.equal(canonicalWebInput(input).userWeb.manifestPath, `${input.retention.canonicalEvidenceDirectory}/web/user-web-dist-manifest.json`);
  assert.equal(canonicalReleaseNotesInput(input).releaseNotes.path, `${input.retention.canonicalEvidenceDirectory}/release-notes.md`);
});

test('accepts exactly one debug APK signer and rejects additional signers', () => {
  const digest = 'a'.repeat(64);
  const single = `Signer #1 certificate DN: CN=Android Debug, O=Android, C=US\nSigner #1 certificate SHA-256 digest: ${digest}\n`;
  assert.equal(parseSingleApkSigner(single), digest);
  assert.throws(() => parseSingleApkSigner(`${single}Signer #2 certificate DN: CN=Other\nSigner #2 certificate SHA-256 digest: ${'b'.repeat(64)}\n`), /APK signature observation mismatch/);
});

test('safe inputs reject URL query credentials and completion rejects untracked files', (t) => {
  const f = fixture(t);
  const inputPath = write(f.evidenceRoot, 'unsafe-input.json', JSON.stringify({ publicationRunUrl: `https://example.invalid/?access_token=${['gho', 'A'.repeat(30)].join('_')}` }));
  assert.throws(() => safeInput(inputPath, 'Evidence input'), /potentially sensitive material/);
  const oversizedInput = write(f.evidenceRoot, 'oversized-input.json', 'x'.repeat((4 * 1024 * 1024) + 1));
  assert.throws(() => safeInput(oversizedInput, 'Evidence input'), /evidence size limit/);
  assert.doesNotThrow(() => assertCleanCompletion(f.root, 'source changed'));
  write(f.root, 'untracked-after-registry.txt', 'race\n');
  assert.throws(() => assertCleanCompletion(f.root, 'source changed'), /source changed/);
});

test('snapshot inputs reject tracked symlinks and Android copies enforce pre-copy bounds', (t) => {
  const f = fixture(t);
  symlinkSync('README.md', path.join(f.root, 'tracked-link'));
  git(f.root, ['add', 'tracked-link']);
  git(f.root, ['-c', 'user.name=Settleora Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'tracked symlink fixture']);
  assert.throws(() => assertCommitHasNoSymlinks(git(f.root, ['rev-parse', 'HEAD']), 'test', f.root), /tracked symlink/);
  const oversized = write(f.evidenceRoot, 'oversized.bin', '0123456789abcdef');
  assert.throws(() => copyBoundedFile(oversized, path.join(f.evidenceRoot, 'copy.bin'), 8, 'Android test'), /evidence boundary/);
});

test('provenance collection rejects Git replacement refs', (t) => {
  const f = fixture(t);
  git(f.root, ['replace', f.commit, `${f.commit}^`]);
  assert.throws(() => assertCleanCompletion(f.root, 'source changed'), /replacement refs/);
});

test('validates registry index/platform linkage and API revision from fixture documents', () => {
  const image = { indexDigest: d('a'), platformDigest: d('b'), ociRevision: 'c'.repeat(40) };
  const platform = { os: 'linux', architecture: 'amd64' };
  const document = { digest: d('a'), manifests: [{ digest: d('b'), platform }] };
  assert.equal(validateRegistryDocument(image, document, platform), true);
  assert.equal(validateRegistryRevision(image, { config: { Labels: { 'org.opencontainers.image.revision': 'c'.repeat(40) } } }, 'c'.repeat(40)), true);
  assert.throws(() => validateRegistryDocument(image, { ...document, digest: d('d') }, platform), /index digest mismatch/);
  assert.throws(() => validateRegistryDocument(image, { ...document, manifests: [{ digest: d('e'), platform }] }, platform), /platform\/digest relationship mismatch/);
  assert.throws(() => validateRegistryDocument(image, { ...document, manifests: [document.manifests[0], { digest: d('e'), platform }] }, platform), /platform\/digest relationship mismatch/);
  assert.throws(() => validateRegistryRevision(image, { config: { Labels: { 'org.opencontainers.image.revision': 'f'.repeat(40) } } }, 'c'.repeat(40)), /OCI revision mismatch/);
  const selected = { manifest: { digest: image.platformDigest }, image: { os: 'linux', architecture: 'amd64', rootfs: { type: 'layers', diff_ids: [d('d')] }, config: {} } };
  assert.equal(validateSelectedPlatformDocument(image, selected, platform), true);
  assert.throws(() => validateSelectedPlatformDocument(image, { ...selected, image: { ...selected.image, rootfs: { type: 'layers', diff_ids: [] } } }, platform), /not a runnable/);
});

test('direct validation rejects empty migrations, noncanonical artifacts and unproved rollback ancestry', (t) => {
  const f = fixture(t);
  const original = buildManifest(f.root, f.input);
  assert.throws(() => validateManifest(original), /Repository context is required/);

  const resign = (manifest) => ({ ...manifest, identityDigest: computeIdentityDigest(manifest) });
  const emptyMigrations = resign({
    ...original,
    migrations: { ...original.migrations, entries: [], count: 0, setSha256: sha256(Buffer.from('[]\n')) },
  });
  assert.throws(() => validateManifest(emptyMigrations, f.root), /non-empty array/);

  const fictitiousMigrations = structuredClone(original);
  fictitiousMigrations.migrations.entries[0].files[0].sha256 = '7'.repeat(64);
  fictitiousMigrations.migrations.setSha256 = sha256(canonicalJson(fictitiousMigrations.migrations.entries));
  fictitiousMigrations.identityDigest = computeIdentityDigest(fictitiousMigrations);
  assert.throws(() => validateManifest(fictitiousMigrations, f.root), /captured source commit/);

  const wrongDependencyTag = structuredClone(original);
  wrongDependencyTag.dependencyImages.find((image) => image.name === 'postgres').configuredTag = 'postgres:15-alpine';
  wrongDependencyTag.identityDigest = computeIdentityDigest(wrongDependencyTag);
  assert.throws(() => validateManifest(wrongDependencyTag, f.root), /configured tag mismatch/);

  const wrongComposePath = structuredClone(original);
  wrongComposePath.dependencyImages[0].sourceComposePath = 'another-compose.yml';
  wrongComposePath.identityDigest = computeIdentityDigest(wrongComposePath);
  assert.throws(() => validateManifest(wrongComposePath, f.root), /source Compose path mismatch/);

  const wrongDependencyPlatform = structuredClone(original);
  wrongDependencyPlatform.dependencyImages[0].architecture = 'arm64';
  wrongDependencyPlatform.identityDigest = computeIdentityDigest(wrongDependencyPlatform);
  assert.throws(() => validateManifest(wrongDependencyPlatform, f.root), /platform mismatch/);

  const wrongRollbackPlatform = structuredClone(original);
  wrongRollbackPlatform.rollback.apiImage.os = 'windows';
  wrongRollbackPlatform.identityDigest = computeIdentityDigest(wrongRollbackPlatform);
  assert.throws(() => validateManifest(wrongRollbackPlatform, f.root), /platform mismatch/);

  const wrongWebLock = structuredClone(original);
  wrongWebLock.userWeb.dependencyLock.sha256 = '6'.repeat(64);
  wrongWebLock.userWeb.dependencyLock.lockfileVersion = 999;
  wrongWebLock.identityDigest = computeIdentityDigest(wrongWebLock);
  assert.throws(() => validateManifest(wrongWebLock, f.root), /captured source commit/);

  const wrongPath = resign({ ...original, android: { ...original.android, apk: { ...original.android.apk, path: 'elsewhere.apk' } } });
  assert.throws(() => validateManifest(wrongPath, f.root), /canonical release outputs/);

  const nonexistent = '9'.repeat(40);
  const wrongRollback = resign({
    ...original,
    rollback: {
      ...original.rollback,
      sourceCommit: nonexistent,
      apiImage: { ...original.rollback.apiImage, configuredTag: `sha-${nonexistent}`, ociRevision: nonexistent },
    },
  });
  assert.throws(() => validateManifest(wrongRollback, f.root), /existing prior ancestor/);

  const wrongTree = resign({
    ...original,
    source: { ...original.source, tree: '7'.repeat(40) },
    migrations: { ...original.migrations, source: { ...original.migrations.source, tree: '7'.repeat(40) } },
    userWeb: { ...original.userWeb, source: { ...original.userWeb.source, tree: '7'.repeat(40) } },
    android: { ...original.android, source: { ...original.android.source, tree: '7'.repeat(40) } },
  });
  assert.throws(() => validateManifest(wrongTree, f.root), /does not belong to the source commit/);
});

test('published schema requires role-specific image provenance', () => {
  const schema = JSON.parse(readFileSync(new URL('../day1-release-identity.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.$defs.apiImage.required, ['repository', 'configuredTag', 'indexDigest', 'platformDigest', 'os', 'architecture', 'ociRevision', 'publicationRunUrl']);
  assert.deepEqual(schema.$defs.dependencyImage.required, ['name', 'repository', 'configuredTag', 'indexDigest', 'platformDigest', 'os', 'architecture', 'sourceComposePath']);
  assert.equal(schema.properties.apiImage.$ref, '#/$defs/apiImage');
  assert.equal(schema.properties.rollback.properties.apiImage.$ref, '#/$defs/apiImage');
  assert.equal(schema.properties.dependencyImages.items.$ref, '#/$defs/dependencyImage');
  assert.equal(schema.$defs.dependencyImage.properties.sourceComposePath.const, 'infra/docker-compose.truenas-lan.image.yml');
  assert.deepEqual(schema.properties.dependencyImages.allOf.map((rule) => ({
    role: rule.contains.properties.name.const,
    minimum: rule.minContains,
    maximum: rule.maxContains,
  })), [
    { role: 'caddy', minimum: 1, maximum: 1 },
    { role: 'postgres', minimum: 1, maximum: 1 },
    { role: 'rabbitmq', minimum: 1, maximum: 1 },
  ]);
});

test('release execution uses protected system runtimes and bypasses user plugin configuration', () => {
  const cliSource = readFileSync(new URL('../day1-release-identity-cli.mjs', import.meta.url), 'utf8');
  assert.match(cliSource, /realpathSync\('\/proc\/self\/exe'\)/);
  assert.match(cliSource, /const systemNodeCommand = invokedDirectly/);
  assert.match(cliSource, /protectedSystemCommand\(lstatSync\('\/usr\/bin\/node', \{ throwIfNoEntry: false \}\) \? '\/usr\/bin\/node' : process\.execPath, 'node'\)/);
  assert.match(cliSource, /protectedSystemCommand\('\/usr\/bin\/npm', 'npm'\)/);
  assert.match(cliSource, /protectedSystemCommand\('\/usr\/bin\/python3', 'python3'\)/);
  assert.match(cliSource, /assertSystemRuntime\(`\/usr\/lib\/\$\{pythonRuntimeName\}`/);
  assert.match(cliSource, /assertSystemRuntime\('\/usr\/lib\/dotnet', 'system \.NET runtime'\)/);
  assert.match(cliSource, /protectedSystemCommand\('\/usr\/libexec\/docker\/cli-plugins\/docker-buildx', 'docker-buildx'\)/);
  assert.match(cliSource, /\['fsck', '--strict', '--no-dangling', '--no-progress', processSource\.commit\]/);
  assert.match(cliSource, /GH_CONFIG_DIR: '\/nonexistent'/);
  assert.match(cliSource, /BUILDX_CONFIG: path\.join\(dockerConfig, 'buildx'\)/);
  assert.match(cliSource, /HOME: npmHome/);
  assert.match(cliSource, /npm_config_userconfig: npmUserConfig/);
  assert.match(cliSource, /ImportDirectoryBuildProps=false/);
  assert.match(cliSource, /ImportDirectoryBuildTargets=false/);
  assert.match(cliSource, /ImportDirectoryPackagesProps=false/);
  assert.match(cliSource, /Retained Android toolchain provenance differs from the exact-source rebuild/);
  assert.match(cliSource, /collectedAndroidInput\([^;]*androidValidation, rebuiltSignature\)/s);
  assert.match(cliSource, /SETTLEORA_RELEASE_CLEAN_NODE/);
  assert.doesNotMatch(cliSource, /process\.env\.npm_execpath/);
  const apiDockerfile = readFileSync(new URL('../../../services/api/Dockerfile', import.meta.url), 'utf8');
  assert.match(apiDockerfile, /COPY services\/api\/src\/Settleora\.Api\/packages\.lock\.json services\/api\/src\/Settleora\.Api\//);
  assert.match(apiDockerfile, /dotnet restore services\/api\/src\/Settleora\.Api\/Settleora\.Api\.csproj --locked-mode/);
});
