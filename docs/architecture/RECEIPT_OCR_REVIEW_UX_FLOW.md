# Receipt OCR Review UX Flow

## Purpose

This document defines the Day 1 mobile-first UX gate for receipt capture, OCR review, apply-preview, and explicit draft bill apply. It remains the UX reference for separately scoped implementation slices and does not authorize backend, OpenAPI, schema, OCR engine, worker, sync, or file-runtime changes by itself.

The UX must present receipt OCR data as provisional until the relevant authority boundary accepts it. Local-only profiles can accept local OCR edits locally. Server-mode profiles must treat review data, previews, offline edits, and queued actions as provisional until the API validates and accepts them.

## Current Backend State

The current backend already includes:

- Purpose-specific bill attachment file runtime for receipt and supporting attachments.
- Bill-scoped receipt OCR review intake, read, and delete for existing active receipt attachments.
- Read-only receipt OCR review queue/list endpoints.
- Non-mutating apply-preview endpoints.
- Explicit draft-only apply endpoints for `replace_draft_ocr_items`.

The current backend does not include:

- OCR engine implementation.
- Python OCR worker runtime behavior.
- Mobile OCR extraction UI or web OCR review UI.
- Automatic OCR-to-bill finalization.
- Non-draft shared-bill OCR revision apply.
- Multi-participant OCR-to-split inference.
- Receipt thumbnails.
- Generic public file, receipt, or OCR APIs outside purpose-specific bill attachment routes.

Apply-preview success, queue visibility, generated client availability, OCR completion, or an enabled button must never imply that bill data has been mutated or finalized.

## Current Mobile State

The current mobile app includes a generated-client-backed receipt OCR review queue/detail foundation for visible saved reviews, explicit apply-preview/apply controls, and a saved-review edit foundation for existing receipt attachment OCR reviews. The edit foundation can update bounded review/header and line candidate fields, cancel local edits, and remove a saved review only after confirmation.

The mobile app still does not capture or upload receipts, run OCR extraction, issue login sessions, persist tokens, queue offline sync, store receipt bytes, or automatically apply OCR data to bill drafts after save.

## Primary Mobile Flow

The Day 1 mobile flow should be:

1. The user creates or opens a draft bill.
2. The user captures a receipt photo or imports a receipt file.
3. The app attaches the receipt through the purpose-specific bill attachment runtime.
4. When on-device OCR exists, the app runs OCR locally where available, including offline and local-only flows.
5. The app presents extracted merchant, receipt date, currency, header totals, and line candidates for review.
6. The user edits incorrect fields and lines before saving a provisional OCR review.
7. The app saves the review through the generated client for the bill attachment OCR review endpoint.
8. The user asks for an apply preview.
9. The API returns a read-only preview with proposed line results, warnings, and block reasons.
10. If eligible, the user explicitly applies the saved review to the draft bill using `replace_draft_ocr_items`.
11. If OCR fails, validation blocks apply, or the bill is no longer eligible, the app keeps the user in manual entry or routed correction flow instead of forcing OCR.

The review screen should make manual correction first-class. OCR is an assistant for entry speed, not a silent financial authority.

## Review Screen Contract

The mobile review experience should support:

- Merchant review and correction.
- Receipt date review and correction.
- Currency review and correction.
- Header total review.
- Line description, quantity, amount, currency, and ordering review.
- Clear distinction between saved provisional review data and applied draft bill items.
- A preview step before mutation.
- An explicit confirmation step before draft apply.
- A manual-entry fallback that remains available from every blocked state.

The UI must not ask the user to submit authoritative bill item IDs, preview totals, split allocations, settlement data, actor identity, group membership, file metadata, storage metadata, or route ownership as authority for apply. The API revalidates the saved review at write time.

## Server Mode And Local Mode

Local-only profiles:

- The local app is authoritative for local-only records.
- On-device OCR can support local draft creation after user review.
- Local persistence, conflict handling, and receipt cache behavior remain mobile-specific implementation details for later design.

Server-mode profiles:

- OCR-derived data is provisional until accepted by the API.
- Offline review saves or apply intents should be queued later as pending work, not treated as effective for other users.
- Queued server-mode work should surface sync states such as `queued`, `synced`, `conflict`, and `failed` when sync runtime exists.
- The app must not invent server acceptance, participant visibility, or bill mutation while offline.

This document does not define sync runtime, local cache encryption, retry mechanics, or conflict resolution UI. Those remain future implementation gates.

## Permission And Visibility UX

The UX must reflect that visibility and mutation are different permissions:

- Visible bill participants may view saved reviews and apply previews where the API permits.
- Mutating or applying OCR review data requires stricter creator, owner, or responsible-editor rights.
- Group bills require active membership and route-group authorization.
- Possessing a bill ID, group ID, file ID, generated client method, cached membership row, or hidden UI route is not authorization.
- Hidden buttons are only presentation. Clients must handle denied responses and must not infer authorization from the absence or presence of controls.

For group bills, the mobile UI should prefer route-scoped actions that match the generated group bill attachment and OCR review client methods. It should not create a standalone OCR route model that bypasses group authorization.

## Empty, Error, And Blocked States

The UI must include explicit states for:

- No receipt attached yet.
- Unsupported file type or rejected content.
- Attachment unavailable, removed, deleted, quarantined, or no longer visible.
- Missing OCR review for an attachment.
- Stale saved review timestamp or preview based on an older review version.
- Unsupported currency.
- Header currency and line currency mismatch.
- Header total, line total, or line sum mismatch.
- Empty OCR line set.
- Unsafe bill state for direct draft apply.
- Existing downstream settlement, payment, allocation, residual, proof, or balance dependencies.
- Multi-participant or split inference blocked.
- Non-draft shared bill apply blocked or routed to future revision policy.
- Server unavailable, queued, conflict, and failed sync states when server-mode offline support exists.

Blocked states should explain the next safe action: edit review fields, refresh the review, use manual entry, remove and reattach a receipt, ask an authorized editor to apply, or wait for a future revision workflow where applicable.

## Privacy And Security UX

Receipts and OCR data are sensitive application data. UI and API display must avoid:

- Direct storage paths.
- Provider object keys.
- Provider URLs or signed URLs.
- Raw OCR full text in audit or log displays.
- Receipt bytes outside authorized content routes.
- Unbounded filenames.
- Payment details.
- Auth/session data.
- Unrelated user identifiers or profiles.
- Raw audit metadata or request bodies.

Attachment metadata should stay safe and bounded. Original filename, if ever displayed, is display-only and must not drive authorization, object keys, paths, routing, policy, or audit meaning.

Local receipt cache encryption, secure deletion, thumbnail generation, and private-vault mobile behavior remain future mobile-specific design topics. They must not move money, authorization, bill state, settlement state, audit, or server-mode validation authority into clients.

## Later Implementation Constraints

Future mobile or web implementation must:

- Use generated clients rather than hand-written endpoint assumptions.
- Treat OpenAPI as the transport source of truth.
- Keep backend services authoritative for money, authorization, status transitions, and apply eligibility.
- Show previews as previews, not authoritative bill truth.
- Avoid client-side authoritative calculations for bill totals, split allocations, settlement balances, or apply eligibility.
- Keep on-device OCR as a required mobile capability.
- Treat the server OCR worker as complementary infrastructure, not the only OCR path.
- Include denied, empty, stale, error, and blocked-state tests where applicable.
- Avoid introducing generic file, receipt, or OCR APIs to support this flow.

Any future UI branch that needs new endpoints, schema, generated clients, OCR engine behavior, worker behavior, sync behavior, thumbnails, non-draft revision apply, or settlement-impact policy should stop and create a separate reviewed design or implementation slice.

## Non-goals

This UX gate does not implement or authorize:

- Runtime code.
- OpenAPI path or schema changes.
- Generated client changes.
- EF migrations or schema changes.
- Mobile, web, or admin UI implementation.
- OCR engine or worker implementation.
- Notification behavior.
- Automatic finalization.
- Multi-participant split inference.
- Non-draft shared bill revision apply.
- Generic public file, receipt, or OCR APIs.
- Thumbnail generation.
