# Settleora Codex Report - User Web Group Export Runtime (#461)

- Status: `READY_FOR_REVIEW`
- Start HKT: `2026-06-29 15:13 HKT`
- End HKT: `2026-06-29 15:28 HKT`
- Elapsed time: `15 minutes`
- Branch name: `feature/user-web-group-export-runtime-461`
- Base/main SHA: `dd2af800b22b426cf6c2effe354b309e2def9a48`
- Source branch/SHA: `feature/user-web-group-export-runtime-461` / `47e135b24b59c518015a3aab12651368af5f5e18`
- Integration branch/SHA: `ai/integration` / `d3f458b146bc5c5621478aceba8d26f69b5d434a` (not used as task base)
- Implementation commit SHA: `47e135b24b59c518015a3aab12651368af5f5e18`
- Branch pushed: no
- PR URL: not created

## Files Changed

- `apps/web-user/src/App.tsx`
- `apps/web-user/src/groupsFriendsReadout.ts`
- `apps/web-user/src/importExportReadout.ts`
- `apps/web-user/src/importExportReadout.test.ts`
- `apps/web-user/src/styles.css`
- `.codex/reports/settleora-codex-report-20260629-1513-user-web-group-export-runtime-461.md`
- `/workspace/logs/settleora-codex-report-20260629-1513-user-web-group-export-runtime-461.md`

## Generated-Client Methods Used

- `listGroups`
- `getGroupBillExportReadiness`
- `exportGroupBillsCsv`
- `exportGroupBillsJson`
- Existing preserved personal export methods:
  - `getPersonalBillExportReadiness`
  - `exportPersonalBillsCsv`
  - `exportPersonalBillsJson`

## Generated-Client Methods Intentionally Not Used

- `getGroup`
- `listGroupBills`
- `getGroupBill`
- `importPersonalBillsCsv`
- `importGroupBillsCsv`
- `listSyncChanges`
- `submitSyncOperation`
- `getSyncOperation`
- Receipt/proof/attachment/content read methods

## Group Export Status

Group export was enabled because the current generated client has safe server-backed `listGroups` support plus group export readiness and CSV/JSON export methods.

The `#/import-export` route now loads visible groups through `listGroups` after auth, selects only IDs returned by that server response, and does not provide manual/free-text group ID input. Group readiness/export controls stay disabled unless the session is authenticated, the group list is loaded, and the selected group ID is still present in the latest server-returned group rows.

If group list support is missing, group selection fails closed with product-facing unavailable copy: `Group selection is not available in this web client build.`

## Readiness-Before-Export Behavior

- Group CSV/JSON export is auth-gated before group list, readiness, or export calls.
- Group export requires a selected server-returned group ID before readiness calls.
- `getGroupBillExportReadiness(groupId, ...)` runs before every group readiness display and immediately before every group download.
- Export is blocked when readiness is unavailable, denied, expired, unsupported for the requested format, has rejected filters, says file bytes are included, or returns a scope/group mismatch.
- Allowed group CSV calls only `exportGroupBillsCsv(groupId, ...)`.
- Allowed group JSON calls only `exportGroupBillsJson(groupId, ...)`.
- Browser filenames are deterministic and non-sensitive: `settleora-group-bills-YYYYMMDD.csv` and `settleora-group-bills-YYYYMMDD.json`.
- Browser object URLs are created only for API export responses and revoked after triggering the download.
- The existing readiness metadata display continues to show safe code/message, supported/requested format, accepted/defaulted/rejected filters, row/byte estimates and limits, file-byte exclusion state, redactions, audit preview, confirmation copy, and expiry.
- Personal export behavior from PR #596 was preserved.

## Validation Commands And Exact Results

- `npm ci`
  - Passed. Added 2 packages, audited 6 packages in 870ms; 0 vulnerabilities.
- `npm run validate:scaffold`
  - Passed. `Scaffold validation passed (19 paths).`
- `npm run validate:openapi`
  - Passed. `packages/contracts/openapi/settleora.v1.yaml` validated in 274ms; Redocly update notice printed.
- `npm run validate:clients`
  - Passed. Generated web and Dart clients in `/tmp/settleora-client-validation-18qIPe`; generated client validation passed.
- `npm --prefix apps/web-user run lint`
  - Passed. `tsc --noEmit`.
- `npm --prefix apps/web-user run test -- importExportReadout.test.ts`
  - Passed. `Test Files 1 passed (1)`, `Tests 21 passed (21)`.
- `npm --prefix apps/web-user run test`
  - Passed. `Test Files 9 passed (9)`, `Tests 66 passed (66)`.
- `npm --prefix apps/web-user run build`
  - Passed. Vite built 28 modules in 131ms.
- `git diff --check`
  - Passed with no output.
- `git status --short --branch`
  - Before report creation: `## feature/user-web-group-export-runtime-461...origin/main [ahead 1]` with no dirty tracked files.

## Screenshot Evidence

Skipped. The current web shell has no real sign-in/session available in this runtime, and capturing group readiness/download behavior would require fake auth or fake group/export data, which this task forbids.

## Scope Guard Confirmation

Manual scope review passed. The diff is limited to user-web import/export UI/runtime helpers, group-list fail-closed helper behavior, focused Vitest coverage, styling, and required report artifacts.

No forbidden backend/API runtime behavior, OpenAPI contract, generated-client, schema/migration, auth/session/token persistence, storage provider, storage/file-byte/path/object-key/signed-URL/direct-storage, import/upload, sync mutation, local backup/restore, local-mode persistence, money/bill/settlement/payment calculation authority, Docker/deployment/CI/environment, secret, mobile, admin web, or unrelated changes were made.

## Failures / Blockers / Follow-Ups

- During focused test/lint iteration, a test imported `SettleoraApiError` from the wrong module; fixed by importing from the generated client barrel. Final validation passed.
- No blockers remain for review.
- Follow-ups remain separate reviewed slices: import preflight/review, sync/local status, local backup/restore, and browser local-mode persistence.

## Final Worktree Status

- Implementation commit created: `47e135b24b59c518015a3aab12651368af5f5e18`.
- Report artifact to be committed separately with message `Add user web group export runtime report`.
