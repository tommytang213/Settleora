# User Web Local Backup Package Manifest And Session Plan

## Status

Planning/control gate for issue #461 after PR #610 merged the read-only
local backup package readiness contract/API slice. This document defines the
future package manifest and package-session direction before any package
generation, package download, restore preview, restore confirmation, browser
local persistence, storage/file-byte runtime, OpenAPI package-session contract,
or generated-client refresh begins.

This document does not implement runtime app code, OpenAPI paths or schemas,
generated clients, backend/API behavior, database schema or migrations,
auth/session/security runtime, storage/file-byte behavior, backup package
generation, package download, package parsing, restore preview, restore
confirmation, browser local-mode persistence, import/export mutation runtime,
sync mutation/runtime, Docker, deployment, CI, mobile/admin behavior, or
secrets.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [User web export, import, and local-mode implementation plan](USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md)
- [User web local backup and restore plan](USER_WEB_LOCAL_BACKUP_RESTORE_PLAN.md)
- [User web local backup package contract plan](USER_WEB_LOCAL_BACKUP_PACKAGE_CONTRACT_PLAN.md)
- [User web local backup package generation and download plan](USER_WEB_LOCAL_BACKUP_PACKAGE_GENERATION_DOWNLOAD_PLAN.md)
- [User web sync and local status plan](USER_WEB_SYNC_LOCAL_STATUS_PLAN.md)
- [User web sync and local status contract plan](USER_WEB_SYNC_LOCAL_STATUS_CONTRACT_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Local backup and restore package security](../architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)

## Current State After PR #610

PR #610 added `GET /api/v1/local-backup/package-readiness` with operation ID
`getLocalBackupPackageReadiness`. The endpoint is authenticated and returns
metadata-only readiness for the current actor. Its current posture is
intentionally unsupported for package generation, package download, restore
preview, restore confirmation, browser local persistence, and local-mode
authority.

The readiness response is useful because it gives user web a safe way to
explain that backup package runtime is not available. It is not enough to
generate or download a backup package because it does not:

- create a package session, job, or artifact;
- create or return a package manifest;
- select a package scope or data sections;
- estimate final row/file/byte counts with confirmation-time revalidation;
- reserve temporary package storage or streaming state;
- include package bytes, file bytes, package-local blob entries, or download
  eligibility;
- verify hashes, encrypted sections, or package integrity;
- bind data-egress consent or confirmation copy to an auditable action;
- define expiry, retry, cancellation, discard, stale-session, or cleanup
  behavior;
- authorize server-side section inclusion beyond the current readiness
  readout;
- parse restore files, create restore previews, or confirm restore writes.

Generated-client availability also remains insufficient approval. The presence
of `getLocalBackupPackageReadiness` means only that a metadata read exists; it
does not authorize package bytes, browser download behavior, storage reads,
restore parsing, restore mutation, browser-local state, or user-web runtime
wiring.

## Authority And Mode Boundaries

Personal/local-only package work and server-mode package work are separate
authority boundaries.

Personal/local-only package creation may eventually package local profile
settings, local personal records, local recurrence/report metadata, local
provenance, and approved encrypted file sections only inside a reviewed local
authority boundary. Browser user web does not currently have that local
authority boundary.

Server-mode package creation is data egress from API/domain-authorized server
truth. A server-mode package is a copy with provenance. It must not claim to
move server authority, preserve a live server link, overwrite server records,
clear conflicts, replay settlements, relink files, create groups, create friend
relationships, create collaboration memberships, or create server audit truth.

Hidden shared/group data must remain hidden. Manifest metadata, readiness
details, session status, duplicate summaries, problem details, and package
section inventory must not reveal hidden group existence, member identities,
inaccessible bills, settlements, files, payment details, notes, OCR text, or
private records.

## Browser Local-Mode Boundary

Browser local mode remains unsupported until a separate
persistence/security/encryption/retention/device-loss/migration design exists.

This plan does not approve `localStorage`, `sessionStorage`, IndexedDB, Cache
Storage, service workers, browser cache, object URLs, browser file-system
APIs, selected file handles, downloaded files, or in-memory browser state as
Settleora financial truth, local profile storage, sync queue storage, backup
package state, restore session storage, import/export history, file storage,
OCR/private-note storage, payment-detail storage, or migration state.

Until that design exists, browser user web may show unsupported/readiness
states only. It must not create fake local profiles, fake local bills, fake
backup packages, fake package sessions, fake restore previews, fake sync
queues, or fake browser-local authority.

## Future Package-Session Lifecycle

Names in this section are planning labels only. A later OpenAPI/API task must
choose exact paths, operation IDs, schemas, status codes, problem types,
authorization policy, generated-client names, and retention behavior.

Implementation update on 2026-06-30: the metadata-only package-session
contract/API slice chose these authenticated endpoints:

- `POST /api/v1/local-backup/package-sessions` with operation ID
  `createLocalBackupPackageSession`
- `GET /api/v1/local-backup/package-sessions/{packageSessionId}` with
  operation ID `getLocalBackupPackageSession`
- `POST /api/v1/local-backup/package-sessions/{packageSessionId}/discard`
  with operation ID `discardLocalBackupPackageSession`

The slice creates and reads only short-lived package-session metadata for the
current actor and current auth session. It reports manifest concepts,
readiness, expiry, discard state, confirmation copy, stable codes, and
unsupported feature families. It does not create package artifacts, package
bytes, package manifests, downloads, storage objects, storage paths, file-byte
reads or writes, restore previews, restore confirmations, browser-local
persistence, user-web runtime controls, or server/local business-record
mutations.

Follow-up planning update on 2026-06-30: the
[user web local backup package generation and download plan](USER_WEB_LOCAL_BACKUP_PACKAGE_GENERATION_DOWNLOAD_PLAN.md)
defines the next docs-only gate for future package generation/download,
artifact status, short-lived download actions, storage/file-byte boundaries,
retention/cleanup, encryption/key-handling direction, and browser download
safety before any OpenAPI/backend package artifact or user-web runtime work is
implemented.

A future package-session contract should be staged:

1. Create: start a bounded package session for the authenticated current actor,
   selected scope, requested section families, and data-egress intent.
2. Inspect: read safe session metadata, eligibility, manifest preview, problem
   categories, counts, expiry, and next allowed actions without returning
   package bytes.
3. Prepare/generate: produce or queue the package artifact only after current
   actor, policy, section eligibility, encryption requirement, file inclusion,
   size limits, and consent copy are revalidated.
4. Download eligibility: report whether an artifact is ready for download,
   expired, blocked, cancelled, discarded, failed, or stale. Eligibility is not
   a direct storage URL or storage authorization token.
5. Expire: mark sessions and artifacts unusable after a short retention window
   and clean up temporary package artifacts according to policy.
6. Discard/cancel: let the actor cancel pending generation or discard an
   unexpired generated package without deleting source records.

Session state should be explicit and additive where possible. Planning state
families include `created`, `inspecting`, `ready_to_prepare`, `preparing`,
`ready_to_download`, `downloaded`, `failed`, `blocked`, `expired`,
`cancelled`, `discarded`, and `stale_requires_recheck`.

The contract must define idempotency and retry behavior. Retrying a create or
prepare action with the same idempotency key and same request digest should
not create duplicate package artifacts. Reusing a session or idempotency key
with a different request digest must fail closed or create a conflict/problem
state, not silently overwrite package scope.

## Manifest Concepts

A future manifest should be safe to parse and display before any payload write
or restore mutation. It is provenance and compatibility metadata, not
authorization, account identity, storage authority, or financial truth.

Required manifest concepts:

- package format name and package version;
- manifest ID and manifest schema/contract version;
- app version and producer category;
- source schema/local persistence version where relevant;
- source profile mode, such as local-only, server-mode copy, or unsupported
  browser-local;
- owner profile or source profile provenance where safe, including display
  label/category but not auth authority;
- generated timestamp and package-session correlation ID;
- source authority boundary and source workspace/server marker where safe;
- data section inventory and section compatibility markers;
- bounded counts by safe category;
- per-section hashes and optional package-level integrity marker;
- package-local file/blob inventory with size, purpose/category, content type
  category, inclusion state, hash, privacy/vault category, and subject
  provenance;
- redaction flags and omitted/blocked section markers;
- file-byte inclusion policy and whether files are included, redacted,
  unsupported, policy-disabled, too large, missing, or encrypted;
- retention, deletion, archive, soft-delete, and Trash metadata;
- import/export/backup provenance markers;
- required and optional feature markers;
- encryption metadata categories, key wrapping category, recovery category,
  and algorithm/version markers where a future crypto design approves them.

The manifest must not include passwords, raw session tokens, refresh tokens,
provider tokens, MFA/TOTP seeds, passkey private material, recovery codes,
reset tokens, reusable challenges, raw vault keys, raw data keys, passphrases,
private keys, SSH material, `.env` values, storage object keys, direct
filesystem paths, local device paths, signed URLs, provider internals, file
bytes, raw OCR text, hidden shared/group data, raw payment details, private
notes, or local Codex state.

## Package Content Categories And Day 1 Exclusions

Future package contracts should mark each section as included, omitted,
redacted, blocked, unsupported, policy-disabled, too large, missing, or
encrypted.

Candidate Day 1 user-web package categories, when policy and authority allow:

- local profile settings or server-mode current-actor profile copy metadata;
- personal bill records and safe bill history;
- recurring bills and forecast metadata where supported;
- categories, tags, merchant labels, and safe search metadata where supported;
- receipt images, supporting files, settlement proofs, QR/payment images, and
  payment-related images only through approved encrypted package-local file
  sections;
- OCR/review metadata where safe, excluding raw OCR text unless a later
  privacy contract explicitly allows and protects it;
- import/export provenance;
- local backup/export/restore provenance;
- audit-friendly metadata such as safe counts, source session IDs, policy
  categories, timestamps, and correlation IDs;
- deletion, retention, archive, soft-delete, and Trash markers.

Explicit exclusions or special-handling categories:

- server-mode shared/group records are copies only and require explicit server
  validation before any server acceptance;
- friend relationships, group membership, group roles, and collaboration
  membership are not local authority;
- settlements involving other users, confirmed payments, residual effects,
  accepted bill revisions, participant acceptance, and payer confirmation
  require API/domain validation before server truth changes;
- hidden shared data must not appear in metadata, previews, problem details,
  duplicate summaries, or restored search rows;
- admin/system/deployment data is excluded unless a separate admin/deployment
  backup design approves it;
- secrets, raw auth/session tokens, provider credentials, MFA/passkey material,
  recovery codes, raw keys, credential material, storage provider internals,
  direct storage paths, object keys, signed URLs, and direct filesystem/local
  device paths are always excluded.

## Encryption And Key-Handling Direction

Backups should be encrypted by default where feasible. This plan does not
choose production cryptography, final algorithms, key derivation, key
wrapping, storage, recovery design, or exact parameters.

Future contract/runtime work should define:

- authenticated encryption and integrity checks for package payloads;
- per-package or per-section key strategy where justified;
- platform/keychain-backed wrapping where available;
- user passphrase support for portable backups where approved;
- non-secret encryption metadata for algorithm/version, key wrapping category,
  recovery category, vault/envelope compatibility, and safe failure codes;
- fail-closed behavior when required key access is unavailable;
- explicit warnings and audit for any separately approved unencrypted fallback.

Contracts, manifests, metadata readback, logs, reports, audit records, problem
details, and validation output must never expose raw keys, vault root keys,
data keys, recovery keys, recovery codes, passphrases, passwords, bearer
tokens, refresh tokens, provider tokens, passkey private material, TOTP seeds,
reset tokens, reusable auth challenges, private keys, SSH material, `.env`
values, or local Codex state.

## Data-Egress Consent And Safe Problems

Package generation and package download are sensitive data-egress actions. A
future package-session contract should require explicit readiness and consent
before generation and again before download where policy requires it.

Consent/readiness should cover:

- selected scope and authority boundary;
- included, excluded, redacted, blocked, and encrypted section families;
- current actor authorization and session freshness;
- estimated row/file/byte counts and hard limits;
- file-byte inclusion policy;
- package retention/expiry and user-controlled copy warnings;
- privacy/vault warnings and no-downgrade blockers;
- confirmation copy that names the action, such as `Generate backup package`,
  `Download backup package`, `Cancel package generation`, or `Discard backup
  package`.

Future responses and problem details should use stable code families separate
from localized display text. Planning families include
`backup_package_session_created`, `backup_package_ready_to_prepare`,
`backup_package_preparing`, `backup_package_ready_to_download`,
`backup_package_generation_unsupported`, `backup_package_download_unsupported`,
`backup_package_policy_disabled`, `backup_package_too_large`,
`backup_package_file_count_exceeded`, `backup_package_row_count_exceeded`,
`backup_package_expired`, `backup_package_cancelled`,
`backup_package_discarded`, `backup_package_stale_requires_recheck`,
`backup_package_integrity_failed`, `backup_package_tampered`,
`backup_package_encryption_required`, `unsupported_browser_local_mode`,
`local_persistence_unsupported`, `unsupported_file_sections`,
`passphrase_required`, `key_access_failed`, `platform_key_unavailable`, and
`server_mode_data_not_exportable_as_local_authority`.

These planning names are not approved OpenAPI enum values, generated-client
model names, or problem codes until a later contract task adds them. Unknown
future codes must fail closed in user web.

Problem details must not echo raw package payloads, raw request bodies, raw
CSV/JSON, file bytes, raw OCR text, private notes, payment details outside
authorized scope, hidden record details, stack traces, storage paths, object
keys, signed URLs, provider internals, local paths, tokens, secrets, or
credential material.

## Audit Expectations

Future package-session behavior must emit bounded audit from the correct
authority boundary. Readiness audit and final data-egress audit should remain
distinct.

Audit preview may be included in readiness/session inspect responses as safe
metadata only: action category, source authority boundary category, package
session correlation ID, section categories, safe count categories, policy
categories, and expiry timestamp.

Final audit should be emitted only when the relevant action is requested,
completed, failed, blocked, cancelled, discarded, expired, downloaded, or
retention-cleaned. Package generation audit must not be collapsed with restore
preview or restore confirmation audit.

Audit/log metadata must not include secrets, tokens, passwords, recovery
codes, MFA/passkey material, raw keys, raw OCR text, raw notes, raw CSV/JSON,
file bytes, storage paths, object keys, signed URLs, provider internals, local
paths, raw package payloads, raw exception dumps, hidden record details,
payment details outside authorized scope, or private vault plaintext.

## Authorization, Privacy, And File Metadata Rules

Every package section must be authorized server-side for the current actor at
the time of create/inspect/prepare/download. User web must not infer section
eligibility from hidden buttons, cached rows, generated-client availability,
group labels, local search results, route state, prior readiness, or stale
session state.

Package metadata and responses must not include:

- direct storage paths;
- object keys;
- bucket names;
- provider-internal identifiers;
- signed URLs;
- filesystem paths;
- local device paths;
- mounted volume paths;
- temp paths;
- direct API storage roots or provider internals;
- hidden shared/group data.

Allowed planning concepts are package-local blob IDs, safe content hashes,
bounded size, purpose/category, content type category, inclusion state,
redaction/privacy flags, privacy/vault category, missing/blocked/unsupported
status, and authorized subject provenance.

A package-local blob ID does not authorize server reads or writes. Restored
file candidates require a future upload/import-intent or restore-file contract
before they become server file metadata or readable server content.

## Bounds, Expiry, Retry, Cancellation, And Stale Sessions

Future contracts must define hard and policy-configurable bounds before
generation and download:

- row count limits by section;
- file count limits by purpose/category;
- per-file size limits;
- total package byte limits;
- manifest size limits;
- generated artifact retention window;
- session expiry window;
- retry limits and idempotency behavior;
- cancellation deadline while preparing;
- discard behavior after generation;
- stale-session behavior when actor, policy, source data, section counts,
  hashes, file availability, encryption capability, or session state changes.

If a session becomes stale, user web must reload or recreate the session
instead of generating or downloading from old readiness. Stale sessions should
produce safe problem details and preserve source records unchanged.

Cancellation and discard must not delete source records, mutate server truth,
clear conflicts, remove files, or affect settlements. They only affect package
session/artifact state and bounded audit/provenance.

## Future Generated-Client And Validation Expectations

Future OpenAPI/backend package-session work should validate:

- OpenAPI validity and generated-client freshness through the repo generation
  workflow;
- no hand edits to generated clients;
- authenticated create/inspect/prepare/download/discard/cancel success and
  fail-closed unauthenticated/session-expired behavior;
- current-actor section scoping and no hidden data leakage;
- server-side authorization and privacy checks for every package section;
- policy disabled, encryption required, unsupported browser local mode,
  unsupported file sections, package too large, row/file-count exceeded,
  stale session, cancelled/discarded/expired session, and download-unavailable
  problem details;
- no direct storage paths, object keys, signed URLs, provider internals, local
  paths, file bytes in metadata, raw package contents, raw OCR text, raw notes,
  tokens, or hidden record details in responses, audit, logs, and reports;
- package generation/download tests only when runtime bytes are actually in
  scope;
- restore preview and restore confirmation validation only in later restore
  contract/API tasks.

The later contract task should run the validation profile required by
OpenAPI/API/generated-client changes, including `npm run generate:clients`,
`npm run validate:openapi`, `npm run validate:clients`, focused API tests, and
broader API validation when API behavior is touched.

## Follow-Up Task Sequence

Keep package and restore work split across reviewable gates:

1. OpenAPI/backend package session/readiness/generation contract, including
   create/inspect/prepare/download eligibility/expire/discard/cancel concepts.
2. OpenAPI/backend package generation/download contract for existing package
   sessions, informed by the dedicated generation/download planning gate.
3. Generated-client refresh through the repo generation workflow.
4. Package generation/download runtime, including storage/file-byte,
   encryption/key handling, retention, audit, privacy, and data-egress gates.
5. Restore preview contract/API, with package parsing, manifest validation,
   integrity, encryption/key access, conflict/duplicate, file-section, and
   privacy gates.
6. Restore confirmation contract/API, with mutation, money/bill/settlement,
   storage/file, idempotency, audit, conflict, and privacy gates.
7. Browser local-mode persistence/security design before any IndexedDB,
   localStorage, sessionStorage, cache, service-worker, file-system, object
   URL, browser-local queue, or browser-local authority runtime.
8. User-web runtime wiring only after the relevant approved generated-client
   methods and runtime contracts exist.

## Explicit Non-Goals

This plan does not authorize:

- runtime app code;
- OpenAPI paths or schemas;
- generated-client changes;
- backend/API behavior;
- database schema or migrations;
- auth/session/security runtime;
- storage/file-byte behavior;
- backup package generation, parsing, download, upload, verification, preview,
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

- Explains why PR #610 readiness is not enough to generate or download a
  backup package.
- Distinguishes personal/local-only and server-mode package boundaries.
- Keeps browser local mode unsupported until separate persistence/security
  design exists.
- Defines future package-session create, inspect, prepare/generate, download
  eligibility, expire, discard, and cancel concepts.
- Defines manifest versioning, source authority, owner profile, data sections,
  counts, hashes, redaction, file inclusion, retention/Trash, and
  compatibility concepts.
- Defines Day 1 content categories and exclusions.
- Gives encryption/key-handling direction without selecting final cryptography
  or storing secrets.
- Defines data-egress consent, confirmation copy, stable code families, and
  safe problem details.
- Separates audit preview from final audit.
- Requires server-side authorization and privacy checks for all package
  sections.
- Prohibits storage paths, object keys, signed URLs, provider internals,
  filesystem/local paths, and hidden shared/group data in metadata/responses.
- Covers size, row, file-count, expiry, retry, cancellation, discard, and
  stale-session behavior.
- Defines future generated-client impact, validation expectations, and
  follow-up task sequence.
