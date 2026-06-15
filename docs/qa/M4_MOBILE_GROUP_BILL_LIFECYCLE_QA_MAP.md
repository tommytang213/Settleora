# M4 Mobile Group Bill Lifecycle QA Map

## Purpose

This map defines the QA/control boundary for M4 `Day 1 Mobile Group Bill Lifecycle UX Hardening`. It is a milestone planning artifact for future M4 tasks. The kickoff change does not implement product runtime behavior.

M4 may harden existing mobile group bill lifecycle surfaces that already use current repository/generated-client seams. It does not authorize backend/API behavior, OpenAPI or generated-client edits, auth/session/security changes, schema or migration changes, storage/file privacy policy changes, money/settlement/bill calculation authority changes, Docker/deployment/env/CI changes, secrets, web/admin runtime UI, push notification delivery, recurring bill runtime, reporting/import/export runtime, OCR-worker behavior, persistent offline cache, or broad sync expansion.

## Day 1 Requirement Boundary

Day 1 requires users to create and review shared group bills, understand participant acknowledgement state, attach receipts/supporting files, use correction proposal/revision flows where available, and preserve API/domain authority for authorization, money, bill status, revision review context, storage access, and audit.

Current M4 authority boundaries:

- Mobile may render group bill lifecycle state, perform convenience validation, preserve local form state, retry safe current-contract operations, and show bounded error states.
- API/domain services remain authoritative for group membership, authorization, bill create/submit, participant acceptance/rejection, revision capabilities, financial truth, storage access, audit, and settlement effects.
- Mobile must not infer authorization, affected-user state, payer-confirmation truth, money impact, settlement impact, or storage permissions from route IDs, cached group members, hidden controls, or local calculations.
- Offline queueing for group bill create/edit is not part of M4 unless later explicitly scoped and approved without crossing hard safety gates.

## Current-State Reconciliation Targets

M4-001 should reconcile these existing surfaces before implementation hardening:

- `apps/mobile/lib/bills/bill_repository.dart`
  - Group bill repository model for list, create, submit, get, participant accept, and participant reject.
  - Current group bill create draft shape and supported fields.
- `apps/mobile/lib/bills/generated_bill_repository.dart`
  - Generated-client-backed mapping for current group bill API calls and safe failures.
- `apps/mobile/lib/bills/bill_list_screen.dart`
  - `SettleoraGroupBillListScreen`.
  - `SettleoraGroupBillCreateScreen`.
  - `SettleoraGroupBillDetailScreen`.
  - Group bill attachment section route handling.
  - Saved receipt OCR review discovery/handoff in group context.
  - Revision proposal/review entry points from group bill detail.
- `apps/mobile/lib/groups/group_repository.dart` and `apps/mobile/lib/groups/group_list_screen.dart`
  - Group member loading, member display names, create-group-to-create-bill flow, and group context navigation.
- Focused tests in `apps/mobile/test/group_bill_list_screen_test.dart`, `apps/mobile/test/bill_generated_repository_test.dart`, `apps/mobile/test/group_generated_repository_test.dart`, attachment tests, and revision tests.

## Expected Hardening Themes

### Create And Submit

M4-002 should keep create/submit within current supported contract fields and verify:

- Active member selection and member display fallbacks stay bounded.
- Local split/payer checks are convenience validation only and do not become financial authority.
- Create failure does not upload attachments, submit a bill, or create duplicate mutations.
- Submit failure after create preserves the returned bill and retries submit without creating another bill.
- Submitted-detail refresh failure remains recoverable without losing the created bill.
- Safe errors do not expose raw IDs beyond user-facing context, API paths, storage paths, tokens, generated-client internals, receipt/OCR text, proof bytes, or backend internals.
- Group bill create does not use the personal bill offline archive/restore queue.

### Detail Lifecycle

M4-003 should harden existing detail lifecycle behavior and verify:

- Participant accept/reject actions refresh or preserve detail state safely after success/failure.
- Duplicate taps and conflicting busy states do not create repeated participant actions.
- Rejection requires a bounded reason code and uses safe copy.
- Revision proposal entry refreshes current capability before mutation.
- Existing revision review navigation uses server-returned IDs and viewer actions, not cached authorization assumptions.
- Attachment list/upload/download/remove uses the group bill route context and safe failure states.
- Saved OCR review handoff remains provisional and receipt-scoped.
- Terminal, unavailable, denied, session-expired, and conflict states remain safe and retryable where appropriate.

## Non-Goals

- Editing backend/API behavior.
- Editing OpenAPI contracts or generated clients.
- Adding database schema or migrations.
- Changing auth/session/security runtime or configuration.
- Changing storage/file privacy policy or introducing generic public file APIs.
- Changing settlement, payment, bill calculation, or money authority.
- Adding persistent offline cache, startup/background sync, conflict-resolution UX, backoff/max-attempt policy, or group bill create/edit offline queueing.
- Adding OCR engine/worker behavior, notification delivery, recurring bill runtime, reporting/import/export runtime, web/admin runtime UI, Docker/deployment/env/CI, or secrets.

## Validation Expectations

M4 kickoff validation:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

M4 implementation validation should add:

- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`

## Acceptance Result Target

M4 is complete when the existing mobile group bill lifecycle UX is reconciled, hardened, tested, and finalized as a bounded Day 1 checkpoint while preserving API/domain authority and deferred manual UI/code review status until Day 1 acceptance.
