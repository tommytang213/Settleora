# Settleora Infrastructure

Docker/docker-compose is the first local development deployment target.

The compose file currently runs local infrastructure plus the API scaffold.

The API container exposes the stable health endpoint and PostgreSQL/RabbitMQ/storage readiness endpoint:

```powershell
docker compose --env-file infra/env/.env.example -f infra/docker-compose.yml up --build postgres rabbitmq api
```

Then check:

```powershell
curl http://localhost:8080/health
curl http://localhost:8080/health/ready
```

Additional application services will be added later once real projects exist.

Docker/Compose support is currently a development scaffold only.

Optional Settleora Cloud support is future managed-workspace architecture work, not part of this local compose scaffold. Cloud runtime, managed provisioning, autoscaling, shared multi-tenant SaaS, subscription billing, and federation require separate design gates; see [../docs/architecture/SETTLEORA_CLOUD_SAAS_READINESS.md](../docs/architecture/SETTLEORA_CLOUD_SAAS_READINESS.md).

Compose passes future API runtime configuration with ASP.NET Core environment variable keys:

- `Settleora__Database__ConnectionString`
- `Settleora__RabbitMq__HostName`
- `Settleora__RabbitMq__Port`
- `Settleora__RabbitMq__UserName`
- `Settleora__RabbitMq__Password`
- `Settleora__RabbitMq__VirtualHost`
- `Settleora__Storage__Provider`
- `Settleora__Storage__RootPath`

The API connects to PostgreSQL and RabbitMQ and checks local storage only when `GET /health/ready` is requested. It does not connect during startup, touch storage during startup, run migrations, publish messages, consume messages, or declare queues. File metadata is now stored through the API-owned `file_objects` foundation, and the current public byte flows are purpose-specific self payment QR, settlement-scoped counterparty payment QR, and settlement payment proof endpoints. Generic public upload/download endpoints, receipt/OCR/statement file flows, and direct filesystem/path exposure are still absent.

Do not commit real secrets.
