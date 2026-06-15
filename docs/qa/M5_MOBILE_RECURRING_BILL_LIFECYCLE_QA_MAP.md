# M5 Mobile Recurring Bill Lifecycle QA Map

Status: `M5-001 reconciled; M5-002 and M5-003 queued`

## Purpose

M5 hardens the mobile recurring bill lifecycle UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security changes, storage/privacy changes, recurring schedule authority changes, money or settlement calculation changes, reminder delivery, background auto-generation, deployment, Docker, CI, secrets, web/admin runtime UI, OCR-worker runtime, or broad offline cache/sync work.

## Repo-State Basis

- `README.md` records a starter authenticated mobile recurring-bill template/forecast/detail/draft-generation surface and still lists mobile recurring bill creation/editing/full lifecycle/offline queueing/reminders/background generation as future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires basic recurring bill creation, schedules, due-soon visibility, forecasting, and user confirmation for generated recurring bill instances.
- `docs/features/recurring-bills/TECHNICAL_SPEC.md` records backend endpoints for recurring template create/list/get/update/pause/resume/archive, forecast reads, and explicit draft generation, while mobile current state remains read/forecast/detail/draft-generation only.
- `packages/contracts/openapi/settleora.v1.yaml` exposes recurring template create/list/get/update/pause/resume/archive, forecast, and explicit generate-draft operations. The contract remains read-only context for M5-001.
- `apps/mobile/lib/recurring_bills/` and existing recurring tests provide a bounded mobile seam for follow-up slices.

## Current Implementation Inventory

- Repository interface: `apps/mobile/lib/recurring_bills/recurring_bill_repository.dart` defines mobile models for template summaries/details, schedules, forecast occurrences, draft generation results, status labels, schedule labels, and bounded recurring failure kinds. The interface currently supports `listTemplates`, `listForecast`, `getTemplate`, and `generateDraft` only.
- Generated-client seam: `apps/mobile/lib/recurring_bills/generated_recurring_bill_repository.dart` wraps the generated Dart client for template list, forecast list, template detail, and generate-draft calls. Each operation reads an access token, trims and validates IDs/dates/status/limits, maps generated responses into safe mobile models, and maps 400/401/403/404/409/5xx/network failures into bounded UI messages.
- Template list: `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart` loads up to 100 visible templates, displays merchant fallback names, forecast amount/currency, next-occurrence or inactive-state copy, status/schedule/scope chips, local search, and template filters for all/active/inactive/personal/group.
- Template detail: tapping a template opens a read-only detail screen that refreshes one template, shows status, estimate, description, frequency, start/end/due offset, next occurrence, updated/archive timestamps, scope, payload version, and guidance for active/paused/archived/server-unknown states.
- Forecast list: the same screen loads up to 30 forecast rows, displays occurrence date, due date, forecast amount/currency, occurrence status, generated-draft state, personal/group scope, local search, and forecast filters for all/needs draft/draft generated/closed/personal/group.
- Explicit draft generation: forecast rows with `status == forecasted` and `draftGenerated == false` enable a `Generate Draft` action. The UI shows a confirmation dialog, calls `generateDraft(templateId, occurrenceDate)` only after confirmation, blocks duplicate generation while the operation is in progress, shows a success snackbar, and reloads server state after success.
- Loading/empty/retry/error states: the list and detail screens show loading panels, true-empty states, filtered-empty states, pull-to-refresh/refresh buttons, retry panels for load failures, and inline action failures for draft generation. Failure copy comes from bounded repository failures rather than raw generated-client bodies.
- Server-mode/session-gated behavior: `apps/mobile/lib/app/app_bootstrap.dart` builds the recurring repository from server configuration and the secure access-token provider. `apps/mobile/lib/app/server_mode_shell.dart` includes recurring data in the authenticated dashboard overview, opens the recurring screen from the Recurring tile, and can open the screen prefiltered to forecast rows needing drafts. Missing access tokens are mapped to sign-in-required failures before generated-client calls.
- Group/context display: current recurring models only expose `isGroupScoped`; mobile displays personal/group scope labels but does not load group names or modify group runtime behavior.
- Not implemented in mobile yet: template creation, template editing, pause/resume/archive actions, create/edit/lifecycle retry states, offline queueing, reminder scheduling, notification delivery, background auto-generation, advanced exception handling, generated-draft navigation to bill detail, and broad stale-forecast handoff recovery.

## Day 1 Requirement Map

- Basic recurring bill creation: backend/generated-client seams exist, but current mobile has no create form or create repository method. This is the primary `M5-002` gap.
- Basic recurring bill schedule: current mobile renders server-provided schedule type, interval, start/end, due offset, and next occurrence. It does not calculate recurrence locally, which preserves server authority.
- Due-soon visibility: current authenticated shell can surface forecast rows and opens a needs-draft filtered view; current recurring screen also filters forecast rows needing drafts. It does not implement reminders, notifications, push, or background checks.
- Basic forecast from recurring bills: current mobile calls the server forecast endpoint, renders bounded forecast rows, and treats them as estimates/read-only until explicit draft generation.
- User confirmation path for generated recurring bill instances: current mobile requires a confirmation dialog before `generateDraft` and blocks duplicate in-flight taps. It does not yet navigate to, refresh, or reconcile generated bill context beyond showing success and reloading recurring state.
- Server-authoritative recurrence, authorization, money, and generated-draft behavior: current mobile renders server response data and passes template/occurrence identifiers for explicit draft generation. It does not compute recurrence, authorization, final money, occurrence state, or generated draft authority locally.

## Covered Automated Tests

- `apps/mobile/test/recurring_bill_screen_test.dart` covers loading, loaded content, empty state, local search, template and forecast filters/counts, clear-discovery behavior, needs-draft startup filter, filtered-empty states, search controller disposal, retry after load failure, read-only detail opening, explicit draft-generation confirmation/success/reload, bounded draft-generation failure, duplicate-tap blocking while confirming, inactive read-only guidance, and authenticated server-shell navigation into recurring bills.
- `apps/mobile/test/recurring_bill_generated_repository_test.dart` covers session-required behavior before generated-client calls, template list mapping and safe fallback names, forecast mapping and `canGenerateDraft`, detail/draft response mapping, access-token trimming, parameter normalization, 401 session-expired mapping, validation for required IDs/limits/statuses/ISO dates, and bounded network/server failure messages.

## Uncovered Areas

- No mobile tests cover create/edit forms or request mapping because the repository interface and UI do not expose those actions yet.
- No mobile tests cover pause/resume/archive actions, duplicate mutation prevention for lifecycle actions, or post-lifecycle stale-detail refresh because those actions do not exist yet.
- No mobile tests cover generated-draft bill navigation, stale generated-draft refresh failure, or inactive-template forecast handoff beyond read-only copy.
- No mobile tests cover manual UI review on narrow/wide devices; this remains explicitly deferred until Day 1 acceptance and is not passed.
- No tests in this slice exercise backend/API/OpenAPI/generated-client generation, schema, money, auth/session runtime, storage, notification delivery, reminders, background generation, or offline queueing because those are outside M5-001 scope.

## M5 Acceptance Targets

- `M5-001` reconciles current recurring lifecycle UI and test coverage without runtime changes. Status: complete.
- `M5-002` hardens mobile recurring template create/edit and pause/resume/archive lifecycle actions using existing generated-client seams, with duplicate-mutation prevention, bounded validation, server-authority copy, and safe retry/failure states.
- `M5-003` hardens forecast, detail, and explicit draft-generation handoff behavior for stale state, inactive templates, generated-draft refresh failures, and safe navigation without local recurrence or financial authority.

## M5-002 Gap Focus

- Add generated-client-backed create/edit repository methods and mobile form state only inside recurring mobile seams.
- Render server-authority copy for recurrence, authorization, money, generated drafts, and audit behavior.
- Add pause/resume/archive lifecycle actions with explicit in-flight state, no duplicate mutation on repeated taps, safe conflict/session/denied/unavailable handling, and refresh-after-mutation behavior.
- Preserve no local recurrence or money authority; mobile may validate form shape for ergonomics but must rely on API/domain services for schedule validity, membership, participants, payer policy, forecast amount, and audit.
- Stop if create/edit/lifecycle work requires OpenAPI/generated-client changes, backend/API changes, schema/migration work, recurring offline queueing, reminder delivery, background generation, notification delivery, or money/schedule authority changes.

## M5-003 Gap Focus

- Harden forecast and detail behavior when an occurrence becomes stale, generated, skipped, cancelled, paused, archived, or otherwise unavailable between list load and action.
- Improve explicit draft-generation handoff states after success, idempotent existing-draft responses, refresh failures, and navigation or deep link to generated bill context within existing mobile routes.
- Keep forecast rows read-only estimates and keep generated draft state server-authoritative.
- Stop if forecast/draft handoff requires backend/API changes, OpenAPI/generated-client changes, settlement/payment/bill calculation changes, background generation, reminders, notification delivery, advanced exceptions, or recurring schedule/money authority changes.

## Required Validation Shape

- M5-001 runs docs/scaffold/openapi validation, mobile doctor, controller dry-run, scope guard, and git diff checks as requested by the task prompt.
- Runtime mobile slices add `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` and focused Flutter tests for recurring bill screens/repositories.
- Scope guard must classify only M5 `.ai`, QA docs, recurring mobile, narrowly required app shell/group display, mobile tests, and scope-guard updates as allowed.

## Deferred Manual Acceptance Gates

Manual UI retest and manual code review remain deferred until Day 1 acceptance. M5-001 does not mark them passed.

## Stop Conditions

Stop for human approval if recurring work requires backend/API behavior, OpenAPI/generated-client changes, auth/session/security runtime or configuration, database schema/migrations, storage/file privacy policy changes, money/settlement/bill calculation authority changes, recurring schedule authority changes, recurring reminder delivery, background auto-generation, advanced exceptions, broad offline cache/sync, Docker/env/deployment/CI changes, production deploy/public exposure, force/history operations, branch deletion, secrets, reducing Day 1 scope, replacing architecture direction, or expanding across unrelated major domains.
