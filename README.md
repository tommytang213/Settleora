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
- [Auth refresh-token rotation policy](docs/architecture/AUTH_REFRESH_TOKEN_ROTATION_POLICY.md)
- [Auth sign-in abuse policy](docs/architecture/AUTH_SIGN_IN_ABUSE_POLICY.md)
- [Password hashing policy](docs/architecture/PASSWORD_HASHING_POLICY.md)
- [Password hashing implementation design](docs/architecture/PASSWORD_HASHING_IMPLEMENTATION_DESIGN.md)
- [Database foundation](docs/architecture/DATABASE_FOUNDATION.md)
- [Storage file metadata architecture](docs/architecture/STORAGE_FILE_METADATA_ARCHITECTURE.md)
- [Privacy vault architecture](docs/architecture/PRIVACY_VAULT_ARCHITECTURE.md)
- [Payment details visibility architecture](docs/architecture/PAYMENT_DETAILS_VISIBILITY_ARCHITECTURE.md)
- [Money and rounding architecture](docs/architecture/MONEY_ROUNDING_ARCHITECTURE.md)
- [Expense, bill, split, and settlement architecture](docs/architecture/EXPENSE_BILL_SPLIT_SETTLEMENT_ARCHITECTURE.md)
- [Settlement runtime architecture](docs/architecture/SETTLEMENT_RUNTIME_ARCHITECTURE.md)
- [Architecture docs index](docs/architecture/)
- [OCR architecture](docs/architecture/OCR_ARCHITECTURE.md)
- [Product requirements](docs/prd/)
- [Codex task guide](docs/workflow/CODEX_TASK_GUIDE.md)
- [Workflow guidance](docs/workflow/)
- [OpenAPI contract](packages/contracts/openapi/settleora.v1.yaml)
- [Local infrastructure compose](infra/docker-compose.yml)

## Current Scaffold

- `apps/mobile/` existing Flutter mobile app.
- `apps/web-user/` placeholder for the future React + Vite user portal.
- `apps/web-admin/` placeholder for the future React + Vite admin portal.
- `services/api/` ASP.NET Core Web API scaffold with `GET /health`, PostgreSQL/RabbitMQ/storage readiness at `GET /health/ready`, the first API-owned users/groups plus auth schema foundations, an internal password hashing service boundary, an internal credential workflow service boundary, internal session and refresh-session runtime service boundaries, internal sign-in abuse policy and local sign-in orchestration service boundaries, first-owner local bootstrap endpoints at `GET /api/v1/auth/bootstrap/status` and `POST /api/v1/auth/bootstrap/local-owner`, `POST /api/v1/auth/sign-in` for local sign-in, `POST /api/v1/auth/refresh` for rotating a submitted refresh-like credential, `GET /api/v1/auth/current-user` for validating an existing opaque session token into a minimal current actor/profile/session/role summary, current-account session endpoints, the first `SettleoraSession` bearer authentication/current-actor/authorization policy foundation, an internal business authorization service foundation, guarded self-profile read/update endpoints at `GET /api/v1/users/me/profile` and `PATCH /api/v1/users/me/profile`, guarded self payment-details read/update endpoints at `GET /api/v1/users/me/payment-details` and `PATCH /api/v1/users/me/payment-details`, self-only payment QR endpoints at `POST /api/v1/users/me/payment-details/qr`, `DELETE /api/v1/users/me/payment-details/qr`, and `GET /api/v1/users/me/payment-details/qr/content`, guarded group foundation endpoints at `POST /api/v1/groups`, `GET /api/v1/groups`, `GET /api/v1/groups/{groupId}`, and `PATCH /api/v1/groups/{groupId}`, guarded group member management endpoints at `GET /api/v1/groups/{groupId}/members`, `POST /api/v1/groups/{groupId}/members`, `PATCH /api/v1/groups/{groupId}/members/{userProfileId}`, and `DELETE /api/v1/groups/{groupId}/members/{userProfileId}` for existing registered users with successful add/role-update/remove audit events, guarded personal bill create/list/get endpoints at `POST /api/v1/bills`, `GET /api/v1/bills`, and `GET /api/v1/bills/{billId}`, guarded group bill create/list/get endpoints at `POST /api/v1/groups/{groupId}/bills`, `GET /api/v1/groups/{groupId}/bills`, and `GET /api/v1/groups/{groupId}/bills/{billId}`, guarded settlement request read endpoints at `GET /api/v1/settlements` and `GET /api/v1/settlements/{settlementId}`, guarded settlement payment claim and confirmation endpoints at `POST /api/v1/settlements/{settlementId}/payments` and `POST /api/v1/settlement-payments/{paymentId}/confirm`, guarded settlement dispute endpoints at `POST /api/v1/settlements/{settlementId}/dispute` and `POST /api/v1/settlement-payments/{paymentId}/dispute`, guarded admin local-user foundation endpoints at `GET /api/v1/admin/users`, `GET /api/v1/admin/users/{userProfileId}`, and `POST /api/v1/admin/users/local`, an internal metadata-only file object lifecycle service with bounded file lifecycle audit events, schema-only expense/bill root, item, item split, participant, payer, adjustment, and attachment foundations, and an internal bill calculation/split service boundary.
- API runtime configuration placeholders exist for PostgreSQL, RabbitMQ, storage, password hashing policy, and auth session lifetime policy. The API connects to PostgreSQL and RabbitMQ and checks local storage for readiness. EF Core infrastructure and migrations define schema-only user profile, user payment profile, group, group membership, file object metadata, auth account, auth identity, system role assignment, local password credential, auth session, auth session family, auth refresh credential history, auth audit event, expense bill root, expense bill item, expense bill item split, expense bill participant, expense bill payer, expense bill adjustment, expense bill attachment, settlement request, settlement payment, and settlement proof attachment tables. Credential/session/audit/file metadata tables are persistence foundations only: local password rows store password hash metadata, session rows store token hashes, refresh/session-family rows store refresh credential hashes plus bounded lineage/status/expiry metadata, audit rows store bounded safe metadata, and file object rows store provider-internal metadata without generic public file APIs. Expense/bill schema rows now back the first guarded same-currency personal bill and group bill create/read slices; the internal bill calculation/split service calculates draft/pending totals, item split resolved amounts, participant shares, equal/proportional adjustment effects, and payer contribution validation for those slices. Settlement candidate preview endpoints, first settlement request creation endpoints, read-only current-actor settlement request list/get endpoints, debtor-authored settlement payment claim endpoints, receiver-authored settlement payment confirmation endpoints, bounded settlement request/payment dispute endpoints, and guarded settlement request/payment cancellation endpoints now exist for confirmed personal/group bill candidates; request creation re-derives server-side candidates, accepts only `candidateKey`, writes `settlement_requests`, and emits bounded `settlement.request_created` auth audit metadata, read endpoints expose only request-level fields and write no settlement audit/events, payment claims create `settlement_payments`, move requests to `partially_paid` or `marked_paid`, and emit bounded `settlement.payment_*` auth audit metadata, payment confirmation moves eligible marked-paid claims to `confirmed` and recomputes the parent request status, dispute endpoints move eligible requests or marked-paid payment claims to `disputed` with bounded audit metadata, and cancellation endpoints move eligible requester-owned requests or debtor-owned marked-paid claims to `cancelled` with bounded audit metadata. Settlement proof upload/download bytes, payment-details counterparty reads, balance projection, receipt upload/download runtime, OCR behavior, notification behavior, and UI behavior do not exist yet. The settlement runtime architecture gate defines server-authoritative payment claims, receiver confirmation, dispute, cancellation, proof linkage, privacy, audit, and rebuildable balance-projection policy for later slices. An internal metadata-only file lifecycle service can create pending file rows, transition them through upload/delete/purge metadata states, and write bounded `file.*` auth audit events without exposing object keys, storage roots, physical paths, original filenames, vault references, or request bodies. The local-owner bootstrap path exists only for fresh deployments with no auth accounts; it creates the first local owner/admin/user account and returns no session tokens, so clients still sign in through `POST /api/v1/auth/sign-in` afterward. The guarded admin local-user path exists only for authenticated system owners/admins after bootstrap; it creates normal local users with the system `user` role only, returns no session tokens, and is not public self-registration or invitations. Owner/admin role assignment remains future work. The public auth endpoints keep raw credential material out of storage and responses except for one-time sign-in/refresh success credentials. The `SettleoraSession` scheme validates opaque bearer session tokens through the session runtime boundary for current-user, sign-out, sign-out-all, session list, per-session revocation, self-profile endpoints, self payment-details endpoints, self payment QR endpoints, personal bill endpoints, group foundation endpoints, group member management endpoints, group bill endpoints, settlement candidate preview, settlement request creation, settlement request read, settlement payment claim, settlement payment confirmation, settlement request/payment dispute, settlement request/payment cancellation, and admin local-user endpoints. Those endpoints consume the server-side current actor accessor, and bootstrap status/local-owner, sign-in, refresh, and health remain anonymous. Self-profile read/update, self payment-details read/update, self payment QR attach/remove/content-read, group create/list/read/update, group bill create/list/get, settlement request list/get, settlement payment claim, settlement payment confirmation, settlement request/payment dispute, and settlement request/payment cancellation use server-side business authorization, accept no client-submitted profile, payment-profile, owner, member, group override, auth, or session IDs outside reviewed route/body contracts, and return no auth/session/credential/token internals. Personal bill create/list/get derives the creator, participant, and payer server-side from the current actor and keeps `groupId` null. Self payment-details stores one active default payment profile per user profile, defaults visibility to `settlement_counterparties_only`, normalizes blank nullable text to null, can link a nullable self-owned active `payment_qr` file through `qr_file_object_id`, and writes bounded safe `auth_audit_events` for successful create/update/visibility-change/QR attach/QR replace/remove actions without payment handles, notes, method values, file bytes, filenames, request bodies, storage paths, or vault internals. Creating a group creates an active owner membership for the creator. Group member management uses server-side business authorization so active group owners can add existing active registered users, update member roles, and mark active memberships `removed` without hard deletion; successful add, role update, and removal writes `auth_audit_events` actions `group_member.added`, `group_member.role_updated`, and `group_member.removed` with bounded secret-free metadata. Active group members can list active members. This slice does not implement invitations, guest placeholders, default-excluded/left runtime behavior, billing participation defaults beyond explicit bill participants/payers, notifications, audit UI, admin audit viewing, audit export, audit retention cleanup, failure-audit coverage for denied or invalid membership requests, or UI behavior. OpenAPI remains the source of truth; run `npm run generate:clients` after contract changes and review generated web/Dart diffs. General public registration, invitations, broader admin user management, role assignment/update endpoints, group delete/archive/restore, guest/default-excluded/left membership runtime behavior, group presets, counterparty payment-details reads, counterparty QR reads, admin payment-details reads, admin QR reads, mobile/web/admin UI behavior, messaging workflows, generic public upload/download endpoints, bill workflows beyond first personal/group create/read, item-split workflows beyond the internal calculation service, settlement proof workflows beyond first request creation/list/get/payment claim/confirmation/dispute/cancellation, settlement proof upload/download, OCR endpoints, and broader business database workflows are not implemented yet.
- `services/worker-ocr/` placeholder for the future Python OCR worker.
- `packages/contracts/` OpenAPI contract source.
- `packages/client-web/` generated web client output from the OpenAPI contract.
- `packages/client-dart/` generated Dart/Flutter client output from the OpenAPI contract.
- `infra/` local development infrastructure scaffold.

The API can be run through Docker Compose once Docker is available:

```powershell
docker compose --env-file infra/env/.env.example -f infra/docker-compose.yml up --build postgres rabbitmq api
```

The health endpoint is available at `http://localhost:8080/health` by default. PostgreSQL, RabbitMQ, and storage readiness is available at `http://localhost:8080/health/ready` when the API is run with configured dependency settings. The self payment QR flow goes through the internal storage abstraction, and future public file flows must also avoid exposing physical storage paths or provider object keys.

## Scaffold Validation

Current validation covers scaffold paths, the OpenAPI contract, generated client freshness, API tests, and Docker Compose config. It does not build or test mobile, web, or worker apps yet.

```powershell
npm ci
npm run validate
```

`npm run validate` runs the same checks listed below in order and stops on the first failure with the failed subcommand and exit code.

Generate OpenAPI clients after contract changes:

```powershell
npm run generate:clients
npm run validate:clients
```

Individual checks:

```powershell
npm run validate:scaffold
npm run validate:openapi
npm run generate:clients
npm run validate:clients
npm run validate:api
npm run validate:compose
npm run validate:api-docker
npm run validate:api-runtime
npm run validate:api-migrations
```

Docker must be available for `validate:compose`, `validate:api-docker`, `validate:api-runtime`, and `validate:api-migrations`.
`validate:api-docker` builds the API image only. `validate:api-runtime` starts PostgreSQL, RabbitMQ, and the API through Docker Compose, polls `http://localhost:8080/health/ready` for HTTP 200 with JSON status `ready`, and then stops the stack without deleting persistent Docker volumes.
`validate:api-migrations` starts only PostgreSQL through Docker Compose with a unique project name and a disposable volume, applies the current EF Core migrations to that disposable database, and removes only that validation project's resources afterward. Set `SETTLEORA_MIGRATION_VALIDATION_POSTGRES_PORT` to force a specific temporary PostgreSQL host port.
