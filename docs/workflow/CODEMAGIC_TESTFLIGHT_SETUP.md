# Codemagic TestFlight Setup

This document describes Settleora's repository-side Codemagic foundation for Flutter mobile validation and a future internal TestFlight upload. It is preparation only; it is not a production App Store release setup.

## Repository Layout

Codemagic looks for `codemagic.yaml` at the repository root. Settleora's Flutter app is under `apps/mobile`, so both Codemagic workflows use:

```yaml
working_directory: apps/mobile
```

The root `codemagic.yaml` defines:

- `mobile-ios-validation`: safe Flutter validation only.
- `mobile-ios-testflight-internal`: manual, guarded internal TestFlight upload skeleton.

## Safe Validation Workflow

Run `Mobile iOS validation` first in Codemagic. It uses Flutter stable, Xcode latest, and CocoaPods default, then runs:

```bash
flutter pub get
flutter analyze
flutter test
```

This workflow does not publish, upload to App Store Connect, invite testers, or require Apple signing secrets.

## Manual Codemagic Setup

Before running the TestFlight skeleton for upload, configure these Codemagic variable groups in the Codemagic UI. Store all sensitive values as encrypted secrets. Do not commit any values to this repository.

Variable groups:

- `settleora-ios-signing`
- `settleora-app-store-connect`
- `settleora-testflight-control`

Expected variable names:

- `APP_STORE_CONNECT_PRIVATE_KEY`
- `APP_STORE_CONNECT_KEY_IDENTIFIER`
- `APP_STORE_CONNECT_ISSUER_ID`
- `IOS_CERTIFICATE`
- `IOS_CERTIFICATE_PASSWORD`
- `IOS_PROVISIONING_PROFILE`
- `IOS_BUNDLE_ID`
- `APP_STORE_APP_ID`
- `CODEMAGIC_TESTFLIGHT_INTERNAL_ENABLE`

`CODEMAGIC_TESTFLIGHT_INTERNAL_ENABLE` must remain unset or set to anything other than `true` until signing and App Store Connect setup are complete. The TestFlight workflow fails early when this guard is not exactly `true`.

Use Codemagic's iOS code signing identities or Apple Developer Portal integration for certificates and provisioning profiles. If using Codemagic signing identities, keep `IOS_CERTIFICATE` and `IOS_PROVISIONING_PROFILE` aligned with the reference names configured in Codemagic, and keep certificate/profile files out of the repo.

## Apple Setup Required

Real TestFlight upload still requires:

- Apple Developer Program membership.
- A real App Store Connect app record.
- A bundle ID that matches the iOS app configuration and `IOS_BUNDLE_ID`.
- App Store distribution signing credentials and provisioning profile.
- An App Store Connect API key with appropriate permission for Codemagic.
- Codemagic signing identities, Developer Portal integration, or equivalent secret-backed signing setup.

The current Flutter iOS project still uses the starter bundle identifier in `apps/mobile/ios/Runner.xcodeproj/project.pbxproj`. Update bundle identity only in a separate reviewed task because that is release configuration.

## Internal TestFlight Skeleton

Run `Mobile iOS internal TestFlight skeleton` manually only after the setup above is complete.

The workflow:

- Imports only the named Codemagic variable groups.
- Fails before signing/upload unless `CODEMAGIC_TESTFLIGHT_INTERNAL_ENABLE=true`.
- Checks all expected variable names before building.
- Uses Codemagic iOS signing with App Store distribution type.
- Passes `testFlightInternalTestingOnly` through `xcode-project use-profiles`.
- Builds a signed IPA.
- Uploads to App Store Connect without submitting to App Store review.
- Leaves TestFlight tester distribution as a manual App Store Connect/Codemagic follow-up.

No public App Store release is configured. No external tester automation is configured. No `submit_to_app_store`, external beta groups, certificates, provisioning profiles, `.p8` files, passwords, or signing material are committed.

## What Codex Cannot Verify

Codex cannot verify a real Codemagic cloud build or TestFlight upload unless the maintainer manually triggers the workflow and provides the result. Local validation only proves repository syntax, docs, and repo-safe checks.

Codemagic cloud build success, Apple signing success, App Store Connect processing, and real iPhone install through TestFlight remain external/manual evidence until a maintainer runs the workflow and records the result.

## Recommended Order

1. Merge the Codemagic foundation after review.
2. In Codemagic, confirm the branch with `codemagic.yaml` appears and run `Mobile iOS validation`.
3. Create the Apple Developer/App Store Connect app record and real bundle ID setup.
4. Configure Codemagic variable groups and encrypted secrets.
5. Keep `CODEMAGIC_TESTFLIGHT_INTERNAL_ENABLE` disabled until signing is verified.
6. Manually run the internal TestFlight workflow with the guard enabled.
7. Record Codemagic build logs, App Store Connect processing status, and TestFlight install evidence in the Day 1 acceptance package when available.
