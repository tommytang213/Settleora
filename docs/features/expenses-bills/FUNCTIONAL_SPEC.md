# Expenses and Bills Functional Spec

## Purpose

Define user-facing behavior for personal expenses, shared bills, attachments, bill statuses, and bill-level collaboration.

## User goals

Users should be able to:

- create personal expenses quickly
- create shared bills for groups or counterparties
- attach receipts/proofs/supporting files
- edit drafts safely
- understand when a shared bill is pending, accepted, rejected, disputed, or finalized
- archive and restore records where safe
- search, filter, report, import, and export records

## Core flows

### Create personal expense

1. User opens expense entry.
2. User enters amount, currency, date, merchant, category, notes, and optional attachments.
3. App validates required fields.
4. Expense is saved locally or through API depending on mode.
5. Expense appears in dashboard/search/reporting.

### Create shared bill

1. User selects participants or group.
2. User enters bill details.
3. User chooses payer(s), split method, and optional payment method reference.
4. User reviews calculated shares.
5. Bill is saved as draft or submitted for confirmation.
6. Participants are notified where applicable.

### Edit shared bill

- Non-financial edits should not require re-approval unless policy says otherwise.
- Financial-impacting edits reset affected participants to pending acceptance.
- Users should see why re-approval is required.

### Archive/restore

- User can archive financial records where policy allows.
- Restore is available where safe.
- Destructive deletion is restricted when settlement, audit, or reconciliation depends on the record.

## Main screens

- expense list
- expense detail
- bill create/edit
- bill review
- group bill list
- attachments viewer
- archive/trash view
- search/filter/report surfaces

## Key fields

- amount and currency
- date/time
- merchant
- category/tags
- notes/comments
- payer(s)
- participants
- attachments
- payment method label/reference
- status

## Statuses

Suggested bill statuses:

```text
draft
pending_confirmation
confirmed
rejected
disputed
finalized
archived
```

Participant share statuses may include:

```text
pending_acceptance
accepted
rejected
partially_settled
settled
waived
claimed_paid
confirmed_paid
```

## Permissions and visibility

- Users can see their own personal expenses.
- Users can see shared bills they created or are authorized participants of.
- Group visibility must be API-authorized.
- Archived records remain visible only where authorization allows.
- Attachments follow the same or stricter authorization as their parent record.

## Edge cases

- bill with multiple payers
- bill edited after partial settlement
- participant removed from group after bill creation
- bill with foreign currency
- attachment upload failure
- duplicate-looking expense
- archive attempted on settled/finalized records

## Acceptance criteria

- Users can create personal and shared expenses.
- Shared bill participants and payer shares are visible and understandable.
- Financial edits reset affected acceptance states.
- Unauthorized users cannot see unrelated bills.
- Archive/restore behavior is safe and clear.
- Attachment access follows authorization.

## Non-goals

- Direct bank API sync.
- Automatic provider-driven mutation.
- Full accounting ledger replacement.
- Day 2 lock/refund behavior unless separately scoped.
