# M5 Mobile Recurring Bill Lifecycle QA Map

Status: `queued`

## Purpose

M5 hardens the mobile recurring bill lifecycle UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security changes, storage/privacy changes, recurring schedule authority changes, money or settlement calculation changes, reminder delivery, background auto-generation, deployment, Docker, CI, secrets, web/admin runtime UI, OCR-worker runtime, or broad offline cache/sync work.

## Repo-State Basis

- `README.md` records a starter authenticated mobile recurring-bill template/forecast/detail/draft-generation surface and still lists mobile recurring bill creation/editing/full lifecycle/offline queueing/reminders/background generation as future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires basic recurring bill creation, schedules, due-soon visibility, forecasting, and user confirmation for generated recurring bill instances.
- `docs/features/recurring-bills/TECHNICAL_SPEC.md` records backend endpoints for recurring template create/list/get/update/pause/resume/archive, forecast reads, and explicit draft generation, while mobile current state remains read/forecast/detail/draft-generation only.
- `apps/mobile/lib/recurring_bills/` and existing recurring tests provide a bounded mobile seam for follow-up slices.

## Initial Implementation Inventory

- Mobile recurring bill repository seams exist in `apps/mobile/lib/recurring_bills/recurring_bill_repository.dart`.
- Generated-client-backed recurring bill repository behavior exists in `apps/mobile/lib/recurring_bills/generated_recurring_bill_repository.dart`.
- Mobile recurring list/detail/forecast/draft-generation UI exists in `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart`.
- Authenticated server-mode shell entry points can route into the recurring surface through `apps/mobile/lib/app/server_mode_shell.dart`.
- Existing focused tests include `apps/mobile/test/recurring_bill_screen_test.dart` and `apps/mobile/test/recurring_bill_generated_repository_test.dart`.

## M5 Acceptance Targets

- `M5-001` reconciles current recurring lifecycle UI and test coverage without runtime changes.
- `M5-002` hardens mobile recurring template create/edit and pause/resume/archive lifecycle actions using existing generated-client seams, with duplicate-mutation prevention and bounded retry/failure states.
- `M5-003` hardens forecast, detail, and explicit draft-generation handoff behavior for stale state, inactive templates, generated-draft refresh failures, and safe navigation without local recurrence or financial authority.

## Required Validation Shape

- Control/docs slices run docs/scaffold/openapi validation as requested by the kickoff task.
- Runtime mobile slices add `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile` and `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`.
- Scope guard must classify only M5 `.ai`, QA docs, recurring mobile, narrowly required app shell/group display, mobile tests, and scope-guard updates as allowed.

## Deferred Manual Acceptance Gates

Manual UI retest and manual code review remain deferred until Day 1 acceptance. M5 does not mark them passed.

## Stop Conditions

Stop for human approval if recurring work requires backend/API behavior, OpenAPI/generated-client changes, auth/session/security runtime or configuration, database schema/migrations, storage/file privacy policy changes, money/settlement/bill calculation authority changes, recurring schedule authority changes, recurring reminder delivery, background auto-generation, advanced exceptions, broad offline cache/sync, Docker/env/deployment/CI changes, production deploy/public exposure, force/history operations, branch deletion, secrets, reducing Day 1 scope, replacing architecture direction, or expanding across unrelated major domains.
