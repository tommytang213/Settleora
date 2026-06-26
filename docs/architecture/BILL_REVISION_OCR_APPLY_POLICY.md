# Bill Revision OCR Apply Policy

## Purpose

This document defines the design/control policy for converting OCR-derived changes on non-draft bills into formal bill revisions.

It bridges the current draft-only receipt OCR review apply foundation, [OCR architecture](OCR_ARCHITECTURE.md), [Receipt OCR review apply policy](RECEIPT_OCR_REVIEW_APPLY_POLICY.md), [Bill revision snapshot architecture](BILL_REVISION_SNAPSHOT_ARCHITECTURE.md), [Bill revision approval and payer reconfirmation policy](BILL_REVISION_APPROVAL_POLICY.md), and [Bill revision settlement impact and audit matrix](BILL_REVISION_SETTLEMENT_IMPACT_AUDIT_MATRIX.md).

This document is design-only for #440. It does not authorize runtime endpoint changes, API/domain implementation, worker runtime changes, EF model changes, DbContext/model-snapshot changes, migrations, canonical OpenAPI edits, generated-client refreshes, mobile/web/admin UI, Figma work, settlement calculation changes, money calculation changes, storage provider behavior, Docker/CI/deployment changes, secrets, or auth/session/security runtime changes.

## Current State

Settleora currently has a bill-scoped receipt OCR review intake, read, delete, apply-preview, queue/list, and explicit draft-only apply foundation for existing receipt attachments. Current apply supports only `replace_draft_ocr_items` for safe draft or draft-like one-participant/compatible-payer shapes.

The current runtime intentionally does not:

- run OCR engines or server OCR workers
- automatically apply OCR output after processing, preview, queue visibility, notification visibility, or generated-client availability
- infer multi-participant splits from OCR output
- apply OCR-derived changes to non-draft shared bills
- mutate settlement requests, payments, allocations, residuals, proof records, balance projections, storage bytes, file metadata, OCR job state, or worker state as a side effect of OCR review

Non-draft OCR-derived changes remain blocked from direct apply until a future implementation branch explicitly routes them through bill revision policy and later #441 safety coverage.

## Authority Rules

OCR output is provisional. In server mode, OCR-derived data affects authoritative records only after API/domain services validate and accept it through reviewed bill, revision, money, authorization, storage, settlement-impact, and audit policy.

The API/domain layer is authoritative for:

- loading the current bill, attachment, file object, OCR review, active accepted revision, active pending revision, group context, participant/payer context, and settlement-impact context
- deciding whether the bill state allows OCR-to-revision, blocks it, or requires manual review
- normalizing OCR-derived proposed fields into a candidate revision snapshot
- validating money, currency, rounding, totals, split inputs, participant assignments, payer contributions, payment-method hints, file references, stale versions, and idempotency
- deciding affected participant reset and payer reconfirmation requirements
- classifying financial and settlement impact
- producing review context, viewer actions, safe problem responses, and bounded audit events

Clients, generated clients, OCR workers, mobile OCR, and queue consumers may provide or transport provisional data. They must not become the source of bill truth, revision truth, financial truth, settlement truth, affected-user state, payer-confirmation state, authorization, file visibility, or audit truth.

## Worker Boundary

Server-side OCR workers may consume OCR jobs and publish result, failure, confidence, or status events through reviewed queue/event contracts. Workers must not directly mutate:

- `expense_bills`
- bill item, split, participant, payer, adjustment, attachment, or revision tables
- settlement request, payment, allocation, residual, proof, or balance tables
- file metadata, storage lifecycle, authorization, or audit tables

Worker result events are inputs to API/domain validation only. A worker retry, duplicate delivery, late result, confidence score, or success event must not directly create, submit, approve, apply, cancel, supersede, or reject a bill revision.

## Routing Policy

OCR-derived changes become a proposed bill revision instead of silently changing the bill when the target bill is no longer safely mutable as a draft and any proposed field could affect accepted bill truth, participant obligations, payer responsibility, settlement basis, review evidence, audit history, or sensitive visibility.

Direct draft apply remains limited to the current draft-only policy. Non-draft OCR-to-revision is the future path for:

- submitted bills waiting on participant confirmation
- confirmed bills
- rejected, disputed, or needs-review bills where policy allows correction proposal or resubmission
- archived bills only after a future unarchive/edit eligibility policy allows proposal routing

OCR output must not silently rewrite active accepted bill truth. It should create or revise a pending bill revision that preserves the prior accepted version as historical truth and keeps the proposed OCR-derived version pending until required review gates are satisfied.

## Bill State Matrix

| Bill state | OCR-to-revision policy | Default handling |
| --- | --- | --- |
| `draft` | Direct draft apply may be allowed under the existing draft-only apply policy. | Use current `replace_draft_ocr_items` constraints; no formal non-draft revision is required unless downstream state or manual review policy says otherwise. |
| `pending_confirmation` | Allowed as a proposed revision when the OCR change affects submitted facts. | Preserve current submitted truth, compute affected participants and payer confirmation, and route through formal revision review. |
| `confirmed` | Allowed as a proposed revision only. | Active confirmed truth remains stable until the revision is approved, payer-confirmed where needed, settlement-safe, and applied by API policy. |
| `rejected` or `needs_review` | Allowed where the current actor may propose or revise corrections. | Create or supersede a pending revision with fresh review basis; previous rejection remains auditable. |
| `disputed` | Requires explicit manual review. | Allow proposal intake only if dispute policy permits; otherwise block with a dispute/manual-review reason. |
| `archived` | Blocked by default. | Require future unarchive/edit eligibility before OCR-to-revision can proceed. |
| `finalized` or locked period | Blocked by default. | Require future lock/reopen/governance policy before any ordinary OCR-derived revision apply. |
| `cancelled` | Blocked by default. | Require future restore/reopen policy; do not apply ordinary OCR-derived changes. |
| Any bill with requested, partially paid, marked-paid, confirmed, disputed, cancelled-with-history, residual, allocation, proof, or balance-impact settlement state | Manual review or blocked by settlement policy. | Pending revision may be readable as a proposal only where policy allows, but apply is blocked until explicit invalidation, adjustment, reopen, or correction workflow exists. |

When status names differ in runtime or OpenAPI, future implementation should map them to these policy meanings rather than inventing a separate OCR-specific state machine.

## OCR Change Category Mapping

Future implementation should map accepted OCR-derived proposals into the same revision categories used by #423, #424, and #426. Client-supplied labels are advisory only; the API/domain service derives final categories from normalized current and proposed snapshots.

| OCR-derived change | Revision category | Default policy |
| --- | --- | --- |
| Merchant cleanup | Metadata/header change | Usually non-financial; audit and no reapproval unless duplicate detection, receipt identity, reconciliation, reporting, or review baseline changes financial state. |
| Bill date or receipt date | Header/date change | Manual review or affected participant approval when period locks, FX/tax policy, reporting, recurring, reconciliation, settlement eligibility, or review basis changes. |
| Currency | Currency/rounding change | Financial impact; all participants with shares and all payers with contributions are affected. |
| Line item add/edit/delete | Item change | Financial impact when item total, tax group, assignment, split basis, receipt reconciliation, or adjustment allocation changes. |
| Quantity, unit amount, or line total | Item money change | Financial impact; recalculate through centralized money policy and reset affected participants. |
| Subtotal, tax, service charge, discount, delivery fee, surcharge, credit, refund, or manual correction | Adjustment/tax/fee/discount allocation change | Financial impact; reset participants whose share, residual, allocation, or calculation hash changes. |
| Participant assignment or split inference | Participant/split change | Financial impact and manual review by default; API must not trust OCR to infer multi-participant obligations without reviewed split policy. |
| Payer contribution, paid-by, or payment-method hint | Payer contribution/payment-method change | Require payer reconfirmation when payer role, amount, contribution allocation, payer-side responsibility, or settlement basis changes. Display-only payment-method labels may avoid reconfirmation only when policy proves they do not affect payer responsibility or reconciliation truth. |
| Receipt image, attachment metadata, OCR review ID, source line IDs, confidence metadata, or raw OCR metadata | Attachment/OCR evidence change | Use stable file/review IDs and bounded metadata only. Financial review is required if the evidence changes amount, payer, participant, split, settlement, or review basis. Visibility-sensitive changes require storage/privacy policy. |

## Financial Impact And Approval Rules

OCR-to-revision is financially impactful when the proposed normalized snapshot could change any participant share, payer contribution, bill total, currency, item assignment, tax/fee/discount allocation, rounding residual, settlement candidate, accepted calculation hash, or reporting/period basis.

Affected participants reset to `pending_acceptance` for the proposed revision when any of the following changes:

- their resolved share amount or currency
- their split basis, item assignment, item quantity, item tax group, discount/fee allocation, or rounding residual source
- their participant inclusion, exclusion, linkage, or identity
- their accepted calculation hash
- their settlement candidate, debtor/creditor direction, outstanding line basis, or review evidence visibility

If snapshot detail is insufficient to prove a narrow affected set, the safe default is to treat the participant as affected or block with an unsupported-detail reason. The API must not narrow affected users from incomplete OCR or snapshot data.

## Payer Reconfirmation Rules

OCR-to-revision requires payer reconfirmation when OCR-derived data changes or creates payer-side responsibility.

Triggers include:

- payer added or removed
- payer amount, currency, contribution allocation, contribution ordering, or residual assignment changed
- paid-by role changed
- payer's own participant share changes in a way that changes net position
- payment-method hint becomes responsibility, reconciliation authority, or payer-side evidence rather than display-only metadata
- OCR-derived change is proposed by someone other than the payer and changes payer facts on the payer's behalf
- previous payer confirmation was bound to a superseded revision, stale calculation hash, stale contribution set, or stale OCR source basis

Payer reconfirmation is separate from participant approval. The same actor may satisfy both when applicable, but audit must preserve both meanings.

## Settlement Impact And Historical Correctness

Pending OCR-derived revisions are not settlement truth. They must not mutate settlement candidates, request lines, payments, payment allocations, residual rows, proof attachments, balance projections, reports, or active accepted bill shares.

Applying an OCR-derived revision requires the same settlement-impact handling as any other bill revision:

- no settlement state: future implementation may apply after authorization, approvals, payer confirmations, stale checks, and money validation pass
- pending/requested settlement state: block apply until a bill-revision-owned invalidation workflow exists
- progressed settlement/payment/proof/residual history: block apply until a reviewed adjustment, reopen, correction, refund, waiver, or credit policy exists

Active accepted bill history remains available for audit, dispute review, settlement traceability, reporting, and baseline selection. Applying a revision creates a new accepted revision or equivalent versioned truth; it must not overwrite prior accepted facts in place.

## Conflict And Stale-Source Handling

OCR-to-revision mutations must fail closed when the OCR source or bill basis is stale.

Future commands should require explicit stale guards such as:

- expected bill version or ETag
- expected active accepted revision ID/version
- expected active pending revision ID/version when revising an existing pending proposal
- expected OCR review ID and updated timestamp or candidate version
- expected receipt attachment file ID and attachment lifecycle state
- expected calculation hash or preview basis where applicable

The API should return bounded problem responses for stale bill version, stale revision version, active pending revision conflict, superseded revision, stale OCR review, stale receipt attachment, file reference not visible, calculation mismatch, approval basis mismatch, payer confirmation mismatch, and settlement policy block.

If the bill changed after OCR was produced, the user should receive a conflict/manual-review response. The API must not merge OCR output into newer bill truth silently.

## Idempotency And Correlation

Creation, resubmission, and apply-like OCR-to-revision commands should support idempotency where retry risk exists.

Idempotency keys should be scoped by:

- authenticated actor
- operation
- route subject, including bill ID, group ID where applicable, file ID, and OCR review ID
- normalized request body hash
- target active accepted revision or expected bill version

Replaying the same idempotent request should return the same revision result when safe. Reusing a key with a different body, different OCR source, different bill version, different actor, or different route subject should fail with a conflict.

Correlation/request IDs should flow through safe problem responses, revision lifecycle records, and audit metadata. They are not authorization tokens.

## Audit, Logging, And Redaction

Audit should cover successful and denied OCR-to-revision operations from API/domain services, including:

- OCR review routed to revision
- OCR-derived revision created, revised, submitted, superseded, withdrawn, approved, rejected, payer-confirmed, applied, blocked, or denied
- affected participant and payer reconfirmation recalculation
- settlement-impact classification at submission or apply time
- stale OCR source, stale bill/revision, idempotency conflict, authorization denial, unsupported detail, money validation, and storage/file visibility denials

Safe audit metadata may include actor ID, bill ID, group ID where safe, revision ID, OCR review ID, receipt attachment file ID, source category, operation, policy result, affected count, payer-confirmation count, settlement-impact category, money/rounding policy version, calculation hash category, request ID, and correlation ID.

Audit, logs, metrics, reports, examples, and validation output must not include:

- raw OCR full text or unbounded OCR candidate text
- receipt contents, file bytes, thumbnails, or payment proof bytes
- storage paths, object keys, bucket names, provider internals, signed URLs, local device paths, or vault internals
- raw request bodies, raw response bodies, multipart payloads, or uploaded file contents
- secrets, tokens, credentials, session values, API keys, or provider tokens
- unnecessary payment details, private notes, unrelated user financial data, or sensitive profile/contact data

Operational metrics may count attempts, successes, failures, confidence buckets, stale/conflict categories, and policy result categories only when they remain aggregate or bounded.

## API Readout Direction

This section is directional only. Canonical OpenAPI changes require a future manually gated branch.

Future API shape should remain bill-scoped and group-scoped according to existing route conventions. It may add a command that converts a saved bill attachment OCR review into a bill revision proposal, or it may extend the existing bill revision creation command with an OCR source object. In either shape, the API response should make the authority boundary explicit.

Candidate request fields:

```text
ocrReviewId
receiptAttachmentFileId
expectedOcrReviewVersion
expectedBillVersion
expectedActiveAcceptedRevisionId
expectedActivePendingRevisionId nullable
idempotencyKey
reasonCode
reasonNoteSummary nullable
submitForReview boolean
```

Candidate response envelope:

```text
revision
sourceOcrReview
reviewContext
financialImpact
settlementImpact
affectedParticipants
requiredPayerConfirmations
viewerActions
serverVersion
calculationHash
correlationId
limitations
```

Problem responses should use safe machine-readable error codes and `ProblemDetails` style envelopes with a correlation ID and no sensitive payload leakage. Generated clients remain transport helpers; their existence does not authorize OCR apply, revision creation, financial mutation, settlement mutation, or file visibility.

## Non-goals And Handoffs

This policy does not implement:

- runtime API endpoints, handlers, services, tests, or queues
- canonical OpenAPI schemas or generated clients
- EF/domain model changes, DbContext changes, migrations, model snapshots, or schema changes
- OCR engines, OCR workers, job contracts, event contracts, or storage-provider behavior
- automatic OCR-to-bill finalization
- multi-participant split inference from OCR
- mobile, web, admin, or Figma UI behavior
- settlement invalidation, adjustment, reopen, refund, waiver, credit-ledger, or balance mutation behavior
- raw OCR retention, receipt byte handling, thumbnail generation, generic file APIs, or generic receipt/OCR APIs

Handoffs:

- #441 should define test coverage for approval reset, payer reconfirmation, settlement safety, stale OCR source handling, idempotency, audit redaction, and no direct bill/settlement mutation once this policy is accepted.
- #348 remains the broader bill revision roadmap and should stay open until child planning, implementation, UI/reference, QA, and merge gates complete.
- #360 remains the broader OCR parent context for non-draft OCR follow-up work.
- Future schema, OpenAPI, generated-client, API runtime, worker runtime, OCR runtime, storage/privacy, settlement, money, and UI tasks remain separately scoped and gated.

## Future Validation Matrix

Future implementation branches should prove at least:

- draft OCR apply still follows the current draft-only path
- non-draft OCR creates or revises a formal bill revision instead of rewriting active bill truth
- pending-confirmation and confirmed bills preserve prior accepted/submitted truth until apply
- disputed, finalized, archived, cancelled, settlement-impacted, and locked states block or require manual review as specified
- OCR-derived merchant/date/currency/item/quantity/subtotal/tax/fee/discount/split/participant/payer/attachment changes map to revision categories
- affected participant reset and payer reconfirmation are computed by API/domain services
- pending revisions do not mutate settlement candidates, request lines, payments, allocations, residuals, proof, balances, or reports
- stale OCR review, stale bill, stale active revision, stale pending revision, stale attachment, and idempotency body mismatch fail closed
- audit and logs exclude raw OCR text, receipt contents, file bytes, storage internals, raw bodies, secrets, payment details, and unrelated user data
- generated clients and client previews do not become authorization, financial, settlement, or audit authority
