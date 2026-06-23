# Codemagic TestFlight Setup

This document describes Settleora's repository-side Codemagic foundation for Flutter mobile validation and the guarded internal TestFlight upload workflow. It is preparation for internal testing only; it is not a production App Store release setup.

## Repository Layout

Codemagic looks for `codemagic.yaml` at the repository root. Settleora's Flutter app is under `apps/mobile`, so both Codemagic workflows use:

```yaml
working_directory: apps/mobile
```

The root `codemagic.yaml` defines:

- `mobile-ios-validation`: safe Flutter validation only.
- `mobile-ios-testflight-internal`: manual internal TestFlight-oriented App Store Connect upload through the confirmed Codemagic Apple Developer Portal integration.

Codemagic validates the whole YAML when detecting configuration, including workflows that are run manually. Keep the root file parse-safe and do not commit signing material, App Store Connect API keys, provisioning profiles, certificates, `.p8` files, passwords, or other secrets.

## Safe Validation Workflow

`Mobile iOS validation` is manual-only in Codemagic to protect hosted macOS minutes. Do not rely on it as an automatic check for routine backend, API, OpenAPI, test-only, docs-only, or security-hardening PRs.

Run `Mobile iOS validation` manually in Codemagic for mobile/iOS changes, Codemagic config changes, mobile build/release docs or scripts, signing/TestFlight/App Store preparation, release branches/tags, or an explicitly requested mobile validation gate. It uses Flutter stable, Xcode latest, and CocoaPods default, then runs:

```bash
flutter pub get
flutter analyze
flutter test
```

This workflow does not publish, upload to App Store Connect, invite testers, or require Apple signing secrets.

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

## Internal TestFlight Workflow

Run `Mobile iOS internal TestFlight` manually only after the setup above is complete. This workflow is upload-only from the repository side: it uploads the signed IPA to App Store Connect and avoids Codemagic post-processing distribution to beta groups.

The active internal workflow:

- Uses `integrations.app_store_connect: settleora-app-store-connect`.
- Uses `ios_signing.distribution_type: app_store`.
- Uses `ios_signing.bundle_identifier: com.tommytang213.settleora`.
- Runs Flutter dependency, analyze, and test steps before signing.
- Passes `testFlightInternalTestingOnly` through `xcode-project use-profiles`.
- Builds a signed iOS IPA with `flutter build ipa --release`.
- Publishes to App Store Connect with `auth: integration`.
- Sets `submit_to_testflight: false` so Codemagic does not submit the build to TestFlight beta review.
- Does not set `beta_groups`.
- Keeps `submit_to_app_store: false`.

Do not configure `beta_groups: Internal Testers`. App Store Connect internal tester groups are not valid Codemagic `beta_groups` assignment targets, and using that wiring can fail after the build has already uploaded and processed. If a future workflow adds external beta tester distribution, keep it explicitly external-only, require beta review intentionally, and never include the internal `Internal Testers` group in `beta_groups`.

No public App Store release is configured. No external tester automation is configured. No `submit_to_app_store`, external beta groups, certificates, provisioning profiles, `.p8` files, passwords, or signing material are committed.

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
- Triggering `Mobile iOS internal TestFlight` or any future upload-capable
  Codemagic workflow.
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

Codex cannot verify a real Codemagic cloud build or TestFlight upload unless the maintainer manually triggers the workflow and provides the result. Local validation only proves repository syntax, docs, and repo-safe checks.

Codemagic cloud build success, Apple signing success, App Store Connect upload/processing, manual internal tester availability, and real iPhone install through TestFlight remain external/manual evidence until a maintainer runs the workflow and records the result.

## Recommended Order

1. Merge the Codemagic/TestFlight repository setup.
2. In Codemagic, confirm the branch with root `codemagic.yaml` is detected.
3. Run `Mobile iOS validation`.
4. Confirm Apple Developer Program, App Store Connect app record, registered bundle ID `com.tommytang213.settleora`, internal tester access needs, and Codemagic integration `settleora-app-store-connect`.
5. Manually run `Mobile iOS internal TestFlight` only at a milestone or release gate when signing and App Store Connect setup are ready.
6. After upload processing, check App Store Connect > My Apps > Settleora > TestFlight / Builds and perform any manual internal tester setup needed in App Store Connect.
7. Record Codemagic build logs, App Store Connect processing status, and TestFlight install evidence in the Day 1 acceptance package when available.
