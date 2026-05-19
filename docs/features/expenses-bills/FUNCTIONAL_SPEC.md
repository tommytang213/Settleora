# Expenses and Bills Functional Spec

## Purpose

Define user-facing behavior for personal expenses, shared bills, attachments, bill statuses, bill revisions, correction proposals, and bill-level collaboration.

## User goals

Users should be able to:

- create personal expenses quickly
- create shared bills for groups or counterparties
- attach receipts/proofs/supporting files
- edit drafts safely
- understand when a shared bill is pending, accepted, rejected, disputed, revised, or finalized
- reject or dispute incorrect bill details
- propose corrections without directly mutating official financial truth
- approve only bill revisions that affect their own money or payer role
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

### Create bill on behalf of another payer

A bill may be created by one user while another user is marked as payer.

Example:

```text
created_by: Tony
bill_owner / responsible editor: Tommy
paid_by: Tommy
participants: Tommy, Martin, Nicholas
```

Rules:

- `created_by` is audit/history metadata.
- `bill_owner` or responsible editor handles normal correction/resubmission after submission.
- `paid_by` person must confirm payer role and payment facts if they did not create/submit the bill themselves.
- The preparer/helper is not automatically responsible for future disputes unless explicitly kept as a co-editor/helper by policy.

### Edit shared bill

- Drafts can be edited by authorized draft editors.
- Non-financial edits should not require re-approval unless policy says otherwise.
- Financial-impacting edits reset affected participants to pending acceptance.
- Users should see why re-approval is required.
- Official accepted bill data should not be silently overwritten after submission.

### Correction proposal / pending revision

Participants involved in a bill can challenge or propose corrections.

Day 1 rule:

```text
One active pending revision per bill.
```

Behavior:

1. A participant rejects, disputes, or chooses to propose a correction.
2. The app creates a pending bill revision rather than directly changing the official accepted bill.
3. While one pending revision exists, other users can comment or suggest changes on that revision, but cannot create another competing official pending revision.
4. The pending revision shows the changed fields, changed calculated shares, financial impact summary, and affected users from server-generated review context.
5. Only affected users need to approve/reject the pending revision.
6. The `paid_by` person must re-confirm if payer role, paid amount, payer contribution, or their financial share changes.
7. Unaffected accepted users remain accepted.
8. When the pending revision is accepted/applied, it becomes the active accepted revision.
9. When the pending revision is rejected/cancelled/withdrawn, the bill falls back to the previous active revision.

Revision review UX must be API/domain-authoritative:

- The API generates the review baseline, default view mode, changed-only markers, accessible marker labels, change summary, affected-user state, and viewer-specific financial impact.
- Mobile and web clients render server-provided highlights and summaries. They must not decide authorization, affected users, payer confirmation truth, money impact, or financial truth from raw rows.
- Users with no safely derivable prior acceptance/review/rejection baseline should default to full-bill review with changes highlighted.
- Users with a safely derivable active accepted bill or previous revision approval/rejection baseline may default to changed-only review, with full bill still available.
- Current revision snapshots preserve aggregate total, participant-share, payer-contribution, and payer-role data. Full item, item-split, adjustment, attachment, receipt/OCR, note, and metadata highlighting remains limited until revision snapshots preserve those details.
- The detailed mobile-first review, highlighting, changed-only, accessibility, and action-safety gate is defined in [Bill revision review UX gate](BILL_REVISION_REVIEW_UX.md).

### Proposal withdraw, edit, and resubmit

The proposal creator can withdraw or revise their own pending proposal before it is accepted/applied.

Rules:

- Withdrawing closes the proposal without changing the active bill revision.
- Editing a submitted proposal creates a new proposal version or supersedes the prior version.
- Prior approvals on the superseded proposal do not carry to the new proposal version.
- Affected users review the newest proposal version only.
- The bill owner/responsible editor may cancel/close a pending proposal according to policy.

### Approval behavior with pending proposals

Approvals are revision-specific.

A participant's acceptance should bind to:

```text
bill_revision_id
accepted_amount
currency
calculation_hash
```

User-facing rules:

- If no pending proposal exists, the participant reviews the active bill revision.
- If a pending proposal exists and does not affect the participant's amount or role, they may still accept the active revision.
- If a pending proposal affects the participant, they should review the proposed revision instead of accepting a stale amount.
- If the participant already accepted the active revision and a rejected proposal did not affect that active revision, no new action is needed.
- If the participant accepted a pending proposal that later gets rejected, that approval does not apply to the active revision unless they had already accepted the active revision before.

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
- pending revision review
- correction proposal thread
- affected-user approval summary
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
- created by
- bill owner / responsible editor
- paid by / payer contribution
- active bill revision
- pending revision
- participant approval status
- status

## Statuses

Suggested bill statuses:

```text
draft
pending_confirmation
confirmed
needs_review
revised_pending_acceptance
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

Suggested bill revision statuses:

```text
draft_revision
submitted_for_review
withdrawn_by_proposer
superseded_by_resubmission
rejected
accepted_applied
cancelled_by_authorized_editor
```

## Permissions and visibility

- Users can see their own personal expenses.
- Users can see shared bills they created or are authorized participants of.
- Group visibility must be API-authorized.
- Archived records remain visible only where authorization allows.
- Attachments follow the same or stricter authorization as their parent record.
- Participants can comment, reject, dispute, or propose corrections on bills they are involved in.
- Direct official bill mutation after submission requires bill-owner/responsible-editor/co-editor permission or a pending revision workflow.

## Edge cases

- bill with multiple payers
- bill created by helper/preparer but paid by another user
- payer rejects the paid-by role
- participant proposes a correction while another proposal is pending
- proposer withdraws or revises a submitted proposal
- participant accepted a proposal that later gets rejected
- bill edited after partial settlement
- accepted bill revision changes after settlement/payment claim
- participant removed from group after bill creation
- bill with foreign currency
- attachment upload failure
- duplicate-looking expense
- archive attempted on settled/finalized records

## Acceptance criteria

- Users can create personal and shared expenses.
- Shared bill participants and payer shares are visible and understandable.
- Financial edits reset affected acceptance states.
- Participants can propose corrections through pending revisions.
- Day 1 allows only one active pending revision per bill.
- Proposer can withdraw or revise before the proposal is accepted/applied.
- Revising a proposal supersedes prior proposal approvals.
- Approval is bound to a specific bill revision and calculation hash.
- Rejected proposal approvals do not silently carry to the active revision unless the user had already accepted that active revision.
- Paid-by person must confirm payer/payment facts when they are changed or created on their behalf.
- Unaffected accepted users remain accepted after unrelated financial corrections.
- Unauthorized users cannot see unrelated bills.
- Archive/restore behavior is safe and clear.
- Attachment access follows authorization.

## Non-goals

- Direct bank API sync.
- Automatic provider-driven mutation.
- Full accounting ledger replacement.
- Multiple competing active official correction proposals in Day 1.
- Day 2 lock/refund behavior unless separately scoped.
