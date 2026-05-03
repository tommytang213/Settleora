# Settleora Program Architecture

## Milestone Intent

The first milestone is an architecture scaffold, not a feature-complete MVP. It establishes repo shape, contracts, service boundaries, generated-client rules, Docker defaults, and CI entrypoints for future reviewable feature slices.

## Authority Boundaries

- The ASP.NET Core API is the only owner of core business database writes.
- Python workers consume jobs and publish results; they must not directly mutate core business tables unless a future design explicitly creates and reviews that path.
- Centralized API/domain services own financial calculations, status transitions, authorization checks, audit logging, and policy application.
- Frontend clients may cache, validate forms, and queue offline work, but server authorization and business rules remain authoritative in server mode.
- Database foundation details are defined in [docs/architecture/DATABASE_FOUNDATION.md](docs/architecture/DATABASE_FOUNDATION.md).

## OpenAPI And Generated Clients

- OpenAPI is the source of truth for mobile and web generated clients.
- Canonical contract path: `packages/contracts/openapi/settleora.v1.yaml`.
- Web client generation target: `packages/client-web/src/generated/`.
- Dart client generation target: `packages/client-dart/generated/`.
- Generated clients are non-hand-edited. Update the OpenAPI contract, regenerate, and review the generated diff.

## Sync Authority Rules

- Local-only profiles are authoritative locally.
- Server-mode profiles are authoritative on the server.
- Offline shared edits remain pending until synced and accepted by the server.
- Sync states must include `queued`, `synced`, `conflict`, and `failed`.
- Conflict handling must preserve local pending edits until the user or server policy resolves them.

## Storage Rules

- All file bytes go through a storage abstraction.
- File metadata lives in PostgreSQL.
- API responses must not expose direct filesystem paths or storage provider internals.
- File reads and writes must pass authorization checks in the API.
- Receipt/proof access should use stable file IDs, scoped access checks, and provider-managed object keys.

## Privacy Mode Rules

- Privacy mode and private vault architecture are defined in [docs/architecture/PRIVACY_VAULT_ARCHITECTURE.md](docs/architecture/PRIVACY_VAULT_ARCHITECTURE.md).
- Day 1 supports two user-selectable privacy modes, where deployment/admin policy allows them: `standard_secure` and `recoverable_private_vault`.
- Standard Secure Mode is the default Day 1 privacy mode.
- Recoverable Private Vault may protect selected sensitive fields/files, but it must not make clients authoritative for money, settlement states, authorization, audit, shared accounting truth, or server-mode validation.
- Strict Private Vault remains future-compatible architecture only unless a later implementation task explicitly approves it.
- Core business truth remains API/domain-authoritative even when selected sensitive content is vault-protected.

## Money Rules

- All money calculations use decimal-safe types only.
- Currency is always attached to monetary values.
- Rounding is centralized through policy.
- Incoming and outgoing rounding may differ by currency.
- Frontends may display previews, but API/domain services produce authoritative financial results.

## Job And Event Rules

- RabbitMQ carries asynchronous jobs and domain-adjacent events between the API and workers.
- Event payloads must use versioned contracts from `packages/contracts/events/`.
- Workers should acknowledge jobs only after publishing a successful result or a structured failure event.
- Job handlers must be idempotent where practical and safe to retry.
- The API remains responsible for validating worker results before they affect core business state.

## Audit Coverage Rules

- Money, permission, sharing, settlement, storage-access, and security-policy actions must emit audit records.
- Audit records should identify the actor, action, subject, timestamp, and relevant correlation IDs.
- Audit logging should happen in API/domain services, not only in clients or workers.
- Audit records must avoid storing raw secrets, tokens, or unnecessary sensitive file contents.

## API Versioning And Compatibility

- Public REST APIs are versioned under `/api/v1`.
- Breaking API changes require a new API version or an explicit migration plan.
- OpenAPI changes must be reviewed before generated clients are refreshed.
- Existing clients should remain compatible where practical through additive schema changes and stable enum handling.

## Client Responsibility Boundaries

- Mobile and web clients own presentation, form state, local cache, and offline queues.
- Clients may perform convenience validation, but server-side validation remains authoritative.
- Clients must not duplicate financial settlement logic as the source of truth.
- Clients must not infer authorization from hidden UI controls or cached data.
- Generated API clients must stay isolated from hand-written app logic.

## OCR Responsibilities

- On-device OCR is a required mobile capability for offline receipt processing, server-unavailable flows, and local-only profiles.
- The server-side Python OCR worker is complementary infrastructure for heavier OCR, reprocessing, consistency checks, batch processing, or future higher-confidence extraction.
- In server-mode, OCR-derived data created on-device remains provisional until validated and accepted by the API.
- OCR architecture details are defined in [docs/architecture/OCR_ARCHITECTURE.md](docs/architecture/OCR_ARCHITECTURE.md).

## Policy And Configuration Rules

- Configurable product behavior should flow through policy/config systems rather than hardcoded client behavior.
- Security-sensitive defaults must remain least-privilege until explicitly changed.
- Policy changes affecting auth, sharing, retention, storage, money, or admin exposure require audit coverage.
- Environment variables configure deployment-specific settings; persisted policy config controls product behavior.

## Identity And Session Rules

- Auth identity foundation details are defined in [docs/architecture/AUTH_IDENTITY_FOUNDATION.md](docs/architecture/AUTH_IDENTITY_FOUNDATION.md).
- Credential, session, and auth audit schema direction is defined in [docs/architecture/AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md](docs/architecture/AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md).
- Local-account password hashing policy is defined in [docs/architecture/PASSWORD_HASHING_POLICY.md](docs/architecture/PASSWORD_HASHING_POLICY.md).
- Local accounts and OIDC/Keycloak integration are supported foundations.
- Role and permission checks are enforced by the API.
- Sessions and tokens must use secure expiry, revocation, and device/session visibility patterns.
- New-device and security-impactful session events should be auditable and not depend on client-only state.
