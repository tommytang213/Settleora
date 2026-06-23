# Mobile Day 1 Reference Coverage Audit

Timestamp identifier: `2026-06-23 18:55 HKT`

## 1. Executive Summary

This audit maps the current Day 1 `Needs Figma / Reference` queue against the saved mobile V1 references in this repository.

Result: the repo already has broad approved mobile references for the shell, Home, Bills/OCR base flows, Groups base flows, Settle base flows, More/Settings base flows, Notifications center, shared components, and tokens. Those areas should not be regenerated from scratch.

The current Day 1 queue still needs focused extension prompts for newer gate-specific states: privacy vault onboarding/recovery warnings, bill revision review-diff, advanced OCR tax/discount/fee/refund correction, friends/direct sharing, sync conflict/failure, notification permission/provider/deep-link states, import/export/backup/restore, and the Basic/Guided/Advanced/Help-me-decide mode update. Passkey/MFA mobile UX is missing as an explicit mobile reference and needs a new mobile prompt. Web and admin portions of mixed mobile/web issues must be routed to separate web/admin reference work.

Conservative rule used: a saved reference is `Covered` only when the required screens/states are explicitly documented in `docs/design/mobile/` or its approved asset inventory. Broad mention of a category is not treated as full coverage for gate-specific Day 1 states.

## 2. Source References Inspected

- `PROGRAM_ARCHITECTURE.md`
- `README.md`
- `docs/workflow/CODEX_TASK_GUIDE.md`
- `docs/workflow/DAY1_EXECUTION_BOARD.md`
- `docs/workflow/DAY1_PWT_BURNDOWN_TRACKING.md`
- `docs/planning/DAY1_DECISION_REGISTER.md`
- `docs/planning/DAY1_EXECUTION_COVERAGE_MATRIX.md`
- `docs/planning/DAY1_EXPANDED_ISSUE_CANDIDATES.md`
- `docs/planning/DAY1_TECHNICAL_GATE_DECISION_PACKETS.md`
- `docs/prd/MVP_DAY1_SCOPE.md`
- `docs/prd/PRODUCT_REQUIREMENTS_DRAFT_V5.md`
- `docs/architecture/USER_EXPERIENCE_MODES_ARCHITECTURE.md`
- `docs/architecture/PRIVACY_VAULT_ARCHITECTURE.md`
- `docs/qa/MOBILE_FIGMA_PARITY_GUARDRAILS.md`
- `.ai/current-milestone.md`, `.ai/state.json`, `.ai/task-queue.json`, `.ai/qa-report.md`, `.ai/qa-findings.json`
- All files under `docs/design/mobile/`, including screenshot asset inventory and approved V1 mobile references.
- Read-only GitHub issue/project metadata for #417, #421, #425, #429, #434, #446, #452, and #456. All eight target issues were open and in `Needs Figma / Reference` when inspected.

## 3. Coverage Matrix

| Issue / area | Required reference | Existing reference doc(s) | Coverage status | Why | Needed next action | Figma prompt needed | Implementation readiness consequence |
|---|---|---|---|---|---|---|---|
| #417 Auth passkey/MFA mobile | Enrollment, challenge, recovery-code display-once, lost-device/recovery, security settings | `MOBILE_MORE_SETTINGS_REFERENCE_V1.md` only covers privacy/security and sessions/devices generally | Missing | No saved mobile reference explicitly covers passkeys, WebAuthn, TOTP MFA, recovery codes, challenge screens, or lost-device recovery | Generate a new focused mobile auth security UX reference | New | Mobile auth/passkey/MFA implementation must stay blocked behind design and auth/security manual gate |
| #417 Auth passkey/MFA web/admin | User web security settings and admin MFA/passkey policy | None in mobile docs | Not mobile | Issue labels include web-user and web-admin; mobile references cannot approve web/admin surfaces | Route to separate web/admin Figma/reference work | Web/Admin separate | Web/admin implementation remains blocked separately |
| #421 Privacy mode onboarding/settings/warnings | Standard Secure vs Recoverable Private Vault, onboarding, recovery warnings, trusted-device/recovery, settings, backup/export warnings | `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, `MOBILE_DESIGN_REFERENCE_V1.md` | Partial | More/Settings covers privacy/security, data/import/export, and local/server mode, but not vault mode selection, envelope/recovery warnings, trusted-device flows, or backup/export vault warnings | Extend More/Settings with vault onboarding and warning flows | Extension | Privacy-vault UI implementation remains blocked for gate-specific states |
| #425 Bill revision mobile review-diff | Revision diff, changed-only markers, affected-user approval, payer reconfirmation, settlement-impact warnings | `MOBILE_BILLS_OCR_REFERENCE_V1.md`, `MOBILE_SETTLE_REFERENCE_V1.md`, `MOBILE_SHARED_DESIGN_SYSTEM_AUDIT_V1.md` | Partial | Bills and Settle references cover base bill/settlement patterns and the audit mentions revision money controls, but no approved review-diff screen flow is documented | Extend Bills/Settle with revision review-diff and settlement-impact states | Extension | Bill revision mobile UI must not proceed beyond existing base patterns |
| #425 Bill revision web review-diff | User web review-diff | None in mobile docs | Not mobile | Web review-diff needs a separate web surface reference | Route to web-user reference work | Web/Admin separate | Web implementation remains blocked separately |
| #429 OCR tax/discount/fee/refund correction | Tax rate/category, included/excluded tax, discount treatment, fee/refund/correction classification, receipt mismatch review | `MOBILE_BILLS_OCR_REFERENCE_V1.md`, `MOBILE_SHARED_DESIGN_SYSTEM_AUDIT_V1.md` | Partial | OCR V1 covers base OCR review fields, tax, service charge, discount, line items, mismatch, and duplicate warning. It does not explicitly cover multi-tax groups, tax-included/excluded toggles, refund/tax-correction linkage, fee allocation, tender/change exclusion, or line reclassification taxonomy | Extend OCR review with correction taxonomy and multi-tax states | Extension | Base OCR UI can be reused, but Day 1 advanced correction work remains blocked |
| #434 Friends/direct sharing mobile | Exact-match discovery, request inbox/outbox, accept/decline, block/unfriend, direct-share picker, temporary participant claim, privacy-safe failures | `MOBILE_GROUPS_REFERENCE_V1.md`, `MOBILE_BILLS_OCR_REFERENCE_V1.md`, `MOBILE_MORE_SETTINGS_REFERENCE_V1.md` | Partial | Groups covers members/invites and Bills covers searchable participant selectors, but no friend lifecycle, block/unfriend, direct-share authorization, or claim/link flow is explicit | Extend Groups/Bills with friends and direct sharing flows | Extension | Group/member base UI can be reused; friends/direct sharing implementation remains blocked |
| #434 Friends/direct sharing web | User web friend/direct-sharing UX | None in mobile docs | Not mobile | Web surface needs its own reference | Route to web-user reference work | Web/Admin separate | Web implementation remains blocked separately |
| #446 Sync conflict/failure | Sync status, queue, retry, conflict compare, server rejection, preserved local pending data | `MOBILE_NOTIFICATIONS_REFERENCE_V1.md`, `MOBILE_GROUPS_REFERENCE_V1.md`, `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, `MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md` | Partial | Existing docs mention sync conflict as a notification/action state and More covers sync/data mode generally. They do not define a conflict compare/resolution queue or preserved-pending-detail screens | Generate focused sync extension frames | Extension | Sync UI implementation may show generic states only; conflict resolution remains blocked |
| #452 Notification preferences/permission/deep-link | Preferences, unsupported/unconfigured channel states, OS permission prompts, digest/quiet hours, group mute, deep links, delivery status | `MOBILE_NOTIFICATIONS_REFERENCE_V1.md`, `MOBILE_MORE_SETTINGS_REFERENCE_V1.md` | Partial | Notification center, review queue, detail, and basic settings are covered. Push/email provider state, OS permission, device token lifecycle, quiet hours/digest, group mute, delivery status, and deep-link fallback states are not explicit | Extend Notifications and More settings with channel/preference/deep-link states | Extension | In-app notification UI can reuse V1; provider/preference/deep-link implementation remains blocked |
| #452 Web/admin notification policy | Web user preferences and admin provider policy | None in mobile docs | Not mobile | Mixed labels include web-user and web-admin | Route to separate web/admin references | Web/Admin separate | Web/admin notification implementation remains blocked separately |
| #456 Import/export/backup/restore mobile | Import mapping, duplicate/conflict review, encrypted backup/password warnings, restore preview, overwrite/merge confirmation, local/server migration warnings | `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, `MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md` | Partial | More/Settings covers Data/import/export as a hub and warns about sensitive actions, but does not define mapping, restore preview, encrypted backup, wrong-password/corrupt backup, overwrite/merge, or local/server migration states | Extend More/Data with import/export/backup/restore task flow | Extension | More hub can link to data tools; implementation of actual flows remains blocked |
| #456 Web/admin import/export/backup | Web/admin import/export/backup policy and maintenance surfaces | None in mobile docs | Not mobile | Web/admin backup/maintenance flows are outside mobile references | Route to web/admin reference work | Web/Admin separate | Web/admin implementation remains blocked separately |
| Mobile home/dashboard | Home triage, quick actions, needs attention, bottom shell | `MOBILE_DESIGN_REFERENCE_V1.md`, `MOBILE_FIGMA_PARITY_GUARDRAILS.md`, assets `mobile-shell-v1/` | Covered | Approved V1 shell and Home choreography are explicit | Link future Home tasks to existing references | No | Do not regenerate Home from scratch |
| Bottom navigation / app shell | `Home / Bills / Groups / Settle / More`, no center plus, notifications from top affordance | `MOBILE_DESIGN_REFERENCE_V1.md`, `MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md`, `MOBILE_FIGMA_PARITY_GUARDRAILS.md` | Covered | Navigation decisions are locked and repeated across guardrails | Reuse existing reference | No | Implementation tasks should preserve shell model |
| Bills base | Bills list, filters, add sheet, manual quick/itemized bills, assignment, bulk item assignment | `MOBILE_BILLS_OCR_REFERENCE_V1.md`, assets `bills-ocr-v1/` | Covered | Base Bills/OCR V1 documents list, add paths, manual bill model, assignment, bulk actions, and shared components | Reuse existing reference | No | Do not regenerate base Bills screens |
| OCR capture/review base | Capture/import, on-device OCR first, processing/error/retry/manual fallback, editable fields | `MOBILE_BILLS_OCR_REFERENCE_V1.md`, assets `bills-ocr-v1/` | Covered | Base OCR capture/review flow is explicit | Reuse for base OCR; extend only advanced correction states | No | Base OCR implementation can link existing reference |
| Groups base | Groups list, dashboard, needs attention, members, manage members, group bill context, balances | `MOBILE_GROUPS_REFERENCE_V1.md`, assets `groups-v1/` | Covered | Base group surfaces and actions are explicit | Reuse existing reference | No | Do not regenerate base Groups screens |
| Settle base | Dashboard, balances, suggested settlements, request payment, mark paid, confirm receipt, detail/history, proof/privacy | `MOBILE_SETTLE_REFERENCE_V1.md`, assets `settle-v1/` | Covered | Base settlement surfaces and privacy guardrails are explicit | Reuse existing reference | No | Do not regenerate base Settle screens |
| More / Settings base | More hub, profile/account, payment details, app settings, privacy/security, sessions, notifications, data/import/export, local/server mode | `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, assets `more-settings-v1/` | Covered | Base settings taxonomy and hub routing are explicit | Reuse existing reference; extend only gate-specific flows | No | More/settings base can be implementation-ready when matching assets/screens are approved |
| Notifications base | Notification center, review queue, detail, bulk triage, empty/loading/error, privacy guardrails | `MOBILE_NOTIFICATIONS_REFERENCE_V1.md`, assets `notifications-v1/` | Covered | Base in-app notification center and actionable queue are explicit | Reuse existing reference | No | Do not regenerate base notification center |
| Experience modes | Basic, Guided, Advanced, Help me decide; per-feature visibility with required-state safety | `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, `USER_EXPERIENCE_MODES_ARCHITECTURE.md` | Stale / needs refresh | More/Settings V1 documents `Simple` and `Advanced`; current architecture/decision register now require `Basic`, `Guided`, `Advanced`, and `Help me decide` | Refresh onboarding/settings mode frames and copy | Extension | Mode-related implementation should wait for refreshed reference |
| Privacy/security/vault surfaces | Sensitive surfaces, privacy/security hub, vault mode, recovery and backup warnings | `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, `PRIVACY_VAULT_ARCHITECTURE.md` | Partial | Base privacy/security exists, but vault-specific UI states are not explicit | Same extension as #421 | Extension | Vault implementation remains blocked |
| Reusable components/tokens | Shared cards, chips, money/date fields, nav, states, semantic tokens | `MOBILE_DESIGN_REFERENCE_V1.md`, `MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md`, `MOBILE_SHARED_DESIGN_SYSTEM_AUDIT_V1.md` | Covered | Current design-system docs and audit explicitly define shared component direction and migration guardrails | Link implementation tasks to existing audit and guardrails | No | Future UI tasks should reuse shared components/tokens |

## 4. Already-Covered Areas Not To Regenerate From Scratch

- Mobile shell and bottom navigation: `Home / Bills / Groups / Settle / More`.
- Home/dashboard choreography and quick-action model.
- Base Bills list, add sheet, quick total, itemized bill, assignment, bulk item selection.
- Base receipt capture/import and OCR review flow.
- Base Groups list, group dashboard, members/manage members, group bill context, group balances.
- Base Settle dashboard, balances, request payment, mark paid, confirm receipt, detail/history, proof/privacy.
- Base More hub, profile/account, payment details, app settings, sessions/devices, data/import/export hub, local/server mode hub.
- Base Notification Center, review queue, detail, bulk triage, and in-app notification states.
- Shared component/token foundation and implementation guardrails.

## 5. Partial Or Stale Areas Needing Extension Prompts

- #421 privacy mode/vault onboarding, recovery, trusted-device, settings, and backup/export warnings.
- #425 bill revision review-diff, affected-user approval, payer reconfirmation, and settlement-impact warnings.
- #429 OCR tax/discount/fee/refund correction taxonomy and multi-tax review states.
- #434 friends/direct sharing lifecycle, direct-share picker, block/unfriend, and temporary participant claim/link.
- #446 sync status queue, retry, conflict compare, rejection, and preserved local pending states.
- #452 notification preferences, permission, unsupported/unconfigured provider states, digest/quiet hours, group mute, deep links, and delivery status.
- #456 import mapping, duplicate/conflict review, backup encryption/password, restore preview, overwrite/merge, and local/server migration warnings.
- Experience modes refresh from `Simple/Advanced` to `Basic/Guided/Advanced/Help me decide`.

## 6. Missing Areas Needing New Figma Prompts

- #417 mobile passkey/WebAuthn, TOTP MFA, recovery-code, challenge, lost-device/recovery, and security-settings UX.

Web/admin portions of #417, #425, #434, #452, and #456 are not mobile. They need separate web/admin reference work rather than mobile prompt expansion.

## 7. Recommended Figma Prompt Order

1. #417 mobile auth passkey/MFA/recovery-code UX reference.
2. #421 privacy mode/vault onboarding and settings extension, including backup/export warnings.
3. Experience modes refresh: Basic, Guided, Advanced, Help me decide.
4. #429 OCR correction taxonomy extension for tax, discount, fee, refund, tender/change, mismatch.
5. #425 bill revision review-diff and settlement-impact extension.
6. #434 friends/direct sharing extension.
7. #446 sync conflict/failure extension.
8. #452 notification preference, permission, provider-state, and deep-link extension.
9. #456 import/export/backup/restore extension.

Run these one screen/component group at a time. Do not combine mobile with web/admin prompts.

## 8. Focused Prompt Briefs

### #417 Mobile Auth Security

Create mobile references for passkey/WebAuthn enrollment, TOTP enrollment/verification/removal, recovery-code display-once/regeneration/use, sign-in challenge, lost-device recovery, and security settings. Use More/Settings and Sessions/Devices style. Do not show raw secrets, reusable challenges, recovery code storage, tokens, or implementation internals.

### #421 Privacy Vault

Extend More/Settings with Standard Secure vs Recoverable Private Vault onboarding, mode selection, policy-disabled states, recovery warning, trusted-device/recovery flow entry points, vault-protected-content explanation, settings change confirmation, and backup/export warnings. Keep financial truth, authorization, settlement state, sync, and audit API/domain-owned.

### Experience Modes Refresh

Refresh onboarding/settings frames from `Simple/Advanced` to `Basic`, `Guided`, `Advanced`, and `Help me decide`. Include a short help-me-decide question flow, per-feature advanced toggles, and required-state safety so review/conflict/security/privacy warnings still appear in Basic mode.

### #429 OCR Correction

Extend OCR review with item tax category/rate, tax-included/excluded, receipt-level tax summaries, before/after-tax discount treatment, service/fee lines, refund/return/tax correction lines, tender/change/void/free exclusions, unknown negative/manual-review state, line split/merge/reclassification, and receipt-total mismatch review.

### #425 Bill Revision Review-Diff

Create mobile bill revision review frames for server-provided baseline, changed-only markers, accessible changed labels, affected-user approval, payer reconfirmation, no-baseline full review, revision withdrawn/revised/superseded states, and settlement-impact blocked/invalidation/adjustment warnings.

### #434 Friends And Direct Sharing

Create mobile references for exact-match friend discovery, request inbox/outbox, accept/decline/cancel, block/unfriend confirmation, direct-share person picker, privacy-safe no-result/failure states, temporary participant claim/link, and payment-detail exposure warnings.

### #446 Sync Conflict

Create mobile references for sync status, queue list, retry, transient failure, server rejection, conflict compare, local pending preservation, resolution choices, local-only/no-server state, and local-to-server migration warning entry points.

### #452 Notification Preferences And Deep Links

Extend notification settings and notification detail with OS permission prompt states, provider unsupported/unconfigured states, email/push/in-app channel preferences, digest/immediate, quiet hours, group mute, delivery status, deep-link loading, stale/unauthorized/missing target, and privacy-safe fallback copy.

### #456 Import/Export/Backup/Restore

Extend More/Data with CSV export scope/redaction, import mapping, staged review, duplicate/conflict review, encrypted backup password warning, wrong-password/corrupt backup, restore preview, overwrite/merge confirmation, and local/server authority-boundary warnings.

## 9. Reference Linking Guidance

Future Codex implementation tasks should link existing references instead of requesting new Figma work for base surfaces:

- Shell/Home/navigation: `MOBILE_DESIGN_REFERENCE_V1.md`, `MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md`, `MOBILE_FIGMA_PARITY_GUARDRAILS.md`.
- Bills/OCR base: `MOBILE_BILLS_OCR_REFERENCE_V1.md`.
- Groups base: `MOBILE_GROUPS_REFERENCE_V1.md`.
- Settle base: `MOBILE_SETTLE_REFERENCE_V1.md`.
- More/Settings base: `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`.
- Notifications base: `MOBILE_NOTIFICATIONS_REFERENCE_V1.md`.
- Components/tokens: `MOBILE_SHARED_DESIGN_SYSTEM_AUDIT_V1.md` and `MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md`.

For the target queue, issue bodies can link current references as partial context, but should remain in `Needs Figma / Reference` until the listed extension/new prompt output is reviewed and saved.

## 10. Guardrails

- Do not approve unseen Figma output.
- Existing repo reference is not automatically pixel-perfect implementation approval unless it matches approved screenshots/docs.
- Clients must not decide authz from UI, cache, hidden controls, or routes.
- Money, security, privacy, settlement, bill revision, OCR acceptance, sync acceptance, storage access, and audit decisions remain API/domain-owned.
- Use shared components and semantic tokens from the mobile design-system docs.
- Avoid developer-note copy, API route names, storage paths, object IDs, generated-client names, debug states, raw secrets, raw provider payloads, raw OCR text, proof contents, or hidden payment details in UI.
- Web/admin work is separate from mobile reference coverage.
