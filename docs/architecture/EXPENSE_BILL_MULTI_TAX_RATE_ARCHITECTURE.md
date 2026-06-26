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

Issue `#427` is a docs/control design slice only. It does not implement schema, migrations, EF model changes, DbContext changes, model snapshots, OpenAPI, generated clients, runtime calculation behavior, OCR worker behavior, UI, settlement mutation, storage behavior, Docker, CI, deployment, secrets, or auth/session/security changes.

Recommended follow-up order:

1. Schema/migration implementation slice for additive tax groups, item links, financial components, receipt summaries, and residual metadata, with constraints, indexes, backfill strategy, and migration validation.
2. API/domain calculation and reconciliation implementation for #428, including authority checks, receipt mismatch state, tax/fee/discount/refund allocation, calculation hashes, and audit.
3. OCR review/UI reference work for #429 only when the Stream B gate explicitly allows UI/reference scope.
4. Validation matrix and tests for #430, including mixed rates, included/excluded modes, discounts, refunds, residuals, receipt mismatches, OCR provisional boundaries, and revision/settlement non-mutation.
5. OpenAPI and generated-client changes only if a later contract exposure is needed, using the reviewed OpenAPI/generated-client gate and regeneration workflow.

The parent #351 remains open until the implementation, UI/reference, validation, and merge-gate work it tracks is complete.

## Required Day 1 validation cases

Day 1 implementation must include automated validation coverage for at least:

- one bill with 8% and 10% item tax groups;
- tax-included item amounts;
- tax-excluded item amounts;
- mixed tax-included and tax-excluded lines in the same bill;
- item-level discount before tax;
- item-level discount after tax;
- bill-level discount allocated across affected tax groups;
- participant assigned only reduced-rate items receiving no standard-rate tax;
- shared item tax following the item split;
- returned/refunded 8% item affecting only the 8% tax group;
- returned/refunded 10% item affecting only the 10% tax group;
- receipt total mismatch producing review/error state rather than silent correction;
- rounding residual assignment being deterministic and reproducible.

## Non-goals

- Direct tax filing or jurisdiction tax compliance advice.
- Automatic country-specific tax law interpretation.
- Real-time tax-rate lookup services.
- Treating one global bill tax rate as sufficient for Day 1 receipts.
- Treating one global tax-included or tax-excluded mode as sufficient for Day 1 receipts.
- Silent reassignment of tax across unrelated items or participants.
- Silent rewriting of confirmed, settled, locked, or finalized tax/refund history.
