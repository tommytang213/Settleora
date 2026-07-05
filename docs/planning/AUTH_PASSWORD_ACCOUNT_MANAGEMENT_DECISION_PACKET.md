# Auth Password And Account Management Decision Packet

Status: `BLOCKED_PENDING_MANUAL_DECISIONS` for password/account-management runtime expansion.

This packet records what the current repository supports for local account creation, sign-in, sessions, and password/account management. It is a planning gate only. It does not authorize runtime implementation.

## Current Capability Matrix

| Capability | Current status | Evidence and endpoint details |
| --- | --- | --- |
| First-owner bootstrap status and creation | Implemented runtime and OpenAPI. Anonymous setup-only bootstrap can create the first local owner only while no auth account exists. Bootstrap returns no session or password material; the user signs in afterward. | `GET /api/v1/auth/bootstrap/status` (`getAuthBootstrapStatus`) and `POST /api/v1/auth/bootstrap/local-owner` (`bootstrapLocalOwner`) in `packages/contracts/openapi/settleora.v1.yaml`; runtime in `services/api/src/Settleora.Api/Auth/Bootstrap/LocalOwnerBootstrapEndpoints.cs` and `LocalOwnerBootstrapService.cs`; tests in `services/api/tests/Settleora.Api.Tests/LocalOwnerBootstrapEndpointTests.cs`; docs in `docs/architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md`, `docs/architecture/AUTH_IDENTITY_FOUNDATION.md`, and `docs/architecture/PASSWORD_HASHING_POLICY.md`. |
| Local sign-in/session creation | Implemented runtime and OpenAPI. Local sign-in creates refresh-capable opaque session credentials and returns raw access/refresh-like credentials only once. | `POST /api/v1/auth/sign-in` (`signInLocal`) and alias `POST /api/v1/auth/local/sign-in` (`signInLocalSession`) in OpenAPI; runtime in `services/api/src/Settleora.Api/Auth/SignIn/LocalSignInEndpoints.cs`; tests in `services/api/tests/Settleora.Api.Tests/LocalSignInEndpointTests.cs` and `LocalSignInServiceTests.cs`; docs in `docs/architecture/AUTH_SIGN_IN_ABUSE_POLICY.md` and `docs/architecture/AUTH_REFRESH_TOKEN_ROTATION_POLICY.md`. |
| Current-user/auth session read | Implemented runtime and OpenAPI. Bearer session validation returns bounded current account/profile/session/role data. | `GET /api/v1/auth/current-user` (`getCurrentUser`) and alias `GET /api/v1/auth/me` (`getAuthenticatedSession`) in OpenAPI; runtime in `services/api/src/Settleora.Api/Auth/CurrentUser/CurrentUserEndpoints.cs`; tests in `services/api/tests/Settleora.Api.Tests/CurrentUserEndpointTests.cs` and `LocalSignInEndpointTests.cs`. |
| Current-session sign-out | Implemented runtime and OpenAPI. Authenticated user revokes only the current bearer session. | `POST /api/v1/auth/sign-out` (`signOutCurrentSession`) in OpenAPI; runtime in `services/api/src/Settleora.Api/Auth/Sessions/SignOutEndpoints.cs`; tests in `services/api/tests/Settleora.Api.Tests/SignOutEndpointTests.cs`. |
| Current-account sign-out-all | Implemented runtime and OpenAPI. Authenticated user revokes all active sessions owned by the current account. | `POST /api/v1/auth/sign-out-all` (`signOutAllCurrentAccountSessions`) in OpenAPI; runtime in `services/api/src/Settleora.Api/Auth/Sessions/SignOutAllEndpoints.cs`; tests in `services/api/tests/Settleora.Api.Tests/SignOutAllEndpointTests.cs`. |
| Current-account session list/revoke | Implemented runtime and OpenAPI. Authenticated user can list safe active-session metadata and revoke one owned session. | `GET /api/v1/auth/sessions` (`listCurrentAccountSessions`) and `DELETE /api/v1/auth/sessions/{sessionId}` (`revokeCurrentAccountSession`) in OpenAPI; runtime in `SessionListEndpoints.cs` and `SessionRevocationEndpoints.cs`; tests in `SessionListEndpointTests.cs` and `SessionRevocationEndpointTests.cs`. |
| Guarded admin local-user list/read/create | Implemented runtime and OpenAPI. Authenticated system owner/admin can list/read safe user summaries and create normal local users with only the system `user` role. | `GET /api/v1/admin/users` (`listAdminUsers`), `POST /api/v1/admin/users/local` (`createAdminLocalUser`), and `GET /api/v1/admin/users/{userProfileId}` (`getAdminUser`) in OpenAPI; runtime in `services/api/src/Settleora.Api/Auth/AdminUsers/AdminUserEndpoints.cs` and `AdminLocalUserService.cs`; tests in `services/api/tests/Settleora.Api.Tests/AdminLocalUserEndpointTests.cs`; docs in `AUTH_IDENTITY_FOUNDATION.md` and `AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md`. |
| Current-account password change | Missing runtime, missing OpenAPI path, missing endpoint tests. Password hashing and credential workflow foundations exist, but no current-password-required password-change API exists. | No `change-password`, `PasswordChange`, or equivalent auth endpoint in `packages/contracts/openapi/settleora.v1.yaml` or `services/api/src/Settleora.Api/Auth/`. `PASSWORD_HASHING_POLICY.md` says password rotation/reset/recovery do not exist. |
| Admin password reset/change | Missing runtime, missing OpenAPI path, missing endpoint tests. Admin local-user creation accepts an initial password, but there is no admin reset/change path for an existing user. | `AdminUserEndpoints.cs` only maps list/get/create-local. `AdminLocalUserEndpointTests.cs` covers creation and safe output, not password reset. `AUTH_IDENTITY_FOUNDATION.md` lists password reset/change as future reviewed slices. |
| Bootstrap recovery when first owner cannot sign in | Missing product/API runtime. Once bootstrap is complete, bootstrap is unavailable; admin local-user creation requires an authenticated owner/admin session. | `bootstrapLocalOwner` returns `409` when an auth account already exists; `AdminUserEndpoints.cs` requires `Settleora.SystemRole.OwnerOrAdmin`; `PASSWORD_HASHING_POLICY.md` and `AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md` defer reset/recovery design. |
| Invitation/public registration account creation | Missing runtime for invitation acceptance and public self-registration. Admin-created local users are not public registration or invitations. | OpenAPI/admin-user descriptions explicitly state `createAdminLocalUser` is not public self-registration or invitation management. `MVP_DAY1_SCOPE.md` lists invitation/public self-registration as Day 1 goals, while `docs/acceptance/day1/DAY1_ACCEPTANCE_STATE.md` marks auth scope partial. |
| Mobile/web/admin UI support | Partial mobile auth/session UI exists; web-user has only a shell; web-admin is placeholder. No UI exists for password change, admin password reset, first-owner recovery, invitation acceptance, or public registration. | `docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md` records mobile first-launch, sign-in, secure storage, sign-out, sign-out-all, session list, and revocation. `apps/web-user/README.md` says web sign-in and credential storage are not implemented. `apps/web-admin/README.md` says no admin portal implementation exists. |

## Evidence Notes

- Implemented runtime means endpoint code, OpenAPI path, and focused tests exist in the current repo.
- Contract-only or docs-only scope is not treated as runtime. Recovery-code/MFA endpoints in the current auth area are not first-owner password recovery and do not provide an unauthenticated password reset path.
- Recent `.codex/reports/` files around auth/session/security notifications, including `.codex/reports/settleora-codex-report-20260705-1832-notification-369-session-revocation-runtime-readiness-decision-pr-open.md`, reinforce that auth/security runtime expansion remains manual-gated when it changes user-facing security behavior.

## User-Facing Behavior Answer

More than one account can currently be created, but only after the first owner signs in. A system owner or system admin can use the guarded admin local-user creation API to create another normal local account. That created account receives only the system `user` role and then signs in through the existing local sign-in endpoint.

A password cannot currently be changed through Settleora. There is no current-account password-change endpoint, no admin password-reset endpoint, and no implemented first-owner recovery flow.

If the first owner typed the password wrong and cannot sign in, Settleora currently has no supported in-product recovery path. Bootstrap cannot create a second owner after an account exists, and admin local-user creation requires an already authenticated owner/admin. A reviewed break-glass or recovery design is needed before the product should claim this can be fixed.

## Recommended Smallest Safe Next Runtime Slices

1. Current-account password change requiring the current password.
   - Add only an authenticated current-account endpoint that verifies the current password, writes a new verifier through the existing credential workflow boundary, emits safe audit, and applies an approved session-revocation policy.
2. Admin-created user onboarding and password reset policy.
   - Decide whether admin-created users receive temporary passwords, invitation links, or both. Avoid reset tokens until explicitly approved.
3. First-owner recovery or break-glass admin recovery.
   - Design a self-hosted recovery path that does not silently bypass auth, expose secrets, or mutate production data without audit and operator intent.
4. UI surfaces after API behavior exists.
   - Mobile/web/admin UI should follow implemented API behavior, not invent local-only password/account state.
5. Notifications, audit, and session-invalidation follow-ups.
   - Add user-facing security notifications only after event, recipient, target, redaction, OpenAPI/client, and audit decisions are approved.

## Manual Decisions Before Runtime

- On password change, should other active sessions be revoked by default?
- Should the current session remain active after a successful password change?
- Should password change create an in-app, email, push, or other security notification?
- What audit action names, outcomes, subject IDs, and safe metadata are approved?
- Should admin password reset require forced password change at next sign-in?
- Should admin-created users receive temporary passwords, invitation links, or both?
- What recovery path is acceptable if the first owner cannot sign in?
- Are schema, OpenAPI, and generated-client changes required for the first runtime slice?
- If OpenAPI changes are required, what exact contract review and generated-client validation gate applies?

## Runtime Non-Goals

This document does not authorize:

- Runtime endpoint implementation.
- OpenAPI changes.
- Generated client changes.
- EF migrations or schema changes.
- Password reset tokens or recovery codes.
- UI implementation.
- Public self-registration.
- Invitation runtime.
- Secret or config changes.
- Production recovery commands or destructive database mutation.

## Next Task Recommendation

Task title: `Auth Current-Account Password Change API Decision And Contract Gate`

Target branch suggestion: `docs/auth-current-account-password-change-contract-gate-20260705`

Exact scope: decide the first password-change API shape, current-password verification behavior, audit metadata, session revocation policy, OpenAPI/generated-client impact, and focused validation plan. Do not implement runtime unless the manual decisions above are explicitly approved.

Validation class: docs/planning with `git diff --check` and `npm run validate:docs`; if contract changes are approved, escalate to OpenAPI and generated-client validation.

Manual gates: auth/security approval, session revocation decision, audit/redaction approval, notification decision, OpenAPI/generated-client approval, and explicit confirmation that first-owner recovery remains out of scope unless separately approved.
