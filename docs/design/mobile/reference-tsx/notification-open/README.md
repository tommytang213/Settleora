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
