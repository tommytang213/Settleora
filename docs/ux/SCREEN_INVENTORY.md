# Screen Inventory

## Purpose

This inventory lists implementation-facing screens for future Settleora mobile, user web, and admin web work. It captures purpose, key actions, important states, and implementation notes without authorizing runtime implementation.

Future implementation branches should verify current backend/API support before building live surfaces.

## Mobile App

### First Launch

- **Purpose:** Choose server mode or local mode.
- **Key actions:** Connect to Server, Use Local Mode, review mode differences.
- **Important states:** Fresh install, returning local profile, existing server session, invalid server URL, offline.
- **Notes:** Local profile data must not silently become a server account. Server setup must stay separate from local use.

### Server Connection Setup

- **Purpose:** Configure self-hosted server URL and capability discovery where implemented.
- **Key actions:** Enter URL, test connection, continue to sign-in/bootstrap where available.
- **Important states:** Reachable, unreachable, invalid certificate, unsupported version, maintenance mode.
- **Notes:** Do not hardcode production or local URLs. Do not store secrets in setup screens.

### Auth And Session

- **Purpose:** Sign in, show current session, and route to secure app state.
- **Key actions:** Sign in, refresh/retry, sign out, view sessions where implemented.
- **Important states:** Signed out, signing in, authenticated, expired session, revoked session, server unavailable.
- **Notes:** API/session runtime is authoritative. UI session display is not proof of authorization.

### Home Dashboard

- **Purpose:** User-selected landing surface for personal actions and summaries.
- **Key actions:** Open Action Inbox, quick add expense, scan receipt, open groups, open settlements, customize dashboard.
- **Important states:** Normal, privacy mode, offline queued changes, conflict, no records, unavailable widgets.
- **Notes:** Mobile dashboard supports template selection, show/hide/reorder, and widget settings, not tiny grid resizing.

### Groups

- **Purpose:** Browse and enter groups.
- **Key actions:** Create group, open group, search groups, pin/favorite where implemented.
- **Important states:** No groups, removed/inactive membership, offline cached list, unauthorized group.
- **Notes:** Group visibility must be API-authorized in server mode.

### Group Workspace

- **Purpose:** Mobile group operating view.
- **Key actions:** Add bill, scan receipt, review actions, view balances, open settlements, view members.
- **Important states:** Pending actions, receipt reviews, sync conflict, archived group, missing authorization.
- **Notes:** Dashboard layout is per user/group/surface where needed.

### Add Bill Or Expense

- **Purpose:** Create or edit a personal or shared bill draft.
- **Key actions:** Enter merchant/date/currency/amount, add items, attach receipt, choose participants, save draft, submit.
- **Important states:** Draft, validation errors, offline queued, server conflict, unsupported currency, privacy mode.
- **Notes:** Client previews are convenience only; server mode requires API validation.

### Receipt Capture And Import

- **Purpose:** Capture/import receipt files.
- **Key actions:** Take photo, choose file, attach to bill, start on-device OCR, retry.
- **Important states:** Camera unavailable, unsupported file, upload failed, local-only, offline server mode.
- **Notes:** File bytes must go through approved storage paths. Server OCR worker is complementary, not required for mobile OCR.

### Receipt OCR Review

- **Purpose:** Review and correct OCR output.
- **Key actions:** Edit merchant/date/currency/total, edit lines, add/delete lines, review confidence, apply preview, apply draft where supported.
- **Important states:** Provisional, needs review, mismatch, duplicate candidate, apply blocked, applied, removed.
- **Notes:** OCR-derived server-mode data remains provisional until API validation. Do not imply automatic finalization.

### Split Editor

- **Purpose:** Assign bill/items, tax, service charge, discount, and adjustments across people.
- **Key actions:** Choose split method, include/exclude participants, edit shares, review rounding, resolve mismatch.
- **Important states:** Balanced, split total mismatch, rounding mismatch, unsupported method, awaiting acceptance.
- **Notes:** Money must be decimal-safe and currency-attached. Server mode calculations are authoritative.

### Settlements

- **Purpose:** View and act on settlement requests and payments.
- **Key actions:** Request settlement, pay all, claim paid, attach proof, confirm receipt, dispute, cancel.
- **Important states:** Requested, partially paid, claimed paid, confirmed, disputed, cancelled, residual pending.
- **Notes:** Proof is evidence, not automatic confirmation. Payment profile visibility is purpose-specific and authorized.

### Action Inbox

- **Purpose:** Aggregate user-actionable tasks.
- **Key actions:** Open action, approve/reject, review OCR, resolve conflict, confirm settlement, dismiss safe notices.
- **Important states:** Empty, stale action, blocked by authorization, offline, failed refresh.
- **Notes:** Inbox items deep-link to authoritative screens and revalidate before mutation.

### Search And Reports

- **Purpose:** Find records and review financial summaries.
- **Key actions:** Search, filter, open saved view, export where implemented, inspect forecast.
- **Important states:** No results, privacy mode, offline partial data, unsupported export, estimate vs actual.
- **Notes:** Forecasts are estimates unless backed by confirmed records.

### Sync And Conflict Review

- **Purpose:** Show queue and resolve conflicts.
- **Key actions:** Retry, compare local/server, edit local pending change, accept server, discard local where safe.
- **Important states:** Queued, synced, conflict, failed, server unavailable.
- **Notes:** Conflicts preserve local pending edits until resolved.

### Settings

- **Purpose:** User preferences, theme, privacy, local/server mode, exports, account/session access.
- **Key actions:** Change theme, landing, privacy mode, dashboard defaults, local export, server disconnect/export, sign out.
- **Important states:** Local mode, server mode, policy-disabled option, pending sync, destructive warning.
- **Notes:** Settings must distinguish display preferences from policy and authorization.

## User Web Portal

### Web Landing Dashboard

- **Purpose:** User-selected first web view.
- **Key actions:** Open widgets, customize layout, open Action Inbox, search, switch groups.
- **Important states:** Normal, privacy mode, unauthorized widget, empty setup, stale data.
- **Notes:** Web supports drag/reorder/resize. Widget actions must revalidate authority.

### Dashboard Customization

- **Purpose:** Manage reusable dashboard layout profiles.
- **Key actions:** Choose template, duplicate, edit widgets, reorder, resize, assign default, reset.
- **Important states:** System read-only template, custom editable template, incompatible context, missing access.
- **Notes:** Model as System Template -> Layout Profile -> Applied Context.

### Groups Directory

- **Purpose:** List and manage user's groups.
- **Key actions:** Create group, open group, filter, pin/favorite, manage invites where implemented.
- **Important states:** No groups, pending invite, removed membership, unauthorized.
- **Notes:** Route visibility and cached group list are not authorization.

### Group Workspace

- **Purpose:** Desktop shared-life workspace.
- **Key actions:** Review dashboard, bills, receipts, settlements, members, reports, settings.
- **Important states:** Pending actions, balance differences, archived group, conflict, policy-limited features.
- **Notes:** Multi-pane layout should preserve group context.

### Bills And Expenses

- **Purpose:** Browse, create, edit, archive, restore, and inspect bills.
- **Key actions:** Add bill, filter, open detail, submit, acknowledge, reject, propose correction, archive.
- **Important states:** Draft, pending confirmation, rejected, confirmed, finalized, archived, deleted/unavailable.
- **Notes:** Pending bill revisions must not silently mutate settlements.

### Bill Detail

- **Purpose:** Show authoritative bill state and participant impact.
- **Key actions:** Edit where allowed, submit/acknowledge/reject, open split editor, attach receipt, open settlement candidates.
- **Important states:** Unauthorized, read-only, pending review, disputed, draft-only OCR apply available.
- **Notes:** Show actor, owner/editor, payer, participant status, and audit-sensitive state clearly.

### Receipt/OCR Workbench

- **Purpose:** Review OCR queue and detailed receipt extraction.
- **Key actions:** Open review, edit fields, resolve mismatch, apply preview, apply draft where supported.
- **Important states:** Needs review, low confidence, duplicate, currency mismatch, apply blocked.
- **Notes:** Useful as a split-pane web workflow with image/file preview and line table.

### Split Editor

- **Purpose:** Rich desktop split editing.
- **Key actions:** Assign items, edit methods, allocate tax/discount/service, inspect per-person totals, fix mismatch.
- **Important states:** Balanced, mismatch, rounding residual, unsupported method, policy-blocked mutation.
- **Notes:** Keep expected, observed, difference, suggested fix, and manual edit options visible.

### Settlements

- **Purpose:** Manage incoming/outgoing requests, payments, residuals, and proof.
- **Key actions:** Preview candidates, create request, claim paid, confirm, dispute, cancel, upload proof, view payment details.
- **Important states:** Requested, partially paid, claimed paid, confirmed, disputed, cancelled, residual effects.
- **Notes:** Payment profile and proof access must be authorized and purpose-specific.

### Recurring And Forecast

- **Purpose:** Manage recurring bills and forecast upcoming obligations.
- **Key actions:** Create recurring bill, review generated drafts, skip/pause where implemented, inspect forecast.
- **Important states:** Due soon, generated draft, forecast estimate, unsupported FX, policy-disabled.
- **Notes:** Forecast data must distinguish estimates from confirmed records.

### Search, Command Palette, And Reports

- **Purpose:** Navigate quickly and analyze data.
- **Key actions:** Global search, command palette, saved filters, export, monthly report.
- **Important states:** No result, privacy mode, partial/offline data, unauthorized result omitted.
- **Notes:** Search must not leak unauthorized records through suggestions.

### Sync/Conflict Center

- **Purpose:** Review server-mode queued edits, failed sync, and conflicts.
- **Key actions:** Retry, compare, resolve, preserve local pending edits, view failure reason.
- **Important states:** Queued, synced, conflict, failed.
- **Notes:** Conflict review should be reusable with mismatch pattern.

### Settings

- **Purpose:** Profile, payment details, theme, landing, dashboard defaults, sessions, privacy, exports, local/server migration.
- **Key actions:** Update profile, payment profile, theme, landing, dashboard defaults, privacy mode, session revocation, export.
- **Important states:** Policy-disabled field, pending save, session expired, unavailable storage.
- **Notes:** Payment details visibility must be explicit and conservative.

## Admin Web Portal

### Admin Overview

- **Purpose:** Operational summary for owners/admins.
- **Key actions:** Open health, audit, storage, users, queues, policy warnings.
- **Important states:** Healthy, degraded, failed dependency, permission-limited admin.
- **Notes:** Admin overview should be dense, restrained, and evidence-led.

### Health And Runtime

- **Purpose:** Inspect API readiness and dependency status.
- **Key actions:** Refresh, view dependency details where safe, open runbook links.
- **Important states:** Ready, degraded, PostgreSQL unavailable, RabbitMQ unavailable, storage unavailable.
- **Notes:** Avoid exposing secrets, connection strings, physical paths, or provider internals.

### Users And Access

- **Purpose:** Manage users, roles, invitations, sessions, and access policy where implemented.
- **Key actions:** List users, create user, update role, revoke session, inspect account status.
- **Important states:** Owner/admin/user, disabled, invited, locked, session revoked.
- **Notes:** Product roles and group roles remain separate. Admin UI does not bypass API authorization.

### Audit

- **Purpose:** Review security, permission, money, storage, settlement, and admin-sensitive events where implemented.
- **Key actions:** Filter, inspect event, export where authorized, correlate actor/subject.
- **Important states:** No events, filtered, retention-limited, export blocked.
- **Notes:** Audit screens must avoid raw secrets, tokens, full sensitive file contents, and unnecessary PII.

### Storage

- **Purpose:** Inspect storage health, file metadata, lifecycle, and usage where implemented.
- **Key actions:** View usage, filter file objects, inspect lifecycle state, review failures.
- **Important states:** Healthy, near limit, failed provider, soft-deleted, retention blocked.
- **Notes:** Do not expose direct filesystem paths, object keys, or provider internals in unsafe UI.

### Worker Queues

- **Purpose:** Monitor OCR, notification, sync, and future worker queues.
- **Key actions:** View queue health, failed jobs, retry where policy allows, inspect payload metadata.
- **Important states:** Idle, processing, failed, retrying, dead-lettered.
- **Notes:** Workers must not directly mutate core business tables. UI should not imply otherwise.

### OCR Operations

- **Purpose:** Operational view of OCR queue and processing health.
- **Key actions:** Filter jobs, inspect status, retry failed worker tasks where implemented.
- **Important states:** Pending, processing, succeeded, failed, cancelled, unavailable worker.
- **Notes:** Server OCR is complementary to required on-device OCR.

### Policy And Config

- **Purpose:** Manage deployment/admin policy where implemented.
- **Key actions:** Review auth, registration, privacy, storage, retention, notification, feature flags.
- **Important states:** Default, overridden, invalid, pending restart, policy-disabled feature.
- **Notes:** Policy changes affecting auth, sharing, retention, storage, money, or admin exposure require audit-sensitive treatment.

### Backup And Maintenance

- **Purpose:** Inspect backup readiness and maintenance tasks.
- **Key actions:** View status, run safe checks where implemented, open documentation.
- **Important states:** Current, stale, failed, unsupported, unavailable dependency.
- **Notes:** Destructive maintenance actions require warnings, authorization, and audit where applicable.

## Flagship Flow Coverage

Future UI implementation should cover these flagship flows with explicit state handling:

- Setup: first launch, server connection, local mode, local/server migration/export.
- Auth/session UX: sign-in, current user, expiry, sign-out, session visibility, revocation.
- Groups: group list, group workspace, members, group dashboard, permissions.
- Add bill/expense: manual entry, receipt attachment, bill detail, archive/trash.
- Receipt OCR: capture/import, on-device OCR, review, mismatch, apply preview, explicit apply.
- Split editor: item assignment, adjustments, rounding, mismatch review.
- Settlements: request, claim paid, proof, receiver confirmation, dispute, cancellation, residuals.
- Dashboard customization: templates, layout profiles, widget settings, per-surface landing.
- Search/reporting: command palette, filters, monthly report, forecast, export.
- Settings: theme, privacy, profile, payment details, sync, local/server mode.
- Sync/conflict: queue, failed, conflict comparison, retry, manual resolution.
- Admin: health, audit, storage, worker queues, users/access, policy, maintenance.
