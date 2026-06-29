# User Web Sync And Local Status Plan

## Status

Planning/control gate for issue #461 after the user-web export/import runtime
work. This plan defines the safe direction for user-web sync status,
local-only status, local backup/restore, and browser local-mode persistence.

This document does not implement runtime UI, OpenAPI contracts, generated
clients, backend/API behavior, schema/migrations, auth/session/security
behavior, storage/file-byte behavior, sync mutation, local backup/restore,
browser persistence, Docker, deployment, CI, mobile/admin UI, or secrets.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [User web export, import, and local-mode implementation plan](USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md)
- [User web export readiness contract plan](USER_WEB_EXPORT_READINESS_CONTRACT_PLAN.md)
- [User web import preflight and review plan](USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md)
- [User web import confirmation contract plan](USER_WEB_IMPORT_CONFIRMATION_CONTRACT_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Local-only and server-mode authority boundary audit](../architecture/LOCAL_SERVER_MODE_AUTHORITY_BOUNDARY_AUDIT.md)
- [Offline queue persistence and sync state model](../architecture/OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](../architecture/SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Sync audit and validation matrix](../architecture/SYNC_AUDIT_VALIDATION_MATRIX.md)
- [Local backup and restore package security](../architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)
- [CSV export and import privacy authority](../architecture/CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Import/export storage, privacy, and audit validation matrix](../architecture/IMPORT_EXPORT_STORAGE_PRIVACY_AUDIT_VALIDATION_MATRIX.md)
- [Auth runtime and current-user design](../architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md)

## Current State

Recent #461 work delivered reports/search readouts, import/export/local-mode
planning, import/export availability, export readiness and runtime, import
preflight/review, import session confirmation contracts, and user-web staged
CSV import confirmation runtime.

The current user-web import/export readout recognizes sync-related generated
methods but intentionally does not call them:

- `listSyncChanges`
- `submitSyncOperation`
- `getSyncOperation`

The current generated-client sync surface is a server-mode sync foundation:

| Method or model | Current shape | User-web status implication |
| --- | --- | --- |
| `listSyncChanges` | Authenticated `GET /api/v1/sync/changes` with `sinceVersion`, `limit`, and optional `resourceType`. Returns metadata-only visible resource changes. | It is useful for cache invalidation after a reviewed runtime design, but it is not a complete user-facing sync/local status contract. |
| `submitSyncOperation` | Authenticated `POST /api/v1/sync/operations`. Day 1 currently accepts bounded `bill_archive` and `bill_restore` operations for `expense_bill`. | This is mutation-sensitive and must not be wired into a status readout branch. |
| `getSyncOperation` | Authenticated `GET /api/v1/sync/operations/{syncOperationId}`. Returns one current-actor operation result. | It can read a known operation result, but it is not an operation history, queue summary, conflict center, or local-mode status endpoint. |
| `SyncOperationStatus` | `accepted`, `replayed`, `rejected`, `conflict`. | These are operation results, not full user-web sync health states. |
| `SyncState` | Placeholder values `queued`, `synced`, `conflict`, `failed`. | Enum presence does not prove browser-local queues, local cache hydration, or user-facing status history exist. |
| `SyncChangeKind` | `updated`, `archived`, `restored`. | Change kinds are metadata for authorized resource invalidation, not visible data payloads. |

Generated-client method presence alone is not enough to wire runtime behavior.
OpenAPI client generation says an operation exists; it does not answer whether
user web may expose it for the current actor, whether the current browser has a
real local queue, whether queued work is durable, whether browser storage is
secure, or whether the user can safely resolve conflicts.

No current generated-client method provides a dedicated user-web sync/local
status summary, local backup package creation, restore preview, restore
confirmation, browser-local profile, browser-local bill store, browser-local
queue history, or local-to-server migration state.

## Day 1 User-Web Surface Direction

The Day 1 user-web sync/local status surface should be read-only until a
reviewed contract exists. It should show:

- current mode as server-connected, unauthenticated, offline/unreachable, or
  local-mode unsupported;
- current session/auth status from existing auth shell state, not invented
  user or session data;
- server reachability as a display state only, with clear distinction between
  unauthenticated, no active session, offline, and server unavailable;
- import/export state only when server-returned import/export session or
  readiness fields exist;
- sync/local unavailable states when no safe server-derived status contract
  exists;
- local backup/restore unavailable states until package creation, restore
  preview, and restore confirmation are separately designed;
- browser local-mode unsupported state until persistence/security design
  approves IndexedDB, localStorage, sessionStorage, file-system, browser cache,
  service-worker, backup, restore, and migration behavior.

The surface must not show fake queue rows, fake completed syncs, fake local
profiles, fake local bills, fake local backups, fake restore history, fake
server sessions, fake users, fake groups, fake import/export state, or fake
conflicts.

## Server Mode Versus Local-Only Mode

Server mode means the API remains authoritative for actor identity, session
validity, authorization, money, status transitions, storage access, sync
acceptance, and audit. User web may display server-returned status and may
eventually call reviewed server read methods. Offline/shared edits are pending
until accepted by the API, and conflicts preserve local pending edits until
explicitly resolved.

Local-only mode means the local authority boundary owns local-only data. Today
that direction exists in product and architecture docs, but user web does not
have reviewed browser-local persistence or a secure local authority boundary.
Until that design exists, user web must say local mode is unsupported in the
browser build rather than pretending browser local mode exists.

Local-only and server/cloud data must not silently merge. Any movement between
authority boundaries requires explicit import/export, migration, or restore
review and user confirmation.

## Safe Read-Only Requirements Before Runtime UI

Before user web shows a real sync/local status screen, a safe read contract
should expose server-derived status without submitting sync operations or
creating browser-local state.

Recommended read-only contract concepts:

| Field | Purpose |
| --- | --- |
| `mode` | Server-derived mode such as `server_mode`, `local_mode_unsupported`, or `unknown`. |
| `available` | Whether sync/local status can be shown for the current actor/session. |
| `stableCode` | Machine-readable code for product and localization handling. |
| `safeMessage` | User-safe message with no hidden user, group, file, storage, auth, or queue internals. |
| `sessionState` | `authenticated`, `no_auth`, `no_session`, `expired_session`, or similar server-derived state. |
| `serverReachability` | `reachable`, `server_unavailable`, `offline`, or `unknown`, without treating browser network heuristics as authority. |
| `lastAcceptedServerVersion` | Optional server-side resource/version watermark for visible resources. |
| `pendingOperationCount` | Count only if server can derive it safely for the actor; omit rather than invent browser queue counts. |
| `failedOperationCount` | Count only for server-known current-actor operations. |
| `conflictCount` | Count only for server-known conflicts visible to the actor. |
| `staleLocalData` | Boolean or code only if the client has a reviewed cache/persistence model. |
| `supportedOperations` | Bounded list such as bill archive/restore when appropriate. |
| `unsupportedFeatures` | Explicit unsupported local backup, restore, browser local mode, or offline persistence codes. |
| `privacyBoundary` | Safe summary of what is not exposed, such as no file bytes or storage internals. |
| `expiresAt` | Optional freshness expiry requiring user web to reload status. |

If the current sync methods are used later, `listSyncChanges` may support
cache invalidation or a limited "changes available" readout after design
review. It must not be treated as a full status contract, backup history, local
queue, or conflict-resolution surface.

## Recommended Stable Codes

A future sync/local status contract should use stable codes separate from
localized display text. Recommended codes:

- `sync_status_ready`
- `auth_required`
- `session_required`
- `session_expired`
- `server_unavailable`
- `offline`
- `sync_status_unavailable`
- `sync_changes_available`
- `sync_pending`
- `sync_failed`
- `sync_conflict`
- `sync_stale_local_data`
- `local_mode_unsupported`
- `local_persistence_unsupported`
- `backup_restore_unsupported`
- `backup_restore_policy_disabled`
- `local_to_server_migration_required`
- `unsupported_resource_type`
- `unsupported_operation_type`
- `policy_disabled`
- `temporarily_unavailable`

These are planning names, not approved OpenAPI enum names.

## Failure States

The user-web readout should fail closed and distinguish these states:

| State | Required behavior |
| --- | --- |
| No auth | Show sign-in required. Do not call authenticated sync, backup, restore, or import/export operation methods. |
| No session | Show session required or expired. Do not rely on cached profile, group, or queue data. |
| Server unavailable | Show server unavailable. Do not convert this into local-only mode or cached financial truth. |
| Offline | Show offline/unreachable. Do not submit sync operations or claim server acceptance. |
| Stale local data | Show only after a reviewed cache/persistence model can prove staleness. Do not infer from arbitrary browser state. |
| Sync conflict | Show only server-known current-actor conflicts or reviewed local queue conflicts; preserve pending local work until resolved. |
| Failed sync | Show safe server-returned failure codes/messages. Do not expose raw payloads, idempotency keys, request bodies, stack traces, or hidden server data. |
| Unsupported local mode | State that browser local mode is not available in this build. Do not create local profiles or local bills. |
| Unsupported backup/restore | State that browser backup/restore is not available. Do not create packages, parse restore files, or preview contents. |

## Privacy And Authorization Boundaries

Sync/local status must remain scoped to the current actor/session. It must not
disclose unrelated users, hidden groups, hidden bills, inaccessible sync
operations, raw operation payloads, idempotency keys, request payload hashes,
local file paths, local cache contents, storage paths, object keys, signed
URLs, provider internals, raw OCR text, payment details, private notes, auth
account IDs, session tokens, secrets, or credentials.

Import/export history must remain bounded to server-returned current-actor
records. Local/export/import history in the browser is not authority unless a
future persistence design says exactly what is stored, how it is encrypted,
how long it is retained, how it is cleared, and how it behaves after sign-out,
session expiry, browser profile changes, and device loss.

Any sync changes that create, update, archive, restore, import, export, back
up, restore, migrate, or resolve conflicts require explicit authorization and
audit coverage in API/domain services. User web must not infer permission from
buttons, route state, cached group labels, generated-client method presence, or
local search results.

## Local Backup And Restore Direction

Local backup/restore is not the same thing as CSV export/import. Backup and
restore may move a larger authority boundary, retention policy, file package,
encryption state, key material, local-only data, and migration state.

Browser downloads/uploads/storage require separate gates before user web can
participate:

- package manifest contract and versioning;
- encryption and key handling, including recovery and loss behavior;
- allowed contents and excluded sensitive fields/files;
- file byte handling, storage abstraction, and download/upload privacy review;
- restore preflight, preview, confirmation, conflict handling, and rollback
  limits;
- retention, expiry, audit, and user-visible warnings;
- local-to-server and server-to-local migration policy;
- validation for stale, tampered, incompatible, oversized, or partial backup
  packages.

Until those gates exist, user web may only show backup/restore unsupported
states. It must not create browser backup packages, upload restore files, parse
backup manifests, preview restore contents, write restored records, or use
browser storage as a hidden backup.

## Browser Local-Mode Persistence Direction

Browser local mode needs a reviewed persistence/security design before any
runtime work. IndexedDB, localStorage, sessionStorage, Cache Storage, service
workers, object URLs, browser file-system APIs, and in-memory state have
different persistence, privacy, eviction, and device-loss behavior. None of
them is approved for browser-local financial truth by this plan.

Until a future gate approves the design, user web must not store Settleora
financial records, sync queues, import/export history, backup package state,
auth-derived local profiles, group/member data, payment details, receipt/proof
metadata, OCR text, private notes, or migration state in IndexedDB,
localStorage, sessionStorage, service-worker caches, browser caches, or file
system APIs.

The future browser local-mode design must cover:

- encryption at rest and key derivation/storage;
- app PIN or unlock model where feasible;
- retention, sign-out clearing, session expiry clearing, and shared-device
  behavior;
- schema migrations and compatibility with older local data;
- backup/export and restore/import behavior;
- device loss, browser profile deletion, private browsing, and browser
  eviction behavior;
- local-to-server migration, selective import, and no-silent-merge rules;
- conflict handling when server-mode data exists;
- audit and user warnings for moving data across authority boundaries.

## Non-Goals For This Branch

This branch does not authorize:

- runtime app code changes;
- OpenAPI contract changes;
- generated-client changes;
- backend/API behavior changes;
- database schema or migrations;
- auth/session/security runtime changes;
- storage/file-byte behavior;
- user-web sync runtime or conflict resolution;
- calls or wiring for `listSyncChanges`, `submitSyncOperation`, or
  `getSyncOperation`;
- localStorage, sessionStorage, IndexedDB, browser-cache, service-worker,
  file-system, local backup, restore, or offline persistence behavior;
- fake local mode, fake sync status, fake sessions, fake users, fake groups,
  fake import/export state, or fake data;
- Docker, deployment, CI, environment, mobile, admin web, secrets, or Day 1
  scope reductions.

## Recommended Follow-Up Sequence

| Order | Slice | Suggested branch | Gate |
| ---: | --- | --- | --- |
| 1 | Sync/local status contract plan | `docs/user-web-sync-local-status-contract-plan-461` | Docs-only sync/auth/privacy gate. |
| 2 | Sync/local status OpenAPI/API read contract | `feature/user-web-sync-local-status-contract-461` | OpenAPI/generated-client, auth/session, sync authority, privacy/audit gate. |
| 3 | User-web read-only sync/local status runtime | `feature/user-web-sync-local-status-readout-461` | Runtime UI reads only the new status contract; no sync submission or browser persistence. |
| 4 | Sync operation history/conflict review plan | `docs/user-web-sync-conflict-review-plan-461` | Separate mutation/conflict design before any resolution UI. |
| 5 | Local backup/restore package contract plan | `docs/user-web-local-backup-restore-plan-461` | Storage/file privacy, encryption, migration, destructive restore, and audit gates. |
| 6 | Browser local-mode persistence design | `docs/user-web-browser-local-mode-design-461` | Product/security/privacy/storage/manual gate before any browser persistence. |
| 7 | Optional local backup/restore runtime | `feature/user-web-local-backup-restore-runtime-461` | Only after package, encryption, file handling, restore preview, and confirmation contracts exist. |

The next safest runtime task is a read-only sync/local status readout only
after a dedicated server-derived status contract exists. Until then, the
current import/export readout should continue to show sync/local status as
unsupported or readout-only and must not call sync methods.

## Acceptance Checklist

- Day 1 user-web sync/local status expectations are defined without runtime
  implementation.
- Server-mode and local-only authority boundaries stay separate.
- Generated-client sync methods are named and treated as insufficient for full
  runtime status.
- Safe server-derived status fields and codes are proposed for future contract
  work.
- Failure states cover no auth, no session, server unavailable, offline, stale
  local data, sync conflict, failed sync, unsupported local mode, and
  unsupported backup/restore.
- Privacy and authorization boundaries preserve API/domain authority and avoid
  hidden data disclosure.
- Local backup/restore and browser persistence require separate gates.
- No runtime app code, OpenAPI contracts, generated clients, backend/API
  behavior, schema, storage/file behavior, sync mutation, local persistence,
  Docker/deployment/CI, mobile/admin UI, or secrets are changed by this
  planning branch.
