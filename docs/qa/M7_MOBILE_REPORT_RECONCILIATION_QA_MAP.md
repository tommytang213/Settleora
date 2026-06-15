# M7 Mobile Monthly Reports + Reconciliation Readout QA Map

## Purpose

Define the kickoff QA map for M7 `Day 1 Mobile Monthly Reports + Reconciliation Readout Hardening`.

M7 covers existing mobile monthly report, dashboard/report entry, bill search/filter, and reconciliation-status readout seams. It does not implement runtime behavior in this kickoff and must not add statement import, reconciliation mutations, CSV import/export, backup/restore, backend/API behavior, OpenAPI/generated-client changes, schema/migrations, auth/session/security runtime changes, storage/privacy policy changes, settlement/payment/bill calculation changes, money authority changes, Docker/deployment/CI changes, secrets, or unrelated domain work.

## Repo-State Basis

- `README.md` records a starter mobile monthly report screen, personal/group bill list/detail surfaces, generated-client-backed report calls, and existing settlement/bill fields, while broader search/filter/report/import/export and reconciliation flows remain incomplete.
- `docs/prd/MVP_DAY1_SCOPE.md` requires monthly reports, advanced search/filter, reconciliation-related filters where available, and group dashboard basics for Day 1.
- `docs/features/reconciliation/TECHNICAL_SPEC.md` and `docs/architecture/STATEMENT_RECONCILIATION_ARCHITECTURE.md` define statement import, match suggestions, raw statement privacy, reconciliation link/unlink, and matching persistence as future API/storage/privacy work. M7 must not enter that scope.
- `apps/mobile/lib/reports/` contains the existing monthly report model, generated repository, and report screen.
- `apps/mobile/lib/dashboard/` contains the existing dashboard preview/readout surface.
- `apps/mobile/lib/bills/bill_list_screen.dart` already renders personal/group bill list/detail search/filter behavior and server-provided reconciliation status/note fields.
- `apps/mobile/test/monthly_report_screen_test.dart`, `apps/mobile/test/report_generated_repository_test.dart`, `apps/mobile/test/dashboard_preview_screen_test.dart`, `apps/mobile/test/server_mode_shell_dashboard_test.dart`, and focused bill list tests provide existing automated seams.

## Current Known Implementation Seams

- Monthly reports are loaded through `SettleoraMonthlyReportRepository` and `GeneratedSettleoraMonthlyReportRepository`.
- Report responses preserve server-provided money strings and status counts for total, actor share, actor paid, reconciliation, settlement request, and settlement payment buckets.
- The report screen supports month navigation, group scope label display, refresh, search/filter over loaded aggregate rows, filtered-empty copy, zero-state copy, safe unknown status labels, and bounded failure handling.
- The dashboard preview is currently a read-only preview surface, not a generated-client-backed authoritative dashboard.
- Bill list/detail code already includes local search/filter controls over loaded rows and displays reconciliation status/note fields from server-provided bill models.
- Mobile report and bill discovery must not compute financial truth, mutate reconciliation state, import statements, export data, or infer authorization from hidden UI.

## Day 1 Requirement Map

- Monthly reports: M7 hardens the existing monthly report surface and generated-client repository seam.
- Advanced search/filter: M7 may harden local discovery over loaded server-provided report and bill rows only.
- Reconciliation-related fields where available: M7 may display and filter bounded server-provided reconciliation status/note data, but not create statement import/matching/linking behavior.
- Group dashboard basics: M7 may improve read-only dashboard/report entry or route clarity, but not add backend dashboard APIs or cross-domain mutation flows.
- CSV export/import and local backup/restore: explicitly outside M7 because they require broader API/storage/privacy/security decisions.

## Planned M7 Task Slices

- `M7-001-MOBILE-REPORT-RECONCILIATION-STATE-RECONCILE-20260615-2123`: reconcile current implementation and QA coverage without runtime changes.
- `M7-002-MOBILE-MONTHLY-REPORT-DISCOVERY-HARDENING-20260615-2123`: harden monthly report discovery, safe aggregate display, group/month scope handling, unknown statuses, failures, and dashboard/report entry within existing seams.
- `M7-003-MOBILE-BILL-REPORT-RECONCILIATION-READOUT-HARDENING-20260615-2123`: harden bill list/detail reporting filters and reconciliation-status readouts over loaded server data only.
- `M7-004-MOBILE-REPORT-RECONCILIATION-QA-FINALIZE-20260615-2123`: finalize QA/control state and mark M7 UI-test ready without runtime behavior.
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

Manual UI retest and manual code review remain deferred until Day 1 acceptance. M7 kickoff does not mark either as passed.
