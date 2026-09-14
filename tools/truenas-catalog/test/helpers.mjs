import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectMigrations, computeIdentityDigest } from '../../release/day1-release-identity.mjs';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const fixtureConfig = JSON.parse(readFileSync(path.join(repoRoot, 'tools/truenas-catalog/test/fixtures/sanitized-config.json'), 'utf8'));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: repoRoot, encoding: 'utf8' }).trim();
const hex = (character) => character.repeat(64);
const imageMaterials = [
  { uri: 'pkg:docker/docker/dockerfile@1', digest: `sha256:${hex('1')}` },
  { uri: 'pkg:docker/mcr.microsoft.com/dotnet/aspnet@9.0?platform=linux%2Famd64', digest: `sha256:${hex('2')}` },
  { uri: 'pkg:docker/mcr.microsoft.com/dotnet/sdk@9.0?platform=linux%2Famd64', digest: `sha256:${hex('3')}` },
];

function apiImage(source, digit) {
  return {
    repository: 'ghcr.io/tommytang213/settleora-api',
    configuredTag: `sha-${source}`,
    indexDigest: `sha256:${hex(digit)}`,
    platformDigest: `sha256:${hex(String((Number(digit) + 1) % 10))}`,
    os: 'linux',
    architecture: 'amd64',
    ociRevision: source,
    publicationRunUrl: 'https://github.com/tommytang213/Settleora/actions/runs/1',
    buildMaterials: imageMaterials,
  };
}

let cachedManifest;

export function syntheticManifest() {
  if (cachedManifest) return structuredClone(cachedManifest);
  const source = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  const prior = git('rev-parse', 'HEAD^');
  const webLockBytes = readFileSync(path.join(repoRoot, 'apps/web-user/package-lock.json'));
  const webLock = JSON.parse(webLockBytes);
  const migrationIds = [...new Set(git('ls-tree', '-r', '--name-only', source)
    .split('\n')
    .map((file) => file.match(/services\/api\/src\/Settleora\.Api\/Persistence\/Migrations\/(\d{14}_[A-Za-z0-9_]+)(?:\.Designer)?\.cs$/u)?.[1])
    .filter(Boolean))].sort();
  const migrations = collectMigrations(repoRoot, undefined, source, migrationIds);
  migrations.source = { commit: source, tree };
  const manifest = {
    schema: 'settleora.day1-release-identity.v1',
    identityDigestAlgorithm: 'sha256(canonical-json-v1;excludes=generatedAt,identityDigest)',
    generatedAt: '2026-09-14T00:00:00Z',
    source: { repository: 'tommytang213/Settleora', commit: source, tree, candidateId: `test-${source.slice(0, 12)}`, exactSource: true, cleanTrackedCheckout: true },
    apiImage: apiImage(source, '4'),
    dependencyImages: [
      { name: 'caddy', repository: 'docker.io/library/caddy', configuredTag: 'caddy:2.11.4-alpine', indexDigest: `sha256:${hex('6')}`, platformDigest: `sha256:${hex('7')}`, os: 'linux', architecture: 'amd64', sourceComposePath: 'infra/docker-compose.truenas-lan.image.yml' },
      { name: 'postgres', repository: 'docker.io/library/postgres', configuredTag: 'postgres:16-alpine', indexDigest: `sha256:${hex('8')}`, platformDigest: `sha256:${hex('9')}`, os: 'linux', architecture: 'amd64', sourceComposePath: 'infra/docker-compose.truenas-lan.image.yml' },
      { name: 'rabbitmq', repository: 'docker.io/library/rabbitmq', configuredTag: 'rabbitmq:3.13-management-alpine', indexDigest: `sha256:${hex('a')}`, platformDigest: `sha256:${hex('b')}`, os: 'linux', architecture: 'amd64', sourceComposePath: 'infra/docker-compose.truenas-lan.image.yml' },
    ],
    migrations,
    userWeb: {
      schema: 'settleora.user-web-dist-manifest.v1', source: { commit: source, tree },
      dependencyLock: { path: 'apps/web-user/package-lock.json', sha256: digest(webLockBytes), lockfileVersion: webLock.lockfileVersion },
      buildTools: { node: 'test-node', npm: 'test-npm', typescript: webLock.packages['node_modules/typescript'].version, vite: webLock.packages['node_modules/vite'].version },
      artifact: { treeDigestAlgorithm: 'sha256(canonical-file-records-v1)', treeSha256: hex('c'), fileCount: 1, totalBytes: 1 },
    },
    android: {
      source: { commit: source, tree }, semanticVersion: '1.0.0', buildNumber: '1', applicationId: 'com.example.mobile', r8Minified: true,
      r8MappingSha256: hex('d'), signingState: 'debug-signing-non-store-ready', signingInputSha256: hex('e'), signerCertificateSha256: hex('f'),
      apk: { path: 'apps/mobile/build/app/outputs/flutter-apk/app-release.apk', size: 1, sha256: hex('1') },
      aab: { path: 'apps/mobile/build/app/outputs/bundle/release/app-release.aab', size: 1, sha256: hex('2') },
      outputMetadataSha256: hex('3'), buildProvenanceSha256: hex('4'),
    },
    releaseNotes: { source: 'bounded-input/test-release-notes.md', sha256: hex('5'), size: 1, candidateSummary: 'Synthetic repository-only catalog validator fixture.' },
    rollback: { sourceCommit: prior, apiImage: apiImage(prior, '6'), artifactAvailabilityProvesDatabaseSchemaFileRollbackSafety: false, safetyCaveat: 'Artifact availability does not prove database, schema, or file rollback safety.' },
    retention: { canonicalEvidenceDirectory: '/workspace/logs/settleora-release-candidates/{source.candidateId}', policy: 'Synthetic test evidence only.', apiRegistryIdentity: 'Synthetic immutable test identity.' },
  };
  manifest.identityDigest = computeIdentityDigest(manifest);
  cachedManifest = manifest;
  return structuredClone(cachedManifest);
}

export const clone = (value) => structuredClone(value);
