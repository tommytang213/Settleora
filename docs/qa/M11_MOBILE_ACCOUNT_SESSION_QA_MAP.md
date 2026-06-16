# M11 Mobile Account Session And Device Management QA Map

Status: `M11 finalized/UI-test ready; M11-001, M11-002, M11-003, and M11-004 completed; manual UI/code review deferred until Day 1 acceptance`

## Boundary

M11 hardens the mobile account session and device management UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security runtime or configuration changes outside existing mobile presentation and secure-storage seams, token issuance or refresh rotation changes, password/credential/OIDC/MFA/passkey/recovery/registration/admin changes, audit-policy changes, storage/privacy or file authorization changes, QR/proof/receipt byte behavior, money/bill/settlement/recurring/OCR authority changes, import/export/backup runtime, deployment, Docker, CI, secrets, web/admin runtime UI, or broad offline cache/sync work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M11. M11 is UI-test ready for deferred Day 1 acceptance review.

## Selection Basis

- `README.md` records first-launch local/server configuration, secure-storage-backed app/session state boundaries, a refresh-aware authenticated server-mode shell, current-session logout, account-wide sign-out, session list, and per-session revocation.
- `docs/prd/MVP_DAY1_SCOPE.md` requires registration/login foundations, secure sessions, revocation-ready sessions, device/session visibility, API-enforced role and permission checks, and security-impactful audit boundaries.
- `docs/features/auth-session/FUNCTIONAL_SPEC.md` requires users to understand active sessions/devices, revoke sessions, sign out, use local-only mode without server authentication, and see only safe own-session metadata.
- `docs/features/auth-session/TECHNICAL_SPEC.md` keeps auth/session/credential/audit writes API-owned and requires raw tokens, password material, provider secrets, and MFA/passkey secrets to stay out of logs, audit metadata, responses, and UI.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` records the existing mobile auth/session lifecycle shell, secure storage boundary, access-token refresh provider, logout, sign-out-all, session/device list, and per-session revocation.
- Current mobile files under `apps/mobile/lib/app/` and focused tests under `apps/mobile/test/auth_session_repository_test.dart`, `apps/mobile/test/secure_storage_test.dart`, `apps/mobile/test/widget_test.dart`, and `apps/mobile/test/server_mode_shell_dashboard_test.dart` provide bounded seams for mobile-only hardening.

## Auth Repository And Model Inventory

`apps/mobile/lib/app/auth_session_repository.dart` is the generated-client adapter boundary for sign-in, current-user validation, refresh, current-session sign-out, account-wide sign-out, session list, and per-session revocation.

- `SettleoraSignInSubmission` carries only `identifier` and `password` into the local sign-in request. The repository trims the identifier, rejects blank identifier/password before generated-client calls, and does not submit actor IDs, group IDs, file/storage paths, receipt IDs, split allocations, settlement IDs, or other app-domain authority fields.
- `SettleoraServerSessionMaterial` lives in `secure_storage.dart` and carries opaque access token material, access-session expiry, refresh credential material, refresh idle expiry, and refresh absolute expiry. Its `toString()` returns a redacted value and suppresses raw access/refresh credential material.
- `SettleoraCurrentUser` carries the server-returned user profile ID, display name, nullable default currency, roles, and session expiry after current-user validation. Its `toString()` exposes display name and role count only, not access tokens, session IDs, auth account IDs, or raw profile/session material.
- `SettleoraSessionSummary` carries the server-returned session ID for mutation, `isCurrent`, status, issued/expires/last-seen timestamps, and optional device label. `displayLabel` falls back to `This device` for the current session and `Signed-in device` for blank non-current labels. `toString()` suppresses session IDs.
- `SettleoraAuthFailureKind` is bounded to validation, invalid credentials, too many attempts, session expired, denied, unavailable, conflict, network, server, and storage failures.
- Generated, problem, and transport failures are mapped into safe mobile failure messages. Current coverage asserts invalid sign-in, current-user, refresh, session list/revoke, network, and conflict paths do not surface raw problem details, access tokens, refresh credentials, session IDs, auth account IDs, internal auth detail, socket detail, or generated-client internals.

Mobile auth/session models may format server-returned account/session metadata for display, but mobile formatting is never authority. The API remains authoritative for current actor identity, authorization, session validity, credential policy, token rotation, revocation, audit, and trust decisions.

## Secure Storage And Access-Token Inventory

`apps/mobile/lib/app/secure_storage.dart` and `apps/mobile/lib/app/secure_session_access_token_provider.dart` are the current mobile secure session boundary.

- `SettleoraSecureStorage` stores app configuration and server session material through the secure storage abstraction. Server configuration and server session state are not held as ordinary UI-only state.
- Malformed or blank stored app configuration/session JSON is treated as absent or invalid rather than trusted.
- `SettleoraServerSessionMaterial` models access-token usability, refresh need, and refresh credential usability from local material and expiry timestamps. Blank access tokens fail closed.
- `SecureSessionAccessTokenProvider` reads session material per operation, returns `null` when session material is missing or unusable, and clears local session material when an expired access session has no usable refresh credential.
- Expired or near-expiry access-session material can refresh through the auth repository when usable refresh material exists. Successful refresh writes the rotated session material back through secure storage and returns the rotated access token.
- Unauthorized, denied, unavailable, conflict, invalid-credential, or expired refresh outcomes require fresh sign-in and clear local session material. Raw refresh credential material remains suppressed from failure string output.
- Network/server/validation/throttling refresh failures may return a still-usable fallback access token only when the existing access session is still valid; otherwise they fail rather than inventing session authority.
- In-flight refreshes are shared through `_refreshInFlight`, avoiding parallel refresh calls for the same provider instance.

M11 may harden mobile presentation and tests around this boundary, but it must not change server token issuance, refresh rotation policy, credential storage policy, or auth/session runtime configuration.

## Mobile Screen And Session UI Inventory

`apps/mobile/lib/app/app_bootstrap.dart`, `apps/mobile/lib/app/setup_screen.dart`, `apps/mobile/lib/app/sign_in_screen.dart`, and `apps/mobile/lib/app/server_mode_shell.dart` provide the current mobile account/session UI surface.

- First launch exposes local/server mode selection. Local mode does not create a server auth repository and states that server collaboration, friends, groups, and server sync are unavailable until local runtime exists.
- Server setup validates and stores the configured server base URI before sign-in. Server configuration without a session shows the sign-in UI.
- Sign-in validates required input before auth calls. Successful sign-in stores session material through secure storage, then reloads bootstrap state and reaches the authenticated server shell only after current-user validation succeeds.
- Existing stored server sessions are validated through `SecureSessionAccessTokenProvider` plus `currentUser`. Expired access sessions refresh before shell entry when usable refresh material exists. Invalid stored sessions clear local session material and return to sign-in with a safe notice.
- The authenticated shell receives `SettleoraCurrentUser`, injected authenticated repositories, `SettleoraAuthRepository`, `SettleoraAccessTokenProvider`, and a shared `onSessionEnded` callback after current-user validation succeeds.
- The dashboard/settings surface exposes a `Sessions` entry that opens `SettleoraSessionListScreen` with the auth repository, token provider, and session-ended callback.
- The session list loads current-account sessions through the auth repository using a fresh access token. It displays safe labels, status, issued/expires/last-seen timestamps, a current-session marker, and copy that rows are API-returned display metadata only.
- Current-session rows do not show per-session revoke and explain that the main sign-out flow owns current-session sign-out. Non-current session rows expose a per-session revoke action with non-dismissible destructive confirmation.
- Per-session revoke blocks duplicate confirmations and duplicate in-flight revoke calls. After successful revoke, the mobile UI reloads the server-authoritative session list. If revoke succeeds but reload fails, the screen preserves the previously loaded safe readout, disables another per-session revoke, and asks the user to refresh sessions before retrying rather than repeating the revoke blindly.
- Current-session sign-out attempts server-authoritative `signOutCurrentSession` before clearing local session material. If the server cannot confirm sign-out, the UI preserves local session material until the user explicitly confirms local device clear.
- Account-wide sign-out is exposed from the session list through explicit confirmation and clears local session material after the backend call succeeds.
- Session-required/session-expired paths call the shared session-ended callback and return to sign-in state. Protected routes must not keep treating cached current-user/session rows as proof of authorization.

M11-003 completed hardening for duplicate current-session sign-out/account-wide sign-out prevention, server-unreachable local-clear copy, expired-session routing, access-token refresh fail-closed handling, and unsafe token/session/credential suppression.

## Automated Coverage Inventory

Focused account/session coverage currently exists in `apps/mobile/test/auth_session_repository_test.dart`, `apps/mobile/test/secure_storage_test.dart`, `apps/mobile/test/widget_test.dart`, and app-shell/dashboard coverage in `apps/mobile/test/server_mode_shell_dashboard_test.dart`.

`auth_session_repository_test.dart` covers:

- Blank sign-in validation before generated-client calls.
- Sign-in success mapping into secure session material.
- Sign-in request field boundaries: identifier/password only, with app-domain authority fields excluded.
- Current-user mapping, session expiry preservation, and trimmed access-token use.
- Refresh rotation through the generated client and refresh credential trimming.
- Session list mapping, safe blank/named device display labels, per-session revoke generated-method calls, current-session sign-out, and account-wide sign-out generated-method calls.
- Suppression of raw access tokens, refresh credentials, session IDs, auth account IDs, internal auth details, and problem details from string output and bounded failure messages.
- Mapping invalid credentials, network failures, invalid current-user sessions, refresh failures, and session operation conflicts into bounded auth failures.

`secure_storage_test.dart` covers:

- App mode and server base URL storage through the secure storage boundary.
- Malformed stored configuration treated as not configured.
- Secure session material storage/restore without token exposure through `toString()`.
- Access-token provider fail-closed behavior for missing, blank, and expired access sessions.
- Per-operation trimmed access-token reads.
- Refresh of expired access sessions with usable refresh material and secure storage of rotated material.
- Unauthorized refresh clearing local session without leaking secrets.

`widget_test.dart` covers:

- First-launch mode choices and local mode without server repository creation.
- Invalid server URL validation and server configuration without a session showing sign-in.
- Sign-in validation before auth calls.
- Successful sign-in storing session material and reaching the authenticated shell.
- Existing verified session opening the shell.
- Expired access-session refresh before shell entry.
- Current-user network failure retry/change-server state.
- Invalid stored session returning to sign-in, clearing session, and suppressing the expired token in visible text.
- Current-session sign-out revoking on the server and clearing local storage.
- Server-unreachable sign-out preserving local session until explicit local-clear confirmation.
- Session list display of safe metadata, absence of raw session IDs/tokens/refresh credentials in visible text, and per-session revoke.
- Account-wide sign-out clearing local session after backend call.

`server_mode_shell_dashboard_test.dart` is not primarily an auth/session test file, but it exercises authenticated shell entry and session-required callback behavior for dashboard/sync paths. It supports the requirement that authenticated surfaces route session-required outcomes through the shared session-ended callback instead of treating cached UI state as authority.

M11-002 completed coverage:

- Session/device list copy states server-returned rows are display metadata only and the server decides validity and revocation.
- Current-session rows remain protected from per-session revoke and direct users to the main sign-out flow for this session.
- Non-current per-session revoke requires explicit destructive confirmation and suppresses duplicate confirmation/revoke attempts while work is pending.
- Successful per-session revoke reloads the server-authoritative session list.
- If post-revoke reload fails, the UI preserves a safe previously loaded readout, disables another per-session revoke, and asks the user to refresh sessions before retrying.
- Focused widget coverage asserts raw session IDs, access tokens, refresh credentials, token hashes, auth account IDs, provider payloads, API paths, and stack traces are not visible in these session-list states.
- Required focused validation passed `widget_test.dart`, `auth_session_repository_test.dart`, `secure_storage_test.dart`, and `server_mode_shell_dashboard_test.dart` with 77 tests.
- Full mobile validation passed with 707 Flutter tests.

M11-003 completed coverage:

- Current-session sign-out asks the server to end the current session before clearing local device session material.
- Duplicate current-session sign-out confirmations and in-flight submissions are blocked.
- Server-unreachable local-clear confirmation distinguishes local device clear from unconfirmed server revocation and warns that another device may be needed after connectivity returns.
- Account-wide sign-out confirmation uses bounded destructive-action copy and blocks duplicate confirmations/in-flight submissions.
- Session-expired account-wide sign-out failures route through the shared session-ended/sign-in path.
- Blank rotated access material clears local session state so protected routes fail closed.
- Focused implementation validation passed `widget_test.dart` with 28 tests and `secure_storage_test.dart` with 10 tests.
- Required focused validation passed `widget_test.dart`, `auth_session_repository_test.dart`, `secure_storage_test.dart`, and `server_mode_shell_dashboard_test.dart` with 82 tests.
- Full mobile validation passed with 712 Flutter tests.

M11-004 completed coverage:

- M11 QA/control state was finalized after all bounded implementation slices completed.
- `.ai` state now marks M11 as `m11_finalized_ui_test_ready`, with `currentTaskId` set to `null`, `uiTestingReady` set to `true`, and `automatedValidationComplete` set to `true`.
- Manual UI retest and manual code review remain `deferred_until_day1_acceptance`, not passed.
- Final full mobile validation for M11-004 passed with 712 Flutter tests.

## Day 1 Requirement Map

| Day 1 account/session requirement | Current state | M11 implication |
| --- | --- | --- |
| Server-mode login | Mobile sign-in repository and first-launch/server setup exist; sign-in stores opaque session material through secure storage and validates current user before shell entry. | M11 preserves sign-in boundaries and safe state copy; it does not add registration/OIDC/MFA/passkeys. |
| Secure sessions | Secure storage stores server configuration and opaque session material; access-token provider fails closed for missing, blank, expired, or refresh-rejected material. | M11-003 hardens refresh/sign-out/session-expired UX without changing token issuance or rotation. |
| Revocation-ready sessions | Backend/generated clients expose current-session sign-out, account-wide sign-out, session list, and per-session revoke; mobile adapter maps these through bounded failures. | M11-002/M11-003 harden mobile revocation UX without changing server revocation semantics. |
| Device/session visibility | Session list UI displays labels, status, timestamps, and current marker from server-returned metadata only. | M11-002 hardens safe readout, current-session protection, duplicate revoke behavior, and unsafe ID/token suppression. |
| Role/permission checks API-enforced | Current-user validation and generated repository calls remain server-authoritative; mobile roles are display/context data only. | M11 must not infer authorization from cached current-user/session rows, route visibility, generated-client methods, or device labels. |
| Audit boundaries | Backend owns security-impactful audit records; mobile triggers reviewed endpoints only. | M11 does not change audit policy or claim audit success beyond existing backend behavior. |
| Local-only mode boundary | First-launch local/server choice exists; local mode avoids server auth and server repository creation. | M11 must not implement local-only expense storage, migration, import/export, backup, or silent server upload. |

## Completed M11 Focus

- `M11-002-MOBILE-SESSION-LIST-REVOKE-HARDENING-20260616-1315` - Completed. Hardened session/device list and per-session revoke UI inside existing mobile seams: safe metadata readout, current-session marker/protection, duplicate revoke prevention, bounded list/revoke failures, refresh-after-mutation behavior, and raw ID/token/credential suppression.
- `M11-003-MOBILE-SIGNOUT-REFRESH-SESSION-HARDENING-20260616-1315` - Completed. Hardened current-session sign-out, account-wide sign-out, server-unreachable local clear, expired-session behavior, and access-token refresh behavior inside existing mobile seams.
- `M11-004-MOBILE-ACCOUNT-SESSION-QA-FINALIZE-20260616-1315` - Completed. Finalized QA/control state after bounded implementation slices completed, preserved deferred manual UI/code review, and marked M11 UI-test ready for deferred Day 1 acceptance review.
- `STOP-M11-001` - Preserve the manual stop sentinel for forbidden API/contracts/generated-client/auth/session/security runtime/schema/token/credential/password/OIDC/MFA/passkey/recovery/admin/audit-policy/storage/privacy/money/deployment/import/export/backup/web-admin/broad-sync/secrets/unrelated scope.

## M11 Forbidden-Scope Confirmation

M11 stayed inside existing mobile presentation, secure-storage, docs, and control seams. It did not change backend/API behavior, OpenAPI contracts, generated clients, auth/session/security runtime or configuration outside mobile presentation and secure-storage seams, token issuance, refresh rotation policy, server revocation semantics, password handling, OIDC/Keycloak, MFA, passkeys, recovery, registration policy, admin user management, credential storage policy, audit policy, schema/migrations, storage/file privacy or authorization policy, QR/proof/receipt byte behavior, money/bill/settlement/recurring/OCR/reconciliation authority, import/export/backup, deployment/Docker/CI/env, web/admin runtime, broad offline cache/sync, secrets, Day 1 scope, or architecture direction.

M11-004 finalized QA/control state only. Manual UI retest and manual code review remain `deferred_until_day1_acceptance`, not passed.

## Follow-Up

A separate user-requested post-M11 docs-only FX/currency/UX architecture task is pending after M11 finalization. It should cover currency registry, FX provider/rate storage, bill FX snapshots, group/context FX profiles, group FX approval, bill-create FX UX defaults, and experience modes/advanced toggles before the next normal implementation milestone, unless the controller reports a stricter blocker. M11 does not implement or edit that currency/FX architecture scope.

## Validation Expectations

M11-001 reconciliation validation:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `PATH=/opt/flutter/bin:$PATH npm run doctor:mobile`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

The final M11-001 controller dry run should select `M11-002-MOBILE-SESSION-LIST-REVOKE-HARDENING-20260616-1315`.

M11 implementation slices should add focused mobile validation, including `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`, when mobile runtime or test files are changed.

## Stop Conditions And Non-Goals

Stop and report `BLOCKED` if an M11 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration changes outside existing mobile presentation and secure-storage seams, token issuance, refresh rotation policy, server revocation semantics, password handling, OIDC/Keycloak, MFA, passkey, recovery, registration policy, admin user management, credential storage, audit-policy changes, schema/migrations, storage/file privacy or authorization policy changes, QR/proof/receipt byte behavior, private-vault behavior, client-side authorization decisions from cached rows, money/bill/settlement/recurring/OCR/reconciliation authority, import/export/backup, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Non-goals preserved for M11: no backend/API behavior, no OpenAPI or generated-client changes, no auth/session/security runtime or configuration changes, no token issuance, no refresh rotation policy changes, no server revocation semantic changes, no password handling changes, no OIDC/Keycloak, no MFA, no passkeys, no recovery, no registration policy changes, no admin user management, no credential storage changes, no audit-policy changes, no schema/migrations, no storage/privacy/file authorization changes, no money/bill/settlement/recurring/OCR/reconciliation authority, no import/export/backup runtime, no Docker/deployment/env/CI/secrets, no web/admin runtime, no broad offline cache/sync, no Day 1 scope reduction, no architecture replacement, no manual UI/code review pass, and no merge without the required PR/CI/merge gates.
