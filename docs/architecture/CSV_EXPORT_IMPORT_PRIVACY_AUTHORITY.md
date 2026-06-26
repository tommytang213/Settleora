# CSV Export And Import Privacy Authority

## Purpose

This document is the docs/control architecture packet for #453, under parent
#406. It defines Day 1 CSV export/import scope, privacy filters, authority
boundaries, stable format planning, money/currency validation, import review
behavior, audit expectations, OpenAPI/generated-client boundaries, and future
validation gates.

This is not a runtime CSV export or import implementation, OpenAPI contract
change, generated-client refresh, database schema or migration, storage
provider change, file-byte handling change, auth/session/security runtime
change, money/settlement/payment/bill calculation change, mobile/web/admin UI,
Figma/reference artifact, Docker/CI/deployment change, backup/restore package
design, statement upload/matching design, provider integration, or issue
closure.

## Related Documents

- [Local, server, import, export, and restore boundaries](LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md)
- [Offline queue persistence and sync state model](OFFLINE_QUEUE_SYNC_STATE_MODEL.md)
- [Server sync acceptance, idempotency, and conflict policy](SERVER_SYNC_ACCEPTANCE_IDEMPOTENCY_CONFLICT_POLICY.md)
- [Sync audit and validation matrix](SYNC_AUDIT_VALIDATION_MATRIX.md)
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md)
- [Storage file metadata architecture](STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Storage file policy architecture](STORAGE_FILE_POLICY_ARCHITECTURE.md)
- [Privacy vault architecture](PRIVACY_VAULT_ARCHITECTURE.md)

## CSV Export Goals

Day 1 CSV export is a user/action-initiated data portability and reporting
flow. It is scoped by authorization, selected filters, privacy policy, and
format version.

Export must:

- require an explicit user action and, in server mode, an authenticated actor
  whose authorization is checked by the API/domain layer;
- export only records and fields the actor may see for the selected scope;
- apply privacy-aware redaction or omission before CSV bytes are produced;
- include a stable export format name/version and enough provenance to explain
  source authority boundary, filters, and row counts;
- represent every exported money value as a decimal-safe string plus explicit
  currency;
- be auditable without logging exported plaintext contents;
- clearly indicate when selected filters or privacy policy omitted data.

Export must not:

- silently decrypt vault-protected or private data to plaintext;
- expose storage paths, storage object keys, signed URLs, provider internals,
  local device paths, raw OCR text, file bytes, secrets, credentials, recovery
  codes, tokens, passwords, reusable auth challenges, or unrelated sensitive
  content;
- imply a complete backup unless the future operation is a backup package with
  its own manifest, encryption, privacy, and restore controls;
- mutate bills, settlements, payments, participants, files, audit records
  beyond bounded export audit, sync state, or server truth;
- create a hidden live link between an exported copy and the source workspace.

## CSV Import Goals

Day 1 CSV import is a guarded intake flow for candidate records. Import is not
ordinary sync and is not a shortcut around domain validation.

Import must:

- stage CSV rows as drafts, review records, or import candidates until
  validation and explicit user acceptance complete;
- preserve source manifest/version, import session identity, payload hash, row
  provenance, and safe problem details for review and retry;
- run API/domain validation before any server-mode candidate becomes server
  truth;
- preserve original money text where safe for review while validating parsed
  decimal strings, currency, scale, and totals centrally;
- keep rejected and conflicted candidates available until the user explicitly
  discards them or a future retention policy applies.

Import must not:

- directly create confirmed shared financial truth;
- bypass API/domain authority for authorization, money, settlement/payment
  state, storage access, status transitions, sync acceptance, or audit;
- silently import into shared or collaborative state;
- silently merge local-only, self-hosted server, or future cloud authority
  boundaries;
- perform statement upload/matching, provider integrations, federation,
  cross-server sync, or Day 2/Day 3 import expansion;
- use local profile IDs, client-submitted roles, hidden UI state, generated
  client availability, or cached membership as authorization.

## Authority Boundaries

CSV behavior inherits the authority model from
[Local, server, import, export, and restore boundaries](LOCAL_SERVER_IMPORT_EXPORT_BOUNDARIES.md).

- Local-only profile export/import is local-authoritative only. Local CSV
  operations may create or update local-only drafts according to local product
  policy, but they do not create server accounts, server groups, shared bills,
  settlement records, or server audit truth.
- Server-mode export/import is API/domain-authoritative. The server derives
  actor, profile, role, group membership, visibility, policy, money truth,
  settlement/payment state, storage access, and audit context from the
  authenticated session and server state.
- Moving data between local-only and server-mode boundaries requires explicit
  user intent, server validation where server truth is affected, and safe audit
  where the server participates.
- Import into shared/collaborative state requires explicit user acceptance and
  server authorization. A CSV row cannot silently add participants, groups,
  payer authority, settlement effects, file links, or private references.
- Clients may parse, preview, preserve candidates, and render validation
  results. They must not decide final authorization, financial truth,
  settlement/payment state, storage access, audit truth, or conflict outcome.

## Stable CSV Shape Planning

Future CSV contract work should define stable conceptual sections or tables
without hand-editing generated clients. A single CSV export may be one file per
section in a package, or one flat bill-oriented CSV where a future contract
explicitly scopes the narrower shape. Conceptual sections may include:

| Section | Allowed planning fields | Notes |
|---|---|---|
| Import/export manifest | format name/version, source boundary category, source app/server version, generated timestamp, actor/export scope category, filter summary, privacy mode, section list, row counts, payload or section hashes | Must not contain secrets, tokens, storage internals, or plaintext sensitive values. |
| Bills | row key, source record reference where safe, bill date, merchant/category where visible, status category, personal/shared mode, group reference where authorized, total amount string, currency, tax/fee/discount/refund summary fields where supported, archive flag | Money values require currency and decimal-safe strings. Status is informational on export and not import authority. |
| Participants | row key, bill row key, participant display label where authorized, participant reference type, share role, temporary-participant marker, acceptance/status category where visible | Must not export unrelated user identifiers or private profile data. |
| Splits | row key, bill row key, participant row key, split method, basis value string, amount string, currency, rounding residue category where relevant | Imported split totals require API/domain validation. |
| Payments and settlement references | row key, bill row key, settlement/payment reference category, amount string, currency, status category, proof metadata reference where included | Import cannot silently alter confirmed settlement/payment state. |
| Categories and recurring references | row key, display label where visible, source reference where safe, recurrence/template reference category | Unknown categories become review problems on import. |
| Attachment metadata references | row key, subject row key, file purpose, safe file label, size/hash where policy allows, file inclusion state, privacy/vault category | Must not include file bytes, local paths, storage object keys, signed URLs, or provider internals. |
| Import problems | row number or row key, section, field, stable problem code, safe message, severity, candidate state | Must not echo raw sensitive cell contents. |

Each row that carries money must include:

- `currency` using a stable currency code;
- amount as a decimal-safe string, not binary floating point;
- scale/precision expectations where future contract work defines them;
- original text only when safe and useful for review.

Each row should include identity/provenance fields sufficient for idempotent
review without exposing internals:

- stable package row key or client row key;
- source section and source row number where safe;
- source record reference category and stable external reference where the
  actor is authorized to see it;
- candidate payload hash or section hash for duplicate/retry detection;
- import session identity or manifest identity outside ordinary user-facing
  cells where possible.

Denied or omitted field categories:

- secrets, credentials, passwords, tokens, recovery codes, MFA/passkey
  material, raw reset tokens, reusable auth challenges, SSH material, `.env`
  values, and local Codex state;
- raw OCR text by default, private notes by default, vault-protected plaintext,
  payment details outside the audited actor's authorized scope, and unrelated
  personal data;
- file bytes, storage object keys, storage paths, signed URLs, provider
  internals, local device paths, vault internals, and raw file system metadata;
- unbounded request/response bodies, raw exception details, and operational
  diagnostics that expose unrelated resources.

## Privacy Filters And Selected Export Controls

CSV export should support selected filters as future contract/UI work allows:

- date range;
- group or personal scope;
- payer;
- participant;
- category;
- bill status and archive visibility;
- personal/shared mode;
- attachment-metadata inclusion;
- future privacy mode or redaction profile where policy allows.

The exported manifest or header summary must identify:

- selected filters and whether they were user-selected, defaulted, or
  policy-imposed;
- data categories omitted by filters;
- data categories omitted or redacted by privacy policy;
- whether attachment metadata was included;
- that CSV is a filtered export, not a complete backup, unless a future backup
  package operation explicitly says otherwise.

Filter summaries must be safe. They should avoid naming unrelated groups,
users, files, or private resources the actor is not authorized to see.

## Money And Currency Validation

CSV import/export must follow centralized money and rounding rules:

- Use decimal-safe strings for CSV amounts and never rely on binary floating
  point.
- Attach currency to every monetary value.
- Preserve imported currency, scale, and original text where safe for review.
- Validate parsed amounts, currency support, scale, signs, totals, split sums,
  discounts, refunds, fees, taxes, payer contributions, and residual-like
  effects through API/domain services before confirmation.
- Treat mismatches as review/error/conflict states. Do not silently balance,
  round, rewrite, absorb, waive, or redistribute differences.
- Do not silently alter settlement/payment-confirmed states, payer
  confirmation, affected-user state, bill revision state, residuals, or
  settlement balances because of import.
- Do not treat exported status or totals as authority when re-imported.
  Re-import is a new validation decision against current policy and current
  server state.

## Import Review And Conflict Behavior

Import creates candidates with validation outcomes. Future runtime design
should use stable states equivalent to:

```text
candidate
validated
accepted
rejected
conflict
discarded
```

Reviewable problem categories should include:

- existing data conflicts;
- duplicate rows or duplicate accepted replay;
- stale resource references, stale version basis, or changed calculation basis;
- unauthorized participants, payers, groups, bills, or files;
- invalid or unsupported currency;
- invalid decimal, scale, sign, or total/split mismatch;
- missing required fields or unknown required section version;
- unknown category, recurring reference, or status category;
- private, vault-protected, or redacted references that cannot be imported as
  plaintext;
- file-reference problems, missing attachment metadata, invalid file purpose,
  or storage policy block;
- incompatible source authority boundary or privacy mode;
- malformed CSV, unsupported encoding, oversized files, or unsafe formula-like
  cells where future CSV safety policy defines escaping/rejection.

Idempotency and session expectations:

- An import session identity should be scoped by destination authority boundary,
  authenticated actor/profile where server state is affected, source manifest
  identity, candidate set/version, and payload hash where practical.
- Replaying the same import session and payload hash should not duplicate
  accepted records.
- Reusing an import session identity with a different payload hash, actor,
  destination boundary, or incompatible candidate set must become a conflict or
  rejection.
- Accepted candidates receive authoritative server IDs/versions only after
  API/domain commit. Rejected and conflicted candidates remain preserved until
  explicit discard.

## Audit And Logging

Export audit should record bounded metadata:

- actor/account/profile and authorization context;
- source authority boundary and export scope;
- safe filter summary and privacy/redaction mode;
- export format/version;
- row counts by safe section/category;
- attachment-metadata inclusion state;
- timestamp, correlation ID, and outcome category.

Export audit must not log exported plaintext contents, raw CSV bodies, raw OCR
text, file bytes, storage paths, object keys, signed URLs, provider internals,
tokens, credentials, recovery codes, passwords, private notes, or unrelated
sensitive fields.

Import audit should record bounded metadata:

- actor/account/profile and authorization context where the server
  participates;
- source manifest/version and destination authority boundary;
- import session/correlation identity or safe fingerprint;
- row counts by safe section/category;
- accepted, rejected, conflict, failed, and discarded counts;
- validation summary using stable problem categories;
- explicit acceptance and discard events;
- timestamp and outcome category.

Import audit must not log raw CSV contents, sensitive cell values, raw request
bodies, file bytes, raw OCR text, storage internals, secrets, tokens,
passwords, recovery codes, vault internals, or unrelated user data. Denials
must avoid existence leaks for users, groups, bills, files, settlements, and
private records outside the actor's authorization scope.

## OpenAPI And Generated-Client Boundary

The current OpenAPI file already contains bounded personal/group bill CSV
import/export operations. This packet does not change those contracts and does
not decide the final shape for broader import/export package formats.

Future contract work must:

- keep `packages/contracts/openapi/settleora.v1.yaml` as the source of truth;
- define canonical media types, format versions, filters, result/problem
  shapes, idempotency expectations, and redaction behavior before runtime use;
- preserve API/domain authority for authorization, money, storage access,
  status transitions, sync acceptance, and audit;
- avoid making generated-client method availability equivalent to permission;
- run `npm run generate:clients` only after reviewed OpenAPI changes;
- keep generated web/Dart clients generated-only and never hand-edited.

Do not edit `settleora.v1.yaml`, generated clients, or generation tooling for
this #453 docs/control slice. If a future branch unexpectedly changes any of
those files, stop and perform the OpenAPI/generated-client manual gate instead
of continuing as a docs-only task.

## Future Validation Plan

This docs/control slice requires documentation validation now. Future runtime
branches must run validation matching the changed surface:

- OpenAPI/generated-client changes: contract review, `npm run
  validate:openapi`, `npm run generate:clients`, generated diff review, and
  `npm run validate:clients`.
- API/domain CSV runtime: API-local tests for authentication, authorization,
  filter scope, import staging, explicit acceptance, idempotency, duplicate
  replay, conflict preservation, rejection privacy, and audit redaction.
- Storage/privacy surfaces: tests proving file bytes use the storage
  abstraction, attachment metadata is bounded, vault-protected/private data is
  omitted or redacted, and responses/logs omit storage internals, file bytes,
  raw OCR text, signed URLs, provider internals, and local paths.
- Money surfaces: tests for currency, decimal parsing, scale, centralized
  rounding, split totals, tax/fee/discount/refund validation, calculation
  basis, settlement/payment non-mutation, and no silent balancing.
- Local-only import/export: local persistence tests proving local authority
  does not become server authority, provenance is retained, conflicts are
  preserved, and explicit discard is required.
- Mobile/web/admin UI: UI validation only when UI is explicitly scoped and
  after #456 provides or references the needed UX/Figma direction.

Stop future work if validation or implementation requires:

- secret, token, credential, recovery-code, password, SSH, `.env`, local Codex
  auth, raw OCR, file-byte, storage-internal, signed-URL, provider-internal, or
  unrelated sensitive exposure;
- unauthorized export/import or resource existence leakage;
- silent financial mutation, silent balancing, or import-driven changes to
  settlement/payment-confirmed state;
- silent local/server merge or local profile conversion into a server account;
- hand-edited generated clients or unreviewed OpenAPI changes;
- schema/migration/model snapshot changes without the migration manual gate;
- storage/file-byte behavior changes without the storage/privacy manual gate;
- auth/session/security runtime/config changes without the auth/security
  manual gate;
- Docker/CI/deployment/env/release changes;
- mobile/web/admin UI or Figma/reference scope creep in a non-UI task.

## Non-Goals

This document does not implement runtime CSV export/import, export/import API
endpoints, OpenAPI contract changes, generated-client changes, schema/EF
migrations/model snapshots, statement upload/matching, provider integrations,
Settleora Cloud runtime, federation/cross-server sync, mobile/web/admin UI,
Figma/reference assets, Docker/CI/deployment/env/release behavior,
secrets/auth config/local Codex config changes, parent #406 completion, or
sibling issue closure.
