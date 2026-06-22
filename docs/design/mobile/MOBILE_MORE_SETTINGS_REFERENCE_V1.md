# Mobile More And Settings Reference V1

## 1. Reference Status

The More / Settings / Profile design slice is approved as the V1 design reference. It extends the approved mobile shell, app-wide shared components, and the `Settleora Midnight` visual direction from [Mobile design reference V1](MOBILE_DESIGN_REFERENCE_V1.md).

Screenshots and exports live under `docs/design/mobile/assets/more-settings-v1/`.

This document describes desired mobile composition, interaction, product copy direction, and implementation guardrails. It does not authorize Figma scraping, generated code import, OpenAPI changes, generated-client changes, runtime behavior changes, account authority changes, auth/session/security changes, payment-provider behavior changes, money calculation changes, schema changes, migrations, or storage behavior changes.

## 2. More Hub

The More tab is the all-functions hub and remains a bottom-nav destination in the locked `Home / Bills / Groups / Settle / More` shell.

More can route to:

- Profile/account.
- Payment details.
- App settings.
- Privacy and security.
- Sessions and devices.
- Notifications.
- Data, import, and export.
- Local/server mode.
- Admin tools when API/domain policy allows them for the current actor.

The hub should prioritize clear grouped rows, recognizable icons, concise subtitles, and status chips where useful. Future or rarely used capabilities belong in More or advanced sections, not as extra bottom-nav tabs.

## 3. Profile And Account

Profile/account screens show:

- Display name.
- Email.
- Preferred currency.
- Language and time zone.
- Account actions.

Account actions require explicit confirmation where they affect identity, access, data, or security. UI confirmation is not authority by itself; backend/server policy remains authoritative for allowed account actions, status changes, audit, and persistence.

## 4. Payment Details

Payment details use a scalable searchable payment method picker, not fixed tabs. Day 1 style reference methods include:

- FPS.
- PayMe.
- Bank Transfer.
- PayPal.
- Wise.
- Revolut.
- QR code.
- Cash.
- Custom instructions.

Payment method cards support method-specific fields, preview/masking, copyable fields, QR capability, and visibility chips. Visibility choices are:

- `Private`
- `Shared with groups`
- `Shared for requests`

Payment details are sensitive. The UI shows payment details only when allowed by API/domain policy and must not infer visibility from cached local state or hidden controls.

Instruction-only methods such as bank instructions, cash notes, and custom instructions should be clearly distinguished from future integrated or redirect methods such as provider app handoff or payment-provider checkout. Instruction-only methods can show copyable fields and QR references. Integrated or redirect methods need provider-aware state and must not imply payment completion from a launched app or redirect alone.

## 5. App Settings

App settings include:

- Default currency.
- Date and number format.
- Notification preferences.
- OCR/review preferences.
- Bill behavior.

Currency display must use ISO 4217-style uppercase currency codes where ambiguity matters. Formatting choices are presentation preferences; API/domain services remain authoritative for money, bill state, settlement state, sync acceptance, and audit.

## 6. Simple And Advanced Mode

Simple mode is the default experience. It keeps optional or expert features de-emphasized while preserving access to core expense, group, settlement, receipt, notification, and privacy flows.

Advanced mode reveals optional features and denser controls. Advanced visibility does not bypass backend authorization, role policy, privacy policy, payment-detail visibility, storage access checks, sync acceptance, or settlement/payment authority.

## 7. Appearance And Theme

Curated Day 1 theme preset references are:

- `Settleora Midnight`
- `Settleora Pearl`
- `Settleora Slate`
- `Settleora Warm`

An advanced theme editor is advanced-user-only. It operates on safe shared theme token groups, not arbitrary per-widget editing. Token groups can include color, surface, text, border, elevation, status, navigation, chart, and density tokens.

Theme editing must show contrast warnings where a selected combination risks readability or semantic confusion. Reset behavior should be clear and reversible where possible. Theme choices must not affect authorization, money, settlement truth, storage access, privacy policy, security policy, sync acceptance, or audit.

## 8. Privacy And Security

Privacy/security screens make sensitive areas visible and understandable without exposing internals:

- Receipts.
- Payment details.
- Payment proof.
- Sessions.
- Exports.
- Server/local data.

Copy should explain what is protected, what is shared, and what changes after a user action. Avoid storage paths, object IDs, provider payloads, API route names, debug text, generated-client details, raw config, secrets, tokens, passwords, and sensitive file contents.

## 9. Sessions And Devices

Sessions/devices screens show:

- Current device.
- Active sessions.
- Revoke session.
- Sign out all other devices.

Security-sensitive or destructive actions must state what happens, such as whether the current device stays signed in, whether other devices need to sign in again, and whether pending offline changes might need sync. The API/domain layer remains authoritative for session validity, revocation, audit, and current-actor state.

## 10. Notification Settings

Notification settings include:

- Bill reminders.
- Settlement requests.
- Group activity.
- OCR review.
- Sync conflicts.
- Security alerts.

Security alerts should remain prominent and must not be silently disabled by presentation-only UI. Persisted server notification behavior, push delivery, reminder scheduling, and device-token handling require explicit implementation authority outside this design reference.

## 11. Data, Import, And Export

Data/import/export screens can include:

- Export all data.
- Export bills.
- Export settlements.
- Import.
- OCR queue.
- Attachments.
- Backup.
- Sync.

Exports, backups, attachments, and OCR data are sensitive. Actions need clear scope, destination, and confirmation language. Archival, import, backup, sync, and delete-like behavior must be backed by explicit API/domain or local-mode authority.

## 12. Local And Server Mode

Normal personal and self-hosted use defaults to user choice where deployment policy allows it. Local/server mode cards should explain the current mode, what sync boundary is active, and what capabilities depend on the chosen authority boundary.

Switching modes requires safety copy and confirmation because it can affect sync, shared groups, settlements, receipts, payment proof, payment details, offline data, exports, and backups. Do not imply that a server admin decides normal personal/self-hosted mode choice unless documenting a future managed policy exception.

## 13. Shared Components Captured By More And Settings

More/Settings captures or exercises these shared components:

- Settings row.
- Profile header.
- Payment method card.
- Visibility chip.
- Payment preview card.
- Toggle row.
- Preference selector.
- Theme preset card.
- Theme preview card.
- Session row.
- Privacy info card.
- Notification preference row.
- Data/export action row.
- Local/server mode card.
- Empty states.
- Loading states.
- Error states.

Future implementation should compose these from app-wide shared components and semantic design tokens before adding one-off settings styling.

## 14. Implementation Acceptance Notes

- UI displays allowed actions and state, but API/domain remains authoritative for authorization, sessions, storage visibility, sync, audit, money, settlement truth, and payment truth.
- Payment details, receipt images, payment proof, sessions, exports, and privacy settings are sensitive.
- File access requires API authorization, and file bytes go through the storage abstraction.
- API responses must not expose storage internals.
- Money display must include amount and ISO currency code where ambiguity matters.
- Account, security, data, and destructive actions need exact product-facing wording and confirmation.
- Bottom nav, long settings lists, sheets, and sticky actions need safe scroll padding.
- Support small, medium, and large phones.

This reference does not permit silent changes to runtime code, OpenAPI, generated clients, backend/API behavior, schema/migrations, auth/session/security, storage/file-byte behavior, settlement/payment/bill calculation authority, deployment, CI, or secrets.
