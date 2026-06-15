# M4 Mobile Group Bill Lifecycle QA Map

## Purpose

This map defines the QA/control boundary for M4 `Day 1 Mobile Group Bill Lifecycle UX Hardening`. M4-001 reconciles the current mobile implementation and test state only. It does not implement product runtime behavior.

M4 may harden existing mobile group bill lifecycle surfaces that already use current repository/generated-client seams. It does not authorize backend/API behavior, OpenAPI or generated-client edits, auth/session/security changes, schema or migration changes, storage/file privacy policy changes, money/settlement/bill calculation authority changes, Docker/deployment/env/CI changes, secrets, web/admin runtime UI, push notification delivery, recurring bill runtime, reporting/import/export runtime, OCR-worker behavior, persistent offline cache, group bill offline queueing, or broad sync expansion.

M4-002 update: the mobile group bill create/submit flow now renders explicit bounded local status labels for ready to submit, creating draft, draft created, attaching, submitting, submitted-detail refresh, retry upload, retry submit, and retry detail refresh. These labels reflect only local in-flight or continuation state plus existing generated-client responses; API/domain services remain authoritative for bill lifecycle, validation, authorization, money, attachment acceptance, and submit state.

M4-003 update: the mobile group bill detail acknowledgement card now distinguishes accept and reject in-flight state, blocks duplicate/conflicting participant actions while either mutation is active, shows bounded failure title/message copy, and offers `Refresh bill state` to reload server state after a failed acknowledgement without automatically retrying the mutation. The detail screen continues to use existing generated-client accept/reject, revision, attachment, and receipt OCR-review seams; API/domain services remain authoritative for authorization, bill status, participant acknowledgement, revision capability, financial truth, and storage access.

## Day 1 Requirement Boundary

Day 1 requires users to create and review shared group bills, understand participant acknowledgement state, attach receipts/supporting files, use correction proposal/revision flows where available, and preserve API/domain authority for authorization, money, bill status, revision review context, storage access, and audit.

Current M4 authority boundaries:

- Mobile may render group bill lifecycle state, perform convenience validation, preserve local form state, retry safe current-contract operations, and show bounded error states.
- API/domain services remain authoritative for group membership, authorization, bill create/submit, participant acceptance/rejection, revision capabilities, financial truth, storage access, audit, and settlement effects.
- Mobile must not infer authorization, affected-user state, payer-confirmation truth, money impact, settlement impact, or storage permissions from route IDs, cached group members, hidden controls, or local calculations.
- Offline queueing for group bill create/edit is not part of M4 unless later explicitly scoped and approved without crossing hard safety gates.

## Current-State Reconciliation Targets

M4-001 inspected these current surfaces before implementation hardening:

- `apps/mobile/lib/bills/bill_repository.dart`
  - Defines group bill summaries/details, participant status and rejection reason models, create draft rows, payer rows, and `revisionCreationActions.canCreateRevision`.
  - Exposes repository seams for group bill list, create, submit, get, participant accept, and participant reject.
- `apps/mobile/lib/bills/generated_bill_repository.dart`
  - Maps current generated-client calls for `listGroupBills`, `createGroupBill`, `submitGroupBill`, `getGroupBill`, `acceptGroupBillParticipant`, and `rejectGroupBillParticipant`.
  - Performs bounded ID/text validation before session lookup where applicable and maps API/network failures to safe mobile failure kinds/messages.
- `apps/mobile/lib/bills/bill_list_screen.dart`
  - `SettleoraGroupBillListScreen` loads group bills, loads group members for display names, supports search/filter chips, opens create/detail flows, and refreshes after returning from detail.
  - `SettleoraGroupBillCreateScreen` loads active group members, supports manual and receipt-assisted entry, item split assignment, payer rows, duplicate receipt warning, draft attachments, create/attachment/submit/detail-load continuation state, and group-context OCR review handoff.
  - `SettleoraGroupBillDetailScreen` loads group bill detail, displays participant status/share/next-step state, supports current participant accept/reject, loads pending revision state, refreshes revision capability before create, renders attachment section with group routes, and exposes saved OCR review discovery/handoff.
- `apps/mobile/lib/bills/bill_attachment_repository.dart` and `generated_bill_attachment_repository.dart`
  - Support personal and group bill attachment routes, receipt/supporting attachment purpose, list/upload/download/remove, session-required behavior, safe failure mapping, and group route validation.
- `apps/mobile/lib/bills/bill_revision_repository.dart`, `generated_bill_revision_repository.dart`, `bill_revision_proposal_editor_screen.dart`, and `bill_revision_review_screen.dart`
  - Support proposal create/revise, review context rendering, viewer action capability checks, approval/payer confirmation basis, lifecycle actions, terminal revision states, and safe failure mapping.
- `apps/mobile/lib/groups/group_repository.dart`, `generated_group_repository.dart`, and `group_list_screen.dart`
  - Support group list/detail/member management, active/removed member status, safe display name fallback, and group-to-group-bills navigation.

## Current Implementation Inventory

### Group Bill List And Read Surfaces

- Group bill list reads active and archived group bills through the generated repository and current group ID.
- The list renders group context, loaded participant summaries, current-user action state, search, and filters for all bills, needs response, accepted by current user, rejected by current user, and any rejection.
- Member display names are loaded from the group repository; failures preserve prior/fallback participant labels instead of blocking bill list rendering.
- Opening a bill navigates to group detail and reloads the list after returning.

### Group Bill Create And Submit Flow

- Create is server-mode only through `createGroupBill`, followed by optional draft attachment uploads, `submitGroupBill`, and a submitted-detail `getGroupBill` refresh.
- The create screen keeps `_createdBillAwaitingCompletion` and `_createdBillSubmittedAwaitingDetail` state so retry after attachment, submit, or submitted-detail failure resumes the correct step without issuing another create call.
- Draft attachment upload happens only after create succeeds; successful upload rows are removed from the retry set, and remaining upload rows can be retried.
- Split and payer checks are local convenience validation only. API/domain services remain authoritative for membership, authorization, split calculation, totals, status transition, and financial truth.
- The group create flow does not use the personal bill archive/restore sync queue.

### Participant Accept/Reject Actions

- Detail shows accept/reject only when the current user has a pending participant row on a `pending_confirmation` bill.
- Accept/reject use current group ID, bill ID, current user profile ID, and bounded rejection reason codes.
- A shared acknowledgement busy flag blocks duplicate accept/reject taps while a mutation is in flight.
- Success reloads detail; failures remain on the detail screen with safe failure text.

### Attachments And OCR Review Handoff

- Group detail passes `SettleoraBillAttachmentRoute.group(groupId, billId)` to `BillAttachmentSection`.
- Attachment metadata uses safe labels and stable file IDs; download/remove/upload actions are covered by group-route tests.
- Draft receipt attachment upload can save a provisional OCR review after the receipt file exists. A failed OCR review save does not roll back the created bill or attachment and can be retried from detail.
- Saved OCR review discovery is receipt-only, validates safe route UUIDs, and opens review/apply-preview/apply flows through the receipt OCR review repository. OCR data remains provisional until API validation.

### Correction And Revision Entry

- Detail loads the pending submitted revision, shows an unavailable banner on revision load failure, and opens review with server-returned bill/revision IDs.
- Create-revision entry is rendered only when a revision repository exists and `bill.revisionCreationActions.canCreateRevision` is true.
- Create-revision mutation refreshes the group bill and rechecks server capability before opening the proposal editor and before creating the proposal.
- Revision review actions render and execute from server-provided viewer action flags and approval/payer-confirmation basis.

### Group Member Display And Fallbacks

- Active group members are used in the create form member menus.
- Detail/list participant labels prefer loaded member display names and fall back to bounded `Participant N` labels, with `(you)` appended for the current actor where known.
- Removed members are excluded from create member menus but existing participant rows remain displayable through safe fallback labels.

### Terminal, Unavailable, Stale, And Session-Required States

- Bill, group, attachment, revision, receipt OCR review, and notification repositories use bounded failure kinds for session required/expired, denied, unavailable, conflict, validation, network, and server states.
- Detail refresh handles unavailable bill state and retry.
- Revision review models terminal states and hides/blocks actions according to server viewer capabilities.
- Attachment and OCR review sections block conflicting busy actions, expose retryable safe copy, and clear unavailable saved reviews without deleting the parent bill/attachment.

## Covered Automated Tests

- `apps/mobile/test/group_bill_list_screen_test.dart`
  - Covers group bill list loading/empty/error/refresh, group member display fallback, search/filter counts, selected filtered detail, participant status summaries, accept/reject with reason code, duplicate participant action blocking, group attachment route/list/upload/download/remove/failure behavior, receipt-only OCR review entry, revision create/review entry, create validation, active-member menus, split assignment controls, payer defaults, create draft mapping, happy path create-submit-detail, submit retry without duplicate create, detail-load retry without duplicate submit, draft attachment upload retry without duplicate create, and bounded create failures.
- `apps/mobile/test/bill_generated_repository_test.dart`
  - Covers generated group bill list/get/create/submit/accept/reject mapping, pre-session validation, bounded generated/API/network failure mapping, and rejection reason validation.
- `apps/mobile/test/bill_attachment_section_test.dart` and `apps/mobile/test/bill_attachment_generated_repository_test.dart`
  - Cover group attachment metadata labels, group route actions, receipt OCR entry only for receipt metadata, duplicate/conflicting action blocking, upload/remove confirmation, and safe failures.
- `apps/mobile/test/bill_revision_proposal_editor_screen_test.dart`, `apps/mobile/test/bill_revision_review_screen_test.dart`, and `apps/mobile/test/generated_bill_revision_repository_test.dart`
  - Cover server capability refresh before proposal mutation, review context modes, viewer action rendering, approve/payer-confirmation basis, lifecycle action refresh, terminal/denied action behavior, and safe generated failures.
- `apps/mobile/test/group_generated_repository_test.dart` and `apps/mobile/test/group_list_screen_test.dart`
  - Cover session-required group repository behavior, member mapping/fallbacks, group detail navigation, member management, and bounded group failures.

No M4-001 mobile test files were changed.

## Expected Hardening Themes

### Create And Submit

M4-002 completed create/submit hardening within current supported contract fields and hardens or preserves:

- Active member selection and member display fallbacks stay bounded.
- Local split/payer checks are convenience validation only and do not become financial authority.
- Create failure does not upload attachments, submit a bill, or create duplicate mutations.
- Submit failure after create preserves the returned bill and retries submit without creating another bill.
- Submitted-detail refresh failure remains recoverable without losing the created bill.
- Attachment upload failure after create preserves only remaining failed/unuploaded attachment rows and does not recreate the bill.
- Duplicate save taps and step changes stay blocked while create, upload, submit, or detail refresh is in flight.
- Explicit local status labels distinguish ready to submit, creating draft, draft created, attaching, submitting, submitted, retry upload, retry submit, and retry detail refresh.
- Create failure display has a last-mile guard against obvious raw API paths, tokens/secrets, stack traces, and local/storage paths while preserving bounded repository messages.
- Receipt OCR apply-to-draft remains local/provisional and does not apply OCR to server truth without the current OCR review API path.
- Safe errors do not expose raw IDs beyond user-facing context, API paths, storage paths, tokens, generated-client internals, receipt/OCR text, proof bytes, or backend internals.
- Group bill create does not use the personal bill offline archive/restore queue.

### Detail Lifecycle

M4-003 should harden or preserve:

- Participant accept/reject actions refresh or preserve detail state safely after success/failure.
- Duplicate taps and conflicting busy states do not create repeated participant actions.
- Rejection requires a bounded reason code and uses safe copy.
- Revision proposal entry refreshes current capability before mutation.
- Existing revision review navigation uses server-returned IDs and viewer actions, not cached authorization assumptions.
- Attachment list/upload/download/remove uses the group bill route context and safe failure states.
- Saved OCR review handoff remains provisional and receipt-scoped.
- Terminal, unavailable, denied, session-expired, and conflict states remain safe and retryable where appropriate.
- Detail-level tests should continue proving that mobile displays server-provided status/revision/participant state and does not infer authorization or financial truth from hidden controls or cached data.

## M4 Acceptance Targets

- M4-002: group bill create/submit can be exercised through current mobile UI with safe local validation, no duplicate create on retry, no duplicate submit on submitted-detail retry, safe draft attachment retry, bounded OCR review handoff, and current generated-client seams only.
- M4-003: group bill detail lifecycle can be exercised through current mobile UI with safe participant actions, retryable server-state refresh after acknowledgement failures, revision entry/review navigation, group attachment/OCR review routes, stale capability refresh, member fallback labels, terminal/unavailable states, and current generated-client seams only.
- M4-004: M4 QA/control state records automated validation and explicitly leaves manual UI/code review deferred until Day 1 acceptance, not passed.

## Gaps For Next Tasks

- M4-002 completed the create/submit continuation-copy hardening and strengthened focused assertions for retry/no-duplicate-create/no-duplicate-submit/safe-error behavior.
- M4-003 completed focused detail lifecycle hardening for acknowledgement failure copy, retryable server-state refresh, action-specific duplicate blocking, and server-authority guidance while preserving current revision capability refresh, group attachment/OCR-review routes, member fallback labels, and terminal/unavailable states.
- M4-004 should finalize the M4 QA/control state, record validation coverage, and leave manual UI/code review deferred until Day 1 acceptance.
- Manual UI/code review remains deferred by owner decision until Day 1 acceptance and is not passed by this map.

## Non-Goals

- Editing backend/API behavior.
- Editing OpenAPI contracts or generated clients.
- Adding database schema or migrations.
- Changing auth/session/security runtime or configuration.
- Changing storage/file privacy policy or introducing generic public file APIs.
- Changing settlement, payment, bill calculation, or money authority.
- Adding persistent offline cache, startup/background sync, conflict-resolution UX, backoff/max-attempt policy, or group bill create/edit offline queueing.
- Adding OCR engine/worker behavior, notification delivery, recurring bill runtime, reporting/import/export runtime, web/admin runtime UI, Docker/deployment/env/CI, or secrets.

## Stop Conditions

Stop and report `BLOCKED` if an M4 task requires:

- Backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, schema/migrations, storage/file privacy policy, settlement/payment/bill calculation authority, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, or architecture replacement.
- Persistent offline cache, background sync, conflict-resolution UX, backoff/max-attempt policy, group bill create/edit offline queueing, OCR-worker/runtime expansion, recurring bill runtime, settlement runtime, reporting/import/export runtime, notification delivery, web/admin runtime UI, or unrelated major-domain scope.
- Manual UI/code review being marked passed before the owner-approved Day 1 acceptance review.

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

## M4-001 Reconciliation Result

M4-001 reconciliation is complete as a documentation/control-state update. Current evidence supports proceeding to `M4-002-GROUP-BILL-CREATE-SUBMIT-HARDENING-20260615-1659`.

Manual UI/code review remains deferred until Day 1 acceptance and is explicitly not passed.

## M4-002 Create/Submit Hardening Result

M4-002 implementation is complete as a mobile-only create/submit hardening slice. It changed only `apps/mobile/lib/bills/bill_list_screen.dart`, `apps/mobile/test/group_bill_list_screen_test.dart`, this QA map, and `.ai` control files.

Automated evidence:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/group_bill_list_screen_test.dart` passed with 74 tests.
- Focused tests cover submit failure retry without duplicate create, submitted-detail refresh retry without duplicate submit, attachment upload retry without duplicate create, in-flight submit guard, in-flight attachment control disabling, member/payer/split validation blocking before create/upload, visible safe retry labels, and bounded unsafe create error text.

Remaining M4 work:

- `M4-003-GROUP-BILL-DETAIL-LIFECYCLE-HARDENING-20260615-1659` remains queued for detail lifecycle, participant action, revision entry, attachment/OCR-review handoff, stale capability refresh, terminal/unavailable state, and member fallback hardening.
- `M4-004-GROUP-BILL-LIFECYCLE-QA-FINALIZE-20260615-1659` remains queued for final M4 QA/control closure.
- `STOP-M4-001` remains the hard stop sentinel for forbidden API/contracts/generated-client/auth/schema/storage/money/deployment, broader offline/sync, OCR-worker/runtime, recurring, settlement, reporting, notification, web/admin, secrets, or unrelated major-domain scope.

Manual UI/code review remains deferred until Day 1 acceptance and is explicitly not passed.

## M4-003 Detail Lifecycle Hardening Result

M4-003 implementation is complete as a mobile-only detail lifecycle hardening slice. It changed only `apps/mobile/lib/bills/bill_list_screen.dart`, `apps/mobile/test/group_bill_list_screen_test.dart`, this QA map, and `.ai` control files.

Runtime evidence:

- Group bill detail acknowledgement state now tracks whether accept or reject is in flight and shows the matching progress affordance.
- Accept/reject actions remain blocked during any acknowledgement mutation, preserving existing generated-client seams and avoiding duplicate/conflicting mutations.
- A failed acknowledgement now renders bounded failure title/message copy plus `Refresh bill state`, which reloads the server-authoritative bill state instead of automatically retrying the mutation.
- Detail lifecycle still preserves group-scoped attachment routes, receipt-only OCR review handoff, revision capability refresh before proposal creation, server-returned revision IDs/actions, participant display fallbacks, and safe terminal/unavailable copy.

Automated evidence:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/group_bill_list_screen_test.dart` passed with 76 tests.
- New focused tests cover participant-action failure copy and refresh, no duplicate mutation retry, reject in-flight duplicate/conflicting action blocking, and reject-specific busy state.

Remaining M4 work:

- `M4-004-GROUP-BILL-LIFECYCLE-QA-FINALIZE-20260615-1659` remains queued for final M4 QA/control closure.
- `STOP-M4-001` remains the hard stop sentinel for forbidden API/contracts/generated-client/auth/schema/storage/money/deployment, broader offline/sync, OCR-worker/runtime, recurring, settlement, reporting, notification, web/admin, secrets, or unrelated major-domain scope.

Manual UI/code review remains deferred until Day 1 acceptance and is explicitly not passed.
