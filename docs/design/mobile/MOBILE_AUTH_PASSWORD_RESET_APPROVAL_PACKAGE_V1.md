# Mobile Auth Password Reset Approval Package V1

## Status

Approval package for Day 1 local-account password reset.

- Related issues: #336, #339
- Package status: `READY_FOR_MANUAL_PRODUCT_REVIEW`
- Manual product/design approval required before route exposure: Yes
- Public route exposure authorized by this doc: No
- Runtime UI implementation authorized by this doc: No
- New password-reset-specific Figma frames found in repo: No

This package makes the next manual product/design decision concrete for the
Day 1 forgotten-password flow. It defines required screens, states, product
copy, visual requirements, and acceptance checks for a future mobile UI/Figma or
equivalent human-approved reference.

This document does not expose routes, implement mobile/web/admin UI, change API
behavior, change OpenAPI or generated clients, add notification runtime, change
SMTP/provider configuration, change schema/migrations, change auth/session/
security runtime, or approve final public password-reset route mapping.

## Source References

Future implementation and approval tasks must read the current repo versions of:

- [Program architecture](../../../PROGRAM_ARCHITECTURE.md)
- [Auth password reset UI and product copy gate](../../planning/AUTH_PASSWORD_RESET_UI_PRODUCT_COPY_GATE.md)
- [Password reset public route exposure preflight](../../planning/AUTH_PASSWORD_RESET_PUBLIC_ROUTE_EXPOSURE_PREFLIGHT.md)
- [Local password reset token policy gate](../../planning/AUTH_LOCAL_PASSWORD_RESET_TOKEN_POLICY_GATE.md)
- [Local password reset API runtime readiness gate](../../planning/AUTH_LOCAL_PASSWORD_RESET_API_RUNTIME_READINESS_GATE.md)
- [Auth session/security notification source policy](../../architecture/AUTH_SESSION_SECURITY_NOTIFICATION_SOURCE_POLICY.md)
- [SMTP email provider policy](../../architecture/SMTP_EMAIL_PROVIDER_POLICY.md)
- [Mobile auth security reference V1](MOBILE_AUTH_SECURITY_REFERENCE_V1.md)
- [Mobile design reference V1](MOBILE_DESIGN_REFERENCE_V1.md)
- [User web reference V1](../web/WEB_USER_REFERENCE_V1.md)
- [Admin web reference V1](../web/WEB_ADMIN_REFERENCE_V1.md)

## Current Evidence

Found:

- Approved general Settleora mobile references and exported assets exist under
  `docs/design/mobile/` and `docs/design/mobile/assets/`.
- The auth-security reference defines the approved security setup visual
  language for MFA/passkeys/recovery codes.
- User-web and admin-web textual references define derivative web/admin visual
  language, but do not authorize runtime implementation.
- The OpenAPI contract contains password-reset transport paths while still
  documenting that runtime remains unimplemented by that contract slice.
- Current route-exposure tests intentionally keep the password-reset public
  routes unmapped.

Not found:

- Password-reset-specific Figma frames or exported assets.
- Mobile forgotten-password entry point.
- Mobile reset request submitted state.
- Mobile reset-complete form/state.
- Mobile generic invalid-link state.
- Mobile unsupported/provider-owned password state.
- Approved reset email subject, preview, and body copy.
- Approved security-center or credential-activity password-reset copy.

Conclusion: this repo-tracked package is ready for manual product/design review,
but it is not final approval. Public route mapping remains blocked until a
human approves this package or a replacement Figma/reference package.

## Flow Inventory

Required Day 1 mobile flow:

1. Sign-in screen forgotten-password entry point.
2. Reset request form.
3. Anti-enumeration-safe request submitted state.
4. Reset email.
5. Reset-complete form opened from the approved reset link boundary.
6. Successful reset state.
7. Generic invalid-link state for expired, consumed, replayed, malformed,
   unknown, revoked, replaced, wrong-account, unsupported, or otherwise invalid
   reset material where separate states would reveal token or account state.
8. Unsupported/provider-owned password state only where the user is already in
   a product-approved sign-in-method context and the copy does not disclose the
   submitted account state.

Conditional Day 1 coverage:

- User-web reset screens only if user web participates in Day 1 public auth.
- Admin readout/copy only if Day 1 admin scope uses an operator/admin recovery
  or readout surface.
- Security-center or credential-activity copy only if those surfaces or
  password-reset notifications are used.

## Visual Requirements

Mobile password reset must inherit Settleora's approved mobile visual language:

- Single-column mobile auth flow with a constrained content width on wide test
  windows.
- Modern rounded fintech styling, warm Settleora palette, restrained elevation,
  and no mismatched visual language.
- SafeArea-aware layout, scrollable forms, and bottom padding that prevents
  sticky actions from covering content.
- Large tap targets for primary actions, secondary actions, links, and password
  visibility controls.
- Product-facing copy only. Do not mention endpoints, implementation seams,
  SMTP readiness, token state, generated clients, audit categories, or internal
  policies in user-facing UI.
- Password fields support show/hide affordances, accessible labels, keyboard
  submission, and validation summaries that do not reveal policy internals.
- Loading, disabled, error, empty, and success states must be explicit and must
  not resize or shift action bars unexpectedly.
- Primary action labels must be action-specific, not generic confirmation
  words.

## Screen Specifications

### A01 Sign-In Entry Point

Purpose: give users a clear path from sign-in to password reset without making
reset the dominant action.

Required content:

- Existing sign-in fields and primary sign-in action remain dominant.
- Secondary text link: `Forgot password?`
- The link opens the reset request form.

Required behavior:

- Do not show account existence, local-vs-OIDC state, SMTP state, or provider
  readiness on the sign-in screen.
- Keep `Use another sign-in method` available only where the current sign-in
  surface already supports alternate sign-in methods.

### A02 Reset Request Form

Purpose: collect the user's reset identifier while preserving
anti-enumeration behavior.

Proposed copy:

- Title: `Reset your password`
- Body: `Enter the email or username you use for Settleora. If password reset is available for that account, you can continue from the reset link.`
- Field label: `Email or username`
- Field hint: `name@example.com`
- Primary button: `Send reset link`
- Secondary button: `Back to sign in`

Safe validation:

- Empty field: `Enter your email or username.`
- Malformed email-like input: `Check the format and try again.`
- Network or server unavailable before a uniform reset response is possible:
  `We could not process this request right now. Try again later.`

Forbidden copy:

- Do not say an account was found.
- Do not say an account was not found.
- Do not say whether the account uses Settleora password sign-in or an external
  provider.
- Do not say email is configured, sent, skipped, throttled, deferred, or failed.

### A03 Request Submitted

Purpose: give a uniform next step after a reset request without revealing
account, provider, SMTP, throttle, or token issuance state.

Proposed copy:

- Title: `Check your next step`
- Body: `If password reset is available for that account, use the reset link to continue. You can return to sign in now.`
- Secondary support: `For accounts managed by an external sign-in provider, use that provider's recovery options.`
- Primary button: `Back to sign in`
- Secondary button: `Use another sign-in method`

Notes:

- This state must be shown for eligible, missing, OIDC-only, provider-owned,
  disabled, provider-unconfigured, provider-failed, throttled, and skipped
  internal outcomes when the public request has been accepted.
- Do not include a resend countdown unless a future product/security gate
  approves a uniform resend policy that does not leak throttle state.

### A04 Reset Email

Purpose: deliver only the approved reset link boundary with generic,
redacted copy.

Subject:

```text
Reset your Settleora password
```

Preview:

```text
Use this link to continue resetting your Settleora password.
```

Body:

```text
Reset your Settleora password

Use this link to continue resetting your Settleora password:

{{reset_link}}

This link expires after a limited time. If you did not request this, you can ignore this email.
```

Required email rules:

- The reset link appears only in the approved delivery boundary.
- Do not include account existence details, local-vs-provider state, SMTP
  diagnostics, token hashes, provider state, private app data, raw identifiers,
  storage internals, OCR text, admin-only diagnostics, IP addresses, device
  fingerprints, or audit IDs.
- Do not claim the message was delivered, read, or accepted by a mailbox.

### A05 Reset-Complete Form

Purpose: let the user set a new password after the API validates the approved
reset material, without exposing token/account state in failure copy.

Proposed copy:

- Title: `Set a new password`
- Body: `Choose a new password for your Settleora account.`
- Field label: `New password`
- Confirm field label: `Confirm new password`
- Primary button: `Set new password`
- Secondary button: `Back to sign in`

Safe validation:

- Empty password: `Enter a new password.`
- Empty confirmation: `Confirm your new password.`
- Mismatch: `The passwords do not match.`
- Too short or policy rejected: `Choose a stronger password.`
- Submission failed for a generic invalid-link family:
  `This reset link cannot be used. Request a new link to continue.`

Forbidden copy:

- Do not say the token is expired, consumed, replayed, revoked, malformed,
  replaced, wrong-account, or unknown.
- Do not reveal password-policy internals beyond safe validation text.
- Do not issue access or refresh credentials as a copy promise.

### A06 Successful Reset

Purpose: confirm the password change only after completion succeeds.

Proposed copy:

- Title: `Password updated`
- Body: `You can sign in with your new password. For your security, other sessions may have been ended.`
- Primary button: `Back to sign in`

Notes:

- This state appears only after the completion request succeeds.
- Do not show session counts, session IDs, refresh-family details, or audit
  references.

### A07 Generic Invalid-Link State

Purpose: handle expired, consumed, replayed, malformed, unknown, revoked,
replaced, wrong-account, unsupported, or invalid reset material through one safe
family of copy.

Proposed copy:

- Title: `Reset link unavailable`
- Body: `This reset link cannot be used. Request a new link to continue.`
- Primary button: `Request a new link`
- Secondary button: `Back to sign in`

Notes:

- Use the same state for all token/account distinctions that would reveal
  validity, ownership, replay, consumption, expiry, or account state.
- Do not include timing details unless a future policy approves a generic
  lifetime hint that is safe for every viewer.

### A08 Unsupported Or Provider-Owned Password State

Purpose: explain that some accounts must recover through another sign-in method
only in a context where product scope supports that message.

Preferred placement:

- Do not show this as the request-submitted result.
- Show it only from an approved sign-in-method help surface, account-security
  help surface, or external-provider sign-in context where the user has already
  chosen or been shown that provider path without exposing a submitted account.

Proposed copy:

- Title: `Use your sign-in provider`
- Body: `Some Settleora accounts use an external sign-in provider. Reset that password with the provider or contact your Settleora administrator if your workspace supports admin help.`
- Primary button: `Use another sign-in method`
- Secondary button: `Back to sign in`

Notes:

- Do not imply Settleora can reset external identity-provider passwords.
- Do not show this immediately after a submitted identifier if it would reveal
  local-vs-provider account state.

## Web/Admin/Security-Center Conditional Copy

User web:

- Required only if Day 1 user web participates in public auth.
- Use the same copy families and action labels as mobile.
- Layout should follow [User Web Reference V1](../web/WEB_USER_REFERENCE_V1.md):
  quiet workspace styling, restrained cards, accessible forms, stable actions,
  and no marketing hero.

Admin:

- Required only if Day 1 admin scope includes a password-reset operator readout
  or recovery surface.
- Safe readout copy: `Password reset is available only through approved user recovery flows. Provider-owned passwords must be recovered with the identity provider.`
- Do not expose submitted identifiers, token state, provider payloads, SMTP
  diagnostics, raw audit metadata, session IDs, token hashes, or reset links.
- No admin reset action is approved by this package.

Security center or credential activity:

- Required only if route exposure adds these surfaces or password-reset
  notifications.
- Safe activity copy after authorized re-fetch: `Your password was updated. Other sessions may have been ended for security.`
- Safe external notification snippet if later approved:
  `A security update is available in Settleora.`
- Do not create notification targets or copy without the target/schema/OpenAPI
  and auth-security notification gates.

## Acceptance Checklist

Manual product/design approval should verify:

- All required mobile states A01 through A08 are represented or explicitly
  waived with a route-exposure-safe reason.
- Request-submitted copy is anti-enumeration safe.
- Email copy is generic, redacted, and includes the reset link only in the
  approved delivery boundary.
- Reset-complete and invalid-link copy do not reveal token validity, token
  state, account existence, provider state, delivery state, or password-policy
  internals.
- Unsupported/provider-owned password copy does not imply Settleora can reset
  external identity-provider passwords.
- Primary and secondary actions use action-specific labels:
  `Send reset link`, `Back to sign in`, `Set new password`,
  `Request a new link`, and `Use another sign-in method`.
- Visual language matches existing Settleora mobile auth/security references.
- Web/admin/security-center copy is included only where the Day 1 surface uses
  it.
- The package does not claim final public route exposure approval.

## Route-Exposure Posture

Public route exposure remains blocked for:

- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/complete`

Before route mapping, Settleora still needs:

- Human product/design approval of this package or a replacement Figma/reference
  package.
- Manual OpenAPI/generated-client gate for changed public runtime posture and
  any target/security-center contract.
- Final public route exposure review.
- Final auth/security acceptance.
