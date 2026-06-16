# Current Milestone

- ID: `M9`
- Name: `Day 1 Mobile In-App Notification Inbox Hardening`
- Target branch: `ai/integration`
- Previous milestone ID: `M8`

## Goal

Advance the next Day 1 blocker after the M8 mobile settlement workflow checkpoint by hardening the existing mobile in-app notification inbox, summary, read/archive actions, filters, and typed handoff seams. M9 is intentionally mobile and in-app-notification focused: it improves inbox discoverability, safe failure/retry states, read/archive action clarity, linked-resource handoff copy, and QA coverage while preserving API/domain authority for notification visibility, linked bill/settlement/recurring authorization, auth/session state, audit, storage/privacy, money, and status transitions.

Repo-state basis for this milestone:

- `README.md` says the backend has guarded current-user in-app notification list/summary/read/archive endpoints and the mobile app has a starter authenticated in-app notification list/summary/read/archive surface backed by generated-client seams.
- `docs/prd/MVP_DAY1_SCOPE.md` requires basic in-app notifications for Day 1 events including bills, bill approvals/corrections, settlement states, recurring due-soon, sync conflict/failure, security/session events, and OCR completion/failure where server OCR is used.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` says notification visibility is presentation only and linked bill, settlement, or recurring data must be re-fetched through its own server-authorized route before future deep-link behavior.
- `docs/features/expenses-bills/TECHNICAL_SPEC.md` requires bill revision notifications to use stable IDs, template keys, and safe summaries, while excluding receipt/OCR content, private notes, payment details, proof bytes, storage internals, raw request bodies, tokens, unrelated user data, email, push delivery, preferences, and deep-link behavior.
- Current mobile code under `apps/mobile/lib/notifications/` and focused tests under `apps/mobile/test/notification_*` already provide bounded seams for notification summary/list/read/archive, generated-client mapping, filters, visible-row actions, and typed handoffs into existing bill, settlement, recurring, and bill-revision routes.

## Allowed Scope For Future M9 Tasks

- Mobile notification repository and generated-client mapping code in `apps/mobile/lib/notifications/`.
- Existing mobile notification inbox, summary, filter, read/archive, restore-if-present, and typed handoff UI in `apps/mobile/lib/notifications/notification_screen.dart`.
- Existing authenticated app-shell entry points in `apps/mobile/lib/app/` only when needed to preserve notification badge/summary routing or notification-screen repository injection.
- Focused mobile tests for notification list/summary, generated notification repository mapping, safe failure/retry states, read/archive/mark-visible-read actions, filter counts, typed handoff behavior, unsafe text suppression, and server-authority copy in `apps/mobile/test/`.
- M9 QA maps and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M9 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security runtime or configuration.
- Database schema/migrations.
- Storage/file privacy policy, file authorization policy, proof/receipt/QR byte behavior, generic public file APIs, or private-vault behavior.
- Money, bill, settlement, residual, balance, reconciliation, recurring generation, OCR apply, or business status-transition authority.
- Notification delivery providers, push notifications, email notifications, device-token registration, reminder scheduling, background delivery, notification preferences, quiet hours, digest behavior, server-side notification generation policy, or notification queue/worker behavior.
- Linked-resource authorization changes, client-side authorization decisions, or action behavior based only on notification metadata/action URLs.
- Docker/deployment/env/CI config.
- Production secrets.
- Payment provider integrations, direct bank sync, provider webhook behavior, statement import/matching, CSV import/export, backup/restore, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain work.
- Day 1 scope reduction or architecture direction replacement.

## Done Criteria

- Current mobile notification inbox, summary, filter, read/archive, restore-if-present, and handoff implementation is reconciled against Day 1 notification requirements and captured in a QA map.
- Notification list/filter behavior preserves server-returned event, priority, status, subject, safe summary, typed IDs, and created/read/archive timestamps; local filters only hide loaded rows and never decide visibility or linked-resource authorization.
- Read/archive/mark-all/mark-visible actions preserve duplicate-action prevention, safe failure/retry handling, refresh-after-mutation recovery, and server-authority messaging.
- Typed handoffs to bill, bill revision, settlement, and recurring screens re-fetch through existing authorized repositories and do not treat notification metadata, action URLs, IDs, or generated-client availability as permission.
- M9 QA records automated validation and keeps deferred manual UI/code review as deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.
- M9 ends in a bounded controller stop state before backend/API, OpenAPI/contracts, generated clients, schema, auth/session/security, storage/privacy, money/settlement/bill/recurring/OCR authority, notification delivery/preferences/providers, deployment, web/admin, or unrelated major-domain work.

## Current Task Pointer

- Current task: `M9-004-MOBILE-NOTIFICATION-INBOX-QA-FINALIZE-20260616-0055`.
- Last completed task: `M9-003-MOBILE-NOTIFICATION-HANDOFF-AUTHORITY-HARDENING-20260616-0055`.
- Current state: M9-003 hardened mobile notification typed handoff copy, unsupported/missing destination guidance, and notification-origin personal/group bill destination failure suppression while preserving destination repository re-fetch authority. Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
- Recommended next automated task: `M9-004-MOBILE-NOTIFICATION-INBOX-QA-FINALIZE-20260616-0055`.
- Stop sentinel: `STOP-M9-001` stops API/contracts/generated-client/auth/schema/storage/privacy/money/deployment, notification delivery/providers/preferences/queue/worker behavior, linked-resource authorization changes, client-side permission decisions from notification metadata/action URLs, web/admin, broad offline sync/cache, or unrelated major-domain scope.

## M8 Carry-Forward Boundary

M8 is finalized as `Day 1 Mobile Settlement Workflow Hardening` and remains awaiting deferred Day 1 acceptance review. M9 must not expand M8 ad hoc into settlement proof metadata/readout, basket preview/create, pay-all, select-all-visible, basket expansion authority, provider integrations, direct bank sync, statement import/matching, reconciliation mutation, CSV import/export, backup/restore, notification delivery, web/admin runtime, storage/privacy/proof byte policy, money/settlement authority, residual policy, balance projection policy, or generated-client/API changes.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
