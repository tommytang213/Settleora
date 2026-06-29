# User Web Sync And Local Status Contract Plan

## Status

Planning/control gate for issue #461 after
[User Web Sync And Local Status Plan](USER_WEB_SYNC_LOCAL_STATUS_PLAN.md).

This document defines the intended future read-only contract shape and safety
boundaries for user-web sync/local status. It does not approve or implement
OpenAPI paths, schemas, generated clients, backend/API behavior, runtime UI,
sync mutation, local backup/restore runtime, browser-local persistence,
storage/file-byte behavior, auth/session/security runtime, schema/migrations,
Docker, deployment, CI, mobile/admin behavior, or secrets.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [User web export, import, and local-mode implementation plan](USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md)
- [User web sync and local status plan](USER_WEB_SYNC_LOCAL_STATUS_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Local-only and server-mode authority boundary audit](../architecture/LOCAL_SERVER_MODE_AUTHORITY_BOUNDARY_AUDIT.md)
- [Offline queue persistence and sync state model](../architecture/OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](../architecture/SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Sync audit and validation matrix](../architecture/SYNC_AUDIT_VALIDATION_MATRIX.md)
- [Local backup and restore package security](../architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)
- [CSV export and import privacy authority](../architecture/CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Import/export storage, privacy, and audit validation matrix](../architecture/IMPORT_EXPORT_STORAGE_PRIVACY_AUDIT_VALIDATION_MATRIX.md)
- [Auth runtime and current-user design](../architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md)
- [OpenAPI contract](../../packages/contracts/openapi/settleora.v1.yaml)

## Current Generated Sync Surface

The current generated web client exposes sync-adjacent methods:

| Method or model | Current contract posture | Why it is not enough for user-web status |
| --- | --- | --- |
| `listSyncChanges` | Authenticated `GET /api/v1/sync/changes`; bounded metadata-only visible-resource change feed for cache invalidation. | It can say visible resources changed after a version, but it does not describe server/local mode, browser-local support, session state, queue durability, conflict center state, failed-operation summary, or backup/restore availability. |
| `submitSyncOperation` | Authenticated `POST /api/v1/sync/operations`; server-mode mutation for bounded current-actor operations. Day 1 currently accepts bill archive/restore for expense bills. | It is mutation-sensitive. Its existence must not be used as approval for a display surface, queue creation, conflict resolution, fake local mode, or browser persistence. |
| `getSyncOperation` | Authenticated `GET /api/v1/sync/operations/{syncOperationId}`; reads one bounded current-actor operation result. | It requires a known operation ID and is not operation history, status summary, queue health, failed-sync catalog, or conflict review contract. |
| `SyncOperationStatus` | `accepted`, `replayed`, `rejected`, `conflict`. | These are operation result statuses, not full user-facing sync health or local-mode states. |
| `SyncChangeKind` | `updated`, `archived`, `restored`. | These are cache-invalidation metadata, not hydrated business records or UI status categories. |
| `SyncState` | Placeholder values `queued`, `synced`, `conflict`, `failed`. | Placeholder enum availability does not prove browser-local queues, secure storage, local cache hydration, or status history exist. |

Generated-client method presence means the OpenAPI operation exists. It does
not mean the user-web surface is approved to show a sync dashboard, infer
authorization, submit operations, read arbitrary operation history, expose
conflicts, create local queues, or claim browser local mode is supported.

## Contract Direction

A later OpenAPI/API task should add a dedicated read-only sync/local status
endpoint family or endpoint concept. Planning examples:

- `GET /api/v1/sync/status`
- `GET /api/v1/sync/local-status`
- `GET /api/v1/users/me/sync-status`

These names are planning labels only, not approved OpenAPI paths or operation
IDs. The later contract task must choose exact paths, schemas, operation IDs,
status codes, problem types, generated-client names, and authorization policy.

The endpoint family should be read-only. It should never submit sync
operations, create local records, accept mutations, parse backup files, create
backup packages, read file bytes, or hydrate hidden business records. Its
purpose is to let user web display a safe status summary derived by the
API/domain for the current actor/session.

## Authority Boundaries

API/domain services remain authoritative for:

- current actor, session validity, and authorization;
- server-mode profile state and local/server mode truth;
- sync acceptance, replay, rejection, conflict state, failed sync state, and
  audit;
- operation visibility and whether an operation belongs to the current actor;
- resource visibility and whether a resource is normally accessible;
- all mutation acceptance, including archive, restore, import, export,
  backup/restore, migration, conflict resolution, and settlement/payment/bill
  changes.

Client display state is not authorization truth. Hidden buttons, route state,
cached rows, generated-client method presence, browser network state, local
search results, import/export readouts, and stale session state must not grant
or imply permission.

## Mode And Reachability States

The future status response should distinguish these cases without collapsing
them into each other:

| State | Contract behavior |
| --- | --- |
| Server-connected | Authenticated server-mode status is available. The API can return safe current-actor sync/local status fields. |
| Unauthenticated | No valid authenticated actor is available. The response should be absent behind `401` or return only anonymous-safe problem details through a deliberately anonymous readiness endpoint if one is designed later. |
| No server session | The user web shell has no usable session or the server says the session is expired/revoked. Do not rely on cached profile, group, queue, or import/export state. |
| Offline | The browser cannot reach the API. User web may show local network/display state, but must not claim server acceptance, sync truth, or local-only authority. |
| Server unavailable | The API or readiness dependency is unavailable. Do not silently switch into local mode. |
| Unsupported browser local mode | Browser local mode is not available until persistence, encryption, retention, migration, backup/restore, and device-loss behavior are reviewed and approved. |

Offline and server-unavailable states are display constraints, not alternate
authority boundaries. They must not create fake local profiles, fake users,
fake groups, fake bills, fake queues, fake conflicts, fake backups, or fake
server sessions.

## Proposed Future Response Concepts

All names in this section are planning names only. They are not approved
OpenAPI schema names, property names, or enum values.

| Concept | Purpose | Safety rule |
| --- | --- | --- |
| `mode` | Server-derived mode summary such as server mode active or local mode unsupported. | Must be derived by API/domain when authenticated; browser-only guesses are not authority. |
| `sessionState` | Current session state such as authenticated, no session, expired, or unauthenticated. | Must not expose session tokens, auth account IDs, provider IDs, or credential material. |
| `serverReachability` | Reachability/readiness display state. | Must not convert browser network heuristics into sync truth. |
| `statusCode` | Stable display code for localization and UI branching. | Must be documented, additive where possible, and handled safely by older clients. |
| `safeMessage` | Optional user-safe display text. | Must not include hidden record names, raw payloads, paths, object keys, tokens, or private details. |
| `serverMode` | Whether the current actor is using server-authoritative mode. | Must not imply local-only or cloud/federated behavior that does not exist. |
| `localModeSupport` | Browser local-mode support state. | Must return unsupported until separate browser persistence/security design exists. |
| `backupRestoreSupport` | Local backup/restore support state. | Must return unsupported until package/encryption/file-handling/restore-preview gates exist. |
| `lastAcceptedServerVersion` | Optional server-side version watermark for visible resources. | Must be current-actor scoped and not expose inaccessible resources. |
| `visibleChangeSummary` | Optional bounded count or version summary for visible changes. | Must not return full bill, merchant, item, file, OCR, payment, private-note, or hidden group data. |
| `pendingOperationSummary` | Optional server-known pending operation count. | Must count only operations visible to the current actor and omit raw payloads/idempotency keys. |
| `failedOperationSummary` | Optional safe failed-sync count and stable code families. | Must omit request bodies, payload hashes, stack traces, hidden resource details, and sensitive content. |
| `conflictSummary` | Optional safe current-actor conflict count and category codes. | Must not expose conflicts for inaccessible records or enough detail to infer hidden data. |
| `staleLocalData` | Optional stale-cache status. | Must be absent or unsupported until a reviewed cache/persistence model exists. |
| `unsupportedFeatures` | Explicit unsupported local backup, restore, browser local mode, offline persistence, or migration states. | Must be honest and must not show fake setup or fake remediation paths. |
| `expiresAt` | Optional freshness expiry for status readout. | User web must reload rather than treating stale status as authority. |

Counts should be bounded and nullable/omittable. If the API cannot derive a
count safely for the current actor, it should omit the field or return a stable
unsupported/unavailable code instead of guessing.

## Stable Display Code Families

Future response and problem codes should be stable machine-readable families
separate from localized display text. Planning names:

- `server_mode_active`
- `local_mode_unsupported`
- `backup_restore_unsupported`
- `sync_status_unavailable`
- `sync_unavailable`
- `sync_conflict_present`
- `sync_failed_present`
- `stale_local_data`
- `no_server_session`
- `auth_required`
- `session_expired`
- `server_unreachable`
- `offline`
- `policy_disabled`
- `unsupported_resource_type`
- `unsupported_operation_type`
- `temporarily_unavailable`

These are planning names only, not approved OpenAPI enum names. The later
contract task should decide exact code strings, whether they live in response
schemas or `ProblemDetails`, how they are versioned, and how unknown codes are
handled by generated clients.

## Safe User-Web Disclosure Rules

The status contract may safely show:

- high-level server/local mode state;
- whether browser local mode is unsupported;
- whether local backup/restore is unsupported;
- bounded current-actor counts for server-known conflicts or failed syncs,
  only if the API can derive them without hidden data leakage;
- stable problem/status codes and short safe messages;
- supported operation families only when already authorized and bounded by the
  API/domain contract.

The status contract must not show or leak:

- unauthorized sync records, hidden bills, hidden groups, hidden users, hidden
  settlement records, or inaccessible operation history;
- raw sync operation payloads, idempotency keys, payload hashes, request
  bodies, stack traces, or internal exception text;
- local storage paths, filesystem paths, object keys, signed URLs, provider
  internals, storage object internals, receipt/proof/QR/statement bytes, or
  storage byte content;
- raw import/export data, raw CSV, raw JSON, parsed backup contents, OCR raw
  text, private notes, payment details outside an authorized settlement
  context, statement rows, or hidden record details;
- secrets, credentials, tokens, recovery codes, MFA setup material, provider
  tokens, auth account IDs, or session tokens.

Audit for status reads and sync events must avoid secrets, raw CSV, raw file
contents, tokens, raw payloads, hidden record details, and unnecessary sensitive
metadata.

## Local Backup And Restore Boundary

Local backup/restore remains separate from CSV export/import and separate from
sync/local status. It requires its own package/encryption/file-handling and
restore-preview gate before any runtime work.

The sync/local status contract may say backup/restore is unsupported. It must
not create backup packages, parse restore files, preview restore contents,
write restored records, expose package manifests, read file bytes, or imply
that CSV export/import is a complete backup/restore substitute.

## Browser Local-Mode Boundary

Browser local mode remains unsupported until a separate
persistence/security/encryption/retention/device-loss/migration design exists.

Until that design is approved, user web must not use localStorage,
sessionStorage, IndexedDB, Cache Storage, service workers, browser file-system
APIs, object URLs, or browser cache as Settleora financial truth, sync queue
storage, import/export history, backup state, local profile storage, group
storage, payment-detail storage, OCR/private-note storage, or migration state.

The status contract can expose `local_mode_unsupported`-style planning states,
but it must not create a browser-local authority boundary.

## Later Contract/API Validation Expectations

The later OpenAPI/API contract task should validate at minimum:

- OpenAPI contract validity and generated-client freshness through the repo
  generation workflow;
- no hand edits to generated clients;
- authenticated status success returns only current-actor scoped fields;
- unauthenticated/no-session/expired-session behavior fails closed;
- inaccessible sync operations and hidden resources do not affect returned
  counts or messages;
- conflict and failed-sync summaries are bounded, current-actor scoped, and do
  not expose payloads, hidden record names, object keys, paths, or secrets;
- unsupported browser local mode and unsupported backup/restore return stable
  codes without enabling runtime actions;
- unknown/additive status codes are safe for older clients;
- audit/logging tests or review confirm no raw CSV, raw file contents, tokens,
  storage internals, raw payloads, hidden record details, or private content are
  recorded;
- authorization tests cover direct-object access attempts and cross-actor
  operation IDs if operation IDs appear in any future status drilldown.

The later contract task should run the exact validation profile required by
OpenAPI/API/generated-client changes, including `npm run generate:clients`,
`npm run validate:openapi`, `npm run validate:clients`, focused API tests,
and broader API validation when the implementation touches API behavior.

## Later User-Web Runtime Constraints

The later read-only UI task should:

- call only the dedicated read-only status contract, not `submitSyncOperation`;
- avoid `listSyncChanges` and `getSyncOperation` unless a later contract/UI
  plan explicitly scopes a safe use;
- auth-gate before authenticated status calls;
- render only server-returned status fields and safe codes;
- fail closed for missing methods, missing session, expired session, server
  unavailable, offline, unsupported local mode, unsupported backup/restore,
  conflicts, failed syncs, stale/expired status, and unknown codes;
- avoid browser storage APIs and fake local state;
- avoid conflict-resolution, operation-history, local backup/restore, restore
  preview, migration, and sync mutation UI;
- not expose raw operation payloads, file/storage internals, receipt/proof/QR
  contents, raw import/export data, secrets, tokens, or hidden record details.

## Explicit Non-Goals

This plan does not authorize:

- runtime app code;
- OpenAPI paths, schemas, operation IDs, enum names, or generated clients;
- backend/API behavior;
- database schema or migrations;
- auth/session/security runtime;
- storage/file-byte behavior;
- sync runtime, sync mutation, queue creation, operation history, conflict
  resolution, or local queue persistence;
- local backup/restore runtime, backup package generation, restore parsing,
  restore preview, or restore confirmation;
- browser local-mode persistence or browser-local financial truth;
- localStorage, sessionStorage, IndexedDB, Cache Storage, service-worker,
  browser-cache, object URL, or file-system persistence;
- user-web runtime wiring;
- mobile app code;
- admin web code;
- Docker, deployment, CI, environment, or secret changes;
- fake local mode, fake sync queues, fake sessions, fake users, fake groups,
  fake import/export data, fake backup/restore data, fake conflict data, or
  fake status data.

## Acceptance Checklist

- Explains why generated `listSyncChanges`, `submitSyncOperation`, and
  `getSyncOperation` are insufficient approval for a user-web status surface.
- Defines a future read-only endpoint family or endpoint concept without
  editing OpenAPI.
- Distinguishes server-connected, unauthenticated, offline, server
  unavailable, no server session, and unsupported browser local mode states.
- Proposes stable display and problem-code families as planning names only.
- Defines safe disclosure boundaries for user web.
- Preserves API/domain authority for sync truth, profile mode, authorization,
  conflicts, failed syncs, audit, and all mutation acceptance.
- Keeps browser local mode unsupported until separate persistence/security
  design exists.
- Keeps local backup/restore as a separate package/encryption/file-handling
  and restore-preview gate.
- Defines later contract/API validation expectations and later user-web
  read-only runtime constraints.
- Lists explicit non-goals and forbids runtime/API/OpenAPI/generated-client,
  storage, auth, schema, sync mutation, browser persistence, backup/restore,
  deployment, mobile/admin, and secret changes in this docs-only branch.
