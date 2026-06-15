# AI QA Report

Status: `M2 mobile navigation and Home/dashboard shell automated QA complete; human PC UI retest deferred until Day 1 acceptance; automated development ready`

## Acceptance Checklist

- [x] Current milestone goal is updated to M2 mobile navigation and Home/dashboard shell polish.
- [x] Task queue reflects a small, safe M2 sequence.
- [x] Scope guard is expected to cover kickoff docs/control changes only.
- [x] M2 current-state reconciliation completed.
- [x] Groups and Settle landing handoff polish completed and validated.
- [x] Full relevant mobile validation completed.
- [x] Human UI testing checklist completed.
- [x] Home/dashboard visible redesign implemented and focused-test validated.
- [x] Bottom navigation clarity polish completed and focused-test validated for Home.
- [x] Human UI retest checklist updated for Home dashboard regression.
- [ ] Human PC UI retest confirms visible Home dashboard improvement; deferred by owner decision until Day 1 acceptance, not marked passed.
- [x] No planned M2 task requires backend/API, OpenAPI/generated-client, auth/session/security, schema/migration, money, Docker/env/deployment/CI, web/admin runtime, push notification, offline sync policy, local storage, or secret changes.
- [x] Retest-only stop state removed so automated development can resume under existing scope guard and safety/manual gates.

## M2 Kickoff Summary

- M1 group-bill owner happy-path UI-test readiness has landed on `main`.
- M2 starts from the current `main` and `ai/integration` baseline and focuses on the mobile top-level experience after users leave the group-bill create/list/detail flow.
- M2 should make Home useful without pretending missing runtime data exists. Use existing repositories, generated-client seams, and implemented mobile state only.
- M2 should clarify bottom navigation labels, selected states, and route handoffs across Home, Groups, Bills, Settlements/Settle, and related quick actions.
- M2 should preserve existing server-mode authority boundaries. Mobile may present data and honest placeholders, but must not compute authoritative money, settlement, sync acceptance, authorization, or policy decisions.

## M2 Queue Summary

- `M2-001` - Reconcile mobile nav/home current state and QA map.
- `M2-002` - Home dashboard useful shell and empty states.
- `M2-003` - Bottom navigation labels, active state, and route clarity.
- `M2-004` - Groups and Settle landing handoff polish.
- `M2-005` - Mobile nav/home UI testing checklist and milestone QA report.
- `M2-006-NOTIFICATION-DETAIL-CONTEXT-POLISH-20260615-1422` - In-app notification detail context and Home handoff polish.
- `STOP-M2-001` - Manual gate backend/API/auth/schema/money/deployment blocker.

## QA Map

- Primary QA map: `docs/qa/M2_MOBILE_NAV_HOME_DASHBOARD_QA_MAP.md`.
- The map is a kickoff artifact. `M2-001` should reconcile it against the actual mobile implementation and add or adjust focused test expectations where needed.

## Validation Expectations

- Kickoff validation should run scope guard, docs validation, scaffold validation, OpenAPI validation, and a controller dry run.
- Mobile implementation tasks should run `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile` and `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`.
- M2 must stop for human review if any task needs forbidden backend/API, OpenAPI/generated-client, auth/session/security, schema/migration, money, Docker/env/deployment/CI, web/admin runtime, push notification, offline sync policy, local storage, or secret changes.

## Kickoff Validation

- `git status --short`: passed before commit; changed files were limited to `.ai/current-milestone.md`, `.ai/qa-findings.json`, `.ai/qa-report.md`, `.ai/state.json`, `.ai/task-queue.json`, and `docs/qa/M2_MOBILE_NAV_HOME_DASHBOARD_QA_MAP.md`.
- `git diff --name-only origin/ai/integration...HEAD`: passed before commit with no output because the task changes were not committed yet; rerun required after commit.
- `git diff --check origin/ai/integration...HEAD`: passed before commit with no output.
- `node scripts/ai/v3-scope-guard.mjs --base origin/ai/integration --head HEAD`: passed before commit with zero committed changed files.
- `npm run validate:docs`: passed; documentation validation passed.
- `npm run validate:scaffold`: passed; scaffold validation passed for 19 paths.
- `npm run validate:openapi`: passed; Redocly validated `packages/contracts/openapi/settleora.v1.yaml`.
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`: passed; selected `M2-001 - Reconcile mobile nav/home current state and QA map`, wrote a prompt under `/workspace/logs/ai-v3-controller/tasks/`, wrote a run log under `/workspace/logs/ai-v3-controller/`, and did not invoke Codex.

## Findings

- Human UI testing checklist added at `docs/qa/M2_MOBILE_NAV_HOME_UI_TESTING_CHECKLIST.md`.
- Milestone QA report added at `docs/qa/M2_MOBILE_NAV_HOME_MILESTONE_QA_REPORT.md`.
- Automated coverage is present for Home/dashboard, dashboard preview variants, Groups, group bills, Bills, Settlements/Settle, and the shared bottom navigation guardrails through focused mobile widget tests.
- Required validation passed, including `npm run validate:docs`, `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`, and `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`.
- M2 automated validation remains complete. The Home/dashboard and navigation polish still need human PC UI retest, but the owner deferred that retest until Day 1 acceptance and requested automated development continue.
- No backend/API, OpenAPI/generated-client, auth/session/security, schema/migration, settlement/payment/bill calculation, Docker/env/deployment/CI, local storage policy, or secret changes were made.
- `M2-004` added an explicit no-groups empty-state action that opens the existing group creation flow without adding backend, auth, storage, or sync behavior.
- Group detail now exposes a compact `Shared bill workspace` handoff into the existing group-bill list/create/review flow while preserving current group/member repository boundaries.
- Group bill list empty state now offers `Create group bill`, and the group context copy clarifies that loaded group bills can be filtered for user response needs.
- Settlement list now includes a bounded `Settle landing` summary using already loaded server-returned balances and settlement requests, with shortcuts that only update existing local list filters.
- Focused widget coverage was updated for group empty/action handoff, group detail bill handoff, group bill empty handoff, and settlement summary filter shortcuts.
- No backend/API, OpenAPI/generated-client, auth/session/security, schema/migration, settlement/payment/bill calculation, Docker/env/deployment/CI, web/admin runtime, push notification, offline sync policy, local storage, or secret changes were made.
- `M2-HOME-DASHBOARD-PLAIN-MENU-20260612-0118`: fixed pending deferred human retest. Human screenshot review found the Home screen still looked like a plain vertical menu list with user profile, Today, Create bill/Create group buttons, menu rows, More rows, large unused wide-viewport space, and implementation-oriented copy. The latest follow-up keeps Home constrained to a centered phone-width dashboard surface on wide test windows, adds `You owe` and `You're owed` metric cards with honest zero or server-provided balance values, changes `Upcoming bills` into bill-like rows or a compact empty state, changes `Group activity` into feed-style rows or a compact empty state, demotes route access to compact actions, removes the shared-bill seam copy, and adds focused widget coverage that rejects the old route-card primary content. Human PC UI retest remains pending and deferred until Day 1 acceptance.
- `M2-HOME-BOTTOM-NAV-CREATE-BILL-PICKER-20260612-1358`: fixed pending deferred human retest. Human PC UI retest found that Home was missing the persistent M2 bottom navigation and that Create bill routed straight to personal bill creation. Home now uses the app scaffold `NavigationBar` with Home, Bills, Groups, Settle, and Settings labels, with Home selected on the dashboard. The Create bill quick action now opens a chooser with `Personal bill` and `Group bill`; Personal bill preserves the existing personal creation screen, and Group bill routes to Groups so the user can choose a group and use the existing group-bill flow. No backend/API, generated-client, schema, auth, money, deployment, Docker, CI, env, or secret changes were made.
- `M2-BOTTOM-NAV-DSL-PARITY-20260612-1426`: fixed pending deferred human retest. Human PC UI retest found another page showing bottom navigation drift with extra `Receipts` and `Profile` tabs. The mobile shell now uses one shared bottom navigation widget for the canonical Day 1 set and order: `Home`, `Bills`, `Groups`, `Settle`, and `Settings`. Bills, Groups, Settle, and Settings/Profile top-level routes now keep the same constrained, safe-area-aware, rounded active-chip nav treatment as Home. Receipt review, profile/session, report, notification, and recurring routes remain secondary routes/actions instead of bottom-nav tabs. Focused widget coverage asserts the canonical labels/order, rejects `Receipts` and `Profile` as tab labels, validates active tab state across all five tabs, preserves the Create bill personal/group chooser, and rejects old debug/widget dump text. No backend/API, generated-client, schema, auth, money, deployment, Docker, CI, env, or secret changes were made.
- Next automated task is queued as `M2-006-NOTIFICATION-DETAIL-CONTEXT-POLISH-20260615-1422`, scoped to active M2 scope-guard paths and existing mobile notification behavior only.

## Home Dashboard Redesign Fix

- Branch: `ai/task/m2-home-dashboard-visible-redesign-20260612-0118`.
- Scope: mobile app shell/test and QA/control files only.
- Before: Home appeared as a skinny settings-style list and exposed implementation wording about a mobile seam.
- After: Home has a centered phone-width dashboard surface on wide windows, a colored compact header with signed-in context and refresh/notifications/profile affordances, top `You owe` and `You're owed` balance metric cards, quick action buttons, needs-attention cards, upcoming bill rows, group activity feed rows, this-month summary rows, and a compact secondary More section.
- Day 1 honesty preserved: counts only use existing loaded mobile overview data; unavailable shared global counts are not invented.
- Human UI retest state: pending and deferred until Day 1 acceptance by owner decision. This fix still must be checked in a PC/wide Flutter window and a narrow/mobile-sized viewport before M2 is marked human-approved.

## Deferred Human UI Retest

Owner decision recorded on 2026-06-15 14:22:03 HKT: defer all manual UI testing until Day 1 acceptance and continue automated development. The checks below remain pending/deferred and are not marked passed.

- Confirm the Home screen visibly differs from the previous menu-list page.
- Confirm the bottom navigation is visible on Home, Bills, Groups, Settle, and Settings/Profile in PC/wide and narrow/mobile-sized windows with the correct active tab selected.
- Confirm bottom navigation labels are exactly Home, Bills, Groups, Settle, and Settings in that order, with no Receipts or Profile bottom-nav tabs.
- Confirm `You owe`, `You're owed`, `Quick actions`, `Needs attention`, `Upcoming bills`, `Group activity`, `This month`, and compact `More` sections are visible and understandable.
- Confirm `Upcoming bills` and `Group activity` no longer read primarily as route-card shortcut lists.
- Confirm no user-facing copy mentions implementation seams, API limitations, generated clients, or unavailable global shared-bill counts.
- Confirm narrow/mobile and wide desktop/test viewport layouts avoid awkward empty space, horizontal overflow, and clipped text.
- Confirm `Create bill` opens a chooser with `Personal bill` and `Group bill`.
- Confirm `Personal bill` still opens the existing personal bill creation flow.
- Confirm `Group bill` opens Groups for group selection before the existing group-bill flow.
- Confirm `Create group` still opens its existing flow.
- Confirm Home cards still navigate to Personal bills, Shared bills/Groups, Settlements, Recurring bills, Notifications, Profile, Receipt Reviews, Sessions, and Monthly report as applicable.
