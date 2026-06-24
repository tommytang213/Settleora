# TrueNAS LAN Docker Testing

## Status

This runbook is a LAN-only testing foundation for running the current Settleora server stack on a TrueNAS / TrueNAS SCALE-style host. The maintainer-reported target version is TrueNAS `25.10.1`.

This is not a production deployment guide, not public exposure approval, and not a completed TrueNAS catalog app. Public internet exposure is blocked until the auth/session/security, storage/privacy, admin exposure, deployment, backup/restore, and manual release gates in the Day 1 acceptance package have passed. First-install, routine-upgrade, unsafe-migration blocking, failed-start recovery, rollback limits, health checks, and operator evidence are planned in [Self-hosted install/upgrade orchestration](SELF_HOSTED_INSTALL_UPGRADE_ORCHESTRATION.md). Future catalog metadata, form fields, dataset mappings, image tags, upgrade/rollback notes, and operator warnings are planned in [TrueNAS catalog app packaging plan](TRUENAS_CATALOG_APP_PACKAGING_PLAN.md). Exposure-mode planning for LAN, trusted VPN/private access, Cloudflare Access-style protection, reverse proxy/TLS, admin surfaces, and future public access is defined in [Self-hosting exposure guardrails](SELF_HOSTING_EXPOSURE_GUARDRAILS.md).

## Current Repo Deployment Shape

The live repo currently provides:

- API image build: `services/api/Dockerfile`
- Compose stack: `infra/docker-compose.yml`
- LAN-only TrueNAS testing compose package: `infra/docker-compose.truenas-lan.yml`
- Image-based LAN package template: `infra/docker-compose.truenas-lan.image.yml`
- Example env file: `infra/env/.env.example`
- LAN-only example env file: `infra/env/.env.truenas-lan.example`
- API health: `GET /health`
- API readiness: `GET /health/ready`
- Bootstrap status: `GET /api/v1/auth/bootstrap/status`
- First-owner bootstrap: `POST /api/v1/auth/bootstrap/local-owner`
- Local sign-in: `POST /api/v1/auth/sign-in`

The compose stack defines these services:

| Service | Current repo source | Purpose | LAN exposure guidance |
| --- | --- | --- | --- |
| `migrate` | Same API image/build as `api` | Runs the first-class EF Core migration command before API startup. | Private one-shot service; publishes no host ports. |
| `api` | Built from `services/api/Dockerfile` | ASP.NET Core API on container port `8080`. | The LAN compose package publishes only this API port. Expose only to trusted LAN clients for testing. |
| `postgres` | `postgres:16-alpine` | API-owned relational database. | The LAN compose package does not publish PostgreSQL by default. Never expose it to the internet. |
| `rabbitmq` | `rabbitmq:3.13-management-alpine` | Queue foundation for async jobs and future workers. | The LAN compose package does not publish AMQP or the management UI by default. Never expose either to the internet. |

The repo does not currently provide a running OCR worker container, web user portal container, web admin portal container, MinIO/S3 service, reverse proxy, TLS automation, TrueNAS catalog metadata, or TrueNAS app form schema. `services/worker-ocr`, `apps/web-user`, and `apps/web-admin` are placeholders.

The current storage provider is local file storage configured through `Settleora__Storage__Provider=Local` and `Settleora__Storage__RootPath`. File metadata lives in PostgreSQL; file bytes go through the API storage abstraction. Do not expose storage directories directly through SMB/NFS/web shares for app access.

## LAN Compose Package

Use `infra/docker-compose.truenas-lan.yml` for maintainer LAN testing. It is a complete compose file rather than an override so PostgreSQL and RabbitMQ host ports stay private by default.

The LAN compose package:

- Builds the API from `services/api/Dockerfile`.
- Runs the current real services: `migrate`, `api`, `postgres`, and `rabbitmq`.
- Runs `migrate-database --mode=${SETTLEORA_DATABASE_MIGRATION_MODE:-managed-auto}` as a first-class one-shot migration service.
- Starts the API only after the migration service exits successfully when Docker Compose supports `depends_on.condition: service_completed_successfully`.
- Publishes only the API host port through `SETTLEORA_API_BIND_ADDRESS` and `SETTLEORA_API_HTTP_PORT`.
- Keeps PostgreSQL port `5432`, RabbitMQ AMQP port `5672`, and RabbitMQ management port `15672` private to the compose network.
- Sets `Settleora__Storage__Provider=Local`.
- Mounts persistent API local file storage at `SETTLEORA_STORAGE_ROOT`.
- Uses bind mounts for PostgreSQL, RabbitMQ, and API file storage so the maintainer can point them at TrueNAS datasets.
- Adds health checks for PostgreSQL and RabbitMQ before the API starts.

The API health endpoints remain HTTP endpoints checked after startup:

```text
GET /health
GET /health/ready
```

## Persistent Datasets And Volumes

For TrueNAS LAN testing, create or choose datasets before running the stack. The example env file uses placeholder `/mnt/POOL/apps/settleora/...` paths; replace `POOL` and the path layout with real maintainer-approved datasets.

| Data | Compose location | TrueNAS dataset intent |
| --- | --- | --- |
| PostgreSQL data | `SETTLEORA_POSTGRES_HOST_PATH:/var/lib/postgresql/data` | Persistent database dataset. |
| RabbitMQ data | `SETTLEORA_RABBITMQ_HOST_PATH:/var/lib/rabbitmq` | Persistent queue dataset. |
| API local file storage | `SETTLEORA_API_STORAGE_HOST_PATH:${SETTLEORA_STORAGE_ROOT}` | Persistent sensitive file dataset for receipt, proof, QR, and attachment bytes. |

Do not publish the API storage dataset directly through SMB, NFS, HTTP, or a public file share for app access. Settleora file access must go through the API storage abstraction and API authorization checks.

Use [TrueNAS backup/restore consistency runbook](TRUENAS_BACKUP_RESTORE_RUNBOOK.md) for the PostgreSQL, RabbitMQ, API local file storage, app configuration, migration-state, restore-validation, and redaction evidence path. Use [Self-hosted install/upgrade orchestration](SELF_HOSTED_INSTALL_UPGRADE_ORCHESTRATION.md) for first-install, upgrade, unsafe-migration blocking, failed-start recovery, rollback limitation, health-check, and operator-evidence expectations. Use [TrueNAS catalog app packaging plan](TRUENAS_CATALOG_APP_PACKAGING_PLAN.md) for future catalog-specific metadata, form, dataset, topology, image, upgrade, rollback, and stop-condition planning. These documents are planning guidance only and do not execute backup, restore, catalog implementation, or catalog publishing operations.

## Environment Variables

Start from `infra/env/.env.truenas-lan.example`, not the local development `.env.example`. Do not use example placeholder passwords for persistent maintainer testing.

Required LAN-test settings:

| Variable | Purpose | LAN-test note |
| --- | --- | --- |
| `POSTGRES_DB` | PostgreSQL database name. | Use a stable app-specific value. |
| `POSTGRES_USER` | PostgreSQL application user. | Use a non-default value for maintainer testing. |
| `POSTGRES_PASSWORD` | PostgreSQL password. | Generate a strong secret; do not commit it. |
| `SETTLEORA_POSTGRES_HOST_PATH` | Host dataset path for PostgreSQL data. | Must be persistent and writable by the Docker runtime. |
| `RABBITMQ_DEFAULT_USER` | RabbitMQ user. | Use a non-default value. |
| `RABBITMQ_DEFAULT_PASS` | RabbitMQ password. | Generate a strong secret; do not commit it. |
| `SETTLEORA_RABBITMQ_HOST_PATH` | Host dataset path for RabbitMQ data. | Must be persistent and writable by the Docker runtime. |
| `SETTLEORA_STORAGE_PROVIDER` | Storage provider. | Current compose path uses `Local`. |
| `SETTLEORA_STORAGE_ROOT` | API local storage root inside the API container. | Defaults to `/var/lib/settleora/storage` for the LAN package. |
| `SETTLEORA_API_STORAGE_HOST_PATH` | Host dataset path for API local file storage. | Must be persistent and writable; contains sensitive app files. |
| `SETTLEORA_ENVIRONMENT` | ASP.NET Core environment. | `Development` is suitable only for LAN testing. |
| `COMPOSE_PROJECT_NAME` | Stable Docker Compose project/network name. | Defaults to `settleora_lan` in the example so private-network migration commands can target `settleora_lan_default`. |
| `SETTLEORA_API_BIND_ADDRESS` | Host bind address for the API port. | Use the TrueNAS LAN IP if you want to bind narrowly; `0.0.0.0` binds all host interfaces. |
| `SETTLEORA_API_HTTP_PORT` | API host port. | Default is `8080`; choose an unused LAN port. |
| `SETTLEORA_API_BASE_URL` | Maintainer reference URL for clients. | The current API does not consume this variable; use the equivalent URL in the iPhone app. |
| `SETTLEORA_DATABASE_MIGRATION_MODE` | Migration service mode. | Default `managed-auto`; use `check-only`/`manual` for pro hoster control, `validate-only` for connectivity/metadata checks, `apply-safe` for explicit safe application, and `force-allow-destructive` only after backup and review. |

The compose file also sets service-internal connection strings:

- PostgreSQL host: `postgres:5432`
- RabbitMQ host: `rabbitmq:5672`
- API listener: `http://+:8080`

## LAN-Only Network Rules

- Bind the API only on the TrueNAS host/LAN address needed for iPhone testing.
- Do not forward router ports to Settleora.
- Do not expose PostgreSQL port `5432`, RabbitMQ AMQP port `5672`, RabbitMQ management port `15672`, or the storage dataset to the public internet.
- Treat admin APIs as protected even when only LAN-exposed.
- Use LAN or trusted VPN testing first. Cloudflare Access or any public tunnel is a future manual-gated deployment decision, not enabled by this guide. See [Self-hosting exposure guardrails](SELF_HOSTING_EXPOSURE_GUARDRAILS.md) before planning reverse proxy, TLS, admin exposure, or public access.

## LAN Compose Commands

From a development machine or a TrueNAS shell where this repo and Docker Compose are available, copy the LAN env example to a private env file:

```bash
cd /workspace/repos/Settleora
cp infra/env/.env.truenas-lan.example infra/env/.env.truenas-lan
```

Edit `infra/env/.env.truenas-lan` before startup:

- Replace `REPLACE_WITH_GENERATED_POSTGRES_PASSWORD` with a fresh generated secret.
- Replace `REPLACE_WITH_GENERATED_RABBITMQ_PASSWORD` with a fresh generated secret.
- Replace all `/mnt/POOL/apps/settleora/...` paths with real TrueNAS dataset paths.
- Set `SETTLEORA_API_BIND_ADDRESS` to the TrueNAS LAN IP if a narrow bind is desired.
- Set `SETTLEORA_API_HTTP_PORT` to an unused LAN port.
- Set `SETTLEORA_API_BASE_URL` to the URL the iPhone should enter, for example `http://192.168.50.29:8080` if that is the actual server host.

Validate the LAN compose package without starting containers:

```bash
cd /workspace/repos/Settleora
docker compose --env-file infra/env/.env.truenas-lan -f infra/docker-compose.truenas-lan.yml config
```

Start the LAN stack:

```bash
cd /workspace/repos/Settleora
docker compose --env-file infra/env/.env.truenas-lan -f infra/docker-compose.truenas-lan.yml -p settleora_lan up --build -d
```

Expected default API URL on the Docker host:

```text
http://localhost:8080
```

Expected LAN URL from an iPhone on the same network:

```text
http://<truenas-lan-ip>:8080
```

For the maintainer's DevBox host context, replace `<truenas-lan-ip>` with the actual TrueNAS host IP, not the DevBox IP unless the stack is running on the DevBox.

Show service state:

```bash
cd /workspace/repos/Settleora
docker compose --env-file infra/env/.env.truenas-lan -f infra/docker-compose.truenas-lan.yml -p settleora_lan ps
```

For an image-based package path, use the same env file with `infra/docker-compose.truenas-lan.image.yml` and set `SETTLEORA_API_IMAGE` if the published image tag differs from the default GHCR example:

```bash
cd /workspace/repos/Settleora
docker compose --env-file infra/env/.env.truenas-lan -f infra/docker-compose.truenas-lan.image.yml -p settleora_lan up -d
```

Stop the stack without deleting datasets:

```bash
cd /workspace/repos/Settleora
docker compose --env-file infra/env/.env.truenas-lan -f infra/docker-compose.truenas-lan.yml -p settleora_lan down
```

Do not use `down -v` for maintainer data. The LAN package uses bind-mounted datasets, and dataset backup/removal must be an explicit TrueNAS maintenance action.

## Database Migrations

Production API startup does not silently apply EF Core migrations. The TrueNAS LAN package now includes a separate first-class `migrate` service that uses the same API image/build output and exits before the API starts.

The API-hosted command is:

```bash
dotnet Settleora.Api.dll migrate-database --mode=managed-auto
```

Supported modes:

| Mode | Behavior |
| --- | --- |
| `managed-auto` | Default easy-install mode. Applies pending migrations only when the migration safety policy classifies them as safe. Blocks unsafe/destructive operations. |
| `apply-safe` | Explicit safe apply mode with the same destructive-operation guard as `managed-auto`. |
| `manual` | Professional hoster mode. Checks pending migrations and exits non-zero if the schema is not current; does not apply. |
| `check-only` | Alias-style check mode for manual operators; does not apply and exits non-zero with pending migrations. |
| `validate-only` | Checks PostgreSQL connectivity and EF migration metadata; does not fail merely because migrations are pending. |
| `force-allow-destructive` | Dangerous override. Applies pending migrations without the managed safety block and must only be used after operator review and backup. |

The safety policy blocks known destructive operations such as dropping tables/columns, EF operations marked destructive, and raw SQL containing destructive/unclassified tokens. The current policy is conservative lexical/runtime classification, not a replacement for human migration review. If managed mode blocks a migration, startup stops with actionable logs instead of silently changing or damaging data.

To check status without applying:

```bash
cd /workspace/repos/Settleora
docker compose --env-file infra/env/.env.truenas-lan -f infra/docker-compose.truenas-lan.yml -p settleora_lan run --rm migrate migrate-database --mode=check-only
```

To apply safe migrations explicitly:

```bash
cd /workspace/repos/Settleora
docker compose --env-file infra/env/.env.truenas-lan -f infra/docker-compose.truenas-lan.yml -p settleora_lan run --rm migrate migrate-database --mode=apply-safe
```

The existing validation command still proves migrations can apply to a disposable PostgreSQL database:

```bash
cd /workspace/repos/Settleora
npm run validate:api-migrations
```

That validation command is not a production migration runbook and deliberately creates/removes its own disposable validation database. It does not migrate the maintainer's TrueNAS dataset.

Compose/TrueNAS compatibility note: this package uses Docker Compose `depends_on.condition: service_completed_successfully` so the API waits for the one-shot migrator. If a TrueNAS app engine does not honor that condition, keep the `migrate` service and configure the platform's equivalent install/upgrade job or start-order gate; do not remove the migration runner or publish PostgreSQL just to manage schema.

## Health And Bootstrap Checks

Run these from a LAN client or from the Docker host after the stack starts:

```bash
curl -i http://<truenas-lan-ip>:8080/health
curl -i http://<truenas-lan-ip>:8080/health/ready
curl -i http://<truenas-lan-ip>:8080/api/v1/auth/bootstrap/status
```

Expected health behavior:

- `/health` should return HTTP `200` with a stable health payload.
- `/health/ready` should return HTTP `200` and dependency statuses only when PostgreSQL, RabbitMQ, and local storage readiness all pass.
- `/health/ready` must not expose connection strings, storage roots, filesystem paths, passwords, or queue details.
- `/api/v1/auth/bootstrap/status` should report whether first-owner bootstrap is still required.

## First Owner Bootstrap And Sign-In

If bootstrap status says setup is required, use the supported first-owner bootstrap endpoint from a trusted LAN client. The exact request schema is governed by `packages/contracts/openapi/settleora.v1.yaml`; do not invent extra fields.

Current request shape:

```bash
curl -i \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"identifier":"owner@example.test","password":"REPLACE_WITH_BOOTSTRAP_OWNER_PASSWORD","displayName":"Owner","defaultCurrency":"USD"}' \
  http://<truenas-lan-ip>:8080/api/v1/auth/bootstrap/local-owner
```

Use a real private owner identifier and a strong generated password. Do not commit either value and do not paste real secrets into reports.

After bootstrap, sign in through:

```text
POST /api/v1/auth/sign-in
```

The bootstrap endpoint does not return session tokens. The mobile app should sign in normally after owner bootstrap.

## iPhone TestFlight Server URL

On the iPhone TestFlight build, choose server mode during first launch or app configuration and enter:

```text
http://<truenas-lan-ip>:8080
```

Use `http://`, not `localhost`, because `localhost` on the iPhone points to the phone itself. Keep the iPhone on the same LAN or trusted VPN as the TrueNAS host.

Do not use a public DNS name, public tunnel, or forwarded router port for this task.

## LAN Validation Checklist

This checklist is deployment-readiness evidence for issue `#381`. It hardens
the current LAN Docker validation path only; it does not authorize production
deployment, public exposure, signing, release, secrets, environment, Docker,
compose, CI, schema, or runtime behavior changes.

Record exact commands, exit statuses, URLs, device model, iOS version, TrueNAS
version, compose file path, env file source, screenshots/logs, and redacted
output summaries for Day 1 evidence. Do not paste real passwords, bearer tokens,
connection strings, storage paths containing private names, provider object
keys, signing material, or private `.env` contents into reports.

Repository-side validation evidence before PR/review:

```bash
cd /workspace/repos/Settleora
git status --short
git diff --name-only origin/main...HEAD
git diff --check origin/main...HEAD
npm run validate:docs
npm run doctor:docker
npm run validate:compose
```

For this TrueNAS LAN package, also record the LAN compose config result:

```bash
cd /workspace/repos/Settleora
npm run validate:compose:truenas-lan
npm run validate:compose:truenas-lan-image
```

When the task or release gate requires API Docker image evidence, record:

```bash
cd /workspace/repos/Settleora
npm run validate:api-docker
```

If Docker is unavailable, the daemon is unreachable, or a Docker validation
command fails for environment reasons, do not substitute a pass. Record the
exact command, exit status, and concise failure reason.

LAN host and compose posture:

- Confirm TrueNAS version is `25.10.1` or record the exact version tested.
- Confirm the tested package is `infra/docker-compose.truenas-lan.yml` or
  `infra/docker-compose.truenas-lan.image.yml`, not the local development
  `infra/docker-compose.yml`.
- Confirm the build-based package starts the API container from
  `services/api/Dockerfile`, or record the exact pinned
  `SETTLEORA_API_IMAGE` used for the image-based package.
- Confirm the stack contains the current real services: `migrate`, `api`,
  `postgres`, and `rabbitmq`.
- Confirm the `migrate` service runs before API startup, exits successfully, and
  uses the intended `SETTLEORA_DATABASE_MIGRATION_MODE`.
- Confirm PostgreSQL and RabbitMQ containers start and remain healthy enough for
  `/health/ready`.
- Confirm only the API host port is published by the LAN package.
- Confirm PostgreSQL `5432`, RabbitMQ AMQP `5672`, RabbitMQ management `15672`,
  the API storage dataset, and any future admin web surface are not publicly
  reachable. Admin web, when implemented, must remain behind LAN, trusted VPN,
  Cloudflare Access-style protection, or an equivalent explicit access gate.
- Confirm no router port forward, public DNS name, public tunnel, or direct
  internet exposure is used for this LAN validation.

Persistent storage and env evidence:

- Confirm PostgreSQL data, RabbitMQ data, and API local file storage are backed
  by persistent bind-mounted datasets or mounted volumes.
- Confirm the API local storage dataset contains sensitive app file bytes and is
  not exposed directly through SMB, NFS, HTTP, or any public file share for app
  access.
- Confirm file access remains through API storage abstraction and API
  authorization checks.
- Confirm the private LAN env file was copied from
  `infra/env/.env.truenas-lan.example`, not from the local development
  `infra/env/.env.example`.
- Confirm `POSTGRES_PASSWORD` and `RABBITMQ_DEFAULT_PASS` are generated private
  secrets and are not example placeholders.
- Confirm the report records which required env variables were reviewed without
  disclosing real secret values.

Health, readiness, and bootstrap evidence:

- Confirm `GET /health` returns HTTP `200`.
- Confirm `GET /health/ready` returns HTTP `200` with `postgres`, `rabbitmq`,
  and `storage` ready.
- Confirm `/health/ready` does not expose connection strings, storage roots,
  filesystem paths, passwords, queue credentials, or provider object keys.
- Confirm `GET /api/v1/auth/bootstrap/status`.
- If supported in the test database state, perform first-owner bootstrap and
  then local sign-in from a trusted LAN client.
- In the iPhone TestFlight build, enter `http://<truenas-lan-ip>:8080` and
  confirm server-mode connection. Do not use `localhost` from the iPhone.
- Smoke-test only implemented server-mode mobile flows: current user/session,
  self profile/payment details, group list/create where available, personal
  bill create/list/detail, group bill read/create where available, receipt
  attachment/OCR review starter flow where available, and settlement
  balance/request/payment/proof starter flow where available.

Manual gates and report fields:

- Preserve manual gates for production deploy, public exposure, admin exposure,
  mobile store release, signing, release promotion, secrets/credentials/tokens,
  sensitive environment changes, destructive migrations, backup/restore,
  reverse proxy/TLS setup, TrueNAS catalog packaging, Docker/compose behavior
  changes, CI/deployment workflow changes, auth/session/security runtime,
  storage/privacy/file-byte behavior, schema/migrations, OpenAPI/generated
  clients, and money/settlement/payment/bill calculation authority.
- Do not mark OCR worker behavior, web/admin behavior, production deployment,
  public exposure, backup/restore, reverse proxy/TLS protection, mobile store
  release, signing, or polished catalog install complete from this LAN smoke
  test.
- Before PR or merge review, report branch name, base branch, source and task
  commit SHAs, changed files, exact validation commands and results, scope
  guard confirmation, Docker availability or failure reason, LAN evidence
  collected, manual gates still open, and confirmation that no Docker, CI,
  deploy, runtime, secret, signing, release, schema, OpenAPI, generated-client,
  auth/security, storage/privacy, money, settlement, payment, or bill
  calculation behavior changed.

## Current Blockers For Polished LAN Hosting

- No TrueNAS catalog app package exists yet; the planning path is documented in [TrueNAS catalog app packaging plan](TRUENAS_CATALOG_APP_PACKAGING_PLAN.md).
- `infra/docker-compose.truenas-lan.yml` is a practical LAN Docker package path, but maintainer-run TrueNAS evidence is still pending.
- No polished production install/upgrade orchestration exists beyond the current LAN package's first-class `migrate` service.
- No backup/restore runbook exists for PostgreSQL, RabbitMQ, and local file storage as one consistency unit.
- No reverse proxy/TLS/admin-surface protection package exists.
- Web user/admin portals and OCR worker runtime are placeholders.
- Actual TrueNAS install/run evidence is pending maintainer execution.
