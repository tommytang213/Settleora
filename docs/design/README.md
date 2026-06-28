# Settleora Design References

This folder records approved design and reference material for future Settleora
implementation tasks. Design references describe composition, interaction,
component direction, state coverage, and evidence requirements. They do not
authorize runtime behavior, API/OpenAPI changes, generated-client edits,
schema/migration changes, auth/session/security behavior, storage/file-byte
behavior, money/settlement/bill calculation logic, deployment changes, provider
configuration, or secrets.

## Reference Index

- [Mobile design references](mobile/README.md)
- [User web reference V1](web/WEB_USER_REFERENCE_V1.md)
- [Admin web reference V1](web/WEB_ADMIN_REFERENCE_V1.md)

## Source Order

Current repository files remain the source of truth. Use the design references
with:

- [Program architecture](../../PROGRAM_ARCHITECTURE.md)
- [Day 1 UX reference decisions](../planning/DAY1_UX_REFERENCE_DECISIONS.md)
- [Day 1 UX implementation readiness plan](../planning/DAY1_UX_IMPLEMENTATION_READINESS_PLAN.md)
- Relevant domain architecture and feature docs for the changed area

Mobile references define the approved Settleora product language. Web and admin
references adapt that language to desktop/tablet product surfaces and define
when textual reference is enough versus when a future task still needs
screenshot, Figma, or human taste approval.
