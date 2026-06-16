# Current Milestone

- ID: `M14`
- Name: `Day 1 Mobile Visual Theme, Color, And Accessibility Readiness`
- Target branch: `ai/integration`
- Previous milestone ID: `M13`

## Goal

Advance the next bounded Day 1 mobile product-readiness seam after M13 by reconciling and hardening mobile visual theme, color-token, reusable component, and accessibility/readability readiness inside existing mobile presentation seams. M14 is intentionally a mobile presentation/readiness milestone: it may improve built-in theme tokens, contrast/readability, component usage, and presentation-only unsupported visual preference readouts, but it must not add persisted visual settings, backend/API behavior, OpenAPI/generated-client changes, schema, auth/security runtime, storage/privacy behavior, money/business authority, web/admin runtime, deployment, or broad settings/data-portability behavior.

Repo-state basis for this milestone:

- `README.md` says the mobile app already includes first-launch local/server configuration, authenticated shell, dashboard, profile/payment, session/device, personal/group bill, group management, settlement, recurring, notification, monthly report, and receipt review starter surfaces, while broader mobile product UI, web/admin portals, full offline cache hydration, and broad settings/data-portability runtime remain future work.
- `docs/ux/UI_UX_FOUNDATION.md` defines the approved warm fintech groups visual direction, requires accessible-by-default color/motion/density/language/touch-target behavior, and says mobile is a first-class capture, review, action, and settlement surface.
- `docs/ux/SCREEN_INVENTORY.md` identifies mobile Home Dashboard, Groups, bills, receipts, settlements, Action Inbox, Search and Reports, Sync and Conflict Review, and Settings as implementation-facing surfaces while warning future implementation must verify current backend/API support.
- `docs/architecture/VISUAL_THEME_COLOR_SETTINGS_ARCHITECTURE.md` defines visual settings as presentation-only, explicitly forbids visual settings from influencing authorization, money, settlement state, sync acceptance, storage access, audit truth, or security policy, and says future persistence/API/schema/admin work requires separate reviewed slices.
- `docs/prd/MVP_DAY1_SCOPE.md` requires Day 1 to be usable for real financial records and accessible enough for repeated use, while preserving API/domain authority for money, authorization, storage, status transitions, and audit.
- Current mobile code under `apps/mobile/lib/ui/`, `apps/mobile/lib/app/`, `apps/mobile/lib/dashboard/`, and existing product surfaces already use `SettleoraTheme`, `SettleoraColors`, reusable components, and focused widget tests, creating bounded mobile-only seams for theme/readability/accessibility hardening without API, OpenAPI, generated-client, schema, auth/security, storage/privacy, money, deployment, web/admin, or unrelated changes.

## Allowed Scope For Future M14 Tasks

- Reconciliation of current mobile theme tokens, reusable components, built-in palette usage, hardcoded color gaps, touch/readability/accessibility coverage, and unsupported persisted visual preference states.
- Mobile-only built-in theme/component/readability hardening under existing presentation seams, including `apps/mobile/lib/ui/**`, bounded app/dashboard/settings readouts, and focused widget tests.
- Presentation-only copy that clarifies theme/color preferences are not persisted server policy, not authorization signals, not financial truth, and not available as admin/deployment/user-owned palette runtime yet.
- M14 QA map and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M14 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior, visual preference endpoints, policy endpoints, server persistence, OpenAPI/generated-client changes, or schema/migrations.
- Auth/session/security runtime, authorization policy, token/credential/session behavior, registration/bootstrap policy, OIDC/Keycloak, MFA, passkey, recovery, admin, or audit-policy changes.
- Storage/file privacy policy, file authorization policy, private-vault behavior, file byte movement, CSV import/export, local backup/restore, local-to-server migration/link, server-to-local export/disconnect, statement import, or retention policy changes.
- Client-side authorization decisions from theme, color, status color, hidden controls, route state, cached rows, generated-client availability, local search/filter results, dashboard visibility, or component visibility.
- Money, bill, settlement, payment, recurring, OCR, reconciliation mutation, calculation authority, business status-transition authority, or import-driven financial mutation.
- Runtime visual preference persistence, custom palette creation, palette sharing, deployment/admin default palette policy, user preference sync, or local-to-server visual preference migration.
- Docker/deployment/env/CI config.
- Production secrets, credentials, tokens, `.env`, `.ssh`, `.codex`, or local auth/session config.
- Web/admin runtime UI, broad offline cache/sync, Day 1 scope reduction, architecture direction replacement, or unrelated major-domain work.

## Done Criteria

- Current mobile theme/component/readability/accessibility readiness state is reconciled against Day 1 UX and visual-settings architecture requirements and captured in the M14 QA map.
- Existing mobile built-in theme tokens and reusable components are hardened where safe so presentation is readable, bounded, and consistent across current starter surfaces without adding preference persistence or policy behavior.
- Any visual preference, appearance mode, accent, palette, category/tag/group/dashboard/chart/status-color, or customization readout is clearly presentation-only and unsupported where runtime persistence/API/schema is absent.
- Empty, unavailable, unsupported, high-contrast/system-mode, stale/offline, and disabled-control states do not leak raw IDs, tokens, storage paths, provider payloads, private/vault internals, secrets, or unrelated records.
- Manual UI retest and manual code review remain deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.
- M14 ends in a bounded controller stop state before backend/API, OpenAPI/contracts, generated clients, schema, auth/security runtime, storage/privacy, money/settlement/bill/recurring/OCR/reconciliation authority, deployment, web/admin, broad offline sync/cache, visual preference persistence, or unrelated major-domain work.

## Current Task Pointer

- Current/next task: `M14-001-MOBILE-VISUAL-THEME-ACCESSIBILITY-STATE-RECONCILE-20260616-2053`.
- Last completed task: `M13-004-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-QA-FINALIZE-20260616-1742`.
- Current state: M13 finalized and deferred acceptance ready; M14 queued as a controller-continuation kickoff after the finalized M13/deferred-acceptance-ready controller stop.
- Manual UI retest status: `deferred_until_day1_acceptance`; not passed by M14 kickoff.
- Manual code review status: `deferred_until_day1_acceptance`; not passed by M14 kickoff.
- Recommended next automated task: `M14-001-MOBILE-VISUAL-THEME-ACCESSIBILITY-STATE-RECONCILE-20260616-2053`.
- Stop sentinel: `STOP-M14-001` stops persistence/API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

## M14 Kickoff Summary

M14 is queued as `Day 1 Mobile Visual Theme, Color, And Accessibility Readiness`.

The selection follows M13 finalization and the controller dry-run stop reason `Milestone is marked deferred acceptance ready`. This is a controller-continuation kickoff after a finalized milestone stop, not a signal that Day 1 is complete.

The next safe queue is bounded to mobile presentation readiness because the repo already has starter mobile product surfaces and a shared `SettleoraTheme`/component system, while Day 1 UX and visual-settings architecture docs still call for accessible-by-default, warm fintech group-first presentation and presentation-only color/theme guardrails. The milestone avoids persistence/API/schema/admin work and starts with a state reconciliation task.

M14 queue:

- `M14-001-MOBILE-VISUAL-THEME-ACCESSIBILITY-STATE-RECONCILE-20260616-2053` - Queued. Reconcile current mobile theme, color-token, component, accessibility, and unsupported visual preference readiness without runtime behavior changes.
- `M14-002-MOBILE-THEME-COMPONENT-READABILITY-HARDENING-20260616-2053` - Queued. Harden built-in mobile theme/component/readability seams without API, persistence, schema, policy, or business-authority changes.
- `M14-003-MOBILE-VISUAL-PREFERENCE-UNSUPPORTED-READOUT-HARDENING-20260616-2053` - Queued. Clarify unsupported presentation-only visual preference/palette/customization states in existing mobile settings/readout seams without adding runtime settings.
- `M14-004-MOBILE-VISUAL-THEME-ACCESSIBILITY-QA-FINALIZE-20260616-2053` - Queued. Finalize M14 QA/control state after bounded slices complete.
- `STOP-M14-001` - Stop. Manual gate for persistence/API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

M14 kickoff changes only `.ai` control files, the M14 QA map, and a narrow M14 scope-guard allowlist. It does not change runtime product behavior, backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, token issuance, refresh rotation, revocation semantics, password/credential/OIDC/MFA/passkey/recovery/registration/admin behavior, audit policy, schema/migrations, storage/privacy/file authorization, file byte behavior, real CSV import/export, local backup/restore, migration/link/disconnect/export runtime, money/bill/settlement/recurring/OCR/reconciliation authority, import-driven financial mutation, Docker/deployment/env/CI, secrets, web/admin runtime, broad offline cache/sync, persisted visual settings, Day 1 scope, or architecture direction.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
