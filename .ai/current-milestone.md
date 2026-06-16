# Current Milestone

- ID: `M13`
- Name: `Day 1 Mobile Search, Filters, And Group Workspace Readiness`
- Target branch: `ai/integration`
- Previous milestone ID: `M12`

## Goal

Advance the next bounded Day 1 mobile product surface after M12 by reconciling and hardening mobile search/filter and group workspace readiness inside existing mobile presentation seams. M13 is intentionally a mobile UX/readiness milestone: it may improve how current server-returned records are found, narrowed, grouped, and presented across existing starter mobile surfaces, but it must not add backend search APIs, OpenAPI/generated-client changes, schema, auth/security runtime, storage/privacy behavior, data-portability runtime, money/business authority, web/admin runtime, deployment, or broad offline cache/sync.

Repo-state basis for this milestone:

- `README.md` says mobile already has starter authenticated surfaces for personal bills, group bill read-only list/detail, group management, settlement balances/requests/payments, recurring templates/forecast/draft generation, in-app notifications, monthly reports, receipt review, first-launch local/server configuration, profile/payment, session/device management, and settings/data-portability readouts; it also says broader product UI, full offline cache hydration, web/admin portals, notification preferences/deep links/background delivery, reconciliation mutations, and data-portability runtime remain future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires advanced search/filter, group dashboard basics, monthly reports, reconciliation-related search/filter where available, explicit local/server boundaries, and no client-side transfer of backend authority for money, authorization, storage, status transitions, or audit.
- `docs/ux/UI_UX_FOUNDATION.md` says action-before-navigation, group-first/personal-aware flows, contextual routes for group detail, bill detail, receipt review, settlement, reports, search, and conflict review, and a group workspace with balances, recent bills, pending actions, receipt reviews, settlements, members, recurring/forecasting, reports, and group settings are Day 1 UX directions.
- `docs/ux/SCREEN_INVENTORY.md` identifies mobile Groups, Group Workspace, Search and Reports, Home Dashboard, Action Inbox, Sync/Conflict Review, and Settings as implementation-facing surfaces, while warning that future implementation must verify current backend/API support first.
- `docs/features/expenses-bills/FUNCTIONAL_SPEC.md` lists search/filter/report surfaces as part of the bills/expenses user goal and screen model, while preserving API authorization and safe visibility rules.
- `docs/features/sync-offline/FUNCTIONAL_SPEC.md` and `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` keep server-mode offline/search/readout behavior pending until API acceptance, preserve queued/failed/conflict states, and state that the current mobile app already has generated-client-backed seams for bills, groups, settlements, recurring bills, notifications, monthly reports, and receipt review.
- Current mobile code under `apps/mobile/lib/app/`, `apps/mobile/lib/bills/`, `apps/mobile/lib/groups/`, `apps/mobile/lib/settlements/`, `apps/mobile/lib/recurring_bills/`, `apps/mobile/lib/notifications/`, `apps/mobile/lib/reports/`, `apps/mobile/lib/dashboard/`, and focused tests under `apps/mobile/test/` provide bounded seams for mobile-only readout/search/filter/group workspace hardening without requiring API, OpenAPI, generated-client, schema, auth/security runtime, storage/privacy, real data-portability runtime, money, deployment, web/admin, or unrelated changes.

## Allowed Scope For Future M13 Tasks

- Reconciliation of current mobile search/filter affordances, list filtering, dashboard/group workspace entry points, group context readouts, and existing automated coverage in QA docs and focused tests.
- Mobile-only search/filter/readout hardening across existing server-returned list surfaces for bills, groups, settlements, recurring bills, notifications, monthly reports, dashboard, and current authenticated app shell routes.
- Mobile-only group workspace/dashboard readiness hardening for existing group list/detail/member context and links into existing bills, settlements, recurring/forecast, reports, notifications, receipt review, and settings surfaces.
- Bounded empty, unavailable, denied, stale, offline/queued/failed/conflict, unsupported, privacy/amount-hiding, and server-authority copy/states where they use existing mobile seams and do not add backend/API behavior.
- M13 QA map and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M13 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior, new server search endpoints, query semantics, authorization policy, or generated-client usage that requires contract changes.
- OpenAPI/generated clients.
- Auth/session/security runtime, token/credential/session issuance or revocation semantics, registration/bootstrap policy, OIDC/Keycloak, MFA, passkey, recovery, admin, or audit-policy changes.
- Database schema/migrations.
- Storage/file privacy policy, file authorization policy, private-vault behavior, file byte movement, CSV import/export, local backup/restore, local-to-server migration/link, server-to-local export/disconnect, statement import, or retention policy changes.
- Client-side authorization decisions from cached rows, hidden controls, route state, generated-client availability, local search/filter results, dashboard visibility, or group/member labels.
- Money, bill, settlement, recurring, OCR, reconciliation mutation, import-driven financial mutation, calculation authority, or business status-transition authority.
- Docker/deployment/env/CI config.
- Production secrets, credentials, tokens, `.env`, `.ssh`, `.codex`, or local auth/session config.
- Web/admin runtime UI, broad offline cache/sync, Day 1 scope reduction, architecture direction replacement, dashboard personalization persistence, or unrelated major-domain work.

## Done Criteria

- Current mobile search/filter and group workspace readiness state is reconciled against Day 1 requirements and captured in a QA map.
- Existing mobile list/search/filter/readouts clearly describe only visible server-returned or local presentation data and do not imply unauthorized discovery, broad offline cache hydration, data export/import, or server acceptance.
- Group workspace/readiness surfaces keep group context visible, link only to existing route seams, and revalidate through server-authorized subject screens before any mutation.
- Empty, denied, unavailable, stale, offline/queued/failed/conflict, privacy, and unsupported states are bounded and do not leak raw IDs, tokens, storage paths, provider payloads, private/vault internals, or unrelated records.
- Manual UI retest and manual code review remain deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.
- M13 ends in a bounded controller stop state before backend/API, OpenAPI/contracts, generated clients, schema, auth/security runtime, data-portability runtime, storage/privacy, money/settlement/bill/recurring/OCR/reconciliation authority, deployment, web/admin, broad offline sync/cache, import/export/backup/migration, dashboard personalization persistence, or unrelated major-domain work.

## Current Task Pointer

- Current task: `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742`.
- Last completed task: `M12-004-MOBILE-SETTINGS-MODE-DATA-PORTABILITY-QA-FINALIZE-20260616-1517`.
- Current state: M13 is queued as `Day 1 Mobile Search, Filters, And Group Workspace Readiness`.
- Manual UI retest status: `deferred_until_day1_acceptance`; not passed by M13.
- Manual code review status: `deferred_until_day1_acceptance`; not passed by M13.
- Recommended next automated task: run the AI V3 controller for `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742`.
- Stop sentinel: `STOP-M13-001` stops major-domain, API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

## M13 Kickoff Summary

M13 is queued as `Day 1 Mobile Search, Filters, And Group Workspace Readiness`.

The selection follows M12 finalization and the controller dry-run stop reason that M12 was already ready for deferred UI acceptance review. The next safe queue is a bounded mobile-readiness milestone because the repo already has starter mobile surfaces across bills, groups, settlements, recurring bills, notifications, monthly reports, receipt review, profile/session/settings, and dashboard shell code, while current Day 1/UX docs still call for advanced search/filter, group workspace/dashboard basics, contextual search/report routes, and action-before-navigation patterns.

M13 queue:

- `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742` - Queued. Reconcile current mobile search/filter and group workspace readiness state without runtime behavior changes.
- `M13-002-MOBILE-CROSS-SURFACE-SEARCH-FILTER-READOUT-HARDENING-20260616-1742` - Queued. Harden mobile search/filter/readout states across current starter surfaces without API or authorization changes.
- `M13-003-MOBILE-GROUP-WORKSPACE-DASHBOARD-READINESS-HARDENING-20260616-1742` - Queued. Harden group workspace/dashboard readiness and group-context handoffs inside existing mobile seams.
- `M13-004-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-QA-FINALIZE-20260616-1742` - Queued. Finalize M13 QA/control state after bounded slices complete.
- `STOP-M13-001` - Stop. Manual gate for major-domain, API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

M13 kickoff changes only `.ai` control files, the M13 QA map, and a narrow M13 scope-guard allowlist. It does not change runtime product behavior, backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, token issuance, refresh rotation, revocation semantics, password/credential/OIDC/MFA/passkey/recovery/registration/admin behavior, audit policy, schema/migrations, storage/privacy/file authorization, file byte behavior, real CSV import/export, local backup/restore, migration/link/disconnect/export runtime, money/bill/settlement/recurring/OCR/reconciliation authority, import-driven financial mutation, Docker/deployment/env/CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope, or architecture direction.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed. Recommended next automated task is `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742`.
