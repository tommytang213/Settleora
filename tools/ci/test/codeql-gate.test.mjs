import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { applicability, coverage, gateResult, languages } from '../codeql-gate.mjs';
import { summarizeCheckStatus } from '../../auto-runner/lib/auto-merge-policy.mjs';

const base = 'a'.repeat(40), head = 'b'.repeat(40), source = 'c'.repeat(40);
const env = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_SHA: head, GITHUB_REF: 'refs/pull/1087/merge', GITHUB_REPOSITORY: 'tommytang213/Settleora' };
const event = { pull_request: { number: 1087, base: { sha: base, ref: 'main', repo: { full_name: env.GITHUB_REPOSITORY } }, head: { sha: source, ref: 'docs/misleading' } } };
function gitFor(paths = ['docs/guide.md'], overrides = {}) {
  return (args) => {
    if (overrides[args[0]]) return overrides[args[0]](args);
    if (args.includes('--is-shallow-repository')) return 'false';
    if (args[0] === 'rev-parse') return args.includes('HEAD^{commit}') ? head : base;
    if (args[0] === 'merge-base') return '';
    if (args[0] === 'diff') return paths.length ? paths.join('\0') + '\0' : '';
    if (args[0] === 'show') return args.includes('--format=%P') ? `${base} ${source}` : 'trusted policy';
    throw new Error(`Unexpected git: ${args}`);
  };
}
const needs = { prepare: 'success', analyze: 'success' };
const expected = { head, source };
const native = { name: 'CodeQL', app: { slug: 'github-advanced-security' }, head_sha: source, status: 'completed', conclusion: 'success' };

test('docs PR has one lightweight work item and explicit trusted success', () => {
  const proof = applicability(env, event, gitFor());
  assert.equal(proof.mode, 'docs-only');
  assert.deepEqual(proof.languages, ['docs-only']);
  assert.equal(gateResult(proof, expected, needs), true);
});
for (const path of ['services/api/Source.cs', 'tests/source.test.mjs', '.github/workflows/test.yml', 'tools/a.mjs', 'scripts/a.sh', 'package.json', 'package-lock.json', 'config.json', '.github/security.yml', 'apps/mobile/a.dart', 'packages/contracts/openapi/a.yaml', 'infra/Dockerfile', 'migrations/1.sql', 'docs/code.js']) {
  test(`${path}: source relevance overrides misleading docs branch`, () => {
    const proof = applicability(env, event, gitFor([path]));
    assert.equal(proof.mode, 'analysis');
    assert.deepEqual(proof.languages, languages);
  });
}
for (const [name, git] of [
  ['empty', gitFor([])], ['failed', () => { throw new Error('Unavailable'); }],
  ['malformed', gitFor([], { diff: () => 'docs/a.md' })],
  ['ambiguous', gitFor([], { diff: () => 'docs/a.md\0\0' })],
  ['stale head', gitFor([], { 'rev-parse': () => source })],
  ['contradictory parents', gitFor(['README.md'], { show: () => `${base} ${head}` })],
  ['changed policy', gitFor(['README.md'], { show: (a) => a.includes('--format=%P') ? `${base} ${source}` : a[1] })],
]) test(`${name} proof selects real analysis`, () => assert.equal(applicability(env, event, git).mode, 'analysis'));
for (const name of ['schedule', 'push', 'workflow_dispatch', 'unknown']) {
  test(`${name} unconditionally selects repository-wide CodeQL`, () => {
    assert.equal(applicability({ ...env, GITHUB_EVENT_NAME: name }, event, gitFor()).mode, 'analysis');
  });
}
test('changed source head or malformed event invalidates applicability', () => {
  const proof = applicability(env, event, gitFor());
  assert.equal(gateResult(proof, { head, source: base }, needs), false);
  assert.equal(applicability(env, {}, gitFor()).mode, 'analysis');
  assert.equal(applicability({ ...env, GITHUB_REF: 'refs/heads/docs/fake' }, event, gitFor()).mode, 'analysis');
});
test('missing proof, branch name, missing/failed/skipped jobs never pass', () => {
  assert.equal(gateResult(null, expected, needs), false);
  assert.equal(gateResult({ mode: 'docs-only', head, source, branch: 'docs/x' }, expected, needs), false);
  const proof = applicability(env, event, gitFor());
  for (const result of ['failure', 'skipped', 'neutral', 'cancelled', undefined]) {
    assert.equal(gateResult(proof, expected, { ...needs, analyze: result }), false);
  }
});
test('source gate requires completed full matrix AND genuine exact-head findings check', () => {
  const proof = applicability(env, event, gitFor(['source.cs']));
  assert.equal(gateResult(proof, expected, needs, [native]), true);
  for (const checks of [[], [{ ...native, status: 'in_progress' }], [{ ...native, conclusion: 'failure' }], [{ ...native, head_sha: base }], [{ ...native, app: { slug: 'github-actions' } }]]) {
    assert.equal(gateResult(proof, expected, needs, checks), false);
  }
  assert.equal(gateResult(proof, expected, { ...needs, analyze: 'failure' }, [native]), false);
});
test('all five advanced categories must be successfully processed at exact commit', () => {
  const records = languages.map((language) => ({ tool: { name: 'CodeQL' }, commit_sha: head, analysis_key: '.github/workflows/security-codeql.yml:analyze', category: `/language:${language}`, error: '', warning: '' }));
  assert.equal(coverage(records, head), true);
  for (let i = 0; i < records.length; i++) {
    assert.equal(coverage(records.filter((_, j) => i !== j), head), false);
    for (const patch of [{ commit_sha: base }, { error: 'failed' }, { warning: 'incomplete' }, { analysis_key: 'dynamic/github-code-scanning/codeql:analyze' }]) {
      assert.equal(coverage(records.map((r, j) => j === i ? { ...r, ...patch } : r), head), false);
    }
  }
});
test('existing merge policy refuses missing CodeQL, pending and skipped checks', () => {
  const checks = ['Validate scaffold', 'CodeQL', 'Semgrep CE scan', 'Trivy repository scan'].map((name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' }));
  assert.equal(summarizeCheckStatus(checks).state, 'success');
  assert.equal(summarizeCheckStatus(checks.filter((c) => c.name !== 'CodeQL')).state, 'missing');
  assert.equal(summarizeCheckStatus([...checks, { name: 'CodeQL work (csharp)', status: 'IN_PROGRESS' }]).state, 'pending');
  assert.equal(summarizeCheckStatus([...checks, { name: 'CodeQL work (csharp)', status: 'COMPLETED', conclusion: 'SKIPPED' }]).state, 'failed');
});
test('supported workflow wiring preserves languages, queries, threat and mandatory scanners', () => {
  const text = readFileSync(new URL('../../../.github/workflows/security-codeql.yml', import.meta.url), 'utf8');
  const w = YAML.parse(text);
  assert.deepEqual(w.on.push.branches, ['main', 'uat', 'prod', 'release/*', 'hotfix/*']);
  assert.deepEqual(w.on.pull_request.branches, w.on.push.branches);
  assert.equal(w.on.schedule.length, 1);
  assert.ok('workflow_dispatch' in w.on);
  assert.equal(w.jobs.gate.name, 'CodeQL');
  assert.equal(w.jobs.gate.if, 'always()');
  assert.deepEqual(w.jobs.gate.needs, ['prepare', 'analyze']);
  assert.equal(w.jobs.analyze.strategy['fail-fast'], false);
  assert.equal(w.jobs.analyze.if, undefined);
  const init = w.jobs.analyze.steps.find((s) => s.name === 'Initialize CodeQL');
  assert.equal(init.with['build-mode'], 'none');
  assert.deepEqual(YAML.parse(init.with.config), { 'threat-models': ['local'] });
  assert.equal(init.with.queries, undefined);
  const analyze = w.jobs.analyze.steps.find((s) => s.name === 'Analyze and process CodeQL');
  assert.equal(analyze.with['wait-for-processing'], true);
  assert.equal(analyze.with.upload, undefined);
  assert.equal(analyze.with['skip-queries'], undefined);
  assert.equal(analyze.if, "matrix.language != 'docs-only'");
  assert.deepEqual(languages, ['actions', 'c-cpp', 'csharp', 'javascript-typescript', 'python']);
  const policy = JSON.parse(readFileSync(new URL('../../../.devcommand/repository-policy.json', import.meta.url)));
  assert.deepEqual(policy.checks.exactNames, ['Validate scaffold', 'CodeQL', 'Semgrep CE scan', 'Trivy repository scan']);
  assert.equal(policy.merge.requireExactHead, true);
  for (const file of ['security-semgrep.yml', 'security-trivy.yml', 'scaffold-validation.yml']) {
    assert.ok(YAML.parse(readFileSync(new URL(`../../../.github/workflows/${file}`, import.meta.url), 'utf8')).on.pull_request !== undefined);
  }
});
