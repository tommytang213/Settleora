# Current Milestone

- ID: `M15`
- Name: `Day 1 Acceptance Evidence And Gate Readiness`
- Target branch: `ai/integration`
- Previous milestone ID: `M14`

## Goal

Prepare the next bounded Day 1 readiness milestone after M14 by reconciling finalized automated milestone evidence, remaining hard-gated gaps, and the deferred manual acceptance prerequisites into a clear Day 1 acceptance gate package.

M15 is intentionally docs/control/readiness-only. It may update `.ai` control files and `docs/qa/M15_DAY1_ACCEPTANCE_EVIDENCE_QA_MAP.md`. It must not implement product runtime behavior, change backend/API behavior, change OpenAPI/contracts or generated clients, alter auth/session/security runtime or policy, modify schema/migrations, alter storage/privacy/file-byte behavior, change money/bill/settlement/payment/recurring/OCR/reconciliation authority, touch Docker/deployment/env/CI, add secrets, change web/admin runtime, broaden offline cache/sync, reduce Day 1 scope, or replace architecture direction.

Repo-state basis for this milestone:

- `README.md` records that the repository has starter backend and mobile surfaces across auth/session, self profile/payment details, personal/group bills, settlements, recurring bills, notifications, monthly reports, receipt review, sync, and visual/theme readiness, while broad web/admin portals, full offline cache hydration, broader mobile product UI, runtime import/export/backup, advanced OCR/worker behavior, broad reconciliation mutations, and several Day 1 completeness areas remain future work.
- `docs/qa/M1_*` through `docs/qa/M14_*` show bounded automated milestones finalized or prepared for deferred acceptance review, with manual UI retest and manual code review consistently deferred until Day 1 acceptance.
- `.ai/state.json` for M14 marked the controller readiness flag true and explicitly said the V3 controller is expected to stop on that finalized milestone. This kickoff treats that as a finalized-milestone stop, not as a Day 1 completion signal.
- `docs/prd/MVP_DAY1_SCOPE.md` defines Day 1 as safe for real user records and requires core expense, shared bill, settlement, receipt, offline/sync, reporting, import/export, storage/privacy, and security flows, while preserving API/domain authority for money, authorization, storage, status transitions, and audit.
- `PROGRAM_ARCHITECTURE.md` keeps API/domain services authoritative for database writes, authorization, money, storage access, sync acceptance, status transitions, and audit.
- `docs/workflow/CODEX_TASK_GUIDE.md` requires explicit scoped validation, no direct push to `main`, no force push, no `git add .`, and no silent runtime/API/security/schema/generated-client/deployment/secret/money changes.
- Remaining sensible product expansions after M14 cross manual or hard-gated categories in this kickoff: auth/security runtime and policy, storage/file privacy and byte behavior, money/settlement/bill authority, schema/migrations, OpenAPI/generated-client changes, Docker/deployment/CI, public/admin exposure, web/admin runtime, broad offline cache/sync, runtime import/export/backup, or manual acceptance decisions.

## Allowed Scope For Future M15 Tasks

- `.ai` control files.
- `docs/qa/M15_DAY1_ACCEPTANCE_EVIDENCE_QA_MAP.md` and narrowly related Day 1 acceptance evidence entries under `docs/qa/`.
- `scripts/ai/v3-scope-guard.mjs` only for the narrow M15 docs/control allowlist needed by this milestone.
- Documentation-only evidence classification that links existing source documents and existing QA maps.
- Manual acceptance gate package preparation that preserves `deferred_until_day1_acceptance` status.

## Forbidden Without Human Approval

- Marking manual UI retest, manual code review, release readiness, production readiness, or Day 1 acceptance as passed.
- Product runtime behavior in mobile, web, admin, API, workers, generated clients, or infrastructure.
- Backend/API behavior, OpenAPI/contracts/generated-client changes, schema/migrations, auth/session/security runtime or policy, storage/file privacy/authz/file-byte behavior, money/bill/settlement/payment/recurring/OCR/reconciliation mutation or calculation authority, Docker/deployment/env/CI, secrets, public/admin exposure, production deploy, mobile store release, broad offline cache/sync, Day 1 scope reduction, architecture replacement, branch cleanup/deletion, force-like history changes, or unrelated major-domain expansion.

## Done Criteria

- Current Day 1 automated milestone evidence is reconciled from M1 through M14 without changing runtime behavior.
- Remaining Day 1 gaps are classified as evidence-ready, deferred manual review, hard-gated, or future Day 2/Day 3 where source documents support that classification.
- A future human-opened Day 1 acceptance gate has a clear evidence package and stop conditions.
- Manual UI retest and manual code review remain `deferred_until_day1_acceptance`, not passed.
- M15 ends in a bounded controller stop state before human acceptance or forbidden runtime scope.

## Current Task Pointer

- Current/next task: `M15-001-DAY1-ACCEPTANCE-STATE-RECONCILE-20260616-2241`.
- Last completed task: `M14-004-MOBILE-VISUAL-THEME-ACCESSIBILITY-QA-FINALIZE-20260616-2053`.
- Current state: M15 queued by post-M14 controller-continuation kickoff.
- Manual UI retest status: `deferred_until_day1_acceptance`; not passed by kickoff.
- Manual code review status: `deferred_until_day1_acceptance`; not passed by kickoff.
- Stop sentinel: `STOP-M15-001` stops human acceptance decisions or forbidden runtime/security/schema/storage/money/deployment scope.

## M15 Kickoff Summary

M15 is queued as `Day 1 Acceptance Evidence And Gate Readiness`.

This is a controller-continuation kickoff after the AI V3 controller stop caused by finalized M14 being ready for deferred acceptance review. It is not a Day 1 completion signal, not a manual UI retest pass, and not a manual code review pass.

M15 queue:

- `M15-001-DAY1-ACCEPTANCE-STATE-RECONCILE-20260616-2241` - Queued. Reconcile M1 through M14 evidence, current Day 1 scope, remaining hard-gated gaps, and deferred manual review state without runtime changes.
- `M15-002-DAY1-ACCEPTANCE-EVIDENCE-MAP-HARDENING-20260616-2241` - Queued. Harden the acceptance evidence map and gap classification without changing product behavior.
- `M15-003-DAY1-MANUAL-GATE-PACKAGE-HARDENING-20260616-2241` - Queued. Prepare the future human acceptance gate package while preserving deferred manual status.
- `M15-004-DAY1-ACCEPTANCE-READINESS-QA-FINALIZE-20260616-2241` - Queued. Finalize M15 QA/control state after bounded readiness slices complete.
- `STOP-M15-001` - Stop. Manual gate for Day 1 acceptance decisions or forbidden runtime/security/schema/storage/money/deployment scope.

Manual UI retest and manual code review remain `deferred_until_day1_acceptance`, not passed. M15 kickoff does not imply Day 1 completion.
