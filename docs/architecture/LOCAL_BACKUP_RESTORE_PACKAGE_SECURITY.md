# Local Backup And Restore Package Security

## Purpose

This document is the docs/control architecture packet for #454, under parent
#406 and bundle `import-export-1`. It defines Day 1 local backup/restore package
contents, package security, encryption posture, restore validation, authority
boundaries, storage/file handling, vault/privacy handling, money/settlement
guards, audit posture, and future validation expectations.

This is not a runtime backup or restore implementation, API endpoint design,
OpenAPI contract, generated-client shape, database schema, migration, mobile
or web UI, Figma/reference artifact, storage provider change, file-byte runtime
change, auth/session/security runtime change, money/settlement/payment/bill
calculation change, Docker/CI/deployment automation, or backup execution
runbook.

## Related Documents

- [Local, server, import, export, and restore boundaries](LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [CSV export and import privacy authority](CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Privacy vault architecture](PRIVACY_VAULT_ARCHITECTURE.md)
- [Offline queue persistence and sync state model](OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Sync audit and validation matrix](SYNC_AUDIT_VALIDATION_MATRIX.md)
- [TrueNAS backup/restore consistency runbook](../deployment/TRUENAS_BACKUP_RESTORE_RUNBOOK.md)

## Day 1 Goals

Day 1 local backup/restore is a user-initiated portability and recovery flow for
local-only profiles and local export packages. It must be safe enough for real
user financial records without pretending to be server restore automation.

Goals:

- create a versioned backup package with an explicit manifest, package version,
  app/schema version, source authority boundary, source mode, creation
  timestamp, feature flags, policy metadata, and provenance;
- encrypt backup packages by default where platform, keychain, and/or
  user-passphrase support makes that feasible;
- preserve encrypted file/blob package contents and safe metadata without
  exposing provider internals;
- preserve privacy/vault/envelope metadata categories needed for later restore
  validation, warnings, recovery, and no-silent-downgrade checks;
- require restore preview, validation, explicit confirmation, and safe problem
  details before any local write;
- keep local restore local unless the user separately starts a server import or
  migration flow;
- warn users that exported backups can contain sensitive financial, receipt,
  proof, payment, profile, and vault metadata and carry retention risk.

## Non-Goals

This packet does not approve:

- backup/restore runtime, endpoints, UI, OpenAPI contracts, generated clients,
  EF models, DbContext changes, migrations, or package parser code;
- server database/storage restore, deployment hooks, Docker/TrueNAS backup
  automation, CI jobs, environment changes, or release behavior;
- statement upload/matching, provider integrations, federation, cross-server
  sync, or Settleora Cloud runtime behavior;
- direct creation of confirmed shared financial truth from a backup;
- secret, credential, token, raw key, recovery-code, private-key, session, or
  local auth/session-state export.

## Authority Boundary

Backup and restore inherits the authority rules from
[Local, server, import, export, and restore boundaries](LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md).

- A local-only backup restores into a local-only profile or local review
  workspace. It does not create server accounts, server groups, server
  collaboration, server audit truth, or server-authoritative records.
- Server-mode local copies, cached records, or export packages are copies with
  provenance. They are not server truth and cannot overwrite server truth.
- Restoring a backup is not server import. Any later server-mode import must
  be explicit, authenticated, API/domain validated, and manual-gated where
  server truth, storage, money, auth/security, schema, or privacy is affected.
- Restore must not silently join a server collaboration workspace, silently
  relink to a server account, or silently overwrite current server records.
- UI mode, generated-client availability, cached profile IDs, local role labels,
  or restored membership data is never authorization.

## Backup Package Manifest

Every future package format should start with a manifest that is safe to parse
for preview and validation before any payload write.

Required manifest categories:

| Category | Required planning fields | Notes |
|---|---|---|
| Package identity | package format name, package version, manifest version, manifest ID, package creation timestamp, package producer | Versions must be explicit enough to reject unsupported packages without guessing. |
| App compatibility | source app version, source schema/local persistence version, supported minimum restore version where known | Future schema/package migrations must be reviewed separately. |
| Authority provenance | source authority boundary, source mode, source workspace/profile category, source installation/workspace identity where safe, source server identity where safe | No secrets, tokens, storage paths, provider internals, or global user directory data. |
| Profile and workspace boundary | local profile identity category, profile display label where safe, workspace identity category, server-mode copy marker where applicable | Restored identity data is provenance, not auth/account authority. |
| Policy metadata | privacy mode, vault policy category, storage policy version, money/rounding policy version, auth/session policy category, retention policy category | Used for warnings and validation, not silent policy downgrade. |
| Feature flags | enabled local features, unsupported future feature markers, package section list, optional section capabilities | Missing or unsupported flags become preview problems. |
| Integrity | section list, section hashes, package hash, payload count summaries, signature/envelope metadata where future policy defines it | Hashes must not be raw secrets and must not reveal unrelated content. |
| Warnings | privacy/retention warning markers, server collaboration boundary markers, known conflicts, unresolved local pending data marker | User-facing copy remains #456's UI/reference gate. |

The manifest must not contain plaintext passwords, raw session tokens, refresh
credentials, provider tokens, MFA secrets, passkey private material, recovery
codes, reset tokens, reusable challenges, raw vault keys, raw data keys, raw
recovery secrets, storage object keys, signed URLs, local filesystem paths,
raw OCR text, file bytes, or unrelated sensitive content.

## Package Section Model

Future package formats may use files, tables, streams, or a container format.
The conceptual sections should remain stable and reviewable:

| Section | Contents | Security posture |
|---|---|---|
| Local profile data | local-only profile settings, local bills, local categories, local recurring/reports metadata, local pending records where allowed | Local-authoritative only; not server account authority. |
| Server-mode local copies | cached server records, server IDs/versions where safe, last-seen basis, conflict markers, pending sync/import candidates | Copies only; restore cannot overwrite server truth. |
| Metadata and policies | package manifest, feature flags, source policy versions, privacy/storage/money/auth policy categories, retention markers | Safe metadata for validation and warnings. |
| Audit/export records | bounded local backup/export/restore audit records and safe provenance | No raw payloads, file bytes, raw OCR text, secrets, storage internals, or unrelated data. |
| Encrypted file/blob references | encrypted package blob entries for receipts, QR images, settlement proof, supporting attachments, thumbnails/previews where included | References are package-local and provider-neutral; no local paths or server object keys. |
| Vault/envelope metadata | encryption mode categories, vault payload categories, envelope set/category/version/status metadata, recovery policy category, rotation/rewrap warning state | No raw keys, decrypted envelope material, recovery secrets, or envelope internals that function as secrets. |
| Restore preview/problems | computed preview counts, validation outcomes, warnings, conflicts, duplicate/collision summaries, blocked section summaries | Generated during restore preflight; safe to display/log in bounded form. |

Package-local blob IDs are not server file IDs unless a future import session
maps them through API validation. Local file paths must never become server
storage references.

## Encryption Posture

Backups should be encrypted by default where feasible.

Allowed Day 1 directions:

- use platform/keychain-backed wrapping when available for local backup keys;
- allow a user passphrase path where platform support is missing or the user
  intentionally creates a portable backup;
- use authenticated encryption and per-package or per-section keys where future
  implementation chooses exact cryptography;
- store only non-secret crypto metadata needed for versioning, integrity,
  recovery warnings, and safe failure categories.

Required prohibitions:

- no plaintext raw keys, vault root keys, data keys, recovery keys, recovery
  codes, passphrases, credentials, bearer/session/refresh tokens, provider
  tokens, passkey private material, TOTP seeds, reset tokens, reusable auth
  challenges, private keys, SSH material, `.env` values, or local Codex state;
- no silent decryption of vault-protected data to plaintext for backup,
  preview, audit, logs, reports, issue comments, or validation output;
- no product-level admin or operator path that decrypts user backup contents
  silently;
- no fallback to unencrypted backup unless a future gated product decision
  explicitly allows it, the user is warned, and audit/provenance records the
  warning category.

When platform keychain, secure enclave, biometric/PIN, or user-passphrase
support is missing, backup creation should fail closed or offer only a clearly
warned, separately approved fallback. Restore should surface safe problem
categories such as `key_access_failed`, `passphrase_required`,
`platform_key_unavailable`, or `unsupported_encryption_mode`; it must not
attempt silent plaintext downgrade.

## Restore Posture

Restore must be a staged operation:

1. Parse and validate the manifest without writing data.
2. Verify package version, authority boundary, source mode, integrity hashes,
   section availability, encryption metadata, and policy compatibility.
3. Attempt authorized key/passphrase access only after explicit user intent.
4. Produce a restore preview with safe counts, warnings, conflicts, blocked
   sections, and missing-capability summaries.
5. Require explicit user confirmation before local writes.
6. Validate again before write, because local state, policy, or key access may
   have changed between preview and acceptance.
7. Preserve rejected, conflicted, duplicate, or failed candidates where policy
   allows until explicit discard or retention cleanup.

The restore preview must be user-visible and reviewable before any apply or
write. It must include safe counts and expandable detail categories for:

- added records;
- changed records;
- duplicate or skipped records;
- conflicts requiring review;
- blocked records or sections;
- privacy/vault warnings;
- file included, missing, or metadata-only status;
- local records not present in the backup or package.

Records that exist locally but are not present in the backup or import package
must be kept by default. Deleting or replacing current local state requires an
explicit dangerous replace/purge mode, warning, confirmation, dependency
checks, and audit/retention policy where applicable.

Restore preview and problem details must not expose secrets, raw tokens, raw
OCR text, file bytes, storage paths, object keys, signed URLs, private notes,
or unrelated user financial data.

Restore cannot:

- create server accounts, server collaboration membership, server groups, or
  server-authoritative shared records;
- overwrite server truth, confirmed settlements, confirmed payments, accepted
  bill revisions, current server file metadata, or server audit truth;
- clear conflict markers or pending server-mode queue records without explicit
  user action and policy support;
- downgrade privacy mode, vault/envelope protection, storage retention, or
  auth/session policy silently.

Server-mode restore/import remains server/API validated and manual-gated.
Ordinary local backup restore must not trigger server database restore,
deployment restore, destructive data operations, or Docker/TrueNAS automation.

## File And Storage Posture

Server-mode file bytes still go through Settleora's storage abstraction when
they become server records. Backup package blob content is package-local until
a future import/restore flow validates and stores it.

Rules:

- Local file paths, temporary paths, mounted volume paths, storage roots,
  filesystem paths, bucket names, storage object keys, provider URLs, signed
  URLs, and provider internals must not be stored as portable restore
  references.
- Backup packages may preserve encrypted blob contents, package-local blob IDs,
  safe hashes, size, purpose, content type category, file inclusion state,
  privacy/vault category, and subject provenance where policy allows.
- Restored server-mode file candidates require a future upload/import-intent
  path before becoming server file metadata or readable server content.
- Missing encrypted blob sections, failed hash verification, unsupported
  content type, unsupported purpose, retention block, or storage policy block
  must produce restore preview problems instead of partial silent file links.
- Audit, logs, validation output, reports, and problem details must not contain
  file bytes, raw OCR text, local paths, provider internals, object keys,
  signed URLs, or sensitive attachment contents.

## Vault, Envelope, And Privacy Posture

Backups are highly sensitive. A backup package may include sensitive content,
encrypted file payloads, vault-protected payloads, and metadata that reveals
financial or relationship context.

Restore and backup must:

- preserve privacy mode category, vault payload category, encryption mode
  category, envelope category, envelope version/status category, recovery
  policy category, and rewrap/rotation warning metadata where applicable;
- preserve enough server-readable metadata to warn about stale, missing,
  revoked, incompatible, or unrecoverable vault/envelope states without
  decrypting payload plaintext;
- avoid examples that include raw secrets, raw keys, recovery codes, raw OCR
  text, sensitive file contents, real credentials, private notes, payment
  details, provider tokens, or storage object keys;
- block or warn before any privacy downgrade, such as restoring vault content
  as server-managed plaintext, dropping envelope metadata, disabling recovery
  warnings, or importing vault-protected content into a weaker mode;
- warn users that backup retention may preserve old encrypted payloads,
  envelope metadata, recovery metadata, or policy states until the backup is
  deleted according to the user's retention choices.

Recoverable Private Vault does not allow raw vault keys or decrypted recovery
material inside backups. Strict Private Vault remains future-compatible only;
restore must surface locked/unavailable states when required key material is
not available.

## Money, Settlement, And Bill Authority

Backup and restore must not move financial authority to a package parser or
client.

- Restored money values remain decimal-safe strings with attached currency and
  original/provenance metadata where safe.
- Local-only restored records may be locally authoritative only inside the
  local profile boundary.
- Importing restored records into server mode must run API/domain validation
  before any server acceptance.
- Restore/import cannot directly create confirmed shared financial truth,
  confirmed settlement/payment status, accepted bill revision state,
  participant acceptance, payer confirmation, residual effects, or audit truth.
- Settlement, payment, bill, recurring, FX, tax, split, and rounding status
  transitions remain API/domain-authoritative in server mode.
- Conflicts, stale calculation bases, unsupported currency, invalid decimal
  scale, duplicate records, and import collisions must become restore/import
  problems or review states, not silent recalculation or overwrite.

## Audit And Logging

Future implementation should audit or locally record bounded events for:

- backup creation requested/completed/failed;
- restore preview requested/completed/failed;
- restore acceptance;
- restore rejection/failure;
- conflict preservation;
- duplicate/collision detection;
- restore discard or package discard where applicable;
- privacy/vault/envelope warning surfaced;
- storage policy, auth/session policy, money/currency, or retention policy
  block.

Audit metadata should be bounded to actor/profile category where applicable,
operation category, source/destination authority boundary, package/manifest
version, package/session correlation ID, safe section counts, safe problem
categories, policy version categories, timestamp, and outcome.

Audit/logs must not expose raw OCR text, file bytes, local paths, storage
internals, object keys, signed URLs, raw request/response bodies, tokens,
credentials, passwords, recovery codes, MFA/passkey material, raw vault keys,
decrypted envelope material, private notes, payment details outside authorized
scope, or unrelated sensitive content.

## Restore Validation Problem Categories

Future restore preflight and acceptance should use stable problem categories
equivalent to:

| Category | Meaning |
|---|---|
| `unsupported_package_version` | Package or manifest version is not supported by the restoring app. |
| `unsupported_authority_boundary` | Source boundary or mode cannot be restored into the selected target. |
| `missing_or_corrupt_manifest` | Manifest is missing, malformed, incomplete, or cannot be parsed safely. |
| `integrity_hash_failure` | Manifest, section, or package hash does not match. |
| `decryption_or_key_access_failed` | Passphrase, platform key, keychain, or envelope access failed. |
| `missing_encrypted_blob_section` | A required encrypted blob/file section is absent or unreadable. |
| `storage_policy_block` | File purpose, type, size, count, retention, or storage policy blocks restore/import. |
| `vault_privacy_policy_block` | Privacy mode, vault metadata, envelope status, recovery policy, or no-downgrade rule blocks restore/import. |
| `auth_session_policy_block` | Auth/session/account policy prevents the selected server-mode import or account-linked action. |
| `money_currency_validation_block` | Currency, decimal scale, totals, split basis, settlement state, or calculation basis is invalid or unsupported. |
| `duplicate_import_collision` | Package/candidate duplicates or collides with existing local/server records or idempotency state. |
| `server_collaboration_boundary_warning` | Restore contains server-mode copies or collaborative records that require explicit import and server validation. |
| `retention_privacy_warning` | Backup retention, old envelopes, sensitive package contents, or privacy downgrade risk requires user warning. |

Problem details must be safe. They should identify section, category, severity,
and review action without echoing raw sensitive values.

## Future Validation Expectations

Validation must match the changed surface:

| Future changed surface | Expected validation |
|---|---|
| Docs/control only | `git diff --check`, docs validation, scaffold validation where requested, and scope guard proving no runtime/API/schema/OpenAPI/generated-client/storage/file-byte/security/money/deployment/UI changes. |
| API/domain runtime | API-local tests for restore preview, validation, explicit acceptance, rejection, conflict preservation, idempotency, authorization, audit redaction, and no server-truth overwrite. |
| Storage/file-byte runtime | Tests proving file bytes go through storage abstraction, local paths never become server references, provider internals stay private, blob integrity is checked, and storage policy blocks are safe. |
| Vault/privacy/security | Tests for encrypted-by-default behavior, key access failures, no raw key/secret exposure, no silent vault plaintext downgrade, envelope warning preservation, and privacy-retention warnings. |
| OpenAPI/generated-client | Manual OpenAPI/generated-client gate, canonical contract review, `npm run validate:openapi`, `npm run generate:clients`, generated diff review, and `npm run validate:clients`. |
| Schema/migration/package format | Migration/package-format review, compatibility tests for package versions, manifest/section migration tests, and manual schema/migration gate. |
| Mobile/local persistence | Tests for durable local backup metadata, restore preview persistence, explicit confirmation, failed/conflict preservation, discard confirmation, and no silent server collaboration join. |
| UI/Figma reference | Covered by #456. Future UI must show warnings, preview, confirmation, errors, and authority boundaries without implying restore equals server acceptance. |
| Docker/deployment backup automation | Non-goal unless separately scoped. Any deployment restore or backup automation remains manual-gated and follows deployment runbooks. |

## Issue And Gate Posture

- #453 owns the CSV export/import privacy and authority design and is separate
  from package-level backup/restore security.
- #454 is this local backup/restore package/security design packet.
- #455 remains the import validation, conflict, and migration policy gate.
- #456 remains the UI/Figma/reference gate for import/export and
  backup/restore UX and was not modified by this packet.
- #457 remains the import/export storage, privacy, and audit validation matrix.
- #406 remains the broad parent/split issue and must not be closed by this
  packet.

## Non-Goals Reaffirmed

This document does not close #406, #454, #455, #456, or #457. It does not
modify runtime/API behavior, backup/restore endpoints, import/export runtime,
storage/file-byte runtime, OpenAPI/contracts, generated clients, EF models,
DbContext, migrations, model snapshots, schema, mobile/web/admin UI,
Figma/reference assets, Docker/CI/deployment/env/release files, secrets,
tokens, credentials, `.env`, SSH material, or local Codex auth/session state.
