# OCR Tax, Discount, Fee, And Refund UX Reference

## Status

Approved documentation/reference material for #429 OCR receipt match correction UX.

- Parent flow: `Bills > OCR review`
- Reference source name from the approved Figma/reference workflow: `OcrTaxDiscountFeeRefund_v11.tsx`
- Asset folder: `../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/`
- Current repo status: screenshot assets are present as split `part-XX` PNG exports; the TSX source file is not stored in the repo.

This document is a reference artifact only. It does not authorize Flutter, React, API, OCR engine, worker, OpenAPI, generated-client, schema, migration, database, settlement, bill calculation, storage, auth/session/security, deployment, CI, or runtime behavior changes.

## Flow Placement

This #429 reference is the complex receipt-match correction state inside `Bills > OCR review`. It extends the existing receipt OCR review flow where OCR-derived merchant, date, currency, totals, tax, fee, discount, refund, payment/change, and item lines stay provisional until the user reviews them and the relevant authority boundary accepts them.

The parent OCR review screen still owns the high-level path:

1. Capture or import a receipt.
2. Run OCR where available.
3. Review extracted receipt data.
4. Fix receipt-match issues before save/apply.
5. Preview money and share impact.
6. Save reviewed data or fall back to manual review.

Server-mode OCR-derived data remains provisional until the API validates and accepts it. Preview success, OCR completion, queue visibility, or generated-client availability must not silently mutate bill items, tax handling, discounts, refunds, participant shares, settlement amounts, payment state, or bill status.

## Screens Represented

Mobile screens:

- `OCR-429-M01` Receipt match overview
- `OCR-429-M02` Fix receipt match
- `OCR-429-M03` Taxes and charges
- `OCR-429-M04` Tax group item mapping
- `OCR-429-M05` Discounts, refunds, and payments
- `OCR-429-M06` Refund item mapping
- `OCR-429-M07` OCR line cleanup
- `OCR-429-M08` Manual review

User-web screens:

- `OCR-429-W01` Desktop receipt match overview
- `OCR-429-W02` Desktop tax group mapping
- `OCR-429-W03` Desktop refund mapping
- `OCR-429-W04` Desktop line cleanup and manual review

On desktop web, the progressive flow starts with the receipt match overview, then lets the user move into focused tax, refund, OCR line cleanup, and manual review steps. The larger layout may use side panels or split panes, but it must preserve the same provisional OCR and preview-only money authority rules as mobile.

## Screenshot Inventory

The approved prompt expected one PNG per screen. The current PR branch contains split PNG exports for long mobile and desktop frames. The links below intentionally match the actual repo filenames.

| Screen | Assets |
| --- | --- |
| `OCR-429-M01` Receipt match overview | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m01-receipt-match-overview-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m01-receipt-match-overview-part-02.png), [part 03](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m01-receipt-match-overview-part-03.png), [part 04](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m01-receipt-match-overview-part-04.png) |
| `OCR-429-M02` Fix receipt match | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m02-fix-receipt-match-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m02-fix-receipt-match-part-02.png), [part 03](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m02-fix-receipt-match-part-03.png) |
| `OCR-429-M03` Taxes and charges | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m03-taxes-and-charges-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m03-taxes-and-charges-part-02.png), [part 03](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m03-taxes-and-charges-part-03.png) |
| `OCR-429-M04` Tax group item mapping | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m04-tax-group-item-mapping-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m04-tax-group-item-mapping-part-02.png), [part 03](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m04-tax-group-item-mapping-part-03.png), [part 04](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m04-tax-group-item-mapping-part-04.png) |
| `OCR-429-M05` Discounts, refunds, and payments | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m05-discounts-refunds-payments-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m05-discounts-refunds-payments-part-02.png), [part 03](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m05-discounts-refunds-payments-part-03.png) |
| `OCR-429-M06` Refund item mapping | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m06-refund-item-mapping-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m06-refund-item-mapping-part-02.png), [part 03](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m06-refund-item-mapping-part-03.png), [part 04](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m06-refund-item-mapping-part-04.png) |
| `OCR-429-M07` OCR line cleanup | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m07-ocr-line-cleanup-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m07-ocr-line-cleanup-part-02.png), [part 03](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m07-ocr-line-cleanup-part-03.png) |
| `OCR-429-M08` Manual review | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m08-manual-review-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-m08-manual-review-part-02.png) |
| `OCR-429-W01` Desktop receipt match overview | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-w01-desktop-receipt-match-overview-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-w01-desktop-receipt-match-overview-part-02.png) |
| `OCR-429-W02` Desktop tax group mapping | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-w02-desktop-tax-group-mapping-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-w02-desktop-tax-group-mapping-part-02.png) |
| `OCR-429-W03` Desktop refund mapping | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-w03-desktop-refund-mapping-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-w03-desktop-refund-mapping-part-02.png) |
| `OCR-429-W04` Desktop line cleanup and manual review | [part 01](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-w04-desktop-line-cleanup-manual-review-part-01.png), [part 02](../../design/mobile/assets/ocr-tax-discount-fee-refund-v1/ocr-429-w04-desktop-line-cleanup-manual-review-part-02.png) |

Expected single-file names from the approved context are not present as standalone files:

- `ocr-429-m01-receipt-match-overview.png`
- `ocr-429-m02-fix-receipt-match.png`
- `ocr-429-m03-taxes-and-charges.png`
- `ocr-429-m04-tax-group-item-mapping.png`
- `ocr-429-m05-discounts-refunds-payments.png`
- `ocr-429-m06-refund-item-mapping.png`
- `ocr-429-m07-ocr-line-cleanup.png`
- `ocr-429-m08-manual-review.png`
- `ocr-429-w01-desktop-receipt-match-overview.png`
- `ocr-429-w02-desktop-tax-group-mapping.png`
- `ocr-429-w03-desktop-refund-mapping.png`
- `ocr-429-w04-desktop-line-cleanup-manual-review.png`

Do not create placeholder screenshots for these names. Future asset cleanup can either keep the split-file convention and update task prompts accordingly, or add reviewed single-frame exports in a separate reference-assets task.

## Receipt Match Correction Model

The correction model helps the user reconcile OCR candidates with the printed receipt before bill apply or submission. It should support:

- suggested tax groups and item mappings
- editable tax rates and custom tax groups
- no-tax or excluded item lines
- discount allocation review
- refund/return mapping review
- payment and change line classification
- OCR line cleanup for split, duplicate, and false lines
- preview-only money/share impact
- manual review fallback when confidence or totals are unsafe

All money examples in UI and docs must include currency, such as `HKD 446.12`. User-facing copy should avoid internal implementation terms, including calculation hash, API route, storage key, object ID, generated client, schema, migration, or worker payload.

## Tax Handling

Tax handling is suggested and editable, not automatically authoritative.

OCR may suggest tax rates and tax groups from:

- printed tax summary lines
- receipt total and subtotal relationships
- item labels such as tax-included or tax-excluded markers
- item positions near a tax subtotal, section header, or receipt footer
- merchant line patterns where reviewed safely

The UI should let the user:

- edit a suggested tax rate
- add a custom tax group
- mark individual lines as no-tax or excluded
- assign one item to a tax group with a row picker
- batch-assign selected items to a tax group
- leave uncertain tax lines unresolved and route to manual review

Tax follows the item by default after review. A participant assigned only reduced-rate items must not silently receive standard-rate tax. Receipt-total mismatch should become a visible review/error/manual adjustment state, not a silent correction to item totals, tax groups, participant shares, or bill status.

## Discounts, Refunds, And Payments

Discount allocation should be explicit. Supported reference options are:

- proportional by item subtotal as the suggested default
- equal allocation when the user selects it
- item-specific allocation
- manual allocation
- unresolved/manual fallback

Refund and return mapping should suggest a target item when receipt text, price, position, or labels make the candidate clear. The user must be able to edit the target item and choose:

- one-item mapping
- multiple-item mapping
- whole-bill fallback
- unresolved/manual fallback

Refund impact preview should show before/after values without making the preview authoritative. Use rows such as:

| Field | Example |
| --- | --- |
| Original item value | `HKD 128.00` |
| Refund amount | `HKD -28.00` |
| Resulting item value | `HKD 100.00` |
| Estimated participant/share impact | `Tony: HKD -14.00`, `Maya: HKD -14.00` |

Payment, tender, and change lines are payment evidence only. They must not be treated as bill discounts, refunds, item corrections, tax corrections, or participant-share mutations unless a future reviewed product rule explicitly creates such behavior. Examples include cash paid, card paid, gift card tender, points redemption, store credit tender, payment received, and change returned.

## OCR Line Cleanup

The correction flow should support receipt line cleanup before financial preview:

- Split combined line: turn one OCR row into multiple logical rows while preserving the original receipt source context.
- Merge duplicate lines: combine duplicate OCR candidates after user review.
- Remove false OCR lines: exclude headers, footers, repeated totals, payment evidence, advertising, loyalty text, or unreadable noise from bill item calculations.

Cleanup actions should not silently mutate applied bill data. They prepare reviewed OCR candidates for preview or later save/apply behavior under the existing authority rules.

## Preview And Manual Review

Money and share impact in this reference is preview-only. The preview may help users understand likely effects, but API/domain or local-only authority remains responsible for accepted financial truth.

Manual review fallback should be available when:

- receipt total and calculated total do not match
- tax, fee, discount, or refund lines are unresolved
- payment/change lines could be mistaken for bill adjustments
- OCR confidence is low
- one or more item mappings remain uncertain
- a stale saved review or stale preview is detected
- the bill state is unsafe for direct apply

Fallback copy should name the next safe action, such as `Review manually`, `Keep unresolved`, `Edit tax group`, `Map refund`, `Clean up lines`, or `Save for later review`.

## Product Copy Rules

Use product-facing language:

- `Review receipt match`
- `Fix receipt match`
- `Suggested tax group`
- `Edit tax rate`
- `Add tax group`
- `Mark as no tax`
- `Assign selected items`
- `Map refund`
- `Payment evidence`
- `Split line`
- `Merge duplicate`
- `Remove OCR line`
- `Preview impact`
- `Manual review needed`

Avoid implementation-facing language:

- `calculation hash`
- `API route`
- `generated client`
- `schema`
- `object ID`
- `storage key`
- `worker payload`
- `database row`

Action copy should state consequences close to the action. Disabled states should include visible reasons, not only inactive color.

## Accessibility And Readability

This flow gates money and trust decisions, so accessibility is part of the reference:

- Do not use color as the only signal for tax, discount, refund, payment, warning, or unresolved states.
- Use visible status labels such as `Suggested`, `Edited`, `Excluded`, `No tax`, `Mapped`, `Unresolved`, and `Manual review`.
- Screen readers should hear row label, money value with currency, current mapping, confidence/status, and available action.
- Preserve focus after opening item pickers, batch assignment, tax group editors, refund mapping, and cleanup actions.
- Move focus to the first unresolved issue after a failed preview or validation state.
- Keep touch targets large enough for mobile review and keep desktop controls keyboard navigable.
- Long receipt lines should wrap or truncate with accessible full text, without overlapping money values or action controls.
- Impact preview tables should keep original value, refund amount, resulting value, and participant/share impact in a stable reading order.

## Acceptance Checklist For Future Implementation

- `Bills > OCR review` remains the parent flow.
- `OCR-429-M01` through `OCR-429-M08` and `OCR-429-W01` through `OCR-429-W04` are represented.
- Desktop web preserves overview-first progressive review before focused tax, refund, OCR line, and manual review steps.
- Tax suggestions are editable and never automatically authoritative.
- Users can edit tax rates, add custom tax groups, mark no-tax/excluded lines, assign one item by row picker, and batch-assign selected items.
- Discount allocation includes proportional-by-item-subtotal suggestion plus editable alternatives.
- Refund mapping supports editable one-item, multiple-item, whole-bill, unresolved, and manual fallback states.
- Refund impact preview includes original item value, refund amount, resulting item value, and estimated participant/share impact.
- Payment and change lines stay payment evidence only.
- OCR cleanup supports split combined line, merge duplicate lines, and remove false OCR lines.
- Money/share impact remains preview-only until accepted by the relevant authority boundary.
- Manual review fallback is always available for uncertain or unsafe states.
- Product copy avoids internal implementation terms.
- Accessibility expectations are met for labels, keyboard/focus behavior, screen-reader readouts, and readable money values.
