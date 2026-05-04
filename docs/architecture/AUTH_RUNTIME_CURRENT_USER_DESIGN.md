# Auth Runtime And Current-User Design

This document defines the Settleora auth runtime boundary for local-account sign-in, server-side session creation and validation, token or refresh-token issuance boundaries, current-user behavior, authenticated actor resolution, auth audit integration, and authorization handoff. Refresh-like credential rotation, replay detection, expiry, and session-family revocation policy is defined separately in [AUTH_REFRESH_TOKEN_ROTATION_POLICY.md](AUTH_REFRESH_TOKEN_ROTATION_POLICY.md).

It started as a design gate. The current repository now includes the explicitly scoped first-owner local bootstrap endpoints, refresh-capable local sign-in endpoint, public refresh endpoint, current-user read endpoint, current-session sign-out endpoint, current-account sign-out-all endpoint, current-account session list endpoint, current-account per-session revocation endpoint, internal refresh session runtime foundation, the `SettleoraSession` bearer middleware/current-actor/authorization policy foundation, the internal business authorization service foundation, guarded self-profile read/update endpoints, guarded group create/list/read/update foundation endpoints, guarded group member management endpoints for existing registered users, guarded admin local-user list/read/create foundation endpoints, and generated web/Dart client foundations described below; remaining auth runtime work still requires separate reviewed branches before UI integration, additional migrations, package changes, Docker changes, broader public business endpoint authorization behavior, or worker behavior are added.

## Current State

- Schema foundations exist for user profiles, groups, memberships, auth accounts, auth identities, system role assignments, local password credentials, auth sessions, auth session families, auth refresh credentials, and auth audit events.
- `auth_accounts` links one server-side auth account root to one `UserProfile`.
- `auth_identities` stores provider links without raw provider tokens.
- `local_password_credentials` stores password verifier metadata and no plaintext passwords, reset tokens, recovery codes, passkeys, or MFA secrets.
- `auth_sessions` stores metadata and token hashes only. It supports session lookup, expiry, and revocation without raw bearer token storage.
- `auth_audit_events` stores bounded auth audit metadata and must not contain raw secrets, raw tokens, password material, verifier strings, MFA secrets, passkey private material, full provider payloads, or unnecessary PII.
- Internal password hashing and credential workflow service boundaries exist for Argon2id verifier creation, EF-backed local password credential creation, verification, safe audit writes, and rehash after successful verification.
- An internal sign-in abuse policy service boundary exists for endpoint-independent pre-verification throttling decisions and post-result in-memory attempt recording.
- An internal local sign-in orchestration service boundary exists for endpoint-independent local identifier normalization, local identity/account resolution, abuse-policy checks and attempt recording, credential verification, refresh-capable session creation, and safe sign-in-specific audit writes.
- `GET /api/v1/auth/bootstrap/status` and `POST /api/v1/auth/bootstrap/local-owner` now exist as anonymous setup-only endpoints for creating the first local owner when no auth account exists.
- `POST /api/v1/auth/sign-in` now exists as a refresh-capable public local sign-in endpoint.
- `POST /api/v1/auth/refresh` now exists as the first public refresh endpoint for rotating a submitted refresh-like credential.
- `GET /api/v1/auth/current-user` now exists as the first public auth read endpoint for validating an existing opaque session token and returning a minimal current actor/profile/session/role summary.
- `POST /api/v1/auth/sign-out` now exists as a focused public endpoint for revoking only the current validated bearer session.
- `POST /api/v1/auth/sign-out-all` now exists as a focused public endpoint for revoking all active sessions owned by the current authenticated account.
- `GET /api/v1/auth/sessions` now exists as a focused public endpoint for listing safe active-session metadata owned by the authenticated auth account.
- `DELETE /api/v1/auth/sessions/{sessionId}` now exists as a focused public endpoint for revoking one session owned by the authenticated auth account.
- An internal refresh session runtime boundary now exists for creating refresh-capable session families and rotating refresh-like credentials while storing only deterministic hashes and writing bounded safe audit metadata.
- `SettleoraSession` now exists as the first server-side bearer authentication scheme. It validates opaque access-session credentials only through `IAuthSessionRuntimeService.ValidateSessionAsync`, produces bounded actor and system-role claims, and returns the same safe unauthenticated problem response for missing, malformed, unavailable, expired, revoked, inactive, disabled-account, deleted-account, or otherwise invalid sessions.
- `ICurrentActorAccessor` and `AuthenticatedActor` now expose server-derived auth account, user profile, auth session, expiry, and role context to endpoint/domain code after middleware validation. They do not consume client-submitted profile IDs.
- `IBusinessAuthorizationService` now provides the first internal server-side business authorization boundary for profile/group endpoint checks. It allows own-profile access, active-member group access, group owner-only membership/settings management decisions, and system-role detection without treating clients or generated methods as authorization.
- Authorization policy foundations now exist as `Settleora.AuthenticatedUser`, `Settleora.SystemRole.Owner`, `Settleora.SystemRole.Admin`, and `Settleora.SystemRole.User`.
- `GET /api/v1/auth/current-user`, `POST /api/v1/auth/sign-out`, `POST /api/v1/auth/sign-out-all`, `GET /api/v1/auth/sessions`, and `DELETE /api/v1/auth/sessions/{sessionId}` now use the middleware handoff instead of manually parsing bearer tokens in each endpoint.
- Generated web and Dart client foundations exist from the OpenAPI contract.
- `GET /api/v1/users/me/profile` and `PATCH /api/v1/users/me/profile` now consume the current actor plus `IBusinessAuthorizationService` to return and update only the authenticated actor's own safe profile fields.
- Guarded admin local-user endpoints now let authenticated system owners/admins list/read safe user summaries and create normal local users with only the system `user` role. They do not issue sessions, expose credentials, implement invitations, or assign owner/admin roles.
- No general public registration, arbitrary or admin session-revocation, Flutter auth flow, web auth flow, admin UI/auth flow, worker auth behavior, invitation flow, guest/default-excluded/left member runtime behavior, payment details, broader admin user-management, or business endpoints beyond self-profile read/update, group create/list/read/update, and group member management exist yet.

## Runtime Authority Model

The API owns authentication and session validation in server mode.

- Clients must not decide authorization. They may display UI state, cache non-sensitive profile display data, and call generated clients, but server-side policy remains authoritative.
- Workers must not mutate `auth_accounts`, `auth_identities`, `local_password_credentials`, `auth_sessions`, `auth_audit_events`, system role assignments, user profiles, groups, or memberships directly.
- Workers must not create, revoke, rotate, or validate auth sessions.
- Endpoint handlers should stay thin. They should accept transport input, call API/domain auth services, map approved result categories to HTTP responses, and avoid direct credential, token, or session persistence logic.
- Current-user state must be derived from a validated auth account and session boundary, then resolved to the linked active `UserProfile`.
- Client-submitted profile IDs, cached profile records, route parameters, hidden UI controls, and generated client method availability are not proof of the current actor.

Future implementation should keep runtime auth decisions behind cohesive API/domain service boundaries so endpoint handlers, clients, workers, and generated code do not duplicate sensitive policy.

## Sign-In Boundary

The implemented local sign-in endpoint accepts identifier and password input at `POST /api/v1/auth/sign-in`, calls the internal local sign-in orchestration service, maps ordinary failures to a generic `401`, and maps throttled failures to a generic `429` without exposing account, identity, credential, or policy state.

Local sign-in endpoint work is governed by [AUTH_SIGN_IN_ABUSE_POLICY.md](AUTH_SIGN_IN_ABUSE_POLICY.md), which defines account enumeration resistance, rate limiting, lockout/throttling, credential-stuffing defense, audit categories, and operational diagnostics boundaries.

The local sign-in flow should:

- Accept only the minimum identifier and password input needed for the selected sign-in policy.
- Normalize and resolve the local identity safely through an API/domain auth service.
- Verify the active credential through the internal credential workflow boundary.
- Keep endpoint handlers unaware of verifier strings, work factors, hash parameters, salts, pepper metadata, derived key material, and credential row mutation details.
- Avoid account enumeration by mapping missing account, missing local identity, missing credential, wrong password, disabled credential, revoked credential, disabled account, deleted account, and policy-denied sign-in to a uniform public failure shape.
- Apply future rate limiting, credential-stuffing defense, lockout, disabled-account policy, and account-deletion policy before session or token issuance.
- Emit safe audit events for sign-in success, sign-in failure where policy allows it, policy-denied attempts, and operational failures that are security-relevant.
- Create a session or token only after credential verification succeeds and all policy checks pass.

Credential verification alone is not sign-in. It must not authorize business actions or create current-user state until the runtime auth service has completed session issuance and policy checks.

## Implemented First-Owner Local Bootstrap Endpoint

The implemented bootstrap slice adds `GET /api/v1/auth/bootstrap/status` and `POST /api/v1/auth/bootstrap/local-owner`.

- `GET /api/v1/auth/bootstrap/status` is anonymous and returns only `bootstrapRequired`, which is true only when no auth account exists.
- `POST /api/v1/auth/bootstrap/local-owner` is anonymous but allowed only while no auth account exists. It creates a `UserProfile`, `AuthAccount`, local `AuthIdentity`, local password credential through `IAuthCredentialWorkflowService`, and system `owner`, `admin`, and `user` role assignments for the first account.
- The bootstrap write re-checks account absence before persistence and uses a relational transaction with a PostgreSQL table lock for the `auth_accounts` bootstrap gate when running against PostgreSQL, so competing bootstrap requests cannot silently create multiple owners.
- The request normalizes the local identifier consistently with local sign-in, trims display names, accepts only null or uppercase 3-letter default currency values, and applies a temporary bootstrap-only 12 character password minimum until full password policy UX exists.
- The success response returns only a safe self-profile summary and roles. It does not return raw session tokens, refresh credentials, password material, password hash metadata, provider payloads, audit metadata, storage paths, or unrelated records.
- Bootstrap does not create a signed-in session. Clients must call `POST /api/v1/auth/sign-in` after bootstrap succeeds.

This endpoint is not general public registration, invitation acceptance, admin-created account management, password reset, OIDC linking, group membership creation, UI behavior, or worker behavior. After the first account exists, account creation remains unavailable until a separate invitation, admin-management, or self-registration policy is implemented.

## Session And Token Model

Future runtime work should treat sessions and token-like credentials as server-authoritative security state. Refresh-like credential behavior must also follow [AUTH_REFRESH_TOKEN_ROTATION_POLICY.md](AUTH_REFRESH_TOKEN_ROTATION_POLICY.md).

Recommended boundaries:

- Use a short-lived access token, opaque session credential, or equivalent server-mode credential for ordinary request authentication.
- Store refresh-like credential identifiers as hashes only. Do not store raw bearer tokens, raw refresh tokens, raw session IDs, signing keys, or reusable token material.
- Hash session IDs or token IDs when server-side lookup, revocation, or replay detection requires persistence.
- Store issued, expires, revoked, last-seen, and rotated timestamps where needed for enforcement and user security review.
- Enforce expiry, revocation, rotation, replay detection, disabled account handling, deleted account handling, disabled credential handling, and policy-invalid session handling on the server.
- Rotate refresh-like credentials after successful use when that model is selected.
- Detect replay of a rotated or revoked refresh-like credential and revoke the affected session family when policy requires it.
- Store bounded device and session metadata such as display label, client category, coarse network or user-agent metadata, first-seen timestamp, last-seen timestamp, and safe revocation reason.
- Support a user-visible session list later without turning session metadata into unnecessary tracking history.
- Support the implemented current-account session list, per-session revocation, and sign-out-all paths; future account-wide revocation triggers for credential rotation, account disablement, suspected compromise, and policy changes require separate reviewed slices.

This document does not prescribe production secrets, signing algorithms, token libraries, cookie settings, or cryptographic implementation packages. Those choices require a separate implementation review aligned with the existing password hashing and secret-provider boundaries.

## Current-User Endpoint Boundary

The implemented current-user endpoint is the first public read boundary on top of authenticated actor and session validation.

Current and future behavior should:

- Resolve the authenticated `AuthAccount` from the validated credential/session boundary.
- Reject expired, revoked, replayed, disabled, deleted, or policy-invalid sessions uniformly.
- Resolve the linked active `UserProfile` for app-domain identity.
- Return a minimal self profile, auth account, session, and role summary needed by clients to initialize server-mode UI.
- Return only the current actor's data. It must not return unrelated users, groups, memberships, invitations, audit history, or admin-only state.
- Exclude secret fields, raw tokens, token hashes, session hashes, password verifier fields, password hash metadata, provider payloads, storage paths, provider internals, and sensitive operational diagnostics.
- Use uniform unauthenticated response behavior so clients cannot distinguish missing account, missing profile, revoked session, expired session, disabled account, or deleted account unless a future policy explicitly approves a distinction.
- Keep additional OpenAPI auth paths, response schemas, generated-client changes, Flutter integration, web integration, and admin integration in explicit future branches.

The current-user boundary is a read boundary for the authenticated actor. It is not a general user lookup, group membership API, admin user search, audit viewer, or session-management API.

## Implemented Current-User Endpoint

The implemented current-user endpoint is `GET /api/v1/auth/current-user`.

- It is protected by the `Settleora.AuthenticatedUser` policy and the `SettleoraSession` scheme.
- The middleware accepts `Authorization: Bearer <opaque-session-token>`, parses the bearer value through the existing bearer-token reader, and calls `IAuthSessionRuntimeService.ValidateSessionAsync`.
- After middleware validation succeeds, the endpoint resolves the linked non-deleted `UserProfile` server-side and returns system roles from bounded role claims generated from `system_role_assignments`.
- It returns only `authAccountId`, `userProfile.id`, `userProfile.displayName`, `userProfile.defaultCurrency`, `session.id`, `session.expiresAtUtc`, and `roles`.
- It maps missing, malformed, wrong, expired, revoked, inactive, disabled-account, deleted-account, missing-profile, and deleted-profile cases to one uniform `401` problem response.
- It does not expose unrelated users, groups, memberships, invitations, audit history, credential rows, session token hashes, raw tokens, password verifier fields, provider payloads, storage paths, or diagnostics.

This endpoint still does not add login, registration, token issuance, refresh rotation, generated clients, UI/mobile/web/admin behavior, public business endpoint authorization behavior, migrations, package changes, or Docker/CI behavior changes.

## Implemented Auth Middleware And Authorization Handoff

The implemented middleware foundation adds the `SettleoraSession` authentication scheme and the first stable authorization policies.

- `SettleoraSession` runs only when endpoint authorization asks for it; sign-in, refresh, health, readiness, and unmatched routes remain anonymous and do not validate bearer headers by default.
- The scheme reads `Authorization: Bearer <opaque-session-token>` using the existing bearer-token reader and delegates session validity only to `IAuthSessionRuntimeService.ValidateSessionAsync`.
- Successful authentication creates only bounded claims for auth account ID, user profile ID, auth session ID, session expiry, and supported system roles.
- Supported role claims come from `system_role_assignments` and are limited to `owner`, `admin`, and `user`.
- The scheme and actor accessor do not expose or store raw bearer tokens, token hashes, password material, refresh credential material, provider payloads, storage paths, or policy internals in claims or errors.
- `ICurrentActorAccessor` resolves `AuthenticatedActor` from `HttpContext.User` after middleware validation. It does not accept client-submitted profile IDs or route data as actor proof.
- `Settleora.AuthenticatedUser` requires a successfully authenticated Settleora session actor.
- `Settleora.SystemRole.Owner`, `Settleora.SystemRole.Admin`, and `Settleora.SystemRole.User` require the matching generated system role claim.
- Existing authenticated auth endpoints now consume the current actor handoff, while their public OpenAPI contract and response shapes remain unchanged.

## Implemented Local Sign-In Endpoint

The implemented slice adds `POST /api/v1/auth/sign-in`.

- It accepts JSON only with `identifier`, `password`, and optional `deviceLabel`.
- It derives a conservative fixed single-node source bucket internally and does not accept caller-provided source keys.
- It does not parse forwarded proxy headers, store full IP addresses, or pass full user-agent strings in this first endpoint slice.
- It calls `ILocalSignInService.SignInAsync(...)` and keeps endpoint code out of identity lookup, password verification, session persistence, and abuse-policy counter logic.
- The internal service writes bounded sign-in audit events for success, invalid credentials, throttling, and session-creation failure without exposing submitted identifiers, normalized identifiers, identifier keys, source keys, passwords, token material, verifier material, or policy counters.
- It creates refresh-capable access sessions through `IAuthRefreshSessionRuntimeService.CreateRefreshSessionAsync(...)` after local credential verification and sign-in abuse policy checks pass.
- It returns a minimal success response with only `session.id`, `session.token`, `session.expiresAtUtc`, `refreshCredential.token`, `refreshCredential.idleExpiresAtUtc`, and `refreshCredential.absoluteExpiresAtUtc`.
- It returns the raw access-session token and raw refresh-like credential only in the success response and does not return `authAccountId`, `userProfileId`, token hashes, refresh credential IDs, session family IDs, credential status, password metadata, verifier data, audit metadata, provider payloads, storage paths, policy internals, or diagnostics.
- It maps missing account, missing identity, wrong password, disabled/deleted account, invalid request, policy denial, and session creation failure to a uniform public sign-in failure response. Throttled attempts use a uniform public too-many-attempts response.

This endpoint still does not add registration, generated clients, UI/mobile/web/admin behavior, public business endpoint authorization behavior, migrations, package changes, or Docker/CI behavior changes. Separate slices added the public refresh endpoint, sign-out, sign-out-all, session list, session revocation endpoints, and middleware handoff foundation.

## Refresh-Capable Sign-In Contract Decision

Local sign-in now issues refresh-capable sessions by default. After successful local credential verification and sign-in abuse policy checks, the sign-in flow creates an access session, session family, and initial refresh-like credential through `IAuthRefreshSessionRuntimeService.CreateRefreshSessionAsync(...)`. That keeps initial issuance aligned with the existing refresh rotation storage, expiry, replay, and audit model.

The sign-in success response is:

```json
{
  "session": {
    "id": "00000000-0000-0000-0000-000000000000",
    "token": "raw-access-session-token-returned-once",
    "expiresAtUtc": "2026-05-03T00:15:00Z"
  },
  "refreshCredential": {
    "token": "raw-refresh-like-credential-returned-once",
    "idleExpiresAtUtc": "2026-05-10T00:00:00Z",
    "absoluteExpiresAtUtc": "2026-06-02T00:00:00Z"
  }
}
```

This shape intentionally matches the public refresh success envelope: `session.id`, `session.token`, `session.expiresAtUtc`, `refreshCredential.token`, `refreshCredential.idleExpiresAtUtc`, and `refreshCredential.absoluteExpiresAtUtc`. Raw credential material is returned only once. The response does not include refresh credential IDs, session family IDs, token hashes, audit metadata, credential status, revocation reason, replay state, provider payloads, diagnostics, storage paths, or policy internals.

The refresh-capable sign-in response does not include `authAccountId` or `userProfileId`. Clients should call `GET /api/v1/auth/current-user` after sign-in with the returned access-session token to initialize actor, profile, session, and role state. That keeps credential issuance separate from profile bootstrap and ensures account/profile visibility comes from the same validated bearer-session boundary used by the rest of the auth runtime.

The public `LocalSignInRequest` no longer includes `requestedSessionLifetimeMinutes`. Unknown legacy input is ignored by the endpoint JSON reader and cannot lengthen refresh-mode access sessions.

Refresh-capable sign-in-created access sessions use `Settleora:Auth:Sessions:RefreshAccessSessionDefaultLifetime`. They do not use the old no-refresh `CurrentAccessSessionDefaultLifetime`.

Ordinary sign-in failures should continue to map to one generic public `401` sign-in failure response without revealing missing account, missing identity, wrong password, disabled/deleted account, disabled credential, revoked credential, session-family creation, refresh eligibility, or policy-denied state. Throttled attempts may continue to map to one generic public `429` too-many-attempts response without exposing counters, bucket keys, or retry policy internals.

The implementation slice updated endpoint code, focused endpoint tests, the OpenAPI `LocalSignInRequest` and `LocalSignInResponse` schemas, and the relevant docs together. A later reviewed slice generated the web and Dart client foundations from the updated OpenAPI contract.

## Implemented Public Refresh Endpoint

The implemented slice adds `POST /api/v1/auth/refresh`.

- It accepts JSON only with `refreshCredential` and optional `deviceLabel`.
- It does not require or parse bearer auth; the submitted refresh-like credential is the only authentication input for this endpoint.
- It does not accept auth account IDs, user/profile IDs, session IDs, session-family IDs, refresh credential IDs, status, expiry overrides, source keys, revocation flags, or policy inputs.
- It calls `IAuthRefreshSessionRuntimeService.RotateRefreshCredentialAsync(...)` and keeps endpoint code out of credential lookup, hashing, persistence, replay classification, family revocation, account-state checks, and audit writes.
- It returns only `session.id`, `session.token`, `session.expiresAtUtc`, `refreshCredential.token`, `refreshCredential.idleExpiresAtUtc`, and `refreshCredential.absoluteExpiresAtUtc` on success.
- It returns the new raw access-session token and replacement raw refresh-like credential only once, and it does not return the submitted or old refresh-like credential.
- It maps missing, blank, malformed, unknown, expired, revoked, rotated/replayed, inactive, account-unavailable, family-revoked, family-expired, family-replayed, policy-invalid, or otherwise unavailable refresh-like credentials to one generic `401` problem response.
- It maps persistence failures to a generic `500` problem response.
- It does not expose auth account IDs, user profile IDs, session-family IDs, refresh credential IDs, token hashes, audit metadata, credential status, revocation reasons, replay status, account state, provider payloads, diagnostics, storage paths, or policy internals.

This endpoint still does not add generated clients, mobile/web/admin UI behavior, public business endpoint authorization behavior, migrations/schema changes, package changes, Docker/CI behavior changes, password hashing changes, worker behavior, password reset/recovery, MFA/passkeys, or persistent/distributed limiter storage.

## Implemented Current-Session Sign-Out Endpoint

The implemented slice adds `POST /api/v1/auth/sign-out`.

- It is protected by the `Settleora.AuthenticatedUser` policy and the `SettleoraSession` scheme.
- Middleware validation maps missing, malformed, wrong, expired, revoked, inactive, disabled-account, deleted-account, or policy-invalid sessions to the same uniform `401` problem response used by current-user.
- After validation succeeds, the endpoint uses `ICurrentActorAccessor` and calls `IAuthSessionRuntimeService.RevokeSessionAsync` for the same `AuthAccountId` and `AuthSessionId` with the bounded reason `user_sign_out`.
- It returns `204 No Content` on revocation success and also treats a rare already-revoked race after validation as idempotent success.
- It does not require a request body and does not expose raw tokens, session token hashes, account/profile details, credential state, audit metadata, provider payloads, diagnostics, or storage paths.

This endpoint still does not add registration, refresh rotation, arbitrary session revocation, generated clients, UI/mobile/web/admin behavior, public business endpoint authorization behavior, migrations, package changes, or Docker/CI behavior changes.

## Implemented Current-Account Sign-Out-All Endpoint

The implemented slice adds `POST /api/v1/auth/sign-out-all`.

- It is protected by the `Settleora.AuthenticatedUser` policy and the `SettleoraSession` scheme.
- Middleware validation maps missing, malformed, wrong, expired, revoked, inactive, disabled-account, deleted-account, or policy-invalid current sessions to the same uniform `401` problem response used by current-user, current-session sign-out, session list, and per-session revocation.
- After validation succeeds, the endpoint uses `ICurrentActorAccessor` and calls `IAuthSessionRuntimeService.RevokeActiveSessionsForAccountAsync` with the current actor's `AuthAccountId` and bounded reason `user_sign_out_all`.
- The internal session runtime boundary owns the account filter and only revokes active sessions for that authenticated account.
- It revokes the submitted current session and all other active sessions for the same auth account.
- It returns `204 No Content` on success and does not return a count or response body.
- Safe persistence failures return a generic `500` problem response without exposing token, session, account, or provider details.
- It does not accept account IDs, session IDs, user/profile IDs, request body filters, or admin override fields.
- It does not expose raw tokens, session token hashes, refresh token hashes, account/profile details, credential state, audit metadata, provider payloads, diagnostics, ownership hints, or storage paths.

This endpoint still does not add registration, refresh-token generation, refresh rotation, refresh replay detection, arbitrary/admin session revocation, public business endpoint authorization behavior, generated client changes, UI/mobile/web/admin behavior, EF migrations/schema changes, package changes, Docker/CI behavior changes, worker behavior, password reset/recovery, MFA/passkeys, or persistent/distributed limiter storage.

## Implemented Current-Account Session List Endpoint

The implemented slice adds `GET /api/v1/auth/sessions`.

- It is protected by the `Settleora.AuthenticatedUser` policy and the `SettleoraSession` scheme.
- Middleware validation maps missing, malformed, wrong, expired, revoked, inactive, disabled-account, deleted-account, or policy-invalid sessions to the same uniform `401` problem response used by current-user, sign-out, and sign-out-all.
- After validation succeeds, the endpoint uses `ICurrentActorAccessor` and queries only `auth_sessions` rows where `AuthAccountId` matches the current actor.
- It returns a capped list of active, non-revoked, non-expired sessions with only `id`, `isCurrent`, `status`, `issuedAtUtc`, `expiresAtUtc`, `lastSeenAtUtc`, and `deviceLabel`.
- It marks the current validated session with `isCurrent: true`.
- It does not accept account IDs, session IDs, or a request body, and does not expose raw tokens, session token hashes, refresh token hashes, network address hashes, user-agent summaries, revocation reasons, credential state, audit metadata, provider payloads, diagnostics, or storage paths.

This endpoint still does not add registration, refresh rotation, arbitrary/admin session revocation, generated clients, UI/mobile/web/admin behavior, public business endpoint authorization behavior, migrations, package changes, or Docker/CI behavior changes.

## Implemented Current-Account Session Revocation Endpoint

The implemented slice adds `DELETE /api/v1/auth/sessions/{sessionId}`.

- It is protected by the `Settleora.AuthenticatedUser` policy and the `SettleoraSession` scheme.
- It uses the route constraint `{sessionId:guid}`, so invalid session IDs do not hit the endpoint handler.
- Middleware validation maps missing, malformed, wrong, expired, revoked, inactive, disabled-account, deleted-account, or policy-invalid current sessions to the same uniform `401` problem response used by current-user, sign-out, sign-out-all, and session list.
- After validation succeeds, the endpoint uses `ICurrentActorAccessor` and calls `IAuthSessionRuntimeService.RevokeSessionAsync` with the current actor's `AuthAccountId`, requested `sessionId`, and bounded reason `user_session_revoke`.
- It returns `204 No Content` only when revocation succeeds. Missing, not-owned, already revoked, or inactive target sessions return a safe `404` problem response without revealing ownership or target state.
- The endpoint allows revoking the current session itself. That path uses the same `user_session_revoke` reason and leaves the submitted bearer token unusable afterward.
- It does not expose raw tokens, session token hashes, refresh token hashes, account/profile details, credential state, audit metadata, provider payloads, diagnostics, ownership hints, or storage paths.

This endpoint still does not add registration, refresh rotation, arbitrary/admin session revocation, generated clients, UI/mobile/web/admin behavior, public business endpoint authorization behavior, migrations, package changes, or Docker/CI behavior changes.

## Authorization Handoff

Future endpoint authorization should consume authenticated actor context produced by the auth runtime boundary.

- System role checks consume `system_role_assignments` and product policy for owner, admin, and user behavior.
- Group authorization consumes `group_memberships`, group status, group role, and group policy.
- Record authorization consumes ownership, sharing, group participation, record state, privacy policy, and domain-specific rules.
- Policy checks should be centralized in API/domain services rather than copied across endpoint handlers, clients, workers, or generated clients.
- Endpoint handlers should ask for a policy decision or call a domain service that enforces policy before mutating or returning protected data.
- Clients may show or hide controls for usability, but hidden UI is not authorization.
- Workers may publish job results or events, but the API must validate actor, subject, and policy context before worker output affects core server state.

Possessing a `UserProfile` ID, group ID, role-looking string, generated client method, or cached membership row is not enough to access protected data.

## Implemented Business Authorization Foundation

The implemented internal business authorization service is `IBusinessAuthorizationService`.

- It consumes `ICurrentActorAccessor` and `SettleoraDbContext`; clients, generated clients, route parameters, hidden UI controls, and cached state are not actor proof.
- Profile access is currently limited to the current actor's own non-deleted `UserProfile`.
- Group access is currently limited to the current actor's active membership in a non-deleted `UserGroup`.
- Group owner-only decisions are consumed by group member/settings management endpoints; active group members can access basic group participation but cannot perform owner-only actions.
- System `owner`, `admin`, and `user` role detection is available for future admin flows, but system roles do not silently bypass group membership or group owner checks.
- Missing actor, missing profile, missing group, removed membership, unrelated group, and insufficient group role cases fail closed through bounded result categories only.
- Result strings and categories must not include raw tokens, token hashes, password material, provider payloads, storage paths, or unrelated record data.

Current and future endpoints must call this server-side boundary directly or consume a domain service that enforces it before returning or mutating protected profile, group, or business records. Generated clients and UI state still do not authorize access. Workers must not bypass API authorization or mutate auth/profile/group/business tables directly.

The first public consumers are the self-profile and group foundation slices. `GET /api/v1/users/me/profile` and `PATCH /api/v1/users/me/profile` require `Settleora.AuthenticatedUser`, derive the profile ID from `ICurrentActorAccessor`, do not accept client-submitted profile IDs, map missing/deleted/not-allowed profiles to a safe `404`, and expose no auth account, credential, session, token, group membership, audit, provider, storage, or unrelated-user data. `POST /api/v1/groups`, `GET /api/v1/groups`, `GET /api/v1/groups/{groupId}`, and `PATCH /api/v1/groups/{groupId}` require `Settleora.AuthenticatedUser`, derive the acting profile server-side, call `IBusinessAuthorizationService`, list/read only active memberships, create an active owner membership for the creator, and allow group-name updates only for active group owners. `GET /api/v1/groups/{groupId}/members` requires active group membership and returns only active registered members. `POST /api/v1/groups/{groupId}/members`, `PATCH /api/v1/groups/{groupId}/members/{userProfileId}`, and `DELETE /api/v1/groups/{groupId}/members/{userProfileId}` require active group owner permission, add only existing active users with auth accounts, update only group role, and mark removals with status `removed` rather than hard deletion. Last active owner demotion/removal returns `409 Conflict`. These group endpoints do not implement invitations, guest placeholders, default-excluded/left runtime behavior, group presets, delete/archive/restore, billing participation, notifications, expenses, bills, settlements, OCR, or UI behavior. `GET /api/v1/admin/users`, `GET /api/v1/admin/users/{userProfileId}`, and `POST /api/v1/admin/users/local` require `Settleora.SystemRole.OwnerOrAdmin`, derive the actor server-side, assign only the system `user` role to created local users, and return safe summaries without identifier, credential, session, token, provider payload, audit metadata, or storage-path material. They do not implement public self-registration, invitations, role assignment/update, disable/delete/reset password flows, or admin session revocation.

## Audit And Privacy

Runtime auth must emit safe audit events for security-impactful actions. Event names below are examples, not approved enum values.

Recommended event categories:

- Sign-in success.
- Sign-in failure where policy allows recording it.
- Sign-out.
- Refresh, rotation, replay failure, or suspected token compromise.
- Session revocation by user, admin, policy, account disablement, credential rotation, or suspected compromise.
- Current-user access if future policy requires read auditing.
- New-device or unfamiliar-device detection later.
- Disabled, deleted, revoked, expired, or policy-denied session use where safe and useful for investigation.

Audit metadata should identify actor, subject, session, action, outcome, timestamp, correlation ID, safe reason category, and bounded device or network context where policy allows.

Audit metadata must avoid:

- Plaintext passwords.
- Password verifier strings.
- Password hashes.
- Raw tokens.
- Raw session IDs.
- Refresh-token material.
- Signing keys or secret-provider details.
- Reset tokens, recovery codes, MFA secrets, passkey private material, and provider token payloads.
- Full provider payloads.
- Unbounded user-agent, IP, request body, or unnecessary PII.

Retention for audit and session metadata must be policy-driven and bounded. User-visible session metadata may have different retention from security audit records.

## Implemented Internal Session Boundary

The implemented internal service boundary:

- Adds an internal session runtime service for existing active `AuthAccount` rows.
- Creates opaque server-side session tokens with .NET BCL cryptographic randomness, stores only deterministic session token hashes in `auth_sessions`, and returns raw session token material only in the creation result.
- Uses typed `Settleora:Auth:Sessions` current access-session policy values instead of hard-coded service constants, preserving the older direct no-refresh session lifetime default at 8 hours and the configured max at 30 days when this boundary is called directly.
- Validates submitted raw session tokens through hash lookup, rejects missing, expired, revoked, inactive, disabled, or deleted account state with bounded internal statuses, and resolves authenticated actor context to the linked `UserProfile`.
- Updates `last_seen_at_utc` and `updated_at_utc` only after successful validation.
- Revokes sessions by session ID and owning auth account context without requiring raw token material.
- Revokes all active sessions for a validated auth account context without requiring raw token material beyond the initially validated submitted bearer token.
- Writes bounded `auth_audit_events` metadata for session creation, successful validation, matched validation failures, and revocation without raw tokens, token hashes, password material, provider payloads, or unbounded request metadata.

## Implemented Internal Refresh Session Boundary

The implemented internal refresh runtime service boundary:

- Creates refresh-capable access sessions for existing active `AuthAccount` rows using the refresh-mode access-session lifetime from typed `Settleora:Auth:Sessions` policy.
- Creates `auth_session_families` and `auth_refresh_credentials` lineage rows for refresh-like credential continuity.
- Generates raw access-session credentials and raw refresh-like credentials with cryptographic randomness, stores only deterministic hashes, and returns raw values only in internal result objects.
- Rotates submitted raw refresh-like credentials by hash lookup, consumes the old credential, creates a replacement access session and refresh-like credential, links the old credential to the replacement where the current schema supports it, and updates family rotation metadata.
- Classifies expired, revoked, rotated/replayed, inactive, account-unavailable, and persistence-failed conditions through internal statuses suitable for the public refresh endpoint's generic failure mapping.
- Conservatively marks or revokes linked session families and active family access sessions/refresh credentials for replay, expiry, and account-unavailable conditions.
- Writes bounded safe audit metadata for refresh creation, rotation, failure, replay detection, and family revocation without raw tokens, token hashes, password material, provider payloads, secrets, or unnecessary PII.
- Uses a relational transaction and conditional old-credential consume update for PostgreSQL-facing rotation so simultaneous rotations cannot both leave active replacements for the same consumed credential.
- The original internal-runtime slice kept public refresh endpoints and OpenAPI refresh paths/schemas out of scope; the later public refresh slice added only that endpoint/contract layer. The refresh-capable local sign-in slice then updated sign-in runtime behavior, OpenAPI sign-in schemas, and focused tests while generated-client output, middleware, UI integration, migrations, package changes, Docker/CI changes, and password hashing behavior changes remained out of scope. Generated web and Dart client foundations were added later from the reviewed OpenAPI contract.

## Non-goals

This document does not authorize:

- Additional public runtime behavior beyond first-owner local bootstrap, the current-user read, current-account sign-out-all/session list/revocation, current-session sign-out, public refresh, refresh-capable public local sign-in, guarded group member management, and guarded admin local-user foundation behavior above.
- Additional endpoint code beyond first-owner local bootstrap, the current-user read, current-account sign-out-all/session list/revocation, current-session sign-out, public refresh, public local sign-in, self-profile/group foundations, group member management, and guarded admin local-user foundation boundaries.
- Additional OpenAPI auth paths beyond first-owner local bootstrap, local sign-in, public refresh, current-user, current-account sign-out-all/session list/revocation, current-session sign-out, self-profile/group foundations, group member management, and guarded admin local-user foundation paths.
- Additional generated-client changes beyond the existing web/Dart client foundations.
- Additional login endpoint implementation beyond the implemented local sign-in endpoint.
- Additional current-user behavior beyond the implemented read endpoint.
- Additional auth middleware behavior beyond the `SettleoraSession` scheme.
- Public business endpoints or endpoint-specific business authorization behavior beyond the self-profile read/update, group create/list/read/update, and group member management foundation slices.
- UI integration.
- Mobile, web, or admin changes.
- Worker auth behavior.
- EF migrations.
- Schema changes.
- Package changes.
- Docker behavior changes.
- Additional runtime behavior changes.
- Production secret, signing-key, token-library, cookie, or crypto-package choices.

## Next Implementation Candidates

Future branches should stay small and reviewable:

1. Review and merge the guarded group member management foundation.
2. Add group invitation, guest-placeholder, default-excluded/left, and billing participation policy only in separate reviewed slices.
3. Add UI integration over the generated client foundations only in separate reviewed slices.
4. Add admin revocation, retention cleanup, distributed hardening, and business endpoint planning only in separate reviewed slices.
