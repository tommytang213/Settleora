# Current Milestone

- ID: `M12`
- Name: `Day 1 Mobile Settings, Mode Boundary, And Data Portability Readiness`
- Target branch: `ai/integration`
- Previous milestone ID: `M11`

## Goal

Advance the next bounded Day 1 mobile product surface after M11 and the post-M11 FX/currency/UX architecture documentation update by hardening mobile settings, local/server mode boundaries, and data-portability readiness copy/states. M12 is intentionally a mobile UX/readiness milestone: it reconciles and hardens existing first-launch setup, local-mode, server-mode, profile/account/settings, sync-status, and unsupported export/migration readouts while preserving API/domain authority and stopping before real import/export/backup/migration runtime.

Repo-state basis for this milestone:

- `README.md` says mobile first-launch server/local configuration and secure session boundaries exist, while full offline cache hydration and broader product UI remain future work.
- `docs/prd/MVP_DAY1_SCOPE.md` requires CSV export, CSV import, local backup/restore, explicit local/server authority boundaries, and no silent merge between local-only and server/cloud data.
- `docs/ux/UI_UX_FOUNDATION.md` requires local mode and server mode to be visually and behaviorally distinct, local-to-server import/link and server-to-local export/disconnect to be explicit guided flows, and local profile data to never silently become a server account.
- `docs/ux/SCREEN_INVENTORY.md` identifies mobile Settings as the surface for user preferences, privacy, local/server mode, exports, account/session access, and destructive warnings, while noting this inventory does not authorize runtime implementation by itself.
- `docs/architecture/USER_EXPERIENCE_MODES_ARCHITECTURE.md` says experience modes and advanced toggles affect visibility/workflow depth only and do not change backend authority.
- Current mobile code under `apps/mobile/lib/app/`, `apps/mobile/lib/profile/`, and focused tests under `apps/mobile/test/` provide bounded seams for mobile-only state/copy hardening without requiring API, OpenAPI, generated-client, schema, auth/security runtime, storage/privacy, data-portability runtime, money, deployment, web/admin, or unrelated changes.

## Allowed Scope For Future M12 Tasks

- Mobile first-launch setup, server configuration, local-mode and server-mode boundary copy/states, bootstrap/sign-in change-server entry points, authenticated shell settings/profile/account entry points, sync status readout, unsupported export/migration/backup placeholders, and bounded failure/destructive-warning copy in `apps/mobile/lib/app/`.
- Existing mobile profile/account readout copy and safe settings-adjacent profile/payment boundaries in `apps/mobile/lib/profile/` when needed for settings/data-portability readout hardening.
- Focused mobile tests for first-launch mode choice, local/server boundary copy, invalid/unavailable server states, authenticated settings/profile/session entry, sync status, unsupported data-portability readouts, destructive warning copy, and unsafe implication suppression in `apps/mobile/test/`.
- M12 QA map and milestone QA docs under `docs/qa/`.
- `.ai` control files.
- `scripts/ai/v3-scope-guard.mjs` only for narrow M12 path allowances.

## Forbidden Without Human Approval

- Main merge, except explicit development-stage PR/merge-gate tasks that pass the repository main merge policy.
- Backend/API behavior.
- OpenAPI/generated clients.
- Auth/session/security runtime, token/credential/session issuance or revocation semantics, registration/bootstrap policy, OIDC/Keycloak, MFA, passkey, recovery, admin, or audit-policy changes.
- Database schema/migrations.
- Real CSV import/export, local backup/restore, local-to-server migration/link, server-to-local export/disconnect, data migration, file byte movement, storage/file privacy policy, file authorization policy, private-vault behavior, or retention policy changes.
- Client-side authorization decisions from cached route/profile/session/settings rows, hidden UI controls, route state, generated-client availability, or local device labels.
- Money, bill, settlement, recurring, OCR, reconciliation mutation, import-driven financial mutation, or business status-transition authority.
- Docker/deployment/env/CI config.
- Production secrets, credentials, tokens, `.env`, `.ssh`, `.codex`, or local auth/session config.
- Web/admin runtime UI, broad offline cache/sync, Day 1 scope reduction, architecture direction replacement, or unrelated major-domain work.

## Done Criteria

- Current mobile first-launch, local/server mode, authenticated settings/profile/account, sync-status, and data-portability readiness surfaces are reconciled against Day 1 requirements and captured in a QA map.
- Local mode is clearly device-bound and does not imply server account creation, server collaboration, shared groups, server sync, or automatic migration.
- Server mode clearly remains API-authoritative for collaboration, auth/session, authorization, sync acceptance, money, storage, audit, and policy decisions.
- Any export/import/backup/migration/disconnect affordance is represented only as unsupported/readiness copy unless a later human-approved task explicitly authorizes real runtime behavior.
- Settings/profile/account readouts avoid implying that cached rows, hidden controls, generated-client availability, or local UI choices authorize data access or policy changes.
- M12 QA records automated validation and keeps deferred manual UI/code review as deferred until Day 1 acceptance, not passed.
- No human-gated blocker is bypassed.
- M12 ends in a bounded controller stop state before backend/API, OpenAPI/contracts, generated clients, schema, auth/security runtime, data-portability runtime, storage/privacy, money/settlement/bill/recurring/OCR/reconciliation authority, deployment, web/admin, broad offline sync/cache, import/export/backup/migration, or unrelated major-domain work.

## Current Task Pointer

- Current task: `M12-004-MOBILE-SETTINGS-MODE-DATA-PORTABILITY-QA-FINALIZE-20260616-1517`.
- Last completed task: `M12-003-MOBILE-SETTINGS-DATA-PORTABILITY-READOUT-HARDENING-20260616-1517`.
- Current state: M12 is in progress as `Day 1 Mobile Settings, Mode Boundary, And Data Portability Readiness`.
- Manual UI retest status: `deferred_until_day1_acceptance`; not passed by M12.
- Manual code review status: `deferred_until_day1_acceptance`; not passed by M12.
- Recommended next automated task: `M12-004-MOBILE-SETTINGS-MODE-DATA-PORTABILITY-QA-FINALIZE-20260616-1517`.
- Stop sentinel: `STOP-M12-001` stops data-portability runtime/API/contracts/generated-client/auth/security/schema/storage/privacy/money/deployment/web-admin/broad-sync/secrets/unrelated scope.

## M12-001 Reconciliation Summary

M12-001 completed docs/control-only reconciliation of current mobile first-launch setup, local/server mode boundaries, server configuration/change-server entry points, authenticated shell settings/profile/session routes, sync status readout, profile/payment settings-adjacent surfaces, data-portability readiness gaps, and existing automated coverage.

Current findings:

- Local mode is currently a placeholder/configuration state that keeps the device separate, does not create server repositories, clears saved server session material when configuration changes, and does not implement local data storage, server collaboration, server sync, local-to-server migration/link, or data portability runtime.
- Server mode is entered only after saved server configuration plus usable session/current-user validation and exposes authenticated profile, session/device, sign-out, sync, bill, group, settlement, recurring, notification, report, and receipt-review routes.
- Existing profile/payment readouts already state that server-returned visibility is not a client-side authorization decision and suppress raw profile/payment/QR/storage/vault/token details.
- Existing sync readout covers current mobile bill queue pending/synced/failed/conflict states only and does not imply full offline cache hydration, broad conflict resolution, import/export, backup/restore, or server acceptance beyond submitted operations.
- CSV import/export, local backup/restore, local-to-server migration/link, server-to-local export/disconnect, destructive portability actions, private-vault behavior, retention policy, file byte movement, and storage/privacy runtime are not implemented and remain readiness/copy-only for future M12 slices unless a human-approved task expands scope.

## M12-002 First-Launch Mode Boundary Hardening Summary

M12-002 completed mobile first-launch and mode-boundary hardening inside existing `apps/mobile/lib/app/` presentation and `apps/mobile/test/widget_test.dart` seams.

Completed behavior:

- First-launch setup now says local data stays on the device and server collaboration starts only after server sign-in.
- Local mode setup/bootstrap copy now explicitly says Local Mode is device-bound and does not create or link a server account, shared groups, collaboration, server sync, server backup, import/export, cloud recovery, or automatic migration. Moving to server mode is described as a future explicit guided flow.
- Server setup/sign-in copy now says server mode requires server authentication and that the API decides account access, collaboration, shared records, sync acceptance, and authorization.
- Server setup/sign-in/change-server copy now says saving or changing a server clears saved session material for that configured server only and does not upload local-only data, link accounts, create backups, or migrate records.
- Sign-in and current-user verification failure display now uses bounded auth failure copy when incoming messages contain raw URLs, API paths, tokens, session IDs, stack traces, generated-client/provider payloads, storage paths, vault/private-file terms, or related unsafe internals.
- Protected server-mode surfaces still require authenticated server shell entry after current-user validation; cached route, session, or profile data is explicitly not authorization.
- No runtime import/export/backup/restore/migration/link/disconnect behavior was added.

Focused validation during implementation:

- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/widget_test.dart` passed with 31 tests.

At M12-002 completion, M12-003 became current, M12-004 remains queued, `STOP-M12-001` remains preserved, M12 is not ready for UI acceptance testing until M12-004 finalization, and manual UI retest/manual code review remain deferred until Day 1 acceptance and are not passed.

## M12-003 Settings Data-Portability Readout Hardening Summary

M12-003 completed authenticated mobile settings/profile/account data-portability readout hardening inside existing `apps/mobile/lib/app/` and `apps/mobile/lib/profile/` seams.

Completed behavior:

- Server-mode dashboard now includes a read-only settings readiness card for CSV export, CSV import, local backup/restore, local-to-server migration/link, and server-to-local export/disconnect.
- The readiness card states these portability flows are unsupported or future explicit guided flows only; it does not expose functioning import/export/backup/restore/migration/disconnect buttons or runtime handlers.
- Server-mode dashboard copy now says the API remains authoritative for collaboration, shared records, account access, sync acceptance, authorization, storage, audit, money, and policy.
- Sync status copy now says queued/synced/failed/conflict counts cover only the current mobile bill sync queue and do not imply full offline cache hydration, import/export, backup/restore, broad conflict resolution, or server acceptance of all local data.
- Profile/account copy now says server-returned account/profile rows, cached rows, hidden controls, route state, generated-client availability, UI mode, and preferences do not authorize data access, storage access, privacy policy, financial policy, or audit behavior.
- No runtime import/export/backup/restore/migration/link/disconnect behavior was added.

Focused validation during implementation:

- `cd /workspace/repos/Settleora/apps/mobile && /opt/flutter/bin/flutter test test/server_mode_shell_dashboard_test.dart test/profile_screen_test.dart` passed with 49 tests.
- `cd /workspace/repos/Settleora && PATH=/opt/flutter/bin:$PATH npm run validate:mobile` passed with 716 Flutter tests.

At M12-003 completion, M12-004 became current, `STOP-M12-001` remains preserved, M12 is not ready for UI acceptance testing until M12-004 finalization, and manual UI retest/manual code review remain deferred until Day 1 acceptance and are not passed.

## M11 Carry-Forward Boundary

M11 is finalized as `Day 1 Mobile Account Session And Device Management Hardening` and remains awaiting deferred Day 1 acceptance review. M12 must not expand M11 ad hoc into auth/session/security runtime behavior, token issuance, refresh rotation, revocation semantics, password/credential/OIDC/MFA/passkey/recovery/registration/admin behavior, audit-policy changes, or backend/API changes.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed.
