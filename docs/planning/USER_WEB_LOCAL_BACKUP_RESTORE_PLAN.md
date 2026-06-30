# User Web Local Backup And Restore Plan

## Status

Planning/control gate for issue #461 after PR #607 merged the user-web
sync/local status runtime readout. This plan defines the user-web direction for
local backup package creation, backup package handling, restore preview, and
restore confirmation before any runtime work begins.

This document does not implement runtime UI, OpenAPI paths or schemas,
generated clients, backend/API behavior, database schema or migrations,
auth/session/security runtime, storage/file-byte behavior, export/download
runtime, import/upload runtime, sync mutation, local backup/restore runtime,
browser local-mode persistence, Docker, deployment, CI, mobile/admin behavior,
or secrets.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [User web export, import, and local-mode implementation plan](USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md)
- [User web export readiness contract plan](USER_WEB_EXPORT_READINESS_CONTRACT_PLAN.md)
- [User web import preflight and review plan](USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md)
- [User web import confirmation contract plan](USER_WEB_IMPORT_CONFIRMATION_CONTRACT_PLAN.md)
- [User web sync and local status plan](USER_WEB_SYNC_LOCAL_STATUS_PLAN.md)
- [User web sync and local status contract plan](USER_WEB_SYNC_LOCAL_STATUS_CONTRACT_PLAN.md)
- [User web local backup package contract plan](USER_WEB_LOCAL_BACKUP_PACKAGE_CONTRACT_PLAN.md)
- [User web local backup package manifest and session plan](USER_WEB_LOCAL_BACKUP_PACKAGE_SESSION_PLAN.md)
- [User web local backup package generation and download plan](USER_WEB_LOCAL_BACKUP_PACKAGE_GENERATION_DOWNLOAD_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Local backup and restore package security](../architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)
- [CSV export and import privacy authority](../architecture/CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Import validation, conflict, and migration policy](../architecture/IMPORT_VALIDATION_CONFLICT_MIGRATION_POLICY.md)
- [Import/export storage, privacy, and audit validation matrix](../architecture/IMPORT_EXPORT_STORAGE_PRIVACY_AUDIT_VALIDATION_MATRIX.md)
- [Storage file metadata architecture](../architecture/STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](../architecture/STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Privacy vault architecture](../architecture/PRIVACY_VAULT_ARCHITECTURE.md)
- [Auth runtime and current-user design](../architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md)

## Current State

The current generated web client has reviewed import/export and sync-local
status surfaces, but no backup/restore package runtime:

| Area | Existing methods | Current backup/restore implication |
| --- | --- | --- |
| Bill export | `getPersonalBillExportReadiness`, `getGroupBillExportReadiness`, `exportPersonalBillsCsv`, `exportPersonalBillsJson`, `exportGroupBillsCsv`, `exportGroupBillsJson` | Scoped CSV/JSON export exists for bill data. It is not a complete backup package, does not include a restore package manifest, and must not be presented as local backup. |
| Bill import | `preflightPersonalBillsCsvImport`, `preflightGroupBillsCsvImport`, `createPersonalBillCsvImportSession`, `createGroupBillCsvImportSession`, `getBillCsvImportSession`, `confirmBillCsvImportSession`, `discardBillCsvImportSession`, `importPersonalBillsCsv`, `importGroupBillsCsv` | CSV import is a staged data-ingress path for bill rows. It is not backup restore, does not restore file packages, and does not move a whole local authority boundary. |
| Sync/local status | `getSyncLocalStatus`, `listSyncChanges`, `submitSyncOperation`, `getSyncOperation` | `getSyncLocalStatus` is read-only and may report local backup/restore as unsupported. The other sync methods are not backup/restore methods; `submitSyncOperation` is mutation-sensitive and must not be used for restore. |
| Bill archive restore | `restorePersonalBill`, `restoreGroupBill` | These restore an archived bill lifecycle flag. They are not backup package restore. |

PR #607's runtime readout calls only `getSyncLocalStatus` for sync/local
status. That contract explicitly excludes backup package creation, restore
file parsing, restore preview, local writes, file bytes, browser-local state,
sync mutation, and hidden business-record hydration. This plan preserves that
boundary.

No current generated-client method provides user-web local backup package
creation, backup package manifest read, package decryption, restore preview,
restore confirmation, restore session discard, package file import, browser
local-mode persistence, or local-to-server backup migration.

## Why Backup/Restore Is Not CSV/JSON Export/Import

CSV/JSON export/import moves scoped data copies through reviewed export and
import contracts. It can be useful for spreadsheet review, bill row migration,
and bounded user data portability, but it is not a full local backup.

Local backup/restore is broader and more sensitive because it may involve:

- a versioned package manifest and compatibility rules;
- profile/workspace provenance and source authority boundary;
- local-only records and server-mode copies;
- package-local file/blob sections for receipts, proof files, QR/payment
  images, statements, supporting attachments, OCR-derived content, and notes
  where policy allows;
- content hashes, integrity checks, and tamper detection;
- encryption metadata, passphrase or platform-key requirements, and vault
  compatibility warnings;
- retention, deletion, Trash/soft-delete, pending sync/import data, conflict
  markers, duplicates, and unresolved local state;
- restore preview and explicit restore confirmation before any write.

User web must not label bill CSV/JSON export as `Backup`, must not label CSV
import as `Restore backup`, and must not imply exported bill rows are a live
sync link or server database restore.

## Day 1 Product Intent And Current User-Web Limits

Day 1 product intent is to support trustworthy portability and recovery for
real local financial records. Local backup/restore should help users recover
from device loss, browser data loss where browser persistence is later
approved, server disconnect/export-to-local flows, and local-only profile
recovery without silently changing authority boundaries.

Current user web is limited:

- it is a server-mode web surface with generated API clients;
- it can show the server-returned sync/local status readout;
- it does not have approved browser-local financial truth;
- it does not have approved browser storage for profiles, bills, queues,
  import/export history, backup packages, restore sessions, files, OCR text,
  payment details, or private notes;
- it does not have backup package create, package read, restore preview, or
  restore confirmation contracts.

Until the missing contracts and persistence design exist, user web may only
show honest unsupported/readiness states for local backup and restore.

## Personal/Local-Only Versus Server-Mode Differences

Local-only backup restore affects a local-only authority boundary. It may
restore local profile records, local-only bills, local pending records, and
package-local encrypted blobs only inside that local boundary. It must not
create server accounts, server groups, server collaboration membership,
server-authoritative bills, server audit truth, or server file metadata.

Server-mode backup/export packages are copies with provenance. Restoring a
server-mode copy must not overwrite server truth, replay stale settlements,
clear server conflict markers, mutate accepted bill revisions, relink files to
server storage, or silently reconnect to a server workspace. Any later
local-to-server or server-to-local movement needs an explicit import,
migration, or restore contract with authenticated API/domain validation.

Personal restore scope and shared/group restore scope need different review:

- Personal/local-only restore may affect only the current local profile
  boundary unless a later server import accepts records.
- Group/shared data in a backup is historical or candidate data until the
  server validates group membership, visibility, bill status, money,
  participant identity, file purpose, storage policy, and conflict state.
- Hidden shared/group data must not become visible through manifest previews,
  duplicate summaries, conflict messages, or restored local search rows.

## Browser Local-Mode Boundary

Browser local mode remains unsupported until a separate
persistence/security/encryption/retention/device-loss/migration design exists.

This plan does not approve `localStorage`, `sessionStorage`, IndexedDB, Cache
Storage, service workers, object URLs, browser filesystem APIs, browser cache,
or in-memory browser state as Settleora financial truth, sync queue storage,
backup state, restore session storage, import/export history, local profile
storage, group storage, payment-detail storage, OCR/private-note storage, file
storage, or migration state.

A future browser local-mode design must decide what is stored, how it is
encrypted, how keys are derived or wrapped, how sign-out/session expiry/browser
profile deletion/private browsing/device loss behave, how data is retained or
cleared, and how local-to-server migration avoids silent merge.

## Package Format Concepts

Future package names, paths, schema names, and operation IDs are planning-only
unless a later OpenAPI/API task approves them.

Every backup package should include or reference these concepts:

| Concept | Planning direction |
| --- | --- |
| Manifest | Safe-to-parse metadata before payload writes. Includes package format name, manifest ID, package version, manifest version, creation time, producer, source mode, source authority boundary, package sections, hashes, warnings, and compatibility markers. |
| Versioning | Package version, app version, local persistence/schema version, minimum supported restore version, and future feature markers. Unknown required features must fail closed or produce a blocked restore preview. |
| Profile metadata | Safe profile/workspace provenance such as display label, source profile category, source workspace category, source server marker where safe, privacy mode, and policy categories. It is not auth/account authority. |
| Data sections | Local profile data, local bills, server-mode copies, import/export audit/provenance records, pending local records where allowed, conflict markers, Trash/soft-delete state, and policy metadata. |
| File references | Package-local blob IDs, purpose, content type category, size, inclusion state, privacy/vault category, subject provenance, and content hash. These are not server file IDs or storage object keys. |
| Content hashes | Per-section and per-blob hashes for integrity/tamper detection, plus optional package-level hash. Hashes must not be treated as secrets or exposed as hidden-data identifiers. |
| Optional encrypted payload sections | Encrypted sections for sensitive data and files where policy allows, with non-secret encryption metadata, key/envelope categories, algorithm/version markers, and recovery warnings. |
| Future compatibility markers | Required/optional feature flags, unsupported section markers, package migration hints, privacy downgrade blockers, storage policy blockers, and schema compatibility warnings. |

The manifest must not include passwords, raw session tokens, refresh
credentials, provider tokens, MFA/TOTP secrets, passkey private material,
recovery codes, reset tokens, reusable challenges, raw vault keys, raw data
keys, passphrases, storage object keys, signed URLs, filesystem paths, local
device paths, provider internals, raw OCR text, file bytes, raw payment
details, or hidden shared/group data.

## Encryption, Password, And Key-Handling Direction

Backups should be encrypted by default where feasible. This planning task does
not choose production cryptography, implement key derivation, or store secrets.

Future runtime design should cover:

- authenticated encryption and integrity checks for package payloads;
- platform/keychain-backed key wrapping where available;
- user passphrase support for portable backups when approved;
- per-package or per-section key strategies where justified by policy;
- non-secret crypto metadata for algorithm/version, key wrapping category,
  recovery category, vault/envelope compatibility, and safe failure codes;
- explicit warnings and audit for any separately approved unencrypted fallback.

Backup packages, manifests, logs, reports, audit metadata, and problem details
must never store raw keys, vault root keys, data keys, recovery keys, recovery
codes, passphrases, password material, bearer/session/refresh tokens, provider
tokens, passkey private material, TOTP seeds, reset tokens, reusable auth
challenges, private keys, SSH material, `.env` values, or local Codex state.

Restore must fail closed when key access fails or encryption is unsupported.
Planning-only safe problem code families include `passphrase_required`,
`key_access_failed`, `platform_key_unavailable`,
`unsupported_encryption_mode`, `package_integrity_failed`,
`package_tampered`, and `privacy_downgrade_blocked`.

## Privacy Boundaries

Backup packages can reveal sensitive financial, relationship, and security
context. Future package design must make inclusion rules explicit for:

- receipt images and supporting bill files;
- settlement proof files;
- payment QR images and payment-profile attachments;
- statement files and statement rows where statement support exists;
- OCR raw text, OCR normalized candidates, and OCR review metadata;
- bill notes, private notes, comments, tags, categories, and merchant text;
- raw import/export rows and import session metadata;
- payment details, payment handles, settlement notes, residuals, and payment
  proof metadata;
- hidden shared/group records, hidden member identities, inaccessible bills,
  and historical server IDs/versions.

Default restore preview responses should show bounded counts, categories,
warnings, and safe labels only. They must not reveal hidden group existence,
hidden users, raw notes, raw OCR text, payment details outside authorized
context, file contents, private vault plaintext, or unrelated server records.

## File Handling Rules

Backup packages must not contain portable references to server or local storage
implementation details. Prohibited fields include:

- direct storage paths;
- object keys;
- bucket names;
- provider-internal identifiers;
- signed URLs;
- filesystem paths;
- local device paths;
- mounted volume paths;
- temp paths;
- direct API storage roots or implementation details.

Allowed planning concepts are package-local blob IDs, safe content hashes,
bounded size, purpose/category, content type category, inclusion state,
privacy/vault category, and authorized subject provenance. A package-local
blob ID does not authorize server reads or writes. Restored file candidates
require a future upload/import-intent path before becoming server file metadata
or readable server content.

## Restore Preview And Confirmation

Restore must be staged:

1. Parse the manifest without writing data.
2. Validate package version, source authority boundary, source mode,
   compatibility markers, hashes, encryption metadata, section availability,
   and policy compatibility.
3. Request passphrase/key access only after explicit user intent.
4. Return a restore preview with safe counts, warnings, blocked sections,
   duplicates, conflicts, retention/Trash implications, missing files, and
   unsupported capabilities.
5. Require a separate explicit restore confirmation before any mutation.
6. Revalidate current local/server state, policy, package integrity, key
   access, and selected restore scope immediately before writing.
7. Preserve rejected, duplicate, conflicted, or failed candidates until the
   user explicitly discards them or retention cleanup applies.

Restore confirmation is a separate reviewed mutation gate. It must not be
bundled with package preview, manifest parsing, import preflight, sync status,
or browser local-mode persistence. Future confirmation labels should be
explicit, such as `Restore backup`, `Restore selected records`, `Discard
restore session`, or `Cancel restore`, rather than vague labels like
`Continue`, `OK`, or `Apply`.

Implementation update on 2026-06-30: the restore-preview contract/API slice
chose these authenticated process-local endpoints:

- `POST /api/v1/local-backup/restore-previews` with operation ID
  `createLocalBackupRestorePreview`
- `GET /api/v1/local-backup/restore-previews/{restorePreviewId}` with
  operation ID `getLocalBackupRestorePreview`
- `POST /api/v1/local-backup/restore-previews/{restorePreviewId}/discard`
  with operation ID `discardLocalBackupRestorePreview`

This restore preview parses and validates current data-only local backup
packages only. It is non-mutating and returns bounded safe metadata; restore
confirmation remains a separate future mutation gate. Browser local-mode
persistence remains unsupported, and file-byte, encrypted-section, durable
storage, and server/local business-record restore remain separate future work.

## Conflict, Duplicate, And Partial Restore Direction

Future restore preview should distinguish:

- exact duplicate package records already present locally or on the server;
- possible duplicates with different IDs, timestamps, merchant names, payment
  details, or hashes;
- conflicts with current local records;
- conflicts with current server-visible records where the actor is authorized
  to see safe summaries;
- stale server-mode copies;
- missing or revoked file/blob sections;
- unsupported package sections;
- records blocked by privacy, retention, auth/session, group membership,
  storage policy, money policy, or schema compatibility.

Default restore behavior should be all-or-nothing for the selected restore set
unless a later product and API/domain task explicitly approves partial restore.
Partial restore and selective restore should remain future-safe concepts, but
this task does not promise runtime implementation.

If selective restore is added later, the contract must define selection
granularity, idempotency, duplicate suppression, audit write set, retry
behavior, discard behavior, and how skipped/conflicted candidates are retained
without leaking hidden data.

## Audit Requirements

Future backup/restore behavior must emit bounded audit from the appropriate
authority boundary. Server-participating flows require API/domain audit; local
only flows require local audit/provenance where supported by the approved local
persistence design.

Required audit categories include:

- backup package creation requested;
- backup package creation completed;
- backup package creation failed;
- restore package preview requested;
- restore preview produced;
- restore preview failed or blocked;
- restore confirmation requested;
- restore confirmation completed;
- restore confirmation failed or partially failed where later approved;
- restore session discarded;
- restore session expired or retention-cleaned;
- security-relevant backup events such as encryption failure, passphrase/key
  failure, package integrity failure, privacy downgrade block, unsupported
  encryption mode, suspicious/tampered package, and repeated failed access.

Audit/log metadata may include actor/profile/session correlation where
authorized, source/destination authority boundary category, package/restore
session correlation ID, safe counts, section categories, stable problem codes,
policy categories, timestamps, and request correlation IDs.

Audit/log metadata must not include secrets, tokens, passwords, recovery
codes, MFA/passkey material, raw keys, raw OCR text, raw notes, raw
import/export rows, file bytes, storage paths, object keys, signed URLs,
provider internals, local paths, raw package payloads, raw exception dumps, or
hidden record details.

## Retention, Deletion, Trash, And Device-Loss Behavior

Backup packages are user-controlled copies and may outlive records deleted or
soft-deleted in Settleora. Future product copy and contracts must warn users
that deleting a record in the app does not delete backup files they already
downloaded or copied elsewhere.

Future backup/restore design must cover:

- package retention warnings and user-visible creation timestamps;
- restore session expiry and discard behavior;
- cleanup for failed, blocked, or abandoned restore sessions;
- Trash/soft-delete state preservation where applicable;
- whether soft-deleted records restore as soft-deleted, active candidates, or
  blocked candidates;
- hard-deleted, retention-expired, or privacy-erased records appearing in old
  backups as blocked or warned restore candidates;
- device loss, browser profile deletion, private browsing, cache eviction, and
  server disconnect scenarios;
- server disconnect/export-to-local packages that carry provenance without
  remaining a live link to server truth.

Browser data loss must not become silent server data loss. Server-mode web
should treat browser loss as loss of local display/cache state only until a
future browser-local persistence design creates a reviewed local authority.

## Safe Failure States And Planning Codes

Existing OpenAPI currently includes sync/local status codes such as
`backup_restore_unsupported`, `backup_restore_policy_disabled`,
`local_mode_unsupported`, and `local_persistence_unsupported`. Those names are
existing only for the sync/local status readout.

Additional planning-only backup/restore code families may include:

- `backup_package_create_unavailable`
- `backup_package_policy_disabled`
- `backup_package_too_large`
- `backup_package_integrity_failed`
- `backup_package_tampered`
- `backup_package_unsupported_version`
- `backup_package_unsupported_feature`
- `backup_package_missing_section`
- `backup_package_encryption_required`
- `passphrase_required`
- `key_access_failed`
- `platform_key_unavailable`
- `unsupported_encryption_mode`
- `restore_preview_unavailable`
- `restore_preview_failed`
- `restore_confirmation_required`
- `restore_confirmation_unavailable`
- `restore_session_expired`
- `restore_session_discarded`
- `restore_duplicate_detected`
- `restore_conflict_detected`
- `restore_hidden_data_blocked`
- `restore_privacy_downgrade_blocked`
- `restore_file_section_blocked`
- `restore_partial_selection_unsupported`

These planning names are not approved OpenAPI enum values, problem types, or
generated-client model names unless a later contract task adds them.

## Future Task Sequence

Keep local backup/restore work split across reviewable gates:

| Order | Slice | Suggested branch | Gates |
| ---: | --- | --- | --- |
| 1 | Backup package contract plan | `docs/user-web-local-backup-package-contract-plan-461` | Docs/control gate for readiness, manifest, package generation/download, verification, metadata readback, file/privacy, encryption, audit, retention, and stable code families; see [User web local backup package contract plan](USER_WEB_LOCAL_BACKUP_PACKAGE_CONTRACT_PLAN.md). |
| 2 | Backup package manifest/session plan | `docs/user-web-local-backup-package-session-plan-461` | Docs/control gate for package-session lifecycle, manifest/session metadata, data-egress consent, bounds, expiry, retry, cancellation, discard, and stale-session behavior; see [User web local backup package manifest and session plan](USER_WEB_LOCAL_BACKUP_PACKAGE_SESSION_PLAN.md). |
| 3 | OpenAPI/API backup package read/generation/session contract | `feature/user-web-local-backup-package-contract-461` | Manual OpenAPI/generated-client, auth/session, storage/privacy, encryption, audit, package artifact retention, and safe problem-code gate. No restore preview or confirmation mutation. |
| 4 | Generated-client refresh | same contract branch or a dedicated generated-client branch per review direction | Run `npm run generate:clients` and `npm run validate:clients`; generated clients must not be hand-edited. |
| 5 | User-web backup package runtime | `feature/user-web-local-backup-package-runtime-461` | Runtime calls only approved readiness/package methods; no restore preview, restore confirmation, sync mutation, browser-local persistence, or unapproved file-byte behavior. |
| 6 | Restore-preview contract/API | `feature/user-web-restore-preview-contract-461` | Manual OpenAPI/generated-client, package parsing, storage/file, encryption/key access, privacy, conflict/duplicate, and audit gate. No restore confirmation mutation. |
| 7 | Restore-confirmation contract/API | `feature/user-web-restore-confirmation-contract-461` | Manual mutation, storage/file, money/bill/settlement, conflict/idempotency, audit, privacy, and browser safety gate. |
| 8 | Browser local-mode persistence/security design | `docs/user-web-browser-local-mode-persistence-security-461` | Manual product/security/privacy/storage gate covering browser storage APIs, encryption, key handling, retention, device loss, sign-out/session behavior, migration, and backup/restore integration before any browser-local authority runtime. |

## Non-Goals And Explicit Prohibitions

This plan does not authorize:

- runtime app code changes;
- OpenAPI contract changes;
- generated-client changes;
- backend/API behavior changes;
- database schema or migrations;
- auth/session/security runtime changes;
- storage/file-byte behavior;
- export/download runtime;
- import/upload runtime;
- sync runtime or sync mutation;
- local backup/restore runtime;
- browser local-mode persistence;
- `localStorage`, `sessionStorage`, IndexedDB, browser cache, service workers,
  filesystem APIs, object URLs, or any browser persistence path;
- fake local mode, fake sync queues, fake backup packages, fake restore
  previews, fake sessions, fake users, fake groups, or fake data;
- money, bill, settlement, payment, report, storage, authorization, or audit
  authority changes;
- Docker, deployment, CI, environment, mobile, admin-web, or secret changes.

## Done Criteria For This Planning Gate

This planning gate is complete when it establishes:

- local backup/restore as separate from CSV/JSON export/import;
- current user-web backup/restore limitations;
- local-only versus server-mode authority boundaries;
- browser local-mode unsupported status;
- package manifest, section, file-reference, hash, encryption, and
  compatibility concepts;
- privacy/file handling boundaries;
- restore preview before restore confirmation;
- restore confirmation as a future mutation gate;
- conflict, duplicate, partial/selective restore, audit, retention, deletion,
  device-loss, and safe-failure direction;
- a future task sequence that keeps contracts, generated clients, runtime
  preview, mutation confirmation, and browser persistence design separate.
