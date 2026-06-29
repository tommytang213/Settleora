# Settleora Codex Report - User Web Import Confirmation Contract Plan (#461)

## Status

- Status: completed
- Start timestamp: 2026-06-29 18:39 HKT
- End timestamp: 2026-06-29 18:43 HKT
- Elapsed time: approximately 4 minutes
- Branch: `docs/user-web-import-confirmation-plan-461`
- Base branch: `main`
- Expected `origin/main`: `97914fee91f44254a9811f718e10b11e0c5ad6ac`
- Observed `origin/main` before edits: `97914fee91f44254a9811f718e10b11e0c5ad6ac`
- Source/task commit SHA: pending until commit; final response reports exact
  branch HEAD SHA
- Integration commit SHA: not applicable for this docs-only main-based task
- Branch pushed: no

## Files Changed

- `docs/planning/USER_WEB_IMPORT_CONFIRMATION_CONTRACT_PLAN.md`
- `docs/planning/USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md`
- `docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md`
- `.codex/reports/settleora-codex-report-20260629-1839-user-web-import-confirmation-plan-461.md`

## Required Reading Completed

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- `docs/prd/MVP_DAY1_SCOPE.md`
- `docs/prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md`
- `docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md`
- `docs/planning/USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md`
- `docs/planning/USER_WEB_EXPORT_READINESS_CONTRACT_PLAN.md`
- `packages/contracts/openapi/settleora.v1.yaml`
- `packages/client-web/src/generated/client.ts`
- `packages/client-web/src/generated/models.ts`
- `packages/client-dart/lib/generated/client.dart`
- `packages/client-dart/lib/generated/models.dart`
- `services/api/src/Settleora.Api/Expenses/BillCsvImport/BillCsvImportEndpoints.cs`
- `services/api/tests/Settleora.Api.Tests/BillCsvImportEndpointTests.cs`
- `apps/web-user/src/importExportReadout.ts`
- `apps/web-user/src/importExportReadout.test.ts`
- `apps/web-user/src/App.tsx`
- Active `.ai/*` files:
  - `.ai/current-milestone.md`
  - `.ai/task-queue.json`
  - `.ai/qa-findings.json`
  - `.ai/state.json`
  - `.ai/qa-report.md`
  - `.ai/prompts/architect.md`
  - `.ai/prompts/coder.md`
  - `.ai/prompts/reviewer.md`
  - `.ai/prompts/qa.md`
  - `.ai/prompts/controller.md`

## Summary Of Planning Decisions

- Added `docs/planning/USER_WEB_IMPORT_CONFIRMATION_CONTRACT_PLAN.md`.
- Documented why generated direct import methods are not sufficient approval
  for user-web runtime mutation.
- Recommended a staged confirmation boundary after non-mutating preflight and
  review.
- Recommended a short-lived server-side `importSessionId` with payload digest,
  preflight result version, and confirmation challenge rather than a purely
  stateless client-held challenge.
- Kept API/domain authoritative for authentication, authorization, group
  membership/access, money/currency/rounding, split/assignment validation,
  duplicate/conflict handling, storage/file-byte handling, audit, sync/offline
  acceptance, and archive/trash behavior.
- Documented personal versus group confirmation differences.
- Listed future OpenAPI request/response concepts, server-side revalidation
  requirements, partial failure policy, stable problem codes, and confirmation
  copy.
- Separated preflight audit preview from final import audit and documented
  privacy limits for audit metadata.
- Documented failure and expiry behavior for stale preflight, changed CSV,
  changed authorization/group membership, unsupported rows, size limits,
  duplicate/conflict candidates, and server validation drift.
- Documented user-web runtime implications: keep confirmation disabled until
  the contract exists, avoid raw CSV retention/logging/rendering, revalidate
  group selections from server-returned rows, and avoid fake sessions/data.
- Added cross-links from the existing import preflight/review plan and the
  broader export/import/local-mode plan.

## Validation

- `cd /workspace/repos/Settleora; git status --short`
  - Exit code: 0
  - Output:

    ```text
     M docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md
     M docs/planning/USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md
    ?? docs/planning/USER_WEB_IMPORT_CONFIRMATION_CONTRACT_PLAN.md
    ```

- `cd /workspace/repos/Settleora; git diff --name-only`
  - Exit code: 0
  - Output:

    ```text
    docs/planning/USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md
    docs/planning/USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md
    ```

  - Note: this command lists tracked modified files only; the new planning doc
    and ignored `.codex` report appear in `git status --short` only until
    explicitly staged.

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

## Scope Guard

- Changed paths are limited to docs/planning and the required `.codex` report.
- No runtime app code changed.
- No OpenAPI paths changed.
- No generated clients changed.
- No backend/API code changed.
- No web runtime code changed.
- No database schema or migrations changed.
- No auth/session/security runtime changed.
- No storage/file-byte behavior changed.
- No sync operations were wired.
- No local backup/restore or browser local-mode persistence was added.
- No settlement, payment, bill calculation, money, or business mutation logic
  changed.
- No Docker, deployment, CI, environment, or secret files changed.
- No mobile or admin-web code changed.
- No Day 1 scope reduction was made.

## Explicit Non-Goal Confirmation

This task did not implement runtime behavior, add or change OpenAPI paths,
regenerate or hand-edit generated clients, edit backend/API code, edit web
runtime code, call or wire `importPersonalBillsCsv`, call or wire
`importGroupBillsCsv`, call or wire sync operations, add storage/file-byte
behavior, add schema/migrations, add direct import confirmation UI, add fake
sessions/data/groups/results, or reduce Day 1 scope.

## Blockers And Follow-Ups

- No blockers encountered for the docs-only plan.
- Follow-up 1: confirmation OpenAPI/backend contract implementation.
- Follow-up 2: generated-client refresh from the reviewed OpenAPI contract.
- Follow-up 3: user-web confirmation runtime wiring against the new contract.
- Follow-up 4: duplicate/conflict candidate domain enhancement.
- Follow-up 5: sync/local backup/local-mode follow-up gates.

## Next Recommended Action

Open the next reviewed contract/API task for the import confirmation endpoint
family, preserving the stateful session plus payload digest/challenge design
unless backend implementation review finds a safer equivalent.
