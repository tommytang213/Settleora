# Storage File Policy Architecture

## Purpose

This document defines Settleora's Day 1 file intake, normalization, retention, and storage policy for receipts, payment proofs, QR/payment images, screenshots, supporting documents, and future upload surfaces.

The goal is to keep real user uploads production-shaped from the first usable product: Settleora must not blindly store huge raw camera images, full-resolution phone screenshots, unsupported files, or unbounded documents. This policy complements [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md), which defines storage abstraction, metadata, lifecycle, and authorization foundations.

This document is architecture direction only. It does not authorize runtime implementation, schema changes, OpenAPI changes, generated client changes, or UI work by itself.

## Principles

- File policy is purpose-specific. A receipt OCR image, payment proof, QR code, screenshot, CSV statement import, and supporting PDF do not have the same allowed types, normalization, retention, or validation rules.
- All upload and import paths must be governed by policy.
- Client-side normalization improves UX and bandwidth, but API enforcement is authoritative in server mode.
- Deployment hard caps override admin-configurable product policy.
- File bytes must go through the storage abstraction.
- File metadata belongs in PostgreSQL.
- API responses must not expose direct filesystem paths, object keys, bucket names, provider URLs, temporary local paths, or storage provider internals.
- File reads and writes require API authorization.
- Storage, retention, and security policy changes must be auditable.
- Sensitive file contents, raw OCR text, secrets, tokens, payment details, and sensitive metadata must not be logged by default.

## Intake Paths

The same purpose-specific policy must cover every relevant file intake path:

- Scan now from camera.
- Pick existing photo from gallery.
- Import from Files/document picker.
- Share into Settleora.
- Mobile offline queue/sync upload.
- Web upload.
- Replace or re-upload an attachment.
- Server-side reprocessing paths.

No upload path may bypass policy. Mobile and web clients may validate early, but server-mode acceptance depends on API-side policy checks against the actual bytes and declared file purpose.

## Receipt Image Normalization

Receipt images used for OCR normalize to JPEG by default for Day 1 compatibility. This is product policy, not an eternal hardcoded law; admin policy and future implementation may choose another normalized receipt master format within deployment hard caps.

Day 1 defaults:

- Raw camera, library, or imported source files are not uploaded or retained by default.
- The normalized user-accepted scan is the canonical receipt image by default.
- Raw source retention is off by default and may become admin-configurable only within deployment hard caps.
- Normalize before OCR, upload, and storage.
- Generate thumbnails.
- Strip metadata by default.
- Correct orientation and rotate pixels correctly rather than relying on fragile EXIF orientation.
- Crop and perspective-correct where available.
- Safely downscale while preserving readability.
- Use quality-aware and performance-aware normalization.
- Prefer one balanced normalization/OCR pass by default. Do not run repeated full OCR passes unless policy and confidence justify it.
- Allow at most one larger retry when OCR or readability confidence is poor.
- Readability and OCR quality beat tiny file size.

Receipt scan preprocessing is distinct from OCR. Preprocessing produces the normalized receipt image and derivatives; OCR extracts candidate text and structured fields from those images. OCR-derived data remains reviewable and provisional according to local/server authority rules in [OCR architecture](OCR_ARCHITECTURE.md).

## Other Image Attachments

Other image files should also be normalized by default to prevent storage explosion, but not every image should be forced to JPEG.

Covered image purposes include:

- Payment proof images and screenshots.
- QR/payment profile images.
- General supporting image attachments.
- Screenshots from high-resolution phones.
- High-resolution camera images.

Default rules:

- Strip metadata by default.
- Enforce per-purpose maximum source dimensions, normalized dimensions, source size, and stored size.
- Generate thumbnails or previews where useful.
- Use purpose-specific target format policy.
- Protect QR/payment image readability and scannability; PNG or a high-quality image policy may be safer than aggressive JPEG compression.
- Compress screenshots and text-heavy images conservatively so text remains readable.
- Convert huge RAW or camera sources if explicitly supported by policy and implementation, otherwise reject them with a clear user-facing message.
- Raw source storage is off by default.

## Documents And Non-image Files

Supporting documents are controlled differently from receipt images.

- Do not blindly convert every document into JPEG.
- PDFs, office files, and supporting documents may preserve original format when policy allows.
- Enforce allowed type, maximum size, maximum pages where applicable, and retention policy.
- Generate preview or thumbnail derivatives separately where needed.
- CSV statement import is not image-normalized. When implemented, it uses strict type, size, row-count, delimiter/encoding, and mapping policy.
- Documents remain bounded and previewed rather than blindly image-converted.

## Default Purpose-specific Policy

These defaults are configurable per purpose and bounded by deployment hard caps.

| Purpose | Default allowed types | Default normalization behavior | Default retention | Notes |
|---|---|---|---|---|
| Receipt OCR image | JPEG, PNG, HEIC/HEIF where supported for import | Normalize accepted scan to JPEG by default, strip metadata, rotate pixels, crop/perspective-correct where available, safe downscale, generate thumbnail | Normalized receipt image kept while parent bill/receipt exists; raw source discarded after successful normalization | Canonical Day 1 receipt image is the normalized accepted scan. OCR works from normalized or derivative images. |
| Payment proof image | JPEG, PNG, HEIC/HEIF where supported for import | Normalize to purpose-selected image format, strip metadata, conservative compression for text/screenshot readability, generate preview | Kept while proof/settlement payment record exists, then trash/purge policy | Proofs may contain bank or account details and are sensitive. |
| QR/payment profile image | PNG, JPEG, HEIC/HEIF where supported for import | Preserve scannability; prefer PNG or high-quality normalized output where policy requires, strip metadata, generate preview | Kept while payment profile setting exists | Do not aggressively compress QR codes. |
| Screenshot attachment | PNG, JPEG, HEIC/HEIF where supported for import | Normalize with text-readable compression, strip metadata, cap dimensions and stored size, generate thumbnail | Kept while parent attachment exists | High-resolution phone screenshots must be bounded without making text unreadable. |
| Supporting document/PDF | PDF and explicit document types allowed by policy | Preserve original format if allowed; generate preview/thumbnail derivative separately where needed | Kept while parent attachment exists | Enforce maximum size and page count. Do not convert the document master to JPEG by default. |
| CSV statement import | CSV, possibly TSV if policy allows | No image normalization; validate encoding, delimiter, row count, size, and mapping | Import source retention is policy-controlled; parsed records follow reconciliation policy | Statement files are highly sensitive and private to the importer by default. |
| Office/supporting document | DOCX, XLSX, ODS, ODT, or other explicit types allowed by policy | Preserve original format if allowed; optional preview derivative | Kept while parent attachment exists | Disable risky or unsupported formats by default until reviewed. |
| RAW/high-resolution camera source | RAW formats disabled by default; huge camera files accepted only when explicitly supported | Convert to an approved normalized derivative if supported, otherwise reject with a clear message | Raw source storage off by default | Admin policy cannot enable unbounded raw storage beyond deployment caps. |

## Admin Configurability

Day 1 should have an admin policy area such as:

```text
Admin -> Storage & Upload Policy
```

Configurable policy should be purpose-specific:

- Allowed file types.
- Maximum source upload/import size.
- Maximum normalized stored size.
- Maximum thumbnail/preview size.
- Maximum files per bill, settlement, profile area, or other owning record.
- Maximum PDF pages or statement rows where applicable.
- Normalized receipt format.
- Image normalization behavior.
- Raw source retention.
- OCR derivative retention.
- OCR raw text retention.
- Trash/retention period.
- Per-user or per-group storage quotas if and when implemented.

Admin values cannot exceed deployment hard caps. Admin changes that affect storage, retention, security, or visibility require audit events with bounded metadata.

## Deployment Hard Caps

Environment or deployment configuration provides absolute ceilings. Examples:

- Maximum request body size.
- Maximum source file size.
- Maximum normalized file size.
- Maximum attachment size.
- Maximum files per record.
- Maximum PDF pages.
- Optional storage quota ceilings.

The admin UI should show these caps where useful and must not allow product policy values beyond them. API enforcement must apply the lower of the deployment hard cap and the active admin/product policy.

## Server And API Enforcement

Server-mode API enforcement is authoritative. The API must:

- Verify authentication and authorization.
- Verify the file purpose and subject association.
- Validate actual bytes, MIME/content type, and content signature, not only filename extension.
- Enforce size, type, page, count, normalization, retention, and quota limits.
- Reject unsupported RAW or oversized files unless explicitly allowed by policy and deployment caps.
- Store bytes through the storage abstraction.
- Store file metadata in PostgreSQL.
- Return stable file IDs and safe metadata, not storage internals.
- Emit audit events for security, storage, retention, and policy-affecting actions.
- Never trust client local paths, client-generated object keys, or client-declared MIME alone.

## Client Behavior

Mobile and web clients should:

- Fetch server policy before upload in server mode where practical.
- Enforce or warn early to avoid wasting bandwidth.
- Use local default policy for local-only mode.
- Normalize before upload for receipt and image purposes.
- Keep raw source only temporarily during the capture/import session unless policy says otherwise.
- Give the user a preview and manual crop/rotate correction where needed.
- Allow fallback manual entry when OCR or scanning fails.

Client-side checks are usability features. They must not be treated as server acceptance, authorization, or final policy enforcement.

## Retention

Default retention should be safe but configurable per purpose:

- Normalized receipt image kept while the parent bill/receipt exists.
- Raw receipt source discarded after successful normalization.
- Thumbnail kept while the parent file exists.
- OCR derivative temporary/cache by default.
- OCR raw text stored only if policy allows and treated as sensitive.
- Payment proof kept while the proof/settlement record exists.
- QR/payment profile image kept while the profile setting exists.
- Supporting document kept while the attachment exists.
- Trash/deleted files retained for the configured trash period, then purged by a cleanup job where safe.
- Retention and deletion changes are audited.

Deletion and purge must respect business-record dependencies, audit requirements, backup caveats, vault policy, and legal/operational retention settings where applicable.

## Non-goals

This document does not authorize:

- Runtime implementation.
- Database migrations.
- API endpoint or OpenAPI changes.
- Generated client changes.
- UI implementation.
- OCR package choice.
- Server OCR engine choice.
- Full AI/ML document understanding.
- Direct storage-provider exposure.
- Unlimited admin-configurable file sizes.
- Storing raw camera sources by default.
