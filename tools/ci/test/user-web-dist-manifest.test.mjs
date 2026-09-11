import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createUserWebDistManifest } from '../user-web-dist-manifest.mjs';

const provenance = {
  source: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) },
  buildTools: { node: 'v22.0.0', npm: '10.0.0', typescript: '5.9.3', vite: '8.1.0' },
};

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'web-dist-manifest-'));
  const dist = path.join(root, 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html>\n');
  writeFileSync(path.join(dist, 'assets/app.js'), 'const routes = ["/workspace/settings", "/home/account/profile"];\n');
  mkdirSync(path.join(dist, '.well-known'));
  writeFileSync(path.join(dist, '.well-known/asset.txt'), 'public metadata\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, dist, output: path.join(root, 'manifest.json') };
}

test('manifest is stable, sorted, bounded and contains no raw environment', (t) => {
  const f = fixture(t);
  const first = createUserWebDistManifest({ ...f, provenance, expectedSourceSha: 'a'.repeat(40) });
  const firstBytes = readFileSync(f.output);
  const second = createUserWebDistManifest({ ...f, provenance, expectedSourceSha: 'a'.repeat(40) });
  assert.deepEqual(second, first);
  assert.deepEqual(readFileSync(f.output), firstBytes);
  assert.deepEqual(first.artifact.files.map((file) => file.path), ['.well-known/asset.txt', 'assets/app.js', 'index.html']);
  assert.equal(first.artifact.fileCount, 3);
  assert.match(first.artifact.treeSha256, /^[0-9a-f]{64}$/);
  assert.equal(first.publicArtifactChecks.sensitiveMaterialScan, 'passed');
  assert.doesNotMatch(firstBytes.toString(), /process\.env|\/tmp\/web-dist-manifest-|PATH|HOME/);
});

test('manifest rejects a source mismatch and self-reference', (t) => {
  const f = fixture(t);
  assert.throws(
    () => createUserWebDistManifest({ ...f, provenance, expectedSourceSha: 'c'.repeat(40) }),
    /Source checkout mismatch/,
  );
  assert.throws(
    () => createUserWebDistManifest({ ...f, output: path.join(f.dist, 'manifest.json'), provenance }),
    /outside the hashed dist tree/,
  );
});

test('manifest rejects symlinked roots and output paths', (t) => {
  const f = fixture(t);
  const linkedDist = path.join(f.root, 'linked-dist');
  symlinkSync(f.dist, linkedDist);
  assert.throws(
    () => createUserWebDistManifest({ dist: linkedDist, output: f.output, provenance }),
    /dist root must not be a symlink/,
  );
  const linkedOutput = path.join(f.root, 'linked-manifest.json');
  symlinkSync(path.join(f.root, 'target.json'), linkedOutput);
  assert.throws(
    () => createUserWebDistManifest({ dist: f.dist, output: linkedOutput, provenance }),
    /output must not be a symlink/,
  );
});

test('manifest rejects an empty dist tree', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'web-dist-empty-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dist = path.join(root, 'dist');
  mkdirSync(dist);
  assert.throws(
    () => createUserWebDistManifest({ dist, output: path.join(root, 'manifest.json'), provenance }),
    /at least one regular file/,
  );
});

test('manifest rejects symlinks, malformed names, source maps and sensitive content', (t) => {
  const cases = [
    ['symlink', (f) => symlinkSync(path.join(f.dist, 'index.html'), path.join(f.dist, 'linked.html')), /Symlinks are not allowed/],
    ['malformed', (f) => writeFileSync(path.join(f.dist, 'bad\nname.txt'), 'bad'), /Unsafe dist path/],
    ['source map', (f) => writeFileSync(path.join(f.dist, 'bundle.js.map'), '{}'), /Unsafe public artifact path/],
    ['suffixed dotenv file', (f) => writeFileSync(path.join(f.dist, '.env.production.local'), 'TOKEN=fake'), /Unsafe public artifact path/],
    ['standalone source map payload', (f) => writeFileSync(
      path.join(f.dist, 'assets/source.txt'),
      JSON.stringify({ version: 3, sources: ['src/main.ts'], sourcesContent: ['secret source'], names: [], mappings: 'AAAA' }),
    ), /Source-map payload/],
    ['credentials', (f) => writeFileSync(path.join(f.dist, 'credentials.json'), '{}'), /Unsafe public artifact path/],
    ['npm credential file', (f) => writeFileSync(path.join(f.dist, '.npmrc'), 'registry=https://example.invalid'), /Unsafe public artifact path/],
    ['private key', (f) => writeFileSync(
      path.join(f.dist, 'material.txt'),
      ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
    ), /Potential sensitive/],
    ['encrypted private key', (f) => writeFileSync(
      path.join(f.dist, 'material.txt'),
      ['-----BEGIN ENCRYPTED ', 'PRIVATE KEY-----'].join(''),
    ), /Potential sensitive/],
    ['PGP private key', (f) => writeFileSync(
      path.join(f.dist, 'material.txt'),
      ['-----BEGIN PGP ', 'PRIVATE KEY BLOCK-----'].join(''),
    ), /Potential sensitive/],
    ['npm auth assignment', (f) => writeFileSync(
      path.join(f.dist, 'config.txt'),
      ['//registry.example.invalid/:_auth', 'Token=fake-value'].join(''),
    ), /Potential sensitive/],
    ['inline source map', (f) => writeFileSync(
      path.join(f.dist, 'inline.js'),
      ['//# sourceMappingURL=', 'data:application/json;base64,e30='].join(''),
    ), /Potential sensitive/],
    ['external source map reference', (f) => writeFileSync(
      path.join(f.dist, 'inline.js'),
      ['//# source', 'MappingURL=assets/source.txt'].join(''),
    ), /Potential sensitive/],
    ['fine-grained GitHub token', (f) => writeFileSync(
      path.join(f.dist, 'token.txt'),
      ['github_pat_', '11AA22BB33CC44DD55EE66FF77'].join(''),
    ), /Potential sensitive/],
    ['host path', (f) => writeFileSync(path.join(f.dist, 'path.txt'), '/workspace/repos/project'), /Potential sensitive/],
  ];
  for (const [label, mutate, expected] of cases) {
    const f = fixture(t);
    mutate(f);
    assert.throws(() => createUserWebDistManifest({ ...f, provenance }), expected, label);
  }
});
