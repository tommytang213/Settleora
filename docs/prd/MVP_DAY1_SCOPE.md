# Settleora MVP Day 1 Scope

## Purpose

Day 1 MVP means the first complete, user-usable Settleora product scope. It is not the current scaffold milestone. Day 1 should be production-shaped and safe, even when delivered through small implementation branches.

## Product principle

Day 1 must support the core expense, shared bill, settlement, receipt, offline, sync, reporting, and security flows that make Settleora usable as a real self-hosted expense and shared-bill platform.

MVP does not mean demo-grade. It means the smallest complete version that can be trusted with real user records.

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

Payment method on a bill is optional. It is a hint for statement reconciliation, not a mandatory input.

### Money handling

- Decimal-safe monetary amounts.
- Currency attached to every amount.
- Centralized rounding policy.
- Server-side authoritative financial calculations.
- API/domain services own settlement, split, rounding, and status transitions.

### Shared groups

- Create groups.
- Add and manage group members.
- Group member roles sufficient for Day 1.
- Member access controlled by API authorization.
- Group bills and balances.
- Group dashboard basics.
- Users must not see expenses unrelated to them unless group policy and authorization permit it.

### Splitting

Day 1 must support realistic shared-bill splitting.

Required split capabilities:

- Bill-level split.
- Per-item split.
- Equal split.
- Exact amount split.
- Percentage/share split if feasible, or clear schema extension point if implemented immediately after Day 1.
- Member exclusion per bill/item.
- Multi-payer expenses.
- Tax and service charge allocation.
- Manual adjustment line.
- Centralized rounding adjustment policy.

Resolved shares must be stored clearly so historical calculations remain stable.

### Receipt capture and OCR

- Mobile receipt capture/import.
- On-device OCR as required mobile capability.
- Server OCR worker as complementary path, not the only OCR path.
- OCR review screen.
- User correction of OCR fields.
- Receipt item correction workflow.
- Merchant cleanup/normalization basics.
- Duplicate receipt/expense warning.
- OCR-derived server-mode data remains provisional until API validation.
- Receipt files go through storage abstraction.
- No direct filesystem/storage paths in API responses.

### Settlement workflow

- Settlement request/create.
- Mark as paid.
- Partial payments.
- Receiver confirmation.
- Multi-step settlement approval flow.
- Settlement proof attachments, optional.
- Settlement notes.
- Payment profile display to authorized counterparties.
- Settlement audit events.

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
- Statuses such as `needs_review`, `disputed`, and `resolved`.

### Notifications

Day 1 should include basic in-app notifications.

Required events:

- New shared bill assigned to user.
- Bill updated.
- Bill requires acknowledgement/approval.
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
- Receipt, statement, payment proof, and QR files are sensitive application data.

### Sync and offline

- Local-only profiles are locally authoritative.
- Server-mode profiles are server-authoritative.
- Offline changes queue locally.
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
- Crypto rates.
- Investment tracking.
- Automatic dispute filing with banks.
- Silent AI or import-driven financial record mutation.
