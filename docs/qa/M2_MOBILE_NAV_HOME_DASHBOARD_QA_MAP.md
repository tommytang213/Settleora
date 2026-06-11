# M2 Mobile Navigation + Home Dashboard QA Map

## Purpose

This map defines the M2 QA target for mobile navigation and Home/dashboard shell polish. It is a planning and acceptance artifact only. It does not authorize backend/API behavior, OpenAPI or generated-client changes, auth/session/security changes, schema/migration changes, money calculation changes, Docker/env/deployment/CI changes, web/admin runtime changes, push notifications, offline sync policy changes, local storage changes, or secret handling changes.

## Milestone Goal

M2 should make the mobile app feel coherent after the M1 group-bill flow by improving:

- Owner/user landing experience.
- Home/dashboard usefulness.
- Bottom navigation clarity.
- Top-level handoffs between Home, Groups, Bills, Settlements/Settle, and safe quick actions.

## Current-State Reconciliation Targets

`M2-001` should inspect the current mobile implementation and record:

- Which screen is the authenticated server-mode landing screen.
- Which bottom navigation items exist, their labels, and their selected-state behavior.
- Which top-level routes are reachable for Home, Groups, Bills, Settlements/Settle, profile/settings, and quick actions.
- Which Home/dashboard sections use implemented runtime data.
- Which sections are placeholders or empty states because runtime data is not implemented.
- Which existing mobile tests cover top-level navigation, Home shell rendering, and route handoffs.

## Reconciled Current State

Reconciled against the current mobile implementation for `M2-001`.

### Authenticated Landing

- The authenticated server-mode landing screen is `SettleoraAuthenticatedServerShell` in `apps/mobile/lib/app/server_mode_shell.dart`.
- First-launch and signed-out states remain outside the Home dashboard: no mode selected opens setup, server mode without a session opens sign-in, and a verified server session opens the authenticated shell.
- The shell does not currently use the shared bottom navigation as its own bottom bar. Home is represented by the shell itself, with app-bar sign-out, current-user profile affordance, a `Today` dashboard, quick actions, dashboard tiles, and a `More` section.
- `DashboardPreviewScreen` in `apps/mobile/lib/dashboard/dashboard_preview_screen.dart` is a static preview/demo surface with Home selected in the shared bottom nav. It is not the authenticated runtime landing screen.

### Bottom Navigation Inventory

`SettleoraBottomNav` defines six destinations in `apps/mobile/lib/ui/settleora_components.dart`:

- `Home` (`SettleoraNavDestination.home`)
- `Bills` (`SettleoraNavDestination.bills`)
- `Groups` (`SettleoraNavDestination.groups`)
- `Settle` (`SettleoraNavDestination.settle`)
- `Receipts` (`SettleoraNavDestination.receipts`)
- `Profile` (`SettleoraNavDestination.profile`)

The component marks the selected destination through `Semantics(selected: true)` and gives each item a stable key of `bottom-nav-{destination}`. `Settle` receives the primary filled styling even when it is not selected, while non-Settle selected destinations use the primary soft background and primary text/icon color. Current pushed screens instantiate the nav with a fixed selected value; the nav items have no wired `onSelected` handler on those screens, so they are visual context rather than cross-tab navigation.

### Reachable Top-Level And Related Routes

- Home: `SettleoraAuthenticatedServerShell` after current-user validation.
- Profile/payment details: profile icon in the current-user tile and `More > Profile` both push `SettleoraProfileScreen`.
- Bills: `Personal bills` dashboard tile and `Review in Bills` sync action push `SettleoraBillListScreen`; `Create bill` pushes `SettleoraPersonalBillCreateScreen`.
- Groups: `Shared bills` dashboard tile pushes `SettleoraGroupListScreen`; `Create group` pushes the group list with `openCreateOnStart: true`; group detail can push `SettleoraGroupBillListScreen`.
- Group bill detail/create: group-bill list/detail/create screens live under the bill module and select `Groups` in the shared bottom nav.
- Settlements/Settle: `Settlements` dashboard tile pushes `SettleoraSettlementListScreen`; `Review settlement actions` pushes the same screen with `openNeedsActionOnStart: true`.
- Receipts: `More > Receipt Reviews` pushes `ReceiptOcrReviewQueueScreen`. The shared bottom nav has a `Receipts` destination, but the receipt-review screen is reached from the shell tile rather than through an active bottom-nav route.
- Recurring bills: dashboard tile and `Recurring drafts ready` action push `SettleoraRecurringBillScreen`; this is reachable from Home but is not a bottom-nav destination.
- Notifications: dashboard tile pushes `SettleoraNotificationScreen`.
- Monthly report: `More > Monthly report` pushes `SettleoraMonthlyReportScreen`.
- Sessions/devices: `More > Sessions` pushes `SettleoraSessionListScreen`.

### Home Runtime Data

The authenticated shell dashboard loads these implemented data sources:

- Personal bills: `billRepository.listPersonalBills(limit: 3)`.
- Notification summary: `notificationRepository.getNotificationSummary()`.
- Settlement balances: `settlementRepository.listBalances()`.
- Settlement requests: `settlementRepository.listSettlementRequests()`.
- Recurring templates: `recurringBillRepository.listTemplates(maxItems: 3)`.
- Recurring forecast: `recurringBillRepository.listForecast(limit: 3)`.
- Local personal-bill sync snapshot: `billSyncController.readSnapshot()`.

The dashboard uses those sources for active personal bill count/latest bill, unread/attention/urgent notification counts, open settlement request/action counts, open balance row count, active recurring template count, draft-ready forecast count, and pending/failed/conflict sync state.

### Honest Placeholder Or Limited States

- Shared bills currently route through Groups. The Home tile intentionally states that no global shared-bill count is exposed by the current mobile seam.
- Empty Home overview state says there are no overview items and sends the user to implemented sections, rather than presenting fake metrics.
- Dashboard load failures show bounded retry states and keep prior overview content visible during refresh failures.
- Settlement dashboard wording is limited to balances, requests, and review actions returned by existing settlement repositories. It does not imply broad simplification, refunds, credit ledgers, or automatic confirmation.
- Recurring dashboard wording is limited to templates, forecast, and explicit draft review/generation. It does not imply reminders, background generation, or recurring template creation/editing in mobile.
- Receipt review is an implemented route, but Home does not currently load a receipt-review count.
- Monthly report and sessions are reachable under `More`, but they are not part of the overview load.
- The static dashboard preview includes illustrative sections such as upcoming bills, group activity, receipts to review, offline, and checklist variants. Those preview states should not be treated as authenticated runtime data coverage.

### Existing Test Coverage

- `apps/mobile/test/widget_test.dart` covers first-launch setup, local mode, server signed-out state, successful sign-in, verified-session shell entry, and receipt-review route access from the shell.
- `apps/mobile/test/server_mode_shell_dashboard_test.dart` covers Home dashboard repository summaries, empty state, overview retry/refresh, personal bill creation quick action, group creation quick action, bills route handoff, notifications route handoff, settlement list/action-filter handoffs, recurring bills/draft-filter handoffs, and personal-bill sync status/actions.
- `apps/mobile/test/dashboard_preview_screen_test.dart` covers the static dashboard preview and verifies Home is selected in its bottom nav.
- `apps/mobile/test/bill_list_screen_test.dart` covers personal bill screens with `Bills` bottom-nav context and group-bill list/create/detail screens with `Groups` bottom-nav context.
- `apps/mobile/test/group_bill_list_screen_test.dart` covers group-bill flows and selected `Groups` nav context on group-bill surfaces.
- `apps/mobile/test/settlement_list_screen_test.dart`, `apps/mobile/test/recurring_bill_screen_test.dart`, `apps/mobile/test/notification_screen_test.dart`, `apps/mobile/test/monthly_report_screen_test.dart`, and `apps/mobile/test/profile_screen_test.dart` cover route-specific behavior but not a shared top-level tab router.

### Focus For M2 Implementation Tasks

- Decide whether Home should use the shared bottom nav or whether the M2 shell should keep Home as a separate landing surface with clearer top-level handoff affordances.
- If bottom-nav items are meant to navigate, wire or replace the currently inert pushed-screen nav context deliberately; if they remain contextual, make that visually and semantically clear.
- Resolve the mismatch between the six defined nav destinations and the currently routed top-level surfaces. In particular, `Receipts` and `Profile` exist in the shared nav enum but are reached from `More`, while recurring bills, notifications, sessions, and monthly report are Home tiles only.
- Keep shared-bill dashboard copy honest until a global shared-bill summary seam exists.
- Keep settlement and recurring shortcuts scoped to existing repository/API behavior only.
- Add focused tests for any changed Home bottom-nav behavior, selected states across detail routes, and Home-to-Groups/Bills/Settle/Receipts/Profile handoffs.

## Acceptance Areas

### Home Dashboard Shell

- Home clearly communicates the current server-mode context where the app has that state available.
- Home exposes useful next actions that map to implemented flows, such as groups, bills, settlements, profile/payment details, or receipt/bill actions already present in the app.
- Home uses honest empty, unavailable, or placeholder states where runtime data does not exist.
- Home does not present unimplemented widgets as live data.
- Home does not compute authoritative money, settlement state, sync acceptance, authorization, or policy decisions client-side.

### Bottom Navigation

- Labels are concise and match the destination users actually reach.
- Active state is stable when moving among Home, Groups, Bills, Settlements/Settle, and related detail routes.
- Detail routes keep enough top-level context for users to understand where they came from.
- The central or primary quick action, if present, routes only to implemented safe actions.
- Navigation does not imply web/admin, push notification, offline sync, or unavailable backend capability.

### Groups And Bills Handoffs

- Groups landing points make the next group-bill action discoverable without burying the M1 flow.
- Group detail, group bills, and group bill create/list/detail routes are reachable through clear labels or actions.
- Empty group or no-bill states suggest implemented next actions only.
- Route handoffs preserve existing repository and API boundaries.

### Settlements/Settle Handoffs

- Settlement landing surfaces distinguish balances, requests, payments, and proof/review concepts only where existing mobile/API flows support them.
- Settle quick actions avoid pretending broad settlement simplification, credit ledgers, refunds, or automatic confirmation exist.
- Empty settled-up states are treated as healthy and actionable only through implemented routes.
- Money and settlement status wording remains aligned with server-authoritative data.

### Mode, Trust, And Error States

- Server-mode data and unavailable data are visually and textually distinct.
- Loading and error states provide safe next actions and do not expose internal backend details, storage paths, tokens, or secrets.
- Empty states are useful without becoming marketing pages.
- Any auth/session/security impact discovered during implementation stops M2 for human review.

## Test Expectations

Future M2 implementation tasks should add or update focused mobile tests for:

- Home/dashboard shell rendering in server-mode-ready app state.
- Empty/unavailable dashboard states.
- Bottom navigation labels and active-state behavior.
- Navigation from Home to Groups, Bills, and Settlements/Settle.
- Handoffs from Groups into group detail and group bill surfaces.
- Safe quick actions that route to implemented screens only.

Full mobile validation is required by the final QA task:

```bash
PATH=/opt/flutter/bin:$PATH npm run doctor:mobile
PATH=/opt/flutter/bin:$PATH npm run validate:mobile
```

## Stop Conditions

Stop and require human review if M2 work needs any of the following:

- Backend/API behavior changes.
- OpenAPI or generated-client changes.
- Auth/session/security changes.
- Database schema or migrations.
- Settlement/payment/bill calculation logic or policy changes.
- Docker, deployment, environment, or CI changes.
- Web/admin runtime UI changes.
- Push notifications.
- Offline sync policy changes.
- Local storage behavior changes.
- Secrets, tokens, credentials, or local auth/session config.
