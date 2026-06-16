# M13 Mobile Search, Filters, And Group Workspace QA Map

Status: `M13 queued; M13-001 current; manual UI/code review deferred until Day 1 acceptance`

## Purpose

Define the QA/control boundary for M13 `Day 1 Mobile Search, Filters, And Group Workspace Readiness`.

M13 reconciles and hardens mobile search/filter and group workspace readiness inside existing mobile seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security runtime changes, storage/privacy or private-vault changes, real CSV import/export, local backup/restore, local-to-server migration, server-to-local export/disconnect, file byte movement, retention policy, money/settlement/bill/recurring/OCR/reconciliation authority, deployment, Docker, CI, secrets, web/admin runtime UI, broad offline cache/sync work, or dashboard personalization persistence.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M13.

## Source Documents

- `README.md` records current mobile starter surfaces for authenticated bills, groups, settlements, recurring bills, notifications, monthly reports, receipt review, profile/payment, session/device, first-launch local/server configuration, and settings/data-portability readouts, while broader product UI, full offline cache hydration, web/admin portals, notification preferences/deep links/background delivery, reconciliation mutations, and data-portability runtime remain future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires advanced search/filter, group dashboard basics, monthly reports, reconciliation-related search/filter where available, explicit local/server boundaries, and API/domain authority for money, authorization, storage, status transitions, and audit.
- `docs/ux/UI_UX_FOUNDATION.md` requires group-first/personal-aware UX, action-before-navigation, contextual routes for search and group detail, and group workspace readouts for balances, recent bills, pending actions, receipt reviews, settlements, members, recurring/forecasting, reports, and settings.
- `docs/ux/SCREEN_INVENTORY.md` identifies mobile Groups, Group Workspace, Search and Reports, Home Dashboard, Action Inbox, Sync/Conflict Review, and Settings as implementation-facing surfaces and says future implementation must verify current backend/API support first.
- `docs/features/expenses-bills/FUNCTIONAL_SPEC.md` lists search/filter/report surfaces as part of the expenses/bills user goal while preserving API authorization and safe visibility.
- `docs/features/sync-offline/FUNCTIONAL_SPEC.md` requires queued, synced, conflict, and failed states to remain visible and local pending edits to be preserved until resolved.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` records generated-client-backed mobile seams for bills, groups, settlements, recurring bills, notifications, monthly reports, and receipt review, while keeping full offline cache hydration, broad sync conflict review UI, broader dashboard UI, and major domain runtime as separate future slices.
- `PROGRAM_ARCHITECTURE.md` keeps server/cloud mode API-authoritative for auth, authorization, money, status transitions, file access, sync acceptance, and audit.

## Current Implementation Basis To Reconcile In M13-001

- App shell: `apps/mobile/lib/app/server_mode_shell.dart` provides the authenticated mobile shell, bottom navigation, profile/session/settings entry points, sync-status readout, and route handoffs after current-user validation.
- Bills: `apps/mobile/lib/bills/` provides starter personal bill list/detail, group bill read-only list/detail, bill archive/restore queue actions for personal bills, attachment sections, and bill revision proposal/review screens.
- Groups: `apps/mobile/lib/groups/` provides group list/detail/member management through generated-client-backed seams. Group visibility and member mutation remain server-authoritative.
- Settlements: `apps/mobile/lib/settlements/` provides settlement balance/request/payment detail readouts and conservative online-only actions.
- Recurring bills: `apps/mobile/lib/recurring_bills/` provides template list/detail, forecast, and explicit draft-generation handoff readouts.
- Notifications: `apps/mobile/lib/notifications/` provides current-user notification summary/list/read/archive readouts; linked resources must still re-fetch through authoritative routes before mutation.
- Reports: `apps/mobile/lib/reports/` provides monthly report readouts without recomputing financial truth.
- Dashboard: `apps/mobile/lib/dashboard/` and the server-mode shell provide dashboard/readiness seams for current mobile navigation and summary surfaces.
- Sync: `apps/mobile/lib/sync/` provides current queue states for server-mode queued personal bill operations; it is not full offline cache hydration or broad conflict review.

## Day 1 Requirement Map

| Day 1 requirement | Current repo state | M13 implication |
|---|---|---|
| Advanced search/filter | Current mobile starter surfaces have bounded list/readout seams, but no broad authoritative server search endpoint is authorized by this milestone. | M13-001 should inventory current affordances; M13-002 may harden mobile-only visible-record search/filter/readout states without backend/API changes. |
| Group dashboard basics | Mobile groups and dashboard shell exist, while broader group workspace/product UI remains future work. | M13-003 may harden group context, empty states, and handoffs into existing bills/settlements/recurring/reports/notifications routes without adding group policy or persistence. |
| Search/report contextual routes | Monthly report, bills, groups, settlements, recurring, notifications, and receipt review routes exist. | M13 should keep navigation contextual and avoid implying global discovery of unauthorized records. |
| Reconciliation-related search/filter where available | Monthly report readout exists; reconciliation mutations and statement import remain future work. | M13 must not add statement import or reconciliation mutation; any reconciliation copy remains readout/unsupported only. |
| Offline/sync states | Current sync queue readout covers bounded personal bill queued/synced/failed/conflict states only. | Search/filter/group readouts must not imply full offline cache hydration or server acceptance of all local data. |
| API/domain authority | Server-mode APIs remain authoritative for authorization, money, storage, audit, and mutation. | UI search/filter/dashboard visibility must not become authorization or financial truth. |

## Planned Queue

- `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742`: Reconcile current mobile search/filter and group workspace readiness implementation and tests without runtime changes.
- `M13-002-MOBILE-CROSS-SURFACE-SEARCH-FILTER-READOUT-HARDENING-20260616-1742`: Harden mobile cross-surface search/filter/readout states across existing starter surfaces without API, generated-client, or authorization changes.
- `M13-003-MOBILE-GROUP-WORKSPACE-DASHBOARD-READINESS-HARDENING-20260616-1742`: Harden mobile group workspace/dashboard readiness and group-context handoffs inside current mobile app seams.
- `M13-004-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-QA-FINALIZE-20260616-1742`: Finalize QA/control state and mark M13 UI-test ready only after bounded slices complete.
- `STOP-M13-001`: Manual gate for major-domain, API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

## QA Focus

- Search and filter results must be described as visible loaded/readout records, not proof that no other authorized records exist.
- Empty results must distinguish no visible loaded matches from denied, unavailable, stale, offline, or unsupported states.
- Group workspace/readiness surfaces must keep group context visible without deriving authorization from cached group/member rows or route state.
- Dashboard/group links must deep-link only to existing authoritative subject screens and should revalidate before mutation.
- Monthly report, settlement, recurring, notification, receipt review, and bill readouts must not recompute money or business status.
- Sync copy must keep queued/synced/failed/conflict semantics limited to current supported queue behavior.
- Unsupported export/import/backup/migration/reconciliation behavior must remain clearly non-runtime.
- Tests should suppress unsafe implications: raw secrets, session IDs, tokens, provider payloads, storage paths, vault internals, automatic data discovery, unauthorized record leakage, export-as-authorization-bypass, backup-as-retention-bypass, or client-side permission decisions from cached state.

## Validation Expectations

- M13-001 docs/control reconciliation should run `git diff --check`, scope guard, docs/scaffold/OpenAPI validation, mobile doctor, and a final controller dry run. Full Flutter validation is not required unless mobile tests/runtime files change.
- M13-002 and M13-003 should run focused Flutter tests for every mobile copy/state they change, plus full `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`.
- M13-004 should finalize QA/control only after M13-002 and M13-003 pass their validation, keep manual UI/code review deferred until Day 1 acceptance, and only then mark M13 UI-test ready.

## Stop Conditions

Stop and report `BLOCKED` if an M13 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, token/credential/session policy, registration/bootstrap policy, OIDC/MFA/passkey/recovery/admin behavior, audit-policy changes, schema/migrations, real CSV import/export, local backup/restore, local-to-server migration/link, server-to-local export/disconnect, statement import, data migration, file byte movement, storage/file privacy policy, file authorization policy, private-vault behavior, retention policy, money/bill/settlement/recurring/OCR/reconciliation authority, import-driven financial mutation, dashboard personalization persistence, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M13.

Recommended next automated action: run the AI V3 controller for `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742`.
