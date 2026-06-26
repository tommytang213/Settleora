# OCR ML Kit Provider Integration Plan

## Purpose

This docs/control packet records the #436 boundary for the ML Kit on-device OCR
provider slice under #359. It is a control plan only. It does not authorize new
runtime behavior, dependency changes, native build changes, API changes,
OpenAPI/generated-client changes, schema changes, UI/Figma work, storage/file
byte behavior, money mutation, settlement mutation, or bill finalization.

Current repo state already includes a mobile provider seam and ML Kit provider
implementation:

- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_provider.dart` defines
  `ReceiptOcrProvider.extractReceipt(ReceiptOcrRequest)`.
- `apps/mobile/lib/receipt_ocr_capture/mlkit_receipt_ocr_provider.dart` wraps
  `google_mlkit_text_recognition` behind that seam.
- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_parser.dart` converts
  recognized text into provisional receipt candidates.
- `apps/mobile/lib/receipt_ocr_capture/unsupported_receipt_ocr_provider.dart`
  remains a safe unsupported fallback provider.
- `apps/mobile/pubspec.yaml` and `apps/mobile/pubspec.lock` already include
  `google_mlkit_text_recognition` on the current base branch.

This task must not add, remove, or change those dependencies or native build
files. Any future provider implementation or rework must be explicitly scoped
and validated separately.

## Provider Boundary

`google_mlkit_text_recognition` is a mobile on-device OCR provider behind the
`ReceiptOcrProvider` seam. The provider's job is limited to turning a prepared
image file into recognized text or structured text blocks that Settleora-owned
code can parse into provisional candidates.

The provider must not become:

- the receipt parser authority;
- the bill apply authority;
- the source of money, split, tax, fee, discount, settlement, payment, storage,
  authorization, status transition, sync acceptance, or audit truth;
- a bypass around group, bill, file, or server-mode authorization.

OCR output remains provisional candidate data. Parser/review handoff remains
Settleora-owned and must follow
[OCR parser and review handoff test plan](OCR_PARSER_REVIEW_HANDOFF_TEST_PLAN.md).

In server mode, API/domain services remain authoritative for writes,
authorization, bill finalization, money, splits, settlements, storage access,
status transitions, sync acceptance, and audit. In local-only mode, local OCR
can support local draft creation only after user review or correction.

## Day 1 Phase And Language Scope

Phase 1 is Latin-script only unless Tommy explicitly approves broader
multilingual assets. The current provider should continue to use the Latin text
recognition path for the first Day 1 slice.

Broader multilingual support remains an architecture goal, not silent Day 1
dependency scope. Chinese, Japanese, Korean, Devanagari, or other script
support must not be added by pulling native model packages, traineddata assets,
or large bundled OCR assets without separate approval that names app-size,
offline behavior, licensing, platform support, and validation impact.

Unsupported language or script handling must route to review-safe fallback or
manual-entry behavior. Unsupported results must not finalize a bill, apply a
draft, infer a split, mutate money, mutate settlements, or hide the need for
review. UI details for unsupported, retry, offline, and manual-entry states
remain under #438.

## Dependency And Native Setup Plan

Future provider implementation or rework should inspect these paths and risks
only when explicitly scoped:

- `apps/mobile/pubspec.yaml` and `apps/mobile/pubspec.lock` for Flutter package
  version changes.
- Android Gradle settings, Kotlin/Android plugin constraints, Android SDK
  minimum/compile/target versions, manifest implications, Play Services model
  behavior, bundled versus unbundled model choice, and APK/AAB size.
- iOS Podfile, CocoaPods resolution, minimum iOS target, Xcode build settings,
  ML Kit iOS SDK size impact, app thinning expectations, and offline model
  behavior.
- Local-only/offline behavior where first-use model downloads would break the
  offline promise.
- CI and device/emulator coverage required to prove the native plugin resolves
  and starts cleanly.

#437 remains the native iOS/Android build validation gate. Provider work that
requires native dependency changes must stop until #437's validation plan and
commands are satisfied.

This #436 docs packet must not change `apps/mobile/pubspec.yaml`, lockfiles,
Android Gradle/Kotlin/Manifest files, iOS Podfile/CocoaPods/plist/Swift/Obj-C
files, entitlements, or native project files.

## Privacy And Safe Logging

OCR text and receipt images are sensitive. Provider integration, parser
handoff, logs, telemetry, errors, test snapshots, and reports must not include:

- raw OCR text or full recognized text dumps;
- receipt images, file bytes, thumbnails, or derived image contents;
- local filesystem paths, storage paths, object keys, provider internals,
  signed URLs, or vault internals;
- secrets, tokens, credentials, auth/session data, request bodies, or local
  Codex state;
- payment details, unrelated user data, unrelated receipt contents, or
  unbounded native exception details.

Allowed diagnostics are bounded metadata such as provider name, platform
category, script or language hint, safe capability flags, confidence ranges if
available, elapsed timing, failure category, line/block counts, warning or
block reason categories, and correlation IDs.

Where server or file access is involved, file bytes still go through the
storage abstraction and API authorization boundary. A local image path used by
the provider is never storage authority and must not appear in server responses
or audit payloads.

## Parser And Review Handoff

The provider returns recognized text or blocks to parsing as provisional input
only. `ReceiptOcrParser` and later review surfaces may suggest merchant, date,
currency, totals, line descriptions, quantities, unit prices, and warnings, but
those suggestions remain editable and review-first.

Review screen/user confirmation is required before any bill apply or
finalization path. Apply-preview remains read-only; explicit draft apply remains
API/domain-owned where available.

No authoritative money mutation, split mutation, settlement mutation, revision
approval, payer confirmation, storage authorization decision, status
transition, sync acceptance, or audit decision may originate in provider output.

If future provider output contains blocks, confidence, languages, or bounding
boxes, those fields are advisory metadata only until a reviewed parser/review
design decides how to use them.

## Fake Provider And Fixture Tests

Future implementation and regression tests should keep provider behavior
deterministic through fake providers and fixture text wherever possible.

Required fake-provider coverage:

- deterministic recognized text/blocks;
- unsupported platform, content type, provider configuration, language, or
  script results;
- empty recognized text results;
- provider errors and bounded failure categories;
- cancellation or image preparation cancellation;
- retry behavior that re-enters the provider seam;
- offline/local-only operation that remains review-safe;
- parser handoff into editable provisional candidates;
- redaction checks proving raw text, bytes, paths, provider internals, tokens,
  object keys, and unrelated sensitive content are not surfaced.

Tests must align with
[OCR parser and review handoff test plan](OCR_PARSER_REVIEW_HANDOFF_TEST_PLAN.md).
Full provider/native end-to-end coverage remains blocked by provider
implementation scope, #437 native validation, and #438 fallback/error/retry UI
reference.

## Failure, Rollback, And Fallback Boundaries

Provider rollout should remain reversible through an explicit app config,
feature flag, injected provider selection, or equivalent rollback seam. Turning
off the provider must fall back to `UnsupportedReceiptOcrProvider` or another
manual-entry-safe path without changing bill, storage, money, or settlement
authority.

Failure paths should use bounded categories such as unsupported platform,
unsupported script, unavailable model, empty text, image preparation failure,
native provider failure, cancellation, timeout if applicable, and unknown
provider failure. They should route to review-safe fallback/manual-entry
behavior and must not finalize bills.

#438 remains the UI/Figma/reference gate for fallback, error, retry, offline,
and manual-entry user experience. Provider implementation must not invent a
visually complete UX outside that gate.

## Validation Expectations By Future Changed Surface

Docs/control-only updates to this packet:

```bash
git status --short
git diff --name-only origin/main...HEAD
git diff --check origin/main...HEAD
npm run doctor:validation
npm run validate:docs
npm run validate:scaffold
```

Provider implementation or provider tests under `apps/mobile`:

```bash
PATH=/opt/flutter/bin:$PATH npm run doctor:mobile
cd apps/mobile && /opt/flutter/bin/flutter pub get
cd apps/mobile && /opt/flutter/bin/flutter analyze
cd apps/mobile && /opt/flutter/bin/flutter test
```

Native iOS/Android validation remains #437 scope and should add exact platform
build, Gradle, CocoaPods, model-availability, app-size, and offline behavior
checks when that gate is opened.

OpenAPI/generated-client validation is not required for provider-only mobile
work unless the future slice changes API contracts or generated client output.
If a future slice needs API, OpenAPI/generated clients, schema/migrations,
storage/file-byte behavior, auth/security, money/settlement, Docker/CI/deploy,
or UI/Figma scope, stop and rescope before implementation.

## Stop Conditions

Stop and report before implementation if the work requires any of these:

- API endpoint, OpenAPI, generated-client, schema, migration, or server worker
  changes.
- Storage/file-byte behavior, object-key handling, signed URL behavior,
  thumbnails, vault behavior, or file authorization changes.
- Auth/session/security, authorization, audit policy, Docker, CI, deployment,
  release, environment, signing, secret, SSH, or local Codex state changes.
- Money, split, tax, settlement, payment, bill calculation, bill finalization,
  revision approval, payer confirmation, or status transition authority
  changes.
- Non-Latin or broad multilingual native assets without explicit approval.
- UI/Figma implementation beyond the #438 reference gate.
