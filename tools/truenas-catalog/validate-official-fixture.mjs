import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { fixtureConfig, repoRoot, syntheticManifest } from './test/helpers.mjs';
import { materialize, SECRET_MARKERS } from './render.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'settleora-r04-official-'));
const validatorImage = 'ghcr.io/truenas/apps_validation@sha256:9363207f4456a2522bc1aee7bc8d62378c5594b3781319f3331910662e0c49ae';

function expectOfficialRefusal(packet, name, mutate) {
  const root = path.join(tempRoot, name);
  mkdirSync(root);
  cpSync(path.join(packet, 'package'), path.join(root, 'package'), { recursive: true });
  const valuesPath = path.join(root, 'private-validation-values.yaml');
  cpSync(path.join(packet, 'private-validation-values.yaml'), valuesPath);
  const values = YAML.parse(readFileSync(valuesPath, 'utf8'));
  mutate(values, root);
  writeFileSync(valuesPath, JSON.stringify(values), { mode: 0o600 });
  const result = spawnSync('docker', [
    'run', '--platform', 'linux/amd64', '--rm', '-e', 'FAKE_ENV=1',
    '-v', `${root}:/workspace:rw`, '-v', '/var/run/docker.sock:/var/run/docker.sock:ro',
    validatorImage, 'apps_render_app', 'render', '--path', '/workspace/package', '--values', '/workspace/private-validation-values.yaml',
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(result.status, 0, `${name} must be refused by the official renderer`);
  const output = result.stdout + result.stderr;
  for (const secret of SECRET_MARKERS) assert.doesNotMatch(output, new RegExp(secret));
  assert.doesNotMatch(output, /\/mnt\//u);
}

function expectOfficialPostRenderRefusal(packet, name, mutate) {
  const root = path.join(tempRoot, name);
  mkdirSync(root);
  cpSync(path.join(packet, 'package'), path.join(root, 'package'), { recursive: true });
  cpSync(path.join(packet, 'private-validation-values.yaml'), path.join(root, 'private-validation-values.yaml'));
  execFileSync('docker', [
    'run', '--platform', 'linux/amd64', '--rm', '-e', 'FAKE_ENV=1',
    '-v', `${root}:/workspace:rw`, '-v', '/var/run/docker.sock:/var/run/docker.sock:ro',
    validatorImage, 'apps_render_app', 'render', '--path', '/workspace/package', '--values', '/workspace/private-validation-values.yaml',
  ], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('docker', [
    'run', '--platform', 'linux/amd64', '--rm', '-v', `${root}:/workspace:rw`, '--entrypoint', '/bin/chmod',
    validatorImage, '-R', '0777', '/workspace/package/templates/rendered',
  ], { cwd: repoRoot, stdio: 'pipe' });
  const composePath = path.join(root, 'package/templates/rendered/docker-compose.yaml');
  const compose = YAML.parse(readFileSync(composePath, 'utf8'));
  mutate(compose);
  writeFileSync(composePath, YAML.stringify(compose), { mode: 0o600 });
  const result = spawnSync('bash', ['-c', 'node "$1" 3< "$2" 4< "$3" 5< "$4" 6< "$5" 7< "$6"', 'bash',
    path.join(moduleDir, 'validate-official-render.mjs'), composePath, path.join(packet, 'install-plan.json'), path.join(packet, 'private-validation-values.yaml'),
    path.join(packet, 'private-render-identity.json'), path.join(packet, 'rendered/docker-compose.yaml'),
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(result.status, 0, `${name} must be refused by the official post-render validator`);
  const output = result.stdout + result.stderr;
  for (const secret of SECRET_MARKERS) assert.doesNotMatch(output, new RegExp(secret));
  assert.doesNotMatch(output, /\/mnt\//u);
}

try {
  const manifest = syntheticManifest();
  const packet = path.join(tempRoot, 'packet');
  materialize({ manifest, expectedIdentityDigest: manifest.identityDigest, config: structuredClone(fixtureConfig), output: packet });
  execFileSync('bash', [path.join(moduleDir, 'validate-official-render.sh'), packet], { cwd: repoRoot, stdio: 'inherit' });
  expectOfficialPostRenderRefusal(packet, 'unexpected-environment', (compose) => { compose.services.api.environment.UNSUPPORTED_INJECTION = 'refused'; });
  expectOfficialPostRenderRefusal(packet, 'tls-cross-service-mount', (compose) => {
    compose.services.postgres.configs = [{ mode: 256, source: 'settleora-tls-private-key', target: '/tmp/leaked-key' }];
  });
  expectOfficialRefusal(packet, 'network-injection', (values) => {
    values.network.networks = [{ name: 'bridge', containers: [{ name: 'postgres', config: {} }] }];
  });
  expectOfficialRefusal(packet, 'image-injection', (values, root) => {
    values.images = { api_image: { repository: 'invalid.local/override', tag: 'latest' } };
    const ixValuesPath = path.join(root, 'package/ix_values.yaml');
    const ixValues = YAML.parse(readFileSync(ixValuesPath, 'utf8'));
    ixValues.images = values.images;
    writeFileSync(ixValuesPath, JSON.stringify(ixValues), { mode: 0o600 });
  });
  expectOfficialRefusal(packet, 'certificate-authority-injection', (values) => {
    values.ix_certificate_authorities = { unexpected: { certificate: 'REDACTED_FAKE_CA' } };
  });
  expectOfficialRefusal(packet, 'live-context-without-filesystem-authority', (values) => {
    values.ix_context = { app_name: 'settleora', is_install: true };
  });
  process.stdout.write('Official renderer accepted normalized empty certificate authorities and refused undeclared network/image/CA overrides plus an unresolvable live dataset context.\n');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
