# Mobile Implementation Guardrails V1

## Status

Approved V1 mobile references under `docs/design/mobile/` are the source for mobile UI implementation direction. Current repository files remain the implementation source of truth, but existing mobile widgets are legacy candidates until each widget is proven V1-aligned.

This guardrail is persistent task context for future mobile implementation work. It does not authorize OpenAPI, generated-client, backend/API, schema/migration, auth/session/security, storage/file-byte, deployment, CI, secret, money, bill, settlement, payment, OCR acceptance, sync acceptance, audit, or authorization authority changes.

## Approved References

Use these documents before mobile UI implementation:

- `MOBILE_DESIGN_REFERENCE_V1.md`
- `MOBILE_BILLS_OCR_REFERENCE_V1.md`
- `MOBILE_GROUPS_REFERENCE_V1.md`
- `MOBILE_SETTLE_REFERENCE_V1.md`
- `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`
- `MOBILE_NOTIFICATIONS_REFERENCE_V1.md`
- `MOBILE_SHARED_DESIGN_SYSTEM_AUDIT_V1.md`

Screenshots under `docs/design/mobile/assets/` are visual reference artifacts only. Do not scrape Figma, import generated Figma code, or treat screenshots as permission to change runtime authority.

## Navigation

- Bottom navigation is locked to `Home / Bills / Groups / Settle / More`.
- There is no global center `+` button.
- Notifications are reached from the top bell or global notification affordance, not a bottom-nav tab.
- More is the all-functions hub.
- Profile/account, receipt review queue, notifications, sessions/devices, reports, manual finance, backups, settings-like surfaces, and future advanced tools must stay reachable through More, Home actions, or pushed routes rather than extra bottom-nav tabs.
- Future shortcuts belong in Home Quick actions or More unless a later approved V1 reference changes the main navigation model.

## Component Rules

- Shared app-wide components are mandatory for repeated patterns.
- A component cannot be accepted only because it exists in Dart today.
- Existing components must be classified before reuse as `matches_v1_reference`, `exists_but_outdated`, `wrong_abstraction`, `feature_private_duplicate`, `legacy_or_unused`, or `missing`.
- Feature-specific components must not duplicate cards, buttons, chips, money fields, date fields, currency selectors, person/group selectors, dialogs, bottom sheets, empty states, loading states, error states, warning states, sticky actions, or nav shells unless the audit records a real domain need.
- New screens must compose shared components and semantic design tokens first. Add feature-private widgets only for domain-specific layout or behavior that cannot be represented safely by a shared component.
- What looks tappable must be tappable. Static readouts must not look like actions.
- Action labels must name the actual action, especially for bill, settlement, payment, security, sync, import/export, receipt/OCR, and destructive flows.

## Authority Boundaries

UI must not decide:

- Authorization or access.
- Money, rounding, split, settlement, payment, bill, residual, OCR acceptance, sync acceptance, audit, storage/file access, privacy, or security truth.
- Role, membership, participant, payer, settlement, notification-linked resource, file/proof, session, export, backup, or payment-detail visibility.

In server mode, API/domain responses remain authoritative. Mobile owns presentation, form state, local display state, local queue display, and user input only.

## Sensitive UI Copy

User-facing UI must not expose:

- File paths, storage paths, object-store keys, storage provider internals, object IDs, internal IDs, generated-client details, API route names, repository seams, debug copy, exception class names, raw provider payloads, raw config, tokens, secrets, proof contents, raw OCR full text, hidden payment details, or sensitive file contents.

Payment details, payment proof, receipt images, OCR text, sessions, exports, backups, server/local mode, privacy, and security settings need exact product-facing wording and clear action consequences.

## Money, Date, And Inputs

- Money display must include amount plus ISO-style uppercase currency where ambiguity matters.
- Do not show bare amounts for bill, settlement, balance, report, proof, or payment contexts.
- UI formatting is presentation only; API/domain services remain authoritative for money and rounding.
- Do not assume every currency has two decimals.
- Prefer shared money amount plus currency input components over raw `TextField` or one-off `TextFormField` money controls.
- Prefer shared date picker fields over manual `yyyy-MM-dd` text entry. Raw date entry must be recorded as a legacy risk until replaced.
- Currency selectors, payment-method selectors, category selectors, person/group selectors, split selectors, and searchable user/group selectors should be shared before being reused across feature surfaces.

## Safe Areas And Long Content

- Bottom nav, sticky action bars, bottom sheets, dialogs, and long lists must account for `SafeArea` and scroll padding.
- Sticky actions and bulk action bars must not cover form fields, list rows, bottom navigation, or final content.
- Narrow, medium, and large phone surfaces must remain readable. Wider Flutter test surfaces should constrain mobile content rather than stretch it into desktop layouts.

## Test Expectations

Focused mobile UI branches should update or add tests for:

- Shared component labels, semantics, selected state, and tap handoffs.
- Absence of obsolete nav labels or implementation copy.
- Safe access to Profile, receipt review, notifications, sessions, reports, backups, and settings-like surfaces when top-level navigation changes.
- Money/currency display and input behavior when changed.
- Date picker/raw-date replacement behavior when changed.
- Safe-area/scroll-padding behavior for changed sticky actions, bottom sheets, and long forms.

## Visual QA Screenshot Protocol

Material mobile UI tasks must produce visual evidence unless the task is
clearly non-visual. Capture the actual branch-rendered Flutter UI, not only
approved reference images or design exports.

Preferred capture path:

- Use Flutter headless widget/golden screenshot capture on the DevBox when
  feasible.
- Load both Material test fonts before capture:
  - `/opt/flutter/bin/cache/artifacts/material_fonts/Roboto-Regular.ttf`
  - `/opt/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf`
- Disable the Flutter debug banner for visual capture.
- Use a mobile viewport that matches the task evidence request, commonly
  `390x844`.
- Save task screenshots under
  `/workspace/logs/settleora-visual-qa/<task-or-pr>/`.
- Include screenshot paths in the Codex report.

When a matching approved reference exists under `docs/design/mobile/assets/`,
compare the captured branch UI against that reference and record whether the
branch matches, intentionally differs, or needs follow-up.

Report visual status as exactly one of:

- `VISUAL_APPROVED`
- `VISUAL_APPROVED_WITH_FOLLOWUPS`
- `VISUAL_BLOCKED`
- `VISUAL_CAPTURE_UNAVAILABLE`

Do not fake visual approval. Material UI PR/merge gates must stop before merge
when visual capture is unavailable, visual QA is blocked, or required human
approval is missing.

Reusable test helpers for capture setup should live in
`apps/mobile/test/helpers/`. The shared helper
`settleora_visual_test_fonts.dart` loads the Roboto and Material Icons fonts
and can set the standard mobile viewport for future screenshot harnesses. In
widget tests, call font loading through `tester.runAsync(...)` so real file IO
and font registration are not trapped in the fake-async test zone.
