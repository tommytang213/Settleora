# Settleora UI/UX Foundation

## Purpose

This document captures the approved Settleora UI/UX foundation before major mobile, user web, or admin web implementation begins. It is a planning artifact for product experience and implementation constraints only.

It does not authorize UI code, backend behavior, API contract changes, schema changes, generated client changes, worker behavior, or runtime feature work by itself.

## Approved Direction

Settleora uses **Option B2 - Group-First Shared Life + Reusable Dashboard Layout Profiles**.

The product should feel like a warm, polished, finance-grade shared-life tool: friendly enough for households, couples, trips, and friend groups, but trustworthy enough for real money, private receipts, settlement proof, and self-hosted administration.

The default visual style is **Warm Fintech Groups / 暖色社交理財**, with orange as the primary accent. Mobile, user web, and admin web are all planned first-class surfaces.

## Product Experience Principles

1. **Group-first, personal-aware.** Shared life is the default mental model, but personal expenses, private reports, local-only mode, and self profile flows remain visible and ergonomic.
2. **Action before navigation.** Pending work should surface in an Action Inbox, dashboard widgets, and contextual banners before users have to hunt through screens.
3. **Finance-grade trust.** Money, currency, rounding, settlement state, sync acceptance, authorization, storage access, and audit-sensitive actions must visibly defer to server or local authority boundaries.
4. **Friendly mismatch recovery.** Total differences, split mistakes, OCR uncertainty, duplicate candidates, FX differences, sync conflicts, and payment mismatches should be handled through guided review rather than abrupt errors.
5. **Progressive complexity.** Common flows should be short; advanced split, privacy, admin, conflict, and reconciliation controls should be available without crowding the first path.
6. **Explicit mode boundaries.** Local mode and server mode must be visually and behaviorally distinct where needed. Local profile data must not silently become a server account.
7. **Reusable personalization.** Dashboards are reusable profiles that can apply across personal, group, and admin contexts rather than one-off layouts.
8. **Accessible by default.** Color, motion, density, language, keyboard navigation, screen reader structure, and touch targets must work for repeated financial use.

## Surface Model

### Mobile App

Mobile is the capture, review, action, and on-the-go settlement surface. It should prioritize:

- First launch setup and mode choice.
- Home dashboard or user-selected landing destination.
- Groups and last opened group.
- Scan receipt and quick add expense.
- Action Inbox.
- Receipt OCR review.
- Split editing with guided mismatch handling.
- Settlement request/payment confirmation.
- Offline queue, sync status, and local privacy controls.

Mobile should avoid tiny grid-resizing interactions. Dashboard personalization on mobile is show, hide, reorder, template selection, and widget setting edits.

### User Web Portal

User web is the workspace surface for deeper review, reporting, dashboard customization, batch actions, and group management. It should prioritize:

- Dashboard, groups, last opened group, Action Inbox, receipts/OCR, settlements, recurring and forecast, or last visited page as user-selectable landing choices.
- Larger-screen dashboard drag, reorder, and resize.
- Multi-pane group workspaces.
- Rich split editor and receipt review.
- Search, command palette, filters, exports, and reporting.
- Settlement baskets and reconciliation preparation.

### Admin Web Portal

Admin web is an operational surface, not a consumer dashboard. It should be dense, restrained, auditable, and optimized for monitoring and policy work:

- Health, readiness, and deployment status.
- Users, roles, sessions, invitations, and auth policy where implemented.
- Storage, file metadata, OCR worker queues, notification queues, and job failures where implemented.
- Audit review and export where implemented.
- Config and policy controls with explicit warnings.

Admin UI must not imply that administrators can bypass backend authorization, privacy vault policy, storage policy, audit requirements, or least-privilege defaults.

## First Launch

First launch must clearly offer:

- **Connect to Server.** For self-hosted collaboration, group bills, server-mode sync, web access, admin policy, and API-authoritative business state.
- **Use Local Mode.** For local-only personal use on the device, with local OCR and local records where implemented.

The first-launch choice should explain the practical difference without alarming the user:

- Server mode requires a server URL and authentication where required.
- Local mode does not create a server account.
- Local mode does not support server collaboration, friends, server groups, user web, or admin web.
- Local-to-server import/link is explicit and guided.
- Server-to-local export/disconnect is explicit and guided.

The first-launch screen should not hide either path in secondary text. It must be clear that both are valid modes.

## Local And Server Mode UX

### Local Mode

Local mode is locally authoritative for local-only profile data. It should feel private, simple, and device-bound.

Local mode UX must:

- Label local-only state clearly in settings and mode-sensitive screens.
- Support local backup/export concepts where implemented.
- Use on-device OCR as the primary OCR path.
- Avoid server-only concepts such as group collaboration, admin web, or shared settlement unless a future explicit local multi-user design is approved.
- Warn before actions that could affect local data retention, local export, or local privacy.

### Server Mode

Server mode is API-authoritative for collaborative and shared records. It should feel connected, synced, and governed by server policy.

Server mode UX must:

- Show authenticated account/session state.
- Show sync states such as queued, synced, conflict, and failed.
- Treat offline edits as pending until the API validates and accepts them.
- Mark OCR-derived data as provisional until accepted by API validation.
- Defer authorization, money, settlement, storage, audit, and policy decisions to server responses.

### Migration And Export

Local to server migration must be an explicit guided import/link flow:

- Review what will be imported.
- Match or create the server account/profile through approved auth flows.
- Show duplicates, mismatches, unsupported records, and privacy implications.
- Preserve local data until the user confirms import handling.
- Avoid silently converting a local profile into an authenticated server account.

Server to local export/disconnect must be an explicit guided snapshot/export flow:

- Explain what data can be exported based on authorization and server policy.
- Warn that server collaboration state remains on the server unless separately archived or deleted through authorized server flows.
- Preserve audit-sensitive and privacy-sensitive rules.
- Avoid presenting export as a way to bypass retention, authorization, or storage policy.

## Navigation Direction

### Mobile Navigation

Recommended mobile primary navigation:

- Home.
- Groups.
- Scan or Add.
- Action Inbox.
- Settings.

Contextual routes should cover group detail, bill detail, receipt review, split editor, settlement, reports, search, and conflict review. The central action affordance may open scan receipt, quick add expense, or a configurable quick action.

### User Web Navigation

Recommended user web structure:

- Dashboard.
- Groups.
- Bills and Expenses.
- Receipts/OCR.
- Settlements.
- Recurring and Forecast.
- Reports.
- Action Inbox.
- Settings.

Search and command palette should be globally available. Group workspace pages should keep group context visible while allowing quick movement among overview, bills, settlements, receipts, members, reports, and settings.

### Admin Web Navigation

Recommended admin web structure:

- Overview.
- Health and Runtime.
- Users and Access.
- Audit.
- Storage.
- Workers and Queues.
- Policy and Config.
- Maintenance.

Admin navigation should privilege scanning, filtering, auditability, and safe bulk operations over decorative presentation.

## Action Inbox

The Action Inbox is a first-class pattern across mobile and web. It gathers user-actionable items without becoming the source of truth.

Action Inbox items may include:

- Bills requiring acknowledgement or approval.
- OCR reviews needing correction.
- Split total mismatches.
- Settlement requests, payment claims, confirmations, disputes, and proof reviews.
- Sync conflicts and failed queued changes.
- Duplicate candidates.
- Recurring bill drafts due for review.
- Security/session notices requiring action.
- Admin health or queue issues for authorized admins.

Rules:

- Inbox visibility does not grant access.
- Each action must deep-link to the authoritative subject screen.
- Completed, dismissed, or unavailable actions should resolve based on server/local authority state.
- Stale actions should revalidate before mutation.
- Security-impactful and money-impacting actions should clearly show actor, subject, amount, currency, and consequence.

## Core Flow Direction

### Group Workspace

The group workspace should provide a shared-life operating view: current balances, recent bills, pending actions, receipt reviews, settlement suggestions, members, recurring/forecasting, and group settings. It should keep member and group context visible while allowing users to move quickly into bill, split, OCR, and settlement tasks.

Group dashboards are personalized per user and per group where needed. Another user's group dashboard layout does not change mine.

### Receipt/OCR Review

Receipt review should show the image or file preview, extracted fields, extracted line items, confidence or uncertainty, and editable fields in one guided flow. OCR data remains provisional until the user confirms and, in server mode, the API validates and accepts it.

Receipt review must support mismatch review for:

- Receipt total mismatch.
- OCR confidence mismatch.
- Duplicate candidate.
- Currency/FX mismatch.

### Split Editor

The split editor should make money correctness visible:

- Bill total.
- Item totals.
- Participant shares.
- Tax, service charge, discount, and manual adjustments.
- Rounding difference.
- Currency.
- Per-participant owed/paid/receives summary.

Users should be able to fix split total mismatch and rounding mismatch through guided suggestions and manual edits. The server remains authoritative for accepted server-mode calculations.

### Settlement

Settlement UX should separate:

- What is owed.
- What is being requested.
- What is claimed paid.
- What is confirmed received.
- What is disputed or cancelled.
- What residual remains.

Payment profile display must be authorized and purpose-specific. Proof attachments are optional evidence, not automatic confirmation. Receiver confirmation and server policy remain authoritative.

### Sync, Offline, And Conflict

Sync UX should consistently use:

- Queued.
- Synced.
- Conflict.
- Failed.

Conflicts must preserve local pending edits until resolved. Conflict screens should show local version, server version, difference, suggested fix, and manual resolution options. Users should be able to retry, edit, discard local change where safe, or keep pending if policy allows.

### Privacy Mode

Privacy mode should be visible where sensitive amounts, receipts, payment details, proof files, private notes, OCR raw text, or statement data appear.

Amount-hiding privacy mode should:

- Hide or blur monetary amounts on dashboards, lists, widgets, screenshots, and previews.
- Keep currency and relative status understandable where possible.
- Require deliberate reveal for sensitive views.
- Avoid changing authorization, money calculations, server validation, or audit behavior.

### Reports And Forecasting

Reports and forecasting should help users understand spending and upcoming obligations without implying automatic mutation. Forecasts are estimates unless backed by confirmed records. FX-aware forecasts must distinguish reference rates from bill-level financial truth.

### Archive, Trash, And Destructive Actions

Archive/trash UX must prefer reversible actions for financial records. Permanent deletion or purge paths, where policy allows them, require clear warnings, authorization, and audit-sensitive treatment.

Records with settlement, audit, storage, or reconciliation dependencies should explain why deletion is blocked or restricted rather than offering unsafe shortcuts.

## Reusable Mismatch Review Pattern

Mismatch review must be a reusable UI pattern for:

- Receipt total mismatch.
- Split total mismatch.
- Rounding mismatch.
- Currency/FX mismatch.
- Sync conflict.
- Duplicate candidate.
- OCR confidence mismatch.
- Settlement/payment mismatch.
- Future statement reconciliation mismatch.

Every mismatch review should show:

- Expected value.
- Observed value.
- Difference.
- Suggested fix.
- Manual edit options.
- Authority source.
- Consequence of accepting, editing, or dismissing.

For money, the pattern must show amount and currency together. In server mode, accepting a suggested fix still requires server validation where the action writes core business state.

## Backend Authority Reminder

Future UI must preserve these architecture boundaries:

- The ASP.NET Core API is authoritative for server-mode core business writes.
- Frontends own presentation, form state, cache, and offline queues, not server authorization or authoritative business rules.
- Clients must not infer authorization from routes, hidden widgets, cached data, or UI state.
- Money remains decimal-safe, currency-attached, and server-authoritative in server mode.
- Rounding policy is centralized.
- Storage bytes go through the storage abstraction; API responses must not expose direct filesystem or storage paths.
- On-device OCR is required; server OCR worker is complementary.
- Server-mode OCR-derived data remains provisional until API validation.
- Sync conflicts preserve local pending edits until resolved.
- Configurable behavior should flow through policy, config, or profile preference systems.
- Auth, session, security, money, sharing, settlement, and storage-sensitive events must be auditable where applicable.
