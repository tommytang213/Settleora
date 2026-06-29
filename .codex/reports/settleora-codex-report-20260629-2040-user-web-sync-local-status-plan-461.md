# Settleora Codex Report - User Web Sync / Local Status Planning Gate (#461)

- Status: `READY_FOR_REVIEW`
- HKT start timestamp from prompt: `2026-06-29 20:40 HKT`
- HKT end timestamp from prompt: `2026-06-29 20:40 HKT`
- Actual report completion timestamp: `2026-06-29 20:42 HKT`
- Elapsed time: prompt timestamps indicate `0 minutes`; actual task elapsed approximately `3 minutes` from requested HKT timestamp to report completion.
- Branch name: `docs/user-web-sync-local-status-plan-461`
- Base branch: `main`
- Base/main SHA: `d240e929eaad9cb65bb6111a215795b0e530b19a`
- Source branch SHA before commit: `d240e929eaad9cb65bb6111a215795b0e530b19a`
- Integration branch: `ai/integration` (not used as task base)
- Integration SHA: not used
- Task commit SHA(s): pending until commit
- Branch pushed: pending
- PR URL: not created

## Files Changed

- `docs/planning/USER_WEB_SYNC_LOCAL_STATUS_PLAN.md`
- `docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md`
- `.codex/reports/settleora-codex-report-20260629-2040-user-web-sync-local-status-plan-461.md`
- `/workspace/logs/settleora-codex-report-20260629-2040-user-web-sync-local-status-plan-461.md`

## Required Reading Completed

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- `docs/prd/MVP_DAY1_SCOPE.md`
- `docs/prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md`
- `docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md`
- `docs/planning/USER_WEB_EXPORT_READINESS_CONTRACT_PLAN.md`
- `docs/planning/USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md`
- `docs/planning/USER_WEB_IMPORT_CONFIRMATION_CONTRACT_PLAN.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- `packages/client-web/src/generated/client.ts`
- `packages/client-web/src/generated/models.ts`
- `apps/web-user/src/importExportReadout.ts`
- `apps/web-user/src/importExportReadout.test.ts`
- Active `.ai/*` files present: `.ai/current-milestone.md`, `.ai/state.json`, `.ai/task-queue.json`, `.ai/qa-findings.json`, `.ai/qa-report.md`, and `.ai/prompts/*`
- Latest relevant `.codex/reports/*import*`, `*export*`, and `*import-export*` reports for #461, including the export/import/local-mode plan, availability readout, export readiness/runtime, import preflight plan/contract/runtime, import confirmation plan/contract/runtime, and related merge reports.

## Summary Of Planning Decisions

- Added `docs/planning/USER_WEB_SYNC_LOCAL_STATUS_PLAN.md` as a docs-only planning/control gate for remaining #461 sync/local status, local backup/restore, and browser local-mode persistence direction.
- Defined a read-only Day 1 user-web sync/local status posture: show honest server-connected, unauthenticated, session, offline, unavailable, and unsupported states without fake local mode, fake queues, fake backups, or fake data.
- Distinguished server mode from local-only mode: server mode remains API/domain-authoritative, while browser local-only mode is unsupported until a reviewed persistence/security design exists.
- Documented why user web must not pretend browser local mode exists without reviewed encryption, retention, migration, backup/restore, and device-loss behavior.
- Proposed future server-derived read-only status fields and stable codes, while noting these are planning names and not approved OpenAPI enums.
- Covered failure states for no auth, no session, server unavailable, offline, stale local data, sync conflict, failed sync, unsupported local mode, and unsupported backup/restore.
- Preserved privacy and authorization boundaries for sync changes, import/export history, local history, backup/restore, storage/file data, and browser persistence.
- Documented local backup/restore as a separate package/encryption/file-handling/restore-preview gate, not an extension of CSV export/import.
- Added a cross-link from the broader user-web export/import/local-mode implementation plan to the new sync/local status plan.

## Current Generated-Client Sync/Local/Import/Export Methods Inspected

- Sync/local-adjacent:
  - `listSyncChanges`
  - `submitSyncOperation`
  - `getSyncOperation`
  - `SyncOperationType`: `bill_archive`, `bill_restore`
  - `SyncResourceType`: `expense_bill`
  - `SyncOperationStatus`: `accepted`, `replayed`, `rejected`, `conflict`
  - `SyncChangeKind`: `updated`, `archived`, `restored`
  - `SyncState`: `queued`, `synced`, `conflict`, `failed`
- Export:
  - `getPersonalBillExportReadiness`
  - `exportPersonalBillsCsv`
  - `exportPersonalBillsJson`
  - `getGroupBillExportReadiness`
  - `exportGroupBillsCsv`
  - `exportGroupBillsJson`
- Import:
  - `preflightPersonalBillsCsvImport`
  - `preflightGroupBillsCsvImport`
  - `createPersonalBillCsvImportSession`
  - `createGroupBillCsvImportSession`
  - `getBillCsvImportSession`
  - `confirmBillCsvImportSession`
  - `discardBillCsvImportSession`
  - direct mutation methods `importPersonalBillsCsv` and `importGroupBillsCsv`, which remain intentionally not used by user-web runtime.
- Local backup/restore:
  - No browser local backup package, restore preview, restore confirmation, browser-local profile, browser-local bill store, browser-local queue history, or local-to-server migration generated-client methods were found.

## Validation Commands And Exact Results

- `cd /workspace/repos/Settleora; git status --short`
  - Exit code: 0
  - Output:

    ```text
     M docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md
    ?? docs/planning/USER_WEB_SYNC_LOCAL_STATUS_PLAN.md
    ```

  - Note: `.codex/reports` is ignored by default and was force-staged later
    as the required report artifact.
- `cd /workspace/repos/Settleora; git diff --name-only`
  - Exit code: 0
  - Output:

    ```text
    docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md
    ```

  - Note: this command lists tracked diff paths only before staging; the new
    planning doc appears in `git status --short` until added.
- `cd /workspace/repos/Settleora; git diff --check`
  - Exit code: 0
  - Output: no output.
- `cd /workspace/repos/Settleora; npm run validate:docs`
  - Exit code: 0
  - Output:

    ```text
    > settleora-scaffold@0.1.0 validate:docs
    > node tools/validate-docs.mjs

    Documentation validation passed.
    ```

- `cd /workspace/repos/Settleora; npm run validate:scaffold`
  - Exit code: 0
  - Output:

    ```text
    > settleora-scaffold@0.1.0 validate:scaffold
    > node tools/validate-scaffold.mjs

    Scaffold validation passed (19 paths).
    ```

## Scope Guard Confirmation

Scope stayed documentation-only. No runtime app code, OpenAPI contracts,
generated clients, backend/API behavior, database schema/migrations,
auth/session/security runtime, storage/file-byte behavior, sync runtime,
sync mutation, local backup/restore, browser local-mode persistence,
money/settlement/payment/bill calculation logic, Docker, deployment, CI,
environment, mobile, admin web, or secrets were changed.

No calls or runtime wiring were added for `listSyncChanges`,
`submitSyncOperation`, or `getSyncOperation`. No localStorage, sessionStorage,
IndexedDB, browser-cache, service-worker, file-system, local backup, restore,
offline persistence, fake local mode, fake sync status, fake sessions, fake
users, fake groups, fake import/export state, or fake data were added.

## Blockers And Follow-Ups

- Blockers: none for this docs-only planning gate.
- Follow-up 1: sync/local status contract plan.
- Follow-up 2: sync/local status OpenAPI/API read contract with generated clients.
- Follow-up 3: user-web read-only sync/local status runtime against that contract.
- Follow-up 4: sync operation history/conflict review plan before any mutation or conflict-resolution UI.
- Follow-up 5: local backup/restore package contract plan with encryption, file-handling, restore-preview, migration, privacy, and audit gates.
- Follow-up 6: browser local-mode persistence/security design before any IndexedDB/localStorage/sessionStorage/cache/service-worker/file-system persistence.

## Final Worktree Status

Pending commit and push at report-update time. Intended staged paths are the
two planning docs plus the forced `.codex` report artifact. The external
`/workspace/logs` report copy is written but is outside the Git worktree.
