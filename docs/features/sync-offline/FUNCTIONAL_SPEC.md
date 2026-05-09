# Sync and Offline Functional Spec

## Purpose

Define user-facing behavior for local-only mode, server-connected mode, offline queueing, sync states, conflict handling, and data preservation.

## User goals

Users should be able to:

- use Settleora locally without a server
- connect to a server when they want collaboration/sync
- continue using the app during temporary server/network downtime
- understand whether changes are queued, synced, failed, or conflicted
- resolve conflicts without silent data loss
- export or back up local data

## Modes

### Local-only mode

- Data authority stays on the device.
- No server account is required.
- Supports personal expenses, OCR, recurring bills, forecasting, local exports, and local backup/restore.
- Does not support server collaboration, friends, shared groups, admin web, or server-mode authorization.

### Server mode

- Server is authoritative for shared/collaborative records.
- Clients may cache and queue changes offline.
- Offline shared edits are pending until synced and accepted by the API.
- Server auth and authorization are required.

## Primary flows

### Offline create/edit

1. User creates or edits a record while offline.
2. App stores pending local change.
3. UI shows queued state.
4. App syncs when server becomes available.
5. Server accepts, rejects, fails, or flags conflict.
6. UI updates state clearly.

### Conflict resolution

1. App detects server conflict.
2. User sees local pending version and current server version where authorized.
3. User chooses resolution action where policy allows.
4. Local pending data is preserved until resolved.

### Local-to-server migration

1. Local user chooses to connect/import to server.
2. App explains privacy and collaboration implications.
3. User selects bulk or selective import where supported.
4. Server validates imported records.
5. Conflicts/errors are reported.

## Sync states

Required states:

```text
queued
synced
conflict
failed
```

Additional display states may include:

```text
syncing
retrying
needs_review
server_rejected
```

## UI surfaces

- first launch mode selection
- sync status indicator
- offline queue/status screen
- conflict resolution dialog
- local backup/export screen
- server connection/import flow

## User messaging

Use clear language:

- "Saved locally. Waiting to sync."
- "Synced."
- "Conflict found. Review before updating."
- "Sync failed. Your local change is still saved."
- "Server rejected this change. Review details."

## Acceptance criteria

- Local-only mode works without a server.
- Server-mode edits can queue while offline.
- Sync states are visible.
- Conflicts preserve local pending edits.
- Failed sync does not silently delete local work.
- Users can distinguish local-only data from server-synced data.

## Non-goals

- Full peer-to-peer sync in Day 1.
- Nearby Bill/BillDrop unless separately scoped.
- Serverless multi-user collaboration in Day 1.
- Clients bypassing server validation in server mode.
