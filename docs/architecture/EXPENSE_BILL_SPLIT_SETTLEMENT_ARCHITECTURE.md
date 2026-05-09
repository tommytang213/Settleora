# Expense, Bill, Split, and Settlement Architecture

## Purpose

This document is the Day 1 design gate for Settleora's core expense, bill, split, settlement, and balance workflows.

It established the gate after the internal money, rounding, and allocation foundation and before expense, bill, settlement, balance, recurring, reconciliation, API, OpenAPI, generated-client, or migration implementation started. Future branches should use this document to keep financial state-machine work small, reviewable, server-authoritative, and auditable.

## Current State

The current repository state is:

- Auth, current-user, session, current-actor, and server-side authorization foundations exist.
- Group foundation and group member management endpoints exist for registered users.
- Payment details and payment QR file metadata linkage foundations exist.
- File metadata lifecycle foundation exists, but no generic public upload/download API exists yet.
- Internal money, rounding, validation, and allocation foundations exist under the API project, including `MoneyAmount`, `CurrencyCode`, `MoneyRoundingService`, and `MoneyAllocationService`.
- EF Core migrations now define schema-only expense/bill foundation tables: `expense_bills`, `expense_bill_items`, `expense_bill_item_splits`, `expense_bill_participants`, `expense_bill_payers`, `expense_bill_adjustments`, and `expense_bill_attachments`.
- EF Core migrations now define schema-only settlement foundation tables: `settlement_requests`, `settlement_payments`, and `settlement_proof_attachments`.
- An internal bill calculation/split service exists for same-currency draft/pending calculations, including item split resolution, participant share aggregation, equal/proportional adjustment allocation, manual-adjustment rejection, and payer contribution validation.
- Public personal bill create/list/get endpoints exist at `POST /api/v1/bills`, `GET /api/v1/bills`, and `GET /api/v1/bills/{billId}`.
- Public group-scoped group bill create/list/get endpoints exist at `POST /api/v1/groups/{groupId}/bills`, `GET /api/v1/groups/{groupId}/bills`, and `GET /api/v1/groups/{groupId}/bills/{billId}`.
- Public bill submit, participant accept, participant reject, and bill confirmed workflow endpoints exist.
- No public bill edit, settlement proof, balance, recurring, reconciliation, receipt upload/download, OCR, or bill-related notification endpoints exist yet.
- Personal and group bill create/read, bill workflow, settlement candidate preview, settlement request creation, settlement request list/get, settlement payment list/get, settlement payment claim, settlement payment confirmation, settlement dispute, and settlement cancellation OpenAPI paths and generated clients exist. No settlement proof, balance, recurring, reconciliation, receipt upload/download, OCR, or bill-related notification OpenAPI paths exist yet.
- Settlement persistence schema exists for request roots, payment claims, and proof attachment file references. Candidate preview, first settlement request creation runtime, read-only current-actor settlement request list/get endpoints, read-only settlement payment list/get endpoints, debtor-authored same-currency full/partial payment claim endpoints, receiver-authored payment confirmation endpoints, bounded request/payment dispute endpoints, and guarded request/payment cancellation endpoints exist for confirmed personal/group bill candidates. Settlement proof bytes, balance, recurring bill, and reconciliation migrations do not exist yet.
- [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md) now defines the design gate for request creation, payment claims, receiver confirmation, dispute, cancellation, proof linkage, audit, and rebuildable balance projections across narrow endpoint slices.

Existing payment details are payment instructions and optional QR linkage only. They are not settlement records, payment confirmations, balances, or proof that money moved.

## Authority Model

Settleora follows the authority boundaries in `PROGRAM_ARCHITECTURE.md`:

- The ASP.NET Core API owns server-mode core business writes.
- API/domain services own money calculations, split resolution, settlement balance calculation, status transitions, authorization, audit, and policy.
- Clients may preview totals, shares, and settlement suggestions for usability, but clients must not authoritatively calculate participant shares, settlement balances, residual assignment, payment state, or bill state.
- Workers must not directly mutate expense, bill, split, settlement, balance, payment, file-subject, or audit tables.
- OCR-derived data remains provisional until API validation accepts money, currency, ownership, permissions, and policy.
- The API must validate any worker or client output before it affects core financial state.

## Day 1 Domain Boundaries

Future implementation should keep these concepts separate, even if the first schema slice chooses compact names:

- Expense/bill root: the financial record container. Suggested name: `expense_bill`.
- Bill line/item: merchant receipt line or manually entered item. Suggested name: `expense_bill_item`.
- Participant/share assignment: who owes or acknowledges a bill-level or item-level share.
- Payer/payment contribution: who paid the original merchant or contributed toward the bill total.
- Adjustment line: tax, service charge, discount, refund-like credit, or manual adjustment with explicit type and direction.
- Receipt/proof attachment reference: stable file metadata references only, never paths or object keys.
- Bill acceptance, acknowledgement, and dispute status: participant-facing state, separate from the root record state.
- Settlement request/payment/confirmation state: money-movement workflow between counterparties.
- Balance view/projection: derived from accepted bills, resolved shares, settlement state, and policy. It must not become hidden mutable truth.

Table and type names below are suggested implementation directions, not mandatory final names. Future schema branches may rename them if the intent and constraints remain clear.

## Money And Allocation Rules

Future bill and settlement implementation must use the merged API money foundation:

- Use `MoneyAmount`, `CurrencyCode`, `MoneyRoundingService`, `MoneyAllocationService`, or their current internal equivalents for server-authoritative calculations.
- Persist decimal-safe amount plus currency pairs.
- Do not use `float`, `double`, approximate database numeric types, locale-formatted strings, or JavaScript number math for authoritative money.
- Currency must be attached to every persisted amount.
- Round through centralized policy at persistence, allocation, settlement, and final payable boundaries.
- Store resolved participant shares so historical bills do not change when policy, group membership, display defaults, or future exchange rates change.
- Residual handling must be deterministic, reproducible from persisted inputs, and auditable when non-zero.
- Ordinary expenses, bill totals, payer contributions, participant owed shares, and settlement payments must not be negative.
- Refunds, credits, reversals, and waivers must be explicit future records or adjustment records with direction/type, not negative ordinary expenses or negative settlement payments.
- Day 1 bill, split, and settlement operations are same-currency unless a separate FX snapshot branch explicitly designs cross-currency conversion.

## Bill Lifecycle And Statuses

Recommended bill root statuses:

```text
draft
pending_confirmation
confirmed
rejected
cancelled
finalized
archived
```

Status meaning:

- `draft`: creator can edit before participants are asked to acknowledge.
- `pending_confirmation`: submitted to participants and awaiting acknowledgement, rejection, or dispute.
- `confirmed`: required participants accepted the current money-impacting version.
- `rejected`: at least one required participant rejected and the creator must edit, cancel, or resolve.
- `cancelled`: the bill was withdrawn before it became final business truth.
- `finalized`: bill is locked for ordinary edits because settlements, reports, exports, or policy depend on it.
- `archived`: hidden from ordinary active views without destroying financial or audit history.

Recommended participant/share statuses:

```text
pending_acceptance
accepted
rejected
partially_settled
settled
waived
claimed_paid
confirmed_paid
```

Money-impacting transitions include item add/remove, total amount change, currency change, payer contribution change, split method change, participant set change, custom amount change, tax/service/discount allocation change, manual adjustment change, and waiver or settlement confirmation. These transitions require audit and should reset affected participant acknowledgement to `pending_acceptance` unless the bill is still `draft` or a later policy explicitly permits a narrower acknowledgement rule.

Non-money metadata edits, such as tags or bounded notes, may avoid re-acknowledgement when they do not change visibility, participants, amounts, settlement state, or policy.

## Split Model

Day 1 split support should cover:

- Bill-level split.
- Item-level split.
- Equal split.
- Exact/custom amount split.
- Ratio, percentage, or share-weight split.
- Member exclusion per bill and per item.
- Multi-payer expenses.
- Tax, service-charge, and discount allocation.
- Manual adjustment lines.
- Storage of resolved shares.
- Recalculation policy when bill, item, payer, participant, split method, or adjustment inputs change.
- Same-currency bills unless a reviewed FX snapshot branch adds conversion.

Bill-level split applies one split policy across the bill total after adjustments. Item-level split applies split policy per item, then allocates bill-level adjustments according to an explicit rule, such as equal, proportional by item subtotal, or manual override.

Custom amount splits must match the rounded authoritative total after policy. If they do not match, the API should reject the change or require an explicit adjustment line. It must not silently spread mismatches across other participants.

Resolved shares should store:

- participant profile ID
- source bill/item/adjustment relationship
- split method
- basis value, such as amount, ratio, percentage, or weight
- resolved amount/currency
- allocation order
- residual assignment flag or reason where applicable
- policy version or calculation category where useful

Recalculation should create a new resolved-share version or update draft/pending rows according to status. Confirmed/finalized rows must not be silently recalculated without audit and acknowledgement policy.

## Settlement Workflow

Recommended settlement states:

```text
requested
partially_paid
marked_paid
confirmed
disputed
cancelled
```

Settlement workflow direction:

- Settlement request creation derives debtor, creditor, amount, currency, and eligible bill/share basis server-side.
- Mark paid records the payer's claim that money was sent.
- Partial payment records a non-negative amount less than the requested remaining amount.
- Receiver confirmation is the authoritative transition that clears the confirmed portion.
- Dispute moves the request or payment into a review state without erasing prior events.
- Reopen behavior should be an explicit transition from `disputed` or equivalent review state, not a hidden status overwrite.
- Cancellation is allowed only while policy says the settlement has not become confirmed business truth.
- Optional proof attachment uses storage/file metadata and stable file IDs.
- Payment profile visibility to counterparties must follow the payment-details architecture and require an authorized settlement or payment relationship.
- Balance views update from accepted/finalized bills and confirmed or policy-recognized settlement transitions.
- No negative settlement payments are allowed. Reversals are explicit transitions or future records.

Balances are projections. A future balance query should derive from bill shares, payer contributions, settlement requests, settlement payments, confirmations, waivers, and policy. Do not store an opaque mutable `balance` as the source of truth unless a later projection/cache design documents rebuild, reconciliation, and invalidation rules.

## Authorization Rules

Authorization is server-side:

- The request actor comes from the authenticated session/current-actor boundary.
- Users can see only their own records, group records they are authorized for, and settlement/payment records involving them.
- Group membership alone is not enough if bill-level participation, payment relationship, visibility policy, or file-subject policy restricts access.
- Current group membership and group owner status can be inputs to a decision, but bill participation and settlement counterparty relationships must also be checked where relevant.
- Default-excluded, left-member, guest, invitation, and placeholder behavior is future Day 2 unless a separate branch implements it. Day 1 must not accidentally grant unrelated future bill visibility.
- File attachment reads and writes require API authorization on the business subject and the file purpose.
- Clients must not infer authorization from UI state, generated client methods, cached group membership, route possession, or hidden controls.
- Denied, missing, deleted, unrelated, and not-visible cases should avoid leaking unrelated bill, settlement, payment-profile, or file existence.

## Audit Rules

Future implementation must define bounded audit events for:

- Bill/expense create, update, archive, restore, and delete attempt.
- Money-impacting edit.
- Split recalculation.
- Participant acceptance, rejection, dispute, waiver, claimed-paid, and confirmed-paid actions.
- Settlement request, payment, partial payment, mark-paid, confirmation, dispute, cancellation, and reopen.
- Receipt/proof attachment add, remove, and read where policy requires it.
- Rounding residual assignment where non-zero.

Audit metadata may include actor ID, subject IDs, action category, outcome, timestamp, correlation ID, policy/version IDs, status categories, bounded amount/currency values where policy permits, and residual assignment category.

Audit metadata must avoid raw secrets, tokens, password material, raw request bodies, full OCR text, file bytes, thumbnails, storage paths, object keys, provider internals, vault keys, unbounded notes, unnecessary sensitive payment details, and unrelated user financial data.

## Storage And OCR Interaction

Receipt and proof bytes go through the storage abstraction. API responses use stable file IDs and safe metadata, not filesystem paths, object keys, bucket names, provider URLs, or storage internals.

Receipt files should be attached to bills or items through subject-specific file association rules. Settlement proof files should be attached to settlement payment or confirmation records through settlement-specific rules. A generic public file API is not authorized by this document.

OCR candidate output is provisional. Expense creation from OCR must validate:

- money amount format, precision, rounding, and currency
- ownership and current actor
- group and participant permissions
- file purpose and lifecycle state
- receipt-to-bill subject association
- split, adjustment, and payer policy
- duplicate or conflict policy where available

No generic public file upload/download API is authorized here unless a future storage branch adds it with reviewed authorization.

## Database Direction

The expense/bill schema foundation has been implemented for bill roots, items, item splits, participants, payers, adjustments, and bill attachment references. The settlement schema foundation has been implemented for request roots, payment claims, and proof attachment references. Future schema branches should continue introducing small table groups with explicit constraints.

Suggested table categories:

```text
expense_bills
expense_bill_items
expense_bill_participants
expense_bill_item_splits
expense_bill_payers
expense_bill_adjustments
expense_bill_attachments
settlement_requests
settlement_payments
settlement_proof_attachments
```

Suggested purpose and constraints:

- `expense_bills`: root bill/expense record with creator, optional group, merchant/date/category metadata, status, total amount/currency, version/timestamps, archive fields, and same-currency Day 1 constraint. Implemented schema foundation fields currently cover creator, optional group, merchant, bill date, status, total amount/currency, timestamps, and archive timestamp.
- `expense_bill_items`: item rows for a bill with description, quantity where needed, amount/currency, ordering, optional OCR candidate linkage, and soft-delete/archive direction. Implemented schema foundation fields currently cover bill linkage, name, optional note, optional positive quantity, amount/currency, sort order, timestamps, and soft-delete timestamp.
- `expense_bill_participants`: bill-level participant rows with user profile, status, resolved share amount/currency, acknowledgement timestamps, and uniqueness per bill/profile. Implemented schema foundation fields currently cover bill/profile composite key, status, resolved share amount/currency, acknowledgement/payment timestamps, and timestamps.
- `expense_bill_item_splits`: item-level split basis and resolved share rows with method, basis value, participant, amount/currency, input order, and residual flag. Implemented schema foundation fields currently cover item/profile linkage, constrained split method, nullable non-negative bounded basis value, resolved amount/currency, allocation order, residual flag, timestamps, uniqueness per item/profile, indexes, and restrictive foreign keys. The basis value may represent percentage, ratio, share weight, or exact amount basis, but it is not authoritative money by itself; `resolved_amount` plus `resolved_currency` is the stored item split money value.
- `expense_bill_payers`: original payer contribution rows with user profile, amount/currency, optional payment method hint, and non-negative amount constraint. Implemented schema foundation fields currently cover bill/profile linkage, amount/currency, optional payment-method label snapshot, and timestamps.
- `expense_bill_adjustments`: tax, service charge, discount, credit, or manual adjustment rows with explicit type, direction, amount/currency, allocation method, and non-hidden sign policy. Implemented schema foundation fields currently cover bill linkage, constrained type/direction/allocation method, amount/currency, optional reason note, sort order, and timestamps.
- `expense_bill_attachments`: receipt/supporting file references using stable `file_objects.id`, purpose/lifecycle constraints, subject ownership, and no provider path fields. Implemented schema foundation fields currently cover bill/file composite key, constrained purpose, creator reference, timestamps, and removed timestamp.
- `settlement_requests`: debtor/creditor request root with amount/currency, state, related group/bill basis where applicable, requester, state timestamps, archive timestamp, counterparty distinction constraint, indexes, and restrictive foreign keys. Implemented schema foundation fields currently cover these values; runtime creation, receiver confirmation recomputation, bounded request/payment dispute transitions, and requester cancellation for eligible requested requests now exist, while reopen/governance policy is still deferred.
- `settlement_payments`: payment or partial-payment claim rows with positive amount/currency, actor/counterparty references, state, payment date, claimed/confirmed/disputed/cancelled timestamps, optional bounded note, counterparty distinction constraint, indexes, and restrictive foreign keys. Implemented schema foundation fields currently cover these values; runtime debtor mark-paid behavior exists for same-currency full/partial claims, receiver confirmation exists for eligible marked-paid claims, receiver dispute exists for eligible marked-paid claims, and debtor cancellation exists for eligible own marked-paid claims.
- `settlement_proof_attachments`: stable file references for settlement proof through `file_objects.id`, creator reference, timestamps, and restrictive foreign keys. Implemented schema foundation fields store no storage paths, object keys, provider internals, original filenames, public URLs, vault keys, storage roots, or file bytes; proof upload/download bytes are still deferred.

Money-bearing tables should follow the money architecture: decimal-safe amount plus required currency columns, operation-specific positive or non-negative constraints, currency format checks, and centralized API validation. Avoid uncontrolled schema sprawl by landing expense/bill schema, settlement schema, and attachment subject associations in separate branches unless explicitly approved together.

## API And OpenAPI Direction

Settlement candidate preview, first settlement request creation, read-only current-actor settlement request list/get, read-only settlement payment list/get, settlement payment claim, settlement payment confirmation, settlement dispute, and settlement cancellation paths now exist in OpenAPI and generated clients. Settlement proof, balance, recurring, reconciliation, receipt, OCR, and notification paths do not exist yet.

Current bill endpoint foundations are:

```text
POST /api/v1/bills
GET /api/v1/bills
GET /api/v1/bills/{billId}
POST /api/v1/groups/{groupId}/bills
GET /api/v1/groups/{groupId}/bills
GET /api/v1/groups/{groupId}/bills/{billId}
```

Future endpoint categories are directional only and require separate OpenAPI, implementation, tests, and generated-client branches. Settlement runtime categories are refined in [Settlement runtime architecture](SETTLEMENT_RUNTIME_ARCHITECTURE.md).

```text
PATCH /api/v1/bills/{billId}
POST /api/v1/bills/{billId}/submit
POST /api/v1/bills/{billId}/participants/{participantId}/accept
POST /api/v1/bills/{billId}/participants/{participantId}/reject
POST /api/v1/settlements
GET /api/v1/settlements
POST /api/v1/settlements/{settlementId}/mark-paid
POST /api/v1/settlements/{settlementId}/confirm
POST /api/v1/settlements/{settlementId}/dispute
```

Endpoint handlers should stay thin: validate transport shape, resolve the authenticated actor, call domain services, and map bounded result categories to HTTP responses. OpenAPI schemas should use decimal amount strings with attached currency, stable enum values, safe file references, and bounded problem responses.

Generated clients must be regenerated only after reviewed OpenAPI changes. Generated client availability does not authorize access.

## Implementation Slicing Recommendation

Recommended next implementation candidates, in order:

1. Expense/bill schema foundation only. This is now landed for bill roots, items, item splits, participants, payers, adjustments, and bill attachment references only.
2. Internal bill calculation and split domain service tests using the money foundation.
3. Minimal bill create/read endpoints for personal bills only. This is now landed.
4. Group bill create/read with authorization and resolved shares. This is now landed.
5. Participant acknowledgement/dispute workflow.
6. Settlement request/payment/proof schema foundation. This is now landed as persistence only.
7. Settlement runtime design gate. This is now landed as policy only.
8. Settlement candidate preview and request creation. These are now landed for confirmed personal/group bill candidates only.
9. Settlement payment claim, receiver confirmation, and bounded dispute transitions. These are now landed for confirmed personal/group bill candidates only.
10. Settlement cancellation where policy allows. This is now landed.
11. Receipt/proof attachment integration once public authorized file flows exist.

Each slice should include focused tests and validation for its boundary. Avoid combining schema, OpenAPI, generated clients, endpoint runtime, storage bytes, OCR, UI, and settlement behavior in one branch.

## Non-Goals

This document branch does not authorize:

- Runtime implementation.
- EF Core migrations.
- Business database tables.
- OpenAPI changes.
- Generated client changes.
- Mobile, web, or admin UI behavior.
- OCR implementation.
- Generic public file upload/download APIs.
- Receipt upload implementation.
- Settlement proof upload implementation.
- Recurring bill runtime.
- Forecasting runtime.
- Statement reconciliation.
- FX conversion.
- Refunds, locks, governance, guest, default-excluded, or left-member Day 2 behavior.
- Cross-group debt simplification.
- AI insights.
- Worker mutation of business tables.
- Docker/runtime behavior changes.
