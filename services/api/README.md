# Settleora API

This directory contains the ASP.NET Core Web API scaffold.

Current implementation:

- `GET /health` returns a stable JSON health response.
- `GET /health/ready` checks PostgreSQL, RabbitMQ, and local storage readiness with configured dependency settings and returns no connection details or physical paths.
- Integration tests cover the health and readiness endpoints.
- `services/api/Dockerfile` packages this API scaffold for local compose usage.
- Typed runtime configuration placeholders are bound for PostgreSQL, RabbitMQ, and storage.

No schema, migrations, EF Core, authentication, authorization, or business endpoints exist yet.

Configuration sections:

- `Settleora:Database`
- `Settleora:RabbitMq`
- `Settleora:Storage`

The PostgreSQL, RabbitMQ, and storage readiness checks run only when `GET /health/ready` is requested; API startup does not connect to PostgreSQL or RabbitMQ, touch storage, or run migrations. The `/health` and `/health/ready` endpoints do not expose configuration details, storage roots, or physical paths.

The API is the only owner of core business database writes. Business rules, authorization, audit logging, money calculation, rounding, and policy application belong here or in shared backend/domain services.

File metadata will live in PostgreSQL later. File bytes will go through storage abstractions later, and API responses must not expose direct storage or filesystem paths. No upload/download endpoints or file metadata implementation exist yet.

In server-mode, the API is authoritative for accepting OCR-derived records. OCR-derived client data is provisional until validated and accepted by the API. No OCR endpoints exist yet.
