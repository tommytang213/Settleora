# Day 1 Money Rounding Authority Audit

## Purpose

This audit maps Day 1 money, split, bill, settlement, recurring, OCR, import/export, reconciliation, and reporting paths against Settleora's centralized rounding and server-authoritative money policy.

It is a docs/control packet for GitHub issue #396 and parent epic #349. It does not implement runtime behavior, close #396, close #349, change money calculation code, change OpenAPI, refresh generated clients, add migrations, or change UI.

## Source Baseline

- Candidate: `D1-CAND-012`
- Bundle: `money-1`
- Target issue: #396 `Audit all Day 1 money paths against centralized rounding policy`
- Parent epic: #349 `E4 Money/split/rounding engine`
- Related open children at audit time: #350 quantity/open claim states and #352 manual FX snapshots
- Related closed child at audit time: #351 mixed tax-rate and fee allocation validation coverage

Primary source documents:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md)
- [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Expense bill multi-tax-rate architecture](EXPENSE_BILL_MULTI_TAX_RATE_ARCHITECTURE.md)
- [Currency exchange architecture](CURRENCY_EXCHANGE_ARCHITECTURE.md)
- [Receipt OCR review apply policy](RECEIPT_OCR_REVIEW_APPLY_POLICY.md)
- [Statement reconciliation architecture](STATEMENT_RECONCILIATION_ARCHITECTURE.md)
- [Lock, refund, and group governance architecture](LOCK_REFUND_GOVERNANCE_ARCHITECTURE.md)
- [Day 1 E2E regression matrix](../acceptance/day1/DAY1_E2E_REGRESSION_MATRIX.md)
- [Day 1 acceptance evidence and hard-gated gaps](../acceptance/day1/DAY1_ACCEPTANCE_EVIDENCE_AND_GAPS.md)

## Audit State Vocabulary

| State | Meaning |
| --- | --- |
| `covered` | Current repo docs and tests justify the bounded path as covered for the current implemented slice. |
| `covered_with_manual_gate` | Architecture, current code, or tests cover a bounded path, but money/manual review remains required before a Day 1 acceptance claim. |
| `planned` | Day 1 scope exists, but runtime/schema/API/UI/test work is not complete enough to claim coverage. |
| `blocked` | A manual gate, Figma/reference gate, unresolved child issue, or architecture/runtime dependency blocks implementation or acceptance. |
| `not_day1` | The current repo explicitly defers the runtime path to Day 2, Day 3, or future work. |
| `needs_runtime_followup` | Current docs or starter runtime exist, but focused runtime validation or tests must be added before the path can be trusted. |

Rows are conservative. A path is not `covered` merely because an architecture document exists.

## Central Authority Rules

Settleora's Day 1 money authority rules are:

- API/domain services own authoritative money calculation, allocation, rounding, residual assignment, settlement/payment state, bill status transitions, approval impact, authorization, and audit.
- Clients may render server results, format values, run form validation, queue local work, and show provisional previews. They must not be the source of financial truth, settlement truth, rounding residuals, affected-user state, payer reconfirmation truth, or authorization.
- OCR, parser, import, offline queue, generated client, and UI-provided values are provisional until accepted by API/domain validation.
- Workers may produce provisional outputs only. They must not directly mutate expense, bill, split, settlement, balance, payment, reconciliation, file-subject, or audit tables.
- Privacy/vault behavior must not move shared financial truth, settlement state, authorization, sync acceptance, or audit into client authority.

## Decimal And Currency Requirements

Authoritative Day 1 money values must:

- Use decimal-safe server types and validation. Current API direction uses .NET `decimal`, `MoneyAmount`, and decimal-string public contract semantics.
- Carry an explicit uppercase three-letter currency code. No authoritative value may rely on locale, symbol, payment method, user default currency, OCR text, or UI display as the currency.
- Use centralized rounding and allocation policy, including explicit midpoint behavior and supported currency minor units.
- Preserve deterministic residual handling at allocation, persistence, settlement, and final payable boundaries.
- Persist amount/currency pairs together. Nullable or provisional amount/currency pairs are allowed only for drafts, OCR candidates, imports, filters, or incomplete states that are explicitly not financial truth.
- Avoid float/double-derived authoritative totals in API/domain models, database money columns, OpenAPI money contracts, generated client authority, worker outputs, reports, or client previews presented as accepted truth.

Current concrete evidence includes `MoneyFoundationTests`, `ExpenseBillCalculationServiceTests`, `SettlementCandidateDerivationServiceTests`, settlement residual/basket tests, bill endpoint tests, receipt OCR review endpoint tests, recurring bill endpoint tests, and settlement balance projection tests. That evidence is bounded to the implemented same-currency and draft/provisional slices described below.

## Day 1 Money Path Inventory

| Path | Current audit state | Current evidence | Conservative gap or follow-up |
| --- | --- | --- | --- |
| Money foundation: decimal parsing, currency validation, supported minor units, rounding, and allocation residuals | `covered_with_manual_gate` | `MONEY_ROUNDING_ARCHITECTURE.md`; `MoneyFoundationTests`; internal `MoneyAmount`, `CurrencyCode`, `SupportedCurrencyPolicy`, `MoneyRoundingService`, and `MoneyAllocationService` | Manual money reviewer sign-off remains required before broad Day 1 acceptance. |
| Personal bill create/list/get with same-currency totals, item splits, participants, payers, and adjustments | `covered_with_manual_gate` | `EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md`; `ExpenseBillCalculationServiceTests`; `PersonalBillEndpointTests`; `BillWorkflowEndpointTests`; `ExpenseBillSchemaFoundationTests` | Current coverage is bounded to implemented same-currency shapes. Full edit lifecycle and all Day 1 edge cases remain planned/gated. |
| Group bill create/list/get with same-currency totals and server authorization | `covered_with_manual_gate` | `GroupBillEndpointTests`; group bill architecture and generated contract evidence listed in README | Mobile group bill create/edit/offline lifecycle and broader group dashboard money readouts remain incomplete. |
| Bill items, quantities, item-level shares, participants, and payer contribution validation | `needs_runtime_followup` | `ExpenseBillCalculationServiceTests`; implemented item split/payer/participant schema foundation | Quantity-level claim states, open/self-claim states, partial claims, creator review, conflict states, and tax/refund propagation remain open under #350. |
| Claim/unresolved item states | `blocked` | Day 1 scope and coverage matrix identify this as required | #350 is open, manual-gated, and Figma/reference-gated; no client or runtime may finalize claim authority. |
| Generic tax, discount, service fee, credit, and manual adjustment rows in current same-currency bill calculation | `needs_runtime_followup` | Existing adjustment model and calculation tests cover bounded generic adjustments | Full Day 1 multi-tax, component classification, refund/return linkage, contribution treatment, and receipt mismatch behavior are not fully runtime-proven. |
| Multi-tax receipts, mixed tax-included/tax-excluded lines, discount-before/after-tax, tax refunds, fee tax treatment, and receipt total reconciliation | `planned` | `EXPENSE_BILL_MULTI_TAX_RATE_ARCHITECTURE.md`; #351 closed; #427/#428/#430 closed; #429 remains a UI/reference blocker according to issue body | Closed docs/validation artifacts do not prove full runtime/API/schema/UI implementation. Future work must stay money/schema/OpenAPI/manual-gated. |
| Coupon, points, gift card, store credit, tender, change, void/free/refund/tax-correction classification | `planned` | `MVP_DAY1_SCOPE.md`; `EXPENSE_BILL_MULTI_TAX_RATE_ARCHITECTURE.md`; Day 1 coverage matrix | Needs runtime and review UX follow-up. Tender/change must be excluded by default unless reviewed policy converts them. |
| Receipt-total mismatch handling | `planned` | Architecture requires review/error state or explicit adjustment | Runtime must prove no silent mutation of item totals, tax groups, discounts, refunds, payer contributions, participant shares, or settlement bases. |
| Bill revisions: proposal, review baseline/diff, affected-user approval, payer reconfirmation, apply policy, and settlement blocking | `covered_with_manual_gate` | `ExpenseBillRevisionEndpointTests`; `ExpenseBillRevisionProposalServiceTests`; `ExpenseBillRevisionSettlementApplyPolicyTests`; bill revision architecture docs | Full item/split/adjustment/tax/OCR snapshot depth remains limited until future snapshot implementation. |
| Bill archive/restore and lifecycle effects | `covered_with_manual_gate` | `BillLifecycleEndpointTests`; `MVP_DAY1_SCOPE.md` soft-delete/archive rules | Cross-record archive/delete restriction audit across files, settlements, recurring, exports, and reports remains a follow-up. |
| Settlement candidate preview from confirmed bills | `covered_with_manual_gate` | `SettlementCandidateDerivationServiceTests`; `SettlementCandidatePreviewEndpointTests`; same-currency validation | Same-currency confirmed-bill candidates are covered. Broad simplification, reopen, refund, and cross-currency settlement are not covered. |
| Settlement requests, request lines, basket preview/create, payment claims, allocations, receiver confirmation, dispute, cancellation, and residual confirmation | `covered_with_manual_gate` | `SettlementRequestCreateEndpointTests`; `SettlementRequestReadEndpointTests`; `SettlementPaymentClaimEndpointTests`; `SettlementRuntimePolicyTests`; `SettlementResidualPolicyServiceTests`; `SettlementBasketPreviewEndpointTests`; `SettlementBalanceProjectionEndpointTests` | Manual settlement review remains required. Broad credit ledger, refund workflow, simplification, reopen/adjustment policy, and cross-currency settlement remain planned or non-Day-1. |
| Payment records and proof visibility | `covered_with_manual_gate` | `SettlementPaymentProofEndpointTests`; `SettlementCounterpartyPaymentDetailsEndpointTests`; storage architecture docs | Proof is optional and cannot bypass settlement authz. Storage/privacy manual review remains required. |
| Settlement impact from bill revisions | `covered_with_manual_gate` | `ExpenseBillRevisionSettlementApplyPolicyTests`; settlement impact architecture docs | Accepted revisions that affect progressed settlement state still require explicit future invalidation/reopen/adjustment/refund policy. |
| Recurring bill templates, forecast reads, due-soon readouts, and explicit draft generation | `needs_runtime_followup` | `RecurringBillEndpointTests`; `RecurringBillScheduleServiceTests`; `RecurringBillSchemaFoundationTests`; recurring technical spec | Templates are configuration, not financial truth. Full create/edit UI, background generation, reminders, offline queueing, and notification handoff remain incomplete. Explicit draft generation must keep revalidating money/currency/participants/payer policy. |
| Monthly reports and report summaries | `needs_runtime_followup` | `ExpenseBillReconciliationReportingEndpointTests`; mobile monthly report starter surface described in README | Reports must derive from server-accepted records and not recalculate money in clients. More search/filter/reconciliation/report coverage remains needed. |
| OCR review intake, saved reviews, apply-preview, and explicit draft-only apply | `covered_with_manual_gate` | `RECEIPT_OCR_REVIEW_APPLY_POLICY.md`; `ReceiptOcrReviewEndpointTests`; `ReceiptOcrReviewSchemaFoundationTests` | Current apply is draft-only and bounded. Non-draft shared-bill OCR apply must route through bill revision policy and remains planned/gated. |
| Saved OCR/non-draft OCR paths | `blocked` | Receipt OCR and bill revision OCR policy docs | Non-draft shared-bill revision apply, multi-participant OCR-to-split inference, and automatic finalization are not implemented and must remain money/manual-gated. |
| Import/export, CSV import, local backup/restore, and server/local migration | `needs_runtime_followup` | Import/export architecture docs; `BillCsvImportEndpointTests` for bounded API slice; mobile local backup evidence in acceptance docs | Imports must never silently mutate financial truth. Full CSV export/import, restore apply, and local/server migration remain storage/privacy/money/manual-gated. |
| Sync/offline/local-mode data | `needs_runtime_followup` | Sync architecture docs and starter mobile queue evidence in acceptance package | Server-mode queued money edits remain pending until API acceptance. Local-only authority is local and must not silently merge into server authority. Full offline cache hydration/conflict resolution remains incomplete. |
| Currency and manual FX snapshots | `blocked` | `CURRENCY_EXCHANGE_ARCHITECTURE.md`; #352 issue readback | #352 is open. Manual bill-level FX snapshots are Day 1 scope but not covered by current runtime. Provider FX, Frankfurter, global daily rates, and silent recalculation are not Day 1. |
| Cross-currency settlement and provider FX | `not_day1` | `CURRENCY_EXCHANGE_ARCHITECTURE.md`; Day 1 decision register | Future work only unless a later reviewed task explicitly scopes it. |
| Statement reconciliation upload/matching | `not_day1` | `STATEMENT_RECONCILIATION_ARCHITECTURE.md`; Day 1 decision register defers statement upload/matching | Day 1 may include manual reconciliation status/search/report hints, but statement upload/matching is Day 2 and must not mutate expenses or settlements silently. |
| Lock periods, refunds, deposits, reimbursements, and post-lock governance | `not_day1` | `LOCK_REFUND_GOVERNANCE_ARCHITECTURE.md`; Day 1 decision register | Day 2 architecture. Refund-like bill components in Day 1 still need explicit component classification and reviewed adjustment policy. |
| Web/admin money surfaces | `planned` | README and Day 1 scope require feature-complete web/admin, but apps are placeholders | Web/admin must render API/domain truth only. No current full Day 1 web/admin money UI evidence exists. |

## Existing Automated Coverage To Trust

The following automated coverage can be trusted only for its bounded implemented slice:

- `MoneyFoundationTests`: decimal parsing, invalid formats, currency validation, supported currencies/minor units, rounding modes, bounds, and allocation behavior.
- `ExpenseBillCalculationServiceTests`: same-currency bill totals, item splits, participant share aggregation, adjustment allocation, and payer contribution validation.
- `PersonalBillEndpointTests`, `GroupBillEndpointTests`, `BillWorkflowEndpointTests`, and `BillLifecycleEndpointTests`: guarded bill endpoint and lifecycle slices.
- `ExpenseBillRevisionEndpointTests`, `ExpenseBillRevisionProposalServiceTests`, and `ExpenseBillRevisionSettlementApplyPolicyTests`: bounded revision review, approval, payer, audit, and settlement-blocking behavior.
- `SettlementCandidateDerivationServiceTests`, `SettlementRequestCreateEndpointTests`, `SettlementPaymentClaimEndpointTests`, `SettlementResidualPolicyServiceTests`, `SettlementBasketPreviewEndpointTests`, and `SettlementBalanceProjectionEndpointTests`: same-currency settlement candidate/request/payment/residual/balance slices.
- `ReceiptOcrReviewEndpointTests` and `ReceiptOcrReviewSchemaFoundationTests`: saved OCR review, apply-preview, and draft-only apply boundaries.
- `RecurringBillEndpointTests` and `RecurringBillScheduleServiceTests`: recurring template, forecast, and explicit draft generation slices.
- `ExpenseBillReconciliationReportingEndpointTests`: bounded reconciliation/reporting readouts.

Passing these tests does not prove full Day 1 money acceptance. Manual money/split/settlement review and missing-path runtime tests remain required.

## Validation Plan For Later Runtime Work

Future money runtime branches should prove the following before claiming coverage:

- `npm run validate:api-local` passes for every money/runtime branch, with focused tests added for the changed path.
- Money foundation tests continue to cover decimal parsing, bounds, fractional precision, rounding midpoint behavior, minor units, allocation residuals, currency mismatch, and unsupported currencies.
- Bill tests prove personal and group bills never rely on client-submitted authoritative totals, final shares, residual recipients, or status transitions.
- Multi-tax tests prove tax follows item allocation, grouped taxes allocate only to matching tax groups, mixed included/excluded lines are explicit, and receipt mismatches become review/error/explicit adjustment states.
- Claim-state tests prove open, unassigned, partially claimed, conflicted, and owner-review states do not become accepted financial truth until API/domain policy accepts them.
- Settlement tests prove request lines, payment allocations, residuals, proof visibility, payment confirmation, disputes, cancellations, and balance projections are server-derived and same-currency unless a reviewed FX slice says otherwise.
- Recurring tests prove generated drafts are revalidated at generation time and templates are not financial truth.
- OCR tests prove parser/review output remains provisional, draft apply is explicit and server-validated, and non-draft OCR changes route through revision policy.
- Import/export/sync tests prove imported or queued money data remains pending/provisional until API/domain acceptance and preserves conflict data.
- OpenAPI/client validation is required only when a future task changes contracts or generated clients. This audit changes neither.

## Stop Conditions

Stop the task or future branch if any of these appear:

- Authoritative totals, shares, settlements, reports, imports, or OCR apply paths use float/double or JavaScript number math as financial truth.
- An authoritative money value lacks an attached currency.
- A client, generated client, worker, OCR parser, import parser, or local/offline queue becomes the authority for accepted totals, shares, rounding, residuals, settlements, payments, reconciliation, status transitions, or audit.
- Settlement/payment state mutates outside API/domain authority.
- Residual allocation is unreviewed, nondeterministic, unaudited, or depends on display/locale/database return order.
- Cross-currency behavior silently converts or recalculates historical bills, shares, settlements, reports, or imports without a bill-level FX snapshot and audit.
- Receipt mismatch silently changes items, tax groups, discounts, refunds, payer contributions, participant shares, or settlement bases.
- Runtime money, OpenAPI, generated-client, migration/schema, UI, OCR, sync, Docker, CI, deployment, auth/security, storage/privacy, or secret changes are mixed into a docs-only audit branch.

## Issue Linkage And Closure Posture

- #396 remains open after this docs/control audit. A later reviewed PR/merge gate may decide whether the audit packet satisfies #396.
- #349 remains open while #350 and #352 are open and while other money children or manual gates remain unresolved.
- #350 remains open and blocks quantity/open-claim Day 1 money coverage.
- #351 is closed at issue readback time, but its broader runtime/UI descendants and manual money/schema/OpenAPI/Figma gates must still be respected where listed in its issue body.
- #352 remains open and blocks manual FX snapshot Day 1 runtime coverage.

No issue metadata is changed by this audit.
