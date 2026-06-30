# Settleora Codex Report - User Web Local Backup Package Data Artifact Runtime (#461)

- Status: `READY_FOR_REVIEW`
- HKT start timestamp: `2026-06-30 13:12:00 HKT`
- HKT end timestamp: `2026-06-30 13:28:35 HKT`
- Elapsed active Codex time: approximately `17 minutes`
- Branch: `feature/user-web-local-backup-package-data-artifact-runtime-461`
- Base branch: `main`
- Base/main SHA observed: `e39c54f714f472c8ae83c05ac41e8982ebc64a7f`
- Source branch SHA before edits: `e39c54f714f472c8ae83c05ac41e8982ebc64a7f`
- Integration branch/SHA: not used; task branch is based on `origin/main`
- Final branch HEAD SHA: pending until this report is committed; final pushed HEAD SHA is reported in the Codex final response
- Branch pushed: pending at report-write time; final push result is reported in the Codex final response
- PR URL: not created

## Files Changed

- `.codex/reports/settleora-codex-report-20260630-1312-user-web-local-backup-package-data-artifact-runtime-461.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- `packages/client-web/src/generated/client.ts`
- `packages/client-web/src/generated/models.ts`
- `packages/client-dart/lib/generated/client.dart`
- `packages/client-dart/lib/generated/models.dart`
- `services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs`
- `services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs`
- `/workspace/logs/settleora-codex-report-20260630-1312-user-web-local-backup-package-data-artifact-runtime-461.md`

## Contract/API Changes

- Added authenticated binary/content endpoint:
  - `GET /api/v1/local-backup/package-sessions/{packageSessionId}/download-actions/{downloadActionId}/content`
  - operation ID: `downloadLocalBackupPackageContent`
  - content type: `application/vnd.settleora.local-backup+json`
- Extended prepare, artifact-status, and download-action metadata with ready/download states plus safe filename, content type, byte length, artifact expiry, package SHA-256, download action ID, action expiry, and same-API relative content path.
- No storage URLs, signed URLs, object keys, bucket names, filesystem paths, provider internals, or reusable raw tokens were added.

## Generated-Client Changes

- Regenerated web and Dart clients with `npm run generate:clients`.
- Web client now exposes `downloadLocalBackupPackageContent(...): Promise<Blob>`.
- Dart client now exposes `downloadLocalBackupPackageContent(...): Future<List<int>>`.
- Generated models include the new ready/download enum values and nullable artifact/download metadata fields.
- Generated clients were not hand-edited.

## Runtime Behavior Summary

- Package sessions remain process-local and scoped to both current `UserProfileId` and current `AuthSessionId`.
- `prepare` revalidates the current actor/profile policy and creates a short-lived process-local data-only JSON artifact only for a valid current session.
- `artifact-status` reports ready/expired/cancelled/discarded/blocked states and safe artifact metadata.
- `download-actions` creates a short-lived same-API download action only for a ready artifact.
- Content download requires the same actor/profile/auth session, an unexpired artifact, and an unexpired unused download action; consumed, expired, discarded, cancelled, cross-actor, and unavailable states fail closed.
- Cancellation/discard/expiry clears only package session/artifact/download-action runtime state and does not mutate source records.

Process-local limitation: artifacts and download actions are in-memory only. They are intentionally short-lived, bounded by session/artifact/action expiry, and are lost on process restart. No durable storage, storage provider behavior, EF models, or migrations were added.

## Package Format/Content Summary

- Format: `settleora.local-backup.data-only`
- Package version: `2026-06-30.data-only.v1`
- Manifest version: `2026-06-30.manifest.v1`
- Includes package/session/correlation IDs, source authority boundary, server-mode posture, generated/expiry timestamps, section inventory, omitted/unsupported section markers, safe current-profile summary, safe personal-bill count summaries, per-section SHA-256 markers, and package SHA-256.
- Explicitly omits or marks unsupported file/blob sections, raw OCR text, private notes, payment details, restore preview/confirmation, browser local persistence, and local-mode authority.
- Package content excludes storage paths, object keys, bucket names, signed/direct URLs, filesystem/local/temp/mounted paths, provider internals, file bytes, raw OCR text, hidden record details, raw auth material, and credential material.

## Explicit Non-Goal Confirmation

No restore preview, restore confirmation, package upload/parsing/verification runtime, browser local persistence, IndexedDB/localStorage/sessionStorage/Cache Storage/service worker/object URL/file-system API behavior, user-web UI wiring, mobile/admin UI, file byte inclusion, storage provider internals, new EF models, migrations, PostgreSQL artifact persistence, RabbitMQ/background jobs, Docker/deployment/CI/env changes, secrets/auth config, money/bill/settlement/payment/recurring/OCR/report calculation authority changes, sync mutation/runtime, import/export mutation/runtime, or Day 1 scope reduction was added.

## Validation Commands And Exact Results

- `git status --short --branch`
  - Result: passed, exit `0`.
  - Output before report:
    ```text
    ## feature/user-web-local-backup-package-data-artifact-runtime-461...origin/main
     M packages/client-dart/lib/generated/client.dart
     M packages/client-dart/lib/generated/models.dart
     M packages/client-web/src/generated/client.ts
     M packages/client-web/src/generated/models.ts
     M packages/contracts/openapi/settleora.v1.yaml
     M services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs
     M services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs
    ```
- `git diff --name-only origin/main...HEAD`
  - Result: passed, exit `0`, no output before commit because changes were not yet committed.
- `git diff --check origin/main...HEAD`
  - Result: passed, exit `0`, no output before commit because changes were not yet committed.
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
- `git status --short`
  - Result: passed, exit `0`.
  - Output before report:
    ```text
     M packages/client-dart/lib/generated/client.dart
     M packages/client-dart/lib/generated/models.dart
     M packages/client-web/src/generated/client.ts
     M packages/client-web/src/generated/models.ts
     M packages/contracts/openapi/settleora.v1.yaml
     M services/api/src/Settleora.Api/LocalBackup/LocalBackupPackageReadinessEndpoints.cs
     M services/api/tests/Settleora.Api.Tests/SyncOfflineServerFoundationEndpointTests.cs
    ```
- `npm run validate:clients`
  - Result: passed, exit `0`.
  - Output summary: generated client validation passed.
- `npm run validate:scaffold`
  - Result: passed, exit `0`.
  - Output summary: scaffold validation passed for 19 paths.
- `dotnet test services/api/tests/Settleora.Api.Tests/Settleora.Api.Tests.csproj --filter FullyQualifiedName~LocalBackup`
  - Result: passed, exit `0`.
  - Output summary: `Passed! - Failed: 0, Passed: 5, Skipped: 0, Total: 5, Duration: 4 s`.
- `timeout 900 npm run validate:api`
  - Result: passed, exit `0`.
  - Output summary: `Passed! - Failed: 0, Passed: 1184, Skipped: 0, Total: 1184, Duration: 5 m 1 s`.
- `git diff --check`
  - Result: passed, exit `0`, no output.

## Scope Guard Result

Passed. The diff is scoped to local-backup backend runtime, OpenAPI contract, generated clients, focused API tests, and the required report. No forbidden runtime, API, security, money, schema, deployment, or secret changes were made outside the requested local-backup artifact/download runtime and OpenAPI/generated-client surface.

## Failures, Blockers, And Follow-Ups

- No blocker remains.
- During implementation, focused tests first failed while assertions still expected metadata-only unavailable behavior; tests were updated to assert ready artifact/download/content behavior.
- During implementation, an EF grouped projection against the in-memory test provider failed translation; the final projection was moved client-side after the grouped count query.
- Follow-up: durable/encrypted package storage, file-byte sections, restore preview, restore confirmation, browser-local persistence, and user-web runtime wiring remain separate gates.

## Recommended Next Action

Open a review PR for this branch. Do not merge to `main` directly.
