import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = parse(readFileSync(
  path.join(repoRoot, '.github/workflows/mobile-ios-validation.yml'), 'utf8',
));
const job = workflow.jobs['ios-validation'];
const unitStep = job.steps.find((step) => step.name === 'Run RunnerTests Swift unit suite');
const ios18 = 'com.apple.CoreSimulator.SimRuntime.iOS-18-5';
const ios26 = 'com.apple.CoreSimulator.SimRuntime.iOS-26-0';
const phone = (udid, extra = {}) => ({ udid, name: 'iPhone 16', isAvailable: true, ...extra });

function runWorkflowStep(devices, failures = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'settleora-ios-ci-'));
  try {
    const commands = path.join(dir, 'commands.jsonl');
    const record = String.raw`import json, os, sys
from pathlib import Path
with open(os.environ["TEST_COMMAND_LOG"], "a", encoding="utf-8") as log:
    log.write(json.dumps({"command": Path(sys.argv[0]).name, "args": sys.argv[1:]}) + "\n")
`;
    writeFileSync(path.join(dir, 'xcrun'), '#!/usr/bin/env python3\n' + record + String.raw`
if sys.argv[1:3] == ["simctl", "list"]:
    if os.environ["TEST_LIST_EXIT"] != "0":
        sys.exit(int(os.environ["TEST_LIST_EXIT"]))
    print(os.environ["TEST_DEVICES_JSON"])
elif sys.argv[1:3] == ["simctl", "bootstatus"]:
    sys.exit(int(os.environ["TEST_BOOT_EXIT"]))
else:
    sys.exit("unexpected xcrun call")
`, { mode: 0o755 });
    writeFileSync(path.join(dir, 'xcodebuild'), '#!/usr/bin/env python3\n' + record +
      'sys.exit(int(os.environ["TEST_XCODE_EXIT"]))\n', { mode: 0o755 });
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', unitStep.run], {
      encoding: 'utf8',
      cwd: dir,
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: dir + path.delimiter + process.env.PATH,
        RUNNER_TEMP: dir,
        TEST_COMMAND_LOG: commands,
        TEST_DEVICES_JSON: typeof devices === 'string' ? devices : JSON.stringify({ devices }),
        TEST_LIST_EXIT: String(failures.list ?? 0),
        TEST_BOOT_EXIT: String(failures.boot ?? 0),
        TEST_XCODE_EXIT: String(failures.xcode ?? 0),
      },
    });
    return {
      ...result,
      dir,
      commands: readFileSync(commands, 'utf8').trim().split('\n').map(JSON.parse),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Swift unit execution keeps the original compile and exact-source gates', () => {
  assert.ok(unitStep, 'RunnerTests must have an executable workflow step');
  assert.equal(unitStep['working-directory'], 'apps/mobile/ios');
  assert.equal(unitStep.shell, 'bash');
  assert.equal(unitStep.if, undefined);
  assert.equal(unitStep['continue-on-error'], undefined);
  assert.ok(unitStep['timeout-minutes'] > 0 && unitStep['timeout-minutes'] <= 30);
  const buildIndex = job.steps.findIndex((step) => step.run === 'flutter build ios --debug --simulator');
  assert.ok(buildIndex >= 0 && job.steps.indexOf(unitStep) > buildIndex);
  assert.ok(job.steps.some((step) => step.with?.ref === '${{ inputs.checkout_ref }}'));
  assert.ok(job.steps.some((step) => step.run?.includes('test "${actual_head}" = "${EXPECTED_HEAD}"')));
  assert.deepEqual(Object.keys(workflow.on).sort(), ['workflow_call', 'workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
});

test('available iPhone selection executes all RunnerTests and retains a result bundle', () => {
  const result = runWorkflowStep({
    'com.apple.CoreSimulator.SimRuntime.tvOS-26-0': [phone('TV')],
    [ios18]: [phone('OLD')],
    [ios26]: [
      phone('UNAVAILABLE', { isAvailable: false }),
      phone('IPAD', { name: 'iPad Pro' }),
      phone('CURRENT'),
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.commands, [
    { command: 'xcrun', args: ['simctl', 'list', 'devices', 'available', '--json'] },
    { command: 'xcrun', args: ['simctl', 'bootstatus', 'CURRENT', '-b'] },
    { command: 'xcodebuild', args: [
      'test', '-workspace', 'Runner.xcworkspace', '-scheme', 'Runner',
      '-configuration', 'Debug', '-destination', 'platform=iOS Simulator,id=CURRENT',
      '-destination-timeout', '120', '-parallel-testing-enabled', 'NO',
      '-only-testing:RunnerTests', '-resultBundlePath',
      path.join(result.dir, 'settleora-runner-tests.xcresult'), 'CODE_SIGNING_ALLOWED=NO',
    ] },
  ]);
  const upload = job.steps.find((step) => step.name === 'Retain RunnerTests results');
  assert.equal(upload.if, '${{ always() }}');
  assert.equal(upload.uses, 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
  assert.equal(upload.with.path, '${{ runner.temp }}/settleora-runner-tests.xcresult');
  assert.equal(upload.with['retention-days'], 7);
});

test('selection falls back to an available older iOS runtime', () => {
  const result = runWorkflowStep({
    [ios26]: [phone('MISSING', { isAvailable: false })],
    [ios18]: [phone('AVAILABLE')],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.commands[1].args[2], 'AVAILABLE');
});

test('missing iPhone and malformed simulator output fail before XCTest', () => {
  for (const devices of [
    {},
    { [ios26]: [phone('IPAD', { name: 'iPad Pro' }), phone('NO', { isAvailable: false })] },
    '{invalid JSON',
  ]) {
    const result = runWorkflowStep(devices);
    assert.notEqual(result.status, 0);
    assert.equal(result.commands.length, 1, 'must not boot or test without a valid simulator');
  }
});

test('simulator listing, boot, and XCTest failures remain failed workflow steps', () => {
  for (const [failures, status, count] of [
    [{ list: 7 }, 7, 1],
    [{ boot: 8 }, 8, 2],
    [{ xcode: 65 }, 65, 3],
  ]) {
    const result = runWorkflowStep({ [ios18]: [phone('AVAILABLE')] }, failures);
    assert.equal(result.status, status, result.stderr);
    assert.equal(result.commands.length, count);
  }
});
