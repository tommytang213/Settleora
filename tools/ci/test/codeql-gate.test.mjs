import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { applicability, coverage, gateResult, languages, analysesFor, apiArgs } from '../codeql-gate.mjs';
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

function analysisRecords(sha = head) {
  return languages.map((language) => ({ tool: { name: 'CodeQL' }, commit_sha: sha, analysis_key: '.github/workflows/security-codeql.yml:analyze', category: `/language:${language}`, error: '', warning: '' }));
}
test('source applicability records comparison and policy/workflow identity', () => {
  const proof = applicability({ ...env, GITHUB_WORKFLOW_REF: 'workflow@ref', GITHUB_WORKFLOW_SHA: head }, event, gitFor(['source.cs']));
  assert.equal(proof.base, base);
  assert.equal(proof.source, source);
  assert.equal(proof.head, head);
  assert.equal(proof.classifierSource, head);
  assert.equal(proof.workflowSha, head);
  assert.equal(proof.workflowRef, 'workflow@ref');
  assert.equal(proof.event, 'pull_request');
  assert.equal(proof.ref, env.GITHUB_REF);
  assert.equal(Object.keys(proof.versions).length, 3);
});
test('exact coverage stops before enumerating over 2000 unrelated main analyses', async () => {
  let calls = 0;
  const request = async () => {
    calls++;
    // An arbitrarily long historical inventory has full pages forever.
    return [...analysisRecords(), ...Array.from({ length: 95 }, () => analysisRecords(base)[0])];
  };
  assert.equal(coverage(await analysesFor(env, 'refs/heads/main', head, request), head), true);
  assert.equal(calls, 1);
});
test('coverage crosses page boundaries and refuses missing or malformed records', async () => {
  let calls = 0;
  const records = analysisRecords();
  const request = async () => ++calls === 1 ? [...records.slice(0, 4), ...Array.from({ length: 96 }, () => analysisRecords(base)[0])] : [records[4]];
  assert.equal(coverage(await analysesFor(env, env.GITHUB_REF, head, request), head), true);
  assert.equal(calls, 2);
  assert.equal(coverage(await analysesFor(env, env.GITHUB_REF, head, async () => []), head), false);
  await assert.rejects(analysesFor(env, env.GITHUB_REF, head, async () => ({})), /Malformed/);
  await assert.rejects(analysesFor(env, env.GITHUB_REF, head, async () => { throw new Error('Denied'); }), /Denied/);
});

test('GitHub reads use a fixed host/repository, fixed GET and allowlisted endpoint shapes', () => {
  for (const suffix of ['pulls/1088', `commits/${head}/check-runs?check_name=CodeQL&filter=latest&per_page=100`, 'code-scanning/analyses?ref=refs%2Fheads%2Fmain&tool_name=CodeQL&per_page=100&page=1']) {
    const args = apiArgs(suffix);
    assert.deepEqual(args.slice(0, 5), ['api', '--hostname', 'github.com', '--method', 'GET']);
    assert.equal(args[5], `repos/tommytang213/Settleora/${suffix}`);
  }
  for (const suffix of ['https://attacker.invalid', '//attacker.invalid', 'pulls/../settings', 'pulls/1?redirect=https://evil.invalid', '--method=POST', 'code-scanning/alerts/123', 'pulls/1\n']) {
    assert.throws(() => apiArgs(suffix), /Unsupported/);
  }
});
test('workflow owns file boundaries and helper only reads/writes streams', () => {
  const helper = readFileSync(new URL('../codeql-gate.mjs', import.meta.url), 'utf8');
  assert.match(helper, /readFileSync\(0, 'utf8'\)/);
  assert.doesNotMatch(helper, /appendFileSync|writeFileSync|env\.GITHUB_EVENT_PATH|env\.GITHUB_OUTPUT|env\.GITHUB_STEP_SUMMARY|fetch\(/);
  const w = YAML.parse(readFileSync(new URL('../../../.github/workflows/security-codeql.yml', import.meta.url), 'utf8'));
  assert.equal(w.jobs.prepare.steps.at(-1).run, 'node tools/ci/codeql-gate.mjs prepare < "$GITHUB_EVENT_PATH" >> "$GITHUB_OUTPUT"');
  assert.equal(w.jobs.gate.steps.at(-1).run, 'node tools/ci/codeql-gate.mjs gate < "$GITHUB_EVENT_PATH" >> "$GITHUB_STEP_SUMMARY"');
});
