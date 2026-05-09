# Receipt OCR Functional Spec

## Purpose

Define user-facing receipt capture, OCR review, correction, and expense/bill draft behavior.

## User goals

Users should be able to:

- capture or import a receipt
- run OCR locally where supported
- review detected merchant/date/currency/items/totals
- correct OCR mistakes before saving
- create a personal expense or shared bill from reviewed OCR data
- keep receipt images private and authorized

## Primary flow

1. User selects receipt/OCR entry mode.
2. User captures or imports a receipt image/file.
3. App runs on-device OCR where available.
4. App shows extracted fields and item lines for review.
5. User edits, deletes, or adds lines.
6. User assigns items to self/group/participants where applicable.
7. User saves as expense/bill draft or submits for confirmation.
8. Server-mode OCR-derived data remains provisional until API validation accepts it.

## OCR targets

OCR should attempt to detect:

- merchant
- date/time
- currency
- item names
- quantity
- unit price
- line totals
- subtotal
- discount
- tax
- service charge
- grand total

## Review behavior

- Users must be able to edit every OCR-derived value before save.
- Low-confidence fields should be visibly marked.
- Unbalanced totals should be flagged.
- Duplicate-looking receipts/expenses should show warnings.
- Users can continue with manual entry if OCR fails.

## UI surfaces

- receipt capture/import screen
- OCR processing state
- OCR review screen
- item correction editor
- bill/expense draft preview
- duplicate warning dialog
- attachment viewer

## Privacy expectations

- Receipt images and OCR text are sensitive.
- Local-only mode keeps OCR and accepted records local.
- Server-mode upload/sync uses API authorization and storage abstraction.
- Full OCR text should not appear in logs or unnecessary exports by default.

## Acceptance criteria

- User can capture/import a receipt.
- OCR results are editable before save.
- User can fall back to manual entry.
- Receipt image access is authorized.
- OCR-derived server-mode data is validated before becoming authoritative.
- Duplicate and mismatch warnings are visible but not blocking unless policy requires.

## Non-goals

- Perfect OCR accuracy.
- Universal receipt/PDF parser.
- Server OCR as the only OCR path.
- AI-driven correction without user/backend validation.
