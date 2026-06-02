# Day 1 Receipt and Bill Edge-Case Architecture

## Purpose

This document defines Day 1 requirements for common receipt and shared-bill scenarios that are easy to miss but frequent in real use.

These requirements are not polish. They protect financial correctness, receipt review usability, and fair participant allocation for ordinary restaurant, grocery, travel, convenience-store, delivery, and mixed-payment receipts.

## Scope principle

Day 1 must handle realistic receipts without forcing users to destroy the receipt shape manually.

The app may keep the first UI simple, but the API/domain model must preserve enough structure for:

- item quantity claiming;
- uploader-does-not-know ownership workflows;
- classification of coupons, points, gift cards, tenders, change, voids, free items, fees, refunds, and tax corrections;
- generic extra fee components;
- OCR line merge/split correction;
- manual exchange-rate snapshots for travel bills;
- minimal guest or temporary participants;
- reviewable mismatch handling instead of silent recalculation.

## Quantity-level item claiming

Day 1 must support item lines with quantity where participants claim or are assigned only part of the quantity.

Example:

```text
Udon x3  JPY 1,500  reduced 8%
A claims 1
B claims 2
```

Required behavior:

- Preserve receipt line quantity.
- Support claim quantity or claim share per participant.
- Allow full-line split, quantity split, fraction split, or manual amount split where needed.
- Tax follows the claimed quantity or fraction by default.
- Item-level discount follows the claimed quantity or fraction by default.
- Refunds/returns follow the claimed quantity or fraction by default.
- Rounding residual assignment remains deterministic and reviewable.

The UI may offer a practical shortcut such as splitting a receipt line into claimable units, but the data model must preserve the source receipt line relationship.

## Open claim / self-claim workflow

Day 1 must support the common case where the receipt uploader does not know who ordered or owns each item.

Required states or equivalent behavior:

```text
unassigned
open_for_claim
partially_claimed
claimed
needs_creator_review
ready_for_submission
```

Required behavior:

- Uploader can create a receipt/bill draft with unassigned or claimable items.
- Group members can claim eligible items or quantities where authorized.
- Uploader or bill owner can review unresolved or conflicting claims before submission.
- Items cannot become final financial truth until required review/acceptance policy is satisfied.
- Tax, discount, refund, and extra-fee allocation follows the accepted claim/split result.
- The API remains authoritative for claim state, authorization, and final resolved shares.

## Financial component classification

Day 1 must distinguish receipt financial components instead of treating every positive or negative OCR amount as an item or generic discount.

Recommended component categories:

```text
item
tax_summary
tax_line
service_charge
delivery_fee
packaging_fee
bag_fee
seat_charge
surcharge
discount
coupon
points_redemption
gift_card_payment
store_credit
payment_tender
change_returned
free_item
voided_line
returned_item
refund_credit
tax_correction
manual_adjustment
unknown_manual_review
```

The exact enum names may differ, but the model must preserve category, amount, currency, source OCR line, scope, tax treatment, and allocation behavior.

## System defaults and editable contribution treatment

Day 1 must have safe system defaults for common payment-like and discount-like components.

Recommended Day 1 defaults:

| Component | Default treatment |
|---|---|
| Store coupon / merchant discount | Reduces shared bill cost |
| Item-level discount | Reduces affected item cost |
| Bill-level discount | Allocated by explicit bill policy |
| Points redemption | Payment/contribution-like by default, user-editable |
| Gift card payment | Payment/contribution-like by default, user-editable |
| Store credit | Payment/contribution-like by default unless linked to refund |
| Payment tender | Payment method/contribution, not shared cost |
| Change returned | Ignored for shared cost |
| Unknown negative line | Manual review |

Users must be able to edit how a points redemption, gift card, store credit, refund credit, or other contribution-like component affects payer contribution and participant shares.

Day 3 may add smart/customizable defaults or AI-assisted suggestions based on prior user behavior, but Day 1 must not depend on Day 3 to make these components editable.

## Tender, cash, and change lines

Day 1 OCR/review must identify payment tender and change lines separately from financial bill components.

Examples:

```text
Total: JPY 2,380
Cash: JPY 3,000
Change: JPY 620
```

Required behavior:

- Payment tender does not increase the shared bill total.
- Change returned does not become a refund, discount, or participant share.
- Tender lines may support reconciliation/payment-method display later, but they must not affect bill allocation unless explicitly converted into payer contribution metadata.

## Zero, free, voided, and negative lines

Day 1 must support common receipt lines that are zero, voided, free, returned, or negative.

Required behavior:

| Line type | Behavior |
|---|---|
| Free item / zero-price item | Allow as zero amount or mark ignored while preserving source line |
| Buy-one-get-one/free promotion | Preserve item and discount/free relationship where visible |
| Voided/cancelled line | Exclude from bill total but preserve OCR source |
| Returned item | Treat as return/refund/credit linked to original item/tax group where known |
| Negative correction | Convert to explicit adjustment/refund/credit or manual review |
| Unknown negative line | Manual review required |

Ordinary positive expense items should not be confused with voids, returns, tenders, or change lines.

## Generic extra fee components

Day 1 should use a generic bill financial component or adjustment model rather than one hardcoded table per fee type.

Common examples:

```text
service charge
delivery fee
platform fee
packaging fee
bag fee
seat charge
late fee
small-order fee
surcharge
manual fee
```

Required metadata for fee-like components:

```text
component_type
component_subtype nullable
amount
currency
scope: bill / item / tax_group / participant / payer / tender
allocation_method
tax_category nullable
tax_rate_snapshot nullable
tax_inclusion_mode nullable
discount_tax_treatment nullable
source_kind
source_ocr_line_id nullable
reason_note nullable
```

Extra fees may themselves be taxable, tax-included, tax-excluded, exempt, allocated equally, allocated by item subtotal, allocated to a tax group, or manually allocated. The schema must not assume all fees behave like one global service charge.

## Combo, set meal, and bundle correction

Day 1 must support receipt lines that represent bundles or combo items.

Example:

```text
Lunch set JPY 1,200
Includes meal + drink
A claims drink
B claims meal
```

Required behavior:

- Allow a receipt line to be split into multiple logical bill items or sub-lines.
- Preserve the source OCR line relationship for audit/review.
- Allow the user to allocate amount, tax category, discount, and claim ownership across the derived sub-lines.
- Keep receipt reconciliation tied back to the original receipt line total.

## OCR line merge/split and classification correction

Day 1 OCR review must allow users to repair common OCR mistakes.

Required correction actions or equivalent behavior:

```text
merge OCR lines
split OCR line
mark as item
mark as tax summary
mark as fee
mark as discount/coupon
mark as points/gift-card/store-credit/tender
mark as change returned
mark as void/free/ignored
mark as return/refund/tax correction
link derived item to original OCR line
```

The review UI does not need to be fancy on the first pass, but the workflow must not trap users with an incorrect OCR structure they cannot fix.

## Manual FX snapshot for Day 1 travel bills

Day 1 must support at least a manual exchange-rate snapshot when a bill's original currency differs from settlement/display currency.

Provider-based exchange-rate fetching, daily rates, historical lookup, and Frankfurter integration remain Day 2+ features. Day 1 manual FX support exists so travel receipts are usable without waiting for provider automation.

Required Day 1 behavior:

```text
original_amount
original_currency
settlement_or_display_currency
manual_exchange_rate
converted_amount
rate_date
rate_source = manual
manual_rate_reason nullable
```

Rules:

- Existing bills must not be silently recalculated if a manual rate is later changed elsewhere.
- Bill-level FX snapshot is the financial truth for that bill once accepted.
- Manual rate edits are money-impacting if they change participant shares or settlement amounts.
- The app must clearly show original and converted amounts.

## Minimal guest / temporary participants

Day 1 should support minimal temporary participants for practical group bills where a person has not registered yet.

Required minimal behavior:

- Create a temporary participant with display name.
- Include temporary participant in item claims, splits, payer/contribution fields, and settlements where policy permits.
- Temporary participants cannot vote on governance or security-sensitive policy.
- Temporary participant access is limited until linked to a real account.
- Later account claim/link flow must preserve historical bill participation.

Day 2 can expand guest invite links, guest access polish, and more advanced guest governance behavior, but Day 1 should not require every participant to have a full account before a real shared receipt can be recorded.

## Required Day 1 validation cases

Day 1 implementation must include automated validation coverage for at least:

- quantity line claim: 3 units split 1/2 across two users;
- quantity line claim with tax following claimed quantity;
- open-for-claim item cannot finalize while unresolved;
- coupon reduces shared bill cost by default;
- points redemption defaults to editable payer contribution/payment-like treatment;
- gift card payment defaults to editable payer contribution/payment-like treatment;
- cash tender and change lines do not affect shared cost;
- zero/free item does not break receipt review;
- voided line is excluded from bill total;
- negative correction becomes explicit adjustment/refund/credit or manual review;
- service/delivery/bag fee carries tax treatment and allocation method;
- combo line split into derived logical items while preserving original OCR source line;
- OCR tax summary misread as item can be reclassified;
- manual FX snapshot produces stable converted participant shares;
- temporary participant can be included in a draft/shared bill without granting account-level permissions.

## Non-goals

- Full receipt parser perfection.
- Bank API or card-network integration.
- Provider-based FX automation in Day 1.
- AI-driven defaults as a Day 1 dependency.
- Requiring all participants to register before a receipt can be captured.
- Treating tender/change lines as expenses.
- Silent mutation to force receipt totals to match.
