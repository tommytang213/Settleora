# AI QA Report

Status: `M2 Home dashboard bottom nav and Create bill picker fixed in code; human PC UI retest required`

## Acceptance Checklist

- [x] Current milestone goal is updated to M2 mobile navigation and Home/dashboard shell polish.
- [x] Task queue reflects a small, safe M2 sequence.
- [x] Scope guard is expected to cover kickoff docs/control changes only.
- [ ] M2 current-state reconciliation completed.
- [x] Home/dashboard visible redesign implemented and focused-test validated.
- [x] Bottom navigation clarity polish completed and focused-test validated for Home.
- [ ] Groups and Settle landing handoff polish completed and validated.
- [ ] Full relevant mobile validation completed.
- [x] Human UI retest checklist updated for Home dashboard regression.
- [ ] Human PC UI retest confirms visible Home dashboard improvement.
- [x] No planned M2 task requires backend/API, OpenAPI/generated-client, auth/session/security, schema/migration, money, Docker/env/deployment/CI, web/admin runtime, push notification, offline sync policy, local storage, or secret changes.

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
- `STOP-M2-001` - Human-gated backend/API/auth/schema/money/deployment blocker.

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

- `M2-HOME-DASHBOARD-PLAIN-MENU-20260612-0118`: fixed pending human retest. Human screenshot review found the Home screen still looked like a plain vertical menu list with user profile, Today, Create bill/Create group buttons, menu rows, More rows, large unused wide-viewport space, and implementation-oriented copy. The latest follow-up keeps Home constrained to a centered phone-width dashboard surface on wide test windows, adds `You owe` and `You're owed` metric cards with honest zero or server-provided balance values, changes `Upcoming bills` into bill-like rows or a compact empty state, changes `Group activity` into feed-style rows or a compact empty state, demotes route access to compact actions, removes the shared-bill seam copy, and adds focused widget coverage that rejects the old route-card primary content. M2 remains human-review required until a PC UI retest confirms the visible change.
- `M2-HOME-BOTTOM-NAV-CREATE-BILL-PICKER-20260612-1358`: fixed pending human retest. Human PC UI retest found that Home was missing the persistent M2 bottom navigation and that Create bill routed straight to personal bill creation. Home now uses the app scaffold `NavigationBar` with Home, Bills, Groups, Settle, and Settings labels, with Home selected on the dashboard. The Create bill quick action now opens a chooser with `Personal bill` and `Group bill`; Personal bill preserves the existing personal creation screen, and Group bill routes to Groups so the user can choose a group and use the existing group-bill flow. No backend/API, generated-client, schema, auth, money, deployment, Docker, CI, env, or secret changes were made.

## Home Dashboard Redesign Fix

- Branch: `ai/task/m2-home-dashboard-visible-redesign-20260612-0118`.
- Scope: mobile app shell/test and QA/control files only.
- Before: Home appeared as a skinny settings-style list and exposed implementation wording about a mobile seam.
- After: Home has a centered phone-width dashboard surface on wide windows, a colored compact header with signed-in context and refresh/notifications/profile affordances, top `You owe` and `You're owed` balance metric cards, quick action buttons, needs-attention cards, upcoming bill rows, group activity feed rows, this-month summary rows, and a compact secondary More section.
- Day 1 honesty preserved: counts only use existing loaded mobile overview data; unavailable shared global counts are not invented.
- Human review state: still required. This fix must be checked in a PC/wide Flutter window and a narrow/mobile-sized viewport before M2 is marked ready.

## Required Human UI Retest

- Confirm the Home screen visibly differs from the previous menu-list page.
- Confirm the bottom navigation is visible on Home in PC/wide and narrow/mobile-sized windows with Home selected.
- Confirm bottom navigation labels are Home, Bills, Groups, Settle, and Settings, and they hand off to existing mobile surfaces.
- Confirm `You owe`, `You're owed`, `Quick actions`, `Needs attention`, `Upcoming bills`, `Group activity`, `This month`, and compact `More` sections are visible and understandable.
- Confirm `Upcoming bills` and `Group activity` no longer read primarily as route-card shortcut lists.
- Confirm no user-facing copy mentions implementation seams, API limitations, generated clients, or unavailable global shared-bill counts.
- Confirm narrow/mobile and wide desktop/test viewport layouts avoid awkward empty space, horizontal overflow, and clipped text.
- Confirm `Create bill` opens a chooser with `Personal bill` and `Group bill`.
- Confirm `Personal bill` still opens the existing personal bill creation flow.
- Confirm `Group bill` opens Groups for group selection before the existing group-bill flow.
- Confirm `Create group` still opens its existing flow.
- Confirm Home cards still navigate to Personal bills, Shared bills/Groups, Settlements, Recurring bills, Notifications, Profile, Receipt Reviews, Sessions, and Monthly report as applicable.
