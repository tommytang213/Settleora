# Settleora

Settleora is a self-hosted cross-platform expense management, shared bill tracking, settlement workflow, receipt OCR, recurring bill, forecasting, and reconciliation platform.

This repository is currently in scaffold materialization. It preserves the existing Flutter mobile app and adds a minimal backend API scaffold, placeholder structure for the future OCR worker, web portals, generated clients, contracts, and local infrastructure. Business features are not implemented yet.

## Key References

- [Program architecture](PROGRAM_ARCHITECTURE.md)
- [MVP Day 1 scope](docs/prd/MVP_DAY1_SCOPE.md)
- [Day 2 scope](docs/prd/DAY2_SCOPE.md)
- [Day 3 AI insights scope](docs/prd/DAY3_AI_INSIGHTS_SCOPE.md)
- [Auth identity foundation](docs/architecture/AUTH_IDENTITY_FOUNDATION.md)
- [Auth credentials, sessions, and audit design](docs/architecture/AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md)
- [Auth credential workflow design](docs/architecture/AUTH_CREDENTIAL_WORKFLOW_DESIGN.md)
- [Auth runtime and current-user design](docs/architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md)
- [Auth refresh-token rotation policy](docs/architecture/AUTH_REFRESH_TOKEN_ROTATION_POLICY.md)
- [Auth sign-in abuse policy](docs/architecture/AUTH_SIGN_IN_ABUSE_POLICY.md)
- [Password hashing policy](docs/architecture/PASSWORD_HASHING_POLICY.md)
- [Password hashing implementation design](docs/architecture/PASSWORD_HASHING_IMPLEMENTATION_DESIGN.md)
- [Database foundation](docs/architecture/DATABASE_FOUNDATION.md)
- [Privacy vault architecture](docs/architecture/PRIVACY_VAULT_ARCHITECTURE.md)
- [Architecture docs index](docs/architecture/)
- [OCR architecture](docs/architecture/OCR_ARCHITECTURE.md)
- [Product requirements](docs/prd/)
- [Codex task guide](docs/workflow/CODEX_TASK_GUIDE.md)
- [Workflow guidance](docs/workflow/)
- [OpenAPI contract](packages/contracts/openapi/settleora.v1.yaml)
- [Local infrastructure compose](infra/docker-compose.yml)

## Current Scaffold

- `apps/mobile/` existing Flutter mobile app.
- `apps/web-user/` placeholder for the future React + Vite user portal.
- `apps/web-admin/` placeholder for the future React + Vite admin portal.
- `services/api/` ASP.NET Core Web API scaffold with `GET /health`, PostgreSQL/RabbitMQ/storage readiness at `GET /health/ready`, the first API-owned users/groups plus auth schema foundations, an internal password hashing service boundary, an internal credential workflow service boundary, internal session and refresh-session runtime service boundaries, internal sign-in abuse policy and local sign-in orchestration service boundaries, first-owner local bootstrap endpoints at `GET /api/v1/auth/bootstrap/status` and `POST /api/v1/auth/bootstrap/local-owner`, `POST /api/v1/auth/sign-in` for local sign-in, `POST /api/v1/auth/refresh` for rotating a submitted refresh-like credential, `GET /api/v1/auth/current-user` for validating an existing opaque session token into a minimal current actor/profile/session/role summary, current-account session endpoints, the first `SettleoraSession` bearer authentication/current-actor/authorization policy foundation, an internal business authorization service foundation, guarded self-profile read/update endpoints at `GET /api/v1/users/me/profile` and `PATCH /api/v1/users/me/profile`, and guarded group foundation endpoints at `POST /api/v1/groups`, `GET /api/v1/groups`, `GET /api/v1/groups/{groupId}`, and `PATCH /api/v1/groups/{groupId}`.
- API runtime configuration placeholders exist for PostgreSQL, RabbitMQ, storage, password hashing policy, and auth session lifetime policy. The API connects to PostgreSQL and RabbitMQ and checks local storage only for the readiness check. EF Core infrastructure and migrations define schema-only user profile, group, group membership, auth account, auth identity, system role assignment, local password credential, auth session, auth session family, auth refresh credential history, and auth audit event tables. Credential/session/audit tables are persistence foundations only: local password rows store password hash metadata, session rows store token hashes, refresh/session-family rows store refresh credential hashes plus bounded lineage/status/expiry metadata, and audit rows store bounded safe metadata. The local-owner bootstrap path exists only for fresh deployments with no auth accounts; it creates the first local owner/admin/user account and returns no session tokens, so clients still sign in through `POST /api/v1/auth/sign-in` afterward. The public auth endpoints keep raw credential material out of storage and responses except for one-time sign-in/refresh success credentials. The `SettleoraSession` scheme validates opaque bearer session tokens through the session runtime boundary for current-user, sign-out, sign-out-all, session list, per-session revocation, self-profile endpoints, and group foundation endpoints. Those endpoints consume the server-side current actor accessor, and bootstrap status/local-owner, sign-in, refresh, and health remain anonymous. Self-profile read/update and group create/list/read/update use server-side business authorization, accept no client-submitted profile or owner IDs, and return no auth/session/credential/token internals. Creating a group creates an active owner membership for the creator. OpenAPI remains the source of truth; run `npm run generate:clients` after contract changes and review generated web/Dart diffs. General public registration, invitations, group member management, admin user management, group delete/archive/restore, guest/default-excluded/left membership runtime behavior, group presets, payment details, payment QR storage, mobile/web/admin UI behavior, messaging workflows, upload/download endpoints, expenses, bills, settlements, OCR endpoints, and broader business database workflows are not implemented yet.
- `services/worker-ocr/` placeholder for the future Python OCR worker.
- `packages/contracts/` OpenAPI contract source.
- `packages/client-web/` generated web client output from the OpenAPI contract.
- `packages/client-dart/` generated Dart/Flutter client output from the OpenAPI contract.
- `infra/` local development infrastructure scaffold.

The API can be run through Docker Compose once Docker is available:

```powershell
docker compose --env-file infra/env/.env.example -f infra/docker-compose.yml up --build postgres rabbitmq api
```

The health endpoint is available at `http://localhost:8080/health` by default. PostgreSQL, RabbitMQ, and storage readiness is available at `http://localhost:8080/health/ready` when the API is run with configured dependency settings. Future file bytes must go through the storage abstraction, and API responses must not expose physical storage paths.

## Scaffold Validation

Current validation covers scaffold paths, the OpenAPI contract, generated client freshness, API tests, and Docker Compose config. It does not build or test mobile, web, or worker apps yet.

```powershell
npm ci
npm run validate
```

`npm run validate` runs the same checks listed below in order and stops on the first failure with the failed subcommand and exit code.

Generate OpenAPI clients after contract changes:

```powershell
npm run generate:clients
npm run validate:clients
```

Individual checks:

```powershell
npm run validate:scaffold
npm run validate:openapi
npm run generate:clients
npm run validate:clients
npm run validate:api
npm run validate:compose
npm run validate:api-docker
npm run validate:api-runtime
npm run validate:api-migrations
```

Docker must be available for `validate:compose`, `validate:api-docker`, `validate:api-runtime`, and `validate:api-migrations`.
`validate:api-docker` builds the API image only. `validate:api-runtime` starts PostgreSQL, RabbitMQ, and the API through Docker Compose, polls `http://localhost:8080/health/ready` for HTTP 200 with JSON status `ready`, and then stops the stack without deleting persistent Docker volumes.
`validate:api-migrations` starts only PostgreSQL through Docker Compose with a unique project name and a disposable volume, applies the current EF Core migrations to that disposable database, and removes only that validation project's resources afterward. Set `SETTLEORA_MIGRATION_VALIDATION_POSTGRES_PORT` to force a specific temporary PostgreSQL host port.
