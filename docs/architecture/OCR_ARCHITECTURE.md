# OCR Architecture

## Approved provider and execution architecture (2026-09-18)

Tommy approved PaddleOCR as Settleora's canonical OCR model family for the
mobile, desktop, and self-hosted server directions. This decision supersedes
the earlier deferred-provider and ML Kit-first language in this document and
in `MOBILE_OCR_IMPLEMENTATION_DECISION.md`.

- Mobile and desktop use PP-OCRv6 Small as the preferred common-script fast
  path where corpus evidence proves support. The self-hosted server may use
  PP-OCRv6 Medium where its higher cost is justified.
- PP-OCRv5 mobile multilingual/script recognizers supply required scripts that
  PP-OCRv6 does not adequately cover. The current upstream catalog includes
  dedicated Thai, Arabic, Cyrillic, Devanagari, Tamil, and Telugu recognizers,
  plus Korean and broad Latin models. The exact Settleora inventory is pinned
  only after compatibility and acceptance evidence; upstream marketing or a
  language-list entry is not acceptance evidence.
- ONNX Runtime is the preferred cross-platform inference layer. CPU is the
  correctness baseline and must remain viable. XNNPACK, Core ML, NNAPI, QNN,
  CUDA, TensorRT, or OpenVINO may be used only when results remain acceptance
  equivalent. A component that cannot run correctly through ONNX Runtime may
  use the smallest compatible runtime adapter behind the same provider/model
  contract without changing the PaddleOCR family decision.
- Recognition emits text, geometry, confidence, script/model identity, and
  available orientation/order metadata. Paddle-specific types stop at the
  provider boundary. Settleora parsing independently derives merchant, date,
  currency and its provenance, items, quantities, unit prices, totals, tax,
  service, and discounts. OCR never becomes financial authority.

Official PaddleOCR deployment references currently provide both an Android
ONNX Runtime SDK/demo and an iOS Swift/ONNX Runtime demo for PP-OCRv6 Small,
PP-OCRv6 Tiny, and PP-OCRv5 Mobile. Their sample requirements and versions are
feasibility inputs, not Settleora dependency pins. Settleora model packages
must record their own source URL, immutable version, hash, license, runtime
format, preprocessing version, parser version, and acceptance evidence.

## Global Core and Extended model packs

`Global Core` is functionally available by default in a normal Settleora
installation. Users do not choose a model before scanning a common-language
receipt. Implementations may keep recognizers unloaded until routed and may
package the default inventory as install-time components, but first-use
offline scanning cannot depend on an unannounced network download.

The target Global Core families are broad Latin (including English, Spanish,
Portuguese, French, German, Italian, Dutch, Polish, Turkish, Vietnamese, and
Indonesian/Malay), Simplified and Traditional Chinese, Japanese, Korean,
Arabic-script coverage including proven Persian/Urdu variants, Devanagari,
Bengali, Thai, Cyrillic, and major South Asian scripts including Tamil and
Telugu when their selected packs pass Settleora acceptance. A family enters
the shipped inventory only after exact model/runtime and deterministic fixture
evidence is recorded. The #1247 corpus is mandatory and immutable; focused
additional fixtures are required for newly claimed Global Core families that
it does not represent.

Long-tail languages use optional `Extended` packs. Packs are individually
installable where practical and support Download all. Every pack is
version-pinned, integrity-verified, offline after installation, rollbackable,
and carries compatibility, source, license, and acceptance metadata. No silent
upgrade may change accepted OCR behavior.

Mixed-script receipts are required. Routing uses always-available image,
script, text, and confidence evidence; it must not need the missing recognizer
to decide which recognizer is required. Phone or user locale is not model
truth, one document is not assumed to have one language, and one weak token
must not decide currency or script.

## Client and server execution boundary

Mobile and desktop model management is local to each device. Server/Admin
model management controls only self-hosted server OCR models. Admin cannot
remotely install or remove client packs. A server may mirror verified packages
for clients, but each client chooses whether to install or remove its optional
packs. Managed-device/MDM control is not Day 1.

The approved default direction is `Enhanced OCR`:

```text
receipt image
  -> client OCR immediately (offline, low latency, provisional)
  -> server enhanced OCR concurrently when enabled/reachable/authorized
```

Suggestion precedence is:

```text
user-reviewed or edited value
  > validated server OCR suggestion
  > client OCR suggestion
  > no suggestion
```

A late server result never overwrites a reviewed/edited field. Server
unavailability, timeout, failure, or missing model never blocks the client
result. Meaningful conflicts remain reviewable. `Local-first` runs server OCR
only for low confidence, an unsupported script, or explicit Improve scan;
`Client-only` disables server enhancement. Receipt upload still follows
existing authorization, privacy, and file rules.

Server implementation is separately owned from #1247. Its model registry must
support Global Core plus optional packs, selected/all download and update,
optional-pack deletion, pins, sizes/status/versions, safe usage information,
storage budgets, and retention. On-demand acquisition uses a stable
`modelPackId + modelVersion + runtimeFormat` lock, trusted manifest,
hash/signature and compatibility verification, atomic activation, bounded
retry, job resume, and rollback. Global Core, pinned, active-job, or
not-provably-safe packs cannot be evicted. Removing a pack removes model bytes
only, never receipts, images, parsed results, bill/review/audit history, or
other product records.

## Model supply-chain and privacy contract

OCR artifacts are a supply-chain surface. Each artifact requires a pinned
identity/version, trusted source, checksum, signature where supported, license
metadata, dependency/SBOM scanning where applicable, atomic activation and
rollback, and reproducible evidence tied to model, runtime, preprocessing, and
parser versions. Model-provider telemetry is disabled by default. Routine
logs contain no raw receipt image or text; only bounded operational metadata is
allowed.

## Purpose

Settleora requires OCR to support receipt capture and expense creation. Receipt images can become useful expense drafts only after text, amounts, merchant names, dates, currencies, and other candidate fields are extracted and reviewed.

On-device OCR is a required mobile capability. The mobile app must be able to scan and process receipts when offline, when the server is unavailable, and when a user is using a local-only profile. The server-side Python OCR worker is complementary infrastructure for heavier or later processing; it is not the only OCR path and does not replace required mobile OCR.

OCR output is never final financial truth. OCR creates candidate/review data only. Users must be able to review and edit extracted fields before OCR-derived data becomes a final local record or queued server-mode change. Server-mode profiles treat OCR-derived data from the client as provisional until the backend API validates and accepts it.

In server mode, user-reviewed OCR-derived data remains provisional until API/domain validation accepts money, currency, ownership, authorization, file purpose, storage policy, split/adjustment/payer policy, duplicate/conflict policy, and rounding. Preview success, queue visibility, OCR completion, assignment state, generated-client availability, or worker output must not automatically finalize bills.

The intended flow is:

```text
capture/import -> OCR candidate extraction -> user review/edit -> apply preview -> explicit apply -> API/domain validation -> accepted bill state
```

OCR may assist extraction, but it must not be treated as inferring receipt meaning better than the user's reviewed choices and the API/domain validation result.

## Current Implementation Status

The API now has a narrow bill-scoped receipt OCR review intake, apply-preview, and draft-only apply foundation for existing receipt attachments, plus read-only queue/list endpoints:

- `PUT /api/v1/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/apply-preview`
- `POST /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/apply`
- `PUT /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/assignment`
- `GET /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/assignment`
- `POST /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/assignment/complete`
- `POST /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/assignment/cancel`
- `DELETE /api/v1/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/receipt-ocr-reviews`
- `PUT /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/apply-preview`
- `POST /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/apply`
- `PUT /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/assignment`
- `GET /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/assignment`
- `POST /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/assignment/complete`
- `POST /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/assignment/cancel`
- `DELETE /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review`
- `GET /api/v1/groups/{groupId}/receipt-ocr-reviews`

These endpoints store bounded user-reviewed or client/on-device OCR-derived candidate fields and lines in PostgreSQL, linked to an existing active bill receipt attachment. The review remains provisional/review-state data unless an authorized actor explicitly applies it through the draft-only apply endpoint. Intake, queue/list visibility, apply-preview success, OCR completion, and generated client availability do not automatically mutate or finalize bill data.

The assignment endpoints persist explicit API-owned needs-review assignment/source state for a saved review. The API revalidates actor mutation rights, assigned-recipient access to the bill, receipt attachment metadata, and saved review before writing. Assignment creation is idempotent for the same active review/responsible editor, retargeting supersedes the prior active assignment, and completion/cancellation mutate assignment state only. Creating a new active assignment or retargeting to a different authorized recipient writes one safe unread `ocr.needs_review` in-app notification to the assigned profile, with actor self-notifications suppressed by default. Assignment completion/cancellation, duplicate same-recipient assignment, self-assignment, plain OCR review save/read/list/apply-preview/apply/remove, and assignment visibility do not create OCR notifications or mutate bill, item, split, settlement, payment, balance, file, storage, sync, notification read/archive, OCR job, or worker state.

The apply-preview endpoints are read-only validation previews for visible bill actors. They do not require creator/owner mutation rights, do not emit OCR review read-audit events, and do not create or change bill, item, split, settlement, payment, balance, file, storage, OCR job, or worker state.

The apply endpoints are explicit user actions guarded by stricter mutation rights than preview/list/read. Day 1 apply supports only `replace_draft_ocr_items`, rebuilds server-side preview validation at write time, preserves manual items, soft-replaces OCR-applied draft items from the same review, and records source markers on applied bill item candidates. It is limited to safe draft or draft-like one-participant/compatible-payer shapes and does not infer multi-participant split policy.

Current OCR review runtime does not run OCR, enqueue worker jobs, store raw OCR full text, store receipt bytes, mutate settlement/payment/balance/proof/file/storage/OCR job/worker state, perform non-draft shared-bill revision apply, infer multi-participant splits, create thumbnails, or automatically finalize bills. Wider apply policy is tracked in [Receipt OCR review apply policy](RECEIPT_OCR_REVIEW_APPLY_POLICY.md).

The mobile runtime at the time of this decision still uses the Latin-only ML
Kit provider. The approved PaddleOCR/ONNX architecture, Global Core packaging,
automatic mixed-script routing, and real Android/iOS manifest acceptance are
not implemented merely because this decision is recorded.

## OCR Paths

### On-device OCR

On-device OCR is a required mobile capability. It is used for offline receipt processing, server-unavailable flows, and local-only profiles.

The mobile app uses on-device OCR to create draft or provisional extracted data from captured or imported receipts. Before the data becomes a final local record or a queued server-mode change, the user must be able to review and edit the extracted fields.

The on-device provider and model-family choice is the approved PaddleOCR/ONNX
architecture above. Model sizes and runtime costs must be measured and
reported; no unmeasured size claim or provider substitution is permitted.

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

## Receipt Scan Preprocessing

Receipt scan preprocessing is distinct from OCR. Capture/import preprocessing includes orientation correction, crop or document-boundary detection, perspective correction, enhancement, safe downscaling, metadata stripping, a JPEG normalized receipt master by default, and thumbnail generation.

All receipt capture and import paths must use the same receipt image intake policy, including camera scan, gallery import, file import, share-to-Settleora, offline queue upload, web upload, replacement upload, and server-side reprocessing. OCR works from normalized or derivative images, while extracted data remains reviewable and provisional according to the local-only or server-mode authority rules above.

Receipt image normalization, raw source retention, thumbnails, deployment hard caps, and purpose-specific upload policy are defined in [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md).

## Validation Boundaries

Client-side OCR extraction is a convenience in server-mode, not an authority boundary. The backend validates money, currency, rounding, ownership, permissions, and policy before accepting server-mode records.

Money must remain decimal-safe. Currency must always be attached to monetary values. Rounding policy remains centralized for authoritative server-mode decisions.

OCR-derived review and apply paths must also validate file purpose, storage policy, split/adjustment/payer policy, duplicate/conflict policy, and current bill state before acceptance. Worker output, on-device extraction, queue state, notification assignment state, generated-client methods, or successful preview responses are not acceptance.

## Non-goals For Current Milestone

- Recording this decision does not itself implement or accept the PaddleOCR
  mobile provider, packages, or models.
- No Python OCR implementation yet.
- No server OCR engine or OCR worker runtime yet.
- No standalone receipt/OCR upload outside bill attachments yet.
- No automatic OCR-to-bill finalization from OCR completion, queue visibility, preview success, apply availability, or generated client availability.
- No non-draft shared-bill OCR revision apply.
- No multi-participant OCR-to-split inference.
- No generic file, receipt, or OCR API outside bill attachments.
- No receipt thumbnail generation yet.

## Future Decisions

- Exact Settleora model artifact versions, hashes, conversion settings, and
  Global Core pack inventory after corpus validation.
- Exact platform adapter and execution-provider optimization after CPU
  correctness is proven.
- Confidence scoring model.
- Receipt image retention rules.
- Local cache encryption strategy.
- Retry and reprocessing policy.
- Conflict handling UX for OCR-derived fields.
