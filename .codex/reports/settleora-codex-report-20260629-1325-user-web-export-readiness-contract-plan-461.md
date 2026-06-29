# Settleora Codex Report - User Web Export Readiness Contract Plan (#461)

## Status

READY_FOR_REVIEW

## Timing

- Start HKT: 2026-06-29 13:25:00 HKT
- End HKT: 2026-06-29 13:28:11 HKT
- Elapsed time: 3 minutes 11 seconds

## Branches And SHAs

- Branch: `docs/user-web-export-readiness-contract-plan-461`
- Base/main SHA: `e6705a8041a1af4cd20d3b151d8217e873141dc1`
- Integration branch: `ai/integration` (not changed)
- Task docs commit SHA: `ebf97377e8af9a9f156d08eef5f5b12fd30d51e5`
- Report commit SHA: created after this report file is staged and committed
- Branch pushed: yes, to `origin/docs/user-web-export-readiness-contract-plan-461`

## Files Changed

- `docs/planning/USER_WEB_EXPORT_READINESS_CONTRACT_PLAN.md`
- `docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md`
- `.codex/reports/settleora-codex-report-20260629-1325-user-web-export-readiness-contract-plan-461.md`

## Summary Of Planning Decisions

- Added a docs-only export readiness contract plan for user-web export runtime.
- Defined that generated export method presence is not enough to enable
  downloads because export is a data-egress action requiring API/domain
  authorization, privacy, audit, size/row-limit, and browser-download policy.
- Recommended a pre-download export readiness contract for personal and group
  bill export that reports availability, stable codes, safe messages, scope,
  formats, accepted/defaulted/rejected filters, row/size limits, redactions,
  file inclusion state, audit preview, confirmation copy, and readiness expiry.
- Kept CSV and JSON as the near-term export formats because generated methods
  already exist. PDF summary remains later unless explicit API support exists.
- Preserved personal versus group scope boundaries and required server-derived
  group authorization for group exports.
- Required auth/session checks, safe problem details, server-side authorization,
  privacy redaction, decimal-safe/currency-attached money, and bounded audit.
- Required browser download behavior that does not expose storage paths, object
  keys, provider internals, signed URLs, direct storage URLs, or filesystem
  paths.
- Kept import/upload, sync mutation, local backup/restore, local-mode
  persistence, PDF export, OpenAPI changes, generated-client refresh, backend
  runtime, and user-web runtime wiring out of scope.
- Added a minimal link from the existing export/import/local-mode implementation
  plan to the new export readiness contract plan.

## Existing Generated-Client Methods Inspected

From `packages/client-web/src/generated/client.ts`:

- `exportPersonalBillsCsv(options, query): Promise<Blob>`
- `exportPersonalBillsJson(options, query): Promise<ExpenseBillExportResponse>`
- `exportGroupBillsCsv(groupId, options, query): Promise<Blob>`
- `exportGroupBillsJson(groupId, options, query): Promise<ExpenseBillExportResponse>`
- `importPersonalBillsCsv(body, options): Promise<BillCsvImportResponse>`
- `importGroupBillsCsv(groupId, body, options): Promise<BillCsvImportResponse>`
- `listSyncChanges(options, query): Promise<SyncChangesResponse>`
- `submitSyncOperation(body, options): Promise<SyncOperationResponse>`
- `getSyncOperation(syncOperationId, options): Promise<SyncOperationResponse>`

The task inspected these generated methods only. Generated clients were not
edited.

## Recommended Future Task Sequence

1. OpenAPI/backend export readiness endpoint design and implementation.
2. Generated-client refresh through repo generation tooling.
3. User-web export runtime wiring for readiness-driven CSV/JSON downloads.
4. Separate import preflight/review contract planning.
5. Separate local backup/restore/local-mode design.

## Validation Commands And Results

- `cd /workspace/repos/Settleora; git status --short`
  - Result before edits: clean.
  - Result after docs commit: clean.
- `cd /workspace/repos/Settleora; git diff --name-only`
  - Result before staging: reported the tracked planning-plan link update; the
    new untracked planning document appeared in `git status --short` until
    staged.
- `cd /workspace/repos/Settleora; git diff --check`
  - Result: passed with no output.
- `cd /workspace/repos/Settleora; npm run validate:docs`
  - Result: passed. Output: `Documentation validation passed.`
- `cd /workspace/repos/Settleora; npm run validate:scaffold`
  - Result: passed. Output: `Scaffold validation passed (19 paths).`

## Scope Guard Confirmation

Docs-only scope confirmed.

No forbidden runtime, API, OpenAPI contract, generated-client, database schema,
migration, auth/session/security runtime, storage/file-byte behavior,
export/download execution, import/upload execution, sync mutation,
backup/restore runtime, local-mode persistence, mobile/admin, Docker,
deployment, CI, environment, money/settlement/payment/bill calculation,
secrets, credentials, tokens, `.env`, `~/.ssh`, or local Codex state changes
were made.

No runtime methods were called or wired:

- `exportPersonalBillsCsv`
- `exportPersonalBillsJson`
- `exportGroupBillsCsv`
- `exportGroupBillsJson`
- `importPersonalBillsCsv`
- `importGroupBillsCsv`
- `listSyncChanges`
- `submitSyncOperation`
- `getSyncOperation`

## Failures, Blockers, And Follow-Ups

- Failures: none.
- Blockers: none.
- Follow-ups: implement the recommended future task sequence in separate
  reviewed gates, starting with OpenAPI/backend export readiness design.

## Final Worktree Status

At final report write time, the only uncommitted repo change was this required
`.codex/reports` artifact. After staging and committing this artifact, final
status should be rechecked and clean.
