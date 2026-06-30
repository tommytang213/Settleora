# Settleora Codex Report - User Web Local Backup Restore Preview Contract/API (#461)

- Status: `READY_FOR_REVIEW`
- HKT start timestamp: `2026-06-30 14:30 HKT`
- HKT end timestamp: `2026-06-30 14:46 HKT`
- Elapsed active Codex time: approximately `16 minutes`
- Branch: `feature/user-web-local-backup-restore-preview-contract-461`
- Base branch: `main`
- Base/main SHA observed: `e8cc2d0f5379f4f2f7739780c7766e8d529df994`
- Source SHA before edits: `e8cc2d0f5379f4f2f7739780c7766e8d529df994`
- Integration branch/SHA: not used; task branch is based on `origin/main`
- Commit SHA: pending until this report is committed
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
- `docs/planning/USER_WEB_SYNC_LOCAL_STATUS_PLAN.md`
- `docs/planning/USER_WEB_SYNC_LOCAL_STATUS_CONTRACT_PLAN.md`
- `docs/architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md`
- `docs/architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- `services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs`
- Existing focused local-backup tests in `services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs`
- Generated-client patterns under `packages/client-web/src/generated/` and `packages/client-dart/lib/generated/`
- Latest relevant `.codex/reports` for PR #617 and #618, plus local-backup package/session/generation reports available in the repo. No local report matching PR #614 was present by PR number.
- Active `.ai/*` files listed in the task setup.

## Files Changed

- `.codex/reports/settleora-codex-report-20260630-1430-user-web-local-backup-restore-preview-contract-461.md`
- `docs/planning/USER_WEB_LOCAL_BACKUP_RESTORE_PLAN.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- `packages/client-web/src/generated/client.ts`
- `packages/client-web/src/generated/models.ts`
- `packages/client-dart/lib/generated/client.dart`
- `packages/client-dart/lib/generated/models.dart`
- `services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs`
- `services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs`
- `/workspace/logs/settleora-codex-report-20260630-1430-user-web-local-backup-restore-preview-contract-461.md`

## OpenAPI Contract Added

Paths and operation IDs:

- `POST /api/v1/local-backup/restore-previews`
  - `createLocalBackupRestorePreview`
- `GET /api/v1/local-backup/restore-previews/{restorePreviewId}`
  - `getLocalBackupRestorePreview`
- `POST /api/v1/local-backup/restore-previews/{restorePreviewId}/discard`
  - `discardLocalBackupRestorePreview`

Schemas/enums added:

- `LocalBackupRestorePreviewCreateRequest`
- `LocalBackupRestorePreviewResponse`
- `LocalBackupRestorePreviewRecordSummary`
- `LocalBackupRestorePreviewStatus`
- `LocalBackupRestorePreviewStableCode`
- `LocalBackupRestorePreviewSectionCategory`
- `LocalBackupRestorePreviewWarning`
- `LocalBackupRestorePreviewBlockedReason`
- `LocalBackupRestorePreviewNextAllowedAction`
- `LocalBackupRestoreConfirmationState`

The request accepts data-only package JSON content as sensitive input plus an optional SHA-256 marker. Normal/problem responses do not echo package content.

## Generated Clients Added

Regenerated with `npm run generate:clients`; generated clients were not hand-edited.

Web client methods:

- `createLocalBackupRestorePreview`
- `getLocalBackupRestorePreview`
- `discardLocalBackupRestorePreview`

Dart client methods:

- `createLocalBackupRestorePreview`
- `getLocalBackupRestorePreview`
- `discardLocalBackupRestorePreview`

Generated web/Dart models include the restore-preview request, response, record summary, statuses, stable codes, section categories, warning/blocked labels, and next-action labels.

## Backend/API Behavior Summary

- Added authenticated process-local restore preview lifecycle endpoints under `/api/v1/local-backup/restore-previews`.
- Restore preview sessions are scoped to the current `UserProfileId` and current `AuthSessionId`.
- `POST /restore-previews` authenticates before reading or parsing package content.
- Accepts current data-only package JSON produced by the existing package download runtime.
- Validates package format name, package version, manifest version, package ID, manifest ID, package session ID, source authority boundary, server-mode posture, generated/expiry timestamps, section inventory, omitted/unsupported markers, optional required features, encrypted/file section states, package size, and optional submitted package SHA-256.
- Creates a short-lived process-local preview only after successful parsing and validation.
- Returns only bounded safe metadata: preview ID/status/stable code, timestamps, source boundary, package/manifest versions, package IDs, package hash, section categories, safe count summaries, warnings, blocked labels, restore-confirmation unsupported state, and next allowed actions.
- `GET` returns the current actor/session preview state, including a safe expired state after expiry.
- `POST /discard` marks only preview metadata discarded and fails closed for expired/discarded/missing/wrong actor/wrong session previews.
- No restore confirmation, import, upload storage, file-byte restore, browser-local persistence, business-record mutation, EF model, migration, durable persistence, or background processing was added.

## Tests Added/Changed

Updated `SyncOfflineServerFoundationEndpointTests.cs` with focused restore-preview coverage:

- Auth gate before parsing package content.
- Valid current data-only package creates safe non-mutating preview metadata.
- Preview read scoped to same actor/profile/session.
- Cross-actor and same-profile wrong-session access fail closed.
- Discard affects only preview metadata.
- Expired preview returns safe expired/unavailable state and discard fails closed.
- Missing package content, invalid request JSON, invalid package JSON, unsupported package version, hash mismatch, encrypted-section marker, and expired package fail closed without echoing package content.
- Responses/problem details exclude storage paths, object keys, signed/direct URLs, filesystem/local/temp paths, provider internals, file bytes, raw OCR text, raw notes, package payload, tokens, hidden details, and local Codex state.
- Existing OpenAPI/generated-client exposure test now asserts the new restore-preview operations and models.

## Documentation Update

Added a short implementation update to `docs/planning/USER_WEB_LOCAL_BACKUP_RESTORE_PLAN.md` recording the chosen endpoint names and explicitly preserving:

- data-only package parsing/validation only;
- non-mutating restore preview;
- restore confirmation as a separate future mutation gate;
- unsupported browser local-mode persistence;
- separate future work for file-byte, encrypted-section, durable storage, and server/local business-record restore.

## Explicit Non-Goal Confirmation

Confirmed no restore confirmation, bill/money/settlement/payment/recurring/OCR/report mutation, data import mutation, sync mutation/runtime, package upload storage, durable restore preview persistence, durable/encrypted package storage, file-byte sections, storage provider internals, storage object keys, bucket names, provider paths, signed/direct URLs, mounted/temp/filesystem/local paths, browser local persistence, `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, service workers, object URLs, File System Access API, fake browser-local authority, user-web runtime wiring, mobile/admin UI, EF models, database schema, migrations, PostgreSQL persistence, RabbitMQ/background jobs, Docker/deployment/CI/environment/secrets/auth config, direct `main` edit/push, branch cleanup/deletion, force push, or Day 1 scope reduction was added.

## Validation Commands And Exact Results

- `git status --short --branch`
  - Result: passed, exit `0`.
  - Output before report:
    ```text
    ## feature/user-web-local-backup-restore-preview-contract-461
     M docs/planning/USER_WEB_LOCAL_BACKUP_RESTORE_PLAN.md
     M packages/client-dart/lib/generated/client.dart
     M packages/client-dart/lib/generated/models.dart
     M packages/client-web/src/generated/client.ts
     M packages/client-web/src/generated/models.ts
     M packages/contracts/openapi/settleora.v1.yaml
     M services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs
     M services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs
    ```
- `git diff --name-only origin/main...HEAD`
  - Result: passed, exit `0`.
  - Output before commit: no output because changes were not committed yet.
- `git diff --check origin/main...HEAD`
  - Result: passed, exit `0`, no output before commit.
- `npm ci`
  - Result: passed, exit `0`.
  - Output summary: `added 2 packages, and audited 6 packages`; `found 0 vulnerabilities`.
- `npm run validate:openapi`
  - Result: passed, exit `0`.
  - Output summary: `packages/contracts/openapi/settleora.v1.yaml: validated`; `Woohoo! Your API description is valid.`
  - Redocly printed a newer-version notice.
- `npm run generate:clients`
  - Result: passed, exit `0`.
  - Output summary: generated web client in `packages/client-web/src/generated`; generated Dart client in `packages/client-dart/lib/generated`.
- `npm run validate:clients`
  - Result: passed, exit `0`.
  - Output summary: generated client validation passed.
- `npm run validate:scaffold`
  - Result: passed, exit `0`.
  - Output summary: `Scaffold validation passed (19 paths).`
- `dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter FullyQualifiedName~LocalBackup`
  - Result: passed, exit `0`.
  - Output summary: `Passed! - Failed: 0, Passed: 8, Skipped: 0, Total: 8, Duration: 6 s`.
- `timeout 900 npm run validate:api`
  - Result: passed, exit `0`.
  - Output summary: `Passed! - Failed: 0, Passed: 1187, Skipped: 0, Total: 1187, Duration: 4 m 28 s`.
- `git diff --check`
  - Result: passed, exit `0`, no output.

Additional focused implementation runs:

- `dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter FullyQualifiedName~LocalBackup --no-restore`
  - Final focused result before exact command: passed, exit `0`, `Passed: 8`.

## Scope Guard Result

Passed. The diff is scoped to local-backup restore-preview OpenAPI contract, generated web/Dart clients, process-local backend/API behavior, focused API tests, a narrow planning note, and the required report.

No forbidden direct `main` push, force push, branch deletion, secrets, `.env`, local Codex state, Docker/deployment/CI/env change, auth config, schema/migration, storage provider internals, storage object key/path, signed URL/direct URL, browser-local persistence, user-web runtime wiring, restore confirmation, sync/import/export mutation runtime, mobile/admin UI, money/bill/settlement/payment/recurring/OCR/report calculation-authority change, or Day 1 scope reduction was made.

## Failures, Blockers, And Follow-Ups

- No blocker remains.
- During implementation, focused tests initially failed because the section-name guard treated `profile` as a file section; the guard was narrowed to actual file/blob section labels.
- During implementation, safety assertions caught `secret`/`credential` category words in response boundary copy; runtime response copy was changed to generic security/auth material wording.
- Follow-ups remain separate gates: restore confirmation, durable/encrypted package storage, file-byte sections, package upload/storage, browser-local persistence, and user-web runtime wiring.

## Final Git Status

At report-write time the worktree contains the intended uncommitted files listed above plus this report file. Final committed/pushed status is reported in the Codex final response after commit and push.

## Recommended Next Action

Review the scoped restore-preview contract/API branch and open a PR. Do not merge to `main` directly from this task.
