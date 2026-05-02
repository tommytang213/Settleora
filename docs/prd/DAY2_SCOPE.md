# Settleora Day 2 Scope

## Purpose

Day 2 adds high-value product capabilities after the Day 1 MVP is usable. These features improve multi-currency support, group workflows, settlement quality, reconciliation, statement checking, and user adoption.

Day 2 features should still be production-shaped. They should be implemented through focused branches with explicit validation.

## Day 2 feature list

### 1. Frankfurter currency exchange

Add daily and historical exchange-rate support using Frankfurter as the first provider.

Capabilities:

- Provider abstraction.
- Frankfurter provider implementation.
- Daily rate fetch.
- Historical lookup by receipt/bill date.
- Exchange-rate table.
- Bill-level FX snapshot.
- Manual exchange-rate override.
- Original amount, exchange rate, and converted amount shown in UI.
- Override audit events.
- Currency-aware forecasting/report support.

Important rule:

```text
Global daily exchange rates are reference data.
Bill exchange-rate snapshots are the financial truth for that bill.
```

Existing bills must not be silently recalculated when new daily rates arrive.

### 2. Guest / accountless group members

Support group members who do not have accounts yet.

Capabilities:

- Guest placeholder member.
- Guest can be included in bills/splits.
- Guest can later claim/link to a real account.
- Guest access and voting rules are explicit.
- Unclaimed guests do not vote on group governance policy changes.

### 3. Payment request / IOU request

Add direct payment-request workflow.

Capabilities:

- Request payment from a user or group member.
- Amount, currency, reason, optional due date.
- Link to bill/settlement where applicable.
- Show payee payment profile details when authorized.
- Track request status.

### 4. Due dates

Add due dates to:

- Settlement requests.
- Payment requests.
- Bills requiring reimbursement.
- Recurring bill generated drafts.
- Group repayment deadlines.

Due dates power reminders and reporting.

### 5. Lockable accounting periods and final locks

Support locking records after review without disabling future group use.

Capabilities:

- Period lock.
- Final lock.
- Unlock request.
- Approval-first lock/unlock.
- Group-configurable approval policy.
- Policy selected during group creation.
- Group lock policy changes require all current group members to approve.
- New bills/refunds inside locked period can be logged as pending adjustments.
- Settlements can continue while locked.
- Admin override only where policy allows, with reason and audit.

Recommended lock states:

```text
open
lock_requested
locked
unlock_requested
reopened
finalized
post_lock_adjustment_pending
```

### 6. Tip support

Support tip fields for restaurant/travel use cases.

Capabilities:

- Tip amount.
- Tip percentage.
- Split equally.
- Split proportional to item cost.
- Manual tip allocation.
- Foreign-currency tip conversion using bill FX snapshot where relevant.

### 7. Same-group-only optional debt simplification view

Add an optional simplified settlement view.

Constraints:

- Only within the same group.
- Only among members who share that group.
- Only from outstanding/unsettled balances.
- Does not mutate original bills, split records, receipt records, or historical settlement history.
- Does not replace the normal balance view.
- User chooses whether to use simplified settlement suggestions.

### 8. Group roles polish

Improve group roles beyond Day 1 basics.

Example roles:

- Owner.
- Admin.
- Member.
- Viewer.

Capabilities:

- Clear permissions.
- Role change audit.
- Role-based group management.
- API-enforced authorization.

### 9. Group invite links

Support invite links.

Capabilities:

- Create invite link.
- Expiry time.
- Max uses.
- Default role.
- Revoke link.
- Audit link create/use/revoke.

### 10. Settlement reminders

Smarter reminders beyond Day 1 notification basics.

Capabilities:

- Remind unpaid members after configured delay.
- Snooze reminder.
- Disable reminders per group.
- Nudge button.
- Reminder preference controls.

### 11. Recurring bill improvements

Improve recurring bill behavior.

Capabilities:

- Auto-create draft before due date.
- Require confirmation before posting.
- Skip one occurrence.
- Pause recurrence.
- End date.
- Variable amount.
- Reuse split template.
- Reminder integration.

### 12. Refunds and reimbursements

Add explicit adjustment records for refunds/reimbursements.

Capabilities:

- Standalone refund.
- Refund optionally linked to one bill.
- Future support for multiple linked bills/items.
- Same-as-original-split allocation.
- Manual allocation.
- Pending approval if refund affects locked period.
- Balance recalculation only after approval.
- Audit all refund actions.

Refunds should be explicit transaction/adjustment records, not only negative expenses.

### 13. Deposits / prepayments / group pool

Support trip/event/household prepayment flows.

Capabilities:

- Member contributes deposit/prepayment.
- Expenses can consume group pool.
- Remaining balance can be refunded later.
- Audit pool movements.

This is more complex than normal split bills and should not block Day 1.

### 14. Member spending summary

Add authorized member-level summary views.

Capabilities:

- Paid total.
- Owes total.
- Receives total.
- Net balance.
- Top categories within authorized scope.
- Unsettled amount.

Authorization rule:

```text
Only show data from bills linked to the relevant group and visible to the current viewer.
```

### 15. Enhanced group dashboard

Beyond Day 1 dashboard basics.

Capabilities:

- Total group spending.
- Outstanding balances.
- Recent bills.
- Unsettled members.
- Upcoming recurring bills.
- Currency summary.
- Receipt review pending.
- Suggested simplified settlements.
- Period lock/finalization status.

### 16. Smart default split memory

Remember prior split choices.

Examples:

- Groceries usually split equally.
- Rent uses fixed shares.
- Restaurant bills use per-item split.

These are suggestions/defaults and must remain editable.

### 17. Favorite / pinned groups

Allow users to pin/favorite active groups.

### 18. Household / trip / event group presets

When creating a group, choose a preset.

Example presets:

- Trip.
- Household.
- Couple.
- Event.
- Colleagues.

Presets configure default behaviors, not hardcoded special cases.

### 19. Localization foundation and Traditional Chinese UI

Day 2 should add Traditional Chinese UI support if Day 1 is English-only.

Capabilities:

- Language preference.
- Traditional Chinese translation set.
- Locale-aware formatting.
- Translated notifications/errors where applicable.

### 20. Dark mode / theme settings

Add theme preferences:

- System default.
- Light.
- Dark.

### 21. Notification preferences

Add user/group notification controls:

- Mute group.
- Per-event toggles.
- Reminder settings.
- Settlement reminder settings.

### 22. FX-aware forecasting improvements

Improve forecasts using Day 2 currency exchange.

Capabilities:

- Forecast foreign recurring bills.
- Use latest known rate or configured forecast rate.
- Mark converted forecast values as estimates.
- Preserve bill-level financial truth separately from forecast estimates.

### 23. Member participation status / default exclude

Support members who remain for history but should not be included in new bills by default.

Statuses:

```text
active
default_excluded
left
```

Behavior:

- Active members included in new bills by default.
- Default-excluded members remain in group but are not selected by default.
- Left members keep historical access only where permitted.
- Old bills retain original participants.
- Old outstanding settlements remain payable.
- Future bill visibility depends on inclusion and authorization.

### 24. Statement upload and reconciliation checking

Support CSV statement upload and reconciliation.

Capabilities:

- Upload credit card/bank statement CSV.
- Manual column mapping.
- Save mapping template per account/provider.
- Import statement transactions.
- Match against expenses, settlements, and refunds.
- Auto-suggest matches by date, amount, currency, merchant, payment method, and tolerance.
- Manual link/unlink.
- Show matched, possible match, unmatched, missing, mismatch, duplicate statuses.
- Handle FX/card settled amount differences.
- Keep statement data private by default.

Avoid in Day 2:

- Direct bank API sync.
- Automatic dispute filing with bank.
- Silent mutation of expense records.
- Full universal PDF parser.

## Day 2 non-goals

- AI reporting.
- Bank account API sync.
- Investment tracking.
- Crypto trading rates.
- Automatic financial record mutation from imported statements.
- Cross-group debt simplification.
