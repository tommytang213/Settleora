# Settlement Runtime Architecture

## Purpose

This document is the Day 1 design gate for Settleora settlement runtime workflows after the settlement schema foundation has landed and as the first public settlement endpoints are implemented in narrow slices.

It defines how future settlement request, payment claim, confirmation, dispute, cancellation, proof linkage, payment-detail visibility, and balance-projection branches must stay server-authoritative, decimal-safe, authorization-backed, and auditable.

This branch does not implement runtime behavior, OpenAPI paths, generated clients, migrations, EF model changes, proof upload/download bytes, UI, notifications, OCR, reconciliation, FX, locks, refunds, governance, recurring workflows, forecasting, or AI behavior.

## Current State

The current repository state is:

- Auth, session, current-actor, and server-side business authorization foundations exist.
- User profile, self payment-details, and self payment QR foundations exist. Counterparty payment-detail reads do not exist yet.
- Group foundation and group member management endpoints exist for registered users.
- Personal and group bill create/list/get endpoints exist.
- Public bill submit, participant accept, participant reject, and bill-confirmed workflow endpoints exist.
- The internal money, rounding, allocation, and bill calculation service exists for same-currency bill calculations.
- Settlement schema rows exist for `settlement_requests`, `settlement_payments`, and `settlement_proof_attachments`.
- Settlement candidate preview endpoints exist for personal and group bills.
- Settlement request creation endpoints exist for one confirmed personal or group bill candidate at a time.
- Settlement request list/get endpoints exist for read-only current-actor request visibility.
- Settlement payment/proof rows are still persistence foundations only.
- Settlement payment claim, partial payment, confirmation, dispute, cancellation, and proof runtime endpoints do not exist.
- Settlement OpenAPI paths and generated settlement clients exist for candidate preview, request creation, and read-only current-actor request list/get.
- Settlement proof upload/download bytes do not exist.
- Balance projection runtime does not exist.

## Settlement Runtime Authority

The ASP.NET Core API and domain services are authoritative for settlement runtime behavior in server mode.

Authoritative responsibilities include:

- Creating settlement requests.
- Deriving debtor, creditor, amount, currency, and eligible bill/share/payment basis.
- Creating full or partial payment claims.
- Advancing payment and request statuses.
- Confirming received payments.
- Disputing payment claims or settlement requests.
- Cancelling requests or claims where policy allows.
- Linking proof metadata after authorized public file flows exist.
- Emitting bounded audit events.
- Producing balance projections from source records and policy.

Clients may preview settlement suggestions for usability. Client previews are not financial truth. A client must not decide authoritative balances, debtor/creditor relationships, payable amount, currency, settlement-clearing state, visibility, authorization, or audit outcome.

Workers must not mutate `settlement_requests`, `settlement_payments`, `settlement_proof_attachments`, bill/share/payer tables, file metadata tables, or audit tables directly. Workers may publish reviewed job results or events for the API to validate.

Settlement values must use decimal-safe API/domain money types and persisted amount plus currency pairs. Day 1 settlement is same-currency only. Cross-currency settlement requires a later reviewed FX snapshot design that records rate source, timestamp, direction, precision, original amount/currency, converted amount/currency, and audit evidence.

## Source Of Settlement Truth

Settlement candidates are derived by the server from durable business records and policy.

The initial candidate source should include:

- Confirmed bills only, unless a later reviewed policy deliberately allows another bill status.
- `expense_bill_participants.resolved_share_amount` plus `resolved_share_currency`.
- `expense_bill_payers.amount` plus `currency`.
- Bill root status, archive state, creator, group, and visibility.
- Existing settlement requests and payments with policy-recognized statuses.
- Settlement confirmations, disputes, cancellations, waivers, and later explicit reversal records where designed.
- Current actor, bill participation, group membership, group active/removed state, and server-side authorization.

The server should derive each participant's net position for a bill from payer contributions minus resolved shares:

```text
net_position = payer_contribution_for_bill - resolved_share_for_bill
```

A positive net position indicates the user fronted more than their share. A negative net position indicates the user owes under that bill. A zero net position creates no settlement candidate.

Future group-level simplification may offset multiple bills or counterparties only after a separate reviewed policy defines deterministic ordering, visibility, cancellation behavior, dispute impact, and audit. The first runtime slice should prefer a specific confirmed bill and participant/counterparty basis so the API can prove every amount and relationship from existing rows.

Balance views are projections. They must be rebuildable from bills, item splits, participant shares, payer contributions, settlement requests, settlement payments, confirmations, disputes, cancellations, waivers, and reviewed policy. Do not create an opaque mutable `balance` table as source of truth. If a later projection/cache table is introduced, it must document rebuild, invalidation, reconciliation, stale-read behavior, and audit.

## Day 1 Endpoint Direction

This document does not authorize OpenAPI changes. The following route concepts are directional only and require separate implementation, OpenAPI, generated-client, tests, and review branches.

Recommended first slices:

1. Candidate preview from a confirmed bill. Landed.
2. Create settlement request from one eligible confirmed bill/counterparty candidate. Landed.
3. List the current actor's settlement requests. Landed.
4. Get one settlement request. Landed.
5. Mark paid or create a payment claim.
6. Partial payment claim.
7. Receiver confirmation.
8. Dispute.
9. Cancel where policy allows.
10. Proof attachment linkage after authorized public file flows exist.

Potential route concepts:

```text
GET /api/v1/bills/{billId}/settlement-candidates
POST /api/v1/bills/{billId}/settlement-requests
GET /api/v1/settlements
GET /api/v1/settlements/{settlementId}
POST /api/v1/settlements/{settlementId}/payments
POST /api/v1/settlement-payments/{paymentId}/confirm
POST /api/v1/settlement-payments/{paymentId}/dispute
POST /api/v1/settlements/{settlementId}/cancel
POST /api/v1/settlement-payments/{paymentId}/proof
DELETE /api/v1/settlement-payments/{paymentId}/proof/{fileId}
```

An alternate nested group shape may be reviewed for group-only workflows:

```text
GET /api/v1/groups/{groupId}/bills/{billId}/settlement-candidates
POST /api/v1/groups/{groupId}/bills/{billId}/settlement-requests
```

Endpoint handlers should stay thin. They should validate transport shape, resolve the current actor, call settlement domain services, and map bounded result categories to HTTP responses.

Future OpenAPI schemas should represent decimal amounts as strings with attached currency, stable enum values, safe file references only, and bounded problem responses. Generated client availability must not be treated as authorization.

## Creation Policy

The first runtime should not accept arbitrary client-submitted debtor, creditor, amount, and currency as final truth.

Preferred first creation shape:

- The route identifies a confirmed bill.
- The request identifies a deterministic candidate or counterparty basis derived from that bill.
- The current actor is derived from the authenticated session.
- The server loads the bill, participants, payers, existing settlements, and authorization context.
- The server derives debtor, creditor, amount, currency, group, source bill, and request eligibility.
- The server persists a request only if the derived candidate is still valid at write time.

Limited client input may include:

- Candidate ID or counterparty participant ID from a server-derived candidate response.
- Optional bounded note only if a later slice adds note fields and audit policy.
- Idempotency key only if a later API reliability policy adds it.
- Optional requested payment date only for payment claims, not request creation truth.

The server derives:

- Debtor profile ID.
- Creditor profile ID.
- Amount.
- Currency.
- Source bill ID.
- Group ID, if any.
- Requester profile ID.
- Initial request status.
- Eligibility and conflict outcome.

Creation should fail closed when:

- The bill is not confirmed.
- The bill is archived, deleted, missing, or not visible to the actor.
- The actor is unrelated to the bill or candidate.
- The participant or payer basis is missing.
- The counterparty is not a participant, payer, debtor, or creditor under the derived candidate.
- The group is missing, deleted, or not visible.
- Required group membership is inactive, removed, or otherwise not policy-eligible.
- The amount is zero or negative.
- Currencies mismatch.
- Same-currency Day 1 policy cannot prove a single currency.
- A matching active settlement request already exists for the same bill, debtor, creditor, amount, and currency under the selected policy.
- Existing payments or confirmations already clear the candidate.
- A target profile is deleted or not active.
- The submitted candidate ID is stale or does not match the current derivation.

Conflict behavior should be deterministic:

- Return validation errors for malformed or unsupported request shape.
- Return `404` for missing, deleted, unrelated, or unauthorized subject access where existence should not leak.
- Return `409` for visible but invalid state transitions, stale candidate, duplicate active request, already-cleared candidate, or policy conflict.
- Return bounded problem details without unrelated user, bill, group, payment-profile, file, or financial data.

## Payment And Confirmation Policy

Settlement requests and settlement payments should advance separately but consistently.

`settlement_requests.status` summarizes the request-level state:

```text
requested
partially_paid
marked_paid
confirmed
disputed
cancelled
```

`settlement_payments.status` represents individual payment claims:

```text
marked_paid
confirmed
disputed
cancelled
```

Recommended transition model:

- `requested`: request exists and no active payment claim has covered the request.
- `partially_paid`: one or more active payment claims exist, but confirmed or pending claimed total is less than the request amount.
- `marked_paid`: active payment claims cover the request amount but receiver confirmation is not complete.
- `confirmed`: receiver has confirmed payment coverage according to policy.
- `disputed`: debtor or creditor disputes the request or a payment claim.
- `cancelled`: request is withdrawn before policy treats it as confirmed business truth.

Actors:

- Debtor may create a payment claim for their own debt.
- Creditor may create a request for money owed to them when derived from an eligible bill.
- Either debtor or creditor may create a request only if the server can derive the same candidate and policy allows that actor role.
- Receiver/creditor confirms payment claims.
- Debtor may dispute a request or incorrect claim.
- Creditor may dispute a payment claim.
- Requester may cancel a request while it has no confirmed payment and policy allows cancellation.
- Debtor may cancel their own unconfirmed payment claim where policy allows.
- System owner/admin role does not imply broad settlement mutation by default.

Partial payment policy:

- Partial payments are positive amounts less than the remaining request amount.
- Partial payments must use the request currency.
- Multiple partial claims may exist.
- Confirmed partial payments reduce the remaining amount for projection.
- Pending marked-paid partial claims may move the request to `partially_paid` but should not clear the request until confirmation policy says so.
- Overpayment must be rejected unless a later reviewed policy adds explicit overpayment/refund behavior.

Confirmation policy:

- Receiver confirmation is the authoritative transition that clears the confirmed portion.
- A request becomes `confirmed` only when confirmed payment coverage equals the request amount under server rounding policy.
- Dispute must not delete previous payments, proof links, or audit.
- Reopen, reversal, refund, or correction behavior requires a later explicit design. If reopen is needed, it should be a bounded transition from `disputed` or a later review state, not a hidden overwrite.

Cancellation policy:

- Cancellation may be allowed while the request has no confirmed payment claims.
- Cancellation after confirmation is not Day 1 behavior; use explicit reversal/refund/governance design later.
- Cancelled requests and payments remain in history for projections, duplicate detection, and audit.

## Authorization And Privacy

Settlement authorization must use the server-side current actor and business authorization boundaries.

Personal bill settlements:

- Actor must be a debtor, creditor, requester, original payer, bill creator, or participant under the derived settlement candidate.
- The API must not rely on client-submitted profile IDs to decide actor identity.
- Personal bill settlement reads should be limited to settlement parties and policy-approved bill participants where necessary.

Group bill settlements:

- Actor must pass group access checks and settlement relationship checks.
- Active group membership can be required for creating new settlement requests from group bills.
- Group membership alone is not enough to read payment proof, payment details, or unrelated settlement data.
- Removed or inactive members may need historical access later, but that requires explicit reviewed policy. Day 1 should fail closed unless historical access is intentionally designed.

Debtor/creditor access:

- Debtor and creditor can read the settlement request and their own counterpart details allowed by policy.
- Non-party group members must not read settlement details merely because they share a group.
- Settlement list endpoints should return only records involving the current actor unless a later group owner/admin reporting policy is reviewed.

Payment profile visibility:

- Counterparty payment-details reads require an authorized settlement, payment request, bill, or equivalent relationship.
- The default payment-details visibility is `settlement_counterparties_only`.
- Payment details must not be exposed by global user lookup, group membership alone, generated client method availability, hidden UI routes, or possession of a profile ID.
- Counterparty responses must expose only visibility-scoped payment fields and safe QR metadata once relationship-backed QR reads are designed.
- Payment handles, notes, QR contents, storage metadata internals, and owner-only lifecycle fields must not leak through settlement responses.

Failure behavior:

- Use `401` for unauthenticated requests.
- Prefer fail-closed `404` for missing, deleted, unrelated, archived, inactive, not-visible, or not-allowed subjects where existence should not leak.
- Use `403` only when the API intentionally wants to distinguish authenticated but forbidden access for an already-known subject.
- Use `409` for visible state conflicts.
- Error details must not reveal unrelated bill, group, settlement, payment profile, file, user, or financial existence.

## Audit

Settlement runtime must emit bounded audit events from API/domain services.

Recommended event names:

```text
settlement.request_created
settlement.payment_marked_paid
settlement.payment_partially_paid
settlement.payment_confirmed
settlement.payment_disputed
settlement.request_disputed
settlement.request_cancelled
settlement.payment_cancelled
settlement.reopened
settlement.proof_attached
settlement.proof_removed
settlement.proof_read
settlement.payment_details_viewed
```

`settlement.reopened`, proof events, and payment-details view events should be implemented only when the corresponding runtime behavior exists.

Audit metadata may include:

- Actor auth account ID.
- Subject profile/account IDs where needed.
- Settlement request ID.
- Settlement payment ID.
- Source bill ID.
- Group ID.
- Debtor and creditor profile IDs where policy allows.
- Previous and new bounded status categories.
- Bounded amount and currency strings.
- Payment count or participant count.
- Candidate policy version or calculation category.
- Outcome.
- Timestamp.
- Correlation ID or request ID.

Audit metadata must avoid:

- Raw secrets.
- Tokens.
- Password or credential material.
- Raw request bodies.
- Unbounded notes.
- Full payment handles.
- Payment notes.
- QR contents.
- File bytes.
- Thumbnails or previews.
- Storage paths.
- Object keys.
- Provider internals.
- Vault keys, vault refs, or key envelopes.
- Raw OCR text.
- Receipt contents.
- Unrelated financial data.
- Unrelated user, group, bill, payment profile, or file data.

Denied attempts should be auditable where policy requires it, but denial audit metadata must stay bounded and must not leak existence through logs available to ordinary users.

## Storage And Proof Boundaries

Settlement proof attachments reference stable file IDs only.

The existing `settlement_proof_attachments` table associates a payment claim with a `file_objects.id`. It must not store or expose storage paths, object keys, provider URLs, local filesystem paths, original filenames beyond approved safe metadata, vault references, public URLs, or file bytes.

Proof bytes remain out of scope until authorized public file upload/download flows exist. A proof attachment runtime branch must first prove:

- The actor is a settlement party allowed to attach or remove proof.
- The file has purpose `settlement_proof`.
- The file is active or in an allowed lifecycle state.
- The file owner/creator and settlement subject relationship are policy-approved.
- The settlement payment is in a status that accepts proof.
- Reads require API authorization every time.
- Responses expose stable file IDs and safe metadata only.
- No direct filesystem/object storage path appears in response, audit, logs, or validation output.

Possessing a file ID, settlement ID, group ID, bill ID, payment ID, profile ID, generated client method, or cached UI route is not authorization.

## Balance Projection Direction

Balance views should answer questions such as:

- What do I currently owe?
- Who currently owes me?
- Which confirmed bills created the position?
- Which payment claims are pending receiver confirmation?
- Which confirmed payments reduce or clear the position?
- Which requests are disputed or cancelled?

Projection inputs should include:

- Confirmed bills.
- Resolved participant shares.
- Original payer contributions.
- Existing settlement requests.
- Payment claims.
- Receiver confirmations.
- Disputes.
- Cancellations.
- Waivers when later designed.
- Reversals or refunds when later designed.
- Authorization and visibility policy.

Projection outputs must be scoped to the current actor. They should not expose unrelated group-wide positions, hidden users, payment profiles, proof files, or bills outside the actor's authorization. Projections must remain rebuildable and deterministic.

## Implementation Slicing

Recommended implementation sequence:

1. Internal settlement candidate derivation service with focused tests and no public endpoints. Landed.
2. Public candidate preview endpoint from one confirmed bill after OpenAPI review. Landed.
3. Create settlement request from one derived confirmed-bill candidate. Landed.
4. List/get current actor settlement requests. Landed.
5. Mark paid/create payment claim, including partial payment support.
6. Receiver confirmation.
7. Dispute and cancellation.
8. Relationship-backed counterparty payment-details read.
9. Proof attachment metadata linkage after authorized public file flows exist.
10. Balance projection read endpoints.

Keep schema, runtime, OpenAPI, generated clients, file bytes, payment-details counterparty reads, balance projections, notifications, and UI in separate reviewed slices unless a future task explicitly approves a combined branch.

## Validation Expectations

Future runtime branches should include focused tests for:

- Candidate derivation from confirmed bill shares and payer contributions.
- Same-currency enforcement.
- Zero and negative amount rejection.
- Duplicate active request conflict.
- Stale candidate conflict.
- Missing, archived, deleted, unrelated, and not-visible bill behavior.
- Inactive/removed group membership behavior.
- Debtor/creditor actor permissions.
- Payment claim amount, remaining amount, and overpayment validation.
- Request and payment status transitions.
- Receiver-only confirmation.
- Dispute and cancellation policy.
- Fail-closed response privacy.
- Bounded audit metadata.
- Payment-details counterparty visibility once added.
- Proof stable file ID and authorization checks once added.
- Projection rebuild behavior once added.

## Non-Goals

This design branch does not implement or authorize:

- Runtime settlement endpoints.
- OpenAPI settlement paths.
- Generated settlement clients.
- Database migrations.
- EF model changes.
- Settlement proof upload/download bytes.
- Receipt upload/download behavior.
- OCR behavior.
- Notifications.
- UI behavior.
- Recurring workflows.
- Forecasting.
- Reconciliation.
- FX conversion.
- Locks, refunds, or governance.
- AI behavior.
- Worker mutation of business tables.
- Hidden mutable balance source-of-truth tables.
