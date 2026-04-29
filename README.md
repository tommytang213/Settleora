# Settleora

Settleora is a self-hosted cross-platform expense management, shared bill tracking, settlement workflow, receipt OCR, recurring bill, forecasting, and reconciliation platform.

This repository is currently in scaffold materialization. It preserves the existing Flutter mobile app and adds a minimal backend API scaffold, placeholder structure for the future OCR worker, web portals, generated clients, contracts, and local infrastructure. Business features are not implemented yet.

## Key References

- [Program architecture](PROGRAM_ARCHITECTURE.md)
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
- `services/api/` ASP.NET Core Web API scaffold with `GET /health` and PostgreSQL/RabbitMQ connectivity readiness at `GET /health/ready`.
- API runtime configuration placeholders exist for PostgreSQL, RabbitMQ, and storage. The API connects to PostgreSQL and RabbitMQ only for the readiness check; no schema, migrations, messaging workflows, or business database access exists yet.
- `services/worker-ocr/` placeholder for the future Python OCR worker.
- `packages/contracts/` placeholder OpenAPI contract source.
- `packages/client-web/` future generated web client output.
- `packages/client-dart/` future generated Dart/Flutter client output.
- `infra/` local development infrastructure scaffold.

The API can be run through Docker Compose once Docker is available:

```powershell
docker compose --env-file infra/env/.env.example -f infra/docker-compose.yml up --build api
```

The health endpoint is available at `http://localhost:8080/health` by default. PostgreSQL and RabbitMQ readiness is available at `http://localhost:8080/health/ready` when the API is run with configured dependency settings.

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
```

Docker must be available for `validate:compose` and `validate:api-docker`.
