# Lock, Refund, and Group Governance Architecture

## Purpose

This document defines Day 2 architecture for lockable accounting periods, final locks, unlocks, post-lock adjustments, refunds, reimbursements, and lock policy governance.

## Lock purpose

Locks freeze reviewed financial history. Locks do not prevent correction. Corrections become approval-controlled adjustments.

## Lock types

```text
period_lock
final_lock
```

### Period lock

Locks a date range or accounting period while the group remains active.

Examples:

- March household expenses.
- Japan trip March 2026 period.
- Billing cycle.

### Final lock

Finalizes a group/accounting context or trip phase with higher friction to reopen.

Final lock is still unlockable through approval rules. It should not be database prison.

## Lock states

Recommended states:

```text
open
lock_requested
locked
unlock_requested
reopened
finalized
post_lock_adjustment_pending
```

## Approval-first policy

Lock/unlock should be approval-first.

Flow:

```text
User requests lock/unlock.
Required members approve.
Lock/unlock becomes effective after approval policy is satisfied.
Audit event is emitted.
```

## Group lock approval policy

A group has a lock approval policy selected during group creation.

Suggested policy options:

```text
affected_members_approve
all_group_members_approve
admin_or_owner_approves
no_approval
```

Recommended default:

```text
affected_members_approve
```

For friend/trip groups, `all_group_members_approve` is also useful.

## Lock policy changes

Changing the group lock approval policy requires approval from all current group members.

Flow:

```text
Owner/admin proposes policy change.
All current group members are notified.
Policy remains unchanged while pending.
If all required approvals are collected, new policy becomes active.
Audit event is emitted.
```

Approval set is frozen at proposal creation.

Unclaimed guest members do not vote on governance policy until linked to a real account.

## Locked period behavior

Inside a locked period:

- Existing bills are frozen.
- Existing bills can be viewed according to authorization.
- Settlements can continue.
- New bills dated inside the locked period are saved as pending adjustments.
- Refunds linked to locked bills are saved as pending adjustments.
- Edits/deletes require unlock or adjustment approval.

## Post-lock adjustment

Post-lock adjustments allow corrections without rewriting history.

Examples:

- Forgotten taxi bill.
- Late refund.
- Wrong receipt amount.
- Wrong split.

Adjustment affects balances only after approval.

## Refunds and reimbursements

Refunds/reimbursements are explicit adjustment records, not only negative expenses.

Supported Day 2 types:

```text
standalone_refund
linked_bill_refund
reimbursement
```

Future types:

```text
multi_bill_refund
item_level_refund
```

## Refund fields

Suggested `refund_adjustments` fields:

```text
id
group_id
original_bill_id nullable
amount
currency
refund_date
allocation_method
status
reason_note
created_by
created_at
```

If FX applies:

```text
original_currency
target_currency
exchange_rate_snapshot
converted_amount
```

## Refund allocation methods

Day 2 minimum:

```text
same_as_original_split
manual_allocation
```

Future:

```text
item_level_proportional
multi_bill_proportional
```

## Refund status

Recommended statuses:

```text
draft
pending_approval
approved
rejected
applied
cancelled
pending_post_lock_approval
```

## Audit

Audit events should cover:

- Lock requested.
- Lock approved/rejected.
- Lock became effective.
- Unlock requested.
- Unlock approved/rejected.
- Unlock became effective.
- Lock policy change proposed/approved/rejected/effective.
- Post-lock adjustment created/approved/rejected/applied.
- Refund created/approved/rejected/applied/cancelled.

## Non-goals

- Silent edits to locked records.
- Irreversible permanent lock.
- Cross-group governance votes.
- Refunds implemented only as negative expenses.
