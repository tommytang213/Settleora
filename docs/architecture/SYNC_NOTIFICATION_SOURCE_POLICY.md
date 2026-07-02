# Sync Notification Source Policy

## Purpose

This docs/control packet records the source-policy decision for remaining
sync/offline notification events under
[#369](https://github.com/tommytang213/Settleora/issues/369) after the merged
`sync.conflict_detected` and `sync.operation_failed` runtime slices.

This document does not implement notification runtime behavior, event enum
constants, OpenAPI changes, generated-client changes, EF migrations/check
constraints, API behavior, sync queued/resolved/retry source runtime,
queue consumers, schedulers, hosted workers, conflict-resolution runtime,
mobile UI, Figma assets, deep links, admin/global notification policy, push or
email provider delivery, auth/session/security runtime, OCR runtime, item
claim/split runtime, settlement/money behavior, storage/file behavior,
deployment/env/Docker/CI, secrets, issue closure, or Project field changes.

## Current Runtime Source Facts

The current server sync runtime persists `SyncOperation` rows for a narrow
server-mode bill archive/restore sync foundation. Persisted operation statuses
currently used as notification source state are:

- `conflict`: source for `sync.conflict_detected` when a new current-actor
  operation row is persisted as a stale-base-version or resource-state
  conflict.
- `rejected`: source for `sync.operation_failed` when a new current-actor
  operation row is persisted as rejected.

Accepted operations persist as `accepted` and update resource version/change
feed state, but they do not currently create sync notifications. Replayed
idempotent operations reuse existing persisted rows and do not duplicate
notifications. Invalid sync requests that do not persist a terminal operation
row do not notify.

The current server runtime does not persist a server-side `queued`,
`retrying`, `retry_failed`, `resolved`, `reopened`, or `resolution_applied`
operation state. The offline queue model documents those concepts as future
client/server planning states only.

## Policy Decision

Day 1 sync notifications should remain limited to user-actionable sync states
that require review or acknowledge an explicit user conflict-resolution action.
Automatic queue churn and retry churn are too noisy for Day 1 notifications
unless a future source transition proves the event is user-actionable,
privacy-safe, and not already covered by a local queue/readout surface.

The current `syncOperationId` notification target and
`GET /api/v1/sync/operations/{syncOperationId}` current-actor read path are
sufficient for future sync events that are about a persisted server
`SyncOperation` row and can be understood from the bounded operation response.
A future target/reference/API gate is required for events that target a
client-local queue item, a separate conflict record, a resolution attempt, a
retry schedule, an import/export/migration sync record, or any state not backed
by a current-actor-readable server `SyncOperation`.

## Event Policy Matrix

| Event | Day 1 policy | Required source transition before notification creation | Current source state exists? | Target/reference decision |
| --- | --- | --- | --- | --- |
| `sync.operation_queued` | Deferred. Do not add a notification for ordinary automatic queueing. | A future persisted server operation or local queue item enters a user-visible queued state after explicit user action and cannot be represented by local UI/readout alone. | No. Current server does not persist queued rows. | Current `syncOperationId` is sufficient only if a server `SyncOperation` row exists. Client-local queue events need a future target/API gate. |
| `sync.operation_retrying` | Deferred. Do not notify automatic retry starts. | A future retry controller records a user-actionable retry attempt that the user intentionally started or must watch, not background backoff churn. | No. | Needs future retry source-state and likely retry/readout policy. |
| `sync.operation_retry_failed` | Conditionally approved for future runtime only when retry exhaustion requires user action. Prefer this name over ambiguous generic retry events. | A future retryable operation exhausts approved automatic retries or moves from retryable failure to manual-review failure with a persisted current-actor-readable source row. | No. Existing `sync.operation_failed` covers newly persisted rejected rows only, not retry exhaustion. | Current `syncOperationId` is sufficient if the exhausted retry state belongs to the same persisted server operation; otherwise future target/API gate. |
| `sync.conflict_resolved` | Conditionally approved for future runtime only after explicit conflict resolution exists. | The current actor successfully applies or accepts a conflict resolution and the server persists the operation or conflict record as resolved. | No. | Current `syncOperationId` may be sufficient if the original operation row carries resolved state; separate conflict records need future target/API gate. |
| `sync.conflict_reopened` | Deferred unless a future resolved-conflict state can be invalidated by later server truth and requires user action. | A previously resolved conflict is explicitly reopened by server policy, stale resolution basis, or user action, with a persisted reopened state. | No. | Likely needs future conflict-record target/API gate unless represented on the same `SyncOperation`. |
| `sync.resolution_applied` | Conditionally approved as an alternative to `sync.conflict_resolved` only if product semantics distinguish "resolution submitted" from "conflict closed." Do not implement both without a reason. | The server successfully applies a user-selected resolution and returns authoritative resource/version outcome. | No. | Current `syncOperationId` is sufficient only for operation-row-backed resolution; otherwise future target/API gate. |

Runtime slices should choose one clear name per source transition. Preferred
future naming is:

- Use `sync.operation_retry_failed` only for retry exhaustion/manual attention.
- Use `sync.conflict_resolved` for a completed conflict lifecycle.
- Use `sync.resolution_applied` only if the product must notify about the
  resolution command result separately from closing the conflict.
- Avoid `sync.operation_retrying` and `sync.operation_queued` notifications for
  background state changes.

## Recipient And Actor Policy

Sync notifications are current-actor/operation-owner notifications. Candidate
recipients must be derived from API/domain source state, not client-submitted
actor/profile IDs, hidden UI state, cached rows, generated-client availability,
or local queue metadata.

Recipient rules for future approved sync events:

- Recipient is the authenticated actor/profile that owns the persisted sync
  operation or future conflict/resolution record.
- Do not notify unrelated group members, bill participants, admins, owners, or
  deployment operators merely because the target resource is group-scoped.
- Actor self-notification is allowed for user-actionable sync failures,
  conflicts, retry exhaustion, and conflict-resolution outcomes because the
  actor and recipient are the same operation owner.
- Suppress duplicate notifications for replayed idempotent reads, duplicate
  retry attempts that do not create a new manual-attention state, and automatic
  status refreshes.

## Duplicate And Idempotency Rule

Future runtime must not create more than one unread notification for the same
recipient, event type, source operation/conflict/resolution row, and source
transition.

Required duplicate behavior:

- Replaying the same idempotency key and payload must not duplicate a
  notification.
- Re-reading a sync operation, change feed, or local status surface must not
  create notifications.
- Automatic retry loops must not create one notification per attempt.
- If a future source row transitions through multiple user-actionable states,
  each event type must be tied to one exact state transition, not the current
  status observed repeatedly.

## Safe Targets And Authorized Re-Fetch

Allowed safe target fields for current server-operation-backed sync events:

- `syncOperationId`
- recipient profile ID stored internally
- actor profile ID only where safe internally
- `expenseBillId` only when the operation already targets an expense bill that
  the source service has resolved as visible/safe for the actor
- `groupId` only when the target bill/source operation is group-scoped and
  already visible to the actor
- relative action URL:
  `/api/v1/sync/operations/{syncOperationId}`

The current authorized re-fetch path is sufficient for server-operation-backed
events because it is current-actor-only and returns bounded sync operation
metadata. Cross-user reads must remain unavailable.

Future events require a new target/reference/API gate when they need any of:

- local queue item ID as an actionable target;
- conflict record ID separate from `SyncOperation`;
- resolution attempt ID;
- retry schedule/backoff record ID;
- import/export/migration operation target;
- file/upload transfer target;
- server-current snapshot target;
- auth/session/security target.

Notification visibility must never prove access to the target bill, group,
file, OCR review, settlement, or other business resource. Opening the
notification must re-fetch through the relevant authorized API path.

## Privacy-Safe Payload Fields

Sync notification rows, delivery attempts, audit metadata, logs, tests, and
external snippets may include only bounded metadata:

- event type;
- subject type `sync_operation` where applicable;
- safe template keys;
- attention/normal priority according to the event;
- `syncOperationId`;
- safe target resource type;
- safe target resource ID where already visible;
- safe error/problem code such as `stale_base_version`,
  `resource_state_conflict`, `unsupported_payload`, or `resource_unavailable`;
- bounded source timestamp.

They must not include raw queued request bodies, normalized payloads, payload
hashes, idempotency keys, local queue item IDs unless separately approved as
safe, local file paths, local cache data, hidden server-current data, storage
paths, storage object keys, signed URLs, file bytes, raw OCR text, merchant
names from hidden bill state, item lines, private notes, payment details,
session tokens, auth tokens, provider credentials, device tokens, or unrelated
user data.

## External Snippet Rules

In-app remains the baseline channel for user-actionable sync conflict/failure
classes. Optional email or mobile push, if later enabled by policy/provider
work, must use generic snippets only.

Allowed snippet posture:

- Title examples: "Sync needs attention", "Sync conflict resolved", or
  "Sync retry needs review".
- Body examples: "Open Settleora to review a sync update." or "A saved change
  needs review before it can sync."

External snippets must not include bill names, merchant names, amounts,
participants, operation payload details, error internals, idempotency keys,
payload hashes, local paths, server-current snapshots, file references, OCR
content, payment data, or hidden resource details.

`sync.operation_queued` and `sync.operation_retrying` must not use external
channels unless a later manual policy explicitly classifies a specific
user-actionable transition as eligible. Ordinary queue/retry churn should be
local UI/readout only.

## Read And Archive Isolation

Reading or archiving a sync notification affects notification inbox state only.
It must not:

- resolve a conflict;
- retry an operation;
- cancel an operation;
- discard pending local data;
- mark a queued item synced;
- apply a conflict resolution;
- reopen or close a conflict;
- mutate bills, settlements, payments, OCR reviews, files, storage, auth
  sessions, source audit, or money truth.

## Validation Expectations For Later Runtime Slices

Any future runtime slice that implements an approved sync event must include
focused validation proving:

- exact source transition creates the event, and adjacent transitions do not;
- current-actor/operation-owner recipient selection only;
- actor self-notification behavior is intentional and tested;
- unrelated users, group members, admins, removed members, and cross-user reads
  are suppressed or unavailable as applicable;
- duplicate/idempotent replay paths do not create duplicate notifications;
- raw payloads, idempotency keys, payload hashes, local paths/cache data,
  server-current hidden data, storage internals, OCR text, tokens, payment
  details, private notes, and unrelated user data are excluded;
- action URL re-fetch goes through the current-actor sync operation or future
  approved authorized API path;
- read/archive does not mutate sync/source/business state;
- optional delivery attempts do not claim fake provider success;
- OpenAPI/generated clients and EF constraints change only when the runtime
  slice adds an event type or public response shape.

## OpenAPI, Generated-Client, And EF Constraint Implications

This docs/control policy requires no OpenAPI, generated-client, EF model,
migration, or check-constraint change.

Later runtime implementation will require OpenAPI/generated-client and EF event
type check-constraint changes if it adds any new notification event type such
as `sync.operation_retry_failed`, `sync.conflict_resolved`, or
`sync.resolution_applied`, or if it exposes a new target/reference field or
public response shape. Generated clients must be regenerated from the canonical
OpenAPI contract and reviewed; generated files must not be edited by hand.

If a future approved event reuses an already-supported event type and no public
shape changes, OpenAPI/generated-client changes may be unnecessary, but the
runtime task must state that explicitly.

## #371 Deep-Link Requirement

`sync.conflict_detected` and `sync.operation_failed` are useful today through
the current in-app list and current-actor action URL read path, but mobile
deep-link/navigation design under #371 is still required before a polished
mobile open-from-notification experience can be claimed.

Future conflict-resolution events are not useful as Day 1 user workflow without
either:

- an authorized sync operation readout that clearly tells the user what action
  is needed; or
- #371/mobile route design for conflict review, retry, or resolution flows.

Do not treat this policy as satisfying #371.

## Non-Pass Statement

This policy does not complete #369, #368, or Day 1 notification acceptance. It
records that remaining sync queued/retry/resolved/resolution notifications are
blocked on exact source runtime and should avoid noisy automatic notifications.
Runtime implementation, event constants, schema/OpenAPI/generated-client
changes, conflict-resolution behavior, mobile/deep-link work, provider
delivery, admin/global policy, and issue closure remain separate future gates.
