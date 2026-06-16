# Settleora MVP Day 1 Scope

## Purpose

Day 1 MVP means the first complete, user-usable Settleora product scope. It is not the current scaffold milestone. Day 1 should be production-shaped and safe, even when delivered through small implementation branches.

## Product principle

Day 1 must support the core expense, shared bill, settlement, receipt, offline, sync, reporting, and security flows that make Settleora usable as a real self-hosted expense and shared-bill platform.

MVP does not mean demo-grade. It means the smallest complete version that can be trusted with real user records.

Day 1 can use simple/guided UI defaults where they reduce clutter, but experience mode does not change backend authority. Money, authorization, storage access, status transitions, and audit remain API/domain-owned regardless of which controls are visible.

## Core Day 1 features

### Accounts, identity, sessions, and security

- User registration and login.
- Local account foundation.
- OIDC/Keycloak-compatible foundation where applicable.
- Secure sessions and revocation-ready session model.
- Device/session visibility.
- Role and permission checks enforced by the API.
- Security-impactful events captured through audit boundaries.

### User profile and payment details

Users can configure optional payment details so settlement counterparties know how to pay them.

Supported profile concepts:

- Display name.
- Preferred currency.
- Preferred payment method note.
- Optional payment handle or identifier, such as FPS, PayMe, Wise, Revolut, Venmo, bank label, or user-entered payment note.
- Optional QR/payment image attachment through storage abstraction.
- Visibility setting.

Recommended default visibility:

```text
settlement_counterparties_only
```

Payment details must not be globally visible by default.

### Expenses and bills

- Create, edit, archive, and restore expenses/bills.
- Personal expenses.
- Shared bills.
- Multi-payer expenses.
- Optional payment method on bill.
- Merchant field.
- Category field.
- Tags if included in Day 1 PRD.
- Notes/comments.
- Multiple attachments per expense.
- Receipt/photo sharing with authorization checks.
- Bill creation on behalf of another payer, with separate `created_by`, responsible bill owner/editor, and `paid_by` confirmation.
- Participant correction proposals through pending bill revisions.
- One active pending official bill revision at a time in Day 1.
- Proposal withdrawal, revision, and resubmission before acceptance/application.
- Revision-specific approval based on accepted amount, currency, and calculation hash.
- Only affected users re-approve money-impacting changes.
- The paid-by person re-confirms if payer role, paid amount, payer contribution, or their financial share changes.
- Pending revision review uses server-generated baseline, changed-only markers, accessible marker labels, category summary, and viewer-specific financial-impact context. Clients render that context and must not decide affected-user state, authorization, payer confirmation truth, money impact, or financial truth.
- Full item, split, adjustment, attachment/receipt/OCR review, note, and metadata highlighting remains limited until revision snapshots preserve those details.
- Minimal temporary participants for real shared receipts where someone has not registered yet, with limited permissions and later account linking.

Payment method on a bill is optional. It is a hint for statement reconciliation, not a mandatory input.

### Money handling

- Decimal-safe monetary amounts.
- Currency attached to every amount.
- Centralized rounding policy.
- Server-side authoritative financial calculations.
- API/domain services own settlement, split, rounding, tax treatment, receipt-total reconciliation, and status transitions.
- Receipt total mismatch must become a reviewable validation state or explicit adjustment, not a silent mutation of item totals, tax groups, discounts, refunds, or participant shares.
- Manual exchange-rate snapshot support for Day 1 travel bills where original currency differs from settlement/display currency; provider-based exchange rates remain Day 2+.
- Manual exchange-rate edits are money-impacting when they change participant shares or settlement amounts.
- Bill-level FX snapshots are financial truth for converted bills. Provider/global/resolved FX rates are future reference/cache inputs and must not silently recalculate existing bills.
- Future currency registry work should preserve three-letter currency-code snapshots on financial records even if currencies also have UUID internal primary keys.

### Shared groups

- Create groups.
- Add and manage group members.
- Group member roles sufficient for Day 1.
- Member access controlled by API authorization.
- Group bills and balances.
- Group dashboard basics.
- Minimal temporary/guest-like participants can be included in Day 1 bills where policy allows, without governance voting or account-level permissions until linked to a real account.
- Users must not see expenses unrelated to them unless group policy and authorization permit it.

### Splitting

Day 1 must support realistic shared-bill splitting.

Required split capabilities:

- Bill-level split.
- Per-item split.
- Quantity-level item claiming, such as one user claiming 1 of 3 units and another claiming 2 of 3 units.
- Open/self-claim item workflow where the uploader can leave items unassigned or claimable because they do not know who ordered what.
- Equal split.
- Exact amount split.
- Percentage/share split if feasible, or clear schema extension point if implemented immediately after Day 1.
- Member exclusion per bill/item.
- Multi-payer expenses.
- Tax and service charge allocation.
- One bill containing multiple tax-rate or tax-category groups, including item-level tax categories such as reduced 8% and standard 10% receipt lines.
- Mixed tax-included and tax-excluded item amounts in the same bill, including receipt labels such as `税込`, `税入`, `税抜`, and `稅前` where visible.
- Item-level and bill-level discount treatment before tax or after tax, with unknown/manual state instead of global guessing.
- Tax follows the item by default, including when that item is split among multiple participants or claimed by quantity, unless an explicit manual override is reviewed and accepted.
- Receipt-level grouped tax totals must allocate only across matching items in the same tax group; a participant assigned only reduced-rate items must not silently receive standard-rate tax.
- Merchant-side item returns, tax refunds, product refunds, and tax corrections linked to a bill must preserve the same tax group and split relationship as the original item or tax group.
- Safe default classification for coupons, points redemption, gift card payment, store credit, payment tender, change returned, voided lines, free items, returns, and unknown negative lines.
- User-editable contribution treatment for points redemption, gift cards, store credit, refund credits, and other payment-like components; Day 3 may add smarter/customizable defaults, but Day 1 must be editable without Day 3.
- Generic extra fee/financial component support for service charge, delivery fee, packaging fee, bag fee, seat charge, surcharge, and similar fee types without one hardcoded table per fee type.
- Extra fee components can carry tax category, tax rate snapshot, tax-included/tax-excluded mode, allocation method, and source OCR line where relevant.
- Combo/set/bundle line correction, allowing one receipt line to split into multiple logical items while preserving the original OCR source line.
- Manual adjustment line.
- Centralized rounding adjustment policy.

Resolved shares must be stored clearly so historical calculations remain stable. Multi-tax-rate bill architecture details are defined in [../architecture/EXPENSE_BILL_MULTI_TAX_RATE_ARCHITECTURE.md](../architecture/EXPENSE_BILL_MULTI_TAX_RATE_ARCHITECTURE.md). Day 1 receipt and bill edge-case details are defined in [../architecture/DAY1_RECEIPT_BILL_EDGE_CASE_ARCHITECTURE.md](../architecture/DAY1_RECEIPT_BILL_EDGE_CASE_ARCHITECTURE.md).

Required Day 1 validation coverage includes mixed 8%/10% tax groups, tax-included lines, tax-excluded lines, mixed tax-included/tax-excluded bills, before-tax discounts, after-tax discounts, tax-group-limited refunds/returns, quantity-level claiming, open/self-claim unresolved item handling, coupon/points/gift-card/default contribution behavior, tender/change exclusion, fee tax treatment, OCR line reclassification, manual FX snapshot, temporary participant inclusion without account permissions, receipt-total mismatch review/error state, and deterministic rounding residual assignment.

### Receipt capture and OCR

- Mobile receipt capture/import.
- Day 1 receipt capture/import includes policy-driven receipt image normalization before OCR/upload/storage.
- Existing photo, file, share-sheet, offline-queue, web, and replacement uploads must not bypass receipt image normalization policy.
- Receipt images default to normalized JPEG, and raw source retention is off by default.
- On-device OCR as required mobile capability.
- Server OCR worker as complementary path, not the only OCR path.
- OCR review screen.
- User correction of OCR fields.
- Receipt item correction workflow.
- OCR review must preserve and allow correction of item-level tax rate/category, tax-included versus tax-excluded interpretation, discount tax treatment, returned/refunded lines, tax corrections, and receipt-level tax summaries before server-mode acceptance.
- OCR review must let users merge/split OCR lines, reclassify lines as item/tax/fee/discount/coupon/points/tender/change/void/free/refund/tax-correction/manual-review, and link derived logical items back to the original OCR line.
- OCR review must identify tender, cash, change, voided, free, zero-price, and unknown negative lines so they do not silently affect participant shares.
- Merchant cleanup/normalization basics.
- Duplicate receipt/expense warning.
- OCR-derived server-mode data remains provisional until API validation.
- Receipt files go through storage abstraction.
- No direct filesystem/storage paths in API responses.

### Settlement workflow

- Settlement request/create.
- Settlement baskets that include one or more outstanding bill/share lines.
- Pay all outstanding for one counterparty.
- Select all visible eligible outstanding lines after filters.
- Exact selected total vs actual paid amount display.
- Explicit residual handling for underpayment/overpayment.
- Mark as paid.
- Partial payments.
- Receiver confirmation.
- Multi-step settlement approval flow.
- Settlement proof attachments, optional.
- Settlement notes.
- Payment profile display to authorized counterparties.
- Settlement audit events.
- Pending bill revisions must not silently mutate settlement balances or selected outstanding lines.
- Accepted/applied bill revisions that affect settlement amounts must flag, reopen, or adjust affected settlements only through explicit policy.

Recommended settlement states:

```text
requested
partially_paid
marked_paid
confirmed
disputed
cancelled
```

### Approval, acknowledgement, and dispute basics

Day 1 should support lightweight trust workflows:

- Bill acknowledgement.
- Comments or notes on shared bills.
- Change approval for money-impacting edits.
- Dispute/correction request.
- Participant correction proposals through pending bill revisions.
- A single active pending official revision per bill in Day 1.
- Proposal withdrawal/edit/resubmission by the proposer before acceptance/application.
- Revision-specific approvals; rejected or superseded proposal approvals do not silently carry to another revision.
- Affected-participant-only re-approval for money-impacting changes.
- Paid-by confirmation when payer/payment facts are created or changed on behalf of another user.
- Server-authoritative revision review context so no-baseline users default to full-bill review and users with safe active/prior revision baselines may use changed-only review.
- Statuses such as `needs_review`, `disputed`, and `resolved`.

### Notifications

Day 1 should include basic in-app notifications.

Required events:

- New shared bill assigned to user.
- Bill updated.
- Bill requires acknowledgement/approval.
- Bill correction proposed, revised, withdrawn, accepted, rejected, or applied.
- Item claim requested, claimed, conflicted, unresolved, or ready for owner review.
- Settlement requested.
- Settlement marked paid.
- Settlement confirmed/disputed.
- Settlement proof attached.
- Recurring bill due soon.
- Sync conflict or failure.
- Important security/session event.
- OCR completed/failed if server OCR is used.

Email/push can be Day 2 or later. In-app notification is the Day 1 baseline.

### Recurring bills and forecasting basics

- Basic recurring bill creation.
- Basic recurring bill schedule.
- Due soon visibility.
- Basic forecast from recurring bills.
- User confirmation path for generated recurring bill instances where needed.

### Reconciliation basics

Day 1 should include basic reconciliation concepts, not full statement checking.

- Manual reconciliation status.
- Monthly report support.
- Search/filter by reconciliation-related fields where available.
- Later Day 2 statement import can build on this.

### Search, filters, reports, import/export

Day 1 includes:

- Advanced search/filter.
- Monthly reports.
- CSV export.
- CSV import.
- Local backup/restore.
- Group dashboard basics.

### Storage and privacy

- All file bytes go through storage abstraction.
- File metadata belongs in PostgreSQL.
- API responses use stable file IDs, not direct storage paths.
- File reads/writes require API authorization.
- Other image attachments are normalized according to purpose-specific upload policy so payment proofs, QR images, screenshots, and high-resolution camera images remain bounded and readable.
- Allowed types, source size, normalized size, attachment counts, retention, and normalization behavior are configurable in admin policy, bounded by deployment hard caps.
- The API enforces upload limits, file-purpose policy, byte/content validation, retention rules, and storage abstraction regardless of client behavior.
- Receipt, statement, payment proof, and QR files are sensitive application data.
- Day 1 supports two user-selectable privacy modes where deployment/admin policy allows them: `standard_secure` and `recoverable_private_vault`.
- Standard Secure Mode is the Day 1 default privacy mode.
- Recoverable Private Vault is the Day 1 user-selectable direction for selected sensitive data such as payment details, private notes, receipt images, OCR raw text where stored, and settlement proof files.
- Users can choose or change privacy mode only within deployment/admin policy, including policies that disable vault features, allow Standard only, allow Recoverable Private Vault, or require Recoverable Private Vault for sensitive data.
- Strict Private Vault is a future-compatible architecture path, not a Day 1 implementation unless explicitly requested later.
- Users should have a future migration path from Recoverable Private Vault to Strict Private Vault, including key rotation or re-wrapping, removal or disablement of recovery envelopes, audit events, clear warnings about recovery-key loss, and older backup retention caveats.
- Core financial truth remains API/domain-authoritative: money, currency, split shares, settlement states, authorization, audit, sync state, and shared accounting truth must not move into client authority because of vault protection.
- Privacy vault architecture details are defined in [../architecture/PRIVACY_VAULT_ARCHITECTURE.md](../architecture/PRIVACY_VAULT_ARCHITECTURE.md).

### Sync and offline

- Local-only profiles are locally authoritative.
- Server-mode profiles are server-authoritative.
- Offline changes queue locally.
- Day 1 does not implement Settleora Cloud, but it must avoid making explicit export, import, backup, restore, or migration paths impossible later.
- Local-only data and server/cloud data must not silently merge; any move between authority boundaries requires explicit user-approved migration or import/export.
- Future Settleora Cloud compatibility does not reduce the Day 1 local-only or self-hosted scope.
- Sync states include:

```text
queued
synced
conflict
failed
```

- Conflicts preserve local pending edits until resolved.

### Soft delete and archive

Day 1 should include safe deletion behavior:

- Archive instead of destructive delete for financial records.
- Restore where safe.
- Deletion restrictions when settlements/audits depend on records.
- Audit events for archive/restore/delete attempts.

## Day 1 language scope

Day 1 UI may be English-only.

However, Day 1 implementation should be localization-ready:

- UI strings should not be hardcoded everywhere.
- Date/time/currency formatting should be locale-aware.
- Backend should return stable error codes separate from localized display text.
- Notification templates should be translation-ready.

Traditional Chinese support is planned for Day 2.

## Day 1 non-goals

- Direct bank API sync.
- Full PDF bank statement parsing.
- AI reporting or AI categorization.
- Provider-based FX automation.
- Crypto rates.
- Investment tracking.
- Automatic dispute filing with banks.
- Silent AI or import-driven financial record mutation.
- Multiple competing active official correction proposals per bill in Day 1.
- Silent bill-revision-driven settlement mutation.
- Requiring every participant to have a registered account before a receipt can be captured.
- Settleora Cloud runtime, managed provisioning, shared multi-tenant SaaS, federation, and cross-server live collaboration.
