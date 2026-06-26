# OCR Native Build Validation Plan

## Purpose

This docs/control packet records the #437 validation plan for proving the
current ML Kit on-device OCR posture on native iOS and Android builds. It is a
planning and validation-hardening packet only. It does not authorize dependency
changes, Gradle changes, CocoaPods changes, Xcode project changes, Android
manifest changes, signing/provisioning changes, release/store configuration,
runtime OCR changes, parser changes, review UI changes, API/OpenAPI changes,
generated-client changes, schema changes, storage/file-byte behavior, money or
settlement logic, Docker/CI/deploy changes, secrets, or Figma/reference assets.

#437 owns native iOS/Android build validation planning. #436 owns the ML Kit
provider integration plan and is merged. #438 remains the Figma/reference gate
for fallback, error, retry, offline, and manual-entry UX. #439 owns parser and
review handoff test planning and is merged. #359 remains open until the
remaining OCR children and gates are resolved. Full Day 1 OCR readiness cannot
be claimed from #437 alone.

## Current Repo Inspection

Current repository state on this task base contains:

- `apps/mobile/pubspec.yaml` declares `google_mlkit_text_recognition: ^0.15.1`.
- `apps/mobile/pubspec.lock` resolves `google_mlkit_text_recognition` version
  `0.15.1` and transitive `google_mlkit_commons` version `0.11.1`.
- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_provider.dart` defines the
  `ReceiptOcrProvider` seam, `ReceiptOcrRequest`, `ReceiptOcrResult`, and
  `ReceiptOcrStatus`.
- `apps/mobile/lib/receipt_ocr_capture/mlkit_receipt_ocr_provider.dart`
  implements `MlKitReceiptOcrProvider` behind the provider seam, limits
  extraction to Android and iOS, requires a prepared image file path, uses
  `TextRecognizer(script: TextRecognitionScript.latin)`, parses recognized text
  through `ReceiptOcrParser`, and returns bounded unsupported/failed messages.
- `apps/mobile/lib/receipt_ocr_capture/unsupported_receipt_ocr_provider.dart`
  remains a manual-entry-safe fallback provider.
- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_parser.dart` converts
  recognized text into provisional receipt preview fields, warnings, and item
  candidates.
- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_preview.dart` models
  provisional merchant/date/currency/totals/items and review hints.
- `apps/mobile/lib/app/app_bootstrap.dart` injects `MlKitReceiptOcrProvider`
  by default for the authenticated server shell unless a provider is supplied.
- `apps/mobile/lib/app/server_mode_shell.dart` still defaults its constructor
  seam to `UnsupportedReceiptOcrProvider`, preserving test/injection fallback.
- `apps/mobile/lib/bills/bill_list_screen.dart` renders review-first OCR
  preview, warnings, retry/manual-entry-oriented failure handling, and explicit
  user apply controls for provisional suggestions.
- `apps/mobile/test/receipt_ocr_capture/receipt_ocr_parser_test.dart` covers
  parser extraction, unsupported provider fallback, ML Kit provider failure
  when no image path is supplied, and fake provider handoff.
- `apps/mobile/test/receipt_ocr_capture/receipt_image_artifact_processor_test.dart`
  covers normalized image artifacts and safe diagnostics that avoid paths,
  receipt contents, payment-like data, email-like data, and token-like data.

This packet does not assert undocumented package behavior. Native dependency
resolution, model packaging, first-use behavior, offline behavior, app-size
impact, and platform-specific runtime behavior must be verified through the
future build/device checks below.

## Android Validation Plan

Future Android native validation must run from a clean worktree on the exact
task head and must report exact command output summaries and artifact paths.
Suggested commands:

```bash
git status --short
PATH=/opt/flutter/bin:$PATH npm run doctor:mobile
cd apps/mobile && /opt/flutter/bin/flutter pub get
cd apps/mobile && /opt/flutter/bin/flutter analyze
cd apps/mobile && /opt/flutter/bin/flutter test
cd apps/mobile && /opt/flutter/bin/flutter doctor -v
cd apps/mobile && /opt/flutter/bin/flutter build apk --debug
cd apps/mobile/android && ./gradlew :app:dependencies --configuration debugRuntimeClasspath
cd apps/mobile/android && ./gradlew :app:assembleDebug
```

Safe artifact inspection should record, without changing native config:

```bash
ls -lh apps/mobile/build/app/outputs/flutter-apk/app-debug.apk
unzip -l apps/mobile/build/app/outputs/flutter-apk/app-debug.apk | rg -i "mlkit|text|vision|model|tflite|barcode|google"
```

The Android validation report must inspect and record:

- Flutter, Dart, Android SDK, Java, Gradle, Android Gradle Plugin, and Kotlin
  versions observed by `flutter doctor -v` and Gradle output.
- Whether the current Gradle/AGP/Kotlin combination resolves
  `google_mlkit_text_recognition` without dependency conflicts.
- Android min SDK, compile SDK, and target SDK constraints from the current
  native project, and whether ML Kit resolution requires a change.
- Android manifest and permission posture, especially whether OCR introduces
  unexpected camera, storage, internet, network-state, or model-download
  permissions. Camera/file picker permissions that already exist must still be
  documented rather than silently expanded.
- Whether text recognition model/resource assets are bundled in the debug APK
  or require runtime download. The plan must verify behavior through artifact
  inspection and device smoke tests instead of assuming package behavior.
- Debug APK size and, when release validation is explicitly scoped later, AAB
  or release APK size. Record baseline and current artifact sizes from the same
  branch family and build mode.
- Emulator or physical-device smoke behavior for a supported Android version:
  app launches, receipt image selection path reaches OCR, ML Kit provider
  returns extracted/failed/unsupported state without native crash, retry remains
  available, manual entry remains available, and OCR suggestions stay
  provisional.
- Airplane-mode/no-network behavior on a fresh install and after any model is
  already available.
- Logcat/debug output contains only bounded metadata and does not include raw
  OCR text, image bytes, paths, provider URLs, storage internals, tokens,
  secrets, auth/session data, or unrelated sensitive content.

Stop and report instead of patching around the failure if Android validation
finds build failure, dependency conflict, incompatible Gradle/AGP/Kotlin/SDK
constraint, unexpected network/model-download requirement for Day 1 offline
use, unacceptable app-size impact requiring review, missing fallback/manual
entry path, raw OCR or file data leakage, native crash, permission surprise, or
any need for native config/dependency changes outside the approved task scope.

## iOS Validation Plan

Linux DevBox cannot fully prove iOS native build health. iOS proof must come
from CodeMagic or a Mac runner with Xcode and CocoaPods installed. Do not run or
claim iOS native build validation from Linux.

Future iOS validation on a Mac/CodeMagic runner should run from a clean
worktree on the exact task head and report exact command output summaries:

```bash
git status --short
PATH=/opt/flutter/bin:$PATH npm run doctor:mobile
cd apps/mobile && /opt/flutter/bin/flutter pub get
cd apps/mobile && /opt/flutter/bin/flutter doctor -v
cd apps/mobile/ios && pod install
cd apps/mobile && /opt/flutter/bin/flutter analyze
cd apps/mobile && /opt/flutter/bin/flutter test
cd apps/mobile && /opt/flutter/bin/flutter build ios --debug --no-codesign
```

Signed device, archive, TestFlight, or store validation is allowed only when a
future task explicitly scopes signing and provisioning and the runner already
has signing configured. Example commands for that separate scope are:

```bash
cd apps/mobile && /opt/flutter/bin/flutter build ipa --release
xcodebuild -workspace ios/Runner.xcworkspace -scheme Runner -configuration Release -archivePath build/ios/archive/Runner.xcarchive archive
```

Do not change signing, provisioning profiles, certificates, bundle ID,
entitlements, release settings, TestFlight/store settings, or CodeMagic
workflow configuration in this #437 planning task.

The iOS validation report must inspect and record:

- Flutter, Dart, Xcode, CocoaPods, Ruby, and iOS simulator/device versions.
- Current iOS deployment target constraints and whether ML Kit pod resolution
  requires a target change.
- CocoaPods resolution for `google_mlkit_text_recognition` and ML Kit pods,
  including conflicts or warnings.
- Whether text recognition model/resource assets are bundled in the app or
  require runtime download. Verify through build output, app artifact
  inspection, and simulator/device smoke behavior instead of assuming package
  behavior.
- Debug app artifact size and, when release validation is explicitly scoped,
  archive/IPA size. Record baseline and current sizes from the same build mode.
- Simulator smoke behavior where supported by the plugin and a physical-device
  smoke check where simulator behavior is insufficient for camera/image/native
  ML Kit proof.
- Airplane-mode/no-network behavior on a fresh install and after any model is
  already available.
- Xcode/device logs contain only bounded metadata and no raw OCR text, image
  bytes, local paths, provider URLs, storage internals, tokens, secrets,
  auth/session data, or unrelated sensitive content.

Stop and report instead of patching around the failure if iOS validation finds
pod resolution failure, Xcode build failure, deployment-target mismatch,
unexpected signing requirement for debug/no-codesign validation, unexpected
network/model-download requirement for Day 1 offline use, unacceptable app-size
impact requiring review, missing fallback/manual entry path, raw OCR or file
data leakage, native crash, permission surprise, or any need for signing,
provisioning, bundle ID, release, Podfile, project, or native config changes
outside the approved task scope.

## App Size And Asset Impact

Future native validation must measure baseline and current artifacts with the
same Flutter version, build mode, target platform, and branch base. At minimum:

- Record baseline artifact size from `origin/main` or another explicitly named
  expected base SHA before OCR/native changes.
- Record current artifact size from the exact validation head.
- Report absolute size and delta for Android debug APK and, when scoped, AAB or
  release APK.
- Report absolute size and delta for iOS debug app output and, when scoped,
  archive/IPA.
- List obvious ML Kit/model/resource entries found by artifact inspection.

No hidden pass/fail size threshold is defined by current repo docs. Size deltas
must be explicitly reviewed when ML Kit, language packs, model assets, native
frameworks, or packaging changes add meaningful weight. Day 1 Latin-script OCR
remains the default phase. Non-Latin language/model assets, additional ML Kit
script packages, or bundled OCR model expansion require explicit approval that
names platform support, offline behavior, app-size impact, and licensing.

## Offline And Local-Only Behavior

Future smoke validation must cover this matrix:

| Platform | Install state | Network state | Expected proof |
|---|---|---|---|
| Android | Fresh install | Airplane mode/no network | OCR path either works locally or fails into safe manual-entry fallback; it must not pretend Day 1 offline OCR is proven if a model download is required. |
| Android | After successful online OCR/model availability | Airplane mode/no network | OCR remains local if model is available, or reports bounded fallback without data loss. |
| iOS | Fresh install | Airplane mode/no network | Same proof from Mac/CodeMagic/device environment; Linux cannot prove it. |
| iOS | After successful online OCR/model availability | Airplane mode/no network | Same proof from Mac/CodeMagic/device environment. |

OCR suggestions stay provisional and review-first in every offline/local-only
case. Server OCR remains complementary. Day 1 on-device extraction must not
require the server OCR worker, server availability, or a network OCR service.
In server mode, OCR-derived client data remains provisional until API/domain
validation accepts it. In local-only mode, local OCR can support local drafts
only after user review or correction.

## Privacy, Logging, And Security

Native validation must prove debug/test output stays bounded. Logs, telemetry,
test reports, screenshots, failure messages, crash output, and artifacts must
not include:

- raw OCR text or full recognized text dumps;
- receipt image bytes, thumbnails, or derived image contents;
- local filesystem paths, storage paths, object keys, signed URLs, provider
  URLs, provider internals, vault internals, or storage internals;
- secrets, tokens, credentials, recovery codes, auth/session data, request
  bodies, `.env` values, SSH material, or local Codex state;
- payment details, unrelated user data, unrelated receipt contents, or native
  exception details that expose sensitive paths or payloads.

Allowed diagnostics are bounded metadata such as platform, provider family,
script hint, capability flag, status category, safe failure category, elapsed
time, artifact size, line/block count, warning category, and correlation ID.
File bytes remain behind storage abstractions and authorized API access.
Native OCR validation must not introduce generic file-byte APIs or bypass
existing receipt attachment/file authorization boundaries.

## Rollback And Failure Handling

Future runtime validation must keep a rollback path that can disable the native
provider or inject `UnsupportedReceiptOcrProvider`/fake provider behavior while
preserving manual entry. Disabling native OCR must not mutate bills, receipt
attachments, file bytes, storage metadata, OCR review records, settlements,
payments, balances, sync state, auth/session state, or audit truth.

Provider failures must route to bounded failure categories and manual-entry or
retry behavior. If native validation fails, the future task must stop and
report the failure instead of silently changing dependencies, SDK levels,
Gradle/Kotlin/AGP settings, Podfile, Xcode project files, manifests,
permissions, signing, provisioning, release settings, API contracts, schema, or
UI/Figma behavior.

## Future Task Handoff

This #437 packet is docs/control completion only. It defines future proof; it
does not complete Android or iOS native build validation.

Current docs-only validation for this task should include:

```bash
git status --short
git diff --name-only origin/main...HEAD
git diff --check origin/main...HEAD
npm run doctor:validation
npm run validate:docs
npm run validate:scaffold
PATH=/opt/flutter/bin:$PATH npm run doctor:mobile
cd apps/mobile && /opt/flutter/bin/flutter pub get
cd apps/mobile && /opt/flutter/bin/flutter analyze
cd apps/mobile && /opt/flutter/bin/flutter test
npm run validate:openapi
```

Future native validation reports must include:

- issue number, branch, base SHA, head SHA, runner OS, device/emulator/simulator
  identifiers, and whether the branch was pushed;
- exact commands and exact results;
- Android and iOS artifact paths, sizes, baseline sizes, and deltas;
- Gradle/AGP/Kotlin/SDK and Xcode/CocoaPods/deployment-target readbacks;
- model/resource inclusion findings and offline/no-network smoke results;
- fallback/manual-entry proof and review-first/provisional proof;
- log redaction proof;
- skipped validation rationale, especially any iOS proof not run on Mac or
  CodeMagic;
- scope guard confirming whether runtime/API/OpenAPI/generated-client/schema,
  auth/security, storage, money, OCR runtime/native config, Docker/CI/deploy,
  secrets, UI, or Figma changed.

Do not claim Day 1 OCR readiness until #437 native validation, #438
fallback/reference gate, parser/review coverage, provider behavior, and parent
#359 acceptance criteria are all satisfied through their proper scopes.
