# Expenses and Bills Technical Spec

## Purpose

Define implementation boundaries for expenses, shared bills, bill status transitions, bill revisions, correction proposals, attachments, authorization, audit, and persistence.

## Architecture boundaries

- API/domain services own server-mode business writes.
- Clients may preview calculations but API/domain services are authoritative.
- Money calculations must use decimal-safe values with currency attached.
- File bytes go through storage abstraction.
- File metadata belongs in PostgreSQL.
- API responses must not expose physical storage paths.
- Authorization is server-enforced.
- Official financial truth changes through accepted/applied bill revisions, not silent client mutation.

## Domain concepts

Suggested domain areas:

```text
Expenses
Bills
BillRevisions
BillRevisionProposals
BillRevisionApprovals
BillParticipants
BillPayers
BillOwners
Attachments
BillStatusTransitions
BillAudit
```

Suggested service boundaries:

```text
IBillCommandService
IBillQueryService
IBillRevisionService
IBillRevisionProposalService
IBillAffectedParticipantService
IBillAuthorizationService
IBillStatusPolicy
IExpenseAttachmentService
```

## Persistence direction

Future tables may include:

```text
expenses_or_bills
bill_revisions
bill_revision_proposals
bill_revision_approvals
bill_payers
bill_participants
bill_attachments
bill_status_history
bill_comments
bill_co_editors
```

Schema design must preserve historical calculated shares and avoid recomputing old financial truth unexpectedly.

Revision approvals should bind to the revision and calculation state reviewed by the participant.

Suggested approval fields:

```text
id
bill_revision_id
participant_profile_id
accepted_amount
currency
calculation_hash
status
approved_at_utc nullable
rejected_at_utc nullable
created_at_utc
updated_at_utc
```

## Bill responsibility model

Track these concepts separately:

```text
created_by_user_profile_id
bill_owner_user_profile_id
paid_by_user_profile_id / payer contribution rows
co_editor_user_profile_ids optional
```

Rules:

- `created_by` is audit/history.
- `bill_owner` or authorized responsible editor handles normal correction/resubmission.
- `paid_by` confirms payer role and payment facts when created or changed on their behalf.
- A helper/preparer is not automatically responsible for future disputes unless policy makes them a co-editor.

## Revision proposal rules

Day 1 supports one active pending official revision per bill.

Rules:

- Participants may propose corrections on bills they are involved in.
- Proposed corrections create pending revisions rather than mutating the active accepted revision.
- While a pending revision exists, additional users can comment/suggest changes but cannot create another competing active pending revision.
- Proposal creator can withdraw or revise before acceptance/application.
- Revising a submitted proposal supersedes the previous proposal version and invalidates approvals on the superseded proposal.
- Rejected proposal approvals do not carry to the active revision unless the user had already accepted that active revision.
- Official bill state changes only when a pending revision is accepted/applied by policy.

Suggested revision statuses:

```text
draft_revision
submitted_for_review
withdrawn_by_proposer
superseded_by_resubmission
rejected
accepted_applied
cancelled_by_authorized_editor
```

## Affected participant calculation

After each proposed or applied financial edit, the API/domain service must:

1. Recalculate participant shares for the candidate revision.
2. Compare previous accepted revision shares against candidate revision shares per participant.
3. Identify affected participants by amount/currency/share/payment-role change.
4. Reset only affected participants to pending acceptance for the relevant revision.
5. Require paid-by confirmation if payer role, paid amount, payer contribution, or paid-by user's financial share changes.
6. Preserve unaffected accepted participants as accepted.

## Revision review diff context

The API/domain layer owns the authoritative review context for pending bill revisions. Revision responses include a server-generated review context derived from the authenticated actor; generated clients and UI code only transport and render that context.

The review context must include:

- viewer-specific baseline type: no prior baseline, active accepted bill, or safely derivable previous revision approval/rejection
- default view mode, such as `full_bill` for first-review/no-baseline users or `changed_only` when a safe baseline exists
- bounded reason for the view recommendation
- viewer financial impact with decimal-safe amount strings and currency on previous, proposed, and delta money values where applicable
- payer confirmation requirement/status when the viewer is the proposed payer
- bounded change category counts for bill total, participant share, payer contribution, payer role, item, item split, adjustment, attachment/receipt/OCR review, note, and metadata
- stable change IDs, change type/scope, safe field path, before/after display values where available, viewer impact, and accessible marker labels

Clients must not infer authorization, affected users, payer confirmation truth, money impact, or financial truth from raw rows. They render the API-provided full-bill/changing-row highlights and summaries.

Current revision snapshots support aggregate diff categories only: bill total, participant share, payer contribution, and payer role. Item, item-split, adjustment, attachment/receipt/OCR review, note, and metadata categories must be returned as `unsupported_in_current_revision_snapshot` until revision snapshots persist those details. The current schema also does not persist passive "viewed but not approved/rejected" review timestamps, so the API must expose that limitation rather than fabricating a baseline.

The implementation-facing UX gate for rendering, filters, action copy, accessibility, and unsupported-state disclosure is [Bill revision review UX gate](BILL_REVISION_REVIEW_UX.md).

## API direction

Future endpoints may include:

```text
POST /api/v1/bills
GET /api/v1/bills/{id}
PATCH /api/v1/bills/{id}
POST /api/v1/bills/{id}/submit
POST /api/v1/bills/{id}/revisions
PATCH /api/v1/bills/{id}/revisions/{revisionId}
POST /api/v1/bills/{id}/revisions/{revisionId}/submit
POST /api/v1/bills/{id}/revisions/{revisionId}/withdraw
POST /api/v1/bills/{id}/revisions/{revisionId}/approve
POST /api/v1/bills/{id}/revisions/{revisionId}/reject
POST /api/v1/bills/{id}/archive
POST /api/v1/bills/{id}/restore
GET /api/v1/bills
```

OpenAPI must be updated before generated clients.

## Authorization rules

API must verify:

- actor identity and active profile
- bill creator/payer/participant/owner/co-editor relationship
- group membership where relevant
- record visibility policy
- attachment access policy
- proposal create/update/withdraw rights
- revision approve/reject rights
- archive/restore permission

Possessing a bill ID must not imply access.

## Audit requirements

Audit events should cover:

- bill created
- bill submitted
- bill created on behalf of payer
- payer role confirmed/rejected
- bill revision proposed
- bill revision withdrawn
- bill revision superseded/resubmitted
- bill revision approved/rejected
- bill revision applied/cancelled
- financial edit requiring re-approval
- affected participants recalculated
- bill accepted/rejected/disputed/finalized
- bill archived/restored
- attachment added/removed/viewed where policy requires
- denied access where meaningful

Audit metadata must not include raw sensitive file contents.

## Storage behavior

Attachments must use:

- stable file IDs
- provider-neutral object references
- content type and size validation
- lifecycle state
- authorization-aware read/download endpoints

## Validation and tests

Required test categories:

- create personal expense
- create shared bill
- create bill on behalf of another payer requires payer confirmation
- denied create/update without permission
- denied read for unrelated user
- participant can propose correction as pending revision
- second active pending revision rejected while one exists
- proposer can withdraw pending revision
- proposer can revise/resubmit and supersede previous proposal
- approvals on superseded proposal invalidated
- approval bound to revision/calculation hash
- rejected proposal approval does not apply to active revision unless active revision was separately accepted
- financial edit resets affected participants only
- paid-by user re-confirms when payer/payment facts change
- non-financial edit does not reset when allowed
- archive/restore policy
- attachment storage path not exposed
- currency required for all monetary values

Validation commands for implementation branches:

```powershell
dotnet tool restore
dotnet restore
dotnet build
dotnet test
npm run validate:openapi
npm run validate:api
```

## Failure modes

Handle:

- stale bill version
- stale pending revision
- proposal submitted while another pending revision exists
- proposer edits after some approvals exist
- paid-by rejects payer role
- invalid split/currency
- missing payer/participant
- settlement/payment claim exists against an older bill revision
- storage write failure after metadata intent
- attachment virus/content-type rejection later
- archive conflict with settlement state
- database transaction rollback

## Non-goals

- Day 2 lock/refund implementation.
- Direct provider payment mutation.
- Multiple competing active official proposals in Day 1.
- Worker-owned business writes.
- Generated client manual edits.
