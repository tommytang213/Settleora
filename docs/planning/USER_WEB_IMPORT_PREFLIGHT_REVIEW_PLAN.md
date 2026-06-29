# User Web Import Preflight And Review Plan

## Status

Planning/control gate for issue #461 after the user-web group export runtime
slice. Export runtime now follows readiness-before-download. CSV import is data
ingress and can create or change financial records, so user-web import runtime
must not call direct import operation methods until a reviewed preflight,
review, and confirmation contract exists.

Implementation update on 2026-06-29: the first additive contract/API slice
added non-mutating CSV import preflight endpoints for personal and group bill
imports:

- `POST /api/v1/bills/import-preflight.csv`
  (`preflightPersonalBillsCsvImport`)
- `POST /api/v1/groups/{groupId}/bills/import-preflight.csv`
  (`preflightGroupBillsCsvImport`)

Both endpoints use the same bounded `text/csv` body shape as the existing
direct import endpoints, reuse the server-side CSV parser/validation/calculation
planning path, and return `BillCsvImportPreflightResponse` review metadata
only. They do not create bills, edit bills, write import audit rows, store CSV
bytes, create storage objects, expose raw CSV cell values, or wire any user-web
runtime upload buttons.

This document still does not authorize runtime UI upload/import buttons,
import confirmation that creates records, schema/migrations, auth/session/
security behavior changes, storage/file-byte persistence, sync mutation, local
backup/restore, browser local-mode persistence, Docker, deployment, CI,
environment configuration, mobile/admin UI, or secrets.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [User web export, import, and local-mode implementation plan](USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md)
- [User web export readiness contract plan](USER_WEB_EXPORT_READINESS_CONTRACT_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [CSV export and import privacy authority](../architecture/CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Import validation, conflict, and migration policy](../architecture/IMPORT_VALIDATION_CONFLICT_MIGRATION_POLICY.md)
- [Import/export storage, privacy, and audit validation matrix](../architecture/IMPORT_EXPORT_STORAGE_PRIVACY_AUDIT_VALIDATION_MATRIX.md)
- [Storage file metadata architecture](../architecture/STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](../architecture/STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Auth runtime and current-user design](../architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md)

## Current State

The current OpenAPI/generated-client surface includes direct authenticated CSV
import operation methods:

| Scope | Existing method | Current posture for user web |
| --- | --- | --- |
| Personal bills | `preflightPersonalBillsCsvImport` | Non-mutating review method exists at `POST /api/v1/bills/import-preflight.csv`. It is available for future user-web review UI wiring after a separate runtime UX/storage/privacy gate; it does not confirm or create bills. |
| Personal bills | `importPersonalBillsCsv` | Mutation method exists at `POST /api/v1/bills/import.csv`. It is not an approved user-web upload button because success can create draft bills. |
| Group bills | `preflightGroupBillsCsvImport` | Non-mutating review method exists at `POST /api/v1/groups/{groupId}/bills/import-preflight.csv`. It uses route-group authorization and does not confirm or create bills. |
| Group bills | `importGroupBillsCsv` | Mutation method exists at `POST /api/v1/groups/{groupId}/bills/import.csv`. It is not an approved user-web group upload button because success can create group-scoped draft bills. |

The existing contract describes bounded CSV import, server-side bill
calculation, safe row errors, and all-or-nothing behavior. Tests cover that
successful imports create draft bills and emit bounded audit, while rejected
imports avoid partial writes. That is safer than blind partial import, but it
is still a direct mutation endpoint. User web needs a separate non-mutating
preflight and review flow before exposing import controls.

User web currently recognizes import method presence in
`apps/web-user/src/importExportReadout.ts` but does not call import methods.
That posture should remain until the future staged import contract is reviewed
and generated into the web client.

## Why Direct Runtime Import Is Unsafe

CSV import is not the inverse of export. Export sends a scoped copy out of the
system; import accepts user-supplied data that may create financial records,
attach participants, alter group/shared accounting state, and later affect
settlements, reports, notifications, sync state, and audit.

A direct user-web upload button would be unsafe because it would compress too
many decisions into one action:

- whether the actor is authorized for the personal or group scope;
- whether the selected group is real, visible, and active for that actor;
- whether money, currency, split, payer, participant, status, and date fields
  are valid;
- whether defaults were applied and should be accepted by the user;
- whether rows look like duplicates or conflict with existing bills;
- whether warnings are acceptable or should block confirmation;
- whether the final operation should create draft bills, proposed revisions, or
  some other reviewed state in a future contract.

Preflight/review must be non-mutating. Confirmation must be the data-changing
step. API/domain validation remains authoritative at both preflight and
confirmation time.

## Scope

### Personal CSV Import

Personal import should cover only records owned by or visible to the current
authenticated actor in the personal-bill context. The server must derive the
actor, profile, owner, creator, payer eligibility, participant eligibility, and
policy from server state.

User web must not allow personal import to submit arbitrary profile IDs as
financial truth. Optional personal payer or split identity should either default
to the current actor or be accepted only when the server contract explicitly
allows and validates it.

### Group CSV Import

Group import must be explicitly scoped to one server-returned group. The future
user-web selector must use only groups returned by server read methods for the
current actor. It must not accept a typed group ID, cached label, route guess,
or exported CSV group name as authorization truth.

Imported rows affecting group/shared records require server-side group
authorization and audit. The route `groupId` must be authoritative for group
scope. Referenced participant and payer identities must be active members or
otherwise allowed by explicit group policy. A forbidden, inactive, missing, or
unrelated group/member must fail closed with safe problem details.

## Server Authority And Validation Boundaries

The web client may present file selection, upload progress, local display
formatting, and server-returned review state. It must not compute final money
truth, split truth, authorization truth, duplicate truth, sync truth, storage
truth, audit truth, or import acceptance truth.

The server/API/domain layer remains authoritative for:

- actor/session/profile resolution;
- personal versus group authorization;
- group membership and role checks;
- bill ownership and participant eligibility;
- decimal-safe money parsing and calculation;
- currency validation and rounding policy;
- split, payer, item, adjustment, and tax validation;
- duplicate and conflict candidate detection;
- confirmation-time revalidation;
- storage/file-byte policy;
- audit preview and final audit emission;
- sync and downstream mutation acceptance.

Preflight results are advisory review state, not final import. Confirmation
must revalidate the import session against current server state before writing.

## File Handling And Privacy

Future CSV upload handling should be bounded and privacy-preserving:

- Accept only reviewed CSV content types and bounded UTF-8 text size limits.
- Store an import session only as long as needed for review and confirmation.
- Keep `sourceFileName` display-safe only; strip paths and unsafe characters.
- Return `sourceContentType` and `sourceSizeBytes` only as safe metadata.
- Do not expose file bytes through storage URLs, filesystem paths, object keys,
  signed URLs, provider internals, temp paths, vault internals, or debug links.
- Do not return raw CSV contents or raw cell values in API responses.
- Do not include receipt/proof/QR/payment file bytes in CSV import scope unless
  a separate storage/file privacy contract explicitly designs that behavior.

## Logging And Audit Privacy

Operational logs, problem details, audit metadata, and client telemetry must
not contain raw CSV contents, sensitive notes, private notes, payment details,
receipt/proof/QR data, raw OCR text, tokens, credentials, secrets, filesystem
paths, storage object keys, signed URLs, provider internals, request bodies, or
raw exception dumps.

Safe logging can include bounded metadata such as actor ID, import session ID,
scope, group ID when authorized, row counts, status, stable problem codes,
safe high-level field names, byte counts, content type, confirmation outcome,
and correlation/request IDs.

Audit expectations should distinguish:

- preflight audit preview, returned to the user before confirmation;
- optional bounded audit for denied or suspicious preflight attempts;
- final audit event emitted only when confirmation writes data;
- discard/expiry audit where policy requires tracking abandoned import
  sessions without storing raw file contents.

## Money, Currency, And Defaults

Money values must be parsed and represented with decimal-safe types and
explicit currencies. The server must reject ambiguous, missing, unsupported, or
mixed-currency rows unless the future contract explicitly supports a reviewed
manual FX snapshot or multi-currency policy.

The preflight response should separate:

- accepted money fields;
- rejected money fields;
- warnings for precision, rounding, formatting, sign, zero, negative, or
  currency mismatch issues;
- server defaults such as missing payer, missing split method, archive state,
  bill status, date interpretation, or draft status.

Defaulted fields must be visible during review. User web must not silently hide
server-applied defaults behind a generic "ready" state.

## Review Readouts

Future import preflight should return row-level review states that user web can
render without recomputing validation:

| State | Meaning |
| --- | --- |
| `accepted` | Row is eligible for confirmation if the session remains valid. |
| `warning` | Row can be confirmed only after the user reviews warning/defaulted fields according to policy. |
| `rejected` | Row cannot be confirmed until the CSV or submitted fields are corrected. |
| `duplicate_candidate` | Row resembles an existing record and needs explicit review before confirmation policy allows it. |
| `defaulted` | Row or field used a server default that must be shown to the user. |

The response should include accepted, warning, rejected, and duplicate counts,
plus field-level readouts:

- `acceptedFields`;
- `defaultedFields`;
- `rejectedFields`;
- `currencyWarnings`;
- `moneyWarnings`;
- `participantWarnings`;
- `duplicateCandidates`.

Rejected/warning/defaulted/accepted readouts must use stable field names and
safe messages. They must not echo raw cell values, hidden user identities, raw
notes, payment details, or unrelated group/member existence.

Duplicate detection is advisory unless the future contract defines a hard
block. Duplicate candidates should explain safe matching reasons such as date,
amount, currency, merchant category, item count, or participant pattern without
revealing hidden records. The server remains authoritative for duplicate truth.

## Import Session Lifecycle

Future preflight should create or return an `importSessionId` that points to a
bounded server-side review session. The session should include:

- `scope`;
- nullable `groupId`;
- `status`;
- `expiresAtUtc`;
- display-safe `sourceFileName`;
- `sourceContentType`;
- `sourceSizeBytes`;
- `rowCount`;
- `acceptedRows`;
- `warningRows`;
- `rejectedRows`;
- `duplicateCandidateRows`;
- `auditPreview`;
- `confirmation`.

Suggested session statuses:

- `preflighted`;
- `needs_review`;
- `ready_for_confirmation`;
- `confirmed`;
- `discarded`;
- `expired`;
- `failed`.

Sessions should expire automatically. Confirmation after expiry must fail
closed and require a new preflight. Discard should make the session unusable.
Confirmation should be idempotent only if the future contract explicitly
defines idempotency keys and repeated-confirm behavior; otherwise repeated
confirmation must fail closed.

## Confirmation Boundaries

User-facing confirmation must be explicit and scope-specific. It should identify
that confirmation will create or change draft/imported bill records, name the
scope, show row counts, call out rejected rows that will not be imported, and
identify warning/defaulted/duplicate counts.

Safe confirmation labels:

- `Confirm personal bill import`
- `Confirm group bill import`
- `Discard import`
- `Review duplicate candidates`

Avoid vague labels such as `Continue`, `OK`, `Proceed`, `Apply`, or `Upload`
for the data-changing step.

Confirmation must revalidate authorization, group membership, row validity,
money/currency, duplicate policy, session status, expiry, and policy limits
before writing. Imports must not silently mutate records without explicit
confirmation.

## Problem Details And Stable Codes

Future import endpoints should use `application/problem+json` for request,
authorization, session, policy, validation, expiry, conflict, size, and server
errors. Responses should include stable problem codes suitable for UI mapping,
plus safe user messages.

Recommended code categories:

- `auth_required`;
- `forbidden`;
- `group_unavailable`;
- `unsupported_content_type`;
- `file_too_large`;
- `csv_malformed`;
- `header_missing`;
- `field_invalid`;
- `currency_invalid`;
- `money_invalid`;
- `participant_unavailable`;
- `duplicate_candidate`;
- `import_session_expired`;
- `import_session_not_confirmable`;
- `confirmation_revalidation_failed`;
- `policy_disabled`;
- `server_unavailable`.

Problem details must not disclose unrelated groups, hidden users, raw cell
values, raw CSV, storage paths, provider internals, tokens, or secrets.

## Future Contract Recommendation

Names below are planning names, not approved endpoint names. If a later backend
task finds a better convention in the repo, use that convention while
preserving the same staged semantics.

Recommended endpoint categories:

```text
POST /api/v1/bills/imports/preflight
POST /api/v1/groups/{groupId}/bills/imports/preflight
GET  /api/v1/bill-imports/{importSessionId}
POST /api/v1/bill-imports/{importSessionId}/confirm
POST /api/v1/bill-imports/{importSessionId}/discard
```

Recommended response concepts:

```text
importSessionId
scope
groupId nullable
status
expiresAtUtc
sourceFileName display-safe only
sourceContentType
sourceSizeBytes
rowCount
acceptedRows
warningRows
rejectedRows
duplicateCandidateRows
acceptedFields
defaultedFields
rejectedFields
currencyWarnings
moneyWarnings
participantWarnings
duplicateCandidates
auditPreview
confirmation
problemCode
safeMessage
```

OpenAPI must remain the source of truth. After future contract approval, run
the repo client generation workflow and review generated web and Dart diffs.
Generated clients must not be hand-edited.

## Future User-Web Runtime Recommendation

After the staged contract exists, user web should:

- require sign-in before file selection, preflight, session read, confirmation,
  or discard;
- load group import choices only from server-returned groups;
- upload CSV only to a preflight endpoint;
- render server-returned row and field readouts;
- block confirmation while rows are rejected or the session is expired;
- make warnings, defaults, and duplicate candidates visible before
  confirmation;
- refresh session state before confirmation;
- call confirm only for an explicit user action;
- show final server-returned results and audit-safe summary;
- never call `importPersonalBillsCsv` or `importGroupBillsCsv` as a shortcut
  from the import/review UI unless a later reviewed contract explicitly
  replaces or wraps those methods with the same staged semantics.

The web client must not call or wire sync operations as part of import review:
`listSyncChanges`, `submitSyncOperation`, and `getSyncOperation` remain outside
this flow.

## Explicit Non-Goals

This plan does not authorize:

- runtime app code changes;
- OpenAPI contract changes;
- generated-client changes;
- backend/API behavior changes;
- database schema or migrations;
- auth/session/security runtime changes;
- storage/file-byte behavior;
- actual file upload/import execution;
- CSV parsing implementation;
- import confirmation runtime;
- sync mutation;
- local backup/restore;
- browser local-mode persistence;
- Docker, deployment, CI, environment, or secret changes;
- mobile app changes;
- admin web changes.

It also does not authorize user web to compute final money truth, split truth,
authorization truth, duplicate truth, sync truth, storage truth, report truth,
or audit truth.

## Acceptance Checklist

- The plan makes clear that preflight/review is not final import.
- Confirmation is the data-changing step.
- API/domain validation remains authoritative.
- Personal and group authorization boundaries are separate.
- File bytes and storage internals remain private.
- Logging and audit avoid raw CSV and sensitive content.
- Money and currency validation stay decimal-safe and server-owned.
- Row-level review, warning, default, rejection, duplicate, and confirmation
  concepts are explicit.
- Future OpenAPI/generated-client work is identified as a separate manual gate.
- User-web group import selection is limited to server-returned groups.
- Existing direct import methods are not approved as user-web runtime shortcuts.
