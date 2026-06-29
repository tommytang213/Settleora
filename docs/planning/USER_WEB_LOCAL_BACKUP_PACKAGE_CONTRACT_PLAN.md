# User Web Local Backup Package Contract Plan

## Status

Planning/control gate for issue #461 after the merged
[User web local backup and restore plan](USER_WEB_LOCAL_BACKUP_RESTORE_PLAN.md).
This document narrows the next future OpenAPI/API design direction for local
backup package readiness, manifest creation, package generation/download,
package verification, and package metadata readback before any backup package
runtime work begins.

This document does not implement runtime app code, OpenAPI paths or schemas,
generated clients, backend/API behavior, database schema or migrations,
auth/session/security runtime, storage/file-byte behavior, backup package
creation, package parsing, package download, package upload, restore preview,
restore confirmation, sync mutation, browser local-mode persistence, Docker,
deployment, CI, mobile/admin behavior, or secrets.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [User web export, import, and local-mode implementation plan](USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md)
- [User web local backup and restore plan](USER_WEB_LOCAL_BACKUP_RESTORE_PLAN.md)
- [User web local backup package manifest and session plan](USER_WEB_LOCAL_BACKUP_PACKAGE_SESSION_PLAN.md)
- [User web sync and local status plan](USER_WEB_SYNC_LOCAL_STATUS_PLAN.md)
- [User web sync and local status contract plan](USER_WEB_SYNC_LOCAL_STATUS_CONTRACT_PLAN.md)
- [User web export readiness contract plan](USER_WEB_EXPORT_READINESS_CONTRACT_PLAN.md)
- [User web import preflight and review plan](USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md)
- [User web import confirmation contract plan](USER_WEB_IMPORT_CONFIRMATION_CONTRACT_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Local backup and restore package security](../architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)

## Current State

The current generated web client has export/import/sync-local status methods,
but no local backup package contract:

| Area | Current generated methods | Backup package implication |
| --- | --- | --- |
| Bill export | `getPersonalBillExportReadiness`, `getGroupBillExportReadiness`, `exportPersonalBillsCsv`, `exportPersonalBillsJson`, `exportGroupBillsCsv`, `exportGroupBillsJson` | Scoped CSV/JSON bill export is data egress for rows. It is not a versioned backup package and does not provide package manifest, encrypted file sections, restore compatibility, or local authority-boundary movement. |
| Bill import | `preflightPersonalBillsCsvImport`, `preflightGroupBillsCsvImport`, `createPersonalBillCsvImportSession`, `createGroupBillCsvImportSession`, `getBillCsvImportSession`, `confirmBillCsvImportSession`, `discardBillCsvImportSession`, `importPersonalBillsCsv`, `importGroupBillsCsv` | CSV import and staged import sessions are bill-row data ingress. They are not backup restore, do not restore files, and do not authorize package parsing or whole-profile restoration. |
| Sync/local status | `getSyncLocalStatus`, `listSyncChanges`, `submitSyncOperation`, `getSyncOperation` | `getSyncLocalStatus` can honestly report backup/restore as unsupported. Sync changes/operations are not backup package generation, verification, download, or restore methods. |
| Bill archive restore | `restorePersonalBill`, `restoreGroupBill` | These restore an archived bill lifecycle flag. They are not backup package restore. |

Generated method availability is not runtime approval. The existence of
export, import, sync, or bill lifecycle methods does not decide backup package
eligibility, policy, package contents, encryption/key handling, file-section
inclusion, restore compatibility, audit posture, retention, browser download
safety, or user-web authority boundaries.

No current generated-client method creates a backup readiness result, backup
package manifest, package generation session, package download artifact,
package verification result, package metadata readback, restore package
manifest read, restore preview, restore confirmation, or browser-local
persistence state.

## Why CSV/JSON Export Is Not Local Backup

CSV/JSON export is a scoped copy of selected bill data. It is useful for
spreadsheet review, bounded portability, and future import review, but it is
not a complete local backup package.

A local backup package needs a reviewed package contract because it may carry:

- source authority-boundary provenance;
- profile/workspace identity metadata;
- package schema and compatibility markers;
- data section inventory and section hashes;
- file/blob section inventory and content hashes;
- encrypted sensitive sections;
- privacy/vault, retention, deletion, Trash, and redaction markers;
- local profile settings and local-only records;
- personal bills and safe recurring/forecast data where supported;
- receipt/proof/QR/payment images only through approved encrypted package
  sections and stable package-local file references;
- OCR/review metadata only where safe;
- import/export provenance and audit-friendly metadata;
- restore compatibility, duplicate, conflict, and unsupported-section
  readouts.

User web must not label CSV/JSON export as `Backup`, must not label CSV import
as `Restore backup`, and must not imply exported bill rows are a live sync
link, server database restore, or durable local authority-boundary package.

## Authority Boundaries

API/domain services remain authoritative in server mode for actor identity,
session validity, authorization, policy, money, settlement state, bill status
transitions, storage access, file inclusion, audit, and sync acceptance.

Personal/local-only backup package work is different from server-mode package
copies:

- Personal/local-only package creation affects a local authority boundary when
  a reviewed local persistence design exists. It may package local profile
  settings, local personal bills, local recurring/forecast data, local
  provenance, and approved encrypted file sections only inside that boundary.
- Server-mode package creation is data egress from API/domain-authorized
  server truth. It creates a copy with provenance; it must not claim to move
  server authority, overwrite server records, preserve a live server link, or
  clear server conflicts.
- Restoring or importing server-mode shared records requires a separate
  authenticated API/domain-validated import/restore contract. A backup package
  cannot silently create server groups, friend relationships, memberships,
  settlements, accepted bill revisions, confirmed payments, audit truth, or
  server file metadata.

Hidden shared/group data must stay hidden. Manifest previews, package
metadata, problem messages, duplicate summaries, section inventory, or file
inventory must not reveal group existence, member identities, bills,
settlements, files, payment details, notes, OCR text, or private records the
current actor is not authorized to see.

## Browser Local-Mode Boundary

Browser local mode remains unsupported until a separate
persistence/security/encryption/retention/device-loss/migration design exists.

This plan does not approve `localStorage`, `sessionStorage`, IndexedDB, Cache
Storage, service workers, browser cache, object URLs, browser file-system
APIs, downloaded files, selected files, or in-memory browser state as
Settleora financial truth, local profile storage, sync queue storage, backup
package state, restore session storage, import/export history, file storage,
OCR/private-note storage, payment-detail storage, or migration state.

Future browser local-mode design must happen before any IndexedDB,
localStorage, sessionStorage, cache, service-worker, object URL, file-system,
or fake local queue behavior becomes a Settleora authority boundary.

## Backup Readiness And Eligibility Concepts

Before any package is created, a future contract should expose a non-mutating
readiness/eligibility result. Names below are planning labels only, not
approved OpenAPI paths, operation IDs, schemas, or enum values.

Recommended endpoint categories:

- backup readiness/eligibility read;
- package manifest creation or package generation preflight;
- package generation/download;
- package verification;
- package metadata readback.

Implementation update on 2026-06-29: the first readiness contract slice chose
`GET /api/v1/local-backup/package-readiness` with operation ID
`getLocalBackupPackageReadiness` for the metadata-only readiness/eligibility
read. The endpoint is authenticated and reports package generation/download,
restore preview/confirmation, browser local persistence, and local-mode
authority as unsupported. It does not create packages, return package bytes,
download files, parse restore data, write local/server records, or create
browser state.

Follow-up planning update on 2026-06-30: the
[user web local backup package manifest and session plan](USER_WEB_LOCAL_BACKUP_PACKAGE_SESSION_PLAN.md)
defines the next docs-only gate for future package-session lifecycle,
manifest/session metadata, data-egress consent, bounds, expiry, retry,
cancellation, discard, and stale-session behavior before any OpenAPI/backend
package session or generation/download contract is implemented.

Readiness should answer whether the current actor, profile mode, scope,
policy, package size, file section, encryption state, and server/local mode are
eligible for package creation. It should not create package bytes, download
files, parse restore uploads, write local/server records, or create browser
state.

Recommended readiness response concepts:

| Concept | Purpose |
| --- | --- |
| `available` | Whether package creation can proceed for the current actor/scope/profile mode. |
| `stableCode` | Machine-readable safe code such as ready, unsupported, policy disabled, encryption required, or package too large. |
| `scope` | Personal/local-only or server-mode copy scope, with safe labels only. |
| `profileMode` | Local-only, server-mode copy, browser-local unsupported, or unknown. |
| `eligibleSections` | Data and file section categories that may be included. |
| `blockedSections` | Categories blocked by policy, capability, encryption, file, privacy, auth/session, size, or server-mode authority rules. |
| `estimatedCounts` | Bounded record/file counts by safe category when current-actor scoped. |
| `estimatedBytes` | Bounded package-size estimate when practical. |
| `encryptionRequirement` | Required, unsupported, unavailable, passphrase required, or platform key required. |
| `redactionFlags` | Privacy categories that will be omitted or redacted. |
| `compatibilityMarkers` | Package/schema/version capabilities and unsupported required features. |
| `auditPreview` | Safe audit category/correlation details for future package creation. |
| `expiresAt` | Optional readiness expiry requiring a fresh read before generation. |

Readiness must fail closed for unauthenticated/server-mode actors, expired
sessions, unsupported browser local mode, disabled policy, missing capability,
required encryption that cannot be satisfied, package size limits, unsupported
file sections, unsupported versions, and server-mode data that cannot be
exported as local authority.

## Package Manifest Concepts

A future package manifest should be safe to parse and display before any
payload write or restore mutation. The manifest is metadata and provenance,
not authorization, auth identity, storage authority, or financial truth by
itself.

Manifest concepts should include:

- package format name;
- manifest ID;
- app version;
- package schema version;
- manifest schema version;
- package creation time;
- producer category;
- source profile mode;
- source authority-boundary category;
- profile identity metadata where safe, such as display label, local profile
  category, source server/workspace marker, and privacy mode;
- data section inventory;
- file/blob section inventory;
- per-section content hashes;
- per-blob content hashes;
- optional package-level integrity marker;
- redaction and privacy flags;
- retention, deletion, soft-delete, archive, and Trash markers;
- import/export provenance markers;
- compatibility markers, including required and optional feature flags;
- unsupported section markers;
- package-size and section-count summaries;
- encryption metadata categories, key wrapping category, recovery category,
  and algorithm/version markers where future cryptography design approves
  them.

The manifest must not include passwords, raw session tokens, refresh tokens,
provider tokens, MFA/TOTP seeds, passkey private material, recovery codes,
reset tokens, reusable challenges, raw vault keys, raw data keys, passphrases,
private keys, SSH material, `.env` values, storage object keys, direct
filesystem paths, local device paths, signed URLs, provider internals, file
bytes, raw OCR text, hidden shared/group data, raw payment details, private
notes, or local Codex state.

## Package Content Categories

Future package contracts should explicitly identify which categories are
included, omitted, redacted, blocked, unsupported, or encrypted.

Candidate included categories, when policy and authority allow:

- local profile settings;
- local personal bill records;
- personal bill metadata and safe bill history;
- recurring bills and forecast data where supported;
- categories, tags, merchant labels, and safe search metadata where supported;
- receipt images, supporting files, settlement proofs, QR/payment images, and
  payment-related images only through stable package-local file references and
  approved encrypted package sections;
- OCR/review metadata where safe, excluding raw OCR text unless a later
  privacy contract explicitly allows and protects it;
- import/export provenance;
- local backup/export/restore provenance;
- audit-friendly metadata such as safe counts, source package/session IDs,
  policy categories, timestamps, and correlation IDs;
- deletion, retention, archive, soft-delete, and Trash markers.

Explicit exclusions or special-handling categories:

- server-mode shared/group records are copies only and require explicit
  server validation before any server acceptance;
- friend relationships, group membership, group roles, and collaboration
  membership are not local authority;
- settlements involving other users, confirmed payments, residual effects,
  accepted bill revisions, participant acceptance, and payer confirmation
  require server/API-domain validation before server truth changes;
- hidden shared data must not appear in metadata, previews, problem details,
  duplicate summaries, or restored search rows;
- admin/system data is excluded unless a separate admin/deployment backup
  design approves it;
- secrets, raw auth/session tokens, provider credentials, MFA/passkey
  material, recovery codes, raw keys, and credential material are always
  excluded;
- storage provider internals, direct storage paths, object keys, signed URLs,
  and direct filesystem/local device paths are always excluded.

## Encryption, Password, And Key-Handling Direction

Backups should be encrypted by default where feasible. This document does not
select production cryptography, key derivation, key wrapping, storage, or
recovery design.

Future contract/runtime work should cover:

- authenticated encryption and integrity checks;
- per-package or per-section encryption where justified;
- platform/keychain-backed wrapping where available;
- user passphrase support for portable backups where approved;
- explicit encrypted-section metadata that is non-secret;
- safe failure when required key access is unavailable;
- policy and audit handling for any separately approved unencrypted fallback.

Contracts, manifests, metadata readback, logs, reports, audit records, problem
details, and validation output must never expose raw keys, vault root keys,
data keys, recovery keys, recovery codes, passphrases, passwords, bearer
tokens, refresh tokens, provider tokens, passkey private material, TOTP seeds,
reset tokens, reusable auth challenges, private keys, SSH material, `.env`
values, or local Codex state.

## File Handling Requirements

Backup package file references must be provider-neutral and package-local.

Prohibited fields and behaviors:

- direct filesystem paths;
- local device paths;
- browser-local device paths as authoritative storage;
- mounted volume paths;
- temporary paths;
- storage object keys;
- bucket names;
- provider-internal identifiers;
- provider paths;
- signed URLs;
- raw server storage paths;
- API storage roots;
- direct download links that bypass API authorization;
- treating a package-local blob ID as a server file ID or server access grant.

Allowed planning concepts:

- package-local blob ID;
- purpose/category;
- content type category;
- bounded size;
- inclusion state;
- redaction/privacy flags;
- privacy/vault category;
- content hash;
- section hash;
- authorized subject provenance;
- missing/blocked/unsupported file section status.

Restored file candidates require a future upload/import-intent or restore-file
contract before they become server file metadata or readable server content.

## Future Endpoint Categories

Names below are planning examples only. A later OpenAPI/API task must choose
exact paths, operation IDs, request/response schemas, status codes, problem
types, authorization policy, and generated-client names.

Possible endpoint family:

```text
GET  /api/v1/backups/readiness
POST /api/v1/backups/manifests
POST /api/v1/backups/packages
GET  /api/v1/backups/packages/{backupPackageId}
GET  /api/v1/backups/packages/{backupPackageId}/download
POST /api/v1/backups/packages/{backupPackageId}/verify
POST /api/v1/backups/packages/{backupPackageId}/discard
```

The future contract should decide whether package generation is synchronous,
asynchronous, or session-based. If package generation can outlive one request,
the contract must define session/job status, expiry, discard, idempotency,
download availability, temporary artifact cleanup, and safe metadata readback.

Package download is data egress and storage/file-byte behavior. It requires a
separate manual-gated OpenAPI/API/storage/privacy/runtime task before user web
may call it.

## Stable Code Families

Future responses and problem details should use stable code families separate
from localized display text. Planning names include:

- `backup_package_ready`
- `backup_package_generation_unsupported`
- `backup_package_readiness_unavailable`
- `backup_package_policy_disabled`
- `backup_package_too_large`
- `backup_package_encryption_required`
- `backup_package_unsupported_version`
- `backup_package_missing_capability`
- `backup_package_manifest_unavailable`
- `backup_package_generation_failed`
- `backup_package_download_unavailable`
- `backup_package_verification_failed`
- `backup_package_integrity_failed`
- `backup_package_tampered`
- `unsupported_browser_local_mode`
- `local_persistence_unsupported`
- `unsupported_file_sections`
- `unsupported_encrypted_sections`
- `passphrase_required`
- `key_access_failed`
- `platform_key_unavailable`
- `unsupported_encryption_mode`
- `auth_required`
- `session_required`
- `session_expired`
- `policy_disabled`
- `server_mode_data_not_exportable_as_local_authority`

These planning names are not approved OpenAPI enum values, generated-client
model names, or problem codes until a later contract task adds them.

Unknown future codes must fail closed in user web. Clients should show an
unavailable state instead of enabling package creation or download.

## Audit Expectations

Future backup package behavior must emit bounded audit from the correct
authority boundary.

Server-participating flows require API/domain audit for:

- backup readiness checked;
- backup package generation requested;
- package manifest created;
- package generation completed;
- package generation failed or blocked;
- package download requested;
- package download completed or failed;
- package verification requested;
- package verification failed or blocked;
- package metadata readback;
- package discarded, expired, or retention-cleaned;
- suspicious repeated denied readiness/generation/download attempts.

Future restore preview and confirmation have separate audit categories and
must not be collapsed into package generation audit.

Audit/log metadata may include actor/profile/session correlation where
authorized, source authority-boundary category, package/session/job
correlation ID, safe counts, section categories, stable problem codes, policy
categories, timestamps, and request correlation IDs.

Audit/log metadata must not include secrets, tokens, passwords, recovery
codes, MFA/passkey material, raw keys, raw OCR text, raw notes, raw CSV/JSON,
file bytes, storage paths, object keys, signed URLs, provider internals, local
paths, raw package payloads, raw exception dumps, hidden record details,
payment details outside authorized scope, or private vault plaintext.

## Privacy, Retention, And Browser Artifact Boundaries

Backup packages are sensitive user-controlled copies and may outlive records
that were later archived, soft-deleted, hard-deleted, retention-cleaned, or
privacy-erased in Settleora. Product copy and contracts must make this risk
visible before generation and download.

Future package contracts must define:

- temporary package artifact retention;
- session/job expiry;
- discard behavior;
- cleanup for failed or abandoned package generation;
- whether generated packages are stored server-side, streamed, or generated
  on demand;
- safe download filenames and content types;
- browser memory handling expectations;
- object URL lifecycle if a future runtime task approves object URLs;
- log redaction;
- audit metadata redaction;
- no raw package contents in reports, telemetry, problem details, or logs.

Until separately approved, user web must not persist package bytes, manifests,
metadata readback, restore files, object URLs, file handles, or backup state
in browser storage.

## Future Validation Expectations

This docs-only task requires docs/scaffold validation only.

Future OpenAPI/backend backup package contract work should validate:

- OpenAPI validity;
- generated-client freshness through `npm run generate:clients`;
- no hand edits to generated clients;
- authenticated readiness success and fail-closed unauthenticated/session
  behavior;
- current-actor scope and no hidden data leakage;
- unsupported browser local mode returns stable unsupported codes;
- policy disabled, encryption required, missing capability, package too large,
  unsupported file section, unsupported version, and server-mode authority
  blockers return safe problem details;
- audit/log review for no secrets, file bytes, raw package contents, storage
  internals, hidden data, raw OCR text, raw notes, or tokens;
- package generation/download tests only when runtime generation/download is
  actually implemented in a later task;
- storage/file-byte validation only when file sections or package bytes are in
  scope;
- restore preview and restore confirmation validation only in later restore
  contract/API tasks.

## Required Sequencing

Keep backup package and restore work split across reviewable gates:

1. Docs-only backup package contract plan.
2. Docs-only backup package manifest/session plan.
3. OpenAPI/backend backup package read/generation/session contract.
4. Generated-client refresh through the repo generation workflow.
5. User-web backup package runtime.
6. Restore preview contract/API.
7. Restore confirmation contract/API.
8. Browser local-mode persistence/security design before any IndexedDB,
   localStorage, sessionStorage, cache, service-worker, file-system, object
   URL, browser-local queue, or browser-local authority runtime.

The sequence may split package readiness and package download into separate
contract/runtime tasks if storage/file-byte or retention risk warrants it.

## Explicit Non-Goals

This plan does not authorize:

- runtime app code;
- OpenAPI paths or schemas;
- generated-client changes;
- backend/API behavior;
- database schema or migrations;
- auth/session/security runtime;
- storage/file-byte behavior;
- backup package creation, parsing, download, upload, verification, preview,
  confirmation, or restore runtime;
- browser local-mode persistence;
- `localStorage`, `sessionStorage`, IndexedDB, browser cache, service workers,
  filesystem APIs, object URLs, or fake local queues;
- sync runtime or sync mutation;
- import/export mutation runtime;
- mobile app code;
- admin web code;
- Docker, deployment, CI, environment, or secrets;
- money, bill, settlement, payment, recurring, OCR, report, storage,
  authorization, or audit authority changes;
- Day 1 scope reduction.

## Acceptance Checklist

- Explains why CSV/JSON export is not a local backup package.
- Explains why generated export/import/sync methods are insufficient approval
  for backup/restore runtime.
- Distinguishes personal/local-only and server-mode backup boundaries.
- Keeps browser local mode unsupported until separate persistence/security
  design exists.
- Defines backup package readiness and eligibility concepts.
- Defines package manifest, content, file, encryption, privacy, retention,
  audit, and stable code planning concepts.
- Identifies future endpoint categories as planning-only concepts without
  editing OpenAPI.
- Keeps restore preview and restore confirmation as later separate gates.
- States the required validation expectations and sequencing before runtime.
