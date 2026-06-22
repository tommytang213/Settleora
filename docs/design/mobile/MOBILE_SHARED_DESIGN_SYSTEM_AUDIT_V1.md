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
- Money/date/form foundation now includes shared `MoneyText`, `MoneyInput`
  with explicit currency selection, and a picker-backed `DateField` that keeps
  existing ISO date controller values while showing product-facing date text.
- `MoneyAmountCurrencyField` remains as a compatibility wrapper over
  `MoneyInput` for current callers.
- Manual finance account and income sheets now use shared `MoneyInput` and
  `DateField` instead of raw amount/currency and `yyyy-MM-dd` text-entry
  controls.
- Bills/OCR now uses shared `DateField` for the personal bill date and receipt
  review date, shared `MoneyInput` for receipt review header totals and receipt
  review line item unit price / line total fields with explicit currency, and
  shared `MoneyText` for selected bill and OCR presentation-only amount
  readouts. Group bill item/payer money controls, revision editor rows, and
  broader recurring and report fields remain follow-up candidates.
- Receipt OCR review edit header totals now use one section-level explicit
  `CurrencySelector` and `MoneyInput` static-code amount rows for subtotal, tax,
  service charge, discount, and grand total. This reduces repeated selector
  density while keeping each amount visibly tied to the current ISO currency and
  preserving the existing single OCR currency controller/validation path.
- Receipt OCR review edit line item unit price and line total amount fields now
  use `MoneyInput` static-code rows tied to the same receipt-level OCR currency
  controller. This records the 2026-06-22 16:12 HKT follow-up completion without
  adding client-side recalculation or changing OCR save/apply authority.
- Group bill create item unit amount, item line total, and payer amount fields
  now use shared `MoneyInput` static-code rows while preserving the existing
  group bill currency selector, row currency controllers, validators, and draft
  request construction. This records the 2026-06-22 16:50 HKT follow-up
  completion without changing split, payer, rounding, persistence, or API
  authority.
- Bill revision proposal editor total, participant-share, and payer-contribution
  rows now use shared `MoneyInput` directly while preserving the existing
  independent row currency selectors, controllers, validation messages, state
  transitions, and revision request construction. Bill revision review aggregate
  totals, participant shares, payer contributions, and viewer financial-impact
  money readouts now use shared `MoneyText` while server-provided change display
  values remain unchanged. This records the 2026-06-22 17:17 HKT bounded
  follow-up completion without changing bill revision review, approval, payer
  confirmation, apply, split, rounding, persistence, or API authority.
- Recurring bill template create/edit item amount rows now use shared
  `MoneyInput`: create keeps the template-level explicit currency selector and
  static-code item amounts, while edit keeps row-level item currency selectors
  for payload rows returned by the API. Recurring bill template list, detail,
  and forecast readouts now use shared `MoneyText` where they render amount
  plus ISO currency. This records the 2026-06-22 18:22 HKT recurring follow-up
  without changing recurring forecast, draft generation, split, payer,
  rounding, persistence, request construction, or API authority.
- Monthly report currency bucket rows now use shared `MoneyText` for total,
  actor-share, and actor-paid amount-plus-ISO-currency readouts while
  preserving the existing server-provided values, search/filter behavior,
  report summary semantics, and display strings. This records the 2026-06-22
  18:56 HKT reports-money follow-up without changing report generation,
  aggregation, rounding, filtering authority, persistence, OpenAPI, generated
  clients, or backend behavior.
- Personal bill create item unit amount and line total rows now use shared
  `MoneyInput` static-code rows while preserving the existing row-level item
  currency selector, row currency controllers, validation messages, quantity to
  line-total sync behavior, draft state, request construction, and save
  behavior. This records the 2026-06-22 19:34 HKT personal-bill itemized
  follow-up without changing bill split, rounding, persistence, sync, OpenAPI,
  generated clients, or API/domain authority.
- Saved OCR review inside bill detail now uses shared `DateField` for the
  in-bill receipt date suggestion and shared `MoneyInput` static-code rows for
  per-line unit price and line total controls while preserving the existing
  per-line currency selectors, ISO controller/storage values, saved-review
  save/apply request construction, validation behavior, and provisional OCR
  authority boundaries. This records the 2026-06-22 20:02 HKT saved OCR
  in-bill editor follow-up without changing OCR acceptance, bill split, money,
  rounding, persistence, sync, OpenAPI, generated clients, or API/domain
  authority.
- Saved OCR read-only receipt totals, edit-mode review-only totals, draft
  apply-preview header and summary rows, and saved/apply-preview line money
  parts now use shared `MoneyText` while preserving existing amount strings,
  currency strings, missing-currency fallbacks, saved-review request
  construction, apply-preview behavior, and provisional OCR authority
  boundaries. This records the 2026-06-22 20:44 HKT saved OCR read-only money
  readout follow-up without parsing, rounding, recalculating, aggregating,
  changing bill calculation, OCR acceptance, sync acceptance, persistence,
  OpenAPI, generated clients, or API/domain authority.
- Settlement balance rows, request tile/header amount readouts, selected-total
  review chip, request line amount/status rows, payment actual-paid readouts,
  allocation amounts, and residual amount/status rows now use local settlement
  helpers backed by shared `MoneyText`. This records the 2026-06-22 21:17 HKT
  settlement money readout follow-up without changing settlement calculations,
  residual/allocation/payment authority, proof behavior, settlement state
  transitions, persistence, OpenAPI, generated clients, or backend/API
  behavior.

## Remaining Money/Date Field Audit - 2026-06-22 19:21 HKT

Branch basis: `origin/main` at
`ad177485cfff508e8dae93ceed7962fdd5bab980`.

Audit scope:

- `apps/mobile/lib/**`
- `apps/mobile/test/**`
- Current shared mobile docs and feature references for Bills/OCR, Groups,
  Settle, More/Settings, and Notifications.

Search families included raw Flutter form fields, money/date terms,
shared-component names, ISO/date parsing patterns, and feature-local widget
name patterns. The audit found remaining eligible candidates; there are still
shared money/date migration follow-ups.

Remaining eligible raw money/date candidates:

- Home/dashboard, `apps/mobile/lib/app/server_mode_shell.dart`:
  `_BalanceMetric` and `_DashboardBillRow` still pass formatted money strings
  through `_money(...)` / `'$currency 0.00'` and render them with plain `Text`.
  These are display-only amount-plus-currency readouts and should move to
  amount/currency data plus `MoneyText` in a small Home dashboard slice.
- Group/personal bill detail readouts,
  `apps/mobile/lib/bills/bill_list_screen.dart`: several non-editor amount
  readouts still use `_money(...)`, including read-only group bill list
  subtitles, pending revision chip labels, current-user share panel text, payer
  summaries, non-saved-OCR item rows, participant share rows, payer rows,
  adjustment rows, and acknowledgement copy. Standalone UI readouts should move
  toward `MoneyText`; hidden/searchable-field collections and sentence copy can
  remain string-based unless a later UI slice gives them a structured readout.
- Future bills / upcoming one-time bills,
  `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart`: the future bill
  form uses a raw due-date `TextFormField` with a picker suffix at
  `future-bill-form-due-date`; this should move to shared `DateField`. Future
  bill tile/header/item amount readouts still use `_money(...)` strings and are
  eligible for `MoneyText`. The create amount/currency field already uses
  `MoneyAmountCurrencyField`, which delegates to shared `MoneyInput`.

Inspected but no action needed for this money/date migration queue:

- Search/filter fields such as group search, group member search, settlement
  search, settlement detail line/payment search, monthly report search,
  attachment search, and receipt-review queue search are plain text search
  inputs, not money/date controls.
- Auth/setup/profile/payment-detail fields such as server URL, email,
  password, display name, payment handle, notes, method labels, and language or
  timezone strings are not money/date shared-field candidates.
- Numeric but non-money controls such as quantities, recurring interval, due
  offset days, share weights, selected counts, line counts, bill counts, and
  percentages should not move to `MoneyInput`.
- Standalone `CurrencySelector` uses are appropriate where the screen is
  choosing a default or section-level currency, including profile default
  currency, recurring template currency, OCR section currency, and bill-level or
  row-level currency selectors.
- `MoneyAmountCurrencyField` usages in settlement mark-paid and future bill
  create are compatibility-wrapper uses that already delegate to `MoneyInput`.
- Repository and storage parsing/normalization such as `DateTime.parse(...)` in
  secure storage/sync queue code, generated repository ISO date validation, and
  `yyyy-MM-dd` error messages are not UI field migrations.
- Tests under `apps/mobile/test/**` contain fixtures, expectations, and widget
  lookups for current runtime behavior; they should be updated only alongside
  future runtime migration slices.
- Server-authored or domain-authored strings, statuses, notification labels,
  safe messages, and audit/authority copy are not candidates unless a screen is
  rendering a standalone amount/date with local formatting.

Recommended next task queue:

1. Home dashboard money readouts: carry amount/currency separately through
   `_BalanceMetric` / `_DashboardBillRow` and render with `MoneyText`; keep the
   loaded-summary-only dashboard behavior unchanged.
2. Bill detail/read-only money readouts: migrate standalone non-saved-OCR bill
   list/detail, share panel, payer, participant, and adjustment readouts to
   `MoneyText` where they are not sentence/search/semantics strings.
3. Future bill due-date/readout slice: replace the future bill due-date
   `TextFormField` with `DateField` and migrate future bill amount readouts to
   `MoneyText`; keep future bill create/edit/post/cancel authority unchanged.
4. Optional saved OCR apply-preview screenshot cutoff polish remains available
   as non-blocking visual polish; do not mix it into unrelated money/date
   migrations.

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
- Several screens use month/date text entry or date formatting locally. Bills/OCR
  personal bill and receipt review header dates now use the shared picker-backed
  `DateField`; remaining raw date fields are presentation risks and should be
  replaced with shared date picker fields in future UI bundles.

## Money And Currency Input Risks

- `MoneyAmountCurrencyField` exists and combines decimal keyboard input with `CurrencySelector`.
- Many feature flows still use raw `TextField` / `TextFormField` plus `TextInputType.numberWithOptions(decimal: true)`.
  Bills/OCR receipt review header totals now use shared `MoneyInput` and avoid
  repeated currency selectors through
  `MoneyInputCurrencyControl.staticCode` under the section-level OCR currency
  selector. Receipt OCR review line item unit price and line total fields now
  use the same shared static-code money input. Group bill create item unit
  amount, item line total, and payer amount fields now use shared static-code
  money inputs while keeping row currency controls visible. Bill revision
  editor rows and review readouts now use shared `MoneyInput` / `MoneyText`.
  Monthly report currency total/share/paid readouts now use shared `MoneyText`.
  Remaining bounded follow-ups are other non-migrated money fields outside the
  reports slice.
- Shared `MoneyText` exists; broader amount display migration remains
  incremental where feature-local formatting is still repeated.
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
| `MoneyText` | `matches_v1_reference` | Shared presentation-only amount plus ISO currency text now exists with tabular figures; broader caller migration remains incremental. |
| `MoneyInput` | `matches_v1_reference` | Shared `MoneyInput` now combines decimal-friendly amount entry with explicit currency selection and no authoritative rounding. It also supports an opt-in static-code display for shared-currency sections where a section-level `CurrencySelector` already exists; legacy `MoneyAmountCurrencyField` delegates to the default selector mode. Raw feature fields remain gradual migration candidates. |
| `CurrencySelector` | `matches_v1_reference` | Shared selector exists with ISO codes and unknown-value preservation; may need searchable/scalable expansion later. |
| `DateField / DatePicker` | `matches_v1_reference` | Shared picker-backed `DateField` now displays product-facing date text while preserving ISO controller values; manual finance forms use it. Other raw date strings remain migration candidates. |
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
