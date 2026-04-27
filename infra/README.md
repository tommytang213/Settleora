# Settleora Infrastructure

Docker/docker-compose is the first local development deployment target.

The compose file currently runs local infrastructure plus the API health scaffold.

The API container exposes only the current health endpoint:

```powershell
docker compose --env-file infra/env/.env.example -f infra/docker-compose.yml up --build api
```

Then check:

```powershell
curl http://localhost:8080/health
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

These values are placeholders for future integrations. The API does not connect to PostgreSQL or RabbitMQ, run migrations, or access storage yet.

Do not commit real secrets.
