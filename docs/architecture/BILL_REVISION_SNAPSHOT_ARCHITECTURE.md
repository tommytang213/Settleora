# Bill Revision Snapshot Architecture

## Purpose

This document is the design packet for bill revision snapshot persistence and API planning.

It closes the current planning gap where bill revision review can expose aggregate total, participant-share, payer-contribution, and payer-role changes, but cannot yet preserve detailed item, item-split, adjustment, attachment, receipt/OCR review, note, and metadata context for server-generated review diffs.

This document is design-only. It does not authorize runtime behavior, schema changes, migrations, DbContext/model-snapshot changes, canonical OpenAPI changes, generated-client refreshes, mobile/web/admin UI, Figma work, OCR runtime, storage provider behavior, settlement runtime changes, money calculation changes, Docker/CI/deployment changes, secrets, or auth/session/security runtime changes.

## Current State

The current repository already has:

- bill revision create, list, get, revise, submit, withdraw, approve, reject, payer-confirm, and apply endpoint slices in the canonical OpenAPI contract and generated clients
- server-generated revision review context with baseline, default view mode, viewer financial impact, change summary, aggregate changes, and explicit limitations
- revision-specific approval binding to revision ID, accepted amount, currency, and calculation hash
- payer confirmation binding to revision ID and calculation hash
- conservative settlement-impact policy that blocks apply when settlement state exists
- bill attachment and receipt OCR review foundations that use stable file IDs and storage abstraction boundaries

The current limitation is intentional: revision snapshots do not yet preserve enough detailed bill facts to produce item, split, adjustment, attachment/receipt/OCR, note, or metadata diffs. Until this packet is implemented through later gated tasks, those categories must remain `unsupported_in_current_revision_snapshot`.

## Goals

- Preserve server-authoritative financial history across bill revisions.
- Support full review and changed-only review without rewriting prior facts.
- Let affected users approve the exact proposed revision they reviewed.
- Preserve enough snapshot detail for future item, split, adjustment, attachment, receipt/OCR review, note, metadata, rounding, and settlement-impact readouts.
- Keep API/domain services authoritative for authorization, affected-user state, payer reconfirmation, financial truth, money calculation, settlement impact, file access, status transitions, and audit.
- Keep canonical OpenAPI and generated-client implementation as a later manually gated task.

## Non-goals

- No multiple active official revisions in Day 1.
- No client-computed diff truth, affected-user state, payer-confirmation truth, settlement impact, authorization, or financial truth.
- No silent mutation of confirmed, acknowledged, finalized, settled, or previously reviewed participant history.
- No direct non-draft OCR apply that bypasses formal revision workflow.
- No broad settlement reopen, invalidation, refund, credit-ledger, or adjustment workflow.
- No storage byte copying into revision snapshots.
- No raw OCR full-text, file bytes, storage object keys, provider paths, secrets, raw request bodies, or payment secrets in snapshots or audit.

## Authority Rules

Bill revisions are server-mode business truth. The API/domain layer must:

- create revision identity, sequence, timestamps, actor metadata, status, and request/correlation IDs
- select viewer-specific review baselines
- calculate changed-only markers and accessible labels
- calculate affected users, payer reconfirmation needs, financial impact, and settlement-impact readouts
- parse, validate, allocate, and round money through the centralized money policy
- decide whether a caller can create, view, revise, approve, reject, confirm payer state, apply, or inspect settlement impact
- audit bounded success and denial outcomes

Clients may render server responses, cache stale read-only data with clear state, and submit bounded commands through generated clients. They must not derive authoritative revision truth from raw rows, hidden controls, route possession, cached group membership, or local preview math.

## Identity And Versioning Model

The stable bill or expense ID identifies the business record across its life. A revision ID identifies one proposed or accepted version of that record.

Recommended model:

```text
expense_bill_id
expense_bill_revision_id
revision_sequence
previous_revision_id nullable
supersedes_revision_id nullable
superseded_by_revision_id nullable
active_accepted_revision_id on the bill root or derivable by policy
active_pending_revision_id derivable by one-active-pending policy
status
created_by_user_profile_id
submitted_by_user_profile_id nullable
applied_by_user_profile_id nullable
reason_code nullable
reason_note_summary nullable, bounded
created_at_utc
updated_at_utc
submitted_at_utc nullable
withdrawn_at_utc nullable
superseded_at_utc nullable
rejected_at_utc nullable
applied_at_utc nullable
cancelled_at_utc nullable
request_id / correlation_id
calculation_hash
snapshot_schema_version
money_policy_version
rounding_policy_version
```

Day 1 keeps one active pending official revision per bill. Revising a submitted proposal creates or records a new revision version, links to the previous revision, supersedes the old pending version, and invalidates prior approvals on the superseded version.

The calculation hash must bind to the exact normalized server-side snapshot and money result used for review. It is not a secret, session credential, auth token, storage key, or authorization substitute.

## Snapshot Categories

The snapshot should capture normalized server-authoritative facts, not raw request bodies. Table names and JSON shapes are future implementation details, but the preserved categories should cover the following.

### Bill Header

- stable bill ID and revision ID
- bill status and revision status at snapshot time
- creator, owner/responsible editor, group, and participant visibility context where safe
- merchant, category, tags, bounded note metadata, and display labels needed for review
- bill date, timezone or source-date precision where supported
- currency and total amount
- payment-method hints or labels as non-authoritative reconciliation hints
- receipt-total reconciliation state and mismatch reason codes where relevant

### Payers And Participants

- payer rows with stable profile IDs, amount/currency, contribution role, payment-method hint snapshot, and payer-confirmation state
- participant rows with stable profile IDs, resolved share amount/currency, status, approval requirement state, and historical acceptance/rejection linkage
- multi-payer contribution totals and validation state
- temporary or placeholder participant identifiers only if a later approved participant policy supports them

### Line Items And Splits

- item IDs stable within the bill where available
- item names, bounded notes or display text, quantity, unit amount, line total, currency, sort order, and source markers
- item tax metadata: tax group, tax rate snapshot, tax category, tax-included or tax-excluded mode, discount tax treatment, and manual/unknown flags
- item split rows with participant IDs, split method, basis value, resolved amount/currency, allocation order, and residual flags
- open/self-claim or unresolved item state where later policy supports it

### Adjustments, Tax, Fees, Discounts, And Rounding

- tax group summary rows and item-to-tax-group linkage
- service charge, delivery fee, packaging/bag fee, surcharge, discount, credit, refund/return, tax correction, and manual adjustment rows
- allocation method, affected item or tax group linkage, direction/type, amount/currency, source kind, and review/manual state
- receipt-total mismatch state or explicit manual adjustment state
- rounding residual amount/currency, recipient item/participant/tax group where applicable, residual reason, allocation order, and policy version

### Attachments And OCR

- attachment references by stable file IDs only
- attachment purpose, lifecycle category, active/removed state, and safe display metadata where needed
- receipt OCR review ID, source review status, reviewed candidate version, source line IDs, and bounded OCR-derived field markers used for diff context
- no file bytes, storage paths, object keys, provider URLs, signed URLs, raw OCR full text, local device paths, thumbnails, or storage internals

### Review And Settlement Readouts

- viewer baseline type and baseline revision reference
- approval/rejection/payer-confirmation state per affected actor
- server-generated change categories, field paths, accessible labels, and viewer impact
- settlement-impact readout state where applicable, such as `none`, `pending_revision_not_settlement_truth`, `requested_settlement_blocks_apply`, `progressed_settlement_blocks_apply`, `future_invalidation_required`, or `future_adjustment_or_reopen_required`
- source settlement request line, payment, allocation, residual, and proof references only as bounded IDs/categories when the actor is authorized and the response needs them

## Historical Correctness Rules

Revision creation must preserve prior financial truth. Applying a revision creates a new active accepted truth or points the active bill to an accepted revision according to future schema policy; it must not overwrite the old revision in place.

Rules:

- Do not silently recalculate or mutate finalized, acknowledged, accepted, rejected, settled, or previously reviewed participant history.
- Pending revisions are not settlement truth.
- Rejected and superseded revision approvals do not carry to a different revision.
- Previous active revisions remain available for audit, dispute review, settlement traceability, reporting, and baseline selection.
- Money recalculation uses decimal-safe API/domain money types, currency-attached values, and centralized rounding/allocation services.
- Currency, manual exchange-rate snapshots, and future tax/rounding policy versions must be snapshotted when they affect historical values.
- If the system cannot safely derive a viewer baseline, the review response must say so and default to full-bill review.
- Unsupported detail categories must be returned as unsupported; the API must not fabricate item/split/attachment/note diffs from incomplete data.

## API Plan

This section is directional only. Canonical OpenAPI updates are a later separate manually gated task.

Endpoint families should stay bill-scoped and group-scoped where current route convention requires it:

```text
GET /api/v1/bills/{billId}/revisions
POST /api/v1/bills/{billId}/revisions
GET /api/v1/bills/{billId}/revisions/{revisionId}
PATCH /api/v1/bills/{billId}/revisions/{revisionId}
POST /api/v1/bills/{billId}/revisions/{revisionId}/submit
POST /api/v1/bills/{billId}/revisions/{revisionId}/withdraw
POST /api/v1/bills/{billId}/revisions/{revisionId}/approve
POST /api/v1/bills/{billId}/revisions/{revisionId}/reject
POST /api/v1/bills/{billId}/revisions/{revisionId}/payer-confirmation
POST /api/v1/bills/{billId}/revisions/{revisionId}/apply
GET /api/v1/bills/{billId}/revisions/{revisionId}/review-context
GET /api/v1/bills/{billId}/revisions/{revisionId}/snapshot
GET /api/v1/bills/{billId}/revisions/{revisionId}/settlement-impact
```

Candidate write responsibilities:

- create or revise receives bounded proposed bill input, expected bill/revision version, optional reason code, and idempotency/correlation metadata
- submit/withdraw/approve/reject/payer-confirm/apply use route identity, authenticated actor, expected revision version, and revision-specific approval or confirmation basis
- apply revalidates all approval, payer confirmation, settlement-impact, authorization, and stale-version checks at write time

Candidate read responsibilities:

- list/get returns safe revision lifecycle state and viewer action hints
- review context returns viewer-specific baseline, full/changed-only direction, financial impact, change markers, limitations, and accessible labels
- snapshot returns detailed revision facts only to actors authorized to see those facts, with safe file references and no storage internals
- settlement impact returns bounded policy categories and authorized source references, not hidden balance mutation

Responses should use an envelope direction that keeps transport stable:

```text
revision
snapshot
reviewContext
settlementImpact
viewerActions
serverVersion
calculationHash
correlationId
limitations
```

Problem responses should use `ProblemDetails` with safe machine-readable error codes, correlation ID, and no sensitive payload leakage. Expected categories include malformed request, unsupported snapshot schema version, unauthorized or not visible, stale bill version, stale revision version, active pending revision conflict, superseded revision, approval basis mismatch, payer confirmation required, affected approvals missing, settlement state blocks apply, unsupported currency, money validation failure, rounding/allocation mismatch, file reference not visible, OCR review stale, and policy blocked.

Optimistic concurrency should require explicit expected bill/revision version or ETag-style guards for mutation. Stale previews and stale OCR review candidates must fail closed rather than being applied silently.

Idempotency should be supported for creation and apply-like commands where retry risk exists. Idempotency keys must be scoped by actor, route subject, operation, and request body hash. Correlation/request IDs should flow into audit and safe problem responses.

Generated clients remain transport helpers. Their existence must not be treated as authorization, financial truth, settlement truth, or policy approval.

## Authorization And Visibility

Only authorized actors can create, view, apply, approve, reject, or inspect revisions. The API must verify current actor, bill relationship, group membership where relevant, participant/payer/creator/editor role, file-subject policy, revision status, and operation-specific rights.

Snapshot reads must be viewer-filtered where needed. A user may be allowed to review their financial impact without seeing unrelated private notes, hidden attachment metadata, another user's payment details, or storage internals.

Missing, deleted, archived, unrelated, inactive, removed-member, and not-visible cases should fail closed without leaking unrelated bill, revision, attachment, OCR review, settlement, or file existence.

## Audit And Privacy

Audit should cover:

- revision proposed, revised, submitted, withdrawn, superseded, approved, rejected, payer-confirmed, applied, cancelled, and denied
- snapshot materialized or recalculated
- affected-user and payer-confirmation recalculation
- settlement-impact classification at apply time
- stale-version, approval-mismatch, settlement-block, and authorization-denied outcomes where useful

Audit metadata may include actor ID, bill ID, revision ID, prior/current revision IDs, status category, policy versions, bounded amount/currency values where allowed, affected-user count, payer-confirmation count, settlement-impact category, request/correlation ID, and reason category.

Audit, logs, reports, examples, and validation output must avoid secrets, tokens, raw credentials, raw request bodies, full response bodies, file bytes, thumbnails, storage paths, provider object keys, provider URLs, vault keys, full OCR raw text, unnecessary OCR text, unbounded notes, sensitive payment details, unrelated user financial data, and payment secrets.

## Interaction Handoffs

- #424 owns the final affected-user approval and payer reconfirmation policy. This packet assumes that only API/domain services decide those states.
- #426 owns settlement-impact and audit test coverage. This packet requires pending revisions not to mutate settlement truth and accepted/applied revisions to use explicit policy.
- #440 owns non-draft OCR-to-revision API policy. This packet provides the snapshot destination for saved OCR review changes but does not authorize direct non-draft OCR apply.
- #441 owns non-draft OCR approval, payer, and settlement safety test coverage.
- #348 remains the parent bill revision roadmap and should stay open until child planning, implementation, UI/reference, QA, and merge gates complete.

## Implementation Sequencing

1. Land this docs/control architecture packet.
2. Add future schema/migration design for revision roots, snapshot detail rows or JSON records, approval/payer confirmation rows, and snapshot versioning.
3. Add future canonical OpenAPI request/response schema changes and regenerate clients through the reviewed generated-client workflow.
4. Implement API/domain services and runtime tests for snapshot materialization, diff generation, authorization, concurrency, idempotency, audit, and settlement-impact blocks.
5. Add non-draft OCR-to-revision routing only after #440 policy is reviewed.
6. Add mobile/web review UI or Figma/reference work only through the UI gate.
7. Add QA/security/money regression coverage for stale versions, approvals, payer confirmation, settlement impact, rounding, audit redaction, file reference visibility, and OCR safety.

## Future Validation Matrix

Future implementation branches should cover at least:

- no-baseline viewer receives full-bill review recommendation
- safe active/prior baseline viewer can receive changed-only markers
- item add/remove/change snapshots produce server-generated item diffs
- split changes reset only affected users according to policy
- adjustment, tax, fee, discount, refund, manual adjustment, and rounding residual changes preserve allocation state
- attachment and OCR review changes use stable file/review IDs without storage internals or raw OCR text
- payer role, payer amount, and payer contribution changes require payer reconfirmation
- superseded revision approvals do not carry to replacement revisions
- pending revisions do not mutate settlement candidates, request lines, payments, allocations, residuals, proof, or balances
- apply is blocked or explicitly classified when settlement state exists
- audit records are bounded and redacted
- stale version, stale OCR review, stale preview, idempotency replay, and duplicate active pending revision conflicts fail safely
