# Settlement Basket and Residual Architecture

## Purpose

This document defines the Day 1 direction for settling one or more outstanding bill/share lines through a single payment claim while preserving exact owed amounts, actual paid amounts, explicit residual handling, receiver confirmation, and rebuildable balances.

The goal is to let users capture and split each bill when it happens, then settle later in one payment if they want. Users should not be forced to delay bill entry until payment time, they should not need to manually select every outstanding line when they intend to settle everything with one counterparty, and they should not lose small rounded differences silently.

## Current State

- EF Core schema foundation now includes `settlement_request_lines`, `settlement_payment_allocations`, and `settlement_residuals` with decimal-safe amount/currency columns, constrained statuses/policies, restrictive foreign keys, and projection-oriented indexes.
- The current public settlement runtime still creates one settlement request from one confirmed bill candidate at a time, supports payment claims/confirmation/dispute/cancellation, persists payment allocations for selected request lines, supports purpose-specific settlement proof endpoints, exposes a first read-only current-actor balance projection over request lines and active payment allocations, exposes a first read-only basket preview at `POST /api/v1/settlements/baskets/preview`, and exposes a first pay-all basket creation endpoint at `POST /api/v1/settlements/baskets`.
- The basket preview expands `pay_all_outstanding_for_counterparty` for one current-actor/counterparty direction, optional group, and same-currency scope without writing settlement requests, request lines, payments, allocations, residuals, proof files, notifications, jobs, UI behavior, or projection rows. The basket create endpoint reuses that server-side expansion to write one settlement request plus concrete request lines only.
- An internal residual policy decision service now classifies exact payment, underpayment, and overpayment deltas, maps safe residual policy/direction combinations to bounded status expectations, and keeps receiver confirmation requirements explicit. Residual creation or confirmation endpoints, residual persistence writes, UI behavior, and worker behavior do not exist yet.

## Product Problem

Real usage often looks like this:

1. A bill arrives in the morning.
2. The group captures, OCR-corrects, and splits it immediately while everyone remembers the items.
3. Another bill arrives later the same day, or on another date.
4. The payer/debtor may settle one bill at a time, select specific outstanding bills, or pay all outstanding bills with one counterparty in a single later payment.

The app must support both payment styles:

```text
Bill-by-bill settlement:
Bill A exact amount: 123.45
Paid amount:         123.00
Residual:             0.45

Combined settlement:
Bill A exact amount: 123.45
Bill B exact amount: 123.45
Selected total:      246.90
Paid amount:         247.00
Overpayment credit:    0.10
```

Calendar date must not determine settlement behavior. The selected settlement scope determines how rounding and residuals are handled.

## Core Principles

- Bill capture and settlement are separate workflows.
- Bills should be captured and split when each bill is received.
- Settlement may happen later and may include one or more outstanding bill/share lines.
- Users must be able to settle all eligible outstanding lines for the same payer/payee pair without selecting each line manually.
- Rounding and residual handling happen at payment/settlement time, not bill-entry time.
- The exact debt must remain visible even when the actual payment is rounded.
- The payer may propose residual handling, but the receiver/payee must confirm or dispute whether the debt is cleared.
- Balances must be rebuildable from source bills, share lines, settlement requests, payment claims, confirmations, residuals, waivers, credits, disputes, and cancellations.
- Day 1 remains same-currency unless a reviewed FX snapshot design explicitly extends this flow.

## Terminology

```text
Payer / debtor
The person who owes money and claims they paid.

Payee / creditor / receiver
The person who receives money and confirms whether the payment clears the debt.

Outstanding line
A derived payable amount from a bill/share/counterparty relationship that has not been cleared.

Settlement basket
The set of outstanding lines selected for one settlement/payment action.

Pay all outstanding
A bulk selection action that selects every eligible outstanding line in the current payer/payee settlement scope.

Select all visible
A bulk selection action that selects every eligible outstanding line currently visible after filters such as group, date range, bill category, or search.

Exact selected total
The sum of the selected outstanding lines before payment rounding.

Actual paid amount
The amount the payer says they actually paid.

Settlement delta
actual_paid_amount - exact_selected_total

Residual
An unpaid or overpaid difference that must be explicitly handled.
```

## User Flow

### Bill Capture Flow

1. User captures/imports a receipt or creates a bill manually.
2. User fixes OCR-detected items and assigns item splits.
3. The API validates and stores the bill, item splits, participant shares, payer contributions, adjustments, and status.
4. Confirmed bills create outstanding settlement positions.

Bill capture does not require immediate payment.

### Settlement Basket Flow

1. Payer opens a counterparty settlement screen, such as `Pay Tommy`.
2. App shows outstanding lines involving that payer and receiver.
3. Payer selects one or more outstanding lines, selects all visible lines, or uses `pay all outstanding` for the current payer/payee scope.
4. App calculates the exact selected total.
5. Payer enters actual paid amount or selects a quick rounding option.
6. App calculates the settlement delta.
7. Payer proposes how to handle any underpayment or overpayment.
8. Receiver confirms, disputes, or chooses a different allowed residual outcome.
9. Balance projection updates only after policy-recognized confirmation.

### Bulk Pay-All Selection

The settlement UI must support bulk selection so a payer does not need to select every outstanding line manually.

Required Day 1 bulk actions:

- `pay_all_outstanding_for_counterparty`: select all eligible outstanding lines between the payer and receiver.
- `select_all_visible`: select all eligible outstanding lines after the current filters are applied.
- `clear_selection`: remove all selected lines.
- `deselect_line`: remove an individual line after using a bulk selection.

Optional later bulk filters:

- group
- date range
- trip/event
- bill category
- minimum/maximum amount
- search text

Bulk selection must still produce concrete settlement lines before confirmation. The app may start from a bulk action, but the backend must persist the exact lines included in the settlement basket. A future request must not mean "whatever all outstanding lines happen to be later".

The API must re-derive the eligible lines at write time and reject stale, already-cleared, disputed, cancelled, unauthorized, hidden, or currency-mismatched lines. The client must not be trusted to decide the final included set.

The UI must show a confirmation summary before payment claim creation:

```text
Pay Tommy

Bulk selection: All outstanding
Included bills: 12
Included lines: 18
Exact selected total: 1,248.90

[Review included lines]
[Continue to payment amount]
```

Day 1 bulk payment is still scoped to one payer/payee pair and one currency. Automatic group-wide simplification across multiple counterparties remains a separate reviewed policy.

## Residual Handling

### Exact Payment

```text
Exact selected total: 246.90
Actual paid amount:  246.90
Delta:                 0.00
Outcome: exact clear
```

### Underpayment

```text
Exact selected total: 246.90
Actual paid amount:  246.00
Delta:                -0.90
```

Allowed outcomes:

- `remaining_balance`: the unpaid amount remains outstanding.
- `carried_forward`: the unpaid amount remains as a small residual to include in a future settlement.
- `waived`: the receiver accepts the rounded payment as full settlement.
- `disputed`: the receiver rejects the claim or residual proposal.

The payer must not be able to unilaterally waive an underpayment. Receiver confirmation is required.

### Overpayment

```text
Exact selected total: 246.90
Actual paid amount:  247.00
Delta:                +0.10
```

Allowed outcomes:

- `credit_forward`: the overpayment becomes a credit/residual against future debt between the same parties.
- `waived_by_payer`: the payer accepts that the overpayment is ignored.
- `apply_to_other_outstanding_line`: a later policy may let the overpayment apply to other selected or eligible lines.
- `disputed`: either party rejects the claim or residual proposal.

Overpayment behavior must be explicit. It must not be silently discarded.

## Suggested Data Model Direction

The core request-line, allocation, and residual persistence tables have landed. Current single-bill settlement request creation uses one request line for the selected candidate, current basket creation writes concrete request lines for the supported pay-all-outstanding selection mode, current payment claim runtime writes allocations against selected lines, and the current balance projection read uses those records without creating residual state. Residual persistence application, additional projection behavior beyond the current read endpoint, UI, and worker behavior remain future reviewed slices.

### Settlement Request

Represents the settlement container between one debtor and one creditor.

Suggested fields:

```text
id
group_id nullable
debtor_user_profile_id
creditor_user_profile_id
exact_total_amount
currency
status
selection_mode nullable
selection_filter_summary nullable
requested_by_user_profile_id
requested_at_utc
confirmed_at_utc nullable
disputed_at_utc nullable
cancelled_at_utc nullable
created_at_utc
updated_at_utc
archived_at_utc nullable
```

`selection_mode` and `selection_filter_summary` are audit/context helpers only. The concrete settlement request lines remain the financial source of the selected scope.

Suggested `selection_mode` values:

```text
manual_lines
select_all_visible
pay_all_outstanding_for_counterparty
```

### Settlement Request Lines

Represents the exact source lines selected into the settlement basket.

Suggested fields:

```text
id
settlement_request_id
source_expense_bill_id
source_participant_id nullable
source_candidate_key nullable
exact_amount
currency
allocation_order
selection_source
status
created_at_utc
updated_at_utc
```

A line may represent a bill-level counterparty candidate, a participant share basis, or a future derived balance line. The key requirement is that the API can rebuild and prove the selected amount from durable source records and policy.

Suggested `selection_source` values:

```text
manual
select_all_visible
pay_all_outstanding
system_expanded
```

### Settlement Payment Claim

Represents what the payer claims they paid.

Suggested fields:

```text
id
settlement_request_id
paid_by_user_profile_id
received_by_user_profile_id
actual_paid_amount
actual_paid_currency
payment_date
status
payer_proposed_residual_policy nullable
note nullable
claimed_at_utc
confirmed_at_utc nullable
disputed_at_utc nullable
cancelled_at_utc nullable
created_at_utc
updated_at_utc
```

Day 1 same-currency policy should require `actual_paid_currency` to match the request currency. Future FX support should add a reviewed FX snapshot rather than overloading these fields.

### Settlement Payment Allocations

Represents how a payment claim clears selected request lines.

Suggested fields:

```text
id
settlement_payment_id
settlement_request_line_id
cleared_amount
currency
allocation_order
created_at_utc
```

### Settlement Residuals

Represents underpayment, overpayment, waiver, carry-forward, or credit behavior.

Suggested fields:

```text
id
settlement_payment_id nullable
settlement_request_id nullable
debtor_user_profile_id
creditor_user_profile_id
direction
amount
currency
policy
status
reason nullable
created_at_utc
resolved_at_utc nullable
```

Suggested `direction` values:

```text
underpayment
overpayment
```

Suggested `policy` values:

```text
remaining_balance
carried_forward
waived
credit_forward
waived_by_payer
applied_to_other_line
```

Suggested `status` values:

```text
pending_receiver_confirmation
confirmed
carried_forward
waived
credited
disputed
cancelled
```

## Balance Projection Rules

Balance views must not be hidden mutable truth. They should be projections from:

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

A projected balance should distinguish:

```text
exact outstanding amount
pending payment claims
confirmed cleared amount
remaining residual amount
waived amount
credit amount
```

Bulk selection and pay-all workflows must not create opaque balance shortcuts. The resulting request lines and payment allocations must remain rebuildable and auditable.

The current `GET /api/v1/settlement-balances` slice is read-only and does not create baskets or residuals. It groups current-actor debtor/creditor rows by counterparty, direction, optional group, and currency, separates marked-paid pending coverage from confirmed cleared coverage, excludes cancelled/disputed requests and payments from normal active balances, and keeps unsafe allocation gaps out of the projection instead of guessing from unallocated payment sums. The current `POST /api/v1/settlements/baskets/preview` slice is also read-only; it previews concrete eligible candidate lines and exact selected total but does not persist the basket.

## Authorization Rules

- The current actor must come from the authenticated session/current-actor boundary.
- Payers may select only outstanding lines they are authorized to see and owe.
- Receivers may confirm only payment claims where they are the receiver/payee.
- Group membership alone is not enough to access unrelated settlement lines or payment details.
- The API must re-derive selected lines at write time and reject stale, already-cleared, unauthorized, cancelled, disputed, or mismatched lines.
- Bulk `pay all` and `select all visible` actions must be expanded server-side into concrete eligible lines and must not rely only on client-submitted line lists.
- Payer-proposed residual handling is not final until receiver confirmation where the policy requires it.

## UX Direction

Settlement UI should support:

- outstanding line selection across dates
- pay all outstanding for a counterparty
- select all visible after filters
- selected exact total
- selected line count and bill count
- quick payment amount options such as exact, round down, round nearest, round up, and custom
- visible difference between exact selected total and actual paid amount
- proposed residual handling
- receiver confirmation or dispute
- clear history showing exact owed, actual paid, residual, waiver, credit, and confirmation state

Example payer screen:

```text
Pay Tommy

Quick actions:
[Pay all outstanding] [Select all visible] [Clear]

Outstanding:
[x] May 9 Breakfast   123.45
[x] May 9 Dinner      123.45
[ ] May 10 Taxi        80.20

Selected: 2 bills / 2 lines
Exact selected total: 246.90
Actual paid amount:  247.00
Difference:          +0.10 overpayment

Handle difference:
(*) Carry as credit
( ) Ignore / waive overpayment
```

Example receiver screen:

```text
Alice says she paid 247.00 for selected bills totaling 246.90.

Included bills: 2
Included lines: 2
Difference: +0.10 overpayment
Proposed handling: Carry as credit

[Review lines]
[Confirm]
[Dispute]
```

## FX Interaction

Day 1 settlement basket behavior is same-currency only.

Future FX settlement must store all of the following separately:

- original debt amount and currency
- agreed converted amount and currency
- exchange rate, direction, date, source, and override state
- actual paid amount and currency
- cleared debt amount and currency
- residual/waiver/credit amount and currency

FX must use frozen snapshots. Existing bills and historical settlement records must not be silently recalculated when new rates are fetched.

## Audit Events

Recommended future audit events:

```text
settlement.basket_created
settlement.basket_line_added
settlement.basket_line_removed
settlement.basket_bulk_selection_applied
settlement.payment_claimed
settlement.payment_confirmed
settlement.payment_disputed
settlement.residual_proposed
settlement.residual_confirmed
settlement.residual_waived
settlement.residual_carried_forward
settlement.credit_created
settlement.credit_applied
```

Audit metadata must stay bounded and must avoid raw payment notes, raw receipt OCR text, file bytes, payment secrets, storage paths, unrelated financial data, and unrelated user data.

## Non-goals

This document does not implement or authorize by itself:

- EF migrations.
- Runtime endpoint changes.
- OpenAPI schema changes.
- Generated client changes.
- UI implementation.
- FX conversion runtime.
- Bank/card sync.
- Automatic group-wide debt simplification across multiple counterparties.
- Automatic residual expiry.
- Hidden mutable balance source-of-truth tables.
