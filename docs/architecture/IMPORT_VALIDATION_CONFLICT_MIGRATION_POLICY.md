# Import Validation, Conflict, And Migration Policy

## Purpose

This document is the docs/control architecture packet for #455, under parent
#406 and bundle `import-export-1`. It defines import validation, conflict
classification, duplicate detection, local-to-server migration,
server-to-local export/disconnect, idempotency, preservation guarantees, and
audit policy for future Day 1 import/export implementation.

This is not a runtime import/export/backup/restore implementation, API
endpoint design, OpenAPI contract, generated-client shape, EF model,
DbContext, migration, schema/model snapshot change, mobile/web/admin UI,
Figma/reference artifact, storage runtime change, money calculation change,
settlement/payment/bill-status runtime change, Docker/CI/deployment change,
environment change, secret/auth-session change, or issue closure.

## Related Documents

- [Local, server, import, export, and restore boundaries](LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [CSV export and import privacy authority](CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Local backup and restore package security](LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)
- [Offline queue persistence and sync state model](OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Sync audit and validation matrix](SYNC_AUDIT_VALIDATION_MATRIX.md)
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md)
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Privacy vault architecture](PRIVACY_VAULT_ARCHITECTURE.md)

## Authority Boundary

Imports are staged candidate intake, not ordinary sync and not a shortcut to
server truth.

- API/domain services own server-mode business writes, authorization, money,
  bill and settlement status transitions, storage access, sync acceptance,
  conflict classification, idempotency results, and audit.
- Clients may render, parse, cache, queue, stage, preserve, preview, retry, and
  review import candidates. Clients must not decide server-mode
  authorization, shared financial truth, settlement/payment state, storage
  access, audit truth, or final conflict outcome.
- Local-only records remain locally authoritative inside the local profile
  boundary. They become server truth only after explicit user initiation,
  authenticated server/API validation, and API/domain acceptance.
- Generated-client availability, hidden UI state, cached roles, local profile
  IDs, restored membership data, or imported status labels are never
  authorization.
- No local-only, self-hosted server, future cloud, export package, backup
  package, or cached server-copy boundary may silently merge with another
  authority boundary.

## Import Session Lifecycle

Future runtime should model imports as sessions with stable identity,
provenance, candidate records, validation results, and safe problem details.
Exact persistence and OpenAPI names require later reviewed implementation
tasks.

Required session states:

| State | Meaning |
|---|---|
| `staged` / `pending` | Candidate payload and safe provenance are captured but no authoritative write has occurred. Local pending data is preserved. |
| `validating` | Manifest, compatibility, authorization, duplicate, money, storage, privacy, and domain validation are running. Writes are not yet committed. |
| `ready_for_review` | Validation produced a reviewable result. The user can inspect safe counts, warnings, duplicate candidates, conflicts, and blocked rows before acceptance. |
| `accepted` / `imported` | Accepted candidates were committed through API/domain services, and authoritative IDs, versions, statuses, and safe result metadata were returned where visible. |
| `rejected` | The session or candidate cannot be accepted under current validation or policy. Candidate data remains preserved until explicit discard or retention cleanup. |
| `conflict` | Current destination state, visibility, authorization, version basis, money, storage, privacy, or duplicate state differs enough to require review or policy resolution. |
| `failed` | A retryable or non-retryable system/dependency failure prevented completion without accepting or definitively rejecting all candidates. Pending data is preserved. |
| `cancelled` / `discarded` | The user stopped or discarded the import. Discard requires explicit confirmation and does not undo already accepted server mutations. |
| `superseded` | A newer import session or replacement candidate intentionally replaces this one. The old record links to the replacement and is not deleted silently. |
| `partial_failure` | Some candidates were accepted and others failed, conflicted, or were rejected. Accepted outcomes remain traceable, and unaccepted local candidates remain preserved. |

Session transitions must be explicit enough to prevent data loss:

1. Parse manifest and payload into `staged` or `pending`.
2. Move to `validating` only after the destination boundary and actor context
   are known.
3. Produce `ready_for_review`, `rejected`, `conflict`, or `failed` before any
   user acceptance path.
4. Commit accepted candidates only through owning API/domain services.
5. Preserve rejected, conflicted, failed, superseded, and unaccepted partial
   candidates until explicit discard or reviewed retention policy applies.

## Local-To-Server Migration

Local-to-server migration is an explicit user-approved import flow. It is not
offline sync, not sign-in side effect, not backup restore, and not a reconnect
helper.

Future local-to-server migration must:

- require explicit user initiation from a local-only profile and explicit
  choice of destination server/workspace;
- require authenticated server actor/session validation before server truth is
  affected;
- derive actor, profile, role, group membership, authorization, workspace, and
  policy from server state, not from imported local rows;
- create or validate an import session identity scoped to destination
  authority boundary, authenticated actor/profile, source authority/mode,
  source manifest identity, candidate set/version, and payload hash;
- run server/API validation before any server-mode truth is created;
- commit accepted candidates only through API/domain services;
- return authoritative server IDs, versions, status, and safe result metadata
  only after API/domain acceptance;
- preserve local pending data through rejection, conflict, validation failure,
  storage failure, auth/session failure, app restart, timeout, or partial
  acceptance;
- make duplicate, stale, unsupported, unauthorized, money, privacy, storage,
  and policy-blocked candidates reviewable or rejected instead of overwritten.

Local-to-server migration must not:

- directly create confirmed shared financial truth from local data;
- silently finalize bills, splits, settlements, payments, payer confirmation,
  affected-user state, recurring generation, file links, audit truth, or
  storage metadata;
- silently merge local-only, self-hosted server, future cloud, backup, or
  export-copy boundaries;
- silently relink local files or package-local blobs to server storage;
- use local account/profile/member IDs, imported roles, restored group data,
  hidden controls, or cached membership as server authorization.

## Server-To-Local Export And Disconnect

Server-to-local export, copy, or disconnect creates a local copy or package
with provenance. It is not hidden bidirectional sync.

Future server-to-local flows must:

- require explicit user action and, in server mode, API/domain authorization;
- tell the user that exported/copied records are local copies or package
  contents, not a continuing live link to the server;
- preserve source server/workspace identity where safe, source authority mode,
  export time, filters, safe record IDs/versions where visible, privacy
  category, file inclusion state, and policy warnings;
- keep server records server-authoritative unless a separate explicit server
  policy changes, archives, deletes, retains, or exports them;
- require preview and user approval before local restore/import writes;
- treat re-import of an export as a new import/restore decision with current
  validation, current policy, and current destination state.

Server-to-local flows must not:

- delete or mutate server records merely because a local copy exists;
- revoke unrelated sessions, mutate settlement/payment state, clear server
  conflicts, bypass retention, or create local authority over server truth;
- expose server storage object keys, provider paths, signed URLs, vault
  internals, server filesystem paths, or API storage paths as portable
  references;
- become a hidden two-way sync channel.

## Duplicate Detection And Idempotency

Duplicate detection must combine import-session, payload, authority,
candidate, domain, and file-reference signals. No single client-provided value
is enough to create or overwrite server truth.

Required duplicate and idempotency inputs:

- stable import session identity;
- canonical payload hash for the normalized manifest and candidate set;
- source authority and source mode, such as local-only profile, server export,
  backup package, or future cloud copy;
- destination authority boundary and authenticated actor/profile where server
  state is affected;
- candidate/resource identity, including source row key, package candidate key,
  existing server ID/version where authorized, and client subject key where
  relevant;
- participant, payee, payer, bill, category, recurring, group, and membership
  references where the actor may use them;
- attachment/file metadata references, package-local blob IDs, safe hashes,
  file purpose, size, and inclusion state where policy allows;
- operation or candidate type, schema/package/format version, and source
  manifest/version;
- idempotency key and prior outcome where the operation is retryable.

Rules:

- Same import session identity, same actor/boundary, same candidate set, and
  same payload hash should return the prior accepted/rejected/conflict result
  without duplicating accepted records.
- Same idempotency key with a different payload hash, actor, boundary,
  operation, candidate set, or target is an idempotency collision and must
  produce a conflict or problem response. It must not overwrite prior intent.
- Same source candidate presented through a different session should be
  detected as a duplicate candidate where stable source identity, payload hash,
  domain references, and authorized existing records match.
- Duplicate accepted replay can return `accepted` with duplicate/replay
  metadata and authoritative IDs/versions the actor may see.
- Duplicate unaccepted candidates remain reviewable until discarded or
  superseded.

Idempotency records should store bounded metadata only: hashes, operation and
candidate categories, actor/resource references, outcome category, accepted
resource IDs/versions, expiry/retention metadata, safe conflict categories,
and correlation IDs. They must not store raw payload dumps where avoidable.

## Validation Stages

Future implementation should keep validation stages explicit and testable:

| Stage | Responsibility | Failure family |
|---|---|---|
| Manifest and package parsing | Validate format name, version, section list, bounds, hashes, encoding, and unsupported-feature markers before writes. | `rejected` or `failed` |
| Authority boundary | Confirm source mode, destination mode, migration/export/restore intent, and no silent local/server/cloud merge. | `rejected` or `conflict` |
| Authentication | Validate session, actor, profile, account state, expiry, revocation, and required freshness where server state is affected. | `rejected` |
| Authorization and visibility | Check group, bill, participant, payee, settlement, file, category, and policy access through server-owned services. | `rejected` or `conflict` |
| Idempotency and duplicate detection | Scope keys, compare payload hashes, identify replay, duplicate candidates, and collision problems. | `accepted`, `rejected`, or `conflict` |
| Resource basis | Check target existence, visible current state, deleted/archived state, server version, ETag, calculation hash, revision basis, and policy version. | `conflict` |
| Money/domain validation | Validate decimal strings, currency, scale, signs, totals, splits, rounding, payer contribution, tax/fee/discount/refund treatment, settlement policy, and bill status. | `rejected` or `conflict` |
| Storage/privacy validation | Validate file purpose, package-local references, upload/import intent, sensitive fields, vault/privacy mode, retention, file inclusion, and denied content. | `rejected` or `conflict` |
| Review result | Produce safe counts, warnings, conflicts, duplicate summaries, and authorized current summaries where visible. | `ready_for_review`, `rejected`, `conflict`, or `failed` |
| Transaction and audit | Commit accepted candidates through API/domain services and emit bounded audit in the same consistency boundary or reviewed equivalent. | `accepted` or `failed` |

## Conflict Classification

Future problem responses, audit categories, UI references, and validation tests
should use stable conflict families. Exact enum names are a future OpenAPI/API
task.

| Category | Meaning |
|---|---|
| `ownership_authorization_conflict` | Actor cannot own, edit, pay for, import into, or link the candidate under current server authorization. |
| `resource_not_visible` | Referenced bill, group, participant, category, file, settlement, payment, or profile is missing, unrelated, hidden, or intentionally not disclosed to this actor. |
| `resource_deleted_or_archived` | Referenced resource exists in a deleted, archived, cancelled, finalized, removed, or otherwise blocked state. |
| `stale_server_version` | Base server version, ETag, revision basis, calculation hash, status basis, or policy version is stale or missing. |
| `duplicate_import_candidate` | Candidate duplicates an accepted record, another candidate, prior session, or same source row/resource identity. |
| `idempotency_body_mismatch` | Same idempotency key or session identity was reused with a different payload hash or incompatible candidate set. |
| `money_currency_rounding_mismatch` | Decimal parsing, currency support, scale, sign, split total, tax/fee/discount/refund allocation, FX snapshot, residual, or rounding validation failed. |
| `participant_member_mapping_conflict` | Imported participant, member, payer, payee, temporary participant, friend/direct-share, or group mapping cannot be authorized or disambiguated. |
| `attachment_file_reference_conflict` | File metadata, package-local blob, purpose, hash, size, content-type category, lifecycle state, or subject association cannot be validated. |
| `vault_privacy_downgrade_risk` | Import would expose, decrypt, drop envelope metadata, weaken vault/privacy mode, or restore sensitive content into a weaker category without explicit approved policy. |
| `settlement_payment_bill_status_policy_block` | Settlement, payment, residual, proof, bill status, bill revision, payer confirmation, affected-user approval, or recurring policy blocks acceptance. |
| `malformed_unsupported_version` | Manifest, package, CSV, schema, section, feature flag, or version is malformed, unsupported, oversized, or incompatible. |
| `server_storage_auth_session_policy_block` | Storage policy, auth/session policy, account state, freshness/step-up, disabled feature, rate limit, retention, quota, or server configuration blocks acceptance. |
| `transient_retryable_failure` | Database, storage, queue, dependency, rate limit, timeout, or server failure prevented completion without accepting the candidate. |

Conflict responses may include an authorized server-current summary only where
the actor is allowed to see it. Otherwise the response must use bounded problem
categories without leaking unrelated existence.

## Money Authority

Imports must preserve financial safety and never turn package/client parsing
into money authority.

- Every imported amount, split, adjustment, fee, tax, refund, payment,
  settlement, residual, FX amount, and total must use decimal-safe values with
  currency attached.
- Rounding, scale, precision, tax treatment, split allocation, residual
  handling, and receipt-total mismatch policy stay centralized in API/domain
  services.
- No imported item, split, settlement, payment, bill status, recurring draft,
  payer contribution, or participant share bypasses API/domain validation.
- Import must not silently balance, round away, default split, redistribute,
  waive, absorb, reopen, settle, confirm, cancel, dispute, archive, restore, or
  mutate settlement/payment/bill state.
- Imported settlement/payment status, exported bill totals, and local
  calculated shares are provenance or candidate facts, not server authority.
- Money-impacting acceptance must validate current server state and current
  policy at acceptance time, not only at preview time.

## Storage And Privacy

File bytes remain governed by the storage abstraction and future upload/import
intent policy.

- Backup/import package-local paths, package-local blob IDs, local device
  paths, temporary paths, filesystem roots, mounted volumes, and CSV file paths
  must never become server storage references.
- Server records reference stable server file IDs and safe metadata only after
  API/domain storage validation and authorization.
- Imported file candidates may carry safe metadata such as purpose, content
  type category, size, safe hash, package-local reference, inclusion state,
  source subject, privacy/vault category, and provenance where policy allows.
- Denied fields and sensitive content must not be imported or exported
  silently. They must be omitted, redacted, blocked, or surfaced as safe
  preview problems according to future policy.
- Raw OCR text, file bytes, storage internals, object keys, signed URLs, vault
  internals, secrets, tokens, credentials, recovery codes, local device paths,
  passwords, raw keys, passphrases, MFA/passkey material, provider tokens,
  private notes beyond authorized policy, and unrelated sensitive content must
  stay out of logs, audit, API responses, validation output, reports, and issue
  comments.
- Privacy/vault mode, envelope metadata category, recovery policy category,
  and no-silent-downgrade warnings must be preserved where needed for preview
  and validation without exposing raw keys or decrypted sensitive content.

## Audit And Logging

Import/export/migration audit should be emitted from API/domain services where
the server participates. Local-only flows may keep bounded local audit records,
but they do not create server audit truth.

Recommended bounded event names/categories:

| Event category | When emitted |
|---|---|
| `import_session.started` | A server-participating import/migration session is created or first staged. |
| `import_session.validated` | Validation completes with safe counts, warnings, conflicts, duplicate summaries, or ready-for-review result. |
| `import_session.accepted` | One or more candidates are accepted/imported through API/domain services. |
| `import_session.rejected` | Session or candidates are rejected by validation or policy. |
| `import_session.conflict` | Conflict categories are detected and preserved for review. |
| `import_session.failed` | Retryable or non-retryable server/dependency failure prevents completion. |
| `import_session.cancelled` | User cancels, discards, or stops the session before all candidates are accepted. |
| `restore_migration.previewed` | Restore or local-to-server migration preview is generated. |
| `export.generated` | Server-authorized export package/copy is produced. |
| `server_to_local_copy.created` | A server-mode local copy/disconnect package is created. |

Audit metadata should include only bounded categories:

- actor/account/profile and authorization context where server state is
  affected;
- source and destination authority boundary categories;
- source mode and package/format/version category;
- import session ID, idempotency key or redacted key fingerprint, correlation
  ID, request ID, and safe payload/session hash;
- outcome category, conflict/rejection family, partial-failure summary, and
  duplicate/replay marker;
- safe record/file counts by category where disclosure is authorized;
- timestamp, policy version category, and destination workspace/server
  category where safe.

Audit and logs must not include raw package contents, raw CSV rows, raw
request/response bodies, raw OCR text, file bytes, storage paths, object keys,
signed URLs, provider internals, vault internals, passwords, secrets, tokens,
credentials, recovery codes, raw keys, local device paths, private notes beyond
authorized policy, payment details outside the audited actor's authorized
scope, or unrelated sensitive content.

## Future Implementation Implications

This packet intentionally changes documentation only. Future implementation
must use separate reviewed tasks for each changed surface:

- Runtime/API tasks must define concrete endpoints or feature-specific import
  flows, server-side validation stages, authorization checks, idempotency
  storage, conflict/problem responses, transactions, audit, and tests.
- OpenAPI/generated-client tasks must update the canonical contract first,
  regenerate clients through repo tooling, and validate generated output. Do
  not hand-edit generated clients.
- Schema/migration tasks must be manual-gated and must define import session,
  candidate, idempotency, audit, and retention persistence before EF changes.
- Mobile/web/admin UI tasks remain blocked on #456 for Figma/reference and
  exact safe user-facing copy.
- Validation-matrix coverage remains a separate #457 follow-up for future
  command mapping, stop conditions, storage/privacy/money/audit test rows, and
  scope-specific gates.
- Runtime work touching storage/file bytes, auth/session/security,
  money/settlement/payment/bill calculation, OpenAPI, generated clients,
  schema/migrations, Docker/CI/deployment, or secrets remains manual-gated.

## Relationship To Bundle Issues

- #453 defines CSV export/import format, privacy filters, denied fields, and
  authority framing. This policy adds the cross-format import session,
  validation, conflict, duplicate, migration, idempotency, preservation, and
  audit controls that CSV import must obey.
- #454 defines local backup/restore package security, manifest, encryption,
  package sections, restore posture, vault/privacy, and file package rules.
  This policy defines how package restore and local-to-server migration become
  staged import sessions rather than silent server truth.
- #456 remains the UI/Figma/reference gate for import/export and
  backup/restore warnings, review states, progress/error states, conflict
  review, and exact user-facing language.
- #457 remains a separate validation-matrix follow-up for future storage,
  privacy, audit, money, denied-field, conflict-preservation, and scope-specific
  command coverage.
- #406 remains the broad parent/split issue and is not closed by this packet.
