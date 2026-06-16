# M14 Mobile Visual Theme, Color, And Accessibility QA Map

Status: `M14-001 completed; M14 remains before final UI testing readiness; manual UI/code review deferred until Day 1 acceptance`

## Purpose

Record the M14 mobile visual theme, color-token, reusable component, readability/accessibility, touch-target/readout, hardcoded color, and unsupported visual preference readiness state against Day 1 UX and visual-settings architecture requirements.

M14 remains bounded to mobile presentation/readiness seams. This map does not authorize backend/API behavior, visual preference endpoints, OpenAPI/generated-client changes, schema/migration changes, auth/session/security runtime or authorization-policy changes, storage/privacy/private-vault/file-byte behavior, import/export/backup/migration/runtime portability, money/settlement/bill/recurring/OCR/reconciliation authority, deployment, Docker, CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope reduction, architecture replacement, or persisted visual settings.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M14-001. UI testing readiness remains false until M14-004 finalization.

## M14 Queue State

- `M14-001-MOBILE-VISUAL-THEME-ACCESSIBILITY-STATE-RECONCILE-20260616-2053` - Completed. Reconciled current mobile visual theme, color-token, reusable component, accessibility/readability, and unsupported visual preference state without runtime behavior changes.
- `M14-002-MOBILE-THEME-COMPONENT-READABILITY-HARDENING-20260616-2053` - Current. Harden mobile built-in theme/component/readability seams without API, persistence, schema, policy, or business-authority changes.
- `M14-003-MOBILE-VISUAL-PREFERENCE-UNSUPPORTED-READOUT-HARDENING-20260616-2053` - Queued. Clarify unsupported presentation-only visual preference/palette/customization states in existing mobile readout seams without fake settings controls.
- `M14-004-MOBILE-VISUAL-THEME-ACCESSIBILITY-QA-FINALIZE-20260616-2053` - Queued. Finalize M14 QA/control state after bounded slices complete.
- `STOP-M14-001` - Preserved. Manual gate for persistence/API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

## Source Documents

- `PROGRAM_ARCHITECTURE.md` keeps API/domain services authoritative for authorization, money, status transitions, storage access, sync acceptance, and audit.
- `README.md` records current starter mobile surfaces and shared app structure while noting broader mobile product UI, web/admin portals, full offline cache hydration, and broader runtime behavior remain future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires Day 1 to be safe for real user records and keeps money, authorization, storage access, status transitions, and audit API/domain-authoritative.
- `docs/ux/UI_UX_FOUNDATION.md` approves the warm fintech groups visual direction, requires accessible-by-default color/motion/density/language/touch-target behavior, and treats mobile as a first-class capture/review/action/settlement surface.
- `docs/ux/SCREEN_INVENTORY.md` identifies the mobile starter surfaces and requires future implementation to verify backend/API support first.
- `docs/architecture/VISUAL_THEME_COLOR_SETTINGS_ARCHITECTURE.md` defines visual settings as presentation-only and says they must never influence authorization, money, settlement state, sync acceptance, storage access, audit truth, or security policy. It also states API/schema/persistence/admin palette work requires separate reviewed slices.

## M14-001 Current Theme Token Inventory

- `apps/mobile/lib/ui/settleora_theme.dart` defines `SettleoraColors` as a Flutter `ThemeExtension` with built-in light tokens for canvas, surface, primary/on-primary, primary/accent soft roles, success/warning/danger/info soft roles and foregrounds, borders, primary text, muted text, and subtle text.
- `SettleoraTheme.light()` integrates the built-in palette with Material 3 through `ColorScheme.fromSeed`, scaffold background, theme extensions, app bar theme, card theme, filled button theme, and input decoration theme.
- Typography uses `Typography.blackMountainView` with zero letter spacing and stronger weights on headings/labels. There is no custom text-scale handling beyond Flutter defaults.
- Spacing and radius constants exist under `SettleoraSpacing` and `SettleoraRadius`; current radii are warm/soft and larger than the future frontend preference for tighter operational cards.
- Current palette direction is not yet the approved warm orange fintech primary; the built-in primary is deep blue and accent is teal. M14-002 should decide whether to align built-in tokens closer to the approved warm fintech groups direction while preserving readability.
- Known hardcoded/ad hoc color gaps: dashboard summary cards in `server_mode_shell.dart` use direct pink/green constants; transparent fills appear in component/product widgets; some surfaces use `Theme.of(context).colorScheme` directly instead of `SettleoraColors`. These are presentation gaps only.
- Only a built-in light palette exists. System/light/dark appearance selection, dark palette, custom palettes, admin defaults, user-owned palettes, shared palettes, palette versioning, and preference persistence are absent.

## M14-001 Reusable Component Inventory

- Buttons: `AppButton` provides primary, secondary, soft, and destructive variants, optional icons, expanded width, disabled styling, and theme-level filled-button minimum size of 48 by 48. Several product screens also use raw `FilledButton`, `OutlinedButton`, `IconButton`, and `FloatingActionButton` where shared component use is incomplete.
- Cards: `AppCard`, `MetricCard`, section cards, dashboard cards, profile summary panels, and product-specific panels provide reusable framed surfaces. Card styling is mostly tokenized, with some Material color-scheme and ad hoc product variants.
- Chips/badges/status readouts: `StatusChip` provides success, warning, danger, info, and neutral variants, with small/regular sizing. Product surfaces use these for bill, settlement, recurring, dashboard, receipt review, and sync/status readouts; a few product-local `_StatusChip` or `_SoftChip` variants remain.
- Stats/summary cards: `MetricCard`, `_DashboardSummaryCard`, monthly report panels, settlement rows, recurring forecast rows, and bill summaries use tokenized or semi-tokenized status colors. M14-002 should reduce duplicated ad hoc metric styling where practical.
- Nav/shell components: `SettleoraBottomNav` centralizes six mobile destinations, uses SafeArea, constrained width on wider surfaces, semantics labels, selected state, and stable narrow-surface labels. `SettleoraScreenScaffold` wraps SafeArea/padding but is not used everywhere.
- Empty/error/loading states: `EmptyState`, `LoadingState`, `ErrorState`, and many screen-local `_StatePanel`, `_FailurePanel`, `_LoadingPanel`, and empty panels exist. Shared components are covered by a guardrail test, but product surfaces still duplicate state panel patterns.
- Accessibility/readability affordances already present include semantic labels on bottom nav, payment summary, receipt review, attachment controls, bill summaries, revision change markers, saved OCR review actions, and queue tiles; icon tooltips on app bars/actions; safe-area layout; scrollable content; narrow/wide dashboard test coverage; and bounded/sanitized visible failure text in sensitive surfaces.

## M14-001 Starter Surface Usage Inventory

- App shell: `server_mode_shell.dart` uses the shared bottom nav, scrollable dashboard surface, constrained dashboard width, quick-action cards, dashboard readiness/data-portability readouts, current-user/header tooltips, sync status cards, empty/loading/error cards, and route handoffs. Presentation hints are already labeled as not authorization, financial truth, sync acceptance, or full offline cache hydration.
- First launch/sign-in/bootstrap: `setup_screen.dart`, `sign_in_screen.dart`, and `app_bootstrap.dart` use Material inputs/buttons, SafeArea, ListView/centered states, and explicit local/server authority copy. They do not expose visual preference controls.
- Dashboard/readiness: `dashboard_preview_screen.dart` uses `SettleoraTheme`, `AppButton`, `AppCard`, `StatusChip`, `MetricCard`, `AmountStatusRow`, horizontal choice chips, warning/readiness cards, and explicit unsupported dashboard personalization/readout copy.
- Profile/payment readouts: `profile_screen.dart` uses SafeArea/ListView, server-returned profile/payment readouts, semantic payment summary, bounded payment/QR text, and copy that visibility is not client-side authorization. It currently lacks explicit visual preference unsupported readouts.
- Bills/groups/settlements/recurring/notifications/reports/receipt review: broad starter surfaces use shared status chips/cards/buttons in many places, local readout/authority copy, tooltips, and Semantics coverage for sensitive controls. Product-local chips, panels, and direct color-scheme usage remain candidates for M14-002 hardening where the change stays presentation-only.

## M14-001 Accessibility And Readability Coverage

- Contrast/readability direction: soft status token pairs exist for success/warning/danger/info and primary/foreground roles. There is no automated contrast test inventory yet, and some muted/subtle text and ad hoc dashboard colors need review before claiming accessible contrast coverage.
- Touch targets: theme-level `FilledButton` minimum is 48 by 48; bottom navigation items use a minimum height of 58 and a 42px central action. IconButton/FAB defaults generally satisfy Material tap targets. Some small chips and dense product rows are readouts rather than primary actions; M14-002 should review actionable chips/compact controls.
- Screen reader/semantic labels: focused tests cover semantics for receipt review queue/detail actions, bill attachments, bill revision markers, saved OCR review labels, notification unsafe-details suppression, direct OCR discovery labels, and payment details summary. Bottom nav explicitly marks items as buttons and selected.
- Text scaling/overflow risks: many rows use `Expanded`, `Flexible`, `FittedBox`, `maxLines`, or `TextOverflow.ellipsis`; scrollable `ListView`/`SingleChildScrollView` layouts are common. There is no systematic high text-scale widget coverage yet, and product-local rows with amount/status columns remain risk areas.
- Motion-sensitive behavior: no custom animation or reduced-motion preference was found in the inspected theme/component/app surfaces. Standard Flutter progress indicators and route/sheet behavior remain.
- Known M14-002 gaps: token alignment with approved warm fintech direction, contrast review, duplicated product-local state panels/chips, hardcoded dashboard summary colors, raw Material color-scheme usage where Settleora tokens should carry product meaning, compact amount/status overflow, and focused touch target/readability assertions.
- Known M14-003 gaps: existing profile/settings-adjacent surfaces do not yet explicitly state appearance mode, accent color, palette, category/tag/group/dashboard/chart/status colors, and customization controls are unsupported presentation-only settings where persistence/API/schema is absent.

## M14-001 Unsupported Visual Preference Readiness

- Appearance mode: app uses `SettleoraTheme.light()` from `main.dart`; no system/light/dark preference selector or persisted mode exists.
- Accent color: `SettleoraColors.accent` and `accentSoft` exist as built-in tokens, but no user-selectable accent preference exists.
- Palettes: only immutable built-in app fallback tokens exist in code. No server-mode palette records, local preference records, admin defaults, sharing, copy/fork, or versioning runtime exists.
- Category/tag/group/dashboard/chart/status colors: status display colors exist as built-in semantic chip variants only. No category, tag, group, dashboard, chart, or configurable status color preference runtime exists.
- Customization/readout placeholders: dashboard and data-portability readouts already label unsupported dashboard personalization and saved layouts. Visual preference-specific unsupported readouts still need M14-003 hardening.
- Rule: all current and future M14 visual settings are presentation-only unless a later approved API/schema/contracts/generated-client task creates persistence. Unsupported visual settings must not have fake save/apply/sync/admin controls.

## M14-001 Test Coverage Inventory

- `apps/mobile/test/ui/settleora_component_guardrail_test.dart` covers shared `AppButton`, `StatusChip`, `AppCard`, `MetricCard`, `AmountStatusRow`, `AppTextField`, `EmptyState`, `LoadingState`, `ErrorState`, and bottom nav labels/taps/narrow-surface stability.
- `apps/mobile/test/widget_test.dart` covers first-launch/local/server/sign-in/bootstrap authority copy and bounded auth failure display.
- `apps/mobile/test/server_mode_shell_dashboard_test.dart` covers dashboard data-portability/readiness readouts, presentation-hints-only copy, and narrow/wide visible sections.
- `apps/mobile/test/dashboard_preview_screen_test.dart` covers dashboard preview cards, readiness copy, and shared theme/component imports.
- `apps/mobile/test/profile_screen_test.dart` covers profile/payment visibility authority copy and unsafe raw payment/QR text suppression.
- Product-focused tests cover semantics and unsafe-detail suppression for bills, group bills, settlements, recurring bills, notifications, monthly reports, receipt OCR review, bill attachments, and bill revision review.
- M14-002 should add or update focused tests for token/component/readability hardening, hardcoded color removal where changed, contrast/touch-target/readout assumptions where feasible, and compact/large text behavior for changed shared components.
- M14-003 should add or update focused tests that visual preference unsupported readouts are present, presentation-only, and do not expose fake controls for unavailable persistence/API/schema behavior.

## Safety And Authority Boundaries

- Visual settings are presentation-only.
- Theme, color, status color, component visibility, route visibility, hidden controls, dashboard cards, local filters, and generated-client availability must not authorize access.
- Theme/color must not determine money, split calculations, settlement state, sync acceptance, storage access, audit truth, security policy, file visibility, privacy mode policy, or business state transitions.
- No persisted visual settings, visual preference endpoints, OpenAPI/generated-client changes, schema/migrations, deployment/admin default palette policy, palette sharing, user preference sync, or local-to-server visual preference migration are authorized in M14 unless a later human-approved task explicitly changes scope.
- No fake controls are allowed for unsupported visual settings. Readouts may say unsupported or future explicit work only.

## Manual Review Status

- Manual UI retest: `deferred_until_day1_acceptance`; not passed.
- Manual code review: `deferred_until_day1_acceptance`; not passed.
- Hard safety gate: not triggered by M14-001 because changes are limited to `.ai` control files and this QA map.
