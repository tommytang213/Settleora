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
