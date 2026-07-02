# Settleora Mobile Design References

This folder records approved mobile UI/UX design reference material for future Settleora implementation tasks. It turns approved Figma-first direction and design-slice decisions into repo-tracked source material so implementation work does not depend on chat history.

## V1 references

- [Mobile design reference V1](MOBILE_DESIGN_REFERENCE_V1.md)
- [Mobile Bills and OCR reference V1](MOBILE_BILLS_OCR_REFERENCE_V1.md)
- [Mobile Groups reference V1](MOBILE_GROUPS_REFERENCE_V1.md)
- [Mobile Settle reference V1](MOBILE_SETTLE_REFERENCE_V1.md)
- [Mobile More and Settings reference V1](MOBILE_MORE_SETTINGS_REFERENCE_V1.md)
- [Mobile Notifications reference V1](MOBILE_NOTIFICATIONS_REFERENCE_V1.md)
- [Mobile Notification Open States reference](MOBILE_NOTIFICATION_OPEN_STATES_REFERENCE.md)
- [Mobile Notification Open Figma reference package](MOBILE_NOTIFICATION_OPEN_FIGMA_REFERENCE_PACKAGE.md)
- [Mobile Push Registration UX reference](MOBILE_PUSH_REGISTRATION_UX_REFERENCE.md)
- [Notification deep-link route policy](../../architecture/NOTIFICATION_DEEP_LINK_ROUTE_POLICY.md)
- [Mobile Auth Security reference V1](MOBILE_AUTH_SECURITY_REFERENCE_V1.md)
- [Mobile Privacy Vault reference V1](MOBILE_PRIVACY_VAULT_REFERENCE_V1.md)
- [Mobile Web Bill Revision Diff reference V1](MOBILE_WEB_BILL_REVISION_DIFF_REFERENCE_V1.md)
- [OCR tax, discount, fee, and refund UX reference](../../features/expenses-bills/OCR_TAX_DISCOUNT_FEE_REFUND_UX_REFERENCE.md)
- [Day 1 UX reference decisions](../../planning/DAY1_UX_REFERENCE_DECISIONS.md)
- [Mobile implementation guardrails V1](MOBILE_IMPLEMENTATION_GUARDRAILS_V1.md)
- [Mobile shared design system audit V1](MOBILE_SHARED_DESIGN_SYSTEM_AUDIT_V1.md)
- [Mobile design reference assets](assets/README.md)
- [User web reference V1](../web/WEB_USER_REFERENCE_V1.md)
- [Admin web reference V1](../web/WEB_ADMIN_REFERENCE_V1.md)

Screenshot assets for each approved slice live under `docs/design/mobile/assets/<slice>-v1/`, such as `mobile-shell-v1/`, `bills-ocr-v1/`, `groups-v1/`, `settle-v1/`, `more-settings-v1/`, `notifications-v1/`, `auth-security-v1/`, `privacy-vault-v1/`, `bill-revision-diff-v1/`, and `ocr-tax-discount-fee-refund-v1/`, when those assets have been manually exported and approved.

## Scope rules

Figma screenshots, exports, and visual references are reference artifacts only. Future implementation must still obey the repository architecture, generated-client rules, API/domain authority boundaries, storage privacy rules, and money/settlement calculation authority.

Future Material UI implementation should reference these docs plus approved screenshots or exports saved under [assets](assets/). The docs describe desired composition, interaction, and component direction; they do not authorize runtime behavior by themselves.

Generated clients, OpenAPI contracts, API routes, database schema, migrations, business logic, auth/session behavior, storage behavior, and settlement/payment/bill calculation logic remain outside this design reference scope.
