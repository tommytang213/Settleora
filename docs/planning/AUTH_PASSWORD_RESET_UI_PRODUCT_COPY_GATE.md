# Auth Password Reset UI And Product Copy Gate

## Purpose

This docs/control gate records whether the current Settleora repo, Figma,
reference, and product-copy evidence is sufficient to unblock public
local-account password-reset route exposure.

This document does not implement UI, expose routes, change API behavior,
change OpenAPI or generated clients, add notification runtime, change
SMTP/provider configuration, change schema/migrations, change auth/session/
security runtime, or approve final public route exposure.

## Current-State Readback

- Current `origin/main` at this gate:
  `6ce7de222843433a65e0ed923ad7431311363b27`.
- PR #759 is already merged and is the post-merge ledger checkpoint for
  PR #758. No recursive PR #759 checkpoint is needed.
- #336 remains `OPEN`; Project status readback: `Inbox`.
- #339 remains `OPEN`; Project status readback: `Needs Decision`.
- `AUTH_PASSWORD_RESET_PUBLIC_ROUTE_EXPOSURE_PREFLIGHT.md` records
  `BLOCKED_FOR_ROUTE_EXPOSURE`.
- The OpenAPI transport contract contains:
  - `POST /api/v1/auth/password-reset/request`
  - `POST /api/v1/auth/password-reset/complete`
- The OpenAPI descriptions still state that runtime remains unimplemented by
  that contract slice and that generated clients are transport-only.
- Current runtime route exposure tests intentionally assert those public paths
  are not mapped and return `404 Not Found`.
- Password-reset notification runtime is not required for Day 1 public route
  exposure if notifications remain deferred/audit-only.

## Design And Reference Readback

Found:

- `docs/design/mobile/README.md` lists approved mobile V1 references and points
  to a Figma Make link plus manually exported assets.
- `docs/design/mobile/MOBILE_AUTH_SECURITY_REFERENCE_V1.md` is an approved
  Day 1 mobile auth-security Figma/reference for MFA/passkey/recovery-code
  setup, not password reset.
- `docs/design/mobile/assets/auth-security-v1/` contains approved auth-security
  images for security setup, passkey setup, MFA options, authenticator setup,
  recovery codes, and setup complete.
- `docs/design/web/WEB_USER_REFERENCE_V1.md` is an approved textual reference
  gate for derivative user-web surfaces and states that runtime is not
  authorized by the reference.
- `docs/design/web/WEB_ADMIN_REFERENCE_V1.md` is an approved textual reference
  gate for derivative admin-web surfaces and states that runtime is not
  authorized by the reference.
- `apps/mobile/lib/app/sign_in_screen.dart` and tests show a current mobile
  sign-in surface, but not a forgotten-password entry point or reset-complete
  route.
- `apps/web-user/README.md` says the user portal shell does not implement web
  sign-in, credential storage, or fake current-user data.
- `apps/web-admin/README.md` says no admin portal implementation exists.

Missing:

- No password-reset-specific mobile Figma frames or exported reference assets.
- No mobile forgotten-password entry point.
- No mobile reset-request submitted state.
- No mobile reset-complete form/state.
- No mobile expired, consumed, replayed, malformed, unsupported, provider/OIDC,
  or generic invalid-link reset states.
- No password-reset-specific user-web screens or visual references.
- No user-web forgotten-password entry point or reset-complete form/state.
- No admin password-reset readout or admin copy for Day 1.
- No approved reset email subject/body/preview product-copy artifact.
- No approved security-center or credential-activity password-reset copy.
- No visual/product approval for public reset route exposure.

Figma/reference conclusion: current reference coverage is useful for general
Settleora visual language, but it is not product-grade enough to approve public
password-reset exposure. A password-reset-specific visual/product approval
remains required before route mapping.

## Required User-Facing Surfaces Before Route Mapping

Required for Day 1 if public password reset is exposed:

- Mobile forgotten-password entry point from the sign-in flow.
- Mobile reset request form and submitted state.
- Mobile reset-complete form/state reached from the approved reset link path.
- Reset email subject, preview, and body copy.
- Generic expired, consumed, replayed, malformed, unknown, unsupported, and
  invalid-link states.
- OIDC/provider-owned password state that does not imply Settleora can reset
  external provider passwords.
- Success state after reset completion that says the user can sign in with the
  new password and that other sessions may have been ended for security.

Conditionally required:

- User-web forgotten-password entry point and reset-complete form/state if
  user web participates in Day 1 public auth.
- Admin readout/admin copy only if current Day 1 admin scope adds an admin
  recovery or operator readout surface.
- Security-center or credential-activity copy only if route exposure includes
  those surfaces or password-reset notifications.

Not required for Day 1 route exposure by this gate:

- Password-reset notification runtime, as long as notifications remain
  deferred/audit-only.
- Target/security-center OpenAPI/generated-client work, unless notifications,
  security-center, or credential-activity surfaces are used.

## Product Copy Requirements

Request-submit copy must be uniform and anti-enumeration safe:

- Do not reveal whether an account exists.
- Do not reveal whether the submitted account is local or OIDC/provider-backed.
- Do not reveal whether SMTP is configured.
- Do not reveal whether a message was sent, throttled, deferred, skipped, or
  failed.
- Do not reveal whether reset material was issued.

Email copy must be generic and redacted:

- Include the reset link only in the actual approved delivery boundary.
- Do not include raw provider diagnostics, account existence details,
  local-vs-OIDC state, token hashes, provider state, private app data, raw
  identifiers, storage internals, OCR text, or admin-only diagnostics.
- Do not imply delivery success anywhere outside the provider handoff/readiness
  state approved by runtime policy.

Reset-complete copy must be generic:

- Do not reveal token validity, account state, consumed/revoked/replaced state,
  or password-policy internals beyond safe validation text.
- Use one generic expired/invalid/reused/malformed-link family of copy where
  separate messages would reveal token or account state.
- Confirm successful reset only after completion succeeds.
- Make clear that the user can sign in with the new password and that other
  sessions may have been ended for security.

OIDC/provider-password copy:

- Do not imply Settleora can reset an external identity-provider password.
- Safe wording may direct the user to use their identity provider or contact
  their Settleora administrator only where current product scope supports that
  route.

Button and action labels:

- Use action-specific labels, such as `Send reset link`, `Back to sign in`,
  `Set new password`, `Use another sign-in method`, or `Request a new link`.
- Do not use vague labels such as `OK`, `Yes`, `Confirm`, or `Submit` for the
  primary reset actions.

Visual/UX requirements:

- Mobile must follow existing Settleora mobile design language: modern rounded
  fintech styling, single-column auth flows, bottom sheets where appropriate,
  large tap targets, safe areas, and product-facing language.
- Web/admin must follow current product-grade user-web/admin references and
  must not invent a mismatched visual language.

## Readiness Matrix

| Gate | Status | Evidence / decision |
| --- | --- | --- |
| Mobile forgotten-password entry point | `blocked` | No implemented or password-reset-specific referenced entry point was found. |
| Mobile request submitted state | `blocked` | No implemented or referenced submitted state was found. |
| Mobile reset-complete form/state | `blocked` | No implemented or referenced reset-complete state was found. |
| User-web reset surfaces | `blocked_if_user_web_participates` | User-web has a shell and protected readouts, but no web sign-in, credential storage, or reset screens. |
| Admin reset readout/copy | `not_required_unless_admin_scope_uses_it` | Web-admin has no implementation. Admin reset/recovery is not approved by this gate. |
| Reset email subject/body/preview copy | `blocked` | Internal template composition exists, but no approved product-copy artifact or visual approval exists for Day 1 public exposure. |
| Security-center/credential-activity copy | `not_required_unless_used` | No security-center target or credential-activity surface is approved for password reset. |
| Unsupported/OIDC/provider-password states | `blocked` | Policy exists, but no user-facing product copy or visual state is approved. |
| Expired/consumed/replayed/malformed link states | `blocked` | Runtime policy exists internally, but no user-facing generic copy/visual states are approved. |
| Figma/reference coverage | `insufficient` | Current references cover general mobile auth-security and broad web/admin language, not password-reset-specific public flows. |

## Decision

Decision: `BLOCKED_FOR_ROUTE_EXPOSURE`.

Current repo/Figma/reference/product-copy evidence is not sufficient to unblock
public password-reset route exposure. Public route mapping must wait for an
approved password-reset UI/Figma/reference/product-copy package or equivalent
human visual/product approval covering the required surfaces above.

Docs-only copy requirements in this gate are not enough by themselves to expose
the public routes. Required screens and states still need implementation-ready
visual/reference evidence and product approval.

## Issue Posture

Keep #336 open. This gate does not complete the broader auth/session/runtime
security epic or final auth/security acceptance.

Keep #339 open. This gate does not expose public password-reset routes,
complete user-visible password-reset UX/product copy, implement notification
runtime, or complete the Day 1 password reset and credential-change workflow.

No issue closure, label, milestone, assignee, or Project field update is
approved by this document.

## Remaining Gates

- Password-reset UI/Figma/reference/product approval for the required public
  reset surfaces.
- Manual OpenAPI/generated-client gate for changed public route runtime posture
  or any target/security-center contract.
- Final public route exposure review.
- Final auth/security acceptance.

If a future route-exposure design emits password-reset notifications, add the
target/schema/OpenAPI/generated-client gate and authorized current-account
security-center, credential-activity, or auth-audit re-fetch route before the
notification runtime.
