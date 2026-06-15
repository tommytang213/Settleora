# M5 Mobile Recurring Bill Lifecycle QA Map

Status: `M5-002 complete; M5-003 queued`

## Purpose

M5 hardens the mobile recurring bill lifecycle UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security changes, storage/privacy changes, recurring schedule authority changes, money or settlement calculation changes, reminder delivery, background auto-generation, deployment, Docker, CI, secrets, web/admin runtime UI, OCR-worker runtime, or broad offline cache/sync work.

## Repo-State Basis

- `README.md` records a starter authenticated mobile recurring-bill template/forecast/detail/draft-generation surface and still lists mobile recurring bill creation/editing/full lifecycle/offline queueing/reminders/background generation as future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires basic recurring bill creation, schedules, due-soon visibility, forecasting, and user confirmation for generated recurring bill instances.
- `docs/features/recurring-bills/TECHNICAL_SPEC.md` records backend endpoints for recurring template create/list/get/update/pause/resume/archive, forecast reads, and explicit draft generation, while mobile current state remains read/forecast/detail/draft-generation only.
- `packages/contracts/openapi/settleora.v1.yaml` exposes recurring template create/list/get/update/pause/resume/archive, forecast, and explicit generate-draft operations. The contract remains read-only context for M5.
- `apps/mobile/lib/recurring_bills/` and existing recurring tests provide a bounded mobile seam for follow-up slices.

## Current Implementation Inventory

- Repository interface: `apps/mobile/lib/recurring_bills/recurring_bill_repository.dart` defines mobile models for template summaries/details, schedules, forecast occurrences, draft generation results, create/update payload drafts, status labels, schedule labels, and bounded recurring failure kinds. The interface supports `listTemplates`, `listForecast`, `getTemplate`, `createTemplate`, `updateTemplate`, `pauseTemplate`, `resumeTemplate`, `archiveTemplate`, and `generateDraft`.
- Generated-client seam: `apps/mobile/lib/recurring_bills/generated_recurring_bill_repository.dart` wraps the generated Dart client for template create/list/get/update/pause/resume/archive, forecast list, template detail, and generate-draft calls. Each operation reads an access token, trims and validates IDs/dates/status/limits/schedule shape/currency/amount/text fields, maps generated responses into safe mobile models, and maps 400/401/403/404/409/5xx/network failures into bounded UI messages.
- Template list: `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart` loads up to 100 visible templates, displays merchant fallback names, forecast amount/currency, next-occurrence or inactive-state copy, status/schedule/scope chips, local search, and template filters for all/active/inactive/personal/group.
- Template create/edit: the recurring screen exposes a create entry point backed by existing contract-supported fields for display text, optional group ID, schedule, currency, and one minimal item payload. Template detail exposes edit for non-archived templates using server-returned display fields and schedule fields; mobile does not invent or reconstruct hidden payload fields that the read response does not expose.
- Template detail and lifecycle: tapping a template opens a detail screen that refreshes one template, shows status, estimate, description, frequency, start/end/due offset, next occurrence, updated/archive timestamps, scope, payload version, server-authority copy, and guidance for active/paused/archived/server-unknown states. Active/paused templates expose confirmation-gated pause/resume/archive actions with action-specific in-flight state, duplicate/conflicting mutation blocking, refresh-after-success behavior, and bounded refresh-warning copy if mutation succeeds but detail refresh fails. Archived templates are terminal/read-only in mobile.
- Forecast list: the same screen loads up to 30 forecast rows, displays occurrence date, due date, forecast amount/currency, occurrence status, generated-draft state, personal/group scope, local search, and forecast filters for all/needs draft/draft generated/closed/personal/group.
- Explicit draft generation: forecast rows with `status == forecasted` and `draftGenerated == false` enable a `Generate Draft` action. The UI shows a confirmation dialog, calls `generateDraft(templateId, occurrenceDate)` only after confirmation, blocks duplicate generation while the operation is in progress, shows a success snackbar, and reloads server state after success.
- Loading/empty/retry/error states: the list and detail screens show loading panels, true-empty states, filtered-empty states, pull-to-refresh/refresh buttons, retry panels for load failures, and inline action failures for draft generation. Failure copy comes from bounded repository failures rather than raw generated-client bodies.
- Server-mode/session-gated behavior: `apps/mobile/lib/app/app_bootstrap.dart` builds the recurring repository from server configuration and the secure access-token provider. `apps/mobile/lib/app/server_mode_shell.dart` includes recurring data in the authenticated dashboard overview, opens the recurring screen from the Recurring tile, and can open the screen prefiltered to forecast rows needing drafts. Missing access tokens are mapped to sign-in-required failures before generated-client calls.
- Group/context display: current recurring models only expose `isGroupScoped`; mobile displays personal/group scope labels but does not load group names or modify group runtime behavior.
- Not implemented in mobile yet: recurring lifecycle offline queueing, reminder scheduling, notification delivery, background auto-generation, advanced exception handling, generated-draft navigation to bill detail, and broad stale-forecast handoff recovery.

## Day 1 Requirement Map

- Basic recurring bill creation: backend/generated-client seams exist and mobile now exposes a bounded create form plus repository method for contract-supported Day 1 fields.
- Basic recurring bill schedule: current mobile renders server-provided schedule type, interval, start/end, due offset, and next occurrence. It does not calculate recurrence locally, which preserves server authority.
- Due-soon visibility: current authenticated shell can surface forecast rows and opens a needs-draft filtered view; current recurring screen also filters forecast rows needing drafts. It does not implement reminders, notifications, push, or background checks.
- Basic forecast from recurring bills: current mobile calls the server forecast endpoint, renders bounded forecast rows, and treats them as estimates/read-only until explicit draft generation.
- User confirmation path for generated recurring bill instances: current mobile requires a confirmation dialog before `generateDraft` and blocks duplicate in-flight taps. It does not yet navigate to, refresh, or reconcile generated bill context beyond showing success and reloading recurring state.
- Server-authoritative recurrence, authorization, money, and generated-draft behavior: current mobile renders server response data and passes template/occurrence identifiers for explicit draft generation. It does not compute recurrence, authorization, final money, occurrence state, or generated draft authority locally.

## Covered Automated Tests

- `apps/mobile/test/recurring_bill_screen_test.dart` covers loading, loaded content, empty state, local search, template and forecast filters/counts, clear-discovery behavior, needs-draft startup filter, filtered-empty states, search controller disposal, retry after load failure, detail opening, create form validation, create success/reload, duplicate create blocking, edit prefill/update, pause/resume/archive confirmation and refresh behavior, lifecycle failure safe copy, explicit draft-generation confirmation/success/reload, bounded draft-generation failure, duplicate-tap blocking while confirming, inactive/terminal guidance, and authenticated server-shell navigation into recurring bills.
- `apps/mobile/test/recurring_bill_generated_repository_test.dart` covers session-required behavior before generated-client calls, template list mapping and safe fallback names, forecast mapping and `canGenerateDraft`, detail/draft response mapping, create/update/lifecycle request mapping, access-token trimming, parameter normalization, 401 session-expired mapping, validation for required IDs/limits/statuses/ISO dates/create request fields, and bounded network/server failure messages.

## Uncovered Areas

- Mobile tests now cover create/edit forms, generated repository request mapping, pause/resume/archive actions, duplicate mutation prevention for create/lifecycle actions, and post-lifecycle detail refresh.
- No mobile tests cover generated-draft bill navigation, stale generated-draft refresh failure, or inactive-template forecast handoff beyond read-only copy.
- No mobile tests cover manual UI review on narrow/wide devices; this remains explicitly deferred until Day 1 acceptance and is not passed.
- No tests in this slice exercise backend/API/OpenAPI/generated-client generation, schema, money, auth/session runtime, storage, notification delivery, reminders, background generation, or offline queueing because those are outside M5 scope.

## M5 Acceptance Targets

- `M5-001` reconciles current recurring lifecycle UI and test coverage without runtime changes. Status: complete.
- `M5-002` hardens mobile recurring template create/edit and pause/resume/archive lifecycle actions using existing generated-client seams, with duplicate-mutation prevention, bounded validation, server-authority copy, and safe retry/failure states. Status: complete.
- `M5-003` hardens forecast, detail, and explicit draft-generation handoff behavior for stale state, inactive templates, generated-draft refresh failures, and safe navigation without local recurrence or financial authority.

## M5-002 Implementation Coverage

- Added generated-client-backed create/edit/lifecycle repository methods and mobile form/action state only inside recurring mobile seams.
- Rendered server-authority copy for recurrence, group membership, authorization, money, generated drafts, and audit behavior.
- Added pause/resume/archive lifecycle actions with explicit in-flight state, no duplicate/conflicting mutation while busy, safe conflict/session/denied/unavailable handling, and refresh-after-mutation behavior.
- Preserved no local recurrence or money authority; mobile validates only local form shape and relies on API/domain services for schedule validity, membership, participants, payer policy, forecast amount, generated draft truth, and audit.
- Did not change OpenAPI, generated clients, backend/API behavior, schema/migrations, recurring offline queueing, reminder delivery, background generation, notification delivery, or money/schedule authority.

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

Manual UI retest and manual code review remain deferred until Day 1 acceptance. M5 does not mark them passed.

## Stop Conditions

Stop for human approval if recurring work requires backend/API behavior, OpenAPI/generated-client changes, auth/session/security runtime or configuration, database schema/migrations, storage/file privacy policy changes, money/settlement/bill calculation authority changes, recurring schedule authority changes, recurring reminder delivery, background auto-generation, advanced exceptions, broad offline cache/sync, Docker/env/deployment/CI changes, production deploy/public exposure, force/history operations, branch deletion, secrets, reducing Day 1 scope, replacing architecture direction, or expanding across unrelated major domains.
