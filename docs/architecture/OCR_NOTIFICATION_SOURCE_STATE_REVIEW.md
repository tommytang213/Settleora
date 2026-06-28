# OCR Notification Source-State Review

## Purpose

This docs/control review answers the source-state gate for GitHub issue
[#570](https://github.com/tommytang213/Settleora/issues/570), the OCR review
in-app notification runtime slice under
[#369](https://github.com/tommytang213/Settleora/issues/369) and
[#368](https://github.com/tommytang213/Settleora/issues/368).

It decides whether current OCR review runtime has a safe, exact source event for
`ocr.needs_review`. It does not implement notification constants, writers,
subject types, persistence, migrations, OpenAPI changes, generated-client
changes, OCR worker behavior, mobile/web/admin UI, notification deep links, OCR
apply behavior, bill finalization, settlement/payment logic, storage behavior,
auth/session/security behavior, provider delivery, Docker, deployment, CI, or
secrets.

## Current OCR Review Runtime

The current API has bill-scoped receipt OCR review intake, read, queue/list,
apply-preview, draft-only apply, and soft-remove endpoints for existing active
receipt attachments. Reviews are persisted as `ReceiptOcrReview` rows linked to
an expense bill and receipt attachment file. Each active bill/file pair can have
one active review.

Current persisted review states are only:

| Field | Supported values | Current meaning |
| --- | --- | --- |
| `status` | `provisional`, `reviewed` | Client/user-submitted review state for saved candidate OCR data. |
| `source` | `on_device`, `manual_entry`, `imported_reviewed_data` | Bounded origin category for the submitted review data. |
| `removedAtUtc` | `null` or timestamp | Soft-remove lifecycle for the saved review. |

The current runtime does not have server OCR job rows, OCR job result rows,
assignment rows, worker completion/failure states, review ownership transfer,
or a notification-specific handoff transition. It also does not run OCR,
enqueue OCR jobs, store raw OCR full text, create thumbnails, automatically
apply OCR output, finalize bills, or apply non-draft shared-bill OCR changes.

## Existing Transitions

| Transition | Actor/source | Effect | User-action meaning |
| --- | --- | --- | --- |
| Create review by `PUT .../ocr-review` | Current authenticated bill creator or owner | Creates one active `ReceiptOcrReview` for an existing receipt attachment, with submitted `status` and `source`, candidate header fields, and candidate lines. | Records candidate/review data submitted by the same actor. It does not assign new work to another user. |
| Update review by `PUT .../ocr-review` | Current authenticated bill creator or owner | Replaces saved review fields and lines, including changing `provisional` to `reviewed` or back if submitted. | Records a new submitted review version. It does not represent a server handoff. |
| Read review by `GET .../ocr-review` | Visible bill actor | Returns safe bounded review data and writes bounded read audit. | Visibility only; no review completion or assignment. |
| Queue/list review by `GET .../receipt-ocr-reviews` | Visible bill actor, optionally group-scoped | Lists visible active reviews with optional `status`/`source` filters. | Discovery/readout only; queue visibility does not create or complete work. |
| Apply preview by `GET .../ocr-review/apply-preview` | Visible bill actor | Builds a non-mutating preview with `canApply`, warnings, and block reasons. | Read-only validation; does not apply OCR or notify another user. |
| Draft apply by `POST .../ocr-review/apply` | Current authenticated bill creator or owner | Requires `status = reviewed`, supported `source`, matching `updatedAtUtc`, draft bill state, safe one-participant shape, no downstream settlement state, and valid preview. Soft-replaces OCR-applied draft items from the same review and recalculates bill draft data. | Explicit actor-driven mutation by an authorized editor; not a review-needed source event. |
| Soft-remove review by `DELETE .../ocr-review` | Current authenticated bill creator or owner | Sets `removedAtUtc`. | Removal by actor; not a needs-review event. |

## Status Interpretation

| Status | User action required? | User action complete? | Imported/client-submitted only? | Review conclusion |
| --- | --- | --- | --- | --- |
| `provisional` | Ambiguous. It indicates saved candidate data is not yet marked reviewed, but current runtime does not say who must act next. | No. It is not enough for draft apply. | Yes. It is supplied by the request body and can come from on-device/client data, manual entry, or imported reviewed data categories. | Not safe as an `ocr.needs_review` source event by itself. It can be a queue filter/readout state, but not a cross-user notification trigger. |
| `reviewed` | Usually no. It is the state required before explicit draft apply. | It means the saved review is marked reviewed by the submitter/current flow, but bill mutation is still separate. | Yes. It is also supplied by the request body. | Not a `needs_review` trigger. It is closer to "candidate review complete enough for apply validation," not server OCR completion. |

`provisional` and `reviewed` are review-data states, not worker result states.
They do not encode server OCR success/failure, confidence threshold, assignee,
responsible reviewer, reviewer notification target, or "another user must act."

## Recipient Review

Current runtime can identify visible bill actors, and mutation rights are limited
to the bill creator or bill owner. That is not enough to define a notification
recipient for `ocr.needs_review`.

Potential recipients under current runtime would be unsafe or noisy:

| Candidate recipient | Current fit | Risk |
| --- | --- | --- |
| Review creator | The creator is the actor who submitted the review row. | Self-notification would repeat the actor's own save action and create noisy self-spam. |
| Bill owner/creator when a participant can save | Current code does not allow ordinary participants to mutate/create reviews unless they are creator or owner. | No current handoff exists from participant to owner. |
| Visible bill participants | They can read/list previews where authorized. | Visibility is not responsibility; notifying all visible actors would leak noisy attention prompts. |
| Group members | Group membership helps route authorization. | It is not review assignment and could notify uninvolved users. |

Actor self-notification should not be allowed for current OCR review saves,
updates, previews, apply, or removal. It would mostly say "you just saved or
applied your own review" and would dilute the attention summary. A future OCR
notification may allow a self-target only for a distinct asynchronous worker or
background source event, such as "your server OCR job failed," after that event
policy is explicitly designed.

## Notification Candidate Decision

| OCR notification candidate | Current source-state fit | Decision | Next gate |
| --- | --- | --- | --- |
| `ocr.needs_review` | Current `provisional` rows look review-like but are created/updated by the current actor as submitted candidate data. There is no server OCR result, assignment, upload handoff, confidence threshold, or cross-user responsibility transition. | Not implementable now for current runtime. Block runtime until an exact source transition is designed. | Define a source event such as server OCR job result requiring manual review, mobile upload handoff accepted by the API, or explicit review assignment with recipient rules and self-notification policy. |
| `ocr.completed` | No server OCR worker/job runtime, completion state, or completed-but-actionable handoff exists. Current `reviewed` does not mean server OCR completed. | Blocked. | Server OCR worker/runtime source state and safe recipient/action policy. |
| `ocr.failed` | No server OCR worker/job runtime, failure state, retry policy, or safe failure metadata exists. | Blocked. | Server OCR worker/runtime source state and failure recipient/action policy. |

## Source-State Conclusion

Current OCR review runtime is not implementation-ready for #570 as an
`ocr.needs_review` notification writer. The target-reference columns from #568
make future OCR targets representable, but source-state readiness is still
missing. Adding an event constant or writer now would either:

- notify the actor about their own save/update action,
- overinterpret `provisional` as an assignment state,
- treat visibility as responsibility,
- or imply server OCR job semantics that do not exist.

The safe decision is to keep #570 in architecture/source-state review or split
it into a narrower follow-up that first designs the source transition.

[OCR needs-review notification source policy](OCR_NEEDS_REVIEW_NOTIFICATION_SOURCE_POLICY.md)
selects the recommended design-level transition: an explicit API-owned OCR
review assignment/source-state handoff that persists a responsible editor before
`ocr.needs_review` notification runtime is added. Direct runtime remains blocked
until that source state exists.

## Exact Next Implementation Task

The next task should be a docs/control or implementation-design slice titled
approximately:

`Design OCR needs-review source transition and recipient policy`

That task should choose one exact source transition before runtime work starts:

1. Server OCR worker result creates a saved OCR review and marks it
   needs-review for a responsible editor.
2. Mobile/server-mode upload handoff creates a saved review that requires a
   different authorized editor to act.
3. Explicit review assignment is added to OCR review runtime with assignee,
   recipient, and self-notification rules.

Only after that transition exists or is implementation-ready should a runtime
task add `ocr.needs_review` constants/writers/tests. `ocr.completed` and
`ocr.failed` should remain blocked until server OCR worker/job source states are
implemented.

## Validation Expectations For Later Runtime

Future OCR notification runtime should prove:

- source transition is exact and not inferred from generic review visibility;
- recipient derivation is API/domain-owned;
- actor self-notification is suppressed unless a reviewed asynchronous worker
  policy explicitly allows it;
- notification rows carry first-class safe `receiptOcrReviewId`,
  `receiptAttachmentFileId`, `expenseBillId`, and `groupId` where applicable;
- action URLs route through authorized API-backed resources;
- payloads, logs, audit metadata, and snippets exclude raw OCR text, receipt
  bytes, storage paths/object keys, filenames, worker debug output, payment
  details, private notes, and hidden bill details;
- read/archive does not mutate OCR review, bill, apply, storage, settlement,
  payment, sync, or audit state;
- OpenAPI and generated clients change only when exact runtime event types are
  implemented and reviewed.

## Non-Pass Statement

This review does not close #570, #369, #368, or #371. It is not Day 1
notification acceptance, runtime implementation approval, schema/OpenAPI
approval, generated-client approval, OCR worker approval, mobile UI approval,
deep-link approval, or production/release readiness.
