# Settleora API

This directory contains the ASP.NET Core Web API scaffold.

Current implementation:

- `GET /health` returns a stable JSON health response.
- `GET /health/ready` checks PostgreSQL, RabbitMQ, and local storage readiness with configured dependency settings and returns no connection details or physical paths.
- Integration tests cover the health and readiness endpoints.
- `services/api/Dockerfile` packages this API scaffold for local compose usage.
- Typed runtime configuration placeholders are bound for PostgreSQL, RabbitMQ, storage, password hashing policy, and auth session lifetime policy.
- EF Core runtime registration, design-time tooling, and schema-only migrations exist for API-owned PostgreSQL persistence.
- An internal password hashing service boundary can create and verify Argon2id password verifiers.
- Internal credential and session runtime service boundaries can create/verify local password credentials and create/validate/revoke auth sessions for existing active auth accounts.
- An internal refresh session runtime service boundary can create refresh-capable session families and rotate refresh-like credentials for existing active auth accounts while storing only deterministic credential hashes and bounded lineage/audit metadata.
- An internal local sign-in orchestration service can normalize local identifiers, check and record sign-in abuse policy results, verify local password credentials, create refresh-capable sessions, and write bounded sign-in audit events.
- `GET /api/v1/auth/bootstrap/status` exposes a bounded anonymous setup status with only `bootstrapRequired`.
- `POST /api/v1/auth/bootstrap/local-owner` exposes a first-owner local bootstrap path only while no auth account exists. It creates the initial profile, auth account, local identity, local password credential through `IAuthCredentialWorkflowService`, and `owner`/`admin`/`user` role assignments; it returns only the safe profile summary and roles. It does not return session tokens, refresh credentials, password material, provider payloads, audit metadata, storage paths, or unrelated records, and clients must sign in normally after bootstrap.
- `POST /api/v1/auth/sign-in` exposes the public local sign-in endpoint. It maps ordinary failures to a generic `401`, throttled attempts to a generic `429`, and returns the raw access-session token plus initial raw refresh-like credential only once on success.
- `POST /api/v1/auth/refresh` exposes the first public refresh endpoint. It accepts only a submitted refresh-like credential and optional device label, maps ordinary refresh failures to a generic `401`, maps persistence failures to a generic `500`, and returns the new raw access-session token plus replacement refresh-like credential only once on success.
- `GET /api/v1/auth/current-user` validates an existing opaque bearer session token through the internal session runtime boundary and returns a minimal current actor, linked profile, session, and system-role summary.
- `POST /api/v1/auth/sign-out` validates the submitted opaque bearer session token and revokes only that current session with a `204` response and no body.
- `POST /api/v1/auth/sign-out-all` validates the submitted opaque bearer session token and revokes all active sessions owned by that current authenticated account with a `204` response and no body.
- `GET /api/v1/auth/sessions` validates the submitted opaque bearer session token and returns capped, safe metadata for active sessions owned by the authenticated account.
- `DELETE /api/v1/auth/sessions/{sessionId}` validates the submitted opaque bearer session token and revokes one active session owned by the authenticated account with a `204` response and no body.
- `SettleoraSession` is the first API bearer authentication scheme. It reads `Authorization: Bearer <opaque-session-token>`, validates only through `IAuthSessionRuntimeService.ValidateSessionAsync`, emits bounded auth account/user profile/session/role claims, and backs `Settleora.AuthenticatedUser`, `Settleora.SystemRole.Owner`, `Settleora.SystemRole.Admin`, and `Settleora.SystemRole.User` policies. `ICurrentActorAccessor` exposes the authenticated actor to endpoints after middleware validation.
- `IBusinessAuthorizationService` is the first internal business authorization service foundation. It lets endpoint/domain code ask one server-side boundary about own-profile access, group access through active membership, group owner-only membership/settings management, and system-role detection.
- `GET /api/v1/users/me/profile` and `PATCH /api/v1/users/me/profile` expose the first guarded business endpoint slice. They require `Settleora.AuthenticatedUser`, derive profile identity from the server-side current actor, call `IBusinessAuthorizationService`, and return only safe self-profile fields. The PATCH endpoint updates only `displayName` and `defaultCurrency`, trims display names, rejects blank or overlong display names, rejects non-uppercase currency codes, and allows explicit `null` to clear `defaultCurrency`.
- `POST /api/v1/groups`, `GET /api/v1/groups`, `GET /api/v1/groups/{groupId}`, and `PATCH /api/v1/groups/{groupId}` expose the first guarded group foundation endpoint slice. They require `Settleora.AuthenticatedUser`, derive the actor profile from `ICurrentActorAccessor`, call `IBusinessAuthorizationService`, return only groups where the actor has active membership, and allow group-name updates only for active group owners. Creating a group creates an active owner membership for the creator and never accepts creator, owner, or member IDs from clients.
- `GET /api/v1/groups/{groupId}/members`, `POST /api/v1/groups/{groupId}/members`, `PATCH /api/v1/groups/{groupId}/members/{userProfileId}`, and `DELETE /api/v1/groups/{groupId}/members/{userProfileId}` expose the guarded group member management foundation for existing registered users. Active group members can list active members; active group owners can add existing active users with auth accounts, update `owner`/`member` group roles, and mark active memberships `removed` with no hard delete. Last active owner demotion/removal returns `409 Conflict`. This is not invitations, guest placeholders, default-excluded/left runtime behavior, notification behavior, billing participation defaults, or UI integration.
- `GET /api/v1/admin/users`, `GET /api/v1/admin/users/{userProfileId}`, and `POST /api/v1/admin/users/local` expose the first guarded admin local-user foundation. They require `SettleoraSession` plus system `owner` or `admin`, do not allow ordinary `user` role access, derive the actor server-side, create normal local users with only the system `user` role, and return no session tokens, refresh credentials, password material, credential metadata, provider payloads, audit metadata, or storage paths. This is not public self-registration, not invitations, and not owner/admin role assignment.

The current EF Core model is limited to schema foundation entities for user profiles, user groups, group memberships, auth accounts, auth identities, system role assignments, local password credentials, auth sessions, auth session families, auth refresh credential history, and auth audit events. The refresh/session-family tables store refresh credential hashes and bounded lineage/status/expiry metadata only; no raw refresh tokens are stored. Public local sign-in now issues refresh-capable access sessions plus initial refresh-like credentials and does not return `authAccountId` or `userProfileId`; clients should call `GET /api/v1/auth/current-user` after sign-in to initialize actor/profile/session/role state. First-owner local bootstrap is setup-only and becomes unavailable as soon as any auth account exists; after that, account creation is limited to the guarded owner/admin local-user foundation until invitations or self-registration policy are implemented separately. Generated web and Dart clients come from the OpenAPI contract; run `npm run generate:clients` after OpenAPI changes and review the generated diff. No general registration, invitations, broader admin user management, owner/admin role assignment, group delete/archive/restore, guest/default-excluded/left membership runtime behavior, group presets, payment details or payment QR storage, arbitrary/admin session revocation endpoints, raw token storage, expenses, bills, settlements, OCR endpoints, or UI behavior exists yet.

Configuration sections:

- `Settleora:Database`
- `Settleora:RabbitMq`
- `Settleora:Storage`
- `Settleora:Auth:PasswordHashing`
- `Settleora:Auth:Sessions`

Safe session lifetime configuration uses duration values only:

```json
{
  "Settleora": {
    "Auth": {
      "Sessions": {
        "CurrentAccessSessionDefaultLifetime": "08:00:00",
        "CurrentAccessSessionMaxLifetime": "30.00:00:00",
        "RefreshAccessSessionDefaultLifetime": "00:15:00",
        "RefreshAccessSessionMaxLifetime": "00:30:00",
        "RefreshIdleTimeout": "7.00:00:00",
        "RefreshAbsoluteLifetime": "30.00:00:00",
        "ClockSkewAllowance": "00:02:00"
      }
    }
  }
}
```

The older no-refresh session runtime uses `CurrentAccessSessionDefaultLifetime` and `CurrentAccessSessionMaxLifetime` when called directly. The internal refresh session runtime, public refresh endpoint, and public local sign-in endpoint use the refresh-mode access-session lifetime, refresh idle timeout, refresh absolute lifetime, and clock-skew allowance for refresh-like credential creation and rotation. Public local sign-in no longer accepts `requestedSessionLifetimeMinutes`; unknown legacy input is ignored and cannot lengthen refresh-mode access sessions. These values do not control middleware, UI behavior, authorization behavior, or additional generated-client behavior.

The PostgreSQL, RabbitMQ, and storage readiness checks run only when `GET /health/ready` is requested; API startup does not connect to PostgreSQL or RabbitMQ, touch storage, or run migrations. The `/health` and `/health/ready` endpoints do not expose configuration details, storage roots, or physical paths.

Migration apply validation is available from the repo root:

```powershell
npm run validate:api-migrations
```

The command starts PostgreSQL in a unique Docker Compose project, applies the current EF Core migrations to a disposable database by setting `Settleora__Database__ConnectionString` for the EF command, and removes only that validation project's containers and volumes afterward.

The API is the only owner of core business database writes. Business rules, authorization, audit logging, money calculation, rounding, and policy application belong here or in shared backend/domain services.

File metadata will live in PostgreSQL later. File bytes will go through storage abstractions later, and API responses must not expose direct storage or filesystem paths. No upload/download endpoints or file metadata implementation exist yet.

In server-mode, the API is authoritative for accepting OCR-derived records. OCR-derived client data is provisional until validated and accepted by the API. No OCR endpoints exist yet.
