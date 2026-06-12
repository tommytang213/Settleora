# Mobile Figma Parity Guardrails

## Purpose

This document preserves the current mobile UI baseline so future Flutter UI work does not regress the Figma Make prototype alignment or the shared Settleora component foundation. It is a guardrail for incremental implementation, not a redesign brief.

The product reference is the Figma Make mobile finance prototype supplied by product, last reviewed for this baseline from:

```text
https://www.figma.com/make/wkK3z5KZIi5Tvp3yaXRTcR/Mobile-Finance-App-Prototype?t=Tf6mwoWQp5A3XxWh-1
```

Current repository files remain the source of truth. If the Figma Make source or open mobile UI PRs differ from this document, reconcile the checked-out repo first and record the difference in the task report.

## Latest Repo Baseline

Shared mobile theme and component files:

- `apps/mobile/lib/ui/settleora_theme.dart`
  - `SettleoraColors`
  - `SettleoraSpacing`
  - `SettleoraRadius`
  - `SettleoraTheme.light()`
  - `BuildContext.settleoraColors`
- `apps/mobile/lib/ui/settleora_components.dart`
  - `AppButton`
  - `StatusChip`
  - `AppCard`
  - `MetricCard`
  - `AmountStatusRow`
  - `AppTextField`
  - `SettleoraBottomNav`
  - `SettleoraScreenScaffold`
  - `EmptyState`
  - `LoadingState`
  - `ErrorState`

Current dashboard/component consumers include:

- `apps/mobile/lib/dashboard/dashboard_preview_screen.dart`
- `apps/mobile/lib/app/server_mode_shell.dart`
- `apps/mobile/lib/bills/bill_list_screen.dart`
- `apps/mobile/lib/groups/group_list_screen.dart`
- `apps/mobile/lib/settlements/settlement_list_screen.dart`
- `apps/mobile/lib/receipt_ocr_review/receipt_ocr_review_screen.dart`
- `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart`
- `apps/mobile/lib/notifications/notification_screen.dart`
- `apps/mobile/lib/reports/monthly_report_screen.dart`
- `apps/mobile/lib/profile/profile_screen.dart`

## Figma Make Inventory Map

| Figma Make component | Current Flutter equivalent | Baseline status |
| --- | --- | --- |
| `components/settleora/AmountStatusRow.tsx` | `AmountStatusRow` | Shared primitive exists. |
| `components/settleora/AppButton.tsx` | `AppButton` with `primary`, `secondary`, `soft`, `destructive` variants | Shared primitive exists. |
| `components/settleora/AppCard.tsx` | `AppCard` | Shared primitive exists. |
| `components/settleora/AppTextField.tsx` | `AppTextField` | Shared primitive exists. |
| `components/settleora/BottomNav.tsx` | `SettleoraBottomNav` | Shared primitive exists; labels on current `ai/integration` are `Home`, `Bills`, `Groups`, `Settle`, `Receipts`, `Profile`. |
| `components/settleora/EmptyState.tsx` | `EmptyState` | Shared primitive exists. |
| `components/settleora/ErrorState.tsx` | `ErrorState` | Shared primitive exists. |
| `components/settleora/LoadingState.tsx` | `LoadingState` | Shared primitive exists. |
| `components/settleora/MetricCard.tsx` | `MetricCard` | Shared primitive exists. |
| `components/settleora/StatusChip.tsx` | `StatusChip` with `success`, `warning`, `danger`, `info`, `neutral` variants | Shared primitive exists. |
| `components/settleora/tokens.ts` | `SettleoraColors`, `SettleoraSpacing`, `SettleoraRadius`, `SettleoraTheme.light()` | Shared theme/token baseline exists. |
| `components/ComponentShowcase.tsx` | No Flutter showcase screen | Gap; use widget tests and this inventory until a Flutter showcase is intentionally added. |
| `components/Dashboard.tsx` | `DashboardPreviewScreen`, `DashboardScreen`, `SettleoraAuthenticatedServerShell` dashboard sections | Partial equivalent; dashboard sections still include private widgets while M2 dashboard PRs are in flight. |
| `components/bills/BillCard.tsx` | Bill list/detail private widgets in `bill_list_screen.dart` using `AppCard` and `StatusChip` | Partial equivalent; not promoted to shared component yet. |
| `components/bills/BillDetail.tsx` | `SettleoraBillDetailScreen`, `SettleoraGroupBillDetailScreen` | Partial equivalent. |
| `components/bills/BillDetailHeader.tsx` | Private bill detail header composition | Gap as a named shared component. |
| `components/bills/BillItemRow.tsx` | Private bill item rows in bill detail/create flows | Gap as a named shared component. |
| `components/bills/BillsList.tsx` | `SettleoraBillListScreen`, `SettleoraGroupBillListScreen` | Partial equivalent. |
| `components/bills/CreateBill.tsx` | `SettleoraPersonalBillCreateScreen` | Partial equivalent. |
| `components/bills/ReceiptAttachmentCard.tsx` | `bill_attachment_section.dart` and bill attachment widgets | Partial equivalent. |
| `components/bills/ReviewRequiredBanner.tsx` | Private warning/review states in bill and dashboard screens | Gap as a named shared component. |
| `components/groups/AllocationMethodSelector.tsx` | Group bill creation private controls | Gap as a named shared component. |
| `components/groups/AssignableBillItemRow.tsx` | Group bill creation private rows | Gap as a named shared component. |
| `components/groups/BillItemEditorRow.tsx` | Personal/group bill creation private item editor rows | Gap as a named shared component. |
| `components/groups/CreateGroupBill.tsx` | Group bill create flow in `bill_list_screen.dart` | Partial equivalent. |
| `components/groups/GroupBillCreateStepper.tsx` | Private group bill create stepper/composition | Gap as a named shared component. |
| `components/groups/GroupBillDetail.tsx` | `SettleoraGroupBillDetailScreen` | Partial equivalent. |
| `components/groups/GroupBillDetailHeader.tsx` | Private group bill detail header composition | Gap as a named shared component. |
| `components/groups/ItemAssignmentBottomSheet.tsx` | Private group bill assignment UI | Gap as a named shared component. |
| `components/groups/ParticipantAssignmentCard.tsx` | Private participant assignment UI | Gap as a named shared component. |
| `components/groups/ParticipantFilterChips.tsx` | Filter chips in group bill screens | Gap as a named shared component. |
| `components/groups/PayerSummaryCard.tsx` | Payer summary private UI in bill/group bill flows | Gap as a named shared component. |
| `components/groups/QuantitySplitStepper.tsx` | Quantity split private controls where present | Gap as a named shared component. |
| `components/groups/ReviewBeforeSavePanel.tsx` | Review/save private UI in bill/group bill flows | Gap as a named shared component. |
| `components/groups/SplitModeSelector.tsx` | Split mode private controls where present | Gap as a named shared component. |
| `components/groups/SplitStep.tsx` | Group bill create private step content | Gap as a named shared component. |

## Rules For Future Mobile UI Work

- Reuse `apps/mobile/lib/ui/settleora_theme.dart` and `apps/mobile/lib/ui/settleora_components.dart` for shared colors, spacing, radius, typography, cards, buttons, chips, fields, common states, and bottom navigation.
- Do not create one-off card, button, chip, text-field, or bottom-nav styling when a shared component already covers the use case.
- Promote reusable private dashboard or screen widgets into shared components when they appear in more than one screen or represent a Figma Make common component.
- Keep common states consistent across screens: empty, loading, error, offline, review-needed, and pending-sync.
- New screens must consider both narrow/mobile and wider Flutter viewports. Avoid layouts that only work on one phone size or desktop test surface.
- Keep test coverage for user-visible labels, route handoffs, bottom nav selected state, and the absence of implementation-seam copy visible to users.
- Do not expose implementation labels such as repository names, generated-client seams, exception class names, debug state, direct storage paths, or sync internals in user-facing UI.
- Treat Figma Make names as component intent, not generated Flutter source. Do not paste generated Figma code into the app.

## Regression Checklist For Mobile UI Branches

- Shared component reuse checked.
- Figma target component, screen, or variant named in the task notes or PR.
- Narrow/mobile viewport behavior checked.
- Wide/desktop Flutter viewport behavior checked when the screen can appear there.
- Relevant validation commands run and exact results recorded.
- No user-facing seam, debug, repository, generated-client, or internal storage copy is visible.
- No financial, settlement, split, authorization, sync-acceptance, file-access, or audit business logic moved into UI code.
- Open mobile UI PR overlap checked before touching dashboard, shell, navigation, bill, group, or settlement UI files.

## Presentation-Only Boundary

Mobile UI remains presentation-only. The API and domain services remain authoritative for authentication, authorization, current actor/profile resolution, money, rounding, bill and settlement status transitions, sync acceptance, file access, receipt/OCR acceptance, and audit.

Flutter may render server data, collect form input, show local pending state, and preview incomplete flows. It must not become the source of truth for financial calculations, split settlement outcomes, access decisions, receipt/OCR acceptance, storage object identity, or audit-significant state transitions.
