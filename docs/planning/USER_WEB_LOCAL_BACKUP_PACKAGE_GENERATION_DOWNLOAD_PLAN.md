# User Web Local Backup Package Generation And Download Plan

## Status

Planning/control gate for issue #461 after PR #612 merged the metadata-only
local backup package-session contract/API slice. This document defines the
future package generation and download direction before any package bytes,
artifact creation, download behavior, storage/file-byte runtime, restore
preview, restore confirmation, browser-local persistence, OpenAPI generation
contract, or user-web runtime wiring begins.

This document does not implement runtime app code, OpenAPI paths or schemas,
generated clients, backend/API behavior, database schema or migrations,
auth/session/security runtime, storage/file-byte behavior, package generation,
package download, package parsing, restore preview, restore confirmation,
browser local-mode persistence, import/export mutation runtime, sync
mutation/runtime, Docker, deployment, CI, mobile/admin behavior, or secrets.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [User web export, import, and local-mode implementation plan](USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md)
- [User web local backup and restore plan](USER_WEB_LOCAL_BACKUP_RESTORE_PLAN.md)
- [User web local backup package contract plan](USER_WEB_LOCAL_BACKUP_PACKAGE_CONTRACT_PLAN.md)
- [User web local backup package manifest and session plan](USER_WEB_LOCAL_BACKUP_PACKAGE_SESSION_PLAN.md)
- [User web sync and local status plan](USER_WEB_SYNC_LOCAL_STATUS_PLAN.md)
- [User web sync and local status contract plan](USER_WEB_SYNC_LOCAL_STATUS_CONTRACT_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Local backup and restore package security](../architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)

## Current State After PR #612

PR #612 added authenticated metadata-only package-session endpoints:

- `POST /api/v1/local-backup/package-sessions`
- `GET /api/v1/local-backup/package-sessions/{packageSessionId}`
- `POST /api/v1/local-backup/package-sessions/{packageSessionId}/discard`

Those endpoints create, inspect, and discard short-lived package-session
metadata for the current actor/session. They intentionally do not create
package artifacts, package bytes, package manifests, downloads, storage
objects, storage paths, file-byte reads or writes, restore previews, restore
confirmations, browser-local persistence, user-web runtime controls, or
server/local business-record mutations.

The existing readiness and session contracts are useful prerequisites, not
data-egress approval. Package generation and download are separate gates
because they may produce a durable copy of sensitive financial, profile,
receipt, proof, payment, OCR, and provenance data that can leave Settleora's
runtime boundary.

## Why Generation And Download Are Separate Gates

Readiness answers whether the current actor and mode have a safe starting
posture. Package sessions bind short-lived metadata, scope, confirmation copy,
expiry, and unsupported feature families. Neither action has moved package
bytes.

Generation and download are more sensitive because they may:

- read and serialize authorized records and file sections;
- create a temporary server artifact or streamable package;
- include encrypted package-local file/blob payloads where policy allows;
- compute hashes, digests, section inventories, and compatibility markers;
- produce a user-controlled copy that can outlive source retention, deletion,
  or later privacy changes;
- require artifact retention, cleanup, timeout, retry, and audit controls;
- cause browser download behavior that must not persist data silently.

For that reason, future generation/download work must be reviewed as a
data-egress, storage/file-byte, auth/session, privacy, retention, audit, and
browser-safety gate even though readiness/session metadata already exists.

## Required Safety Sequence

Future user-web package generation/download must follow a staged sequence:

1. Read readiness for the authenticated current actor and current server/local
   mode posture.
2. Create a package session for the selected scope, section families, and
   explicit data-egress intent.
3. Inspect the package session and its safe manifest/session metadata,
   confirmation copy, expiry, unsupported features, and next allowed actions.
4. Request package prepare/generation only after revalidating actor, session,
   policy, section eligibility, file inclusion, encryption requirement, size
   limits, and confirmation copy.
5. Inspect generation/download status until the artifact is ready, blocked,
   failed, expired, cancelled, discarded, or stale.
6. Start a short-lived download action only when the API reports download
   eligibility. Eligibility is not a direct storage URL, object key, signed
   URL, provider path, or browser persistence grant.
7. Expire, discard, or cancel sessions and generated artifacts according to a
   short retention window. Cleanup affects only package-session/artifact state,
   not source records, files, settlements, bills, sync conflicts, or accounts.

If a readiness result or package session becomes stale, user web must reload
or recreate it instead of preparing or downloading from old metadata.

## Future Endpoint Categories

Names below are planning concepts only. A later OpenAPI/API task must choose
exact paths, operation IDs, schemas, status codes, problem types,
authorization policy, generated-client names, retention policy, and tests.

Recommended future endpoint categories:

- prepare or generate a package for an existing package session;
- inspect package generation and download status;
- download the generated package artifact;
- expire, discard, or cancel a generated package;
- optionally retry or rebuild a package when policy permits and the request
  digest/idempotency rules match.

The prepare/generate operation may be synchronous only for small packages, or
asynchronous when artifact creation can exceed request-time limits. Either
shape must define idempotency, retry, cancellation, timeout, stale-session,
temporary artifact cleanup, and safe status readback.

Download must be a short-lived API action. It must not expose storage provider
internals, signed URLs, direct object keys, filesystem paths, local device
paths, or provider-specific artifact identifiers.

## Package Artifact Model Concepts

Future package artifacts should be versioned, integrity-checkable, and safe to
preview before any restore approval. Required artifact/manifest concepts:

- package format name, package version, and manifest version;
- package ID and package-session ID or correlation ID;
- owner/source profile provenance and source mode posture;
- source authority boundary and source workspace/server marker where safe;
- app version, schema/local persistence version, and package contract version;
- generated timestamp, expiry timestamp, and producer category;
- content section list with included, omitted, redacted, blocked,
  unsupported, policy-disabled, too-large, missing, or encrypted states;
- bounded record/file counts and safe summaries by category;
- per-section hashes/digests, per-blob hashes/digests, and optional
  package-level integrity marker;
- redaction and omission list;
- file/blob inclusion policy, including whether files are included,
  encrypted, omitted, redacted, unsupported, missing, or too large;
- compatibility markers, required/optional feature markers, and minimum
  restore support markers;
- restore-preview requirements that say the package must be parsed,
  integrity-checked, compatibility-checked, and previewed separately before
  any write or authority-boundary movement.

Package metadata is provenance and compatibility information. It is not
authorization, account identity, storage authority, financial truth, group
membership, or restore approval.

## Privacy And Data-Egress Guardrails

Package generation/download must require a valid authenticated actor and
current session. Every section must be authorized server-side for the current
actor/profile at prepare and download time.

Future contracts and runtime must enforce:

- actor/profile ownership checks and current-session scoping;
- no hidden shared/group data in manifests, status, problem details,
  duplicate summaries, file inventories, or package metadata;
- no raw secrets, passwords, tokens, credentials, recovery codes,
  MFA/passkey material, raw keys, passphrases, private keys, SSH material,
  `.env` values, or local Codex state;
- no storage provider internals;
- no direct storage URLs, signed URLs, object keys, bucket names, filesystem
  paths, mounted paths, temporary paths, or local device paths in package
  metadata or API responses;
- no raw logs of package contents, package payloads, file bytes, raw OCR text,
  raw notes, raw CSV/JSON, payment details outside authorized scope, hidden
  record details, or private vault plaintext;
- bounded audit metadata only, such as actor/profile/session correlation,
  package/session correlation IDs, action category, safe count categories,
  section categories, stable code families, timestamps, policy categories,
  and request correlation IDs.

Denied and failed responses must fail closed without revealing whether
unrelated users, hidden groups, hidden bills, hidden files, settlements,
payment details, private notes, or inaccessible records exist.

## Storage And File-Byte Boundaries

All server-side file bytes must go through Settleora's storage abstraction
when server artifacts exist. A generated backup package is either a
provider-neutral temporary artifact behind API authorization or a directly
streamed response; it is never a public storage path.

Future generation/download work must define:

- whether artifacts are stored temporarily, streamed, or generated on demand;
- temporary artifact retention windows and cleanup after success, failure,
  expiry, cancellation, discard, abandoned sessions, and server restarts;
- artifact size limits, row/record limits, file-count limits, per-file size
  limits, manifest-size limits, request timeouts, retry limits, and rebuild
  posture;
- file inclusion rules by purpose/category and privacy/vault category;
- safe content types and download headers;
- no provider-specific artifact paths, object keys, bucket names, signed URLs,
  filesystem paths, or local paths in responses, metadata, audit, logs, or
  reports.

Package-local blob IDs and hashes are package integrity/provenance concepts.
They do not authorize server reads or writes and must not be treated as server
file IDs.

## Encryption And Key-Handling Direction

This plan is planning-only and does not choose production cryptography, final
algorithms, key derivation, key wrapping, passphrase policy, envelope formats,
or exact parameters unless a later security review approves them.

Future design must distinguish:

- server-side artifact protection for temporary artifacts while they exist;
- user-supplied package encryption or passphrase possibilities for portable
  backups;
- platform/keychain-backed wrapping where available;
- per-package or per-section key strategy if justified by policy;
- non-secret encryption metadata such as algorithm/version category,
  key-wrapping category, recovery category, vault/envelope compatibility, and
  safe failure codes.

No password, passphrase, raw key, vault root key, data key, recovery key,
recovery code, bearer/session/refresh token, provider token, MFA seed,
passkey private material, reusable challenge, private key, SSH material,
`.env` value, or local Codex state may be stored in package metadata, audit,
logs, problem details, reports, or generated clients.

A separate security review is required before production crypto choices,
unencrypted fallback policy, recovery behavior, passphrase UX, or vault
compatibility rules are implemented.

## Server Mode And Local-Only Boundaries

Server-mode generation creates an authorized copy with provenance. It must not
claim to move server authority, preserve a live server link, clear conflicts,
overwrite server records, replay settlements, create groups, create friend
relationships, create collaboration memberships, relink files, or create
server audit truth.

Local-only package work belongs to a reviewed local authority boundary.
Browser user web does not currently have approved browser-local authority.

Future generation/download behavior must not:

- silently create server accounts;
- silently migrate local records to a server;
- treat browser-local state as Settleora financial truth before a separate
  browser persistence/security design exists;
- create group membership, friend relationships, collaboration access,
  server-authoritative bills, server settlements, or server file metadata
  from generation/download;
- relink package-local file references to server storage.

Any local-to-server, server-to-local, or browser-local authority movement
remains a separate explicit import, restore, migration, or persistence gate.

## Download UX And Runtime Implications

Later user-web runtime must show readiness, package-session state, generation
status, and download eligibility before enabling a download action.

Required UX/runtime implications:

- explicit confirmation copy that names the action, such as `Generate backup
  package`, `Download backup package`, `Cancel package generation`, or
  `Discard backup package`;
- clear warning that the downloaded package is a sensitive user-controlled
  copy and may outlive later retention/deletion/privacy changes;
- safe deterministic filenames that avoid user-controlled path fragments,
  storage identifiers, secrets, object keys, local paths, or hidden record
  names;
- no object URL persistence beyond immediate browser download if object URLs
  are later approved for runtime handling;
- no `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, service
  worker, browser cache, filesystem API, file handle, or hidden browser
  persistence for package bytes, manifests, status, restore files, object
  URLs, or backup state;
- no fake package data, fake package sessions, fake generated artifacts, fake
  progress, fake download state, fake restore previews, or fake local
  authority.

User web must fail closed for unknown status codes, expired sessions, stale
sessions, missing eligibility, unavailable server, unsupported browser local
mode, unsupported encryption/file sections, policy-disabled packages,
oversized artifacts, failed generation, or unavailable downloads.

## Restore Relationship

A generated package is not restore approval. Downloading a package does not
authorize parsing it, previewing it, importing it, restoring it, resolving
conflicts, creating server records, moving local authority, or changing
storage/file metadata.

Restore must remain staged:

1. Restore preview is a separate package-ingress gate with parsing,
   compatibility, integrity, encryption/key-access, duplicate, conflict,
   privacy, and file-section review.
2. Restore confirmation is a separate mutation gate that revalidates policy
   and authority before any write.
3. Conflict, duplicate, server-current comparison, stale calculation basis,
   unsupported currency/feature, group membership, file relinking, and
   settlement/bill authority handling remain future domain work.

Generation/download audit categories must not be collapsed into restore
preview or restore confirmation audit categories.

## Stable Code And Problem-Details Direction

Future responses and problem details should use stable machine-readable code
families separate from localized display text. Planning families include:

- `backup_package_ready_to_prepare`
- `backup_package_preparing`
- `backup_package_ready_to_download`
- `backup_package_download_started`
- `backup_package_download_unavailable`
- `backup_package_generation_failed`
- `backup_package_generation_cancelled`
- `backup_package_expired`
- `backup_package_discarded`
- `backup_package_stale_requires_recheck`
- `backup_package_policy_disabled`
- `backup_package_too_large`
- `backup_package_row_count_exceeded`
- `backup_package_file_count_exceeded`
- `backup_package_timeout`
- `backup_package_retry_unavailable`
- `backup_package_integrity_failed`
- `backup_package_encryption_required`
- `unsupported_file_sections`
- `unsupported_encrypted_sections`
- `unsupported_browser_local_mode`
- `local_persistence_unsupported`
- `auth_required`
- `session_required`
- `session_expired`
- `policy_disabled`
- `temporarily_unavailable`

These names are not approved OpenAPI enum values, generated-client model
names, or final problem codes. Unknown future codes must fail closed in user
web and must not enable generation or download.

Problem details must not echo raw package payloads, raw request bodies, file
bytes, raw OCR text, private notes, payment details outside authorized scope,
hidden record details, stack traces, storage paths, object keys, signed URLs,
provider internals, local paths, tokens, secrets, credentials, or raw package
contents.

## Future Validation Expectations

This docs-only task requires docs/scaffold validation only.

Future OpenAPI/API/backend generation/download contract work should validate:

- OpenAPI validity and generated-client freshness through the repo generation
  workflow;
- no hand edits to generated clients;
- authenticated prepare/status/download/discard/cancel success and
  fail-closed unauthenticated, no-session, expired-session, cross-actor, and
  stale-session behavior;
- section-level authorization and no hidden data leakage;
- policy disabled, encryption required, package too large, row/file-count
  exceeded, unsupported file section, unsupported version, failed generation,
  expired artifact, cancelled/discarded artifact, retry conflict, timeout, and
  download-unavailable problem details;
- no direct storage paths, object keys, signed URLs, provider internals, local
  paths, file bytes in metadata, raw package contents, raw OCR text, raw
  notes, tokens, secrets, or hidden record details in responses, audit, logs,
  reports, and validation output;
- storage/file-byte tests only when package artifacts or file sections are in
  scope;
- restore preview and restore confirmation tests only in later restore
  contract/API tasks;
- user-web browser download tests only in later runtime tasks after generated
  methods and runtime contracts are approved.

## Recommended Future Task Sequence

Keep backup package and restore work split across reviewable gates:

1. OpenAPI/backend package generation/download contract for existing package
   sessions, including prepare/generate, inspect status, download eligibility,
   short-lived download action, expire/discard/cancel, retry/rebuild, bounds,
   retention, audit, and problem details.
2. Generated-client refresh through `npm run generate:clients` and generated
   client validation.
3. Backend package generation/download runtime, including storage/file-byte,
   artifact retention/cleanup, encryption/key-handling, privacy, audit,
   timeout/retry, and data-egress validation.
4. User-web package generation/download runtime after approved generated
   methods exist, with explicit confirmation copy, safe filenames, no browser
   persistence, and fail-closed status handling.
5. Restore preview contract/API, with package parsing, manifest validation,
   integrity, encryption/key access, conflict/duplicate, file-section, and
   privacy gates.
6. Restore confirmation contract/API, with mutation, money/bill/settlement,
   storage/file, idempotency, audit, conflict, and privacy gates.
7. Browser local-mode persistence/security design before any IndexedDB,
   localStorage, sessionStorage, cache, service-worker, file-system, object
   URL persistence, browser-local queue, or browser-local authority runtime.

## Explicit Non-Goals

This plan does not authorize:

- runtime app code;
- OpenAPI paths or schemas;
- generated-client changes;
- backend/API behavior;
- database schema or migrations;
- auth/session/security runtime;
- storage/file-byte behavior;
- package generation, parsing, download, upload, verification, preview,
  confirmation, or restore runtime;
- browser local-mode persistence;
- `localStorage`, `sessionStorage`, IndexedDB, browser cache, service
  workers, filesystem APIs, object URLs, or fake local queues;
- sync runtime or sync mutation;
- import/export mutation runtime;
- mobile app code;
- admin web code;
- Docker, deployment, CI, environment, or secrets;
- money, bill, settlement, payment, recurring, OCR, report, storage,
  authorization, or audit authority changes;
- Day 1 scope reduction.

## Acceptance Checklist

- Explains why generation/download is a separate data-egress gate from
  readiness and package-session metadata.
- Defines the required safety sequence from readiness through short-lived
  download, expiry, discard, and cancellation.
- Identifies future endpoint categories as planning-only concepts without
  editing OpenAPI.
- Defines package artifact, manifest, owner/source, versioning, section,
  count, hash, redaction, file inclusion, compatibility, and restore-preview
  concepts.
- Covers privacy/data-egress guardrails, storage/file-byte boundaries,
  artifact retention/cleanup, size/row/file limits, timeout, retry, audit, and
  logging rules.
- Gives encryption/key-handling direction without selecting final
  cryptography or storing secrets.
- Preserves server-mode, local-only, browser-local, group membership, and file
  relinking boundaries.
- Defines download UX/runtime implications for later user-web work.
- Keeps restore preview and restore confirmation as later separate gates.
- Defines stable code/problem-details direction, future validation
  expectations, and recommended task sequence.
