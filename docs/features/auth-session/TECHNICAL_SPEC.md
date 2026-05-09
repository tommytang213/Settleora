# Auth and Session Technical Spec

## Purpose

Define implementation boundaries for authentication, current actor resolution, sessions, and security audit behavior.

This document must stay aligned with:

- `PROGRAM_ARCHITECTURE.md`
- `docs/architecture/AUTH_IDENTITY_FOUNDATION.md`
- `docs/architecture/AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md`
- `docs/architecture/PASSWORD_HASHING_POLICY.md`

## Architecture boundaries

- API owns auth/session/credential/audit writes.
- Clients never decide authorization.
- `UserProfile` is app-domain identity, not proof of authentication.
- Auth account/session boundaries resolve the current actor.
- Workers must not mutate auth tables or bypass the API.
- Raw tokens, password material, provider secrets, and MFA/passkey secrets must not be logged, audited, or returned.

## Domain concepts

Suggested service boundaries:

```text
ICurrentActorAccessor
IAuthSessionService
ILocalCredentialService
IAuthAuditWriter
IAuthorizationPolicyService
```

Current actor should expose only safe identity and role context needed by app-domain services.

## API direction

Future auth endpoints may include:

```text
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
GET  /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/{sessionId}
POST /api/v1/auth/sessions/revoke-others
```

Endpoints must be added through OpenAPI first when public client contracts are introduced.

## Persistence direction

Existing schema foundations include:

- `auth_accounts`
- `auth_identities`
- `system_role_assignments`
- `local_password_credentials`
- `auth_sessions`
- `auth_audit_events`

Future schema changes must remain explicit migrations and reviewed for:

- token hash storage only
- expiry/revocation correctness
- indexes for account/session lookup
- audit retention implications
- destructive operation risk

## Session handling

Sessions should support:

- short-lived access where practical
- bounded refresh/session lifetime
- revocation
- replay/rotation protections where refresh-like credentials exist
- last-seen metadata
- safe device labels
- account-wide revocation when policy requires

Session IDs/tokens must be stored only as hashes if persisted.

## Password/local credential handling

- Password hashing stays inside an internal service boundary.
- Prefer Argon2id under approved policy.
- No endpoint handler should parse password hashes or compare secrets directly.
- Rehash can occur only after successful verification and policy decision.
- Failed verification must not rehash.

## Authorization

Authorization checks must use:

- authenticated account/session
- linked active user profile
- system role assignment where relevant
- group membership where relevant
- record ownership/sharing state
- policy requirements

Do not infer authorization from hidden UI, route availability, cached data, or generated client method existence.

## Audit requirements

Audit events should cover:

- sign-in success/failure where safe
- sign-out
- session revoked/expired/replayed
- new device/session
- account created/disabled/re-enabled/deleted
- identity linked/unlinked
- credential created/rotated/revoked/reset
- role assignment/removal
- policy changes

Audit metadata must avoid raw secrets, raw tokens, password material, full provider payloads, and unnecessary PII.

## Validation and tests

Required test categories:

- successful login creates session
- failed login does not reveal account existence
- revoked/expired sessions are denied
- current actor resolves correct profile
- disabled account cannot authenticate
- user cannot access another user's session list
- session revocation audit written
- denied authorization paths tested
- token/hash material not returned by API contracts

Validation commands for implementation branches:

```powershell
dotnet tool restore
dotnet restore
dotnet build
dotnet test
npm run validate:openapi
npm run validate:api
```

## Failure modes

Handle:

- database unavailable
- duplicate session revocation request
- stale session
- account disabled mid-session
- provider unavailable
- clock skew where token expiry is involved
- audit write failure policy decision

## Non-goals

- Implementing passkeys/MFA without separate design.
- Storing raw OAuth/OIDC tokens in ordinary auth tables.
- Client-side authorization.
- Password reset/recovery without reviewed token storage design.
- Silent production migration of credential material.
