# Payment Details Visibility Architecture

## Purpose

This document defines Settleora's Day 1 architecture direction for user payment details and payment-profile visibility, and records the current self-profile, payment QR, and settlement-scoped counterparty implementation slices.

Payment details are sensitive application data. They can identify how a settlement counterparty should pay a user, may include personal identifiers, may later reference QR/payment images, and must interact safely with storage authorization, privacy-vault direction, audit, API contracts, generated clients, and future UI behavior.

This document began as a design gate. The current repository now includes the explicitly scoped self payment-details schema/API/OpenAPI/client foundation, the file metadata/storage foundation, self payment QR linkage, and settlement-scoped counterparty payment-details plus QR content reads described below. UI behavior, admin/support payment-detail viewing, generic file APIs, and non-settlement/global lookup behavior still require separate reviewed slices.

## Current State

- `UserProfile` currently stores app-domain profile basics only: display name, optional default currency, timestamps, and soft-delete direction.
- `UserPaymentProfile` now stores the authenticated user's one active default payment profile in the separate `user_payment_profiles` table.
- `user_payment_profiles` stores `preferred_method_label`, `payment_handle`, `payment_note`, constrained `visibility`, nullable `qr_file_object_id`, timestamps, and `deleted_at_utc`.
- The active payment-profile model enforces one active row per `UserProfile` with a filtered unique index where `deleted_at_utc IS NULL`.
- Nullable payment text fields are bounded and are constrained against blank or whitespace-only persisted values.
- Payment visibility is constrained to `private`, `settlement_counterparties_only`, and `group_members_when_shared`, with default app behavior of `settlement_counterparties_only`.
- Guarded self-profile endpoints exist for the authenticated actor at `GET /api/v1/users/me/profile` and `PATCH /api/v1/users/me/profile`.
- The self-profile endpoints currently read/update safe profile fields only: display name and default currency.
- The self-profile endpoints derive the actor server-side through the auth/current-actor boundary and do not accept client-submitted profile IDs.
- Guarded self payment-details endpoints now exist at `GET /api/v1/users/me/payment-details` and `PATCH /api/v1/users/me/payment-details`.
- Self payment-details endpoints require `Settleora.AuthenticatedUser`, derive the actor through `ICurrentActorAccessor`, and call the server-side business authorization boundary before reading or mutating the active actor profile's payment details.
- `GET /api/v1/users/me/payment-details` returns a stable unconfigured object with `isConfigured=false` and default visibility when no active payment profile exists yet.
- `PATCH /api/v1/users/me/payment-details` supports create-or-update for the current actor only, trims nullable text, normalizes whitespace-only text to null, preserves omitted fields on update, and defaults visibility on create when omitted.
- Successful payment-details create/update/visibility-change writes bounded safe `auth_audit_events` actions `payment_details.created`, `payment_details.updated`, and `payment_details.visibility_changed`.
- Payment-details audit metadata is limited to workflow/category IDs, row-created state, field categories, payment profile ID, and visibility categories. It must not contain payment handles, payment notes, preferred method values, request bodies, tokens, storage paths, or vault internals.
- The `file_objects` metadata foundation exists with purpose `payment_qr`, owner/creator profile references, lifecycle status, content metadata, provider-internal object key, encryption mode, optional vault metadata, timestamps, and soft-delete direction.
- The internal local file-object storage provider exists for server-generated object keys and local read/write/delete operations under the configured storage root.
- The internal metadata-only file lifecycle service exists for pending, active, upload-failed, deleted, and purged metadata transitions, with bounded `file.upload_started`, `file.upload_completed`, `file.upload_failed`, `file.deleted`, and `file.purged` audit events.
- Existing group, bill, and settlement request/payment endpoints use server-side authorization to prove concrete relationships before payment-details exposure.
- Settlement-scoped counterparty payment-details reads now exist at `GET /api/v1/settlements/{settlementId}/counterparties/{userProfileId}/payment-details`.
- Settlement-scoped counterparty payment QR content reads now exist at `GET /api/v1/settlements/{settlementId}/counterparties/{userProfileId}/payment-details/qr/content`.
- Counterparty reads require an authenticated actor, a visible settlement relationship between the actor and target profile, payment-profile visibility that allows the relationship, active target profile/auth account state, and safe QR file purpose/lifecycle/ownership checks where QR content is requested.
- Payment-details OpenAPI contract and generated web/Dart client surfaces exist for authenticated self read/update, self payment QR attach/remove/content-read, and settlement-scoped counterparty payment-details/QR reads.
- No payment details UI behavior exists.
- Payment details do not store storage paths, provider URLs, object keys, original filenames, or vault references.
- No generic public file upload/download endpoint exists.
- No privacy-vault integration exists for payment details.

The current implementation explicitly treats payment details as settlement-scoped when exposed to counterparties. It does not authorize global user/profile lookup, broad group-directory lookup, admin payment-detail viewing, admin QR reads, generic file APIs, UI behavior, or vault runtime encryption.

## Day 1 Product Goal

Day 1 users should be able to configure optional payment details so authorized settlement counterparties know how to pay them.

Supported Day 1 payment detail concepts:

- Preferred payment method note.
- Optional payment handle or identifier, such as FPS, PayMe, Wise, Revolut, Venmo, a bank label, or a user-entered payment note.
- Optional payment note for user-entered instructions that do not fit a handle field.
- Optional QR/payment image attachment through the storage abstraction.
- Visibility setting controlling who may read the payment profile.

The default visibility is:

```text
settlement_counterparties_only
```

Payment details must not be globally visible. They are not a public directory, social profile, admin support shortcut, or group member list field.

## Domain Shape

Payment details should remain app-domain profile data, not authentication identity data.

- Authentication accounts prove sign-in.
- `UserProfile` represents the app-domain person used by groups, expenses, settlements, preferences, and collaboration records.
- Payment details belong to the app-domain profile side and must be accessed through authenticated, server-authorized API behavior.
- Raw credential, token, password, passkey, MFA, provider-token, recovery-token, or secret material does not belong in payment details.

Payment details should not be dumped into `user_profiles` blindly. A separate table keeps sensitive payment-profile lifecycle, visibility, audit, QR/file linkage, future vault metadata, and possible future multi-method expansion from making the base profile table too broad.

Suggested table name options:

```text
user_payment_profiles
user_payment_details
```

Prefer `user_payment_profiles` if the implementation treats the row as the user's default payment profile for counterparties. Prefer `user_payment_details` if the implementation wants a narrower field-container name. Either name should be chosen in the implementation branch and kept boring and explicit.

## Data Model Direction

Day 1 should start with one default payment profile per `UserProfile` unless a later reviewed branch proves multiple payment methods are required immediately.

Suggested fields:

```text
id
user_profile_id
preferred_method_label nullable
payment_handle nullable
payment_note nullable
visibility
qr_file_object_id nullable
created_at_utc
updated_at_utc
deleted_at_utc nullable
```

Implementation notes:

- `id` should be a stable server-generated identifier.
- `user_profile_id` should reference the owning `user_profiles` row.
- Day 1 should enforce at most one active payment profile per user profile if using the one-default-profile model.
- `preferred_method_label` is a display label such as `FPS`, `PayMe`, `Wise`, `Revolut`, `Venmo`, `Bank transfer`, or a user-entered label.
- `payment_handle` is an optional identifier such as a phone-linked payment handle, username, bank reference label, or similar user-entered value.
- `payment_note` is optional free text for payment instructions that do not fit the label or handle.
- `visibility` should be a constrained value with secure default behavior.
- `qr_file_object_id` references storage/file metadata by stable file ID, not a filesystem path or object-store key.
- `qr_file_object_id` should be nullable so text-only payment details remain valid.
- `qr_file_object_id` should reference only `file_objects.id` rows with purpose `payment_qr`.
- The payment-profile to file-object foreign key should use restrict delete behavior so file metadata cannot disappear while a payment profile references it.
- The initial self QR slice should require the linked file's owner and creator profile IDs to match the current authenticated actor.
- Failed or quarantined QR uploads should not be linked from the payment profile; ordinary self reads should reference only active QR metadata when linkage exists.
- `deleted_at_utc` should support archive/soft-delete behavior so payment-profile history can remain available for audit and settlement history rules where needed.
- If optimistic concurrency is added to profile endpoints later, payment details should participate through a dedicated version field or common concurrency pattern in that implementation branch.

Multiple payment methods should remain future work unless a specific Day 1 implementation task expands scope. Future expansion can add one-to-many payment methods, priority/default flags, country/currency hints, method-specific structured fields, and per-settlement selection without breaking the one-default-profile API if the response is shaped conservatively.

## Visibility Values

Minimum visibility values:

```text
private
settlement_counterparties_only
group_members_when_shared
```

### `private`

Only the owning authenticated user can read or update the payment profile.

This is the safest explicit user choice. It may be useful for users who want to save payment details for themselves before sharing, or who want QR/payment image storage without counterparty exposure.

### `settlement_counterparties_only`

Authorized settlement counterparties may read visibility-scoped fields only when the API can prove a settlement, payment request, or equivalent payment relationship connects the actor and the payment-profile owner.

This is the Day 1 default because the Day 1 product goal is to help counterparties pay each other without creating a global payment directory.

### `group_members_when_shared`

Authorized group members may read visibility-scoped fields only when there is an explicit group, bill, settlement, payment-request, or sharing context that makes the profile owner relevant to the actor.

This value is intentionally not "all group members everywhere." A group membership alone should not automatically expose payment details outside a concrete shared-payment context unless a later reviewed policy chooses that behavior and audits it.

## Visibility And Authorization Rules

Payment details must be API-enforced. Clients may show or hide controls for usability, but UI state, generated client availability, cached group membership, route visibility, or possession of a `UserProfile` ID is not authorization.

Required rules:

- Self read/update is allowed for the authenticated owner after the current actor resolves to the owning active `UserProfile`.
- Payment details must never be anonymous.
- Payment details must never be globally visible.
- System owner/admin role must not imply broad payment-detail viewing by default.
- Accepted friend status alone must never authorize payment-detail reads, QR/payment-file reads, settlement-proof-file reads, receipt/supporting-attachment reads, file-byte reads, storage metadata reads, provider URL reads, vault/internal reads, or raw payment identifier reads.
- Group membership alone must not expose payment details unless a concrete payment, settlement, bill, or reviewed group-payment context requires that exposure and the actor is authorized for that context.
- Direct-share selection or eligibility alone must not expose payment details unless API/domain authorization proves the actor is an eligible counterparty for a concrete settlement or payment action.
- Day 1 QR attach/replace/remove should be self-only: the authenticated actor is derived server-side, the profile authorization boundary must approve the actor's own profile, and the file owner/creator must match that actor.
- A linked QR file must have purpose `payment_qr`; generic file objects, receipt images, statement uploads, settlement proofs, OCR source files, exports, and supporting attachments must not be attachable to payment details.
- QR files must not become readable by group members merely because the owner and actor share a group.
- Counterparty reads must require server-side proof of an authorized relationship.
- Current settlement-scoped counterparty reads require relationship-backed authorization before details or QR content can be exposed; any future payment-request, group-payment, or other counterparty QR read must prove an equivalent concrete relationship before opening file bytes.
- Counterparty responses must be shaped separately from self responses so sensitive owner-only metadata is not leaked.
- Authorization checks should live behind an API/domain service boundary or the existing business authorization boundary, not inline client logic.
- Denied, missing, deleted, and not-visible states should avoid revealing whether unrelated users have payment details unless a later policy explicitly approves that distinction.

Current counterparty implementation rule:

- Counterparty read endpoints are scoped to existing authorized settlement relationships that the API proves at request time. They must not rely on user search, display names, hidden UI, generated client method availability, group membership alone, or client-submitted relationship claims.

## Planning Visibility States

Future runtime may use different internal names, but payment-detail work should be planned against these visibility states until a future OpenAPI/runtime task defines canonical contract fields. These are planning vocabulary only and are not approved OpenAPI enum values, runtime problem codes, or generated-client types.

| State | Planning meaning |
|---|---|
| `hidden_not_applicable` | No payment-detail surface should be shown because the workflow does not need payment details or the actor has no relevant payment context. |
| `eligible_summary_only` | The actor may see a bounded non-sensitive summary, such as that payment details may be available after a settlement action, but no handle, note, QR metadata, file metadata, or file bytes. |
| `payment_context_pending` | A concrete bill, settlement, or payment workflow exists but is not yet in a state that allows payment-detail exposure, for example pending acceptance, payer confirmation, or settlement creation. |
| `payment_detail_visible` | Text payment details are visible because API/domain authorization proved a concrete eligible counterparty context and the owner's visibility setting permits the read. |
| `proof_file_visible` | Settlement proof metadata or bytes are visible only through the settlement/payment proof authorization path, not through payment-detail visibility itself. |
| `denied` | The actor is not authorized, and the response must avoid confirming whether the payment detail, payment profile, target user, relationship, settlement proof, or file exists. |
| `redacted` | A support, admin, audit, notification, or summary surface may show bounded non-sensitive metadata while hiding raw payment handles, notes, QR content, file bytes, object keys, provider URLs, and vault internals. |
| `expired_revoked` | A previously valid payment detail, QR file, proof file, share, claim, link, relationship, or signed access path is no longer valid and must fail closed. |
| `historical_reference_only` | Historical financial or audit records may retain bounded references needed for accounting, support, idempotency, or provenance without exposing current payment-detail contents or file bytes. |

UI, generated clients, and cached state must render server-provided visibility safely. They must not derive a more permissive state from friend status, group membership, routes, deep links, stale cache rows, or local-only visibility assumptions.

## Counterparty And Context Proof

Future runtime must prove both relationship eligibility and concrete payment context before showing payment details to anyone other than the owner.

Required contextual proofs:

- The actor is authenticated, active, and resolved through the current-actor boundary.
- The target payment-profile owner is active enough for the requested workflow and is the intended payee, payer, participant, settlement counterparty, or reviewed payment-action counterparty for the relevant record.
- The relationship path is valid for that workflow: accepted friend where applicable, approved group/shared context where applicable, or another future reviewed context that explicitly authorizes the payment action.
- The actor is a participant, payer, payee, creditor, debtor, settlement request party, settlement payment party, or otherwise reviewed eligible counterparty for the concrete bill, settlement, payment request, or payment action.
- The settlement, payment, bill, revision, request line, payment allocation, residual, or related state allows payment-detail visibility at read time.
- The bill, revision, settlement, payment, or payment-detail source is not stale, revoked, blocked, deleted, unauthorized, archived-only, hidden by policy, or superseded in a way that should fail closed.
- Storage/file authorization passes independently before any QR content, proof file, receipt/supporting attachment, file metadata, or file bytes are returned.

Future runtime must explicitly deny:

- unrelated users;
- blocked users;
- unfriended users where a historical policy does not preserve a bounded read for a concrete old record;
- pending, declined, cancelled, stale, archived-reference, or historical-only friend relationships;
- stale cached friend or group rows;
- route-derived, deep-link-derived, hidden-control-derived, UI-derived, or generated-client-derived access;
- possession of a user profile ID, payment profile ID, file ID, settlement ID, group ID, bill ID, payment ID, or claim token without server-side authorization;
- direct-share selection that has not produced a concrete authorized payment or settlement context;
- group membership without bill, payment, settlement, or reviewed group-payment context authority.

## QR, Content, And File Boundaries

Payment QR content, payment-account identifiers, proof files, receipt/supporting attachments, OCR-derived file references, and file bytes must be served only through purpose-specific API authorization checks.

Boundary rules:

- Text payment details and QR/payment file metadata must be returned only from payment-detail APIs after profile/payment-context authorization.
- QR/payment image bytes must be returned only from dedicated content endpoints after both payment-detail authorization and file-purpose/lifecycle/ownership checks pass.
- Settlement proof metadata and bytes must be returned only from settlement/payment proof APIs after settlement/payment authorization and file-purpose/lifecycle checks pass.
- Receipt and supporting attachment metadata and bytes must be returned only from bill/group attachment APIs after bill/group/participant authorization and file-purpose/lifecycle checks pass.
- A file ID, stable payment profile ID, payment handle, QR metadata reference, proof attachment ID, or generated client method does not authorize file bytes.
- API responses must not expose storage paths, provider object keys, bucket names, mounted volume paths, temporary local paths, provider URLs, signed URLs where not explicitly authorized, vault internals, file-byte identifiers, storage hashes beyond reviewed safe metadata, or raw object lifecycle internals.
- If a future signed URL flow is reviewed, it must remain short-lived, purpose-specific, auditable, revocable where practical, and never returned as a substitute for authorization.

Audit, logs, telemetry, validation errors, and support/debug surfaces must not dump:

- QR payloads or decoded QR content;
- full raw payment identifiers beyond safe references or redacted suffixes;
- raw OCR text;
- receipt, proof, QR, statement, export, or attachment bytes;
- object keys, storage paths, provider URLs, signed URLs, local paths, bucket names, mount paths, vault internals, data keys, recovery envelopes, tokens, credentials, secrets, or unrelated sensitive content.

## Denial Privacy

Unauthorized payment-detail and file reads must avoid confirming whether sensitive targets exist.

User-facing denial categories should stay broad and safe, for example:

```text
not_available
not_authorized
payment_context_required
expired_or_no_longer_available
policy_block
```

Internal audit and security telemetry may use more specific bounded categories when the actor, subject, and policy allow it, for example:

```text
payment_details.denied_no_context
payment_details.denied_relationship_not_eligible
payment_details.denied_blocked
payment_details.denied_stale_context
payment_details.denied_visibility_private
payment_details.denied_file_authz
payment_details.denied_file_lifecycle
```

User-facing responses must not disclose:

- whether the target user exists;
- whether a friend relationship exists or was blocked;
- whether a payment profile is configured;
- whether a payment handle, QR file, settlement proof, receipt, supporting attachment, storage object, vault record, bill, or settlement exists;
- whether another actor has access;
- whether a file was deleted, quarantined, revoked, expired, or never existed, unless the actor is already authorized for that lifecycle readout.

Support/debug correlation can be preserved through correlation IDs, request IDs, bounded policy categories, actor IDs, subject IDs only where authorized internally, and timestamps. Correlation data must not carry raw payment details, file bytes, storage internals, QR payloads, raw OCR text, tokens, secrets, or unrelated user content.

## Historical Preservation And Revocation

Unfriend, block, relationship expiry, direct-share revocation, payment-profile removal, QR removal, proof removal, bill archive, settlement cancellation, or policy change should stop future exposure by default while preserving financial and audit history.

Historical preservation rules:

- Historical bills, settlement requests, payments, allocations, residuals, proof attachment references, and audit events may keep bounded references needed for accounting, dispute review, support, idempotency, and provenance.
- Historical references must not expose current payment handles, payment notes, QR contents, settlement proof bytes, receipt/supporting attachment bytes, storage object keys, provider URLs, vault internals, or file-byte identifiers beyond the authorized context.
- A user who participated in an old bill or settlement may retain only the visibility that the old record's domain policy still authorizes; that history does not create future friend, group, payment-detail, or file-directory access.
- Unfriend should stop future friend-derived direct sharing and future friend-derived payment context by default. Existing authorized financial records remain governed by bill/settlement/file policies.
- Block should stop future sharing, requests, payment-detail exposure, claim/link flows, comments/messages where applicable, and notification paths where policy requires it, without deleting or rewriting old financial facts.
- Revoked, expired, deleted, quarantined, upload-failed, purged, disabled, archived-reference, or superseded payment detail and file states must fail closed.
- Recoverable Private Vault or future vault-protected content must preserve API/domain authorization. Vault recoverability or local possession must not become proof of payment-detail visibility.

## Storage And QR/Payment Image Boundaries

QR/payment images are sensitive file data.

Storage rules:

- File bytes must go through the storage abstraction.
- File metadata belongs in PostgreSQL.
- API responses expose stable file IDs and safe QR metadata only.
- API responses must not expose direct filesystem paths, object-store keys, buckets, provider internals, or storage implementation details.
- Reads and writes require API authorization.
- The payment details row references storage metadata through nullable `qr_file_object_id`.
- QR/payment image lifecycle should support attach, replace, remove/archive, and future retention rules without hard-coding provider paths in payment-profile data.

QR/payment image upload exists only as the reviewed self payment QR linkage slice. The text payment-details API still manages text fields and visibility; QR bytes move through dedicated self endpoints for owners and settlement-scoped counterparty content reads for authorized counterparties.

QR/payment image download/display should be a separate authorized file read path, not an embedded raw file blob in ordinary payment-detail responses.

## Payment QR File Linkage Foundation

The current implementation is a self-only payment QR linkage foundation that uses the existing file metadata, local storage provider, and lifecycle service without creating a generic file API.

Recommended shape:

- Add nullable `qr_file_object_id` stable file reference to `user_payment_profiles`.
- Link only to `file_objects` rows with purpose `payment_qr`.
- Keep QR attach, replace, remove, and self content read scoped to the authenticated owner.
- Use the file lifecycle service to create pending metadata, finalize active metadata after bytes are stored and validated, mark failed uploads as `upload_failed`, and mark removed or replaced QR files as deleted according to lifecycle policy.
- Keep actual bytes behind the internal file-object storage provider.
- Expose counterparty QR reads only through reviewed settlement-scoped relationship authorization; any broader QR read remains out of scope.

Replace and remove behavior:

- Attach should create or select a new active `payment_qr` file owned and created by the current actor, then set `user_payment_profiles.qr_file_object_id`.
- Replace should attach the new active QR and clear the previous reference by marking the previous QR file deleted or detached according to the reviewed lifecycle policy.
- Remove should clear the payment profile reference and mark the linked file deleted.
- Failed upload should leave no payment profile reference to the failed file.
- Where practical, payment profile linkage changes and file lifecycle transitions should be committed in one database transaction; storage writes remain outside perfect database transactionality and need compensating cleanup on failure.

Implemented self QR endpoints:

```text
POST /api/v1/users/me/payment-details/qr
DELETE /api/v1/users/me/payment-details/qr
GET /api/v1/users/me/payment-details/qr/content
```

A dedicated self QR content endpoint is the safer first shape because the payment-details authorization decision is specific and can stay close to the payment-profile boundary. A future authorized file content endpoint may still be added later, but only if it receives an already-resolved subject/purpose authorization decision and does not become a generic public file server.

The current OpenAPI contract exposes self QR endpoints, settlement-scoped counterparty payment-details/QR reads, and safe QR metadata. Responses must not expose storage paths, object keys, provider URLs, direct local file paths, vault keys, vault references, provider internals, original filenames, thumbnails, or raw QR bytes except from dedicated authorized content endpoints.

There should be no generic public file endpoint for this payment QR slice and no direct storage/provider URL response. Counterparty QR reads must remain relationship-backed and settlement-scoped unless a later reviewed policy adds another concrete relationship model.

## Privacy Vault Interaction

Payment handles, notes, and QR/payment images are sensitive personal/payment data.

They are eligible for Standard Secure Mode protection and future Recoverable Private Vault protection:

- Standard Secure Mode can protect Day 1 payment details with normal server-side controls, encrypted-at-rest deployment/storage guidance, API authorization, redacted admin UI, and audit.
- Recoverable Private Vault should remain a future-compatible direction for selected sensitive payment fields and files when the vault implementation is ready.
- Schema and API design should not block future `server_managed`, `recoverable_user_vault`, or `strict_user_vault_future` encryption-mode metadata.
- Core financial truth, settlement states, authorization, audit, group membership, and payment relationship decisions remain API/domain-authoritative even when selected payment-detail content is vault-protected.
- Vault protection must not make clients authoritative for who can view payment details.
- QR file metadata remains server-authoritative even when future vault protection applies to file bytes or derived content.
- Ordinary payment-details and file responses must not expose vault internals, key references, key envelopes, recovery envelopes, data keys, or provider secrets.

The Day 1 schema can start with normal server-side protection if vault implementation is not ready. It should avoid choices that make later vault migration painful, such as embedding storage paths in profile fields, mixing payment details into auth identity rows, or making payment handles required for settlement correctness.

Raw secrets, raw tokens, passwords, password hashes, passkeys, MFA material, provider tokens, recovery codes, vault keys, key envelopes, and secret-provider details do not belong in payment details.

## Audit

Future implementation should emit bounded audit events for payment-detail lifecycle and sensitive access where policy requires it.

Recommended event names:

```text
payment_details.created
payment_details.updated
payment_details.visibility_changed
payment_details.qr_attached
payment_details.qr_replaced
payment_details.qr_removed
payment_details.deleted_or_archived
payment_details.viewed_by_counterparty
file.upload_started
file.upload_completed
file.upload_failed
file.deleted
```

Audit records should identify the actor, subject payment profile or owner profile, action, outcome, timestamp, correlation ID, and bounded reason/category where useful.

Audit metadata must not include:

- Full payment handles.
- Full payment notes.
- QR image contents.
- Raw file bytes.
- File thumbnails, previews, or derived QR content.
- Storage paths.
- Object-store keys.
- Provider internals.
- Original filenames unless a future policy explicitly approves bounded or redacted filename metadata.
- Request bodies.
- Raw tokens.
- Password material.
- Vault refs.
- Vault keys or key envelopes.
- Secret-provider details.
- Unbounded request bodies.

Self-read auditing can be policy-controlled. Counterparty reads may require audit when payment-profile exposure becomes part of settlement workflows. Admin or support access, if ever designed, must be separate, redacted by default, and auditable.

## API And OpenAPI Direction

The current implementation exposes self payment details, self payment QR, and settlement-scoped counterparty payment-details reads through reviewed `/api/v1` contracts and regenerated clients.

Implemented self endpoint surface:

```text
GET /api/v1/users/me/payment-details
PATCH /api/v1/users/me/payment-details
POST /api/v1/users/me/payment-details/qr
DELETE /api/v1/users/me/payment-details/qr
GET /api/v1/users/me/payment-details/qr/content
```

Future update/delete behavior beyond PATCH may be archive-style rather than destructive delete, depending on audit and settlement-history needs. QR content download starts as a dedicated self endpoint so the API can enforce the profile/payment-details authorization boundary before opening file bytes. A future authorized file content endpoint can be considered later, but only after a subject-specific authorization layer proves the caller may read that purpose and subject.

Implemented settlement-scoped counterparty endpoint surface:

```text
GET /api/v1/settlements/{settlementId}/counterparties/{userProfileId}/payment-details
GET /api/v1/settlements/{settlementId}/counterparties/{userProfileId}/payment-details/qr/content
```

Future payment-request, bill, or group-payment counterparty paths still require separate review. The important rule is that counterparty reads must be anchored to a concrete authorized settlement, payment request, bill, or group-payment relationship, not a global user lookup.

Safe response principles:

- Self endpoints can return the owner's own payment details, including owner-editable fields and current visibility.
- Counterparty endpoints must return only fields permitted by the resolved visibility policy and relationship context.
- QR/payment image response fields should expose stable file references only, not storage paths.
- Responses must not expose auth account IDs, session IDs, token material, credential state, audit internals, storage internals, vault internals, or unrelated users.
- Responses must not expose direct provider URLs or storage object keys.
- Counterparty responses may include safe QR metadata only when the settlement-scoped relationship and QR file checks pass. QR file content remains behind the dedicated settlement-scoped QR content endpoint.
- Nullable fields should be represented clearly so clients can distinguish "not configured" from a missing response due to authorization failure only where the API contract intentionally allows that distinction.

Current self response shape:

```text
is_configured
id
preferred_method_label
payment_handle
payment_note
visibility
qr_file.id
qr_file.content_type
qr_file.size_bytes
qr_file.updated_at_utc
created_at_utc
updated_at_utc
```

Suggested counterparty response shape, for future review:

```text
user_profile_id
display_name
preferred_method_label
payment_handle
payment_note
qr_file_safe_metadata
visibility_applied
```

The counterparty shape should not include owner-only lifecycle metadata unless required for a specific reviewed workflow.

## Validation And Error Direction

Future validation should keep payment details optional but bounded.

Recommended direction:

- Allow all payment-detail fields to be absent/null for users who do not want to configure payment details.
- Trim user-entered labels, handles, and notes.
- Enforce reasonable maximum lengths before persistence.
- Avoid method-specific validation that rejects legitimate local payment systems too early.
- Store user-entered values as data, not trusted commands, URLs, secrets, or verified banking instructions.
- Treat QR/payment image type, size, lifecycle state, and subject association through storage/file metadata policy when that foundation exists.
- Return stable error codes separate from localized display text in future contracts.

Payment QR content validation direction:

- Allow only reviewed image MIME types initially, likely `image/png`, `image/jpeg`, and `image/webp`.
- Consider HEIC/HEIF later only when server-side validation, serving headers, client support, and operational compatibility are reviewed.
- Use a small purpose-specific max file size appropriate for QR images; a starting target around 2 MB is reasonable unless real client capture data proves otherwise.
- Treat filename as display-only metadata, never as object-key, directory, path, or authorization input.
- Validate content type by sniffing magic bytes where practical instead of trusting only client-supplied headers.
- Do not allow SVG for Day 1 unless explicitly reviewed because scriptable/vector image formats carry disproportionate serving and sanitization risk.
- Do not allow PDFs for payment QR unless explicitly reviewed; PDFs belong to separately designed receipt, proof, statement, or supporting-attachment policies.

## Future Validation Plan

Future implementation branches that change payment-detail exposure must choose validation based on changed surface and must not rely on docs-only validation when runtime, contracts, storage, money, schema, or UI changes are present.

Required validation classes:

| Class | Required proof |
|---|---|
| API/domain authorization tests | Prove self-only reads, settlement/payment counterparty reads, friend/group/direct-share non-authority, blocked/unfriended/pending/stale denial, route/generated-client non-authority, and eligible counterparty context checks. |
| Storage/file authorization tests | Prove QR, settlement proof, receipt/supporting attachment, and file-byte reads require purpose-specific API authorization, lifecycle status, ownership/subject checks, and do not expose storage internals. |
| Payment-detail read denial privacy tests | Prove unauthorized actors cannot distinguish missing, unconfigured, private, blocked, expired, revoked, deleted, or unrelated payment profiles/files/users beyond safe categories and correlation IDs. |
| Audit redaction tests | Prove audit/log/telemetry metadata omits raw payment handles, notes, QR payloads, OCR text, file bytes, object keys, signed URLs, local paths, vault internals, tokens, credentials, secrets, and unrelated sensitive content. |
| OpenAPI/generated-client contract tests | Required only when future contract or generated-client files change; prove contract responses expose no storage internals or new authorization implications, then regenerate clients through the canonical command. |
| Money/settlement/bill-context tests | Required when visibility depends on settlement, payment, bill, revision, allocation, residual, confirmation, dispute, cancellation, or payer/payee state; prove state transitions open and close visibility correctly without changing money authority. |
| Mobile/web/admin UI tests | Required only when #434 or a later UI task scopes UI work; prove UI renders server-provided visibility and denial states without inferring authorization from hidden controls, route state, cache, or generated clients. |

Future implementation branches must stop for explicit review before continuing when they would touch:

- auth/session/security runtime or configuration;
- storage/file bytes, file authorization, lifecycle, signed URL, provider, vault, or retention behavior;
- money, settlement, payment, bill, revision, residual, allocation, payer/payee, or calculation authority;
- OpenAPI contracts, generated clients, or generation tooling;
- schema, EF models, migrations, DbContext, or model snapshots;
- mobile, web, admin UI, Figma, reference assets, or product copy that defines user-facing visibility behavior;
- Docker, CI, deployment, release, env, public/admin exposure, secrets, credentials, tokens, SSH, or local Codex/auth state.

If a future task discovers that any of these changes are necessary but not explicitly scoped, it must stop and report rather than silently expanding scope.

## Admin And Support Boundaries

System owner/admin roles are operational roles, not blanket access to user payment details.

Day 1 design should not include broad admin viewing of full payment handles, notes, or QR/payment images. Admin/support surfaces, if added later, should prefer redacted metadata such as configured/not configured state, file size, content type, lifecycle state, and policy status, and must require a separate reviewed break-glass or support policy before exposing content.

Break-glass access is not authorized by this document.

## Non-goals

This design branch does not authorize:

- Implementation code.
- Generic public upload/download endpoints.
- Generic file API.
- UI behavior.
- Global, admin, or directory-style payment-detail reads.
- Counterparty payment-detail or QR reads outside reviewed settlement-scoped relationship authorization.
- Broad admin viewing of user payment details.
- Public or global payment-detail directory.
- Receipt, proof, statement, OCR source, export, or supporting attachment upload implementation.
- OCR worker file processing.
- General registration, invitations, friends, expenses, bills, OCR, notifications, or worker behavior.
- Privacy-vault runtime implementation.
- Vault runtime encryption.
- Secret, token, credential, password, passkey, MFA, or recovery-code storage in payment details.

## Day 1 Acceptance Direction

The payment-details foundation is acceptable when future implementation can prove:

```text
self read/update is authenticated and server-authorized
default visibility is settlement_counterparties_only
payment details are not globally visible
payment handles/notes are bounded sensitive data
QR/payment images use stable file IDs and storage abstraction
API responses do not expose storage paths
counterparty reads require enforceable relationship records
audit event names and metadata boundaries are defined
future vault protection is not blocked
OpenAPI/generated clients include self and settlement-scoped counterparty payment-details surfaces
```

## Current Implementation Slice

```text
payment QR self-linkage foundation plus settlement-scoped counterparty read foundation
```

Included scope:

- Nullable QR file reference on the active self payment profile.
- Self-only QR attach, replace, remove, and content-read endpoints.
- OpenAPI and generated client methods for the self and settlement-scoped counterparty payment-details surfaces.
- Local storage-backed upload through the file lifecycle service.
- Linkage only to active `payment_qr` file objects owned and created by the current actor.
- Counterparty reads are limited to authorized settlement relationships and safe visibility-scoped fields/content.
- Generic file APIs remain out of scope.
