# M6 Mobile Receipt OCR Capture + Review Handoff QA Map

Status: `M6-001 reconciled; M6-002 queued; manual UI/code review deferred until Day 1 acceptance`

## Purpose

M6 hardens the mobile receipt OCR capture, provisional saved-review, apply-preview, and draft-only apply handoff UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security changes, storage/file privacy or authorization policy changes, generic file/receipt/OCR APIs, OCR worker/runtime behavior, OCR engine native dependency or platform configuration changes, money or settlement calculation changes, automatic OCR finalization, non-draft shared-bill revision apply, deployment, Docker, CI, secrets, web/admin runtime UI, or broad offline cache/sync work.

## Repo-State Basis

- `README.md` records a starter mobile receipt OCR review queue/detail/edit foundation and still lists mobile OCR extraction/capture, automatic OCR-to-bill finalization, non-draft OCR revision apply, and OCR worker/runtime behavior as future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires mobile receipt capture/import, policy-driven receipt image normalization before upload/storage, on-device OCR, OCR review/correction, provisional server-mode validation, receipt item correction, duplicate warnings, and manual fallback.
- `docs/features/receipt-ocr/FUNCTIONAL_SPEC.md` defines the user flow from capture/import through OCR review, correction, and bill/expense draft preview.
- `docs/features/receipt-ocr/TECHNICAL_SPEC.md` keeps on-device OCR as a mobile responsibility, API validation authoritative in server mode, storage bytes behind the storage abstraction, and worker behavior complementary.
- `docs/architecture/OCR_ARCHITECTURE.md` records current bill-scoped OCR review intake/list/read/apply-preview/apply endpoints for existing receipt attachments and keeps OCR engine/worker, standalone receipt APIs, thumbnails, and automatic finalization out of current scope.
- `docs/architecture/RECEIPT_OCR_REVIEW_UX_FLOW.md` defines the mobile-first Day 1 receipt OCR flow and says current mobile has saved-review foundations but not full capture/upload/OCR extraction UI.
- `docs/architecture/RECEIPT_OCR_REVIEW_APPLY_POLICY.md` defines current draft-only apply authority and forbids clients from submitting bill totals, split allocations, settlement data, file metadata, actor identity, or review truth as authority.

## Current Implementation Inventory

M6-001 reconciled the current repo state after PR #160 without changing runtime or tests.

### Capture, Provider, Parser, And Preview

- `apps/mobile/lib/receipt_ocr_capture/receipt_image_intake.dart` defines `ReceiptImageIntake` with camera/gallery sources and `ImagePickerReceiptImageIntake`. It uses `image_picker`, strips full metadata by request, returns `SettleoraPickedBillAttachmentFile` with receipt-allowed content types, preserves the local path for platform OCR input, and maps permission/selection failures to manual-entry-safe copy.
- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_provider.dart` defines the provider seam and `ReceiptOcrResult` states: `extracted`, `unsupported`, and `failed`.
- `apps/mobile/lib/receipt_ocr_capture/unsupported_receipt_ocr_provider.dart` is the manual-entry fallback provider.
- `apps/mobile/lib/receipt_ocr_capture/mlkit_receipt_ocr_provider.dart` is the current default app-bootstrap provider. It runs only on iOS/Android, requires a prepared local image path, uses ML Kit text recognition, returns unsupported on other platforms, and returns bounded failure copy when text is empty or extraction fails.
- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_parser.dart` is a conservative heuristic parser. It detects basic merchant/date/currency/header totals, tax/service/discount labels, and up to 40 positive item-line candidates; it filters administrative/payment lines and emits warnings when clear item or total candidates are missing.
- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_preview.dart` models provisional preview fields, item candidates, and local review hints for item total vs subtotal/grand-total mismatch. These hints are not authoritative financial validation.

Current parser/provider limitations:

- It is not a complete Day 1 receipt model. It does not preserve item-level tax category/rate, tax-included/excluded interpretation, discounts/refunds/tax corrections, tender/change/void/free semantic line classes, merge/split lineage, duplicate receipt authority, or multi-participant split inference.
- It does not implement receipt image normalization policy, raw source retention policy, thumbnail behavior, OCR worker behavior, generic receipt APIs, or server OCR ingestion.

### Bill Create Intake And Provisional Review Handoff

- `apps/mobile/lib/bills/bill_list_screen.dart` wires receipt image intake and provider seams into personal and group bill create flows.
- Personal and group create flows can pick camera/gallery receipts through `ReceiptImageIntake` when available, or fall back to the existing attachment file-input path. Receipt-purpose files run OCR preview; supporting attachments do not.
- The OCR preview panel lets users edit merchant/date/currency and item candidates, add/remove/reset candidate rows, select which sections to apply to the local editable bill draft, and retry failed capture/extraction. Unsupported or failed OCR keeps manual entry available.
- Applying the local OCR preview changes only the editable in-memory bill create form before save. It is not server acceptance and does not mutate any existing authoritative bill.
- After a new bill is created and receipt attachment upload succeeds, the screen attempts to save a provisional OCR review through `ReceiptOcrReviewRepository.saveReview`. Save success records a handoff notice/open action; save failure does not block bill creation and leaves a retry route/request for the bill detail.
- Group create preserves group route context for review save, and new OCR item rows stay unassigned until split members are chosen. Mobile does not infer multi-participant splits from OCR.
- Duplicate warning UX exists around OCR receipt candidates and can route to review an existing bill or allow save after explicit confirmation. It remains UI guidance, not an authoritative duplicate decision.

### Attachment Detail Handoff

- `apps/mobile/lib/bills/bill_attachment_section.dart` lists, uploads, downloads, removes, filters, and searches purpose-specific bill attachments through `SettleoraBillAttachmentRepository`.
- Upload purpose selection distinguishes `receipt` from `supporting_attachment`; receipt copy says it can move into OCR review, while supporting files are reference-only.
- Receipt OCR review actions are shown only when `receiptOcrReviewRepository` is present and the attachment purpose is `receipt`.
- Opening OCR review from attachment metadata uses typed personal or group `ReceiptOcrReviewRoute` values. Supporting attachments and absent review repositories do not expose review actions.
- Attachment failures and row metadata are bounded and avoid exposing raw OCR text, storage paths, provider object keys, tokens, stack traces, or local file paths.

### Saved OCR Review Queue, Detail, Edit, Preview, And Apply

- `apps/mobile/lib/receipt_ocr_review/receipt_ocr_review_repository.dart` defines the mobile receipt OCR review model, route, save request, preview response, apply result, failure kinds, and repository interface.
- `apps/mobile/lib/receipt_ocr_review/generated_receipt_ocr_review_repository.dart` is generated-client backed and session-gated through `SettleoraAccessTokenProvider`. It uses personal routes when `groupId` is absent and group routes when `groupId` is present.
- The generated repository maps list/get/save/delete/apply-preview/apply responses into mobile models and maps missing token, 401, 403, 404/410, 409, 400/422, network, and server failures to bounded UI failures.
- `apps/mobile/lib/receipt_ocr_review/receipt_ocr_review_screen.dart` provides the global saved-review queue and full detail screen. The queue supports loading, refresh, search/filter, retained last-known rows on refresh failure, typed personal/group routes, and safe return handling after save/apply/delete.
- The full detail screen loads a saved review, displays provisional header/line candidates, edits merchant/date/currency/header totals/lines, saves through the route-aware repository, deletes only the saved review after confirmation, requests non-mutating apply-preview, and applies only after explicit confirmation.
- Apply uses `expectedReviewUpdatedAtUtc` from the preview and repository mode `replace_draft_ocr_items`, so stale-preview protection is handed to the API. Busy states block duplicate preview/apply/save/delete work.
- `apps/mobile/lib/bills/bill_list_screen.dart` also contains the bill-detail saved-review bottom sheet. It opens direct saved-review discovery from receipt attachments, preserves personal/group route context, supports edit/refresh/remove, requests apply-preview, and explicit draft apply with expected preview timestamp.
- Saved-review UI copy consistently states that review and preview are provisional and that applying asks the server/API to validate; mobile does not claim final bill, settlement, payment, file, split, authorization, or money authority.

### App Wiring And Server Mode

- `apps/mobile/lib/app/app_bootstrap.dart` creates the generated receipt OCR review repository from the current API configuration and secure access-token provider. It defaults receipt image intake to `ImagePickerReceiptImageIntake()` and OCR provider to `MlKitReceiptOcrProvider()`.
- `apps/mobile/lib/app/server_mode_shell.dart` accepts injected receipt image intake, OCR provider, and receipt OCR review repository dependencies and passes them into personal bill, group bill, notification, and receipt-review surfaces. Its constructor fallback is `UnsupportedReceiptOcrProvider`, so tests and unsupported environments can keep manual entry behavior.
- Server-mode calls are session-gated at repository level. Missing or expired sessions fail before generated-client calls and surface sign-in-required copy.

### Where Mobile Does Not Mutate Authoritative State

- Mobile local OCR preview may prefill editable create-form fields before a new bill is saved, but it does not mutate an existing saved bill.
- Saved OCR review save/update/delete mutates only provisional review state through the API's bill attachment OCR review endpoints.
- Apply-preview is read-only.
- Draft apply is explicit, confirmation-gated, generated-client backed, and limited to the API's current `replace_draft_ocr_items` mode. The API remains responsible for validation, authorization, bill item mutation, source markers, and stale review checks.
- Mobile never writes settlement, payment, residual, balance, proof, storage/file metadata, OCR worker/job state, non-draft revision apply, automatic finalization, or multi-participant split inference.

## Day 1 Requirement Map

| Day 1 requirement | Current implementation state | Gap / next focus |
| --- | --- | --- |
| Mobile receipt capture/import | Camera/gallery image intake exists for bill create; receipt-purpose file input also exists. Upload remains purpose-specific bill attachment runtime. | M6-002 should harden intake handoff expectations and retry states. Full policy-driven image normalization, share-sheet/file replacement coverage, and raw retention policy are not implemented here. |
| On-device OCR required | ML Kit provider seam exists for iOS/Android, unsupported provider fallback exists, and OCR output remains provisional. | Provider/platform behavior needs focused characterization in M6-002. Any native dependency/platform config or engine selection change is out of M6-001 scope. |
| OCR review/correction | Local create preview can edit merchant/date/currency/item candidates. Saved-review queue/detail/sheet can edit saved merchant/date/currency/header/line candidates. | Full Day 1 line classification, tax category/rate, tax-included/excluded, refunds, tender/change, merge/split lineage, and duplicate authority remain uncovered. |
| Provisional server-mode acceptance | Generated-client repository saves provisional review data through session-gated personal/group attachment OCR review endpoints. | M6-002/M6-003 should keep copy and tests explicit that server-mode data is provisional until API validation. |
| Bill attachment handoff | Receipt attachments can open saved OCR review; supporting files cannot. Receipt OCR review save failure after bill create is retryable from detail. | M6-002 should focus on capture/intake-to-attachment-to-review-save resilience. |
| Apply-preview before mutation | Saved-review detail and bill-detail sheet request read-only apply-preview and show blockers/warnings. | M6-003 should harden stale/blocked preview states and recovery copy. |
| Explicit draft-only apply | Apply is confirmation-gated, duplicate-action guarded, uses `expectedReviewUpdatedAtUtc`, and sends `replace_draft_ocr_items`. | M6-003 should focus on duplicate mutation prevention, refresh-after-apply, blocked apply responses, and safe retry states. |
| Manual fallback | Unsupported provider, OCR failure, blocked preview/apply, unavailable review, denied/session failures, and failed review save keep manual bill/attachment editing available. | M6-002/M6-003 should preserve this across all hardening work. |
| Server authority | Mobile does not infer authorization, final money, split policy, settlement impact, file authority, or bill mutation eligibility. | Continue to stop if a change requires backend/API, contracts, schema, storage/privacy, money, auth, worker, or non-draft apply behavior. |

## Existing Automated Coverage

- `apps/mobile/test/receipt_ocr_capture/receipt_ocr_parser_test.dart`
  - Covers HKD/English/Japanese parsing, labeled totals/charges, item-total review hints, administrative/payment line filtering, uncertain text warnings, unsupported provider fallback, no-image-path ML Kit failure, and fakeable provider preview output.
- `apps/mobile/test/receipt_ocr_review_generated_repository_test.dart`
  - Covers session-required behavior, generated response mapping, personal/group route method selection, apply request mode and expected timestamp, and safe failure mapping.
- `apps/mobile/test/receipt_ocr_review_screen_test.dart`
  - Covers queue loading/empty/error/search/filter/refresh, stale result suppression, typed personal/group routes, safe semantics, detail display, edit/save/delete, invalid edited values, preview/apply controls, confirmation, duplicate busy blocking, return refresh behavior, and sanitized failures.
- `apps/mobile/test/bill_attachment_section_test.dart`
  - Covers attachment metadata, discovery filters, receipt-only OCR review action, absent-repository behavior, personal/group route open, upload success snack action, duplicate/conflicting action blocking, and sanitized upload/download/remove failures.
- `apps/mobile/test/bill_list_screen_test.dart`
  - Covers personal and group receipt scan/create OCR preview, candidate edit/apply/reset, unsupported/failure/manual-entry retry, duplicate warning/confirmation, provisional review save success/failure handoff, saved-review direct discovery, saved-review edit/refresh/remove, apply-preview/apply confirmation, stale/blocked/failure recovery, route-safety labels, duplicate action guards, receipt-only attachment OCR routing, and bounded unsafe-detail display.
- `apps/mobile/test/group_bill_list_screen_test.dart`
  - Covers group bill attachment OCR metadata, receipt-only review actions, upload snack action, and group-route attachment handoff behavior.

No mobile tests were changed by M6-001.

## Uncovered Areas

- Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
- Receipt image normalization policy is not implemented in the mobile intake path beyond `requestFullMetadata: false`, content-type filtering, and existing upload validation.
- Raw source retention, thumbnails, private-vault mobile behavior, secure local receipt cache, and share-sheet/import/replacement parity are not implemented.
- Parser coverage is intentionally heuristic and does not satisfy full Day 1 receipt edge-case requirements for tax categories/rates, tax-included/excluded interpretation, coupon/points/tender/change/void/free/refund/tax-correction classification, receipt-line merge/split lineage, or multi-tax grouped summaries.
- Duplicate receipt handling is UI guidance and test coverage, not authoritative duplicate detection.
- Server OCR worker/runtime, OCR jobs, server result ingestion, generic receipt/OCR APIs, and web/admin OCR review are not implemented.
- Non-draft shared-bill OCR revision apply, automatic OCR finalization, and multi-participant OCR-to-split inference remain out of scope.

## M6-002 Capture/Intake Handoff Focus

M6-002 should stay inside current mobile receipt capture/intake, bill create, bill attachment, app wiring, and focused test seams. It should harden:

- camera/gallery/file receipt intake copy and retry states;
- unsupported provider and extraction failure fallback;
- local OCR preview correction and section-selection behavior;
- capture/import duplicate-warning flow without authoritative duplicate claims;
- receipt attachment upload followed by provisional review save;
- review-save failure handoff and retry from detail;
- personal/group route preservation;
- no automatic existing-bill mutation from OCR preview;
- safe failure copy that avoids raw OCR text, paths, tokens, storage internals, and stack traces.

M6-002 must stop if it needs backend/API behavior, OpenAPI/generated-client changes, auth/session/security changes, schema/migrations, storage/privacy policy changes, OCR engine/native/platform decisions, worker/runtime behavior, automatic apply/finalization, non-draft revision apply, split inference, money authority, Docker/env/deployment/CI, secrets, or unrelated domains.

## M6-003 Saved Review/Apply Handoff Focus

M6-003 should stay inside current mobile saved-review, bill detail, app wiring, and focused test seams. It should harden:

- saved-review edit/save failure recovery and stale local preview clearing;
- refresh after save/apply/remove and unavailable review behavior;
- apply-preview blocked/warning states and manual correction guidance;
- explicit apply confirmation and duplicate mutation prevention;
- stale preview/apply conflict handling through expected review timestamp copy;
- route mismatch/invalid route safety;
- refresh-after-apply behavior without repeating mutation;
- server-authority copy for draft-only apply and no finalization claims.

M6-003 must stop for any expansion beyond existing draft-only API behavior, including non-draft shared-bill revision apply, automatic finalization, server-side policy changes, money/split authority changes, settlement/payment/balance effects, worker/runtime changes, or generated-client/OpenAPI changes.

## Acceptance Targets

- `M6-001`: Completed. Reconciled current receipt OCR capture/review implementation and automated test coverage without runtime changes. Updated this QA map with current-state inventory, covered tests, gaps, and validation expectations.
- `M6-002`: Harden mobile receipt capture/intake and provisional review save handoff using existing seams, with unsupported-provider/manual-entry fallback, safe failure copy, retry preservation, no automatic bill mutation, and bounded tests.
- `M6-003`: Harden saved receipt OCR review edit, refresh, apply-preview, and explicit draft-only apply handoff for stale/blocked state, duplicate mutation prevention, safe retry behavior, and server-authority copy.
- `M6-004`: Finalize M6 QA/control state, record validation, mark UI-test ready for deferred Day 1 acceptance, and explicitly leave manual UI/code review deferred and not passed.

## Non-Goals

- Backend/API behavior.
- OpenAPI contracts or generated clients.
- Database schema or migrations.
- Auth/session/security runtime or configuration.
- Storage/file privacy policy, file authorization policy, generic public file/receipt/OCR APIs, thumbnails, or raw receipt retention policy.
- Settlement/payment/bill calculation authority, OCR apply authority beyond the existing draft-only endpoint, or money authority.
- OCR engine package/native dependency/platform configuration changes unless a later task explicitly scopes and reviews that decision.
- OCR worker/runtime behavior, worker jobs, server OCR processing, or OCR result ingestion.
- Automatic OCR-to-bill finalization.
- Non-draft shared-bill revision apply.
- Multi-participant OCR-to-split inference.
- Broad offline cache/sync, push notification delivery, web/admin runtime UI, reporting/import/export, reconciliation mutation runtime, Docker/deployment/env/CI, or secrets.

## Stop Conditions

Stop and report `BLOCKED` if an M6 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, schema/migrations, storage/file privacy or authorization policy changes, generic receipt/file/OCR APIs, thumbnails, raw receipt retention changes, settlement/payment/bill calculation authority, OCR apply authority expansion, money authority, OCR engine native/platform dependency changes, OCR worker/runtime behavior, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, non-draft shared-bill revision apply, automatic finalization, multi-participant split inference, broad offline cache/sync, notification delivery, web/admin runtime UI, or unrelated major-domain scope.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M6.

## Validation Expectations

M6-001 validation:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

M6 implementation validation should add:

- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`
