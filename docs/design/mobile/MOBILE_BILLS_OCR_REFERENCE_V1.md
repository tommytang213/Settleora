# Mobile Bills And OCR Reference V1

## 1. Reference Status

The Bills/OCR design slice is approved as the V1 reference with implementation notes. It extends the approved mobile shell and the `Settleora Midnight` reference style.

External visual reference:

https://www.figma.com/make/GhwORBnM4Y3YISs9CsobRy/High-Fidelity-Mobile-UI-Design?p=f&t=sW5ANl6oatYfwQBi-0

Screenshots and exports should be manually saved under `docs/design/mobile/assets/` when approved. This document does not authorize Figma scraping, generated code import, OpenAPI changes, generated-client changes, or runtime behavior changes.

## 2. Approved Bills Navigation/List Direction

The Bills tab uses the active bottom-nav state. The list direction includes search plus filters/chips. Example filters:

- `All`
- `Needs review`
- `Drafts`
- `Recurring`
- `Archived`

Bill ledger cards show merchant/name, amount plus ISO currency, date, group/person context, status chips, receipt/OCR indicators, and a clear tappable affordance.

## 3. Add Bill Entry Paths

The approved add sheet includes:

- Scan receipt
- Add quick bill
- Add itemized bill
- Add group bill
- Add recurring bill
- Import receipt/file

## 4. Receipt Capture And OCR Flow

Approved flow:

1. Capture or import a receipt.
2. Run on-device OCR first.
3. Show processing, queued, and error states where applicable.
4. Provide retry, enter manually, and save draft fallbacks.
5. Require OCR review before saving.
6. Treat OCR-derived server-mode data as provisional until API validation.
7. Use product-facing copy only.

OCR completion, queue state, preview success, or generated-client availability must not automatically finalize a bill or make OCR data authoritative in server mode.

## 5. OCR Review Fields

Editable OCR review fields:

- Merchant
- Date
- Currency
- Grand total
- Subtotal
- Tax
- Service charge
- Discount
- Category
- Optional payment method
- Notes
- Line items

Line item fields:

- Item name
- Quantity
- Unit price
- Line total
- Currency
- Assignment
- Status/confidence
- Edit/review affordance

Review states:

- Total mismatch
- Unknown line
- Low confidence
- Missing currency
- Duplicate receipt warning

## 6. Manual Bill Model

Manual bill supports `Quick total` and `Itemized`.

Quick total is the simple path, but if `Shared` or `Group` is selected it must still show complete split details. Itemized mode supports per-item entry and assignment.

Quick total `Personal` fields:

- Merchant/name
- Total amount
- Currency
- Date
- Category
- Optional payment method
- Optional receipt
- Notes

Quick total `Shared` fields:

- Shared with
- Searchable participant selector
- Selected participants as chips
- Paid by selector
- Split method
- Split preview
- Save draft/save bill

Quick total `Group` fields:

- Group selector
- Participants / Everyone in group shortcut
- Customize participants
- Paid by selector
- Split method
- Split preview
- Save draft/save bill

## 7. Itemized Manual Bill

Itemized manual bill supports:

- Item list
- Add item
- Edit item
- Tax, service, discount, and manual adjustment
- Total summary
- Mismatch review
- Save draft/save bill

## 8. Line Item Assignment/Split

Add/Edit Item must not rely only on quick chips. It must include `Search / add people` using the shared searchable user/group selector.

Assignment language and behavior:

- Rename assignment `All` to `Everyone in group`.
- Single item assignment uses a searchable multi-select person/group selector.
- Bulk selected item assignment uses the same selector.
- Split methods are `Single person`, `Equal split`, `Custom amount`, and `Percentage / share`.
- Show a split preview where possible.
- Button copy should use `Apply assignment`, `Assign selected items`, or `Assign N items`.
- Avoid misleading copy such as `Assign N people` when the action applies to selected items.

## 9. Bulk Item Assignment

Line item lists expose a visible `Select items` entry.

Interaction rules:

- Tap row edits/reviews one item.
- Tap `Select items` enters multi-select mode.
- Select mode shows checkboxes, selected count, selected total, Cancel/Done, and a bulk action bar.
- Bulk primary actions are `Assign`, `Split`, and `More`.
- `More` contains secondary actions such as Category, Mark reviewed, Clear assignment, and Clear selection.
- Quick selection menu includes Select all, Select unassigned, Select needs review, Select low confidence, Select same category, and Clear selection.
- Bulk action bar must not cover content or bottom nav.

## 10. Shared Components Captured By Bills/OCR

Bills/OCR captures or exercises these shared components:

- Searchable user/group selector
- Selected person chips
- Line item row
- Selectable line item row
- Bulk action bar
- Quick selection menu
- Split method selector
- Split preview card/row
- Money input
- Currency selector
- Date picker
- Status chips
- Warning/mismatch card
- Receipt/OCR chips
- Empty/loading/error states

## 11. Implementation Acceptance Notes

- Do not hand-edit generated clients.
- UI implementation must use shared components and semantic design tokens.
- Backend/API remains authoritative for authorization, money, status transitions, audit, storage access, and sync acceptance.
- All file, receipt, and proof bytes go through the storage abstraction.
- UI must not expose storage internals.
- Bottom nav and sticky action bars need safe scroll padding.
- The design must support small, medium, and large phones.

This reference does not permit silent changes to OpenAPI, generated clients, backend/API behavior, schema/migrations, auth/session/security, storage/file-byte behavior, settlement/payment/bill calculation authority, deployment, CI, or secrets.
