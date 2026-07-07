# Auth Local Password Reset Notification Event, Target, And Redaction Gate

## Purpose

This docs/control gate records the Day 1 posture for local-account password
reset notification events, targets, recipients, suppression, copy, and
redaction. It exists to remove ambiguity before any future public password-reset
route exposure task.

This task does not approve or implement notification runtime, notification
writer work, schema changes, OpenAPI changes, generated-client changes, public
password-reset route exposure, provider configuration, UI, Figma, product copy,
deployment, Docker, CI, secrets, or auth/security runtime behavior.

## Current-State Readback

- Live GitHub readback verified PR #753
  <https://github.com/tommytang213/Settleora/pull/753> is `MERGED` into
  `main`.
- PR #753 merge commit and current `origin/main`:
  `25b7c272cc57d5928c9711a6f294e33b4ff38d9f`.
- PR #753 head branch:
  `docs/pr752-password-reset-audit-redaction-post-merge-20260707-1205`.
- PR #753 reviewed source head:
  `9eec0d20888df5ec9441d5a3139132a2e765caf1`.
- Live GitHub issue readback:
  - #336 `OPEN`; Project status `Inbox`.
  - #339 `OPEN`; Project status `Needs Decision`.
- Recent password-reset checkpoint readback:
  - PR #746 merged internal-only password reset email delivery orchestration at
    `86713435af299347f5fa1b016b400575e39daf0a`.
  - PR #748 merged internal reset-specific request/provider-send throttle
    foundation at `aef4d7f6768a5a5ededda91c04dda21eba81e0b0`.
  - PR #750 merged internal public request-response policy at
    `f46f0f4ffe5b73ac6ec77385778801e913aaa4c0`.
  - PR #752 merged password-reset audit redaction acceptance at
    `311710242b1935c58d3118998f237cc479e8c763`.
  - PR #753 merged the PR #752 ledger checkpoint at
    `25b7c272cc57d5928c9711a6f294e33b4ff38d9f`.
- Current internal password-reset runtime foundation includes internal request,
  material issue, delivery orchestration, throttles, public response policy,
  completion, credential replacement, account-wide session/refresh-family
  revocation, and bounded audit/redaction coverage.
- Public password-reset runtime route exposure remains blocked:
  `POST /api/v1/auth/password-reset/request` and
  `POST /api/v1/auth/password-reset/complete` are OpenAPI transport-contract
  paths only. Runtime tests assert those paths are not mapped and return
  `404 Not Found`.
- Current notification model limitations:
  - `InAppNotificationEventTypes` has no auth, security, credential, session,
    or password-reset event value.
  - `InAppNotificationSubjectTypes` has no auth audit, auth account, auth
    session, session-family, credential, or security-center target.
  - Current notification responses and generated clients do not expose
    first-class `authAuditEventId`, `authAccountId`, `authSessionId`,
    `authSessionFamilyId`, or targetless security-center references.
  - `AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md` blocks
    auth/session/security notification runtime until exact event semantics,
    target references, recipient policy, suppression behavior, and redaction
    are approved.

## Decision Summary

Recommended posture: keep password-reset user-facing notifications blocked for
runtime, except as design-level candidates that may be implemented later only
after a separate target-reference schema/OpenAPI/generated-client gate,
notification runtime gate, UI/product-copy gate, final public route exposure
gate, and final auth/security acceptance.

This gate does not approve notification writer work. It does not approve
creating event constants, subject types, database target columns, outbox writes,
email/push attempts, in-app notification writes, provider templates, route
links, mobile/web/admin UI, or generated-client changes.

This gate does not approve public route exposure. Both public password-reset
runtime routes remain blocked because user-visible auth/security notification
semantics, target references, UI/product copy, final route exposure, and final
auth/security acceptance are still incomplete.

## Candidate Event Matrix

Candidate names are design-level names only. They are not approved enum values,
OpenAPI schema values, database constraint values, template keys, route names,
or generated-client contracts.

| Candidate | Proposed design-level name | Source transition required | Recipient class | Target/reference requirement | Allowed visible copy category | Redaction constraints | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Password reset requested | `audit-only` | Internal request accepted or skipped after anti-enumeration lookup/throttle policy. | None by default. | Auth audit event only if retained; no notification target. | No user-visible notification. | Must not reveal submitted identifier, account existence, local/OIDC state, provider state, delivery attempt, throttling, or token issuance. | Audit-only. |
| Reset material issued / delivery attempted | `audit-only` | Internal material issued and delivery orchestration evaluated. | None by default. | Auth audit event plus password-reset request row only where authorized for audit; no notification target. | No user-visible notification. External reset email is delivery material, not a notification event. | Must not reveal reset link/material, recipient email, configured public origin, SMTP/provider state, provider diagnostics, token hash, verifier, or delivery status. | Audit-only for notification; delivery remains separate reset-email flow. |
| Reset delivery skipped / unavailable / failed / throttled | `audit-only` | Internal delivery result category recorded. | None by default. | Auth audit event and safe delivery result category only. | No user-visible notification. | Must not reveal whether account exists, provider is configured, email was attempted, throttles fired, or why delivery failed. | Audit-only. |
| Password reset completed successfully | `security.password_reset_completed` | Atomic reset material consume, local credential replacement, and required session/family revocation succeed. | Affected account owner only, if a future schema/target/UI gate approves. Actor self-notification may apply because the actor is the affected account owner, but only as explicit security-confirmation policy. | Prefer first-class `authAuditEventId` plus `authAccountId` or explicit targetless security-center reference. Do not hide target in `safeSummary`. | Generic security update; in-app may say a password/security setting changed only after authorized re-fetch. External snippets must be generic. | Must not reveal reset route, token validity, reset status details, session counts, account IDs to unauthorized recipients, email/username, IP, user agent, provider state, or password policy. | Ready later only after target/schema/OpenAPI, notification runtime, UI/copy, final route exposure, and auth/security gates. |
| Password reset replay / suspicious reuse | `security.password_reset_suspicious_activity` | API-owned transition from consumed/revoked/replaced material reuse to suspicious category. | Affected account owner only if linked safely and policy says user action is useful; otherwise audit-only. Admins not notified by default. | `authAuditEventId` plus `authAccountId` or targetless security-center model. May need replay-risk policy before any event. | Generic security update available. External snippets must not say reset link was reused. | Must not reveal token state, expiry, consumed/revoked/replaced status, link validity, source bucket, raw IP, raw user agent, provider state, or reset material. | Requires manual decision; default audit-only until replay notification thresholds and copy are approved. |
| Sessions / refresh families revoked because of reset | `security.sessions_revoked_after_password_reset` or fold into reset-completed event | Successful reset-caused account-wide active-session and refresh-family revocation. | Affected account owner only. | If separate event: `authAuditEventId` plus account/security-center target, or future `authSessionFamilyId` only if the recipient can safely reference it. | Generic session/security update; in-app may say sessions were updated only after authorized re-fetch. | Must not reveal session IDs, session counts, device fingerprints, raw user agents, raw IPs, refresh-family IDs, token hashes, or admin-only diagnostics. | Blocked as separate event until duplicate rules decide whether completion already covers it. |
| Reset denied / unknown / expired / consumed / malformed material | `audit-only` | Completion rejection, unknown material, expired material, malformed material, wrong-scope, replaced, consumed, or unavailable account state. | None by default. | Auth audit event only. | No user-visible notification. | Must not reveal token/account validity, expiry, consumed/revoked/replaced state, malformed details, account existence, local/OIDC status, password policy internals, source bucket, or provider state. | Audit-only. |

## Recipient And Suppression Policy

- The affected account owner is the only default recipient for password-reset
  security notifications.
- Admins and owners are not notified about another user's password-reset event
  by default.
- Admin/owner recipients are allowed only after a reviewed admin/security policy
  says the event class is operator-actionable and safe to expose.
- Unrelated users, groups, friends, group owners, bill participants,
  settlement counterparties, visible users, support viewers, and deployment
  operators must not receive auth/security notifications merely because they
  can see other app data.
- Actor/self-notification may apply only for approved security-confirmation
  events about the affected account owner's own reset or session-revocation
  outcome. It must be explicit per event and tested; ordinary reads, route
  opens, current-user validation, preference reads, and notification read/archive
  actions must not create self-notifications.
- Ordinary notification mute, digest, quiet-hours, group mute, and optional
  category preferences must not hide required security notifications unless an
  explicit security policy approves a bounded suppression rule.
- External email/push snippets must be generic. They must not reveal reset
  request status, reset completion status, suspicious replay, delivery status,
  session-revocation details, account existence, token validity, provider state,
  or throttling state.

## Target And Reference Model

Future password-reset notification runtime needs a first-class target model
before implementation. Current notification schema/OpenAPI cannot safely
represent password-reset/security targets, so runtime remains blocked until a
separate schema/OpenAPI/generated-client gate approves one of these approaches:

- `authAuditEventId` plus `authAccountId`, visible only to the affected account
  owner or explicitly approved admin/security recipients;
- `authAuditEventId` plus an explicit targetless security-center model for the
  current authenticated account;
- a session-family/session target only for a separately approved event where the
  recipient can re-fetch it through an authorized current-account security path.

Target policy requirements:

- Do not hide targets in `safeSummary`.
- Do not overload bill, settlement, sync, OCR, or recurring notification subject
  types for auth/security events.
- Do not rely on raw `actionUrl` for authorization.
- Opening a password-reset notification must reauthorize through an API-owned
  current-account/security-center path. Notification visibility, local cache,
  push payloads, account IDs, audit event IDs, generated-client methods, and
  action URLs do not grant access to security details.

## Redaction Policy

Password-reset notification payloads, logs, audit metadata, tests, reports,
GitHub comments, screenshots, provider snippets, delivery attempts, safe
summaries, and design references must not contain:

- raw reset material;
- reset links;
- tokens or codes;
- reset hashes;
- verifier strings;
- plaintext passwords or password values;
- password hashes, salts, peppers, or derived key material;
- submitted identifiers;
- recipient email addresses;
- account emails, usernames, display names, or local identifiers where not
  explicitly authorized;
- account/profile/auth account IDs exposed to unauthorized recipients;
- raw IP addresses;
- raw user agents;
- device fingerprints;
- abuse bucket keys or provider-send bucket keys;
- SMTP/provider payloads;
- SMTP/provider credentials, hostnames, ports, usernames, passwords, app
  passwords, or configured public origins;
- exceptions, stack traces, raw provider diagnostics, provider request/response
  bodies, dashboard exports, or internal exception names;
- session IDs, refresh-family IDs, bearer/refresh tokens, token hashes, cookies,
  CSRF secrets, or raw session diagnostics.

Allowed categories before authorized re-fetch are limited to generic security
copy such as:

- "A security update is available."
- "Open Settleora to review your account security."
- "A session update needs review."

In-app detail may become richer only after authorized API re-fetch and only
within the viewer's policy. Even then, use bounded categories and coarse
context, not raw identifiers or provider details.

## Public-Route Posture

The public runtime routes remain blocked:

- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/complete`

Reasons:

- current notification model lacks approved password-reset/security event
  constants;
- current notification model lacks first-class auth/security target references;
- password-reset recipient, self-notification, duplicate, and suppression rules
  are documented here but not implemented or schema-approved;
- UI/Figma/mobile/web/admin/product copy remains ungated;
- final public route exposure review has not passed;
- final auth/security acceptance has not passed.

Exact future gates before route exposure:

1. Target-reference schema/OpenAPI/generated-client gate, if notifications are
   used.
2. Notification runtime gate, if a future policy approves one or more events.
3. UI/Figma/mobile/web/admin/product copy gate.
4. Final public route exposure gate.
5. Final auth/security acceptance.

## Remaining Gates

- Target-reference schema/OpenAPI/generated-client gate for auth/security
  notification targets if runtime notifications are used.
- Password-reset notification runtime gate for exact event constants, source
  transitions, recipient rules, self-notification behavior, duplicate/idempotent
  behavior, suppression policy, and tests.
- UI/Figma/mobile/web/admin/product copy gate for public request/complete
  screens, unsupported states, reset email copy, security-center copy, admin
  readouts, and external snippets.
- Final public route exposure gate for mapping request/complete runtime paths.
- Final auth/security acceptance for local-only reset scope, OIDC exclusion,
  token expiry, replay handling, reset-specific abuse, account-wide session and
  refresh-family revocation, audit redaction, notification posture, and
  anti-enumeration behavior.

## Issue Posture

Keep #336 open. This gate does not complete the broader auth/session/runtime
security epic or final auth/security acceptance.

Keep #339 open. This gate does not expose public reset routes, complete
user-visible password-reset UX/product copy, implement notification runtime, or
complete the Day 1 password reset and credential-change workflow.

No issue closure, label, milestone, assignee, or Project field update is
approved by this document.
