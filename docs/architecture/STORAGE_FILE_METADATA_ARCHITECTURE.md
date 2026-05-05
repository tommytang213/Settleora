# Storage File Metadata Architecture

## Purpose

This document defines Settleora's Day 1 architecture direction for storage abstraction, file metadata, upload/download authorization, and sensitive file lifecycle before implementation.

Storage is a cross-cutting foundation for receipt images, OCR source files, settlement proof attachments, payment QR images, statement uploads, exports, and future vault-protected sensitive files. The goal is to avoid turning future upload/download endpoints into a generic public file server.

This is a design-only gate. It does not authorize implementation code, migrations, OpenAPI changes, generated client changes, UI behavior, or storage provider implementation beyond the existing readiness check.

## Current State

- The API has typed `StorageOptions` under `Settleora:Storage` with `Provider` and `RootPath` values.
- The API registers `IStorageReadinessCheck` with the local implementation `LocalStorageReadinessCheck`.
- The current local storage readiness check only validates that the configured local root can be created and accessed when `Provider` is `Local`.
- `GET /health/ready` includes a storage readiness result, but it does not expose the configured root path, exception details, connection details, or physical paths.
- Readiness validates configured local root availability. It does not implement file upload, download, authorization, lifecycle, encryption, metadata, or file content validation.
- No file metadata table exists.
- No application file read/write storage abstraction exists beyond readiness.
- No file upload/download API exists.
- No OpenAPI file upload/download paths exist. The OpenAPI contract has only readiness references and an unused placeholder storage-object reference schema.
- No generated client file API methods exist.
- The payment-details foundation intentionally omits `qr_file_id` because real file metadata does not exist yet.
- The `user_payment_profiles` table has no QR/file metadata column, storage path, vault key, or object key.
- Receipt/OCR/proof/statement/QR file flows are not implemented yet.

## Architecture Principles

- File bytes go through a storage abstraction owned by the API.
- File metadata belongs in PostgreSQL.
- API responses expose stable file IDs and safe metadata only.
- API responses must not expose filesystem paths, object keys, bucket names, provider URLs, temporary local paths, mounted volume paths, or storage internals.
- Reads and writes require API authorization.
- API/domain services own file authorization, lifecycle policy, audit, retention, and subject association.
- Workers must not mutate core business tables or file metadata tables directly.
- Clients must not decide access from cached UI state, hidden controls, generated client availability, stored profile data, or route visibility.
- File access decisions must fail closed when ownership, subject association, lifecycle state, policy, or current actor context is missing or ambiguous.

## File Categories

Future file metadata should treat purpose/category as a constrained value. Initial Day 1 candidates:

```text
receipt_image
ocr_source
settlement_proof
payment_qr
statement_upload
export_file
supporting_attachment
```

### `receipt_image`

Original receipt photos, imported receipt images, and derived receipt thumbnails where stored.

Likely owner: the creating/importing user profile, with access later expanded through the related expense, bill, group, or shared-record participation policy.

Authorization context: authorized expense/bill participants may view receipt images only when the API can prove they are allowed to see the related record. Receipt files are sensitive application data.

### `ocr_source`

Source files submitted for OCR processing, including images or PDFs used to extract receipt data.

Likely owner: the importing user profile or the owner of the draft/expense record that requested OCR.

Authorization context: the API may allow OCR workers to process approved jobs, but worker access must be mediated by reviewed job payloads and API validation. OCR source bytes and extracted OCR text are sensitive.

### `settlement_proof`

Optional proof attachments for settlement workflows, such as screenshots, payment confirmations, or supporting PDFs.

Likely owner: the user who uploads the proof, associated with a settlement or payment action.

Authorization context: visible only to authorized settlement parties and policy-approved viewers. Proof visibility must not be inferred from group membership alone without a concrete settlement/payment relationship.

### `payment_qr`

Payment QR or payment-code images attached to a user's payment details.

Likely owner: the payment-profile owner.

Authorization context: self access for the owner, plus future counterparty access only through payment-details visibility rules after QR support and relationship records exist. Payment QR files are sensitive payment data, not public profile images.

### `statement_upload`

Uploaded statement files for future reconciliation, starting with CSV and later possibly PDFs or other statement formats.

Likely owner: the importing user profile.

Authorization context: private to the importing user by default. Group members may see only authorized linked shared expense data, not raw statement files or rows.

### `export_file`

Generated CSV, JSON, PDF summary, or backup/export bundles.

Likely owner: the creator or requested export owner.

Authorization context: visible only to the creator/owner unless an explicit sharing workflow exists. Export files may contain sensitive aggregated financial data and should have retention/expiry policy.

### `supporting_attachment`

General supporting files attached to an approved business subject such as an expense, bill, settlement, note, dispute, or support workflow.

Likely owner: uploader plus the owning business subject.

Authorization context: inherits from the associated business subject and purpose policy. It must not become a generic user file bucket.

## Metadata Schema Direction

Future PostgreSQL schema should introduce a stable file metadata table such as:

```text
file_objects
```

Suggested fields:

```text
id
owner_user_profile_id
created_by_user_profile_id
purpose
status
content_type
original_filename nullable
size_bytes
sha256_hash nullable
storage_provider
storage_object_key
encryption_mode
vault_key_ref nullable
retention_policy nullable
created_at_utc
updated_at_utc
deleted_at_utc nullable
```

`storage_object_key` is provider-internal and must never be returned directly by API responses. It should be treated like operational metadata, not user data. Clients receive `id` plus safe display metadata only.

Suggested constrained statuses:

```text
pending
active
quarantined
deleted
purged
upload_failed
```

Status direction:

- `pending`: metadata exists for an upload/write that has not been completed and finalized.
- `active`: file is available through authorized API reads.
- `quarantined`: file exists but is blocked by scanning, policy, validation, or manual review.
- `deleted`: user-facing deleted/archived/trash state. Content may still exist for retention, restore, audit, or backup policy.
- `purged`: metadata remains only as bounded tombstone/audit support, while content is permanently removed where policy allows.
- `upload_failed`: upload/write did not complete and should not be served.

Additional future tables may be needed for subject associations, for example receipt-to-expense, proof-to-settlement, payment-profile QR reference, or export ownership. Those associations should use stable file IDs, not provider paths.

## Storage Provider Abstraction

Future API-side interfaces should be conceptualized as provider-neutral boundaries, not direct filesystem or object-store calls from endpoint handlers.

Possible service responsibilities:

- Reserve metadata for an intended purpose and owner.
- Generate a provider-neutral server-owned object key.
- Write bytes to the selected provider.
- Read bytes by stable file ID after authorization.
- Return safe metadata by stable file ID after authorization.
- Finalize upload state and content metadata.
- Archive, restore, delete, and purge according to lifecycle policy.
- Record bounded audit events.
- Coordinate cleanup for orphaned metadata and orphaned objects.

Provider direction:

- Local filesystem provider for self-hosted Day 1 deployments.
- Future S3-compatible/object-store provider.
- Provider-neutral object keys generated by the server.
- No direct path joining from request input.
- No user-provided path segments in object keys.
- No public provider URLs in ordinary API responses.

Object-store and filesystem writes cannot be perfectly transactional with PostgreSQL. Future implementation should use an atomic-ish pattern with compensating cleanup.

Preferred foundation pattern:

1. API validates actor, purpose, size, content type, and subject context.
2. API creates `file_objects` metadata as `pending` with a server-generated object key.
3. API writes bytes to storage under that key.
4. API computes or validates safe metadata such as size, hash, content type, and lifecycle status.
5. API finalizes the row as `active` inside a database transaction with any subject association.
6. If storage write fails, mark metadata `upload_failed`.
7. If metadata finalization fails after bytes exist, enqueue or record orphan cleanup for the generated object key.

An alternate write-bytes-then-metadata pattern may be acceptable for internal jobs, but it must still avoid serving objects without active metadata and must have orphan cleanup.

Delete/archive/purge semantics:

- Archive/delete should first change server metadata state and stop ordinary reads.
- Physical deletion should happen only when retention and audit policy allow it.
- Purge should be explicit, audited, and resilient to repeated cleanup attempts.
- Provider delete failures should be visible as maintenance state without exposing paths or object keys to clients.

## Local Filesystem Safety

The local provider is a self-hosted Day 1 deployment target, especially for Docker and TrueNAS SCALE, but it must be treated as a storage provider, not a static file directory.

Safety rules:

- Root path comes from configuration, never from request input.
- Object keys are generated by the server, never by clients.
- Future path resolution must prevent path traversal by normalizing the full path and proving it remains under the configured root.
- API responses must never expose absolute paths, relative storage paths, volume mount paths, or temporary local paths.
- User-provided filenames are display metadata only and must not drive directory names or object keys.
- Use a safe directory layout for snapshots/backups, such as server-generated purpose/date/hash partitions under one configured root.
- Avoid placing uploaded content under public static web roots.
- Uploaded content must not be executable by the API container or host service account.
- Docker/TrueNAS SCALE deployments should mount the storage root as a persistent volume with least-privilege read/write permissions for the API service.
- Workers should not mount and mutate the same root directly unless a future worker file-access design explicitly approves that path.
- Readiness proving the root can be created/accessed is not proof that upload/download authorization, lifecycle, path traversal protection, or content validation is correct.

## Upload And Download API Direction

This branch does not modify OpenAPI. Future endpoint direction must be reviewed separately.

Potential generic endpoints:

```text
POST /api/v1/files
GET /api/v1/files/{fileId}/metadata
GET /api/v1/files/{fileId}/content
DELETE /api/v1/files/{fileId}
```

However, Day 1 should avoid a broad generic upload endpoint unless it requires a strict purpose, server-side ownership checks, allowed subject association, lifecycle policy, content validation, and audit.

Purpose-specific endpoints are often safer first:

```text
POST /api/v1/users/me/payment-details/qr
POST /api/v1/receipts
POST /api/v1/settlements/{settlementId}/proof
```

Purpose-specific endpoints let the API enforce the exact relationship and policy before bytes are accepted. A generic upload endpoint can still exist later, but it should be a controlled internal foundation rather than an unscoped file bucket.

Response principles:

- Return stable file ID and safe metadata only.
- Do not return paths, object keys, bucket names, provider URLs, temporary local paths, direct storage URLs, vault keys, or provider diagnostics.
- Content download goes through API authorization every time.
- Ordinary metadata reads should not grant content reads automatically when lifecycle, purpose, or policy says otherwise.
- Download responses should set safe content headers and avoid executing or inline-rendering risky file types by default.

## Authorization Model

Authorization must be checked on every:

- metadata read
- content read
- upload
- replace
- archive/delete
- restore
- purge
- subject association change
- lifecycle/status transition

Category access direction:

- Owner self files: the owner may access files through authenticated self flows when the file purpose and lifecycle policy allow it.
- Payment QR: visible only through payment-details visibility rules after QR support exists. It must not be globally readable from a profile or user lookup.
- Receipt images: visible only to authorized expense/bill participants or owners under API-verified record participation policy.
- OCR source: visible only to the owning/importing user and approved processing paths. OCR workers may process only through reviewed job boundaries.
- Settlement proof: visible only to authorized settlement parties and policy-approved viewers.
- Statement uploads: private to the importing user by default. Admin/support access requires separate reviewed redaction or break-glass policy.
- Export files: visible only to the creator/owner unless explicitly shared through a reviewed workflow.
- Supporting attachments: inherit access from the associated business subject and purpose policy.

Possessing a file ID is not authorization. Possessing a related profile ID, group ID, settlement ID, expense ID, generated client method, cached membership row, or hidden UI route is not authorization.

Denied, deleted, missing, quarantined, and not-visible states should be mapped carefully so unrelated users cannot use file APIs to enumerate sensitive records.

## Validation And File Safety

Future implementation must validate files by purpose.

Validation dimensions:

- Allowed content types by purpose.
- Allowed file extensions by purpose.
- Size limits by purpose.
- Content-type sniffing or magic-byte validation instead of trusting only client-supplied headers.
- Filename normalization for display only.
- Hashing where useful for duplicate detection, audit, or malware-scanning workflows.
- Malware/virus scanning as an optional or future deployment policy.
- Image/PDF handling risk, including malformed files, embedded scripts, oversized dimensions, decompression bombs, metadata leakage, and thumbnail generation risks.
- HEIC, WEBP, JPEG/JPG, PNG, and PDF as practical target support from the PRD where the purpose allows them.
- Common office documents only for explicitly permitted supporting attachments, and only with conservative serving/download behavior.

Uploaded content must never be executed. Uploaded content must not be served from public static directories. API download behavior should prefer attachment/download headers for risky types unless a reviewed preview path exists.

Client-supplied `content_type`, filename, extension, and size are hints until the API validates them. The server-owned metadata is authoritative after validation.

## Privacy Vault Interaction

Storage metadata remains server-authoritative even when selected file bytes or derived sensitive content become vault-protected later.

Sensitive file categories include:

- payment QR files
- receipt images
- settlement proofs
- statement uploads
- OCR source files
- OCR raw text where stored
- export files containing sensitive records

Future-compatible encryption modes should align with the privacy vault architecture:

```text
server_managed
recoverable_user_vault
strict_user_vault_future
```

Rules:

- File metadata such as owner, purpose, status, size, content type, lifecycle state, and authorization subject remains API/domain-authoritative.
- Selected file bytes or derived sensitive content may be vault-protected later.
- Vault protection must not make clients authoritative for money, settlement states, sharing, authorization, audit, retention, or server-mode validation.
- Ordinary API responses must not include vault keys, data keys, key envelopes, recovery envelopes, provider secrets, or vault internals.
- `encryption_mode` and nullable `vault_key_ref` metadata can make the file schema future-compatible without exposing key material.

## Audit

Future audit events:

```text
file.upload_started
file.upload_completed
file.upload_failed
file.metadata_updated
file.content_read
file.archived
file.restored
file.deleted
file.purged
file.authorization_denied
```

Audit metadata should identify actor, subject, file ID, purpose, action, outcome, timestamp, correlation ID, and bounded reason/category where useful.

Audit metadata must avoid:

- raw file contents
- thumbnails or previews
- OCR text
- statement rows
- payment handles or notes
- settlement proof contents
- storage paths
- object keys
- bucket names
- provider internals
- vault keys or envelopes
- raw tokens or credentials
- request bodies
- unbounded filenames or user-agent details

Read auditing can be policy-sensitive. Content reads for sensitive categories, counterparty payment QR reads, settlement proof reads, admin/support reads, and denied attempts should be strong candidates for audit.

## Lifecycle, Retention, And Trash

Day 1 file lifecycle should distinguish user-facing delete/archive from permanent purge.

Rules:

- User-facing delete generally moves the file to Trash or `deleted` state.
- Deleted files are not served through ordinary reads.
- Restore is allowed only when the actor and subject policy still allow it.
- Purge permanently removes bytes where retention and legal/audit policy allow it.
- Purge should leave bounded tombstone/audit evidence without retaining sensitive contents or provider internals.
- Draft or failed uploads may be hard-deletable sooner when no audit or business record depends on them.
- Retention policy hooks should support keep-forever defaults, export expiry, statement retention, receipt retention, and admin maintenance policy later.
- Orphan cleanup must handle both metadata without bytes and bytes without active metadata.
- Backup/restore must preserve database metadata, file bytes, lifecycle state, and future encryption/vault metadata consistently.
- Admin maintenance views may show safe metadata such as file ID, purpose, status, size, content type, owner category, created time, and policy status. They should not show raw sensitive content by default.

## Worker And OCR Boundaries

Workers are not owners of core business state.

Rules:

- Workers may receive jobs with stable file IDs or provider-neutral references only as approved by API job payload design.
- Workers must not write file metadata or core business tables directly.
- Workers must not decide user-facing file authorization.
- Workers must not use client-supplied paths or object keys as authority.
- OCR source bytes and OCR text are sensitive and should not be logged by default.
- OCR worker output remains provisional until the API validates it.
- The API validates worker results before changing core file, OCR, expense, bill, settlement, or business state.
- If workers need temporary derived files, those files should have explicit purpose, lifecycle, cleanup, and audit boundaries.

## Non-goals

This design branch does not authorize:

- implementation code
- migrations
- OpenAPI changes
- generated client changes
- UI behavior
- upload/download endpoints
- payment QR upload
- receipt upload
- settlement proof upload
- statement upload
- OCR worker file processing
- storage provider implementation beyond existing readiness
- vault runtime encryption
- direct public/static file serving

## Next Implementation Candidate

The safer first implementation slice is:

```text
file metadata schema + internal storage abstraction foundation only,
without public upload/download endpoints
```

That slice should add the `file_objects` schema, constrained purpose/status/encryption metadata, provider-neutral internal storage interfaces, local provider path-safety tests, lifecycle result types, and internal service tests. It should not add public upload/download endpoints, payment QR upload, receipt upload, settlement proof upload, statement upload, OpenAPI file paths, generated file clients, UI behavior, or OCR worker file processing.

A purpose-specific payment QR upload slice can follow only after the metadata/storage foundation exists and payment-details visibility can reference stable file IDs safely.
