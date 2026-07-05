# Notification #689 Final Acceptance Packet

Created: 2026-07-05 14:16 HKT

Base `origin/main` SHA:
`336118e511cde55f59cfd7ba612f9bb6f3496439`

Work branch:
`docs/notification-689-final-acceptance-readiness-20260705`

## Purpose

This packet is the final acceptance/readiness review for
[#689](https://github.com/tommytang213/Settleora/issues/689), `Admin
notification policy final acceptance`, under parent
[#635](https://github.com/tommytang213/Settleora/issues/635), `Implement admin
global notification policy API and readout`.

It verifies whether the approved #635 child reference, schema/API, provider
readiness, redaction, and resolver slices are complete enough to close #689
after this packet PR is reviewed and merged. It does not close #689 or #635.

## Related Issues And PRs

Related issues:

- #635 parent admin/global notification policy API and readout: open.
- #684 schema/API/readout foundation: closed.
- #685 admin/user notification policy readout UX reference: closed.
- #686 provider readiness category foundation: closed.
- #687 policy resolver runtime foundation: closed.
- #688 readout/provider-readiness audit-redaction coverage: closed.
- #689 final acceptance: open.
- #371 notification deep links/mobile notification-open behavior: closed.
- #570 and #575 OCR needs-review notification source/runtime foundations:
  closed.
- #672 and #679 mobile visual/reference follow-up posture: closed.
- #403, #369, #368, and #634 broader notification/provider/device-token work:
  open.

Merged PR evidence:

- PR #697 `feat(api): add admin notification policy readout foundation`,
  merge SHA `b9363ab7fc8c61910f540c4c22ba94966c72b96b`.
- PR #698 `docs: update notification policy ledger after PR 697`, merge SHA
  `c0260e4611fdc3bce5d5faf8b73fa2fc2a74aa7f`.
- PR #699 `feat(api): add notification provider readiness categories`, merge
  SHA `9ed8cb49428ecb044ca2b6d102b15ef09c0e50d4`.
- PR #700 `docs: update notification provider readiness ledger`, merge SHA
  `7f78ff340c240690db664dfeccb350d97b78051e`.
- PR #701 `test(api): harden notification policy readout redaction coverage`,
  merge SHA `90e5355ba071972f1295d19ca191ce98dcd2d141`.
- PR #702 `feat(api): add notification policy decision resolver foundation`,
  merge SHA `f7d8239b963b2cbc2ba4fb9a852c25c92645f1be`.
- PR #703 `docs: record notification resolver merge closure`, merge SHA
  `336118e511cde55f59cfd7ba612f9bb6f3496439`.

## Acceptance Checklist

| Check | Status | Evidence |
| --- | --- | --- |
| #684 schema/API/readout foundation complete | Pass | PR #697 merged the read-only guarded `GET /api/v1/admin/notification-policy`, EF schema foundation, OpenAPI contract, regenerated clients, redaction/category normalization, and focused schema/API tests. Ledger keeps #684 closed. |
| #685 UX/readout reference complete | Pass | `docs/design/notifications/NOTIFICATION_POLICY_READOUT_UX_REFERENCE.md` defines admin/user/mobile/web readout states, copy, redaction, and no-delivery-success language. Ledger and live issue readback keep #685 closed. |
| #686 provider readiness category foundation complete | Pass | PR #699 added `INotificationProviderReadinessService` and `NotificationProviderReadinessSnapshotService`; email/mobile push readiness remains bounded category readout and `externalProviderAttemptAllowed` remains `false`. |
| #688 current readout/provider-readiness redaction coverage complete | Pass | PR #701 added endpoint and helper coverage for forbidden provider, token, storage, OCR, payment, hidden bill, private-note, and auth/session material. Ledger keeps #688 closed for the approved current surface. |
| #687 resolver runtime foundation complete | Pass | PR #702 added scoped `INotificationDecisionPolicyResolver`, applies persisted policy and provider-readiness categories into the existing envelope resolver, and preserves `MayAttemptExternalProvider=false`. Ledger keeps #687 closed. |
| #371 notification-open/deep-link posture preserved | Pass | No #689-chain PR changed notification-open/deep-link runtime. #371 remains closed by live issue readback and ledger posture. |
| API/domain owns policy reads and runtime resolution | Pass | `AdminNotificationPolicyEndpoints.cs`, `AdminNotificationPolicyReadoutService.cs`, and `NotificationDecisionPolicyResolver.cs` keep policy readout and resolver composition in API/domain services behind authenticated owner/admin read authorization where public. |
| In-app Day 1 baseline preserved | Pass | Default readout keeps in-app enabled/configured/available and required in-app enabled. Resolver keeps in-app eligible where event, recipient, authorization, and content safety pass. |
| Email/mobile push remain future/provider-candidate only | Pass | Readout and resolver keep external attempt flags false. Provider readiness can be configured/limited as a category, but current runtime does not send, enqueue, or claim provider success. |
| Admin/global caps and provider readiness cannot be widened by preferences | Pass | Resolver merges request/user preference with persisted caps and readiness by narrowing existing channel policy; disabled/unsupported/unconfigured/readiness blocks short-circuit before future-provider eligibility. |
| Provider readiness exposes no secrets and creates no delivery attempts | Pass | Snapshot service derives only safe category strings from options and current push options; endpoint tests assert forbidden strings are absent. |
| OpenAPI/generated clients aligned with read-only endpoint | Pass | OpenAPI includes only `GET /api/v1/admin/notification-policy` for this admin policy surface and response schema restricts `externalProviderAttemptAllowed` to `false`; PR #697 regenerated web/Dart clients and validation passed. Current task did not change OpenAPI or generated clients. |
| Validation confirms current state | Pass, pending final PR checks | Final validation commands are recorded in this task report. Required local validation passed before PR opening. |

## Current Behavior Evidence

Runtime/API evidence:

- `services/api/src/Settleora.Api/Notifications/AdminNotificationPolicyEndpoints.cs`
  maps only `GET /api/v1/admin/notification-policy`, requires
  `SystemRoleOwnerOrAdmin`, rejects unsupported query fields, and rejects
  request bodies.
- `services/api/src/Settleora.Api/Notifications/AdminNotificationPolicyReadoutService.cs`
  returns default or persisted server-authoritative readout categories, keeps
  in-app enabled as the baseline, and always returns
  `ExternalProviderAttemptAllowed: false`.
- `services/api/src/Settleora.Api/Notifications/NotificationProviderReadinessSnapshotService.cs`
  derives email readiness as `disabled`, `unconfigured`, or `configured` from
  safe option completeness and keeps mobile push conservative as
  `disabled`/`unconfigured`.
- `services/api/src/Settleora.Api/Notifications/NotificationPolicyReadoutRedactor.cs`
  normalizes unsupported values into bounded categories.
- `services/api/src/Settleora.Api/Notifications/NotificationDecisionEnvelopeResolver.cs`
  keeps in-app write eligibility separate from external channels and returns
  `MayAttemptExternalProvider=false` for external decisions.
- `services/api/src/Settleora.Api/Notifications/NotificationDecisionPolicyResolver.cs`
  loads the active persisted admin/global policy, applies event-family
  overrides, consumes safe provider-readiness categories, and narrows existing
  request channel policy before invoking the envelope resolver.

Contract evidence:

- `packages/contracts/openapi/settleora.v1.yaml` documents only the read-only
  admin policy endpoint for this surface.
- `AdminNotificationPolicyChannelReadout.externalProviderAttemptAllowed` is
  a boolean enum restricted to `false`.
- Response descriptions explicitly exclude provider configuration,
  SMTP/APNs/FCM secrets, raw device tokens, provider payloads, OCR text,
  storage internals, payment details, private notes, hidden bill data,
  auth/session token material, and unrelated user data.

Test evidence:

- `AdminNotificationPolicyEndpointTests.cs` covers owner/admin read access,
  ordinary-user denial, unsupported query/body rejection, forbidden-detail
  absence, schema contract expectations, and external provider attempt flags.
- `NotificationProviderReadinessServiceTests.cs` covers bounded readiness
  derivation and forbidden provider/token/secret detail absence.
- `NotificationPolicyReadoutRedactorTests.cs` covers fail-closed
  normalization of unsafe category strings.
- `NotificationDecisionPolicyResolverTests.cs` covers admin-disabled
  precedence, provider unconfigured mapping, user preference narrowing,
  quiet-hours/digest deferral, required in-app preservation, and future
  provider eligibility without attempts.
- `NotificationDecisionEnvelopeResolverTests.cs` covers in-app baseline,
  unsupported/unauthorized/unsafe short-circuits, recipient preference
  narrowing, and no external provider attempts.

Report evidence:

- `.codex/reports/settleora-codex-report-20260704-2258-notification-684-policy-readout-pr697-merge-gate.md`
- `.codex/reports/settleora-codex-report-20260705-0009-notification-686-provider-readiness-pr699-merge-gate.md`
- `.codex/reports/settleora-codex-report-20260705-0116-notification-688-redaction-pr701-merge-gate.md`
- `.codex/reports/settleora-codex-report-20260705-1335-notification-687-resolver-pr702-merge-gate.md`
- `.codex/reports/settleora-codex-report-20260705-1403-notification-687-ledger-pr703-merge-gate.md`

## Explicit No-Scope Confirmation

This acceptance packet and the reviewed #689 readiness scope do not implement,
approve, or change:

- Provider sending, SMTP/APNs/FCM provider SDK activation, provider attempts,
  provider success, delivery success, delivery receipts, outbox workers, or
  external message bodies.
- Provider secrets/config values, secret storage, `.env`, Docker/compose,
  deployment, CI, hosted activation, private hostnames, provider dashboards, or
  operator diagnostics.
- Device-token lifecycle, protected token storage, push permission UX, token
  fingerprints, #634 behavior, APNs/FCM token use, or mobile provider binding.
- Admin notification policy mutation/write/update/delete APIs, policy mutation
  audit, admin policy UI, user web UI, mobile UI, Figma output, screenshots, or
  admin public exposure.
- #371 notification-open/deep-link behavior.
- Schema/migration expansion beyond already-merged #684 schema foundation.
- OpenAPI or generated-client expansion beyond the already-merged read-only
  admin policy endpoint and generated clients.
- Money, settlement, bill calculation, payment details, proof behavior, OCR
  runtime, storage/file-byte behavior, sync, reconciliation, import/export,
  backup/restore, or source-domain business authority.
- Auth/session runtime, session storage, credential handling, MFA/passkey
  runtime, security runtime, or secret-handling behavior beyond existing
  owner/admin endpoint authorization.

## Recommendation For #689

Recommend closing #689 only after this acceptance packet PR is reviewed and
merged.

Rationale:

- The prerequisite #635 child slices are complete for the approved readout-first
  runtime scope: #684, #685, #686, #687, and #688 are closed and their merged
  PRs/reports provide current evidence.
- The current repo state preserves the required safety boundaries: API/domain
  authority, in-app baseline, future-only external providers, no provider
  secrets, no fake delivery success, admin/global caps that cannot be widened
  by preferences, bounded provider readiness, redaction coverage, aligned
  read-only OpenAPI/generated clients, and no #371 regression.
- Remaining broader notification/provider/admin UI/write behavior is explicitly
  outside #689's close scope and stays tracked as future gates.

## Recommendation For #635

Keep #635 open.

Reason:

- #635 is the parent admin/global notification policy API/readout issue. Its
  original close rule allows closure only after a focused reviewed
  implementation PR or explicit deferral decision.
- Current work completes the approved readout-first child chain and supports
  closing #689 after this packet merges, but #635 still has broader parent
  gates that are not satisfied by this packet: admin policy mutation/write
  behavior, mutation audit, admin/user/mobile UI/readout surfaces, provider
  activation/config/secrets/sending, device-token/provider integration, and
  broader #403/#369/#368/#634 notification/provider work.
- No issue body/comment evidence reviewed for this packet clearly authorizes
  closing #635 now. Ambiguous parent closure must stay open.

## Remaining Future Gates Outside #689 Close Scope

- Admin notification policy write/update/delete API and policy mutation audit.
- Admin/operator UI, user web UI, mobile UI, and any Figma/reference execution.
- SMTP/APNs/FCM provider activation, provider config/secrets, provider SDKs,
  outbox/delivery attempts, provider result handling, retry/expiry policy, and
  delivery-state audit.
- Push provider/device-token integration and #634 follow-up behavior.
- Broader Day 1 notification event coverage, delivery-state, preference, and
  provider-parent work under #403, #369, #368, and #634.
- Any future OpenAPI/schema/generated-client expansion beyond the existing
  read-only admin policy endpoint.
