# M13 Mobile Search, Filters, And Group Workspace QA Map

Status: `M13-001 completed; M13-002 current; manual UI/code review deferred until Day 1 acceptance`

## Purpose

Record the completed M13-001 current-state reconciliation for mobile search/filter, loaded-list readouts, group workspace/dashboard readiness, route handoffs, sync state, unsupported states, and automated coverage.

M13 remains bounded to mobile presentation/readiness seams. This map does not authorize backend/API behavior, new server search endpoints, OpenAPI/generated-client changes, schema/migration changes, auth/session/security runtime or authorization-policy changes, storage/privacy/private-vault/file-byte behavior, import/export/backup/migration/runtime portability, money/settlement/bill/recurring/OCR/reconciliation authority, deployment, Docker, CI, secrets, web/admin runtime, broad offline cache/sync, Day 1 scope reduction, architecture replacement, or dashboard personalization persistence.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M13-001. M13 is not UI-test ready until M13-004 finalization.

## Source Documents

- `PROGRAM_ARCHITECTURE.md` keeps server/cloud mode API-authoritative for auth, authorization, money, status transitions, file access, sync acceptance, and audit.
- `README.md` records current mobile starter surfaces for authenticated personal bills, group bills, groups, settlements, recurring bills, notifications, monthly reports, receipt review, profile/payment, session/device, first-launch local/server configuration, and settings/data-portability readouts, while broader product UI, full offline cache hydration, web/admin portals, notification preferences/deep links/background delivery, reconciliation mutations, and data-portability runtime remain future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires advanced search/filter, monthly reports, group dashboard basics, reconciliation-related search/filter where available, explicit local/server boundaries, and API/domain authority for money, authorization, storage, status transitions, and audit.
- `docs/ux/UI_UX_FOUNDATION.md` requires group-first/personal-aware UX, action-before-navigation, contextual routes for search and group detail, and group workspace readouts for balances, recent bills, pending actions, receipt reviews, settlements, members, recurring/forecasting, reports, and settings.
- `docs/ux/SCREEN_INVENTORY.md` identifies mobile Groups, Group Workspace, Search and Reports, Home Dashboard, Action Inbox, Sync/Conflict Review, and Settings as implementation-facing surfaces and says future implementation must verify current backend/API support first.
- `docs/features/expenses-bills/FUNCTIONAL_SPEC.md` lists search/filter/report surfaces as part of the expenses/bills user goal while preserving API authorization and safe visibility.
- `docs/features/sync-offline/FUNCTIONAL_SPEC.md` requires queued, synced, conflict, and failed states to remain visible and local pending edits to be preserved until resolved.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` records generated-client-backed mobile seams for bills, groups, settlements, recurring bills, notifications, monthly reports, and receipt review, while keeping full offline cache hydration, broad sync conflict review UI, broader dashboard UI, and major domain runtime as separate future slices.

## Existing Surface Inventory

| Surface | Current implementation | M13-001 reconciliation |
|---|---|---|
| App shell, bottom navigation, dashboard readouts | `apps/mobile/lib/app/server_mode_shell.dart` routes signed-in users to dashboard, bills, groups, settlements, recurring, notifications, reports, receipt review, profile/session/settings, and shows sync status/readiness cards. `apps/mobile/lib/dashboard/dashboard_preview_screen.dart` provides dashboard preview/readiness controls. | Navigation and dashboard readouts are presentation-only. They summarize loaded repository data and route into existing subject screens after current-user validation; they do not authorize access, persist dashboard personalization, or compute business truth. |
| Personal bills | `apps/mobile/lib/bills/bill_list_screen.dart` has personal bill list/detail/create/edit, local loaded-row search, status/archive filters, detail-row filters, attachments, receipt OCR review handoff, revision screens, and personal archive/restore sync queue actions. | Existing search/filter is per-screen local narrowing of already-loaded server rows. Personal archive/restore can queue through the existing bill sync queue, but the API remains authoritative when flushed. |
| Group bills | `apps/mobile/lib/bills/bill_list_screen.dart` has group bill list/detail/create/edit surfaces and group-context copy. Group bill list/detail include local search/filter and detail-row filters. | Group bill search/filter uses already-loaded group-scoped rows and route context. Group visibility, mutation eligibility, bill status, participant state, and money remain server-authoritative. |
| Groups and members | `apps/mobile/lib/groups/group_list_screen.dart` lists groups, supports local group search plus role/status chips, opens group detail, loads members, supports member search plus role/status chips, and exposes member management through the repository seam. | Group/member filtering is loaded-row presentation only. Group labels, member rows, hidden controls, and route state are not authorization. |
| Settlements | `apps/mobile/lib/settlements/settlement_list_screen.dart` shows balances, request list/detail, request-line search, payment/residual search, status/action filters, and conservative online-only request/payment/residual actions. | Settlement filtering narrows loaded requests, lines, payments, and residuals only. The UI does not expand baskets, decide eligibility, calculate settlement totals, allocate payments, reconcile residuals, or authorize transitions. |
| Recurring templates, forecast, draft generation | `apps/mobile/lib/recurring_bills/recurring_bill_screen.dart` shows template and forecast lists with local search and filter chips, detail readouts, create/edit forms, and explicit draft-generation actions. | Forecast/search rows are estimates/readouts over server-returned data. Draft generation remains explicit and online, and the API revalidates recurrence, group access, payload, participants, money, and audit. |
| Notifications | `apps/mobile/lib/notifications/notification_screen.dart` shows summary/list/read/archive controls and local filters for loaded notification rows. | Notification filters do not authorize linked resources. Future deep links must re-fetch bills, settlements, recurring, reports, or receipt reviews through their own authorized seams before mutation. |
| Monthly reports | `apps/mobile/lib/reports/monthly_report_screen.dart` shows monthly aggregate sections with local search/filter discovery across loaded report rows. | Monthly report totals and bill count remain server-returned. Search/filter only hides visible loaded rows and does not recompute money, reconciliation, categories, or business status. |
| Receipt review | Receipt review exists under `apps/mobile/lib/receipt_ocr_review/` and bill attachment OCR handoff appears in `apps/mobile/lib/bills/bill_list_screen.dart`. | Receipt review and saved-review handoffs remain route/repository-gated. OCR-derived data is provisional until server validation and does not auto-finalize or authorize bill changes. |
| Sync queue/status | `apps/mobile/lib/sync/` and bill list/shell readouts show bounded personal bill sync queue states: queued/syncing, synced, failed, and conflict/needs review. | Sync readouts cover current queued personal bill operations only. They are not full offline cache hydration, broad conflict review, import/export, backup/restore, or proof of server acceptance for all local data. |

## Existing Search And Filter Affordances

- Personal bill list: text search plus filters for all, active, needs review, and archived loaded server rows. Filtered-empty copy says no already-loaded personal bills match and asks users to clear filters to review loaded rows.
- Group bill list: text search plus group-bill filters over already-loaded group-scoped bill rows, with separate group context and filtered-empty copy.
- Personal and group bill detail: text search plus detail filters for all, items, participants, needs response, rejected, payers, and adjustments. Empty/no-match copy distinguishes no loaded detail rows matching local filters from true absence.
- Bill participant picker/member surfaces: member search narrows loaded active group members and does not imply absent authorization or complete membership discovery.
- Group list: text search plus role/status chips over loaded groups. Search matches safe display fields, not raw IDs.
- Group detail members: text search plus role/status chips over loaded member rows. Actions target the visible selected member but are still submitted through the repository/API seam.
- Settlement list: text search plus status/action filters over loaded requests. Search excludes raw identifiers in tests.
- Settlement detail: request-line search and payment/residual search/filter controls narrow already-loaded rows only.
- Recurring bill list: search terms and template/forecast filters narrow loaded templates and forecast occurrences.
- Notification list: filter chips show all, unread, read, archived, and action-needed loaded rows; archived rows appear only in the archived filter.
- Monthly report: search plus discovery filters narrow loaded report rows while preserving server-returned monthly aggregate totals.
- Dashboard preview: local selection/readiness controls are preview/readout only and are not persisted dashboard personalization.
- Sync queue: filter chips narrow loaded queue items by pending, failed, conflict/needs review, and synced.

Current search/filter state is per-screen widget state. It is not global search, not route-shared search, not persisted search, not a server query contract, and not cross-surface saved views. M13-002 should harden copy/tests for these existing per-screen local readouts where gaps remain, without adding backend search semantics.

## Empty, No-Match, Denied, Unavailable, Stale, Offline, And Conflict State

- Present distinctions: many inspected surfaces already map denied, unavailable, conflict, server/network failure, validation/rejected, session-required, and session-expired states into bounded messages. List surfaces generally separate true empty loaded lists from filtered-empty/no-match states.
- Present sync states: queued, syncing, synced, failed, and conflict/needs-review readouts exist for the current mobile bill sync queue.
- Missing or partial distinctions: there is no global stale-data model, no broad offline cache hydration readout, no full sync conflict review UI, no server-search no-result semantics, no unsupported saved-view/export/search endpoint state, and no route-shared no-match state across surfaces.
- Safety interpretation: an empty search result means no currently loaded visible row matched local filters. It does not prove no authorized record exists on the server, no hidden record exists, no server-side search result exists, or no future route could load additional authorized data.

## Group Workspace And Dashboard Readiness

Current entry points:

- Bottom navigation opens Groups and Dashboard from the authenticated server shell.
- Group list opens group detail and supports create/edit group flows through the generated-client-backed group repository.
- Group detail shows group context, loaded member counts, member search/filter/actions, and a handoff into group bills.
- Group bill list/detail preserves group context and exposes group-scoped bill list/detail/create/edit/revision/receipt-review paths inside the existing bill repository seams.
- Settlement, recurring, notifications, reports, receipt review, and dashboard routes are available from the authenticated shell as separate surfaces.

Existing handoffs:

- Implemented direct handoff: group detail to group bill workspace/list.
- Implemented route surfaces available from shell: settlements, recurring/forecast/draft generation, monthly reports, notifications, receipt review, dashboard preview/readiness, sync status.
- Implemented subject handoffs inside surfaces: bill attachment to receipt review, settlement request to payment/residual detail, recurring template to forecast/detail/draft generation.

Not implemented and must remain future work:

- A full multi-section group workspace dashboard combining balances, bills, pending actions, receipt reviews, settlements, members, recurring/forecasting, reports, notifications, and settings in one group-scoped operating view.
- Group dashboard personalization persistence, saved dashboard profiles, per-group dashboard defaults, and cross-surface saved search/filter views.
- Notification deep links/background delivery, push/device-token/preferences, and linked-resource mutation from notification metadata.
- Group-scoped monthly report/dashboard aggregation beyond current route/readout seams.
- Broad sync conflict center, offline cache hydration, local-mode group collaboration, import/export/backup/migration runtime, and reconciliation mutation.

M13-003 should harden the group workspace/dashboard readiness copy and route handoffs inside these existing seams without adding policy, persistence, server APIs, or new authority.

## Authority And Safety Boundaries

- Search/filter results are visible loaded/readout records only.
- Empty search results do not prove no authorized records exist.
- Group/dashboard visibility does not authorize access.
- Generated-client availability does not authorize data access.
- Local group/member labels, hidden buttons, route state, cached rows, notification metadata, sync queue items, dashboard cards, and local search/filter results are not permission signals.
- Search/filter/dashboard UI must not compute money, settlement totals, bill shares, recurring forecast truth, OCR application truth, reconciliation status, archive/restore authority, or business status transitions.
- Linked subject screens must revalidate through existing server-authorized repository/API seams before mutation.
- Server-mode APIs remain authoritative for actor identity, authorization, membership visibility, money, storage/file access, OCR-review apply eligibility, settlement/recurring/bill status transitions, sync acceptance, and audit.

## Automated Coverage Inventory

Relevant existing tests and current coverage:

- `apps/mobile/test/widget_test.dart`: first-launch, sign-in/current-user, authenticated shell, and setup/session route boundaries.
- `apps/mobile/test/server_mode_shell_dashboard_test.dart`: dashboard/shell readouts, sync status, settings/readiness, and shell route access.
- `apps/mobile/test/dashboard_preview_screen_test.dart`: dashboard preview/readiness controls and non-persistent presentation behavior.
- `apps/mobile/test/bill_list_screen_test.dart`: personal bills, bill detail, search/filter, detail-row filters, create/edit, attachments, receipt-review handoffs, sync queue presentation, bounded failures, and unsafe raw-detail suppression.
- `apps/mobile/test/group_bill_list_screen_test.dart`: group bill list/detail search/filter, group context, participant/readout states, acknowledgement/revision-related behaviors where present.
- `apps/mobile/test/group_list_screen_test.dart`: group list search/filter, group detail/member search/filter, group bill handoff, member actions, bounded failures, and raw ID suppression.
- `apps/mobile/test/settlement_list_screen_test.dart`: settlement balances, list search/filter, request detail line/payment filters, role/action safety copy, denial/unavailable/conflict failure mapping, and raw identifier search suppression.
- `apps/mobile/test/recurring_bill_screen_test.dart`: recurring template and forecast readouts, search/filter behavior, draft-generation readouts/actions, and bounded failure states.
- `apps/mobile/test/notification_screen_test.dart`: notification summary/list filters, read/archive actions, visible-loaded-row boundaries, archived/action-needed filters, refresh-after-action states, and linked-resource safety copy.
- `apps/mobile/test/monthly_report_screen_test.dart`: monthly report aggregate/readout behavior, local search/filter discovery, filtered-empty copy, and server-total authority copy.
- `apps/mobile/test/sync_queue_test.dart`, `apps/mobile/test/bill_sync_controller_test.dart`, and `apps/mobile/test/*generated_repository_test.dart`: queue state model, sync processor/controller boundaries, and generated repository failure mapping for current seams.
- `apps/mobile/test/receipt_ocr_review_screen_test.dart` and `apps/mobile/test/receipt_ocr_review_generated_repository_test.dart`: receipt review queue/detail/edit/apply-preview/apply boundary behavior outside the main search/filter inventory.

Coverage gaps for M13-002:

- Cross-surface consistency that every local search/filter no-match state says loaded/visible rows only.
- Focused assertions that search/filter does not match raw IDs, file IDs, session tokens, provider payloads, storage paths, or generated-client internals on every relevant surface.
- Consistent clear-filter behavior and loaded-count/visible-count readouts across bills, groups, settlements, recurring, notifications, reports, and sync queue.
- Explicit unsupported/global-search/saved-view/server-search copy where the UI might otherwise imply advanced Day 1 search is complete.

Coverage gaps for M13-003:

- Group workspace readiness copy tying group detail, group bill list/detail, dashboard preview, reports, recurring, notifications, receipt review, settlement, and sync routes together without implying a complete group dashboard.
- Assertions that group dashboard/readiness handoffs revalidate through subject routes and do not infer access from group labels, member rows, dashboard cards, or notification metadata.
- Unsupported group dashboard personalization persistence and saved-layout copy.
- Empty/denied/unavailable/offline/conflict distinctions for group-context handoffs where current coverage is shallow.

Expected later focused tests:

- M13-002: focused widget tests for all changed search/filter/readout copy and then full `validate:mobile`.
- M13-003: focused widget tests for group workspace/dashboard readiness and handoff copy plus full `validate:mobile`.
- M13-004: docs/control finalization after M13-002 and M13-003 pass, preserving deferred manual UI/code review status.

## Stop Conditions

Stop and report `BLOCKED` if M13 work requires:

- Backend/API behavior or new server search endpoints.
- OpenAPI/contracts or generated-client changes.
- Database schema or migrations.
- Auth/session/security runtime, token/credential/session behavior, registration/bootstrap policy, authorization policy, OIDC/Keycloak, MFA, passkey, recovery, admin, or audit-policy changes.
- Storage/privacy/file-byte behavior, file authorization policy, private-vault behavior, CSV import/export, local backup/restore, local-to-server migration/link, server-to-local export/disconnect, statement import, data migration, retention policy, or storage-provider changes.
- Client-side authorization from cached rows, hidden controls, route state, generated-client availability, local search/filter results, dashboard visibility, group labels, or member labels.
- Money/bill/settlement/recurring/OCR/reconciliation mutation, calculation authority, import-driven financial mutation, or business status-transition authority.
- Dashboard personalization persistence.
- Docker/deployment/env/CI changes.
- Secrets, tokens, credentials, `.env`, `.ssh`, `.codex`, local auth/session config, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

## Queue State After M13-001

- `M13-001-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-STATE-RECONCILE-20260616-1742` - Completed. Current-state reconciliation only; no runtime behavior or test changes.
- `M13-002-MOBILE-CROSS-SURFACE-SEARCH-FILTER-READOUT-HARDENING-20260616-1742` - Current/next. Harden cross-surface mobile search/filter/readout states inside existing seams.
- `M13-003-MOBILE-GROUP-WORKSPACE-DASHBOARD-READINESS-HARDENING-20260616-1742` - Queued. Harden group workspace/dashboard readiness and handoffs inside existing seams.
- `M13-004-MOBILE-SEARCH-FILTER-GROUP-WORKSPACE-QA-FINALIZE-20260616-1742` - Queued. Finalize M13 QA/control state after bounded slices complete.
- `STOP-M13-001` - Preserved stop sentinel for major-domain, API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.
