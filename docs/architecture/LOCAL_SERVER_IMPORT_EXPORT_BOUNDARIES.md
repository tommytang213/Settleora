# Local, Server, Import, Export, And Restore Boundaries

## Purpose

This document is the docs/control architecture packet for #445, under parent
#362. It defines local-only authority, server-mode authority, explicit
local-to-server import, export-to-local/disconnect, backup/restore, storage,
auth/security, money/sync, audit/privacy, and future validation guardrails.

This is not a runtime import/export implementation, sync endpoint design,
OpenAPI contract, generated-client shape, database schema, migration, mobile
UI, web/admin UI, Figma/reference artifact, storage provider change, auth
runtime change, backup automation, or restore execution plan. Names and flows
in this document are planning/control language unless a later reviewed task
promotes them into code, contracts, persistence, or user-facing UI.

## Related Documents

- [Offline queue persistence and sync state model](OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Privacy vault architecture](PRIVACY_VAULT_ARCHITECTURE.md)
- [TrueNAS backup/restore consistency runbook](../deployment/TRUENAS_BACKUP_RESTORE_RUNBOOK.md)

## First-launch Mode Boundary

First launch must make the authority boundary explicit:

- A local-only profile is authoritative only inside the local device/app data
  store. It is not a server account, not an authenticated server actor, and not
  a collaboration workspace.
- A server-mode profile is authoritative through the configured API and its
  PostgreSQL-backed domain state. The API owns auth, authorization, money,
  settlement state, file access, sync acceptance, status transitions, and audit.
- Switching from local-only mode to server mode, from one server to another, or
  from server mode to a local export/disconnect state is a boundary-crossing
  action. It requires explicit user intent, clear limitation/warning copy, and
  future server validation where server truth is affected.
- Local security settings such as PIN, biometric unlock, local encryption, or
  local backup settings must not silently create, link, or migrate server
  accounts or server-authoritative records.

UI mode, onboarding mode, cached state, hidden controls, generated-client
availability, or an offline queue state does not change the authority boundary.

## One Workspace, One Authority

One workspace has exactly one authority boundary at a time:

- Local-only workspace: the local app data store is the authority for local-only
  records on that device.
- Self-hosted server workspace: the API and PostgreSQL are the authority for
  server-mode records.
- Future managed cloud workspace: the future cloud API and its server-side
  state would be a separate authority boundary.

A workspace must not silently become both local-authoritative and
server-authoritative. Data movement across boundaries requires explicit user
approval, authenticated server actor context where server state is affected,
authorization checks, server-side validation, and bounded audit where the
server participates.

No background cache refresh, sync retry, reconnect, account sign-in, restore,
or import helper may reinterpret local-only records as server truth or server
records as local truth without an explicit import/export/restore decision.

## Local-to-server Import

Local-to-server import or migration is a user-initiated flow, not ordinary
sync. It may be implemented later as bulk import, selective import, or a
guided migration, but the controls stay the same.

Future import flow requirements:

1. The user explicitly starts the import from a local-only profile and chooses
   the destination server/workspace.
2. The server requires an authenticated actor and derives actor/profile,
   workspace, role, and authorization from the active session. Client-submitted
   actor IDs, local profile IDs, roles, or audit claims are hints only.
3. The client submits a bounded import manifest and safe candidate records,
   not raw local database dumps, secrets, raw tokens, file bytes, storage
   internals, local file paths, or unrelated cached state.
4. The server creates or validates an import session identity, scoped by
   destination boundary, authenticated actor/profile, import source identity,
   candidate set/version, and payload hash where practical.
5. Server-side validation runs before any imported record becomes server truth.
   Validation includes authorization, visibility, file purpose, storage policy,
   money/currency/rounding, bill/settlement status, duplicate/replay checks,
   privacy/vault policy, and compatible schema/contract support.
6. Accepted records become server-authoritative only after API/domain services
   commit them and return authoritative IDs, versions, status, and safe result
   metadata.
7. Rejected or conflicted records remain local pending/candidate data until
   the user explicitly resolves, retries, excludes, exports, or discards them.

Import idempotency must prevent duplicate server records when a user retries
the same import session after network failure, app restart, server timeout, or
partial acceptance. Reusing an import session identity with a different payload
hash or incompatible candidate set must become a conflict or rejection, not a
silent overwrite.

Partial failure handling must preserve provenance:

- Accepted: server returns authoritative IDs/versions and safe acceptance
  metadata.
- Rejected: local candidate is preserved with safe problem details and no
  server truth is created for that candidate.
- Conflict: local candidate and authorized server-current summary are
  preserved for review where the actor may see the server record.
- Failed: retryable system/storage/dependency failure preserves the same import
  session identity and pending local data where safe.

Import must not silently finalize money, settlement, bill status, file access,
or audit truth from local data. Clients submit candidate facts and user intent;
API/domain services decide server acceptance.

## Export-to-local And Disconnect

Export-to-local or disconnect is an explicit user action. It is not hidden
bidirectional sync.

Future export/disconnect requirements:

- The user must see warnings that exported records become local copies or a
  local backup/export package, not a continuing live link to server truth.
- The server remains authoritative for server records until a separate,
  explicit, authorized server deletion, archive, retention, or export policy
  says otherwise.
- Disconnecting a client from a server must not delete server records, mutate
  settlements, revoke unrelated sessions, or bypass storage/file retention
  policy unless a future scoped operation explicitly approves those effects.
- Export packages must preserve provenance, such as source server/workspace
  identity, export time, record IDs/versions where safe, actor/request context,
  filters, and policy warnings.
- Export packages must avoid secrets, raw tokens, session credentials,
  provider internals, storage object keys, signed URLs, raw OCR text by
  default, file bytes unless explicitly included by policy, and unrelated data.
- Re-importing an export is a new import/restore decision. It is not automatic
  sync with the original server.

If a future export includes files, the exported file material is a local copy
or package payload governed by export policy. It must not expose server storage
object keys, provider paths, signed URLs, or local API storage paths as if they
were portable references.

## Backup And Restore

Local backup restore and server database/storage restore are different
operations:

- Local backup restore affects a local-only profile or local export package. It
  must not silently overwrite server truth or create server accounts.
- Server restore affects the server consistency set and remains deployment,
  storage, privacy, schema, and manual-gate sensitive. It must follow the
  deployment restore runbook and must not be triggered by ordinary client
  import/export UI.
- Product import/export restores are application data portability flows. They
  must preserve provenance and conflict markers and must pass server validation
  before affecting server truth.

Restored local data must carry source/provenance metadata where practical:
source boundary, backup/export timestamp, source app/server version, local
profile identity, server record IDs/versions where safe, file inclusion state,
privacy/vault mode, and known unresolved conflicts.

Restore/import must not silently erase server-current records, downgrade
privacy mode, bypass authorization, replay stale settlements, overwrite
accepted bill revisions, relink files to storage paths, or clear conflict
markers. When restored data differs from current server truth, the future
runtime behavior must produce conflict/review state or rejection.

Restore/import must produce a user-visible preview or diff before any apply or
write. The preview should show safe counts and expandable categories for added
records, changed records, duplicate/skipped records, conflicts requiring
review, blocked records/sections, privacy/vault warnings, file included/
missing/metadata-only status, and local or destination records not present in
the backup/import package. Records that exist locally or in the destination but
are not present in the package must be kept by default. Deleting or replacing
current state requires an explicit dangerous replace/purge mode, warning,
confirmation, dependency checks, and audit/retention policy where applicable.
Preview and problem details must not expose secrets, raw tokens, raw OCR text,
file bytes, storage paths, object keys, signed URLs, private notes, or
unrelated user financial data.

## Storage And File Boundaries

Server-mode file bytes still go through the API storage abstraction:

- Local files and local paths must not become server storage references.
- Server records reference stable file IDs and safe metadata, not local device
  paths, filesystem paths, storage object keys, bucket paths, provider URLs,
  signed URLs, or provider internals.
- Imported files require a future upload/import-intent flow that validates
  actor authorization, file purpose, content type/signature, size, retention,
  privacy/vault policy, and subject association before linking to server
  records.
- File IDs and object references must remain provider-neutral so local
  filesystem storage and future object storage can share the same API/domain
  boundary.
- API responses, audit records, issue comments, validation logs, and Codex
  reports must not include storage paths, object keys, signed URLs, provider
  internals, raw OCR text, file bytes, local device paths, or unrelated
  sensitive data.

An import/export manifest may include safe file descriptors, hashes, sizes,
purposes, source provenance, and local package references. Those descriptors do
not authorize server reads or writes until the API validates the file import
and records server-side file metadata.

## Auth And Security Boundaries

Local-only profiles are not authenticated server accounts:

- Local profile data must not silently create, claim, or link to server auth
  accounts.
- Server import requires an authenticated actor, active session validation,
  current-profile resolution, authorization checks, and policy evaluation.
- Account linking, invitation acceptance, local-to-server migration, OIDC/local
  account association, and future recovery flows are separate auth/security
  operations. They require explicit user intent and future manual-gated design
  where runtime behavior changes.
- Import/export/restore payloads must not carry passwords, raw session tokens,
  refresh credentials, provider tokens, MFA secrets, passkey material, recovery
  codes, reset tokens, reusable challenges, SSH material, `.env` values, or
  local Codex state.

Auth/session failures during import or export must fail closed with safe
problem categories. They must not leak whether unrelated users, groups, bills,
files, settlements, payment details, or private records exist.

## Money, Settlement, And Sync Boundaries

Server API/domain services remain authoritative for:

- money amounts, currency, rounding, tax, split shares, FX snapshots, residuals,
  settlement balances, payment status, bill status transitions, payer
  confirmation, affected-user state, and calculation hashes;
- authorization, file access, storage policy, sync acceptance, conflict
  classification, idempotency results, status transitions, and server audit.

Clients may display previews, preserve local pending data, submit candidate
records, submit user intent, retry with idempotency, and render server results.
Clients must not decide final money state, final settlement truth, final bill
status, final authorization, final storage access, final conflict resolution,
or final audit truth.

Local-only data may be locally authoritative for the local profile, but that
local truth does not become server truth until accepted by server validation.
Server-mode offline queue records are delayed user intent and remain pending
until accepted by the API.

## Audit And Privacy

Server-side import/export/disconnect/restore attempts and outcomes require
bounded audit when implemented. Audit should be emitted from API/domain
services, not only from clients.

Recommended audit metadata categories:

- actor/account/profile and authorization context;
- operation category, such as import preflight, import accepted, partial import
  conflict, export requested, export completed, disconnect requested, restore
  preflight, restore rejected, or restore conflict;
- source and destination authority boundary category;
- import/export/restore session identity or correlation ID;
- record/file counts by safe category where disclosure is authorized;
- outcome category, conflict/rejection class, and safe policy reason;
- timestamp and request/correlation metadata.

Audit/logs must avoid secrets, credentials, tokens, recovery codes, MFA/passkey
material, raw OCR text, file bytes, storage paths, object keys, signed URLs,
provider internals, local device paths, raw request/response bodies, unbounded
private notes, payment details beyond the audited actor's authorized scope, and
unrelated sensitive data.

Denied and failed responses must avoid existence leaks. They should use bounded
categories such as unauthorized, policy blocked, invalid import package,
conflict, duplicate import session, storage policy blocked, money validation
failed, privacy mode mismatch, or retryable server failure.

## Future Validation Expectations

This docs/control task requires docs-only validation now.

Future runtime, API, import/export, storage, schema, OpenAPI, generated-client,
mobile, web, admin, or deployment tasks must add validation that matches the
changed surface, including where relevant:

- server import preflight and acceptance tests for authentication,
  authorization, idempotency, duplicate replay, partial acceptance, rejection,
  and conflict preservation;
- money, bill, settlement, payment, FX, rounding, and status-transition tests
  proving clients do not become authority through import or sync;
- storage/file tests proving imported files use API storage abstraction and
  responses omit storage internals, local paths, object keys, signed URLs, raw
  OCR text, and file bytes;
- auth/security tests proving local profiles do not silently become server
  accounts and import requires an authenticated authorized actor;
- local persistence tests proving local pending/candidate data is preserved
  until accepted, rejected, conflicted, explicitly exported, or explicitly
  discarded;
- export/disconnect tests proving local exports are copies, not hidden
  bidirectional sync;
- backup/restore tests proving restored data preserves provenance, conflict
  markers, privacy mode warnings, and no silent overwrite of server truth;
- OpenAPI/generated-client validation only when future canonical contract work
  is explicitly in scope and generated from the source contract;
- mobile/web/admin UI validation and Figma/reference review only when future
  UI tasks are explicitly in scope.

## Implementation Gates And Non-goals

Before runtime work, future issues must separately scope and gate:

- local storage/security and local backup/export behavior;
- import/export package formats, manifests, and retention;
- API import/export endpoints or feature-specific migration endpoints;
- OpenAPI contracts and generated clients;
- schema, migrations, import session persistence, and idempotency persistence;
- storage upload/import-intent handling and file-byte lifecycle;
- auth/account linking, current actor, authorization, and account recovery
  behavior;
- money, bill, settlement, payment, OCR, recurring, and report import rules;
- backup automation, restore execution, deployment hooks, and admin maintenance
  surfaces;
- mobile/web/admin UX and Figma/reference artifacts.

This document does not implement runtime import/export behavior, runtime sync
queue or server sync endpoint behavior, Settleora Cloud runtime, federation,
cross-server sync, schema/EF migrations/model snapshots, OpenAPI or generated
clients, mobile/web/admin UI, Figma/reference work, storage provider/file-byte
lifecycle changes, auth/session/security runtime changes, money/settlement/
payment/bill calculation changes, Docker/CI/deployment/env/release changes,
secrets handling, local Codex state changes, backup automation, restore
execution, or issue closure.
