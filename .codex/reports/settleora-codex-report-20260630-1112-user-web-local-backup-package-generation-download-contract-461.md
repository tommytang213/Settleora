# Settleora Codex Report - User Web Local Backup Package Generation/Download Contract (#461)

- Status: `BLOCKED`
- HKT start timestamp: `2026-06-30 11:17:01 HKT`
- HKT end timestamp: `2026-06-30 11:33:14 HKT`
- Elapsed active Codex time: approximately `16 minutes`
- Branch: `feature/user-web-local-backup-package-generation-download-contract-461`
- Base branch: `main`
- Base/main SHA observed: `49926c547c03600499f437fa14c23cf28ef3327a`
- Source/task branch SHA before edits: `49926c547c03600499f437fa14c23cf28ef3327a`
- Integration branch/SHA: not used; task branch is based on `origin/main`
- Commit SHA: pending at report-write time; final commit SHA reported in final response after this report is committed
- Branch pushed: no
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
- Existing local-backup API tests and OpenAPI/generated-client exposure tests in `services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs`
- Latest relevant `.codex/reports`, including package-session and generation/download planning reports
- Active `.ai/*` files, read-only

## Files Changed

- `.codex/reports/settleora-codex-report-20260630-1112-user-web-local-backup-package-generation-download-contract-461.md`
- `docs/planning/USER_WEB_LOCAL_BACKUP_PACKAGE_GENERATION_DOWNLOAD_PLAN.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- `packages/client-web/src/generated/client.ts`
- `packages/client-web/src/generated/models.ts`
- `packages/client-dart/lib/generated/client.dart`
- `packages/client-dart/lib/generated/models.dart`
- `services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs`
- `services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs`
- `/workspace/logs/settleora-codex-report-20260630-1112-user-web-local-backup-package-generation-download-contract-461.md`

## Endpoint Contract Added

- `POST /api/v1/local-backup/package-sessions/{packageSessionId}/prepare`
  - operationId: `prepareLocalBackupPackageSession`
- `GET /api/v1/local-backup/package-sessions/{packageSessionId}/artifact-status`
  - operationId: `getLocalBackupPackageArtifactStatus`
- `POST /api/v1/local-backup/package-sessions/{packageSessionId}/cancel`
  - operationId: `cancelLocalBackupPackageGeneration`
- `POST /api/v1/local-backup/package-sessions/{packageSessionId}/download-actions`
  - operationId: `createLocalBackupPackageDownloadAction`

All new endpoints require `SettleoraAuthorizationPolicies.AuthenticatedUser`, use the current actor/session boundary, and are scoped to the `UserProfileId` and `AuthSessionId` that created the package session.

## OpenAPI Schemas And Enums Added Or Changed

- Added `LocalBackupPackageArtifactStatus`
- Added `LocalBackupPackageArtifactStableCode`
- Added `LocalBackupPackageNextAllowedAction`
- Added `LocalBackupPackageGenerationStatusResponse`
- Added `LocalBackupPackageArtifactStatusResponse`
- Added `LocalBackupPackageDownloadActionResponse`
- Extended `LocalBackupPackageUnsupportedFeature` with `package_artifact`
- Extended `LocalBackupPackageSessionStatus` with `cancelled`
- Extended `LocalBackupPackageSessionStableCode` with `package_session_cancelled`
- Extended `LocalBackupPackageSessionResponse` with nullable `cancelledAtUtc`

The new status/stable-code concepts cover metadata-only/no-artifact posture, generation unsupported/unavailable, download unavailable, cancelled, expired, discarded, and stale/recheck-required code space.

## Generated Client Methods

- Web generated client:
  - `prepareLocalBackupPackageSession`
  - `getLocalBackupPackageArtifactStatus`
  - `cancelLocalBackupPackageGeneration`
  - `createLocalBackupPackageDownloadAction`
- Dart generated client:
  - `prepareLocalBackupPackageSession`
  - `getLocalBackupPackageArtifactStatus`
  - `cancelLocalBackupPackageGeneration`
  - `createLocalBackupPackageDownloadAction`

Generated models were refreshed through `npm run generate:clients`; generated files were not hand-edited.

## Backend And Tests Changed

- Extended `LocalBackupPackageReadinessEndpoints.cs` with metadata-only handlers for prepare, artifact status, cancel, and download-action eligibility.
- `prepare` returns generation unavailable/unsupported metadata and creates no artifact.
- `artifact-status` returns no-artifact metadata and no storage/download fields.
- `cancel` may move only package-session metadata from `created` to `cancelled`; it does not mutate source records or artifacts.
- `download-actions` returns download unavailable metadata and no URL/token/path/byte-stream authority.
- Added focused API coverage for authenticated own-session access, unauthenticated failure, cross-actor failure, cancelled/discarded/expired-safe metadata behavior, request guard rejection, safe response content, and no sync/notification/bill side effects.
- Updated OpenAPI/generated-client exposure checks.

## Explicit Non-Goal Confirmation

Confirmed no package bytes, file bytes, package artifacts, storage objects, storage object keys, bucket names, filesystem paths, local device paths, mounted/temp paths, provider internals, signed/direct URLs, download tokens, content-disposition streaming, restore preview, restore confirmation, package parsing/upload/verification runtime, browser local persistence, user-web runtime UI, mobile/admin UI, EF model/schema/migration, PostgreSQL persistence, RabbitMQ job, Docker/deployment/CI/env, secrets, auth/session/security runtime beyond existing authorization, money/bill/settlement/payment/recurring/OCR/report calculation authority, sync mutation/runtime, or import/export mutation/runtime was added.

## Validation Commands And Exact Results

- `cd /workspace/repos/Settleora; npm ci`
  - Result: passed, exit `0`.
  - Summary: added 2 packages, audited 6 packages, found 0 vulnerabilities.
- `cd /workspace/repos/Settleora; npm run validate:openapi`
  - Result: passed, exit `0`.
  - Summary: Redocly validated `packages/contracts/openapi/settleora.v1.yaml`; API description valid. Redocly printed a newer-version notice.
- `cd /workspace/repos/Settleora; npm run generate:clients`
  - Result: passed, exit `0`.
  - Summary: generated web client in `packages/client-web/src/generated`; generated Dart client in `packages/client-dart/lib/generated`.
- `cd /workspace/repos/Settleora; npm run validate:clients`
  - Result: passed, exit `0`.
  - Summary: generated client validation passed.
- `cd /workspace/repos/Settleora; npm run validate:scaffold`
  - Result: passed, exit `0`.
  - Summary: scaffold validation passed (19 paths).
- `cd /workspace/repos/Settleora; dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter FullyQualifiedName~LocalBackup`
  - First run result: failed, exit `1`, after one new test used an expired artificial auth-session timestamp.
  - Fixed by moving the test timestamp into the valid session window.
  - Final rerun result: passed, exit `0`.
  - Final summary: `Passed! - Failed: 0, Passed: 5, Skipped: 0, Total: 5, Duration: 5 s`.
- `cd /workspace/repos/Settleora; npm run validate:api`
  - Result: blocked/incomplete. The command started `dotnet test services/api/Settleora.Api.sln`, built `Settleora.Api` and `Settleora.Api.Tests`, then the testhost stayed active and silent for more than five minutes. The hung process tree was terminated manually. Session exit reported code `-1`.
  - Last output before termination:
    ```text
    > settleora-scaffold@0.1.0 validate:api
    > dotnet test services/api/Settleora.Api.sln

      Determining projects to restore...
      All projects are up-to-date for restore.
      Settleora.Api -> /workspace/repos/Settleora/services/api/src/Settleora.Api/bin/Debug/net9.0/Settleora.Api.dll
      Settleora.Api.Tests -> /workspace/repos/Settleora/services/api/tests/Settleora.Api.Tests/bin/Debug/net9.0/Settleora.Api.Tests.dll
    Test run for /workspace/repos/Settleora/services/api/tests/Settleora.Api.Tests/bin/Debug/net9.0/Settleora.Api.Tests.dll (.NETCoreApp,Version=v9.0)
    VSTest version 17.12.0 (x64)

    Starting test execution, please wait...
    A total of 1 test files matched the specified pattern.
    ```
- `cd /workspace/repos/Settleora; git diff --check`
  - Result: passed, exit `0`, no output.
- `cd /workspace/repos/Settleora; git status --short --branch`
  - Result: passed, exit `0`.
  - Output before report creation:
    ```text
    ## feature/user-web-local-backup-package-generation-download-contract-461...origin/main
     M docs/planning/USER_WEB_LOCAL_BACKUP_PACKAGE_GENERATION_DOWNLOAD_PLAN.md
     M packages/client-dart/lib/generated/client.dart
     M packages/client-dart/lib/generated/models.dart
     M packages/client-web/src/generated/client.ts
     M packages/client-web/src/generated/models.ts
     M packages/contracts/openapi/settleora.v1.yaml
     M services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs
     M services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs
    ```

## Scope Guard Result

Manual scope guard passed for changed paths. The diff is limited to the requested OpenAPI contract, generated clients, local-backup backend endpoint file, focused API tests, the generation/download planning note, and the required report artifact.

## Failures, Blockers, And Follow-Ups

- Blocker: `npm run validate:api` did not complete and was manually terminated after a silent hang. Focused LocalBackup tests passed after the test timestamp fix.
- No code/runtime blocker was observed in the focused local-backup slice.
- Follow-up: rerun or investigate full `npm run validate:api` before PR/merge gate.

## Final Git Status

Final `git status --short --branch` before staging/commit:

```text
## feature/user-web-local-backup-package-generation-download-contract-461...origin/main
 M docs/planning/USER_WEB_LOCAL_BACKUP_PACKAGE_GENERATION_DOWNLOAD_PLAN.md
 M packages/client-dart/lib/generated/client.dart
 M packages/client-dart/lib/generated/models.dart
 M packages/client-web/src/generated/client.ts
 M packages/client-web/src/generated/models.ts
 M packages/contracts/openapi/settleora.v1.yaml
 M services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs
 M services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs
?? .codex/reports/settleora-codex-report-20260630-1112-user-web-local-backup-package-generation-download-contract-461.md
```

## Recommended Next Action

Investigate or rerun the full `npm run validate:api` hang. After that passes, proceed with PR/merge gate for this contract slice, then use a separate follow-up for backend artifact generation/download runtime only after reviewing this contract.
