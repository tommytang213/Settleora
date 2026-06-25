# Privacy Vault Architecture

## Purpose

This document defines Settleora's privacy-vault architecture for Day 1 and future privacy hardening.

Settleora must protect sensitive user data without turning the first release into a full zero-knowledge accounting system. The Day 1 goal is to support:

- Standard Secure Mode for most users.
- Recoverable Private Vault for selected sensitive data.
- A future/Day 3+ compatible path to Strict Private Vault.

This document does not authorize implementation by itself. It defines architecture, data classification, policy boundaries, recovery behavior, non-goals, and future implementation candidates.

## Current State

The current repository has Standard Secure server-side protection foundations for auth/session, PostgreSQL persistence, file metadata, local file storage, self payment details, self payment QR files, settlement proof files, bill attachments, and bill-scoped receipt OCR review rows. It does not implement recoverable vault runtime encryption, vault API endpoints, device envelopes, recovery envelopes, vault-aware file byte handling, vault UI, schema migrations for vault tables, or Strict Private Vault.

The existing `file_objects` metadata table already records a constrained `encryption_mode` and optional vault metadata reference, but current runtime behavior remains server-managed. This document narrows the policy and data-classification decisions for #418, the key/envelope/recovery decisions for #419, and the sensitive file/field integration-boundary decisions for #420 so later issues can design audit, backup, warning, and runtime behavior without moving money, authorization, or storage authority to clients.

## Product Decision

Day 1 supports two user-selectable privacy modes where deployment/admin policy allows them:

```text
standard_secure
recoverable_private_vault
```

Future architecture must remain compatible with:

```text
strict_private_vault
```

Privacy mode is controlled by both user preference and deployment/admin policy. Users should be able to choose or change privacy mode only within the limits allowed by the deployment policy.

User preference options:

```text
standard_secure
recoverable_private_vault
strict_private_vault_future
```

Deployment/admin policy options:

```text
disabled
allow_standard_only
allow_recoverable_private_vault
require_recoverable_private_vault_for_sensitive_data
allow_strict_private_vault_future
```

Day 1 should allow users to choose between `standard_secure` and `recoverable_private_vault` when the deployment policy allows recoverable vault use. `strict_private_vault` remains Day 3/future-compatible only unless a later implementation task explicitly approves it.

Day 1 must not require users to manually copy encryption keys between devices. Device onboarding should use trusted-device approval, recovery flow, or server-assisted rewrap depending on privacy mode.

## Privacy Mode Summary

| Mode | Day 1 | Recoverable | Host-resistant | Intended users |
|---|---:|---:|---:|---|
| `standard_secure` | Yes | Yes | No | Most users |
| `recoverable_private_vault` | Yes | Yes | Partial, not strict | Users who want stronger privacy without unrecoverable data loss |
| `strict_private_vault` | Day 3/future | No unless recovery key/trusted device exists | Stronger | Advanced users who accept key-loss risk |

### Standard Secure Mode

Standard Secure Mode is the default user-selectable Day 1 mode.

Characteristics:

- Server-managed encryption at rest.
- Admin-private app authorization.
- API-controlled file access.
- Encrypted deployment/storage/backups guidance.
- Server operator remains trusted at infrastructure level.
- Account recovery restores normal server-mode data access.

### Recoverable Private Vault

Recoverable Private Vault is a user-selectable Day 1 mode, subject to deployment/admin policy. It protects selected sensitive data while still allowing account-recovery-based vault recovery through controlled server-assisted recovery.

Characteristics:

- Selected sensitive fields/files are encrypted using user-vault/key-envelope architecture.
- App admins cannot view vault content through normal admin UI.
- Server-side recovery envelopes can recover or rewrap vault keys after strong account verification.
- This is not strict zero-knowledge. The recovery system is a trusted recovery path.
- Recommended for users who want stronger privacy but cannot risk permanent data loss.

### Strict Private Vault Future Mode

Strict Private Vault is Day 3/future-only. It is included so Day 1 architecture, data classification, envelope storage, audit categories, and backup warnings do not block a later strict mode, but it is not Day 1 runtime scope.

Characteristics:

- Server recovery envelope is removed or disabled.
- Vault access requires trusted devices or a user-held recovery key.
- If all trusted devices and recovery keys are lost, strict-vault data is unrecoverable.
- OIDC/local account recovery restores account access only, not vault data.
- Converting Recoverable to Strict must rotate/revoke recovery envelopes and warn about old backups.

## Data Classification Model

Settleora uses three data classes for recoverable vault policy:

```text
normal
sensitive
highly_sensitive
```

### Normal Data

Normal data is server-managed application data that still requires authentication, authorization, encrypted-at-rest deployment, and audit where policy requires it. It is not public data. Normal data normally stays `server_managed` because the API/domain layer needs it to enforce server-mode truth.

Normal server-managed data includes the core data the API needs for authoritative server-mode behavior:

- bill totals
- currency
- split shares
- settlement state
- payer/payee relationships
- group membership
- sync state
- business audit metadata
- report summary values
- notification routing state
- recurrence schedules and generated occurrence links
- non-sensitive readiness and policy metadata

Normal data can include personal or business context when the server must read it to authorize, calculate, settle, sync, audit, or report. A later implementation may redact normal data in admin surfaces, but it must not place core authority behind client-only vault access.

### Sensitive Data

Sensitive data should be admin-redacted by default and is generally eligible for Recoverable Private Vault protection when vault support exists:

- receipt images
- receipt thumbnails where practical
- payment QR images
- payment handle/details
- settlement proof files
- private notes
- full OCR raw text if stored
- supporting attachments
- statement import source files before reconciliation implementation chooses final policy
- user-entered attachment filenames when they reveal private context
- user-provided free-text fields that are not required for shared accounting truth
- other non-shared sensitive personal or financial data

Data related to money or personal information that is not shared should generally be eligible for vault protection.

### Highly Sensitive Data

Highly sensitive data should default to the strongest available policy and must receive explicit review before being stored, exported, logged, or shown in admin/support surfaces:

- statement files/rows when statement reconciliation exists
- exported backup bundles
- recovery envelopes and key metadata
- secret references
- payment proof containing bank/account details
- recovery-key metadata
- migration records that mention envelope revocation or key rewrap outcomes
- vault-protected export manifests

Highly sensitive does not automatically mean recoverable-vault content. Some highly sensitive items, such as recovery envelopes and secret references, are vault control material and must not be stored as ordinary recoverable vault payloads.

## Recoverable Vault Eligibility

Recoverable Private Vault may protect selected sensitive field values, file bytes, and derived sensitive content only when the API can still enforce ownership, subject association, file purpose, lifecycle state, authorization, audit, retention, and recovery policy from server-readable metadata.

Eligible Day 1 recoverable-vault targets:

| Data class | Examples | Policy direction |
| --- | --- | --- |
| Sensitive payment profile content | Payment handle, payment note, preferred payment method detail, QR/payment images | Eligible for `recoverable_user_vault`; self updates and counterparty visibility remain API-authorized. |
| Sensitive bill/receipt files | Receipt images, receipt thumbnails where practical, supporting attachments | Eligible when participant access is preserved through server-readable subject metadata and participant envelopes. |
| OCR-sensitive derivatives | Full OCR raw text if stored, OCR source files | Eligible; reviewed OCR line items used for draft bill creation remain provisional and API-validated before becoming bill truth. |
| Settlement proof content | Proof screenshots, PDFs, payment confirmation attachments, proof notes that may contain account details | Eligible; settlement/payment relationship authorization remains server-enforced. |
| Private notes and personal-only fields | User notes that are not required for shared bill truth, local-only import notes during migration | Eligible when the server does not need plaintext for money, settlement, sync acceptance, or audit truth. |
| Statement and reconciliation sources | Future statement files, raw imported rows, provider-specific account labels | Highly sensitive and eligible only after #420 or a later statement-specific review defines owner, subject, retention, audit, and reporting boundaries. |
| User-owned export files | Future generated export files containing sensitive personal/financial data | Highly sensitive and eligible only after export/backup policy defines retention, warning, and restore behavior. |

Eligibility does not approve runtime implementation. Each future implementation slice must define the exact owner, subject, API authorization rule, storage purpose, metadata shape, envelope model, audit metadata, retention behavior, validation profile, and migration/backfill plan.

## Must Not Be Stored As Recoverable Vault Payload

The following data classes must not be stored only in recoverable vault form because doing so would break server authority, recovery safety, or auditability:

- Bill totals, currencies, item split resolved amounts, participant shares, payer contributions, adjustments, settlement request amounts, settlement payment amounts, residual amounts, and any other authoritative money values.
- Settlement request/payment status, bill status, participant acknowledgement state, archive/restore state, recurrence occurrence state, sync state, and conflict state.
- Group membership, product role assignments, account/profile linkage, business authorization facts, and visibility policy state.
- Auth credentials and reusable secrets, including plaintext passwords, password verifier material, raw session credentials, raw refresh credentials, reset tokens, recovery codes, MFA secrets, passkey private material, OIDC provider tokens, signing keys, pepper secrets, secret-provider values, and SSH or deployment secrets.
- Audit records required to investigate money, authorization, storage access, security, recovery, privacy-mode changes, or policy changes.
- File metadata needed for API authorization and lifecycle, including stable file ID, owner/creator profile IDs, purpose, status, content type, size, safe hash where policy allows it, storage provider category, provider-internal object key, retention policy, and timestamps. Provider-internal object keys remain server-private and must not be exposed through APIs or reports.
- Key control material as ordinary user content, including vault root keys, raw data keys, raw device private keys, raw recovery keys, raw recovery-envelope secrets, and decrypted key material.
- Database migration metadata, OpenAPI contracts, generated-client source, Docker/CI/deployment configuration, and environment/secret files.

Vault protection may encrypt file bytes or selected field values, but it must not make clients authoritative for deciding who may read them, whether they exist, how they relate to a bill/settlement/profile, or whether they can be restored.

## Encryption Modes

Suggested encryption modes:

```text
server_managed
recoverable_user_vault
strict_user_vault_future
```

### `server_managed`

The server/storage layer manages encryption at rest and can process plaintext at runtime. This supports normal application behavior, reports, server-side validation, search, sync, and settlements.

### `recoverable_user_vault`

Sensitive data is encrypted with client/vault-aware key wrapping, while the server stores a controlled recovery envelope. The server should not expose the content through admin UI, logs, exports, or support screens. Recovery is possible after account verification and audit.

### `strict_user_vault_future`

Sensitive data is encrypted so the server has no recovery envelope. Access requires trusted-device key material or a user recovery key. This is future architecture only.

## What Day 1 Vault Protects

Day 1 Recoverable Private Vault should be limited to selected sensitive content:

```text
payment QR images
payment handle/details
settlement proof files
receipt original images
receipt thumbnails where practical
private notes
full OCR raw text if stored
other non-shared sensitive personal or financial data
```

Day 1 Recoverable Private Vault should not protect core financial truth:

```text
bill totals
currencies
merchant summary fields required for reports/search
split shares
settlement states
group membership
audit metadata
sync state
core accounting records
```

The API/domain layer remains authoritative for money, settlement, status transitions, authorization, audit, policy, and server-mode validation.

Shared sensitive files and fields may be vault-protected only where the design preserves authorized access for the intended participants and does not move financial authority to clients.

## Sensitive File And Field Integration Boundaries

This section is the #420 architecture/control packet for recoverable-vault sensitive file and field integration boundaries. It is design-only. It does not approve runtime encryption, storage-provider changes, schema, migrations, OpenAPI, generated-client changes, UI/Figma work, `docs/design/mobile/*` changes, OCR runtime, import/export runtime, backup automation, or file-byte handling changes.

### Boundary Terms

Recoverable-vault integration uses these terms:

| Term | Boundary |
| --- | --- |
| Recoverable-vault payload | Encrypted sensitive file bytes, encrypted selected field values, or encrypted derived content whose plaintext is not required for server-authoritative money, authorization, lifecycle, audit, reconciliation, warning, retention, backup, or policy enforcement. |
| Server-readable metadata | PostgreSQL and safe response/audit metadata the API must read to authorize, locate, lifecycle-manage, warn about, retain, restore, reconcile, or audit content without decrypting vault payload plaintext. |
| Provider-neutral file reference | Stable file or attachment IDs exposed to clients and domain records, such as `fileId`, not physical paths, object keys, bucket names, provider URLs, or storage implementation details. |
| Storage object identifier | Provider-internal object key or equivalent operational reference stored only as server-private metadata. It is not user content and must not appear in public APIs, generated clients, logs, issue comments, support reports, or Codex reports. |
| Encrypted field payload | Ciphertext plus non-secret payload format/version metadata for one selected field or approved field group. It must not carry the only copy of server-authoritative facts. |
| Encrypted file payload | Ciphertext file bytes, thumbnail bytes, preview bytes, or derived-file bytes stored through the storage abstraction and linked by server-readable file metadata. |
| Thumbnails, previews, and derived files | Separate sensitive payloads when they reveal receipt, proof, QR, statement, OCR, payment, or private-note content. They need their own purpose, lifecycle, retention, authorization, and audit policy. |
| OCR text and extracted field candidates | Sensitive derived content. Raw OCR text is eligible for vault protection if stored; reviewed field candidates may be server-readable only where needed for user review, draft apply, validation, warnings, and audit boundaries. |
| Statement/import rows | Highly sensitive reconciliation source content. Raw source rows and account labels are eligible only after statement-specific owner, subject, retention, audit, and reporting boundaries are approved. |
| Payment-profile, QR, and proof fields | Sensitive payment content including payment handles, payment notes, QR images, proof files, and proof notes. Visibility remains API/domain-authorized even when payloads are vault-wrapped. |
| Private notes and sensitive user text | User-entered text that is not required for shared accounting truth. It is eligible for vault protection when search, report, audit, warning, retention, reconciliation, and policy requirements do not need plaintext. |

### File Storage Interaction

Vault wrapping changes content encryption; it does not replace Settleora's storage or metadata model:

- File bytes still go through the API-owned storage abstraction for receipt images, supporting attachments, payment QR images, settlement proof files, thumbnails/previews, OCR source files, statement/import files, exports, and future derived files.
- File metadata still belongs in PostgreSQL, including stable file ID, owner, creator, purpose, status, content type, size, safe hash where policy allows it, subject association, lifecycle timestamps, retention policy, encryption mode, and safe vault/envelope status metadata.
- API authorization remains required for every file read, write, attach, detach, replace, archive, restore, delete, purge, export, import, recovery, and rewrap action.
- API responses must expose stable IDs and safe metadata only. They must not expose filesystem paths, mounted paths, object keys, bucket names, provider URLs, provider diagnostics, storage roots, envelope internals, raw ciphertext internals, vault key references that function as secrets, recovery material, or vault key material.
- Vault encryption must not bypass API authorization, file purpose constraints, subject association checks, metadata lifecycle rules, retention policy, audit requirements, or backup/restore consistency checks.
- Possessing a file ID, storage object identifier, envelope ID, generated-client method, cached local file row, or local vault/cache state is never authorization.
- Workers may process sensitive files only through reviewed job payloads and API/domain validation. Workers must not receive provider internals or mutate file metadata, vault metadata, auth rows, or core business tables directly.

Provider-neutral file references may be visible to clients only as stable application identifiers. Storage object identifiers remain server-private operational metadata even if the encrypted file payload is unreadable to the server.

### Field-level Vault Interaction

Candidate recoverable-vault field payloads are selected fields whose plaintext is not required for server-authoritative operation:

- payment profile free-text content such as payment handle, payment method detail, and payment note, where counterparty visibility can still be decided from server-readable policy and relationship metadata.
- private notes on bills, settlements, profiles, imports, or attachments when they are not needed for shared accounting truth, report/search truth, reconciliation, warnings, retention, or audit evidence.
- proof notes or payment references that may contain bank/account details when the settlement/payment relationship and lifecycle facts remain server-readable.
- full OCR raw text if a future OCR/privacy task stores it; OCR review candidates used for draft apply may remain bounded server-readable provisional data only where the API must validate or present review state.
- user-entered attachment filenames or labels only when a future policy approves storing them and defines redaction, search, retention, and display behavior.
- future statement/import source rows, account labels, and mapping notes only after statement-specific privacy, reconciliation, owner, subject, retention, reporting, and audit boundaries are approved.

Server-readable metadata must remain available for:

- authentication, authorization, role, group, participant, payer, debtor, creditor, requester, and visibility checks.
- search/index safety, including deciding what is searchable and what must be excluded because plaintext is vault-protected.
- lifecycle, archive/restore, delete/purge, retention, backup/restore consistency, and stale-envelope warnings.
- audit categories, correlation IDs, actor/subject IDs, action outcomes, safe reason codes, policy versions, recovery status, and privacy-mode changes.
- settlement, bill, recurring, import, reconciliation, notification, and reporting policy enforcement.
- user-visible warnings and blocked states when vault content is locked, missing, stale, quarantined, deleted, inaccessible, or needs recovery/rewrap.

Fields that must remain server-readable metadata, or be excluded from vault payloads entirely, include:

- authoritative bill totals, currencies, item totals, split shares, participant shares, payer contributions, settlement request/payment/residual amounts, balances, recurrence forecast truth, and report totals.
- bill, settlement, payment, residual, recurrence, archive/restore, sync, conflict, notification routing, and lifecycle states.
- group membership, product roles, account/profile linkage, visibility policy, ownership, creator, subject association, and authorization facts.
- file purpose, file status, content type, size, safe hash where policy allows it, retention policy, lifecycle timestamps, storage provider category, and provider-internal object key.
- audit records needed to investigate money, authorization, storage access, privacy-mode changes, key/envelope/recovery, security, backup/restore, migration, and policy changes.
- reconciliation status and bounded import/export bookkeeping that the server needs to prevent duplicate, unsafe, or misleading accounting behavior.

These values must never become ordinary recoverable-vault payloads: raw passwords, password verifiers, passkey private material, raw TOTP seeds, raw recovery codes, raw session tokens, raw bearer tokens, raw refresh tokens, provider access/refresh/ID tokens, raw auth challenges, reset tokens, signing keys, pepper secrets, secret-provider values, decrypted key material, raw vault root keys, raw data keys, raw recovery secrets, unrestricted logs, raw request/response bodies, and unbounded audit/debug traces.

### Subject-specific Boundary Direction

Future implementation slices must define the owner, subject, metadata, envelope, authorization, retention, and audit behavior per purpose before changing runtime behavior.

| Surface | Recoverable-vault payload candidates | Server-readable boundary that must remain |
| --- | --- | --- |
| Payment profile and QR | Payment handle/detail/note where policy allows, QR image bytes, QR preview bytes. | Profile owner, visibility setting, counterparty relationship proof, QR file ID, purpose `payment_qr`, lifecycle, content type/size, retention, audit categories. |
| Receipt and bill attachments | Receipt image bytes, supporting attachment bytes, thumbnails/previews, sensitive attachment labels. | Bill/group subject IDs, participant/payer/creator visibility, file ID, purpose, status, content metadata, OCR review linkage, retention, audit categories. |
| OCR review and extracted candidates | Full OCR raw text and OCR source bytes if stored; sensitive derived text not needed for authoritative bill truth. | Review ID, bill/file IDs, status/source, bounded reviewed candidate fields needed for review/apply, validation issues, timestamps, creator, draft-only apply policy, audit categories. |
| Settlement proof | Proof file bytes, proof previews, proof notes/reference text containing account details. | Settlement request/payment IDs, debtor/creditor/requester/creator facts, proof file ID, purpose `settlement_proof`, payment status, lifecycle, content metadata, retention, audit categories. |
| Statement import and reconciliation | Raw statement files, parsed raw rows, account labels, provider references, import notes. | Import owner, statement/import job ID, reconciliation status, linked bill/payment IDs, duplicate-safety metadata, row counts, policy version, retention, audit categories. |
| Private notes and sensitive text | Personal notes and user-entered sensitive text not needed for shared truth. | Owning subject, author, visibility class, lifecycle, search exclusion flag, retention, warning state, audit categories. |
| Exports and backups | Export file bytes and manifests containing sensitive payload references. | Export owner, scope, created/expiry timestamps, privacy mode, payload categories, retention, restore/warning status, audit categories. |

### Sharing And Collaboration Rules

Vault wrapping must preserve server-mode collaboration authority:

- Shared financial records cannot silently become unreadable to authorized participants when the product has promised those participants access to the shared record or supporting sensitive content.
- Vault-wrapped shared content still requires per-viewer API authorization and, where payload decryption is allowed, an approved participant envelope or equivalent access path for that viewer.
- Recipients must not receive sensitive payloads merely because they know a file ID, bill ID, group ID, profile ID, settlement ID, envelope ID, or storage object identifier.
- Group and shared receipt visibility must follow API/domain policy for the bill, group, participant, payer, creator, and lifecycle state. Group membership alone is not enough unless the domain policy says the member may view that specific receipt/proof/attachment.
- Clients must not infer authorization from local vault state, cached envelope availability, cached group membership, hidden UI controls, route availability, generated-client methods, local thumbnails, or offline cache records.
- If a viewer is API-authorized but lacks a usable envelope or trusted device, the API/client flow should surface a safe locked/recovery-needed state rather than exposing plaintext, leaking existence to unrelated actors, or treating the client as authoritative.
- Participant envelope creation, revocation, and rewrap must follow server-readable authorization and lifecycle policy and must be auditable with bounded metadata.

### Day 1 Boundaries And Handoffs

Day 1 architecture boundaries for #420:

- No full zero-knowledge collaborative vault implementation is approved.
- No runtime encryption implementation is approved by this task.
- No storage provider implementation or file-byte handling change is approved by this task.
- No schema, migration, model snapshot, DbContext, or persistence implementation is approved by this task.
- No OpenAPI or generated-client change is approved by this task.
- No UI/Figma or `docs/design/mobile/*` change is approved by this task.
- Future runtime, storage, schema, API/OpenAPI, generated-client, import/export, backup/restore, OCR, and UI implementation must be split into separately gated tasks with explicit validation and manual gates where required.

Handoffs:

- #422 owns audit, backup, restore, recovery warnings, validation checklist, bounded event names, redaction evidence, backup-retention caveats, and no-silent-downgrade checks.
- #421 remains the separate UX/reference gate for privacy mode onboarding, settings, warnings, locked states, recovery flows, and device approval.
- #343 remains the parent tracker for privacy-mode file handling and must not be closed by this child packet.
- Future statement/reconciliation, export/backup, OCR raw-text, and shared collaborative vault slices must each define their exact subject, metadata, envelope, retention, audit, warning, OpenAPI/schema impact, and validation plan before runtime implementation.

## Auth, Session, And Credential Boundaries

Recoverable vault recovery and authentication recovery are related but separate control planes:

- Local password credentials, password verifier metadata, password hashing parameters, passkeys, TOTP secrets, MFA challenges, recovery codes, reset tokens, bearer session credentials, refresh-like credentials, OIDC provider tokens, and signing or pepper secrets must not be stored in recoverable vault form.
- Auth/session tables remain server-authoritative security state. Vault mode must not make clients authoritative for sign-in, session validity, role assignment, group membership, authorization, or account recovery decisions.
- Password reset, passkey recovery, TOTP factor reset, or recovery-code use can help prove account recovery only through separately reviewed auth/security flows. They must not by themselves expose vault data or raw key material.
- Recoverable vault recovery may use account recovery only through the approved recovery envelope flow, step-up verification, warnings, and audit events.
- Auth audit records may mention safe categories such as `vault_recovery_requested` or `recovery_envelope_revoked`, but they must not store raw keys, envelope ciphertext details, plaintext secrets, raw tokens, password material, MFA secrets, recovery codes, or decrypted vault content.

Future passkey, TOTP, and recovery-code runtime work remains governed by the auth architecture docs. Vault design may depend on those flows for step-up proof, but it must not place auth credentials inside the vault or make vault availability a prerequisite for revoking compromised sessions.

## File And Storage Relationship

Vault protection changes the encryption policy for selected content; it does not change storage authority:

- File bytes still go through the API-owned storage abstraction.
- File metadata belongs in PostgreSQL.
- API responses expose stable file IDs and safe metadata only.
- API responses must not expose filesystem paths, storage roots, object keys, bucket names, provider URLs, vault key references, envelope internals, or provider-specific implementation details.
- File access requires API authentication and authorization for every read, write, attach, detach, delete, restore, or purge action.
- Storage provider internals and provider-internal object keys remain operational metadata and must not appear in generated clients, public APIs, audit records, logs, support reports, or Codex reports.
- Workers may process approved jobs only through reviewed job payloads and API validation. Workers must not directly mutate file metadata, vault metadata, auth rows, or core business tables.

For vault-protected files, PostgreSQL metadata must remain sufficient for the API to enforce owner, creator, purpose, subject association, lifecycle status, content type, size, retention policy, and audit decisions without decrypting the file bytes. Sensitive field integration details are deferred to #420.

## Recovery And Warning Policy

In Recoverable Private Vault, "recoverable" means a reviewed server-assisted recovery path can rewrap or recover vault access after strong account verification and policy checks. It does not mean plaintext vault content, raw data keys, raw vault root keys, or decrypted recovery material may be stored in PostgreSQL, logs, audit, metrics, traces, validation output, issue comments, or reports.

User/admin warning boundaries:

- Users must be warned that Recoverable Private Vault is stronger than Standard Secure Mode for selected sensitive content but is not strict zero-knowledge.
- Users must be warned before enabling, disabling, recovering, migrating, or downgrading vault protection.
- Admins/operators must be warned that backup retention can preserve old recovery envelopes until backup expiry.
- Recovery, mode changes, rewraps, and envelope revocation must be auditable with bounded metadata and user-visible security history where practical.
- No flow may silently downgrade privacy or security, such as converting vault content to server-managed plaintext, removing envelope protection, exposing admin content access, weakening recovery requirements, or restoring an older privacy mode without explicit warning and audit.
- Denied or failed recovery should reveal only safe status categories and must avoid leaking whether a specific sensitive file, payment detail, note, proof, or OCR text exists for an unrelated actor.

Warnings must be product/runtime behavior in later implementation tasks. This docs/control packet only defines the boundaries that those tasks must satisfy.

## Deferred Design Boundaries

The #418 classification packet intentionally leaves these details to separate issues:

- #419 owns key and envelope architecture, including vault root keys, per-item data keys, device envelopes, recovery envelopes, participant envelopes, trusted-device approval, lost-device recovery, key rotation, rewrap, envelope revocation, and key-loss behavior.
- #420 defines sensitive file and field integration boundaries, including recoverable payloads, server-readable metadata, provider-neutral file references, field-level vaulting, attachment/QR/proof/OCR/statement/import/private-note boundaries, sharing/collaboration rules, Day 1 non-goals, and future implementation handoffs.
- #422 owns audit, backup, restore, and recovery warning checklists, including bounded event names, redaction rules, backup-retention caveats, restore-mode warnings, operator evidence, and no-silent-downgrade checks.
- #421 remains the UI/reference gate for privacy mode onboarding, settings, warnings, and recovery UX. This document does not clear that Figma/reference gate.
- #343 remains the broad parent tracker for privacy-mode file handling and must not be closed by this child packet.

Do not use this document as permission to make schema, API, OpenAPI, generated-client, auth/session/security runtime, storage provider, file byte, UI, deployment, CI, Docker, secret, money, settlement, payment, OCR runtime, import/export, or backup automation changes.

## Key, Envelope, And Recovery Architecture

This section is the #419 architecture/control packet for recoverable vault keys, envelope records, and recovery boundaries. It is design-only. It does not approve schema, migration, API, OpenAPI, generated-client, auth runtime, storage provider, file byte handling, UI, backup automation, or recovery runtime changes.

### Terminology And Key Hierarchy

Recoverable Private Vault uses a layered key model so storage metadata, authorization, and recovery state remain server-readable while sensitive payload content stays encrypted.

Suggested terminology:

| Term | Purpose | Storage boundary |
| --- | --- | --- |
| Vault root key | User-scoped root key or equivalent key-encryption key for recoverable vault content. | Never stored raw in PostgreSQL, logs, audit, reports, issue comments, validation output, metrics, or traces. |
| Vault key version | Monotonic version for a user's active or retired vault root key material. | Server-readable metadata only; must not contain raw key bytes. |
| Data encryption key | Random per-file, per-field, or per-record content key used to encrypt a sensitive payload. | Never stored raw; wrapped by a vault root key or participant-specific envelope path. |
| Encrypted payload | Ciphertext bytes or ciphertext field value plus non-secret crypto metadata needed for decryption. | Stored with file bytes or approved payload storage, not as server-readable plaintext. |
| Envelope record | Server-readable row/document describing a wrapped key relationship and lifecycle. | Stores wrapped key ciphertext only where approved; never stores raw key material. |
| Device key pair | Device-scoped asymmetric key pair used to unwrap or receive vault access. | Public key and safe attestation/display metadata may be server-side; private key stays device-side. |
| Recovery envelope | Recoverable-mode wrapping path that can restore or rewrap vault access after strong verification and policy checks. | Highly sensitive control material; server-stored ciphertext and safe metadata only. |
| Participant envelope | Wrapping path that lets an authorized participant access shared sensitive payload content without changing server authorization authority. | Server stores safe envelope metadata and wrapped key material, not payload plaintext. |

Hierarchy direction:

```text
selected sensitive payload
  -> encrypted with data encryption key
  -> data encryption key wrapped by user vault root key or participant access path
  -> vault root key wrapped for trusted devices
  -> vault root key also wrapped by recovery envelope when Recoverable Private Vault allows recovery
```

Large files should use per-file data encryption keys. Field-level payloads may use per-field, per-row, or small-batch data keys if a future implementation review proves the blast radius, rotation, indexing, and retention behavior are acceptable.

### Envelope Encryption Model

Vault encryption changes content protection, not storage ownership:

- File bytes still go through the API-owned storage abstraction.
- File metadata stays in PostgreSQL.
- API/domain services still authorize every read, write, attach, detach, delete, restore, purge, recovery, rewrap, and export/import operation.
- API responses expose stable IDs and safe metadata only, not storage internals, vault key references, envelope internals, provider object keys, raw ciphertext internals, or decryption hints that function as secrets.

Provider-neutral PostgreSQL metadata should identify the business subject and policy state without decrypting payload bytes. Future metadata may need fields or linked tables for:

```text
vault_subject_type
vault_subject_id
encryption_mode
vault_payload_kind
vault_key_version
payload_crypto_version
envelope_set_id
retention_policy
recovery_policy_version
rotation_state
```

These names are directional only, not schema approval. Metadata must stay sufficient for API authorization, lifecycle, retention, audit, backup consistency, and recovery warnings even when payload plaintext is unavailable.

### Recoverable Payload Versus Provider-neutral Metadata

Recoverable vault payload may include selected sensitive content only where the server does not need plaintext to enforce accounting truth:

- receipt/proof/QR/supporting attachment bytes
- payment handle/details and payment notes where policy allows field-level vaulting
- private notes not needed for shared accounting truth
- full OCR raw text if stored after a later OCR/privacy review
- future statement/import/export payloads only after #420 or a later focused review

Provider-neutral metadata remains server-readable:

- stable file ID, owner, creator, purpose, status, content type, size, safe hash where allowed, lifecycle timestamps, retention policy, and subject association
- bill, settlement, payment, group, membership, participant, status, archive/restore, sync, and authorization facts
- encryption mode category, payload/envelope version, recovery policy category, rotation state, and safe warning flags
- audit metadata needed to investigate privacy, recovery, storage, and security events

Vault-protected payload must not contain the only copy of server-authoritative money, settlement, group, role, session, credential, audit, or file-lifecycle facts. The server may be unable to search, index, preview, OCR, or process vault payload plaintext unless a future reviewed flow explicitly decrypts it inside an approved boundary.

### Allowed Key Material And Control Categories

Future implementation should keep key/control categories explicit and separately reviewed:

| Category | Allowed direction | Prohibited direction |
| --- | --- | --- |
| Vault root key | Generated with cryptographic randomness in an approved boundary; wrapped for devices and recovery. | No raw storage in DB, files, logs, audit, examples, support bundles, issue comments, or reports. |
| Data encryption key | Random per payload or approved batch; wrapped by vault/participant path. | No direct reuse as stable identifiers; no raw storage or API exposure. |
| Device public key | May be stored server-side with safe device label, status, created/last-used timestamps, and algorithm/version metadata. | Must not be treated as authorization by itself; stale/revoked devices cannot receive new wraps. |
| Device private key | Stored only on device secure storage where available. | Never sent to server or stored in PostgreSQL/backups. |
| Recovery wrapping material | Stored only as approved encrypted/wrapped recovery envelope material plus safe metadata. | No plaintext recovery secret, raw recovery key, or decrypted envelope material in server-readable state. |
| User-held recovery key future | May be supported later as display-once or user-held material with verifier/envelope metadata. | No raw user recovery key retained after display. |
| Auth credential material | Governed by auth docs, not vault docs. | Passwords, password verifiers, passkey private material, TOTP seeds, recovery codes, reset tokens, session tokens, and OIDC tokens must not be placed in the user vault. |

Key identifiers must be non-secret, non-derivable handles. If a value can decrypt, unwrap, replay, or materially help brute-force key material, it is a secret and must not be logged, audited, reported, exposed through APIs, or committed.

### Envelope Records, Versioning, Rotation, And Retirement

Envelope records should carry lifecycle metadata that supports recovery, rewrap, revocation, backup warnings, and audit without exposing protected content.

Suggested envelope categories:

```text
device_envelope
recovery_envelope
participant_envelope
recovery_key_envelope_future
migration_envelope
```

Candidate safe metadata:

- envelope ID, envelope set ID, owner profile/account ID, subject type/ID where needed, envelope category, status, key version, crypto suite/version, policy version, created/updated/retired timestamps, actor/correlation IDs, and safe reason category.
- device envelope metadata such as device ID, public key ID, device status, and last successful rewrap timestamp.
- participant envelope metadata such as participant profile ID, subject relationship category, and access status.
- recovery envelope metadata such as recovery policy version, status, creation/revocation timestamp, and last recovery attempt outcome category.

Forbidden envelope metadata:

- raw keys, raw recovery secrets, decrypted vault key bytes, data-key plaintext, device private keys, envelope ciphertext in audit/logs/reports, password/MFA/passkey/recovery-code material, raw request/response bodies, provider object keys, storage paths, and decrypted sensitive payload details.

Versioning direction:

- Each vault root key version must have a clear status such as `active`, `rewrapping`, `retired`, `revoked`, or `destroyed` where implementation chooses equivalent names.
- Data payloads should record which vault/data-key version can decrypt them.
- Crypto suite and payload format versions must be explicit enough to support future migration without guessing.
- Retired versions may remain needed to decrypt old payloads until all payload data keys are rewrapped or content is purged.
- Revoked device envelopes must not be used for new wraps and should trigger session/device review where policy requires it.

Rotation/rekey decision points:

- user changes privacy mode
- trusted device is added, lost, revoked, or suspected compromised
- recovery envelope is created, used, revoked, or policy-upgraded
- crypto suite or key size changes
- account compromise, admin security action, or suspicious recovery attempt
- Recoverable-to-Strict or Strict-to-Recoverable migration
- backup restore detects stale envelope state or missing key/metadata consistency

Rotation may mean rewrapping data keys under a new vault root key, rotating the vault root key and rewrapping eligible payloads, creating new data keys for future writes only, or leaving old payloads readable through retired versions until background migration completes. Runtime implementation must explicitly choose the behavior per case.

### Recovery Model Options And Day 1 Boundary

Recoverable Private Vault should support recovery through a controlled server-assisted recovery envelope after strong account verification and recovery policy checks. This is the Day 1 architecture direction, subject to later implementation review.

Allowed Day 1 architecture option:

- Account recovery or step-up verification proves the account actor through auth-owned flows.
- Recovery policy verifies that recovery is allowed for the account, deployment, privacy mode, risk state, and current session context.
- Recovery envelope is used to rewrap the vault root key for a newly trusted device or renewed device key.
- Recovery writes bounded audit/security history and user-visible security notification where available.
- Recovery does not expose plaintext vault content to admins, support screens, issue comments, logs, reports, or ordinary API responses.

Deferred or future options:

- trusted-device-only recovery for Strict Private Vault
- user-held recovery key or recovery phrase
- multi-party recovery or owner-approved organizational recovery
- hardware-backed recovery keys
- break-glass content access
- escrow-provider or external KMS integration

Non-goals for this packet:

- no runtime recovery flow
- no endpoint or OpenAPI contract
- no schema or migration
- no generation, storage, or handling of real keys/secrets
- no account recovery, password reset, passkey, TOTP, MFA, recovery-code, session, or auth policy runtime change
- no backup/restore automation

### Recovery Initiation And Verification Policy

Recovery initiation must be explicit, user-visible where practical, and rate-limited by future auth/security policy. It must not be triggered silently by ordinary sign-in, token refresh, device listing, file read, support action, admin view, or backup restore.

Architecture-level recovery gates:

- authenticated or account-recovery actor is verified through auth-owned flows
- session freshness or step-up requirement is satisfied
- account, role, device, and recovery policy are in a state that allows recovery
- privacy mode permits a recovery envelope
- recovery request is not blocked by risk policy, rate limiting, suspicious activity, active compromise response, or admin/deployment lock
- user receives warning that Recoverable Private Vault is not strict zero-knowledge
- recovery result is audited with safe metadata and correlation ID

Denied or failed recovery must return only bounded reason categories. It must not reveal whether a specific sensitive payload, payment detail, proof, receipt, private note, OCR text, statement, export, envelope, or device exists to an unrelated actor.

### Admin, Owner, And User Recovery Boundaries

System owners/admins manage operational policy; they do not automatically receive vault plaintext access.

Rules:

- No silent admin decryption. Owner/admin roles must not decrypt user vault content through ordinary admin UI, support UI, database access path, issue workflow, report workflow, or backup workflow unless a future explicit policy approves, gates, warns, and audits that behavior.
- Admin-assisted recovery may help verify account state, lock or unlock recovery eligibility, revoke sessions/devices, or reset policy state, but it must not show raw vault keys, decrypted envelopes, or sensitive payload plaintext.
- If future owner-approved recovery is added, it must be separate from content access and must require explicit policy enablement, reason capture, audit, user-visible history where practical, and least-data-needed behavior.
- Break-glass content access remains non-Day 1 and cannot bypass Strict Private Vault cryptographic limits.
- A self-hosting operator with filesystem/database backups may possess infrastructure-level access, but the product architecture must not normalize silent product-level admin decryption.

### Device, Session, And Account State Interactions

Vault device trust is separate from API session validity.

- A valid API session proves the caller can ask the API for authorized metadata and envelope operations; it does not prove the device can decrypt vault payloads.
- A trusted vault device proves it can unwrap vault keys; it does not grant API authorization to records the actor cannot access.
- Session revocation, account disablement, role changes, credential reset, suspicious refresh replay, and MFA/passkey recovery may require device-envelope review or revocation, but auth/session authority remains in the API.
- New-device vault trust must require either existing trusted-device approval or the recoverable envelope flow. Ordinary login alone must not silently mark the device vault-trusted.
- Lost-device handling should revoke or retire the device envelope and may revoke sessions according to auth policy; it must not require deleting unrelated payloads or changing server-authoritative financial truth.
- Account recovery can restore account access without automatically completing vault recovery. The vault remains locked until recovery policy completes and the new device receives a valid wrap.

Local-only mode may reuse device key concepts, but it is not required to use server recovery envelopes. Local-to-server import must explicitly choose whether sensitive imported payloads become server-managed, recoverable-vault protected, or rejected/deferred.

### Key And Recovery Audit Redaction

Key, envelope, and recovery events need enough accountability for security review without preserving the secrets being protected.

Suggested event families:

```text
vault_key_created
vault_key_rotated
vault_key_retired
vault_key_destroyed
vault_payload_key_wrapped
vault_payload_key_rewrapped
device_envelope_created
device_envelope_revoked
participant_envelope_created
participant_envelope_revoked
recovery_envelope_created
recovery_envelope_used
recovery_envelope_revoked
vault_recovery_requested
vault_recovery_completed
vault_recovery_denied
vault_recovery_rate_limited
vault_export_requested
vault_export_completed
vault_import_requested
vault_import_completed
vault_backup_restore_warning_acknowledged
```

Allowed bounded audit metadata:

- actor account/profile ID where safe, subject account/profile ID, subject type/ID, file purpose category, privacy mode, envelope category, key version number or non-secret key-version ID, policy version, action, outcome, reason category, timestamp, and correlation ID.

Audit/log/report exclusions:

- raw keys, data keys, vault root keys, recovery secrets, user recovery keys, device private keys, decrypted envelope metadata, envelope ciphertext, encrypted payload bytes, plaintext payload, raw OCR text, payment details, payment notes, private notes, receipt/proof/QR bytes, statement rows, user-entered sensitive filenames, provider object keys, storage roots, local paths, raw request/response bodies, auth tokens, passwords, password verifiers, TOTP seeds, passkey private material, recovery codes, reset tokens, and unbounded provider payloads.

Export/import, backup/restore, recovery warnings, and validation evidence must follow the same redaction rules as audit. GitHub issue comments and Codex reports may summarize categories, decisions, file paths, SHAs, and validation results, but must not include vault secrets or private payload details.

### Backup, Restore, And Self-hosting Implications

Recoverable vault backups are a consistency problem, not only a file-copy problem.

Backups must preserve the matching set of:

- encrypted payload bytes
- PostgreSQL metadata and subject associations
- envelope records and key-version metadata
- recovery envelopes where recoverable mode allows them
- privacy mode and recovery policy metadata
- audit/security history needed to understand recovery, rotation, revocation, export/import, and warnings

Important restore caveats:

- Backups without keys/envelopes are not enough to decrypt recoverable vault payloads.
- Keys/envelopes without PostgreSQL metadata are not enough for the API to authorize, locate, lifecycle-manage, or safely serve payloads.
- Storage bytes without matching metadata must not be served directly.
- Metadata without matching storage bytes must fail closed and surface a safe missing-content state.
- Older backups may retain recovery envelopes that were later revoked or removed during Recoverable-to-Strict migration.
- Restoring older envelope state can reintroduce a recoverable path inside the restored environment until explicit review revokes or retires it again.

Self-hosted operators must treat PostgreSQL, storage bytes, private env/config, and future vault/envelope metadata as one sensitive consistency set. Vault mode does not remove the need for encrypted backups, private datasets, least-privilege service accounts, secret management, LAN/VPN/public-exposure review, or manual gates for real restore execution.

### Migration, Rekey, And Non-goals

Future implementation must define migration behavior before changing encryption state for existing data.

Decision points:

- enabling vault mode for a user with existing server-managed sensitive files/fields
- disabling vault mode or downgrading to Standard Secure
- migrating Recoverable Private Vault to Strict Private Vault future mode
- migrating Strict future mode back to Recoverable
- rotating keys after suspected compromise
- changing crypto suite or payload format version
- restoring from a backup with stale or missing envelope state
- importing/exporting user data that includes sensitive payloads

Required architecture properties:

- no silent plaintext downgrade
- explicit user/admin warnings where privacy or recovery properties change
- bounded audit for every key/envelope/recovery/migration decision
- rollback and partial-failure behavior that fails closed
- retained old key versions only as long as needed for decryption, migration, retention, or audit policy
- no changes to server-authoritative money, settlement, authorization, group, audit, or file-lifecycle truth during rekey unless a separate reviewed domain task approves it

Non-goals:

- choosing a concrete cryptographic library, cipher suite, KMS provider, table name, endpoint path, or UI flow
- implementing runtime encryption, recovery, migration, export/import, backup, restore, or key generation
- authorizing direct admin content access
- changing OpenAPI, generated clients, schema, storage provider behavior, auth/session runtime, deployment, Docker, CI, secrets, or file-byte handling

### Dependencies And Handoffs

#419 establishes the key/envelope/recovery architecture that later slices must consume.

- #420 must define exact sensitive file/field integration, subject ownership, API authorization rules, metadata shape, payload placement, retention, and OpenAPI/schema impact before runtime work.
- #422 must turn these audit, backup, restore, and warning boundaries into implementation checklists, bounded event names, evidence expectations, and no-silent-downgrade checks.
- #421 remains the UX/reference gate for privacy-mode onboarding, device approval, recovery warnings, lost-device states, and settings.
- #343 remains the broad parent tracker for privacy-mode file handling and must not be closed by this child packet.

## Device Onboarding

### Existing Trusted Device Available

Flow:

```text
New device logs in.
New device creates device key pair.
Existing trusted device receives approval request.
User approves on existing device.
Existing device encrypts vault key for new device public key.
New device stores its private key locally and can unlock vault data.
Audit event is emitted.
```

### No Trusted Device Available: Recoverable Mode

Flow:

```text
User completes account recovery or OIDC login with step-up verification.
Recovery policy validates the request.
Recovery envelope is used to rewrap the vault key for the new device.
New device becomes trusted.
Audit event is emitted.
User-visible security notification is sent where available.
```

### No Trusted Device Available: Strict Future Mode

Flow:

```text
User completes account recovery.
Account access is restored.
Vault data remains locked until recovery key is supplied.
If no recovery key exists, strict-vault data is unrecoverable.
```

## Account Recovery And OIDC

Authentication and vault recovery are separate.

OIDC/local account recovery proves identity. It does not automatically prove vault-key possession.

### Standard Secure Mode

Forgot password or OIDC recovery restores account access and normal server-managed data access.

### Recoverable Private Vault

Forgot password or OIDC recovery may participate in vault recovery only through the approved recovery envelope flow, step-up verification, audit, and policy checks.

### Strict Private Vault Future Mode

OIDC/local account recovery restores account access only. It must not recover strict-vault data unless the user provides a recovery key or another trusted device approves.

## Lost Device Behavior

| Case | Standard Secure | Recoverable Vault | Strict Vault Future |
|---|---|---|---|
| Lost one device, has another trusted device | normal login/revoke | trusted-device approval | trusted-device approval |
| Lost all devices, can recover account | normal recovery | recovery-envelope rewrap | account only, vault locked |
| Lost all devices and recovery key | normal recovery | recoverable if envelope enabled | vault data lost |
| New key pair generated | future data works | future data works after recovery | future data only; old data locked unless old key recovered |

Key regeneration cannot decrypt old data if the old vault key is unavailable.

## Recoverable To Strict Future Migration

Users should be allowed to convert from Recoverable Private Vault to Strict Private Vault later when future implementation and deployment/admin policy allow it.

Flow:

```text
User chooses Convert to Strict.
App checks a trusted device can unlock current vault.
App requires recovery-key setup or explicit no-recovery confirmation.
App rotates vault root key where appropriate.
App rewraps data keys for trusted devices/recovery key only.
App disables/deletes server recovery envelope.
App records audit event.
App warns that older backups may contain recoverable envelopes until retention expires.
```

This migration must include key rotation or re-wrapping where needed, removal or disablement of recovery envelopes, audit events, and backup-retention caveats. It must not silently downgrade API/domain authority for core financial truth.

Important warning:

```text
Older backups may still contain previous recovery envelopes until backup retention expires.
```

## Strict To Recoverable Migration

Users may later choose to re-enable recovery.

Flow:

```text
Trusted device unlocks strict vault.
App creates a new recovery envelope under approved recovery policy.
Mode changes to recoverable_private_vault.
Audit event is emitted.
User is warned this weakens strict host-resistance.
```

## Admin Privacy Rules

System owner/admin roles are operational roles, not blanket financial-content access roles.

Admin UI must not expose by default:

- user expenses/bills not otherwise authorized
- receipt images
- OCR raw text
- payment QR/details
- private notes
- settlement proof
- statement rows/files
- vault contents

Admin support/debug views must use redacted metadata unless a separately reviewed break-glass policy allows more.

Examples of allowed admin metadata:

- user account status
- storage usage
- job/queue status
- failed job metadata without sensitive payload
- health/readiness
- audit summaries
- file size/content type/status without direct content

## Break-Glass Policy

Break-glass content access is not a Day 1 default.

If added later, it must require:

- explicit deployment policy enablement
- owner-level or approved role permission
- reason required
- time-limited access
- audit event
- user-visible access history where practical
- least-data-needed display

Break-glass must not bypass vault-mode promises. In Strict Vault, break-glass cannot decrypt data without user/device key material.

## Backup And Restore

Backups must preserve:

- encrypted file blobs
- database metadata
- key envelopes
- recovery envelopes where mode allows
- audit records
- mode and policy records

Backups must be encrypted.

Backup restore must not silently downgrade privacy mode.

Recoverable-to-Strict migration must warn that older backups may retain recoverable envelopes until retention expiry.

Restore warnings must distinguish these cases:

- Restoring Standard Secure content keeps normal server-managed access under current auth and authorization policy.
- Restoring Recoverable Private Vault content requires matching encrypted blobs, PostgreSQL metadata, vault metadata, recovery envelopes where mode allows them, and audit records.
- Restoring a database snapshot without matching storage bytes may leave vault-protected metadata pointing at unavailable content.
- Restoring storage bytes without matching PostgreSQL metadata may create orphaned encrypted blobs that the API must not serve.
- Restoring older backups after a Recoverable-to-Strict migration may reintroduce old recoverable envelopes inside the restored environment until explicit review handles them.

Real restore execution against maintainer, production, or production-like data remains manual-gated under the deployment backup/restore runbook. This document does not authorize running backup or restore commands.

## Deployment And Self-hosting Implications

Self-hosted deployments remain responsible for protecting PostgreSQL, local file storage, RabbitMQ state where preserved, private app settings, and generated secrets as one deployment consistency set. Recoverable vault support adds these requirements for future implementation planning:

- Deployment docs and admin settings must not imply that vault mode removes the need for encrypted backups, private datasets, secret management, or LAN/VPN/public-exposure review.
- Operators must understand that Recoverable Private Vault has a trusted recovery path and that recovery envelopes are sensitive control material.
- Environment files, Docker/Compose templates, CI, catalog app metadata, secret stores, and deployment defaults must not be changed by this architecture packet.
- Health checks, readiness checks, validation output, support reports, and operator evidence must not reveal storage roots, object keys, provider internals, vault metadata internals, envelope contents, secrets, tokens, or raw file contents.
- Public/admin exposure decisions remain separate manual gates. Vault mode does not make direct storage exposure, broad admin content access, public API exposure, or weak backup handling acceptable.

## Local Mode Interaction

Local-only mode does not require server authentication and remains locally authoritative.

Local mode may use device encryption, app PIN, biometric unlock, and local secure storage. Future private-vault concepts may be reused locally, but local mode does not require server recovery envelopes.

Local-to-server import must not silently expose local private data. Import flow must explain whether sensitive imported files become server-managed or recoverable-vault protected.

## Sync And Offline

Offline server-mode edits remain pending until synced and accepted by the API.

For vault-protected sensitive data:

- clients may queue encrypted blobs and metadata offline
- server cannot validate encrypted content details beyond metadata/policy
- API still validates ownership, authorization, allowed attachment type, size, lifecycle state, and subject association
- sync conflict resolution must preserve encrypted blobs and envelopes until resolved

## Audit Events

Audit should cover:

```text
privacy_mode_changed
vault_enabled
vault_disabled
vault_recovery_requested
vault_recovery_completed
vault_recovery_denied
trusted_device_added
trusted_device_revoked
vault_key_rewrapped
recovery_envelope_created
recovery_envelope_revoked
recoverable_to_strict_requested
recoverable_to_strict_completed
strict_to_recoverable_completed
admin_content_access_denied
break_glass_requested
break_glass_approved
break_glass_content_accessed
```

Audit records must avoid raw keys, raw secrets, decrypted content, raw tokens, and unnecessary sensitive payloads.

Audit redaction requirements:

- Record stable IDs and safe categories only where needed for investigation, such as actor account/profile ID, subject type, subject ID, file purpose, privacy mode category, envelope action category, outcome category, timestamp, and correlation ID.
- Do not record payment handles, payment notes, raw OCR text, private notes, receipt/proof/QR bytes, statement rows, user-entered filenames when sensitive, provider object keys, storage roots, bucket names, local paths, key IDs that function as secrets, envelope ciphertext, decrypted envelope metadata, raw request bodies, raw response bodies, or full provider payloads.
- Recovery and break-glass events must include enough bounded metadata to support accountability without storing the content or key material being protected.
- Reports, validation output, GitHub comments, and support screenshots must follow the same redaction rules as audit/logging.

## API And OpenAPI Direction

Future implementation should expose privacy/vault behavior through OpenAPI, but this architecture document does not authorize OpenAPI changes.

Likely future API categories:

- privacy mode read/update
- trusted devices list/revoke
- new-device approval
- vault recovery initiation/completion
- file/key-envelope metadata
- sensitive file upload/download
- admin redacted metadata views

Generated clients must not be hand-edited.

## Implementation Non-goals

This document does not authorize:

- login implementation
- token issuance
- session middleware
- password reset, passkey, TOTP, MFA, or recovery-code runtime
- vault API endpoints
- OpenAPI feature paths
- generated client changes
- UI behavior
- database migrations
- actual encryption implementation
- Strict Private Vault implementation
- storage provider changes or file byte handling changes
- deployment, Docker, CI, environment, or secret changes
- money, settlement, payment, bill calculation, OCR runtime, import/export, backup automation, or restore execution changes

## Day 1 Acceptance Criteria

Day 1 privacy architecture is acceptable when:

```text
Standard Secure Mode and Recoverable Private Vault are user-selectable where deployment policy allows them.
Standard Secure Mode is default.
Recoverable Private Vault is defined for selected sensitive data.
Core financial truth remains server-readable and API-authoritative.
Admin UI is redacted by default.
Storage paths are not exposed.
Sensitive files go through storage abstraction.
Vault recovery behavior is documented.
OIDC/account recovery behavior is documented.
Lost-device behavior is documented.
Recoverable-to-Strict future migration is documented.
Strict Vault is not claimed as implemented.
Audit requirements are defined.
```

## Next Implementation Candidates

Implementation should remain split into focused, reviewable branches:

1. #419 key, envelope, trusted-device, and recovery architecture review.
2. #420 sensitive file and field integration boundaries for payment details, QR files, receipts, OCR raw text, proof files, private notes, statements, exports, and backups.
3. #422 audit, backup, restore, and recovery warning checklist.
4. #421 privacy mode onboarding, settings, and warning UX reference before UI work.
5. Storage metadata sensitivity/encryption-mode schema design only after manual storage/privacy/security review.
6. Privacy mode API/OpenAPI/generated-client design only after schema and security review.
7. Sensitive file storage/encryption runtime only after #419/#420/#422 gates are satisfied.
8. Future Strict Vault design review before any Strict Private Vault implementation.
