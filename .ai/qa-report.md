# AI QA Report

Status: `M2 Home dashboard redesign fixed in code; human PC UI retest required`

## Acceptance Checklist

- [x] Current milestone goal is updated to M2 mobile navigation and Home/dashboard shell polish.
- [x] Task queue reflects a small, safe M2 sequence.
- [x] Scope guard is expected to cover kickoff docs/control changes only.
- [ ] M2 current-state reconciliation completed.
- [x] Home/dashboard visible redesign implemented and focused-test validated.
- [ ] Bottom navigation clarity polish completed and validated.
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

- `M2-HOME-DASHBOARD-PLAIN-MENU-20260612-0118`: fixed pending human retest. Human screenshot review found the Home screen still looked like a plain vertical menu list with user profile, Today, Create bill/Create group buttons, menu rows, More rows, large unused wide-viewport space, and implementation-oriented copy. The follow-up fix constrains Home to a centered phone-width dashboard surface on wide test windows, adds a compact header with refresh/notifications/profile affordances, adds `Attention` and `Balances` summary cards, replaces the lower menu feel with `Quick actions`, `Needs attention`, `Upcoming bills`, `Group activity`, `This month`, and compact `More` controls, removes the shared-bill seam copy, and adds narrow/wide focused widget coverage. M2 remains human-review required until a PC UI retest confirms the visible change.

## Home Dashboard Redesign Fix

- Branch: `ai/task/m2-home-dashboard-visible-redesign-20260612-0118`.
- Scope: mobile app shell/test and QA/control files only.
- Before: Home appeared as a skinny settings-style list and exposed implementation wording about a mobile seam.
- After: Home has a centered phone-width dashboard surface on wide windows, a colored compact header with signed-in context and refresh/notifications/profile affordances, top `Attention` and `Balances` summary cards, quick action buttons, needs-attention cards, upcoming-bills cards, group-activity cards, this-month settlement cards, and a compact secondary More section.
- Day 1 honesty preserved: counts only use existing loaded mobile overview data; unavailable shared global counts are not invented.
- Human review state: still required. This fix must be checked in a PC/wide Flutter window and a narrow/mobile-sized viewport before M2 is marked ready.

## Required Human UI Retest

- Confirm the Home screen visibly differs from the previous menu-list page.
- Confirm `Quick actions`, `Needs attention`, `Upcoming bills`, `Group activity`, `This month`, and compact `More` sections are visible and understandable.
- Confirm no user-facing copy mentions implementation seams, API limitations, generated clients, or unavailable global shared-bill counts.
- Confirm narrow/mobile and wide desktop/test viewport layouts avoid awkward empty space, horizontal overflow, and clipped text.
- Confirm `Create bill` and `Create group` still open their existing flows.
- Confirm Home cards still navigate to Personal bills, Shared bills/Groups, Settlements, Recurring bills, Notifications, Profile, Receipt Reviews, Sessions, and Monthly report as applicable.
