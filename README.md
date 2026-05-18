# Settleora

Settleora is a self-hosted cross-platform expense management, shared bill tracking, settlement workflow, receipt OCR, recurring bill, forecasting, and reconciliation platform.

This repository is still not a feature-complete Day 1 MVP, but it is no longer only a scaffold. It preserves the existing Flutter mobile app and now includes early backend slices for auth/session, self profile, self payment details and QR files, groups, personal/group bills, bill attachment receipt/supporting-file runtime, bill-scoped receipt OCR review intake, apply-preview, and explicit draft-only apply for existing receipt attachments, a starter mobile receipt OCR review queue/detail/edit foundation, mobile first-launch server/local configuration, secure session-storage boundaries, a minimal server-mode auth/session lifecycle shell with refresh, logout, session list, and per-session revocation, a starter authenticated mobile self profile/payment-details screen, a starter authenticated mobile personal-bill list/detail surface with bill archive/restore sync queue actions, a starter authenticated mobile group-bill read-only list/detail surface, a starter authenticated mobile settlement balance/request/payment detail foundation, a starter authenticated mobile group management foundation, a starter authenticated mobile recurring-bill template/forecast/detail/draft-generation surface, settlement request/payment/proof flows, recurring bill templates with safe forecast reads and explicit draft generation, file metadata/lifecycle, generated clients, contracts, and local infrastructure. Web/admin portals, OCR engines/workers, broader mobile product UI beyond the starter auth/session, profile/payment, group management, bill, group-bill read-only, recurring-bill read/forecast/draft-generation, receipt-review, and settlement flows, mobile group bill creation/edit/lifecycle/offline support, mobile recurring bill creation/editing/full lifecycle/offline queueing, mobile OCR extraction/capture, automatic OCR-to-bill finalization, non-draft OCR revision apply, recurring auto-generation workers, reminders/notifications, advanced recurring exceptions, reconciliation, full sync/offline cache hydration, and broader product UI remain placeholders or future work.

Future optional Settleora Cloud support is an architecture direction for managed single-tenant/workspace hosting only. Current implementation remains local-only and self-hosted focused, and cloud runtime, shared multi-tenant SaaS, federation, and subscription billing are not implemented.

## Key References

- [Program architecture](PROGRAM_ARCHITECTURE.md)
- [Settleora Cloud SaaS readiness](docs/architecture/SETTLEORA_CLOUD_SAAS_READINESS.md)
- [MVP Day 1 scope](docs/prd/MVP_DAY1_SCOPE.md)
- [Day 2 scope](docs/prd/DAY2_SCOPE.md)
- [Day 3 AI insights scope](docs/prd/DAY3_AI_INSIGHTS_SCOPE.md)
- [Auth identity foundation](docs/architecture/AUTH_IDENTITY_FOUNDATION.md)
- [Auth credentials, sessions, and audit design](docs/architecture/AUTH_CREDENTIALS_SESSIONS_AUDIT_DESIGN.md)
- [Auth credential workflow design](docs/architecture/AUTH_CREDENTIAL_WORKFLOW_DESIGN.md)
- [Auth runtime and current-user design](docs/architecture/AUTH_RUNTIME_CURRENT_USER_DESIGN.md)
- [Auth refresh-token rotation policy](docs/architecture/AUTH_REFRESH_TOKEN_ROTATION_POLICY.md)
- [Auth sign-in abuse policy](docs/architecture/AUTH_SIGN_IN_ABUSE_POLICY.md)
- [Mobile auth, session, and API client flow](docs/architecture/MOBILE_AUTH_SESSION_CLIENT_FLOW.md)
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
- [Receipt OCR review apply policy](docs/architecture/RECEIPT_OCR_REVIEW_APPLY_POLICY.md)
- [Receipt OCR review UX flow](docs/architecture/RECEIPT_OCR_REVIEW_UX_FLOW.md)
- [Recurring bills technical spec](docs/features/recurring-bills/TECHNICAL_SPEC.md)
- [Product requirements](docs/prd/)
- [Codex task guide](docs/workflow/CODEX_TASK_GUIDE.md)
- [Workflow guidance](docs/workflow/)
- [OpenAPI contract](packages/contracts/openapi/settleora.v1.yaml)
- [Local infrastructure compose](infra/docker-compose.yml)

## Current Scaffold

- `apps/mobile/` existing Flutter mobile app with first-launch local/server configuration, secure-storage-backed app/session state boundaries, a starter authenticated server-mode shell with current-user validation, refresh-aware token access, current-session logout, sign-out-all, session/device list, per-session revocation, a starter self profile/payment-details screen backed by generated-client repository seams, a starter personal-bill list/detail surface backed by generated-client repository seams, bill archive/restore actions queued through the mobile sync queue foundation, a starter group-bill read-only list/detail surface backed by generated-client repository seams, a starter settlement balance/request/payment detail surface backed by a generated-client repository seam with conservative online-only settlement/payment actions, a starter group list/detail/member-management surface backed by a generated-client repository seam, a starter recurring-bill template list/detail and forecast surface with explicit online-only draft generation backed by the generated-client repository seam, and a starter receipt OCR review queue/detail/edit foundation backed by the mobile repository seam. Server-mode self profile, payment details, group, bill, recurring bill, settlement, sync, and receipt review calls stay session-gated; QR upload/remove UX, group bill create/edit/lifecycle/offline UX, recurring bill creation/editing/full lifecycle/offline queueing/reminders/background generation, local-mode expense storage, full offline cache hydration, and broader mobile product screens are still future work.
- `apps/web-user/` placeholder for the future React + Vite user portal.
- `apps/web-admin/` placeholder for the future React + Vite admin portal.
- `services/api/` ASP.NET Core Web API with `GET /health`, PostgreSQL/RabbitMQ/storage readiness at `GET /health/ready`, the first API-owned users/groups plus auth schema foundations, an internal password hashing service boundary, an internal credential workflow service boundary, internal session and refresh-session runtime service boundaries, internal sign-in abuse policy and local sign-in orchestration service boundaries, first-owner local bootstrap endpoints at `GET /api/v1/auth/bootstrap/status` and `POST /api/v1/auth/bootstrap/local-owner`, `POST /api/v1/auth/sign-in` for local sign-in, `POST /api/v1/auth/refresh` for rotating a submitted refresh-like credential, `GET /api/v1/auth/current-user` for validating an existing opaque session token into a minimal current actor/profile/session/role summary, current-account session endpoints, the first `SettleoraSession` bearer authentication/current-actor/authorization policy foundation, an internal business authorization service foundation, guarded self-profile read/update endpoints, guarded self payment-details read/update and self QR endpoints, settlement-scoped counterparty payment-details and QR content reads, guarded group foundation and group member management endpoints, guarded personal/group bill create/list/get, submit/participant accept/reject workflow endpoints, bill attachment attach/list/content/remove endpoints, bill-scoped receipt OCR review intake, apply-preview, and draft-only apply endpoints for existing receipt attachments, guarded recurring bill template create/list/get/update/pause/resume/archive, forecast, and explicit draft-generation endpoints, guarded settlement candidate preview, request create/read, payment read/claim/confirmation/dispute/cancellation, request dispute/cancellation, and settlement payment proof attach/list/content/remove endpoints, guarded admin local-user foundation endpoints, an internal metadata-only file object lifecycle service with bounded file lifecycle audit events, schema-only expense/bill root, item, item split, participant, payer, adjustment, attachment, receipt OCR review, recurring bill template, and recurring bill occurrence foundations, and an internal bill calculation/split service boundary.
- API runtime configuration placeholders exist for PostgreSQL, RabbitMQ, storage, password hashing policy, and auth session lifetime policy. The API connects to PostgreSQL and RabbitMQ and checks local storage for readiness. EF Core infrastructure and migrations define schema-only user/profile, auth/session/audit, file metadata, expense/bill, recurring bill, and settlement tables, including `settlement_proof_attachments`, `settlement_request_lines`, `settlement_payment_allocations`, and `settlement_residuals`. Credential/session/audit/file metadata rows keep bounded safe metadata and provider-internal file object data without generic public file APIs.
- Expense/bill schema rows back the first guarded same-currency personal and group bill create/read slices, and the internal bill calculation/split service calculates draft/pending totals, item split resolved amounts, participant shares, adjustment effects, and payer contribution validation. Settlement candidate preview, request creation, request read, payment read, payment claim, payment confirmation, receiver residual confirmation, request/payment dispute, request/payment cancellation, purpose-specific settlement payment proof endpoints, the first read-only current-actor settlement balance projection endpoint, the first read-only settlement basket preview endpoint, and the first pay-all settlement basket creation endpoint now exist for confirmed personal/group bill candidates. Settlement request creation now persists one server-derived request line for the selected single-bill candidate, request list/get responses expose bounded line summaries, same-currency payment claims now persist allocation rows against selected request lines with bounded allocation summaries on payment responses, and payment claim creation can persist explicit pending same-currency underpayment/overpayment residual rows with bounded residual summaries. `POST /api/v1/settlement-payments/{paymentId}/residuals/{residualId}/confirm` lets the receiver confirm one pending residual to its policy-derived status so payment confirmation can proceed without creating broad credit ledgers or silently clearing remaining-balance/carried-forward underpayment debt. `GET /api/v1/settlement-balances` projects bounded debtor/creditor rows from request lines, active allocation coverage, and receiver-confirmed residual effects as explicit remaining, waived, and credit residual amounts without treating pending residuals as confirmed effects or netting credits against unrelated balances. `POST /api/v1/settlements/baskets/preview` expands eligible same-currency current-actor/counterparty candidates without writing settlement state, and `POST /api/v1/settlements/baskets` writes a server-derived pay-all request plus concrete request lines. Broad credit ledgers, refund workflows, settlement simplification, and settlement reopen/adjustment policy do not exist yet.
- Recurring bill schema rows back guarded personal and group recurring bill template APIs. Templates store a validated versioned canonical bill payload as generation configuration, not financial truth; forecast reads derive upcoming occurrences without creating bills, and explicit draft generation revalidates actor access, group membership, payload money, currency, participants, and payer policy before creating an `ExpenseBill` draft and linking an occurrence. Background auto-generation, reminder delivery, skipped-one recurrence UX, advanced exception calendars, and dashboard widgets do not exist yet.
- Settlement proof bytes move only through `POST /api/v1/settlement-payments/{paymentId}/proof`, `GET /api/v1/settlement-payments/{paymentId}/proof`, `GET /api/v1/settlement-payments/{paymentId}/proof/{fileId}/content`, and `DELETE /api/v1/settlement-payments/{paymentId}/proof/{fileId}`. These endpoints create `settlement_proof` file objects through the storage/lifecycle foundation, attach or soft-remove `settlement_proof_attachments`, stream content with safe headers, return safe metadata only, and emit bounded `settlement.proof_*` audit metadata. Bill receipt/supporting attachment bytes move only through personal/group bill attachment routes under `/api/v1/bills/{billId}/attachments` and `/api/v1/groups/{groupId}/bills/{billId}/attachments`, create `receipt_image` or `supporting_attachment` file objects, attach or soft-remove `expense_bill_attachments`, stream content with safe headers, return safe metadata only, and emit bounded `bill_attachment.*` audit metadata. Existing receipt attachments can now carry one active provisional/reviewed OCR review through `PUT`/`GET`/`DELETE` `.../attachments/{fileId}/ocr-review`; `GET .../ocr-review/apply-preview` converts the saved review into a bounded non-mutating bill-draft preview for visible actors without requiring creator/owner mutation rights. Explicit `POST .../ocr-review/apply` exists for the draft-only `replace_draft_ocr_items` mode, revalidates the saved review server-side at write time, preserves manual items, soft-replaces OCR-applied draft items from the same review, and marks applied item candidates with OCR source fields. OCR completion, queue visibility, preview success, and generated client availability do not automatically apply or finalize bill data. Generic public upload/download APIs, standalone receipt/OCR upload/download runtime outside bill attachments, OCR engine/worker behavior, notification behavior, mobile receipt capture/extraction UI, web/admin UI behavior, multi-participant split inference, non-draft shared-bill revision apply, automatic bill finalization, thumbnails, and generic receipt/OCR APIs do not exist yet.
- The `SettleoraSession` scheme validates opaque bearer session tokens through the session runtime boundary for authenticated self, group, bill, bill attachment, receipt OCR review, settlement, settlement proof, session, and admin local-user endpoints. These endpoints consume the server-side current actor accessor, and bootstrap status/local-owner, sign-in, refresh, and health remain anonymous. OpenAPI remains the source of truth; run `npm run generate:clients` after contract changes and review generated web/Dart diffs.
- `services/worker-ocr/` placeholder for the future Python OCR worker.
- `packages/contracts/` OpenAPI contract source.
- `packages/client-web/` generated web client output from the OpenAPI contract.
- `packages/client-dart/` generated Dart/Flutter client package output from the OpenAPI contract.
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
