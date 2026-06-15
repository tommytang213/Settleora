# Current Milestone

- ID: `M5`
- Name: `Day 1 Mobile Recurring Bill Lifecycle UX Hardening`
- Target branch: `ai/integration`
- Previous milestone ID: `M4`

## Goal

Advance the next Day 1 blocker after the M4 mobile group bill lifecycle checkpoint by hardening the existing mobile recurring bill surface within already-available API and generated-client seams. M5 covers current-state reconciliation, recurring template create/edit/lifecycle UX, and forecast/draft-generation resilience without changing backend authority, OpenAPI contracts, generated clients, schema, auth/session runtime, storage policy, settlement, bill or recurring calculation authority, deployment, Docker, CI, or secrets.

Repo-state basis for this milestone:

- `README.md` says the mobile app has a starter recurring-bill template/forecast/detail/draft-generation surface, while mobile recurring bill creation/editing/full lifecycle/offline queueing/reminders/background generation remain future Day 1 work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires basic recurring bill creation, schedule, due-soon visibility, forecast from recurring bills, and user confirmation for generated recurring bill instances.
- `docs/features/recurring-bills/TECHNICAL_SPEC.md` says backend endpoints and generated clients already support recurring template create/list/get/update/pause/resume/archive, forecast reads, and explicit draft generation, while mobile currently exposes read/forecast/detail/draft-generation only.
- Current mobile code already has bounded recurring bill seams in `apps/mobile/lib/recurring_bills/` and focused tests in `apps/mobile/test/recurring_bill_screen_test.dart` and `apps/mobile/test/recurring_bill_generated_repository_test.dart`, making a mobile-only lifecycle hardening bundle coherent without requiring API, contract, generated-client, schema, money, storage, auth, worker, notification, or deployment changes.

## Allowed Scope For Future M5 Tasks

- Mobile recurring bill list/detail/create/edit/pause/resume/archive and forecast/draft-generation UX code in `apps/mobile/lib/recurring_bills/`.
- Existing authenticated shell entry points only when needed to route into the current recurring bill surface in `apps/mobile/lib/app/`.
- Existing mobile group/member context only when needed for current generated-client recurring template fields and display, without changing group runtime behavior.
- Focused mobile tests for recurring bill list/detail/create/edit, pause/resume/archive, forecast filters, explicit draft generation, safe failures, and server-authority copy in `apps/mobile/test/`.
- M5 QA maps and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M5 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security runtime or configuration.
- Database schema/migrations.
- Settlement/payment/bill calculation logic, recurring schedule/calculation authority, or money authority.
- Storage/file privacy policy.
- Docker/deployment/env/CI config.
- Production secrets.
- Web/admin runtime UI.
- Push notification provider, notification delivery, notification preferences, reminder scheduling, recurring background auto-generation, advanced recurring exceptions, settlement runtime, broad reporting/import/export, local backup/restore, persistent offline cache, background sync, OCR engine/worker, or unrelated major-domain work.
- New offline queue operations for recurring bill create/edit/lifecycle unless a later task explicitly scopes them with no API/auth/schema/storage/money/deployment changes and passes manual safety review if required.

## Done Criteria

- Current mobile recurring bill lifecycle behavior is reconciled against Day 1 architecture and captured in a QA map.
- Recurring template create/edit and lifecycle actions preserve server authority, safe failure handling, and no duplicate mutation on retry.
- Recurring detail/forecast/draft-generation surfaces expose server-provided status, occurrence state, and generated-draft state without calculating recurrence, money, or authorization locally.
- M5 QA records automated validation and keeps deferred manual UI/code review as deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.
- M5 ends in a bounded controller stop state before recurring reminders, background generation, offline queue expansion, API/contracts, schema, auth, storage, money, deployment, or unrelated major-domain work.

## Current Task Pointer

- Completed task: `M5-001-RECURRING-BILL-LIFECYCLE-STATE-RECONCILE-20260615-1825`.
- Completed task: `M5-002-RECURRING-BILL-CREATE-EDIT-LIFECYCLE-20260615-1825`.
- Completed task: `M5-003-RECURRING-BILL-FORECAST-DRAFT-HANDOFF-20260615-1825`.
- Current state: M5 is UI-test ready with no remaining queued M5 implementation task. The controller should stop cleanly before recurring reminders, background generation, offline queue expansion, API/contracts, schema, auth, storage, money, deployment, or unrelated major-domain work unless a separate controller-approved Day 1 milestone is already queued.
- Stop sentinel: `STOP-M5-001` for API/contracts/generated-client/auth/schema/storage/money/deployment, recurring background generation/reminders/advanced exceptions, broad offline queue/cache/sync, OCR-worker, settlement/reporting/notification delivery, or unrelated major-domain scope.

## M4 Carry-Forward Boundary

M4 is finalized as `Day 1 Mobile Group Bill Lifecycle UX Hardening` and remains awaiting deferred Day 1 acceptance review. M5 must not expand M4 ad hoc into group bill create/edit/offline work beyond the completed M4 boundary.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
