# Mobile Auth Security Reference V1

## Status

Approved Day 1 Figma/reference.

- Related issue: #417
- Approved Figma page/section: `Day 1 Auth Security #417`
- Asset folder: `docs/design/mobile/assets/auth-security-v1/`

This reference records the approved Day 1 mobile auth security visual direction and product copy guardrails for future implementation. It does not authorize runtime auth/session/security behavior, OpenAPI, generated-client, schema, migration, deployment, secret, storage, money, settlement, or API authority changes.

## Approved Frames

Use the dark version as the accepted reference. The earlier warm beige/gold version was rejected and must not be used.

| Frame | Approved image |
| --- | --- |
| A01 Security Setup Intro | [a01-security-setup-intro.png](assets/auth-security-v1/a01-security-setup-intro.png) |
| A02 Passkey Setup | [a02-passkey-setup.png](assets/auth-security-v1/a02-passkey-setup.png) |
| A03 MFA Options | [a03-mfa-options.png](assets/auth-security-v1/a03-mfa-options.png) |
| A04 Authenticator Setup | [a04-authenticator-setup-part-01.png](assets/auth-security-v1/a04-authenticator-setup-part-01.png), [a04-authenticator-setup-part-02.png](assets/auth-security-v1/a04-authenticator-setup-part-02.png) |
| A05 Recovery Codes | [a05-recovery-codes-part-01.png](assets/auth-security-v1/a05-recovery-codes-part-01.png), [a05-recovery-codes-part-02.png](assets/auth-security-v1/a05-recovery-codes-part-02.png) |
| A06 Setup Complete | [a06-setup-complete.png](assets/auth-security-v1/a06-setup-complete.png) |

## UX And Security Rules

- Passkey is recommended/default.
- Authenticator app is fallback MFA.
- Recovery codes are required before setup is complete.
- SMS MFA is not Day 1.
- Do not claim passkeys "work offline" for server sign-in.
- Do not claim passkeys "cannot be copied/transferred".
- Settleora never sees passkey secrets.
- Recovery codes are shown once; docs/screenshots use examples only.
- Avoid real recovery-code values in docs/screenshots.
- Product-facing copy only; no WebAuthn/API/developer wording in normal UI.

## Implementation Guardrails

- UI must not decide auth/security authority from cache/routes.
- API/domain owns auth/session/security writes, audit, and policy.
- Do not log or expose passkey secrets, TOTP secrets, recovery codes, tokens, passwords, or raw sensitive auth material.
- No SMS MFA in Day 1.
- Recovery-code download/copy/print actions must respect security/audit copy boundaries.

## Component And Design Requirements

- Match existing Settleora dark mobile style/tokens/components.
- Reuse shared buttons, cards, status chips, warning callouts, and verification-code inputs.
- Large tap targets and accessible disabled states.
- A04 CTA must remain above bottom safe area or clearly scroll.

## Acceptance Checklist

- All six frames are represented.
- Dark visual direction is used.
- Security copy avoids rejected claims.
- Recovery-code values are examples only.
- SMS MFA is not present.
- Docs validation passes.
