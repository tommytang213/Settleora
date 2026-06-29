# User Web Export Readiness Contract Plan

## Status

Planning/control gate for issue #461 after the merged user-web reports and
import/export availability readouts. This plan defines the contract shape that
should exist before user-web starts bill export downloads.

Implementation update on 2026-06-29: the additive contract/API slice added
`GET /api/v1/bills/export-readiness` (`getPersonalBillExportReadiness`) and
`GET /api/v1/groups/{groupId}/bills/export-readiness`
(`getGroupBillExportReadiness`). Both endpoints return
`ExpenseBillExportReadinessResponse` metadata only, use the same bounded filter
surface as the existing CSV/JSON export methods plus an optional `format`
readiness query, and do not return export rows, file bytes, storage references,
or import/sync/local-backup behavior.

The original planning gate did not implement runtime behavior. After the
2026-06-29 contract/API slice above, this document still does not authorize
user-web export runtime, export/download execution changes, schema/migration,
auth/session/security runtime changes, storage/file-byte behavior changes,
mobile/admin changes, Docker/deployment/CI/environment changes, sync mutation,
import/upload flows, local backup/restore flows, or local-mode persistence
design.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [User web export, import, and local-mode implementation plan](USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [CSV export and import privacy authority](../architecture/CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Import/export storage, privacy, and audit validation matrix](../architecture/IMPORT_EXPORT_STORAGE_PRIVACY_AUDIT_VALIDATION_MATRIX.md)
- [Storage file metadata architecture](../architecture/STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](../architecture/STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Auth runtime and current-user design](../architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md)

## Current State After PR #593

Recent #461 user-web work is read-only and display-only:

- PR #591 added `#/reports` reports/search readout. It loads
  `getMonthlyReport` and `listPersonalBills`, renders server-returned report
  and search fields, and states that CSV, JSON, PDF, import, restore, and local
  backup actions are unavailable from that readout.
- PR #592 added the broader export/import/local-mode implementation planning
  gate.
- PR #593 added `#/import-export` availability readout. It detects current
  generated-client operation method presence but intentionally does not call
  export, import, or sync operation methods.

Current user-web source posture:

- `apps/web-user/src/reportsReadout.ts` treats reports and search as safe
  server reads, but keeps downloads unavailable.
- `apps/web-user/src/importExportReadout.ts` treats export/import/sync methods
  as operation presence only and lists them under `intentionallyNotCalled`.
- `apps/web-user/src/App.tsx` routes to readouts but does not start export
  downloads, CSV uploads, import mutations, sync submissions, backup creation,
  restore, or local-mode persistence.
- `apps/web-user/src/shellModel.ts` labels reports and import/export as
  navigation surfaces; route availability is not permission or policy truth.

## Existing Generated-Client Methods

The current generated web client exposes these export/import/sync-adjacent
methods:

| Method | Current signature shape | Runtime readiness concern |
| --- | --- | --- |
| `exportPersonalBillsCsv` | Authenticated `GET /api/v1/bills/export.csv`, optional filters, returns `Blob` | A blob download alone does not tell user-web whether the export is currently allowed, what filters were accepted, what privacy redactions applied, how large the file may be, or how to present unavailable states safely. |
| `exportPersonalBillsJson` | Authenticated `GET /api/v1/bills/export.json`, optional filters, returns `ExpenseBillExportResponse` | Structured JSON may include safer metadata than CSV bytes, but method presence still does not prove user-web may enable an export button for the current actor/session/scope. |
| `exportGroupBillsCsv` | Authenticated group-scoped `GET /api/v1/groups/{groupId}/bills/export.csv`, optional filters, returns `Blob` | User-web needs explicit group-scope readiness, membership/role authorization, and privacy/audit expectations before exposing a group download. |
| `exportGroupBillsJson` | Authenticated group-scoped `GET /api/v1/groups/{groupId}/bills/export.json`, optional filters, returns `ExpenseBillExportResponse` | Same group readiness and privacy concerns as CSV, plus confirmation that JSON is a scoped export, not backup/sync truth. |
| `importPersonalBillsCsv` | Authenticated text/csv mutation, returns `BillCsvImportResponse` | Out of scope for export runtime. Import must stay in a separate preflight/review gate. |
| `importGroupBillsCsv` | Authenticated group text/csv mutation, returns `BillCsvImportResponse` | Out of scope for export runtime. Group import must stay in a separate preflight/review gate. |
| `listSyncChanges`, `submitSyncOperation`, `getSyncOperation` | Authenticated sync reads/mutation | Out of scope for export runtime. Sync status/submission must stay in separate gates. |

Method presence is not enough for runtime UX or safety because export is a
data-egress action. User-web must not infer export permission or availability
from a generated method, hidden button, local route, loaded report rows, cached
group labels, or local search results. API/domain services must remain
authoritative for actor identity, session validity, authorization, export
scope, money/report truth, privacy redaction, storage boundaries, audit, and
policy.

## Recommended Contract Shape

Before user-web enables export buttons, add an OpenAPI-sourced backend contract
that lets the client ask for export readiness without starting a download.
Names below are planning names, not approved endpoint names.

Recommended read methods:

- `GET /api/v1/bills/export-readiness`
- `GET /api/v1/groups/{groupId}/bills/export-readiness`

Recommended readiness response fields:

| Field | Purpose |
| --- | --- |
| `available` | Boolean summary for whether the requested actor/scope/filter/format can currently export. |
| `stableCode` | Stable machine code such as `export_available`, `auth_required`, `forbidden`, `policy_disabled`, `group_not_available`, `unsupported_format`, `filter_invalid`, `too_many_rows`, `export_too_large`, `async_required`, or `server_unavailable`. |
| `safeMessage` | User-facing safe message that does not reveal unrelated users, groups, files, storage internals, or hidden records. |
| `scope` | `personal` or `group`, plus safe group summary only when the actor may see it. |
| `formats` | Per-format readiness for `csv` and `json` now. `pdf_summary` should be absent or `unsupported` unless explicit API support exists. |
| `acceptedFilters` | Server-normalized filters that would be applied if exported. |
| `defaultedFilters` | Defaults applied by policy or server behavior, such as archive state or limit. |
| `rejectedFilters` | Safe field-level problem details for invalid filters. |
| `rowCountEstimate` | Count or bounded estimate of exportable rows visible to the actor. |
| `estimatedBytes` | Optional bounded estimated file size. |
| `maxRows`, `maxBytes` | Current policy limits for synchronous export. |
| `downloadMode` | `sync_download` now, or `async_job_required` if limits/policy require later async work. |
| `redactions` | Privacy categories omitted or redacted, without raw sensitive values. |
| `fileInclusion` | Explicitly `none` for current bill CSV/JSON export unless a future file-export package is approved. |
| `auditPreview` | Audit action/category that will be emitted on actual export, with safe subject/scope metadata. |
| `confirmation` | Explicit labels/copy requirements for the future user-web confirmation. |
| `expiresAt` | Optional readiness expiry timestamp so user-web knows when to refresh before download. |

The existing export execution methods may remain the actual download operations
if future backend/OpenAPI review confirms they return safe headers, errors,
and audit. The key contract gap is a pre-download readiness check that makes
the export decision explicit and reviewable before the browser receives bytes.

## Scope Rules

Personal export readiness must cover only records the current actor is allowed
to see in their personal bill context. It must not include unrelated group
records, unrelated users, private payment details, hidden receipt/proof/QR
content, raw OCR text, or records the actor cannot view.

Group export readiness must require an explicit `groupId` and server-derived
membership/role authorization. The response may include a safe group display
label only if the actor is authorized to see the group. A forbidden or missing
group must fail closed with safe problem details that do not disclose unrelated
group existence.

The future user-web export UI must make the selected scope visible before a
download starts:

- Personal export: "personal bills" scope.
- Group export: specific authorized group scope.
- No mixed personal-plus-group export unless a later contract explicitly
  designs that aggregate scope.

## Formats

CSV and JSON are the near-term formats because generated methods already exist
for personal and group bill export in those formats.

PDF summary is later unless explicit API support exists. User-web must not
create client-side PDF summaries as financial/report truth, must not scrape
HTML to produce a PDF that looks authoritative, and must not offer a PDF button
from generated method presence. A future PDF contract should define source
data, summary scope, privacy redaction, stable filename/content type, audit,
and whether the PDF is a report summary or export package section.

## Auth, Session, And Authorization Boundaries

Readiness and execution must require the current authenticated session in
server mode. The API must derive actor, profile, role, group membership,
visibility, policy, export scope, and audit actor from server state, not from
client-submitted IDs, labels, route state, local cache, or generated-client
method availability.

Failure behavior must fail closed:

- `401` for missing/expired/invalid session.
- `403` for authenticated actors who are not allowed to export the requested
  scope.
- `404` only where the API's existing safe resource policy says not found is
  appropriate; it must not leak unrelated group or bill existence.
- `409` or `422` for filter, policy, size, or state problems where safe problem
  details can guide the user.

User-web must refresh readiness before execution when readiness is expired,
the selected scope changes, filters change, the session changes, or the server
returns a stale-readiness/code mismatch.

## Privacy And Redaction Expectations

Export readiness must say which categories are omitted, redacted, unsupported,
or included for the selected actor/scope. Current bill CSV/JSON export should
exclude file bytes and storage references beyond safe metadata explicitly
allowed by policy.

Exports must not include:

- secrets, credentials, tokens, passwords, recovery codes, MFA/passkey material,
  reusable auth challenges, `.env` values, SSH material, or local Codex state;
- direct filesystem paths, local device paths, storage provider object keys,
  bucket paths, signed URLs, direct storage URLs, vault internals, or provider
  internals;
- raw OCR text by default, receipt/proof/QR/payment file bytes, private notes
  by default, unrelated user profile/payment details, or records hidden from
  the actor;
- unbounded raw problem details, exception text, request bodies, or exported
  plaintext contents in audit/log metadata.

Money values in exported records must remain decimal-safe strings with explicit
currency. Export must not turn a client-rendered report, local filter, or JSON
copy into authority for money, settlement status, bill revision state, or
future import acceptance.

## Filter Readiness Fields

The readiness request and response should cover the same filter surface that
the export execution methods support today, plus safe server normalization:

- `fromDate` and `toDate`;
- archive state such as active, archived, or all;
- group scope for group export, and no group scope for personal export unless a
  future aggregate contract adds it;
- bill status;
- reconciliation status;
- search text;
- merchant;
- currency;
- limit.

The response should distinguish:

- user-selected filters;
- server defaults;
- policy-imposed filters;
- unsupported filters ignored by the server;
- invalid filters rejected before execution;
- filters that are accepted but produce zero exportable rows.

Search/filter summaries must be safe and must not name or imply hidden users,
groups, files, bills, or private records.

## Size, Row Count, And Sync Versus Async Download

Readiness should expose current policy limits before a browser download starts:

- row count estimate or bounded range;
- estimated bytes where practical;
- maximum rows and maximum bytes for synchronous download;
- whether the selected filters are eligible for `sync_download`;
- whether a later `async_job_required` path is needed;
- safe unavailable code when the export is too large.

For Day 1 user-web runtime, prefer synchronous CSV/JSON download only when the
server can produce the file within bounded row/byte/time limits and emit audit
at execution. Async export jobs should be a separate contract if needed later,
with job creation, status, expiry, cancellation, result download, and retention
rules reviewed as storage/privacy behavior.

## Audit Expectations

Readiness checks and actual export execution should have separate audit
expectations:

- Readiness check audit may be lower-detail or policy-dependent, but should
  support detecting repeated denied/oversized export probing where appropriate.
- Actual export execution must emit an audit event with actor, action, scope,
  format, normalized filters, row count or bounded count, result category,
  timestamp, correlation/request ID, and safe policy/redaction summary.
- Audit must avoid exported plaintext contents, raw CSV/JSON payloads, secrets,
  tokens, passwords, sensitive file contents, raw OCR text, storage internals,
  and unnecessary PII.

Execution audit should happen server-side in API/domain services. User-web
event tracking is not a substitute for server audit.

## Error And Unavailable-State Contract

Readiness and execution errors should use safe problem details with stable
codes. The client should not need to parse exception text or infer policy from
HTTP status alone.

Recommended stable codes include:

- `auth_required`
- `session_expired`
- `forbidden`
- `policy_disabled`
- `scope_not_available`
- `group_not_available`
- `format_not_supported`
- `filter_invalid`
- `date_range_invalid`
- `search_too_long`
- `too_many_rows`
- `export_too_large`
- `async_required`
- `no_exportable_rows`
- `privacy_policy_blocked`
- `audit_unavailable`
- `server_unavailable`

Messages must be safe for display and must not reveal unrelated resource
existence. Field-level details may name only request fields and safe normalized
values.

## Browser Download Requirements

Future user-web runtime must use API responses directly and must not construct
storage URLs, filesystem paths, object keys, provider paths, signed URLs, or
direct storage URLs.

Execution responses should provide browser-safe headers:

- `Content-Type` matching CSV or JSON.
- `Content-Disposition` with a safe filename that includes scope, format, and
  date/time but no private names, storage keys, filesystem paths, or raw search
  text.
- No provider-specific storage headers that expose internals.
- Clear failure responses before bytes stream where possible.

User-web should create a browser object URL only from the authorized response
blob it just received, revoke it promptly after triggering download, and avoid
persisting file bytes in local storage, IndexedDB, logs, analytics, or route
state. JSON export should either use the server response body to create a local
download file or rely on a future server JSON download endpoint, but it must
not alter exported data client-side except for browser download mechanics.

## Future User-Web Runtime Acceptance Criteria

A future user-web export runtime slice is acceptable only when:

- It calls readiness first and only enables explicit `Export CSV` or
  `Export JSON` actions for server-approved actor/scope/filter/format states.
- It displays personal versus group scope and normalized filters before
  download.
- It handles unavailable, forbidden, auth-required, no-rows, too-large,
  async-required, and server-error states with safe messages from the contract.
- It refreshes readiness after session/scope/filter changes and before stale
  execution.
- It starts only CSV/JSON export execution methods approved by the contract.
- It does not call import, sync submission, backup, restore, local-mode
  persistence, file content, receipt/proof/QR, or storage-provider operations.
- It does not compute export authorization, row eligibility, money/report
  truth, privacy redaction, or audit locally.
- It does not expose storage internals, direct URLs, file paths, object keys,
  or unrelated resource names.
- It provides browser download cleanup and does not persist exported bytes in
  browser storage.
- It includes focused tests for readiness mapping, disabled/unavailable states,
  personal/group scope handling, filter normalization, CSV blob download
  cleanup, JSON download handling, and safe error rendering.

## Non-Goals

This plan does not authorize:

- import/upload runtime;
- import preflight/session/review implementation;
- local backup package creation;
- restore preview or restore confirmation;
- browser-local persistence or local-only user-web authority;
- sync queue visibility beyond safe future readouts;
- `submitSyncOperation` or any sync mutation;
- storage/file-byte reads outside the approved export response;
- receipt/proof/QR/statement content export;
- PDF summary runtime without explicit API support;
- OpenAPI/backend/generated-client/runtime changes in this task.

Import/upload, local backup/restore/local-mode, and sync runtime must stay in
separate gates.

## Recommended Follow-Up Task Sequence

1. OpenAPI/backend export readiness endpoint design and implementation.
   Define personal/group readiness responses, safe problem details, size limits,
   redaction metadata, audit expectations, download headers, and whether
   existing CSV/JSON execution endpoints are approved for browser runtime.
2. Generated-client refresh.
   Regenerate web and Dart clients from OpenAPI through repo tooling, with no
   hand edits.
3. User-web export runtime wiring.
   Add readiness-driven CSV/JSON download controls only; no import, sync,
   backup, restore, local-mode, PDF, or storage-provider work.
4. Separate import preflight/review contract planning.
   Define CSV upload validation, import sessions, candidate review, safe row
   problems, acceptance/discard, idempotency, conflict behavior, and audit.
5. Separate local backup/restore/local-mode design.
   Define browser-local authority, encryption, retention, package manifest,
   restore preview, explicit confirmation, conflict handling, storage/privacy,
   and no-silent-server-migration rules before runtime.

## Acceptance Checklist

- Current post-PR #593 user-web state is described accurately.
- Existing generated-client export/import/sync methods are inspected without
  changing generated clients.
- The plan explains why generated method presence is not enough for runtime
  export UX/safety.
- The recommended readiness contract preserves OpenAPI as source of truth and
  API/domain authority for authorization, privacy, money/report truth, storage
  boundaries, and audit.
- Personal/group scope, CSV/JSON now, PDF later, auth/session, redaction,
  filters, size limits, audit, errors, browser download behavior, and future
  user-web runtime acceptance criteria are covered.
- Import/upload/local-backup/sync/local-mode runtime remains explicitly out of
  scope and split into separate gates.
