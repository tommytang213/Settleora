# Dashboard Personalization

## Purpose

Settleora dashboards are personalized operating surfaces for personal finances, group work, and admin operations. This document defines the conceptual model for landing preferences, widgets, reusable layout profiles, templates, and assignment behavior.

This document is planning-only. It does not add schema, API, generated clients, frontend code, or runtime dashboard behavior.

## Landing Preferences

Users can choose what opens first separately for web and mobile/app. Landing preferences are display preferences only; they never grant access.

Recommended user web landing choices:

- Dashboard.
- Groups.
- Last opened group.
- Action Inbox.
- Receipts/OCR.
- Settlements.
- Recurring and Forecast.
- Last visited page.

Recommended mobile/app landing choices:

- Home.
- Groups.
- Last opened group.
- Scan receipt.
- Action Inbox.
- Settlements.
- Quick add expense.

Landing resolution should revalidate access. If the preferred destination is unavailable, deleted, hidden by policy, or no longer authorized, the UI should fall back to the nearest safe landing option and explain when helpful.

## Dashboard Model

A dashboard is not only a layout. It is a reusable profile that can be applied to contexts.

Conceptual model:

```text
System Template -> Layout Profile -> Applied Context
```

Definitions:

- **System Template:** Settleora-provided, read-only, versioned, recognizable, duplicable starting point.
- **Layout Profile:** A concrete dashboard arrangement, usually user-created or duplicated from a system template.
- **Applied Context:** Where a layout profile is used, such as personal dashboard, Group A on web, Group B on mobile, or admin overview.

The same conceptual framework should work for personal, group, and admin dashboards.

## Assignment Behavior

Group dashboard configuration is per user, per group, per surface where needed:

- Group 1 + User 1 can have dashboard layout A.
- Group 1 + User 2 can have dashboard layout B.
- Group 2 + User 1 can have dashboard layout C.

Same-user defaults should reduce repeated configuration. Users should be able to choose a default personal dashboard layout, default group dashboard layout, and default layout for common group presets or types.

Assignments are display preferences only. They do not create permissions, widen data visibility, or change server authorization.

## Layout Resolution Order

When choosing which dashboard layout to show, resolve in this order:

1. Explicit layout for this user + this surface + this exact context.
2. User default layout for this dashboard type.
3. User default layout for this group preset/type.
4. Chosen system/user template.
5. Settleora system fallback template.

Each resolution step must still respect authorization, feature availability, server policy, local/server mode, and implemented capability flags.

## System Templates And User Templates

### System Templates

System templates must be:

- Clearly recognizable as Settleora-provided.
- Read-only.
- Versioned.
- Duplicable.
- Customizable only after duplication.
- Safe fallbacks when user preferences are missing or unavailable.

When a system template changes in a future release, users should not lose their customized duplicated profiles. The UI can offer a "review new version" or "duplicate updated template" pattern.

### User-Created Templates

User-created templates must be:

- Clearly marked as custom.
- Editable by the owner where policy allows.
- Reusable.
- Default-able.
- Duplicable.
- Renameable.
- Resettable to a system template where safe.

User templates should preserve context compatibility. A group dashboard profile should not silently become an admin dashboard profile unless a future migration explicitly supports that conversion.

## Widget Capabilities

Dashboard widgets should support:

- Add.
- Remove.
- Hide.
- Edit settings.
- Duplicate.
- Reorder.
- Resize on web.
- Reset to default.

Mobile should support show/hide/reorder, template selection, and widget settings. Mobile should not offer tiny grid-resizing interactions.

Web should support drag, reorder, resize, and density controls where practical. Resize controls should use stable breakpoints and avoid fragile pixel-perfect layouts.

## Widget Authorization Rules

Widgets are views into authorized data. They are not permissions.

Rules:

- A widget must revalidate data access through the normal server/local authority path.
- Hidden widgets do not remove underlying authorization.
- Visible widgets do not grant authorization.
- Cached widget data must not be treated as current authorization.
- Widget actions must re-check permission at action time.
- If access is lost, the widget should show an unavailable or permission-safe empty state rather than leaking old data.
- Admin widgets must only appear for authorized admin/owner roles and must still defer to API authorization.
- Server-mode widgets must not compute authoritative money, settlement, sync acceptance, or policy decisions client-side.

## Widget Catalog Direction

### Personal Dashboard Widgets

Suggested personal widget catalog:

- Action Inbox.
- Spending summary.
- Upcoming recurring bills.
- Forecast next 30/60 days.
- Recent personal expenses.
- Receipt reviews pending.
- Settlements owed by me.
- Settlements owed to me.
- Quick add expense.
- Scan receipt.
- Sync/offline status.
- Privacy mode control.
- Monthly report snapshot.
- Search shortcuts.

### Group Dashboard Widgets

Suggested group widget catalog:

- Group Action Inbox.
- Current group balance.
- Who owes whom.
- Recent group bills.
- Pending acknowledgements.
- Receipt reviews pending.
- Settlement requests.
- Pay all outstanding.
- Upcoming recurring group bills.
- Member spending summary.
- Duplicate candidates.
- Group notes or announcements.
- Group sync/conflict status.

### Admin Dashboard Widgets

Suggested admin widget catalog:

- System health.
- API readiness.
- PostgreSQL status.
- RabbitMQ status.
- Storage status.
- Worker queue status.
- OCR queue status.
- Failed jobs.
- Recent security/audit events.
- User/session summary.
- Storage usage.
- Backup status.
- Policy warnings.
- Version/update notices.

Admin widgets should feel operational, dense, and evidence-led rather than decorative.

## Template Catalog

### Balanced

Primary default for most users. Balanced should include Action Inbox, recent activity, spending summary, receipt review, settlement summary, recurring/forecast, and sync status. It is the safest fallback for personal and group contexts.

### Personal Finance

Primary personal default for users who focus on individual tracking. It should emphasize spending, categories, recurring bills, forecast, reports, receipts, and privacy mode.

### Group Trip

Optimized for travel/event groups. It should emphasize recent bills, receipt capture/review, member balances, settlement requests, pay-all flows, and quick add.

### Household

Optimized for recurring shared life. It should emphasize recurring bills, shared expenses, member balances, due soon, receipts, and monthly reporting.

### Receipt Heavy

Optimized for users or groups with many receipts. It should emphasize scan/import, OCR review queue, duplicate candidates, review progress, and pending apply/validation states.

### Admin Operator

Default admin template. It should emphasize health, queues, storage, audit, sessions, failed jobs, backup, and policy warnings. It should not be used as a user-facing finance dashboard.

## Storage Direction

Dashboard preferences should conceptually live in the user profile preference domain. Future schema/API work should keep these preferences separate from authorization, server policy, and authoritative business state.

Recommended conceptual preference categories:

- Landing preference per surface.
- Dashboard layout assignments per user/surface/context.
- User-created layout profiles.
- Widget settings.
- Widget visibility/order/size.
- Default template choices.
- Theme and display preferences.

This document intentionally does not define tables, migrations, OpenAPI schemas, or client storage implementation.

## Safety And Future Implementation Constraints

- Dashboard preferences must not grant access.
- Dashboard widgets must not bypass API authorization.
- Server-mode money and settlement displays must derive from API-accepted data.
- Offline dashboard data must show sync freshness and conflict state where relevant.
- Deleted, archived, hidden, or unauthorized contexts must fail closed.
- Policy and capability flags should control unavailable widgets rather than hardcoded client assumptions.
