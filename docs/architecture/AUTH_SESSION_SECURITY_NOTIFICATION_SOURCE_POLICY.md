# Auth Session Security Notification Source Policy

## Purpose

This docs/control policy defines the source-state and safety gate for future
auth, session, account, credential, MFA/passkey, and security-policy
notifications under GitHub issue
[#369](https://github.com/tommytang213/Settleora/issues/369).

This document does not implement notification writers, event constants, subject
types, target columns, database migrations, OpenAPI changes, generated-client
changes, auth/session/security runtime behavior, credential/session/token
issuance behavior, mobile/web/admin UI, provider delivery, deployment, CI,
Docker, secrets, or issue closure.

## Current Runtime Source Facts

Current repository state includes real auth/session/security foundations:

- `auth_accounts`, `auth_identities`, `system_role_assignments`,
  `local_password_credentials`, `auth_sessions`, `auth_session_families`,
  `auth_refresh_credentials`, `auth_audit_events`, MFA/passkey/recovery-code
  schema foundations, and `auth_security_policies` exist in EF/domain models
  and migrations.
- First-owner local bootstrap and guarded admin local-user creation can create
  local accounts through the internal credential workflow.
- Local sign-in, refresh credential rotation, current-user validation,
  current-session sign-out, current-account sign-out-all, current-account
  session list, and per-session revocation endpoints exist.
- `SettleoraSession` validates opaque bearer session credentials through the
  session runtime boundary. Protected endpoint code consumes the server-derived
  current actor; clients do not submit actor identity.
- Session rows persist token hashes, status, expiry, revocation metadata,
  bounded optional device labels, bounded optional user-agent summaries, and
  optional network-address hashes. They do not store raw bearer or refresh
  tokens.
- Credential, sign-in, refresh/session, group-membership, MFA/passkey, and
  security-policy flows have bounded audit writers in current code or
  foundations.
- Auth audit rows carry action, outcome, actor/subject account IDs, timestamps,
  optional correlation/request IDs, and bounded `SafeMetadataJson`.

Current notification state:

- `InAppNotificationEventTypes` has no auth/session/security event values.
- `InAppNotificationSubjectTypes` has no auth audit, auth session, account,
  credential, MFA/passkey, or policy subject type.
- `InAppNotificationWriteRequest`, `InAppNotification`, OpenAPI responses, and
  generated clients do not expose first-class `authAuditEventId`,
  `authSessionId`, `authAccountId`, credential/factor/passkey/challenge IDs, or
  security-policy event target references.
- The current notification preference model preserves required sync/security
  visibility as a category/readout, but it does not create security
  notifications and does not define source-event bypass behavior.

Real source states that are safe to review for future notification design
include API-owned auth audit events, auth session lifecycle rows, refresh
session-family/credential lifecycle rows, local credential workflow audit
events, MFA/passkey/recovery-code runtime and audit rows where implemented, and
auth security policy rows. None of these is notification-ready until the exact
event semantics, target reference, recipient policy, redaction policy, and
manual auth-security gate are reviewed.

## Event Candidate Decisions

| Candidate | Current source-state fit | Decision before runtime |
| --- | --- | --- |
| `security.session_new_device` or `security.new_session` | Sign-in and refresh create session rows, but current runtime does not persist a reviewed new-device/unfamiliar-device classification. Device labels and bounded user-agent summaries are display metadata, not a security event by themselves. | Blocked until an API-owned session risk/new-device source event exists with reviewed semantics. A plain sign-in success or session row creation is insufficient. |
| `security.session_revoked` | Current-session sign-out, sign-out-all, per-session revocation, refresh replay/family revocation, and policy/account-driven future revocations are distinct source transitions. | Conditionally implementation-ready only after a later policy selects exact revocation sources, recipients, duplicate rules, and first-class targets. Do not infer from session list display or generic status reads. |
| `security.all_sessions_revoked` | Sign-out-all and refresh replay family revocation can revoke multiple sessions for the same account. | Blocked until policy defines whether this is user-visible, admin-visible, or audit-only, and whether it targets a session family, account, or audit event. |
| `security.password_changed`, `security.password_reset`, `security.credential_rotated`, or `security.credential_rehashed` | Local credential creation/verification/rehash audit exists, but public password change/reset/rotation runtime is not implemented. Admin-created users and bootstrap are account-creation workflows, not password-change alerts. | Blocked except for future exact credential lifecycle events once those workflows exist. Rehash audit is not automatically a user notification. |
| `security.recovery_used`, `security.mfa_changed`, `security.passkey_changed` | MFA/passkey/recovery-code schema and runtime foundations exist, but notification event policy and target references do not. | Blocked until each factor/recovery/passkey workflow defines safe user/admin notification semantics, target IDs, and redaction. |
| `security.account_disabled` or `security.account_reenabled` | Account status exists; broader account lifecycle/admin policy endpoints are not fully implemented as notification sources. | Blocked until account lifecycle runtime and audit semantics exist. |
| `security.role_changed` or `security.policy_changed` | System roles and `auth_security_policies` exist; some role/account policy foundations exist. Admin/global policy notification behavior is #635-adjacent and security-sensitive. | Blocked behind auth-security and admin/global policy gates. Notify only when policy explicitly allows a recipient class. |
| suspicious session, replay, failed sign-in, abuse, lockout, or denied sign-in alerts | Sign-in abuse policy and refresh replay audit categories exist. Failed sign-in state is intentionally enumeration-resistant. | Blocked until a manual policy defines safe thresholds, recipient, copy, anti-enumeration behavior, and whether events are audit-only or notification-worthy. |

Candidate names above are design-level names only. They are not approved event
constants, OpenAPI enum values, database check-constraint values, mobile route
names, or provider template keys.

## Source-State Gates

Future runtime must create auth/session/security notifications only from exact
API-owned source transitions. It must not infer notifications from:

- profile display state;
- mobile route state;
- cached session lists;
- local-only mode state;
- generated-client availability;
- current-user response display;
- push device-token registration state;
- notification preference readouts;
- session list reads;
- generic auth audit rows without reviewed notification semantics;
- generic `auth_sessions.status` polling;
- unreviewed device labels, raw user-agent strings, IP/network material, or
  abuse counters.

Required source events/states before runtime:

- reviewed auth audit event categories where the audit action maps to one
  notification event and one recipient policy;
- session lifecycle rows or session-family rows with explicit transition
  semantics such as newly classified unfamiliar session, user-initiated
  revocation, replay-caused family revocation, admin/policy-caused revocation,
  or account-disablement revocation;
- credential workflow events for password change/reset/rotation only after
  those workflows exist;
- MFA/passkey/recovery-code workflow events only after their runtime and audit
  semantics are implemented;
- security-policy change events with a bounded policy identifier and explicit
  admin/owner/user recipient rules;
- first-class recipient-safe target references and an authorized re-fetch path.

Audit existence is not enough by itself. A later implementation must document
which audit action/outcome categories are notification sources, which remain
audit-only, and how duplicate/idempotent transitions are suppressed.

## Recipient And Suppression Policy

Default account-owner rule:

- The affected account owner/user is the default recipient for security events
  about their own account, credential, MFA/passkey/recovery state, session, or
  session family, when that recipient has a server-mode profile/account surface
  and policy says the event should be visible.

Default admin/owner rule:

- System owners/admins are not notified about another user's security event by
  default. Admin or owner recipients are allowed only where a reviewed
  admin/security policy explicitly says a class of event is operator-actionable
  and safe to expose.
- Do not notify unrelated admins, group owners, group members, bill
  participants, friends, visible users, deployment operators, or support
  viewers merely because they can see some app data.

Actor self-notification:

- Security events may intentionally notify the actor about their own action,
  such as "a new session was created" or "all sessions were revoked", when
  policy says the self-notification is a safety confirmation rather than noise.
- Self-notification must be explicit per event type and tested with
  `AllowSelfNotification` or equivalent future behavior. The current writer
  suppresses self-notifications by default.
- Self-notification is not allowed for ordinary reads, current-user validation,
  session-list display, preference reads, mobile route opens, or local cache
  updates.

Suppression:

- Required/security-impactful in-app security notifications should not be fully
  suppressible by ordinary mute, digest, quiet-hours, group mute, or optional
  category settings unless a reviewed security policy explicitly allows a
  bounded suppression.
- External email/push attempts remain optional and must use generic copy.
  Provider or preference state must not cause fake success or hidden security
  source-state mutation.

## Safe Target And Reference Model

Current notification target columns cannot safely represent auth/session
security targets. Missing first-class target work includes one or more of:

- `authAuditEventId`;
- `authSessionId`;
- `authSessionFamilyId`;
- `authAccountId` or another account/security-center target where safe for the
  recipient;
- `authSecurityPolicyId` or policy-version target;
- credential, MFA factor, passkey credential, recovery-code batch, or challenge
  targets only if the future event requires them and the recipient can safely
  reference them.

Do not hide these targets in `safeSummary`, overload settlement/bill/sync/OCR
subject types, or rely on a raw `actionUrl` as authorization.

Future notification opens must reauthorize through an API-owned
security/session/current-user path. Possible future safe route families include
current-account session list/detail, security center, credential activity, MFA
management, passkey management, or admin security policy readout, but no route
is approved by this policy. Notification visibility is not authorization, and
possession of a notification, session ID, account ID, audit event ID, push
payload, local cache row, or generated-client method must not reveal or grant
access to security details.

## Privacy And Redaction

Auth/session/security notification payloads, response models, delivery attempts,
safe summaries, provider snippets, audit examples, logs, metrics, traces, tests,
reports, issue comments, screenshots, and design references must not contain:

- raw bearer tokens;
- raw refresh tokens;
- raw session IDs or token hashes;
- password material, password hashes, salts, peppers, verifier strings, or
  derived key material;
- reset tokens, recovery codes, reusable challenge material, MFA secrets, TOTP
  secrets, passkey private material, or provider secrets;
- OIDC access tokens, refresh tokens, ID tokens, or provider payloads;
- secret references, key identifiers where sensitive, certificates, signing
  material, or service-account JSON;
- exact long-lived IP history, raw abuse identifiers, rate-limit bucket keys,
  unbounded user-agent strings, full device fingerprints, or provider request
  and response payloads;
- raw account identifiers for another user, email addresses, local identifiers,
  admin-only diagnostics, or data that reveals a separate account/session exists
  to someone not authorized to know it exists.

Use bounded/coarse security copy. Examples for future external snippets:

- "A security update is available."
- "A session update needs review."
- "Open Settleora to review your account security."

In-app detail may display richer security information only after authorized
API re-fetch and only within the current viewer's policy. Even then, use
bounded device labels, coarse time/context, and normalized reason categories
rather than raw identifiers.

## Runtime Readiness Conclusion

Auth/session/security notification runtime is not implementation-ready now.

Current auth/session/security runtime has real API-owned states worth reviewing,
but the notification layer is missing:

- approved event semantics;
- supported event constants and database/OpenAPI enum values;
- first-class auth/session/security notification target references;
- authorized target re-fetch APIs or route policy for security surfaces;
- recipient/admin/self-notification policy;
- security-event mute/digest/bypass policy;
- secret-redaction and external snippet policy per event;
- focused validation for source transitions, recipients, redaction,
  duplicate/idempotent behavior, and read/archive isolation.

Recommended child issues before any runtime writer:

1. Auth/session/security notification event policy design: exact event names,
   source transitions, recipients, self-notification, suppression/bypass, and
   external snippet posture.
2. Auth/session/security notification target-reference schema/OpenAPI design:
   first-class safe targets and authorized current-user/security re-fetch paths.
3. Optional narrow runtime slice only after manual auth-security approval, for
   one event family with existing source state such as explicit current-account
   session revocation or replay-caused session-family revocation, with no
   provider delivery unless separately approved.

If a later review finds one narrow event ready, it must still be implemented in
its own explicit auth-security/manual-gated runtime task. This docs/control
task intentionally implements none of it.

## #369 Remaining-Work Posture

This policy updates #369 by making the auth/session/security family visibly
blocked rather than ambiguously pending. It does not close #369 or #368.

Keep the existing completed families complete and do not redo them:

- bill workflow/revision coverage;
- settlement request/payment/proof coverage;
- `settlement.residual_review_needed`;
- recurring due-soon and draft-generated;
- `ocr.needs_review` from explicit API-owned assignment transitions;
- `sync.conflict_detected` and `sync.operation_failed`.

Keep these families blocked:

- OCR `ocr.completed` and `ocr.failed` until server OCR worker/job source states
  exist;
- remaining sync queued/retry/resolved/reopened/resolution-applied events until
  exact persisted user-actionable source states exist;
- auth/session/security notifications until the manual auth-security policy and
  target-reference gates above are satisfied;
- item claim/split/creator-review notifications until claim/source runtime,
  stable claim/item targets, and money/Figma/manual-gate posture are approved;
- broader settlement mismatch/review and debtor-after-residual-decision events
  until source states and policy exist.

## Validation Expectations For Later Runtime

Any future auth/session/security notification runtime slice must prove:

- exact API-owned source transition creates the event and adjacent reads/status
  displays do not;
- account-owner/admin recipient rules are enforced server-side;
- actor self-notification behavior is explicit and tested;
- unrelated admins, group members, bill participants, friends, visible users,
  and removed users are suppressed;
- first-class safe auth/session/security targets are used, or the event is
  explicitly targetless with an authorized security-center re-fetch;
- notification opens reauthorize through current-user/security/session APIs;
- read/archive does not revoke sessions, rotate credentials, change MFA/passkey
  state, change account status, change policy, mutate audit, or acknowledge a
  security incident;
- payloads, snippets, logs, audit metadata, test fixtures, reports, and design
  artifacts exclude all forbidden secret and sensitive security data;
- duplicate/idempotent source transitions do not create duplicate unread
  notifications;
- OpenAPI/generated clients and EF constraints change only for the exact
  approved runtime event and target shape.
