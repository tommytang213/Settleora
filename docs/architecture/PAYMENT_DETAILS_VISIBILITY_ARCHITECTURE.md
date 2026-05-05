# Payment Details Visibility Architecture

## Purpose

This document defines Settleora's Day 1 architecture direction for user payment details and payment-profile visibility before implementation.

Payment details are sensitive application data. They can identify how a settlement counterparty should pay a user, may include personal identifiers, may later reference QR/payment images, and must interact safely with storage authorization, privacy-vault direction, audit, API contracts, generated clients, and future UI behavior.

This is a design gate only. It does not authorize implementation code, migrations, OpenAPI changes, generated client changes, UI behavior, storage/file metadata work, or settlement/payment-request behavior.

## Current State

- `UserProfile` currently stores app-domain profile basics only: display name, optional default currency, timestamps, and soft-delete direction.
- Guarded self-profile endpoints exist for the authenticated actor at `GET /api/v1/users/me/profile` and `PATCH /api/v1/users/me/profile`.
- The self-profile endpoints currently read/update safe profile fields only: display name and default currency.
- The self-profile endpoints derive the actor server-side through the auth/current-actor boundary and do not accept client-submitted profile IDs.
- Existing group foundation and group member management endpoints use server-side business authorization for group access, but expenses, bills, settlements, payment requests, and settlement-counterparty records do not exist yet.
- No payment details schema exists.
- No payment details endpoints exist.
- No payment details OpenAPI contract or generated client surface exists.
- No payment details UI behavior exists.
- No QR/payment image upload, file metadata schema, or storage authorization surface exists.
- No privacy-vault integration exists for payment details.
- No settlement-counterparty lookup exists.

The current scaffold explicitly treats payment details and payment QR storage as not implemented yet.

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
qr_file_id nullable
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
- `qr_file_id` should reference future storage/file metadata by stable file ID, not a filesystem path or object-store key.
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
- Counterparty reads must require server-side proof of an authorized relationship.
- Counterparty responses must be shaped separately from self responses so sensitive owner-only metadata is not leaked.
- Authorization checks should live behind an API/domain service boundary or the existing business authorization boundary, not inline client logic.
- Denied, missing, deleted, and not-visible states should avoid revealing whether unrelated users have payment details unless a later policy explicitly approves that distinction.

Before settlement records exist:

- Self read/update is safe as the first implementation slice.
- A counterparty read endpoint should not be implemented until settlement/payment-request visibility rules can be enforced against actual settlement, payment-request, bill, or group participation records.
- If a counterparty read endpoint is implemented before full settlement records exist, it must be narrowly scoped to existing authorized group, bill, or settlement relationships that the API can prove at request time. It must not rely on user search, display names, hidden UI, or client-submitted relationship claims.

## Storage And QR/Payment Image Boundaries

QR/payment images are sensitive file data.

Storage rules:

- File bytes must go through the storage abstraction.
- File metadata belongs in PostgreSQL.
- API responses expose stable file IDs only.
- API responses must not expose direct filesystem paths, object-store keys, buckets, provider internals, or storage implementation details.
- Reads and writes require API authorization.
- The payment details row should reference storage metadata through `qr_file_id` or equivalent stable file identifier.
- QR/payment image lifecycle should support attach, replace, remove/archive, and future retention rules without hard-coding provider paths in payment-profile data.

QR/payment image upload can be a later implementation slice if storage abstraction or file metadata foundations are not ready. The first payment-details API slice can support text fields and visibility while leaving `qr_file_id` null until storage/file metadata work is reviewed.

QR/payment image download/display should be a separate authorized file read path, not an embedded raw file blob in ordinary payment-detail responses.

## Privacy Vault Interaction

Payment handles, notes, and QR/payment images are sensitive personal/payment data.

They are eligible for Standard Secure Mode protection and future Recoverable Private Vault protection:

- Standard Secure Mode can protect Day 1 payment details with normal server-side controls, encrypted-at-rest deployment/storage guidance, API authorization, redacted admin UI, and audit.
- Recoverable Private Vault should remain a future-compatible direction for selected sensitive payment fields and files when the vault implementation is ready.
- Schema and API design should not block future `server_managed`, `recoverable_user_vault`, or `strict_user_vault_future` encryption-mode metadata.
- Core financial truth, settlement states, authorization, audit, group membership, and payment relationship decisions remain API/domain-authoritative even when selected payment-detail content is vault-protected.
- Vault protection must not make clients authoritative for who can view payment details.

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
payment_details.qr_removed
payment_details.deleted_or_archived
payment_details.viewed_by_counterparty
```

Audit records should identify the actor, subject payment profile or owner profile, action, outcome, timestamp, correlation ID, and bounded reason/category where useful.

Audit metadata must not include:

- Full payment handles.
- Full payment notes.
- QR image contents.
- Raw file bytes.
- Storage paths.
- Object-store keys.
- Provider internals.
- Raw tokens.
- Password material.
- Vault keys or key envelopes.
- Secret-provider details.
- Unbounded request bodies.

Self-read auditing can be policy-controlled. Counterparty reads may require audit when payment-profile exposure becomes part of settlement workflows. Admin or support access, if ever designed, must be separate, redacted by default, and auditable.

## API And OpenAPI Direction

This branch does not modify OpenAPI. Future implementation should expose payment details through reviewed `/api/v1` contracts and then regenerate clients.

Likely future endpoint direction:

```text
GET /api/v1/users/me/payment-details
PUT /api/v1/users/me/payment-details
PATCH /api/v1/users/me/payment-details
DELETE /api/v1/users/me/payment-details
```

The delete endpoint may be archive-style rather than destructive delete, depending on audit and settlement-history needs.

Future counterparty direction:

```text
GET /api/v1/settlements/{settlementId}/counterparties/{userProfileId}/payment-details
GET /api/v1/payment-requests/{paymentRequestId}/counterparty-payment-details
```

Exact counterparty paths should wait for settlement/payment-request design. The important rule is that counterparty reads must be anchored to a concrete authorized settlement, payment request, bill, or group-payment relationship, not a global user lookup.

Safe response principles:

- Self endpoints can return the owner's own payment details, including owner-editable fields and current visibility.
- Counterparty endpoints must return only fields permitted by the resolved visibility policy and relationship context.
- QR/payment image response fields should expose stable file references only, not storage paths.
- Responses must not expose auth account IDs, session IDs, token material, credential state, audit internals, storage internals, vault internals, or unrelated users.
- Nullable fields should be represented clearly so clients can distinguish "not configured" from a missing response due to authorization failure only where the API contract intentionally allows that distinction.

Suggested self response shape, for future review:

```text
id
preferred_method_label
payment_handle
payment_note
visibility
qr_file_id
updated_at_utc
```

Suggested counterparty response shape, for future review:

```text
user_profile_id
display_name
preferred_method_label
payment_handle
payment_note
qr_file_id
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

## Admin And Support Boundaries

System owner/admin roles are operational roles, not blanket access to user payment details.

Day 1 design should not include broad admin viewing of full payment handles, notes, or QR/payment images. Admin/support surfaces, if added later, should prefer redacted metadata such as configured/not configured state, file size, content type, lifecycle state, and policy status, and must require a separate reviewed break-glass or support policy before exposing content.

Break-glass access is not authorized by this document.

## Non-goals

This design branch does not authorize:

- Implementation code.
- Migrations.
- OpenAPI changes.
- Generated client changes.
- UI behavior.
- QR/payment image upload implementation.
- Storage/file metadata implementation.
- Settlement/payment-request implementation.
- Counterparty payment-detail read endpoints.
- Broad admin viewing of user payment details.
- Public or global payment-detail directory.
- General registration, invitations, friends, expenses, bills, OCR, notifications, or worker behavior.
- Privacy-vault runtime implementation.
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
counterparty reads wait for enforceable relationship records
audit event names and metadata boundaries are defined
future vault protection is not blocked
OpenAPI/generated clients are updated only in implementation branches
```

## Next Implementation Candidate

Add payment details schema plus self read/update API foundation:

- Create a separate payment-profile/payment-details table for one default active payment profile per user profile.
- Add authenticated self read/update endpoints.
- Default visibility to `settlement_counterparties_only`.
- Keep QR/payment image upload out of scope unless storage/file metadata foundations are ready.
- Keep counterparty visibility endpoints out of scope until settlement/payment-request or equivalent relationship records exist.
- Update OpenAPI and regenerate clients only in that implementation branch.
