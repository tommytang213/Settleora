# Settlement Residual Review Notification Source Policy

## Purpose

This docs/control source-policy packet defines the safe notification semantics
for the implemented settlement residual review handoff and remaining future
settlement mismatch/review gates under GitHub issue
[#369](https://github.com/tommytang213/Settleora/issues/369).

This document records the source-policy boundary used by the narrow
`settlement.residual_review_needed` runtime slice. It does not authorize
broader settlement mismatch/review notifications, debtor decision-result
notifications, settlement status transitions, residual policies, money
calculation, allocation behavior, balance projection behavior, payment
confirmation behavior, proof behavior, storage behavior, provider delivery,
mobile UI, deep links, Docker/deployment behavior, secrets, or issue closure.

## Decision

Pending receiver-confirmation residual handoffs use the dedicated
`settlement.residual_review_needed` event only for the narrow implemented
source transition: a successful debtor-created payment claim that persists a
pending receiver-confirmation residual.

Do not overload `settlement.payment_partially_paid` as the residual-review
source event. The existing event remains the payment-claim/request-status
notice for ordinary partial payment coverage. It may carry a user to the
settlement payment read surface where bounded residual summaries already exist,
but it must not be treated as proof that every residual-specific recipient,
idempotency, payload, and validation rule is satisfied.

Do not add broader `mismatch` or `review` events yet. Current runtime has
residual rows and receiver confirmation, but it does not have a separate
general settlement mismatch/review state machine. Any event beyond the pending
receiver-confirmation residual handoff remains blocked until that source state
exists.

## Current Source-State Facts

Current settlement runtime persists `settlement_residuals` for explicit
same-currency underpayment or overpayment proposals created during debtor
payment claim creation when the submitted payment and selected outstanding
amount differ under a supported `proposedResidualPolicy`.

Current residual directions:

- `underpayment`
- `overpayment`

Current supported residual policies:

- `remaining_balance`
- `carried_forward`
- `waived`
- `credit_forward`
- `waived_by_payer`
- `applied_to_other_line` is a supported foundation value but is not a current
  receiver-confirmed balance-effect policy for the landed same-currency flow.

Current residual statuses:

- `pending_receiver_confirmation`
- `confirmed`
- `carried_forward`
- `waived`
- `credited`
- `disputed`
- `cancelled`

Current runtime behavior:

- Exact payments create no residual.
- Supported underpayment and overpayment proposals persist a residual with
  `pending_receiver_confirmation`.
- Payment confirmation is blocked while a payment has pending residuals.
- `POST /api/v1/settlement-payments/{paymentId}/residuals/{residualId}/confirm`
  lets the receiver/creditor confirm one pending residual to its
  policy-derived status.
- Request/payment dispute and cancellation neutralize pending residual rows to
  disputed or cancelled statuses where present.
- Balance projection uses receiver-confirmed residual effects only. Pending,
  cancelled, disputed, or unsafe residuals are not projected as confirmed
  remaining, waived, or credit effects.
- Broad credit ledgers, refund workflows, settlement simplification,
  settlement reopen/adjustment policy, and a general mismatch/review workflow
  do not exist.

Current settlement payment/read routes already expose bounded payment and
residual summaries through authorized settlement payment/request reads. Current
confirmation routes are also authorized API paths. Notification opens must
re-fetch through those routes and must not trust notification visibility as
authorization.

## Current Notification Distinctions

Current settlement notification coverage includes:

- `settlement.request_created`
- `settlement.payment_marked_paid`
- `settlement.payment_partially_paid`
- `settlement.payment_confirmed`
- `settlement.request_disputed`
- `settlement.payment_disputed`
- `settlement.request_cancelled`
- `settlement.payment_cancelled`
- `settlement.proof_attached`
- `settlement.residual_review_needed`

Current `settlement.payment_partially_paid` means a debtor-created payment
claim leaves the settlement request partially covered by active payment
allocations. It is not a residual-review event by itself.

Current `settlement.payment_marked_paid` means active payment coverage reaches
the request amount. It may coexist with an overpayment residual proposal when
the payment amount exceeds selected outstanding coverage under an explicit
supported policy, but the event remains a payment-claim notice rather than a
residual-review event.

Current proof events are storage/privacy-sensitive proof handoffs. They must
not describe proof contents, files, payment handles, QR contents, account
numbers, storage paths, object keys, or provider internals.

Current `settlement.residual_review_needed` means a debtor-created payment
claim persisted a pending receiver-confirmation residual that the
receiver/creditor must review through existing authorized settlement payment
and residual confirmation APIs. It is not a payment-status replacement and does
not expose residual amounts, residual reasons, payment details, proof contents,
or storage internals.

Current residual confirmation emits bounded settlement audit action
`settlement.residual_confirmed`; it does not currently write an in-app
notification. That audit action is not an in-app event type and must not be
exposed as a notification without a future reviewed implementation.

## Source Transitions

The only residual source transition currently implemented for residual-review
notification runtime is:

```text
debtor creates a settlement payment claim
and that successful claim creates a pending receiver-confirmation residual
```

Notification event:

```text
settlement.residual_review_needed
```

The event is written only after the payment claim and residual row are accepted
by the settlement API/domain flow in the same successful save. It does not fire
for exact payments, ordinary partial payments without residual rows, failed
writes, validation failures, unauthenticated/unauthorized requests, unsupported
residual policies, missing residual policy conflicts, duplicate/no-op paths, or
residuals that are already resolved.

Receiver decision transitions are separate:

- Receiver/creditor confirmation of a pending residual may optionally notify
  the debtor later, but that is a separate event-policy decision and should not
  be bundled into the pending-review handoff.
- Dispute/cancellation already have settlement dispute/cancellation event
  families. Future residual-specific debtor notification after receiver
  decision should not duplicate those events.

General `settlement.mismatch_detected`, `settlement.review_needed`, or similar
events remain future/blocked until broader settlement review states exist. Do
not infer mismatch semantics from amount deltas alone when the current runtime
already classifies explicit residual policies.

## Recipient Policy

For `settlement.residual_review_needed`:

- Notify only the receiver/creditor for the debtor-created payment residual
  handoff.
- Suppress the debtor/actor on creation because they initiated the payment
  claim and residual proposal.
- Suppress unrelated bill participants, non-party group members, admins,
  owners, and observers.
- Suppress actor self-notifications unless a future reviewed source transition
  intentionally requires self-notification for safety.
- Do not send global/admin notifications for residual handoffs under #369.
  Admin/global policy/readout remains #635.

Optional future debtor notification after receiver decision is allowed only
after a later policy names the exact event, source transition, recipient, and
duplicate rules. It must not alter settlement money, allocation, payment,
residual, or balance behavior.

## Target And Reference Policy

Residual-review notifications use existing safe settlement targets:

- `settlementRequestId`
- `settlementPaymentId`
- `groupId` where already applicable
- `expenseBillId` where already visible through the settlement request
- route-like action URL to the existing authorized payment/request surface

Do not add a residual-specific notification target ID unless a later design
proves existing settlement payment/request targets are insufficient for a
client to re-fetch and render the pending residual review through authorized
API paths.

Safe action routing should open an authorized settlement payment/request read
surface. A future UI may call the authorized residual confirmation route only
after re-fetching the payment and bounded residual summaries. Possessing a
notification row, payment ID, request ID, group ID, bill ID, residual ID, or
generated-client method is not authorization.

## Privacy-Safe Payload Policy

Residual-review notifications use generic copy and safe IDs only.
External snippets should say only that a settlement payment update needs review
or that a settlement update is available.

Notification rows, response payloads, delivery attempts, logs, audits, tests,
reports, and external snippets must not include:

- money values or residual amounts in email/push snippets unless a future
  reviewed policy explicitly allows them;
- raw residual reasons, raw notes, comments, or user-entered payment notes;
- payment handles, QR contents, account numbers, bank details, or payment
  profile internals;
- proof contents, proof files, proof text, bank screenshots, thumbnails, file
  bytes, storage paths, object keys, bucket names, signed URLs, local paths, or
  provider internals;
- hidden bill lines, private bill details, itemized receipt/OCR content,
  participant assignment matrices, or unauthorized participant data;
- provider payloads, SMTP credentials, push credentials, raw device tokens,
  auth/session tokens, recovery material, or secrets;
- unrelated user, group, bill, payment, storage, auth, sync, OCR, or provider
  data.

In-app metadata may carry only already-approved safe target IDs and template
keys. If a future template needs residual direction/policy display, the client
must derive that from the authorized settlement payment response, not from an
external snippet.

## Duplicate And Idempotency Policy

Runtime must not create duplicate residual-review notifications for the
same pending residual handoff.

Recommended idempotency shape for documentation purposes only:

```text
event_type:settlement.residual_review_needed
recipient:{creditorProfileId}
settlement_payment:{paymentId}
residual:{residualId}
source_transition:created_pending_receiver_confirmation
```

If no residual-specific notification target is added, the residual ID may still
participate in an internal idempotency key. It does not have to be exposed in
the public notification response unless the target/reference design later proves
that exposure is necessary and safe.

Repeated reads, retries after already-persisted successful payment claims,
payment confirmation attempts blocked by pending residuals, duplicate
same-state no-ops, dispute/cancellation neutralization, and notification
read/archive must not create extra residual-review notifications.

## OpenAPI, Generated-Client, And Migration Implications

The implemented runtime slice adds the public notification event enum value,
regenerates web/Dart clients from OpenAPI, and widens only the notification
event-type check constraints for `user_notifications` and
`notification_delivery_attempts`. It does not add a public residual-specific
target ID or alter settlement business schema.

Future implementations require OpenAPI and generated-client regeneration only
if they add new public notification event enum values, response fields, public
target IDs, routes, or schema shapes.

Future implementation may require EF check-constraint migrations if adding
another notification event type to constrained notification/delivery-attempt
vocabularies. That migration should be limited to notification enum/constraint
support and must not alter settlement business schema.

Notification work must not cause settlement business schema changes. It must
not add or alter settlement request/payment/residual tables, allocation logic,
balance projection, proof tables, payment-details storage, money calculation,
or residual policy behavior.

## Future Validation Expectations

The runtime slice for `settlement.residual_review_needed` includes:

- focused settlement payment claim/residual tests proving notification creation
  only when a successful debtor-created claim creates a pending
  receiver-confirmation residual;
- tests proving no notification for exact payments, ordinary partial payments
  without residual rows, unsupported residual policy, missing residual policy,
  invalid requests, failed writes, unauthorized callers, and unrelated users;
- recipient tests proving creditor/receiver-only delivery, debtor actor
  suppression on creation, no unrelated participant/admin leakage, and
  self-notification suppression;
- schema/writer tests for safe event type, subject type, priority, action URL,
  request/payment IDs, duplicate prevention, and read/archive isolation;
- redaction tests proving notification payloads, delivery attempts, external
  snippets, logs, reports, and assertions exclude payment handles, QR data,
  account numbers, proof contents, storage internals, hidden bill lines, raw
  residual reasons/amounts in external snippets, raw notes, provider payloads,
  tokens, secrets, and unrelated user data;
- authorized re-fetch tests proving notification visibility does not bypass
  settlement payment/request/residual authorization;
- OpenAPI/client validation because the public event enum changed;
- migration/check-constraint validation because the notification event type was
  added;
- `npm run validate:api-local` before PR/merge if runtime code changes.

## Remaining Gates

- Future debtor notification after receiver residual decisions, if a later
  policy explicitly approves it.
- Broader settlement mismatch/review notifications after exact source states
  exist.
- #371 notification deep links/mobile navigation.
- #635 admin/global notification policy/readout.
- #634 real push/provider/mobile work.
- OCR completed/failed source states.
- Auth/session/security notification policy.
- Item claim/split notification source runtime.
- Final Day 1 notification acceptance.

## Non-Pass Statement

#369, #368, #403, #634, #635, and #371 remain open. This document records only
the narrow residual-review handoff policy/runtime boundary. It does not
complete all Day 1 notification event coverage, provider delivery, deep links,
admin policy, push/mobile work, OCR worker events, auth/security notifications,
item claim notifications, or final Day 1 acceptance.
