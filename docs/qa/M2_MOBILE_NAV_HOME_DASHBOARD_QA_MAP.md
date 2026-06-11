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
