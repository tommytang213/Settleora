# Receipt OCR Technical Spec

## Purpose

Define implementation boundaries for receipt OCR, file storage, provisional OCR data, validation, and worker interaction.

## Architecture boundaries

- On-device OCR is required for mobile/local-only flows.
- Server OCR worker is complementary and must not directly mutate core business tables.
- API validates OCR-derived server-mode data before accepting it.
- File bytes go through storage abstraction.
- File metadata belongs in PostgreSQL.
- Raw OCR text and receipt contents are sensitive.

## Domain concepts

Suggested domain areas:

```text
ReceiptFiles
OcrExtractionDrafts
OcrLineItems
OcrReviewState
OcrJobs
OcrResults
```

Suggested service boundaries:

```text
IReceiptStorageService
IOcrDraftService
IOcrValidationService
IOcrJobPublisher
IOcrResultIngestionService
```

## Client responsibilities

- Capture/import receipt.
- Run on-device OCR where available.
- Present review UI.
- Queue provisional OCR-derived changes while offline.
- Preserve pending local edits until server sync resolves.

## API responsibilities

- Authorize upload/read/download.
- Store file metadata.
- Validate OCR-derived fields before creating/updating server-mode records.
- Publish server OCR jobs where appropriate.
- Ingest worker results safely.
- Avoid exposing storage paths.

## Worker responsibilities

- Consume OCR jobs.
- Process files through approved storage access path or job payload rules.
- Publish result/failure event.
- Acknowledge jobs only after result/failure publication.
- Remain idempotent and safe to retry.
- Never directly mutate core business tables.

## Persistence direction

Future tables may include:

```text
receipt_files
ocr_extraction_drafts
ocr_extraction_lines
ocr_jobs
ocr_result_events
```

OCR-derived money fields must preserve decimal-safe values and currency.

### Saved review tax reconciliation

For an existing bill attachment, the saved OCR review may carry an optional `taxReconciliationMode`: `add_to_base`, `already_in_base`, or `unresolved`. It relates the printed same-currency tax component to the printed subtotal, or to the complete reviewed item sum when no subtotal exists. It does not classify each bill item or replace bill tax-group allocation. A null legacy mode retains additive review arithmetic. An unresolved mode blocks draft Apply.

The API uses one decimal, currency-checked reconciliation result for preview, summary, and write-time Apply. Older clients that omit or send null for the mode preserve an existing explicit mode only when currency, header money, and ordered line values are unchanged; material edits become unresolved rather than silently additive. Equivalent retries must not duplicate a review or expense or double-charge tax. The existing upsert may recreate line IDs and update timestamps; stale Apply still uses the saved review timestamp. The on-device parser may propose a supported mode from printed evidence, but the API owns money checks. Ambiguous inclusion and mixed item-tax allocation remain review work; this slice adds no new selection control.

## API direction

Future endpoints may include:

```text
POST /api/v1/receipts
GET /api/v1/receipts/{id}
GET /api/v1/receipts/{id}/content
POST /api/v1/receipts/{id}/ocr-jobs
GET /api/v1/ocr-drafts/{id}
PATCH /api/v1/ocr-drafts/{id}
POST /api/v1/ocr-drafts/{id}/accept
```

OpenAPI must be updated before generated clients.

## Authorization rules

- Only authorized owners/participants can access receipt files.
- Server OCR results cannot be accepted without validating actor/record access.
- Shared receipt visibility follows bill/expense sharing policy.
- Local-only receipt paths must not be trusted as server storage locations.

## Audit requirements

Audit events should cover:

- receipt uploaded
- receipt viewed/downloaded where policy requires
- OCR job queued/completed/failed
- OCR draft accepted/rejected/edited
- receipt attached/detached from bill/expense
- denied receipt access

Audit must avoid full OCR text and sensitive file contents.

## Validation and tests

Required test categories:

- upload requires authorization
- file response exposes stable ID, not path
- unauthorized read/download denied
- OCR draft remains provisional until accepted
- worker result cannot mutate business tables directly
- invalid money/currency rejected
- failed OCR can fall back to manual entry

Validation commands for implementation branches:

```powershell
dotnet tool restore
dotnet restore
dotnet build
dotnet test
npm run validate:openapi
npm run validate:api
```

## Failure modes

Handle:

- OCR engine failure
- unreadable receipt
- storage upload failure
- duplicate job delivery
- worker timeout
- stale OCR draft
- partial extraction
- mismatch between line totals and grand total

## Non-goals

- Choosing final OCR package in this document.
- Full universal PDF statement parsing.
- AI-only OCR correction.
- Worker-owned business writes.
