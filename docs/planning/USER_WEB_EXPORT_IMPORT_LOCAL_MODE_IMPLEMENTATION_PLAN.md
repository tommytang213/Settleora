# User Web Export, Import, And Local-Mode Implementation Plan

## Status

Planning/control gate for issue #461 under the user-web Day 1 parent. This
plan follows PR #591, which merged the user-web reports/search readout slice.

This plan does not implement runtime UI, API behavior, OpenAPI contracts,
generated clients, schema/migrations, auth/session/security behavior,
storage/file-byte behavior, export/import/download/upload behavior, local
backup/restore runtime, sync mutation behavior, Docker, deployment, CI,
environment configuration, mobile/admin UI, or secrets.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [Day 1 UX reference decisions](DAY1_UX_REFERENCE_DECISIONS.md)
- [Day 1 UX implementation readiness plan](DAY1_UX_IMPLEMENTATION_READINESS_PLAN.md)
- [User web bills, groups, friends, and direct-sharing implementation plan](USER_WEB_BILLS_GROUPS_FRIENDS_IMPLEMENTATION_PLAN.md)
- [User web export readiness contract plan](USER_WEB_EXPORT_READINESS_CONTRACT_PLAN.md)
- [User web import preflight and review plan](USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md)
- [User web import confirmation contract plan](USER_WEB_IMPORT_CONFIRMATION_CONTRACT_PLAN.md)
- [User web sync and local status plan](USER_WEB_SYNC_LOCAL_STATUS_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Local-only and server-mode authority boundary audit](../architecture/LOCAL_SERVER_MODE_AUTHORITY_BOUNDARY_AUDIT.md)
- [CSV export and import privacy authority](../architecture/CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Local backup and restore package security](../architecture/LOCAL_BACKUP_RESTORE_PACKAGE_SECURITY.md)
- [Import validation, conflict, and migration policy](../architecture/IMPORT_VALIDATION_CONFLICT_MIGRATION_POLICY.md)
- [Import/export storage, privacy, and audit validation matrix](../architecture/IMPORT_EXPORT_STORAGE_PRIVACY_AUDIT_VALIDATION_MATRIX.md)
- [Server sync acceptance, idempotency, and conflict policy](../architecture/SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Sync audit and validation matrix](../architecture/SYNC_AUDIT_VALIDATION_MATRIX.md)
- [Storage file metadata architecture](../architecture/STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](../architecture/STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Auth runtime and current-user design](../architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md)

## Current State

PR #591 delivered a read-only `#/reports` user-web slice for #461. It loads the
monthly report through `getMonthlyReport` and uses `listPersonalBills` with a
bounded search query for server-backed bill search rows. The slice renders only
server-returned report/search fields and keeps report totals, reconciliation
counts, settlement counts, and search eligibility API/domain-authoritative.

Implementation update on 2026-06-29: the first import contract/API slice added
non-mutating CSV preflight/review methods
`preflightPersonalBillsCsvImport` and `preflightGroupBillsCsvImport`. These
methods parse and validate bounded CSV for review metadata only; they do not
confirm imports, create bills, store CSV bytes, or authorize user-web upload
buttons. Direct import mutation and user-web import runtime remain separate
gated follow-ups.

Implementation update on 2026-06-29: the import confirmation contract/API
slice added `createPersonalBillCsvImportSession`,
`createGroupBillCsvImportSession`, `getBillCsvImportSession`,
`confirmBillCsvImportSession`, and `discardBillCsvImportSession`. These methods
create short-lived server-side import sessions with payload digest and
confirmation challenge, then require confirmation-time revalidation before draft
bills are written. They do not wire user-web confirmation runtime, sync
mutation, storage/file bytes, local backup/restore, or browser local-mode
persistence.

PR #591 intentionally did not start CSV/JSON/PDF download generation, file
download actions, CSV import/upload/restore, local backup, sync mutations,
storage/file-byte reads, receipt/proof/QR/statement content reads, client-side
money/report/authorization/sync/export/import/backup truth, fake sessions, fake
report data, fake search rows, or fake import/export/local-backup data.

The current user-web shell has:

- `#/reports`: session-gated monthly report and personal bill search readout.
- `#/import-export`: placeholder navigation surface with staged import, scoped
  export, local backup, and restore readiness language, but no runtime screen.
- Reports unavailable copy stating that CSV/JSON/PDF downloads are not started,
  CSV import/upload/restore/local backup actions are unavailable, and report
  truth comes from Settleora responses.

Current generated-client export/import/sync/local-adjacent methods include:

| Category | Generated web client methods | Current posture for user web |
| --- | --- | --- |
| Personal bill export | `exportPersonalBillsCsv`, `exportPersonalBillsJson` | Operation methods exist. Runtime use still needs explicit approval that direct authorized download behavior, audit, filters, browser handling, retention, and privacy copy are adequate. |
| Group bill export | `exportGroupBillsCsv`, `exportGroupBillsJson` | Operation methods exist for a specific group. Runtime use still needs group picker/scope authorization UI and privacy review. |
| Personal bill import | `importPersonalBillsCsv` | Mutation method exists and creates draft/import summaries according to the contract. User-web upload/import UI requires a separate mutation and storage/privacy/money/audit gate. |
| Group bill import | `importGroupBillsCsv` | Mutation method exists for a specific group. Requires explicit group-scope UI, import review behavior, and mutation gates before use. |
| Sync | `listSyncChanges`, `submitSyncOperation`, `getSyncOperation` | Operation/read methods exist for sync foundations, but there is no dedicated safe user-web sync/local-mode status surface. Submission is mutation-sensitive and must not be bundled with display readiness. |

Safe read methods currently absent for this plan:

- No dedicated global advanced-search endpoint beyond existing bill list filters.
- No report catalog/history endpoint.
- No group-wide report picker/readiness endpoint for user web.
- No safe export/import/local-backup availability metadata endpoint separate
  from operation methods.
- No safe export/import policy/readiness endpoint that says which formats,
  scopes, row limits, retention, redactions, audit categories, or unavailable
  reasons apply before an export/import action starts.
- No import preflight/session/readout endpoint separate from CSV import
  mutation behavior.
- No browser/user-web local backup creation, restore preview, or restore
  confirmation generated-client surface.
- No browser-local persistence authority design for user-web local mode.
- No safe local/server mode status endpoint that makes browser-local authority
  real for user web.

## Authority And Privacy Boundaries

API/domain services remain authoritative for export authorization, import
validation, sync acceptance, local/server mode state in server mode, money and
report truth, authorization, status transitions, storage access, and audit.

User web must not infer authorization, availability, or safety from routes,
cached rows, hidden buttons, generated-client method availability, local search
results, group labels, local mode labels, restored backup metadata, or browser
local state.

Exports are sensitive data egress. User-web export runtime must use
server-authorized filters and privacy-aware API responses. Export responses
must not expose storage paths, storage object keys, signed URLs, provider
internals, file bytes, raw OCR text, receipt/proof/QR/payment data, raw
statement rows, private notes, secrets, tokens, credential material, or
unrelated user data. CSV and JSON export must be presented as scoped copies,
not complete backups or live sync links.

Imports and restores are data mutation paths. They require backend validation,
explicit user acceptance, conflict handling, idempotency/retry behavior where
applicable, and bounded audit. User web may parse for convenience only if a
future task explicitly scopes it, but final authorization, money, settlement,
bill status, storage, sync, import acceptance, and audit remain server-owned.

Local-only authority belongs to local/mobile storage unless a future user-web
local mode design explicitly creates browser-local persistence rules. Until
then, user-web local mode can only show honest unavailable/readiness copy. It
must not create fake local profiles, fake local bills, fake backups, fake sync
state, or browser-local financial truth.

File bytes, receipt images, settlement proof files, payment QR images,
statement uploads/rows, storage object IDs/keys, storage paths, provider
internals, vault internals, raw OCR text, payment details outside authorized
settlement context, and secrets remain protected. Any user-web file download,
upload, restore, or content-read behavior requires a storage/file privacy
review and a separate branch gate.

## Safe User-Web Work Available Now

A narrow user-web availability surface can be implemented now without new
OpenAPI if it stays display-only and honest:

- Add a `#/import-export` route that reuses the merged modern rounded
  Settleora fintech shell and shared user-web components.
- Show current capabilities as product-facing readiness cards: scoped bill
  export, staged bill import, sync status, and local backup/restore.
- If no safe readiness endpoint exists, state that export/import/local backup
  controls are not available from this web build yet.
- Link or route back to existing `#/reports`, `#/bills`, and group contexts
  without starting downloads, uploads, restores, or sync submissions.
- Render only static product copy plus any already-safe session state. Do not
  call operation methods just to discover availability.

This display-only slice should not expose disabled buttons that look like
working downloads/uploads. Use honest unavailable states such as `Export CSV
unavailable`, `Import bills unavailable`, and `Restore backup unavailable`.

## Work Requiring Backend, API, OpenAPI, Or Generated-Client Work First

These should be separate contract/API tasks before user-web runtime uses them:

- Safe export/import/local-backup readiness metadata endpoint covering allowed
  formats, scopes, row limits, privacy redactions, audit category, file
  inclusion state, unavailable reasons, and required confirmation labels.
- Export preflight or readiness endpoint if direct `export*.csv/json` operation
  methods are not approved for immediate authorized browser download behavior.
- Import preflight/session endpoints that can validate CSV shape, produce safe
  row problems, preserve candidates, and require explicit acceptance before
  server truth changes.
- Local backup/restore package preflight, manifest read, restore preview, and
  confirmation contracts if user web is ever allowed to participate.
- Safe sync/local-mode status read methods for user web, distinct from sync
  mutation submission.
- Group report/search/export scope discovery where user web needs a group-wide
  picker beyond existing group-specific bill list/export methods.

OpenAPI is the source of truth for these contracts. Generated web clients must
be regenerated through the repo workflow and never hand-edited.

## Recommended Follow-Up Slices

Keep #461 work reviewable and do not combine display readiness, export runtime,
import mutation, sync, and local persistence in one PR.

| Order | Slice | Suggested branch | Gates |
| ---: | --- | --- | --- |
| 1 | User-web export/import/local-mode availability surface, display-only when no safe metadata endpoint exists | `feature/user-web-import-export-availability-461` | Web visual evidence; no OpenAPI/client/backend/runtime operation calls; no storage/file-byte behavior. |
| 2 | Export readiness contract/API slice, only if direct generated export methods are not approved for user-web download runtime | `feature/export-readiness-contract-461` | OpenAPI/generated-client manual gate; API/domain authorization, privacy, audit, storage/file policy review. |
| 3 | User-web export runtime slice for approved CSV/JSON download behavior | `feature/user-web-export-runtime-461` | Storage/privacy and data-egress manual gate; auth/session gate; browser download handling review; visual evidence; no import/restore/sync mutation. |
| 4 | Import/upload/restore planning or contract slice before any user-web upload/mutation UI | `feature/import-restore-contract-plan-461` | OpenAPI/generated-client, storage/file privacy, money/bill authority, audit, conflict/idempotency gates. |
| 5 | User-web import upload/review runtime only after staged import contracts are approved | `feature/user-web-import-review-runtime-461` | Mutation manual gate; file upload gate; money/bill validation gate; conflict/audit validation; visual evidence for row errors and explicit `Import bills` confirmation. |
| 6 | Sync/local-mode status readout slice only if safe read methods exist or after contract work | `feature/user-web-sync-local-status-461` | Sync authority gate; auth/session gate; no `submitSyncOperation` unless a separate mutation task approves it. |
| 7 | User-web local-mode/browser persistence design gate, only if product wants browser-local authority | `docs/user-web-browser-local-mode-design-461` | Manual product/security/privacy/storage gate; must define encryption, retention, backup, restore, conflict, no-silent-server-migration, and browser storage limits before runtime. |

The next safest runtime task is slice 1: a display-only availability surface.
The next safest contract task is slice 2 if reviewers decide existing
`exportPersonalBillsCsv`, `exportPersonalBillsJson`, `exportGroupBillsCsv`, and
`exportGroupBillsJson` are too action-oriented to drive web availability UI
directly.

After the user-web export runtime slice, import remains a separate mutation
gate. The staged
[user web import preflight and review plan](USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md)
covers non-mutating review only. The next confirmation gate is the
[user web import confirmation contract plan](USER_WEB_IMPORT_CONFIRMATION_CONTRACT_PLAN.md),
not a direct call to `importPersonalBillsCsv` or `importGroupBillsCsv`.

## UI/UX Notes

User-web import/export/local-mode work must reuse the merged modern rounded
Settleora fintech shell and shared user-web components. Do not introduce a new
visual system, new card language, or broad navigation restructuring for #461.

Use product-facing copy only. Normal UI should not mention implementation
seams, generated clients, endpoint names, storage internals, or developer
notes. It may say an action is unavailable, requires a server-authorized
export, or needs a future reviewed import flow.

Dangerous or sensitive actions need explicit labels:

- `Export CSV`
- `Export JSON`
- `Import bills`
- `Upload CSV`
- `Restore backup`
- `Review import`
- `Discard import`

Avoid vague confirmation labels such as `Continue`, `OK`, `Proceed`, or
`Apply` for export/import/restore actions. Confirmation copy must identify what
data moves and which authority boundary is affected.

Unavailable UI must be honest. If the only current safe state is display-only,
show an unavailable/readiness state rather than a disabled control that implies
the operation exists. Do not add fake sample exports, fake import history, fake
local backups, fake sync queue rows, or fake browser-local profiles.

## Non-Goals And Manual Gates

This plan does not authorize:

- Runtime app code changes.
- OpenAPI contract changes.
- Generated-client changes.
- Backend/API behavior changes.
- Database schema or migrations.
- Auth/session/security runtime changes.
- Storage/file-byte behavior.
- Money/report/export/import/sync authority changes.
- Docker, deployment, CI, environment, or secret changes.
- Mobile or admin-web changes.

Manual approval or separate branch gates are required for:

- File downloads, export file generation, browser download behavior, or export
  retention/expiry.
- CSV uploads, import mutations, import candidate acceptance, rejected-row
  discard, or conflict resolution.
- Backup package creation, restore preview, restore confirmation, or any data
  loss/destructive behavior.
- Sync submission, sync conflict resolution, or queue mutation.
- Storage content reads, receipt/proof/QR/statement content reads, or any
  storage/file privacy change.
- Auth/session persistence, sign-in/session refresh changes, local/server mode
  persistence, or browser-local authority.
- OpenAPI/generated-client changes.
- Any money, settlement, payment, bill calculation, report truth, schema,
  migration, deployment, CI, Docker, environment, or secrets change.

## Acceptance Checklist

- The next Codex runtime/contract task can choose a slice above without
  guessing which operations are allowed.
- Issue #461 context is explicit: PR #591 covered reports/search readout only;
  export/import/local-mode runtime remains separate.
- Current generated-client export/import/sync methods and missing safe read
  methods are named.
- API/domain authority, data-egress privacy, import/restore mutation handling,
  sync acceptance, local/mobile authority, and file-byte boundaries are
  preserved.
- UI copy guidance is product-facing and unavailable states are honest.
- No implementation code, OpenAPI contracts, generated clients, backend/API
  behavior, schema, storage/file behavior, money/report/sync authority, mobile,
  admin, Docker, CI, deployment, environment, or secrets are changed by this
  planning gate.
