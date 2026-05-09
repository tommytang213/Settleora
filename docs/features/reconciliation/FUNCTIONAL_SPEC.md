# Reconciliation Functional Spec

## Purpose

Define user-facing behavior for statement import, transaction matching, reconciliation review, and privacy boundaries.

## User goals

Users should be able to:

- upload bank/credit card statement CSV files
- map columns to Settleora fields
- save mapping templates
- import transactions
- match transactions against expenses, settlements, refunds, and payment records
- manually link/unlink records
- understand mismatch, duplicate, missing, and unmatched statuses
- keep statement data private by default

## Primary flow

1. User uploads statement CSV.
2. User selects or creates column mapping.
3. App previews parsed rows.
4. User imports transactions.
5. App suggests matches.
6. User reviews possible matches and mismatches.
7. User links/unlinks transactions manually where needed.
8. App updates reconciliation statuses.

## Matching targets

Transactions may match:

- expenses
- shared bills
- settlement payments
- refunds/reimbursements
- provider payment events where supported

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

## User-facing language

Do not claim banks/providers are wrong.

Use language such as:

```text
This statement transaction does not match your recorded spending.
Please verify against your receipt and statement.
```

## Privacy and visibility

- Statement rows are private to the importing user by default.
- Group members do not see raw statement rows.
- Linked shared expense/settlement evidence may be visible only where authorization allows.

## Acceptance criteria

- User can upload and map CSV statement data.
- User can save mapping templates.
- User can review suggested matches.
- User can manually link/unlink matches.
- Statement data remains private by default.
- Import does not silently mutate expenses or settlements.

## Non-goals

- Direct bank API sync in initial Day 2 reconciliation.
- Universal PDF parser.
- Automatic dispute filing.
- Silent mutation of financial records.
