# Mobile Privacy Vault Reference V1

## Status

Approved dark-mode mobile reference.

- Reference name: `Day 1 Privacy Vault #421`
- Related item: #421
- Asset folder: `docs/design/mobile/assets/privacy-vault-v1/`

This reference records the approved Day 1 mobile privacy and vault visual direction for future implementation. It does not authorize runtime privacy, vault, auth, session, storage, file-access, OpenAPI, generated-client, schema, migration, deployment, secret, money, settlement, or API authority changes.

## Approved Screens

| Screen | Asset | Purpose |
| --- | --- | --- |
| P01 Privacy & Vault intro | [p01-privacy-vault-intro-part-01.png](assets/privacy-vault-v1/p01-privacy-vault-intro-part-01.png) | Introduces Privacy Mode and Vault protection without exposing sensitive content. |
| P01 Privacy & Vault intro | [p01-privacy-vault-intro-part-02.png](assets/privacy-vault-v1/p01-privacy-vault-intro-part-02.png) | Continues the privacy/vault onboarding explanation and primary setup action. |
| P02 Privacy Mode setup | [p02-privacy-mode-setup-part-01.png](assets/privacy-vault-v1/p02-privacy-mode-setup-part-01.png) | Shows selectable privacy-mode setup and what each mode hides or protects. |
| P02 Privacy Mode setup | [p02-privacy-mode-setup-part-02.png](assets/privacy-vault-v1/p02-privacy-mode-setup-part-02.png) | Continues setup details and confirmation actions for privacy-mode selection. |
| P03 Vault setup | [p03-vault-setup-part-01.png](assets/privacy-vault-v1/p03-vault-setup-part-01.png) | Presents protected Vault setup and sensitive-data categories. |
| P03 Vault setup | [p03-vault-setup-part-02.png](assets/privacy-vault-v1/p03-vault-setup-part-02.png) | Continues Vault setup with protected access and recovery-oriented copy. |
| P04 App lock & privacy controls | [p04-app-lock-privacy-controls-part-01.png](assets/privacy-vault-v1/p04-app-lock-privacy-controls-part-01.png) | Shows app lock and privacy control settings. |
| P04 App lock & privacy controls | [p04-app-lock-privacy-controls-part-02.png](assets/privacy-vault-v1/p04-app-lock-privacy-controls-part-02.png) | Continues app lock, export privacy, and related settings controls. |
| P05 Privacy Mode active | [p05-privacy-mode-active.png](assets/privacy-vault-v1/p05-privacy-mode-active.png) | Previews active Privacy Mode with masked dashboard/home content. |
| P06 Vault unlock | [p06-vault-unlock.png](assets/privacy-vault-v1/p06-vault-unlock.png) | Shows biometric unlock and PIN fallback for Vault access. |

## Accepted Visual Direction

- Use the dark Settleora mobile fintech direction.
- Use gold for security and privacy action accents.
- Reserve green for success or synced states.
- Reuse card, settings-row, toggle, banner, button, and sensitive-placeholder patterns.

## UX Intent

- Help users understand what Privacy Mode hides.
- Show protected Vault access without revealing sensitive content.
- Clarify app lock and export privacy controls.
- Preview masked dashboard/home content.
- Provide biometric unlock and PIN fallback.

## Guardrails

- This is reference material only, not runtime implementation.
- Client privacy presentation does not replace API authorization.
- Do not expose storage internals, direct filesystem paths, secrets, tokens, raw credentials, or sensitive file contents.
- Files, private notes, payment details, proof files, receipt images, and QR/payment images remain sensitive app data.
- Server-mode access remains API-authorized.
- API/domain remains authoritative for auth, authorization, audit, file access, privacy/security policy, and server-mode data.

## Implementation Notes

- Use shared design tokens and components where available.
- Keep button text action-specific.
- Treat P04 as a scrollable settings screen if needed.
- Implement the P05 banner with a softer reusable alert/banner token if appropriate.
- Do not hardcode one-off styling when shared components or tokens exist.

## Acceptance Checklist

- All ten screenshot assets are represented.
- The dark mobile fintech direction is used.
- Gold and green accents follow the accepted meaning.
- Sensitive content is masked or represented with placeholders.
- Privacy and vault copy avoids implementation promises.
- Runtime authority remains with API/domain services.
