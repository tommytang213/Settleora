# Expenses and Bills Technical Spec

## Purpose

Define implementation boundaries for expenses, shared bills, bill status transitions, attachments, authorization, audit, and persistence.

## Architecture boundaries

- API/domain services own server-mode business writes.
- Clients may preview calculations but API/domain services are authoritative.
- Money calculations must use decimal-safe values with currency attached.
- File bytes go through storage abstraction.
- File metadata belongs in PostgreSQL.
- API responses must not expose physical storage paths.
- Authorization is server-enforced.

## Domain concepts

Suggested domain areas:

```text
Expenses
Bills
BillParticipants
BillPayers
Attachments
BillStatusTransitions
BillAudit
```

Suggested service boundaries:

```text
IBillCommandService
IBillQueryService
IBillAuthorizationService
IBillStatusPolicy
IExpenseAttachmentService
```

## Persistence direction

Future tables may include:

```text
expenses_or_bills
bill_payers
bill_participants
bill_attachments
bill_status_history
bill_comments
```

Schema design must preserve historical calculated shares and avoid recomputing old financial truth unexpectedly.

## API direction

Future endpoints may include:

```text
POST /api/v1/bills
GET /api/v1/bills/{id}
PATCH /api/v1/bills/{id}
POST /api/v1/bills/{id}/submit
POST /api/v1/bills/{id}/archive
POST /api/v1/bills/{id}/restore
GET /api/v1/bills
```

OpenAPI must be updated before generated clients.

## Authorization rules

API must verify:

- actor identity and active profile
- bill creator/payer/participant relationship
- group membership where relevant
- record visibility policy
- attachment access policy
- archive/restore permission

Possessing a bill ID must not imply access.

## Audit requirements

Audit events should cover:

- bill created
- bill submitted
- bill edited
- financial edit requiring re-approval
- bill accepted/rejected/disputed/finalized
- bill archived/restored
- attachment added/removed/viewed where policy requires
- denied access where meaningful

Audit metadata must not include raw sensitive file contents.

## Storage behavior

Attachments must use:

- stable file IDs
- provider-neutral object references
- content type and size validation
- lifecycle state
- authorization-aware read/download endpoints

## Validation and tests

Required test categories:

- create personal expense
- create shared bill
- denied create/update without permission
- denied read for unrelated user
- financial edit resets affected participants
- non-financial edit does not reset when allowed
- archive/restore policy
- attachment storage path not exposed
- currency required for all monetary values

Validation commands for implementation branches:

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

- stale bill version
- invalid split/currency
- missing payer/participant
- storage write failure after metadata intent
- attachment virus/content-type rejection later
- archive conflict with settlement state
- database transaction rollback

## Non-goals

- Day 2 lock/refund implementation.
- Direct provider payment mutation.
- Worker-owned business writes.
- Generated client manual edits.
