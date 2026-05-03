# Auth Runtime And Current-User Design

This document defines the Settleora auth runtime boundary for local-account sign-in, server-side session creation and validation, token or refresh-token issuance boundaries, current-user behavior, authenticated actor resolution, auth audit integration, and authorization handoff.

It started as a design gate. The current repository now includes the explicitly scoped local sign-in endpoint, current-user read endpoint, current-session sign-out endpoint, and current-account session list endpoint described below; remaining auth runtime work still requires separate reviewed branches before registration, refresh-token runtime, session management beyond current-session sign-out/list, generated clients, middleware, UI integration, migrations, package changes, Docker changes, or worker behavior are added.

## Current State

- Schema foundations exist for user profiles, groups, memberships, auth accounts, auth identities, system role assignments, local password credentials, auth sessions, and auth audit events.
- `auth_accounts` links one server-side auth account root to one `UserProfile`.
- `auth_identities` stores provider links without raw provider tokens.
- `local_password_credentials` stores password verifier metadata and no plaintext passwords, reset tokens, recovery codes, passkeys, or MFA secrets.
- `auth_sessions` stores metadata and token hashes only. It is a foundation for future session lookup, expiry, revocation, and replay detection.
- `auth_audit_events` stores bounded auth audit metadata and must not contain raw secrets, raw tokens, password material, verifier strings, MFA secrets, passkey private material, full provider payloads, or unnecessary PII.
- Internal password hashing and credential workflow service boundaries exist for Argon2id verifier creation, EF-backed local password credential creation, verification, safe audit writes, and rehash after successful verification.
- An internal sign-in abuse policy service boundary exists for endpoint-independent pre-verification throttling decisions and post-result in-memory attempt recording.
- An internal local sign-in orchestration service boundary exists for endpoint-independent local identifier normalization, local identity/account resolution, abuse-policy checks and attempt recording, credential verification, session creation, and safe sign-in-specific audit writes.
- `POST /api/v1/auth/sign-in` now exists as the first public local sign-in endpoint.
- `GET /api/v1/auth/current-user` now exists as the first public auth read endpoint for validating an existing opaque session token and returning a minimal current actor/profile/session/role summary.
- `POST /api/v1/auth/sign-out` now exists as a focused public endpoint for revoking only the current validated bearer session.
- `GET /api/v1/auth/sessions` now exists as a focused public endpoint for listing safe active-session metadata owned by the authenticated auth account.
- No public registration, sign-out-all, arbitrary session-revocation, authorization middleware, refresh-token runtime, generated auth clients, Flutter auth flow, web auth flow, admin auth flow, worker auth behavior, or business endpoints exist yet.

## Runtime Authority Model

The API owns authentication and session validation in server mode.

- Clients must not decide authorization. They may display UI state, cache non-sensitive profile display data, and call generated clients later, but server-side policy remains authoritative.
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

## Session And Token Model

Future runtime work should treat sessions and token-like credentials as server-authoritative security state.

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
- Support per-session revocation and account-wide revocation later for sign-out-all, credential rotation, account disablement, suspected compromise, and policy changes.

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
- Keep additional OpenAPI auth paths, response schemas, generated web clients, generated Dart clients, Flutter integration, web integration, and admin integration in explicit future branches.

The current-user boundary is a read boundary for the authenticated actor. It is not a general user lookup, group membership API, admin user search, audit viewer, or session-management API.

## Implemented Current-User Endpoint

The implemented slice adds `GET /api/v1/auth/current-user`.

- It accepts `Authorization: Bearer <opaque-session-token>` and parses the bearer value inside the endpoint boundary rather than adding global auth middleware.
- It calls `IAuthSessionRuntimeService.ValidateSessionAsync` and relies on the internal session runtime to reject missing, wrong, expired, revoked, inactive, disabled-account, deleted-account, or policy-invalid sessions.
- After validation succeeds, it resolves the linked non-deleted `UserProfile` server-side and loads `system_role_assignments` for the authenticated auth account.
- It returns only `authAccountId`, `userProfile.id`, `userProfile.displayName`, `userProfile.defaultCurrency`, `session.id`, `session.expiresAtUtc`, and `roles`.
- It maps missing, malformed, wrong, expired, revoked, inactive, disabled-account, deleted-account, missing-profile, and deleted-profile cases to one uniform `401` problem response.
- It does not expose unrelated users, groups, memberships, invitations, audit history, credential rows, session token hashes, raw tokens, password verifier fields, provider payloads, storage paths, or diagnostics.

This slice deliberately does not add login, registration, token issuance, refresh rotation, sign-out, session list/revocation endpoints, generated clients, UI/mobile/web/admin behavior, authorization middleware, authorization handlers, migrations, package changes, or Docker/CI behavior changes.

## Implemented Local Sign-In Endpoint

The implemented slice adds `POST /api/v1/auth/sign-in`.

- It accepts JSON only with `identifier`, `password`, optional `deviceLabel`, and optional bounded `requestedSessionLifetimeMinutes`.
- It derives a conservative fixed single-node source bucket internally and does not accept caller-provided source keys.
- It does not parse forwarded proxy headers, store full IP addresses, or pass full user-agent strings in this first endpoint slice.
- It calls `ILocalSignInService.SignInAsync(...)` and keeps endpoint code out of identity lookup, password verification, session persistence, and abuse-policy counter logic.
- The internal service writes bounded sign-in audit events for success, invalid credentials, throttling, and session-creation failure without exposing submitted identifiers, normalized identifiers, identifier keys, source keys, passwords, token material, verifier material, or policy counters.
- It returns a minimal success response with `authAccountId`, `userProfileId`, `session.id`, `session.token`, and `session.expiresAtUtc`.
- It returns the raw opaque session token only in the success response and does not return token hashes, credential status, password metadata, verifier data, audit metadata, provider payloads, storage paths, or diagnostics.
- It maps missing account, missing identity, wrong password, disabled/deleted account, invalid request, policy denial, and session creation failure to a uniform public sign-in failure response. Throttled attempts use a uniform public too-many-attempts response.

This slice deliberately does not add registration, sign-out, refresh rotation, session list/revocation endpoints, generated clients, UI/mobile/web/admin behavior, authorization middleware, authorization handlers, migrations, package changes, or Docker/CI behavior changes.

## Implemented Current-Session Sign-Out Endpoint

The implemented slice adds `POST /api/v1/auth/sign-out`.

- It accepts `Authorization: Bearer <opaque-session-token>` and parses the bearer value inside the endpoint boundary rather than adding global auth middleware.
- It calls `IAuthSessionRuntimeService.ValidateSessionAsync` first and maps missing, malformed, wrong, expired, revoked, inactive, disabled-account, deleted-account, or policy-invalid sessions to the same uniform `401` problem response used by current-user.
- After validation succeeds, it calls `IAuthSessionRuntimeService.RevokeSessionAsync` for the same `AuthAccountId` and `AuthSessionId` with the bounded reason `user_sign_out`.
- It returns `204 No Content` on revocation success and also treats a rare already-revoked race after validation as idempotent success.
- It does not require a request body and does not expose raw tokens, session token hashes, account/profile details, credential state, audit metadata, provider payloads, diagnostics, or storage paths.

This slice deliberately does not add registration, refresh rotation, session list, sign-out-all, arbitrary session revocation, generated clients, UI/mobile/web/admin behavior, authorization middleware, authorization handlers, migrations, package changes, or Docker/CI behavior changes.

## Implemented Current-Account Session List Endpoint

The implemented slice adds `GET /api/v1/auth/sessions`.

- It accepts `Authorization: Bearer <opaque-session-token>` and parses the bearer value inside the endpoint boundary rather than adding global auth middleware.
- It calls `IAuthSessionRuntimeService.ValidateSessionAsync` first and maps missing, malformed, wrong, expired, revoked, inactive, disabled-account, deleted-account, or policy-invalid sessions to the same uniform `401` problem response used by current-user and sign-out.
- After validation succeeds, it queries only `auth_sessions` rows where `AuthAccountId` matches the validated actor.
- It returns a capped list of active, non-revoked, non-expired sessions with only `id`, `isCurrent`, `status`, `issuedAtUtc`, `expiresAtUtc`, `lastSeenAtUtc`, and `deviceLabel`.
- It marks the current validated session with `isCurrent: true`.
- It does not accept account IDs, session IDs, or a request body, and does not expose raw tokens, session token hashes, refresh token hashes, network address hashes, user-agent summaries, revocation reasons, credential state, audit metadata, provider payloads, diagnostics, or storage paths.

This slice deliberately does not add registration, refresh rotation, sign-out-all, arbitrary session revocation, generated clients, UI/mobile/web/admin behavior, authorization middleware, authorization handlers, migrations, package changes, or Docker/CI behavior changes.

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
- Validates submitted raw session tokens through hash lookup, rejects missing, expired, revoked, inactive, disabled, or deleted account state with bounded internal statuses, and resolves authenticated actor context to the linked `UserProfile`.
- Updates `last_seen_at_utc` and `updated_at_utc` only after successful validation.
- Revokes sessions by session ID and owning auth account context without requiring raw token material.
- Writes bounded `auth_audit_events` metadata for session creation, successful validation, matched validation failures, and revocation without raw tokens, token hashes, password material, provider payloads, or unbounded request metadata.
- TODO: Add refresh-token generation, refresh rotation, and replay detection in a future reviewed branch; this slice also keeps additional public auth endpoints, generated clients, middleware, UI integration, migrations, and Docker behavior changes out of scope.

## Non-goals

This document does not authorize:

- Additional runtime implementation beyond the current-user read, current-account session list, current-session sign-out, and public local sign-in boundaries.
- Additional endpoint code beyond the current-user read, current-account session list, current-session sign-out, and public local sign-in boundaries.
- Additional OpenAPI auth paths beyond local sign-in, current-user, current-account session list, and current-session sign-out.
- Generated clients.
- Additional login endpoint implementation.
- Additional current-user behavior beyond the implemented read endpoint.
- Refresh-token issuance implementation.
- Session middleware implementation.
- Authorization handlers.
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

1. Add account-wide revocation or user-visible per-session revocation later, with privacy retention rules and response shapes reviewed separately.
2. Add refresh-token generation, refresh rotation, and replay detection only after token lifetime and replay policy are reviewed.
3. Add auth middleware and authorization handoff after endpoint-level behavior is proven.
