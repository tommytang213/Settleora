# M8 Mobile Settlement Workflow QA Map

Status: `M8 queued; first task pending; manual UI/code review deferred until Day 1 acceptance`

## Boundary

M8 hardens the mobile settlement workflow UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security changes, storage/privacy or settlement proof byte behavior changes, residual policy changes, basket expansion authority changes, balance projection authority changes, money or settlement calculation changes, payment provider integrations, statement import/matching, reconciliation mutations, CSV import/export, backup/restore, deployment, Docker, CI, secrets, web/admin runtime UI, notification delivery, or broad offline cache/sync work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by this kickoff.

## Selection Basis

- `README.md` records an existing starter authenticated mobile settlement balance/request/payment detail foundation backed by generated-client seams.
- `README.md` records current backend settlement request/payment/proof, basket preview/create, balance projection, allocation, and residual-confirmation runtime.
- `docs/prd/MVP_DAY1_SCOPE.md` requires settlement requests, baskets, pay-all outstanding, exact selected total versus actual paid amount display, explicit residual handling, mark-paid, receiver confirmation, proof attachments, payment profile display, audit events, and no silent settlement mutation from bill revisions.
- `docs/architecture/SETTLEMENT_RUNTIME_ARCHITECTURE.md` and `docs/architecture/SETTLEMENT_BASKET_RESIDUAL_ARCHITECTURE.md` require API/domain authority for settlement state transitions, selected lines, payment allocations, residual policy, balances, authorization, proof access, and audit.
- `docs/features/settlements/TECHNICAL_SPEC.md` requires clients to display previews and server-returned facts without deciding financial truth.
- Current mobile settlement files under `apps/mobile/lib/settlements/` and focused tests under `apps/mobile/test/settlement_*` provide bounded seams for M8 without requiring API, contract, generated-client, schema, auth, storage, money, deployment, or provider changes.

## Current Implementation Inventory

M8-001 must reconcile this inventory in detail before runtime work:

- `apps/mobile/lib/settlements/settlement_repository.dart` defines mobile settlement request, line, payment, allocation, residual, balance, and counterparty payment-detail models with status helper methods and repository actions for list/get, mark-paid, cancel, dispute, confirm payment, and confirm residual.
- `apps/mobile/lib/settlements/generated_settlement_repository.dart` maps generated-client settlement balances, requests, payments, allocations, residuals, and counterparty payment details into the mobile repository seam.
- `apps/mobile/lib/settlements/settlement_list_screen.dart` renders settlement landing summaries, balances, request filters/search, detail review summaries, selected lines, payments, residuals, counterparty payment details, mark-paid, cancel, dispute, payment confirmation/cancellation/dispute, and residual confirmation.
- `apps/mobile/test/settlement_list_screen_test.dart` covers list/detail navigation, residual confirmation, landing filters, safe visible-value search, raw identifier non-matching, clear filters, mark-paid confirmation, loaded review summary facts, and settlement action behavior.
- `apps/mobile/test/settlement_generated_repository_test.dart` covers generated-client mapping and failure handling for settlement repository calls.

## Day 1 Requirement Map

| Day 1 settlement requirement | Current M8 stance |
| --- | --- |
| Settlement requests and payment actions | Existing mobile seams expose request detail and conservative online actions; M8-002 should harden action availability, confirmations, duplicate-action guards, and refresh/failure recovery. |
| Settlement baskets and selected lines | Backend supports pay-all basket preview/create and request lines; current mobile readouts show loaded selected-line facts where available. M8-003 should harden readout clarity without adding basket authority or new APIs. |
| Exact selected total vs actual paid amount | Server-returned request/payment amounts are displayed; M8 should keep exact and actual paid amounts separate and never calculate authoritative clearing. |
| Explicit residual handling | Existing mobile residual readouts and receiver confirmation exist. M8-003 should harden pending/confirmed/disputed/cancelled/credit/waiver copy and receiver-confirmation blocking behavior. |
| Counterparty payment profile display | Existing settlement-scoped payment detail read exists. M8 should preserve bounded visibility copy and avoid broad profile/storage changes. |
| Proof attachments | Backend proof runtime exists, but this kickoff does not add proof byte behavior. Any proof UI/storage policy expansion is a stop condition unless explicitly scoped later. |
| Settlement audit and authorization | API/domain services remain authoritative. Mobile can show server-authority copy and must not infer authorization from hidden controls. |
| Bill revision settlement impact | M8 must not implement bill revision settlement policy. Mobile copy can clarify loaded settlement facts do not silently change because of local UI state. |

## Queue Expectations

- `M8-001`: Reconcile current mobile settlement implementation and automated coverage without runtime behavior changes. Status: queued.
- `M8-002`: Harden request and payment action flows inside existing mobile seams. Status: queued.
- `M8-003`: Harden residual, selected-line/basket, balance, and counterparty payment-detail readouts inside existing mobile seams. Status: queued.
- `M8-004`: Finalize QA/control state, record validation, mark UI-test ready, and leave manual UI/code review deferred. Status: queued.
- `STOP-M8-001`: Stop for forbidden API/contracts/generated-client/auth/schema/storage/privacy/money/settlement authority/deployment/provider/import/export/backup/notification/web/admin/broad-sync scope.

## Validation Expectations

M8 kickoff validation:

- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

M8 implementation validation should add focused settlement Flutter tests and full `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` when mobile runtime files change.

## Stop Conditions

Stop and report `BLOCKED` if an M8 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, schema/migrations, storage/file privacy or authorization policy changes, settlement proof byte behavior, settlement/payment/bill calculation authority, residual policy authority, basket expansion authority, balance projection authority, money authority, provider integrations, direct bank sync, statement import/matching, reconciliation mutations, CSV import/export, backup/restore, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, notification delivery, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M8 kickoff.
