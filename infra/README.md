# Settleora Infrastructure

Docker/docker-compose is the first local development deployment target.

The compose file currently runs local infrastructure plus the API scaffold.

The API container exposes the stable health endpoint and PostgreSQL/RabbitMQ readiness endpoint:

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

Compose passes future API runtime configuration with ASP.NET Core environment variable keys:

- `Settleora__Database__ConnectionString`
- `Settleora__RabbitMq__HostName`
- `Settleora__RabbitMq__Port`
- `Settleora__RabbitMq__UserName`
- `Settleora__RabbitMq__Password`
- `Settleora__RabbitMq__VirtualHost`
- `Settleora__Storage__Provider`
- `Settleora__Storage__RootPath`

The API connects to PostgreSQL and RabbitMQ only when `GET /health/ready` is requested. It does not connect during startup, run migrations, publish messages, consume messages, declare queues, or access storage yet.

Do not commit real secrets.
