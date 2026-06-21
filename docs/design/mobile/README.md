# Settleora Mobile Design References

This folder records approved mobile UI/UX design reference material for future Settleora implementation tasks. It turns approved Figma-first direction and design-slice decisions into repo-tracked source material so implementation work does not depend on chat history.

## V1 references

- [Mobile design reference V1](MOBILE_DESIGN_REFERENCE_V1.md)
- [Mobile Bills and OCR reference V1](MOBILE_BILLS_OCR_REFERENCE_V1.md)
- [Mobile design reference assets](assets/README.md)

## Scope rules

Figma screenshots, exports, and visual references are reference artifacts only. Future implementation must still obey the repository architecture, generated-client rules, API/domain authority boundaries, storage privacy rules, and money/settlement calculation authority.

Future Material UI implementation should reference these docs plus approved screenshots or exports saved under [assets](assets/). The docs describe desired composition, interaction, and component direction; they do not authorize runtime behavior by themselves.

Generated clients, OpenAPI contracts, API routes, database schema, migrations, business logic, auth/session behavior, storage behavior, and settlement/payment/bill calculation logic remain outside this design reference scope.
