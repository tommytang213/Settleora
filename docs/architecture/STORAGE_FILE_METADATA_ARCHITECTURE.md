# Storage File Metadata Architecture

## Purpose

This document defines Settleora's Day 1 architecture direction for storage abstraction, file metadata, upload/download authorization, and sensitive file lifecycle.

Storage is a cross-cutting foundation for receipt images, OCR source files, settlement proof attachments, payment QR images, statement uploads, exports, and future vault-protected sensitive files. The goal is to avoid turning future upload/download endpoints into a generic public file server.

This document began as a design gate. The current repository now includes the explicitly scoped file metadata schema, internal local storage provider foundation, self payment QR linkage endpoints, settlement-scoped counterparty payment QR content reads, and purpose-specific settlement payment proof endpoints described below; generic public file APIs, UI behavior, broader subject-specific file workflows, and non-local providers still require separate reviewed slices.

## Current State

- The API has typed `StorageOptions` under `Settleora:Storage` with `Provider` and `RootPath` values.
- The API registers `IStorageReadinessCheck` with the local implementation `LocalStorageReadinessCheck`.
- The current local storage readiness check only validates that the configured local root can be created and accessed when `Provider` is `local` or an equivalent case-insensitive local value.
- `GET /health/ready` includes a storage readiness result, but it does not expose the configured root path, exception details, connection details, or physical paths.
- Readiness validates configured local root availability. It does not implement public file upload, download, authorization, lifecycle policy, encryption, or file content validation.
- The `file_objects` table exists as the first PostgreSQL file metadata foundation.
- `file_objects` stores owner and creator profile references, constrained purpose/status/encryption-mode values, content type, optional original filename, size, optional SHA-256 hash, local storage provider name, provider-internal object key, optional vault/retention metadata, timestamps, and soft-delete timestamp.
- `storage_object_key` is provider-internal metadata and must not be returned by future public API response DTOs.
- A provider-neutral internal `IFileObjectStorageProvider` exists with a local filesystem implementation for server-generated object keys and local read/write/delete operations.
- The local provider uses `StorageOptions.RootPath`, rejects unsupported configured providers or blank roots, generates object keys from server-owned purpose/date/ID segments only, rejects unsafe object keys, resolves full paths, and proves resolved paths remain under the configured root.
- A metadata-only internal file object lifecycle service exists for pending creation, upload completion/failure, deleted, and purged status transitions.
- The lifecycle service writes bounded `auth_audit_events` actions `file.upload_started`, `file.upload_completed`, `file.upload_failed`, `file.deleted`, and `file.purged` with safe metadata only.
- No generic file upload/download API exists.
- The OpenAPI contract includes purpose-specific self payment QR attach/remove/content-read paths, settlement-scoped counterparty payment QR content reads, and settlement payment proof attach/list/content/remove paths; no generic file upload/download path exists.
- Generated clients expose the self payment QR, settlement-scoped counterparty payment QR, and settlement payment proof methods, not a generic file API.
- The payment-details foundation includes nullable `qr_file_object_id` linkage to `file_objects`.
- The `user_payment_profiles` table has no storage path, vault key, provider URL, original filename, or object key.
- Self payment QR upload/remove/content-read endpoints exist under `/api/v1/users/me/payment-details/qr`.
- Settlement payment proof upload/list/content-read/remove endpoints exist under `/api/v1/settlement-payments/{paymentId}/proof`.
- Receipt/OCR/statement file flows are not implemented yet.

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

File metadata treats purpose/category as a constrained value. Initial Day 1 values:

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

Authorization context: self access for the owner, plus current settlement-scoped counterparty access only through payment-details visibility rules and proven settlement relationships. Payment QR files are sensitive payment data, not public profile images.

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

The current PostgreSQL foundation introduces a stable file metadata table:

```text
file_objects
```

Current fields:

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

Current constrained statuses:

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

Additional future tables may be needed for subject associations, for example receipt-to-expense, export ownership, or broader supporting attachments. Current payment-profile QR and settlement proof associations use stable file IDs, not provider paths.

## Storage Provider Abstraction

API-side storage interfaces are provider-neutral boundaries, not direct filesystem or object-store calls from endpoint handlers.

The current implementation includes an internal local provider that can create server-owned object keys and perform local read/write/delete under the configured root. A small metadata-only lifecycle service now reserves pending rows and records status transitions with bounded audit events. Authorization-aware reads exist for purpose-specific self payment QR, settlement-scoped counterparty payment QR, and settlement payment proof flows. Generic public upload/download endpoints, receipt/statement/OCR subject associations, and cleanup orchestration remain future work.

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
- Path resolution must prevent path traversal by normalizing the full path and proving it remains under the configured root. The current local provider enforces this for internal object-key operations.
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
DELETE /api/v1/users/me/payment-details/qr
GET /api/v1/users/me/payment-details/qr/content
POST /api/v1/receipts
POST /api/v1/settlement-payments/{paymentId}/proof
GET /api/v1/settlement-payments/{paymentId}/proof/{fileId}/content
```

Purpose-specific endpoints let the API enforce the exact relationship and policy before bytes are accepted. A generic upload endpoint can still exist later, but it should be a controlled internal foundation rather than an unscoped file bucket.

For the first payment QR slices, dedicated payment-details QR content endpoints are safer than exposing `GET /api/v1/files/{fileId}/content`, because the API resolves the current actor, payment profile, settlement relationship where applicable, `qr_file_object_id`, purpose, ownership, lifecycle state, and payment-details authorization in one subject-specific boundary. A future authorized file content endpoint may be introduced later, but only after a subject-specific authorization decision has already proven the actor may read the file content.

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
- Payment QR: visible only through payment-details visibility rules and relationship-backed QR reads. It must not be globally readable from a profile or user lookup.
- Payment QR Day 1 self linkage: the authenticated actor must be derived from the current session, must pass the profile/payment-details authorization boundary, and must match both `owner_user_profile_id` and `created_by_user_profile_id` for the linked file.
- Payment QR files must have purpose `payment_qr`; other file purposes must not be attachable to payment details.
- Payment QR files must not be readable by group members merely because they share a group with the owner.
- Current counterparty QR reads require settlement relationship proof before the API opens file content; any future payment-request or equivalent flow must prove the same kind of concrete relationship.
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

Payment QR validation should start narrower than general image or document upload:

- Allow only reviewed QR image MIME types initially, likely `image/png`, `image/jpeg`, and `image/webp`.
- Consider HEIC/HEIF later only if server validation and client compatibility are reviewed.
- Use a small purpose-specific maximum file size, with an initial recommendation around 2 MB unless real capture behavior requires a different limit.
- Treat original filename as display-only metadata, not as object-key, path, route, policy, or authorization input.
- Sniff magic bytes/content where practical instead of trusting only the submitted content type.
- Do not allow SVG for Day 1 without a separate review, because scriptable/vector formats change the serving and sanitization threat model.
- Do not allow PDFs for payment QR without a separate review; PDFs belong to specific receipt, proof, statement, or supporting-attachment policies.

## Payment QR Linkage Foundation

The current implementation is a purpose-specific self payment QR linkage foundation, not a generic file endpoint.

Recommended flow:

1. Resolve the current actor from the authenticated session.
2. Authorize the actor against their own active payment profile through the profile/payment-details boundary.
3. Validate content type, size, display filename, and purpose policy for `payment_qr`.
4. Create a pending `file_objects` row through the file lifecycle service with owner and creator set to the current actor.
5. Write bytes through the internal local storage provider using the server-generated object key.
6. Mark the file active only after storage succeeds and validation metadata is complete.
7. Link `user_payment_profiles.qr_file_object_id` to the active file object in the same database transaction as the final payment-profile linkage where practical.
8. Mark failed uploads as `upload_failed` and leave payment profile linkage unchanged.

Attach, replace, and remove policy:

- Attach should link only an active `payment_qr` file object owned and created by the current actor.
- Replace should attach the new active QR and mark the previous linked QR deleted or detached according to the reviewed lifecycle policy.
- Remove should clear the payment-profile QR reference and mark the previously linked file deleted.
- Failed upload must not leave a `qr_file_object_id` reference on `user_payment_profiles`.
- The payment-profile foreign key to `file_objects` should use restrict delete behavior.

The implemented public API is purpose-specific:

```text
POST /api/v1/users/me/payment-details/qr
DELETE /api/v1/users/me/payment-details/qr
GET /api/v1/users/me/payment-details/qr/content
```

No generic public file endpoint, direct storage path, object key, bucket name, provider URL, or local filesystem path is part of this QR slice. Counterparty QR reads are limited to relationship-backed settlement authorization.

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
- Payment QR linkage must not block future `server_managed`, `recoverable_user_vault`, or `strict_user_vault_future` direction; those modes affect protection of bytes or derived content, not the API's ownership, lifecycle, authorization, or audit authority.

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
- QR image contents
- OCR text
- statement rows
- payment handles or notes
- settlement proof contents
- storage paths
- object keys
- bucket names
- provider internals
- vault keys or envelopes
- vault refs
- raw tokens or credentials
- request bodies
- original filenames unless a future policy explicitly approves bounded or redacted filename metadata
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

This architecture still does not authorize:

- UI behavior
- generic or global counterparty QR read outside settlement-scoped relationship authorization
- generic file API
- receipt upload
- generic settlement proof upload outside the purpose-specific payment proof endpoints
- statement upload
- OCR worker file processing
- additional storage providers beyond the internal local filesystem foundation
- vault runtime encryption
- direct public/static file serving

## Current Implementation Slice

The current implementation slices are:

```text
file metadata schema + internal storage abstraction + metadata lifecycle/audit foundation,
self-only payment QR linkage through purpose-specific payment-details endpoints,
settlement-scoped counterparty payment QR content reads,
plus settlement payment proof linkage through purpose-specific settlement endpoints
```

Those slices add the `file_objects` schema, constrained purpose/status/encryption metadata, provider-neutral internal storage interfaces, local provider object-key/path-safety/read-write-delete behavior, a metadata-only lifecycle service, bounded file lifecycle audit events, nullable `user_payment_profiles.qr_file_object_id`, self QR attach/remove/content-read endpoints, settlement-scoped counterparty QR content reads, safe QR metadata in payment-details responses, purpose-specific settlement proof attach/list/content-read/remove endpoints, safe proof metadata responses, OpenAPI paths, generated client methods, and focused tests. They do not add generic public file endpoints, receipt upload, statement upload, UI behavior, OCR worker file processing, physical purge/delete orchestration, or broader subject associations.

Next implementation candidates should remain separate:

- Add subject association tables for purpose-specific file workflows.
- Add authorized generic file read/download behavior only after subject-specific authorization and safe response shaping are reviewed.
- Add additional relationship-backed counterparty payment QR reads only after settlement, payment request, or equivalent relationship proof exists for that new flow.
