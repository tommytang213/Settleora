# Settleora

Settleora is a self-hosted cross-platform expense management, shared bill tracking, settlement workflow, receipt OCR, recurring bill, forecasting, and reconciliation platform.

This repository is currently in scaffold materialization. It preserves the existing Flutter mobile app and adds placeholder structure for the future backend API, OCR worker, web portals, generated clients, contracts, and local infrastructure. Business features are not implemented yet.

## Key References

- [Program architecture](PROGRAM_ARCHITECTURE.md)
- [Product requirements](docs/prd/)
- [Workflow guidance](docs/workflow/)
- [OpenAPI placeholder](packages/contracts/openapi/settleora.v1.yaml)
- [Local infrastructure compose](infra/docker-compose.yml)

## Current Scaffold

- `apps/mobile/` existing Flutter mobile app.
- `apps/web-user/` placeholder for the future React + Vite user portal.
- `apps/web-admin/` placeholder for the future React + Vite admin portal.
- `services/api/` placeholder for the future ASP.NET Core Web API.
- `services/worker-ocr/` placeholder for the future Python OCR worker.
- `packages/contracts/` placeholder OpenAPI contract source.
- `packages/client-web/` future generated web client output.
- `packages/client-dart/` future generated Dart/Flutter client output.
- `infra/` local development infrastructure scaffold.

## Scaffold Validation

Current validation is scaffold-level only. It does not build or test mobile, backend, web, or worker apps yet.

```powershell
npm ci
npm run validate
```

Individual checks:

```powershell
npm run validate:scaffold
npm run validate:openapi
npm run validate:compose
```

Docker must be available for `validate:compose`.
