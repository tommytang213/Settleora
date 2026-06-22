# Mobile Shared Design System Audit V1

## Status And Scope

Audit date: 2026-06-22.

Branch basis: `origin/main` at `e800b73146d79e7a50a4b0532791f20f4bb36761`.

Inspected areas:

- `apps/mobile/lib/ui/`
- `apps/mobile/lib/app/server_mode_shell.dart`
- `apps/mobile/lib/dashboard/`
- `apps/mobile/lib/bills/`
- `apps/mobile/lib/groups/`
- `apps/mobile/lib/settlements/`
- `apps/mobile/lib/receipt_ocr_review/`
- `apps/mobile/lib/notifications/`
- `apps/mobile/lib/profile/`
- `apps/mobile/lib/recurring_bills/`
- `apps/mobile/lib/reports/`
- `apps/mobile/lib/manual_finance/`
- `apps/mobile/test/ui/`
- `apps/mobile/test/`

Search terms included `SettleoraBottomNav`, `SettleoraNavDestination`, `showBottomNav`, `AppCard`, `StatusChip`, `MetricCard`, `AmountStatusRow`, `TextField`, `TextFormField`, `DropdownButtonFormField`, `AlertDialog`, `showModalBottomSheet`, `numberWithOptions`, `yyyy-MM-dd`, `DateTime.parse`, `DateFormat`, `OutlineInputBorder`, `Colors.`, `EdgeInsets`, and `BorderRadius.circular`.

Existing mobile components are legacy candidates until proven V1-aligned. This audit classifies current components against the approved V1 references, not against prior Flutter implementation alone.

## Current Shared Component Inventory

Shared files:

- `apps/mobile/lib/ui/settleora_theme.dart`
- `apps/mobile/lib/ui/settleora_components.dart`
- `apps/mobile/lib/ui/settleora_form_fields.dart`

Current shared components and helpers:

- `AppButton`
- `StatusChip`
- `AppCard`
- `VisualPreferenceUnsupportedReadout`
- `MetricCard`
- `AmountStatusRow`
- `AppTextField`
- `SettleoraBottomNav`
- `SettleoraScreenScaffold`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `CurrencySelector`
- `PaymentMethodSelector`
- `MoneyAmountCurrencyField`
- theme tokens through `SettleoraColors`, `SettleoraSpacing`, `SettleoraRadius`, and `SettleoraTheme.light()`

V1-aligned updates made in this branch:

- `SettleoraBottomNav` now exposes the locked V1 destinations `Home / Bills / Groups / Settle / More`.
- The obsolete bottom-nav `Receipts` and `Profile` destinations were removed.
- The `Settle` destination no longer uses a global center `+` icon or primary circular action treatment.
- Profile and Receipt Reviews remain reachable through Home/More pushed routes.
- Shared state/surface foundation now includes `SummaryCard`, `StateCard`,
  `InfoCard`, and `WarningCard`; `EmptyState`, `LoadingState`, and
  `ErrorState` compose the shared surface pattern.
- Home dashboard loading/error and owed/owing summary readouts now use shared
  state/surface components instead of private one-off cards.
- Visual QA capture setup is repo-tracked through
  `apps/mobile/test/helpers/settleora_visual_test_fonts.dart`, which loads the
  required Roboto and Material Icons fonts and sets a standard mobile viewport
  for future screenshot harnesses.

## Feature-Private Duplicate Inventory

Feature-private duplicates exist across current starter surfaces:

- Cards and panels: dashboard summary/empty/sync/data cards, bill OCR/review/attachment cards, group summary/member/handoff cards, settlement balance/request/payment/guidance panels, recurring template/forecast/failure panels, notification summary/detail/bulk panels, report summary/discovery panels, profile payment/failure panels, manual finance account/income cards.
- Chips: `_SoftChip`, `_StatusChip`, `_CountChip`, `_ReviewChecklistChip`, `_AssignedMemberChip`, `_ChannelChip`, and feature-local status/readiness chips across bills, receipt review, notifications, reports, settlements, recurring bills, and attachments.
- State panels: many feature-local `_FailurePanel`, `_StatePanel`, `_LoadingPanel`, `_ZeroStatePanel`, `_FilteredEmptyPanel`, and warning/banner variants duplicate shared `EmptyState`, `LoadingState`, `ErrorState`, and missing `WarningCard`.
- Dialogs and sheets: group form dialogs, settlement payment dialog, data backup import dialog, create bill chooser sheet, manual finance sheets, member picker sheets, OCR saved-review sheets, notification detail/bulk sheets, and assignment sheets are feature-private.
- Selectors and form fields: group/member pickers, currency/date fields in bill flows, manual finance date and amount fields, report month text field, receipt review edit fields, profile payment fields, and recurring bill form controls remain mostly feature-private.

Private widgets may still be appropriate where they encode domain-specific layout. Reusable visual primitives, however, should move toward shared components before broad V1 screen implementation.

## Old Or Unused Mobile UI Version Candidates

- Prior six-tab bottom nav assumptions: `Home / Bills / Groups / Settle / Receipts / Profile` existed in shared nav, tests, and `docs/qa/MOBILE_FIGMA_PARITY_GUARDRAILS.md`. Runtime and tests were reconciled to the V1 five-tab model in this branch; the QA doc now points at the V1 guardrail.
- Prior central `Settle` `+` treatment looked like a global add action. Replaced with a normal payments icon.
- `DashboardPreviewScreen` remains a preview/demo surface. It uses shared components but should not be treated as product-complete Home implementation evidence.
- Multiple local `_SoftChip` and `_StatusChip` classes are legacy candidates for shared chip consolidation.
- Many local `_StatePanel` and `_FailurePanel` widgets are legacy candidates for shared empty/loading/error/warning state consolidation.

## Hardcoded Styling And Token Gaps

Current code still contains broad direct styling:

- Frequent `EdgeInsets` and `BorderRadius.circular(8)` in feature files.
- Raw `TextField` and `TextFormField` with local `OutlineInputBorder`.
- Direct `Theme.of(context).colorScheme` usage where semantic Settleora tokens may be more appropriate.
- `Colors.` usage remains in theme/shared code and selected feature surfaces. Some is appropriate for token definition or transparency, but feature-level direct colors require review before V1 implementation.

This does not require immediate mechanical replacement. Future bundles should replace repeated visual patterns with shared components and semantic tokens where it reduces drift.

## Navigation Findings

- Before this branch, `SettleoraBottomNav` and shell tests encoded six destinations.
- Approved V1 navigation is `Home / Bills / Groups / Settle / More`.
- Notifications are not a bottom-nav tab; current runtime opens them from the Home top affordance.
- More is now represented as a bottom-nav destination and preserves access to profile, receipt reviews, sessions, reports, manual finance, backups, notification preferences, and visual preference readouts.
- A full More/Settings redesign is still missing and should be a later bounded implementation bundle.

## Safe-Area And Scroll-Padding Risks

- Shared bottom nav uses `SafeArea`.
- Many top-level and detail screens use `SafeArea`, `ListView`, or `SingleChildScrollView`.
- Sticky or near-sticky actions in bill creation, OCR review, settlement, manual finance, bottom sheets, and long lists need focused review before V1 screen work.
- Bulk item assignment and future Bills/OCR sticky action bars need explicit bottom padding so they do not cover content or bottom nav.

## Product-Facing Copy Concerns

Current tests already guard many unsafe details, but audit risks remain:

- Some starter surfaces still use implementation/readiness copy because the product feature is incomplete.
- Generated-client, repository, raw exception, route, object ID, storage path, and debug copy must remain suppressed in user-facing UI.
- Sensitive surfaces need exact product wording: receipt/OCR, payment proof, payment details, sessions, exports/backups, local/server mode, settlement confirmations, and destructive actions.
- More/Settings V1 needs dedicated copy for profile/account, privacy/security, sessions/devices, payment details, data/import/export, and mode switching.

## Date Input Risks

- Shared `DateField` / `DatePicker` is missing.
- `manual_finance_screen.dart` uses manual `yyyy-MM-dd` helper text for account/income dates.
- Repository boundaries also validate or normalize date strings, including `generated_manual_finance_repository.dart`.
- Several screens use month/date text entry or date formatting locally. These are presentation risks and should be replaced with shared date picker fields in future UI bundles.

## Money And Currency Input Risks

- `MoneyAmountCurrencyField` exists and combines decimal keyboard input with `CurrencySelector`.
- Many feature flows still use raw `TextField` / `TextFormField` plus `TextInputType.numberWithOptions(decimal: true)`.
- Shared `MoneyText` is missing, so amount display formatting is repeated across screens.
- Money display should continue to include ISO-style uppercase currency codes wherever ambiguity matters.
- UI must never become authoritative for money, rounding, split, settlement, payment, or OCR acceptance truth.

## Component Classification

| Target component | Classification | Current evidence / action |
| --- | --- | --- |
| `AppScaffold` | `exists_but_outdated` | `SettleoraScreenScaffold` exists but is not named/complete as the V1 app shell and is not used consistently. |
| `TopBar` | `missing` | No shared V1 top bar. Current app bars and notification/profile affordances are screen-local. |
| `BottomNav` | `matches_v1_reference` | `SettleoraBottomNav` now uses `Home / Bills / Groups / Settle / More`, no Notifications tab, no global `+`, and safe-area padding. |
| `LedgerCard` | `missing` | Bill, balance, recurring, notification, and report rows are feature-private. |
| `SummaryCard` | `matches_v1_reference` | Shared `SummaryCard` exists for static summary readouts and is used by Home balance summary cards; domain-specific summaries still need gradual migration. |
| `StatusChip` | `exists_but_outdated` | Shared chip exists and is useful; many feature-private chips remain and semantic variants may need V1 expansion. |
| `MetricChip` | `feature_private_duplicate` | `_DashboardMetricChip` exists privately; no shared component. |
| `MoneyText` | `missing` | Repeated amount/currency text formatting across features. |
| `MoneyInput` | `exists_but_outdated` | `MoneyAmountCurrencyField` exists, but raw money fields remain common and validation/format behavior is not yet the V1 standard. |
| `CurrencySelector` | `matches_v1_reference` | Shared selector exists with ISO codes and unknown-value preservation; may need searchable/scalable expansion later. |
| `DateField / DatePicker` | `missing` | Manual date strings remain. |
| `CategorySelector` | `missing` | Category controls are feature-local or absent. |
| `PaymentMethodSelector` | `matches_v1_reference` | Shared selector exists with common methods and custom value support; future V1 payment details need searchable method cards. |
| `SearchableUserGroupSelector` | `feature_private_duplicate` | Member picker/search sheets exist privately in bills/groups. |
| `PersonChip / GroupChip` | `feature_private_duplicate` | Assigned member chips and group/member rows exist privately. |
| `BottomSheet` | `feature_private_duplicate` | Many feature-private sheets exist; no shared sheet scaffold. |
| `Dialog` | `feature_private_duplicate` | Many feature-private dialogs exist; no shared confirmation/dialog wrapper. |
| `WarningCard` | `matches_v1_reference` | Shared warning surface exists and is used for dashboard stale-overview warning; feature-local warning/readiness banners remain migration candidates. |
| `InfoCard` | `matches_v1_reference` | Shared info surface exists for static readouts where no action is implied. |
| `StateCard` | `matches_v1_reference` | Shared state/surface foundation exists for reusable empty, warning, info, and error presentation. |
| `EmptyState` | `matches_v1_reference` | Shared state composes `StateCard`; feature-local empty/zero/state panels remain migration candidates. |
| `LoadingState` | `matches_v1_reference` | Shared loading state is tokenized and used by Home dashboard loading; feature-local loading panels remain migration candidates. |
| `ErrorState` | `matches_v1_reference` | Shared error state composes `StateCard` with explicit retry support; feature-local failure panels remain migration candidates. |
| `NotificationRow` | `feature_private_duplicate` | Repository model and `_NotificationTile` exist; no shared row component. |
| `ReviewQueueCard` | `feature_private_duplicate` | Receipt/OCR queue and notification review patterns are private. |
| `SplitPreviewCard` | `feature_private_duplicate` | Bill create preview panels exist privately. |
| `PaymentInstructionCard` | `feature_private_duplicate` | Settlement/profile payment detail surfaces use private rows/cards. |
| `ThemePresetCard` | `missing` | Visual preference readout exists, but no selectable preset cards. |
| `SettingsRow` | `feature_private_duplicate` | More/profile/session/data rows exist privately; no shared settings row. |

## Follow-Up Bundle Order

1. More/Settings V1 shell bundle: build a proper More hub and settings row foundation while preserving access to profile, payment details, sessions, notifications, data/import/export, local/server mode, and privacy/security.
2. Shared state and surface bundle: promote warning, empty, loading, error, section card, settings row, and dialog/sheet scaffolds.
3. Money/date/form bundle: add `MoneyText`, harden `MoneyInput`, add `DateField`, and replace raw `yyyy-MM-dd` fields in manual finance and nearby forms.
4. Bills/OCR shared primitives bundle: ledger card, review queue card, OCR warning card, receipt/OCR chips, searchable user/group selector, split preview, assignment rows, and sticky action safe-area rules.
5. Groups/Settle row bundle: group cards, member rows, balance rows, payment instruction cards, settlement timeline/action cards, proof chips, and missing payment details state.
6. Notifications/review queue bundle: notification row, action-required card, bulk action bar, detail card, and notification source/status components.
7. Theme preset/settings bundle: theme preset card and appearance settings components after persistence/API/schema authority is explicitly designed or represented as read-only.

## Explicit Non-Authority Confirmation

This audit and the first bottom-nav consolidation do not change OpenAPI, generated clients, backend/API behavior, database schema or migrations, auth/session/security runtime, storage/file-byte behavior, money, bill, settlement, payment, OCR acceptance, sync acceptance, audit, authorization authority, deployment, CI, or secrets.
