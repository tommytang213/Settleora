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
- An internal local sign-in orchestration service can normalize local identifiers, check and record sign-in abuse policy results, verify local password credentials, create sessions, and write bounded sign-in audit events.
- `POST /api/v1/auth/sign-in` exposes the first public local sign-in endpoint. It maps ordinary failures to a generic `401`, throttled attempts to a generic `429`, and returns the raw opaque session token only once on success.
- `GET /api/v1/auth/current-user` validates an existing opaque bearer session token through the internal session runtime boundary and returns a minimal current actor, linked profile, session, and system-role summary.
- `POST /api/v1/auth/sign-out` validates the submitted opaque bearer session token and revokes only that current session with a `204` response and no body.
- `POST /api/v1/auth/sign-out-all` validates the submitted opaque bearer session token and revokes all active sessions owned by that current authenticated account with a `204` response and no body.
- `GET /api/v1/auth/sessions` validates the submitted opaque bearer session token and returns capped, safe metadata for active sessions owned by the authenticated account.
- `DELETE /api/v1/auth/sessions/{sessionId}` validates the submitted opaque bearer session token and revokes one active session owned by the authenticated account with a `204` response and no body.

The current EF Core model is limited to schema foundation entities for user profiles, user groups, group memberships, auth accounts, auth identities, system role assignments, local password credentials, auth sessions, auth session families, auth refresh credential history, and auth audit events. The refresh/session-family tables store refresh credential hashes and bounded lineage/status/expiry metadata only; no raw refresh tokens are stored. No registration, public refresh endpoint, arbitrary/admin session revocation endpoints, authorization middleware, raw token storage, user/group business endpoints, expenses, bills, settlements, OCR endpoints, generated clients, or UI behavior exist yet.

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

The current no-refresh sign-in/session runtime uses only `CurrentAccessSessionDefaultLifetime` and `CurrentAccessSessionMaxLifetime`. The internal refresh session runtime uses the refresh-mode access-session lifetime, refresh idle timeout, refresh absolute lifetime, and clock-skew allowance for refresh-like credential creation and rotation. These values still do not add public refresh endpoints, OpenAPI paths, generated clients, middleware, or UI behavior.

The PostgreSQL, RabbitMQ, and storage readiness checks run only when `GET /health/ready` is requested; API startup does not connect to PostgreSQL or RabbitMQ, touch storage, or run migrations. The `/health` and `/health/ready` endpoints do not expose configuration details, storage roots, or physical paths.

Migration apply validation is available from the repo root:

```powershell
npm run validate:api-migrations
```

The command starts PostgreSQL in a unique Docker Compose project, applies the current EF Core migrations to a disposable database by setting `Settleora__Database__ConnectionString` for the EF command, and removes only that validation project's containers and volumes afterward.

The API is the only owner of core business database writes. Business rules, authorization, audit logging, money calculation, rounding, and policy application belong here or in shared backend/domain services.

File metadata will live in PostgreSQL later. File bytes will go through storage abstractions later, and API responses must not expose direct storage or filesystem paths. No upload/download endpoints or file metadata implementation exist yet.

In server-mode, the API is authoritative for accepting OCR-derived records. OCR-derived client data is provisional until validated and accepted by the API. No OCR endpoints exist yet.
