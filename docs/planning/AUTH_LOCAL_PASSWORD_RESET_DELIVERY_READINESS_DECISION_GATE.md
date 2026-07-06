# Auth Local Password Reset Delivery Readiness Decision Gate

## Status

Local password reset now has the schema/domain foundation, the
OpenAPI/generated-client transport contract, and the internal runtime foundation.
Public password-reset routes remain blocked.

PR #739 merged the internal runtime foundation. PR #741 merged the non-blocking
Trivy/Semgrep CE scanner baseline. This document is a docs-only delivery
readiness gate. It does not approve public route exposure, implement reset
delivery, configure SMTP, add admin recovery runtime, change product UI, or
change auth/security runtime behavior.

## Current Runtime And Contract Readback

The OpenAPI contract includes:

- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/complete`

The runtime still does not register or expose those paths after PR #739. Current
source registers `AddLocalPasswordResetRuntime()` as an internal service
boundary, but there is no Minimal API mapping for either password-reset path.

The internal reset material completion service is not public delivery. It can
issue and consume internal reset material, replace the local password credential
through the auth credential workflow, revoke account sessions/families, and
write bounded audit, but it does not send email, build reset links, expose
public request/complete handlers, or prove provider readiness.

## Delivery Options

### Option A: SMTP/email reset link delivery

Use the approved local-account reset posture with short-lived email links only
after SMTP/provider configuration, sender identity, base URL, template,
failure-handling, redaction, audit, abuse, and final auth/security gates pass.

### Option B: Separately approved admin-delivered recovery

Allow a self-hosted/admin-delivered recovery path only after a separate
owner/admin policy, user verification model, audit model, and UI/admin-copy gate
are approved. This must not become a silent shortcut for exposing public reset
routes.

### Option C: Keep disabled/no delivery

Keep public request and completion routes blocked while neither SMTP/email
delivery nor admin-delivered recovery is approved.

## Recommended Day 1 Path

Recommendation: implement SMTP/email reset-link delivery first, behind a
dedicated provider/configuration readiness gate, then expose public routes only
after the full public route exposure matrix below passes.

SMTP first is the safest Day 1 product path because it gives ordinary users an
out-of-band recovery channel without giving admins routine access to reset
material. It also matches the approved local-account reset token policy: 60
minute default email-link expiry, configurable 15 to 120 minutes, one-time
hash-backed material, uniform anti-enumeration responses, audit redaction, and
account-wide session revocation after success.

An admin-delivered fallback may still be needed for self-hosted lockout and
deployment support cases, but it must be separately approved and audited because
it changes trust boundaries. It involves owner/admin authority, target-user
verification, out-of-band handling, operator evidence, and admin UI/copy
constraints. This document does not claim Tommy has approved public exposure.

## SMTP/Email Readiness Gate

Before SMTP/email reset-link delivery can be implemented or public routes can
be mapped, all of the following must be true:

- Provider configuration is present through approved deployment/secret
  channels, including host, port, TLS/STARTTLS mode, username, password or app
  password, from address, reply-to behavior, timeout policy, and sender domain
  posture where applicable.
- No SMTP secrets, tokens, provider payloads, real hostnames, realistic
  passwords, `.env` values, or reset material are committed, logged, audited,
  copied into docs, included in issue/PR comments, or written to Codex reports.
- Provider readiness can be tested or verified without sending real reset
  material unless explicitly approved. Safe test sends must use explicit admin
  action, safe recipient handling, and redacted logs/audit.
- Base URL/public origin policy is approved before any reset link is built.
  Links must use an approved externally reachable origin for the deployment,
  must not derive blindly from untrusted request headers, and must not expose
  reset material outside the approved delivery boundary.
- Template and product copy are reviewed for redaction. Email subject, preview,
  and body must not reveal account existence, local-vs-OIDC state, password
  material, token hashes, provider diagnostics, admin-only details, raw
  identifiers, or sensitive app data.
- Delivery failure handling is explicit. Missing, disabled, unconfigured,
  invalid, throttled, deferred, queued, sent, and failed provider states must
  remain distinguishable internally without changing the public reset request
  response.
- Audit is redacted. Audit may record bounded workflow/status/reason
  categories, correlation IDs, safe subject IDs after internal resolution, safe
  bucket references where approved, and provider readiness category. It must
  not record raw identifiers, reset links, reset material, token hashes,
  passwords, verifier strings, provider payloads, full request bodies, full IPs,
  or unbounded user-agent data.
- Rate-limit and abuse interactions are approved. Reset-specific source,
  identifier, combined, global, and provider-send buckets must exist or be
  explicitly deferred with a safe block. Sign-in thresholds are not
  automatically correct for reset.
- Email reset-link expiry remains 60 minutes by default and configurable from
  15 to 120 minutes.
- Future typed short-code or OTP reset material, if approved later, expires in
  10 to 15 minutes.

## Admin-Delivered Recovery Gate

Before any admin-delivered recovery fallback can be implemented or treated as a
delivery approval, all of the following must be true:

- Required admin role/policy is approved. The actor must be server-derived and
  limited to an approved owner/admin policy with any required fresh-session or
  step-up gate.
- User verification and out-of-band constraints are approved. The admin path
  must define how the target user is verified without relying on public route
  shortcuts or account-enumerating responses.
- Audit requirements are approved. Audit must record actor, subject, reason
  category, delivery category, timestamps, and correlation IDs using bounded
  safe metadata.
- No public route shortcut is created. Admin recovery must not silently map or
  bypass `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- No raw reset material appears in audit, logs, traces, metrics, reports,
  screenshots, issue/PR comments, admin readouts, or persistent records.
- UI/admin copy is gated before product exposure. The admin experience must not
  imply the admin knows the user's password, can reset OIDC/provider passwords,
  or can bypass audit and revocation policy.

## Public Route Exposure Readiness Matrix

The public reset request/complete paths remain blocked until every required
gate below passes:

| Prerequisite | Required before mapping |
| --- | --- |
| Provider/admin delivery approved | SMTP/email reset-link delivery is configured, verified, and approved, or a separately approved admin-delivered recovery policy exists. |
| Abuse threshold/rate-limit gate | Reset-specific request and provider-send abuse thresholds, safe bucket derivation, and public response behavior are approved. |
| Audit/redaction gate | Reset request, issue, delivery, completion, replay/denial, credential replacement, and session revocation audit categories are approved with no raw secret material. |
| Notification/event gate if used | Any notification event, target reference, recipient policy, copy, provider template, and redaction behavior is approved separately. |
| UI/Figma/product copy gate | Mobile/web/admin copy and screens are reviewed before user-visible forgotten-password or admin recovery surfaces are exposed. |
| Final auth/security acceptance | Final auth/security review confirms local-only reset scope, OIDC exclusion, session/family revocation, token expiry, replay handling, and public anti-enumeration behavior. |

Until those prerequisites pass, `POST /api/v1/auth/password-reset/request` and
`POST /api/v1/auth/password-reset/complete` must remain unregistered/disabled
even though the OpenAPI transport contract exists.

## Next Implementation Slices

Recommended next bounded tasks:

1. SMTP/email reset-link provider readiness and base URL policy gate:
   configuration, safe test/verification, sender/origin policy, template
   redaction, and no-secret evidence only.
2. Reset abuse and provider-send throttle design/runtime slice: source,
   identifier, combined, global, and provider-send buckets with uniform public
   responses and redacted audit.
3. SMTP/email reset delivery runtime slice: provider handoff, link building,
   delivery state recording, failure handling, and tests, with public route
   mapping still blocked until final exposure approval.
4. Final public route exposure gate: map request/complete only after delivery,
   abuse, audit/redaction, notification-if-used, UI/product copy, and
   auth/security acceptance pass.

Keep security-critical delivery, abuse, and route exposure work separate from
UI tasks and broad runtime bundles. Do not include Day 2 or Day 3 scope in
these slices.

## Issue Posture

#336 remains open because broader auth/session/runtime security is not complete.
Password reset delivery, public exposure, notifications, UI, abuse tuning, and
final auth/security acceptance remain unresolved.

#339 remains open because the password reset and credential-change workflow
still has delivery, public exposure, UI/product copy, notification-if-used, and
final acceptance gates. Do not close the umbrella issues from this docs-only
decision gate.
