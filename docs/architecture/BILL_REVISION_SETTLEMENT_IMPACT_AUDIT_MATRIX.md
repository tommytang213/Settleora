# Bill Revision Settlement Impact And Audit Matrix

## Purpose

This document defines the design/control matrix for future bill revision settlement-impact classification, audit coverage, audit redaction, and validation proof.

It complements [Bill revision snapshot architecture](BILL_REVISION_SNAPSHOT_ARCHITECTURE.md), [Bill revision approval and payer reconfirmation policy](BILL_REVISION_APPROVAL_POLICY.md), [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md), [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md), and [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md).

This document is design-only for #426. It does not authorize bill revision runtime behavior, settlement recalculation, settlement reopen or adjustment workflows, EF/domain model changes, DbContext/model-snapshot changes, migrations, canonical OpenAPI edits, generated-client refreshes, mobile/web/admin UI, OCR runtime behavior, tests, Docker/CI/deployment changes, auth/session/security runtime changes, storage/file-byte behavior, secrets, or money calculation code.

## Current State

The current repository already has:

- bill revision proposal, submit, revise, withdraw, approve, reject, payer-confirmation, and apply endpoint slices in the canonical OpenAPI contract and generated clients
- revision-specific approval binding to revision ID, accepted amount, currency, and calculation hash
- payer confirmation binding to revision ID and calculation hash
- server-generated review context with aggregate financial impact and explicit limitations
- a conservative bill revision apply policy that blocks apply when settlement request, request-line, payment, allocation, residual, proof, or settled-participant state exists
- settlement request, payment, allocation, residual, proof, basket, and balance projection foundations

The current safe behavior is intentionally conservative: pending revisions are not settlement truth, and existing settlement state blocks revision apply until a future reviewed invalidation, adjustment, or reopen policy exists.

## Authority Rules

Settlement impact for bill revisions is API/domain-authoritative.

The API/domain layer must be the only authority for:

- classifying settlement impact
- deriving affected balances, settlement candidates, request lines, allocations, residuals, and proof dependencies
- deciding whether settlement impact blocks apply, requires invalidation, requires adjustment, requires reopen, or can be applied without downstream mutation
- deciding affected participant reset and payer reconfirmation state
- enforcing idempotency and optimistic concurrency
- emitting bounded audit events
- redacting audit and logs

Clients may render server-provided impact categories, warning labels, disabled actions, and review readouts. Clients must not calculate settlement truth, affected-user state, payer reconfirmation state, balance projections, audit truth, or authorization from local math, hidden controls, generated client availability, cached group membership, or raw revision rows.

## Settlement Impact Categories

Future implementation should classify each submitted or apply-attempted revision into one or more safe machine-readable categories. Category names below are planning names only and must not be added to OpenAPI by this branch.

| Category | Meaning | Required default behavior |
| --- | --- | --- |
| `no_financial_impact` | The revision changes only bounded metadata and cannot change participant obligations, payer contribution, settlement candidates, balances, accepted calculation hash, sensitive visibility, or review basis. | No settlement mutation. Audit the revision lifecycle and any policy-sensitive metadata change. |
| `affected_participant_shares_changed` | One or more participant resolved shares, split basis, item assignment, inclusion state, calculation hash, or residual assignment changes. | Reset only impacted participants for the revision; pending revision is not settlement truth. Existing settlement state blocks apply until explicit policy exists. |
| `payer_contribution_changed` | Paid-by role, payer amount, payer currency, multi-payer allocation, payment-method responsibility, or payer-side net position changes. | Require payer reconfirmation for changed payer obligations. Existing settlement state blocks apply until explicit policy exists. |
| `total_amount_changed` | Bill total, subtotal, item total, adjustment total, receipt mismatch resolution, refund/credit, or manual correction changes. | Recalculate through centralized money policy in future runtime; require affected approvals and payer confirmation where applicable. No silent settlement mutation. |
| `currency_rounding_changed` | Currency, money policy version, rounding policy version, precision, allocation order, or residual assignment changes. | Treat as financial impact. Require money/currency safety proof and residual auditability before any apply. |
| `tax_fee_discount_allocation_changed` | Tax group, tax-included/excluded mode, service charge, delivery fee, discount, credit, surcharge, or allocation method changes. | Treat participants whose shares or residuals change as affected. Preserve policy version and allocation explanation. |
| `participant_added_removed` | A participant is added, removed, included, excluded, linked, unlinked, or otherwise changes participation status for the bill. | Require approval from newly affected actors where policy allows and reset impacted existing participants. Do not use group role alone to override participant acceptance. |
| `partially_or_fully_settled_bill_affected` | The bill has selected request lines, marked-paid payments, confirmed payments, residuals, or settled participant state. | Block ordinary apply until a reviewed invalidation, adjustment, reopen, or correction workflow exists. Preserve confirmed settlement history. |
| `settlement_proof_or_payment_records_exist` | Proof attachments, payment claims, payment allocations, receiver confirmations, disputes, cancellations, or residual rows already exist for the bill's settlement basis. | Do not rewrite, delete, relink, or reinterpret proof/payment history silently. Apply requires future explicit policy and audit. |
| `rejected_or_superseded_revision_flow` | The revision was rejected, withdrawn, cancelled, superseded, or replaced by a newer pending revision. | Approvals and payer confirmations do not carry silently. Audit lifecycle outcome and require fresh basis for replacement revisions. |
| `stale_or_conflicting_revision_attempt` | Expected bill/revision version, calculation hash, OCR review timestamp, idempotency body hash, or latest-submitted state does not match current server state. | Deny fail-closed with safe problem metadata and audit where useful. Do not mutate bill or settlement state. |

When a revision falls into multiple categories, the strictest category governs apply eligibility. Existing settlement/payment/proof state should be treated as blocking until a later reviewed policy explicitly defines safe invalidation, adjustment, reopen, refund, waiver, or credit behavior.

## Required Settlement-Safety Behavior

Future runtime implementation and tests must prove the following:

- Confirmed settlement history is never silently mutated by pending or accepted bill revisions.
- Pending revisions never change settlement candidates, request lines, payments, allocations, residuals, proof attachments, balance projections, reports, or active accepted bill shares.
- Affected balances remain pending/readout-only until approval policy, payer reconfirmation policy, authorization, stale-basis checks, and settlement-impact policy are all satisfied.
- Payer reconfirmation is required where payer obligation, paid-by role, payment contribution, payer currency, payer contribution allocation, or payer-side net position changes.
- Participant acknowledgement resets only for impacted participants unless the system cannot safely determine the impacted set; incomplete detail must fail safe or broaden the affected set.
- Historical bill revision snapshots, active accepted revision history, participant status history, payer confirmation history, settlement request/payment history, residual history, and proof linkage history remain available for audit and dispute review.
- Creation, revise/resubmit, approval, payer confirmation, and apply-like commands use idempotency where retry risk exists.
- Mutations use optimistic concurrency through explicit expected bill/revision version, ETag-style guards, calculation hash, or equivalent stale-basis checks.
- Rejected, withdrawn, cancelled, and superseded revisions cannot become active settlement truth.
- Rollback, rejection, and supersession preserve audit history and do not erase previously visible outcomes.
- Rounding residuals, residual assignment order, residual recipient, money policy version, and rounding policy version are preserved and auditable when they affect shares or settlement impact.
- Existing settlement proof bytes and storage/file metadata are not copied into revision snapshots or audit.

## Audit Coverage Matrix

Future implementation should emit bounded audit events from API/domain services. Event names are examples; equivalent names are acceptable if they preserve the category, outcome, subject IDs, and redaction rules.

| Event category | Required success coverage | Required denial/conflict coverage | Safe metadata examples |
| --- | --- | --- | --- |
| Revision submitted | Revision moved from draft to submitted with snapshot/review basis materialized. | Submit denied for unauthorized actor, stale draft, unsupported snapshot, active pending conflict, or policy block. | Actor ID, bill ID, revision ID, status, calculation hash category, affected count, request ID. |
| Revision accepted/rejected | Affected participant approval or rejection recorded against the exact revision basis. | Approval denied for wrong actor, wrong amount, wrong currency, wrong hash, superseded/rejected revision, or not-affected actor. | Actor ID, participant ID, bill ID, revision ID, decision, amount/currency when safe, policy result. |
| Affected participant reset | Impacted participants reset to pending for the revision only. | Reset blocked because impacted set cannot be safely derived or visibility/storage policy is unresolved. | Impact category, affected participant IDs where safe, affected count, reason category. |
| Payer reconfirmation required | Payer confirmation requirement created for changed payer facts. | Requirement cannot be created because payer visibility, stale basis, or policy is invalid. | Payer profile ID, bill ID, revision ID, payer impact category, amount/currency when safe. |
| Payer reconfirmation completed/rejected | Payer confirms or rejects their own required payer basis. | Confirmation denied for wrong actor, wrong hash, stale/superseded revision, or no longer-required state. | Actor ID, payer profile ID, revision ID, confirmation outcome, calculation hash category. |
| Settlement impact detected | Server classifies one or more settlement impact categories. | Classification denied or incomplete because source settlement state is not visible or snapshot detail is unsupported. | Impact category, source category, affected count, policy result, correlation ID. |
| Settlement impact applied | Future reviewed invalidation, adjustment, reopen, or correction policy applies impact explicitly. | Apply denied for missing approvals, missing payer confirmation, stale state, settlement policy block, or authorization failure. | Policy name/version, impact category, source settlement IDs where safe, actor, timestamp. |
| Revision superseded/cancelled | Revision lifecycle moves to superseded, withdrawn, or cancelled without changing active accepted truth. | Supersession/cancellation denied for wrong actor, stale latest revision, or already terminal state. | Prior revision ID, replacement revision ID when present, status, reason category. |
| Stale/concurrency denied | Expected version, calculation hash, latest revision, idempotency key, or OCR review timestamp mismatch is rejected. | Same as success category; denial is the event. | Operation, subject IDs, stale category, expected/current version category, request ID. |
| Policy denied | Authorization, settlement, lock, storage/visibility, OCR, or money policy blocks a revision operation. | Same as success category; denial is the event. | Policy family, policy result, operation, actor, bill ID, revision ID, correlation ID. |
| Non-draft OCR-to-revision handoff noted | Saved OCR review is identified as needing formal revision routing once #440 defines the API policy. | Direct non-draft apply is denied because #440/#441 policy or coverage is absent. | OCR review ID, attachment file ID, bill ID, revision handoff category, no raw OCR text. |

Audit should include both successful state transitions and security/policy-relevant denials. High-volume read-only previews may use sampled or domain-specific audit only where future policy says so, but write attempts and policy denials must be reviewable.

## Audit Redaction And Privacy Rules

Audit metadata, logs, reports, test snapshots, and validation output must not include:

- receipt text or raw OCR full text
- unbounded OCR candidates or raw notes
- payment proof bytes, receipt bytes, thumbnails, or sensitive file contents
- storage object keys, direct storage paths, bucket names, provider internals, signed URLs, local device paths, or vault internals
- auth tokens, refresh credentials, session tokens, API keys, secrets, password material, provider tokens, or credential metadata
- raw request bodies, raw response bodies, multipart payloads, or uploaded file contents
- unnecessary payment details, unrelated user financial data, private notes, or sensitive contact/profile identifiers

Safe audit metadata should prefer:

- actor account/profile ID where safe
- subject type and subject ID
- bill ID and revision ID
- affected participant IDs only where the actor and audit viewer are authorized or where internal audit policy allows bounded IDs
- payer profile ID only where safe
- settlement request/payment/allocation/residual/proof IDs only as bounded references when needed
- impact category, policy result, reason category, lifecycle status, and operation name
- amount/currency only where policy allows bounded financial metadata
- policy version, money policy version, rounding policy version, calculation hash category, timestamp, request ID, and correlation ID

Audit records must be useful for investigation without becoming a copy of sensitive receipts, payment proof, OCR output, storage internals, or authentication material.

## Future Test And Validation Matrix

This branch does not add tests. Future implementation branches must choose validation based on changed files and risk, but #426 expects the following proof categories before bill revision settlement impact can be considered complete.

| Validation area | Required future coverage |
| --- | --- |
| Unit/domain tests | Settlement-impact classifier, affected participant reset, payer reconfirmation trigger, revision lifecycle, stale-basis checks, idempotency replay, optimistic concurrency, unsupported-detail fail-safe behavior. |
| API integration tests | Submit/approve/reject/payer-confirm/apply attempts across visible personal/group bills, unauthorized actors, stale revisions, superseded revisions, settlement-blocked bills, and safe problem responses. |
| Migration/schema tests | Required only if future schema changes add revision snapshots, audit rows, settlement impact rows, or policy/version columns. Must verify constraints, indexes, amount/currency pairs, and no storage internals. |
| OpenAPI/client validation | Required only if future contract changes expose impact categories, audit readouts, revision snapshot fields, or OCR-to-revision handoff shapes. Must regenerate clients through the reviewed workflow. |
| Settlement impact edge cases | No impact, share-only change, payer-only change, total change, currency/rounding change, tax/fee/discount allocation change, participant add/remove, active request, marked-paid payment, confirmed payment, residual, dispute, cancellation, proof attachment, and existing balance projection. |
| Audit redaction/log scan | Verify audit metadata excludes raw OCR text, notes, file bytes, proof bytes, storage paths, provider internals, raw bodies, secrets, tokens, and sensitive payment details. Include failure-path audit. |
| Money rounding/currency safety | Decimal-safe amounts, currency-attached values, unsupported currency rejection, cross-currency block, residual assignment determinism, minor-unit handling, policy version capture, and no hidden residual mutation. |
| Authorization and stale state | Missing/deleted/archived/unrelated/inactive/removed-member cases fail closed; wrong actor cannot approve, reject, confirm payer state, inspect restricted settlement impact, or apply revisions. |
| OCR handoff safety | Non-draft OCR-derived changes route only through #440 policy after review, deny direct apply, preserve saved review version checks, and prove #441 approval/payer/settlement safety coverage. |

Future validation commands must include the task-specific commands required by the implementing branch. Docs-only branches should stay on docs validation; runtime/API/OpenAPI/schema/generated-client branches must run the corresponding suites and report exact results.

## Handoffs And Sequencing

- #423 supplied the bill revision snapshot architecture and is merged.
- #424 supplied the affected-user approval and payer reconfirmation policy and is merged.
- #426 owns this settlement-impact and audit coverage matrix only.
- #440 owns non-draft OCR-to-revision API policy. This document notes the handoff but does not implement or authorize that API policy.
- #441 owns non-draft OCR approval, payer, and settlement safety coverage after #440.
- #348 remains the parent bill revision roadmap and should stay open until the child planning, implementation, UI/reference, QA, and merge gates complete.
- Future runtime, schema, migration, OpenAPI, generated-client, mobile/web/admin UI, settlement invalidation, settlement adjustment, settlement reopen, refund, credit-ledger, OCR runtime, and test implementation remain separately gated.

## Implementation Readiness Checklist

Before any future runtime branch implements settlement-impact behavior, it must state:

- the exact impact categories implemented
- whether existing settlement state blocks apply, invalidates requests, adjusts requests, reopens settlements, or creates explicit correction records
- the approval and payer reconfirmation basis
- the concurrency and idempotency model
- the audit event categories and redaction proof
- the money/rounding/currency proof
- the OpenAPI/generated-client impact, if any
- the schema/migration impact, if any
- the validation commands and expected suites
- the manual gate status for money, settlement, schema, OpenAPI, generated-client, storage/privacy, auth/security, and UI/reference surfaces

If any of those answers requires changing runtime authority, settlement history, schema, OpenAPI, generated clients, storage/file bytes, auth/security behavior, or UI, that work belongs in a separately scoped and gated task, not in a docs/control branch.
