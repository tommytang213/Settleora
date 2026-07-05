# #369 Auth/Session/Security Notification Source Decision Packet

## Purpose

This packet answers whether auth/session/security notification event coverage is
ready for a future narrow runtime implementation slice under GitHub issue #369.

Decision: not ready for runtime yet. The current auth/session/security runtime
has real API-owned source state, but #369 still needs a manual auth-security
decision plus a target-reference/schema/OpenAPI design before any notification
writer, event constant, subject type, route, provider behavior, or UI work is
implemented.

This is a docs/planning decision packet only. It does not implement runtime
notification writers, event constants, subject types, target columns, database
migrations, OpenAPI changes, generated-client changes, auth/session/security
runtime behavior, provider delivery, device-token lifecycle, admin policy
mutation, UI, #371 notification-open/deep-link behavior, money, settlement,
bill, OCR, storage, sync, deployment, CI, Docker/env, secrets, issue closure, or
Project mutation.

## Inputs Reviewed

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- Active `.ai/*` files
- `docs/planning/ISSUE_PROGRESS_LEDGER.md`
- `docs/planning/NOTIFICATION_369_REMAINING_EVENT_COVERAGE_GATE_REVIEW.md`
- `docs/prd/MVP_DAY1_SCOPE.md`
- `docs/prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md`
- `docs/architecture/NOTIFICATION_EVENT_TAXONOMY.md`
- `docs/architecture/DAY1_NOTIFICATION_EVENT_COVERAGE_REVIEW.md`
- `docs/architecture/NOTIFICATION_TARGET_REFERENCE_GAP_REVIEW.md`
- `docs/architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md`
- `docs/architecture/NOTIFICATION_PREFERENCE_RESOLUTION_MODEL.md`
- `docs/architecture/ADMIN_NOTIFICATION_POLICY_SCHEMA_API_DESIGN.md`
- `docs/architecture/NOTIFICATION_POLICY_RESOLVER_WIRING_DESIGN.md`
- `docs/architecture/NOTIFICATION_POLICY_AUDIT_REDACTION_COVERAGE.md`
- Recent #369 notification reports, including PR #707 and PR #708 reports
  present under `.codex/reports/`.

No required input file was missing.

## Current Source Facts

Current repo state supports auth/session/security foundations, including auth
accounts, identities, local credentials, sessions, session families, refresh
credentials, auth audit events, MFA/passkey/recovery-code foundations,
security-policy foundations, first-owner bootstrap, admin local-user creation,
local sign-in, refresh rotation, current-user validation, current-session
sign-out, sign-out-all, session list, and per-session revocation.

Current notification state does not support auth/session/security notification
runtime:

- `InAppNotificationEventTypes` has no security/session/auth event values.
- `InAppNotificationSubjectTypes` has no auth audit, auth session, auth
  account, credential, MFA/passkey, recovery, or policy subject type.
- `InAppNotification` and OpenAPI responses do not expose first-class
  `authAuditEventId`, `authSessionId`, `authSessionFamilyId`,
  `authAccountId`, credential/factor/passkey/challenge IDs, or security-policy
  target references.
- Notification preferences preserve required sync/security visibility as a
  readout concept, but they do not create security notifications and do not
  define source-event bypass behavior.
- Existing #371 notification-open/deep-link behavior is closed for supported
  event families only. It does not approve auth/session/security route targets.

## Candidate Event Decisions

| Candidate event family | Current source-domain authority | Target-reference requirements | Privacy/redaction posture | Status |
| --- | --- | --- | --- | --- |
| `security.session_revoked` for explicit current-account per-session revocation | Auth/session runtime already owns per-session revocation for route-identified sessions owned by the current authenticated account. A future event source could be the successful API-owned revocation transition, not session-list display or generic status polling. | Needs first-class `authSessionId` or a safer session/security-center target, plus an authorized current-account session/security re-fetch path. The target must not expose raw session IDs, token hashes, refresh credentials, or unrelated sessions. | In-app copy may say a session was revoked and may use bounded device label/coarse time only after authorization. External copy must be generic, such as "A session update needs review." | `needs_target_reference_design`; `needs_auth_security_manual_decision`; potential narrow next candidate after design. |
| `security.current_session_signed_out` | Current-session sign-out is API-owned and revokes only the bearer session. | Usually not a useful notification target because the recipient loses that session. A security-center/account target may be safer than a session target if this is ever supported. | Avoid notifying ordinary voluntary sign-out unless policy says the confirmation has security value. No token/session details. | `defer_day2_or_later` unless manual policy selects it. |
| `security.all_sessions_revoked` | Sign-out-all can revoke active sessions owned by the authenticated account. Refresh replay/family revocation is a separate source class and must not be mixed silently. | Needs account/security-center or session-family target and authorized re-fetch. A list of revoked sessions must not be embedded in the notification. | In-app can be generic and account-scoped. External copy generic only. | `needs_source_state_design`; `needs_target_reference_design`; `needs_auth_security_manual_decision`. |
| `security.session_family_revoked` for refresh replay or credential-family invalidation | Refresh/session-family runtime and audit foundations exist, but replay/security semantics need exact event mapping and anti-enumeration review. | Needs `authSessionFamilyId`, `authAuditEventId`, or security-center target. Re-fetch must be current-account-authorized and must not expose raw refresh credential state. | Generic security copy only. No replay details, token material, IP history, or abuse identifiers in notification payloads or snippets. | `needs_source_state_design`; `needs_target_reference_design`; `needs_auth_security_manual_decision`. |
| `security.new_session` / `security.session_new_device` | Sign-in and refresh can create session rows, but current runtime does not persist reviewed unfamiliar-device/new-device classification. Plain sign-in success is insufficient. | Needs `authSessionId` or security-center target after new-device semantics exist. Deep link must reauthorize and must not widen access to session data. | Bounded device label/coarse context only after authorized re-fetch. External copy generic only. | `needs_source_state_design`; `needs_target_reference_design`; `needs_auth_security_manual_decision`. |
| `security.password_changed`, `security.password_reset`, `security.credential_rotated` | Credential workflow/audit foundations exist, but user password change/reset/rotation runtime is not fully implemented as a notification source. Bootstrap/admin-created account flows are not password-change alerts. | Needs `authAuditEventId`, account/security-center target, or credential activity target. Do not expose credential IDs unless a future design proves they are safe. | No password material, hashes, reset tokens, verifier strings, or policy internals. External copy generic only. | `needs_source_state_design`; `needs_target_reference_design`; `needs_auth_security_manual_decision`. |
| `security.credential_rehashed` | Password rehash audit can exist as internal maintenance/security hygiene, but it is not automatically user-actionable. | If ever surfaced, target should be audit/security-center only. | Usually audit-only. No hashing parameters, salts, peppers, or derived material. | `defer_day2_or_later`; likely audit-only. |
| `security.mfa_changed`, `security.passkey_changed`, `security.recovery_used` | MFA/passkey/recovery schema and runtime foundations exist, but each workflow needs exact source semantics and anti-lockout/security policy review. | Needs factor/passkey/recovery target only if safe, otherwise `authAuditEventId` or security-center target. Re-fetch must be current-account-authorized and freshness-aware where relevant. | No TOTP secrets, recovery codes, passkey private material, challenge material, credential IDs usable with WebAuthn, or raw authenticator payloads. External copy generic only. | `needs_source_state_design`; `needs_target_reference_design`; `needs_auth_security_manual_decision`. |
| `security.account_disabled` / `security.account_reenabled` | Account status exists, but account lifecycle/admin runtime and notification semantics are not ready as source events. | Needs account/security-center or auth audit target. Admin-visible targets require separate operator policy. | Avoid exposing another account's existence. Current-user copy generic if the account owner is the recipient. | `needs_source_state_design`; `needs_target_reference_design`; `needs_auth_security_manual_decision`. |
| `security.role_changed` | System role assignment foundations exist, but role-change notification source semantics and admin/operator recipient rules are policy-sensitive. | Needs role-change audit/security-policy target. Admin/operator views must not leak unrelated user data. | In-app may name only the viewer's own role change unless admin policy explicitly allows more. External copy generic only. | `needs_source_state_design`; `needs_target_reference_design`; `needs_auth_security_manual_decision`. |
| `security.policy_changed` | Auth security policy and notification policy foundations exist, but admin/global policy mutation and auth-security policy mutation semantics remain gated. | Needs policy-version/security-policy target and admin/current-user readout authorization. | No provider secrets, auth secret material, raw policy submissions, or admin-only diagnostics. | `needs_source_state_design`; `needs_target_reference_design`; `needs_auth_security_manual_decision`. |
| Suspicious session, failed sign-in, denied sign-in, abuse, lockout, replay alerts | Sign-in abuse policy and refresh replay audit categories exist, but failed/denied sign-in behavior must remain enumeration-resistant. | Needs auth audit/security-center target only after thresholds, recipients, and anti-enumeration behavior are manually approved. | Do not expose identifiers, attempted emails, rate-limit bucket keys, IP history, exact abuse counters, or whether another account exists. | `needs_source_state_design`; `needs_auth_security_manual_decision`; likely split separately. |

Candidate names above are design-level labels only. They are not approved
event constants, OpenAPI enum values, database check-constraint values, mobile
routes, provider template keys, or UI strings.

## Target-Reference Requirements

Auth/session/security events cannot safely use the current bill/settlement/
recurring/OCR/sync target model.

A later design must choose one bounded target pattern:

- `authAuditEventId` for immutable source-audit-backed security activity;
- `authSessionId` for current-account session detail or revocation events;
- `authSessionFamilyId` for family-wide revocation events, only if safe;
- `authAccountId` or account/security-center target for current-account
  activity, only where the viewer is authorized;
- `authSecurityPolicyId` or policy-version target for policy readouts;
- credential, MFA factor, passkey credential, recovery-code batch, or challenge
  target IDs only if the future event requires them and the recipient can safely
  reference them.

The safest default target for the first slice is either:

- an `authAuditEventId` plus a current-account security-activity re-fetch path;
  or
- an `authSessionId` plus a current-account session detail/list re-fetch path
  for explicit session revocation only.

Do not hide auth targets in `safeSummary`, overload unrelated subject types, or
rely on `actionUrl` as authorization. Notification opens must re-fetch through
authorized current-user/security/session APIs. Possession of a notification,
session ID, account ID, audit event ID, push payload, local cache row, or
generated-client method must not reveal or grant access to security details.

## Recipient And Authorization Rules

Default rule: the affected account owner is the only default recipient for
their own account, credential, MFA/passkey/recovery state, session, or session
family when policy says the event should be visible.

Admin/owner recipients are not default recipients for another user's security
event. Admin or owner notification is allowed only where a reviewed security or
operator policy says the event class is operator-actionable and safe to expose.

Self-notification must be explicit per event. Security events may intentionally
notify the actor about their own action when that is a safety confirmation, but
the future writer must opt in and test self-notification behavior. Ordinary
reads, current-user validation, session-list display, preference reads, mobile
route opens, local cache updates, and generated-client availability must never
create security notifications.

## Privacy And External Copy Rules

Auth/session/security notifications, reports, logs, tests, screenshots,
provider payloads, safe summaries, and audit metadata must not contain:

- bearer, refresh, reset, recovery, MFA, passkey, OIDC, provider, or challenge
  secrets;
- raw session IDs, token hashes, credential material, password hashes, salts,
  peppers, verifier strings, or derived key material;
- TOTP secrets, recovery codes, reusable challenge material, passkey private
  material, raw authenticator payloads, or WebAuthn credential IDs usable with
  authenticators;
- provider payloads, service secrets, certificates, signing material, or
  service-account JSON;
- exact abuse identifiers, rate-limit bucket keys, long-lived IP history,
  unbounded user agents, full device fingerprints, or raw network diagnostics;
- unrelated account/profile/user identifiers, hidden recipient lists, email
  addresses, or data revealing another account/session exists to someone not
  authorized to know it exists.

External email and push copy for security events should be generic by default:

- "A security update is available."
- "A session update needs review."
- "Open Settleora to review your account security."

In-app detail may be richer only after authorized API re-fetch and only within
the current viewer's policy. Use bounded device labels, coarse time/context,
and normalized reason categories rather than raw identifiers.

## Readiness Decision

No auth/session/security candidate is `ready_for_runtime_slice` today.

The narrowest plausible future implementation candidate is explicit
current-account per-session revocation notification, because the source runtime
already has a user-initiated per-session revocation transition. Even that
candidate remains blocked until:

- manual auth-security policy approves that the event should notify the account
  owner, including actor self-notification behavior;
- a target-reference design chooses `authSessionId`, `authAuditEventId`, or a
  safer security-center target;
- OpenAPI/schema/generated-client changes are reviewed for only the selected
  target shape and event/subject constants;
- notification-open route policy confirms authorized re-fetch and privacy-safe
  stale/unauthorized fallback behavior without reopening #371 broadly;
- validation proves source-transition-only writes, idempotency/duplicate
  behavior, recipient isolation, redaction, and read/archive source isolation.

## Recommended Next Action

Create one future manual-gated design issue/task before runtime:

`Auth/session/security notification target-reference and event-constant design`

Suggested scope:

- Choose exactly one first event candidate, preferably explicit
  `security.session_revoked` for current-account per-session revocation, or
  explicitly keep all auth/security notifications blocked.
- Select the source transition, recipient rule, self-notification rule,
  target-reference shape, subject type, action target, redaction class, and
  external snippet posture.
- Define the smallest schema/OpenAPI/generated-client diff needed for that
  single event, if approved.
- Define runtime validation expectations and stop conditions.
- Keep provider sending, device-token behavior, admin policy mutation, UI,
  broad #371 route work, and all other security event families out of scope.

Do not start a runtime writer from #369 alone.

## Issue Posture

- #369 should stay `OPEN`.
- #368 should stay `OPEN`.
- #403 should stay `OPEN`.
- #634 should stay `OPEN`.
- #635 should stay `OPEN`.
- #371 should stay `CLOSED` unless a concrete regression is found.
- #570 should stay `CLOSED` unless a concrete regression is found.
- #575 should stay `CLOSED` unless a concrete regression is found.

This packet does not close, reopen, comment on, or move any issue or Project
item.

## Non-Goals And Remaining Gates

Non-goals:

- Runtime notification code.
- API runtime behavior.
- Notification event constants or subject types.
- Notification writers.
- Auth/session/security runtime behavior.
- OpenAPI or generated clients.
- EF schema or migrations.
- Provider sending, SMTP/APNs/FCM activation, provider config, or secrets.
- Device-token lifecycle or #634 behavior.
- Delivery attempts, outbox/provider behavior, delivery receipts, retry/expiry,
  or fake delivery success.
- Admin policy mutation/write API.
- Admin/user/mobile UI or Figma.
- #371 notification-open/deep-link runtime.
- Money, settlement, bill calculation, OCR runtime, storage/file-byte behavior,
  sync/reconciliation behavior, Docker/env/deployment/CI, or secrets.

Remaining gates before any runtime:

- Manual auth-security product/security decision.
- Source-state design for the selected event only.
- Target-reference schema/OpenAPI design.
- Authorized re-fetch and route/fallback design.
- Redaction and external snippet approval.
- Focused validation plan.
- Separate PR and merge gate for any future runtime implementation.
