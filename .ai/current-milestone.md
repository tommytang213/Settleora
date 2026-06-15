# Current Milestone

- ID: `M8`
- Name: `Day 1 Mobile Settlement Workflow Hardening`
- Target branch: `ai/integration`
- Previous milestone ID: `M7`

## Goal

Advance the next Day 1 blocker after the M7 mobile monthly reports and reconciliation-readout checkpoint by hardening the existing mobile settlement balance, request, payment, residual, counterparty payment-detail, and basket-readout seams. M8 is intentionally mobile and settlement-workflow focused: it improves discoverability, safe state transitions, residual/payment review clarity, bounded local filters, and QA coverage while preserving API/domain authority for money, settlement state, authorization, audit, storage, and balance projection.

Repo-state basis for this milestone:

- `README.md` says the mobile app already has a starter authenticated settlement balance/request/payment detail foundation backed by generated-client seams, while broader product UI remains incomplete.
- `README.md` and settlement architecture docs say backend settlement request/payment/proof, basket preview/create, balance projection, allocation, and residual confirmation runtime already exists.
- `docs/prd/MVP_DAY1_SCOPE.md` requires settlement requests, baskets, pay-all outstanding, exact selected total versus actual paid amount display, explicit residual handling, mark-paid, receiver confirmation, proof attachments, counterparty payment profile display, audit events, and no silent settlement mutation from bill revisions.
- `docs/architecture/SETTLEMENT_RUNTIME_ARCHITECTURE.md`, `docs/architecture/SETTLEMENT_BASKET_RESIDUAL_ARCHITECTURE.md`, and `docs/features/settlements/TECHNICAL_SPEC.md` require the API/domain layer to remain authoritative for settlement amounts, selected lines, residual policy, balances, authorization, status transitions, proof access, and audit.
- Current mobile code under `apps/mobile/lib/settlements/` and focused tests under `apps/mobile/test/settlement_*` already provide bounded seams for settlement list/detail, balances, payment actions, residual confirmation, counterparty payment details, repository mapping, search/filter, and server-authority copy.

## Allowed Scope For Future M8 Tasks

- Mobile settlement repository and generated-client mapping code in `apps/mobile/lib/settlements/`.
- Existing mobile settlement list/detail/payment/residual/counterparty-payment-detail UI in `apps/mobile/lib/settlements/settlement_list_screen.dart`.
- Existing authenticated app-shell entry points in `apps/mobile/lib/app/` only when needed to preserve settlement routing or dashboard-to-settlement handoff.
- Focused mobile tests for settlement list/detail, generated settlement repository mapping, settlement action failure/retry states, residual confirmation, payment claim review, basket/line readouts where already exposed by generated-client seams, counterparty payment details, and server-authority copy in `apps/mobile/test/`.
- M8 QA maps and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M8 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security runtime or configuration.
- Database schema/migrations.
- Settlement/payment/bill calculation logic, residual policy authority, basket expansion authority, balance projection authority, reconciliation mutation authority, statement matching authority, or money authority.
- Storage/file privacy policy, file authorization policy, settlement proof storage policy, generic public file APIs, statement import/upload/download behavior, CSV import/export, backup/restore, or private-vault behavior.
- Docker/deployment/env/CI config.
- Production secrets.
- Payment provider integrations, direct bank sync, provider webhook behavior, statement import/matching, settlement simplification, cross-currency/FX settlement, refund workflows, broad credit ledger behavior, notification delivery providers, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain work.
- Day 1 scope reduction or architecture direction replacement.

## Done Criteria

- Current mobile settlement balance, request, payment, residual, counterparty payment-detail, and available basket/line readout behavior is reconciled against Day 1 settlement requirements and captured in a QA map.
- Settlement list/detail discovery preserves server-provided balance, request, payment, allocation, residual, and selected-line facts; local search/filter only hides loaded rows and never creates financial truth.
- Settlement payment and residual action flows preserve explicit confirmation, retry/failure recovery, duplicate-action prevention, role-aware availability, and safe server-authority copy.
- Counterparty payment details and settlement proof references remain visible only through existing settlement-scoped generated-client seams; M8 does not alter storage/privacy policy or proof byte behavior.
- M8 QA records automated validation and keeps deferred manual UI/code review as deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.
- M8 ends in a bounded controller stop state before backend/API, OpenAPI/contracts, generated clients, schema, auth/session/security, storage/privacy, money/settlement authority, deployment, statement import/matching, provider integrations, CSV import/export, backup/restore, notification delivery, web/admin, or unrelated major-domain work.

## Current Task Pointer

- Current task: none.
- Last completed task: `M8-004-MOBILE-SETTLEMENT-WORKFLOW-QA-FINALIZE-20260615-2306`.
- Current state: M8 is finalized and UI-test ready with no remaining automated M8 work. Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
- Recommended next automated Day 1 action: run the AI V3 controller for the next controller-approved Day 1 milestone or queue kickoff.
- Stop sentinel: `STOP-M8-001` remains preserved and stops API/contracts/generated-client/auth/schema/storage/privacy/money/deployment, settlement authority changes, residual/basket/balance policy changes, provider integrations, statement import/matching, CSV import/export, backup/restore, notification delivery, web/admin, broad offline sync/cache, or unrelated major-domain scope.

## M8 Completion Summary

- `M8-001-MOBILE-SETTLEMENT-WORKFLOW-STATE-RECONCILE-20260615-2306` completed the mobile settlement workflow state reconciliation, QA map, current implementation inventory, automated coverage inventory, Day 1 requirement map, and bounded M8 focus without runtime behavior changes.
- `M8-002-MOBILE-SETTLEMENT-REQUEST-PAYMENT-ACTION-HARDENING-20260615-2306` completed request/payment action hardening for role-aware availability, confirmation copy, duplicate-action prevention, safe failure/retry handling, refresh-after-mutation recovery, and server-authority messaging inside existing mobile seams.
- `M8-003-MOBILE-SETTLEMENT-RESIDUAL-BASKET-READOUT-HARDENING-20260615-2306` completed residual, allocation, selected-line/basket, balance, loaded-row filter, and counterparty payment-detail readout hardening over server-returned data only.
- `M8-004-MOBILE-SETTLEMENT-WORKFLOW-QA-FINALIZE-20260615-2306` completed control/QA finalization, marked M8 UI-test ready, recorded validation coverage, and preserved deferred manual UI/code review status.

## M7 Carry-Forward Boundary

M7 is finalized as `Day 1 Mobile Monthly Reports + Reconciliation Readout Hardening` and remains awaiting deferred Day 1 acceptance review. M8 must not expand M7 ad hoc into statement import/matching, reconciliation mutations, CSV import/export, backup/restore, reporting backend/API redesign, generated dashboard APIs, storage/privacy policy, money authority, notification delivery, web/admin runtime, or unrelated reporting work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
