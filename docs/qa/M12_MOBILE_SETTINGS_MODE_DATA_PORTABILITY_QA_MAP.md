# M12 Mobile Settings, Mode Boundary, And Data Portability QA Map

Status: `M12-001 reconciled; M12-002 selected; manual UI/code review deferred until Day 1 acceptance`

## Purpose

Define the QA/control boundary for M12 `Day 1 Mobile Settings, Mode Boundary, And Data Portability Readiness`.

M12 hardens mobile settings-adjacent UX and mode-boundary readouts inside existing mobile seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security runtime changes, storage/privacy or private-vault changes, real CSV import/export, local backup/restore, local-to-server migration, server-to-local export/disconnect, file byte movement, retention policy, money/settlement/bill/recurring/OCR/reconciliation authority, deployment, Docker, CI, secrets, web/admin runtime UI, or broad offline cache/sync work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M12.

## Source Documents

- `README.md` records current mobile first-launch local/server configuration, secure-storage-backed app/session state, authenticated server shell, profile/payment, session/device, sync, and other starter surfaces.
- `docs/prd/MVP_DAY1_SCOPE.md` requires CSV export, CSV import, local backup/restore, explicit sync/offline state, and no silent merge between local-only and server/cloud authority boundaries.
- `docs/ux/UI_UX_FOUNDATION.md` requires clear local/server mode boundaries, explicit local-to-server import/link, explicit server-to-local export/disconnect, and no silent local profile conversion into a server account.
- `docs/ux/SCREEN_INVENTORY.md` identifies mobile Settings as the surface for user preferences, privacy, local/server mode, exports, account/session access, and destructive warnings.
- `docs/architecture/USER_EXPERIENCE_MODES_ARCHITECTURE.md` says presets/toggles change workflow depth only and do not change backend financial truth, authorization, storage access, policy, or audit.
- `PROGRAM_ARCHITECTURE.md` keeps server/cloud mode API-authoritative for auth, authorization, money, status transitions, file access, sync acceptance, and audit.

## M12-001 Current Implementation Reconciliation

M12-001 verified the current mobile state against repo code and tests without changing runtime files.

- First launch/setup: `apps/mobile/lib/app/setup_screen.dart` presents `Connect` and `Local` mode choices, defaults to server mode when no configuration exists, validates server base URLs through `validateServerBaseUri`, rejects relative URLs, credentials, query strings, fragments, unsupported schemes, and non-local HTTP, and labels localhost/loopback HTTP as local-development-only.
- Local mode setup copy: `setup_screen.dart` currently says local mode keeps the device separate and that server collaboration, friends, groups, and server sync are unavailable until local runtime exists. This copy establishes the boundary, but M12-002 should make the no-server-account/no-automatic-migration boundary more explicit.
- Bootstrap/app routing: `apps/mobile/lib/app/app_bootstrap.dart` reads secure app configuration, routes unconfigured installs to setup, persists local/server configuration, clears any saved server session after configuration changes, shows a local-mode placeholder screen, and offers `Connect to Server` from local mode. It does not create a server repository for local mode.
- Server configuration/change-server entry points: bootstrap exposes `Change Server` after current-user validation failures and sign-in exposes its existing change-server path. Saving any new configuration clears the saved server session. Current copy does not yet fully explain that changing server does not import/link local data or preserve authority across servers.
- Server-mode authenticated shell: `apps/mobile/lib/app/server_mode_shell.dart` is entered only after saved server configuration plus usable session/current-user validation. It shows authenticated account context and entry points for profile, sessions/devices, sign-out, bills, groups, settlements, recurring bills, notifications, monthly report, receipt review, and sync status.
- Sync status readout: `server_mode_shell.dart` reads the bill sync queue snapshot and conditionally shows pending, failed, and conflict counts with `Sync now` only when retryable pending/failed work exists. It does not represent full offline cache hydration, broad conflict resolution, import/export, backup/restore, or server acceptance beyond the existing queued operation result states.
- Profile/account settings-adjacent surface: `apps/mobile/lib/profile/profile_screen.dart` exposes current profile and payment details through `SettleoraProfileRepository`, including server-returned payment visibility copy, metadata-only QR readout, session-ended routing, bounded failures, edit/save states, and refresh-after-save behavior. It already states that visibility is a server-returned profile fact, not a client-side authorization decision.
- Generated profile repository seam: `apps/mobile/lib/profile/generated_profile_repository.dart` reads the access token per call, normalizes profile/payment update input, maps generated-client responses into hand-written models, suppresses raw generated/transport details, and exposes QR metadata only. Generated-client availability does not authorize profile/payment access.
- Secure storage: `apps/mobile/lib/app/secure_storage.dart` stores app configuration and server session material under bounded keys. It is not local backup/export, server-to-local export, local-to-server migration, retention, private-vault, or data portability runtime.
- Data-portability readiness: no inspected mobile runtime path implements real CSV import/export, local backup/restore, local-to-server migration/link, server-to-local export/disconnect, destructive portability actions, file byte movement, or retention/policy bypass. M12-003 may add unsupported/readiness readout copy only inside existing settings/profile/account seams.

## Day 1 Requirement Map

| Day 1 requirement | Current reconciled state | M12 implication |
|---|---|---|
| Explicit local/server boundaries | First-launch and local-mode placeholder copy exist; local mode does not create generated repositories or server sessions. | M12-002 should harden copy/tests so local mode is device-bound and not silently linked to a server account. |
| Server-mode authority | Authenticated shell routes through saved server configuration, access-token refresh, and current-user/session validation before server-mode surfaces appear. | M12-002 should harden copy/tests so server mode remains API-authoritative for collaboration, auth/session, authorization, sync acceptance, money, storage, audit, and policy. |
| Settings surface for account/session/mode | A dedicated broad Settings module does not exist. Settings-adjacent access currently lives in setup/bootstrap change-server, authenticated shell profile/session/sign-out entries, sync status, and profile/payment screens. | M12-002/M12-003 should harden existing entry points and avoid inventing broad settings architecture. |
| CSV import/export | Day 1 PRD requires it, but current mobile runtime has no CSV import/export implementation or placeholder control. | M12-003 may add unsupported/readiness copy only; real import/export is a stop condition. |
| Local backup/restore | Day 1 PRD requires it, but current secure storage is configuration/session storage only. | M12-003 may add unsupported/readiness copy only; real backup/restore is a stop condition. |
| Local-to-server migration/import/link | UX docs require explicit guided flow; current local mode only offers connect-to-server setup and does not migrate local data. | M12-002/M12-003 should clarify migration is not automatic; real migration/import/link runtime is a stop condition. |
| Server-to-local export/disconnect | UX docs require explicit guided flow; current sign-out/change-server/local-clear paths are session/configuration flows, not export/disconnect runtime. | M12-003 may clarify export/disconnect is not a retention/authorization bypass; real runtime is a stop condition. |
| No silent merge between local-only and server/cloud data | Current implementation clears saved server session when app configuration changes and local mode does not instantiate server repositories. | Future slices should preserve this and add copy/tests that no local profile/device state silently becomes server/cloud data. |
| Privacy and experience mode boundaries | Architecture docs define future direction only; current mobile profile/payment readout notes API authorization controls visibility. | M12 must avoid privacy-mode/private-vault/runtime policy changes and any hidden authority from UI modes. |

## Automated Coverage Inventory

- `apps/mobile/test/app_configuration_test.dart` covers server URL normalization, local-development HTTP warnings, rejection of relative URLs, URL credentials/query/fragment rejection, non-local HTTP rejection, and server configuration JSON round trips.
- `apps/mobile/test/widget_test.dart` covers default setup routing, local mode save without creating server repositories, local-mode placeholder copy, invalid server URL rejection, server configuration without a session showing sign-in, successful sign-in storing session and reaching the server shell, verified saved session opening the shell, expired access-session refresh before shell, safe sign-in failures, current-user failure/retry/change-server paths, session expiry clearing local session, sign-out flows, and unsafe credential/detail suppression.
- `apps/mobile/test/server_mode_shell_dashboard_test.dart` covers authenticated shell dashboard/profile/session entry points, canonical bottom navigation, sync status card visibility, pending sync count, failed/conflict attention state, sync-now behavior, duplicate sync suppression, conflict-only no-retry behavior, opening bills from sync status, returning from bills refreshing sync status, and sync snapshot storage failure behavior.
- `apps/mobile/test/sync_queue_test.dart` covers sync queue serialization, queue capacity, safe archive/restore queue payloads, secure queue persistence, no-session flush behavior, queued/syncing/synced/failed/conflict states, retryable failures, duplicate in-flight flush reuse, generated sync operation mapping, bounded generated failure mapping, network failure mapping, and change-feed metadata mapping.
- `apps/mobile/test/profile_screen_test.dart` covers authenticated shell opening profile, profile/payment details readout, server-returned payment visibility descriptions, non-global/API-authority copy, empty payment detail states, metadata-only QR readout, unsafe raw profile/payment/QR/storage/vault/token detail suppression, update/duplicate-submit/refresh-after-save behavior, and session-ended routing.
- `apps/mobile/test/profile_generated_repository_test.dart` covers session-required behavior before generated calls, generated profile/payment mapping, input normalization, supported visibility validation, bounded generated/status/network failure mapping, and suppression of raw API paths, tokens, storage/provider, QR IDs, and request body details.

No M12-001 mobile tests were changed. Existing coverage is enough for state reconciliation, while M12-002 and M12-003 should add focused tests only where they harden copy/states.

## Known Gaps For M12-002 And M12-003

- M12-002 should harden first-launch/local-mode/bootstrap copy and tests to explicitly state local mode is device-bound, does not create a server account, does not enable server collaboration/shared groups/server sync, and does not automatically migrate/link local data when the user connects to a server.
- M12-002 should harden server setup/change-server/sign-in copy and tests to state server mode requires authentication and API authority, and that changing servers clears local server-session material without importing/linking local-only data or merging authority boundaries.
- M12-003 should add settings/profile/account readout copy and focused tests for unsupported CSV import/export, local backup/restore, local-to-server migration/link, server-to-local export/disconnect, and destructive portability actions as readiness/placeholder states only.
- M12-003 should make sync-status copy clearer that queued/synced/failed/conflict counts are for existing mobile sync queue operations and do not imply full offline cache hydration, server acceptance of all local data, import/export availability, or conflict-resolution authority.
- M12-003 should preserve profile/payment/account copy that cached rows, hidden controls, route state, generated-client availability, and UI mode/preferences do not authorize data access or policy changes.

## Planned Queue

- `M12-001-MOBILE-SETTINGS-MODE-DATA-PORTABILITY-STATE-RECONCILE-20260616-1517`: Reconcile current mobile settings, mode-boundary, data-portability readiness implementation and tests without runtime changes.
- `M12-002-MOBILE-FIRST-LAUNCH-MODE-BOUNDARY-HARDENING-20260616-1517`: Harden first-launch/setup/local/server mode boundary copy and tests inside `apps/mobile/lib/app/`.
- `M12-003-MOBILE-SETTINGS-DATA-PORTABILITY-READOUT-HARDENING-20260616-1517`: Harden authenticated settings/profile/account data-portability placeholder/readout states without adding real data-portability runtime.
- `M12-004-MOBILE-SETTINGS-MODE-DATA-PORTABILITY-QA-FINALIZE-20260616-1517`: Finalize QA/control state and mark M12 UI-test ready after slices complete.
- `STOP-M12-001`: Manual gate for data-portability runtime/API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

## QA Focus

- Local mode copy must say local use remains device-bound and does not create, link, or migrate into a server account.
- Server mode copy must say collaboration and shared records require server authentication and API authority.
- Change-server/sign-in/setup paths must not imply existing server sessions, local data, or profile rows are silently migrated.
- Settings/profile/account readouts must distinguish display preferences and placeholders from backend policy, authorization, storage, audit, privacy, and retention authority.
- Unsupported export/import/backup/migration copy must be clear and non-destructive, without offering fake functionality.
- Tests should suppress unsafe implications: raw secrets, session IDs, tokens, provider payloads, storage paths, vault internals, automatic migration, export-as-authorization-bypass, backup-as-retention-bypass, or client-side permission decisions from cached state.

## Validation Expectations

- M12-001 docs/control reconciliation should run `git diff --check`, scope guard, docs/scaffold/OpenAPI validation, mobile doctor, and a final controller dry run. Full Flutter validation is not required unless mobile tests/runtime files change.
- M12-002 and M12-003 should run focused Flutter tests for every mobile copy/state they change, plus full `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`.
- M12-004 should finalize QA/control only after M12-002 and M12-003 pass their validation, keep manual UI/code review deferred until Day 1 acceptance, and only then mark M12 UI-test ready.

## Stop Conditions

Stop and report `BLOCKED` if an M12 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, token/credential/session policy, registration/bootstrap policy, OIDC/MFA/passkey/recovery/admin behavior, audit-policy changes, schema/migrations, real CSV import/export, local backup/restore, local-to-server migration/link, server-to-local export/disconnect, data migration, file byte movement, storage/file privacy policy, file authorization policy, private-vault behavior, retention policy, money/bill/settlement/recurring/OCR/reconciliation authority, import-driven financial mutation, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M12.
