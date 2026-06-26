# Offline Queue Persistence And Sync State Model

## Purpose

This document is a docs/control architecture packet for #443, under parent
#362. It defines the planned client-side offline queue record, pending-change
preservation rules, sync states, retry/cancellation behavior, idempotency key
storage, safe payload boundaries, and validation expectations for future sync
implementation.

This is not a runtime implementation, OpenAPI contract, generated-client shape,
mobile database schema, or server endpoint design. Names in this document are
planning names unless a later reviewed implementation task promotes them into
runtime code, OpenAPI, generated clients, persistence, or UI.

## Authority Boundary

Settleora has separate local-only and server-mode authority boundaries:

- Local-only profiles are locally authoritative for their local app data.
- Server-mode profiles are API/domain authoritative for collaboration,
  authorization, money, settlement state, storage access, sync acceptance, and
  audit.
- Offline server-mode edits remain local pending changes until they are synced
  and accepted by the API.
- A queued mutation records user intent and enough local state to retry or
  review it. It does not make the client the source of authorization, financial
  truth, settlement truth, file-access truth, sync acceptance, or audit truth.
- Local-to-server import or migration remains an explicit, user-approved,
  server-validated flow. It must not silently merge local-only, self-hosted
  server, or future cloud workspace data.

## Queue Item Envelope

Future client persistence should use a local envelope equivalent to
`OfflineQueueItem`. The exact persistence technology is a future mobile/local
implementation decision.

Recommended planning shape:

```text
OfflineQueueItem
- localQueueItemId
- localProfileId
- authorityBoundary
- serverWorkspaceKey nullable
- actorSubjectKey nullable
- operationType
- operationMode
- resourceType
- resourceId nullable
- clientSubjectKey nullable
- baseServerVersion nullable
- baseEtag nullable
- activeRevisionBasis nullable
- pendingChange
- normalizedPayload
- payloadHash
- idempotencyKey
- createdAt
- updatedAt
- lastAttemptAt nullable
- attemptCount
- nextRetryAt nullable
- backoffCategory nullable
- state
- serverOutcome nullable
- lastErrorCode nullable
- lastErrorMessageSafe nullable
- conflictRecordId nullable
- supersededByLocalQueueItemId nullable
- cancellationReason nullable
```

Field guidance:

- `localQueueItemId` is a stable local ID for queue bookkeeping and UI
  references. It is not server authority.
- `authorityBoundary` identifies `local_only`, `self_hosted_server`, or future
  `managed_cloud_workspace` planning boundaries. A queue item belongs to one
  boundary only.
- `serverWorkspaceKey` is a safe local reference to the configured server or
  workspace, not a secret, token, storage path, or provider internal.
- `actorSubjectKey` is a safe local actor/profile reference for scoping
  idempotency and retry. It is not a replacement for server session validation.
- `operationType` names the intended mutation, such as create, update, archive,
  restore, submit, upload-reference-link, cancel, or delete-request where a
  future reviewed operation allows it.
- `operationMode` distinguishes ordinary online retry, offline-created intent,
  local-only write, import candidate, or conflict-resolution submission.
- `resourceType` names the intended subject family, such as bill, bill
  revision, receipt OCR review, settlement request, settlement payment,
  payment details, profile, group, recurring template, notification preference,
  import package, export package, or file metadata reference.
- `resourceId` is present only when the authoritative server resource already
  exists and is known.
- `clientSubjectKey` is an optional client-generated subject key for create-like
  operations before the server returns an authoritative ID. It must be scoped
  and collision-resistant enough for local dedupe and idempotency.
- `baseServerVersion`, `baseEtag`, and `activeRevisionBasis` preserve the
  server version, ETag, calculation hash, active revision ID, or equivalent
  basis the user saw when they made the local change.
- `pendingChange` preserves user-entered local data and local review state.
- `normalizedPayload` is the bounded, safe, transport-ready intent payload for
  the future API operation. It must exclude unsafe raw data described below.
- `payloadHash` is computed over the canonical normalized payload and relevant
  operation metadata. It is used for local dedupe, idempotency integrity, and
  replay safety.
- `idempotencyKey` persists across retries for the same intended operation and
  payload hash.
- `state` uses the planning states in this document.

## Pending Change Preservation

Failed and conflicted queue items must preserve enough local data for users to
review, retry, replace, or discard without silent loss.

Preserved pending data should include:

- the original user-entered values;
- normalized proposed payload;
- local form/review context needed to reopen the editor;
- base server version, ETag, calculation hash, or active revision basis;
- attached safe local file references or upload-intent references, not file
  bytes in the mutation payload;
- local validation warnings and safe server problem details;
- conflict reason and authorized server-current summary where available.

Do not automatically delete pending data on `failed`, `conflict`, rejected, auth
expired, server unavailable, version mismatch, duplicate replay, partial upload,
or app restart. Deletion requires successful sync cleanup, explicit user
discard, policy-driven retention cleanup after a resolved state, or a documented
local data reset/export flow.

## Queue States

Required planning states:

```text
queued
syncing
synced
failed
conflict
cancelled
```

State meanings:

| State | Meaning |
|---|---|
| `queued` | Local intent is saved and eligible for sync when prerequisites are available. |
| `syncing` | The client is currently attempting the operation. Crashes or app restarts must recover it to a retryable state unless the server confirms acceptance. |
| `synced` | The API accepted the mutation and returned authoritative state, version, or safe outcome metadata. |
| `failed` | Sync did not complete or the operation needs user or system attention, but pending data remains preserved. |
| `conflict` | The API or client detected a version, policy, money, status, authorization, or resource conflict that needs explicit review or policy resolution. |
| `cancelled` | The user or local policy stopped future sync attempts while preserving enough metadata for history, audit-safe diagnostics, or undo where supported. |

Optional UI or internal substate names may be planned later, such as
`retry_wait`, `auth_required`, `server_unavailable`, `payload_invalid`,
`superseded`, or `discarded`. They must not become OpenAPI/runtime enums unless
a later contract/runtime task explicitly approves them.

## Server Outcome Categories

Future API/domain sync acceptance remains authoritative. Client-side planning
may model these server outcome categories:

| Outcome | Client effect |
|---|---|
| `accepted` | Mark the queue item `synced`, store authoritative IDs/versions, refresh affected cache, and clear pending user action when safe. |
| `rejected` | Mark `failed` unless the response identifies a conflict. Preserve local data and safe problem details. |
| `conflict` | Mark `conflict`, preserve local pending data, and store authorized server-current summary or conflict reference. |
| `failed` | Mark `failed` for retryable or non-retryable server/system failure according to error class. |

The server decides acceptance, authorization, money, settlement state, storage
access, revision application, active version, and audit. A generated client
response or local state transition does not imply permission or final truth.

## Retry Model

Retry behavior should be deterministic and safe:

- Retrying the same queue item reuses the same `idempotencyKey` and
  `payloadHash`.
- Transient failures may schedule `nextRetryAt` with exponential or capped
  backoff.
- `attemptCount`, `lastAttemptAt`, `nextRetryAt`, and `backoffCategory` are
  persisted so app restarts do not create tight retry loops.
- Retry pauses when authentication is expired, server configuration changes,
  the authority boundary changes, required local files are missing, or the
  operation is in `conflict` or `cancelled`.
- Non-retryable validation, authorization, resource-not-found, policy-blocked,
  or incompatible-client outcomes should become `failed` or `conflict` with
  safe problem details, not infinite retry loops.
- Settlement, payment, bill calculation, storage, auth/security, and OCR apply
  operations require domain-specific retry rules before implementation.

Planning `backoffCategory` values may include `network`, `server_unavailable`,
`rate_limited`, `auth_required`, `storage_transfer`, `version_conflict`, and
`manual_review`. These are planning labels only.

## Cancellation, Supersession, Replacement, And Discard

Cancellation and replacement must protect pending data:

- User cancellation sets `cancelled` and stops future automatic attempts. It
  should keep safe local metadata and pending values until the user confirms
  discard or retention cleanup applies.
- Supersession links an older queue item to a newer queue item through
  `supersededByLocalQueueItemId`. It must not delete the old pending data until
  the replacement is accepted or the user explicitly discards it.
- Replacement creates a new queue item with a new payload hash and usually a new
  idempotency key. Reusing an idempotency key with a different payload should be
  treated as an integrity error or conflict.
- User discard removes or tombstones pending data only after clear confirmation.
  Discarding a local pending change does not undo already accepted server
  mutations.
- Server rejection does not authorize local discard. Users must be able to
  inspect or copy useful local pending values where safe.

## Idempotency Key Storage

Idempotency keys must be generated before the first sync attempt and persisted
with the queue item.

Recommended scope inputs:

```text
authorityBoundary
serverWorkspaceKey
actorSubjectKey
operationType
resourceType
resourceId or clientSubjectKey
payloadHash
localQueueItemId
```

Rules:

- Same operation, same target/client key, same payload hash: reuse the same
  idempotency key across retries.
- Same idempotency key, different payload hash: treat as a local integrity
  failure or server conflict. Do not send as a silent overwrite.
- Different operation or replacement payload: create a new idempotency key and
  link supersession where appropriate.
- Idempotency keys are sensitive operational metadata. They should not be shown
  in ordinary UI or unredacted logs, and they must not be derived from secrets,
  raw tokens, passwords, file paths, or raw OCR text.

## Safe Payload Boundaries

Queued payloads should store only the minimum normalized data needed to replay
the intended mutation safely. They must preserve user work without becoming a
dump of request bodies, secrets, raw files, or unrelated local state.

### Money, Bills, Settlements, And Payments

- Store decimal-safe strings or structured decimal values with currency
  attached where the future operation requires proposed money input.
- Preserve base calculation hash, version, or active revision basis where the
  user acted on server-visible financial context.
- Do not store or submit final server-mode settlement truth, final participant
  shares, final tax allocation, final residual effects, final affected-user
  state, or audit truth as client authority.
- Queue items for money-impacting operations must remain pending until API/domain
  services accept them.

### Files, Storage, And File Bytes

- Do not place file bytes, local file paths, object keys, provider internals,
  vault internals, thumbnails, or storage paths inside `normalizedPayload`.
- Store safe local file handles or upload-intent references separately from the
  mutation payload and resolve them through future storage/upload policy.
- Server-mode file bytes must go through the storage abstraction and API
  authorization, never through direct queue payload exposure.
- Partial upload state must preserve pending metadata and avoid duplicate file
  attachment side effects through idempotency.

### OCR

- Store reviewed OCR candidate facts only where needed for pending user intent.
- Avoid raw OCR text in logs and ordinary audit metadata.
- OCR-derived server-mode changes remain provisional until API validation and
  acceptance. Non-draft shared-bill OCR apply must use the reviewed bill revision
  route when implemented, not direct client authority.

### Auth, Session, And Security

- Do not store passwords, raw session tokens, refresh credentials, provider
  tokens, MFA secrets, passkey material, recovery codes, reset tokens, or
  reusable challenge material in queue records.
- Queued server-mode operations must revalidate session/current actor state at
  sync time.
- Auth-expired queue items should pause with a safe `auth_required` failure
  class, not attempt to bypass authorization.

### Private Notes And Sensitive Fields

- Private notes and sensitive fields should be minimized and classified before
  queue storage.
- Recoverable Private Vault or future client-encrypted fields require separate
  design for local pending storage, export/import, conflict comparison, and
  server validation.
- Queue records must avoid storing unrelated sensitive content simply because a
  form or cache object contained it.

## Conflict Records

When the server reports a conflict, future clients should persist a separate or
embedded `ConflictRecord` with:

```text
conflictRecordId
localQueueItemId
resourceType
resourceId nullable
clientSubjectKey nullable
baseServerVersion nullable
serverCurrentVersion nullable
conflictCode
safeConflictSummary
authorizedServerSnapshot nullable
localPendingSnapshot
resolutionOptions
createdAt
updatedAt
resolvedAt nullable
resolutionOutcome nullable
```

Conflict records must preserve the local pending snapshot. Authorized server
snapshots should be bounded and filtered by current actor authorization. Missing
authorization should produce a safe unavailable summary rather than leaking
record existence or private data.

## Audit And Log Redaction

Client diagnostics, server logs, and future audit records should carry bounded
metadata only:

- queue item local ID or correlation ID;
- operation/resource category;
- safe outcome category;
- attempt count and timestamp;
- safe error code;
- server request/correlation ID where available.

Logs and audit metadata must avoid secrets, tokens, credentials, recovery codes,
raw MFA/passkey material, raw OCR text, file bytes, storage paths, object keys,
provider internals, vault internals, local filesystem paths, raw request bodies,
full private notes, and unrelated sensitive content.

Local-only audit may be device-local where implemented. Server-mode audit is
owned by API/domain services and cannot be replaced by client queue logs.

## Validation Expectations

Future implementation tasks should add validation according to the changed
surface. This packet does not authorize those changes, but it defines expected
coverage:

- mobile/local persistence tests for durable queue items across app restart;
- state transition tests for `queued`, `syncing`, `synced`, `failed`,
  `conflict`, and `cancelled`;
- retry/backoff tests for transient network/server/storage failures;
- idempotency tests proving duplicate retries do not duplicate money, bill,
  settlement, payment, file, or OCR apply mutations;
- payload-hash tests for same-key/different-payload rejection;
- auth-expired and unauthorized-operation tests proving server validation is
  still authoritative;
- stale base version/ETag/revision tests producing preserved conflict records;
- mobile/local privacy tests proving queue records omit secrets, raw tokens,
  file bytes, local file paths, raw OCR text, storage internals, and unrelated
  sensitive data;
- API/domain sync acceptance tests when future endpoints or feature-specific
  idempotent operations are implemented;
- OpenAPI/generated-client validation only when future contract shapes are
  explicitly in scope and generated from the canonical OpenAPI source;
- import/export and local-to-server migration tests proving no silent merge of
  local-only, self-hosted, or future cloud authority boundaries.

## Implementation Gates And Non-Goals

Before runtime work, future issues must separately scope and gate:

- mobile/local database schema and encryption behavior;
- API sync acceptance endpoints or feature-specific idempotent operations;
- OpenAPI contracts and generated clients;
- domain resource versioning and conflict response shapes;
- storage upload/resume behavior;
- money, settlement, payment, bill, OCR apply, and recurring operation rules;
- auth/session refresh and authorization retry behavior;
- conflict resolution UI and Figma/reference work;
- import/export/local backup and local-to-server migration.

This document does not implement runtime sync queues, server acceptance
endpoints, OpenAPI or generated-client changes, EF/schema/migration changes,
mobile runtime persistence, conflict resolution UI, Docker/CI/deployment
changes, storage internals, OCR worker behavior, or money/settlement authority
changes.
