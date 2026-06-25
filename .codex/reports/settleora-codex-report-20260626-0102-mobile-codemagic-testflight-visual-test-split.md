# Settleora Codex Report - Mobile CodeMagic TestFlight Visual Test Split

Status: `READY_FOR_REVIEW`

HKT start: `2026-06-26 01:02 HKT`
HKT end: `2026-06-26 01:14 HKT`
Elapsed: `12 minutes`

## Branches And SHAs

- Branch: `ci/mobile-codemagic-testflight-visual-test-split-20260626`
- Base branch: `origin/main`
- Base/source SHA before changes: `af67e2583a8670ea1abe5aa454c529e930776b0a`
- Integration SHA: not used for this CI/mobile branch
- Task commit SHA: final SHA is reported after commit; a Git commit cannot self-contain its own final hash without changing that hash.
- Branch pushed: pending at report write time

## Files Changed

- `codemagic.yaml`
- `docs/workflow/CODEMAGIC_TESTFLIGHT_SETUP.md`
- `.codex/reports/settleora-codex-report-20260626-0102-mobile-codemagic-testflight-visual-test-split.md`

## Workflow Behavior After Change

- `mobile-ios-validation` still runs Flutter dependency restore, analysis, and tests, but its test step is now `Run non-visual Flutter tests`.
- `mobile-ios-testflight-internal` still runs Flutter dependency restore, analysis, non-visual tests, iOS signing setup, signed IPA build, artifact listing, and App Store Connect upload behavior. It does not run visual capture/screen-compare tests before building the internal TestFlight preview IPA.
- `mobile-ios-visual-evidence` is a new explicit manual workflow for Codex/Figma/UI review evidence. It restores Flutter dependencies and runs only visual capture tests with expanded output.
- CodeMagic scripts now print `pwd`, Flutter version, selected test count, and selected file list where useful.
- Test commands use `-r expanded`.

## Test Selection Rules

- Non-visual/TestFlight rule:
  `find test -type f -name '*test.dart' ! -name '*visual_capture_test.dart' | sort`
- Visual evidence rule:
  `find test -type f -name '*visual_capture_test.dart' | sort`
- Existing repo convention used: filename-based `*visual_capture_test.dart`; no tag convention or `dart_test.yaml` was present.

## Validation Commands And Results

- `node --input-type=module -e "import { readFileSync } from 'node:fs'; import { parse } from 'yaml'; const doc = parse(readFileSync('codemagic.yaml','utf8')); console.log(Object.keys(doc.workflows).join('\n'));"` from repo root: passed. Parsed workflows: `mobile-ios-validation`, `mobile-ios-visual-evidence`, `mobile-ios-testflight-internal`.
- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter pub get`: passed. Dependencies resolved; Flutter reported 21 newer packages incompatible with current constraints.
- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter analyze`: passed. `No issues found! (ran in 1.2s)`.
- Exact non-visual workflow command from `apps/mobile`:

```bash
TEST_FILES=$(find test -type f -name '*test.dart' ! -name '*visual_capture_test.dart' | sort)
TEST_COUNT=$(printf '%s\n' "$TEST_FILES" | sed '/^$/d' | wc -l | tr -d ' ')
echo "Selected non-visual Flutter test files: $TEST_COUNT"
printf '%s\n' "$TEST_FILES"
if [ "$TEST_COUNT" = "0" ]; then
  echo "No non-visual Flutter tests were selected"
  exit 1
fi
/opt/flutter/bin/flutter test -r expanded $TEST_FILES
```

Result: passed. Selected 38 non-visual test files. `01:02 +784: All tests passed!`

- Exact visual evidence workflow command from `apps/mobile`:

```bash
TEST_FILES=$(find test -type f -name '*visual_capture_test.dart' | sort)
TEST_COUNT=$(printf '%s\n' "$TEST_FILES" | sed '/^$/d' | wc -l | tr -d ' ')
echo "Selected visual Flutter test files: $TEST_COUNT"
printf '%s\n' "$TEST_FILES"
if [ "$TEST_COUNT" = "0" ]; then
  echo "No visual Flutter tests were selected"
  exit 1
fi
/opt/flutter/bin/flutter test -r expanded $TEST_FILES
```

Result: passed. Selected 16 visual capture test files. `00:09 +16: All tests passed!`

- `git status --short`: showed only `codemagic.yaml` and `docs/workflow/CODEMAGIC_TESTFLIGHT_SETUP.md` modified before report creation.
- `git diff --name-only`: showed `codemagic.yaml` and `docs/workflow/CODEMAGIC_TESTFLIGHT_SETUP.md` before report creation.
- `git diff --check`: passed with no output.

## Scope Guard

Changed scope is limited to CodeMagic CI workflow selection, mobile workflow documentation, and this required report.

No app UI/UX implementation, generated clients, OpenAPI, backend/API/domain behavior, auth/session/security runtime, database schema/migrations, Docker/deployment settings, secrets, signing credentials, App Store Connect integration, bundle identifiers, provisioning, publishing settings, settlement/payment/bill calculation logic, screenshots, goldens, or visual baselines were changed.

## Failures Or Follow-ups

- No validation failures.
- The non-visual run emitted an existing Flutter `tap()` hit-test warning in `notification_screen_test.dart`; it did not fail the suite and was not caused by this workflow selection change.
- Visual evidence tests currently pass separately. No visual baseline update was required.

## Next Recommended Action

Review the focused CI/mobile workflow split, then run the new `Mobile iOS visual evidence` workflow manually when Codex/Figma/UI screenshot evidence is needed. Use `Mobile iOS internal TestFlight` for installable internal preview builds without visual evidence tests blocking the IPA path.
