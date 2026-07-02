# Mobile Flutter UI Parity Audit - 2026-07-02

## Audit Summary

Current overall parity status: **partial**.

The Flutter app is **partially modernized**, not broadly at parity with the approved modern rounded fintech Settleora references. The current app has a real shared theme/component foundation, a modernized authenticated Home shell, stable `Home / Bills / Groups / Settle / More` bottom navigation, and many starter screens wired to repository/generated-client seams. However, the approved mobile reference sets are much broader than the current Flutter implementation. Large portions of the approved visual direction still exist as docs, PNG reference exports, and a TSX reference package rather than implemented Flutter screens.

Plain status: the approved references under `docs/design/mobile/` are **not fully implemented in Flutter**. They are mostly merged design/reference artifacts with selective Flutter implementation and test coverage. Notification-open/deep-link scope from #371 is the clearest exception: the issue is closed after PR #663 and final ledger work, and current Flutter code has typed notification-open handlers. That does not make the rest of the Notifications V1, push registration, auth security, privacy vault, More/settings, bills/OCR, groups, settle, or bill-revision visual references implemented.

Why the TestFlight app can still feel old/janky:

- The TestFlight workflow validates dependency restore, analysis, non-visual Flutter tests, signing, IPA build, and upload, but it intentionally excludes visual capture/screen-compare tests.
- M14 visual/theme work is recorded as UI-test ready with manual UI/code review deferred, not visually accepted as complete.
- The app still has many feature-local widgets, private `Card`/`Chip`/`Scaffold` patterns, hardcoded `BorderRadius.circular(8)` / `4`, and large screen files such as `apps/mobile/lib/bills/bill_list_screen.dart`.
- Approved reference assets are richer than the current starter Flutter surfaces, especially for OCR capture/review, group dashboards, settlement/payment/proof flows, More/settings, auth security, privacy vault, and bill revision review.

## TestFlight / Build Freshness Check

Repository configuration indicates the internal TestFlight build should come from whatever branch/commit the maintainer manually runs in Codemagic, normally current `main` after merge. This task did not trigger Codemagic, TestFlight, App Store Connect, or any store submission.

Relevant repo evidence:

- `codemagic.yaml` defines `mobile-ios-testflight-internal` with `working_directory: apps/mobile`, Flutter stable, Xcode latest, App Store signing, `flutter pub get`, `flutter analyze`, non-visual Flutter tests, `flutter build ipa --release`, and App Store Connect upload.
- `docs/workflow/CODEMAGIC_TESTFLIGHT_SETUP.md` says `Mobile iOS internal TestFlight` is manual-only and should be run only after setup/approval.
- The TestFlight workflow excludes `*visual_capture_test.dart` and tests tagged `visual`.
- `mobile-ios-visual-evidence` is a separate manual workflow for Codex/Figma/UI comparison and PNG evidence.
- `FLUTTER_BUILD_NAME` is fixed at `1.0.0`; build number comes from Codemagic `BUILD_NUMBER`.
- `apps/mobile/pubspec.yaml` also declares `version: 1.0.0+1`, but Codemagic overrides build name/number during IPA build.

Plausible stale-build causes from repo configuration only:

- The maintainer may not have manually rerun `Mobile iOS internal TestFlight` after the latest `main` merge.
- App Store Connect/TestFlight may show an older processed build if the latest manual Codemagic upload was not selected/available to internal testers.
- Fixed display version `1.0.0` can make two builds look similar unless the Codemagic build number or commit evidence is checked.
- The TestFlight workflow can pass while visual parity remains bad, because visual evidence tests are intentionally not part of TestFlight build validation.

What repo evidence does **not** show:

- No repo-side evidence that current `main` is unable to build a fresh TestFlight IPA.
- No repo-side evidence that PRs #666/#667 App Store compliance changes are related to visual parity.
- No repo-side evidence that stale build is the primary explanation. The stronger explanation is **reference-only-not-implemented plus partial implementation**.

## Approved Reference Inventory

Approved or merged mobile reference sources found:

| Reference set | Path(s) | Current authority/readout |
| --- | --- | --- |
| Mobile shell/Home/navigation V1 | `docs/design/mobile/MOBILE_DESIGN_REFERENCE_V1.md`, `docs/design/mobile/assets/mobile-shell-v1/` | Approved V1 shell/navigation reference: `Home / Bills / Groups / Settle / More`, no global center plus, More hub, top notification bell, tokenized theme direction. |
| Shared design-system audit | `docs/design/mobile/MOBILE_SHARED_DESIGN_SYSTEM_AUDIT_V1.md` | Merged audit/history of component hardening and remaining candidates. Useful but not proof of complete parity. |
| Implementation guardrails | `docs/design/mobile/MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md` | Implementation safety and visual consistency guardrails. |
| Bills/OCR V1 | `docs/design/mobile/MOBILE_BILLS_OCR_REFERENCE_V1.md`, `docs/design/mobile/assets/bills-ocr-v1/` | Approved-looking broad bills/OCR design inventory, including add bill, receipt scan, OCR processing, review, manual itemized, assignment, shared components. Mostly broader than current Flutter. |
| Groups V1 | `docs/design/mobile/MOBILE_GROUPS_REFERENCE_V1.md`, `docs/design/mobile/assets/groups-v1/` | Groups list/dashboard/balances/member/shared-component reference. Flutter has group list/detail/member foundations, not the full dashboard reference. |
| Settle V1 | `docs/design/mobile/MOBILE_SETTLE_REFERENCE_V1.md`, `docs/design/mobile/assets/settle-v1/` | Settlement dashboard, balances, suggested payments, request/payment/detail/history/proof/payment-method states. Flutter has settlement list/detail/actions, partial visual parity. |
| More/settings V1 | `docs/design/mobile/MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, `docs/design/mobile/assets/more-settings-v1/` | Broad More hub, profile, payment details, appearance, app settings, local/server mode, import/export, notifications, privacy/security, sessions. Flutter has More hub/profile/sessions/local backup pieces, but not full reference parity. |
| Notifications V1 | `docs/design/mobile/MOBILE_NOTIFICATIONS_REFERENCE_V1.md`, `docs/design/mobile/assets/notifications-v1/` | Notification center/detail/states/bulk triage/review queue reference. Flutter has notification list/actions/open handlers, partial visual parity. |
| Notification-open #371 references | `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md`, `docs/design/mobile/MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md`, `docs/design/mobile/reference-tsx/notification-open/` | #371 reference package and TSX artifact. #371 is closed after Flutter deep-link implementation, but this package is not a broad notification visual parity claim. |
| Push registration UX | `docs/design/mobile/MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md` | Reference only for future mobile OS permission/registration UI. Push/provider work remains separately gated. |
| Auth security V1 | `docs/design/mobile/MOBILE_AUTH_SECURITY_REFERENCE_V1.md`, `docs/design/mobile/assets/auth-security-v1/` | Security setup/passkey/MFA/recovery reference. Current Flutter auth/session surfaces are starter sign-in/session list, not full auth security UI. |
| Privacy vault V1 | `docs/design/mobile/MOBILE_PRIVACY_VAULT_REFERENCE_V1.md`, `docs/design/mobile/assets/privacy-vault-v1/` | Privacy vault setup/app-lock/reference states. Flutter does not implement this UI as Day 1 runtime. |
| Bill revision diff V1 | `docs/design/mobile/MOBILE_WEB_BILL_REVISION_DIFF_REFERENCE_V1.md`, `docs/design/mobile/assets/bill-revision-diff-v1/` | Mobile and web visual reference for revision review/diff states. Flutter has bill revision screens, but visual/component parity is partial. |
| OCR tax/discount/fee/refund | `docs/features/expenses-bills/OCR_TAX_DISCOUNT_FEE_REFUND_UX_REFERENCE.md`, `docs/design/mobile/assets/ocr-tax-discount-fee-refund-v1/` | Advanced OCR review reference, planning/future-gated relative to current starter OCR implementation. |

Conflicts or unclear authority:

- `MOBILE_DESIGN_REFERENCE_V1.md` says the approved dark Figma style is a selectable `Settleora Midnight` preset reference, but current Flutter theme only exposes a light warm palette in `SettleoraTheme.light()`.
- `MOBILE_SHARED_DESIGN_SYSTEM_AUDIT_V1.md` records many incremental hardening completions, while `.ai/qa-report.md` still says manual UI/code review is deferred. Treat automated/UI-test-ready status as implementation evidence, not human visual acceptance.
- The #371 TSX notification-open reference was visually recovered and accepted enough for #371 closure, but it remains a static review artifact, not a general app design-system source.
- More/settings, auth security, privacy vault, import/export/backup, and push registration references include future or gated behavior that current Day 1 architecture does not authorize as runtime.

## Flutter Implementation Inventory

Current Flutter source map:

| Area | Current Flutter path(s) | Notes |
| --- | --- | --- |
| App bootstrap/config/session | `apps/mobile/lib/main.dart`, `apps/mobile/lib/app/app_bootstrap.dart`, `apps/mobile/lib/app/app_configuration.dart`, `apps/mobile/lib/app/auth_session_repository.dart`, `apps/mobile/lib/app/secure_session_access_token_provider.dart`, `apps/mobile/lib/app/secure_storage.dart` | Real local/server configuration and secure-session boundary. |
| Setup/sign-in | `apps/mobile/lib/app/setup_screen.dart`, `apps/mobile/lib/app/sign_in_screen.dart` | Starter Material forms; not visually aligned with full auth/security references. |
| Authenticated shell/Home/More/sessions/local backup | `apps/mobile/lib/app/server_mode_shell.dart`, `apps/mobile/lib/app/local_data_backup.dart` | Central app shell, Home dashboard, More hub, session list, local data backup/import preview pieces. Large file with many private widgets. |
| Dashboard preview/reference harness | `apps/mobile/lib/dashboard/dashboard_preview_screen.dart` | Preview implementation of modern dashboard components; useful but separate from full live shell parity. |
| Shared theme/components/forms | `apps/mobile/lib/ui/settleora_theme.dart`, `apps/mobile/lib/ui/settleora_components.dart`, `apps/mobile/lib/ui/settleora_form_fields.dart` | Real shared foundation: tokens, cards, buttons, chips, state panels, bottom nav, money/date/currency/payment controls. Still incomplete and mixed with legacy/private widgets. |
| Bills/expenses/group bills | `apps/mobile/lib/bills/bill_list_screen.dart`, repositories and attachment files under `apps/mobile/lib/bills/` | Very broad implementation file covering list, create, detail, group bills, attachments, sync queue, saved OCR review, revision entry. Styling is mixed. |
| Bill revision review/proposal | `apps/mobile/lib/bills/bill_revision_review_screen.dart`, `apps/mobile/lib/bills/bill_revision_proposal_editor_screen.dart`, `apps/mobile/lib/bills/bill_revision_repository.dart` | Functional starter review/proposal screens; partial visual parity with bill-revision reference assets. |
| OCR capture/intake/parser | `apps/mobile/lib/receipt_ocr_capture/**` | On-device OCR provider/parser/image normalization foundation exists. No full camera/gallery scan visual parity with `receipt-scan-v1` and `ocr-processing-v1`. |
| OCR review queue/detail | `apps/mobile/lib/receipt_ocr_review/**` | Queue/detail/edit/apply-preview implementation exists. Visual parity is partial and component reuse mixed. |
| Groups | `apps/mobile/lib/groups/group_list_screen.dart`, group repositories | Group list/create/detail/member and group-bill handoff foundation. Full group dashboard/balances/activity reference not implemented. |
| Settlements | `apps/mobile/lib/settlements/settlement_list_screen.dart`, settlement repositories | Balances/request/detail/payment/proof-related starter flows. Full Settle reference parity partial. |
| Recurring/future bills | `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart`, `apps/mobile/lib/future_bills/**` | Template/forecast/future bill flows exist. Visual reference coverage is weaker than other V1 sets. |
| Notifications/open | `apps/mobile/lib/notifications/notification_screen.dart`, notification repositories/preferences | List/summary/read/archive/restore/preferences-filtering and typed target open handlers exist. #371 notification-open scope is implemented; broad notification visual parity remains partial. |
| Profile/payment details/settings-adjacent | `apps/mobile/lib/profile/profile_screen.dart` | Self profile/payment details/session-ended handling and visual-preference readout. Does not implement full More/settings reference. |
| Reports | `apps/mobile/lib/reports/monthly_report_screen.dart` | Monthly report starter surface. |
| Manual finance | `apps/mobile/lib/manual_finance/manual_finance_screen.dart` | Accounts/income starter surface; outside most current mobile reference sets but uses shared fields. |
| Sync | `apps/mobile/lib/sync/**` | Queue/processor/change feed foundation; current UI mainly through bill/shell readouts. |

Styling state:

- Centralized: color tokens, spacing/radius constants, Material 3 theme, `AppButton`, `AppCard`, `StatusChip`, `SummaryCard`, `StateCard`, `SettleoraBottomNav`, money/date/currency/payment fields.
- Duplicated/local: many private `_StatePanel`, `_FailurePanel`, `_Section`, `_MoneyChip`, local `Card`, `Chip`, `AlertDialog`, `showModalBottomSheet`, hardcoded radii/padding/color usage across major screens.
- Consistency: Home and shared money/date fields are stronger; bills/OCR, settlements, groups, profile/settings, and notifications still mix new and old visual patterns.

## Parity Gap Matrix

| Area / screen / component | Current Flutter source path(s) | Reference source/doc path(s) | Parity status | Severity | User-visible issue | Recommended next slice |
| --- | --- | --- | --- | --- | --- | --- |
| App shell/navigation | `apps/mobile/lib/app/server_mode_shell.dart`, `apps/mobile/lib/ui/settleora_components.dart` | `MOBILE_DESIGN_REFERENCE_V1.md`, `assets/mobile-shell-v1/` | partial | P1 high | Bottom nav and Home are modernized, but shell/More/settings still mix private panels and starter layouts. | Shared shell/top bar/bottom nav/More hub parity slice. |
| Home/dashboard | `apps/mobile/lib/app/server_mode_shell.dart`, `apps/mobile/lib/dashboard/dashboard_preview_screen.dart` | `MOBILE_DESIGN_REFERENCE_V1.md`, `assets/mobile-shell-v1/` | partial | P1 high | Home is no longer a plain menu, but live Home still differs from full approved dashboard reference and manual UI retest remains deferred. | Home/dashboard visual parity and manual evidence slice after shared component cleanup. |
| Notifications center | `apps/mobile/lib/notifications/notification_screen.dart` | `MOBILE_NOTIFICATIONS_REFERENCE_V1.md`, `assets/notifications-v1/` | partial | P1 high | Functional list/actions exist, but center/detail/bulk triage/review queue chrome is not fully reference-grade. | Notifications center/detail visual parity slice, excluding #371 redo. |
| Notification-open/deep-link | `apps/mobile/lib/notifications/notification_screen.dart`, related target screens | `MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md`, `MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md`, `reference-tsx/notification-open/` | implemented | P2 medium | #371-specific open handlers exist and issue is closed; remaining risk is visual polish and adjacent push/provider states. | Do not redo #371; only include visual polish if a notification parity slice touches shared chrome. |
| Bills/expenses list/create/detail | `apps/mobile/lib/bills/bill_list_screen.dart` | `MOBILE_BILLS_OCR_REFERENCE_V1.md`, `assets/bills-ocr-v1/` | partial | P1 high | Functional surfaces are broad but dense, locally styled, and not at approved bills/OCR visual quality. | Bills list/detail/create parity bundle after shared card/list/chip components. |
| Bill detail/revision/review flows | `apps/mobile/lib/bills/bill_list_screen.dart`, `bill_revision_review_screen.dart`, `bill_revision_proposal_editor_screen.dart` | `MOBILE_WEB_BILL_REVISION_DIFF_REFERENCE_V1.md`, `assets/bill-revision-diff-v1/` | partial | P1 high | Revision flows exist but visual diff/review/activity/status treatment is less polished than reference assets. | Bill revision visual parity slice; no money/status authority changes. |
| OCR capture/review | `apps/mobile/lib/receipt_ocr_capture/**`, `apps/mobile/lib/receipt_ocr_review/**`, saved OCR sections in `bill_list_screen.dart` | `MOBILE_BILLS_OCR_REFERENCE_V1.md`, `OCR_TAX_DISCOUNT_FEE_REFUND_UX_REFERENCE.md`, `assets/bills-ocr-v1/`, `assets/ocr-tax-discount-fee-refund-v1/` | partial | P1 high | OCR review exists, but full scan/processing/assignment/tax-discount-fee correction reference is mostly not implemented. | OCR review UI parity slice limited to existing runtime; advanced tax/refund features remain gated. |
| Groups/friends | `apps/mobile/lib/groups/group_list_screen.dart`, group bill sections in `bill_list_screen.dart` | `MOBILE_GROUPS_REFERENCE_V1.md`, `assets/groups-v1/`, Day 1 PRD friend/direct-sharing requirements | partial | P1 high | Group list/detail/member foundation exists; full group dashboard/balances/friends/direct-sharing parity is missing. | Groups dashboard/list/member visual slice; friend/direct-sharing runtime remains separate API/auth gate. |
| Settlements/payment/proof | `apps/mobile/lib/settlements/settlement_list_screen.dart` | `MOBILE_SETTLE_REFERENCE_V1.md`, `assets/settle-v1/` | partial | P1 high | Settlement flows exist but dashboard/suggested/history/payment-method/proof states are not fully reference-grade. | Settle dashboard/detail/proof visual slice, no settlement money/state changes. |
| Recurring bills/forecast | `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart`, `apps/mobile/lib/future_bills/**` | `MOBILE_DESIGN_REFERENCE_V1.md`, PRD recurring requirements | partial | P2 medium | Functional starter surfaces exist, but recurring/forecast visuals are not clearly covered by approved V1 assets. | Recurring/future bill parity slice after shell/list components. |
| Auth/session/security surfaces | `apps/mobile/lib/app/sign_in_screen.dart`, `apps/mobile/lib/app/setup_screen.dart`, `apps/mobile/lib/app/server_mode_shell.dart`, `apps/mobile/lib/profile/profile_screen.dart` | `MOBILE_AUTH_SECURITY_REFERENCE_V1.md`, `assets/auth-security-v1/`, auth architecture docs | partial | P1 high | Sign-in/session list are starter Material forms; passkey/MFA/recovery/security setup reference is not implemented. | Separate auth-security UI planning/implementation slice with manual auth-security gate. |
| Settings/More/profile/preferences | `apps/mobile/lib/app/server_mode_shell.dart`, `apps/mobile/lib/profile/profile_screen.dart`, `apps/mobile/lib/notifications/notification_preferences.dart` | `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, `assets/more-settings-v1/`, `MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md` | partial | P1 high | More/profile/payment details exist; appearance/app settings/import-export/privacy-security/push registration are mostly readouts or reference-only. | More/settings/profile visual parity slice; keep push/auth/privacy/import runtime separate. |
| Backup/restore/local mode | `apps/mobile/lib/app/setup_screen.dart`, `apps/mobile/lib/app/local_data_backup.dart`, shell data safety widgets | `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`, local/import/export/backup architecture docs | partial | P2 medium | Local mode and local data backup readouts exist; full import/export/restore UX reference is not implemented. | Local data/readout visual slice only after import/export authority gates are clear. |
| Privacy vault/app lock | No full Flutter runtime; related readouts in setup/profile/shell only | `MOBILE_PRIVACY_VAULT_REFERENCE_V1.md`, `assets/privacy-vault-v1/`, `PRIVACY_VAULT_ARCHITECTURE.md` | reference_only | P2 medium | Approved-looking privacy vault screens are not in current app. | Future privacy/security gated slice, not part of broad UI polish. |
| Shared cards/chips/status panels/lists | `apps/mobile/lib/ui/settleora_components.dart` plus many local private widgets | All mobile V1 references | partial | P0 blocker | Without shared primitives, screen-by-screen parity work will keep creating inconsistent rounded cards and local panels. | First follow-up should consolidate shared visual primitives and migration guardrails. |

## Shared Design-System Findings

Theme/token state:

- `SettleoraColors.light` is a warm light palette with canvas/surface/primary/accent/status/text/border tokens.
- `SettleoraSpacing` and `SettleoraRadius` exist.
- `SettleoraTheme.light()` wires Material 3, app bar, card, filled button, and input defaults.
- There is no implemented selectable theme preset system. `Settleora Midnight` and multiple curated presets remain reference/planning direction.

Typography:

- Theme customizes selected Material text roles to heavier weights and zero letter spacing.
- Screen-level typography still often uses direct `Theme.of(context).textTheme` and local layout choices.

Radius/elevation/shadows:

- Shared `AppCard` uses `SettleoraRadius.lg` and border, but many screens still use raw `Card` or `BorderRadius.circular(8)` / `4`.
- Elevation is generally restrained, but not consistently abstracted.

Chips/status badges:

- New `StatusChip` exists, but legacy `SettleoraStatusChip`, `SettleoraCountChip`, `SettleoraReadinessChip`, raw `Chip`, `ChoiceChip`, and `FilterChip` remain in active screens.
- Status semantics are partly centralized but not fully.

Cards/lists:

- `AppCard`, `SummaryCard`, `StateCard`, `InfoCard`, `WarningCard`, `AmountStatusRow`, and `MetricCard` exist.
- Major screens still define local `_StatePanel`, `_FailurePanel`, `_Section`, `_MoneyChip`, `_BillSummaryTile`, `_SyncNotice`, and many other visual shells.

Bottom nav:

- `SettleoraBottomNav` implements the locked five-tab shell and removes obsolete Receipts/Profile bottom tabs.
- Top-level integration exists through the authenticated shell, but many pushed screens still use plain `Scaffold` with no bottom nav when appropriate for detail routes.

Sheets/dialogs:

- `showModalBottomSheet` and `AlertDialog` are used heavily with feature-local content. There is no shared Settleora sheet/dialog visual shell yet.

Tables/lists:

- No dedicated shared dense list/table pattern exists for revision details, settlement lines, OCR lines, member lists, and sync queue rows.

Conclusion: repeated patterns should become shared Flutter widgets before broad screen implementation. The blocker is not lack of code; it is lack of final component consolidation and visual QA gates against the approved reference assets.

## Recommended Implementation Plan

### Slice 1 - Shared Flutter Visual Foundation

Scope:

- Harden shared `Settleora` components for top bars, section headers, list tiles, inline panels, money chips, status badges, bottom sheets/dialogs, and reference-grade cards.
- Replace exact equivalent private visual shells in one or two low-risk screens only as examples.
- Do not change API behavior, auth/session runtime, generated clients, OpenAPI, storage, money, OCR runtime, or settlement calculations.

Expected validation:

- `cd apps/mobile && /opt/flutter/bin/flutter analyze`
- `cd apps/mobile && /opt/flutter/bin/flutter test test/ui/settleora_component_guardrail_test.dart`
- Focused screen tests for migrated surfaces.
- Visual evidence workflow/manual screenshots for component showcase.

Manual/Figma gate:

- Required: compare against approved mobile shell/shared component PNG references.

### Slice 2 - Shell, Home, More, Settings/Profile Parity

Scope:

- Bring live shell/Home/More/profile/payment/settings-adjacent screens closer to `MOBILE_DESIGN_REFERENCE_V1.md` and `MOBILE_MORE_SETTINGS_REFERENCE_V1.md`.
- Keep unsupported settings as honest readouts; do not add fake persistence controls.
- Keep push registration, auth security setup, privacy vault, and import/export runtime out of scope unless separately gated.

Expected validation:

- Shell/profile/dashboard widget tests.
- Full `flutter analyze` and focused Flutter tests.
- Visual evidence for Home default, Home needs attention, More hub, profile/payment details, setup/sign-in.

Manual/Figma gate:

- Required. This is the main route to answer the TestFlight "old/janky" concern.

### Slice 3 - Bills/OCR/Revision Visual Parity Bundle

Scope:

- Apply shared components to bills list/create/detail, saved OCR review, OCR review queue/detail, and bill revision review/proposal.
- Match existing runtime only. Do not implement advanced OCR tax/refund behavior, money calculation changes, OpenAPI/generated-client changes, or OCR worker/runtime changes.

Expected validation:

- Focused bill, OCR review, and revision widget tests.
- Existing visual capture tests under `apps/mobile/test/ui/*bills*`, `*ocr*`, `*revision*`.
- Full `flutter analyze`; full Flutter test if touched surface breadth is high.

Manual/Figma gate:

- Required for bills/OCR/reference screenshots and revision diff reference.

### Slice 4 - Groups, Settle, Notifications Visual Parity Bundle

Scope:

- Modernize group list/detail/member/group-bill context, settlement list/detail/payment/proof readouts, and notification center/detail chrome.
- Preserve #371 as complete; do not redo notification-open logic unless a concrete regression is found.
- Keep push/provider/admin notification policy, settlement money/state authority, and friends/direct-sharing API runtime separate.

Expected validation:

- Focused group, settlement, notification widget tests.
- Existing visual capture tests for groups, settlement, notification shared primitives.
- Full Flutter test if shared components changed.

Manual/Figma gate:

- Required for groups/settle/notifications assets. Notification-open only needs regression spot-checks, not reimplementation.

## Issue / Ledger Findings

- `docs/planning/ISSUE_PROGRESS_LEDGER.md` directly records #371 as closed after PR #664, with PR #663 implementing the Flutter notification-open/deep-link slice. Do not reopen or redo #371 without a real regression.
- GitHub issue #371 readback during this audit showed the final state as `CLOSED` with extensive merge/checkpoint comments.
- Issues #458, #459, and #461 are user-web planning/runtime history, not direct mobile Flutter parity issues. They reinforce that UI implementation should stay Figma/manual-gated.
- PR #666/#667 iOS/TestFlight compliance work is separate and not a visual parity implementation.
- PR #668/#669/#670 docs work is architecture/planning posture and does not affect mobile Flutter visuals.
- No direct issue was found for this exact "Mobile Flutter UI parity audit" concern.

If a new issue is created later, recommended issue:

- Title: `Mobile Flutter V1 visual parity implementation slices`
- Scope: Track shared component foundation plus shell/Home/More, bills/OCR/revision, and groups/settle/notifications visual parity work against merged mobile references.
- Labels: `area:mobile`, `type:feature`, `scope:day1`, `figma:required`, `manual-gate`, plus `risk:auth-security`, `risk:money`, or `risk:storage-authz` only on child slices that touch those surfaces.
- Validation class: `mobile-ui`.
- Manual/Figma gates: Required before merge for each visual slice; use repo PNG/reference assets and Codemagic visual evidence workflow where available.

No issue was created or modified by this audit.

## Non-Goals Confirmation

This audit did not implement Flutter UI changes.

This audit did not change iOS Info.plist, Podfile, Codemagic, TestFlight/App Store metadata, signing, provisioning, bundle IDs, entitlements, APNs/push, secrets, generated clients, OpenAPI, backend/API behavior, EF migrations/schema, auth/session/security runtime, storage/file-byte behavior, money/settlement/bill calculation logic, OCR runtime, sync runtime, Docker/deployment/environment/CI, or Figma/API/external screenshots.
