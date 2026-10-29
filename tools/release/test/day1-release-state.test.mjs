import test from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, chmodSync, symlinkSync, linkSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SCHEMA as R03_SCHEMA, canonicalJson } from '../day1-release-identity.mjs';
import { SCHEMA, STATES, EVIDENCE_KINDS, validateReleaseState, inspectReleaseState, inspectProposedTransition } from '../day1-release-state.mjs';
import { main, readFixtureState } from '../day1-release-state-cli.mjs';

const source = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
const rc = { version: '1.2.0', ordinal: 1, tag: 'v1.2.0-rc.1' };
const digest = `sha256:${'c'.repeat(64)}`;
const state = (changes = {}) => ({ schema: SCHEMA, revision: 0, state: 'DEVELOPMENT', source: { ...source }, rc: null, artifacts: {}, evidence: [], ...changes });
const evidence = (kind, changes = {}) => ({ kind, source: { ...source }, rcTag: rc.tag, artifacts: { 'api-image': digest }, reference: 'synthetic-evidence', ...changes });
function fixture(t, value = state()) {
  const root = mkdtempSync(path.join(tmpdir(), 'settleora-release-state-fixture-'));
  chmodSync(root, 0o700);
  const filename = path.join(root, 'state.json');
  writeFileSync(filename, JSON.stringify(value), { mode: 0o600 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, filename };
}

test('schema lists agreed states and R03 identity convention without competing release identity', () => {
  const schema = JSON.parse(readFileSync(new URL('../day1-release-state.schema.json', import.meta.url)));
  assert.deepEqual(schema.properties.state.enum, STATES);
  assert.deepEqual(schema.$defs.evidence.properties.kind.enum, EVIDENCE_KINDS);
  assert.equal(schema.$defs.evidence.properties.identity.properties.schema.const, R03_SCHEMA);
  assert.equal(schema.additionalProperties, false);
});

test('pre-artifact states do not demand a completed R03 identity or artifacts', () => {
  for (const input of [state(), state({ state: 'RC_CUT', rc })]) {
    const report = inspectReleaseState(input);
    assert.ok(!report.blockers.includes('evidence_missing:r03_identity'));
    assert.ok(!report.blockers.includes('artifacts_missing'));
    assert.equal(report.operationAuthorized, false);
  }
});

test('validation is deterministic, does not mutate input and makes no authority claim', () => {
  const input = state(); const before = structuredClone(input);
  assert.equal(canonicalJson(validateReleaseState(input)), canonicalJson(before));
  assert.deepEqual(input, before);
  assert.deepEqual(inspectReleaseState(input), inspectReleaseState(before));
  assert.equal(inspectReleaseState(input).readiness, 'not_authorized');
});

test('missing, stale source/RC/artifact evidence remains blocked', () => {
  const input = state({ state: 'RC_BUILT', rc, artifacts: { 'api-image': digest }, evidence: [evidence('qualification', { source: { ...source, commit: 'd'.repeat(40) }, rcTag: 'v1.2.0-rc.2', artifacts: { 'api-image': `sha256:${'d'.repeat(64)}` } })] });
  const report = inspectReleaseState(input);
  for (const code of ['evidence_missing:r03_identity', 'evidence_source_mismatch:qualification', 'evidence_rc_mismatch:qualification', 'evidence_artifacts_mismatch:qualification']) assert.ok(report.blockers.includes(code));
});

test('adding an RC and built artifacts does not invent a new source-acceptance or pre-build qualification requirement', () => {
  const input = state({ state: 'RC_BUILT', rc, artifacts: { 'api-image': digest }, evidence: [
    evidence('source_acceptance', { rcTag: null, artifacts: {} }), evidence('qualification', { artifacts: {} }),
  ] });
  const report = inspectReleaseState(input);
  assert.ok(!report.blockers.includes('evidence_rc_mismatch:source_acceptance'));
  assert.ok(!report.blockers.includes('evidence_artifacts_mismatch:source_acceptance'));
  assert.ok(!report.blockers.includes('evidence_artifacts_mismatch:qualification'));
  const uat = inspectReleaseState({ ...input, evidence: [evidence('uat', { artifacts: {} })] });
  assert.ok(uat.blockers.includes('evidence_artifacts_mismatch:uat'));
});

test('every declared state remains offline and unauthenticated, including production names', () => {
  for (const name of STATES) {
    const report = inspectReleaseState(state({ state: name }));
    assert.equal(report.operationAuthorized, false);
    assert.equal(report.readiness, 'not_authorized');
    assert.ok(report.blockers.includes('offline_evidence_not_authenticated'));
  }
});

test('R03 digest is retained, not recomputed or substituted by another algorithm', () => {
  const identityDigest = 'e'.repeat(64);
  const input = state({ rc, evidence: [evidence('r03_identity', { artifacts: {}, identity: { schema: R03_SCHEMA, identityDigest } })] });
  assert.equal(validateReleaseState(input).evidence[0].identity.identityDigest, identityDigest);
  assert.ok(inspectReleaseState(input).blockers.includes('evidence_unverified:r03_identity'));
  assert.throws(() => validateReleaseState(state({ evidence: [evidence('r03_identity')] })));
});

test('self-asserted human approval and a production state never grant permission', () => {
  const input = state({ state: 'PROD_APPROVED', rc, artifacts: { 'api-image': digest }, evidence: [evidence('human_production_approval')] });
  const report = inspectReleaseState(input);
  assert.equal(report.operationAuthorized, false);
  assert.equal(report.stateWritten, false);
  assert.ok(report.blockers.includes('human_production_approval_unverified'));
  assert.throws(() => validateReleaseState({ ...input, approved: true }));
  assert.throws(() => validateReleaseState({ ...input, evidence: [{ ...input.evidence[0], approved: true }] }));
});

test('proposal checks preserve immutable RC/source/artifacts and revision ordering', () => {
  const previous = state({ state: 'RC_CUT', rc, artifacts: { 'api-image': digest } });
  const next = { ...previous, state: 'QUALIFYING', revision: 1 };
  assert.equal(inspectProposedTransition(previous, next).transitionApplied, false);
  assert.equal(inspectProposedTransition(previous, previous).noOp, true);
  assert.throws(() => inspectProposedTransition(previous, { ...next, revision: 2 }));
  assert.throws(() => inspectProposedTransition(previous, { ...next, source: { ...source, commit: 'd'.repeat(40) } }));
  assert.throws(() => inspectProposedTransition(previous, { ...next, rc: { ...rc, ordinal: 2, tag: 'v1.2.0-rc.2' } }));
  assert.throws(() => inspectProposedTransition(previous, { ...next, artifacts: { 'api-image': `sha256:${'d'.repeat(64)}` } }));
  assert.throws(() => inspectProposedTransition(previous, { ...next, state: 'RELEASED' }));
});

test('no transition from rejected UAT can reuse the old RC for another UAT attempt', () => {
  const previous = state({ state: 'UAT_REJECTED', rc });
  assert.throws(() => inspectProposedTransition(previous, { ...previous, revision: 1, state: 'UAT_DEPLOYED' }));
  assert.equal(inspectProposedTransition(previous, { ...previous, revision: 1, state: 'SUPERSEDED' }).operationAuthorized, false);
});

test('rejected UAT retains prior qualification/artifact blockers and promotion needs reconciliation', () => {
  const rejected = inspectReleaseState(state({ state: 'UAT_REJECTED', rc }));
  for (const code of ['evidence_missing:qualification', 'evidence_missing:r03_identity', 'evidence_missing:uat', 'artifacts_missing']) assert.ok(rejected.blockers.includes(code));
  assert.ok(inspectReleaseState(state({ state: 'PROMOTING', rc })).blockers.includes('evidence_missing:provider_reconciliation'));
  assert.ok(inspectReleaseState(state({ rc })).blockers.includes('rc_declared_before_cut'));
});

for (const invalid of [null, [], {}, state({ revision: -1 }), state({ revision: 1.5 }), state({ schema: 'other' }), state({ state: 'READY' }), state({ source: { commit: 'x', tree: source.tree } }), state({ rc: { ...rc, tag: 'v1.2.0-rc.2' } }), state({ artifacts: { 'api-image': 'latest' } }), state({ artifacts: { unknown: digest } }), state({ evidence: [evidence('uat'), evidence('uat')] }), state({ evidence: [evidence('uat', { reference: '/private/path' })] })]) {
  test(`rejects malformed state ${JSON.stringify(invalid).slice(0, 70)}`, () => assert.throws(() => validateReleaseState(invalid)));
}

test('CLI reads only explicit private fixture input without modifying bytes or modes', (t) => {
  const { root, filename } = fixture(t); const before = readFileSync(filename), mode = statSync(filename).mode;
  assert.equal(main(['validate', '--fixture-root', root, '--state', 'state.json']).structurallyValid, true);
  assert.equal(main(['inspect', '--fixture-root', root, '--state', filename]).operationAuthorized, false);
  assert.deepEqual(readFileSync(filename), before); assert.equal(statSync(filename).mode, mode);
});

test('CLI rejects symlink, escape, public mode, oversized and malformed fixture inputs', (t) => {
  const { root, filename } = fixture(t);
  symlinkSync(filename, path.join(root, 'link.json'));
  assert.throws(() => readFixtureState(root, 'link.json'));
  assert.throws(() => readFixtureState(root, '../outside.json'));
  chmodSync(filename, 0o644); assert.throws(() => readFixtureState(root, filename)); chmodSync(filename, 0o600);
  writeFileSync(filename, 'x'.repeat(65537)); assert.throws(() => readFixtureState(root, filename));
  writeFileSync(filename, '{'); assert.throws(() => readFixtureState(root, filename));
  chmodSync(root, 0o755); assert.throws(() => readFixtureState(root, filename)); chmodSync(root, 0o700);
});

test('CLI rejects directories, hardlinked inputs and non-private intermediate directories', (t) => {
  const { root, filename } = fixture(t);
  const directory = path.join(root, 'nested'); mkdirSync(directory, { mode: 0o700 });
  assert.throws(() => readFixtureState(root, 'nested'));
  linkSync(filename, path.join(root, 'alias.json'));
  assert.throws(() => readFixtureState(root, 'alias.json'));
  writeFileSync(path.join(directory, 'private.json'), JSON.stringify(state()), { mode: 0o600 });
  chmodSync(directory, 0o755); assert.throws(() => readFixtureState(root, 'nested/private.json'));
});

test('CLI has no implicit path, mutation command, provider invocation or output writer', (t) => {
  const { root } = fixture(t);
  for (const command of ['create', 'apply', 'approve', 'transition', 'persist', 'collect-android']) assert.throws(() => main([command, '--fixture-root', root, '--state', 'state.json']));
  assert.throws(() => main([]));
  const cli = fileURLToPath(new URL('../day1-release-state-cli.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'inspect', '--fixture-root', root, '--state', 'state.json'], { encoding: 'utf8', env: { PATH: '', HOME: root, TMPDIR: root } });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.length, JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.code, stderr: result.stderr }));
  assert.equal(JSON.parse(result.stdout).operationAuthorized, false);
});

 test('CLI rejects duplicate top-level and nested JSON members', (t) => {
  const { root, filename } = fixture(t);
  for (const text of [JSON.stringify(state()).replace('"revision":0', '"revision":1,"revision":0'),
    JSON.stringify(state()).replace('"commit":', '"commit":"' + 'c'.repeat(40) + '","commit":')]) {
    writeFileSync(filename, text);
    assert.throws(() => readFixtureState(root, filename));
  }
});

test('CLI rejects an intermediate directory swapped during the read', (t) => {
  const { root } = fixture(t);
  const nested = path.join(root, 'nested');
  mkdirSync(nested, { mode: 0o700 });
  const filename = path.join(nested, 'state.json');
  writeFileSync(filename, JSON.stringify(state()), { mode: 0o600 });
  const originalRead = fs.readSync;
  let swapped = false;
  fs.readSync = (...args) => {
    if (!swapped) {
      swapped = true;
      fs.renameSync(nested, path.join(root, 'original'));
      fs.symlinkSync(path.join(root, 'original'), nested);
    }
    return originalRead(...args);
  };
  syncBuiltinESMExports();
  try { assert.throws(() => readFixtureState(root, filename)); assert.equal(swapped, true); }
  finally { fs.readSync = originalRead; syncBuiltinESMExports(); }
});

test('terminal RELEASED and SUPERSEDED cannot transition to BLOCKED or each other', () => {
  for (const terminal of ['RELEASED', 'SUPERSEDED']) {
    const previous = state({ state: terminal, rc });
    for (const destination of ['BLOCKED', 'RELEASED', 'SUPERSEDED']) {
      if (destination !== terminal) assert.throws(() => inspectProposedTransition(previous, { ...previous, revision: 1, state: destination }), /terminal_state_conflict/u);
    }
  }
});

test('terminal declarations allow exact no-op only, not same-state revisions', () => {
  for (const terminal of ['RELEASED', 'SUPERSEDED']) {
    const previous = state({ state: terminal, rc });
    assert.equal(inspectProposedTransition(previous, previous).noOp, true);
    for (const changes of [{}, { artifacts: { 'api-image': digest } }, { evidence: [evidence('source_acceptance')] }])
      assert.throws(() => inspectProposedTransition(previous, { ...previous, ...changes, revision: 1 }), /terminal_state_conflict/u);
  }
});
