import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  cpSync(path.join(packet, 'package'), root, { recursive: true });
  const valuesPath = path.join(root, 'templates/test_values/render-values.yaml');
  const values = YAML.parse(readFileSync(valuesPath, 'utf8'));
  mutate(values);
  writeFileSync(valuesPath, JSON.stringify(values), { mode: 0o600 });
  const result = spawnSync('docker', [
    'run', '--platform', 'linux/amd64', '--rm', '-e', 'FAKE_ENV=1',
    '-v', `${root}:/workspace/package:rw`, '-v', '/var/run/docker.sock:/var/run/docker.sock:ro',
    validatorImage, 'apps_render_app', 'render', '--path', '/workspace/package', '--values', '/workspace/package/templates/test_values/render-values.yaml',
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.notEqual(result.status, 0, `${name} must be refused by the official renderer`);
  const output = result.stdout + result.stderr;
  for (const secret of SECRET_MARKERS) assert.doesNotMatch(output, new RegExp(secret));
  assert.doesNotMatch(output, /\/mnt\//u);
}

try {
  const manifest = syntheticManifest();
  const packet = path.join(tempRoot, 'packet');
  materialize({ manifest, expectedIdentityDigest: manifest.identityDigest, config: structuredClone(fixtureConfig), output: packet });
  execFileSync('bash', [path.join(moduleDir, 'validate-official-render.sh'), packet], { cwd: repoRoot, stdio: 'inherit' });
  expectOfficialRefusal(packet, 'network-injection', (values) => {
    values.network.networks = [{ name: 'bridge', containers: [{ name: 'postgres', config: {} }] }];
  });
  expectOfficialRefusal(packet, 'image-injection', (values) => {
    values.images = { api_image: { repository: 'invalid.local/override', tag: 'latest' } };
  });
  process.stdout.write('Official renderer refused undeclared network and image overrides.\n');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
