# Bill Revision Approval and Payer Reconfirmation Policy

## Purpose

This document defines the design/control policy for Settleora bill revisions that require affected-user approval, payer reconfirmation, acknowledgement reset, rejection, and safe resubmission.

It complements [Bill revision snapshot architecture](BILL_REVISION_SNAPSHOT_ARCHITECTURE.md). The snapshot packet defines how proposed bill facts and review context should be preserved. This policy defines who must review or reconfirm those preserved facts before a revision can become accepted bill truth.

This document is design-only. It does not authorize runtime endpoint changes, domain service implementation, EF model changes, DbContext changes, migrations, model snapshots, OpenAPI edits, generated-client edits, settlement calculation changes, OCR runtime behavior, UI, tests, Docker/CI/deployment changes, secrets, storage byte behavior, or money calculation code.

## Authority Rules

Bill revision approval state is server-mode business truth.

The API/domain layer must be the only authority for:

- financial-impact classification
- affected-user detection
- participant acknowledgement reset
- participant approval and rejection transitions
- payer reconfirmation requirements
- revision submission, supersession, withdrawal, rejection, resubmission, and apply eligibility
- settlement-impact blocking and future explicit invalidation, adjustment, or reopen decisions
- audit event creation and redaction policy

Clients may render server-provided review state, pending/review labels, disabled action hints, and viewer-specific financial-impact summaries. Clients must not decide authorization, financial-impact truth, affected-user lists, payer reconfirmation state, final approval state, settlement truth, or audit truth from local calculations, hidden UI controls, generated client availability, cached group membership, or raw revision rows.

Money-impacting edits require server-authoritative recalculation using decimal-safe values with currency attached and centralized rounding. Settlement and balance effects must not be changed silently by pending revisions or by accepted revisions without an explicit reviewed settlement policy.

## Policy Outcome Names

Future enum names should stay stable and machine-readable. This document uses the following policy outcomes:

```text
creator_only_draft_revision
no_reapproval_required
affected_participants_must_approve
payer_must_reconfirm
affected_participants_and_payer_must_approve
blocked_until_lock_or_settlement_policy
blocked_until_ocr_revision_policy
blocked_until_visibility_or_storage_policy
```

Outcome meanings:

- `creator_only_draft_revision`: the bill is still draft or otherwise safely mutable, no participant approval or payer reconfirmation has been requested, and no downstream financial truth depends on the current facts.
- `no_reapproval_required`: the revision is visible/auditable but does not change financial truth, participant obligations, payer contributions, settlement eligibility, or sensitive visibility.
- `affected_participants_must_approve`: one or more participant shares, currencies, split basis, inclusion state, or review baselines changed. Only affected participants must approve.
- `payer_must_reconfirm`: payer role, payer amount, payer contribution basis, payer-side payment method fact, or payer's own financial share changed in a way that requires paid-by confirmation, but no other participant approval is needed.
- `affected_participants_and_payer_must_approve`: both participant financial approval and payer reconfirmation are required.
- `blocked_until_lock_or_settlement_policy`: the bill has finalized, locked, requested, marked-paid, confirmed, disputed, residual, proof, balance, or other downstream state that requires a separate reviewed policy before apply.
- `blocked_until_ocr_revision_policy`: a non-draft OCR-derived change would affect authoritative bill truth and must wait for #440/#441 policy and coverage.
- `blocked_until_visibility_or_storage_policy`: a file, attachment, receipt, proof, or privacy change affects who can see sensitive content or how protected content is handled, and must wait for reviewed storage/privacy authorization rules.

These outcome names are planning names only. Do not add them to OpenAPI in this branch.

## Financial Impact Definition

A revision is financially impactful when the proposed normalized snapshot can change any current or future owed amount, payer contribution, settlement candidate, settlement request line, balance projection, reporting total, currency basis, rounding residual, tax/discount allocation, participant inclusion, participant share state, payer state, or accepted calculation hash.

Financially impactful changes include:

- total amount, subtotal, tax, service charge, discount, fee, credit, refund, manual adjustment, or receipt-total reconciliation changes
- currency changes, including manual FX snapshot changes that alter participant shares or settlement amounts
- item add, edit, delete, quantity change, price change, tax group change, fee/discount/tender reclassification, or item reassignment
- split method, share amount, ratio, percentage, weight, exact amount, quantity claim, default exclusion, manual inclusion, or residual allocation changes
- participant add, remove, default-exclude, include, or identity/linkage changes
- payer add, remove, payer amount change, paid-by role change, multi-payer contribution change, or payer contribution currency change
- payment method changes when the payment method is tied to payer confirmation, reconciliation meaning, or payer-side responsibility rather than a display-only note
- receipt/proof/attachment changes when the attachment is used as evidence for amount, payer, participant, settlement, OCR-derived facts, or visibility-sensitive review
- non-draft OCR-derived changes that propose modifying accepted/pending shared bill facts
- any revision after settlement state exists, even if the proposed amount delta appears small

Non-financial edits may still require audit and authorization. They do not require reapproval when they cannot change money, settlement, payer responsibility, participant inclusion, accepted calculation hash, sensitive visibility, or review baseline.

## Actor Responsibility Model

```text
creator / proposer
affected participant
payer / paid-by user
group role
server policy
```

- `creator / proposer`: may propose, revise, withdraw, and resubmit revisions where authorization allows. The creator does not approve on behalf of other affected users or payers.
- `affected participant`: approves or rejects changes to their own share, currency, inclusion, split basis, item assignment, or financial review baseline. A participant may be affected even if their amount decreases because their accepted calculation hash and settlement eligibility changed.
- `payer / paid-by user`: reconfirms payer role, payer amount, payer contribution, multi-payer allocation, and payer-side facts when those facts are created or changed on their behalf.
- `group role`: may grant propose/edit/admin visibility rights according to group policy, but group role alone must not override participant approval, payer reconfirmation, settlement blocks, or file visibility checks.
- `server policy`: computes the authoritative outcome, affected-user set, payer confirmation set, blocked state, stale-version checks, calculation hash, and audit records.

Admin or owner roles do not imply unilateral authority to change another user's financial acknowledgement or payer confirmation by default. Any future override must be separately designed, permissioned, and audited.

## Revision Category Matrix

| Revision category | Financial impact default | Affected users | Required outcome |
| --- | --- | --- | --- |
| Merchant display cleanup | No, unless tied to receipt identity, duplicate detection, reconciliation, or reporting policy that affects settlement | Viewers only | `no_reapproval_required` |
| Category, tag, note, comment metadata | No, unless visibility or reporting policy changes financial state | Viewers who can see the metadata | `no_reapproval_required` |
| Unbounded note or sensitive comment visibility change | Not money by itself, but privacy-sensitive | Users whose visibility changes | `blocked_until_visibility_or_storage_policy` until visibility rules are reviewed |
| Bill date | Usually no, but financial if period locks, settlement eligibility, FX/tax policy, recurring/reporting authority, or reconciliation depends on it | Users whose obligations or reports change | `affected_participants_must_approve` or `blocked_until_lock_or_settlement_policy` |
| Currency | Yes | All participants with shares and all payers with contributions | `affected_participants_and_payer_must_approve` |
| Payment method hint | No if display-only reconciliation hint | Payer/viewers only | `no_reapproval_required` |
| Payment method tied to payer responsibility or paid-by confirmation | Yes for payer-side responsibility | Changed payer(s) | `payer_must_reconfirm` |
| Total, subtotal, tax, service, discount, fee, adjustment | Yes | Participants whose resolved shares or calculation hash changes; payers if payer contribution or payer share changes | `affected_participants_and_payer_must_approve` when payer side changes, otherwise `affected_participants_must_approve` |
| Line item add/edit/delete | Yes when item total, tax, assignment, share, or receipt reconciliation changes | Participants assigned to the item before or after, plus participants whose allocated adjustments or rounding residuals change | `affected_participants_must_approve` |
| Line item reassignment | Yes | Previous assignees, new assignees, and anyone whose allocated adjustment/residual changes | `affected_participants_must_approve` |
| Split method/share amount/ratio/percentage/quantity | Yes | Participants whose basis, share, currency, residual, or calculation hash changes | `affected_participants_must_approve` |
| Participant added | Yes | New participant and participants whose shares change | `affected_participants_must_approve` |
| Participant removed/default-excluded/manual inclusion | Yes | Removed/excluded/included participant and participants whose shares change | `affected_participants_must_approve` |
| Payer added | Yes | New payer; affected participants if net obligations or settlement candidates change | `affected_participants_and_payer_must_approve` |
| Payer removed | Yes | Removed payer; affected participants if obligations or settlement candidates change | `affected_participants_and_payer_must_approve` |
| Payer amount or multi-payer contribution changed | Yes | Changed payer(s), affected participants, and any payer whose contribution allocation changes | `affected_participants_and_payer_must_approve` |
| Receipt/proof/supporting attachment added | Usually non-money if evidence only; financial if used to justify OCR, amount, payer, split, or settlement facts | Users with changed visibility or financial basis | `no_reapproval_required`, `affected_participants_must_approve`, or `blocked_until_visibility_or_storage_policy` depending on impact |
| Receipt/proof/supporting attachment removed/replaced | Potentially financial and privacy-sensitive | Users who relied on the evidence or whose visibility changes | `affected_participants_must_approve` or `blocked_until_visibility_or_storage_policy` |
| OCR-derived draft change | Draft-only when safe | Creator/proposer only | `creator_only_draft_revision` |
| OCR-derived non-draft change | Potentially financial | Determined by resulting revision | `blocked_until_ocr_revision_policy` until #440/#441 define the flow |
| Revision after requested/marked-paid/confirmed settlement | Financial settlement impact | Participants, payers, debtors, creditors, settlement actors | `blocked_until_lock_or_settlement_policy` |
| Revision after finalized/locked bill state | Financial or governance impact | Participants, payers, lock owners, settlement actors | `blocked_until_lock_or_settlement_policy` |

The matrix gives defaults. The API/domain service must compute the final outcome from normalized current and proposed snapshots, not from client-submitted category labels.

## Affected Participant Rules

A participant is affected when any of the following changes between the selected baseline and the proposed revision:

- the participant is added, removed, included, excluded, linked, unlinked, or reassigned
- their resolved share amount or currency changes
- their split basis changes, even if the rounded final amount is unchanged
- their item assignment, item quantity, item tax group, discount/fee allocation, or rounding residual source changes
- their accepted calculation hash changes
- their settlement candidate, debtor/creditor direction, or outstanding line basis changes
- their visibility into evidence required for approval changes
- their previous approval would no longer bind to the exact revision ID, accepted amount, currency, affected-user set, and calculation hash

Affected participants return to:

```text
pending_acceptance
```

for the proposed revision, unless the bill remains `draft` under `creator_only_draft_revision` or apply is blocked before participant approval is meaningful.

Participants who are not affected keep their active accepted state for the active accepted bill truth. They do not need to approve a pending revision merely because another participant's share changed, unless their own calculation hash, settlement basis, visibility, or obligation changes.

When the system cannot safely determine whether a participant is affected because the snapshot lacks detail, the safe default is to treat the participant as affected or block apply with an unsupported-detail policy reason. The API must not guess a narrower affected set from incomplete data.

## Payer Reconfirmation Rules

Payer reconfirmation is required when a revision changes payer-side facts or creates payer responsibility on behalf of a user.

A payer must reconfirm when:

- the payer is added to the bill
- the payer is removed from the bill
- the payer amount, currency, or contribution allocation changes
- the paid-by role changes
- a multi-payer bill changes contribution proportions, ordering, or residual assignment
- the payer's own participant share changes in a way that changes their net position
- a payment method fact changes from display-only metadata into payer responsibility or reconciliation authority
- the revision is created by someone other than the payer and changes payer facts on the payer's behalf
- a previous payer confirmation is tied to a superseded revision ID or calculation hash

Payer reconfirmation is not required for a display-only payment method label correction when server policy proves it does not change payer responsibility, settlement candidate derivation, payment details visibility, or reconciliation truth.

Payer confirmation should bind to:

```text
expense_bill_revision_id
calculation_hash
payer_profile_id
payer_amount
currency
payer_contribution_set_hash
confirmed_at_utc
confirmed_by_user_profile_id
```

The confirmation hash is not a secret and must not be used as authorization. It is a stale-basis guard.

## Multi-Payer Bills

Multi-payer bills require separate payer-side evaluation for each payer row and for the contribution set as a whole.

Rules:

- Adding a payer requires confirmation from the added payer.
- Removing a payer requires confirmation from the removed payer when the removal changes historical paid-by responsibility, and affected participants must approve any share or settlement impact.
- Changing one payer's amount requires reconfirmation from that payer and any other payer whose contribution amount, residual, or net settlement position changes.
- Changing contribution allocation without changing the bill total may still require participant approval because net debtor/creditor positions and settlement candidates can change.
- If a payer is also a participant, payer reconfirmation and participant approval are separate gates. The same actor may satisfy both, but the audit trail must record distinct action categories or a combined action that clearly binds both meanings.
- If a creator proposes a bill on behalf of another paid-by user, the paid-by user must reconfirm before the revision can apply unless policy proves the payer facts are unchanged and already confirmed for the same revision basis.

The API/domain layer must validate that payer contributions sum to the authoritative total under the current currency and rounding policy. It must reject or block revisions that produce unsupported negative contributions, currency mismatch, or unallocated payer residuals.

## Revision State Interaction

Recommended revision statuses:

```text
draft
submitted
partially_approved
rejected
withdrawn
superseded
approved_pending_payer
approved_pending_apply
applied
blocked
cancelled
```

State rules:

- A draft revision can be edited by the proposer where authorization allows. Draft edits do not request participant approval.
- Submitting a revision materializes the server snapshot, calculation hash, affected participant set, payer confirmation set, policy outcome, and review context.
- Approvals and payer confirmations bind to the submitted revision ID and calculation hash.
- Revising a submitted proposal creates or records a new revision version and supersedes the prior submitted version. Prior approvals and payer confirmations do not carry forward unless the API can prove the same actor, same role, same amount/currency, same affected-user set, same payer contribution set, and same calculation hash. The safe Day 1 default is no carry-forward across superseded revisions.
- Rejection moves the revision to `rejected` and records the rejecting actor, bounded reason category, and safe note summary where allowed.
- Resubmission after rejection must create a new submitted revision version or explicitly mark the previous version as superseded. Rejected-version approvals and confirmations must not become active on resubmission.
- Withdrawal by the proposer moves the current pending revision to `withdrawn` and leaves active accepted bill truth unchanged.
- Applying a revision requires all required affected participant approvals, all required payer reconfirmations, no stale-basis mismatch, no superseded status, no settlement/lock block, and current authorization.
- Pending revisions are not settlement truth and must not mutate settlement requests, payments, allocations, residuals, proof records, balance projections, reports, or active accepted bill shares.

## Bill Status Interaction

Policy by bill status:

- `draft`: creator/editor may make `creator_only_draft_revision` changes if no participant approval, payer confirmation, or downstream state exists.
- `pending_confirmation`: money-impacting revisions reset affected participants to pending for the revision and may require payer reconfirmation.
- `confirmed`: money-impacting revisions must go through formal submitted revision review. Active confirmed truth remains stable until apply.
- `rejected` or `disputed`: creator/proposer may revise and resubmit where policy allows. Prior rejection reason remains auditable. A resubmitted revision must get fresh required approvals/confirmations.
- `finalized`: ordinary revisions are blocked unless a later lock/reopen/governance policy explicitly allows them.
- `archived`: archive visibility does not authorize hidden financial mutation. Unarchive or edit eligibility must be separate policy.
- `cancelled`: no ordinary revision should apply to cancelled truth unless a future restore/reopen policy defines it.

## Non-Financial Edit Rules

Non-financial edits should avoid unnecessary reapproval when they are bounded, authorized, and do not change money, payer responsibility, participant inclusion, settlement basis, sensitive visibility, or calculation hash.

Examples that usually map to `no_reapproval_required`:

- merchant spelling cleanup
- category or tag change
- bounded note correction visible to the same audience
- comment add/edit that does not change bill facts
- display-only payment method hint correction
- attachment safe metadata correction that does not change file bytes, visibility, evidence category, OCR source, or approval basis

Even when no reapproval is needed, the API may still need audit for business records, storage access, file lifecycle, privacy-sensitive metadata, or policy-sensitive edits.

If a non-financial edit changes who can see a receipt, supporting attachment, note, OCR-derived text, or proof file, it is not a simple no-reapproval edit. It must pass file-subject authorization and may be `blocked_until_visibility_or_storage_policy`.

## Attachments, Receipts, Proof, and Privacy

Attachments are referenced by stable file IDs and safe metadata only. Revision snapshots and audit must not copy file bytes, storage paths, provider object keys, provider URLs, signed URLs, thumbnails, raw OCR full text, raw local device paths, or storage internals.

Attachment policy:

- Adding a supporting attachment as evidence may be `no_reapproval_required` if it does not change financial facts or visibility beyond already authorized reviewers.
- Adding, removing, or replacing a receipt that changes OCR-derived candidate facts, receipt-total reconciliation, tax/fee/discount evidence, payer proof, or participant review evidence is potentially financially impactful.
- Removing evidence after participants accepted may require affected participants to review again if the evidence was part of their review basis.
- Proof files tied to settlement are settlement records, not ordinary bill attachments. Bill revision policy must not mutate settlement proof references directly.
- File access remains subject-specific and API-authorized. Possession of a file ID, revision ID, bill ID, group ID, or generated client method is not authorization.

## OCR Handoff

Current OCR apply is draft-only or draft-like. Non-draft OCR-derived changes must not directly rewrite active shared bill truth.

Policy for this branch:

- OCR-derived edits to draft-safe bills may remain `creator_only_draft_revision` when current draft apply policy allows.
- OCR-derived edits to non-draft, pending, confirmed, rejected, disputed, finalized, or settlement-impacted bills are `blocked_until_ocr_revision_policy`.
- #440 must define the future API policy for converting saved OCR review changes into formal bill revisions.
- #441 must cover approval reset, payer reconfirmation, settlement safety, and audit tests for that future non-draft OCR path.

## Settlement and Lock Handoff

Settlement state must be protected from silent revision effects.

Rules:

- Pending revisions do not change active settlement candidates, settlement request lines, settlement payments, allocations, residuals, proof records, balance projections, or reports.
- A revision apply is blocked when requested, partially paid, marked-paid, confirmed, disputed, cancelled-with-history, residual, allocation, proof, or balance-impact state exists unless a separate settlement-impact policy explicitly permits invalidation, reopen, adjustment, or bounded recalculation.
- Partial settlement, marked-paid claims, receiver confirmations, residual confirmations, and proof attachments make the revision `blocked_until_lock_or_settlement_policy` by default.
- Finalized or locked bill periods also block ordinary apply until a lock/reopen/governance policy is approved.

Issue #426 owns settlement-impact and audit test coverage for these rules.

## API and Domain Service Enforcement Direction

Future implementation should keep endpoint handlers thin and place this policy in API/domain services.

Candidate service responsibilities:

- load current active accepted bill snapshot and proposed revision snapshot
- normalize and recalculate money through centralized decimal-safe services
- compute financial-impact categories
- compute affected participant set and payer confirmation set
- assign one policy outcome
- materialize review context and limitations
- enforce stale bill version, stale revision version, and calculation-hash checks
- enforce one-active-pending official revision in Day 1
- block unsupported OCR, settlement, lock, storage, or visibility states
- persist approval, rejection, payer confirmation, supersession, withdrawal, and apply transitions
- emit bounded audit records

Mutation commands should carry expected bill/revision version or ETag-style guards. Apply must re-run authorization, recalculation, affected-user, payer confirmation, settlement-impact, and stale-version checks at write time. The server must reject stale approvals, stale payer confirmations, superseded revisions, calculation-hash mismatches, unsupported currency, invalid rounding/allocation results, hidden file references, and unauthorized actor actions.

OpenAPI remains the source of truth when this policy becomes runtime contract work, but this branch does not edit OpenAPI. Generated clients are transport helpers only and must not be hand-edited.

## Audit and Redaction Requirements

Audit should cover:

- revision drafted, submitted, revised, withdrawn, superseded, rejected, resubmitted, approved, payer-confirmed, applied, blocked, and denied
- affected-user and payer-confirmation recalculation
- acknowledgement reset
- settlement-impact classification at submit and apply time where useful
- stale-version, calculation-hash mismatch, approval-missing, payer-confirmation-missing, settlement-blocked, OCR-policy-blocked, storage/visibility-blocked, and authorization-denied outcomes

Safe audit metadata may include:

- actor ID
- bill ID
- revision ID
- previous/current revision IDs
- status and outcome category
- policy versions
- money policy and rounding policy versions
- bounded amount/currency values where allowed
- affected participant count
- payer confirmation count
- settlement-impact category
- reason category
- request/correlation ID

Audit, logs, reports, examples, and validation output must avoid:

- secrets, tokens, credentials, recovery codes, session tokens, provider tokens, or raw auth material
- raw request bodies or full response bodies
- file bytes, thumbnails, storage paths, provider object keys, provider URLs, signed URLs, local device paths, or storage internals
- raw OCR full text or unnecessary OCR text
- unbounded notes/comments
- sensitive payment details or payment secrets
- unrelated user financial data
- vault keys or protected private-vault material

## Handoffs

- #348 remains the parent bill revision roadmap and should stay open until the child design, implementation, UI/reference, QA, and merge-gate work is complete.
- #423 provided the merged snapshot design packet that this policy relies on.
- #426 should add settlement-impact and audit test coverage for pending revisions, accepted/applied revisions, payer reconfirmation, no silent balance mutation, and blocked settlement states.
- #440 should define non-draft OCR-to-revision API policy, including eligibility, stale checks, preview-to-revision flow, blocked cases, OpenAPI impact, and audit.
- #441 should define non-draft OCR approval, payer, settlement safety, and audit coverage for the #440 path.
- Future runtime tasks must separately gate schema/migration design, OpenAPI changes, generated-client refresh, API/domain services, tests, mobile/web review UI, and any settlement reopen/adjustment behavior.

## Non-Goals

This policy does not implement or authorize:

- API endpoints, handlers, or runtime domain services
- EF/domain model changes, DbContext changes, migrations, or model snapshots
- OpenAPI paths or schemas
- generated client changes
- mobile, web, admin, Figma, or design files
- OCR runtime, OCR worker behavior, or non-draft OCR apply behavior
- settlement recalculation runtime, balance mutation, reopen, refund, credit-ledger, or adjustment workflows
- storage/file-byte behavior
- Docker, CI, deployment, environment, or secret changes
- money calculation code
