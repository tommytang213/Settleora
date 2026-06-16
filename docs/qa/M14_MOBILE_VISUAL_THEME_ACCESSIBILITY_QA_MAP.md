# M14 Mobile Visual Theme, Color, And Accessibility QA Map

Status: `M14 queued; M13 finalized/UI-test ready; manual UI/code review deferred until Day 1 acceptance`

## Purpose

Record the M14 controller-continuation kickoff after M13 finalized/UI-test-ready stop, plus the planned M14 reconciliation, mobile theme/component/readability hardening, visual preference unsupported readout hardening, and QA finalization coverage.

M14 remains bounded to mobile presentation/readiness seams. This map does not authorize backend/API behavior, visual preference endpoints, OpenAPI/generated-client changes, schema/migration changes, auth/session/security runtime or authorization-policy changes, storage/privacy/private-vault/file-byte behavior, import/export/backup/migration/runtime portability, money/settlement/bill/recurring/OCR/reconciliation authority, deployment, Docker, CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope reduction, architecture replacement, or persisted visual settings.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by this kickoff.

## M14 Kickoff Summary

M14 is queued as `Day 1 Mobile Visual Theme, Color, And Accessibility Readiness`.

The AI V3 controller dry run stopped with `Milestone is marked UI-test ready` because M13 was finalized for deferred Day 1 acceptance review. This kickoff treats that as a finalized-milestone controller stop and selects a bounded next Day 1 milestone from live repo evidence, not as a Day 1 completion signal.

M14 queue:

- `M14-001-MOBILE-VISUAL-THEME-ACCESSIBILITY-STATE-RECONCILE-20260616-2053` - Queued. Reconcile current mobile visual theme, color-token, component, accessibility, and unsupported visual preference readiness without runtime behavior changes.
- `M14-002-MOBILE-THEME-COMPONENT-READABILITY-HARDENING-20260616-2053` - Queued. Harden mobile built-in theme/component/readability seams without API, persistence, schema, policy, or business-authority changes.
- `M14-003-MOBILE-VISUAL-PREFERENCE-UNSUPPORTED-READOUT-HARDENING-20260616-2053` - Queued. Clarify unsupported presentation-only visual preference/palette/customization states in existing mobile readout seams without fake settings controls.
- `M14-004-MOBILE-VISUAL-THEME-ACCESSIBILITY-QA-FINALIZE-20260616-2053` - Queued. Finalize M14 QA/control state after bounded slices complete.
- `STOP-M14-001` - Stop. Manual gate for persistence/API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

## Source Documents

- `PROGRAM_ARCHITECTURE.md` keeps API/domain services authoritative for authorization, money, status transitions, storage access, sync acceptance, and audit.
- `README.md` records current starter mobile surfaces and shared app structure while noting broader mobile product UI, web/admin portals, full offline cache hydration, and broader runtime behavior remain future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires Day 1 to be safe for real user records and keeps money, authorization, storage access, status transitions, and audit API/domain-authoritative.
- `docs/ux/UI_UX_FOUNDATION.md` approves the warm fintech groups visual direction, requires accessible-by-default color/motion/density/language/touch-target behavior, and treats mobile as a first-class capture/review/action/settlement surface.
- `docs/ux/SCREEN_INVENTORY.md` identifies the mobile starter surfaces and requires future implementation to verify backend/API support first.
- `docs/architecture/VISUAL_THEME_COLOR_SETTINGS_ARCHITECTURE.md` defines visual settings as presentation-only and says they must never influence authorization, money, settlement state, sync acceptance, storage access, audit truth, or security policy. It also states API/schema/persistence/admin palette work requires separate reviewed slices.

## Current Surface Inventory For M14-001

M14-001 should reconcile, without runtime changes:

- `apps/mobile/lib/ui/settleora_theme.dart`: built-in theme token and `SettleoraColors` extension readiness.
- `apps/mobile/lib/ui/settleora_components.dart`: reusable button, card, chip, stat, nav, and empty/error component readiness.
- `apps/mobile/lib/app/`: first-launch, sign-in, bootstrap, authenticated shell, dashboard/settings/readiness, and hardcoded color usage.
- `apps/mobile/lib/dashboard/`: dashboard preview/readiness presentation.
- `apps/mobile/lib/profile/`: settings-adjacent profile/payment readouts where visual preference unsupported states may be appropriate.
- `apps/mobile/test/ui/settleora_component_guardrail_test.dart` and focused widget tests that already exercise theme/components/readout copy.

## M14 Acceptance Boundaries

- Built-in theme and component changes are presentation-only.
- Color, theme, accent, status color, palette, category/tag/group/dashboard/chart color, and appearance-mode readouts must not become authorization, financial truth, storage access, sync acceptance, audit truth, or security policy signals.
- Unsupported persisted visual settings must be clearly labeled as not implemented; fake save/apply/sync/admin controls are not allowed.
- System/light/dark appearance, custom palettes, admin deployment defaults, palette sharing, local-to-server visual preference migration, and server-mode preference persistence require future explicit API/schema/contracts/generated-client/policy tasks.
- Mobile can locally render built-in fallback tokens but cannot create server-mode source-of-truth preference records in M14.

## Planned Validation

M14 kickoff validation:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

Expected final controller dry run after kickoff: select `M14-001-MOBILE-VISUAL-THEME-ACCESSIBILITY-STATE-RECONCILE-20260616-2053`.

Future M14 implementation slices should add focused mobile validation and full `PATH=/opt/flutter/bin:$PATH npm run validate:mobile` when mobile runtime/test files change.

## Manual Review Status

- Manual UI retest: `deferred_until_day1_acceptance`; not passed.
- Manual code review: `deferred_until_day1_acceptance`; not passed.
- Hard safety gate: not triggered by kickoff because changes are limited to `.ai` control files, this QA map, and a narrow M14 scope-guard allowlist.

## Explicit Non-Goals

M14 kickoff and future M14 tasks must not implement:

- Backend/API visual preference endpoints.
- OpenAPI or generated-client changes.
- Database schema/migrations or persisted server-mode palette/preference storage.
- Admin/deployment default palette policy.
- Palette sharing, custom palette creation, or palette versioning runtime.
- Local-to-server preference import/link/migration.
- Auth/session/security runtime, authorization policy, audit-policy, storage/privacy/file-byte behavior, money/bill/settlement/payment/recurring/OCR/reconciliation authority, Docker/deployment/env/CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope reduction, or architecture replacement.
