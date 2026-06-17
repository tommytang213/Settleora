# TrueNAS LAN Docker Testing

## Status

This runbook is a LAN-only testing foundation for running the current Settleora server stack on a TrueNAS / TrueNAS SCALE-style host. The maintainer-reported target version is TrueNAS `25.10.1`.

This is not a production deployment guide, not public exposure approval, and not a completed TrueNAS catalog app. Public internet exposure is blocked until the auth/session/security, storage/privacy, admin exposure, deployment, backup/restore, and manual release gates in the Day 1 acceptance package have passed.

## Current Repo Deployment Shape

The live repo currently provides:

- API image build: `services/api/Dockerfile`
- Compose stack: `infra/docker-compose.yml`
- Example env file: `infra/env/.env.example`
- API health: `GET /health`
- API readiness: `GET /health/ready`
- Bootstrap status: `GET /api/v1/auth/bootstrap/status`
- First-owner bootstrap: `POST /api/v1/auth/bootstrap/local-owner`
- Local sign-in: `POST /api/v1/auth/sign-in`

The compose stack defines these services:

| Service | Current repo source | Purpose | LAN exposure guidance |
| --- | --- | --- | --- |
| `api` | Built from `services/api/Dockerfile` | ASP.NET Core API on container port `8080`. | Expose only to trusted LAN clients for testing. |
| `postgres` | `postgres:16-alpine` | API-owned relational database. | Do not publish beyond the Docker host/LAN test boundary; never expose to the internet. |
| `rabbitmq` | `rabbitmq:3.13-management-alpine` | Queue foundation for async jobs and future workers. | Do not publish AMQP or management UI beyond the Docker host/LAN test boundary; never expose to the internet. |

The repo does not currently provide a running OCR worker container, web user portal container, web admin portal container, MinIO/S3 service, reverse proxy, TLS automation, TrueNAS catalog metadata, or TrueNAS app form schema. `services/worker-ocr`, `apps/web-user`, and `apps/web-admin` are placeholders.

The current storage provider is local file storage configured through `Settleora__Storage__Provider=Local` and `Settleora__Storage__RootPath`. File metadata lives in PostgreSQL; file bytes go through the API storage abstraction. Do not expose storage directories directly through SMB/NFS/web shares for app access.

## Persistent Datasets And Volumes

For TrueNAS LAN testing, create or choose datasets before running the stack:

| Data | Compose location | TrueNAS dataset intent |
| --- | --- | --- |
| PostgreSQL data | `settleora_postgres_data:/var/lib/postgresql/data` | Persistent database dataset or named Docker volume backed by a persistent pool. |
| RabbitMQ data | `settleora_rabbitmq_data:/var/lib/rabbitmq` | Persistent queue dataset or named Docker volume backed by a persistent pool. |
| API local file storage | `SETTLEORA_STORAGE_ROOT` currently defaults to `./data/storage` inside the API container unless overridden | Persistent dataset mounted into the API container at a stable path, for example `/data/settleora/storage`. |

Current blocker: `infra/docker-compose.yml` does not yet declare a dedicated API storage volume mount. For a real TrueNAS LAN run, the maintainer should add the storage mount through the TrueNAS Docker/app UI or a local override file and set `SETTLEORA_STORAGE_ROOT` to that mounted path. Do not rely on container-local `./data/storage` for persistent receipt/proof/QR bytes.

## Environment Variables

Start from `infra/env/.env.example`, but do not use the example passwords outside disposable local development.

Required LAN-test settings:

| Variable | Purpose | LAN-test note |
| --- | --- | --- |
| `POSTGRES_DB` | PostgreSQL database name. | Use a stable app-specific value. |
| `POSTGRES_USER` | PostgreSQL application user. | Use a non-default value for maintainer testing. |
| `POSTGRES_PASSWORD` | PostgreSQL password. | Generate a strong secret; do not commit it. |
| `POSTGRES_HOST_PORT` | Host port for PostgreSQL when published. | Prefer not publishing PostgreSQL for packaged app use. |
| `RABBITMQ_DEFAULT_USER` | RabbitMQ user. | Use a non-default value. |
| `RABBITMQ_DEFAULT_PASS` | RabbitMQ password. | Generate a strong secret; do not commit it. |
| `SETTLEORA_STORAGE_PROVIDER` | Storage provider. | Current compose path uses `Local`. |
| `SETTLEORA_STORAGE_ROOT` | API local storage root. | Point at a mounted persistent dataset path inside the API container. |
| `SETTLEORA_ENVIRONMENT` | ASP.NET Core environment. | `Development` is suitable only for LAN testing. |
| `SETTLEORA_API_HTTP_PORT` | API host port. | Default is `8080`; choose an unused LAN port. |

The compose file also sets service-internal connection strings:

- PostgreSQL host: `postgres:5432`
- RabbitMQ host: `rabbitmq:5672`
- API listener: `http://+:8080`

## LAN-Only Network Rules

- Bind the API only on the TrueNAS host/LAN address needed for iPhone testing.
- Do not forward router ports to Settleora.
- Do not expose PostgreSQL port `5432`, RabbitMQ AMQP port `5672`, RabbitMQ management port `15672`, or the storage dataset to the public internet.
- Treat admin APIs as protected even when only LAN-exposed.
- Use LAN or trusted VPN testing first. Cloudflare Access or any public tunnel is a future manual-gated deployment decision, not enabled by this guide.

## Current Compose Commands

From a development machine or a TrueNAS shell where this repo and Docker Compose are available:

```bash
cd /workspace/repos/Settleora
docker compose --env-file infra/env/.env.example -f infra/docker-compose.yml up --build postgres rabbitmq api
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

Stop the stack:

```bash
cd /workspace/repos/Settleora
docker compose --env-file infra/env/.env.example -f infra/docker-compose.yml down
```

Do not use `down -v` unless you intentionally want to delete Docker named volumes.

## Database Migration Note

The API startup does not apply EF Core migrations automatically. Before treating a LAN deployment as usable, the database schema must be created/applied through an explicit migration process. The repo currently has validation tooling for disposable migration validation:

```bash
cd /workspace/repos/Settleora
npm run validate:api-migrations
```

That validation command is not a production migration runbook. A polished TrueNAS app follow-up must define install/upgrade migration behavior, backup prerequisites, rollback handling, and maintainer-visible failure states.

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

Record exact commands, URLs, device, iOS version, TrueNAS version, and screenshots/logs for Day 1 evidence.

- Confirm TrueNAS version is `25.10.1` or record the exact version tested.
- Confirm API container starts from `services/api/Dockerfile`.
- Confirm PostgreSQL and RabbitMQ containers start and remain healthy enough for `/health/ready`.
- Confirm API local storage root is backed by a persistent dataset or mounted volume.
- Confirm `GET /health` returns HTTP `200`.
- Confirm `GET /health/ready` returns HTTP `200` with `postgres`, `rabbitmq`, and `storage` ready.
- Confirm `GET /api/v1/auth/bootstrap/status`.
- If supported in the test database state, perform first-owner bootstrap and then local sign-in.
- In the iPhone TestFlight build, enter `http://<truenas-lan-ip>:8080` and confirm server-mode connection.
- Smoke-test only implemented server-mode mobile flows: current user/session, self profile/payment details, group list/create where available, personal bill create/list/detail, group bill read/create where available, receipt attachment/OCR review starter flow where available, settlement balance/request/payment/proof starter flow where available.
- Do not mark OCR worker behavior, web/admin behavior, production deployment, public exposure, backup/restore, or polished catalog install complete from this LAN smoke test.

## Current Blockers For Polished LAN Hosting

- No TrueNAS catalog app package exists yet.
- No dedicated API storage volume is declared in the base compose file.
- PostgreSQL and RabbitMQ ports are published by the current development compose file; a packaged app should keep them private by default.
- No production migration/install/upgrade runbook exists.
- No backup/restore runbook exists for PostgreSQL, RabbitMQ, and local file storage as one consistency unit.
- No reverse proxy/TLS/admin-surface protection package exists.
- Web user/admin portals and OCR worker runtime are placeholders.
- Actual TrueNAS install/run evidence is pending maintainer execution.
