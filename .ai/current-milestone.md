# Current Milestone

- ID: `M6`
- Name: `Day 1 Mobile Receipt OCR Capture + Review Handoff Hardening`
- Target branch: `ai/integration`
- Previous milestone ID: `M5`

## Goal

Advance the next Day 1 blocker after the M5 mobile recurring bill lifecycle checkpoint by hardening the existing mobile receipt OCR capture, saved-review, and draft-apply handoff surfaces within already-available bill attachment and receipt OCR review seams. M6 covers current-state reconciliation, capture/intake review handoff, saved OCR review apply handoff, and QA finalization without changing backend authority, OpenAPI contracts, generated clients, schema, auth/session runtime, storage/file privacy policy, bill/settlement/payment calculation authority, OCR worker/runtime, deployment, Docker, CI, or secrets.

Repo-state basis for this milestone:

- `README.md` says the mobile app has a starter receipt OCR review queue/detail/edit foundation, while mobile OCR extraction/capture and automatic OCR-to-bill finalization remain future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires mobile receipt capture/import, on-device OCR as a required mobile capability, OCR review/correction, and provisional server-mode acceptance through API validation.
- `docs/architecture/OCR_ARCHITECTURE.md` says the current API has bill-scoped receipt OCR review intake, read/list, apply-preview, and draft-only apply for existing receipt attachments, while OCR engine/worker behavior and generic receipt/OCR APIs remain non-goals.
- `docs/architecture/RECEIPT_OCR_REVIEW_UX_FLOW.md` records the mobile-first Day 1 flow and states that current mobile has saved review queue/detail/edit foundations but still lacks full capture/upload/OCR extraction UX hardening.
- Current mobile code already has bounded receipt OCR capture/provider/parser seams in `apps/mobile/lib/receipt_ocr_capture/`, saved-review UI/repository seams in `apps/mobile/lib/receipt_ocr_review/`, and bill attachment/OCR handoff seams in `apps/mobile/lib/bills/`, making a mobile-only handoff milestone coherent without requiring API, contract, generated-client, schema, storage policy, auth, money, worker, or deployment changes.

## Allowed Scope For Future M6 Tasks

- Mobile receipt image intake, OCR provider/parser/preview, unsupported-provider, and capture handoff code in `apps/mobile/lib/receipt_ocr_capture/`.
- Mobile saved receipt OCR review queue/detail/edit/apply handoff code in `apps/mobile/lib/receipt_ocr_review/`.
- Existing mobile bill create/detail attachment and receipt OCR handoff surfaces in `apps/mobile/lib/bills/` only when needed to connect current receipt attachment, provisional OCR review save, saved-review open, apply-preview, or draft-only apply UX.
- Existing authenticated shell/bootstrap entry points in `apps/mobile/lib/app/` only when needed to preserve current receipt OCR wiring.
- Focused mobile tests for receipt OCR capture/parser/provider, saved review queue/detail/edit/apply handoff, bill attachment OCR save/open handoff, safe failures, and server-authority copy in `apps/mobile/test/`.
- M6 QA maps and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M6 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security runtime or configuration.
- Database schema/migrations.
- Settlement/payment/bill calculation logic, OCR-to-bill apply authority beyond existing draft-only API behavior, or money authority.
- Storage/file privacy policy, file authorization policy, generic public file APIs, thumbnails, or raw receipt retention policy.
- Docker/deployment/env/CI config.
- Production secrets.
- OCR engine package selection requiring native dependency or platform configuration changes, OCR worker/runtime behavior, worker queues/jobs, server OCR processing, or OCR result ingestion runtime.
- Automatic OCR-to-bill finalization, non-draft shared-bill revision apply, multi-participant OCR-to-split inference, broad offline queue/cache/sync, notification delivery, web/admin runtime UI, reporting/import/export, reconciliation mutation runtime, or unrelated major-domain work.

## Done Criteria

- Current mobile receipt OCR capture, saved-review, and draft-apply handoff behavior is reconciled against Day 1 architecture and captured in a QA map.
- Receipt capture/intake handoff preserves purpose-specific bill attachment authority, provisional OCR review state, unsupported-provider/manual-entry fallback, safe failure copy, and no automatic bill mutation.
- Saved OCR review edit, preview, and draft-only apply handoff surfaces preserve API/domain authority, stale-preview safety, safe retry states, and no duplicate mutation on retry.
- M6 QA records automated validation and keeps deferred manual UI/code review as deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.
- M6 ends in a bounded controller stop state before OCR engine/worker expansion, generic receipt APIs, storage privacy changes, non-draft shared-bill revision apply, multi-participant split inference, API/contracts, schema, auth, money, deployment, or unrelated major-domain work.

## Current Task Pointer

- Current task: `M6-004-RECEIPT-OCR-CAPTURE-REVIEW-QA-FINALIZE-20260615-1950`.
- Last completed task: `M6-003-RECEIPT-OCR-SAVED-REVIEW-APPLY-HANDOFF-20260615-1950`.
- Current state: M6-003 hardened saved mobile receipt OCR review edit, refresh, apply-preview, and explicit draft-only apply handoff inside existing mobile seams. The controller should select M6-004 as the next safe automated QA finalization task.
- Stop sentinel: `STOP-M6-001` for API/contracts/generated-client/auth/schema/storage/privacy/money/deployment, OCR engine/worker/runtime, generic receipt APIs, automatic OCR finalization, non-draft revision apply, multi-participant OCR split inference, broad offline sync/cache, notification delivery, web/admin, or unrelated major-domain scope.

## M5 Carry-Forward Boundary

M5 is finalized as `Day 1 Mobile Recurring Bill Lifecycle UX Hardening` and remains awaiting deferred Day 1 acceptance review. M6 must not expand M5 ad hoc into recurring reminders, background generation, advanced exceptions, offline queueing, API/contracts, schema, money, storage, notification delivery, or unrelated recurring work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
