# M12 Mobile Settings, Mode Boundary, And Data Portability QA Map

Status: `M12 queued; M12-001 selected; manual UI/code review deferred until Day 1 acceptance`

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

## Current Implementation Inventory To Reconcile In M12-001

- First launch/setup: `apps/mobile/lib/app/setup_screen.dart` lets users choose server or local mode, validates server base URLs, and states that local mode keeps the device separate and lacks server collaboration until local runtime exists.
- Bootstrap/app routing: `apps/mobile/lib/app/app_bootstrap.dart` persists the chosen configuration, shows local-mode placeholder copy, routes server mode through sign-in/current-user validation, and supports changing server configuration.
- Authenticated shell: `apps/mobile/lib/app/server_mode_shell.dart` exposes the current authenticated user, profile entry, session/device management, sign-out, sync status, bills, groups, settlements, recurring bills, notifications, reports, and receipt review routes.
- Profile/account settings-adjacent surface: `apps/mobile/lib/profile/profile_screen.dart` exposes profile and payment detail readouts through generated-client repository seams, with server-returned visibility copy and bounded failures.
- Secure storage: `apps/mobile/lib/app/secure_storage.dart` stores app configuration and session material through existing secure-storage keys, but it is not a local backup/export implementation.
- Sync readout: existing mobile sync queue and server shell copy expose queued/synced/failed/conflict-style status for current mobile seams without claiming full offline cache hydration.

M12-001 should verify these details against current code and tests before implementation slices.

## Day 1 Requirement Map

| Day 1 requirement | Current state to verify | M12 implication |
|---|---|---|
| Explicit local/server boundaries | First-launch and local-mode copy exist. | Harden copy/tests so local mode is device-bound and not silently linked to a server account. |
| Server-mode authority | Authenticated shell routes through current-user/session validation. | Harden copy/tests so server mode remains API-authoritative for collaboration, auth, sync, money, storage, audit, and policy. |
| Settings surface for account/session/mode | Settings is currently represented through authenticated shell/profile/session entry points rather than a full settings module. | Harden existing entry points and avoid inventing broad settings architecture. |
| CSV import/export | Day 1 PRD requires it, but current runtime does not implement it. | M12 may add unsupported/readiness copy only; real import/export is a stop condition. |
| Local backup/restore | Day 1 PRD requires it, but current runtime does not implement it. | M12 may add unsupported/readiness copy only; real backup/restore is a stop condition. |
| Local-to-server migration/import | UX docs require explicit guided flow. | M12 may clarify that migration is not automatic; real migration/import/link runtime is a stop condition. |
| Server-to-local export/disconnect | UX docs require explicit guided flow. | M12 may clarify that export/disconnect is not a retention/authorization bypass; real runtime is a stop condition. |
| Privacy and experience mode boundaries | Architecture docs define future direction only. | M12 must avoid privacy-mode/private-vault/runtime policy changes and any hidden authority from UI modes. |

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

## Stop Conditions

Stop and report `BLOCKED` if an M12 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration, token/credential/session policy, registration/bootstrap policy, OIDC/MFA/passkey/recovery/admin behavior, audit-policy changes, schema/migrations, real CSV import/export, local backup/restore, local-to-server migration/link, server-to-local export/disconnect, data migration, file byte movement, storage/file privacy policy, file authorization policy, private-vault behavior, retention policy, money/bill/settlement/recurring/OCR/reconciliation authority, import-driven financial mutation, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M12.
