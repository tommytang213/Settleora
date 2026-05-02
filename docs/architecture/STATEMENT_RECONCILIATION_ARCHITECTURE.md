# Statement Reconciliation Architecture

## Purpose

Statement reconciliation allows users to upload credit card or bank statements and compare statement transactions against Settleora expenses, settlements, refunds, and payment records.

This is a Day 2 feature. It is not direct bank API sync.

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

## Privacy rule

Statement data is personal financial data. It must not be visible to group members by default.

Group members may see only linked shared expense data they are authorized to access, not the user's raw statement rows.

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
match_type
confidence
status
created_by
created_at
```

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
- Already matched status.

## Match confidence

Recommended behavior:

```text
High confidence: auto-match allowed, user can review/unlink.
Medium confidence: show possible match.
Low confidence: do not auto-link.
```

## Match statuses

Recommended statuses:

```text
matched
possible_match
unmatched_statement
missing_from_statement
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

## FX behavior

Statement settled amounts should be stored separately from bill FX snapshots.

Rule:

```text
Bill FX snapshot = expected/reference conversion.
Statement settled amount = actual bank/card charge.
```

Do not overwrite bill amounts or FX rates automatically based on statement imports.

## User-facing language

The app should not claim that the bank is wrong.

Use wording like:

```text
This statement transaction does not match your recorded spending.
Please verify against your receipt and statement.
```

## Audit

Audit events should cover:

- Statement upload.
- Statement delete/archive.
- Column mapping saved/changed.
- Transaction import.
- Manual match/unmatch.
- Reconciliation status change.

## Non-goals

- Direct bank API sync.
- Plaid/Salt Edge/Open Banking integration.
- Automatic dispute filing.
- Universal PDF parser.
- Silent mutation of expense records.
