# Settleora Codex Report - User Web Local Backup Restore Confirmation Contract/API (#461)

## Status

- Task status: implementation complete; post-commit/push addendum required below after final push.
- Branch: `feature/user-web-local-backup-restore-confirmation-contract-461`
- Base/main SHA observed: `238d8eb143dfe7eb6d276ca2a722296f8164d680`
- Source SHA before edits: `238d8eb143dfe7eb6d276ca2a722296f8164d680`
- Integration SHA observed: `d3f458b146bc5c5621478aceba8d26f69b5d434a`
- Final commit SHA: post-commit addendum required.
- Branch pushed: post-commit addendum required.
- PR URL: not created.
- HKT start timestamp: 2026-06-30 16:55 HKT
- HKT report timestamp before commit: 2026-06-30 17:11 HKT
- Elapsed before commit: about 16 minutes.

## Required Reading

Completed from current repo files:

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
- `packages/contracts/openapi/settleora.v1.yaml`
- `services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs`
- `services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs`
- Generated-client patterns under `packages/client-web/src/generated/` and `packages/client-dart/lib/generated/`
- Relevant `.codex/reports/*local-backup*` report listing, including local backup package/session/generation/restore-preview/restore-confirmation planning reports present in the repo
- Active `.ai/*` files as read-only context

## Files Changed

- `.codex/reports/settleora-codex-report-20260630-1655-user-web-local-backup-restore-confirmation-contract-461.md`
- `docs/planning/USER_WEB_LOCAL_BACKUP_RESTORE_CONFIRMATION_CONTRACT_PLAN.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- `packages/client-web/src/generated/client.ts`
- `packages/client-web/src/generated/models.ts`
- `packages/client-dart/lib/generated/client.dart`
- `packages/client-dart/lib/generated/models.dart`
- `services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs`
- `services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs`

## Endpoint Paths And Operation IDs Added

- `POST /api/v1/local-backup/restore-previews/{restorePreviewId}/confirmation-sessions`
  - `createLocalBackupRestoreConfirmationSession`
- `GET /api/v1/local-backup/restore-confirmation-sessions/{restoreConfirmationSessionId}`
  - `getLocalBackupRestoreConfirmationSession`
- `POST /api/v1/local-backup/restore-confirmation-sessions/{restoreConfirmationSessionId}/discard`
  - `discardLocalBackupRestoreConfirmationSession`

## OpenAPI Schemas And Enums Added

- `LocalBackupRestoreConfirmationSessionCreateRequest`
- `LocalBackupRestoreConfirmationSessionResponse`
- `LocalBackupRestoreConfirmationSessionStatus`
- `LocalBackupRestoreConfirmationSessionStableCode`
- `LocalBackupRestoreConfirmationSelectedScope`
- `LocalBackupRestoreConfirmationMutationAvailability`
- `LocalBackupRestoreConfirmationNextAllowedAction`
- Extended `LocalBackupRestoreConfirmationState` with metadata-only readback states.

## Generated Clients

Generated through `npm run generate:clients`; no generated clients were hand-edited.

Added generated methods:

- Web: `createLocalBackupRestoreConfirmationSession`, `getLocalBackupRestoreConfirmationSession`, `discardLocalBackupRestoreConfirmationSession`
- Dart: `createLocalBackupRestoreConfirmationSession`, `getLocalBackupRestoreConfirmationSession`, `discardLocalBackupRestoreConfirmationSession`

Added generated models/enums:

- Web/Dart models for `LocalBackupRestoreConfirmationSessionCreateRequest` and `LocalBackupRestoreConfirmationSessionResponse`
- Web/Dart string enum value sets for confirmation status, stable code, selected scope, mutation availability, next allowed actions, and expanded confirmation state.

## Backend/API Behavior Summary

- Added process-local restore confirmation session metadata storage scoped to current `UserProfileId` and current `AuthSessionId`.
- All new endpoints require `SettleoraAuthorizationPolicies.AuthenticatedUser`.
- Create requires an existing current-actor/current-session restore preview in `ready` status.
- Create fails closed for missing, wrong actor/session, expired/discarded preview, unsupported scope, wrong confirmation label, preview stable-code mismatch, package SHA mismatch, request digest mismatch, and idempotency conflict.
- Create returns metadata only with `canApplyRestore: false`, `mutationAvailability: unavailable`, and `restoreConfirmationState: future_gate_required`.
- GET returns safe metadata for the same actor/profile/session and marks expired sessions as safe unavailable metadata.
- Discard marks only confirmation-session metadata discarded and does not discard previews, packages, records, files, bills, settlements, sync conflicts, accounts, or audit truth.
- Implemented process-local idempotency for optional `idempotencyKey`: same key plus same digest replays the existing session; same key with different preview/digest/scope fails closed with `409`.

## Tests Added/Changed

Updated `SyncOfflineServerFoundationEndpointTests.cs` to cover:

- Auth gate for confirmation create/read/discard.
- OpenAPI path, operation ID, schema, stable-code, and generated-client exposure.
- Creation from valid preview returns safe metadata and `canApplyRestore: false`.
- Same actor/profile/session scoping for read and discard.
- Wrong actor and wrong auth session fail closed.
- Missing/expired/discarded preview fail closed.
- Invalid selected scope and mismatched package SHA fail closed.
- Idempotent replay and mismatched same-key conflict.
- Expired confirmation sessions return safe unavailable readback.
- Discard affects only confirmation-session metadata.
- Problem/details and responses avoid raw package content, storage paths, object keys, signed/direct URLs, filesystem/local/temp paths, provider internals, file bytes, raw OCR text, raw notes, payment details, tokens, hidden details, and local Codex state.
- No sync, notification, bill, settlement, or business-record side effects.

## Documentation Update

Added a narrow implementation update to `docs/planning/USER_WEB_LOCAL_BACKUP_RESTORE_CONFIRMATION_CONTRACT_PLAN.md` recording the chosen endpoint names and explicitly preserving:

- metadata-only/non-mutating confirmation session contract/API added;
- restore confirmation mutation remains a separate future gate;
- user-web confirmation runtime remains separate;
- durable/encrypted package storage, file-byte sections, package upload/storage, and browser-local persistence remain separate future gates.

## Explicit Non-Goal Confirmation

No restore confirmation mutation was added. No bill/money/settlement/payment/recurring/OCR/report mutation, data import mutation, sync mutation/runtime, package upload/storage, durable restore-confirmation persistence, durable/encrypted package storage, file-byte sections, storage provider internals, storage keys/paths/URLs, browser local persistence, user-web runtime/UI/tests, mobile/admin UI, EF models, database schema, migrations, PostgreSQL persistence, RabbitMQ/background jobs/workers, Docker/deployment/CI/env/secrets/auth config, direct main edit/push, force push, branch cleanup/deletion, Day 1 scope reduction, or production/security/destructive/manual-gated work was performed.

## Validation Commands And Results

- `cd /workspace/repos/Settleora; git status --short --branch`
  - Passed; branch `feature/user-web-local-backup-restore-confirmation-contract-461`, expected scoped modified files.
- `cd /workspace/repos/Settleora; git diff --name-only`
  - Passed; listed scoped docs/OpenAPI/generated-client/API/test files.
- `cd /workspace/repos/Settleora; git diff --check`
  - Passed; no output.
- `cd /workspace/repos/Settleora; npm ci`
  - Passed; added 2 packages, audited 6 packages, 0 vulnerabilities.
- `cd /workspace/repos/Settleora; npm run validate:openapi`
  - Passed; Redocly validated `settleora.v1.yaml`.
- `cd /workspace/repos/Settleora; npm run generate:clients`
  - Passed; regenerated web and Dart clients.
- `cd /workspace/repos/Settleora; npm run validate:clients`
  - Passed; generated client validation passed.
- `cd /workspace/repos/Settleora; npm run validate:scaffold`
  - Passed; scaffold validation passed for 19 paths.
- `cd /workspace/repos/Settleora; dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter FullyQualifiedName~LocalBackup`
  - Passed; 11 passed, 0 failed, 0 skipped, duration 7 s.
- `cd /workspace/repos/Settleora; timeout 900 npm run validate:api`
  - Passed; 1190 passed, 0 failed, 0 skipped, duration 5 m 2 s.
- `cd /workspace/repos/Settleora; git diff --check`
  - Passed; no output.

Additional implementation check before final sequence:

- `dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter FullyQualifiedName~LocalBackup --no-restore`
  - Passed; 11 passed, 0 failed, 0 skipped.

## Scope Guard Result

Scope guard passed by review of changed paths and diff. Changes are limited to the restore-confirmation metadata-only OpenAPI/backend/API/test/docs/generated-client slice plus this required report. The diff does not touch forbidden runtime, API security configuration, money/bill/settlement calculation authority, schema/migrations, storage/file-byte behavior, deployment/CI/env, secrets, browser persistence, user-web runtime, mobile/admin UI, direct main, force push, or branch cleanup.

## Failures, Blockers, Follow-Ups

- No validation failures.
- No blockers.
- Follow-up: separate future gate for actual restore confirmation mutation, separate user-web confirmation runtime gate, separate durable/encrypted package storage/file-byte/package upload/browser-local persistence gates.

## Final Git Status Before Commit

Pre-commit status showed the scoped modified files listed above plus this report. Post-commit/push status will be appended after push.

## Next Recommended Action

Review the pushed branch diff. Do not treat generated-client availability as restore authority; runtime restore confirmation mutation remains a future explicit gate.

## Post-Commit/Push Addendum

- HKT end timestamp: 2026-06-30 17:13 HKT
- Total elapsed time: about 18 minutes.
- Final commit SHA: `2c0b12e2f5861686b01a10698c0966d2ff00a5fe`
- Task branch pushed: yes.
- Pushed branch: `origin/feature/user-web-local-backup-restore-confirmation-contract-461`
- Pushed branch SHA: `2c0b12e2f5861686b01a10698c0966d2ff00a5fe`
- PR URL: not created.
- Commit message: `feat(api): add local backup restore confirmation session contract`
- Final post-push status immediately after upstream correction: branch tracked `origin/feature/user-web-local-backup-restore-confirmation-contract-461` with no staged or unstaged source changes before this local post-push addendum was appended.
- Final report/log copy status: this addendum was appended after push so the local report and `/workspace/logs` copy include final SHA/push evidence.
