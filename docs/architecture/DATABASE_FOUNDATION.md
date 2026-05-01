# Database Foundation

This document defines Settleora's database foundation direction before EF Core, schema, migrations, or business tables are implemented. It records architecture rules only; it does not authorize runtime or contract changes by itself.

## Current State

- PostgreSQL readiness exists through the API readiness endpoint.
- The API has runtime configuration placeholders for PostgreSQL.
- No PostgreSQL schema exists yet.
- No migrations exist yet.
- No EF Core business persistence exists yet.
- No business tables for expenses, settlement, files, OCR, audit, sync, identity, or sessions exist yet.

## Authority Boundary

- The ASP.NET Core API owns core business database writes in server mode.
- Workers must not directly mutate core business tables.
- Workers may publish job results, structured failure events, or domain-adjacent events for the API to consume.
- The API must validate worker output before any core business state changes.
- API/domain services own authorization, financial calculations, status transitions, audit decisions, and policy enforcement around persisted business state.

## Persistence Direction

- PostgreSQL is the primary server-mode datastore.
- EF Core is acceptable for API-owned persistence unless a future architecture review changes direction.
- Migrations are owned by the API project because the API owns the core business database write model.
- Database access should remain behind API/domain boundaries rather than leaking persistence concerns into clients or workers.

## Migration Rules

- Migrations must be explicit, reviewable files.
- Production startup must not automatically apply migrations.
- A local/dev migration command should be documented later when migration tooling is introduced.
- Schema changes require validation and review before merge.
- Migration diffs should be reviewed for destructive operations, default values, nullability, indexes, constraints, and data-shape assumptions.
- Runtime readiness must not be treated as proof that schema or migration design is complete.

## Schema Boundaries

Actual business tables are deferred. Future schema design should separate concerns as appropriate, including:

- Identity and sessions.
- Money, expenses, recurring bills, reimbursements, and reconciliation records.
- Settlement workflows, balances, approvals, and status history.
- File and storage metadata.
- OCR metadata, extraction results, confidence data, and review state.
- Audit records.
- Sync state, offline queues, and outbox or event publication state.

Schema boundaries should keep authoritative server state distinct from client cache state and worker processing state.

## Money And Currency Constraints

- Monetary values must use decimal-safe storage.
- Currency must always be attached to monetary values.
- Rounding policy must be centralized in API/domain policy rather than duplicated across clients or workers.
- Incoming, stored, calculated, and displayed amounts may have different rounding requirements, so future schema design must preserve enough precision for authoritative calculations.
- Database constraints should support currency correctness and avoid floating point storage for money.

## Storage Constraints

- File metadata belongs in PostgreSQL.
- File bytes must go through the storage abstraction.
- API responses must not expose direct filesystem paths, object store paths, bucket internals, or provider-specific storage details.
- Future metadata tables should use stable file identifiers, authorization-aware ownership references, content type, size, lifecycle state, and provider-neutral object references.
- File reads and writes must pass through API authorization checks.

## Worker Constraints

- Workers consume jobs and publish results or events.
- Workers must not directly mutate core business tables.
- The API validates worker results before changing core business state.
- Worker outputs should be idempotent where practical and safe to retry.
- OCR-derived data remains provisional until accepted by the API.

## Non-goals

This document does not add or authorize:

- EF Core packages.
- A `DbContext`.
- Migrations.
- Database tables.
- OpenAPI changes.
- Runtime behavior changes.
- Business persistence logic.

## Next Implementation Candidate

A later small branch may add EF Core infrastructure only, still without business schema unless separately approved. That branch should keep the scope narrow: package references, API-owned persistence wiring, configuration, and tests or validation needed to prove the infrastructure loads safely. Business tables, migrations, and feature persistence should remain separate reviewable work unless explicitly approved together.
