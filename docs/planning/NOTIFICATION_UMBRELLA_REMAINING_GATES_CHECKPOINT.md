# Notification Umbrella Remaining Gates Checkpoint

Created: 2026-07-05 19:00 HKT

Verification timestamp: 2026-07-05 18:57 HKT / 2026-07-05 10:57 UTC

Verified `origin/main` SHA:
`da99be532875feed8adf26c07de2978135d8da85`

Work branch:
`docs/notification-umbrella-remaining-gates-checkpoint-20260705`

## Purpose

This checkpoint records the current notification umbrella posture after the
#707 through #713 planning and merge-gate sequence. It prevents stale open
umbrella issues from being read as blank, untriaged work and prevents closed
child issues from being read as broader notification completion.

This is docs/planning issue hygiene only. It does not approve or implement
runtime notification writers, event constants, handlers, auth/session/security
runtime, API behavior, OpenAPI, generated clients, schema/migrations, provider
sending, provider secrets/config, device-token lifecycle, delivery attempts,
admin write APIs, mobile/web/admin UI, Figma output, #371 behavior, money,
settlement, bill, OCR, storage, sync, reconciliation, deployment, Docker/env,
CI, CodeMagic/TestFlight behavior, secrets, issue closure/reopen, or Project
field mutation.

## Inputs Reviewed

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- Active `.ai/*` control files
- `docs/planning/ISSUE_PROGRESS_LEDGER.md`
- `docs/planning/NOTIFICATION_369_REMAINING_EVENT_COVERAGE_GATE_REVIEW.md`
- `docs/planning/NOTIFICATION_369_AUTH_SECURITY_SOURCE_DECISION_PACKET.md`
- `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_SOURCE_DESIGN_PACKET.md`
- `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_TARGET_EVENT_DESIGN_PACKET.md`
- `docs/planning/NOTIFICATION_369_SESSION_REVOCATION_RUNTIME_READINESS_DECISION_PACKET.md`
- `docs/planning/NOTIFICATION_635_PARENT_REMAINING_GATES_DECISION_PACKET.md`
- `docs/architecture/AUTH_IDENTITY_FOUNDATION.md`
- `docs/architecture/AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md`
- `docs/architecture/PASSWORD_HASHING_POLICY.md`
- Recent `.codex/reports/` for PRs #707, #708, #709, #710, #711,
  #712, and #713
- `.codex/reports/settleora-codex-report-20260705-1852-npm-dependabot-alerts-triage-remediation-pr-open.md`
- Live GitHub issue readback for #368, #369, #403, #634, #635, #371,
  #570, and #575
- Live GitHub PR readback for #707 through #713

## Live Issue Readback

| Issue | Live state | Checkpoint posture |
| --- | --- | --- |
| #368 `E9 Notifications` | `OPEN` | Keep open as the parent notification epic while child/umbrella runtime gates remain. |
| #369 `Complete Day 1 in-app notification event coverage` | `OPEN` | Keep open because session-revocation notification runtime is `BLOCKED_PENDING_MANUAL_DECISIONS`, and broader Day 1 notification coverage remains incomplete. |
| #403 `Expand Day 1 email, push provider, device-token, preference, delivery-state, policy, and QA issue set` | `OPEN` | Keep open for provider, email, push, preference, delivery-state, policy, and QA umbrella scope. Current repo evidence does not prove that umbrella complete. |
| #634 `Implement mobile push device-token API and provider-neutral delivery runtime` | `OPEN` | Keep open for push provider, device-token, provider-neutral delivery, mobile registration, provider activation, and feedback cleanup gates. |
| #635 `Implement admin global notification policy API and readout` | `OPEN` | Keep open for admin notification policy API/readout/write/update/delete/runtime/UI/provider gates beyond the accepted readout-first chain. |
| #371 `Implement notification deep links for Day 1 flows` | `CLOSED` | Keep closed unless a concrete regression is found. Its accepted notification-open/deep-link scope closed after final acceptance and ledger hygiene. |
| #570 `Implement OCR review in-app notification runtime` | `CLOSED` | Keep closed unless a concrete regression is found. It completed the narrow `ocr.needs_review` assignment-runtime slice only. |
| #575 `Add OCR review needs-review assignment/source state` | `CLOSED` | Keep closed unless a concrete regression is found. It completed the OCR needs-review assignment/source-state prerequisite only. |

Closed notification planning children #448, #449, #450, #451, and #452
remain completed for their docs/control or UX-reference scopes. They do not
close the provider, delivery-state, admin, push, or remaining event-family
runtime umbrellas.

## Recent PR Readback

| PR | State | Merge SHA | Completed slice |
| --- | --- | --- | --- |
| #707 | `MERGED` | `8ec5a7c854c40072e7e8418bab865c774fd68c01` | Added the #369 remaining notification event coverage gate review and ledger update. |
| #708 | `MERGED` | `43b9f484ae32963082a529c710491b06efc32aa1` | Recorded PR #707 ledger hygiene. |
| #709 | `MERGED` | `49c3826c2342ffd2e2fd34c35457504d9e494100` | Added the auth/session/security notification source decision packet. |
| #710 | `MERGED` | `7649f7da951a417a3a2d0d73edd4fee21bdde3d3` | Fixed mobile CodeMagic/TestFlight visual-test selection; this is not notification umbrella completion. |
| #711 | `MERGED` | `f6cca35aa4b1cab3f692d3c178df552b8e1c464a` | Designed the narrow #369 session-revocation notification source gate. |
| #712 | `MERGED` | `8e4178b811354b7fc0377fa2d7955aa26d64bf61` | Designed the #369 session-revocation target/event shape. |
| #713 | `MERGED` | `da99be532875feed8adf26c07de2978135d8da85` | Decided #369 session-revocation runtime readiness as `BLOCKED_PENDING_MANUAL_DECISIONS`. |

## Completed Notification Planning And Design Slices

The current repo has completed useful planning/design and foundation slices:

- Notification event coverage review and target-reference planning for
  current supported event families.
- Current-user in-app notification list, summary, read, archive, and safe
  response foundations.
- Current-user notification preference persistence/read/update foundation,
  without claiming full server-side suppression or provider delivery.
- Provider/preference/delivery-state planning and foundations, including
  decision envelopes, delivery-attempt persistence, worker/outbox foundation,
  disabled SMTP foundation, provider-neutral push foundation, and provider
  readiness readouts.
- Admin/global notification policy readout-first chain, including read-only
  guarded admin policy readout, provider-readiness category/readout input,
  resolver wiring, redaction coverage, and final acceptance for the accepted
  child chain.
- Push token lifecycle architecture, push token protection design, current-user
  push device-token API foundation, and disabled/unconfigured provider-neutral
  push runtime foundation.
- Notification-open/deep-link docs, reference, Flutter implementation, final
  ledger acceptance, and #371 closure for the accepted current mobile route
  families.
- OCR needs-review source-state and runtime slices for explicit API-owned
  assignment creation/retarget transitions only.
- Sync conflict and sync operation failed runtime slices for their exact
  persisted source states.
- Settlement residual review-needed runtime for the receiver-review handoff
  that already exists.
- #369 auth/session/security source decision, session-revocation source design,
  session-revocation target/event design, and runtime readiness decision.

These completed slices are real progress, but none of them proves complete
Day 1 notification acceptance across all event families, channels, admin
policy, provider activation, mobile push registration, or external delivery.

## Remaining Day 1 Gates

- #369 event-family coverage remains incomplete. Open areas include
  `ocr.completed`, `ocr.failed`, remaining sync queued/retry/resolved/
  conflict-resolution events, auth/session/security runtime, item
  claim/split/creator-review notifications, and broader settlement mismatch or
  debtor-decision notifications until exact source states and recipient policy
  exist.
- #368 remains the parent epic until child/umbrella runtime gates are either
  implemented, split, deferred, or explicitly accepted.
- #403 remains open for provider/email/push/preference/delivery-state/policy
  and QA umbrella scope.
- #634 remains open for real push provider/device-token/provider-neutral
  delivery runtime gates, including APNs/FCM/provider activation, mobile
  registration/permission UX, hosted activation, and provider feedback cleanup.
- #635 remains open because the accepted readout-first chain did not implement
  admin policy mutation/write/update/delete APIs, mutation audit, admin/operator
  UI, user/mobile readouts, provider sending/config/secrets, device-token
  provider integration, or future OpenAPI/schema/generated-client expansions.
- Final Day 1 notification acceptance, release readiness, manual UI retest,
  and manual code review remain incomplete.

## Manual Decisions Still Needed Before Runtime

For the narrow #369 `security.session_revoked` candidate:

- Approve `security.session_revoked` as a user-facing in-app security
  notification for user-initiated current-account per-session revocation.
- Approve actor self-notification for this exact safety-confirmation event.
- Approve `subjectType: auth_session` and first-class `authSessionId`.
- Approve the minimal schema/OpenAPI/generated-client boundary required to
  expose the event, subject, and target safely.
- Confirm writer placement, duplicate/idempotency behavior, transaction
  behavior, and auth audit correlation after successful revocation.
- Confirm redaction rules for notification rows, API responses, logs, tests,
  reports, safe summaries, and any future provider snippets.

For broader notification umbrellas:

- Decide whether admin policy mutation/write APIs are Day 1 or deferred.
- Approve any schema/migration and OpenAPI/generated-client work before
  implementation tasks start.
- Decide provider activation posture for SMTP, APNs, and FCM, including
  secrets/config/deployment boundaries.
- Approve mobile push registration/permission UX and any required Figma or
  equivalent reference before mobile implementation.
- Confirm whether remaining event families should be implemented now, split,
  or explicitly deferred.

## Future Implementation Gates

Future implementation PRs must be narrowly scoped and validate against their
actual diff. Expected gates include:

- Source-state authority and recipient tests before any new event writer.
- Redaction tests for notification rows, API responses, logs, test snapshots,
  provider snippets, and reports.
- Schema/migration review for any new notification target persistence or
  policy tables.
- OpenAPI and generated-client review/regeneration when public response shapes
  or enum values change.
- API/domain authorization tests for target re-fetch and stale/unavailable
  fallback behavior.
- Provider-disabled and no-fake-success tests for email/push/provider-neutral
  paths.
- Mobile validation only when Flutter/mobile files change.
- No Docker/deployment/env/CI/provider-secret work unless a task explicitly
  approves that surface.

## Blockers

- #369 session-revocation runtime is blocked by manual auth/security,
  self-notification, target, schema/OpenAPI/generated-client, writer,
  duplicate/transaction, and redaction/audit decisions.
- OCR completed/failed notifications are blocked by absent server OCR
  worker/job result source states.
- Remaining sync events are blocked by exact persisted user-actionable source
  transitions and recipient/action semantics.
- Item claim/split/creator-review notifications are blocked by claim/source
  runtime plus money/Figma/manual gates.
- Push provider work is blocked by provider setup/secrets/deployment/mobile
  registration/permission/provider feedback gates.
- Admin notification policy work is blocked by admin/security/manual,
  schema/OpenAPI/generated-client, mutation audit, and UI/reference gates.

## Dependency Alert Posture

The npm Dependabot triage task at 2026-07-05 18:52 HKT read live GitHub
Dependabot alerts and found `0` open alerts. It created no dependency diff and
opened no PR. Do not invent dependency remediation work from this checkpoint.

## Next-Action Options

### Option A

Prepare a manual approval package for the narrow #369
`security.session_revoked` runtime implementation gate. This should answer the
manual auth/security, self-notification, `auth_session`/`authSessionId`,
schema/OpenAPI/generated-client, writer, duplicate/transaction, and redaction
questions before any runtime branch starts.

### Option B

Keep #369 runtime blocked and continue non-security notification provider/admin
planning or other Day 1 implementation lanes, such as #635 admin policy
posture, #634 provider/mobile push gates, or another non-security Day 1 lane.

### Option C

After this checkpoint merges, create focused issue/PR hygiene comments that
link this document and ledger entry. Do not close, reopen, or mutate Project
fields unless a separate task explicitly requests those changes.

## Close And Keep-Open Recommendations

- Keep #369 open.
- Keep #368 open.
- Keep #403 open.
- Keep #634 open.
- Keep #635 open.
- Keep #371 closed unless a concrete regression is found.
- Keep #570 closed unless a concrete regression is found.
- Keep #575 closed unless a concrete regression is found.

## Scope Guard

This checkpoint changes documentation only. It does not change runtime code,
API behavior, OpenAPI, generated clients, schema/migrations, notification
writers/constants/event handlers, provider sending, provider config/secrets,
device-token lifecycle, delivery attempts, admin policy mutation/write API,
UI/Figma, #371 behavior, auth/session/security runtime, login/current-user/
session middleware/token issuance/revocation endpoints, money/settlement/bill/
OCR/storage/sync/reconciliation behavior, deployment/CI/Docker/env/CodeMagic/
TestFlight behavior, secrets, issue closure/reopen, or Project fields.
