# Settlements Functional Spec

## Purpose

Define user-facing behavior for settlement requests, payment claims, partial payments, receiver confirmation, disputes, and settlement history.

## User goals

Users should be able to:

- see what they owe and what others owe them
- request settlement
- mark a payment as paid
- attach optional proof
- confirm receipt
- handle partial payments, overpayments, underpayments, disputes, and reopen flows
- keep settlement history clear and auditable

## Primary flows

### Settlement request

1. User views outstanding balance.
2. User creates settlement request for amount/currency/counterparty.
3. Optional note, due date, and payment method details are shown.
4. Counterparty is notified.

### Payer marks paid

1. Payer opens settlement request.
2. Payer records payment amount/date/method/note.
3. Optional proof is attached.
4. Settlement becomes payer-claimed/marked paid.
5. Receiver is notified.

### Receiver confirms

1. Receiver reviews payer claim or provider evidence.
2. Receiver confirms receipt, disputes, or requests correction.
3. Confirmed settlement affects cleared views and balance state.

### Partial payment

- Payer may record less than full amount.
- Remaining balance stays outstanding.
- Receiver can confirm partial receipt.

### Dispute/reopen

- Either party can dispute according to policy.
- Dispute should show reason and notes.
- Reopen should preserve history, not erase old events.

## Views

- Outstanding incoming
- Outstanding outgoing
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

## Permissions and visibility

- Users can view settlements involving them.
- Group settlement visibility follows group/bill authorization.
- Proof visibility is configurable but cannot bypass settlement authorization.
- Payment profile details are visible only to authorized settlement counterparties.

## Acceptance criteria

- Users can request settlement.
- Payers can mark paid and attach optional proof.
- Receivers can confirm receipt.
- Partial settlement is tracked clearly.
- Disputes/reopen preserve history.
- Unauthorized users cannot see settlement/payment details.

## Non-goals

- Direct bank API sync.
- Provider webhooks silently confirming settlement.
- Cross-group debt simplification in Day 1.
- Payment provider implementation unless separately scoped.
