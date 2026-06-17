# M15 Readiness QA

## Purpose And Scope

M15 prepares Day 1 acceptance evidence and manual gate readiness. It reconciles current repo evidence against the Day 1 scope, creates an evidence map, prepares manual review gates, and records the next safe action.

M15 does not implement missing Day 1 product features. It does not change runtime behavior, API behavior, OpenAPI operation behavior, generated clients, auth/session/security behavior, schema/migrations, storage/privacy/file behavior, deployment/CI behavior, or money/split/settlement/OCR/reconciliation logic.

Future Day 1 completion claims must cite evidence from this acceptance package and the live repo.

## Slice Checklist

| Slice | Status for this branch | Evidence |
| --- | --- | --- |
| M15-001 acceptance state reconcile | completed_pending_review | `DAY1_ACCEPTANCE_STATE.md` reconciles Day 1 requirement areas using conservative statuses. |
| M15-002 evidence map hardening | completed_pending_review | `DAY1_EVIDENCE_MAP.md` separates implemented, docs-only, validation, missing, and manual evidence. |
| M15-003 manual gate package hardening | completed_pending_review | `MANUAL_GATE_PACKAGE.md` defines maintainer, UI, security, storage, money, OCR, deployment, and GitHub settings gates. |
| M15-004 acceptance readiness QA finalize | completed_pending_review | This file records scope, validation plan/results, remaining gates, and next action. |

## Current Completion Status

This branch creates the Day 1 acceptance package under `docs/acceptance/day1/` and adds a lightweight README reference. It is ready for maintainer review after local validation and PR CI complete.

Manual UI retest and manual code review remain `deferred_until_day1_acceptance`; they are not passed by this branch.

## Validation Matrix

| Command | Expected outcome | Current result |
| --- | --- | --- |
| `git status --short` | Clean before branch creation, then only scoped docs changes before commit, clean after commit. | Passed before branch creation with no output after `main` fast-forward. Before validation, showed `M README.md` and untracked `docs/acceptance/`. |
| `git diff --name-only` | Only `README.md` and `docs/acceptance/day1/*.md` changed before commit. | Tracked diff showed `README.md`; untracked acceptance files were separately listed under `docs/acceptance/day1/`. |
| `git diff --check` | No whitespace errors. | Passed with no output. |
| `npm run validate:docs` | Documentation validation passes. | Passed: `Documentation validation passed.` |
| `npm run validate:scaffold` | Scaffold validation passes. | Passed: `Scaffold validation passed (19 paths).` |
| `npm run validate:openapi` | OpenAPI lint passes; OpenAPI is unchanged but referenced by this evidence package. | Passed: `packages/contracts/openapi/settleora.v1.yaml: validated in 130ms`; Redocly also printed an update notice for CLI 2.32.2. |

Slow runtime suites are intentionally not part of the default M15 local validation because this branch is docs-only and does not change mobile, API runtime, Docker, migrations, generated clients, or OpenAPI content. Existing API/mobile validation commands remain listed in the evidence map for the implementation they cover.

## Remaining Manual Gates

- Maintainer review.
- Mobile UI retest.
- Manual code review.
- Security/auth/session review.
- Storage/file privacy review.
- Money/split/settlement calculation review.
- OCR capture/review review.
- Notification review.
- Recurring/forecasting review.
- Sync/offline/local-mode review.
- Import/export/reporting review.
- Docker/self-hosted deployment review.
- TrueNAS SCALE deployment considerations.
- GitHub repository settings review, including private vulnerability reporting and branch protection/CI expectations.

## Recommended Next Action

Open the PR for maintainer review and CI. After review, the next automated action should be a targeted Day 1 gap implementation slice chosen from the evidence map, or a maintainer-run manual Day 1 acceptance gate if the maintainer decides the evidence package is ready for manual review.

## Post-M15 Local/Offline Data Safety Addendum

M16 local/offline data-safety work added starter implementation evidence after the original M15 docs-only package:

- `apps/mobile/lib/app/local_data_backup.dart` implements a versioned mobile local-data backup JSON service for app-mode summary plus current mobile bill sync queue, excluding session material, server URLs, payment details, file bytes, storage paths, receipt/OCR/proof contents, and complete-server-backup claims.
- `apps/mobile/lib/app/server_mode_shell.dart` exposes the dashboard Data safety panel with backup JSON generation, import validation/preview, and disabled restore apply text.
- `apps/mobile/test/local_data_backup_test.dart` and `apps/mobile/test/server_mode_shell_dashboard_test.dart` cover export metadata/counts, sensitive-data exclusions, invalid/corrupt/sensitive import rejection, visible preview state, and the disabled restore guard.

This improves Day 1 local backup/import-preview evidence but does not complete Day 1. Full file save/share integration, guarded restore merge/replace apply, broader local-only data model coverage, local/server migration flows, full offline cache hydration, conflict-resolution apply UI, manual UI retest, privacy review, and code review remain pending.

## Post-M15 Notification Preference Addendum

M17 mobile notification preference work added starter implementation evidence after the original M15 docs-only package:

- `apps/mobile/lib/notifications/notification_preferences.dart` implements a mobile-local notification preference model and UI panel for in-app enablement, bill/settlement/recurring category toggles, protected sync/security readout, quiet-hours suppression/readout, immediate/digest readout, and explicit push/email unavailable labels.
- `apps/mobile/lib/app/server_mode_shell.dart` exposes the dashboard notification preference panel and passes the current mobile-local preference state into the notification center.
- `apps/mobile/lib/notifications/notification_screen.dart` applies non-destructive local suppression to loaded notification rows, keeps archived rows available through the Archived filter, and shows a suppression note when preferences hide non-critical rows.
- `apps/mobile/test/notification_screen_test.dart` and `apps/mobile/test/server_mode_shell_dashboard_test.dart` cover safe defaults, category and quiet-hours suppression, critical sync/security visibility, unsupported push/email readout, and dashboard-to-notification-center preference handoff.

Focused validation passed on this branch:

```bash
cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/notification_screen_test.dart test/server_mode_shell_dashboard_test.dart
```

This improves Day 1 in-app notification preference/readout evidence but does not complete Day 1. Push delivery, email delivery, persisted/server notification preferences, cross-device preference sync, reminder scheduling, deep links/background delivery, complete notification event producer coverage, manual notification UI retest, and code review remain pending.

## Post-M15 Receipt Intake Safety Addendum

M18 mobile OCR/receipt intake hardening added starter implementation evidence after the original M15 docs-only package:

- `apps/mobile/lib/receipt_ocr_capture/receipt_intake_safety.dart` centralizes mobile-owned receipt intake source and warning policy for camera capture, photo import, file import, unknown source, supported receipt content types/extensions, large or missing file size metadata, provisional server-mode OCR state, and unavailable native intake paths.
- `apps/mobile/lib/receipt_ocr_capture/receipt_ocr_parser.dart` now warns when a currency candidate was inferred from a symbol only, so users must confirm the currency before applying OCR suggestions.
- `apps/mobile/lib/bills/bill_list_screen.dart` shows a receipt intake review panel in the personal/group OCR preview flow and keeps apply behavior review-first and explicit.
- `apps/mobile/test/receipt_ocr_capture/receipt_ocr_parser_test.dart`, `apps/mobile/test/bill_duplicate_warning_test.dart`, and `apps/mobile/test/bill_list_screen_test.dart` cover intake warnings, symbol-only currency guidance, duplicate-preview warnings, total mismatch guidance, and visible review-first OCR apply copy.

This improves Day 1 mobile receipt intake/review safety evidence but does not complete Day 1. Policy-driven image normalization, raw source retention policy, thumbnails, share-sheet/offline capture coverage, full receipt line classification and merge/split lineage, full tax/refund/tender/change handling, OCR worker runtime, automatic OCR completion, manual OCR UI retest, storage/privacy review, money review, and code review remain pending.
