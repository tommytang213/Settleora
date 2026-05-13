# Receipt OCR Review Apply Policy

## Purpose

This document is the architecture and design gate for a future mutating operation that applies a saved receipt OCR review into bill draft data. It defines authority, safety, mapping, privacy, audit, and bill-state policy only. It does not authorize runtime, OpenAPI, generated-client, schema, worker, mobile, UI, settlement, payment, balance, or file API changes by itself.

## Current State

- Receipt file bytes already go through the API storage abstraction and file metadata lifecycle.
- Receipt and supporting attachments are purpose-specific bill attachment flows, not a generic file API.
- Bill attachment OCR review intake exists for existing active receipt attachments.
- Receipt OCR review queue/list endpoints exist for current-actor visible reviews.
- Receipt OCR review apply-preview exists as a non-mutating read preview.
- Apply-preview builds bounded proposed bill/header and line candidates, `canApply`, `blockedReasons`, and `warnings`.
- Apply-preview does not create or mutate bill items, splits, settlements, balances, payments, files, storage bytes, OCR jobs, worker state, or audit rows.
- Actual OCR review apply/finalization remains unimplemented.

## Authority And Safety Boundaries

- API/domain services own any future mutation from OCR review data to bill data.
- OCR output remains provisional until explicit user action and API validation.
- A future apply action must be user-triggered; OCR completion, queue visibility, generated client availability, or apply-preview success must never automatically finalize bill data.
- Clients, generated clients, OCR workers, and mobile OCR must not directly mutate authoritative bill items, splits, settlement, payments, balances, file metadata, or storage metadata.
- Workers may produce provisional OCR results only through reviewed job/result boundaries; the API must validate and accept those results before they affect bill truth.
- Generated clients are transport helpers only. They must not become policy engines for money, ownership, bill state, splits, settlement, payment, balance, file lifecycle, or audit decisions.
- API responses must remain bounded and must not expose raw OCR full text, receipt bytes, storage object keys, filesystem paths, provider internals, signed URLs, filenames, payment details, auth/session fields, raw audit metadata, or unrelated users.

## Future Apply Operation Policy

The first mutating apply surface should be purpose-specific and route-owned by the existing bill attachment OCR review family, for example:

```text
POST /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/apply
POST /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/apply
```

The exact route and contract require a later OpenAPI/runtime branch. The operation must remain subject-specific; it must not introduce a generic OCR, receipt, or file apply API.

Future apply must:

- Require an authenticated current actor derived server-side.
- Require mutation rights stricter than preview/list/read; bill creator or bill owner/responsible editor should be the default Day 1 rule.
- Load a visible bill, active receipt attachment, active receipt file object, and saved OCR review through server-side authorization.
- Fail closed when the bill, group, membership, attachment, file object, review, status, purpose, visibility, or lifecycle state is missing, deleted, removed, inactive, wrong-purpose, unrelated, or unsafe.
- Verify the saved review is still the version the user previewed or intended to apply. Use optimistic concurrency or explicit review-version/updated-at checks so stale preview data is not applied silently.
- Re-run apply-preview validation server-side at write time. The client must not submit line IDs, money totals, preview totals, split allocations, settlement data, file metadata, actor identity, or review truth as authority.
- Run the mutation inside an API-owned database transaction.
- Mutate only the approved draft bill fields and draft bill item candidate rows for the selected bill scope.
- Avoid writing settlement, payment, balance, proof, storage, file-object, OCR job, or worker state.
- Produce bounded audit events for attempts, success, and failure where useful and safe.

## Bill State And Approval Policy

The conservative Day 1 apply rule is draft-only or draft-like only. Direct apply should be limited to bills that are still safely mutable and have no downstream financial records depending on their current items, totals, participants, payer contributions, splits, settlement candidates, request lines, payments, allocations, residuals, or balance projections.

Applying OCR-derived data to bills with accepted participants, submitted confirmation state, finalized state, settlement requests, settlement payments, payment allocations, residuals, proof records, or policy-recognized balance effects must not silently rewrite financial truth.

If future scope allows applying OCR-derived changes to non-draft shared bills, the apply operation must go through the existing financial-impacting edit or revision proposal path. That path must preserve participant approval/reset policy, payer confirmation policy, settlement safety checks, and audit coverage instead of directly rewriting the active bill.

Apply must not mutate settlement, payment, balance, residual, proof, storage, or file records directly. Any later settlement impact must be handled through reviewed settlement/revision policy.

## Data Mapping Policy

Future apply should map reviewed OCR fields only after validation:

- Reviewed merchant text may become a proposed bill merchant field after length, visibility, and bill-state policy checks.
- Reviewed receipt date may become a proposed bill date after date parsing and product policy checks.
- Reviewed currency and header totals may become proposed bill money fields only when currency is present, supported, and compatible with the bill operation.
- Reviewed line candidates may become draft bill item candidates only after text, quantity, amount, currency, ordering, and line-count validation.
- Decimal strings must be parsed using decimal-safe invariant logic. JSON numbers, locale-formatted strings, currency symbols, exponent notation, `NaN`, and `Infinity` must not become authoritative money.
- Currency must be attached anywhere money exists. The system must not infer authoritative currency from locale, symbol, user default currency, OCR text, or existing UI display.
- Rounding must use the centralized money policy. Endpoint handlers, clients, generated clients, workers, and ad hoc database defaults must not invent separate rounding behavior.
- Header total mismatches, line total mismatches, line-sum mismatches, empty line sets, unsupported currency, missing currency, and currency mismatch must block apply or require an explicit reviewed policy decision before apply is implemented.
- Raw OCR full text must not be copied into audit/logs and should not become authoritative bill data by default.

The saved OCR review is a candidate source, not authoritative bill state. A future apply should store a bounded source marker or resulting revision reference where useful, but the authoritative bill rows must be the API-validated bill representation.

## Apply Modes

Initial safest mode:

- Replace draft OCR-generated bill item candidates only when the bill is in a safe mutable draft state and no downstream financial records depend on those items.
- Keep replacement narrowly scoped to the review-derived candidate set. Existing manually edited bill data must not be overwritten silently.
- Require explicit user confirmation and server-side validation immediately before writing.

Future modes need separate UX and API policy review:

- Append OCR-derived item candidates to existing draft items.
- Merge OCR-derived candidates with manually edited rows.
- Manual line selection or partial apply.
- Apply through a formal bill revision proposal for non-draft shared bills.
- Reconciliation against existing items, statements, or settlement candidates.

Any mode that could overwrite manual edits, affect participants, change payer contributions, change split allocations, or alter settlement eligibility must define conflict behavior and approval policy before implementation.

## Storage And Privacy

- Apply must not read receipt file bytes unless a later design proves a specific need and authorizes that access.
- Apply must not expose file bytes, storage object keys, filesystem paths, provider internals, signed URLs, filenames, raw OCR full text, payment details, auth/session data, raw audit metadata, or unrelated users.
- Possessing a file ID, review ID, bill ID, group ID, generated client method, cached membership row, or hidden UI control is not authorization.
- File metadata and lifecycle remain API/domain-authoritative even if selected bytes or derived text become vault-protected later.
- Privacy or vault protection must not move money, settlement, bill-state, authorization, audit, or validation authority into clients.

## Audit And Observability

Future successful apply should audit bounded safe metadata such as:

- action category and outcome
- actor/auth subject IDs where already safe for the audit system
- bill ID, group ID where applicable, receipt file ID, and OCR review ID
- source/status category, apply mode, line counts, and resulting bill or revision reference
- currency and bounded amount categories where policy permits
- issue or block reason codes
- transaction/correlation identifiers where available

Failed or blocked apply attempts may be audited with bounded reason codes if useful and safe. Audit records must not contain raw OCR text, receipt bytes, storage paths, storage object keys, provider internals, signed URLs, filenames, credentials, tokens, raw request bodies, payment details, unbounded notes, or unrelated user data.

Operational metrics may count attempts, successes, failures, reason-code categories, and validation issue categories. Metrics must stay aggregate or bounded; they must not include receipt contents or sensitive extracted text.

## Non-goals For This Documentation Branch

This branch does not implement:

- Apply endpoint runtime.
- OpenAPI apply mutation paths.
- Generated client changes.
- EF migrations or schema changes.
- OCR engine, OCR worker, or job behavior.
- Flutter, mobile, web, admin, or UI behavior.
- Automatic OCR-to-bill finalization.
- Bill item, split, settlement, payment, residual, proof, balance, storage, or file-object mutation.
- Generic file, receipt, or OCR APIs.
- Statement import or reconciliation.
- Revision proposal runtime changes.
- Notification behavior.

## Next Implementation Candidates

Recommended future branch order:

1. OpenAPI/runtime design for apply mutation after policy review.
2. API implementation for draft-only apply with strong endpoint, authorization, transaction, concurrency, money-validation, audit, and non-mutation tests.
3. UI/mobile review flow after the API contract stabilizes.
4. Later revision-proposal integration for non-draft shared bills after bill revision and settlement-impact policy is reviewed.

Each future branch should remain narrow and should stop if it needs to change runtime, OpenAPI, generated clients, migrations, worker behavior, UI, and settlement policy all at once.
