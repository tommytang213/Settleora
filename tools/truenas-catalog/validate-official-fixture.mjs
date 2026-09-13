import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureConfig, repoRoot, syntheticManifest } from './test/helpers.mjs';
import { materialize } from './render.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'settleora-r04-official-'));

try {
  const manifest = syntheticManifest();
  const packet = path.join(tempRoot, 'packet');
  materialize({ manifest, expectedIdentityDigest: manifest.identityDigest, config: structuredClone(fixtureConfig), output: packet });
  execFileSync('bash', [path.join(moduleDir, 'validate-official-render.sh'), packet], { cwd: repoRoot, stdio: 'inherit' });
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
