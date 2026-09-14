# TrueNAS Catalog App Readiness

## Status

This document defines the Day 1 target and remaining acceptance work for a polished Settleora TrueNAS app/catalog-style package. R04/#1232 and [PR #1233](https://github.com/tommytang213/Settleora/pull/1233) now provide a repository-only, unpublished TrueNAS 25.10.x Docker Apps skeleton with metadata, questions, deterministic materialization, and pinned official rendering. That is package-source evidence, not catalog publication, live install, backup/restore, or production readiness. The focused packaging requirements remain in [TrueNAS catalog app packaging plan](TRUENAS_CATALOG_APP_PACKAGING_PLAN.md). Install/upgrade orchestration, unsafe-migration blocking, failed-start recovery, rollback limits, health checks, image update flow, and operator evidence are planned in [Self-hosted install/upgrade orchestration](SELF_HOSTED_INSTALL_UPGRADE_ORCHESTRATION.md). Exposure-mode guardrails for LAN, trusted VPN/private access, Cloudflare Access-style protection, reverse proxy/TLS, admin surfaces, and future public access are defined in [Self-hosting exposure guardrails](SELF_HOSTING_EXPOSURE_GUARDRAILS.md).

Current repo evidence includes the existing Docker/Compose LAN testing foundation and `infra/truenas-catalog/settleora/`. The unpublished skeleton consumes a semantically validated R03 identity plus detached expected digest, selects immutable Linux/amd64 API/PostgreSQL/RabbitMQ/Caddy identities, renders only ingress/migrate/API/PostgreSQL/RabbitMQ, publishes only exact-RFC1918 HTTPS, and retains R11/R12 persistence and private-transport rules. Backup/restore execution, catalog publication, screenshots, and maintainer-run TrueNAS install/upgrade evidence remain pending under R05/#975 and manual gates.

## Day 1 Definition Of Polished TrueNAS App

A polished TrueNAS app for Settleora means the maintainer can install, configure, back up, update, and test the server on TrueNAS without hand-assembling a pile of commands. For Day 1, the package should be LAN/self-hosting first and should not require public internet exposure.

Required app qualities:

- Clear app name, icon, description, license note, source URL, support/no-warranty note, and version mapping to a Settleora release or commit.
- Configurable private HTTPS ingress port with collision guidance; direct API
  HTTP remains un-published.
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
| API | Required app workload, built from `services/api/Dockerfile` or a versioned image. | The unpublished skeleton uses the R03-selected immutable Linux/amd64 API identity and keeps API HTTP private. |
| Migration runner | Required install/upgrade schema gate before API startup. | The skeleton runs the same immutable API image as a private one-shot `migrate` service and gates API startup on success. |
| PostgreSQL | Required private dependency with persistent dataset. | The skeleton uses the R03-selected immutable Linux/amd64 identity and an immutable operator-selected private dataset. |
| RabbitMQ | Required private dependency while API readiness checks queue connectivity and future workers use jobs. | The skeleton uses the R03-selected immutable identity, private dataset, stable node name, and R11 fail-closed persistence guard; no AMQP or management port is published. |
| Local file storage | Required persistent dataset mounted into the API container. | The skeleton requires an immutable private dataset and validates UID/GID `999:999`, canonical path, no-follow, and data-protection-key access before API launch. |
| OCR worker | Future optional/required depending on OCR runtime slice. | Placeholder only. |
| Web user portal | Future app workload if implemented. | Placeholder only. |
| Web admin portal | Future app workload if implemented and protected. | Placeholder only. |
| Private ingress/TLS | Required exact-interface HTTPS workload using operator-external trusted TLS. | Implemented in LAN Compose and the unpublished catalog skeleton with Caddy; real DNS/certificate/client and TrueNAS proof remains pending. |

## App Configuration Form

The unpublished TrueNAS form includes the bounded R04 subset:

- Exact RFC1918 ingress bind, private TLS hostname, HTTPS port, and one
  TrueNAS-managed certificate reference; the template derives the chain and
  private-key paths from the selected certificate, and direct API HTTP remains
  un-published.
- Fixed private deployment mode and release-controlled API environment.
- PostgreSQL database name, user, externally supplied private password, and immutable data dataset.
- RabbitMQ user, externally supplied private password, stable immutable node hostname, and immutable data dataset.
- Immutable API storage dataset and fixed in-container mount path.
- Migration mode, defaulting to managed safe auto-apply for easy LAN install, with manual/check-only and explicit apply modes for professional hosters.
- Optional external URL/base URL only after server-mode/mobile clients require it and security gates approve the semantics.
- Session lifetime settings only if exposed with safe documented bounds from `services/api/README.md`.
- Explicit checkboxes or warnings confirming this app is LAN-only unless public exposure gates pass.

Do not expose form fields that imply unsupported runtime behavior, such as OIDC provider setup, passkeys, MFA, push/email notification delivery, web/admin portal URLs, OCR worker enablement, S3/MinIO storage, or public registration, until those slices exist in the repo.

## Secrets

The unpublished skeleton requires externally managed PostgreSQL and RabbitMQ
secrets through private form fields; repository fixtures, renderer outputs, and
reports do not contain or retain real values. A live TrueNAS install necessarily
retains the operator-supplied values in its protected app configuration so it
can render later starts and upgrades, and that private configuration belongs in
the operator's secure backup set. Secrets must not be committed to the repo,
shown in screenshots, printed in reports, or embedded in generated docs. The
redacted fixtures and development values in `infra/env/.env.example` are
examples only and are not acceptable for a persistent maintainer LAN
deployment. Live secret provisioning and protected retention remain R05/manual
operator actions.

## Network And Exposure Policy

Default network posture:

- Publish only exact-host HTTPS on the selected private interface; keep API HTTP
  un-published and isolate ingress from backend dependencies.
- Keep PostgreSQL private to the app network.
- Keep RabbitMQ AMQP private to the app network.
- Keep RabbitMQ management UI disabled or private by default.
- Never publish the API storage dataset as a direct web/file endpoint.

Allowed Day 1 access patterns:

- Trusted LAN.
- Trusted VPN after maintainer review.

Future/manual-gated access patterns:

- Any second proxy tier, automated certificate/DNS path, or change beyond the
  implemented private Caddy ingress.
- Cloudflare Access or similar identity-aware tunnel.
- Any public DNS or internet-routable endpoint.
- Any admin web surface exposure.

Public exposure remains blocked until auth/session/security, storage/privacy, admin exposure, deployment, and release gates are manually reviewed and passed. Admin exposure and user web/API exposure remain separate decisions under [Self-hosting exposure guardrails](SELF_HOSTING_EXPOSURE_GUARDRAILS.md).

## Upgrade And Migration Strategy

The API process supports a non-HTTP migration command:

```text
migrate-database --mode=managed-auto
```

Catalog/default LAN install should run this command as a separate private migration job/service before starting the API. Production API startup itself must not silently apply migrations.

Supported modes:

- `managed-auto`: default easy-install mode; applies pending migrations only when the migration safety policy classifies them as safe.
- `apply-safe`: explicit safe apply mode for operators who want to run the migration job directly.
- `manual` / `check-only`: professional hoster modes; report pending migrations and exit non-zero without applying.
- `validate-only`: checks PostgreSQL connectivity and migration metadata.
- `force-allow-destructive`: API-level dangerous override only; the R04 catalog form intentionally does not expose it.

The current safety policy blocks known destructive operations such as dropping tables/columns, EF operations marked destructive, and raw SQL containing destructive/unclassified tokens. This is a conservative package guard, not a substitute for migration review, backup policy, or rollback planning.

Live acceptance and later operational work still must prove or define:

- Enforcement and evidence for backup-before-upgrade requirements for PostgreSQL and file storage beyond the package acknowledgement.
- How failed or blocked migrations are surfaced in TrueNAS app UI/logs.
- How the app behaves if API image and database schema versions do not match.
- How to roll back the app image safely when migrations have already changed schema.
- The operator decision and evidence for whether RabbitMQ state can be discarded during an upgrade or must be preserved.

## Backup And Restore

Day 1 backup/restore planning is defined in [TrueNAS backup/restore consistency runbook](TRUENAS_BACKUP_RESTORE_RUNBOOK.md). The runbook covers the deployment consistency set:

- PostgreSQL database.
- API local file storage dataset.
- RabbitMQ data if queued work must survive restart/restore.
- App configuration and generated secrets.
- The external TLS certificate chain/private key or a secure re-provisioning
  record; private keys remain outside the app repository and ordinary reports.

Restore evidence should prove:

- The API starts after restore.
- The private hostname still resolves to the selected RFC1918 interface, its
  certificate chain remains platform-trusted with the hostname in the SAN, and
  HTTPS `/health/ready` passes through the ingress.
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

- TrueNAS version, current live-acceptance target `25.10.1`.
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

Repository slices 1–3 are complete in the unpublished R04 skeleton: first-class migration gating, metadata/release mapping, and the bounded private form schema. Remaining slices are:

1. Backup/restore runbook execution and manual evidence: PostgreSQL plus file storage consistency, key material, RabbitMQ state where required, and app configuration.
2. Maintainer TrueNAS install/upgrade evidence on `25.10.1`: capture failure presentation, health/readiness, rollback limits, private DNS/TLS, and physical-client smoke evidence under R05/#975.
3. Catalog publication only after its separate manual gates and all required acceptance evidence pass.
4. Future service expansion: add OCR worker, web user portal, and web admin portal only after their runtime implementations exist and pass their own gates.

## Current Day 1 Gaps

- Actual TrueNAS install evidence is pending.
- The repository-only unpublished skeleton exists and passes deterministic direct and pinned official TrueNAS rendering; catalog publication and a polished operator listing remain pending manual-gated work.
- First-class migration command and catalog/Compose service wiring exist; live backup-before-migrate evidence, rollback rehearsal, and maintainer-visible TrueNAS failure UI remain pending.
- Backup/restore evidence is pending.
- Public exposure and admin exposure are blocked by manual gates.
- Web/admin/OCR worker runtime packaging is pending because those services are placeholders.
