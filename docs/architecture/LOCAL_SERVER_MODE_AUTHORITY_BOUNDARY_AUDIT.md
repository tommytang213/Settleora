# Local-Only And Server-Mode Authority Boundary Audit

## Purpose

This document is the docs/control hardening audit packet for #364 under parent
#361. It verifies Settleora's local-only versus server-mode authority
boundaries before any broader sync, offline cache, conflict-resolution,
local-to-server migration, import/export, or linking runtime work proceeds.

This is not a runtime implementation, API endpoint plan, OpenAPI contract,
generated-client change, schema/migration, mobile/web/admin UI change,
storage/file-byte change, auth/session/security runtime change,
money/settlement/payment calculation change, Docker/CI/deployment change,
Figma/reference artifact, issue closure, or production-readiness claim.

## Related Documents

- [Offline queue persistence and sync state model](OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Local, server, import, export, and restore boundaries](LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Sync audit and validation matrix](SYNC_AUDIT_VALIDATION_MATRIX.md)
- [Auth identity foundation](AUTH_IDENTITY_FOUNDATION.md)
- [Database foundation](DATABASE_FOUNDATION.md)
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Privacy vault architecture](PRIVACY_VAULT_ARCHITECTURE.md)
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md)
- [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md)

## Mode Definitions

Settleora has distinct authority modes:

| Mode | Authority | Allowed client posture | Server-authoritative posture |
|---|---|---|---|
| Local-only mode | The local app data store is authoritative only for the local-only profile and records on that device. | Create, edit, render, back up, restore, and OCR local-only records according to local product policy. | None until the user explicitly starts a server import, migration, or linking flow. |
| Server mode | The configured API and PostgreSQL-backed domain state are authoritative for server records. | Render, cache, validate forms for convenience, collect user intent, and queue pending work. | Auth, authorization, money, settlement/payment state, status transitions, file access, sync acceptance, and audit. |
| Offline-capable server mode | Server mode with temporary local pending state while the configured server is unavailable or not yet contacted. | Persist queued intent, retry safely, show pending/conflict/failed state, and preserve local edits. | The server decides whether queued intent is accepted, rejected, conflicted, or failed at sync time. |
| Guest, temporary, or local identities | Planning concepts only unless a future reviewed task implements them. | May identify a local-only person or a limited pending participant in local UI/candidates. | They are not server accounts, authorization grants, group memberships, payment-detail grants, settlement actors, or audit actors until API/domain policy explicitly validates and binds them. |

Local-only personal data can be authoritative locally only while it remains in
the local-only boundary. It must not silently become server truth, a server
account, group membership, bill participant, file-access grant, settlement
actor, payment-detail grant, or audit fact.

The following must never be treated as authoritative server truth from local
cache:

- cached profile, group, membership, friend, bill, settlement, payment,
  recurring, notification, file, audit, or policy rows;
- hidden controls, route access, offline availability, generated-client method
  availability, or UI mode;
- local profile IDs, local role labels, imported identifiers, restored backup
  metadata, or temporary participant labels;
- local preview totals, split previews, OCR candidates, receipt parser output,
  settlement previews, report previews, or conflict suggestions.

## Authority Boundaries

In server mode, API/domain services own:

- business writes and persistence decisions;
- current actor/profile resolution from authenticated server session state;
- authorization across profiles, groups, friends/direct sharing, bills,
  settlements, files, payment details, reports, notifications, and admin
  operations;
- money, rounding, tax, FX snapshots, split shares, payer confirmation,
  affected-user state, settlement candidates, residuals, payment states,
  revision review context, locks, exports, reports, and reconciliation truth;
- file/storage authorization, purpose policy, metadata linkage, retention,
  privacy/vault policy, and byte streaming;
- sync acceptance, idempotency outcomes, stale-basis handling, conflict
  classification, status transitions, and server audit.

Mobile, web, and local clients may:

- render server responses and local previews;
- cache data for performance or offline display;
- collect local-only data or server-mode user intent;
- queue bounded pending operations with idempotency/correlation metadata;
- preserve pending local edits for retry, correction, or review.

Clients must not become the source of server authorization, financial truth,
settlement truth, file-access truth, sync acceptance, conflict resolution,
status-transition truth, or audit truth.

## Migration And Linking Assumptions

Local-only to server-mode migration, import, claim, or account linking is a
boundary-crossing operation, not ordinary sync.

Future migration/linking flows must require:

- explicit user action and visible boundary-warning copy;
- an authenticated server actor where server state is affected;
- server-side current actor/profile resolution and authorization;
- identity binding or import-session provenance that does not rely on local
  profile IDs as account proof;
- server validation of money, currency, storage, privacy/vault, policy,
  status, duplicate/replay, and conflict conditions;
- explicit conflict handling and user-visible reconciliation;
- bounded audit/provenance emitted from API/domain services where the server
  participates.

There must be no silent merge of a local identity into a server identity. Local
cache must not silently grant access to groups, friends, bills, files, payment
details, settlement records, settlement proof, QR/payment files, reports, admin
views, or audit history.

## Offline Queue And Sync Acceptance

Allowed queued server-mode intents are delayed requests to perform operations
that a future online API/domain operation would also validate. Examples include
bounded create/update/archive/restore/submit/upload-reference-link/cancel
intent, local review corrections, and conflict-resolution submissions where a
future reviewed operation explicitly permits them.

Forbidden queued authoritative writes include:

- final authorization decisions;
- final money, rounding, split, tax, FX, payer, affected-user, settlement,
  residual, report, export, reconciliation, or payment truth;
- direct file-byte linkage or storage provider references;
- direct account, role, group, friend, invitation, or payment-detail access
  grants;
- audit truth, status transition truth, conflict resolution truth, or server
  policy overrides.

Server acceptance posture:

- Every queued server-mode operation is revalidated at sync time as if the user
  submitted it online at that moment.
- Idempotency keys and payload hashes make retries safe; they do not authorize
  the operation.
- Same idempotency key plus different payload hash is a collision or conflict,
  not an overwrite.
- Stale base versions, ETags, active revision bases, calculation hashes,
  status bases, or policy versions produce conflict or rejection where the
  operation requires freshness.
- Rejected, failed, or conflicted items preserve local pending data and safe
  problem details until explicit user discard or documented retention cleanup.
- When server policy changes while the client is offline, the current server
  policy wins. The client must show rejection or conflict state where needed,
  not replay stale policy as authority.

## Conflict And Denial Posture

Conflicts must be explicit, reviewable, and preservable. They must expose only
authorized current-server summaries where the actor may see them.

Denials must avoid leaking unrelated private data. Safe denial categories may
include unauthorized, not visible, policy blocked, stale basis, idempotency body
mismatch, storage policy blocked, money validation failed, privacy mode
mismatch, unsupported client/operation, or retryable server failure.

Client UI cannot infer permission from:

- hidden or visible controls;
- route access;
- cached rows;
- generated clients;
- local role/membership labels;
- local search results;
- stale notification/deep-link targets;
- prior successful access to another resource.

## File, Storage, And Privacy Boundary

Server-mode file bytes require API authorization and storage abstraction access.
The server exposes stable file IDs and safe metadata only.

Local thumbnails, cache entries, downloads, backup blobs, import descriptors,
and offline references must not expose or preserve as portable authority:

- storage roots, local filesystem paths, object keys, bucket names, provider
  internals, signed URLs, vault internals, or direct database/file paths;
- secrets, credentials, tokens, recovery material, passkeys, MFA secrets, raw
  keys, or local Codex state;
- payment proof files, QR/payment files, receipt images, raw OCR text, private
  notes, or unrelated sensitive content outside the user's authorized scope.

Local/offline cache should have clear future retention, redaction, encryption,
and discard expectations. Cache retention must not become a hidden export,
backup, storage-bypass, or authorization-bypass path.

## Money And Settlement Boundary

Offline and local previews are provisional in server mode. They may help the
user understand likely results, but the API/domain layer remains authoritative
for accepted totals and financial effects.

Server-mode authority includes:

- bill totals, item splits, tax/fee/discount/refund treatment, rounding
  residuals, currencies, and manual FX snapshots;
- settlement candidates, selected lines, request/payment states, residuals,
  payment claims, receiver confirmations, disputes, cancellations, proof
  policy, and balance projections;
- bill revisions, payer reconfirmation, affected-user state, locks, exports,
  reports, and reconciliation state.

Local-only records may be locally authoritative only inside the local-only
boundary. If imported or migrated to server mode later, they become candidate
facts until the API/domain layer accepts or rejects them.

## Audit And Logging

Future server-side audit should cover:

- mode transitions and boundary-crossing actions;
- sync acceptance, rejection, conflict, retry, cancellation, and duplicate
  replay where the server participates;
- local-to-server migration/import/linking preflight, acceptance, rejection,
  conflict, discard, and completion;
- conflict resolution and policy override attempts;
- admin/support review actions where implemented.

Safe audit metadata may include actor/account/profile references, operation
category, source/destination boundary category, subject category, authorized
subject IDs, idempotency or import-session fingerprint, payload hash,
correlation ID, outcome category, safe problem category, counts by safe
category, and timestamp.

Audit, logs, validation output, issue comments, and reports must avoid secrets,
tokens, credentials, raw session/refresh values, recovery codes, MFA/passkey
material, raw OCR text, file bytes, storage internals, signed URLs, vault
internals, raw request/response bodies, unbounded private notes, unrelated
sensitive content, and payment details outside authorized scope.

## Future Implementation And Test Planning

Future slices may define conceptual runtime pieces such as:

- `OfflineQueueItem` local persistence and retention;
- server sync operation envelope and result wrapper;
- idempotency result persistence;
- resource version, ETag, calculation-hash, revision-basis, and policy-version
  guards;
- import or migration session provenance;
- conflict record summaries;
- local cache retention and redaction policy;
- storage upload/import-intent handoff;
- server audit event categories.

These names are conceptual. This document does not edit OpenAPI, generated
clients, EF models, migrations, code, tests, or UI.

Future validation expectations:

- API/domain sync acceptance tests for auth recheck, authorization, idempotency,
  stale basis, domain validation, conflict/rejection, and audit redaction;
- mobile/local queue tests for durable pending preservation, retry/backoff,
  cancellation, supersession, discard, local cache minimization, and conflict
  readouts;
- storage/privacy tests for stable file IDs, no storage internals, no signed
  URLs/object keys, purpose policy, retention, and safe cache/export behavior;
- money/settlement tests proving previews never become server truth without
  API/domain acceptance;
- import/export/backup tests proving explicit boundary crossing, provenance,
  no silent merge, and safe partial failure;
- OpenAPI/generated-client validation only in a future manual-gated contract
  task;
- Figma/UI validation only in future UI/reference tasks such as #363/#446.

Stop future implementation if a branch would move authority from API/domain
services to clients, local cache, generated clients, workers, import packages,
backup packages, UI state, or report/export parsers.

## Parent And Child Issue Posture

- #361 remains open as the E7 Sync/offline/local mode parent epic.
- #362 remains separate for full offline cache hydration and conflict
  acceptance planning.
- #363 remains separate for mobile sync conflict and failure notification UI.
- #364 is this docs/control audit scope and should not be closed by this task.
- This task does not mutate GitHub issue state, labels, comments, Project v2
  fields, or parent/child metadata.

## Non-Goals

This document does not implement runtime sync/offline behavior, API endpoints,
handlers, services, middleware, repositories, domain behavior, workers, tests,
OpenAPI contracts, generated clients, schema, EF models, migrations, seed data,
auth/session/security runtime or config, storage/file-byte behavior, money,
bill, settlement, payment, recurring, OCR, import/export, backup, report,
reconciliation runtime, mobile/web/admin UI, Figma/reference assets, Docker,
CI, deployment, release, environment files, secrets, issue closure, Project
metadata changes, Day 1 scope changes, or production/release readiness.
