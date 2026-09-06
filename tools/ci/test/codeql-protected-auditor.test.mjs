import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { approved, audit, verifyDefinition, decodeFile, validateIdentity, classifyEvidence, apiArgs } from '../codeql-protected-auditor.mjs';

const source = 'a'.repeat(40), base = 'b'.repeat(40), merge = 'c'.repeat(40);
const expected = { number: 1088, source, base, merge, authority: base };
const repo = { full_name: 'tommytang213/Settleora' };
const pr = { number: 1088, state: 'open', head: { sha: source, repo }, base: { sha: base, ref: 'main', repo }, merge_commit_sha: merge };
const commit = { sha: merge, parents: [{ sha: base }, { sha: source }] };
const comparison = (files = [{ filename: 'docs/guide.md', status: 'modified' }]) => ({ base_commit: { sha: base }, merge_base_commit: { sha: base }, status: 'ahead', files });
const frozen = Object.fromEntries(Object.keys(approved).map((path) => [path, execFileSync('git', ['show', `b467cf1b53f896a3d5e0d7df33080454a340c857:${path}`])]));
const advanced = ['actions', 'c-cpp', 'csharp', 'javascript-typescript', 'python'].map((language) => ({ commit_sha: base, tool: { name: 'CodeQL' }, analysis_key: '.github/workflows/security-codeql.yml:analyze', category: `/language:${language}`, error: '', warning: '' }));
function content(path, bytes) {
  return { path, type: 'file', encoding: 'base64', size: bytes.length, content: bytes.toString('base64'),
    sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
}
function apiFixture(overrides = {}) {
  return async (endpoint) => {
    if (overrides[endpoint]) return overrides[endpoint]();
    if (endpoint === 'pulls/1088') return structuredClone(pr);
    if (endpoint === 'git/ref/heads/main') return { object: { sha: base } };
    if (endpoint === `commits/${merge}`) return structuredClone(commit);
    if (endpoint === `commits/${base}`) return { sha: base };
    if (endpoint.startsWith('git/trees/')) {
      return { sha: endpoint.split('/')[2].split('?')[0], truncated: false,
        tree: [...Object.keys(approved), '.github/workflows/codeql-protected-auditor.yml', 'tools/ci/codeql-protected-auditor.mjs'].map((path) => ({
          path, type: 'blob', mode: '100644', sha: content(path, frozen[path] ?? Buffer.from('trusted auditor bytes')).sha,
        })) };
    }
    if (endpoint.startsWith('compare/')) return comparison();
    if (endpoint.startsWith('code-scanning/analyses')) return structuredClone(advanced);
    const match = /^contents\/(.+)\?ref=([a-f0-9]{40})$/.exec(endpoint);
    if (match) {
      const bytes = frozen[match[1]] ?? Buffer.from('trusted auditor bytes');
      return content(match[1], bytes);
    }
    throw new Error(`Unexpected API: ${endpoint}`);
  };
}

test('protected unchanged analyzer plus advanced base coverage recognizes docs without language work', async () => {
  const proof = await audit(expected, apiFixture());
  assert.equal(proof.mode, 'docs-only'); assert.deepEqual(proof.paths, ['docs/guide.md']);
  assert.equal(proof.source, source); assert.equal(proof.base, base); assert.equal(proof.merge, merge);
});
for (const path of ['src/a.cs', 'test/a.mjs', '.github/workflows/a.yml', 'tools/a.mjs', 'package.json', 'package-lock.json', 'config.json', 'infra/Dockerfile', 'schema/1.sql', 'packages/contracts/openapi/a.yaml']) {
  test(`${path} cannot claim docs applicability`, async () => {
    const proof = await audit(expected, apiFixture({ [`compare/${base}...${merge}`]: () => comparison([{ filename: path, status: 'modified' }]) }));
    assert.equal(proof.mode, 'analysis');
  });
}
test('rename checks previous source path', () => {
  assert.equal(classifyEvidence(expected, commit, comparison([{ filename: 'docs/source.md', status: 'renamed', previous_filename: 'src/source.cs' }])).docs_only, false);
});
test('missing or unavailable base scanner evidence requires real analysis', async () => {
  for (const value of [[], {}, advanced.slice(1)]) {
    assert.equal((await audit(expected, apiFixture({ 'code-scanning/analyses?ref=refs%2Fheads%2Fmain&tool_name=CodeQL&per_page=100&page=1': () => value }))).mode, 'analysis');
  }
});
test('exact source, base, current main and merge binding reject stale identities', async () => {
  for (const field of ['source', 'base', 'merge', 'authority']) {
    await assert.rejects(audit({ ...expected, [field]: 'd'.repeat(40) }, apiFixture()), /Stale/);
  }
  assert.throws(() => validateIdentity({ ...pr, state: 'closed' }, expected, base), /Stale/);
  assert.throws(() => classifyEvidence(expected, { ...commit, parents: [{ sha: source }, { sha: base }] }, comparison()), /parents/);
});
test('re-read catches head movement after evidence collection', async () => {
  let calls = 0;
  await assert.rejects(audit(expected, apiFixture({ 'pulls/1088': () => ++calls === 1 ? pr : { ...pr, head: { ...pr.head, sha: base } } })), /Stale/);
});
test('both source and actual merge workflow modifications fail closed', async () => {
  for (const sha of [source, merge]) {
    const path = '.github/workflows/security-codeql.yml';
    await assert.rejects(audit(expected, apiFixture({ [`contents/${path}?ref=${sha}`]: () => content(path, Buffer.from('malicious workflow')) })), /Unapproved|blob mismatch/);
  }
});
test('complete frozen workflow approval rejects every semantic analyzer weakening', () => {
  const path = '.github/workflows/security-codeql.yml';
  const original = frozen[path].toString(); verifyDefinition(path, frozen[path]);
  const changes = [
    ['missing pin', (s) => s.replace(/@cdf[a-f0-9]+/g, '@v4')],
    ['changed pin', (s) => s.replace('cdf488', '000000')],
    ['analyze replacement', (s) => s.replace('github/codeql-action/analyze', 'github/codeql-action/upload-sarif')],
    ['arbitrary extra step', (s) => s + '\n      - run: echo bypass\n'],
    ['write permissions', (s) => s.replace('contents: read', 'contents: write')],
    ['weaker threat model', (s) => s.replace('threat-models: [local]', 'threat-models: []')],
    ['build policy', (s) => s.replace('build-mode: none', 'build-mode: manual')],
    ['query policy', (s) => s.replace('build-mode: none', 'build-mode: none\n          queries: ./empty.ql')],
    ['missing init', (s) => s.replace('github/codeql-action/init', 'other/action')],
    ['matrix override', (s) => s.replace('languages: ${{ matrix.language }}', 'languages: python')],
  ];
  for (const [name, change] of changes) {
    assert.notEqual(change(original), original, name);
    assert.throws(() => verifyDefinition(path, Buffer.from(change(original))), /Unapproved/, name);
  }
  const controller = 'tools/ci/codeql-gate.mjs';
  for (const language of ['actions', 'c-cpp', 'csharp', 'javascript-typescript', 'python']) {
    assert.throws(() => verifyDefinition(controller, Buffer.from(frozen[controller].toString().replace(`'${language}'`, "'omitted'"))), /Unapproved/);
  }
});
test('auditor source cannot be replaced and PR helper is only decoded as data', async () => {
  const path = 'tools/ci/codeql-protected-auditor.mjs';
  await assert.rejects(audit(expected, apiFixture({ [`contents/${path}?ref=${source}`]: () => content(path, Buffer.from('throw new Error("executed PR code")')) })), /Changed protected|blob mismatch/);
  const workflow = YAML.parse(readFileSync(new URL('../../../.github/workflows/codeql-protected-auditor.yml', import.meta.url), 'utf8'));
  assert.deepEqual(workflow.on.pull_request_target.branches, ['main']);
  assert.equal(workflow.jobs.audit.steps[0].with.ref, '${{ github.workflow_sha }}');
  assert.equal(workflow.jobs.audit.steps[0].with['persist-credentials'], false);
  assert.deepEqual(workflow.jobs.audit.permissions, { contents: 'read', 'pull-requests': 'read', 'security-events': 'read', checks: 'write' });
  for (const step of workflow.jobs.audit.steps) assert.doesNotMatch(step.run ?? '', /npm |eval|git checkout|git fetch|git switch/);
  const helper = readFileSync(new URL('../codeql-protected-auditor.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(helper, /eval\(|import\(|fetch\(|execSync\(|writeFileSync|env\.GITHUB_EVENT_PATH/);
});
test('malformed, truncated, missing and unavailable API evidence fails closed', async () => {
  for (const value of [{}, { ...comparison(), files: Array(300).fill({ filename: 'docs/a.md', status: 'modified' }) }, comparison([])]) {
    await assert.rejects(audit(expected, apiFixture({ [`compare/${base}...${merge}`]: () => value })), /comparison/i);
  }
  await assert.rejects(audit(expected, async () => { throw new Error('Provider unavailable'); }), /unavailable/);
  const good = content('file', Buffer.from('content'));
  for (const patch of [{ type: 'symlink' }, { encoding: 'none' }, { content: '!!!' }, { sha: base }, { size: 100001 }]) {
    assert.throws(() => decodeFile({ ...good, ...patch }));
  }
});
test('fixed host/path GET boundary and single narrow check POST only', () => {
  assert.equal(apiArgs('pulls/1088')[4], 'GET');
  assert.equal(apiArgs('check-runs', true)[4], 'POST');
  for (const path of ['https://evil.invalid', 'pulls/../settings', 'code-scanning/alerts/1', 'contents/.env?ref=' + base, 'pulls/1088\n']) {
    assert.throws(() => apiArgs(path)); assert.throws(() => apiArgs(path, true));
  }
});

test('Git tree rejects dereferenced symlinks, submodules, missing/duplicate files and truncated evidence', async () => {
  const path = '.github/workflows/security-codeql.yml';
  const normal = await apiFixture()(`git/trees/${source}?recursive=1`);
  for (const patch of [{ mode: '120000' }, { mode: '160000', type: 'commit' }, { sha: base }, { mode: '100755' }]) {
    const tree = { ...normal, tree: normal.tree.map((e) => e.path === path ? { ...e, ...patch } : e) };
    await assert.rejects(audit(expected, apiFixture({ [`git/trees/${source}?recursive=1`]: () => tree })), /regular Git file|blob mismatch/);
  }
  for (const tree of [{ ...normal, truncated: true }, { ...normal, tree: normal.tree.filter((e) => e.path !== path) }, { ...normal, tree: [...normal.tree, normal.tree[0]] }, {}]) {
    await assert.rejects(audit(expected, apiFixture({ [`git/trees/${source}?recursive=1`]: () => tree })), /Git tree|regular Git file/);
  }
});

test('retargeting to another branch at the same SHA fails at either live identity read', async () => {
  const retargeted = { ...pr, base: { ...pr.base, ref: 'ai/integration' } };
  assert.throws(() => validateIdentity(retargeted, expected, base), /Stale/);
  await assert.rejects(audit(expected, apiFixture({ 'pulls/1088': () => retargeted })), /Stale/);
  let calls = 0;
  await assert.rejects(audit(expected, apiFixture({ 'pulls/1088': () => ++calls === 1 ? pr : retargeted })), /Stale/);
});
