# Settleora Day 2 Scope

## Purpose

Day 2 adds high-value product capabilities after the Day 1 MVP is usable. These features improve multi-currency support, group workflows, settlement quality, reconciliation, statement checking, payment-request handoff, and user adoption. Payment provider integration remains Day 3/future unless separately approved.

Tommy's Day 1 decisions mean Day 2 is not the first existence of passkeys/MFA, friends/direct sharing, push/email notification channels, or Basic/Guided/Advanced/Help-me-decide experience mode baseline. Day 2 may still add deeper policy, provider, preference, role, guest/member, and UX polish around those areas.

Payment provider integration such as PayPal, FPS/HKQR generation, provider payment attempts, provider webhooks, and provider-generated payment instructions is Day 3/future unless separately approved. AI insights are future/Day 3+ and are not approved as a Day 1 or Day 2 blocker.

Day 2 features should still be production-shaped. They should be implemented through focused branches with explicit validation.

## Day 2 feature list

### 1. Frankfurter currency exchange

Add daily and historical exchange-rate support using Frankfurter as the first provider.

Capabilities:

- Currency registry with UUID internal IDs, three-letter public/business codes, lifecycle states, usability flags, and no physical deletion after use.
- Provider abstraction.
- Frankfurter provider implementation.
- Raw provider rate set and quote storage.
- Daily rate fetch.
- Daily materialized ordered-pair rates for a configured common currency universe.
- On-demand historical lookup for rare currencies when bill creation/import needs it.
- Historical lookup by receipt/bill date.
- Resolved pair-rate cache when rates are actually used.
- Bill-level FX snapshot.
- Manual exchange-rate override.
- Group and trip/context FX profiles with directional rules.
- Group/context FX profile proposal and affected-participant approval flow.
- Bill-create FX source priority across manual override, context rule, group rule, recurring template rule, provider direct/inverse/cross-rate, and manual input.
- Original amount, exchange rate, and converted amount shown in UI.
- Override audit events.
- Currency-aware forecasting/report support.

Important rule:

```text
Global daily exchange rates are reference data.
Bill exchange-rate snapshots are the financial truth for that bill.
```

Existing bills must not be silently recalculated when new daily rates arrive.

Default common currency universe should start with USD, EUR, JPY, GBP, CNY, AUD, CAD, CHF, HKD, and SGD, with an optional common-20 preset and regional packs such as Asia travel, Europe, and Middle East. Full ordered-pair materialization for 20 currencies is roughly 138,700 rows/year and is acceptable; larger universes should support PostgreSQL partitioning by requested rate date and automated retention.

### 2. Guest / accountless group members

Support group members who do not have accounts yet.

Day 1 still includes minimal temporary participants for practical receipt capture and approved friend/direct sharing for registered users. Day 2 guest/accountless group members expand that baseline into fuller guest/member behavior.

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

Day 1 may include friend/direct sharing and basic group roles. Day 2 can expand group roles, guest/member behavior, and invitation/link workflows without treating direct sharing as future-only.

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

Push and email notification channel baselines are Day 1 after Tommy's decision. Day 2 reminder work should add smarter timing, snooze, nudge, group-level controls, and preference polish rather than first push/email existence.

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

Trip/event behavior should start with group expense contexts before full nested groups. A context can carry participants, default bill currency, default settlement/reporting currency, and its own FX profile.

### 19. Experience modes and advanced feature toggles

Expand user-facing experience presets and advanced feature toggles while preserving one backend authority model.

Basic/Guided/Advanced/Help-me-decide mode baseline is Day 1 after Tommy's decision. Day 2 can add polish, additional advanced toggles, richer policy defaults, and dashboard customization beyond the Day 1 baseline.

Recommended presets:

```text
simple
guided
advanced
```

Individual advanced toggles can include `advanced_fx`, `advanced_splits`, `group_contexts`, `approval_policy_controls`, `reconciliation`, `advanced_recurring`, `receipt_ocr_review_details`, `settlement_proof_details`, `audit_history`, `sync_status_details`, `import_export_advanced`, and `dashboard_customization`.

Toggles control visibility and workflow depth only. They do not change backend financial truth, security, authorization, or audit requirements. Feature visibility should resolve through system policy, role/permissions, group policy, user preference, and screen context, in that order.

### 19. Localization foundation and Traditional Chinese UI

Day 2 should add Traditional Chinese UI support if Day 1 is English-only.

Capabilities:

- Language preference.
- Traditional Chinese translation set.
- Locale-aware formatting.
- Translated notifications/errors where applicable.

### 20. Theme settings

Add theme preferences. Scope this as themes, not only dark mode; Day 2 may include multiple built-in themes if design and implementation are approved.

- System default.
- Light.
- Dark.

### 21. Notification preference polish

Day 1 includes baseline admin policy, user preferences, quiet hours, digest/immediate options, per-event category preferences, and group mute. Day 2 can add deeper reminder and preference polish:

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
- Match against expenses, settlements, refunds, and payment records.
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

### 25. Future Day 3+ payment instruction and provider integration

Payment-provider-aware settlement support is Day 3/future after the Day 1 manual settlement flow and Day 2 reconciliation foundations exist. This section records direction only; it is not a Day 2 implementation commitment.

Capabilities:

- Payment method profiles support manual display, QR/payment instruction generation, and linked provider connections.
- Generate country/provider-aware payment instructions where supported, such as FPS/HKQR, SEPA EPC QR, PayPal links/API, and custom QR.
- Show available payment methods on settlement and payment-request screens based on payee profile, authorization, currency, provider capability, and policy.
- Keep payer-claimed payment, provider-verified payment, receiver confirmation, and dispute/reopen states as separate concepts.
- Support optional provider payment attempts, with PayPal as the first direct API candidate.
- Store provider payment events separately from settlement records.
- Provider events may update settlement evidence/status only through API/domain settlement policy.
- Provider webhooks must be verified, idempotent, audited, and safe to replay.
- Manual mark-paid and receiver confirmation remain available for every payment method.
- Provider verification must not silently bypass receiver confirmation unless user/group policy explicitly allows auto-confirm.
- Linked provider connections may support incoming transaction reflection when provider access, user consent, and policy allow.
- Imported incoming provider transactions are private to the linked account owner by default.
- Incoming provider transactions can be matched against settlements, payment requests, refunds, or reimbursement records.
- High-confidence matches may create provider-verified evidence; low/medium-confidence matches require user confirmation.
- Users can manually link/unlink provider transactions to settlement records.
- Provider secrets/tokens must be stored through a secret boundary, not in profile display data.

Recommended payment evidence types:

```text
payer_claim
proof_attachment
provider_capture
provider_incoming_transaction
statement_match
```

Recommended provider payment states:

```text
created
payer_action_required
payer_approved
captured
provider_verified
failed
cancelled
reversed
disputed
refunded
```

Recommended settlement states for provider-aware flows:

```text
requested
payer_claimed_paid
provider_verified
receiver_confirmed
disputed
cancelled
reopened
```

Important rule:

```text
Provider evidence proves money movement evidence.
Receiver confirmation proves settlement acceptance.
```

Non-goals for initial payment integration:

- Direct bank API sync as the first provider integration.
- Silent settlement confirmation from weak or unmatched provider events.
- Treating provider webhook payloads as authoritative without API/domain validation.
- Exposing raw provider transaction data to group members by default.
- Using provider integration to bypass settlement authorization, audit, or policy.

## Day 2 non-goals

- AI reporting.
- AI insights, categorization, summaries, Q&A, anomaly explanation, or provider settings as Day 1/Day 2 blockers.
- Bank account API sync.
- Investment tracking.
- Crypto trading rates.
- Automatic financial record mutation from imported statements or provider events.
- Cross-group debt simplification.
- Direct bank/e-wallet payment initiation without explicit provider support and security review.
- Payment provider integration such as PayPal/FPS QR generation, provider payment attempts, provider webhooks, or provider-generated payment instructions.
