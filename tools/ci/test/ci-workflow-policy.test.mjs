import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');
const workflow = (name) => parse(read(`.github/workflows/${name}`));
const stepsFor = (job) => job.steps ?? [];
const runCommands = (job) => stepsFor(job).map((step) => step.run).filter(Boolean);
const flutterVersion = '3.44.8';
const sharedMobileReleaseGate = './tool/validate-release.sh';

test('required-check budget documents every classifier lane', () => {
  const policy = read('docs/workflow/CODEX_VALIDATION_REPORT_BUDGET.md');
  assert.match(policy, /docs-only, full, mobile, iOS, and user-web routing decisions/);
  assert.match(policy, /Proof failures conservatively emit full, mobile, iOS, and user-web requirements/);
  assert.match(policy, /User-web validation is selected for `apps\/web-user\/\*\*` and `packages\/client-web\/\*\*`/);
});

test('scaffold orchestration preserves the stable fail-closed aggregate', () => {
  const scaffold = workflow('scaffold-validation.yml');
  assert.deepEqual(scaffold.on.pull_request.branches, ['main', 'ai/integration']);
  assert.equal(scaffold.on.pull_request.paths, undefined);
  assert.equal(scaffold.on.pull_request['paths-ignore'], undefined);
  assert.deepEqual(scaffold.permissions, { contents: 'read' });

  const classify = scaffold.jobs.classify;
  assert.equal(classify.outputs.docs_only, '${{ steps.changes.outputs.docs_only }}');
  for (const output of ['run_full_validation', 'run_mobile_validation', 'run_ios_validation', 'run_web_user_validation']) {
    assert.equal(classify.outputs[output], `\${{ steps.changes.outputs.${output} }}`);
  }
  assert.ok(runCommands(classify).includes('npm run validate:scaffold'));
  assert.ok(runCommands(classify).includes('node --test tools/ci/test/*.test.mjs'));

  const aggregate = scaffold.jobs.aggregate;
  assert.equal(aggregate.name, 'Validate scaffold');
  assert.equal(aggregate.if, '${{ always() }}');
  assert.deepEqual(aggregate.needs, ['classify', 'full-validation', 'mobile-validation', 'ios-validation', 'web-user-validation']);
  const gateStep = stepsFor(aggregate).find((step) => step.run?.includes('--validate-gate'));
  assert.ok(gateStep);
  assert.deepEqual(Object.keys(gateStep.env).sort(), [
    'CLASSIFY_RESULT',
    'EVENT_NAME',
    'FULL_RESULT',
    'IOS_RESULT',
    'MOBILE_RESULT',
    'RUN_FULL_VALIDATION',
    'RUN_IOS_VALIDATION',
    'RUN_MOBILE_VALIDATION',
    'RUN_WEB_USER_VALIDATION',
    'WEB_USER_RESULT',
  ]);
});

test('user-web lane builds an exact source head and uploads only bounded package evidence', () => {
  const job = workflow('scaffold-validation.yml').jobs['web-user-validation'];
  const manifestHelper = read('tools/ci/user-web-dist-manifest.mjs');
  assert.equal(job.if, "${{ github.event_name == 'pull_request' && needs.classify.outputs.run_web_user_validation == 'true' }}");
  const checkout = stepsFor(job).find((step) => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ github.event.pull_request.head.sha }}');
  const setupNode = stepsFor(job).find((step) => step.uses?.startsWith('actions/setup-node@'));
  assert.equal(setupNode.with['node-version'], '22');
  assert.equal(setupNode.with['cache-dependency-path'], 'apps/web-user/package-lock.json');
  for (const command of ['npm ci', 'npm run lint', 'npm test', 'npm run build']) {
    assert.ok(stepsFor(job).some((step) => step.run === command && step['working-directory'] === 'apps/web-user'));
  }
  assert.ok(runCommands(job).some((command) => command.includes('user-web-dist-manifest.mjs')));
  const packageStep = stepsFor(job).find((step) => step.id === 'package');
  assert.match(packageStep.run, /--staging "\$package_evidence_dir"/);
  assert.match(packageStep.run, /package_evidence_dir=\$package_evidence_dir/);
  assert.match(manifestHelper, /\['--no-replace-objects', 'ls-tree', '-rz', '--full-tree', 'HEAD'\]/);
  assert.match(manifestHelper, /Git replacement refs are not allowed/);
  assert.match(manifestHelper, /const record = output\.subarray\(start, end\)/);
  assert.match(manifestHelper, /const relative = record\.subarray\(tab \+ 1\)/);
  assert.match(manifestHelper, /createHash\('sha1'\)[\s\S]*`blob \$\{contents\.length\}\\0`/);
  assert.doesNotMatch(manifestHelper, /ls-tree[\s\S]{0,200}encoding: 'utf8'/);
  assert.match(manifestHelper, /readlinkSync\(absolute, \{ encoding: 'buffer' \}\)/);
  assert.match(manifestHelper, /readFileSync\(absolute\)/);
  assert.match(manifestHelper, /Tracked build input ancestor is not a real directory/);
  assert.doesNotMatch(manifestHelper, /git\(\['status'/);
  const upload = stepsFor(job).find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.uses, 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
  assert.equal(upload.with.name, 'user-web-dist-${{ github.event.pull_request.head.sha }}');
  assert.equal(upload.with.path, '${{ steps.package.outputs.package_evidence_dir }}/');
  assert.equal(upload.with['include-hidden-files'], true);
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(upload.with['retention-days'], 14);
  assert.doesNotMatch(JSON.stringify(job), /continue-on-error|npm run dev|vite preview|vite --host|deploy|pages|cloudflare|netlify|vercel/i);
});

test('full and mobile validation commands remain unweakened', () => {
  const scaffold = workflow('scaffold-validation.yml');
  const fullCommands = runCommands(scaffold.jobs['full-validation']);
  for (const command of [
    'npm run validate:openapi',
    'npm run validate:clients',
    'npm run validate:api',
    'npm run validate:compose',
    'npm run validate:api-docker',
  ]) assert.ok(fullCommands.includes(command));

  const mobile = scaffold.jobs['mobile-validation'];
  assert.equal(mobile.if, "${{ github.event_name == 'pull_request' && needs.classify.outputs.run_mobile_validation == 'true' }}");
  assert.equal(runCommands(mobile).at(-1), 'npm run validate:mobile');
  const mobileFlutter = stepsFor(mobile).find((step) => step.uses?.startsWith('subosito/flutter-action@'));
  assert.equal(mobileFlutter.with.channel, 'stable');
  assert.equal(mobileFlutter.with['flutter-version'], flutterVersion);
  assert.doesNotMatch(JSON.stringify(mobile), /\/opt\/flutter|\/workspace\/logs/);
  assert.doesNotMatch(JSON.stringify(mobile), /continue-on-error|--no-fatal-warnings|\|\|\s*true/);

  const packageJson = JSON.parse(read('package.json'));
  assert.equal(
    packageJson.scripts['validate:mobile'],
    `node tools/doctor-validation.mjs --mobile && cd apps/mobile && ${sharedMobileReleaseGate}`,
  );
});

test('iOS build procedure is reusable, manual, pinned, and simulator-only', () => {
  const scaffold = workflow('scaffold-validation.yml');
  const caller = scaffold.jobs['ios-validation'];
  assert.equal(caller.uses, './.github/workflows/mobile-ios-validation.yml');
  assert.equal(caller.if, "${{ github.event_name == 'pull_request' && needs.classify.outputs.run_ios_validation == 'true' }}");
  assert.equal(caller.with.checkout_ref, '${{ github.event.pull_request.head.sha }}');
  assert.equal(caller.with.expected_head, '${{ github.event.pull_request.head.sha }}');

  const ios = workflow('mobile-ios-validation.yml');
  assert.ok(ios.on.workflow_call);
  assert.ok(ios.on.workflow_dispatch);
  assert.equal(ios.on.pull_request, undefined);
  assert.deepEqual(ios.permissions, { contents: 'read' });
  const job = ios.jobs['ios-validation'];
  assert.equal(job['runs-on'], 'macos-latest');
  assert.ok(stepsFor(job).some((step) => step.uses === 'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10'));
  const iosFlutter = stepsFor(job).find((step) => step.uses === 'subosito/flutter-action@1a449444c387b1966244ae4d4f8c696479add0b2');
  assert.equal(iosFlutter.with.channel, 'stable');
  assert.equal(iosFlutter.with['flutter-version'], flutterVersion);
  for (const command of ['flutter pub get', 'pod install', 'flutter build ios --debug --simulator']) {
    assert.ok(runCommands(job).includes(command));
  }
  assert.ok(
    runCommands(job).some((command) =>
      command.includes('settleora_visual_test_environment_test.dart') &&
      command.includes('loads the real Roboto and Material Icons font files')),
  );
  assert.doesNotMatch(JSON.stringify(job), /continue-on-error|--no-fatal-warnings|\|\|\s*true/);
});

test('all repository workflow action references remain full-SHA pinned', () => {
  const workflowDir = path.join(repoRoot, '.github/workflows');
  for (const file of readdirSync(workflowDir).filter((name) => name.endsWith('.yml'))) {
    const parsed = parse(read(`.github/workflows/${file}`));
    for (const job of Object.values(parsed.jobs ?? {})) {
      const references = [job.uses, ...stepsFor(job).map((step) => step.uses)].filter(Boolean);
      for (const reference of references) {
        if (reference.startsWith('./')) continue;
        assert.match(reference, /^[^@\s]+@[0-9a-f]{40}$/, `${file}: ${reference}`);
      }
    }
  }
});

test('Codemagic stays manual-only with signed internal upload semantics intact', () => {
  const codemagic = parse(read('codemagic.yaml'));
  for (const item of Object.values(codemagic.workflows)) {
    assert.equal(item.triggering, undefined);
    assert.equal(item.environment.flutter, flutterVersion);
  }
  const internal = codemagic.workflows['mobile-ios-testflight-internal'];
  assert.equal(internal.integrations.app_store_connect, 'settleora-app-store-connect');
  assert.equal(internal.environment.ios_signing.distribution_type, 'app_store');
  assert.equal(internal.environment.ios_signing.bundle_identifier, 'com.tommytang213.settleora');
  assert.equal(internal.environment.flutter, flutterVersion);
  assert.equal(internal.environment.xcode, 'latest');
  assert.equal(internal.environment.cocoapods, 'default');
  assert.equal(internal.environment.vars.FLUTTER_BUILD_NAME, '1.0.0');
  const scripts = internal.scripts.map((step) => step.script).join('\n');
  assert.match(scripts, /testFlightInternalTestingOnly/);
  assert.match(scripts, /flutter build ipa --release/);
  assert.match(scripts, /--build-number="\$BUILD_NUMBER"/);
  assert.ok(internal.artifacts.includes('$CM_BUILD_DIR/apps/mobile/build/ios/ipa/*.ipa'));
  assert.ok(internal.artifacts.includes('$CM_BUILD_DIR/apps/mobile/build/ios/archive/*.xcarchive'));
  assert.equal(internal.publishing.app_store_connect.auth, 'integration');
  assert.equal(internal.publishing.app_store_connect.submit_to_testflight, false);
  assert.equal(internal.publishing.app_store_connect.submit_to_app_store, false);
  assert.equal(internal.publishing.app_store_connect.beta_groups, undefined);
});

test('GitHub and Codemagic release gates share one non-visual Flutter contract', () => {
  const scaffold = workflow('scaffold-validation.yml');
  const ios = workflow('mobile-ios-validation.yml');
  const codemagic = parse(read('codemagic.yaml'));
  const githubPins = [
    stepsFor(scaffold.jobs['mobile-validation']).find(
      (step) => step.uses?.startsWith('subosito/flutter-action@'),
    ).with['flutter-version'],
    stepsFor(ios.jobs['ios-validation']).find(
      (step) => step.uses?.startsWith('subosito/flutter-action@'),
    ).with['flutter-version'],
  ];
  assert.deepEqual(githubPins, [flutterVersion, flutterVersion]);

  for (const workflowName of [
    'mobile-ios-validation',
    'mobile-ios-testflight-internal',
  ]) {
    const item = codemagic.workflows[workflowName];
    assert.equal(item.environment.flutter, flutterVersion);
    const scripts = item.scripts.map((step) => step.script.trim());
    assert.ok(scripts.includes(sharedMobileReleaseGate));
    assert.doesNotMatch(
      scripts.filter((script) => script !== sharedMobileReleaseGate).join('\n'),
      /flutter (pub get|analyze|test)|CANDIDATE_TEST_FILES|VISUAL_TAGGED_FILES/,
    );
  }
});

test('shared release selector excludes visual filenames and only visual-tagged cases', () => {
  const script = read('apps/mobile/tool/validate-release.sh');
  assert.match(script, /flutter pub get/);
  assert.match(script, /flutter analyze/);
  assert.match(script, /flutter test -r expanded --exclude-tags visual/);
  assert.match(script, /\*visual\*capture_test\.dart\|\*visual\*evidence\*_test\.dart/);
  assert.match(script, /LC_ALL=C sort/);
  assert.doesNotMatch(script, /sort -z|find[^\n]*-print0/);

  const selection = execFileSync('bash', ['tool/validate-release.sh', '--selection-only'], {
    cwd: path.join(repoRoot, 'apps/mobile'),
    encoding: 'utf8',
  });
  const normalFiles = selection
    .split('\n')
    .filter((line) => line.startsWith('NON_VISUAL_TEST_FILE='))
    .map((line) => line.slice('NON_VISUAL_TEST_FILE='.length));
  assert.ok(normalFiles.length > 0);
  assert.ok(normalFiles.includes('test/bill_list_screen_test.dart'));
  assert.ok(normalFiles.includes('test/group_bill_list_screen_test.dart'));
  assert.equal(normalFiles.some((file) => /visual.*capture_test\.dart|visual.*evidence.*_test\.dart/.test(file)), false);
  assert.ok(normalFiles.includes('test/ui/settleora_component_guardrail_test.dart'));
  assert.ok(normalFiles.includes('test/ui/settlement_detail_search_shared_fields_test.dart'));
  assert.match(selection, /VISUAL_FILENAME_TEST_FILE=test\/ui\/.*visual_capture_test\.dart/);
  assert.match(selection, /VISUAL_TAGGED_TEST_FILE=test\/ui\/settleora_component_guardrail_test\.dart/);
});

test('Codemagic visual evidence remains a separate explicit test lane', () => {
  const visual = parse(read('codemagic.yaml')).workflows['mobile-ios-visual-evidence'];
  const scripts = visual.scripts.map((step) => step.script).join('\n');
  assert.equal(visual.environment.flutter, flutterVersion);
  assert.match(scripts, /\*visual\*capture_test\.dart/);
  assert.match(scripts, /\*visual\*evidence\*_test\.dart/);
  assert.match(scripts, /flutter test -r expanded --tags visual/);
  assert.match(
    scripts,
    /case "\$TEST_FILE" in[\s\S]*\*visual\*capture_test\.dart\|\*visual\*evidence\*_test\.dart\) ;;/,
  );
  assert.match(
    scripts,
    /SETTLEORA_VISUAL_OUTPUT_ROOT="\$CM_BUILD_DIR\/apps\/mobile\/build\/settleora-visual-qa"/,
  );
  assert.ok(
    visual.artifacts.includes(
      '$CM_BUILD_DIR/apps/mobile/build/settleora-visual-qa/**/*.png',
    ),
  );
  assert.doesNotMatch(scripts, /validate-release\.sh/);

  const testFiles = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.endsWith('test.dart')) testFiles.push(absolute);
    }
  };
  visit(path.join(repoRoot, 'apps/mobile/test'));
  const dedicated = new Set(
    testFiles.filter((file) =>
      /visual.*capture_test\.dart$|visual.*evidence.*_test\.dart$/.test(file)),
  );
  const tagged = testFiles.filter((file) => /tags:[^#]*visual/.test(readFileSync(file, 'utf8')));
  assert.ok(tagged.some((file) => dedicated.has(file)));
  assert.deepEqual(
    tagged
      .filter((file) => !dedicated.has(file))
      .map((file) => path.relative(path.join(repoRoot, 'apps/mobile'), file))
      .sort(),
    [
      'test/ui/settlement_detail_search_shared_fields_test.dart',
      'test/ui/settleora_component_guardrail_test.dart',
    ],
  );
});

test('runnable mobile test infrastructure has no provider-specific absolute roots', () => {
  const mobileTestRoot = path.join(repoRoot, 'apps/mobile/test');
  const visit = (directory) => {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...visit(absolute));
      else if (entry.name.endsWith('.dart')) files.push(absolute);
    }
    return files;
  };
  const runnableSource = visit(mobileTestRoot)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  assert.doesNotMatch(runnableSource, /\/opt\/flutter|\/workspace\/logs|\/Users\/builder/);

  const environmentHelper = read(
    'apps/mobile/test/helpers/settleora_visual_test_fonts.dart',
  );
  assert.match(environmentHelper, /Platform\.environment/);
  assert.match(environmentHelper, /\['FLUTTER_ROOT'\]/);
  assert.match(environmentHelper, /Platform\.resolvedExecutable/);
  assert.match(environmentHelper, /SETTLEORA_VISUAL_OUTPUT_ROOT/);
  assert.match(read('apps/mobile/.gitignore'), /^\/build\/$/m);
});

test('GitHub workflows contain no Codemagic build trigger or release invocation', () => {
  const workflowDir = path.join(repoRoot, '.github/workflows');
  for (const file of readdirSync(workflowDir).filter((name) => name.endsWith('.yml'))) {
    const parsedBehavior = JSON.stringify(parse(read(`.github/workflows/${file}`)));
    assert.doesNotMatch(parsedBehavior, /api\.codemagic\.io|codemagic\.io\/(hooks|webhooks)|CODEMAGIC_(API|BUILD|TRIGGER)|curl[^"\n]*codemagic/i);
    assert.doesNotMatch(parsedBehavior, /submit_to_testflight|submit_to_app_store|testFlightInternalTestingOnly/);
  }
});
