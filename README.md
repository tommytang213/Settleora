# Settleora

Settleora is a self-hosted cross-platform expense management, shared bill tracking, settlement workflow, receipt OCR, recurring bill, forecasting, and reconciliation platform.

This repository is currently in scaffold materialization. It preserves the existing Flutter mobile app and adds a minimal backend API scaffold, placeholder structure for the future OCR worker, web portals, generated clients, contracts, and local infrastructure. Business features are not implemented yet.

## Key References

- [Program architecture](PROGRAM_ARCHITECTURE.md)
- [Database foundation](docs/architecture/DATABASE_FOUNDATION.md)
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
- `services/api/` ASP.NET Core Web API scaffold with `GET /health`, PostgreSQL/RabbitMQ/storage readiness at `GET /health/ready`, and the first API-owned users/groups schema foundation.
- API runtime configuration placeholders exist for PostgreSQL, RabbitMQ, and storage. The API connects to PostgreSQL and RabbitMQ and checks local storage only for the readiness check. EF Core infrastructure and the first migration define schema-only user profile, group, and group membership tables, but authentication, authorization, business endpoints, messaging workflows, upload/download endpoints, file metadata, expenses, bills, settlements, OCR endpoints, and business database workflows are not implemented yet.
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

Individual checks:

```powershell
npm run validate:scaffold
npm run validate:openapi
npm run validate:api
npm run validate:compose
npm run validate:api-docker
npm run validate:api-runtime
```

Docker must be available for `validate:compose`, `validate:api-docker`, and `validate:api-runtime`.
`validate:api-docker` builds the API image only. `validate:api-runtime` starts PostgreSQL, RabbitMQ, and the API through Docker Compose, polls `http://localhost:8080/health/ready` for HTTP 200 with JSON status `ready`, and then stops the stack without deleting persistent Docker volumes.
