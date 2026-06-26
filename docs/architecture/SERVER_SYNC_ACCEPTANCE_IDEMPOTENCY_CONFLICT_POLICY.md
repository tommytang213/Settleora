# Server Sync Acceptance, Idempotency, And Conflict Policy

## Purpose

This document is the docs/control architecture packet for #444, under parent
#362. It plans server-mode mutation acceptance, idempotency, resource version
guards, conflict/problem categories, audit redaction, future OpenAPI/generated
client boundaries, and validation expectations for queued server-mode
mutations.

This is not a runtime implementation, canonical OpenAPI contract, generated
client shape, database schema, migration, idempotency storage table, conflict
resolution engine, mobile queue runtime, or UI design. Names in this document
are planning names unless a later reviewed implementation task promotes them
into code, contracts, persistence, or user-facing UI.

## Related Documents

- [Offline queue persistence and sync state model](OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Auth identity foundation](AUTH_IDENTITY_FOUNDATION.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md)
- [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md)
- [Bill revision approval and payer reconfirmation policy](BILL_REVISION_APPROVAL_POLICY.md)
- [Receipt OCR review apply policy](RECEIPT_OCR_REVIEW_APPLY_POLICY.md)

## Authority Boundary

Server-mode sync acceptance belongs to API/domain services:

- The API validates the authenticated session, current actor, linked profile,
  authorization, resource visibility, domain policy, storage access, money,
  settlement/payment state, status transitions, and audit before accepting any
  queued mutation.
- A queued mutation is treated as delayed user intent. It is never proof of
  authorization, final financial truth, settlement truth, storage access,
  audit truth, or conflict resolution.
- Every queued server-mode mutation must be authorized and validated as if the
  actor had submitted the same operation online at sync time.
- Workers must not directly accept queued operations or mutate core business
  tables. Worker outputs that affect business data must return through
  API/domain validation.
- Clients may cache, queue, retry, render server outcomes, and preserve pending
  local data for review. Clients must not decide authorization, money,
  settlement/payment state, file access, status transitions, sync acceptance,
  or audit truth.
- Local-only mode and local-to-server import/migration remain separate
  authority boundaries. This document does not authorize silent merge between
  local-only, self-hosted server, or future managed cloud workspace data.

## Server-Authoritative Acceptance Flow

Future server-mode sync acceptance should follow a deterministic flow:

1. Receive a bounded operation intake envelope with an idempotency key,
   operation metadata, resource target, base version guards, safe payload hash,
   and correlation metadata.
2. Authenticate the request through the normal session/current-actor boundary.
3. Resolve the server-side actor, profile, workspace/authority boundary, and
   operation policy. Client-submitted actor IDs, roles, profile IDs, group
   membership, or audit metadata are not authority.
4. Validate idempotency scope and lookup any prior outcome for the same key.
5. Validate operation shape, payload hash, schema constraints, feature support,
   and compatible client/contract version where future contracts define one.
6. Load the target resource through domain-owned repositories/services using
   authorization-aware queries.
7. Apply resource visibility, deleted/archived state, file reference,
   storage-policy, auth/session-policy, money/calculation, settlement/payment,
   bill revision, OCR, and status-transition guards as applicable.
8. Check base resource version, ETag, active revision basis, calculation hash,
   or equivalent domain guard before any business write.
9. Perform the mutation inside the owning API/domain service transaction where
   the operation is accepted.
10. Persist the idempotency result and bounded audit metadata with the same
    business transaction, or with an explicitly reviewed equivalent consistency
    guarantee.
11. Return one stable server outcome: `accepted`, `rejected`, `conflict`, or
    `failed`, plus safe metadata and authoritative resource/version summaries
    only where the actor is authorized to see them.

The flow may be implemented as a generic sync intake endpoint, feature-specific
idempotent mutation endpoints, or a combination. That choice is a future
OpenAPI/API design task. The authority and validation stages stay the same.

## Operation Intake Envelope

Future intake should use a bounded envelope equivalent to
`ServerSyncOperationEnvelope`:

```text
ServerSyncOperationEnvelope
- idempotencyKey
- operationType
- operationMode
- resourceType
- resourceId nullable
- clientSubjectKey nullable
- actorHint nullable
- authorityBoundaryHint nullable
- baseServerVersion nullable
- baseEtag nullable
- activeRevisionBasis nullable
- calculationHash nullable
- normalizedPayloadHash
- normalizedPayload
- localQueueItemId nullable
- clientCreatedAt nullable
- clientAttemptNumber nullable
- clientSchemaVersion nullable
- correlationId nullable
```

Field guidance:

- `idempotencyKey` is required for retryable queued server-mode mutations.
- `operationType`, `operationMode`, `resourceType`, `resourceId`, and
  `clientSubjectKey` describe the intended operation but do not authorize it.
- `actorHint` and `authorityBoundaryHint` may help diagnostics or idempotency
  scoping, but the server must derive actual actor and boundary from session
  state and server configuration.
- `baseServerVersion`, `baseEtag`, `activeRevisionBasis`, and
  `calculationHash` carry the basis the user saw when creating the pending
  change.
- `normalizedPayloadHash` must be computed over the canonical transport-ready
  payload and relevant operation metadata.
- `normalizedPayload` must be operation-specific, minimal, and safe. It must not
  contain file bytes, storage internals, raw tokens, secrets, raw OCR text,
  unbounded private notes, raw request/response captures, or unrelated cached
  state.
- `localQueueItemId`, attempt count, and correlation IDs are diagnostic
  metadata only. They must not become server authority or user-visible secrets.

## Validation Stages

Future implementation should keep validation stages explicit and testable:

| Stage | Server responsibility | Failure family |
|---|---|---|
| Transport | Parse bounded envelope, reject oversized/unsupported payloads, enforce media type and route policy. | `rejected` or `failed` |
| Authentication | Validate session, expiry, revocation, account state, and current actor. | `rejected` |
| Authorization | Check profile, role, group, bill, settlement, payment, storage, and policy access. | `rejected` or `conflict` |
| Idempotency | Scope key, compare payload hash, return prior accepted outcome or collision problem. | `accepted`, `rejected`, or `conflict` |
| Resource lookup | Load target through authorization-aware domain queries without leaking unrelated existence. | `rejected` or `conflict` |
| Version guard | Compare base version, ETag, active revision basis, calculation hash, or status basis. | `conflict` |
| Domain validation | Re-run operation-specific business rules for money, bill, settlement, storage, auth/session, OCR, and status transitions. | `rejected` or `conflict` |
| Transaction | Write through API/domain service only after all required guards pass. | `accepted` or `failed` |
| Audit/result | Persist bounded audit and idempotency result without sensitive payload leakage. | `accepted`, `rejected`, `conflict`, or `failed` |

## Idempotency Policy

Idempotency keys protect safe retry; they are not authorization grants.

Recommended scope:

```text
authorityBoundary
serverWorkspaceId or server installation key
authenticated actor/account/profile
operationType
resourceType
resourceId or clientSubjectKey
normalizedPayloadHash
client contract/schema version where relevant
```

Rules:

- Same key, same scoped actor/boundary, same operation, same target, and same
  payload hash should return the stored prior outcome without duplicating the
  mutation.
- If the prior outcome was `accepted`, duplicate replay returns
  `accepted` with a duplicate/replay marker and safe authoritative IDs/versions
  the actor may see.
- Same key with different payload hash is an idempotency collision and must not
  overwrite prior intent.
- Same key from a different actor, authority boundary, operation, or target is
  denied or treated as collision according to future storage design. It must not
  reveal another actor's operation details.
- A replacement local operation should use a new idempotency key and link
  supersession locally; it should not reuse the old key with a changed body.
- Idempotency records must avoid raw payloads where possible. Store bounded
  hashes, operation categories, actor/resource references, outcome category,
  authoritative resource IDs/versions, expiry/retention metadata, and safe
  problem category.
- Idempotency retention must be long enough to cover expected offline retry
  windows and app restarts, but not an unbounded store of sensitive operation
  history.

## Resource Version And Basis Guards

Version guards prevent stale offline intent from silently overwriting newer
server truth.

Future operations should use one or more guards appropriate to the domain:

- `serverVersion`: monotonically increasing resource version for ordinary
  optimistic concurrency.
- `ETag`: HTTP/cache-compatible representation of current resource state.
- `calculationHash`: hash of server-authoritative money, split, tax, settlement,
  payer, residual, or revision review basis.
- `activeRevisionBasis`: active bill revision ID, revision version, approval
  basis, or payer confirmation basis.
- `statusBasis`: current bill, settlement, payment, file, auth/session, OCR
  review, or notification state relevant to the mutation.
- `policyVersion`: storage, money, auth/session, privacy, or settlement policy
  version where the operation depends on a mutable policy.

Money-impacting and settlement-impacting operations must not rely only on a
generic timestamp. They need enough calculation or revision basis to prove the
actor reviewed the same financial context that the server is asked to mutate.

If a guard is stale or missing for an operation that requires it, the server
returns `conflict` with a stable category and an authorized current summary
where safe. It must preserve local pending data on the client side and must not
silently merge or recalculate as client authority.

## Server Outcomes

Every future server sync response should map to one top-level outcome:

| Outcome | Meaning | Client behavior |
|---|---|---|
| `accepted` | The API/domain service accepted the mutation and produced authoritative state, ID, version, or safe result metadata. | Mark queue item `synced`, refresh affected cache, preserve only retention-needed local metadata after successful cleanup. |
| `rejected` | The server refused the operation as invalid, unauthorized, unsupported, not visible, policy-blocked, or otherwise non-acceptable without a version conflict path. | Mark queue item `failed`, preserve local pending data and safe problem details for review, do not retry automatically unless category says auth/session can be refreshed. |
| `conflict` | The operation cannot apply because server-visible state, version, revision basis, status, policy, or resource availability differs from the local basis and needs review or policy resolution. | Mark queue item `conflict`, preserve pending data, store safe conflict record and authorized server summary where provided. |
| `failed` | The server or dependency could not complete the operation for retryable/system reasons without accepting or definitively rejecting the mutation. | Mark queue item `failed` with retry metadata when retryable, keep the same idempotency key for the same payload. |

Future OpenAPI may choose wrapper names such as `SyncOperationResult` or
feature-specific result schemas. The stable outcome vocabulary should remain
small so generated clients can render safe state without becoming authority.

## Stable Conflict And Problem Categories

The following planning categories should remain stable across future API,
client, audit, and validation design. Exact enum names require a future
canonical OpenAPI task.

| Category | Recommended outcome | Meaning |
|---|---|---|
| `stale_base_version` | `conflict` | Base version, ETag, revision basis, calculation hash, status basis, or policy version no longer matches server truth. |
| `idempotency_body_mismatch` | `conflict` or `rejected` | Same idempotency key was reused with a different payload hash or incompatible operation metadata. |
| `unauthorized_actor` | `rejected` | Current authenticated actor cannot perform the operation. |
| `resource_not_visible` | `rejected` | Resource is missing, unrelated, or intentionally hidden from this actor without leaking existence. |
| `resource_deleted_or_archived` | `conflict` | Resource exists in a state that blocks the intended mutation, such as archived, cancelled, removed, finalized, or deleted. |
| `file_reference_not_authorized` | `rejected` or `conflict` | Referenced file metadata, upload intent, or file subject is unavailable or not authorized for this actor/operation. |
| `money_calculation_validation_failed` | `rejected` or `conflict` | Decimal, currency, rounding, split, tax, total, payer, FX, residual, or calculation-hash validation failed. |
| `settlement_policy_block` | `rejected` or `conflict` | Settlement/payment state, residual policy, proof policy, receiver confirmation, dispute, cancellation, or downstream bill revision policy blocks the mutation. |
| `storage_policy_block` | `rejected` | File purpose, size, type, normalization, retention, quota, privacy/vault, or provider policy blocks the mutation. |
| `auth_session_policy_block` | `rejected` | Session expiry, revocation, disabled account, missing freshness/step-up, MFA/passkey policy, or auth abuse policy blocks the mutation. |
| `duplicate_accepted_replay` | `accepted` | Same idempotency key and payload already accepted; server returns prior authoritative result without duplicating side effects. |
| `transient_retryable_failure` | `failed` | Server, database, queue, storage, dependency, rate-limit, or network-adjacent condition may succeed later with the same idempotency key and payload. |

Responses must carry safe user-facing summaries and optional machine-readable
details, not raw exception text, full request bodies, raw response bodies,
storage paths, object keys, provider diagnostics, raw OCR text, private notes,
or unrelated sensitive data.

## Domain Authority Boundaries

### Auth And Session

Queued operations must revalidate the session/current actor at sync time. A
previously queued operation cannot bypass expired sessions, revoked sessions,
disabled accounts, missing current profile, step-up requirements, MFA/passkey
policy, or abuse controls. Auth/session failures should use safe categories and
must avoid account enumeration or leaking unrelated resource existence.

### Money, Bills, And Revisions

Bill, split, payer, tax, receipt-total, FX, bill revision, participant
approval, and payer confirmation operations are accepted only through
API/domain money and bill services. Clients may submit proposed inputs, base
calculation hashes, and review intent, but the server recomputes and validates
authoritative money, affected-user state, payer confirmation, and audit.

### Settlements And Payments

Settlement request, payment claim, receiver confirmation, residual, dispute,
cancellation, proof, and balance-impact operations are accepted only through
settlement domain policy. Pending bill revisions or stale settlement/payment
state must block or conflict rather than silently mutating balances.

### Storage And Files

File references in queued mutations are references to server-side file metadata
or reviewed upload intents, not file bytes. The server validates file purpose,
subject association, lifecycle state, storage policy, privacy/vault policy, and
actor authorization before linking a file to a business mutation. Responses
must expose stable file IDs and safe metadata only.

### OCR

OCR-derived facts submitted through sync remain provisional until API/domain
validation accepts them. Non-draft shared-bill OCR changes must route through
reviewed bill revision policy when implemented. Raw OCR text must not be logged
or included in ordinary audit/problem details.

## Future OpenAPI And Generated-Client Boundaries

This task does not change `packages/contracts/openapi/settleora.v1.yaml` and
does not regenerate clients.

Future contract work must:

- Treat OpenAPI as the source of truth and generated clients as generated-only.
- Use additive, stable wrapper schemas where practical, such as a future
  operation envelope, result wrapper, conflict summary, problem category enum,
  authoritative resource version summary, and safe retry metadata.
- Keep generated-client availability separate from authorization. Typed client
  methods do not prove permission.
- Avoid exposing internal table names, storage object keys, provider internals,
  vault internals, raw idempotency storage records, full audit records, raw
  request/response bodies, or secret-bearing diagnostics.
- Preserve unknown-enum compatibility where future clients may see newer
  problem categories.
- Require manual OpenAPI/generated-client gate, `npm run generate:clients`,
  generated diff review, and client validation in the future task that actually
  changes contracts.

Potential future response shape, shown as planning vocabulary only:

```text
SyncMutationResult
- outcome
- problemCategory nullable
- retryable
- duplicateReplay
- authoritativeResource nullable
- serverVersion nullable
- etag nullable
- calculationHash nullable
- conflict nullable
- safeMessage nullable
- correlationId
```

## Safe Client Behavior

Clients should:

- Render server outcomes and stable problem categories without inventing hidden
  status transitions.
- Preserve local pending data for `rejected`, `conflict`, and `failed` outcomes
  until the user or a documented server/local policy resolves it.
- Reuse the same idempotency key for retrying the same queue item and payload.
- Stop automatic retry for conflict, body mismatch, unauthorized actor,
  not-visible resource, policy-blocked, and money validation categories unless
  a later domain-specific policy allows a precise recovery path.
- Refresh authoritative resources after `accepted` or `duplicate_accepted_replay`
  rather than trusting local optimistic state as final truth.
- Show only authorized server-current summaries for conflicts.
- Keep queued file references separate from file bytes and local filesystem
  paths.

Clients must not:

- Decide authorization, money, settlement/payment state, storage access,
  resource visibility, audit truth, or conflict resolution.
- Treat hidden UI, cached resources, generated-client availability, local group
  membership, local profile IDs, or local queue status as permission.
- Drop pending local user work just because a server outcome is `rejected`,
  `conflict`, or `failed`.

## Audit, Logs, And Safe Metadata

API/domain services should emit bounded audit/log metadata for sync acceptance
attempts where policy requires it:

- actor/account/profile ID from server auth state;
- operation category and resource category;
- authoritative subject ID where the actor is authorized and the operation
  reached that stage;
- outcome and stable problem category;
- idempotency key fingerprint, not the raw key in ordinary logs;
- payload hash, not raw payload;
- base/current version categories, not full object dumps;
- correlation/request ID and timestamp;
- safe policy/version identifiers where useful.

Audit/log metadata must avoid raw secrets, tokens, credentials, recovery codes,
MFA/passkey material, raw session/refresh credentials, raw idempotency keys in
ordinary logs, raw OCR text, file bytes, storage paths, object keys, provider
internals, vault internals, local filesystem paths, raw request bodies, raw
response bodies, unbounded private notes, payment details, and unrelated
sensitive content.

Denied, not-visible, deleted, archived, and unauthorized responses must avoid
existence leaks. They may use generic safe categories where revealing the exact
resource state would disclose another user's data.

## Validation Expectations

Future implementation branches should add validation according to changed
surface. This packet does not authorize those changes, but expected coverage
includes:

| Surface | Expected validation |
|---|---|
| API/domain acceptance | Authenticated queued operations are validated through normal authorization and domain services; workers do not mutate core business tables directly. |
| Idempotency | Same key/body returns the prior result; same key/different body conflicts or rejects; duplicate accepted replay does not duplicate bills, settlements, payments, files, OCR apply, or audit side effects. |
| Version guards | Stale version, ETag, calculation hash, active revision basis, status basis, and policy version produce conflict with pending data preserved. |
| Auth/security | Expired, revoked, disabled, missing-step-up, MFA/passkey policy, and unauthorized actor cases fail closed without existence leaks. |
| Storage/file privacy | File references require purpose, lifecycle, subject, storage policy, privacy/vault, and authorization checks; responses omit storage internals. |
| Money/bill/settlement | Decimal/currency/rounding/split/tax/payer/residual/revision/settlement policy failures do not accept or silently recalculate client truth. |
| Client queue | `accepted`, `rejected`, `conflict`, and `failed` map to durable local states while preserving pending data for review. |
| OpenAPI/generated clients | Only future contract tasks update canonical OpenAPI, regenerate clients, and validate generated output. |
| Audit/redaction | Logs, audit rows, problem details, test fixtures, and reports avoid raw secrets, payloads, file bytes, OCR text, storage internals, private notes, and unrelated sensitive data. |

## Implementation Gates And Non-Goals

Before runtime work, future issues must separately scope and gate:

- API sync endpoints or feature-specific idempotent mutation endpoints;
- idempotency persistence, retention, and cleanup;
- resource version/ETag/calculation-hash/revision-basis persistence;
- canonical OpenAPI and generated-client changes;
- schema/migration/model snapshot changes;
- auth/session/security runtime and step-up policy integration;
- storage upload/resume/file-reference authorization behavior;
- money, bill, settlement, payment, recurring, OCR apply, and audit domain
  operations;
- mobile/local queue runtime and conflict/failure UI;
- import/export/local backup and local-to-server migration behavior.

This document does not implement runtime sync endpoints, mobile/local queue
runtime, OpenAPI or generated-client changes, EF/schema/migration changes,
idempotency storage tables, server conflict resolution, file-byte behavior,
auth/session/security runtime, money/settlement/payment/bill calculation
changes, OCR worker behavior, Docker/CI/deployment changes, secrets, or
Figma/reference artifacts.
