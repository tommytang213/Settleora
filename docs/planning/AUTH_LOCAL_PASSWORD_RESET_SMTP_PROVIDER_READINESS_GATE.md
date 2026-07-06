# Auth Local Password Reset SMTP Provider Readiness Gate

## Status / Decision

Decision: `PARTIALLY_READY_FOR_BOUNDED_INTERNAL_SMTP_RESET_DELIVERY_SLICES`.

The current repo has generic SMTP/notification plumbing that can be used as a
foundation for a future password-reset email delivery implementation, but that
generic plumbing is not itself approval for password-reset delivery. Public
password-reset route exposure remains blocked.

Approved by this docs-only gate:

- Use the existing generic SMTP options/sender/readiness concepts as a starting
  point for bounded internal password-reset delivery slices.
- Keep reset delivery local-account-only, API/domain-authoritative,
  anti-enumeration-safe, audit-redacted, and route-blocked until later gates.
- Prefer SMTP/email reset-link delivery as the next Day 1 implementation path,
  ahead of any public route exposure.

Not approved by this gate:

- Public runtime exposure of `POST /api/v1/auth/password-reset/request` or
  `POST /api/v1/auth/password-reset/complete`.
- Sending password reset email through the generic notification template.
- Reset-link construction, reset templates, provider-send throttles, base URL
  behavior, appsettings/env changes, SMTP secrets, or runtime provider changes.

## Current Repo Readback

Current email/SMTP/notification/provider shape:

- `docs/architecture/SMTP_EMAIL_PROVIDER_POLICY.md` defines the generic Day 1
  SMTP notification policy: deployment/provider config is separate from
  product/admin policy; secrets must not enter repo files, logs, audit, API
  responses, OpenAPI examples, generated clients, issue/PR comments, or Codex
  reports; missing/disabled/unconfigured/failed provider states must not be
  represented as fake success.
- `SmtpEmailNotificationOptions` has a generic
  `Notifications:SmtpEmail` shape with `Enabled`, `Host`, `Port`, `UseTls`,
  `Username`, `Password`, `FromAddress`, `FromName`, and `TimeoutSeconds`.
- `NotificationProviderReadinessSnapshotService` reports generic email
  readiness as `disabled`, `unconfigured`, or `configured` from SMTP options.
  It does not verify live provider credentials, sender domain posture, reset
  template safety, or password-reset delivery readiness.
- `SmtpEmailNotificationSender` can build and send a generic plain-text
  notification email through an `ISmtpEmailTransport` boundary when enabled and
  configured. Its generic template tells the user to open Settleora and does
  not build reset links.
- `NotificationDeliveryOutboxProcessor` can hand queued generic email attempts
  to the SMTP sender and record redacted provider result categories. The
  current `SmtpEmailNotificationSendRequest.FromDeliveryAttempt` does not carry
  a recipient email address, and the generic outbox path is not a password
  reset delivery orchestration.
- Tests cover disabled-by-default SMTP, incomplete configuration,
  privacy-safe generic notification templates, safe provider exception
  categories, and provider readiness readout redaction.

Current password reset state:

- Schema/domain foundation for `auth_password_reset_requests` and bounded reset
  category constants is merged.
- OpenAPI/generated-client transport contract is merged for:
  - `POST /api/v1/auth/password-reset/request`
  - `POST /api/v1/auth/password-reset/complete`
- Internal runtime foundation is merged. The internal service can request,
  issue, and complete hash-backed reset material; replace the local password
  credential; revoke active account sessions and refresh families after
  success; and write bounded audit.
- Public request/complete routes are still disabled/unregistered in `Program.cs`.
- There is no password reset delivery implementation, reset-link builder,
  reset email template, base URL/public origin policy runtime, provider-send
  throttle runtime, or reset-specific SMTP verification service.

## Required SMTP/Email Delivery Policy Before Implementation

Before implementing password reset email delivery, the following policy must be
preserved in the implementation issue, code, tests, PR body, and report:

- Provider configuration shape and verification: reset delivery may use only an
  approved deployment/secret configuration shape for host, port,
  TLS/STARTTLS behavior, username, password or app password, sender/from
  address, reply-to behavior if any, timeout, and sender-domain posture. A
  readiness check must distinguish syntactically complete config from verified
  provider readiness. No real or realistic provider values may be committed or
  copied into reports/comments.
- Base URL / public origin / reset-link construction: reset links must use an
  approved configured public origin for the deployment. Runtime must not blindly
  derive reset-link origins from untrusted `Host`, forwarded, or referrer
  headers. Reset material may appear only in the delivered reset URL or approved
  handoff boundary and must never be logged, audited, persisted raw, rendered in
  generic notification content, or returned from public request responses.
- Reset-link lifetime: email-link reset material defaults to 60 minutes and is
  configurable only from 15 to 120 minutes. Any future typed short-code or OTP
  reset material needs its own shorter lifetime approval.
- Template/copy redaction: subject, preview, and body must be generic enough
  for inboxes and shared devices. Copy must not reveal account existence,
  local-vs-OIDC state, identifier normalization, provider state, password
  policy internals, audit details, raw reset material, token hashes, raw
  identifiers, passwords, private app data, payment details, raw OCR text,
  storage internals, or provider diagnostics.
- Delivery failure and enumeration behavior: public reset request behavior must
  remain uniform whether the submitted identifier is unknown, disabled,
  OIDC-only, missing a local credential, throttled, provider-disabled,
  provider-unconfigured, queued, sent, failed, or policy-denied. Internal state
  may retain bounded safe categories for operations and audit.
- Provider-send throttles and abuse thresholds: reset request throttles and
  provider-send throttles must be reset-specific. Source, identifier, combined,
  global, and provider-send buckets need a keyed/safe design or an explicit
  safe block. Sign-in throttles are not automatically sufficient for reset.
- Audit/redaction: audit may record bounded workflow/action/outcome/reason
  categories, safe subject IDs after internal resolution, timestamps, and
  correlation IDs. Audit/logs/reports must not include raw reset material,
  passwords, identifiers, raw OCR text, secrets, provider payloads, full request
  bodies, full IP addresses, unbounded user agents, storage internals, provider
  diagnostics, SMTP credentials, reset links, token hashes, or verifier strings.
- Local/dev/test provider behavior: local and test implementations may use a
  fake, capture, or sink provider only when it is explicit, non-production by
  construction, and covered by tests proving no real send occurs. Sink/capture
  output must not be committed and must not contain raw reset material in
  ordinary logs, audit, snapshots, or reports.
- Notification separation: generic notification email plumbing may be reused
  only through reviewed reset-specific boundaries. The existing generic
  notification template is not a reset email template.

## Public Route Exposure Readiness Matrix

Both public routes remain blocked after this docs PR.

| Route | Current status | Required gates before exposure |
| --- | --- | --- |
| `POST /api/v1/auth/password-reset/request` | OpenAPI contract exists; runtime route remains unregistered/disabled. | SMTP/email delivery verified or separately approved recovery delivery; base URL/reset-link policy; reset-specific abuse/provider-send throttles; uniform public response; redacted audit; UI/product copy; final auth/security exposure review. |
| `POST /api/v1/auth/password-reset/complete` | OpenAPI contract exists; runtime route remains unregistered/disabled. | Reset material validation and completion tests; password policy failure mapping that avoids token/account-state leakage; one-time/replay/expiry handling; account-wide session/refresh-family revocation; redacted audit; final auth/security exposure review. |

Exposure gate rules:

- Do not map the public routes until delivery, abuse, audit, UI/product copy,
  and final auth/security gates pass.
- Generated-client availability remains transport-only and does not prove route
  availability, account existence, token validity, provider delivery, or
  permission.
- Any route exposure PR must explicitly prove the route was blocked before the
  PR and list the gates that were satisfied.

## Recommended Next Implementation Slices

1. SMTP/email provider config verification foundation. Add reset-aware provider
   readiness/config validation without sending reset material or exposing public
   routes. Preserve API/domain authority, no secrets in repo/docs/reports, and
   redacted categories only.
2. Reset-link builder and redacted template rendering internal service. Build a
   configured-origin link service and reset-specific plain-text template tests.
   Keep output out of audit/logs and keep public routes blocked.
3. Internal reset delivery orchestration only. Connect internal reset material
   issuance to provider handoff, failure classification, redacted audit, and
   provider-send throttles. Do not register public request/complete routes.
4. Public route exposure after final gates. Expose request/complete only after
   delivery, abuse, audit, UI/product copy, notification-if-used, and final
   auth/security gates pass.

Each slice must preserve OpenAPI/generated-client transport authority,
API/domain auth authority, audit redaction, and route-exposure blocks until a
later task explicitly approves exposure.

## Issue Posture

#336 remains open for the broader auth/session/runtime security epic.

#339 remains open for the Day 1 password reset and credential-change workflow.

Do not close umbrella issues from this SMTP/provider readiness gate. This docs
PR records a next safe path; it does not complete password reset delivery,
public exposure, UI/product copy, notification-if-used, abuse tuning, or final
auth/security acceptance.
