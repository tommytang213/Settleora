# Current Milestone

- ID: `M4`
- Name: `Day 1 Mobile Group Bill Lifecycle UX Hardening`
- Target branch: `ai/integration`
- Previous milestone ID: `M3`

## Goal

Advance the next Day 1 blocker after the M3 mobile sync/offline queue foundation by hardening the existing mobile group bill lifecycle UX within already-available API and generated-client seams. M4 covers group bill list/detail/create/submit, participant accept/reject, attachment/OCR-review handoff, and revision entry points without changing backend authority, OpenAPI contracts, generated clients, schema, auth/session runtime, storage policy, settlement or bill calculation authority, deployment, Docker, CI, or secrets.

Repo-state basis for this milestone:

- `README.md` says starter authenticated mobile group-bill read/list/detail surfaces exist, while mobile group bill create/edit/lifecycle/offline support remains future Day 1 work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires shared bill creation, group bills, participant acknowledgement/approval, attachments, receipt/OCR review, archive/restore where safe, and Day 1 shared-bill trust workflows.
- `docs/features/expenses-bills/FUNCTIONAL_SPEC.md` and `docs/features/expenses-bills/TECHNICAL_SPEC.md` define shared bill create, submit, participant correction/revision, attachment, and lifecycle expectations while keeping API/domain services authoritative for financial truth.
- Current mobile code already has bounded group bill seams in `apps/mobile/lib/bills/`, `apps/mobile/lib/groups/`, and focused tests in `apps/mobile/test/group_bill_list_screen_test.dart`, making a mobile-only lifecycle hardening bundle coherent without requiring API, contract, generated-client, schema, money, storage, auth, or deployment changes.

## Allowed Scope For Future M4 Tasks

- Mobile group bill list/detail/create/submit and lifecycle UX code in `apps/mobile/lib/bills/`.
- Existing mobile group context and member-display wiring in `apps/mobile/lib/groups/`.
- Existing mobile receipt OCR review/capture seams only when used through the current group bill create/detail handoff; no new OCR engine, worker, storage, or contract behavior.
- Focused mobile tests for group bill list/detail/create/submit, participant accept/reject, attachments, OCR-review handoff, revision entry points, safe failures, and member-display behavior in `apps/mobile/test/`.
- M4 QA maps and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M4 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security runtime or configuration.
- Database schema/migrations.
- Settlement/payment/bill calculation logic or money authority.
- Storage/file privacy policy.
- Docker/deployment/env/CI config.
- Production secrets.
- Web/admin runtime UI.
- Push notification provider, notification delivery, notification preferences, recurring bill runtime, settlement runtime, broad reporting/import/export, local backup/restore, persistent offline cache, background sync, or unrelated major-domain work.
- New offline queue operations for group bill create/edit unless a later task explicitly scopes them with no API/auth/schema/storage/money/deployment changes and passes the manual safety review if required.

## Done Criteria

- Current mobile group bill lifecycle behavior is reconciled against Day 1 architecture and captured in a QA map.
- Group bill create/submit, attachment/OCR-review handoff, and participant action flows preserve server authority, safe failure handling, and no duplicate mutation on retry.
- Group bill detail/lifecycle surfaces expose server-provided status, participant, revision capability, and attachment state without inferring authorization or financial truth from cached mobile data.
- M4 QA records automated validation and keeps deferred manual UI/code review as deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.

## Current Task Pointer

- Completed task: `M4-001-GROUP-BILL-LIFECYCLE-STATE-RECONCILE-20260615-1659`.
- Next queued task: `M4-002-GROUP-BILL-CREATE-SUBMIT-HARDENING-20260615-1659`.
- Stop sentinel: `STOP-M4-001` for API/contracts/generated-client/auth/schema/storage/money/deployment, broader offline queue/cache/sync, recurring/settlement/reporting/OCR-worker, or unrelated major-domain scope.

## M3 Carry-Forward Boundary

M3 is finalized as a bounded Day 1 mobile sync/offline queue foundation checkpoint. M4 must not expand M3 ad hoc into persistent offline cache, startup/background sync, conflict-resolution UX, backoff/max-attempt policy, manual discard/cancel, or broad sync work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
