# M11 Mobile Account Session And Device Management QA Map

Status: `M11 queued; first task pending; manual UI/code review deferred until Day 1 acceptance`

## Boundary

M11 hardens the mobile account session and device management UX inside existing backend and generated-client seams. It does not authorize backend/API behavior, OpenAPI/generated-client changes, schema/migration changes, auth/session/security runtime or configuration changes outside existing mobile presentation and secure-storage seams, token issuance or refresh rotation changes, password/credential/OIDC/MFA/passkey/recovery/registration/admin changes, audit-policy changes, storage/privacy or file authorization changes, QR/proof/receipt byte behavior, money/bill/settlement/recurring/OCR authority changes, import/export/backup runtime, deployment, Docker, CI, secrets, web/admin runtime UI, or broad offline cache/sync work.

Manual UI retest and manual code review remain deferred until Day 1 acceptance and are not passed by M11.

## Selection Basis

- `README.md` records first-launch local/server configuration, secure-storage-backed app/session state boundaries, a refresh-aware authenticated server-mode shell, current-session logout, account-wide sign-out, session list, and per-session revocation.
- `docs/prd/MVP_DAY1_SCOPE.md` requires registration/login foundations, secure sessions, revocation-ready sessions, device/session visibility, API-enforced role and permission checks, and security-impactful audit boundaries.
- `docs/features/auth-session/FUNCTIONAL_SPEC.md` requires users to understand active sessions/devices, revoke sessions, sign out, and see only their own safe session metadata.
- `docs/features/auth-session/TECHNICAL_SPEC.md` keeps auth/session/credential/audit writes API-owned and requires raw tokens, password material, provider secrets, and MFA/passkey secrets to stay out of logs, audit metadata, responses, and UI.
- `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` records the existing mobile auth/session lifecycle shell, secure storage boundary, access-token refresh provider, logout, sign-out-all, session/device list, and per-session revocation.
- Current mobile files under `apps/mobile/lib/app/` and focused tests under `apps/mobile/test/auth_session_repository_test.dart`, `apps/mobile/test/secure_storage_test.dart`, and `apps/mobile/test/widget_test.dart` provide bounded seams for mobile-only hardening.

## Current Repository And Model Inventory

`apps/mobile/lib/app/auth_session_repository.dart` is the generated-client adapter boundary for sign-in, current-user validation, refresh, logout, session list, account-wide sign-out, and per-session revocation.

- `SettleoraSignInSubmission` carries identifier and password only for the sign-in request.
- `SettleoraServerSessionMaterial` lives in `secure_storage.dart` and carries access token, access-session expiry, refresh credential, refresh idle expiry, and refresh absolute expiry. Its string representation suppresses token material.
- `SettleoraCurrentUser` carries user profile ID, display name, nullable default currency, roles, and session expiry. Its string representation suppresses raw profile/session material.
- `SettleoraSessionSummary` carries session ID for repository mutation, current-session marker, status, issue/expiry/last-seen timestamps, and optional device label. Its `displayLabel` falls back to `This device` or `Signed-in device`, and its string representation suppresses session IDs.
- `SettleoraAuthFailureKind` covers validation, invalid credentials, too many attempts, session expired, denied, unavailable, conflict, network, server, and storage failures.
- Generated auth failures map server/problem/transport errors into bounded mobile failures without exposing problem details, raw access tokens, refresh credentials, session IDs, API paths, or provider payloads in current focused coverage.

Mobile auth/session models may format server-returned account/session metadata for display, but they must not decide current actor identity, authorization, session validity, credential policy, token rotation, revocation authority, audit, or server trust.

## Mobile Secure Storage And Access-Token Inventory

`apps/mobile/lib/app/secure_storage.dart` and `apps/mobile/lib/app/secure_session_access_token_provider.dart` are the current mobile secure session boundary.

- Server configuration and server session material are stored through the secure storage abstraction, not ordinary UI state.
- Future session material is restored without exposing token material through `toString()`.
- Missing, blank, expired, or refresh-rejected session material fails closed.
- Expired access-session material can refresh through the auth repository when a usable refresh credential exists.
- Unauthorized refresh clears the local session and suppresses raw credential material.
- Repository calls that need authenticated access read tokens through injected providers or explicit stored material rather than static globals.

M11 may harden mobile presentation and tests around this boundary, but it must not change server token issuance, refresh rotation policy, credential storage policy, or auth/session runtime configuration.

## Mobile Screen Inventory

`apps/mobile/lib/app/server_mode_shell.dart` contains the authenticated shell and session management UI.

- The shell receives `SettleoraCurrentUser`, injected authenticated repositories, `SettleoraAuthRepository`, `SettleoraAccessTokenProvider`, and an `onSessionEnded` callback after current-user validation succeeds.
- The top-level Settings area exposes a `Sessions` entry that opens `SettleoraSessionListScreen`.
- Current-session sign-out attempts server-authoritative `signOutCurrentSession` before clearing local session state.
- If current-session sign-out cannot reach the server, the UI asks the user before clearing local device session material only.
- The session list loads current-account sessions through the auth repository using a fresh access token.
- The session list displays safe labels, status, issued/expires/last-seen timestamps, and a current-session marker.
- Current-session rows do not show a revoke button; non-current rows have a per-session revoke action with confirmation.
- Account-wide sign-out is exposed as an explicit action from the session list and ends the local session after backend confirmation.
- Session-required/session-expired paths call the shared session-ended callback and return to sign-in state.

Current M11 focus areas are safe metadata copy, current-session protection clarity, duplicate revoke/sign-out prevention, mutation refresh behavior, server-unreachable local-clear copy, and unsafe token/session/credential suppression.

## Automated Coverage Inventory

Focused account/session coverage currently exists in `apps/mobile/test/auth_session_repository_test.dart`, `apps/mobile/test/secure_storage_test.dart`, and `apps/mobile/test/widget_test.dart`.

`auth_session_repository_test.dart` covers:

- Sign-in success mapping into secure session material.
- Current-user mapping and session expiry preservation.
- Refresh rotation through the generated client.
- Session list mapping and per-session revoke generated-method calls.
- Safe display labels for blank device labels and named devices.
- Suppression of raw access tokens, refresh credentials, session IDs, auth account IDs, and internal auth details from string output and bounded failure messages.
- Mapping invalid credentials, current-user failures, refresh failures, and session operation failures into bounded auth failures.

`secure_storage_test.dart` covers:

- Secure session material storage/restore without token exposure through `toString()`.
- Access-token provider fail-closed behavior for missing, blank, and expired access sessions.
- Refresh of expired access sessions with usable refresh material.
- Unauthorized refresh clearing local session without leaking secrets.

`widget_test.dart` covers:

- First-launch mode choices and server configuration without a session.
- Sign-in validation before auth calls.
- Successful sign-in storing session material and reaching the authenticated shell.
- Existing verified session opening the shell.
- Expired access-session refresh before shell entry.
- Invalid stored session returning to sign-in and clearing session.
- Current-session sign-out revoking on the server and clearing local storage.
- Server-unreachable sign-out preserving local session until the user confirms local clear.
- Session list display of safe metadata and per-session revoke.
- Account-wide sign-out clearing local session after backend call.

M11-001 should reconcile any missing coverage details before implementation slices proceed.

## Day 1 Requirement Map

| Day 1 account/session requirement | Current state | M11 implication |
| --- | --- | --- |
| Server-mode login | Mobile sign-in repository and first-launch/server setup exist; sign-in stores opaque session material through secure storage. | M11 preserves sign-in boundaries and may document safe states; it does not add registration/OIDC/MFA/passkeys. |
| Secure sessions and revocation-ready model | Backend/generated clients expose current-user, refresh, logout, session list, sign-out-all, and revoke methods; mobile adapter maps them through bounded failures. | M11-002/M11-003 harden mobile session list/revoke/sign-out UX without changing server revocation semantics. |
| Device/session visibility | Session list UI displays labels, status, timestamps, and current marker using server-returned metadata. | M11-002 hardens safe readout, current-session protection, and unsafe ID/token suppression. |
| Role/permission checks API-enforced | Current-user validation and API calls remain server-authoritative; mobile has roles only for display/context. | M11 must not infer authorization from cached current-user/session rows or route visibility. |
| Security-impactful audit boundaries | Backend owns audit; mobile triggers reviewed endpoints only. | M11 does not change audit policy or claim audit success beyond existing backend behavior. |
| Local-only mode without server auth | First-launch local/server choice exists; local-only data remains separate from server auth. | M11 may preserve copy but must not implement local-only expense storage, migration, import/export, or silent server upload. |

## Queue Expectations

- `M11-001-MOBILE-ACCOUNT-SESSION-STATE-RECONCILE-20260616-1315` - Reconcile current mobile account/session implementation and tests without runtime behavior changes.
- `M11-002-MOBILE-SESSION-LIST-REVOKE-HARDENING-20260616-1315` - Harden session/device list and per-session revoke UI inside existing mobile seams.
- `M11-003-MOBILE-SIGNOUT-REFRESH-SESSION-HARDENING-20260616-1315` - Harden current-session sign-out, account-wide sign-out, server-unreachable local clear, expired-session, and access-token refresh behavior inside existing mobile seams.
- `M11-004-MOBILE-ACCOUNT-SESSION-QA-FINALIZE-20260616-1315` - Finalize QA/control state and mark M11 UI-test ready only after bounded slices complete.
- `STOP-M11-001` - Stop for forbidden API/contracts/generated-client/auth/session/security runtime/schema/token/credential/password/OIDC/MFA/passkey/recovery/admin/audit-policy/storage/privacy/money/deployment/import/export/backup/web-admin/broad-sync/secrets/unrelated scope.

## Validation Expectations

M11 kickoff validation:

- `git status --short`
- `git diff --name-only origin/main...HEAD`
- `git diff --check origin/main...HEAD`
- `node scripts/ai/v3-scope-guard.mjs --base origin/main --head HEAD`
- `npm run validate:docs`
- `npm run validate:scaffold`
- `npm run validate:openapi`
- `node scripts/ai/v3-controller.mjs --dry-run --max-iterations 1`

The kickoff controller dry run should select `M11-001-MOBILE-ACCOUNT-SESSION-STATE-RECONCILE-20260616-1315`.

M11 implementation slices should add focused mobile validation, including `PATH=/opt/flutter/bin:$PATH npm run validate:mobile`, because future M11 implementation tasks may touch mobile runtime/test files.

## Stop Conditions And Non-Goals

Stop and report `BLOCKED` if an M11 task requires backend/API behavior, OpenAPI/contracts, generated clients, auth/session/security runtime or configuration changes outside existing mobile presentation and secure-storage seams, token issuance, refresh rotation policy, server revocation semantics, password handling, OIDC/Keycloak, MFA, passkey, recovery, registration policy, admin user management, credential storage, audit-policy changes, schema/migrations, storage/file privacy or authorization policy changes, QR/proof/receipt byte behavior, private-vault behavior, client-side authorization decisions from cached rows, money/bill/settlement/recurring/OCR/reconciliation authority, import/export/backup, Docker/deployment/env/CI, secrets, production deploy, public/admin exposure, branch deletion, force/history operations, Day 1 scope reduction, architecture replacement, web/admin runtime UI, broad offline cache/sync, or unrelated major-domain scope.

Non-goals preserved for M11: no backend/API behavior, no OpenAPI or generated-client changes, no schema/auth security policy/token/credential changes, no storage/privacy changes, no money/business authority changes, no import/export/backup implementation, no manual UI/code review pass, and no merge without the required PR/CI/merge gates.
