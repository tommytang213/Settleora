# OCR Architecture

## Purpose

Settleora requires OCR to support receipt capture and expense creation. Receipt images can become useful expense drafts only after text, amounts, merchant names, dates, currencies, and other candidate fields are extracted and reviewed.

On-device OCR is a required mobile capability. The mobile app must be able to scan and process receipts when offline, when the server is unavailable, and when a user is using a local-only profile. The server-side Python OCR worker is complementary infrastructure for heavier or later processing; it is not the only OCR path and does not replace required mobile OCR.

OCR output is still subject to validation depending on profile mode. Local-only profiles can accept OCR-derived data locally after user confirmation or editing. Server-mode profiles treat OCR-derived data from the client as provisional until the backend API validates and accepts it.

## Current Implementation Status

The API now has a narrow bill-scoped receipt OCR review intake, apply-preview, and draft-only apply foundation for existing receipt attachments, plus read-only queue/list endpoints:

- `PUT /api/v1/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/apply-preview`
- `POST /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/apply`
- `DELETE /api/v1/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/receipt-ocr-reviews`
- `PUT /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/apply-preview`
- `POST /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/apply`
- `DELETE /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/groups/{groupId}/receipt-ocr-reviews`

These endpoints store bounded user-reviewed or client/on-device OCR-derived candidate fields and lines in PostgreSQL, linked to an existing active bill receipt attachment. The review remains provisional/review-state data unless an authorized actor explicitly applies it through the draft-only apply endpoint. Intake, queue/list visibility, apply-preview success, OCR completion, and generated client availability do not automatically mutate or finalize bill data.

The apply-preview endpoints are read-only validation previews for visible bill actors. They do not require creator/owner mutation rights, do not emit OCR review read-audit events, and do not create or change bill, item, split, settlement, payment, balance, file, storage, OCR job, or worker state.

The apply endpoints are explicit user actions guarded by stricter mutation rights than preview/list/read. Day 1 apply supports only `replace_draft_ocr_items`, rebuilds server-side preview validation at write time, preserves manual items, soft-replaces OCR-applied draft items from the same review, and records source markers on applied bill item candidates. It is limited to safe draft or draft-like one-participant/compatible-payer shapes and does not infer multi-participant split policy.

Current OCR review runtime does not run OCR, enqueue worker jobs, store raw OCR full text, store receipt bytes, mutate settlement/payment/balance/proof/file/storage/OCR job/worker state, perform non-draft shared-bill revision apply, infer multi-participant splits, create thumbnails, or automatically finalize bills. Wider apply policy is tracked in [Receipt OCR review apply policy](RECEIPT_OCR_REVIEW_APPLY_POLICY.md).

## OCR Paths

### On-device OCR

On-device OCR is a required mobile capability. It is used for offline receipt processing, server-unavailable flows, and local-only profiles.

The mobile app uses on-device OCR to create draft or provisional extracted data from captured or imported receipts. Before the data becomes a final local record or a queued server-mode change, the user must be able to review and edit the extracted fields.

On-device OCR implementation choices are intentionally deferred. Future implementation should avoid bundling excessively large OCR or ML assets unless that tradeoff is explicitly approved later.

### Server-side OCR Worker

The Python OCR worker remains part of the architecture. It is used for heavier OCR, reprocessing, consistency checks, batch processing, or future higher-confidence extraction.

The worker consumes jobs and publishes OCR results or status events through approved queue and backend boundaries. It must not directly mutate core business tables, and it must not bypass backend API authority boundaries.

The server-side worker does not replace required on-device OCR. It complements mobile OCR when server infrastructure is available or when additional processing is useful.

## Authority Model

### Local-only profile

The mobile app is authoritative for a local-only profile. On-device OCR can produce locally accepted receipt or expense drafts after the user reviews, confirms, or edits the extracted fields.

No server acceptance is required for local-only records. Local persistence, local edits, and local OCR confirmation remain within the mobile app's authority boundary.

### Server-mode profile

The mobile app can perform OCR offline and queue edits while disconnected. OCR-derived data created on-device is provisional in server-mode until the backend API validates and accepts it.

The backend API is the final authority for server-mode records. It validates records before accepting them and applies sync states for queued work:

- `queued`
- `synced`
- `conflict`
- `failed`

## Offline Flow

1. User captures or imports a receipt.
2. Mobile app performs on-device OCR.
3. User reviews and edits the extracted data.
4. App saves a local draft or queued change.
5. If the profile is server-mode and the server is unavailable, the item remains queued.
6. When the server is available, the app syncs.
7. Backend validates and accepts, rejects, or marks conflicts.
8. App updates the sync state.

## Storage and Privacy Boundaries

Receipt image and file bytes must go through the storage abstraction. API responses must not expose physical filesystem paths, storage provider internals, or client-provided local paths.

File metadata belongs in PostgreSQL later. Mobile clients may cache local files for offline use, but server-mode upload and sync flows must not trust client paths as authoritative storage locations.

OCR text can contain sensitive personal and payment information. It must be treated as sensitive application data. Full OCR text and receipt contents should not be logged by default.

## Validation Boundaries

Client-side OCR extraction is a convenience in server-mode, not an authority boundary. The backend validates money, currency, rounding, ownership, permissions, and policy before accepting server-mode records.

Money must remain decimal-safe. Currency must always be attached to monetary values. Rounding policy remains centralized for authoritative server-mode decisions.

## Non-goals For Current Milestone

- No OCR package choice yet.
- No Flutter OCR implementation yet.
- No Python OCR implementation yet.
- No server OCR engine or OCR worker runtime yet.
- No standalone receipt/OCR upload outside bill attachments yet.
- No automatic OCR-to-bill finalization from OCR completion, queue visibility, preview success, apply availability, or generated client availability.
- No non-draft shared-bill OCR revision apply.
- No multi-participant OCR-to-split inference.
- No generic file, receipt, or OCR API outside bill attachments.
- No receipt thumbnail generation yet.

## Future Decisions

- On-device OCR technology choice for iOS and Android.
- Whether to use platform-native OCR APIs, Flutter plugins, or platform channels.
- Server OCR engine choice.
- Confidence scoring model.
- Receipt image retention rules.
- Local cache encryption strategy.
- Retry and reprocessing policy.
- Conflict handling UX for OCR-derived fields.
