# M6 Mobile Receipt OCR Capture + Review Handoff QA Map

Status: `M6 queued; first task pending; manual UI/code review deferred until Day 1 acceptance`

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

## Current Implementation Inventory To Reconcile In M6-001

M6-001 must inspect and update this section with current repo details before runtime hardening:

- `apps/mobile/lib/receipt_ocr_capture/`
  - Receipt image intake interface and current capture/import adapters.
  - OCR provider interface, unsupported provider fallback, ML Kit provider boundary where present, parser behavior, and preview models.
  - Current tests under `apps/mobile/test/receipt_ocr_capture/`.
- `apps/mobile/lib/receipt_ocr_review/`
  - Generated-client receipt OCR review repository and safe failure mapping.
  - Queue/detail/edit content, accessibility helpers, preview/apply controls, remove behavior, and saved-review state transitions.
  - Current tests in `apps/mobile/test/receipt_ocr_review_screen_test.dart` and `apps/mobile/test/receipt_ocr_review_generated_repository_test.dart`.
- `apps/mobile/lib/bills/`
  - Bill create/detail attachment upload and saved OCR review handoff.
  - Receipt-only saved-review discovery/open behavior.
  - Personal/group route handling for bill attachment OCR review APIs.
  - Existing attachment and bill screen tests that cover receipt OCR handoff.
- `apps/mobile/lib/app/`
  - App bootstrap and server-mode shell wiring for receipt image intake and OCR provider dependencies.

## Day 1 Requirement Map

- Capture/import receipt: current M6 must stay within existing mobile intake and bill attachment seams. It must not introduce generic receipt APIs, new storage policy, or unreviewed native platform dependency changes.
- On-device OCR: mobile OCR output remains provisional. If the active provider is unsupported or extraction fails, manual entry and existing attachment/bill editing remain available.
- Review/correction: mobile must expose editable merchant/date/currency/header totals/line candidates where supported and must distinguish local preview data, saved provisional review data, and applied draft bill items.
- Server-mode provisional state: saved OCR review data is not authoritative until the API validates it. Mobile must not infer authorization, bill mutation eligibility, money truth, storage access, or split policy from cached route data or hidden controls.
- Apply-preview before mutation: preview is read-only validation context and must not be represented as a bill mutation.
- Explicit draft-only apply: apply must remain user-confirmed, duplicate-mutation guarded, refreshable, and limited to the existing API's draft-only behavior.
- Manual fallback: every unsupported, failed, blocked, stale, denied, unavailable, or no-review state must preserve a path back to manual bill/attachment editing.

## Acceptance Targets

- `M6-001`: Reconcile current receipt OCR capture/review implementation and automated test coverage without runtime changes. Update this QA map with exact current-state inventory, covered tests, gaps, and validation expectations.
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

M6 kickoff validation:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

M6 implementation validation should add:

- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`
