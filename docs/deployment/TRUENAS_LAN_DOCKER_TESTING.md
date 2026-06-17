# TrueNAS LAN Docker Testing

## Status

This runbook is a LAN-only testing foundation for running the current Settleora server stack on a TrueNAS / TrueNAS SCALE-style host. The maintainer-reported target version is TrueNAS `25.10.1`.

This is not a production deployment guide, not public exposure approval, and not a completed TrueNAS catalog app. Public internet exposure is blocked until the auth/session/security, storage/privacy, admin exposure, deployment, backup/restore, and manual release gates in the Day 1 acceptance package have passed.

## Current Repo Deployment Shape

The live repo currently provides:

- API image build: `services/api/Dockerfile`
- Compose stack: `infra/docker-compose.yml`
- LAN-only TrueNAS testing compose package: `infra/docker-compose.truenas-lan.yml`
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
| `api` | Built from `services/api/Dockerfile` | ASP.NET Core API on container port `8080`. | The LAN compose package publishes only this API port. Expose only to trusted LAN clients for testing. |
| `postgres` | `postgres:16-alpine` | API-owned relational database. | The LAN compose package does not publish PostgreSQL by default. Never expose it to the internet. |
| `rabbitmq` | `rabbitmq:3.13-management-alpine` | Queue foundation for async jobs and future workers. | The LAN compose package does not publish AMQP or the management UI by default. Never expose either to the internet. |

The repo does not currently provide a running OCR worker container, web user portal container, web admin portal container, MinIO/S3 service, reverse proxy, TLS automation, TrueNAS catalog metadata, or TrueNAS app form schema. `services/worker-ocr`, `apps/web-user`, and `apps/web-admin` are placeholders.

The current storage provider is local file storage configured through `Settleora__Storage__Provider=Local` and `Settleora__Storage__RootPath`. File metadata lives in PostgreSQL; file bytes go through the API storage abstraction. Do not expose storage directories directly through SMB/NFS/web shares for app access.

## LAN Compose Package

Use `infra/docker-compose.truenas-lan.yml` for maintainer LAN testing. It is a complete compose file rather than an override so PostgreSQL and RabbitMQ host ports stay private by default.

The LAN compose package:

- Builds the API from `services/api/Dockerfile`.
- Runs the current real services only: `api`, `postgres`, and `rabbitmq`.
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
docker compose --env-file infra/env/.env.truenas-lan -f infra/docker-compose.truenas-lan.yml -p settleora_lan up --build -d postgres rabbitmq api
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

Stop the stack without deleting datasets:

```bash
cd /workspace/repos/Settleora
docker compose --env-file infra/env/.env.truenas-lan -f infra/docker-compose.truenas-lan.yml -p settleora_lan down
```

Do not use `down -v` for maintainer data. The LAN package uses bind-mounted datasets, and dataset backup/removal must be an explicit TrueNAS maintenance action.

## Database Migration Note

The API startup does not apply EF Core migrations automatically. Before treating a LAN deployment as usable, the database schema must be created/applied through an explicit migration process.

The current repo has a validation command that proves the migrations can apply to a disposable PostgreSQL database:

```bash
cd /workspace/repos/Settleora
npm run validate:api-migrations
```

That validation command is not a production migration runbook and deliberately creates/removes its own disposable validation database. It does not migrate the maintainer's TrueNAS dataset.

For the current LAN package, the safest manual workaround is to apply EF Core migrations from a temporary .NET SDK container attached to the same private compose network before owner bootstrap. This keeps PostgreSQL private and uses the repo-local `.config/dotnet-tools.json` manifest for `dotnet-ef`.

```bash
cd /workspace/repos/Settleora
set -a
. infra/env/.env.truenas-lan
set +a
docker run --rm \
  --network settleora_lan_default \
  -v "$PWD:/src" \
  -w /src \
  -e Settleora__Database__ConnectionString="Host=postgres;Port=5432;Database=${POSTGRES_DB};Username=${POSTGRES_USER};Password=${POSTGRES_PASSWORD}" \
  mcr.microsoft.com/dotnet/sdk:9.0 \
  sh -lc "dotnet tool restore && dotnet ef database update --project services/api/src/Settleora.Api --startup-project services/api/src/Settleora.Api --context SettleoraDbContext"
```

Important current blocker: the LAN package still does not include a first-class migration runner service, install hook, upgrade hook, rollback flow, or backup-before-migrate enforcement. If the SDK-container command fails because Docker image pulls, network access, filesystem permissions, or .NET tooling are unavailable on the TrueNAS host, stop and record that exact failure. Do not expose PostgreSQL just to run migrations unless the maintainer explicitly accepts that temporary local risk and keeps the port off the public internet.

A polished TrueNAS app follow-up must define install/upgrade migration behavior, backup prerequisites, rollback handling, and maintainer-visible failure states.

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
- `infra/docker-compose.truenas-lan.yml` is a practical LAN Docker package path, but maintainer-run TrueNAS evidence is still pending.
- No production migration/install/upgrade runner exists.
- No backup/restore runbook exists for PostgreSQL, RabbitMQ, and local file storage as one consistency unit.
- No reverse proxy/TLS/admin-surface protection package exists.
- Web user/admin portals and OCR worker runtime are placeholders.
- Actual TrueNAS install/run evidence is pending maintainer execution.
