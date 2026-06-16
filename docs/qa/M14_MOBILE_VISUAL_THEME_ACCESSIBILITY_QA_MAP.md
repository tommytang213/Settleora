# M14 Mobile Visual Theme, Color, And Accessibility QA Map

Status: `M14 finalized/UI-test ready; M14-004 completed; manual UI/code review deferred until Day 1 acceptance`

## Purpose

Record the M14 mobile visual theme, color-token, reusable component, readability/accessibility, touch-target/readout, hardcoded color, and unsupported visual preference readiness state against Day 1 UX and visual-settings architecture requirements.

M14 remains bounded to mobile presentation/readiness seams. This map does not authorize backend/API behavior, visual preference endpoints, OpenAPI/generated-client changes, schema/migration changes, auth/session/security runtime or authorization-policy changes, storage/privacy/private-vault/file-byte behavior, import/export/backup/migration/runtime portability, money/settlement/bill/recurring/OCR/reconciliation authority, deployment, Docker, CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope reduction, architecture replacement, or persisted visual settings.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M14. UI testing readiness is true after M14-004 finalization; this is readiness for deferred Day 1 acceptance review, not a manual acceptance pass.

## M14 Queue State

- `M14-001-MOBILE-VISUAL-THEME-ACCESSIBILITY-STATE-RECONCILE-20260616-2053` - Completed. Reconciled current mobile visual theme, color-token, reusable component, accessibility/readability, and unsupported visual preference state without runtime behavior changes.
- `M14-002-MOBILE-THEME-COMPONENT-READABILITY-HARDENING-20260616-2053` - Completed. Hardened mobile built-in theme/component/readability seams without API, persistence, schema, policy, or business-authority changes.
- `M14-003-MOBILE-VISUAL-PREFERENCE-UNSUPPORTED-READOUT-HARDENING-20260616-2053` - Completed. Clarified unsupported presentation-only visual preference/palette/customization states in existing mobile readout seams without fake settings controls.
- `M14-004-MOBILE-VISUAL-THEME-ACCESSIBILITY-QA-FINALIZE-20260616-2053` - Completed. Finalized M14 QA/control state, recorded carried-forward validation coverage, preserved deferred manual UI/code review, and marked M14 UI-test ready for deferred Day 1 acceptance review.
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

## M14-002 Theme Component Readability Hardening Summary

M14-002 completed bounded mobile presentation/readability hardening.

Runtime/component hardening:

- `SettleoraColors.light` now uses a warm orange primary built-in palette aligned with the approved warm fintech groups direction, while preserving semantic soft status tokens and stronger muted/subtle text contrast.
- Shared `StatusChip` labels now remain single-line and ellipsized inside constrained chip rows instead of forcing horizontal overflow.
- Shared `AmountStatusRow` now bounds subtitles, amount text, and status chips, and switches to a stacked compact layout on narrow rows so amount/status readouts remain readable under high text scale.
- Authenticated dashboard summary cards now consume `SettleoraColors` semantic danger/success soft tokens instead of local hardcoded pink/green colors.

Focused automated coverage:

- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/ui/settleora_component_guardrail_test.dart` passed with 5 Flutter tests.
- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/dashboard_preview_screen_test.dart test/server_mode_shell_dashboard_test.dart test/widget_test.dart` passed with 73 Flutter tests.
- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/ui/settleora_component_guardrail_test.dart test/dashboard_preview_screen_test.dart test/server_mode_shell_dashboard_test.dart test/widget_test.dart` passed with 78 Flutter tests.
- `cd /workspace/repos/Settleora && PATH=/opt/flutter/bin:$PATH npm run validate:mobile` passed with 718 Flutter tests.
- Added guardrails for warm primary hue, built-in token contrast pairs, shared button minimum touch target height, and high text-scale `AmountStatusRow` stability.
- Validation warnings were limited to Flutter dependency newer-version notices and the Redocly CLI update notice.

Remaining M14-003/M14-004 gaps:

- Visual preference unsupported readouts for appearance mode, accent color, palettes, category/tag/group/dashboard/chart/status colors, and customization settings were hardened in M14-003 without fake controls.
- Manual UI retest and manual code review remain `deferred_until_day1_acceptance`, not passed.
- M14 UI testing readiness remains false until M14-004 finalization records the completed bounded slices and final validation state.

## M14-003 Visual Preference Unsupported Readout Hardening Summary

M14-003 completed bounded mobile presentation-only unsupported visual preference readout hardening.

Files changed:

- `.ai/current-milestone.md`
- `.ai/qa-report.md`
- `.ai/state.json`
- `.ai/task-queue.json`
- `docs/qa/M14_MOBILE_VISUAL_THEME_ACCESSIBILITY_QA_MAP.md`
- `apps/mobile/lib/ui/settleora_components.dart`
- `apps/mobile/lib/app/server_mode_shell.dart`
- `apps/mobile/lib/profile/profile_screen.dart`
- `apps/mobile/test/ui/settleora_component_guardrail_test.dart`
- `apps/mobile/test/server_mode_shell_dashboard_test.dart`
- `apps/mobile/test/profile_screen_test.dart`

Behavior/readout summary:

- Added shared `VisualPreferenceUnsupportedReadout` for current mobile read-only visual preference readiness.
- Authenticated dashboard settings/readiness and profile account surfaces now state current mobile uses built-in theme tokens only.
- The readout states visual preferences are presentation-only readouts in this slice.
- Appearance mode concepts `system`, `light`, and `dark` are labeled future explicit work.
- Accent color and built-in palette versus custom palette choices are labeled unavailable.
- Category, tag, group, dashboard, chart, and configurable status color concepts are labeled built-in presentation labels only.
- Dashboard layout and palette personalization readiness is read-only.
- The readout explicitly says no server-mode visual preference persistence exists in this slice, no visual preference API/schema path exists here, no local-to-server visual preference migration exists in this slice, and no admin/deployment default palette policy exists in this slice.
- The authority readout states theme and color choices must not affect authorization, money, settlement state, sync acceptance, storage access, audit truth, privacy policy, or security policy.
- No fake Save, Apply, Sync, Publish, Share, Admin default, Import, Export, Migrate, Restore, or Create custom palette controls were added to the unsupported visual preference readouts.

Tests added/updated:

- `apps/mobile/test/ui/settleora_component_guardrail_test.dart` now covers the shared visual preference unsupported readout and verifies it has no button controls.
- `apps/mobile/test/server_mode_shell_dashboard_test.dart` now covers the authenticated dashboard visual preference readout copy and verifies no fake runtime controls appear inside the readout.
- `apps/mobile/test/profile_screen_test.dart` now covers the profile visual preference readout copy and verifies no fake runtime controls appear inside the readout.

Focused/full validation counts:

- Focused touched-surface validation passed with 54 Flutter tests:
  - `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/ui/settleora_component_guardrail_test.dart test/server_mode_shell_dashboard_test.dart test/profile_screen_test.dart`
- Required focused validation passed with 90 Flutter tests:
  - `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/ui/settleora_component_guardrail_test.dart test/dashboard_preview_screen_test.dart test/server_mode_shell_dashboard_test.dart test/profile_screen_test.dart test/widget_test.dart`
- Full mobile validation passed with 718 Flutter tests:
  - `cd /workspace/repos/Settleora && PATH=/opt/flutter/bin:$PATH npm run validate:mobile`

Explicit non-goals preserved:

- No backend/API behavior, visual preference endpoints, OpenAPI/contracts, generated-client changes, database schema/migrations, persisted visual settings, custom palette creation, palette sharing, admin/deployment default palette runtime, local-to-server visual preference migration, auth/session/security runtime, authorization policy, storage/privacy/file-byte behavior, audit-policy authority, money/bill/settlement/payment/recurring/OCR/reconciliation authority, Docker/deployment/env/CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope reduction, or architecture direction changes.

Remaining M14-004 finalization:

- M14-004 finalized the M14 QA/control state after the bounded slices, preserved deferred manual UI/code review, and updated UI testing readiness.

## M14-004 QA Finalization Summary

M14-004 completed docs/control-only QA finalization.

Final M14 state:

- M14-001, M14-002, M14-003, and M14-004 are completed.
- M14 is finalized and UI-test ready for deferred Day 1 acceptance review.
- `.ai/state.json` status is `m14_finalized_ui_test_ready`.
- `.ai/state.json` `currentTaskId` is `null`.
- `.ai/state.json` `uiTestingReady` is `true`.
- `.ai/state.json` `automatedValidationComplete` is `true` after required final validation passes.
- Manual UI retest remains `deferred_until_day1_acceptance` and is not passed.
- Manual code review remains `deferred_until_day1_acceptance` and is not passed.
- `STOP-M14-001` remains preserved as the stop sentinel.

Carried-forward validation counts:

- M14-002 focused component validation passed with 5 Flutter tests.
- M14-002 focused dashboard/app validation passed with 73 Flutter tests.
- M14-002 combined focused validation passed with 78 Flutter tests.
- M14-002 full mobile validation passed with 718 Flutter tests.
- M14-003 focused touched-surface validation passed with 54 Flutter tests.
- M14-003 required focused validation passed with 90 Flutter tests.
- M14-003 full mobile validation passed with 718 Flutter tests.

M14-004 final validation:

- Final validation is recorded in the task report for `M14-004-MOBILE-VISUAL-THEME-ACCESSIBILITY-QA-FINALIZE-20260616-2053`.
- The final controller dry run is expected to stop because M14 is marked UI-test ready. That stop is the desired final controller state, not a failure.

Explicit non-goals preserved:

- No backend/API behavior, visual preference endpoints, OpenAPI/contracts, generated-client changes, database schema/migrations, persisted visual settings, custom palette creation, palette sharing, admin/deployment default palette runtime, local-to-server visual preference migration, auth/session/security runtime, authorization policy, storage/privacy/file-byte behavior, audit-policy authority, money/bill/settlement/payment/recurring/OCR/reconciliation authority, Docker/deployment/env/CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope reduction, or architecture direction changes.

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
