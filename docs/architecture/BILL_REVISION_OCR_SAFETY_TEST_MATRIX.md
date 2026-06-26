# Bill Revision OCR Safety Test Matrix

## Purpose

This document defines the docs/control safety test matrix for future
non-draft OCR-to-revision implementation work.

It covers OCR-derived changes against an existing non-draft bill where the
saved receipt OCR review must route through formal bill revision policy instead
of directly rewriting confirmed, final, effective, submitted, or otherwise
downstream-visible bill truth.

This document is planning-only for Refs #441. It does not add runtime tests or
authorize API behavior, OpenAPI edits, generated-client refreshes, schema
changes, migrations, storage/file-byte behavior, auth/session/security runtime
changes, money calculation changes, settlement/payment behavior changes, UI,
Figma work, worker behavior, Docker/CI/deployment changes, or secrets.

## Source Policy

Future implementation branches must treat these documents as the source policy
chain before converting this matrix into tests:

- [Bill revision OCR apply policy](BILL_REVISION_OCR_APPLY_POLICY.md)
- [Bill revision snapshot architecture](BILL_REVISION_SNAPSHOT_ARCHITECTURE.md)
- [Bill revision approval and payer reconfirmation policy](BILL_REVISION_APPROVAL_POLICY.md)
- [Bill revision settlement impact and audit matrix](BILL_REVISION_SETTLEMENT_IMPACT_AUDIT_MATRIX.md)
- [Receipt OCR review apply policy](RECEIPT_OCR_REVIEW_APPLY_POLICY.md)
- [OCR architecture](OCR_ARCHITECTURE.md)
- [Expense, bill, split, and settlement architecture](EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md)
- [Money and rounding architecture](MONEY_ROUNDING_ARCHITECTURE.md)

When those docs and this matrix differ, update the docs/control packet before
runtime work starts. Do not resolve contradictions by quietly choosing behavior
inside implementation code.

## Safety Invariants

Future tests must prove these invariants before non-draft OCR apply can be
treated as implementation-ready:

- Non-draft OCR apply does not directly rewrite active accepted bill data.
- OCR-derived changes create, revise, submit, or block a bill revision according
  to API/domain policy.
- Pending OCR-derived revisions do not mutate balances, settlement candidates,
  settlement request lines, payment records, payment allocations, residuals,
  proof attachments, participant share states, accepted calculation hashes,
  finalized snapshots, balance projections, reports, or active accepted shares.
- Approved/applied OCR-derived revisions recalculate only through API/domain
  money, bill revision, approval, payer-confirmation, settlement-impact, and
  audit boundaries.
- Rejected, cancelled, expired, withdrawn, or superseded revisions leave
  settlement and payment state unchanged except for allowed bounded audit and
  lifecycle status records.
- Financial-impacting OCR changes reset affected participant approvals and
  acknowledgements according to the current revision policy.
- Payer-impacting OCR changes require payer reconfirmation or block/manual
  review where policy cannot safely derive the required payer set.
- Existing settlement candidates tied to old bill or share values become stale,
  blocked, or superseded according to policy. They are not silently retargeted.
- Existing settlement requests, request lines, marked-paid payments, confirmed
  payments, partial payments, disputed payments, residuals, allocations, and
  proof attachments are preserved and not silently rewritten.
- Authorization is decided by current API/domain checks. Clients, generated
  clients, UI route possession, local cache, and hidden controls are not
  authorization sources.
- Audit, logs, fixtures, snapshots, validation output, and examples exclude raw
  OCR text, receipt file bytes, storage internals, tokens, secrets, raw request
  bodies, unrelated sensitive data, and unnecessary payment details.

## Test Matrix

Future tests may split these rows into smaller fixtures, but they must preserve
the expected API/domain result, settlement/payment safety expectation, and audit
expectation.

| Scenario | Initial state | OCR/revision change | Expected API/domain result | Settlement/payment safety expectation | Audit expectation | Future validation/test level | Notes/follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Direct apply to confirmed bill is denied | Bill is `confirmed` with active accepted revision; visible saved OCR review exists. | Client attempts draft-style OCR apply to replace items. | API refuses direct rewrite and returns safe policy problem such as `non_draft_requires_revision`. No active bill fields change. | No settlement candidate, request line, payment, allocation, residual, proof, balance, participant share, or snapshot changes. | Denial records bounded actor, bill, OCR review, file, policy result, correlation ID. No raw OCR text or file bytes. | API integration; domain policy; regression. | Positive proof that draft-only endpoint cannot become a hidden non-draft mutation path. |
| Confirmed bill routes OCR item money change to revision proposal | Confirmed bill with no settlement state and no active pending revision. | OCR changes item total, tax, fee, discount, or quantity. | API creates or submits a pending revision with normalized snapshot, calculation hash, affected participants, and required review state. Active accepted bill remains unchanged until apply. | Candidate projections may be previewed as revision impact only; no persisted settlement/payment objects change while pending. | Proposal creation and financial-impact classification audited with bounded category counts and policy versions. | Domain service; API integration; money regression; audit. | Future implementation can choose create-only or submit-for-review command, but active truth stays stable. |
| Pending-confirmation bill preserves submitted truth | Bill is `pending_confirmation` with participant approvals in progress. | OCR changes merchant, amount, split, or payer data. | API creates or revises a formal revision. Existing submitted bill truth remains current review basis until revision lifecycle advances. | Existing pending participant/share states on active submitted bill are not silently overwritten by OCR revision state. | OCR-to-revision handoff and affected approval reset decision are audited. | API integration; domain lifecycle. | Applies to submitted shared bills before final confirmation. |
| Finalized or locked bill blocks ordinary OCR revision | Bill is `finalized` or in a locked period. | OCR proposes any accepted-fact change. | API returns blocked/manual-review policy result such as `blocked_until_lock_or_settlement_policy`; no proposal applies. | Settlement/payment history remains untouched. Any readable proposal is marked blocked and cannot apply. | Blocked lock/final state event records reason category only. | Domain policy; API negative. | Future lock/reopen policy must be separately reviewed before changing this expectation. |
| Archived or cancelled bill blocks by default | Bill is `archived` or `cancelled`. | OCR proposes item, payer, attachment, or metadata change. | API denies ordinary OCR-to-revision routing unless a future restore/unarchive policy explicitly allows it. | No stale settlement retargeting, balance recalculation, or payment/proof mutation. | Denial audited with status and policy family. | Domain policy; API negative. | Archive visibility is not edit authority. |
| Active pending revision conflict | Non-draft bill already has one active pending official revision. | OCR attempts to create another independent pending revision. | API returns conflict or revises/supersedes the pending revision only if expected pending revision/version is supplied and policy allows. | Settlement candidates remain tied to active accepted truth or become read-only stale preview data; no persisted settlement mutation. | Active pending conflict or supersession audited with prior/replacement revision IDs where safe. | API integration; concurrency; audit. | Day 1 one-active-pending rule must be visible in tests. |
| Stale OCR review fails closed | Saved OCR review has changed, was removed, or no longer matches expected version/timestamp. | Client submits stale OCR review ID/version. | API returns stale OCR review problem. No revision is created, revised, submitted, or applied. | No settlement/payment or bill snapshot changes. | Stale source denial audited with expected/current version category, not raw OCR payload. | API integration; stale/concurrency. | Includes late worker result and duplicated client retry cases. |
| Stale bill or active revision fails closed | Bill active accepted revision, bill version, calculation hash, or pending revision changed after preview. | Client submits OCR-to-revision command using old expected basis. | API returns stale bill/revision/calculation mismatch. It does not merge OCR output into newer bill truth. | Existing candidates/requests/payments remain unchanged and not silently retargeted to new values. | Stale basis denial audited with operation and stale category. | API integration; optimistic concurrency. | Prevents archaeological merge behavior from stale previews. |
| Idempotent retry returns same result | Same authenticated actor retries same command with same idempotency key, OCR source, bill basis, and body hash. | Network retry after successful proposal creation. | API returns same revision result without creating duplicate revision, duplicate audit success, or duplicated notification-equivalent side effects beyond safe retry metadata. | No duplicated settlement candidates, request lines, payments, residuals, or proof links. | Idempotent replay is either linked to original audit/correlation or records bounded replay metadata. | API integration; idempotency. | Reusing the key with changed body/source/basis must conflict. |
| Financial OCR amount change resets affected participants | Confirmed or pending-confirmation bill; participants previously accepted active truth. | OCR changes item price, quantity, tax, fee, discount, total, currency, split, participant inclusion, or rounding residual basis. | Proposed revision marks participants whose amount, currency, split basis, inclusion, calculation hash, settlement basis, or evidence visibility changed as `pending_acceptance`. | Active accepted participant states remain unchanged until revision applies. Pending state does not change balances. | Affected-user recalculation audited with affected count and category, not unbounded line text. | Domain service; money unit tests; API integration. | If snapshot detail is insufficient, tests expect affected-all or blocked unsupported-detail result. |
| Non-financial OCR metadata change avoids unnecessary reapproval | Confirmed bill with no settlement state and safe metadata-only change. | OCR corrects merchant display text or category label without changing receipt identity, duplicate detection, reconciliation, reporting, money, payer, participant, or visibility basis. | API creates auditable no-reapproval or visible revision state according to policy; no participant reset or payer reconfirmation required. | No settlement/payment mutation. Existing candidates remain valid unless policy says metadata affects eligibility. | Metadata-only proposal/audit records bounded category and no raw OCR text. | Domain service; API positive. | Positive case proving matrix is not "block everything"; server derives category, not client labels. |
| Unsupported detailed diff blocks narrow affected set | Current snapshot lacks item/split/adjustment/OCR detail needed to identify affected users safely. | OCR proposes detailed item/split change. | API treats all possibly affected participants as affected or blocks with unsupported-detail policy reason. | No settlement/payment mutation while unsupported. | Unsupported-detail decision audited with category and source references only. | Domain unit; API negative. | Protects against incomplete snapshot data narrowing approvals incorrectly. |
| Payer changed by non-payer requires reconfirmation | Bill has confirmed paid-by user or multi-payer contributions. | OCR changes paid-by role, payer amount, payer contribution allocation, payer currency, or payer-side responsibility. | Proposed revision requires payer reconfirmation from each affected payer before apply; participant approvals are also required when their obligations change. | No settlement candidate debtor/creditor direction changes while pending. | Payer reconfirmation requirement audited separately from participant approval. | Domain service; API integration; audit. | Same actor may satisfy both roles, but tests must assert distinct meanings. |
| Display-only payment method correction does not force payer reconfirmation | Bill has payment-method hint that is not payer responsibility or reconciliation truth. | OCR corrects a display label only. | API may classify no payer reconfirmation required when policy proves no payer responsibility, settlement basis, visibility, or reconciliation truth changed. | No settlement/payment mutation. | Audit states payment-method metadata category without sensitive payment detail. | Domain service; API positive. | Keeps payer reconfirmation scoped to responsibility changes. |
| Payer confirmation basis mismatch fails | Revision requires payer reconfirmation. | Payer submits confirmation for stale calculation hash, stale contribution set, superseded revision, or wrong payer profile. | API rejects confirmation; revision remains pending/blocked. | No settlement/payment mutation or apply. | Denial audited with payer impact category and stale/wrong-actor reason. | API integration; authz; stale. | Confirmation hash is not authorization. |
| All approvals and payer confirmations apply with no settlement state | Confirmed bill has no settlement candidates/requests/payments/proofs and no lock. All required participants and payers approved current revision basis. | OCR-derived revision changes money and payer facts. | API applies revision only through bill revision and money services, creates new accepted truth/version, preserves prior accepted truth, and uses centralized decimal/currency/rounding policy. | Settlement projections may derive from new accepted truth after apply, but no pre-existing settlement request/payment/proof rows are rewritten because none existed. | Apply success audited with revision ID, policy version, calculation hash category, affected counts, payer counts, and safe correlation. | Domain service; API integration; money regression; audit. | This is the primary positive apply case. |
| Apply blocked by requested settlement | Active accepted bill has settlement candidate selected into a `requested` settlement request or request line. | OCR-derived revision is fully approved and payer-confirmed. | API blocks apply until explicit invalidation/reopen/adjustment workflow exists. | Existing request and request lines are preserved with original amounts/currency/bill-share basis; no silent retarget. Candidate may be marked stale/blocked/superseded by policy only through explicit state. | Settlement policy block audited with impact category and safe request/line references where authorized. | API integration; settlement projection; audit. | Acceptance proof for no silent settlement mutation. |
| Apply blocked by marked-paid or partial payment | Settlement payment is `marked_paid`, partial, underpaid/overpaid with pending residual, or has allocations against request lines. | OCR revision changes amount, payer, participant, or split basis. | API blocks apply pending explicit reviewed correction policy. | Payment, allocations, residuals, request lines, and balance projection inputs remain unchanged. | Blocked payment/progress impact audited with bounded IDs/categories. | API integration; settlement/payment regression. | Covers partial payment and residual safety. |
| Apply blocked by confirmed payment | Settlement payment is receiver-confirmed or settlement line is cleared. | OCR revision changes bill/share values. | API blocks ordinary apply until future adjustment/reopen/refund/waiver/credit policy exists. | Confirmed payments and cleared request lines are preserved exactly; no automatic refund, credit, balance write, or reopen. | Progressed settlement block audited. | API integration; money regression. | Broad settlement reopen policy is a non-goal here. |
| Disputed payment/request remains preserved | Settlement request or payment is disputed. | OCR revision attempts to apply corrected bill amount. | API blocks or returns manual-review state. | Dispute status, notes/proof references, allocations, and residuals remain unchanged. | Manual-review/block reason audited without raw dispute notes unless bounded by audit policy. | API integration; settlement negative. | Prevents OCR from overriding dispute process. |
| Cancelled settlement with history remains preserved | Settlement request/payment was cancelled but has historical lines, allocations, residuals, or proof records. | OCR revision changes bill/share basis. | API blocks or requires manual-review policy before apply. | Cancelled-with-history records are not deleted, rewritten, or used as active new lines silently. | Historical settlement impact classification audited. | Domain policy; API negative. | Cancellation is history, not permission to mutate old rows. |
| Settlement candidate stale handling | Existing settlement candidate was computed from old bill/share values but not yet selected into a request. | OCR revision is pending or applied. | While pending, candidate remains tied to active accepted truth and may be shown as stale/blocked preview only. After apply, future candidate preview derives anew from accepted truth through settlement projection policy. | Existing persisted request/payment tables remain unchanged. No silent candidate retargeting to revision values. | Stale candidate classification audited when persisted or policy-relevant. | Settlement projection tests; API integration. | If candidates are ephemeral, tests assert no writes and correct preview state. |
| Proof attachments are preserved | Settlement payment has proof attachment files. | OCR revision changes amount/payer/share basis. | API blocks apply when proof-backed progressed state exists unless future policy explicitly handles it. | Proof attachment file IDs, lifecycle rows, content access rules, and storage bytes remain unchanged. No proof copied to revision. | Audit references proof impact category or bounded proof IDs only where safe; no storage internals. | API integration; storage/privacy regression; audit. | File bytes remain under storage abstraction. |
| Rejection leaves downstream state unchanged | Pending OCR-derived revision exists with no apply. | Affected participant rejects revision. | Revision moves to rejected/terminal state with bounded reason category. Active bill truth remains unchanged. | Candidates, requests, lines, payments, allocations, residuals, proofs, balances, and participant active accepted states remain unchanged. | Rejection audited with actor, revision, reason category, no unbounded notes. | API integration; lifecycle; audit. | Rejected approvals cannot carry to later revision. |
| Cancellation, withdrawal, or expiration leaves downstream state unchanged | Pending OCR-derived revision exists. | Proposer withdraws, system expires, or authorized actor cancels. | Revision becomes withdrawn/cancelled/expired/superseded according to policy. Active bill truth remains unchanged. | No settlement/payment mutation except allowed stale preview/status records if explicitly modeled. | Lifecycle transition audited with bounded reason/category. | Domain lifecycle; API integration. | Use status names from runtime if they differ from planning names. |
| Apply failure is atomic | Apply command starts after approvals but money validation, stale settlement check, storage visibility, or authorization fails. | OCR-derived revision would change active truth. | Transaction fails closed; revision may remain approved_pending_apply or blocked according to policy. No partial active-bill write. | No partial settlement/payment/candidate/proof/allocation/residual mutation. | Failure audited with policy family and correlation ID, no raw body. | API integration; transaction/atomicity; audit. | Future tests should inspect persisted state after failure. |
| Unauthorized viewer cannot create or apply OCR revision | Actor is not bill participant, group member, authorized editor/proposer, payer, or allowed reviewer. | Actor uses route IDs or cached/generated client to submit OCR-to-revision command. | API returns safe not-found/forbidden problem without leaking unrelated bill, OCR review, file, settlement, or revision existence. | No mutation anywhere. | Authorization denial audited where policy records denials, with bounded subject categories. | API authz integration; negative. | Clients cannot decide auth from route possession or hidden UI. |
| Removed group member cannot approve or inspect restricted impact | Actor previously had access but was removed or inactive. | Actor attempts approve, payer-confirm, apply, or settlement-impact read. | API fails closed and does not rely on cached group membership. | No settlement/payment mutation or impact leakage. | Denial audited with removed/inactive membership category where safe. | API authz; stale membership. | Covers current-actor authorization boundary. |
| File visibility denial blocks OCR source use | Receipt attachment file or OCR review is not visible to actor or no longer active. | Actor attempts OCR-to-revision route. | API denies source use or blocks revision with `file_reference_not_visible`/equivalent safe problem. | No bill or settlement mutation. | Storage/file visibility denial audited without object keys, paths, signed URLs, local paths, or bytes. | API integration; storage/privacy. | Stable file IDs are acceptable; storage internals are not. |
| Raw OCR and storage internals excluded from fixtures/logs | Test data includes receipt text, source line text, file IDs, object keys, or storage paths in setup. | Test exercises proposal, approval, rejection, apply, and failure paths. | Responses, audit records, logs, snapshots, and fixtures used for assertions include only bounded safe metadata. | No proof/receipt bytes or storage internals are copied into bill revision or settlement rows. | Redaction assertions cover success and denial paths. | Audit tests; log/snapshot scan; regression. | Use synthetic bounded text, never real receipts or secrets. |
| Worker result cannot mutate bill or settlement directly | Server OCR worker produces success/late/duplicate result event for a non-draft bill. | Worker event carries provisional OCR extraction. | API/domain must validate before any revision exists; worker does not write bill, revision, settlement, file, or audit business truth directly. | No settlement/payment/balance mutation from worker event alone. | Worker/API handoff audit only if API accepts or denies result; no raw OCR text in event logs. | Worker contract tests; API event ingestion tests. | Worker runtime may be future; this row protects authority boundaries. |
| Generated-client availability does not authorize operation | Contract/client contains future OCR-to-revision route. | Client calls route for unauthorized, stale, blocked, finalized, or settlement-impacted bill. | API enforces all policy and returns safe problem responses. | No mutation outside allowed policy. | Denials audited as applicable. | API integration; generated-client contract regression. | Applies only after future OpenAPI/client work. |

## Future Implementation Mapping

This branch does not add tests. Future implementation branches should translate
the matrix into focused suites based on their changed files and risk:

| Future category | Coverage to derive from this matrix |
| --- | --- |
| Domain service tests | Bill-state routing, financial-impact classification, affected participant reset, payer reconfirmation triggers, unsupported-detail fail-safe behavior, stale-basis checks, idempotency, and atomic apply decisions. |
| API integration tests | Authorized and unauthorized create/revise/submit/approve/reject/payer-confirm/apply paths for personal and group bills, safe problem responses, stale versions, active pending conflicts, blocked final/archived/cancelled states, and generated-client availability not implying authorization. |
| Money regression tests | Decimal-safe recalculation with attached currency, centralized rounding, calculation hash binding, affected-user set binding, payer contribution validation, unsupported currency/cross-currency blocks, and deterministic residual handling. |
| Settlement projection tests | Pending revision non-mutation, stale/blocked candidate state, requested request-line block, marked-paid/partial/confirmed/disputed/cancelled settlement blocks, allocation/residual preservation, and no silent balance projection writes. |
| Payment/proof/storage tests | Payment record preservation, allocation/residual preservation, proof attachment lifecycle preservation, receipt/proof file bytes staying behind storage abstraction, file visibility denials, and no storage internals in responses/audit. |
| Audit and redaction tests | Proposal creation, approval, rejection, withdrawal/cancellation/expiration, payer reconfirmation, apply success/failure, stale/blocked settlement dependencies, stale candidate handling, authorization denials, no raw OCR text, no file bytes, no storage paths/object keys, no secrets/tokens, and bounded note/reason metadata. |
| Worker/event tests | OCR worker result events remain provisional and cannot directly mutate bill, revision, settlement, file, storage, or audit business truth. |
| Regression tests | Existing draft-only OCR apply remains draft-only; non-draft routes remain blocked until the reviewed OCR-to-revision implementation is explicitly added. |

Runtime/API/OpenAPI/schema/generated-client branches must choose validation
commands from their actual changed files. Docs-only branches should stay on
docs/control validation.

## Handoffs

- #440 provided the non-draft OCR-to-revision API policy document but remains
  open at the time of this matrix because issue/project metadata still appears
  to require reconciliation before closure.
- #441 owns this non-draft OCR approval, payer, settlement safety, and audit
  coverage matrix.
- #348 remains the broader bill revision roadmap and should stay open until
  child planning, implementation, UI/reference, QA, and merge gates complete.
- #360 remains the broader non-draft OCR parent context and should stay open
  until the non-draft OCR-to-revision workflow is fully implemented and gated.

Future runtime, schema, migration, OpenAPI, generated-client, mobile/web/admin
UI, settlement invalidation, settlement adjustment, settlement reopen, refund,
credit-ledger, OCR worker, storage/privacy, money calculation, and test
implementation tasks remain separately scoped and manually gated.
