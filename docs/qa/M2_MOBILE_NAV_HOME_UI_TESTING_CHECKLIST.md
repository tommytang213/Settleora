# M2 Mobile Navigation And Home UI Testing Checklist

## Scope

This checklist covers human UI testing for M2 mobile navigation, Home/dashboard shell readiness, and top-level handoffs across Home, Bills, Groups, Settle, and Settings. It is a QA artifact only and does not authorize backend/API behavior, OpenAPI or generated-client changes, auth/session/security changes, schema/migration changes, settlement/payment/bill calculation changes, Docker/env/deployment/CI changes, local storage policy changes, or secrets.

Owner decision recorded on 2026-06-15 14:22:03 HKT: defer manual UI testing until Day 1 acceptance and continue automated development. The checklist remains pending/deferred and must not be treated as passed.

## Preconditions

- Use the Flutter mobile app in server mode with a signed-in test user.
- Use a test account that can load at least one group, at least one personal bill, and settlement data when available.
- Keep one empty/new-user test account available for empty-state checks.
- Confirm the app is connected to the intended test server and the session has not expired.
- Do not create or request backend/API, OpenAPI, generated-client, auth, schema, money, deployment, Docker, CI, or secret changes during this pass.

## Home Dashboard

- Start the signed-in app and confirm Home is the initial authenticated landing surface.
- Confirm the bottom navigation marks Home as selected on the dashboard.
- Confirm Home shows server-mode context using app-owned session/profile state only.
- Confirm dashboard cards summarize loaded repository data, such as personal bills, settlements, recurring forecast readiness, notifications, and sync queue status where available.
- Confirm missing shared-bill/global counts are presented as unavailable or not exposed rather than live totals.
- Confirm empty Home data presents useful next actions without claiming unavailable runtime data exists.
- Confirm load failures show bounded, retryable copy without backend internals, tokens, storage paths, or raw identifiers.
- Confirm returning from Bills, Notifications, or other dashboard-linked surfaces refreshes the Home summary where the implemented app does so.

## Bottom Navigation

- Confirm bottom navigation labels are exactly Home, Bills, Groups, Settle, and Settings in that order.
- Tap each bottom navigation item and confirm the reached screen matches the label.
- Confirm the selected state stays stable for the active top-level destination.
- Confirm Receipts and Profile are not bottom navigation tab labels; those surfaces remain secondary routes/actions.
- Confirm personal bill empty state keeps the Bills tab active.
- Confirm settlement filters opened from Home keep the Settle destination context.
- Confirm Settings opens the existing profile/settings surface without changing auth/session behavior.
- Confirm detail routes keep enough title/context for the user to understand the current area.

## Home Quick Actions

- From Home, open the personal bill create action and confirm it reaches the existing personal bill create screen.
- Back out of an unchanged personal bill draft and confirm no create or refresh mutation occurs.
- From Home, open the create group action and confirm the existing group create dialog appears.
- Cancel group creation and confirm no group is created.
- If a recurring draft-ready forecast is available, open the recurring draft shortcut and confirm the forecast screen is filtered to draft-needed items.
- If actionable settlement requests are available, open the settlement action shortcut and confirm the settlement list is filtered to needs-action items.
- Confirm quick actions do not imply push notifications, offline sync policy changes, automatic settlement simplification, refunds, broad credit ledgers, or unavailable OCR finalization.

## Deferred Home/Nav Retest

- Confirm the Home screen visibly differs from the previous profile-plus-menu-list page.
- Confirm Home, Bills, Groups, Settle, and Settings/Profile show the persistent bottom navigation in both PC/wide and narrow/mobile-sized windows.
- Confirm `You owe`, `You're owed`, `Quick actions`, `Needs attention`, `Upcoming bills`, `Group activity`, `This month`, and compact `More` sections are visible and understandable.
- Confirm `Create bill` opens a chooser with `Personal bill` and `Group bill`.
- Confirm `Personal bill` opens the existing personal bill create flow.
- Confirm `Group bill` opens Groups for explicit group selection before the existing group-bill flow.
- Confirm no user-facing copy mentions implementation seams, API limitations, generated clients, or unavailable global shared-bill counts.

## Groups And Group Bills

- Open Groups from bottom navigation and confirm group list loading, empty, search, and filter states are coherent.
- With no groups, confirm the empty state offers only the implemented group creation action.
- Create a test group through the existing dialog and confirm it appears in the list.
- Open a group detail screen and confirm member information uses safe display fields.
- From group detail, open the shared bill workspace and confirm the group bill list loads for that group.
- In an empty group bill list, confirm the empty state offers the implemented `Create group bill` action.
- Start group bill creation and confirm the flow stays within existing group member, bill, receipt, and review behavior.
- Confirm personal bill create controls are not shown in the group bill list/detail path.

## Bills

- Open Bills from bottom navigation and confirm personal bill list loading, empty, search, filter, and sync queue states remain coherent.
- Confirm `Create bill` opens the existing personal bill create flow.
- Confirm bill list filtering and clearing restore only loaded bill rows.
- Confirm bill detail opens from a visible summary and renders safe attachment metadata only.
- Confirm receipt OCR review remains provisional and does not automatically finalize a bill.

## Settlements

- Open Settle from bottom navigation and confirm balances and settlement requests render from loaded server-returned data.
- Confirm search and filter chips use visible safe values and do not match raw identifiers.
- Confirm the Settle landing summary distinguishes balances, active requests, needs-action items, and settled-up states using existing data only.
- Confirm shortcut filters such as needs-action and incoming/outgoing only update local list filters.
- Open a settlement detail and confirm payment details, payments, residual confirmation, dispute/cancel/confirm actions, and proof-related copy appear only where existing mobile/API flows support them.
- Confirm settled-up or no-match states are compact and do not imply broad settlement simplification, automatic confirmation, refunds, or credit-ledger behavior.

## Error, Trust, And Stop Checks

- Confirm session-required states remain bounded and route through existing sign-in/session behavior.
- Confirm loading spinners and disabled states block duplicate taps where implemented.
- Confirm no screen exposes secrets, tokens, raw storage provider paths, local auth/session config, or backend internals.
- Stop and require human review if readiness appears to require backend/API, OpenAPI/generated-client, auth/session/security, database schema/migration, settlement/payment/bill calculation, Docker/env/deployment/CI, local storage policy, or secret changes.

## Automated Coverage To Cross-Check

- `apps/mobile/test/server_mode_shell_dashboard_test.dart` covers Home summaries, empty states, quick actions, settlement/recurring shortcuts, dashboard refresh, sync status, and Home-to-surface navigation.
- `apps/mobile/test/dashboard_preview_screen_test.dart` covers dashboard preview entry, Home selected state, new-user, offline, and review-priority variants.
- `apps/mobile/test/group_list_screen_test.dart` covers group list empty/create/search/filter/detail/member states and authenticated shell access to Groups.
- `apps/mobile/test/group_bill_list_screen_test.dart` covers group bill list/detail/create, empty/error states, filters, participant actions, attachments, and group-bill creation.
- `apps/mobile/test/bill_list_screen_test.dart` covers personal bill list/detail/create, Bills tab context, sync queue, attachments, and authenticated shell access to Bills and Settlements.
- `apps/mobile/test/settlement_list_screen_test.dart` covers settlement list/detail, filters, empty states, bounded failures, payment/residual actions, and safe visible-value search.
