# OCR Needs-Review Notification Source Policy

## Purpose

This docs/control design records the source transition and recipient policy
needed before any `ocr.needs_review` notification runtime is implemented for
GitHub issue [#570](https://github.com/tommytang213/Settleora/issues/570).

It builds on [OCR notification source-state review](OCR_NOTIFICATION_SOURCE_STATE_REVIEW.md),
[Notification target reference gap review](NOTIFICATION_TARGET_REFERENCE_GAP_REVIEW.md),
[Day 1 notification event coverage review](DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md),
[OCR architecture](OCR_ARCHITECTURE.md), and
[Receipt OCR review apply policy](RECEIPT_OCR_REVIEW_APPLY_POLICY.md).

This document does not implement notification constants, writers, subject
types, tables, migrations, OpenAPI changes, generated-client changes, OCR worker
behavior, OCR review endpoint behavior, mobile/web/admin UI, notification deep
links, storage behavior, auth/session/security behavior, bill apply behavior,
settlement/payment/money behavior, provider delivery, Docker, deployment, CI, or
secrets.

## Current Decision Basis

Current `ReceiptOcrReview` rows have `provisional` and `reviewed` review-data
states. Those values are submitted by a client or current user flow and do not
encode:

- a server OCR result;
- a responsible editor;
- an assignee;
- a notification recipient;
- a confidence threshold;
- a handoff from one actor to another;
- a worker completion or failure state.

Therefore a saved `provisional` review remains a queue/filter state, not a safe
notification source transition. Queue visibility, apply-preview success,
generated client availability, and receipt attachment visibility also remain
insufficient. Visibility is not responsibility.

## Candidate Source Transitions

| Candidate | Day 1 fit | Main risk | Decision |
| --- | --- | --- | --- |
| Server OCR worker result creates or updates a saved OCR review and marks it needs-review for a responsible editor. | Good long-term source model for server OCR, but the server worker/job runtime does not exist yet. | Would imply worker result states, failure policy, confidence thresholds, and job/result records that are not implemented. | Blocked until server OCR job/result runtime exists. Keep `ocr.completed` and `ocr.failed` blocked with it. |
| Mobile/server-mode upload handoff accepted by the API creates or updates a saved review that requires a different authorized editor to act. | Useful for future server-mode offline/mobile collaboration where one actor uploads OCR-derived data for another editor. | Current OCR review save is limited to creator/owner mutation and does not create a distinct cross-user handoff. Implementing it directly could turn ordinary saves into noisy notifications. | Not the safest first transition unless a future upload-acceptance source state is explicitly added with responsible editor fields. |
| Explicit OCR review assignment is added to OCR review runtime with assignee, recipient, and self-notification rules. | Best Day 1-compatible source model because it separates saved OCR data from responsibility and can work for server-worker, upload-handoff, or manual assignment sources later. | Requires new source-state fields or an assignment table before runtime; cannot be inferred from current `provisional` rows. | Recommended design. Runtime remains blocked until the assignment/source-state slice exists. |

## Recommended Source Transition

The safest Day 1-compatible transition is an API-owned explicit OCR review
assignment/handoff transition.

Design-level source event name:

```text
ocr.needs_review
```

Design-level source transition:

```text
ocr_review.assignment_created
```

or, if an existing active assignment is retargeted:

```text
ocr_review.assignment_retargeted
```

The notification event should be emitted only after the API has persisted a
saved OCR review plus an active needs-review assignment for one responsible
editor. The transition must be explicit. It must not be inferred from
`ReceiptOcrReview.status = provisional`, receipt attachment creation, OCR review
queue/list visibility, apply-preview warnings, route availability, or generated
client methods.

`ocr.completed` and `ocr.failed` remain blocked until server OCR job/result
runtime exists with reviewed completion, failure, retry, and safe recipient
policy.

## Required Source State

A future source-state/schema issue is required before runtime. The design may be
implemented as new fields on an OCR review source-state model or as a separate
assignment table, but it must preserve these concepts:

- stable `receiptOcrReviewId`;
- related `expenseBillId`;
- related receipt attachment `fileId`;
- nullable `groupId` for group-bill routes;
- `assignmentStatus`, such as `needs_review`, `reviewed`, `cancelled`, or
  `superseded`;
- `assignedToUserProfileId`;
- `assignedByUserProfileId` or safe system/worker source category;
- `assignmentSource`, such as `server_ocr_worker`, `server_mode_upload_handoff`,
  `manual_assignment`, or `system_reassignment`;
- `sourceActorUserProfileId`, nullable for worker/system sources;
- safe `sourceCorrelationId` only if it is not a provider internal, storage key,
  or debug identifier;
- timestamps for created, updated, completed/cancelled/superseded;
- idempotency or uniqueness guard for one active needs-review assignment per
  review and responsible editor.

The source state must be owned by the API/domain boundary. Workers may publish
results or handoff requests through reviewed contracts, but they must not mutate
core business tables or decide notification recipients directly.

## Recipient Policy

The recipient is the `assignedToUserProfileId` on the active needs-review
assignment after the API revalidates that the recipient is still authorized to
see the bill, attachment metadata, and saved OCR review.

Default eligible responsible editors:

- the bill creator;
- the bill owner or responsible editor;
- a group bill editor/member only where group authorization and future bill
  role policy explicitly grant OCR review responsibility.

Not eligible by default:

- all visible bill participants;
- all group members;
- users who can only view an apply preview;
- users who only appear in cached mobile state;
- users inferred from comments, notes, receipt text, OCR line text, payment
  details, or hidden bill data.

Visibility and responsibility are different. A user may be allowed to view a
bill, attachment metadata, OCR review, or apply preview without being the
responsible recipient for a needs-review notification.

## Actor Self-Notification Policy

Self-notifications are suppressed by default.

Suppress the notification when:

- `sourceActorUserProfileId` equals `assignedToUserProfileId`;
- a user saves, updates, previews, applies, or removes their own OCR review;
- the source transition is only a client-submitted review data change;
- the assignment would merely restate an action the current actor just took.

Self-notification may be allowed only for reviewed asynchronous/system sources,
for example a future server OCR worker result requiring the same user to act
after background processing. That allowance must be explicit on the source
transition, must be tested, and must not reuse ordinary user save/update flows.

## Local-Only And Server-Mode Behavior

Local-only mode:

- no server in-app notification is created;
- local OCR review reminders, if any, are local UI state only;
- local reminders must not imply server acceptance, sharing, API visibility, or
  cross-user responsibility.

Server-mode:

- the API owns assignment creation, authorization, recipient derivation,
  notification writing, and linked-resource reauthorization;
- offline mobile OCR data remains local or queued until accepted by the API;
- queued upload or sync acceptance may create a needs-review assignment only
  through a future reviewed source transition;
- clients must not synthesize server notifications from local queued work.

## Safe Target References

Future `ocr.needs_review` notifications should carry only safe first-class IDs:

- `receiptOcrReviewId`;
- `receiptAttachmentFileId`, only as the stable file ID already available
  through authorized receipt/bill attachment metadata paths;
- `expenseBillId`;
- `groupId` when the bill is group-scoped;
- route-like `actionUrl` that re-fetches through authorized API paths.

Safe route-like examples:

```text
/api/v1/bills/{expenseBillId}/attachments/{receiptAttachmentFileId}/ocr-review
/api/v1/groups/{groupId}/bills/{expenseBillId}/attachments/{receiptAttachmentFileId}/ocr-review
```

Opening a notification must re-fetch through the authorized bill attachment/OCR
review API path. Notification visibility is never authorization proof for the
bill, receipt attachment, OCR review, file content, group, apply operation, or
future deep link.

## Non-Leakage Requirements

Notification payloads, response models, delivery logs, audit metadata, provider
payloads, snippets, tests, and examples must not contain:

- raw OCR text;
- receipt text;
- OCR line dumps;
- itemized extracted lines;
- receipt image bytes or other file contents;
- storage paths;
- storage object keys;
- bucket/container names;
- signed URLs;
- provider internals;
- worker debug output;
- local file paths;
- filenames unless a later reviewed template classifies bounded display names as
  safe;
- private notes;
- hidden bill details;
- payment details;
- QR contents;
- auth/session/security data;
- unrelated user data.

Use generic notification copy such as "A receipt OCR review needs attention".
Do not include merchant names, receipt totals, line names, extracted tax text,
participants, payment handles, or worker diagnostics in notification snippets.

## Runtime Validation Expectations

Future runtime implementation should include focused tests for:

- exact source transition: notification writes only after an explicit active
  needs-review assignment is persisted;
- no notification from plain `provisional`/`reviewed` saves, queue/list reads,
  apply previews, applies, deletes, or attachment visibility;
- recipient filtering: only the assigned authorized responsible editor receives
  the notification;
- actor self-notification suppression for user-originated save/update/handoff
  flows;
- explicit self-notification allowance only for reviewed asynchronous/system
  transitions, if such a transition is implemented;
- safe payload and response shape with only allowed target IDs and route-like
  action URLs;
- linked target authorization re-fetch, including stale, removed, inaccessible,
  and group-membership-lost cases;
- read/archive state isolation from OCR review source state, assignments,
  apply, bill items, storage, settlement/payment, sync, and audit truth;
- idempotency or duplicate suppression for repeated source transitions;
- no raw OCR, receipt, storage, provider, worker debug, payment, private note,
  hidden bill, auth/session, or unrelated user data in notifications, logs,
  audit metadata, provider snippets, or tests.

## Implementation Readiness Conclusion

#570 can move from "which transition should this use?" architecture ambiguity to
an implementation-ready source-state child issue. It is not ready for direct
notification runtime yet.

Required next child issue:

```text
Add OCR review needs-review assignment/source state
```

That issue should add the reviewed source-state fields or table, persistence
policy, authorization rules, idempotency rules, and tests without adding
notification constants unless it is explicitly scoped to do both. After that
source state exists, a separate runtime issue may add the `ocr.needs_review`
notification constant, writer integration, OpenAPI/generated-client changes if
needed, and notification tests.

## Non-Pass Statement

This policy does not close #570, #369, #368, or #371. It does not move #371 out
of `Needs Figma / Reference`. It is not Day 1 notification acceptance,
runtime implementation approval, schema approval, OpenAPI approval,
generated-client approval, OCR worker approval, mobile UI approval, deep-link
approval, production readiness, or release readiness.
