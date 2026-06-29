# Settleora Codex Report - User Web Sync / Local Status Contract Plan (#461)

- Status: `READY_FOR_REVIEW`
- HKT start timestamp from prompt: `2026-06-29 21:02 HKT`
- HKT end timestamp: `2026-06-29 21:04 HKT`
- Elapsed time: approximately `2 minutes` from prompt timestamp to report completion
- Repository path: `/workspace/repos/Settleora`
- Branch name: `docs/user-web-sync-local-status-contract-plan-461`
- Base branch: `main`
- Base/main SHA: `9561aafe360a340ad25e97539afed37f3c1f6ea2`
- Source branch SHA before commit: `9561aafe360a340ad25e97539afed37f3c1f6ea2`
- Integration branch: `ai/integration` was not used as task base
- Integration SHA: not applicable
- Task commit SHA(s): `3f77b0d8af16b1bae5aa6895a72096794bae9365`
- Branch pushed: no
- PR URL: not created

## Files Changed

- `docs/planning/USER_WEB_SYNC_LOCAL_STATUS_CONTRACT_PLAN.md`
- `docs/planning/USER_WEB_SYNC_LOCAL_STATUS_PLAN.md`
- `docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md`
- `.codex/reports/settleora-codex-report-20260629-2102-user-web-sync-local-status-contract-plan-461.md`
- `/workspace/logs/settleora-codex-report-20260629-2102-user-web-sync-local-status-contract-plan-461.md`

## Required Reading Completed

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- `docs/prd/MVP_DAY1_SCOPE.md`
- `docs/prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md`
- `docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md`
- `docs/planning/USER_WEB_SYNC_LOCAL_STATUS_PLAN.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- `packages/client-web/src/generated/client.ts`
- `packages/client-web/src/generated/models.ts`
- `apps/web-user/src/importExportReadout.ts`
- `apps/web-user/src/importExportReadout.test.ts`
- Latest relevant `.codex/reports/*sync*`, `*local*`, `*import-export*`, `*import*`, and `*export*` reports, including the #604 merge report and the prior #461 import/export/runtime/contract reports.
- Active `.ai/*` files present: `.ai/current-milestone.md`, `.ai/state.json`, `.ai/task-queue.json`, `.ai/qa-findings.json`, `.ai/qa-report.md`, and `.ai/prompts/*`.

## Summary Of Planning Decisions

- Added `docs/planning/USER_WEB_SYNC_LOCAL_STATUS_CONTRACT_PLAN.md` as a docs-only contract planning gate for future user-web sync/local status reads.
- Documented why `listSyncChanges`, `submitSyncOperation`, and `getSyncOperation` are not sufficient approval for a user-web status surface.
- Defined planning-only endpoint concepts for a future read-only sync/local status family without editing OpenAPI.
- Distinguished server-connected, unauthenticated, no server session, offline, server unavailable, and unsupported browser local-mode states.
- Proposed planning-only response concepts and stable display/problem code families, including server mode active, local mode unsupported, backup unsupported, sync unavailable, conflict present, failed sync present, stale local data, and no server session.
- Preserved API/domain authority for sync truth, local/server profile mode, authorization, conflicts, failed syncs, audit, and all mutation acceptance.
- Defined safe disclosure boundaries to avoid unauthorized sync records, hidden data, file/storage paths, object keys, receipt/proof/QR/statement contents, raw import/export data, secrets, tokens, raw payloads, and hidden record details.
- Kept browser local mode unsupported until separate persistence, security, encryption, retention, device-loss, migration, and browser storage design exists.
- Kept local backup/restore as a separate package, encryption, file-handling, restore-preview, conflict, migration, and audit gate.
- Added narrow cross-links from the existing sync/local status and export/import/local-mode plans.

## Generated Sync/Local/Import/Export Methods Inspected

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
  - direct mutation methods `importPersonalBillsCsv` and `importGroupBillsCsv`, which remain intentionally not used by the user-web status contract plan.
- Local backup/restore:
  - No browser local backup package, restore preview, restore confirmation, browser-local profile, browser-local bill store, browser-local queue history, or local-to-server migration generated-client methods were found.

## Validation Commands And Exact Results

- `cd /workspace/repos/Settleora && git fetch origin main --prune && git checkout -B docs/user-web-sync-local-status-contract-plan-461 origin/main && git status --short && git rev-parse origin/main`
  - Exit code: 0
  - Result: branch reset from `origin/main`; `git status --short` had no output; `origin/main` was `9561aafe360a340ad25e97539afed37f3c1f6ea2`, matching the expected base after PR #604.
- `cd /workspace/repos/Settleora && git status --short`
  - Exit code: 0
  - Output before staging:

    ```text
     M docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md
     M docs/planning/USER_WEB_SYNC_LOCAL_STATUS_PLAN.md
    ?? docs/planning/USER_WEB_SYNC_LOCAL_STATUS_CONTRACT_PLAN.md
    ```

- `cd /workspace/repos/Settleora && git diff --name-only`
  - Exit code: 0
  - Output before staging:

    ```text
    docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md
    docs/planning/USER_WEB_SYNC_LOCAL_STATUS_PLAN.md
    ```

  - Note: the new planning doc was untracked at this point and appeared in `git status --short`.
- `cd /workspace/repos/Settleora && git diff --check`
  - Exit code: 0
  - Output: no output.
- `cd /workspace/repos/Settleora && npm run validate:docs`
  - Exit code: 0
  - Output:

    ```text
    > settleora-scaffold@0.1.0 validate:docs
    > node tools/validate-docs.mjs

    Documentation validation passed.
    ```

- `cd /workspace/repos/Settleora && npm run validate:scaffold`
  - Exit code: 0
  - Output:

    ```text
    > settleora-scaffold@0.1.0 validate:scaffold
    > node tools/validate-scaffold.mjs

    Scaffold validation passed (19 paths).
    ```

## Scope Guard Confirmation

Scope stayed documentation-only. No runtime app code, OpenAPI paths/schemas,
generated clients, backend/API behavior, database schema/migrations,
auth/session/security runtime, storage/file-byte behavior, sync runtime,
sync mutation, local backup/restore runtime, browser local-mode persistence,
money/settlement/payment/bill calculation logic, Docker, deployment, CI,
environment, mobile app code, admin web code, secrets, credentials, tokens,
`.env`, `~/.ssh`, or local Codex state were changed.

No calls or runtime wiring were added for `listSyncChanges`,
`submitSyncOperation`, `getSyncOperation`, import/export mutation methods, or
browser storage APIs.

No localStorage, sessionStorage, IndexedDB, browser-cache, service-worker,
file-system, local backup, restore, offline persistence, fake local mode, fake
sync queues, fake sessions, fake users, fake groups, fake import/export data,
or fake status data were added.

## Blockers, Failures, Follow-Ups

- Blockers: none.
- Failures: none.
- Follow-up: sync/local status OpenAPI/API read contract with generated clients.
- Follow-up: user-web read-only sync/local status runtime against that contract.
- Follow-up: sync operation history/conflict review plan before mutation or conflict-resolution UI.
- Follow-up: local backup/restore package contract plan.
- Follow-up: browser local-mode persistence/security design.

## Final Worktree Status

- After the planning commit and before adding this report artifact, `git status --short` had no output.
- This report artifact is expected to be committed separately because it is required task evidence and lives under ignored `.codex/reports`.
