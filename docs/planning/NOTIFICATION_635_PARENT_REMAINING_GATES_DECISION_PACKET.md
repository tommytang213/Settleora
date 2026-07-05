# Notification #635 Parent Remaining Gates Decision Packet

Created: 2026-07-05 15:02 HKT

Verification timestamp: 2026-07-05 15:00 HKT / 2026-07-05 07:00 UTC

Current `origin/main` SHA:
`8d203a49e9ff9355d78c4d38cd7d28115bb70d36`

Work branch:
`docs/notification-635-parent-remaining-gates-decision-20260705`

## Purpose

This packet records the parent decision posture for
[#635](https://github.com/tommytang213/Settleora/issues/635), `Implement admin
global notification policy API and readout`, after the readout-first child
chain #684/#685/#686/#687/#688/#689 completed and #689 closed.

It answers what the merged chain completed, what remains outside the accepted
#689 close scope, and whether #635 should close now. It does not close #635 and
does not approve runtime/provider/UI/mutation work.

## Live Issue Posture

Live GitHub readback at the verification timestamp:

- #635 `OPEN`.
- #689 `CLOSED`.
- #684, #685, #686, #687, and #688 `CLOSED`.
- #403, #369, #368, and #634 `OPEN`.
- #371 `CLOSED`.

No live #635 body/comment evidence reviewed for this packet authorizes closing
#635 now. The latest #635 comments explicitly keep #635 open after #689 because
broader parent gates remain.

## Completed Merged Chain

- #684 / PR #697 established the read-only guarded admin notification policy
  readout foundation, EF schema foundation, OpenAPI contract, regenerated
  web/Dart clients, bounded category readout, and focused tests.
- #685 established the admin/user/mobile/web policy readout UX reference
  posture as reference-only guidance, not UI implementation.
- #686 / PR #699 established provider-readiness category/readout runtime
  foundation for email and mobile push without provider sending, provider
  config/secrets, OpenAPI changes, schema changes, UI, or deployment changes.
- #688 / PR #701 added focused redaction/readout coverage for the current
  admin policy readout and provider-readiness surface.
- #687 / PR #702 added the narrow API/domain notification decision policy
  resolver foundation that consumes active admin/global policy and bounded
  provider-readiness categories while preserving no external provider attempts.
- #689 / PR #704 merged the final acceptance packet for the approved
  readout-first chain and then #689 was closed.
- PR #698, #700, #703, and #705 recorded ledger hygiene for the completed
  child-chain and final acceptance posture where relevant.

## Current Accepted Behavior

Accepted after the merged chain:

- A read-only guarded admin/global notification policy readout exists at
  `GET /api/v1/admin/notification-policy` for authenticated owner/admin
  callers.
- API/domain services own readout and resolver authority. Clients and generated
  clients do not become policy, authorization, provider-readiness, or delivery
  authority.
- In-app remains the Day 1 baseline where the event is supported, eligible,
  authorized, implemented, and privacy-safe.
- Email and mobile push remain category/readout/future-provider paths only.
- External provider attempt flags remain `false`; the accepted chain does not
  send, enqueue, attempt, or claim provider delivery success.
- Provider readiness is bounded and secret-free. It may expose safe readiness
  categories, not SMTP/APNs/FCM secrets, raw tokens, provider payloads, raw
  provider errors, private hostnames where sensitive, payment details, OCR
  text, storage internals, auth/session material, or hidden business data.
- User/group preferences can narrow only. They cannot widen admin/global caps,
  invent provider readiness, override content safety, authorize recipients, or
  suppress required in-app behavior unless a future reviewed policy explicitly
  allows it.
- #371 notification-open/deep-link posture remains unchanged and closed; the
  #635 readout-first chain did not alter notification-open routing behavior.

## Remaining Gates

| Remaining item | Recommended posture | Reason |
| --- | --- | --- |
| Admin notification policy write/update/delete API | Day 1/manual-decision gate before implementation | #635 body allows read/update scope, but the merged chain intentionally implemented read-only readout first. Mutation would need explicit admin/security, API, validation, and audit approval. |
| Policy mutation audit / production audit plumbing | Day 1/manual-decision gate tied to mutation work | Current coverage proves bounded readout redaction; it does not implement production mutation audit events or storage for policy diffs. |
| Admin/operator UI and Figma/UI approval | Manual-decision and UI-gated | #685 is reference-only. No admin web UI, Figma artifact, screenshots, or operator workflow was implemented or approved. |
| User/mobile readout UI surfaces if ever approved | Future-gated/manual UI decision | Normal user/mobile policy readouts remain design/reference posture only and require separate surface-specific approval and implementation. |
| SMTP/APNs/FCM activation, provider config/secrets, provider SDKs | Future-gated/provider/security/deployment gate | Provider readiness currently exposes categories only. It does not add credentials, SDK activation, deployment config, provider dashboards, or sending. |
| Outbox/delivery attempts, provider result handling, retry/expiry, delivery-state audit | Future-gated under notification/provider delivery work | The accepted resolver keeps external attempts false and does not create an outbox, worker attempt row, retry policy, expiry policy, or provider result audit. |
| Push provider/device-token integration and #634 behavior | Future-gated under #634 and related provider work | #634 remains open. The #635 chain did not change device-token provider binding, mobile push permission UX, token handling, or APNs/FCM token use. |
| Broader notification/provider/event coverage under #403/#369/#368/#634 | Open parent/provider/event coverage work | Those issues remain open and still own broader notification event coverage, delivery-state, provider, device-token, and QA scope. |
| Future OpenAPI/schema/generated-client expansion beyond the read-only endpoint | Manual OpenAPI/schema/generated-client gate | PR #697 added only the read-only endpoint contract and generated clients. Any mutation, current-user readout, provider-readiness endpoint, or delivery-state contract expansion needs explicit review. |

## Close Or Keep-Open Recommendation

Recommendation: keep #635 open.

Rationale:

- #689 closure confirms the approved readout-first child chain is complete. It
  is not evidence that provider sending, admin mutation, UI, device-token
  provider integration, broader event coverage, or future OpenAPI/schema
  expansion is complete.
- #635's close rule requires a focused reviewed implementation PR or explicit
  deferral decision. The current repo and live issue comments show a completed
  readout-first implementation chain plus remaining parent gates, not an
  unambiguous parent close or deferral authorization.
- #403, #369, #368, and #634 remain open for adjacent broader
  notification/provider/device-token/delivery-state work.

The next safe action is a human/product decision: either keep #635 open as the
parent tracker for the remaining gates above, or explicitly split/defer the
remaining mutation/UI/provider/device-token/OpenAPI work into separate issues
with a clear close rule for #635. This packet does not perform that issue
closure or split.

## Explicit No-Scope Confirmation

This packet does not change runtime code, API behavior, OpenAPI, generated
clients, schema/migrations, tests, provider sending, provider config/secrets,
device-token lifecycle, admin policy mutation/write API, admin/user/mobile UI,
Figma, #371 behavior, money/settlement/bill/OCR/storage/sync/reconciliation
behavior, deployment, Docker/env, CI, auth/session/security runtime, or
secrets.
