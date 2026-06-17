# TrueNAS Catalog App Readiness

## Status

This document defines the Day 1 target for a polished Settleora TrueNAS app/catalog-style package. It is a readiness plan and acceptance checklist, not evidence that the package exists.

Current repo evidence supports a Docker/Compose LAN testing foundation through `infra/docker-compose.yml` and `services/api/Dockerfile`. TrueNAS catalog metadata, app form schema, upgrade automation, screenshots, and maintainer-run install evidence remain pending.

## Day 1 Definition Of Polished TrueNAS App

A polished TrueNAS app for Settleora means the maintainer can install, configure, back up, update, and test the server on TrueNAS without hand-assembling a pile of commands. For Day 1, the package should be LAN/self-hosting first and should not require public internet exposure.

Required app qualities:

- Clear app name, icon, description, license note, source URL, support/no-warranty note, and version mapping to a Settleora release or commit.
- Configurable API LAN port with collision guidance.
- Private-by-default PostgreSQL, RabbitMQ, and storage wiring.
- Persistent datasets/volumes for database, queue state, and API local file storage.
- Generated or user-provided secrets for PostgreSQL and RabbitMQ.
- Environment form defaults that are safe for LAN testing and visibly unsafe if copied from development examples.
- Explicit API health and readiness checks.
- First-owner bootstrap guidance.
- Migration, upgrade, rollback, backup, and restore procedures.
- No public database, queue, RabbitMQ management, or storage exposure.
- Admin surface protection guidance before any web/admin portal or admin API is exposed beyond a trusted LAN.
- LAN, VPN, and future Cloudflare Access guidance that preserves manual security gates.
- Manual acceptance evidence package with install screenshots, health results, mobile server-mode test notes, backup/restore notes, and known limitations.

## Target Service Model

| Component | Day 1 catalog expectation | Current repo state |
| --- | --- | --- |
| API | Required app workload, built from `services/api/Dockerfile` or a versioned image. | Dockerfile exists; compose builds locally. |
| PostgreSQL | Required private dependency with persistent dataset. | Compose uses `postgres:16-alpine` and a named volume. |
| RabbitMQ | Required private dependency while API readiness checks queue connectivity and future workers use jobs. | Compose uses `rabbitmq:3.13-management-alpine` and a named volume; management port is published in development compose. |
| Local file storage | Required persistent dataset mounted into the API container. | API supports local storage config; base compose does not yet mount a storage volume. |
| OCR worker | Future optional/required depending on OCR runtime slice. | Placeholder only. |
| Web user portal | Future app workload if implemented. | Placeholder only. |
| Web admin portal | Future app workload if implemented and protected. | Placeholder only. |
| Reverse proxy/TLS | Future packaging option after security/deployment review. | Not present. |

## App Configuration Form

A future TrueNAS app form should include:

- API host port, defaulting to `8080` or a maintainer-selected LAN port.
- API environment, with a Day 1 default chosen by release policy.
- PostgreSQL database name, user, generated password, and data dataset.
- RabbitMQ user, generated password, vhost if supported, and data dataset.
- API storage dataset and in-container mount path.
- Optional external URL/base URL only after server-mode/mobile clients require it and security gates approve the semantics.
- Session lifetime settings only if exposed with safe documented bounds from `services/api/README.md`.
- Explicit checkboxes or warnings confirming this app is LAN-only unless public exposure gates pass.

Do not expose form fields that imply unsupported runtime behavior, such as OIDC provider setup, passkeys, MFA, push/email notification delivery, web/admin portal URLs, OCR worker enablement, S3/MinIO storage, or public registration, until those slices exist in the repo.

## Secrets

The catalog app should generate strong default secrets for:

- `POSTGRES_PASSWORD`
- `RABBITMQ_DEFAULT_PASS`

Secrets must not be committed to the repo, shown in screenshots, printed in reports, or embedded in generated docs. The development values in `infra/env/.env.example` are examples only and are not acceptable for a persistent maintainer LAN deployment.

## Network And Exposure Policy

Default network posture:

- Publish only the API port needed for trusted LAN/iPhone testing.
- Keep PostgreSQL private to the app network.
- Keep RabbitMQ AMQP private to the app network.
- Keep RabbitMQ management UI disabled or private by default.
- Never publish the API storage dataset as a direct web/file endpoint.

Allowed Day 1 access patterns:

- Trusted LAN.
- Trusted VPN after maintainer review.

Future/manual-gated access patterns:

- Reverse proxy with TLS.
- Cloudflare Access or similar identity-aware tunnel.
- Any public DNS or internet-routable endpoint.
- Any admin web surface exposure.

Public exposure remains blocked until auth/session/security, storage/privacy, admin exposure, deployment, and release gates are manually reviewed and passed.

## Upgrade And Migration Strategy

A catalog app follow-up must define:

- Whether app startup applies migrations automatically or requires an explicit maintainer action.
- Backup-before-upgrade requirements for PostgreSQL and file storage.
- How failed migrations are reported.
- How the app behaves if API image and database schema versions do not match.
- How to roll back the app image safely when migrations have already changed schema.
- Whether RabbitMQ state can be discarded during upgrades or must be preserved.

Current blocker: the API does not auto-apply EF Core migrations on startup, and this branch does not add migration behavior.

## Backup And Restore

Day 1 backup/restore notes must cover the consistency set:

- PostgreSQL database.
- API local file storage dataset.
- RabbitMQ data if queued work must survive restart/restore.
- App configuration and generated secrets.

Restore evidence should prove:

- The API starts after restore.
- `/health/ready` passes.
- Existing auth/session behavior is understood after restore.
- Existing file metadata still maps to stored bytes.
- A mobile server-mode client can sign in and access expected records.

Do not claim backup/restore readiness until a maintainer-run restore test is recorded.

## Health Checks

Catalog health checks should use:

- `GET /health` for API liveness.
- `GET /health/ready` for PostgreSQL, RabbitMQ, and local storage readiness.

Health checks must not leak connection strings, storage paths, passwords, queue names, object keys, provider internals, or raw exception details.

## Manual Acceptance Evidence

Attach or record:

- TrueNAS version, expected target `25.10.1`.
- App version or commit SHA.
- App form screenshots with secrets redacted.
- Dataset/volume mapping summary.
- Started workload/container screenshots or logs.
- `GET /health` result.
- `GET /health/ready` result.
- Bootstrap status result.
- Owner bootstrap/sign-in result if performed.
- iPhone TestFlight server-mode URL used.
- Mobile smoke test checklist results.
- Backup/restore test notes or explicit pending status.
- Known limitations and blocked gates.

## Implementation Slices

Recommended follow-up slices:

1. Compose hardening for LAN packaging: add a storage volume mount, private-by-default dependency ports, healthcheck blocks where supported, and a LAN override pattern without changing production/security posture silently.
2. Migration/install runbook: define explicit schema application, backup prerequisite, failure recovery, and validation steps.
3. TrueNAS app metadata draft: app name, description, icon/screenshot placeholders, source/license/no-warranty text, version mapping, and release note structure.
4. TrueNAS form schema draft: ports, datasets, generated secrets, environment defaults, storage path, and LAN-only warnings.
5. Backup/restore runbook and manual test package: PostgreSQL plus file storage consistency evidence.
6. Security exposure review: LAN/VPN/reverse-proxy/Cloudflare Access guidance, admin surface protection, and public exposure stop conditions.
7. Maintainer TrueNAS install evidence: run the app on TrueNAS `25.10.1`, capture health/readiness/mobile smoke evidence, and update the Day 1 acceptance package.
8. Future service expansion: add OCR worker, web user portal, and web admin portal only after their runtime implementations exist and pass their own gates.

## Current Day 1 Gaps

- Actual TrueNAS install evidence is pending.
- Polished catalog app package is pending.
- Dedicated storage volume mapping is pending.
- Migration and rollback strategy is pending.
- Backup/restore evidence is pending.
- Public exposure and admin exposure are blocked by manual gates.
- Web/admin/OCR worker runtime packaging is pending because those services are placeholders.
