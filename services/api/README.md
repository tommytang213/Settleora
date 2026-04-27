# Settleora API

This directory contains the ASP.NET Core Web API scaffold.

Current implementation:

- `GET /health` returns a stable JSON health response.
- Integration tests cover the current health endpoint.
- `services/api/Dockerfile` packages this health-only API for local compose usage.

No database, authentication, authorization, or business endpoints exist yet.

The API is the only owner of core business database writes. Business rules, authorization, audit logging, money calculation, rounding, and policy application belong here or in shared backend/domain services.

File metadata will live in PostgreSQL. File bytes will go through storage abstractions, and API responses must not expose direct storage or filesystem paths.
