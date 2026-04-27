# Settleora

Settleora is a self-hosted cross-platform expense management, shared bill tracking, settlement workflow, receipt OCR, recurring bill, forecasting, and reconciliation platform.

This repository is currently in scaffold materialization. It preserves the existing Flutter mobile app and adds placeholder structure for the future backend API, OCR worker, web portals, generated clients, contracts, and local infrastructure. Business features are not implemented yet.

## Key References

- [Program architecture](docs/architecture/PROGRAM_ARCHITECTURE.md)
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
