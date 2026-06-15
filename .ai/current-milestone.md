# Current Milestone

- ID: `M7`
- Name: `Day 1 Mobile Monthly Reports + Reconciliation Readout Hardening`
- Target branch: `ai/integration`
- Previous milestone ID: `M6`

## Goal

Advance the next Day 1 blocker after the M6 mobile receipt OCR capture/review checkpoint by hardening existing mobile monthly report, dashboard/report entry, bill search/filter, and reconciliation-status readout surfaces that already depend on server-provided report and bill fields. M7 is intentionally read-oriented: it improves discoverability, safe failure states, bounded local filters, and QA coverage without creating statement import, CSV import/export, backup/restore, reconciliation mutations, backend/API behavior, OpenAPI contracts, generated clients, schema, auth/session runtime, storage/file privacy policy, bill/settlement/payment calculation authority, deployment, Docker, CI, or secrets.

Repo-state basis for this milestone:

- `README.md` says the mobile app already has a starter monthly report screen, personal/group bill list/detail surfaces, notification/deep-link targets, settlement screens, and generated-client seams, while search/filter/report/import/export remain incomplete beyond starter surfaces.
- `docs/prd/MVP_DAY1_SCOPE.md` requires monthly reports, advanced search/filter, reconciliation-related filters where available, and group dashboard basics for Day 1.
- `docs/features/reconciliation/TECHNICAL_SPEC.md` and `docs/architecture/STATEMENT_RECONCILIATION_ARCHITECTURE.md` make full statement import/matching a future API/storage/privacy domain, so M7 must not implement statement import, raw statement visibility, reconciliation mutations, or new reconciliation persistence.
- Current mobile code has bounded seams in `apps/mobile/lib/reports/`, `apps/mobile/lib/dashboard/`, and `apps/mobile/lib/bills/bill_list_screen.dart`, with tests under `apps/mobile/test/`, making mobile-only report and reconciliation readout hardening coherent without requiring new API, contract, generated-client, schema, auth, storage, money, settlement, worker, deployment, Docker, CI, or secret changes.

## Allowed Scope For Future M7 Tasks

- Mobile monthly report screen and generated-client-backed report repository code in `apps/mobile/lib/reports/`.
- Mobile dashboard/report entry and read-only dashboard preview surfaces in `apps/mobile/lib/dashboard/`.
- Existing mobile personal/group bill list and detail search/filter/reconciliation readout code in `apps/mobile/lib/bills/bill_list_screen.dart` only when needed to connect loaded bill rows, server-provided reconciliation status/note fields, local filters, or read-only report discovery.
- Existing authenticated shell/bootstrap entry points in `apps/mobile/lib/app/` only when needed to preserve current report/dashboard routing.
- Focused mobile tests for monthly report discovery, generated report repository mapping, dashboard/report entry, bill search/filter, reconciliation-status readouts, safe failures, and server-authority copy in `apps/mobile/test/`.
- M7 QA maps and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M7 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security runtime or configuration.
- Database schema/migrations.
- Settlement/payment/bill calculation logic, reconciliation mutation authority, statement matching authority, or money authority.
- Storage/file privacy policy, file authorization policy, statement import/upload/download behavior, generic public file APIs, CSV import/export, backup/restore, or private-vault behavior.
- Docker/deployment/env/CI config.
- Production secrets.
- OCR engine/worker/runtime behavior, recurring background jobs/reminders, notification delivery providers, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain work.
- Day 2 statement import/matching, provider payment evidence import, direct bank sync, raw statement row visibility, reconciliation link/unlink mutations, export pipelines, backup/restore, or admin policy changes.

## Done Criteria

- Current mobile monthly report, dashboard/report entry, bill search/filter, and reconciliation-status readout behavior is reconciled against Day 1 requirements and captured in a QA map.
- Monthly report discovery preserves server-provided aggregate truth, safe unknown status labels, safe failure copy, session handling, group scope labels, and no client-side financial calculation.
- Bill/report reconciliation readouts preserve local filtering over loaded server data only, clear filtered-empty states, safe status/note display, and no statement import or reconciliation mutation.
- M7 QA records automated validation and keeps deferred manual UI/code review as deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.
- M7 ends in a bounded controller stop state before statement import/matching, CSV import/export, backup/restore, storage/privacy policy, reconciliation mutations, API/contracts, schema, auth, money, deployment, notification delivery, web/admin, or unrelated major-domain work.

## Current Task Pointer

- Current task: `M7-003-MOBILE-BILL-REPORT-RECONCILIATION-READOUT-HARDENING-20260615-2123`.
- Last completed task: `M7-002-MOBILE-MONTHLY-REPORT-DISCOVERY-HARDENING-20260615-2123`.
- Current state: M7-002 hardened mobile monthly report discovery, safe aggregate display, personal/group scope copy, unknown status labels, safe failure copy, and dashboard report entry clarity inside existing mobile seams. M7-003 and M7-004 remain queued.
- Recommended next automated Day 1 action: run the AI V3 controller for M7-003 mobile bill report filters and reconciliation readout hardening.
- Stop sentinel: `STOP-M7-001` stops API/contracts/generated-client/auth/schema/storage/privacy/money/deployment, statement import/matching, reconciliation mutations, CSV import/export, backup/restore, notification delivery, web/admin, broad offline sync/cache, or unrelated major-domain scope.

## M6 Carry-Forward Boundary

M6 is finalized as `Day 1 Mobile Receipt OCR Capture + Review Handoff Hardening` and remains awaiting deferred Day 1 acceptance review. M7 must not expand M6 ad hoc into OCR engine/native dependencies, OCR worker/runtime, generic receipt APIs, automatic OCR finalization, non-draft revision apply, multi-participant OCR split inference, API/contracts, schema, money, storage privacy, notification delivery, or unrelated receipt work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.

## M7-001 Reconciliation Summary

M7-001 updated the M7 QA map and `.ai` control state only. No mobile runtime, backend/API, OpenAPI, generated-client, schema/migration, auth/session/security, storage/privacy, money/settlement/payment, Docker/deployment/CI, import/export/backup, notification delivery, web/admin, secret, or unrelated-domain files were changed.

Current implementation findings:

- Monthly reports are loaded through `SettleoraMonthlyReportRepository` and `GeneratedSettleoraMonthlyReportRepository`, with the generated repository requiring a session token, normalizing `yyyy-MM` and optional group ID inputs, mapping generated-client `MonthlyReportResponse` fields directly, preserving server money strings, and translating generated/network failures into bounded messages.
- `SettleoraMonthlyReportScreen` renders server-returned bill count, generated timestamp, group or personal scope label, total/actor-share/actor-paid currency buckets, reconciliation counts, settlement request counts, and settlement payment counts. It supports month previous/next navigation, refresh, pull-to-refresh, loading, zero activity, filtered-empty, retry/error, and expired-session handling.
- Monthly report discovery is local-only over loaded aggregate rows. Search and section chips can hide visible rows, but the summary copy states that totals and bill count remain the server-returned monthly summary.
- Dashboard coverage has two surfaces: `DashboardPreviewScreen` is a local/read-only preview with fixture states, while the authenticated server shell dashboard loads existing repository summaries and opens the monthly report route through the report repository seam.
- Personal and group bill lists search/filter loaded server rows locally and include server-provided reconciliation status in searchable/displayed fields. Bill detail search/filter hides only loaded rows locally and displays server-provided reconciliation status and note from the bill detail model.
- Current M7 limitations remain: no statement import, raw statement visibility, reconciliation link/unlink, generated dashboard API, CSV import/export, backup/restore, broad report API redesign, or client-side financial/reconciliation authority.

## M7-002 Monthly Report Discovery Summary

M7-002 updated the existing mobile monthly report and dashboard report-entry surfaces inside current repository/generated-client seams.

Runtime hardening:

- Monthly report summary copy now clearly identifies the screen as a server monthly aggregate and states that local search/filters only hide loaded rows on the device.
- Active discovery results are surfaced before the search/filter controls so local filter outcomes stay visible and retry/clear behavior remains safe.
- Personal and group report scope labels are explicit as `Personal report`, named group labels, or bounded `Group report` fallback without exposing raw group IDs.
- Unknown/future report status labels now use bounded `Other status: ...` copy instead of presenting raw/generated-client-ish status codes directly.
- Failure display and session-ended notices use sanitized user-facing messages if an upstream failure contains raw API paths, tokens, stack traces, local paths, or generated-client/internal details.
- Dashboard `More` report entry copy now clarifies that the monthly report opens server-returned aggregates for the selected month while preserving the existing route and report repository seam.

Focused automated coverage:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/monthly_report_screen_test.dart test/report_generated_repository_test.dart test/dashboard_preview_screen_test.dart test/server_mode_shell_dashboard_test.dart` passed with 60 tests.

Manual UI/code review remains deferred until Day 1 acceptance and is not passed.
