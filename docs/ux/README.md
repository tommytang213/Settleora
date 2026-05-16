# Settleora UX Docs

This directory captures Settleora's product UX foundation for future mobile, user web, and admin web implementation. The docs define user experience direction, navigation rules, dashboard personalization concepts, design-system constraints, and implementation-facing screen inventory before major UI surfaces are built.

These documents guide future UI implementation branches only. They do not authorize backend feature implementation, client runtime work, OpenAPI changes, schema changes, generated-client changes, or security-policy changes by themselves.

## Documents

- [UI/UX foundation](UI_UX_FOUNDATION.md): approved Option B2 direction, product experience principles, surface navigation, first launch, mode handling, and core flow rules.
- [Dashboard personalization](DASHBOARD_PERSONALIZATION.md): landing preferences, widgets, reusable layout profiles, template behavior, assignment resolution, and permission constraints.
- [Design system](DESIGN_SYSTEM.md): Warm Fintech Groups default style, V1 themes, future custom semantic color direction, component rules, money display, privacy mode, and accessibility constraints.
- [Screen inventory](SCREEN_INVENTORY.md): implementation-facing screen map for mobile app, user web portal, and admin web portal.
- [Theme palette sheet](assets/theme-palettes-v01.svg): static visual reference for the six V1 system themes.

## Authority Reminder

Settleora UI preferences, hidden controls, dashboard widgets, cached records, local form state, and visual affordances are not authorization boundaries. In server mode, the ASP.NET Core API remains authoritative for money, authorization, sync acceptance, audit, storage, and policy decisions.
