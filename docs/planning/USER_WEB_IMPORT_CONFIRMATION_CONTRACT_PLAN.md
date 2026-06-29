# User Web Import Confirmation Contract Plan

## Status

Planning/control gate for issue #461 after the user-web CSV import
preflight/review runtime slice. This document defines the next safe contract
boundary before user web may call data-changing CSV import confirmation
behavior.

PR #600 intentionally left user-web CSV import non-mutating:

- personal and group flows call only `preflightPersonalBillsCsvImport` and
  `preflightGroupBillsCsvImport`;
- group preflight revalidates the selected group with fresh server-returned
  `listGroups` rows before sending the CSV for review;
- user web does not call `importPersonalBillsCsv` or `importGroupBillsCsv`;
- user web does not submit sync operations;
- local backup, restore, and browser local-mode persistence remain unavailable.

This plan does not implement runtime UI, OpenAPI paths, generated clients,
backend/API behavior, schema/migrations, storage/file-byte behavior, sync
mutation, local backup/restore, browser local-mode persistence, Docker,
deployment, CI, environment configuration, mobile/admin UI, or secrets.

Use this file with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](../prd/MVP_DAY1_SCOPE.md)
- [Product requirements draft V5](../prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md)
- [User web export, import, and local-mode implementation plan](USER_WEB_EXPORT_IMPORT_LOCAL_MODE_IMPLEMENTATION_PLAN.md)
- [User web import preflight and review plan](USER_WEB_IMPORT_PREFLIGHT_REVIEW_PLAN.md)
- [User web export readiness contract plan](USER_WEB_EXPORT_READINESS_CONTRACT_PLAN.md)
- [Local, server, import, export, and restore boundaries](../architecture/LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [CSV export and import privacy authority](../architecture/CSV_EXPORT_IMPORT_PRIVACY_AUTHORITY.md)
- [Import validation, conflict, and migration policy](../architecture/IMPORT_VALIDATION_CONFLICT_MIGRATION_POLICY.md)
- [Import/export storage, privacy, and audit validation matrix](../architecture/IMPORT_EXPORT_STORAGE_PRIVACY_AUDIT_VALIDATION_MATRIX.md)
- [Storage file metadata architecture](../architecture/STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](../architecture/STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Server sync acceptance, idempotency, and conflict policy](../architecture/SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Auth runtime and current-user design](../architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md)

## Why Generated Import Methods Are Not Runtime Approval

The generated clients expose direct CSV import mutation methods because the
OpenAPI contract currently includes:

- `POST /api/v1/bills/import.csv` as `importPersonalBillsCsv`;
- `POST /api/v1/groups/{groupId}/bills/import.csv` as
  `importGroupBillsCsv`.

Generated method availability is not a product, authorization, UX, audit, or
privacy approval. Those methods create draft bills when validation succeeds,
emit final import audit, and have no durable idempotency or duplicate
suppression across repeated uploads. A user-web button that calls them directly
after file selection would collapse review, warning acceptance, duplicate
handling, group authorization freshness, and final write into one action.

CSV import is a money/business-state mutation. API/domain services must remain
authoritative for final authorization, group access, money, split validation,
duplicate/conflict policy, bill status, storage/file policy, sync acceptance,
archive/trash behavior, and audit. User web may render server-returned review
state and collect explicit confirmation; it must not decide that a generated
method is safe merely because it exists.

## Recommended Confirmation Boundary

The safe boundary is a staged import flow:

1. User web collects a CSV file after sign-in and sends its text only to a
   non-mutating preflight endpoint.
2. The API parses and validates the CSV, returns safe row/field review
   metadata, and does not write bills, audit final import, store CSV bytes, or
   expose raw CSV values.
3. User web renders server-returned accepted, defaulted, warning, rejected, and
   duplicate/conflict candidate state.
4. User web enables final confirmation only when the contract says the reviewed
   import is confirmable and the user explicitly accepts warning/defaulted/
   duplicate state.
5. Confirmation calls a dedicated backend-authoritative confirmation endpoint
   or an explicitly reviewed replacement for the direct mutation endpoints.
6. The server revalidates current auth, scope, policy, CSV correlation, row
   validation, duplicate/conflict state, money, group membership, and expiry
   immediately before writing.

The confirmation action should create draft/imported records only after a
fresh server-side revalidation pass. User web must never treat preflight
success as final import approval.

## Correlation Model Recommendation

The next contract should prefer a short-lived server-side import session ID
with an attached payload digest and confirmation challenge.

Recommended posture:

- `importSessionId`: server-created, opaque, scoped to actor, personal/group
  scope, optional route group, preflight result, expiry, and review status.
- `payloadDigest`: server-calculated digest over the exact normalized CSV bytes
  or canonical parsed payload used for preflight. It detects changed CSV after
  review and lets the confirmation request prove which payload was accepted.
- `preflightResultVersion`: stable version/correlation for the reviewed server
  validation result, invalidated when the session expires, is discarded, is
  confirmed, or server policy requires re-preflight.
- `confirmationChallenge`: bounded server-provided confirmation metadata such
  as warning/default/duplicate counts and expected confirm label. It is not a
  secret, but prevents a client from confirming a different review surface.

A purely stateless digest/challenge would avoid server session storage, but it
would force the server either to trust client-held review metadata or re-upload
the full CSV at confirmation time. That is weaker for expiry, discard,
idempotency, and privacy controls. A preflight result token alone is also
insufficient unless the server can bind it to actor, scope, group, digest,
expiry, and current policy. The recommended design uses the session as the
authoritative correlation object and includes digest/challenge fields for
changed-payload detection and user-visible confirmation binding.

## API/Domain Authority

The confirmation contract must keep these decisions in API/domain code:

- authentication and session validity;
- actor/profile resolution and role checks;
- personal bill ownership and actor-only profile constraints;
- group existence, deletion state, membership, role, and route-group access;
- payer, participant, split, assignment, item, adjustment, tax, and status
  validation;
- decimal-safe money parsing, currency attachment, and centralized rounding;
- duplicate/conflict candidate detection and confirmation policy;
- accepted, defaulted, rejected, and warning field classification;
- storage/file-byte policy, including no receipt/proof/QR import unless a later
  storage contract approves it;
- final bill creation, draft status, archive/trash behavior, and revision or
  settlement side effects;
- final audit events and suspicious/denied preflight or confirmation audit
  where policy requires it;
- sync/offline acceptance and conflict state in server mode.

User web may hold temporary display state only. It must not infer permission
from route state, cached group labels, local search results, hidden UI, or
generated-client method presence.

## Personal And Group Confirmation Differences

Personal import confirmation should be scoped to the current authenticated
actor's personal bill context. Optional payer or split profile IDs in the CSV
must either default to the actor or match server-approved actor identity. The
confirmation response should not expose unrelated profile IDs or hidden users.

Group import confirmation must be route-group scoped. The user-web runtime must
use only fresh server-returned group rows for the group selection before
preflight and again before confirmation. The server must still treat the route
`groupId` and current membership as authoritative. Referenced payer and split
profiles must be active route-group members or otherwise allowed by explicit
future group policy. A missing, deleted, inactive, unauthorized, or changed
group/member must fail closed without leaking hidden group/member data.

## Future OpenAPI Concepts

Names below are planning names, not approved endpoint names.

Recommended endpoint categories:

```text
POST /api/v1/bills/imports/preflight
POST /api/v1/groups/{groupId}/bills/imports/preflight
GET  /api/v1/bill-imports/{importSessionId}
POST /api/v1/bill-imports/{importSessionId}/confirm
POST /api/v1/bill-imports/{importSessionId}/discard
```

Recommended confirmation request concepts:

- `importSessionId`;
- `scope` as `personal` or `group`;
- nullable `groupId`;
- `payloadDigest`;
- `preflightResultVersion` or `preflightToken`;
- `acceptedWarningCodes`;
- `acceptedDefaultedFields`;
- `acceptedDuplicateCandidateIds` or explicit duplicate policy selection;
- `confirmationChallengeId`;
- optional idempotency key if repeated confirm behavior is approved.

Recommended response concepts:

- final `status` such as `confirmed`, `partially_confirmed`, `rejected`,
  `expired`, `discarded`, or `failed`;
- created/draft bill summaries with IDs, group ID, date, status, totals,
  currency, item count, participant count, payer count, and audit correlation;
- accepted, defaulted, rejected, and warning field summaries;
- duplicate/conflict decisions and remaining blocked candidates;
- partial failure policy result;
- stable problem codes and safe messages;
- confirmation copy/warning text that user web can render without inventing
  labels.

Confirmation-time revalidation must re-check actor/session, scope, route
group, group membership, row validation, money/currency/rounding, split/payer
assignment, policy limits, duplicate/conflict candidates, archive/trash
eligibility, sync/server-mode acceptance, session expiry, and payload digest
match.

## Partial Failure Policy

The current direct import behavior is all-or-nothing: if row errors exist, no
bills are created. The confirmation contract should keep all-or-nothing as the
default because it is easier to audit, retry, and explain.

If a future product decision allows partial confirmation, it must be explicit
in the contract:

- which rows are confirmed and which are rejected;
- how duplicate/conflict candidates are accepted or skipped;
- whether skipped rows remain in the session;
- whether a second confirmation is allowed;
- how audit identifies the final write set without raw CSV;
- how user web shows that the import is incomplete.

Silent partial import is not acceptable.

## Stable Problem Codes

Future confirmation endpoints should use safe problem details with stable
codes. Recommended codes include:

- `auth_required`;
- `session_expired`;
- `forbidden`;
- `group_unavailable`;
- `import_session_not_found`;
- `import_session_expired`;
- `import_session_discarded`;
- `import_session_already_confirmed`;
- `payload_digest_mismatch`;
- `preflight_result_stale`;
- `confirmation_challenge_mismatch`;
- `unsupported_content_type`;
- `file_too_large`;
- `too_many_rows`;
- `csv_malformed`;
- `header_missing`;
- `field_invalid`;
- `currency_invalid`;
- `money_invalid`;
- `participant_unavailable`;
- `duplicate_candidate_unresolved`;
- `conflict_candidate_unresolved`;
- `confirmation_revalidation_failed`;
- `policy_disabled`;
- `server_unavailable`.

Problem details must not echo raw CSV, raw cell values, hidden user/group
details, payment details, storage paths, provider internals, signed URLs,
tokens, secrets, or exception dumps.

## Confirmation Copy

Confirmation copy must be explicit and scope-specific. Safe labels include:

- `Confirm personal bill import`;
- `Confirm group bill import`;
- `Discard import`;
- `Review duplicate candidates`;
- `Return to import review`.

Avoid vague labels such as `Continue`, `OK`, `Proceed`, `Apply`, or `Upload`
for the data-changing step. The warning text should identify:

- personal versus group scope;
- group display label only when the actor is authorized to see it;
- row count, accepted count, rejected count, warning/defaulted count, and
  duplicate/conflict candidate count;
- that confirmation creates draft/imported bill records;
- that raw CSV is not retained longer than the contract allows;
- that server-side validation may still reject the confirmation if state
  changed since review.

## Audit Expectations

Audit should distinguish preflight review from final import:

- Preflight audit preview: safe user-facing description returned in the
  preflight response. It is not final import audit and should not imply bills
  were created.
- Optional denied/suspicious preflight audit: bounded metadata for abuse,
  policy, or repeated denied attempts where server policy requires it.
- Final import audit: emitted only when confirmation writes records.
- Discard/expiry audit: optional bounded session lifecycle audit where policy
  requires abandoned import session tracking.

Audit records should include actor, subject, scope, route group when
authorized, imported bill IDs/counts, result category, timestamp,
correlation/request ID, import session ID, preflight result version, and safe
policy/validation summaries.

Audit must avoid raw CSV, raw row values, merchant/item/note text unless a
future audit policy explicitly approves a safe summary, payment details,
receipt/proof/QR bytes, OCR text, storage object keys, filesystem paths,
provider internals, vault internals, request bodies, secrets, tokens, and
unnecessary PII.

## Failure And Expiry Behavior

Confirmation must fail closed for:

- stale or expired preflight sessions;
- changed CSV or changed canonical parsed payload after review;
- changed authorization, session, profile, group, role, or membership;
- unsupported rows or headers;
- too many rows or oversized CSV/session payloads;
- unresolved duplicate or conflict candidates;
- server validation drift between preflight and confirmation;
- policy disabled, import disabled, or server-mode sync acceptance blocked;
- group archive/delete/member removal between review and confirmation.

Expired or discarded sessions must not be confirmable. A changed CSV must
require a new preflight. A changed group selection must require a new group
preflight. Confirmation after server validation drift should return safe
problem details and require the user to review fresh server output.

## User-Web Runtime Implications

Until the confirmation contract exists, user web must keep final import
confirmation disabled and must not call:

- `importPersonalBillsCsv`;
- `importGroupBillsCsv`;
- `listSyncChanges`;
- `submitSyncOperation`;
- `getSyncOperation`.

Future user-web confirmation wiring must:

- require sign-in before file selection, preflight, session read, confirmation,
  or discard;
- keep raw CSV only in short-lived component state long enough to preflight or
  confirm according to the reviewed contract;
- avoid local storage, IndexedDB, route state, analytics, console logs, and
  rendered raw CSV;
- render server-returned row/field metadata without recomputing money,
  duplicate, authorization, or group truth;
- revalidate selected group from latest server-returned rows before group
  confirmation;
- refresh or read the import session immediately before confirmation;
- never invent fake sessions, fake CSV data, fake groups, fake import history,
  fake local backups, or fake imported bill results.

## Future Task Sequence

Keep follow-up work split and reviewable:

1. Confirmation OpenAPI/backend contract implementation: add the reviewed
   session/digest/challenge confirmation contract and backend behavior without
   user-web wiring.
2. Generated-client refresh: run the repo generation workflow from the
   OpenAPI contract and review web/Dart generated diffs.
3. User-web confirmation runtime wiring: enable explicit confirmation only
   through the new contract, with fresh group validation and no direct import
   shortcut.
4. Duplicate/conflict candidate domain enhancement: improve server-side
   duplicate/conflict detection and user-review policy without moving truth to
   clients.
5. Sync/local backup/local-mode follow-up gates: design and implement sync
   status, local backup/restore, and browser local-mode persistence only
   through separate reviewed authority-boundary tasks.

## Explicit Non-Goals

This plan does not authorize:

- runtime app code changes;
- OpenAPI contract changes;
- generated-client changes;
- backend/API behavior changes;
- database schema or migrations;
- auth/session/security runtime changes;
- storage/file-byte behavior;
- direct import confirmation UI;
- direct calls to `importPersonalBillsCsv` or `importGroupBillsCsv`;
- sync reads or mutation wiring;
- local backup/restore;
- browser local-mode persistence;
- storage/file-byte import behavior;
- fake sessions, fake CSV data, fake groups, or fake import results;
- Docker, deployment, CI, environment, or secret changes;
- mobile app changes;
- admin web changes;
- Day 1 scope reduction.

## Acceptance Checklist

- The plan states why generated direct import methods are not runtime approval.
- The confirmation boundary after preflight/review is explicit.
- A stateful import session ID with payload digest/challenge is recommended.
- API/domain authority remains intact for auth, group access, money, split
  validation, duplicate/conflict policy, storage, audit, sync, and lifecycle
  behavior.
- Personal and group confirmation differences are documented.
- Future OpenAPI request/response concepts and server-side revalidation
  requirements are listed.
- Audit preview and final import audit expectations are separated.
- Failure, expiry, changed CSV, changed authorization, and validation drift
  behavior is fail-closed.
- User-web runtime remains non-mutating until the future contract exists.
- Follow-up task sequence is explicit and separates confirmation, generated
  clients, user-web wiring, duplicate/conflict enhancement, and sync/local
  gates.
