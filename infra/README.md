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

Do not commit real secrets.
