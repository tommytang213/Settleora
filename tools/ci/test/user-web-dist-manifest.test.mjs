import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, openSync, closeSync, readFileSync, rmSync, symlinkSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertTrackedWorktreeMatchesHead, collectFiles, createUserWebDistManifest, currentNpmVersion } from '../user-web-dist-manifest.mjs';

const provenance = {
  source: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) },
  buildTools: { node: 'v22.0.0', npm: '10.0.0', typescript: '5.9.3', vite: '8.1.0' },
  artifactRoot: 'test-fixture/dist',
};

test('npm version collection uses the sealed current Node installation', () => {
  assert.match(currentNpmVersion(), /^\d+\.\d+\.\d+/u);
});

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'web-dist-manifest-'));
  const dist = path.join(root, 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html>\n');
  writeFileSync(
    path.join(dist, 'assets/app.js'),
    ['const routes = ["/workspace/settings", "/home/account/profile"]; const state={access', 'Token:d.accessToken};\n'].join(''),
  );
  mkdirSync(path.join(dist, '.well-known'));
  writeFileSync(path.join(dist, '.well-known/asset.txt'), 'public metadata\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, dist, output: path.join(root, 'manifest.json') };
}

test('tracked-input verification preserves non-UTF-8 path bytes', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'web-dist-git-path-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const relative = Buffer.from([0x6e, 0x6f, 0x6e, 0x75, 0x74, 0x66, 0x38, 0x2d, 0x80, 0x2e, 0x74, 0x78, 0x74]);
  const absolute = Buffer.concat([Buffer.from(root), Buffer.from(path.sep), relative]);
  const contents = Buffer.from('exact tracked bytes\n');
  const fifoRelative = Buffer.from('tracked-fifo-candidate');
  const fifoAbsolute = path.join(root, fifoRelative.toString());
  writeFileSync(absolute, contents);
  writeFileSync(fifoAbsolute, contents);
  const object = execFileSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: root,
    input: contents,
    encoding: 'utf8',
  }).trim();
  execFileSync('git', ['update-index', '-z', '--index-info'], {
    cwd: root,
    input: Buffer.concat([
      Buffer.from(`100644 ${object}\t`), relative, Buffer.from([0]),
      Buffer.from(`100644 ${object}\t`), fifoRelative, Buffer.from([0]),
    ]),
  });
  const tree = execFileSync('git', ['write-tree'], { cwd: root, encoding: 'utf8' }).trim();
  const commit = execFileSync('git', ['commit-tree', tree, '-m', 'fixture'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Settleora Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Settleora Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    },
  }).trim();
  execFileSync('git', ['update-ref', 'HEAD', commit], { cwd: root });

  assert.doesNotThrow(() => assertTrackedWorktreeMatchesHead(root));
  writeFileSync(absolute, 'changed\n');
  assert.throws(() => assertTrackedWorktreeMatchesHead(root), /differs from HEAD/);
  writeFileSync(absolute, contents);
  unlinkSync(fifoAbsolute);
  execFileSync('mkfifo', [fifoAbsolute]);
  assert.throws(() => assertTrackedWorktreeMatchesHead(root), /is not a regular file/);
});

test('manifest is stable, sorted, bounded and contains no raw environment', (t) => {
  const f = fixture(t);
  const first = createUserWebDistManifest({ ...f, provenance, expectedSourceSha: 'a'.repeat(40) });
  const firstBytes = readFileSync(f.output);
  const second = createUserWebDistManifest({ ...f, provenance, expectedSourceSha: 'a'.repeat(40) });
  assert.deepEqual(second, first);
  assert.deepEqual(readFileSync(f.output), firstBytes);
  assert.deepEqual(first.artifact.files.map((file) => file.path), ['.well-known/asset.txt', 'assets/app.js', 'index.html']);
  assert.equal(first.artifact.fileCount, 3);
  assert.equal(first.artifact.root, 'test-fixture/dist');
  assert.match(first.artifact.treeSha256, /^[0-9a-f]{64}$/);
  assert.equal(first.publicArtifactChecks.sensitiveMaterialScan, 'passed');
  assert.doesNotMatch(firstBytes.toString(), /process\.env|\/tmp\/web-dist-manifest-|PATH|HOME/);
});

test('retained web files are rejected from metadata before oversized allocation', (t) => {
  const f = fixture(t);
  const oversized = path.join(f.dist, 'oversized.bin');
  const descriptor = openSync(oversized, 'wx');
  closeSync(descriptor);
  truncateSync(oversized, 32 * 1024 * 1024 + 1);
  assert.throws(() => collectFiles(f.dist), /file exceeds its evidence size limit/);
});

test('staged package evidence is an isolated exact snapshot', (t) => {
  const f = fixture(t);
  const staging = path.join(f.root, 'package-evidence');
  const manifest = createUserWebDistManifest({ ...f, output: undefined, staging, provenance });
  writeFileSync(path.join(f.dist, 'index.html'), 'changed after staging\n');
  assert.equal(readFileSync(path.join(staging, 'dist/index.html'), 'utf8'), '<!doctype html>\n');
  assert.deepEqual(JSON.parse(readFileSync(path.join(staging, 'user-web-dist-manifest.json'))), manifest);
  assert.throws(
    () => createUserWebDistManifest({ ...f, output: undefined, staging, provenance }),
    /staging path must not already exist/,
  );
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

test('manifest rejects a noncanonical dist without a safe provenance label', (t) => {
  const f = fixture(t);
  assert.throws(
    () => createUserWebDistManifest({ ...f, provenance: { ...provenance, artifactRoot: undefined } }),
    /requires a safe provenance artifactRoot label/,
  );
  assert.throws(
    () => createUserWebDistManifest({ ...f, provenance: { ...provenance, artifactRoot: '../outside' } }),
    /requires a safe provenance artifactRoot label/,
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

test('manifest bounds dist directory depth before recursive traversal', (t) => {
  const f = fixture(t);
  let directory = f.dist;
  for (let depth = 0; depth < 65; depth += 1) {
    directory = path.join(directory, 'd');
    mkdirSync(directory);
  }
  assert.throws(() => collectFiles(f.dist), /directory-depth limit/);
});

test('manifest rejects symlinks, malformed names, source maps and sensitive content', (t) => {
  const cases = [
    ['symlink', (f) => symlinkSync(path.join(f.dist, 'index.html'), path.join(f.dist, 'linked.html')), /Symlinks are not allowed/],
    ['malformed', (f) => writeFileSync(path.join(f.dist, 'bad\nname.txt'), 'bad'), /Unsafe dist path/],
    ['source map', (f) => writeFileSync(path.join(f.dist, 'bundle.js.map'), '{}'), /Unsafe public artifact path/],
    ['compressed source map', (f) => writeFileSync(path.join(f.dist, 'bundle.js.map.gz'), 'opaque'), /Unsafe public artifact path/],
    ['arbitrary compressed source map', (f) => writeFileSync(path.join(f.dist, 'bundle.js.map.lz4'), 'opaque'), /Unsafe public artifact path/],
    ['non-dot source map suffix', (f) => writeFileSync(path.join(f.dist, 'bundle.js.map~'), 'opaque'), /Unsafe public artifact path/],
    ['source map dotfile', (f) => writeFileSync(path.join(f.dist, '.map.gz'), 'opaque'), /Unsafe public artifact path/],
    ['suffixed dotenv file', (f) => writeFileSync(path.join(f.dist, '.env.production.local'), 'TOKEN=fake'), /Unsafe public artifact path/],
    ['standalone source map payload', (f) => writeFileSync(
      path.join(f.dist, 'assets/source.txt'),
      JSON.stringify({ version: 3, sources: ['src/main.ts'], sourcesContent: ['secret source'], names: [], mappings: 'AAAA' }),
    ), /Source-map payload/],
    ['indexed source map payload', (f) => writeFileSync(
      path.join(f.dist, 'assets/indexed.txt'),
      JSON.stringify({ version: 3, sections: [{ offset: { line: 0, column: 0 }, map: { version: 3, sources: ['src/main.ts'], mappings: 'AAAA' } }] }),
    ), /Source-map payload/],
    ['credentials', (f) => writeFileSync(path.join(f.dist, 'credentials.json'), '{}'), /Unsafe public artifact path/],
    ['generic secret directory', (f) => {
      mkdirSync(path.join(f.dist, 'secrets'));
      writeFileSync(path.join(f.dist, 'secrets/token.bin'), 'opaque');
    }, /Unsafe public artifact path/],
    ['version-control metadata', (f) => {
      mkdirSync(path.join(f.dist, '.git'));
      writeFileSync(path.join(f.dist, '.git/config'), 'opaque');
    }, /Unsafe public artifact path/],
    ['private key filename', (f) => writeFileSync(path.join(f.dist, 'account-private-key.dat'), 'opaque'), /Unsafe public artifact path/],
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
    ['generic credential assignment', (f) => writeFileSync(
      path.join(f.dist, 'config.txt'),
      ['API_', 'TOKEN=abcdefghijklmnop'].join(''),
    ), /Potential sensitive/],
    ['standalone credential assignment', (f) => writeFileSync(
      path.join(f.dist, 'config.txt'),
      ['TO', 'KEN=abcdefghijklmnop'].join(''),
    ), /Potential sensitive/],
    ['quoted JSON credential assignment', (f) => writeFileSync(
      path.join(f.dist, 'config.txt'),
      ['{"PASS', 'WORD":"abcdefghijklmnop"}'].join(''),
    ), /Potential sensitive/],
    ['quoted JSON API-key assignment', (f) => writeFileSync(
      path.join(f.dist, 'config.txt'),
      ['{"API_', 'KEY":"abcdefghijklmnop"}'].join(''),
    ), /Potential sensitive/],
    ['quoted JSON authorization assignment', (f) => writeFileSync(
      path.join(f.dist, 'config.txt'),
      ['{"author', 'ization":"abcdefghijklmnop"}'].join(''),
    ), /Potential sensitive/],
    ['JSON Unicode-escaped credential assignment', (f) => writeFileSync(
      path.join(f.dist, 'config.txt'),
      ['{"PASS', 'WORD":"abc\\u0064efghijklmnop"}'].join(''),
    ), /Potential sensitive/],
    ['JSON Unicode-escaped token', (f) => writeFileSync(
      path.join(f.dist, 'config.txt'),
      ['{"value":"github_pat_\\u004111AA22BB33CC44DD55EE66FF77"}'].join(''),
    ), /Potential sensitive/],
    ['duplicate JSON member hiding a Unicode-escaped token', (f) => writeFileSync(
      path.join(f.dist, 'config.txt'),
      ['{"claim":"github_pat_\\u004111AA22BB33CC44DD55EE66FF77","claim":"safe"}'].join(''),
    ), /Duplicate JSON members/],
    ['JavaScript Unicode-escaped token', (f) => writeFileSync(
      path.join(f.dist, 'app.js'),
      ['const value = "github_pat_\\u004111AA22BB33CC44DD55EE66FF77";'].join(''),
    ), /Potential sensitive/],
    ['JavaScript hex-escaped credential assignment', (f) => writeFileSync(
      path.join(f.dist, 'app.js'),
      ['const config = { "PASS\\x57ORD": "abcdefghijklmnop" };'].join(''),
    ), /Potential sensitive/],
    ['JavaScript partial escape inside token prefix', (f) => writeFileSync(
      path.join(f.dist, 'app.js'),
      ['const value = "github_pat_\\', 'AAAAAAAAAAAAAAAAAAAAAAAA";'].join(''),
    ), /Potential sensitive/],
    ['bearer token', (f) => writeFileSync(
      path.join(f.dist, 'config.txt'),
      ['Authorization: Bearer ', 'abcdefghijklmnop'].join(''),
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
    ['Google API key', (f) => writeFileSync(
      path.join(f.dist, 'token.txt'),
      ['AIza', '11AA22BB33CC44DD55EE66FF77'].join(''),
    ), /Potential sensitive/],
    ['OpenAI API key', (f) => writeFileSync(
      path.join(f.dist, 'token.txt'),
      ['sk-', '11AA22BB33CC44DD55EE66FF77'].join(''),
    ), /Potential sensitive/],
    ['Slack token', (f) => writeFileSync(
      path.join(f.dist, 'token.txt'),
      ['xoxb-', '11AA22BB33CC44DD55EE66FF77'].join(''),
    ), /Potential sensitive/],
    ['host path', (f) => writeFileSync(path.join(f.dist, 'path.txt'), '/workspace/repos/project'), /Potential sensitive/],
  ];
  for (const [label, mutate, expected] of cases) {
    const f = fixture(t);
    mutate(f);
    assert.throws(() => createUserWebDistManifest({ ...f, provenance }), expected, label);
  }
});
