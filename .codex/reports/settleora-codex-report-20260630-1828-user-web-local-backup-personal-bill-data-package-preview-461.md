# Settleora Codex Report - User Web Local Backup Personal Bill Data Package + Restore Preview (#461)

## Status

READY_FOR_REVIEW.

## Timing

- HKT start timestamp: 2026-06-30 18:28 HKT
- HKT end timestamp: 2026-06-30 18:37 HKT
- Elapsed time: approximately 9 minutes

## Branch And SHAs

- Branch name: `feature/user-web-local-backup-personal-bill-data-package-preview-461`
- Base/main SHA observed: `b0088732290cc6fe9fb907a6b668d89d368d6718`
- Source SHA before edits: `b0088732290cc6fe9fb907a6b668d89d368d6718`
- Integration branch/SHA: not used; task branch is based on `origin/main`
- Final commit SHA: pending until this report is committed; final pushed SHA is reported in the Codex final response
- Branch pushed: pending at report-write time
- PR URL: not created

## Required Reading Completed

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- `docs/prd/MVP_DAY1_SCOPE.md`
- `docs/prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md`
- `docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md`
- `docs/planning/USER_WEB_LOCAL_BACKUP_RESTORE_PLAN.md`
- `docs/planning/USER_WEB_LOCAL_BACKUP_PACKAGE_CONTRACT_PLAN.md`
- `docs/planning/USER_WEB_LOCAL_BACKUP_PACKAGE_SESSION_PLAN.md`
- `docs/planning/USER_WEB_LOCAL_BACKUP_PACKAGE_GENERATION_DOWNLOAD_PLAN.md`
- `docs/planning/USER_WEB_LOCAL_BACKUP_RESTORE_CONFIRMATION_CONTRACT_PLAN.md`
- `docs/planning/USER_WEB_SYNC_LOCAL_STATUS_PLAN.md`
- `docs/planning/USER_WEB_SYNC_LOCAL_STATUS_CONTRACT_PLAN.md`
- `docs/architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md`
- `docs/architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md`
- `docs/architecture/EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- `services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs`
- `services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs`
- Relevant personal bill domain/readout files under `services/api/src/Settleora.Api/Domain/Expenses`, `services/api/src/Settleora.Api/Expenses/PersonalBills`, and `services/api/src/Settleora.Api/Expenses/BillSearch`
- Latest relevant `.codex/reports/*local-backup*` and `.codex/reports/*restore*` reports present in the repo
- Active `.ai/*` files as read-only context

## Files Changed

- `.codex/reports/settleora-codex-report-20260630-1828-user-web-local-backup-personal-bill-data-package-preview-461.md`
- `docs/planning/USER_WEB_LOCAL_BACKUP_PACKAGE_GENERATION_DOWNLOAD_PLAN.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- `packages/client-web/src/generated/models.ts`
- `packages/client-dart/lib/generated/models.dart`
- `services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs`
- `services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs`
- `/workspace/logs/settleora-codex-report-20260630-1828-user-web-local-backup-personal-bill-data-package-preview-461.md`

## Package Section And Version Impact

- Added package data section: `personal_bill_candidates`
- Existing package format retained: `settleora.local-backup.data-only`
- Existing package version retained: `2026-06-30.data-only.v1`
- Existing manifest version retained: `2026-06-30.manifest.v1`
- OpenAPI/generated-client changes were unavoidable because existing restore-preview section/category enums could not represent `personal_bill_candidates` or the new bounded fail-closed codes.

## Payload Categories Included

- Current-actor visible personal bills only, using `VisiblePersonalBillsIncludingArchived` server-side scoping.
- Package-local candidate IDs such as `personal-bill-candidate-000001`.
- Safe source provenance: source record type, source authority boundary, source scope, and a SHA-256 source-record digest instead of raw bill IDs.
- Bill date, status, archive state, created/updated/archive timestamps.
- Decimal-safe string totals with currency.
- Item, participant, payer, and adjustment count categories.
- Current-actor participant status/share and current-actor payer amount/currency/confirmation status.
- Current-actor created-by and bill-owner flags.

## Payload Categories Omitted

- Group/shared records.
- File/blob sections and file bytes.
- Storage paths, object keys, bucket names, signed/direct URLs, provider internals, filesystem/local/temp/mounted paths.
- Raw OCR text and OCR source line internals.
- Merchant names, item names, item notes, adjustment reason notes, private notes, payment labels, and payment details.
- Raw source bill IDs.
- Hidden shared/group data, hidden member details, unauthorized settlement/payment details.
- Secrets, tokens, passwords, credentials, auth/session material, `.env`, and local Codex state.

## Restore Preview Behavior

- Restore preview remains non-mutating.
- Parser accepts the additive `personal_bill_candidates` included section only when it is bounded and structurally safe.
- Preview response includes a `recordSummaries` entry for `personal_bill_candidates` with total, active, archived, item, participant, payer, and adjustment counts.
- Unknown/invalid candidate payloads fail closed with `invalid_personal_bill_candidate_section`.
- Oversized candidate arrays fail closed with `personal_bill_candidate_limit_exceeded`.
- Unsupported encrypted/file sections still fail closed.

## Restore Apply Boundary

Restore apply remains unavailable and non-mutating. Restore-confirmation sessions remain metadata-only with `canApplyRestore: false`; no restore confirmation mutation, server/local data write, file-byte restore, package upload/storage, browser-local persistence, sync mutation, or business-record mutation was added.

## Exact Validation Commands And Results

- `cd /workspace/repos/Settleora && dotnet build services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --no-restore`
  - Exit 0
  - Result: build succeeded, 0 warnings, 0 errors
- `cd /workspace/repos/Settleora && dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter FullyQualifiedName~LocalBackup`
  - Exit 0
  - Result: passed, 11 tests
- `cd /workspace/repos/Settleora && npm ci`
  - Exit 0
  - Result: added 2 packages, audited 6 packages, found 0 vulnerabilities
- `cd /workspace/repos/Settleora && npm run validate:scaffold`
  - Exit 0
  - Result: `Scaffold validation passed (19 paths).`
- `cd /workspace/repos/Settleora && dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter FullyQualifiedName~LocalBackup`
  - Exit 0
  - Result: passed, 11 tests
- `cd /workspace/repos/Settleora && timeout 900 npm run validate:api`
  - Exit 0
  - Result: passed, 1190 tests, duration 5 m 27 s
- `cd /workspace/repos/Settleora && npm run validate:openapi`
  - Exit 0
  - Result: Redocly reported the API description is valid
- `cd /workspace/repos/Settleora && npm run generate:clients`
  - Exit 0
  - Result: generated web and Dart clients
- `cd /workspace/repos/Settleora && npm run validate:clients`
  - Exit 0
  - Result: generated client validation passed
- `cd /workspace/repos/Settleora && git diff --check`
  - Exit 0
  - Result: no output

## Scope Guard Result

Pass. Diff is limited to the local backup endpoint/test, the narrow package-generation planning note, the required report, and the unavoidable OpenAPI/generated-client enum updates for the new preview section and fail-closed codes.

No database schema, EF model, migration, Docker/deployment/CI/env, secret, auth/session/security config, storage provider/file-byte runtime, restore apply, sync mutation, browser-local persistence, mobile/admin UI, Day 1 scope reduction, or money/bill/settlement/payment/recurring/OCR/report calculation authority change was made.

## Failures, Blockers, Follow-Ups

- Blocker encountered and resolved within scope: existing OpenAPI enums could not represent the new safe preview section, so narrow enum additions and generated-client refresh were required.
- No validation failures remain.
- Follow-up: PR + merge gate for this branch if review accepts the non-mutating package/preview slice.

## Final Git Status

Final status before commit:

```text
## feature/user-web-local-backup-personal-bill-data-package-preview-461...origin/main
 M docs/planning/USER_WEB_LOCAL_BACKUP_PACKAGE_GENERATION_DOWNLOAD_PLAN.md
 M packages/client-dart/lib/generated/models.dart
 M packages/client-web/src/generated/models.ts
 M packages/contracts/openapi/settleora.v1.yaml
 M services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs
 M services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs
?? .codex/reports/settleora-codex-report-20260630-1828-user-web-local-backup-personal-bill-data-package-preview-461.md
```
