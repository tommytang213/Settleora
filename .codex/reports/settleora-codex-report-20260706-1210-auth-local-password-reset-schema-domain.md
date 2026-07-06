# Settleora Codex Report - Auth Local Password Reset Schema/Domain Slice

## Status

READY_FOR_REVIEW

## Branches And SHAs

- Target branch: `main`
- Source branch: `feature/auth-local-password-reset-schema-domain-20260706`
- Integration branch: not used for this task
- Expected starting `origin/main`:
  `6a6893e1c1ccb323733cde627e6df1a753622161`
- Actual `origin/main` after `git fetch origin --prune`:
  `6a6893e1c1ccb323733cde627e6df1a753622161`
- Branch start SHA:
  `6a6893e1c1ccb323733cde627e6df1a753622161`
- Task commit SHA:
  recorded in final push/readback because this report is committed in that
  task commit.

## Files Changed

- `.codex/reports/settleora-codex-report-20260706-1210-auth-local-password-reset-schema-domain.md`
- `docs/planning/ISSUE_PROGRESS_LEDGER.md`
- `services/api/src/Settleora.Api/Domain/Auth/AuthAccount.cs`
- `services/api/src/Settleora.Api/Domain/Auth/AuthPasswordResetDeliveryCategories.cs`
- `services/api/src/Settleora.Api/Domain/Auth/AuthPasswordResetMaterialScopes.cs`
- `services/api/src/Settleora.Api/Domain/Auth/AuthPasswordResetProviderSendCategories.cs`
- `services/api/src/Settleora.Api/Domain/Auth/AuthPasswordResetPurposes.cs`
- `services/api/src/Settleora.Api/Domain/Auth/AuthPasswordResetRequest.cs`
- `services/api/src/Settleora.Api/Domain/Auth/AuthPasswordResetRequestStatuses.cs`
- `services/api/src/Settleora.Api/Domain/Auth/AuthPasswordResetRevocationReasons.cs`
- `services/api/src/Settleora.Api/Domain/Auth/LocalPasswordCredential.cs`
- `services/api/src/Settleora.Api/Persistence/Migrations/20260706041357_AddAuthPasswordResetRequestsFoundation.Designer.cs`
- `services/api/src/Settleora.Api/Persistence/Migrations/20260706041357_AddAuthPasswordResetRequestsFoundation.cs`
- `services/api/src/Settleora.Api/Persistence/Migrations/SettleoraDbContextModelSnapshot.cs`
- `services/api/src/Settleora.Api/Persistence/SettleoraDbContext.cs`
- `services/api/tests/Settleora.Api.Tests/AuthPasswordResetRequestSchemaFoundationTests.cs`
- `services/api/tests/Settleora.Api.Tests/SettleoraDbContextDesignTimeFactoryTests.cs`

## Migration Added

- `20260706041357_AddAuthPasswordResetRequestsFoundation`

Migration review summary:

- Additive migration only.
- Creates `auth_password_reset_requests`.
- Adds restrictive FKs to `auth_accounts`, `local_password_credentials`, and
  self-reference `replaced_by_reset_request_id`.
- Adds bounded check constraints for purpose, status, material scope, delivery
  category, provider-send category, revocation reason, non-blank safe strings,
  complete issued material fields, and expiry after issuance.
- Adds filtered unique index on `reset_material_hash` when present.
- Adds account/purpose/status/expiry, filtered pending account/purpose,
  expiry, cleanup, credential, and replacement indexes.
- `Down` drops only `auth_password_reset_requests`.
- No destructive operations, raw-token storage, SQL data manipulation, or
  runtime migration auto-apply behavior was added.

## Schema/Domain Model Summary

- Added `AuthPasswordResetRequest` mapped to
  `auth_password_reset_requests`.
- Added bounded constants for purpose, status, material scope, delivery
  category, provider-send category, and revocation reason.
- Stored issued reset material only as nullable `reset_material_hash` plus
  nullable policy/version/scope fields; no raw token, URL, code, raw
  identifier, email, request body, provider payload, full IP, unbounded
  user-agent, password hash, session token, or refresh credential columns were
  added.
- Supported nullable account binding, nullable active-at-issuance local password
  credential binding, replacement self-reference, lifecycle timestamps, safe
  abuse bucket references, correlation IDs, and cleanup eligibility timestamp.
- No public endpoints, OpenAPI contracts, generated clients, provider delivery,
  notification runtime, UI, or reset orchestration were implemented.

## Tests Added/Updated

- Added `AuthPasswordResetRequestSchemaFoundationTests` covering:
  - table and column mapping;
  - filtered unique hash lookup;
  - pending/account lookup and cleanup indexes;
  - restrictive FK relationships;
  - bounded check constraints;
  - additive migration operations;
  - absence of forbidden raw identifier/email/request/provider/token columns.
- Updated `SettleoraDbContextDesignTimeFactoryTests` for the new entity count
  and model entity.

## Validation Commands And Results

- `git fetch origin --prune`
  - Exit status: 0.
  - Result: fetched successfully.
- `git status --short --branch`
  - Before branch creation: on previous docs branch with no file changes.
  - After branch creation: `## feature/auth-local-password-reset-schema-domain-20260706...origin/main`.
- `git rev-parse origin/main`
  - Exit status: 0.
  - Result: `6a6893e1c1ccb323733cde627e6df1a753622161`.
- `dotnet tool restore`
  - Exit status: 0.
  - Result: `dotnet-ef` 9.0.15 restored successfully.
- `Settleora__Database__ConnectionString='Host=localhost;Port=5432;Database=settleora;Username=settleora;Password=settleora_dev_password' dotnet ef migrations add AddAuthPasswordResetRequestsFoundation --project services/api/src/Settleora.Api --startup-project services/api/src/Settleora.Api --context SettleoraDbContext --output-dir Persistence/Migrations`
  - Exit status: 0.
  - Result: build succeeded; migration generated.
- `dotnet test services/api/Settleora.Api.sln --filter "FullyQualifiedName~AuthPasswordResetRequestSchemaFoundationTests|FullyQualifiedName~SettleoraDbContextDesignTimeFactoryTests"`
  - First run exit status: 1.
  - Failure: missing `Microsoft.EntityFrameworkCore.Migrations` import for
    `ReferentialAction` in the new test file.
  - Fix: added the missing using directive.
  - Rerun exit status: 0.
  - Result: Passed, 5 tests, 0 failures, 0 skipped, duration 1s.
- `git diff --check`
  - Exit status: 0.
  - Result: no output.
- `dotnet format services/api/Settleora.Api.sln --verify-no-changes --include <changed C# files>`
  - Exit status: 2.
  - Result: reported pre-existing whitespace diagnostics across much of
    `SettleoraDbContext.cs`; no bulk formatting was applied to avoid unrelated
    churn. `git diff --check` and required repo validation passed.
- `npm run validate:scaffold`
  - Exit status: 0.
  - Result: `Scaffold validation passed (19 paths).`
- `npm run validate:api`
  - Exit status: 0.
  - Result: Passed, 1328 tests, 0 failures, 0 skipped, duration 6m50s.
- `npm run validate:api-migrations`
  - Exit status: 0.
  - Result: disposable PostgreSQL validation applied all migrations through
    `20260706041357_AddAuthPasswordResetRequestsFoundation`; API migration
    apply validation passed.

Final post-commit readbacks to run:

- `git status --short`
- `git rev-parse origin/main`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`

## Scope Guard Confirmation

PASS.

Changed scope is limited to auth schema/domain model, EF migration/model
snapshot, focused API tests, issue ledger, and this report. The branch does not
change OpenAPI/contracts, generated clients, public endpoints, runtime password
reset services, SMTP/email provider delivery, notification runtime, mobile/web/
admin UI, auth config, secrets, environment files, appsettings, deployment,
Docker, CI, Codemagic, TestFlight, storage/file privacy, money, settlement,
payment, bill calculation, OCR, sync, import/export, backup/restore, or
reconciliation behavior.

No direct push to `main`, force push, amend, rebase, branch deletion, or
`git add .` was performed.

## GitHub Issue/Project Readback

- #336 `OPEN`; Project status `Inbox`.
- #339 `OPEN`; Project status `Needs Decision`.
- Recent PR readback:
  - #729 merged current-account password change runtime at
    `603235b15c2b5971bc498e46cce3c1b6d1d9fa31`.
  - #730 merged password reset/recovery policy gate at
    `0004b153b833fd9793df6102cc1b3ce3d0385002`.
  - #731 merged local reset token policy gate at
    `9dbb47f65d886ab90ef6de8e31a7115bfbb9ac1e`.
  - #732 merged local reset token policy decision at
    `a86be35a2c4be2cfc47294648282bdc5a39e90a5`.
  - #733 merged local reset schema/OpenAPI/runtime design gate at
    `6a6893e1c1ccb323733cde627e6df1a753622161`.
- Issue/project updates performed:
  - Updated `docs/planning/ISSUE_PROGRESS_LEDGER.md`.
  - No GitHub issue comments, issue closures, labels, or Project field
    mutations were performed.

## Issues Left Open

- #336 remains open because this schema/domain slice does not complete the
  auth/session/runtime security epic.
- #339 remains open and in `Needs Decision` because Day 1 password reset
  runtime remains incomplete and still needs contract, runtime, provider,
  notification, UI, abuse, retention, and final auth/security gates.

## Remaining Gates

- OpenAPI/generated-client contract gate.
- API/service runtime implementation gate.
- SMTP/email provider configuration and verification gate.
- Optional admin-delivered recovery gate.
- Notification event/target/redaction gate.
- UI/Figma/mobile/web/product copy gate.
- Abuse threshold tuning.
- Audit retention approval.
- Final auth/security acceptance.
- Manual gate before any schema/migration PR merge because auth/security
  persistence changes are sensitive.

## Planning Outcome

- Work type: Feature / Security schema foundation.
- Area: Auth.
- Related issues: #336, #339.
- Initial MD estimate: M = 2 MD.
- Burndown interpretation: this burns only the schema/domain child slice; it
  does not complete runtime password reset.
- Expected Project status after completion: #339 remains `Needs Decision`;
  #336/#339 remain open.
- Manual approval required before merge: Yes.
- Completion posture: `READY_FOR_REVIEW` after commit/push readback.
