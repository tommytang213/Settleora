# Receipt OCR Review Apply Policy

## Purpose

This document records the current architecture and policy for applying a saved receipt OCR review into bill draft data. The first runtime slice is now landed for explicit draft-only apply, and this document keeps the boundary between that current state and wider future apply, finalization, revision, worker, mobile, UI, settlement, payment, balance, or file API behavior.

## Current State

- Receipt file bytes already go through the API storage abstraction and file metadata lifecycle.
- Receipt and supporting attachments are purpose-specific bill attachment flows, not a generic file API.
- Bill attachment OCR review intake exists for existing active receipt attachments.
- Receipt OCR review queue/list endpoints exist for current-actor visible reviews.
- Receipt OCR review apply-preview exists as a non-mutating read preview.
- Apply-preview builds bounded proposed bill/header and line candidates, `canApply`, `blockedReasons`, and `warnings`.
- Apply-preview does not create or mutate bill items, splits, settlements, balances, payments, files, storage bytes, OCR jobs, worker state, or audit rows.
- Explicit draft-only OCR review apply endpoints exist:
  - `POST /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/apply`
  - `POST /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/apply`
- Day 1 apply supports only `replace_draft_ocr_items`.
- Apply is limited to safe draft or draft-like one-participant/compatible-payer shapes. It does not infer multi-participant splits or apply to non-draft shared bills.
- Apply preserves manual bill items, soft-replaces prior OCR-applied draft items from the same review, and writes source markers on applied bill item candidates using `receipt_ocr_review_apply`, `source_receipt_ocr_review_id`, and `source_receipt_ocr_review_line_id`.
- Actual OCR engine processing, worker integration, mobile/on-device OCR UI, non-draft shared-bill revision apply, wider apply/finalization behavior, automatic bill finalization, thumbnails, and generic file/receipt/OCR APIs remain unimplemented.

## Authority And Safety Boundaries

- API/domain services own mutation from OCR review data to bill data.
- OCR output is never final financial truth.
- OCR creates candidate/review data only.
- Users must be able to review and edit extracted fields before OCR-derived data becomes a final local record or queued server-mode change.
- In server mode, user-reviewed OCR-derived data remains provisional until API/domain validation accepts money, currency, ownership, authorization, file purpose, storage policy, split/adjustment/payer policy, duplicate/conflict policy, and rounding.
- The intended flow is `capture/import -> OCR candidate extraction -> user review/edit -> apply preview -> explicit apply -> API/domain validation -> accepted bill state`.
- OCR output remains provisional until explicit user action and API validation.
- Apply must be user-triggered; OCR completion, queue visibility, generated client availability, apply endpoint availability, or apply-preview success must never automatically apply or finalize bill data.
- Preview success, queue visibility, OCR completion, assignment state, generated-client availability, or worker output must not automatically finalize bills.
- Clients, generated clients, OCR workers, and mobile OCR must not directly mutate authoritative bill items, splits, settlement, payments, balances, file metadata, or storage metadata.
- Workers may produce provisional OCR results only through reviewed job/result boundaries; the API must validate and accept those results before they affect bill truth.
- Generated clients are transport helpers only. They must not become policy engines for money, ownership, bill state, splits, settlement, payment, balance, file lifecycle, or audit decisions.
- API responses must remain bounded and must not expose raw OCR full text, receipt bytes, storage object keys, filesystem paths, provider internals, signed URLs, filenames, payment details, auth/session fields, raw audit metadata, or unrelated users.

## Current Apply Operation Policy

The mutating apply surface is purpose-specific and route-owned by the existing bill attachment OCR review family:

```text
POST /api/v1/bills/{billId}/attachments/{fileId}/ocr-review/apply
POST /api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review/apply
```

The operation remains subject-specific; it does not introduce a generic OCR, receipt, or file apply API.

Current apply must:

- Require an authenticated current actor derived server-side.
- Require mutation rights stricter than preview/list/read; bill creator or bill owner/responsible editor should be the default Day 1 rule.
- Load a visible bill, active receipt attachment, active receipt file object, and saved OCR review through server-side authorization.
- Fail closed when the bill, group, membership, attachment, file object, review, status, purpose, visibility, or lifecycle state is missing, deleted, removed, inactive, wrong-purpose, unrelated, or unsafe.
- Verify the saved review is still the version the user previewed or intended to apply by checking the expected saved review update timestamp so stale preview data is not applied silently.
- Re-run apply-preview validation server-side at write time. The client must not submit line IDs, money totals, preview totals, split allocations, settlement data, file metadata, actor identity, or review truth as authority.
- Run the mutation inside an API-owned database transaction.
- Mutate only approved draft bill item candidate rows for the selected bill scope.
- Avoid writing settlement, payment, balance, proof, storage, file-object, OCR job, or worker state.
- Produce bounded audit events for attempts, success, and failure where useful and safe.

## Bill State And Approval Policy

The conservative Day 1 apply rule is draft-only or draft-like only. Direct apply is limited to bills that are still safely mutable and have no downstream financial records depending on their current items, totals, participants, payer contributions, splits, settlement candidates, request lines, payments, allocations, residuals, or balance projections.

Applying OCR-derived data to bills with accepted participants, submitted confirmation state, finalized state, settlement requests, settlement payments, payment allocations, residuals, proof records, or policy-recognized balance effects must not silently rewrite financial truth.

If future scope allows applying OCR-derived changes to non-draft shared bills, the apply operation must go through the existing financial-impacting edit or revision proposal path. That path must preserve participant approval/reset policy, payer confirmation policy, settlement safety checks, and audit coverage instead of directly rewriting the active bill.

Apply must not mutate settlement, payment, balance, residual, proof, storage, or file records directly. Any later settlement impact must be handled through reviewed settlement/revision policy.

## Data Mapping Policy

Current apply maps reviewed OCR line fields only after validation:

- Reviewed merchant text and receipt date remain preview/header candidates only in the current apply slice; writing them to bill header fields is future work.
- Reviewed currency and header totals remain validation inputs and response summaries only in the current apply slice.
- Reviewed line candidates may become draft bill item candidates only after text, quantity, amount, currency, ordering, and line-count validation.
- Decimal strings must be parsed using decimal-safe invariant logic. JSON numbers, locale-formatted strings, currency symbols, exponent notation, `NaN`, and `Infinity` must not become authoritative money.
- Currency must be attached anywhere money exists. The system must not infer authoritative currency from locale, symbol, user default currency, OCR text, or existing UI display.
- Rounding must use the centralized money policy. Endpoint handlers, clients, generated clients, workers, and ad hoc database defaults must not invent separate rounding behavior.
- Header total mismatches, line total mismatches, line-sum mismatches, empty line sets, unsupported currency, missing currency, and currency mismatch must block current apply or require an explicit reviewed policy decision before any wider apply mode accepts them.
- Raw OCR full text must not be copied into audit/logs and should not become authoritative bill data by default.

The saved OCR review is a candidate source, not authoritative bill state. Current apply stores bounded source markers on OCR-applied draft item candidates, but the authoritative bill rows remain the API-validated bill representation.

## Apply Modes

Current supported mode:

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

Successful apply should audit bounded safe metadata such as:

- action category and outcome
- actor/auth subject IDs where already safe for the audit system
- bill ID, group ID where applicable, receipt file ID, and OCR review ID
- source/status category, apply mode, line counts, and resulting bill or revision reference
- currency and bounded amount categories where policy permits
- issue or block reason codes
- transaction/correlation identifiers where available

Failed or blocked apply attempts may be audited with bounded reason codes if useful and safe. Audit records must not contain raw OCR text, receipt bytes, storage paths, storage object keys, provider internals, signed URLs, filenames, credentials, tokens, raw request bodies, payment details, unbounded notes, or unrelated user data.

Operational metrics may count attempts, successes, failures, reason-code categories, and validation issue categories. Metrics must stay aggregate or bounded; they must not include receipt contents or sensitive extracted text.

## Current And Future Non-goals

Current apply does not implement:

- OCR engine, OCR worker, or job behavior.
- Flutter, mobile, web, admin, or UI behavior.
- Automatic OCR-to-bill finalization.
- Non-draft shared-bill revision apply.
- Multi-participant OCR-to-split inference.
- Bill split, settlement, payment, residual, proof, balance, storage, or file-object mutation.
- Generic file, receipt, or OCR APIs.
- Receipt thumbnails.
- Statement import or reconciliation.
- Revision proposal runtime changes.
- Notification behavior.

## Next Implementation Candidates

Recommended future branch order:

1. UI/mobile review flow after the draft-only API contract stabilizes.
2. OCR engine and Python worker integration through provisional result boundaries.
3. Multi-participant OCR-to-split inference after split policy and review UX are explicitly designed.
4. Later revision-proposal integration for non-draft shared bills after bill revision and settlement-impact policy is reviewed.
5. Automatic bill finalization only after separate product, audit, and settlement-impact policy review.

Each future branch should remain narrow and should stop if it needs to change runtime, OpenAPI, generated clients, migrations, worker behavior, UI, and settlement policy all at once.
