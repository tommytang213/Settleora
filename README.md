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
- [Password hashing policy](docs/architecture/PASSWORD_HASHING_POLICY.md)
- [Password hashing implementation design](docs/architecture/PASSWORD_HASHING_IMPLEMENTATION_DESIGN.md)
- [Database foundation](docs/architecture/DATABASE_FOUNDATION.md)
- [Architecture docs index](docs/architecture/)
- [OCR architecture](docs/architecture/OCR_ARCHITECTURE.md)
- [Product requirements](docs/prd/)
- [Codex task guide](docs/workflow/CODEX_TASK_GUIDE.md)
- [Workflow guidance](docs/workflow/)
- [OpenAPI placeholder](packages/contracts/openapi/settleora.v1.yaml)
- [Local infrastructure compose](infra/docker-compose.yml)

## Current Scaffold

- `apps/mobile/` existing Flutter mobile app.
- `apps/web-user/` placeholder for the future React + Vite user portal.
- `apps/web-admin/` placeholder for the future React + Vite admin portal.
- `services/api/` ASP.NET Core Web API scaffold with `GET /health`, PostgreSQL/RabbitMQ/storage readiness at `GET /health/ready`, the first API-owned users/groups plus auth schema foundations, an internal password hashing service boundary, an internal credential workflow service boundary, an internal session runtime service boundary, and `GET /api/v1/auth/current-user` for validating an existing opaque session token into a minimal current actor/profile/session/role summary.
- API runtime configuration placeholders exist for PostgreSQL, RabbitMQ, storage, and password hashing policy. The API connects to PostgreSQL and RabbitMQ and checks local storage only for the readiness check. EF Core infrastructure and migrations define schema-only user profile, group, group membership, auth account, auth identity, system role assignment, local password credential, auth session, and auth audit event tables. Credential/session/audit tables are persistence foundations only: local password rows store password hash metadata, session rows store token hashes, and audit rows store bounded safe metadata. The internal password hashing service can create and verify Argon2id password verifiers, the internal credential workflow service can create and verify EF-backed local password credentials for existing auth accounts, and the internal session runtime service can create, validate, and revoke EF-backed auth sessions while storing token hashes only and writing bounded session audit events. The public current-user endpoint validates existing opaque bearer session tokens through that runtime boundary. Public registration, login behavior, public token issuance endpoints, sign-out endpoints, session list/revocation endpoints, session middleware, authorization handlers, business endpoints, messaging workflows, upload/download endpoints, file metadata, expenses, bills, settlements, OCR endpoints, and business database workflows are not implemented yet.
- `services/worker-ocr/` placeholder for the future Python OCR worker.
- `packages/contracts/` placeholder OpenAPI contract source.
- `packages/client-web/` future generated web client output.
- `packages/client-dart/` future generated Dart/Flutter client output.
- `infra/` local development infrastructure scaffold.

The API can be run through Docker Compose once Docker is available:

```powershell
docker compose --env-file infra/env/.env.example -f infra/docker-compose.yml up --build postgres rabbitmq api
```

The health endpoint is available at `http://localhost:8080/health` by default. PostgreSQL, RabbitMQ, and storage readiness is available at `http://localhost:8080/health/ready` when the API is run with configured dependency settings. Future file bytes must go through the storage abstraction, and API responses must not expose physical storage paths.

## Scaffold Validation

Current validation covers scaffold paths, the OpenAPI placeholder, the API health scaffold tests, and Docker Compose config. It does not build or test mobile, web, or worker apps yet.

```powershell
npm ci
npm run validate
```

`npm run validate` runs the same checks listed below in order and stops on the first failure with the failed subcommand and exit code.

Individual checks:

```powershell
npm run validate:scaffold
npm run validate:openapi
npm run validate:api
npm run validate:compose
npm run validate:api-docker
npm run validate:api-runtime
npm run validate:api-migrations
```

Docker must be available for `validate:compose`, `validate:api-docker`, `validate:api-runtime`, and `validate:api-migrations`.
`validate:api-docker` builds the API image only. `validate:api-runtime` starts PostgreSQL, RabbitMQ, and the API through Docker Compose, polls `http://localhost:8080/health/ready` for HTTP 200 with JSON status `ready`, and then stops the stack without deleting persistent Docker volumes.
`validate:api-migrations` starts only PostgreSQL through Docker Compose with a unique project name and a disposable volume, applies the current EF Core migrations to that disposable database, and removes only that validation project's resources afterward. Set `SETTLEORA_MIGRATION_VALIDATION_POSTGRES_PORT` to force a specific temporary PostgreSQL host port.
