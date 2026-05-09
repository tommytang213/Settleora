# Settlements Functional Spec

## Purpose

Define user-facing behavior for settlement requests, settlement baskets, payment claims, partial payments, residual handling, receiver confirmation, disputes, and settlement history.

This spec should stay aligned with `docs/architecture/SETTLEMENT_BASKET_RESIDUAL_ARCHITECTURE.md`.

## User goals

Users should be able to:

- see what they owe and what others owe them
- request settlement for one or more outstanding lines
- settle one bill at a time or multiple outstanding lines in one payment
- use pay-all/select-all actions without manually selecting every line
- see exact selected total before payment
- record the actual amount paid
- handle rounded underpayments and overpayments explicitly
- mark a payment as paid
- attach optional proof
- confirm receipt
- dispute or reopen settlements where needed
- keep settlement history clear and auditable

## Primary flows

### Settlement request

1. User views outstanding balance with a counterparty.
2. User creates a settlement request for amount/currency/counterparty.
3. Optional note, due date, and payment method details are shown.
4. Counterparty is notified.

### Settlement basket

1. Payer opens a counterparty settlement screen, such as `Pay Tommy`.
2. App shows eligible outstanding lines involving that payer and receiver.
3. Payer selects one or more lines manually, selects all visible lines, or chooses pay all outstanding for the current counterparty scope.
4. App shows included bill count, included line count, and exact selected total.
5. Payer reviews included lines before continuing.
6. Payer enters actual paid amount or chooses a quick rounding option.
7. App shows the settlement delta between exact selected total and actual paid amount.
8. Payer proposes residual handling if there is an underpayment or overpayment.
9. Receiver confirms, disputes, or chooses an allowed residual outcome.

### Bulk selection

Required Day 1 bulk actions:

```text
pay_all_outstanding_for_counterparty
select_all_visible
clear_selection
deselect_line
```

Bulk selection must still result in a concrete set of selected lines before confirmation. The UI must not imply that a future settlement means "whatever is outstanding later."

### Payer marks paid

1. Payer opens settlement request or basket.
2. Payer records payment amount/date/method/note.
3. Optional proof is attached.
4. Settlement becomes payer-claimed/marked paid or provider-verified where provider evidence exists.
5. Receiver is notified.

### Receiver confirms

1. Receiver reviews payer claim, provider evidence, selected lines, exact total, actual paid amount, and residual proposal.
2. Receiver confirms receipt, disputes, or requests correction.
3. Confirmed settlement affects cleared views and balance projection.

### Partial payment and residuals

- Payer may record less than the exact selected total.
- Remaining balance, carry-forward, waiver, credit, or dispute handling must be explicit.
- Receiver confirmation is required for underpayment waiver.
- Overpayments must not be silently discarded.

### Dispute/reopen

- Either party can dispute according to policy.
- Dispute should show reason and notes.
- Reopen should preserve history, not erase old events.

## Views

- Outstanding incoming
- Outstanding outgoing
- Counterparty settlement screen
- Settlement basket line review
- Exact total vs actual paid amount summary
- Residual handling selection
- Cleared incoming
- Cleared outgoing
- Settlement detail
- Payment proof viewer
- Counterparty payment profile

## Statuses

Recommended settlement states:

```text
requested
payer_claimed_paid
partially_paid
provider_verified
receiver_confirmed
disputed
cancelled
reopened
```

Payment evidence types:

```text
payer_claim
proof_attachment
provider_capture
provider_incoming_transaction
statement_match
```

Suggested residual directions:

```text
underpayment
overpayment
```

Suggested residual policies:

```text
remaining_balance
carried_forward
waived
credit_forward
waived_by_payer
applied_to_other_line
```

Suggested residual statuses:

```text
pending_receiver_confirmation
confirmed
carried_forward
waived
credited
disputed
cancelled
```

## Permissions and visibility

- Users can view settlements involving them.
- Payers may select only outstanding lines they are authorized to see and owe.
- Receivers may confirm only payment claims where they are the receiver/payee.
- Group settlement visibility follows group/bill authorization.
- Proof visibility is configurable but cannot bypass settlement authorization.
- Payment profile details are visible only to authorized settlement counterparties.

## User-facing language

Use clear payment wording:

```text
Exact selected total
Actual paid amount
Difference
Remaining balance
Carry forward
Waive difference
Carry as credit
```

Avoid hiding residuals behind vague labels such as "adjustment" without explaining who benefits and what remains outstanding.

## Acceptance criteria

- Users can request settlement.
- Users can select one or more outstanding lines.
- Users can pay all outstanding lines for one counterparty without manually selecting each line.
- Users can select all visible eligible lines after filters.
- Selected basket shows bill count, line count, exact total, and currency.
- Payers can record actual paid amount and attach optional proof.
- App clearly shows underpayment/overpayment delta.
- Residual handling is explicit and receiver-confirmed where required.
- Receivers can confirm, dispute, or reject residual proposals.
- Partial settlement is tracked clearly.
- Disputes/reopen preserve history.
- Unauthorized users cannot see settlement/payment details.

## Non-goals

- Direct bank API sync.
- Provider webhooks silently confirming settlement.
- Cross-group debt simplification in Day 1.
- Group-wide automatic settlement simplification across multiple counterparties.
- FX settlement basket behavior in Day 1.
- Payment provider implementation unless separately scoped.
- Hidden mutable balance shortcuts that cannot be rebuilt from source records.
