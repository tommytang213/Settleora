# Database Foundation

This document defines Settleora's database foundation direction for API-owned PostgreSQL persistence. It records architecture rules only; it does not authorize runtime behavior, API contract changes, or feature work by itself.

## Current State

- PostgreSQL readiness exists through the API readiness endpoint.
- The API has runtime configuration placeholders for PostgreSQL.
- The API has EF Core infrastructure registered for API-owned PostgreSQL persistence.
- EF Core migrations define schema-only user profile, user payment profile, user group, group membership, file object metadata, auth account, auth identity, system role assignment, local password credential, auth session, auth session family, auth refresh credential history, and auth audit event tables.
- Internal password hashing, credential workflow, session runtime, refresh session runtime, sign-in abuse policy, local sign-in/refresh/current-account session endpoint boundaries, the `SettleoraSession` bearer middleware/current-actor/policy foundation, and an internal business authorization service foundation exist. No user/group business endpoints or EF Core business workflows exist yet.
- No business tables for expenses, settlement workflows, file subject associations, OCR, business audit, sync, passkeys, MFA, reset tokens, or recovery codes exist yet.

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
- Local migration creation should use the repo-pinned EF Core tool and the API-owned context:

```powershell
dotnet tool restore
$env:Settleora__Database__ConnectionString = "<local-dev-connection-string>"
dotnet ef migrations add <MigrationName> --project services/api/src/Settleora.Api --startup-project services/api/src/Settleora.Api --context SettleoraDbContext --output-dir Persistence/Migrations
```

- Migration creation must not require production credentials, and production startup must not auto-apply migrations.
- Schema changes require validation and review before merge.
- Migration diffs should be reviewed for destructive operations, default values, nullability, indexes, constraints, and data-shape assumptions.
- Runtime readiness must not be treated as proof that schema or migration design is complete.

## Schema Boundaries

The current schema foundation is intentionally limited to:

- `user_profiles`: API-owned user profile identity placeholders, including display name, optional default currency, timestamps, and future soft-delete timestamp.
- `user_payment_profiles`: API-owned self payment-details foundation, including one active default payment profile per `UserProfile`, bounded optional payment text fields, constrained visibility, timestamps, and future soft-delete timestamp. This table intentionally still has no QR/file metadata column; payment QR linkage is a separate future slice on top of file metadata.
- `user_groups`: API-owned shared group containers, including name, creator reference, timestamps, and future soft-delete timestamp.
- `group_memberships`: user-to-group membership rows with composite key, minimal role/status values, and timestamps.
- `auth_accounts`: server-side auth account roots linked one-to-one with `user_profiles`, with status timestamps and no credential material.
- `auth_identities`: provider identity links for local or OIDC-style identities, keyed by provider type, provider name, and stable provider subject without raw tokens.
- `system_role_assignments`: product-level role assignments for `owner`, `admin`, and `user`, separate from group membership roles.
- `local_password_credentials`: local password verifier hash metadata linked to `auth_accounts`, without plaintext passwords, reset tokens, recovery codes, passkeys, or MFA secrets. The internal credential workflow can create and verify these rows for existing auth accounts.
- `auth_sessions`: server-side session and revocation metadata linked to `auth_accounts`, storing token hashes only and no raw bearer or refresh tokens.
- `auth_session_families`: account-scoped refresh/session continuity lineage state linked to `auth_accounts`, with bounded status, absolute expiry, rotation, and revocation metadata.
- `auth_refresh_credentials`: refresh-like credential history linked to `auth_session_families`, optionally linked to `auth_sessions`, storing unique refresh credential hashes and bounded rotation/revocation/expiry metadata with no raw refresh tokens.
- `auth_audit_events`: bounded auth audit event metadata with optional actor and subject auth-account links, without raw secrets, raw tokens, password material, passkey private material, MFA secrets, or full provider payloads.
- `file_objects`: API-owned file metadata foundation linked to owner and creator `user_profiles`, with constrained purpose/status/encryption-mode values, content type, optional display filename, size, optional SHA-256 hash, local storage provider metadata, provider-internal object key, optional vault/retention references, timestamps, and soft-delete timestamp. It is metadata only and does not add public file APIs or subject-specific file workflows.

The schema foundation by itself does not authorize runtime behavior; the existing auth/session runtime, business authorization service, self-profile, self payment-details, group, group-member, admin local-user, and internal local file-object storage foundations are separate API layers. Invitations, friends, broader business endpoints, and EF Core workflows for expenses, bills, settlements, file subject workflows, OCR, sync, and reporting are not implemented yet.

Future business tables are deferred. Future schema design should separate concerns as appropriate, including:

- Passkeys, MFA, reset tokens, recovery codes, invitations, and friends.
- Business audit records outside auth.
- Money, expenses, recurring bills, reimbursements, and reconciliation records.
- Settlement workflows, balances, approvals, and status history.
- File subject associations and storage lifecycle records beyond the first `file_objects` metadata foundation.
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
- The `file_objects` metadata table uses stable file identifiers, authorization-aware ownership references, content type, size, lifecycle state, and provider-neutral object references.
- File reads and writes must pass through API authorization checks.

## Worker Constraints

- Workers consume jobs and publish results or events.
- Workers must not directly mutate core business tables.
- The API validates worker results before changing core business state.
- Worker outputs should be idempotent where practical and safe to retry.
- OCR-derived data remains provisional until accepted by the API.

## Non-goals

This document does not authorize:

- OpenAPI changes.
- Runtime behavior changes.
- Authentication or authorization.
- User/group business endpoints.
- Expenses, bills, settlements, public file workflows, OCR, audit, sync, or additional identity/session persistence beyond the listed schema foundations.
- Business persistence workflows.

## Next Implementation Candidate

Future database branches should remain small and reviewable. Business tables, migrations, and feature persistence should remain separate work unless explicitly approved together.
