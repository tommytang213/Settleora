# User Web Local Backup Restore Confirmation Contract Plan

## Status

Planning/control gate for issue #461 after PR #619 merged the local backup
restore-preview contract/API slice and PR #620 merged the user-web
restore-preview runtime slice.

This document defines the future restore-confirmation contract direction before
any restore-confirmation implementation. It does not approve or implement
OpenAPI paths or schemas, generated clients, backend/API runtime, user-web
runtime, database schema or migrations, storage provider behavior, package
upload/storage, file-byte handling, browser persistence, or any restore
mutation.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [User web export, import, and local-mode implementation plan](USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md)
- [User web local backup and restore plan](USER_WEB_LOCAL_BACKUP_RESTORE_PLAN.md)
- [User web local backup package contract plan](USER_WEB_LOCAL_BACKUP_PACKAGE_CONTRACT_PLAN.md)
- [User web local backup package manifest and session plan](USER_WEB_LOCAL_BACKUP_PACKAGE_SESSION_PLAN.md)
- [User web local backup package generation and download plan](USER_WEB_LOCAL_BACKUP_PACKAGE_GENERATION_DOWNLOAD_PLAN.md)
- [User web sync and local status plan](USER_WEB_SYNC_LOCAL_STATUS_PLAN.md)
- [User web sync and local status contract plan](USER_WEB_SYNC_LOCAL_STATUS_CONTRACT_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Local backup and restore package security](../architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)
- [OpenAPI contract](../../packages/contracts/openapi/settleora.v1.yaml)

## Current State After Restore Preview

The current repo has merged the restore-preview contract/API and user-web
restore-preview runtime. The authenticated restore-preview contract currently
provides:

- `POST /api/v1/local-backup/restore-previews` with operation ID
  `createLocalBackupRestorePreview`
- `GET /api/v1/local-backup/restore-previews/{restorePreviewId}` with
  operation ID `getLocalBackupRestorePreview`
- `POST /api/v1/local-backup/restore-previews/{restorePreviewId}/discard`
  with operation ID `discardLocalBackupRestorePreview`

Those endpoints are short-lived, current-actor/current-session scoped, and
non-mutating. They parse and validate current data-only local backup package
content, return bounded safe metadata, and explicitly report restore
confirmation as unavailable/unsupported. They do not restore records, import
records, upload package bytes, persist package bytes, create browser-local
state, read file bytes, mutate server/local business records, or approve a
confirmation mutation.

The merged user-web runtime can select a package file, require auth before
reading selected content, create a preview, refresh a known preview, and
discard the preview. It maps only safe preview metadata and does not create
fallback restore candidates, infer restore eligibility client-side, write
browser-local authority, or call any confirmation mutation.

Implementation update on 2026-06-30: the metadata-only restore-confirmation
session contract/API slice chose these authenticated process-local endpoints:

- `POST /api/v1/local-backup/restore-previews/{restorePreviewId}/confirmation-sessions`
  with operation ID `createLocalBackupRestoreConfirmationSession`
- `GET /api/v1/local-backup/restore-confirmation-sessions/{restoreConfirmationSessionId}`
  with operation ID `getLocalBackupRestoreConfirmationSession`
- `POST /api/v1/local-backup/restore-confirmation-sessions/{restoreConfirmationSessionId}/discard`
  with operation ID `discardLocalBackupRestoreConfirmationSession`

The slice adds metadata-only/non-mutating confirmation session creation,
readback, discard, expiry, selected-scope validation, and same-key idempotency
replay/conflict behavior for the current authenticated actor/profile/session.
It keeps `canApplyRestore` false and reports restore mutation as unavailable.
Restore confirmation mutation remains a separate future gate. User-web
confirmation runtime remains a separate future gate. Durable/encrypted package
storage, file-byte sections, package upload/storage, and browser-local
persistence also remain separate future gates.

## Why Confirmation Is A Separate Mutation Gate

Restore preview answers "what might be restored and what is blocked" without
writing. Restore confirmation answers "should the API/domain accept and apply
this selected restore set now" and is therefore a separate mutation gate.

Confirmation is more sensitive because it may create or alter local/server
business records, preserve or reject duplicates, apply conflict decisions,
write audit, and change user-visible data. It must re-run authority, policy,
money, conflict, privacy, storage, and integrity checks at confirmation time
instead of trusting the earlier preview response or browser state.

Preview IDs, preview metadata, package hashes, generated-client method
availability, UI route state, selected filenames, browser `File` objects,
cached preview responses, and hidden controls are not restore authority.

## Authority Boundaries

API/domain services remain authoritative in server mode for authenticated
actor/session resolution, authorization, group/friend/membership visibility,
money, settlement state, bill status transitions, file access, storage policy,
sync acceptance, conflict decisions, idempotency, and audit.

Local-only restore affects only a reviewed local-only authority boundary. It
must not create server accounts, server groups, server collaboration
membership, server-authoritative shared records, server audit truth, or server
file metadata.

Server-mode copy restore is an import/restore candidate flow with provenance.
It must not overwrite server truth, replay stale settlements, clear server
conflicts, relink package-local files to server storage, mutate accepted bill
revisions, or silently reconnect to a server workspace. Any server truth
change requires authenticated API/domain validation at confirmation time.

Browser user web has no approved browser-local authority boundary. Browser
files, object URLs, memory state, local route state, and selected package
metadata are user inputs only. They are not financial truth, durable restore
session storage, package storage, local profile storage, sync queue state, or
server authorization.

## Required Preview-To-Confirmation Sequence

A future confirmation contract must require this sequence before any write:

1. Validate an authenticated current actor, current profile, and current auth
   session.
2. Require a fresh restore preview ID produced by the approved preview
   contract.
3. Verify the preview belongs to the current actor/profile/session and target
   authority boundary.
4. Reject previews that are expired, discarded, stale, superseded, missing, or
   otherwise unavailable.
5. Require explicit confirmation copy/challenge that identifies the selected
   restore scope and authority-boundary effect.
6. Validate the selected restore scope server-side. Client-selected scope is
   intent only.
7. Revalidate package integrity, package hash, manifest identity, package
   source metadata, source authority boundary, package version, required
   features, encryption/file-section posture, and compatibility markers.
8. Re-run policy, authorization, privacy/vault, conflict, duplicate, money,
   bill, settlement, storage, retention, and hidden-data checks at
   confirmation time.
9. Apply only the confirmed server/API-domain accepted result, or reject with
   safe problem details and no partial write unless a later partial-restore
   design explicitly approves it.

## Future Contract Shape Concepts

Names below are planning concepts only. A later OpenAPI/API task must choose
exact paths, operation IDs, schemas, problem types, status codes, retention
behavior, generated-client names, and validation tests.

Future endpoint categories should cover:

- confirm a restore preview/session;
- discard or cancel a restore confirmation session;
- read confirmation status/readback;
- retry safely through idempotency when the same confirmation request digest
  is retried;
- reject stale preview use and require a new preview when source package,
  current server/local state, policy, auth, or scope has changed;
- return safe problem details with stable code families and bounded metadata.

The confirm request should carry explicit user intent, selected restore scope,
confirmation challenge response, optional idempotency key, and the expected
preview/package/request digest. It must not carry client-computed financial
truth, server IDs invented from package data, storage object keys, filesystem
paths, signed URLs, raw secrets, file bytes, raw package payload echoes, or raw
hidden data.

The status/readback response should include bounded safe result metadata:
confirmation/session ID, status, stable code, timestamps, selected scope
summary, accepted/rejected/conflicted count categories, duplicate/conflict
decision categories, audit correlation ID, and next allowed actions. It must
not include raw payloads, file bytes, raw OCR text, raw notes, payment details
outside authorized context, secrets, storage internals, or hidden record
details.

Idempotency must prevent duplicate restores. Retrying the same confirmation
with the same idempotency key and same request digest may replay the same
accepted/rejected result. Reusing an idempotency key or confirmation session
with a different digest, selected scope, preview ID, actor/session, package
hash, or confirmation challenge must fail closed.

Planning stable problem code families may include:

- `restore_confirmation_required`
- `restore_confirmation_unavailable`
- `restore_confirmation_policy_disabled`
- `restore_preview_expired`
- `restore_preview_discarded`
- `restore_preview_stale`
- `restore_preview_actor_mismatch`
- `restore_preview_session_mismatch`
- `restore_scope_invalid`
- `restore_scope_unsupported`
- `restore_package_integrity_failed`
- `restore_package_source_mismatch`
- `restore_duplicate_exact`
- `restore_duplicate_possible`
- `restore_current_record_conflict`
- `restore_stale_server_copy`
- `restore_hidden_data_blocked`
- `restore_unsupported_section`
- `restore_package_version_mismatch`
- `restore_privacy_downgrade_blocked`
- `restore_money_policy_blocked`
- `restore_file_section_blocked`
- `restore_partial_selection_unsupported`

These names are not approved OpenAPI enums or generated-client model values
unless a later contract task adds them.

## Mutation Guardrails

Future confirmation work must preserve these guardrails:

- No mutation during preview.
- Restore confirmation must be API/domain-authoritative.
- No client-side financial truth.
- No silent restore into server truth.
- No server accounts, groups, friend relationships, collaboration
  memberships, group roles, or shared record visibility created from package
  data without explicit server validation.
- No package-local file references relinked to server storage without a
  separate future file import/upload-intent contract.
- No package-local blob IDs treated as server file IDs, storage object keys,
  storage object references, or authorization tokens.
- No browser route state, selected file metadata, generated-client method
  availability, hidden controls, cached previews, or object URLs treated as
  restore authority.

## Money, Bill, And Settlement Restrictions

Restore confirmation must not move money authority into package parsing,
browser code, generated clients, or client-side preview helpers.

Required restrictions:

- Monetary values remain decimal-safe and always carry currency.
- API/domain services perform financial calculations, rounding, split
  validation, bill status decisions, settlement effects, residual handling,
  payer confirmation, participant acknowledgement, and audit.
- Default restore behavior is all-or-nothing for the selected restore set
  unless a later selective/partial restore design is explicitly approved.
- Restore must not silently recalculate accepted bills, settlement state,
  participant acknowledgements, payment confirmations, revisions, residuals,
  bill calculation hashes, or audit truth.
- Server-mode copies of bills, settlements, payments, accepted revisions, and
  participant states are candidates/provenance only until accepted by
  API/domain validation.
- Privacy/vault downgrade, missing hidden data, stale server versions, and
  unsupported money policy must block or produce reviewable conflict/problem
  states, not silent acceptance.

## Conflict And Duplicate Handling

Future confirmation contracts must distinguish at least these outcomes:

| Outcome | Required direction |
| --- | --- |
| Exact duplicate | Suppress duplicate write or replay idempotent result with safe metadata. |
| Possible duplicate | Block or require explicit reviewed decision; do not guess based only on client data. |
| Current-record conflict | Compare against authorized current state and return safe conflict categories. |
| Stale server-mode copy | Reject or require new import/restore decision against current server truth. |
| Hidden-data blocked | Fail closed without revealing hidden users, groups, bills, files, settlements, or payment details. |
| Unsupported sections | Block affected selected restore set unless a later partial restore design allows explicit exclusion. |
| Package version mismatch | Reject unsupported required versions/features without guessing migration behavior. |
| Policy disabled | Reject with stable safe code and no write. |
| Privacy downgrade blocked | Reject any attempt to restore into weaker privacy/vault/storage posture silently. |
| Expired/discarded/stale preview | Require a new preview and confirmation challenge. |

Default selected-set behavior is all-or-nothing. Partial or selective restore
requires separate product/API/domain approval covering selection granularity,
idempotency, conflict decisions, audit, skipped-candidate retention, and
hidden-data leakage controls.

## Audit Expectations

Server-participating confirmation flows must emit bounded API/domain audit.
Local-only flows need local audit/provenance only after a reviewed local
persistence design exists.

Required audit categories:

- restore confirmation requested;
- restore confirmation accepted/applied;
- restore confirmation rejected or blocked;
- restore session discarded;
- restore session expired or retention-cleaned;
- conflict or duplicate decision;
- security, integrity, key, encryption, privacy, policy, and hidden-data
  failure categories.

Allowed audit metadata is bounded: actor/profile/session correlation where
authorized, source and destination authority-boundary categories,
preview/confirmation/session correlation IDs, package/session digests or safe
hash markers, selected scope category, safe count categories, stable code
families, timestamps, policy categories, and request correlation IDs.

Audit, logs, reports, validation output, and problem details must not include
raw package payloads, raw request/response bodies, file bytes, raw OCR text,
raw notes, raw payment details, secrets, tokens, credentials, recovery codes,
MFA/passkey material, raw keys, passphrases, storage paths, object keys,
bucket names, signed URLs, filesystem/local/temp paths, provider internals, or
hidden record details.

## Retention And Rollback Direction

Restore preview and confirmation sessions should be short-lived. A future
contract must define expiry, retry, idempotency, cancellation, discard, stale
session handling, and cleanup of abandoned confirmation sessions.

Cleanup affects only restore-preview/confirmation/session metadata and any
future temporary artifacts explicitly owned by the restore flow. It must not
delete source records, files, accounts, settlements, bills, sync conflicts, or
unrelated package artifacts.

Source records remain unchanged until confirmation is accepted by the
API/domain. Do not promise destructive rollback after accepted writes unless a
later domain design explicitly defines compensating actions, audit semantics,
authorization, and conflict behavior. Restore should avoid "rollback fantasy":
the safe default is validate before write, write atomically for the selected
set where possible, and preserve rejected/conflicted candidates for review or
discard.

## Browser Safety

Browser user web must not use any browser-local mechanism as restore authority
or durable Settleora state unless a later browser-local persistence/security
design explicitly approves it.

This plan does not approve:

- `localStorage`;
- `sessionStorage`;
- IndexedDB;
- Cache Storage;
- service workers;
- object URLs as authority;
- File System Access API authority;
- downloaded files as app authority;
- selected file handles as app authority;
- browser-local queue/state authority;
- silent browser persistence;
- fake local profiles, bills, groups, backup packages, restore sessions,
  restore candidates, sync queues, conflicts, or server sessions.

Browser code may submit explicit user input to approved API contracts, render
server-returned safe metadata, and discard local UI state. It must not become
the source of financial, restore, sync, storage, authorization, or audit truth.

## Explicit Non-Goals And Prohibitions

This planning gate does not authorize:

- OpenAPI paths, schemas, problem types, or enum changes;
- generated-client changes;
- backend/API runtime or tests;
- user-web runtime, UI, or tests;
- mobile/admin UI;
- database schema, EF models, migrations, or PostgreSQL persistence;
- storage provider behavior, storage object keys, bucket names, signed/direct
  URLs, filesystem/local/temp paths, mounted paths, or provider internals;
- file-byte restore sections;
- package upload/storage;
- restore confirmation runtime or any mutation;
- sync mutation/runtime;
- import/export mutation runtime;
- auth/session/security runtime or auth config;
- Docker/deployment/CI/environment/secrets;
- browser persistence or browser-local authority;
- Day 1 scope reduction.

## Suggested Future Sequence

Keep restore confirmation and adjacent storage/browser work split into
separate gates:

1. OpenAPI/backend restore-confirmation contract/API metadata-only or
   non-mutating acceptance gate.
2. Restore-confirmation API/domain runtime for safe data-only personal records
   only, if explicitly approved.
3. User-web restore-confirmation runtime only after approved generated-client
   methods exist.
4. Durable/encrypted package storage and file-byte sections as separate
   storage/security gates.
5. Browser-local persistence/security design before any browser-local
   authority runtime.

## Done Criteria For This Planning Gate

This planning gate is complete when it records restore confirmation as a
separate future mutation gate, defines confirmation-time revalidation and
authority boundaries, blocks client/browser/package-parser authority, preserves
money/storage/privacy/audit guardrails, and leaves all implementation,
OpenAPI, generated-client, runtime, schema, storage, file-byte, and browser
persistence work to later explicitly approved tasks.
