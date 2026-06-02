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

## Recommended model

A bill item should preserve tax metadata where known:

```text
tax_rate_snapshot nullable
tax_rate_label nullable
tax_category nullable
tax_inclusion_mode
discount_tax_treatment nullable
tax_amount_snapshot nullable
tax_group_key nullable
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

A bill should support tax group summaries, either as dedicated rows or as structured adjustment records with explicit group linkage:

```text
tax_group_key
tax_rate_snapshot nullable
tax_rate_label nullable
taxable_subtotal_amount
tax_amount
currency
tax_inclusion_mode
discount_tax_treatment nullable
source_kind
rounding_residual_amount nullable
```

The exact table and property names can differ, but the schema must preserve enough information to reconstruct which items used which tax group, whether the item amount was tax-included or tax-excluded, how discounts affected taxable subtotals, and how tax was allocated.

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

## Edit and approval behavior

Changing an item tax rate, tax category, tax inclusion mode, discount tax treatment, tax amount, tax group assignment, tax refund/return linkage, or tax-group allocation is money-impacting when it changes bill totals or participant shares.

Money-impacting tax changes must reset affected participants according to the bill revision and acceptance workflow, and must be auditable.

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
