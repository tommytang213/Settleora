# Sync and Offline Technical Spec

## Purpose

Define implementation boundaries for local-only mode, server-mode sync, offline queues, conflict handling, and data authority.

## Architecture boundaries

- Local-only profiles are locally authoritative.
- Server-mode profiles are server-authoritative.
- Offline server-mode edits remain pending until synced and accepted by the API.
- Clients must not bypass server validation, authorization, money, or status policies.
- Conflict handling must preserve local pending edits until resolved.

## Domain concepts

Suggested client-side concepts:

```text
LocalProfile
OfflineQueueItem
PendingChange
SyncState
ConflictRecord
LocalBackupPackage
```

Suggested server-side concepts:

```text
ResourceVersion
SyncAcceptedResult
SyncRejectedResult
SyncConflictResult
SyncFailureResult
```

## Sync model

Server-mode sync should use:

- stable record IDs
- optimistic versioning
- idempotency keys for client-submitted mutations
- explicit pending-operation records on client
- server validation and authorization per operation
- clear conflict/error responses

## API direction

Future sync endpoints may include:

```text
POST /api/v1/sync/operations
GET  /api/v1/sync/changes
POST /api/v1/sync/conflicts/{id}/resolve
```

Feature-specific endpoints may also accept idempotency keys and return version/conflict metadata.

OpenAPI must define conflict and problem response shapes before generated clients.

## Offline queue rules

Queue items should include:

```text
id
profile_id
operation_type
resource_type
resource_id nullable
payload
idempotency_key
created_at
last_attempt_at nullable
attempt_count
state
last_error_code nullable
```

Queue item states:

```text
queued
syncing
synced
failed
conflict
cancelled
```

## Conflict handling

Conflict records should preserve:

- local pending operation/payload
- server current version where authorized
- conflict reason/code
- resolution options
- timestamps

Do not drop local pending data automatically.

## Authorization

Every synced operation must be authorized as if it were online:

- current actor/session
- linked user profile
- group membership
- record ownership/sharing
- money/status policy
- storage/file access policy

## Audit requirements

Audit events should cover:

- accepted server-mode sync operation where money/sharing/security affected
- rejected or denied sync operation where meaningful
- conflict resolution
- import/export where policy requires
- local-to-server migration/import

Local-only audit may be device-local if server does not exist.

## Storage and privacy

- Local backups should be encrypted where feasible.
- Server-mode file uploads must use storage abstraction.
- Local file paths must never become server-authoritative storage paths.
- Private vault/client-encrypted data requires separate design.

## Validation and tests

Required test categories:

- queued offline mutation syncs successfully
- stale version creates conflict
- failed sync preserves local pending operation
- unauthorized queued operation is denied by server
- duplicate idempotency key does not duplicate financial mutation
- local-only data does not require server
- local-to-server import validates money/currency/ownership

Validation commands:

```powershell
dotnet tool restore
dotnet restore
dotnet build
dotnet test
npm run validate:openapi
npm run validate:api
```

## Failure modes

Handle:

- network unavailable
- server unavailable
- auth expired while offline
- duplicate operation replay
- server schema/API version mismatch
- partial file upload
- conflict during settlement/bill status transition

## Non-goals

- Full peer-to-peer sync in Day 1.
- Nearby Bill/BillDrop implementation.
- Clients as server-mode financial authority.
- Silent conflict resolution for financial records.
