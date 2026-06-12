# Mobile OCR Implementation Decision

## Status

Accepted candidate for the next implementation task.

The next Day 1 mobile OCR engine implementation should use
`google_mlkit_text_recognition` behind the existing mobile
`ReceiptOcrProvider` seam, limited to recognizing text from a selected or
captured image file. Receipt parsing, candidate review, and bill application
remain Settleora-owned workflows.

Confidence: medium-high. The package and underlying ML Kit APIs fit the
current Flutter app and Day 1 iOS/Android requirement, but the next
implementation branch still needs real iOS and Android build validation because
this decision branch intentionally does not add native dependencies.

## Decision date

2026-06-13 HKT.

## Current repo state

Settleora already has a mobile-only OCR seam, provisional parser, and review
handoff, but it does not run real native OCR yet.

- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_provider.dart` defines
  `ReceiptOcrProvider.extractReceipt(ReceiptOcrRequest)`.
- `ReceiptOcrRequest` currently carries image bytes and a content type.
- `ReceiptOcrResult` supports `extracted`, `unsupported`, and `failed`.
- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_parser.dart` converts raw
  recognized text into provisional receipt candidates.
- `apps/mobile/lib/receipt_ocr_capture/unsupported_receipt_ocr_provider.dart`
  is the default runtime provider.
- Personal and group bill create screens already call the provider when a
  receipt attachment is selected, then show a review-first preview before
  applying suggestions to editable form fields.
- Mobile tests already use fake providers for deterministic OCR behavior.
- `apps/mobile/pubspec.yaml` currently has `file_picker` but no OCR, camera,
  or image picker dependency.

Server-side receipt OCR review APIs also exist for saved receipt attachments,
apply-preview, and draft-only apply. They store bounded provisional or reviewed
OCR candidates linked to a receipt attachment; they do not run OCR, store raw
OCR full text, store receipt bytes in review rows, or automatically mutate bill,
split, settlement, payment, storage, worker, or job state.

## Requirements

Repo docs establish these requirements and constraints:

- On-device OCR is required for mobile offline flows, server-unavailable flows,
  and local-only profiles.
- The server OCR worker is complementary and cannot be the only OCR path.
- OCR output must be review-first and editable before it becomes a local record
  or queued server-mode change.
- Server-mode OCR-derived data remains provisional until the API validates and
  accepts it.
- Receipt/file bytes and OCR text are sensitive application data. Full OCR text,
  receipt bytes, storage paths, provider object keys, local client paths, signed
  URLs, and unrelated user data must not leak into logs or API responses.
- Future OCR implementation should avoid bundling oversized OCR or ML assets
  without explicit approval.
- Day 1 needs both iOS and Android support.
- Receipt image intake and normalization are separate from OCR. Camera scan,
  gallery import, file import, share-to-Settleora, offline queue upload, web
  upload, replacement upload, and server-side reprocessing must eventually use
  one intake policy before OCR/upload/storage.
- Settleora owns receipt parsing, review UX, item correction, line
  merge/split/reclassification, tax/fee/discount/tender handling, and explicit
  apply behavior. A package should not become the bill parser or financial
  authority.

## Candidate options

### `google_mlkit_text_recognition`

Summary: Flutter plugin from the `flutter-ml.dev` publisher that bridges
Google ML Kit Text Recognition to Flutter on Android and iOS.

- Supported platforms: Android and iOS.
- On-device/offline behavior: ML Kit text recognition processing happens
  on-device. Google states ML Kit does not send input data or outputs to Google
  servers, although APIs may contact Google for updates and send performance
  and utilization metrics that require user disclosure.
- Language/script support: Latin by default in the Flutter package. Chinese,
  Devanagari, Japanese, and Korean script support requires adding native script
  package dependencies. ML Kit v2 supports Chinese, Devanagari, Japanese,
  Korean, and Latin scripts.
- Maintenance and trust signals: verified publisher, current package release,
  high pub.dev usage signals, public GitHub repository, MIT license. The plugin
  explicitly says it is not sponsored or maintained by Google.
- License: plugin is MIT. Underlying ML Kit SDK is governed by Google ML Kit
  terms, not just the plugin license.
- Native build implications: Android min/compile/target SDK constraints must be
  checked in the implementation branch. The package uses platform channels and
  native ML Kit APIs. Non-Latin scripts require Android Gradle dependencies and
  iOS Podfile additions.
- Binary/model concerns: Android supports bundled and unbundled text
  recognition models. Google documents approximately 260 KB app-size increase
  per script architecture for unbundled Play Services libraries and
  approximately 4 MB per script architecture for bundled libraries. iOS ML Kit
  text recognition SDK assets are statically linked and documented at about
  38 MB per script SDK, which is a serious size concern if multiple scripts are
  enabled.
- Camera/file permissions: none for OCR itself when processing already selected
  bytes or a temporary file path. Camera/gallery/file permissions belong to the
  capture/import dependency, not this OCR engine.
- Testability: strong fit. Wrap the plugin in a concrete
  `MlKitReceiptOcrProvider`, feed recognized text to `ReceiptOcrParser`, and
  keep widget and parser tests on fake providers.
- iOS risks: ML Kit iOS size impact is high, especially for multiple scripts.
  Podfile changes and Xcode/CocoaPods CI behavior require validation.
- Android risks: unbundled models can fail before download completes; bundled
  models increase APK size. Play Services dependence may be unacceptable for
  strict offline-first Android installs unless the bundled library is selected.
- CI risks: native plugin and CocoaPods/Gradle resolution may expose local CI
  gaps even if Dart tests remain deterministic.
- Local-only fit: good if using available on-device/bundled assets. Avoid
  relying on first-use downloads for a local-only offline promise.
- Settleora Day 1 fit: best first candidate because it preserves app-owned
  parsing/review, has iOS and Android support through one Flutter dependency,
  and avoids introducing Tesseract traineddata assets.

Phase 1 should add only Latin script support first unless a human explicitly
approves the iOS size impact for additional scripts. Traditional Chinese and
other multilingual needs remain an extensibility requirement, not a silent
first dependency expansion.

### Platform-native Android ML Kit plus iOS Vision through Settleora platform channels

Summary: Build a Settleora-owned Flutter plugin or direct platform-channel
implementation. Android uses ML Kit Text Recognition v2. iOS uses Apple's
Vision `VNRecognizeTextRequest` or newer Vision APIs where available.

- Supported platforms: Android and iOS if implemented by Settleora.
- On-device/offline behavior: Android ML Kit processing is on-device, subject
  to the same model installation choice. Apple Vision text recognition is an
  on-device Apple framework.
- Language/script support: Android follows ML Kit script support. iOS follows
  Vision support for the deployed iOS versions and device capabilities; the app
  can query supported languages at runtime.
- Maintenance and trust signals: strongest authority over the bridge because
  Settleora owns it, but it creates ongoing Swift/Kotlin maintenance.
- License: Settleora code plus Apple platform SDK terms and Google ML Kit terms
  for Android.
- Native build implications: highest first-slice implementation cost. Requires
  Swift/Kotlin code, platform-channel API design, image temp-file handling, and
  native test/build coverage.
- Binary/model concerns: Android still needs bundled versus unbundled ML Kit
  choice. iOS Vision avoids adding Google ML Kit iOS model assets, likely
  reducing iOS binary size compared with ML Kit iOS.
- Camera/file permissions: none for OCR itself when processing a file. Capture
  and import remain separate.
- Testability: good if hidden behind `ReceiptOcrProvider`, but native bridge
  tests are more complex than a thin Flutter plugin wrapper.
- iOS risks: Vision behavior, language availability, and recognition quality
  can differ from Android ML Kit. Minimum iOS version must be verified against
  the app target.
- Android risks: same ML Kit model installation and Play Services decisions as
  above.
- CI risks: higher than the plugin approach because Settleora owns more native
  code from day one.
- Local-only fit: good if Android uses bundled models and iOS uses built-in
  Vision.
- Settleora Day 1 fit: good fallback if `google_mlkit_text_recognition` causes
  unacceptable iOS size, maintenance, or build issues. It is not the preferred
  Phase 1 because it is a larger first implementation.

### Apple Vision-focused packages or wrappers

Summary: Use a Flutter package that wraps Apple Vision directly, or build a
Vision-only OCR layer.

- Supported platforms: usually iOS only, or iOS plus uneven Android support in
  wrapper packages.
- On-device/offline behavior: Vision is on-device.
- Language/script support: depends on iOS version and device; supported
  languages should be queried rather than hardcoded.
- Maintenance and trust signals: mixed. Dedicated Vision wrappers found during
  research generally have lower adoption than the ML Kit Flutter package.
- License: package-specific, plus Apple SDK terms.
- Native build implications: lower iOS model asset burden, but does not solve
  Android by itself.
- Binary/model concerns: favorable on iOS because it uses platform frameworks.
- Camera/file permissions: none for OCR itself.
- Testability: acceptable behind `ReceiptOcrProvider`.
- iOS risks: good platform fit, but wrapper quality varies.
- Android risks: no Android engine unless paired with a separate dependency.
- CI risks: native iOS wrapper still needs validation.
- Local-only fit: good for iOS only.
- Settleora Day 1 fit: not sufficient as the main Phase 1 engine because Day 1
  requires Android and iOS.

### Tesseract-style on-device OCR packages

Summary: Use Flutter Tesseract wrappers such as `flutter_tesseract_ocr` or
`tesseract_ocr`.

- Supported platforms: packages vary, but Android and iOS are commonly claimed.
- On-device/offline behavior: on-device if traineddata assets are bundled or
  otherwise locally available.
- Language/script support: Tesseract supports many languages in principle, but
  each language normally requires traineddata assets and app-side asset
  management.
- Maintenance and trust signals: weaker for Day 1. `flutter_tesseract_ocr` has
  meaningful usage but an unverified uploader. `tesseract_ocr` is newer and
  adds custom CocoaPods setup for iOS.
- License: commonly BSD-3-Clause for the wrapper; Tesseract and traineddata
  licenses/assets must be reviewed separately before bundling.
- Native build implications: native libraries, iOS Pod/CocoaPods complexity,
  Android native integration, and traineddata asset packaging.
- Binary/model concerns: high risk. Language assets can grow quickly and would
  violate the repo's "no oversized OCR/ML assets without explicit approval"
  guardrail if added silently.
- Camera/file permissions: none for OCR itself.
- Testability: can be hidden behind `ReceiptOcrProvider`, but asset-dependent
  behavior is more fragile in local and CI environments.
- iOS risks: native library and CocoaPods complexity, app size, and performance.
- Android risks: native library packaging and device performance.
- CI risks: higher than ML Kit plugin due to native assets and platform
  libraries.
- Local-only fit: good once assets are bundled, but at a size and maintenance
  cost.
- Settleora Day 1 fit: not recommended for Phase 1. Keep as a later fallback if
  ML Kit/Vision quality or language coverage is inadequate and asset size is
  explicitly approved.

### Receipt-specific wrapper packages built on ML Kit

Summary: Packages such as `receipt_recognition` or `receipt_reader` combine ML
Kit OCR with receipt parsing.

- Supported platforms: usually inherit ML Kit mobile support, but exact support
  varies by package.
- On-device/offline behavior: likely on-device where they delegate to ML Kit.
- Language/script support: constrained by ML Kit and wrapper parser assumptions.
- Maintenance and trust signals: weak for Settleora authority. For example,
  `receipt_recognition` had low pub.dev adoption signals and an unverified
  uploader in current research.
- License: varies by package. `receipt_recognition` search results were
  inconsistent across package pages, so license must be rechecked before any
  dependency proposal.
- Native build implications: adds ML Kit plus additional parser dependencies.
- Binary/model concerns: same ML Kit concerns, with extra dependency surface.
- Camera/file permissions: usually none for OCR itself unless the package also
  performs capture.
- Testability: poor fit as the main authority because Settleora already owns
  parser/review behavior and needs deterministic edge-case handling for tax,
  fees, discounts, tender, returns, and splits.
- iOS risks: inherits ML Kit iOS size and build concerns.
- Android risks: inherits ML Kit model installation concerns.
- CI risks: larger dependency graph and less proven package quality.
- Local-only fit: only acceptable if the underlying engine is local and the
  parser is bypassed or treated as advisory.
- Settleora Day 1 fit: not recommended as the OCR authority. At most, inspect
  parser ideas later, but do not depend on a receipt wrapper for Day 1 bill
  candidate truth.

### Document scanner and camera helper packages

Summary: Packages such as `google_mlkit_document_scanner`, `flutter_doc_scanner`,
`camera`, `image_picker`, and the existing `file_picker` can help acquire or
normalize images, but they are not the OCR engine.

- Supported platforms: varies. `google_mlkit_document_scanner` is Android-only
  beta per its package page. `flutter_doc_scanner` claims Android and iOS using
  ML Kit Document Scanner and VisionKit. `camera` and `image_picker` are
  Flutter team packages with broad platform support. `file_picker` is already
  in this repo.
- On-device/offline behavior: capture helpers do not determine OCR processing.
  Google ML Kit Document Scanner resources are delivered through Google Play
  services.
- Language/script support: not applicable unless the package also performs OCR.
- Maintenance and trust signals: Flutter team packages (`camera`,
  `image_picker`) have strongest trust signals. ML Kit document scanner plugin
  comes from the same verified `flutter-ml.dev` publisher but is Android-only
  beta. Other scanner wrappers vary.
- License: `camera` is BSD-3-Clause. `image_picker` uses Apache-2.0 and
  BSD-3-Clause. `file_picker` is MIT. `google_mlkit_document_scanner` is MIT.
- Native build implications: camera/gallery packages require native permission
  and platform configuration review.
- Binary/model concerns: document scanner can have low app binary impact on
  Android because large resources are delivered by Google Play services, but
  that also means it is not a strict local-only first-use guarantee.
- Camera/file permission implications: camera capture requires camera usage
  descriptions and runtime permission. Photo/gallery/file import has separate
  platform privacy behavior. The OCR engine dependency should not force these.
- Testability: intake helpers should sit behind a separate file/capture input
  seam so OCR provider tests stay deterministic.
- iOS risks: document-scanner parity varies. Camera/gallery permissions and
  limited-library access need explicit UX.
- Android risks: Google Play Services document scanner is Android-only and beta;
  camera/gallery permissions must follow current Play policy.
- CI risks: native capture dependencies require mobile validation, but should
  be introduced in a separate task from OCR engine wiring.
- Local-only fit: existing `file_picker` plus already-selected bytes is the
  smallest safe Phase 1 intake. Camera scanning and document scanner UX should
  be later phases.
- Settleora Day 1 fit: useful for capture/import, not as the OCR engine.

## Option matrix

| Option | Platforms | Offline/local fit | Trust | Size risk | Build risk | Day 1 fit |
| --- | --- | --- | --- | --- | --- | --- |
| `google_mlkit_text_recognition` | iOS, Android | Good if bundled/available models are used | Strong plugin usage, not Google-maintained | Medium on Android, high on iOS for extra scripts | Medium | Best Phase 1 |
| Native Android ML Kit + iOS Vision | iOS, Android | Good, especially with iOS Vision and Android bundled models | Strongest app control | Medium Android, lower iOS | High | Good fallback |
| Apple Vision wrapper | Usually iOS-first | Good on iOS | Mixed wrapper quality | Low | Medium | Not enough alone |
| Tesseract wrappers | Varies, often iOS/Android | Good after assets are bundled | Mixed | High traineddata risk | High | Not Phase 1 |
| Receipt-specific wrappers | Usually iOS/Android via ML Kit | Depends on underlying engine | Weak to mixed | Same as ML Kit plus extra deps | Medium | Do not use as authority |
| Capture/document helpers | Varies | Intake only | Strong for Flutter team packages | Varies | Medium | Separate phase |

## Recommendation

Use `google_mlkit_text_recognition` as the preferred Phase 1 OCR engine
dependency, wrapped in a new concrete provider behind `ReceiptOcrProvider`.

The first implementation should:

- Add one OCR engine dependency only: `google_mlkit_text_recognition`.
- Start with Latin script recognition only unless a human explicitly approves
  adding extra script packages and the associated iOS binary-size cost.
- Convert selected receipt image bytes to the input form required by the plugin,
  likely a temporary app-cache file if the plugin requires a file path.
- Feed recognized plain text into the existing `ReceiptOcrParser`.
- Return `ReceiptOcrResult.extracted`, `unsupported`, or `failed` without
  logging receipt bytes or full recognized text.
- Keep parser/review/bill-field application app-owned and covered by current
  fake-provider tests.

Do not add these in Phase 1:

- Tesseract, Tesseract traineddata, or other OCR/ML assets.
- Receipt-specific parser wrappers as an authority.
- Document scanner packages as the OCR engine.
- Camera, gallery, image picker, share-sheet, image cropper, or permission
  dependencies unless the exact task is an intake/capture task.
- Server OCR worker runtime, backend endpoints, OpenAPI changes, generated
  clients, schema changes, or bill/settlement/money logic changes.

If `google_mlkit_text_recognition` fails the next branch's iOS/Android build or
size gate, switch to the fallback decision: Settleora-owned platform channels
using Android ML Kit Text Recognition and iOS Vision, still behind
`ReceiptOcrProvider`.

## Phased implementation plan

### Phase 1: OCR engine from already selected receipt image

Scope:

- Add `google_mlkit_text_recognition` to `apps/mobile/pubspec.yaml`.
- Add a provider such as
  `apps/mobile/lib/receipt_ocr_capture/mlkit_receipt_ocr_provider.dart`.
- Wire the app bootstrap to use the ML Kit provider on supported mobile
  platforms and keep `UnsupportedReceiptOcrProvider` as fallback where needed.
- Preserve dependency injection so tests can pass fake providers.
- Process one selected receipt image through the existing bill create flow.
- Avoid capture, gallery, document scanner, image normalization expansion, and
  server review API changes unless explicitly scoped.

Minimum permissions:

- No new camera permission for OCR-only Phase 1.
- No new broad photo-library permission for OCR-only Phase 1 if continuing to
  use the existing file-picker flow.
- If temporary files are used for OCR input, keep them in app cache and delete
  or overwrite them promptly after recognition.

Validation for the implementation branch:

- `git diff --check`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`
- A focused widget/provider test proving fake providers remain deterministic.
- Manual or CI iOS and Android build validation if native plugin addition is in
  scope for that task.

### Phase 2: Capture/import intake

Scope:

- Decide separately between keeping `file_picker`, adding `image_picker`, adding
  `camera`, or adding a document scanner helper.
- Implement receipt image normalization policy before OCR/upload/storage.
- Add only the minimum camera/photo/file permissions needed for the chosen
  intake path.
- Keep capture/import behind a separate seam from OCR so OCR tests remain
  deterministic.

### Phase 3: Multilingual/script expansion

Scope:

- Add script packages only after measured Day 1 receipt language need and human
  approval of binary-size tradeoffs.
- Prefer explicit supported-language UI/telemetry that does not log receipt
  contents.
- Validate Traditional Chinese, Japanese, Korean, and other priority receipts
  with fixture images before enabling wider defaults.

### Phase 4: Server worker complement

Scope:

- Add server OCR worker runtime only through a separate architecture and
  implementation branch.
- Keep worker output provisional until API validation and user review.
- Do not let server OCR replace required on-device OCR.

## Non-goals

- No runtime OCR implementation in this decision branch.
- No Flutter dependency changes in this decision branch.
- No camera, image picker, document scanner, or file permission changes in this
  decision branch.
- No native Android or iOS file changes in this decision branch.
- No backend/server OCR endpoints, worker runtime, OpenAPI changes, generated
  clients, schema/migrations, auth/session/security changes, money/settlement
  logic changes, Docker/CI/deployment changes, or secrets.
- No automatic OCR-to-bill finalization.
- No non-draft shared-bill revision apply.
- No receipt-specific wrapper becoming bill parsing or financial authority.

## Risks and mitigations

- iOS ML Kit size risk: start with Latin only. Require explicit approval before
  adding Chinese, Devanagari, Japanese, or Korean ML Kit iOS script SDKs.
- Android first-use offline risk: do not rely on first-use unbundled model
  downloads for local-only offline support. Prefer a bundled model or an
  explicit install-time/download readiness gate if unbundled is chosen.
- Google metrics disclosure risk: update app privacy disclosures in the
  implementation task because ML Kit may send performance and utilization
  metrics even though receipt inputs and outputs stay on-device.
- Plugin maintenance risk: keep the provider seam narrow so Settleora can swap
  to a native platform-channel provider without changing bill create/review
  screens.
- OCR quality risk: treat OCR as text extraction only. Keep `ReceiptOcrParser`
  and review UX conservative, editable, and fake-testable.
- Sensitive data risk: do not log image bytes, local paths, or full recognized
  text. Return bounded parser candidates and safe user-facing errors.
- CI risk: add native dependency in a dedicated branch with mobile doctor,
  Flutter analyze/test, and platform build validation.

## Validation plan for next implementation

The next implementation branch should prove:

- Existing fake-provider tests still run without native OCR.
- Unsupported platforms or plugin failures return safe manual-entry fallback.
- Selected receipt bytes are processed locally and produce parser input without
  logging sensitive content.
- Temporary files, if used, are app-cache scoped and not uploaded or persisted
  as OCR review state.
- Personal and group bill create continue to show review-first suggestions that
  users can edit before save.
- Server-mode behavior remains provisional until API validation and explicit
  apply.
- No OpenAPI, generated client, schema, backend worker, settlement, payment,
  auth, or deployment behavior changes are hidden in the OCR dependency branch.

## Sources checked

Repo sources:

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- `docs/architecture/OCR_ARCHITECTURE.md`
- `docs/prd/MVP_DAY1_SCOPE.md`
- `docs/prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md`
- `apps/mobile/pubspec.yaml`
- `apps/mobile/lib/receipt_ocr_capture/**`
- `apps/mobile/lib/bills/**`
- `apps/mobile/test/receipt_ocr_capture/receipt_ocr_parser_test.dart`
- `apps/mobile/test/bill_list_screen_test.dart`
- `apps/mobile/test/group_bill_list_screen_test.dart`
- `apps/mobile/test/receipt_ocr_review_generated_repository_test.dart`
- `apps/mobile/test/receipt_ocr_review_screen_test.dart`

External sources:

- `google_mlkit_text_recognition` pub.dev package:
  https://pub.dev/packages/google_mlkit_text_recognition
- Google ML Kit Text Recognition v2 overview:
  https://developers.google.com/ml-kit/vision/text-recognition/v2
- Google ML Kit Text Recognition v2 for Android:
  https://developers.google.com/ml-kit/vision/text-recognition/v2/android
- Google ML Kit Text Recognition v2 for iOS:
  https://developers.google.com/ml-kit/vision/text-recognition/v2/ios
- Google ML Kit Terms and Privacy:
  https://developers.google.com/ml-kit/terms
- Google ML Kit model installation paths on Android:
  https://developers.google.com/ml-kit/tips/installation-paths
- Apple Vision text recognition documentation:
  https://developer.apple.com/documentation/vision/recognizing-text-in-images
- Apple Vision supported recognition language APIs:
  https://developer.apple.com/documentation/vision/vnrecognizetextrequest/supportedrecognitionlanguages%28for%3Arevision%3A%29
- `google_mlkit_document_scanner` pub.dev package:
  https://pub.dev/packages/google_mlkit_document_scanner
- `flutter_tesseract_ocr` pub.dev package:
  https://pub.dev/packages/flutter_tesseract_ocr
- `tesseract_ocr` pub.dev package:
  https://pub.dev/packages/tesseract_ocr
- `flutter_native_ocr` pub.dev package:
  https://pub.dev/packages/flutter_native_ocr
- `receipt_recognition` pub.dev package:
  https://pub.dev/packages/receipt_recognition
- `receipt_reader` pub.dev package:
  https://pub.dev/packages/receipt_reader
- `camera` pub.dev package:
  https://pub.dev/packages/camera
- `image_picker` pub.dev package:
  https://pub.dev/packages/image_picker
- `file_picker` pub.dev package:
  https://pub.dev/packages/file_picker
