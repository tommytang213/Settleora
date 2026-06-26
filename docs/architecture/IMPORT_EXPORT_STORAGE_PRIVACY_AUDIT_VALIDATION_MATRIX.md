# Import Export Storage Privacy Audit Validation Matrix

## Purpose

This document is a docs/control validation matrix for #457, under parent #406.
It consolidates future validation expectations and stop conditions for the
Day 1 CSV export/import and local backup/restore bundle.

This is not proof that import, export, backup, restore, migration, storage
provider behavior, file-byte handling, OpenAPI contracts, generated clients,
schema changes, auth/session behavior, money calculation behavior, mobile/web
UI, Figma/reference assets, Docker/CI behavior, deployment automation, or
secrets handling is implemented.

## Related Documents

- [CSV export and import privacy authority](CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Local backup and restore package security](LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)
- [Import validation, conflict, and migration policy](IMPORT_VALIDATION_CONFLICT_MIGRATION_POLICY.md)
- [Local, server, import, export, and restore boundaries](LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Offline queue persistence and sync state model](OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Sync audit and validation matrix](SYNC_AUDIT_VALIDATION_MATRIX.md)
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Privacy vault architecture](PRIVACY_VAULT_ARCHITECTURE.md)
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md)

## Authority And Privacy Invariants

Future validation must prove these invariants whenever runtime work touches CSV
export, CSV import, local backup/restore, local/server migration, storage
references, privacy/vault metadata, audit, or money-bearing records:

- API/domain services own server-mode business writes, authorization, money,
  settlement/payment state, storage access, sync acceptance, status transitions,
  and server audit.
- CSV import, backup restore, and migration candidates remain staged drafts,
  review records, or pending candidates until validated and explicitly accepted
  by the relevant local or server authority.
- Local-only, server-mode, CSV export, CSV import, local backup, restore,
  local-to-server migration, and server-to-local export/disconnect are separate
  authority boundaries and must not silently merge.
- File bytes go through the storage abstraction in server mode; API responses,
  exports, backups, logs, audit records, reports, and errors must not expose raw
  local paths, storage object keys, signed URLs, provider internals, vault keys,
  or raw key material.
- Money values use decimal-safe representations with attached currency and
  centralized rounding. Import/export/backup workflows cannot silently rebalance,
  settle, pay, or mutate bill/settlement/payment calculations.
- Audit and diagnostics use bounded event names, safe metadata, counts, hashes,
  correlation IDs, and outcome categories instead of raw CSV rows, raw payloads,
  file bytes, raw OCR text, secrets, provider internals, or unrelated user data.

## Export And Import Validation Matrix

| Flow | Future validation must prove | Example validation evidence | Stop condition |
|---|---|---|---|
| CSV export authorization scope | Export uses current actor, account/profile, group membership, role, visibility, privacy mode, retention, and selected filters before collecting rows. | Tests cover own records, shared group records, hidden/private records, archived/deleted/finalized records, date/category/group filters, and unauthorized actors. | Stop if export scope is derived from hidden UI controls, stale local cache, client-only roles, or unreviewed direct database/file access. |
| CSV export filters | Date, group, bill, settlement, category, participant, payment/proof, attachment, privacy, and status filters are applied predictably and recorded as safe provenance. | Export fixtures compare included/excluded row counts and filter metadata without storing raw sensitive payloads in logs. | Stop if filters can leak unrelated records, bypass authorization, or create an unbounded full export without explicit scope and warning. |
| CSV export denied fields | Denied fields are omitted or redacted: secrets, tokens, recovery codes, session/auth state, raw vault key material, provider internals, local device paths, storage object keys, signed URLs, raw OCR text, private notes outside scope, and unrelated user data. | Field allowlist/denylist tests and fixture scans prove no forbidden columns or values appear. | Stop if export uses model serialization by default or includes raw storage/vault/auth/session/provider internals. |
| CSV export money stability | Monetary columns use decimal-safe strings, explicit currency, reviewed rounding policy outputs, and stable signed/unsigned semantics. | Golden fixtures cover multi-currency values, minor-unit edge cases, zero/negative/refund values, and round-trip parseability without floating-point drift. | Stop if export emits binary floating values, missing currency, silent rounding changes, or final settlement/payment truth not produced by API/domain services. |
| CSV export vault and storage privacy | Vault-protected content is not silently decrypted to plaintext, and file references are provider-neutral or stable file IDs only where authorized. | Tests cover standard secure and recoverable private vault modes, file inclusion choices, redacted references, and warning metadata. | Stop if export exposes plaintext vault contents, vault keys, envelope secrets, raw local paths, object keys, signed URLs, or provider-specific locations. |
| CSV import staging | Parsed rows become import sessions, staged candidates, review records, or drafts before any confirmed shared truth is created. | Tests assert candidate states such as parsed, pending validation, valid draft, conflict, duplicate, failed, rejected, accepted, and skipped. | Stop if a CSV row directly creates confirmed group bills, settlements, payments, file links, or audit truth before explicit acceptance. |
| CSV import money and currency | Imported amounts require valid decimal-safe values, attached currency, supported precision, central rounding policy, and domain validation before acceptance. | Fixtures cover malformed decimals, missing currency, unsupported currency, excess precision, refunds, residuals, multi-payer bills, and split totals. | Stop if import silently balances, rounds, changes payer shares, settles debt, mutates payments, or accepts money without API/domain validation. |
| CSV import relationships | Ownership, participants, groups, categories, bill references, settlement/payment references, attachment references, and source provenance are validated against local/server authority. | Tests cover missing, ambiguous, unauthorized, archived, deleted, hidden, duplicate, and stale references with privacy-safe problem details. | Stop if local profile IDs become server account authority or unresolved references are auto-created as shared truth without explicit scoped behavior. |
| CSV import duplicates and idempotency | Duplicate rows, replayed files, repeated idempotency keys, same candidate hashes, and different payloads under the same key have deterministic outcomes. | Tests cover replay with same body, replay with changed body, duplicate bill references, duplicate attachments, and partial retry after accepted candidates. | Stop if retry creates duplicate bills, settlements, payments, file links, OCR records, notifications, or audit side effects. |
| CSV import conflicts and partial failure | Conflicted, failed, rejected, and partially imported candidates preserve local pending data, source row identity, safe reasons, and retry/review options. | Tests verify accepted candidates receive authoritative IDs while unresolved candidates remain reviewable and are not discarded. | Stop if partial success hides failed candidates, overwrites server-current values, silently merges conflicts, or drops local source data. |

## Backup, Restore, And Migration Matrix

| Flow | Future validation must prove | Example validation evidence | Stop condition |
|---|---|---|---|
| Local backup package manifest | Package includes manifest version, package mode, authority boundary, source workspace/profile category, timestamps, app/schema version, section list, encryption state, and safe provenance. | Manifest fixtures validate required fields, unsupported version handling, mode mismatch warnings, and package integrity metadata. | Stop if manifest omits authority boundary/mode or includes secrets, tokens, session state, raw key material, local auth state, provider internals, or raw paths. |
| Backup encryption posture | Backup payload sections are encrypted by default where feasible, with clear warnings for any intentionally plaintext metadata. | Tests cover encrypted package creation, unsupported encryption failure states, passphrase/key unavailability, and plaintext metadata review. | Stop if sensitive data is written plaintext by default or backup succeeds silently after encryption failure. |
| Backup vault/envelope metadata | Backup can preserve vault/envelope metadata categories needed for restore without exposing raw vault keys, recovery codes, or envelope secrets. | Fixtures distinguish safe envelope identifiers, wrapped/encrypted payload categories, and redacted vault internals. | Stop if backup exports raw vault keys, recovery secrets, unwrapped key material, or plaintext sensitive vault content. |
| Backup blob references | File/blob references are package-local, provider-neutral, and detached from server storage object keys or local filesystem paths. | Package scans verify blob IDs, content hashes, sizes, MIME categories, inclusion policy, and absence of provider-specific locations. | Stop if backup embeds local paths, bucket names, raw object keys, signed URLs, provider credentials, or server storage internals. |
| Restore preview and validation | Restore requires preview, validation, explicit confirmation, authority-boundary warnings, privacy-mode warnings, unsupported-version handling, and non-destructive candidate planning. | Tests cover preview counts, section warnings, conflicts, omitted sections, failed sections, downgrade prevention, and confirmation gating. | Stop if restore writes records before preview/confirmation or hides destructive, privacy, schema, version, or authority-boundary warnings. |
| Local-only versus server mode restore | Local restore affects local-only profile/package scope only; server-mode restore remains deployment/manual-gate sensitive and cannot be triggered by ordinary import UI. | Tests cover local-only restore, server-mode import candidate creation, and blocked server restore through app UI. | Stop if local restore overwrites server truth, creates server accounts, joins collaboration, or becomes hidden bidirectional sync. |
| Local-to-server migration | Migration imports local candidates through server validation for auth, authorization, visibility, duplicates, money, storage, privacy, conflicts, and audit. | Tests cover accepted, rejected, conflict, duplicate, failed, partial, and retry outcomes with authoritative IDs only after server acceptance. | Stop if local records become server records without API/domain acceptance or local privacy state becomes server policy authority. |
| Server-to-local export/disconnect | Export or disconnect is a copy/package with warnings, not a live sync channel or server mutation. | Tests cover export provenance, disconnect warnings, retention policy, file inclusion, and no server mutation during export. | Stop if export creates hidden bidirectional sync, bypasses retention, mutates server data, or embeds server storage internals. |
| No destructive migration or silent merge | Migration and restore preserve conflicts, failed candidates, source provenance, and current data unless a separately scoped destructive operation is explicitly approved. | Tests verify no silent overwrite, conflict preservation, skipped-section reporting, and rollback/transaction boundaries where applicable. | Stop if restore/import silently merges, deletes, balances, overwrites, clears conflict markers, or discards source data without confirmation and policy. |

## Storage, Privacy, Audit, And Money Matrix

| Domain | Future validation must prove | Safe metadata examples | Stop condition |
|---|---|---|---|
| Storage abstraction | Server-mode file bytes are written, read, exported, imported, restored, and deleted through the storage abstraction and authorized API paths. | Stable file ID, purpose, MIME category, byte length, content hash, lifecycle state, subject category, correlation ID. | Stop if local paths, direct filesystem reads, object keys, signed URLs, provider internals, or file bytes become API/export/audit truth. |
| File access authorization | Every file included in export/import/backup/restore is scoped by actor, workspace/profile, subject, purpose, privacy mode, retention, and lifecycle state. | Authorized count, omitted count by reason, file inclusion policy, redacted subject category. | Stop if file inclusion bypasses API authorization or leaks existence of unrelated/private files. |
| Redaction surfaces | Logs, audit, reports, validation output, errors, problem details, issue comments, and Codex reports avoid raw sensitive content. | Event name, actor/resource category, outcome, counts, safe hashes/fingerprints, version, warning code. | Stop if proving behavior requires publishing raw CSV payloads, file bytes, OCR text, secrets, tokens, paths, object keys, or unrelated user data. |
| Audit events | Events use bounded names and categories for export requested/completed/failed, import staged/validated/accepted/conflicted/rejected/failed, backup created/failed, restore previewed/confirmed/completed/failed, and migration accepted/conflicted/rejected. | Actor ID where authorized, subject category, export/import/backup/restore session ID, counts, outcome, correlation ID, timestamp. | Stop if audit stores raw CSV rows, raw backup payloads, raw OCR text, file bytes, secrets, vault keys, provider internals, or unbounded notes. |
| Denied and omitted data categories | Denied fields and intentionally omitted sections are visible as safe omission categories without exposing their values. | Omitted categories for private vault data, unsupported section, unauthorized file, hidden group, unsupported version, retention-blocked content. | Stop if omission categories reveal unrelated user/resource existence or export silently includes denied categories. |
| Money and settlement authority | Decimal/currency validation, central rounding, calculation hashes, status rules, bill revision bases, settlement/payment state, and residual behavior remain API/domain-owned. | Amount string, currency code, calculation basis ID/hash, candidate outcome, safe problem category. | Stop if import/export/restore silently changes balances, settlement requests, payments, bill totals, split shares, payer confirmation, or calculation authority. |

## Future Validation By Changed Surface

| Future changed surface | Required validation commands and gates |
|---|---|
| Docs-only import/export/control docs | `git diff --check`, `npm run doctor:validation`, `npm run validate:docs`, `npm run validate:scaffold`, and the task-specific scope guard/report. Do not run broad runtime validation unless scope expands. |
| API/runtime import/export/backup/restore | API/domain unit and integration tests for authorization, validation, staged candidates, accepted/rejected/conflict/failed/partial outcomes, idempotency, transactions, audit redaction, and no-silent-merge behavior; `npm run doctor:validation`; `npm run validate:api-local`. |
| OpenAPI/generated client | Manual OpenAPI/generated-client gate; canonical contract review; `npm run validate:openapi`; `npm run generate:clients`; generated diff review; `npm run validate:clients`; downstream mobile/web compile tests as scoped. |
| Schema/migration/model snapshots | Manual schema/migration gate; migration review for authority, privacy, retention, audit, idempotency, and rollback; EF/model snapshot validation; API local validation; no destructive migration without explicit human approval. |
| Storage/file-byte runtime | Storage abstraction tests, file authorization tests, provider-neutral reference tests, upload/download/import-intent tests, log/audit redaction scans, and API local validation. |
| Money/settlement runtime | Money/rounding tests, currency precision fixtures, bill/split/settlement/payment status tests, calculation-hash/basis tests, no-silent-balance mutation tests, and API local validation. |
| Mobile/UI/Figma/reference | #456 remains the separate UI/Figma/reference gate. Future UI work must use approved references, accessibility checks, mobile/web/admin scoped tests, and safe copy that never implies candidates are accepted server truth before validation. |
| Docker/CI/deploy/server backup | Manual deployment/CI gate; explicit runbook and operator-review validation; no ordinary app UI or docs/control task may introduce Docker, CI, deploy, or destructive server restore changes. |

## Issue And Gate Posture

- #453 completed the CSV export/import privacy and authority design.
- #454 completed the local backup/restore package and security design.
- #455 completed the import validation, conflict, and migration policy.
- #456 remains the UI/Figma/reference gate and is not modified by this matrix.
- #457 is this storage, privacy, audit, and validation-matrix slice only.
- #406 remains open for the broader Day 1 CSV import/export and local
  backup/restore planning bundle. This document must not be used to close #406
  or #457.

## Non-Goals

This document does not implement CSV import/export runtime, local backup/restore
runtime, local-to-server migration runtime, server-to-local disconnect/export
runtime, runtime tests, OpenAPI contracts, generated clients, schema migrations,
EF model snapshots, storage provider behavior, file-byte handling,
auth/session/security runtime, settlement/payment/bill calculation logic, OCR
runtime, mobile/web/admin UI, Figma/reference assets, Docker, CI, deployment,
environment behavior, release behavior, secrets handling, issue closure, or
follow-up issue creation.
