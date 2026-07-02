# Notification Target Reference Gap Review

## Purpose

This docs/control review answers the narrow target-reference question for
GitHub issue [#369](https://github.com/tommytang213/Settleora/issues/369):
can the remaining Day 1 notification event families be implemented safely with
the current in-app notification target model, or do they need a schema/OpenAPI
target-reference slice first?

This review does not implement notification runtime writers, event constants,
subject types, database columns, migrations, OpenAPI changes, generated-client
changes, mobile/web/admin UI, deep links, OCR workers, sync runtime expansion,
auth/security notification runtime, provider delivery, push, email, digests,
delivery receipts, settlement/payment/bill calculation logic, storage behavior,
or security policy changes.

## Current Supported Notification Target Model

The current notification persistence model is `user_notifications`, represented
by `InAppNotification`. It supports these first-class references:

- `recipient_user_profile_id`, required.
- `actor_user_profile_id`, optional.
- `group_id`, optional.
- `expense_bill_id`, optional.
- `expense_bill_revision_id`, optional.
- `settlement_request_id`, optional.
- `settlement_payment_id`, optional.
- `recurring_bill_template_id`, optional.
- `recurring_bill_occurrence_id`, optional.
- `action_url`, optional, constrained to a relative `/api/v1/...` route-like
  path.

The writer contract mirrors that model through `InAppNotificationWriteRequest`.
`EfInAppNotificationWriter` rejects unsupported event types, unsupported subject
types, unsafe priorities, blank template keys, oversized safe summaries, unsafe
action URLs, missing/deleted recipients, self-notifications unless explicitly
allowed, and duplicate unread rows tracked in the same unit of work.

The supported subject types are currently:

- `expense_bill`
- `settlement_request`
- `settlement_payment`
- `recurring_bill_occurrence`

Before #568, the OpenAPI `InAppNotificationResponse` and generated web/Dart
models exposed only those safe notification fields and nullable reference IDs.
They did not expose recipient or actor profile IDs. They also did not expose
OCR review IDs, attachment file IDs as notification targets, sync operation
IDs, auth audit event IDs, auth session IDs, item claim IDs, provider delivery
IDs, digest IDs, device-token IDs, or admin policy IDs.

Issue #568 adds the first narrow target-reference implementation slice for OCR
and sync handoffs only. Notification rows and `InAppNotificationResponse` now
carry nullable `receiptOcrReviewId`, `receiptAttachmentFileId`, and
`syncOperationId` fields as safe first-class target IDs. These fields are not
event constants, writers, deep links, OCR worker behavior, sync conflict
resolution behavior, or authorization grants. The receipt attachment reference
is the stable file ID already used by authorized bill attachment/OCR review
response shapes; it is not a storage object key, path, filename, signed URL,
provider name, or file content reference.

[OCR notification source-state review](OCR_NOTIFICATION_SOURCE_STATE_REVIEW.md)
adds the corresponding #570 source-state gate: the target IDs are now
representable, but current `ReceiptOcrReview` creation/update does not yet
produce a safe `ocr.needs_review` source event.

The persistence check constraints and OpenAPI enum currently allow only the
implemented bill workflow/revision, settlement request/payment/proof, and
recurring due-soon/draft-generated event types. The current database and
contract therefore cannot persist or return a new OCR, sync, auth/security,
item-claim, provider, digest, delivery-receipt, or admin-policy notification as
a first-class event without a reviewed schema/OpenAPI/runtime slice.

Notification visibility remains inbox state only. Any target opened from a
notification must re-fetch through an authorized API route. A notification row
is not authorization proof for a bill, settlement, recurring bill, OCR review,
sync operation, file, auth session, audit event, provider delivery record, or
policy record.

[Notification deep-link route policy](NOTIFICATION_DEEP_LINK_ROUTE_POLICY.md)
is the follow-on #371 route/mobile navigation gate. It maps currently
implemented notification families to authorized target re-fetch behavior and
defines stale, missing, unauthorized, account-switched, offline, and resolved
fallback states before Flutter deep-link work.

[Auth/session/security notification source policy](AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md)
is the follow-on #369 source-policy gate for auth/session/security events. It
records that current auth/session/security runtime has real source states to
review, but the notification model still lacks approved event semantics,
recipient rules, and first-class auth/session/security targets.

## Remaining Target Needs

The remaining #369 families need safe linked-resource IDs that are not all
present in the current model:

- OCR handoffs need at least a safe `receiptOcrReviewId`, the related bill ID,
  and sometimes a receipt attachment/file ID available only through authorized
  bill attachment/OCR review APIs.
- Sync/offline handoffs need a safe `syncOperationId` or equivalent conflict
  record ID plus the target resource type and safe target ID.
- Auth/session/security handoffs need a reviewed safe target such as an auth
  audit event ID, auth session ID, policy event ID, or security event ID,
  depending on the event policy.
- Item claim/split handoffs need stable item/claim/review IDs from a claim
  runtime model that does not exist yet.
- Future settlement mismatch/residual/review handoffs may be able to use the
  existing settlement request/payment IDs for some events, but mismatch/review
  states still need exact source runtime and safe target policy before event
  constants are added.
- Provider/digest/delivery/admin policy work needs provider/delivery/policy
  records that are out of scope for the current in-app baseline.

The current `safeSummary` field is not a substitute for missing target IDs. It
is bounded display metadata, not a durable authorization target, not a foreign
key, and not an escape hatch for raw OCR text, sync payloads, session details,
provider internals, payment details, storage data, or hidden bill facts.

## Gap Table

| Event family | Required conclusion | Current target/reference fit | Gate |
| --- | --- | --- | --- |
| OCR review/needs-review/failure/completed handoffs | `requires-source-transition-first-after-targets` | Current OCR review runtime stores bill-scoped `ReceiptOcrReview` rows for existing receipt attachments and exposes authorized list/read/apply-preview/apply routes. #568 added nullable first-class `receiptOcrReviewId` and `receiptAttachmentFileId` notification targets. The #570 source-state review concludes current `provisional`/`reviewed` states are client/user-submitted review data, not safe `ocr.needs_review` source events. Server OCR worker completion/failure runtime is still absent. | Design an exact OCR source transition before adding OCR notification constants or writers: server OCR job result, mobile upload handoff, or explicit review assignment. Server-OCR completed/failed events also require source runtime first. |
| Sync/offline conflict/failure handoffs | `partially-covered-for-existing-persisted-conflicts` | A narrow sync foundation exists for bill archive/restore operations with `SyncOperation` rows and `accepted`, `rejected`, and `conflict` outcomes. #568 added a nullable first-class `syncOperationId` notification target. #571 now uses that target for newly persisted stale-base-version and resource-state conflict rows only, with safe `expenseBillId` where the authorized sync operation already targets an expense bill and a current-actor-only `/api/v1/sync/operations/{syncOperationId}` read path. | Remaining sync failure, queued, resolved, retry, conflict-resolution, and broad sync/offline notification work still requires exact source runtime and reviewed recipient/action semantics first. |
| Auth/session/security-impactful handoffs | `requires-manual-auth-security-policy-first` | Auth sessions, auth audit events, passkey/MFA foundations, and security policy readouts exist, but notification rows cannot carry `authSessionId`, `authAuditEventId`, challenge/factor/passkey IDs, or security policy event references. Security notification recipient rules, bypass/suppression, external snippets, and audit separation remain policy-sensitive. | Run a manual auth/security policy review first. Any later implementation also needs a reviewed safe target-reference schema/OpenAPI slice before event constants/writers. |
| Item claim/split/creator-review handoffs | `requires-source-runtime-first` | Current bill/OCR rows contain quantities, but there is no implemented item-claim domain model, claim ID, claim state runtime, creator-review command model, or notification target. Current bill IDs alone are insufficient for a claim-specific handoff. | Implement/review claim source runtime and stable claim/item target model first. #371/Figma remains required for UI/deep-link behavior. |
| Future settlement mismatch/residual/review states | `requires-source-runtime-first` | Current notification model already supports settlement request/payment IDs, and existing residual rows are tied to settlement/payment runtime. However, future mismatch/review event semantics, recipient rules, safe summaries, and target routes are not yet defined as notification source events. | For events that can safely target existing settlement request/payment IDs, no new target columns may be needed, but exact source runtime and event policy must come first. Add schema only if a future event needs a residual/review-specific target ID. |
| Push/email/provider/digest/delivery receipts/background/admin policy | `requires-source-runtime-first` | Provider delivery, digest, receipt, background worker, device-token delivery-state, and admin policy notification records are not part of the current in-app notification target model. | Out of scope for #369 target-reference implementation. Keep provider/delivery/admin policy work separate from in-app event coverage. |

## Safe Next Child Issue Recommendations

Recommended next issue split:

1. Review and merge the #568 notification target-reference schema/OpenAPI
   implementation for OCR and sync targets. It adds nullable
   `receiptOcrReviewId`, `receiptAttachmentFileId`, and `syncOperationId`
   fields only, with generated clients refreshed from OpenAPI.
2. OCR notification runtime after the OCR target fields exist: start with
   review-needed/failure handoffs for existing authorized OCR review routes.
   Server-OCR completed/failed handoffs remain blocked until server OCR worker
   runtime exists.
3. Remaining sync notification runtime for failure, queued, resolved, retry, or
   broader conflict states only after exact source operations produce those
   persisted states and recipient/action semantics are reviewed.
4. Auth/session/security notification policy review: define exact event
   categories, recipient rules, bypass/mute behavior, safe external snippets,
   source audit separation, and safe target IDs before any runtime or schema
   change.
5. Item claim notification runtime only after claim/source models, stable
   claim/item IDs, and claim review UX/deep-link references exist.
6. Settlement residual/mismatch notification runtime only for exact implemented
   source transitions, using existing settlement request/payment IDs where
   sufficient and adding residual/review target references only when needed.

## Forbidden Shortcuts

Future work must not:

- Put raw OCR text, OCR line dumps, receipt text, file paths, storage object
  keys, filenames, signed URLs, provider internals, or worker debug output into
  `safeSummary`, logs, tests, audit metadata, provider payloads, or docs
  examples.
- Store sync request bodies, full pending payloads, local file paths, local
  cache data, hidden server-current data, or unrelated user data in notification
  fields.
- Store session tokens, refresh tokens, reset tokens, recovery codes, MFA
  secrets, passkey private material, reusable challenge material, provider
  tokens, exact abuse identifiers, or unbounded IP/user-agent history in
  notifications.
- Abuse `expense_bill`, `settlement_payment`, or `recurring_bill_occurrence`
  subject types for unrelated OCR, sync, auth/security, provider, digest, or
  admin policy targets.
- Treat an `action_url` or generated-client method as permission to open the
  target. The target resource must reauthorize through its own API path.
- Add event constants without a source runtime and a safe first-class target.

## Validation Expectations For Later Runtime Slices

Later runtime slices should prove:

- Recipient derivation is owned by the source API/domain service.
- Linked target resources reauthorize through their own API routes.
- Notification read/archive does not mutate OCR, sync, auth/session, money,
  settlement, bill, storage, provider, audit, or source business state.
- Every target ID is either a first-class safe reference or intentionally absent
  because the event can be fully handled by an existing subject ID.
- Event payloads, response models, logs, tests, audit metadata, and external
  snippets exclude raw OCR, receipt, storage, payment, sync payload, auth
  secret, provider, private note, and unrelated user data.
- OpenAPI and generated clients change only through reviewed contract updates.
- Security-impactful notifications have explicit manual policy approval before
  runtime work.

## Non-Pass Statement

#369 remains open and should remain in `Needs Architecture Review` unless a
separate manual/project update explicitly changes it. This review records that
the current notification target/reference model is sufficient for implemented
bill, settlement, and recurring notification families, but it is not sufficient
for OCR, sync, auth/security, item-claim, provider/delivery, digest, or admin
policy families without the gates above.

This document is not Day 1 notification acceptance, production readiness,
release readiness, manual UI retest, manual code review, schema approval,
OpenAPI approval, generated-client approval, security-policy approval, or
runtime implementation approval.
