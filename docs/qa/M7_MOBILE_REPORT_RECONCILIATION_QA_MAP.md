# M7 Mobile Monthly Reports + Reconciliation Readout QA Map

## Purpose

Define the QA map for M7 `Day 1 Mobile Monthly Reports + Reconciliation Readout Hardening`.

M7 is finalized and UI-test ready. M7-001 through M7-004 are complete, automated validation coverage is recorded, and there is no remaining automated M7 work.

M7 covers existing mobile monthly report, dashboard/report entry, bill search/filter, and reconciliation-status readout seams. It does not implement runtime behavior in this kickoff and must not add statement import, reconciliation mutations, CSV import/export, backup/restore, backend/API behavior, OpenAPI/generated-client changes, schema/migrations, auth/session/security runtime changes, storage/privacy policy changes, settlement/payment/bill calculation changes, money authority changes, Docker/deployment/CI changes, secrets, or unrelated domain work.

## Repo-State Basis

- `README.md` records a starter mobile monthly report screen, personal/group bill list/detail surfaces, generated-client-backed report calls, and existing settlement/bill fields, while broader search/filter/report/import/export and reconciliation flows remain incomplete.
- `docs/prd/MVP_DAY1_SCOPE.md` requires monthly reports, advanced search/filter, reconciliation-related filters where available, and group dashboard basics for Day 1.
- `docs/features/reconciliation/TECHNICAL_SPEC.md` and `docs/architecture/STATEMENT_RECONCILIATION_ARCHITECTURE.md` define statement import, match suggestions, raw statement privacy, reconciliation link/unlink, and matching persistence as future API/storage/privacy work. M7 must not enter that scope.
- `apps/mobile/lib/reports/` contains the existing monthly report model, generated repository, and report screen.
- `apps/mobile/lib/dashboard/` contains the existing dashboard preview/readout surface.
- `apps/mobile/lib/bills/bill_list_screen.dart` already renders personal/group bill list/detail search/filter behavior and server-provided reconciliation status/note fields.
- `apps/mobile/test/monthly_report_screen_test.dart`, `apps/mobile/test/report_generated_repository_test.dart`, `apps/mobile/test/dashboard_preview_screen_test.dart`, `apps/mobile/test/server_mode_shell_dashboard_test.dart`, and focused bill list tests provide existing automated seams.

## M7-001 Current Implementation Inventory

### Monthly report repository and generated-client seam

- `SettleoraMonthlyReportRepository` exposes a single read method, `getMonthlyReport({required month, groupId})`.
- `GeneratedSettleoraMonthlyReportRepository` requires a non-blank access token before calling the generated client and fails with `sessionRequired` before any generated-client call if the token is missing.
- The generated repository validates `yyyy-MM` month input through `normalizeSettleoraReportMonth`, trims/omits blank group IDs, and passes the normalized month/group ID plus access token into the generated client.
- Generated `MonthlyReportResponse` fields are mapped directly into mobile model fields for `month`, `groupId`, `generatedAtUtc`, `billCount`, `totalByCurrency`, `actorShareByCurrency`, `actorPaidByCurrency`, `reconciliationCounts`, `settlementRequestCounts`, and `settlementPaymentCounts`.
- Money amounts remain server-provided strings. The mobile layer displays them and does not parse/recalculate report totals, actor share, actor paid, settlement totals, reconciliation status counts, or bill count.
- Generated/API failures are mapped into bounded `SettleoraMonthlyReportFailure` kinds for validation, expired session, denied, unavailable, network, and server cases without surfacing raw response bodies, stack traces, tokens, or internal generated-client details.

### Monthly report screen

- `SettleoraMonthlyReportScreen` loads the current/initial month on startup and supports previous/next month navigation, app-bar refresh, and pull-to-refresh.
- The summary displays server-provided `report.month`, generated timestamp, bill count, and a safe scope label: explicit `groupLabel`, `Group <id-prefix>` fallback, or `Personal report`.
- The report body displays server-provided currency buckets for total, actor share, and actor paid, plus reconciliation, settlement request, and settlement payment status-count sections.
- Loading, zero activity, retryable failure, expired-session, and unavailable/null-report states are explicit. Expired-session failures can invoke the shell-provided session-ended handler.
- Search and filter chips operate only over loaded report aggregate rows. The filtered summary states that report totals and bill count remain the server-returned monthly summary.
- Filtered-empty state is separate from true zero activity. Clearing discovery restores the loaded rows.
- Known reconciliation labels are bounded to `Unreconciled`, `Reconciled`, and `Ignored`; settlement request/payment statuses have bounded known labels. Unknown/future status codes are converted to title-style labels and truncated at 56 characters, with empty/unparseable values shown as `Unknown`.
- Current limitations: the screen has no statement import/matching, raw statement display, reconciliation link/unlink, CSV import/export, backup/restore, new report API, generated-client contract change, or client-side financial/reconciliation authority.

### Dashboard and report entry

- `apps/mobile/lib/dashboard/dashboard_preview_screen.dart` is a local/read-only preview surface backed by fixture `DashboardPreviewState` variants. It is not generated-client-backed authoritative dashboard data.
- `apps/mobile/test/dashboard_preview_screen_test.dart` covers preview app startup, canonical bottom navigation, default dashboard sections, new-user, offline, and review variants.
- The authenticated server-mode shell dashboard is separate from the local preview. `server_mode_shell_dashboard_test.dart` verifies repository-backed dashboard summaries for bills, notifications, settlements, recurring forecast, group activity, and monthly activity sections.
- `monthly_report_screen_test.dart` verifies that the authenticated server shell opens `SettleoraMonthlyReportScreen` through the report repository seam from the `server-shell-reports` entry.
- Dashboard/report entry limitations: no generated dashboard API is introduced by M7-001, no backend dashboard API is changed, and the local preview must not be treated as authoritative report data.

### Personal/group bill search, filters, and reconciliation readouts

- Personal bill list search/filter controls operate over loaded `SettleoraBillSummary` rows only. Filters currently cover all, active, needs review, and archived.
- Group bill list search/filter controls operate over loaded group `SettleoraBillSummary` rows only. Filters currently cover all, needs your response, you accepted, you rejected, and has rejections.
- Bill list search includes safe visible fields such as display name, bill date, total amount/currency, formatted money, bill status, reconciliation status label/code, archive state, loaded participant status/share fields, rejection reason labels, participant display names where loaded, and group name for group bills.
- Personal bill summary tiles and read-only group bill summary tiles display the server-provided reconciliation status through `settleoraBillReconciliationStatusLabel`.
- Bill detail header displays the server-provided reconciliation status and, when present, the server-provided reconciliation note. Detail search/filter controls hide only loaded item, participant, payer, and adjustment rows locally and include copy that filtered rows are hidden locally only.
- Filtered-empty states are distinct from true-empty states for personal list, group list, and detail rows.
- Reconciliation status labels are bounded for known values and use `_titleFromCode` fallback for unknown codes. Current code displays server-provided reconciliation notes as plain text and does not expose raw statement rows.
- Current limitations: there is no reconciliation status mutation, statement import/upload/download, raw statement visibility, statement matching, link/unlink, CSV import/export, backup/restore, generated-client edit, or client-side money/settlement/bill calculation authority in these mobile bill surfaces.

## Existing Automated Coverage Inventory

- `apps/mobile/test/monthly_report_screen_test.dart` covers loading and loaded content, group scope display without raw group ID leakage, zero report state, search over loaded aggregate rows, section filter chips, combined search/filter, clear discovery, filtered-empty vs zero activity, month navigation, retry/refresh, expired-session handling, and authenticated shell report route opening.
- `apps/mobile/test/report_generated_repository_test.dart` covers missing-session failure before generated calls, generated response mapping with money strings preserved, group ID normalization, month validation before generated calls, generated HTTP failure mapping, and network failure mapping.
- `apps/mobile/test/dashboard_preview_screen_test.dart` covers the local dashboard preview entrypoint, bottom navigation, default sections, new-user checklist, offline pending-sync state, and review/action-needed variant.
- `apps/mobile/test/server_mode_shell_dashboard_test.dart` covers repository-backed authenticated dashboard summary rendering, canonical bottom navigation, route switching between dashboard/bills/groups/settlements/receipts/profile, responsive dashboard sections, and dashboard failure/empty states around existing repository summaries.
- `apps/mobile/test/bill_list_screen_test.dart` covers personal bill list empty state, needs-review filter, local personal bill search/filter/clear behavior, bill detail search/filter counts, combined detail filters, clear behavior, filtered-empty vs true-empty, authenticated shell bill routing, and related bill-detail readouts.
- `apps/mobile/test/group_bill_list_screen_test.dart` covers group bill list loading/empty/refresh, group bill filters and counts, group bill search combined with chips, current-user-specific filter behavior, filtered empty state when current user is missing, and opening the selected filtered group bill detail.
- `apps/mobile/test/bill_generated_repository_test.dart` covers generated bill repository mapping for reconciliation status/note fields from personal and group bill generated responses.

## M7-002 Implementation Coverage

M7-002 changed only existing mobile report/dashboard/app seams and focused tests:

- `apps/mobile/lib/reports/report_repository.dart`
- `apps/mobile/lib/reports/monthly_report_screen.dart`
- `apps/mobile/lib/app/server_mode_shell.dart`
- `apps/mobile/test/monthly_report_screen_test.dart`
- `apps/mobile/test/server_mode_shell_dashboard_test.dart`

Runtime coverage added:

- Monthly report summary copy identifies the report as a server monthly aggregate; filtered-discovery copy clarifies that local search/filter only hides loaded rows while server-returned totals and bill count remain unchanged.
- Active discovery result counts render before discovery controls so local search/filter results remain visible and clear/retry behavior stays safe.
- Personal and group scope labels are explicit and bounded: `Personal report`, explicit group labels, or `Group report` fallback without raw group ID leakage.
- Unknown/future status labels render as bounded `Other status: ...` copy instead of raw generated-client-ish codes.
- Monthly report failure display and session-ended notices sanitize unsafe upstream failure messages containing raw API paths, tokens, local paths, stack traces, or internal/generated-client details.
- Authenticated dashboard report entry copy states that monthly reports open server-returned aggregates and preserves the existing monthly report route through `SettleoraMonthlyReportRepository`.

Automated validation coverage added or updated:

- `apps/mobile/test/monthly_report_screen_test.dart` now covers server-aggregate copy, personal and group scope clarity, unknown/future status fallback labels, filtered-empty copy, safe failure sanitization, and session-ended safe copy.
- `apps/mobile/test/server_mode_shell_dashboard_test.dart` now covers dashboard report-entry aggregate copy while preserving dashboard route behavior.
- Focused command passed with 60 tests: `cd apps/mobile && /opt/flutter/bin/flutter test test/monthly_report_screen_test.dart test/report_generated_repository_test.dart test/dashboard_preview_screen_test.dart test/server_mode_shell_dashboard_test.dart`.

## M7-003 Implementation Coverage

M7-003 changed only existing mobile bill readout seams and focused tests:

- `apps/mobile/lib/bills/bill_list_screen.dart`
- `apps/mobile/test/bill_list_screen_test.dart`
- `apps/mobile/test/group_bill_list_screen_test.dart`

Runtime coverage added:

- Personal and group bill lists now show visible/loaded server row counts and copy that search/filter runs locally over already-loaded rows on this device.
- Personal and group filtered-empty states remain distinct from true-empty states and tell users to clear local filters to review every loaded server row.
- Bill detail discovery copy states that search/filter hides already-loaded server detail rows locally only and that mobile displays server bill/reconciliation metadata without deciding financial truth or authorization.
- Reconciliation status display preserves known labels for `unreconciled`, `reconciled`, and `ignored`; unknown/future statuses render as bounded `Other status...` copy, and empty/malformed/unsafe-looking codes collapse to bounded user-facing fallback copy.
- Server-provided reconciliation notes render only from the loaded bill detail model as bounded plain text. Unsafe raw API paths, tokens, local filesystem paths, stack traces, storage/provider internals, and generated-client internals are suppressed.
- Bill detail copy clarifies reconciliation readouts are server-provided record metadata, not bank statement matching.
- No statement import/upload/download, raw statement rows, direct bank sync, reconciliation link/unlink/update, CSV import/export, backup/restore, generated dashboard/report API, backend/API behavior, OpenAPI/generated-client change, schema/migration, auth/session/security change, storage/privacy change, or money/settlement/bill calculation authority was added.

Automated validation coverage added or updated:

- `apps/mobile/test/bill_list_screen_test.dart` now covers personal bill filtered-empty copy, detail filtered-empty copy, loaded-row/local-device scope copy, known and unknown bounded reconciliation labels, bounded server-provided reconciliation note display, unsafe reconciliation status/note suppression, and absence of statement import/matching/mutation/export/backup actions on bill readout surfaces.
- `apps/mobile/test/group_bill_list_screen_test.dart` now covers group bill loaded-row/local-device scope copy and filtered-empty copy for current-user/filter discovery.
- Focused command passed with 274 tests: `cd apps/mobile && /opt/flutter/bin/flutter test test/bill_list_screen_test.dart test/group_bill_list_screen_test.dart test/bill_generated_repository_test.dart test/monthly_report_screen_test.dart`.
- Full mobile validation passed with 690 Flutter tests.

## M7-004 Finalization Coverage

M7-004 changed only `.ai` control files and this QA map.

Finalized state:

- M7-001 is completed as the current-state reconciliation and automated coverage inventory.
- M7-002 is completed as monthly report discovery and safe aggregate hardening.
- M7-003 is completed as bill reporting and reconciliation readout hardening.
- M7-004 is completed as QA/control finalization.
- M7 is UI-test ready with no remaining automated M7 work.
- Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.

Recorded validation coverage:

- M7-002 focused report/dashboard validation: 60 tests from `monthly_report_screen_test.dart`, `report_generated_repository_test.dart`, `dashboard_preview_screen_test.dart`, and `server_mode_shell_dashboard_test.dart`.
- M7-002 full mobile validation: 688 Flutter tests.
- M7-003 focused bill/report/reconciliation validation: 274 tests from `bill_list_screen_test.dart`, `group_bill_list_screen_test.dart`, `bill_generated_repository_test.dart`, and `monthly_report_screen_test.dart`.
- M7-003 full mobile validation: 690 Flutter tests.

## Remaining Out-Of-Scope Areas

The following remain unresolved outside this bounded M7 mobile readout checkpoint:

- full statement import/matching/linking;
- raw statement row visibility;
- reconciliation link/unlink/update mutations;
- CSV import/export;
- local backup/restore;
- generated dashboard API;
- broad report API redesign;
- storage/privacy changes;
- money/settlement/bill calculation authority changes;
- API/contracts/generated-client/schema/auth/security changes;
- deployment, Docker, CI, or environment changes;
- notification delivery, web/admin runtime, broad offline cache/sync, or unrelated major-domain work.

## Current Coverage Gaps And Next Slices

- M7-002 completed monthly report/dashboard discovery hardening: dashboard/report entry clarity, monthly report safe aggregate display, group/month scope clarity, unknown status handling, session/network failure states, retry behavior, and server-authority copy inside existing report/dashboard seams.
- M7-003 completed bill reporting/reconciliation readout hardening: loaded-row search/filter clarity, filtered-empty copy, reconciliation status/note bounded display, and no-import/no-mutation/server-authority copy inside existing personal/group bill list/detail seams.
- M7-004 completed QA/control finalization after implementation slices and kept manual UI/code review deferred until Day 1 acceptance.
- Remaining Day 1/Day 2 gaps outside this M7 mobile readout slice include CSV import/export, local backup/restore, full statement import/matching/linking, raw statement privacy controls, generated dashboard APIs, broad reporting backend redesign, storage/privacy policy changes, and any authoritative reconciliation mutations.

## Day 1 Requirement Map

- Monthly reports: M7 hardens the existing monthly report surface and generated-client repository seam.
- Advanced search/filter: M7 may harden local discovery over loaded server-provided report and bill rows only.
- Reconciliation-related fields where available: M7 may display and filter bounded server-provided reconciliation status/note data, but not create statement import/matching/linking behavior.
- Group dashboard basics: M7 may improve read-only dashboard/report entry or route clarity, but not add backend dashboard APIs or cross-domain mutation flows.
- CSV export/import and local backup/restore: explicitly outside M7 because they require broader API/storage/privacy/security decisions.

## Planned M7 Task Slices

- `M7-001-MOBILE-REPORT-RECONCILIATION-STATE-RECONCILE-20260615-2123`: reconcile current implementation and QA coverage without runtime changes.
- `M7-002-MOBILE-MONTHLY-REPORT-DISCOVERY-HARDENING-20260615-2123`: completed monthly report discovery, safe aggregate display, group/month scope handling, unknown statuses, failures, and dashboard/report entry within existing seams.
- `M7-003-MOBILE-BILL-REPORT-RECONCILIATION-READOUT-HARDENING-20260615-2123`: completed bill list/detail reporting filters and reconciliation-status readouts over loaded server data only.
- `M7-004-MOBILE-REPORT-RECONCILIATION-QA-FINALIZE-20260615-2123`: completed QA/control finalization and marked M7 UI-test ready without runtime behavior.
- `STOP-M7-001`: stop for broad reporting/reconciliation/import/export/API/storage/money/deployment/security expansion.

## Stop Conditions

Stop immediately if M7 work requires:

- backend/API behavior, OpenAPI, or generated-client changes;
- auth/session/security runtime or configuration changes;
- database schema/migrations;
- storage/file privacy policy, file authorization, statement upload/download/import, CSV import/export, backup/restore, or private-vault behavior;
- settlement/payment/bill calculation, reconciliation mutation authority, statement matching authority, or money authority changes;
- Docker, deployment, environment, CI, secrets, tokens, credentials, or local auth config changes;
- Day 2 statement import/matching, provider payment evidence import, direct bank sync, raw statement row visibility, reconciliation link/unlink mutations, notification delivery, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain work.

## Validation Expectations

Kickoff validation:

- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

Future runtime slices should add focused Flutter tests and full mobile validation when mobile runtime or tests change.

## Deferred Manual Review

Manual UI retest and manual code review remain deferred until Day 1 acceptance. M7 finalization does not mark either as passed.
