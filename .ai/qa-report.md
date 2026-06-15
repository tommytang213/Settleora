# AI QA Report

Status: `M4 mobile group bill lifecycle queue opened; manual UI/code review deferred until Day 1 acceptance`

## Acceptance Checklist

- [x] M3 mobile sync/offline queue work is controller-finalized as a bounded Day 1 checkpoint.
- [ ] M2/M3 manual UI retests remain deferred until Day 1 acceptance, not passed.
- [ ] Manual code review remains deferred until Day 1 acceptance, not passed.
- [x] Automated development may continue under scoped validation, CI, PR, and merge gates.
- [x] Current milestone moved to M4 `Day 1 Mobile Group Bill Lifecycle UX Hardening`.
- [x] M4 queue has 2-4 related sub-slices plus a hard stop sentinel.
- [x] Scope guard is expected to allow M4 docs/control files and only narrow mobile group bill lifecycle implementation paths.
- [x] No M4 kickoff change requires runtime API, OpenAPI/generated-client, auth/session/security, schema/migration, money, storage privacy, deployment, Docker, CI, or secret changes.

## M3 Finalization Carry-Forward

M3 is finalized as `Day 1 Mobile Sync + Offline Queue Foundation`.

M3 coverage remains bounded to the existing mobile sync queue, processor, generated sync repository seam, metadata-only change-feed hydration seam, and authenticated bootstrap wiring. M4 must not expand M3 ad hoc into persistent offline cache hydration, cache merge policy, startup/background sync, conflict-resolution UX, manual discard/cancel, backoff/max-attempt policy, API/auth/schema/storage/money/deployment, notification delivery, or unrelated major-domain work.

## M4 Selection Summary

M4 is `Day 1 Mobile Group Bill Lifecycle UX Hardening`.

The selection is based on current repo state:

- `README.md` says the mobile app has starter group-bill list/detail surfaces, while mobile group bill create/edit/lifecycle/offline support remains future Day 1 work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires shared bill creation, group bills and balances, participant acknowledgement/approval, bill attachments/receipt sharing, correction proposals, and dispute basics for Day 1.
- `docs/features/expenses-bills/FUNCTIONAL_SPEC.md` defines shared bill create, bill-on-behalf-of-payer, edit/revision, participant correction, archive/restore, attachments, and group bill list/detail expectations.
- `docs/features/expenses-bills/TECHNICAL_SPEC.md` keeps server-mode business writes, authorization, financial truth, revision context, attachments, and audit behavior API/domain-authoritative.
- Current mobile code under `apps/mobile/lib/bills/` and `apps/mobile/lib/groups/` already exposes group bill list/detail/create/submit, participant accept/reject, group member display, attachments, OCR-review handoff, and revision entry seams backed by existing repository interfaces and tests.
- This makes mobile-only group bill lifecycle hardening the next coherent Day 1 milestone without selecting a task that requires backend/API, OpenAPI/generated-client, auth/session/security, schema, storage, money, settlement, deployment, Docker, CI, secret, or unrelated domain changes.

## M4 Queue Summary

- `M4-001-GROUP-BILL-LIFECYCLE-STATE-RECONCILE-20260615-1659` - Queued. Reconcile current mobile group bill lifecycle state and create `docs/qa/M4_MOBILE_GROUP_BILL_LIFECYCLE_QA_MAP.md` without changing runtime behavior.
- `M4-002-GROUP-BILL-CREATE-SUBMIT-HARDENING-20260615-1659` - Queued. Harden existing group bill create/submit UX, safe retries, member/payer/split validation, and duplicate-mutation prevention inside current mobile seams.
- `M4-003-GROUP-BILL-DETAIL-LIFECYCLE-HARDENING-20260615-1659` - Queued. Harden group bill detail lifecycle surfaces for participant actions, revision entry, attachments/OCR-review state, stale capability refreshes, member fallbacks, and safe terminal/unavailable states.
- `M4-004-GROUP-BILL-LIFECYCLE-QA-FINALIZE-20260615-1659` - Queued. Finalize M4 QA/control state and preserve deferred manual review status.
- `STOP-M4-001` - Stop for API/contracts/generated-client/auth/schema/storage/money/deployment, broader offline queue/cache/sync, OCR-worker/runtime expansion, recurring, settlement, reporting/import/export, notification delivery, web/admin, secrets, or unrelated major-domain scope.

## M4 Kickoff QA Map

Created `docs/qa/M4_MOBILE_GROUP_BILL_LIFECYCLE_QA_MAP.md` as the initial control/QA map for the milestone. The map records:

- Day 1 requirement boundary for group bill lifecycle work.
- Current mobile surfaces and seams to reconcile during M4-001.
- Expected future hardening targets for M4-002 and M4-003.
- Explicit non-goals and hard stop conditions.
- Validation expectations.

## Deferred Manual Acceptance Gates

The following remain pending and deferred until Day 1 acceptance. They are not passed:

- Human PC/wide and narrow/mobile UI retest for prior mobile UI milestones.
- Manual code review.
- Day 1 acceptance review of M4 group bill lifecycle behavior after automated M4 work completes.

## Hard Safety Stops

M4 must stop for human approval if a task requires backend/API behavior, OpenAPI or generated-client changes, auth/session/security runtime or configuration, database schema/migrations, storage/file privacy policy changes, money/settlement/bill calculation logic, Docker/env/deployment/CI changes, production deploy/public exposure, force/history operations, branch deletion, secrets, reducing Day 1 scope, replacing architecture direction, or expanding across unrelated major domains.

## Validation Expectations

Kickoff validation must run:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

M4 implementation tasks should add mobile validation:

- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`
- `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`
