# Settlements Technical Spec

## Purpose

Define implementation boundaries for settlement lifecycle, balance effects, payment evidence, authorization, audit, and status transitions.

## Architecture boundaries

- API/domain services own settlement state transitions.
- Money must be decimal-safe with currency attached.
- Settlement status transitions must be centralized and policy-driven.
- Clients may display previews but cannot decide financial truth.
- Provider events and statement matches are evidence, not final settlement truth by themselves.

## Domain concepts

Suggested domain areas:

```text
Settlements
SettlementParticipants
PaymentClaims
PaymentProofs
PaymentEvidence
SettlementStatusHistory
```

Suggested service boundaries:

```text
ISettlementCommandService
ISettlementQueryService
ISettlementBalanceService
ISettlementStatusPolicy
ISettlementAuthorizationService
ISettlementAuditWriter
```

## Persistence direction

Future tables may include:

```text
settlements
settlement_payments
settlement_payment_evidence
settlement_status_history
settlement_proof_files
```

Records should preserve history and avoid destructive replacement of financial events.

## API direction

Future endpoints may include:

```text
POST /api/v1/settlements
GET /api/v1/settlements/{id}
POST /api/v1/settlements/{id}/mark-paid
POST /api/v1/settlements/{id}/confirm
POST /api/v1/settlements/{id}/dispute
POST /api/v1/settlements/{id}/cancel
POST /api/v1/settlements/{id}/reopen
GET /api/v1/settlements
```

OpenAPI must be updated before generated clients.

## Authorization rules

API must verify:

- actor is payer, receiver, or authorized group participant/admin depending operation
- actor can access related bill/group records
- actor can attach/view proof file
- actor can confirm only receiver-side receipt or allowed policy role
- actor cannot confirm their own payment as receiver unless they are the receiver in a valid edge case

## Status policy

Status transitions must be explicit.

Example transitions:

```text
requested -> payer_claimed_paid
requested -> cancelled
payer_claimed_paid -> receiver_confirmed
payer_claimed_paid -> disputed
provider_verified -> receiver_confirmed
receiver_confirmed -> reopened
```

Invalid transitions should fail safely and be tested.

## Audit requirements

Audit events should cover:

- settlement requested
- payment claimed
- proof attached/removed/viewed where policy requires
- receiver confirmed
- partial payment recorded
- dispute opened/resolved
- settlement cancelled/reopened
- provider evidence linked/unlinked
- denied settlement action

## Storage behavior

Payment proof attachments must use storage abstraction and authorization checks. API responses must use stable file IDs and avoid direct paths.

## Validation and tests

Required test categories:

- create settlement with valid participants
- denied settlement access for unrelated user
- mark paid by payer
- confirm by receiver
- denied confirm by unauthorized user
- partial payment calculations
- invalid status transition rejected
- proof attachment authorization
- provider evidence does not auto-confirm unless policy allows
- audit emitted for money-impacting actions

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

- stale settlement version
- duplicate mark-paid request
- duplicate provider event
- proof upload failure
- amount/currency mismatch
- settlement cancelled while payment attempt is pending
- disputed settlement with later provider reversal

## Non-goals

- Direct provider implementation unless separately scoped.
- Cross-group simplification.
- Worker-owned settlement writes.
- Silent provider-driven final confirmation.
