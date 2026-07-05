# #369 Remaining Notification Event Coverage Gate Review

## Purpose

This packet records the current state of GitHub issue #369,
`Complete Day 1 in-app notification event coverage`, after the #635/#689
admin notification policy/readout chain completed its accepted readout-first
scope through PR #706.

This is a docs/planning decision digest only. It does not implement runtime
notification event writers, constants, source transitions, API behavior,
OpenAPI/generated clients, schema/migrations, provider delivery, UI, mobile
behavior, auth/session/security runtime, money/settlement/bill logic, OCR
runtime, storage/file behavior, sync/reconciliation behavior, deployment, CI,
Docker/env, issue closure, Project mutation, or secrets.

## Current Issue Posture

Live GitHub readback during this task showed:

| Issue | State | Current posture |
| --- | --- | --- |
| #369 | `OPEN` | Keep open. Several Day 1 event families are complete or evidenced, but remaining source-state/manual gates are still unresolved. |
| #368 | `OPEN` | Keep open as the E9 Notifications parent epic. |
| #403 | `OPEN` | Keep open for broader email, push/provider, device-token, preference, delivery-state, policy, and QA work. |
| #634 | `OPEN` | Keep open for real push provider/device-token/mobile/provider gates beyond the provider-neutral foundations. |
| #635 | `OPEN` | Keep open. The readout-first child chain is complete, but #635 still has broader parent gates and is not the target of this packet. |
| #371 | `CLOSED` | Keep closed unless a concrete regression is found. Do not redo notification-open/deep-link work under #369. |
| #570 | `CLOSED` | Keep closed for the narrow `ocr.needs_review` runtime slice. |
| #575 | `CLOSED` | Keep closed for the OCR needs-review assignment/source-state prerequisite. |

## Completed Or Sufficiently Evidenced #369 Slices

The current repo and ledger provide enough evidence for these #369-related
families or foundations:

- In-app notification foundation: guarded current-user list, summary,
  read/archive endpoints, safe response shape, writer safety, and schema
  constraints.
- Current-user notification preferences foundation: persisted current-user
  preference read/update APIs and safe readout infrastructure, without claiming
  server-side suppression, digest workers, provider delivery, or group mute
  completion.
- Bill workflow and bill revision events: current event constants, writers, and
  tests cover submitted, participant accepted/rejected, confirmed, and revision
  proposed/resubmitted/submitted/withdrawn/approved/rejected/payer-confirmed/
  applied flows.
- Settlement events for implemented source transitions: request created,
  payment marked paid, payment partially paid, payment confirmed, request and
  payment disputed/cancelled, proof attached, and the dedicated
  `settlement.residual_review_needed` pending residual handoff.
- Recurring events for implemented source transitions: `recurring_bill.due_soon`
  and `recurring_bill.draft_generated`.
- OCR needs-review: #575 added explicit API-owned assignment/source state and
  #570/PR #626 added the narrow `ocr.needs_review` runtime for assignment
  creation/retarget transitions only.
- Sync conflict/failure: `sync.conflict_detected` is implemented for newly
  persisted conflict rows and `sync.operation_failed` is implemented for newly
  persisted current-actor rejected sync operation rows.
- Notification target references for implemented OCR/sync handoffs:
  `receiptOcrReviewId`, `receiptAttachmentFileId`, and `syncOperationId` are
  first-class safe response targets where used by merged runtime slices.
- Notification-open/deep-link behavior: #371 is closed after reference,
  Flutter implementation, and final ledger acceptance work. This is not a
  reason to reopen #371 for new #369 source families.
- Provider/policy foundations adjacent to #369: #629 decision-envelope, #633
  delivery-state worker foundation, #632 disabled-by-default SMTP runtime
  foundation, #634 provider-neutral push foundations, and #635/#684/#686/#687/
  #688/#689 readout-first policy chain are useful infrastructure evidence, but
  they are not full #369 event-family completion.

## Remaining Open Event-Family Gaps

These are still open or blocked:

- OCR `ocr.completed` and `ocr.failed`: blocked until server OCR worker/job
  result source states, retry/failure semantics, recipients, safe targets, and
  validation exist.
- Sync/offline queued/retry/resolved/conflict-resolution events: blocked until
  exact persisted source transitions exist. Ordinary queued/retrying churn
  remains deferred by `SYNC_NOTIFICATION_SOURCE_POLICY.md`.
- Auth/session/security events: blocked by manual auth-security policy,
  approved event semantics, first-class safe targets, recipient/self-notification
  rules, bypass/suppression posture, and redaction/external-snippet review.
- Item claim/split/creator-review events: blocked until item-claim/split source
  runtime, stable claim/item targets, money-domain policy, and UI/Figma/manual
  gates exist.
- Broader settlement mismatch/review and debtor residual-decision events:
  blocked until exact settlement review/decision source states and recipient
  policy exist. The current residual handoff covers receiver review needed only.
- Provider/delivery-state-adjacent items: SMTP, push, outbox, delivery attempts,
  provider readiness, and policy resolver foundations do not close #369 event
  coverage. Real provider success, delivery receipts, digests, APNs/FCM/SMTP
  activation, secrets/config, admin/operator UI, and user/mobile readouts remain
  separate #403/#634/#635 gates.

## Dependency Mapping

- #368 is the open E9 Notifications parent. #369 should remain a child/runtime
  tracker until remaining source families are either implemented or explicitly
  split/deferred.
- #403 remains open for broader provider/channel/preference/delivery-state
  expansion. Do not count #403 provider foundations as #369 event-family
  acceptance.
- #634 remains open for mobile push/device-token/provider work. The merged
  provider-neutral push foundation is not real APNs/FCM activation, provider
  success, mobile permission UX, or production push readiness.
- #635 remains open and is not the target of this packet. PR #706 records that
  #689 closed the accepted readout-first child chain, while admin policy
  mutation/write API, mutation audit, admin/operator UI, user/mobile readouts,
  provider sending/config/secrets, and future contract/schema expansions remain
  parent gates.
- #371 remains closed. Future event families may need route-family extensions,
  but no #371 redo is authorized without a concrete regression or a separate
  approved follow-up.
- #570 remains closed for `ocr.needs_review` assignment-runtime completion.
  It must not be treated as `ocr.completed`/`ocr.failed` completion.
- #575 remains closed for OCR needs-review assignment/source state. It is a
  prerequisite already consumed by #570, not an open blocker now.

## Safest Next Slice

Do not start a runtime notification writer merely because #369 remains open.
The safest next narrow work is a docs/design/manual decision gate for
auth/session/security notification target references and source-event semantics,
because this is the highest-risk required Day 1 family still lacking approved
event names, recipients, safe targets, redaction, and suppression/bypass policy.

Recommended task shape:

- Branch:
  `docs/auth-session-security-notification-target-reference-decision-369-YYYYMMDD`
- Work type:
  docs/design, manual auth-security gate, no runtime.
- Output:
  exact candidate events, source transitions, recipient/self-notification rules,
  first-class safe target-reference proposal, authorized re-fetch path, redaction
  requirements, and a yes/no recommendation for one later runtime slice.
- Stop condition:
  no runtime/API/OpenAPI/schema/generated-client/auth behavior changes until
  the manual auth-security decision is recorded.

If the product priority is provider/operator readiness rather than event-family
runtime, continue under #635/#403/#634 instead. That should not be presented as
#369 completion.

## Close And Split Recommendations

- Keep #369 open. It is not ready to close and should not be marked complete.
- Keep #368 open as the parent epic.
- Keep #403, #634, and #635 open for their broader provider/policy/device-token
  gates.
- Keep #371 closed unless a concrete regression is found.
- Keep #570 and #575 closed unless a concrete regression is found.
- Future child splits are appropriate for:
  auth/session/security source-target decision, OCR completed/failed source
  runtime, sync retry-exhaustion/conflict-resolution runtime, item
  claim/split/owner-review runtime, and any settlement mismatch/debtor-decision
  notification source policy.

## Scope Guard

This packet changes documentation only. It confirms no issue closure/reopen,
Project mutation, runtime/API/OpenAPI/generated-client/schema/provider/UI/auth/
money/storage/OCR/sync/deployment/secret change is made or authorized here.
