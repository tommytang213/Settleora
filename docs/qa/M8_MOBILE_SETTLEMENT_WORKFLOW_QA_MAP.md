# M8 Mobile Settlement Workflow QA Map

Status: `M8-003 completed; M8-004 queued; manual UI/code review deferred until Day 1 acceptance`

## Boundary

M8 hardens the mobile settlement workflow UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security changes, storage/privacy or settlement proof byte behavior changes, residual policy changes, basket expansion authority changes, balance projection authority changes, money or settlement calculation changes, payment provider integrations, statement import/matching, reconciliation mutations, CSV import/export, backup/restore, deployment, Docker, CI, secrets, web/admin runtime UI, notification delivery, or broad offline cache/sync work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M8-003.

## Selection Basis

- `README.md` records an existing starter authenticated mobile settlement balance/request/payment detail foundation backed by generated-client seams.
- `README.md` records current backend settlement request/payment/proof, basket preview/create, balance projection, allocation, and residual-confirmation runtime.
- `docs/prd/MVP_DAY1_SCOPE.md` requires settlement requests, baskets, pay-all outstanding, exact selected total versus actual paid amount display, explicit residual handling, mark-paid, receiver confirmation, proof attachments, payment profile display, audit events, and no silent settlement mutation from bill revisions.
- `docs/architecture/SETTLEMENT_RUNTIME_ARCHITECTURE.md` and `docs/architecture/SETTLEMENT_BASKET_RESIDUAL_ARCHITECTURE.md` require API/domain authority for settlement state transitions, selected lines, payment allocations, residual policy, balances, authorization, proof access, and audit.
- `docs/architecture/PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md` is present and records settlement-scoped counterparty payment-details and QR content reads as relationship-backed API behavior, not client-side permission.
- `docs/features/settlements/TECHNICAL_SPEC.md` requires clients to display previews and server-returned facts without deciding financial truth.
- Current mobile settlement files under `apps/mobile/lib/settlements/` and focused tests under `apps/mobile/test/settlement_*` provide bounded seams for M8 without requiring API, contract, generated-client, schema, auth, storage, money, deployment, or provider changes.

## Current Repository And Model Inventory

`apps/mobile/lib/settlements/settlement_repository.dart` is the hand-written mobile boundary. It stores server-returned amount strings and currencies as display/model values and does not calculate authoritative settlement amounts.

- Request summaries/details: `SettleoraSettlementRequest` preserves request ID, source bill ID, optional group ID, debtor/creditor/requester profile IDs, amount, currency, status, requested/created/updated timestamps, and request lines. Helper methods classify debtor, creditor, requester, participant, counterparty, cancel eligibility, and dispute eligibility for UI availability only.
- Request lines / selected lines: `SettleoraSettlementRequestLine` preserves line ID, source expense bill ID, optional source bill revision ID, optional source candidate key, exact amount, currency, allocation order, status, and timestamps. Mobile displays loaded selected-line facts and never expands basket membership locally.
- Settlement payments: `SettleoraSettlementPayment` preserves payment ID, request ID, paid-by/received-by profile IDs, actual paid amount/currency, status, payment date, claimed/created/updated timestamps, allocations, residuals, and the server-returned request status after payment mapping.
- Allocations: `SettleoraSettlementPaymentAllocation` preserves allocation ID, settlement request line ID, cleared amount, currency, allocation order, and created timestamp. Mobile currently displays allocation count and makes allocation amounts searchable in payment filtering.
- Residuals: `SettleoraSettlementPaymentResidual` preserves residual ID, payment ID, request ID, direction, amount, currency, policy, status, created timestamp, and optional resolved timestamp. `canConfirm` is true only for `pending_receiver_confirmation`.
- Balances: `SettleoraSettlementBalanceSnapshot` and `SettleoraSettlementBalance` preserve generated timestamp, counterparty profile ID, optional group ID, direction, currency, selected line amount, pending claimed amount, confirmed cleared amount, remaining unclaimed amount, confirmed remaining residual amount, waived residual amount, credit residual amount, request count, line count, pending payment count, and confirmed payment count.
- Counterparty payment details: `SettleoraSettlementCounterpartyPaymentDetails` preserves user profile ID, configured state, preferred method label, handle, note, applied visibility, and QR-file presence. It does not expose QR bytes, file IDs, storage paths, provider internals, or vault metadata.
- Proof metadata/readout: repository and UI do not currently expose settlement proof metadata/readout, proof file lists, proof content, or proof removal. Backend/generated-client proof runtime exists, but M8-001 did not add a proof UI seam.
- Failure kinds and safe failure mapping: mobile failures are bounded as `sessionRequired`, `sessionExpired`, `denied`, `unavailable`, `conflict`, `validation`, `network`, and `server`, each with safe UI titles and messages.

## Generated-Client Repository Mapping

`apps/mobile/lib/settlements/generated_settlement_repository.dart` adapts the generated Dart client into the hand-written settlement seam.

- Token/session handling: every call reads an access token through `SettleoraAccessTokenProvider`, trims it, and returns `sessionRequired` without calling the generated client when no nonblank token is available. A generated 401 maps to `sessionExpired`.
- Personal/current-actor visibility assumptions: the repository does not submit a current actor ID. It relies on the server/session to decide current actor, visibility, authorization, request list scope, balance projection scope, mutation permission, counterparty payment-detail visibility, proof access, and audit.
- Request mapping: generated settlement request responses map ID, source bill, group, debtor, creditor, amount, currency, status, requester, timestamps, and request lines into the mobile model without financial recomputation.
- Payment mapping: generated payment responses map actual paid amount/currency, payment status, payment date, payment actors, allocation summaries, residual summaries, and request status into the mobile model.
- Residual mapping: generated residual direction, policy, amount, currency, status, created timestamp, and resolved timestamp are preserved as server-returned facts.
- Balance mapping: generated balance projections map selected-line amount, pending claimed, confirmed cleared, remaining unclaimed, confirmed remaining residual, waived residual, credit residual, request/line/payment counts, direction, counterparty, group, and currency directly.
- Counterparty payment-detail mapping: generated counterparty response maps configured state, method/handle/note, visibility applied, and QR presence only. QR metadata is collapsed to `hasQrFile`; QR content is not read by this mobile settlement UI.
- Safe mapping of failures: `400`/`422` map to validation refresh copy; `401` maps to expired session; `403` maps to denied; `404`/`410` map to unavailable; `409` maps to conflict/refresh; `5xx` maps to server unavailable; socket/HTTP/handshake/timeout/IO errors map to network retry copy; unknown errors map to safe server failure.
- Generated-client availability is not permission: presence of generated methods for balances, request/payment mutations, residual confirmation, and counterparty payment details does not authorize an actor. The API/domain layer remains authoritative.

## Mobile Settlement UI Inventory

`apps/mobile/lib/settlements/settlement_list_screen.dart` currently provides both the settlement landing list and detail workflow.

- Landing summaries: list screen loads balances and requests, shows `Settle landing` with open balance count, needs-action count, open request count, shortcuts for all settlements and needs action, and copy that the screen reviews server-returned balances, requests, and payment actions.
- Balance rows: balance tiles show incoming/outgoing direction, remaining, pending, cleared, request count, and pending payment count. Current rows do not show selected-line amount, line count, confirmed payment count, confirmed remaining residual, waived residual, or credit residual explicitly.
- Request list filters/search: loaded requests can be filtered by all, needs action, incoming, outgoing, open, confirmed, and disputed. Search uses safe visible tokens such as amount, currency, role words, status labels, and line display tokens. Raw settlement, bill, group, profile, line, revision, and candidate IDs are intentionally not search tokens.
- Request detail review summaries: detail loads the request, payments, and relationship-scoped counterparty payment details when a counterparty can be derived. Review Summary shows request status/role, line count, payment count, residual count, residuals needing confirmation, and payment-detail availability.
- Selected lines / request lines: Request Lines shows loaded server-returned lines with exact amount, currency, and status plus local search. It does not show source bill labels, source revision labels, candidate keys, basket selection mode, selection-source copy, or selected-total versus actual-paid comparison beyond request/payment amounts.
- Payments and allocation summaries: Payments shows actual paid amount/currency, payment date, status, allocation count, residual list, role-aware action buttons, pending receiver copy, and residual-blocked confirmation copy. Allocation details are not fully itemized in UI.
- Residual readouts and residual confirmation: residual rows show amount/currency and status; pending residuals can be confirmed by receivers only. Current readout does not show residual direction or policy in the visible row, though both are searchable and present in the model.
- Counterparty payment detail visibility: detail screen shows method, handle, note, and QR availability when the settlement-scoped counterparty response is configured; denied/unavailable/not-configured states are bounded. The UI does not expose QR bytes or broader profile lookup.
- Proof readouts: settlement proof metadata, proof count, proof file list, proof attach/remove, and proof content are not currently surfaced in the mobile settlement screen.
- Action availability: debtor sees Mark paid for `requested`; requester sees Cancel for cancellable requested settlements; participants see Dispute for requested, partially paid, and marked paid; receiver sees Confirm only when a marked-paid payment has no pending residuals; payer sees Cancel on marked-paid payment claims; receiver sees Dispute on marked-paid payment claims; receiver sees residual Confirm on pending residual rows.
- Refresh/retry/empty/filtered-empty states: list and detail have loading states, refresh buttons, pull-to-refresh on list, retry panels for failures, empty balances, empty requests, filtered-empty requests, no request lines, filtered-empty request lines, no payments, filtered-empty payments, and no/not-configured/unavailable payment details.
- Server-authority copy: mark-paid, confirm receipt, residual confirmation, cancel, dispute, landing summary, lifecycle, and failure copy point users back to server verification or existing server authority. M8-002 strengthened action copy; more explicit readout copy remains useful for M8-003.

## App-Shell And Notification Handoffs

- `apps/mobile/lib/app/server_mode_shell.dart` loads settlement balances and settlement requests into the authenticated dashboard overview alongside bills, notifications, and recurring data.
- Dashboard settlement counts use loaded request statuses and remaining balance rows to show open balance/action shortcuts only. These are discovery hints, not authorization or financial truth.
- Dashboard settlement action shortcut opens the settlement list with the `needsAction` filter active. The ordinary settlement tile opens the same list unfiltered.
- Notification UI has settlement handoff coverage for opening settlement request notifications through the settlement detail seam when a settlement request ID is present; payment-only notification rows require the request/profile seam and do not infer route access from raw action URLs.

## Automated Coverage Inventory

`apps/mobile/test/settlement_list_screen_test.dart` covers:

- List load of balances and requests, detail navigation, payment details load, pending residual display, and residual confirmation.
- Landing summary shortcuts and startup needs-action filter clearing.
- List search/filter over safe visible values, nonmatching raw identifiers, combined filter/search, clear filters, filtered-empty state, and search-controller disposal.
- Mark-paid dialog confirmation, server-authority copy, local empty-input validation, role-based hiding from creditors, duplicate-tap guard while mark-paid is in flight, and refresh-after-mutation call counts.
- Detail review summary facts for line/payment/residual/payment-detail counts.
- Request-line local filtering and filtered-empty state.
- Payment/residual local filtering and residual action binding to the visible payment row.
- Receiver confirm-payment flow and duplicate-tap guard while confirmation is in flight.
- Request dispute confirmation without reason input.
- Confirmed settlement hiding request/payment lifecycle actions.
- Bounded session failure state.

`apps/mobile/test/settlement_generated_repository_test.dart` covers:

- Session-required failure before generated-client calls.
- Mapping of balance projections, request summaries/details, request lines, payments, allocations, residuals, and counterparty payment details into bounded mobile models.
- Trimming route IDs for request/payment/residual mutations and payment-claim body values.
- Create payment claim mapping for mark-paid.
- Safe generated failure mapping for conflict and network failures.

Other focused settlement-adjacent coverage:

- `apps/mobile/test/server_mode_shell_dashboard_test.dart` covers authenticated shell settlement balance/request loading, dashboard settlement counts, settlement action shortcut visibility, opening needs-action settlement list, and opening unfiltered settlement list.
- `apps/mobile/test/dashboard_preview_screen_test.dart` covers static dashboard settlement suggestion/no-settlement preview copy only; it does not exercise generated settlement runtime.
- `apps/mobile/test/notification_screen_test.dart` covers settlement notification grouping, safe summary display, opening settlement request notifications through the settlement detail seam, requiring usable settlement request IDs for payment notification handoff, and avoiding raw API action URL display.
- `apps/mobile/test/notification_generated_repository_test.dart` covers notification mapping of settlement request/payment IDs, not settlement repository behavior.

Uncovered or partially covered areas:

- No mobile tests currently cover proof metadata/readout because proof UI is not surfaced.
- No mobile tests cover QR content read because settlement detail only shows QR availability.
- No mobile tests currently assert visible residual direction/policy labels because the UI does not display them.
- No mobile tests cover exact selected total versus actual paid amount separation as a named summary.
- No mobile tests cover explicit balance residual fields in UI because current balance tiles hide confirmed remaining residual, waived residual, and credit residual amounts.
- No mobile tests cover basket preview/create UI because no mobile basket creation or preview UI is currently surfaced.
- No mobile tests cover payment cancellation specifically, although repository seam and UI action exist.
- No mobile tests cover action failure followed by retry or refresh-after-mutation failure recovery in detail.

No mobile runtime or test files were changed by M8-001, so focused Flutter tests and full mobile validation were not required for this documentation/control reconciliation task.

## Day 1 Requirement Map

| Day 1 settlement requirement | Current state | M8 implication |
| --- | --- | --- |
| Settlement request/create | Existing mobile lists/opens server-created requests and does not create requests. Backend request create exists outside this UI. | M8-002 hardened request action handling only; no new API or create authority. |
| Settlement baskets / pay-all outstanding | Backend basket preview/create exists; mobile shows request lines returned on existing requests but no basket preview/create workflow. | M8-003 should improve selected-line/basket readout over loaded lines only. |
| Select all visible eligible outstanding lines | Not surfaced in current mobile settlement UI. | Non-goal unless an explicit later task scopes existing API-backed UI without client authority. |
| Exact selected total vs actual paid amount display | Request amount and payment actual paid amount are displayed separately in different sections, but there is no explicit comparison/readout naming exact selected total versus actual paid amount. | M8-003 focus. |
| Explicit residual handling | Residuals are modeled and displayed with receiver confirmation. Direction/policy clarity is incomplete in visible UI. | M8-003 focus. |
| Mark as paid | Debtor mark-paid action exists with amount/currency/date fields and server-authority copy. | M8-002 hardened confirmation, failure, retry, duplicate prevention, and refresh behavior. |
| Partial payment / allocation readout | Payment amount and allocation count are visible; allocation amounts are searchable but not itemized. | M8-003 should clarify allocation/balance copy without creating allocation authority. |
| Receiver confirmation | Receiver confirm action exists when marked-paid payment has no pending residuals. Pending residuals block confirmation. | M8-002 hardened action/failure states. |
| Dispute/cancellation | Request cancel/dispute and payment cancel/dispute seams exist with role/status availability. | M8-002 added focused payment cancel/dispute coverage and bounded failure hardening. |
| Settlement proof attachment readout | Backend proof runtime exists; mobile settlement UI does not surface proof metadata/readout. | Non-goal for M8 unless existing seams expose metadata in a later explicitly scoped slice. |
| Payment profile display to authorized counterparties | Settlement-scoped counterparty details are loaded and displayed as method/handle/note/QR availability. | M8-003 should clarify visibility copy and no broad profile lookup. |
| Settlement audit and authorization | API/domain remains authoritative; mobile copy references server verification/audit. | Keep all authorization/audit claims server-authoritative. |
| Pending bill revisions must not silently mutate settlement balances or selected lines | Current mobile displays loaded request lines/balances and does not implement bill-revision settlement mutation. | M8-003 can add clarifying copy only; no policy implementation. |

## Gap Focus For M8-002

M8-002 stayed inside existing mobile settlement seams and completed:

- Request/payment action availability clarity for debtor, creditor, requester, and terminal states by showing loaded status/role as UI guidance only.
- Confirmation copy for mark-paid, request cancel, request dispute, payment confirm, payment cancel, payment dispute, and residual confirm.
- Duplicate-action prevention across existing request/payment/residual mutation paths while one mutation is active.
- Safe bounded retry/failure copy for session, denied, unavailable, conflict, validation, network, and server failures.
- Refresh-after-mutation behavior that preserves a successful mutation result when the follow-up refresh fails, keeps the loaded state visible, and tells the user to refresh before repeating an action.
- Server-authority messaging that the API/domain layer decides authorization, status transitions, residual blocking, audit, payment truth, and money.
- No new API, no generated-client work, no settlement authority, and no proof byte/storage behavior.

Focused M8-002 validation:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/settlement_list_screen_test.dart` passed with 25 tests.
- Added focused tests for request action confirmation/success refresh, duplicate request action blocking, bounded unsafe request action failure copy, payment confirmation/success refresh, duplicate payment action blocking, payment cancellation, payment dispute, mutation-success plus refresh-failure copy, server-authority/no-local-money-authority copy, and unsafe raw string suppression in visible action failure text.

Remaining M8-002 warning:

- Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.

## Gap Focus For M8-003

M8-003 stayed inside existing mobile settlement readout seams and completed:

- Residual readout clarity for direction, policy, pending receiver confirmation, and terminal residual statuses already present in loaded payment residual models.
- Selected-line / basket readout clarity over loaded request lines, including loaded line count, exact line amounts, selected total copy, and explicit server-derived selected scope messaging.
- Explicit separation of server-returned request amount / selected total from actual paid amount shown on payment claims.
- Allocation and balance copy for selected-line amount, pending claimed, confirmed cleared, remaining unclaimed, confirmed remaining residual, waived residual, credit residual, line count, pending payment count, and confirmed payment count.
- Counterparty payment details visibility copy that explains settlement-scoped, relationship-backed, API-authorized access without exposing QR bytes, storage internals, provider internals, profile lookup, or raw identifiers.
- Loaded-row filtering copy for request lines and payments/residuals, including local-filter behavior, filtered-empty states, and clear-filter restoration of already-loaded API rows.
- Proof UI remains out of scope because the current mobile settlement UI/repository seam does not expose settlement proof metadata/readouts; no proof byte, storage, file ID, or file metadata behavior was added.
- No provider integration, no reconciliation mutation, no money authority, no new settlement policy, no basket expansion authority, no balance projection authority, and no generated-client/API changes.

Focused M8-003 validation:

- `cd apps/mobile && /opt/flutter/bin/flutter test test/settlement_list_screen_test.dart test/settlement_generated_repository_test.dart` passed with 34 settlement list/widget tests plus generated settlement repository tests in the same command.
- Added focused tests for full balance residual/allocation field readouts, loaded selected-line scope and filtered-empty copy, exact selected total versus actual paid amount separation, allocation clearing facts, residual direction/policy/status labels, counterparty payment-detail visibility copy, local payment/residual filter copy, and suppression of raw settlement/API/storage strings in new visible copy.

Full mobile validation:

- `cd /workspace/repos/Settleora && PATH=/opt/flutter/bin:$PATH npm run validate:mobile` passed with 697 Flutter tests.

Remaining M8-003 gaps:

- Mobile still does not surface settlement proof metadata/readouts because no safe mobile UI/repository proof metadata seam exists in this slice.
- Mobile still does not implement basket preview/create, pay-all, select-all-visible, basket expansion, proof attach/remove/content, QR content reads, provider integrations, statement import/matching, reconciliation mutations, or broad offline settlement cache behavior.
- Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.

## Queue Expectations

- `M8-001-MOBILE-SETTLEMENT-WORKFLOW-STATE-RECONCILE-20260615-2306` - Completed by this QA/control update. Reconciled current mobile settlement implementation and automated coverage without runtime behavior changes.
- `M8-002-MOBILE-SETTLEMENT-REQUEST-PAYMENT-ACTION-HARDENING-20260615-2306` - Completed. Hardened settlement request/payment action availability, confirmations, duplicate-action guards, retry/failure recovery, refresh-after-mutation recovery, and server-authority copy inside existing mobile seams.
- `M8-003-MOBILE-SETTLEMENT-RESIDUAL-BASKET-READOUT-HARDENING-20260615-2306` - Completed. Hardened residual, allocation, selected-line/basket, balance, loaded-row filter, and counterparty payment-detail readouts inside existing mobile seams.
- `M8-004-MOBILE-SETTLEMENT-WORKFLOW-QA-FINALIZE-20260615-2306` - Queued. Finalize M8 QA/control state, record validation, mark UI-test ready, and leave manual UI/code review deferred.
- `STOP-M8-001` - Preserved. Stop for forbidden API/contracts/generated-client/auth/schema/storage/privacy/money/settlement authority/deployment/provider/import/export/backup/notification/web/admin/broad-sync scope.

## Validation Expectations

M8-001 validation:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

M8 implementation validation should add focused settlement Flutter tests and full `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` when mobile runtime or mobile test files change.

## Stop Conditions And Non-Goals

Stop and report `BLOCKED` if an M8 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, schema/migrations, storage/file privacy or authorization policy changes, settlement proof byte behavior, settlement/payment/bill calculation authority, residual policy authority, basket expansion authority, balance projection authority, money authority, provider integrations, direct bank sync, statement import/matching, reconciliation mutations, CSV import/export, backup/restore, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, notification delivery, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Non-goals preserved through M8-002: no backend/API behavior, no OpenAPI or generated-client changes, no schema/auth/storage/privacy/money/settlement authority changes, no settlement proof byte behavior, no payment provider integration, no statement matching, no CSV/import/export/backup work, no manual UI/code review pass, and no merge without the required PR/CI/merge gates.
