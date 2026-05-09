# Statement Reconciliation Architecture

## Purpose

Statement reconciliation allows users to upload credit card or bank statements and compare statement transactions against Settleora expenses, settlements, refunds, and payment records.

This is a Day 2 feature. It is not direct bank API sync.

Provider payment-event and incoming payment reflection architecture is defined separately in [PAYMENT_INTEGRATION_ARCHITECTURE.md](PAYMENT_INTEGRATION_ARCHITECTURE.md). Statement reconciliation may consume provider-derived transaction evidence, but provider events must still pass through API/domain validation before affecting settlement state.

## Scope

Day 2 should start with CSV statement upload.

Supported capabilities:

- Upload statement CSV.
- Store original file through storage abstraction.
- Map CSV columns to normalized fields.
- Save mapping templates.
- Import transactions.
- Auto-suggest matches.
- Allow manual link/unlink.
- Show reconciliation statuses.
- Keep statement data private by default.

Related Day 2 payment-provider capabilities:

- Import or receive provider transaction evidence where a linked payment account and provider access allow.
- Match provider incoming transactions against settlements, payment requests, refunds, and reimbursements.
- Keep raw provider account history private to the linked account owner by default.
- Use high-confidence provider matches as settlement evidence only after API/domain validation.
- Require user review for low/medium-confidence provider matches.

## Privacy rule

Statement data and provider transaction data are personal financial data. They must not be visible to group members by default.

Group members may see only linked shared expense, settlement, or payment evidence data they are authorized to access, not the user's raw statement rows or raw provider account history.

## Statement import model

Suggested entity: `statement_imports`

```text
id
owner_user_id
payment_account_id nullable
statement_period_start
statement_period_end
source_file_id
source_format
status
created_at
```

Suggested entity: `statement_transactions`

```text
id
statement_import_id
transaction_date
posting_date
description
amount
currency
direction
external_reference nullable
raw_row_hash
match_status
created_at
```

Suggested entity: `reconciliation_matches`

```text
id
statement_transaction_id
expense_id nullable
settlement_id nullable
refund_id nullable
payment_request_id nullable
provider_payment_event_id nullable
match_type
confidence
status
created_by
created_at
```

Provider-derived transactions may use a separate provider event/transaction model owned by the payment integration boundary, then link into reconciliation through `reconciliation_matches`.

## Column mapping

Users can map statement columns to Settleora fields.

Example mappings:

```text
Transaction Date -> transaction_date
Posting Date -> posting_date
Description -> description
Debit -> amount debit
Credit -> amount credit
Currency -> currency
Reference -> external_reference
```

Save mapping templates per account/provider where possible.

## Matching signals

Auto-match should consider:

- Amount.
- Currency.
- Transaction date.
- Posting date.
- Merchant/description similarity.
- Payment method/account.
- Receipt date.
- Existing receipt or reference metadata.
- Provider reference or Settleora payment reference.
- Direction, such as incoming or outgoing.
- Existing provider payment event linkage.
- Already matched status.

## Match confidence

Recommended behavior:

```text
High confidence: auto-match allowed, user can review/unlink.
Medium confidence: show possible match.
Low confidence: do not auto-link.
```

For provider incoming transactions, high-confidence matches may create provider-verified evidence but must not silently receiver-confirm a settlement unless explicit user/group policy allows auto-confirm.

## Match statuses

Recommended statuses:

```text
matched
possible_match
unmatched_statement
unmatched_provider_transaction
missing_from_statement
missing_from_provider
amount_mismatch
currency_mismatch
duplicate_possible
ignored
```

## Tolerances

Suggested defaults:

```text
transaction date: +/- 3 days
posting date: +/- 5 days
same-currency amount: exact or +/- 0.01
FX/card settled amount: configurable tolerance
merchant text: fuzzy match
payment method: confidence boost
provider reference: strong confidence boost
```

## Payment method on bills

Bills can optionally include a payment method.

Payment method is a hint for reconciliation, not a required bill field.

Recommended bill fields:

```text
payment_method_id nullable
payment_method_label_snapshot nullable
paid_from_account_id nullable
paid_by_user_id required or existing payer relation
```

## Provider transaction interaction

Linked payment providers may contribute incoming or outgoing transaction evidence.

Rules:

- Provider connection and provider transaction import/reflection are controlled by the payment integration boundary.
- Reconciliation may match normalized provider transaction evidence to Settleora records.
- Raw provider transaction history remains private to the linked account owner by default.
- Group members may see only authorized linked settlement/payment evidence, not the raw provider feed.
- Provider evidence proves money movement evidence; receiver confirmation proves settlement acceptance.
- Provider evidence must not overwrite expenses, settlements, refunds, or payment records silently.

Example provider-derived match sources:

```text
paypal_capture
paypal_incoming_transaction
future_wallet_transaction
future_open_banking_transaction
```

## FX behavior

Statement settled amounts should be stored separately from bill FX snapshots.

Rule:

```text
Bill FX snapshot = expected/reference conversion.
Statement settled amount = actual bank/card charge.
```

Do not overwrite bill amounts or FX rates automatically based on statement imports or provider transaction imports.

## User-facing language

The app should not claim that the bank, wallet, or payment provider is wrong.

Use wording like:

```text
This statement transaction does not match your recorded spending.
Please verify against your receipt and statement.
```

For provider transactions:

```text
This provider transaction may match a settlement.
Please verify before confirming or linking it.
```

## Audit

Audit events should cover:

- Statement upload.
- Statement delete/archive.
- Column mapping saved/changed.
- Transaction import.
- Provider transaction import/reflection where reconciliation consumes it.
- Manual match/unmatch.
- Reconciliation status change.
- Provider evidence linked/unlinked to settlement/payment records.

## Non-goals

- Direct bank API sync.
- Plaid/Salt Edge/Open Banking integration as the initial Day 2 reconciliation path.
- Automatic dispute filing.
- Universal PDF parser.
- Silent mutation of expense, bill, settlement, refund, or payment request records.
- Exposing raw provider account history to group members by default.
