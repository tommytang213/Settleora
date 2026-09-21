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
const runCommands = (job) => stepsFor(job).map((step) => step.run ?? step.with?.script).filter(Boolean);
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
  assert.ok(runCommands(classify).includes('npm run validate:truenas-catalog'));
  assert.ok(runCommands(classify).includes('npm run validate:truenas-catalog:official'));
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
  assert.match(manifestHelper, /const packageFile = candidates\.find/);
  assert.match(manifestHelper, /JSON\.parse\(bytes\.toString\('utf8'\)\)\.version/);
  assert.doesNotMatch(manifestHelper, /process\.env\.npm_execpath|\/usr\/bin\/npm/);
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
    `npm run validate:ocr-models && node tools/doctor-validation.mjs --mobile && cd apps/mobile && ${sharedMobileReleaseGate}`,
  );
});

test('required scaffold classifier runs the fail-closed release identity suite exactly once', () => {
  const classify = workflow('scaffold-validation.yml').jobs.classify;
  assert.equal(classify.steps.some((step) => step.run === 'npm run validate:release-identity'), false);
  const bridge = read('tools/ci/test/release-identity.test.mjs');
  assert.match(bridge, /import '\.\.\/\.\.\/release\/test\/day1-release-identity\.test\.mjs';/);
  assert.match(bridge, /execFileSync\('python3', \['-m', 'unittest', 'discover', '-s', 'tools\/release\/test'/);
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

test('native OCR acceptance is exact-head, device-backed, and retains only bounded evidence', () => {
  const native = workflow('mobile-ocr-native-acceptance.yml');
  const boundedCapture = read('tools/ocr-models/bounded-process-capture.mjs');
  const nativeTest = read('apps/mobile/integration_test/receipt_ocr_real_provider_test.dart');
  const androidActivity = read('apps/mobile/android/app/src/main/kotlin/com/example/mobile/MainActivity.kt');
  const androidDebugHooks = read('apps/mobile/android/app/src/debug/kotlin/com/example/mobile/ReceiptOcrBuildVariantHooks.kt');
  const androidProfileHooks = read('apps/mobile/android/app/src/profile/kotlin/com/example/mobile/ReceiptOcrBuildVariantHooks.kt');
  const androidReleaseHooks = read('apps/mobile/android/app/src/release/kotlin/com/example/mobile/ReceiptOcrBuildVariantHooks.kt');
  const iosPlugin = read('apps/mobile/ios/Runner/SettleoraReceiptOcrPlugin.swift');
  assert.deepEqual(native.on.pull_request.branches, ['main']);
  assert.ok(native.on.workflow_dispatch);
  assert.ok(native.on.pull_request.paths.includes('apps/mobile/assets/receipt_ocr_models/**'));
  assert.ok(native.on.pull_request.paths.includes('apps/mobile/lib/**'));
  assert.ok(native.on.pull_request.paths.includes('apps/mobile/pubspec.yaml'));
  assert.ok(native.on.pull_request.paths.includes('apps/mobile/pubspec.lock'));
  assert.ok(native.on.pull_request.paths.includes('apps/mobile/tool/**'));
  assert.ok(native.on.pull_request.paths.includes('codemagic.yaml'));
  assert.ok(native.on.pull_request.paths.includes('package.json'));
  assert.deepEqual(native.permissions, { contents: 'read' });
  assert.match(nativeTest, /invokeMethod<Uint8List>\('loadModelCatalog'\)/);
  assert.doesNotMatch(nativeTest, /rootBundle\.loadString/);
  const corpusFixtureIndex = nativeTest.indexOf("final fixtureBytes =");
  const endToEndStopwatchIndex = nativeTest.indexOf("final stopwatch = Stopwatch()..start();", corpusFixtureIndex);
  const rssSamplerIndex = nativeTest.indexOf("final rssSampler = Timer.periodic", corpusFixtureIndex);
  const normalizationIndex = nativeTest.indexOf("artifactProcessor.process(", corpusFixtureIndex);
  assert.ok(corpusFixtureIndex >= 0);
  assert.ok(endToEndStopwatchIndex > corpusFixtureIndex && endToEndStopwatchIndex < normalizationIndex);
  assert.ok(rssSamplerIndex > corpusFixtureIndex && rssSamplerIndex < normalizationIndex);
  assert.match(androidActivity, /ReceiptOcrBuildVariantHooks\.configure/);
  assert.doesNotMatch(androidActivity, /receipt_ocr_acceptance|loadModelCatalog|loadFixture/);
  assert.match(androidDebugHooks, /call\.method == "loadModelCatalog"/);
  assert.match(androidDebugHooks, /assets\.open\("receipt_ocr_models\/catalog\.json"\)/);
  for (const productionHooks of [androidProfileHooks, androidReleaseHooks]) {
    assert.doesNotMatch(productionHooks, /receipt_ocr_acceptance|loadModelCatalog|loadFixture/);
    assert.match(productionHooks, /return null/);
  }
  assert.match(iosPlugin, /call\.method == "loadModelCatalog"/);
  assert.match(iosPlugin, /FlutterAssetResolver\.url\("assets\/receipt_ocr_models\/catalog\.json"\)/);
  assert.equal(native.env.EXPECTED_HEAD, "${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || inputs.expected_head }}");

  const expectedJobs = [
    ['android-native-acceptance', 'ubuntu-24.04', 'emulator-5554'],
    ['ios-native-acceptance', 'macos-15', 'steps.simulator.outputs.udid'],
  ];
  for (const [jobName, runner, device] of expectedJobs) {
    const job = native.jobs[jobName];
    assert.equal(job['runs-on'], runner);
    assert.equal(job['timeout-minutes'], 360);
    const checkout = stepsFor(job).find((step) => step.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.ref, '${{ env.CANDIDATE_REF }}');
    assert.equal(checkout.with['fetch-depth'], 0);
    assert.ok(runCommands(job).some((command) => command.includes('git rev-parse HEAD')));
    assert.ok(runCommands(job).some((command) => command.includes('git diff --exit-code -- pubspec.lock')));
    const packageCommands = runCommands(job).find((command) => command.includes('git archive "$EXPECTED_HEAD"'));
    if (jobName === 'android-native-acceptance') {
      assert.ok(packageCommands.includes('lock_sha='));
      assert.ok(packageCommands.includes('pubspec.lock'));
      assert.ok(packageCommands.includes('test "$('));
      assert.equal(packageCommands.split('prepare-production-flutter-plugins.mjs').length - 1, 3);
      assert.equal(packageCommands.split('--package-config=.dart_tool/package_config.json').length - 1, 3);
      assert.equal(packageCommands.split('--package-graph=.dart_tool/package_graph.json').length - 1, 3);
      assert.equal(packageCommands.split('--require-integration-test=true').length - 1, 2);
      const baselineCommands = packageCommands.slice(packageCommands.indexOf('base_sha='));
      assert.ok(baselineCommands.includes('prepare-production-flutter-plugins.mjs'));
      assert.ok(!baselineCommands.includes('--require-integration-test=true'));
    } else {
      assert.equal(packageCommands.split('build-production-ios.sh').length - 1, 3);
      assert.equal(packageCommands.split('--artifact-class=size-measurement').length - 1, 2);
      assert.ok(packageCommands.includes('--provenance-out="$RUNNER_TEMP/ios-release-provenance.json"'));
      assert.ok(packageCommands.includes('--require-integration-test=false'));
    }
    const executionCommands = jobName === 'android-native-acceptance'
      ? [read('tools/ocr-models/run-android-native-acceptance.sh')]
      : [read('tools/ocr-models/run-ios-native-acceptance.sh'), read('apps/mobile/tool/build-production-ios.sh')];
    const allCommands = [...runCommands(job), ...executionCommands];
    assert.ok(executionCommands.some((command) =>
      command.includes('bounded-process-capture.mjs') &&
      command.includes(jobName === 'android-native-acceptance' ? device : '--device="$device"')),
    );
    assert.ok(boundedCapture.includes('integration_test/receipt_ocr_real_provider_test.dart'));
    const acceptance = stepsFor(job).find((step) => step.id === 'acceptance');
    assert.equal(acceptance['timeout-minutes'], 180);
    assert.ok(runCommands(job).includes('npm run validate:ocr-models'));
    assert.ok(runCommands(job).some((command) => command.includes('native-acceptance-evidence.mjs')));
    assert.ok(runCommands(job).some((command) => command.includes('--require-complete=true')));
    assert.ok(runCommands(job).some((command) => command.includes('--test-status=')));
    assert.ok(runCommands(job).some((command) => command.includes('--failure-phase=')));
    assert.ok(runCommands(job).some((command) => command.includes('--runner-image=')));
    assert.ok(runCommands(job).some((command) => command.includes('--native-image=')));
    assert.ok(runCommands(job).some((command) => command.includes('--stderr-log=')));
    assert.ok(allCommands.some((command) => command.includes('bounded-process-capture.mjs')));
    assert.ok(allCommands.some((command) => command.includes('--max-bytes=33554432')));
    assert.ok(allCommands.some((command) => command.includes('--platform=')));
    assert.ok(allCommands.some((command) => command.includes('--device=')));
    assert.ok(runCommands(job).some((command) => command.includes('--base-app-bytes=')));
    assert.ok(packageCommands.includes('base_tree=$(git rev-parse "$base_sha^{tree}")'));
    assert.ok(packageCommands.includes('base_dependency_lock_sha256='));
    assert.ok(runCommands(job).some((command) => command.includes('--base-tree=')));
    assert.ok(runCommands(job).some((command) => command.includes('--base-tooling-sha="$EXPECTED_HEAD"')));
    assert.ok(runCommands(job).some((command) => command.includes('--base-dependency-lock-sha256=')));
    assert.ok(runCommands(job).some((command) => command.includes('--verified-model-file-count=')));
    assert.ok(runCommands(job).some((command) => command.includes('--verified-catalog-file-count=')));
    assert.ok(runCommands(job).some((command) => command.includes('--verified-fixture-absence-count=')));
    assert.ok(runCommands(job).some((command) => command.includes('git archive')));
    assert.ok(runCommands(job).some((command) => command.includes('git archive "$EXPECTED_HEAD"')));
    assert.ok(allCommands.some((command) => command.includes('>"$RUNNER_TEMP/')));
    assert.equal(allCommands.some((command) => command.includes('| tee ')), false);
    assert.ok(boundedCapture.includes('"--machine"'));
    assert.ok(allCommands.some((command) => command.includes('flutter build') && command.includes('--release')));
    if (jobName === 'android-native-acceptance') {
      assert.equal(job.env.ORG_GRADLE_PROJECT_settleoraReleaseEvidence, 'true');
      assert.ok(packageCommands.includes('flutter build apk --release --no-pub'));
    } else {
      assert.ok(packageCommands.includes('build-production-ios.sh'));
    }
    const upload = stepsFor(job).find((step) =>
      step.uses?.startsWith('actions/upload-artifact@') &&
      step.with?.path?.includes('-ocr-acceptance.json'));
    assert.match(upload.with.path, /-ocr-acceptance\.json/);
    assert.equal(upload.with['if-no-files-found'], 'error');
    assert.equal(upload.with['retention-days'], 30);
    assert.ok(runCommands(job).at(-1).includes('steps.acceptance.outputs.status'));
  }

  const serialized = JSON.stringify(native);
  const serializedWithoutExplicitPackageBuildTokens = serialized
    .replaceAll('--release', '--production-package')
    .replaceAll('app-release.apk', 'app-production.apk')
    .replaceAll('ios-release-provenance.json', 'ios-production-provenance.json')
    .replaceAll('settleoraReleaseEvidence', 'settleoraDependencyVerification')
    .replaceAll('--deployment', '--dependency-locked');
  assert.doesNotMatch(serializedWithoutExplicitPackageBuildTokens, /secrets\.|contents['"]?:['"]?write|deploy|release|receipt.*(?:jpg|jpeg|png)/i);
  const collector = read('tools/ocr-models/native-acceptance-evidence.mjs');
  assert.match(collector, /maxLogBytes/);
  assert.match(collector, /maxMarkerBytes/);
  assert.match(collector, /sanitizeAcceptance/);
  assert.match(collector, /sanitizeUiSmoke/);
  assert.doesNotMatch(collector, /rawText/);
  assert.doesNotMatch(collector, /acceptance:\s*value|uiSmoke:\s*value/);
  const androidCommands = runCommands(native.jobs['android-native-acceptance']).join('\n');
  const androidRunner = read('tools/ocr-models/run-android-native-acceptance.sh');
  const androidExecution = native.jobs['android-native-acceptance'].steps.find((step) => step.id === 'acceptance');
  assert.equal(androidExecution.with.script, 'bash "$GITHUB_WORKSPACE/tools/ocr-models/run-android-native-acceptance.sh"');
  assert.equal(androidExecution.with.script.includes('\n'), false);
  assert.ok(androidRunner.includes('$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager'));
  assert.ok(androidCommands.includes('$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer'));
  assert.ok(androidRunner.includes('$ANDROID_HOME/platform-tools/adb'));
  assert.equal(androidCommands.includes('adb wait-for-device'), false);
  const androidAcceptance = native.jobs['android-native-acceptance'].steps.find((step) => step.id === 'acceptance');
  assert.equal(androidAcceptance.uses, 'reactivecircus/android-emulator-runner@a421e43855164a8197daf9d8d40fe71c6996bb0d');
  assert.equal(androidAcceptance.with['emulator-port'], 5554);
  assert.equal(androidAcceptance.with['emulator-boot-timeout'], 600);
  assert.ok(androidAcceptance.with['emulator-options'].includes('-no-metrics'));
  assert.ok(androidRunner.includes('timeout 5 "$adb" -s emulator-5554 get-state'));
  assert.ok(androidRunner.includes('timeout 5 "$adb" -s emulator-5554 shell getprop sys.boot_completed'));
  assert.ok(androidRunner.includes('shell cmd connectivity airplane-mode enable'));
  assert.ok(androidRunner.includes('settings get global airplane_mode_on'));
  assert.ok(androidRunner.includes('timeout 30 "$adb" -s emulator-5554 shell cmd connectivity airplane-mode enable'));
  assert.ok(androidRunner.includes('settings put global airplane_mode_on 1'));
  assert.ok(androidRunner.includes('timeout 30 "$adb" -s emulator-5554 shell settings get global airplane_mode_on'));
  assert.ok(androidRunner.includes('settings put global mobile_data 0'));
  assert.ok(androidRunner.includes('timeout 30 "$adb" -s emulator-5554 shell settings get global mobile_data'));
  assert.ok(androidRunner.includes('echo "failure_phase=$phase" >> "$GITHUB_OUTPUT"'));
  assert.ok(androidCommands.includes('verify-mobile-package.mjs --platform=android'));
  assert.ok(androidCommands.includes('--json=true'));
  assert.ok(androidCommands.includes('android-dex-packages.txt'));
  assert.ok(androidCommands.includes('android-plugin-registrant.txt'));
  assert.ok(androidCommands.includes('com.mr.flutter.plugin.filepicker.FilePickerPlugin'));
  assert.ok(androidCommands.includes('com.it_nomads.fluttersecurestorage.FlutterSecureStoragePlugin'));
  assert.ok(androidCommands.includes('grep_status=$?'));
  assert.ok(androidCommands.includes('Production APK contains the integration_test plugin'));
  assert.ok(androidCommands.includes('android-production-dex-strings.txt'));
  assert.ok(androidCommands.includes('Production APK contains the native OCR acceptance channel'));
  assert.ok(androidCommands.includes('com.settleora.mobile/receipt_ocr_acceptance'));
  assert.ok(androidCommands.includes("'loadModelCatalog'"));
  assert.ok(androidCommands.includes("'loadFixture'"));
  assert.ok(androidRunner.includes('test "$system_image_revision" = "9"'));
  assert.ok(androidRunner.includes('test "$emulator_revision" = "37.1.11"'));
  assert.ok(androidRunner.includes('java_version_output=$(java -version 2>&1)'));
  assert.ok(androidRunner.includes("java_version_sha256=$(printf '%s' \"$java_version_output\" | sha256sum"));
  assert.ok(androidRunner.includes('emulator-$emulator_revision-java-version-sha256-$java_version_sha256'));
  assert.ok(boundedCapture.includes('integration_test/receipt_ocr_real_provider_test.dart'));
  assert.ok(androidRunner.includes('|| status=$?'));
  assert.match(serialized, /integration.*test/i);
  const iosCommands = runCommands(native.jobs['ios-native-acceptance']).join('\n');
  const iosRunner = read('tools/ocr-models/run-ios-native-acceptance.sh');
  const iosNetworkDeny = read('tools/ocr-models/ios-simulator-network-deny.c');
  const iosProject = read('apps/mobile/ios/Runner.xcodeproj/project.pbxproj');
  assert.ok(iosCommands.includes('/Applications/Xcode_16.4.app/Contents/Developer'));
  assert.ok(iosCommands.includes('test "$(pod --version)" = "1.17.0"'));
  assert.ok(iosCommands.includes('xcrun simctl erase "$udid"'));
  assert.doesNotMatch(iosCommands, /pfctl|user_id=\$\(id -u\)/);
  assert.ok(iosCommands.includes('run-ios-native-acceptance.sh'));
  assert.ok(iosRunner.includes('export SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE="$network_deny"'));
  assert.ok(iosRunner.includes('export SIMCTL_CHILD_DYLD_INSERT_LIBRARIES="$network_deny_in_app"'));
  assert.ok(iosRunner.includes('export SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION=socket_interpose_v1'));
  assert.ok(iosRunner.includes('launchctl setenv DYLD_INSERT_LIBRARIES "$network_deny_in_app"'));
  assert.ok(iosRunner.includes('launchctl setenv SETTLEORA_OCR_NETWORK_ISOLATION socket_interpose_v1'));
  assert.ok(iosRunner.includes('launchctl getenv DYLD_INSERT_LIBRARIES'));
  assert.ok(iosRunner.includes('launchctl getenv SETTLEORA_OCR_NETWORK_ISOLATION'));
  assert.ok(iosRunner.includes('launchctl unsetenv DYLD_INSERT_LIBRARIES'));
  assert.ok(iosRunner.includes('launchctl unsetenv SETTLEORA_OCR_NETWORK_ISOLATION'));
  assert.ok(iosRunner.includes('unset SIMCTL_CHILD_DYLD_INSERT_LIBRARIES'));
  assert.ok(iosRunner.includes('unset SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION'));
  assert.ok(iosRunner.includes('unset SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE'));
  assert.ok(iosRunner.includes('phase=verify_network_environment_clean'));
  assert.ok(iosRunner.includes('test -z "${SIMCTL_CHILD_DYLD_INSERT_LIBRARIES:-}"'));
  assert.ok(iosRunner.includes('test -z "${SIMCTL_CHILD_SETTLEORA_OCR_NETWORK_ISOLATION:-}"'));
  assert.ok(
    iosRunner.indexOf('network_environment_configured=true') >
      iosRunner.indexOf('launchctl setenv DYLD_INSERT_LIBRARIES "$network_deny_in_app"'),
  );
  assert.ok(
    iosRunner.indexOf('network_environment_configured=true') <
      iosRunner.indexOf('launchctl setenv SETTLEORA_OCR_NETWORK_ISOLATION socket_interpose_v1'),
  );
  assert.ok(iosRunner.includes('phase=cleanup_network_isolation'));
  assert.ok(iosRunner.includes('exit "$status"'));
  assert.ok(iosRunner.includes('echo "failure_phase=$phase" >> "$GITHUB_OUTPUT"'));
  assert.match(iosNetworkDeny, /settleora_connect/);
  assert.match(iosNetworkDeny, /settleora_sendto/);
  assert.match(iosNetworkDeny, /settleora_sendmsg/);
  assert.match(iosNetworkDeny, /settleora_connectx/);
  assert.match(iosNetworkDeny, /settleora_getaddrinfo/);
  assert.match(iosNetworkDeny, /EAI_SYSTEM/);
  assert.match(iosNetworkDeny, /IN6_IS_ADDR_LOOPBACK/);
  assert.match(iosNetworkDeny, /IN6_IS_ADDR_V4MAPPED/);
  assert.match(iosNetworkDeny, /settleora_is_ipv4_loopback/);
  assert.match(iosNetworkDeny, /SETTLEORA_OCR_NETWORK_INTERPOSER_LOADED/);
  assert.ok(iosProject.includes('name = "Embed OCR network interposer"'));
  assert.ok(iosProject.includes('shellScript = "set -eu\\n'));
  assert.ok(iosProject.includes('[ \\"$CONFIGURATION\\" = \\"Debug\\" ]'));
  assert.ok(iosProject.includes('${SETTLEORA_OCR_NETWORK_INTERPOSER_SOURCE:-}'));
  assert.ok(iosProject.includes('$TARGET_BUILD_DIR/$FRAMEWORKS_FOLDER_PATH/libSettleoraOcrNetworkDeny.dylib'));
  assert.ok(iosProject.includes('/usr/bin/cmp -s'));
  assert.ok(iosProject.includes('/bin/rm -f \\"$destination\\"'));
  assert.match(nativeTest, /InternetAddress\.lookup\('example\.com'\)/);
  assert.match(nativeTest, /hostnameResolutionDenied/);
  const iosProductionBuilder = read('apps/mobile/tool/build-production-ios.sh');
  assert.ok(iosCommands.includes('build-production-ios.sh'));
  assert.ok(iosCommands.includes('ios-test-plugin-metadata'));
  assert.ok(iosCommands.includes('prepare-production-flutter-plugins.mjs'));
  assert.ok(iosCommands.includes('--require-integration-test=true'));
  assert.ok(iosCommands.includes('cmp -s .dart_tool/package_graph.json'));
  assert.ok(iosProductionBuilder.includes('verify-mobile-package.mjs'));
  assert.ok(iosProductionBuilder.includes('GeneratedPluginRegistrant'));
  assert.ok(iosProductionBuilder.includes('FilePickerPlugin'));
  assert.ok(iosProductionBuilder.includes('FlutterSecureStorageDarwinPlugin'));
  assert.ok(iosProductionBuilder.includes('integration_test is linked into the production application'));
  assert.ok(iosCommands.includes('test -s Podfile.lock'));
  assert.ok(iosCommands.includes('a5b6068c71fe9b0a77743d5c639b5538dd2be10db7ddd4ecd9317fee03541903'));
  assert.ok(iosCommands.includes('git diff --exit-code -- Podfile.lock'));
  assert.ok(iosProductionBuilder.includes('pod install --deployment'));
  assert.ok(iosProductionBuilder.includes('flutter clean'));
  assert.ok(iosProductionBuilder.includes('rm -rf -- build .dart_tool .flutter-plugins-dependencies ios/Pods ios/.symlinks'));
  assert.match(iosCommands, /verify-ios-test-podfile-lock\.mjs" \\\n\s+< "\$test_metadata_dir\/production-Podfile\.lock"/);
  assert.match(serialized, /ios-pre-native-Podfile\.lock/);
  assert.doesNotMatch(serialized, /temporary pre-native base lock|ios-base-pod-lock-/i);
  assert.doesNotMatch(serialized, /ios-pod-lock-/);
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

test('Codemagic stays manual-only and retains the signed release candidate without publishing', () => {
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
  assert.equal(internal.environment.xcode, '16.4');
  assert.equal(internal.environment.cocoapods, '1.17.0');
  assert.equal(internal.environment.vars.FLUTTER_BUILD_NAME, '1.0.0');
  assert.equal(internal.environment.vars.CODEMAGIC_CLI_TOOLS_VERSION, '0.69.0');
  const scripts = internal.scripts.map((step) => step.script).join('\n');
  const productionWrapper = read('apps/mobile/tool/build-production-ios.sh');
  assert.match(productionWrapper, /testFlightInternalTestingOnly/);
  assert.match(productionWrapper, /codemagic-cli-tools --version/);
  assert.match(productionWrapper, /--codemagic-cli-tools-version=/);
  assert.doesNotMatch(scripts, /xcode-project use-profiles/);
  assert.match(scripts, /build-production-ios\.sh/);
  assert.match(scripts, /--mode=signed/);
  assert.match(scripts, /--source-sha="\$CM_COMMIT"/);
  assert.match(scripts, /--build-number="\$BUILD_NUMBER"/);
  assert.ok(internal.artifacts.includes('$CM_BUILD_DIR/apps/mobile/build/ios/ipa/*.ipa'));
  assert.ok(internal.artifacts.includes('$CM_BUILD_DIR/apps/mobile/build/ios/archive/*.xcarchive'));
  assert.ok(internal.artifacts.includes('$CM_BUILD_DIR/apps/mobile/build/ios/release-provenance.json'));
  assert.equal(internal.publishing, undefined);
  assert.doesNotMatch(JSON.stringify(internal), /submit_to_testflight|submit_to_app_store|beta_groups/);
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
