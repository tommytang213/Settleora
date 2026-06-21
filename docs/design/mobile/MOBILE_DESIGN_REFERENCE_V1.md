# Mobile Design Reference V1

## 1. Reference Status

The mobile shell, Home, More, and primary navigation direction are approved as the V1 reference for future implementation tasks.

External visual reference:

https://www.figma.com/make/GhwORBnM4Y3YISs9CsobRy/High-Fidelity-Mobile-UI-Design?p=f&t=sW5ANl6oatYfwQBi-0

Exact screenshots and exports should be saved separately under `docs/design/mobile/assets/` when manually exported from the approved Figma reference. Do not scrape Figma, download generated code, or treat generated Figma output as implementation source.

## 2. Approved Mobile Shell/Navigation

Locked navigation decisions:

- Bottom navigation is `Home / Bills / Groups / Settle / More`.
- There is no global center `+` button.
- Home has customizable Quick actions.
- More is the all-functions hub.
- Settings is reachable from avatar/profile and More.
- Notifications remain persistent through the top bar/bell.
- Future or custom shortcuts belong in Home Quick actions, not the main bottom nav.
- Main navigation should remain stable to preserve muscle memory and support/debug consistency.

## 3. Product Choreography

Home should answer these questions in roughly 3 seconds:

- What is my current spending?
- What do I owe or what is owed to me?
- What needs review?
- What is the next useful action?

Home is a triage and situation surface, not a feature cupboard. Simple users should see guided/default paths first. Advanced users should discover deeper tools through More, filters, and advanced sections.

## 4. Theme And Token Direction

Approved theme decisions:

- Day 1 supports a tokenized theme foundation.
- Day 1 supports multiple curated selectable theme presets.
- The approved dark Figma style is the `Settleora Midnight` preset reference, not hardcoded app-wide styling.
- Suggested curated preset names may include `Settleora Midnight`, `Settleora Pearl`, `Settleora Slate`, and `Settleora Warm`, or similarly polished names.
- Day 2+ may add an advanced theme editor for advanced users only.
- Custom theme editing should operate on safe token groups, not arbitrary per-widget colors.
- Theme behavior must preserve accessibility, semantic status meaning, destructive-action clarity, privacy/security readability, and fallback/reset behavior.

Token categories should include:

- Color tokens.
- Surface tokens.
- Text tokens.
- Border tokens.
- Elevation tokens.
- Status tokens.
- Navigation tokens.
- Chart tokens.
- Density tokens.

Implementation must avoid hardcoded dark-only styling. Dark visual direction belongs to a selectable token preset, not global product logic.

## 5. Shared Component Principles

Components are shared app-wide by default. Future implementation should prefer shared components such as:

- `AppScaffold`
- `TopBar`
- `BottomNav`
- `SearchField`
- `FilterChipGroup`
- `StatusChip`
- `PrivacyTrustChip`
- `MetricChip`
- `LedgerCard`
- `MoneyText`
- `MoneyInput`
- `CurrencySelector`
- `DateField`
- `CategorySelector`
- `PaymentMethodSelector`
- `SearchableUserGroupSelector`
- `PrimaryButton`
- `SecondaryButton`
- `DestructiveButton`
- `BottomSheet`
- `Dialog`
- Empty, loading, error, warning, offline, and sync-conflict states

Domain screens compose shared components. Avoid one-off styling for Bills/OCR/Settle/Groups unless a real domain need requires it. What looks tappable must be tappable; static things must look static. Action labels must describe the actual action.

## 6. Money/Currency Display Rules

Money display rules:

- Money is always amount plus ISO-style uppercase 3-letter currency code.
- Do not show bare amounts.
- Symbols are display support only and must not replace codes where ambiguity matters.
- Do not assume every currency has two decimals.
- UI formatting is presentation. API/domain services remain authoritative for money.

Examples of acceptable display patterns include `123.45 HKD`, `1,200 JPY`, or a symbol-supported display that still includes the currency code where ambiguity matters.

## 7. Architecture/Product Guardrails

UI must not decide authorization, money truth, settlement truth, audit truth, storage access, or sync acceptance. In server mode, API/domain authority remains the source of truth.

Receipts, OCR data, payment proof, and payment details are sensitive. Normal UI must not expose storage paths, file paths, API route names, object IDs, debug identifiers, generated-client details, or internal implementation copy.

This design reference does not authorize OpenAPI changes, generated-client edits, database/schema changes, auth/session/security changes, storage/runtime changes, or bill/settlement/payment calculation changes.
