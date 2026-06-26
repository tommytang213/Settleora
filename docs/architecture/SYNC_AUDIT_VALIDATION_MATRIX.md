# Sync Audit And Validation Matrix

## Purpose

This document is a docs/control validation matrix for #447, under parent #362.
It consolidates audit and future validation expectations for server-mode sync
acceptance, client offline queues, local/server import and export boundaries,
and authority-sensitive operation classes.

This is not proof that runtime sync is implemented. It does not add runtime
tests, sync endpoints, OpenAPI contracts, generated clients, schema changes,
mobile persistence, UI, Figma/reference assets, import/export runtime, storage
behavior, auth/session behavior, money calculation behavior, Docker/CI changes,
deployment changes, or secrets handling.

## Related Documents

- [Offline queue persistence and sync state model](OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Local, server, import, export, and restore boundaries](LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md)
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Auth identity foundation](AUTH_IDENTITY_FOUNDATION.md)

## Authority And Audit Invariants

Future validation must prove these invariants wherever runtime work touches
sync, queueing, import/export, or local/server migration:

- API/domain services own server-mode business writes, authorization, money,
  settlement/payment state, file access, sync acceptance, status transitions,
  and server audit.
- Clients may cache, queue, retry, preserve pending data, and render server
  outcomes. They do not become the source of authorization, financial truth,
  settlement truth, storage truth, sync acceptance, conflict resolution, or
  audit truth.
- Every queued server-mode operation is authorized and validated as if the user
  submitted it online at sync time.
- Local-only, server-mode, export, import, backup, and restore flows are
  separate authority boundaries and must not silently merge.
- Failed, rejected, conflicted, cancelled, discarded, and superseded local
  queue entries preserve review context until explicit user action or documented
  retention policy applies.
- OpenAPI remains the source of truth when contract shapes are added later, and
  generated clients remain generated-only.

## Outcome And Conflict Matrix

| Scenario | Future validation must prove | Expected audit/log posture | Stop condition |
|---|---|---|---|
| Accepted server-mode queued operation | API/domain revalidates session, actor, authorization, visibility, domain rules, idempotency, and version basis before commit. Client marks item synced only after authoritative server outcome and refreshes affected cache. | Server audit records bounded actor, operation/resource category, authoritative subject where visible, outcome, payload hash, idempotency fingerprint, correlation ID, and timestamp. | Stop if a client queue state, generated-client method, cached membership, local role, or hidden UI control can finalize server truth. |
| Rejected server-mode queued operation | Invalid, unauthorized, unsupported, policy-blocked, not-visible, or malformed operations become failed locally with pending data and safe problem detail preserved. | Audit/logs use stable rejection category without raw payloads or existence leaks. | Stop if rejection deletes local pending work, silently retries forever, or returns raw exception/request details. |
| Stale resource version, ETag, calculation hash, revision basis, status basis, or policy version | Server returns conflict instead of silent merge or recalculation. Client preserves base context, local pending values, and authorized server-current summary where safe. | Audit records conflict category and safe basis metadata, not full object dumps. | Stop if stale money, settlement, bill revision, storage, auth, or status context can overwrite current server truth. |
| Unauthorized queued operation | Expired, revoked, disabled, wrong actor, missing role, missing group membership, missing step-up, MFA/passkey policy block, or abuse policy block fails closed. | Use generic safe categories where detail would leak account/resource existence. | Stop if queued operations bypass online authorization or reveal unrelated users, groups, bills, files, settlements, or payment details. |
| Not-visible resource attempt | Resource missing, unrelated, private, deleted, archived, cancelled, finalized, or hidden from actor returns rejected or conflict without existence leakage. | Audit may record internal resource category where authorized or operationally necessary, but responses stay privacy-safe. | Stop if problem detail tells an actor whether an unrelated resource exists or why they cannot see it. |
| Duplicate idempotency key with same payload | Server returns prior accepted/rejected/conflict/failed outcome according to retained idempotency record without duplicating side effects. | Audit/logs may mark duplicate replay using idempotency fingerprint and stored outcome category. | Stop if duplicate replay creates duplicate bills, settlements, payments, file links, OCR applies, notifications, or audit side effects. |
| Duplicate idempotency key with different payload | Server rejects or conflicts as idempotency body mismatch. Client preserves both local integrity context and newer intended operation if applicable. | Do not log raw bodies; record payload hash mismatch category and correlation ID. | Stop if same key plus different body overwrites prior intent or masks payload tampering as a retry. |
| Retryable failed sync | Transient server, storage, dependency, rate-limit, or network-adjacent failures preserve same idempotency key and payload hash with bounded retry/backoff metadata. | Logs carry safe retry category, attempt count, timestamp, and correlation ID. | Stop if retries spin tightly, change payload silently, or drop pending user data. |
| Cancelled local queue entry | User or local policy stops future attempts while preserving safe metadata and pending data until explicit discard or retention cleanup. | Local diagnostics may record cancellation reason safely; server audit exists only if the server was involved. | Stop if cancellation is treated as server undo or accepted mutation rollback without explicit server operation. |
| Discarded local queue entry | Explicit user discard removes or tombstones local pending data only after clear confirmation. Accepted server mutations remain unchanged. | Local audit/diagnostics record safe discard category where implemented. | Stop if discard deletes server truth, hides accepted server side effects, or loses unresolved conflict context without confirmation. |
| Superseded local queue entry | Replacement uses a new payload hash and usually new idempotency key. Older entry links to replacement and is retained until accepted, discarded, or retention policy applies. | Logs avoid raw payloads and record supersession linkage safely. | Stop if supersession reuses an old idempotency key with changed payload or silently deletes the prior pending entry. |

## Import, Export, Backup, And Restore Matrix

| Flow | Future validation must prove | Required audit/provenance | Stop condition |
|---|---|---|---|
| Local-to-server import | User explicitly starts import, server authenticates current actor, validates authorization, visibility, duplicate/replay, storage policy, money/currency/rounding, bill/settlement status, privacy/vault policy, and compatible contract support before creating server truth. | Import session or correlation ID, source/destination boundary category, actor, candidate counts by safe category, outcome, conflict/rejection category, and timestamp. | Stop if local records silently become server records, local profile IDs become account authority, or local money/settlement truth bypasses API/domain validation. |
| Partial import | Accepted candidates receive authoritative IDs/versions; rejected/conflicted/failed candidates remain local pending/candidate data with safe problem details. | Per-candidate safe outcome category and provenance sufficient for retry/review without raw dumps. | Stop if partial success hides failed candidates, duplicates accepted records on retry, or silently drops rejected local data. |
| Rejected import | No server truth is created for rejected candidates; user can review safe reasons and exclude, correct, retry where allowed, or export/discard. | Bounded rejection categories; no raw local database dumps, secrets, file bytes, raw OCR text, or local paths. | Stop if rejection authorizes automatic local discard or leaks unrelated server resources. |
| Import conflict | Current server state differs from candidate basis; client preserves candidate and authorized server-current summary where safe. | Conflict category, basis metadata, safe server summary, correlation ID. | Stop if import silently merges records, overwrites server-current values, or exposes resources the actor cannot see. |
| Export-to-local | User is warned that export is a copy/package, not live bidirectional sync. Server remains authoritative until separate authorized server operation changes it. | Source server/workspace identity where safe, export time, actor/request context, filters, record/file counts, file inclusion policy, warnings. | Stop if export creates a hidden live link, mutates server records, embeds storage object keys/signed URLs, or bypasses retention policy. |
| Backup/restore local | Local restore affects local-only profile/export package only and preserves provenance, unresolved conflicts, file inclusion state, privacy/vault warnings, and source version metadata. | Local provenance metadata and safe restore outcome categories. | Stop if local restore overwrites server truth, creates server accounts, clears conflict markers, or downgrades privacy mode silently. |
| Backup/restore server | Server restore remains deployment, schema, storage, privacy, and manual-gate sensitive and follows the deployment restore runbook, not ordinary client sync/import UI. | Deployment-runbook evidence with redacted operator data and consistency set identifiers. | Stop if ordinary app UI can trigger server restore, destructive data operation, or deployment behavior without manual gate. |

## Domain Stop Conditions

### Money, Bills, Settlements, And Payments

Future validation must cover decimal-safe values, attached currency, central
rounding policy, calculation hashes, revision bases, payer confirmation,
affected-user state, settlement residuals, payment proof policy, and status
transitions for every synced money-impacting operation.

Stop if a client can submit final financial truth, final settlement truth, final
participant shares, final tax allocation, final residual effects, final payer
confirmation, final affected-user state, or final audit truth as authority.

### Storage, Files, And OCR

Future validation must prove file bytes go through storage abstraction, file
references use stable file IDs or reviewed upload/import intents, and API
responses/logs avoid raw paths, object keys, provider internals, vault internals,
signed URLs, local device paths, file bytes, and raw OCR text.

Stop if a local file path becomes server storage truth, a queued payload embeds
file bytes, a response exposes storage internals, or OCR-derived server-mode
data bypasses API/domain validation.

### Auth, Session, And Security

Future validation must prove queued operations revalidate current session,
actor/profile, account state, role, membership, step-up freshness, MFA/passkey
policy, and authorization at sync time. Denials must preserve privacy and avoid
account/resource enumeration.

Stop if a queued operation bypasses expired/revoked sessions, disabled accounts,
missing step-up/session freshness, abuse policy, authorization recheck, or safe
denial privacy.

### Audit And Redaction

Audit, logs, problem details, test fixtures, validation output, issue comments,
and Codex reports must avoid secrets, tokens, credentials, recovery codes,
MFA/passkey material, raw idempotency keys in ordinary logs, raw OCR text, file
bytes, storage internals, vault internals, local device paths, raw request or
response bodies, unbounded private notes, payment details outside authorized
scope, and unrelated sensitive content.

Stop if validation requires collecting or publishing sensitive raw material to
prove sync behavior.

## Future Validation By Surface

| Future changed surface | Expected validation boundary |
|---|---|
| API/domain sync acceptance | Unit/integration tests for accepted, rejected, conflict, failed, authorization recheck, version guards, domain validation, transaction/idempotency consistency, and audit redaction. |
| OpenAPI contracts | Manual OpenAPI/generated-client gate, canonical contract review, additive stable result/problem shapes where practical, `npm run generate:clients`, generated diff review, and `npm run validate:clients`. |
| Generated clients | Generated-only diffs from canonical OpenAPI; tests prove typed client availability is not treated as permission or server acceptance. |
| Mobile/local persistence | Durable queue persistence across restart, state transitions, retry/backoff, cancellation, supersession, discard, privacy minimization, and pending-data preservation tests. |
| UI/Figma/reference | Covered by #446. Future UI work must reference approved state vocabulary and never imply queued local data is accepted server truth. This document does not create or update UI/reference assets. |
| Import/export runtime | Import preflight/acceptance/rejection/conflict/partial failure, export provenance, backup/restore provenance, privacy warnings, idempotency, and no-silent-merge tests. |
| Storage/file runtime | Purpose, size/type, lifecycle, subject association, privacy/vault policy, authorization, upload/import-intent, response redaction, and log redaction tests. |
| Money/settlement runtime | Decimal/currency/rounding, calculation-hash, bill revision, payer confirmation, residual, proof, status, and no-client-authority tests. |
| Auth/security runtime | Session expiry/revocation, disabled account, current actor/profile, authorization, step-up/freshness where required, denial privacy, and audit tests. |
| Docker, CI, deployment, release | Out of scope for sync validation matrix tasks unless a future deployment/runtime task explicitly scopes and gates those changes. |

## Issue And Gate Posture

- #443 completed the client offline queue persistence and sync state model.
- #444 completed the server sync acceptance, idempotency, and conflict policy.
- #445 completed local/server/import/export/restore authority boundaries.
- #446 remains the UI/Figma/reference gate for sync conflict and failure UX.
- #447 is this audit and validation matrix slice only.
- #362 remains open for the broader offline cache hydration and conflict
  acceptance plan. This document must not be used to close #362.

## Non-Goals

This document does not implement broad offline cache hydration, server sync
acceptance endpoints, idempotency persistence, conflict resolution runtime,
OpenAPI contracts, generated clients, EF models, schema migrations, mobile
queue persistence, mobile/web/admin UI, Figma/reference assets, import/export
runtime, storage provider behavior, file-byte handling, auth/session/security
runtime, money/settlement/payment/bill calculation logic, OCR runtime, Docker,
CI, deployment, environment, release behavior, secrets handling, Settleora
Cloud runtime, federation, cross-server sync, or issue closure.
