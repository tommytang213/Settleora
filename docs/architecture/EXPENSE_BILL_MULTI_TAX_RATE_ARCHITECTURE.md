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

## Current implementation gap

The current expense/bill schema and calculation foundation supports generic bill adjustment rows with types such as tax, service charge, discount, manual adjustment, and credit.

That is not enough for multi-tax-rate receipts because a generic bill-level tax adjustment cannot preserve which items belong to which tax rate group, cannot allocate receipt-level tax summaries only across matching items, and cannot prove after review that a participant was charged only for the tax linked to their assigned items.

Future schema/runtime work must add first-class item tax metadata and tax-group allocation before bill tax handling is considered Day 1-complete.

## Tax authority model

Tax calculation and allocation that affects server-mode financial records is authoritative in the API/domain layer.

Clients may display previews and OCR suggestions, but clients must not be the source of truth for:

- tax rate assignment;
- taxable subtotal calculation;
- tax-included versus tax-excluded interpretation;
- participant tax allocation;
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

A bill should support tax group summaries, either as dedicated rows or as structured adjustment records with explicit group linkage:

```text
tax_group_key
tax_rate_snapshot nullable
tax_rate_label nullable
taxable_subtotal_amount
tax_amount
currency
tax_inclusion_mode
source_kind
rounding_residual_amount nullable
```

The exact table and property names can differ, but the schema must preserve enough information to reconstruct which items used which tax group and how tax was allocated.

## Allocation rules

Default rule:

```text
Tax follows the item.
```

If an item is assigned to one participant, that participant receives the item's tax allocation.

If an item is split among multiple participants, that item's tax allocation follows the same split method and rounded residual policy as the item unless the user explicitly overrides it.

If a receipt provides only grouped tax totals, such as an 8% taxable subtotal and a 10% taxable subtotal, each grouped tax total must be allocated only among items assigned to that same tax group.

A participant assigned only 8% items must not receive 10% tax allocation unless they also participate in a 10% item or an explicit manual override says so.

## OCR and review behavior

OCR should attempt to detect:

- item-level tax category or tax rate;
- receipt-level tax summaries;
- tax-included versus tax-excluded wording;
- taxable subtotals by rate;
- tax total by rate;
- uncertain or conflicting tax classification.

The review UI must let users correct tax category/rate assignments before saving or submitting a server-mode bill.

If OCR cannot determine a tax rate or category safely, the item or tax group should be marked for manual review instead of silently assuming one global tax rate.

## Rounding and residuals

Tax allocation must use decimal-safe money and centralized rounding policy.

Rounding residuals must be explicit and reproducible. The system must store or derive which participant/item/tax group received a residual minor unit where needed for audit and historical stability.

Receipt totals should reconcile through explicit item amounts, grouped tax amounts, service charges, discounts, manual adjustments, and rounding residuals. The system must not silently hide mismatches.

## Edit and approval behavior

Changing an item tax rate, tax category, tax inclusion mode, tax amount, tax group assignment, or tax-group allocation is money-impacting when it changes bill totals or participant shares.

Money-impacting tax changes must reset affected participants according to the bill revision and acceptance workflow, and must be auditable.

## Non-goals

- Direct tax filing or jurisdiction tax compliance advice.
- Automatic country-specific tax law interpretation.
- Real-time tax-rate lookup services.
- Treating one global bill tax rate as sufficient for Day 1 receipts.
- Silent reassignment of tax across unrelated items or participants.
