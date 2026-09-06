import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { classifyChanges } from '../scaffold-validation-changes.mjs';

function fixture(t, filename = 'docs/guide.md') {
  const root = mkdtempSync(path.join(tmpdir(), 'scaffold-classifier-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  mkdirSync(repo);
  const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Classifier Test']);
  git(['config', 'user.email', 'classifier@example.invalid']);
  writeFileSync(path.join(repo, 'README.md'), 'Base\n');
  git(['add', 'README.md']); git(['commit', '-m', 'base']);
  const base = git(['rev-parse', 'HEAD']).trim();
  const remote = path.join(root, 'remote.git');
  execFileSync('git', ['clone', '--bare', repo, remote], { stdio: 'ignore' });
  git(['remote', 'add', 'origin', remote]);
  git(['switch', '-c', 'docs/misleading']);
  mkdirSync(path.dirname(path.join(repo, filename)), { recursive: true });
  writeFileSync(path.join(repo, filename), 'Change\n');
  git(['add', filename]); git(['commit', '-m', 'delta']);
  const head = git(['rev-parse', 'HEAD']).trim();
  return { git, base, head, repo, env: { EVENT_NAME: 'push', EVENT_REF: 'refs/heads/docs/misleading', BEFORE_SHA: '0'.repeat(40), CURRENT_SHA: head } };
}

for (const [filename, full] of [['docs/guide.md', false], ['services/api/source.cs', true], ['.github/workflows/test.yml', true]]) {
  for (const event of ['first', 'subsequent', 'pr']) {
    test(`${event}: ${filename} -> ${full ? 'full' : 'lightweight'}`, (t) => {
      const f = fixture(t, filename);
      if (event === 'subsequent') f.env.BEFORE_SHA = f.base;
      if (event === 'pr') Object.assign(f.env, { EVENT_NAME: 'pull_request', PR_BASE_SHA: f.base });
      assert.equal(classifyChanges(f.env, f.git).run_full_validation, full);
    });
  }
}

test('missing before on non-default branch uses fixed main proof', (t) => {
  const f = fixture(t); delete f.env.BEFORE_SHA;
  assert.equal(classifyChanges(f.env, f.git).docs_only, true);
});
for (const ref of ['refs/heads/main', 'refs/tags/docs/test', '', undefined]) {
  test(`zero-before default/non-branch ref ${ref} fails closed`, (t) => {
    const f = fixture(t); f.env.EVENT_REF = ref;
    assert.equal(classifyChanges(f.env, f.git).run_full_validation, true);
  });
}
for (const [label, command, output] of [
  ['unfetchable main', 'fetch', null],
  ['missing main ref', 'rev-parse', null],
  ['missing merge-base', 'merge-base', ''],
  ['ambiguous merge-base', 'merge-base', 'a'.repeat(40) + '\n' + 'b'.repeat(40)],
  ['invalid merge-base', 'merge-base', 'invalid'],
  ['failed diff', 'diff', null],
  ['empty diff', 'diff', ''],
  ['unterminated diff', 'diff', 'docs/guide.md'],
  ['empty filename', 'diff', 'docs/guide.md\0\0'],
  ['newline filename', 'diff', 'docs/injected\noutput.md\0'],
]) {
  test(`${label} fails closed`, (t) => {
    const f = fixture(t);
    const git = (args) => {
      if (args[0] === command && (command !== 'rev-parse' || args.includes('refs/remotes/origin/main^{commit}'))) {
        if (output === null) throw new Error('Injected command failure');
        return output;
      }
      return f.git(args);
    };
    assert.equal(classifyChanges(f.env, git).run_full_validation, true);
  });
}
test('ancestry inconsistency fails closed', (t) => {
  const f = fixture(t);
  const git = (args) => { if (args.includes('--is-ancestor')) throw new Error('Not ancestor'); return f.git(args); };
  assert.equal(classifyChanges(f.env, git).run_full_validation, true);
});
test('shallow history fails closed', (t) => {
  const f = fixture(t);
  const git = (args) => args.includes('--is-shallow-repository') ? 'true\n' : f.git(args);
  assert.equal(classifyChanges(f.env, git).run_full_validation, true);
});
test('wrong current head and invalid event SHA fail closed', (t) => {
  const f = fixture(t);
  for (const head of [f.base, '0'.repeat(40), '--upload-pack=bad', undefined]) {
    assert.equal(classifyChanges({ ...f.env, CURRENT_SHA: head }, f.git).run_full_validation, true);
  }
  for (const base of ['--upload-pack=bad', 'f'.repeat(40)]) {
    assert.equal(classifyChanges({ ...f.env, BEFORE_SHA: base }, f.git).run_full_validation, true);
  }
});
test('real empty branch delta fails closed', (t) => {
  const f = fixture(t);
  f.git(['switch', 'main']); f.env.CURRENT_SHA = f.base;
  assert.equal(classifyChanges(f.env, f.git).run_full_validation, true);
});
test('source renamed into docs requires full validation', (t) => {
  const f = fixture(t, 'source.txt');
  mkdirSync(path.join(f.repo, 'docs'));
  f.git(['mv', 'source.txt', 'docs/source.md']);
  f.git(['commit', '-m', 'rename']);
  Object.assign(f.env, { BEFORE_SHA: f.head, CURRENT_SHA: f.git(['rev-parse', 'HEAD']).trim() });
  assert.equal(classifyChanges(f.env, f.git).run_full_validation, true);
});
test('workflow uses shared classifier and retains six expensive step gates', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/scaffold-validation.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: node tools\/ci\/scaffold-validation-changes.mjs/);
  assert.equal(workflow.match(/if: steps.changes.outputs.run_full_validation == 'true'/g)?.length, 6);
  for (const command of ['npm ci', 'npm run validate:scaffold']) assert.ok(workflow.includes(`run: ${command}`));
  assert.match(workflow, /contents: read/);
});

for (const [filename, full] of [['docs/guide.md', false], ['services/api/source.cs', true]]) {
  test(`PR merge checkout: ${filename}`, (t) => {
    const f = fixture(t, filename);
    f.git(['switch', 'main']);
    writeFileSync(path.join(f.repo, 'main-only.txt'), 'New main change\n');
    f.git(['add', 'main-only.txt']); f.git(['commit', '-m', 'advance main']);
    const prBase = f.git(['rev-parse', 'HEAD']).trim();
    f.git(['merge', '--no-ff', 'docs/misleading', '-m', 'PR merge']);
    const mergeHead = f.git(['rev-parse', 'HEAD']).trim();
    const env = { ...f.env, EVENT_NAME: 'pull_request', PR_BASE_SHA: prBase, CURRENT_SHA: mergeHead };
    assert.equal(classifyChanges(env, f.git).run_full_validation, full);
  });
}
test('CLI stdout is fixed outputs only; evidence cannot inject workflow outputs', (t) => {
  const f = fixture(t);
  const cli = new URL('../scaffold-validation-changes.mjs', import.meta.url);
  const stdout = execFileSync(process.execPath, [cli.pathname], {
    cwd: f.repo, env: { ...process.env, ...f.env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(stdout, 'run_full_validation=false\ndocs_only=true\n');
});
