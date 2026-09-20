# Codemagic TestFlight Setup

This document describes Settleora's repository-side Codemagic foundation for manually initiated Flutter evidence and signed iOS release-candidate validation. GitHub Actions owns automatic pull-request validation. Codemagic may build and retain a signed release candidate, but the repository currently defines no App Store Connect publishing action and no TestFlight/App Store upload or submission.

## Repository Layout

Codemagic looks for `codemagic.yaml` at the repository root. Settleora's Flutter app is under `apps/mobile`, so both Codemagic workflows use:

```yaml
working_directory: apps/mobile
```

The root `codemagic.yaml` defines:

- `mobile-ios-validation`: safe Flutter validation only.
- `mobile-ios-visual-evidence`: explicit visual capture / screen-compare
  evidence tests for Codex/Figma/UI review.
- `mobile-ios-testflight-internal`: manual signed release-candidate build and inspection using the confirmed Codemagic Apple Developer Portal signing integration. The legacy workflow key is retained for continuity; the workflow does not publish.

Codemagic validates the whole YAML when detecting configuration, including workflows that are run manually. Keep the root file parse-safe and do not commit signing material, App Store Connect API keys, provisioning profiles, certificates, `.p8` files, passwords, or other secrets.

## Safe Validation Workflow

Automatic pull-request validity no longer depends on starting Codemagic. The GitHub Actions `Scaffold Validation` workflow classifies every pull request targeting `main`, runs the root `npm run validate:mobile` command for mobile-affecting changes, compiles the iOS simulator on a GitHub-hosted macOS runner for iOS-affecting changes, and reports the stable required `Validate scaffold` aggregate. Docs-only pull requests retain lightweight scaffold and CI-policy checks while the expensive Linux Flutter and macOS lanes are intentionally skipped.

`Mobile iOS validation` remains manual-only in Codemagic. It is supplementary evidence and must not be treated as an automatic PR check for routine backend, API, OpenAPI, test-only, docs-only, or security-hardening changes.

Run `Mobile iOS validation` manually only when supplementary Codemagic evidence is explicitly requested, such as Codemagic configuration diagnosis or release preparation. It uses Flutter 3.44.8 and invokes the same release-gating command used by GitHub PR validation:

```bash
./tool/validate-release.sh
```

The root `npm run validate:mobile` command keeps the repository mobile doctor
as its local/GitHub preflight and then invokes this script from `apps/mobile`.
The shared script resolves Flutter dependencies, analyzes the app, prints and
validates the non-visual test selection, and runs it with
`--exclude-tags visual` as a final safeguard.

This workflow does not publish, upload to App Store Connect, invite testers, or require Apple signing secrets.

Normal mobile validation intentionally excludes:

- `apps/mobile/test/**/*visual*capture_test.dart`
- `apps/mobile/test/**/*visual*evidence*_test.dart`
- individual tests tagged `visual`; ordinary tests in mixed files still run.

Those visual capture, screenshot-helper, and screen-compare tests are useful
review evidence, but they should not block app validity checks or an installable
internal TestFlight preview build. The workflow prints the selected non-visual
test count and file list, plus mixed files containing visual-tagged cases,
before running the tests.

## Visual Evidence Workflow

`Mobile iOS visual evidence` is manual-only in Codemagic and runs files matching:

```bash
test/**/*visual*capture_test.dart
test/**/*visual*evidence*_test.dart
```

It also runs mixed-file tests tagged `visual`, such as screenshot-helper tests
that live beside non-visual component guardrails. It is the explicit
Codex/Figma/UI comparison path for collecting visual evidence and diagnosing
screen-compare failures. It runs:

```bash
flutter pub get
flutter test -r expanded <only visual capture/evidence files>
flutter test -r expanded --tags visual <visual-tagged mixed files>
```

The workflow prints the selected visual capture and visual-tagged test counts
and file lists, and publishes captured PNG evidence from
`$CM_BUILD_DIR/apps/mobile/build/settleora-visual-qa/` when tests produce it.
Codemagic binds `SETTLEORA_VISUAL_OUTPUT_ROOT` to that directory before running
the tests. Codemagic documents `CM_BUILD_DIR` as the absolute clone root and
allows environment variables in artifact patterns.

Runnable visual tests use the shared output resolver. Without an override it
writes under `apps/mobile/build/settleora-visual-qa/`, which is ignored build
output and works on ordinary Linux and macOS hosts. DevBox/Codex tasks that need
durable operator evidence may explicitly set, for example:

```bash
SETTLEORA_VISUAL_OUTPUT_ROOT=/workspace/logs/settleora-visual-qa \
  flutter test test/ui/example_visual_capture_test.dart
```

The shared font helper uses Codemagic's documented absolute `FLUTTER_ROOT`
when present and otherwise derives the SDK from the active Flutter test runtime.
It does not require `/opt/flutter` or a provider-specific compatibility alias.

## Manual Codemagic Setup

The active TestFlight workflow uses the confirmed Codemagic Apple Developer Portal integration:

```yaml
integrations:
  app_store_connect: settleora-app-store-connect
```

The active iOS signing configuration uses App Store distribution and the registered bundle ID:

```yaml
ios_signing:
  distribution_type: app_store
  bundle_identifier: com.tommytang213.settleora
```

Use Codemagic's Apple Developer Portal integration for certificates and provisioning profiles. Keep certificate/profile files, API keys, passwords, and signing material out of the repo.

## Apple Setup Required

Real App Store Connect upload still requires:

- Apple Developer Program membership.
- A real App Store Connect app record.
- A registered bundle ID matching the iOS app configuration and Codemagic signing configuration: `com.tommytang213.settleora`.
- App Store distribution signing credentials and provisioning profile available through the Codemagic integration.
- App Store Connect access through the `settleora-app-store-connect` Codemagic integration.
- Internal testers configured in App Store Connect when the maintainer wants tester access to processed builds.

## Canonical Signed Release-Candidate Workflow

Run `Mobile iOS signed release candidate validation` manually only after the signing setup above is available. It uses Flutter 3.44.8, Xcode 16.4, and CocoaPods 1.17.0 and calls `apps/mobile/tool/build-production-ios.sh`, the same production preparation/build primitive used by the GitHub unsigned structural package lane. The canonical output is the one signed IPA and its corresponding distribution archive. The IPA SHA-256 and bounded provenance are retained beside those artifacts.

The active signed-validation workflow:

- Uses `integrations.app_store_connect: settleora-app-store-connect`.
- Uses `ios_signing.distribution_type: app_store`.
- Uses `ios_signing.bundle_identifier: com.tommytang213.settleora`.
- Runs Flutter dependency, analyze, and non-visual test steps before signing.
- Passes `testFlightInternalTestingOnly` through `xcode-project use-profiles`.
- Resolves Flutter and CocoaPods dependencies without changing `pubspec.lock` or `Podfile.lock`.
- Projects only the reviewed `integration_test` development plugin out of production metadata and registrants, while positively requiring FilePicker and Flutter secure storage registration.
- Builds exactly one signed IPA/archive pair through the canonical wrapper.
- Verifies the unchanged bundle identifier, signature, plugin calls/test-plugin absence, exact OCR catalog/models, and absence of acceptance fixtures, test classes/assets, and raw OCR evidence/log paths.
- Verifies the packaged short version/build number against the requested signed-build identity and writes those values with source/tree, toolchain, lockfile, OCR catalog/manifest, artifact filenames, and immutable IPA/archive SHA-256 provenance.
- Retains the IPA, archive, and provenance as Codemagic artifacts.
- Has no `publishing` block, `submit_to_testflight`, `submit_to_app_store`, or `beta_groups` configuration.

Do not configure `beta_groups: Internal Testers`. App Store Connect internal tester groups are not valid Codemagic `beta_groups` assignment targets, and using that wiring can fail after the build has already uploaded and processed. If a future workflow adds external beta tester distribution, keep it explicitly external-only, require beta review intentionally, and never include the internal `Internal Testers` group in `beta_groups`.

No App Store Connect upload, public App Store release, or tester automation is configured. No `submit_to_testflight`, `submit_to_app_store`, beta groups, certificates, provisioning profiles, `.p8` files, passwords, or signing material are committed.

The signed release-candidate workflow invokes the same repository-owned
`./tool/validate-release.sh` contract as GitHub and `Mobile iOS validation`.
It runs every Flutter test file except
`*visual*capture_test.dart` and `*visual*evidence*_test.dart`, and it excludes
individual tests tagged `visual` with `--exclude-tags visual`, while retaining
ordinary tests from mixed files. Visual
capture/screenshot-helper/screen-compare evidence remains available through
`Mobile iOS visual evidence` without blocking the installable preview build
path.

The future promotion boundary is intentionally separate and is not implemented
or activated here. A later explicitly approved TestFlight/App Store action must
consume the retained, reviewed IPA whose SHA-256 appears in
`build/ios/release-provenance.json`; it must not rebuild from source. If Apple
tooling later proves an unavoidable transformation is required, that constraint
and the smallest transformation must be reviewed and recorded before promotion.

## App Store Connect Compliance Metadata

The iOS app declares `ITSAppUsesNonExemptEncryption=false` in
`apps/mobile/ios/Runner/Info.plist`. Repo evidence for the mobile app shows only
ordinary HTTPS/API transport, platform Keychain/secure storage, Flutter/iOS
framework behavior, and dependency-level hashing/storage helpers; it does not
ship custom encryption, VPN behavior, or a non-exempt crypto feature. Revisit
this declaration before adding custom crypto, non-standard encryption,
VPN/tunneling behavior, or a new embedded crypto runtime.

The iOS app declares `NSLocationWhenInUseUsageDescription` even though
Settleora has no product feature that tracks, records, tags, maps, or requests
device location. App Store Connect can still raise warning 90683 when a linked
iOS picker dependency graph references CoreLocation or location-capable media
metadata APIs. The warning was traced to picker dependencies rather than to a
Settleora location feature:

- Settleora uses `file_picker` only for custom document attachment import.
- Receipt camera/photo-library import uses `image_picker` with
  `requestFullMetadata: false`.
- `file_picker`'s CocoaPods podspec can include
  `DKImagePickerController/PhotoGallery` for optional iOS media picking.
- The Podfile sets `Pod::PICKER_MEDIA = false`, which disables that optional
  file-picker media path for CocoaPods builds, but the processed App Store
  Connect build still reported 90683 after a fresh upload.

Because the app still depends on iOS picker packages and App Store Connect
continued to detect a location-purpose requirement, the repo-side fallback is a
truthful purpose string, not a fake location feature:

```text
Settleora does not track your location. If iOS asks, location access is only for system photo picker compatibility when selecting receipt images.
```

If a future feature intentionally uses device location, nearby stores, maps,
merchant discovery, GPS receipts, automatic location tagging, or a
location-requiring media picker, review and replace this purpose string as part
of that feature. After this metadata change, the next verification step is a
future separately approved promotion of the retained signed IPA and App Store
Connect processing check to confirm the encryption prompt and 90683 warning are
cleared for the processed build.

## Manual Release Gate Checklist

This checklist covers issue #383 under parent epic #380. It is a Day 1 mobile
release gate for Codemagic, TestFlight, App Store, and Play Store evidence. It
does not authorize Codex or any automated workflow to submit, promote, or
release a mobile build.

Codemagic, TestFlight, App Store, Play Store, production, and public release
actions are manual-only. A maintainer or explicitly assigned release reviewer
must approve each gate before the action happens.

Required pre-release evidence before any TestFlight upload or mobile store
submission:

- Clean release branch or tagged commit, reviewed through the normal PR path.
- Exact commit SHA, branch name, version/build number, and release notes draft.
- Local validation results required for the changed scope, including
  `npm run validate:docs` for docs changes and mobile validation when mobile
  code, signing, build, or release behavior changes.
- GitHub CI/check results for the exact release commit where CI is available.
- Codemagic workflow name, run URL, started-by identity, commit SHA, Flutter
  version, Xcode version, and build log summary when a cloud run is triggered.
- Evidence that no secrets, certificates, profiles, API keys, `.p8` files,
  keystores, passwords, or signing material were committed.
- Evidence that no production/public infrastructure exposure, deployment,
  signing, store listing, tester, or release-promotion change is bundled
  silently with unrelated work.

Manual approval points:

- iOS signing, certificate, profile, bundle ID, App Store Connect integration,
  or Apple Developer Portal changes.
- Android signing, keystore, Play Console integration, package name, or release
  track changes.
- Triggering any future upload-capable Codemagic workflow or promoting a
  retained signed release candidate to App Store Connect.
- TestFlight tester availability, internal tester setup, external beta review,
  or beta group assignment.
- App Store release submission, phased release, manual release, metadata
  submission, or public listing change.
- Play Store internal/closed/open testing upload, production submission,
  staged rollout, release notes, or public listing change.
- Production/public release promotion for any mobile, server, web, admin,
  Docker, or TrueNAS-facing artifact.

Evidence to collect after a maintainer-approved TestFlight or store action:

- Codemagic build URL and exported artifact/build identifier.
- Codemagic validation step result summary, including Flutter dependency,
  analyze, and test outcomes.
- Signing/profile selection evidence from Codemagic or the relevant store
  console, with secrets redacted.
- App Store Connect or Play Console processing status.
- TestFlight install notes for the device model, OS version, app version, build
  number, login/server-mode path tested, and smoke-test result.
- Screenshots or reviewer notes for any store-console release state, with
  account IDs, emails, tokens, and other sensitive data redacted.
- Day 1 acceptance evidence link or report entry recording the manual release
  decision and remaining blockers.

Codex may:

- Prepare documentation, checklists, issue bodies, and reviewable PRs.
- Report local validation and repository evidence.
- Summarize maintainer-provided Codemagic, TestFlight, App Store, or Play Store
  evidence.
- Leave release-gate comments or reports that explicitly preserve manual
  approval.

Codex must not, without a future explicit human approval task:

- Submit or promote any build to TestFlight, App Store, or Play Store.
- Change signing secrets, signing files, Codemagic integrations, Apple/Google
  account settings, tester groups, store listings, or release tracks.
- Trigger production/mobile-store releases or production/public promotion.
- Expose production/public infrastructure.
- Bypass manual gates, mark external release evidence as verified without
  maintainer-provided proof, or treat a successful upload as Day 1 acceptance.

Keep Day 1, Day 2, and Day 3 scope separate. Day 1 may use manual internal
TestFlight evidence for acceptance review when a maintainer chooses to run it.
Broader release automation, external beta distribution, public App Store or
Play Store launch automation, payment-provider integration, and production
public exposure remain separate future gated work unless a later issue
explicitly approves them.

## Finding Uploaded Builds

Uploaded builds appear in App Store Connect, not in Apple Developer certificate/member pages. After Codemagic reports a successful upload, wait for Apple processing, then check:

1. App Store Connect.
2. My Apps.
3. Settleora.
4. TestFlight or Builds.

Internal tester access may still require manual Apple-side setup, depending on current App Store Connect and Codemagic behavior. Configure testers and any internal availability in App Store Connect after the uploaded build is processed.

## What Codex Cannot Verify

Codex cannot verify a real Codemagic signed build unless the build-validation workflow is triggered and its retained artifacts/provenance are provided. TestFlight upload remains a separate action that requires later explicit approval. Local validation proves only repository syntax, contract tests, and repo-safe checks.

Codemagic cloud build success and Apple signing success remain external evidence until the signed-validation workflow runs. App Store Connect upload/processing, tester availability, and real iPhone installation remain unperformed and separately gated.

The repository has no Codemagic `triggering.events` configuration, and GitHub Actions contains no Codemagic API, webhook, or build invocation. A repository webhook may still exist so Codemagic can observe repository events, but under the current YAML it does not make PRs, pushes, or merges start these workflows automatically. External Codemagic account/webhook settings require separate manual dashboard confirmation and are not proven by repository inspection alone.

## Recommended Order

1. Confirm the exact candidate passed its classifier-required GitHub Actions lanes and stable `Validate scaffold` aggregate.
2. In Codemagic, manually run `Mobile iOS signed release candidate validation` for that exact SHA.
3. Verify the retained IPA/archive/provenance, exact source SHA, and IPA SHA-256; do not rebuild the candidate.
4. Complete #1308 review and acceptance gates while leaving upload, tester assignment, and merge separately gated.
5. Only after a later explicit promotion approval, provide the retained reviewed IPA to the separately authorized upload action without rebuilding.
6. After any later approved upload, record App Store Connect processing and TestFlight install evidence in the Day 1 acceptance package.
