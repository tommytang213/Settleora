# Expense Bill Multi-Tax-Rate Architecture

## Purpose

This document defines the Day 1 architecture requirement for receipts and bills where different items in the same bill use different tax rates or tax categories.

The motivating baseline is Japan-style receipts where some items may use a reduced 8% tax rate while other items use the standard 10% tax rate. The design must also support zero-rated, exempt, unknown, manually corrected, or future jurisdiction-specific tax categories without hardcoding Japan-only behavior.

## Day 1 requirement

Day 1 bill and receipt handling must support one bill containing multiple tax-rate groups.

Examples:

```text
Item 1: tax group A / reduced 8%
Item 2: tax group A / reduced 8%
Item 3: tax group A / reduced 8%
Item 4: tax group B / standard 10%
```

This is part of Day 1 financial correctness, not a Day 2 enhancement.

Day 1 must also support mixed tax-included and tax-excluded receipt lines in the same bill. Japanese receipts may show item prices as tax-included (`税込`, `税入`) on some receipts or lines, and pre-tax/tax-excluded (`税抜`, `稅前`) on others. Settleora must preserve whether each item or tax group is tax-included, tax-excluded, exempt, unknown, or manually corrected before calculating authoritative totals.

Day 1 must support discount-before-tax and discount-after-tax treatment because receipts do not consistently apply discounts at the same calculation stage. Discount tax treatment must be preserved or marked unknown/manual rather than guessed globally.

Day 1 must reconcile receipt totals from items, grouped tax amounts, discounts, service charges, refunds/returns, tax corrections, manual adjustments, and rounding residuals. A mismatch must become reviewable state or an explicit adjustment, not a silent recalculation.

## Current implementation gap

The current expense/bill schema and calculation foundation supports generic bill adjustment rows with types such as tax, service charge, discount, manual adjustment, and credit.

That is not enough for multi-tax-rate receipts because a generic bill-level tax adjustment cannot preserve which items belong to which tax rate group, cannot allocate receipt-level tax summaries only across matching items, and cannot prove after review that a participant was charged only for the tax linked to their assigned items.

The schema/runtime implementation for Day 1 must add first-class item tax metadata, tax-inclusion metadata, discount tax-treatment metadata, tax-group allocation, and receipt-total reconciliation before bill tax handling is considered Day 1-complete.

## Tax authority model

Tax calculation and allocation that affects server-mode financial records is authoritative in the API/domain layer.

Clients may display previews and OCR suggestions, but clients must not be the source of truth for:

- tax rate assignment;
- taxable subtotal calculation;
- tax-included versus tax-excluded interpretation;
- discount-before-tax versus discount-after-tax interpretation;
- participant tax allocation;
- receipt-total reconciliation;
- rounding residual assignment;
- final bill total or participant resolved shares.

OCR-derived tax data remains provisional until reviewed by the user and accepted by the API.

Authority guardrails:

- API/domain services own money, tax allocation, receipt reconciliation, bill status transitions, authorization, audit, and server-mode sync acceptance.
- Money remains decimal-safe and currency-attached through every persisted amount and API/domain calculation.
- The centralized money and rounding policy remains authoritative for tax allocation, component allocation, residual assignment, and final participant shares.
- Clients, generated clients, OCR workers, mobile OCR, and UI previews must not become authoritative sources for tax, split, rounding, settlement, payer contribution, calculation hash, or receipt mismatch truth.
- OCR suggestions may seed review candidates only. They are not accepted bill state until API/domain validation accepts them through the reviewed bill or revision path.
- Receipt-total mismatch becomes a review, error, blocked-finalization, or explicit manual-adjustment state. It must never silently mutate item totals, tax groups, discounts, refunds, payer contribution, or participant shares.
- Offline or queued edits in server mode remain pending until the API accepts them. Local previews must preserve pending/conflict/failed state rather than presenting client-computed financial truth as accepted.

## API/domain calculation policy

Future API/domain implementation must treat multi-tax calculation as a normalized server-side command, not as a client-submitted total. This branch does not add OpenAPI request or response shapes; names below are stable planning names for later runtime and contract work.

Server-authoritative calculation inputs should include:

- bill identity, bill status, expected version, active accepted revision or active pending revision basis, actor identity from the authenticated session, and group scope where applicable;
- bill currency, item currency, payer contribution currency, and any later manual FX snapshot reference when cross-currency work is explicitly in scope;
- line items with quantity, unit amount, line total, tax group linkage or explicit exempt/none state, tax rate snapshot, tax label snapshot, tax-inclusion mode, discount tax treatment, source kind, and safe OCR review line references where present;
- item split or claim basis, including equal, exact, ratio/percentage/share, quantity, open/self-claim, manual, unresolved, and allocation order metadata;
- tax group summaries with taxable subtotal, tax amount, effective total, rate snapshot, tax label snapshot, inclusion mode, discount tax treatment, source kind, review state, and policy versions;
- financial components for fees, service charges, delivery or packaging fees, discounts, coupons, credits, refund/return lines, tax corrections, tender/change lines, and manual adjustments, each with direction, scope, allocation method, contribution treatment where applicable, tax linkage where applicable, safe reason code, and safe source references;
- receipt summary fields for reviewed subtotal, tax totals by group where available, fee total, discount total, refund total, grand total, calculated total, reconciliation state, and manual adjustment reference where applicable;
- rounding inputs, including money policy version, rounding policy version, normalized allocation order, eligible residual recipients, and previous calculation hash when validating stale basis.

Server-authoritative calculation outputs should include:

- normalized item totals, taxable bases, tax components, effective item totals, split allocations, and participant share effects;
- tax group summaries, tax allocation by item/split/participant, and any explicit item-level override explanation;
- financial component allocation effects across bill, item, tax group, participant, and payer scopes;
- payer contribution validation, payer residuals, payer reconfirmation trigger category, and safe payer-side impact readouts;
- receipt reconciliation result, calculated total, mismatch amount, mismatch category, review/block state, and manual adjustment eligibility;
- deterministic rounding residual assignments with scope, recipient, amount, currency, allocation order, reason, policy versions, and calculation hash;
- stable validation outcomes and problem categories suitable for API responses and audit without making clients the authority;
- bill/revision status transition recommendations, affected participant set, payer reconfirmation requirement, settlement-impact category, and safe audit metadata.

The API/domain service must derive these outputs from normalized inputs and policy. A client may submit proposed facts, reviewed OCR candidates, or a preview request, but it must not submit final participant shares, final tax allocation, final residual recipients, final mismatch classification, final status transitions, settlement truth, or audit truth as authority.

## Stable planning names for validation and mismatch outcomes

Future runtime and OpenAPI branches should use bounded machine-readable names. The names in this section are planning names only; do not add them to OpenAPI enums in this docs/control branch.

Recommended calculation validation outcomes:

```text
calculation_valid
draft_calculation_valid_with_review_warnings
manual_review_required
blocked_until_required_tax_detail
blocked_until_receipt_reconciles
blocked_until_manual_adjustment_policy
blocked_until_affected_approval
blocked_until_payer_reconfirmation
blocked_until_settlement_policy
stale_calculation_basis
unsupported_currency_or_precision
unsupported_mixed_currency
unsupported_tax_configuration
```

Recommended receipt reconciliation states:

```text
not_provided
not_required_for_draft
matched
matched_with_rounding_residual
mismatch_requires_review
mismatch_manual_adjustment_allowed
mismatch_manual_adjustment_applied
mismatch_blocked
unsupported_receipt_shape
```

Recommended mismatch reason categories:

```text
line_sum_differs_from_receipt_subtotal
tax_group_total_differs_from_receipt_tax_total
grand_total_differs_from_calculated_total
discount_total_unallocated
fee_total_unallocated
refund_or_return_unlinked
tender_or_change_included_in_error
tax_inclusion_mode_unknown
discount_tax_treatment_unknown
manual_adjustment_required
rounding_residual_out_of_policy
currency_mismatch
ocr_or_review_source_stale
```

Recommended safe problem categories:

```text
money_validation_failed
tax_group_validation_failed
financial_component_validation_failed
receipt_reconciliation_failed
rounding_allocation_failed
manual_adjustment_not_allowed
approval_or_payer_gate_required
settlement_state_blocks_apply
stale_or_conflicting_basis
unsupported_detail_for_finalization
```

Problem responses should include a safe code, correlation ID, subject category, and bounded amount/currency or count data only where policy permits. They must not include raw request bodies, raw OCR text, receipt bytes, storage paths, object keys, signed URLs, secrets, tokens, unrelated user data, or unbounded notes.

## Receipt-total mismatch policy

Receipt-total reconciliation must be explicit. Settleora must not silently balance an unmatched receipt by changing items, tax groups, discounts, refunds, payer contributions, participant shares, or settlement bases.

Allowed outcomes are:

- leave the draft or pending revision in a review state with a mismatch amount and bounded reason category;
- block submission, confirmation, finalization, or apply when policy requires a reconciled total;
- allow an explicit manual adjustment component only when the API/domain policy permits the actor, bill state, amount bounds, reason code, audit metadata, and affected-user review path;
- reject or fail closed when the mismatch involves unsupported currency, unsupported precision, stale OCR review data, incomplete tax details, unresolved refund linkage, or progressed settlement state.

Manual adjustment is not automatic balancing. A manual adjustment must be a first-class reviewed financial component with direction, amount/currency, scope, reason code, optional bounded reason summary, affected participant and payer impact, revision snapshot preservation, audit event, and calculation hash participation.

Tender and change lines must be excluded from shared bill cost by default. Payment tender can become payer contribution metadata only through explicit reviewed policy. Change returned must not become a refund, discount, or shared participant share unless a later reviewed correction workflow explicitly converts it.

Refunds, returns, credits, coupons, points redemption, gift card payments, store credit, and tax corrections must preserve component classification and contribution treatment. If the contribution treatment changes payer obligation or participant shares, the change is money-impacting and follows revision approval and payer reconfirmation policy.

## Historical stability rules

Tax and fee calculations must remain historically stable after acceptance.

Rules:

- Tax rates, tax labels, tax category labels, tax-inclusion modes, discount tax treatment, tax group keys, fee classifications, refund/return linkages, contribution treatments, money policy versions, and rounding policy versions are snapshots on the bill or revision basis.
- Settleora must not use one global tax assumption for a bill, a merchant, a country, a user locale, a currency, or a future reference table when calculating historical shares.
- Future jurisdiction reference data may help validate new drafts, but it must not silently recalculate accepted bills, revision snapshots, settlement candidates, request lines, payments, residuals, balances, reports, or audit history.
- Bill revision snapshots must preserve tax, fee, discount, coupon, credit, refund/return, tax correction, manual adjustment, receipt summary, mismatch, and rounding residual detail when those details affect shares, payer contribution, settlement basis, review evidence, or reportable totals.
- Any tax, fee, discount, refund, manual adjustment, or receipt mismatch decision that affects participant shares, payer contribution, settlement basis, accepted calculation hash, or reportable totals is money-impacting and must use the existing revision approval and payer reconfirmation policy.

## Settlement interaction policy

Pending tax revisions are not settlement truth.

Pending or review-only tax, fee, discount, refund, receipt mismatch, manual adjustment, or rounding changes must not mutate:

- settlement candidates;
- settlement requests or request lines;
- settlement payments;
- payment allocations;
- settlement residuals;
- settlement proof attachments;
- balance projections or persisted balance caches;
- reconciliation/report truth based on active accepted bills;
- active accepted participant shares or payer contributions.

If a bill already has requested, partially paid, marked paid, confirmed, disputed, cancelled-with-history, allocation, residual, proof, balance-impact, locked, finalized, or equivalent progressed settlement state, tax-affecting apply remains blocked until a future reviewed invalidation, correction, adjustment, reopen, refund, waiver, credit, or settlement-history policy exists.

This document does not authorize settlement reopen, settlement adjustment, refund ledger, credit ledger, balance rewrite, proof relinking, or payment allocation mutation.

## Audit and redaction policy

Money-impacting multi-tax decisions require API/domain audit for both successful writes and policy-relevant denials. Required audit categories include:

- tax group creation, update, removal, manual correction, and review-state decision;
- item tax group linkage, tax-inclusion mode, discount tax treatment, and tax override decision;
- fee, service charge, discount, coupon, credit, refund/return, tax correction, tender/change exclusion, contribution treatment, and manual adjustment decision;
- receipt subtotal, tax total, grand-total reconciliation, mismatch classification, mismatch review state, manual adjustment allowance, and mismatch denial;
- rounding residual assignment, residual recipient, allocation order, policy version, and calculation hash category where non-zero or money-impacting;
- affected participant reset, payer reconfirmation requirement, revision apply block, settlement-impact block, stale-basis denial, and unsupported-detail denial.

Safe audit metadata may include actor ID, bill ID, revision ID, tax group ID, component ID, safe source file or OCR review IDs, participant or payer IDs where policy permits, operation, outcome, bounded reason category, amount/currency where policy permits, affected counts, policy versions, calculation hash category, request ID, and correlation ID.

Audit, logs, reports, examples, validation output, problem details, and snapshots must not contain raw OCR text, receipt bytes, thumbnails, storage paths, object keys, bucket names, provider internals, signed URLs, local device paths, raw request/response bodies, multipart payloads, secrets, tokens, credentials, session values, private keys, unbounded notes, unrelated sensitive profile data, unrelated user financial data, or local Codex/auth state.

## Recommended model

A bill item should preserve tax metadata where known:

```text
tax_group_id nullable
tax_group_key nullable
tax_rate_snapshot nullable
tax_rate_label nullable
tax_category_label nullable
tax_inclusion_mode
discount_tax_treatment nullable
tax_amount_snapshot nullable
tax_amount_currency nullable
tax_source_kind nullable
source_receipt_ocr_review_line_id nullable
```

Recommended `tax_inclusion_mode` values:

```text
tax_included
tax_excluded
exempt
unknown
manual
```

Recommended `discount_tax_treatment` values:

```text
before_tax
after_tax
not_discounted
unknown
manual
```

A bill should support tax group summaries, preferably as dedicated bill-scoped rows with explicit item and adjustment linkage. A structured adjustment model can be acceptable only if it preserves the same first-class linkage, constraints, and revision snapshot detail.

```text
tax_group_key
tax_rate_snapshot nullable
tax_rate_label nullable
tax_category_label nullable
taxable_subtotal_amount
taxable_subtotal_currency
tax_amount
tax_amount_currency
tax_inclusion_mode
discount_tax_treatment nullable
source_kind
rounding_residual_amount nullable
rounding_residual_currency nullable
receipt_summary_source nullable
review_state
```

The exact table and property names can differ, but the schema must preserve enough information to reconstruct which items used which tax group, whether the item amount was tax-included or tax-excluded, how discounts affected taxable subtotals, and how tax was allocated.

Tax category and tax group names are labels, not jurisdiction logic. A row may label a group as `reduced`, `standard`, `8%`, `10%`, `zero`, `exempt`, `manual`, or merchant-specific text, but the API/domain calculation must not hardcode one country, one receipt language, one rate, or one global bill assumption. Future jurisdiction-specific validation, if ever added, must be separate reference/policy input and must not recalculate existing bills silently.

## Schema and migration direction

The future implementation should be additive and versioned. It must not rewrite existing bill history, replace existing accepted calculations in place, or use a destructive migration to force every old bill into the new multi-tax shape.

Recommended table families:

```text
expense_bill_tax_groups
expense_bill_item_tax_links
expense_bill_financial_components
expense_bill_receipt_summaries
expense_bill_rounding_residuals
```

Equivalent names are acceptable, but the model must preserve these responsibilities:

- `expense_bill_tax_groups` stores bill-level tax group summaries, rate snapshots, labels, taxable subtotals, tax amounts, inclusion mode, source kind, review state, and policy versions.
- `expense_bill_item_tax_links` links each item or item-derived sub-line to the tax group used for allocation and preserves per-item overrides when a receipt line differs from the group summary.
- `expense_bill_financial_components` stores generic fee, discount, service charge, delivery fee, surcharge, coupon, credit, return/refund, tax correction, and manual adjustment rows without one hardcoded table per fee type.
- `expense_bill_receipt_summaries` stores the reviewed receipt subtotal, tax total by group where present, component totals, grand total, receipt currency, mismatch/reconciliation status, and safe source references.
- `expense_bill_rounding_residuals` stores deterministic residual metadata for item, tax group, component, participant, payer, and bill-total allocation where needed for historical reconstruction.

Recommended tax group fields:

```text
id
expense_bill_id
group_key
display_label nullable
tax_category_label nullable
tax_rate_snapshot nullable
tax_rate_precision nullable
tax_inclusion_mode
discount_tax_treatment nullable
taxable_subtotal_amount
taxable_subtotal_currency
tax_amount
tax_amount_currency
effective_total_amount
effective_total_currency
source_kind
review_state
rounding_policy_version
money_policy_version
created_at_utc
updated_at_utc
```

Recommended item tax link fields:

```text
id
expense_bill_id
expense_bill_item_id
expense_bill_tax_group_id nullable
line_scope
tax_rate_snapshot nullable
tax_category_label nullable
tax_inclusion_mode
discount_tax_treatment nullable
tax_amount_snapshot nullable
tax_amount_currency nullable
allocation_method
allocation_order
review_state
source_receipt_ocr_review_id nullable
source_receipt_ocr_review_line_id nullable
created_at_utc
updated_at_utc
```

Recommended financial component fields:

```text
id
expense_bill_id
component_type
component_subtype nullable
direction
scope
amount
currency
allocation_method
expense_bill_item_id nullable
expense_bill_tax_group_id nullable
participant_profile_id nullable
payer_profile_id nullable
tax_rate_snapshot nullable
tax_category_label nullable
tax_inclusion_mode nullable
discount_tax_treatment nullable
contribution_treatment nullable
review_state
source_kind
source_receipt_ocr_review_id nullable
source_receipt_ocr_review_line_id nullable
reason_code nullable
reason_note_summary nullable
created_at_utc
updated_at_utc
```

Recommended receipt summary fields:

```text
id
expense_bill_id
receipt_subtotal_amount nullable
receipt_subtotal_currency nullable
receipt_tax_total_amount nullable
receipt_tax_total_currency nullable
receipt_fee_total_amount nullable
receipt_fee_total_currency nullable
receipt_discount_total_amount nullable
receipt_discount_total_currency nullable
receipt_refund_total_amount nullable
receipt_refund_total_currency nullable
receipt_grand_total_amount nullable
receipt_grand_total_currency nullable
calculated_total_amount nullable
calculated_total_currency nullable
mismatch_amount nullable
mismatch_currency nullable
reconciliation_state
reconciliation_reason_code nullable
manual_adjustment_component_id nullable
source_receipt_file_id nullable
source_receipt_ocr_review_id nullable
created_at_utc
updated_at_utc
```

Recommended residual fields:

```text
id
expense_bill_id
scope
expense_bill_item_id nullable
expense_bill_tax_group_id nullable
financial_component_id nullable
participant_profile_id nullable
payer_profile_id nullable
amount
currency
allocation_order
allocation_basis
residual_reason
money_policy_version
rounding_policy_version
calculation_hash
created_at_utc
```

Nullability rules:

- Money values use amount/currency pairs. Avoid amount without currency or currency without amount.
- Tax group summary money becomes required when the group is accepted into submitted, confirmed, applied, or revision-snapshot truth.
- Nullable tax rates are valid for exempt, zero, unknown, manual, imported legacy, or provisional OCR review states, but the review state must make the incompleteness explicit.
- Tax group linkage may be nullable only for legacy rows, draft rows awaiting classification, ignored/tender/change rows, or manual-review rows. Finalized financial items that participate in tax allocation should have explicit group linkage or an explicit exempt/none state.
- Source OCR review IDs and line IDs are optional safe references. Raw OCR text and receipt bytes are never copied into these rows.

Constraint direction:

- Foreign keys should tie tax groups, item links, components, receipt summaries, and residuals to the owning bill and relevant item/component rows.
- Amount/currency pairs should use the money architecture's decimal-safe `numeric(19,4)` style unless a later schema branch proves a different precision.
- Currency constraints should match the existing uppercase three-letter policy.
- Enum-like columns should use stable machine-readable values and safe unknown/manual states rather than unbounded jurisdiction assumptions.
- A bill should not have two active tax groups with the same active `group_key` for the same snapshot/review basis unless a future revision/version table scopes them separately.
- A receipt summary should be unique for the active accepted bill basis or scoped by revision/snapshot version when revision detail rows exist.
- Residual rows should require a non-zero amount and enough scope columns to identify what allocation produced the residual.

Index direction:

- Index tax groups by `expense_bill_id`, `group_key`, and review/version status.
- Index item tax links by `expense_bill_id`, `expense_bill_item_id`, and `expense_bill_tax_group_id`.
- Index financial components by `expense_bill_id`, `component_type`, `scope`, and `expense_bill_tax_group_id` where present.
- Index receipt summaries by `expense_bill_id`, `reconciliation_state`, and safe source review/file IDs where present.
- Index residuals by `expense_bill_id`, calculation hash, and participant/payer/tax-group references where present.
- Use partial indexes for active/non-removed rows if the future lifecycle model uses soft-delete or supersession flags.

Backfill/default strategy:

- Existing bills should remain historically stable and readable.
- Existing item rows can be backfilled to `unknown` or `legacy_single_group` review states only as additive metadata, not as a recalculation of shares.
- Existing generic tax/service/discount adjustment rows may be referenced by compatibility component rows or left under a legacy calculation mode until an explicit reviewed migration maps them.
- Existing accepted calculation hashes, participant shares, settlement bases, payment allocations, residuals, proof attachments, balances, and reports must not be rewritten by the migration.
- A later implementation may add a bill-level `tax_schema_version` or calculation capability flag so old bills can continue using the legacy model until edited through a formal revision.

Destructive-operation warnings:

- Do not drop existing bill adjustment columns or tables in the first implementation slice.
- Do not convert legacy tax adjustments into new tax groups by guessing a rate or category.
- Do not infer one fixed global tax rate such as 8% or 10%.
- Do not recalculate settled, accepted, confirmed, locked, or previously reviewed bills as part of migration.
- Do not create database defaults that silently mark unknown tax treatment as taxable, included, excluded, or shared across all participants.

## Allocation rules

Default rule:

```text
Tax follows the item.
```

If an item is assigned to one participant, that participant receives the item's tax allocation.

If an item is split among multiple participants, that item's tax allocation follows the same split method and rounded residual policy as the item unless the user explicitly overrides it.

If a receipt provides only grouped tax totals, such as an 8% taxable subtotal and a 10% taxable subtotal, each grouped tax total must be allocated only among items assigned to that same tax group.

A participant assigned only 8% items must not receive 10% tax allocation unless they also participate in a 10% item or an explicit manual override says so.

## Discount and tax treatment

Discount handling is Day 1 scope when it affects tax or participant shares.

Required Day 1 behavior:

- Preserve whether a discount is item-level or bill-level.
- Preserve whether a discount applies before tax, after tax, is unknown, or was manually corrected.
- Allocate discount effects only across the affected item or explicit bill-level allocation group.
- Recalculate tax using centralized policy only after the tax-inclusion mode and discount tax treatment are known or explicitly marked manual.
- If receipt data cannot prove the discount tax treatment, require manual review instead of silently assuming one behavior for the whole receipt.

## Tax refunds and product returns

Merchant-side product returns, item refunds, tax refunds, or tax corrections linked to a bill must preserve the same tax-group relationship as the original item or tax group.

Examples:

```text
Returned 8% item -> refund/credit affects the 8% tax group.
Returned 10% item -> refund/credit affects the 10% tax group.
Partial item refund -> refund/credit is allocated through the item's split and tax group unless manually overridden.
```

Before a bill is confirmed or finalized, a returned item or corrected tax amount can be represented through bill revision, item removal, quantity/amount correction, or an explicit credit adjustment linked to the original item/tax group.

After confirmation, settlement, locked-period review, or finalization boundaries apply, refunds and tax returns must use explicit refund or adjustment workflow rather than silently rewriting history.

Government tax returns, tax filing, and tax-compliance advice remain non-goals. Settleora records and allocates tax-related bill amounts; it does not decide legal tax treatment.

## OCR and review behavior

OCR should attempt to detect:

- item-level tax category or tax rate;
- receipt-level tax summaries;
- tax-included versus tax-excluded wording, including labels such as `税込`, `税入`, `税抜`, and `稅前` where visible;
- item-level and bill-level discounts;
- discount-before-tax versus discount-after-tax indicators where visible;
- taxable subtotals by rate;
- tax total by rate;
- returned/refunded lines or negative correction lines where present on receipts;
- uncertain or conflicting tax classification.

The review UI must let users correct tax category/rate assignments, tax-inclusion mode, discount tax treatment, returned/refunded lines, and grouped tax summaries before saving or submitting a server-mode bill.

If OCR cannot determine a tax rate, tax-inclusion mode, discount tax treatment, refund linkage, or category safely, the item or tax group should be marked for manual review instead of silently assuming one global tax rate or one global tax-inclusion mode.

OCR may suggest tax groups, tax rates, tax-included/tax-excluded modes, item-to-tax-group mappings, fee rows, discount rows, refund/return rows, tax corrections, and receipt summary fields. Those suggestions must be bounded, editable, and reviewable.

Tax schema and audit rows may reference stable file IDs and OCR review IDs where the actor and subject policy allow it. They must not copy or expose:

- raw OCR full text;
- receipt file bytes or thumbnails;
- storage object keys, buckets, provider internals, signed URLs, direct filesystem paths, or local device paths;
- raw request bodies or multipart payloads;
- unbounded notes, secrets, tokens, payment details, or unrelated user data.

Source fields should therefore use safe references such as `source_receipt_file_id`, `source_receipt_ocr_review_id`, and `source_receipt_ocr_review_line_id`, plus bounded review-state and reason-code metadata. The source reference helps review and audit without turning the tax schema into receipt-content storage.

## Receipt total reconciliation

Receipt total reconciliation is Day 1 scope.

The authoritative calculation must reconcile:

```text
item amounts
+ tax group amounts where tax is excluded
+ service charges
- discounts
- refunds / returns / credits
+/- manual adjustments
+/- rounding residuals
= receipt grand total
```

For tax-included lines, the item amount already includes tax, but Settleora must still preserve or derive the tax component where the receipt provides enough information.

If the submitted or OCR-derived bill cannot reconcile to the receipt grand total, the API should reject finalization or return a reviewable validation state with stable error codes. The app may allow a draft with mismatch, but it must not silently mutate item totals, tax groups, discounts, refunds, or participant shares to make totals appear balanced.

## Rounding and residuals

Tax allocation must use decimal-safe money and centralized rounding policy.

Rounding residuals must be explicit and reproducible. The system must store or derive which participant/item/tax group received a residual minor unit where needed for audit and historical stability.

Receipt totals should reconcile through explicit item amounts, grouped tax amounts, service charges, discounts, manual adjustments, refunds/returns, tax corrections, and rounding residuals. The system must not silently hide mismatches.

The deterministic allocation order should be part of the accepted calculation basis. A future implementation should record or derive:

- allocation scope, such as item, tax group, component, participant, payer, or bill;
- ordered eligible recipients;
- allocation method and basis values;
- residual amount and currency;
- residual recipient or target row;
- money policy version, rounding policy version, and calculation hash.

Residual assignment must not depend on database row-return order, client display order, locale formatting, or OCR line order unless that order is explicitly normalized into the accepted calculation basis.

## Edit and approval behavior

Changing an item tax rate, tax category, tax inclusion mode, discount tax treatment, tax amount, tax group assignment, tax refund/return linkage, or tax-group allocation is money-impacting when it changes bill totals or participant shares.

Money-impacting tax changes must reset affected participants according to the bill revision and acceptance workflow, and must be auditable.

## Bill revision and settlement interaction

Bill revisions that affect tax or receipt reconciliation must snapshot enough detail to preserve historical shares and review evidence. The revision snapshot should include:

- tax group summaries;
- item-to-tax-group linkage and item-level tax overrides;
- tax rate snapshots, tax category labels, and tax-inclusion modes;
- fee, discount, service charge, delivery fee, surcharge, credit, return/refund, tax correction, and manual adjustment rows;
- discount tax treatment and contribution treatment where applicable;
- receipt summary totals, mismatch state, and reconciliation reason codes;
- rounding residual amounts, recipients, allocation order, money policy version, rounding policy version, and calculation hash;
- stable receipt file IDs and OCR review IDs where safe.

Tax-related changes are money-impacting when they affect participant shares, payer contribution, accepted calculation hash, settlement basis, receipt mismatch resolution, review evidence, or reportable bill totals. Those changes require the existing bill revision approval, affected-participant, payer reconfirmation, settlement-impact, stale-version, and audit policies.

Pending tax revisions are proposals only. They must not mutate:

- settlement candidates;
- settlement requests or request lines;
- settlement payments, allocations, residuals, proof attachments, or balances;
- active accepted bill shares;
- payment records;
- reports or reconciliation truth that are based on active accepted bills.

Applying a tax-affecting revision after settlement, payment, proof, residual, locked-period, or finalized history exists remains blocked until a future explicit invalidation, adjustment, reopen, refund, waiver, credit, or correction policy is designed and reviewed. This document does not authorize broad settlement reopen, refund ledger, credit ledger, or balance rewrite behavior.

## Implementation sequencing

Issue `#427` was the multi-tax schema and migration docs/control design slice. Issue `#428` is the API/domain calculation and receipt-total reconciliation docs/control design slice. Neither branch implements schema, migrations, EF model changes, DbContext changes, model snapshots, OpenAPI, generated clients, runtime calculation behavior, OCR worker behavior, UI, settlement mutation, storage behavior, Docker, CI, deployment, secrets, or auth/session/security changes.

Recommended follow-up order:

1. Schema/migration implementation slice for additive tax groups, item links, financial components, receipt summaries, and residual metadata, with constraints, indexes, backfill strategy, and migration validation.
2. API/domain calculation and reconciliation implementation after #428 review, including authority checks, receipt mismatch state, tax/fee/discount/refund allocation, calculation hashes, status transitions, problem categories, and audit.
3. OCR review/UI reference work for #429 only when the Stream B gate explicitly allows UI/reference scope.
4. Validation matrix and tests for #430, including mixed rates, included/excluded modes, discounts, refunds, residuals, receipt mismatches, OCR provisional boundaries, and revision/settlement non-mutation.
5. OpenAPI and generated-client changes only if a later contract exposure is needed, using the reviewed OpenAPI/generated-client gate and regeneration workflow.

The parent #351 remains open until the implementation, UI/reference, validation, and merge-gate work it tracks is complete.

## Validation and test expectations for #430

Issue `#430` is a docs/control planning slice only. This section names the
future validation matrix for implementation branches; it does not implement
runtime calculation, EF schema, migrations, OpenAPI, generated clients, OCR
runtime, UI, Figma/reference assets, settlement mutation, storage behavior,
Docker, CI, deployment, secrets, or auth/session/security behavior.

Future validation must prove that tax follows matching items and accepted item
splits. A participant assigned only reduced-rate items must not silently receive
standard-rate tax, a participant assigned only non-taxable items must not
silently receive taxable components, and no client, OCR worker, or generated
client may become the source of financial, authorization, settlement, or audit
truth.

### Future validation matrix

| Validation area | Required future coverage | Expected assertion |
|---|---|---|
| Mixed tax rates | Domain/API cases with one receipt containing 8% and 10% tax groups, including grouped receipt tax totals. | Each tax group allocates only to items linked to that group; unrelated participants receive no silent tax. |
| Tax-included items | Domain/API cases for item amounts where tax is included, including visible labels such as `税込` or `税入` when OCR/review data provides them. | The tax component is preserved or derived from accepted detail without increasing the item total twice. |
| Tax-excluded items | Domain/API cases for item amounts where tax is excluded, including visible labels such as `税抜` or `稅前` when OCR/review data provides them. | Tax is added only for linked taxable items and remains tied to the correct group and split. |
| Mixed inclusion modes | Same-bill cases with tax-included, tax-excluded, exempt, unknown, and manual modes. | Unknown or conflicting mode fails closed for finalization or apply until reviewed; no global included/excluded assumption is used. |
| Item-to-tax-group linkage | Item split, quantity claim, and open/self-claim cases with tax group links and explicit exempt/none state. | Tax follows accepted item ownership, quantity, or split basis with deterministic residuals. |
| Grouped tax totals | Receipt-level tax summaries by group without per-item tax amounts. | Group totals allocate only across matching linked items and never across all participants globally. |
| Before-tax discounts | Item-level and bill-level before-tax discounts across one or more groups. | Taxable subtotal is reduced only for affected items/groups before tax calculation. |
| After-tax discounts | Item-level and bill-level after-tax discounts across one or more groups. | Discount reduces accepted cost after tax without rewriting tax group totals. |
| Coupons and credits | Coupons, points redemption, gift card payment, store credit, refund credit, and unknown negative lines. | Safe defaults and editable contribution treatment are enforced; payment-like components do not silently reduce unrelated participant shares. |
| Fees and service charges | Service charge, delivery fee, packaging fee, bag fee, seat charge, surcharge, and manual fee components with taxable, non-taxable, included, excluded, exempt, and unknown treatment. | Fee tax treatment and allocation method are explicit; unknown fee tax detail requires review rather than a global fee assumption. |
| Refunds and returns | Returned/refunded 8% item, returned/refunded 10% item, partial return, refund credit, and tax correction cases. | Refunds preserve original item/tax-group/split linkage or require manual review; no unrelated group receives the correction. |
| Tender and change exclusion | Cash/card tender, gift tender, change returned, and payment metadata lines from OCR/review. | Tender and change are excluded from shared cost by default and never become refund, discount, or participant share without explicit reviewed conversion. |
| Receipt-total mismatch | Line subtotal mismatch, grouped tax mismatch, fee/discount/refund mismatch, grand-total mismatch, and stale source mismatch states. | Mismatch becomes a review/error/block state or explicit manual adjustment path; no silent receipt balancing occurs. |
| Manual adjustments | Allowed and denied manual adjustment cases with reason codes, amount bounds, scope, affected users, payer impact, and audit metadata. | Manual adjustment is a first-class reviewed component, not automatic balancing; money-impacting adjustments trigger approval and payer reconfirmation where required. |
| Deterministic residuals | Residual assignment for item, tax group, component, participant, payer, and bill total allocation. | Residual recipient, amount, currency, allocation order, policy versions, and calculation hash are reproducible and auditable. |
| Unsupported OCR tax detail | OCR missing tax rate, inclusion mode, discount treatment, refund linkage, fee taxability, or grouped totals. | OCR-derived data remains provisional; unsupported or incomplete detail fails safe into manual review or blocked finalization/apply. |
| Historical stability | Accepted bill, active revision, superseded revision, legacy bill, and future reference-data-change cases. | Tax rates, labels, inclusion modes, component treatment, residuals, and calculation hashes are snapshotted; accepted history is not silently recalculated. |
| Bill revision snapshots | Tax-affecting pending revisions and applied revisions that include item links, components, summaries, mismatch state, and residuals. | Snapshot detail is sufficient for review, approval, payer reconfirmation, audit, and settlement-impact decisions. |
| Settlement safety | Pending tax revision with eligible settlement candidate, requested settlement, partial/marked/confirmed payment, allocation, residual, proof, report, or balance projection. | Pending tax revisions are not settlement truth and do not mutate settlement candidates, requests, payments, allocations, residuals, proof attachments, balances, reports, active shares, or payer contributions. |
| Progressed settlement block | Tax-affecting apply after requested, partially paid, marked paid, confirmed, disputed, cancelled-with-history, locked, or finalized states. | Apply is blocked until a future reviewed invalidation, correction, adjustment, reopen, refund, waiver, credit, or settlement-history policy exists. |
| Authorization and privacy denial | Unrelated actor, removed group member, non-participant, unauthorized receipt file, unauthorized OCR review, and hidden bill/payment/profile contexts. | Denied, missing, deleted, unrelated, and not-visible responses avoid leaking existence, storage internals, raw OCR text, file bytes, payment details, or unrelated financial data. |
| Audit and redaction | Success and denial audit/log coverage for tax groups, item links, components, mismatch decisions, residuals, manual adjustments, revision gates, and settlement blocks. | Audit/log/problem metadata stays bounded and excludes raw OCR text, receipt bytes, thumbnails, storage paths, object keys, provider internals, signed URLs, raw bodies, secrets, tokens, unbounded notes, and unrelated sensitive content. |
| Regression guard | Existing same-currency bill, split, payer, settlement, receipt attachment, draft OCR apply-preview, and draft-only OCR apply paths. | Existing behavior remains stable unless a future scoped implementation branch explicitly changes it with tests and manual gates. |

### Future validation by change type

Validation must match the files and authority surface changed by each future
branch:

| Future change type | Required validation commands |
|---|---|
| Documentation/control only | `git status --short`; `git diff --name-only origin/main...HEAD`; `git diff --check origin/main...HEAD`; `npm run doctor:validation`; `npm run validate:docs`; `npm run validate:scaffold`. |
| API/domain calculation or bill/revision/settlement policy | Documentation/control commands plus `timeout 900s npm run validate:api-local`; add focused domain/API tests for changed calculation, authorization, settlement-safety, mismatch, and audit behavior. |
| Schema or EF migration | API/domain commands plus migration validation such as `npm run validate:api-migrations`; include additive/backfill/legacy stability checks and model snapshot review. |
| OpenAPI or generated clients | API/domain commands plus `npm run validate:openapi`, `npm run generate:clients`, and `npm run validate:clients`; generated clients must come only from generation and must not be hand-edited. |
| OCR review/mobile/web/admin UI | API/domain or OpenAPI commands as applicable plus mobile/UI validation for the touched client, including `npm run validate:mobile` for Flutter changes. UI-sensitive work remains blocked by #429 or another approved Figma/reference issue. |
| Storage/privacy/file-byte behavior | API/domain commands plus storage/privacy authorization tests proving stable file IDs, scoped access, and no storage internals or file bytes in unsafe responses/logs. |
| Audit/redaction hardening | API/domain commands plus audit/log/problem-detail redaction tests or scans for both success and denial paths. |
| Docker, CI, deployment, or release infrastructure | Only for future explicit infrastructure tasks: run the relevant Docker/CI/deployment validation profile and manual gate; this #430 docs/control task does not authorize those changes. |

OpenAPI/generated-client validation is required only when contract, generated
client, or generation-tooling files change. Migration validation is required
only when schema, EF migration, DbContext, model, model snapshot, or migration
tooling files change. Mobile/UI validation is required only for future client or
reference work. Issue `#429` remains the external OCR review UI/Figma/reference
blocker and is not completed by this matrix. Parent issue `#351` remains open
until its implementation, UI/reference, validation, and merge-gate work is
complete.

### Explicit forbidden validation outcomes

Future branches must fail validation, block review, or require a manual gate if
they introduce any of these outcomes:

- silent receipt-total balancing by mutating items, tax groups, discounts,
  refunds, fees, payer contributions, participant shares, or settlement bases;
- client-side, generated-client-side, OCR-worker-side, or UI-side financial
  authority for final tax, split, residual, mismatch, settlement, or audit truth;
- one global bill tax rate, one global tax-inclusion mode, one global discount
  tax treatment, or one global service-charge tax assumption;
- tax allocation to participants who do not own or share matching taxable items,
  unless an explicit reviewed manual override is accepted and audited;
- raw OCR text, receipt bytes, thumbnails, direct storage paths, object keys,
  bucket names, provider internals, signed URLs, raw request bodies, multipart
  payloads, secrets, tokens, credentials, session values, unbounded notes, or
  unrelated sensitive content in API responses, problem details, audit, logs,
  reports, examples, or validation output;
- mutation of settlement candidates, requests, request lines, payments,
  allocations, residuals, proof attachments, balances, reports, active accepted
  shares, or payer contributions from pending tax/revision state;
- hand-edited generated clients, unreviewed OpenAPI changes, destructive schema
  migration, settlement reopen/adjustment/refund/credit behavior, or UI/Figma
  implementation inside docs/control tasks.

## Non-goals

- Direct tax filing or jurisdiction tax compliance advice.
- Automatic country-specific tax law interpretation.
- Real-time tax-rate lookup services.
- Treating one global bill tax rate as sufficient for Day 1 receipts.
- Treating one global tax-included or tax-excluded mode as sufficient for Day 1 receipts.
- Silent reassignment of tax across unrelated items or participants.
- Silent rewriting of confirmed, settled, locked, or finalized tax/refund history.
