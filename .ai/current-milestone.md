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

- Current task: `M7-001-MOBILE-REPORT-RECONCILIATION-STATE-RECONCILE-20260615-2123`.
- Last completed task: `M6-004-RECEIPT-OCR-CAPTURE-REVIEW-QA-FINALIZE-20260615-1950`.
- Current state: M6-001 through M6-004 are complete and M6 is finalized with no remaining automated M6 work. M7 is queued as the next bounded Day 1 milestone.
- Recommended next automated Day 1 action: run the AI V3 controller for M7-001 mobile monthly report/reconciliation readout state reconciliation.
- Stop sentinel: `STOP-M7-001` stops API/contracts/generated-client/auth/schema/storage/privacy/money/deployment, statement import/matching, reconciliation mutations, CSV import/export, backup/restore, notification delivery, web/admin, broad offline sync/cache, or unrelated major-domain scope.

## M6 Carry-Forward Boundary

M6 is finalized as `Day 1 Mobile Receipt OCR Capture + Review Handoff Hardening` and remains awaiting deferred Day 1 acceptance review. M7 must not expand M6 ad hoc into OCR engine/native dependencies, OCR worker/runtime, generic receipt APIs, automatic OCR finalization, non-draft revision apply, multi-participant OCR split inference, API/contracts, schema, money, storage privacy, notification delivery, or unrelated receipt work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
