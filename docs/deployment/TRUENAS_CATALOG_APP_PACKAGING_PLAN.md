# TrueNAS Catalog App Packaging Plan

## Status

This document is the packaging plan for a future polished Settleora TrueNAS
catalog app. It is planning and runbook guidance only. It does not implement a
catalog app, publish catalog metadata, publish container images, change Docker
or Compose behavior, change environment defaults, deploy to production, approve
public exposure, or expose admin surfaces.

Current runnable TrueNAS-oriented evidence remains the LAN Docker path in
[TrueNAS LAN Docker testing](TRUENAS_LAN_DOCKER_TESTING.md). Catalog readiness
acceptance criteria remain in
[TrueNAS catalog app readiness](TRUENAS_CATALOG_APP_READINESS.md). Backup,
restore, rollback, and redaction evidence are covered by
[TrueNAS backup/restore consistency runbook](TRUENAS_BACKUP_RESTORE_RUNBOOK.md).
Exposure decisions are governed by
[Self-hosting exposure guardrails](SELF_HOSTING_EXPOSURE_GUARDRAILS.md).

## Purpose And Boundaries

The future catalog app should let a maintainer install, configure, update, back
up, restore, and validate Settleora on TrueNAS without hand-assembling service
wiring. The first catalog target is LAN/self-hosting first, not public internet
hosting.

This plan covers:

- Catalog metadata and release mapping.
- User-facing configuration fields and warnings.
- Dataset and volume mapping expectations.
- Private service topology and start ordering.
- Health, readiness, and safe smoke validation.
- Image tag, upgrade, migration, and rollback planning.
- Operator warnings, stop conditions, and future manual gates.

This plan does not approve:

- TrueNAS catalog implementation or publishing.
- Container image publishing.
- Production deployment.
- Reverse proxy, TLS, public DNS, or public tunnel setup.
- Public user web/API exposure.
- Admin web/API exposure beyond a trusted boundary.
- Runtime, API, schema, OpenAPI, generated-client, security, storage, OCR,
  money, settlement, payment, bill-calculation, Docker, Compose, CI, or
  environment behavior changes.

## Safe Default Exposure Model

Default catalog posture must be private by design:

| Surface | Default posture | Notes |
| --- | --- | --- |
| PostgreSQL | Private app-network dependency. | Do not publish port `5432`; never expose to the internet. |
| RabbitMQ AMQP | Private app-network dependency. | Do not publish port `5672`; future workers should use the private app network. |
| RabbitMQ management UI | Disabled or private by default. | Do not publish port `15672` for normal catalog installs. |
| API local storage | Private mounted dataset. | Do not serve the dataset through SMB, NFS, HTTP, or a direct file endpoint for app access. |
| Migration job | Private install/upgrade job or service. | Publishes no host ports and runs before API startup. |
| API | Trusted LAN/VPN only by default. | Publish only the configured API port needed for trusted clients. |
| User web/API | Not public by default. | Future public access requires auth/session/authz/file privacy, proxy/TLS, logging, rollback, and manual release gates. |
| Admin web/API | Not public by default. | Future admin access should default to LAN, VPN, Cloudflare Access-style protection, or equivalent reviewed access control. |
| Workers | Private app-network workloads. | Current OCR worker runtime is placeholder only and must not be exposed. |

Approving a LAN API port does not approve public user access, admin exposure,
database access, queue access, storage access, reverse proxy behavior, TLS, or
catalog publishing.

## Catalog Metadata Plan

A future catalog implementation should define the following metadata before any
publication:

| Field | Planned value or rule |
| --- | --- |
| App name | `Settleora`. |
| Display title | `Settleora`. |
| Short description | Self-hosted expense, shared bill, settlement, receipt, OCR, recurring bill, forecasting, and reconciliation platform. |
| Categories | Finance, productivity, self-hosted, collaboration, document/receipt management. |
| Maintainer | Repository maintainer or approved publishing identity. |
| Source URL | `https://github.com/tommytang213/Settleora`. |
| Support URL | GitHub issues or a future support page, with no support warranty implied. |
| Documentation links | README, LAN Docker testing, catalog readiness, this plan, backup/restore runbook, and exposure guardrails. |
| License | PolyForm Noncommercial License 1.0.0, with a clear noncommercial/commercial-permission note. |
| No-warranty notice | Must match README posture: use at own risk, no correctness/data-safety/security/production-readiness warranty. |
| Icon/screenshots | Future static assets only after review; screenshots must redact secrets, users, bills, files, hosts, and dataset paths. |
| Source revision | Catalog release notes must map to a Settleora release tag, commit SHA, or immutable image digest. |

Metadata must not include secrets, private dataset paths, private hostnames,
operator screenshots with sensitive values, raw env files, object keys, tokens,
or user data.

## Image Sources And Tags

The current repo has Dockerfile and compose evidence, but no catalog-published
image guarantee. A future catalog package should use a reviewed registry policy:

- Primary image source should be GitHub Container Registry unless release
  policy approves another registry.
- Catalog releases should avoid floating-only references such as `latest`.
- Prefer semantic version tags plus immutable digests where practical.
- Record the exact API image tag and digest in operator backup evidence.
- Keep branch-preview or commit tags out of user-facing stable catalog releases
  unless clearly labeled as testing builds.
- Catalog app version, image tag, app release notes, and database migration set
  must be traceable to the same Settleora source revision.

`latest` may exist as a convenience publishing tag in the broader release
strategy, but catalog installs should not rely on it as the only version
selector.

## User-Facing Configuration Fields

The future catalog form should expose only supported behavior. Suggested fields:

| Field | Type | Default/posture | Notes |
| --- | --- | --- | --- |
| Deployment mode | Select | `LAN-only` | Future values such as trusted VPN or protected proxy require manual-gated docs and implementation. |
| LAN API host port | Integer | `8080` or maintainer-selected | Include collision guidance; publish only the API port. |
| API bind address | Text/select | Host/LAN interface | Encourage narrow binding where TrueNAS supports it. |
| External base URL | Text | Empty | Only enable once server-mode client semantics and exposure gates approve host/origin behavior. |
| Allowed hostnames/origins | Text/list | Empty or LAN-only | Future public/proxy/TLS work must define exact host/origin policy; no wildcard defaults. |
| Environment/profile | Select | Release-policy value | Do not expose development-only defaults as production guidance. |
| PostgreSQL dataset | Dataset path picker | Operator-selected | Persistent, private, writable by the app runtime. |
| PostgreSQL database/user | Text/generated | App-specific values | Avoid default/demo names where practical for persistent installs. |
| PostgreSQL password | Generated secret or secret input | Generated | Must not be displayed in logs, screenshots, reports, or docs. |
| RabbitMQ dataset | Dataset path picker | Operator-selected | Persistent and private if queued work/state should survive upgrades. |
| RabbitMQ user/password | Generated secret or secret input | Generated | Management UI remains private/disabled by default. |
| API storage dataset | Dataset path picker | Operator-selected | Stores sensitive receipt, proof, QR, and attachment bytes. |
| API storage mount path | Advanced text | `/var/lib/settleora/storage` | Keep stable across upgrades unless a reviewed migration plan exists. |
| Migration mode | Select | `managed-auto` | Include `manual`, `check-only`, `validate-only`, `apply-safe`; hide or heavily warn on `force-allow-destructive`. |
| Backup-before-upgrade acknowledgement | Checkbox | Required for upgrade | Must not claim a backup was performed unless operator evidence exists. |
| LAN-only warning acknowledgement | Checkbox | Required | Confirms no public exposure is approved by the catalog install. |
| Admin exposure protection | Future manual-gated select | Not exposed now | Later choices may include LAN, VPN, Cloudflare Access-style gate, or equivalent protection after implementation review. |

Do not expose fields for unsupported runtime slices such as OIDC provider setup,
passkeys, MFA policy, push/email provider delivery, web/admin portal URLs, OCR
worker enablement, MinIO/S3 storage, public registration, reverse proxy, TLS, or
public exposure until those features exist and pass their own manual gates.

## Dataset And Volume Mappings

Suggested TrueNAS dataset layout should keep app state separated by role while
allowing coordinated snapshots:

```text
/mnt/<pool>/apps/settleora/
  postgres/
  rabbitmq/
  storage/
  backups/
```

Use role names in public docs and reports; redact real pool names, private
paths, usernames, and host details unless the maintainer explicitly approves
disclosure.

| Dataset or volume | Container target | Required | Backup role |
| --- | --- | --- | --- |
| PostgreSQL data | `/var/lib/postgresql/data` | Yes | Primary database, auth/session rows, file metadata, audit metadata, EF migration metadata, business records. |
| RabbitMQ data | `/var/lib/rabbitmq` | Yes for preserving queue/broker state | Queue definitions and future in-flight/queued work. If omitted from a restore, document expected lost or retried work. |
| API local file storage | `SETTLEORA_STORAGE_ROOT`, default `/var/lib/settleora/storage` | Yes | Sensitive file bytes coupled to PostgreSQL file metadata. |
| Backup/export location | Operator-selected private dataset | Future/manual-gated | Stores encrypted/private operator backups or exports if later implemented. |
| App config/secrets | TrueNAS app secret/config store | Yes | Must be backed up securely and never committed or pasted into reports. |

PostgreSQL metadata and API local file bytes are a consistency pair. A future
catalog implementation must warn that restoring only one side can create missing
bytes, orphaned bytes, or broken attachment/proof/QR access.

Environment and secret storage caveats:

- Do not store real secrets in repository docs or example files.
- Do not show generated secrets in issue comments, screenshots, reports, or
  health output.
- Do not expose raw env files through admin UI, support bundles, or logs.
- Do not place sensitive app files in a public SMB/NFS/HTTP share for app
  access.

## Service Topology And Start Ordering

Current supported catalog-relevant service model:

| Service | Required now | Start/order rule |
| --- | --- | --- |
| `postgres` | Yes | Starts before migration job; readiness must pass before schema checks/apply. |
| `rabbitmq` | Yes | Starts before API readiness; API readiness checks queue connectivity. |
| `migrate` | Yes | First-class private job/service using the API image. Runs before API startup on install/upgrade. |
| `api` | Yes | Starts only after dependencies and migration job success according to platform capabilities. |
| `worker-ocr` | Placeholder only | Do not package as runtime workload until implemented and reviewed. |
| `web-user` | Placeholder only | Future workload after web user runtime exists and exposure gates are reviewed. |
| `web-admin` | Placeholder only | Future workload after admin runtime exists and protected exposure is reviewed. |

The migration job must remain first-class. Do not remove it, hide it inside API
startup, or publish PostgreSQL just to manage schema. If the TrueNAS app engine
does not support Docker Compose `service_completed_successfully`, the catalog
implementation must use the platform's equivalent install/upgrade job or
start-order gate and document its failure behavior.

## Health, Readiness, And Validation Evidence

Catalog validation should use the current API endpoints:

```text
GET /health
GET /health/ready
```

Expected behavior:

- `/health` returns HTTP `200` when the API process is live.
- `/health/ready` returns HTTP `200` only when PostgreSQL, RabbitMQ, and local
  storage readiness pass.
- Health/readiness output must not expose connection strings, passwords,
  storage roots, private dataset paths, queue internals, object keys, raw
  exceptions, tokens, or user data.

Safe catalog implementation evidence should include:

- TrueNAS version, with current target `25.10.1` where applicable.
- Catalog app version and Settleora image tag/digest or commit SHA.
- Redacted app form screenshots.
- Redacted dataset role mapping.
- Migration job mode and sanitized outcome.
- Rendered app/compose configuration check where the platform supports it.
- `GET /health` result.
- `GET /health/ready` result.
- Bootstrap status result where safe.
- Safe mobile/server-mode smoke result from a trusted LAN client where in scope.
- Backup/restore evidence status, or an explicit statement that restore
  evidence remains pending.

Do not include owner passwords, session tokens, raw env values, raw logs with
secrets, private dataset paths, receipt/proof/QR bytes, payment details, bill
names, group names, or financial values in shared evidence.

## Upgrade, Migration, And Rollback Strategy

Upgrade planning must be conservative because schema migrations and file bytes
can make rollback partial or impossible.

Required upgrade posture:

- Record current app version, API image tag/digest, migration mode, and dataset
  mapping before upgrade.
- Take or confirm a backup of PostgreSQL, API local file storage, RabbitMQ state
  where needed, and app config/secrets before upgrade.
- Run the migration job before API startup.
- Default easy-install mode may be `managed-auto`, but it must apply only
  migrations classified as safe by the migration safety policy.
- Operators who need stricter control should use `manual`, `check-only`,
  `validate-only`, or explicit `apply-safe`.
- `force-allow-destructive` is a dangerous manual-gated override only after
  backup, review, and operator approval.
- Failed, blocked, pending, or destructive migration results must be surfaced to
  the operator without starting a mismatched API against unknown schema state.

Rollback limits:

- Rolling back an image after a schema migration may not restore compatibility.
- Rolling back requires the matching database/file-storage backup when the
  migration changed schema or file interpretation.
- Restoring PostgreSQL without matching storage can break file references.
- Restoring storage without matching PostgreSQL can orphan file bytes.
- RabbitMQ state may be safe to discard only when the operator accepts lost,
  retried, or duplicated queued work risks for the specific release.
- Catalog docs must not promise automatic rollback until a tested rollback path
  exists.

## Operator Warnings And Stop Conditions

Future catalog work must stop and escalate if any of these would occur without
an explicit manual gate:

- Public internet exposure.
- Admin web/API exposure beyond trusted LAN/private access.
- Reverse proxy, TLS, DNS, tunnel, CORS, allowed-host, trusted-proxy, cookie, or
  session behavior changes.
- Publishing PostgreSQL, RabbitMQ, RabbitMQ management UI, migration jobs,
  worker internals, storage datasets, backup/restore internals, or maintenance
  shells.
- Docker, Compose, TrueNAS app, env, CI, deployment, release, or image
  publishing behavior changes outside the approved task.
- Secrets, tokens, credentials, SSH material, certificate material, raw env
  values, private dataset paths, or user data appearing in docs, logs, reports,
  screenshots, or issue comments.
- Schema migrations, destructive data operations, or `force-allow-destructive`
  migration use.
- Runtime auth/session/security, storage/privacy/file-byte, OpenAPI/generated
  client, API behavior, OCR, money, settlement, payment, or bill-calculation
  authority changes.
- Catalog publishing or production deployment.

No catalog package should be published until implementation, validation,
security/exposure review, release/image policy, backup/restore evidence, and
manual gates are complete.

## Separation Of Current And Future Work

| Track | Current status | Must remain separate from |
| --- | --- | --- |
| LAN Docker testing | Existing docs and compose templates support trusted LAN testing. | Catalog implementation, catalog publishing, production deployment, public/admin exposure. |
| Catalog readiness | Existing checklist describes polished app qualities and gaps. | Claiming the app exists or is published. |
| Catalog packaging plan | This document defines metadata, form, dataset, topology, validation, upgrade, and warnings. | Catalog YAML/app implementation or image publishing. |
| Catalog implementation | Future manual-gated task. | Public exposure, production deployment, and catalog publishing unless explicitly scoped. |
| Catalog publishing | Future release/manual-gated task. | Implementation branches that only draft package files. |
| Production deployment | Future manual-gated task. | LAN testing and catalog packaging. |
| Public exposure / proxy / TLS | Future manual-gated task. | Safe LAN default and admin exposure protection planning. |

Closing a planning issue may mean this document is accepted as a plan. It must
not be treated as completing the future catalog package, publishing path,
production deployment, or exposure gates.

## Next Implementation Candidates

Future issues should be split narrowly:

1. Draft TrueNAS app metadata and form schema without publishing.
2. Implement catalog install/upgrade migration job wiring and failure surfacing.
3. Add catalog dataset/secret mapping with generated-secret handling.
4. Add catalog render/install validation evidence on an approved TrueNAS target.
5. Add backup-before-upgrade and rollback evidence after a restore test exists.
6. Add OCR worker, user web, or admin web workloads only after those runtimes
   exist and pass their own manual gates.
7. Publish catalog app only through an explicit release/catalog gate.
