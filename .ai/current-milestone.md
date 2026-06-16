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

- Current/next task: none; M13 is finalized and UI-test ready for deferred Day 1 acceptance review.
- Last completed task: `M13-004-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-QA-FINALIZE-20260616-1742`.
- Current state: M13-001 reconciliation, M13-002 cross-surface search/filter/readout hardening, M13-003 group workspace/dashboard readiness hardening, and M13-004 QA/control finalization are complete.
- Manual UI retest status: `deferred_until_day1_acceptance`; not passed by M13.
- Manual code review status: `deferred_until_day1_acceptance`; not passed by M13.
- Recommended next automated task: run the AI V3 controller for the next safe Day 1 action after M13 finalization, unless a stricter blocker is reported.
- Stop sentinel: `STOP-M13-001` stops major-domain, API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

## M13-004 QA Finalization Summary

M13 is finalized as `Day 1 Mobile Search, Filters, And Group Workspace Readiness` and marked UI-test ready for deferred Day 1 acceptance review.

Completed M13 slices:

- M13-001 reconciled current mobile search/filter and group workspace readiness state without runtime behavior changes.
- M13-002 hardened mobile cross-surface search/filter/readout states across current starter surfaces without API, generated-client, authorization, money, storage, sync, import/export, or broad offline behavior changes.
- M13-003 hardened mobile group workspace/dashboard readiness and group-context handoffs inside existing mobile seams without persistence, policy, API, authority, or runtime-domain expansion.
- M13-004 finalized control/QA state, recorded validation coverage, preserved deferred manual UI/code review, preserved `STOP-M13-001`, and set M13 to UI-test ready with no remaining automated M13 work.

Recorded M13 validation coverage:

- M13-002 rescue focused validation passed with 319 Flutter tests.
- M13-002 rescue full mobile validation passed with 716 Flutter tests.
- M13-003 rescue focused validation passed with 296 Flutter tests.
- M13-003 rescue full mobile validation passed with 716 Flutter tests.
- M13-004 final validation is recorded in the task report and QA map.

M13 did not implement backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or authorization policy, schema/migrations, storage/privacy/file-byte behavior, import/export/backup/migration runtime, money/bill/settlement/recurring/OCR/reconciliation authority, Docker/deployment/env/CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope reduction, dashboard personalization persistence, or architecture direction changes.

Manual UI retest and manual code review remain `deferred_until_day1_acceptance`, not passed by M13.

## M13 Kickoff Summary

M13 is queued as `Day 1 Mobile Search, Filters, And Group Workspace Readiness`.

The selection follows M12 finalization and the controller dry-run stop reason that M12 was already ready for deferred UI acceptance review. The next safe queue is a bounded mobile-readiness milestone because the repo already has starter mobile surfaces across bills, groups, settlements, recurring bills, notifications, monthly reports, receipt review, profile/session/settings, and dashboard shell code, while current Day 1/UX docs still call for advanced search/filter, group workspace/dashboard basics, contextual search/report routes, and action-before-navigation patterns.

M13 queue:

- `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742` - Completed. Reconciled current mobile search/filter and group workspace readiness state without runtime behavior changes.
- `M13-002-MOBILE-CROSS-SURFACE-SEARCH-FILTER-READOUT-HARDENING-20260616-1742` - Completed. Hardened mobile search/filter/readout states across current starter surfaces without API or authorization changes.
- `M13-003-MOBILE-GROUP-WORKSPACE-DASHBOARD-READINESS-HARDENING-20260616-1742` - Completed. Hardened group workspace/dashboard readiness and group-context handoffs inside existing mobile seams.
- `M13-004-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-QA-FINALIZE-20260616-1742` - Completed. Finalized M13 QA/control state after bounded slices completed.
- `STOP-M13-001` - Stop. Manual gate for major-domain, API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

M13 kickoff changes only `.ai` control files, the M13 QA map, and a narrow M13 scope-guard allowlist. It does not change runtime product behavior, backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, token issuance, refresh rotation, revocation semantics, password/credential/OIDC/MFA/passkey/recovery/registration/admin behavior, audit policy, schema/migrations, storage/privacy/file authorization, file byte behavior, real CSV import/export, local backup/restore, migration/link/disconnect/export runtime, money/bill/settlement/recurring/OCR/reconciliation authority, import-driven financial mutation, Docker/deployment/env/CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope, or architecture direction.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed. M13 is UI-test ready for deferred Day 1 acceptance review.

## M13-001 Reconciliation Summary

M13-001 completed docs/control-only reconciliation for current mobile search/filter, loaded-list readout, group workspace/dashboard readiness, route handoff, sync state, unsupported state, and automated coverage.

Current implementation findings:

- `apps/mobile/lib/app/server_mode_shell.dart` and `apps/mobile/lib/dashboard/` provide authenticated shell navigation, dashboard/readiness readouts, sync status, and route access to existing subject screens after current-user validation.
- `apps/mobile/lib/bills/bill_list_screen.dart` provides local search/filter controls for personal bills, group bills, bill details, member pickers, and sync queue readouts. These controls narrow already-loaded server rows and do not authorize records or compute financial truth.
- `apps/mobile/lib/groups/group_list_screen.dart` provides local group and member search/filter controls, group detail context, member management through repository seams, and group-bill handoff readiness.
- `apps/mobile/lib/settlements/settlement_list_screen.dart`, `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart`, `apps/mobile/lib/notifications/notification_screen.dart`, and `apps/mobile/lib/reports/monthly_report_screen.dart` provide local loaded-row filtering/search/readouts while preserving API authority for settlement state, recurring draft generation, notification linked-resource access, and monthly report totals.
- Receipt review handoffs remain route/repository-gated and provisional until server validation. Sync queue readouts remain limited to current personal bill queued/syncing/synced/failed/conflict operations, not broad offline cache hydration.

Automated coverage inventory:

- Existing focused tests cover shell/dashboard readouts, bill and group bill search/filter/detail states, group/member search/filter and group-bill handoffs, settlement search/filter/detail states, recurring search/filter/draft-generation readouts, notification filters/read/archive states, monthly report search/filter, receipt review handoffs, sync queue state, generated repository boundaries, and unsafe raw-detail suppression.
- M13-001 did not change mobile runtime or tests. M13 UI-test readiness was deferred to M13-004 finalization.

M13 queue state after M13-001:

- `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742` - Completed.
- `M13-002-MOBILE-CROSS-SURFACE-SEARCH-FILTER-READOUT-HARDENING-20260616-1742` - Completed.
- `M13-003-MOBILE-GROUP-WORKSPACE-DASHBOARD-READINESS-HARDENING-20260616-1742` - Completed.
- `M13-004-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-QA-FINALIZE-20260616-1742` - Completed.
- `STOP-M13-001` - Preserved.

## M13-002 Cross-Surface Search/Filter Readout Hardening Summary

M13-002 completed mobile cross-surface search/filter/readout hardening inside existing presentation seams.

Runtime/copy hardening:

- Group and member search/filter readouts now say they narrow loaded visible rows only, and that group labels, member labels, route state, hidden controls, dashboard visibility, and no-match results are not authorization or membership truth.
- Group bill filtered-empty copy now says current-user response filters are local UI guidance and the API decides response eligibility, authorization, and bill state.
- Settlement filtered-empty copy now says no-match means no loaded settlement requests match local filters, not a server search result, authorization result, settlement calculation, or settlement truth.
- Recurring template and forecast filtered-empty copy now says local filters narrow loaded templates/forecast occurrences only and that draft generation, recurrence, group access, participants, money, and audit remain API-authoritative.
- Monthly report filtered and empty readouts now preserve server-returned totals, bill count, reconciliation readouts, and settlement counts without recomputing report truth.
- Personal bill sync queue filtered-empty copy now says the queue covers current mobile bill operations only, not full offline cache hydration or server acceptance.

Focused automated coverage:

- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/recurring_bill_screen_test.dart` passed with 24 Flutter tests after viewport-sensitive assertion fixes.
- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/bill_list_screen_test.dart test/group_bill_list_screen_test.dart test/group_list_screen_test.dart test/settlement_list_screen_test.dart test/recurring_bill_screen_test.dart test/monthly_report_screen_test.dart` passed with 319 Flutter tests.
- M13-002 rescue validation reran focused changed-surface coverage with 319 Flutter tests passing and full mobile validation with 716 Flutter tests passing.
- Earlier focused attempts failed while tests still expected pre-hardening copy or needed scroll-aware assertions; those failures were corrected and rerun successfully.

M13 queue state after M13-002:

- `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742` - Completed.
- `M13-002-MOBILE-CROSS-SURFACE-SEARCH-FILTER-READOUT-HARDENING-20260616-1742` - Completed.
- `M13-003-MOBILE-GROUP-WORKSPACE-DASHBOARD-READINESS-HARDENING-20260616-1742` - Completed.
- `M13-004-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-QA-FINALIZE-20260616-1742` - Completed.
- `STOP-M13-001` - Preserved.

## M13-003 Group Workspace/Dashboard Readiness Hardening Summary

M13-003 completed mobile group workspace and dashboard readiness hardening inside existing presentation seams.

Runtime/copy hardening:

- Group detail now says group detail plus group bills is the current bounded mobile group workspace and that a full multi-section group dashboard with balances, pending actions, reports, recurring, notifications, receipt review, settlements, and settings is not implemented yet.
- Group detail directs users to existing shell routes for settlements, recurring bills, notifications, receipt reviews, reports, and sync status, while stating those subject screens reload through their own repository/API seams before mutation.
- Dashboard shell and dashboard preview copy now say dashboard cards are presentation hints only, not authorization, financial truth, sync acceptance, or full offline cache hydration.
- Unsupported saved group dashboard layouts, dashboard profiles, per-group defaults, dashboard personalization persistence, and saved cross-surface search/filter views are explicit.
- Group bill list empty/no-match/readout copy distinguishes loaded visible group rows from authorization, server search, complete group workspace, and financial truth.

Focused automated coverage:

- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/group_list_screen_test.dart` passed with 20 Flutter tests after correcting viewport-sensitive assertions.
- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/dashboard_preview_screen_test.dart test/server_mode_shell_dashboard_test.dart test/group_list_screen_test.dart test/group_bill_list_screen_test.dart` passed with 138 Flutter tests.
- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/bill_list_screen_test.dart` passed with 158 Flutter tests after a scroll-aware shell route assertion fix.
- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/dashboard_preview_screen_test.dart test/server_mode_shell_dashboard_test.dart test/group_list_screen_test.dart test/group_bill_list_screen_test.dart test/bill_list_screen_test.dart test/settlement_list_screen_test.dart test/recurring_bill_screen_test.dart test/notification_screen_test.dart test/monthly_report_screen_test.dart` passed with 418 Flutter tests.
- Earlier focused attempts failed while copy changes pushed member controls below the default viewport, one assertion counted a duplicated phrase, and one shell route tap needed scroll-aware handling after readiness copy lengthened the dashboard; those failures were corrected and rerun successfully.

M13 queue state after M13-003:

- `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742` - Completed.
- `M13-002-MOBILE-CROSS-SURFACE-SEARCH-FILTER-READOUT-HARDENING-20260616-1742` - Completed.
- `M13-003-MOBILE-GROUP-WORKSPACE-DASHBOARD-READINESS-HARDENING-20260616-1742` - Completed.
- `M13-004-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-QA-FINALIZE-20260616-1742` - Completed.
- `STOP-M13-001` - Preserved.

Manual UI retest and manual code review remain `deferred_until_day1_acceptance`, not passed. M13 is UI-test ready for deferred Day 1 acceptance review.
