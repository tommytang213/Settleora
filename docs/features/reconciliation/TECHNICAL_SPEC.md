# Reconciliation Technical Spec

## Purpose

Define implementation boundaries for statement imports, reconciliation transactions, match suggestions, privacy, audit, and settlement/payment evidence interaction.

## Architecture boundaries

- API owns server-mode reconciliation writes.
- Statement data is private financial data.
- Imported statement/provider data must not silently mutate expenses, bills, settlements, or refunds.
- Matching suggestions are evidence or review aids, not financial authority.
- File bytes go through storage abstraction.

## Domain concepts

Suggested domain areas:

```text
StatementImports
StatementTransactions
ColumnMappingTemplates
ReconciliationMatches
ReconciliationStatus
```

Suggested service boundaries:

```text
IStatementImportService
IColumnMappingService
IReconciliationMatcher
IReconciliationAuthorizationService
IReconciliationAuditWriter
```

## Persistence direction

Future tables may include:

```text
statement_imports
statement_transactions
statement_column_mapping_templates
reconciliation_matches
reconciliation_match_history
```

Statement rows should keep enough source metadata for traceability without exposing raw sensitive data unnecessarily.

## API direction

Future endpoints may include:

```text
POST /api/v1/statement-imports
GET /api/v1/statement-imports/{id}
POST /api/v1/statement-imports/{id}/preview
POST /api/v1/statement-imports/{id}/commit
GET /api/v1/reconciliation/matches
POST /api/v1/reconciliation/matches
DELETE /api/v1/reconciliation/matches/{id}
```

OpenAPI must be updated before generated clients.

## Matching signals

Match scoring should consider:

- amount
- currency
- transaction date
- posting date
- merchant/description similarity
- payment method/account
- receipt date
- existing reference metadata
- provider reference where available
- already matched status

## Privacy rules

- Only the importing user can view raw statement rows by default.
- Group members may see only linked shared records they are authorized for.
- Raw provider account history must not appear in group APIs.
- Statement files and parsed rows are sensitive application data.

## Authorization rules

API must verify:

- actor owns the statement import
- actor can view candidate expense/settlement/refund records
- actor can link/unlink the match
- shared visibility does not leak private statement details

## Audit requirements

Audit events should cover:

- statement uploaded
- statement deleted/archived
- column mapping saved/changed
- transactions imported
- match linked/unlinked
- reconciliation status changed
- provider evidence linked/unlinked where relevant

## Validation and tests

Required test categories:

- upload/import restricted to owner
- mapping validation rejects invalid required fields
- unauthorized user cannot view statement rows
- matching does not mutate financial records silently
- manual link/unlink respects authorization
- duplicate import detection via row hash/reference
- FX amount mismatch status is represented safely

Validation commands:

```powershell
dotnet tool restore
dotnet restore
dotnet build
dotnet test
npm run validate:openapi
npm run validate:api
```

## Failure modes

Handle:

- malformed CSV
- missing required columns
- duplicate rows/imports
- unsupported encoding
- huge file rejection
- mapping template mismatch
- stale candidate record
- match conflict with already matched transaction

## Non-goals

- Direct bank sync in initial Day 2.
- Universal PDF parser.
- Automatic provider/bank dispute filing.
- Silent mutation of expense/bill/settlement/refund records.
