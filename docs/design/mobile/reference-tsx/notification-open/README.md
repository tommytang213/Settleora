# Notification Open TSX Reference

This package is the #371 repo-native, Figma-token-free notification-open
reference. It is a static review artifact, not app implementation.

- Reference component:
  [NotificationOpenReference.tsx](NotificationOpenReference.tsx)
- Source policy:
  [Notification deep-link route policy](../../../../architecture/NOTIFICATION_DEEP_LINK_ROUTE_POLICY.md)
- State handoff:
  [Mobile Notification Open States reference](../../MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md)
- Prior Figma/reference package:
  [Mobile Notification Open Figma reference package](../../MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md)

The TSX file is intentionally self-contained and does not import app runtime,
generated clients, Figma tokens, binary assets, or Flutter code. It uses static
data objects and local CSS to show the complete notification-open frame
inventory for product/design review.

## Visual Consistency Recovery

This package was corrected after the initial TSX reference was found to feel
visually detached from the approved Settleora mobile references. The current
preview intentionally follows the existing mobile-shell, Notifications, More
and Settings, Push Registration, Auth Security, and implementation guardrail
references:

- dark Settleora mobile canvas and phone chrome;
- top bell/global notification affordance rather than a bottom notification
  tab;
- locked `Home / Bills / Groups / Settle / More` bottom navigation;
- rounded cards, rows, chips, buttons, sheets, and spacing aligned with the
  approved mobile screenshots;
- notification-center style rows, filters, selected state, and detail/fallback
  states instead of a standalone documentation-board visual system.

This is a visual consistency recovery only. It does not create new product
scope or approve runtime implementation.

## Scope

Use this reference to review:

- notification inbox and selected row entry;
- authorized notification and target re-fetch loading;
- bill, settlement, residual review, recurring, OCR, and sync open states;
- sign-in, account, local-only, offline, missing, deleted, archived, restored,
  unauthorized, resolved, push-readiness, and generic fallback states;
- privacy and authority copy showing that notification rows, push payloads,
  local cache, route state, object URLs, and generated-client availability are
  not authorization.

Do not treat this TSX file as Flutter code, generated design source, API
behavior, route metadata, OpenAPI contract, generated-client source, or
notification runtime authority.
