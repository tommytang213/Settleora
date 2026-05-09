# Settlements Technical Spec

## Purpose

Define implementation boundaries for settlement lifecycle, settlement baskets, payment claims, residual handling, balance effects, payment evidence, authorization, audit, and status transitions.

This spec should stay aligned with `docs/architecture/SETTLEMENT_BASKET_RESIDUAL_ARCHITECTURE.md`.

## Architecture boundaries

- API/domain services own settlement state transitions.
- Bill capture and settlement are separate workflows.
- Settlement may include one or more outstanding bill/share lines.
- Money must be decimal-safe with currency attached.
- Day 1 settlement baskets are same-currency only.
- Settlement status transitions must be centralized and policy-driven.
- Clients may display previews but cannot decide financial truth.
- Provider events and statement matches are evidence, not final settlement truth by themselves.
- Balances must be rebuildable from source bills, shares, settlement lines, payment claims, confirmations, residuals, waivers, credits, disputes, and cancellations.

## Domain concepts

Suggested domain areas:

```text
Settlements
SettlementRequestLines
SettlementBaskets
SettlementParticipants
PaymentClaims
PaymentAllocations
SettlementResiduals
PaymentProofs
PaymentEvidence
SettlementStatusHistory
BalanceProjections
```

Suggested service boundaries:

```text
ISettlementCommandService
ISettlementQueryService
ISettlementBasketService
ISettlementLineEligibilityService
ISettlementPaymentAllocationService
ISettlementResidualPolicy
ISettlementBalanceProjectionService
ISettlementStatusPolicy
ISettlementAuthorizationService
ISettlementAuditWriter
```

## Persistence direction

Current EF schema foundation includes settlement request roots, payment claims, proof attachment references, basket request lines, payment allocations, and residual tracking. Basket request lines, payment allocations, and residuals are schema-only and do not add public basket selection, residual confirmation, or balance projection endpoints.

Current and future table categories include:

```text
settlement_requests
settlement_request_lines
settlement_payments
settlement_proof_attachments
settlement_payment_allocations
settlement_residuals
settlement_payment_evidence
settlement_status_history
```

Records should preserve history and avoid destructive replacement of financial events.

`selection_mode` and `selection_filter_summary` may be stored for audit/context, but concrete settlement request lines remain the source of the selected settlement scope.

Suggested selection modes:

```text
manual_lines
select_all_visible
pay_all_outstanding_for_counterparty
```

Suggested settlement line selection sources:

```text
manual
select_all_visible
pay_all_outstanding
system_expanded
```

## API direction

Future endpoints may include:

```text
POST /api/v1/settlements
POST /api/v1/settlements/baskets/preview
GET /api/v1/settlements/{id}
POST /api/v1/settlements/{id}/mark-paid
POST /api/v1/settlements/{id}/confirm
POST /api/v1/settlements/{id}/dispute
POST /api/v1/settlements/{id}/cancel
POST /api/v1/settlements/{id}/reopen
GET /api/v1/settlements
```

Basket preview/create requests should support:

```text
manual_lines
select_all_visible
pay_all_outstanding_for_counterparty
```

OpenAPI must be updated before generated clients.

## Basket expansion and eligibility

The API must re-derive eligible outstanding lines at write time.

Reject lines that are:

- stale
- already cleared
- disputed
- cancelled
- unauthorized
- hidden by policy
- currency-mismatched
- outside the selected payer/payee scope

Bulk selection must be expanded server-side into concrete settlement request lines. The client must not be trusted to decide final included line sets.

## Payment amount and residual policy

The settlement service must calculate:

```text
exact_selected_total
actual_paid_amount
settlement_delta = actual_paid_amount - exact_selected_total
```

Allowed underpayment outcomes:

```text
remaining_balance
carried_forward
waived
disputed
```

Allowed overpayment outcomes:

```text
credit_forward
waived_by_payer
applied_to_other_line
disputed
```

The payer may propose residual handling, but receiver confirmation is required where policy requires it. Underpayment waiver must not be unilateral by the payer.

## Balance projection

Balance views should be projections from durable events/records, not hidden mutable truth.

Projection inputs include:

- confirmed bill participant shares
- bill payer contributions
- settlement request lines
- payment claims
- payment allocations
- receiver confirmations
- carried residuals
- waived residuals
- overpayment credits
- disputes
- cancellations

Projection output should distinguish:

```text
exact outstanding amount
pending payment claims
confirmed cleared amount
remaining residual amount
waived amount
credit amount
```

## Authorization rules

API must verify:

- actor is payer, receiver, or authorized group participant/admin depending operation
- actor can access related bill/group records
- actor can select only outstanding lines they are authorized to see and owe
- actor can attach/view proof file
- actor can confirm only receiver-side receipt or allowed policy role
- actor cannot confirm their own payment as receiver unless they are the receiver in a valid edge case
- bulk pay-all/select-all visible expansion respects the current payer/payee scope and authorization

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

Residual status transitions must also be explicit:

```text
pending_receiver_confirmation -> confirmed
pending_receiver_confirmation -> waived
pending_receiver_confirmation -> carried_forward
pending_receiver_confirmation -> credited
pending_receiver_confirmation -> disputed
pending_receiver_confirmation -> cancelled
```

Invalid transitions should fail safely and be tested.

## Audit requirements

Audit events should cover:

- settlement requested
- settlement basket created
- settlement basket line added/removed
- settlement bulk selection applied
- payment claimed
- proof attached/removed/viewed where policy requires
- receiver confirmed
- partial payment recorded
- residual proposed
- residual confirmed/waived/carried-forward/credited
- credit created/applied
- dispute opened/resolved
- settlement cancelled/reopened
- provider evidence linked/unlinked
- denied settlement action

## Storage behavior

Payment proof attachments must use storage abstraction and authorization checks. API responses must use stable file IDs and avoid direct paths.

## Validation and tests

Required test categories:

- create settlement with valid participants
- create manual settlement basket with selected lines
- pay all outstanding for one counterparty expands to concrete eligible lines
- select all visible respects filters and authorization
- stale/already-cleared/disputed/unauthorized/currency-mismatched lines rejected
- denied settlement access for unrelated user
- mark paid by payer
- confirm by receiver
- denied confirm by unauthorized user
- exact payment clears selected lines
- underpayment creates remaining/carry-forward/waiver/dispute behavior according to policy
- payer cannot unilaterally waive underpayment
- overpayment creates credit/waiver/dispute behavior explicitly
- balance projection distinguishes exact outstanding, pending claims, cleared amount, residuals, waivers, and credits
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
- stale basket preview
- duplicate mark-paid request
- duplicate provider event
- proof upload failure
- amount/currency mismatch
- settlement cancelled while payment attempt is pending
- selected line cleared between preview and write
- residual proposal rejected by receiver
- disputed settlement with later provider reversal

## Non-goals

- Direct provider implementation unless separately scoped.
- Cross-group simplification.
- Group-wide automatic settlement simplification across multiple counterparties.
- FX settlement basket behavior in Day 1.
- Worker-owned settlement writes.
- Silent provider-driven final confirmation.
- Hidden mutable balance source-of-truth tables.
